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
//       { kind: 'enter',  hunt }            a hunt session on `hunt` is open (the first hunt: or Level XP > 0)
//       { kind: 'kills',  atLeast }         the first kill has landed (Level XP > 0)
//       { kind: 'level' }                   a Level or a skill has reached level 2
//       { kind: 'unlock', hunt }            combat level >= that hunt's band floor (hunts.js)
//       { kind: 'ended',  reason }          the hunt session ended for `reason` (END_ORDER)
//       { kind: 'pull',   ground, pocket }  a monster of that pocket, or a later one, stands in the open hunt
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

import { HUNT_INDEX } from './hunts.js?v=0.2.23';
import { HUNT_GROUNDS } from './hunt-grounds.js?v=0.2.23';
import { END_ORDER } from './hunt-sessions.js?v=0.2.23';

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
    if (d.kind === 'kills' && d.atLeast !== 1) bad('kills: the server only tells the first kill (Level XP > 0), so atLeast must be 1');
    if (d.kind === 'ended' && !END_ORDER.includes(d.reason)) bad('end reason ' + d.reason + ' is not in END_ORDER');
    if (d.kind === 'pull') {
      const g = HUNT_GROUNDS[d.ground];
      if (!g) bad('ground ' + d.ground + ' is not in hunt-grounds.js');
      else if (!(Number.isInteger(d.pocket) && g.route.includes(d.pocket))) bad('pocket ' + d.pocket + ' is not on ' + d.ground + "'s route");
    }
  }
  return out;
}

/* ── WHICH CARD IS UP ──────────────────────────────────────────────────────
   The card is a pure function of what the SERVER has said (no step counter is
   stored anywhere, so a reload, a second device and a closed browser all show
   the same card). `facts` is read from the envelope by src/session/tutorial-sections.js:
     levelXp     state.level_xp (Level XP comes from kills only, so > 0 means a kill landed)
     charLevel   the Level that XP makes
     skillLevel  the highest skill level
     huntId      the open (not ended) hunt session's hunt, or null
     unitKinds   Set of the monster kinds standing in the open hunt's instance (the hunt section's units)
     barSet      the stored bar holds a slot with a condition
   Every step is judged on what is true NOW, never on "since the step began",
   and the first unmet step is the card. */
/* The monster kinds that tell `pocket` (or a LATER pocket) has been pulled: kinds standing in a pocket
   at or after it on the route that no earlier pocket holds. The hunt section's units are the server's. */
const pulledKinds = (ground, pocket) => {
  const at = ground.route.indexOf(pocket);
  const kinds = (ps) => new Set(ps.flatMap((p) => ground.pockets[p].spawns.map((x) => x.monster)));
  const before = kinds(ground.route.slice(0, at));
  return [...kinds(ground.route.slice(at))].filter((k) => !before.has(k));
};

function isDone(d, facts, openedIn) {
  switch (d.kind) {
    case 'enter': return facts.huntId === d.hunt || (d.hunt === HUNT_TUTORIAL[0].done.hunt && facts.levelXp > 0);
    case 'kills': return facts.levelXp > 0;
    case 'level': return facts.charLevel >= 2 || facts.skillLevel >= 2;
    case 'unlock': return facts.charLevel >= HUNT_INDEX[d.hunt].band[0];
    case 'ended': return facts.huntId !== openedIn;
    case 'bar': return facts.barSet;
    case 'pull': {
      const g = HUNT_GROUNDS[d.ground];
      return facts.huntId === g.hunt && pulledKinds(g, d.pocket).some((k) => facts.unitKinds.has(k));
    }
    default: return false;
  }
}

/** The tutorial card this character is on, or null (finished, or out-levelled the sewer). */
export function currentCard(facts, rows = HUNT_TUTORIAL) {
  const last = rows[rows.length - 1].done;
  if (last.kind === 'pull' && facts.charLevel > HUNT_INDEX[HUNT_GROUNDS[last.ground].hunt].band[1]) return null;
  let openedIn = null;
  for (const r of rows) {
    if (r.done.kind === 'enter') openedIn = r.done.hunt;
    if (!isDone(r.done, facts, openedIn)) return r;
  }
  return null;
}
