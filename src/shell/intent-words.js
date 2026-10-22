// ════════════════════════════════════════════════════════════════════════
// src/shell/intent-words.js — WHAT A REFUSED INTENT MEANS, IN PLAIN WORDS.
//
// PURE. Every window says why the server refused, the same way, from ONE table
// (src/data/refusal-words.js): a code's own line, else its family's, else a
// fallback that still says nothing was changed. A refusal that names an item
// the hero's skill is too low for says the numbers ("Needs Defense 20 (you have
// 1)."), from the item's requirement and the SERVER's skill levels. The
// server's value stays on screen either way: nothing changed before it answered.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_INDEX } from '../data/hunts.js?v=0.2.28';
import { ITEMS } from '../data/items.js?v=0.2.28';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.28';
import { REFUSAL_WORDS, REFUSAL_FAMILIES, REFUSAL_FALLBACK } from '../data/refusal-words.js?v=0.2.28';
import { skillsOf } from '../session/item-sections.js?v=0.2.28';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** The line a code reads as by its family, or null (src/data/refusal-words.js REFUSAL_FAMILIES). */
function familyWords(code) {
  for (const [re, words] of REFUSAL_FAMILIES) {
    const m = re.exec(String(code));
    if (m) return typeof words === 'function' ? words(m) : words;
  }
  return null;
}

/** The plain-words reason for a refusal code: its own line, its family's, else the fallback. */
export function refusalWords(code) {
  if (typeof code === 'string' && own(REFUSAL_WORDS, code)) return REFUSAL_WORDS[code];
  return (typeof code === 'string' && familyWords(code)) || REFUSAL_FALLBACK;
}

/**
 * "Needs Defense 20 (you have 1)." for an item the server refused on its skill
 * requirement: the item's reqSkill / reqLv and, with a character, its level as
 * the server projects it. Null when the item names no requirement.
 */
function requirementWords(item, cs) {
  const it = typeof item === 'string' && own(ITEMS, item) ? ITEMS[item] : null;
  if (!it || !it.reqSkill || !Number.isInteger(it.reqLv)) return null;
  const sk = cs ? skillsOf(cs) : null;
  const have = sk && sk[it.reqSkill] ? sk[it.reqSkill].level : null;
  const name = SKILLS_DEF[it.reqSkill] ? SKILLS_DEF[it.reqSkill].name : it.reqSkill;
  return it.n + ' needs ' + name + ' ' + it.reqLv + (have !== null ? ' (you have ' + have + ').' : '.');
}

/* Why one seat held the party's start back, after its name. */
const SEAT_WORDS = Object.freeze({
  away: 'is away', no_stamina: 'has no stamina left', hunt_open: 'is still hunting', activity_running: 'is busy in town',
  insufficient_item: 'is short of supplies', activity_locked: 'is too low a level for that hunt', hunts_paused: 'cannot go while hunts are paused',
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
  if (r && r.error === 'member_hunting' && r.name) return r.name + ' is hunting. Invite them once that hunt ends.';
  if (r && (r.error === 'requirement_not_met' || r.error === 'level_too_low') && r.item) {
    const w = requirementWords(r.item, cs);
    if (w) return w;
  }
  return refusalWords(r && r.error);
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
