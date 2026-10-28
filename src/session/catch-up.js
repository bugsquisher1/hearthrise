// ════════════════════════════════════════════════════════════════════════
// src/session/catch-up.js — A VERB THE SERVER REFUSED BECAUSE THE HUNT IS STILL BEING SETTLED.
//
// After a world-tick outage a hunt can be minutes behind the server's clock, and
// every verb that must price the hunt first (a purchase, a meal, a settings or
// bag edit) is refused `settle_first` until it is not (the server's rule:
// hr_settle_first_of, the hunt settings' 20 s slack). The hunter's own settle
// catches the hunt up, several 2-min slices a call (hunt-settle.js
// HUNT_PLAYER_SLICES_MAX within its own engine budget). So a CharacterSession
// asks its link through catchUpLink: an INTENT (one that carries an idempotency
// key) refused `settle_first` while a hunt is open runs the hunter's settle ONCE
// and is asked ONCE more under a NEW key — the first ask wrote nothing, so the
// second is a fresh decision the server makes on the caught-up hunt, never on
// the state the first was refused at. A second refusal is answered as it
// stands (its words: refusal-words.js settle_first). Reads and the settle itself
// (no key) pass through untouched.
// ════════════════════════════════════════════════════════════════════════

/** A fresh idempotency key (the server's intent ledger keys a decision on it). */
export function newIdem() {
  const c = globalThis.crypto;
  return c && typeof c.randomUUID === 'function' ? c.randomUUID() : Date.now() + '-' + Math.floor(Math.random() * 1e9);
}

/** Did the server refuse this answer because the hunt still has to be settled first? Pure. */
export function catchingUp(ans) {
  return !!(ans && ans.body && typeof ans.body === 'object' && ans.body.ok === false && ans.body.error === 'settle_first');
}

/**
 * The session's view of `server` (src/session/server.js link): rpc / accrue as the link's, with the one catch-up retry.
 * @param {object} server
 * @param {{ hunting: () => boolean, catchUp: () => Promise<any> }} o   is a hunt open; the hunter's own settle
 */
export function catchUpLink(server, o) {
  if (!server || typeof server !== 'object') return server;
  const once = async (ask, again) => {
    const ans = await ask();
    if (!catchingUp(ans) || !o.hunting()) return ans;
    try { await o.catchUp(); } catch (e) { /* the retry's own answer says what the server holds */ }
    return again();
  };
  /* the link's own members are read-only (server.js freezes it): the view defines its two, inherits the rest */
  return Object.create(server, {
    rpc: { value: (name, args) => (args && typeof args.p_idem === 'string'
      ? once(() => server.rpc(name, args), () => server.rpc(name, { ...args, p_idem: newIdem() }))
      : server.rpc(name, args)) },
    accrue: { value: (body) => (body && typeof body.intentId === 'string'
      ? once(() => server.accrue(body), () => server.accrue({ ...body, intentId: newIdem() }))
      : server.accrue(body)) },
  });
}
