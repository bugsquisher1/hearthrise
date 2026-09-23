-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-23-m8-parties-s1-2-verbs.sql — M8 SLICE 1, FILE 2 OF 3:
--   THE FIVE MEMBERSHIP VERBS. THE ONLY DOOR TO THE THREE TABLES.
--
--   hr_party_create(int, uuid)             form a party of one, as its leader
--   hr_party_invite(int, text, uuid)       invite by DISPLAY NAME (S-13)
--   hr_party_accept(int, uuid, uuid)       accept an invite (S-11, S-12)
--   hr_party_leave(int, uuid)              leave; transfer or dissolve
--   hr_party_kick(int, text, uuid)         leader removes a member by name
--
-- 2026-08-08-clan-seat.sql's pattern, which CLAUDE.md §1 names for exactly this
-- shape: SECURITY DEFINER, every value derived from auth.uid(), now() and a
-- server catalogue, per-call and per-day clamps, an append-only journal row per
-- accepted verb. **NO CLIENT VALUE CROSSES TO ANOTHER PLAYER.** The whole
-- caller-supplied surface of this file is: one of the caller's OWN slots, a
-- display name, an invite id addressed to the caller, and an idempotency key.
-- There is no party id a caller may name (it is always derived from their own
-- membership), no user id, no role, no timestamp, no count, no size.
--
-- NOT A MONEY SURFACE (§18-SEC.0). No gold, no gems, no items, no XP, no
-- ranking, no drop table, no price. Nothing here calls hr_apply, and §6(y)
-- proves that by reading every one of the five bodies.
--
-- ── THE REFUSAL CODES, AND WHY THEY ARE STRINGS ────────────────────────────
-- §18.3's taxonomy. A refusal is a code the client MAPS to a sentence; the
-- server never sends prose. Every refusal is journalled through
-- hr_record_rejection WITH ITS VERB, so `vitals.mjs --refusals` can answer
-- "nobody can start a party" on the day it breaks rather than two days later
-- (CLAUDE.md §3.4). Codes used here:
--
--   not_signed_in · rate_limited · bad_slot · no_character · bad_party
--   already_in_party · not_in_party · not_party_leader · party_full
--   unknown_party · invite_expired · invite_gone · party_level_spread
--   party_hunt_running · party_daily_cap · intent_mismatch · intent_in_flight
--   invite_target_unavailable   (S-13, the ONLY thing a sender is ever told)
--   invite_inbox_full           (S-13, JOURNALLED ONLY — never returned)
--
-- ── S-13: THE INVITE ORACLE, CLOSED AT BOTH ENDS ───────────────────────────
-- §18.3 clamped the sender at 20/day with a per-call clamp of *"target must
-- exist, not be in a party, not be you"* — three DISTINGUISHABLE refusals, i.e.
-- an oracle answering *"is this player currently partied"* twenty times a day
-- per account.
--
-- Name resolution happens INSIDE hr_party_invite and the sender gets exactly
-- ONE refusal string — `invite_target_unavailable` — for every unavailable
-- reason there is: no such name, that is you, they are already in a party, they
-- have no character, their inbox is full. The REAL reason is journalled
-- server-side through hr_record_rejection where the sender cannot read it, so
-- an operator can still see which clamp is firing.
--
-- ⚠ HONEST SCOPE OF WHAT THAT BUYS. public.display_names has the policy
--   `for select using (true)` — *"Public by design: a name only works as an
--   address if it can be looked up"* (2026-08-08-unique-names.sql), and
--   hr_display_name_available is granted to anon. So "does this display name
--   exist" is ALREADY public and this file does not make it less so; claiming
--   otherwise would be a fence that is not one (S-16's lesson). What the single
--   refusal actually protects is the fact §18 made newly readable and S-13
--   named: **whether a given player is currently in a party** — which is not
--   public anywhere else and which a raid-timing or harassment case wants.
--
-- The receiver clamp §18 omitted: at most 5 LIVE invites and 20 RECEIVED per
-- character per UTC day. Its journalled code is `invite_inbox_full`; the sender
-- is told `invite_target_unavailable` like everyone else, because "with no
-- distinction visible to the sender" (S-13) is not satisfiable by a second
-- string. Twenty accounts can no longer hand one player four hundred cards.
--
-- ── S-11 AND S-12: THE TWO RULES ON ACCEPT ─────────────────────────────────
-- S-11  `party_accept` is refused with `party_hunt_running` while the party has
--       a live hunt. The predicate is hr_party_hunt_live (file 1), which is
--       FALSE in S1 and which S2 owns — so THIS REFUSAL PATH SHIPS TESTED
--       rather than being written later under time pressure.
-- S-12  the level spread is re-checked ON EVERY ACCEPT, not only at start.
--       §18.1's *"checked at hunt start only"* reasoning covers LEVELLING and
--       is right; it does not cover JOINING, and a party can otherwise start
--       inside the spread and then accept a level-1 alt into a level-30 hunt.
--       The spread is §18.1's: **at most 10 combat levels** between the lowest
--       and the highest live member. Under S-11 it costs nothing today; it is
--       written down because S-11 may be relaxed later and this must not relax
--       with it.
--
-- ── THE JOURNAL, AND WHY THERE IS NO `party_ledger` ────────────────────────
-- Every accepted verb writes one public.player_intents row (user, intent_id,
-- slot, intent, result) — the same append-only record every other intent in
-- this architecture writes, and the same row that makes the verb idempotent.
-- §18.2.1 refuses a second journal and this file has nothing to journal into
-- one: no value moves. Refusals go to hr_rejections via hr_record_rejection.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   drop function public.hr_party_kick(int,text,uuid),
--                 public.hr_party_leave(int,uuid),
--                 public.hr_party_accept(int,uuid,uuid),
--                 public.hr_party_invite(int,text,uuid),
--                 public.hr_party_create(int,uuid);
-- then re-apply the file that owns hr_rpc_gate to drop the `party` bucket.
-- Rows already written stay and are inert: a party with no verbs is a list
-- nobody can change and nothing reads but hr_party_view.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.party') is null
     or to_regclass('public.party_member') is null
     or to_regclass('public.party_invite') is null then
    raise exception 'PRECONDITION: the party tables are absent — apply 2026-09-23-m8-parties-s1-1-tables.sql FIRST. It is file 1 of 3 and this is file 2.';
  end if;
  if to_regprocedure('public.hr_party_of(uuid,integer)') is null
     or to_regprocedure('public.hr_party_role(uuid,uuid,integer)') is null
     or to_regprocedure('public.hr_party_hunt_live(uuid)') is null
     or to_regprocedure('public.hr_party_level(uuid,integer)') is null then
    raise exception 'PRECONDITION: a party predicate from file 1 is absent.';
  end if;
  if to_regclass('public.display_names') is null then
    raise exception 'PRECONDITION: public.display_names is absent — it is the name namespace hr_party_invite resolves against, and inventing a second one is how two answers to "who is Bram" start disagreeing.';
  end if;
  if to_regprocedure('public.hr_canon_display_name(text)') is null then
    raise exception 'PRECONDITION: hr_canon_display_name is absent.';
  end if;
  if to_regclass('public.player_intents') is null
     or to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null
     or to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'PRECONDITION: the journal foundation is absent — apply 2026-08-11-player-state.sql and the rejections verb map first.';
  end if;
  -- The bucket file 1 patched in. Without it every verb below answers
  -- rate_limited forever: an unknown bucket fails CLOSED by design.
  if position('''party''' in (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                               where n.nspname = 'public' and p.proname = 'hr_rpc_gate')) = 0 then
    raise exception 'PRECONDITION: hr_rpc_gate does not admit the `party` bucket — file 1 patches it in, and without it these verbs ship green and dead.';
  end if;
end $$;

-- ── 1. THE SHARED PRELUDE, STATED ONCE ─────────────────────────────────────
-- Every verb below opens the same way and it is deliberate repetition rather
-- than a helper: a prelude in a helper is a prelude one verb can be written
-- without. In order, and the ORDER is the point —
--
--   1. auth.uid()          not_signed_in
--   2. hr_rpc_gate('party') rate_limited   — BEFORE any table is touched, so a
--                                            malformed storm costs one counter
--                                            upsert and nothing else
--   3. the slot             bad_slot       — validated before any budget is
--                                            spent (hr_create_character's rule)
--   4. the character exists no_character
--   5. the idempotency key  bad_party      — a NULL key skips idempotency at
--                                            both ends, so it is refused BY
--                                            NAME rather than defaulted
--   6. the intent claim / replay
--   7. the business rules, then the write
--
-- A refusal before step 6 leaves no intent row, so the key is still usable.

-- ── 2. hr_party_create — FORM A PARTY OF ONE, AS ITS LEADER ────────────────
-- §18.1: *"she taps it, and is a party of one with herself as leader."*
-- 10 / character / UTC day (§18.3). The party is created with the caller as
-- its leader IN ONE TRANSACTION — the clan lesson of 2026-08-11-clan-membership
-- -authority.sql §8a: a two-step create leaves a party with no leader if the
-- second call is lost, which is a party nobody can ever administer.
create or replace function public.hr_party_create(p_slot int, p_idem uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $fn$
declare
  v_uid   uuid := auth.uid();
  v_slot  int  := coalesce(p_slot, -1);
  v_day   text := public.hr_utc_day_key(now());
  v_prev  jsonb;
  v_pi    text;
  v_n     bigint;
  v_id    uuid;
  v_out   jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('party') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if v_slot < 0 or v_slot > 5 then
    perform public.hr_record_rejection(v_uid, 0, 'party_create', 'bad_slot', jsonb_build_object('slot', p_slot));
    return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_create', 'no_character', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if p_idem is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_create', 'bad_party', jsonb_build_object('why', 'null idempotency key'));
    return jsonb_build_object('ok', false, 'error', 'bad_party'); end if;

  -- IDEMPOTENCY. A replay returns the stored answer; a key already spent on a
  -- DIFFERENT verb is intent_mismatch, never a silent second party.
  select result, intent into v_out, v_pi
    from public.player_intents where user_id = v_uid and intent_id = p_idem;
  if found then
    if v_pi is distinct from 'party_create' then
      perform public.hr_record_rejection(v_uid, v_slot, 'party_create', 'intent_mismatch',
        jsonb_build_object('stored', v_pi, 'sent', 'party_create'));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch'); end if;
    if v_out is null then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
    return v_out || jsonb_build_object('replayed', true);
  end if;

  -- ONE PARTY PER CHARACTER, read before the claim so a refusal costs no key.
  if public.hr_party_of(v_uid, v_slot) is not null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_create', 'already_in_party', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'already_in_party'); end if;

  -- THE DAY CLAMP (§18.3: 10 / character / UTC day). Server clock, server key.
  select coalesce(value, 0) into v_n from public.player_progress
   where user_id = v_uid and slot = v_slot and kind = 'daily'
     and key = 'ev:party_creates' and period_key = v_day;
  if coalesce(v_n, 0) >= 10 then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_create', 'party_daily_cap',
      jsonb_build_object('made', v_n, 'cap', 10));
    return jsonb_build_object('ok', false, 'error', 'party_daily_cap'); end if;

  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_idem, v_slot, 'party_create')
  on conflict (user_id, intent_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;

  -- ⚠ BOTH INSERTS ARE INSIDE THE SUB-BLOCK, AND THAT IS THE POINT (Security
  --   B3, 2026-09-23). The sub-block's implicit savepoint rolls back only what
  --   it contains: with the `party` insert OUTSIDE it, the loser of an
  --   invariant-1 race kept its party row — leaderless, memberless, readable by
  --   nobody, because the SELECT policy needs a live member — while the handler
  --   released the idempotency key and never spent `ev:party_creates`. Two
  --   concurrent creates on one character therefore minted one permanent junk
  --   row for free, bounded by the 12/min bucket (~17k a day per account)
  --   rather than by the 10-a-day clamp the row was supposed to cost.
  begin
    insert into public.party (leader_user, leader_slot) values (v_uid, v_slot) returning id into v_id;
    insert into public.party_member (party_id, user_id, slot, role)
      values (v_id, v_uid, v_slot, 'leader');
  exception when unique_violation then
    -- INVARIANT 1 lost a race with a concurrent create on the same character.
    -- The index is the authority, not the read above; the key is released so
    -- an honest retry works, and the party row above is rolled back with it.
    delete from public.player_intents where user_id = v_uid and intent_id = p_idem;
    perform public.hr_record_rejection(v_uid, v_slot, 'party_create', 'already_in_party',
      jsonb_build_object('raced', true));
    return jsonb_build_object('ok', false, 'error', 'already_in_party');
  end;

  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'daily', 'ev:party_creates', 1, v_day, 'active', now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = pp.value + 1, updated_at = now();

  v_out := jsonb_build_object('ok', true, 'party_id', v_id, 'role', 'leader', 'members', 1);
  update public.player_intents set result = v_out
   where user_id = v_uid and intent_id = p_idem;
  return v_out;
end $fn$;

-- ── 3. hr_party_invite — RESOLVE THE NAME INSIDE, TELL THE SENDER ONE THING ─
-- S-13. Leader-only, which is NARROWER than §18.3 (which names no role) and
-- matches §18.1's narrative — Kaya invites, Bram accepts — and matches
-- hr_party_kick. Widening it later is one predicate; narrowing it after the
-- panel shipped would be a removed button.
create or replace function public.hr_party_invite(p_slot int, p_name text, p_idem uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $fn$
declare
  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, -1);
  v_day    text := public.hr_utc_day_key(now());
  v_party  uuid;
  v_prev   text;
  v_out    jsonb;
  v_n      bigint;
  v_canon  text;
  v_target uuid;
  v_tslot  int;
  v_why    text;
  v_id     uuid;
  -- The three post-resolution predicates, evaluated unconditionally so the
  -- clock cannot tell them apart (Security B5).
  v_partied boolean;
  v_live    bigint;
  v_today   bigint;
  -- THE ONE THING THE SENDER IS EVER TOLD. Declared once so no branch below
  -- can accidentally return a second, more informative string.
  c_one    constant text := 'invite_target_unavailable';
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('party') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if v_slot < 0 or v_slot > 5 then
    perform public.hr_record_rejection(v_uid, 0, 'party_invite', 'bad_slot', jsonb_build_object('slot', p_slot));
    return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_idem is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_invite', 'bad_party', jsonb_build_object('why', 'null idempotency key'));
    return jsonb_build_object('ok', false, 'error', 'bad_party'); end if;

  select result, intent into v_out, v_prev
    from public.player_intents where user_id = v_uid and intent_id = p_idem;
  if found then
    if v_prev is distinct from 'party_invite' then
      perform public.hr_record_rejection(v_uid, v_slot, 'party_invite', 'intent_mismatch',
        jsonb_build_object('stored', v_prev, 'sent', 'party_invite'));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch'); end if;
    if v_out is null then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
    return v_out || jsonb_build_object('replayed', true);
  end if;

  v_party := public.hr_party_of(v_uid, v_slot);
  if v_party is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_invite', 'not_in_party', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'not_in_party'); end if;
  if public.hr_party_role(v_party, v_uid, v_slot) is distinct from 'leader' then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_invite', 'not_party_leader', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'not_party_leader'); end if;

  -- THE SENDER'S DAY CLAMP (§18.3: 20 / character / day).
  select coalesce(value, 0) into v_n from public.player_progress
   where user_id = v_uid and slot = v_slot and kind = 'daily'
     and key = 'ev:party_invites' and period_key = v_day;
  if coalesce(v_n, 0) >= 20 then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_invite', 'party_daily_cap',
      jsonb_build_object('sent', v_n, 'cap', 20));
    return jsonb_build_object('ok', false, 'error', 'party_daily_cap'); end if;

  -- ══ S-13. FIVE CAUSES, ONE ANSWER ═════════════════════════════════════════
  -- Every branch below sets v_why (the REAL reason, journalled) and returns
  -- c_one (what the sender sees). Nothing in the returned object varies with
  -- the cause — no detail, no hint, and the day-clamp read above happens BEFORE
  -- resolution so a refused sender cannot use their own budget to tell one
  -- cause from another.
  --
  -- ⚠ AND THE WORK DOES NOT VARY EITHER, ONCE A TARGET IS RESOLVED (Security
  --   B5, 2026-09-23). The earlier draft short-circuited: `already_in_party`
  --   returned after one hr_party_of call, an honest target after two more
  --   counts. One string with three different amounts of work behind it is
  --   still an oracle, read off the clock instead of off the payload — and it
  --   is the exact fact S-13 exists to hide, because "does this name exist" is
  --   ALREADY public (display_names is `for select using (true)`) and
  --   "is this player currently in a party" is not public anywhere else.
  --   The sender's 20-a-day clamp does not bound the sampling either: it is
  --   spent only on a SUCCESSFUL invite, so a refused probe is free and the
  --   only ceiling is the 12/min bucket. So the three post-resolution
  --   predicates are ALL evaluated, unconditionally, and the reason is chosen
  --   afterwards — partied and not-partied cost the same three reads.
  v_canon := public.hr_canon_display_name(p_name);
  v_why   := null;
  v_target := null;
  if coalesce(v_canon, '') = '' then
    v_why := 'no_such_name';
  else
    select user_id into v_target from public.display_names where canonical = v_canon;
    if v_target is null then
      v_why := 'no_such_name';
    elsif v_target = v_uid then
      v_why := 'that_is_you';
    else
      -- THE TARGET CHARACTER, RESOLVED SERVER-SIDE: the account's most recently
      -- updated character. NOT a sender-supplied slot — that would be a client
      -- value naming another player's character, and a second oracle on top of
      -- the one this block closes. See file 1's party_invite header for the
      -- alternative (address the ACCOUNT, bind the slot at accept) and why S1
      -- takes the shape §18.2.1 wrote down.
      select ps.slot into v_tslot from public.player_state ps
       where ps.user_id = v_target order by ps.updated_at desc, ps.slot asc limit 1;
      -- ALL THREE, ALWAYS. v_tslot NULL makes each of them an index probe that
      -- matches nothing, so the no_character branch is the only cheap one left
      -- and it says nothing S-13 protects.
      v_partied := public.hr_party_of(v_target, v_tslot) is not null;
      -- THE RECEIVER CLAMP §18 OMITTED (S-13): 5 live, 20 received per
      -- character per UTC day. Journalled as invite_inbox_full; the sender is
      -- told c_one like everyone else, because "no distinction visible to the
      -- sender" cannot be satisfied by a second string.
      select count(*) into v_live from public.party_invite
       where user_id = v_target and slot = v_tslot
         and accepted_at is null and revoked_at is null and expires_at > now();
      select count(*) into v_today from public.party_invite
       where user_id = v_target and slot = v_tslot
         and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
      if    v_tslot is null   then v_why := 'no_character';
      elsif v_partied         then v_why := 'already_in_party';
      elsif v_live  >= 5      then v_why := 'inbox_full';   -- journals as invite_inbox_full
      elsif v_today >= 20     then v_why := 'inbox_full';
      end if;
    end if;
  end if;
  if v_why is not null then
    -- THE REAL REASON IS JOURNALLED UNDER ITS OWN CODE, AND NEVER RETURNED.
    -- ⚠ It must be its own CODE and not a `detail` field: public.hr_rejections
    --   is an AGGREGATE keyed (user, slot, day, code) with only `last_detail`
    --   kept, so five causes journalled under one code collapse into one row
    --   carrying whichever fired last. An operator would then see the clamp
    --   firing and be unable to tell WHICH clamp — the §3.4 failure ("a burst
    --   of equip conflicts reads as ten accrue refusals") reproduced inside one
    --   verb. Distinct codes give vitals.mjs --refusals a real breakdown while
    --   the SENDER still gets one string, which is the whole of S-13: privacy
    --   from the sender, not blindness for the operator.
    perform public.hr_record_rejection(v_uid, v_slot, 'party_invite',
      'invite_' || v_why, jsonb_build_object('why', v_why));
    return jsonb_build_object('ok', false, 'error', c_one);
  end if;

  -- FULL? Counted here, and re-counted under the party row lock on accept
  -- (T-6: *"a count read outside the lock is the shape the clan member-cap bug
  -- turned on"*). This one only spares the receiver a card that cannot be used.
  select count(*) into v_n from public.party_member
   where party_id = v_party and left_at is null;
  if v_n >= (select size_cap from public.party where id = v_party) then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_invite', 'party_full',
      jsonb_build_object('members', v_n));
    return jsonb_build_object('ok', false, 'error', 'party_full'); end if;

  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_idem, v_slot, 'party_invite')
  on conflict (user_id, intent_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;

  -- ⚠ RETIRE THIS PARTY'S EXPIRED CARD FOR THIS CHARACTER FIRST (Security B4,
  --   2026-09-23). party_invite_live is unique on (party_id, user_id, slot)
  --   `where accepted_at is null and revoked_at is null` — and EXPIRY is
  --   neither of those. A card that timed out fifteen minutes ago therefore
  --   held the slot for ever, so the second invite to the same character from
  --   the same party raised unique_violation and answered
  --   invite_target_unavailable permanently: a transient state turned into a
  --   standing denial, and the leader had no way to see or clear it. It also
  --   made the index and the receiver clamp disagree about the word "live" —
  --   the 5-live count reads `expires_at > now()`, the index did not. Expiry is
  --   now written down as a revocation, which is what it always meant.
  update public.party_invite set revoked_at = now()
   where party_id = v_party and user_id = v_target and slot = v_tslot
     and accepted_at is null and revoked_at is null and expires_at <= now();

  begin
    insert into public.party_invite (party_id, user_id, slot, invited_by_user)
      values (v_party, v_target, v_tslot, v_uid) returning id into v_id;
  exception when unique_violation then
    -- A live invite to that character from this party already exists. Still
    -- ONE string: "already invited" is the partied fact in a thinner disguise.
    delete from public.player_intents where user_id = v_uid and intent_id = p_idem;
    perform public.hr_record_rejection(v_uid, v_slot, 'party_invite',
      'invite_already_invited', jsonb_build_object('why', 'already_invited'));
    return jsonb_build_object('ok', false, 'error', c_one);
  end;

  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'daily', 'ev:party_invites', 1, v_day, 'active', now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = pp.value + 1, updated_at = now();

  -- THE ANSWER NAMES NOTHING ABOUT THE TARGET. Not their user id, not their
  -- slot, not the invite id (which is the RECEIVER's to hold and the receiver's
  -- policy to read). "Sent" is all a sender is entitled to know.
  v_out := jsonb_build_object('ok', true, 'sent', true);
  update public.player_intents set result = v_out
   where user_id = v_uid and intent_id = p_idem;
  return v_out;
end $fn$;

-- ── 4. hr_party_accept — S-11 AND S-12 LIVE HERE ───────────────────────────
create or replace function public.hr_party_accept(p_slot int, p_invite uuid, p_idem uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $fn$
declare
  v_uid   uuid := auth.uid();
  v_slot  int  := coalesce(p_slot, -1);
  v_day   text := public.hr_utc_day_key(now());
  v_prev  text;
  v_out   jsonb;
  v_inv   public.party_invite%rowtype;
  v_party public.party%rowtype;
  v_n     bigint;
  v_size  bigint;                   -- the party's LIVE member count, under the lock
  v_lvl   int;
  v_lo    int;
  v_hi    int;
  c_spread constant int := 10;      -- §18.1: at most 10 combat levels
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('party') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if v_slot < 0 or v_slot > 5 then
    perform public.hr_record_rejection(v_uid, 0, 'party_accept', 'bad_slot', jsonb_build_object('slot', p_slot));
    return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_idem is null or p_invite is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_accept', 'bad_party',
      jsonb_build_object('why', case when p_idem is null then 'null idempotency key' else 'null invite' end));
    return jsonb_build_object('ok', false, 'error', 'bad_party'); end if;

  select result, intent into v_out, v_prev
    from public.player_intents where user_id = v_uid and intent_id = p_idem;
  if found then
    if v_prev is distinct from 'party_accept' then
      perform public.hr_record_rejection(v_uid, v_slot, 'party_accept', 'intent_mismatch',
        jsonb_build_object('stored', v_prev, 'sent', 'party_accept'));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch'); end if;
    if v_out is null then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
    return v_out || jsonb_build_object('replayed', true);
  end if;

  if public.hr_party_of(v_uid, v_slot) is not null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_accept', 'already_in_party', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'already_in_party'); end if;

  -- THE INVITE MUST BE ADDRESSED TO THIS CHARACTER. `user_id = v_uid and
  -- slot = v_slot` is in the WHERE clause, not checked after: a caller naming
  -- somebody else's invite id gets the same `invite_gone` as one naming a uuid
  -- that never existed, so the id is not a probe for other people's invites.
  select * into v_inv from public.party_invite
   where id = p_invite and user_id = v_uid and slot = v_slot;
  if not found or v_inv.revoked_at is not null or v_inv.accepted_at is not null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_accept', 'invite_gone', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'invite_gone'); end if;
  if v_inv.expires_at <= now() then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_accept', 'invite_expired',
      jsonb_build_object('expired_at', v_inv.expires_at));
    return jsonb_build_object('ok', false, 'error', 'invite_expired'); end if;

  -- THE PARTY ROW LOCK. Everything from here to the insert is serialised
  -- against another accept, a leave and a kick on the same party — which is
  -- what makes the size re-count and the spread re-check real rather than
  -- advisory (T-6).
  select * into v_party from public.party where id = v_inv.party_id for update;
  if not found or v_party.dissolved_at is not null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_accept', 'unknown_party', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'unknown_party'); end if;

  -- ══ S-11 ═════════════════════════════════════════════════════════════════
  -- Refused while the party has a live hunt. hr_party_hunt_live is FALSE in S1
  -- and S2 owns its body; the CALL SITE and its test exist now, so the day S2
  -- lands party_hunt this refusal starts firing without anyone having to
  -- remember it. tests/party-membership.mjs stubs the predicate to TRUE and
  -- requires exactly this string.
  if public.hr_party_hunt_live(v_party.id) then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_accept', 'party_hunt_running', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'party_hunt_running'); end if;

  -- SIZE, RE-COUNTED UNDER THE LOCK (T-6). It is held in its OWN variable:
  -- the answer's `members` is built from it at the end of the verb, and the
  -- day-clamp read below used to land in the same v_n and be reported as the
  -- party's size (Security B1).
  select count(*) into v_size from public.party_member
   where party_id = v_party.id and left_at is null;
  if v_size >= v_party.size_cap then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_accept', 'party_full',
      jsonb_build_object('members', v_size, 'cap', v_party.size_cap));
    return jsonb_build_object('ok', false, 'error', 'party_full'); end if;

  -- ══ S-12 — THE SPREAD, RE-CHECKED ON ACCEPT ══════════════════════════════
  -- Over the live member set AS IT WOULD BE, i.e. including the joiner. The
  -- detail names the member and the gap because §18.3 requires the panel to say
  -- *"Everyone must be within 10 levels — Tomas is 18 below"*; the sentence is
  -- the client's, the numbers are the server's.
  v_lvl := public.hr_party_level(v_uid, v_slot);
  select min(public.hr_party_level(m.user_id, m.slot)),
         max(public.hr_party_level(m.user_id, m.slot))
    into v_lo, v_hi
    from public.party_member m
   where m.party_id = v_party.id and m.left_at is null;
  v_lo := least(coalesce(v_lo, v_lvl), v_lvl);
  v_hi := greatest(coalesce(v_hi, v_lvl), v_lvl);
  if (v_hi - v_lo) > c_spread then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_accept', 'party_level_spread',
      jsonb_build_object('mine', v_lvl, 'low', v_lo, 'high', v_hi, 'max', c_spread));
    return jsonb_build_object('ok', false, 'error', 'party_level_spread',
      'detail', jsonb_build_object('mine', v_lvl, 'low', v_lo, 'high', v_hi, 'max', c_spread));
  end if;

  -- THE ACCEPTOR'S DAY CLAMP (§18.3: 20 / character / day).
  select coalesce(value, 0) into v_n from public.player_progress
   where user_id = v_uid and slot = v_slot and kind = 'daily'
     and key = 'ev:party_accepts' and period_key = v_day;
  if coalesce(v_n, 0) >= 20 then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_accept', 'party_daily_cap',
      jsonb_build_object('accepted', v_n, 'cap', 20));
    return jsonb_build_object('ok', false, 'error', 'party_daily_cap'); end if;

  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_idem, v_slot, 'party_accept')
  on conflict (user_id, intent_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;

  -- ⚠ A REJOIN REVIVES THE DEAD ROW; IT DOES NOT INSERT A SECOND ONE (Security
  --   B2, 2026-09-23). party_member's PRIMARY KEY is (party_id, user_id, slot)
  --   and a member who LEFT keeps their row with left_at stamped, so a plain
  --   insert on a rejoin raised on the PK — and the handler below, which cannot
  --   tell a PK collision from an invariant-1 one, answered `already_in_party`.
  --   The effect was permanent and silent: leave → re-invite → accept, the
  --   path §18-SEC.1 S-6 calls "the same lever with 20/day of headroom", could
  --   never complete for the same party, and the player was told they were in a
  --   party they had left. File 2's §8(f) walks exactly that path but is
  --   refused one step earlier by the stubbed hunt predicate, so nothing saw it.
  --   A LIVE row does not match the `where`, so the upsert touches nothing and
  --   falls through to the raced refusal; a row live in ANOTHER party still
  --   raises party_member_one_live, which is the fence invariant 1 IS.
  begin
    insert into public.party_member as pm (party_id, user_id, slot, role)
      values (v_party.id, v_uid, v_slot, 'member')
    on conflict (party_id, user_id, slot) do update
      set role = 'member', joined_at = now(), left_at = null, removed_by = null
      where pm.left_at is not null;
    if not found then
      delete from public.player_intents where user_id = v_uid and intent_id = p_idem;
      perform public.hr_record_rejection(v_uid, v_slot, 'party_accept', 'already_in_party',
        jsonb_build_object('raced', true));
      return jsonb_build_object('ok', false, 'error', 'already_in_party');
    end if;
  exception when unique_violation then
    delete from public.player_intents where user_id = v_uid and intent_id = p_idem;
    perform public.hr_record_rejection(v_uid, v_slot, 'party_accept', 'already_in_party',
      jsonb_build_object('raced', true));
    return jsonb_build_object('ok', false, 'error', 'already_in_party');
  end;

  update public.party_invite set accepted_at = now() where id = v_inv.id;
  update public.party set version = version + 1 where id = v_party.id;
  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'daily', 'ev:party_accepts', 1, v_day, 'active', now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = pp.value + 1, updated_at = now();

  -- `members` is the party's size + this joiner, from the count taken under the
  -- lock — never from v_n, which by here holds the acceptor's daily accept
  -- count (Security B1: the browser must never be told a number the server
  -- does not hold, CLAUDE.md §6).
  v_out := jsonb_build_object('ok', true, 'party_id', v_party.id, 'role', 'member',
                              'members', v_size + 1);
  update public.player_intents set result = v_out
   where user_id = v_uid and intent_id = p_idem;
  return v_out;
end $fn$;

-- ── 5. hr_party_leave — NEVER CLAMPED, AND IT TRANSFERS OR DISSOLVES ───────
-- §18.3: *"never clamped: a player may always leave."* That is a promise, not
-- an omission, so this verb has NO day counter and no way to refuse a live
-- member. (S-6 proposes a churn clamp on the SETTLE BOUNDARY a leave forces —
-- *"a leave is still honoured immediately for membership … it is PAID at the
-- next natural flush boundary"* — which is S2's, because there is no boundary
-- and nothing to pay in S1. Membership is never held either way.)
--
-- Invariant 3: leadership transfers to `order by joined_at, user_id limit 1`
-- IN THE SAME TRANSACTION — deterministic, no election, no vote.
-- Invariant 4: the last live member out stamps dissolved_at and revokes every
-- live invite, so a card for a party that no longer exists cannot be accepted.
create or replace function public.hr_party_leave(p_slot int, p_idem uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $fn$
declare
  v_uid   uuid := auth.uid();
  v_slot  int  := coalesce(p_slot, -1);
  v_prev  text;
  v_out   jsonb;
  v_party public.party%rowtype;
  v_pid   uuid;
  v_role  text;
  v_next  record;
  v_left  bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('party') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if v_slot < 0 or v_slot > 5 then
    perform public.hr_record_rejection(v_uid, 0, 'party_leave', 'bad_slot', jsonb_build_object('slot', p_slot));
    return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_idem is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_leave', 'bad_party', jsonb_build_object('why', 'null idempotency key'));
    return jsonb_build_object('ok', false, 'error', 'bad_party'); end if;

  select result, intent into v_out, v_prev
    from public.player_intents where user_id = v_uid and intent_id = p_idem;
  if found then
    if v_prev is distinct from 'party_leave' then
      perform public.hr_record_rejection(v_uid, v_slot, 'party_leave', 'intent_mismatch',
        jsonb_build_object('stored', v_prev, 'sent', 'party_leave'));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch'); end if;
    if v_out is null then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
    return v_out || jsonb_build_object('replayed', true);
  end if;

  v_pid := public.hr_party_of(v_uid, v_slot);
  if v_pid is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_leave', 'not_in_party', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'not_in_party'); end if;

  select * into v_party from public.party where id = v_pid for update;
  if not found then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_leave', 'unknown_party', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'unknown_party'); end if;

  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_idem, v_slot, 'party_leave')
  on conflict (user_id, intent_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;

  select role into v_role from public.party_member
   where party_id = v_pid and user_id = v_uid and slot = v_slot and left_at is null;
  update public.party_member set left_at = now()
   where party_id = v_pid and user_id = v_uid and slot = v_slot and left_at is null;

  select count(*) into v_left from public.party_member
   where party_id = v_pid and left_at is null;

  if v_left = 0 then
    -- INVARIANT 4. The last member out dissolves it and revokes the cards.
    update public.party set dissolved_at = now(), version = version + 1 where id = v_pid;
    update public.party_invite set revoked_at = now()
     where party_id = v_pid and accepted_at is null and revoked_at is null;
    v_out := jsonb_build_object('ok', true, 'left', true, 'dissolved', true, 'members', 0);
  else
    if v_role = 'leader' then
      -- INVARIANT 3, in this same transaction. Deterministic by tenure then
      -- user id: no election, no vote, no window in which a party has no leader.
      select m.user_id, m.slot into v_next from public.party_member m
       where m.party_id = v_pid and m.left_at is null
       order by m.joined_at, m.user_id limit 1;
      update public.party_member set role = 'leader'
       where party_id = v_pid and user_id = v_next.user_id and slot = v_next.slot;
      update public.party set leader_user = v_next.user_id, leader_slot = v_next.slot,
                              version = version + 1
       where id = v_pid;
    else
      update public.party set version = version + 1 where id = v_pid;
    end if;
    v_out := jsonb_build_object('ok', true, 'left', true, 'dissolved', false, 'members', v_left);
  end if;

  update public.player_intents set result = v_out
   where user_id = v_uid and intent_id = p_idem;
  return v_out;
end $fn$;

-- ── 6. hr_party_kick — LEADER ONLY, BY DISPLAY NAME ────────────────────────
-- ⚠ BY NAME, NOT BY USER ID, AND THAT IS S-7'S DOING. hr_party_view's FROZEN
--   column set gives the panel a name, a level and an HP bar and NOT a user id
--   — and it must not be widened to carry one, because a user id is an
--   addressable handle to a player and the view is the one cross-user read M8
--   adds. So the leader kicks by the same string the panel renders. That also
--   makes this verb no oracle at all: the only names it can resolve are the
--   ones hr_party_view already showed this caller.
--
-- Clamp: 20 / PARTY / UTC day (§18.3), counted off party_member.removed_by, so
-- it survives a leadership transfer. A counter on the leader's character would
-- reset the moment leadership moved, which is a lever, not a clamp.
create or replace function public.hr_party_kick(p_slot int, p_name text, p_idem uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $fn$
declare
  v_uid   uuid := auth.uid();
  v_slot  int  := coalesce(p_slot, -1);
  v_prev  text;
  v_out   jsonb;
  v_pid   uuid;
  v_canon text;
  v_tu    uuid;
  v_ts    int;
  v_n     bigint;
  v_left  bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('party') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if v_slot < 0 or v_slot > 5 then
    perform public.hr_record_rejection(v_uid, 0, 'party_kick', 'bad_slot', jsonb_build_object('slot', p_slot));
    return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_idem is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_kick', 'bad_party', jsonb_build_object('why', 'null idempotency key'));
    return jsonb_build_object('ok', false, 'error', 'bad_party'); end if;

  select result, intent into v_out, v_prev
    from public.player_intents where user_id = v_uid and intent_id = p_idem;
  if found then
    if v_prev is distinct from 'party_kick' then
      perform public.hr_record_rejection(v_uid, v_slot, 'party_kick', 'intent_mismatch',
        jsonb_build_object('stored', v_prev, 'sent', 'party_kick'));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch'); end if;
    if v_out is null then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
    return v_out || jsonb_build_object('replayed', true);
  end if;

  v_pid := public.hr_party_of(v_uid, v_slot);
  if v_pid is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_kick', 'not_in_party', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'not_in_party'); end if;
  if public.hr_party_role(v_pid, v_uid, v_slot) is distinct from 'leader' then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_kick', 'not_party_leader', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'not_party_leader'); end if;

  perform 1 from public.party where id = v_pid for update;

  -- THE DAY CLAMP, PER PARTY. Removals by anyone, today, off the audit column.
  select count(*) into v_n from public.party_member
   where party_id = v_pid and removed_by is not null
     and left_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  if v_n >= 20 then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_kick', 'party_daily_cap',
      jsonb_build_object('kicked', v_n, 'cap', 20, 'per', 'party/day'));
    return jsonb_build_object('ok', false, 'error', 'party_daily_cap'); end if;

  -- RESOLVE THE TARGET WITHIN THIS PARTY'S LIVE MEMBERS AND NOWHERE ELSE.
  v_canon := public.hr_canon_display_name(p_name);
  select m.user_id, m.slot into v_tu, v_ts
    from public.party_member m
    join public.display_names d on d.user_id = m.user_id
   where m.party_id = v_pid and m.left_at is null and d.canonical = v_canon;
  if v_tu is null then
    -- A name the panel did not show. No oracle: the caller already sees every
    -- name this could match.
    perform public.hr_record_rejection(v_uid, v_slot, 'party_kick', 'not_in_party',
      jsonb_build_object('target', 'unresolved'));
    return jsonb_build_object('ok', false, 'error', 'not_in_party'); end if;
  if v_tu = v_uid then
    -- The panel does not render Kick on your own row; reaching it is a bug.
    -- Leaving is hr_party_leave, which also transfers leadership properly.
    perform public.hr_record_rejection(v_uid, v_slot, 'party_kick', 'bad_party',
      jsonb_build_object('why', 'self_kick'));
    return jsonb_build_object('ok', false, 'error', 'bad_party'); end if;

  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_idem, v_slot, 'party_kick')
  on conflict (user_id, intent_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;

  -- ⚠ T-3 (kick-before-split) IS S2'S AND IS NOT SILENTLY SKIPPED HERE. It
  --   rules that a membership change while a hunt is live SETTLES THE OPEN
  --   WINDOW FIRST, in the same transaction, paying the member being removed,
  --   and is refused with party_settle_required if the settle cannot run. In S1
  --   there is no hunt, no window and nothing to pay — hr_party_hunt_live is
  --   FALSE — so the settle call has no argument to take. The day S2 lands it,
  --   it goes HERE, before the left_at write, and S4's test asserts left_at is
  --   unwritten when the settle cannot run.
  update public.party_member set left_at = now(), removed_by = v_uid
   where party_id = v_pid and user_id = v_tu and slot = v_ts and left_at is null;

  select count(*) into v_left from public.party_member
   where party_id = v_pid and left_at is null;
  if v_left = 0 then
    update public.party set dissolved_at = now(), version = version + 1 where id = v_pid;
    update public.party_invite set revoked_at = now()
     where party_id = v_pid and accepted_at is null and revoked_at is null;
  else
    update public.party set version = version + 1 where id = v_pid;
  end if;

  v_out := jsonb_build_object('ok', true, 'kicked', true, 'members', v_left);
  update public.player_intents set result = v_out
   where user_id = v_uid and intent_id = p_idem;
  return v_out;
end $fn$;

-- ── 7. GRANTS — `authenticated` ONLY, REVOKE BEFORE GRANT ──────────────────
-- create-or-replace preserves an ACL, so the revoke is not decoration: it is
-- what makes a re-apply of this file converge on the same five grants whatever
-- the previous ACL was. The client-surface record is file 3; between this file
-- and that one the nightly detector raises (S-14), which is why they are one
-- batch applied in one sitting.
revoke execute on function public.hr_party_create(int, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.hr_party_create(int, uuid) to authenticated;
revoke execute on function public.hr_party_invite(int, text, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.hr_party_invite(int, text, uuid) to authenticated;
revoke execute on function public.hr_party_accept(int, uuid, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.hr_party_accept(int, uuid, uuid) to authenticated;
revoke execute on function public.hr_party_leave(int, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.hr_party_leave(int, uuid) to authenticated;
revoke execute on function public.hr_party_kick(int, text, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.hr_party_kick(int, text, uuid) to authenticated;

-- ── 8. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
-- Security's S1 list (§18-SEC.3), the verb half: the S-11 refusal string and
-- the S-13 single-refusal property, EXECUTED by calling the verbs as two
-- planted auth.uid() values, with every planted row rolled back at HR824 and
-- COUNTED afterwards.
do $$
declare
  v_a   constant uuid := '00000000-0000-4000-8000-0000b8010011';
  v_b   constant uuid := '00000000-0000-4000-8000-0000b8010012';
  v_r   jsonb;
  v_p   uuid;
  v_inv uuid;
  v_n   bigint;
  v_src text;
  v_codes text[];
  t     text;
begin
  -- (y) NOT A MONEY SURFACE, PROVED BY READING THE FIVE BODIES. §18-SEC.0
  --     scopes S1 to *"no hr_apply reachability"*, and a scope claim that is
  --     only in a header is a scope claim nobody can check later.
  foreach t in array array['hr_party_create','hr_party_invite','hr_party_accept',
                           'hr_party_leave','hr_party_kick'] loop
    select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = t;
    if v_src is null then raise exception 'GATE(y): % did not install', t; end if;
    -- Schema-qualified for the two S2 TABLES so that calling file 1's
    -- predicate `public.hr_party_hunt_live(...)` — which is how S-11's refusal
    -- is spelled and is the whole point of it existing — is not mistaken for
    -- touching `public.party_hunt`, the table S2 owns and S1 must not have.
    if v_src ~* '(hr_apply|player_ledger|player_inventory|player_equipment|player_bank|hr_tick_|public\.party_hunt\y|public\.party_tick_lease\y)' then
      raise exception 'GATE(y): % reaches a money or tick surface. S1 is MEMBERSHIP ONLY (§18-SEC.0) and S-1 through S-4 are unanswered P0s that block everything downstream of it.', t;
    end if;
    -- gold/gems/xp by name, in either direction.
    if v_src ~* '(\ygold\y|\ygems\y|hearth_tokens|\yxp\y|dungeon_scrip|\ymarks\y)' then
      raise exception 'GATE(y): % names a currency or XP. Nothing in slice 1 may.', t;
    end if;
    -- A9: every client-callable SECURITY DEFINER body reaches a rate gate.
    if position('hr_rpc_gate' in v_src) = 0 then
      raise exception 'GATE(y): % is client-callable and does not reach hr_rpc_gate', t;
    end if;
    -- And it journals its refusals WITH ITS VERB (CLAUDE.md §3.4): a refusal
    -- burst with no verb reads as ten "accrue" refusals in vitals.mjs.
    if position('hr_record_rejection' in v_src) = 0 then
      raise exception 'GATE(y): % journals no refusal — "nobody can form a party" would then be invisible for two days', t;
    end if;
  end loop;

  -- (y2) NO VERB MAY WRITE A ROW OUTSIDE THE SAVEPOINT THAT CLEANS UP AFTER IT
  --      (Security B3, 2026-09-23). hr_party_create's `insert into public.party`
  --      used to sit ABOVE the `begin … exception when unique_violation` that
  --      wraps the party_member insert, so a plpgsql sub-block rollback — which
  --      undoes only what the sub-block contains — left the loser of an
  --      invariant-1 race holding a leaderless, memberless party row that no
  --      policy can read, while the handler released the idempotency key and
  --      never spent `ev:party_creates`. The row was therefore free: two
  --      concurrent creates on one character minted one, at 12/min rather than
  --      at ten a day. A race cannot be staged on a single replay connection,
  --      so the property is asserted where it IS visible — in the source, on
  --      the order of two statements.
  --      The discriminator is one `begin`: when both inserts are inside the
  --      sub-block the span from the party insert to the handler contains no
  --      `begin` at all, and when the party insert is above the sub-block that
  --      span contains exactly the `begin` that opens it.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_party_create';
  if position('insert into public.party (leader_user' in v_src) = 0
     or position('exception when unique_violation' in v_src) = 0
     or position('exception when unique_violation' in v_src)
        < position('insert into public.party (leader_user' in v_src) then
    raise exception 'GATE(y2): hr_party_create no longer spells its party insert and its unique_violation handler the way this arm reads them, in that order — re-read the body rather than deleting the arm (guard-hygiene R3: a probe that cannot fail is not a proof).';
  end if;
  if position('begin' in substring(v_src
        from position('insert into public.party (leader_user' in v_src)
        for  position('exception when unique_violation' in v_src)
             - position('insert into public.party (leader_user' in v_src))) > 0 then
    raise exception 'GATE(y2): hr_party_create inserts its party row OUTSIDE the sub-block whose rollback is supposed to take it back. The loser of an invariant-1 race then keeps a party nobody can read, for free — the day clamp is never spent on it.';
  end if;

  -- (x) THE GRANT MATRIX, PER ROLE.
  foreach t in array array['public.hr_party_create(integer,uuid)',
                           'public.hr_party_invite(integer,text,uuid)',
                           'public.hr_party_accept(integer,uuid,uuid)',
                           'public.hr_party_leave(integer,uuid)',
                           'public.hr_party_kick(integer,text,uuid)'] loop
    if not has_function_privilege('authenticated', t, 'execute') then
      raise exception 'GATE(x): `authenticated` cannot call % — the verb ships dead', t; end if;
    if has_function_privilege('anon', t, 'execute')
       or has_function_privilege('service_role', t, 'execute') then
      raise exception 'GATE(x): % is executable by anon or service_role. Every one of these derives its actor from auth.uid(), which anon does not have and service_role bypasses.', t; end if;
  end loop;

  begin  -- ── SUBTRANSACTION: everything below is rolled back at HR824 ──────
    insert into auth.users (id) values (v_a), (v_b);

    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'ok','') <> 'true' then raise exception 'GATE: no probe A: %', v_r; end if;
    perform public.claim_display_name('Kaya Probe');
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'ok','') <> 'true' then raise exception 'GATE: no probe B: %', v_r; end if;
    perform public.claim_display_name('Bram Probe');

    -- (a) CREATE. One party, one leader, one transaction.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_party_create(0, gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' then raise exception 'GATE(a): hr_party_create refused: %', v_r; end if;
    v_p := (v_r->>'party_id')::uuid;
    if public.hr_party_role(v_p, v_a, 0) <> 'leader' then
      raise exception 'GATE(a): the creator is not the leader — a party nobody can administer is S-KICK by accident'; end if;

    -- (b) ALREADY IN A PARTY.
    v_r := public.hr_party_create(0, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'already_in_party' then
      raise exception 'GATE(b): a second create answered %', v_r; end if;

    -- ══ (c) S-13: THREE DIFFERENT CAUSES, ONE IDENTICAL STRING ═════════════
    --     No such name · that is you · already in a party. If any two of these
    --     differ the verb is an oracle answering "is this player partied",
    --     twenty times a day per account.
    v_codes := array[]::text[];
    v_r := public.hr_party_invite(0, 'Nobody At All Here', gen_random_uuid());
    v_codes := v_codes || coalesce(v_r->>'error', '(ok)');
    v_r := public.hr_party_invite(0, 'Kaya Probe', gen_random_uuid());
    v_codes := v_codes || coalesce(v_r->>'error', '(ok)');
    -- B into a party of their own, so "already in a party" is the live cause.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_r := public.hr_party_create(0, gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' then raise exception 'GATE(c): B could not form a party: %', v_r; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_party_invite(0, 'Bram Probe', gen_random_uuid());
    v_codes := v_codes || coalesce(v_r->>'error', '(ok)');
    if v_codes <> array['invite_target_unavailable','invite_target_unavailable','invite_target_unavailable'] then
      raise exception 'GATE(c): S-13 FAILED — three causes answered %. The sender must be told ONE string for no-such-name, that-is-you and already-in-a-party alike; the real reason is journalled where they cannot read it.', v_codes;
    end if;
    -- And the REAL reasons ARE journalled, DISTINCTLY. hr_rejections aggregates
    -- on (user, slot, day, CODE), so three causes under one code would be ONE
    -- row and an operator could not tell which clamp fired. S-13 buys privacy
    -- from the sender, not blindness for the operator.
    select count(*) into v_n from public.hr_rejections r
     where r.user_id = v_a and r.code in
       ('invite_no_such_name','invite_that_is_you','invite_already_in_party');
    if v_n <> 3 then
      raise exception 'GATE(c): the three causes produced % distinct journal row(s), not 3. hr_rejections is an aggregate keyed on the CODE — one code for every cause collapses them and reproduces the §3.4 blindness inside one verb.', v_n;
    end if;

    -- (d) THE INBOX CLAMP AT THE 6TH LIVE INVITE (S-13), AND IT IS STILL THE
    --     SAME STRING. B leaves so they are invitable again; five live cards
    --     from five different parties are planted (party_invite_live allows
    --     only one per party per character, so one party cannot reach five),
    --     and the verb is asked for the sixth.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    perform public.hr_party_leave(0, gen_random_uuid());
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    for v_n in 1..5 loop
      insert into public.party (leader_user, leader_slot) values (v_a, 0) returning id into v_inv;
      insert into public.party_invite (party_id, user_id, slot, invited_by_user)
        values (v_inv, v_b, 0, v_a);
    end loop;
    select count(*) into v_n from public.party_invite
     where user_id = v_b and slot = 0 and accepted_at is null and revoked_at is null
       and expires_at > now();
    if v_n <> 5 then raise exception 'GATE(d) CANNOT RUN: the inbox holds % live card(s), not 5', v_n; end if;
    v_r := public.hr_party_invite(0, 'Bram Probe', gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'invite_target_unavailable' then
      raise exception 'GATE(d): the 6th live invite answered % — the receiver clamp must refuse, and it must refuse with the SAME string as every other cause: twenty accounts could otherwise hand one player four hundred cards a day and learn from the refusal that they had.', v_r;
    end if;
    select count(*) into v_n from public.hr_rejections
     where user_id = v_a and code = 'invite_inbox_full';
    if v_n <> 1 then
      raise exception 'GATE(d): the inbox clamp was not journalled under its own code (% row(s)) — the operator must be able to see it in vitals.mjs --refusals even though the sender cannot.', v_n;
    end if;
    select count(*) into v_n from public.party_invite
     where user_id = v_b and slot = 0 and accepted_at is null and revoked_at is null;
    if v_n <> 5 then
      raise exception 'GATE(d): the REFUSED invite was written anyway — the inbox holds % cards', v_n; end if;

    -- Clear the planted inbox so every arm below runs against a card the
    -- VERB issued, from the party A actually leads — an accept into one of the
    -- five empty planted parties would find no live member to measure a spread
    -- against and (g) would prove nothing.
    update public.party_invite set revoked_at = now()
     where user_id = v_b and slot = 0 and accepted_at is null and revoked_at is null;

    -- (e) INVITE AND ACCEPT: THE HAPPY PATH, end to end through both verbs.
    v_r := public.hr_party_invite(0, 'Bram Probe', gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' then
      raise exception 'GATE(e): an honest invite was refused: %', v_r; end if;
    if v_r ? 'user_id' or v_r ? 'slot' or v_r ? 'invite_id' then
      raise exception 'GATE(e): the invite answer named the TARGET (%). A sender is entitled to "sent" and nothing else.', v_r; end if;
    select id into v_inv from public.party_invite
     where party_id = v_p and user_id = v_b and slot = 0
       and accepted_at is null and revoked_at is null;
    if v_inv is null then raise exception 'GATE(e): the accepted invite wrote no card'; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_r := public.hr_party_accept(0, v_inv, gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' then
      raise exception 'GATE(e): hr_party_accept refused a live card: %', v_r; end if;
    if public.hr_party_of(v_b, 0) is distinct from v_p then
      raise exception 'GATE(e): accept returned ok and wrote no membership row in the right party'; end if;
    -- (e1) THE ANSWER'S `members` IS THE PARTY'S SIZE (Security B1). It used to
    --      be built from a variable the day-clamp read had already overwritten,
    --      so the first accept of a UTC day told a party of two that it held
    --      one. CLAUDE.md §6: the browser is never told a number the server
    --      does not hold, and nothing else in this batch reads it, so only an
    --      arm here can see it.
    select count(*) into v_n from public.party_member
     where party_id = v_p and left_at is null;
    if (v_r->>'members')::bigint is distinct from v_n then
      raise exception 'GATE(e1): accept answered members=% and the party holds % live member(s).', v_r->>'members', v_n; end if;

    -- (e2) AN INVITE ID IS NOT A PROBE FOR SOMEBODY ELSE'S CARD. A caller
    --      naming an invite addressed to another character gets the same
    --      invite_gone as one naming a uuid that never existed.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_party_accept(0, v_inv, gen_random_uuid());
    if coalesce(v_r->>'error','') not in ('already_in_party','invite_gone') then
      raise exception 'GATE(e2): accepting ANOTHER character''s invite answered %', v_r; end if;

    -- ══ (e3) A PARTY YOU LEFT CAN BE REJOINED, AND AN EXPIRED CARD DOES NOT
    --         HOLD THE DOOR SHUT (Security B2 and B4) ══════════════════════
    --     Both defects were permanent, silent and on the same path — the
    --     leave → re-invite → accept path §18-SEC.1 S-6 prices as a lever.
    --     B2: party_member's PK is (party_id, user_id, slot), so the dead row
    --     from the first tenure made the rejoin raise on the PK and answer
    --     `already_in_party` — a player told they are in a party they left.
    --     B4: party_invite_live's predicate is `accepted_at is null and
    --     revoked_at is null`, which EXPIRY is neither of, so a timed-out card
    --     held the (party, character) slot for ever and every later invite
    --     answered invite_target_unavailable. (f) below walks this exact path
    --     but is refused one step earlier by the stubbed hunt predicate, so
    --     neither defect was reachable from any arm in this file.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    perform public.hr_party_leave(0, gen_random_uuid());
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_party_invite(0, 'Bram Probe', gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' then
      raise exception 'GATE(e3) CANNOT RUN: the re-invite was refused %', v_r; end if;
    -- Age that card past its own expiry and ask for another one.
    update public.party_invite set expires_at = now() - interval '1 minute'
     where party_id = v_p and user_id = v_b and slot = 0
       and accepted_at is null and revoked_at is null;
    v_r := public.hr_party_invite(0, 'Bram Probe', gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' then
      raise exception 'GATE(e3): B4 — an EXPIRED card blocked the next invite (%). party_invite_live keys on accepted_at/revoked_at, so expiry has to be written down as a revocation or a fifteen-minute timeout becomes a permanent denial the leader cannot see or clear.', v_r;
    end if;
    select count(*) into v_n from public.party_invite
     where party_id = v_p and user_id = v_b and slot = 0
       and accepted_at is null and revoked_at is null and expires_at > now();
    if v_n <> 1 then
      raise exception 'GATE(e3): B4 — % live card(s) for one character from one party, expected exactly 1', v_n; end if;
    select id into v_inv from public.party_invite
     where party_id = v_p and user_id = v_b and slot = 0
       and accepted_at is null and revoked_at is null and expires_at > now();
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_r := public.hr_party_accept(0, v_inv, gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' then
      raise exception 'GATE(e3): B2 — rejoining a party this character LEFT answered %. The dead row is revived as a new tenure; a plain insert raises on the primary key and is mis-reported as already_in_party, permanently.', v_r;
    end if;
    if public.hr_party_of(v_b, 0) is distinct from v_p then
      raise exception 'GATE(e3): the rejoin answered ok and wrote no live membership row'; end if;
    select count(*) into v_n from public.party_member
     where party_id = v_p and user_id = v_b and slot = 0;
    if v_n <> 1 then
      raise exception 'GATE(e3): the rejoin left % party_member row(s) for one character in one party — the dead row must be REVIVED, not duplicated', v_n; end if;
    select count(*) into v_n from public.party_member
     where party_id = v_p and left_at is null;
    if (v_r->>'members')::bigint is distinct from v_n then
      raise exception 'GATE(e3): the rejoin answered members=% against % live member(s)', v_r->>'members', v_n; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);

    -- ══ (f) S-11 — party_accept IS REFUSED WHILE A HUNT IS LIVE ════════════
    --     hr_party_hunt_live is FALSE in S1, so the refusal is proved by
    --     replacing the predicate INSIDE this rolled-back subtransaction and
    --     requiring the string. The CALL SITE is what is under test, and it is
    --     what S2 inherits the day it gives the predicate a real body.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    perform public.hr_party_leave(0, gen_random_uuid());
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_party_invite(0, 'Bram Probe', gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' then raise exception 'GATE(f) CANNOT RUN: re-invite refused %', v_r; end if;
    select id into v_inv from public.party_invite
     where party_id = v_p and user_id = v_b and slot = 0
       and accepted_at is null and revoked_at is null;
    create or replace function public.hr_party_hunt_live(p_party uuid)
    returns boolean language sql stable security definer
    set search_path = public, pg_catalog as 'select true';
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_r := public.hr_party_accept(0, v_inv, gen_random_uuid());
    -- Put it back immediately: nothing after this line may be graded on a stub.
    create or replace function public.hr_party_hunt_live(p_party uuid)
    returns boolean language sql stable security definer
    set search_path = public, pg_catalog as 'select false';
    if coalesce(v_r->>'error','') <> 'party_hunt_running' then
      raise exception 'GATE(f): S-11 FAILED — accepting into a party with a LIVE hunt answered %. It must be party_hunt_running: the joiner is otherwise inside the next party window with their own accrued_to days back, and the settle either wedges on them forever or confiscates their entire away window.', v_r;
    end if;
    if public.hr_party_of(v_b, 0) is not null then
      raise exception 'GATE(f): the refused accept wrote a membership row anyway'; end if;

    -- ══ (g) S-12 — THE SPREAD IS RE-CHECKED ON ACCEPT ══════════════════════
    --     The leader is levelled far past the ten-level spread and the same
    --     live card is offered again. §18.1's reasoning covers a member
    --     LEVELLING past the spread mid-hunt; it does not cover JOINING, and
    --     without this a party starts inside the spread and then accepts a
    --     level-1 alt into a level-30 hunt with no check at all — T-2 through
    --     the side door.
    insert into public.player_skills (user_id, slot, skill_id, xp)
    select v_a, 0, s, 14000000 from unnest(array['attack','strength','defense','hitpoints']) s
    on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    if public.hr_party_level(v_a, 0) - public.hr_party_level(v_b, 0) <= 10 then
      raise exception 'GATE(g) CANNOT RUN: the planted gap is % levels, which is INSIDE the spread — this probe would prove nothing',
        public.hr_party_level(v_a, 0) - public.hr_party_level(v_b, 0);
    end if;
    v_r := public.hr_party_accept(0, v_inv, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'party_level_spread' then
      raise exception 'GATE(g): S-12 FAILED — a character % levels below the party was accepted with %', public.hr_party_level(v_a, 0) - public.hr_party_level(v_b, 0), v_r;
    end if;
    if public.hr_party_of(v_b, 0) is not null then
      raise exception 'GATE(g): the spread-refused accept wrote a membership row anyway'; end if;

    -- (h) LEAVE IS NEVER REFUSED FOR A LIVE MEMBER, AND THE LAST ONE OUT
    --     DISSOLVES THE PARTY AND REVOKES ITS CARDS (invariant 4).
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_party_leave(0, gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' then
      raise exception 'GATE(h): a live member was refused a LEAVE (%). §18.3: never clamped — a player may always leave.', v_r; end if;
    if coalesce(v_r->>'dissolved','') <> 'true' then
      raise exception 'GATE(h): the last member out did not dissolve the party (invariant 4): %', v_r; end if;
    if exists (select 1 from public.party_invite
                where party_id = v_p and accepted_at is null and revoked_at is null) then
      raise exception 'GATE(h): a dissolved party left live invites behind — a card for a party that no longer exists (invariant 4)'; end if;

    raise exception using errcode = 'HR824', message = 'm8-parties-s1-2 §8 complete — rolling back';
  exception when sqlstate 'HR824' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (z) THE BLOCK LEAVES NO ROWS.
  if exists (select 1 from public.party_member where user_id in (v_a, v_b))
     or exists (select 1 from public.party_invite where user_id in (v_a, v_b))
     or exists (select 1 from public.party where leader_user in (v_a, v_b))
     or exists (select 1 from public.player_state    where user_id in (v_a, v_b))
     or exists (select 1 from public.player_intents  where user_id in (v_a, v_b))
     or exists (select 1 from public.player_progress where user_id in (v_a, v_b))
     or exists (select 1 from public.hr_rejections   where user_id in (v_a, v_b))
     or exists (select 1 from public.display_names   where user_id in (v_a, v_b))
     or exists (select 1 from auth.users             where id in (v_a, v_b)) then
    raise exception 'GATE(z): §8 LEAKED a probe row';
  end if;
  select (select count(*) from public.party)
       + (select count(*) from public.party_member)
       + (select count(*) from public.party_invite) into v_n;
  if v_n <> 0 then
    raise exception 'GATE(z): the party tables hold % row(s) after apply — a self-check may not leave player state behind (CLAUDE.md §2)', v_n;
  end if;

  raise notice 'm8-parties-s1-2: five verbs installed, granted to authenticated ONLY, each rate-gated and each journalling its refusals with its verb; none reaches hr_apply, a ledger, an inventory, a tick table or a currency by name; EXECUTED — a create makes exactly one party with its caller as leader, a second is already_in_party, and S-13 holds: three different causes answered one identical string while three distinct reasons reached the journal; every planted row rolled back and the three tables are EMPTY';
end $$;
