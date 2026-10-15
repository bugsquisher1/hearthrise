// src/features/know-your-foe.js — the fix the engine actually pays, named at the fall.
//
// Pure helpers plus one publisher: setupKnowYourFoe() puts them on
// window.HearthriseFoe for the death sheet, which reads it at call time. No
// top-level window or DOM access.
//
// Every claim is the engine's own: the weapon match is weaknessInfo(), over the
// engine's equipmentStats() (never getWeaponType(), which calls bare hands a
// sword), and only once the equipment record is known. (The element line left
// with the bestiary charms and Enchant v1, 2026-10-14.)

import { weaknessInfo } from '../core/combat.js?v=584';
import { weaknessWords } from '../render/foe-weakness.js?v=584';
import { MONSTER_NOTES } from '../data/monster-notes.js?v=584';
import { SIGNPOSTS } from '../data/signposts.js?v=584';
import { fill } from './signposts.js?v=584';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const own = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

function noteOf(id) {
  return (own(MONSTER_NOTES, id) && typeof MONSTER_NOTES[id] === 'string') ? MONSTER_NOTES[id] : '';
}


/** The foe's facts as plain data, or null when id is not a roster row. */
export function facts(id, opts) {
  const M = window.MONSTERS;
  if (!own(M, id)) return null;
  const m = M[id];
  const o = opts || {};
  const eq = ('eq' in o) ? o.eq : window.getEquipmentStats();
  const known = ('known' in o) ? !!o.known
    : !!(window.HearthriseEquipRead && window.HearthriseEquipRead.isEquipmentKnown(window.G));

  const wi = weaknessInfo(m, eq);
  const name = m.name;
  const weapon = weaknessWords(m);
  const held = known && wi.matched;
  return {
    id,
    name,
    note: noteOf(id),
    weapon,
    held,
    weakLine: held ? fill('foe.weakHeld', { weapon, foe: name }) : fill('foe.weak', { foe: name, weapon }),

    outmatchedTip: held ? fill('foe.outmatchedHeld', { weapon }) : fill('foe.outmatched', { foe: name, weapon }),
  };
}

/** The sheet's "Know your foe" block; the Field notes door only when asked. */
export function aboutHtml(f, { door } = {}) {
  if (!f) return '';
  return '<div class="hr-death-foe">'
    + '<b>' + esc(SIGNPOSTS.labels['foe.heading']) + '</b>'
    + (f.note ? '<p><i>' + esc(f.note) + '</i></p>' : '')
    + (f.weakLine ? '<p>' + esc(f.weakLine) + '</p>' : '')

    + (door ? '<button class="btn ghost hr-death-notes" data-act="notes">' + esc(SIGNPOSTS.labels['foe.notes']) + '</button>' : '')
    + '</div>';
}

export function setupKnowYourFoe() {
  window.HearthriseFoe = Object.freeze({ facts, aboutHtml });
}
