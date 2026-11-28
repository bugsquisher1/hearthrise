#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/roads/make-lend.mjs — THE BORROWED-MOVE LAB VARIANT (lane/roads-review-measure, 2026-11-22).
//
//   node tools/balance-program/redesign/roads/make-lend.mjs     writes roads-lend.json beside it
//
// docs/design/redesign/17-talent-tree.md section 3 (border towns): a hero puts another country's move on its bar "with any weapon, at a
// cost" (-30% at a border town, -40% from the Havora crossing). Borrowing is NOT in the engine. This writes a Balance Lab candidate
// (hearthrise.balance-candidate/1, played on a scratch copy by candidates.mjs treeOf; the tree is never written) that adds, for each LEND
// row below, a CLONE of the native ability row:
//   id          <native id>__<borrower discipline>_<power permille>[_r<reach>]
//   disciplines [the borrower's], so the weapon lock (hunt-spawn.js heroSetup, disciplineAbilities) lets the borrower's bar fire it, and
//               its unlock, rune version and numbers read the BORROWER's weapon skill and blow (17 section 3's proposal: "scales with, and
//               trains, the skill of the weapon you hold")
//   numbers     every number the row lands x pm / 1000: hitPm, healPm, shieldPm, an integer or [lo, hi] beginner floor (base), a mark's
//               bonusPct, a taunt's hold (holdPm, below). Mana, cooldown, lane, rune, area and party-only rules are the native row's
//   reach       an ALLY heal's reach in tiles (the native caster's range); absent, the borrower's own range (a melee hero: 1 tile)
// The engine reads those fields itself since lane/e5-borrowing (no seam is planted): an ally heal's `row.reach` before the hero's range
// (cast-targets.js reachOf; conditions.js slotReach), and a `lent` taunt from a hero that is not a tank, held holdPm of the hold
// (targeting.js challengeable, challengeFrom). A clone is native to its borrower, so the engine's own borrow rules (the heal on Mend's
// clock, Magic at Mend's rate) never touch it: these candidates replay 18 sections 1 to 3 as measured.
// PURE data writer; Node only.
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/* [native id, borrower discipline, power permille, ally reach (0: the borrower's own)] */
export const LEND = [
  ['greater_mend', 'club', 1000, 7], ['greater_mend', 'club', 700, 7], ['greater_mend', 'club', 600, 7], ['greater_mend', 'club', 700, 0],
  ['greater_mend', 'sword', 1000, 7], ['greater_mend', 'sword', 600, 7], ['greater_mend', 'club', 400, 7], ['greater_mend', 'club', 850, 7],
  ['shelter', 'restoration', 1000, 0], ['shelter', 'restoration', 700, 0], ['shelter', 'restoration', 600, 0], ['shelter', 'restoration', 400, 0], ['shelter', 'restoration', 850, 0],
  ['challenge', 'club', 1000, 0], ['challenge', 'club', 700, 0],
  ['fireball', 'club', 1000, 0], ['fireball', 'club', 700, 0], ['frost_lance', 'club', 1000, 0], ['frost_lance', 'club', 700, 0],
  ['hunters_mark', 'sword', 1000, 0], ['hunters_mark', 'sword', 700, 0],
  /* the formula test (18 section 3) */
  ['greater_mend', 'club', 200, 7], ['fireball', 'club', 500, 0],
  /* (the towns' owed V0, lane/roads-borrow-values, lend no clone: the engine's own borrow plays them, roads-run.mjs pm 'engine') */
];
export const lentId = (id, d, pm, reach) => id + '__' + d + '_' + pm + (reach ? '_r' + reach : '');

const LEND_SRC = `/* ROADS REVIEW LAB VARIANT (tools/balance-program/redesign/roads/make-lend.mjs; scratch copy only): borrowed rows */
const LEND = ${JSON.stringify(LEND)};
const lendScale = (n, pm) => Math.max(1, Math.floor((n * pm) / 1000));
const lend = (r) => [r, ...LEND.filter(([id]) => id === r.id).map(([id, d, pm, reach]) => ab({ ...r, id: id + '__' + d + '_' + pm + (reach ? '_r' + reach : ''),
  disciplines: [d], lent: true, ...(reach ? { reach } : {}),
  ...(Number.isInteger(r.hitPm) ? { hitPm: lendScale(r.hitPm, pm) } : {}),
  ...(Number.isInteger(r.healPm) ? { healPm: Math.max(100, lendScale(r.healPm, pm)) } : {}),
  ...(Number.isInteger(r.shieldPm) ? { shieldPm: Math.max(100, lendScale(r.shieldPm, pm)) } : {}),
  ...(Number.isInteger(r.base) ? { base: lendScale(r.base, pm) } : Array.isArray(r.base) ? { base: r.base.map((x) => lendScale(x, pm)) } : {}),
  ...(Number.isInteger(r.bonusPct) ? { bonusPct: Math.max(1, Math.round((r.bonusPct * pm) / 1000)) } : {}),
  ...(r.target === 'taunt' ? { holdPm: pm } : {}) }))];
export const ABILITIES = Object.freeze([`;

const candidate = {
  schema: 'hearthrise.balance-candidate/1',
  base: 'tree',
  id: 'roads-lend',
  why: 'Roads review (17-talent-tree.md section 3): borrowed moves as clone rows on the borrower\'s discipline at a power permille, played on a scratch copy',
  edits: [
    { file: 'src/data/abilities.js', from: 'export const ABILITIES = Object.freeze([', to: LEND_SRC },
    { file: 'src/data/abilities.js', from: '].reduce((acc, r) => { acc[r.id] = r; return acc; }, Object.create(null)));', to: '].flatMap(lend).reduce((acc, r) => { acc[r.id] = r; return acc; }, Object.create(null)));' },
    /* (the three engine seams the clones once needed are the engine's own since lane/e5-borrowing: cast-targets.js reachOf and
       conditions.js slotReach read a row's `reach`, targeting.js challengeable takes a `lent` taunt from any seat and challengeFrom
       holds it holdPm of the hold, on the step grid) */
  ],
  assumptions: [
    'A borrowed move is its native row on the borrower\'s discipline: it reads the borrower\'s weapon skill and blow (17 section 3 proposal)',
    'The penalty is a flat multiplier on every number the row lands; mana, cooldown, rune and area are unchanged',
    'An ally heal keeps the native caster\'s 7-tile reach where the cell names it (the engine otherwise gives a melee borrower 1 tile)',
  ],
};
/* 17 SECTION 3'S BORROW RULES THE ENGINE LACKS (lane/roads-borrow-values), for the cells that measure a move the engine's own borrow
   cannot play as ruled (roads-run.mjs plan v0rules, --candidate roads-lend-rules.json):
   - THE LENT SHOT. A cast looses what the worn weapon can shoot (abilities.js castShotOf: shootsItem by role), so a sword has no arrow
     for a borrowed Raking Shot. 17 rules a borrowed move "uses its own rune or arrows": a hero with a borrow list looses the free Bronze
     Arrow it carries (bag bronze_arrows, ammoPerShot 0) when its own bar names no shot.
   The taunt from any seat and the native reach this file once planted (lane/roads-v0-remeasure) are the engine's own since
   lane/e5-borrowing (src/core/hunt/talent-rows.js lend: an engine borrow is a lent row), so only the lent shot is planted here */
const rules = {
  ...candidate, id: 'roads-lend-rules',
  why: candidate.why + '; the borrow rule the engine lacks: a borrowed shot looses its own arrows',
  edits: [...candidate.edits,
    { file: 'src/core/hunt/abilities.js', from: '  return got ? got.pick.id : null;',
      to: '  return got ? got.pick.id : (hero.borrowBlows && h.hs && h.hs.bag && h.hs.bag.bronze_arrows ? \'bronze_arrows\' : null);' }],
  assumptions: [...candidate.assumptions, 'A borrowed shot move carries its own arrows (the free rung: the borrowed cast reads its native weapon\'s blow, never the arrow)'],
};
if (isMain(import.meta.url)) writeFileSync(join(HERE, 'roads-lend.json'), JSON.stringify(candidate, null, 1) + '\n');
if (isMain(import.meta.url)) writeFileSync(join(HERE, 'roads-lend-rules.json'), JSON.stringify(rules, null, 1) + '\n');
if (isMain(import.meta.url)) console.log('wrote roads-lend.json: ' + LEND.length + ' borrowed rows; roads-lend-rules.json: the same and 17\'s borrow rules the engine lacks');
