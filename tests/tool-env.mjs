#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/tool-env.mjs — EVERY TOOL THAT REACHES A SUPABASE PROJECT NAMES IT (lane/a-staging).
//
//   node tests/tool-env.mjs            the guard
//   node tests/tool-env.mjs --mutate   mutation proof: each planted defect must turn its rule red
//
// mutant-anchors: tools/lib/env.mjs tools/apply-migration.mjs tools/deploy-edge.local.mjs tools/hunt-health.local.mjs tools/char-state.local.mjs tools/staging-bootstrap.local.mjs tools/release-check.local.mjs
// mutant-writes-tree: no — mutants are planted into a temp copy of the tools; the fake home is never on disk
//
// WHY (2026-11-10). There are two projects now, production and staging, and one token that can write to both.
// A tool that guesses which one it talks to will, one tired night, apply a rehearsal to production or grade
// production by what staging holds. So each tool names its project (tools/lib/env.mjs), and this guard runs
// every tool's own main() against a FAKE home (an envs.json, a token) and a FAKE network: nothing here reads
// the real token file or opens a socket, mutants included.
//
//   TE-1  a write with no --env refuses and sends nothing; a read defaults to production; only two names exist
//   TE-2  ~/.hearthrise/envs.json can never cross the projects: staging is never production's ref, production's
//         is fixed, a typo'd environment or field refuses, a staging site says staging, only a publishable key fits
//   TE-3  the token is read only when a call needs it, travels only in the Authorization header (or the child's
//         env for the CLI), and is in no printed line
//   TE-4  the apply tool: the project is the first line; it is asked its own name before any SQL; the bytes go to
//         that project alone; supabase/schema.sql is never applied from it
//   TE-5  staging first: once staging is set up, production refuses bytes staging has not run, short of a stated decision
//   TE-6  the edge deploy: --deploy names its project; a staging deploy carries production's ref nowhere
//   TE-7  the read tools (hunt-health, char-state, release-check) print the project first and read only that project
//   TE-8  the bootstrap writes staging and nothing else, in the chain's order, schema.sql only into an empty
//         database, secrets by name only; production is only ever read
//   TE-9  live-hash-drift never records or explains production's bodies from staging, and grades staging by the replay
// Exit: 0 green · 1 a rule red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, normalize, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { scopedMutants } from '../tools/lib/mutant-scope.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const TOOLS = ['tools/lib/env.mjs', 'tools/apply-migration.mjs', 'tools/deploy-edge.local.mjs', 'tools/hunt-health.local.mjs',
  'tools/char-state.local.mjs', 'tools/staging-bootstrap.local.mjs', 'tools/release-check.local.mjs'];
const PROD = 'nezapsylztqbbwuwembx';
const STAGE = 'stgprojectfakerefabc';
const TOKEN = 'sbp_FAKE_TOKEN_tool_env_0123456789';
const KEY = 'sb_publishable_FAKE_staging_key_000';
const HOME = normalize('H:/hr-fake-home');
const PROBE = '2099-01-01-tool-env-probe.sql';
const PROBE_SQL = 'create or replace function public.hr_tool_env_probe() returns int language sql as $$ select 1 $$;\n';
const HASH = 'ab'.repeat(32);

/** The tools as modules: the repo's own files, or a temp copy with `overrides` (repo path -> text) planted. */
async function loadTools(overrides) {
  const out = {};
  if (!overrides) {
    for (const f of TOOLS) out[f] = await import(pathToFileURL(join(ROOT, f)).href);
    return { mods: out, drop() {} };
  }
  const dir = mkdtempSync(join(tmpdir(), 'hr-tool-env-'));
  for (const f of TOOLS) {
    let text = overrides[f] !== undefined ? overrides[f] : readFileSync(join(ROOT, f), 'utf8');
    /* an import of another copied tool stays relative (the copy); every other import points at the repo's file */
    text = text.replace(/(from\s+')(\.{1,2}\/[^']+)(')/g, (all, a, spec, c) => {
      const target = normalize(join(ROOT, dirname(f), spec));
      const rel = target.slice(ROOT.length + 1).split('\\').join('/');
      return TOOLS.includes(rel) ? all : a + pathToFileURL(target).href + c;
    });
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  for (const f of TOOLS) out[f] = await import(pathToFileURL(join(dir, f)).href);
  return { mods: out, drop() { try { rmSync(dir, { recursive: true, force: true }); } catch (e) { /* a temp dir */ } } };
}

/** A fake home and a fake network. `o.envs`: envs.json's object (null: no file); `o.names`: ref -> project name; `o.db(ref, sql)`. */
function world(o = {}) {
  const files = new Map();
  const at = (...p) => normalize(join(HOME, ...p));
  if (o.envs !== null) files.set(at('.hearthrise', 'envs.json'), JSON.stringify(o.envs === undefined ? { staging: { ref: STAGE, publishableKey: KEY } } : o.envs));
  if (o.token !== null) files.set(at('.supabase-token'), TOKEN + '\n');
  if (o.ledger) files.set(at('.hearthrise', 'staging-applied.json'), JSON.stringify(o.ledger));
  files.set(normalize(join(ROOT, 'supabase', 'migrations', PROBE)), o.probe || PROBE_SQL);
  const reads = [];
  const written = new Map();
  const calls = [];
  const lines = [];
  const names = o.names || { [PROD]: 'hearthrise-testing', [STAGE]: 'hearthrise-staging' };
  const read = (p) => {
    const n = normalize(isAbsolute(p) ? p : resolve(ROOT, p));
    reads.push(n);
    if (files.has(n)) return files.get(n);
    if (n.startsWith(ROOT)) return readFileSync(n, 'utf8');
    const e = new Error('ENOENT (fake home): ' + n); e.code = 'ENOENT'; throw e;
  };
  const write = (p, text) => { const n = normalize(p); written.set(n, text); files.set(n, text); };
  const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => body });
  let deployed = false;
  const fetchFake = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    const body = typeof init.body === 'string' ? init.body : '';
    calls.push({ url: u, method, body, auth: (init.headers && (init.headers.Authorization || init.headers.authorization)) || '' });
    let m;
    if ((m = /^https:\/\/api\.supabase\.com\/v1\/projects\/([a-z]+)$/.exec(u))) return names[m[1]] === undefined ? answer(404, 'no such project') : answer(200, { id: m[1], name: names[m[1]] });
    if ((m = /^https:\/\/api\.supabase\.com\/v1\/projects\/([a-z]+)\/database\/query$/.exec(u))) {
      const r = o.db ? o.db(m[1], JSON.parse(body).query) : undefined;
      if (r && r.fail) return answer(r.fail, r.message || 'refused');
      return answer(200, r === undefined ? [] : r);
    }
    if ((m = /^https:\/\/([a-z]+)\.supabase\.co\/functions\/v1\/hr-accrue$/.exec(u))) return answer(200, { ok: true, payload_sha256: deployed ? HASH : (o.live || {})[m[1]] || 'cd'.repeat(32) });
    if (/\/config\/database\/pooler$/.test(u)) return answer(200, [{ db_host: 'aws-0-us-west-2.pooler.supabase.com', db_port: 5432 }]);
    if (/\/secrets$/.test(u)) return answer(method === 'GET' ? 200 : 201, method === 'GET' ? [{ name: 'HR_ENGINE_DB_URL' }, { name: 'HR_TICK_SHARED_SECRET' }] : []);
    if (/\/config\/auth$/.test(u)) return answer(200, method === 'GET' ? { password_min_length: 8, jwt_exp: 3600, smtp_pass: 'MUST-NOT-BE-COPIED' } : {});
    if (/^https:\/\/api\.github\.com\//.test(u)) return answer(200, { workflow_runs: [{ path: '.github/workflows/smoke.yml', status: 'completed', conclusion: 'success', head_sha: 'f'.repeat(40), id: 1 }] });
    if ((m = /^(https:\/\/[^/]+)\/src\/build-info\.js/.exec(u))) return answer(200, "version: '" + ((o.served || {})[m[1]] || '0.0.0') + "'");
    return answer(404, {});
  };
  const run = (cmd, args, childEnv) => {
    calls.push({ run: cmd, args: args.slice(), childToken: !!(childEnv && childEnv.SUPABASE_ACCESS_TOKEN === TOKEN) });
    if (args.includes('--hash')) return 'hr-accrue ' + HASH + '\n';
    if (cmd === 'npx') { deployed = true; const w = args[args.indexOf('--workdir') + 1]; calls[calls.length - 1].config = readFileSync(join(w, 'supabase', 'config.toml'), 'utf8'); }
    return '';
  };
  const deps = { fetch: fetchFake, read, write, home: HOME, root: ROOT, log: (s) => lines.push(String(s)), err: (s) => lines.push(String(s)),
    run, sleep: async () => {}, busyWindowMs: 0, packHash: () => HASH, random: (n) => 'S3CR3T'.repeat(12).slice(0, n) };
  return { deps, calls, lines, reads, written, files, at };
}

const net = (w) => w.calls.filter((c) => c.url);
const names = (w, ref) => net(w).filter((c) => c.url.includes(ref));
const tokenRead = (w) => w.reads.some((p) => p.endsWith('.supabase-token'));
const sqlPosts = (w, ref) => net(w).filter((c) => c.method === 'POST' && c.url.endsWith(`/projects/${ref}/database/query`));
const printed = (w) => w.lines.join('\n');

async function checks(overrides) {
  const fails = [];
  const { mods, drop } = await loadTools(overrides);
  const E = mods['tools/lib/env.mjs'];
  const apply = (argv, w) => E.runTool(mods['tools/apply-migration.mjs'].main, argv, w.deps);
  const edge = (argv, w) => E.runTool(mods['tools/deploy-edge.local.mjs'].main, argv, w.deps);
  const boot = (argv, w) => E.runTool(mods['tools/staging-bootstrap.local.mjs'].main, argv, w.deps);
  const refusal = (fn) => { try { fn(); return null; } catch (e) { return e && e.refusal ? String(e.message) : 'THREW: ' + (e && e.message); } };
  const env = (argv, write, w) => E.resolveEnv({ argv, write, home: HOME, read: w.deps.read });
  try {
    { // TE-1
      const w = world();
      const r = refusal(() => env([], true, w));
      if (!r || !/--env staging/.test(r) || !/--env production/.test(r)) fails.push('TE-1 a write with no --env did not refuse naming both projects: ' + r);
      const d = env([], false, w);
      if (d.name !== 'production' || d.ref !== PROD) fails.push('TE-1 a read with no --env is not production: ' + d.name + ' ' + d.ref);
      const s = env(['x.sql', '--env', 'staging'], true, w);
      if (s.name !== 'staging' || s.ref !== STAGE || s.rest.join(' ') !== 'x.sql') fails.push('TE-1 --env staging did not resolve the staging project: ' + JSON.stringify([s.name, s.ref, s.rest]));
      if (env(['--env=staging'], true, w).ref !== STAGE) fails.push('TE-1 --env=staging is not read');
      for (const bad of [['--env', 'prod'], ['--env', 'Staging'], ['--env'], ['--env', 'staging', '--env', 'production'], ['--env=']]) {
        if (!refusal(() => env(bad, true, w))) fails.push('TE-1 ' + JSON.stringify(bad) + ' did not refuse');
      }
      if (!s.banner.includes('staging') || !s.banner.includes(STAGE) || !d.banner.includes('production')) fails.push('TE-1 the banner does not name the project: ' + s.banner);
      const none = world({ envs: null });
      if (!/not set up/.test(refusal(() => env(['--env', 'staging'], false, none)) || '')) fails.push('TE-1 staging with no envs.json did not say it is not set up');
      if (env(['--env', 'production'], true, none).ref !== PROD) fails.push('TE-1 production needs no envs.json');
    }
    { // TE-2
      const crossed = world({ envs: { staging: { ref: PROD } } });
      for (const [argv, write] of [[['--env', 'staging'], true], [['--env', 'production'], true], [[], false]]) {
        if (!/PRODUCTION/.test(refusal(() => env(argv, write, crossed)) || '')) fails.push('TE-2 staging.ref = production\'s project did not refuse ' + JSON.stringify(argv));
      }
      if (!refusal(() => env(['--env', 'production'], true, world({ envs: { production: { ref: STAGE }, staging: { ref: STAGE } } })))) fails.push('TE-2 envs.json re-aimed production and nothing refused');
      if (!refusal(() => env([], false, world({ envs: { stagging: { ref: STAGE } } })))) fails.push('TE-2 a typo\'d environment name did not refuse');
      if (!refusal(() => env([], false, world({ envs: { staging: { ref: STAGE, token: TOKEN } } })))) fails.push('TE-2 a token field in envs.json did not refuse');
      if (!refusal(() => env(['--env', 'staging'], false, world({ envs: { staging: { ref: 'short' } } })))) fails.push('TE-2 a malformed staging ref did not refuse');
      if (!/staging/.test(refusal(() => env(['--env', 'staging'], false, world({ envs: { staging: { ref: STAGE, site: 'https://beta.hearthrise.net' } } }))) || '')) fails.push('TE-2 a staging site with no "staging" in its name did not refuse');
      if (!refusal(() => env(['--env', 'staging'], false, world({ envs: { staging: { ref: STAGE, site: 'http://staging.hearthrise.net' } } })))) fails.push('TE-2 an http staging site did not refuse');
      const secretKey = 'sb_secret_THIS_MUST_NOT_ECHO_12345';
      const r = refusal(() => env(['--env', 'staging'], false, world({ envs: { staging: { ref: STAGE, publishableKey: secretKey } } })));
      if (!r) fails.push('TE-2 a non-publishable key in envs.json did not refuse');
      else if (r.includes(secretKey)) fails.push('TE-2 the refusal echoed the key it refused');
      if (E.isStagingHost('hearthrise.net') || !E.isStagingHost('staging.hearthrise.net') || !E.isStagingHost('hearthrise-staging.pages.dev')) fails.push('TE-2 isStagingHost reads a label wrong');
    }
    { // TE-3
      const w = world();
      const e = env(['--env', 'staging'], true, w);
      if (tokenRead(w)) fails.push('TE-3 resolving the env read the token file before any call needed it');
      if (e.token() !== TOKEN) fails.push('TE-3 the token was not read from the fake home');
      if (JSON.stringify(e).includes(TOKEN) || e.banner.includes(TOKEN)) fails.push('TE-3 the env object or its banner carries the token');
      if (E.scrub('HTTP 401 for ' + TOKEN, e).includes(TOKEN)) fails.push('TE-3 scrub left the token in a message');
      const other = world({ envs: { staging: { ref: STAGE, tokenFile: '~/.supabase-token-staging' } } });
      other.files.set(other.at('.supabase-token-staging'), 'sbp_STAGING_ONLY\n');
      if (env(['--env', 'staging'], true, other).token() !== 'sbp_STAGING_ONLY') fails.push('TE-3 an env\'s own tokenFile is not the one read');
      const noTok = world({ token: null });
      if (!refusal(() => env([], false, noTok).token())) fails.push('TE-3 a missing token file is not a refusal');
    }
    { // TE-4
      let w = world();
      let code = await apply([PROBE], w);
      if (code !== 2 || net(w).length || tokenRead(w)) fails.push(`TE-4 an apply with no --env did not refuse cold: exit ${code}, ${net(w).length} request(s), token read ${tokenRead(w)}`);
      w = world();
      code = await apply([PROBE, '--env', 'staging'], w);
      const posts = sqlPosts(w, STAGE);
      if (code !== 0) fails.push('TE-4 a staging apply failed: exit ' + code + ' ' + printed(w).slice(0, 200));
      if (!/^\[env: staging · project stgprojectfakerefabc\] APPLY$/.test(w.lines[0] || '')) fails.push('TE-4 the first line is not the project: ' + w.lines[0]);
      if (names(w, PROD).length) fails.push('TE-4 a staging apply sent a request naming production: ' + names(w, PROD)[0].url);
      if (!posts.length || !JSON.parse(posts[0].body).query.endsWith(PROBE_SQL) || !JSON.parse(posts[0].body).query.startsWith("set local lock_timeout = '5s';")) fails.push('TE-4 the staging project did not get the file\'s bytes under the lock bound');
      const first = net(w)[0] || {};
      if (first.method !== 'GET' || first.url !== 'https://api.supabase.com/v1/projects/' + STAGE) fails.push('TE-4 the project was not asked its name before the SQL: first request ' + first.method + ' ' + first.url);
      if (net(w).some((c) => c.auth !== 'Bearer ' + TOKEN)) fails.push('TE-4 a request left without the env\'s token in its Authorization header');
      if (printed(w).includes(TOKEN)) fails.push('TE-3 the apply printed the token');
      if (!w.written.has(w.at('.hearthrise', 'staging-applied.json'))) fails.push('TE-5 a staging apply left no note of the bytes it ran');
      for (const [argv, nm, why] of [[[PROBE, '--env', 'staging'], { [STAGE]: 'hearthrise-testing', [PROD]: 'hearthrise-testing' }, 'staging aimed at a project that does not say staging'],
        [[PROBE, '--env', 'production'], { [PROD]: 'hearthrise-staging' }, 'production aimed at a project that says staging'],
        [[PROBE, '--env', 'staging'], {}, 'a project that does not answer']]) {
        const x = world({ names: nm, envs: argv.includes('production') ? null : undefined });
        const c = await apply(argv, x);
        if (c !== 2 || net(x).some((q) => q.method === 'POST')) fails.push(`TE-4 ${why}: exit ${c}, SQL sent ${net(x).some((q) => q.method === 'POST')}`);
      }
      w = world();
      code = await apply(['schema.sql', '--env', 'staging'], w);
      if (code !== 2 || net(w).length || !/drops live tables/.test(printed(w))) fails.push('TE-4 supabase/schema.sql was not refused by the apply tool: exit ' + code);
      w = world({ envs: null });
      code = await apply([PROBE, '--verify-only'], w);
      if (code !== 0 || !w.lines[0].startsWith('[env: production') || sqlPosts(w, PROD).length !== 1 || /set local/.test(sqlPosts(w, PROD)[0].body)) fails.push('TE-4 --verify-only is not one read of production: exit ' + code + ', ' + sqlPosts(w, PROD).length + ' post(s)');
    }
    { // TE-5
      const M = mods['tools/apply-migration.mjs'];
      let w = world({ envs: null });
      if (await apply([PROBE, '--env', 'production'], w) !== 0 || sqlPosts(w, PROD).length < 1) fails.push('TE-5 with no staging set up, a named production apply must go as before');
      w = world();
      let code = await apply([PROBE, '--env', 'production'], w);
      if (code !== 2 || net(w).length) fails.push(`TE-5 production took bytes staging never ran: exit ${code}, ${net(w).length} request(s)`);
      w = world({ ledger: { [PROBE]: M.sha256(PROBE_SQL) } });
      if (await apply([PROBE, '--env', 'production'], w) !== 0 || !sqlPosts(w, PROD).length || names(w, STAGE).length) fails.push('TE-5 bytes staging ran did not go to production (and only there)');
      w = world({ ledger: { [PROBE]: M.sha256(PROBE_SQL) }, probe: PROBE_SQL + '-- edited after the rehearsal\n' });
      code = await apply([PROBE, '--env', 'production'], w);
      if (code !== 2 || net(w).length || !/changed since staging ran it/.test(printed(w))) fails.push('TE-5 a file edited after its rehearsal went to production: exit ' + code);
      w = world();
      if (await apply([PROBE, '--env', 'production', '--skip-staging=short'], w) !== 2) fails.push('TE-5 a skip with no real reason was accepted');
      w = world();
      code = await apply([PROBE, '--env', 'production', '--skip-staging=the tick is down and staging is being rebuilt'], w);
      if (code !== 0 || !/STAGING SKIPPED on a stated decision: the tick is down/.test(printed(w))) fails.push('TE-5 a stated decision to skip staging did not go, or was not printed: exit ' + code);
    }
    { // TE-6
      let w = world();
      let code = await edge(['--deploy'], w);
      if (code !== 2 || w.calls.length) fails.push(`TE-6 --deploy with no --env did not refuse cold: exit ${code}, ${w.calls.length} call(s)`);
      w = world({ envs: null });
      code = await edge([], w);
      if (code !== 0 || !w.lines[0].startsWith('[env: production') || w.calls.some((c) => c.run === 'npx') || !names(w, PROD).length) fails.push('TE-6 the dry run is not a read of production: exit ' + code);
      w = world();
      code = await edge(['--deploy', '--env', 'staging'], w);
      const npx = w.calls.find((c) => c.run === 'npx');
      if (code !== 0 || !npx) fails.push('TE-6 a staging deploy did not run: exit ' + code + ' ' + printed(w).slice(0, 200));
      else {
        if (!npx.args.includes('--remote=' + STAGE) || npx.args.join(' ').includes(PROD)) fails.push('TE-6 the staging deploy\'s arguments do not name staging alone: ' + npx.args.join(' '));
        if (!npx.config.includes(`project_id = "${STAGE}"`) || npx.config.includes(PROD)) fails.push('TE-6 the staging deploy\'s config.toml still names production');
        if (!npx.childToken || npx.args.join(' ').includes(TOKEN)) fails.push('TE-6 the token is not in the child\'s env alone');
        const id = net(w).findIndex((c) => c.url === 'https://api.supabase.com/v1/projects/' + STAGE);
        if (id < 0 || w.calls.indexOf(net(w)[id]) > w.calls.indexOf(npx)) fails.push('TE-6 the project was not asked its name before the deploy');
        if (names(w, PROD).length) fails.push('TE-6 a staging deploy read or wrote production: ' + names(w, PROD)[0].url);
        if (!/^\[env: staging · project stgprojectfakerefabc\] DEPLOY$/.test(w.lines[0])) fails.push('TE-6 the first line is not the project: ' + w.lines[0]);
        if (printed(w).includes(TOKEN)) fails.push('TE-3 the deploy printed the token');
      }
      w = world({ names: { [STAGE]: 'hearthrise-testing' } });
      if (await edge(['--deploy', '--env', 'staging'], w) !== 2 || w.calls.some((c) => c.run === 'npx')) fails.push('TE-6 a deploy went to a project that does not answer to staging');
    }
    { // TE-7
      const row = [{ user_id: '0a47ba77-0000-4000-8000-000000000000', slot: 0, name: 'Probe' }];
      for (const [tool, argv] of [['tools/hunt-health.local.mjs', []], ['tools/char-state.local.mjs', ['Probe']], ['tools/release-check.local.mjs', ['0.2.114']]]) {
        for (const [extra, ref, other, name] of [[[], PROD, STAGE, 'production'], [['--env', 'staging'], STAGE, PROD, 'staging']]) {
          const w = world({ db: (r, sql) => (/character_names/.test(sql) ? row : []), served: { 'https://staging.hearthrise.net': '0.2.114', 'https://hearthrise.net': '0.2.114' }, live: { [STAGE]: HASH, [PROD]: HASH } });
          const code = await E.runTool(mods[tool].main, [...argv, ...extra], w.deps);
          if (code !== 0) fails.push(`TE-7 ${tool} ${name}: exit ${code}: ${printed(w).slice(0, 160)}`);
          if (!(w.lines[0] || '').startsWith(`[env: ${name} · project ${ref}]`)) fails.push(`TE-7 ${tool} ${name}: the first line is not the project: ${w.lines[0]}`);
          if (!names(w, ref).length || names(w, other).length) fails.push(`TE-7 ${tool} ${name}: read ${names(w, other).length} request(s) of the other project, ${names(w, ref).length} of its own`);
          if (net(w).some((c) => c.url.endsWith('/database/query') && !/^\{"query":"begin read only; /.test(c.body))) fails.push(`TE-7 ${tool} ${name}: a database call is not inside a read-only transaction`);
          if (printed(w).includes(TOKEN)) fails.push(`TE-3 ${tool} printed the token`);
          if (tool.includes('release-check') && name === 'staging' && (!net(w).some((c) => c.url.startsWith('https://staging.hearthrise.net/src/build-info.js')) || !/staging carries this release/.test(printed(w)))) fails.push('TE-7 release-check --env staging did not read the staging site and engine');
        }
      }
    }
    { // TE-8
      const B = mods['tools/staging-bootstrap.local.mjs'];
      const manifest = JSON.parse(readFileSync(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8'));
      const chain = B.chainOf(manifest);
      if (chain[(manifest.pre_schema || []).length][0] !== 'schema.sql' || chain.length !== (manifest.pre_schema || []).length + 1 + manifest.order.length) fails.push('TE-8 the chain is not pre_schema, schema.sql, then the apply order');
      for (const f of Object.keys(manifest.excluded || {})) if (chain.some(([n]) => n === f)) fails.push('TE-8 an excluded operator one-shot is in the staging chain: ' + f);
      let w = world();
      if (await boot(['replay', '--env', 'production'], w) !== 2 || w.calls.length) fails.push('TE-8 the bootstrap took an --env');
      w = world({ envs: null });
      if (await boot(['replay'], w) !== 2 || net(w).length) fails.push('TE-8 the bootstrap ran with no staging project set up');
      /* a tiny chain, served from the fake home, so the order and the guards are run for real */
      const tiny = { pre_schema: ['a-pre.sql'], order: ['b-one.sql', 'c-two.sql'], excluded: {}, gucs: { 'hearthrise.market_wipe_ok': 'yes', _why: [] } };
      const tinyWorld = (o) => {
        const x = world(o);
        x.files.set(normalize(join(ROOT, 'tests', 'schema-apply-order.json')), JSON.stringify(tiny));
        for (const [n, rel] of B.chainOf(tiny)) x.files.set(normalize(join(ROOT, rel)), '-- ' + n + '\nselect 1;\n');
        return x;
      };
      let built = false;
      const db = (ref, sql) => {
        if (/to_regclass\('public\.player_state'\)/.test(sql)) return [{ built }];
        if (ref === STAGE && /-- c-two\.sql/.test(sql)) built = true;
        return [];
      };
      w = tinyWorld({ db });
      let code = await boot(['replay'], w);
      const sent = sqlPosts(w, STAGE).map((c) => JSON.parse(c.body).query).filter((q) => /^set local lock_timeout/.test(q));
      const order = sent.map((q) => (/-- ([a-z-]+\.sql)/.exec(q) || [])[1]).join(' ');
      if (code !== 0 || order !== 'a-pre.sql schema.sql b-one.sql c-two.sql') fails.push('TE-8 the replay did not send the chain in order, one file a call: exit ' + code + ' [' + order + ']');
      if (sent.some((q) => !q.includes("set local hearthrise.market_wipe_ok = 'yes';"))) fails.push('TE-8 a file was replayed without the GUCs production\'s applies ran under');
      if (names(w, PROD).length) fails.push('TE-8 the replay sent a request naming production');
      if (Object.keys(JSON.parse(w.files.get(w.at('.hearthrise', 'staging-applied.json')) || '{}')).length !== 4) fails.push('TE-8 the replay did not note every file it sent');
      /* the database is built now: schema.sql never goes again, however it is asked for */
      const again = tinyWorld({ db });
      code = await boot(['replay', '--from', 'schema.sql'], again);
      if (code !== 2 || sqlPosts(again, STAGE).some((c) => /-- schema\.sql/.test(c.body))) fails.push('TE-8 supabase/schema.sql was sent to a database that is already built: exit ' + code);
      const noRecord = tinyWorld({ db });
      if (await boot(['replay'], noRecord) !== 2 || sqlPosts(noRecord, STAGE).some((c) => /set local lock_timeout/.test(c.body))) fails.push('TE-8 a built database with no local record was replayed from the top');
      built = false;
      const stale = tinyWorld({ db, ledger: { 'b-one.sql': 'x' } });
      if (await boot(['replay'], stale) !== 2) fails.push('TE-8 an empty database with a stale local record did not ask for --fresh');
      const wrong = tinyWorld({ db, names: { [STAGE]: 'hearthrise-testing' } });
      if (await boot(['replay'], wrong) !== 2 || sqlPosts(wrong, STAGE).some((c) => /set local lock_timeout/.test(c.body))) fails.push('TE-8 the replay wrote to a project that does not answer to staging');
      /* a file that fails stops the replay there, and says where to resume */
      const failing = tinyWorld({ db: (ref, sql) => (/-- b-one\.sql/.test(sql) ? { fail: 400, message: 'c7: probe raised' } : db(ref, sql)) });
      code = await boot(['replay'], failing);
      if (code !== 1 || !/replay --from b-one\.sql/.test(printed(failing)) || sqlPosts(failing, STAGE).some((c) => /-- c-two\.sql/.test(c.body))) fails.push('TE-8 a failed file did not stop the replay at that file: exit ' + code);
      /* engine + overlay + auth + arm: staging written, production only read, secrets by name */
      w = world({ db: (ref, sql) => (/row_to_json\(c\)/.test(sql) ? [{ j: { id: true, enabled: true, cadence_seconds: 10, edge_url: 'https://' + PROD + '.supabase.co/functions/v1/hr-accrue', shards: 2 } }] : /select enabled, edge_url is not null/.test(sql) ? [{ enabled: true, url_set: true }] : []) });
      for (const stepName of ['engine', 'overlay', 'auth', 'arm']) {
        const c = await boot([stepName], w);
        if (c !== 0) fails.push(`TE-8 ${stepName}: exit ${c}: ${printed(w).slice(-200)}`);
      }
      const secretsPost = net(w).find((c) => c.method === 'POST' && c.url.endsWith('/secrets'));
      if (!secretsPost || !secretsPost.url.includes(STAGE) || !/"HR_ENGINE_DB_URL"/.test(secretsPost.body) || !secretsPost.body.includes(`hr_engine_login.${STAGE}:`) || !/:6543\/postgres/.test(secretsPost.body)) fails.push('TE-8 the engine\'s secrets were not set on staging with the pooler string (port 6543)');
      if (/S3CR3T/.test(printed(w)) || printed(w).includes(TOKEN)) fails.push('TE-8 a secret value was printed');
      const prodWrites = names(w, PROD).filter((c) => !(c.method === 'GET' || /^\{"query":"begin read only; /.test(c.body)));
      if (prodWrites.length) fails.push('TE-8 the bootstrap sent production something other than a read: ' + prodWrites[0].method + ' ' + prodWrites[0].url);
      const overlay = sqlPosts(w, STAGE).map((c) => c.body).find((b) => /hr_tick_config_edge_url_ck/.test(b)) || '';
      if (!overlay.includes(`https://${STAGE}.supabase.co/functions/v1/%`) || !overlay.includes(KEY)) fails.push('TE-8 the overlay does not pin the tick to the staging project with staging\'s gateway key');
      const armSql = sqlPosts(w, STAGE).map((c) => c.body).find((b) => /jsonb_populate_record/.test(b)) || '';
      if (!armSql || /edge_url = r\.edge_url/.test(armSql) || armSql.includes(PROD)) fails.push('TE-8 arming copied production\'s tick URL to staging');
      const patch = net(w).find((c) => c.method === 'PATCH');
      if (!patch || !patch.url.includes(STAGE) || patch.body.includes('MUST-NOT-BE-COPIED') || !patch.body.includes('https://staging.hearthrise.net/play.html')) fails.push('TE-8 the auth step did not aim staging at its own site, or copied a secret field');
      /* wire: the repo edit, held in memory here */
      const boot0 = readFileSync(join(ROOT, 'src', 'net', 'supabase-bootstrap.js'), 'utf8');
      const play0 = readFileSync(join(ROOT, 'play.html'), 'utf8');
      const wired = B.wireTexts(boot0, play0, `https://${STAGE}.supabase.co`, KEY);
      if (E.clientKeyOf(wired.boot, 'staging') !== KEY || !wired.boot.includes(`url: 'https://${STAGE}.supabase.co'`)) fails.push('TE-8 wire did not write staging\'s URL and key into the client\'s staging entry');
      if (E.clientKeyOf(wired.boot, 'production') !== E.clientKeyOf(boot0, 'production') || !wired.boot.includes(`url: 'https://${PROD}.supabase.co'`)) fails.push('TE-8 wire touched production\'s entry');
      if (!wired.play.includes(`connect-src 'self' https://${PROD}.supabase.co wss://${PROD}.supabase.co https://${STAGE}.supabase.co wss://${STAGE}.supabase.co https://`)) fails.push('TE-8 wire did not add staging to play.html\'s connect-src beside production');
      const twice = B.wireTexts(wired.boot, wired.play, `https://${STAGE}.supabase.co`, KEY);
      if (twice.boot !== wired.boot || twice.play !== wired.play) fails.push('TE-8 wiring twice is not the same as wiring once');
    }
    if (!overrides) { // TE-9: the real guard file, a real (temp) home, no network before its refusal
      const home = mkdtempSync(join(tmpdir(), 'hr-tool-env-home-'));
      try {
        mkdirSync(join(home, '.hearthrise'));
        writeFileSync(join(home, '.hearthrise', 'envs.json'), JSON.stringify({ staging: { ref: STAGE } }));
        writeFileSync(join(home, '.supabase-token'), TOKEN);
        const run = (args) => spawnSync(process.execPath, [join(ROOT, 'tests', 'live-hash-drift.mjs'), ...args], { cwd: ROOT, encoding: 'utf8', timeout: 240000, env: { ...process.env, HOME: home, USERPROFILE: home } });
        for (const args of [['--write', '--env', 'staging'], ['--codediff', '--env', 'staging']]) {
          const r = run(args);
          if (r.status !== 2 || !/never run against staging/.test(r.stderr || '')) fails.push('TE-9 live-hash-drift ' + args.join(' ') + ' did not refuse: exit ' + r.status);
        }
        const base = JSON.parse(readFileSync(join(ROOT, 'tests', 'live-hash-drift.baseline.json'), 'utf8'));
        const rows = base.functions.filter((e) => e.replay).map((e) => ({ sig: e.sig, body_md5: e.replay.md5, norm_len: e.replay.norm_len, mojibake: false }));
        const result = join(home, 'staging-result.json');
        writeFileSync(result, JSON.stringify([{ sig: '__census__', body_md5: 'x', norm_len: rows.length, mojibake: false }, ...rows]));
        const r = run(['--live-compare', result, '--env', 'staging']);
        if (r.status !== 0 || !/^\[env: staging/.test(r.stdout || '') || !/STAGING/.test(r.stdout || '')) fails.push('TE-9 a staging database equal to the replay was not graded green as staging: exit ' + r.status + ' ' + String(r.stderr || '').slice(0, 200));
      } finally { rmSync(home, { recursive: true, force: true }); }
    }
  } catch (e) {
    fails.push('HARNESS ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  } finally { drop(); }
  return fails;
}

const MUTANTS = [
  ['a write with no project goes to production (TE-1)', 'tools/lib/env.mjs', 'if (asked === null && o.write) {', 'if (false) {'],
  ['an unknown project name is taken (TE-1)', 'tools/lib/env.mjs', 'if (!ENV_NAMES.includes(v)) refuse(', 'if (false) refuse('],
  ['staging may be production\'s project (TE-2)', 'tools/lib/env.mjs', 'if (stagingRef === PRODUCTION_REF) {', 'if (false) {'],
  ['envs.json re-aims production (TE-2)', 'tools/lib/env.mjs', 'if (prodRef !== undefined && prodRef !== PRODUCTION_REF) {', 'if (false) {'],
  ['a staging site need not say staging (TE-2)', 'tools/lib/env.mjs', "if (name === 'staging' && !isStagingHost(host)) refuse(", 'if (false) refuse('],
  ['any key fits envs.json (TE-2)', 'tools/lib/env.mjs', 'if (publishableKey && !KEY.test(publishableKey)) refuse(', 'if (false) refuse('],
  ['the token is left in a message (TE-3)', 'tools/lib/env.mjs', "if (tok) t = t.split(tok).join('***');", ''],
  ['staging takes a project that does not say staging (TE-4)', 'tools/lib/env.mjs', "if (env.name === 'staging' && !saysStaging) {", 'if (false) {'],
  ['production takes a project that says staging (TE-4)', 'tools/lib/env.mjs', "if (env.name === 'production' && saysStaging) {", 'if (false) {'],
  ['the apply tool sends schema.sql (TE-4)', 'tools/apply-migration.mjs', "if (file === 'schema.sql') throw new EnvRefusal(", 'if (false) throw new EnvRefusal('],
  ['the apply skips the name check (TE-4)', 'tools/apply-migration.mjs', 'const named = await assertIdentity(env, fetchImpl);', "const named = 'unasked';"],
  ['production takes bytes staging never ran (TE-5)', 'tools/apply-migration.mjs', 'if (ran !== sum) {', 'if (false) {'],
  ['any word skips staging (TE-5)', 'tools/apply-migration.mjs', 'if (why.length < 10) {', 'if (false) {'],
  ['a deploy with no project goes to production (TE-6)', 'tools/deploy-edge.local.mjs', 'const env = resolveEnv({ argv, write: deploy, home: deps.home, read });', 'const env = resolveEnv({ argv, write: false, home: deps.home, read });'],
  ['a staging deploy carries production\'s config (TE-6)', 'tools/deploy-edge.local.mjs', "writeFileSync(join(dir, 'supabase', 'config.toml'), aimed);", "writeFileSync(join(dir, 'supabase', 'config.toml'), config);"],
  ['the deploy skips the name check (TE-6)', 'tools/deploy-edge.local.mjs', 'const named = await assertIdentity(env, fetchImpl);', "const named = 'unasked';"],
  ['hunt-health reads production\'s logs for staging (TE-7)', 'tools/hunt-health.local.mjs', 'const REF = env.ref;', "const REF = 'nezapsylztqbbwuwembx';"],
  ['char-state prints no project (TE-7)', 'tools/char-state.local.mjs', '  log(env.banner);\n', ''],
  ['release-check reads the live site for staging (TE-7)', 'tools/release-check.local.mjs', "fetchImpl(env.site + '/src/build-info.js?n='", "fetchImpl('https://hearthrise.net' + '/src/build-info.js?n='"],
  ['the bootstrap takes another project (TE-8)', 'tools/staging-bootstrap.local.mjs', "if (argv.some((a) => String(a).startsWith('--env'))) throw new EnvRefusal(", 'if (false) throw new EnvRefusal('],
  ['schema.sql goes to a built database (TE-8)', 'tools/staging-bootstrap.local.mjs', "if (file === 'schema.sql' && (await ro(env, BUILT))[0].built) throw new EnvRefusal(", 'if (false) throw new EnvRefusal('],
  ['the bootstrap skips the name check (TE-8)', 'tools/staging-bootstrap.local.mjs', 'if (!reads) log(`project answers to "${await assertIdentity(env, fetchImpl)}"`);', ''],
  ['arming copies production\'s tick URL (TE-8)', 'tools/staging-bootstrap.local.mjs', "const skip = new Set(['id', 'edge_url', ", "const skip = new Set(['id', "],
  ['the engine\'s password is printed (TE-8)', 'tools/staging-bootstrap.local.mjs', "log('engine: role hr_engine_login (login, noinherit, 20 connections, member of hr_engine) has a new password');", "log('engine: role hr_engine_login has the password ' + pw);"],
  ['a failed file does not stop the replay (TE-8)', 'tools/staging-bootstrap.local.mjs', '          return 1;\n        }\n      }\n      noteStagingApply', '          break;\n        }\n      }\n      noteStagingApply'],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'tool-env: ' + fails.length + ' check(s) RED' : 'tool-env: a write names its project, staging and production never cross, the token stays a file, staging goes first (TE-1..TE-9)');
    process.exitCode = fails.some((f) => f.startsWith('HARNESS')) ? 2 : fails.length ? 1 : 0;
    return;
  }
  /* A gated push proves only the mutants its diff touches (tools/lib/mutant-scope.mjs); the nightly proves them all. */
  const MINE = scopedMutants('tests/tool-env.mjs', MUTANTS);
  if (!MINE.length) return;
  /* the clean control goes through the same temp copy the mutants do */
  const clean = await checks({});
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exitCode = clean.some((f) => f.startsWith('HARNESS')) ? 2 : 1; return; }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to] of MINE) {
    const text = readFileSync(join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
    if (text.split(from).length !== 2) { console.log('  ✗ ' + name + ' — anchor not found exactly once in ' + file); bad++; continue; }
    const fails = await checks({ [file]: text.replace(from, () => to) });
    /* caught by the rule it names: some other rule going red proves nothing about this one */
    const want = /\((TE-\d+)\)$/.exec(name)[1];
    if (fails.some((f) => f.startsWith(want + ' '))) console.log('  ✓ ' + name + ' — caught');
    else { console.log('  ✗ ' + name + ' — NOT caught' + (fails.length ? ', only: ' + fails.join('; ').slice(0, 300) : '')); bad++; }
  }
  console.log(bad ? 'tool-env --mutate: ' + bad + ' escaped' : 'tool-env --mutate: ' + MINE.length + '/' + MINE.length + ' mutants caught');
  process.exitCode = bad ? 1 : 0;
}

if (isMain(import.meta.url)) await main();
