-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-23-m8-parties-s2-2-roster-settle.sql — M8 SLICE 2, FILE 2 OF 3:
--   THE ROSTER SIBLING AND THE ONE-CALL, ALL-OR-NOTHING PARTY SETTLE.
--
-- Design: docs/planning/WORLD_TICK_DESIGN.md §18.2.4 (the roster, the lease and
-- the watermark), §18.2.5 (how the settle receives a party), §18.2.5a (S-9,
-- when one member's hr_apply refuses), §18.2.1a (attribution is JOURNAL, never
-- DELTA), §18.2.6 (the parity read); Security §18-SEC.3's S2 self-check list
-- and §18-SEC-2's B-A3 and B-A5.
--
-- ⚠ A MONEY-SURFACE REVIEW (§18-SEC.3, Correction 1). The armed branch of
--   hr_party_tick_settle below reaches hr_apply, and the ONLY thing between
--   this file and money moving is an operator `update hr_tick_config set
--   shadow = false` — *"with no further code review in between."* The armed
--   branch is therefore written IN FULL here and is reviewed IN FULL here; it
--   is not a sketch that S5 finishes. S5 is the GO to flip the switch, not the
--   slice that writes the code the switch turns on.
--
-- ── WHAT LANDS HERE ─────────────────────────────────────────────────────────
--   hr_party_roster(...)      one row per live party_hunt, members' envelopes
--                             NESTED. EXECUTE: hr_tick and nothing else.
--   hr_party_tick_settle(...) ONE fenced call per party window, per-member
--                             deltas, ALL-OR-NOTHING. EXECUTE: hr_engine and
--                             nothing else.
--
-- The selector and the settler remain DIFFERENT ROLES and neither can become
-- the other (§15c). §5(a) asserts the whole matrix for all five roles by
-- `has_function_privilege`, and §5(b) executes the identity refusal as each
-- forbidden role.
--
-- ── ONE CALL, NOT FOUR (§18.2.5) ───────────────────────────────────────────
-- Four calls under a party advisory lock are four transactions: a crash between
-- the second and the third leaves two members paid from a four-way split with
-- the party watermark un-advanced, and the retry then either double-pays the
-- first two or refuses them and pays nobody. The split is one arithmetic over
-- one window and must commit as one row set. The cost is stated rather than
-- discovered: the settle holds up to four `player_state` row locks across four
-- `hr_apply` calls, which is why the lock order in (4) is a hard rule.
--
-- ── ATTRIBUTION IS JOURNAL, NEVER DELTA (S-1), AND THIS FILE ENFORCES IT ────
-- `hr_apply` declares `c_delta_keys` and refuses every top-level key outside it
-- by name. In SHADOW the settle returns BEFORE hr_apply ever sees the object —
-- which is what makes S-1 worse than loud: 48 h of parity evidence would
-- accumulate for a payload that cannot be paid. So this file checks the delta's
-- shape ITSELF, at (6b), against `c_party_delta_keys`; §5(g) PROVES that list
-- is a subset of hr_apply's own `c_delta_keys`, parsed out of its INSTALLED
-- body rather than retyped, so the two can never drift into a shadow run that
-- measures an unpayable delta.
--
--   the delta a party settle stores/pays  ==  a solo combat settle's key set
--   the party rides in journal.meta.party  ==  ONE nested key (S-2)
--
-- The caller hands the delta WITH `journal.meta.party` on it. The SHADOW branch
-- LIFTS that object into `hr_tick_shadow.party` and stores
-- `delta #- '{journal,meta,party}'` — so the stored delta is byte-identical to
-- a solo settle's and §18.2.6 (P-a) is a byte comparison rather than an
-- argument. The ARMED branch passes the delta through UNTOUCHED, so `hr_apply`
-- merges `journal.meta` at the TOP of `player_ledger.meta` and the party read
-- is `meta->'party'` (§18.2.1a; the two wrong spellings are named there and
-- executed by tests/world-tick-ledger-meta.mjs).
--
-- ── B-A5: THE NESTED KEY SET IS AN EQUALITY ────────────────────────────────
-- `metaProblems()` checks TOP-LEVEL keys only, so nesting buys the count and
-- does not buy a bound. (2d) below asserts `journal.meta.party`'s key set is
-- EXACTLY {id,hunt,dmg_bp,xp_bp,floor,fellow_bp,roll} — both directions, an
-- eighth key and a missing one alike — and refuses `bad_party_meta`. With
-- `party` added the flat allowlist is TWELVE, so the key that must still go red
-- is a THIRTEENTH; tests/party-settle.mjs `--mutate thirteenthKey` is that
-- proof.
--
-- ── B-A3: THE HANDLER NAMES ITS EXCEPTION AND RE-RAISES THE REST ───────────
-- §18.2.5a's sketch is `exception when others`. That also catches a deadlock
-- (40P01), a lock timeout, a statement cancellation and a bug in the split, and
-- turns each into "end the party hunt, blame a member" — and two of those are
-- things an adversary can provoke. The fan-out below raises the RESERVED
-- SQLSTATE `HR826` for an unpayable member and the handler catches `when
-- sqlstate 'HR826'` ONLY. Everything else propagates out of this function
-- unchanged, because a party ended because the arithmetic threw is a defect
-- that must be LOUD, and `member_unpayable:<user>` names an innocent player for
-- it. §5(f) mutation-proves the distinction by executing both.
--
-- ── THE CARRIER IS RE-VERIFY 5's, PER MEMBER, AND NOT A FOURTH MECHANISM ───
-- SEC_WORLD_TICK_M3_2026-09-22.md RE-VERIFY 5 put the solo continuation state
-- on `hr_tick_ownership.shadow_state` with a 16 KiB octet bound and three
-- refusal names. A party window carries EACH member's continuation the same
-- way: one jsonb object on `party_tick_lease.shadow_state`, keyed
-- `<user>:<slot>`, written under the party lease's own lock, in ONE statement
-- with the shadow mark (so there is no instant in which one has moved and the
-- other has not), CLEARED with the mark on the armed branch, and refused when
-- armed with the SAME THREE NAMES — `shadow_state_while_armed`,
-- `bad_shadow_state`, `shadow_state_too_large`. The per-member bound is the
-- same 16 KiB measured in OCTETS (RE-VERIFY 5's S-4: `.length` is UTF-16 code
-- units and the two halves agree only on pure ASCII).
--
-- ── SHADOW ONLY, TODAY ─────────────────────────────────────────────────────
-- `hr_tick_config.shadow` is `true` on production and nothing in this batch
-- changes it. §5(h) asserts the shadow branch pays NOTHING by execution — zero
-- `player_ledger` rows, `player_state` untouched, versions unmoved.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   drop function public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb);
--   drop function public.hr_party_roster(text[],int,text,int,timestamptz,uuid);
-- Purely additive: no existing function, table, policy, grant or CHECK moves.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. PRECONDITIONS ───────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.party_hunt') is null
     or to_regclass('public.party_tick_lease') is null then
    raise exception 'PRECONDITION: the S2 session objects are absent — apply 2026-09-23-m8-parties-s2-1-hunt-tables.sql FIRST (same batch, one sitting).';
  end if;
  if to_regprocedure('public.hr_partied(uuid,int)') is null then
    raise exception 'PRECONDITION: hr_partied is absent — invariant 7''s predicate is file 1''s.';
  end if;
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'PRECONDITION: hr_apply is absent — it is the ONLY money writer and the armed branch calls it once per member.';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null
     or to_regprocedure('public.hr_seed(uuid,int,text)') is null then
    raise exception 'PRECONDITION: hr_state_of or hr_seed is absent — the roster nests the envelope and labels the window seed.';
  end if;
  if to_regclass('public.hr_tick_shadow') is null then
    raise exception 'PRECONDITION: hr_tick_shadow is absent.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_tick_shadow'
                    and column_name = 'party') then
    raise exception 'PRECONDITION: hr_tick_shadow.party is absent — file 1 of this batch adds it (S-1/S-16) and the shadow branch writes it.';
  end if;
end $$;

-- ── 2. hr_party_roster — ONE ROW PER LIVE HUNT, MEMBERS NESTED ────────────
-- §18.2.4. `hr_tick_roster`'s sibling, at party grain, with three differences
-- that are all stated rather than discovered:
--
--   * THE LIMIT IS COUNTED IN CHARACTERS, NOT PARTIES (I-3). A party takes one
--     lease but up to four characters of settle work, so a limit counted in
--     parties makes the first cohort up to 4x the intended size. The driver
--     admits parties until the RUNNING SUM of their live member counts reaches
--     the limit — and a party is admitted whole or not at all, because half a
--     party is a partial settle and §18.2.5 step 5 calls that a mint.
--   * THE MEMBERS ARE NESTED WHOLE. §2's rule: the tick never assembles a
--     character out of parts, so each member carries its own `hr_state_of`
--     envelope, its own `version` and its own window seed.
--   * THE LEASE ROW IS SEEDED BEFORE THE CLAIM. `party_tick_lease` has no
--     writer but this function and the settle, so a hunt started by S4 has no
--     lease row until its first roster call. Seeding is `on conflict do
--     nothing` and takes no lease by itself.
create or replace function public.hr_party_roster(
  p_channels      text[],
  p_limit         int         default 200,
  p_holder        text        default null,
  p_lease_ms      int         default 30000,
  p_after_accrued timestamptz default null,
  p_after_party   uuid        default null
)
returns table (
  party_id          uuid,
  hunt_id           uuid,
  active_id         text,
  stance            text,
  stop              jsonb,
  -- ★ THE EFFECTIVE PARTY WATERMARK — where this party's next window starts.
  --   Armed: party_hunt.accrued_to. Shadowed: greatest of it and the party's
  --   own shadow mark, byte-identically to the expression the settle's CAS
  --   compares against, so the roster and the door can never disagree about a
  --   window boundary (M-1's lesson at party grain).
  accrued_to        timestamptz,
  -- NULL whenever the column above already says everything there is to say.
  shadow_accrued_to timestamptz,
  -- RE-VERIFY 5's carrier, per member, keyed `<user>:<slot>`. NULL when the
  -- window is not chaining.
  shadow_state      jsonb,
  members           jsonb,
  member_count      int
)
language plpgsql volatile security definer set search_path = public as $$
-- ⚠ THE OUT PARAMETERS OF A `returns table` ARE PLPGSQL VARIABLES, and seven of
--   them (party_id, active_id, stance, stop, accrued_to, shadow_accrued_to,
--   shadow_state) are also COLUMN NAMES on the tables this function reads. The
--   default conflict rule is an ERROR, which is how this function first failed
--   to install. `use_column` resolves every ambiguous name to the COLUMN, which
--   is what every reference below means; the locals are all `v_`-prefixed and
--   cannot collide.
#variable_conflict use_column
declare
  -- The party's channel vocabulary. A party hunt is COMBAT (§18.2.1a: `party`
  -- is not a new tick channel), and the argument exists so the driver cannot
  -- ask for a party under a channel the tick does not own.
  c_payable     constant text[] := array['combat'];
  c_max_parties constant int    := 200;
  c_max_span    constant interval := interval '24 hours';
  v_role    text;
  v_limit   int;
  v_lease   interval;
  v_holder  text;
  v_shadow  boolean;
  k         text;
begin
  -- ── (0) THE IDENTITY SEAM. The PRIMARY control is the GRANT in §4 (hr_tick
  --        and nothing a request can arrive as). Inside SECURITY DEFINER
  --        `current_user` is the OWNER, so the GUC is what carries the
  --        request's role across.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_party_roster: not callable by %', v_role using errcode = '42501';
  end if;

  -- ── (1) ARGUMENTS ARE CLAMPED, NEVER TRUSTED.
  if p_channels is null or array_length(p_channels, 1) is null then
    raise exception 'hr_party_roster: p_channels is required' using errcode = '22023';
  end if;
  foreach k in array p_channels loop
    if not (k = any (c_payable)) then
      -- REFUSED, not filtered: a typo must not silently produce an empty
      -- roster that reads as "nobody is hunting".
      raise exception 'hr_party_roster: "%" is not a party channel', k using errcode = '22023';
    end if;
  end loop;
  v_limit  := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_lease  := make_interval(secs => least(greatest(coalesce(p_lease_ms, 30000), 5000), 300000) / 1000.0);
  v_holder := left(coalesce(nullif(p_holder, ''), 'unnamed'), 64);

  -- ── (1b) THE MODE, FROM THE CONFIG SINGLETON. Fails SAFE to shadow: chaining
  --         on the shadow mark can only ever propose a window at or AFTER the
  --         paid one, so a wrong guess skips time at worst and can never
  --         re-propose settled time.
  select coalesce(cfg.shadow, true) into v_shadow from public.hr_tick_config cfg where cfg.id;
  v_shadow := coalesce(v_shadow, true);

  -- ── (1c) EVERY LIVE HUNT HAS A LEASE ROW. Not a claim — a row to claim.
  insert into public.party_tick_lease (party_id)
  select h.party_id from public.party_hunt h
   where h.ended_at is null
  on conflict (party_id) do nothing;

  -- ── (2) THE COHORT, THE ADMISSION IN CHARACTERS, AND THE LEASE.
  return query
  with cand as (
    select h.party_id  as p_id,
           h.id        as h_id,
           h.active_id as a_id,
           h.stance    as st,
           h.stop      as sp,
           h.accrued_to as hunt_mark,
           m.mark      as mark,
           mc.n        as n
      from public.party_hunt h
      join public.party_tick_lease l on l.party_id = h.party_id
      cross join lateral (
        select case when v_shadow
                    then greatest(h.accrued_to, coalesce(l.shadow_accrued_to, h.accrued_to))
                    else h.accrued_to end as mark) m
      cross join lateral (
        select count(*)::int as n from public.party_member pm
         where pm.party_id = h.party_id and pm.left_at is null) mc
     where h.ended_at is null
       -- The absence cap the accrual path already enforces. A party further
       -- behind than this is DROPPED rather than simulated to zero, exactly as
       -- hr_tick_roster drops a character.
       and h.accrued_to > now() - c_max_span
       -- A party of ONE is admitted: §18.2.6 (P-a) degenerate parity is the
       -- single most valuable guard in the milestone and needs a real
       -- one-member party. A party of ZERO live members has nothing to settle.
       and mc.n between 1 and 4
       and (l.lease_until is null
            or l.lease_until < now()
            or l.lease_holder = v_holder)
       and (p_after_accrued is null
            or (m.mark, h.party_id)
                 > (p_after_accrued,
                    coalesce(p_after_party, '00000000-0000-0000-0000-000000000000'::uuid)))
     order by m.mark asc, h.party_id asc
     limit c_max_parties
       for update of l skip locked
  ), admitted as (
    -- THE RUNNING SUM, IN CHARACTERS (I-3). A party whose members would take
    -- the batch past the limit is left for the next fire ENTIRELY — the cursor
    -- below resumes at it, so nothing is starved.
    select c.*,
           sum(c.n) over (order by c.mark, c.p_id
                          rows between unbounded preceding and current row) as running
      from cand c
  ), taken as (
    select a.* from admitted a where a.running <= v_limit
  ), leased as (
    update public.party_tick_lease l
       set owned        = true,
           lease_holder = v_holder,
           lease_until  = now() + v_lease,
           updated_at   = now()
      from taken t
     where l.party_id = t.p_id
    returning l.party_id as lp, l.shadow_state as lstate
  )
  select t.p_id, t.h_id, t.a_id, t.st, t.sp,
         t.mark,
         nullif(t.mark, t.hunt_mark),
         x.lstate,
         (select jsonb_agg(jsonb_build_object(
                   'user_id',    pm.user_id,
                   'slot',       pm.slot,
                   'version',    ps.version,
                   'accrued_to', ps.accrued_to,
                   -- The per-window PRNG label, derived EXACTLY as
                   -- hr-accrue/index.ts derives it and seeded from the
                   -- EFFECTIVE watermark. `to_jsonb(...) #>> '{}'` and not
                   -- to_char: the accrue path labels from the hr_state_of
                   -- JSONB envelope, so the spelling is whatever Postgres
                   -- renders a timestamptz as INSIDE JSON (T-2).
                   'seed',       public.hr_seed(pm.user_id, pm.slot,
                                   'accrue:' || (to_jsonb(t.mark) #>> '{}')),
                   -- §2's RULE: THE TICK NEVER ASSEMBLES A CHARACTER OUT OF
                   -- PARTS. The whole envelope, the same projection the
                   -- player's own client applies.
                   'state',      public.hr_state_of(pm.user_id, pm.slot))
                   order by pm.user_id, pm.slot)
            from public.party_member pm
            join public.player_state ps
              on ps.user_id = pm.user_id and ps.slot = pm.slot
           where pm.party_id = t.p_id and pm.left_at is null),
         t.n
    from taken t
    join leased x on x.lp = t.p_id
   order by t.mark asc, t.p_id asc;
end $$;
comment on function public.hr_party_roster(text[],int,text,int,timestamptz,uuid) is
  'M8 S2 (2026-09-23), §18.2.4. hr_tick_roster''s sibling at PARTY grain: one '
  'row per live party_hunt with its members'' full hr_state_of envelopes '
  'NESTED, the effective party watermark, and the per-member shadow carrier. '
  'The batch limit is counted in CHARACTERS, not parties (I-3). EXECUTE: '
  'hr_tick and nothing else — the SELECTOR and the SETTLER are different roles '
  'and neither may become the other.';

-- ── 3. hr_party_tick_settle — ONE CALL PER PARTY WINDOW, ALL-OR-NOTHING ────
-- §18.2.5's order, every step hr_tick_settle's own with the party grain added.
-- Every refusal is a RETURNED CODE rather than an exception, for the fence's
-- own reason: the driver settles a cohort and a refused party must not abort
-- the other 199. The ONE exception that is raised is `HR826`, and it never
-- escapes: it is the fan-out's internal signal and (9)'s handler is the only
-- thing that can see it.
create or replace function public.hr_party_tick_settle(
  p_holder       text,
  p_party        uuid,
  p_window_from  timestamptz,
  p_window_to    timestamptz,
  -- ONE key for the whole party window. Safe and not an assumption:
  -- `hr_tick_shadow_intent_uidx` is unique on (user_id, slot, intent_id), so
  -- one key spans 2..4 members without collision while still refusing a replay
  -- of any ONE of them. hr_apply's own idempotency is keyed the same way.
  p_intent_id    uuid,
  -- [{user, slot, version, delta, shadow_state?}, …] 1..4. `shadow_state` is
  -- RE-VERIFY 5's carrier for THAT member; it rides inside the member object
  -- rather than as a seventh argument, so the signature is §18.2.5's exactly
  -- and the carrier can never be attached to the wrong member.
  p_members      jsonb
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c_skew        constant interval := interval '60 seconds';
  c_channel     constant text     := 'combat';
  c_max_members constant int      := 4;
  -- RE-VERIFY 5's ceiling, PER MEMBER, in OCTETS. Checked here so the refusal
  -- has a tick-shaped NAME the driver can count rather than a check_violation
  -- that aborts the batch's transaction (the CHECK on party_tick_lease is the
  -- backstop under it, at 4x for the whole object).
  c_state_max   constant int      := 16384;
  -- THE DELTA VOCABULARY A PARTY SETTLE ACCEPTS — a solo combat settle's, and
  -- nothing else. §5(g) PROVES this is a subset of hr_apply's own
  -- `c_delta_keys`, parsed out of its installed body, so a shadow run can
  -- never accumulate parity evidence for a payload hr_apply would refuse (S-1).
  c_delta_ok    constant text[] := array[
    'gold','xp','items','accrued_to','hp','fight','recovering_until',
    'consec_falls','deaths','progress','hearthfind','tool_carry','journal'];
  -- THE STAMPING KEYS. `guardStampKeys()` stays exactly as it is and is the
  -- BACKSTOP, not the fence (§18.2.3 invariant 8): the day someone adds a
  -- stamping key to a party delta it is a LOUD refusal rather than the silent
  -- confiscation of four players' nights at once.
  c_stamp       constant text[] := array['activity','equip','enchant'];
  -- B-A5. An EQUALITY, in §18.2.1a's own order.
  c_party_keys  constant text[] := array['id','hunt','dmg_bp','xp_bp','floor',
                                         'fellow_bp','roll'];
  v_role     text;
  v_cfg      public.hr_tick_config%rowtype;
  v_hunt     public.party_hunt%rowtype;
  v_lease    public.party_tick_lease%rowtype;
  v_mark     timestamptz;
  v_n        int;
  v_live     int;
  v_matched  int;
  v_m        jsonb;
  v_mu       uuid;
  v_ms       int;
  v_delta    jsonb;
  v_party    jsonb;
  v_keys     text[];
  v_state    jsonb;
  v_carry    jsonb := '{}'::jsonb;
  v_any_state boolean := false;
  v_st       public.player_state%rowtype;
  v_ins      int;
  v_tot      int := 0;
  v_out      jsonb;
  v_bad_user uuid;
  v_bad      jsonb;
  k          text;
begin
  -- ── (0) IDENTITY. The PRIMARY control is the GRANT in §4; this is the
  --        SECONDARY one, so an owner-context call cannot silently act as the
  --        engine without saying so. `hr_tick` is refused BY NAME: the selector
  --        must never be able to become the settler.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_party_tick_settle: not callable by %', v_role using errcode = '42501';
  end if;

  -- ── (1) THE KILL SWITCH, READ FIRST AND FAILING CLOSED.
  select * into v_cfg from public.hr_tick_config where id;
  if not found or not v_cfg.enabled then
    return jsonb_build_object('ok', false, 'error', 'tick_disabled', 'mode', 'off');
  end if;

  -- ── (2) ARGUMENTS ARE CLAMPED AND BOUND, NEVER TRUSTED.
  if p_party is null or p_intent_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;
  if p_members is null or jsonb_typeof(p_members) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_members');
  end if;
  v_n := jsonb_array_length(p_members);
  if v_n < 1 or v_n > c_max_members then
    return jsonb_build_object('ok', false, 'error', 'bad_members', 'members', v_n,
      'max', c_max_members);
  end if;
  if p_window_from is null or p_window_to is null or p_window_to <= p_window_from then
    return jsonb_build_object('ok', false, 'error', 'bad_window');
  end if;
  if p_window_to > now() + c_skew then
    return jsonb_build_object('ok', false, 'error', 'window_in_future',
      'skew_ms', floor(extract(epoch from (p_window_to - now())) * 1000));
  end if;
  if not (c_channel = any (v_cfg.channels)) then
    return jsonb_build_object('ok', false, 'error', 'channel_not_owned_by_tick');
  end if;

  -- ── (2b) THE CARRIER, THE THREE REFUSAL NAMES, PER MEMBER (RE-VERIFY 5).
  --         Refused HERE — before the lock, before the lease, a very long way
  --         before hr_apply. Ignoring a carrier on the branch that PAYS would
  --         mean the writer silently accepted an argument built for the branch
  --         that does not, which is precisely how a stale proposal gets
  --         believed. It is also the honest answer to an operator who arms the
  --         tick between the driver's roster call and its settle: that ONE
  --         settle is refused, loudly and countably, and the next fire runs
  --         armed with no carrier.
  for v_m in select value from jsonb_array_elements(p_members) loop
    v_state := v_m->'shadow_state';
    if v_state is null or jsonb_typeof(v_state) = 'null' then continue; end if;
    v_any_state := true;
    if not v_cfg.shadow then
      return jsonb_build_object('ok', false, 'error', 'shadow_state_while_armed',
        'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
    end if;
    if jsonb_typeof(v_state) <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'bad_shadow_state',
        'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
    end if;
    if octet_length(v_state::text) > c_state_max then
      return jsonb_build_object('ok', false, 'error', 'shadow_state_too_large',
        'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'),
        'bytes', octet_length(v_state::text), 'max', c_state_max);
    end if;
  end loop;

  -- ── (3) ★ THE PARTY LOCK, TAKEN FIRST ★. This is what serialises a settle
  --        against a join, a leave and a kick (§18.2.5 step 3).
  select * into v_hunt from public.party_hunt
   where party_id = p_party and ended_at is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_party_hunt');
  end if;
  select * into v_lease from public.party_tick_lease
   where party_id = p_party for update;
  if not found or not v_lease.owned then
    return jsonb_build_object('ok', false, 'error', 'not_tick_owned');
  end if;
  if v_lease.lease_holder is distinct from p_holder
     or v_lease.lease_until is null or v_lease.lease_until <= now() then
    return jsonb_build_object('ok', false, 'error', 'no_lease',
      'holder', v_lease.lease_holder, 'until', v_lease.lease_until);
  end if;

  -- ── (5a) ★ THE CAS, AT PARTY GRAIN ★. v_mark is the PARTY's, computed once,
  --         byte-identically to hr_tick_settle's own rule. Armed: the party
  --         watermark, which the party's own payments move. Shadow: greatest of
  --         it and the party's shadow watermark, so windows cannot overlap
  --         while nothing is being paid.
  v_mark := case when v_cfg.shadow
                 then greatest(v_hunt.accrued_to,
                               coalesce(v_lease.shadow_accrued_to, v_hunt.accrued_to))
                 else v_hunt.accrued_to end;
  --
  --         ── THE CARRIER RIDES THE SAME REFUSAL AS THE MARK (RE-VERIFY 5,
  --            design 4, at party grain). `party_tick_lease` is readable by NO
  --            role — not anon, not authenticated, not service_role, not
  --            hr_engine, not hr_tick — and `hr_party_roster` is hr_tick's, so
  --            this refusal is the ONLY way the settling role can learn the
  --            party's true watermark, the MODE, or the continuation state its
  --            own last window left. Routing any of the three through the
  --            driver's POST body instead would make "the server picks whose
  --            world ticks, and from when" a claim about a request rather than
  --            about a row somebody else wrote, and a tick host that could edit
  --            its own payload could hand the engine any hp, any recovery clock
  --            and any bag it liked for four characters at once.
  --            It is read under the same `for update` on the same two rows, in
  --            this role's own transaction, on the same statement that reports
  --            the mark: one lock, one answer, no second read. And it is handed
  --            back ONLY while the fence is actually CHAINING — in shadow, with
  --            a shadow mark that has moved PAST the paid one. Armed it is never
  --            sent at all: the row has none (the armed branch clears it) and an
  --            armed window must not read one.
  if p_window_from < v_mark or p_window_to <= v_mark then
    return jsonb_build_object('ok', false, 'error', 'party_window_already_settled',
      'window_from', p_window_from, 'window_to', p_window_to,
      'accrued_to', v_mark, 'shadow', v_cfg.shadow)
      || case
           when v_cfg.shadow
            and v_lease.shadow_state is not null
            and v_lease.shadow_accrued_to is not null
            and v_lease.shadow_accrued_to > v_hunt.accrued_to
           then jsonb_build_object('shadow_state', v_lease.shadow_state)
           else '{}'::jsonb end;
  end if;

  -- ── (6) RE-COUNT THE LIVE MEMBERSHIP UNDER THE LOCK (T-6), AND RE-ASSERT
  --        THE MEMBER SET IS EXACTLY IT. A count read outside the lock is the
  --        shape the clan member-cap bug turned on, and a member set that is a
  --        SUBSET of the live roster is S-9's partial settle: three members
  --        paid a split computed from four contributors, which is a mint.
  --
  --        STATED AS ONE PREDICATE, THREE WAYS TO FAIL, so the property has a
  --        single line a mutation can take away: `v_live` is the live roster's
  --        size, `v_n` the declared set's, and `v_matched` the number of
  --        DISTINCT live members the declared set names. The three are equal if
  --        and only if the declared set IS the live set with no member named
  --        twice — the distinct count is what refuses `[A, A]` against a live
  --        `{A, B}`, which every count-only form accepts.
  select count(*) into v_live from public.party_member
   where party_id = p_party and left_at is null;
  select count(distinct (pm.user_id, pm.slot)) into v_matched
    from jsonb_array_elements(p_members) e
    join public.party_member pm
      on pm.party_id = p_party and pm.left_at is null
     and pm.user_id = (e.value->>'user')::uuid
     and pm.slot    = (e.value->>'slot')::int;
  if v_live <> v_n or v_matched <> v_n then
    return jsonb_build_object('ok', false, 'error', 'party_window_already_settled',
      'why', 'the declared member set is not the live member set',
      'declared', v_n, 'live', v_live, 'matched', v_matched);
  end if;

  -- ── (6b) THE DELTA IS KEY-FOR-KEY A SOLO COMBAT SETTLE'S (S-1), AND THE
  --         PARTY OBJECT'S KEY SET IS AN EQUALITY (B-A5).
  --
  --         ⚠ AFTER THE CAS, DELIBERATELY. The driver reads the party's true
  --           watermark, the MODE and the per-member carrier off the CAS's own
  --           refusal — `hr_party_roster` is hr_tick's and `party_tick_lease`
  --           is readable by nobody, so this refusal is the ONLY way the
  --           settling role can learn any of the three. That probe carries a
  --           deliberately stale window and a minimal delta, exactly as the
  --           solo `probeWatermark` does; shape-checking before the CAS would
  --           make it unanswerable and the driver would have to take the
  --           watermark from its own POST body instead, which is precisely the
  --           authority this fence exists to keep out of a request.
  --           Nothing is written either way: the CAS refuses first, and a
  --           malformed delta is refused here before any member row is locked.
  for v_m in select value from jsonb_array_elements(p_members) loop
    v_delta := v_m->'delta';
    if v_delta is null or jsonb_typeof(v_delta) <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'bad_delta',
        'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
    end if;
    for k in select jsonb_object_keys(v_delta) loop
      if k = any (c_stamp) then
        -- §18.2.3 invariant 8's backstop, and it is LOUD on purpose.
        return jsonb_build_object('ok', false, 'error', 'delta_would_stamp', 'key', k,
          'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
      end if;
      if not (k = any (c_delta_ok)) then
        -- Including a TOP-LEVEL `party` key, which is S-1 exactly: attribution
        -- is JOURNAL, never DELTA, and in shadow this is the only thing between
        -- 48 h of parity evidence and a payload hr_apply cannot accept.
        return jsonb_build_object('ok', false, 'error', 'unknown_delta_key', 'key', k,
          'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
      end if;
    end loop;
    -- (2d) B-A5 — THE NESTED KEY SET, BOTH DIRECTIONS.
    v_party := v_delta #> '{journal,meta,party}';
    if v_party is null or jsonb_typeof(v_party) <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'bad_party_meta',
        'why', 'journal.meta.party is absent or is not an object',
        'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
    end if;
    select array(select jsonb_object_keys(v_party) order by 1) into v_keys;
    if v_keys <> array(select unnest(c_party_keys) order by 1) then
      return jsonb_build_object('ok', false, 'error', 'bad_party_meta',
        'keys', to_jsonb(v_keys), 'expected', to_jsonb(c_party_keys),
        'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
    end if;
    if (v_party->>'id') is distinct from p_party::text then
      return jsonb_build_object('ok', false, 'error', 'bad_party_meta',
        'why', 'journal.meta.party.id names a different party than the call does',
        'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
    end if;
  end loop;

  -- ── (4)(5b) THE MEMBER ROW LOCKS, IN (user_id, slot) ORDER, AND THE
  --         PER-MEMBER HALF OF THE CAS. Deterministic order is the whole
  --         deadlock argument: a concurrent solo settle holds exactly one of
  --         these rows and can only ever be waited on, never circularly.
  --
  --         ⚠ ANY MEMBER FAILING MEANS THE WHOLE CALL RETURNS AND NOTHING IS
  --           WRITTEN. All-or-nothing is not tidiness: a partial settle pays
  --           three members a split computed from four contributors.
  for v_m in
    select e.value from jsonb_array_elements(p_members) e
     order by (e.value->>'user')::uuid, (e.value->>'slot')::int
  loop
    v_mu := (v_m->>'user')::uuid;
    v_ms := (v_m->>'slot')::int;
    select * into v_st from public.player_state
     where user_id = v_mu and slot = v_ms for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'party_window_already_settled',
        'why', 'no_character', 'member', jsonb_build_object('user', v_mu, 'slot', v_ms));
    end if;
    -- INVARIANT 8, AS A PREDICATE. An inequality EITHER WAY is a broken
    -- invariant, not a window to clamp: the party watermark IS the member's
    -- watermark for the life of the hunt, and hr_party_tick_settle is the only
    -- writer of either. §18.2.4 deletes the old drag-forward rule rather than
    -- softening it, so there is nothing here to reconcile.
    if v_st.accrued_to is distinct from v_hunt.accrued_to then
      return jsonb_build_object('ok', false, 'error', 'party_window_already_settled',
        'why', 'invariant_8', 'member', jsonb_build_object('user', v_mu, 'slot', v_ms),
        'member_accrued_to', v_st.accrued_to, 'party_accrued_to', v_hunt.accrued_to);
    end if;
    if (v_m->>'version') is null or (v_m->>'version')::bigint <> v_st.version then
      return jsonb_build_object('ok', false, 'error', 'party_window_already_settled',
        'why', 'version_conflict', 'member', jsonb_build_object('user', v_mu, 'slot', v_ms),
        'held', v_m->>'version', 'current', v_st.version);
    end if;
    -- THE DECLARED WINDOW IS BOUND TO THE PAID ONE, per member, so a caller
    -- cannot name ten seconds and hand over an hour.
    if nullif(v_m#>>'{delta,accrued_to}', '')::timestamptz is distinct from p_window_to then
      return jsonb_build_object('ok', false, 'error', 'window_delta_mismatch',
        'member', jsonb_build_object('user', v_mu, 'slot', v_ms),
        'declared', v_m#>>'{delta,accrued_to}', 'window_to', p_window_to);
    end if;
    -- The character must still be on the channel the party is hunting on.
    if v_st.active_kind is distinct from c_channel then
      return jsonb_build_object('ok', false, 'error', 'channel_moved',
        'member', jsonb_build_object('user', v_mu, 'slot', v_ms),
        'active_kind', v_st.active_kind);
    end if;
  end loop;

  -- ══ (7) SHADOW BRANCH — JOURNAL WHAT WOULD HAVE BEEN PAID; PAY NOTHING ═══
  -- There is no hr_apply call on this branch and there must never be one.
  if v_cfg.shadow then
    for v_m in
      select e.value from jsonb_array_elements(p_members) e
       order by (e.value->>'user')::uuid, (e.value->>'slot')::int
    loop
      v_mu    := (v_m->>'user')::uuid;
      v_ms    := (v_m->>'slot')::int;
      v_delta := v_m->'delta';
      v_party := v_delta #> '{journal,meta,party}';
      -- ★ THE LIFT. The attribution goes to the COLUMN and the delta is stored
      --   WITHOUT it — so `hr_tick_shadow.delta` is byte-for-byte the object a
      --   SOLO settle would have stored, and §18.2.6 (P-a) degenerate parity is
      --   a byte comparison rather than an argument.
      with ins as (
        insert into public.hr_tick_shadow
          (user_id, slot, channel, holder, window_from, window_to, version,
           intent_id, delta, would_gold, would_qty, would_ticks, party)
        values
          (v_mu, v_ms, c_channel, p_holder, p_window_from, p_window_to,
           (v_m->>'version')::bigint, p_intent_id,
           v_delta #- '{journal,meta,party}',
           coalesce((v_delta->>'gold')::bigint, 0),
           coalesce((v_delta#>>'{journal,meta,qty}')::bigint, 0),
           coalesce((v_delta#>>'{journal,meta,ticks}')::bigint, 0),
           v_party)
        on conflict (user_id, slot, intent_id) do nothing
        returning 1)
      select count(*) into v_ins from ins;
      v_tot := v_tot + v_ins;
      v_state := v_m->'shadow_state';
      if v_state is not null and jsonb_typeof(v_state) = 'object' then
        v_carry := v_carry || jsonb_build_object(v_mu::text || ':' || v_ms::text, v_state);
      end if;
    end loop;

    -- ── CHAIN, AND ONLY IF SOMETHING WAS JOURNALLED. The CAS above already
    --    refuses a replayed window on arithmetic, so a conflict here is
    --    unreachable by an honest caller — but if it were reached, moving the
    --    mark and overwriting the carrier for a window that produced NO journal
    --    row would advance the chain past a window nobody can ever read. The
    --    mark and the carrier move TOGETHER, in ONE statement, under the lease
    --    lock taken at (3).
    if v_tot > 0 then
      update public.party_tick_lease
         set shadow_accrued_to = p_window_to,
             shadow_state      = case when v_carry = '{}'::jsonb then null else v_carry end,
             updated_at        = now()
       where party_id = p_party;
    end if;
    return jsonb_build_object('ok', true, 'mode', 'shadow', 'paid', false,
      'party', p_party, 'window_to', p_window_to, 'members', v_n,
      'journalled', v_tot, 'chained', v_tot > 0 and v_any_state);
  end if;

  -- ══ (8)(9) ARMED BRANCH — hr_apply ONCE PER MEMBER, IN ONE TRANSACTION ═══
  -- §18.2.5a, answering S-9. The fan-out runs inside ONE `begin … exception`
  -- sub-block: a member refusal raises HR826 inside it, the sub-block's
  -- implicit savepoint rolls back EVERY hr_apply write from the fan-out, and
  -- the handler's own statements then run in the OUTER transaction, which is
  -- still live. `party_hunt.accrued_to` is NOT advanced, so the window is
  -- intact; the hunt ENDS, `hr_partied` goes false for every member, invariant
  -- 7 stops excluding them, and the SAME window is priced once per member under
  -- the ordinary solo rules — the refusing member meets their own bag_full
  -- alone, where it is their own problem to solve, and the others are paid.
  --
  -- ⚠ B-A3: THE HANDLER NAMES ITS EXCEPTION. `when others` would also catch a
  --   deadlock, a lock timeout, a statement cancellation and a bug in the
  --   split, and turn each into "end the party hunt, blame a member" — two of
  --   which an adversary can provoke. Everything but HR826 propagates.
  begin
    for v_m in
      select e.value from jsonb_array_elements(p_members) e
       order by (e.value->>'user')::uuid, (e.value->>'slot')::int
    loop
      v_mu := (v_m->>'user')::uuid;
      v_ms := (v_m->>'slot')::int;
      -- THE DELTA GOES THROUGH UNTOUCHED, `journal.meta.party` and all:
      -- hr_apply merges `journal.meta` at the TOP of player_ledger.meta, so the
      -- party read is `meta->'party'` (§18.2.1a). hr_apply is the ONLY money
      -- writer and this function never moves a value except through it.
      v_out := public.hr_apply(v_mu, v_ms, (v_m->>'version')::bigint,
                               p_intent_id, v_m->'delta');
      if not coalesce((v_out->>'ok')::boolean, false) then
        v_bad_user := v_mu;
        v_bad := jsonb_build_object('user', v_mu, 'slot', v_ms,
                                    'error', v_out->>'error');
        raise exception 'HR_PARTY_MEMBER_UNPAYABLE' using errcode = 'HR826';
      end if;
    end loop;
    -- Every member paid. The party watermark moves, once, and the party's
    -- version with it.
    update public.party_hunt
       set accrued_to = p_window_to, version = version + 1
     where party_id = p_party and ended_at is null;
    -- ARMED PAYMENTS CLEAR THE SHADOW MARK — AND THE CARRIER WITH IT, in the
    -- same statement, for the same reason RE-VERIFY 5 clears the solo one:
    -- `accrued_to` is the authority again from here, and a stale carrier left
    -- lying around is a second source of truth nobody reads.
    update public.party_tick_lease
       set shadow_accrued_to = null, shadow_state = null, updated_at = now()
     where party_id = p_party;
  exception when sqlstate 'HR826' then
    -- The fan-out is rolled back. plpgsql variable assignments SURVIVE the
    -- sub-block rollback, which is why v_bad_user is readable here.
    update public.party_hunt
       set ended_at = now(), stopped_by = 'member_unpayable:' || v_bad_user::text
     where party_id = p_party and ended_at is null;
    return jsonb_build_object('ok', false, 'error', 'member_unpayable',
      'party', p_party, 'member', v_bad, 'mode', 'armed', 'paid', false);
  end;

  return jsonb_build_object('ok', true, 'mode', 'armed', 'paid', true,
    'party', p_party, 'window_to', p_window_to, 'members', v_n);
end $$;
comment on function public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb) is
  'M8 S2 (2026-09-23), §18.2.5 / §18.2.5a. ONE fenced call per party window '
  'carrying per-member deltas, ALL-OR-NOTHING. The party lock is taken first, '
  'member player_state rows are locked in (user_id, slot) order, the CAS is the '
  'PARTY''s, and invariant 8 is asserted per member. Shadow journals one '
  'hr_tick_shadow row per member with the attribution LIFTED into the `party` '
  'column and the delta stored key-for-key a solo settle''s. Armed fans out to '
  'hr_apply under one savepoint; a member refusal (HR826 and NOTHING else) '
  'rolls the whole fan-out back and ends the hunt member_unpayable:<user>. '
  'EXECUTE: hr_engine and nothing else.';

-- ── 4. GRANTS — revoke-before-grant, and the two roles stay apart ──────────
revoke execute on function public.hr_party_roster(text[],int,text,int,timestamptz,uuid) from public;
revoke execute on function public.hr_party_roster(text[],int,text,int,timestamptz,uuid)
  from anon, authenticated, service_role;
revoke execute on function public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb) from public;
revoke execute on function public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)
  from anon, authenticated, service_role;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hr_tick') then
    raise exception 'hr_tick does not exist — the party roster would be unreachable by the only role allowed to select it';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hr_engine') then
    raise exception 'hr_engine does not exist — the party fence would be unreachable by the only role allowed to open it';
  end if;
  -- THE SELECTOR.
  execute 'grant  execute on function public.hr_party_roster(text[],int,text,int,timestamptz,uuid) to hr_tick';
  execute 'revoke execute on function public.hr_party_roster(text[],int,text,int,timestamptz,uuid) from hr_engine';
  -- THE SETTLER.
  execute 'grant  execute on function public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb) to hr_engine';
  execute 'revoke execute on function public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb) from hr_tick';
end $$;

-- ── 5. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
-- Security's S2 list (§18-SEC.3), EXECUTED at apply time, refusing to install
-- otherwise: the privilege matrix for all five roles on both functions; the
-- identity refusal called AS each forbidden role; a PARTIAL-SETTLE MUTANT
-- asserting ZERO rows written anywhere (S-9); the two rosters DISJOINT for a
-- planted party member (S-8); hr_tick_shadow.channel's CHECK unchanged; the
-- thirteenth-key equality on journal.meta.party (B-A5). Every planted row is
-- rolled back at HR827 and §5(z) COUNTS what is left.
do $$
declare
  v_a    constant uuid := '00000000-0000-4000-8000-0000b8020011';
  v_b    constant uuid := '00000000-0000-4000-8000-0000b8020012';
  c_roster constant text := 'public.hr_party_roster(text[],integer,text,integer,timestamp with time zone,uuid)';
  c_settle constant text := 'public.hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)';
  v_p     uuid;
  v_h     uuid;
  v_r     jsonb;
  v_row   record;
  v_n     int;
  v_m     int;
  v_ledg  int;
  v_gold  bigint;
  v_gold2 bigint;
  v_vers  bigint;
  v_now   timestamptz;
  v_from  timestamptz;
  v_to    timestamptz;
  v_mem   jsonb;
  v_delta jsonb;
  v_keys  text[];
  v_apply text;
  v_ours  text[];
  t       text;
  v_state text;
begin
  -- ══ (a) THE PRIVILEGE MATRIX, ALL FIVE ROLES, BOTH FUNCTIONS ═════════════
  -- §18-SEC.3's S2 line: *"assert hr_party_tick_settle is executable by
  -- hr_engine and by nothing else, and hr_party_roster by hr_tick and nothing
  -- else, by has_function_privilege for all five roles."*
  foreach t in array array['anon','authenticated','service_role','hr_tick','hr_engine'] loop
    if not exists (select 1 from pg_roles where rolname = t) then continue; end if;
    if has_function_privilege(t, c_settle, 'execute') <> (t = 'hr_engine') then
      raise exception 'GATE(a): EXECUTE on hr_party_tick_settle for % is % — it is hr_engine ONLY. This is the door in front of hr_apply for up to four characters at once; a second role holding it is a second money writer.', t, has_function_privilege(t, c_settle, 'execute');
    end if;
    if has_function_privilege(t, c_roster, 'execute') <> (t = 'hr_tick') then
      raise exception 'GATE(a): EXECUTE on hr_party_roster for % is % — it is hr_tick ONLY. The SELECTOR and the SETTLER are different roles and neither may become the other: a settling role that could roster could stamp its own lease, and "choose whose world ticks" would be one grant deep instead of two.', t, has_function_privilege(t, c_roster, 'execute');
    end if;
  end loop;
  if has_function_privilege('public', c_settle, 'execute')
     or has_function_privilege('public', c_roster, 'execute') then
    raise exception 'GATE(a): PUBLIC holds EXECUTE on a party tick function. A bare grant default is exactly what revoke-before-grant exists to take away.';
  end if;

  -- ══ (b) THE IDENTITY REFUSAL, EXECUTED AS EACH FORBIDDEN ROLE ════════════
  -- Not `has_function_privilege` again — CALLED. `authenticated` and
  -- `service_role` cannot reach the refusal at all (the GRANT stops them
  -- first), which is the stronger answer; `hr_tick` CAN reach the settle's
  -- function-call machinery and must be refused BY NAME inside it, because the
  -- selector must never become the settler.
  foreach t in array array['anon','authenticated','service_role','hr_tick'] loop
    if not exists (select 1 from pg_roles where rolname = t) then continue; end if;
    v_state := null;
    begin
      execute format('set local role %I', t);
      perform public.hr_party_tick_settle('gate', gen_random_uuid(), now() - interval '1 hour',
                                          now(), gen_random_uuid(), '[]'::jsonb);
    exception when others then
      v_state := sqlstate;
    end;
    reset role;
    if v_state is null then
      raise exception 'GATE(b): role % CALLED hr_party_tick_settle and was not refused. The fence in front of hr_apply answered a role that must never reach it.', t;
    end if;
    if v_state <> '42501' then
      raise exception 'GATE(b): calling hr_party_tick_settle as % raised % — that is not the privilege refusal this gate measures, so the gate is grading its own typo rather than the fence.', t, v_state;
    end if;
    v_state := null;
    begin
      execute format('set local role %I', t);
      perform * from public.hr_party_roster(array['combat']::text[], 10, 'gate');
    exception when others then
      v_state := sqlstate;
    end;
    reset role;
    if t <> 'hr_tick' and v_state is distinct from '42501' then
      raise exception 'GATE(b): calling hr_party_roster as % answered % rather than 42501. hr_party_roster stamps a LEASE; a client role that could call it could lease a party away from the tick.', t, coalesce(v_state, 'no refusal at all');
    end if;
  end loop;

  -- ══ (g) THE DELTA VOCABULARY IS A SUBSET OF hr_apply's OWN c_delta_keys ═══
  -- DERIVED, not retyped: hr_apply's list is parsed out of its INSTALLED body.
  -- This is what makes (6b)'s check a fence rather than a second catalogue —
  -- and it is the S-1 property stated as an executable fact, because in SHADOW
  -- the settle returns before hr_apply and nothing else would notice a delta
  -- the database could not accept.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_apply
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  if v_apply is null or position('c_delta_keys' in v_apply) = 0 then
    raise exception 'GATE(g): hr_apply''s installed body does not declare c_delta_keys — the derivation this gate rests on is gone and (6b) would be a retyped catalogue.';
  end if;
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_state
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_party_tick_settle';
  select array(select m[1] from regexp_matches(
           substring(v_state from 'c_delta_ok[^;]*;'), '''([a-z_]+)''', 'g') m order by 1)
    into v_ours;
  if coalesce(array_length(v_ours, 1), 0) < 10 then
    raise exception 'GATE(g): could not read hr_party_tick_settle''s own c_delta_ok list back out of its installed body (% entries).', coalesce(array_length(v_ours, 1), 0);
  end if;
  foreach t in array v_ours loop
    if position('''' || t || '''' in substring(v_apply from 'c_delta_keys[^;]*;')) = 0 then
      raise exception 'GATE(g): hr_party_tick_settle accepts the delta key "%" and hr_apply''s c_delta_keys does NOT. In SHADOW the settle returns before hr_apply ever sees the object, so this would accumulate 48 h of parity evidence for a payload that cannot be paid — Security S-1, exactly.', t;
    end if;
  end loop;

  -- (c)..(f)(h) need rows. ── SUBTRANSACTION ─────────────────────────────────
  begin
    insert into auth.users (id) values (v_a), (v_b);
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'created', v_r->>'ok') is distinct from 'true' then
      raise exception 'GATE: no probe character A: %', v_r; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'created', v_r->>'ok') is distinct from 'true' then
      raise exception 'GATE: no probe character B: %', v_r; end if;
    perform set_config('request.jwt.claim.sub', '', true);

    select now() into v_now;
    v_from := date_trunc('second', v_now) - interval '90 seconds';
    v_to   := date_trunc('second', v_now) - interval '1 second';

    -- A TWO-MEMBER PARTY ON A LIVE HUNT, both characters on combat, both
    -- watermarks EQUAL to the party's (invariant 8 established).
    insert into public.party (leader_user, leader_slot) values (v_a, 0) returning id into v_p;
    insert into public.party_member (party_id, user_id, slot, role)
      values (v_p, v_a, 0, 'leader'), (v_p, v_b, 0, 'member');
    insert into public.party_hunt (party_id, active_id, accrued_to)
      values (v_p, 'slime', v_from) returning id into v_h;
    update public.player_state
       set active_kind = 'combat', active_id = 'slime', active_since = v_from,
           accrued_to = v_from
     where user_id in (v_a, v_b) and slot = 0;
    update public.hr_tick_config
       set enabled = true, shadow = true, channels = array['combat','gather']::text[]
     where id;

    -- ══ (c) THE TWO ROSTERS ARE DISJOINT FOR A PLANTED PARTY MEMBER (S-8) ══
    --    File 1 §7(d) asserts the per-character roster does not offer them;
    --    this half asserts the PARTY roster DOES, so "disjoint" is a partition
    --    rather than two empty sets. A character served by neither is a
    --    character whose night is silently eaten.
    insert into public.hr_tick_ownership (user_id, slot, channel, owned)
      values (v_a, 0, 'combat', true), (v_b, 0, 'combat', true)
      on conflict (user_id, slot, channel) do update set owned = true;
    select count(*) into v_n from public.hr_tick_roster(array['combat']::text[], 0, 50, 'gate-s2b')
     where user_id in (v_a, v_b);
    if v_n <> 0 then
      raise exception 'GATE(c): the PER-CHARACTER roster offered % partied character(s). The two rosters are NOT disjoint and the solo settle would pay one member the whole party stream while the party settle failed its CAS (S-8).', v_n;
    end if;
    select count(*) into v_n from public.hr_party_roster(array['combat']::text[], 50, 'gate-s2b')
     where party_id = v_p;
    if v_n <> 1 then
      raise exception 'GATE(c): the PARTY roster offered the planted party % time(s), not once. Disjoint is a PARTITION: a character served by neither roster has their night silently eaten, which is the failure mode this half exists to refuse.', v_n;
    end if;
    select * into v_row from public.hr_party_roster(array['combat']::text[], 50, 'gate-s2b')
     where party_id = v_p;
    if v_row.member_count <> 2 or jsonb_array_length(v_row.members) <> 2 then
      raise exception 'GATE(c): the party roster row carries % member_count and % nested member(s).', v_row.member_count, jsonb_array_length(v_row.members);
    end if;
    -- §2's RULE: the tick never assembles a character out of parts.
    if (v_row.members->0->'state'->>'ok') is distinct from 'true' then
      raise exception 'GATE(c): a rostered member carries no hr_state_of envelope. The tick would have to assemble the character out of parts, which is the one thing §2 forbids.';
    end if;

    -- Build the two member objects the settle is called with.
    select jsonb_agg(jsonb_build_object(
             'user', ps.user_id, 'slot', ps.slot, 'version', ps.version,
             'delta', jsonb_build_object(
               'gold', 7, 'accrued_to', v_to,
               'journal', jsonb_build_object(
                 'kind', 'combat', 'intent', 'accrue',
                 'meta', jsonb_build_object(
                   'ms', 89000, 'ticks', 8, 'kills', 2, 'capped', false, 'ate', 0,
                   'from', v_from, 'to', v_to, 'src', 'tick',
                   'party', jsonb_build_object(
                     'id', v_p, 'hunt', v_h, 'dmg_bp', 5000, 'xp_bp', 5000,
                     'floor', 0, 'fellow_bp', 500, 'roll', 1234))))))
      into v_mem
      from public.player_state ps
     where ps.user_id in (v_a, v_b) and ps.slot = 0;

    select count(*) into v_ledg from public.player_ledger where user_id in (v_a, v_b);
    select ps.gold, ps.version into v_gold, v_vers
      from public.player_state ps where ps.user_id = v_a and ps.slot = 0;

    -- ══ (d) THE PARTIAL-SETTLE MUTANT — ZERO ROWS WRITTEN ANYWHERE (S-9) ═══
    --    A member set the CAS must reject. TWO shapes, because they fail at
    --    two different steps and a gate that only plants one grades half the
    --    fence:
    --      (i)  a SHORT member set — one member of a live two, which is the
    --           literal partial settle: three members paid a split computed
    --           from four contributors is a MINT.
    --      (ii) a STALE VERSION on the second member, which is the ordinary
    --           concurrency failure and must take the whole call down with it.
    v_r := public.hr_party_tick_settle('gate-s2b', v_p, v_from, v_to,
             gen_random_uuid(), jsonb_build_array(v_mem->0));
    if coalesce(v_r->>'error','') <> 'party_window_already_settled' then
      raise exception 'GATE(d): a SHORT member set (1 of 2 live members) answered %. It must refuse the WHOLE call: a partial settle pays some members a split computed from all of them, which is a mint, and it is the one defect that cannot be recovered after the fact (S-9, §18-SEC.2 8b-ii).', v_r;
    end if;
    select count(*) into v_n from public.hr_tick_shadow where user_id in (v_a, v_b);
    if v_n <> 0 then
      raise exception 'GATE(d): the refused SHORT settle wrote % hr_tick_shadow row(s). All-or-nothing means nothing.', v_n;
    end if;

    v_r := public.hr_party_tick_settle('gate-s2b', v_p, v_from, v_to, gen_random_uuid(),
             jsonb_build_array(v_mem->0,
               jsonb_set(v_mem->1, '{version}', to_jsonb((v_mem->1->>'version')::bigint + 99))));
    if coalesce(v_r->>'error','') <> 'party_window_already_settled'
       or coalesce(v_r#>>'{why}','') <> 'version_conflict' then
      raise exception 'GATE(d): a STALE VERSION on the SECOND member answered %. One member''s concurrency failure must take the whole call down: the alternative pays the other member from a window the second was also in.', v_r;
    end if;
    select count(*) into v_n from public.hr_tick_shadow where user_id in (v_a, v_b);
    select count(*) into v_m from public.player_ledger where user_id in (v_a, v_b);
    select ps.gold into v_gold2 from public.player_state ps where ps.user_id = v_a and ps.slot = 0;
    if v_n <> 0 or v_m <> v_ledg or v_gold2 <> v_gold then
      raise exception 'GATE(d): the refused settle wrote % shadow row(s), % ledger row(s) and moved the FIRST member''s gold from % to %. ZERO ROWS ANYWHERE is the assertion (S-9).', v_n, v_m - v_ledg, v_gold, v_gold2;
    end if;
    if exists (select 1 from public.party_tick_lease
                where party_id = v_p and shadow_accrued_to is not null) then
      raise exception 'GATE(d): the refused settle advanced the party''s shadow watermark. The window must be intact.';
    end if;

    -- ══ (d-ii) THE SAME MEMBER TWICE — `[A, A]` AGAINST A LIVE `{A, B}` ═══
    --    The count matches (two declared, two live) and the set does not. Every
    --    count-only form of the re-count accepts this, and what it buys is a
    --    settle where one member is paid twice out of a split computed for two
    --    people — a mint with a plausible shape, which is why the DISTINCT
    --    match count is the third term of (6)'s predicate rather than a
    --    tidiness.
    v_r := public.hr_party_tick_settle('gate-s2b', v_p, v_from, v_to,
             gen_random_uuid(), jsonb_build_array(v_mem->0, v_mem->0));
    if coalesce(v_r->>'error','') <> 'party_window_already_settled' then
      raise exception 'GATE(d-ii): a member set naming the SAME member twice answered %. The counts match and the sets do not; the DISTINCT match count is what refuses it, and what it would otherwise buy is one member paid twice from a split computed for two people.', v_r;
    end if;
    select count(*) into v_n from public.hr_tick_shadow where user_id in (v_a, v_b);
    if v_n <> 0 then
      raise exception 'GATE(d-ii): the duplicate-member refusal wrote % shadow row(s).', v_n;
    end if;

    -- ══ (d-iii) INVARIANT 8, PLANTED AND REFUSED ═══════════════════════════
    --    A member whose own `player_state.accrued_to` is AHEAD of the party's.
    --    §18.2.4: that is *"a BROKEN INVARIANT, not a case to handle"* — the
    --    settle refuses the whole party and NAMES the member, and the old
    --    drag-forward rule is DELETED rather than softened (S-3). Planted here
    --    because the honest fixture never exercises it: a check that no arm can
    --    make fire is a check no mutation can take away.
    update public.player_state set accrued_to = v_from + interval '30 seconds'
     where user_id = v_b and slot = 0;
    v_r := public.hr_party_tick_settle('gate-s2b', v_p, v_from, v_to,
             gen_random_uuid(), v_mem);
    if coalesce(v_r->>'error','') <> 'party_window_already_settled'
       or coalesce(v_r->>'why','') <> 'invariant_8' then
      raise exception 'GATE(d-iii): a member whose accrued_to is AHEAD of the party''s answered %. Invariant 8 says the party watermark IS the member''s watermark for the life of the hunt; an inequality either way is a BROKEN INVARIANT and the settle must refuse the whole party and name the member (S-3, §18.2.4).', v_r;
    end if;
    select count(*) into v_n from public.hr_tick_shadow where user_id in (v_a, v_b);
    if v_n <> 0 then
      raise exception 'GATE(d-iii): the invariant-8 refusal wrote % shadow row(s).', v_n;
    end if;
    update public.player_state set accrued_to = v_from where user_id = v_b and slot = 0;
    -- The version moved twice; rebuild the member payload against it.
    select jsonb_agg(jsonb_build_object(
             'user', ps.user_id, 'slot', ps.slot, 'version', ps.version,
             'delta', v_mem->0->'delta'))
      into v_mem
      from public.player_state ps
     where ps.user_id in (v_a, v_b) and ps.slot = 0;

    -- ══ (d-iv) THE WATERMARK PROBE ANSWERS, AND WRITES NOTHING ═════════════
    --    The driver's ONLY way to learn the party's true watermark, the MODE
    --    and the per-member carrier: a deliberately stale window and a minimal
    --    delta, refused by the CAS, carrying all three. `party_tick_lease` is
    --    readable by no role and `hr_party_roster` is hr_tick's, so if this
    --    refusal did not answer, the driver would have to take the watermark
    --    from its own POST body — which is the authority this whole fence
    --    exists to keep out of a request.
    v_r := public.hr_party_tick_settle('gate-s2b', v_p,
             '1970-01-01T00:00:00Z'::timestamptz, v_now, gen_random_uuid(),
             (select jsonb_agg(jsonb_build_object('user', pm.user_id, 'slot', pm.slot,
                       'delta', jsonb_build_object('accrued_to', v_now)))
                from public.party_member pm
               where pm.party_id = v_p and pm.left_at is null));
    if coalesce(v_r->>'error','') <> 'party_window_already_settled' then
      raise exception 'GATE(d-iv): the watermark PROBE answered % rather than party_window_already_settled. The driver has no other way to read the party''s mark: hr_party_roster is hr_tick''s and party_tick_lease is readable by nobody, so a probe that cannot be answered forces the watermark into the POST body.', v_r;
    end if;
    if (v_r->>'accrued_to') is null or (v_r->>'shadow') is null then
      raise exception 'GATE(d-iv): the probe refusal carries accrued_to=% and shadow=%. The driver must know the MODE before it settles, because sending a carrier on the armed branch is a refusal by design.', v_r->>'accrued_to', v_r->>'shadow';
    end if;
    if (v_r->>'accrued_to')::timestamptz <> v_from then
      raise exception 'GATE(d-iv): the probe reported the mark as % and the party watermark is %.', v_r->>'accrued_to', v_from;
    end if;
    select count(*) into v_n from public.hr_tick_shadow where user_id in (v_a, v_b);
    if v_n <> 0 then
      raise exception 'GATE(d-iv): the probe WROTE % row(s). It must write nothing at all.', v_n;
    end if;

    -- ══ (e) B-A5 — THE NESTED KEY SET IS AN EQUALITY, BOTH DIRECTIONS ══════
    --    An EIGHTH key and a MISSING key alike. `metaProblems()` checks
    --    TOP-LEVEL keys only, so nesting buys the count and does not buy a
    --    bound; without this, journal.meta.party is unbounded.
    v_r := public.hr_party_tick_settle('gate-s2b', v_p, v_from, v_to, gen_random_uuid(),
             jsonb_build_array(
               jsonb_set(v_mem->0, '{delta,journal,meta,party,leader}', 'true'::jsonb),
               v_mem->1));
    if coalesce(v_r->>'error','') <> 'bad_party_meta' then
      raise exception 'GATE(e): an EIGHTH key on journal.meta.party answered %. B-A5: the nested key set must be an EQUALITY, not a minimum — nesting buys the flat allowlist''s count and buys no bound at all.', v_r;
    end if;
    v_r := public.hr_party_tick_settle('gate-s2b', v_p, v_from, v_to, gen_random_uuid(),
             jsonb_build_array(
               jsonb_build_object('user', v_mem->0->>'user', 'slot', (v_mem->0->>'slot')::int,
                 'version', (v_mem->0->>'version')::bigint,
                 'delta', (v_mem->0->'delta') #- '{journal,meta,party,roll}'),
               v_mem->1));
    if coalesce(v_r->>'error','') <> 'bad_party_meta' then
      raise exception 'GATE(e): a MISSING key on journal.meta.party answered %. The equality is both directions: a settle that dropped `roll` would journal an unreplayable drop assignment (T-1).', v_r;
    end if;
    -- S-1: a TOP-LEVEL party key is `unknown_delta_key`, which is what hr_apply
    -- would answer and what the shadow branch must answer in its place.
    v_r := public.hr_party_tick_settle('gate-s2b', v_p, v_from, v_to, gen_random_uuid(),
             jsonb_build_array(
               jsonb_set(v_mem->0, '{delta,party}', to_jsonb(v_p::text)), v_mem->1));
    if coalesce(v_r->>'error','') <> 'unknown_delta_key' then
      raise exception 'GATE(e): a TOP-LEVEL `party` key on the delta answered %. Attribution is JOURNAL, never DELTA (S-1), and in SHADOW this check is the only thing between 48 h of parity evidence and a payload hr_apply refuses by name.', v_r;
    end if;
    -- Invariant 8's backstop: a STAMPING key is a loud refusal.
    v_r := public.hr_party_tick_settle('gate-s2b', v_p, v_from, v_to, gen_random_uuid(),
             jsonb_build_array(
               jsonb_set(v_mem->0, '{delta,activity}', '{"kind":"idle","id":null}'::jsonb),
               v_mem->1));
    if coalesce(v_r->>'error','') <> 'delta_would_stamp' then
      raise exception 'GATE(e): an `activity` key on a party delta answered %. guardStampKeys() is the BACKSTOP and this is the fence: the day someone adds a stamping key to a party delta it must be a loud refusal rather than the silent confiscation of four players'' nights at once (§18.2.3 invariant 8).', v_r;
    end if;

    -- ══ (f) THE CARRIER'S THREE REFUSAL NAMES (RE-VERIFY 5), PER MEMBER ════
    v_r := public.hr_party_tick_settle('gate-s2b', v_p, v_from, v_to, gen_random_uuid(),
             jsonb_build_array(jsonb_set(v_mem->0, '{shadow_state}', '"nope"'::jsonb), v_mem->1));
    if coalesce(v_r->>'error','') <> 'bad_shadow_state' then
      raise exception 'GATE(f): a non-object carrier answered % rather than bad_shadow_state.', v_r;
    end if;
    v_r := public.hr_party_tick_settle('gate-s2b', v_p, v_from, v_to, gen_random_uuid(),
             jsonb_build_array(
               jsonb_set(v_mem->0, '{shadow_state}',
                 jsonb_build_object('v', 1, 'pad', repeat('x', 17000))), v_mem->1));
    if coalesce(v_r->>'error','') <> 'shadow_state_too_large' then
      raise exception 'GATE(f): a 17 KiB carrier answered % rather than shadow_state_too_large. RE-VERIFY 5''s bound is OCTETS and is per member; without a countable NAME the batch aborts on a check_violation instead.', v_r;
    end if;
    update public.hr_tick_config set shadow = false where id;
    v_r := public.hr_party_tick_settle('gate-s2b', v_p, v_from, v_to, gen_random_uuid(),
             jsonb_build_array(
               jsonb_set(v_mem->0, '{shadow_state}', jsonb_build_object('v', 1)), v_mem->1));
    if coalesce(v_r->>'error','') <> 'shadow_state_while_armed' then
      raise exception 'GATE(f): a carrier presented on an ARMED settle answered %. Design constraint 2: the branch that PAYS must never silently accept an argument built for the branch that does not — that is how a stale proposal reaches hr_apply.', v_r;
    end if;
    select count(*) into v_m from public.player_ledger where user_id in (v_a, v_b);
    if v_m <> v_ledg then
      raise exception 'GATE(f): the armed refusal PAID (% new ledger row(s)). It is refused before the lock, before the lease and a very long way before hr_apply.', v_m - v_ledg;
    end if;
    update public.hr_tick_config set shadow = true where id;

    -- ══ (h) THE SHADOW BRANCH JOURNALS AND PAYS NOTHING ════════════════════
    --    One row per member; the attribution LIFTED into the column; the delta
    --    stored key-for-key a SOLO settle's; the party mark advanced; zero
    --    ledger rows and an unmoved player_state.
    v_r := public.hr_party_tick_settle('gate-s2b', v_p, v_from, v_to,
             gen_random_uuid(), v_mem);
    if coalesce(v_r->>'ok','') <> 'true' or coalesce(v_r->>'mode','') <> 'shadow'
       or coalesce(v_r->>'journalled','') <> '2' then
      raise exception 'GATE(h): the honest two-member shadow settle answered %.', v_r;
    end if;
    select count(*) into v_n from public.hr_tick_shadow
     where user_id in (v_a, v_b) and party is not null;
    if v_n <> 2 then
      raise exception 'GATE(h): % hr_tick_shadow row(s) carry a party attribution, not 2. The parity read of §18.2.6 groups on that column and measures nothing without it.', v_n;
    end if;
    -- ★ THE DELTA IS A SOLO SETTLE'S, BYTE FOR BYTE — (P-a) as a stored fact.
    select delta into v_delta from public.hr_tick_shadow
     where user_id = v_a and slot = 0 and party is not null;
    if v_delta #> '{journal,meta,party}' is not null then
      raise exception 'GATE(h): the stored shadow delta still carries journal.meta.party. The attribution belongs in the COLUMN; leaving it in the delta makes §18.2.6 (P-a) degenerate parity false by construction, which is the whole of S-1.';
    end if;
    select array(select jsonb_object_keys(v_delta #> '{journal,meta}') order by 1) into v_keys;
    if 'party' = any (v_keys) then
      raise exception 'GATE(h): journal.meta still lists `party` after the lift.';
    end if;
    select party into v_delta from public.hr_tick_shadow
     where user_id = v_a and slot = 0 and party is not null;
    select array(select jsonb_object_keys(v_delta) order by 1) into v_keys;
    if v_keys <> array['dmg_bp','fellow_bp','floor','hunt','id','roll','xp_bp'] then
      raise exception 'GATE(h): hr_tick_shadow.party carries %, not the frozen seven (B-A5).', v_keys;
    end if;
    select count(*) into v_m from public.player_ledger where user_id in (v_a, v_b);
    select ps.gold, ps.version into v_gold2, v_n
      from public.player_state ps where ps.user_id = v_a and ps.slot = 0;
    if v_m <> v_ledg or v_gold2 <> v_gold or v_n <> v_vers then
      raise exception 'GATE(h): SHADOW PAID. % ledger row(s), gold % -> %, version % -> %. The shadow branch returns BEFORE hr_apply and there is no call site on it.', v_m - v_ledg, v_gold, v_gold2, v_vers, v_n;
    end if;
    if (select accrued_to from public.party_hunt where id = v_h) <> v_from then
      raise exception 'GATE(h): the shadow settle moved party_hunt.accrued_to. In shadow the party chains on party_tick_lease.shadow_accrued_to — chaining on the paid watermark while paying nothing produces overlapping windows and a parity number that lies upward (§15c).';
    end if;
    if (select shadow_accrued_to from public.party_tick_lease where party_id = v_p) <> v_to then
      raise exception 'GATE(h): the shadow settle did not stamp the party''s shadow watermark.';
    end if;

    -- ══ (i) THE SAME intent_id IS A NO-OP, AND THE CAS REFUSES THE REPLAY ═══
    v_r := public.hr_party_tick_settle('gate-s2b', v_p, v_from, v_to,
             gen_random_uuid(), v_mem);
    if coalesce(v_r->>'error','') <> 'party_window_already_settled' then
      raise exception 'GATE(i): re-proposing a SETTLED window answered %. The CAS refuses it on arithmetic, before the idempotency index is ever consulted (T-7).', v_r;
    end if;
    select count(*) into v_n from public.hr_tick_shadow where user_id in (v_a, v_b);
    if v_n <> 2 then
      raise exception 'GATE(i): the replay wrote a third shadow row (% total).', v_n;
    end if;

    raise exception using errcode = 'HR827', message = 'm8-parties-s2-2 §5 complete — rolling back';
  exception when sqlstate 'HR827' then null;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  -- ══ (j) hr_tick_shadow's CHANNEL CHECK IS UNCHANGED ═════════════════════
  if not exists (select 1 from pg_constraint c
                  join pg_class r on r.oid = c.conrelid
                  join pg_namespace n on n.oid = r.relnamespace
                 where n.nspname = 'public' and r.relname = 'hr_tick_shadow'
                   and c.conname = 'hr_tick_shadow_channel_ck'
                   and pg_get_constraintdef(c.oid) not like '%party%') then
    raise exception 'GATE(j): hr_tick_shadow_channel_ck moved. `party` is a unit of SCHEDULING, not a kind of work: a party settle writes ordinary channel = combat rows and neither CHECK widens (§18.2.1a).';
  end if;

  -- ══ (k) B-A3 — THE HANDLER NAMES ITS EXCEPTION AND DOES NOT SAY `others` ══
  --    Read off the INSTALLED body with comments stripped, so a `when others`
  --    hiding behind a comment cannot pass. A party ended because the
  --    arithmetic threw, or because a deadlock an adversary provoked landed, is
  --    a defect that must be LOUD — and `member_unpayable:<user>` names an
  --    innocent player for it.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_state
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_party_tick_settle';
  if v_state is null then
    raise exception 'GATE(k): hr_party_tick_settle did not install.';
  end if;
  if v_state ~* 'exception[[:space:]]+when[[:space:]]+others' then
    raise exception 'GATE(k): hr_party_tick_settle carries `exception when others`. B-A3: that also catches a deadlock (40P01), a lock timeout, a statement cancellation and a bug in the split, and turns each into "end the party hunt, blame a member" — two of which an adversary can provoke. Catch the NAMED condition and RE-RAISE the rest.';
  end if;
  if position('HR826' in v_state) = 0 then
    raise exception 'GATE(k): hr_party_tick_settle does not raise or catch the reserved member-unpayable SQLSTATE. S-9''s roll-the-fan-out-back rule has no signal to travel on.';
  end if;
  if position('member_unpayable:' in v_state) = 0 then
    raise exception 'GATE(k): the armed handler does not stamp stopped_by = member_unpayable:<user>. Without it the hunt stays live, hr_partied stays true, the four characters are excluded from the per-character roster forever and the window grows against the 24 h cap until a night is silently eaten (S-9).';
  end if;
  -- AND THE ARMED BRANCH REACHES hr_apply, ONCE, INSIDE THE SUB-BLOCK. An
  -- armed branch that never called it would pass every shadow arm above and
  -- pay nobody the day the operator flips the switch.
  if position('hr_apply(' in v_state) = 0 then
    raise exception 'GATE(k): the armed branch does not call hr_apply. hr_apply is the ONLY money writer (CLAUDE.md §6) and the armed branch is the whole reason this is a money-surface review.';
  end if;

  -- ══ (z) THE BLOCK LEAVES NO ROWS ═══════════════════════════════════════
  if exists (select 1 from public.party_hunt)
     or exists (select 1 from public.party_tick_lease)
     or exists (select 1 from public.hr_tick_shadow where user_id in (v_a, v_b))
     or exists (select 1 from public.player_ledger where user_id in (v_a, v_b))
     or exists (select 1 from public.player_state where user_id in (v_a, v_b))
     or exists (select 1 from public.party_member where user_id in (v_a, v_b))
     or exists (select 1 from public.hr_tick_ownership where user_id in (v_a, v_b))
     or exists (select 1 from auth.users where id in (v_a, v_b)) then
    raise exception 'GATE(z): §5 LEAKED a probe row';
  end if;
  select (select count(*) from public.party_hunt)
       + (select count(*) from public.party_tick_lease)
       + (select count(*) from public.hr_tick_shadow where party is not null) into v_n;
  if v_n <> 0 then
    raise exception 'GATE(z): % party row(s) survive the apply. This batch ships EMPTY.', v_n;
  end if;
  -- And the kill switch is back where it was found: this block flipped
  -- `shadow` twice and `enabled` once inside the subtransaction, and the
  -- rollback is the mechanism — but `enabled` and `shadow` are the two booleans
  -- that decide whether the world tick PAYS, and RE-VERIFY 5's S-5 ruled that
  -- no such boolean is left to a rollback that might not take.
  if (select shadow from public.hr_tick_config where id) is not true then
    raise exception 'GATE(z): hr_tick_config.shadow is not TRUE after the apply. This batch ships in SHADOW; arming is S5''s own GO.';
  end if;

  raise notice 'm8-parties-s2-2: hr_party_tick_settle is executable by hr_engine ONLY and hr_party_roster by hr_tick ONLY, asserted for all five roles and PUBLIC, and the identity refusal was CALLED as anon/authenticated/service_role/hr_tick and answered 42501 each time; the settle''s delta vocabulary is a proven SUBSET of hr_apply''s own c_delta_keys parsed out of its installed body (S-1); the two rosters PARTITION a planted party member (per-character 0, party 1, envelopes nested whole); a SHORT member set and a STALE second version each refused the WHOLE call with ZERO rows written anywhere and the window intact (S-9); an eighth key, a missing key, a top-level party key and a stamping key are each refused by name (B-A5, S-1, invariant 8); the carrier''s three refusal names all fire per member and the armed refusal paid nothing; the honest shadow settle wrote one row per member with the attribution LIFTED into the column and the delta byte-for-byte a solo settle''s, moved the party''s SHADOW mark and not its paid one, and paid zero ledger rows; a replayed window is refused by the CAS before the idempotency index; hr_tick_shadow.channel''s CHECK is unchanged; the armed handler names HR826, never `when others`, stamps member_unpayable:<user> and calls hr_apply; and the block left ZERO rows behind with shadow still TRUE';
end $$;
