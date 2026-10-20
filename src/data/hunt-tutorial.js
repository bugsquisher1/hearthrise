// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-tutorial.js — THE FIRST HUNT: CELLAR, THEN SEWER (week plan item 17)
//
// A new character's guided first minutes, one coach card at a time, in the
// order the hunt loop is learned: go → fight → level → earn the next ground →
// cash in → go below → move room to room → meet the boss. Each step is DONE by
// something the SERVER reports (an envelope change or a hunt event), never by a
// Next button, and every step is real progress, never a sandbox (the Huntera
// quick-start model, memory `huntera-tutorial-model`, mechanics only).
//
// ROW SHAPE
//   { id, title, text, anchor, done }
//     anchor  the surface the card points at (TUTORIAL_ANCHORS; the coach rings it)
//     done    what completes the step, read from the character's own envelope:
//       { kind: 'enter',  hunt }            a hunt session on `hunt` is open
//       { kind: 'kills',  atLeast }         the server kill count rose by n since the step began
//       { kind: 'level' }                   any skill's level rose since the step began
//       { kind: 'unlock', hunt }            combat level >= that hunt's band floor (hunts.js)
//       { kind: 'ended',  reason }          the hunt session ended for `reason` (END_ORDER)
//       { kind: 'pull',   ground, pocket }  a `pull` hunt event on that ground's pocket
//       { kind: 'bar' }                     the server's stored bar (hunt_settings.bar) holds a
//                                           slot the player set a condition on (Configure action)
//
// No number is restated here: the sewer's floor is read from hunts.js, pockets
// from hunt-grounds.js. validate() proves every name a card uses is real; the
// walk-through (every step doable from the steps before it plus the start kit)
// is tests/hunt-core/sewer.mjs `tutorial-walk-through`.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_INDEX } from './hunts.js?v=0.2.20';
import { HUNT_GROUNDS } from './hunt-grounds.js?v=0.2.20';
import { END_ORDER } from './hunt-sessions.js?v=0.2.20';

/* The surfaces a card may point at, and where each is specified. */
export const TUTORIAL_ANCHORS = Object.freeze({
  hunt_picker: 'the hunt list (docs/design/HUNT_SCREEN_SPEC.md §1.4, the Adventures window)',
  world: 'the world pane (src/app/world-pane.js)',
  hud_vitals: 'the bottom bar HP/XP (HUNT_SCREEN_SPEC §1.4 action-bar.js)',
  hunt_topbar: 'Hunt details and Leave hunt (HUNT_SCREEN_SPEC §1.4 hunt-topbar.js)',
  action_bar: 'a slot on the action bar, which opens Configure action (src/shell/windows/configure-action.js); shown in town too',
});

const step = (id, title, text, anchor, done) => Object.freeze({ id, title, text, anchor, done: Object.freeze(done) });

export const HUNT_TUTORIAL = Object.freeze([
  step('to_the_cellar', 'Rats in the mill',
    'The miller has rats in his grain. Open Hunts and pick the Mill Cellar.',
    'hunt_picker', { kind: 'enter', hunt: 'mill_cellar' }),
  step('first_kill', 'Your hero fights alone',
    'You do not click to attack. Your hero walks to the rats, swings, and picks the next one. Watch the first one fall.',
    'world', { kind: 'kills', atLeast: 1 }),
  step('first_level', 'That is a level',
    'Every kill pays experience. Keep going until a skill goes up a level.',
    'hud_vitals', { kind: 'level' }),
  step('earn_the_drain', 'Where the rats come from',
    'They climb up through the drain in the corner, from the sewer below. Keep hunting here until The Sewer opens to you.',
    'hud_vitals', { kind: 'unlock', hunt: 'millrace_sewer' }),
  step('leave_cellar', 'Cash in',
    'Leave the hunt. What you looted goes to your bag when you do.',
    'hunt_topbar', { kind: 'ended', reason: 'left' }),
  step('set_the_bar', 'Tell your hero when',
    'The sewer hits harder. Press a slot on the action bar at the bottom and choose Any food, then add a condition: My HP % below 60. Your hero eats your own food first and buys from the store when it runs out. Slot 1 is tried first.',
    'action_bar', { kind: 'bar' }),
  step('go_below', 'Into the sewer',
    'Pick The Sewer. It is built for a party of up to four. Alone, the packs are smaller.',
    'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }),
  step('first_room', 'Room by room',
    'Clear the rats in the first room. The party walks on to the next room by itself.',
    'world', { kind: 'pull', ground: 'millrace_sewer', pocket: 1 }),
  step('the_king', 'The Rat King',
    'The last room is his. Fire glances off him and frost hurts him most. He sometimes drops a Crown Shard. That covers it. Good hunting.',
    'world', { kind: 'pull', ground: 'millrace_sewer', pocket: 5 }),
]);

const DONE_KINDS = Object.freeze(['enter', 'kills', 'level', 'unlock', 'ended', 'pull', 'bar']);

/** Every problem with the tutorial, as strings. Empty = valid. */
export function validate(rows = HUNT_TUTORIAL) {
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const bad = (why) => out.push(String(r && r.id) + ': ' + why);
    if (!/^[a-z0-9_]{1,40}$/.test(String(r.id)) || seen.has(r.id)) bad('id must be unique [a-z0-9_]');
    seen.add(r.id);
    if (!r.title || !r.text) bad('a card needs a title and a text');
    if (!TUTORIAL_ANCHORS[r.anchor]) bad('anchor ' + r.anchor + ' is not a tutorial anchor');
    const d = r.done || {};
    if (!DONE_KINDS.includes(d.kind)) { bad('done kind ' + d.kind + ' is unknown'); continue; }
    if ((d.kind === 'enter' || d.kind === 'unlock') && !HUNT_INDEX[d.hunt]) bad('hunt ' + d.hunt + ' is not in hunts.js');
    if (d.kind === 'kills' && !(Number.isInteger(d.atLeast) && d.atLeast > 0)) bad('kills needs atLeast >= 1');
    if (d.kind === 'ended' && !END_ORDER.includes(d.reason)) bad('end reason ' + d.reason + ' is not in END_ORDER');
    if (d.kind === 'pull') {
      const g = HUNT_GROUNDS[d.ground];
      if (!g) bad('ground ' + d.ground + ' is not in hunt-grounds.js');
      else if (!(Number.isInteger(d.pocket) && g.route.includes(d.pocket))) bad('pocket ' + d.pocket + ' is not on ' + d.ground + "'s route");
    }
  }
  return out;
}
