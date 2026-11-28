// ════════════════════════════════════════════════════════════════════════
// src/data/imbue-rules.js — IMBUEMENTS: three a hero, an Edge on the weapon, a Ward on the body, a Leech on the helmet, each made from a
// part monsters drop on ANOTHER ground and lasting 20 hunted hours while worn (systems, lane/flame-temper-build, 2026-11-22; the sample
// re-homed onto the grounds v0.3.0 opens by the game designer, lane/tp-im-steps, 2026-11-26; docs/design/redesign/21-flame-temper-imbue-loot.md
// section 3, rulings D-11 and D-12).
//
// A ROW: { id, name, kind ('edge' | 'ward' | 'leech'), raises ('offense' | 'defense' | 'heal' | 'mana'), when (a condition the fight
// reads: the role of the monster struck, `target_role`, or the element of a blow taken, `hit_element`; null for a rule that answers
// itself: a conversion or a leech), key (the stacking key: one of a key counts, and never a Trait's key, which tests/imbue.mjs IM-1 holds since the Traits are hidden data no
// src file but gear-steps.js imports), part (an item id: the part it is
// made from, a body's own drop on its pack), best ({ ground, seat }: where its 2 steps are sized, 04 guard 1), tip (the tooltip, {pct} the
// hero's own number), and the rule fields convert / leech where they apply }. The slot is the kind's (IMBUE_SLOTS). D-8: no row keys on a
// monster family.
// THE BAND of a made imbuement is its part's: the entry Level of the ground whose pack carries the part (imbueBandOf). A hero above it gets
// it weaker by the contest curve, and a hero more than wearAhead under it cannot wear it (src/core/imbue.js imbueStepsAt).
// THE RECIPE is the row plus the levers below: `parts` of its one named part, `remains` of Remains, workPm of an Artificing hero's hour
// (src/core/imbue.js imbueRecipe). No row holds a count or a price.
//
// SIZE (21 D-16, D-17, lane/designer-imbue-calls 2026-11-27). Every row is RATED imbueSteps (2) averaged over its best cell, whole at every
// Level (the consumable slice takes no ramp: src/data/power-ledger.js). A conditional row FIRES at `fire` steps on a blow its condition holds
// on: 2 over the MEASURED share of its best cell that the condition touches, a whole number, at most IMBUE.fireMax (one tier), and that is
// the number its card shows. THE ROOM RULE (21 D-11): a worn imbuement takes its RATED 2 steps of the slice's room on every blow, firing
// or not, so three fill the cap of 6 and a draught or a damage meal adds nothing on top (21 D-1's no dead buy); a firing row counts its
// `fire` steps over its own room (the clamp's room field: HANDOFFS 2026-11-27 designer-imbue-calls item 1, owed; until it lands the engine
// fires the rated 2).
// A LEECH (D-18) heals the wearer `leech.pm` permille of the HP each of its blows takes (mana for a Mana Leech), through the heal cut, never
// past max, the fraction carried to the next blow so a small hit still pays; it takes its room and no steps. A CONVERSION (Fire Edge, D-18)
// resolves `convert.sharePm` of each blow against the target's percent for its element in place of the blow's own: one offense row of
// stepsOf(1 + share x (that percent / the blow's - 1)) steps, a gain on a target weak to it, a whole cost on one that resists it. Both owed
// in the engine (HANDOFFS item 2).
// LIFE. Quality sets life, not strength (D-7): plain 20, fine 25, master 30 hunted hours (lifeRungPm 250 a rung over plain).
//
// v0.3.0 (21 D-12). Every row's part and best ground is on a ground v0.3.0 opens (a pack with status 'open'), so a company can make an
// Edge, a Ward and a Leech in this release. The staged grounds' parts (Coal Tongs, Fire Gland, Leech Jaw) bring higher-band rows when
// their grounds open.
//
// DARK. The made imbuement is a stack of the item `imbue_<id>` (imbueItemOf), which is not an item yet: Artificing's job slice (09
// section 6) makes it, and its rows ship with the bench. Until then the server's apply verb (hr_imbue_apply) refuses `imbue_owed`, and
// the whole surface sits behind the hr_flags switch `imbuements` (off at apply). The fight reads a hero's `wornImbues` (the server's
// projection of hero_worn_imbue, owed: HANDOFFS 2026-11-26 TP and IM); nothing hands one while it is dark. tests/imbue.mjs holds the rows.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { GROUND_PACKS } from './grounds/index.js';
import { MONSTER_ROLES } from './monster-roles.js';
import { ELEMENTS } from './elements.js';

export const IMBUE = Object.freeze({
  hours: 20,
  steps: 2,
  /* the most a conditional row fires at on one blow: one tier of steps (04 guard 3, GEAR_STEPS.conditionalStepsMax) */
  fireMax: 20,
  lifeRungPm: 250,
  parts: 5,
  remains: 4,
  feeHoursPm: 400,
  /* work-hours of an Artificing hero a make, in permille (09 4.3: 0.53 work-hours each for 20 hunted hours) */
  workPm: 530,
  qualities: Object.freeze(['plain', 'fine', 'master']),
});

/* the equip slot each kind sits in (21 section 3.2): one of each kind a hero, a new one replaces the old */
export const IMBUE_SLOTS = Object.freeze({ edge: 'weapon', ward: 'body', leech: 'helmet' });

const row = (r) => Object.freeze({ convert: null, leech: null, fire: null, ...r, best: Object.freeze(r.best), when: r.when ? Object.freeze(r.when) : null });
/* THE SAMPLE OF FIVE (21 section 3.3, re-homed 2026-11-26 by D-12). The element is the data's word ('ember', shown as Fire:
   src/data/text/monster.js el_ember). Fire Ward: Krell's Hold casts Hot Pitch, Rake the Coals and Hall Fire, all ember, and river weed from
   the Ford wards it. Fire Edge: Muster Barrows is five Undead of five, and Undead take more Fire; a Stoker's rake tine from Pyre Field.
   Life Leech: Krell's Hold's long fights on big bodies; a Mudlark's hook from the Slake. Brute Edge and Mana Leech keep 21's parts.
   THE FIRE SIZES are MEASURED (21 section 11, v1-climb's base cells, 12 seeds x 8 h): Muster's brutes take 43.8% of the hammer's damage, so
   Brute Edge fires at 5 (2 / 0.438); on Krell's Hold the back row takes 17.4 to 17.7% of its damage as Fire and the front only 1.5%, so the
   Ward is the back row's and fires at 11 (2 / 0.175). Life Leech's 20 permille returns 2 steps of the front's damage taken there (it takes
   272,800 HP an hour and deals 101,300). */
export const IMBUE_RULES = Object.freeze({
  fire_ward: row({ name: 'Fire Ward', kind: 'ward', raises: 'defense', when: { metric: 'hit_element', eq: 'ember' }, key: 'ward_fire', fire: 11,
    part: 'ford_weed', best: { ground: 'krells_hold', seat: 'back' }, tip: '−{pct}% Fire damage taken' }),
  fire_edge: row({ name: 'Fire Edge', kind: 'edge', raises: 'offense', when: null, key: 'edge_fire', convert: { element: 'ember', sharePm: 50 },
    part: 'rake_tine', best: { ground: 'muster_barrows', seat: 'any' }, tip: '{pct}% of damage dealt as Fire' }),
  brute_edge: row({ name: 'Brute Edge', kind: 'edge', raises: 'offense', when: { metric: 'target_role', eq: 'brute' }, key: 'edge_brute', fire: 5,
    part: 'pike_ferrule', best: { ground: 'muster_barrows', seat: 'melee' }, tip: '+{pct}% damage vs Brutes' }),
  life_leech: row({ name: 'Life Leech', kind: 'leech', raises: 'heal', when: null, key: 'leech_life', leech: { of: 'hp', pm: 20 },
    part: 'mudlark_hook', best: { ground: 'krells_hold', seat: 'melee' }, tip: 'Life Leech {pct}%' }),
  mana_leech: row({ name: 'Mana Leech', kind: 'leech', raises: 'mana', when: null, key: 'leech_mana', leech: { of: 'mana', pm: 10 },
    part: 'urn_shard', best: { ground: 'pyre_field', seat: 'mage' }, tip: 'Mana Leech {pct}%' }),
});

/* the ground whose pack carries an item, that ground's entry Level (its hunt's band floor) and whether v0.3.0 opens it */
const PART_HOME = (() => {
  const out = new Map();
  for (const p of GROUND_PACKS) for (const id of Object.keys(p.items || {})) if (!out.has(id)) out.set(id, { ground: p.id, band: p.hunt.band[0], open: p.status === 'open' });
  return out;
})();
const OPEN_GROUNDS = new Set(GROUND_PACKS.filter((p) => p.status === 'open').map((p) => p.id));
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
/* what a condition may name: a role the monsters play, an element a blow carries (anything else would never hold) */
const METRICS = Object.freeze({ target_role: (v) => own(MONSTER_ROLES, v), hit_element: (v) => ELEMENTS.includes(v) });

/** The item a made imbuement is: one stack an imbuement id (its band and quality ride the stack, 21 section 3.4). */
export const imbueItemOf = (id) => 'imbue_' + id;

/** The band of an imbuement made from its part: the entry Level of the part's home ground (null for a part no pack carries). */
export const imbueBandOf = (id) => {
  const r = own(IMBUE_RULES, id) ? IMBUE_RULES[id] : null;
  const home = r ? PART_HOME.get(r.part) : null;
  return home ? home.band : null;
};

/** The imbuement parts, item id -> the imbuement ids it makes (catalogue-coherence's use for the part). */
export const imbuePartUses = () => {
  const out = new Map();
  for (const [id, r] of Object.entries(IMBUE_RULES)) out.set(r.part, [...(out.get(r.part) || []), id]);
  return out;
};

/** Every problem with the rows (the table, or a planted copy), as text; [] when sound (tests/imbue.mjs; tools/gen-flame-temper.mjs refuses to write on any). */
export function validateImbues(rows = IMBUE_RULES) {
  const out = [];
  for (const [id, r] of Object.entries(rows)) {
    if (!own(IMBUE_SLOTS, r.kind)) out.push(id + ': kind ' + r.kind + ' has no slot');
    if (!['offense', 'defense', 'heal', 'mana'].includes(r.raises)) out.push(id + ': raises ' + r.raises);
    if (r.when && r.when.metric === 'in_fight') out.push(id + ': an imbuement is conditional by construction, never in_fight');
    else if (r.when && /family/.test(r.when.metric)) out.push(id + ': no imbuement keys on a monster family (D-8)');
    else if (r.when && !(own(METRICS, r.when.metric) && METRICS[r.when.metric](r.when.eq))) out.push(id + ': condition ' + r.when.metric + ' ' + r.when.eq + ' matches nothing the fight has');
    if (!r.when && !r.convert && !r.leech) out.push(id + ': no condition and no rule: it would be a flat number (04 guard 2)');
    if (r.when && !(Number.isInteger(r.fire) && r.fire >= IMBUE.steps && r.fire <= IMBUE.fireMax)) out.push(id + ': a condition fires at ' + r.fire + ' steps, not a whole number from its rated ' + IMBUE.steps + ' to ' + IMBUE.fireMax + ' (D-17)');
    if (!r.when && r.fire !== null) out.push(id + ': a rule row has no condition to fire on, so no fire size');
    if (r.convert && !ELEMENTS.includes(r.convert.element)) out.push(id + ': converts to ' + r.convert.element + ', no element the data names');
    const home = PART_HOME.get(r.part);
    if (!home) out.push(id + ': part ' + r.part + ' is in no ground pack');
    else if (home.ground === r.best.ground) out.push(id + ': its part comes from its own best ground; every imbuement makes a trade between two grounds');
    else if (!home.open || !OPEN_GROUNDS.has(r.best.ground)) out.push(id + ': its part or its best ground is on a ground v0.3.0 does not open (D-12)');
    if (!/\{pct\}/.test(r.tip)) out.push(id + ': tip has no {pct}');
  }
  const keys = Object.values(rows).map((r) => r.key);
  if (new Set(keys).size !== keys.length) out.push('two imbuements share a stacking key');
  for (const kind of Object.keys(IMBUE_SLOTS)) if (!Object.values(rows).some((r) => r.kind === kind)) out.push('no ' + kind + ' row: a hero could not fill its three slots');
  return out;
}
