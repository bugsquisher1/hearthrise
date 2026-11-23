// ════════════════════════════════════════════════════════════════════════
// src/data/imbue-rules.js — IMBUEMENTS: three a hero, an Edge on the weapon, a Ward on the body, a Leech on the helmet, each made from a
// rare part of ANOTHER ground and lasting 20 hunted hours while worn (systems, lane/flame-temper-build, 2026-11-22;
// docs/design/redesign/21-flame-temper-imbue-loot.md section 3, the designer's sample of five and levers).
//
// A ROW: { id, name, kind ('edge' | 'ward' | 'leech'), raises ('offense' | 'defense' | 'heal' | 'mana'), when (a condition the fight
// reads: a target role, the element of a blow taken, or null for a rule that answers itself: a conversion or a leech), key (the
// stacking key: one of a key counts, and never beside a Trait of the same key), part (an item id: the rare part it is made from),
// best ({ ground, seat }: where its 2 steps are sized, 04 guard 1), tip (the tooltip, {pct} the hero's own number), and the rule fields
// convert / leech where they apply }. The slot is the kind's (IMBUE_SLOTS). D-8: no row keys on a monster family.
// THE BAND of a made imbuement is its part's: the entry Level of the ground whose pack carries the part (imbueBandOf).
//
// SIZE. Every row is imbueSteps (2) on its best cell, x ramp(hero Level) in the consumable slice (src/data/power-ledger.js; three fill
// its cap of 6, so a draught is chosen IN PLACE of one, 21 D-1). The shown percent is the 2 steps over the share of the fight its
// condition touches on that cell: those shares are ASSUMED until Lab run I1.
// LIFE. Quality sets life, not strength (D-7): plain 20, fine 25, master 30 hunted hours (lifeRungPm 250 a rung over plain).
//
// DARK. The made imbuement is a stack of the item `imbue_<id>` (one item row an imbuement), which is not an item yet: Artificing (09
// section 6) makes it, and its rows ship with the bench. Until then the server's apply verb (hr_imbue_apply) refuses `imbue_owed`, and
// the whole surface sits behind the hr_flags switch `imbuements` (off at apply). The fight reads the rows' conditions once the
// `target_role` and `hit_element` metrics and the conversion rule land (21 section 3.9). tests/imbue.mjs holds the rows.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { GROUND_PACKS } from './grounds/index.js';

export const IMBUE = Object.freeze({
  hours: 20,
  steps: 2,
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

const row = (r) => Object.freeze({ convert: null, leech: null, ...r, best: Object.freeze(r.best), when: r.when ? Object.freeze(r.when) : null });
export const IMBUE_RULES = Object.freeze({
  fire_ward: row({ name: 'Fire Ward', kind: 'ward', raises: 'defense', when: { metric: 'hit_element', eq: 'fire' }, key: 'ward_fire',
    part: 'fire_gland', best: { ground: 'krells_hold', seat: 'front' }, tip: '−{pct}% Fire damage taken' }),
  fire_edge: row({ name: 'Fire Edge', kind: 'edge', raises: 'offense', when: null, key: 'edge_fire', convert: { element: 'fire', sharePm: 50 },
    part: 'coal_tongs', best: { ground: 'ox_road', seat: 'any' }, tip: '{pct}% of damage dealt as Fire' }),
  brute_edge: row({ name: 'Brute Edge', kind: 'edge', raises: 'offense', when: { metric: 'target_role', eq: 'brute' }, key: 'edge_brute',
    part: 'pike_ferrule', best: { ground: 'muster_barrows', seat: 'melee' }, tip: '+{pct}% damage vs Brutes' }),
  life_leech: row({ name: 'Life Leech', kind: 'leech', raises: 'heal', when: null, key: 'leech_life', leech: { of: 'hp', pm: 10 },
    part: 'leech_jaw', best: { ground: 'wyvern_roost', seat: 'melee' }, tip: 'Life Leech {pct}%' }),
  mana_leech: row({ name: 'Mana Leech', kind: 'leech', raises: 'mana', when: null, key: 'leech_mana', leech: { of: 'mana', pm: 10 },
    part: 'urn_shard', best: { ground: 'pyre_field', seat: 'mage' }, tip: 'Mana Leech {pct}%' }),
});

/* the ground whose pack carries an item, and that ground's entry Level (its hunt's band floor) */
const PART_HOME = (() => {
  const out = new Map();
  for (const p of GROUND_PACKS) for (const id of Object.keys(p.items || {})) if (!out.has(id)) out.set(id, { ground: p.id, band: p.hunt.band[0] });
  return out;
})();

/** The band of an imbuement made from its part: the entry Level of the part's home ground (null for a part no pack carries). */
export const imbueBandOf = (id) => {
  const r = Object.prototype.hasOwnProperty.call(IMBUE_RULES, id) ? IMBUE_RULES[id] : null;
  const home = r ? PART_HOME.get(r.part) : null;
  return home ? home.band : null;
};

/** Every problem with the rows (the table, or a planted copy), as text; [] when sound (tests/imbue.mjs; tools/gen-flame-temper.mjs refuses to write on any). */
export function validateImbues(rows = IMBUE_RULES) {
  const out = [];
  for (const [id, r] of Object.entries(rows)) {
    if (!Object.prototype.hasOwnProperty.call(IMBUE_SLOTS, r.kind)) out.push(id + ': kind ' + r.kind + ' has no slot');
    if (!['offense', 'defense', 'heal', 'mana'].includes(r.raises)) out.push(id + ': raises ' + r.raises);
    if (r.when && r.when.metric === 'in_fight') out.push(id + ': an imbuement is conditional by construction, never in_fight');
    if (r.when && /family/.test(r.when.metric)) out.push(id + ': no imbuement keys on a monster family (D-8)');
    if (!r.when && !r.convert && !r.leech) out.push(id + ': no condition and no rule: it would be a flat number (04 guard 2)');
    const home = PART_HOME.get(r.part);
    if (!home) out.push(id + ': part ' + r.part + ' is in no ground pack');
    else if (home.ground === r.best.ground) out.push(id + ': its part comes from its own best ground; every imbuement makes a trade between two grounds');
    if (!/\{pct\}/.test(r.tip)) out.push(id + ': tip has no {pct}');
  }
  const keys = Object.values(rows).map((r) => r.key);
  if (new Set(keys).size !== keys.length) out.push('two imbuements share a stacking key');
  return out;
}
