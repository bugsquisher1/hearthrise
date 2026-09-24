-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-24-m8-parties-s4-1-boundary-budget.sql — M8 SLICE 4, FILE 1 OF 3:
--   S-6's BOUNDARY BUDGET AS A JOURNAL, B-A1's RULING IMPLEMENTED, AND THE
--   EFFECTIVE PARTY WATERMARK READ FROM ONE PLACE.
--
-- Design: docs/planning/WORLD_TICK_DESIGN.md §18.1 ("the price on the lever,
-- and the number is EIGHT"), §18.3, §18.4 T-3/T-3b, §18-SEC.1 S-6, and
-- §18-SEC-2.2 B-A1. SHADOW ONLY: nothing in this batch can move a coin — the
-- only payer in the system is hr_apply, reached only from
-- hr_party_tick_settle's armed branch (S2), and `hr_tick_config.shadow` is
-- still TRUE. §5(z) asserts that rather than trusting it.
--
-- ⚠ THIS IS A MONEY-SURFACE REVIEW EVEN THOUGH IT PAYS NOTHING TODAY
--   (§18-SEC.3, Correction 1). S4's verbs decide WHEN a party window is cut,
--   and cutting a window re-simulates its kills and re-assigns its drops. The
--   money moves later, on an operator `update`, with no further code review in
--   between.
--
-- ── WHAT LANDS HERE ─────────────────────────────────────────────────────────
--   public.party_settle_boundary   the append-only journal of FORCED boundaries
--   hr_party_boundaries_today(uuid) -> int      how many today, per party
--   hr_party_boundary_room(uuid) -> boolean     THE EIGHT, written ONCE
--   hr_party_mark(uuid) -> timestamptz          THE effective party watermark
--   hr_party_settle_current(uuid) -> boolean    has the open window been settled?
--   party_hunt.stance  -> FK public.hr_hunt_stances (M6's vocabulary, reused)
--   party_hunt.stop    -> CHECK public.hr_hunt_stop_valid (M6's, reused)
--
-- File 2 is the two hunt intents and the kick/leave patches. File 3 is the
-- client-surface record (S-14). Read the three as ONE BATCH, applied in one
-- sitting, in order: file 2 grants EXECUTE on two new verbs to `authenticated`
-- and file 3 records them in hr_client_rpc_baseline, so between them the
-- nightly `hr-grant-hygiene` cron RAISES on `unapproved_client_rpcs` — and a
-- detector expected to be red hides the next real regression.
--
-- ══ B-A1 — THE RULING §18-SEC-2.2 ASKED S4 FOR, IN THE DESIGN'S OWN TERMS ══
--
-- The question: *"do party_hunt_start/party_hunt_stop count against S-6's eight
-- membership-forced settle boundaries per party per UTC day?"*
--
--   THE RULING IS **YES**, FOR BOTH, AGAINST THE SAME EIGHT.
--
-- §18.1 prices a **BOUNDARY**, not a verb, and says so in the sentence that
-- keeps `party_leave` unclamped: *"the clamp here is on the BOUNDARY, not on
-- the VERB."* Read that way the question answers itself. What S-6 measured is
-- *"every join, leave and kick forces a settle boundary at an instant a player
-- chooses, and cutting a window short re-simulates its kills and re-assigns its
-- drops."* A `party_hunt_stop` cuts the open party window at an instant the
-- leader chooses — that is the same act, performed by the same player, on the
-- same window, for the same dice. A `party_hunt_start` closes FOUR characters'
-- own open windows at an instant the leader chooses, and §18.1 says so
-- (*"the start closes four windows at once"*): it is the lever at four
-- characters at once, THREE OF WHOM ARE NOT THE PLAYER PRESSING THE BUTTON.
-- Counting a leave and not a stop would be clamping the verb, which is exactly
-- what §18.1 says it is not doing.
--
-- **THE HONEST WRINKLE, WRITTEN DOWN RATHER THAN LEFT TO BE FOUND.** Under §5
-- below a start does not itself cut anybody's window: it REFUSES unless every
-- member's window is already closed to one common instant (`member_uncollectable`,
-- §5 of file 2), so the cut happens one call further out, in the collect the
-- `collectsFirst: true` edge half performs. The lever is the same lever — the
-- leader's button is what causes the collect — and the clamp has to sit where
-- it can see the PARTY, which only the RPC can. So the boundary is counted
-- here, at the verb that causes it, and the argument is recorded so the next
-- reader does not mistake "the start does not cut a window itself" for "the
-- start is not a boundary".
--
-- ── AND THE ASYMMETRY IS IN THE CONSEQUENCE, NEVER IN THE COUNT ────────────
-- §18.1: *"no refusal can ever hold a player in a party."* The same sentence
-- must be true of a HUNT, because a hunt is the thing the party is doing to the
-- player's character. So past the eighth boundary:
--
--   party_hunt_stop / party_leave / party_kick  LAND IMMEDIATELY. The hunt ends
--     or the member is removed at once and the last window is paid on the
--     tick's own cadence, the way §18.1 already promises for a leave. Nothing
--     is lost: `ended_at` makes `hr_partied` false, invariant 7 stops excluding
--     those characters, and the per-character roster prices each of them from
--     their own player_state.accrued_to — which invariant 8 has kept equal to
--     the party watermark. The answer carries `notice: 'party_settle_churn'`
--     and `ok: true`, because §18.3's own cell says it is *"not a refusal of
--     the leave"*.
--   party_hunt_start  IS REFUSED, `party_settle_churn`. There is no hunt to
--     defer and nothing to pay on a later flush, so "land it now and pay later"
--     has no content; and a refused start holds nobody anywhere — it says "not
--     again today", which is the whole of what the budget is for.
--
-- ── WHY A JOURNAL TABLE AND NOT A COUNTER COLUMN ──────────────────────────
-- §18.1 requires the boundary to be **journalled**, and a counter column is a
-- number with no audit behind it: nothing could ever say WHICH eight, or by
-- whom, or whether the ninth was honoured immediately as promised. It is also
-- the wrong grain — `player_progress` is keyed per (user, slot) and this budget
-- is per PARTY, exactly as party_kick's 20/day is counted off
-- party_member.removed_by rather than off the leader's character, so a
-- leadership transfer cannot reset it.
--
-- APPEND-ONLY, and the rows are cheap: eight per party per day is the ceiling
-- BY CONSTRUCTION — past the eighth nothing is written, because past the eighth
-- no boundary is forced.
--
-- ── ONE READING OF THE WATERMARK, NOT A FOURTH COPY ───────────────────────
-- `hr_party_tick_settle` (§5a) and `hr_party_roster` (§2) each compute the
-- effective party watermark with the same `case when cfg.shadow then
-- greatest(…) else h.accrued_to end`, and the settle's own comment says why the
-- two must never disagree about a window boundary. S4's verbs need the SAME
-- answer to decide whether the open window has been settled, and a third
-- hand-typed copy is how the third one drifts. `hr_party_mark` is that one
-- reading, and §7(b) does not trust it: it EXECUTES the roster's answer and the
-- settle's own CAS-refusal answer against it, in BOTH modes, and refuses to
-- install if any two disagree.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   drop function if exists public.hr_party_settle_current(uuid);
--   drop function if exists public.hr_party_mark(uuid);
--   drop function if exists public.hr_party_boundary_room(uuid);
--   drop function if exists public.hr_party_boundaries_today(uuid);
--   drop table    if exists public.party_settle_boundary;
--   alter table public.party_hunt drop constraint if exists party_hunt_stance_fk;
--   alter table public.party_hunt drop constraint if exists party_hunt_stop_shape;
-- File 2 must come out first: its verbs call all three functions.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.party') is null
     or to_regclass('public.party_member') is null then
    raise exception 'PRECONDITION: the S1 party tables are absent — apply 2026-09-23-m8-parties-s1-1-tables.sql first.';
  end if;
  if to_regclass('public.party_hunt') is null
     or to_regclass('public.party_tick_lease') is null then
    raise exception 'PRECONDITION: the S2 session objects are absent — apply 2026-09-23-m8-parties-s2-1-hunt-tables.sql first. S4 cannot land before S2 or S3 (§18-SEC.3, Correction 2): T-3''s kick CALLS the settle, which calls the split.';
  end if;
  if to_regprocedure('public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)') is null
     or to_regprocedure('public.hr_party_roster(text[],integer,text,integer,timestamptz,uuid)') is null then
    raise exception 'PRECONDITION: hr_party_tick_settle or hr_party_roster is absent — apply 2026-09-23-m8-parties-s2-2-roster-settle.sql first. §7(b) below EXECUTES both against hr_party_mark and refuses to install if they disagree about a window boundary.';
  end if;
  if to_regclass('public.hr_hunt_stances') is null
     or to_regprocedure('public.hr_hunt_stop_valid(jsonb)') is null then
    raise exception 'PRECONDITION: M6''s hunt-order vocabulary is absent — apply 2026-09-22-hunt-stance-stop.sql first. §18 rev.2 says the M6 shapes are the vocabulary: REUSE, do not fork.';
  end if;
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'PRECONDITION: hr_utc_day_key is absent — the budget is a SERVER day key, never a client one.';
  end if;
  if to_regclass('public.hr_tick_config') is null then
    raise exception 'PRECONDITION: hr_tick_config is absent — hr_party_mark reads the MODE off it and fails safe to shadow.';
  end if;
end $$;

-- ── 2. public.party_settle_boundary — S-6's LEVER, PRICED AND JOURNALLED ───
-- One row per FORCED settle boundary. "Forced" is the whole of it: a boundary
-- the tick would have reached on its own cadence is not one, and is not
-- counted, because nobody chose its instant.
create table if not exists public.party_settle_boundary (
  id       bigint generated always as identity primary key,
  party_id uuid not null references public.party(id) on delete cascade,
  -- THE SERVER'S DAY KEY, stamped from the server clock through the one
  -- function that answers "which UTC day is it". A client-supplied day is a
  -- budget the client resets.
  day_key  text not null,
  at       timestamptz not null default now(),
  -- WHICH verb forced it, so `vitals.mjs --refusals` and the Analyzer can tell
  -- a party that reshuffles its roster from one that restarts its hunt.
  verb     text not null check (verb in ('party_hunt_start','party_hunt_stop',
                                         'party_leave','party_kick')),
  -- WHO chose the instant. For a kick this is the LEADER, not the member being
  -- removed: the lever belongs to the player pressing the button.
  user_id  uuid not null references auth.users(id) on delete cascade,
  slot     int  not null
);
comment on table public.party_settle_boundary is
  'M8 S4 (2026-09-24), Security S-6 / B-A1. THE APPEND-ONLY JOURNAL OF '
  'PLAYER-CHOSEN SETTLE BOUNDARIES, at PARTY grain: at most EIGHT per party '
  'per UTC day (§18.1), counting party_hunt_start and party_hunt_stop as well '
  'as party_leave and party_kick, because §18.1 prices the BOUNDARY and not '
  'the VERB. Cutting a window short re-simulates its kills and re-assigns its '
  'drops, so the instant is the lever; past the eighth a stop, a leave and a '
  'kick all LAND IMMEDIATELY and are paid on the tick''s own cadence (no '
  'refusal may hold a player in a party or in a hunt), while a start is '
  'refused party_settle_churn. Written ONLY by the SECURITY DEFINER verbs; no '
  'client policy, no client grant, and nothing reads it but '
  'hr_party_boundaries_today.';

create index if not exists party_settle_boundary_day
  on public.party_settle_boundary (party_id, day_key);

alter table public.party_settle_boundary enable row level security;
alter table public.party_settle_boundary force row level security;
-- TABLE PRIVILEGE **AND** RLS, S1's rule and its reason: with the privilege
-- left in place a write RLS filters returns ZERO ROWS RATHER THAN AN ERROR,
-- indistinguishable in a log from a write that was about nothing.
-- service_role is BYPASSRLS — for it the revoke is the ONLY fence.
-- NO POLICY AT ALL: with RLS armed and no policy every client read is refused
-- by ABSENCE, which is party_tick_lease's shape and for its reason — a budget
-- a player can read is a budget a player can plan against.
do $$
begin
  execute 'revoke all on public.party_settle_boundary from public, anon, authenticated, service_role, hr_engine, hr_tick';
end $$;

-- ── 3. hr_party_boundaries_today — HOW MANY OF THE EIGHT ARE SPENT ────────
create or replace function public.hr_party_boundaries_today(p_party uuid)
returns int language sql stable security definer
set search_path = public, pg_catalog as $fn$
  select count(*)::int from public.party_settle_boundary b
   where b.party_id = p_party
     and b.day_key = public.hr_utc_day_key(now());
$fn$;
comment on function public.hr_party_boundaries_today(uuid) is
  'M8 S4 (2026-09-24), Security S-6. How many of §18.1''s EIGHT player-chosen '
  'settle boundaries this party has spent on the server''s current UTC day. '
  'Granted to NOBODY: it is read only from inside the party verbs, and a '
  'client-callable form is a budget a player can plan against and a membership '
  'oracle they can sweep.';
revoke execute on function public.hr_party_boundaries_today(uuid) from public;
revoke execute on function public.hr_party_boundaries_today(uuid)
  from anon, authenticated, service_role;

-- ── 3a. hr_party_boundary_room — THE NUMBER EIGHT, WRITTEN ONCE ──────────
-- Four verbs ask "is there room in the budget", and a literal 8 repeated four
-- times is four numbers that can disagree. §18.1 chose EIGHT *"against ordinary
-- play rather than against the exploit: a four-member party that re-forms its
-- roster twice over a day spends four, and a party that reshuffles every member
-- once spends four more"* — and under B-A1 the same eight now also cover
-- party_hunt_start and party_hunt_stop, which is the ruling this file
-- implements. If the number ever moves it moves HERE, in one edit, and §7(e)
-- proves it is the number by EXECUTION rather than by reading the literal.
create or replace function public.hr_party_boundary_room(p_party uuid)
returns boolean language sql stable security definer
set search_path = public, pg_catalog as $fn$
  select public.hr_party_boundaries_today(p_party) < 8;
$fn$;
comment on function public.hr_party_boundary_room(uuid) is
  'M8 S4 (2026-09-24), Security S-6 / B-A1. THE EIGHT, written once: has this '
  'party any of §18.1''s eight player-chosen settle boundaries left on the '
  'server''s current UTC day? Four verbs ask it — party_hunt_start, '
  'party_hunt_stop, party_leave and party_kick — because §18.1 prices the '
  'BOUNDARY and not the VERB. Granted to NOBODY.';
revoke execute on function public.hr_party_boundary_room(uuid) from public;
revoke execute on function public.hr_party_boundary_room(uuid)
  from anon, authenticated, service_role;

-- ── 4. hr_party_mark — THE EFFECTIVE PARTY WATERMARK, READ ONCE ───────────
-- Byte-for-byte the expression hr_party_tick_settle's CAS compares against and
-- hr_party_roster reports, and §7(b) EXECUTES all three against each other in
-- BOTH modes rather than trusting this comment. NULL when the party has no
-- live hunt, and a NULL is never silently read as "settled": every caller in
-- file 2 tests for the live hunt FIRST.
create or replace function public.hr_party_mark(p_party uuid)
returns timestamptz language sql stable security definer
set search_path = public, pg_catalog as $fn$
  select case when cfg.shadow
              then greatest(h.accrued_to, coalesce(l.shadow_accrued_to, h.accrued_to))
              else h.accrued_to end
    from public.party_hunt h
    join public.party_tick_lease l on l.party_id = h.party_id
   cross join public.hr_tick_config cfg
   where h.party_id = p_party and h.ended_at is null;
$fn$;
comment on function public.hr_party_mark(uuid) is
  'M8 S4 (2026-09-24). THE EFFECTIVE PARTY WATERMARK — where this party''s next '
  'window starts. Armed: party_hunt.accrued_to, which the party''s own payments '
  'move. Shadow: greatest of it and party_tick_lease.shadow_accrued_to, so '
  'windows cannot overlap while nothing is being paid (§15c). The SAME '
  'expression hr_party_tick_settle''s CAS and hr_party_roster compute, read '
  'from ONE place so a third hand-typed copy cannot drift; the migration''s §7 '
  'block executes all three against each other in both modes. NULL when there '
  'is no live hunt — the join to party_tick_lease means it is also NULL before '
  'the first roster fire seeds the lease row, which every caller handles by '
  'testing for the live hunt first. Granted to NOBODY.';
revoke execute on function public.hr_party_mark(uuid) from public;
revoke execute on function public.hr_party_mark(uuid)
  from anon, authenticated, service_role;

-- ── 5. hr_party_settle_current — "HAS THE OPEN WINDOW BEEN SETTLED?" ──────
-- THE ONE PLACE THE SLACK IS WRITTEN. T-3's kick-before-split needs to know
-- whether the collect the `collectsFirst: true` half promised actually
-- happened in THIS request, and three verbs ask it — so the bound lives here
-- and nowhere else.
--
-- ⚠ SIXTY SECONDS, AND IT IS DERIVED RATHER THAN CHOSEN. It is
--   hr_party_tick_settle's own `c_skew` — the interval that function already
--   treats as the distance between two honest clocks. A tighter bound would
--   make an honest collect-then-kick race the server's own clock; a looser one
--   would let a leader kick a full flush window after the last settle, which is
--   T-3 with a smaller number.
--
-- FALSE, never NULL, for a party with no live hunt or no lease row: a caller
-- asking "is the open window settled" about a party with no open window must
-- not be told "yes" by a NULL that a `not` turns into a pass.
create or replace function public.hr_party_settle_current(p_party uuid)
returns boolean language sql stable security definer
set search_path = public, pg_catalog as $fn$
  select coalesce(public.hr_party_mark(p_party) >= now() - interval '60 seconds', false);
$fn$;
comment on function public.hr_party_settle_current(uuid) is
  'M8 S4 (2026-09-24), §18.4 T-3. Has this party''s open window been settled '
  'to within hr_party_tick_settle''s own 60 s clock skew? T-3 (kick-before-'
  'split) requires the settle to have run BEFORE the membership row closes, '
  'and a client verb can never run it itself — hr_party_tick_settle is '
  'hr_engine''s, takes the tick''s lease, and a second settler is exactly what '
  'S-3 and AWAY-12 forbid. So the verb asserts the collect HAPPENED and '
  'refuses party_settle_required with left_at UNWRITTEN when it did not. '
  'Returns FALSE and never NULL for a party with no live hunt. Granted to '
  'NOBODY.';
revoke execute on function public.hr_party_settle_current(uuid) from public;
revoke execute on function public.hr_party_settle_current(uuid)
  from anon, authenticated, service_role;

-- ── 6. party_hunt's ORDER SHAPES — M6's VOCABULARY, REUSED NOT FORKED ─────
-- §18 rev.2: *"Stop orders and stance per §18 rev.2 as data on party_hunt (the
-- M6 hunt-order shapes in src/core/hunt.js are the vocabulary; reuse, do not
-- fork)."* S2 shipped `stance` under a three-value CHECK and `stop` under a
-- jsonb-typeof CHECK, which is a SECOND copy of a catalogue and a THIRD copy of
-- the bounds. Both are replaced by the one authority M6 already installed:
--
--   stance -> FK public.hr_hunt_stances(stance_id). A forged stance is a 23503
--             against the same allowlist hr_apply validates a solo hunt's
--             against, so "the party's stance vocabulary" and "the solo hunt's
--             stance vocabulary" cannot drift apart by an UPDATE.
--   stop   -> CHECK public.hr_hunt_stop_valid(stop). The one definition of the
--             bounds, mirroring src/core/hunt.js STOP_BOUNDS, refusing rather
--             than clamping (a clamp lets a client discover a hidden maximum by
--             pushing at one).
--
-- ADDITIVE, and safe on a live table because the table is EMPTY by §7(z) of the
-- S2 batch and by §7(z) of this one: `party_hunt` ships empty and a hunt exists
-- because a leader started one. The three-value stance CHECK STAYS — it is now
-- redundant with the FK and redundancy in the closing direction costs nothing,
-- whereas dropping a live CHECK to replace it is a window in which neither
-- holds.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.party_hunt'::regclass
                    and conname = 'party_hunt_stance_fk') then
    alter table public.party_hunt
      add constraint party_hunt_stance_fk
      foreign key (stance) references public.hr_hunt_stances(stance_id);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.party_hunt'::regclass
                    and conname = 'party_hunt_stop_shape') then
    alter table public.party_hunt
      add constraint party_hunt_stop_shape
      check (public.hr_hunt_stop_valid(stop));
  end if;
end $$;

comment on column public.party_hunt.stance is
  'HOW the party fights (M8 S4, 2026-09-24). FK to public.hr_hunt_stances — '
  'M6''s id allowlist, the SAME one hr_apply validates a solo hunt''s stance '
  'against. A stance NEVER carries a multiplier, a rate or a bonus.';
comment on column public.party_hunt.stop is
  'WHEN the party stops (M8 S4, 2026-09-24). CHECKed by '
  'public.hr_hunt_stop_valid — M6''s ONE definition of the bounds, mirroring '
  'src/core/hunt.js STOP_BOUNDS. A FLOOR, never an escrow. Evaluated INSIDE '
  'the settle by the one engine; a value outside a bound is REFUSED, never '
  'clamped.';

-- ── 7. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
-- Properties asserted by EXECUTING SQL, not by markers. Every planted row is
-- rolled back at HR827 and COUNTED afterwards.
do $$
declare
  v_a  constant uuid := '00000000-0000-4000-8000-0000b8040011';
  v_b  constant uuid := '00000000-0000-4000-8000-0000b8040012';
  v_p        uuid;
  v_h        uuid;
  v_from     timestamptz;
  v_mark     timestamptz;
  v_roster   timestamptz;
  v_cas      jsonb;
  v_n        bigint;
  v_shadow   boolean;
  v_enabled  boolean;
  v_chan     text[];
  t          text;
begin
  -- (a) THE GRANT MATRIX, PER ROLE, ON ALL THREE NEW FUNCTIONS. None of them
  --     is client-callable: two are membership/budget oracles and one reports a
  --     watermark the caller is not supposed to be able to learn (the settle's
  --     own comment: routing the watermark through anything a request can read
  --     makes "the server picks whose world ticks, and from when" a claim about
  --     a request rather than about a row somebody else wrote).
  foreach t in array array['public.hr_party_boundaries_today(uuid)',
                           'public.hr_party_boundary_room(uuid)',
                           'public.hr_party_mark(uuid)',
                           'public.hr_party_settle_current(uuid)'] loop
    if has_function_privilege('anon', t, 'execute')
       or has_function_privilege('authenticated', t, 'execute')
       or has_function_privilege('service_role', t, 'execute') then
      raise exception 'GATE(a): % is executable by a client role. A budget a player can read is a budget a player can plan against, and a watermark a request can read is authority in a POST body.', t;
    end if;
    if exists (select 1 from pg_roles where rolname = 'hr_tick')
       and has_function_privilege('hr_tick', t, 'execute') then
      raise exception 'GATE(a): % is executable by hr_tick. The SELECTOR gets nothing from this batch.', t; end if;
    if exists (select 1 from pg_roles where rolname = 'hr_engine')
       and has_function_privilege('hr_engine', t, 'execute') then
      raise exception 'GATE(a): % is executable by hr_engine. This batch grants NOTHING to the engine, which is why it cuts no derive-grant-hygiene link and restates no allowlist (file 3 §3 asserts that absence).', t; end if;
  end loop;

  -- (a2) AND NO CLIENT ROLE HOLDS ANY PRIVILEGE ON THE JOURNAL TABLE.
  foreach t in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(t, 'public.party_settle_boundary', 'select')
       or has_table_privilege(t, 'public.party_settle_boundary', 'insert')
       or has_table_privilege(t, 'public.party_settle_boundary', 'update')
       or has_table_privilege(t, 'public.party_settle_boundary', 'delete') then
      raise exception 'GATE(a2): % holds a privilege on party_settle_boundary. RLS with no policy refuses a READ by absence, but a DML the policy filters returns ZERO ROWS rather than an error — and service_role is BYPASSRLS, so the revoke is its only fence.', t;
    end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename = 'party_settle_boundary') then
    raise exception 'GATE(a2): party_settle_boundary has a policy. It must have NONE: with RLS armed and no policy every client read is refused by ABSENCE.'; end if;
  if not exists (select 1 from pg_class where oid = 'public.party_settle_boundary'::regclass
                  and relrowsecurity and relforcerowsecurity) then
    raise exception 'GATE(a2): RLS is not enabled AND forced on party_settle_boundary'; end if;

  -- (c) THE ORDER SHAPES ARE M6'S, AND THE FENCE BITES. An FK and a CHECK that
  --     have never been red are not constraints.
  select count(*) into v_n from pg_constraint
   where conrelid = 'public.party_hunt'::regclass
     and conname in ('party_hunt_stance_fk', 'party_hunt_stop_shape');
  if v_n <> 2 then
    raise exception 'GATE(c): party_hunt carries % of the two order-shape constraints — the M6 vocabulary is forked, not reused', v_n; end if;

  select shadow, enabled, channels into v_shadow, v_enabled, v_chan
    from public.hr_tick_config where id;
  if v_shadow is null then
    raise exception 'GATE: hr_tick_config has no singleton row — the mode cannot be read, restored, or asserted'; end if;

  begin  -- ── SUBTRANSACTION: everything below is rolled back at HR827 ──────
    insert into auth.users (id) values (v_a), (v_b);
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    if coalesce(public.hr_create_character(0)->>'ok','') <> 'true' then
      raise exception 'GATE: no probe A'; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    if coalesce(public.hr_create_character(0)->>'ok','') <> 'true' then
      raise exception 'GATE: no probe B'; end if;
    perform set_config('request.jwt.claim.sub', '', true);

    insert into public.party (leader_user, leader_slot) values (v_a, 0) returning id into v_p;
    insert into public.party_member (party_id, user_id, slot, role)
      values (v_p, v_a, 0, 'leader'), (v_p, v_b, 0, 'member');
    v_from := date_trunc('second', now()) - interval '300 seconds';
    insert into public.party_hunt (party_id, active_id, accrued_to)
      values (v_p, 'slime', v_from) returning id into v_h;
    insert into public.party_tick_lease (party_id) values (v_p);

    -- ══ (c2) THE TWO ORDER-SHAPE FENCES, EXECUTED ═════════════════════════
    -- (i) S2's three-value CHECK still refuses a forged id. It is kept beside
    --     the FK rather than dropped for it: redundancy in the CLOSING
    --     direction costs nothing, and dropping a live CHECK to replace it is
    --     a window in which neither holds.
    begin
      update public.party_hunt set stance = 'berserk' where id = v_h;
      raise exception 'GATE(c2): party_hunt accepted a stance id that is in neither the CHECK list nor hr_hunt_stances';
    exception when check_violation then null;
    end;
    -- (ii) AND THE FK IS LOAD-BEARING, proved in the only direction it CAN
    --      bite. The CHECK list and hr_hunt_stances' three ids are the same
    --      three today, so no forged value can reach the FK — which is exactly
    --      why the FK is worth having: it binds the party's vocabulary to M6's
    --      CATALOGUE, so the two cannot drift apart by an operator's UPDATE or
    --      DELETE the way a second copy of a list silently can.
    update public.party_hunt set stance = 'careful' where id = v_h;
    begin
      delete from public.hr_hunt_stances where stance_id = 'careful';
      raise exception 'GATE(c2): hr_hunt_stances gave up a stance a live party_hunt row references. The party''s stance vocabulary is then a SECOND copy of the catalogue hr_apply validates a solo hunt against, and two copies drift.';
    exception when foreign_key_violation then null;
    end;
    begin
      update public.party_hunt set stop = '{"hours": 99}'::jsonb where id = v_h;
      raise exception 'GATE(c2): party_hunt accepted hours=99 against STOP_BOUNDS'' max of 24. A value outside a bound is REFUSED, never clamped: a clamp lets a client discover a hidden maximum by pushing at one.';
    exception when check_violation then null;
    end;
    begin
      update public.party_hunt set stop = '{"not_a_rule": 1}'::jsonb where id = v_h;
      raise exception 'GATE(c2): party_hunt accepted an unknown stop field';
    exception when check_violation then null;
    end;
    -- …and it admits the vocabulary it is supposed to. A fence that refuses
    -- everything is not a fence either.
    update public.party_hunt set stance = 'careful',
                                 stop = '{"hours": 6, "bag_full": true}'::jsonb
     where id = v_h;

    -- ══ (b) ★ THE THREE READINGS OF THE WATERMARK AGREE, IN BOTH MODES ★ ══
    --     hr_party_mark, hr_party_roster's `accrued_to` column and
    --     hr_party_tick_settle's own CAS refusal are three expressions of one
    --     rule. If any two disagree the verbs in file 2 decide "the window was
    --     settled" against a different boundary than the settle and the roster
    --     do, which is T-3 failing by a clock rather than by a rule.
    foreach t in array array['shadow','armed'] loop
      -- ⚠ INSIDE THE SUBTRANSACTION, so HR827 takes every one of these back.
      --   `channels` is written too because the settle refuses
      --   `channel_not_owned_by_tick` before the CAS, and an arm refused there
      --   would grade the fence rather than the watermark.
      update public.hr_tick_config
         set shadow = (t = 'shadow'), enabled = true,
             channels = array['combat','gather']::text[] where id;
      -- Plant a shadow mark AHEAD of the paid one, so the two branches of the
      -- expression give DIFFERENT answers and an arm that read the wrong one
      -- cannot pass by coincidence.
      update public.party_tick_lease
         set shadow_accrued_to = v_from + interval '90 seconds',
             owned = true, lease_holder = 'gate:s4-1',
             lease_until = now() + interval '5 minutes'
       where party_id = v_p;

      v_mark := public.hr_party_mark(v_p);
      if v_mark is null then
        raise exception 'GATE(b): hr_party_mark answered NULL for a party with a live hunt and a lease row (%)', t; end if;
      if v_mark <> (case when t = 'shadow' then v_from + interval '90 seconds' else v_from end) then
        raise exception 'GATE(b): hr_party_mark answered % in % mode, wanted %', v_mark, t,
          (case when t = 'shadow' then v_from + interval '90 seconds' else v_from end); end if;

      -- THE ROSTER'S OWN ANSWER, called as the role that holds it.
      execute format('set local role %I', 'hr_tick');
      select r.accrued_to into v_roster
        from public.hr_party_roster(array['combat']::text[], 50, 'gate:s4-1') r
       where r.party_id = v_p;
      reset role;
      if v_roster is distinct from v_mark then
        raise exception 'GATE(b): hr_party_roster reports % and hr_party_mark reports % in % mode. The roster and the door must never disagree about a window boundary.', v_roster, v_mark, t; end if;

      -- THE SETTLE'S OWN ANSWER, read off the CAS refusal it returns for a
      -- deliberately stale window — which is the only way any caller can learn
      -- it, and is the shape the driver's own probe uses.
      execute format('set local role %I', 'hr_engine');
      select public.hr_party_tick_settle('gate:s4-1', v_p,
               v_from - interval '600 seconds', v_from - interval '540 seconds',
               gen_random_uuid(), '[]'::jsonb) into v_cas;
      reset role;
      if coalesce(v_cas->>'error','') <> 'bad_members' then
        -- An empty member set is refused at (2) before the CAS, so ask again
        -- with a one-member set that reaches the CAS.
        raise exception 'GATE(b) CANNOT RUN: the settle answered % to an empty member set', v_cas; end if;
      execute format('set local role %I', 'hr_engine');
      select public.hr_party_tick_settle('gate:s4-1', v_p,
               v_from - interval '600 seconds', v_from - interval '540 seconds',
               gen_random_uuid(),
               jsonb_build_array(jsonb_build_object('user', v_a, 'slot', 0,
                 'version', 0, 'delta', '{}'::jsonb))) into v_cas;
      reset role;
      if coalesce(v_cas->>'error','') <> 'party_window_already_settled' then
        raise exception 'GATE(b) CANNOT RUN: a stale window answered % rather than the CAS refusal', v_cas; end if;
      if (v_cas->>'accrued_to')::timestamptz is distinct from v_mark then
        raise exception 'GATE(b): the settle''s CAS compares against % and hr_party_mark answers % in % mode — file 2''s verbs would decide "the window was settled" against a different boundary than the settle does, which is T-3 failing by a clock rather than by a rule', (v_cas->>'accrued_to')::timestamptz, v_mark, t;
      end if;
    end loop;

    -- ══ (d) hr_party_settle_current IS A REAL FENCE, IN BOTH DIRECTIONS ═══
    --     It is what T-3 rests on, so it is proved biting AND passing rather
    --     than merely existing.
    update public.party_tick_lease set shadow_accrued_to = null where party_id = v_p;
    update public.party_hunt set accrued_to = now() - interval '30 minutes' where id = v_h;
    if public.hr_party_settle_current(v_p) then
      raise exception 'GATE(d): a party whose open window is THIRTY MINUTES old reads as settled. T-3 is then satisfied by a kick that ran no settle at all.'; end if;
    update public.party_hunt set accrued_to = now() - interval '5 seconds' where id = v_h;
    if not public.hr_party_settle_current(v_p) then
      raise exception 'GATE(d): a party settled five seconds ago reads as UNSETTLED — every kick, leave and stop would be refused party_settle_required forever'; end if;
    -- And it is FALSE, never NULL, for a party with no live hunt: a NULL that a
    -- `not` turns into a pass is the fence open.
    update public.party_hunt set ended_at = now(), stopped_by = 'gate' where id = v_h;
    if public.hr_party_settle_current(v_p) is distinct from false then
      raise exception 'GATE(d): hr_party_settle_current answered % for a party with no live hunt; it must be FALSE and never NULL', public.hr_party_settle_current(v_p); end if;
    update public.party_hunt set ended_at = null, stopped_by = null where id = v_h;

    -- ══ (e) THE BUDGET COUNTS THE SERVER'S DAY AND ONLY THIS PARTY'S ROWS ══
    if public.hr_party_boundaries_today(v_p) <> 0 then
      raise exception 'GATE(e): a party with no journalled boundary is not at zero'; end if;
    insert into public.party_settle_boundary (party_id, day_key, verb, user_id, slot)
      select v_p, public.hr_utc_day_key(now()), 'party_hunt_start', v_a, 0 from generate_series(1, 3);
    -- A row on ANOTHER day must not be counted: the budget is per UTC day and a
    -- counter that never rolls over is a permanent denial.
    insert into public.party_settle_boundary (party_id, day_key, at, verb, user_id, slot)
      values (v_p, public.hr_utc_day_key(now() - interval '2 days'),
              now() - interval '2 days', 'party_leave', v_a, 0);
    if public.hr_party_boundaries_today(v_p) <> 3 then
      raise exception 'GATE(e): the budget reads % and must read 3 — yesterday''s boundaries are counted, so the eight never roll over', public.hr_party_boundaries_today(v_p); end if;
    if public.hr_party_boundaries_today(gen_random_uuid()) <> 0 then
      raise exception 'GATE(e): the budget is not scoped to the party — one party''s churn would spend another''s'; end if;
    -- ★ THE NUMBER IS EIGHT, PROVED BY EXECUTION. Reading the literal out of
    --   the body would pass against a body that reads it and never applies it.
    --   Room at seven, room at the eighth call, NO room at eight: that is the
    --   whole of §18.1's clamp and it is the only arm that can tell 8 from 7
    --   or from 9.
    insert into public.party_settle_boundary (party_id, day_key, verb, user_id, slot)
      select v_p, public.hr_utc_day_key(now()), 'party_leave', v_a, 0 from generate_series(1, 4);
    if public.hr_party_boundaries_today(v_p) <> 7 or not public.hr_party_boundary_room(v_p) then
      raise exception 'GATE(e): a party seven boundaries into the day has no room — the eighth is INSIDE the budget (§18.1: "a party gets AT MOST 8")'; end if;
    insert into public.party_settle_boundary (party_id, day_key, verb, user_id, slot)
      values (v_p, public.hr_utc_day_key(now()), 'party_kick', v_a, 0);
    if public.hr_party_boundaries_today(v_p) <> 8 or public.hr_party_boundary_room(v_p) then
      raise exception 'GATE(e): a party EIGHT boundaries into the day still has room. Eight is the ceiling S-6 priced the re-roll lever at; a ninth chosen boundary is the lever re-opened.'; end if;
    -- The verb vocabulary is closed. B-A1's ruling IS this CHECK: a boundary
    -- forced by a verb the list does not name is a lever nobody priced.
    begin
      insert into public.party_settle_boundary (party_id, day_key, verb, user_id, slot)
        values (v_p, public.hr_utc_day_key(now()), 'party_accept', v_a, 0);
      raise exception 'GATE(e): party_settle_boundary accepted a verb outside B-A1''s ruling. The four are party_hunt_start, party_hunt_stop, party_leave and party_kick — §18.1 prices the BOUNDARY, not the verb, so a fifth door has to be argued before it can be counted.';
    exception when check_violation then null;
    end;

    raise exception using errcode = 'HR827', message = 'm8-parties-s4-1 §7 complete — rolling back';
  exception when sqlstate 'HR827' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  -- BELT AND BRACES, AND CONDITIONAL. HR827's rollback already takes (b)'s
  -- three config writes back — they are inside the subtransaction — so this
  -- restores nothing on a healthy apply and writes NOTHING when there is
  -- nothing to restore. It exists because the one write in this file that must
  -- never survive is the one that could arm the tick, and "the rollback
  -- handles it" is the kind of claim that is true until somebody adds a
  -- statement outside the block.
  if exists (select 1 from public.hr_tick_config
              where id and (shadow is distinct from v_shadow
                            or enabled is distinct from v_enabled
                            or channels is distinct from v_chan)) then
    update public.hr_tick_config
       set shadow = v_shadow, enabled = v_enabled, channels = v_chan where id;
  end if;

  -- (z) THE BLOCK LEAVES NO ROWS, AND THE TICK IS STILL IN SHADOW.
  if exists (select 1 from public.party_settle_boundary)
     or exists (select 1 from public.party_hunt)
     or exists (select 1 from public.party_tick_lease)
     or exists (select 1 from public.party_member where user_id in (v_a, v_b))
     or exists (select 1 from public.party where leader_user in (v_a, v_b))
     or exists (select 1 from public.player_state where user_id in (v_a, v_b))
     or exists (select 1 from auth.users where id in (v_a, v_b)) then
    raise exception 'GATE(z): §7 LEAKED a probe row — a self-check may not leave player state behind (CLAUDE.md §2)';
  end if;
  select count(*) into v_n from public.hr_tick_config where id and shadow;
  if v_n <> 1 then
    raise exception 'GATE(z): hr_tick_config.shadow is not TRUE after this apply. S5 is a separate GO and its pre-arm bar is unmet by definition; arming through a self-check is arming through a side door.';
  end if;

  raise notice 'm8-parties-s4-1: the boundary journal, the budget read, the one watermark reading and M6''s order shapes on party_hunt — EXECUTED: the three readings of the effective watermark agree in BOTH modes against the roster and the settle''s own CAS refusal, hr_party_settle_current bites at 30 minutes and passes at 5 seconds and is FALSE for no-live-hunt, the budget counts the server day and only this party and the ceiling is EIGHT by execution (room at seven, none at eight), the stance FK and the stop CHECK each refused a forged value, nothing is granted to any client role or to hr_engine or hr_tick, and every planted row is rolled back';
end $$;
