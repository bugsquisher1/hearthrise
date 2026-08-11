// ============================================================================
// tests/jwt-verify.mjs — THE PROOF FOR D2.
//
// The accrual Edge Function's entire authorisation model is "the `sub` in this
// token is the player". Until this file existed, that rested on a DECODE — the
// shell read the claim and believed it — and on `verify_jwt` being on at the
// gateway, a setting that lived in nobody's repository and in no test.
//
// So this suite does not read supabase/functions/hr-accrue/jwt.js and agree
// with it. It EXECUTES it, against a real ES256 key pair generated here, and
// then against the LIVE published JWKS of the real project, and asserts that
// every forgery it can construct is refused.
//
// The forgeries, and why each one is in the list:
//   • a tampered payload            — the entire point of a signature
//   • `alg: none`                   — the classic JWT bypass
//   • `alg: HS256` with no introspector — the "verify with the public key as an
//                                     HMAC secret" key-confusion attack, which
//                                     is why HS* is never verified in-process
//   • an unknown `kid`              — a key the project does not publish
//   • a token signed by ANOTHER key with the project's real `kid`, checked
//     against the project's REAL JWKS — the only test here that could not be
//     faked by a stubbed fetch
//   • expired / not-yet-valid / issued-in-the-future
//   • wrong issuer                  — a token from a different Supabase project
//   • `role: anon`                  — the project's own publishable key is a
//                                     valid signed token and must still not accrue
//   • a `sub` that is not a uuid
//
// Run standalone:  node tests/jwt-verify.mjs
// Also invoked as a preflight by tests/run-smoke.mjs.
// ============================================================================

import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  verifyJwt, assertClaims, bearerOf, splitJwt, gotrueIntrospector, _resetJwtCaches,
} from '../supabase/functions/hr-accrue/jwt.js';

const subtle = webcrypto.subtle;
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

const PROJECT = 'https://nezapsylztqbbwuwembx.supabase.co';
const ISSUER = `${PROJECT}/auth/v1`;
const JWKS_URL = `${PROJECT}/auth/v1/.well-known/jwks.json`;
const SUB = '11111111-2222-4333-8444-555555555555';
const NOW = Date.UTC(2026, 7, 11, 12, 0, 0);

const b64u = (bytes) => Buffer.from(bytes).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uStr = (s) => b64u(new TextEncoder().encode(s));

function claims(over) {
  return {
    iss: ISSUER, sub: SUB, aud: 'authenticated', role: 'authenticated',
    iat: Math.floor(NOW / 1000) - 60, exp: Math.floor(NOW / 1000) + 3600,
    ...over,
  };
}

async function makeKey() {
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', kp.publicKey);
  return { kp, jwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, alg: 'ES256', use: 'sig', kid: 'test-kid' } };
}

async function sign(privateKey, header, payload) {
  const signing = `${b64uStr(JSON.stringify(header))}.${b64uStr(JSON.stringify(payload))}`;
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey,
    new TextEncoder().encode(signing));
  return `${signing}.${b64u(new Uint8Array(sig))}`;
}

/** A fetch stub that serves a fixed JWKS and counts calls. */
function jwksStub(keys) {
  const state = { calls: 0 };
  const f = async () => { state.calls++; return { ok: true, json: async () => ({ keys }) }; };
  f.state = state;
  return f;
}

const expectReject = async (label, token, opts) => {
  _resetJwtCaches();
  try {
    const sub = await verifyJwt(token, opts);
    problems.push(`ACCEPTED A FORGERY: ${label} → sub ${sub}`);
  } catch (e) {
    const m = String(e?.message || e);
    ok(m === 'not_signed_in' || m === 'auth_unavailable',
      `${label}: rejected, but with '${m}' rather than a machine code`);
  }
};

async function run() {
  const { kp, jwk } = await makeKey();
  const other = await makeKey();
  const fetchImpl = jwksStub([jwk]);
  const base = { jwksUrl: JWKS_URL, issuer: ISSUER, fetchImpl, subtle, nowMs: NOW };
  const H = { alg: 'ES256', typ: 'JWT', kid: 'test-kid' };

  // ── 1. THE HAPPY PATH, so the rejections below mean something ────────────
  _resetJwtCaches();
  const good = await sign(kp.privateKey, H, claims());
  let got = null;
  try { got = await verifyJwt(good, base); }
  catch (e) { problems.push(`a correctly signed token was REJECTED: ${e?.message || e}`); }
  ok(got === SUB, `the verified subject was ${got}, expected ${SUB}`);

  // …and the JWKS is fetched once, then cached: a per-request fetch against the
  // project's auth server is a self-inflicted rate limit.
  fetchImpl.state.calls = 0;
  await verifyJwt(good, base);
  await verifyJwt(good, base);
  ok(fetchImpl.state.calls === 0, `JWKS was refetched ${fetchImpl.state.calls}x on a warm cache`);

  // ── 2. THE FORGERIES ────────────────────────────────────────────────────
  const parts = good.split('.');

  // A tampered payload with the original signature.
  const tampered = `${parts[0]}.${b64uStr(JSON.stringify(claims({ sub: '99999999-9999-4999-8999-999999999999' })))}.${parts[2]}`;
  await expectReject('a tampered payload', tampered, base);

  // The signature of a DIFFERENT token, spliced on.
  const otherTok = await sign(kp.privateKey, H, claims({ sub: '99999999-9999-4999-8999-999999999999' }));
  await expectReject('a spliced signature', `${parts[0]}.${parts[1]}.${otherTok.split('.')[2]}`, base);

  // Signed by a key the project does not publish, under the kid it does.
  const wrongKey = await sign(other.kp.privateKey, H, claims());
  await expectReject('a token signed by an unpublished key', wrongKey, base);

  // alg: none — with and without a signature segment.
  await expectReject('alg:none',
    `${b64uStr(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${parts[1]}.`, base);
  await expectReject('alg:none with a stolen signature',
    `${b64uStr(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${parts[1]}.${parts[2]}`, base);

  // Key confusion: the PUBLIC key used as an HS256 secret. Not verifiable here
  // by construction — HS* is never verified in-process — so with no introspector
  // configured this is a hard rejection.
  await expectReject('alg:HS256 with no introspector',
    `${b64uStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${parts[1]}.${parts[2]}`, base);

  // An unknown kid.
  const unknownKid = await sign(kp.privateKey, { ...H, kid: 'not-a-kid' }, claims());
  await expectReject('an unknown kid', unknownKid, base);

  // Claim-level rejections, each with a VALID signature so the only thing under
  // test is the claim.
  for (const [label, over] of [
    ['an expired token', { exp: Math.floor(NOW / 1000) - 3600 }],
    ['a not-yet-valid token', { nbf: Math.floor(NOW / 1000) + 3600 }],
    ['a token issued in the future', { iat: Math.floor(NOW / 1000) + 3600 }],
    ['a token from another project', { iss: 'https://someone-else.supabase.co/auth/v1' }],
    ['the project anon key (role:anon)', { role: 'anon', sub: SUB }],
    ['a service_role token', { role: 'service_role' }],
    ['a non-uuid subject', { sub: 'admin' }],
    ['a missing subject', { sub: undefined }],
    ['a missing exp', { exp: undefined }],
    ['the wrong audience', { aud: 'anon' }],
  ]) {
    await expectReject(label, await sign(kp.privateKey, H, claims(over)), base);
  }

  // Structural garbage.
  for (const [label, tok] of [
    ['an empty token', ''],
    ['a non-JWT string', 'hello'],
    ['two segments', `${parts[0]}.${parts[1]}`],
    ['four segments', `${parts[0]}.${parts[1]}.${parts[2]}.x`],
    ['a non-base64url header', `!!!.${parts[1]}.${parts[2]}`],
    ['an array payload', `${parts[0]}.${b64uStr('[1,2,3]')}.${parts[2]}`],
  ]) {
    await expectReject(label, tok, base);
  }

  // ── 3. THE HS* FALLBACK, when one is configured ─────────────────────────
  const hsTok = `${b64uStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${parts[1]}.${parts[2]}`;
  const introspectOk = { ...base, introspect: async () => SUB };
  _resetJwtCaches();
  try {
    const s = await verifyJwt(hsTok, introspectOk);
    ok(s === SUB, `the introspection fallback returned ${s}`);
  } catch (e) { problems.push(`the introspection fallback rejected a token GoTrue accepted: ${e?.message || e}`); }

  await expectReject('introspection saying a DIFFERENT user',
    hsTok, { ...base, introspect: async () => '99999999-9999-4999-8999-999999999999' });
  await expectReject('introspection refusing', hsTok, { ...base, introspect: async () => null });
  await expectReject('introspection erroring', hsTok, { ...base, introspect: async () => { throw new Error('boom'); } });
  // The fallback must still not resurrect alg:none.
  await expectReject('alg:none WITH an introspector configured',
    `${b64uStr(JSON.stringify({ alg: 'none' }))}.${parts[1]}.`, introspectOk);

  // The introspection result is cached, so the fallback costs one round trip
  // per token per minute rather than one per accrual.
  _resetJwtCaches();
  let calls = 0;
  const counting = { ...base, introspect: async () => { calls++; return SUB; } };
  await verifyJwt(hsTok, counting);
  await verifyJwt(hsTok, counting);
  ok(calls === 1, `the introspection fallback called GoTrue ${calls}x for the same token`);

  // ── 4. JWKS UNAVAILABLE ─────────────────────────────────────────────────
  // A cold start with no reachable JWKS must FAIL, and it must fail as OUR
  // outage (`auth_unavailable`), not as the player's fault — a 401 there would
  // sign everyone out on a blip.
  _resetJwtCaches();
  try {
    await verifyJwt(good, { ...base, fetchImpl: async () => { throw new Error('offline'); } });
    problems.push('a cold start with an unreachable JWKS ACCEPTED a token');
  } catch (e) {
    ok(String(e?.message) === 'auth_unavailable',
      `an unreachable JWKS reported '${e?.message}', expected auth_unavailable`);
  }
  // …but a WARM cache keeps serving, so a blip does not lock the game.
  _resetJwtCaches();
  await verifyJwt(good, base);
  try {
    const s = await verifyJwt(good, { ...base, fetchImpl: async () => { throw new Error('offline'); } });
    ok(s === SUB, 'a warm JWKS cache stopped verifying during an auth-host blip');
  } catch (e) { problems.push(`a warm cache failed during a blip: ${e?.message || e}`); }

  // ── 5. Helpers ──────────────────────────────────────────────────────────
  ok(bearerOf('Bearer abc') === 'abc', 'bearerOf did not strip a Bearer prefix');
  ok(bearerOf('bearer abc') === 'abc', 'bearerOf is case-sensitive on the scheme');
  ok(bearerOf('abc') === '', 'bearerOf accepted a token with no scheme');
  ok(bearerOf(null) === '', 'bearerOf threw on a missing header');
  try { splitJwt('a.b'); problems.push('splitJwt accepted a two-part token'); } catch { /* expected */ }
  try {
    assertClaims(claims(), ISSUER, NOW);
  } catch (e) { problems.push(`assertClaims rejected a good claim set: ${e?.message}`); }

  ok(typeof gotrueIntrospector(PROJECT, 'k') === 'function', 'gotrueIntrospector did not build a callable');

  // ── 6. THE LIVE PROJECT ─────────────────────────────────────────────────
  // Everything above uses a stubbed JWKS, so everything above would still pass
  // if the module never talked to the real world. This one does: it fetches the
  // ACTUAL published key set for nezapsylztqbbwuwembx and proves that a token we
  // sign ourselves — carrying the project's own real `kid` — is refused.
  //
  // Network-dependent, so it reports SKIPPED rather than passing quietly. A
  // skipped check that prints nothing is the failure mode this program has hit
  // six times.
  const live = await liveJwksCheck(kp, other, H);
  return live;
}

async function liveJwksCheck(kp, other, H) {
  let keys = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(JWKS_URL, { signal: ctrl.signal });
    clearTimeout(t);
    keys = (await res.json())?.keys;
  } catch { return 'SKIPPED (no network to the project JWKS)'; }

  if (!Array.isArray(keys) || !keys.length) {
    /* Not a failure of this module: it means the project has NOT rotated to
       asymmetric signing keys and every real token is HS256, which the
       introspection fallback covers. Say so out loud. */
    return 'SKIPPED (the project publishes no JWKS keys — tokens are HS256, the introspection fallback is the live path)';
  }

  const kid = keys[0].kid;
  const alg = keys[0].alg || 'ES256';
  _resetJwtCaches();
  const forged = await sign(other.kp.privateKey, { alg, typ: 'JWT', kid }, claims());
  try {
    const sub = await verifyJwt(forged, {
      jwksUrl: JWKS_URL, issuer: ISSUER, subtle, nowMs: NOW,
    });
    problems.push(`LIVE: a self-signed token carrying the project's real kid was ACCEPTED (sub ${sub})`);
  } catch (e) {
    ok(String(e?.message) === 'not_signed_in',
      `LIVE: the forged token was rejected as '${e?.message}', expected not_signed_in`);
  }
  return `verified against the LIVE project JWKS (${keys.length} key(s), ${alg}, kid ${String(kid).slice(0, 8)}…)`;
}

export async function runAll() {
  problems.length = 0;
  let note = '';
  try { note = await run(); }
  catch (e) { problems.push(`jwt-verify crashed: ${e?.stack || e}`); }
  return { problems: problems.slice(), note };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { problems: found, note } = await runAll();
  if (found.length) {
    console.log('JWT verification guard — FAILED:');
    for (const p of found) console.log('  x ' + p);
    process.exit(1);
  }
  console.log('JWT verification guard — every forgery refused, signature checked in-process.');
  console.log(`  ${note}`);
}
