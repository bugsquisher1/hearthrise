-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-06-catacombs.sql — THE UNMARKED CATACOMBS' DESCENT ON THE TOWER'S OWN MACHINERY: A WING PICKED BEFORE ENTER, A RECORD AND A START DOOR
--   PER WING, A CATACOMB KEY FROM EVERY VAULT DOOR CLEARED, THE SAME HEARTH CHEST ROLLING ARMOR, KEY FAMILIES CAPPED ON OPENS AND HELD ACROSS THE
--   ACCOUNT, AND "CATACOMBS, DEEPEST" ALONE AND IN A PARTY (lane/c-catacombs, backend-architect, 2026-11-18; Tyler 2026-11-16, the board's
--   "2026-11-16 The Unmarked Catacombs descent": their "OWN game mode like the Burning Tower", ARMOR instead of weapons, a WING picked before the
--   run, Waterlogged and Bone keys by Bronze / Silver / Gold / Platinum on the SAME chest, 6 opened per family per hero a week, a held limit of
--   about 30, its own leaderboard; Tyler 2026-11-16 checkpoints: any vault door up to your best in that wing, a party the highest door every
--   member reached; Tyler 2026-11-18 "Start it now").
--   STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA (CLAUDE.md §2):
--   applies on its passing §9. ON THE EA SECURITY LIST: a new client verb (hr_catacomb_start), keys minted from a ranked descent, a server roll
--   that pays tradeable armor, the held limit and the weekly cap (now for BOTH families), and two ranked boards.
--   HIDDEN: the switch `unmarked_catacombs` is seeded OFF. While it is off for an account the descent's door answers feature_off, its keys are
--   neither listed nor opened at the chest (feature_off), and its section is null. The Tower's own surfaces read as before.
--
-- ── WHY (the table decision) ────────────────────────────────────────────────
-- The design (2026-11-16) asked to rename the Tower's tables neutral before anything shipped. The Tower shipped in v0.2.135 and is played, so
-- this file EXTENDS them in place instead of renaming them: tower_runs and tower_progress gain the run ground they belong to (hunt_id), the
-- catalogue hr_tower_rules became one row a run ground (2027-05-06-catacombs-tower-catalogue.generated.sql), and every body that read "the
-- Tower" now reads "the run's ground". A rename would restate every reader (the settle's helpers, the sections, the boards, the wipe, the census)
-- for a name alone, on live rows, for no player-visible gain; the names now mean "the run engine's tables, named after its first mode". Live
-- Tower rows stay exactly what they were: every existing run and record is backfilled with its own session's hunt (the Tower's), nothing is
-- seeded, healed or granted (CLAUDE.md §2). The warmth moves to a per-family table copied from the live column it replaces (asserted equal).
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- hr_catacomb_start(p_slot int, p_wing text, p_landing int, p_idem uuid) -> jsonb   NEW CLIENT VERB (authenticated; hr_client_rpc_baseline).
--   Opens a descent on wing p_wing (hr_tower_rules.wing: 'flooded', 'bone') from the room after vault door p_landing (0: room 1; null: the
--   highest door of the record, "default = best"). Alone: the hero's record in that wing; in a party: the leader's call for every seat (the
--   leader picks the wing), the record the lowest best of the seats in that wing. The door's Level is the wing row's min_level (the hero, then
--   every other seat). Refusals, each opening nothing and journalling nothing but the sampled rejection: not_signed_in, bad_slot, bad_idem,
--   bad_landing (not 0..1e6, or no door of the record: `checkpoints` lists them), bad_wing (no wing row), feature_off, catalogue_missing,
--   rate_limited, party_hunting, catacomb_level { need, have }, catacomb_party_level { who, need, have }, and every refusal a hunt's start runs
--   (hunt_open, activity_running, not_leader, not_ready { seats }, the play cap, an empty stamina pool, ...).
--   ok: { ok, version, session_id, session, wing, landing, floor, checkpoints, party }. A replay of the key answers once and opens once.
-- hr_tower_start(p_slot, p_landing, p_idem) RESTATED (2027-05-05-entry-gates.sql's image, §0 pins it): the same contract and refusal codes, its
--   body now hr_run_start's (below) on the Tower's ground. Nothing a player sees moves.
-- hr_run_start(...) NEW, owner-only: ONE door's body for every run ground (the Tower's and each wing's): the key under the door's lock, the
--   sessions first, then the Level and the record under their locks, one tower_runs row a seat carrying its session's hunt, one journal-only
--   hr_apply. Its lock is the hero's one run door (hr:tower:<uid>:<slot>): a hero can't race a climb against a descent.
-- THE RECORD, PER GROUND: tower_progress (user_id, slot, hunt_id) and tower_runs.hunt_id (both NEW columns; the key moves). hr_run_record(user,
--   slot, hunt) NEW (alone: the hero's best on that ground; in a party: the lowest of its seats'); hr_tower_record(user, slot) RESTATED (the
--   Tower's ground's). hr_tower_check / hr_tower_write RESTATED: the rules read are the run's ground's, the record written its ground's, and the
--   run's board raised right there (below). The settle's other bodies are unchanged: they read hr_tower_rules by hunt and the run by session.
-- THE BOARDS: hr_mode_board rows keyed by BOARD id (the column keeps its first name, mode_id): 'tower' (every Tower run, as before),
--   'catacomb' (a descent alone, either wing: "Catacombs, Deepest") and 'catacomb_party' (a descent in a party). Raised ONLY in hr_tower_write,
--   raise-only, in the settle that writes the record (it was the trigger on tower_progress, which can't tell a party's run from a hero's: dropped).
--   hr_tower_board_run_start / _run_end RESTATED: the run's own board. The score is the deepest room a hero was alive to clear (Tyler: "deepest
--   room"; Leaderboards rank the best floor or room ever).
-- KEYS (hr_tower_key_mint RESTATED, generic): every landing (vault door) a run clears is the key of the run ground's own highest row at or under
--   it (hr_chest_keys.ground), to each hero alive at its Keeper's death (the run's top floor rises only for a hero standing when the room fell).
--   THE HELD LIMIT, PER FAMILY, ACROSS THE ACCOUNT (the design §4, both families: "counted over every bag AND Storage ... so nobody shuffles keys
--   into Storage to make room"): hr_chest_family_held RESTATED counts the family's keys in EVERY hero's bag and Key Ring and the account's
--   Storage; hr_chest_family_cap NEW is held_max x the account's heroes (30 x 4 = 120). At the cap no key drops: a journal-only row
--   (<family>_key_withheld) says so. The ledger intents are '<family>_key' ('tower_key' as before, 'catacomb_key').
-- THE CHEST (hr_chest_open RESTATED): the key's family's switch gates it (hr_chest_key_families.switch_id); the week is the family's own six
--   (unchanged rule, now for both); the warmth is the FAMILY's (chest_warmth NEW: a weapon never cools an armor streak); a weapon key rolls as
--   before; an ARMOR key rolls the same chance (base x warmth x stoke), then its slot (hr_seed 'chest:<n>:slot' under helmet_pm: a Bone Key 70%
--   helmets, a Waterlogged Key 30%), then its weight (the hero's own worn weight in that slot own_pm of the time, else even; nothing worn there:
--   even thirds; hr_chest_roll's own rule). A key short of its six pieces is chest_not_ready, kept. The outfit roll and the call-out are every
--   key's. chest_opens gains armor, armor_slot, armor_weight. Receipt opens[]: { n, stokes, chance_ppm, weapon, family, armor, slot, weight,
--   outfit, bundle }. New refusal: none (feature_off, chest_not_ready, week_limit, no_key, bag_full as before, per family).
-- hr_chest_section RESTATED: families (only those whose switch is on for the account) { family, name, opened, max, held, held_max (the account's
--   cap), per_hero, dry, warmth_pm }; keys of those families { ..., gear, ground, helmet_pm, armor [{ slot, weight, item }] }; top-level dry and
--   warmth_pm stay the Tower family's (the live Tower window reads them).
-- hr_tower_section RESTATED (2027-04-30-tower-board.sql's image): it reads the Tower's ground's rows only (a hero now has a record per ground).
-- hr_catacomb_section(user, slot) NEW, the envelope's section `catacomb` (hr_state_sections): null while unmarked_catacombs is off; else
--   { wings [{ wing, hunt, name, best, record, checkpoints, last_start }], last_wing, rules { room_size, door_every, room_limit_ms, door_limit_ms,
--   room_top }, gate { need, level, ok, short [{ seat, name, level }] }, pays { xp_pm, coin, drops, bestiary, death_loss_pm, blessings, stamina },
--   run { session, wing, start, top, floors, room } | null, last { session, wing, start, top, floors, end_reason, ended_at, keys [{ door, key }],
--   withheld, board } | null, party [{ seat, name, best { <wing>: n }, outfit }], field { solo, party } (each hr_mode_board_field, absent with no
--   row), chest (hr_chest_section) }. Every number the tab shows is one of these.
-- ERRORS inside the settle: as 2027-04-24-tower-climb.sql's (bad_tower, tower_floor_forged, tower_too_fast, catalogue_missing).
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- Both doors: the key replay first, the gate, the hero's ONE run-door lock, the key read again under it (2027-04-19-key-under-lock.sql), then
--   the sessions (each seat's character lock), then the Level and the record under those locks, and every seat or none (HR879 rolls back).
-- The settle: unchanged order (instance, characters, the run row for update); the board row raised there is the hero's own.
-- The mint: inside the settle (the run row's top rises once a landing); the account-wide held count reads the OTHER heroes' bags without their
--   locks (as Storage was read before): two heroes of one account minting the same instant can pass the cap by one. Accepted (it gates a drop).
-- The open: hero lock, the depot key, chest_luck for update (the roll index), then the family's chest_warmth row for update: one transaction.
-- This file's own apply locks tower_progress, tower_runs, chest_luck and chest_opens (ACCESS EXCLUSIVE) before it copies a row, so no settle or
--   open lands between a copy and the column it replaces.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- ONE new client verb, behind its switch: it carries a wing id and a checkpoint, each compared with the server's own catalogue and record (the
--   lowest seat's in a party). No client value prices or pays anything. The chest takes no new argument: the family, its switch, its week, its
--   warmth, the slot and the weight are all the server's (the key row's lean, the hero's own equipment row, hr_seed). The armor pieces trade
--   (Tyler 2026-10-23: no bound gear) at their twins' book values; keys stay bound (hr_items.tradeable false). NEW CROSSING: two boards (a hero's
--   name, deepest room and the day it was reached), on the Tower's board machinery and walls (hidden heroes, no account id). Risks named for
--   Security: (a) the held cap is account-wide by design and read without the other heroes' locks (above); (b) the armor roll's slot and weight
--   streams are hr_seed's like the weapon's (replayable from chest_opens with the secret); (c) a party run ranks on the party board for every
--   seat, so a strong four can carry a weak seat's party place (the Tower's own rule; the solo board can't be carried).
--
-- ── COST (rows and bytes at 100x players) ──────────────────────────────────
-- Per descent: the Tower's (one run row, one ledger row at its start and its end, a key row a vault door, ~120 + ~80 bytes). Per open: one
-- chest_warmth upsert more than before. Per settle of a run: one board probe and at most one raise. The section: when the switch is on, about
-- 20 index reads (two wings' records, the newest runs by (user, slot, hunt), two board fields, the chest's). At 100x (600 heroes descending an
-- hour a day): ~4,200 runs and ~8,400 ledger rows a week, ~25,000 key rows; chest_warmth at most 2 rows a hero (~100 KB). No per-room or
-- per-kill row (CLAUDE.md §1 law 6).
--
-- EDGE: MOVES (pack-edge --hash): src/data/tower.js (RUN_GROUNDS), src/core/hunt/tower.js (rooms from a run row: a wing's roster, a fixed Keeper),
--   combat-sim.js, xp-share.js, hunt-settle.js, hunt-grounds.js, hunts.js, session-modes.js. Either order is safe: no client opens a wing while the
--   switch is off, and an older engine on a wing would read the Tower's rooms only if one were opened.
-- CLIENT: none here (a later lane builds the Catacombs tab on `catacomb` and wires hr_catacomb_start; refusal words in src/data/refusal-words.js).
-- ORDER: after 2027-05-06-catacombs-chest-catalogue.generated.sql (the last of the descent's catalogues: items, hunt-sessions, session-modes, run
--   grounds, chest), then 2027-05-06-catacombs-hunts-catalogue.generated.sql (the wings' hr_hunts rows, once this door stands).
-- REVERSIBLE: delete the wings' hr_hunts rows first; re-apply the §0 images of hr_tower_start (2027-05-05-entry-gates.sql), hr_tower_record,
--   hr_tower_check, hr_tower_write (2027-04-24-tower-climb.sql), hr_tower_key_mint, hr_chest_open, hr_chest_section, hr_chest_family_held
--   (2027-04-27-tower-chest.sql), hr_tower_section, hr_tower_board_run_start/_end and hr_tower_board_rise with its two triggers (2027-04-30-tower-board.sql)
--   after putting chest_luck.dry back from chest_warmth's 'tower' rows and the keys back to (user_id, slot); drop hr_catacomb_start (and its
--   baseline row), hr_run_start, hr_run_record, hr_run_board_of, hr_chest_family_cap, hr_chest_warmth_of, hr_catacomb_section (and its section row),
--   chest_warmth, the three chest_opens columns and the switch row. A Catacomb key or piece already held stays an item; the wipe empties them.
-- IDEMPOTENT: a second apply finds §0's post-images, the columns and keys in place (every move guarded), restates every body byte-identical,
--   upserts the same rows, keeps the switch as the Coordinator left it, and §9 rolls back its probes.
-- WIPE: chest_warmth joins 2027-02-25-character-wipe.sql's c_wipe, hr_chest_armor its c_no_player.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each restated body is exactly the image this file was written against (the replayed chain's after 2027-05-05-entry-gates.sql) or this file's
-- own (a second apply): md5 of pg_get_functiondef with every run of whitespace one space. hr_tower_board_rise is dropped here: checked only while
-- it stands.
do $mig$
declare v_r record; v_md5 text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_tower_rules' and column_name = 'board_party')
     or not exists (select 1 from public.hr_tower_rules where wing is not null)
     or (select count(*) from public.hr_tower_rules where id) <> 1 then
    raise exception 'PRECONDITION: apply 2027-05-06-catacombs-tower-catalogue.generated.sql first (one hr_tower_rules row a run ground, the Tower marked)'; end if;
  if not exists (select 1 from public.hr_session_modes where mode_id = 'catacomb')
     or exists (select 1 from public.hr_tower_rules r where not exists (select 1 from public.hr_ground_session_modes g where g.hunt_id = r.hunt_id))
     or exists (select 1 from public.hr_tower_rules r where not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = r.hunt_id)) then
    raise exception 'PRECONDITION: apply the descent''s hunt-sessions and session-modes catalogues first (every run ground served, each on its mode)'; end if;
  if to_regclass('public.hr_chest_armor') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_chest_key_families' and column_name = 'switch_id')
     or not exists (select 1 from public.hr_chest_keys where gear = 'armor')
     or exists (select 1 from public.hr_chest_key_families where switch_id is null) then
    raise exception 'PRECONDITION: apply 2027-05-06-catacombs-chest-catalogue.generated.sql first (the key families'' switches, the armor keys and table)'; end if;
  if to_regclass('public.tower_runs') is null or to_regclass('public.tower_progress') is null or to_regclass('public.chest_opens') is null
     or to_regclass('public.chest_luck') is null or to_regclass('public.hr_mode_board') is null or to_regclass('public.hr_feature_switches') is null
     or to_regprocedure('public.hr_entry_gates_view(uuid,integer)') is null or to_regprocedure('public.hr_level_of(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_party_start(integer,text,uuid)') is null or to_regprocedure('public.hr_mode_board_field(text,uuid,integer)') is null then
    raise exception 'PRECONDITION: a table or helper this file reads is missing (the Tower, its chest, its board, the entry gates)'; end if;
  for v_r in select * from (values
    ('public.hr_tower_start(integer,integer,uuid)', '15c452e5c51d9d029b0e5c949d9c5160', '020e3b121325909ac6a748839be5afd9'),
    ('public.hr_tower_record(uuid,integer)', 'ead2976832eeeaf52dc353d67c9a5d5a', '39ce54b5e1129a08233cc7a0e71f8014'),
    ('public.hr_tower_check(uuid,jsonb,timestamp with time zone,timestamp with time zone)', 'b19e04edf28724a88f7a5a2c283a7449', '658b1ba39f55e6412fc4c803f2ceea58'),
    ('public.hr_tower_write(uuid,integer,uuid,jsonb,bigint,timestamp with time zone)', '2081b410b423ad1ea8686040a483cd0c', 'fe6515dde9a6876dee29c8ba30424c2d'),
    ('public.hr_tower_key_mint()', '3acdd24e1fb3940deb4a4951cd046a0b', '6b694e31f5483dd45c6481b5a60fe185'),
    ('public.hr_chest_open(integer,text,text,integer,integer,uuid)', '9d86c2ece2df3d46584e879bd877448c', '334926cfabe17327816a48f7dd41ca40'),
    ('public.hr_chest_section(uuid,integer)', '8d6fe5332d098ccebcc87f863e5f6fcb', '5242f5d20e7dbac434247c260d5d3882'),
    ('public.hr_chest_family_held(uuid,integer,text)', 'a8cee1423e8bacc5de8055a04fc790f7', 'bfddfd0798d74c5193a6af3a8ca6cfca'),
    ('public.hr_tower_section(uuid,integer)', 'fe24bd5fba49169a4caa474555285d9f', '34bff2517e8adc8d395e0f12e2b8e265'),
    ('public.hr_tower_board_run_start()', 'c16b57671a108aacf024530c251ea043', '3829c523c5f1cb2a1f5404c11d9d44ae'),
    ('public.hr_tower_board_run_end()', '29ae32376fb06fb6d1f57f55add22d09', 'be52cb59a1681e9215e0a2baff903e69'),
    ('public.hr_state_sections_of(uuid,integer)', '358bd3ba408d9a07980e5fc5a8c2fb17', '92f72b2af4233cb8bfe30a62c5d354fc'),
    ('public.hr_tower_board_rise()', '5e5875a75f033abc76a0c6f788ea6971', '5e5875a75f033abc76a0c6f788ea6971')) t(fn, pre, post) loop
    continue when to_regprocedure(v_r.fn) is null and v_r.fn = 'public.hr_tower_board_rise()';
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file restates (%) nor its own (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE SWITCH, seeded OFF once (2027-03-21-feature-switches.sql): a re-apply never reverts the Coordinator's flip ─────────────
insert into public.hr_feature_switches (switch_id, scope, note) values
  ('unmarked_catacombs', 'off', '2027-05-06-catacombs.sql: the Unmarked Catacombs'' descent: its one door (hr_catacomb_start), its keys at the Hearth Chest and its section (catacomb). Off: refused (feature_off), unlisted, null. Stays off until the Catacombs tab and its art land (CLAUDE.md §3.5).')
  on conflict (switch_id) do nothing;

-- ── §2 THE RECORD PER RUN GROUND, THE ARMOR'S JOURNAL, THE WARMTH PER FAMILY (no new client write: owner reads only) ─────────────
-- No settle, open or start lands between a copy below and the column it fills: the four tables are this transaction's until it commits.
lock table public.tower_runs, public.tower_progress, public.chest_luck, public.chest_opens in access exclusive mode;

-- tower_runs: each run's ground is its own session's hunt (hunt_sessions.hunt_id, the server's), never a guess.
alter table public.tower_runs add column if not exists hunt_id text;
update public.tower_runs t set hunt_id = h.hunt_id from public.hunt_sessions h where h.id = t.session_id and t.hunt_id is null;
update public.tower_runs t set hunt_id = (select r.hunt_id from public.hr_tower_rules r where r.id) where t.hunt_id is null;
alter table public.tower_runs alter column hunt_id set not null;
create index if not exists tower_runs_ground on public.tower_runs (user_id, slot, hunt_id, started_at desc);
comment on column public.tower_runs.hunt_id is '2027-05-06-catacombs.sql: the run ground this run is on (the Burning Tower or a Catacomb wing): its session''s hunt, written by hr_run_start from hunt_sessions. Every reader of a run reads its ground''s rules (hr_tower_rules by hunt_id).';

-- tower_progress: a record per hero PER GROUND (each wing keeps its own deepest door). Every row before this file is the Tower's.
alter table public.tower_progress add column if not exists hunt_id text;
update public.tower_progress p set hunt_id = (select r.hunt_id from public.hr_tower_rules r where r.id) where p.hunt_id is null;
alter table public.tower_progress alter column hunt_id set not null;
do $mig$
begin
  if exists (select 1 from pg_constraint c where c.conrelid = 'public.tower_progress'::regclass and c.contype = 'p'
              and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (user_id, slot)') then
    alter table public.tower_progress drop constraint tower_progress_pkey;
    alter table public.tower_progress add constraint tower_progress_pkey primary key (user_id, slot, hunt_id);
  end if;
end $mig$;
comment on table public.tower_progress is '2027-04-24-tower-climb.sql, per ground since 2027-05-06-catacombs.sql: each hero''s best floor (room) and landing (vault door) on each run ground (raise-only), written only by hr_tower_write inside the settle. The record a run''s checkpoints are read from (hr_run_record). RLS: own rows readable, no client write.';

-- chest_opens: an armor key's find (its piece, slot and weight), beside a weapon key's; never both; only on a hit.
alter table public.chest_opens add column if not exists armor text check (armor ~ '^[a-z0-9_]{1,64}$');
alter table public.chest_opens add column if not exists armor_slot text check (armor_slot in ('helmet', 'boots'));
alter table public.chest_opens add column if not exists armor_weight text check (armor_weight in ('heavy', 'medium', 'light'));
alter table public.chest_opens drop constraint if exists chest_opens_armor;
alter table public.chest_opens add constraint chest_opens_armor check ((armor is null) = (armor_slot is null) and (armor is null) = (armor_weight is null)
  and (armor is null or (weapon is null and roll < chance_ppm)));
comment on column public.chest_opens.armor is '2027-05-06-catacombs.sql: the armor piece a Catacomb key found (armor_slot, armor_weight beside it), or null. A weapon key''s find stays in weapon/family.';

-- chest_warmth: the Hearth's warmth for EACH key family (the design §3: a weapon never cools an armor streak), owner-read, no client write.
create table if not exists public.chest_warmth (
  user_id    uuid        not null,
  slot       int         not null check (slot between 0 and 5),
  key_family text        not null check (key_family ~ '^[a-z0-9_]{1,40}$'),
  dry        int         not null default 0 check (dry >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot, key_family)
);
alter table public.chest_warmth enable row level security;
revoke all on table public.chest_warmth from public, anon, authenticated, service_role;
grant select on table public.chest_warmth to authenticated;
drop policy if exists "chest_warmth own read" on public.chest_warmth;
create policy "chest_warmth own read" on public.chest_warmth for select to authenticated using (user_id = (select auth.uid()));
comment on table public.chest_warmth is '2027-05-06-catacombs.sql: each hero''s Hearth warmth for each key family (dry: that family''s keys since its last piece), copied from chest_luck.dry for the Tower family when this file landed. Written only by hr_chest_open. RLS: own rows readable, no client write.';
-- THE COPY, then the column it replaces goes (once: a second apply finds no column). Every live hero's Tower warmth is carried exactly.
do $mig$
declare v_bad bigint;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chest_luck' and column_name = 'dry') then
    execute $q$insert into public.chest_warmth (user_id, slot, key_family, dry, updated_at)
               select l.user_id, l.slot, 'tower', l.dry, l.updated_at from public.chest_luck l where l.dry > 0
               on conflict (user_id, slot, key_family) do nothing$q$;
    execute $q$select count(*) from public.chest_luck l left join public.chest_warmth w on w.user_id = l.user_id and w.slot = l.slot and w.key_family = 'tower'
                where coalesce(w.dry, 0) <> l.dry$q$ into v_bad;
    if v_bad <> 0 then raise exception 'catacombs §2: % hero(es)'' Tower warmth did not copy', v_bad; end if;
    alter table public.chest_luck drop column dry;
  end if;
end $mig$;
comment on table public.chest_luck is '2027-04-27-tower-chest.sql: each hero''s lifetime key count (opens: the roll''s index and the titles'' count) and its default stokes a key; its warmth moved to chest_warmth (per family) in 2027-05-06-catacombs.sql. Written only by hr_chest_open and hr_chest_stoke_default. RLS: own rows readable, no client write.';
create index if not exists chest_opens_family_n on public.chest_opens (user_id, slot, key_family, n);

-- ── §3 THE HELPERS (owner-only; plpgsql, never sql: the settle and the sections read them, tests/settle-budget.mjs SB-3) ──────────
-- A RUN'S RECORD ON ONE GROUND: the hero's best floor (room) there, or, for a hero seated in an open party, the LOWEST best of its seats there
-- (Tyler 2026-11-16: "a party starts at the highest landing every member has reached"). 0 for a hero who never ran it.
create or replace function public.hr_run_record(p_user uuid, p_slot int, p_hunt text)
returns int language plpgsql stable set search_path = public, pg_catalog as $$
declare v_party uuid := public.hr_hunt_party_of(p_user, p_slot);
begin
  -- CATACOMBS (2027-05-06-catacombs.sql): TOWER-CHECKPOINTS' record, per run ground
  if v_party is null then
    return coalesce((select p.best_floor from public.tower_progress p where p.user_id = p_user and p.slot = p_slot and p.hunt_id = p_hunt), 0);
  end if;
  return coalesce((select min(coalesce(p.best_floor, 0)) from public.hunt_party_members m
                     left join public.tower_progress p on p.user_id = m.user_id and p.slot = m.slot and p.hunt_id = p_hunt
                    where m.party_id = v_party), 0);
end $$;

-- The Tower's record (its readers predate the run grounds): its ground's.
create or replace function public.hr_tower_record(p_user uuid, p_slot int)
returns int language plpgsql stable set search_path = public, pg_catalog as $$
begin
  -- TOWER-CHECKPOINTS (2027-04-24-tower-climb.sql); CATACOMBS (2027-05-06-catacombs.sql): the Tower's ground's record (hr_run_record)
  return public.hr_run_record(p_user, p_slot, (select r.hunt_id from public.hr_tower_rules r where r.id));
end $$;

-- THE BOARD A RUN RANKS ON: its ground's board, or its party board for a run of two or more seats (null party board: the same board).
create or replace function public.hr_run_board_of(p_hunt text, p_party int)
returns text language plpgsql stable set search_path = public, pg_catalog as $$
begin
  -- CATACOMBS (2027-05-06-catacombs.sql)
  return (select case when coalesce(p_party, 1) > 1 and r.board_party is not null then r.board_party else r.board end
            from public.hr_tower_rules r where r.hunt_id = p_hunt);
end $$;

-- THE CLIMB'S FLOORS, RE-PROVED (unchanged but for the rules it reads: the run's own ground's, not the Tower's alone).
create or replace function public.hr_tower_check(p_session uuid, p_hunt jsonb, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql set search_path = public, pg_catalog as $fn$
declare v_run public.tower_runs%rowtype; v_r public.hr_tower_rules%rowtype; v_f jsonb; v_n int; v_lo int; v_win bigint; v_xp bigint;
begin
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql); CATACOMBS (2027-05-06-catacombs.sql): the rules are the run's ground's
  select * into v_run from public.tower_runs where session_id = p_session for update;
  if not found then
    if p_hunt ? 'tower' then perform public.hr_reject('bad_tower', jsonb_build_object('why', 'not_a_climb')); end if;
    return null;
  end if;
  select * into v_r from public.hr_tower_rules where hunt_id = v_run.hunt_id;
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

-- THE CLIMB, WRITTEN: each floor a room of the run's kills, but the first; then the run (its rising top is the key mint); then the hero's best ON
-- THE RUN'S GROUND, raise-only (the record its checkpoints read); then the run's BOARD, raise-only (hr_run_board_of: the Tower's every run, a
-- descent's alone or in a party). The board is raised here and only here, in the settle that writes the record, under the character's lock.
create or replace function public.hr_tower_write(p_user uuid, p_slot int, p_session uuid, p_tw jsonb, p_kills bigint, p_to timestamptz)
returns void language plpgsql set search_path = public, pg_catalog as $fn$
declare
  v_run public.tower_runs%rowtype; v_r public.hr_tower_rules%rowtype;
  v_lo int := (p_tw->>'lo')::int; v_n int := (p_tw->>'n')::int; v_k bigint := greatest(coalesce(p_kills, 0), 0);
  v_hi int; v_board text;
begin
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql); CATACOMBS (2027-05-06-catacombs.sql): the run's ground's rules, record and board
  select * into v_run from public.tower_runs where session_id = p_session for update;
  select * into v_r from public.hr_tower_rules where hunt_id = v_run.hunt_id;
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
  insert into public.tower_progress (user_id, slot, hunt_id, best_floor, best_landing, best_at, updated_at)
    values (p_user, p_slot, v_run.hunt_id, v_hi, (v_hi / v_r.landing_every) * v_r.landing_every, p_to, now())
    on conflict (user_id, slot, hunt_id) do update
      set best_at = case when excluded.best_floor > public.tower_progress.best_floor then excluded.best_at else public.tower_progress.best_at end,
          best_floor = greatest(public.tower_progress.best_floor, excluded.best_floor),
          best_landing = greatest(public.tower_progress.best_landing, excluded.best_landing),
          updated_at = now();
  -- THE BOARD (2027-04-30-tower-board.sql's rows): the hero's own row on its run's board, raised to this room the instant the window reached it
  v_board := public.hr_run_board_of(v_run.hunt_id, v_run.party);
  if v_board is null then perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'run_board')); end if;
  insert into public.hr_mode_board as b (mode_id, user_id, slot, score, reached_at, updated_at)
  select v_board, p_user, p_slot, v_hi, p_to, now()
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
  on conflict (mode_id, user_id, slot) do update set score = excluded.score, reached_at = excluded.reached_at, updated_at = excluded.updated_at
   where excluded.score > b.score;
end $fn$;

-- What THE ACCOUNT holds of a key FAMILY: every key of it in every hero's bag and Key Ring and the account's Storage (the design §4: counted
-- across the account, so moving keys between heroes or into Storage never makes room). p_slot is kept for the callers' signature.
create or replace function public.hr_chest_family_held(p_user uuid, p_slot int, p_family text)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql); CATACOMBS (2027-05-06-catacombs.sql): the whole account's
  return coalesce((select sum(i.qty) from public.player_inventory i join public.hr_chest_keys k on k.item_id = i.item_id
                    where i.user_id = p_user and k.key_family = p_family), 0)::bigint
       + coalesce((select sum(r.qty) from public.player_key_ring r join public.hr_chest_keys k on k.item_id = r.item_id
                    where r.user_id = p_user and k.key_family = p_family), 0)::bigint
       + coalesce((select sum(b.qty) from public.account_bank b join public.hr_chest_keys k on k.item_id = b.item_id
                    where b.user_id = p_user and k.key_family = p_family), 0)::bigint;
end $fn$;

-- THE ACCOUNT'S HELD CAP of a family: its held_max for each hero on the account (30 each: four heroes, 120). Null for no family row.
create or replace function public.hr_chest_family_cap(p_user uuid, p_family text)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- CATACOMBS (2027-05-06-catacombs.sql)
  return (select f.held_max::bigint * greatest(1, (select count(*) from public.player_state ps where ps.user_id = p_user))
            from public.hr_chest_key_families f where f.key_family = p_family);
end $fn$;

-- A hero's warmth for one key family (its keys since the family's last piece), 0 with no row.
create or replace function public.hr_chest_warmth_of(p_user uuid, p_slot int, p_family text)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- CATACOMBS (2027-05-06-catacombs.sql)
  return coalesce((select w.dry from public.chest_warmth w where w.user_id = p_user and w.slot = p_slot and w.key_family = p_family), 0);
end $fn$;

-- THE MINT, FOR EVERY RUN GROUND: each landing (vault door) a run clears is the key of its ground's highest row at or under it, once a run, unless
-- the ACCOUNT already holds its family's cap; the ledger intent is the family's ('tower_key', 'catacomb_key'). A trigger on tower_runs' top
-- floor, which only hr_tower_write moves (inside the settle) and only ever up.
create or replace function public.hr_tower_key_mint()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_r public.hr_tower_rules%rowtype; v_f public.hr_chest_key_families%rowtype; v_k public.hr_chest_keys%rowtype; v_l int; v_held bigint;
  v_cap bigint; v_intent text;
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql); CATACOMBS (2027-05-06-catacombs.sql): the run's ground's keys, the family's account-wide cap
  select * into v_r from public.hr_tower_rules r where r.hunt_id = new.hunt_id;
  select * into v_f from public.hr_chest_key_families f where f.key_family = v_r.family;
  if v_r.hunt_id is null or v_f.key_family is null then
    perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'run_key_family', 'hunt', new.hunt_id)); end if;
  v_intent := v_f.key_family || '_key';
  v_cap := public.hr_chest_family_cap(new.user_id, v_f.key_family);
  for v_l in select f from generate_series(coalesce(old.top_floor, new.start_floor - 1) + 1, new.top_floor) f where f % v_r.landing_every = 0 order by f loop
    select * into v_k from public.hr_chest_keys k where k.ground = new.hunt_id and k.from_landing <= v_l order by k.from_landing desc limit 1;
    continue when v_k.key_id is null;
    v_held := public.hr_chest_family_held(new.user_id, new.slot, v_f.key_family);
    if v_held >= v_cap then
      -- AT THE CAP: no key drops; the skip is journalled (no item, no value) so the hero's ledger and the end card say why.
      insert into public.player_ledger (user_id, slot, kind, intent, session_id, meta)
        values (new.user_id, new.slot, 'hunt', v_intent || '_withheld', new.session_id,
                jsonb_build_object('reason', v_intent || '_withheld', 'key', v_k.key_id, 'family', v_f.key_family, 'landing', v_l, 'held', v_held,
                                   'max', v_cap, 'session', new.session_id));
      continue;
    end if;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty) values (new.user_id, new.slot, v_k.item_id, 1)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, session_id, meta)
      values (new.user_id, new.slot, 'hunt', v_intent, v_k.item_id, 1, 0, 0, 0, 1, new.session_id,
              jsonb_build_object('reason', v_intent, 'key', v_k.key_id, 'family', v_f.key_family, 'landing', v_l, 'held', v_held + 1,
                                 'session', new.session_id));
  end loop;
  return null;
end $fn$;

-- THE BOARD'S LAST RUN (2027-04-30-tower-board.sql's triggers): the run's OWN board (hr_run_board_of), not the Tower's alone.
create or replace function public.hr_tower_board_run_start()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_mode text := public.hr_run_board_of(new.hunt_id, new.party); b public.hr_mode_board%rowtype;
begin
  -- TOWER-BOARD (2027-04-30-tower-board.sql); CATACOMBS (2027-05-06-catacombs.sql): the run's own board
  if v_mode is null then return null; end if;
  select * into b from public.hr_mode_board x where x.mode_id = v_mode and x.user_id = new.user_id and x.slot = new.slot;
  insert into public.hr_mode_board_last as l (mode_id, user_id, slot, session_id, from_score, from_at, rank, passed, passed_user, passed_slot,
                                               ended_at, updated_at)
  select v_mode, new.user_id, new.slot, new.session_id, coalesce(b.score, 0), b.reached_at, null, null, null, null, null, now()
   where exists (select 1 from public.player_state ps where ps.user_id = new.user_id and ps.slot = new.slot)
  on conflict (mode_id, user_id, slot) do update
    set session_id = excluded.session_id, from_score = excluded.from_score, from_at = excluded.from_at, rank = null, passed = null,
        passed_user = null, passed_slot = null, ended_at = null, updated_at = excluded.updated_at;
  return null;
end $fn$;

create or replace function public.hr_tower_board_run_end()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_mode text := public.hr_run_board_of(new.hunt_id, new.party); v_depth int := public.hr_mode_board_depth();
  l public.hr_mode_board_last%rowtype; me public.hr_mode_board%rowtype; v_n int := 0; v_pu uuid; v_ps int;
begin
  -- TOWER-BOARD (2027-04-30-tower-board.sql); CATACOMBS (2027-05-06-catacombs.sql): the run's own board
  if v_mode is null then return null; end if;
  select * into l from public.hr_mode_board_last x
   where x.mode_id = v_mode and x.user_id = new.user_id and x.slot = new.slot and x.session_id = new.session_id for update;
  if not found then return null; end if;
  select * into me from public.hr_mode_board x where x.mode_id = v_mode and x.user_id = new.user_id and x.slot = new.slot;
  if not found then
    update public.hr_mode_board_last set ended_at = new.ended_at, updated_at = now()
     where mode_id = v_mode and user_id = new.user_id and slot = new.slot;
    return null;
  end if;
  if l.from_score >= 1 and me.score > l.from_score then
    select count(*) into v_n from (
      select 1 from public.hr_mode_board b
       where b.mode_id = v_mode and ((-b.score), b.reached_at, b.user_id, b.slot) > ((-me.score), me.reached_at, me.user_id, me.slot)
         and ((-b.score), b.reached_at) < ((-l.from_score), l.from_at)
         and not exists (select 1 from public.hr_lb_hidden h where h.user_id = b.user_id and (h.slot is null or h.slot = b.slot))
       limit v_depth) t;
    if v_n > 0 then
      select b.user_id, b.slot into v_pu, v_ps from public.hr_mode_board b
       where b.mode_id = v_mode and ((-b.score), b.reached_at, b.user_id, b.slot) > ((-me.score), me.reached_at, me.user_id, me.slot)
         and ((-b.score), b.reached_at) < ((-l.from_score), l.from_at)
         and not exists (select 1 from public.hr_lb_hidden h where h.user_id = b.user_id and (h.slot is null or h.slot = b.slot))
       order by (-b.score), b.reached_at, b.user_id, b.slot limit 1;
    end if;
  end if;
  update public.hr_mode_board_last
     set rank = public.hr_mode_board_rank(v_mode, me.score, me.reached_at), passed = v_n, passed_user = v_pu, passed_slot = v_ps,
         ended_at = new.ended_at, updated_at = now()
   where mode_id = v_mode and user_id = new.user_id and slot = new.slot;
  return null;
end $fn$;

-- THE RISE TRIGGERS GO: tower_progress can't tell a party's run from a hero's, and the board is raised in hr_tower_write now (one writer).
drop trigger if exists hr_tower_board_rise_new on public.tower_progress;
drop trigger if exists hr_tower_board_rise on public.tower_progress;
drop function if exists public.hr_tower_board_rise();

-- ── §4 THE DOORS: ONE BODY FOR EVERY RUN GROUND, TWO CLIENT VERBS ───────────────────────────────────────────────────────
-- THE RUN DOOR (owner-only): the Tower's door body as 2027-05-05-entry-gates.sql left it, on the run ground p_hunt (its rules row: its mode, its
-- Level, its checkpoints). p_verb is the caller's verb (its rejections and the journal's reason), p_intent the key's intent (it names the whole
-- press: a wing, a landing), p_code the Level refusals' prefix (<code>_level, <code>_party_level). The caller has checked the shape and the
-- switch; this body takes the lock, the key under it, the sessions, the Level and the record under their locks, and journals once.
create or replace function public.hr_run_start(p_uid uuid, p_slot int, p_hunt text, p_landing int, p_idem uuid, p_verb text, p_intent text, p_code text)
returns jsonb language plpgsql set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := p_verb;
  v_uid uuid := p_uid; v_hunt text; v_mode text; v_verb text := p_intent; v_r jsonb; v_no jsonb; v_sid uuid; v_ver bigint; v_a jsonb;
  v_party uuid; v_cps int[]; v_pick int; v_n int;
  v_need int; v_lv int; v_who text;  -- ENTRY-GATES (2027-05-05-entry-gates.sql): the door's Level, a seat's Level, a short seat's name
begin
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql); TOWER-CHECKPOINTS (lane/c-tower-checkpoints, Tyler 2026-11-16); ENTRY-GATES (2027-05-05-entry-gates.sql);
  -- CATACOMBS (2027-05-06-catacombs.sql): the run ground is the caller's (the Tower's, or a Catacomb wing's)
  select r.hunt_id, g.mode_id into v_hunt, v_mode
    from public.hr_tower_rules r left join public.hr_ground_session_modes g on g.hunt_id = r.hunt_id where r.hunt_id = p_hunt;
  if v_hunt is null or v_mode is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  -- (the key's first read and the rate gate are the calling door's own, before it calls here: hr_assert_grant_hygiene's A9 reads them there)
  -- THE LOCK: this hero's ONE run door (the Tower's and every wing's: a hero can't race a climb against a descent), which only the doors take
  -- (hr_boss_hall_enter's move, 2027-04-20-boss-hall.sql), before every lock hr_hunt_enter_for takes below (the character, its bag, the play cap).
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
      v_r := public.hr_hunt_party_start(p_slot, v_hunt, md5(c_verb || ':party:' || p_idem::text)::uuid);
    end if;
    perform set_config('hr.tower', '', true);
    if coalesce(v_r->>'ok', 'false') <> 'true' then v_no := v_r; raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
    -- ENTRY-GATES (2027-05-05-entry-gates.sql; Tyler 2026-11-18 "A minimum level to enter the tower"): THE DOOR'S LEVEL, read under the locks the
    -- start took (every seat's character), the hero first, then every other seat in seat order. The first one under it refuses, and this
    -- subtransaction takes every session the start opened back out. No Level is the catalogue missing: refused, never let through.
    select r.min_level into v_need from public.hr_tower_rules r where r.hunt_id = v_hunt;
    if v_need is null then
      v_no := jsonb_build_object('ok', false, 'error', 'catalogue_missing'); raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
    v_lv := coalesce(public.hr_level_of(v_uid, p_slot), 1);
    if v_lv < v_need then
      v_no := jsonb_build_object('ok', false, 'error', p_code || '_level', 'need', v_need, 'have', v_lv);
      raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
    if v_party is not null then
      select public.hr_character_name(m.user_id, m.slot), l.lv into v_who, v_lv
        from public.hunt_party_members m cross join lateral (select coalesce(public.hr_level_of(m.user_id, m.slot), 1) as lv) l
       where m.party_id = v_party and not (m.user_id = v_uid and m.slot = p_slot) and l.lv < v_need
       order by m.seat limit 1;
      if found then
        v_no := jsonb_build_object('ok', false, 'error', p_code || '_party_level', 'who', v_who, 'need', v_need, 'have', v_lv);
        raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
    end if;
    v_cps := public.hr_mode_checkpoints(v_mode, public.hr_run_record(v_uid, p_slot, v_hunt));
    v_pick := coalesce(p_landing, v_cps[cardinality(v_cps)]);
    if v_cps is null or v_pick is null or v_pick <> all (v_cps) then
      v_no := jsonb_build_object('ok', false, 'error', 'bad_landing', 'checkpoints', to_jsonb(v_cps));
      raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
    -- ONE RUN A SEAT, all from the floor after the checkpoint (alone: the caller's one), each on its own session's hunt
    select count(*) into v_n from public.hunt_sessions h
     where h.ended_at is null and (case when v_party is null then h.user_id = v_uid and h.slot = p_slot
                                       else exists (select 1 from public.hunt_party_members m where m.party_id = v_party
                                                     and m.user_id = h.user_id and m.slot = h.slot) end);
    insert into public.tower_runs (session_id, user_id, slot, instance_id, hunt_id, start_floor, party, started_at)
      select h.id, h.user_id, h.slot, h.instance_id, h.hunt_id, v_pick + 1, least(greatest(v_n, 1), 4), now() from public.hunt_sessions h
       where h.ended_at is null and (case when v_party is null then h.user_id = v_uid and h.slot = p_slot
                                         else exists (select 1 from public.hunt_party_members m where m.party_id = v_party
                                                       and m.user_id = h.user_id and m.slot = h.slot) end);
    select h.id into v_sid from public.hunt_sessions h where h.user_id = v_uid and h.slot = p_slot and h.ended_at is null;
    -- ONE journal-only apply on the caller's key: a replay answers once and opens once.
    select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object('journal', jsonb_build_object('kind', 'combat', 'intent', v_verb,
             'meta', jsonb_build_object('reason', c_verb, 'hunt', v_hunt, 'landing', v_pick, 'floor', v_pick + 1, 'session', v_sid,
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

-- THE TOWER'S DOOR (CLIENT VERB, unchanged contract): the shape, the switch, then the run door on the Tower's ground.
create or replace function public.hr_tower_start(p_slot int, p_landing int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'tower_start';
  v_uid uuid := auth.uid(); v_hunt text; v_verb text := c_verb || ':' || coalesce(p_landing::text, 'best'); v_r jsonb;
begin
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql); TOWER-CHECKPOINTS; ENTRY-GATES (2027-05-05-entry-gates.sql); CATACOMBS (2027-05-06-catacombs.sql):
  -- the body is the run door's (hr_run_start), on the Tower's ground
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_landing is not null and (p_landing < 0 or p_landing > 1000000) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_landing')); end if;
  if not public.hr_feature_on('burning_tower', v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  select r.hunt_id into v_hunt from public.hr_tower_rules r where r.id;
  if v_hunt is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  return public.hr_run_start(v_uid, p_slot, v_hunt, p_landing, p_idem, c_verb, v_verb, 'tower');
end $fn$;

-- THE DESCENT'S DOOR (NEW CLIENT VERB): the shape, the switch, the wing, then the run door on that wing's ground.
create or replace function public.hr_catacomb_start(p_slot int, p_wing text, p_landing int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'catacomb_start';
  v_uid uuid := auth.uid(); v_hunt text; v_out jsonb; v_verb text; v_r jsonb;
begin
  -- CATACOMBS (2027-05-06-catacombs.sql; Tyler 2026-11-16: "a WING picked before the run", the leader picks for a party)
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_landing is not null and (p_landing < 0 or p_landing > 1000000) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_landing')); end if;
  if p_wing is null or p_wing !~ '^[a-z][a-z0-9_]{0,31}$' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_wing')); end if;
  if not public.hr_feature_on('unmarked_catacombs', v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  select r.hunt_id into v_hunt from public.hr_tower_rules r where r.wing = p_wing;
  if v_hunt is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_wing')); end if;
  v_verb := c_verb || ':' || p_wing || ':' || coalesce(p_landing::text, 'best');
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_out := public.hr_run_start(v_uid, p_slot, v_hunt, p_landing, p_idem, c_verb, v_verb, 'catacomb');
  return case when coalesce(v_out->>'ok', 'false') = 'true' then v_out || jsonb_build_object('wing', p_wing) else v_out end;
end $fn$;

-- ── §5 THE CHEST, FOR BOTH FAMILIES ────────────────────────────────────────────────────────────────────────────────────
-- THE MENU'S NUMBERS, the server's own: every family whose switch is on for the account, its week, its account-wide hold and its own warmth;
-- every key of those families with what a hit pays (a weapon key's seven, an armor key's six and its lean). The top-level dry and warmth_pm
-- stay the Tower family's (the live Tower window reads them).
create or replace function public.hr_chest_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  v_l public.chest_luck%rowtype; v_lk public.hr_chest_luck%rowtype; v_own text; v_cin jsonb; v_wk timestamptz; v_keys jsonb := '[]'::jsonb;
  v_k record; v_def int; v_fams int; v_kf jsonb; v_on text[]; v_tdry int;
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql); CATACOMBS (2027-05-06-catacombs.sql): both families, each behind its switch, each its own warmth
  select * into v_l from public.chest_luck where user_id = p_user and slot = p_slot;
  select * into v_lk from public.hr_chest_luck where id;
  select f.family into v_own from public.player_equipment e join public.hr_chest_weapon_families f on f.item_id = e.item_id
   where e.user_id = p_user and e.slot = p_slot and e.equip_slot = 'weapon';
  v_cin := public.hr_chest_held(p_user, p_slot, 'tower_cinders');
  v_wk := public.hr_chest_week_start(now());
  v_on := array(select f.key_family from public.hr_chest_key_families f where public.hr_feature_on(f.switch_id, p_user) order by f.key_family);
  v_tdry := public.hr_chest_warmth_of(p_user, p_slot, 'tower');
  select coalesce(jsonb_agg(jsonb_build_object('family', f.key_family, 'name', f.name, 'max', f.opens_per_week,
           'held_max', public.hr_chest_family_cap(p_user, f.key_family), 'per_hero', f.held_max,
           'opened', (select count(*) from public.chest_opens o where o.user_id = p_user and o.slot = p_slot and o.key_family = f.key_family
                                                                   and o.at >= v_wk)::int,
           'held', public.hr_chest_family_held(p_user, p_slot, f.key_family),
           'dry', public.hr_chest_warmth_of(p_user, p_slot, f.key_family),
           'warmth_pm', 1000 + least(public.hr_chest_warmth_of(p_user, p_slot, f.key_family)::bigint * v_lk.warmth_step_pm, v_lk.warmth_cap_pm - 1000))
           order by f.key_family), '[]'::jsonb)
    into v_kf from public.hr_chest_key_families f where f.key_family = any (v_on);
  select count(*) into v_fams from public.hr_chest_families;
  for v_k in select * from public.hr_chest_keys k where k.key_family = any (v_on) order by k.key_family, k.ground, k.from_landing loop
    v_def := coalesce((v_l.stokes ->> v_k.key_id)::int, 0);
    v_keys := v_keys || jsonb_build_array(jsonb_build_object(
      'key', v_k.key_id, 'family', v_k.key_family, 'item', v_k.item_id, 'name', v_k.name, 'from', v_k.from_landing, 'skill_plus', v_k.skill_plus,
      'gear', v_k.gear, 'ground', v_k.ground, 'helmet_pm', v_k.helmet_pm,
      'held', public.hr_chest_held(p_user, p_slot, v_k.item_id), 'base_pm', v_k.weapon_pm,
      'chance_ppm', public.hr_chest_chance_ppm(v_k.weapon_pm, public.hr_chest_warmth_of(p_user, p_slot, v_k.key_family), v_def), 'stokes_default', v_def,
      'stokes', coalesce((select jsonb_agg(jsonb_build_object('n', s.stokes, 'pm', s.pm, 'cost', s.keys * v_k.cinders) order by s.stokes)
                            from public.hr_chest_stokes s), '[]'::jsonb),
      'inside', jsonb_build_object('tower_cinders', v_k.cinders) || jsonb_build_object(v_k.salts_item, v_k.salts_qty)
                || jsonb_build_object(v_k.food_item, v_k.food_qty),
      -- READY: a weapon key holds a weapon of every family, an armor key a piece of every slot and weight (two slots x three weights)
      'ready', case when v_k.gear = 'armor' then (select count(*) from public.hr_chest_armor a where a.key_id = v_k.key_id) = 6
                    else (select count(*) from public.hr_chest_weapons w where w.key_id = v_k.key_id) = v_fams end,
      'armor', case when v_k.gear = 'armor' then coalesce((select jsonb_agg(jsonb_build_object('slot', a.slot, 'weight', a.weight, 'item', a.item_id)
                                                                  order by a.slot collate "C", array_position(array['heavy', 'medium', 'light'], a.weight))
                                                             from public.hr_chest_armor a where a.key_id = v_k.key_id), '[]'::jsonb) end,
      -- the super-rare outfits this key can find and their chance (permille), in the order the open stacks them
      'outfits', coalesce((select jsonb_agg(jsonb_build_object('outfit', o.outfit_id, 'item', o.item_id, 'pm', o.pm) order by o.outfit_id collate "C")
                             from public.hr_chest_outfits o where o.key_id = v_k.key_id), '[]'::jsonb)));
  end loop;
  return jsonb_build_object('on', public.hr_feature_on('burning_tower', p_user), 'dry', v_tdry, 'opens', coalesce(v_l.opens, 0),
    'warmth_pm', 1000 + least(v_tdry::bigint * v_lk.warmth_step_pm, v_lk.warmth_cap_pm - 1000),
    'per_call', v_lk.per_call, 'own_pm', v_lk.own_pm, 'own_family', v_own, 'week_ends', v_wk + interval '7 days', 'families', v_kf,
    'cinders', v_cin, 'keys', v_keys);
end $fn$;

-- THE OPEN, FOR BOTH FAMILIES. Everything as 2027-04-27-tower-chest.sql built it, with five changes marked CATACOMBS: the key's family's switch
-- gates it; its warmth is its family's (chest_warmth); an armor key's roll picks its slot (the key's lean) and its weight (the hero's own in
-- that slot own_pm of the time); its readiness is its six pieces; the bag's worst case counts an armor key's six.
create or replace function public.hr_chest_open(p_slot int, p_chest text, p_key text, p_count int, p_stokes int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'chest_open';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_s public.hunt_sessions%rowtype; v_settle jsonb;
  v_k public.hr_chest_keys%rowtype; v_lk public.hr_chest_luck%rowtype; v_l public.chest_luck%rowtype; v_f public.hr_chest_key_families%rowtype;
  v_fams text[]; v_own text; v_week int; v_keys jsonb; v_cin jsonb; v_cin_have bigint; v_held bigint;
  v_stacks int; v_cap int; v_new int; v_want int; v_st int; v_cost bigint; v_spent bigint := 0; v_paid bigint := 0;
  v_dry int; v_n bigint; v_chance int; v_roll jsonb; v_weapon text; v_opens jsonb := '[]'::jsonb; v_haul jsonb := '{}'::jsonb;
  v_take jsonb; v_a jsonb; v_out jsonb; i int; v_it record; v_ring bigint; v_rest bigint; v_need jsonb;
  v_oroll int; v_cum int; v_orow record; v_outfit text; v_bundle text; v_finds jsonb := '[]'::jsonb; v_find jsonb;
  v_armor text; v_aslot text; v_aweight text; v_weights text[]; v_aown text; v_kinds int;  -- CATACOMBS (2027-05-06-catacombs.sql)
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql); CATACOMBS (2027-05-06-catacombs.sql)
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if not exists (select 1 from public.hr_chests c where c.chest_id = p_chest) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_chest')); end if;
  select * into v_k from public.hr_chest_keys where key_id = p_key;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_key')); end if;
  -- CATACOMBS: the key's family (its caps and its switch); a key of no family is no key
  select * into v_f from public.hr_chest_key_families f where f.key_family = v_k.key_family;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_key')); end if;
  select * into v_lk from public.hr_chest_luck where id;
  if p_count is null or p_count < 1 or p_count > v_lk.per_call then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_count', 'max', v_lk.per_call)); end if;
  if p_stokes is not null and p_stokes <> 0 and not exists (select 1 from public.hr_chest_stokes s where s.stokes = p_stokes) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_stokes')); end if;
  -- The key names the whole press: a replay answers its own receipt, another press under it is intent_mismatch.
  v_verb := c_verb || ':' || p_chest || ':' || p_key || ':' || p_count || ':' || coalesce(p_stokes::text, 'd');
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- CATACOMBS: THE KEY'S FAMILY'S SWITCH (the Tower's keys burning_tower, the Catacombs' unmarked_catacombs)
  if not public.hr_feature_on(v_f.switch_id, v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  -- THE KEY AGAIN, UNDER THE LOCK: a second press on one key waited here and answers the first's receipt.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- THE CHEST STANDS IN TOWN: a hero out on a hunt (a climb, a descent, a training session, any hunt session) opens nothing until it is back.
  if v_s.id is not null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'in_hunt')); end if;
  v_settle := public.hr_settle_first_of(v_uid, p_slot);
  if v_settle is not null then return public.hr_note_rejection(c_verb, p_slot, v_settle); end if;
  -- THE KEY'S GEAR, ALL BUILT: a weapon key's seven weapons, an armor key's six pieces (two slots x three weights). A key whose gear is not all
  -- built is never opened (it stays held); nobody is paid a roll the table can't honour.
  if v_k.gear = 'armor' then
    v_fams := '{}'::text[];
    v_kinds := (select count(*) from public.hr_chest_armor a where a.key_id = v_k.key_id)::int;
    if v_kinds <> 6 then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'chest_not_ready', 'key', v_k.key_id)); end if;
  else
    v_fams := array(select f.family from public.hr_chest_weapons w join public.hr_chest_families f on f.family = w.family
                     where w.key_id = v_k.key_id order by f.ord);
    if cardinality(v_fams) <> (select count(*) from public.hr_chest_families) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'chest_not_ready', 'key', v_k.key_id)); end if;
    v_kinds := cardinality(v_fams);
  end if;
  -- THE ACCOUNT'S DEPOT KEY, after the hero's (Storage is read and may be taken from): hr_bank_move's and hr_materials_take's order.
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));
  insert into public.chest_luck (user_id, slot) values (v_uid, p_slot) on conflict (user_id, slot) do nothing;
  select * into v_l from public.chest_luck where user_id = v_uid and slot = p_slot for update;
  -- CATACOMBS: THE FAMILY'S WARMTH, its own row, locked with the luck row
  insert into public.chest_warmth (user_id, slot, key_family) values (v_uid, p_slot, v_k.key_family) on conflict (user_id, slot, key_family) do nothing;
  select w.dry into v_dry from public.chest_warmth w where w.user_id = v_uid and w.slot = p_slot and w.key_family = v_k.key_family for update;
  -- THE WEEK, from the append-only chest_opens: the keys of this key's FAMILY this hero used since Monday 00:00 UTC (Tyler 2026-11-16: six
  -- chests opened a family a hero a week).
  v_week := (select count(*) from public.chest_opens o where o.user_id = v_uid and o.slot = p_slot and o.key_family = v_k.key_family
                                                        and o.at >= public.hr_chest_week_start(now()))::int;
  if v_week + p_count > coalesce(v_f.opens_per_week, 0) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'week_limit', 'family', v_k.key_family,
                                                                       'used', v_week, 'limit', coalesce(v_f.opens_per_week, 0))); end if;
  -- THE KEYS: the Key Ring, then the bag, then Storage.
  v_keys := public.hr_chest_held(v_uid, p_slot, v_k.item_id);
  v_held := (v_keys->>'bag')::bigint + (v_keys->>'storage')::bigint + (v_keys->>'ring')::bigint;
  v_ring := least((v_keys->>'ring')::bigint, p_count);
  v_rest := p_count - v_ring;
  if v_held < p_count then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_key', 'have', v_held, 'need', p_count)); end if;
  -- THE BAG, BEFORE ANY ROLL: the worst case of the press must fit (every haul item the bag doesn't hold, a piece of every kind the key could
  -- roll, an outfit bundle it could find and the bag lacks, less the key's stack the press empties), so no refusal ever follows a roll and says
  -- what a key found.
  select count(*)::int into v_stacks from public.player_inventory where user_id = v_uid and slot = p_slot;
  select bank_cap into v_cap from public.player_state where user_id = v_uid and slot = p_slot;
  v_new := (select count(*) from (values ('tower_cinders'), (v_k.salts_item), (v_k.food_item)) h(item)
             where not exists (select 1 from public.player_inventory i where i.user_id = v_uid and i.slot = p_slot and i.item_id = h.item))::int
           + least(p_count, v_kinds)
           + least(p_count, (select count(*) from public.hr_chest_outfits o where o.key_id = v_k.key_id
                              and not exists (select 1 from public.player_inventory i where i.user_id = v_uid and i.slot = p_slot and i.item_id = o.item_id))::int)
           - case when (v_keys->>'bag')::bigint between 1 and v_rest then 1 else 0 end;
  if v_new > 0 and v_stacks + v_new > v_cap then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bag_full', 'stacks', v_stacks, 'cap', v_cap, 'need', v_new)); end if;
  select f.family into v_own from public.player_equipment e join public.hr_chest_weapon_families f on f.item_id = e.item_id
   where e.user_id = v_uid and e.slot = p_slot and e.equip_slot = 'weapon';
  v_cin := public.hr_chest_held(v_uid, p_slot, 'tower_cinders');
  v_cin_have := (v_cin->>'bag')::bigint + (v_cin->>'storage')::bigint;
  -- THE PRESS, all or nothing: a refused hr_apply rolls back every take, roll and row below (HR001).
  begin
    for i in 1 .. p_count loop
      -- the stokes: asked (or the saved default), then the most the Cinders cover at this key's turn
      v_want := coalesce(p_stokes, (v_l.stokes ->> v_k.key_id)::int, 0);
      v_st := least(v_want, coalesce((select max(s.stokes) from public.hr_chest_stokes s), 0));
      loop
        v_cost := case when v_st = 0 then 0 else (select s.keys from public.hr_chest_stokes s where s.stokes = v_st)::bigint * v_k.cinders end;
        exit when v_st = 0 or v_cost <= v_cin_have + v_paid - v_spent;
        v_st := v_st - 1;
      end loop;
      v_spent := v_spent + v_cost;
      v_n := v_l.opens + i;
      v_chance := public.hr_chest_chance_ppm(v_k.weapon_pm, v_dry, v_st);
      v_weapon := null; v_armor := null; v_aslot := null; v_aweight := null;
      if v_k.gear = 'armor' then
        -- CATACOMBS: AN ARMOR KEY. Its slot on its own stream under the key's lean (a Bone Key 700 permille helmets, a Waterlogged Key 300), then the
        -- chance and the weight on the weapon's own two streams (hr_chest_roll): the hero's worn weight in that slot own_pm of the time, else even
        -- over the other two; nothing worn there, even thirds.
        v_aslot := case when (((public.hr_seed(v_uid, p_slot, 'chest:' || v_n || ':slot') % 1000000) + 1000000) % 1000000) < v_k.helmet_pm::bigint * 1000
                        then 'helmet' else 'boots' end;
        select i2.armour_weight into v_aown from public.player_equipment e join public.hr_items i2 on i2.item_id = e.item_id
         where e.user_id = v_uid and e.slot = p_slot and e.equip_slot = v_aslot;
        v_weights := array(select a.weight from public.hr_chest_armor a where a.key_id = v_k.key_id and a.slot = v_aslot
                            order by array_position(array['heavy', 'medium', 'light'], a.weight));
        v_roll := public.hr_chest_roll(v_uid, p_slot, v_n, v_chance, v_aown, v_weights);
        if (v_roll->>'weapon')::boolean then
          v_aweight := v_roll->>'family';
          select a.item_id into v_armor from public.hr_chest_armor a where a.key_id = v_k.key_id and a.slot = v_aslot and a.weight = v_aweight;
          v_haul := jsonb_set(v_haul, array[v_armor], to_jsonb(coalesce((v_haul->>v_armor)::bigint, 0) + 1));
        else
          v_aslot := null;
        end if;
      else
        v_roll := public.hr_chest_roll(v_uid, p_slot, v_n, v_chance, v_own, v_fams);
        if (v_roll->>'weapon')::boolean then
          select w.item_id into v_weapon from public.hr_chest_weapons w where w.key_id = v_k.key_id and w.family = v_roll->>'family';
          v_haul := jsonb_set(v_haul, array[v_weapon], to_jsonb(coalesce((v_haul->>v_weapon)::bigint, 0) + 1));
        end if;
      end if;
      -- THE SUPER-RARE OUTFIT: one more roll on the key's own outfit stream; the key's outfit rows stacked in outfit order, each pm x 1000
      -- of the million (at most one a key). A find pays its bundle, never a piece's odds.
      v_outfit := null; v_bundle := null; v_cum := 0;
      v_oroll := public.hr_chest_outfit_roll(v_uid, p_slot, v_n);
      for v_orow in select o.outfit_id, o.item_id, o.pm from public.hr_chest_outfits o where o.key_id = v_k.key_id order by o.outfit_id collate "C" loop
        v_cum := v_cum + v_orow.pm * 1000;
        if v_oroll < v_cum then v_outfit := v_orow.outfit_id; v_bundle := v_orow.item_id; exit; end if;
      end loop;
      if v_bundle is not null then
        v_haul := jsonb_set(v_haul, array[v_bundle], to_jsonb(coalesce((v_haul->>v_bundle)::bigint, 0) + 1));
        v_finds := v_finds || jsonb_build_array(jsonb_build_object('n', v_n, 'bundle', v_bundle));
      end if;
      insert into public.chest_opens (user_id, slot, n, chest_id, key_id, key_family, stokes, cinders_spent, dry, chance_ppm, roll, family, weapon,
                                      outfit_roll, outfit, intent_id, armor, armor_slot, armor_weight)
        values (v_uid, p_slot, v_n, p_chest, v_k.key_id, v_k.key_family, v_st, v_cost, v_dry, v_chance, (v_roll->>'roll')::int,
                case when v_weapon is null then null else v_roll->>'family' end, v_weapon, v_oroll, v_outfit, p_idem, v_armor, v_aslot, v_aweight);
      v_opens := v_opens || jsonb_build_array(jsonb_build_object('n', v_n, 'stokes', v_st, 'chance_ppm', v_chance, 'weapon', v_weapon,
                                                                 'family', case when v_weapon is null then null else v_roll->>'family' end,
                                                                 'armor', v_armor, 'slot', v_aslot, 'weight', v_aweight,
                                                                 'outfit', v_outfit, 'bundle', v_bundle));
      v_dry := case when v_weapon is null and v_armor is null then v_dry + 1 else 0 end;
      v_paid := v_paid + v_k.cinders;
    end loop;
    -- THE TAKE: the keys (the Key Ring first, then the bag, then Storage), and the Cinders the stokes spent over what the press paid out (the
    -- bag first, then Storage). One ledger row an item.
    if v_ring > 0 then
      delete from public.player_key_ring where user_id = v_uid and slot = p_slot and item_id = v_k.item_id and qty <= v_ring;
      update public.player_key_ring set qty = qty - v_ring, updated_at = now() where user_id = v_uid and slot = p_slot and item_id = v_k.item_id;
    end if;
    v_need := case when v_rest > 0 then jsonb_build_object(v_k.item_id, v_rest) else '{}'::jsonb end
              || case when v_spent > v_paid then jsonb_build_object('tower_cinders', v_spent - v_paid) else '{}'::jsonb end;
    v_take := case when v_need = '{}'::jsonb then jsonb_build_object('ok', true, 'from', '{}'::jsonb)
                   else public.hr_materials_take(v_uid, p_slot, v_need, true) end;
    if coalesce(v_take->>'ok', 'false') <> 'true' then
      raise exception using errcode = 'HR001', message = (v_take || jsonb_build_object('ok', false))::text; end if;
    for v_it in select t.key as item, (coalesce((v_take #>> array['from', 'bag', t.key])::bigint, 0)) as bag,
                       (coalesce((v_take #>> array['from', 'storage', t.key])::bigint, 0)) as sto,
                       case when t.key = v_k.item_id then v_ring else 0 end as ring
                  from jsonb_each(v_need || case when v_ring > 0 then jsonb_build_object(v_k.item_id, 1) else '{}'::jsonb end) t loop
      insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, meta)
        values (v_uid, p_slot, 'hunt', v_verb, v_it.item, -(v_it.bag + v_it.sto + v_it.ring), 0,
                jsonb_build_object('reason', c_verb, 'took', jsonb_build_object('bag', v_it.bag, 'storage', v_it.sto, 'ring', v_it.ring)));
    end loop;
    -- THE HAUL: what every key always holds, the pieces, and the Cinders the press paid over what its stokes spent.
    v_haul := v_haul || jsonb_build_object(v_k.salts_item, v_k.salts_qty::bigint * p_count)
                     || jsonb_build_object(v_k.food_item, coalesce((v_haul->>v_k.food_item)::bigint, 0) + v_k.food_qty::bigint * p_count);
    if v_paid > v_spent then v_haul := v_haul || jsonb_build_object('tower_cinders', v_paid - v_spent); end if;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'items', v_haul,
             'journal', jsonb_build_object('kind', 'hunt', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', c_verb, 'chest', p_chest, 'key', v_k.key_id, 'family', v_k.key_family,
                                                                      'count', p_count, 'opens', v_opens, 'cinders_paid', v_paid, 'cinders_spent', v_spent,
                                                                      'took', coalesce(v_take->'from', '{}'::jsonb) || jsonb_build_object('ring', v_ring)))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      raise exception using errcode = 'HR001', message = (v_a || jsonb_build_object('ok', false))::text; end if;
    update public.chest_luck set opens = opens + p_count, updated_at = now() where user_id = v_uid and slot = p_slot;
    update public.chest_warmth set dry = v_dry, updated_at = now() where user_id = v_uid and slot = p_slot and key_family = v_k.key_family;
    -- THE CALL-OUT (the board's "super-rare drop moments"): each outfit found is told to every chat tab on the System channel, from the
    -- finder (hr_chat_name_authority stamps the hero's own name), with the key's number; never for a quiet hero; never counted by the
    -- rare-drop daily cap. Inside the press's transaction: a press that rolls back posts nothing.
    if jsonb_array_length(v_finds) > 0
       and not coalesce((select ps.presence_quiet from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot), false) then
      for v_find in select value from jsonb_array_elements(v_finds) loop
        insert into public.chat_messages (id, channel, from_id, from_name, from_slot, body)
          values (gen_random_uuid(), 'system', v_uid, 'Adventurer', p_slot,
                  'found the [[item:' || (v_find->>'bundle') || ']] in the Hearth Chest (' || v_k.name || ')');
      end loop;
    end if;
    v_out := jsonb_build_object('ok', true, 'version', v_a->'version', 'chest', p_chest, 'key', v_k.key_id, 'count', p_count, 'opens', v_opens,
                                'haul', v_haul || jsonb_build_object('tower_cinders', v_paid), 'cinders_spent', v_spent, 'dry', v_dry,
                                'opens_total', v_l.opens + p_count);
    -- the receipt a replay answers is this one, not hr_apply's bare one
    update public.player_intents set result = v_out where user_id = v_uid and intent_id = p_idem;
  exception when sqlstate 'HR001' then
    return public.hr_note_rejection(c_verb, p_slot, sqlerrm::jsonb);
  end;
  return v_out || jsonb_build_object('chest_section', public.hr_chest_section(v_uid, p_slot));
end $fn$;

-- ── §6 THE SECTIONS ────────────────────────────────────────────────────────────────────────────────────────────────────
-- THE TOWER'S, RESTATED WHOLE (2027-04-30-tower-board.sql's image): every read of a record or a run is the Tower's ground's now (a hero holds a
-- record per run ground). Nothing else moves.
create or replace function public.hr_tower_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  r public.hr_tower_rules%rowtype; m public.hr_session_modes%rowtype; v_best int := 0; v_rec int;
  v_run public.tower_runs%rowtype; v_last public.tower_runs%rowtype; v_run_j jsonb := null; v_last_j jsonb := null;
  v_party uuid; v_party_j jsonb := '[]'::jsonb; v_before int := null; v_field jsonb;
begin
  -- TOWER-SECTION (2027-04-28-tower-section.sql); CATACOMBS (2027-05-06-catacombs.sql): the Tower's ground's rows only
  if not public.hr_feature_on('burning_tower', p_user) then return null; end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  select * into r from public.hr_tower_rules where id;
  if not found then return null; end if;
  select s.* into m from public.hr_ground_session_modes g join public.hr_session_modes s on s.mode_id = g.mode_id where g.hunt_id = r.hunt_id;
  if not found then return null; end if;
  select p.best_floor into v_best from public.tower_progress p where p.user_id = p_user and p.slot = p_slot and p.hunt_id = r.hunt_id;
  v_best := coalesce(v_best, 0);
  -- the record the door reads its checkpoints from (a hero in a party: the lowest best of its seats)
  v_rec := public.hr_tower_record(p_user, p_slot);
  select * into v_run from public.tower_runs t where t.user_id = p_user and t.slot = p_slot and t.hunt_id = r.hunt_id and t.ended_at is null
   order by t.started_at desc limit 1;
  if v_run.session_id is not null then
    v_run_j := jsonb_build_object('session', v_run.session_id, 'start', v_run.start_floor, 'top', v_run.top_floor, 'floors', v_run.floors,
                                  'floor', public.hr_tower_floor_of(v_run.instance_id));
  end if;
  -- the newest climb STARTED that has ended (a run's end is its session's, the instant the engine stopped, which a late settle can put
  -- before a newer run's; its start is the door's own now()); its keys are the mint's own ledger rows for that session
  select * into v_last from public.tower_runs t where t.user_id = p_user and t.slot = p_slot and t.hunt_id = r.hunt_id and t.ended_at is not null
   order by t.started_at desc limit 1;
  if v_last.session_id is not null then
    -- TOWER-SECTION-A: the best before that climb, read only when that climb holds the record (it reached the hero's best floor)
    if v_last.top_floor is not null and v_last.top_floor >= v_best then
      select coalesce(max(t.top_floor), 0) into v_before from public.tower_runs t
       where t.user_id = p_user and t.slot = p_slot and t.hunt_id = r.hunt_id and t.started_at < v_last.started_at and t.top_floor is not null;
    end if;
    v_last_j := jsonb_build_object('session', v_last.session_id, 'start', v_last.start_floor, 'top', v_last.top_floor, 'floors', v_last.floors,
      'end_reason', v_last.end_reason, 'ended_at', v_last.ended_at, 'best_before', v_before,
      -- the run's own ledger rows, never older than the run (player_ledger is pruned at retain_days: tests/ledger-rollup.mjs (5))
      'keys', coalesce((select jsonb_agg(jsonb_build_object('landing', (l.meta->>'landing')::int, 'key', l.meta->>'key') order by (l.meta->>'landing')::int)
                          from public.player_ledger l
                         where l.session_id = v_last.session_id and l.user_id = p_user and l.slot = p_slot and l.intent = 'tower_key'
                           and l.at >= v_last.started_at), '[]'::jsonb),
      'withheld', (select count(*) from public.player_ledger l
                    where l.session_id = v_last.session_id and l.user_id = p_user and l.slot = p_slot and l.intent = 'tower_key_withheld'
                      and l.at >= v_last.started_at)::int,
      -- TOWER-BOARD (2027-04-30-tower-board.sql): that climb's place on the board (rank, heroes passed, the best of them), or null
      'board', public.hr_mode_board_end(m.mode_id, p_user, p_slot, v_last.session_id));
  end if;
  -- TOWER-SECTION-A: the hero's party, every OTHER seat with its own name (as the party shows it), its best floor and its worn outfit
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  if v_party is not null then
    select coalesce(jsonb_agg(jsonb_build_object('seat', pm.seat, 'name', public.hr_character_name(pm.user_id, pm.slot),
             'floor', coalesce(tp.best_floor, 0), 'outfit', po.outfit_id) order by pm.seat), '[]'::jsonb)
      into v_party_j
      from public.hunt_party_members pm
      left join public.tower_progress tp on tp.user_id = pm.user_id and tp.slot = pm.slot and tp.hunt_id = r.hunt_id
      left join public.player_outfits po on po.user_id = pm.user_id and po.slot = pm.slot
     where pm.party_id = v_party and not (pm.user_id = p_user and pm.slot = p_slot);
  end if;
  -- TOWER-BOARD (2027-04-30-tower-board.sql): the hero's place and the heroes just above and below; absent (not null) with no board row
  v_field := public.hr_mode_board_field(m.mode_id, p_user, p_slot);
  return jsonb_build_object(
    'hunt', r.hunt_id,
    'rules', jsonb_build_object('room_size', r.room_size, 'landing_every', r.landing_every, 'floor_limit_ms', r.floor_limit_ms,
                                'landing_limit_ms', r.landing_limit_ms, 'floor_top', r.floor_top),
    'pays', jsonb_build_object('xp_pm', m.xp_pm, 'coin', m.coin, 'drops', m.drops, 'bestiary', m.bestiary, 'death_loss_pm', m.death_loss_pm,
                               'blessings', m.blessings, 'stamina', m.stamina),
    'best_floor', v_best,
    'record', v_rec,
    'checkpoints', to_jsonb(public.hr_mode_checkpoints(m.mode_id, v_rec)),
    'run', v_run_j,
    'last', v_last_j,
    'party', v_party_j,
    'chest', public.hr_chest_section(p_user, p_slot))
    || case when v_field is null then '{}'::jsonb else jsonb_build_object('field', v_field) end;
end $fn$;

-- THE CATACOMBS' TAB (NEW): null while unmarked_catacombs is off for the account. Every number the tab shows, the server's own.
create or replace function public.hr_catacomb_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  m public.hr_session_modes%rowtype; w0 public.hr_tower_rules%rowtype; v_wings jsonb; v_run public.tower_runs%rowtype; v_last public.tower_runs%rowtype;
  v_run_j jsonb := null; v_last_j jsonb := null; v_party uuid; v_party_j jsonb := '[]'::jsonb; v_lv int; v_short jsonb := '[]'::jsonb;
  v_solo jsonb; v_four jsonb; v_lastwing text;
begin
  -- CATACOMBS (2027-05-06-catacombs.sql)
  if not public.hr_feature_on('unmarked_catacombs', p_user) then return null; end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  -- the wings share their rules, mode and boards (one row's are every row's: the tower catalogue's generator holds them one)
  select * into w0 from public.hr_tower_rules r where r.wing is not null order by r.wing limit 1;
  if not found then return null; end if;
  select s.* into m from public.hr_ground_session_modes g join public.hr_session_modes s on s.mode_id = g.mode_id where g.hunt_id = w0.hunt_id;
  if not found then return null; end if;
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  -- EACH WING: the hero's own best, the record its door reads (a party's lowest), the doors it may start after, and the door its last run started after
  select coalesce(jsonb_agg(jsonb_build_object('wing', r.wing, 'hunt', r.hunt_id, 'name', r.name,
           'best', coalesce((select p.best_floor from public.tower_progress p where p.user_id = p_user and p.slot = p_slot and p.hunt_id = r.hunt_id), 0),
           'record', public.hr_run_record(p_user, p_slot, r.hunt_id),
           'checkpoints', to_jsonb(public.hr_mode_checkpoints(m.mode_id, public.hr_run_record(p_user, p_slot, r.hunt_id))),
           'last_start', (select t.start_floor - 1 from public.tower_runs t where t.user_id = p_user and t.slot = p_slot and t.hunt_id = r.hunt_id
                           order by t.started_at desc limit 1))
           order by r.wing), '[]'::jsonb)
    into v_wings from public.hr_tower_rules r where r.wing is not null;
  -- the wing picked last (the tab opens on it: "remembered for each hero")
  select r.wing into v_lastwing from public.tower_runs t join public.hr_tower_rules r on r.hunt_id = t.hunt_id
   where t.user_id = p_user and t.slot = p_slot and r.wing is not null order by t.started_at desc limit 1;
  select t.* into v_run from public.tower_runs t join public.hr_tower_rules r on r.hunt_id = t.hunt_id
   where t.user_id = p_user and t.slot = p_slot and r.wing is not null and t.ended_at is null order by t.started_at desc limit 1;
  if v_run.session_id is not null then
    v_run_j := jsonb_build_object('session', v_run.session_id, 'wing', (select r.wing from public.hr_tower_rules r where r.hunt_id = v_run.hunt_id),
                                  'start', v_run.start_floor, 'top', v_run.top_floor, 'floors', v_run.floors,
                                  'room', public.hr_tower_floor_of(v_run.instance_id));
  end if;
  select t.* into v_last from public.tower_runs t join public.hr_tower_rules r on r.hunt_id = t.hunt_id
   where t.user_id = p_user and t.slot = p_slot and r.wing is not null and t.ended_at is not null order by t.started_at desc limit 1;
  if v_last.session_id is not null then
    v_last_j := jsonb_build_object('session', v_last.session_id, 'wing', (select r.wing from public.hr_tower_rules r where r.hunt_id = v_last.hunt_id),
      'start', v_last.start_floor, 'top', v_last.top_floor, 'floors', v_last.floors, 'end_reason', v_last.end_reason, 'ended_at', v_last.ended_at,
      -- the run's own key rows (the mint's), never older than the run
      'keys', coalesce((select jsonb_agg(jsonb_build_object('door', (l.meta->>'landing')::int, 'key', l.meta->>'key') order by (l.meta->>'landing')::int)
                          from public.player_ledger l
                         where l.session_id = v_last.session_id and l.user_id = p_user and l.slot = p_slot and l.intent = 'catacomb_key'
                           and l.at >= v_last.started_at), '[]'::jsonb),
      'withheld', (select count(*) from public.player_ledger l
                    where l.session_id = v_last.session_id and l.user_id = p_user and l.slot = p_slot and l.intent = 'catacomb_key_withheld'
                      and l.at >= v_last.started_at)::int,
      'board', public.hr_mode_board_end(public.hr_run_board_of(v_last.hunt_id, v_last.party), p_user, p_slot, v_last.session_id));
  end if;
  -- THE DOOR'S LEVEL (the wing row's min_level): the hero's, and every other seat under it, so the tab never offers a start the door refuses
  v_lv := coalesce(public.hr_level_of(p_user, p_slot), 1);
  if v_party is not null then
    select coalesce(jsonb_agg(jsonb_build_object('seat', pm.seat, 'name', public.hr_character_name(pm.user_id, pm.slot), 'level', l.lv) order by pm.seat), '[]'::jsonb)
      into v_short
      from public.hunt_party_members pm cross join lateral (select coalesce(public.hr_level_of(pm.user_id, pm.slot), 1) as lv) l
     where pm.party_id = v_party and not (pm.user_id = p_user and pm.slot = p_slot) and l.lv < w0.min_level;
    -- the party: every OTHER seat, its name, its best in each wing, its worn outfit
    select coalesce(jsonb_agg(jsonb_build_object('seat', pm.seat, 'name', public.hr_character_name(pm.user_id, pm.slot),
             'best', coalesce((select jsonb_object_agg(r.wing, coalesce(tp.best_floor, 0)) from public.hr_tower_rules r
                                 left join public.tower_progress tp on tp.user_id = pm.user_id and tp.slot = pm.slot and tp.hunt_id = r.hunt_id
                                where r.wing is not null), '{}'::jsonb),
             'outfit', po.outfit_id) order by pm.seat), '[]'::jsonb)
      into v_party_j
      from public.hunt_party_members pm left join public.player_outfits po on po.user_id = pm.user_id and po.slot = pm.slot
     where pm.party_id = v_party and not (pm.user_id = p_user and pm.slot = p_slot);
  end if;
  -- "CATACOMBS, DEEPEST": the hero's place on the solo board and on the party board (each absent with no row)
  v_solo := public.hr_mode_board_field(w0.board, p_user, p_slot);
  v_four := case when w0.board_party is null then null else public.hr_mode_board_field(w0.board_party, p_user, p_slot) end;
  return jsonb_build_object(
    'wings', v_wings,
    'last_wing', v_lastwing,
    'rules', jsonb_build_object('room_size', w0.room_size, 'door_every', w0.landing_every, 'room_limit_ms', w0.floor_limit_ms,
                                'door_limit_ms', w0.landing_limit_ms, 'room_top', w0.floor_top),
    'gate', jsonb_build_object('need', w0.min_level, 'level', v_lv, 'ok', v_lv >= w0.min_level and jsonb_array_length(v_short) = 0, 'short', v_short),
    'pays', jsonb_build_object('xp_pm', m.xp_pm, 'coin', m.coin, 'drops', m.drops, 'bestiary', m.bestiary, 'death_loss_pm', m.death_loss_pm,
                               'blessings', m.blessings, 'stamina', m.stamina),
    'run', v_run_j,
    'last', v_last_j,
    'party', v_party_j,
    'field', jsonb_strip_nulls(jsonb_build_object('solo', v_solo, 'party', v_four)),
    'chest', public.hr_chest_section(p_user, p_slot));
end $fn$;
-- THE ENVELOPE PAST FIFTY SECTIONS (hr_state_sections_of, RESTATED: 2027-02-10-settle-reads.sql's image, §0 pins it). It folds every section
-- into ONE jsonb_build_object, and PostgreSQL takes at most 100 arguments a call: 50 sections (2027-05-05-entry-gates.sql's `entry_gates` was
-- the fiftieth), so the 51st (this file's `catacomb`) refused EVERY envelope ("cannot pass more than 100 arguments to a function"). It now
-- builds one object a run of 50 sections, in key order, joined by `||` (the key sets are disjoint): the same calls, keys and values, one `||`
-- for every fifty sections instead of the thirty the 2027-02-10 file retired. The class is closed: a 101st section needs no change here.
create or replace function public.hr_state_sections_of(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $fn$
-- SETTLE-READS (2027-02-10-settle-reads.sql): every hr_state_sections row, folded into ONE jsonb_build_object in ONE
-- statement (the registry still decides which sections there are: architecture contracts X7). It was one EXECUTE and
-- one `||` per section, thirty of each, and each `||` decoded and re-encoded the whole growing object (~42 KB): 16 ms a
-- projection on PostgreSQL 17, a sixth of hr_state_of. The same calls, keys and values; one build.
-- CATACOMBS (2027-05-06-catacombs.sql): one jsonb_build_object a run of 50 sections (PostgreSQL's 100-argument limit), joined by `||`.
declare v_sql text; v_out jsonb;
begin
  select string_agg(c.part, ' || ' order by c.g) into v_sql
    from (select s.g, 'jsonb_build_object(' || string_agg(format('%L, public.%I($1, $2)', s.key, s.fn), ', ' order by s.key) || ')' as part
            from (select x.key, x.fn, (row_number() over (order by x.key) - 1) / 50 as g from public.hr_state_sections x) s
           group by s.g) c;
  execute 'select ' || coalesce(v_sql, '''{}''::jsonb') into v_out using p_user, p_slot;
  return v_out;
end $fn$;
revoke execute on function public.hr_state_sections_of(uuid, integer) from public;
insert into public.hr_state_sections (key, fn, note) values
  ('catacomb', 'hr_catacomb_section', '2027-05-06-catacombs.sql: the Unmarked Catacombs'' tab (each wing''s record, its doors to start after and the last one picked, the door''s Level, what a descent pays, the descent now and the last one with its keys, the party, the hero''s place on Catacombs, Deepest alone and in a party, and the Hearth Chest''s menu), while the `unmarked_catacombs` switch is on for the account')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §7 GRANTS: the helpers are the owner's; the two doors are the client's alone; the restated bodies keep theirs ─────────────
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_run_record(uuid,integer,text)', 'public.hr_tower_record(uuid,integer)', 'public.hr_run_board_of(text,integer)',
                               'public.hr_tower_check(uuid,jsonb,timestamp with time zone,timestamp with time zone)',
                               'public.hr_tower_write(uuid,integer,uuid,jsonb,bigint,timestamp with time zone)',
                               'public.hr_chest_family_held(uuid,integer,text)', 'public.hr_chest_family_cap(uuid,text)', 'public.hr_chest_warmth_of(uuid,integer,text)',
                               'public.hr_tower_key_mint()', 'public.hr_tower_board_run_start()', 'public.hr_tower_board_run_end()',
                               'public.hr_run_start(uuid,integer,text,integer,uuid,text,text,text)', 'public.hr_chest_section(uuid,integer)',
                               'public.hr_tower_section(uuid,integer)', 'public.hr_catacomb_section(uuid,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
  foreach v_sig in array array['public.hr_tower_start(integer,integer,uuid)', 'public.hr_catacomb_start(integer,text,integer,uuid)',
                               'public.hr_chest_open(integer,text,text,integer,integer,uuid)'] loop
    execute format('revoke execute on function %s from public', v_sig);
    execute format('revoke execute on function %s from anon, service_role', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end $mig$;
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_catacomb_start', 'p_slot integer, p_wing text, p_landing integer, p_idem uuid', 'authenticated',
   'added 2027-05-06 (lane/c-catacombs): RANKED (the rooms two boards read) - opens an Unmarked Catacombs descent on a wing the server lists, alone or the party leader''s for every seat, from the room after a vault door the server lists from its own record in that wing (the lowest seat''s best in a party; bad_landing otherwise); the wing row''s door Level (catacomb_level, catacomb_party_level); behind the switch unmarked_catacombs (feature_off); no value moves; pre-EA Security list')
  on conflict (proname, identity_args, grantee) do update set note = excluded.note;

-- ── §9 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────────────────────────────────────────────────
do $chk$
declare
  v_u  constant uuid := '000000c0-0000-4000-a000-0000ca7ac0b1';
  t text; v_role text; v_sig text; v jsonb; s jsonb; v_sid uuid; v_n bigint; v_scope text; v_wing text; v_hunt text; v_tower text;
begin
  -- (a) THE WALLS: the new and moved tables take no client write and keep their own-read policy only; every helper is the owner's; the two
  --     doors and the open are authenticated-only; the switch is there; grant hygiene holds.
  foreach t in array array['chest_warmth', 'tower_runs', 'tower_progress', 'chest_opens', 'chest_luck'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass) then raise exception 'catacombs §9(a): RLS off on %', t; end if;
    if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t and p.cmd <> 'SELECT') then
      raise exception 'catacombs §9(a): % carries a write policy', t; end if;
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, 'public.' || t, 'insert,update,delete,truncate') then raise exception 'catacombs §9(a): % may write %', v_role, t; end if;
    end loop;
  end loop;
  foreach v_sig in array array['public.hr_run_record(uuid,integer,text)', 'public.hr_tower_record(uuid,integer)', 'public.hr_run_board_of(text,integer)',
                               'public.hr_tower_check(uuid,jsonb,timestamp with time zone,timestamp with time zone)',
                               'public.hr_tower_write(uuid,integer,uuid,jsonb,bigint,timestamp with time zone)',
                               'public.hr_chest_family_held(uuid,integer,text)', 'public.hr_chest_family_cap(uuid,text)', 'public.hr_chest_warmth_of(uuid,integer,text)',
                               'public.hr_run_start(uuid,integer,text,integer,uuid,text,text,text)', 'public.hr_chest_section(uuid,integer)',
                               'public.hr_tower_section(uuid,integer)', 'public.hr_catacomb_section(uuid,integer)'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_sig::regprocedure, 'execute') then raise exception 'catacombs §9(a): % can execute %', v_role, v_sig; end if;
    end loop;
  end loop;
  foreach v_sig in array array['public.hr_tower_start(integer,integer,uuid)', 'public.hr_catacomb_start(integer,text,integer,uuid)',
                               'public.hr_chest_open(integer,text,text,integer,integer,uuid)'] loop
    if has_function_privilege('anon', v_sig::regprocedure, 'execute') or not has_function_privilege('authenticated', v_sig::regprocedure, 'execute') then
      raise exception 'catacombs §9(a): % is not authenticated-only', v_sig; end if;
  end loop;
  if not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_catacomb_start' and grantee = 'authenticated') then
    raise exception 'catacombs §9(a): hr_catacomb_start is not on the client baseline'; end if;
  select scope into v_scope from public.hr_feature_switches where switch_id = 'unmarked_catacombs';
  if v_scope is null then raise exception 'catacombs §9(a): no unmarked_catacombs switch'; end if;
  perform public.hr_assert_grant_hygiene(true);

  -- (b) THE SHAPE: a record per ground, every run on a ground, the warmth moved, one board writer, the mint and the run triggers in place,
  --     the two sections' rows, and the restated bodies carrying their arms.
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.tower_progress'::regclass and c.contype = 'p') <> 'PRIMARY KEY (user_id, slot, hunt_id)'
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name in ('tower_runs', 'tower_progress')
                 and column_name = 'hunt_id' and is_nullable = 'YES')
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chest_luck' and column_name = 'dry') then
    raise exception 'catacombs §9(b): the record, the runs or the warmth did not move'; end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.tower_progress'::regclass and tgname in ('hr_tower_board_rise', 'hr_tower_board_rise_new'))
     or (select count(*) from pg_trigger where tgrelid = 'public.tower_runs'::regclass and not tgisinternal
          and tgname in ('hr_tower_key_mint', 'hr_tower_board_run_start', 'hr_tower_board_run_end')) <> 3 then
    raise exception 'catacombs §9(b): the board has a second writer, or the mint or a run trigger is gone'; end if;
  if (select fn from public.hr_state_sections where key = 'catacomb') is distinct from 'hr_catacomb_section'
     or (select fn from public.hr_state_sections where key = 'tower') is distinct from 'hr_tower_section' then
    raise exception 'catacombs §9(b): a section row is missing'; end if;
  foreach t in array array['hunt_id = v_run.hunt_id', 'hr_run_board_of(v_run.hunt_id, v_run.party)', 'on conflict (user_id, slot, hunt_id)'] loop
    if strpos((select prosrc from pg_proc where oid = 'public.hr_tower_write(uuid,integer,uuid,jsonb,bigint,timestamp with time zone)'::regprocedure), t) = 0 then
      raise exception 'catacombs §9(b): hr_tower_write lost %', t; end if;
  end loop;
  -- every wing: its key rows in the catacomb family, one a metal, from its own doors; every row's ground a run ground of its family
  if exists (select 1 from public.hr_tower_rules r where r.wing is not null
              and (select count(*) from public.hr_chest_keys k where k.ground = r.hunt_id and k.key_family = r.family and k.gear = 'armor') < 4)
     or exists (select 1 from public.hr_chest_keys k left join public.hr_tower_rules r on r.hunt_id = k.ground where r.family is distinct from k.key_family) then
    raise exception 'catacombs §9(b): a wing has no key table, or a key mints off its family''s ground'; end if;

  -- (c) THE DOOR, THE MINT, THE CAP, THE CHEST: one probe hero, rolled back whole.
  select r.wing, r.hunt_id into v_wing, v_hunt from public.hr_tower_rules r where r.wing is not null order by r.wing limit 1;
  select r.hunt_id into v_tower from public.hr_tower_rules r where r.id;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Vault') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'catacombs §9 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'catacombs §9(c): hr_create_character refused: %', v; end if;
    -- the switch off (as seeded) for this account: the door refuses, the section is null, the chest lists no Catacomb family
    update public.hr_feature_switches set scope = 'off', accounts = '{}' where switch_id = 'unmarked_catacombs';
    v := public.hr_catacomb_start(0, v_wing, null, gen_random_uuid());
    if v->>'error' is distinct from 'feature_off' then raise exception 'catacombs §9(c): the door with its switch off answered %', v; end if;
    if public.hr_catacomb_section(v_u, 0) is not null then raise exception 'catacombs §9(c): the section shows with its switch off'; end if;
    if exists (select 1 from jsonb_array_elements(public.hr_chest_section(v_u, 0)->'families') f where f->>'family' = 'catacomb') then
      raise exception 'catacombs §9(c): the chest lists the Catacomb family with its switch off'; end if;
    -- on: a Level 1 hero is refused at the wing's door Level; a wing no row has is bad_wing; the section shows both wings at record 0
    update public.hr_feature_switches set scope = 'everyone' where switch_id = 'unmarked_catacombs';
    v := public.hr_catacomb_start(0, v_wing, null, gen_random_uuid());
    if v->>'error' is distinct from 'catacomb_level' or (v->>'need')::int is distinct from (select r.min_level from public.hr_tower_rules r where r.hunt_id = v_hunt) then
      raise exception 'catacombs §9(c): a Level 1 hero at the wing''s door answered %', v; end if;
    if exists (select 1 from public.hunt_sessions h where h.user_id = v_u and h.ended_at is null) then raise exception 'catacombs §9(c): a refused start left a session open'; end if;
    v := public.hr_catacomb_start(0, 'no_such_wing', null, gen_random_uuid());
    if v->>'error' is distinct from 'bad_wing' then raise exception 'catacombs §9(c): an unknown wing answered %', v; end if;
    s := public.hr_catacomb_section(v_u, 0);
    if s is null or jsonb_array_length(s->'wings') <> (select count(*) from public.hr_tower_rules where wing is not null)
       or s->'wings'->0->'checkpoints' <> '[0]'::jsonb or (s->'gate'->>'ok')::boolean is not false or s->'run' <> 'null'::jsonb then
      raise exception 'catacombs §9(c): a new hero''s section reads %', s; end if;
    -- THE ENVELOPE past fifty sections carries every one (the 100-argument limit hr_state_sections_of now folds around)
    v := public.hr_state_of(v_u, 0);
    if (select count(*) from public.hr_state_sections) <= 50 or not (v ? 'catacomb') or v->'catacomb' = 'null'::jsonb
       or exists (select 1 from public.hr_state_sections x where not (v ? x.key)) then
      raise exception 'catacombs §9(c): the envelope of % sections is missing one', (select count(*) from public.hr_state_sections); end if;
    -- THE MINT: a run on the wing whose top crosses doors 10 and 20 hands that wing's Bronze key out twice, journalled as catacomb_key
    v_sid := gen_random_uuid();
    insert into public.tower_runs (session_id, user_id, slot, instance_id, hunt_id, start_floor) values (v_sid, v_u, 0, gen_random_uuid(), v_hunt, 1);
    update public.tower_runs set top_floor = 25, floors = 25, kills = 125 where session_id = v_sid;
    if coalesce((select i.qty from public.player_inventory i join public.hr_chest_keys k on k.item_id = i.item_id
                  where i.user_id = v_u and i.slot = 0 and k.ground = v_hunt and k.from_landing = 10), 0) <> 2
       or (select count(*) from public.player_ledger l where l.user_id = v_u and l.intent = 'catacomb_key' and l.session_id = v_sid) <> 2 then
      raise exception 'catacombs §9(c): doors 10 and 20 did not mint two of the wing''s Bronze keys'; end if;
    -- THE CAP, ACROSS THE ACCOUNT: Storage holding the rest of the family's cap leaves the next door's key withheld, journalled
    insert into public.account_bank (user_id, item_id, qty) select v_u, k.item_id, public.hr_chest_family_cap(v_u, 'catacomb') - 2
      from public.hr_chest_keys k where k.ground = v_hunt and k.from_landing = 40;
    update public.tower_runs set top_floor = 40, floors = 40, kills = 200 where session_id = v_sid;
    if (select count(*) from public.player_ledger l where l.user_id = v_u and l.intent = 'catacomb_key_withheld' and l.session_id = v_sid) <> 2
       or (select count(*) from public.player_ledger l where l.user_id = v_u and l.intent = 'catacomb_key' and l.session_id = v_sid) <> 2 then
      raise exception 'catacombs §9(c): a full account was minted a key'; end if;
    delete from public.account_bank where user_id = v_u;
    -- THE CHEST: one Bronze key of the wing opens, journals its family, warms only its family; the Tower family's warmth stays where it was
    insert into public.chest_warmth (user_id, slot, key_family, dry) values (v_u, 0, 'tower', 7);
    update public.tower_runs set ended_at = now(), end_reason = 'left' where session_id = v_sid;
    v := public.hr_chest_open(0, 'great_hearth', (select k.key_id from public.hr_chest_keys k where k.ground = v_hunt and k.from_landing = 10), 1, 0, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'catacombs §9(c): a wing''s Bronze key did not open: %', v; end if;
    if (select count(*) from public.chest_opens o where o.user_id = v_u and o.key_family = 'catacomb' and o.weapon is null) <> 1
       or public.hr_chest_warmth_of(v_u, 0, 'tower') <> 7
       or public.hr_chest_warmth_of(v_u, 0, 'catacomb') <> (case when (select o.armor from public.chest_opens o where o.user_id = v_u) is null then 1 else 0 end) then
      raise exception 'catacombs §9(c): the open moved another family''s warmth or journalled a weapon: %', v; end if;
    -- THE WEEK, PER FAMILY: six Catacomb opens this week refuse the seventh (the Tower's week unread by it)
    insert into public.chest_opens (user_id, slot, n, chest_id, key_id, key_family, stokes, cinders_spent, dry, chance_ppm, roll, intent_id)
      select v_u, 0, 100 + g, 'great_hearth', k.key_id, 'catacomb', 0, 0, 0, 0, 999999, gen_random_uuid()
        from generate_series(1, 5) g, (select key_id from public.hr_chest_keys where ground = v_hunt and from_landing = 10) k;
    v := public.hr_chest_open(0, 'great_hearth', (select k.key_id from public.hr_chest_keys k where k.ground = v_hunt and k.from_landing = 10), 1, 0, gen_random_uuid());
    if v->>'error' is distinct from 'week_limit' or v->>'family' is distinct from 'catacomb' or (v->>'used')::int <> 6 then
      raise exception 'catacombs §9(c): the seventh Catacomb open answered %', v; end if;
    raise exception using errcode = 'HRC01', message = 'catacombs §9(c) complete - rolling back';
  exception when sqlstate 'HRC01' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from auth.users where id = v_u)
     or exists (select 1 from public.chest_warmth where user_id = v_u) or exists (select 1 from public.tower_runs where user_id = v_u)
     or (select scope from public.hr_feature_switches where switch_id = 'unmarked_catacombs') is distinct from v_scope then
    raise exception 'catacombs §9(c): the probe leaked a row or moved the switch'; end if;
  raise notice 'catacombs §9 OK: walls, shape, the door (switch, Level, wing), the mint and the account cap, the chest per family, the week per family';
end $chk$;
