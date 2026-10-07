-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-09-party-hunt-start-gate.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. Lane C: the Coordinator applies after a
-- Security GO, via tools/apply-migration.mjs, one file. DB-ONLY: no edge half,
-- no client half (no client path calls hr_party_hunt_start today: the Party
-- screen says "Hunting together arrives in a later build", and
-- tests/codex-claims.mjs CODEX-6 goes red the day one does).
--
-- WHAT IT ANSWERS. Security P3 on the party-reaper verdict
-- (docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md, e44527a0):
--   "hr_party_hunt_start is not gated on combat being armed, and in shadow
--    nothing moves the raw mark. So a hunt started while disarmed holds its
--    members' accrue for 24 h, after which this reaper ends it."
--   hr_partied is true the moment the hunt row commits, every member's own
--   accrue then answers party_settle_required, and only hr_party_tick_settle
--   (driven by the tick, ARMED combat only) or a leave/stop/reap can release
--   them. One leader's tap holds up to four players for a day.
--
-- THE FIX: hr_party_hunt_start refuses `hunt_channel_disarmed` unless the
-- tick is ENABLED and 'combat' = any (hr_tick_config.armed_channels). The
-- refusal is journalled through hr_record_rejection (intent
-- 'party_hunt_start', code 'hunt_channel_disarmed', detail {enabled,
-- combat_armed}) like every other refusal of the verb. `enabled` is included
-- because a disabled tick moves no mark either (the kill switch disarms, but
-- an operator `enabled = false` with combat still armed is the same wedge).
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §0 refuses unless the installed hr_party_hunt_start is the live S4 body
--    (prosrc md5 34b270ca9efeb2618e746994f49fea83, read SELECT-only from
--    production 2026-10-07 and equal to the repo's 2026-09-24 file) or this
--    file's own body (7b3a81ab264a7c440afa18064141904b, a re-apply).
-- §1 restates hr_party_hunt_start(int,text,text,jsonb,uuid) — the live body
--    VERBATIM plus two declarations and ONE block, placed after the
--    idempotency replay and before party resolution. Signature, return shape,
--    SECURITY DEFINER, search_path and every other refusal unchanged.
-- §2 grants exact, revoke-first: EXECUTE for authenticated only (the live
--    ACL: postgres, authenticated). hr_client_rpc_baseline unchanged.
-- §3 self-check (executed, rolled back by a sentinel): refused while
--    disarmed / gather-only / tick disabled, for leader and member alike,
--    with NOTHING written and a journal row; the SAME key then starts once
--    combat is armed; a replay of that key still answers after a disarm;
--    grants exact; installed md5 pinned; hr_assert_grant_hygiene(true).
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
--   The gate reads the config singleton without a lock, BEFORE the party row
--   lock. A disarm racing a start can still land a hunt that the next tick
--   will not drive; that window is one statement wide and the reaper bounds
--   it (24 h, then a server Stop). Taking a share lock on hr_tick_config here
--   would serialise every start against the operator's arm/disarm for no
--   correctness the reaper does not already give. The refusal precedes the
--   key claim, so the key stays usable; a stored result is replayed first.
--
-- ── SECURITY SURFACE ────────────────────────────────────────────────────────
--   Strictly NARROWER: one more refusal on an existing client verb; no new
--   function, table, column, policy or grant. Nothing the caller sends is
--   read by the gate. The response carries only the code (no config shape
--   crosses to the client); the journal gets the two booleans. Moves no value.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
--   One primary-key read of a one-row table per start. Refusals add at most one
--   hr_rejections row per (user, slot, day, code) — the existing aggregate.
--
-- REVERSIBILITY: re-run §1 of 2026-09-24-m8-parties-s4-2-hunt-intents.sql
-- (the previous body, md5 34b270ca) — its grants are the same two.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ────────────────────────────────────────────────────────
do $$
declare
  v_md5 text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('public.hr_party_hunt_start(integer,text,text,jsonb,uuid)');
  if v_md5 is distinct from '34b270ca9efeb2618e746994f49fea83'
     and v_md5 is distinct from '7b3a81ab264a7c440afa18064141904b' then
    raise exception 'PRECONDITION: hr_party_hunt_start is %, neither the live S4 body (34b270ca) nor this file''s (7b3a81ab264a7c440afa18064141904b). '
                    'Re-cut this file against the installed body.', v_md5;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_tick_config'
                    and column_name = 'armed_channels')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'hr_tick_config'
                       and column_name = 'enabled') then
    raise exception 'PRECONDITION: hr_tick_config.armed_channels / enabled missing — apply 2026-10-06-world-tick-channel-arm.sql first';
  end if;
  if to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null then
    raise exception 'PRECONDITION: hr_record_rejection(uuid,int,text,text,jsonb,bigint) missing';
  end if;
end $$;

-- ── §1 hr_party_hunt_start, RESTATED WITH THE CHANNEL GATE ──────────────────
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
  v_mem    record;
  v_on     boolean;   -- hr_tick_config.enabled (2026-10-09 channel gate)
  v_armed  boolean;   -- 'combat' = any (hr_tick_config.armed_channels)
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

  -- ══ ★ THE CHANNEL GATE (2026-10-09, Security P3 on the party-reaper verdict,
  --     docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md) ═══════════════════
  -- A party hunt's mark moves ONLY when hr_party_tick_settle runs, and the
  -- tick drives the party path only for an ARMED combat channel on an ENABLED
  -- tick. Disarmed, nothing moves the mark, so every member's accrue is refused
  -- party_settle_required until hr_party_reap_stale ends the hunt at 24 h —
  -- up to four players held for a day by one tap. A start that cannot be
  -- ticked is therefore refused, by name, with nothing written:
  --   · AFTER the replay, so an ACCEPTED start answers its stored result in
  --     every mode (disarming never rewrites history);
  --   · BEFORE the key is claimed, so an honest retry after the arm works;
  --   · read from the config singleton, the ONLY arming authority; a missing
  --     row reads disarmed (fail closed).
  -- The code is the whole client message; the two booleans go to the journal.
  select coalesce(c.enabled, false), coalesce('combat' = any (c.armed_channels), false)
    into v_on, v_armed
    from public.hr_tick_config c where c.id;
  if not coalesce(v_on, false) or not coalesce(v_armed, false) then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'hunt_channel_disarmed',
      jsonb_build_object('enabled', coalesce(v_on, false), 'combat_armed', coalesce(v_armed, false)));
    return jsonb_build_object('ok', false, 'error', 'hunt_channel_disarmed'); end if;

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
  -- ⚠ THE DETAIL NAMES THE MEMBER BY **NAME**, NEVER BY user_id (Security E2,
  --   2026-09-24). hr_party_view's column set is FROZEN at name, combat_level,
  --   hp, hp_max, recovering_until, share_bp, xp, gold — no user_id and no slot
  --   — and S1 resolves a kick by name "and not by user id" for that reason. An
  --   auth.users id handed to a client is a stable cross-account handle that
  --   survives a rename, carries the slot with it, and is the ready-made
  --   argument for every (user, slot) predicate S1 refuses to grant. §18.3's own
  --   copy for all three of these refusals is a NAME ("Ilse is recovering",
  --   "Couldn't price Bram's last session"). The JOURNAL still gets the ids:
  --   hr_rejections is server-side and an operator needs them.
  select m.user_id, m.slot, ps.recovering_until,
         coalesce(pr.display_name, 'Adventurer') as who into v_m
    from public.party_member m
    join public.player_state ps on ps.user_id = m.user_id and ps.slot = m.slot
    left join public.profiles pr on pr.id = m.user_id
   where m.party_id = v_pid and m.left_at is null
     and ps.recovering_until is not null and ps.recovering_until > now()
   order by ps.recovering_until desc limit 1;
  if v_m.user_id is not null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'party_member_recovering',
      jsonb_build_object('user', v_m.user_id, 'slot', v_m.slot, 'until', v_m.recovering_until));
    return jsonb_build_object('ok', false, 'error', 'party_member_recovering',
      'detail', jsonb_build_object('member', v_m.who,
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
  --
  -- ⚠ AND THE COUNT NEVER CROSSES TO THE CLIENT (Security E3, 2026-09-24).
  --   File 1 grants hr_party_boundaries_today and hr_party_boundary_room to
  --   NOBODY, gives party_settle_boundary no policy and no grant, and raises in
  --   its own GATE(a) on any client privilege, for one stated reason: *"a budget
  --   a player can read is a budget a player can plan against."* Answering the
  --   number here is that fence open wearing a better error message. §18.3's own
  --   copy for this code carries no number — *"Leaving now — your share of this
  --   window pays on the next settle"* — so the CODE is the whole message, and
  --   the count stays where it belongs: in hr_rejections, server-side, where
  --   vitals.mjs --refusals reads it.
  v_spent := public.hr_party_boundaries_today(v_pid);
  if not public.hr_party_boundary_room(v_pid) then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'party_settle_churn',
      jsonb_build_object('spent', v_spent));
    return jsonb_build_object('ok', false, 'error', 'party_settle_churn'); end if;

  -- ══ ★ B-A6 — INVARIANT 8's EQUALITY, ASSERTED, ALL-OR-NOTHING ★ ═════════
  -- `v_at` is the live members' COMMON watermark. Every member must be exactly
  -- there; a member who is not has an open window this call cannot price, and
  -- the whole start is refused with NOTHING written. See the header for why a
  -- tolerance here would confiscate three other players' minutes.
  -- ★ THE MEMBER ROW LOCKS, BEFORE THE FIRST READ OF A WATERMARK (Security
  --   E1, 2026-09-24). The `party` row lock above serialises this call against
  --   an accept, a leave, a kick and another start — it does NOT serialise it
  --   against a member's OWN solo settle, which takes nothing on `party`. Until
  --   the hunt row commits `hr_partied` is FALSE for all four, so every member
  --   is still on the per-character roster and `hr_tick_settle` may move their
  --   `accrued_to` at any instant.
  --
  --   Unlocked, the equality below is asserted against a row that can change
  --   before this transaction commits, and the start would then commit with
  --   `party_hunt.accrued_to = v_at` and one member AHEAD of it — invariant 8
  --   broken at the commit boundary, by exactly the ordinary event the
  --   collect-then-start seam makes most likely (a member's own ~90 s attended
  --   accrue landing between the collect and this call). Nothing is mis-paid:
  --   hr_party_tick_settle re-asserts the equality under its own lock and
  --   REFUSES. But it refuses with `party_window_already_settled`, the same
  --   string a benign CAS refusal returns, so the hunt is wedged for all four
  --   members, for the life of the hunt, invisibly to the driver and to
  --   vitals.mjs — the §3.4 failure where a feature sits at zero and nobody
  --   can see it.
  --
  --   (user_id, slot) order is hr_party_tick_settle's own (§18.2.5 step 4/5b),
  --   so the two can only ever wait on each other, never circularly. The other
  --   direction was already closed: a solo settle that blocks HERE and commits
  --   after this one is refused `version_conflict` by the `version + 1` below.
  perform 1
    from public.player_state ps
    join public.party_member m on m.user_id = ps.user_id and m.slot = ps.slot
   where m.party_id = v_pid and m.left_at is null
   order by ps.user_id, ps.slot
     for update of ps;

  select max(ps.accrued_to) into v_at
    from public.party_member m
    join public.player_state ps on ps.user_id = m.user_id and ps.slot = m.slot
   where m.party_id = v_pid and m.left_at is null;

  -- A live member with no player_state row at all is uncollectable BEFORE the
  -- max is read as authoritative: the join above would silently omit them and
  -- the equality would then hold over a SHORTER set than the one the settle
  -- will re-count under the lock (§18.2.5 step 6).
  select m.user_id, m.slot, coalesce(pr.display_name, 'Adventurer') as who into v_m
    from public.party_member m
    left join public.player_state ps on ps.user_id = m.user_id and ps.slot = m.slot
    left join public.profiles pr on pr.id = m.user_id
   where m.party_id = v_pid and m.left_at is null and ps.user_id is null
   order by m.user_id, m.slot limit 1;
  if v_m.user_id is not null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'member_uncollectable',
      jsonb_build_object('user', v_m.user_id, 'slot', v_m.slot, 'why', 'no_character'));
    return jsonb_build_object('ok', false, 'error', 'member_uncollectable',
      'detail', jsonb_build_object('member', v_m.who, 'why', 'no_character')); end if;

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

  select m.user_id, m.slot, ps.accrued_to,
         coalesce(pr.display_name, 'Adventurer') as who into v_m
    from public.party_member m
    join public.player_state ps on ps.user_id = m.user_id and ps.slot = m.slot
    left join public.profiles pr on pr.id = m.user_id
   where m.party_id = v_pid and m.left_at is null
     and ps.accrued_to is distinct from v_at
   order by m.user_id, m.slot limit 1;
  if v_m.user_id is not null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'member_uncollectable',
      jsonb_build_object('user', v_m.user_id, 'slot', v_m.slot, 'why', 'window_open',
                         'accrued_to', v_m.accrued_to, 'party_at', v_at));
    -- …and NEVER accrued_to or party_at: those are the watermark hr_party_mark
    --   is granted to nobody precisely so a request cannot learn it.
    return jsonb_build_object('ok', false, 'error', 'member_uncollectable',
      'detail', jsonb_build_object('member', v_m.who, 'why', 'window_open')); end if;

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
    --
    -- ★ ONE MEMBER PER STATEMENT, BOUND TO A (user_id, slot) THIS CALL HOLDS
    --   (S-SC-1 family C, 2026-09-24). The join form this replaced — `update
    --   player_state ps … from party_member m where ps.user_id = m.user_id and
    --   ps.slot = m.slot` — binds the owner column to a COLUMN, so WHICH ROWS
    --   the statement reaches is decided by a join predicate sitting beside it
    --   rather than by the statement itself. Drop the `m.party_id = v_pid`
    --   conjunct, or widen that join by one table, and it becomes a write
    --   across every player in the game with no syntax error and no failing
    --   assertion. That is the family tests/selfcheck-no-global-dml.mjs refuses
    --   (and it refused this body at its §6 call sites, correctly): the reach of
    --   a cross-user write must be legible in the statement's own text. Below,
    --   the predicate names the two values this verb is holding, per row.
    --
    --   NOTHING ABOUT THE WRITE MOVES: the same SET list, over the same rows,
    --   inside the same sub-block and the same transaction — so B-A6's
    --   all-or-nothing and invariant 8's equality are exactly as reviewed.
    --   2..4 statements instead of one, on a set capped at four.
    --
    --   LOCK ORDER, UNCHANGED. The `party` row is held (the 2..4 re-count), and
    --   accept, kick and leave each take that row BEFORE touching
    --   `party_member`, so the `for update` below can only ever be waited ON,
    --   never circularly. The `player_state` rows are already locked ABOVE, in
    --   this same (user_id, slot) order (Security E1), so no update in the loop
    --   waits on a lock this call has not already taken.
    for v_mem in
      select m.user_id, m.slot
        from public.party_member m
       where m.party_id = v_pid and m.left_at is null
       order by m.user_id, m.slot
         for update of m
    loop
      update public.player_state ps
         set active_kind  = 'combat',
             active_id    = p_active_id,
             active_since = v_at,
             version      = ps.version + 1,
             updated_at   = now()
       where ps.user_id = v_mem.user_id and ps.slot = v_mem.slot;
    end loop;

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

  -- `boundaries` is DELIBERATELY ABSENT (Security E3). It was a running count
  -- of a budget file 1 fences out of every client role, beside a literal `8`
  -- that is a SECOND copy of the number hr_party_boundary_room exists to write
  -- ONCE — the four-numbers-that-can-disagree shape file 1 §3a argues against,
  -- re-introduced in the one place a client would read it.
  v_out := jsonb_build_object('ok', true, 'hunt_id', v_hunt, 'party_id', v_pid,
    'active_id', p_active_id, 'stance', v_stance, 'stop', v_stop,
    'accrued_to', v_at, 'members', v_live);
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
  'the only writer of either side of invariant 8. 2026-10-09: refused '
  'hunt_channel_disarmed unless the tick is enabled and combat is armed — '
  'nothing else moves a party mark.';

-- ── §2 GRANTS — EXACT, REVOKE FIRST ────────────────────────────────────────
revoke execute on function public.hr_party_hunt_start(int, text, text, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_party_hunt_start(int, text, text, jsonb, uuid) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    execute 'revoke execute on function public.hr_party_hunt_start(int, text, text, jsonb, uuid) from hr_engine';
  end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    execute 'revoke execute on function public.hr_party_hunt_start(int, text, text, jsonb, uuid) from hr_tick';
  end if;
end $$;

-- ── §3 SELF-CHECK (§4 of CLAUDE.md), EXECUTED AND ROLLED BACK ──────────────
do $$
declare
  v_a    uuid := '00000000-0000-4000-8000-0000000f1001';  -- leader
  v_b    uuid := '00000000-0000-4000-8000-0000000f1002';  -- member
  v_k1   uuid := '00000000-0000-4000-8000-0000000f1101';  -- the key that is refused, then starts
  v_cact text;
  v_p    uuid;
  v_inv  uuid;
  v_at   timestamptz;
  v_r    jsonb;
  v_snap jsonb;
  v_n    bigint;
  v_cfg_en boolean; v_cfg_ch text[]; v_cfg_ar text[];
  v_en     boolean; v_ch     text[]; v_ar     text[];
  r      record;
  t      text := 'public.hr_party_hunt_start(integer,text,text,jsonb,uuid)';
begin
  begin
    -- ── k0: the installed body is this file's
    if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = t::regprocedure)
       <> '7b3a81ab264a7c440afa18064141904b' then
      raise exception 'k0: the installed hr_party_hunt_start is not the one this file states';
    end if;
    if not (select prosecdef from pg_proc where oid = t::regprocedure)
       or (select proconfig from pg_proc where oid = t::regprocedure)
          is distinct from array['search_path=public, pg_catalog'] then
      raise exception 'k0: hr_party_hunt_start lost SECURITY DEFINER or its pinned search_path';
    end if;

    -- ── kg: grants exact
    if not has_function_privilege('authenticated', t, 'execute') then
      raise exception 'kg: authenticated cannot call hr_party_hunt_start — the verb ships dead';
    end if;
    for r in select c.role from (values ('public'), ('anon'), ('service_role'), ('hr_engine'), ('hr_tick')) c(role) loop
      if (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_function_privilege(r.role, t, 'execute') then
        raise exception 'kg: % holds EXECUTE on hr_party_hunt_start', r.role;
      end if;
    end loop;

    -- ── fixture: a two-member party at one common watermark
    select enabled, channels, armed_channels into v_cfg_en, v_cfg_ch, v_cfg_ar
      from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'], armed_channels = '{}' where id;
    select activity_id into v_cact from public.hr_activities where kind = 'combat' order by activity_id limit 1;
    if v_cact is null then raise exception 'k-fixture: hr_activities has no combat row'; end if;
    insert into auth.users (id) values (v_a), (v_b) on conflict do nothing;
    foreach v_inv in array array[v_a, v_b] loop
      perform set_config('request.jwt.claim.sub', v_inv::text, true);
      if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then
        raise exception 'k-fixture: no probe character for %', v_inv; end if;
      perform public.claim_display_name('Gate ' || substring(v_inv::text, 30));
    end loop;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_party_create(0, gen_random_uuid());
    v_p := (v_r->>'party_id')::uuid;
    if v_p is null then raise exception 'k-fixture: could not form the probe party: %', v_r; end if;
    v_r := public.hr_party_invite(0, 'Gate ' || substring(v_b::text, 30), gen_random_uuid());
    if coalesce(v_r->>'ok', '') <> 'true' then raise exception 'k-fixture: invite refused %', v_r; end if;
    select id into v_inv from public.party_invite
     where party_id = v_p and user_id = v_b and slot = 0 and accepted_at is null and revoked_at is null;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_r := public.hr_party_accept(0, v_inv, gen_random_uuid());
    if coalesce(v_r->>'ok', '') <> 'true' then raise exception 'k-fixture: accept refused %', v_r; end if;
    v_at := date_trunc('second', now()) - interval '30 seconds';
    update public.player_state set accrued_to = v_at where user_id in (v_a, v_b) and slot = 0;
    delete from public.hr_rate_counters where user_id in (v_a, v_b);
    select jsonb_agg(to_jsonb(ps) order by ps.user_id) into v_snap
      from public.player_state ps where ps.user_id in (v_a, v_b);

    -- ── g1: DISARMED — refused by name, nothing written, journalled
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_party_hunt_start(0, v_cact, 'steady', '{}'::jsonb, v_k1);
    if v_r is distinct from jsonb_build_object('ok', false, 'error', 'hunt_channel_disarmed') then
      raise exception 'g1: a start with combat DISARMED answered % — nothing would move its mark and the members'' accrue is held for 24 h', v_r;
    end if;
    if exists (select 1 from public.party_hunt where party_id = v_p)
       or exists (select 1 from public.player_intents where user_id = v_a and intent_id = v_k1)
       or exists (select 1 from public.party_settle_boundary where party_id = v_p)
       or (select jsonb_agg(to_jsonb(ps) order by ps.user_id) from public.player_state ps
            where ps.user_id in (v_a, v_b)) is distinct from v_snap then
      raise exception 'g1: the disarmed refusal wrote something (hunt, key, boundary or player_state)';
    end if;
    select coalesce(sum(n), 0) into v_n from public.hr_rejections
     where user_id = v_a and slot = 0 and code = 'hunt_channel_disarmed' and intent = 'party_hunt_start';
    if v_n < 1 then
      raise exception 'g1: the disarmed refusal was not journalled in hr_rejections (intent party_hunt_start)';
    end if;

    -- ── g2: GATHER-ONLY armed is still disarmed for a hunt
    update public.hr_tick_config set armed_channels = array['gather'] where id;
    v_r := public.hr_party_hunt_start(0, v_cact, 'steady', '{}'::jsonb, v_k1);
    if v_r->>'error' is distinct from 'hunt_channel_disarmed' then
      raise exception 'g2: a start with only GATHER armed answered %', v_r;
    end if;

    -- ── g3: combat armed but the tick DISABLED
    update public.hr_tick_config set enabled = false, armed_channels = array['combat'] where id;
    v_r := public.hr_party_hunt_start(0, v_cact, 'steady', '{}'::jsonb, v_k1);
    if v_r->>'error' is distinct from 'hunt_channel_disarmed' then
      raise exception 'g3: a start with the tick DISABLED answered %', v_r;
    end if;

    -- ── g4: any other start (the member) is refused the same way
    update public.hr_tick_config set enabled = true, armed_channels = '{}' where id;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_r := public.hr_party_hunt_start(0, v_cact, 'steady', '{}'::jsonb, gen_random_uuid());
    if v_r->>'error' is distinct from 'hunt_channel_disarmed' then
      raise exception 'g4: a member''s start while disarmed answered %', v_r;
    end if;
    delete from public.hr_rate_counters where user_id in (v_a, v_b);

    -- ── a1: combat ARMED — the SAME key starts (the refusals never claimed it)
    update public.hr_tick_config set armed_channels = array['combat'] where id;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_party_hunt_start(0, v_cact, 'steady', '{}'::jsonb, v_k1);
    if coalesce(v_r->>'ok', '') <> 'true'
       or not exists (select 1 from public.party_hunt where party_id = v_p and ended_at is null)
       or (select count(*) from public.player_state
            where user_id in (v_a, v_b) and slot = 0 and active_kind = 'combat' and active_id = v_cact) <> 2 then
      raise exception 'a1: with combat armed the start (same key) answered % — the gate refuses an armed start or the key was consumed', v_r;
    end if;

    -- ── a2: a replay of the accepted key answers its stored result after a disarm
    update public.hr_tick_config set armed_channels = '{}' where id;
    v_r := public.hr_party_hunt_start(0, v_cact, 'steady', '{}'::jsonb, v_k1);
    if coalesce(v_r->>'ok', '') <> 'true' or coalesce(v_r->>'replayed', '') <> 'true' then
      raise exception 'a2: replaying an accepted start after a disarm answered % — the gate must sit after the replay', v_r;
    end if;

    perform set_config('request.jwt.claim.sub', '', true);
    perform public.hr_assert_grant_hygiene(true);

    -- ── kr
    update public.hr_tick_config
       set armed_channels = v_cfg_ar, enabled = v_cfg_en, channels = v_cfg_ch where id;
    select armed_channels, enabled, channels into v_ar, v_en, v_ch from public.hr_tick_config where id;
    if v_ar is distinct from v_cfg_ar or v_en is distinct from v_cfg_en or v_ch is distinct from v_cfg_ch then
      raise exception 'kr: hr_tick_config was not restored';
    end if;

    raise exception 'HR1009G_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1009G_ROLLBACK_OK' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'party-hunt-start-gate: EXECUTED — a start is refused hunt_channel_disarmed (disarmed, gather-only, '
               'tick disabled; leader and member), nothing written, journalled; the same key starts once combat '
               'is armed; an accepted start replays after a disarm; grants exact; hygiene strict — all green';
end $$;
