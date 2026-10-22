// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-tutorial.js — THE FIRST HUNTS: CELLAR, THICKET, THEN THE SEWER (week plan item 17)
//
// A new character's guided first minutes, one coach card at a time, in the
// order the hunt loop is learned: go → fight → level → earn the next ground →
// cash in → set the bar → hunt alone in the Thicket → earn the Sewer → go below
// with a party. Tyler 2026-10-21: a fresh solo hero starts in Meadowbrook
// Thicket; the Sewer is the first PARTY ground (its Rat King pocket is
// minParty 2), so no card asks a solo hero for a pull he can never make.
// Measured pace (designer 2026-10-21, a solo start-kit Melee on the real settle):
// Cellar first kill 3 s, Level 2 at 0.3 min, Level 5 (the Thicket) at 15 min;
// Thicket Level 5 → 8 (the Sewer) in 23 min, 0 deaths. Each step is DONE by
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

import { HUNT_INDEX } from './hunts.js?v=0.2.28';
import { HUNT_GROUNDS } from './hunt-grounds.js?v=0.2.28';
import { END_ORDER } from './hunt-sessions.js?v=0.2.28';
import { nextUnlock } from './skill-unlocks.js?v=0.2.28';
import { SKILLS_DEF } from './skills.js?v=0.2.28';
import { CROPS } from './gathering.js?v=0.2.28';

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
  step('earn_the_thicket', 'Out to the brook',
    'Keep hunting here until Meadowbrook Thicket opens to you, about a quarter of an hour. You can close the game: your hero keeps hunting until its stamina runs out, and what it earns is waiting when you come back.',
    'hud_vitals', { kind: 'unlock', hunt: 'meadowbrook_thicket' }),
  step('leave_cellar', 'Cash in',
    'Leave the hunt. What you looted goes to your bag when you do.',
    'hunt_topbar', { kind: 'ended', reason: 'left' }),
  step('set_the_bar', 'Tell your hero when',
    'The wolves bite harder. Press a slot on the action bar at the bottom and choose Any food, then add a condition: My HP % below 60. Your hero eats your own food first and buys from the store when it runs out. Slot 1 is tried first.',
    'action_bar', { kind: 'bar' }),
  step('into_the_thicket', 'Into the Thicket',
    'Pick Meadowbrook Thicket. Your hero walks from clearing to clearing by itself and fights each pack it finds.',
    'hunt_picker', { kind: 'enter', hunt: 'meadowbrook_thicket' }),
  step('earn_the_sewer', 'Where the rats come from',
    'The cellar rats climb up from the sewer under the town. Keep hunting the Thicket until The Sewer opens to you.',
    'hud_vitals', { kind: 'unlock', hunt: 'millrace_sewer' }),
  step('go_below', 'Into the sewer, together',
    'The Sewer is a party hunt. Invite friends, or make a second hero: up to four of your heroes can hunt at once, and your own heroes join your party straight away. Then pick The Sewer. The Rat King holds the last room and only comes out for a party.',
    'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }),
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

/* `later`: the hunts entered by the steps after this one. Being in one of them means this step's hunt was
   passed (the chain only moves forward: Cellar -> Thicket -> Sewer), so a hero in the Sewer is not sent back. */
function isDone(d, facts, openedIn, later) {
  switch (d.kind) {
    case 'enter': return facts.huntId === d.hunt || (later && later.has(facts.huntId)) || (d.hunt === HUNT_TUTORIAL[0].done.hunt && facts.levelXp > 0);
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

/** The tutorial card this character is on, or null (finished, or out-levelled the last step's hunt). */
export function currentCard(facts, rows = HUNT_TUTORIAL) {
  const last = rows[rows.length - 1].done;
  const lastHunt = last.kind === 'pull' ? HUNT_GROUNDS[last.ground].hunt : last.kind === 'enter' ? last.hunt : null;
  if (lastHunt && facts.charLevel > HUNT_INDEX[lastHunt].band[1]) return null;
  let openedIn = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.done.kind === 'enter') openedIn = r.done.hunt;
    const later = new Set(rows.slice(i + 1).filter((x) => x.done.kind === 'enter').map((x) => x.done.hunt));
    if (!isDone(r.done, facts, openedIn, later)) return r;
  }
  return null;
}

/* ── AFTER THE GUIDE: WHAT NEXT ───────────────────────────────────────────
   The fresh-hero play (designer 2026-10-22): at Level 12, 2.5 h in, the last card
   was gone and nothing on screen said what to aim at. Once currentCard is null the
   pointer shows ONE goal line, read from the same server facts plus the hero's role
   and skills: the next hunting ground by Level (a hunt-grounds.js row, so a new
   ground shows up here with no edit), and the next thing the weapon's skill opens
   (skill-unlocks.js, the Character window's own "Next at level" line). Display only. */

/* The skill the role's weapon trains (Tyler 2026-10-14: classless Melee / Ranged / Magic). */
export const ROLE_SKILL = Object.freeze({ tank: 'melee', melee_dps: 'melee', ranger: 'ranged', mage: 'magic', healer: 'magic' });

/** The playable hunts (a ground row, not `staged`: built but not open is never a goal), lowest band floor first. */
const groundHunts = () => Array.from(new Set(Object.values(HUNT_GROUNDS).map((g) => g.hunt)))
  .filter((h) => HUNT_INDEX[h] && HUNT_INDEX[h].staged !== true).sort((a, b) => HUNT_INDEX[a].band[0] - HUNT_INDEX[b].band[0]);

/**
 * The goal line after the guide, or null (nothing left to name). `facts`: { charLevel, role, skillLevel, defenseXp, farmingXp }
 * (skillLevel: the role's skill's level, or null when unknown; defenseXp / farmingXp: the server's Defense / Farming XP,
 * or null when unknown). Answers { id, title, text }; the id
 * changes whenever the text does (the hunt top bar redraws on a new id).
 */
export function nextGoal(facts) {
  if (!facts || !Number.isInteger(facts.charLevel)) return null;
  const lines = [];
  const ids = ['goal'];
  /* Defense at 0 XP means no armour worn (Tyler 2026-10-18: it trains only in armour). The fresh-hero play hit 117
     kills like that; the Shop's gloves and belts are the cheapest armour (designer 2026-10-22, the outfitter). */
  if (facts.defenseXp === 0) {
    lines.push('Your Defense is not training: it rises only while you wear armour. The Shop sells gloves and belts.');
    ids.push('armour');
  }
  /* Farming at 0 XP means nothing was ever planted (P1 2026-10-22: farming sat at zero; the kit holds 8 turnip seeds).
     Said once: the first planting pays Farming XP and the line is gone. */
  if (facts.farmingXp === 0) {
    lines.push('Nothing grows on your farm yet: open the Farm (J) and plant a seed. Turnips are ready in ' + CROPS.turnip.hours + ' hours, sooner if watered.');
    ids.push('farm');
  }
  const next = groundHunts().find((h) => HUNT_INDEX[h].band[0] > facts.charLevel);
  if (next) {
    const g = Object.values(HUNT_GROUNDS).find((r) => r.hunt === next);
    const party = g.pockets.some((p) => (p.minParty || 1) > 1);
    /* The floor is a warning, not a lock (Tyler 2026-10-18), so the line names the Level it is built for. */
    lines.push('Next ground: ' + HUNT_INDEX[next].name + ', for Level ' + HUNT_INDEX[next].band[0] + ' and up' + (party ? ', with a party.' : '.'));
    ids.push(next, String(HUNT_INDEX[next].band[0]));
  }
  const skill = ROLE_SKILL[facts.role];
  if (skill && Number.isInteger(facts.skillLevel)) {
    const u = nextUnlock(skill, facts.skillLevel);
    const at = /^Next at level (\d+): /.exec(u);
    if (at) {
      lines.push('Next at ' + SKILLS_DEF[skill].name + ' level ' + at[1] + ': ' + u.slice(at[0].length) + '.');
      ids.push(skill, at[1]);
    }
  }
  return lines.length ? { id: ids.join('_'), title: 'What next', text: lines.join(' ') } : null;
}
