// ════════════════════════════════════════════════════════════════════════
// src/shell/after-hunt.js — WHAT THE HERO DID AFTER ITS HUNT ENDED, AND WHAT WOULD HAVE FILLED THE TIME.
//
// The designer's second night (re-read 2026-11-11, #2): stamina ran out after 3 h 14 m and the player came back to
// "The hunt has ended 5 h 45 min ago" with nothing saying the hero had sat in town for most of the night, or what
// would have filled it. An automatic end (src/data/hunt-sessions.js RESUME_AFTER_END) walks the hero home and puts it
// back on its last gathering job; with none, it idles. So the line says one of two things, from server fields only:
//   went    the server's pointer is a town job whose `active_since` is the walk home's end (the resume stamps exactly
//           ended_at + the ground's travel, 2027-03-25-death-share.sql step 7): "Then Wrenna came home and went back
//           to mining the Copper Rock."
//   waited  the pointer is idle and was not moved since the end: how long the hero has stood in town, and the ONE next
//           thing that would have filled it, chosen by the end reason (NEXT below).
// Anything else (a job the player started or stopped after the end, a pointer the server has not sent) says nothing:
// the browser never guesses what the hero did.
//
// WHY THE NEXT LINES ARE THESE (rules of record, not the brief's draft): a Blessing cuts what a death costs and
// touches no stamina, and nothing starts a hunt by itself, so "a Blessing or a rest would have let the next hunt
// start" is false and is not said. What fills idle time after ANY automatic end is a gathering job, because that is
// what the server resumes (a bench never is: hr_resume_has_inputs). A limit the player set (`hours`) is filled by a
// longer hunt; a bag that ran dry by packing more; a purse that ran dry by keeping gold or packing your own.
//
// Display only: nothing here is spendable or gates an intent (CLAUDE.md §6).
// ════════════════════════════════════════════════════════════════════════
import { t } from '../render/player-text.js?v=0.2.128';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.128';
import { RESUME_AFTER_END } from '../data/hunt-sessions.js?v=0.2.128';
import { townActivityWords } from '../session/party-sections.js?v=0.2.128';
import { huntOf, serverNowOf } from '../session/hunt-sections.js?v=0.2.128';
import { nameOf } from '../session/item-sections.js?v=0.2.128';

/* Shorter than this in town is the walk home settling, not time the hero waited (the away card's own shortest absence). */
export const WAITED_FROM_MS = 10 * 60 * 1000;
/* The resume stamps active_since to the walk home's end exactly; a second covers the timestamp's rounding. */
const SAME_MS = 1000;
/* An idle pointer is stamped when the settle ends the hunt; one stamped later than this means the player moved it since. */
const MOVED_AFTER_MS = 10 * 60 * 1000;

/* The one next thing per end reason; every other automatic end (stamina, a death, a stop rule, a party end ...) is
   filled by a gathering job, which the server resumes after each of them. */
const NEXT = Object.freeze({ hours: 'away.next_longer', heals_out: 'away.next_food', ammo_out: 'away.next_ammo', runes_out: 'away.next_runes', gold_out: 'away.next_gold' });
const TOWN_KINDS = Object.freeze(['gather', 'artisan', 'training']);

/** "1 h 58 min", "25 min". */
export function spanWords(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min';
}

/**
 * What the hero did after hunt `h` (huntOf's shape) ended, from the server's `state` section, or null when the server
 * does not say. Pure.
 * @returns {{kind: 'went', went: string}|{kind: 'waited', idleMs: number, next: string}|null}
 */
export function afterHuntOf(st, h, nowMs) {
  if (!h || !h.ended || !Number.isFinite(h.endedAtMs) || !Number.isFinite(nowMs) || !RESUME_AFTER_END.includes(h.endReason)) return null;
  if (!st || typeof st !== 'object') return null;
  const ground = HUNT_INDEX[h.huntId];
  const home = h.endedAtMs + (ground && Number.isFinite(ground.travelS) ? ground.travelS * 1000 : 0);
  const since = typeof st.active_since === 'string' ? Date.parse(st.active_since) : NaN;
  if (TOWN_KINDS.includes(st.active_kind)) {
    const doing = townActivityWords(st);
    return doing && Number.isFinite(since) && Math.abs(since - home) <= SAME_MS ? { kind: 'went', went: doing } : null;
  }
  /* player_state.active_kind is NOT NULL DEFAULT 'idle' (2026-08-11-player-state.sql): a section without it has not said */
  if (st.active_kind !== 'idle') return null;
  if (Number.isFinite(since) && since > home + MOVED_AFTER_MS) return null;
  return { kind: 'waited', idleMs: Math.max(0, nowMs - home), next: NEXT[h.endReason] || 'away.next_gather' };
}

/** The after-the-hunt sentences for `name`, or '' when the server does not say (afterHuntOf). Pure. */
export function afterHuntWords(st, h, nowMs, name) {
  const a = afterHuntOf(st, h, nowMs);
  if (!a) return '';
  if (a.kind === 'went') return t('away.after_went', { name, doing: a.went });
  const next = t(a.next, a.next === 'away.next_gather' ? { name } : undefined);
  return (a.idleMs >= WAITED_FROM_MS ? t('away.after_waited', { name, time: spanWords(a.idleMs) }) + ' ' : '') + next;
}

/**
 * THE HUNT VIEWED: the summary card's after-the-hunt line for summary `id`, or '' (src/shell/windows/hunt-summary.js). Only the
 * hunt the server's `hunt` section holds now, ended: an older summary in the list is history and says nothing of today. Pure.
 */
export function endCardAfter(cs, id) {
  const h = huntOf(cs);
  if (!h || !h.ended || h.sessionId !== id || typeof cs.read !== 'function') return '';
  return afterHuntWords(cs.read('state'), h, serverNowOf(cs), nameOf(cs) || t('away.your_hero'));
}
