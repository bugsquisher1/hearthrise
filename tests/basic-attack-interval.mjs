#!/usr/bin/env node
// tests/basic-attack-interval.mjs — THE ONE BASIC-ATTACK INTERVAL.
//
// Tyler, 2026-10-14: "the universal basic-attack interval is 2.0 s for every
// player and monster basic attack (the Tibia rhythm; it replaces 2.4 s). It's a
// single data constant." Combat Design Bible v1.4.
//
//   I1  COMBAT_BALANCE.tickMs is 2000.
//   I2  a bare hero's interval IS the constant, on all three readers: core
//       swingIntervalMs, the hunt engine's deriveTickMs (hr-accrue), and a real
//       computeAccrual hunt — whose swing count over its paid time divides out
//       to exactly the constant.
//   I3  the constant is the ONLY source: moving COMBAT_BALANCE.tickMs at
//       runtime moves the engine's swings with it (nothing else holds a copy
//       the engine reads), AND no file under src/ or the edge carries a
//       numeric basic-attack literal (`tickMs: 2400`, `TICK_MS: 2000`,
//       `tickMs) || 2400`, …) outside src/core/combat.js.
//
//   node tests/basic-attack-interval.mjs            run
//   node tests/basic-attack-interval.mjs --mutate   prove each arm bites
//
// A HUNT swings at exactly this constant (accrual.js accrueHunt; the settle
// holds paid + down = swings x interval). swingIntervalMs — the client's
// display and the non-hunt readers — still scales it by gear speed, the weapon
// family and a style's speedMod; I2 measures the bare hero, where they agree.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WANT_MS = 2000;
const OWNER = 'src/core/combat.js';

const { COMBAT_BALANCE, swingIntervalMs, equipmentStats } = await import('../src/core/combat.js');
const { computeAccrual, deriveTickMs } = await import('../supabase/functions/hr-accrue/accrual.js');
const { huntAccrualInput } = await import('./hunt-fixture.mjs');
const { ITEMS } = await import('../src/data/items.js');
const { MONSTERS } = await import('../src/data/monsters.js');

/* A numeric basic-attack literal: a tick/attack-interval NAME bound to, or
   falling back to, a 3+ digit number. Recipe `ms:` and buff durations do not
   match (they are not tick/attack names). */
const LITERAL_RES = [
  /\b(tickMs|TICK_MS|attackMs|basicAttackMs|swingMs)\s*[:=]\s*\d{3,}/,
  /\b(tickMs|TICK_MS)\b[^;\n]{0,40}\|\|\s*\d{3,}/,
];
const SCAN_DIRS = ['src', 'supabase/functions/hr-accrue', 'services'];
const SKIP = (rel) => rel === OWNER;

function walk(dir, acc) {
  let names = [];
  try { names = readdirSync(join(ROOT, dir)); } catch { return acc; }
  for (const n of names) {
    const rel = `${dir}/${n}`;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) { if (n !== 'node_modules') walk(rel, acc); }
    else if (/\.(m?js|ts)$/.test(n)) acc.set(rel, readFileSync(join(ROOT, rel), 'utf8'));
  }
  return acc;
}

export function literalCopies(files) {
  const hits = [];
  for (const [rel, text] of files) {
    if (SKIP(rel)) continue;
    text.split('\n').forEach((line, i) => {
      if (LITERAL_RES.some((re) => re.test(line))) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  return hits;
}

const NOW = Date.UTC(2026, 9, 20, 9, 0, 0);
function huntSwings(hours) {
  const FROM = NOW - hours * 3600000;
  const out = computeAccrual(huntAccrualInput({
    userId: '00000000-0000-4000-8000-0000000ba5e1', slot: 0, nowMs: NOW, accruedToMs: FROM, activeSinceMs: FROM,
    activeKind: 'combat', activeId: 'mill_cellar', capMs: 12 * 3600000, seed: 7,
    hp: 99, maxHp: 99, gold: 0, skills: { attack: 200000, strength: 200000, defense: 200000, hitpoints: 200000 },
    equipment: {}, items: ITEMS, monsters: MONSTERS, fight: {},
  }, { seed: 7, pull: { size: 1, respawnMs: 0 } }));
  const h = out.hunt || {};
  const swings = Number(h.swing_to) - Number(h.swing_from);
  return { swings, paidMs: Number(h.paid_ms) + Number(h.down_ms || 0) };
}

export function check(opts) {
  const o = opts || {};
  const CB = o.CB || COMBAT_BALANCE;
  const files = o.files || walk('src', walk('supabase/functions/hr-accrue', walk('services', new Map())));
  const red = [];
  // I1
  if (CB.tickMs !== WANT_MS) red.push(`I1: COMBAT_BALANCE.tickMs is ${CB.tickMs}, the ruling is ${WANT_MS} ms`);
  // I2
  const bare = equipmentStats({}, ITEMS);
  const core = swingIntervalMs(bare, null);
  const edge = deriveTickMs({}, ITEMS, null);
  if (core !== CB.tickMs) red.push(`I2: swingIntervalMs(bare) = ${core}, not the constant ${CB.tickMs}`);
  if (edge !== CB.tickMs) red.push(`I2: hr-accrue deriveTickMs(bare) = ${edge}, not the constant ${CB.tickMs}`);
  const { swings, paidMs } = huntSwings(1);
  if (!(swings > 0) || Math.round(paidMs / swings) !== CB.tickMs) {
    red.push(`I2: a real hunt swung ${swings} times over ${paidMs} ms (${(paidMs / swings).toFixed(1)} ms each), not every ${CB.tickMs} ms`);
  }
  // I3 — runtime: the engine follows the constant and only the constant.
  const was = CB.tickMs;
  try {
    CB.tickMs = 3000;
    const moved = huntSwings(1);
    const per = Math.round(moved.paidMs / moved.swings);
    if (per !== 3000 || deriveTickMs({}, ITEMS, null) !== 3000) {
      red.push(`I3: with COMBAT_BALANCE.tickMs = 3000 the engine swung every ${per} ms — something else holds the interval`);
    }
  } finally { CB.tickMs = was; }
  // I3 — static: no second literal anywhere a reader could pick it up.
  for (const h of literalCopies(files)) red.push(`I3: a second basic-attack literal — ${h}`);
  return red;
}

function mutate() {
  const base = walk('src', walk('supabase/functions/hr-accrue', walk('services', new Map())));
  const plant = (rel, extra) => { const m = new Map(base); m.set(rel, (m.get(rel) || '') + '\n' + extra + '\n'); return m; };
  const MUTANTS = [
    ['the constant back at 2.4 s', { CB: { ...COMBAT_BALANCE, tickMs: 2400 } }, 'I1'],
    ['a dead config copy of the interval', { files: plant('src/session/config.js', '  TICK_MS: 2000,') }, 'I3'],
    ['an engine-side fallback literal', { files: plant('supabase/functions/hr-accrue/accrual.js', "const t = (ctx.tickMs) || 2400;") }, 'I3'],
    ['a client fallback literal', { files: plant('src/app/world-view.js', '  return (window.COMBAT_BALANCE && window.COMBAT_BALANCE.tickMs) || 2400;') }, 'I3'],
    ['a hard-coded client tick', { files: plant('src/app/boot.js', '    var tickMs = 2400; /* default combat tick */') }, 'I3'],
  ];
  let escaped = 0;
  for (const [name, opts, want] of MUTANTS) {
    const red = check(opts);
    const caught = red.some((r) => r.startsWith(want + ':'));
    console.log(`  ${caught ? 'killed ' : 'ESCAPED'}  ${name}${caught ? '' : ' — ' + JSON.stringify(red)}`);
    if (!caught) escaped++;
  }
  if (escaped) { console.error(`✗ basic-attack-interval --mutate: ${escaped} mutant(s) escaped`); process.exit(1); }
  console.log(`✓ basic-attack-interval --mutate: ${MUTANTS.length}/${MUTANTS.length} killed`);
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) mutate();
  else {
    const red = check();
    if (red.length) { console.error('✗ basic-attack-interval:\n  ' + red.join('\n  ')); process.exit(1); }
    console.log(`✓ basic-attack-interval: one ${WANT_MS} ms basic attack — core, edge and a real hunt agree; no second copy`);
  }
}
