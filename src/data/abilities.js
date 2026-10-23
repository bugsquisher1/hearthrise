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
// the mana spent, x1000), rune | null, ammo (shots of the hero's loaded ammo),
// target, effect fields, active, versions?, lvPm? }.
//   rune: the Chalked rune of the spell's FAMILY (runes.js; version I, the item its
//     store row partners): a cast spends one carried rune of that family, the
//     highest tier the hero has unlocked (src/core/hunt/abilities.js runeFor), or the
//     store's when the slot names it. The rune is the family's, never one tier's.
//   lvPm: permille of the row's numbers added per level of its skill above 1
//     (outputPm; the same for every version).
//   target: taunt | mark | enemy | area | cleave | self | ally | party
//   dmg [lo, hi], element (an elements.js id), hits, maxHits, status (a statuses.js id, H3),
//   bonusPct + durMs (mark), shield, heal [lo, hi], whenBelowPct, minHurt,
//   radius (party heal, tiles)
//   versions: a RUNE spell's versions I..V (Tyler 2026-10-23, src/data/runes.js), up to five
//     { mana, outPm }: version N is cast by spending a tier-N rune at level versionLevel(N) in
//     the row's skill (ABILITY_SKILL), costs `mana` and lands `outPm` permille of the row's
//     dmg / heal / shield (numbers only: never its area, targets, duration or cooldown). Mana
//     never grows with level; it may rise between versions (designer d3-manacost). A row with
//     no `versions` casts every version at its own mana and numbers (outPm 1000) until the
//     designer sizes them. `whenBelowPct`, `minHurt` and ABILITY_RULES.areaMin are the
//     conditions a NEW slot of the ability starts with (conditions.js suggestedConditions):
//     shown on the slot, never applied behind it.
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

import { SUPPLIES } from './supplies.js?v=0.2.34';
import { HUNT_TUNING } from './hunt-tuning.js?v=0.2.34';
import { isElement } from './elements.js?v=0.2.34';
import { ITEMS } from './items.js?v=0.2.34';
import { isRune, runeTierOf, RUNE_TIERS } from './runes.js?v=0.2.34';

/* Two ability lanes and their lockouts (Bible §9.1 PROPOSED, AB-02). Food and
   drink keep their own lane (consumables.js). */
export const ABILITY_LANES = Object.freeze({ offense: 2000, heal: 1000 });

export const ABILITY_RULES = Object.freeze({
  /* Mana regenerates 25% of max a minute (designer ruling 2026-10-15, AB-13). */
  manaRegenPctPerMin: 25,
  /* An area ability's suggested trigger: at least this many monsters in its footprint (AB-03; a NEW slot's
     starting condition, suggestedTrigger, never a hidden one). */
  areaMin: 2,
});

/* Which abilities an action set skips (AB-11; presets ASSUMED, spec §3.7). */
export const ACTION_SET_SKIPS = Object.freeze({
  hunt: Object.freeze({ rune: false, area: false }),
  mana_train: Object.freeze({ rune: true, area: false }),
  boss: Object.freeze({ rune: false, area: true }),
});

const ab = (o) => Object.freeze({ rune: null, ammo: 0, magicXpMult: 0, active: true, ...o,
  disciplines: Object.freeze(o.disciplines), ...(o.dmg ? { dmg: Object.freeze(o.dmg) } : {}), ...(o.heal ? { heal: Object.freeze(o.heal) } : {}),
  ...(o.versions ? { versions: Object.freeze(o.versions.map(([mana, outPm]) => Object.freeze({ mana, outPm }))) } : {}) });

/* ── THE VERSION LADDER (Tyler 2026-10-23: versions I-V at level 1/15/30/45/60, each on its tier's rune; mana never
   grows with level but may rise from one version to the next, d3-manacost "perversion"; output grows with level).
   PROVISIONAL: the designer re-tunes every number in the balance phase (p30/p31). The Bible gives none but the
   designer's Greater Mend example (25/30/36/43/52 mana), so each spell's `versions` ([mana, outPm] pairs) follow it:
     mana    x1.2 a version (rounded), version I = the row's mana;
     outPm   1000 / 1300 / 1650 / 2000 / 2350, and `lvPm` 40 (+4% of the row's numbers a level above 1),
   sized so version N at its unlock level lands N's share of a same-level hero's HP scale (vitals: 150 + 10 a Level,
   1.00 / 1.88 / 2.81 / 3.75 / 4.69 of Level 1's): II at 15 = 1860, III at 30 = 2810, IV at 45 = 3760, V at 60 =
   4710. Version I keeps scaling (3360 at 60), the incentive to bind the deeper rune. */
const LV_PM = 40;

export const ABILITIES = Object.freeze([
  /* shield — the tank's Melee */
  ab({ id: 'challenge', n: 'Challenge', disciplines: ['shield'], lane: 'offense', cdMs: 8000, mana: 0, target: 'taunt' }),
  ab({ id: 'flame_strike', n: 'Flame Strike', disciplines: ['shield'], lane: 'offense', cdMs: 8000, mana: 10, rune: 'chalked_fire_rune',
    target: 'enemy', dmg: [8, 14], element: 'ember', magicXpMult: 250,
    versions: [[10, 1000], [12, 1300], [14, 1650], [17, 2000], [21, 2350]], lvPm: LV_PM }),
  ab({ id: 'power_strike', n: 'Power Strike', disciplines: ['shield', 'dual_axe'], lane: 'offense', cdMs: 6000, mana: 6,
    target: 'enemy', dmg: [7, 13] }),
  /* dual axes — Melee DPS */
  ab({ id: 'cleave', n: 'Cleave', disciplines: ['dual_axe'], lane: 'offense', cdMs: 6000, mana: 8, target: 'cleave', dmg: [6, 11], maxHits: 3 }),
  ab({ id: 'rend', n: 'Rend', disciplines: ['dual_axe'], lane: 'offense', cdMs: 6000, mana: 8, rune: 'life_rune', target: 'enemy',
    dmg: [2, 4], hits: 2, status: 'bleed', active: false }),
  /* bow / crossbow — Ranger */
  ab({ id: 'hunters_mark', n: "Hunter's Mark", disciplines: ['ranged'], lane: 'offense', cdMs: 12000, mana: 8, target: 'mark',
    bonusPct: 20, durMs: 8000 }),
  ab({ id: 'flame_volley', n: 'Flame Volley', disciplines: ['ranged'], lane: 'offense', cdMs: 10000, mana: 15, rune: 'chalked_fire_rune', ammo: 3,
    target: 'area', dmg: [5, 9], element: 'ember', magicXpMult: 250 }),
  ab({ id: 'precision_shot', n: 'Precision Shot', disciplines: ['ranged'], lane: 'offense', cdMs: 6000, mana: 6, ammo: 1,
    target: 'enemy', dmg: [7, 12] }),
  /* staff — Mage (destruction) */
  /* Fireball spends mana only (designer 2026-10-21): the Mage's one damage spell must cast with no
     Runecrafting; Flame Strike and Flame Volley keep the Fire Rune as their crafted upgrade. */
  ab({ id: 'fireball', n: 'Fireball', disciplines: ['destruction'], lane: 'offense', cdMs: 8000, mana: 25,
    target: 'area', dmg: [7, 12], element: 'ember', magicXpMult: 1600 }),
  ab({ id: 'frost_lance', n: 'Frost Lance', disciplines: ['destruction'], lane: 'offense', cdMs: 6000, mana: 20, rune: 'frost_rune',
    target: 'enemy', dmg: [12, 18], element: 'frost', magicXpMult: 1600, active: false }),
  ab({ id: 'arcane_barrier', n: 'Arcane Barrier', disciplines: ['destruction'], lane: 'heal', cdMs: 20000, mana: 30, target: 'self',
    shield: 40, whenBelowPct: 85, magicXpMult: 1600 }),
  /* staff — Healer (restoration) */
  ab({ id: 'greater_mend', n: 'Greater Mend', disciplines: ['restoration'], lane: 'heal', cdMs: 2000, mana: 25, target: 'ally',
    heal: [40, 60], whenBelowPct: 70, magicXpMult: 1600 }),
  ab({ id: 'circle_of_renewal', n: 'Circle of Renewal', disciplines: ['restoration'], lane: 'heal', cdMs: 12000, mana: 50, target: 'party',
    heal: [20, 30], whenBelowPct: 80, minHurt: 2, radius: 8, magicXpMult: 1600 }),
  ab({ id: 'natures_wrath', n: "Nature's Wrath", disciplines: ['restoration'], lane: 'offense', cdMs: 10000, mana: 20, target: 'area',
    dmg: [3, 6], magicXpMult: 1600 }),
].reduce((acc, r) => { acc[r.id] = r; return acc; }, Object.create(null)));

const TARGETS = ['taunt', 'mark', 'enemy', 'area', 'cleave', 'self', 'ally', 'party'];
const DISCIPLINES = ['shield', 'dual_axe', 'ranged', 'destruction', 'restoration'];

/* THE SKILL A DISCIPLINE'S VERSIONS LEVEL ON (designer d3-weaponskill "own", Tyler 2026-10-23): a weapon
   ability on its weapon's own skill, a spell on Magic. */
export const DISCIPLINE_SKILL = Object.freeze({ shield: 'melee', dual_axe: 'melee', ranged: 'ranged', destruction: 'magic', restoration: 'magic' });
/** The skill `row`'s versions unlock on. */
export const abilitySkill = (row) => DISCIPLINE_SKILL[row && row.disciplines && row.disciplines[0]] || 'magic';

/** THE TRIGGER A NEW SLOT OF `row` STARTS WITH, as conditions written ON the slot (the role rule sets,
    rule-subjects.js ROLE_RULES, and a slot the player adds: conditions.js suggestedConditions). Never
    applied behind a slot: one with no conditions fires whenever it is ready (Tyler 2026-10-23, c21). */
export function suggestedTrigger(row) {
  if (!row) return [];
  if (row.target === 'self') return [{ metric: 'self_hp_pct', op: 'lt', value: row.whenBelowPct }];
  if (row.target === 'ally') return [{ metric: 'ally_hp_pct', op: 'lt', value: row.whenBelowPct, subject: 'lowest' }];
  if (row.target === 'area') return [{ metric: 'enemies_in_aoe', op: 'gte', value: ABILITY_RULES.areaMin }];
  if (row.target === 'party') return [{ metric: 'allies_below', op: 'gte', value: row.minHurt, subject: 'under_' + row.whenBelowPct }];
  return [];
}

/** Version `n` (1..5) of `row`: { mana, outPm }. A row with no `versions` row for it casts at its own mana and numbers. */
export function versionOf(row, n) {
  const v = row && Array.isArray(row.versions) ? row.versions[n - 1] : null;
  return v ? { mana: v.mana, outPm: v.outPm } : { mana: row ? row.mana : 0, outPm: 1000 };
}

/** WHAT VERSION `n` OF `row` LANDS AT LEVEL `level` in the row's skill, in permille of the row's numbers (Tyler
    2026-10-23, d-scaling: "the first heal tier should scale up with magic level, the next tier a higher base heal,
    same scaling"): the version's own `outPm` plus the row's `lvPm` for every level above 1. The mana never grows
    with level (versionOf). A row with no `lvPm` lands at its version's numbers at every level. */
export function outputPm(row, n, level) {
  const lv = Number.isInteger(level) && level > 1 ? level : 1;
  return versionOf(row, n).outPm + (row && Number.isInteger(row.lvPm) ? row.lvPm * (lv - 1) : 0);
}

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
    /* One vocabulary (elements.js): a name outside it would match no weakness, resist or immunity. */
    if ('element' in r && !isElement(r.element)) bad('unknown element ' + r.element);
    /* No ability may name a missing item (spec §1.2): an active rune is a carried supply line of a rune family. */
    if (r.rune && r.active && !(SUPPLIES[r.rune] && SUPPLIES[r.rune].kind === 'ammo' && isRune(ITEMS[r.rune]))) bad('rune ' + r.rune + ' is not a carried rune line');
    /* The family's version-I rune: the one its store row partners (a cast spends any tier of the family). */
    if (r.rune && r.active && runeTierOf(ITEMS[r.rune]) !== 1) bad('rune ' + r.rune + ' is not its family\'s Chalked rune');
    if (r.lvPm !== undefined && !(Number.isInteger(r.lvPm) && r.lvPm >= 0)) bad('lvPm must be an integer >= 0');
    if (new Set(r.disciplines.map((d) => DISCIPLINE_SKILL[d])).size !== 1) bad('its disciplines level on different skills');
    if (r.versions !== undefined) {
      const vs = r.versions;
      if (!r.rune) bad('only a rune spell has versions');
      if (!Array.isArray(vs) || !vs.length || vs.length > RUNE_TIERS.length) bad('versions must list 1..' + RUNE_TIERS.length);
      else vs.forEach((v, i) => {
        const prev = i ? vs[i - 1] : { mana: 0, outPm: 1000 };
        if (!v || !Number.isInteger(v.mana) || !Number.isInteger(v.outPm) || v.mana < prev.mana || v.outPm < prev.outPm) bad('version ' + (i + 1) + ' must cost and land at least version ' + i + "'s (whole mana, permille)");
      });
      if (Array.isArray(vs) && vs[0] && vs[0].mana !== r.mana) bad("version I's mana is the row's mana");
    }
  }
  for (const [d, n] of Object.entries(per)) if (n !== 3) out.push(d + ' has ' + n + ' abilities, not 3');
  return out;
}
