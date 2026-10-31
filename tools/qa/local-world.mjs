#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/qa/local-world.mjs — PLAY THE REAL GAME WITH NO PRODUCTION AND NO SECRETS.
//
// The real play.html + src/ on 127.0.0.1. Behind it: the replayed migration chain (PGlite,
// tests/schema-replay.mjs), OPENED by applying 2027-02-10-playtest-open.sql inside this database only;
// the real hr-accrue handler (index.ts, type-stripped by Node 24, PGlite behind a postgres.js shim);
// a small GoTrue shim (sign-up from the real screen, real ES256 tokens the real jwt.js verifies).
//
//   node tools/qa/local-world.mjs smoke [--shots DIR] [--viewport 1280x720] [--touch]
//        fresh account -> hero -> Mill Cellar -> skip -> leave -> summary -> bag -> reload. Exit 0 green, 1 red, 2 harness, 3 refused.
//        A machine's first run replays the whole chain (about 6 min; tests/pglite-template.mjs then caches it), so this is a
//        manual tool, not a CI guard. HR_LOCAL_WORLD_TRACE=1 logs every call over 500 ms. HR_CHROME picks the browser (tests/_chrome.mjs).
//   node tools/qa/local-world.mjs serve [--port 8787] [--no-tick]    a world for any browser: http://127.0.0.1:8787/play.html
//   node tools/qa/local-world.mjs skip 30 [--port 8787]              skip 30 minutes in a world that is serving
//   node tools/qa/local-world.mjs --selftest                         the production refusal + the skip's mover, planted
//
//   import { openWorld } from './tools/qa/local-world.mjs';
//   const world = await openWorld();                     // { url, db, skip, tick, play, close }; one world per process
//   const p = await world.play({ account: 'marlow', viewport: { width: 1440, height: 900 }, touch: false, shots: 'art/review/x' });
//   await p.createHero('Marlow');  await p.enterHunt('mill_cellar');  await world.skip(30);
//   await p.shot('after');  p.text();  p.errors;  p.offsite;  p.page /* raw Playwright */;  await p.reload();  await world.close();
//
// A TIME SKIP compresses waiting and fakes no result: every open hunt's clocks AND every epoch value in its
// world JSON move back together (a hero idles if only one moves), then the real engine settles the window the
// way the world tick does, through the signed tick request. Only this process's in-memory database moves.
//
// SAFE BY CONSTRUCTION: refuses to start when any environment value names the production project; the client's
// project URL is rewritten to this server as the file is served; the engine's env is a closed map, never
// process.env; postgres.js resolves to the shim, so no socket can open; every non-local fetch in this process
// and every non-local browser request is refused and listed. It never reads ~/.supabase-token.
//
// NOT COVERED: time skip of farm, cooking or gathering clocks (hunts only); pushes authorize nobody (any joined
// topic hears its frames); bug reports are kept in memory; emails (a new account is confirmed at once); Sentry
// and PostHog; PostgREST table reads (the client makes none); true concurrency (PGlite is one backend).
// mutant-anchors: none — --selftest plants its own values; a manual tool, not a CI guard
// ════════════════════════════════════════════════════════════════════════
import { createServer } from 'node:http';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { extname, join, normalize, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const PRODUCTION_REF = 'nezapsylztqbbwuwembx';
const REFUSED = 3;
const PASSWORD = 'local-world-password';   // a throwaway value for accounts that live and die with this process
const OPEN_FILE = '2027-02-10-playtest-open.sql';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const SERVED = /^\/(play\.html$|src\/|assets\/|legal\/)/;

// ── THE REFUSAL ──────────────────────────────────────────────────────────
/** Every environment entry that names the production project, as `NAME` only (a value may be a secret). */
export function productionPointers(env = process.env) {
  return Object.entries(env).filter(([, v]) => typeof v === 'string' && v.includes(PRODUCTION_REF)).map(([k]) => k);
}
function refuseProduction() {
  const hits = productionPointers();
  if (!hits.length) return;
  console.error('local-world: REFUSED. These environment values name the production project: ' + hits.join(', ') + '. Unset them; this tool plays a local database only.');
  process.exit(REFUSED);
}
/** No fetch leaves this process: the engine's only caller is its own auth check, at this server. */
function fenceFetch(origin, offsite) {
  const real = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== origin) { offsite.push(String(url)); return Promise.reject(new Error('local-world: refused an off-machine fetch to ' + url.origin)); }
    return real(input, init);
  };
  return () => { globalThis.fetch = real; };
}

// ── THE SKIP'S MOVER ─────────────────────────────────────────────────────
/** A copy of `v` with every integer that reads as epoch milliseconds moved back by `ms`. Generic on purpose: a new
    persisted clock in the world or a session's JSON moves too, with no list here to go stale. */
export function shiftEpochs(v, ms) {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v > 1e12 && v < 4e12 ? v - ms : v;
  if (Array.isArray(v)) return v.map((e) => shiftEpochs(e, ms));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, e]) => [k, shiftEpochs(e, ms)]));
  return v;
}

// ── THE DATABASE ─────────────────────────────────────────────────────────
/* postgres.js's transaction surface over PGlite. int8 and numeric stay strings and json/timestamptz parse, as the
   driver answers them (index.ts's note on the pool). The DB_URL below only satisfies the pooler check; nothing dials it. */
const DRIVER_PARSERS = { 20: (x) => x, 1700: (x) => x };
function postgresShim(db) {
  const face = (tx) => {
    const run = (text, params) => tx.query(text, params || [], { parsers: DRIVER_PARSERS }).then((r) => r.rows);
    const t = (strings, ...vals) => run(strings.reduce((s, part, i) => s + '$' + i + part), vals);
    t.unsafe = run;
    let sp = 0;
    t.savepoint = async (fn) => {
      const name = 'lw_sp_' + (++sp);
      await tx.query('savepoint ' + name);
      try { const out = await fn(t); await tx.query('release savepoint ' + name); return out; }
      catch (e) { await tx.query('rollback to savepoint ' + name); throw e; }
    };
    return t;
  };
  return () => ({ begin: (fn) => db.transaction((tx) => fn(face(tx))) });
}

async function bootDatabase() {
  const { bootReplay } = await import(pathToFileURL(join(ROOT, 'tests/schema-replay.mjs')).href);
  const { SHIM_CRYPTO, SHIM_VAULT, SHIM_NET, K_SECRET } = await import(pathToFileURL(join(ROOT, 'tests/world-tick-token-shims.mjs')).href);
  const { db } = await bootReplay({ keepClosed: true });
  const open = (await readFile(join(ROOT, 'supabase/migrations', OPEN_FILE), 'utf8')).replace(/\r\n/g, '\n');
  await db.exec('begin;\n' + open + '\ncommit;');
  /* The betas play with every character premium (2026-12-17-beta-premium.sql); bootReplay turned it off for its guards. */
  await db.exec(`update public.hr_flags set enabled = true where key = 'beta_premium';`);
  /* The platform pieces the chain only probes: the push transport (the shape 2026-12-25-frame-push-revive.sql probes),
     and pg_net + Vault for the signed tick. */
  await db.exec(`create schema if not exists realtime;
    create table if not exists realtime.messages (id uuid primary key default gen_random_uuid(), topic text not null, extension text not null default 'broadcast',
      event text, payload jsonb, private boolean, inserted_at timestamptz not null default now());
    create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as
      'insert into realtime.messages (topic, extension, event, payload, private) values ($3, ''broadcast'', $2, $1, $4)';
    create or replace function realtime.topic() returns text language sql stable as 'select nullif(current_setting(''realtime.topic'', true), '''')::text';
    grant usage on schema realtime to authenticated, hr_engine;
    grant select, insert on realtime.messages to authenticated, hr_engine;
    grant execute on function realtime.topic() to authenticated;` + SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
  return { db, tickSecret: K_SECRET };
}

// ── THE ENGINE ───────────────────────────────────────────────────────────
let engineLoaded = null;
/** The real handler. Deno.serve hands it to us; the closed env map is all it can read. One per process (module state). */
async function loadEngine(db, env) {
  if (engineLoaded) throw new Error('local-world: one world per process (the engine is module state)');
  if (!/^(2[3-9]|[3-9]\d)\./.test(process.versions.node)) throw new Error('local-world: needs Node 23.6+ (type stripping), this is ' + process.versions.node);
  globalThis.__hrLocalPostgres = postgresShim(db);
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith('npm:postgres')) return { url: 'data:text/javascript,export default globalThis.__hrLocalPostgres', shortCircuit: true };
      return next(specifier, context);
    },
  });
  let handler = null;
  globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; return {}; } };
  engineLoaded = import(pathToFileURL(join(ROOT, 'supabase/functions/hr-accrue/index.ts')).href);
  await engineLoaded;
  if (!handler) throw new Error('local-world: index.ts registered no handler');
  return handler;
}

// ── THE AUTH SHIM (GoTrue's /auth/v1, what supabase-js calls) ────────────
function b64u(buf) { return Buffer.from(buf).toString('base64url'); }
async function createIssuer(origin) {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const kid = randomUUID();
  const jwk = { ...(await webcrypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'ES256', use: 'sig' };
  const sign = async (claims) => {
    const body = b64u(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' })) + '.' + b64u(JSON.stringify(claims));
    return body + '.' + b64u(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, Buffer.from(body)));
  };
  return { jwks: { keys: [jwk] }, sign, issuer: origin + '/auth/v1' };
}

function createAuthShim({ db, issuer }) {
  const byEmail = new Map(), refresh = new Map();
  let nextIp = 10;
  const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.at, confirmed_at: u.at,
    created_at: u.at, updated_at: u.at, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [{ id: u.id, provider: 'email' }] });
  async function session(u) {
    const now = Math.floor(Date.now() / 1000), exp = now + 3600;
    const access = await issuer.sign({ iss: issuer.issuer, sub: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, iat: now, exp, session_id: randomUUID() });
    const rt = randomUUID();
    refresh.set(rt, u);
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: rt, user: userJson(u) };
  }
  const refuse = (status, code, msg) => ({ status, body: { code: status, error_code: code, msg } });
  return {
    /* every account has its own address: the sign-up brake and the 4-per-network cap are per real player, and one PC hosts many */
    ipOf: (uid) => { for (const u of byEmail.values()) if (u.id === uid) return u.ip; return '198.51.100.1'; },
    userOfToken: (sub) => { for (const u of byEmail.values()) if (u.id === sub) return u; return null; },
    async signUp(body) {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email || String(body.password || '').length < 6) return refuse(422, 'weak_password', 'Password should be at least 6 characters.');
      const had = byEmail.get(email);
      /* an email that already has an account answers like a new one (GoTrue with confirmation on) */
      if (had) return { status: 200, body: { ...userJson(had), id: randomUUID(), identities: [] } };
      const u = { id: randomUUID(), email, password: String(body.password), at: new Date().toISOString(), ip: '198.51.100.' + (nextIp++ % 250) };
      const ev = { user: { id: u.id, email, user_metadata: {}, app_metadata: {} }, metadata: { ip_address: u.ip } };
      const hook = (await db.query('select public.hr_signup_gate($1::jsonb) as r', [JSON.stringify(ev)])).rows[0].r;
      if (hook && hook.error) return refuse(hook.error.http_code || 400, 'hook_refused', hook.error.message || 'refused');
      await db.query('insert into auth.users (id, email) values ($1, $2)', [u.id, email]);
      byEmail.set(email, u);
      return { status: 200, body: userJson(u) };
    },
    async token(grant, body) {
      if (grant === 'password') {
        const u = byEmail.get(String(body.email || '').trim().toLowerCase());
        if (!u || u.password !== body.password) return refuse(400, 'invalid_credentials', 'Invalid login credentials');
        return { status: 200, body: await session(u) };
      }
      if (grant === 'refresh_token') {
        const u = refresh.get(body.refresh_token);
        if (!u) return refuse(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
        refresh.delete(body.refresh_token);
        return { status: 200, body: await session(u) };
      }
      return refuse(400, 'unsupported_grant_type', 'unsupported grant');
    },
    userJson,
  };
}

// ── THE REST SHIM (PostgREST's /rest/v1/rpc, as `authenticated`) ─────────
const STATUS_OF_SQLSTATE = (code) => (code === '42501' ? 403 : code === '42883' ? 404 : /^23/.test(code || '') ? 409 : 400);
function createRest({ db, ipOf, verify }) {
  const procs = new Map();
  async function procOf(name) {
    if (procs.has(name)) return procs.get(name);
    const { rows } = await db.query(`select p.oid::regprocedure::text as sig, p.proretset as setof, p.prorettype::regtype::text as ret, p.pronargdefaults as defaults,
        coalesce(p.proargnames[1:p.pronargs], '{}') as names,
        (select coalesce(array_agg(format_type(t, null) order by i), '{}') from unnest(p.proargtypes::oid[]) with ordinality a(t, i)) as types
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [name]);
    procs.set(name, rows);
    return rows;
  }
  /* Named notation, overloads matched on the body's keys, the way PostgREST resolves a call. */
  function bind(rows, body) {
    const keys = Object.keys(body);
    const row = rows.find((p) => keys.every((k) => p.names.includes(k))
      && p.names.filter((n) => !keys.includes(n)).length <= p.defaults);
    if (!row) return null;
    const params = [], args = keys.map((k) => {
      const type = row.types[row.names.indexOf(k)];
      const v = body[k];
      if (v === null || v === undefined) { params.push(null); return k + ' := $' + params.length + '::text::' + type; }
      if (type.endsWith('[]') && Array.isArray(v)) {
        params.push(JSON.stringify(v));
        return k + ' := (select coalesce(array_agg(x), \'{}\')::' + type + ' from jsonb_array_elements_text($' + params.length + '::text::jsonb) x)';
      }
      params.push(typeof v === 'object' ? JSON.stringify(v) : String(v));
      return k + ' := $' + params.length + '::text::' + type;
    });
    return { row, args: args.join(', '), params };
  }
  return async function rpc(name, body, bearer) {
    let uid = null;
    if (bearer) {
      try { uid = await verify(bearer); }
      catch { return { status: 401, body: { code: 'PGRST301', message: 'JWT expired', details: null, hint: null } }; }
    }
    const role = uid ? 'authenticated' : 'anon';
    const rows = await procOf(name);
    const call = rows.length ? bind(rows, body || {}) : null;
    if (!call) return { status: 404, body: { code: 'PGRST202', message: 'Could not find the function public.' + name, details: null, hint: null } };
    const fn = 'public.' + name + '(' + call.args + ')';
    const sql = call.row.setof ? 'select coalesce(jsonb_agg(t), \'[]\'::jsonb) as r from ' + fn + ' t'
      : call.row.ret === 'void' ? 'select ' + fn + ' as r' : 'select to_jsonb(' + fn + ') as r';
    try {
      return await db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true),
                               set_config('request.headers', $3, true), set_config('request.method', 'POST', true), set_config('role', $4, true)`,
        [uid || '', JSON.stringify(uid ? { sub: uid, role } : { role }), JSON.stringify({ 'cf-connecting-ip': uid ? ipOf(uid) : '198.51.100.1' }), role]);
        await tx.query('set local role ' + role);
        await tx.query('select public.hr_access_check()');   // the pre-request hook (pgrst.db_pre_request)
        const out = (await tx.query(sql, call.params)).rows[0];
        return { status: call.row.ret === 'void' ? 204 : 200, body: call.row.ret === 'void' ? null : out.r };
      });
    } catch (e) {
      if (e.code === 'PGRST') {
        /* a raise with SQLSTATE PGRST: the message is the JSON body, the detail its status (closed-mode's hr_closed) */
        let msg = {}, det = {};
        try { msg = JSON.parse(e.message); det = JSON.parse(e.detail); } catch { /* the plain shape below */ }
        return { status: det.status || 400, body: msg };
      }
      return { status: STATUS_OF_SQLSTATE(e.code), body: { code: e.code || 'XX000', message: String(e.message), details: e.detail || null, hint: e.hint || null } };
    }
  };
}

// ── THE PUSH (Realtime's Phoenix socket over a bare RFC 6455) ────────────
function createPush(db) {
  const sockets = new Set();
  let pushed = 0;
  const frame = (text) => {
    const data = Buffer.from(text);
    const head = data.length < 126 ? Buffer.from([0x81, data.length])
      : data.length < 65536 ? Buffer.from([0x81, 126, data.length >> 8, data.length & 255])
        : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), (() => { const b = Buffer.alloc(4); b.writeUInt32BE(data.length); return b; })()]);
    return Buffer.concat([head, data]);
  };
  function sendTo(s, m) {
    const text = s.array ? JSON.stringify([m.join_ref ?? null, m.ref ?? null, m.topic, m.event, m.payload]) : JSON.stringify(m);
    try { s.socket.write(frame(text)); } catch { /* it is closing */ }
  }
  function onMessage(s, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (Array.isArray(m)) { s.array = true; m = { join_ref: m[0], ref: m[1], topic: m[2], event: m[3], payload: m[4] }; }
    const ok = (response) => sendTo(s, { join_ref: m.join_ref, ref: m.ref, topic: m.topic, event: 'phx_reply', payload: { status: 'ok', response: response || {} } });
    if (m.event === 'phx_join') { s.topics.set(m.topic, m.ref); ok({ postgres_changes: [] }); }
    else if (m.event === 'phx_leave') { s.topics.delete(m.topic); ok(); sendTo(s, { join_ref: m.join_ref, ref: m.ref, topic: m.topic, event: 'phx_close', payload: {} }); }
    else ok();
  }
  function onData(s, chunk) {
    s.buf = Buffer.concat([s.buf, chunk]);
    for (;;) {
      if (s.buf.length < 2) return;
      const op = s.buf[0] & 15;
      let len = s.buf[1] & 127, at = 2;
      if (len === 126) { if (s.buf.length < 4) return; len = s.buf.readUInt16BE(2); at = 4; }
      else if (len === 127) { if (s.buf.length < 10) return; len = Number(s.buf.readBigUInt64BE(2)); at = 10; }
      if (s.buf.length < at + 4 + len) return;
      const mask = s.buf.subarray(at, at + 4), data = Buffer.from(s.buf.subarray(at + 4, at + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      s.buf = s.buf.subarray(at + 4 + len);
      if (op === 8) { s.socket.end(); return; }
      if (op === 9) { s.socket.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); continue; }
      if (op === 1) onMessage(s, data.toString());
    }
  }
  return {
    upgrade(req, socket) {
      const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
      const s = { socket, buf: Buffer.alloc(0), topics: new Map(), array: false };
      sockets.add(s);
      socket.on('data', (c) => onData(s, c));
      socket.on('close', () => sockets.delete(s));
      socket.on('error', () => sockets.delete(s));
    },
    /** Deliver what realtime.send queued, then forget it. Called after every request that can write. */
    async drain() {
      const { rows } = await db.query('delete from realtime.messages returning topic, event, payload');
      for (const r of rows) for (const s of sockets) {
        const topic = 'realtime:' + r.topic;
        if (s.topics.has(topic)) pushed++;
        if (s.topics.has(topic)) sendTo(s, { topic, event: 'broadcast', ref: null, join_ref: s.topics.get(topic), payload: { type: 'broadcast', event: r.event, payload: r.payload } });
      }
    },
    pushed: () => pushed,
    close() { for (const s of sockets) s.socket.destroy(); },
  };
}

// ── THE WORLD ────────────────────────────────────────────────────────────
const readBody = (req) => new Promise((res, rej) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => res(Buffer.concat(parts))); req.on('error', rej); });
function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body === null || body === undefined ? undefined : Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
}

/* The two files that name the outside world, rewritten as they are served; a moved anchor is a loud failure. */
function rewriteServed(rel, text, origin) {
  const must = (from, to) => { if (!from.test(text)) throw new Error('local-world: ' + rel + ' moved, no anchor ' + from); text = text.replace(from, to); };
  if (rel === 'src/net/supabase-bootstrap.js') {
    must(/url: 'https:\/\/[a-z0-9]+\.supabase\.co'/, "url: '" + origin + "'");
    must(/anonKey: '[^']+'/, "anonKey: 'local-world-anon'");
  }
  if (rel === 'play.html') {
    must(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '');
    must(/https:\/\/[a-z0-9]+\.supabase\.co wss:\/\/[a-z0-9]+\.supabase\.co /, '');   // the page's own CSP now refuses production too, in any browser
  }
  if (text.includes(PRODUCTION_REF)) throw new Error('local-world: ' + rel + ' still names production after its rewrite');
  return text;
}

/* A driven world reads each file once (a busy disk stalled a page load past 30 s on tiny files); `serve` re-reads, so an edit shows on reload. */
async function serveStatic(res, urlPath, origin, held) {
  const f = normalize(join(ROOT, urlPath));
  const rel = f.slice(ROOT.length + 1).split('\\').join('/');
  if (!f.startsWith(ROOT) || !SERVED.test('/' + rel)) return send(res, 404, 'not served', 'text/plain');
  const type = MIME[extname(f).toLowerCase()] || 'application/octet-stream';
  if (held && held.has(rel)) return send(res, 200, held.get(rel), type);
  const info = await stat(f).catch(() => null);
  if (!info || !info.isFile()) return send(res, 404, 'not found', 'text/plain');
  const rewritten = rel === 'play.html' || rel === 'src/net/supabase-bootstrap.js';
  const body = rewritten ? rewriteServed(rel, await readFile(f, 'utf8'), origin) : await readFile(f);
  if (held) held.set(rel, body);
  return send(res, 200, body, type);
}

/**
 * @param {{port?: number, tickMs?: number|false, liveFiles?: boolean}} [o]  tickMs: how often the world tick fires (default 10 s, false: only
 *   on skip); liveFiles: re-read client files on every request (serve), else each is read once
 */
export async function openWorld(o = {}) {
  refuseProduction();
  const offsite = [], reports = [], held = o.liveFiles ? null : new Map();
  const { db, tickSecret } = await bootDatabase();
  let origin = '';
  const auth = { shim: null, issuer: null };
  let engine = null, rest = null, push = null, verifyJwtFn = null;

  const server = createServer(async (req, res) => {
    if (process.env.HR_LOCAL_WORLD_TRACE) {   // every slow call, by path: the first look when a page feels stuck
      const t0 = Date.now();
      res.on('finish', () => { if (Date.now() - t0 > 500) console.error('[local-world] ' + (Date.now() - t0) + ' ms ' + req.url); });
    }
    try {
      const url = new URL(req.url, origin);
      const p = url.pathname;
      if (p === '/') { res.writeHead(302, { Location: '/play.html' }); return res.end(); }
      if (p.startsWith('/auth/v1/')) return await authRoute(req, res, url);
      if (p.startsWith('/rest/v1/rpc/')) {
        const body = await readBody(req);
        const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const out = await rest(p.split('/').pop(), body.length ? JSON.parse(body) : {}, bearer);
        await push.drain();
        return send(res, out.status, out.body);
      }
      if (p === '/functions/v1/hr-accrue') {
        const body = req.method === 'POST' ? await readBody(req) : undefined;
        const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string'));
        const answer = await engine(new Request(origin + req.url, { method: req.method, headers, body }));
        await push.drain();
        res.writeHead(answer.status, Object.fromEntries(answer.headers));
        return res.end(Buffer.from(await answer.arrayBuffer()));
      }
      if (p === '/functions/v1/bug-report-bridge') { reports.push(JSON.parse(await readBody(req))); return send(res, 200, { ok: true }); }
      if (p === '/__world/skip') return send(res, 200, await world.skip(Number(url.searchParams.get('minutes'))));
      if (p === '/__world/status') return send(res, 200, { ok: true, offsite, reports: reports.length, pushed: push.pushed() });
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, null);
      return await serveStatic(res, decodeURIComponent(p), origin, held);
    } catch (e) {
      console.error('[local-world] ' + req.method + ' ' + req.url + ': ' + (e && e.stack || e));
      if (!res.headersSent) send(res, 500, { code: 'local_world', message: String(e && e.message || e) });
    }
  });

  async function authRoute(req, res, url) {
    const p = url.pathname.slice('/auth/v1/'.length);
    if (p === '.well-known/jwks.json') return send(res, 200, auth.issuer.jwks);
    const raw = req.method === 'GET' ? null : await readBody(req);
    const body = raw && raw.length ? JSON.parse(raw) : {};
    if (p === 'signup') { const r = await auth.shim.signUp(body); return send(res, r.status, r.body); }
    if (p === 'token') { const r = await auth.shim.token(url.searchParams.get('grant_type'), body); return send(res, r.status, r.body); }
    if (p === 'logout') return send(res, 204, null);
    if (p === 'recover') return send(res, 200, {});
    if (p === 'user') {
      const sub = await verifyJwtFn(String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')).catch(() => null);
      const u = sub && auth.shim.userOfToken(sub);
      if (!u) return send(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
      if (req.method === 'PUT' && body.password) u.password = String(body.password);
      return send(res, 200, auth.shim.userJson(u));
    }
    return send(res, 404, { code: 404, error_code: 'not_found', msg: 'not in the local auth shim: ' + p });
  }

  await new Promise((r) => server.listen(o.port || 0, '127.0.0.1', r));
  origin = 'http://127.0.0.1:' + server.address().port;
  server.on('upgrade', (req, socket) => (req.url.startsWith('/realtime/v1/websocket') ? push.upgrade(req, socket) : socket.destroy()));
  const unfence = fenceFetch(origin, offsite);

  auth.issuer = await createIssuer(origin);
  auth.shim = createAuthShim({ db, issuer: auth.issuer });
  const { verifyJwt } = await import(pathToFileURL(join(ROOT, 'supabase/functions/hr-accrue/jwt.js')).href);
  verifyJwtFn = (token) => verifyJwt(token, { jwksUrl: origin + '/auth/v1/.well-known/jwks.json', issuer: auth.issuer.issuer });
  rest = createRest({ db, ipOf: auth.shim.ipOf, verify: verifyJwtFn });
  push = createPush(db);
  engine = await loadEngine(db, { HR_ENGINE_DB_URL: 'postgres://local-world@127.0.0.1:6543/local', HR_TICK_SHARED_SECRET: tickSecret, SUPABASE_URL: origin, SUPABASE_ANON_KEY: 'local-world-anon' });

  /* THE WORLD TICK, the production path: the cron body queues signed POSTs (pg_net's shape), the handler verifies and settles them.
     The chain pins edge_url to production (Security M-5). Here pg_net is a queue this process drains into its own handler, so the URL
     goes nowhere: an unroutable value replaces it, and no config row in this database names production. */
  await db.exec('alter table public.hr_tick_config drop constraint hr_tick_config_edge_url_ck');
  await db.query(`update public.hr_tick_config set enabled = true, flush_seconds = 90, cadence_seconds = 10, batch_limit = 200, lease_ms = 30000, shards = 1, frame_push = true, edge_url = 'https://local-world.invalid/functions/v1/hr-accrue' where id`);
  let ticking = null;
  async function fireTick() {
    await db.query('select public.hr_tick_cron_run()');
    const { rows } = await db.query(`delete from net.http_request_queue returning headers, convert_from(body, 'UTF8') as body`);
    const answers = [];
    for (const r of rows) {
      const a = await engine(new Request(origin + '/functions/v1/hr-accrue', { method: 'POST', headers: r.headers, body: r.body }));
      answers.push({ status: a.status, body: await a.json().catch(() => null) });
    }
    await push.drain();
    return answers;
  }
  const tick = () => { ticking = ticking || fireTick().finally(() => { ticking = null; }); return ticking; };
  const tickMs = o.tickMs === undefined ? 10000 : o.tickMs;
  const ticker = tickMs ? setInterval(() => { tick().catch((e) => console.error('[local-world] tick: ' + e.message)); }, tickMs) : null;

  const columnsOf = async (table, types) => (await db.query(`select column_name as c from information_schema.columns
    where table_schema = 'public' and table_name = $1 and data_type = any($2)`, [table, types])).rows.map((r) => r.c);

  /* One row's clocks and JSON back by `ms`. ended_at never moves: only open sessions come here, and it is null on them. */
  async function moveRow(tx, table, id, ms, clockCols, jsonCols) {
    if (clockCols.length) await tx.query(`update public.${table} set ` + clockCols.map((c) => `${c} = ${c} - make_interval(secs => $2::float8 / 1000)`).join(', ') + ' where id = $1', [id, ms]);
    for (const c of jsonCols) {
      const v = (await tx.query(`select ${c}::text as v from public.${table} where id = $1`, [id])).rows[0].v;
      if (v === null) continue;
      let parsed;
      try { parsed = JSON.parse(v); } catch { continue; }
      await tx.query(`update public.${table} set ${c} = $2 where id = $1`, [id, JSON.stringify(shiftEpochs(parsed, ms))]);
    }
  }

  const world = {
    url: origin + '/play.html', origin, db, offsite, reports, tick, pushed: () => push.pushed(),
    /** Skip `minutes` for every open hunt: move its clocks and world together, then settle the way the tick does. */
    async skip(minutes) {
      if (!(minutes > 0)) throw new Error('local-world: skip(minutes) wants a positive number');
      const ms = Math.round(minutes * 60000);
      if (ticking) await ticking.catch(() => {});
      const sessionClocks = (await columnsOf('hunt_sessions', ['timestamp with time zone'])).filter((c) => c !== 'ended_at');
      const instanceClocks = await columnsOf('hunt_instances', ['timestamp with time zone']);
      const sessionJson = await columnsOf('hunt_sessions', ['json', 'jsonb']);
      const instanceJson = [...await columnsOf('hunt_instances', ['json', 'jsonb']), 'world'];
      /* one transaction: a page's poll can never settle a session whose clocks moved and whose instance's did not */
      const moved = await db.transaction(async (tx) => {
        const open = (await tx.query(`select id, instance_id from public.hunt_sessions where ended_at is null`)).rows;
        for (const s of open) await moveRow(tx, 'hunt_sessions', s.id, ms, sessionClocks, sessionJson);
        for (const id of new Set(open.map((s) => s.instance_id).filter(Boolean))) await moveRow(tx, 'hunt_instances', id, ms, instanceClocks, instanceJson);
        /* the stamina pool's clock rides the session's: hr_hunt_apply refuses a pool written past settled_to (stamina_ahead), and refused settles forfeit the hunt */
        await tx.query(`update public.player_state p set stamina_at = p.stamina_at - make_interval(secs => $1::float8 / 1000)
          from public.hunt_sessions s where s.ended_at is null and s.user_id = p.user_id and s.slot = p.slot and p.stamina_at is not null`, [ms]);
        return open.length;
      });
      return settleUp({ moved, minutes });
    },
    play: (opts) => play(world, opts),
    async close() {
      if (ticker) clearInterval(ticker);
      if (ticking) await ticking.catch(() => {});
      for (const c of driver.contexts) await c.close().catch(() => {});
      driver.contexts.clear();
      if (driver.browser) await driver.browser.close().catch(() => {});
      push.close();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      unfence();
      await db.close().catch(() => {});
    },
  };
  /* Fire until every open hunt has caught up (a settle takes one slice of a long backlog) or has ended; leases are
     dropped between fires so the next one may claim the session at once. */
  async function settleUp(out) {
    let fires = 0, lagMs = 0, reasons = [];
    for (; fires < 400; fires++) {
      const answers = await tick();
      reasons = answers.map((a) => (a.body && a.body.hunts && a.body.hunts.reasons) || null).filter(Boolean);
      const bad = answers.find((a) => a.status !== 200);
      if (bad) throw new Error('local-world: the tick answered ' + bad.status + ' ' + JSON.stringify(bad.body));
      lagMs = Number((await db.query(`select coalesce(max(extract(epoch from now() - i.settled_to) * 1000), 0)::float8 as lag
        from public.hunt_sessions s join public.hunt_instances i on i.id = s.instance_id where s.ended_at is null`)).rows[0].lag);
      if (lagMs < 100000) break;
      await db.query('delete from public.hunt_tick_lease');
    }
    return { ...out, fires: fires + 1, lagMs: Math.round(lagMs), reasons };
  }
  return world;
}

// ── THE DRIVER ───────────────────────────────────────────────────────────
const driver = { browser: null, contexts: new Set() };
async function browserOf() {
  if (driver.browser && driver.browser.isConnected()) return driver.browser;
  const { chromium } = await import('playwright');
  const { launchOptions } = await import(pathToFileURL(join(ROOT, 'tests/_chrome.mjs')).href);
  driver.browser = await chromium.launch(launchOptions({ headless: true }));
  return driver.browser;
}

async function play(world, { account, viewport = { width: 1280, height: 720 }, touch = false, shots = null } = {}) {
  if (!/^[a-z0-9_-]{1,40}$/i.test(String(account || ''))) throw new Error('local-world: play({ account }) wants a plain name');
  const browser = await browserOf();
  const ctx = await browser.newContext({ viewport, hasTouch: !!touch, isMobile: !!touch });
  driver.contexts.add(ctx);
  const errors = [], offsite = [];
  const local = new URL(world.origin).host;
  await ctx.route((u) => u.host !== local && u.protocol !== 'data:' && u.protocol !== 'blob:', (r) => { offsite.push(r.request().url()); return r.abort(); });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);           // a busy machine: the steps wait, a dead end still fails
  page.setDefaultNavigationTimeout(180000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(world.url, { waitUntil: 'load' });
  await page.waitForSelector('form[data-auth="sign-in"]');
  const email = account.toLowerCase() + '@local-world.test';
  if (!known.has(email)) {
    await page.click('[data-auth-go="create"]');
    await page.fill('input[name=email]', email);
    await page.fill('input[name=password]', PASSWORD);
    await page.fill('input[name=confirm]', PASSWORD);
    await page.click('.auth-submit');
    await page.waitForFunction(() => /Check your email/.test(document.querySelector('.auth-message')?.textContent || ''));
    await page.click('[data-auth-go="sign-in"]');
    known.add(email);
  }
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', PASSWORD);
  await page.click('.auth-submit');
  await page.waitForSelector('.char-row, .hs-launchers');
  let n = 0;
  return {
    page, errors, offsite, email,
    text: () => page.evaluate(() => document.body.innerText),
    async shot(name) {
      if (!shots) return null;
      mkdirSync(shots, { recursive: true });
      const file = join(shots, String(++n).padStart(2, '0') + '-' + name + '.png');
      await page.screenshot({ path: file });
      return file;
    },
    async createHero(name, slot = 0) {
      await page.click('[data-app="create"][data-slot="' + slot + '"]');
      await page.fill('.hero-name', name);
      await page.click('.hero-confirm');
      await page.waitForSelector('#panel-world[data-slot="' + slot + '"] .world-stage canvas');
      await page.waitForSelector('.hs-launchers');
    },
    /** Hunts window -> the ground -> Enter (the same two presses a player makes). */
    async enterHunt(huntId) {
      await page.click('[data-hs-open="hunts"]');
      await page.click('.hw-hunt[data-hunt="' + huntId + '"]');
      await page.click('.hw-hunt-enter');
      await page.waitForSelector('[data-hs-act="leave"]');
    },
    async reload() { await page.reload({ waitUntil: 'load' }); await page.waitForSelector('.char-row, .hs-launchers'); },
    close: async () => { driver.contexts.delete(ctx); await ctx.close(); },
  };
}
const known = new Set();

// ── THE SMOKE ────────────────────────────────────────────────────────────
async function smoke({ shots, viewport, touch }) {
  const fails = [], t0 = Date.now();
  const step = (name, ok, got) => { console.log((ok ? '  ok   ' : '  RED  ') + name + (ok ? '' : ' -- ' + got) + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)'); if (!ok) fails.push(name); };
  const world = await openWorld({ tickMs: false });
  step('world up: chain replayed and opened, engine loaded', true);
  try {
    const flag = (await world.db.query(`select enabled from public.hr_flags where key = 'closed_mode'`)).rows[0];
    step('the local chain is open', flag && flag.enabled === false, JSON.stringify(flag));
    const p = await world.play({ account: 'smoke', viewport, touch, shots });
    step('fresh account: created and signed in from the real screens', /Create hero/.test(await p.text()), (await p.text()).slice(0, 120));
    await p.shot('characters');
    await p.createHero('Smokey');
    await p.shot('town');
    step('hero created, in town', true);
    await p.enterHunt('mill_cellar');
    await p.shot('hunting');
    const sql = async (q) => (await world.db.query(q)).rows[0];
    const open0 = await sql(`select id, hunt_id, settled_to, ended_at from public.hunt_sessions where ended_at is null`);
    step('the server holds the Mill Cellar hunt', open0 && open0.hunt_id === 'mill_cellar', JSON.stringify(open0));
    /* Two skips: the second starts with packs dead, and their respawn clocks live in the world JSON. A skip that left them
       behind (the mutant this arm was proved on) keeps those packs away for the whole skip and the hero runs out of monsters. */
    await world.skip(5);
    const before = await sql(`select level_xp::bigint as xp from public.player_state limit 1`);
    const skipped = await world.skip(10);
    console.log('       ' + JSON.stringify(skipped));
    step('skip 10 min: the real tick settled it, no backlog left', skipped.moved === 1 && skipped.lagMs < 100000, JSON.stringify(skipped));
    const after = await sql(`select level_xp::bigint as xp from public.player_state limit 1`);
    const kills = await sql(`select count(*)::int as rows, coalesce(sum(xp), 0)::bigint as xp, coalesce(sum(gold), 0)::bigint as gold from public.player_ledger where kind = 'combat'`);
    step('the hero FOUGHT through the skip (600+ Level XP in 10 min; a skip of the clocks alone idles)', Number(after.xp) >= Number(before.xp) + 600, JSON.stringify({ before, after, kills }));
    console.log('       ' + JSON.stringify({ before, after, kills, pushed: world.pushed() }));
    await p.page.waitForFunction(() => /\d/.test(document.querySelector('[data-hs-widget="analyzer"]')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
    await p.shot('after-skip');
    await p.page.click('[data-hs-act="leave"]');
    const ended = await p.page.waitForFunction(() => /Mill Cellar/.test(document.querySelector('.hsum-card .hsum-title')?.textContent || ''), null, { timeout: 60000 }).then(() => true, () => false);
    await p.shot('summary');
    const summary = await p.page.evaluate(() => document.querySelector('.hsum-card')?.innerText || '');
    step('leave -> the summary opens', ended && /Level XP/.test(summary), summary.slice(0, 300));
    const closed = await sql(`select end_reason from public.hunt_sessions order by entered_at desc limit 1`);
    step('the server ended the hunt (left)', closed.end_reason === 'left', JSON.stringify(closed));
    const bagOf = async () => {
      await p.page.click('[data-hs-open="inventory"]');
      await p.page.waitForSelector('.hw-pocket[data-item]');
      return p.page.evaluate(() => Array.from(document.querySelectorAll('.hw-pocket[data-item]')).map((li) => li.getAttribute('data-item') + ' ' + li.innerText.trim()).sort().join('|'));
    };
    const bag = await bagOf();
    await p.shot('bag');
    await p.reload();
    await p.page.waitForFunction(() => !!document.querySelector('.hs-launchers') || !!document.querySelector('[data-app="play"]'));
    if (await p.page.$('[data-app="play"]')) await p.page.click('[data-app="play"]');
    await p.page.waitForSelector('.hs-launchers');
    const again = await bagOf();
    await p.shot('bag-after-reload');
    step('reload: the bag comes back from the server, loot included', /bones /.test(bag) && bag === again, bag + ' VS ' + again);
    step('no console errors', p.errors.length === 0, p.errors.slice(0, 5).join(' | '));
    step('nothing left the machine', p.offsite.length === 0 && world.offsite.length === 0, [...p.offsite, ...world.offsite].slice(0, 5).join(' | '));
  } catch (e) {
    step('the walk finished', false, e && e.stack || e);
  } finally {
    await world.close();
  }
  console.log(fails.length ? 'local-world smoke: RED (' + fails.length + ') in ' + Math.round((Date.now() - t0) / 1000) + ' s'
    : 'local-world smoke: green in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  return fails.length ? 1 : 0;
}

// ── THE SELFTEST ─────────────────────────────────────────────────────────
function selftest() {
  const fails = [];
  const self = fileURLToPath(import.meta.url);
  const env = { ...process.env, HR_ENGINE_DB_URL: 'postgres://x@db.' + PRODUCTION_REF + '.supabase.co:6543/postgres' };
  const r = spawnSync(process.execPath, [self, 'smoke'], { env, encoding: 'utf8', timeout: 60000 });
  if (r.status !== REFUSED || !/HR_ENGINE_DB_URL/.test(r.stderr) || r.stderr.includes(PRODUCTION_REF)) fails.push('an env value naming production did not refuse by name: exit ' + r.status + ' ' + r.stderr.slice(0, 200));
  const T = Date.UTC(2026, 9, 30);
  const moved = shiftEpochs({ v: 1, s: 99, w: [T, 'x', [T + 5, 12]], u: [[{ respawnAtMs: T + 9 }, 1200, null]] }, 60000);
  if (JSON.stringify(moved) !== JSON.stringify({ v: 1, s: 99, w: [T - 60000, 'x', [T + 5 - 60000, 12]], u: [[{ respawnAtMs: T + 9 - 60000 }, 1200, null]] })) fails.push('shiftEpochs moved the wrong values: ' + JSON.stringify(moved));
  for (const f of fails) console.log('  RED  ' + f);
  console.log(fails.length ? 'local-world --selftest: RED' : 'local-world --selftest: production refused by name; the mover moves epochs and nothing else');
  return fails.length ? 1 : 0;
}

// ── THE CLI ──────────────────────────────────────────────────────────────
const { isMain } = await import(pathToFileURL(join(ROOT, 'tests/_is-main.mjs')).href);
if (isMain(import.meta.url)) {
  process.on('uncaughtException', (e) => { console.error('local-world: HARNESS: ' + String(e && e.message || e).split('\n')[0]); process.exit(2); });
  process.on('unhandledRejection', (e) => { console.error('local-world: HARNESS: ' + String(e && e.message || e).split('\n')[0]); process.exit(2); });
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  if (args.includes('--selftest')) process.exit(selftest());
  refuseProduction();
  const cmd = args[0];
  if (cmd === 'smoke') {
    const [w, h] = String(opt('--viewport') || '1280x720').split('x').map(Number);
    const code = await smoke({ shots: opt('--shots') ? resolvePath(opt('--shots')) : null, viewport: { width: w, height: h }, touch: args.includes('--touch') });
    process.exit(code);
  } else if (cmd === 'serve') {
    const world = await openWorld({ port: Number(opt('--port') || 8787), tickMs: args.includes('--no-tick') ? false : 10000, liveFiles: true });
    console.log('local-world: open ' + world.url + '   (Ctrl-C ends the world; nothing is kept)');
  } else if (cmd === 'skip') {
    const res = await fetch('http://127.0.0.1:' + Number(opt('--port') || 8787) + '/__world/skip?minutes=' + Number(args[1]));
    console.log(await res.text());
    process.exit(res.ok ? 0 : 1);
  } else {
    console.error('usage: node tools/qa/local-world.mjs smoke | serve | skip <minutes> | --selftest (see the header)');
    process.exit(2);
  }
}
