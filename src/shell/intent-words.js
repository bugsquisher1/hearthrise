// ════════════════════════════════════════════════════════════════════════
// src/shell/intent-words.js — WHAT A REFUSED INTENT MEANS, IN PLAIN WORDS.
//
// PURE. Every window says why the server refused, the same way, from ONE table
// (src/data/refusal-words.js): a code's own line, else its family's, else a
// fallback that still says nothing was changed. A refusal that names an item
// the hero is short of says the numbers ("Steel Helm needs Level 30 — you're
// 28.": gear by Level, a supply by its skill), the SERVER's own; a house
// build short of a material says the server's bag and Storage counts. The
// server's value stays on screen either way: nothing changed before it answered.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_INDEX } from '../data/hunts.js?v=0.2.60';
import { ITEMS } from '../data/items.js?v=0.2.60';
import { REFUSAL_WORDS, REFUSAL_FAMILIES, REFUSAL_FALLBACK, REFUSAL_VERB_WORDS } from '../data/refusal-words.js?v=0.2.60';
import { skillsOf } from '../session/item-sections.js?v=0.2.60';
import { levelOf } from '../session/character-sections.js?v=0.2.60';
import { needOf, needWords } from './item-lore.js?v=0.2.60';
import { whole } from '../render/format.js?v=0.2.60';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.60';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** The line a code reads as by its family, or null (src/data/refusal-words.js REFUSAL_FAMILIES). */
function familyWords(code) {
  for (const [re, words] of REFUSAL_FAMILIES) {
    const m = re.exec(String(code));
    if (m) return typeof words === 'function' ? words(m) : words;
  }
  return null;
}

/** The plain-words reason for a refusal code: the verb's own line for it, the code's own line, its family's, else the fallback. */
export function refusalWords(code, verb) {
  const byVerb = typeof verb === 'string' && own(REFUSAL_VERB_WORDS, verb) ? REFUSAL_VERB_WORDS[verb] : null;
  if (byVerb && typeof code === 'string' && own(byVerb, code)) return byVerb[code];
  if (typeof code === 'string' && own(REFUSAL_WORDS, code)) return REFUSAL_WORDS[code];
  return (typeof code === 'string' && familyWords(code)) || REFUSAL_FALLBACK;
}

/**
 * "Steel Helm needs Level 30 — you're 28." for an item the server refused on its requirement: the item the
 * server's answer names, what its catalogue row requires (the hero's Level for gear, a skill for ammo: item-lore.js
 * needOf) and the server's own number, from the refusal itself when it says one (hr_apply's `have`, hr_item_
 * requirement_unmet), else from the character's sections. Null when the item names no requirement.
 */
function requirementWords(item, cs, counts) {
  const it = typeof item === 'string' && own(ITEMS, item) ? ITEMS[item] : null;
  if (it && it.reqSkill && counts && Number.isInteger(counts.have) && counts.need === it.reqLv) {
    return it.n + ' n' + needWords(it.reqSkill, it.reqLv, counts.have).slice(1) + '.';
  }
  const lv = cs ? levelOf(cs) : null;
  const need = it ? needOf(item, cs ? skillsOf(cs) : null, lv ? lv.level : null) : null;
  return need ? it.n + ' n' + need.text.slice(1) + '.' : null;
}

/**
 * "You need Cooking 15 to cook Raw Wolf Meat. You have 4." — a skill short of what a town action asks (Tyler 10-25:
 * "if I try to do something and can't, tell me why"). `need` is the catalogue row's level (the server's catalogue is
 * generated from it), `have` the server's skill level (null: not said), `doing` the action's own words ("cook Raw
 * Wolf Meat"). The client's pre-check and the server's refusal say this one sentence. Pure.
 */
export function skillShortWords(skill, need, have, doing) {
  const name = (SKILLS_DEF[skill] && SKILLS_DEF[skill].name) || String(skill);
  return 'You need ' + name + ' ' + need + (doing ? ' to ' + doing : '') + '.' + (Number.isInteger(have) ? ' You have ' + have + '.' : '');
}

/* "You need Level 16 to enter Wolf Den. You are Level 8." — hr_hunt_enter's activity_locked names the ground's floor and
   the hero's Level (refusal.js floorOf); every number is the server's. */
function floorWords(f) {
  const h = f.hunt && HUNT_INDEX[f.hunt] ? HUNT_INDEX[f.hunt].name : 'that hunt';
  return 'You need Level ' + f.level + ' to enter ' + h + '.' + (Number.isInteger(f.have) ? ' You are Level ' + f.have + '.' : '');
}

/* Why one seat held the party's start back, after its name. */
const SEAT_WORDS = Object.freeze({
  away: 'is away', no_stamina: 'has no stamina left', hunt_open: 'is still hunting', activity_running: 'is busy in town',
  insufficient_item: 'is short of supplies', activity_locked: 'is too low a level for that hunt', hunts_paused: 'cannot go while hunts are paused',
  too_many_playing: 'would be a fifth hero playing on that account', too_many_playing_here: 'would be a fifth hero playing from that connection',
});

/**
 * A refused intent in plain words, with the server's detail when it sent one. A start that waited names every seat that
 * was not ready ("Nobody went in: Mira is away; Oren has no stamina left."); an
 * own character the server named says who; an item refused on its requirement says
 * the numbers (with `cs`, the hero's own level too). Pure.
 */
export function refusalText(r, cs) {
  const seats = r && Array.isArray(r.seats) ? r.seats : [];
  if (r && r.error === 'not_ready' && seats.length) {
    return 'Nobody went in: ' + seats.map((x) => x.name + ' ' + (x.error === 'hunt_open' && x.hunt && HUNT_INDEX[x.hunt]
      ? 'is still hunting in ' + HUNT_INDEX[x.hunt].name : SEAT_WORDS[x.error] || 'is not ready')).join('; ') + '.';
  }
  /* A name the rules refuse for what it says, not its length (hr_validate_display_name reserved / blocked). */
  if (r && r.error === 'bad_name' && (r.reason === 'reserved' || r.reason === 'blocked')) return refusalWords('bad_name_rule');
  if (r && r.error === 'member_hunting' && r.name) return r.name + ' is hunting. Invite them once that hunt ends.';
  if (r && r.error === 'activity_locked' && r.floor) return floorWords(r.floor);
  /* A named fuel above the hero's Inner Flame (hr_hearth_burn sends both levels): "Den Knot needs Inner Flame 3. You have 1." */
  if (r && r.error === 'flame_too_low' && Number.isInteger(r.need)) {
    return (r.item && own(ITEMS, r.item) ? ITEMS[r.item].n : 'That fuel') + ' needs Inner Flame ' + r.need + '.' + (Number.isInteger(r.have) ? ' You have ' + r.have + '.' : '');
  }
  if (r && r.error === 'hearth_busy' && Number.isInteger(r.waitS)) {
    return 'The Great Hearth is already burning named fuels. Try again in ' + Math.max(1, Math.ceil(r.waitS / 60)) + ' min.';
  }
  /* A town action above the server's skill level: town-work.js names the skill, both levels and the action. */
  if (r && r.error === 'level_too_low' && r.skill && Number.isInteger(r.skill.need)) return skillShortWords(r.skill.id, r.skill.need, r.skill.have, r.skill.doing);
  if (r && (r.error === 'requirement_not_met' || r.error === 'level_too_low') && r.item) {
    const w = requirementWords(r.item, cs, r.counts);
    if (w) return w;
  }
  /* A house build one material short across the bag and Storage (2027-01-10-house-from-storage.sql): the server's counts. */
  const c = r && r.error === 'insufficient_item' && r.item && own(ITEMS, r.item) ? r.counts : null;
  if (c && c.bag !== null && c.storage !== null) {
    return 'Not enough ' + ITEMS[r.item].n + ': you have ' + whole(c.bag) + ' in your bag and ' + whole(c.storage)
      + ' in Storage, and it takes ' + whole(c.need) + '.';
  }
  return refusalWords(r && r.error, r && r.verb);
}

/**
 * Run one intent for a window: its controls go off at once (`sc.pending`),
 * `busy` shows while the server works, and the answer's words replace it.
 * The window's numbers change only from the re-read envelope.
 * @param {{pending:boolean, msg:string}} sc   the window's scratch
 * @param {() => void} repaint
 * @param {() => Promise<{ok:boolean, error?:string}>} send
 * @param {string} busy                        e.g. 'Selling…'
 * @param {(r: object) => string} [done]       the line after a success ('' for none)
 * @param {object} [cs]                         the CharacterSession, so a refusal can say the hero's own numbers
 */
export async function runIntent(sc, repaint, send, busy, done, cs) {
  if (sc.pending) return { ok: false, error: 'busy' };
  sc.pending = true;
  sc.msg = busy;
  repaint();
  let r;
  try { r = await send(); } catch (e) { r = { ok: false, error: 'network' }; }
  sc.pending = false;
  sc.msg = r.ok ? (done ? done(r) : '') : refusalText(r, cs);
  repaint();
  return r;
}
