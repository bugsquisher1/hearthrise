#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-tower.mjs — GENERATE THE RUN GROUNDS' SERVER CATALOGUE (THE BURNING TOWER, THE CATACOMBS' WINGS) (lane/c-tower-climb; Tyler 2026-11-14; the board's "2026-11-14 The
//   Burning Tower" §2, §4 integrity, §10 server surface).
//
// src/data/tower.js holds the climb's rules and src/core/hunt/tower.js reads the stat formula for every floor. Postgres must know both to do
// what only it may: refuse a start floor the hero has not earned (hr_tower_start), re-prove the floors a settle claims (one after another
// from its own record, no faster than the stair, each a room of kills) and bound a climb's XP by the floors it stood on. Emitted as
// hr_tower_rules (one row) and hr_tower_floors (floor 1 to floorTop: the floor's Level and the most one kill on it can pay, before its mode,
// src/core/hunt/tower.js towerXpMax). Read by supabase/migrations/2027-04-24-tower-climb.sql.
//
//   Regenerate:  node tools/gen-tower.mjs
//   Verify:      node tools/gen-tower.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-tower.mjs --selftest  (every refusal bites)
//
// The bounds read no roster: a kill's XP is the formula's at the floor's Level and the best-paying role (art tier moves a blow, never XP), so
// opening a ground pack moves nothing here. A change to the stat formula does (as it moves every ground's kill bounds): regenerate.
// REFUSES (throws, nothing written): the rules' problems (tower.js validateTower, the stair against the engine's swing included); a floor
// whose bound is under 1 or under the floor below it (the formula pays more as the floor rises, so a fall is a broken formula, not a floor).
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { TOWER_RULES, TOWER_PARTY_XP, RUN_GROUNDS, validateTower, validateRunGrounds } from '../src/data/tower.js';
import { COMBAT_BALANCE } from '../src/core/combat.js';
import { towerXpMax, towerLevelOf } from '../src/core/hunt/tower.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Once this file is APPLIED it is history: a changed row moves OUT_NAME to a forward file, like every generated catalogue.
   2027-04-24-tower-climb-catalogue.generated.sql (applied 2026-11-17 with v0.2.135) is history; 2027-05-05-entry-gates-tower-catalogue.generated.sql
   (lane/c-entry-gates, hr_tower_rules.min_level) is carried whole by the next one; lane/c-catacombs (2026-11-18) moved it here: hr_tower_rules
   becomes THE RUN GROUNDS' table, one row a ground (the Tower and the Unmarked Catacombs' two wings, src/data/tower.js RUN_GROUNDS).
   2027-05-08-catacombs-tower-catalogue.generated.sql is carried whole by the next one: MONSTERS A LITTLE HARDER (lane/d-harder-monsters, 2026-11-19; Tyler:
   "raise HP and damage done by all monsters in the game slightly") moves the stat formula's HP line x1.1 (balance-sheet.js STAT_FORMULA), which a floor's
   rows are read from, so each floor's XP bound (hr_tower_floors) rises with its monsters' HP. The run grounds' rules don't move. */
export const OUT_NAME = '2027-05-26-harder-monsters-tower-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);

/** The catalogue's rows, or a throw naming every problem. Pure. `runs` is the run table (the Tower's row is the one whose hunt is
    TOWER_RULES.hunt); the floors' bounds are read once, from the Tower's run, and every other run must read the same (one table serves all). */
export function catalogueRows({ rules = TOWER_RULES, runs = RUN_GROUNDS, partyXp = TOWER_PARTY_XP, swingMs = COMBAT_BALANCE.tickMs, xpMax = towerXpMax } = {}) {
  const problems = validateTower(rules, partyXp, swingMs).concat(validateRunGrounds(runs, []));
  const list = Object.values(runs);
  for (const r of list) for (const p of validateTower(r, partyXp, swingMs)) problems.push(r.hunt + ': ' + p);
  const tower = runs[rules.hunt];
  if (!tower) problems.push('the Tower has no run row');
  if (problems.length) throw new Error('gen-tower: ' + problems.join('; '));
  const floors = [];
  for (let f = 1; f <= tower.floorTop; f++) {
    const xp = xpMax(f, tower);
    if (!Number.isSafeInteger(xp) || xp < 1) problems.push(`floor ${f} pays ${xp}, not a whole XP of 1 or more`);
    else if (floors.length && xp < floors[floors.length - 1].xp) problems.push(`floor ${f} pays ${xp}, less than floor ${f - 1}'s ${floors[floors.length - 1].xp}`);
    floors.push({ floor: f, level: Math.min(f, tower.floorTop), xp });
  }
  /* ONE BOUND TABLE FOR EVERY RUN: a run whose top or whose bound at any room differs from the Tower's needs a hunt_id on hr_tower_floors first */
  for (const r of list) {
    if (r.hunt === tower.hunt) continue;
    if (r.floorTop !== tower.floorTop) { problems.push(`${r.hunt}: its floorTop ${r.floorTop} is not the Tower's ${tower.floorTop} (one bound table)`); continue; }
    const off = floors.find((f) => xpMax(f.floor, r) !== f.xp);
    if (off) problems.push(`${r.hunt}: room ${off.floor} pays ${xpMax(off.floor, r)}, the Tower's floor ${off.xp} (one bound table)`);
  }
  if (problems.length) throw new Error('gen-tower: ' + problems.join('; '));
  const rows = list.map((r) => ({ ...r, isTower: r.hunt === tower.hunt })).sort((a, b) => (a.hunt < b.hunt ? -1 : 1));
  return { rules: tower, rows, floors };
}

const lit = (v) => (v === null || v === undefined ? 'null' : "'" + String(v).replace(/'/g, "''") + "'");

export function build(input) {
  const { rules: R, rows, floors } = catalogueRows(input);
  const values = floors.map((f) => `  (${f.floor}, ${f.level}, ${f.xp})`).join(',\n');
  const ruleRows = rows.map((r) => `  (${r.isTower ? 'true' : 'null'}, ${lit(r.hunt)}, ${r.roomSize}, ${r.landingEvery}, ${r.floorLimitMs}, ${r.landingLimitMs}, ${r.stairMs}, ${r.floorTop}, ${r.minLevel}, ${lit(r.family)}, ${lit(r.wing)}, ${lit(r.name)}, ${lit(r.keeper)}, ${lit(r.board)}, ${lit(r.boardParty)})`).join(',\n');
  const sum = rows.map((r) => [r.hunt, r.isTower ? 't' : '', r.roomSize, r.landingEvery, r.floorLimitMs, r.landingLimitMs, r.stairMs, r.floorTop, r.minLevel, r.family, r.wing || '', r.name, r.keeper || '', r.board, r.boardParty || ''].join(':')).join('|');
  const hunts = rows.map((r) => lit(r.hunt)).join(', ');
  return `-- ════════════════════════════════════════════════════════════════════════
-- ${OUT_NAME} — THE RUN GROUNDS' RULES (THE BURNING TOWER AND THE UNMARKED CATACOMBS' WINGS) AND EACH ROOM'S BOUND.
-- Generated by tools/gen-tower.mjs from src/data/tower.js (RUN_GROUNDS) and src/core/hunt/tower.js (the stat formula at each room's Level).
--   Any hand edit FAILS \`node tools/gen-tower.mjs --check\`.
-- STATUS: STAGED, NOT APPLIED (lane/c-catacombs, backend-architect, 2026-11-18; Tyler 2026-11-16: the Unmarked Catacombs' descent, its "OWN game
--   mode like the Burning Tower", a wing picked before the run). The Coordinator applies (tools/apply-migration.mjs, one file, never inside
--   begin/commit). A FORWARD FILE: it carries 2027-05-05-entry-gates-tower-catalogue.generated.sql whole (the Tower's row, min_level) and makes
--   hr_tower_rules ONE ROW A RUN GROUND. ORDER: after 2027-05-08-catacombs-session-modes-catalogue.generated.sql,
--   before 2027-05-08-catacombs.sql (which reads the wing rows). No function body, no player row.
-- THE TABLE, MADE GENERAL WITHOUT MOVING A LIVE BODY: the primary key moves from \`id\` to \`hunt_id\`; \`id\` stays as THE BURNING TOWER'S MARK
--   (true on its row, null on every other: its unique constraint and its check keep it so), so every body that reads "the Tower's row" with
--   \`where id\` (hr_tower_section, hr_tower_board_mode, hr_entry_gates_view, hr_tower_start's image) still reads the Tower and only the Tower,
--   and the bodies that read a ground's row by hunt_id (hr_hunt_admit's one-door arm, the settle's floor_time proof) read every run ground's.
--   Before 2027-05-08-catacombs.sql nothing opens a wing (its door is that file's, behind its switch, and hr_hunt_admit already answers
--   \`tower_only\` for a run ground's hunt without its door's GUC), so this file alone moves no behaviour.
-- hr_tower_rules (${rows.length} rows): each run ground's hunt, a room's size, a landing's (a vault door's) spacing (a landing is a checkpoint:
--   hr_session_modes.checkpoint_every reads the same number), a room's and a landing's time, the stair, the highest room the formula is read
--   at, the door's Level (min_level), and NEW: family (the key family its doors mint), wing (the descent's wing id, null on the Tower), name,
--   keeper (a wing's fixed vault-door Keeper; null: the Tower picks one), board and board_party (the board ids its runs rank on, alone and in a
--   party; null board_party: the same board).
-- hr_tower_floors (${floors.length} rows, room 1 to ${R.floorTop}): the room's Level and the most ONE kill in it can pay in Level XP before its session
--   mode's share and its party share (the formula's at that Level, the best-paying role): the settle's XP bound for every run (the generator
--   refuses a run whose bound differs from the Tower's).
-- Rewritten whole (no player row points at either: tower_runs and tower_progress name a hunt, never a row). RLS on, no policy, no client grant.
-- ON THE EA SECURITY LIST with the Tower and the descent. REVERSIBLE: after 2027-05-08-catacombs.sql's reversal, delete the wing rows, move the
--   key back to \`id\` and drop the six new columns (nothing else reads them).
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.hr_tower_rules (
  id               boolean primary key default true check (id),
  hunt_id          text not null unique check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  room_size        int  not null check (room_size between 2 and 8),
  landing_every    int  not null check (landing_every > 0),
  floor_limit_ms   int  not null check (floor_limit_ms > 0),
  landing_limit_ms int  not null,
  stair_ms         int  not null check (stair_ms > 0),
  floor_top        int  not null check (floor_top > 0),
  constraint hr_tower_rules_landing_time check (landing_limit_ms >= floor_limit_ms),
  constraint hr_tower_rules_top check (floor_top % landing_every = 0)
);
create table if not exists public.hr_tower_floors (
  floor  int    primary key check (floor >= 1),
  level  int    not null check (level >= 1),
  xp_max bigint not null check (xp_max >= 1)
);
do $$
declare t text;
begin
  foreach t in array array['hr_tower_rules', 'hr_tower_floors'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
comment on table public.hr_tower_floors is '${OUT_NAME}: each room''s Level and the most one kill in it pays in Level XP before its mode and party share (src/core/hunt/tower.js towerXpMax). The settle''s XP bound for every run ground.';

-- THE DOOR'S LEVEL (lane/c-entry-gates, Tyler 2026-11-18), carried: added to the table 2027-04-24-tower-climb-catalogue.generated.sql made.
alter table public.hr_tower_rules add column if not exists min_level int;

-- ONE ROW A RUN GROUND (lane/c-catacombs): the key moves to hunt_id; \`id\` stays the Tower's mark (true there, null elsewhere, unique).
do $$
begin
  if exists (select 1 from pg_constraint c where c.conrelid = 'public.hr_tower_rules'::regclass and c.contype = 'p'
              and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (id)') then
    alter table public.hr_tower_rules drop constraint hr_tower_rules_pkey;
    alter table public.hr_tower_rules add constraint hr_tower_rules_pkey primary key (hunt_id);
  end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.hr_tower_rules'::regclass and c.conname = 'hr_tower_rules_the_tower') then
    alter table public.hr_tower_rules add constraint hr_tower_rules_the_tower unique (id);
  end if;
end $$;
alter table public.hr_tower_rules alter column id drop default;
alter table public.hr_tower_rules alter column id drop not null;
alter table public.hr_tower_rules add column if not exists family text;
alter table public.hr_tower_rules add column if not exists wing text;
alter table public.hr_tower_rules add column if not exists name text;
alter table public.hr_tower_rules add column if not exists keeper text;
alter table public.hr_tower_rules add column if not exists board text;
alter table public.hr_tower_rules add column if not exists board_party text;
comment on table public.hr_tower_rules is '${OUT_NAME}: the run grounds'' rules (src/data/tower.js RUN_GROUNDS), one row a ground: the Burning Tower (id true: its mark) and the Unmarked Catacombs'' wings (id null). Read by hr_tower_start, hr_catacomb_start, hr_hunt_admit, hr_tower_check, hr_tower_write, the key mint and the settle''s floor_time proof.';

delete from public.hr_tower_rules where hunt_id <> all (array[${hunts}]::text[]);
insert into public.hr_tower_rules (id, hunt_id, room_size, landing_every, floor_limit_ms, landing_limit_ms, stair_ms, floor_top, min_level, family, wing, name,
                                   keeper, board, board_party) values
${ruleRows}
on conflict (hunt_id) do update set id = excluded.id, room_size = excluded.room_size, landing_every = excluded.landing_every,
  floor_limit_ms = excluded.floor_limit_ms, landing_limit_ms = excluded.landing_limit_ms, stair_ms = excluded.stair_ms,
  floor_top = excluded.floor_top, min_level = excluded.min_level, family = excluded.family, wing = excluded.wing, name = excluded.name,
  keeper = excluded.keeper, board = excluded.board, board_party = excluded.board_party;
alter table public.hr_tower_rules alter column min_level set not null;
alter table public.hr_tower_rules drop constraint if exists hr_tower_rules_min_level;
alter table public.hr_tower_rules add constraint hr_tower_rules_min_level check (min_level between 1 and 999);
alter table public.hr_tower_rules alter column family set not null;
alter table public.hr_tower_rules alter column name set not null;
alter table public.hr_tower_rules alter column board set not null;
alter table public.hr_tower_rules drop constraint if exists hr_tower_rules_ids;
alter table public.hr_tower_rules add constraint hr_tower_rules_ids check (family ~ '^[a-z][a-z0-9_]{0,31}$' and board ~ '^[a-z][a-z0-9_]{0,31}$'
  and (board_party is null or (board_party ~ '^[a-z][a-z0-9_]{0,31}$' and board_party <> board))
  and (wing is null or wing ~ '^[a-z][a-z0-9_]{0,31}$') and (keeper is null or keeper ~ '^[a-z0-9_]{1,64}$'));
alter table public.hr_tower_rules drop constraint if exists hr_tower_rules_wing;
alter table public.hr_tower_rules add constraint hr_tower_rules_wing unique (wing);
comment on column public.hr_tower_rules.min_level is '${OUT_NAME}: the Level a hero, and every seat of its party, needs to start a run on this ground (src/data/tower.js; Tyler 2026-11-18 for the Tower). Read by hr_tower_start, hr_catacomb_start and the entry_gates section.';

delete from public.hr_tower_floors;
insert into public.hr_tower_floors (floor, level, xp_max) values
${values};

-- §4 SELF-CHECK: the data's rows, the Tower marked once, every room from 1 to the top once and its bound never falling, and no client can read or
-- write a table.
do $$
declare t text; v_role text; v_sum text;
begin
  select string_agg(concat_ws(':', hunt_id, case when id then 't' else '' end, room_size, landing_every, floor_limit_ms, landing_limit_ms, stair_ms,
                              floor_top, min_level, family, coalesce(wing, ''), name, coalesce(keeper, ''), board, coalesce(board_party, '')), '|' order by hunt_id collate "C")
    into v_sum from public.hr_tower_rules;
  if v_sum is distinct from ${lit(sum)} then raise exception 'tower-catalogue §4: hr_tower_rules is not src/data/tower.js RUN_GROUNDS: %', v_sum; end if;
  if (select count(*) from public.hr_tower_rules where id) <> 1 or (select hunt_id from public.hr_tower_rules where id) is distinct from '${R.hunt}'
     or exists (select 1 from public.hr_tower_rules where id is false) then
    raise exception 'tower-catalogue §4: the Burning Tower is not the one row marked id'; end if;
  if (select count(*) from public.hr_tower_floors) <> ${floors.length} or (select min(floor) from public.hr_tower_floors) <> 1
     or (select max(floor) from public.hr_tower_floors) <> ${R.floorTop} or exists (select 1 from public.hr_tower_rules where floor_top <> ${R.floorTop}) then
    raise exception 'tower-catalogue §4: hr_tower_floors is not room 1 to ${R.floorTop}, once each, for every run ground'; end if;
  if exists (select 1 from public.hr_tower_floors a join public.hr_tower_floors b on b.floor = a.floor + 1 where b.xp_max < a.xp_max) then
    raise exception 'tower-catalogue §4: a room''s bound falls under the room below it'; end if;
  if (select xp_max from public.hr_tower_floors where floor = ${R.floorTop}) <> ${floors[floors.length - 1].xp}
     or (select xp_max from public.hr_tower_floors where floor = 1) <> ${floors[0].xp} then
    raise exception 'tower-catalogue §4: the bounds are not the formula''s'; end if;
  foreach t in array array['hr_tower_rules', 'hr_tower_floors'] loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
      raise exception 'tower-catalogue §4: a policy opens % to a client', t; end if;
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, 'public.' || t, 'select') or has_table_privilege(v_role, 'public.' || t, 'insert,update,delete') then
        raise exception 'tower-catalogue §4: % holds a grant on %', v_role, t; end if;
    end loop;
  end loop;
end $$;
`;
}

function selftest() {
  let bad = 0;
  try { catalogueRows(); } catch (e) { console.error('gen-tower --selftest: the tree is not clean: ' + e.message); process.exit(2); }
  const bites = (name, want, input) => {
    let msg = '';
    try { catalogueRows(input); } catch (e) { msg = e.message; }
    const hit = msg.includes(want);
    console.log(`  ${hit ? 'CAUGHT' : 'MISSED'} ${name}`);
    if (!hit) bad++;
  };
  const R = TOWER_RULES;
  bites('a stair shorter than two engine swings', 'under two engine swings', { rules: { ...R, stairMs: 2000 } });
  bites('a room of one', 'roomSize is not 2..8', { rules: { ...R, roomSize: 1 } });
  bites('a top floor that is no landing', 'floorTop is not a landing', { rules: { ...R, floorTop: 305 } });
  bites('a landing with less time than a floor', 'less time than a floor', { rules: { ...R, landingLimitMs: 60000 } });
  bites('a four earning more a head than a hero alone', 'more a head than a hero alone', { partyXp: { ...TOWER_PARTY_XP, 4: 4400 } });
  bites('a party row that shares less as it grows', 'share no more than', { partyXp: { ...TOWER_PARTY_XP, 3: 1100 } });
  bites('a door with no Level', 'minLevel is not a whole number above 0', { rules: { ...R, minLevel: 0 } });
  bites('a door no hero could pass', 'minLevel is over 999', { rules: { ...R, minLevel: 1000 } });
  bites('a floor whose bound falls', 'less than floor', { xpMax: (f) => (f === 7 ? 1 : towerXpMax(f)) });
  bites('a floor that pays nothing', 'not a whole XP of 1 or more', { xpMax: (f) => (f === 3 ? 0 : towerXpMax(f)) });
  /* THE RUN GROUNDS (lane/c-catacombs): one bound table serves every run, and every wing is a whole row */
  const W = Object.values(RUN_GROUNDS).find((r) => r.wing !== null);
  /* the bound the wing's room 40 reads, from the formula (3061 until monsters a little harder, 2026-11-19), so a re-tuned XP dial needs no hand edit here */
  bites('a wing whose rooms pay off the Tower\'s bound', 'room 40 pays ' + (towerXpMax(40) + 1) + ', the Tower', { xpMax: (f, run) => (run && run.wing && f === 40 ? towerXpMax(f) + 1 : towerXpMax(f, run)) });
  bites('a wing with its own top room', 'is not the Tower\'s', { runs: { ...RUN_GROUNDS, [W.hunt]: { ...W, floorTop: 200 } } });
  bites('a wing with no Keeper beside its roster', 'are not all set or all null', { runs: { ...RUN_GROUNDS, [W.hunt]: { ...W, keeper: null } } });
  bites('a wing whose party board is its solo board', 'board and boardParty', { runs: { ...RUN_GROUNDS, [W.hunt]: { ...W, boardParty: W.board } } });
  /* the rows are the data's: every floor once, its Level, the formula's bound */
  const { floors } = catalogueRows();
  const ok = floors.length === R.floorTop && floors.every((f, i) => f.floor === i + 1 && f.level === towerLevelOf(f.floor) && f.xp === towerXpMax(f.floor));
  console.log(`  ${ok ? 'CAUGHT' : 'MISSED'} the rows are floor 1 to the top, each at its own Level with the formula's bound`);
  if (!ok) bad++;
  if (bad) { console.error(`gen-tower --selftest: ${bad} refusal(s) did not bite`); process.exit(1); }
  console.log('gen-tower --selftest: every refusal bites');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  if (process.argv.includes('--check')) {
    const was = await readFile(OUT, 'utf8').catch(() => '');
    if (was.replace(/\r/g, '') !== build()) { console.error(`gen-tower --check: ${OUT_NAME} is stale; run node tools/gen-tower.mjs`); process.exit(1); }
    console.log('gen-tower --check: OK');
    return;
  }
  await writeFile(OUT, build());
  console.log('gen-tower: wrote ' + OUT_NAME);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
