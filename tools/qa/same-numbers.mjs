#!/usr/bin/env node
// tools/qa/same-numbers.mjs — DID A REFACTOR MOVE A NUMBER? One digest per formula, and one of real fights.
//
//   node tools/qa/same-numbers.mjs                 every formula's digest, then the combat digest (18 plays)
//   node tools/qa/same-numbers.mjs --no-combat     the formulas only (a second or two)
//   node tools/qa/same-numbers.mjs --root <dir>    read another tree (a checkout of the base commit)
//   node tools/qa/same-numbers.mjs --json          the digests as one JSON object
//
// WHY (lane/b-formula-home, 2026-11-10). A lane that moves where a formula lives must prove the numbers
// stayed where they were. The proof used to be a throwaway harness each time (the 18-play digest of
// lane/b-one-difficulty and lane/b-area-set was never in the tree). This is that harness, kept: run it on
// the base commit and on the lane, and the lines must match. It pins nothing, so a designer's balance
// edit never turns it red; it is a tool for refactors, not a guard.
//
// Every value is read through the door the game uses: the edge's `vendorPriceOf` and `GOLD_OFFERS`, the core
// evaluators, the data modules' own price functions, and `accrueHunt` (the settle the world tick runs) through
// tests/hunt-core/fixtures/play-ground.mjs. No formula is retyped here.
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ROOT = arg('--root') || HERE;
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const dig = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 8);

const LEVELS = [1, 2, 3, 5, 8, 10, 15, 16, 25, 30, 31, 32, 45, 50, 60, 85, 100, 110, 200, 300, 500, 1000];

async function formulas() {
  const out = {};
  const { ITEMS } = await imp('src/data/items.js');
  const CAT = await imp('supabase/functions/hr-accrue/catalogue.js');
  const ids = Object.keys(ITEMS).sort();
  out['sale price (every item)'] = ids.map((id) => [id, CAT.vendorPriceOf(ITEMS, id)]);
  out['book value (every item)'] = ids.map((id) => [id, ITEMS[id].v || 0]);
  out['shop buy price (every offer)'] = Object.keys(CAT.GOLD_OFFERS).sort().map((id) => [id, CAT.GOLD_OFFERS[id].gold, CAT.GOLD_OFFERS[id].grant]);
  out['shop refusals'] = Object.keys(CAT.OFFER_REFUSALS).sort().map((id) => [id, CAT.OFFER_REFUSALS[id]]);
  out['cheapest shop unit'] = Object.keys(CAT.SHOP_UNIT_PRICE).sort().map((id) => [id, CAT.SHOP_UNIT_PRICE[id]]);

  const V = await imp('src/core/vitals.js');
  out['max HP and mana'] = LEVELS.flatMap((L) => [0, 1, 2, 3, 4, 5, 6].map((n) => [L, n, V.maxHpFor(L, n), V.maxManaFor(L, n)]));
  out['regen rate'] = LEVELS.map((L) => [L, V.regenPermille(L)]);

  const XP = await imp('src/core/xp.js');
  out['level curve'] = LEVELS.map((L) => [L, XP.charXpForLevel(L), XP.charLevelFromXp(XP.charXpForLevel(L) + 1)]);
  out['combat skill curve'] = LEVELS.slice(0, 18).map((L) => [L, XP.skillXpForLevel('melee', L), XP.skillLevelFromXp('melee', XP.skillXpForLevel('melee', L))]);
  out['gather and craft curve'] = Array.from({ length: 99 }, (_, i) => [i + 1, XP.skillXpForLevel('mining', i + 1), XP.xpForLevel(i + 1), XP.levelFromXp(XP.xpForLevel(i + 1))]);

  const AR = await imp('src/core/action-rules.js');
  out['death loss'] = LEVELS.map((L) => { const x = XP.charXpForLevel(L) + 777; return [L, AR.deathXpLoss({ levelXp: x, skills: { melee: x, magic: Math.floor(x / 3), defense: 50 } })]; });
  const BL = await imp('src/data/blessings.js');
  out['blessings'] = [BL.BLESSING_CUT_PERMILLE, LEVELS.map((L) => [L, BL.blessingPrice(1, L), BL.blessingPrice(2, L), BL.blessingPrice(3, L)])];
  const SR = await imp('src/data/stamina-refill.js');
  out['stamina refill'] = LEVELS.slice(0, 16).flatMap((L) => [0, 1, 3, 5, 6].map((n) => [L, n, SR.refillPrice({ level: L, currentMin: 37, capMin: 480, boughtToday: n })]));
  const SH = await imp('src/data/scaled-hunts.js');
  out['scaled-hunt price'] = Object.keys(SH.SCALABLE_GROUNDS).sort().flatMap((g) => LEVELS.slice(0, 16).map((L) => [g, L, SH.pricePerHour(g, L), SH.priceFor(g, L, 3)]));
  const TD = await imp('src/data/temper.js');
  out['tempering'] = [TD.TEMPER_RUNGS, TD.TEMPER_RUNG_PM, TD.TEMPER_TIERS, TD.TEMPER_OFFERS];
  const BT = await imp('src/data/bench-tax.js');
  const BTC = await imp('src/core/bench-tax.js');
  out['bench tax'] = [BT.BENCH_TAX, BT.BENCH_TAX_FREE_UNDER_MG, [1, 7, 60, 500, 4321].map((bid) => [bid, BTC.feeMgOf(150, bid, 1, BT.BENCH_TAX_FREE_UNDER_MG), BTC.feeMgOf(150, bid, 5, BT.BENCH_TAX_FREE_UNDER_MG)])];
  const HR = await imp('src/data/hero-rename.js');
  out['rename price'] = LEVELS.map((L) => [L, HR.renamePrice(L)]);

  const P = await imp('src/core/pacing.js');
  out['pacing'] = [['cooking', 'smithing', 'mining', 'farming', 'melee'].map((s) => [s, P.pacedXp(s, 100), P.actionIntervalMs(s, 3000, {})]), P.pacedActionMs(2800)];
  const A = await imp('src/core/artisan.js');
  out['burn chance'] = [1, 10, 30, 60, 99].flatMap((lv) => [0, 1, 3, 5].map((nb) => [lv, nb, A.burnChance({ reqLv: 10, xp: 40 }, lv, nb), A.burnXp({ reqLv: 10, xp: 40 })]));
  const F = await imp('src/core/farm.js');
  out['farm tables'] = [F.PLOT_TIERS, F.PLOT_TIER_PRICES, F.REGROW_LIMITS, F.WATER_WINDOW_H, F.WATER_RATE, F.MAX_WATERINGS, [1, 2, 3, 4, 5].map((n) => F.plotUpgradePrice(n))];

  const C = await imp('src/core/combat.js');
  const { MONSTERS } = await imp('src/data/monsters.js');
  const kinds = Object.keys(MONSTERS).sort();
  out['monster blow and hit (every monster)'] = kinds.map((k) => [k, C.monsterMaxHit(MONSTERS[k]), [0, 20, 60].map((d) => C.monsterAccuracy(MONSTERS[k], d)), C.defenceReduction(MONSTERS[k])]);
  const kit = { weapon: 'steel_sword', body: 'steel_platebody', helmet: 'steel_helm', shield: 'bronze_rimmed_shield' };
  out['hero rolls (every monster)'] = kinds.map((k) => { const r = C.playerCombatRolls(MONSTERS[k], { equipment: kit, items: ITEMS, skills: { melee: XP.skillXpForLevel('melee', 30) } }); return [k, r.accuracy, r.maxHit, r.critChance]; });
  out['monster rows'] = kinds.map((k) => { const m = MONSTERS[k]; return [k, m.hp, m.atk, m.def, m.xp, m.gp, m.baseAcc, m.level, m.tier, m.dropBonus, (m.drops || []).map((d) => [d.id, d.ch])]; });
  const D = await imp('src/core/drops.js');
  out['drop chance'] = [0.0004, 0.01, 0.05, 0.3, 0.9, 1].flatMap((ch) => [1, 1.15].map((dm) => [ch, dm, D.effectiveDropChance({ ch }, { dropMult: dm }), D.dropBand(ch)]));
  return out;
}

/* THE COMBAT DIGEST: each open ground played three ways on the real settle (a lone tank, a lone mage, a mixed four), ten sim-minutes each,
   at the ground's floor: 18 plays on today's six grounds. Hashes what the server would credit: totals, each hero's XP, items and end state. */
async function combat() {
  const { loadPlay } = await imp('tests/hunt-core/fixtures/play-ground.mjs');
  const P = await loadPlay(ROOT);
  const { OPEN_GROUNDS } = await imp('src/data/hunt-grounds.js');
  const { HUNT_INDEX } = await imp('src/data/hunts.js');
  const plays = [];
  for (const gid of Object.keys(OPEN_GROUNDS).sort()) {
    const hunt = OPEN_GROUNDS[gid].hunt, floor = Math.max(1, HUNT_INDEX[hunt].band[0]);
    for (const roles of [['tank'], ['mage'], ['tank', 'ranger', 'mage', 'healer']]) {
      const x = P.run(hunt, floor, roles, { spanMs: 600000 });
      plays.push([gid, roles.join('+'), dig([x.totals, x.items, x.heroXp, x.heroItems, x.killsBy, x.members])]);
    }
  }
  return plays;
}

const out = {};
const f = await formulas();
for (const k of Object.keys(f)) out[k] = dig(f[k]);
if (!process.argv.includes('--no-combat')) {
  const plays = await combat();
  out['combat (' + plays.length + ' plays)'] = dig(plays);
  if (process.argv.includes('--plays')) for (const p of plays) out['  ' + p[0] + ' ' + p[1]] = p[2];
}
out.ALL = dig(out);
if (process.argv.includes('--json')) console.log(JSON.stringify(out));
else for (const k of Object.keys(out)) console.log(out[k] + '  ' + k);
