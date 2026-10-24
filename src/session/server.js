// ════════════════════════════════════════════════════════════════════════
// src/session/server.js — THE ONE WAY THE CLIENT TALKS TO THE SERVER.
//
// createServerLink({ url, anonKey, token, fetch }) answers:
//   rpc(name, args)       POST /rest/v1/rpc/<name>        (Postgres RPC)
//   accrue(body)          POST /functions/v1/hr-accrue    (the engine's intents)
//   report(body)          POST /functions/v1/bug-report-bridge  (a player's problem report;
//                         the bridge names the reporter from the token, stores and rate-limits)
//   intents               the account's asks in flight (src/session/intent-ledger.js):
//                         its callers track each intent; the link only carries it
// Every answer is { ok, status, body, closed } and never a throw: a network
// failure is { ok:false, status:0, error:'network' }.
//
// THE CLOSED GAME (2026-10-21-closed-mode.sql): while Hearthrise is closed, a
// signed-in account that is not on the allowlist is refused by every Data-API
// request with HTTP 403 and {"code":"hr_closed"}. That answer is marked
// `closed: true` so the app shows the closed notice. The server decides; this
// only reads its answer.
//
// The token is asked for on every call (auth.freshToken: refreshed first when it
// is about to expire); no token, no request. A 401 renews the token once
// (auth.renewToken) and retries that one call once; a session that cannot be
// renewed has no token, so it sends nothing more (live 2026-10-20: a dead token
// was sent 805 times from a background tab).
//
// A STALE CLIENT (Tyler, 2026-10-22): a tab still running last release's build
// can ask in a shape the server no longer has. PostgREST answers a call whose
// arguments match no function with PGRST202 (404); the engine answers a verb it
// does not run with `unknown_verb`; and `version_conflict` / `*_mismatch` is what
// an old client rubber-banding against a newer server sees on every ask. Such an
// answer calls `o.stale()` (src/app/new-version.js check(true)): the client asks
// which build the site serves, and only a different one raises the reload banner,
// so a routine version_conflict on a current client shows nothing.
// ════════════════════════════════════════════════════════════════════════

import { SUPABASE_CONFIG } from '../net/supabase-bootstrap.js?v=0.2.39';
import { createIntentLedger } from './intent-ledger.js?v=0.2.39';

export const CLOSED_CODE = 'hr_closed';
export const CLOSED_STATUS = 403;

/** Is this answer the closed-game refusal? Pure. */
export function isClosedAnswer(status, body) {
  return status === CLOSED_STATUS && !!body && typeof body === 'object' && body.code === CLOSED_CODE;
}

/**
 * The text of a file the site serves NOW (the page's own origin, never a cache's
 * copy), or null. No token: src/app/new-version.js reads src/build-info.js with it
 * on every screen, signed in or not. Never throws.
 * @param {string} url
 * @param {typeof fetch} [doFetch]
 */
export async function readServed(url, doFetch) {
  try {
    const res = await (doFetch || ((...a) => globalThis.fetch(...a)))(url, { cache: 'no-store' });
    return res && res.ok ? await res.text() : null;
  } catch (e) { return null; }
}

const STALE_CODES = new Set(['PGRST202', '42883', 'unknown_verb', 'version_conflict']);

/** Could this refused answer be a stale client's (a shape the server no longer has)? Pure. */
function looksStale(status, body) {
  if (!body || typeof body !== 'object' || status === 0) return false;
  const code = typeof body.code === 'string' ? body.code : typeof body.error === 'string' ? body.error : '';
  return STALE_CODES.has(code) || /_mismatch$/.test(code);
}

/**
 * @param {object} o
 * @param {string} o.url        the project URL
 * @param {string} o.anonKey    the public anon key
 * @param {() => string|null|Promise<string|null>} o.token   the signed-in user's access token, valid for the call
 * @param {(bad: string) => string|null|Promise<string|null>} [o.renew]  a new token after a 401, or null
 * @param {typeof fetch} [o.fetch]
 * @param {() => void} [o.stale]  told when an answer looks like a stale client's
 */
export function createServerLink(o) {
  const base = String(o.url || '').replace(/\/+$/, '');
  const doFetch = o.fetch || ((...a) => globalThis.fetch(...a));
  const send = (path, payload, jwt) => doFetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: o.anonKey, Authorization: 'Bearer ' + jwt },
    body: JSON.stringify(payload || {}),
  });
  async function post(path, payload) {
    let jwt = null;
    try { jwt = await o.token(); } catch (e) { jwt = null; }
    if (!jwt) return { ok: false, status: 0, error: 'no_token', closed: false };
    let res;
    try {
      res = await send(path, payload, jwt);
      if (res.status === 401 && o.renew) {
        let next = null;
        try { next = await o.renew(jwt); } catch (e) { next = null; }
        if (next && next !== jwt) res = await send(path, payload, next);
      }
    } catch (e) {
      return { ok: false, status: 0, error: 'network', closed: false };
    }
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    const closed = isClosedAnswer(res.status, body);
    if (o.stale && !closed && looksStale(res.status, body)) { try { o.stale(); } catch (e) { /* the check reports itself */ } }
    return { ok: res.ok && !closed, status: res.status, body, closed, error: res.ok ? null : 'http_' + res.status };
  }
  return Object.freeze({
    rpc: (name, args) => {
      if (!/^[a-z_][a-z0-9_]*$/.test(String(name))) return Promise.resolve({ ok: false, status: 0, error: 'bad_rpc', closed: false });
      return post('/rest/v1/rpc/' + name, args);
    },
    accrue: (body) => post('/functions/v1/hr-accrue?forceFunctionRegion=' + SUPABASE_CONFIG.functionRegion, body),
    report: (body) => post('/functions/v1/bug-report-bridge', body),
    intents: createIntentLedger(),
  });
}
