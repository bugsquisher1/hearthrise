// src/features/know-your-foe.js — the fix the engine actually pays, named at the fall.
//
// Pure helpers plus one publisher: setupKnowYourFoe() puts them on
// window.HearthriseFoe for the death sheet and legacy.js's bounty board, which
// read it at call time. No top-level window or DOM access.
//
// Every claim is the engine's own: the weapon match is weaknessInfo(), over the
// engine's equipmentStats() (never getWeaponType(), which calls bare hands a
// sword), and only once the equipment record is known. The element is printed
// only through the charm curtain (studied kind); unknown counters print nothing.

import { weaknessInfo } from '../core/combat.js?v=560';
import { weaknessWords } from '../render/foe-weakness.js?v=560';
import { MONSTER_NOTES } from '../data/monster-notes.js?v=560';
import { SIGNPOSTS } from '../data/signposts.js?v=560';
import { fill } from './signposts.js?v=560';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const own = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

function noteOf(id) {
  return (own(MONSTER_NOTES, id) && typeof MONSTER_NOTES[id] === 'string') ? MONSTER_NOTES[id] : '';
}

function elementLineOf(id, m, wi, known, charms) {
  if (!m.elementWeak || !charms || !charms.countersKnown()) return '';
  const cls = charms.classOfMonsterId(id);
  const element = m.elementWeak;
  if (charms.revealsElement(cls)) {
    return (known && wi.elementMatched) ? fill('foe.elementHeld', { element }) : fill('foe.element', { element });
  }
  const nx = charms.nextOfClass(cls);
  return nx ? fill('foe.elementHidden', { more: nx.remaining, kind: charms.classLabel(cls) }) : '';
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
  const charms = ('charms' in o) ? o.charms : window.HearthriseCharms;
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
    elementLine: elementLineOf(id, m, wi, known, charms),
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
    + (f.elementLine ? '<p>' + esc(f.elementLine) + '</p>' : '')
    + (door ? '<button class="btn ghost hr-death-notes" data-act="notes">' + esc(SIGNPOSTS.labels['foe.notes']) + '</button>' : '')
    + '</div>';
}

/** The active bounty notice's Field Note. `target` is residue: a key only, never echoed. */
export function noticeHtml(target) {
  const note = noteOf(target);
  return note ? '<p class="bb-note"><i>' + esc(note) + '</i></p>' : '';
}

/** ' · ember' after a notice's weakness, only through the charm curtain. */
export function elementSuffix(target) {
  const M = window.MONSTERS;
  const charms = window.HearthriseCharms;
  if (!own(M, target) || !M[target].elementWeak || !charms || !charms.countersKnown()) return '';
  return charms.revealsElement(charms.classOfMonsterId(target)) ? ' · ' + esc(M[target].elementWeak) : '';
}

export function setupKnowYourFoe() {
  window.HearthriseFoe = Object.freeze({ facts, aboutHtml, noticeHtml, elementSuffix });
}
