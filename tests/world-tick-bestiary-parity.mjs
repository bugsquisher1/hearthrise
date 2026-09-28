// ============================================================================
// tests/world-tick-bestiary-parity.mjs — THE TICK PRICES THE CHARM THE ACCRUE PATH PRICES
//
//   node tests/world-tick-bestiary-parity.mjs            green = tick delta == accrue delta
//   node tests/world-tick-bestiary-parity.mjs --mutate   two mutants, each must turn B3 red (exit 0 when both do)
//
// THE STANDING GAP (Security follow-up N4, docs/planning/SEC_WORLD_TICK_STALL_2026-09-28.md).
// The bestiary counters are NOT an envelope field — `hr_bestiary_of` is its own
// read (index.ts's accrue path in its state transaction, set-activity.js's
// collect as BESTIARY_SQL). tick-combat.js sessionFromRoster took
// `row.bestiary_kills`, which no driver set, so every combat tick window priced
// with NO charm and NO trophy while an accrue over the same window priced both.
// tick.js (4b) now makes the collect path's read, with the same 42883-only
// degrade. Template: tests/world-tick-perks-parity.mjs.
//
// THE ARM. Twelve goblin fighters, each with 20,000 server-counted goblin kills
// (`player_progress` stat rows, the only kind hr_bestiary_of reads): banesworn
// charm on the class and a nemesis trophy on the monster — drop and damage
// multipliers both. One 90 s window apiece through the SHIPPED `runTick` with
// cadence = flush, so each window is ONE engine call; the accrue path is priced
// over the IDENTICAL window from the SAME envelope, the SAME `hr_bestiary_of`
// answer and the SAME `hr_seed` label, exactly as index.ts builds it.
//   WHY TWELVE: a multiplier this small moves a single 90 s window's price only
//   ~60% of the time (measured over 200 seeds), and `hr_seed`'s secret is
//   minted per replay. Twelve independent windows make "the counters moved no
//   window at all" a ~1e-5 event, and B2 reports it by name if it ever happens.
//
// Exit: 0 green (or, under --mutate, every mutant caught) · 1 red · 2 harness.
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
import { MONSTERS } from '../src/data/monsters.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const MONSTER = 'goblin';
const KILLS = 20000;
const CHARS = 12;
const WINDOW_MS = 90000;
const U = (i) => `00000000-0000-4000-8000-0000000fb${String(i).padStart(3, '0')}`;

/* ── THE MUTANTS ── each planted in a COPY of the function directory
   (Security S-UM-1), at the same depth, and each must turn B3 red alone. */
const MUTANTS = [
  { id: 'read-dropped', what: 'tick.js stops handing `bestiary_kills` to sessionFromRoster',
    file: 'tick.js',
    from: '    bestiary_kills: bestiaryKills,\n', to: '' },
  { id: 'wrong-fold', what: 'BESTIARY_SQL counts ROWS instead of summing kills (every monster reads 1)',
    file: 'set-activity.js',
    from: 'jsonb_object_agg(monster_id, kills)', to: 'jsonb_object_agg(monster_id, 1)' },
];

async function tickEntry(mutant) {
  const here = join(ROOT, 'supabase', 'functions', 'hr-accrue');
  if (!mutant) return import(pathToFileURL(join(here, 'tick.js')).href);
  const base = await mkdtemp(join(tmpdir(), 'hr-wtbp-'));
  const dir = join(base, 'supabase', 'functions', 'hr-accrue');
  await cp(here, dir, { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  const src = await readFile(join(dir, mutant.file), 'utf8');
  if (src.split(mutant.from).length !== 2) {
    console.error(`--mutate ${mutant.id}: ${mutant.file} no longer carries exactly one `
      + `${JSON.stringify(mutant.from)} — the mutation cannot be applied, so a green run would prove nothing.`);
    process.exit(2);
  }
  await writeFile(join(dir, mutant.file), src.replace(mutant.from, mutant.to), 'utf8');
  return import(pathToFileURL(join(dir, 'tick.js')).href);
}

/** One full run against a fresh replay. Returns the red arm ids. */
async function run(mutant) {
  let db;
  try {
    ({ db } = await bootReplay({}));
  } catch (e) {
    console.error(`harness: the migration chain did not replay — ${e.message}`);
    process.exit(2);
  }
  const { runTick } = await tickEntry(mutant);
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
  console.log(`\nworld-tick-bestiary-parity${mutant ? ` [--mutate ${mutant.id}: ${mutant.what}]` : ''}`);

  const holder = (await one("select left('cron:' || coalesce(current_database(), 'db'), 64) as h")).h;
  await db.exec("update public.hr_tick_config set channels = array['combat','gather']::text[],"
    + ' enabled = true, shadow = true where id;');
  for (let i = 0; i < CHARS; i++) {
    const u = U(i);
    await db.exec(`insert into auth.users (id) values ('${u}') on conflict do nothing;`);
    await db.exec(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                     accrued_to, active_kind, active_id, active_since, auto_eat_enabled, auto_eat_food,
                     auto_eat_pct, consec_falls, combat_style, buffs)
                   values ('${u}', 0, 0, 0, 99, 99, 1, now() - interval '100 seconds',
                     'combat', '${MONSTER}', now() - interval '2 hours', true, 'cooked_trout', 70, 0,
                     '{"sword":"aggressive"}'::jsonb, '[]'::jsonb)`);
    await db.exec(`insert into public.player_skills (user_id, slot, skill_id, xp) values
                     ('${u}', 0, 'attack', 302288), ('${u}', 0, 'strength', 302288),
                     ('${u}', 0, 'defence', 150000), ('${u}', 0, 'hitpoints', 302288)`);
    await db.exec(`insert into public.player_inventory (user_id, slot, item_id, qty)
                   values ('${u}', 0, 'cooked_trout', 40)`);
    await db.exec(`insert into public.player_equipment (user_id, slot, equip_slot, item_id)
                   values ('${u}', 0, 'weapon', 'mithril_sword')`);
    await db.exec(`insert into public.player_progress (user_id, slot, kind, key, period_key, value)
                   values ('${u}', 0, 'stat', 'ev:kill_monster:${MONSTER}', '', ${KILLS})`);
    await db.exec(`insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
                   values ('${u}', 0, 'combat', true, '${holder}', now() + interval '1 hour')`);
  }

  // B0 — the fixture carries counters the server itself reports.
  const b0 = [];
  for (let i = 0; i < CHARS; i++) {
    const r = await one('select monster_id, kills from public.hr_bestiary_of($1::uuid, 0)', [U(i)]);
    b0.push(r && r.monster_id === MONSTER && Number(r.kills) === KILLS);
  }
  judge('B0', b0.every(Boolean),
    `hr_bestiary_of reports ${KILLS} ${MONSTER} kills for all ${CHARS} characters (banesworn charm, nemesis trophy)`,
    `hr_bestiary_of did not report the planted counters (${b0.filter(Boolean).length}/${CHARS}) — fix the fixture, not the assertion`);

  const valueOf = (d) => JSON.stringify({
    gold: Number((d && d.gold) || 0),
    xp: Object.fromEntries(Object.entries((d && d.xp) || {}).sort()),
    items: Object.fromEntries(Object.entries((d && d.items) || {}).sort()),
  });

  let moved = 0; let equal = 0; let missing = 0; const firstBad = [];
  const sum = { tick: { gold: 0, drops: 0 }, accrue: { gold: 0, drops: 0 } };
  const add = (t, d) => {
    t.gold += Number((d && d.gold) || 0);
    for (const q of Object.values((d && d.items) || {})) t.drops += Number(q) || 0;
  };
  for (let i = 0; i < CHARS; i++) {
    const u = U(i);
    // The envelope, the counters and the label, read BEFORE the fire (shadow moves none of them).
    const [row] = (await db.query(
      'select public.hr_state_of($1::uuid, 0) as state, public.hr_offline_cap_ms($1::uuid, 0) as cap_ms,'
      + " (public.hr_seed($1::uuid, 0, 'accrue:' || (to_jsonb(ps.accrued_to) #>> '{}')) & 4294967295)::bigint as seed"
      + ' from public.player_state ps where ps.user_id = $1::uuid and ps.slot = 0', [u])).rows;
    const env = row.state;
    /* index.ts's own shape: per-row read, folded to `{monsterId: kills}`. */
    const byId = {};
    for (const r of (await db.query('select monster_id, kills from public.hr_bestiary_of($1::uuid, 0)', [u])).rows) {
      const id = String(r.monster_id ?? ''); const n = Number(r.kills ?? 0);
      if (id && n > 0) byId[id] = n;
    }

    const fire = (await runTick({
      exec, body: { op: 'tick', roster: [{ user_id: u, slot: 0 }], cadence_ms: WINDOW_MS, flush_ms: WINDOW_MS },
    })).body;
    const shadow = await one(`select delta from public.hr_tick_shadow
                               where user_id = '${u}' order by window_to limit 1`);
    if (!shadow || fire.shadowed !== 1) { missing++; firstBad.push(`${i}: no shadow row ${JSON.stringify(fire)}`); continue; }

    const fromMs = Date.parse(env.state.accrued_to);
    const toMs = fromMs + WINDOW_MS;
    const accrueWith = (bestiaryKills) => computeAccrual({
      userId: u, slot: 0, nowMs: toMs,
      ...engineInputsFromEnvelope(env, toMs),
      accruedToMs: fromMs, capMs: Number(row.cap_ms) || 0, actionBudget: null, attended: null,
      seed: Number(row.seed), bestiaryKills, perks: null, unlockedRecipes: null,
      items: ITEMS, monsters: MONSTERS, nodes: GATHER_NODES, caller: 'accrue', callerAuthority: CALLER_AUTHORITY,
    });
    const withB = accrueWith(byId);
    const zero = accrueWith(null);
    const tickV = valueOf(shadow.delta);
    const accV = valueOf(withB.accrued ? withB.delta : null);
    const zeroV = valueOf(zero.accrued ? zero.delta : null);
    add(sum.tick, shadow.delta); add(sum.accrue, withB.accrued ? withB.delta : null);
    if (accV !== zeroV) moved++;
    if (tickV === accV) equal++;
    else if (firstBad.length < 3) {
      firstBad.push(`char ${i}: tick ${tickV} vs accrue ${accV}${tickV === zeroV ? ' (== the no-counter price)' : ''}`);
    }
  }

  judge('B1', missing === 0,
    `the shipped runTick journalled one shadow window for each of the ${CHARS} characters`,
    `${missing} character(s) produced no shadow row: ${firstBad.join(' | ')}`);
  judge('B2', moved > 0,
    `the control: the counters move the accrue path's price in ${moved}/${CHARS} windows`,
    `the counters moved NO accrue window (0/${CHARS}) — this arm would pass on the defect; widen the fixture`);
  judge('B3', missing === 0 && equal === CHARS,
    `tick delta == accrue delta in ${equal}/${CHARS} windows over the same envelope, counters and seed`,
    `THE TICK MIS-PRICES THE BESTIARY: ${equal}/${CHARS} windows equal — ${firstBad.join(' | ')}`);
  console.log(`  · parity: ${equal}/${CHARS} windows equal; the counters moved ${moved}/${CHARS}; `
    + `tick ${sum.tick.gold} gold / ${sum.tick.drops} drops vs accrue ${sum.accrue.gold} gold / ${sum.accrue.drops} drops`);
  await db.close?.();
  return problems;
}

if (MUTATE) {
  const verdicts = [];
  for (const m of MUTANTS) {
    const problems = await run(m);
    const caught = problems.length === 1 && problems[0] === 'B3';
    verdicts.push({ id: m.id, caught, problems });
  }
  const all = verdicts.every((v) => v.caught);
  for (const v of verdicts) {
    console.log(`  ${v.caught ? '✓' : '✗'} mutant ${v.id} — ${v.caught ? 'B3 red, and only B3' : `wanted exactly [B3] red, got [${v.problems.join(', ')}]`}`);
  }
  console.log(all
    ? '\nworld-tick-bestiary-parity --mutate: green — dropping the read and mis-folding it each turn B3 red.'
    : '\nworld-tick-bestiary-parity --mutate: RED — a mutant was not caught as required');
  process.exit(all ? 0 : 1);
}
const problems = await run(null);
if (problems.length) {
  console.log(`\nworld-tick-bestiary-parity: RED — ${problems.join(', ')}`);
  process.exit(1);
}
console.log('\nworld-tick-bestiary-parity: green — a tick window prices the bestiary an accrue prices.');
