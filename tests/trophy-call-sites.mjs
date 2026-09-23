#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/trophy-call-sites.mjs — THE SHIPPED CALL SITES PASS THE MONSTER ID.
//
//   node tests/trophy-call-sites.mjs             the guard
//   node tests/trophy-call-sites.mjs --selftest  mutation proof: each defect caught
//
// ── THE DEFECT THIS EXISTS FOR (Security F4/F5, SEC_BESTIARY_TROPHY_2026-09-22) ─
// The trophy index is keyed by MONSTER ID and no roster row carries one — 0 of
// 108 measured. `weaknessInfo(m, eq, charms, trophies, id)` therefore resolves
// the trophy off its FIFTH argument, and `playerCombatRolls(m, ctx)` off
// `ctx.monsterId`. `combatCtx` omits that field DELIBERATELY and correctly: the
// context is built once per loadout and read for whichever monster the caller
// then names, so an id frozen into it would price every fight as the one the
// context happened to be built for.
//
// Which means the id has to arrive AT THE CALL — and at neither call it did:
//
//     src/legacy.js  getPlayerCombatRolls   →  weak.dropMult 1.15     (stage 0)
//     src/legacy.js  getWeaknessInfo        →       dropMult 1.1845   (stage 4)
//
// The server pays the SECOND number (combat-sim.js `resolveKill` hands
// `ctx.weakness` the id it already holds), so the Fight screen quoted a drop
// rate ~3% below what a Nemesis holder actually gets — CLAUDE.md §6, and
// src/features/smoke/hunt-raids-and-screens.js already asserts the two equal to
// 1e-9, so it was a latent in-page RED that would arm itself at the first
// Stalker and, per CLAUDE.md §4, make the GitHub `smoke` gate unreachable for
// every later build. The engine seam (`accrual.js` `playerRolls(m)`) had the
// same hole, which is the AWAY column of the same property.
//
// ── WHY IT GRADES THE CALL SITES AND NOT THE CORE ───────────────────────────
// tests/bestiary-trophy.mjs T6 already proves the ATTENDED and AWAY shapes agree
// WHEN BOTH ARE HANDED THE ID — it passes `monsterId: 'slime'` itself. That is
// the right assertion for the core and it is structurally blind to this defect,
// because the defect is in who calls, not in what is called. So this guard
// builds NOTHING: both callers are lifted out of the SHIPPED bytes and executed,
// the client one against the real src/core-bridge.js.
//
// ⚠ AND IT CLOSES THE DAMAGE ARM (F5). `maxHit` is rolled from
//   `ctx.playerRolls(m)` (src/core/combat-sim.js), so while that path resolved
//   stage 0 the dormant TROPHY_DAMAGE_ARM_ENABLED named an effect that could pay
//   nothing — what tests/arm-flag-honesty.mjs exists to prevent. C3 below
//   requires the stage to REACH the roll, which is the plumbing arming needs.
//
// Credential-free, database-free. The design is docs/design/BESTIARY_LADDER.md.
//
// Exit: 0 green · 1 a finding · 2 harness (an anchor moved, a module would not
// load, or --selftest could not plant a defect).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';
import { TROPHY_STAGES, MAX_TROPHY_STAGE } from '../src/data/bestiary.js';
import { trophyIndex, monsterIdIn } from '../src/core/trophies.js';
import { charmIndex, killsByClass } from '../src/core/charms.js';
import { playerCombatRolls, weaknessInfo, equipmentStats } from '../src/core/combat.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const LEGACY = join(ROOT, 'src', 'legacy.js');
const ACCRUAL = join(ROOT, 'supabase', 'functions', 'hr-accrue', 'accrual.js');
const BRIDGE = join(ROOT, 'src', 'core-bridge.js');

const argv = process.argv.slice(2);
const SELFTEST = argv.includes('--selftest');

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  ✗ ${msg}`); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;
class Harness extends Error {}

/** A function's source, from its `open` line to the line before `close`. */
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

// ── THE FIXTURE: one character, one monster, a TOP-RUNG trophy ─────────────
// The stage that matters is the top one, because that is where the two answers
// diverge most and where the in-page assertion arms itself first.
const MON_ID = 'slime';
const ROW = MONSTERS[MON_ID];
const KILLS = Object.create(null);
KILLS[MON_ID] = TROPHY_STAGES[TROPHY_STAGES.length - 1].at;
const TROPHIES = trophyIndex(KILLS, MONSTERS);
const CHARMS = charmIndex(killsByClass(KILLS, MONSTERS));
const EQ = equipmentStats({}, ITEMS);

/* THE NUMBER THE SERVER PAYS. combat-sim.js `resolveKill` reads its drop
   multiplier from `ctx.weakness(m, id)` and nothing else, so this call IS the
   contract both call sites below are graded against — never a literal. */
const PAID = weaknessInfo(ROW, EQ, CHARMS, TROPHIES, MON_ID);

/* The bridge is loaded ONCE, at the top of main, and its published object is
   re-attached to each fresh window below. A data URL with identical bytes is
   CACHED by the loader, so a second import would not re-run the top-level
   `window.HearthriseCore = …` after --selftest replaced the window — and the
   run would die as a harness error instead of grading the mutation. */
async function run(legacySrc, accrualSrc, C) {
  if (!(PAID.trophyStage === MAX_TROPHY_STAGE)) {
    throw new Harness(`the fixture does not hold a top-rung trophy (stage ${PAID.trophyStage}) — every assertion below would be vacuous`);
  }

  // ── THE CLIENT SEAM, against the REAL core-bridge ────────────────────────
  /* The ambient globals core-bridge reads, and NOTHING else. `MONSTERS` is the
     SAME OBJECT this file imported, which is load-bearing: `monsterIdIn`
     resolves a row by IDENTITY, so handing the bridge a second copy of the
     catalogue would make every id resolve to null and this guard would be red
     against correct code. C4 below keeps that assumption measured. */
  globalThis.window = {
    G: { equipment: {}, skills: {}, enchant: null },
    MONSTERS,
    ITEMS,
    HearthriseTrophies: { indexForCombat: () => TROPHIES },
    HearthriseCharms: { indexForCombat: () => CHARMS },
    HearthriseCore: C,
  };

  const clientSrc = lift(legacySrc, 'function getPlayerCombatRolls(m,eq=getEquipmentStats()){',
    '\n/* Wave 5c: armour SET bonus.', 'getPlayerCombatRolls');
  // eslint-disable-next-line no-new-func
  const getPlayerCombatRolls = new Function('getEquipmentStats', 'getArmorSetBonus',
    `${clientSrc}\n; return getPlayerCombatRolls;`)(() => EQ, () => null);

  const fight = getPlayerCombatRolls(ROW).weak;

  // C1 — the Fight screen and the loot preview quote ONE number, and it is the
  //      one the server pays.
  ok(fight && near(fight.dropMult, PAID.dropMult),
    `C1: the Fight screen quotes dropMult ${fight && fight.dropMult} while the server pays `
    + `${PAID.dropMult} for the same stage-${MAX_TROPHY_STAGE} kill (trophyStage `
    + `${fight && fight.trophyStage} vs ${PAID.trophyStage}). src/legacy.js getPlayerCombatRolls `
    + 'must pass monsterId at the call — combatCtx correctly does not carry one');
  ok(fight && fight.trophyStage === MAX_TROPHY_STAGE,
    `C1: the client roll resolved trophy stage ${fight && fight.trophyStage}, not ${MAX_TROPHY_STAGE} — `
    + 'it is paying every charm and no trophy');

  // ── THE ENGINE SEAM, lifted out of accrual.js ────────────────────────────
  const engineSrc = lift(accrualSrc, '    playerRolls(m) {', '\n    monsterRolls(m) {', 'playerRolls');
  // eslint-disable-next-line no-new-func
  const engine = new Function(
    'monsters', 'eq', 'equipment', 'items', 'state', 'bonus', 'setBonus', 'profile', 'style',
    'charms', 'trophies', 'playerCombatRolls', 'monsterIdIn',
    `const o = {\n${engineSrc}\n};\nreturn o.playerRolls;`,
  )(MONSTERS, EQ, {}, ITEMS, { skills: {} }, () => 0, null, undefined, undefined,
    CHARMS, TROPHIES, playerCombatRolls, monsterIdIn);

  const away = engine(ROW).weak;

  // C2 — AWAY-1. The engine's own seam quotes the same one number.
  ok(away && near(away.dropMult, PAID.dropMult),
    `C2: hr-accrue/accrual.js playerRolls(m) quotes dropMult ${away && away.dropMult} against the `
    + `${PAID.dropMult} ctx.weakness(m, id) pays beside it in the SAME span — AWAY-1 requires both `
    + 'seams to carry the id, and maxHit is rolled through this one');
  ok(away && near(away.dropMult, fight && fight.dropMult),
    'C2: the attended and away seams disagree with each other');

  // C3 — F5. The stage REACHES the roll, which is what arming the damage half
  //      needs. While it resolved 0, TROPHY_DAMAGE_ARM_ENABLED named an effect
  //      that could pay nothing.
  ok(away && away.trophyStage === MAX_TROPHY_STAGE,
    `C3: maxHit is rolled from this path and it resolves trophy stage ${away && away.trophyStage} — `
    + 'flipping TROPHY_DAMAGE_ARM_ENABLED would state an effect that pays nothing (arm-flag-honesty)');

  // C4 — NON-VACUITY. The whole guard rests on no roster row carrying `.id`; if
  //      one ever does, `monsterIdIn` short-circuits and a dropped id stops
  //      being observable for that monster. Measured, not assumed.
  const withId = Object.keys(MONSTERS).filter((k) => typeof MONSTERS[k].id === 'string' && MONSTERS[k].id);
  ok(withId.length === 0,
    `C4: ${withId.length} roster row(s) now carry .id (e.g. "${withId[0]}"), so monsterIdIn resolves them `
    + 'without the call site passing anything — re-derive both arms before trusting them');
  ok(monsterIdIn(MONSTERS, ROW) === MON_ID,
    'C4: monsterIdIn no longer resolves a roster row by identity — the fixture cannot see the defect');

  return failed;
}

// ── MUTATIONS ───────────────────────────────────────────────────────────────
const MUTATIONS = {
  client_drops_the_id: {
    what: 'src/legacy.js stops passing monsterId, so the Fight screen prices every kill at trophy stage 0 — the defect exactly as reviewed',
    file: 'legacy',
    // Anchored on the EXPRESSION, not the line, so a comment edit beside it
    // cannot silently turn this mutation into a no-op the harness reports as a
    // miss — the anchor-count check below would catch that, loudly, but a guard
    // that needs re-anchoring every time someone rewords a comment gets edited
    // around instead of read.
    find: '{ ...C.combatCtx(eq, _set), monsterId: C.monsterId(m) }',
    repl: 'C.combatCtx(eq, _set)',
    expect: 'C1',
  },
  engine_drops_the_id: {
    what: 'accrual.js playerRolls(m) stops passing monsterId — the AWAY column of the same defect, and the one maxHit is rolled through',
    file: 'accrual',
    find: '        bonus, setBonus, profile, style, charms, trophies, monsterId: id,',
    repl: '        bonus, setBonus, profile, style, charms, trophies,',
    expect: 'C2',
  },
  engine_id_from_the_row: {
    what: 'accrual.js resolves the id off a field on the ROW instead of by identity — every roster row returns undefined, so it is a dropped id wearing a plausible expression',
    file: 'accrual',
    find: '      const id = monsterIdIn(monsters, m);',
    repl: '      const id = m && m.id;',
    expect: 'C2',
  },
  control_comment_only: {
    what: 'NEGATIVE CONTROL — an inert comment at the client call must move nothing',
    file: 'legacy',
    find: '  const _set=(typeof getArmorSetBonus===\'function\')?getArmorSetBonus():null;',
    repl: '  const _set=(typeof getArmorSetBonus===\'function\')?getArmorSetBonus():null; /* control */',
    expect: null,
  },
};

const main = async () => {
  const legacySrc = await readFile(LEGACY, 'utf8');
  const accrualSrc = await readFile(ACCRUAL, 'utf8');

  globalThis.window = { G: {}, MONSTERS, ITEMS };
  await loadClient(BRIDGE);                     // publishes window.HearthriseCore
  const C = globalThis.window.HearthriseCore;
  if (!C || typeof C.combatCtx !== 'function' || typeof C.monsterId !== 'function') {
    throw new Harness('core-bridge did not publish combatCtx/monsterId');
  }

  if (!SELFTEST) {
    failed = await run(legacySrc, accrualSrc, C);
    if (failed) {
      console.error(`\ntrophy-call-sites: RED — ${failed} finding(s). See docs/planning/SEC_BESTIARY_TROPHY_2026-09-22.md F4/F5.`);
      process.exit(1);
    }
    console.log(`trophy-call-sites: green — both shipped seams pass the monster id, so the Fight screen, `
      + `the away span and the server quote ONE drop rate (x${PAID.dropMult} at stage ${MAX_TROPHY_STAGE}), `
      + 'the stage reaches the roll maxHit comes off, and no roster row carries an .id that would hide a regression.');
    return;
  }

  let missed = 0;
  for (const [name, m] of Object.entries(MUTATIONS)) {
    const base = m.file === 'legacy' ? legacySrc : accrualSrc;
    const hits = base.split(m.find).length - 1;
    if (hits !== 1) {
      console.error(`  HARNESS: anchor for ${name} matched ${hits} times (need 1)`);
      process.exit(2);
    }
    const mutated = base.replace(m.find, m.repl);

    failed = 0;
    const seen = [];
    const realError = console.error;
    console.error = (line) => { seen.push(String(line)); };
    try {
      await run(m.file === 'legacy' ? mutated : legacySrc, m.file === 'accrual' ? mutated : accrualSrc, C);
    } finally {
      console.error = realError;
    }

    const hit = seen.some((l) => l.includes(`✗ ${m.expect}:`));
    if (m.expect === null) {
      if (failed) { console.error(`  MISSED  ${name} — the negative control turned something red`); missed++; }
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
