// ════════════════════════════════════════════════════════════════════════
// src/session/server.js — THE ONE WAY THE CLIENT TALKS TO THE SERVER.
//
// createServerLink({ url, anonKey, token, fetch }) answers:
//   rpc(name, args)       POST /rest/v1/rpc/<name>        (Postgres RPC)
//   accrue(body)          POST /functions/v1/hr-accrue    (the engine's intents)
// Every answer is { ok, status, body, closed } and never a throw: a network
// failure is { ok:false, status:0, error:'network' }.
//
// THE CLOSED GAME (2026-10-21-closed-mode.sql): while Hearthrise is closed, a
// signed-in account that is not on the allowlist is refused by every Data-API
// request with HTTP 403 and {"code":"hr_closed"}. That answer is marked
// `closed: true` so the app shows the closed notice. The server decides; this
// only reads its answer.
//
// The token is asked for on every call (it refreshes); no token, no request.
// ════════════════════════════════════════════════════════════════════════

export const CLOSED_CODE = 'hr_closed';
export const CLOSED_STATUS = 403;

/** Is this answer the closed-game refusal? Pure. */
export function isClosedAnswer(status, body) {
  return status === CLOSED_STATUS && !!body && typeof body === 'object' && body.code === CLOSED_CODE;
}

/**
 * @param {object} o
 * @param {string} o.url        the project URL
 * @param {string} o.anonKey    the public anon key
 * @param {() => string|null} o.token   the signed-in user's access token
 * @param {typeof fetch} [o.fetch]
 */
export function createServerLink(o) {
  const base = String(o.url || '').replace(/\/+$/, '');
  const doFetch = o.fetch || ((...a) => globalThis.fetch(...a));
  async function post(path, payload) {
    const jwt = o.token();
    if (!jwt) return { ok: false, status: 0, error: 'no_token', closed: false };
    let res;
    try {
      res = await doFetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: o.anonKey, Authorization: 'Bearer ' + jwt },
        body: JSON.stringify(payload || {}),
      });
    } catch (e) {
      return { ok: false, status: 0, error: 'network', closed: false };
    }
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    const closed = isClosedAnswer(res.status, body);
    return { ok: res.ok && !closed, status: res.status, body, closed, error: res.ok ? null : 'http_' + res.status };
  }
  return Object.freeze({
    rpc: (name, args) => {
      if (!/^[a-z_][a-z0-9_]*$/.test(String(name))) return Promise.resolve({ ok: false, status: 0, error: 'bad_rpc', closed: false });
      return post('/rest/v1/rpc/' + name, args);
    },
    accrue: (body) => post('/functions/v1/hr-accrue', body),
  });
}
