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
// and three engine seams the borrowed rows need, each a scratch edit:
//   - an ally heal reads `row.reach` before the hero's range (cast-targets.js reachOf; conditions.js allyOf's "lowest ally")
//   - a borrowed Challenge (`lent`) taunts from a hero that is not a tank (targeting.js challengeable: it took only tanks), and its hold
//     is CHALLENGE.holdMs x holdPm / 1000 (the doc's "-30% taunt duration")
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
    { file: 'src/core/hunt/cast-targets.js', from: 'export const reachOf = (h, row) => Math.max(1, int(h && h.range) || 1) + ',
      to: 'export const reachOf = (h, row) => (row.reach || Math.max(1, int(h && h.range) || 1)) + ' },
    { file: 'src/core/hunt/conditions.js', from: '(a === cx.u || reaches(cx.inst, cx.u, cx.h && cx.h.range, a)));',
      to: '(a === cx.u || reaches(cx.inst, cx.u, (cx.slot && cx.slot.action && ABILITIES[cx.slot.action.id] && ABILITIES[cx.slot.action.id].reach) || (cx.h && cx.h.range), a)));' },
    { file: 'src/core/hunt/abilities.js', from: "case 'taunt': return challengeable(inst, hero).length ? hero : null;", to: "case 'taunt': return challengeable(inst, hero, row.lent).length ? hero : null;" },
    { file: 'src/core/hunt/abilities.js', from: "case 'taunt': challengeFrom(inst, sc, u); break;", to: "case 'taunt': challengeFrom(inst, sc, u, row); break;" },
    { file: 'src/core/hunt/targeting.js', from: 'export function challengeable(inst, k) {\n', to: 'export function challengeable(inst, k, lent) {\n' },
    { file: 'src/core/hunt/targeting.js', from: '  return inReachOf(inst, k).filter(', to: '  return inReachOf(inst, k, lent).filter(' },
    { file: 'src/core/hunt/targeting.js', from: 'function inReachOf(inst, k) {\n  if (!isTank(k) || !k.alive) return [];', to: 'function inReachOf(inst, k, lent) {\n  if ((!isTank(k) && !lent) || !k.alive) return [];' },
    { file: 'src/core/hunt/targeting.js', from: 'export function challengeFrom(inst, sc, k) {\n  const took = challengeable(inst, k);\n  for (const m of took) { retarget(inst, m, k.id, sc); m.queued = false; m.holdMs = tauntHold(k); }',
      to: 'export function challengeFrom(inst, sc, k, row) {\n  const took = challengeable(inst, k, row && row.lent);\n  for (const m of took) { retarget(inst, m, k.id, sc); m.queued = false; m.holdMs = row && row.holdPm ? Math.floor((tauntHold(k) * row.holdPm) / 1000) : tauntHold(k); }' },
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
   - THE TAUNT FROM ANY SEAT (lane/roads-v0-remeasure). targeting.js challengeable takes only a tank; 17 rules "a borrowed Challenge
     taunts from any seat". A seat whose borrow list names Challenge (borrowBlows) taunts at the full hold.
   - THE NATIVE REACH. 17 rules a borrowed ally heal reaches as its native move ("Greater Mend: 7 tiles"); the engine gives it the
     holder's range (cast-targets.js reachOf: a melee hero's 1 tile). Greater Mend's row carries reach 7, the healer's own range, so a
     native healer is unchanged and a borrower reaches 7 (the reach seam above reads row.reach) */
const rules = {
  ...candidate, id: 'roads-lend-rules',
  why: candidate.why + '; 17 section 3\'s borrow rules the engine lacks: a borrowed shot looses its own arrows, a borrowed ally heal reaches as its native move',
  edits: [...candidate.edits,
    { file: 'src/core/hunt/abilities.js', from: '  return got ? got.pick.id : null;',
      to: '  return got ? got.pick.id : (hero.borrowBlows && h.hs && h.hs.bag && h.hs.bag.bronze_arrows ? \'bronze_arrows\' : null);' },
    { file: 'src/data/abilities.js', from: "ab({ id: 'greater_mend', n: 'Greater Mend', disciplines: ['restoration'], ", to: "ab({ id: 'greater_mend', n: 'Greater Mend', reach: 7, disciplines: ['restoration'], " },
    /* lane/roads-v0-remeasure: Protective Ward's native reach (the healer's 7 tiles, as Greater Mend), and a borrowed Challenge taunts
       from any seat at its full hold (17 section 3 "Taunts"; the engine's challengeable takes only a tank). "Borrowed" here is the
       ENGINE's borrow (the seat's borrowBlows names the row), not a clone's `lent` */
    { file: 'src/data/abilities.js', from: "ab({ id: 'protective_ward', n: 'Protective Ward', disciplines: ['restoration'], ", to: "ab({ id: 'protective_ward', n: 'Protective Ward', reach: 7, disciplines: ['restoration'], " },
    { file: 'src/core/hunt/abilities.js', from: "case 'taunt': return challengeable(inst, hero, row.lent).length ? hero : null;",
      to: "case 'taunt': return challengeable(inst, hero, row.lent || !!(hero.borrowBlows && Number.isInteger(hero.borrowBlows[row.id]))).length ? hero : null;" },
    { file: 'src/core/hunt/abilities.js', from: "case 'taunt': challengeFrom(inst, sc, u, row); break;",
      to: "case 'taunt': challengeFrom(inst, sc, u, u.borrowBlows && Number.isInteger(u.borrowBlows[row.id]) ? { ...row, lent: true } : row); break;" }],
  assumptions: [...candidate.assumptions, 'A borrowed shot move carries its own arrows (the free rung: the borrowed cast reads its native weapon\'s blow, never the arrow)',
    'A borrowed Greater Mend reaches 7 tiles, its native healer\'s range (17 section 3 "Reach")', 'A borrowed Protective Ward reaches 7 tiles too',
    'A borrowed Challenge taunts from any seat at its full hold (17 section 3 "Taunts")'],
};
if (isMain(import.meta.url)) writeFileSync(join(HERE, 'roads-lend.json'), JSON.stringify(candidate, null, 1) + '\n');
if (isMain(import.meta.url)) writeFileSync(join(HERE, 'roads-lend-rules.json'), JSON.stringify(rules, null, 1) + '\n');
if (isMain(import.meta.url)) console.log('wrote roads-lend.json: ' + LEND.length + ' borrowed rows; roads-lend-rules.json: the same and 17\'s borrow rules the engine lacks');
