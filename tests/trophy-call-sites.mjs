#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/trophy-call-sites.mjs — THE SHIPPED CALL SITES QUOTE THE ONE NUMBER
// THE HUNT ENGINE PAYS, AND A TROPHY HOLDER SEES NO LADDER IN IT.
//
//   node tests/trophy-call-sites.mjs             the guard
//   node tests/trophy-call-sites.mjs --selftest  mutation proof: each defect caught
//
// ── WHERE THIS CAME FROM (Security F4/F5, SEC_BESTIARY_TROPHY_2026-09-22) ────
// The first version proved that BOTH shipped seams — src/legacy.js
// getPlayerCombatRolls (the Fight screen) and hr-accrue/accrual.js playerRolls
// (the engine) — handed `weaknessInfo` the monster id, because the trophy index
// was keyed by id and a seam that dropped it quoted 1.15 while the server paid
// 1.1845 for the same kill. The defect class is "the Fight screen and the
// server quote two drop rates for one kill" (CLAUDE.md §6: the browser never
// says one thing while the server says another).
//
// ── WHAT CHANGED, AND WHY THE GUARD STAYS (closed rebuild, lane C2) ──────────
// The charm and trophy COMBAT multipliers are deleted (src/core/combat.js
// header; demolition safety review item 9). Trophies are KEPT as claims and
// display (hr-accrue/trophy-claim.js, src/render/bestiary-trophies.js). So the
// id no longer prices anything — but the class is wider than the id: the
// client still holds the ladder (G._bestiaryTrophies, HearthriseCharms) and
// still passes it into `weaknessInfo`, and the hunt engine's ctx is the one
// that pays. This guard therefore executes the SHIPPED bytes of all three
// seams for a holder of the TOP trophy and the TOP charm rank, with a weapon
// the monster is weak to, and asserts:
//
//   C1  the Fight screen (getPlayerCombatRolls) and the loot preview
//       (getWeaknessInfo), against the REAL src/core-bridge.js, quote exactly
//       the drop and damage multipliers the hunt engine's ctx pays.
//   C2  the hunt engine's ctx (accrual.js accrueCombat's `playerRolls` /
//       `weakness`, lifted out of the shipped file and executed) quotes the
//       same numbers as the core — AWAY-1's "one engine" at the seam.
//   C3  NO LADDER IN THE NUMBER: for a stage-max trophy and a top-rank charm
//       holder the paid drop multiplier is the monster row's own `dropBonus`
//       and no seam reports a charm or trophy lift (a panel that names a lift
//       the server does not pay is the same two-numbers defect, rendered).
//   C4  NON-VACUITY: the fixture really holds the top rung and the top rank,
//       the weapon really matches (damage ≠ 1), and no roster row carries an
//       `.id` that would let `monsterIdIn` short-circuit.
//
// Credential-free, database-free. Exit: 0 green · 1 a finding · 2 harness.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';
import { TROPHY_STAGES, MAX_TROPHY_STAGE } from '../src/data/bestiary.js';
import { trophyIndex, monsterIdIn } from '../src/core/trophies.js';
import { charmIndex, killsByClass } from '../src/core/charms.js';
import { playerCombatRolls, monsterCombatRolls, weaknessInfo, equipmentStats } from '../src/core/combat.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const LEGACY = join(ROOT, 'src', 'legacy.js');
const ACCRUAL = join(ROOT, 'supabase', 'functions', 'hr-accrue', 'accrual.js');
const BRIDGE = join(ROOT, 'src', 'core-bridge.js');

const SELFTEST = process.argv.slice(2).includes('--selftest');

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  ✗ ${msg}`); } };
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
class Harness extends Error {}

/** A function's source, from its `open` anchor to the one before `close`. */
function lift(src, open, close, what) {
  const i = src.indexOf(open);
  const j = src.indexOf(close, i);
  if (i < 0 || j < 0) throw new Harness(`${what}: anchors moved (open ${i}, close ${j})`);
  if (src.indexOf(open, i + 1) >= 0) throw new Harness(`${what}: the open anchor matches more than once`);
  return src.slice(i, j);
}

/** Load a client module that carries `?v=NNN` import specifiers, under Node. */
async function loadClient(absPath) {
  const src = await readFile(absPath, 'utf8');
  const dir = dirname(absPath);
  const rewritten = src.replace(
    /(from\s+['"])(\.[^'"]*?)(\?v=\d+)?(['"])/g,
    (_m, a, spec, _v, b) => a + pathToFileURL(join(dir, spec)).href + b,
  );
  return import('data:text/javascript;base64,' + Buffer.from(rewritten).toString('base64'));
}

// ── THE FIXTURE: a top-rung trophy, a top-rank charm, a matching weapon ─────
const MON_ID = 'slime';
const ROW = MONSTERS[MON_ID];
const KILLS = Object.create(null);
KILLS[MON_ID] = TROPHY_STAGES[TROPHY_STAGES.length - 1].at;
const TROPHIES = trophyIndex(KILLS, MONSTERS);
const CHARMS = charmIndex(killsByClass(KILLS, MONSTERS));
const WEAPON = Object.keys(ITEMS).find((k) => ITEMS[k] && ITEMS[k].slot === 'weapon' && ITEMS[k].weaponType === (ROW && ROW.weaponWeak));
const EQUIPMENT = WEAPON ? { weapon: WEAPON } : {};
const EQ = equipmentStats(EQUIPMENT, ITEMS);

/* THE NUMBER THE HUNT ENGINE PAYS: combat-sim.js `resolveKill` reads its drop
   multiplier from `ctx.weakness(m, id)` and the roll from `ctx.playerRolls(m)`;
   both are `weaknessInfo(m, eq)` underneath. Never a literal. */
const PAID = weaknessInfo(ROW, EQ);
const OWN_DROP = Number(ROW && ROW.dropBonus) > 0 ? Number(ROW.dropBonus) : 1;

async function run(legacySrc, accrualSrc, C) {
  // C4 — NON-VACUITY, first: every arm below is about a holder of the ladder.
  ok(TROPHIES && TROPHIES[MON_ID] === MAX_TROPHY_STAGE,
    `C4: the fixture holds trophy stage ${TROPHIES && TROPHIES[MON_ID]}, not ${MAX_TROPHY_STAGE}`);
  ok(CHARMS && Object.values(CHARMS).some((r) => Number(r) > 0),
    `C4: the fixture holds no charm rank (${JSON.stringify(CHARMS)}) — the charm half would be vacuous`);
  ok(!!WEAPON && PAID.matched === true && PAID.damageMult > 1,
    `C4: the fixture weapon ${WEAPON} does not match ${MON_ID}'s weakness — the damage half would be vacuous`);
  const withId = Object.keys(MONSTERS).filter((k) => typeof MONSTERS[k].id === 'string' && MONSTERS[k].id);
  ok(withId.length === 0, `C4: ${withId.length} roster row(s) now carry .id (e.g. "${withId[0]}")`);
  ok(monsterIdIn(MONSTERS, ROW) === MON_ID, 'C4: monsterIdIn no longer resolves a roster row by identity');

  // ── THE CLIENT SEAMS, against the REAL core-bridge ────────────────────────
  globalThis.window = {
    G: { equipment: EQUIPMENT, skills: {}, enchant: null },
    MONSTERS,
    ITEMS,
    HearthriseTrophies: { indexForCombat: () => TROPHIES },
    HearthriseCharms: { indexForCombat: () => CHARMS },
    HearthriseCore: C,
  };
  const rollsSrc = lift(legacySrc, 'function getPlayerCombatRolls(m,eq=getEquipmentStats()){',
    '\n/* Wave 5c: armour SET bonus.', 'getPlayerCombatRolls');
  const weakSrc = lift(legacySrc, 'function getWeaknessInfo(m,eq=getEquipmentStats(),C=window.HearthriseCore,id=null){',
    '\n/* ELEMENTS v1 — CROSS-VERB COUPLING', 'getWeaknessInfo');
  // eslint-disable-next-line no-new-func
  const client = new Function('getEquipmentStats', 'getArmorSetBonus',
    `${rollsSrc}\n${weakSrc}\n; return { getPlayerCombatRolls, getWeaknessInfo };`)(() => EQ, () => null);

  const fight = client.getPlayerCombatRolls(ROW);
  const preview = client.getWeaknessInfo(ROW);

  // ── THE ENGINE SEAM, lifted out of accrual.js accrueCombat ───────────────
  const ctxSrc = lift(accrualSrc, '    playerRolls(m, o) {', '\n    fx,\n  };\n\n  // ── (4) Run the ONE span', 'hunt ctx');
  // eslint-disable-next-line no-new-func
  const engine = new Function(
    'eq', 'equipment', 'items', 'state', 'bonus', 'setBonus', 'profile', 'style',
    'playerCombatRolls', 'monsterCombatRolls', 'weaknessInfo',
    `return {\n${ctxSrc}\n};`,
  )(EQ, EQUIPMENT, ITEMS, { skills: {} }, 0, null, undefined, undefined,
    playerCombatRolls, monsterCombatRolls, weaknessInfo);
  const engRolls = engine.playerRolls(ROW);
  const engWeak = engine.weakness(ROW, MON_ID);

  // C2 — the engine's ctx quotes the core's number.
  ok(engWeak && near(engWeak.dropMult, PAID.dropMult) && near(engWeak.damageMult, PAID.damageMult),
    `C2: the hunt engine's ctx.weakness pays drop ${engWeak && engWeak.dropMult} / damage ${engWeak && engWeak.damageMult} `
    + `against the core's ${PAID.dropMult} / ${PAID.damageMult} — accrual.js accrueCombat must call weaknessInfo(m, eq)`);
  ok(engRolls && engRolls.weak && near(engRolls.weak.dropMult, engWeak && engWeak.dropMult),
    `C2: the engine rolls maxHit off drop ${engRolls && engRolls.weak && engRolls.weak.dropMult} and pays ${engWeak && engWeak.dropMult}`);

  // C1 — the Fight screen and the loot preview quote the number the engine pays.
  ok(fight && fight.weak && near(fight.weak.dropMult, engWeak.dropMult) && near(fight.weak.damageMult, engWeak.damageMult),
    `C1: the Fight screen quotes drop ${fight && fight.weak && fight.weak.dropMult} / damage ${fight && fight.weak && fight.weak.damageMult} `
    + `while the hunt engine pays ${engWeak.dropMult} / ${engWeak.damageMult} for the same kill (src/legacy.js getPlayerCombatRolls)`);
  ok(fight && engRolls && fight.maxHit === engRolls.maxHit && near(fight.accuracy, engRolls.accuracy),
    `C1: the Fight screen rolls maxHit ${fight && fight.maxHit} / accuracy ${fight && fight.accuracy} against the engine's `
    + `${engRolls && engRolls.maxHit} / ${engRolls && engRolls.accuracy}`);
  ok(preview && near(preview.dropMult, engWeak.dropMult) && near(preview.damageMult, engWeak.damageMult),
    `C1: the loot preview (getWeaknessInfo) quotes drop ${preview && preview.dropMult} / damage ${preview && preview.damageMult} `
    + `while the hunt engine pays ${engWeak.dropMult} / ${engWeak.damageMult}`);

  // C3 — no ladder in the number, on any seam.
  for (const [who, w] of [['the core', PAID], ['the engine', engWeak], ['the Fight screen', fight && fight.weak], ['the loot preview', preview]]) {
    ok(w && near(w.dropMult, OWN_DROP),
      `C3: ${who} quotes drop ${w && w.dropMult} for a stage-${MAX_TROPHY_STAGE} trophy holder; the row's own is ${OWN_DROP} — a ladder prices a fight again`);
    ok(w && !(Number(w.charmDropMult) > 1) && !(Number(w.trophyStage) > 0) && !(Number(w.trophyDropMult) > 1),
      `C3: ${who} reports a ladder lift (charm ${w && w.charmDropMult}, trophy stage ${w && w.trophyStage}) the hunt engine does not pay — the panel would name it`);
  }
  return failed;
}

// ── MUTATIONS ───────────────────────────────────────────────────────────────
const TROPHY_LIFT = '(1 + 0.05 * Number(((C.trophies && C.trophies()) || {})[C.monsterId(m)] || 0))';
const MUTATIONS = {
  client_prices_the_trophy: {
    what: 'the Fight screen prices the held trophy stage into its drop rate again (the F4 two-numbers defect, client side)',
    file: 'legacy',
    find: '  return C.combat.playerCombatRolls(m, { ...C.combatCtx(eq, _set), monsterId: C.monsterId(m) });',
    repl: `  const _r = C.combat.playerCombatRolls(m, { ...C.combatCtx(eq, _set), monsterId: C.monsterId(m) }); return { ..._r, weak: { ..._r.weak, dropMult: _r.weak.dropMult * ${TROPHY_LIFT} } };`,
    expect: 'C1',
  },
  preview_reports_a_charm: {
    what: 'the loot preview reports a charm lift the engine does not pay (combat-render.js would name it on the panel)',
    file: 'legacy',
    find: '  return C.combat.weaknessInfo(m,eq,',
    repl: '  return ((w) => ({ ...w, charmDropMult: 1.1 }))(C.combat.weaknessInfo(m,eq,',
    tail: true,
    expect: 'C3',
  },
  engine_prices_the_trophy: {
    what: 'accrual.js prices a ladder into ctx.weakness again — the server pays a number the Fight screen does not quote',
    file: 'accrual',
    find: '    weakness(m) { return weaknessInfo(m, eq); },',
    repl: '    weakness(m) { const w = weaknessInfo(m, eq); return { ...w, dropMult: w.dropMult * 1.1845 }; },',
    expect: 'C2',
  },
  engine_drops_the_loadout: {
    what: 'accrual.js prices the weakness without the equipped loadout — the matched weapon pays no damage on the server',
    file: 'accrual',
    find: '    weakness(m) { return weaknessInfo(m, eq); },',
    repl: '    weakness(m) { return weaknessInfo(m, null); },',
    expect: 'C2',
  },
  control_comment_only: {
    what: 'NEGATIVE CONTROL — an inert comment at the client call must move nothing',
    file: 'legacy',
    find: '  const _set=(typeof getArmorSetBonus===\'function\')?getArmorSetBonus():null;\n  return C.combat.playerCombatRolls(',
    repl: '  const _set=(typeof getArmorSetBonus===\'function\')?getArmorSetBonus():null; /* control */\n  return C.combat.playerCombatRolls(',
    expect: null,
  },
};

function plant(base, m) {
  const hits = base.split(m.find).length - 1;
  if (hits !== 1) throw new Harness(`anchor for a mutation matched ${hits} times (need 1): ${m.find.slice(0, 80)}`);
  if (!m.tail) return base.replace(m.find, () => m.repl);
  /* A wrapping mutation: close the extra paren at the end of that statement. */
  const i = base.indexOf(m.find);
  const end = base.indexOf(';\n', i);
  return base.slice(0, i) + m.repl + base.slice(i + m.find.length, end) + ')' + base.slice(end);
}

const main = async () => {
  const legacySrc = (await readFile(LEGACY, 'utf8')).replace(/\r\n/g, '\n');
  const accrualSrc = (await readFile(ACCRUAL, 'utf8')).replace(/\r\n/g, '\n');

  globalThis.window = { G: {}, MONSTERS, ITEMS };
  await loadClient(BRIDGE);                     // publishes window.HearthriseCore
  const C = globalThis.window.HearthriseCore;
  if (!C || typeof C.combatCtx !== 'function' || typeof C.monsterId !== 'function') {
    throw new Harness('core-bridge did not publish combatCtx/monsterId');
  }

  if (!SELFTEST) {
    failed = await run(legacySrc, accrualSrc, C);
    if (failed) {
      console.error(`\ntrophy-call-sites: RED — ${failed} finding(s).`);
      process.exit(1);
    }
    console.log(`trophy-call-sites: green — for a stage-${MAX_TROPHY_STAGE} trophy and top-charm holder with a matched `
      + `${WEAPON}, the Fight screen, the loot preview and the hunt engine quote ONE drop rate (x${PAID.dropMult}, the row's own) `
      + `and ONE damage multiplier (x${PAID.damageMult}); no seam names a ladder lift.`);
    return;
  }

  let missed = 0;
  for (const [name, m] of Object.entries(MUTATIONS)) {
    const base = m.file === 'legacy' ? legacySrc : accrualSrc;
    const mutated = plant(base, m);
    failed = 0;
    const seen = [];
    const realError = console.error;
    console.error = (line) => { seen.push(String(line)); };
    try {
      await run(m.file === 'legacy' ? mutated : legacySrc, m.file === 'accrual' ? mutated : accrualSrc, C);
    } catch (e) {
      seen.push(`threw: ${e && e.message}`); failed++;
    } finally {
      console.error = realError;
    }
    const hit = seen.some((l) => l.includes(`✗ ${m.expect}:`));
    if (m.expect === null) {
      if (failed) { console.error(`  MISSED  ${name} — the negative control turned something red: ${seen[0]}`); missed++; }
      else console.log(`  silent  ${name}\n            ${m.what}`);
    } else if (!failed) {
      console.error(`  MISSED  ${name} — planted and NOTHING went red`); missed++;
    } else if (!hit) {
      console.error(`  MISWIRED ${name} — red, but not by ${m.expect}: ${seen[0]}`); missed++;
    } else {
      console.log(`  caught  ${name} via ${m.expect}\n            ${m.what}`);
    }
  }
  if (missed) {
    console.error(`\ntrophy-call-sites --selftest: ${missed} mutation(s) not caught by their named assertion.`);
    process.exit(1);
  }
  console.log(`\nall ${Object.keys(MUTATIONS).length - 1} planted defects caught by name, the negative control silent.`);
};

main().catch((e) => {
  console.error(e instanceof Harness ? `harness: ${e.message}` : e);
  process.exit(2);
});
