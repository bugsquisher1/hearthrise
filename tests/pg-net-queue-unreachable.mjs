// ════════════════════════════════════════════════════════════════════════════
// tests/pg-net-queue-unreachable.mjs — NOTHING A CLIENT CAN REACH MAY READ
// pg_net's REQUEST QUEUE.
//
//   node tests/pg-net-queue-unreachable.mjs            the guard (no DB, no credential, no network)
//   node tests/pg-net-queue-unreachable.mjs --list     every statement it looked at, and its verdict
//   node tests/pg-net-queue-unreachable.mjs --selftest plant the defects, require each caught
//   node tests/pg-net-queue-unreachable.mjs --live     the external probe (Coordinator; anon key only)
//
// ── WHY THIS EXISTS (T-5, docs/planning/SEC_WORLD_TICK_M1_2026-09-21.md) ─────
// The world-tick driver `hr_tick_cron_run` POSTs to hr-accrue through
// `net.http_post`, and pg_net implements that by INSERTING the request —
// method, url, **headers**, body, timeout — into `net.http_request_queue`. The
// headers carry `X-HR-Tick-Auth`, the 64-hex shared secret read from Vault at
// call time. So the tick bearer is a row in a table for as long as the pg_net
// worker takes to drain it, and indefinitely if that worker stops.
//
// T-5 asked who can read that table. Measured on production 2026-09-22
// (aclexplode on both `net.http_request_queue` and `net._http_response`):
//
//     SELECT is granted to PUBLIC (grantee '-') and to supabase_admin.
//     GRANTOR is supabase_admin. OWNER is supabase_admin.
//     USAGE on schema `net` is granted to anon, authenticated, service_role,
//     postgres — again by supabase_admin.
//
// So `has_table_privilege('anon','net.http_request_queue','SELECT')` is TRUE,
// and it cannot be made FALSE: the applying role `postgres` is not a superuser
// and not a member of supabase_admin, so a `revoke ... from public` issued by
// it is a silent no-op. `supabase/migrations/2026-09-22-pg-net-queue-lockdown.sql`
// is that revoke, staged, and its own §4 self-check REFUSED the apply for
// exactly that reason. There is no path from our roles to the fix.
//
// ── WHAT THE RUNBOOK'S STEP 0a GOT WRONG, AND WHAT REPLACES IT ──────────────
// Step 0a read: "A TRUE on http_request_queue means the tick bearer is
// readable by that role and the milestone does not arm until it is revoked."
// That test is a PRIVILEGE test standing in for a REACHABILITY question, and
// the two came apart the moment the privilege turned out to be unrevokable.
//
// `anon` and `authenticated` are not login roles. A player never opens a
// connection as either; PostgREST connects as `authenticator` and role-switches
// per request. So the privilege is only worth what a reachable surface makes of
// it, and there are exactly four such surfaces:
//
//   1. PostgREST tables/views — gated by the exposed-schema list. Measured
//      2026-09-22 with the anon key and `Accept-Profile: net` on both tables:
//      HTTP 406 PGRST106 "Invalid schema: net / Only the following schemas are
//      exposed: public, graphql_public".
//   2. PostgREST RPC — a routine in an exposed schema that reads the queue and
//      hands it back. Measured 2026-09-22: no routine in `public` or `net`
//      other than pg_net's own references either table, and none of pg_net's
//      is SECURITY DEFINER.
//   3. The Realtime publication — `supabase_realtime`. A table in it is
//      delivered to any subscriber holding SELECT on it, and PUBLIC holds
//      SELECT here. (2026-09-06-realtime-publication-trim.sql pins the set to
//      exactly [chat_messages], but its self-check filters on
//      `schemaname = 'public'`, so a `net` table added to the publication would
//      pass it. That is the gap arm Q-4 closes.)
//   4. `hr_engine_login` — held only by the edge, which executes no
//      client-supplied SQL.
//
// None of those four is open today. Three of them are one repository change
// away from being open, and CLAUDE.md §2 makes the repository the ONLY write
// path to production ("Production DB writes happen only through
// `node tools/apply-migration.mjs <file>`"). That is what makes a static guard
// a complete detector here rather than a sampling one, and it is why the
// arming condition is restated as reachability — measured by this file — and
// not as `has_table_privilege`, which will read TRUE forever.
//
// ── THE FOUR ARMS ───────────────────────────────────────────────────────────
//   Q-1  No routine in a PostgREST-EXPOSED schema reads the queue tables. The
//        read positions are `from / join / into / update / using / copy` —
//        naming the table as a STRING argument (has_table_privilege, a revoke,
//        an assertion) is not a read and is deliberately silent, because the
//        in-database half of this guard is exactly such an assertion.
//   Q-1b No view or materialized view in an exposed schema selects from them.
//        A view is a table to PostgREST; this is the same bridge without a
//        function around it.
//   Q-2  No migration GRANTs SELECT on them (or on all tables in schema net) to
//        public/anon/authenticated/service_role/hr_engine/hr_tick. PUBLIC's
//        grant is supabase_admin's and we cannot take it away — but we can
//        refuse to ADD one of our own, and a grant issued by `postgres` IS
//        revokable by `postgres`, so an added one would be a hole we own.
//   Q-3  `net` never joins PostgREST's exposed-schema list — not by
//        `pgrst.db_schemas` in a migration, not by `schemas` in
//        supabase/config.toml. This is the single setting standing between the
//        PUBLIC grant and every browser on the internet.
//   Q-4  The queue tables never enter a publication: no `alter publication …
//        add table net.…`, no `add tables in schema net`, and no
//        `create publication … for all tables`, which would sweep `net` in.
//
// `--live` is the fifth arm and the only one needing the network: it re-runs
// the external probe above with the repo's anon key (CLAUDE.md §2: the anon key
// is the only key in the repo) and fails if `net` has joined the exposed list.
// It is the Coordinator's, not CI's — CI has no egress to the project — and a
// network failure exits 2 (harness), never 0.
//
// ── WHAT THIS GUARD DOES NOT COVER ──────────────────────────────────────────
// A routine created on production by a route other than `supabase/migrations`
// — the dashboard SQL editor, a support engineer, a Supabase platform
// migration. §2 forbids the first two for us; the third is supabase_admin's and
// is residual risk, named in the T-5 RULING. The in-database chain-end
// assertion recommended there (fold into the next `hr_assert_grant_hygiene`
// restatement) is what would close it, and this file's Q-1 is written so that
// such an assertion does not trip it.
// ════════════════════════════════════════════════════════════════════════════

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MIG_DIR = path.join(ROOT, 'supabase', 'migrations');
const CONFIG_TOML = path.join(ROOT, 'supabase', 'config.toml');
const PROJECT_URL = 'https://nezapsylztqbbwuwembx.supabase.co';
const argv = process.argv.slice(2);

// PostgREST's exposed-schema list, measured 2026-09-22 (PGRST106 names it).
// A routine or view OUTSIDE these is not reachable through the REST API, which
// is why pg_net's own net.http_get/post/delete are not findings.
const EXPOSED = new Set(['public', 'graphql_public']);

// The two tables. `_http_response` carries no request headers, but it does
// retain the tick's response body for its TTL, and it is the table a reader who
// found one would try next.
const QUEUE_TABLES = ['http_request_queue', '_http_response'];
const QUEUE_ALT = QUEUE_TABLES.join('|');

// A READ position. Not `has_table_privilege('…','net.http_request_queue',…)`.
const READ_RE = new RegExp(
  String.raw`\b(from|join|into|update|using|copy)\s+(?:only\s+)?"?net"?\s*\.\s*"?(${QUEUE_ALT})"?`, 'i');

const CLIENT_ROLES = ['public', 'anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'];

class Harness extends Error { constructor(m) { super(m); this.harness = true; } }

// ── the SQL walker ──────────────────────────────────────────────────────────
// Blanks `--` and `/* */` comments to spaces (offsets and line numbers survive)
// and returns every dollar-quoted body it found, correctly nested by tag.
// Single-quoted literals are SKIPPED but NOT blanked: a dynamic `execute
// 'select … from net.http_request_queue'` is code that runs, and blanking it
// would be the one hole worth having.
export function walk(src) {
  const out = src.split('');
  const spans = [];
  const stack = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '-' && src[i + 1] === '-') {
      let j = i;
      while (j < n && src[j] !== '\n') { out[j] = ' '; j++; }
      i = j;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      let j = i;
      let depth = 0;
      while (j < n) {
        if (src[j] === '/' && src[j + 1] === '*') { depth++; out[j] = out[j + 1] = ' '; j += 2; continue; }
        if (src[j] === '*' && src[j + 1] === '/') { depth--; out[j] = out[j + 1] = ' '; j += 2; if (!depth) break; continue; }
        if (src[j] !== '\n') out[j] = ' ';
        j++;
      }
      i = j;
      continue;
    }
    const dm = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(src.slice(i, i + 80));
    if (dm) {
      const tag = dm[0];
      if (stack.length && stack[stack.length - 1].tag === tag) {
        const open = stack.pop();
        spans.push({ tag, head: open.head, body: open.body, end: i });
      } else {
        stack.push({ tag, head: i, body: i + tag.length });
      }
      i += tag.length;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      const cap = Math.min(n, i + 8000);
      let closed = false;
      while (j < cap) {
        if (src[j] === "'" && src[j + 1] === "'") { j += 2; continue; }
        if (src[j] === "'") { j++; closed = true; break; }
        j++;
      }
      // An unterminated (or absurdly long) literal is not a literal — most
      // likely a lone apostrophe in prose. Do not let it swallow the file.
      i = closed ? j : i + 1;
      continue;
    }
    i++;
  }
  return { text: out.join(''), spans };
}

const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// ── the scan ────────────────────────────────────────────────────────────────
export function scan({ migrations, configToml }) {
  const findings = [];
  const looked = [];
  const add = (f) => findings.push(f);

  for (const [file, src] of migrations) {
    const { text, spans } = walk(src);

    // Q-1 — a routine body in an exposed schema that READS a queue table.
    for (const s of spans) {
      const head = text.slice(Math.max(0, s.head - 600), s.head);
      const m = /create\s+(?:or\s+replace\s+)?(function|procedure)\s+(?:"?([a-z0-9_]+)"?\s*\.\s*)?"?([a-z0-9_]+)"?\s*\(/i
        .exec(head.split(/;\s*$/).pop());
      if (!m) continue;                      // a `do $$ … $$` block is not a routine
      const schema = (m[2] || 'public').toLowerCase();
      const name = `${schema}.${m[3].toLowerCase()}`;
      const body = text.slice(s.body, s.end);
      const hit = READ_RE.exec(body);
      looked.push({ file, kind: 'routine', subject: name, exposed: EXPOSED.has(schema), read: !!hit });
      if (!hit || !EXPOSED.has(schema)) continue;
      add({
        arm: 'Q-1', file, line: lineOf(text, s.body + hit.index), subject: name,
        detail: `${m[1].toLowerCase()} in the PostgREST-exposed schema \`${schema}\` reads `
          + `net.${hit[2]} (\`${hit[0].replace(/\s+/g, ' ')}\`). PUBLIC holds SELECT on that table, so this `
          + 'routine is a bridge from every browser to the tick bearer.',
      });
    }

    // Q-1b — a view or matview in an exposed schema over a queue table.
    const viewRe = /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:"?([a-z0-9_]+)"?\s*\.\s*)?"?([a-z0-9_]+)"?/ig;
    for (let vm = viewRe.exec(text); vm; vm = viewRe.exec(text)) {
      const schema = (vm[1] || 'public').toLowerCase();
      const stop = text.indexOf(';', vm.index);
      const stmt = text.slice(vm.index, stop === -1 ? Math.min(text.length, vm.index + 4000) : stop);
      const hit = READ_RE.exec(stmt);
      looked.push({ file, kind: 'view', subject: `${schema}.${vm[2]}`, exposed: EXPOSED.has(schema), read: !!hit });
      if (!hit || !EXPOSED.has(schema)) continue;
      add({
        arm: 'Q-1b', file, line: lineOf(text, vm.index + hit.index), subject: `${schema}.${vm[2]}`,
        detail: `a view in the exposed schema \`${schema}\` selects from net.${hit[2]}. PostgREST serves a `
          + 'view exactly as it serves a table, so this is the same bridge without a function around it.',
      });
    }

    // Q-2 — a grant of our own on a queue table.
    const grantRe = new RegExp(
      String.raw`\bgrant\b[^;]{0,600}?\bon\b[^;]{0,600}?(?:"?net"?\s*\.\s*"?(?:${QUEUE_ALT})"?|all\s+tables\s+in\s+schema\s+"?net"?)[^;]{0,600}?\bto\b([^;]{0,300})`,
      'ig');
    for (let gm = grantRe.exec(text); gm; gm = grantRe.exec(text)) {
      const to = gm[1].toLowerCase();
      const roles = CLIENT_ROLES.filter((r) => new RegExp(String.raw`\b${r}\b`).test(to));
      looked.push({ file, kind: 'grant', subject: gm[0].replace(/\s+/g, ' ').slice(0, 120), exposed: true, read: !!roles.length });
      if (!roles.length) continue;
      add({
        arm: 'Q-2', file, line: lineOf(text, gm.index), subject: gm[0].replace(/\s+/g, ' ').slice(0, 160),
        detail: `grants a queue-table read to [${roles.join(', ')}]. supabase_admin's PUBLIC grant is not ours `
          + 'to revoke; one we issue ourselves is, so it must never be issued.',
      });
    }

    // Q-3 — `net` joining PostgREST's exposed-schema list from a migration.
    const pgrstRe = /\b(?:pgrst\s*\.\s*db_schemas|db-schemas|PGRST_DB_SCHEMAS)\b[^;\n]{0,300}/ig;
    for (let pm = pgrstRe.exec(text); pm; pm = pgrstRe.exec(text)) {
      const names = pm[0].toLowerCase();
      looked.push({ file, kind: 'exposure', subject: pm[0].replace(/\s+/g, ' ').slice(0, 120), exposed: true, read: /\bnet\b/.test(names) });
      if (!/\bnet\b/.test(names)) continue;
      add({
        arm: 'Q-3', file, line: lineOf(text, pm.index), subject: pm[0].replace(/\s+/g, ' ').slice(0, 160),
        detail: 'adds `net` to PostgREST\'s exposed schemas. PUBLIC already holds SELECT on the queue, so this '
          + 'one setting makes the tick bearer a plain GET with the anon key.',
      });
    }

    // Q-4 — the queue tables entering a publication.
    const pubAddRe = /\balter\s+publication\s+[^;]{0,400}?\badd\s+(?:table|tables\s+in\s+schema)\b[^;]{0,400}/ig;
    for (let am = pubAddRe.exec(text); am; am = pubAddRe.exec(text)) {
      const hit = /\b(?:"?net"?\s*\.\s*"?(?:http_request_queue|_http_response)"?|in\s+schema\s+"?net"?)/i.test(am[0]);
      looked.push({ file, kind: 'publication', subject: am[0].replace(/\s+/g, ' ').slice(0, 120), exposed: true, read: hit });
      if (!hit) continue;
      add({
        arm: 'Q-4', file, line: lineOf(text, am.index), subject: am[0].replace(/\s+/g, ' ').slice(0, 160),
        detail: 'publishes a pg_net queue table over Realtime. A published table is delivered to any subscriber '
          + 'holding SELECT on it, and PUBLIC holds SELECT here — so this is a live feed of the bearer, and '
          + '2026-09-06-realtime-publication-trim.sql\'s self-check filters on schemaname=\'public\' and would not see it.',
      });
    }
    const pubAllRe = /\bcreate\s+publication\s+[^;]{0,200}?\bfor\s+all\s+tables\b/ig;
    for (let am = pubAllRe.exec(text); am; am = pubAllRe.exec(text)) {
      add({
        arm: 'Q-4', file, line: lineOf(text, am.index), subject: am[0].replace(/\s+/g, ' ').slice(0, 160),
        detail: '`for all tables` is every schema, `net` included. Name the tables.',
      });
    }
  }

  // Q-3 (config.toml half) — the deploy-time spelling of the same setting.
  const apiSchemas = /^\s*schemas\s*=\s*\[([^\]]*)\]/im.exec(configToml || '');
  if (apiSchemas) {
    const names = apiSchemas[1].toLowerCase();
    looked.push({ file: 'supabase/config.toml', kind: 'exposure', subject: apiSchemas[0].trim(), exposed: true, read: /\bnet\b/.test(names) });
    if (/["']net["']/.test(names)) {
      add({
        arm: 'Q-3', file: 'supabase/config.toml', line: lineOf(configToml, apiSchemas.index),
        subject: apiSchemas[0].trim(),
        detail: 'exposes `net` to PostgREST at deploy time. Same hole as the migration spelling, in the file '
          + 'nobody re-reads.',
      });
    }
  }

  return { findings, looked };
}

// ── sources ─────────────────────────────────────────────────────────────────
async function sources() {
  let names;
  try {
    names = (await readdir(MIG_DIR)).filter((f) => f.endsWith('.sql')).sort();
  } catch (e) {
    throw new Harness(`cannot read ${MIG_DIR}: ${e.message}`);
  }
  if (!names.length) throw new Harness(`${MIG_DIR} holds no .sql — the scan would be vacuously green`);
  const migrations = new Map();
  for (const f of names) migrations.set(f, await readFile(path.join(MIG_DIR, f), 'utf8'));
  let configToml = '';
  try { configToml = await readFile(CONFIG_TOML, 'utf8'); } catch { configToml = ''; }
  return { migrations, configToml };
}

// ── --live: the external probe, anon key only ───────────────────────────────
const ANON_RE = /anonKey:\s*'([^']+)'/;

async function live() {
  const boot = await readFile(path.join(ROOT, 'src', 'net', 'supabase-bootstrap.js'), 'utf8');
  const key = ANON_RE.exec(boot)?.[1];
  if (!key) throw new Harness('no anon key in src/net/supabase-bootstrap.js — the probe cannot authenticate');
  let bad = 0;
  for (const t of QUEUE_TABLES) {
    const url = `${PROJECT_URL}/rest/v1/${t}?select=id&limit=1`;
    let res; let body;
    try {
      res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Profile': 'net' } });
      body = await res.text();
    } catch (e) {
      throw new Harness(`probe of ${t} could not reach ${PROJECT_URL}: ${e.message}. `
        + 'A probe that did not run is not a probe that passed.');
    }

    // DID WE REACH PostgREST? An egress proxy, a WAF or a captive portal will
    // answer 403/407/502 with prose, and reading that as "the table is
    // readable" would be a guard that cries wolf — or, with the comparison the
    // other way up, one that reports green because a middlebox said no on
    // PostgREST's behalf. Only a PostgREST-shaped answer is an answer.
    let json = null;
    try { json = JSON.parse(body); } catch { json = null; }
    const isPgrst = res.status === 200
      || (json && typeof json === 'object' && (/^PGRST/i.test(String(json.code || '')) || 'hint' in json));
    if (!isPgrst) {
      throw new Harness(`probe of ${t}: HTTP ${res.status} from something that is not PostgREST — `
        + `${body.slice(0, 200).replace(/\s+/g, ' ')}\n`
        + '  An intermediary answered. Re-run this from a host with egress to the project; a probe that was '
        + 'intercepted is neither green nor red.');
    }

    if (res.status === 200) {
      bad++;
      console.error(`L-1 RED   net.${t}  HTTP 200 — PostgREST SERVED IT.\n          ${body.slice(0, 300)}\n`
        + '          PUBLIC holds SELECT on this table and schema `net` is now exposed. The tick bearer is\n'
        + '          readable with the anon key by anyone. Kill the tick first\n'
        + '          (`update public.hr_tick_config set enabled = false;`), then take `net` back off the list.');
      continue;
    }

    const msg = `${json.message || ''} ${json.details || ''} ${json.hint || ''}`;
    const exposedList = /Only the following schemas are exposed:\s*([^"}]*)/i.exec(msg)?.[1] || '';
    if (exposedList && /\bnet\b/.test(exposedList)) {
      bad++;
      console.error(`L-1 RED   net.${t}  HTTP ${res.status} but PostgREST names \`net\` among its exposed `
        + `schemas: ${exposedList.trim()}\n          The refusal is about this request, not about the schema. `
        + 'Take `net` off the list before arming.');
      continue;
    }
    console.log(`L-1 ok    net.${t.padEnd(20)} HTTP ${res.status} ${json.code || ''} — `
      + `schema \`net\` is not exposed${exposedList ? ` (exposed: ${exposedList.trim()})` : ''}`);
  }
  if (bad) { console.error(`\n${bad} live probe(s) red.`); process.exit(1); }
  console.log(`\npg-net-queue-unreachable --live: OK — ${QUEUE_TABLES.length} tables refused by PostgREST, `
    + '`net` absent from the exposed-schema list');
}

// ── --selftest ──────────────────────────────────────────────────────────────
const TARGET = '2026-09-21-world-tick-cron.sql';

const PLANTS = [
  {
    name: 'bridge-function', arm: 'Q-1',
    what: 'a SECURITY DEFINER function in public that selects the queue',
    patch: (s) => `${s}\ncreate or replace function public.hr_tick_queue_peek()\nreturns setof record language sql security definer as $peek$\n  select id, headers from net.http_request_queue order by id desc limit 10\n$peek$;\n`,
  },
  {
    name: 'bridge-function-dynamic', arm: 'Q-1',
    what: 'the same bridge hidden in a dynamic EXECUTE string',
    patch: (s) => `${s}\ncreate or replace function public.hr_tick_peek2() returns jsonb\nlanguage plpgsql security definer as $p2$\nbegin\n  return (select jsonb_agg(x) from (execute 'select * from net.http_request_queue') x);\nend $p2$;\n`,
  },
  {
    name: 'bridge-view', arm: 'Q-1b',
    what: 'a view in public over the queue — a table, as far as PostgREST is concerned',
    patch: (s) => `${s}\ncreate view public.hr_tick_outbox as select id, url, headers from net.http_request_queue;\n`,
  },
  {
    name: 'regrant', arm: 'Q-2',
    what: 'a grant of our own handing the queue read back to authenticated',
    patch: (s) => `${s}\ngrant select on net.http_request_queue to authenticated;\n`,
  },
  {
    name: 'regrant-schema-wide', arm: 'Q-2',
    what: 'the schema-wide spelling of the same grant',
    patch: (s) => `${s}\ngrant select on all tables in schema net to anon;\n`,
  },
  {
    name: 'expose-net', arm: 'Q-3',
    what: '`net` added to PostgREST\'s exposed schemas from a migration',
    patch: (s) => `${s}\nalter role authenticator set pgrst.db_schemas = 'public, graphql_public, net';\n`,
  },
  {
    name: 'publish-queue', arm: 'Q-4',
    what: 'the queue published over Realtime',
    patch: (s) => `${s}\nalter publication supabase_realtime add table net.http_request_queue;\n`,
  },
  {
    name: 'publish-all-tables', arm: 'Q-4',
    what: '`for all tables`, which is every schema including net',
    patch: (s) => `${s}\ncreate publication hr_everything for all tables;\n`,
  },
  {
    name: 'expose-net-config', arm: 'Q-3', config: true,
    what: '`net` added to the exposed schemas in supabase/config.toml',
    patch: (s) => `${s}\n[api]\nschemas = ["public", "graphql_public", "net"]\n`,
  },
  // ── the spellings a reviewer asks about. A guard that only catches the
  //    shape its author imagined is an author's guard, not a guard.
  {
    name: 'quoted-identifiers', arm: 'Q-1',
    what: 'the bridge written with quoted identifiers — "net"."http_request_queue"',
    patch: (s) => `${s}\ncreate or replace function public."peekQ"() returns setof record language sql as $z$\n  select * from "net"."http_request_queue"\n$z$;\n`,
  },
  {
    name: 'uppercase', arm: 'Q-1',
    what: 'the same bridge SHOUTED — SQL does not care about case and neither may the guard',
    patch: (s) => `${s}\nCREATE OR REPLACE FUNCTION PUBLIC.PEEK3() RETURNS SETOF RECORD LANGUAGE SQL AS $Z$\n  SELECT * FROM NET.HTTP_REQUEST_QUEUE\n$Z$;\n`,
  },
  {
    name: 'unqualified-routine', arm: 'Q-1',
    what: 'a routine created with no schema — which lands in public, the exposed one',
    patch: (s) => `${s}\ncreate function peek4() returns setof record language sql as $z$\n  select * from net.http_request_queue\n$z$;\n`,
  },
  {
    name: 'from-across-newlines', arm: 'Q-1',
    what: '`from` and the table on different lines — formatting is not a hiding place',
    patch: (s) => `${s}\ncreate or replace function public.peek5() returns setof record language sql as $z$\n  select *\n    from\n      net.http_request_queue\n$z$;\n`,
  },
  {
    name: 'response-table-only', arm: 'Q-1',
    what: 'net._http_response alone — it holds the tick response body for its TTL',
    patch: (s) => `${s}\ncreate or replace function public.peek6() returns setof record language sql as $z$\n  select * from net._http_response\n$z$;\n`,
  },
  {
    name: 'materialized-view', arm: 'Q-1b',
    what: 'a MATERIALIZED view — which is a stored copy of the bearer, not just a window on it',
    patch: (s) => `${s}\ncreate materialized view public.hr_tick_outbox_mv as select id, headers from net.http_request_queue;\n`,
  },
  {
    name: 'grant-all', arm: 'Q-2',
    what: '`grant all`, which contains the select',
    patch: (s) => `${s}\ngrant all on net.http_request_queue to authenticated;\n`,
  },
  {
    name: 'grant-to-public', arm: 'Q-2',
    what: 'a grant of our own to PUBLIC — the one we could actually revoke afterwards, and so the one to refuse now',
    patch: (s) => `${s}\ngrant select on net._http_response to public;\n`,
  },
  {
    name: 'publish-schema-net', arm: 'Q-4',
    what: '`add tables in schema net` — the whole schema in one statement',
    patch: (s) => `${s}\nalter publication supabase_realtime add tables in schema net;\n`,
  },
  // ── CONTROLS: each of these MUST stay silent ──────────────────────────────
  {
    name: 'privilege-assertion', control: true,
    what: 'a public definer function ASSERTING on the queue privilege — the in-DB half of this guard',
    patch: (s) => `${s}\ncreate or replace function public.hr_assert_queue_unreachable() returns void\nlanguage plpgsql security definer as $q$\nbegin\n  if has_table_privilege('anon', 'net.http_request_queue', 'SELECT')\n     and exists (select 1 from pg_publication_tables where schemaname = 'net') then\n    raise exception 'T-5: net.http_request_queue is published';\n  end if;\nend $q$;\n`,
  },
  {
    name: 'comment-mention', control: true,
    what: 'a comment quoting the exploit shape — prose is not a read',
    patch: (s) => `${s}\n-- An attacker would want: select headers from net.http_request_queue;\n/* and then: update net._http_response set content = '' */\n`,
  },
  {
    name: 'net-schema-routine', control: true,
    what: 'a routine in schema `net` reading the queue — pg_net\'s own shape, and `net` is not exposed',
    patch: (s) => `${s}\ncreate or replace function net.hr_drain() returns setof record language sql as $d$\n  select * from net.http_request_queue\n$d$;\n`,
  },
  {
    name: 'revoke-is-not-a-grant', control: true,
    what: 'the staged lockdown\'s own revoke — the opposite of Q-2',
    patch: (s) => `${s}\nrevoke select on net.http_request_queue, net._http_response from anon, authenticated;\n`,
  },
  {
    name: 'grant-to-postgres', control: true,
    what: 'a grant to `postgres` — the operator keeps the read a rotation check needs',
    patch: (s) => `${s}\ngrant select on net.http_request_queue to postgres;\n`,
  },
  {
    name: 'net-http-post-call', control: true,
    what: 'the driver\'s own `net.http_post` — a WRITE into the queue, which is the feature',
    patch: (s) => `${s}\ncreate or replace function public.hr_poster() returns bigint language sql as $z$\n  select net.http_post('https://x', '{}'::jsonb)\n$z$;\n`,
  },
  {
    name: 'similarly-named-public-table', control: true,
    what: 'a public object whose NAME contains the queue\'s — schema qualification is the test',
    patch: (s) => `${s}\ncreate view public.my_http_request_queue as select 1 as id;\n`,
  },
  {
    name: 'public-publication-edit', control: true,
    what: 'a publication edit that names a public table — the realtime-trim shape',
    patch: (s) => `${s}\nalter publication supabase_realtime add table public.chat_messages;\n`,
  },
];

async function selftest() {
  const base = await sources();
  const { findings: baseline } = scan(base);
  if (baseline.length) {
    console.error('HARNESS  the working tree is already red; --selftest cannot distinguish a planted '
      + 'defect from a standing one. Fix the tree first:\n'
      + baseline.map((f) => `           ${f.arm} ${f.file}:${f.line} ${f.subject}`).join('\n'));
    process.exit(2);
  }
  let failed = 0;
  for (const p of PLANTS) {
    let input;
    if (p.config) {
      input = { migrations: base.migrations, configToml: p.patch(base.configToml) };
      if (input.configToml === base.configToml) { console.error(`HARNESS  ${p.name}: the plant changed nothing`); process.exit(2); }
    } else {
      const before = base.migrations.get(TARGET);
      if (before === undefined) throw new Harness(`${TARGET} is not in supabase/migrations/ — the plant anchor has moved`);
      const after = p.patch(before);
      if (after === before) { console.error(`HARNESS  ${p.name}: the plant changed nothing`); process.exit(2); }
      const migrations = new Map(base.migrations);
      migrations.set(TARGET, after);
      input = { migrations, configToml: base.configToml };
    }
    const { findings } = scan(input);
    if (p.control) {
      if (findings.length) {
        console.error(`FALSE POSITIVE  ${p.name}\n           ${p.what}\n`
          + findings.map((f) => `           ${f.arm} ${f.file}:${f.line} ${f.subject}`).join('\n'));
        failed++;
      } else {
        console.log(`silent   ${p.name.padEnd(26)} ${p.what}`);
      }
      continue;
    }
    const hit = findings.filter((f) => f.arm === p.arm);
    if (!hit.length) {
      console.error(`SLIPPED  ${p.name}\n           ${p.what}\n`
        + `           Not reported under ${p.arm}. This guard does not see it; it is decoration until it does.`);
      failed++;
    } else {
      console.log(`caught   ${p.name.padEnd(26)} via ${p.arm.padEnd(4)} ${p.what}`);
    }
  }
  if (failed) {
    console.error(`\n${failed} of ${PLANTS.length} probes failed.`);
    process.exit(1);
  }
  const real = PLANTS.filter((p) => !p.control).length;
  console.log(`\nall ${real} planted defects caught, ${PLANTS.length - real} controls silent`);
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  if (argv.includes('--selftest')) { await selftest(); return; }
  if (argv.includes('--live')) { await live(); return; }

  const src = await sources();
  const { findings, looked } = scan(src);

  if (argv.includes('--list')) {
    console.log(`migrations scanned: ${src.migrations.size}   statements examined: ${looked.length}\n`);
    for (const l of looked) {
      const tag = l.read ? (l.exposed ? 'FINDING ' : 'not-exposed') : 'clean   ';
      console.log(`${tag.padEnd(12)} [${l.kind}] ${l.file}  ${l.subject}`);
    }
    console.log('');
  }

  for (const f of findings) {
    console.error(`pg_net QUEUE REACHABLE  ${f.arm}  ${f.file}:${f.line}`);
    console.error(`  ${f.subject}`);
    console.error(`  ${f.detail}`);
  }
  if (findings.length) {
    console.error(`\n${findings.length} finding(s). The tick bearer transits net.http_request_queue and PUBLIC `
      + 'holds SELECT on it — see the header for why that grant cannot be revoked and why reachability, not '
      + 'privilege, is the arming condition.');
    process.exit(1);
  }
  const routines = looked.filter((l) => l.kind === 'routine').length;
  const views = looked.filter((l) => l.kind === 'view').length;
  console.log(`pg-net-queue-unreachable: OK — ${src.migrations.size} migrations, ${routines} routine bodies, `
    + `${views} views, no exposed-schema read of net.http_request_queue/_http_response, `
    + 'no added grant, no `net` in PostgREST\'s schema list, no queue table published');
}

const IS_ENTRY = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (IS_ENTRY) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(e.harness ? 2 : 1);
  });
}
