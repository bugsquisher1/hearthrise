// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-tutorial.js — THE FIRST HOUR: CELLAR, THE TOWN HALF, THICKET (week plan item 17)
//
// A new character's guided first hour, one coach card at a time, in the order
// the loop is learned: go → fight → level → plant (while the cellar hunt runs)
// → cash in → cook → set the bar → take Tamsin's task → hunt alone in the
// Thicket → be paid in town → "What next". Tyler 2026-10-21: a fresh solo hero
// starts in Meadowbrook Thicket; the Sewer is the first PARTY ground (its Rat
// King pocket is minParty 2), so its card is a PARTY card: a solo hero never
// meets it, and the solo chain hands over to "What next" (which names the
// Sewer and how to make a party) instead of waiting behind a party gate for
// hours (designer playtest 2026-10-24, PRIORITY_BOARD "New-player tutorial").
// Measured pace (a solo start-kit Melee on the real settle): Cellar first kill
// 3 s, Level 2 inside 34 s; the Cellar pays ~4,100 Level XP an hour, so Level 5
// (the Thicket, 1,736 XP) takes ~25 min (designer playtest 2026-10-24: Level 5 at
// 28% after 32 min; lane/b-tutorial-fixes replay: 1,121 XP in 16 min); Thicket
// Level 5 → 8 in ~25 min, 0 deaths. Each step is DONE by
// something the SERVER reports (an envelope change), never by a Next button,
// and every step is real progress, never a sandbox (the Huntera quick-start
// model, memory `huntera-tutorial-model`, mechanics only).
//
// ROW SHAPE
//   { id, title, text, anchor, done, ring?, party? }
//     anchor  the surface the card points at (TUTORIAL_ANCHORS); the shell rings the real control
//             there (src/shell/launcher.js ringCoach) and, when the anchor is a window, shows the card inside it
//     ring    what on that surface: { item } the bar slot holding it, { crop } the seed to plant,
//             { skill, work } the skill and its recipe, { task } Tamsin's task
//     party   true: a PARTY card, met only by a hero in a party of 2+ whose Level opens its hunt;
//             a solo hero passes it by (no solo wall)
//     text    may name a bar slot as {slot:<item id>}: cardFor() writes the server's slot there
//     done    what completes the step, read from the character's own envelope:
//       { kind: 'enter',  hunt }            a hunt session on `hunt` is open (the first hunt: or Level XP > 0)
//       { kind: 'kills',  atLeast }         the first kill has landed (Level XP > 0)
//       { kind: 'level' }                   a Level or a skill has reached level 2
//       { kind: 'unlock', hunt }            combat level >= that hunt's band floor (hunts.js)
//       { kind: 'ended',  reason }          the hunt session ended for `reason` (END_ORDER)
//       { kind: 'pull',   ground, pocket }  a monster of that pocket, or a later one, stands in the open hunt
//       { kind: 'bar' }                     the server's STORED bar (hunt_settings.bar) holds a FOOD slot
//                                           with a condition (Configure action Save); the start kit's bar
//                                           is shown, never stored
//       { kind: 'planted' }                 this hero has Farming XP (planting pays it), or the account's
//                                           shared land holds a crop now (another hero planted it)
//       { kind: 'skill_xp', skill }         this hero's XP in `skill` is above 0 (it never goes back to 0)
//       { kind: 'tally_taken', task }       a Tamsin task is held or was paid today, or (she was asked: the
//                                           armor weight is chosen) the hero has been on `task`'s ground
//       { kind: 'tally_paid' }              she paid a task today, or no task is held (nothing to finish)
//   A town fact the server has not sent (no `skills`, `farm_land` or `tally` section) counts as done:
//   the coach never asks for something it cannot see happen.
//
// No number is restated here: floors are read from hunts.js, pockets from hunt-grounds.js, the turnip's
// hours from gathering.js, Tamsin's task from tally-tasks.js. validate() proves every name a card uses is
// real; the walk-through (every step doable from the steps before it plus the start kit, the bar card
// against the real default bar) is tests/hunt-core/sewer.mjs `tutorial-walk-through`.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_INDEX } from './hunts.js?v=0.2.45';
import { HUNT_GROUNDS } from './hunt-grounds.js?v=0.2.45';
import { END_ORDER } from './hunt-sessions.js?v=0.2.45';
import { nextUnlock } from './skill-unlocks.js?v=0.2.45';
import { SKILLS_DEF } from './skills.js?v=0.2.45';
import { CROPS } from './gathering.js?v=0.2.45';
import { tallyTask } from './tally-tasks.js?v=0.2.45';
import { ITEMS } from './items.js?v=0.2.45';
import { BASIC_INDEX } from './supply-basics.js?v=0.2.45';
import { LEVEL_REQ } from './gear-tiers.js?v=0.2.45';
import { roleWeaponOf, WEAPON_ROLES, SHIELD_ARM } from './hunt-roles.js?v=0.2.45';
import { isShield } from './shields.js?v=0.2.45';
import { deriveProfile } from '../core/member.js?v=0.2.45';

/* The surfaces a card may point at: `window` the shell window (src/data/shell-windows.js) its controls live in (the
   card shows INSIDE it while it is open), `icon` its way starts at that window's icon, and what the coach rings
   (src/shell/launcher.js ringPlan). */
const anchor = (about, window, icon) => Object.freeze({ about, window: window || null, icon: !!icon });
export const TUTORIAL_ANCHORS = Object.freeze({
  hunt_picker: anchor('Hunts (src/shell/windows/hunts.js): its icon, then the ground\'s line, then Enter', 'hunts', true),
  world: anchor('the world pane (src/app/world-pane.js): nothing to ring'),
  hud_vitals: anchor('the bottom bar HP/XP (HUNT_SCREEN_SPEC §1.4 action-bar.js): nothing to ring'),
  hunt_topbar: anchor('Leave hunt (HUNT_SCREEN_SPEC §1.4 hunt-topbar.js)'),
  action_bar: anchor('the bar slot holding ring.item (src/shell/widgets/action-bar.js), then Configure action\'s Save; shown in town too', 'configure-action'),
  farm: anchor('the Farm (src/shell/windows/farm.js): its icon, an empty plot\'s Plant, then ring.crop\'s Plant', 'farm', true),
  crafting: anchor('Gathering and crafting (src/shell/windows/work.js): its icon, ring.skill, then ring.work\'s Start', 'skills-trade', true),
  tally: anchor('Tamsin\'s tally (src/shell/windows/tally.js): her icon, the armor weight, then ring.task\'s Take', 'tally', true),
});

/** The window `card`'s controls live in (its card shows inside it while open), or null. */
export function coachWindow(card) {
  const a = card && TUTORIAL_ANCHORS[card.anchor];
  return a ? a.window : null;
}

/** The window whose ICON the coach rings for `card` (its way starts there and the window is closed), or null. */
export function coachIcon(card, open) {
  const a = card && TUTORIAL_ANCHORS[card.anchor];
  return a && a.icon && !open(a.window) ? a.window : null;
}

const step = (id, title, text, anchor, done, more) => Object.freeze({ id, title, text, anchor, done: Object.freeze(done),
  ...(more && more.ring ? { ring: Object.freeze(more.ring) } : {}), ...(more && more.party ? { party: true } : {}) });

/* The task Tamsin's card names: a solo task on the solo ground (tally-tasks.js). */
const WOLVES = tallyTask('thicket_gray_wolves');

export const HUNT_TUTORIAL = Object.freeze([
  step('to_the_cellar', 'Rats in the mill',
    'The miller has rats in his grain. Open Hunts and enter the Mill Cellar.',
    'hunt_picker', { kind: 'enter', hunt: 'mill_cellar' }),
  step('first_kill', 'Your hero fights alone',
    'You don\'t click to attack. Your hero walks to the rats, swings, and picks the next one. Watch the first one fall.',
    'world', { kind: 'kills', atLeast: 1 }),
  step('first_level', 'That\'s a level',
    'Every kill pays experience. Keep going until a skill goes up a level.',
    'hud_vitals', { kind: 'level' }),
  /* In the cellar wait (designer 2026-10-24: dead minutes from minute 2 to Level 5); hr_farm_plant does not refuse a hunter. */
  step('plant_land', 'Plant your land',
    'While your hero hunts, open the Farm, press an empty plot and plant a Turnip Seed. Turnips are ready in '
      + CROPS.turnip.hours + ' hours.',
    'farm', { kind: 'planted' }, { ring: { crop: 'turnip' } }),
  step('earn_the_thicket', 'Out to the brook',
    'Keep hunting here until Meadowbrook Thicket opens to you, about 25 minutes. You can close the game: your hero keeps hunting until its stamina runs out, and what it earns is waiting when you come back.',
    'hud_vitals', { kind: 'unlock', hunt: 'meadowbrook_thicket' }),
  step('leave_cellar', 'Cash in',
    'Leave the hunt. What you looted goes to your bag when you do.',
    'hunt_topbar', { kind: 'ended', reason: 'left' }),
  step('cook_catch', 'Cook your catch',
    'Open Gathering and crafting, press Cooking, then Start on Cook Shrimp. Your Raw Shrimp become the Cooked Shrimp your bar eats.',
    'crafting', { kind: 'skill_xp', skill: 'cooking' }, { ring: { skill: 'cooking', work: 'cook_shrimp' } }),
  step('set_the_bar', 'Tell your hero when',
    'The wolves bite harder. Your bar already eats for you: {slot:cooked_shrimp} is your own Cooked Shrimp, and {slot:salted_shrimp} buys Salted Shrimp from the store once they run out. Press {slot:cooked_shrimp}, set the HP it eats at, then Save.',
    'action_bar', { kind: 'bar' }, { ring: { item: 'cooked_shrimp' } }),
  step('tamsins_task', 'Tamsin\'s wolves',
    'Tamsin pays for kills. Open her tally, pick the armor weight she pays you in, then Take ' + WOLVES.count + ' ' + WOLVES.label
      + '. Every kill counts, even while you\'re away.',
    'tally', { kind: 'tally_taken', task: WOLVES.id }, { ring: { task: WOLVES.id } }),
  step('into_the_thicket', 'Into the Thicket',
    'Pick Meadowbrook Thicket. Your hero walks from clearing to clearing by itself and fights each pack it finds.',
    'hunt_picker', { kind: 'enter', hunt: 'meadowbrook_thicket' }),
  step('tamsin_pays', 'Paid in town',
    'Hunt the Thicket until your count is done. Tamsin pays you as you come back to town: gold, plus a piece of armor you can wear. Your tally on screen shows how far along you are.',
    'world', { kind: 'tally_paid' }),
  step('go_below', 'Into the sewer, together',
    'The Sewer is a party hunt. Pick The Sewer and Start with party: everyone walks in together. The Rat King holds the last room and only comes out for a party.',
    'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }, { party: true }),
]);

const DONE_KINDS = Object.freeze(['enter', 'kills', 'level', 'unlock', 'ended', 'pull', 'bar', 'planted', 'skill_xp', 'tally_taken', 'tally_paid']);
/* The kinds the SERVER finishes on its own (no press of the player's): the shell keeps such a card up long enough
   to read before the next one replaces it (src/shell/launcher.js heldCard). */
export const AUTO_KINDS = Object.freeze(['kills', 'level', 'unlock', 'pull']);
const SLOT_TOKEN = /\{slot:([a-z0-9_]+)\}/g;

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
    for (const m of String(r.text).matchAll(SLOT_TOKEN)) if (!ITEMS[m[1]] && !BASIC_INDEX[m[1]]) bad('{slot:' + m[1] + '} names no item');
    const g = r.ring || {};
    if (g.item && !ITEMS[g.item]) bad('ring item ' + g.item + ' is not an item');
    if (g.crop && !CROPS[g.crop]) bad('ring crop ' + g.crop + ' is not a crop');
    if (g.skill && !SKILLS_DEF[g.skill]) bad('ring skill ' + g.skill + ' is not a skill');
    if (g.task && !tallyTask(g.task)) bad('ring task ' + g.task + ' is not one of Tamsin\'s tasks');
    const d = r.done || {};
    if (!DONE_KINDS.includes(d.kind)) { bad('done kind ' + d.kind + ' is unknown'); continue; }
    if ((d.kind === 'enter' || d.kind === 'unlock') && !HUNT_INDEX[d.hunt]) bad('hunt ' + d.hunt + ' is not in hunts.js');
    if (d.kind === 'kills' && d.atLeast !== 1) bad('kills: the server only tells the first kill (Level XP > 0), so atLeast must be 1');
    if (d.kind === 'ended' && !END_ORDER.includes(d.reason)) bad('end reason ' + d.reason + ' is not in END_ORDER');
    if (d.kind === 'skill_xp' && !SKILLS_DEF[d.skill]) bad('skill ' + d.skill + ' is not a skill');
    if (d.kind === 'tally_taken' && !tallyTask(d.task)) bad('task ' + d.task + ' is not one of Tamsin\'s tasks');
    if (r.party && d.kind !== 'enter') bad('a party card is finished by entering its party hunt');
    if (d.kind === 'pull') {
      const gr = HUNT_GROUNDS[d.ground];
      if (!gr) bad('ground ' + d.ground + ' is not in hunt-grounds.js');
      else if (!(Number.isInteger(d.pocket) && gr.route.includes(d.pocket))) bad('pocket ' + d.pocket + ' is not on ' + d.ground + "'s route");
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
     skillXp     { skill: xp } as the server sent the skills, or null when it sent none
     huntId      the open (not ended) hunt session's hunt, or null
     visited     Set of the hunts the server records this hero hunting: its latest session's (open or
                 ended) and every ground it holds a personal best on (hunt_bests)
     unitKinds   Set of the monster kinds standing in the open hunt's instance (the hunt section's units)
     foodSet     the stored bar holds a food slot with a condition
     bar         the bar the server SHOWS, [{ type, id } | null] by slot (the start kit's until one is stored)
     landPlanted the account's land holds a crop now (true / false), or null when the server sent no field
     tally       { held, paid, weight } (tasks held, paid today, armor weight chosen), or null
     inParty     the hero sits in a party of 2 or more
   Every step is judged on what is true NOW, never on "since the step began",
   and the first unmet step is the card. A step about WHERE the hero is (enter, ended, pull) is
   judged on where it has BEEN as well: going into a hunt and back out to town never moves the card
   backward (#58, Andy 10-22: the Thicket card came back every time he left the Thicket or the Sewer).
   A step about what the hero has DONE in town is judged on a fact that stays (Farming and Cooking XP,
   the armor weight Tamsin asks for once), so a harvest or a paid task does not bring its card back. */
/* The monster kinds that tell `pocket` (or a LATER pocket) has been pulled: kinds standing in a pocket
   at or after it on the route that no earlier pocket holds. The hunt section's units are the server's. */
const pulledKinds = (ground, pocket) => {
  const at = ground.route.indexOf(pocket);
  const kinds = (ps) => new Set(ps.flatMap((p) => ground.pockets[p].spawns.map((x) => x.monster)));
  const before = kinds(ground.route.slice(0, at));
  return [...kinds(ground.route.slice(at))].filter((k) => !before.has(k));
};

/* The hunts the server has seen this hero in: the open one and the `visited` record. */
const been = (facts) => [facts.huntId, ...(facts.visited instanceof Set ? facts.visited : [])].filter((h) => HUNT_INDEX[h]);
/* Has the hero hunted `hunt`, or a ground PAST it (a higher band floor: the chain only moves forward,
   Cellar -> Thicket -> Sewer -> on)? `past` alone asks only for a ground past it. */
const reached = (facts, hunt, past) => been(facts).some((h) => (!past && h === hunt) || HUNT_INDEX[h].band[0] > HUNT_INDEX[hunt].band[0]);
/* A skill's XP as the server said it (a skill it did not list is 0), or null when it sent no skills. */
const xpIn = (facts, skill) => (facts.skillXp ? Number(facts.skillXp[skill]) || 0 : null);

function isDone(d, facts, openedIn) {
  switch (d.kind) {
    case 'enter': return reached(facts, d.hunt) || (d.hunt === HUNT_TUTORIAL[0].done.hunt && facts.levelXp > 0);
    case 'kills': return facts.levelXp > 0;
    case 'level': return facts.charLevel >= 2 || facts.skillLevel >= 2;
    case 'unlock': return facts.charLevel >= HUNT_INDEX[d.hunt].band[0];
    /* out of that hunt now, or already hunting past it (back in it later is not a step back) */
    case 'ended': return facts.huntId !== openedIn || (!!openedIn && reached(facts, openedIn, true));
    case 'bar': return facts.foodSet === true;
    /* Planting pays this hero Farming XP, so its own planting stays done after the harvest empties the land. */
    case 'planted': return (xpIn(facts, 'farming') === null && facts.landPlanted == null) || xpIn(facts, 'farming') > 0 || facts.landPlanted === true;
    case 'skill_xp': return xpIn(facts, d.skill) === null || xpIn(facts, d.skill) > 0;
    case 'tally_taken': {
      const t = facts.tally;
      return !t || t.held > 0 || t.paid > 0 || (t.weight === true && reached(facts, tallyTask(d.task).hunt));
    }
    case 'tally_paid': return !facts.tally || facts.tally.paid > 0 || facts.tally.held === 0;
    case 'pull': {
      const g = HUNT_GROUNDS[d.ground];
      return (facts.huntId === g.hunt && pulledKinds(g, d.pocket).some((k) => facts.unitKinds.has(k))) || reached(facts, g.hunt, true);
    }
    default: return false;
  }
}

/* The top of the band of the last ground `rows` enter: past it, those cards are behind the hero. */
const guideCap = (rows) => Math.max(...rows.filter((r) => r.done.kind === 'enter').map((r) => HUNT_INDEX[r.done.hunt].band[1]));
/* Is this card on this hero's way? A party card: only in a party of 2+ whose Level opens its hunt. A solo card: only
   up to the top of the solo chain's last ground (a hero who out-levelled the Thicket is past the first hour: the town
   lessons are not asked of a Level 20 who never cooked; "What next" speaks to them). */
const metBy = (r, facts, soloCap) => (r.party ? facts.inParty === true && facts.charLevel >= HUNT_INDEX[r.done.hunt].band[0]
  : facts.charLevel <= soloCap);

/** The tutorial card this character is on, or null (finished, or out-levelled the chain's grounds). */
export function currentCard(facts, rows = HUNT_TUTORIAL) {
  if (facts.charLevel > guideCap(rows)) return null;
  const soloCap = guideCap(rows.filter((r) => !r.party));
  let openedIn = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.done.kind === 'enter' && !r.party) openedIn = r.done.hunt;
    if (!metBy(r, facts, soloCap)) continue;
    if (!isDone(r.done, facts, openedIn)) return r;
  }
  return null;
}

/**
 * The card as the player reads it: its {slot:<item>} words written from the bar the SERVER shows ("slot 4", the
 * slot's place, 1-based; "the Salted Shrimp slot" when no slot holds that item), and `barSlot`, the 0-based slot
 * of its ring item (null when no slot holds it: nothing to ring). `bar`: facts.bar. Pure.
 */
export function cardFor(card, bar) {
  if (!card) return null;
  const at = (id) => (Array.isArray(bar) ? bar.findIndex((a) => !!a && a.type === 'consume' && a.id === id) : -1);
  const name = (id) => (ITEMS[id] && ITEMS[id].n) || (BASIC_INDEX[id] && BASIC_INDEX[id].n) || id;
  const text = card.text.replace(SLOT_TOKEN, (m, id) => (at(id) >= 0 ? 'slot ' + (at(id) + 1) : 'the ' + name(id) + ' slot'));
  const item = card.ring && card.ring.item;
  const barSlot = item && at(item) >= 0 ? at(item) : null;
  return text === card.text && barSlot === null ? card : Object.freeze({ ...card, text, barSlot });
}

/* ── AFTER THE GUIDE: WHAT NEXT ───────────────────────────────────────────
   The fresh-hero play (designer 2026-10-22): at Level 12, 2.5 h in, the last card
   was gone and nothing on screen said what to aim at. Once currentCard is null the
   pointer shows ONE goal line, read from the same server facts plus the hero's role
   and skills: the next hunting ground by Level (a hunt-grounds.js row, so a new
   ground shows up here with no edit), the next GEAR by Level (every piece is worn by
   the hero's Level, Tyler 2026-10-24: skill-unlocks.js nextUnlock(LEVEL_REQ), only
   pieces a player can get, only the ones the role wears), and the next supply the
   weapon's skill opens (the Character window's own "Next at level" line). Display only. */

/* The skill the role's weapon trains (Tyler 2026-10-14: classless Melee / Ranged / Magic). */
export const ROLE_SKILL = Object.freeze({ tank: 'melee', melee_dps: 'melee', ranger: 'ranged', mage: 'magic', healer: 'magic' });

/**
 * Would a hero of `role` wear `id`? For the coach's NAMING only, never a gate (any hero wears any piece, Tyler
 * 2026-10-14): a weapon the role plays (hunt-roles.js: its role key, or its shield arm's: a sword is the tank's too),
 * a shield for the tank, a spellbook for its discipline's role, and armor or jewelry that costs the role's own style
 * nothing (no negative accuracy or damage field for it, src/core/member.js deriveProfile: plate costs a caster and a
 * Ranger accuracy, cloth a Melee).
 */
export function wornByRole(id, role) {
  const it = ITEMS[id];
  const skill = ROLE_SKILL[role];
  if (!it || !it.slot || !skill) return false;
  const plays = (k) => [k, SHIELD_ARM[k]].some((x) => x && (WEAPON_ROLES[x] || []).includes(role));
  if (it.slot === 'weapon') return plays(roleWeaponOf(it));
  if (isShield(it)) return role === 'tank';
  if (it.slot === 'shield' && it.discipline) return plays(roleWeaponOf({ weaponType: 'magic', discipline: it.discipline }));
  const p = deriveProfile(skill === 'melee' ? 'sword' : skill);
  return !(Number(it[p.accuracyBonusField]) < 0) && !(Number(it[p.strengthBonusField]) < 0);
}

/** The playable hunts (a ground row, not `staged`: built but not open is never a goal), lowest band floor first. */
const groundHunts = () => Array.from(new Set(Object.values(HUNT_GROUNDS).map((g) => g.hunt)))
  .filter((h) => HUNT_INDEX[h] && HUNT_INDEX[h].staged !== true).sort((a, b) => HUNT_INDEX[a].band[0] - HUNT_INDEX[b].band[0]);

/* "5 Turnip plots", one phrase per ready crop in crop order (gathering.js CROPS), the crop name as the noun's
   modifier so no crop name is ever pluralised by guesswork ("Potatos"). A crop this build does not know reads "crop". */
function readyWords(ready) {
  const order = Object.keys(CROPS);
  const rank = (c) => (order.includes(c) ? order.indexOf(c) : order.length);
  const crops = Object.keys(ready).filter((c) => Number.isInteger(ready[c]) && ready[c] > 0)
    .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
  return {
    words: crops.map((c) => ready[c] + ' ' + (CROPS[c] ? CROPS[c].name : 'crop') + (ready[c] === 1 ? ' plot' : ' plots')),
    plots: crops.reduce((n, c) => n + ready[c], 0),
    ids: crops.flatMap((c) => [c, String(ready[c])]),
  };
}
const listed = (words) => (words.length < 2 ? words.join('') : words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1]);

/* How a hero who hunts alone makes a party (the go_below card's lesson, said on the What next line instead). */
const PARTY_HOW = 'Invite a friend, or make a second hero: up to four of yours can hunt at once.';
/* A ground built for a party: a pocket of it needs one (hunt-grounds.js minParty). */
const partyGround = (hunt) => Object.values(HUNT_GROUNDS).some((g) => g.hunt === hunt && g.pockets.some((p) => (p.minParty || 1) > 1));

/**
 * The goal line after the guide, or null (nothing left to name). `facts`: { charLevel, role, skillLevel, defenseXp, land,
 * inParty } (skillLevel: the role's skill's level, or null when unknown; defenseXp: the server's Defense XP, or null when
 * unknown; land: the account's field, { planted: plots holding a crop, ready: { crop: ready plots } }, or null when the
 * server has not sent it; inParty: the hero sits in a party of 2+). Answers { id, title, text }; the id
 * changes whenever the text does (the hunt top bar redraws on a new id).
 */
export function nextGoal(facts) {
  if (!facts || !Number.isInteger(facts.charLevel)) return null;
  const lines = [];
  const ids = ['goal'];
  /* Defense at 0 XP means no armour worn (Tyler 2026-10-18: it trains only in armour). The fresh-hero play hit 117
     kills like that; the Shop's gloves and belts are the cheapest armour (designer 2026-10-22, the outfitter). */
  if (facts.defenseXp === 0) {
    lines.push('Your Defense isn\'t training: it rises only while you wear armor. The Shop sells gloves and belts.');
    ids.push('armour');
  }
  /* The land is the ACCOUNT's (2026-12-14-shared-farm), so the line reads the field, never this hero's Farming XP
     (v0.2.35 gate: a 0-XP hero was told "nothing grows" over 5 ready turnips the others planted). Empty land asks
     for a seed (P1 2026-10-22: farming sat at zero; the kit holds 8 turnip seeds) until any hero plants; ready
     crops ask for the harvest (any hero may take it) until they are taken; a field that is only growing says nothing. */
  const land = facts.land;
  if (land && land.planted === 0) {
    lines.push('Nothing grows on your land: open the Farm (J) and plant a seed. Turnips are ready in ' + CROPS.turnip.hours + ' hours, sooner if watered.');
    ids.push('farm');
  } else if (land && land.ready) {
    const ready = readyWords(land.ready);
    if (ready.words.length) {
      lines.push(listed(ready.words) + (ready.plots === 1 ? ' is' : ' are') + ' ready on your land: open the Farm (J) to harvest '
        + (ready.plots === 1 ? 'it.' : 'them.'));
      ids.push('harvest', ...ready.ids);
    }
  }
  /* THE PARTY PITCH (designer playtest 2026-10-24): the solo chain ends here, not behind a party card, so a hero with
     no party hears of the party ground its Level fits, and how to make a party: once, on whichever line names it. */
  const solo = facts.inParty !== true;
  const fits = solo ? groundHunts().find((h) => partyGround(h) && HUNT_INDEX[h].band[0] <= facts.charLevel && facts.charLevel <= HUNT_INDEX[h].band[1]) : null;
  if (fits) {
    lines.push(HUNT_INDEX[fits].name + ' fits your Level with a party. ' + PARTY_HOW);
    ids.push('party', fits);
  }
  const next = groundHunts().find((h) => HUNT_INDEX[h].band[0] > facts.charLevel);
  if (next) {
    const party = partyGround(next);
    /* The floor is a warning, not a lock (Tyler 2026-10-18), so the line names the Level it is built for. */
    lines.push('Next ground: ' + HUNT_INDEX[next].name + ', for Level ' + HUNT_INDEX[next].band[0] + ' and up' + (party ? ', with a party.' : '.')
      + (party && solo && !fits ? ' ' + PARTY_HOW : ''));
    ids.push(next, String(HUNT_INDEX[next].band[0]), ...(party && solo && !fits ? ['solo'] : []));
  }
  /* THE NEXT GEAR, BY LEVEL (Tyler 2026-10-24): the lowest Level above the hero's that opens a piece a player can get
     (skill-unlocks.js: reachable only) and the role wears; with no role from the server yet, every such piece. */
  const role = ROLE_SKILL[facts.role] ? facts.role : null;
  const gear = nextUnlock(LEVEL_REQ, facts.charLevel, role ? (id) => wornByRole(id, role) : null);
  const gat = /^Next at level (\d+): /.exec(gear);
  if (gat) {
    lines.push('Next gear at Level ' + gat[1] + ': ' + gear.slice(gat[0].length) + '.');
    ids.push('gear', gat[1]);
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
