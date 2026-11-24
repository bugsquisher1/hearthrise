// ════════════════════════════════════════════════════════════════════════
// src/data/base-drops.js — EVERY STEP TIER'S BASE DROPS ON ITS HOME GROUNDS (systems, lane/gear-phase-b, 2026-11-23).
//
// docs/design/redesign/12-targets.md 3.3 ("the gear base is fixed by the ground", drops with a home), 27-formula-overhaul.md G-2 phase B,
// src/data/drop-hours.js (drops authored in hunted hours). A step tier (src/data/gear-tiers.js STEP_TIERS) names its `homes`; each home drops
// the tier's whole plain base, every armor piece of the three weights, every weapon family's rung, the codex and the shield, as the ground's
// OWN drop rows (src/data/hunt-grounds.js folds them onto the ground row's `drops`, after any rows it already has, so no earlier draw on the
// seeded stream moves: src/core/hunt/play-rows.js groundDropsOn). The jewels and the cloak are made, never dropped (slot-ladders.js STEP_MADE).
//
// A ROW is { id, everyHours, ch, band: 'scarce' }: one in about `everyHours` hunted hours a hero of the reference party at the ground's
// reference step (drop-hours.js chanceOf over the ground's DANGER_GROUNDS refKillsHead; a home off the scale reads PAY.refKillsHead, the
// server's one ceiling a kill, until R10 gives it its own). The plain rung of the rarity ladder is the Scarce band (DROP_HOURS.rarity.plain).
//
// STARTING VALUE, NOT A RULING (the designer's lever; in band is enough): EVERY_HOURS 1.5, the plain band's slowest end, so a home's base
// arrives about a piece a slot a weight every hour and a half and its hourly gold stays inside the ground's value rules (the lane's report).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { MATERIAL_TIERS, STEP_MATERIALS, GEAR_LADDERS } from './gear-tiers.js';
import { SHIELD_ITEMS } from './shields.js';
import { DANGER_GROUNDS, PAY } from './danger.js';
import { DROP_HOURS, chanceOf, roundChance } from './drop-hours.js';
import { GROUND_PACKS } from './grounds/index.js';
import { MONSTERS } from './monsters.js';

/* STATED: hunted hours a hero to one plain base piece, per piece (the header) */
export const EVERY_HOURS = 1.5;

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/** The dropped pieces of step tier `mat`, in ladder order (every GEAR_LADDERS rung at its tier, then its shield). */
export function basePiecesOf(mat) {
  const i = MATERIAL_TIERS.indexOf(mat);
  const ids = GEAR_LADDERS.map((l) => l.ids[i]).filter(Boolean);
  for (const [id, it] of Object.entries(SHIELD_ITEMS)) if (it.step === mat.step) ids.push(id);
  return ids;
}

/** The pieces the bodies of a home ground's pack drop on their own rows (empty for a ground cut from another pack's rooms, the wings). */
function ownDrops(ground) {
  const pack = GROUND_PACKS.find((x) => x.id === ground);
  const out = new Set();
  if (!pack || !pack.ground) return out;
  for (const pk of pack.ground.pockets || []) for (const sp of (pk.pack || []).concat(pk.spawns || [], pk.adds || [])) {
    for (const d of ((pack.monsters || {})[sp.monster] || MONSTERS[sp.monster] || {}).drops || []) out.add(d.id);
  }
  return out;
}

/** The kills a head an hour a home's rows are converted at: its scale row's reference, else the server's one ceiling. */
const killsOf = (ground) => (own(DANGER_GROUNDS, ground) && Number(DANGER_GROUNDS[ground].refKillsHead) > 0 ? DANGER_GROUNDS[ground].refKillsHead : PAY.refKillsHead);

/** ground id -> its base drop rows (frozen), for every step tier that names it a home. */
export const BASE_DROPS = Object.freeze((() => {
  const out = {};
  for (const mat of STEP_MATERIALS) for (const g of mat.homes) {
    /* a piece one of the home's own bodies already drops keeps that row alone (the Ox Road's Dawnsteel weapons, Carter's Rest's Emberforged
       boots, gloves, legs and belts): one source a ground, never two rates for one piece */
    const own = ownDrops(g);
    const rows = basePiecesOf(mat).filter((id) => !own.has(id)).map((id) => {
      const everyHours = Number(EVERY_HOURS.toPrecision(DROP_HOURS.chDigits));
      return Object.freeze({ id, everyHours, ch: roundChance(chanceOf(everyHours, killsOf(g))), band: 'scarce' });
    });
    out[g] = Object.freeze([...(out[g] || []), ...rows]);
  }
  return out;
})());

/** Every item a home drops as its base (item-authority.js counts them as combat drops). */
export const BASE_DROP_IDS = Object.freeze([...new Set(Object.values(BASE_DROPS).flat().map((d) => d.id))]);
