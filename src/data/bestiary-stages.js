// ════════════════════════════════════════════════════════════════════════
// src/data/bestiary-stages.js — THE ACCOUNT BESTIARY'S STAGES (Tyler 2026-10-19)
//
// The bestiary is ACCOUNT-wide: every character of one account adds to the
// same kill count per monster (server: public.account_bestiary, counted by the
// hunt settle). At 1,250 / 2,500 / 5,000 / 10,000 kills a monster reaches a
// stage; a reached stage is ACTIVATED with a small gold fee, and an activated
// stage raises that monster's RELIC drop chance by a relative multiplier:
// x1.05 / x1.12 / x1.18 / x1.25. Nothing else: no XP, no damage, no rare-tier
// boost. Gold never skips kills: a stage is activated only once its kills are
// reached, and only the next one after the last activated.
//
// THE RELIC TIER. A hunt's rare-carrier monster drops two tiers: RARE
// (about 1 per 10-20 h) and RELIC (about 1 per 100-150 h, hunt-grounds.js band
// D). A drop row is a relic when it carries `tier: 'relic'`
// (src/data/monsters.js); src/core/drops.js applies the multiplier to those
// rows ONLY. No shipped row carries it yet (the relic items are the content
// lane's), so today every monster shows its stages and says it has no relic.
//
// THE FEE (the server's price; the client only shows it):
//   fee(stage, level) = feeMult(stage) x (base + perLevel x level)
// where `level` is the MONSTER's level (monsters.js monsterLevelOf; server
// hr_monster_level), never the paying character's: the bonus is the account's,
// so a low-level alt must not buy it cheaper. Stage 1 of a level-2 Giant Rat is
// 300 g, stage 4 of the level-52 Chief Coppercap 22,400 g.
//
// ONE SOURCE: tools/gen-bestiary-catalogue.mjs generates hr_bestiary_stages /
// hr_bestiary_fee / hr_bestiary_monsters from this file (`--check` fails on
// drift). The multiplier is stored as an integer permille so SQL and JS agree
// to the digit.
//
// PURE ESM. Data + pure derivation; no imports, no clock, no Math.random.
// ════════════════════════════════════════════════════════════════════════

/** The ladder, ascending. `kills` is the account's total against ONE monster. */
export const BESTIARY_STAGES = Object.freeze([
  Object.freeze({ stage: 1, kills: 1250, relicPermille: 1050, feeMult: 1 }),
  Object.freeze({ stage: 2, kills: 2500, relicPermille: 1120, feeMult: 2 }),
  Object.freeze({ stage: 3, kills: 5000, relicPermille: 1180, feeMult: 4 }),
  Object.freeze({ stage: 4, kills: 10000, relicPermille: 1250, feeMult: 8 }),
]);

/** The activation fee's level term (gold). See the header for the formula. */
export const BESTIARY_FEE = Object.freeze({ base: 200, perLevel: 50 });

/** The drop-row field value that marks a relic. */
export const RELIC_TIER = 'relic';

/** The largest relic multiplier any stage pays: the engine's clamp. */
export const MAX_RELIC_MULT = BESTIARY_STAGES[BESTIARY_STAGES.length - 1].relicPermille / 1000;

/** The stage `kills` reaches: 0 below the first rung, else 1..4. */
export function stageAt(kills) {
  const n = Number(kills);
  let s = 0;
  if (!Number.isFinite(n)) return 0;
  for (const r of BESTIARY_STAGES) if (n >= r.kills) s = r.stage;
  return s;
}

/** The relic multiplier an ACTIVATED stage pays (1 for none or an unknown stage). */
export function relicMultFor(activatedStage) {
  const r = BESTIARY_STAGES.find((x) => x.stage === activatedStage);
  return r ? r.relicPermille / 1000 : 1;
}

/** The gold fee to activate `stage` of a monster of `level`, or null for no such stage. Integers in, integer out. */
export function stageFee(stage, level) {
  const r = BESTIARY_STAGES.find((x) => x.stage === stage);
  if (!r) return null;
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return r.feeMult * (BESTIARY_FEE.base + BESTIARY_FEE.perLevel * lv);
}

/** Does this monster row carry a relic drop? */
export function hasRelic(row) {
  return !!row && Array.isArray(row.drops) && row.drops.some((d) => d && d.tier === RELIC_TIER);
}

/** Every problem with the tables, as strings. Empty = valid. */
export function validate() {
  const out = [];
  BESTIARY_STAGES.forEach((r, i) => {
    if (r.stage !== i + 1) out.push('stage ' + r.stage + ' is out of order');
    if (!Number.isInteger(r.kills) || r.kills < 1) out.push('stage ' + r.stage + ' needs a positive whole kill count');
    if (!Number.isInteger(r.relicPermille) || r.relicPermille <= 1000 || r.relicPermille > 2000) out.push('stage ' + r.stage + ' relic permille must be 1001..2000');
    if (!Number.isInteger(r.feeMult) || r.feeMult < 1) out.push('stage ' + r.stage + ' fee multiple must be a positive integer');
    const p = BESTIARY_STAGES[i - 1];
    if (p && (r.kills <= p.kills || r.relicPermille <= p.relicPermille || r.feeMult < p.feeMult)) {
      out.push('stage ' + r.stage + ' must need more kills and pay more than stage ' + p.stage);
    }
  });
  for (const k of ['base', 'perLevel']) {
    if (!Number.isInteger(BESTIARY_FEE[k]) || BESTIARY_FEE[k] < 0) out.push('fee ' + k + ' must be a whole number of gold');
  }
  if (!(BESTIARY_FEE.base > 0)) out.push('the fee must cost something');
  return out;
}
