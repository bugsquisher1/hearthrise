// ============================================================================
// supabase/functions/hr-accrue/cors.js — the browser admission layer.
//
// ── THE BUG THIS FILE EXISTS FOR ────────────────────────────────────────────
// `hr-accrue` shipped and was verified with curl and with Node. Both of those
// speak HTTP; neither speaks CORS. A browser does, and from the game's own
// origin the deployed function was completely unreachable:
//
//   Access to fetch at 'https://…/functions/v1/hr-accrue' from origin
//   'https://hearthrise.net' has been blocked by CORS policy: Response to
//   preflight request doesn't pass access control check: No
//   'Access-Control-Allow-Origin' header is present on the requested resource.
//
// The function was correct, deployed, executing and answering — and no client
// could reach it. Every guard in the repo was green. Generalise it: **a check
// that does not use the transport the player uses is checking a different
// system.** The guard that ships with this file (`tests/cors-preflight.mjs`)
// therefore issues a real `OPTIONS` preflight, not a POST.
//
// ── WHY THIS IS A MODULE AND NOT SIX LINES IN index.ts ──────────────────────
// Three reasons, in order of weight:
//
//  1. IT IS TESTABLE IN NODE. index.ts imports `npm:postgres` and calls
//     `Deno.serve`, so no Node test can execute it. This file imports nothing,
//     touches no Deno global, and is exercised in-process by the guard with
//     real `Request`/`Response` objects — the same shape the runtime hands it.
//     `jwt.js` and `request.js` are here for the same reason.
//
//  2. THE HEADERS GO ON *EVERY* RESPONSE, STRUCTURALLY. `bug-report-bridge`
//     spreads `corsHeaders(origin)` into each of its ~15 return sites. That
//     works today and is one forgotten `return` away from a 500 that a browser
//     reports as a CORS failure — hiding the real status at the exact moment
//     somebody is debugging an outage. `withCors(handler)` wraps the handler
//     instead, so the error path, the 429 path, the 503 path and any path added
//     next year carry the headers without anybody remembering to add them. The
//     handler's own `json()` helper is left alone on purpose.
//
//  3. IT IS THE ONLY WAY IN. index.ts registers `Deno.serve(withCors(handle))`
//     and contains no other `Deno.serve`. The preflight is therefore answered
//     BEFORE any JWT verification, any pool access and any rate-gate spend —
//     which is mandatory, because a preflight carries no `Authorization` header
//     by design and would 401 if it reached the handler.
//
// ── WHAT ANSWERING A PREFLIGHT MAY NOT BECOME ──────────────────────────────
//   • NOT AN INFORMATION LEAK. The preflight response has an EMPTY body, a 204
//     status, and its content is a pure function of (method, Origin,
//     Access-Control-Request-Headers). It reads no table, no env var, no token;
//     it cannot distinguish a real player from a stranger and so cannot tell
//     one anything about the other.
//   • NOT A WAY TO SKIP THE RATE GATE. OPTIONS returns from this file and never
//     reaches the handler, so it can neither accrue, nor read state, nor spend
//     budget — there is no "do the work but skip the gate" path, because the
//     preflight branch precedes the whole handler rather than an early part of
//     it. The residual is that OPTIONS (like the existing unauthenticated GET
//     health probe) costs one isolate invocation; `Access-Control-Max-Age`
//     keeps a real browser to one preflight per hour and the platform's own
//     limits are what bound an abusive one. Stated, not hidden.
//
// ── ALLOWLIST, NOT `*` ──────────────────────────────────────────────────────
// This endpoint takes a bearer token and returns a player's ENTIRE state
// envelope, so `Access-Control-Allow-Origin: *` is not on the table. The list
// is the same three hosts `src/net/account-gate.js` calls PLAYER_HOSTS — the
// hosts the game is actually served from — and the guard asserts the two lists
// have not drifted apart rather than trusting a comment to keep them in sync.
//
// UNKNOWN ORIGIN → the header is OMITTED and the request is still processed.
// Two deliberate divergences from the sibling, both stated:
//   • `bug-report-bridge` echoes `ALLOWED_ORIGINS[0]` for an unknown origin.
//     The browser blocks that too (it does not match the caller), but it puts a
//     header on the wire that says "allowed" while meaning "denied", which is
//     the kind of thing that costs an hour at 2am. Omitting it produces the
//     precise, honest error.
//   • It would be tempting to 403 an unknown Origin. It buys close to nothing —
//     CORS is enforced by the browser, so anything not a browser (curl, a
//     stolen-token replay, a bot) simply omits Origin and is unaffected — and
//     it would silently brick the first Capacitor/Electron wrapper, whose
//     origin is `capacitor://localhost` or `null`. **CORS IS NOT AN
//     AUTHORIZATION BOUNDARY HERE. The verified JWT is.** So the allowlist
//     governs which browsers may READ the response, and nothing else.
// ============================================================================

/* The hosts the game is served from. Kept identical to PLAYER_HOSTS in
   src/net/account-gate.js — asserted by tests/cors-preflight.mjs, because two
   hand-maintained copies of one list is exactly the drift this repo has been
   burned by. A wrapper build (Capacitor / Electron / Tauri) will need its own
   scheme added here; it is not guesswork we should commit ahead of time. */
export const ALLOWED_ORIGINS = [
  'https://hearthrise.net',
  'https://www.hearthrise.net',
  'https://bugsquisher1.github.io',
];

/* Local development, any port, http or https. Same intent as the sibling's
   regex, widened to https because a service worker / secure-context test server
   is served over TLS on localhost. */
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

/* The headers a caller may SEND. supabase-js sends apikey + authorization +
   x-client-info, and has added new `x-…` headers across minor versions before;
   `bug-report-bridge`'s fixed list would block a client-library bump with the
   identical, hard-to-read symptom this file exists to fix. So the requested set
   is echoed back on top of the base, sanitised to header tokens and bounded —
   an echoed header grants a browser permission to SEND it, never permission to
   read a response or to skip authentication. */
const BASE_ALLOWED_HEADERS = [
  'authorization', 'x-client-info', 'apikey', 'content-type',
  'x-supabase-api-version', 'x-hr-idempotency-key',
];
const HEADER_TOKEN_RE = /^[a-z0-9!#$%&'*+.^_`|~-]{1,64}$/;
const MAX_ECHOED_HEADERS = 32;

export function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN_RE.test(origin);
}

export function allowedHeadersFor(requested) {
  const asked = String(requested || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => HEADER_TOKEN_RE.test(h))
    .slice(0, MAX_ECHOED_HEADERS);
  return [...new Set([...BASE_ALLOWED_HEADERS, ...asked])].join(', ');
}

/**
 * The CORS headers for one request.
 *
 * `Vary: Origin` is unconditional — the response body is identical for every
 * origin but this header is not, and a shared cache that ignored that would
 * serve one origin's admission decision to another.
 *
 * No `Access-Control-Allow-Credentials`: this endpoint authenticates with a
 * bearer token, never a cookie, so there is deliberately no ambient-credential
 * surface to protect.
 */
export function corsHeaders(origin, requestedHeaders) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': allowedHeadersFor(requestedHeaders),
    'Access-Control-Max-Age': '3600',
    'Vary': 'Origin, Access-Control-Request-Headers',
  };
  if (isAllowedOrigin(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

/** 204, empty body, no state read. See "WHAT ANSWERING A PREFLIGHT MAY NOT BECOME". */
export function preflightResponse(req) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(
      req.headers.get('origin'),
      req.headers.get('access-control-request-headers'),
    ),
  });
}

/** Copy a response, adding the CORS headers. Never drops what the handler set
    (a 429's `Retry-After` is the one that matters). */
export function withCorsHeaders(res, origin, requestedHeaders) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin, requestedHeaders))) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/**
 * THE ONE ENTRY POINT. `Deno.serve(withCors(handle))`.
 *
 * A handler that throws produces a 500 WITH the headers, because a 500 without
 * them reads to the browser as a CORS failure and hides the real status — which
 * is how an outage becomes unattributable. index.ts already catches its own
 * errors; this is the second lock, not the first.
 */
export function withCors(handler) {
  return async (req) => {
    const origin = req.headers.get('origin');
    const asked = req.headers.get('access-control-request-headers');

    if (req.method === 'OPTIONS') return preflightResponse(req);

    let res;
    try {
      res = await handler(req);
      if (!(res instanceof Response)) throw new Error('handler did not return a Response');
    } catch (e) {
      console.error('[hr-accrue] unhandled:', String((e && e.message) || e));
      res = new Response(JSON.stringify({ ok: false, error: 'server_error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return withCorsHeaders(res, origin, asked);
  };
}
