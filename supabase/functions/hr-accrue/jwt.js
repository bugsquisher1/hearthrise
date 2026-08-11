// ============================================================================
// supabase/functions/hr-accrue/jwt.js — THE IDENTITY PROOF.
//
// This module answers exactly one question: "which user id has this request
// PROVEN it is?" — and it answers it by checking a cryptographic signature, not
// by reading a claim.
//
// ── WHY THIS FILE EXISTS (review D2) ────────────────────────────────────────
// The first revision of index.ts DECODED the JWT and never verified it. It was
// safe only because the Edge Function was assumed to be deployed with
// `verify_jwt = true`, so the Supabase gateway had already checked the
// signature. Two things were wrong with that:
//
//   1. THE PROPERTY LIVED IN A DEPLOY COMMAND. There was no supabase/config.toml
//      in the repo at all, so "verify_jwt is on" was a habit, not an artefact.
//      One `--no-verify-jwt` — typed once, by anyone, in a hurry — and an
//      unauthenticated caller could read any player's entire hr_state_of
//      envelope (inventory, fifteen skills, farm, progress) and force-collect
//      their absence, because the old `subjectOf` believed a `sub` nobody had
//      signed.
//   2. IT IS NOT WHAT THE DESIGN SAYS. docs/design/server-authority.md §2a-i
//      specifies "verifies the PLAYER's JWT with the project JWKS
//      (asymmetric-safe: verification only needs the PUBLIC key)". That is the
//      whole reason the engine's own authority is a GRANT on a database role
//      rather than a minted token.
//
// So verification happens HERE, in the function, and it does not depend on how
// anyone deployed it. `verify_jwt = true` is still committed
// (supabase/config.toml) and still asserted by the test suite — two independent
// locks, which is the same posture as RLS + GRANT everywhere else in this
// program.
//
// ── WHAT IT DOES NOT HOLD ───────────────────────────────────────────────────
// No signing secret. Verification of an asymmetric signature needs only the
// PUBLIC key, which the project publishes at
// `<project>/auth/v1/.well-known/jwks.json`. That is the property §2a-i chose
// this seam for: nothing here can MINT a token, so nothing here can claim
// `role: service_role`.
//
// ── THE HS256 PROBLEM, AND THE SECRET-FREE ANSWER ───────────────────────────
// A project that has not yet rotated to asymmetric signing keys issues HS256
// tokens whose key is a shared secret JWKS cannot publish. Verifying those
// in-function would mean holding `SUPABASE_JWT_SECRET` — the one credential
// whose disclosure lets anyone mint `role: service_role`, and which §2a-i
// rejects permanently.
//
// The answer is to ask the issuer instead: `GET /auth/v1/user` with the token.
// GoTrue verifies its own signature and returns the user, or 401. It costs one
// round trip, it holds no secret, and it is reached ONLY for algorithms JWKS
// cannot cover. Positive results are cached briefly, keyed by a hash of the
// token and bounded by the token's own `exp`.
//
// Measured on nezapsylztqbbwuwembx (2026-08-11): the JWKS endpoint publishes one
// ES256 key, so the asymmetric path is the live path today and the fallback is
// insurance for a project caught mid-rotation.
//
// ── FAIL CLOSED, ALWAYS ─────────────────────────────────────────────────────
// Every path throws. There is no branch that returns a subject without a
// signature having been checked — asserted by tests/jwt-verify.mjs, which runs a
// real ES256 key pair through this module and then runs a forged token against
// the PROJECT'S REAL published JWKS.
//
// PURE ESM. Runs unmodified in Node 18+ and Deno: `fetch`, `crypto.subtle`,
// `TextEncoder` and `atob` are standard in both.
// ============================================================================

/** Machine codes. Prose never crosses this boundary (design §2, error taxonomy).
    Note that almost everything collapses to `not_signed_in`: telling a caller
    WHICH check their forgery failed is free tuning advice. `auth_unavailable`
    is deliberately distinct because it is OUR outage, not their error. */
export const JWT_ERR = {
  MISSING: 'not_signed_in',
  MALFORMED: 'not_signed_in',
  BAD_ALG: 'not_signed_in',
  BAD_SIG: 'not_signed_in',
  EXPIRED: 'not_signed_in',
  BAD_CLAIMS: 'not_signed_in',
  NO_KEY: 'not_signed_in',
  UNAVAILABLE: 'auth_unavailable',
};

/* The ONLY algorithms this module verifies itself. `none` is not on the list,
   and neither is any HS*: an HMAC "verification" needs the signing secret,
   which is the same capability as minting. An HS* token is therefore not
   rejected outright — it is handed to the issuer (see `introspect`) — but it is
   never verified here. */
const ASYM = {
  ES256: { import: { name: 'ECDSA', namedCurve: 'P-256' }, verify: { name: 'ECDSA', hash: 'SHA-256' }, kty: 'EC' },
  ES384: { import: { name: 'ECDSA', namedCurve: 'P-384' }, verify: { name: 'ECDSA', hash: 'SHA-384' }, kty: 'EC' },
  RS256: { import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verify: { name: 'RSASSA-PKCS1-v1_5' }, kty: 'RSA' },
  RS512: { import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' }, verify: { name: 'RSASSA-PKCS1-v1_5' }, kty: 'RSA' },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Clock-skew allowance, seconds. Zero would reject a token issued one second in
   the future by an auth server whose clock is a hair ahead of ours — a support
   ticket, not a security property. 60s cannot meaningfully extend a token. */
const SKEW_S = 60;

/** Base64url → bytes. STRICT: rejects anything outside the base64url alphabet,
    because a lenient decoder is how `alg: "none"` variants get through. */
function b64uBytes(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw new Error(JWT_ERR.MALFORMED);
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '==='.slice((pad.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64uJson(s) {
  const bytes = b64uBytes(s);
  let obj;
  try { obj = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error(JWT_ERR.MALFORMED); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(JWT_ERR.MALFORMED);
  return obj;
}

/** Split a compact JWS. Three parts, no more, no fewer. */
export function splitJwt(token) {
  if (typeof token !== 'string' || !token) throw new Error(JWT_ERR.MISSING);
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1]) throw new Error(JWT_ERR.MALFORMED);
  return { h: parts[0], p: parts[1], s: parts[2], signing: `${parts[0]}.${parts[1]}` };
}

/** The bearer token, or ''. Never throws — the caller decides what missing means. */
export function bearerOf(headerValue) {
  const v = String(headerValue || '');
  return /^Bearer\s+/i.test(v) ? v.replace(/^Bearer\s+/i, '').trim() : '';
}

// ── JWKS, cached ────────────────────────────────────────────────────────────
// Module scope, so a warm invocation pays nothing and a cold one pays a single
// fetch. Both are bounded: TTL_MS for a good key set, REFETCH_MS as the floor
// between refetches triggered by an unknown `kid`, so a stream of tokens naming
// random kids cannot turn this function into a load generator aimed at the
// project's own auth server.
const TTL_MS = 10 * 60 * 1000;
const REFETCH_MS = 60 * 1000;
const jwksCache = new Map();     // url → { keys, at, lastTry }
const tokenCache = new Map();    // sha256(token) → { sub, until }   (HS* path only)

/** Test seam. Caches are module state; a test that cannot clear them is a test
    whose second assertion is measuring the first one's leftovers. */
export function _resetJwtCaches() { jwksCache.clear(); tokenCache.clear(); }

async function jwksFor(url, fetchImpl, nowMs, force) {
  const c = jwksCache.get(url);
  if (c && !force && nowMs - c.at < TTL_MS) return c.keys;
  if (c && force && nowMs - (c.lastTry || 0) < REFETCH_MS) return c.keys;

  let keys;
  try {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!res || !res.ok) throw new Error('jwks_http');
    const body = await res.json();
    keys = Array.isArray(body?.keys) ? body.keys : [];
  } catch {
    /* Serve a stale key set rather than lock every player out of their own
       progress because the auth host blipped. Public keys rotate on the order
       of months; a ten-minute-stale set is not a weakened check, and a
       verification against a retired key still proves the issuer signed it. */
    if (c) { c.lastTry = nowMs; return c.keys; }
    throw new Error(JWT_ERR.UNAVAILABLE);
  }
  jwksCache.set(url, { keys, at: nowMs, lastTry: nowMs });
  return keys;
}

/* Import only the fields that define the key. Supabase's JWKS carries `use`,
   `alg`, `ext` and `key_ops` alongside; passing an unexpected combination of
   those to importKey is a portability hazard between Node and Deno, and none of
   them is key material. */
function sanitizeJwk(jwk, spec) {
  if (spec.kty === 'EC') return { kty: 'EC', crv: jwk.crv, x: jwk.x, y: jwk.y };
  return { kty: 'RSA', n: jwk.n, e: jwk.e };
}

async function verifySignature(token, jwk, alg, subtle) {
  const spec = ASYM[alg];
  if (!spec || jwk.kty !== spec.kty) throw new Error(JWT_ERR.BAD_ALG);
  const { signing, s } = splitJwt(token);
  if (!s) throw new Error(JWT_ERR.BAD_SIG);
  const key = await subtle.importKey('jwk', sanitizeJwk(jwk, spec), spec.import, false, ['verify']);
  const okSig = await subtle.verify(
    spec.verify, key, b64uBytes(s), new TextEncoder().encode(signing));
  if (!okSig) throw new Error(JWT_ERR.BAD_SIG);
}

const INTROSPECT_TTL_MS = 60 * 1000;
const TOKEN_CACHE_MAX = 500;     // bounded: a warm-invocation cache, not a session store

async function sha256Hex(s, subtle) {
  const buf = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a Supabase access token and return its subject.
 *
 * EVERY return path has checked a signature — either here, against the
 * project's published public key, or at the issuer, by asking it.
 *
 * @param token            the raw compact JWS
 * @param opts.jwksUrl     `<project>/auth/v1/.well-known/jwks.json`  (required)
 * @param opts.issuer      expected `iss`, e.g. `<project>/auth/v1`   (required)
 * @param opts.fetchImpl   injectable for tests; defaults to global fetch
 * @param opts.subtle      injectable; defaults to globalThis.crypto.subtle
 * @param opts.nowMs       injectable clock; defaults to Date.now()
 * @param opts.introspect  async (token) => sub | null. Optional. Used ONLY when
 *                         the token's alg is HS* (a project that has not rotated
 *                         to JWKS signing keys). Absent ⇒ HS* is a hard
 *                         rejection, which is the fail-closed default.
 * @returns the verified `sub` (a uuid)
 * @throws  Error whose message is a machine code from JWT_ERR
 */
export async function verifyJwt(token, opts) {
  const o = opts || {};
  const fetchImpl = o.fetchImpl || globalThis.fetch;
  const subtle = o.subtle || globalThis.crypto?.subtle;
  const nowMs = Number.isFinite(o.nowMs) ? o.nowMs : Date.now();
  if (!o.jwksUrl || !o.issuer) throw new Error('config:jwt_verifier_unconfigured');
  if (!subtle) throw new Error('config:no_webcrypto');

  const { h, p } = splitJwt(token);
  const header = b64uJson(h);
  const claims = b64uJson(p);
  const alg = String(header.alg || '');

  /* Claim checks run BEFORE the signature on purpose: they are free, and a
     token that is expired or aimed at another issuer must not cause us to make
     a network call on its behalf. They are re-stated after verification too, so
     that no claim the caller receives is one that was only ever read from an
     unverified blob. */
  assertClaims(claims, o.issuer, nowMs);

  if (ASYM[alg]) {
    const keys = await jwksFor(o.jwksUrl, fetchImpl, nowMs, false);
    let jwk = pickKey(keys, header.kid, alg);
    if (!jwk) {
      /* An unknown kid is the ordinary shape of a key rotation, so refetch once —
         rate-floored — before giving up. */
      jwk = pickKey(await jwksFor(o.jwksUrl, fetchImpl, nowMs, true), header.kid, alg);
    }
    if (!jwk) throw new Error(JWT_ERR.NO_KEY);
    await verifySignature(token, jwk, alg, subtle);
  } else {
    /* Not an algorithm anyone can verify with a public key. `alg: "none"` lands
       here too, and lands on a hard rejection: the allowlist below is HS* only,
       and even with an introspector the ISSUER will not accept `none` either. */
    if (typeof o.introspect !== 'function') throw new Error(JWT_ERR.BAD_ALG);
    if (!/^HS(256|384|512)$/.test(alg)) throw new Error(JWT_ERR.BAD_ALG);

    const key = await sha256Hex(token, subtle);
    const hit = tokenCache.get(key);
    if (hit && hit.until > nowMs) return hit.sub;

    let sub = null;
    try { sub = await o.introspect(token); }
    catch { throw new Error(JWT_ERR.UNAVAILABLE); }
    if (!sub || !UUID_RE.test(String(sub))) throw new Error(JWT_ERR.BAD_SIG);
    /* The issuer's answer wins, and the two must agree — a mismatch means one of
       them is not describing this token. */
    if (String(sub) !== String(claims.sub)) throw new Error(JWT_ERR.BAD_CLAIMS);

    if (tokenCache.size >= TOKEN_CACHE_MAX) tokenCache.clear();
    tokenCache.set(key, {
      sub: String(sub),
      until: Math.min(nowMs + INTROSPECT_TTL_MS, Number(claims.exp) * 1000 || 0),
    });
    return String(sub);
  }

  /* Re-asserted after verification. Everything above this line that touched a
     claim did so on bytes that had not yet been proven; everything the caller
     receives has been. */
  assertClaims(claims, o.issuer, nowMs);
  return String(claims.sub);
}

function pickKey(keys, kid, alg) {
  const list = Array.isArray(keys) ? keys : [];
  return list.find((k) => k
    && (k.use === undefined || k.use === 'sig')
    && (k.alg === undefined || k.alg === alg)
    && (kid === undefined || k.kid === undefined || k.kid === kid)
    && k.kty === ASYM[alg]?.kty) || null;
}

/**
 * The claims this server depends on. Exported so a test can hit each rejection
 * individually instead of only through a signature.
 *
 * `role` is checked because the project's anon API key is a perfectly valid,
 * correctly signed token for this issuer — it simply is not a player. Requiring
 * `role: authenticated` AND a uuid `sub` means a publishable key cannot accrue.
 */
export function assertClaims(claims, issuer, nowMs) {
  const c = claims || {};
  if (String(c.iss || '') !== String(issuer)) throw new Error(JWT_ERR.BAD_CLAIMS);
  if (!UUID_RE.test(String(c.sub || ''))) throw new Error(JWT_ERR.BAD_CLAIMS);
  if (String(c.role || '') !== 'authenticated') throw new Error(JWT_ERR.BAD_CLAIMS);
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes('authenticated')) throw new Error(JWT_ERR.BAD_CLAIMS);
  if (!Number.isFinite(Number(c.exp))) throw new Error(JWT_ERR.BAD_CLAIMS);
  if (Number(c.exp) * 1000 + SKEW_S * 1000 < nowMs) throw new Error(JWT_ERR.EXPIRED);
  if (Number.isFinite(Number(c.nbf)) && Number(c.nbf) * 1000 - SKEW_S * 1000 > nowMs) {
    throw new Error(JWT_ERR.BAD_CLAIMS);
  }
  /* A token claiming to have been issued far in the future is either a broken
     clock or a forgery attempt; either way it is not something to pay out on. */
  if (Number.isFinite(Number(c.iat)) && Number(c.iat) * 1000 - SKEW_S * 1000 > nowMs) {
    throw new Error(JWT_ERR.BAD_CLAIMS);
  }
  return String(c.sub);
}

/**
 * The secret-free HS* fallback: ask GoTrue. Returns the user id or null.
 * Built here rather than inline in index.ts so the suite exercises the exact
 * function that ships.
 */
export function gotrueIntrospector(supabaseUrl, apiKey, fetchImpl) {
  const f = fetchImpl || globalThis.fetch;
  return async (token) => {
    const res = await f(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: apiKey || '', Accept: 'application/json' },
    });
    if (!res || !res.ok) return null;
    const body = await res.json().catch(() => null);
    return body && typeof body.id === 'string' ? body.id : null;
  };
}
