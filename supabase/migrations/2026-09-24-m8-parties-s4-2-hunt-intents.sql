-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-24-m8-parties-s4-2-hunt-intents.sql — M8 SLICE 4, FILE 2 OF 3:
--   THE TWO HUNT INTENTS, AND T-3's KICK-BEFORE-SPLIT GIVEN ITS REAL BODY IN
--   THE FILE THAT CREATES THE WINDOW IT PROTECTS.
--
-- Design: docs/planning/WORLD_TICK_DESIGN.md §18.1 (starting a hunt, leaving
-- and being kicked), §18.2.3 invariants 5 and 8, §18.3 (the intents and the
-- refusal codes), §18.4 T-3/T-3b/T-6, §18.5's S4 cell, §18-SEC.3's S4
-- self-check list, and §18-SEC-2.2's B-A1 and B-A6.
--
-- ⚠ THIS IS A MONEY-SURFACE REVIEW EVEN THOUGH IT PAYS NOTHING TODAY
--   (§18-SEC.3, Correction 1). These verbs decide WHEN a party window is cut
--   and WHO is inside it when the split is computed; the money moves later, on
--   an operator `update hr_tick_config set shadow = false`, with no further
--   code review in between. SHADOW ONLY today: nothing here reaches hr_apply,
--   §7(y) asserts that by reading the installed bodies, and §7(z) asserts the
--   tick is still in SHADOW after the apply.
--
-- ── WHAT LANDS HERE ─────────────────────────────────────────────────────────
--   hr_party_hunt_start(int,text,text,jsonb,uuid)  leader starts with team
--   hr_party_hunt_stop(int,uuid)                   leader stops it
--   hr_party_kick   PATCHED — T-3, settle-before-split, left_at unwritten on a
--                   refusal (the body S1 wrote the call site comment for)
--   hr_party_leave  PATCHED — invariant 5's boundary, never a refusal
--
-- ══ THE SEAM THIS FILE CANNOT CROSS, STATED FIRST BECAUSE EVERYTHING BELOW
--    FOLLOWS FROM IT ══════════════════════════════════════════════════════
--
-- §18.2.3 invariant 8: *"hr_party_tick_settle is the only function that moves
-- either"* watermark. S-3 and `AWAY-12` both forbid a second settler. And
-- `hr_party_tick_settle` is executable by **hr_engine and nothing else**, takes
-- the tick's own LEASE on `party_tick_lease`, and is handed per-member deltas
-- the SIMULATION produced — none of which a `SECURITY DEFINER` function called
-- by `authenticated` has or may fabricate.
--
--   SO A CLIENT VERB CAN NEVER *RUN* THE SETTLE. IT CAN ONLY ASSERT THAT THE
--   SETTLE RAN, AND REFUSE WHEN IT DID NOT.
--
-- That is what §18.3's `collectsFirst: true` means everywhere else in this
-- codebase — the collect happens in front of the verb, and the verb's job is to
-- be un-bypassable about it — and it is what file 1's
-- `hr_party_settle_current` is. The alternative, a party verb that assembles
-- its own deltas and pays, is a second money writer and a second settler in one
-- move, and it is refused on both counts (`CLAUDE.md` §6, S-3).
--
-- ── AND THE SAME SEAM AT THE OTHER END: WHAT `member_uncollectable` IS ─────
-- §18.1: the start is refused *"if any member's open accrual window cannot be
-- priced (member_uncollectable — the start closes four windows at once, so it
-- collects first for all four)"*. B-A6 says why it matters: *"party_hunt_start
-- writes three other players' player_state, and that is the first cross-user
-- write in the architecture … it follows necessarily from invariant 8 (the
-- equality has to be ESTABLISHED, and only a collect can establish it)."*
--
-- THE RULING THIS FILE IMPLEMENTS: the start ESTABLISHES invariant 8's equality
-- BY ASSERTING IT, and writes no watermark at all.
--
--   `v_at` is `max(player_state.accrued_to)` over the live members, and EVERY
--   live member must already be exactly there. `party_hunt.accrued_to` is
--   stamped to `v_at`, and no member's `accrued_to` is touched, because every
--   member is already at `v_at` — so the equality holds at the commit boundary
--   by construction and `hr_party_tick_settle` remains the only writer of
--   either side of it.
--
-- **AND THE ALTERNATIVE IS A CONFISCATION, WHICH IS WHY IT IS AN EQUALITY AND
--   NOT A TOLERANCE.** Admitting a member whose `accrued_to` is `T` seconds
--   behind `v_at` and stamping them forward would confiscate `T` seconds of
--   THREE OTHER PLAYERS' hunting — `CLAUDE.md` §3 rule 3's *"a verb that
--   stamps without collecting confiscates the elapsed window"*, at four
--   characters at once, on a verb the `party` bucket admits twelve times a
--   minute. There is no tolerance at which that is acceptable, so there is no
--   tolerance. A member who is not at `v_at` has an open window this call
--   cannot price — pricing another player's night is the tick's job and only
--   the tick's — and the whole start is refused `member_uncollectable`, naming
--   that member, with NOTHING written anywhere (B-A6, and §7(f) executes it
--   across FOUR planted members with the fourth uncollectable).
--
-- The equality is REACHABLE, and that is the collect-first half's job: the edge
-- closes all four windows to ONE instant in one request — exactly as
-- `hr_party_tick_settle` pays 2..4 members against ONE `p_window_to` — and then
-- calls this verb. A member the collect could not close is left at a different
-- watermark and this verb says so by name.
--
-- ══ B-A1's RULING, AND THE ASYMMETRY IN THE CONSEQUENCE ══════════════════
-- File 1 carries the ruling and its argument: **party_hunt_start and
-- party_hunt_stop DO count against S-6's eight boundaries per party per UTC
-- day**, because §18.1 prices the BOUNDARY and not the VERB. What this file
-- implements is the consequence, and it differs per verb for one reason —
-- §18.1's *"no refusal can ever hold a player in a party"*, which must be true
-- of a HUNT too, because a hunt is what the party is doing to the character:
--
--   verb              | the settle is NOT current      | past the eighth boundary
--   ------------------|--------------------------------|-------------------------
--   party_hunt_start  | n/a — there is no party window | REFUSED party_settle_churn
--   party_hunt_stop   | lands; notice party_settle_churn| lands; notice; spends nothing
--   party_leave       | lands; notice party_settle_churn| lands; notice; spends nothing
--   party_kick        | ★ REFUSED party_settle_required,| lands ONLY on a natural
--                     |   left_at UNWRITTEN (T-3)      | boundary; spends nothing
--
-- **Why the kick alone is refusable, and why that is not a hole in the other
--   three.** A refusal of a kick holds NOBODY anywhere: the member stays in the
--   party they are already in and the leader is told to wait. §18.1's promise
--   is to the player being removed, not to the player doing the removing, and
--   §18.4 T-3 says the refusal out loud: *"If the settle cannot run, the kick
--   is refused with party_settle_required — the kick is never the cheaper
--   path."* A refusal of a STOP or a LEAVE would hold four players in a hunt or
--   one player in a party, which §18.1 forbids unconditionally and states
--   twice. It costs nothing to let those two land: `ended_at` (or `left_at`)
--   makes `hr_partied` false, invariant 7 stops excluding those characters, and
--   the per-character roster prices each of them from their own
--   `player_state.accrued_to` — which invariant 8 has kept equal to the party
--   watermark — so the interval is paid ONCE, by ONE path, and none is lost.
--   That is the degradation Security recorded as safe in the S2 review
--   (`SEC_PARTIES_M8_2026-09-23.md`, *"Invariant 5 is not implemented in S2,
--   and that is correct"*), reached deliberately here instead of by omission.
--
-- **AND THE ONE THING THAT IS NOT A HOLE BUT IS WORTH A REVIEWER'S EYE:** past
--   the eighth boundary a kick can still land in the sixty seconds after a
--   NATURAL flush, because the settle is genuinely current then and nobody
--   chose its instant. That is the correct reading of a budget on the boundary
--   rather than on the verb, and §18.3's 20-kicks-per-party-per-day clamp is
--   what bounds it.
--
-- ── WHY THE BOUNDARY IS SPENT EVEN WHEN THE TICK PROVIDED IT ──────────────
-- A stop, leave or kick inside the sixty seconds after a natural flush spends a
-- boundary it did not force. The over-count is deliberate and is in the
-- PLAYER'S disfavour by at most a few boundaries a day: the alternative is to
-- ask whether THIS settle was caused by THIS request, which nothing in the
-- database can answer without the driver telling it — and a lever priced by a
-- claim the caller makes is not priced at all.
--
-- ── ONE NEW REFUSAL CODE, ARGUED ──────────────────────────────────────────
-- `party_too_small`. §18.1 fixes party size at **2–4** and §18.3's code table
-- carries `party_full` for the upper bound and nothing for the lower. A party
-- of one is a real, reachable, ordinary state — §18.1: *"a party that falls to
-- one member keeps existing so its last member can invite again, but its hunt
-- stops"* — so the leader of a party of one tapping *Start with team* is not a
-- bug, and answering it with `bad_party` would tell a player to file one. The
-- alternative considered and rejected was reusing `party_full`, which would
-- make one string mean both bounds and give the panel nothing to say.
-- `no_party_hunt` is NOT new: it is the string `hr_party_tick_settle` already
-- answers for the same condition, reused rather than re-coined.
--
-- ── STOP LEAVES EVERY player_state ROW ALONE, AND THAT IS A RULING ────────
-- §18.1 says a party WIPE ends the hunt and *"all members go idle"*. That
-- sentence belongs to the settle, which has just priced the window and can
-- therefore idle a character for free. This verb cannot: `active_kind` is an
-- input the open window is priced from, so writing it without collecting is the
-- confiscation `CLAUDE.md` §3 rule 3 names — and, unlike the start's
-- `member_uncollectable`, there is no assertion that would make it free,
-- because the residual `[mark, now]` is real by construction. So
-- `hr_party_hunt_stop` writes `party_hunt` and the boundary journal and NOTHING
-- else, and each member's next settle prices their residual under their own
-- solo rules on the activity they are on.
--   ⚠ THE COST IS NAMED RATHER THAN DISCOVERED, AND IT IS S5's TO CLOSE: after
--     a stop, each member is left pointed at the party's monster — which §18.1
--     says may be *"spawns a solo character of that level cannot survive"*.
--     Nothing is lost (the Recovery Rule knocks a character out and resumes; a
--     death is never a free heal and never a loss of items) and one
--     `set_activity` clears it, which the panel can offer the moment the hunt
--     ends. The two alternatives are both refused here: restoring a pointer
--     saved at start is the second copy of *"what a character is doing"* §18's
--     one-sentence design forbids, and idling them here is the confiscation
--     above.
--
-- ── hr_party_kick AND hr_party_leave ARE RESTATED, UNDER A PIN ────────────
-- This lane reached for an anchored patch first and `tests/patch-chain-guard
-- .mjs` refused it: three anchors per body is the chain PATCH-3 exists to stop,
-- and T-3 is a fence a reviewer has to be able to READ. So both bodies are
-- restated from 2026-09-23-m8-parties-s1-2-verbs.sql's own text with three
-- marked edits each — and §5's PIN hashes the INSTALLED body first and REFUSES
-- THE APPLY if it is not the text this restatement was derived from. That is
-- strictly stronger than the patch S2 §5b argued for: neither body is tracked
-- in tests/live-hash-drift.baseline.json, so a silent revert would have been
-- seen by nothing, whereas a patch whose anchor still matched would have
-- applied cheerfully on top of a change nobody in this lane had read.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   drop function if exists public.hr_party_hunt_stop(int, uuid);
--   drop function if exists public.hr_party_hunt_start(int, text, text, jsonb, uuid);
-- and re-apply 2026-09-23-m8-parties-s1-2-verbs.sql AT ITS OWN POSITION to take
-- the two restatements back (it carries the unedited bodies verbatim, and its
-- own §8 self-check re-proves them). File 3 must
-- come out first: it records these two verbs in hr_client_rpc_baseline.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_party_boundary_room(uuid)') is null
     or to_regprocedure('public.hr_party_boundaries_today(uuid)') is null
     or to_regprocedure('public.hr_party_settle_current(uuid)') is null
     or to_regclass('public.party_settle_boundary') is null then
    raise exception 'PRECONDITION: the S4 boundary budget is absent — apply 2026-09-24-m8-parties-s4-1-boundary-budget.sql FIRST. It is file 1 of 3 and this is file 2.';
  end if;
  if to_regprocedure('public.hr_party_kick(integer,text,uuid)') is null
     or to_regprocedure('public.hr_party_leave(integer,uuid)') is null
     or to_regprocedure('public.hr_party_of(uuid,integer)') is null
     or to_regprocedure('public.hr_party_role(uuid,uuid,integer)') is null
     or to_regprocedure('public.hr_party_level(uuid,integer)') is null
     or to_regprocedure('public.hr_party_hunt_live(uuid)') is null then
    raise exception 'PRECONDITION: an S1 party verb or predicate is absent — apply the M8 S1 three first.';
  end if;
  if to_regclass('public.party_hunt') is null then
    raise exception 'PRECONDITION: public.party_hunt is absent — S4 cannot land before S2 (§18-SEC.3, Correction 2).';
  end if;
  -- S-11's predicate must have its REAL body. With S1s stub still installed
  -- (`select false`) a start would happily open a second hunt beside a live
  -- one, and §7(c) would be grading a constant.
  if position('party_hunt' in (select p.prosrc from pg_proc p
                                 join pg_namespace n on n.oid = p.pronamespace
                                where n.nspname = 'public' and p.proname = 'hr_party_hunt_live')) = 0 then
    raise exception 'PRECONDITION: hr_party_hunt_live is still S1s stub. S2 file 1 gives it its real body, and party_hunt_running is vacuous until it does.';
  end if;
  if position('''party''' in (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                               where n.nspname = 'public' and p.proname = 'hr_rpc_gate')) = 0 then
    raise exception 'PRECONDITION: hr_rpc_gate does not admit the `party` bucket — an unknown bucket fails CLOSED, so these verbs would ship green and dead.';
  end if;
end $$;

-- ── 2. hr_party_hunt_start — LEADER ONLY, 2..4, ALL-OR-NOTHING ────────────
-- §18.1: *"Kaya picks Wolves, a stance and stop rules, and taps Start with
-- team. Only the leader may start."*
--
-- THE BUCKET IS `party`, NOT `activity`, AND IT IS A NARROWING. §18.3's table
-- puts the two hunt verbs on `activity`; `activity` is the bucket every
-- `collectsFirst` COMBAT verb of a character's own shares, and admitting a
-- party verb to it lets one leader's start/stop storm spend three other
-- players' own activity budget. `party` (12/min, file 1 of the S1 batch) is the
-- bucket every other hr_party_* verb already gates on, it is strictly narrower,
-- and under B-A1's ruling the binding clamp is not the bucket at all — it is
-- the eight boundaries, which no bucket can express because it is per PARTY.
create or replace function public.hr_party_hunt_start(
  p_slot      int,
  p_active_id text,
  p_stance    text,
  p_stop      jsonb,
  p_idem      uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $fn$
declare
  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, -1);
  v_prev   text;
  v_out    jsonb;
  v_pid    uuid;
  v_party  public.party%rowtype;
  v_live   bigint;
  v_lo     int;
  v_hi     int;
  v_at     timestamptz;
  v_stance text;
  v_stop   jsonb;
  v_hunt   uuid;
  v_spent  int;
  v_m      record;
  c_spread constant int      := 10;   -- §18.1: TEN combat levels, written once there
  c_min    constant int      := 2;    -- §18.1: party size 2..4
  c_span   constant interval := interval '24 hours';  -- the accrual absence cap
begin
  -- THE SHARED PRELUDE, IN S1's ORDER AND FOR S1's REASONS (file 2 §1):
  -- uid, gate, slot, character, key — each before any budget is spent, and a
  -- refusal before the claim leaves the key usable.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('party') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if v_slot < 0 or v_slot > 5 then
    perform public.hr_record_rejection(v_uid, 0, 'party_hunt_start', 'bad_slot', jsonb_build_object('slot', p_slot));
    return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'no_character', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if p_idem is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'bad_party', jsonb_build_object('why', 'null idempotency key'));
    return jsonb_build_object('ok', false, 'error', 'bad_party'); end if;

  select result, intent into v_out, v_prev
    from public.player_intents where user_id = v_uid and intent_id = p_idem;
  if found then
    if v_prev is distinct from 'party_hunt_start' then
      perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'intent_mismatch',
        jsonb_build_object('stored', v_prev, 'sent', 'party_hunt_start'));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch'); end if;
    if v_out is null then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
    return v_out || jsonb_build_object('replayed', true);
  end if;

  v_pid := public.hr_party_of(v_uid, v_slot);
  if v_pid is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'not_in_party', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'not_in_party'); end if;
  if public.hr_party_role(v_pid, v_uid, v_slot) is distinct from 'leader' then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'not_party_leader', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'not_party_leader'); end if;

  -- ★ THE PARTY ROW LOCK. Everything from here to the writes is serialised
  --   against an accept, a leave, a kick and another start on the same party —
  --   which is what makes the size re-count, the spread and the invariant-8
  --   assertion real rather than advisory (T-6: a count read outside the lock
  --   is the shape the clan member-cap bug turned on).
  select * into v_party from public.party where id = v_pid for update;
  if not found or v_party.dissolved_at is not null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'unknown_party', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'unknown_party'); end if;

  -- ══ S-11's PREDICATE, AT THE OTHER DOOR ═════════════════════════════════
  -- One live hunt per party. The partial unique index is the authority (the
  -- insert below is wrapped for exactly that race); this read is what turns it
  -- into the string §18.3 names rather than a 23505 the client cannot map.
  if public.hr_party_hunt_live(v_pid) then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'party_hunt_running', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'party_hunt_running'); end if;

  -- ══ SIZE 2..4, RE-COUNTED UNDER THE LOCK (T-6) ══════════════════════════
  select count(*) into v_live from public.party_member
   where party_id = v_pid and left_at is null;
  if v_live < c_min then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'party_too_small',
      jsonb_build_object('members', v_live, 'min', c_min));
    return jsonb_build_object('ok', false, 'error', 'party_too_small',
      'detail', jsonb_build_object('members', v_live, 'min', c_min)); end if;
  if v_live > v_party.size_cap then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'party_full',
      jsonb_build_object('members', v_live, 'cap', v_party.size_cap));
    return jsonb_build_object('ok', false, 'error', 'party_full'); end if;

  -- ══ S-12's SPREAD, AT THE DOOR IT WAS WRITTEN FOR ═══════════════════════
  -- §18.1: *"checked at hunt start and again on accept, and never
  -- continuously."* Ten levels, and the number lives in §18.1 — this is the
  -- same constant hr_party_accept carries, at the same name, for the same rule.
  select min(public.hr_party_level(m.user_id, m.slot)),
         max(public.hr_party_level(m.user_id, m.slot))
    into v_lo, v_hi
    from public.party_member m
   where m.party_id = v_pid and m.left_at is null;
  if (v_hi - v_lo) > c_spread then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'party_level_spread',
      jsonb_build_object('low', v_lo, 'high', v_hi, 'max', c_spread));
    return jsonb_build_object('ok', false, 'error', 'party_level_spread',
      'detail', jsonb_build_object('low', v_lo, 'high', v_hi, 'max', c_spread)); end if;

  -- ══ NOBODY IS RECOVERING ════════════════════════════════════════════════
  -- §18.3: STATEFUL, so it carries `until` + `remaining_ms` and the client
  -- renders a countdown rather than a retry loop — `recovering`s own shape.
  select m.user_id, m.slot, ps.recovering_until into v_m
    from public.party_member m
    join public.player_state ps on ps.user_id = m.user_id and ps.slot = m.slot
   where m.party_id = v_pid and m.left_at is null
     and ps.recovering_until is not null and ps.recovering_until > now()
   order by ps.recovering_until desc limit 1;
  if v_m.user_id is not null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'party_member_recovering',
      jsonb_build_object('user', v_m.user_id, 'slot', v_m.slot, 'until', v_m.recovering_until));
    return jsonb_build_object('ok', false, 'error', 'party_member_recovering',
      'detail', jsonb_build_object('user', v_m.user_id, 'slot', v_m.slot,
        'until', v_m.recovering_until,
        'remaining_ms', floor(extract(epoch from (v_m.recovering_until - now())) * 1000))); end if;

  -- ══ THE ORDERS — M6's VOCABULARY, VALIDATED AGAINST M6's OWN AUTHORITIES ═
  -- The activity is the SERVER catalogue's, re-checked here rather than trusted
  -- because a forged monster id is a max_hp the simulation reads. Per-member
  -- skill gates are deliberately NOT applied: §18.1 says a party buys *"access
  -- to spawns a solo character of that level cannot survive"*, and that is the
  -- whole reason to have one.
  if p_active_id is null or not exists (select 1 from public.hr_activities
                                         where kind = 'combat' and activity_id = p_active_id) then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'unknown_activity',
      jsonb_build_object('kind', 'combat', 'id', p_active_id));
    return jsonb_build_object('ok', false, 'error', 'unknown_activity'); end if;
  v_stance := coalesce(nullif(p_stance, ''), 'steady');
  if not exists (select 1 from public.hr_hunt_stances where stance_id = v_stance) then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'bad_stance',
      jsonb_build_object('stance', p_stance));
    return jsonb_build_object('ok', false, 'error', 'bad_stance'); end if;
  v_stop := coalesce(p_stop, '{}'::jsonb);
  if not public.hr_hunt_stop_valid(v_stop) then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'bad_stop',
      jsonb_build_object('stop', v_stop));
    return jsonb_build_object('ok', false, 'error', 'bad_stop'); end if;

  -- ══ B-A1 — THE BOUNDARY BUDGET, AND A START IS REFUSABLE ════════════════
  -- Past the eighth there is no hunt to defer and nothing to pay on a later
  -- flush, so "land it now and pay later" has no content; and a refused start
  -- holds nobody anywhere. Read BEFORE the member scan so the terminal answer
  -- is given first rather than naming another player as the blocker when the
  -- real answer is "not again today".
  v_spent := public.hr_party_boundaries_today(v_pid);
  if not public.hr_party_boundary_room(v_pid) then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'party_settle_churn',
      jsonb_build_object('spent', v_spent));
    return jsonb_build_object('ok', false, 'error', 'party_settle_churn',
      'detail', jsonb_build_object('spent', v_spent)); end if;

  -- ══ ★ B-A6 — INVARIANT 8's EQUALITY, ASSERTED, ALL-OR-NOTHING ★ ═════════
  -- `v_at` is the live members' COMMON watermark. Every member must be exactly
  -- there; a member who is not has an open window this call cannot price, and
  -- the whole start is refused with NOTHING written. See the header for why a
  -- tolerance here would confiscate three other players' minutes.
  select max(ps.accrued_to) into v_at
    from public.party_member m
    join public.player_state ps on ps.user_id = m.user_id and ps.slot = m.slot
   where m.party_id = v_pid and m.left_at is null;

  -- A live member with no player_state row at all is uncollectable BEFORE the
  -- max is read as authoritative: the join above would silently omit them and
  -- the equality would then hold over a SHORTER set than the one the settle
  -- will re-count under the lock (§18.2.5 step 6).
  select m.user_id, m.slot into v_m
    from public.party_member m
    left join public.player_state ps on ps.user_id = m.user_id and ps.slot = m.slot
   where m.party_id = v_pid and m.left_at is null and ps.user_id is null
   order by m.user_id, m.slot limit 1;
  if v_m.user_id is not null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'member_uncollectable',
      jsonb_build_object('user', v_m.user_id, 'slot', v_m.slot, 'why', 'no_character'));
    return jsonb_build_object('ok', false, 'error', 'member_uncollectable',
      'detail', jsonb_build_object('user', v_m.user_id, 'slot', v_m.slot, 'why', 'no_character')); end if;

  if v_at is null or v_at > now() or v_at <= now() - c_span then
    -- No watermark, a watermark AHEAD of the server clock, or one past the
    -- accrual absence cap. Each is a window nothing in this call can price.
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'member_uncollectable',
      jsonb_build_object('why', case when v_at is null then 'no_watermark'
                                     when v_at > now() then 'watermark_ahead'
                                     else 'absence_cap' end, 'at', v_at));
    return jsonb_build_object('ok', false, 'error', 'member_uncollectable',
      'detail', jsonb_build_object('why', case when v_at is null then 'no_watermark'
                                               when v_at > now() then 'watermark_ahead'
                                               else 'absence_cap' end)); end if;

  select m.user_id, m.slot, ps.accrued_to into v_m
    from public.party_member m
    join public.player_state ps on ps.user_id = m.user_id and ps.slot = m.slot
   where m.party_id = v_pid and m.left_at is null
     and ps.accrued_to is distinct from v_at
   order by m.user_id, m.slot limit 1;
  if v_m.user_id is not null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'member_uncollectable',
      jsonb_build_object('user', v_m.user_id, 'slot', v_m.slot, 'why', 'window_open',
                         'accrued_to', v_m.accrued_to, 'party_at', v_at));
    return jsonb_build_object('ok', false, 'error', 'member_uncollectable',
      'detail', jsonb_build_object('user', v_m.user_id, 'slot', v_m.slot, 'why', 'window_open')); end if;

  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_idem, v_slot, 'party_hunt_start')
  on conflict (user_id, intent_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;

  -- ⚠ EVERY WRITE IS INSIDE THE SUB-BLOCK, and that is Security B3's lesson
  --   from hr_party_create: a plpgsql sub-block rollback undoes only what the
  --   sub-block CONTAINS, so a write left above it survives the handler while
  --   the handler releases the idempotency key — a free row on every lost race.
  begin
    insert into public.party_hunt (party_id, active_id, stance, stop, accrued_to)
      values (v_pid, p_active_id, v_stance, v_stop, v_at)
    returning id into v_hunt;

    -- ★ THE CROSS-USER WRITE B-A6 NAMES, AND IT IS THE POINTER ONLY.
    --   `accrued_to` is NOT in this SET list and must never be: every live
    --   member is already at `v_at` by the assertion above, so invariant 8's
    --   equality holds at the commit boundary without this function moving a
    --   watermark — and `hr_party_tick_settle` stays the only writer of either
    --   side of it. `version` is raised because the character's inputs changed
    --   and a client holding the old one must be refused its next accrue.
    update public.player_state ps
       set active_kind  = 'combat',
           active_id    = p_active_id,
           active_since = v_at,
           version      = ps.version + 1,
           updated_at   = now()
      from public.party_member m
     where m.party_id = v_pid and m.left_at is null
       and ps.user_id = m.user_id and ps.slot = m.slot;

    insert into public.party_settle_boundary (party_id, day_key, verb, user_id, slot)
      values (v_pid, public.hr_utc_day_key(now()), 'party_hunt_start', v_uid, v_slot);

    update public.party set version = version + 1 where id = v_pid;
  exception when unique_violation then
    -- `party_hunt_one_live` lost a race with a concurrent start on the same
    -- party. The index is the authority, not the read above; the key is
    -- released so an honest retry works, and every write is rolled back with it.
    delete from public.player_intents where user_id = v_uid and intent_id = p_idem;
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'party_hunt_running',
      jsonb_build_object('raced', true));
    return jsonb_build_object('ok', false, 'error', 'party_hunt_running');
  end;

  v_out := jsonb_build_object('ok', true, 'hunt_id', v_hunt, 'party_id', v_pid,
    'active_id', p_active_id, 'stance', v_stance, 'stop', v_stop,
    'accrued_to', v_at, 'members', v_live,
    'boundaries', jsonb_build_object('spent', v_spent + 1, 'cap', 8));
  update public.player_intents set result = v_out
   where user_id = v_uid and intent_id = p_idem;
  return v_out;
end $fn$;

comment on function public.hr_party_hunt_start(int, text, text, jsonb, uuid) is
  'M8 S4 (2026-09-24), §18.1 / §18.3 / B-A6. THE LEADER STARTS WITH TEAM. '
  'Leader only, 2..4 live members re-counted under the party row lock, the ten-'
  'level spread, nobody recovering, the monster/stance/stop validated against '
  'M6''s own catalogues, and §18.1''s eight-boundary budget (B-A1: a start IS a '
  'boundary). Invariant 8''s equality is ESTABLISHED BY ASSERTION — every live '
  'member must already be at one common accrued_to, and a member who is not '
  'refuses the WHOLE start member_uncollectable with nothing written anywhere. '
  'It writes the pointer and never a watermark, so hr_party_tick_settle remains '
  'the only writer of either side of invariant 8.';

-- ── 3. hr_party_hunt_stop — LEADER ONLY, AND NEVER REFUSED ────────────────
-- §18.3's cell reads *"leader, or any member for themselves (= leave)"*. The
-- parenthesis is the ruling and it is taken literally: a member who wants out
-- of the hunt calls `hr_party_leave`, which already exists, is unclamped, and
-- now carries the same boundary discipline. So this verb is LEADER ONLY —
-- narrower than the cell, one predicate to widen later, and a removed button if
-- it were ever narrowed after the panel shipped.
create or replace function public.hr_party_hunt_stop(p_slot int, p_idem uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $fn$
declare
  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, -1);
  v_prev   text;
  v_out    jsonb;
  v_pid    uuid;
  v_hunt   public.party_hunt%rowtype;
  v_forced boolean := false;
  v_notice text    := null;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('party') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if v_slot < 0 or v_slot > 5 then
    perform public.hr_record_rejection(v_uid, 0, 'party_hunt_stop', 'bad_slot', jsonb_build_object('slot', p_slot));
    return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_idem is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_stop', 'bad_party', jsonb_build_object('why', 'null idempotency key'));
    return jsonb_build_object('ok', false, 'error', 'bad_party'); end if;

  select result, intent into v_out, v_prev
    from public.player_intents where user_id = v_uid and intent_id = p_idem;
  if found then
    if v_prev is distinct from 'party_hunt_stop' then
      perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_stop', 'intent_mismatch',
        jsonb_build_object('stored', v_prev, 'sent', 'party_hunt_stop'));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch'); end if;
    if v_out is null then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
    return v_out || jsonb_build_object('replayed', true);
  end if;

  v_pid := public.hr_party_of(v_uid, v_slot);
  if v_pid is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_stop', 'not_in_party', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'not_in_party'); end if;
  if public.hr_party_role(v_pid, v_uid, v_slot) is distinct from 'leader' then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_stop', 'not_party_leader', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'not_party_leader'); end if;

  perform 1 from public.party where id = v_pid for update;
  -- ★ THE HUNT ROW LOCK — the SAME row hr_party_tick_settle takes first
  --   (§18.2.5 step 3), so a stop and a settle are serialised against each
  --   other and the window cannot end underneath a fan-out.
  select * into v_hunt from public.party_hunt
   where party_id = v_pid and ended_at is null for update;
  if not found then
    -- The string hr_party_tick_settle already answers for this condition,
    -- reused rather than re-coined.
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_stop', 'no_party_hunt', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'no_party_hunt'); end if;

  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_idem, v_slot, 'party_hunt_stop')
  on conflict (user_id, intent_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;

  -- ══ B-A1's BOUNDARY, AND THE STOP IS NEVER REFUSED ══════════════════════
  -- A refusal here would hold four players in a hunt, which §18.1 forbids. The
  -- budget decides whether a BOUNDARY IS SPENT, never whether the hunt ends.
  if public.hr_party_settle_current(v_pid) and public.hr_party_boundary_room(v_pid) then
    v_forced := true;
  else
    -- §18.3: *"Leaving now — your share of this window pays on the next
    -- settle."* Not a refusal. `ended_at` makes hr_partied false, invariant 7
    -- stops excluding these characters, and the per-character roster prices
    -- each of them from their own player_state.accrued_to — which invariant 8
    -- has kept equal to the party watermark — so the residual is paid ONCE.
    v_notice := 'party_settle_churn';
  end if;

  -- The pointer rows are DELIBERATELY UNTOUCHED (see the header): active_kind
  -- is an input the open window is priced from, and writing it here without a
  -- collect is the confiscation CLAUDE.md §3 rule 3 names.
  update public.party_hunt
     set ended_at = now(), stopped_by = 'leader', version = version + 1
   where id = v_hunt.id and ended_at is null;

  if v_forced then
    insert into public.party_settle_boundary (party_id, day_key, verb, user_id, slot)
      values (v_pid, public.hr_utc_day_key(now()), 'party_hunt_stop', v_uid, v_slot);
  end if;
  update public.party set version = version + 1 where id = v_pid;

  v_out := jsonb_build_object('ok', true, 'stopped', true, 'hunt_id', v_hunt.id,
    'party_id', v_pid, 'boundary_forced', v_forced);
  if v_notice is not null then v_out := v_out || jsonb_build_object('notice', v_notice); end if;
  update public.player_intents set result = v_out
   where user_id = v_uid and intent_id = p_idem;
  return v_out;
end $fn$;

comment on function public.hr_party_hunt_stop(int, uuid) is
  'M8 S4 (2026-09-24), §18.1 / §18.3 / B-A1. THE LEADER STOPS THE HUNT, and it '
  'is NEVER refused: a refusal would hold four players in a hunt, which §18.1 '
  'forbids as unconditionally as it forbids holding one in a party. The budget '
  'decides only whether a BOUNDARY IS SPENT; past the eighth the stop lands and '
  'the answer carries notice=party_settle_churn, the last window riding the '
  'tick''s own cadence. Writes party_hunt and the boundary journal and NOTHING '
  'on player_state — idling a member here would confiscate the residual window '
  'this verb cannot collect.';

-- ── 4. GRANTS — `authenticated` ONLY, REVOKE BEFORE GRANT ─────────────────
-- create-or-replace preserves an ACL, so the revoke is what makes a re-apply
-- converge on the same two grants whatever the previous ACL was. The
-- client-surface record is file 3; between this file and that one the nightly
-- detector raises on unapproved_client_rpcs (S-14), which is why they are one
-- batch applied in one sitting.
revoke execute on function public.hr_party_hunt_start(int, text, text, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_party_hunt_start(int, text, text, jsonb, uuid) to authenticated;
revoke execute on function public.hr_party_hunt_stop(int, uuid)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_party_hunt_stop(int, uuid) to authenticated;

-- ── 5. hr_party_kick AND hr_party_leave — RESTATED, UNDER A PIN ───────────
-- ⚠ THIS LANE REACHED FOR AN ANCHORED PATCH FIRST, AND `tests/patch-chain-
--   guard.mjs` WAS RIGHT TO REFUSE IT. Three anchors per body is exactly the
--   chain PATCH-3 exists to stop: *"a body that exists only as 'the old text
--   plus N regexes' cannot be read, reviewed or reasoned about without
--   replaying it, and each new anchor depends on what the last patch happened
--   to leave behind."* T-3 is a money-adjacent fence a reviewer has to be able
--   to READ; a guard is never loosened, skipped or waived to get green
--   (`CLAUDE.md` §2), and the RESTATEMENT-DEBT-ACK escape hatch is for a
--   one-line security fix shipping tonight, which this is not.
--
-- ── SO WHY S2 PATCHED hr_tick_roster AND THIS FILE DOES NOT ───────────────
-- 2026-09-23-m8-parties-s2-1-hunt-tables.sql §5b argued, correctly, that
-- `hr_tick_roster` is NOT tracked in tests/live-hash-drift.baseline.json, so a
-- restatement that silently reverted a parallel lane's change would be caught
-- by NOTHING. That argument is true of these two bodies as well — and §5a
-- below answers it head-on rather than by avoiding the restatement:
--
--   ★ THE PIN. Before either body is replaced, the INSTALLED text is hashed
--     comment-stripped and compared against the md5 this restatement was
--     DERIVED FROM. A body that has moved since — by a parallel lane, by a
--     hand-run fix, by anything — REFUSES THE APPLY BY NAME instead of being
--     silently overwritten. That is strictly stronger than the patch: a patch
--     whose anchor still matched would have applied cheerfully on top of a
--     change nobody in this lane had read.
--
-- The text below is 2026-09-23-m8-parties-s1-2-verbs.sql's own, verbatim, with
-- exactly three edits per body, each marked `M8 S4 T-3` and each visible in the
-- diff: one declaration, the fence itself immediately before the `left_at`
-- write, and the churn notice on the answer. The stale S1 comment that named S2
-- as T-3's owner is removed from the kick, because it is now describing code
-- that is three lines above it.
--
-- ⚠ THE PIN IS EXPECTED TO BE THE THING THAT FAILS FIRST IF ANYTHING HAS
--   DRIFTED ON PRODUCTION. Neither body is live-hash tracked, so this lane
--   CANNOT prove from the repo that production carries the same text the replay
--   does — it can only make the apply refuse if it does not. That is the
--   correct direction to fail and it is named here so the Coordinator reads a
--   pin failure as "a parallel lane touched these verbs", not as a broken file.

do $pin$
declare
  -- The md5 of each body with `--` line comments stripped, measured on the
  -- chain replay at 2026-09-23-m8-parties-s2-3-engine-allowlist.sql — i.e. the
  -- state the S4 batch is applied on top of.
  c_kick  constant text := '933cf326dd9cdc545cfb8751a4a93ad1';
  c_leave constant text := '84b3460e0bf4874e549c286037b5251c';
  v_src   text;
  v_md5   text;
  t       text;
  c_pin   text;
begin
  foreach t in array array['hr_party_kick', 'hr_party_leave'] loop
    c_pin := case when t = 'hr_party_kick' then c_kick else c_leave end;
    select p.prosrc into v_src from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = t;
    if v_src is null then
      raise exception 'PIN: public.% is absent', t; end if;
    -- ALREADY RESTATED (a re-apply, or this file run twice): the pin has
    -- nothing to say, and §5a below is a byte-identical no-op either way.
    if position('M8 S4 T-3' in v_src) > 0 then continue; end if;
    v_md5 := md5(regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g'));
    if v_md5 <> c_pin then
      raise exception 'PIN: public.% is not the body this restatement was derived from (installed %, expected %). Somebody has changed it since 2026-09-23-m8-parties-s1-2-verbs.sql, and §5a would overwrite that change without anyone reading it — neither body is tracked in tests/live-hash-drift.baseline.json, so NOTHING else in this repo would have seen it. Re-derive the restatement from the INSTALLED text before applying.', t, v_md5, c_pin;
    end if;
  end loop;
end $pin$;

-- ── 5a. hr_party_kick — S1's BODY, PLUS T-3 ───────────────────────────────
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
  -- M8 S4: the churn NOTICE §18.3 requires when a boundary is not forced.
  v_notice text := null;
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

  -- ══ T-3 — THE SETTLE RUNS, THEN THE MEMBERSHIP ROW CLOSES (M8 S4 T-3) ═══
  -- §18.4 T-3: a membership change while a hunt is live settles the open window
  -- FIRST, in the same transaction, paying EVERY member including the one being
  -- removed, and only then writes left_at. A client verb can never RUN
  -- hr_party_tick_settle — it is hr_engine's, it takes the tick's lease, and it
  -- is handed deltas the SIMULATION produced — so this ASSERTS that the collect
  -- the collectsFirst half promised actually happened, and refuses with left_at
  -- UNWRITTEN when it did not: *"the kick is never the cheaper path."*
  --
  -- ⚠ THE REFUSAL HOLDS NOBODY, which is why the kick is the ONE verb of the
  --   four that may be refused at all. The member stays in the party they are
  --   already in and the leader is told to wait; §18.1's *"no refusal can ever
  --   hold a player in a party"* is a promise to the player being REMOVED, not
  --   to the player doing the removing.
  --
  -- ⚠ AND IT SAYS ONLY THE CODE. Every other field in reach of this branch is a
  --   party_tick_lease column no caller may read — the table has no policy and
  --   no grant, and hr_party_mark is granted to nobody, precisely so that "the
  --   server picks whose world ticks, and from when" is a claim about a row
  --   somebody else wrote rather than about a request. A refusal that handed
  --   the leader the watermark would be that fence open, wearing a better error
  --   message, which is the shape S-13's invite oracle would have shipped in.
  if public.hr_party_hunt_live(v_pid) then
    if not public.hr_party_settle_current(v_pid) then
      -- The key is RELEASED so an honest retry works, exactly as
      -- hr_party_create releases it on a lost invariant-1 race.
      delete from public.player_intents where user_id = v_uid and intent_id = p_idem;
      perform public.hr_record_rejection(v_uid, v_slot, 'party_kick', 'party_settle_required',
        jsonb_build_object('party', v_pid, 'target_user', v_tu, 'target_slot', v_ts));
      return jsonb_build_object('ok', false, 'error', 'party_settle_required');
    end if;
    -- B-A1: the boundary is SPENT when there is room. Past the eighth the kick
    -- still lands, because the settle being current means the tick's own
    -- cadence provided this boundary and nobody chose its instant.
    if public.hr_party_boundary_room(v_pid) then
      insert into public.party_settle_boundary (party_id, day_key, verb, user_id, slot)
        values (v_pid, public.hr_utc_day_key(now()), 'party_kick', v_uid, v_slot);
    else
      v_notice := 'party_settle_churn';
    end if;
  end if;
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
  if v_notice is not null then
    v_out := v_out || jsonb_build_object('notice', v_notice);
  end if;
  update public.player_intents set result = v_out
   where user_id = v_uid and intent_id = p_idem;
  return v_out;
end $fn$;

-- ── 5b. hr_party_leave — S1's BODY, PLUS INVARIANT 5's BOUNDARY ───────────
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
  -- M8 S4: the churn NOTICE §18.3 requires when a boundary is not forced.
  v_notice text := null;
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
  -- ══ INVARIANT 5's BOUNDARY, AND THE LEAVE IS NEVER REFUSED (M8 S4 T-3) ══
  -- §18.1 states it twice and unconditionally: *"no refusal can ever hold a
  -- player in a party"*, and *"past the eighth boundary a leave is still
  -- honoured immediately for membership … but it is PAID at the next natural
  -- flush boundary instead of forcing one. The leaver loses nothing."*
  --
  -- So the budget decides only whether a BOUNDARY IS SPENT — never whether the
  -- member is out. When it is not spent the answer carries
  -- notice=party_settle_churn and the member leaves at once: left_at makes
  -- hr_partied false, invariant 7 stops excluding the character, and the
  -- per-character roster prices the residual from their own
  -- player_state.accrued_to — which invariant 8 has kept equal to the party
  -- watermark — so the interval is paid ONCE, by ONE path, and none is lost.
  if public.hr_party_hunt_live(v_pid) then
    if public.hr_party_settle_current(v_pid) and public.hr_party_boundary_room(v_pid) then
      insert into public.party_settle_boundary (party_id, day_key, verb, user_id, slot)
        values (v_pid, public.hr_utc_day_key(now()), 'party_leave', v_uid, v_slot);
    else
      v_notice := 'party_settle_churn';
    end if;
  end if;
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

  if v_notice is not null then
    v_out := v_out || jsonb_build_object('notice', v_notice);
  end if;
  update public.player_intents set result = v_out
   where user_id = v_uid and intent_id = p_idem;
  return v_out;
end $fn$;

-- ── 5c. THE GRANTS, RE-STATED ─────────────────────────────────────────────
-- create-or-replace preserves an ACL, so the revoke-before-grant posture is
-- what makes a re-apply converge on the same two grants whatever the previous
-- ACL was.
revoke execute on function public.hr_party_kick(int, text, uuid)
  from public, anon, service_role;
grant  execute on function public.hr_party_kick(int, text, uuid) to authenticated;
revoke execute on function public.hr_party_leave(int, uuid)
  from public, anon, service_role;
grant  execute on function public.hr_party_leave(int, uuid) to authenticated;

-- ── 6. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
-- §18-SEC.3's S4 list, EXECUTED: *"execute each refusal path and assert the
-- code: spread, recovering, member_uncollectable, party_hunt_running on accept
-- (S-11), the spread re-check on accept (S-12), and kick-before-split leaving
-- left_at unwritten when the settle cannot run."* Plus B-A6's four-member
-- all-or-nothing and B-A1's budget, each by execution. Six planted users, every
-- row rolled back at HR828 and COUNTED afterwards.
do $$
declare
  v_a constant uuid := '00000000-0000-4000-8000-0000b8040021';  -- leader
  v_b constant uuid := '00000000-0000-4000-8000-0000b8040022';
  v_c constant uuid := '00000000-0000-4000-8000-0000b8040023';
  v_d constant uuid := '00000000-0000-4000-8000-0000b8040024';  -- the 4th, made uncollectable
  v_e constant uuid := '00000000-0000-4000-8000-0000b8040025';  -- party 2's leader
  v_g constant uuid := '00000000-0000-4000-8000-0000b8040026';  -- the joiner
  v_all   uuid[]  := array['00000000-0000-4000-8000-0000b8040021',
                           '00000000-0000-4000-8000-0000b8040022',
                           '00000000-0000-4000-8000-0000b8040023',
                           '00000000-0000-4000-8000-0000b8040024',
                           '00000000-0000-4000-8000-0000b8040025',
                           '00000000-0000-4000-8000-0000b8040026']::uuid[];
  v_four  uuid[]  := array['00000000-0000-4000-8000-0000b8040021',
                           '00000000-0000-4000-8000-0000b8040022',
                           '00000000-0000-4000-8000-0000b8040023',
                           '00000000-0000-4000-8000-0000b8040024']::uuid[];
  v_r    jsonb;
  v_p    uuid;
  v_p2   uuid;
  v_inv  uuid;
  v_at   timestamptz;
  v_n    bigint;
  v_src  text;
  t      text;
  u      uuid;
  i      int;
begin
  -- (y) NOT A PAYER, PROVED BY READING THE INSTALLED BODIES. §18.5 scopes S4
  --     to the hunt POINTER — *"the settle is S2's"* — and a scope claim that
  --     lives only in a header is a scope claim nobody can check later.
  foreach t in array array['hr_party_hunt_start','hr_party_hunt_stop',
                           'hr_party_kick','hr_party_leave'] loop
    select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = t;
    if v_src is null then raise exception 'GATE(y): % did not install', t; end if;
    if v_src ~* '(hr_apply|player_ledger|player_inventory|player_equipment|player_bank|hr_tick_shadow|hr_party_tick_settle)' then
      raise exception 'GATE(y): % reaches a money surface or the settle itself. A party verb that assembles its own deltas and pays is a SECOND money writer and a SECOND settler in one move (CLAUDE.md §6, Security S-3, AWAY-12).', t;
    end if;
    if v_src ~* '(\ygold\y|\ygems\y|hearth_tokens|\yxp\y|dungeon_scrip|\ymarks\y)' then
      raise exception 'GATE(y): % names a currency or XP. Nothing in slice 4 may.', t;
    end if;
    if position('hr_rpc_gate' in v_src) = 0 then
      raise exception 'GATE(y): % is client-callable and does not reach hr_rpc_gate', t; end if;
    if position('hr_record_rejection' in v_src) = 0 then
      raise exception 'GATE(y): % journals no refusal — a refusal burst with no verb reads as ten "accrue" refusals in vitals.mjs (CLAUDE.md §3.4)', t; end if;
  end loop;

  -- (y2) THE START WRITES A POINTER AND NEVER A WATERMARK. Invariant 8 says
  --      hr_party_tick_settle is the ONLY function that moves either side of
  --      the equality, and the start ESTABLISHES that equality by asserting it.
  --      The discriminator is one column name in one UPDATE.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_party_hunt_start';
  if v_src ~* 'update\s+public\.player_state[^;]*\yaccrued_to\s*=' then
    raise exception 'GATE(y2): hr_party_hunt_start SETS player_state.accrued_to. Invariant 8 makes hr_party_tick_settle the only writer of either watermark, and stamping a member forward without collecting confiscates their elapsed window — at up to four characters at once, three of whom did not press the button (CLAUDE.md §3 rule 3, B-A6).';
  end if;
  -- …and the STOP writes no player_state at all: idling a member here would
  -- confiscate the residual window this verb cannot collect.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_party_hunt_stop';
  if v_src ~* 'update\s+public\.player_state' then
    raise exception 'GATE(y2): hr_party_hunt_stop writes player_state. active_kind is an input the open window is priced from; writing it without a collect is the confiscation CLAUDE.md §3 rule 3 names.';
  end if;

  -- (y3) BOTH PATCHES ARE IN, EXACTLY ONCE EACH, AND BOTH CALL THE FENCE.
  foreach t in array array['hr_party_kick','hr_party_leave'] loop
    select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = t;
    if (length(v_src) - length(replace(v_src, 'M8 S4 T-3', ''))) / length('M8 S4 T-3') <> 1 then
      raise exception 'GATE(y3): %s T-3 sentinel appears % time(s), not once — the patch did not apply, or applied twice', t,
        (length(v_src) - length(replace(v_src, 'M8 S4 T-3', ''))) / length('M8 S4 T-3'); end if;
    if position('hr_party_settle_current' in v_src) = 0
       or position('hr_party_hunt_live' in v_src) = 0 then
      raise exception 'GATE(y3): % does not reach hr_party_settle_current and hr_party_hunt_live. Invariant 5 is then unimplemented and T-3 is a comment.', t; end if;
  end loop;
  -- The kick REFUSES and the leave does NOT: the asymmetry is the whole of the
  -- B-A1 ruling and it is asserted rather than described.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_party_kick';
  if position('party_settle_required' in v_src) = 0 then
    raise exception 'GATE(y3): hr_party_kick cannot answer party_settle_required. T-3: the kick is never the cheaper path.'; end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_party_leave';
  if position('party_settle_required' in v_src) > 0 then
    raise exception 'GATE(y3): hr_party_leave can answer party_settle_required. §18.1 states it twice and unconditionally: no refusal can ever hold a player in a party.'; end if;

  -- (x) THE GRANT MATRIX, PER ROLE, ON THE FOUR CLIENT VERBS.
  foreach t in array array['public.hr_party_hunt_start(integer,text,text,jsonb,uuid)',
                           'public.hr_party_hunt_stop(integer,uuid)',
                           'public.hr_party_kick(integer,text,uuid)',
                           'public.hr_party_leave(integer,uuid)'] loop
    if not has_function_privilege('authenticated', t, 'execute') then
      raise exception 'GATE(x): `authenticated` cannot call % — the verb ships dead', t; end if;
    if has_function_privilege('anon', t, 'execute')
       or has_function_privilege('service_role', t, 'execute') then
      raise exception 'GATE(x): % is executable by anon or service_role. Every one derives its actor from auth.uid(), which anon does not have and service_role bypasses.', t; end if;
    if exists (select 1 from pg_roles where rolname = 'hr_engine')
       and has_function_privilege('hr_engine', t, 'execute') then
      raise exception 'GATE(x): % is executable by hr_engine. This batch grants NOTHING to the engine.', t; end if;
    if exists (select 1 from pg_roles where rolname = 'hr_tick')
       and has_function_privilege('hr_tick', t, 'execute') then
      raise exception 'GATE(x): % is executable by hr_tick', t; end if;
  end loop;

  begin  -- ── SUBTRANSACTION: everything below is rolled back at HR828 ──────
    foreach u in array v_all loop
      insert into auth.users (id) values (u);
      perform set_config('request.jwt.claim.sub', u::text, true);
      if coalesce(public.hr_create_character(0)->>'ok','') <> 'true' then
        raise exception 'GATE: no probe character for %', u; end if;
      perform public.claim_display_name('Probe ' || substring(u::text, 30));
    end loop;

    -- ══ (g) THE `party` BUCKET ADMITS THE NEW VERBS, AND IT BITES ═════════
    --     An UNKNOWN bucket returns FALSE from hr_rpc_gate, so a verb whose
    --     bucket was lost in a restatement ships green and DEAD. Run FIRST, on
    --     a clean counter, so every later reset is a convenience rather than a
    --     hiding place (guard-hygiene R3).
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_party_hunt_start(0, 'slime', 'steady', '{}'::jsonb, gen_random_uuid());
    if coalesce(v_r->>'error','') = 'rate_limited' then
      raise exception 'GATE(g): the FIRST hr_party_hunt_start call answered rate_limited — the `party` bucket does not admit this verb and it ships green and dead'; end if;
    for i in 1 .. 14 loop
      v_r := public.hr_party_hunt_stop(0, gen_random_uuid());
    end loop;
    if coalesce(v_r->>'error','') <> 'rate_limited' then
      raise exception 'GATE(g): the 15th `party`-bucket call in one minute answered % rather than rate_limited — the flood fence is not on these verbs', v_r; end if;
    delete from public.hr_rate_counters where user_id = any (v_all);

    -- ══ THE FOUR-MEMBER PARTY ════════════════════════════════════════════
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_party_create(0, gen_random_uuid());
    v_p := (v_r->>'party_id')::uuid;
    if v_p is null then raise exception 'GATE: could not form the probe party: %', v_r; end if;
    foreach u in array array[v_b, v_c, v_d]::uuid[] loop
      perform set_config('request.jwt.claim.sub', v_a::text, true);
      v_r := public.hr_party_invite(0, 'Probe ' || substring(u::text, 30), gen_random_uuid());
      if coalesce(v_r->>'ok','') <> 'true' then
        raise exception 'GATE: the probe invite was refused %', v_r; end if;
      select id into v_inv from public.party_invite
       where party_id = v_p and user_id = u and slot = 0
         and accepted_at is null and revoked_at is null;
      perform set_config('request.jwt.claim.sub', u::text, true);
      v_r := public.hr_party_accept(0, v_inv, gen_random_uuid());
      if coalesce(v_r->>'ok','') <> 'true' then
        raise exception 'GATE: the probe accept was refused %', v_r; end if;
      delete from public.hr_rate_counters where user_id = any (v_all);
    end loop;
    perform set_config('request.jwt.claim.sub', v_a::text, true);

    -- One common watermark, which is the state a collect-first half leaves
    -- behind and the state invariant 8's equality is asserted against.
    v_at := date_trunc('second', now()) - interval '30 seconds';
    update public.player_state set accrued_to = v_at where user_id = any (v_four) and slot = 0;

    -- ══ (a) NOT THE LEADER ═══════════════════════════════════════════════
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_r := public.hr_party_hunt_start(0, 'slime', 'steady', '{}'::jsonb, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'not_party_leader' then
      raise exception 'GATE(a): a NON-LEADER started the party hunt: %. §18.1: "Only the leader may start."', v_r; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);

    -- ══ (b) THE ORDERS ARE VALIDATED AGAINST M6's OWN CATALOGUES ═════════
    v_r := public.hr_party_hunt_start(0, 'not_a_monster', 'steady', '{}'::jsonb, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'unknown_activity' then
      raise exception 'GATE(b): a forged monster id answered % — max_hp is read from this row by the simulation', v_r; end if;
    v_r := public.hr_party_hunt_start(0, 'slime', 'berserk', '{}'::jsonb, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'bad_stance' then
      raise exception 'GATE(b): a stance with no row in hr_hunt_stances answered %', v_r; end if;
    v_r := public.hr_party_hunt_start(0, 'slime', 'steady', '{"hours": 99}'::jsonb, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'bad_stop' then
      raise exception 'GATE(b): hours=99 against STOP_BOUNDS'' max of 24 answered %. A value outside a bound is REFUSED, never clamped.', v_r; end if;
    delete from public.hr_rate_counters where user_id = any (v_all);

    -- ══ (c) S-12's SPREAD, AT HUNT START ═════════════════════════════════
    --     Ten levels, §18.1's number. The probe is raised by XP because
    --     hr_party_level reads the SERVER's skill rows — a level asserted any
    --     other way would be grading this arm's own arithmetic.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_d, 0, 'attack', 5000000), (v_d, 0, 'strength', 5000000),
             (v_d, 0, 'defense', 5000000), (v_d, 0, 'hitpoints', 5000000)
    on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    if public.hr_party_level(v_d, 0) - public.hr_party_level(v_a, 0) <= 10 then
      raise exception 'GATE(c) CANNOT RUN: the raised probe is only % levels above the leader', public.hr_party_level(v_d, 0) - public.hr_party_level(v_a, 0); end if;
    v_r := public.hr_party_hunt_start(0, 'slime', 'steady', '{}'::jsonb, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'party_level_spread' then
      raise exception 'GATE(c): a party spanning more than ten combat levels started anyway: %. S-12 checks the spread at START and again on accept, and never continuously.', v_r; end if;
    delete from public.player_skills where user_id = v_d and slot = 0
      and skill_id in ('attack','strength','defense','hitpoints');

    -- ══ (d) A RECOVERING MEMBER ══════════════════════════════════════════
    update public.player_state set recovering_until = now() + interval '5 minutes'
     where user_id = v_c and slot = 0;
    v_r := public.hr_party_hunt_start(0, 'slime', 'steady', '{}'::jsonb, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'party_member_recovering' then
      raise exception 'GATE(d): a party with a knocked-out member started anyway: %', v_r; end if;
    if (v_r#>>'{detail,user}')::uuid is distinct from v_c
       or (v_r#>>'{detail,remaining_ms}')::bigint is null then
      raise exception 'GATE(d): party_member_recovering named % with remaining_ms %. §18.3: it is STATEFUL and carries until + remaining_ms so the client renders a COUNTDOWN rather than a retry loop.', v_r#>>'{detail,user}', v_r#>>'{detail,remaining_ms}'; end if;
    update public.player_state set recovering_until = null where user_id = v_c and slot = 0;
    delete from public.hr_rate_counters where user_id = any (v_all);

    -- ══ ★ (e) B-A6 — member_uncollectable ACROSS FOUR MEMBERS, ALL-OR-
    --         NOTHING, AND THE ASSERTION IS THAT **ZERO ROWS** ARE WRITTEN ★
    --     §18-SEC-2.2 B-A6: *"S4's self-check must EXECUTE that a
    --     member_uncollectable on any one member leaves all four windows
    --     intact and no left_at, no pointer and no watermark written — the
    --     refusal table already promises exactly that, and a promise in a
    --     table is not a §4 block."*
    update public.player_state set accrued_to = v_at - interval '4 minutes'
     where user_id = v_d and slot = 0;
    v_r := public.hr_party_hunt_start(0, 'slime', 'careful', '{"hours": 6}'::jsonb, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'member_uncollectable' then
      raise exception 'GATE(e): a start with ONE member''s window still open answered %. The equality invariant 8 needs has to be ESTABLISHED, and admitting that member would stamp three other players forward without collecting them.', v_r; end if;
    if (v_r#>>'{detail,user}')::uuid is distinct from v_d
       or coalesce(v_r#>>'{detail,why}','') <> 'window_open' then
      raise exception 'GATE(e): member_uncollectable named % / % rather than the fourth member and window_open — the panel has to say WHOSE session could not be priced', v_r#>>'{detail,user}', v_r#>>'{detail,why}'; end if;
    -- ★ ZERO ROWS. Not "the hunt did not start" — nothing anywhere.
    if exists (select 1 from public.party_hunt where party_id = v_p) then
      raise exception 'GATE(e): the refused start left a party_hunt row behind'; end if;
    if exists (select 1 from public.party_settle_boundary where party_id = v_p) then
      raise exception 'GATE(e): the refused start SPENT a boundary. Eight a day is the whole clamp; a refusal that spends one is a denial-of-service on the party''s own budget.'; end if;
    select count(*) into v_n from public.player_state
     where user_id = any (v_four) and slot = 0
       and (active_kind is distinct from 'idle' or active_id is not null);
    if v_n <> 0 then
      raise exception 'GATE(e): the refused start moved % member pointer(s). B-A6: no left_at, no pointer and no watermark written.', v_n; end if;
    if exists (select 1 from public.player_state
                where user_id = any (v_four) and slot = 0
                  and accrued_to is distinct from (case when user_id = v_d
                                                        then v_at - interval '4 minutes' else v_at end)) then
      raise exception 'GATE(e): the refused start moved a member watermark. All four windows must be INTACT.'; end if;
    if exists (select 1 from public.party_member where party_id = v_p and left_at is not null) then
      raise exception 'GATE(e): the refused start closed a membership row'; end if;
    update public.player_state set accrued_to = v_at where user_id = v_d and slot = 0;
    delete from public.hr_rate_counters where user_id = any (v_all);

    -- ══ (f) THE HAPPY PATH — AND INVARIANT 8 HOLDS AT THE COMMIT BOUNDARY ═
    v_r := public.hr_party_hunt_start(0, 'slime', 'careful', '{"hours": 6}'::jsonb, gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' then
      raise exception 'GATE(f): the happy-path start was refused %', v_r; end if;
    if not public.hr_party_hunt_live(v_p) then
      raise exception 'GATE(f): the start answered ok and opened no live hunt'; end if;
    select count(*) into v_n from public.party_hunt h
     where h.party_id = v_p and h.ended_at is null
       and h.accrued_to = v_at and h.stance = 'careful' and h.stop = '{"hours": 6}'::jsonb
       and h.active_id = 'slime';
    if v_n <> 1 then
      raise exception 'GATE(f): the hunt row does not carry the orders and the common watermark the start was given'; end if;
    select count(*) into v_n from public.player_state
     where user_id = any (v_four) and slot = 0
       and active_kind = 'combat' and active_id = 'slime' and accrued_to = v_at;
    if v_n <> 4 then
      raise exception 'GATE(f): % of 4 members carry the party pointer AND the common watermark. Invariant 8: player_state.accrued_to = party_hunt.accrued_to for every partied character, at every commit boundary.', v_n; end if;
    -- …and hr_partied is now TRUE for all four, which is what takes them off
    -- the per-character roster (invariant 7).
    select count(*) into v_n from unnest(v_four) x where public.hr_partied(x, 0);
    if v_n <> 4 then
      raise exception 'GATE(f): hr_partied is true for % of 4 members — the per-character roster would serve a partied character and pay one member the whole party stream', v_n; end if;
    if public.hr_party_boundaries_today(v_p) <> 1 then
      raise exception 'GATE(f): the start spent % boundaries, not 1. B-A1: a start IS a boundary.', public.hr_party_boundaries_today(v_p); end if;

    -- ══ (h) A SECOND START IS party_hunt_running ═════════════════════════
    v_r := public.hr_party_hunt_start(0, 'slime', 'steady', '{}'::jsonb, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'party_hunt_running' then
      raise exception 'GATE(h): a party with a LIVE hunt started a second one: %', v_r; end if;
    if (select count(*) from public.party_hunt where party_id = v_p) <> 1 then
      raise exception 'GATE(h): a refused second start left a second party_hunt row'; end if;

    -- ══ ★ (i) T-3 — KICK-BEFORE-SPLIT, WITH THE SETTLE UNABLE TO RUN ★ ═══
    --     There is no party_tick_lease row, so hr_party_mark is NULL and
    --     hr_party_settle_current is FALSE: the collect the collectsFirst half
    --     promised did not happen. The kick must refuse and leave the
    --     membership LIVE.
    if public.hr_party_settle_current(v_p) then
      raise exception 'GATE(i) CANNOT RUN: the open window already reads as settled'; end if;
    v_r := public.hr_party_kick(0, 'Probe ' || substring(v_d::text, 30), gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'party_settle_required' then
      raise exception 'GATE(i): T-3 FAILED — a kick during a live hunt whose window CANNOT be settled answered %. The leader kicks at minute 59 of a sixty-minute window and the removed member loses the fellowship bonus and the XP floor for all of it: the kick must never be the cheaper path.', v_r; end if;
    -- ⚠ AND THE REFUSAL DISTINGUISHES NOTHING IT MUST NOT. party_tick_lease is
    --   readable by NO role and hr_party_mark is granted to nobody, precisely so
    --   that "the server picks whose world ticks, and from when" is a claim
    --   about a row somebody else wrote rather than about a request. A refusal
    --   that hands the leader the watermark, the lease or the mode is that
    --   fence open wearing a better error message — which is exactly the shape
    --   S-13's invite oracle would have shipped in.
    if (select array(select jsonb_object_keys(v_r) order by 1)) <> array['error','ok'] then
      raise exception 'GATE(i): the party_settle_required refusal carries % — it may carry the code and nothing else, because every other field in reach of that branch is a party_tick_lease column no caller may read.', v_r;
    end if;
    if not exists (select 1 from public.party_member
                    where party_id = v_p and user_id = v_d and slot = 0 and left_at is null) then
      raise exception 'GATE(i): the REFUSED kick wrote left_at anyway. §18-SEC.3 S4: left_at must be UNWRITTEN when the settle cannot run — a refusal that removes the member is the kick succeeding with an error message stapled to it.'; end if;
    if public.hr_party_boundaries_today(v_p) <> 1 then
      raise exception 'GATE(i): the refused kick spent a boundary'; end if;
    -- …and the key was RELEASED, so an honest retry works.
    if exists (select 1 from public.player_intents where user_id = v_a and intent = 'party_kick') then
      raise exception 'GATE(i): the refused kick kept its idempotency key — the leader can never retry it'; end if;

    -- ══ (j) …AND ONCE THE SETTLE HAS RUN, THE SAME KICK LANDS ════════════
    --     The lease row with a shadow mark at `now()` is what a party the tick
    --     has just settled looks like in SHADOW. A fence that only ever
    --     refuses is not a fence.
    insert into public.party_tick_lease (party_id, shadow_accrued_to)
      values (v_p, now()) on conflict (party_id) do update set shadow_accrued_to = now();
    if not public.hr_party_settle_current(v_p) then
      raise exception 'GATE(j) CANNOT RUN: a party settled at now() does not read as settled'; end if;
    v_r := public.hr_party_kick(0, 'Probe ' || substring(v_d::text, 30), gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' then
      raise exception 'GATE(j): the kick was refused after the settle ran: %', v_r; end if;
    if exists (select 1 from public.party_member
                where party_id = v_p and user_id = v_d and slot = 0 and left_at is null) then
      raise exception 'GATE(j): the kick answered ok and left the membership live'; end if;
    if public.hr_party_boundaries_today(v_p) <> 2 then
      raise exception 'GATE(j): the kick spent % boundaries in total, wanted 2 (start + kick)', public.hr_party_boundaries_today(v_p); end if;
    delete from public.hr_rate_counters where user_id = any (v_all);

    -- ══ (k) A LEAVE IS NEVER REFUSED, AND PAST THE BUDGET IT SAYS SO ═════
    --     Fill the budget to the ceiling, then have a member leave during the
    --     live hunt. §18.1: "past the eighth a leave is still honoured
    --     immediately for membership … but it is PAID at the next natural
    --     flush boundary instead of forcing one."
    insert into public.party_settle_boundary (party_id, day_key, verb, user_id, slot)
      select v_p, public.hr_utc_day_key(now()), 'party_leave', v_a, 0 from generate_series(1, 6);
    if public.hr_party_boundary_room(v_p) then
      raise exception 'GATE(k) CANNOT RUN: the party still has budget at eight boundaries'; end if;
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    v_r := public.hr_party_leave(0, gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' or coalesce(v_r->>'notice','') <> 'party_settle_churn' then
      raise exception 'GATE(k): a leave past the eighth boundary answered %. It must LAND, with notice=party_settle_churn — no refusal can ever hold a player in a party, and the leaver loses nothing because their own accrued_to is still the party watermark.', v_r; end if;
    if public.hr_party_of(v_c, 0) is not null then
      raise exception 'GATE(k): the leave answered ok and left the member in the party'; end if;
    if public.hr_party_boundaries_today(v_p) <> 8 then
      raise exception 'GATE(k): a leave past the ceiling SPENT a ninth boundary (%) — the lever is re-opened one leave at a time', public.hr_party_boundaries_today(v_p); end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);

    -- ══ (l) THE STOP IS NEVER REFUSED EITHER, AND IT ENDS THE HUNT ═══════
    v_r := public.hr_party_hunt_stop(0, gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' or coalesce(v_r->>'notice','') <> 'party_settle_churn' then
      raise exception 'GATE(l): a stop past the eighth boundary answered %. A refusal here holds FOUR players in a hunt, which §18.1 forbids as unconditionally as it forbids holding one in a party.', v_r; end if;
    if public.hr_party_hunt_live(v_p) then
      raise exception 'GATE(l): the stop answered ok and the hunt is still live'; end if;
    if (v_r->>'boundary_forced')::boolean is distinct from false
       or public.hr_party_boundaries_today(v_p) <> 8 then
      raise exception 'GATE(l): the stop past the ceiling spent a ninth boundary'; end if;
    -- …and it left every pointer alone, because idling a member here would
    -- confiscate the residual window this verb cannot collect.
    select count(*) into v_n from public.player_state
     where user_id = any (array[v_a, v_b]::uuid[]) and slot = 0 and active_kind = 'combat';
    if v_n <> 2 then
      raise exception 'GATE(l): the stop changed a member pointer'; end if;
    v_r := public.hr_party_hunt_stop(0, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'no_party_hunt' then
      raise exception 'GATE(l): stopping a hunt that is not running answered %', v_r; end if;
    delete from public.hr_rate_counters where user_id = any (v_all);

    -- ══ (m) B-A1 — A START PAST THE EIGHTH IS REFUSED party_settle_churn ══
    update public.player_state set accrued_to = v_at
     where user_id = any (array[v_a, v_b]::uuid[]) and slot = 0;
    v_r := public.hr_party_hunt_start(0, 'slime', 'steady', '{}'::jsonb, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'party_settle_churn' then
      raise exception 'GATE(m): B-A1 FAILED — a start past the eighth boundary answered %. §18.1 prices the BOUNDARY and not the VERB, and a start closes FOUR characters'' windows at an instant the leader chooses.', v_r; end if;
    if exists (select 1 from public.party_hunt where party_id = v_p and ended_at is null) then
      raise exception 'GATE(m): the refused start opened a hunt anyway'; end if;

    -- ══ (n) A PARTY OF ONE MAY NOT START ═════════════════════════════════
    delete from public.party_settle_boundary where party_id = v_p;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    perform public.hr_party_leave(0, gen_random_uuid());
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_party_hunt_start(0, 'slime', 'steady', '{}'::jsonb, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'party_too_small' then
      raise exception 'GATE(n): a party of ONE started a hunt: %. §18.1 fixes party size at 2..4, and a party of one is a real state a player reaches by their friends leaving — answering it bad_party would tell them to file a bug.', v_r; end if;
    delete from public.hr_rate_counters where user_id = any (v_all);

    -- ══ (o) S-11 — hr_party_accept IS REFUSED AGAINST THE **REAL**
    --        hr_party_hunt_live, AND S1's CALL SITE IS ASSERTED BY TEXT ════
    select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'hr_party_accept';
    if position('hr_party_hunt_live' in v_src) = 0
       or position('party_hunt_running' in v_src) = 0 then
      raise exception 'GATE(o): hr_party_accept no longer calls hr_party_hunt_live and answers party_hunt_running. S1 shipped the call site against a stub precisely so that this refusal would start firing the day the predicate became real, and it is real now.'; end if;
    perform set_config('request.jwt.claim.sub', v_e::text, true);
    v_r := public.hr_party_create(0, gen_random_uuid());
    v_p2 := (v_r->>'party_id')::uuid;
    -- (o1) S-12 FIRST, with no hunt in the way: the spread is re-checked on
    --      EVERY accept, so a party cannot start inside the spread and then
    --      accept a level-1 alt.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_e, 0, 'attack', 5000000), (v_e, 0, 'strength', 5000000),
             (v_e, 0, 'defense', 5000000), (v_e, 0, 'hitpoints', 5000000)
    on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    v_r := public.hr_party_invite(0, 'Probe ' || substring(v_g::text, 30), gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' then raise exception 'GATE(o1) CANNOT RUN: invite refused %', v_r; end if;
    select id into v_inv from public.party_invite
     where party_id = v_p2 and user_id = v_g and slot = 0
       and accepted_at is null and revoked_at is null;
    perform set_config('request.jwt.claim.sub', v_g::text, true);
    v_r := public.hr_party_accept(0, v_inv, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'party_level_spread' then
      raise exception 'GATE(o1): S-12 FAILED — an accept more than ten combat levels outside the party answered %', v_r; end if;
    delete from public.player_skills where user_id = v_e and slot = 0
      and skill_id in ('attack','strength','defense','hitpoints');
    -- (o2) …and now S-11, against a REAL live party_hunt row.
    insert into public.party_hunt (party_id, active_id, accrued_to)
      values (v_p2, 'slime', date_trunc('second', now()) - interval '60 seconds');
    if not public.hr_party_hunt_live(v_p2) then
      raise exception 'GATE(o2) CANNOT RUN: hr_party_hunt_live is FALSE against a real live row — it is still S1s stub'; end if;
    perform set_config('request.jwt.claim.sub', v_g::text, true);
    v_r := public.hr_party_accept(0, v_inv, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'party_hunt_running' then
      raise exception 'GATE(o2): S-11 FAILED — an accept into a party with a LIVE hunt answered %. The joiner is otherwise inside the next party window with their own accrued_to days back, and the settle either wedges on them forever or confiscates their entire away window.', v_r; end if;
    if public.hr_party_of(v_g, 0) is not null then
      raise exception 'GATE(o2): the refused accept wrote a membership row anyway'; end if;

    raise exception using errcode = 'HR828', message = 'm8-parties-s4-2 §6 complete — rolling back';
  exception when sqlstate 'HR828' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (z) THE BLOCK LEAVES NO ROWS, AND THE TICK IS STILL IN SHADOW.
  if exists (select 1 from public.party_settle_boundary)
     or exists (select 1 from public.party_hunt)
     or exists (select 1 from public.party_member  where user_id = any (v_all))
     or exists (select 1 from public.party_invite  where user_id = any (v_all))
     or exists (select 1 from public.party         where leader_user = any (v_all))
     or exists (select 1 from public.player_state  where user_id = any (v_all))
     or exists (select 1 from public.player_skills where user_id = any (v_all))
     or exists (select 1 from public.player_intents where user_id = any (v_all))
     or exists (select 1 from public.hr_rejections  where user_id = any (v_all))
     or exists (select 1 from public.display_names  where user_id = any (v_all))
     or exists (select 1 from auth.users            where id = any (v_all)) then
    raise exception 'GATE(z): §6 LEAKED a probe row — a self-check may not leave player state behind (CLAUDE.md §2)';
  end if;
  select count(*) into v_n from public.hr_tick_config where id and shadow;
  if v_n <> 1 then
    raise exception 'GATE(z): hr_tick_config.shadow is not TRUE after this apply. S5 is a separate GO and its pre-arm bar is unmet by definition (§18-SEC-2.3).';
  end if;

  raise notice 'm8-parties-s4-2: the two hunt intents and T-3s kick-before-split — EXECUTED as six planted auth.uid() values: not_party_leader, unknown_activity, bad_stance, bad_stop, party_level_spread at start, party_member_recovering with its countdown, member_uncollectable across FOUR members writing ZERO rows, the happy path with invariant 8 holding for all four, party_hunt_running on a second start, T-3 refusing a kick with left_at UNWRITTEN and then admitting it once the settle had run, a leave and a stop past the eighth boundary LANDING with notice=party_settle_churn, a start past the eighth REFUSED party_settle_churn (B-A1), party_too_small, S-12 on accept and S-11 against the now-real hr_party_hunt_live; the `party` bucket admits both new verbs and bites at the 15th call; every planted row rolled back';
end $$;
