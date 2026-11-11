// ════════════════════════════════════════════════════════════════════════
// src/session/training-intents.js — THE TRAINING YARD'S PRESSES (supabase/migrations/2027-04-06-training-yard.sql).
//
//   startTraining(account, cs, {skill, hours, keep})  ONE hr_training_start: a skill, the yard, whole hours (or null: until
//                     stopped) and the gold the player wants to KEEP (which can only stop training sooner). Never a price, a
//                     rate, a time or an amount: the server reads the hero's Level, prices it and charges by the minute. A
//                     gather or bench window the engine must settle first (settle_first) is settled (one hello) and asked
//                     ONCE more under a new key. On ok the character is RE-READ, so the section and the purse change only
//                     from the envelope.
//   stopTraining(account, cs)   ONE hr_training_stop: the server pays the run to now and the hero goes idle.
//   leaveTraining(account, cs)  before a town job or a setup change: the stop, when the server's pointer says the hero trains
//                     (CLAUDE.md §1: the client stops the run by its own verb, then asks for the job; the engine never
//                     settles a training pointer, set-activity.js SERVER_SETTLED_KINDS).
// Each press is one ask on the account's intent ledger (askVia), so the pressed control waits and the play cap's popup hears
// it (windows/play-cap.js). The viewed hero's tick (hr_training_tick, about once a minute) is ./training-poll.js.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.118';
import { newIdem } from './catch-up.js?v=0.2.118';
import { TRAINING } from '../data/training.js?v=0.2.118';
import { trainingNow } from './training-sections.js?v=0.2.118';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v) => (Number.isSafeInteger(v) ? v : null);
const usable = (account, cs) => !!account && !!account.server && typeof account.server.rpc === 'function'
  && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot);
const bodyOf = (ans) => (ans && isObj(ans.body) ? ans.body : {});
const yes = (ans) => !!(ans && ans.ok && bodyOf(ans).ok === true);

/* A refused answer with the server's own numbers, for the words (src/shell/training-words.js): `verb` picks its lines. */
function refused(ans, verb) {
  const b = bodyOf(ans);
  return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', verb,
    level: int(b.level), need: int(b.need), purse: int(b.purse), keep: int(b.keep), min: int(b.min), max: int(b.max) };
}

/** The whole hours a "Stop after" may name (null: until stopped), from the catalogue's bounds; the server checks them again. Pure. */
function hoursOk(hours) {
  const b = TRAINING.stopAfterHours;
  return hours === null || (Number.isInteger(hours) && hours >= b.min && hours <= b.max);
}

/** A "Keep at least" the server can be asked for: a whole number of gold, 0 to the catalogue's most. Pure. */
export function keepOk(keep) {
  return Number.isSafeInteger(keep) && keep >= 0 && keep <= TRAINING.keepGoldMax;
}

/** Start training one skill at the yard. Resolves to { ok: true, skill } or the refusal { ok: false, error, verb, ... }. */
export function startTraining(account, cs, o) {
  const skill = o && o.skill, hours = o && o.hours !== undefined ? o.hours : null, keep = o && o.keep;
  if (!usable(account, cs) || !TRAINING.skills.includes(skill) || !hoursOk(hours) || !keepOk(keep)) {
    return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'training_start' });
  }
  return askVia(cs, 'training_start', async () => {
    const ask = () => account.server.rpc('hr_training_start', { p_slot: cs.slot, p_skill: skill, p_place: 'yard',
      p_stop_after_h: hours, p_keep_gold: keep, p_idem: newIdem() });
    let ans = await ask();
    /* A gather or bench window over the server's limit is the engine's to settle first: one hello, then ONE fresh ask
       (the first wrote nothing, so the second is a new decision on the settled hero). */
    if (bodyOf(ans).error === 'settle_first' && typeof cs.hello === 'function') {
      try { await cs.hello(); } catch (e) { /* the second answer says what the server holds */ }
      ans = await ask();
    }
    if (!yes(ans)) return refused(ans, 'training_start');
    if (typeof cs.load === 'function') await cs.load();
    return { ok: true, skill };
  });
}

/** Stop training: the server pays the run to now. Resolves to { ok: true } or the refusal. */
export function stopTraining(account, cs) {
  if (!usable(account, cs)) return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'training_stop' });
  return askVia(cs, 'training_stop', async () => {
    const ans = await account.server.rpc('hr_training_stop', { p_slot: cs.slot, p_idem: newIdem() });
    if (!yes(ans)) return refused(ans, 'training_stop');
    if (typeof cs.load === 'function') await cs.load();
    return { ok: true };
  });
}

/**
 * Before another job: stop the run when the server's pointer says the hero trains, else nothing. A run that already ended
 * (not_training: the sweep, a "Stop after", another device) is what was wanted. Resolves to { ok: true } or the stop's refusal.
 */
export async function leaveTraining(account, cs) {
  if (!trainingNow(cs)) return { ok: true, skipped: true };
  const r = await stopTraining(account, cs);
  return r.ok || r.error === 'not_training' ? { ok: true } : r;
}
