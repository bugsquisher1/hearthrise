#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════
// tests/legacy-keys.mjs — NOTHING WE RUN MAY FALL BACK TO A KEY THE LEGACY JWT SECRET SIGNED
//
//   node tests/legacy-keys.mjs                   the guard (replays the chain for the FIRE arms)
//   node tests/legacy-keys.mjs --static          the LK arms alone, offline, under a second
//   node tests/legacy-keys.mjs --selftest        every planted defect must turn its arm red
//   node tests/legacy-keys.mjs --live            Coordinator, read-only: which phase production
//                                                is in, and whether it behaves like that phase
//   node tests/legacy-keys.mjs --live --expect=revoked   the same, red unless the switch finished
//
// mutant-anchors: none — every mutation transforms an in-memory copy of a source file, or
// restates a function from 2027-02-21-tick-gateway-apikey.sql on the booted database.
//
// ── WHY ─────────────────────────────────────────────────────────────────────────────
// The legacy JWT secret was exposed in a local session log (2026-11-01). It signs the legacy
// `anon` and `service_role` keys, so revoking it kills both, and a caller left holding one
// fails at that moment. The switch keeps a way back while it runs: the bridge can read
// SUPABASE_ANON_KEY and the driver can send hr_tick_gateway_key. Those are the two places a
// silent fall back could live, so this guard pins which key wins, and that nothing else in
// the repo reads or holds a legacy key.
//
//   CLIENT    LK-1  the bootstrap ships a publishable key under `publishableKey`
//   HOLDINGS  LK-2  no JWT-shaped literal in anything we ship or run; no secret key value
//             LK-3  no tool or test reads the project key out of the bootstrap as a JWT
//   EDGE      LK-4  hr-accrue reads no API key; only api-key.js may name SUPABASE_ANON_KEY;
//                   nothing reads a service-role key, a secret key or a JWT secret
//             LK-5  projectApiKey: publishable wins whenever the platform gives one
//             LK-6  verifyJwt has no HS* path left to hand a minted token to
//   CI        LK-7  no workflow reads a legacy key from a repo secret
//   DB        LK-8  the staged file holds the bootstrap's own key and no other value
//             FIRE  the real hr_tick_cron_run on the replayed chain, pg_net stubbed:
//                   publishable row -> `apikey` alone, no Authorization, no JWT in the queue;
//                   a secret key in that row -> `no_secret` and nothing queued;
//                   no row -> the legacy JWT alone (the way back); nothing -> `no_secret`
//
// --live never holds a secret and prints only names, states and status codes. The legacy anon
// key it probes with is public; it is read from git history so no JWT stays in the tree.
// ═══════════════════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const argv = process.argv.slice(2);
const MIGRATION = '2027-02-21-tick-gateway-apikey.sql';
const BOOTSTRAP = 'src/net/supabase-bootstrap.js';
const API_KEY_JS = 'supabase/functions/bug-report-bridge/api-key.js';
const JWT_LITERAL = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\b/;
const SECRET_LITERAL = /\bsb_secret_[A-Za-z0-9_-]{20,}\b/;
const LEGACY_SHA = '902d26757';   // v0.2.82: the last commit whose bootstrap held the legacy anon key
const REF = 'nezapsylztqbbwuwembx';

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

/* Everything we ship or run. docs/, prototypes/ and .legacy are frozen paper, and the scan of
   vendored SDKs would only find their own test strings. */
const SCAN_ROOTS = ['src', 'tools', 'tests', 'supabase/functions', 'supabase/migrations', '.github'];
const SCAN_FILES = ['play.html', 'index.html', 'sw.js', 'supabase/config.toml'];
const TEXT = /\.(?:js|mjs|cjs|ts|json|html|css|sql|toml|yml|yaml|sh|md|txt)$/i;
function scanned() {
  const out = new Map();
  const walk = (rel) => {
    for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      const r = rel + '/' + e.name;
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || r === 'src/vendor') continue;
        walk(r);
      } else if (TEXT.test(e.name) && statSync(join(ROOT, r)).size < 4_000_000) out.set(r, read(r));
    }
  };
  for (const r of SCAN_ROOTS) if (existsSync(join(ROOT, r))) walk(r);
  for (const f of SCAN_FILES) if (existsSync(join(ROOT, f))) out.set(f, read(f));
  return out;
}

/* ── The arms, pure over a {path -> text} map, so a mutation feeds the code CI runs. ── */
function staticProblems(files, resolver, verifyJwtExports) {
  const p = [];
  // LK-1
  const boot = files.get(BOOTSTRAP) || '';
  const key = /publishableKey:\s*'([^']+)'/.exec(boot)?.[1] || '';
  if (!key.startsWith('sb_publishable_')) p.push(`LK-1 ${BOOTSTRAP} does not ship a publishable key`);
  if (/anonKey|eyJ/.test(boot)) p.push(`LK-1 ${BOOTSTRAP} still names a legacy key`);

  for (const [rel, text] of files) {
    // LK-2
    if (JWT_LITERAL.test(text)) p.push(`LK-2 ${rel} holds a JWT-shaped literal`);
    if (SECRET_LITERAL.test(text)) p.push(`LK-2 ${rel} holds a secret key value`);
    // LK-3: a tool that greps the bootstrap for a JWT silently gets no key once the client moves.
    if (/\.match\(\/eyJ\[/.test(text) || /anonKey:\\s\*'/.test(text)) p.push(`LK-3 ${rel} reads the project key as a JWT`);
    // LK-4
    if (rel.startsWith('supabase/functions/')) {
      const names = [...text.matchAll(/(?:Deno\.env\.get\(|env\()\s*'(SUPABASE_[A-Z_]+)'/g)].map((m) => m[1]);
      for (const n of names) {
        if (/SERVICE_ROLE|SECRET_KEY|JWT_SECRET/.test(n)) p.push(`LK-4 ${rel} reads ${n}`);
        if (n === 'SUPABASE_ANON_KEY' && rel !== API_KEY_JS) p.push(`LK-4 ${rel} reads SUPABASE_ANON_KEY outside the one fall back`);
        if (rel.startsWith('supabase/functions/hr-accrue/') && n !== 'SUPABASE_URL') p.push(`LK-4 hr-accrue reads ${n}: it needs no API key`);
      }
    }
    // LK-7
    if (rel.startsWith('.github/') && /secrets\.[A-Z_]*(ANON|SERVICE_ROLE|JWT_SECRET)/.test(text)) {
      p.push(`LK-7 ${rel} reads a legacy key from a repo secret`);
    }
  }

  // LK-5
  const env = (o) => (n) => o[n];
  const PUB = 'sb_publishable_x'; const ANON = 'legacy-anon-jwt';
  const both = resolver(env({ SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUB }), SUPABASE_ANON_KEY: ANON }));
  if (both !== PUB) p.push('LK-5 projectApiKey does not take the publishable key when both exist');
  if (resolver(env({ SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUB }) })) !== PUB) p.push('LK-5 projectApiKey lost the publishable key with no legacy beside it');
  if (resolver(env({ SUPABASE_PUBLISHABLE_KEYS: 'not json', SUPABASE_ANON_KEY: ANON })) !== ANON) p.push('LK-5 unparseable keys did not fall back');
  if (resolver(env({ SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'eyJ.a.b' }), SUPABASE_ANON_KEY: ANON })) !== ANON) p.push('LK-5 a non-publishable default was sent as the project key');
  if (resolver(env({})) !== '') p.push('LK-5 no key at all did not answer empty');

  // LK-6
  if (verifyJwtExports.includes('gotrueIntrospector')) p.push('LK-6 jwt.js still exports the HS* introspector');
  const jwtSrc = files.get('supabase/functions/hr-accrue/jwt.js') || '';
  if (/\bo\.introspect\b/.test(jwtSrc)) p.push('LK-6 verifyJwt still hands a token to an introspector');

  // LK-8
  const mig = files.get('supabase/migrations/' + MIGRATION) || '';
  if (!mig) p.push(`LK-8 ${MIGRATION} is missing`);
  const seeded = [...mig.matchAll(/sb_publishable_[A-Za-z0-9_-]{20,}/g)].map((m) => m[0]);
  if (seeded.length !== 1 || seeded[0] !== key) p.push(`LK-8 ${MIGRATION} must seed exactly the bootstrap's key`);
  return p;
}

async function loadResolver(src) {
  const dir = mkdtempSync(join(tmpdir(), 'lk-'));
  try {
    const f = join(dir, 'api-key.mjs');
    writeFileSync(f, src ?? read(API_KEY_JS));
    return (await import(pathToFileURL(f).href + '?t=' + Date.now())).projectApiKey;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const jwtExports = async () => Object.keys(await import(pathToFileURL(join(ROOT, 'supabase/functions/hr-accrue/jwt.js')).href));

/* ── THE FIRE: the real driver on the replayed chain. ── */
const GATE = (src) => /create or replace function public\.hr_tick_gateway_headers[\s\S]*?\n\$\$;/.exec(src)[0];
const DRIVER = (src) => /create or replace function public\.hr_tick_cron_run\(\)[\s\S]*?\nend \$\$;/.exec(src)[0];
const LEGACY = 'legacy-anon-jwt-shim';
const PUB_REAL = () => /publishableKey:\s*'([^']+)'/.exec(read(BOOTSTRAP))[1];

async function bootFire() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const { SHIM_CRYPTO, SHIM_VAULT, SHIM_NET, PROBE, lit } = await import('./world-tick-token-shims.mjs');
  const { db } = await bootReplay({});
  await db.exec(SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
  const [{ activity_id }] = (await db.query("select activity_id from public.hr_activities where kind = 'gather' limit 1")).rows;
  await db.exec(`
    insert into auth.users (id) values (${lit(PROBE)}) on conflict do nothing;
    insert into public.player_state (user_id, slot, hp, version, accrued_to, active_kind, active_id, active_since)
    values (${lit(PROBE)}, 0, 10, 1, now() - interval '10 minutes', 'gather', ${lit(activity_id)}, now() - interval '1 hour')
    on conflict (user_id, slot) do nothing;
    insert into public.hr_tick_ownership (user_id, slot, channel, owned)
    values (${lit(PROBE)}, 0, 'gather', true) on conflict do nothing;
    update public.hr_tick_config set enabled = true,
      edge_url = 'https://${REF}.supabase.co/functions/v1/hr-accrue' where id;`);
  return { db, PROBE };
}

async function fireProblems(db) {
  const p = [];
  const seed = async (name, value) => {
    await db.query('delete from vault.decrypted_secrets where name = $1', [name]);
    if (value !== null) await db.query('insert into vault.decrypted_secrets (name, decrypted_secret) values ($1, $2)', [name, value]);
  };
  const fire = async () => {
    await db.query('delete from net.http_request_queue');
    /* The probe character's lease from the last fire ends now, or this one would roster nobody. */
    await db.exec(`update public.hr_tick_ownership set lease_holder = null, lease_until = null;
                   update public.hr_tick_shard_cursor set cursor_at = null, cursor_user = null, cursor_slot = null;`);
    const out = (await db.query('select public.hr_tick_cron_run() r')).rows[0].r;
    const rows = (await db.query('select headers from net.http_request_queue order by id')).rows.map((r) => r.headers);
    return { out, rows };
  };
  const PUB = PUB_REAL();

  await seed('hr_tick_gateway_key', LEGACY); await seed('hr_tick_gateway_apikey', PUB);
  let f = await fire();
  if (f.out.outcome !== 'posted' || !f.rows.length) {
    p.push(`FIRE-A a publishable row did not post (${f.out.outcome}): the arms below would be vacuous`);
  } else {
    if (f.rows.some((h) => h.apikey !== PUB)) p.push('FIRE-A a post did not carry the publishable key on apikey');
    if (f.rows.some((h) => 'Authorization' in h)) p.push('FIRE-A a post still carried Authorization: the tick falls back to the legacy key');
    if (f.rows.some((h) => JSON.stringify(h).includes(LEGACY))) p.push('FIRE-A the legacy key reached the queue');
    if (f.rows.some((h) => !/^v1 t=\d+ b=[0-9a-f]{64} m=[0-9a-f]{64}$/.test(String(h['X-HR-Tick-Auth'])))) p.push('FIRE-A a post lost the tick token');
    if (f.rows.some((h) => h['Content-Type'] !== 'application/json')) p.push('FIRE-A a post lost its content type');
  }

  await seed('hr_tick_gateway_apikey', 'sb_secret_shimvalue');
  f = await fire();
  if (f.out.outcome !== 'no_secret' || f.rows.length) p.push(`FIRE-B a secret key in the row was not refused (${f.out.outcome}, ${f.rows.length} queued)`);
  const logTxt = (await db.query("select coalesce(string_agg(l::text, ' '), '') t from public.hr_tick_cron_log l")).rows[0].t;
  if (logTxt.includes('sb_secret_shimvalue')) p.push('FIRE-B the refused key reached the fire log');

  await seed('hr_tick_gateway_apikey', null);
  f = await fire();
  if (f.out.outcome !== 'posted' || !f.rows.length) p.push(`FIRE-C the way back did not post (${f.out.outcome})`);
  else {
    if (f.rows.some((h) => h.Authorization !== 'Bearer ' + LEGACY)) p.push('FIRE-C the way back did not send the legacy JWT');
    if (f.rows.some((h) => 'apikey' in h)) p.push('FIRE-C the way back sent an apikey');
  }

  await seed('hr_tick_gateway_key', null);
  f = await fire();
  if (f.out.outcome !== 'no_secret' || f.rows.length) p.push(`FIRE-D no key at all was not no_secret (${f.out.outcome}, ${f.rows.length} queued)`);

  await seed('hr_tick_gateway_key', LEGACY); await seed('hr_tick_gateway_apikey', PUB);
  return p;
}

/* ── --selftest ── */
const replaced = (files, rel, from, to) => {
  const m = new Map(files);
  const s = m.get(rel);
  if (s === undefined) throw new Error('mutation names a missing file: ' + rel);
  const next = typeof from === 'string' ? s.replace(from, to) : s.replace(from, to);
  if (next === s) throw new Error('mutation anchor did not match in ' + rel + ': ' + from);
  m.set(rel, next);
  return m;
};

async function selftest() {
  const files = scanned();
  const resolver = await loadResolver();
  const exps = await jwtExports();
  const PUB = PUB_REAL();
  const FAKE_JWT = ['eyJ' + 'hbGciOiJIUzI1NiJ9', 'eyJyb2xlIjoiYW5vbiJ9aaaaaaaaaa', 'abcdefghijklmnop'].join('.');
  const clean = staticProblems(files, resolver, exps);
  let bad = 0;
  const say = (ok, id, why) => { if (!ok) bad++; console.log(`  ${ok ? 'ok   ' : 'FAIL '} ${id} — ${why}`); };
  say(clean.length === 0, 'CLEAN', clean.length ? clean.join('; ') : 'the static arms are green at rest');

  const apiKeySrc = read(API_KEY_JS);
  const STATIC = [
    ['M1-client-back-on-the-jwt', 'LK-1', () => [replaced(files, BOOTSTRAP, `publishableKey: '${PUB}'`, `publishableKey: '${FAKE_JWT}'`), resolver, exps]],
    ['M2-client-renamed-back', 'LK-1', () => [replaced(files, BOOTSTRAP, 'publishableKey:', 'anonKey:'), resolver, exps]],
    ['M3-a-jwt-in-a-tool', 'LK-2', () => [replaced(files, 'tools/deploy-edge.local.mjs', 'const key =', `const legacy = '${FAKE_JWT}';\nconst key =`), resolver, exps]],
    ['M4-a-secret-value-in-a-migration', 'LK-2', () => [replaced(files, 'supabase/migrations/' + MIGRATION, "'hr_tick_gateway_apikey',\n", `'sb_secret_${'a'.repeat(30)}', 'hr_tick_gateway_apikey',\n`), resolver, exps]],
    ['M5-tool-greps-a-jwt', 'LK-3', () => [replaced(files, 'tools/deploy-edge.local.mjs', /\.match\(\/sb_publishable_\[A-Za-z0-9_-\]\+\//, '.match(/e' + 'yJ[A-Za-z0-9_\\-.]{40,}/'), resolver, exps]],
    ['M6-accrue-reads-anon-again', 'LK-4', () => [replaced(files, 'supabase/functions/hr-accrue/index.ts', "const SUPABASE_URL =", "const K = Deno.env.get('SUPABASE_ANON_KEY');\nconst SUPABASE_URL ="), resolver, exps]],
    ['M7-accrue-reads-publishable', 'LK-4', () => [replaced(files, 'supabase/functions/hr-accrue/index.ts', "const SUPABASE_URL =", "const K = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');\nconst SUPABASE_URL ="), resolver, exps]],
    ['M8-bridge-reads-service-role', 'LK-4', () => [replaced(files, API_KEY_JS, "env('SUPABASE_ANON_KEY')", "env('SUPABASE_SERVICE_ROLE_KEY')"), resolver, exps]],
    ['M9-bridge-reads-anon-directly', 'LK-4', () => [replaced(files, 'supabase/functions/bug-report-bridge/index.ts', "const apiKey =", "const old = Deno.env.get('SUPABASE_ANON_KEY');\n  const apiKey ="), resolver, exps]],
    ['M10-the-introspector-is-back', 'LK-6', () => [files, resolver, [...exps, 'gotrueIntrospector']]],
    ['M11-verifyjwt-asks-an-introspector', 'LK-6', () => [replaced(files, 'supabase/functions/hr-accrue/jwt.js', 'if (!ASYM[alg]) throw new Error(JWT_ERR.BAD_ALG);', 'if (!ASYM[alg]) return o.introspect(token);'), resolver, exps]],
    ['M12-a-workflow-reads-anon', 'LK-7', () => [replaced(files, '.github/workflows/keep-supabase-warm.yml', 'secrets.SUPABASE_PUBLISHABLE_KEY', 'secrets.SUPABASE_ANON_KEY'), resolver, exps]],
    ['M13-migration-seeds-another-key', 'LK-8', () => [replaced(files, 'supabase/migrations/' + MIGRATION, PUB, 'sb_publishable_' + 'b'.repeat(30)), resolver, exps]],
  ];
  for (const [id, arm, make] of STATIC) {
    let got = [];
    try { const [f, r, e] = make(); got = staticProblems(f, r, e); } catch (err) { got = ['THREW ' + err.message]; }
    say(got.some((x) => x.startsWith(arm)), id, `must trip ${arm}${got.length ? '' : ' (nothing tripped)'}`);
  }

  const RESOLVERS = [
    ['M14-legacy-wins-when-both', () => apiKeySrc.replace("if (typeof key === 'string' && key.startsWith('sb_publishable_')) return key;", "if (env('SUPABASE_ANON_KEY')) return env('SUPABASE_ANON_KEY'); if (typeof key === 'string') return key;")],
    ['M15-any-default-is-sent', () => apiKeySrc.replace(" && key.startsWith('sb_publishable_')", '')],
    ['M16-no-way-back', () => apiKeySrc.replace("return env('SUPABASE_ANON_KEY') || '';", "return '';")],
  ];
  for (const [id, make] of RESOLVERS) {
    const src = make();
    if (src === apiKeySrc) { say(false, id, 'the mutation did not apply'); continue; }
    const got = staticProblems(files, await loadResolver(src), exps);
    say(got.some((x) => x.startsWith('LK-5')), id, 'must trip LK-5');
  }

  // The SQL mutants restate the shipped function on ONE booted chain, then put it back.
  const mig = read('supabase/migrations/' + MIGRATION);
  const { db } = await bootFire();
  const base = await fireProblems(db);
  say(base.length === 0, 'CLEAN-FIRE', base.length ? base.join('; ') : 'the fire arms are green at rest');
  const SQL = [
    ['M17-driver-prefers-the-legacy-key', 'FIRE-A', DRIVER(mig), (t) => t.replace('public.hr_tick_gateway_headers(v_apikey, v_gateway)', 'public.hr_tick_gateway_headers(null, v_gateway)')],
    ['M18-driver-sends-both', 'FIRE-A', DRIVER(mig), (t) => t.replace("|| jsonb_build_object('Content-Type', 'application/json',", "|| jsonb_build_object('Authorization', 'Bearer ' || v_gateway, 'Content-Type', 'application/json',")],
    ['M19-secret-key-falls-back', 'FIRE-B', GATE(mig), (t) => t.replace("when coalesce(p_apikey, '') <> '' then null\n", '')],
    ['M20-secret-key-is-sent', 'FIRE-B', GATE(mig), (t) => t.replace("when p_apikey like 'sb\\_publishable\\_%' then", "when coalesce(p_apikey, '') <> '' then")],
    ['M21-no-way-back', 'FIRE-C', GATE(mig), (t) => t.replace("when coalesce(p_legacy_jwt, '') <> '' then jsonb_build_object('Authorization', 'Bearer ' || p_legacy_jwt)\n", '')],
    ['M22-nothing-usable-still-posts', 'FIRE-D', GATE(mig), (t) => t.replace('    else null\n', "    else jsonb_build_object('apikey', '')\n")],
  ];
  for (const [id, arm, original, plant] of SQL) {
    const mutated = plant(original);
    if (mutated === original) { say(false, id, 'the mutation did not apply'); continue; }
    await db.exec(mutated);
    let got = [];
    try { got = await fireProblems(db); } catch (e) { got = ['THREW ' + e.message]; }
    await db.exec(original);
    say(got.some((x) => x.startsWith(arm)), id, `must trip ${arm}`);
  }
  try { await db.close(); } catch { /* the process is ending */ }
  if (bad) { console.log(`\nlegacy-keys --selftest FAILED — ${bad} unproven`); process.exit(1); }
  console.log(`\nlegacy-keys --selftest PASSED — ${STATIC.length + RESOLVERS.length + SQL.length} mutations caught.`);
  process.exit(0);
}

/* ── --live: read-only. Names, states and status codes only. ── */
async function live() {
  const expect = (argv.find((a) => a.startsWith('--expect=')) || '').slice('--expect='.length);
  const tok = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
  const api = async (p) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}${p}`, { headers: { Authorization: `Bearer ${tok}` } });
    return r.ok ? r.json() : null;
  };
  const sql = async (query) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
    });
    return r.ok ? r.json() : null;
  };
  const signing = await api('/config/auth/signing-keys/legacy');
  const legacyApi = await api('/api-keys/legacy');
  const fns = await api('/functions');
  const legacyStatus = signing?.status || 'unknown';
  const legacyEnabled = legacyApi?.enabled;
  const phase = legacyStatus === 'revoked' ? 'revoked' : legacyEnabled === false ? 'deactivated' : 'legacy-active';
  console.log(`PHASE ${phase}: legacy api keys enabled=${legacyEnabled}, legacy signing key=${legacyStatus}`);

  const problems = [];
  const PUB = PUB_REAL();
  const base = `https://${REF}.supabase.co`;
  const LEGACY_ANON = (() => {
    try {
      return /eyJ[A-Za-z0-9_\-.]{40,}/.exec(execFileSync('git', ['show', `${LEGACY_SHA}:${BOOTSTRAP}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))?.[0] || '';
    } catch { return ''; }
  })();
  if (!LEGACY_ANON) problems.push(`the legacy anon key could not be read from ${LEGACY_SHA}: no history in this clone`);
  const lb = (headers) => fetch(`${base}/rest/v1/rpc/hr_leaderboard`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ p_board: 'total_level', p_limit: 1, p_span: 0 }),
  }).then((r) => r.status);
  const edge = (headers) => fetch(`${base}/functions/v1/hr-accrue`, { headers }).then((r) => r.status);
  const claim = (ok, line) => { console.log(`  ${ok ? 'ok ' : 'RED'} ${line}`); if (!ok) problems.push(line); };

  claim(await lb({ apikey: PUB }) === 200, 'REST answers the publishable key');
  claim(await edge({ apikey: PUB }) === 200, 'hr-accrue GET passes the gateway on apikey alone');
  claim(await edge({ apikey: PUB, Authorization: 'Bearer aaa.bbb.ccc' }) === 401, 'hr-accrue gateway refuses a garbage bearer');
  for (const f of Array.isArray(fns) ? fns : []) claim(f.verify_jwt === true, `${f.slug} deployed with verify_jwt on`);

  const vault = await sql(`begin read only;
    select count(*) filter (where name = 'hr_tick_gateway_apikey' and decrypted_secret like 'sb\\_publishable\\_%')::int as publishable,
           count(*) filter (where decrypted_secret like 'sb\\_secret\\_%')::int as secret_keys
      from vault.decrypted_secrets; commit;`);
  const v = Array.isArray(vault) ? vault[0] : null;
  claim(v?.publishable === 1, 'Vault holds one publishable hr_tick_gateway_apikey');
  claim(v?.secret_keys === 0, 'Vault holds no secret key');
  const net = await sql(`select coalesce(status_code, 0)::int as code, count(*)::int as n from net._http_response where created > now() - interval '3 minutes' group by 1 order by 1`);
  const fires = await sql(`select outcome, count(*)::int as n from public.hr_tick_cron_log where at > now() - interval '3 minutes' group by 1 order by 1`);
  console.log(`  ..  last 3 min tick posts by status: ${JSON.stringify(net)}; fires: ${JSON.stringify(fires)}`);
  if (Array.isArray(net) && !net.length) console.log('  ..  NOTHING WAS POSTED, so the next line proves nothing: open a hunt and re-run');
  claim(Array.isArray(net) && !net.some((r) => r.code === 401 || r.code === 403), 'no tick post refused at the gateway in the last 3 minutes');
  claim(Array.isArray(fires) && !fires.some((r) => r.outcome === 'no_secret'), 'no fire refused for want of a gateway key');

  if (LEGACY_ANON) {
    const onApikey = await lb({ apikey: LEGACY_ANON, Authorization: 'Bearer ' + LEGACY_ANON });
    const signed = await lb({ apikey: PUB, Authorization: 'Bearer ' + LEGACY_ANON });
    const atEdge = await edge({ apikey: PUB, Authorization: 'Bearer ' + LEGACY_ANON });
    console.log(`  ..  legacy anon: as apikey ${onApikey}; as a JWT on REST ${signed}; as a JWT at the edge ${atEdge}`);
    if (phase !== 'legacy-active') claim(onApikey === 401 || onApikey === 403, 'the legacy anon key is refused as an apikey');
    if (phase === 'revoked') {
      /* THE PROOF THE SECRET IS DEAD, without anyone holding it: this JWT is signed by it. */
      claim(signed === 401, 'a token signed by the legacy secret is refused by the Data API');
      claim(atEdge === 401, 'a token signed by the legacy secret is refused by the edge gateway');
    }
  }
  if (expect && phase !== expect) problems.push(`expected phase ${expect}, measured ${phase}`);
  if (problems.length) { console.log(`\nlegacy-keys --live RED (${problems.length})`); process.exit(1); }
  console.log(`\nlegacy-keys --live green in phase ${phase}`);
  process.exit(0);
}

/* ── the guard ── */
async function main() {
  const problems = staticProblems(scanned(), await loadResolver(), await jwtExports());
  for (const p of problems) console.log('  ✗ ' + p);
  if (!problems.length) console.log('  ✓ LK-1..8: no shipped or run file holds, reads or falls back to a legacy key');
  if (argv.includes('--static')) process.exit(problems.length ? 1 : 0);
  const { db } = await bootFire();
  const fire = await fireProblems(db);
  for (const p of fire) console.log('  ✗ ' + p);
  if (!fire.length) console.log('  ✓ FIRE: publishable on apikey alone; a secret key refused; the legacy JWT only with no row; nothing is no_secret');
  try { await db.close(); } catch { /* the process is ending */ }
  const n = problems.length + fire.length;
  console.log(n ? `\nlegacy-keys FAILED (${n})` : '\nlegacy-keys passed');
  process.exit(n ? 1 : 0);
}

const run = argv.includes('--live') ? live : argv.includes('--selftest') ? selftest : main;
run().catch((e) => { console.error('legacy-keys: ' + (e && e.message || e)); process.exit(2); });
