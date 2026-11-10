// ════════════════════════════════════════════════════════════════════════
// src/shell/away-work.js — "WHILE YOU WERE AWAY", FOR A HERO WORKING IN TOWN.
//
// The crafter's panel, 2026-11-01: 8 h at the Iron Rock made 4,303 ore and took Mining from 26 to 47, and the return named a hunt
// that ended before they left; 50 min at the bench named an old hunt; a hero who had never hunted got no line at all. The line now
// says what the gathering or the bench did, the same way the hunt's does (away-recap.js): every number is a difference of two
// server answers, the stamp's and the record's. Nothing here is spendable.
//
// THE STAMP IS AS OLD AS ITS NUMBERS. A town job is paid only when something settles it, so the record's skill and bag are true as of
// the server's watermark (`state.accrued_to`), and that is the stamp's `at`: the line's time and its numbers are one stamp's. The
// viewed hero's job is settled at least every STAMP_EVERY_MS (town-poll.js settleStaleTown), so a stamp overstates an absence by less
// than the shortest one the line speaks of, as a hunt's does.
//
// THE RETURN IS JUDGED AFTER THE SETTLE. The first envelope back may be from before the sign-in's settle: until the watermark has moved
// past the stamp the line waits (awayWorkSettled), and so does the stamp. "It stopped about 25 min in" is the actions the server paid
// times the action time for the tool the server says the hero holds: display only, and worded as an estimate.
// ════════════════════════════════════════════════════════════════════════
import { SKILLS_DEF } from '../data/skills.js?v=0.2.115';
import { recipeInputs } from '../core/artisan.js?v=0.2.115';
import { skillLevelFromXp } from '../core/xp.js?v=0.2.115';
import { whole } from '../render/format.js?v=0.2.115';
import { itemName } from './widgets/bits.js?v=0.2.115';
import { heldOf, nameOf, skillsOf } from '../session/item-sections.js?v=0.2.115';
import { serverNowOf } from '../session/hunt-sections.js?v=0.2.115';
import { townWorkRunning } from '../session/town-poll.js?v=0.2.115';
import { actionMs, leftOf, productOf, runsOf, workOf, workRow, yieldOf } from './town-work.js?v=0.2.115';

const TOWN_STAMP = /^town:(gather|artisan):([A-Za-z0-9_.-]+)$/;
/* A record settled this recently is the return's answer; an older one waits for the sign-in's settle. */
const SETTLED_WITHIN_MS = 2 * 60 * 1000;
const STILL = Object.freeze({ woodcutting: 'Still chopping.', mining: 'Still mining.', fishing: 'Still fishing.', cooking: 'Still cooking.' });

const stateOf = (cs) => (typeof cs.read === 'function' ? cs.read('state') : null);
const huntSection = (cs) => (typeof cs.read === 'function' ? cs.read('hunt') : null);
const qtyOf = (cs, id) => { const inv = typeof cs.read === 'function' ? cs.read('inventory') : null; const n = inv && inv[id]; return Number.isSafeInteger(n) && n > 0 ? n : 0; };
const keyOf = (w) => 'town:' + w.kind + ':' + w.id;

/** Is this stamp a town job's? */
export const isWorkStamp = (was) => !!was && TOWN_STAMP.test(was.s);

/** The job the server says runs now, or null. */
function runningWork(cs) {
  const w = workOf(cs);
  return w && townWorkRunning(stateOf(cs), huntSection(cs)) ? w : null;
}

/** The numbers to stamp for the job running now (true as of the server's watermark), or null when none runs. */
export function workStampOf(cs) {
  const w = runningWork(cs);
  const st = stateOf(cs);
  const at = w && st ? Date.parse(st.accrued_to) : NaN;
  if (!w || !Number.isFinite(at)) return null;
  const sk = (skillsOf(cs) || {})[w.skill];
  const made = productOf(w);
  return { s: keyOf(w), at: Math.floor(at), ...(sk ? { sx: sk.xp } : {}), ...(made ? { n: qtyOf(cs, made) } : {}) };
}

/** Has the job in this stamp been paid since it was stamped? False only while the line must wait for the settle. Pure. */
export function awayWorkSettled(cs, was, minMs) {
  const now = serverNowOf(cs);
  if (!Number.isFinite(now) || now - was.at < minMs) return true;
  const w = runningWork(cs);
  if (!w || keyOf(w) !== was.s) return true;   // the engine pays before it stops or switches a job
  const paid = Date.parse(stateOf(cs).accrued_to);
  return paid > was.at && now - paid < SETTLED_WITHIN_MS;
}

/* What the hero did, as the line says it. */
function didWords(w) {
  if (w.kind === 'gather') return (w.skill === 'woodcutting' ? 'chopped the ' : w.skill === 'mining' ? 'mined the ' : 'fished at the ') + w.row.name;
  const out = productOf(w);
  if (out && w.skill === 'cooking') return 'cooked ' + itemName(Object.keys(recipeInputs(w.row))[0] || out);
  if (out) return 'made ' + itemName(out);
  return 'fed the Great Hearth with ' + itemName(w.row.input);
}

/* Why a bench stopped, from the record: its run counted out, or an input ran out; a gatherer's stop names no reason it cannot know. */
function whyStopped(cs, w) {
  if (w.kind !== 'artisan') return '';
  const held = heldOf(cs) || {};
  if (runsOf(w.row, held) > 0) return leftOf(cs) === null ? ': the run is done' : '';
  const out = Object.entries(recipeInputs(w.row)).find(([id, need]) => (held[id] || 0) < need);
  return out ? ': out of ' + itemName(out[0]) : '';
}

/**
 * The away line for a stamped town job, or null when nothing came of it. Pure.
 * @param {(ms: number) => string} awayWords  away-recap.js's "1 h 58 min"
 */
export function awayWorkLineOf(cs, was, awayWords) {
  const m = TOWN_STAMP.exec(was.s);
  const w = m && workRow(m[1], m[2]);
  const now = serverNowOf(cs);
  if (!w || !Number.isFinite(now)) return null;
  const parts = [];
  const made = productOf(w);
  const gained = made && Number.isSafeInteger(was.n) ? qtyOf(cs, made) - was.n : 0;
  if (gained > 0) parts.push('+' + whole(gained) + ' ' + itemName(made));
  const sk = (skillsOf(cs) || {})[w.skill];
  const skill = (SKILLS_DEF[w.skill] && SKILLS_DEF[w.skill].name) || w.skill;
  const xp = sk && Number.isSafeInteger(was.sx) ? sk.xp - was.sx : 0;
  if (xp > 0) { const from = skillLevelFromXp(w.skill, was.sx); parts.push(sk.level > from ? skill + ' ' + from + ' to ' + sk.level : '+' + whole(xp) + ' ' + skill + ' XP'); }
  if (!parts.length) return null;
  const goes = runningWork(cs);
  const still = !!goes && keyOf(goes) === was.s;
  const ran = gained > 0 ? Math.ceil(gained / yieldOf(w)) * actionMs(cs, w) : 0;
  const when = ran >= 60000 && ran < now - was.at ? ' about ' + awayWords(ran) + ' in' : '';
  const tail = still ? ' ' + (STILL[w.skill] || 'Still at the bench.') : ' It stopped' + when + whyStopped(cs, w) + '.';
  const name = nameOf(cs) || 'Your hero';
  return {
    id: 'away:' + was.s.slice(0, 64) + ':' + was.at, kind: 'away', session: null, work: was.s, still,
    action: made ? 'bag' : 'show', button: made ? 'Open your inventory' : 'See your hero',
    text: 'While you were away (' + awayWords(now - was.at) + '), ' + name + ' ' + didWords(w) + ': ' + parts.join(', ') + '.' + tail,
  };
}
