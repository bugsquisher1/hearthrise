// ============================================================
// src/render/companion-lines.js — WHAT AN EQUIPPED COMPANION PAYS, as the
// client may show and apply it.
//
// src/core/companion-perk.js is the only definition of what a companion does
// (the hr-accrue engine imports it). The client applies and renders exactly
// its COMPANION_KEYS, priced by companionKeyBonus, and nothing else: no proc,
// no combat stat point, no rareDrop, no hpRegen — none of those has a server
// payer, so showing or applying them would put a number on screen the realm
// never pays.
//
// Pure ESM, no DOM: importable from Node by tests/companion-promise-parity.mjs.
// ============================================================

import { COMPANIONS } from '../data/companions.js?v=562';
import { COMPANION_KEYS, companionKeyBonus } from '../core/companion-perk.js?v=562';

/* The stat vocabulary for every key a companion row may author, paid or not.
   tests/lore-notes.mjs reads this map as the words lore may use. */
export const COMPANION_LABELS = { strB: 'STR', atkB: 'ATK', defB: 'DEF', crit: 'Crit', allXP: 'All XP', gatherSpeed: 'Gather', farmYield: 'Farm yield', cookSpeed: 'Cook speed', smithSpeed: 'Smith speed', craftSpeed: 'Craft speed', prayerSpeed: 'Prayer speed', rareDrop: 'Rare drop', goldFind: 'Gold find', hpRegen: 'HP/sec' };

function own(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * { key: value } for the paid keys of companion `id` at `xp`, nonzero only.
 * farmYield is the FLAT catalogue base, never level-scaled: its only payer,
 * hr_farm_harvest, adds the flat hr_farm_yield_perk row
 * (2026-08-22-farm-catalogues.generated.sql: 'companion:bunny' 1,
 * 'companion:squirrel' 1).
 */
export function companionPaidBonus(id, xp) {
  const out = {};
  if (typeof id !== 'string' || !own(COMPANIONS, id)) return out;
  const bonus = COMPANIONS[id].bonus || {};
  for (const key of COMPANION_KEYS) {
    const v = key === 'farmYield'
      ? (own(bonus, key) ? Number(bonus[key]) || 0 : 0)
      : companionKeyBonus(key, { id, xp });
    if (v) out[key] = v;
  }
  return out;
}

/** [{ key, label, text }] for the paid keys; [] when nothing is paid. */
export function companionPaidLines(id, xp) {
  const paid = companionPaidBonus(id, xp);
  return Object.keys(paid).map((key) => ({
    key,
    label: COMPANION_LABELS[key] || key,
    text: key === 'farmYield' ? `+${paid[key]} crop` : `+${Math.round(paid[key] * 100)}%`,
  }));
}
