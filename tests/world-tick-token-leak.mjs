// ============================================================================
// tests/world-tick-token-leak.mjs — the EXECUTED half of the security ruling on
// supabase/migrations/2026-09-22-world-tick-derived-token.sql (T-5.3, the
// derived per-request token). docs/planning/SEC_WORLD_TICK_TOKEN_2026-09-23.md.
//
// WHY THIS FILE EXISTS. The migration's own §5 self-check is careful and honest,
// but on the credential-free replay it CANNOT RUN THE DERIVATION: PGlite ships
// without pgcrypto (re-measured here, 2026-09-23 — `create extension pgcrypto`
// answers `extension "pgcrypto" is not available` on PGlite 0.5.5 / PG 18.3), so
// d4-d7 are skipped by name and the only thing the replay proves is the
// fail-closed path. That means the property T-5.3 actually asked for — "the
// plaintext never transits the queue, and a captured header buys nothing" — was
// asserted on production at apply time or not at all.
//
// This guard closes that gap WITHOUT a credential and WITHOUT production, by
// giving the replay the three things Supabase has and PGlite does not, each of
// them a FAITHFUL stub of a documented behaviour rather than a convenience:
//
//   1. `extensions.hmac(text,text,text)` / `extensions.digest(bytea,text)`,
//      implemented by the RFC 2104 construction over PostgreSQL's CORE
//      `sha256(bytea)` (PG11+). It is not pgcrypto; it is the same function.
//      X-1 PINS IT AGAINST node:crypto AND AGAINST THE MIGRATION'S OWN VECTOR,
//      in that order, so a shim that computed something else could not pass.
//   2. `vault.decrypted_secrets`, a two-column table holding a TEST secret.
//   3. `net.http_post(...)` + `net.http_request_queue`, stubbed to do exactly
//      what pg_net's own SQL does: `convert_to(body::text,'UTF8')` into
//      `http_request_queue.body`, headers verbatim into `.headers`.
//
// ⚠ WHAT (3) DOES AND DOES NOT PROVE, SAID OUT LOUD. The stub ENCODES the claim
//   "pg_net stores convert_to(body::text,'UTF8')", read from pg_net's own
//   source, so X-4 proves the DRIVER'S half — that `hr_tick_body_sha256` hashes
//   the same bytes the driver posts, i.e. that `jsonb::text` is spelled once —
//   and it cannot prove pg_net's half. Only the migration's d7, on production,
//   at apply time, can. That is stated in the verdict as a residual, not
//   papered over here.
//
// NOTHING IS WRITTEN TO PRODUCTION AND NO CREDENTIAL IS READ. Every arm runs
// against a PGlite database rebuilt from supabase/migrations in
// tests/schema-apply-order.json order. The probe character is a synthetic uuid
// `gen_random_uuid()` cannot mint. The secret is a TEST value ('a'x32||'b'x32,
// the migration's own pinned vector) and never production's.
//
// Run:  node tests/world-tick-token-leak.mjs
//       node tests/world-tick-token-leak.mjs --selftest   (mutation proofs)
// ============================================================================

import { createHash, createHmac } from 'node:crypto';
import { bootReplay } from './schema-replay.mjs';
import {
  SHIM_CRYPTO, SHIM_CRYPTO_NAMED, SHIM_VAULT, SHIM_NET,
  PROBE, K_SECRET, K_BODY, K_BUCKET, K_SHA, K_MAC, lit,
} from './world-tick-token-shims.mjs';
import {
  tickGate, tickBodyAuthOk, parseTickToken, tickWindowOk, tickBucketOf,
  tickTokenMac, tickBodySha256, tickSecretUsable,
  TICK_BUCKET_SECONDS, TICK_BUCKET_SKEW, FLUSH_MS_MIN,
} from '../supabase/functions/hr-accrue/tick.js';

const TOKEN_FILE = '2026-09-22-world-tick-derived-token.sql';
const CRON_FILE = '2026-09-21-world-tick-cron.sql';
const FENCE_FILE = '2026-09-21-world-tick-settle-fence.sql';

/* THE FIXTURES AND THE PINNED VECTOR MOVED to tests/world-tick-token-shims.mjs
   on 2026-09-23, unchanged, when tests/world-tick-token-failclosed.mjs (Security
   T-1) needed the same three stubs to BUILD the (Vault, no pgcrypto) state. One
   copy, so the two guards cannot drift apart about what production looks like.
   X-1 below still pins the crypto shim against node:crypto, against the
   migration's own constants and against tick.js before anything uses it. */

let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { console.log(`  ✓ ${name}`); return true; }
  failed += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); return false;
};

async function boot(crypto = SHIM_CRYPTO) {
  const seed = new Map();
  seed.set(TOKEN_FILE, crypto + SHIM_VAULT + SHIM_NET);
  return bootReplay({ seedBefore: seed });
}

/* Plant the probe character the driver needs to roster anything at all. */
async function plantProbe(db) {
  const [{ activity_id }] = (await db.query(
    "select activity_id from public.hr_activities where kind = 'gather' limit 1")).rows;
  await db.exec(`
    insert into auth.users (id) values (${lit(PROBE)}) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    values (${lit(PROBE)}, 0, 0, 0, 10, 10, 1, now() - interval '10 minutes', 'gather',
            ${lit(activity_id)}, now() - interval '1 hour')
    on conflict (user_id, slot) do nothing;
    insert into public.hr_tick_ownership (user_id, slot, channel, owned)
    values (${lit(PROBE)}, 0, 'gather', true) on conflict do nothing;
    update public.hr_tick_config set enabled = true,
      edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/'
            || 'hr-accrue-token-leak-probe-does-not-exist' where id;`);
  return activity_id;
}

async function main(selftest) {
  console.log('world-tick-token-leak — the derived token, EXECUTED on the replay chain\n');

  // ── X-1  THE VECTOR, IN THREE RUNTIMES ────────────────────────────────────
  console.log('X-1  the derivation is the same function in SQL, in node, and in the migration');
  const { db } = await boot();
  const v = (await db.query(
    "select encode(extensions.digest(convert_to($1,'UTF8'),'sha256'),'hex') sha,"
    + " encode(extensions.hmac($2,$3,'sha256'),'hex') mac", [K_BODY, `${K_BUCKET}.${K_SHA}`, K_SECRET])).rows[0];
  const nSha = createHash('sha256').update(K_BODY, 'utf8').digest('hex');
  const nMac = createHmac('sha256', K_SECRET).update(`${K_BUCKET}.${K_SHA}`, 'utf8').digest('hex');
  ok('X-1a sha256(body): SQL === node:crypto', v.sha === nSha, `${v.sha} vs ${nSha}`);
  ok('X-1b hmac(bucket.sha): SQL === node:crypto', v.mac === nMac, `${v.mac} vs ${nMac}`);
  ok('X-1c both equal the constant the migration pins', v.sha === K_SHA && v.mac === K_MAC);
  ok('X-1d tick.js computes the same mac (the verifier, not a restatement)',
    tickTokenMac(K_BUCKET, K_SHA, K_SECRET) === K_MAC);
  ok('X-1e tick.js computes the same body hash',
    tickBodySha256(new TextEncoder().encode(K_BODY)) === K_SHA);
  ok('X-1f hr_tick_body_sha256 agrees, through the installed function',
    (await db.query('select public.hr_tick_body_sha256($1) h', [K_BODY])).rows[0].h === K_SHA);

  // ── X-2  THE HELPER DERIVES, AND THE KEY IS NOT IN WHAT IT RETURNS ────────
  console.log('\nX-2  hr_tick_auth_header derives a real token and does not carry the key');
  const hdr = (await db.query('select public.hr_tick_auth_header($1::bigint, $2) h',
    [K_BUCKET, K_SHA])).rows[0].h;
  ok('X-2a the header is the T-5.3 shape',
    /^v1 t=\d+ b=[0-9a-f]{64} m=[0-9a-f]{64}$/.test(String(hdr)), String(hdr));
  ok('X-2b the mac is the one the edge will expect', String(hdr).endsWith(`m=${K_MAC}`));
  ok('X-2c the key does not appear in the header', !String(hdr).includes(K_SECRET));
  ok('X-2d no CR/LF reaches the header value',
    !/[\r\n]/.test(String(hdr)));

  // ── X-3  THE LEAK SWEEP, ACROSS EVERY SURFACE A FIRE TOUCHES ─────────────
  console.log('\nX-3  after a real `posted` fire, the key is on no observable surface');
  await plantProbe(db);
  const fire = (await db.query('select public.hr_tick_cron_run() r')).rows[0].r;
  ok('X-3a the fire reached `posted` (so the sweep is not vacuous)',
    fire && fire.outcome === 'posted', JSON.stringify(fire));
  ok('X-3b the driver’s own return value carries no key', !JSON.stringify(fire).includes(K_SECRET));
  ok('X-3c and it names the version rather than the credential',
    fire && fire.auth === 'v1' && !JSON.stringify(fire).includes(K_MAC));
  const logTxt = (await db.query(
    "select coalesce(string_agg(l::text, ' '), '') t from public.hr_tick_cron_log l")).rows[0].t;
  ok('X-3d hr_tick_cron_log carries no key', !logTxt.includes(K_SECRET));
  ok('X-3e hr_tick_cron_log carries no 64-hex run at all (mac included)',
    !/[0-9a-f]{32,}/.test(logTxt), logTxt.slice(0, 160));
  const defs = (await db.query(
    "select coalesce(string_agg(pg_get_functiondef(p.oid), ' '), '') t"
    + " from pg_proc p join pg_namespace n on n.oid = p.pronamespace"
    + " where n.nspname = 'public' and p.prokind in ('f','p')")).rows[0].t;
  ok('X-3f no routine body in `public` contains the key', !defs.includes(K_SECRET));
  const readers = (await db.query(
    "select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace"
    + " where n.nspname = 'public' and p.prokind in ('f','p')"
    + " and position('hr_tick_shared_secret' in pg_get_functiondef(p.oid)) > 0")).rows[0].n;
  ok('X-3g exactly one routine in `public` can reach the plaintext', readers === 1, `n=${readers}`);
  const q = (await db.query(
    'select q.headers, convert_from(q.body, $1) btxt from net.http_request_queue q'
    + ' order by q.id desc limit 1', ['UTF8'])).rows[0];
  const qTxt = JSON.stringify(q.headers) + q.btxt;
  ok('X-3h the QUEUE ROW — PUBLIC-readable on production — carries no key',
    !qTxt.includes(K_SECRET));
  ok('X-3i what it carries instead is the derived token',
    /^v1 t=\d+ b=[0-9a-f]{64} m=[0-9a-f]{64}$/.test(String(q.headers['X-HR-Tick-Auth'])));

  // ── X-4  THE BODY BINDING, THROUGH THE REAL EDGE VERIFIER ────────────────
  console.log('\nX-4  the captured queue row, replayed against the real edge gate');
  const presented = String(q.headers['X-HR-Tick-Auth']);
  const bytes = new TextEncoder().encode(q.btxt);
  const tok = parseTickToken(presented);
  const nowMs = tok.bucket * TICK_BUCKET_SECONDS * 1000 + 1;
  const gateOf = (h, ms = nowMs) => tickGate({ get: (k) => (k === 'x-hr-tick-auth' ? h : null) }, K_SECRET, ms);
  ok('X-4a the driver’s own header and body are ACCEPTED (the mac binds real bytes)',
    gateOf(presented).ok === true && tickBodyAuthOk(tok, bytes, K_SECRET) === true);
  ok('X-4b the SAME header with ONE BYTE of body changed is REFUSED',
    tickBodyAuthOk(tok, new TextEncoder().encode(`${q.btxt} `), K_SECRET) === false);
  ok('X-4c the same header with a body that flips `shadow` is REFUSED',
    tickBodyAuthOk(tok, new TextEncoder().encode(q.btxt.replace('"shadow": true', '"shadow": false')),
      K_SECRET) === false);
  ok('X-4d a header two buckets stale is REFUSED before the body is read',
    gateOf(presented, nowMs + (TICK_BUCKET_SKEW + 1) * TICK_BUCKET_SECONDS * 1000 + 2000).ok !== true);
  ok('X-4e a header two buckets in the FUTURE is REFUSED just as firmly',
    gateOf(presented, nowMs - (TICK_BUCKET_SKEW + 1) * TICK_BUCKET_SECONDS * 1000 - 2000).ok !== true);
  ok('X-4f the v1 STATIC BEARER is refused after the cutover',
    gateOf(K_SECRET).ok !== true && gateOf('f'.repeat(64)).ok !== true);
  ok('X-4g a mac valid for a DIFFERENT bucket is refused',
    tickBodyAuthOk({ bucket: tok.bucket, bodySha: tok.bodySha,
      mac: tickTokenMac(tok.bucket + 1, tok.bodySha, K_SECRET) }, bytes, K_SECRET) === false);
  ok('X-4h every refusal is the SAME 401 body — not an oracle for which check bit',
    [K_SECRET, 'v1 t=1 b=' + 'z'.repeat(64) + ' m=' + K_MAC, presented].every((h) => {
      const g = gateOf(h, nowMs + 9e6);
      return g === null || g.ok === true
        || (g.status === 401 && JSON.stringify(g.body) === JSON.stringify({ ok: false, error: 'not_signed_in' }));
    }));
  ok('X-4i an unusable secret refuses every tick request with that same 401',
    tickSecretUsable('short') === false && gateOf(presented) && true
      && (() => { const g = tickGate({ get: () => presented }, 'short', nowMs);
        return g.status === 401 && g.body.error === 'not_signed_in'; })());
  // R-T1, EXECUTED RATHER THAN CLAIMED: the verbatim replay IS accepted.
  ok('X-4j R-T1 is real: the VERBATIM pair replays inside the window (stated, not hidden)',
    tickBodyAuthOk(tok, bytes, K_SECRET) === true);

  // ── X-5  R-T1's BOUND IS THE FLUSH FLOOR, AND IT IS A TUNABLE ────────────
  console.log('\nX-5  what a verbatim replay can actually settle');
  const maxReplayMs = (TICK_BUCKET_SKEW + 1) * TICK_BUCKET_SECONDS * 1000;
  const cfg = (await db.query(
    "select flush_seconds, cadence_seconds from public.hr_tick_config where id")).rows[0];
  ok('X-5a a replay is accepted at most 60 s after the fire that minted it',
    maxReplayMs === 60000, `${maxReplayMs}ms`);
  ok('X-5b at the SHIPPED flush_seconds the replay settles NOTHING (toMs-markMs < flushMs)',
    Number(cfg.flush_seconds) * 1000 > maxReplayMs, `flush_seconds=${cfg.flush_seconds}`);
  const minFlush = (await db.query(
    "select pg_get_constraintdef(oid) d from pg_constraint"
    + " where conname = 'hr_tick_config_flush_ck'")).rows[0].d;
  const floorS = Number((/between (\d+)/.exec(minFlush)
    || />=\s*\(?(\d+)/.exec(minFlush) || [])[1]);
  ok('X-5c ...but the CHECK still PERMITS a flush_seconds below that, so the '
    + 'zero-effect property is a TUNABLE, not an invariant (finding T-2)',
    floorS * 1000 <= maxReplayMs, `floor=${floorS}s, FLUSH_MS_MIN=${FLUSH_MS_MIN}ms`);
  /* T-2's FIX, from the side SQL cannot reach. d11 in the migration pins the
     bucket width and the skew as SQL constants and asserts the schema against
     them; nothing in Postgres can see that those two numbers are the edge's.
     These two arms are that binding, and they are why d11 is a measurement
     rather than a restatement of itself. */
  const tokenSrc = (await (await import('node:fs/promises')).readFile(
    (await import('node:path')).join(
      (await import('./schema-replay.mjs')).ROOT, 'supabase', 'migrations', TOKEN_FILE), 'utf8'));
  ok('X-5d d11 pins the SAME bucket width and skew the edge verifier uses',
    new RegExp(`k_bucket_s int := ${TICK_BUCKET_SECONDS};`).test(tokenSrc)
    && new RegExp(`k_skew     int := ${TICK_BUCKET_SKEW};`).test(tokenSrc),
    `edge says ${TICK_BUCKET_SECONDS}s x skew ${TICK_BUCKET_SKEW}`);
  const dflt = (await db.query(
    "select pg_get_expr(d.adbin, d.adrelid)::int v from pg_attrdef d"
    + " join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum"
    + " where d.adrelid = 'public.hr_tick_config'::regclass"
    + " and a.attname = 'flush_seconds'")).rows[0].v;
  ok('X-5e and the column DEFAULT is on the zero-residual side of the window, so a '
    + 'FRESH database starts there rather than arriving by an operator\u2019s habit (T-2)',
    Number(dflt) * 1000 > maxReplayMs, `default=${dflt}s, window=${maxReplayMs / 1000}s`);

  // ── X-6  THE MAC ORACLE IS REACHABLE BY NOBODY ───────────────────────────
  console.log('\nX-6  the mac oracle is callable by no role, and by PUBLIC least of all');
  const fns = ['public.hr_tick_cron_run()', 'public.hr_tick_crypto_schema()',
    'public.hr_tick_body_sha256(text)', 'public.hr_tick_auth_header(bigint,text)'];
  const roles = ['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'];
  for (const f of fns) {
    const r = (await db.query(
      `select ${roles.map((x, i) => `has_function_privilege(${lit(x)}, $1, 'execute') r${i}`).join(', ')}`,
      [f])).rows[0];
    ok(`X-6a ${f} — no role may execute it`, roles.every((_, i) => r[`r${i}`] === false),
      JSON.stringify(r));
  }
  const pub = (await db.query(
    "select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace"
    + " where n.nspname = 'public' and p.proname in"
    + " ('hr_tick_cron_run','hr_tick_crypto_schema','hr_tick_body_sha256','hr_tick_auth_header')"
    + " and array_to_string(coalesce(p.proacl, '{}'::aclitem[]), ' ') like '%=X/%'"
    + " and array_to_string(coalesce(p.proacl, '{}'::aclitem[]), ' ') !~ ('(^| )' || p.proowner::regrole::text || '=X/')")).rows[0].n;
  ok('X-6b and the ACL grants EXECUTE to nobody but the owner (PUBLIC included)',
    pub === 0, `n=${pub}`);

  // ── X-7  THE ROLLBACK IS NOT BLOCKED BY ITS OWN DATA ─────────────────────
  console.log('\nX-7  the documented rollback still applies after a `no_hmac` row exists');
  const { readFile } = await import('node:fs/promises');
  const { ROOT } = await import('./schema-replay.mjs');
  const { join } = await import('node:path');
  /* THE PROBE STATE IS TORN DOWN FIRST. The 2026-09-21 file's own self-check
     asserts the driver refuses to run while `enabled` is false (its arm c3), and
     it is RIGHT to — so leaving X-3's armed config and leased probe in place
     would fail the rollback on my mess rather than on the property. Measured:
     it did, on the first run of this guard. The Vault rows go too: the 2026-09-21
     file's arm c6 asserts the STATIC driver refuses `no_secret` when Vault is
     empty, and this fixture's seeded secrets would make that correct arm red. */
  await db.exec(`
    update public.hr_tick_config set enabled = false, edge_url = null,
           cursor_at = null, cursor_user = null, cursor_slot = null where id;
    delete from public.hr_tick_ownership where user_id = ${lit(PROBE)};
    delete from public.player_state where user_id = ${lit(PROBE)};
    delete from auth.users where id = ${lit(PROBE)};
    delete from net.http_request_queue;
    delete from vault.decrypted_secrets;
    insert into public.hr_tick_cron_log (outcome) values ('no_hmac');`);
  let rollbackErr = null;
  try {
    const sql = (await readFile(join(ROOT, 'supabase', 'migrations', CRON_FILE), 'utf8'))
      .replace(/\r\n/g, '\n');
    await db.exec(`begin;\n${sql}\ncommit;`);
  } catch (e) { rollbackErr = String(e && e.message || e).split('\n')[0]; await db.exec('rollback').catch(() => {}); }
  ok('X-7a re-applying 2026-09-21-world-tick-cron.sql succeeds', rollbackErr === null, rollbackErr);
  if (rollbackErr === null) {
    const back = (await db.query(
      "select position('hr_tick_shared_secret' in"
      + " pg_get_functiondef('public.hr_tick_cron_run()'::regprocedure)) > 0 b")).rows[0].b;
    ok('X-7b and it restores the STATIC form (so the rollback is real)', back === true);
    ok('X-7c the `no_hmac` rows survive it — the rollback is not blocked by its own data',
      (await db.query("select count(*)::int n from public.hr_tick_cron_log where outcome = 'no_hmac'"))
        .rows[0].n >= 1);
  }

  // ── X-8  pgcrypto RESOLUTION: PRESENT BOTH WAYS, AND ABSENT ───────────
  // ⚠ REWRITTEN TWICE BY THE AUTHORING LANE ON 2026-09-23, and the history is
  //   the point rather than noise. These arms first asserted the DEFECT (T-3:
  //   the same algorithm with NAMED arguments was silently not found, and the
  //   driver then answered `no_hmac` for ever off a migration that had applied
  //   GREEN — T-1). T-1 turned that apply into a refusal; T-3 removed the name
  //   sensitivity that made the state reachable at all. So what is asserted here
  //   now is the FIX, in all three states the resolution can be in.
  console.log('\nX-8  pgcrypto resolution: unnamed, named, and absent');
  {
    const b2 = await boot(SHIM_CRYPTO_NAMED);
    const sch = (await b2.db.query('select public.hr_tick_crypto_schema() s')).rows[0].s;
    ok('X-8a PRESENT with NAMED arguments is resolved (finding T-3, closed)',
      sch === 'extensions', `crypto_schema=${sch}`);
    const r = (await b2.db.query(
      "select oidvectortypes(p.proargtypes) t,"
      + " pg_get_function_identity_arguments(p.oid) i from pg_proc p"
      + " join pg_namespace n on n.oid = p.pronamespace"
      + " where n.nspname = 'extensions' and p.proname = 'hmac'")).rows[0];
    ok('X-8b ...and this is WHY it had to change: the types are identical either '
      + 'way, the RENDERING is not', r.t === 'text, text, text' && r.i !== r.t,
      `types=${r.t} / identity=${r.i}`);
    await plantProbe(b2.db);
    const f2 = (await b2.db.query('select public.hr_tick_cron_run() r')).rows[0].r;
    ok('X-8c so the driver posts instead of dying `no_hmac` on a database that had '
      + 'the algorithm all along', f2 && f2.outcome === 'posted', JSON.stringify(f2));
  }
  {
    // ABSENT — and T-3 must not have weakened T-1's refusal on the way past.
    let applyErr = null;
    try { await bootReplay({ seedBefore: new Map([[TOKEN_FILE, SHIM_VAULT + SHIM_NET]]) }); }
    catch (e) { applyErr = String((e && e.message) || e); }
    ok('X-8d ABSENT, with Vault present, still REFUSES the apply (T-1 intact)',
      applyErr !== null && applyErr.includes('HR_TICK_NO_PGCRYPTO'), applyErr);
  }

  if (!selftest) return;

  // ── MUTATIONS. Every arm above must be reachable by a defect. ────────────
  console.log('\n--selftest  five defects planted in the file under review; each must be refused');
  const mutations = [
    ['MX1 the helper posts the PLAINTEXT instead of a mac (the whole class)',
      TOKEN_FILE,
      [["return 'v1 t=' || p_bucket::text || ' b=' || p_body_sha || ' m=' || v_mac;",
        "return 'v1 t=' || p_bucket::text || ' b=' || p_body_sha || ' m=' || (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'hr_tick_shared_secret');"]],
      'X-2c/X-3h'],
    ['MX2 the mac is journalled into the fire log',
      TOKEN_FILE, [["'auth', 'v1', 'bucket', v_bucket,", "'auth', v_auth, 'bucket', v_bucket,"]],
      'X-3e (and the file’s own d8b)'],
    ['MX3 the driver hashes a body it does not post',
      TOKEN_FILE, [['v_body_sha := public.hr_tick_body_sha256(v_body_txt);',
        "v_body_sha := public.hr_tick_body_sha256(v_body_txt || ' ');"]],
      'X-4a'],
    /* ⚠ THE FIRST SPELLING OF THIS MUTATION WAS A NO-OP AND I SCORED IT AS
         UNCAUGHT, WHICH IS THE RIGHT WAY ROUND. Replacing the `from public`
         revoke with a grant plants nothing: §4's NEXT line revokes
         `hr_tick_auth_header` from `authenticated` again, so the defect undid
         itself and the arm that "failed" was the mutation, not the control. The
         grant has to land AFTER every revoke to be a defect at all. */
    ['MX4 the mac oracle is granted to `authenticated`, after every revoke',
      TOKEN_FILE, [['revoke execute on function public.hr_tick_auth_header(bigint, text)\n  from anon, authenticated, service_role, hr_engine, hr_tick;',
        'grant execute on function public.hr_tick_auth_header(bigint, text) to authenticated;']],
      'X-6a/X-6b'],
    ['MX5 the body hash is dropped from the mac message (binding removed)',
      TOKEN_FILE, [["using p_bucket::text || '.' || p_body_sha, 'hr_tick_shared_secret';",
        "using p_bucket::text, 'hr_tick_shared_secret';"]],
      'X-1/X-2b'],
    /* T-2. The default is the only part of R-T1's zero residual that is this
       repo's to keep true — the live row is Reliability's lever — so the
       mutation moves the DEFAULT under the replay window and d11b must refuse
       the apply. It patches the file that DECLARES the column, not the token
       file, which is also what proves d11 reads the installed schema rather
       than its own source text. */
    ['MX6 flush_seconds DEFAULTS below the token\u2019s replay window (T-2)',
      FENCE_FILE, [['flush_seconds   int         not null default 90,',
        'flush_seconds   int         not null default 30,']],
      'd11b, at apply time'],
    /* T-3. Reverting the resolution to the RENDERED signature is invisible on
       pgcrypto as shipped — its arguments are unnamed — so this is the one
       mutation that has to be planted against the NAMED shim to be a defect at
       all. It is the same shape as MX4's first spelling: a mutation that plants
       nothing scores as uncaught, and finding that out is the point of a
       mutation record. */
    ['MX7 the resolution goes back to matching RENDERED argument names (T-3)',
      TOKEN_FILE, [["and oidvectortypes(p.proargtypes) = 'text, text, text'",
        "and pg_get_function_identity_arguments(p.oid) = 'text, text, text'"],
      ["and oidvectortypes(d.proargtypes) = 'bytea, text'",
        "and pg_get_function_identity_arguments(d.oid) = 'bytea, text'"]],
      '§0b, at apply time — the algorithm is present and is not found',
      SHIM_CRYPTO_NAMED],
  ];
  let caught = 0;
  for (const [name, file, patch, by, shim] of mutations) {
    let red = null;
    try {
      const seed = new Map();
      seed.set(TOKEN_FILE, (shim || SHIM_CRYPTO) + SHIM_VAULT + SHIM_NET);
      const p = new Map(); p.set(file, patch);
      const b = await bootReplay({ seedBefore: seed, patches: p });
      red = await probeMutation(b.db, name);
    } catch (e) {
      red = `refused at apply: ${String(e && e.message || e).split('\n')[1] || ''}`.trim();
    }
    if (red) { caught += 1; console.log(`  ✓ ${name}\n      refused by ${by}: ${red}`); }
    else { failed += 1; console.log(`  ✗ ${name} — PLANTED AND NOT CAUGHT (expected ${by})`); }
  }
  console.log(`\n  ${caught}/${mutations.length} planted defects caught`);
}

/* The mutation probe: re-run the arms that can see a defect, and return the
   first thing that went wrong. Null means the defect survived, which is red. */
async function probeMutation(db, name) {
  try {
    const vec = (await db.query('select public.hr_tick_auth_header($1::bigint, $2) h',
      [K_BUCKET, K_SHA])).rows[0].h;
    if (String(vec).includes(K_SECRET)) return 'the header carries the key (X-2c)';
    if (!String(vec).endsWith(`m=${K_MAC}`)) return 'the mac no longer matches the pinned vector (X-2b)';
    for (const r of ['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick']) {
      const g = (await db.query('select has_function_privilege($1, $2, $3) g',
        [r, 'public.hr_tick_auth_header(bigint,text)', 'execute'])).rows[0].g;
      if (g) return `${r} can mint a token by hand (X-6a)`;
    }
    await plantProbe(db);
    const fire = (await db.query('select public.hr_tick_cron_run() r')).rows[0].r;
    if (!fire || fire.outcome !== 'posted') return `the fire answered ${JSON.stringify(fire)}`;
    const logTxt = (await db.query(
      "select coalesce(string_agg(l::text, ' '), '') t from public.hr_tick_cron_log l")).rows[0].t;
    if (logTxt.includes(K_SECRET)) return 'the fire log carries the key (X-3d)';
    if (/[0-9a-f]{32,}/.test(logTxt)) return 'the fire log carries a 64-hex credential (X-3e)';
    const q = (await db.query(
      'select q.headers, convert_from(q.body, $1) btxt from net.http_request_queue q'
      + ' order by q.id desc limit 1', ['UTF8'])).rows[0];
    if (JSON.stringify(q.headers).includes(K_SECRET)) return 'the QUEUE ROW carries the key (X-3h)';
    const tok = parseTickToken(String(q.headers['X-HR-Tick-Auth']));
    if (tok === null) return 'the queued header is not the T-5.3 shape (X-3i)';
    if (!tickBodyAuthOk(tok, new TextEncoder().encode(q.btxt), K_SECRET)) {
      return 'the edge gate REFUSES the driver’s own fire (X-4a)';
    }
    return null;
  } catch (e) { return `raised: ${String(e && e.message || e).split('\n')[0]}`; }
}

main(process.argv.includes('--selftest')).then(() => {
  if (failed) {
    console.log(`\nworld-tick-token-leak: RED — ${failed} arm(s) failed.`);
    process.exit(1);
  }
  console.log('\nworld-tick-token-leak: green — the derivation executes on the replay, the'
    + '\n  plaintext is on no observable surface, and a captured queue row is bound to'
    + '\n  the one body it was minted for.');
}).catch((e) => {
  console.error(`\nworld-tick-token-leak: HARNESS ERROR — ${e && e.message || e}`);
  process.exit(2);
});
