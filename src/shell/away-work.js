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
import { SKILLS_DEF } from '../data/skills.js';
import { recipeInputs } from '../core/artisan.js';
import { whole } from '../render/format.js';
import { t } from '../render/player-text.js';
import { itemName, itemNameFor } from './widgets/bits.js';
import { heldOf, nameOf, skillsOf } from '../session/item-sections.js';
import { serverNowOf } from '../session/hunt-sections.js';
import { townWorkRunning } from '../session/town-poll.js';
import { actionMs, jobOf, leftOf, productOf, runsOf, workOf, workRow, yieldOf } from './town-work.js';

const TOWN_STAMP = /^town:(gather|artisan):([A-Za-z0-9_.-]+)$/;
/* A record settled this recently is the return's answer; an older one waits for the sign-in's settle. */
const SETTLED_WITHIN_MS = 2 * 60 * 1000;
/* the words live in src/data/text/away.js: what a running job is still doing, and what a gathering hero did, by skill */
const STILL = Object.freeze({ woodcutting: 'away.work_still_woodcutting', mining: 'away.work_still_mining', fishing: 'away.work_still_fishing', cooking: 'away.work_still_cooking' });
const DID = Object.freeze({ woodcutting: 'away.work_did_woodcutting', mining: 'away.work_did_mining', fishing: 'away.work_did_fishing' });

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
  /* `sl`: the skill level the server said with that XP (the return compares two server levels, never a curve of this build's) */
  return { s: keyOf(w), at: Math.floor(at), ...(sk ? { sx: sk.xp, sl: sk.level } : {}), ...(made ? { n: qtyOf(cs, made) } : {}) };
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
  if (w.kind === 'gather') return t(DID[w.skill] || DID.fishing, { node: w.row.name });
  const out = productOf(w);
  if (out && w.skill === 'cooking') return 'cooked ' + itemName(Object.keys(recipeInputs(w.row))[0] || out);
  if (out) return 'made ' + itemName(out);
  return 'fed the Great Hearth with ' + itemName(w.row.input);
}

/* Why a bench stopped, from the record: its run counted out, or an input ran out; a gatherer's stop names no reason it cannot know. */
function whyStopped(cs, w) {
  if (w.kind !== 'artisan') return '';
  const held = heldOf(cs) || {};
  if (runsOf(w.row, held) > 0) return leftOf(cs) === null ? ', the run is done' : '';
  const out = Object.entries(recipeInputs(w.row)).find(([id, need]) => (held[id] || 0) < need);
  return out ? ', out of ' + itemName(out[0]) : '';
}

/* HOW A JOB STILL RUNNING ENDS (retention dive 2026-11-20: 8 h at the Copper Rock for a 20-ore errand, the card said only "Still mining"): a
   counted job says the server's "N of M" and what the hero does then (1026-job-counts.sql); a bench run on All stops when its materials run
   out; a gathering job from before counts runs until stopped. */
function howItEnds(cs, w) {
  const job = jobOf(cs);
  if (job.left !== null && job.count !== null && job.count >= job.left) {
    return t('away.work_how_count', { done: whole(job.count - job.left), count: whole(job.count),
      after: t(job.next === 'hunt' ? 'away.work_then_hunt' : 'away.work_then_wait') });
  }
  if (w.kind === 'gather') return t('away.work_how_gather');
  const left = leftOf(cs);
  return left !== null ? t('away.work_how_left', { n: whole(left) }) : t('away.work_how_bench');
}

/* HOW A COUNTED JOB ENDED while the player was away, from the server's record of it (bench_run.ended), or null when the record is not this
   stamp's job: "Done, 20 of 20. Went back to hunting." / "It stopped at 12 of 20, out of Copper Ore." */
function endedWords(cs, w, was) {
  const e = jobOf(cs).ended;
  if (!e || e.kind !== w.kind || e.id !== w.id || !(Date.parse(e.at) >= was.at)) return null;
  const n = { done: whole(e.done), count: whole(e.count) };
  if (e.end !== 'count') return t('away.work_end_stopped', n) + whyStopped(cs, w) + '.';
  const then = e.next !== 'hunt' ? t('away.work_end_waited')
    : e.next_state === 'started' ? t('away.work_end_hunting')
      : e.next_state === 'pending' ? t('away.work_end_going')
        : t('away.work_end_no_hunt', { why: noHuntWords(e.why) });
  return t('away.work_end_count', n) + ' ' + then;
}

/* Why a THEN of hunt did not start, in a few plain words (hr_job_next_start's why, or the hunt door's own refusal). */
function noHuntWords(why) {
  return why === 'no_stamina' ? 'no stamina' : why === 'no_hunt' ? 'no hunt to go back to' : why === 'moved_on' ? 'you gave it something else'
    : why === 'party_hunt' ? 'it is in a party' : why === 'late' ? 'it was too late' : 'the hunt said no';
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
  if (gained > 0) parts.push('+' + whole(gained) + ' ' + itemNameFor(made, gained));
  const sk = (skillsOf(cs) || {})[w.skill];
  const skill = (SKILLS_DEF[w.skill] && SKILLS_DEF[w.skill].name) || w.skill;
  const xp = sk && Number.isSafeInteger(was.sx) ? sk.xp - was.sx : 0;
  if (xp > 0) { const from = Number.isSafeInteger(was.sl) && was.sl >= 1 ? was.sl : null; parts.push(from !== null && sk.level > from ? skill + ' ' + from + ' to ' + sk.level : '+' + whole(xp) + ' ' + skill + ' XP'); }
  if (!parts.length) return null;
  const goes = runningWork(cs);
  const still = !!goes && keyOf(goes) === was.s;
  const ran = gained > 0 ? Math.ceil(gained / yieldOf(w)) * actionMs(cs, w) : 0;
  const when = ran >= 60000 && ran < now - was.at ? ' about ' + awayWords(ran) + ' in' : '';
  const ended = still ? null : endedWords(cs, w, was);
  const tail = still ? ' ' + t(STILL[w.skill] || 'away.work_still') + ' ' + howItEnds(cs, w)
    : ended ? ' ' + ended : ' It stopped' + when + whyStopped(cs, w) + '.';
  const name = nameOf(cs) || 'Hero';
  const who = name + ' ' + didWords(w), facts = t('away.card_facts', { facts: parts.join(', ') }) + tail;
  return {
    id: 'away:' + was.s.slice(0, 64) + ':' + was.at, kind: 'away', session: null, work: was.s, still,
    /* a job still running: its press is the window that stops or changes it (windows/away.js OPENS.work) */
    action: still ? 'work' : made ? 'bag' : 'show', button: still ? t('away.work_change') : made ? 'Open your inventory' : 'See your hero',
    /* the away card's (windows/away.js): the hero, the absence, and the line after its head ("Tess mined the Copper Rock. +4,303 Copper Ore.") */
    facts: { name, gone: now - was.at, body: t('away.card_work', { who, facts }) },
    text: t('away.card_head', { time: awayWords(now - was.at), who }) + ' ' + facts,
  };
}
