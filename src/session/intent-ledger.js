// ════════════════════════════════════════════════════════════════════════
// src/session/intent-ledger.js — WHICH OF THE PLAYER'S ASKS ARE IN FLIGHT.
//
// PURE. One ledger per server link (src/session/server.js), so one per signed-in
// account: every CharacterSession, the party intents, the account's own asks
// (create a hero, open a character) and the social sends share it. An ASK is
// what a press waits on: an intent, or a read the player asked for (the party
// finder, opening a character). Background traffic (the hunt poll, a frame's
// gap-closing hello, the residue put, town moves) is never tracked.
//
//   track(verb, run)   run() is the whole ask: the server's answer AND, for an
//                      intent, the re-read envelope applied (CharacterSession
//                      _settled). The ledger notes it open from the call to the
//                      settle; run() never throws through it (a throw is the
//                      { ok:false, error:'network' } answer). Resolves to run's.
//   open()             how many asks are in flight
//   last()             the last settled ask { verb, ms, ok, error }, or null
//   subscribe(fn)      fn('begin' | 'end', entry) where entry is
//                      { id, verb, at, ms?, result? }; returns the stop function
// askVia(holder, verb, run) is the one way a module that holds a session or an
// account (party-intents.js, src/social/*) tracks an ask: through holder.intents,
// or, for a test double with no ledger, by just running it.
//
// It records; it decides nothing and authors no number (CLAUDE.md §6). Its only
// readers are src/shell/press-ack.js (the pressed control's pending state) and
// src/app/live-overlay.js (?debug=live).
// ════════════════════════════════════════════════════════════════════════

const VERB = /^[a-z][a-z0-9_]{0,47}$/i;

/**
 * @param {object} [o]
 * @param {() => number} [o.now]   the clock (ms) latencies are measured on
 */
export function createIntentLedger(o) {
  const now = (o && o.now) || (() => (globalThis.performance ? globalThis.performance.now() : Date.now()));
  const open = new Map();
  const listeners = new Set();
  let seq = 0;
  let last = null;
  const emit = (kind, entry) => {
    for (const fn of Array.from(listeners)) { try { fn(kind, entry); } catch (e) { console.error('[intents] a listener failed', e); } }
  };
  return Object.freeze({
    async track(verb, run) {
      const entry = { id: ++seq, verb: VERB.test(String(verb)) ? String(verb) : 'ask', at: now() };
      open.set(entry.id, entry);
      emit('begin', Object.freeze(Object.assign({}, entry)));
      let r;
      try { r = await run(); } catch (e) { r = { ok: false, error: 'network' }; }
      open.delete(entry.id);
      const ok = !!(r && r.ok);
      const error = ok ? null : (r && typeof r.error === 'string' ? r.error : 'refused');
      last = Object.freeze({ verb: entry.verb, ms: Math.max(0, Math.round(now() - entry.at)), ok, error });
      emit('end', Object.freeze(Object.assign({}, entry, { ms: last.ms, result: r })));
      return r;
    },
    open: () => open.size,
    last: () => last,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  });
}

/** Run one ask through `holder.intents` (a CharacterSession or the AccountSession), or just run it
    when the holder has no ledger (a test double). */
export function askVia(holder, verb, run) {
  return holder && holder.intents && typeof holder.intents.track === 'function' ? holder.intents.track(verb, run) : run();
}
