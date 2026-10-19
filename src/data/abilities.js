// ════════════════════════════════════════════════════════════════════════
// src/data/abilities.js — THE ACTION BAR'S ABILITIES (HUNT_SCREEN_SPEC §1.2;
// architecture contracts §1.1; parity AB-01..AB-17)
//
// Three abilities per discipline (Tyler 2026-10-15). A discipline is the
// WEAPON's, never a vocation (Tyler 2026-10-16): shield = the tank's Melee,
// dual axes = Melee DPS, bow/crossbow = Ranger, staff = Mage (destruction) or
// Healer (restoration). Hunts are idle: the bar is configuration, the first
// usable ability in bar order fires (AB-10, AB-17).
//
// THE ROW. { id, n, disciplines[], lane, cdMs, mana, magicXpMult (permille of
// the mana spent, x1000), rune (an item id the cast spends) | null, ammo (shots
// of the hero's loaded ammo) , target, effect fields, active }.
//   target: taunt | mark | enemy | area | cleave | self | ally | party
//   dmg [lo, hi], hits, maxHits, status (a statuses.js id, H3), vuln,
//   bonusPct + durMs (mark), shield, heal [lo, hi], whenBelowPct, minHurt,
//   radius (party heal, tiles)
// `active: false` holds a row whose rune is not a carried supply yet: no
// ability may name an item a hunt bag cannot hold (spec §1.2). Rend waits on
// the Life rune and Frost Lance on a Frost rune line (other lanes).
//
// Numbers: designer ruling 2026-10-15 via the hunt sim (combat-data.js, a
// SPEC — never source); names and every number are the Game Designer's to
// retune here. Integer ms and percent only.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { SUPPLIES } from './supplies.js?v=0.2.4';
import { HUNT_TUNING } from './hunt-tuning.js?v=0.2.4';

/* Two ability lanes and their lockouts (Bible §9.1 PROPOSED, AB-02). Food and
   drink keep their own lane (consumables.js). */
export const ABILITY_LANES = Object.freeze({ offense: 2000, heal: 1000 });

export const ABILITY_RULES = Object.freeze({
  /* Mana regenerates 25% of max a minute (designer ruling 2026-10-15, AB-13). */
  manaRegenPctPerMin: 25,
  /* Vulnerability lasts 6 s (designer ruling 2026-10-15; damage.js reads it). */
  vulnMs: 6000,
  /* An area ability needs at least this many monsters it can hurt (AB-03). */
  areaMin: 2,
});

/* Which abilities an action set skips (AB-11; presets ASSUMED, spec §3.7). */
export const ACTION_SET_SKIPS = Object.freeze({
  hunt: Object.freeze({ rune: false, area: false }),
  mana_train: Object.freeze({ rune: true, area: false }),
  boss: Object.freeze({ rune: false, area: true }),
});

const ab = (o) => Object.freeze({ rune: null, ammo: 0, magicXpMult: 0, active: true, ...o,
  disciplines: Object.freeze(o.disciplines), ...(o.dmg ? { dmg: Object.freeze(o.dmg) } : {}), ...(o.heal ? { heal: Object.freeze(o.heal) } : {}) });

export const ABILITIES = Object.freeze([
  /* shield — the tank's Melee */
  ab({ id: 'challenge', n: 'Challenge', disciplines: ['shield'], lane: 'offense', cdMs: 8000, mana: 0, target: 'taunt' }),
  ab({ id: 'flame_strike', n: 'Flame Strike', disciplines: ['shield'], lane: 'offense', cdMs: 8000, mana: 10, rune: 'fire_rune',
    target: 'enemy', dmg: [8, 14], element: 'fire', magicXpMult: 250 }),
  ab({ id: 'power_strike', n: 'Power Strike', disciplines: ['shield', 'dual_axe'], lane: 'offense', cdMs: 6000, mana: 6,
    target: 'enemy', dmg: [7, 13] }),
  /* dual axes — Melee DPS */
  ab({ id: 'cleave', n: 'Cleave', disciplines: ['dual_axe'], lane: 'offense', cdMs: 6000, mana: 8, target: 'cleave', dmg: [6, 11], maxHits: 3 }),
  ab({ id: 'rend', n: 'Rend', disciplines: ['dual_axe'], lane: 'offense', cdMs: 6000, mana: 8, rune: 'life_rune', target: 'enemy',
    dmg: [2, 4], hits: 2, status: 'bleed', active: false }),
  /* bow / crossbow — Ranger */
  ab({ id: 'hunters_mark', n: "Hunter's Mark", disciplines: ['ranged'], lane: 'offense', cdMs: 12000, mana: 8, target: 'mark',
    bonusPct: 20, durMs: 8000 }),
  ab({ id: 'flame_volley', n: 'Flame Volley', disciplines: ['ranged'], lane: 'offense', cdMs: 10000, mana: 15, rune: 'fire_rune', ammo: 3,
    target: 'area', dmg: [5, 9], element: 'fire', magicXpMult: 250 }),
  ab({ id: 'precision_shot', n: 'Precision Shot', disciplines: ['ranged'], lane: 'offense', cdMs: 6000, mana: 6, ammo: 1,
    target: 'enemy', dmg: [7, 12] }),
  /* staff — Mage (destruction) */
  ab({ id: 'fireball', n: 'Fireball', disciplines: ['destruction'], lane: 'offense', cdMs: 8000, mana: 25, rune: 'fire_rune',
    target: 'area', dmg: [7, 12], element: 'fire', magicXpMult: 1000 }),
  ab({ id: 'frost_lance', n: 'Frost Lance', disciplines: ['destruction'], lane: 'offense', cdMs: 6000, mana: 20, rune: 'frost_rune',
    target: 'enemy', dmg: [12, 18], element: 'frost', magicXpMult: 1000, active: false }),
  ab({ id: 'arcane_barrier', n: 'Arcane Barrier', disciplines: ['destruction'], lane: 'heal', cdMs: 20000, mana: 30, target: 'self',
    shield: 40, whenBelowPct: 85, magicXpMult: 1000 }),
  /* staff — Healer (restoration) */
  ab({ id: 'greater_mend', n: 'Greater Mend', disciplines: ['restoration'], lane: 'heal', cdMs: 2000, mana: 25, target: 'ally',
    heal: [40, 60], whenBelowPct: 70, magicXpMult: 1000 }),
  ab({ id: 'circle_of_renewal', n: 'Circle of Renewal', disciplines: ['restoration'], lane: 'heal', cdMs: 12000, mana: 50, target: 'party',
    heal: [20, 30], whenBelowPct: 80, minHurt: 2, radius: 8, magicXpMult: 1000 }),
  ab({ id: 'natures_wrath', n: "Nature's Wrath", disciplines: ['restoration'], lane: 'offense', cdMs: 10000, mana: 30, target: 'area',
    dmg: [3, 6], element: 'nature', vuln: true, magicXpMult: 1000 }),
].reduce((acc, r) => { acc[r.id] = r; return acc; }, Object.create(null)));

const TARGETS = ['taunt', 'mark', 'enemy', 'area', 'cleave', 'self', 'ally', 'party'];
const DISCIPLINES = ['shield', 'dual_axe', 'ranged', 'destruction', 'restoration'];

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  const step = HUNT_TUNING.stepMs;
  for (const [lane, ms] of Object.entries(ABILITY_LANES)) if (!Number.isInteger(ms) || ms <= 0 || ms % step) out.push('lane ' + lane + ' ' + ms + ' ms is not a whole number of sub-steps');
  const per = Object.fromEntries(DISCIPLINES.map((d) => [d, 0]));
  for (const r of Object.values(ABILITIES)) {
    const bad = (m) => out.push(r.id + ': ' + m);
    if (!ABILITY_LANES[r.lane]) bad('unknown lane ' + r.lane);
    if (!TARGETS.includes(r.target)) bad('unknown target ' + r.target);
    if (!Number.isInteger(r.cdMs) || r.cdMs <= 0 || r.cdMs % step) bad('cdMs is not a whole number of sub-steps');
    for (const k of ['mana', 'ammo', 'magicXpMult']) if (!Number.isInteger(r[k]) || r[k] < 0) bad(k + ' must be an integer >= 0');
    for (const d of r.disciplines) { if (!(d in per)) bad('unknown discipline ' + d); else per[d]++; }
    for (const k of ['dmg', 'heal']) if (r[k] && !(r[k].length === 2 && r[k].every(Number.isInteger) && r[k][0] > 0 && r[k][0] <= r[k][1])) bad(k + ' must be [lo, hi]');
    if (['enemy', 'area', 'cleave'].includes(r.target) && !r.dmg) bad('a damaging target with no dmg');
    if (['ally', 'party'].includes(r.target) && !r.heal) bad('a heal target with no heal');
    /* No ability may name a missing item (spec §1.2): an active rune is a carried ammo line. */
    if (r.rune && r.active && !(SUPPLIES[r.rune] && SUPPLIES[r.rune].kind === 'ammo')) bad('rune ' + r.rune + ' is not a carried supply line');
  }
  for (const [d, n] of Object.entries(per)) if (n !== 3) out.push(d + ' has ' + n + ' abilities, not 3');
  return out;
}
