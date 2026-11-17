-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-24-tower-climb.sql — THE BURNING TOWER'S CLIMB: ONE DOOR, A START FLOOR THE HERO EARNED, FLOORS THE SERVER RE-PROVES, AND WHAT
--   A MODE PAYS HONORED (lane/c-tower-climb, backend-architect, 2026-11-15; Tyler 2026-11-14, the board's "2026-11-14 The Burning Tower"
--   §2 how a climb runs, §3 the mode, §4 integrity, §10 server surface). Phase 2 of the Tower; phase 1 was 2027-04-23-session-modes.sql.
--   STAGED: tools/apply-migration.mjs, one file, never inside begin/commit. Pre-EA (CLAUDE.md §2): applies on its passing §10.
--   ON THE EA SECURITY LIST: a ranked climb (the floors a board will read) and the runs the chest's keys are minted from.
--   CHECKPOINTS (lane/c-tower-checkpoints, Tyler 2026-11-16): a climb starts from any landing up to the hero's best (a party's: the highest
--   landing every member has reached), the default the best; SUPERSEDES 2026-11-14's "each week's first climb starts 60 floors under your
--   best" (removed whole: no week, no weekly landings table).
--   HIDDEN: the switch `burning_tower` is seeded OFF; while it is off for an account its one door refuses (feature_off) and nothing else
--   opens a climb (hr_hunt_admit: tower_only, ahead of the ordinary gate; until this file the Tower has no hr_hunts row, so that gate
--   refused it, and its row lands only after this file: 2027-05-02-tower-hunts-catalogue.generated.sql, which checks the door first).
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- A climb is a hunt session on the Tower's ground in the `tower` mode (a death costs nothing, no coin, no drops, no Bestiary, 200 permille
-- XP), played by the one engine viewed or not (src/core/hunt/tower.js: a room of five at Level F, a Keeper on every tenth floor, the stair,
-- three minutes a floor and ten a landing). The engine proposes, Postgres decides: the start floor is the server's to allow, the floors a
-- window claims are re-proved against the server's own record, and a mode that pays less than a hunt is held to it here, not only in the
-- engine. Phase 1 stopped short of what a mode PAYS; this file honors it (a refusal, `mode_pays`, and every XP bound at the mode's share).
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- hr_tower_start(p_slot int, p_landing int, p_idem uuid) -> jsonb   CLIENT VERB (authenticated; hr_client_rpc_baseline). Opens a climb on the
--   Tower's ground from the floor after CHECKPOINT p_landing (0: floor 1; null: the highest checkpoint, "default = best"). Alone: the hero's.
--   In a party: the leader's call, every seat or none (hr_hunt_party_start under the Tower's GUC; a party with a seat already out hunting is
--   refused party_hunting), each seat its own run from the same floor. The checkpoints (hr_mode_checkpoints): 0 and every multiple of the
--   ground's mode's checkpoint_every (the Tower: 10, its landings) up to the RECORD (hr_tower_record: the hero's best floor; a party's, the
--   lowest best of its seats, so the highest landing every member has reached), read under the locks the start took. Refusals, each opening
--   nothing and journalling nothing: not_signed_in, bad_slot, bad_idem, bad_landing (not 0..1e6; or no checkpoint of this record:
--   `checkpoints` lists them), feature_off, rate_limited, catalogue_missing, party_hunting, every refusal the start of a hunt or a party's
--   start runs (hr_hunt_enter_for / hr_hunt_party_start: hunt_open, activity_running, not_leader, not_ready { seats }, the play cap, an
--   empty stamina pool, ...). On success ONE journal-only hr_apply on the caller's key (kind combat, intent tower_start:<landing|best>), so
--   a replay answers once and opens once (the key read again under the door's lock: a press that waited on another of the same key answers
--   its receipt); tower_runs gets one row a seat (party = the seats that entered).
--   ok: { ok, version, session_id (the caller's), session, landing, floor, checkpoints, party (the party's view, in a party) }.
-- hr_hunt_instance_read RESTATED WHOLE (the v0.2.135 image: 2027-04-25-boss-daily.sql's splice, §0 pins it): the instance carries `tower_floor` (hr_tower_floor_of:
--   the open runs' highest floor cleared + 1, or the run's start; null on every other ground). hr-accrue reads it there and nowhere else
--   (hunt-settle.js; none on the Tower's ground: `tower_pending`, the deploy-gap rule, nothing proposed, refused or counted).
-- hr_hunt_apply_member RESTATED WHOLE (the v0.2.135 image: 2027-04-24-boss-call-series.sql's splice over boss-daily and bench-resume, §0 pins it). TOWER-CLIMB marks five changes:
--   (1) `tower` is stripped from the session half's input (it is this member's own claim);
--   (2) MODE_PAYS, for EVERY mode: a window that pays what its mode does not (coin; items or a Hearthfind; a Bestiary or task count: the journal's
--       `km`, an `ev:` progress op) is refused whole before hr_apply writes a thing (hr_mode_pays). The full `hunt` mode pays everything: no-op;
--   (3) hr_tower_check, on a climb only: the window's `tower.floors` are the run's next floors one after another from the server's own record
--       (tower_floor_forged), no more than window / stair_ms + 1 of them (tower_too_fast), and their shape (bad_tower; a non-climb that claims
--       floors: bad_tower too);
--   (4) the XP bounds: a climb's kills by the most one kill of the floors it stood on (hr_tower_floors), and EVERY mode's XP by its share
--       (xp_pm; 1000 moves nothing); a climb's Defense bound at the floor's Level;
--   (5) hr_tower_write, on a climb only, after every bound held: each floor a room of the run's kills, but the first (tower_floor_forged), then
--       the run's top floor, floors and kills (the chest's key mint reads its rise: 2027-04-27-tower-chest.sql) and the hero's best floor and
--       landing (raise-only: the record the checkpoints and the boards read).
-- hr_hunt_settle_session RESTATED WHOLE (the v0.2.135 image, 2027-04-24-boss-call-series.sql's, §0 pins it, plus one arm): `floor_time` is proven
--   as "a climb, at least one floor's time into it" (the room's instant is the engine's world): like `rule` and `boss_time`, it can only stop
--   value. Its hr_hunt_end_reasons row and the end_reason CHECK came with 2027-05-02-tower-hunt-sessions-catalogue.generated.sql.
-- hr_hunt_admit RESTATED WHOLE (production's image, §0 pins it): the Tower's ground has one door, hr_tower_start (`hr.tower` names it for its
--   own transaction); every other way in answers `tower_only`. No Level gate.
-- tower_progress (user_id, slot) NEW: best_floor, best_landing (raise-only), best_at. tower_runs (session_id) NEW: one row a climb (instance,
--   start_floor, top_floor, floors, kills, party, started_at, ended_at, end_reason), written by hr_tower_start, hr_tower_write and the end
--   trigger only; the record a rank is audited from (the boards are a later lane). Both: RLS on, the owner reads its own rows, NO client
--   write (no policy, no grant).
-- hr_tower_run_end() trigger AFTER UPDATE OF ended_at ON hunt_sessions (null -> a time): stamps the run's end and journals ONE aggregate
--   row a climb (kind hunt, intent tower_run: start, top, floors, kills, party, reason), whatever ended it (a settle, a leave, a kick, the sweep).
-- Owner-only helpers: hr_mode_checkpoints (GENERIC: any mode with a checkpoint_every, the Unmarked Catacombs' vault doors with their own
--   record), hr_tower_record, hr_tower_floor_of, hr_mode_pays, hr_tower_check, hr_tower_write, hr_tower_run_end.
-- ERRORS (hr_reject, inside the settle; the edge's refusal path): mode_pays {mode, what}, bad_tower {why}, tower_floor_forged {why},
--   tower_too_fast, catalogue_missing {what: tower_rules}. None is a client RPC's answer; an honest engine never meets one (TWO LOCKS:
--   src/core/hunt/tower.js and hunt-rewards.js propose only what these re-prove).
-- NOT HERE: the chest, the keys and their table (2027-04-27-tower-chest.sql: a key a landing a run clears), the boards and the season, the
--   window and its section, the Keepers' own rows and art, the flue room (the ground's map is the Sewer's
--   Rat King hall, a stand-in).
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────
-- hr_tower_start: the key replay first (hr_intent_replay), the rate gate, then the hero's own Tower door lock (hr:tower:<uid>:<slot>, taken by
--   this verb alone, before any other lock it takes) and the key READ AGAIN under it (2027-04-19-key-under-lock.sql; tests/key-under-lock.mjs
--   KL-CLASS): a second press of one key that waited on the first answers the first's decision, and an hr_apply that still says `replayed`
--   rolls its climb back out. Then hr_hunt_enter_for takes the character (its usual locks) BEFORE the record is read (a party:
--   hr_hunt_party_start takes every seat's character first): the checkpoint check reads tower_progress under the same character locks the
--   settle writes it under, so a start can't race a settle into an unearned floor. A refused landing raises inside the block and rolls every
--   opened session back (every seat or none).
-- The settle: hr_hunt_apply_instance holds the instance, then each member's character (hr_hunt_lock), and hr_tower_check takes the run row
--   `for update`: the floors, the run and the best are one transaction with the world they were played in; a replayed settle intent returns
--   before any of it (hr_apply's replay).
-- The end trigger runs in the transaction that ends the session; it stamps a run once (ended_at is null) and journals once.
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────
-- ONE new client verb, behind a switch. It carries a checkpoint only to be compared with the server's own list, built from the server's own
-- record (the lowest seat's in a party: a strong hero can't carry a weak one past the weak one's landings); nothing is priced by a client value. A forged or buggy settle can't skip, repeat or invent a floor (one after another from the server's record), can't climb faster than
-- the engine's stair, can't clear a floor without a room of kills (themselves held by the kill bound), and
-- in the Tower can't pay a coin, an item, a Hearthfind, a Bestiary or task count, or more XP than 200 permille of the floor's best kill.
-- Nothing crosses to another player yet (no board, no key, no trade). Risks named for Security: (a) the floor_time proof is weak by design
-- (it can only end a climb early: the hero's own loss); (b) tower_runs' top floor is the key mint (2027-04-27-tower-chest.sql), so
-- hr_tower_check's one-after-another rule is the review surface; (c) the switch's scope is the only thing between a client and a climb, so §10 proves `feature_off`.
--
-- ── COST (rows and bytes at 100x players) ─────────────────────────────────
-- Per settle of ANY hunt: one primary-key probe of hr_session_modes (already read) through hr_mode_pays (pure jsonb walks, no table), one
-- primary-key probe of tower_runs (hr_tower_check), and in the instance read one indexed probe of tower_runs by instance (partial index,
-- open runs only). Per climb settle: one run update and one best upsert; per climb, one ledger row at its start and one at its end. At 100x
-- (say 600 heroes climbing an hour a day): about 4,200 runs and 8,400 ledger rows a week; tower_runs is ~120 bytes a row (~25 MB a year).
-- A start reads one tower_progress row a seat. No per-floor or per-kill row, ever (CLAUDE.md §1 law 6).
--
-- EDGE: MOVES (pack-edge --hash): src/data/tower.js, src/core/hunt/tower.js, combat-sim.js, pull-cycle.js, hunt-spawn.js, hunt-rewards.js,
--   xp-share.js, world-step.js, events.js, action-rules.js, hunt-sessions.js, hunt-grounds.js, hunts.js, party-class-xp.js, session-modes.js,
--   accrual.js, hunt-settle.js. No world field moves (the world's shape is unchanged: tests/hunt-core/engine-parity). Either order is safe: an
--   older engine never sees a climb (no client can open one while the switch is off), and a newer engine on an older database finds no
--   `tower_floor` and waits (tower_pending).
-- CLIENT: none (the window lane wires hr_tower_start and reads the climb; the live view's ctx.towerFloor is hunt_live.instance.tower_floor).
-- ORDER (lane/c-tower-all, 2026-11-17: the Tower applies after the whole v0.2.135 set): 2027-05-02-tower-items-catalogue.generated.sql,
--   2027-05-02-tower-hunt-sessions-catalogue.generated.sql, 2027-04-24-tower-climb-session-modes-catalogue.generated.sql,
--   2027-04-24-tower-climb-catalogue.generated.sql, then THIS file, then 2027-05-02-tower-hunts-catalogue.generated.sql (the Tower's
--   hr_hunts row, once its one door stands). REBASED 2026-11-17 on the v0.2.135 images (bench-resume, boss-daily, boss-call-series):
--   the TOWER-CLIMB lines are the same; every other line is the image §0 pins.
-- REVERSIBLE: delete the Tower's hr_hunts row FIRST (2027-04-16-combat-training-hunts-catalogue's rows again), so no restated admit opens an
--   ordinary door to it; re-apply the §0 images of hr_hunt_apply_member (2027-04-24-boss-call-series.sql) and hr_hunt_instance_read
--   (2027-04-25-boss-daily.sql), hr_hunt_admit (production's) and hr_hunt_settle_session (2027-04-24-boss-call-series.sql); drop the trigger, the seven helpers, hr_tower_start and its baseline row, the
--   two tables and the switch row. No value moved to undo (the Tower pays only XP, which a climb's own ledger rows name).
-- IDEMPOTENT: a second apply finds the tables, restates every body byte-identical, re-creates the trigger, keeps the switch
--   as the Coordinator left it (on conflict do nothing), and §10 rolls back its probes.
-- WIPE: the three tables join 2027-02-25-character-wipe.sql's c_wipe, the two catalogues its c_no_player.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each restated body is exactly the image this file was written against (the replayed chain's, as of the v0.2.135 set: 2027-05-01-v0135-live-events-catalogue.generated.sql), or this
-- file's own (a second apply): md5 of pg_get_functiondef with every run of whitespace one space.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hr_tower_rules') is null or to_regclass('public.hr_tower_floors') is null
     or (select count(*) from public.hr_tower_rules) <> 1 then
    raise exception 'PRECONDITION: apply 2027-04-24-tower-climb-catalogue.generated.sql first (hr_tower_rules, hr_tower_floors)'; end if;
  if not exists (select 1 from public.hr_hunt_grounds g join public.hr_tower_rules r on r.hunt_id = g.hunt_id)
     or not exists (select 1 from public.hr_hunt_end_reasons where reason = 'floor_time') then
    raise exception 'PRECONDITION: apply 2027-05-02-tower-hunt-sessions-catalogue.generated.sql first (the Tower''s ground, floor_time)'; end if;
  if not exists (select 1 from public.hr_ground_session_modes g join public.hr_tower_rules r on r.hunt_id = g.hunt_id
                   join public.hr_session_modes m on m.mode_id = g.mode_id
                  where m.death_loss_pm = 0 and not m.blessings and not m.coin and not m.drops and not m.bestiary) then
    raise exception 'PRECONDITION: apply 2027-04-24-tower-climb-session-modes-catalogue.generated.sql first (the Tower plays a mode whose death costs nothing and that pays no coin, drops or Bestiary)'; end if;
  if to_regclass('public.hr_feature_switches') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null
     or to_regprocedure('public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)') is null
     or to_regprocedure('public.hr_hunt_saved_bag(uuid,integer)') is null or to_regprocedure('public.hr_hunt_active_set(uuid,integer)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_reject(text,jsonb)') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regprocedure('public.hr_hunt_party_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', '54e0f8b2bc1fb22ba8432c8aaf55f01e', 'bd93399758d4c0de8cbfc9a5e6d03550'),
    ('public.hr_hunt_instance_read(uuid,integer)', '57256e05303f02ffff4227bbeab17556', '89a296f58c1a4b28a6b54e0842634c38'),
    ('public.hr_hunt_admit(uuid,integer,text)', 'a35133547b1022f0eb1811728268f6e2', '9677c2ee50d8891e6787447f480eab32'),
    ('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', 'edf41c81bcc1ecb443ce92e61209b160', '2bb207cc4dbd5bfcb4777e62fbb98953')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file restates (%) nor its own (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE CLIMB'S TABLES (no client write: no policy but the owner's read, no grant but select) ─────────
create table if not exists public.tower_progress (
  user_id      uuid        not null,
  slot         int         not null check (slot between 0 and 5),
  best_floor   int         not null default 0 check (best_floor >= 0),
  best_landing int         not null default 0 check (best_landing >= 0),
  best_at      timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, slot),
  constraint tower_progress_landing check (best_landing <= best_floor)
);
create table if not exists public.tower_runs (
  session_id  uuid        primary key,
  user_id     uuid        not null,
  slot        int         not null check (slot between 0 and 5),
  instance_id uuid        not null,
  start_floor int         not null check (start_floor >= 1),
  top_floor   int,
  floors      int         not null default 0 check (floors >= 0),
  kills       bigint      not null default 0 check (kills >= 0),
  party       int         not null default 1 check (party between 1 and 4),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  end_reason  text,
  updated_at  timestamptz not null default now(),
  -- the run's floors are exactly its start to its top: one after another, never a gap
  constraint tower_runs_top check ((top_floor is null and floors = 0) or (top_floor >= start_floor and floors = top_floor - start_floor + 1))
);
create index if not exists tower_runs_open_instance on public.tower_runs (instance_id) where ended_at is null;
create index if not exists tower_runs_hero on public.tower_runs (user_id, slot, started_at desc);
do $mig$
declare t text;
begin
  foreach t in array array['tower_progress', 'tower_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || ' own read', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || ' own read', t);
  end loop;
end $mig$;
comment on table public.tower_progress is '2027-04-24-tower-climb.sql: each hero''s best Burning Tower floor and landing (raise-only), written only by hr_tower_write inside the settle. The record a climb''s checkpoints are read from (hr_tower_record) and the boards rank. RLS: own rows readable, no client write.';
comment on table public.tower_runs is '2027-04-24-tower-climb.sql: one row a climb (a hunt session on the Tower): its start, the highest floor it cleared, floors, kills, party, end. Written only by hr_tower_start, hr_tower_write and the end trigger. The record a rank is audited from. RLS: own rows readable, no client write.';

-- ── §2 THE HELPERS (owner-only) ──────────────────────────────────────────────
-- PL/pgSQL, never SQL: a SQL function with a SET clause is never inlined, and PostgreSQL 17 (production) re-plans its body on every call
-- (tests/settle-budget.mjs SB-3; 2027-02-10-settle-plan-cache.generated.sql's form). The settle reads hr_tower_floor_of on every instance read
-- of every hunt; plpgsql plans each once a backend.
-- THE CHECKPOINTS a run in mode p_mode may start from, for a record p_best (Tyler 2026-11-16): 0 (the start) and every multiple of the
-- mode's checkpoint_every up to the record, ascending. A mode with none: {0}. No mode row: null (the caller refuses). GENERIC: the Tower reads
-- it with a hero's best floor (its landings), a descent with its deepest door.
create or replace function public.hr_mode_checkpoints(p_mode text, p_best int)
returns int[] language plpgsql stable set search_path = public, pg_catalog as $$
begin
  -- TOWER-CHECKPOINTS (2027-04-24-tower-climb.sql)
  return (select case when m.checkpoint_every <= 0 then array[0]
                      else array(select g * m.checkpoint_every from generate_series(0, greatest(coalesce(p_best, 0), 0) / m.checkpoint_every) g
                                  order by g) end
            from public.hr_session_modes m where m.mode_id = p_mode);
end $$;

-- A climb's RECORD: the hero's best floor, or, for a hero seated in an open party, the LOWEST best floor of its seats (Tyler 2026-11-16: "a
-- party starts at the highest landing every member has reached"). 0 for a hero who never climbed.
create or replace function public.hr_tower_record(p_user uuid, p_slot int)
returns int language plpgsql stable set search_path = public, pg_catalog as $$
declare v_party uuid := public.hr_hunt_party_of(p_user, p_slot);
begin
  -- TOWER-CHECKPOINTS (2027-04-24-tower-climb.sql)
  if v_party is null then
    return coalesce((select p.best_floor from public.tower_progress p where p.user_id = p_user and p.slot = p_slot), 0);
  end if;
  return coalesce((select min(coalesce(p.best_floor, 0)) from public.hunt_party_members m
                     left join public.tower_progress p on p.user_id = m.user_id and p.slot = m.slot
                    where m.party_id = v_party), 0);
end $$;

-- The floor whose room stands, or stands next, in an instance: the open runs' highest floor cleared + 1, or the run's start. Null: no climb.
create or replace function public.hr_tower_floor_of(p_instance uuid)
returns int language plpgsql stable set search_path = public, pg_catalog as $$
begin
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql)
  return (select max(coalesce(r.top_floor + 1, r.start_floor)) from public.tower_runs r where r.instance_id = p_instance and r.ended_at is null);
end $$;

-- WHAT A WINDOW PAYS THAT ITS MODE DOES NOT: 'gold', 'items' (an item or a Hearthfind), 'bestiary' (the journal's kills by monster, which the
-- tally tasks read, or an `ev:` progress op: the goals', the Bestiary's and the collection's counters), or null. Pure: it reads the mode row.
create or replace function public.hr_mode_pays(p_mode text, p_delta jsonb)
returns text language plpgsql stable set search_path = public, pg_catalog as $fn$
declare v_m public.hr_session_modes%rowtype;
begin
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql)
  select * into v_m from public.hr_session_modes where mode_id = p_mode;
  if not found then return 'mode'; end if;
  if not v_m.coin and jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > 0 then return 'gold'; end if;
  if not v_m.drops and (p_delta ? 'hearthfind'
       or (jsonb_typeof(p_delta->'items') = 'object'
           and exists (select 1 from jsonb_each(p_delta->'items') e where jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}')::numeric > 0))) then
    return 'items'; end if;
  if not v_m.bestiary and (p_delta ? 'hearthfind'
       or (jsonb_typeof(p_delta->'journal') = 'object' and jsonb_typeof(p_delta->'journal'->'meta') = 'object' and (p_delta->'journal'->'meta') ? 'km')
       or (jsonb_typeof(p_delta->'progress') = 'array'
           and exists (select 1 from jsonb_array_elements(p_delta->'progress') o where jsonb_typeof(o) <> 'object' or coalesce(o->>'key', '') like 'ev:%'))) then
    return 'bestiary'; end if;
  return null;
end $fn$;

-- THE CLIMB'S FLOORS, RE-PROVED (hr_hunt_apply_member, before hr_apply, under the character's lock): the run row locked; the window's
-- `tower.floors` one after another from the run's next floor, no faster than the stair. Answers { lo (the floor standing at the window's
-- start), n (floors cleared), xp_max (the most one kill of the floors it stood on), level (the highest of those floors' Levels) }, or null
-- when the session is no climb (and refuses one that claims floors).
create or replace function public.hr_tower_check(p_session uuid, p_hunt jsonb, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql set search_path = public, pg_catalog as $fn$
declare v_run public.tower_runs%rowtype; v_r public.hr_tower_rules%rowtype; v_f jsonb; v_n int; v_lo int; v_win bigint; v_xp bigint;
begin
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql)
  select * into v_run from public.tower_runs where session_id = p_session for update;
  if not found then
    if p_hunt ? 'tower' then perform public.hr_reject('bad_tower', jsonb_build_object('why', 'not_a_climb')); end if;
    return null;
  end if;
  select * into v_r from public.hr_tower_rules where id;
  if not found then perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'tower_rules')); end if;
  if p_hunt ? 'tower' and (jsonb_typeof(p_hunt->'tower') <> 'object'
                           or exists (select 1 from jsonb_object_keys(p_hunt->'tower') k where k <> 'floors')) then
    perform public.hr_reject('bad_tower', jsonb_build_object('why', 'shape')); end if;
  v_f := coalesce(p_hunt->'tower'->'floors', '[]'::jsonb);
  if jsonb_typeof(v_f) <> 'array' or jsonb_array_length(v_f) > 64
     or exists (select 1 from jsonb_array_elements(v_f) e where jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[0-9]{1,7}$') then
    perform public.hr_reject('bad_tower', jsonb_build_object('why', 'shape')); end if;
  v_n := jsonb_array_length(v_f);
  -- THE FLOOR STANDING at this window's start is the server's own: the run's start, or the highest floor it cleared + 1. Never a skip,
  -- a repeat or a floor the run did not stand on.
  v_lo := coalesce(v_run.top_floor + 1, v_run.start_floor);
  if exists (select 1 from jsonb_array_elements(v_f) with ordinality e(v, i) where (e.v #>> '{}')::bigint <> v_lo + e.i - 1) then
    perform public.hr_reject('tower_floor_forged', jsonb_build_object('why', 'order', 'from', v_lo, 'floors', v_f)); end if;
  -- NO FASTER THAN THE STAIR: the engine stands each room stair_ms after the last one fell (src/data/tower.js stairMs).
  v_win := greatest(0, floor(extract(epoch from (p_to - p_from)) * 1000))::bigint;
  if v_n > v_win / v_r.stair_ms + 1 then
    perform public.hr_reject('tower_too_fast', jsonb_build_object('floors', v_n, 'window_ms', v_win, 'stair_ms', v_r.stair_ms)); end if;
  -- THE MOST ONE KILL OF THIS WINDOW CAN PAY: every floor it stood on, from the floor standing to the one after the last it cleared.
  select max(f.xp_max) into v_xp from public.hr_tower_floors f
   where f.floor between least(v_lo, v_r.floor_top) and least(v_lo + v_n, v_r.floor_top);
  if v_xp is null then perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'tower_floors')); end if;
  return jsonb_build_object('lo', v_lo, 'n', v_n, 'xp_max', v_xp, 'level', least(v_lo + v_n, v_r.floor_top));
end $fn$;

-- THE CLIMB, WRITTEN (hr_hunt_apply_member, after every bound held, under the character's lock and the run row's): each floor a room of the
-- run's kills (this window's journalled kills on top), but the first (a hero who came into a room mid-fight saw part of it); then the run
-- (its rising top floor is the chest's key mint); then the hero's best, raise-only (the record its checkpoints are read from).
create or replace function public.hr_tower_write(p_user uuid, p_slot int, p_session uuid, p_tw jsonb, p_kills bigint, p_to timestamptz)
returns void language plpgsql set search_path = public, pg_catalog as $fn$
declare
  v_run public.tower_runs%rowtype; v_r public.hr_tower_rules%rowtype;
  v_lo int := (p_tw->>'lo')::int; v_n int := (p_tw->>'n')::int; v_k bigint := greatest(coalesce(p_kills, 0), 0);
  v_hi int;
begin
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql)
  select * into v_run from public.tower_runs where session_id = p_session for update;
  select * into v_r from public.hr_tower_rules where id;
  if v_run.session_id is null or v_r.hunt_id is null then perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'tower_run')); end if;
  if (v_run.floors + v_n - 1)::bigint * v_r.room_size > v_run.kills + v_k then
    perform public.hr_reject('tower_floor_forged', jsonb_build_object('why', 'kills', 'floors', v_run.floors + v_n, 'kills', v_run.kills + v_k,
      'room', v_r.room_size)); end if;
  if v_n = 0 and v_k = 0 then return; end if;
  v_hi := v_lo + v_n - 1;
  update public.tower_runs set top_floor = case when v_n > 0 then v_hi else top_floor end, floors = floors + v_n, kills = kills + v_k,
         updated_at = now()
   where session_id = p_session;
  if v_n = 0 then return; end if;
  insert into public.tower_progress (user_id, slot, best_floor, best_landing, best_at, updated_at)
    values (p_user, p_slot, v_hi, (v_hi / v_r.landing_every) * v_r.landing_every, p_to, now())
    on conflict (user_id, slot) do update
      set best_at = case when excluded.best_floor > public.tower_progress.best_floor then excluded.best_at else public.tower_progress.best_at end,
          best_floor = greatest(public.tower_progress.best_floor, excluded.best_floor),
          best_landing = greatest(public.tower_progress.best_landing, excluded.best_landing),
          updated_at = now();
end $fn$;

-- THE RUN'S END, whatever ended the session: stamped once, journalled once (one aggregate row a climb, never a floor or a kill).
create or replace function public.hr_tower_run_end()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_run public.tower_runs%rowtype;
begin
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql)
  update public.tower_runs set ended_at = new.ended_at, end_reason = new.end_reason, updated_at = now()
   where session_id = new.id and ended_at is null
  returning * into v_run;
  if found then
    insert into public.player_ledger (user_id, slot, kind, intent, meta)
      values (v_run.user_id, v_run.slot, 'hunt', 'tower_run',
              jsonb_build_object('reason', 'tower_run', 'session', v_run.session_id, 'start', v_run.start_floor, 'top', v_run.top_floor,
                                 'floors', v_run.floors, 'run_kills', v_run.kills, 'party', v_run.party, 'end', new.end_reason));
  end if;
  return null;
end $fn$;
drop trigger if exists hr_tower_run_end on public.hunt_sessions;
create trigger hr_tower_run_end after update of ended_at on public.hunt_sessions
  for each row when (old.ended_at is null and new.ended_at is not null) execute function public.hr_tower_run_end();

-- ── §3 THE ONE DOOR ──────────────────────────────────────────────────────────
create or replace function public.hr_tower_start(p_slot int, p_landing int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'tower_start';
  v_uid uuid := auth.uid(); v_hunt text; v_mode text; v_verb text; v_r jsonb; v_no jsonb; v_sid uuid; v_ver bigint; v_a jsonb;
  v_party uuid; v_cps int[]; v_pick int; v_n int;
begin
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql); TOWER-CHECKPOINTS (lane/c-tower-checkpoints, Tyler 2026-11-16)
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_landing is not null and (p_landing < 0 or p_landing > 1000000) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_landing')); end if;
  if not public.hr_feature_on('burning_tower', v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  select r.hunt_id, g.mode_id into v_hunt, v_mode
    from public.hr_tower_rules r left join public.hr_ground_session_modes g on g.hunt_id = r.hunt_id where r.id;
  if v_hunt is null or v_mode is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  v_verb := c_verb || ':' || coalesce(p_landing::text, 'best');
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE LOCK: this hero's own Tower door, which only this verb takes (hr_boss_hall_enter's move, 2027-04-20-boss-hall.sql), before every lock
  -- hr_hunt_enter_for takes below (the character, its bag, the play cap): two presses of one hero's door run one after the other.
  perform pg_advisory_xact_lock(hashtextextended('hr:tower:' || v_uid::text || ':' || p_slot::text, 0));
  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision (2027-04-19-key-under-lock.sql): the read above ran
  -- before the first press committed, and past this point hr_apply answers a decided key ok and replayed, under a climb this call opened.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  begin
    -- THE SESSIONS FIRST (their locks: each seat's character), THEN THE RECORD under them: a start can't race a settle into an unearned floor.
    perform set_config('hr.tower', v_hunt, true);
    if v_party is null then
      v_r := public.hr_hunt_enter_for(v_uid, p_slot, v_hunt, public.hr_hunt_saved_bag(v_uid, p_slot), public.hr_hunt_active_set(v_uid, p_slot), null);
    elsif exists (select 1 from public.hunt_party_members m join public.hunt_sessions h on h.user_id = m.user_id and h.slot = m.slot
                   where m.party_id = v_party and h.ended_at is null) then
      -- A PARTY CLIMBS TOGETHER FROM ONE FLOOR: every seat in town first (a seat out hunting would join a climb mid-floor)
      v_r := jsonb_build_object('ok', false, 'error', 'party_hunting', 'hunt', v_hunt);
    else
      -- every seat or none, the leader's call (its own key: hr_hunt_party_start journals what it was asked under)
      v_r := public.hr_hunt_party_start(p_slot, v_hunt, md5('tower_start:party:' || p_idem::text)::uuid);
    end if;
    perform set_config('hr.tower', '', true);
    if coalesce(v_r->>'ok', 'false') <> 'true' then v_no := v_r; raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
    v_cps := public.hr_mode_checkpoints(v_mode, public.hr_tower_record(v_uid, p_slot));
    v_pick := coalesce(p_landing, v_cps[cardinality(v_cps)]);
    if v_cps is null or v_pick is null or v_pick <> all (v_cps) then
      v_no := jsonb_build_object('ok', false, 'error', 'bad_landing', 'checkpoints', to_jsonb(v_cps));
      raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
    -- ONE RUN A SEAT, all from the floor after the checkpoint (alone: the caller's one)
    select count(*) into v_n from public.hunt_sessions h
     where h.ended_at is null and (case when v_party is null then h.user_id = v_uid and h.slot = p_slot
                                       else exists (select 1 from public.hunt_party_members m where m.party_id = v_party
                                                     and m.user_id = h.user_id and m.slot = h.slot) end);
    insert into public.tower_runs (session_id, user_id, slot, instance_id, start_floor, party, started_at)
      select h.id, h.user_id, h.slot, h.instance_id, v_pick + 1, least(greatest(v_n, 1), 4), now() from public.hunt_sessions h
       where h.ended_at is null and (case when v_party is null then h.user_id = v_uid and h.slot = p_slot
                                         else exists (select 1 from public.hunt_party_members m where m.party_id = v_party
                                                       and m.user_id = h.user_id and m.slot = h.slot) end);
    select h.id into v_sid from public.hunt_sessions h where h.user_id = v_uid and h.slot = p_slot and h.ended_at is null;
    -- ONE journal-only apply on the caller's key: a replay answers once and opens once.
    select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object('journal', jsonb_build_object('kind', 'combat', 'intent', v_verb,
             'meta', jsonb_build_object('reason', 'tower_start', 'hunt', v_hunt, 'landing', v_pick, 'floor', v_pick + 1, 'session', v_sid,
                                        'party', v_party, 'seats', v_n))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then v_no := v_a; raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
    -- A KEY THIS CALL DID NOT DECIDE (never reached while the read under the lock holds) opens nothing: its climb rolls back out.
    if coalesce(v_a->>'replayed', 'false') = 'true' then v_no := v_a; raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
  exception when sqlstate 'HR879' then
    perform set_config('hr.tower', '', true);
    return public.hr_note_rejection(c_verb, p_slot, v_no);
  end;
  return jsonb_strip_nulls(jsonb_build_object('ok', true, 'version', v_a->'version', 'session_id', v_sid, 'session', v_r->'session',
                            'landing', v_pick, 'floor', v_pick + 1, 'checkpoints', to_jsonb(v_cps), 'party', v_r->'party'));
end $fn$;

-- ── §4 THE ONE DOOR, AT THE GATE (hr_hunt_admit, RESTATED: production's image with the TOWER-CLIMB arm, every other line verbatim) ─
CREATE OR REPLACE FUNCTION public.hr_hunt_admit(p_user uuid, p_slot integer, p_hunt text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_training boolean;
begin
  -- CALL-OUT (2027-03-12-boss-call.sql): a called room has one door, hr_boss_call, which names the room for its own transaction.
  if exists (select 1 from public.hr_boss_calls c where c.hunt_id = p_hunt)
     and current_setting('hr.boss_call', true) is distinct from p_hunt then
    return jsonb_build_object('ok', false, 'error', 'call_only', 'hunt', p_hunt); end if;
  -- BOSS-HALL (2027-04-20-boss-hall.sql): a keyed hall has one door, hr_boss_hall_enter, which spends its key and names the room for its own
  -- transaction. Past it the hall is entered like any ground (the gate below).
  if exists (select 1 from public.hr_boss_halls h where h.hunt_id = p_hunt)
     and current_setting('hr.boss_hall', true) is distinct from p_hunt then
    return jsonb_build_object('ok', false, 'error', 'hall_only', 'hunt', p_hunt); end if;
  -- TRAINING (2027-04-16-combat-training.sql): a training ground has one door, hr_training_start, which names the ground for its own
  -- transaction. It asks no Level gate: a dummy keeps pace with its hero.
  if exists (select 1 from public.hr_training_grounds t where t.hunt_id = p_hunt) then
    if current_setting('hr.training', true) is distinct from p_hunt then
      return jsonb_build_object('ok', false, 'error', 'training_only', 'hunt', p_hunt); end if;
    return null;
  end if;
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): the Burning Tower has one door, hr_tower_start (behind its switch), which proves the start floor
  -- and names the ground for its own transaction. It asks no Level gate: the floor is the dial (Tyler 2026-11-04: nothing refuses a Level).
  if exists (select 1 from public.hr_tower_rules r where r.hunt_id = p_hunt) then
    if current_setting('hr.tower', true) is distinct from p_hunt then
      return jsonb_build_object('ok', false, 'error', 'tower_only', 'hunt', p_hunt); end if;
    return null;
  end if;
  select training into v_training from public.hr_hunt_travel where hunt_id = p_hunt;
  if v_training is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_hunt', 'hunt', p_hunt); end if;
  if not v_training then
    begin
      perform public.hr_hunt_gate(p_user, p_slot, p_hunt);
    exception when sqlstate 'HR000' then
      return jsonb_build_object('ok', false, 'error', sqlerrm, 'hunt', p_hunt);
    end;
    return null;
  end if;
  if exists (select 1 from public.hr_activities a
              where a.kind = 'combat' and a.activity_id = p_hunt
                and (a.is_boss
                     or (a.req_skill is not null and a.req_lv is not null
                         and coalesce((select public.hr_level_from_xp(ps.xp) from public.player_skills ps
                                        where ps.user_id = p_user and ps.slot = p_slot
                                          and ps.skill_id = a.req_skill), 1) < a.req_lv)))
     or not exists (select 1 from public.hr_activities a where a.kind = 'combat' and a.activity_id = p_hunt) then
    return jsonb_build_object('ok', false, 'error', 'activity_locked', 'hunt', p_hunt);
  end if;
  return null;
end $function$;

-- ── §5 THE ENGINE'S READ (hr_hunt_instance_read, RESTATED: the v0.2.135 image (2027-04-25-boss-daily.sql) plus the instance's `tower_floor`) ─
CREATE OR REPLACE FUNCTION public.hr_hunt_instance_read(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_role text;
  v_s    public.hunt_sessions%rowtype;
  v_i    public.hunt_instances%rowtype;
begin
  -- PARTY-LEADER (2026-11-01-party-leader-density.sql): each member says whether it leads the instance's party.
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): every member plays the density frozen on the instance
  -- (its options.density overlaid), the one the settle bounds count; NULL (opened before the freeze) = as stored.
  -- SETTLE-COST (2027-02-02-settle-cost.sql): each member's `state` is its ENGINE INPUTS (hr_hunt_member_state),
  -- never its whole envelope: the engine reads eleven fields of it, and nine envelopes a settle were its cost.
  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): every member plays the tier frozen on the instance too (options.tier), beside the pull it froze with it.
  -- TARGET-KIND (2027-04-22-target-kind.sql): RESTATED WHOLE (the two splices below folded in). Each member's options carry its own
  -- First target on this ground (options.target_kind, hunt-spawn.js heroSetup), read afresh every settle, never frozen.
  -- SESSION-MODES (2027-04-23-session-modes.sql): the instance carries the session mode the server froze at its start (session_mode),
  -- the engine's only source of it (hunt-settle.js; none, or one it has no row for, and it proposes nothing).
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): the instance carries the Burning Tower's floor whose room stands or stands next (tower_floor:
  -- hr_tower_floor_of, the server's own record), the engine's only source of it; null on every other ground.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_instance_read: not callable by %', v_role using errcode = '42501';
  end if;
  if p_user is null or p_slot is null then return null; end if;
  select * into v_s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  if not found then return jsonb_build_object('open', false); end if;
  select * into v_i from public.hunt_instances i where i.id = v_s.instance_id;
  if not found then return jsonb_build_object('open', false); end if;
  return jsonb_build_object(
    'open', true,
    'instance', jsonb_build_object(
      'id', v_i.id, 'hunt', v_i.hunt_id, 'kind', v_i.kind, 'world', v_i.world, 'world_swing', v_i.world_swing,
      'density', v_i.density,
      'tier', v_i.tier,
      'session_mode', v_i.session_mode,
      'tower_floor', public.hr_tower_floor_of(v_i.id),
      -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): the server's own scale of the next window (hr_scaled_hunt_of: { level, banked_ms,
      -- user, slot } of the leader, or null) and the Level the stored world was built on (the engine restarts a world built on another).
      'scale', public.hr_scaled_hunt_of(v_i.id), 'scale_level', v_i.scale_level,
      -- PARTY-HOLD (2026-12-08-party-hold.sql): the seat whose tank holds every lap (hunt_parties.hold_seat), null = take turns.
      'hold_seat', (select p.hold_seat from public.hunt_parties p where p.id = v_i.id and p.closed_at is null),
      -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): the catalogue's world shape; an engine of another proposes nothing.
      'world_shape', (select jsonb_build_object('v', w.version, 's', w.shape) from public.hr_hunt_world_shape w where w.id),
      'settled_to_ms', ceil(extract(epoch from v_i.settled_to) * 1000)::bigint,
      'next_swing_at_ms', ceil(extract(epoch from v_i.next_swing_at) * 1000)::bigint,
      'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
      -- THE INSTANCE'S KEYED SEED SECRET (hunt-seed.js): reachable by the engine only.
      'secret', public.hr_seed(null, 0, 'hunt:' || v_i.id::text)::text),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                 'user', h.user_id, 'slot', h.slot, 'seat', h.seat, 'unit_id', h.unit_id,
                 -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): the member's own box (combat-sim.js cascadeFrom).
                 'leave_together', (select ps.party_leave_together from public.player_state ps where ps.user_id = h.user_id and ps.slot = h.slot),
                 -- KICKED: still hunting in its party's instance but no longer seated in that party: only the leader's
                 -- hr_hunt_party_kick does that (Leave party and Disband refuse while hunting, the sweep skips
                 -- hunters). Its end sends nobody home (Coordinator ruling 2026-10-23).
                 'kicked', exists (select 1 from public.hunt_parties p where p.id = v_i.id)
                           and not exists (select 1 from public.hunt_party_members pm
                                            where pm.party_id = v_i.id and pm.user_id = h.user_id and pm.slot = h.slot),
                 -- THE PARTY LEADER (hunt_parties.leader_*; a party instance's id is its party's): its density sets the pull.
                 'leads', exists (select 1 from public.hunt_parties p where p.id = v_i.id and p.closed_at is null
                                    and p.leader_user = h.user_id and p.leader_slot = h.slot),
                 'session', case when v_i.density is null then mr.r
                                 else jsonb_set(mr.r, '{options}', coalesce(mr.r->'options', '{}'::jsonb) || jsonb_build_object('density', v_i.density, 'tier', coalesce(v_i.tier, 'normal'))) end,
                 -- LIVE-EVENTS (2027-03-22-live-events.sql): the member's own Level XP windows from the instance's clock to an hour past now
                 -- (hr_live_xp_windows: its switches, its ground, summed and capped); [] when none, so the engine sets no hook.
                 'live_xp', public.hr_live_xp_windows(h.user_id, v_i.hunt_id, v_i.settled_to, now() + interval '1 hour'),
                 -- BOSS-DAILY (2027-04-25-boss-daily.sql): in a keyed hall, whether this hero's daily prize is still to take today
                 -- (hr_boss_prize_left: no player_boss_loot_day row of today's); null on every other hunt. The engine rolls only on true.
                 'prize_left', public.hr_boss_prize_left(h.user_id, h.slot, v_i.hunt_id),
                 -- ...and whether that roll is this hero's FIRST on the boss, ever (hr_boss_prize_first): the engine makes it a sure one.
                 'prize_first', public.hr_boss_prize_first(h.user_id, h.slot, v_i.hunt_id),
                 'state', public.hr_hunt_member_state(h.user_id, h.slot))
                 order by h.user_id, h.slot)
               from public.hunt_sessions h cross join lateral (select public.hr_hunt_member_read(h) as r0) m0
               -- TARGET-KIND: the member's OWN hunt_density row on this ground, only a kind the catalogue holds there; no row, no key. Any
               -- options.target_kind is dropped first (hr_action_set_options refuses the key; this read does not lean on that alone).
               cross join lateral (select jsonb_set(m0.r0, '{options}', (coalesce(m0.r0->'options', '{}'::jsonb) - 'target_kind') || coalesce(
                   (select jsonb_build_object('target_kind', d.target_kind) from public.hunt_density d
                      join public.hr_hunt_ground_spawns g on g.hunt_id = d.hunt_id and g.monster_id = d.target_kind
                     where d.user_id = h.user_id and d.slot = h.slot and d.hunt_id = v_i.hunt_id), '{}'::jsonb)) as r) mr
              where h.instance_id = v_i.id and h.ended_at is null), '[]'::jsonb),
    'now_ms', floor(extract(epoch from now()) * 1000)::bigint);
end $function$;

-- ── §6 THE SETTLE (hr_hunt_apply_member, RESTATED: the v0.2.135 image (2027-04-24-boss-call-series.sql) with the five TOWER-CLIMB changes) ─
CREATE OR REPLACE FUNCTION public.hr_hunt_apply_member(p_instance uuid, p_user uuid, p_slot integer, p_session uuid, p_intent uuid, p_delta jsonb, p_hunt jsonb, p_analyzer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- The combat skills a death costs (src/data/skills.js COMBAT_SKILLS: the catalogue's `combat` rows, so a renamed or new
  -- combat skill is priced with no body edit; 2027-01-31-inner-flame.sql); the Level is priced as `level`.
  c_xp_skills constant text[] := array(select k.skill_id from public.hr_skills k where k.cat = 'combat' order by k.skill_id);
  c_day_ms    constant bigint := 86400000;
  v_s     public.hunt_sessions%rowtype;
  v_ver   bigint;
  v_a     jsonb;
  v_h     jsonb;
  v_hunt  jsonb;
  v_to    timestamptz;
  v_dx    jsonb; v_nd int; v_el jsonb; v_k text; v_v jsonb;
  v_lost  jsonb := '{}'::jsonb; v_rate int;
  v_xp0   jsonb := '{}'::jsonb; v_ev0 bigint := 0;
  v_n bigint; v_cur bigint; v_lv0 int; v_fin int; v_fi int; v_r record;
  v_stam  jsonb; v_cap bigint; v_sat timestamptz; v_s0 bigint; v_e bigint;
  v_win bigint; v_paid bigint; v_nsw bigint; v_tick bigint;
  v_lx0 bigint; v_vit jsonb; v_mana bigint; v_def bigint;
  v_lfrom int; v_lto int;  -- DEATH-SHARE (2027-03-25-death-share.sql): the hero's Level before and after the death's debit
  v_buys jsonb; v_cost bigint := 0; v_units bigint := 0; v_items jsonb := '{}'::jsonb;
  v_price bigint; v_kind text; v_bk jsonb := '{}'::jsonb; v_day jsonb := '{}'::jsonb; v_ukind jsonb := '{}'::jsonb;
  v_cons int; v_off int; v_ammo_max int;
  v_gold_now bigint; v_cover jsonb; v_cgold bigint := 0; v_cunits bigint := 0; v_citems jsonb := '{}'::jsonb;
  v_unit bigint; v_avail bigint; v_supply jsonb; v_floor bigint;
  v_kills bigint; v_ground public.hr_hunt_grounds%rowtype; v_kmax bigint;
  v_dmax bigint; v_pass bigint;  -- DENSITY-BOUNDS: the catalogue's ceiling on any pick; what the ground presents at once
  v_vb_gold bigint; v_vb_xp bigint; v_vb_h bigint; v_vb_item text; v_magic bigint;
  v_unit_id int;
  v_bless jsonb;  -- the blessing hook's answer (hr_blessing_take, 2026-10-25-blessings.sql)
  v_loot  jsonb;  -- the loot filter's answer (hr_hunt_loot_rules, 2026-10-25-bag-rules.sql)
  -- BENCH-RESUME (2027-04-24-bench-resume.sql): step (7)'s five locals went with it to hr_hunt_resume.
  v_train boolean;  -- TRAINING (2027-04-16-combat-training.sql): this session trains on a training ground (hr_training_grounds)
  v_call  boolean;  -- CALL-SERIES (2027-04-24-boss-call-series.sql): this session fights in a called room (hr_boss_calls)
  v_mode  public.hr_session_modes%rowtype;  -- SESSION-MODES (2027-04-23-session-modes.sql): the instance's mode, frozen at its start
  v_tw    jsonb;  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): this window's climb (hr_tower_check), or null off the Tower
begin
  if p_user is null or p_slot is null or p_session is null or p_intent is null
     or p_delta is null or jsonb_typeof(p_delta) <> 'object' or p_hunt is null or jsonb_typeof(p_hunt) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  -- (1) THE CHARACTER LOCK (hr_apply's key) and the session — of THIS instance.
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session or v_s.instance_id <> p_instance then
    perform public.hr_reject('no_hunt', jsonb_build_object('session', p_session)); end if;
  -- (2a) THE STORED INDEX (a key that already landed falls through: hr_apply replays it).
  if jsonb_typeof(p_hunt->'swing_from') is distinct from 'number' or (p_hunt->>'swing_from') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  if (p_hunt->>'swing_from')::bigint <> v_s.swing_index
     and not exists (select 1 from public.player_intents i where i.user_id = p_user and i.intent_id = p_intent) then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  select version into v_ver from public.player_state where user_id = p_user and slot = p_slot;
  if v_ver is null then perform public.hr_reject('no_character'); end if;
  begin v_to := (p_hunt->>'to')::timestamptz;
  exception when others then perform public.hr_reject('bad_window'); end;
  if v_to is null then perform public.hr_reject('bad_window'); end if;

  -- (2b) THE PRICE OF THE DEATH, shape only: at most one death a settle (it ends the hunt),
  --      priced as `level` and the combat skills.
  v_dx := p_hunt->'death_xp';
  -- LIVE-EVENTS (2027-03-22-live-events.sql): `xp_event` is this member's own (kept on the tally below), never the session half's.
  -- TOWER-CLIMB: `tower` is this member's own (its cleared floors, re-proved below), never the session half's.
  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms' - 'xp_event' - 'tower';
  v_nd := case when jsonb_typeof(p_delta->'deaths') = 'array' then jsonb_array_length(p_delta->'deaths') else 0 end;
  if v_dx is null and v_nd = 0 then v_dx := '[]'::jsonb; end if;
  if v_dx is null or jsonb_typeof(v_dx) <> 'array' or jsonb_array_length(v_dx) <> v_nd or v_nd > 1 then
    perform public.hr_reject('bad_death_xp'); end if;
  for v_el in select value from jsonb_array_elements(v_dx) loop
    if jsonb_typeof(v_el) <> 'object' then perform public.hr_reject('bad_death_xp'); end if;
    for v_k, v_v in select key, value from jsonb_each(v_el) loop
      if (v_k <> 'level' and v_k <> all (c_xp_skills)) or jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,12}$' then
        perform public.hr_reject('bad_death_xp'); end if;
      if (v_v #>> '{}')::bigint > 0 then
        v_lost := v_lost || jsonb_build_object(v_k, coalesce((v_lost->>v_k)::bigint, 0) + (v_v #>> '{}')::bigint);
      end if;
    end loop;
  end loop;
  if v_lost <> '{}'::jsonb then
    -- DEATH-SHARE: one formula, a share of the TOTAL Level XP (no alternative base row).
    v_rate := public.hr_hunt_limit('death_xp_permille');
    if v_rate is null then perform public.hr_reject('catalogue_missing'); end if;
  end if;
  -- (2c) THE STAMINA POOL, shape only; the start value is the DATABASE's.
  v_stam := p_hunt->'stamina';
  -- TRAINING (2027-04-16-combat-training.sql): a training session spends no stamina and proposes none (a JSON null, src/core/combat-sim.js);
  -- the pool is never written here, so it rests while the hero trains (hr_stamina_of from its last stamp).
  v_train := exists (select 1 from public.hr_training_grounds t where t.hunt_id = v_s.hunt_id);
  -- CALL-SERIES (2027-04-24-boss-call-series.sql): a called room's TIME spends no stamina (each fight is charged as it starts: hr_boss_call,
  -- hr_boss_call_step), so its window's pool is the server's alone: whatever the engine proposes (null; a number from an engine that
  -- predates this file) is ignored. Unlike training the pool does NOT rest in the room: it is stamped unchanged below.
  v_call := exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id);
  if v_train then
    if v_stam is null or jsonb_typeof(v_stam) <> 'null' then perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'training')); end if;
  elsif v_call then
    if v_stam is not null and jsonb_typeof(v_stam) not in ('null', 'number') then perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'call')); end if;
  elsif v_stam is null or jsonb_typeof(v_stam) <> 'number' or (v_stam #>> '{}') !~ '^[0-9]{1,12}$' then
    perform public.hr_reject('bad_stamina'); end if;
  -- The cap over the window: premium_until only ever rises, so it is the
  -- larger of the caps at its two ends.
  v_cap := greatest(public.hr_stamina_cap(p_user, p_slot, v_s.settled_to), public.hr_stamina_cap(p_user, p_slot, v_to));
  if v_cap is null then perform public.hr_reject('catalogue_missing'); end if;
  select stamina_at, level_xp into v_sat, v_lx0 from public.player_state where user_id = p_user and slot = p_slot;
  if v_sat is not null and v_sat > v_s.settled_to then perform public.hr_reject('stamina_ahead'); end if;
  v_s0 := public.hr_stamina_of(p_user, p_slot, v_s.settled_to);
  -- (2d) THE STORE, shape only (re-priced and debited below).
  v_buys := coalesce(p_hunt->'buys', '{}'::jsonb);
  if jsonb_typeof(v_buys) <> 'object' or (select count(*) from jsonb_object_keys(v_buys)) > 20
     or exists (select 1 from jsonb_each(v_buys) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_buys'); end if;
  v_cover := coalesce(p_hunt->'cover', '{}'::jsonb);
  if jsonb_typeof(v_cover) <> 'object' or (select count(*) from jsonb_object_keys(v_cover)) > 64
     or exists (select 1 from jsonb_each(v_cover) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_cover'); end if;
  -- (2e) THE HERO'S UNIT and the analyzer tally, shape only.
  if p_hunt ? 'unit_id' and jsonb_typeof(p_hunt->'unit_id') <> 'null'
     and (jsonb_typeof(p_hunt->'unit_id') <> 'number' or (p_hunt->>'unit_id') !~ '^[0-9]{1,6}$') then
    perform public.hr_reject('bad_unit'); end if;
  v_unit_id := case when jsonb_typeof(p_hunt->'unit_id') = 'number' then (p_hunt->>'unit_id')::int end;
  if p_analyzer is not null and jsonb_typeof(p_analyzer) <> 'null'
     and (jsonb_typeof(p_analyzer) <> 'object'
          or exists (select 1 from jsonb_object_keys(p_analyzer) k where k not in ('dealt', 'taken', 'healed', 'fight'))
          or (p_analyzer ? 'fight' and not public.hr_boss_fight_ok(p_analyzer->'fight', v_s.hunt_id)) -- CALL-OUT: one room's record
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'dealt', '{}'::jsonb), array['byAbility', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'taken', '{}'::jsonb), array['byMonster', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'healed', '{}'::jsonb), array['bySource'])) then
    perform public.hr_reject('bad_analyzer'); end if;
  select * into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_s.hunt_id;
  if not found then perform public.hr_reject('no_ground', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  -- SESSION-MODES (2027-04-23-session-modes.sql): THE INSTANCE'S MODE, frozen by the server when it started (hunt_instances.session_mode,
  -- hr_hunt_mode_freeze, from its own ground catalogue), never an intent's or the edge's. Its row bounds the death (6) and its Blessings.
  select m.* into v_mode from public.hunt_instances i join public.hr_session_modes m on m.mode_id = i.session_mode where i.id = p_instance;
  if not found then perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'session_mode')); end if;
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): WHAT THE MODE PAYS (its coin, drops and Bestiary; the engine's one door is src/core/hunt-rewards.js):
  -- a window that pays what its mode does not is refused whole, before hr_apply writes a thing (hr_mode_pays names the first thing it pays).
  v_k := public.hr_mode_pays(v_mode.mode_id, p_delta);
  if v_k is not null then perform public.hr_reject('mode_pays', jsonb_build_object('mode', v_mode.mode_id, 'what', v_k)); end if;
  v_k := null;
  -- TOWER-CLIMB: THE CLIMB'S FLOORS, re-proved against the run's own record before anything is written (hr_tower_check: the floors one after
  -- another from the run's next floor, no faster than the stair; the most one kill of the floors it stood on). Null off the Tower.
  v_tw := public.hr_tower_check(p_session, p_hunt, v_s.settled_to, v_to);
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): what the ground can present at once is its as-built
  -- rows plus every pocket's pull at the density the SERVER froze for this instance when it opened
  -- (hunt_instances.density, hr_hunt_density_freeze; the engine plays exactly it, hr_hunt_instance_read).
  -- An instance opened before the freeze existed reads the catalogue's ceiling (density_max). Never a
  -- client or edge number, never today's action-set row.
  v_dmax := coalesce((select i.density from public.hunt_instances i where i.id = p_instance)::bigint,
                     public.hr_hunt_limit('density_max'));
  if v_dmax is null or v_dmax < 0 then perform public.hr_reject('catalogue_missing', jsonb_build_object('limit', 'density_max')); end if;
  v_pass := v_ground.spawns::bigint + v_ground.pockets::bigint * v_dmax;
  select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_xp0
    from public.player_skills where user_id = p_user and slot = p_slot and skill_id = any (c_xp_skills);
  select coalesce(max(id), 0) into v_ev0 from public.hunt_session_events where session_id = p_session;

  -- CALL-OUT (2027-03-12-boss-call.sql): A CALLED ROOM PAYS NOTHING, by any route: refused whole, before hr_apply writes a thing.
  if exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id and public.hr_boss_call_pays(p_delta, c.monster_id) is not null) then
    perform public.hr_reject('called_pays', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  -- TRAINING (2027-04-16-combat-training.sql): A TRAINING WINDOW PAYS ITS SKILL AND NOTHING ELSE, refused whole before hr_apply writes a thing
  -- (hr_training_window: an allowlist, the trained skill's key only, no Level XP, no coin, no item, no kill, no death, a time bound).
  if v_train then perform public.hr_training_window(p_user, p_slot, v_s.hunt_id, v_s.settled_to, v_to, p_delta); end if;

  -- BOSS-DAILY (2027-04-25-boss-daily.sql): A KEYED HALL'S BOSS PAYS HIS DROPS ONCE A DAY PER HERO. The window's claim (its journal's
  -- `prize`, said only when the engine made this hero's roll) stamps today's row or finds it taken (hr_boss_prize_take): a prize row passes
  -- only on a fresh stamp, one piece at most, beside the boss's journalled kill; otherwise it is taken off the delta here, before hr_apply
  -- writes a thing. Any other hunt costs this one comparison (a hall's room is its ground's id and _hall) and one key test of its journal.
  if right(v_s.hunt_id, 5) = '_hall' or coalesce(p_delta #> '{journal,meta}', '{}'::jsonb) ? 'prize' then
    p_delta := public.hr_boss_prize_take(p_user, p_slot, p_session, p_intent, v_s.hunt_id, p_delta);
  end if;

  -- (3) THE VALUE HALF: hr_apply, every row it writes stamped with the session.
  perform set_config('hr.hunt_session', p_session::text, true);
  v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);
  perform set_config('hr.hunt_session', '', true);
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    perform public.hr_reject(coalesce(v_a->>'error', 'apply_failed'), v_a);
  end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  -- (4) THE KILL BOUND: the kills THIS settle's stamped rows journal, held to
  --     what the ground presents at once (v_pass) times the respawns the window's time admits.
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  select coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::numeric else 0 end), 0)::bigint
    into v_kills
    from public.player_ledger l
   where l.session_id = p_session and l.kind <> 'hunt'
     and l.id > coalesce((select t.ledger_hwm from public.hunt_session_tally t where t.session_id = p_session), 0)
     and l.at >= now() - interval '25 hours';
  v_kmax := v_pass * (greatest(v_win, 0) / v_ground.respawn_ms + 2);
  if v_kills > v_kmax then
    perform public.hr_reject('kills_over', jsonb_build_object('kills', v_kills, 'max', v_kmax, 'window_ms', v_win, 'pass', v_pass));
  end if;
  -- (4c) THE VALUE BOUND, against the ground's own monsters.
  v_vb_h := public.hr_hunt_limit('value_headroom');
  select coalesce(max(b.gold_max), 0), coalesce(max(b.xp_max), 0) into v_vb_gold, v_vb_xp
    from public.hr_hunt_kill_bounds b
   where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id);
  -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): a window the commit proved scaled (hunt_instances.scale_level, written by
  -- hr_hunt_apply_instance before any member lands) is bounded by its scaled roster's most a kill pays as well (hr_scaled_kill_bounds).
  select greatest(v_vb_gold, coalesce(max(b.gold_max), 0)), greatest(v_vb_xp, coalesce(max(b.xp_max), 0)) into v_vb_gold, v_vb_xp
    from public.hunt_instances i join public.hr_scaled_kill_bounds b on b.hunt_id = i.hunt_id and b.level = i.scale_level
   where i.id = p_instance;
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): a climb's kills are bounded by the floors it stood on (hr_tower_floors, through hr_tower_check),
  -- and EVERY mode's XP by its share of a kill (hr_session_modes.xp_pm; a hunt's 1000 moves nothing).
  if v_tw is not null then v_vb_xp := greatest(v_vb_xp, (v_tw->>'xp_max')::bigint); end if;
  if v_mode.xp_pm <> 1000 then v_vb_xp := ceil(v_vb_xp * v_mode.xp_pm / 1000.0)::bigint; end if;
  -- THE MAGIC BOUND reads the hero's OWN max mana (hr_vitals_of): a full pool, then its regen at the
  -- Inner Flame rate plus the most a drink every lane restores, every minute; x the largest ability
  -- multiplier (hr_hunt_abilities) on top of the per-mana rate.
  v_vit := public.hr_vitals_of(p_user, p_slot);
  v_mana := (v_vit->>'max_mana')::bigint;
  v_magic := ceil((v_mana + (greatest(v_win, 0) / 60000 + 1)
                   * (ceil(v_mana * public.hr_hunt_limit('mana_regen_pct_min') * (v_vit->>'regen_pm')::int / 100000.0)
                      + public.hr_hunt_limit('drink_mana_per_min_max')))
                  * public.hr_hunt_limit('magic_xp_permille') / 1000.0
                  * greatest(1000, coalesce(public.hr_hunt_limit('magic_xp_mult_max'), 1000)) / 1000.0)::bigint;
  -- THE DEFENSE BOUND: every swing interval of the window, every foe the ground can engage at once
  -- (what it presents at once, at most a full box twice over or the density ceiling), at the highest level it spawns, the block multiple.
  v_def := ceil((greatest(v_win, 0) / public.hr_hunt_limit('swing_interval_ms') + 1)
                * least(v_pass, greatest(v_dmax, 16))
                * greatest(coalesce((select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id), 0),
                           coalesce((select b.level_max from public.hunt_instances i join public.hr_scaled_kill_bounds b
                                       on b.hunt_id = i.hunt_id and b.level = i.scale_level where i.id = p_instance), 0),
                           -- TOWER-CLIMB: a climb's monsters stand at the floor's Level
                           coalesce((v_tw->>'level')::bigint, 0))
                * public.hr_hunt_limit('defense_xp_level_permille') / 1000.0 * public.hr_hunt_limit('block_mult'))::bigint;
  if jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'gold', 'gold', p_delta->'gold', 'kills', v_kills,
      'max', v_kills * v_vb_gold * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'xp') = 'object'
     and (select coalesce(sum(greatest(0, (e.value #>> '{}')::numeric)), 0) from jsonb_each(p_delta->'xp') e
           where jsonb_typeof(e.value) = 'number') > ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'xp', 'kills', v_kills, 'pass', v_pass,
      'max', ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h)); end if;
  -- THE LEVEL XP BOUND (kills only): the journalled kills x the most one kill of the ground pays.
  -- LIVE-EVENTS: the Level XP bound grows by this account's own live dial over this window's span, and by nothing else.
  if jsonb_typeof(p_delta->'level_xp') = 'number' and (p_delta->>'level_xp')::numeric
       > v_kills * v_vb_xp * v_vb_h * public.hr_live_xp_max_pm(p_user, v_s.hunt_id, v_s.settled_to, v_to) / 1000.0 then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'level_xp', 'level_xp', p_delta->'level_xp', 'kills', v_kills,
      'max', v_kills * v_vb_xp * v_vb_h)); end if;
  -- CALL-SERIES: a called room journals no kill, so its items are held by its own bound instead (hr_boss_call_pays above: only the window
  -- his kill fell in, only his table, at most its count), never by kills x the ground's spawns.
  if jsonb_typeof(p_delta->'items') = 'object' and not v_call then
    select e.key into v_vb_item from jsonb_each(p_delta->'items') e
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0
       and (e.value #>> '{}')::numeric > v_kills * coalesce((
             select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b
              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
     limit 1;
    if v_vb_item is not null then
      perform public.hr_reject('value_over', jsonb_build_object('what', 'item', 'item', left(v_vb_item, 64),
        'qty', p_delta->'items'->v_vb_item, 'kills', v_kills)); end if;
  end if;

  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): THE CLIMB, WRITTEN (hr_tower_write: each floor a room of the run's kills, then the run's top (the
  -- chest's key mint) and the hero's best), after every bound above held and before the session half can end the session.
  if v_tw is not null then perform public.hr_tower_write(p_user, p_slot, p_session, v_tw, v_kills, v_to); end if;

  -- (5a) THE STAMINA POOL, RE-PROVED AND WRITTEN (before the session half,
  --      whose `stamina` end proof reads this row). Every swing of a hunt drains
  --      (there is no knockout to rest in): P = swings x interval, the window is
  --      P to the millisecond, and E = max(0, S0 − P) exactly; an empty pool walks
  --      no swing.
  if jsonb_typeof(p_hunt->'paid_ms') is distinct from 'number'
     or jsonb_typeof(p_hunt->'swing_to') is distinct from 'number'
     or (p_hunt->>'paid_ms')::numeric not between 0 and 1e12
     or (p_hunt->>'swing_to')::numeric not between 0 and 1e15 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'shape')); end if;
  v_e    := (v_stam #>> '{}')::bigint;
  v_paid := (p_hunt->>'paid_ms')::numeric::bigint;
  v_nsw  := (p_hunt->>'swing_to')::numeric::bigint - v_s.swing_index;
  if v_win < 0 or v_nsw < 0 or v_paid > v_win or v_paid < v_win - 1 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'window', 'window_ms', v_win, 'paid_ms', v_paid)); end if;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  if v_tick is null or v_tick <= 0 or v_paid <> v_nsw * v_tick then
    perform public.hr_reject('bad_clock', jsonb_build_object('paid_ms', v_paid, 'swings', v_nsw, 'interval_ms', v_tick)); end if;
  -- TRAINING (2027-04-16-combat-training.sql): a training window drains nothing and stamps nothing (the clock above is still re-proved).
  -- CALL-SERIES: a called room's window drains nothing and RESTS nothing: the pool as it stood at the window's start, stamped at its end.
  if v_call then
    v_e := v_s0;
    update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;
  elsif not v_train then
    if v_e <> greatest(0, v_s0 - v_paid) then
      perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'bound', 'from_ms', v_s0, 'ms', v_e, 'paid_ms', v_paid)); end if;
    if v_s0 <= 0 and v_nsw > 0 then perform public.hr_reject('end_missing', jsonb_build_object('reason', 'stamina')); end if;
    update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;
  end if;

  -- (5b) THE STORE: sell-to-cover first, then every store use, priced by the
  --      catalogue, under the hero's own setting, capped, debited, journalled.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
  v_floor := (v_supply->>'gold_floor')::bigint;
  if v_cover <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_cover) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select c.unit into v_unit from public.hr_hunt_cover_items c where c.item_id = v_k;
      if v_unit is null then perform public.hr_reject('not_coverable', jsonb_build_object('item', v_k)); end if;
      -- NOTHING SELLS A LOCKED ITEM (hook: hr_item_locked; hr_hunt_member_read never offers one).
      if public.hr_item_locked(p_user, p_slot, v_k) then perform public.hr_reject('item_locked', jsonb_build_object('item', v_k)); end if;
      select least(
               coalesce((select pi.qty from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_k), 0),
               coalesce((select (t.loot->>v_k)::numeric from public.hunt_session_tally t where t.session_id = p_session), 0)::bigint
               + greatest(0, coalesce(case when jsonb_typeof(p_delta->'items'->v_k) = 'number' then (p_delta->'items'->>v_k)::numeric end, 0))::bigint
               - coalesce((select (t.covered->>v_k)::bigint from public.hunt_session_tally t where t.session_id = p_session), 0))
        into v_avail;
      if v_n > coalesce(v_avail, 0) then
        perform public.hr_reject('cover_over', jsonb_build_object('item', v_k, 'units', v_n, 'avail', v_avail)); end if;
      delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_k and qty = v_n;
      update public.player_inventory set qty = qty - v_n where user_id = p_user and slot = p_slot and item_id = v_k;
      v_citems := v_citems || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'unit', v_unit));
      v_cgold := v_cgold + v_n * v_unit;
      v_cunits := v_cunits + v_n;
      v_unit := null; v_avail := null;
    end loop;
    if v_cgold > 0 then
      -- THE ACCOUNT PURSE (2026-12-15-account-gold.sql), locked by hr_hunt_apply_instance.
      v_gold_now := public.hr_purse_move(p_user, v_cgold, 0);
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id, purse)
        values (p_user, p_slot, 'hunt', 'vendor_cover', v_cgold, -v_cunits,
                jsonb_build_object('reason', 'vendor_cover', 'items', v_citems, 'gold', v_cgold), p_session, v_gold_now);
      update public.hunt_session_tally t
         set covered = public.hr_jsonb_add(t.covered, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                          from jsonb_each(v_citems) i)),
             cover_gold = t.cover_gold + v_cgold
       where t.session_id = p_session;
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'cover', v_to, jsonb_build_object('n', v_cunits, 'gold', v_cgold));
    end if;
    -- Loot is sold only to pay the store: a window that sold and bought nothing is refused.
    if v_buys = '{}'::jsonb then perform public.hr_reject('cover_unspent'); end if;
  end if;
  -- THE LOOT FILTER (hook: hr_hunt_loot_rules): sell / ignore on pickup, online or not, after cover.
  v_loot := public.hr_hunt_loot_rules(p_user, p_slot, p_session, p_intent, p_delta->'items', v_to);
  perform set_config('hr.hunt_session', '', true);
  v_cons := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);
  v_off  := (select l.ms from public.hr_hunt_lanes l where l.lane = 'offense' and l.active);
  v_ammo_max := public.hr_hunt_limit('ability_ammo_max');
  if v_cons is null or v_off is null or v_ammo_max is null then perform public.hr_reject('catalogue_missing'); end if;
  -- Own uses per kind (the bag lines the session half will debit).
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_ukind from (
    select q.kind as k, sum((u.value #>> '{}')::bigint) as n
      from jsonb_each(case when jsonb_typeof(p_hunt->'uses') = 'object' then p_hunt->'uses' else '{}'::jsonb end) u
      join public.hr_hunt_supplies q on q.item_id = u.key
     where jsonb_typeof(u.value) = 'number' group by q.kind) a;
  if v_buys <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_buys) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select q.price, q.kind into v_price, v_kind from public.hr_hunt_basic_supplies q where q.basic_id = v_k;
      if v_price is null then perform public.hr_reject('not_for_sale', jsonb_build_object('item', v_k)); end if;
      -- THE STORE IS USED ONLY ON THE HERO'S OWN SETTING (spec §3.4 #5-7).
      if not (v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch') then
        perform public.hr_reject('store_off', jsonb_build_object('item', v_k)); end if;
      v_bk := v_bk || jsonb_build_object(v_kind, coalesce((v_bk->>v_kind)::bigint, 0) + v_n);
      v_items := v_items || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'price', v_price));
      v_cost := v_cost + v_n * v_price;
      v_units := v_units + v_n;
      v_price := null; v_kind := null;
    end loop;
    select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_day from (
      select q.kind as k, sum((x.value->>'qty')::bigint) as n
        from public.player_ledger l, jsonb_each(case when jsonb_typeof(l.meta->'items') = 'object' then l.meta->'items' else '{}'::jsonb end) x
        join public.hr_hunt_basic_supplies q on q.basic_id = x.key
       where l.user_id = p_user and l.slot = p_slot and l.kind = 'hunt' and l.intent = 'supply_buy'
         and l.at >= public.hr_utc_day_start(now()) group by q.kind) a;
    -- PER UTC DAY: the food-and-drink lane's buys, and the shots, over 24 h.
    if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_day->>'heal')::bigint, 0)
         + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_day->>'mana')::bigint, 0) > c_day_ms / v_cons + 1
       or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_day->>'ammo')::bigint, 0)
            > c_day_ms / v_tick + 1 + (c_day_ms / v_off + 1) * (v_ammo_max + 1) then
      perform public.hr_reject('too_many_buys', jsonb_build_object('why', 'day', 'bought', v_bk, 'today', v_day)); end if;
    -- THE STORE BILL IS PAID FROM THE ACCOUNT PURSE AFTER EVERY MEMBER'S CREDITS
    -- (2026-12-15-account-gold.sql). This member's bill rides back to hr_hunt_apply_instance
    -- (`_purse`, stripped there): once every member of the instance has applied, it debits
    -- each bill under the account's row lock (never below 0), journals its supply_buy row
    -- and holds each account to the lowest floor of its heroes that bought. Heroes of one
    -- account in one instance spend the ONE purse in time order (the engine shares it), so
    -- only that whole-window order can be re-proved; any member-by-member order could dip.
    -- MEMBER-WRITE-ONCE (2027-04-08-member-write-once.sql): the bill's tally increments (bought, supply_gold) are written
    -- with the analyzer's, in the one tally write after the session half (THE ANALYZER TALLY below). Nothing reads them between.
  end if;
  -- PER WINDOW, OWN + STORE TOGETHER: food and drink share ONE lane (consumable,
  -- consumables.js laneMs); a shot or a rune is at most one a swing (the ranged
  -- basic) plus every ability cast's on the offense lane.
  if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_ukind->>'heal')::bigint, 0)
       + coalesce((v_ukind->>'mana')::bigint, 0) > v_win / v_cons + 1
     or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_ukind->>'ammo')::bigint, 0)
       > v_nsw + 1 + (v_win / v_off + 1) * (v_ammo_max + 1) then
    perform public.hr_reject('too_many_uses', jsonb_build_object('bought', v_bk, 'used', v_ukind, 'window_ms', v_win));
  end if;

  -- (5) THE SESSION HALF (2026-10-23-hunt-supply-ledger.sql).
  -- The session half's gold_out proof reads the purse less this window's own bill (paid later).
  perform set_config('hr.purse_pending', v_cost::text, true);
  v_h := public.hr_hunt_settle_session(p_user, p_slot, p_session, v_hunt);
  perform set_config('hr.purse_pending', '', true);
  if coalesce(v_h->>'ok', 'true') = 'false' then perform public.hr_reject(coalesce(v_h->>'error', 'hunt_settle_refused'), v_h); end if;
  -- TRAINING (2027-04-16-combat-training.sql): THE YARD'S NEXT HOUR, at its first instant (the edge cuts a yard window there, src/core/hunt/training.js
  -- trainingStopMs): paid from the account purse out of what this window's own store bill and the hero's floor leave, or the session ends gold_out
  -- right there (hr_training_hour). Its end, if any, rides the answer, so the resume below and the edge read it as any end.
  if v_train then v_h := public.hr_training_hour(p_user, p_slot, p_session, v_to, v_cost, v_floor, v_h); end if;
  -- CALL-SERIES (2027-04-24-boss-call-series.sql): THE ROOM'S WIN AND ITS NEXT FIGHT (hr_boss_call_step): the win is proved from this window's
  -- own kill and counted; a held end is charged its next fight or closed, as the room's plan says. Its end, if any, rides the answer.
  if v_call then v_h := public.hr_boss_call_step(p_user, p_slot, p_session, p_delta, v_h); end if;
  -- LIVE-EVENTS: THE EVENT'S PART of this window's Level XP, apart on the tally (a best leaves it out). Never more than the window's Level XP,
  --   nor more than the account's own dial could add to it (a floor a kill, so the window's kills on top), and none with no event live.
  if p_hunt ? 'xp_event' then
    if jsonb_typeof(p_hunt->'xp_event') is distinct from 'number' or (p_hunt->>'xp_event') !~ '^[0-9]{1,15}$'
       or (p_hunt->>'xp_event')::numeric > coalesce(case when jsonb_typeof(p_delta->'level_xp') = 'number' then (p_delta->>'level_xp')::numeric end, 0)
       or (p_hunt->>'xp_event')::numeric > (select case when q.m = 1000 then 0
              else coalesce(case when jsonb_typeof(p_delta->'level_xp') = 'number' then (p_delta->>'level_xp')::numeric end, 0) * (q.m - 1000) / q.m + v_kills end
            from (select public.hr_live_xp_max_pm(p_user, v_s.hunt_id, v_s.settled_to, v_to) as m) q) then
      perform public.hr_reject('bad_xp_event', jsonb_build_object('xp_event', p_hunt->'xp_event', 'level_xp', p_delta->'level_xp')); end if;
  end if;
  -- STAMINA LOW: once per hunt, when the pool this window left is at or under the limits row.
  if not v_train and v_e <= coalesce(public.hr_hunt_limit('stamina_low_min'), 0)::bigint * 60000
     and not exists (select 1 from public.hunt_session_events e where e.session_id = p_session and e.type = 'stamina_low') then
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'stamina_low', v_to, jsonb_build_object('n', v_e / 60000));
  end if;

  -- BLESSINGS (hook: hr_blessing_take): the death keeps only the unprotected share of its
  -- loss (Level and skills); the tiers it used (held since before the window began) are used up.
  -- SESSION-MODES: a mode whose death uses no Blessing (one that costs nothing: the Burning Tower) never calls the hook; they stay held.
  if v_nd > 0 and v_mode.blessings then
    v_bless := public.hr_blessing_take(p_user, p_slot, p_session, v_dx, v_s.settled_to);
    if v_bless is not null then v_dx := v_bless->'dx'; v_lost := v_bless->'lost'; end if;
  end if;
  -- (6) THE PRICE OF THE DEATH, RE-CHECKED AND DEBITED (Tyler 2026-11-09, CORE_MODEL.md §6):
  --     DEATH-SHARE: every bound is hr_death_xp_max, the one rule: the LEVEL loses at most
  --     death_xp_permille of its TOTAL XP, and that may take a Level (never below 0 XP, Level 1);
  --     each combat skill loses at most the permille of its progress into its level, never a level.
  --     Bounds are read on the CURRENT values, which only grew since the death.
  --     SESSION-MODES: each bound is that rule at the instance mode's share (hr_death_xp_mode_max): the rule itself in a hunt, and 0 in
  --     a mode whose death costs nothing, so there any death XP at all is refused (the engine proposes none: two locks).
  if v_lost <> '{}'::jsonb then
    for v_k, v_n in select key, (value #>> '{}')::bigint from jsonb_each(v_lost) order by key loop
      if v_k = 'level' then
        select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot for update;
        if v_n > public.hr_death_xp_mode_max('level', v_cur, v_mode.death_loss_pm) then
          perform public.hr_reject('death_xp_over', jsonb_build_object('skill', 'level', 'level', public.hr_char_level(v_cur))); end if;
        update public.player_state set level_xp = level_xp - v_n where user_id = p_user and slot = p_slot;
        continue;
      end if;
      select xp into v_cur from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_k for update;
      if v_cur is null then perform public.hr_reject('bad_death_xp', jsonb_build_object('skill', v_k)); end if;
      if v_n > public.hr_death_xp_mode_max(v_k, v_cur, v_mode.death_loss_pm) then
        perform public.hr_reject('death_xp_over', jsonb_build_object('skill', v_k, 'level', public.hr_skill_level(v_k, v_cur))); end if;
      update public.player_skills set xp = xp - v_n where user_id = p_user and slot = p_slot and skill_id = v_k;
    end loop;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'death_xp',
              jsonb_build_object('reason', 'death_xp', 'xp', v_lost, 'deaths', v_nd, 'permille', v_rate), p_session);
    for v_r in select e.id, e.data->>'skill' as sk, (e.data->>'level')::int as lv
                 from public.hunt_session_events e
                where e.session_id = p_session and e.id > v_ev0 and e.type = 'level_up' and v_lost ? (e.data->>'skill') loop
      if v_r.sk = 'level' then
        v_fin := public.hr_char_level((select level_xp from public.player_state where user_id = p_user and slot = p_slot));
        v_lv0 := public.hr_char_level(coalesce(v_lx0, 0));
      else
        v_fin := public.hr_skill_level(v_r.sk, (select xp from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_r.sk));
        v_lv0 := public.hr_skill_level(v_r.sk, coalesce((v_xp0->>v_r.sk)::bigint, 0));
      end if;
      if v_r.lv > v_fin then
        if v_fin > v_lv0 then update public.hunt_session_events set data = data || jsonb_build_object('level', v_fin) where id = v_r.id;
        else delete from public.hunt_session_events where id = v_r.id; end if;
      end if;
    end loop;
  end if;
  -- DEATH-SHARE: the death names the Level it took the hero from and to (equal when it took none), off the debited Level XP.
  if v_nd > 0 then
    select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot;
    v_lto := public.hr_char_level(v_cur);
    v_lfrom := public.hr_char_level(v_cur + coalesce((v_lost->>'level')::bigint, 0));
  end if;
  v_fi := 0;
  for v_r in select e.id from public.hunt_session_events e
              where e.session_id = p_session and e.id > v_ev0 and e.type = 'death' order by e.id loop
    v_el := coalesce(v_dx->v_fi, '{}'::jsonb);
    update public.hunt_session_events
       set data = data || jsonb_build_object('xp_lost', v_el, 'xp', (select coalesce(sum((x.value #>> '{}')::bigint), 0) from jsonb_each(v_el) x),
                                             'level_from', v_lfrom, 'level_to', v_lto)
     where id = v_r.id;
    v_fi := v_fi + 1;
  end loop;

  -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home), by the job's kind.
  --     BENCH-RESUME (2027-04-24-bench-resume.sql): the step is hr_hunt_resume, whole, so a new kind of job never restates this body.
  perform public.hr_hunt_resume(p_user, p_slot, p_session, v_h->>'ended', v_ev0);
  -- THE ANALYZER TALLY (display) and THE HERO'S UNIT (null once it has left).
  -- LIVE-EVENTS: the tally's one update also keeps the event's part (bounded above), analyzer or not.
  -- MEMBER-WRITE-ONCE: the store bill (v_cost > 0) rides this one write; each column keeps its own condition.
  if (p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object') or p_hunt ? 'xp_event' or v_cost > 0 then
    update public.hunt_session_tally t
       set bought = case when v_cost > 0 then public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                                                from jsonb_each(v_items) i)) else t.bought end,
           supply_gold = t.supply_gold + v_cost,
           xp_event = t.xp_event + coalesce((p_hunt->>'xp_event')::bigint, 0),
           dealt = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                        then public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)) else t.dealt end,
           taken = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                        then public.hr_hunt_tally_add(t.taken, coalesce(p_analyzer->'taken', '{}'::jsonb)) else t.taken end,
           healed = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                         then public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb)) else t.healed end,
           fight = case when p_analyzer ? 'fight' then jsonb_build_object('boss_pm', p_analyzer->'fight'->'boss_pm',
             'fired', public.hr_jsonb_add(coalesce(t.fight->'fired', '{}'::jsonb), coalesce(p_analyzer->'fight'->'fired', '{}'::jsonb))) else t.fight end
     where t.session_id = p_session;
  end if;
  -- MEMBER-WRITE-ONCE: written only when it moves (the session half already took this row's version forward).
  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end
   where id = p_session and unit_id is distinct from (case when ended_at is null then v_unit_id end);
  -- The debited (blessed) loss of the death travels back with the answer.
  return coalesce(v_h, '{}'::jsonb) || case when v_nd > 0 then jsonb_build_object('death_xp', v_dx) else '{}'::jsonb end
    -- THE BILL hr_hunt_apply_instance pays (and strips before any answer leaves it).
    || case when v_cost > 0 then jsonb_build_object('_purse', jsonb_build_object('cost', v_cost, 'units', v_units,
                                   'items', v_items, 'floor', v_floor)) else '{}'::jsonb end;
end $function$;

-- ── §7 THE FLOOR'S TIME, PROVEN (hr_hunt_settle_session, RESTATED WHOLE: the v0.2.135 image, 2027-04-24-boss-call-series.sql's, §0 pins it) ─
-- The image's text byte for byte plus ONE arm, `floor_time`, beside `boss_time` in the end-reason proof (marked TOWER-CLIMB below). Restated
-- rather than spliced (2026-11-17, tests/patch-chain-guard.mjs PATCH-1: the chain was five anchored patches deep since 2027-03-12-boss-call.sql).
-- The body is the one the splice produced, so its md5 is the same: every later pin of hr_hunt_settle_session still reads.
CREATE OR REPLACE FUNCTION public.hr_hunt_settle_session(p_user uuid, p_slot integer, p_session uuid, p_delta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_skew       constant interval := interval '60 seconds';
  c_max_window constant bigint   := 24 * 3600000;   -- the outage fuse, never a gameplay cap
  c_min_swing_ms constant bigint := 500;            -- fuse on the swing count, not a balance figure
  c_keys constant text[] := array['swing_from', 'swing_to', 'to', 'next_swing_at', 'uses', 'paid_ms', 'raw_xp', 'hints', 'ended'];
  v_s      public.hunt_sessions%rowtype;
  v_to     timestamptz; v_next timestamptz;
  v_win    bigint;
  v_from_i bigint; v_to_i bigint;
  v_k text; v_v jsonb; v_kind text; v_left bigint; v_n bigint;
  v_deaths int; v_lx bigint;
  v_end text; v_end_at timestamptz;
  v_hwm bigint; v_new_hwm bigint;
  v_coins bigint; v_kills bigint;
  v_xp jsonb; v_loot jsonb; v_sup jsonb;
  v_ev int := 0; v_r record; v_hint jsonb; v_at timestamptz; v_i int;
  v_next_id uuid;
  v_held text;  -- CALL-SERIES (2027-04-24-boss-call-series.sql): a won fight's end, held for hr_boss_call_step
  v_raw jsonb;
  v_used   jsonb := '{}'::jsonb;
  v_used_n bigint := 0;
  v_supply jsonb;
  v_store  boolean;
  -- THE FOLD'S TIME BOUND: every row this folds was stamped in the transaction
  -- of a settle, and a window is at most c_max_window.
  v_fold_from timestamptz := now() - interval '25 hours';
begin
  -- ── VALIDATE (no writes) ───────────────────────────────────────────────
  if p_user is null or p_slot is null or p_session is null or p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  if exists (select 1 from jsonb_object_keys(p_delta) k where k <> all (c_keys)) then
    perform public.hr_reject('unknown_delta_key'); end if;
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session then perform public.hr_reject('no_hunt'); end if;

  if jsonb_typeof(p_delta->'swing_from') is distinct from 'number' or jsonb_typeof(p_delta->'swing_to') is distinct from 'number'
     or (p_delta->>'swing_from') !~ '^[0-9]{1,15}$' or (p_delta->>'swing_to') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  v_from_i := (p_delta->>'swing_from')::bigint; v_to_i := (p_delta->>'swing_to')::bigint;
  if v_from_i <> v_s.swing_index then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  begin
    v_to := (p_delta->>'to')::timestamptz;
    v_next := (p_delta->>'next_swing_at')::timestamptz;
  exception when others then
    perform public.hr_reject('bad_window');
  end;
  if v_to is null or v_next is null or v_to <= v_s.settled_to then
    perform public.hr_reject('bad_window', jsonb_build_object('settled_to', v_s.settled_to)); end if;
  if v_to > now() + c_skew then perform public.hr_reject('window_in_future'); end if;
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  if v_win > c_max_window then perform public.hr_reject('window_too_long'); end if;
  if v_next < v_to or v_next > v_to + c_skew then perform public.hr_reject('bad_next_swing'); end if;
  if v_to_i < v_from_i or v_to_i - v_from_i > v_win / c_min_swing_ms + 1 then
    perform public.hr_reject('bad_swing'); end if;

  -- OWN USES: packed bag lines only, of a kind a hunt spends, never more than is left.
  if p_delta ? 'uses' then
    if jsonb_typeof(p_delta->'uses') <> 'object' or (select count(*) from jsonb_object_keys(p_delta->'uses')) > 10 then
      perform public.hr_reject('bad_uses'); end if;
    for v_k, v_v in select key, value from jsonb_each(p_delta->'uses') loop
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,9}$' then
        perform public.hr_reject('bad_uses', jsonb_build_object('item', left(v_k, 64))); end if;
      v_n := (v_v #>> '{}')::bigint;
      select b.qty_left, p.kind into v_left, v_kind
        from public.hunt_bag b left join public.hr_hunt_supplies p on p.item_id = b.item_id
       where b.session_id = p_session and b.item_id = v_k;
      if v_left is null then perform public.hr_reject('not_in_bag', jsonb_build_object('item', left(v_k, 64))); end if;
      if v_n > v_left then perform public.hr_reject('bag_short', jsonb_build_object('item', v_k, 'left', v_left)); end if;
      -- OWN-DRINKS (2026-12-16-own-drinks-settle.sql): a drink (`mana`) is spent from the bag exactly as food is,
      -- the kinds the member applier's lane caps count; a feast (`buff`) never is.
      if v_n > 0 and v_kind is distinct from 'heal' and v_kind is distinct from 'mana' and v_kind is distinct from 'ammo' then
        perform public.hr_reject('kind_not_used', jsonb_build_object('item', v_k, 'kind', v_kind)); end if;
      v_left := null; v_kind := null;
    end loop;
  end if;

  -- THE DEATH: the death rows hr_apply stamped with this session since the last fold (at most one).
  select t.ledger_hwm into v_hwm from public.hunt_session_tally t where t.session_id = p_session;
  v_hwm := coalesce(v_hwm, 0);
  select count(*) into v_deaths from public.player_ledger l
   where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'combat' and l.intent = 'death';
  if v_deaths > 1 then perform public.hr_reject('bad_counts', jsonb_build_object('deaths', v_deaths)); end if;
  if (p_delta ? 'paid_ms' and (jsonb_typeof(p_delta->'paid_ms') <> 'number' or (p_delta->>'paid_ms')::numeric < 0
                                  or (p_delta->>'paid_ms')::numeric > v_win)) then
    perform public.hr_reject('bad_counts'); end if;
  v_raw := coalesce(p_delta->'raw_xp', '{}'::jsonb);
  if jsonb_typeof(v_raw) <> 'object' or (select count(*) from jsonb_object_keys(v_raw)) > 24
     or exists (select 1 from jsonb_each(v_raw) x where x.key !~ '^[a-zA-Z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number'
                   or (x.value #>> '{}')::numeric < 0 or (x.value #>> '{}')::numeric > 1e12) then
    perform public.hr_reject('bad_counts'); end if;

  -- THE END, re-proved from server state as it will stand after the uses.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
  v_store := v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch';
  if p_delta ? 'ended' and jsonb_typeof(p_delta->'ended') = 'object' then
    v_end := p_delta->'ended'->>'reason';
    begin v_end_at := (p_delta->'ended'->>'at')::timestamptz;
    exception when others then perform public.hr_reject('bad_end'); end;
    if v_end is null or not exists (select 1 from public.hr_hunt_end_reasons where reason = v_end)
       or v_end_at is null or v_end_at < v_s.settled_to or v_end_at > v_to then
      perform public.hr_reject('bad_end'); end if;
    if not coalesce(case v_end
      -- DIED (Tyler 2026-10-19): this settle journalled the hero's death.
      when 'died' then v_deaths >= 1
      -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): another member's end (its death:
      -- party_member_died; any other: party_member_left) sends THIS hero home only through its own box
      -- (player_state.party_leave_together, written only by its own hr_party_leave_together_set) and only in an
      -- instance that holds another member: the end can only stop value, never mint it.
      when 'party_member_died' then coalesce((select ps.party_leave_together from public.player_state ps
                                               where ps.user_id = p_user and ps.slot = p_slot), false)
                                    and exists (select 1 from public.hunt_sessions o
                                                 where o.instance_id = v_s.instance_id and o.id <> v_s.id)
      when 'party_member_left' then coalesce((select ps.party_leave_together from public.player_state ps
                                               where ps.user_id = p_user and ps.slot = p_slot), false)
                                    and exists (select 1 from public.hunt_sessions o
                                                 where o.instance_id = v_s.instance_id and o.id <> v_s.id)
      -- heals_out / ammo_out: every essential line of the kind empty after the
      -- uses, and the store closed to it (the hero's explicit `end`) or holding
      -- no row it could buy instead.
      when 'heals_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                         where b.session_id = p_session and p.kind = 'heal' and b.essential
                                           and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0)
                        and exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                     where b.session_id = p_session and p.kind = 'heal' and b.essential)
                        -- STORE-BY-SLOT (2026-11-04): any store food a slot may name (the player picks it).
                        and not (v_store and exists (select 1 from public.hr_hunt_basic_supplies q where q.kind = 'heal'))
      when 'ammo_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                        where b.session_id = p_session and p.kind = 'ammo' and b.essential
                                          and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0)
                       and exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                    where b.session_id = p_session and p.kind = 'ammo' and b.essential)
                       and not (v_store and exists (select 1 from public.hunt_bag b join public.hr_hunt_basic_supplies q
                                                     on q.kind = 'ammo' and q.partner = b.item_id
                                                    where b.session_id = p_session and b.essential))
      -- GOLD_OUT: the store was open to the hero, and the gold left over its floor
      -- (after this window's coins and cover, written before this call, and its own
      -- store bill, hr.purse_pending, which hr_hunt_apply_instance pays after every
      -- member) is below the dearest store row it could need. ACCOUNT GOLD
      -- (2026-12-15-account-gold.sql): the purse is the ACCOUNT's. A hero sharing this
      -- instance with another hero of its own account spent the one purse in time order
      -- with it, which no per-member read can re-prove: then, like party_member_died,
      -- the end is provable only as "the store was open" — it can only stop value.
      when 'gold_out' then v_store
                       and (exists (select 1 from public.hunt_sessions o
                                     where o.instance_id = v_s.instance_id and o.id <> v_s.id
                                       and o.user_id = p_user and o.hunt_from < v_to
                                       and (o.ended_at is null or o.ended_at > v_s.settled_to))
                            or public.hr_purse_of(p_user)
                           - coalesce(nullif(current_setting('hr.purse_pending', true), '')::bigint, 0)
                           - (v_supply->>'gold_floor')::bigint
                         < coalesce((select max(q.price) from public.hr_hunt_basic_supplies q
                                      where q.kind in ('heal', 'mana')
                                         or (q.kind = 'ammo' and (q.partner in (select b.item_id from public.hunt_bag b where b.session_id = p_session)
                                                                  or q.partner = (select pe.item_id from public.player_equipment pe
                                                                                   where pe.user_id = p_user and pe.slot = p_slot
                                                                                     and pe.equip_slot = 'ammo')))), 0))
      -- STAMINA: hr_hunt_apply_member wrote this window's end value at `to` before this call.
      when 'stamina' then coalesce((select ps.stamina_ms from public.player_state ps
                                     where ps.user_id = p_user and ps.slot = p_slot), 1) <= 0
      when 'hours' then v_s.hours_limit is not null and v_end_at >= v_s.hunt_from + make_interval(hours => v_s.hours_limit)
      when 'left' then v_s.leave_at is not null and v_end_at >= v_s.leave_at
      when 'changed' then v_s.change_at is not null and v_end_at >= v_s.change_at
      when 'server' then not coalesce((select enabled from public.hr_hunt_config where id), false)
      -- NO-FIGHT (2027-02-11-no-fight-settle.sql): nobody in the instance landed a blow for the limit's minutes
      -- (the engine's reading of its world). Provable as: hunting that long, and no kill in this window. It can only stop value.
      when 'no_fight' then v_end_at >= v_s.hunt_from + make_interval(mins => public.hr_hunt_limit('no_fight_min'))
                           and not exists (select 1 from public.player_ledger l
                                            where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from
                                              and jsonb_typeof(l.meta->'kills') = 'number' and (l.meta->>'kills')::numeric > 0)
      -- CALL-OUT (2027-03-12-boss-call.sql): the room's ends, on a room only. The kill journals nothing to read (a called kill counts no kills), so, like `rule`, it can only stop value.
      when 'boss_felled' then exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id)
                              -- BOSS-HALL (2027-04-20-boss-hall.sql): a keyed hall ends the same way.
                              or exists (select 1 from public.hr_boss_halls h where h.hunt_id = v_s.hunt_id)
      when 'boss_time' then exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id
                                      and v_end_at >= coalesce(v_s.fight_from, v_s.hunt_from) + make_interval(secs => c.limit_ms / 1000.0) - c_skew) -- CALL-SERIES: from the FIGHT's start
                            or exists (select 1 from public.hr_boss_halls h where h.hunt_id = v_s.hunt_id
                                      and v_end_at >= v_s.hunt_from + make_interval(secs => h.limit_ms / 1000.0) - c_skew)
      -- TOWER-CLIMB (2027-04-24-tower-climb.sql): the Burning Tower's floor ran out of time (src/core/hunt/tower.js). The room's instant is the
      -- engine's world, so it is provable as: a climb, at least one floor's time into it. Like `rule`, it can only stop value.
      when 'floor_time' then exists (select 1 from public.hr_tower_rules r where r.hunt_id = v_s.hunt_id
                                       and v_end_at >= v_s.hunt_from + make_interval(secs => r.floor_limit_ms / 1000.0) - c_skew)
      -- RUNE-SUPPLY (2027-03-24-rune-supply.sql, Tyler 2026-11-08): a spell's slot set to "Leave the hunt" came to cast with none of
      -- the runes it ticks left (src/core/hunt/abilities.js runeFor). Provable as: the session's bar holds that spell (`ended.ability`,
      -- the engine's) switched on and leaving on empty, and no rune it ticks is left in the hunt bag after this window's uses. It can
      -- only stop value, never mint it.
      when 'runes_out' then exists (select 1 from public.player_action_sets a
                                     cross join lateral jsonb_array_elements(case when jsonb_typeof(a.slots) = 'array' then a.slots else '[]'::jsonb end) e
                                     cross join lateral (select public.hr_hunt_rune_supply(e->'action') as rs) x
                                    where a.user_id = p_user and a.slot = p_slot and a.preset = v_s.preset
                                      and jsonb_typeof(e) = 'object' and e->'action'->>'id' = p_delta->'ended'->>'ability'
                                      and e->'enabled' is distinct from 'false'::jsonb and x.rs->>'onEmpty' = 'leave'
                                      and not exists (select 1 from public.hunt_bag b
                                                       where b.session_id = p_session and x.rs->'own' @> jsonb_build_array(b.item_id)
                                                         and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0))
      -- RULE (lane action-engine): one of the hero's own stop rules held (src/core/hunt/conditions.js);
      -- provable only as "the preset carries a stop rule": the end can only stop value, never mint it.
      when 'rule' then exists (select 1 from public.player_action_sets a where a.user_id = p_user and a.slot = p_slot
                                 and a.preset = v_s.preset and jsonb_typeof(a.options->'stop_rules') = 'array'
                                 and jsonb_array_length(a.options->'stop_rules') > 0)
      else false end, false) then
      perform public.hr_reject('end_not_proven', jsonb_build_object('reason', v_end));
    end if;
  elsif p_delta ? 'ended' and jsonb_typeof(p_delta->'ended') <> 'null' then
    perform public.hr_reject('bad_end');
  else
    -- AN END THE ENGINE OWED: a death journalled, a leave/change/hours
    -- instant more than one skew behind the window end.
    if v_deaths >= 1
       or (v_s.leave_at is not null and v_to > v_s.leave_at + c_skew)
       or (v_s.change_at is not null and v_to > v_s.change_at + c_skew)
       or (v_s.hours_limit is not null and v_to > v_s.hunt_from + make_interval(hours => v_s.hours_limit) + c_skew)
       -- CALL-OUT: the limit is owed too: no window runs a called room past it.
       or exists (select 1 from public.hr_boss_halls h where h.hunt_id = v_s.hunt_id and v_to > v_s.hunt_from + make_interval(secs => h.limit_ms / 1000.0) + c_skew)
       or exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id and v_to > coalesce(v_s.fight_from, v_s.hunt_from) + make_interval(secs => c.limit_ms / 1000.0) + c_skew) then
      perform public.hr_reject('end_missing'); end if;
  end if;
  v_hint := coalesce(p_delta->'hints', '{}'::jsonb);
  if jsonb_typeof(v_hint) <> 'object' then perform public.hr_reject('bad_hints'); end if;

  -- ── APPLY ──────────────────────────────────────────────────────────────
  -- (1) OWN USES: the bag, and ONE `supply_own` row per settle carrying every
  --     unit used in meta.items (qty = the units destroyed, negative, gold 0).
  if p_delta ? 'uses' then
    for v_k, v_v in select key, value from jsonb_each(p_delta->'uses') order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      update public.hunt_bag set qty_left = qty_left - v_n where session_id = p_session and item_id = v_k
        returning qty_left into v_left;
      v_used := v_used || jsonb_build_object(v_k, v_n);
      v_used_n := v_used_n + v_n;
      if v_left = 0 then
        v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_hint->'slot_dry'->v_k), v_to), v_s.settled_to), v_to);
        insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
          values (p_session, p_user, p_slot, 'slot_dry', v_at, jsonb_build_object('item', v_k));
        v_ev := v_ev + 1;
      end if;
    end loop;
    if v_used_n > 0 then
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
        values (p_user, p_slot, 'hunt', 'supply_own', 0, -v_used_n,
                jsonb_build_object('side', 'bag', 'source', 'own', 'items', v_used), p_session);
    end if;
  end if;

  -- (2) THE FOLD: every row stamped with this session since the high-water mark.
  select coalesce(sum(case when l.kind <> 'hunt' then coalesce(l.gold, 0) else 0 end), 0),
         coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then greatest(0, (l.meta->>'kills')::numeric) else 0 end), 0)::bigint,
         max(l.id)
    into v_coins, v_kills, v_new_hwm
    from public.player_ledger l where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from;
  -- THE LEVEL XP the fold credited (hr_apply's ledger meta `lx`), tallied under `level`.
  select coalesce(sum((l.meta->'delta'->>'lx')::numeric), 0)::bigint into v_lx
    from public.player_ledger l
   where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
     and jsonb_typeof(l.meta->'delta'->'lx') = 'number';
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_xp from (
    select x.key as k, sum(x.value::numeric) as v
      from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'delta'->'x') = 'object'
                                                         then l.meta->'delta'->'x' else '{}'::jsonb end) x
     where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
     group by x.key) a;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_loot from (
    select k, sum(v) as v from (
      select i.key as k, i.value::numeric as v
        from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'delta'->'i') = 'object'
                                                           then l.meta->'delta'->'i' else '{}'::jsonb end) i
       where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
      union all
      select '*', (l.meta->'delta'->>'i_sum')::numeric
        from public.player_ledger l
       where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
         and jsonb_typeof(l.meta->'delta'->'i_sum') = 'number') u
    group by k) a;
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_sup from (
    select i.key as k, sum(i.value::numeric) as n
      from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'items') = 'object'
                                                         then l.meta->'items' else '{}'::jsonb end) i
     where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'hunt' and l.intent = 'supply_own'
     group by i.key) a;
  update public.hunt_session_tally t
     set coins = t.coins + v_coins, kills = t.kills + v_kills, deaths = t.deaths + v_deaths,
         xp = public.hr_jsonb_add(t.xp, v_xp || case when v_lx > 0 then jsonb_build_object('level', v_lx) else '{}'::jsonb end),
         loot = public.hr_jsonb_add(t.loot, v_loot),
         supplies = public.hr_jsonb_add(t.supplies, v_sup), raw_xp = public.hr_jsonb_add(t.raw_xp, v_raw),
         paid_ms = t.paid_ms + coalesce((p_delta->>'paid_ms')::numeric, 0)::bigint,
         ledger_hwm = greatest(t.ledger_hwm, coalesce(v_new_hwm, 0)), updated_at = now()
   where t.session_id = p_session;

  -- (3) DERIVED EVENTS. The death from its row; Level- and level-ups from the XP the
  --     fold credited; rare drops only for items this fold looted.
  v_i := 0;
  for v_r in select l.at, l.meta->>'monster' as monster from public.player_ledger l
              where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'combat' and l.intent = 'death' order by l.id loop
    v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_hint->'death'->v_i), v_r.at), v_s.settled_to), v_to);
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'death', v_at, jsonb_build_object('monster', left(coalesce(v_r.monster, ''), 64)));
    v_i := v_i + 1; v_ev := v_ev + 1;
  end loop;
  if v_lx > 0 then
    select public.hr_char_level(ps.level_xp), public.hr_char_level(greatest(0, ps.level_xp - v_lx))
      into v_n, v_left from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    if v_n > v_left then
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'level_up', v_to, jsonb_build_object('skill', 'level', 'level', v_n));
      v_ev := v_ev + 1;
    end if;
  end if;
  for v_r in select x.key as skill, public.hr_skill_level(x.key, ps.xp) as lv_now,
                    public.hr_skill_level(x.key, greatest(0, ps.xp - floor(x.value::numeric)::bigint)) as lv_then
               from jsonb_each_text(v_xp) x
               join public.player_skills ps on ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = x.key
              where x.value::numeric > 0 loop
    if v_r.lv_now > v_r.lv_then then
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'level_up', v_to, jsonb_build_object('skill', left(v_r.skill, 64), 'level', v_r.lv_now));
      v_ev := v_ev + 1;
    end if;
  end loop;
  if jsonb_typeof(v_hint->'rare_drop') = 'array' then
    for v_r in select distinct on (e.value->>'item') e.value->>'item' as item, e.value->'at' as at_ms
                 from jsonb_array_elements(v_hint->'rare_drop') with ordinality e(value, o)
                where jsonb_typeof(e.value) = 'object' and coalesce((v_loot->>(e.value->>'item'))::numeric, 0) > 0
                order by e.value->>'item', e.o limit 10 loop
      v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_r.at_ms), v_to), v_s.settled_to), v_to);
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'rare_drop', v_at, jsonb_build_object('item', left(v_r.item, 64)));
      v_ev := v_ev + 1;
    end loop;
  end if;

  -- FACTION-STANDING (2027-04-22-faction-standing.sql): this window's hunting time, as this settle proved it, to the hero's standing
  -- or its open swap when the ground pays a side. The server's window and catalogue; no number the engine sent.
  perform public.hr_faction_credit(p_user, p_slot, v_s.hunt_id, v_s.settled_to, coalesce(v_end_at, v_to));

  -- (4) THE SESSION CLOCK.
  update public.hunt_sessions
     set swing_index = v_to_i, settled_to = v_to, next_swing_at = v_next, version = version + 1
   where id = p_session;

  -- (5) THE END.
  if v_end = 'changed' then
    v_next_id := public.hr_hunt_swap(p_session, v_end_at);
  elsif v_end = 'boss_felled' and nullif(current_setting('hr.boss_plan', true), '') is not null
        and exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id) then
    -- CALL-SERIES (2027-04-24-boss-call-series.sql): a won fight in a room with a plan is HELD, not closed. hr_boss_call_step
    -- (hr_hunt_apply_member, right after this half) charges the next fight or ends the series, as hr_hunt_apply_instance planned for the room.
    v_held := v_end; v_end := null;
  elsif v_end is not null then
    perform public.hr_hunt_close(p_session, v_end, v_end_at, true);
  end if;

  return jsonb_build_object('ok', true, 'session', p_session, 'swing_index', v_to_i, 'settled_to', v_to,
                            'ended', v_end, 'next_session', v_next_id, 'events', v_ev,
                            'version', (select version from public.hunt_sessions where id = p_session))
         || case when v_held is not null then jsonb_build_object('held', v_held) else '{}'::jsonb end;
end $function$;

-- ── §8 GRANTS: the helpers are the owner's; the verb is the client's alone; the restated bodies keep theirs ─
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_mode_checkpoints(text,integer)', 'public.hr_tower_record(uuid,integer)', 'public.hr_tower_floor_of(uuid)',
                               'public.hr_mode_pays(text,jsonb)', 'public.hr_tower_check(uuid,jsonb,timestamp with time zone,timestamp with time zone)',
                               'public.hr_tower_write(uuid,integer,uuid,jsonb,bigint,timestamp with time zone)', 'public.hr_tower_run_end()'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
  revoke execute on function public.hr_tower_start(int, int, uuid) from public;
  revoke execute on function public.hr_tower_start(int, int, uuid) from anon, service_role;
  grant  execute on function public.hr_tower_start(int, int, uuid) to authenticated;
end $mig$;
-- an older signature's row goes (the 11-15 p_floor one); the current one is upserted, so a second apply keeps its approved_at (byte-identical)
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_tower_start'
  and identity_args <> 'p_slot integer, p_landing integer, p_idem uuid';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_tower_start', 'p_slot integer, p_landing integer, p_idem uuid', 'authenticated',
   'added 2027-04-24 (lane/c-tower-climb), checkpoints 2026-11-16 (lane/c-tower-checkpoints): RANKED (the floors a board will read) - opens a Burning Tower climb, alone or the party leader''s for every seat, from the floor after a checkpoint the server lists from its own record (the lowest seat''s best in a party; bad_landing otherwise); behind the switch burning_tower (feature_off); no value moves; pre-EA Security list')
  on conflict (proname, identity_args, grantee) do update set note = excluded.note;
-- THE SWITCH, seeded OFF once (2027-03-21-feature-switches.sql): a re-apply never reverts the Coordinator's flip.
insert into public.hr_feature_switches (switch_id, scope, note) values
  ('burning_tower', 'off', '2027-04-24-tower-climb.sql: the Burning Tower''s one door, hr_tower_start. Off: refused (feature_off), and nothing else opens a climb. Stays off until the window and the art land (CLAUDE.md §3.5).')
  on conflict (switch_id) do nothing;

-- ── §9 (no section: the window lane reads the climb; the tables are the owner's to read under RLS) ─

-- ── §10 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ─────────
do $$
declare
  v_u      constant uuid := '000000c0-0000-4000-a000-0000704e0001';
  k        constant text := '000000c0-0000-4000-b000-704e';
  v        jsonb; v_sig text; v_role text; t text; v_sid uuid; v_tw jsonb; v_hunt text; v_t0 timestamptz; v_src text;
  v_end    jsonb := '{"accrued_to":"x"}'::jsonb;
  v_sw     text;
begin
  select hunt_id into v_hunt from public.hr_tower_rules where id;
  -- the switch as the probe finds it (seeded off; on for everyone once 2027-05-03-tower-arm.sql has applied): (g) wants it back exactly so
  select concat_ws('|', f.scope, f.accounts::text) into v_sw from public.hr_feature_switches f where f.switch_id = 'burning_tower';
  -- (a) PRIVILEGES: every helper the owner's alone; the verb the signed-in client's alone; the tables readable by their owner, written by no client.
  foreach v_sig in array array['public.hr_mode_checkpoints(text,integer)', 'public.hr_tower_record(uuid,integer)', 'public.hr_tower_floor_of(uuid)',
                               'public.hr_mode_pays(text,jsonb)', 'public.hr_tower_check(uuid,jsonb,timestamp with time zone,timestamp with time zone)',
                               'public.hr_tower_write(uuid,integer,uuid,jsonb,bigint,timestamp with time zone)', 'public.hr_tower_run_end()',
                               'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'public.hr_hunt_instance_read(uuid,integer)',
                               'public.hr_hunt_admit(uuid,integer,text)', 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_sig, 'execute') then raise exception 'tower-climb §10(a): % can execute %', v_role, v_sig; end if;
    end loop;
  end loop;
  if not has_function_privilege('authenticated', 'public.hr_tower_start(integer,integer,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_tower_start(integer,integer,uuid)', 'execute') then
    raise exception 'tower-climb §10(a): hr_tower_start is not the signed-in client''s alone'; end if;
  if not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_tower_start' and grantee = 'authenticated') then
    raise exception 'tower-climb §10(a): hr_tower_start is not on the client baseline'; end if;
  if to_regclass('public.tower_landings') is not null or to_regprocedure('public.hr_tower_starts(uuid,integer)') is not null then
    raise exception 'tower-climb §10(a): the weekly start rule is still here (Tyler 2026-11-16: checkpoints replace it)'; end if;
  if public.hr_mode_checkpoints('tower', 0) is distinct from array[0] or public.hr_mode_checkpoints('tower', 57) is distinct from array[0, 10, 20, 30, 40, 50]
     or public.hr_mode_checkpoints('hunt', 57) is distinct from array[0] or public.hr_mode_checkpoints('nowhere', 57) is not null
     or (select checkpoint_every from public.hr_session_modes where mode_id = 'tower') is distinct from (select landing_every from public.hr_tower_rules where id) then
    raise exception 'tower-climb §10(a): the checkpoints are not every landing up to the record'; end if;
  foreach t in array array['tower_progress', 'tower_runs'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass) then raise exception 'tower-climb §10(a): % has no RLS', t; end if;
    if has_table_privilege('authenticated', 'public.' || t, 'insert,update,delete') or has_table_privilege('anon', 'public.' || t, 'select') then
      raise exception 'tower-climb §10(a): a client can write % (or anon read it)', t; end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd <> 'SELECT') then
      raise exception 'tower-climb §10(a): % has a client write policy', t; end if;
  end loop;
  if (select scope from public.hr_feature_switches where switch_id = 'burning_tower') is null then
    raise exception 'tower-climb §10(a): no burning_tower switch'; end if;
  -- (b) THE BODIES CARRY THEIR ARMS
  if strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure), 'hr_tower_floor_of') = 0
     or strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_admit(uuid,integer,text)'::regprocedure), 'tower_only') = 0
     or strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure), 'when ''floor_time''') = 0 then
    raise exception 'tower-climb §10(b): a restated body lost its TOWER-CLIMB arm'; end if;
  foreach t in array array['hr_mode_pays(v_mode.mode_id', 'hr_tower_check(p_session', 'hr_tower_write(p_user', '''xp_event'' - ''tower''', 'v_mode.xp_pm <> 1000'] loop
    if strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), t) = 0 then
      raise exception 'tower-climb §10(b): hr_hunt_apply_member lost %', t; end if;
  end loop;
  -- THE READ HELPERS ARE PLANNED ONCE (plpgsql: a SET-clause SQL body is re-planned per call on PostgreSQL 17), and THE DOOR READS ITS KEY
  -- AGAIN UNDER ITS LOCK, before it opens anything (a second press of one key answers the first's receipt).
  if exists (select 1 from pg_proc p join pg_language l on l.oid = p.prolang
              where p.oid in ('public.hr_mode_checkpoints(text,integer)'::regprocedure, 'public.hr_tower_record(uuid,integer)'::regprocedure,
                              'public.hr_tower_floor_of(uuid)'::regprocedure)
                and l.lanname <> 'plpgsql') then
    raise exception 'tower-climb §10(b): a Tower read helper is a SQL function again (re-planned on every call on PostgreSQL 17)'; end if;
  v_src := (select prosrc from pg_proc where oid = 'public.hr_tower_start(integer,integer,uuid)'::regprocedure);
  if strpos(v_src, '''hr:tower:''') = 0
     or strpos(substr(v_src, strpos(v_src, '''hr:tower:''')), 'public.hr_intent_replay(') = 0
     or strpos(substr(v_src, strpos(v_src, '''hr:tower:''')), 'public.hr_intent_replay(') > strpos(substr(v_src, strpos(v_src, '''hr:tower:''')), 'public.hr_hunt_enter_for(')
     or strpos(v_src, 'v_a->>''replayed''') = 0 then
    raise exception 'tower-climb §10(b): hr_tower_start does not read its key again under its door''s lock before it opens a climb'; end if;
  -- (c) WHAT A MODE PAYS: the Tower's mode refuses each thing it doesn't pay, and passes a window that pays only XP; a hunt passes all of it.
  if public.hr_mode_pays('tower', '{"gold": 5}') is distinct from 'gold'
     or public.hr_mode_pays('tower', '{"items": {"bones": 1}}') is distinct from 'items'
     or public.hr_mode_pays('tower', '{"hearthfind": {"item": "x"}}') is distinct from 'items'
     or public.hr_mode_pays('tower', '{"journal": {"meta": {"kills": 5, "km": {"rat": 5}}}}') is distinct from 'bestiary'
     or public.hr_mode_pays('tower', '{"progress": [{"kind": "stat", "key": "ev:kill_monster:rat", "add": 1}]}') is distinct from 'bestiary'
     or public.hr_mode_pays('tower', '{"gold": 0, "items": {}, "xp": {"melee": 40}, "level_xp": 90, "journal": {"meta": {"kills": 5}},
                                     "progress": [{"kind": "stat", "key": "kills", "add": 5}]}') is not null
     or public.hr_mode_pays('hunt', '{"gold": 5, "items": {"bones": 1}, "journal": {"meta": {"km": {"rat": 1}}}}') is not null then
    raise exception 'tower-climb §10(c): hr_mode_pays does not hold the modes'' rows'; end if;
  -- (d) THE DOOR AND THE CLIMB on a real hero (the settle's own path, both doors, is tests/tower-climb.mjs).
  begin
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Tower') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'tower-climb §10 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'tower-climb §10(d): hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    -- the switch off: refused, nothing open
    update public.hr_feature_switches set scope = 'off' where switch_id = 'burning_tower';
    v := public.hr_tower_start(0, 0, (k || '00000001')::uuid);
    if v->>'error' is distinct from 'feature_off' then raise exception 'tower-climb §10(d): the switch off answered %', v; end if;
    update public.hr_feature_switches set scope = 'accounts', accounts = array[v_u] where switch_id = 'burning_tower';
    -- the ordinary door: refused
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, (k || '00000002')::uuid);
    if coalesce(v->>'ok', '') = 'true' or v::text not like '%tower_only%' then raise exception 'tower-climb §10(d): the ordinary door answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    -- a checkpoint the hero has not reached: refused, nothing open, the list named
    v := public.hr_tower_start(0, 40, (k || '00000003')::uuid);
    if v->>'error' is distinct from 'bad_landing' or v->'checkpoints' is distinct from '[0]'::jsonb
       or exists (select 1 from public.hunt_sessions h where h.user_id = v_u and h.ended_at is null) then
      raise exception 'tower-climb §10(d): an unearned checkpoint answered % (or left a session open)', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    -- the default (the best: a new hero's is checkpoint 0): floor 1, in the Tower's mode, the engine's read on floor 1, the run's row
    v := public.hr_tower_start(0, null, (k || '00000004')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'tower-climb §10(d): floor 1 answered %', v; end if;
    v_sid := (v->>'session_id')::uuid;
    if public.hr_hunt_instance_read(v_u, 0)->'instance'->>'session_mode' is distinct from 'tower'
       or (public.hr_hunt_instance_read(v_u, 0)->'instance'->>'tower_floor')::int is distinct from 1
       or (select start_floor from public.tower_runs where session_id = v_sid) is distinct from 1 then
      raise exception 'tower-climb §10(d): the climb did not open on floor 1 in the Tower''s mode (the engine reads %)', public.hr_hunt_instance_read(v_u, 0)->'instance'; end if;
    -- the same key again: the first answer, nothing new
    v := public.hr_tower_start(0, null, (k || '00000004')::uuid);
    if (select count(*) from public.tower_runs where user_id = v_u) <> 1 then raise exception 'tower-climb §10(d): a replayed key opened a second run (%)', v; end if;
    -- (e) THE FLOORS, re-proved: out of order, too fast, a non-climb claiming floors, short of kills; then honest floors write the run and the best
    select h.settled_to into v_t0 from public.hunt_sessions h where h.id = v_sid;
    begin
      perform public.hr_tower_check(v_sid, '{"tower": {"floors": [2, 3]}}', v_t0, v_t0 + interval '20 seconds');
      raise exception 'tower-climb §10(e): floors out of order were taken';
    exception when sqlstate 'HR000' then if sqlerrm <> 'tower_floor_forged' then raise; end if; end;
    begin
      perform public.hr_tower_check(v_sid, '{"tower": {"floors": [1, 2, 3, 4]}}', v_t0, v_t0 + interval '5 seconds');
      raise exception 'tower-climb §10(e): four floors in five seconds were taken';
    exception when sqlstate 'HR000' then if sqlerrm <> 'tower_too_fast' then raise; end if; end;
    begin
      perform public.hr_tower_check('00000000-0000-4000-8000-000000000000', '{"tower": {"floors": [1]}}', v_t0, v_t0 + interval '20 seconds');
      raise exception 'tower-climb §10(e): a session that is no climb claimed a floor';
    exception when sqlstate 'HR000' then if sqlerrm <> 'bad_tower' then raise; end if; end;
    v_tw := public.hr_tower_check(v_sid, '{"tower": {"floors": [1, 2, 3]}}', v_t0, v_t0 + interval '20 seconds');
    begin
      perform public.hr_tower_write(v_u, 0, v_sid, v_tw, 9, v_t0 + interval '20 seconds');
      raise exception 'tower-climb §10(e): three floors on nine kills were written';
    exception when sqlstate 'HR000' then if sqlerrm <> 'tower_floor_forged' then raise; end if; end;
    perform public.hr_tower_write(v_u, 0, v_sid, v_tw, 15, v_t0 + interval '20 seconds');
    if (select top_floor from public.tower_runs where session_id = v_sid) is distinct from 3
       or (public.hr_hunt_instance_read(v_u, 0)->'instance'->>'tower_floor')::int is distinct from 4
       or (select best_floor from public.tower_progress where user_id = v_u and slot = 0) is distinct from 3 then
      raise exception 'tower-climb §10(e): three honest floors did not move the run, the read and the best'; end if;
    -- a landing: the best, and with it a checkpoint (the record its next climb may start after)
    v_tw := public.hr_tower_check(v_sid, '{"tower": {"floors": [4, 5, 6, 7, 8, 9, 10]}}', v_t0 + interval '20 seconds', v_t0 + interval '60 seconds');
    perform public.hr_tower_write(v_u, 0, v_sid, v_tw, 50, v_t0 + interval '60 seconds');
    if (select best_landing from public.tower_progress where user_id = v_u and slot = 0) is distinct from 10
       or public.hr_tower_record(v_u, 0) <> 10 or public.hr_mode_checkpoints('tower', public.hr_tower_record(v_u, 0)) is distinct from array[0, 10] then
      raise exception 'tower-climb §10(e): landing 10 did not become a checkpoint (record %)', public.hr_tower_record(v_u, 0); end if;
    -- (f) THE END: the run stamped and one aggregate row journalled, once
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    if (select end_reason from public.tower_runs where session_id = v_sid) is distinct from 'left'
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'tower_run') <> 1 then
      raise exception 'tower-climb §10(f): the run''s end was not stamped and journalled once'; end if;
    raise exception using errcode = 'HRM01', message = 'tower-climb §10 complete - rolling back';
  exception when sqlstate 'HRM01' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.tower_runs where user_id = v_u)
     or exists (select 1 from public.player_intents where user_id = v_u)
     or (select concat_ws('|', f.scope, f.accounts::text) from public.hr_feature_switches f where f.switch_id = 'burning_tower') is distinct from v_sw then
    raise exception 'tower-climb §10(g): §10 LEAKED a probe row'; end if;
  raise notice 'tower-climb: one door behind its switch, a checkpoint the hero (or the party''s lowest seat) reached, floors re-proved against the run, what a mode pays honored; all green';
end $$;
