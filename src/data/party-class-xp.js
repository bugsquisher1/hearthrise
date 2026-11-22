// ════════════════════════════════════════════════════════════════════════
// src/data/party-class-xp.js — PARTY LEVEL XP: BY PARTY SIZE ALONE
//
// Tyler 2026-11-21 (the sitting, S-10 option c): party XP by SIZE ALONE for the first build. After Deadly is sized on the
// fixed tool, read which fours players run; the classes rule (2026-10-31, "better only with different classes") may come
// back as one row of this table if one damage type wins everywhere. Until then a party's cell reads how many heroes are
// alive at the kill and nothing else: which weapons they hold, the ground and the tier never read.
//
// THE RULE:
//   - LEVEL XP only (src/core/hunt/xp-share.js): no gold or loot effect, skill XP untouched.
//   - Read from the LIVING heroes at EACH kill, never latched: a death or a leave changes the next kill.
//   - A hero alone earns SOLO_XP_PM (Tyler 2026-11-11, +15%), on every ground.
//   - ONE TABLE for every ground and every tier (PARTY_SIZE_XP, Tyler 2026-11-16). No ground carries a row of its own
//     (src/data/grounds/shape.js refuses one in a pack); what a party earns on a ground is that ground's own pull, density
//     and monster rows (balance-sheet.js).
//   - A party larger than the table's largest size reads that largest size (the party cap is a config value).
//
// PURE ESM. Data, and the one reader of it (the engine, the Hunts window and the party window).
// ════════════════════════════════════════════════════════════════════════

import { GROUND_PACKS } from './grounds/index.js';
import { foldRows } from './grounds/shape.js';
import { TIER_IDS, DEFAULT_TIER, tiersOf } from './hunt-tiers.js';

/* A HERO HUNTING ALONE (Tyler 2026-11-08: "a solo person gets a small exp boost BUT the difficulty should be unchanged"), +15% since
   Tyler 2026-11-11 ("solo hunters get +15% Level XP", on any tier; lane/d-solo-fifteen). Level XP only, read at each kill like every
   cell: a party's last hero standing hunts alone and earns it. A kill's share floors (xp-share.js), so where kills are worth a few dozen
   XP an hour reads a little less. */
export const SOLO_XP_PM = 1150;

/* THE SIZE TABLE (S-10 c, 2026-11-21). A cell is permille on the even share (xp-share.js: a kill's Level XP over the living heroes,
   times the cell). Each size keeps the cell a party of every class it could hold was paid under the classes table (2026-11-17: a pair
   of two classes 1500, a three of three 1700, a four of four 1700), so the standard mixed party is paid exactly what it was and a party
   of one class, or of fewer classes than seats, rises to it. HYPOTHESIS until the fixed tool reads the fours players run
   (tools/balance-program patches/party-xp-by-size.json, built here). */
export const PARTY_SIZE_XP = Object.freeze({ 2: 1500, 3: 1700, 4: 1700 });

/* WHAT THE PLAYER IS TOLD (designer 2026-11-02; blind party test 2026-11-01). The table above is a factor on an even share of a bigger pull,
   so the factor is never what a party earns against hunting alone. THIS is the measured answer, in whole percent to the nearest 5: Level XP
   a head at the ground's floor on the tier's own pull, against the same heroes alone on that tier, one line per tier the ground offers
   (lane/d-party-pace: the window reads the leader's tier). BY SIZE (2026-11-21): each size's line is the line its full mix was measured at
   (tests/party-class-xp-line.mjs --mixed --write, set v0.2.141, 3 seeds: a pair the mean of tank + Healer and tank + bow, a three tank +
   Healer + bow, a four tank + Healer + bow + wand), since that party's cell did not move and every other party of its size is paid the
   same cell now. Re-measure with the guard's --mixed --write after a cell or a ground's dials move. */
const size = (two, three, four) => Object.freeze({ 2: two, 3: three, 4: four });
/* a ground's lines, one per tier it offers: { normal: size(..), dangerous: size(..), deadly: size(..) } */
const lines = (byTier) => Object.freeze(Object.fromEntries(Object.entries(byTier).map(([tier, l]) => [tier, size(l[2], l[3], l[4])])));
const BASE_VS_ALONE = Object.freeze({
  mill_cellar: lines({ normal: size(-30, -40, -60) }),
  meadowbrook_thicket: lines({ normal: size(-10, -20, -35), dangerous: size(-10, -20, -35), deadly: size(-5, -15, -35) }),
  wickstead: lines({ normal: size(-10, -20, -40), dangerous: size(-10, -20, -35), deadly: size(-5, -20, -30) }),
  mosslight_glade: lines({ normal: size(0, 0, -20), dangerous: size(15, 15, 10), deadly: size(95, 85, 60) }),
  millrace_sewer: lines({ normal: size(10, 15, 10), dangerous: size(20, 25, 20), deadly: size(15, 25, 20) }),
  coppercap_warrens: lines({ normal: size(20, 30, 30), dangerous: size(25, 35, 35), deadly: size(30, 45, 40) }),
});
/* A ground pack's measured lines (src/data/grounds/<id>/pack.js `partyVsAlone`: { normal: { 2, 3, 4 }, dangerous: .., deadly: .. }, a whole
   five a size, measured on the real settle). */
export const PARTY_VS_ALONE = Object.freeze(foldRows('party line', BASE_VS_ALONE, GROUND_PACKS, (p) => (p.partyVsAlone ? { [p.id]: lines(p.partyVsAlone) } : {})));

const SIZES = Object.keys(PARTY_SIZE_XP).map(Number);

/**
 * THE ONE READER. `n`: how many heroes are counted (the living ones, in the engine). Answers the permille their kill's even share is paid.
 * Which roles they hold, the ground and the tier never read (S-10 c).
 */
export function partySizeXp(n) {
  if (n === 1) return SOLO_XP_PM;
  if (!Number.isInteger(n) || n < 2) return 1000;
  return PARTY_SIZE_XP[Math.min(n, Math.max(...SIZES))];
}

/** The measured percent (PARTY_VS_ALONE) for a party of `n` on this ground and tier (the leader's pick, Normal when none); null with no row,
    no line for that tier, or under two heroes. */
export function partyVsAlone(groundId, n, tier = DEFAULT_TIER) {
  if (!Number.isInteger(n) || n < 2 || !Object.hasOwn(PARTY_VS_ALONE, groundId) || !Object.hasOwn(PARTY_VS_ALONE[groundId], tier)) return null;
  const tab = PARTY_VS_ALONE[groundId][tier];
  return tab[Math.min(n, Math.max(...Object.keys(tab).map(Number)))];
}

/** THE MOST A PARTY OF `n` EARNS ON THIS GROUND against the same heroes alone, on the tier that pays it best (PARTY_VS_ALONE), whole percent;
    null under two heroes or with no line. The one reading of "does a party belong here" (lane/a-party-advice-glade): the Hunts window's party
    advice (src/shell/hunt-list.js fitsGroup, at or over 0) and its Next step up on a tie of floors (hunt-tutorial.js nextStepUp) read it. */
export function partyBestLine(groundId, n) {
  if (!Number.isInteger(n) || n < 2) return null;
  const said = tiersOf(groundId).map((tier) => partyVsAlone(groundId, n, tier)).filter(Number.isInteger);
  return said.length ? Math.max(...said) : null;
}

/** Every problem with the tables, as strings. Empty = valid. `grounds`: the ground ids a row may name. */
export function validate(grounds) {
  const out = [];
  /* a hero alone earns more than the pack pays, and at most a fifth over it (Tyler 2026-11-11: +15%; 11-08 'a small exp boost') */
  if (!Number.isInteger(SOLO_XP_PM) || SOLO_XP_PM <= 1000 || SOLO_XP_PM > 1200) out.push('a hero alone earns ' + SOLO_XP_PM + ', not a small boost (1001-1200)');
  /* ONE TABLE BY SIZE (S-10 c): one whole-permille cell for each of 2, 3 and 4 heroes, never smaller for a bigger party */
  if (SIZES.join() !== '2,3,4') out.push('the table names sizes ' + SIZES + ', not 2, 3 and 4');
  for (const n of SIZES) if (!Number.isInteger(PARTY_SIZE_XP[n]) || PARTY_SIZE_XP[n] <= 0) out.push(n + ' heroes: the cell is whole permille > 0');
  for (let i = 1; i < SIZES.length; i++) if (PARTY_SIZE_XP[SIZES[i]] < PARTY_SIZE_XP[SIZES[i - 1]]) out.push(SIZES[i] + ' heroes are paid less than ' + SIZES[i - 1]);
  /* the Party window's measured lines, one per tier a ground offers (lane/d-party-pace): a ground a row may name, a tier it offers, a whole five a size */
  for (const [g, byTier] of Object.entries(PARTY_VS_ALONE)) {
    if (grounds && !grounds.includes(g)) out.push(g + ': the Party window\'s line names no ground');
    for (const [tier, said] of Object.entries(byTier)) {
      if (!TIER_IDS.includes(tier)) { out.push(g + ': the Party window\'s line names no tier ' + tier); continue; }
      if (grounds && !tiersOf(g).includes(tier)) out.push(g + ': the Party window has a line for ' + tier + ', a tier the ground does not offer');
      for (const n of [2, 3, 4]) if (!Number.isInteger(said[n]) || said[n] % 5 !== 0) out.push(g + ' ' + tier + ': ' + n + ' heroes: PARTY_VS_ALONE needs a whole five');
    }
  }
  if (grounds) for (const g of grounds) for (const tier of tiersOf(g)) if (!Object.hasOwn(PARTY_VS_ALONE, g) || !Object.hasOwn(PARTY_VS_ALONE[g], tier)) out.push(g + ': the Party window has no measured line for ' + tier + ' on this ground');
  return out;
}
