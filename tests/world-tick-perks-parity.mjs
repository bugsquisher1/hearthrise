// ============================================================================
// tests/world-tick-perks-parity.mjs — THE TICK PRICES THE PERKS THE ACCRUE PATH PRICES
//
//   node tests/world-tick-perks-parity.mjs            green = tick XP == accrue XP
//   node tests/world-tick-perks-parity.mjs --mutate   the perks read removed: P3 must go red (exit 0 when it does)
//
// THE STANDING GAP. The world tick read `hr_state_of` and nothing else, and the
// permanent perk stack is NOT an envelope field — `hr_perks_of` is its own read
// (index.ts's accrue path and set-activity.js's collect each make it). So every
// tick window priced at ZERO perks: the −2.56% XP gap the shadow parity read
// carried as a known under-pay (tick-gather.js sessionFromRoster's note).
// tick.js (1b) now makes the same read, with the same 42883-only degrade.
//
// THE ARM. A Woodcutting-61 character with the Library at rung 5 (`allXP` +5%,
// a server-owned `player_progress` unlock row — the only kind hr_perks_of
// reads). The SHIPPED `runTick` fires once against the real fence with
// cadence = flush, so the window is exactly ONE engine call; the accrue path is
// then priced over the IDENTICAL window from the SAME envelope, the SAME
// `hr_perks_of` answer and the SAME `hr_seed` label, exactly as index.ts builds
// it. The shadow row's XP must equal the accrue path's, and must exceed the
// zero-perk price (the control: the perk actually moved the number).
//
// Exit: 0 green (or, under --mutate, the mutant caught) · 1 red · 2 harness.
// ============================================================================

import { readFile, writeFile, cp, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bootReplay } from './schema-replay.mjs';
import { computeAccrual, CALLER_AUTHORITY } from '../supabase/functions/hr-accrue/accrual.js';
import { engineInputsFromEnvelope } from '../supabase/functions/hr-accrue/envelope.js';
import { GATHER_NODES } from '../supabase/functions/hr-accrue/catalogue.js';
import { ITEMS } from '../src/data/items.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const U = '00000000-0000-4000-8000-00000000f930';
const NODE = 'normal_tree';
const WINDOW_MS = 90000;

/* ── THE MUTATION ── the tick stops handing the engine its perks, in a COPY of
   the function directory (Security S-UM-1), at the same depth. */
async function tickEntry() {
  const here = join(ROOT, 'supabase', 'functions', 'hr-accrue');
  if (!MUTATE) return import(pathToFileURL(join(here, 'tick.js')).href);
  const base = await mkdtemp(join(tmpdir(), 'hr-wtpp-'));
  const dir = join(base, 'supabase', 'functions', 'hr-accrue');
  await cp(here, dir, { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  const src = await readFile(join(dir, 'tick.js'), 'utf8');
  const marker = '    /* (1b)\'s read. Both channels\' `sessionFromRoster` take it off the row. */\n    perks,\n';
  if (!src.includes(marker)) {
    console.error('--mutate: tick.js no longer hands `perks` to sessionFromRoster — the mutation '
      + 'cannot be applied, so a green run would prove nothing.');
    process.exit(2);
  }
  await writeFile(join(dir, 'tick.js'), src.replace(marker, ''), 'utf8');
  return import(pathToFileURL(join(dir, 'tick.js')).href);
}

let db;
try {
  ({ db } = await bootReplay({}));
} catch (e) {
  console.error(`harness: the migration chain did not replay — ${e.message}`);
  process.exit(2);
}
const { runTick } = await tickEntry();
const exec = async (text, params) => {
  await db.exec('set role hr_engine');
  try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
};
const one = async (sql, p) => (await db.query(sql, p)).rows[0];

const problems = [];
const judge = (id, ok, okMsg, badMsg) => {
  if (ok) console.log(`  ✓ ${id} — ${okMsg}`);
  else { problems.push(id); console.log(`  ✗ ${id} — ${badMsg}`); }
};
console.log(`\nworld-tick-perks-parity${MUTATE ? ' [--mutate: perks read removed]' : ''}`);

const holder = (await one("select left('cron:' || coalesce(current_database(), 'db'), 64) as h")).h;
await db.exec("update public.hr_tick_config set channels = array['combat','gather']::text[],"
  + ' enabled = true, shadow = true where id;');
await db.exec(`insert into auth.users (id) values ('${U}') on conflict do nothing;`);
await db.exec(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                 accrued_to, active_kind, active_id, active_since)
               values ('${U}', 0, 0, 0, 10, 10, 1, now() - interval '100 seconds',
                 'gather', '${NODE}', now() - interval '2 hours')`);
await db.exec(`insert into public.player_skills (user_id, slot, skill_id, xp)
               values ('${U}', 0, 'woodcutting', 302288)`);
await db.exec(`insert into public.player_progress (user_id, slot, kind, key, period_key, value)
               values ('${U}', 0, 'unlock', 'room:library', '', 5)`);
await db.exec(`insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
               values ('${U}', 0, 'gather', true, '${holder}', now() + interval '1 hour')`);

// P0 — the fixture carries a perk the server itself reports.
const perkEnv = (await one('select public.hr_perks_of($1::uuid, 0) as p', [U])).p;
judge('P0', perkEnv && perkEnv.ok === true && Number((perkEnv.rooms || {}).library) === 5,
  `hr_perks_of reports the Library at rung ${perkEnv && perkEnv.rooms && perkEnv.rooms.library} (allXP +5%)`,
  `hr_perks_of did not report the planted Library: ${JSON.stringify(perkEnv)} — fix the fixture, not the assertion`);

// The envelope and the label, read BEFORE the fire (shadow moves neither).
const [row] = (await db.query(
  'select public.hr_state_of($1::uuid, 0) as state, public.hr_offline_cap_ms($1::uuid, 0) as cap_ms,'
  + " (public.hr_seed($1::uuid, 0, 'accrue:' || (to_jsonb(ps.accrued_to) #>> '{}')) & 4294967295)::bigint as seed"
  + ' from public.player_state ps where ps.user_id = $1::uuid and ps.slot = 0', [U])).rows;
const env = row.state;

// THE TICK — one fire, cadence = flush, so one engine call over one window.
const fire = (await runTick({
  exec, body: { op: 'tick', roster: [{ user_id: U, slot: 0 }], cadence_ms: WINDOW_MS, flush_ms: WINDOW_MS },
})).body;
const shadow = await one(`select window_from, window_to, delta from public.hr_tick_shadow
                           where user_id = '${U}' order by window_to limit 1`);
judge('P1', !!shadow && fire.shadowed === 1,
  `the shipped runTick journalled one shadow window (${shadow && new Date(shadow.window_from).toISOString()} → `
  + `${shadow && new Date(shadow.window_to).toISOString()})`,
  `no shadow row: ${JSON.stringify(fire)}`);
if (!shadow) { console.log('\nworld-tick-perks-parity: RED — nothing to compare'); process.exit(1); }

// THE ACCRUE PATH — index.ts's literal, over the same window.
const fromMs = Date.parse(env.state.accrued_to);
const toMs = fromMs + WINDOW_MS;
const accrueWith = (perks) => computeAccrual({
  userId: U, slot: 0, nowMs: toMs,
  ...engineInputsFromEnvelope(env, toMs),
  accruedToMs: fromMs, capMs: Number(row.cap_ms) || 0, actionBudget: null, attended: null,
  seed: Number(row.seed), bestiaryKills: null, perks,
  unlockedRecipes: (perks && perks.unlockedRecipes) ?? null,
  items: ITEMS, monsters: {}, nodes: GATHER_NODES, caller: 'accrue', callerAuthority: CALLER_AUTHORITY,
});
const withPerks = accrueWith(perkEnv);
const zero = accrueWith(null);
const xpOf = (d) => Number(((d && d.xp) || {}).woodcutting || 0);
const tickXp = xpOf(shadow.delta);
const accrueXp = withPerks.accrued ? xpOf(withPerks.delta) : 0;
const zeroXp = zero.accrued ? xpOf(zero.delta) : 0;

judge('P2', accrueXp > zeroXp && zeroXp > 0,
  `the control: the accrue path pays ${accrueXp} xp with the perk against ${zeroXp} without it `
  + `(+${(((accrueXp / zeroXp) - 1) * 100).toFixed(2)}%)`,
  `the perk does not move the accrue path's number (${accrueXp} vs ${zeroXp}) — this arm would pass on the defect`);
judge('P3', tickXp === accrueXp,
  `tick XP ${tickXp} == accrue XP ${accrueXp} over the same window, envelope, perks and seed`,
  `THE TICK UNDER-PAYS THE PERK: tick ${tickXp} xp vs accrue ${accrueXp} `
  + `(${(((tickXp / accrueXp) - 1) * 100).toFixed(2)}%; zero-perk price ${zeroXp})`);

/* --mutate is GREEN when the mutant is caught: P3 red, and the controls
   (P0–P2) still green so the red is the perks and not the harness. */
if (MUTATE) {
  const caught = problems.length === 1 && problems[0] === 'P3';
  console.log(caught
    ? '\nworld-tick-perks-parity --mutate: green — removing the perks read turns P3 red, and only P3.'
    : `\nworld-tick-perks-parity --mutate: RED — wanted exactly [P3] red, got [${problems.join(', ')}]`);
  process.exit(caught ? 0 : 1);
}
if (problems.length) {
  console.log(`\nworld-tick-perks-parity: RED — ${problems.join(', ')}`);
  process.exit(1);
}
console.log('\nworld-tick-perks-parity: green — a tick window prices the perks an accrue prices.');
