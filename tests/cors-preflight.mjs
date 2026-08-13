// ============================================================================
// tests/cors-preflight.mjs — the guard that would have caught the CORS bug.
//
// ── WHAT HAPPENED ──────────────────────────────────────────────────────────
// `hr-accrue` was packed, hash-guarded, deployed, and probed from curl and from
// Node. It answered. Every guard in the repo was green. From a browser on
// hearthrise.net it was COMPLETELY UNREACHABLE:
//
//   Response to preflight request doesn't pass access control check: No
//   'Access-Control-Allow-Origin' header is present on the requested resource.
//
// Nothing could see it, because **curl and Node do not issue a CORS preflight.
// Only a browser does.** The handoff had said for days that "only the HTTP/JWT/
// pooler shell is unverified"; this was that shell, broken in a way no
// server-side test could reach. So the rule this file encodes is:
//
//   A GUARD MUST USE THE TRANSPORT THE PLAYER USES. This one issues a real
//   `OPTIONS` with `Origin` and `Access-Control-Request-Headers` — never a POST
//   standing in for one.
//
// ── FOUR CHECKS, IN ORDER OF STRENGTH ──────────────────────────────────────
//   C1  BEHAVIOUR, in-process, always runs. Drives the SHIPPED module
//       (supabase/functions/hr-accrue/cors.js) with real Request/Response
//       objects: a preflight is admitted, it never reaches the handler, an
//       unknown origin is not blessed, and the error/429 paths keep the
//       headers. Deleting the OPTIONS branch or the ACAO header turns this RED.
//   C2  WIRING, against the PACKED bytes. C1 proves cors.js is correct; it
//       cannot prove index.ts uses it. `pack()` walks the static import graph,
//       so `cors.js` appears in the payload ONLY IF index.ts imports it, and
//       the payload must contain exactly one `Deno.serve(` — wrapped in
//       `withCors(`. A second registration, or an unwrapped one, is how the
//       wrapper would get bypassed, and it fails here. This half is a source
//       assertion and is stated as such: it checks WIRING, which is textual,
//       and it is not a substitute for C1, which checks behaviour.
//   C3  ALLOWLIST DRIFT. The origins in cors.js must be exactly the hosts
//       src/net/account-gate.js already calls PLAYER_HOSTS. Two hand-kept
//       copies of one list is the drift this repo has been burned by; a
//       comment is not a guard.
//   C4  THE DEPLOYED FUNCTION, over the network, when HR_ACCRUE_URL is set —
//       a real preflight against production, exactly as `deployedPayloadGuard`
//       does for the payload hash. SKIPPED, LOUDLY, when it is not set, so the
//       suite stays green for everyone without ever passing quietly.
//
// C4 is the only one that can see a gateway that strips headers, and it needs
// an env var; C1+C2 need nothing and run on every push. That split is
// deliberate — the check that runs always must be the one that catches the bug
// that happened.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack } from '../tools/pack-edge.mjs';
import {
  withCors, corsHeaders, isAllowedOrigin, ALLOWED_ORIGINS,
} from '../supabase/functions/hr-accrue/cors.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

const GAME_ORIGIN = 'https://hearthrise.net';
const EVIL_ORIGIN = 'https://hearthrise.net.evil.example';
const FN_URL = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue';

/** The exact request a browser sends before a cross-origin POST with a bearer
    token: method OPTIONS, no Authorization (by design), and the two
    Access-Control-Request-* headers the fetch spec requires. */
function preflightRequest(origin, askHeaders = 'authorization, content-type, apikey, x-client-info') {
  return new Request(FN_URL, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': askHeaders,
    },
  });
}

const listOf = (v) => String(v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

/* Line-granular comment stripper for C2. Both this file's subjects document
   `Deno.serve(withCors(...))` in prose, and a guard that counts its own
   documentation is the always-null probe in reverse: it would fail on a correct
   payload and get "fixed" by loosening the count. Line granularity is enough —
   nothing in the payload opens a block comment and then writes code on the same
   line — and it deliberately never strips mid-line, so a `//` inside a URL
   string cannot swallow real code. */
function stripComments(src) {
  const out = [];
  let inBlock = false;
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (inBlock) { if (t.includes('*/')) inBlock = false; continue; }
    if (t.startsWith('//')) continue;
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlock = true; continue; }
    out.push(line);
  }
  return out.join('\n');
}

// ── C1 · behaviour, in-process ──────────────────────────────────────────────
async function behaviourChecks() {
  const problems = [];

  /* A handler that THROWS if it is ever reached. The preflight carries no
     Authorization header, so if it reached the real handler it would 401 — and
     answering it before any auth/pool/rate work is the whole property. */
  let handlerCalls = 0;
  const exploding = withCors(async () => {
    handlerCalls += 1;
    throw new Error('the handler was reached by a preflight');
  });

  const res = await exploding(preflightRequest(GAME_ORIGIN));
  if (handlerCalls !== 0) {
    problems.push('C1: the OPTIONS preflight reached the handler — it must be answered before any auth, pool or rate-gate work');
  }
  if (res.status !== 204 && res.status !== 200) {
    problems.push(`C1: preflight answered ${res.status} — a browser needs a 2xx`);
  }
  const acao = res.headers.get('access-control-allow-origin');
  if (acao !== GAME_ORIGIN) {
    problems.push(`C1: preflight Access-Control-Allow-Origin is ${acao === null ? 'ABSENT' : `'${acao}'`}, expected '${GAME_ORIGIN}' — this is the exact bug`);
  }
  const allowedHeaders = listOf(res.headers.get('access-control-allow-headers'));
  for (const need of ['authorization', 'content-type', 'apikey', 'x-client-info']) {
    if (!allowedHeaders.includes(need)) {
      problems.push(`C1: the preflight does not admit the '${need}' header — the browser blocks the POST`);
    }
  }
  if (!listOf(res.headers.get('access-control-allow-methods')).includes('post')) {
    problems.push('C1: the preflight does not admit POST');
  }
  if (!listOf(res.headers.get('vary')).includes('origin')) {
    problems.push('C1: Vary: Origin is missing — a shared cache could serve one origin\'s admission decision to another');
  }
  const body = await res.text();
  if (body !== '') problems.push('C1: the preflight returned a body — it must carry no information at all');

  /* A header the base list does not name (a supabase-js version bump is exactly
     how this recurs) must still be admitted, and a junk one must not corrupt
     the header value. */
  const echoed = await exploding(preflightRequest(GAME_ORIGIN, 'x-future-sdk-header, bad header name'));
  const echoedList = listOf(echoed.headers.get('access-control-allow-headers'));
  if (!echoedList.includes('x-future-sdk-header')) {
    problems.push('C1: a requested header outside the base list was not echoed — a client-library bump reintroduces this bug');
  }
  if (echoedList.some((h) => /\s/.test(h))) {
    problems.push('C1: an unsanitised token reached Access-Control-Allow-Headers');
  }

  /* An unknown origin must NOT be blessed. It is also not refused — see the
     header of cors.js: CORS is not the authorization boundary here, the
     verified JWT is, and a 403 would brick the first wrapper build. */
  const evil = await exploding(preflightRequest(EVIL_ORIGIN));
  if (evil.headers.get('access-control-allow-origin') === EVIL_ORIGIN) {
    problems.push('C1: an unallowlisted origin was echoed back into Access-Control-Allow-Origin');
  }
  if (isAllowedOrigin(EVIL_ORIGIN)) problems.push('C1: isAllowedOrigin admits a lookalike origin (prefix/suffix match bug)');
  if (!isAllowedOrigin(GAME_ORIGIN)) problems.push('C1: isAllowedOrigin rejects the game origin');
  if (!isAllowedOrigin('http://localhost:8123')) problems.push('C1: isAllowedOrigin rejects local development');

  /* EVERY response path carries the headers. A 500 without them reads to the
     browser as a CORS failure and hides the real status. */
  const thrower = withCors(async () => { throw new Error('boom'); });
  /* withCors logs the unhandled error, correctly. Muted for this one call so a
     green run prints nothing that looks like a failure. */
  const realError = console.error;
  console.error = () => {};
  const five = await thrower(new Request(FN_URL, { method: 'POST', headers: { origin: GAME_ORIGIN } }));
  console.error = realError;
  if (five.status !== 500) problems.push(`C1: a throwing handler produced ${five.status}, expected 500`);
  if (five.headers.get('access-control-allow-origin') !== GAME_ORIGIN) {
    problems.push('C1: the 500 path carries no CORS header — the browser reports a CORS failure and the real status is invisible');
  }

  /* The 429 keeps Retry-After AND gains the CORS headers — the sibling
     bug-report-bridge has to remember that at each return site; here it is
     structural. */
  const limited = withCors(async () => new Response(JSON.stringify({ ok: false, error: 'rate_limited' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '30' },
  }));
  const four29 = await limited(new Request(FN_URL, { method: 'POST', headers: { origin: GAME_ORIGIN } }));
  if (four29.status !== 429) problems.push('C1: the rate-limited status was not preserved');
  if (four29.headers.get('retry-after') !== '30') problems.push('C1: Retry-After was dropped by the CORS wrapper');
  if (four29.headers.get('access-control-allow-origin') !== GAME_ORIGIN) problems.push('C1: the 429 path carries no CORS header');
  if (four29.headers.get('content-type') !== 'application/json') problems.push('C1: the handler Content-Type was dropped');
  const four29Body = await four29.json();
  if (four29Body?.error !== 'rate_limited') problems.push('C1: the response body did not survive the CORS wrapper');

  /* A non-browser caller (curl, the payload-hash guard) sends no Origin and
     must be unaffected. */
  const plain = await withCors(async () => new Response('ok', { status: 200 }))(
    new Request(FN_URL, { method: 'GET' }));
  if (plain.status !== 200 || (await plain.text()) !== 'ok') {
    problems.push('C1: a request with no Origin was altered by the CORS layer');
  }
  if (plain.headers.get('access-control-allow-origin') !== null) {
    problems.push('C1: an origin-less request was answered with an Allow-Origin header');
  }

  /* corsHeaders is a PURE function of its inputs — it reads no state, so a
     preflight cannot leak anything about a player. Same inputs, same bytes. */
  const a = JSON.stringify(corsHeaders(GAME_ORIGIN, 'authorization'));
  const b = JSON.stringify(corsHeaders(GAME_ORIGIN, 'authorization'));
  if (a !== b) problems.push('C1: corsHeaders is not a pure function of (origin, requested headers)');

  return problems;
}

// ── C2 · wiring, against the packed bytes ───────────────────────────────────
async function wiringChecks() {
  const problems = [];
  const { files, problems: packProblems } = await pack('hr-accrue');
  for (const p of packProblems) problems.push(`C2: pack failed — ${p}`);
  if (!files.length) return problems;

  /* pack() walks the STATIC IMPORT GRAPH from index.ts. cors.js is in the
     payload if and only if index.ts imports it. */
  if (!files.some((f) => f.name === 'cors.js')) {
    problems.push('C2: cors.js is not in the packed payload — index.ts does not import it, so nothing sets a CORS header');
  }

  const serves = [];
  for (const f of files) {
    const re = /Deno\.serve\s*\(\s*([A-Za-z_$][\w$]*)?/g;
    let m;
    const code = stripComments(f.content);
    while ((m = re.exec(code)) !== null) serves.push({ file: f.name, arg: m[1] || '' });
  }
  if (serves.length !== 1) {
    problems.push(`C2: the payload registers ${serves.length} Deno.serve handlers (${serves.map((s) => s.file).join(', ') || 'none'}) — there must be exactly one, and it must be the wrapped one`);
  }
  for (const s of serves) {
    if (s.arg !== 'withCors') {
      problems.push(`C2: ${s.file} calls Deno.serve(${s.arg || '<expression>'}) — the handler must be wrapped in withCors(), or the preflight is never answered`);
    }
  }
  return problems;
}

// ── C3 · allowlist drift ────────────────────────────────────────────────────
async function allowlistChecks() {
  const problems = [];
  let src;
  try {
    src = await readFile(join(ROOT, 'src', 'net', 'account-gate.js'), 'utf8');
  } catch {
    return ['C3: could not read src/net/account-gate.js — the allowlist has nothing to be compared against'];
  }
  const m = src.match(/PLAYER_HOSTS\s*=\s*\[([^\]]*)\]/);
  if (!m) return ['C3: PLAYER_HOSTS is gone from src/net/account-gate.js — this guard is now checking nothing'];
  const hosts = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
  if (!hosts.length) return ['C3: PLAYER_HOSTS parsed as empty — this guard is now checking nothing'];

  const want = new Set(hosts.map((h) => `https://${h}`));
  const have = new Set(ALLOWED_ORIGINS);
  for (const o of want) {
    if (!have.has(o)) problems.push(`C3: the game is served from ${o} but hr-accrue/cors.js does not allow it — the browser will be blocked`);
  }
  for (const o of have) {
    if (!want.has(o)) problems.push(`C3: hr-accrue/cors.js trusts ${o}, which is not a PLAYER_HOSTS origin — an origin the server trusts and the game does not serve from is a surface, not a convenience`);
  }
  return problems;
}

// ── C4 · the deployed function, over the network ────────────────────────────
async function deployedPreflight() {
  const url = process.env.HR_ACCRUE_URL;
  if (!url) {
    return { problems: [], note: 'deployed preflight SKIPPED (set HR_ACCRUE_URL)' };
  }
  const problems = [];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    /* No apikey and no Authorization ON PURPOSE. A preflight carries neither —
       that is why it must be answered before the auth work. Sending one here
       would test a request no browser makes. */
    const res = await fetch(url, {
      method: 'OPTIONS',
      signal: ctrl.signal,
      headers: {
        origin: GAME_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type, apikey, x-client-info',
      },
    });
    clearTimeout(t);
    /* Drain the body even though nothing reads it. An undrained response keeps
       a socket handle open, and `process.exit(1)` on top of one aborts the Node
       process on Windows with a libuv assertion — which would turn this guard's
       RED into an unreadable crash exactly when it is right. */
    await res.arrayBuffer().catch(() => {});
    if (res.status >= 400) {
      problems.push(`C4: the deployed OPTIONS preflight returned ${res.status} — a browser reads that as blocked`);
    }
    const acao = res.headers.get('access-control-allow-origin');
    if (acao !== GAME_ORIGIN && acao !== '*') {
      problems.push(`C4: the DEPLOYED function answers a preflight from ${GAME_ORIGIN} with Access-Control-Allow-Origin ${acao === null ? 'ABSENT' : `'${acao}'`} — the game cannot call it. Redeploy.`);
    }
    const allowed = listOf(res.headers.get('access-control-allow-headers'));
    for (const need of ['authorization', 'content-type']) {
      if (!allowed.includes(need) && !allowed.includes('*')) {
        problems.push(`C4: the deployed preflight does not admit '${need}'`);
      }
    }
    if (problems.length) return { problems, note: '' };
    return { problems, note: `deployed hr-accrue admits a real preflight from ${GAME_ORIGIN}` };
  } catch (e) {
    problems.push(`C4: could not preflight ${url}: ${e?.message || e}`);
    return { problems, note: '' };
  }
}

export async function runAll() {
  const problems = [
    ...(await behaviourChecks()),
    ...(await wiringChecks()),
    ...(await allowlistChecks()),
  ];
  const { problems: netProblems, note } = await deployedPreflight();
  problems.push(...netProblems);
  return { problems, note };
}

if (process.argv[1] && process.argv[1].endsWith('cors-preflight.mjs')) {
  const { problems, note } = await runAll();
  /* `process.exitCode`, never `process.exit()` — see the note at the bottom of
     tests/run-smoke.mjs. On Node 24 / win32, exiting explicitly from a process
     that has used fetch() aborts with a libuv assertion and reports 127, which
     would turn this guard's RED into an unreadable crash. */
  if (problems.length) {
    console.error('cors-preflight FAILED:');
    for (const p of problems) console.error('  x ' + p);
    process.exitCode = 1;
  } else {
    console.log(`cors-preflight OK — ${note}`);
  }
}
