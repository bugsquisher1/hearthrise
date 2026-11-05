// ════════════════════════════════════════════════════
// src/session/temper-sections.js — TEMPERING AS THE SERVER STATES IT, FOR WHAT THIS HERO WEARS.
//
// Reads the envelope's `temper` section (hr_temper_view, 2027-02-27-tempering.sql): each ladder, this hero's rung, the next
// rung's offer at the server's price. Every envelope replaces it and nothing here holds a number of its own: what a rung is
// worth is the one rule the fight uses (src/core/temper.js), read over the server's rungs and the server's worn set.
// ════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.91';
import { TEMPER_TIERS, temperUnlockId } from '../data/temper.js?v=0.2.91';
import { armourLineWord } from '../data/gear-tiers.js?v=0.2.91';
import { armorLineOf, armorPmOf, blowsPmOf } from '../core/temper.js?v=0.2.91';
import { equipmentOf } from './item-sections.js?v=0.2.91';

const count = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : null);

/** The section: [{ track, tier, rung, max, offer, gold }], with no next rung at the top of a ladder; null until the server has said. */
export function temperOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('temper') : null;
  if (!Array.isArray(s)) return null;
  const out = [];
  for (const l of s.slice(0, 40)) {
    if (!l || typeof l.track !== 'string' || !Number.isInteger(l.tier) || count(l.rung) === null || count(l.max) === null) continue;
    const sold = typeof l.offer === 'string' && count(l.gold) !== null;
    out.push({ track: l.track, tier: l.tier, rung: l.rung, max: l.max, offer: sold ? l.offer : null, gold: sold ? l.gold : null });
  }
  return out;
}

/* Gear under the first ladder (Bronze and its kin), as against gear past the last. */
const belowLadders = (tier) => Number.isFinite(tier) && tier < Math.min(...Object.keys(TEMPER_TIERS).map(Number));
const mapOf = (ladders) => Object.fromEntries(ladders.map((l) => [temperUnlockId(l.track, l.tier), l.rung]));

/**
 * The two rows the smith's window shows: { blows, armor }, each { piece, below, ladder, nowPm, nextPm } for what this hero wears now,
 * `ladder` null on gear with none (`below`: under the first ladder), `piece` null when it wears nothing of the kind. Null until the server has said.
 */
export function temperRowsOf(cs) {
  const ladders = temperOf(cs), eq = /** @type {Record<string, string> | null} */ (equipmentOf(cs));
  if (!ladders || !eq) return null;
  const map = mapOf(ladders);
  const ladderOf = (track, tier) => ladders.find((l) => l.track === track && l.tier === tier) || null;
  const nextOf = (ladder, pmOf) => (ladder && ladder.offer ? pmOf({ ...map, [temperUnlockId(ladder.track, ladder.tier)]: ladder.rung + 1 }) : null);
  const weapon = eq.weapon ? ITEMS[eq.weapon] : null;
  const blowsLadder = weapon ? ladderOf('blows', weapon.tier) : null;
  const line = armorLineOf(eq, ITEMS);
  const armorLadder = line ? ladderOf('armor', line.tier) : null;
  const worn = line ? armourLineWord(line.armourClass, line.tier) : null;
  return {
    blows: { piece: weapon ? weapon.n : null, below: !!weapon && belowLadders(weapon.tier), ladder: blowsLadder, nowPm: blowsPmOf(eq, ITEMS, map), nextPm: nextOf(blowsLadder, (m) => blowsPmOf(eq, ITEMS, m)) },
    armor: { piece: line ? (worn ? worn + ' armor' : 'armor') : null, below: !!line && belowLadders(line.tier), ladder: armorLadder, nowPm: armorPmOf(eq, ITEMS, map), nextPm: nextOf(armorLadder, (m) => armorPmOf(eq, ITEMS, m)) },
  };
}

/** What the smith's rungs do for this hero as worn now: { blowsPm, armorPm }, or null when nothing. */
export function temperNowOf(cs) {
  const r = temperRowsOf(cs);
  return r && (r.blows.nowPm > 0 || r.armor.nowPm > 0) ? { blowsPm: r.blows.nowPm, armorPm: r.armor.nowPm } : null;
}

/** The first rung of a ladder this hero has never touched, for the What next line: { piece, gold }, or null. Once a ladder is begun the coach says no more of it. */
export function temperFirstRungOf(cs) {
  const r = temperRowsOf(cs);
  if (!r) return null;
  for (const row of [r.blows, r.armor]) if (row.ladder && row.ladder.rung === 0 && row.ladder.offer) return { piece: row.piece, gold: row.ladder.gold };
  return null;
}
