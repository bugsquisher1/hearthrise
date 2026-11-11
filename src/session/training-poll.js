// ════════════════════════════════════════════════════════════════════════
// src/session/training-poll.js — THE TRAINING YARD'S SETTLE, WHILE SOMEONE WATCHES IT.
//
// A training run is paid by the database from the server's clock and the hero's Level (2027-04-06-training-yard.sql
// hr_training_pay): nothing here moves a number. While the hero is on screen and the server says it trains, the shell's
// display tick asks ONE hr_training_tick about once a minute, timed by the run's own mark (settled_to) and the server's
// clock, a little after the server's own minute (TRAINING.server.ownerMinSeconds, the catalogue's row) so the answer pays,
// and at once when its "Stop after" is due. A tick that paid is followed by ONE re-read (hr_load): the purse, the skill and
// the section on screen are the newest server answer, replaced, never added to (§6). The page closed or hidden, nothing is
// asked: the server's sweep (pg_cron, every minute) keeps paying the run, and the next read shows it.
// Background traffic: not a press, so not on the intent ledger, and a refusal only waits for the next tick.
// ════════════════════════════════════════════════════════════════════════
import { TRAINING } from '../data/training.js?v=0.2.118';
import { trainingOf, trainingNow } from './training-sections.js?v=0.2.118';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const OWNER_MS = TRAINING.server.ownerMinSeconds * 1000;
const SLACK_MS = 2000;
/* Never two ticks closer than this: a tick the server did not pay (a clock apart, a refused or lost answer) waits. */
export const TICK_FLOOR_MS = 20000;
const TICKS = new WeakMap();

/** Is a tick due? `run` is the section's, `serverNowMs` the server's clock now, `lastAskMs`/`nowMs` the display clock. Pure. */
export function trainingTickDue(run, serverNowMs, lastAskMs, nowMs) {
  if (!run || !Number.isFinite(serverNowMs)) return false;
  if (Number.isFinite(lastAskMs) && nowMs - lastAskMs < TICK_FLOOR_MS) return false;
  const due = Math.min(run.settledTo + OWNER_MS, run.stopAt === null ? Infinity : run.stopAt) + SLACK_MS;
  return serverNowMs >= due;
}

const serverNowOf = (cs) => { const v = typeof cs.serverNow === 'function' ? cs.serverNow() : null; return Number.isFinite(v) ? v : Date.now(); };

/** The shell's display tick, for the hero on screen (`account`: its AccountSession, the link). Returns true when it asked. */
export function watchTraining(account, cs) {
  if (!account || !account.server || typeof account.server.rpc !== 'function' || !cs || cs.status !== 'ready'
    || !Number.isInteger(cs.slot) || !trainingNow(cs)) return false;
  const tr = trainingOf(cs);
  if (!tr || !tr.run) return false;
  let a = TICKS.get(cs);
  if (!a) { a = { at: -Infinity, busy: false }; TICKS.set(cs, a); }
  const now = typeof cs.now === 'function' ? cs.now() : Date.now();
  if (a.busy || !trainingTickDue(tr.run, serverNowOf(cs), a.at, now)) return false;
  a.busy = true;
  a.at = now;
  const held = cs.record ? cs.record.version : null;
  Promise.resolve(account.server.rpc('hr_training_tick', { p_slot: cs.slot }))
    .then((ans) => {
      const b = ans && ans.ok && isObj(ans.body) && ans.body.ok === true ? ans.body : null;
      /* it paid, or the hero moved on the server since this record: the whole character again (the purse, the skill, the section) */
      const moved = !!b && (isObj(b.settled) || (Number.isSafeInteger(b.version) && b.version !== held));
      return moved && typeof cs.load === 'function' ? cs.load() : false;
    })
    .catch(() => false)
    .then(() => { a.busy = false; });
  return true;
}
