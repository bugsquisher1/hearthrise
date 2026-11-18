#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-session-modes.mjs — GENERATE THE SESSION MODES' SERVER CATALOGUE (lane/c-tower-mode; Tyler 2026-11-14; the board's
//   "2026-11-14 The Burning Tower" §3).
//
// src/data/session-modes.js and the ground rows' `mode` (src/data/hunt-grounds.js) are the single source of what a death costs and
// what a kill pays in each mode, and which ground plays which. Postgres must know them to do what only it may: freeze the mode on a
// hunt instance at its start (hr_hunt_mode_freeze) and bound every settle by it (hr_hunt_apply_member). Emitted as hr_session_modes
// and hr_ground_session_modes. Read by supabase/migrations/2027-04-23-session-modes.sql.
//
//   Regenerate:  node tools/gen-session-modes.mjs
//   Verify:      node tools/gen-session-modes.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-session-modes.mjs --selftest  (every refusal bites)
//
// A WHOLE FILE (tools/pack/whole.mjs): it carries the base and the folded ground packs, and a pack may not name a mode at all
// (src/data/grounds/shape.js definePack), so opening a pack moves nothing here.
// hr_session_modes is UPSERTED, never deleted and re-inserted: every hunt instance's frozen mode points at it, so a mode still in
// use refuses to go, loudly. hr_ground_session_modes is rewritten whole: a row for each open ground that names a mode (today none).
// REFUSES (throws, nothing written): the table's problems (session-modes.js validateSessionModes, the load-time rule: a mode whose
// death costs less than a hunt's pays no coin, drops or Bestiary, and the default is a full hunt); a ground naming no mode row; one
// hunt with two modes. PHASE 2 (lane/c-tower-climb) lifted phase 1's last line ("a ground naming a mode that pays less than a hunt"):
// the engine pays a mode's row (src/core/hunt-rewards.js, xp-share.js) and the settle refuses a window that pays more (mode_pays, every
// XP bound at the mode's share: 2027-04-24-tower-climb.sql), so the Tower names `tower`.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { wholeViewOrRerun } from './pack/whole.mjs';
import { SESSION_MODES, DEFAULT_SESSION_MODE, validateSessionModes } from '../src/data/session-modes.js';
import { OPEN_GROUNDS, CALLED_GROUNDS, OPEN_HALL_GROUNDS, TRAINING_GROUNDS, TOWER_GROUNDS } from '../src/data/hunt-grounds.js';
import { TOWER_RULES, RUN_GROUNDS } from '../src/data/tower.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Once this file is APPLIED it is history: a changed row moves OUT_NAME to a forward file, like every generated catalogue. */
/* 2027-04-23-session-modes-catalogue is phase 1's. This forward file names the Tower's ground `tower` (lane/c-tower-climb), carries its XP share
   375 permille fitted on real climbs (lane/c-tower-chest) and every mode's checkpoint spacing (lane/c-tower-checkpoints, Tyler 2026-11-16), all
   STAGED: the chest lane's own forward file (2027-04-27-tower-chest-session-modes-catalogue) folded back in here, because the climb's start
   (2027-04-24-tower-climb.sql) reads checkpoint_every and so must come after it. */
/* 2027-04-24-tower-climb-session-modes-catalogue applied with v0.2.135 (history). lane/c-catacombs (2026-11-18) moved it here: the `catacomb` mode
   and the Unmarked Catacombs' two wings naming it. */
export const OUT_NAME = '2027-05-08-catacombs-session-modes-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);

/* Every ground a hunt can be entered on: the open grounds, the called rooms, the open keyed halls, the training grounds and the Tower. */
const SERVED = () => [OPEN_GROUNDS, CALLED_GROUNDS, OPEN_HALL_GROUNDS, TRAINING_GROUNDS, TOWER_GROUNDS].flatMap((t) => Object.values(t));

/** The catalogue's rows, or a throw naming every problem. Pure. */
export function catalogueRows({ modes = SESSION_MODES, def = DEFAULT_SESSION_MODE, grounds = SERVED() } = {}) {
  const problems = validateSessionModes(modes, def);
  const named = grounds.filter((g) => g.mode !== undefined).map((g) => ({ hunt: g.hunt, mode: g.mode }));
  for (const g of named) if (!Object.hasOwn(modes, String(g.mode))) problems.push(`${g.hunt} plays mode ${g.mode}, which is no row`);
  if (new Set(named.map((g) => g.hunt)).size !== named.length) problems.push('a hunt names a mode twice');
  /* a run's checkpoint IS a landing (a Catacomb vault door): the mode's spacing and the run's landings are one number in two rows, held equal
     here for every run ground (src/data/tower.js RUN_GROUNDS: the Tower and the Catacombs' wings) */
  for (const g of named) {
    const run = Object.hasOwn(RUN_GROUNDS, g.hunt) ? RUN_GROUNDS[g.hunt] : null;
    if (!run || !Object.hasOwn(modes, String(g.mode)) || modes[g.mode].checkpointEvery === run.landingEvery) continue;
    problems.push(`${g.hunt === TOWER_RULES.hunt ? 'the Tower' : g.hunt}'s mode ${g.mode} checkpoints every ${modes[g.mode].checkpointEvery} floors, its landings every ${run.landingEvery}`);
  }
  if (problems.length) throw new Error('gen-session-modes: ' + problems.join('; '));
  return {
    modes: Object.values(modes).map((m) => ({ ...m, isDefault: m.id === def })).sort((a, b) => (a.id < b.id ? -1 : 1)),
    grounds: named.sort((a, b) => (a.hunt < b.hunt ? -1 : 1)),
  };
}

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const bool = (b) => (b ? 'true' : 'false');

export function build(input) {
  const r = catalogueRows(input);
  const def = r.modes.find((m) => m.isDefault);
  const ids = r.modes.map((m) => lit(m.id)).join(', ');
  const groundRows = r.grounds.map((g) => `  (${lit(g.hunt)}, ${lit(g.mode)})`).join(',\n');
  return `-- ════════════════════════════════════════════════════════════════════════
-- ${OUT_NAME} — THE SESSION MODES: WHAT A DEATH COSTS AND WHAT A KILL PAYS IN EACH, AND WHICH GROUND PLAYS WHICH.
-- Generated by tools/gen-session-modes.mjs from src/data/session-modes.js and the ground rows' \`mode\` (src/data/hunt-grounds.js).
--   Any hand edit FAILS \`node tools/gen-session-modes.mjs --check\`.
-- STATUS: STAGED, NOT APPLIED (lane/c-catacombs, backend-architect, 2026-11-18; Tyler 2026-11-16: the Unmarked Catacombs' descent, "their OWN
--   game mode like the Burning Tower"). A FORWARD FILE: 2027-04-24-tower-climb-session-modes-catalogue (applied with v0.2.135) whole, plus the
--   \`catacomb\` mode (a copy of \`tower\`: no death loss, Blessings kept, no coin, drops or Bestiary, stamina drains, 375 permille XP, a checkpoint
--   every vault door) and the two wings naming it. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
--   ORDER: after 2027-05-08-catacombs-hunt-sessions-catalogue.generated.sql (the wings' grounds must be served), before
--   2027-05-08-catacombs-tower-catalogue.generated.sql and 2027-05-08-catacombs.sql (its door reads checkpoint_every). No function body; no
--   instance plays the new mode until that door opens one, behind its switch.
-- A row moves no value. hr_session_modes is upserted (an instance's frozen mode points at it: a mode in use refuses to go);
-- hr_ground_session_modes is rewritten whole: one row for each open ground that names a mode, today the Burning Tower's (every other
-- ground plays the default). THE LOAD-TIME RULE IS A CHECK HERE TOO: a mode whose death costs less than a hunt's pays no coin, drops or
-- Bestiary, a death that costs nothing uses no Blessing, and the one default is a full hunt.
-- RLS on, no policy, no client grant: only SECURITY DEFINER functions read them. ON THE EA SECURITY LIST.
-- REVERSIBLE: drop both tables after 2027-04-23-session-modes.sql's reversal (it drops the column and the FK that read them).
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.hr_session_modes (
  mode_id       text    primary key check (mode_id ~ '^[a-z0-9_]{1,32}$'),
  is_default    boolean not null default false,
  death_loss_pm int     not null check (death_loss_pm between 0 and 1000),
  blessings     boolean not null,
  xp_pm         int     not null check (xp_pm between 0 and 1000),
  coin          boolean not null,
  drops         boolean not null,
  bestiary      boolean not null,
  stamina       boolean not null,
  checkpoint_every int  not null default 0 check (checkpoint_every between 0 and 1000),
  constraint hr_session_modes_no_free_pay check (death_loss_pm = 1000 or not (coin or drops or bestiary)),
  constraint hr_session_modes_free_keeps_blessings check (death_loss_pm > 0 or not blessings),
  constraint hr_session_modes_default_hunts check (not is_default
    or (death_loss_pm = 1000 and blessings and xp_pm = 1000 and coin and drops and bestiary and stamina))
);
create unique index if not exists hr_session_modes_one_default on public.hr_session_modes (is_default) where is_default;
-- phase 1 made the table: the checkpoint spacing joins it (Tyler 2026-11-16: a run starts from any checkpoint up to its record)
alter table public.hr_session_modes add column if not exists checkpoint_every int not null default 0 check (checkpoint_every between 0 and 1000);
create table if not exists public.hr_ground_session_modes (
  hunt_id text primary key check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  mode_id text not null references public.hr_session_modes (mode_id)
);
do $$
declare t text;
begin
  foreach t in array array['hr_session_modes', 'hr_ground_session_modes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
comment on table public.hr_session_modes is '${OUT_NAME}: each session mode (src/data/session-modes.js): its share of a death''s price (permille), whether a death uses the Blessings, a kill''s XP (permille), coin, drops, Bestiary and stamina, the checkpoint spacing a run may start from (0: none); the one default. Upserted, never re-inserted: hunt_instances.session_mode points here.';
comment on table public.hr_ground_session_modes is '${OUT_NAME}: each open ground (by hunt) that names a session mode; a ground with no row plays the default. Read only when an instance starts (hr_hunt_mode_freeze).';

update public.hr_session_modes set is_default = false where is_default and mode_id <> ${lit(def.id)};
insert into public.hr_session_modes (mode_id, is_default, death_loss_pm, blessings, xp_pm, coin, drops, bestiary, stamina, checkpoint_every) values
${r.modes.map((m) => `  (${lit(m.id)}, ${bool(m.isDefault)}, ${m.deathLossPm}, ${bool(m.blessings)}, ${m.xpPm}, ${bool(m.coin)}, ${bool(m.drops)}, ${bool(m.bestiary)}, ${bool(m.stamina)}, ${m.checkpointEvery})`).join(',\n')}
on conflict (mode_id) do update set is_default = excluded.is_default, death_loss_pm = excluded.death_loss_pm, blessings = excluded.blessings,
  xp_pm = excluded.xp_pm, coin = excluded.coin, drops = excluded.drops, bestiary = excluded.bestiary, stamina = excluded.stamina,
  checkpoint_every = excluded.checkpoint_every;

delete from public.hr_ground_session_modes;
${groundRows ? `insert into public.hr_ground_session_modes (hunt_id, mode_id) values\n${groundRows};` : '-- (no open ground names a mode in the data: every ground plays the default)'}

-- A mode dropped from the data goes last, once no ground names it (an instance still frozen on it refuses, loudly).
delete from public.hr_session_modes where mode_id <> all (array[${ids}]::text[]);

-- §4 SELF-CHECK: the data's rows, one default and it a full hunt, a mode that costs less than a hunt pays nothing a hunt pays, every
-- named ground a hunt the server serves, and no client can read or write a table.
do $$
declare t text; v_role text;
begin
  if (select count(*) from public.hr_session_modes) <> ${r.modes.length} then raise exception 'session-modes-catalogue §4: hr_session_modes does not hold the ${r.modes.length} modes'; end if;
  if (select count(*) from public.hr_session_modes where is_default) <> 1
     or (select mode_id from public.hr_session_modes where is_default) is distinct from ${lit(def.id)} then
    raise exception 'session-modes-catalogue §4: the default is not the one row ${def.id}'; end if;
  if (select checkpoint_every from public.hr_session_modes where is_default) <> 0
     or (select string_agg(mode_id || '=' || checkpoint_every, ',' order by mode_id) from public.hr_session_modes) is distinct from ${lit(r.modes.map((m) => m.id + '=' + m.checkpointEvery).join(','))} then
    raise exception 'session-modes-catalogue §4: the checkpoints are not the data''s, or the default hunt has some'; end if;
  if exists (select 1 from public.hr_session_modes where death_loss_pm < 1000 and (coin or drops or bestiary)) then
    raise exception 'session-modes-catalogue §4: a mode whose death costs less than a hunt''s pays'; end if;
  if (select count(*) from public.hr_ground_session_modes) <> ${r.grounds.length} then
    raise exception 'session-modes-catalogue §4: hr_ground_session_modes does not hold the ${r.grounds.length} named grounds'; end if;
  if exists (select 1 from public.hr_ground_session_modes g where not exists (select 1 from public.hr_hunt_grounds h where h.hunt_id = g.hunt_id)) then
    raise exception 'session-modes-catalogue §4: a ground names a mode and is no ground the server serves'; end if;
  foreach t in array array['hr_session_modes', 'hr_ground_session_modes'] loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
      raise exception 'session-modes-catalogue §4: a policy opens % to a client', t; end if;
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, 'public.' || t, 'select') or has_table_privilege(v_role, 'public.' || t, 'insert,update,delete') then
        raise exception 'session-modes-catalogue §4: % holds a grant on %', v_role, t; end if;
    end loop;
  end loop;
end $$;
`;
}

function selftest() {
  let bad = 0;
  try { catalogueRows(); } catch (e) { console.error('gen-session-modes --selftest: the tree is not clean: ' + e.message); process.exit(2); }
  const bites = (name, want, input) => {
    let msg = '';
    try { catalogueRows(input); } catch (e) { msg = e.message; }
    const hit = msg.includes(want);
    console.log(`  ${hit ? 'CAUGHT' : 'MISSED'} ${name}`);
    if (!hit) bad++;
  };
  const M = SESSION_MODES;
  bites('a free death that pays coin', 'pays coin, drops or Bestiary', { modes: { ...M, tower: { ...M.tower, coin: true } } });
  bites('a free death that pays drops', 'pays coin, drops or Bestiary', { modes: { ...M, tower: { ...M.tower, drops: true } } });
  bites('a half-price death that counts the Bestiary', 'pays coin, drops or Bestiary', { modes: { ...M, tower: { ...M.tower, deathLossPm: 500, blessings: true, bestiary: true } } });
  bites('a free death that uses up the Blessings', 'uses up the Blessings', { modes: { ...M, tower: { ...M.tower, blessings: true } } });
  bites('the default set to the free-death row', 'is not a full hunt', { def: 'tower' });
  bites('a default that is no row', 'is no row', { def: 'arena' });
  bites('a loss that is no permille', 'whole permille', { modes: { ...M, tower: { ...M.tower, deathLossPm: 0.5 } } });
  bites('a ground naming no mode row', 'which is no row', { grounds: [{ hunt: 'zz_tower', mode: 'arena' }] });
  bites('one hunt naming two modes', 'names a mode twice', { grounds: [{ hunt: 'zz_tower', mode: 'hunt' }, { hunt: 'zz_tower', mode: 'hunt' }] });
  bites('the Tower checkpointing off its landings', 'checkpoints every 5 floors', { modes: { ...M, tower: { ...M.tower, checkpointEvery: 5 } } });
  bites('a hunt with checkpoints as the default', 'is not a full hunt', { modes: { ...M, hunt: { ...M.hunt, checkpointEvery: 10 } } });
  bites('a checkpoint spacing that is no whole number', 'checkpointEvery is not', { modes: { ...M, tower: { ...M.tower, checkpointEvery: -1 } } });
  /* PHASE 2: the Tower's ground names `tower`, from the data (tower.js, hunt-grounds.js TOWER_GROUNDS) */
  const served = catalogueRows().grounds;
  const tw = served.length === Object.keys(RUN_GROUNDS).length && served.every((g) => RUN_GROUNDS[g.hunt] && g.mode === (g.hunt === TOWER_RULES.hunt ? 'tower' : 'catacomb'));
  console.log(`  ${tw ? 'CAUGHT' : 'MISSED'} the Burning Tower names the tower mode, each Catacomb wing the catacomb mode, and no other ground names one`);
  if (!tw) bad++;
  /* a ground that names a mode becomes a row, one that names none does not: the rows say what the input says (a second mode that pays
     as a hunt does, for the proof: phase 1 serves no other kind) */
  const modes = { ...M, arena: { ...M.hunt, id: 'arena', stamina: false } };
  const two = catalogueRows({ modes, grounds: [{ hunt: 'zz_b', mode: 'arena' }, { hunt: 'zz_a', mode: 'hunt' }, { hunt: 'zz_c' }] }).grounds;
  const ok = two.length === 2 && two[0].hunt === 'zz_a' && two[1].mode === 'arena';
  console.log(`  ${ok ? 'CAUGHT' : 'MISSED'} named grounds become rows, in hunt order, and a ground that names none does not`);
  if (!ok) bad++;
  const sql = build({ modes, grounds: [{ hunt: 'zz_a', mode: 'arena' }] });
  const row = sql.includes("insert into public.hr_ground_session_modes (hunt_id, mode_id) values\n  ('zz_a', 'arena');")
    && sql.includes("  ('tower', false, 0, false, " + M.tower.xpPm + ", false, false, false, true, " + M.tower.checkpointEvery + ")") && sql.includes("  ('hunt', true, 1000, true, 1000, true, true, true, true, 0)");
  console.log(`  ${row ? 'CAUGHT' : 'MISSED'} the rows are the data's, one insert line each`);
  if (!row) bad++;
  if (bad) { console.error(`gen-session-modes --selftest: ${bad} refusal(s) did not bite`); process.exit(1); }
  console.log('gen-session-modes --selftest: every refusal bites');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  if (process.argv.includes('--check')) {
    const was = await readFile(OUT, 'utf8').catch(() => '');
    if (was.replace(/\r/g, '') !== build()) { console.error(`gen-session-modes --check: ${OUT_NAME} is stale; run node tools/gen-session-modes.mjs`); process.exit(1); }
    console.log('gen-session-modes --check: OK');
    return;
  }
  await writeFile(OUT, build());
  console.log('gen-session-modes: wrote ' + OUT_NAME);
}

/* GROUND PACKS: a whole file carries the base and the folded packs only (tools/pack/whole.mjs), so a new pack re-issues nothing */
if (isMain(import.meta.url) && wholeViewOrRerun(import.meta.url, OUT_NAME)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
