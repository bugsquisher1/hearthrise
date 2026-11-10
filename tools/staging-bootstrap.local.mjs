// ════════════════════════════════════════════════════════════════════════
// tools/staging-bootstrap.local.mjs — BUILD THE STAGING PROJECT FROM THIS REPO (Coordinator only).
//
// The runbook is .claude/coordination/staging-2026-11-10.md; this is each of its steps as one command.
// EVERY WRITE HERE GOES TO STAGING AND NOWHERE ELSE: the env is fixed to staging (tools/lib/env.mjs), a
// `--env` argument is refused, and each write first asks the project its own name. Production is only
// ever READ (read-only transactions), to copy its tunables and compare shapes.
//
//   node tools/staging-bootstrap.local.mjs plan       no network: the chain, in order, and what each step does
//   node tools/staging-bootstrap.local.mjs prepare    pg_cron + pg_net, and the platform's legacy default grants the chain starts from
//   node tools/staging-bootstrap.local.mjs replay     pre_schema, supabase/schema.sql, then the apply order: one file per call,
//                                                     the bytes on disk, each noted in ~/.hearthrise/staging-applied.json
//                                                     [--from <file>] resume at a file   [--fresh] forget the ledger (a rebuilt project)
//   node tools/staging-bootstrap.local.mjs engine     the engine's login role + password, the tick secret, the function's secrets
//                                                     (names printed, values made in memory and never shown)
//   node tools/staging-bootstrap.local.mjs overlay    the tick's URL pinned to THIS project, and Vault's gateway key = staging's
//   node tools/staging-bootstrap.local.mjs auth       the staging site as the auth redirect; password rules copied from production
//   node tools/staging-bootstrap.local.mjs wire       repo edit only: staging's URL + publishable key into the client, and play.html's connect-src
//   node tools/staging-bootstrap.local.mjs arm        the world tick ON, with production's tunables (read from production, read-only)
//   node tools/staging-bootstrap.local.mjs status     read-only: what is built, armed, deployed and wired
//   node tools/staging-bootstrap.local.mjs parity     read-only: staging's shape beside production's (grants, extensions, cron, roles, counts)
//
// supabase/schema.sql drops tables (§1b). It is sent ONLY by `replay`, ONLY to a project that answers to a
// staging name, and ONLY while that database has no public.player_state (nothing built yet).
// NOT HERE, ON PURPOSE: creating or deleting the project (a spend and a destruction: Tyler's own clicks).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../tests/_is-main.mjs';
import { resolveEnv, assertIdentity, queryDb, runTool, EnvRefusal, API, PRODUCTION_REF, clientKeyOf, scrub } from './lib/env.mjs';
import { sendFile, sha256, readLedger, noteStagingApply } from './apply-migration.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STEPS = ['plan', 'prepare', 'replay', 'engine', 'overlay', 'auth', 'wire', 'arm', 'status', 'parity'];
const BUILT = "select to_regclass('public.player_state') is not null as built";

/* What a new Supabase project had before any migration ran, as production's did (tests/schema-replay.mjs SCAFFOLD is the same
   baseline for the PGlite replay). The chain REVOKES from these defaults; on a project created with nothing granted, its
   revokes would leave tables no client can read. The two extensions are the chain's hard preconditions. */
export const PREPARE_SQL = `
create extension if not exists pg_cron;
create extension if not exists pg_net;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
`;

/** The chain in apply order: [name, repo-relative path]. pre_schema, supabase/schema.sql, then `order` (tests/schema-apply-order.json). */
export function chainOf(manifest) {
  return [
    ...(manifest.pre_schema || []).map((f) => [f, join('supabase', 'migrations', f)]),
    ['schema.sql', join('supabase', 'schema.sql')],
    ...manifest.order.map((f) => [f, join('supabase', 'migrations', f)]),
  ];
}

/** `set local` for each GUC production's applies ran under (the manifest's `gucs`). Names and values are checked, never trusted. */
export function gucPrefix(manifest) {
  let out = '';
  for (const [k, v] of Object.entries(manifest.gucs || {})) {
    if (k.startsWith('_')) continue;
    if (!/^[a-z_]+\.[a-z_]+$/.test(k) || !/^[a-z0-9_]+$/.test(String(v))) throw new Error(`manifest guc ${k} is not a plain name and value`);
    out += `set local ${k} = '${v}';\n`;
  }
  return out;
}

const secret = (bytes) => randomBytes(bytes);
const base62 = (n) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; for (const b of secret(n * 2)) { if (b < 248 && s.length < n) s += A[b % 62]; } return s.length === n ? s : base62(n); };
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const retryable = (e) => e && (e.status === 429 || e.status >= 500 || /lock_not_available|55P03|deadlock detected|could not obtain lock/i.test(String(e.message)));

/** The client's staging entry and play.html's connect-src, rewritten for one staging project. Pure: (bootText, playText, url, key) -> texts. */
export function wireTexts(boot, play, url, key) {
  const entry = /(staging: Object\.freeze\(\{ env: 'staging', url: ')[^']*(', publishableKey: ')[^']*(')/;
  if (!entry.test(boot)) throw new Error('src/net/supabase-bootstrap.js: the staging entry moved; wire by hand');
  const host = new URL(url).host;
  const csp = /(connect-src 'self')((?: (?:https|wss):\/\/[a-z]{20}\.supabase\.co)+)/;
  const m = csp.exec(play);
  if (!m) throw new Error('play.html: connect-src moved; wire by hand');
  const prod = ` https://${PRODUCTION_REF}.supabase.co wss://${PRODUCTION_REF}.supabase.co`;
  return {
    boot: boot.replace(entry, (_, a, b, c) => a + url + b + key + c),
    play: play.replace(csp, (_, head) => head + prod + ` https://${host} wss://${host}`),
  };
}

/**
 * @param {string[]} argv
 * @param {object} [deps]  { fetch, read, write, home, log, err, root, sleep, random }: injectable (tests/tool-env.mjs)
 */
export async function main(argv, deps = {}) {
  const log = deps.log || console.log;
  const read = deps.read || ((p) => readFileSync(p, 'utf8'));
  const write = deps.write || ((p, text) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); });
  const home = deps.home || homedir();
  const fetchImpl = deps.fetch || fetch;
  const root = deps.root || ROOT;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const step = argv[0];
  if (argv.some((a) => String(a).startsWith('--env'))) throw new EnvRefusal('This tool builds staging and takes no --env. It never writes anywhere else.');
  if (!STEPS.includes(step)) { (deps.err || console.error)('usage: node tools/staging-bootstrap.local.mjs ' + STEPS.join(' | ')); return 2; }
  const manifest = JSON.parse(read(join(root, 'tests', 'schema-apply-order.json')));
  const chain = chainOf(manifest);

  if (step === 'plan') {
    log('[env: staging] plan only, nothing is sent');
    log(`chain: ${chain.length} files, one call each: ${(manifest.pre_schema || []).length} before the schema, supabase/schema.sql, then ${manifest.order.length} in apply order`);
    log(`not in the chain (operator one-shots, applied by hand when wanted): ${Object.keys(manifest.excluded || {}).length}`);
    log(`set for every file: lock_timeout 5s; ${gucPrefix(manifest).trim().split('\n').join(' ')}`);
    log('steps: prepare, replay, engine, overlay, auth, then deploy the edge (tools/deploy-edge.local.mjs --deploy --env staging), wire, arm, status, parity');
    return 0;
  }

  const env = resolveEnv({ argv: ['--env', 'staging'], write: true, home, read });
  const reads = step === 'status' || step === 'parity';
  log(env.banner + ' ' + step + (reads ? ' (read only)' : ''));
  const q = (sql) => queryDb(env, sql, { fetch: fetchImpl });
  const ro = (e, sql) => queryDb(e, sql, { fetch: fetchImpl, readOnly: true });
  const production = () => resolveEnv({ argv: ['--env', 'production'], write: false, home, read });
  const api = async (e, method, path, body) => {
    const res = await fetchImpl(`${API}/v1/projects/${e.ref}${path}`, { method, headers: { Authorization: 'Bearer ' + e.token(), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${scrub(text, e).slice(0, 200)}`);
    try { return JSON.parse(text); } catch (x) { return text; }
  };

  if (step === 'wire') {
    if (!env.publishableKey) throw new EnvRefusal('~/.hearthrise/envs.json has no staging.publishableKey to wire into the client.');
    const bootPath = join(root, 'src', 'net', 'supabase-bootstrap.js');
    const playPath = join(root, 'play.html');
    const out = wireTexts(read(bootPath), read(playPath), `https://${env.ref}.supabase.co`, env.publishableKey);
    write(bootPath, out.boot);
    write(playPath, out.play);
    log('wired: the client\'s staging entry and play.html\'s connect-src name the staging project. Now: node tests/staging-origin.mjs, then commit.');
    return 0;
  }

  if (!reads) log(`project answers to "${await assertIdentity(env, fetchImpl)}"`);

  if (step === 'prepare') {
    if ((await ro(env, BUILT))[0].built) throw new EnvRefusal('This database is already built. prepare is the first step of a new project only.');
    await q(PREPARE_SQL);
    log('prepared: pg_cron, pg_net, and the default grants the chain starts from');
    return 0;
  }

  if (step === 'replay') {
    const fresh = argv.includes('--fresh');
    const fromAt = argv.indexOf('--from');
    const from = fromAt >= 0 ? argv[fromAt + 1] : null;
    if (from && !chain.some(([f]) => f === from)) throw new EnvRefusal(`--from ${from} is not a file in the chain.`);
    const built = (await ro(env, BUILT))[0].built;
    let ledger = readLedger(home, read);
    if (fresh) { if (built) throw new EnvRefusal('--fresh is for a database with nothing built. This one has public.player_state.'); write(join(home, '.hearthrise', 'staging-applied.json'), '{}\n'); ledger = {}; }
    if (!built && Object.keys(ledger).length && !from) throw new EnvRefusal('The database is empty but this machine remembers applying files to staging (an older project). Run replay --fresh.');
    if (built && !Object.keys(ledger).length && !from) throw new EnvRefusal('The database is built but this machine has no record of what was applied. Name where to resume: replay --from <file>.');
    const prefix = gucPrefix(manifest);
    const t0 = Date.now();
    let started = !from;
    let sent = 0;
    for (const [file, rel] of chain) {
      if (!started) { if (file !== from) continue; started = true; }
      const sql = read(join(root, rel));
      const sum = sha256(sql);
      if (!from && ledger[file] === sum) continue;
      if (file === 'schema.sql' && (await ro(env, BUILT))[0].built) throw new EnvRefusal('supabase/schema.sql drops tables and this database is already built. It is never sent twice.');
      for (let attempt = 1; ; attempt += 1) {
        try { await sendFile(env, sql, { fetch: fetchImpl, prefix }); break; }
        catch (e) {
          if (attempt < 4 && retryable(e)) { await sleep(3000 * attempt); continue; }
          log(`STOPPED at ${file} after ${sent} file(s), ${Math.round((Date.now() - t0) / 1000)} s: ${String(e.message).slice(0, 600)}`);
          log(`fix it, then: node tools/staging-bootstrap.local.mjs replay --from ${file}`);
          return 1;
        }
      }
      noteStagingApply(home, read, write, file, sum);
      sent += 1;
      if (sent % 25 === 0) log(`  ${sent} sent, at ${file}, ${Math.round((Date.now() - t0) / 1000)} s`);
    }
    log(`replayed: ${sent} file(s) sent in ${Math.round((Date.now() - t0) / 1000)} s. Now: node tests/live-hash-drift.mjs --live --env staging`);
    return 0;
  }

  if (step === 'engine') {
    const pw = (deps.random || base62)(40);
    const tick = (deps.random ? deps.random(64) : secret(32).toString('hex'));
    const poolers = await api(env, 'GET', '/config/database/pooler');
    const p = (Array.isArray(poolers) ? poolers : [poolers]).find((x) => x && x.db_host) || {};
    if (!p.db_host) throw new Error('the pooler config named no host');
    /* Port 6543, the transaction pooler, whatever the API's row says: the function refuses any other (index.ts POOLER_OK). */
    const dbUrl = `postgresql://hr_engine_login.${env.ref}:${pw}@${p.db_host}:6543/postgres`;
    await q(`do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'hr_engine') then raise exception 'hr_engine is missing: replay the chain first'; end if;
      if not exists (select 1 from pg_roles where rolname = 'hr_engine_login') then create role hr_engine_login login noinherit connection limit 20; end if;
      execute format('alter role hr_engine_login with login noinherit connection limit 20 password %L', ${lit(pw)});
      grant hr_engine to hr_engine_login;
    end $$;
    do $$ declare v_id uuid; begin
      select id into v_id from vault.secrets where name = 'hr_tick_shared_secret';
      if v_id is null then perform vault.create_secret(${lit(tick)}, 'hr_tick_shared_secret', 'X-HR-Tick-Auth: pg_net to hr-accrue op:tick (staging)');
      else perform vault.update_secret(v_id, ${lit(tick)}); end if;
    end $$;`);
    await api(env, 'POST', '/secrets', [{ name: 'HR_ENGINE_DB_URL', value: dbUrl }, { name: 'HR_TICK_SHARED_SECRET', value: tick }]);
    log('engine: role hr_engine_login (login, noinherit, 20 connections, member of hr_engine) has a new password');
    log('secrets set on the function, by NAME: HR_ENGINE_DB_URL (pooler port 6543), HR_TICK_SHARED_SECRET (the same value is in Vault as hr_tick_shared_secret)');
    log('NOT set on staging, on purpose: DISCORD_WEBHOOK_URL, hr_alert_discord_webhook, hr_discord_gift_secret (staging never posts to the real Discord)');
    return 0;
  }

  if (step === 'overlay') {
    if (!env.publishableKey) throw new EnvRefusal('~/.hearthrise/envs.json has no staging.publishableKey (the tick\'s gateway key).');
    const origin = `https://${env.ref}.supabase.co/functions/v1/`;
    await q(`alter table public.hr_tick_config drop constraint if exists hr_tick_config_edge_url_ck;
      update public.hr_tick_config set edge_url = null where edge_url is not null and edge_url not like ${lit(origin + '%')};
      alter table public.hr_tick_config add constraint hr_tick_config_edge_url_ck check (edge_url is null or edge_url like ${lit(origin + '%')});
      update public.hr_tick_config set edge_url = ${lit(origin + 'hr-accrue')} where id;
      do $$ declare v_id uuid; begin
        select id into v_id from vault.secrets where name = 'hr_tick_gateway_apikey';
        if v_id is null then perform vault.create_secret(${lit(env.publishableKey)}, 'hr_tick_gateway_apikey', 'apikey for the gateway (staging publishable key)');
        else perform vault.update_secret(v_id, ${lit(env.publishableKey)}); end if;
        if exists (select 1 from public.hr_tick_config where edge_url like ${lit('%' + PRODUCTION_REF + '%')}) then raise exception 'the staging tick still names production'; end if;
      end $$;`);
    log('overlay: the tick posts to this project\'s hr-accrue and nowhere else (the constraint is pinned here); Vault\'s gateway key is staging\'s publishable key');
    return 0;
  }

  if (step === 'auth') {
    const prod = production();
    const src = await api(prod, 'GET', '/config/auth');
    const COPY = ['password_min_length', 'password_required_characters', 'mailer_autoconfirm', 'disable_signup', 'external_email_enabled', 'jwt_exp', 'refresh_token_rotation_enabled', 'security_refresh_token_reuse_interval'];
    const body = { site_url: env.site + '/play.html', uri_allow_list: env.site + '/play.html' };
    for (const k of COPY) if (src && src[k] !== undefined && src[k] !== null) body[k] = src[k];
    await api(env, 'PATCH', '/config/auth', body);
    log(`auth: the staging site is the redirect (${env.site}/play.html); copied from production: ${Object.keys(body).filter((k) => COPY.includes(k)).join(', ') || 'nothing'}`);
    return 0;
  }

  if (step === 'arm') {
    const prod = production();
    const row = (await ro(prod, 'select row_to_json(c) j from public.hr_tick_config c where c.id'))[0].j;
    const skip = new Set(['id', 'edge_url', 'cursor_user', 'cursor_at', 'cursor_slot', 'updated_at', 'note']);
    const cols = Object.keys(row).filter((k) => !skip.has(k));
    if (cols.some((c) => !/^[a-z_]+$/.test(c))) throw new Error('hr_tick_config has a column name this tool will not write');
    const json = JSON.stringify(Object.fromEntries(cols.map((c) => [c, row[c]])));
    if (json.includes('$hr$')) throw new Error('unexpected text in production\'s tick config');
    await q(`update public.hr_tick_config t set ${cols.map((c) => `${c} = r.${c}`).join(', ')}, note = 'armed from production''s tunables by staging-bootstrap'
      from jsonb_populate_record(null::public.hr_tick_config, $hr$${json}$hr$::jsonb) r where t.id and t.edge_url is not null;`);
    const now = (await ro(env, 'select enabled, edge_url is not null as url_set from public.hr_tick_config where id'))[0] || {};
    log(`arm: tick enabled ${now.enabled}, url set ${now.url_set}; tunables copied: ${cols.join(', ')}`);
    if (!now.url_set) { log('NOT ARMED: run overlay first (the tick has no URL).'); return 1; }
    return 0;
  }

  if (step === 'status') {
    const built = (await ro(env, BUILT))[0].built;
    const ledger = readLedger(home, read);
    const behind = chain.filter(([f, rel]) => ledger[f] !== sha256(read(join(root, rel)))).map(([f]) => f);
    log(`database built: ${built} · chain files this machine has not sent (or that changed since): ${behind.length}${behind.length ? ', first ' + behind[0] : ''}`);
    if (built) {
      const t = (await ro(env, "select enabled, coalesce(edge_url, '') edge_url, (select count(*) from cron.job) jobs, (select count(*) from auth.users) users from public.hr_tick_config where id"))[0] || {};
      log(`tick enabled ${t.enabled} · its URL ${t.edge_url ? (t.edge_url.includes(env.ref) ? 'is this project\'s' : '<< IS NOT THIS PROJECT\'S') : 'is not set'} · cron jobs ${t.jobs} · accounts ${t.users}`);
    }
    const names = await api(env, 'GET', '/secrets').then((s) => (Array.isArray(s) ? s.map((x) => x.name) : []), () => []);
    log('function secrets, by name: ' + (['HR_ENGINE_DB_URL', 'HR_TICK_SHARED_SECRET'].map((n) => `${n} ${names.includes(n) ? 'set' : 'MISSING'}`).join(' · ')));
    const wired = clientKeyOf(read(join(root, 'src', 'net', 'supabase-bootstrap.js')), 'staging');
    log(`client wired: ${wired ? (wired === env.publishableKey ? 'yes' : '<< with a different key than envs.json') : 'no (run wire)'} · site ${env.site}`);
    return 0;
  }

  /* parity */
  const SHAPE = `select k, v from (
    select 'default grants ' || defaclobjtype::text k, defaclacl::text v from pg_default_acl where defaclnamespace = 'public'::regnamespace and defaclrole = 'postgres'::regrole
    union all select 'extension ' || extname, extversion from pg_extension
    union all select 'cron ' || jobname, schedule || case when active then '' else ' OFF' end from cron.job
    union all select 'role ' || rolname, rolcanlogin::text || ' ' || rolinherit::text || ' ' || rolconnlimit::text from pg_roles where rolname like 'hr\\_%'
    union all select 'count public tables', count(*)::text from pg_tables where schemaname = 'public'
    union all select 'count public functions', count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
    union all select 'postgres', split_part(current_setting('server_version'), '.', 1)
    union all select 'pre-request', coalesce((select string_agg(c, ' ') from (select unnest(rolconfig) c from pg_roles where rolname = 'authenticator') x where c like 'pgrst%'), '-')
  ) s order by 1`;
  const [a, b] = await Promise.all([ro(production(), SHAPE), ro(env, SHAPE)]);
  const P = new Map(a.map((r) => [r.k, r.v]));
  const S = new Map(b.map((r) => [r.k, r.v]));
  let diff = 0;
  for (const k of [...new Set([...P.keys(), ...S.keys()])].sort()) {
    if (P.get(k) === S.get(k)) continue;
    diff += 1;
    log(`  ${k}: production ${P.get(k) === undefined ? '(none)' : P.get(k)} · staging ${S.get(k) === undefined ? '(none)' : S.get(k)}`);
  }
  log(diff ? `parity: ${diff} difference(s) in ${P.size} facts` : `parity: staging's shape equals production's in all ${P.size} facts`);
  return diff ? 1 : 0;
}

if (isMain(import.meta.url)) process.exitCode = await runTool(main, process.argv.slice(2));
