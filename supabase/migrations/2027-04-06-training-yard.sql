-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-06-training-yard.sql — THE TRAINING YARD, THE SERVER HALF: A HERO WHO IS NOT HUNTING TRAINS ONE COMBAT SKILL FOR GOLD BY THE
--   HOUR, SEATED ON THE YARD, AND KEEPS TRAINING WITH THE BROWSER CLOSED UNTIL ONE OF ITS END REASONS
--   (lane/c-training-yard, backend-architect, 2026-11-10; Tyler 2026-11-08 "training dummies and stuff to train skills (for gold)";
--   the designer's rules, docs/planning/PRIORITY_BOARD.md "2026-11-10 Combat training", lane/d-training-and-wards 5d2c9bf3e).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §7. ON THE EA SECURITY LIST (§3.7): a gold sink that writes skill XP, which the skill boards rank.
-- ORDER: after 2027-04-06-training-catalogue.generated.sql (§0 refuses an absent rule row). EDGE: the hr-accrue carrying
-- set-activity.js SERVER_SETTLED_KINDS deploys AFTER this file (before it, the engine refuses every settle-before-mutate verb of a
-- training hero `uncollectable_window`; nobody can be training until the switch below is turned on, so the order is soft). CLIENT: none
-- yet (the Training tab is a later lane: it calls the three verbs and reads the `training` section).
--
-- ── THE RULES (src/data/training.js, through hr_training_rule; one public formula) ───────────────────────────────────────────────
--   skill XP an hour = 400 x Level, gold an hour = 50 x Level (8 XP a gold at every Level), skill XP only: no Level XP, gold or loot.
--   Level 10 or more, in town, not hunting; Melee, Ranged, Magic or Defense, one at a time. No gear, mana or stamina used.
--   END REASONS (player_training.stop_reason): stop_after (the "Stop after" hours ran), keep_gold (the account purse reached "Keep at
--   least"), stopped (the player's stop), hunt (a hunt began), switched (another town job or a new run), feature_off (the server
--   switch), catalogue (the rule or the skill left the catalogue). The hero goes idle and the section's `last_stop` says why.
--
-- ── WHY THE DATABASE SETTLES IT, AND NOT THE ENGINE ─────────────────────────────────────────────────────────────────────────────────
-- A training hour has no dice, no fight and no world: it is a straight line of the server clock and the hero's Level. So there is no
-- delta for an Edge Function to propose and nothing for a second path to drift from: hr_training_pay is the ONE settle, computing and
-- applying in the same statement under the hero's lock, from server values only (the clock, hr_level_of, the purse under its lock, the
-- catalogue row). Every door calls it: the owner's tick (the hero viewed), the sweep (pg_cron, every minute: the browser closed), the
-- two verbs, and two triggers that pay a run to the instant any other door moves the hero (a hunt's session opening, the pointer
-- moving through hr_apply, the GM's stop). The engine's own accrue answers a training pointer `unsupported_activity` and writes
-- nothing (accrual.js PAYABLE_KINDS is unchanged); the edge's collect treats it as owed to the database (set-activity.js).
--
-- ── THE MONEY, TO THE UNIT ──────────────────────────────────────────────────────────────────────────────────────────────────────────
--   A settle of `s` ms at Level L:  xp = floor((s L X + cx) / 3,600,000), gold = floor((s L F + cf) / 3,600,000); the remainders are the
--   new carries (player_training.xp_carry / fee_carry, each < 3,600,000, kept across runs). So one 6 h settle and 360 one-minute
--   settles pay the same XP and gold to the unit, and a run never pays a skill XP it did not charge for (xp F - gold X stays within one
--   XP's worth of carry). The span is whole milliseconds from a millisecond mark, so the marks add up exactly.
--   PER-CALL CLAMP  one settle pays at most settle_max_ms (24 h); the rest is owed to the next (never lost, never paid twice).
--   PER-DAY FUSE    read from the APPEND-ONLY LEDGER: no hero is paid more than day_fuse_h (25) hours of training in any 24 h of the
--                   server clock (the clock allows 24; the extra hour is the sweep's lag at the window's edge). A fuse, never the control.
--   THE KEEP        the purse is read under its own lock (hr_purse_lock) and debited by hr_purse_move with "Keep at least" as its floor:
--                   a settle the purse can't pay in full pays the longest span it can and stops keep_gold. Never a negative purse,
--                   never under the keep, never XP for a span not charged.
--   THE JOURNAL     ONE player_ledger row a settle that paid time (kind 'training', gold_kind 'training'): the gold (signed, purse
--                   stamped), the skill and its XP (skill_id, xp, xp_in), and meta {ms, level, place, from, to, stop, xp_h, gold_h}.
--                   A settle is at most once a minute for a viewed hero and once a flush (10 min) for a closed one: aggregates, never
--                   per tick (the game_events lesson). Starting and stopping write no row of their own: they move no value.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   player_state_active_kind_check   + 'training' (the pointer; last_activity already admitted it). player_ledger kind and gold_kind
--                                    + 'training' (NOT VALID: the old rows already meet the narrower check; no scan of the journal).
--   player_training (NEW)            one row a hero: the remembered settings (skill, place, "Stop after", "Keep at least") and the run
--                                    (since, settled_to, stop_at, the Level last read, ms/xp/gold this run, the two carries, why it
--                                    stopped). RLS on, no policy, no client privilege: projected only through the `training` section.
--   player_ledger_training_idx (NEW) the per-day fuse's read: (user_id, slot, at desc) where kind = 'training'.
--   hr_feature_switches 'training'   seeded OFF (the Coordinator turns it on by a dated one-line migration).
--   hr_training_view(user, slot)     THE SECTION `training` (null while the switch is off for the account): the rates at the hero's
--                                    Level, the gate, the bounds, the settings, the run and the last stop. Owner-only.
--   hr_training_pay(user, slot, at, close)   THE ONE SETTLE (above). Owner-only; the caller holds the hero's lock.
--   hr_training_settle(user, slot, at, close) pay, then the pointer: a run that stopped sends the hero idle; a paid one bumps the version.
--   hr_training_tick_at(user, slot, at)       the owner's tick: settles a running hero once owner_min_ms has run (or its stop is due).
--   hr_training_sweep(at)                     pg_cron 'hr-training-sweep', every minute: each running hero a flush behind, or past its
--                                             "Stop after", up to sweep_batch a run. NEVER WAITS on a lock (try-lock + skip locked):
--                                             a hero another transaction holds is the next minute's, so the sweep can't deadlock.
--   hr_training_leave()  BEFORE UPDATE OF active_kind, active_id ON player_state, a training pointer moving: pays the run to now and
--                        closes it (hunt / switched). hr_training_hunt_yield()  BEFORE INSERT ON hunt_sessions: pays and closes a
--                        running run BEFORE the session exists, so the hunt's ledger fence never sees a training row inside a hunt.
--   CLIENT VERBS (authenticated; hr_client_rpc_baseline rows):
--     hr_training_start(p_slot, p_skill, p_place, p_stop_after_h, p_keep_gold, p_idem)   refusals: not_signed_in, bad_slot, bad_idem,
--       bad_skill, bad_place, bad_hours, bad_keep, rate_limited, feature_off, no_character, catalogue_missing, no_dummy (place 'home':
--       the house dummy is the next lane, nobody owns one), in_hunt, level_low {level, need}, settle_first (a gather or bench window
--       over 180 s unsettled: the client runs `accrue`, then asks again), cannot_pay {purse, keep, need} (the purse above "Keep at
--       least" can't pay the first minute), too_many_playing / too_many_playing_here (the play cap), intent_mismatch.
--     hr_training_stop(p_slot, p_idem)   pays to now, stops `stopped`, the hero goes idle. Refusals: ..., not_training.
--     hr_training_tick(p_slot)            the viewed hero's settle (no key: a settle is a function of the server clock and the mark, so a
--                                         replay pays nothing). Rate bucket hunt_read.
--   The start and stop verbs: hr_intent_replay + a player_intents row (a replay answers its receipt and moves nothing), the `hunt` rate
--   bucket, the character lock (hr_hunt_lock), the switch, every rejection noted (hr_note_rejection).
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   Lock order, the house order: the hero (advisory + row, hr_hunt_lock) -> its player_training row -> the account purse (hr_purse_lock)
--   -> nothing that takes a hero lock. The verbs and the tick take the hero lock; the triggers run inside a statement that already holds
--   the hero's row; the sweep TRY-locks the hero and SKIP-LOCKS the purse, so it never waits on anything. Two heroes of one account
--   training queue on the purse; each settle reads the purse under the lock and keeps its own "Keep at least".
--   Idempotency: a settle is a pure function of (settled_to, at, Level, purse) and advances settled_to under the row lock, so two doors
--   racing pay one span once. The verbs' keys are the house's (player_intents).
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   +3 client RPCs. No client number is a price, an amount, a time or a rate: the client names a skill, a place, a whole number of hours
--   (1-24 or none) and a gold floor it wants to KEEP (which can only stop training sooner). XP comes only with its gold, at the server's
--   rate, for server-clock time, at the server's Level; the purse never goes under the keep or 0. The only cross-player reach is the
--   skill boards, which rank the XP exactly as a hunt's. Alts: the rate reads each hero's own Level (a Level 10 trains 4,000 an hour).
--   Off by default (hr_feature_switches 'training').
--
-- ── COST AT 100x (~4,400 accounts; say 1,200 heroes training 16 h a day, a quarter of it viewed) ─────────────────────────────────
--   Ledger: closed ~6 rows/h, viewed <= 60 rows/h: ~230k rows/day (~45 MB/day at ~200 B), under 2% of what the same heroes write
--   hunting (~3 rows per 10 s settle). Per settle: one PK read each of player_training, the rule, the wallet (locked), player_skills
--   (upsert), one indexed fuse read (<= 1,440 rows a day a hero), one ledger insert, one player_state version bump. The sweep: one
--   partial-index scan a minute (running heroes only). player_training: one ~150 B row a hero that ever trained.
--   The section: one switch read, one PK read, hr_level_of; nothing per skill.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Stop every run first (update player_state set active_kind = 'idle', active_id = null where active_kind = 'training' pays each one
--   through the trigger), then: select hr_cron_drop('hr-training-sweep'); drop the two triggers, the eight functions, their baseline
--   rows and the section row, player_training, the index and the switch row; the CHECKs may keep 'training' (wider is harmless).
--   The ledger rows stay (history). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ───────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_training_rule') is null or to_regclass('public.hr_training_skills') is null
     or not exists (select 1 from public.hr_training_rule where id) then
    raise exception 'PRECONDITION: 2027-04-06-training-catalogue.generated.sql first (hr_training_rule, hr_training_skills)'; end if;
  if to_regclass('public.player_state') is null or to_regclass('public.player_ledger') is null or to_regclass('public.player_skills') is null
     or to_regclass('public.account_wallet') is null or to_regclass('public.hunt_sessions') is null or to_regclass('public.player_intents') is null
     or to_regclass('public.hr_state_sections') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regclass('public.hr_feature_switches') is null then
    raise exception 'PRECONDITION: a table this file builds on is absent'; end if;
  if to_regprocedure('public.hr_feature_on(text,uuid)') is null or to_regprocedure('public.hr_purse_lock(uuid)') is null
     or to_regprocedure('public.hr_purse_move(uuid,bigint,bigint)') is null or to_regprocedure('public.hr_purse_of(uuid)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null or to_regprocedure('public.hr_hunt_open_of(uuid,integer)') is null
     or to_regprocedure('public.hr_level_of(uuid,integer)') is null or to_regprocedure('public.hr_settle_first_of(uuid,integer)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is absent'; end if;
  -- The town already seats a training hero on the yard, and a training pointer may already be remembered (2026-10-22's reservation).
  if not exists (select 1 from public.hr_town_station_hosts h where h.kind = 'training' and h.station_id = 'training_yard') then
    raise exception 'PRECONDITION: no town station hosts kind training (the yard)'; end if;
  if not public.hr_town_work_kind('training') then
    raise exception 'PRECONDITION: hr_town_work_kind does not count training as town work (the body would not stand on the yard)'; end if;
end $mig$;

-- ── §1 THE POINTER AND THE JOURNAL ADMIT 'training' (widened once; a second apply finds it there and moves nothing) ──────────────
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.player_state'::regclass and conname = 'player_state_active_kind_check';
  if v_def is null then raise exception 'training §1: player_state_active_kind_check is absent'; end if;
  if strpos(v_def, '''training''::text') = 0 then
    alter table public.player_state drop constraint player_state_active_kind_check;
    alter table public.player_state add constraint player_state_active_kind_check
      check (active_kind in ('idle', 'gather', 'artisan', 'combat', 'training'));
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check';
  if v_def is null then raise exception 'training §1: player_ledger_kind_check is absent'; end if;
  if strpos(v_def, '''training''::text') = 0 then
    if array_length(string_to_array(v_def, '''worker''::text]'), 1) <> 2 then
      raise exception 'training §1: player_ledger_kind_check has no single ''worker''::text] anchor (%) - refusing to widen blind', v_def; end if;
    v_new := replace(v_def, '''worker''::text]', '''worker''::text, ''training''::text]');
    if strpos(v_new, 'NOT VALID') = 0 then v_new := v_new || ' NOT VALID'; end if;
    execute 'alter table public.player_ledger drop constraint player_ledger_kind_check';
    execute 'alter table public.player_ledger add constraint player_ledger_kind_check ' || v_new;
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_gold_kind';
  if v_def is null then raise exception 'training §1: player_ledger_gold_kind is absent'; end if;
  if strpos(v_def, '''training''::text') = 0 then
    if array_length(string_to_array(v_def, '''bench_tax''::text]'), 1) <> 2 then
      raise exception 'training §1: player_ledger_gold_kind has no single ''bench_tax''::text] anchor (%) - refusing to widen blind', v_def; end if;
    v_new := replace(v_def, '''bench_tax''::text]', '''bench_tax''::text, ''training''::text]');
    if strpos(v_new, 'NOT VALID') = 0 then v_new := v_new || ' NOT VALID'; end if;
    execute 'alter table public.player_ledger drop constraint player_ledger_gold_kind';
    execute 'alter table public.player_ledger add constraint player_ledger_gold_kind ' || v_new;
  end if;
end $mig$;

-- ── §2 THE HERO'S TRAINING ROW ───────────────────────────────────────────────
create table if not exists public.player_training (
  user_id      uuid        not null,
  slot         int         not null,
  skill        text        not null check (skill ~ '^[a-z0-9_]{1,64}$'),
  place        text        not null default 'yard' check (place in ('yard')),
  stop_after_h int         check (stop_after_h is null or stop_after_h between 1 and 24),
  keep_gold    bigint      not null default 0 check (keep_gold >= 0 and keep_gold <= 1000000000000),
  running      boolean     not null default false,
  since        timestamptz,
  settled_to   timestamptz,
  stop_at      timestamptz,
  level        int         check (level is null or level >= 1),
  run_ms       bigint      not null default 0 check (run_ms >= 0),
  run_xp       bigint      not null default 0 check (run_xp >= 0),
  run_gold     bigint      not null default 0 check (run_gold >= 0),
  xp_carry     bigint      not null default 0 check (xp_carry >= 0 and xp_carry < 3600000),
  fee_carry    bigint      not null default 0 check (fee_carry >= 0 and fee_carry < 3600000),
  stop_reason  text        check (stop_reason is null or stop_reason in ('stop_after', 'keep_gold', 'stopped', 'hunt', 'switched', 'feature_off', 'catalogue')),
  stopped_at   timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, slot),
  foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade,
  constraint player_training_run_ck check ((not running) or (since is not null and settled_to is not null and settled_to >= since and stop_reason is null)),
  constraint player_training_stop_ck check (stop_at is null or (since is not null and stop_at > since))
);
create index if not exists player_training_due on public.player_training (settled_to) where running;
alter table public.player_training enable row level security;
revoke all on public.player_training from public, anon, authenticated, service_role;
comment on table public.player_training is
  '2027-04-06-training-yard.sql: a hero''s training settings (skill, place, Stop after, Keep at least) and its run (since, settled_to, stop_at, this run''s ms/xp/gold, the two carries, why it stopped). Written only by hr_training_pay / hr_training_start; projected by the `training` section. RLS on, no policy, no client privilege.';

create index if not exists player_ledger_training_idx on public.player_ledger (user_id, slot, at desc) where kind = 'training';

-- ── §3 THE SWITCH (OFF: the Coordinator turns it on by a dated one-line migration) ───────────────────────────────────────────────
insert into public.hr_feature_switches (switch_id, scope, note) values
  ('training', 'off', '2027-04-06-training-yard.sql: the training yard (hr_training_start, the settle, the section). Off: refused, the section is null, and a running run stops feature_off at its next settle.')
  on conflict (switch_id) do nothing;

-- ── §4 THE SECTION ───────────────────────────────────────────────────────────
create or replace function public.hr_training_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
-- THE `training` SECTION (2027-04-06-training-yard.sql). Null while the switch is off for the account. The rates are at the hero's
-- Level now; `run` is what the server has settled (the client may draw the time since `settled_to` as display only, never a number
-- anything spends); `last_stop` names why the last run ended.
declare r public.hr_training_rule%rowtype; t public.player_training%rowtype; v_lv int;
begin
  if p_user is null or p_slot is null or not public.hr_feature_on('training', p_user) then return null; end if;
  select * into r from public.hr_training_rule where id;
  if not found or not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  select * into t from public.player_training where user_id = p_user and slot = p_slot;
  v_lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
  return jsonb_build_object(
    'open', v_lv >= r.min_level, 'level', v_lv, 'min_level', r.min_level,
    'xp_h', r.xp_per_level_h::bigint * v_lv, 'gold_h', r.fee_per_level_h::bigint * v_lv,
    'per_level', jsonb_build_object('xp_h', r.xp_per_level_h, 'gold_h', r.fee_per_level_h),
    'skills', (select coalesce(jsonb_agg(s.skill_id order by s.skill_id), '[]'::jsonb) from public.hr_training_skills s),
    'places', jsonb_build_array('yard'),
    'stop_after', jsonb_build_object('min', r.stop_min_h, 'max', r.stop_max_h), 'keep_max', r.keep_max,
    'settings', case when t.user_id is null then null
                     else jsonb_build_object('skill', t.skill, 'place', t.place, 'stop_after_h', t.stop_after_h, 'keep_gold', t.keep_gold) end,
    'run', case when coalesce(t.running, false)
                then jsonb_build_object('skill', t.skill, 'place', t.place, 'since', t.since, 'settled_to', t.settled_to, 'stop_at', t.stop_at,
                                        'keep_gold', t.keep_gold, 'level', t.level, 'ms', t.run_ms, 'xp', t.run_xp, 'gold', t.run_gold) end,
    'last_stop', case when t.user_id is not null and not t.running and t.stop_reason is not null
                      then jsonb_build_object('reason', t.stop_reason, 'at', t.stopped_at, 'skill', t.skill, 'ms', t.run_ms, 'xp', t.run_xp, 'gold', t.run_gold) end);
end $fn$;
insert into public.hr_state_sections (key, fn, note) values
  ('training', 'hr_training_view', '2027-04-06-training-yard.sql: the training yard as the server holds it for this hero: the rates at its Level, the gate, the bounds, the remembered settings, the run and why the last one stopped (null while the switch is off)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §5 THE ONE SETTLE ────────────────────────────────────────────────────────
create or replace function public.hr_training_pay(p_user uuid, p_slot int, p_at timestamptz, p_close text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- THE ONE SETTLE (2027-04-06-training-yard.sql header, "THE MONEY, TO THE UNIT"). The caller holds the hero's lock (a verb or the tick:
-- hr_hunt_lock; the sweep: its try-lock; a trigger: the statement's own row). Pays [settled_to, least(p_at, stop_at)] at the Level now,
-- clamped by the call's cap, the ledger's day fuse and the purse above "Keep at least"; closes the run with p_close ('stopped', 'hunt',
-- 'switched') or with the first END reason the span reached. Writes nothing of player_state: hr_training_settle moves the pointer.
-- Null when no run is open.
declare
  c_hour constant bigint := 3600000;
  r public.hr_training_rule%rowtype; t public.player_training%rowtype;
  v_stop text := p_close; v_to timestamptz; v_span bigint; v_lv int; v_day bigint;
  v_xn bigint; v_fn bigint; v_xp bigint := 0; v_g bigint := 0; v_avail bigint; v_after bigint; v_new timestamptz;
begin
  if p_close is not null and p_close not in ('stopped', 'hunt', 'switched') then
    raise exception 'hr_training_pay: % is not a close', p_close; end if;
  select * into t from public.player_training where user_id = p_user and slot = p_slot for update;
  if not found or not t.running then return null; end if;
  select * into r from public.hr_training_rule where id;
  if not found or not exists (select 1 from public.hr_training_skills s where s.skill_id = t.skill) then
    v_stop := coalesce(v_stop, 'catalogue');
  elsif not public.hr_feature_on('training', p_user) then
    v_stop := coalesce(v_stop, 'feature_off');
  end if;
  v_lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
  -- THE SPAN: whole milliseconds from the mark, never past "Stop after".
  v_to := least(coalesce(p_at, now()), coalesce(t.stop_at, 'infinity'::timestamptz));
  v_span := greatest(0, floor(extract(epoch from (v_to - t.settled_to)) * 1000))::bigint;
  if r.id is null then v_span := 0; end if;
  -- PER-CALL CLAMP, then THE DAY FUSE from the append-only ledger (hours already paid in the last 24 h of the server clock).
  v_span := least(v_span, coalesce(r.settle_max_ms, 0));
  if v_span > 0 then
    select coalesce(sum((l.meta->>'ms')::bigint), 0) into v_day from public.player_ledger l
     where l.user_id = p_user and l.slot = p_slot and l.kind = 'training' and l.at > now() - interval '24 hours';
    v_span := least(v_span, greatest(0, r.day_fuse_h::bigint * c_hour - v_day));
  end if;
  -- THE KEEP: the purse under its lock; the longest span it pays above "Keep at least":
  --   floor((s L F + cf) / H) <= A  <=>  s <= ((A + 1) H - 1 - cf) / (L F)
  if v_span > 0 then
    v_avail := public.hr_purse_lock(p_user) - t.keep_gold;
    if (v_span * v_lv * r.fee_per_level_h + t.fee_carry) / c_hour > v_avail then
      v_span := case when v_avail < 0 then 0
                     else least(v_span, ((v_avail + 1) * c_hour - 1 - t.fee_carry) / (v_lv::bigint * r.fee_per_level_h)) end;
      v_stop := coalesce(v_stop, 'keep_gold');
    end if;
  end if;
  if r.id is not null then
    v_xn := v_span * v_lv * r.xp_per_level_h + t.xp_carry;
    v_fn := v_span * v_lv * r.fee_per_level_h + t.fee_carry;
    v_xp := v_xn / c_hour;
    v_g := v_fn / c_hour;
  end if;
  v_new := t.settled_to + v_span * interval '1 millisecond';
  if t.stop_at is not null and v_new >= t.stop_at then v_stop := coalesce(v_stop, 'stop_after'); end if;
  -- APPLY: the skill, the purse (never under the keep: hr_purse_move refuses and this raises), one journal row.
  if v_xp > 0 then
    insert into public.player_skills as k (user_id, slot, skill_id, xp, xp_frac) values (p_user, p_slot, t.skill, v_xp, 0)
      on conflict (user_id, slot, skill_id) do update set xp = k.xp + excluded.xp;
  end if;
  if v_g > 0 then
    v_after := public.hr_purse_move(p_user, -v_g, t.keep_gold);
    if v_after is null then raise exception 'hr_training_pay: the purse moved under its own lock'; end if;
  end if;
  if v_span > 0 then
    insert into public.player_ledger (user_id, slot, kind, intent, gold, skill_id, xp, xp_in, purse, gold_kind, meta)
      values (p_user, p_slot, 'training', 'training:' || t.skill, -v_g, t.skill, v_xp, v_xp,
              case when v_g > 0 then v_after end, case when v_g > 0 then 'training' end,
              jsonb_build_object('ms', v_span, 'level', v_lv, 'place', t.place, 'from', t.settled_to, 'to', v_new, 'stop', v_stop,
                                 'xp_h', r.xp_per_level_h::bigint * v_lv, 'gold_h', r.fee_per_level_h::bigint * v_lv));
  end if;
  update public.player_training
     set settled_to = v_new, level = v_lv, run_ms = run_ms + v_span, run_xp = run_xp + v_xp, run_gold = run_gold + v_g,
         xp_carry = case when r.id is null then xp_carry else v_xn % c_hour end,
         fee_carry = case when r.id is null then fee_carry else v_fn % c_hour end,
         running = v_stop is null, stop_reason = v_stop, stopped_at = case when v_stop is not null then v_new end, updated_at = now()
   where user_id = p_user and slot = p_slot;
  return jsonb_build_object('skill', t.skill, 'ms', v_span, 'xp', v_xp, 'gold', v_g, 'level', v_lv,
                            'from', t.settled_to, 'to', v_new, 'stop', v_stop);
end $fn$;

create or replace function public.hr_training_settle(p_user uuid, p_slot int, p_at timestamptz, p_close text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- Pay (hr_training_pay), then the pointer: a run that stopped sends the hero idle (the town walks the body off the yard, the play cap
-- counts it stopped); a run that paid bumps the version so the envelope moves. The caller holds the hero's lock. Never called from
-- inside an UPDATE of the hero's own player_state row (the triggers call hr_training_pay alone).
declare v jsonb;
begin
  v := public.hr_training_pay(p_user, p_slot, p_at, p_close);
  if v is null then return null; end if;
  if v->>'stop' is not null then
    update public.player_state
       set active_kind = 'idle', active_id = null, active_since = now(), version = version + 1, updated_at = now()
     where user_id = p_user and slot = p_slot and active_kind = 'training';
    if not found then
      update public.player_state set version = version + 1, updated_at = now() where user_id = p_user and slot = p_slot;
    end if;
  elsif (v->>'ms')::bigint > 0 then
    update public.player_state set version = version + 1, updated_at = now() where user_id = p_user and slot = p_slot;
  end if;
  return v;
end $fn$;

-- ── §6 THE DOORS: the owner's tick, the sweep, the two triggers, the three verbs ─────────────────────────────────────────────────
create or replace function public.hr_training_tick_at(p_user uuid, p_slot int, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- THE VIEWED HERO'S SETTLE: under the hero's lock, a running run is paid once owner_min_ms has run since its mark, or at once when its
-- "Stop after" has passed or its catalogue is gone. Owner-only: hr_training_tick passes now().
declare r public.hr_training_rule%rowtype; t public.player_training%rowtype; v jsonb;
begin
  perform public.hr_hunt_lock(p_user, p_slot);
  select * into t from public.player_training where user_id = p_user and slot = p_slot;
  select * into r from public.hr_training_rule where id;
  if t.running and (r.id is null or t.settled_to <= p_at - r.owner_min_ms * interval '1 millisecond'
                    or (t.stop_at is not null and t.stop_at <= p_at)) then
    v := public.hr_training_settle(p_user, p_slot, p_at, null);
  end if;
  return jsonb_build_object('ok', true, 'settled', v,
                            'version', (select ps.version from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot),
                            'training', public.hr_training_view(p_user, p_slot));
end $fn$;

create or replace function public.hr_training_sweep(p_at timestamptz default now())
returns int language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- THE BROWSER-CLOSED SETTLE (pg_cron 'hr-training-sweep', every minute). Each running hero a flush behind, or past its "Stop after",
-- oldest mark first, up to sweep_batch. It NEVER WAITS: the hero is try-locked (the advisory key hr_hunt_lock uses, then its row SKIP
-- LOCKED) and so is its purse, so a hero another transaction holds is simply the next minute's; one hero's failure is a WARNING and the
-- batch goes on. Returns how many heroes it settled.
declare r public.hr_training_rule%rowtype; h record; v jsonb; v_n int := 0;
begin
  select * into r from public.hr_training_rule where id;
  for h in select t.user_id, t.slot from public.player_training t
            where t.running
              and (r.id is null or t.settled_to <= p_at - r.flush_ms * interval '1 millisecond' or t.stop_at <= p_at)
            order by t.settled_to
            limit coalesce(r.sweep_batch, 200) loop
    begin
      if not pg_try_advisory_xact_lock(hashtextextended(h.user_id::text || ':' || h.slot::text, 0)) then continue; end if;
      perform 1 from public.player_state ps where ps.user_id = h.user_id and ps.slot = h.slot for update skip locked;
      if not found then continue; end if;
      perform 1 from public.account_wallet w where w.user_id = h.user_id for update skip locked;
      if not found and exists (select 1 from public.account_wallet w where w.user_id = h.user_id) then continue; end if;
      v := public.hr_training_settle(h.user_id, h.slot, p_at, null);
      if v is not null then v_n := v_n + 1; end if;
    exception when others then
      raise warning 'hr_training_sweep: % slot % not settled: % [%]', h.user_id, h.slot, sqlerrm, sqlstate;
    end;
  end loop;
  return v_n;
end $fn$;

create or replace function public.hr_training_leave()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- A TRAINING POINTER MOVES (any door: hr_apply's switch, the GM's stop, a forgotten writer): the run is paid to now and closed, inside
-- the same statement, so no door can leave a run open or unpaid. A hunt's session opening has already closed it (hr_training_hunt_yield);
-- should one still be open with a session (no door does that), it closes UNPAID, the safe direction, never a ledger row inside a hunt.
begin
  if exists (select 1 from public.player_training t where t.user_id = new.user_id and t.slot = new.slot and t.running) then
    if exists (select 1 from public.hunt_sessions h where h.user_id = new.user_id and h.slot = new.slot and h.ended_at is null) then
      update public.player_training set running = false, stop_reason = 'hunt', stopped_at = settled_to, updated_at = now()
       where user_id = new.user_id and slot = new.slot;
    else
      perform public.hr_training_pay(new.user_id, new.slot, now(), case when new.active_kind = 'combat' then 'hunt' else 'switched' end);
    end if;
  end if;
  return new;
end $fn$;
drop trigger if exists hr_training_leave on public.player_state;
create trigger hr_training_leave before update of active_kind, active_id on public.player_state
  for each row when (old.active_kind = 'training' and (new.active_kind is distinct from old.active_kind or new.active_id is distinct from old.active_id))
  execute function public.hr_training_leave();

create or replace function public.hr_training_hunt_yield()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- A HUNT BEGINS (hr_hunt_enter_for, a party seat, a called room: every session is an insert here): a running run is paid to now and
-- closed `hunt` BEFORE the session row exists, so the journal row lands outside the hunt (hr_hunt_accrue_fence) and is never stamped
-- with the session. The door holds the hero's lock (hr_hunt_lock).
begin
  if new.ended_at is null and exists (select 1 from public.player_training t where t.user_id = new.user_id and t.slot = new.slot and t.running) then
    perform public.hr_training_pay(new.user_id, new.slot, now(), 'hunt');
  end if;
  return new;
end $fn$;
drop trigger if exists hr_training_hunt_yield on public.hunt_sessions;
create trigger hr_training_hunt_yield before insert on public.hunt_sessions
  for each row execute function public.hr_training_hunt_yield();

create or replace function public.hr_training_start(p_slot int, p_skill text, p_place text, p_stop_after_h int, p_keep_gold bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- THE PLAYER'S "Train" (2027-04-06-training-yard.sql header, CLIENT VERBS). Every number is the server's: the client names a skill, a
-- place, whole hours (or none: until stopped) and the gold it wants to keep. A running run ends here paid (switched); the settings are
-- remembered on the hero.
declare
  c_verb constant text := 'training_start';
  c_hour constant bigint := 3600000;
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_place text := coalesce(p_place, 'yard');
  r public.hr_training_rule%rowtype; v_st public.player_state%rowtype;
  v_lv int; v_need bigint; v_purse bigint; v_now timestamptz; v_det text; v_dj jsonb; v_ver bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_skill is null or p_skill !~ '^[a-z0-9_]{1,64}$' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_skill')); end if;
  if v_place !~ '^[a-z0-9_]{1,64}$' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_place')); end if;
  if p_stop_after_h is not null and (p_stop_after_h < 1 or p_stop_after_h > 1000) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_hours')); end if;
  if p_keep_gold is null or p_keep_gold < 0 or p_keep_gold > 1000000000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_keep')); end if;
  -- The key names the whole request: a replay answers its own receipt, another request under it is intent_mismatch.
  v_verb := c_verb || ':' || p_skill || ':' || v_place || ':' || coalesce(p_stop_after_h::text, 'until_stopped') || ':' || p_keep_gold;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_feature_on('training', v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  select * into v_st from public.player_state where user_id = v_uid and slot = p_slot;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into r from public.hr_training_rule where id;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  if not exists (select 1 from public.hr_training_skills s where s.skill_id = p_skill) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_skill',
      'skills', (select jsonb_agg(s.skill_id order by s.skill_id) from public.hr_training_skills s))); end if;
  if v_place = 'home' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_dummy')); end if;
  if v_place <> 'yard' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_place')); end if;
  if p_stop_after_h is not null and (p_stop_after_h < r.stop_min_h or p_stop_after_h > r.stop_max_h) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_hours', 'min', r.stop_min_h, 'max', r.stop_max_h)); end if;
  if p_keep_gold > r.keep_max then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_keep', 'max', r.keep_max)); end if;
  if v_st.active_kind = 'combat' or public.hr_hunt_open_of(v_uid, p_slot) is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'in_hunt')); end if;
  v_lv := greatest(1, coalesce(public.hr_level_of(v_uid, p_slot), 1));
  if v_lv < r.min_level then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'level_low', 'level', v_lv, 'need', r.min_level)); end if;
  -- A GATHER OR BENCH WINDOW IS THE ENGINE'S: over 180 s unsettled the client runs `accrue` first (the house threshold, hr_settle_first_of).
  if v_st.active_kind in ('gather', 'artisan') then
    v_r := public.hr_settle_first_of(v_uid, p_slot);
    if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  end if;
  -- THE PURSE MUST PAY THE FIRST MINUTE above "Keep at least" (a read: the settle itself never takes the purse under the keep).
  v_need := ceil(r.owner_min_ms::numeric * v_lv * r.fee_per_level_h / c_hour)::bigint;
  v_purse := public.hr_purse_of(v_uid);
  if v_purse - p_keep_gold < v_need then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'cannot_pay',
      'purse', v_purse, 'keep', p_keep_gold, 'need', v_need)); end if;
  v_now := date_trunc('milliseconds', now());
  -- A RUNNING RUN ENDS HERE, PAID TO NOW: a new skill or new settings is a new run (the carries go on).
  perform public.hr_training_pay(v_uid, p_slot, v_now, 'switched');
  begin
    update public.player_state
       set active_kind = 'training', active_id = v_place || '_' || p_skill, active_since = v_now, accrued_to = v_now,
           version = version + 1, updated_at = now()
     where user_id = v_uid and slot = p_slot;
  exception when sqlstate 'HR000' then
    -- THE PLAY CAP (hr_play_cap_guard): an idle hero may start only beside fewer than the cap other playing heroes.
    get stacked diagnostics v_det = pg_exception_detail;
    begin v_dj := v_det::jsonb; exception when others then v_dj := '{}'::jsonb; end;
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', sqlerrm) || (coalesce(v_dj, '{}'::jsonb) - 'ok' - 'error'));
  end;
  insert into public.player_training as t (user_id, slot, skill, place, stop_after_h, keep_gold, running, since, settled_to, stop_at, level,
                                          run_ms, run_xp, run_gold, stop_reason, stopped_at, updated_at)
    values (v_uid, p_slot, p_skill, v_place, p_stop_after_h, p_keep_gold, true, v_now, v_now,
            case when p_stop_after_h is not null then v_now + make_interval(hours => p_stop_after_h) end, v_lv, 0, 0, 0, null, null, now())
    on conflict (user_id, slot) do update
      set skill = excluded.skill, place = excluded.place, stop_after_h = excluded.stop_after_h, keep_gold = excluded.keep_gold,
          running = true, since = excluded.since, settled_to = excluded.settled_to, stop_at = excluded.stop_at, level = excluded.level,
          run_ms = 0, run_xp = 0, run_gold = 0, stop_reason = null, stopped_at = null, updated_at = now();
  -- A TOWN JOB IT REPLACED is journalled with the instant it was last settled to (hr_hunt_enter_for's activity_yield, the same shape).
  if v_st.active_kind in ('gather', 'artisan') then
    insert into public.player_ledger (user_id, slot, kind, intent, meta)
      values (v_uid, p_slot, 'training', 'activity_yield',
              jsonb_build_object('kind', v_st.active_kind, 'id', v_st.active_id, 'settled_to', v_st.accrued_to, 'skill', p_skill));
  end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  v_r := jsonb_build_object('ok', true, 'skill', p_skill, 'place', v_place, 'stop_after_h', p_stop_after_h, 'keep_gold', p_keep_gold,
                            'since', v_now, 'version', v_ver);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r || jsonb_build_object('training', public.hr_training_view(v_uid, p_slot));
end $fn$;

create or replace function public.hr_training_stop(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- THE PLAYER'S STOP: the run is paid to now and ends `stopped`; the hero goes idle. Always allowed (the switch gates starting only).
declare
  c_verb constant text := 'training_stop';
  v_uid uuid := auth.uid(); v_r jsonb; v jsonb; v_ver bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if not exists (select 1 from public.player_training t where t.user_id = v_uid and t.slot = p_slot and t.running) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_training')); end if;
  v := public.hr_training_settle(v_uid, p_slot, now(), 'stopped');
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  v_r := jsonb_build_object('ok', true, 'stopped', v, 'version', v_ver);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r || jsonb_build_object('training', public.hr_training_view(v_uid, p_slot));
end $fn$;

create or replace function public.hr_training_tick(p_slot int)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- THE VIEWED HERO'S SETTLE, the client's door (at most one paid settle a minute: hr_training_tick_at). No key: a settle is a function
-- of the server clock and the run's mark, so a replay pays nothing.
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('training_tick', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if not public.hr_rpc_gate('hunt_read') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('training_tick', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  return public.hr_training_tick_at(v_uid, p_slot, now());
end $fn$;

-- ── §7 GRANTS, THE CLIENT SURFACE, THE SCHEDULE ──────────────────────────────
do $grants$
declare v_sig text;
begin
  foreach v_sig in array array['public.hr_training_view(uuid,integer)', 'public.hr_training_pay(uuid,integer,timestamp with time zone,text)',
                               'public.hr_training_settle(uuid,integer,timestamp with time zone,text)',
                               'public.hr_training_tick_at(uuid,integer,timestamp with time zone)', 'public.hr_training_sweep(timestamp with time zone)',
                               'public.hr_training_leave()', 'public.hr_training_hunt_yield()'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    if exists (select 1 from pg_roles where rolname = 'hr_engine') then execute format('revoke all on function %s from hr_engine', v_sig); end if;
    if exists (select 1 from pg_roles where rolname = 'hr_tick') then execute format('revoke all on function %s from hr_tick', v_sig); end if;
  end loop;
  foreach v_sig in array array['public.hr_training_start(integer,text,text,integer,bigint,uuid)', 'public.hr_training_stop(integer,uuid)',
                               'public.hr_training_tick(integer)'] loop
    execute format('revoke all on function %s from public, anon, service_role', v_sig);
    if exists (select 1 from pg_roles where rolname = 'hr_engine') then execute format('revoke all on function %s from hr_engine', v_sig); end if;
    if exists (select 1 from pg_roles where rolname = 'hr_tick') then execute format('revoke all on function %s from hr_tick', v_sig); end if;
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end $grants$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_training_start', 'hr_training_stop', 'hr_training_tick');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_training_start', 'p_slot integer, p_skill text, p_place text, p_stop_after_h integer, p_keep_gold bigint, p_idem uuid', 'authenticated',
   'added 2027-04-06 (lane/c-training-yard): MONEY (a gold sink that writes skill XP) - start training one combat skill at the yard; the server prices it (50 x Level gold, 400 x Level XP an hour) and settles it; the client names the skill, the place, whole hours or none and the gold to keep'),
  ('hr_training_stop', 'p_slot integer, p_idem uuid', 'authenticated',
   'added 2027-04-06 (lane/c-training-yard): MONEY - stop training: the run is paid to now by the server and the hero goes idle'),
  ('hr_training_tick', 'p_slot integer', 'authenticated',
   'added 2027-04-06 (lane/c-training-yard): MONEY - the viewed hero''s training settle, at most one paid settle a minute; a function of the server clock, no client number');

-- THE GM'S WALLED HERO MAY TRAIN (2027-03-13-gm-tools.sql's door: each row reaches no other player, or only reads). Training moves only
-- the hero's own skill and its own account's purse, and a walled account is off every board (hr_lb_hidden).
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values
      ('hr_training_start', 'its own hero and purse'), ('hr_training_stop', 'its own hero and purse'), ('hr_training_tick', 'its own hero and purse')
    on conflict (rpc) do update set why = excluded.why;
  end if;
end $mig$;

do $mig$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null then
    raise notice 'training §7: pg_cron absent here; hr-training-sweep is not scheduled'; return; end if;
  perform public.hr_cron_ensure('hr-training-sweep', '* * * * *', 'select public.hr_training_sweep(now())');
end $mig$;

-- ── §8 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) the pointer and the journal admit training; the row, the triggers, the section and the schedule are in; RLS on and no client
--     reaches the table or an internal function; the three verbs are exactly the signed-in client's
-- (s) THE SWITCH: off for the account, start refuses feature_off and the section is null; then on for the probe accounts alone
-- (b) refused, nothing moved: under Level 10, Inner Flame, the house dummy, 25 hours, a keep the purse can't clear (cannot_pay)
-- (c) a start seats the hero (training / yard_defense, version up), remembers the settings; a replay moves nothing
-- (d) six hours, one settle: exactly 6 x 400 x 20 Defense XP for exactly 6 x 50 x 20 gold, ONE ledger row stating both and the purse
-- (e) viewed = closed: an hour as one settle and as 60 one-minute settles pay the same XP and gold to the unit (two probe accounts)
-- (f) the keep: a purse that can't pay the span pays the longest span above "Keep at least", stops keep_gold, the hero idle
-- (g) "Stop after": the sweep pays exactly the hours asked and stops stop_after; the owner's tick inside its minute pays nothing
-- (h) any other door: the pointer moving pays to now and closes `switched` (a hunt's own door: tests/training-yard.mjs TY-HUNT)
-- (i) the day fuse: 25 h already paid in the last 24 h pays nothing more; the stop verb pays to now, `stopped`; a second stop not_training
-- (j) never XP without its gold: over every probe row, xp x F <= gold x X + X
do $$
declare
  c_a constant uuid := '000000c0-0000-4000-a000-0000d0e00001';
  c_b constant uuid := '000000c0-0000-4000-a000-0000d0e00002';
  k   constant text := '000000c0-0000-4000-a000-0000d0e0';
  r public.hr_training_rule%rowtype;
  v jsonb; w jsonb; v_role text; v_sig text; v_n bigint; v_x0 bigint; v_g0 bigint; v_ver bigint; v_xb bigint; v_gb bigint; i int;
  v_purse bigint;
begin
  select * into r from public.hr_training_rule where id;
  -- (a)
  if strpos((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.player_state'::regclass and conname = 'player_state_active_kind_check'), '''training''') = 0
     or strpos((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check'), '''training''') = 0
     or strpos((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_gold_kind'), '''training''') = 0 then
    raise exception 'training §8(a): a CHECK does not admit training'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'hr_training_leave' and tgrelid = 'public.player_state'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'hr_training_hunt_yield' and tgrelid = 'public.hunt_sessions'::regclass)
     or not exists (select 1 from public.hr_state_sections where key = 'training' and fn = 'hr_training_view') then
    raise exception 'training §8(a): a trigger or the section is missing'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.player_training'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_training') then
    raise exception 'training §8(a): player_training is not RLS-on with no policy'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.player_training', 'select,insert,update,delete,truncate') then
      raise exception 'training §8(a): % reaches player_training', v_role; end if;
    foreach v_sig in array array['public.hr_training_view(uuid,integer)', 'public.hr_training_pay(uuid,integer,timestamp with time zone,text)',
                                 'public.hr_training_settle(uuid,integer,timestamp with time zone,text)',
                                 'public.hr_training_tick_at(uuid,integer,timestamp with time zone)', 'public.hr_training_sweep(timestamp with time zone)'] loop
      if has_function_privilege(v_role, v_sig::regprocedure, 'execute') then raise exception 'training §8(a): % reaches %', v_role, v_sig; end if;
    end loop;
  end loop;
  foreach v_sig in array array['public.hr_training_start(integer,text,text,integer,bigint,uuid)', 'public.hr_training_stop(integer,uuid)',
                               'public.hr_training_tick(integer)'] loop
    if has_function_privilege('anon', v_sig::regprocedure, 'execute') or not has_function_privilege('authenticated', v_sig::regprocedure, 'execute') then
      raise exception 'training §8(a): % is not exactly the signed-in client''s', v_sig; end if;
  end loop;
  if to_regclass('cron.job') is not null and not exists (select 1 from cron.job where jobname = 'hr-training-sweep' and schedule = '* * * * *') then
    raise exception 'training §8(a): the sweep is not scheduled every minute'; end if;

  begin
    foreach v_sig in array array[c_a::text, c_b::text] loop
      perform set_config('request.jwt.claim.sub', v_sig, true);
      insert into auth.users (id) values (v_sig::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_sig::uuid, 'training §8 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'training §8-harness: hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null, level_xp = public.hr_char_xp_for_level(20)
       where user_id = v_sig::uuid and slot = 0;
      insert into public.account_wallet as w (user_id, gold) values (v_sig::uuid, 1000000)
        on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now();
    end loop;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    -- (s)
    update public.hr_feature_switches set scope = 'off', accounts = '{}' where switch_id = 'training';
    v := public.hr_training_start(0, 'defense', 'yard', null, 0, (k || '0001')::uuid);
    if v->>'error' is distinct from 'feature_off' or public.hr_training_view(c_a, 0) is not null
       or (select active_kind from public.player_state where user_id = c_a and slot = 0) <> 'idle' then
      raise exception 'training §8(s): the switch off answered % or seated the hero', v; end if;
    update public.hr_feature_switches set scope = 'accounts', accounts = array[c_a, c_b] where switch_id = 'training';
    delete from public.hr_rate_counters where user_id in (c_a, c_b);
    -- (b)
    update public.player_state set level_xp = public.hr_char_xp_for_level(r.min_level - 1) where user_id = c_a and slot = 0;
    v := public.hr_training_start(0, 'defense', 'yard', null, 0, (k || '0002')::uuid);
    if v->>'error' is distinct from 'level_low' or (v->>'need')::int <> r.min_level then raise exception 'training §8(b): under the gate answered %', v; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(20) where user_id = c_a and slot = 0;
    v := public.hr_training_start(0, 'inner_flame', 'yard', null, 0, (k || '0003')::uuid);
    if v->>'error' is distinct from 'bad_skill' then raise exception 'training §8(b): Inner Flame answered %', v; end if;
    v := public.hr_training_start(0, 'defense', 'home', null, 0, (k || '0004')::uuid);
    if v->>'error' is distinct from 'no_dummy' then raise exception 'training §8(b): the house dummy answered %', v; end if;
    v := public.hr_training_start(0, 'defense', 'yard', r.stop_max_h + 1, 0, (k || '0005')::uuid);
    if v->>'error' is distinct from 'bad_hours' then raise exception 'training §8(b): % hours answered %', r.stop_max_h + 1, v; end if;
    v := public.hr_training_start(0, 'defense', 'yard', null, 1000000, (k || '0006')::uuid);
    if v->>'error' is distinct from 'cannot_pay' or (v->>'need')::bigint <> ceil(r.owner_min_ms::numeric * 20 * r.fee_per_level_h / 3600000) then
      raise exception 'training §8(b): a keep of the whole purse answered %', v; end if;
    if public.hr_purse_of(c_a) <> 1000000 or exists (select 1 from public.player_training where user_id = c_a)
       or (select active_kind from public.player_state where user_id = c_a and slot = 0) <> 'idle' then
      raise exception 'training §8(b): a refusal moved something'; end if;
    -- (c)
    delete from public.hr_rate_counters where user_id in (c_a, c_b);
    select version into v_ver from public.player_state where user_id = c_a and slot = 0;
    select xp into v_x0 from public.player_skills where user_id = c_a and slot = 0 and skill_id = 'defense';
    v := public.hr_training_start(0, 'defense', 'yard', null, 0, (k || '0007')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select active_kind || '/' || active_id from public.player_state where user_id = c_a and slot = 0) <> 'training/yard_defense'
       or (select version from public.player_state where user_id = c_a and slot = 0) <= v_ver
       or (v->'training'->'run'->>'skill') is distinct from 'defense' or (v->'training'->>'xp_h')::bigint <> r.xp_per_level_h * 20 then
      raise exception 'training §8(c): the start answered %', v; end if;
    w := public.hr_training_start(0, 'defense', 'yard', null, 0, (k || '0007')::uuid);
    if w->>'ok' is distinct from 'true' or w ? 'training' or (select count(*) from public.player_training where user_id = c_a) <> 1 then
      raise exception 'training §8(c): a replay answered %', w; end if;
    -- (d) six hours, one settle
    update public.player_training set since = since - interval '6 hours', settled_to = settled_to - interval '6 hours' where user_id = c_a;
    v_g0 := public.hr_purse_of(c_a);
    v := public.hr_training_settle(c_a, 0, now(), null);
    if (v->>'ms')::bigint <> 6 * 3600000 or (v->>'xp')::bigint <> 6 * r.xp_per_level_h * 20 or (v->>'gold')::bigint <> 6 * r.fee_per_level_h * 20
       or (select xp from public.player_skills where user_id = c_a and slot = 0 and skill_id = 'defense') <> v_x0 + 6 * r.xp_per_level_h * 20
       or public.hr_purse_of(c_a) <> v_g0 - 6 * r.fee_per_level_h * 20 then
      raise exception 'training §8(d): six hours settled as %', v; end if;
    select count(*) into v_n from public.player_ledger l where l.user_id = c_a and l.kind = 'training'
       and l.gold = -6 * r.fee_per_level_h * 20 and l.xp = 6 * r.xp_per_level_h * 20 and l.skill_id = 'defense'
       and l.gold_kind = 'training' and l.purse = public.hr_purse_of(c_a) and (l.meta->>'ms')::bigint = 6 * 3600000;
    if v_n <> 1 or (select count(*) from public.player_ledger l where l.user_id = c_a and l.kind = 'training') <> 1 then
      raise exception 'training §8(d): the six hours are not ONE ledger row stating gold, XP and purse'; end if;
    -- (e) viewed = closed: B settles the same hour in 60 one-minute steps (A's carries are 0 after whole hours; B starts at 0)
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_training_start(0, 'defense', 'yard', null, 0, (k || '0008')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'training §8(e): B''s start answered %', v; end if;
    update public.player_training set since = since - interval '1 hour', settled_to = settled_to - interval '1 hour' where user_id = c_b;
    select xp into v_xb from public.player_skills where user_id = c_b and slot = 0 and skill_id = 'defense';
    v_gb := public.hr_purse_of(c_b);
    for i in 1..60 loop
      perform public.hr_training_settle(c_b, 0, (select settled_to from public.player_training where user_id = c_b) + interval '1 minute', null);
    end loop;
    update public.player_training set since = since - interval '1 hour', settled_to = settled_to - interval '1 hour' where user_id = c_a;
    select xp into v_x0 from public.player_skills where user_id = c_a and slot = 0 and skill_id = 'defense';
    v_g0 := public.hr_purse_of(c_a);
    perform public.hr_training_settle(c_a, 0, (select settled_to from public.player_training where user_id = c_a) + interval '1 hour', null);
    if (select xp from public.player_skills where user_id = c_b and slot = 0 and skill_id = 'defense') - v_xb
         <> (select xp from public.player_skills where user_id = c_a and slot = 0 and skill_id = 'defense') - v_x0
       or v_gb - public.hr_purse_of(c_b) <> v_g0 - public.hr_purse_of(c_a)
       or v_gb - public.hr_purse_of(c_b) <> r.fee_per_level_h * 20 then
      raise exception 'training §8(e): sixty one-minute settles and one hour do not pay the same'; end if;
    -- (f) the keep: B keeps all but 300 gold; two more hours would cost 2,000
    update public.player_training set keep_gold = public.hr_purse_of(c_b) - 300 where user_id = c_b;
    update public.player_training set settled_to = settled_to - interval '2 hours', since = since - interval '2 hours' where user_id = c_b;
    v := public.hr_training_settle(c_b, 0, (select settled_to from public.player_training where user_id = c_b) + interval '2 hours', null);
    v_purse := public.hr_purse_of(c_b);
    if v->>'stop' is distinct from 'keep_gold' or (v->>'gold')::bigint <> 300 or v_purse <> (select keep_gold from public.player_training where user_id = c_b)
       or (select active_kind from public.player_state where user_id = c_b and slot = 0) <> 'idle'
       or (select stop_reason from public.player_training where user_id = c_b) <> 'keep_gold' then
      raise exception 'training §8(f): the keep answered %', v; end if;
    -- (g) "Stop after" 1 h, two hours on the clock: the sweep pays exactly the hour; the tick inside its minute pays nothing
    delete from public.hr_rate_counters where user_id in (c_a, c_b);
    update public.player_training set keep_gold = 0 where user_id = c_b;
    v := public.hr_training_start(0, 'melee', 'yard', 1, 0, (k || '0009')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'training §8(g): B''s start answered %', v; end if;
    v := public.hr_training_tick_at(c_b, 0, now());
    if v->'settled' <> 'null'::jsonb and v->'settled' is not null then raise exception 'training §8(g): the tick inside its minute settled %', v; end if;
    update public.player_training set since = since - interval '2 hours', settled_to = settled_to - interval '2 hours', stop_at = stop_at - interval '2 hours'
     where user_id = c_b;
    v_gb := public.hr_purse_of(c_b);
    perform public.hr_training_sweep(now());
    if (select stop_reason from public.player_training where user_id = c_b) is distinct from 'stop_after'
       or (select run_ms from public.player_training where user_id = c_b) <> 3600000
       or v_gb - public.hr_purse_of(c_b) <> r.fee_per_level_h * 20
       or (select active_kind from public.player_state where user_id = c_b and slot = 0) <> 'idle' then
      raise exception 'training §8(g): "Stop after" settled % ms', (select run_ms from public.player_training where user_id = c_b); end if;
    -- (h) another door moves A's pointer: paid to now, `switched`
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    update public.player_training set settled_to = settled_to - interval '30 minutes' where user_id = c_a;
    select xp into v_x0 from public.player_skills where user_id = c_a and slot = 0 and skill_id = 'defense';
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_a and slot = 0;
    if (select stop_reason from public.player_training where user_id = c_a) is distinct from 'switched'
       or (select xp from public.player_skills where user_id = c_a and slot = 0 and skill_id = 'defense') - v_x0 <> r.xp_per_level_h * 20 / 2 then
      raise exception 'training §8(h): the pointer moving paid % XP', (select xp from public.player_skills where user_id = c_a and slot = 0 and skill_id = 'defense') - v_x0; end if;
    -- (i) the day fuse: A has been paid 7.5 h; 18 h more is past 25 h in 24 h
    delete from public.hr_rate_counters where user_id in (c_a, c_b);
    v := public.hr_training_start(0, 'ranged', 'yard', null, 0, (k || '0010')::uuid);
    update public.player_training set since = since - interval '18 hours', settled_to = settled_to - interval '18 hours' where user_id = c_a;
    v := public.hr_training_settle(c_a, 0, now(), null);
    if (v->>'ms')::bigint <> (r.day_fuse_h::bigint * 3600000 - (7 * 3600000 + 1800000)) or v->>'stop' is not null then
      raise exception 'training §8(i): the day fuse paid %', v; end if;
    v := public.hr_training_settle(c_a, 0, now(), null);
    if (v->>'ms')::bigint <> 0 then raise exception 'training §8(i): past the fuse paid %', v; end if;
    v := public.hr_training_stop(0, (k || '0011')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select stop_reason from public.player_training where user_id = c_a) <> 'stopped'
       or (select active_kind from public.player_state where user_id = c_a and slot = 0) <> 'idle'
       or public.hr_training_view(c_a, 0)->'last_stop'->>'reason' <> 'stopped' then
      raise exception 'training §8(i): the stop answered %', v; end if;
    v := public.hr_training_stop(0, (k || '0012')::uuid);
    if v->>'error' is distinct from 'not_training' then raise exception 'training §8(i): a second stop answered %', v; end if;
    -- (j)
    if exists (select 1 from public.player_ledger l where l.user_id in (c_a, c_b) and l.kind = 'training' and l.xp is not null
                group by l.user_id
               having sum(l.xp) * r.fee_per_level_h > sum(-l.gold) * r.xp_per_level_h + r.xp_per_level_h) then
      raise exception 'training §8(j): a probe was paid XP it did not pay gold for'; end if;
    raise exception using errcode = 'HR973', message = 'training §8 complete - rolling back';
  exception when sqlstate 'HR973' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (c_a, c_b)) or exists (select 1 from public.player_training where user_id in (c_a, c_b))
     or exists (select 1 from public.player_ledger where user_id in (c_a, c_b)) then
    raise exception 'training §8: LEAKED a probe row'; end if;
  if (select scope from public.hr_feature_switches where switch_id = 'training') is null then
    raise exception 'training §8: the switch row is gone'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'training-yard: priced by the server, paid to the unit through every door, kept above the keep, stopped on every END reason, fused by the ledger; all green';
end $$;
