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
// ── Q-1 IS JUDGED AT CHAIN END (2026-09-28, GitHub run 36385797281) ───────
// Until 2026-09-28 Q-1 judged each migration file's TEXT: a bridge created in
// one file stayed a finding forever, even after a later file dropped it. That
// is not the question this guard exists to answer — "is a bridge reachable on
// the database the chain builds?" — and it left no honest way out once a
// bridge had been APPLIED (2026-09-28-world-tick-stall-observability.sql's
// public.hr_tick_edge_harvest): the applied file's bytes are the record and are
// never rewritten, so the only fix is a later file, and a per-file Q-1 stays red
// through it. Q-1 now replays the routine's history in the APPLY ORDER
// (tests/schema-apply-order.json: pre_schema, then order; within a file, text
// order). A Q-1 finding stands unless, AFTER it, the same routine is
//   · dropped — `drop function|procedure|routine [if exists] schema.name`,
//     with no argument list or one whose types match the reading create's
//     input types (a different overload does not clear it), or
//   · restated by `create or replace` with the SAME parameter list and a body
//     that no longer reads a queue table,
// and no reading create of it follows that. Everything else FAILS CLOSED:
// a file absent from the apply order (excluded, or unlisted) can neither clear
// a finding nor have its own findings cleared; `alter function … set schema /
// rename`, `drop schema … cascade` and a type spelled two different ways are
// not understood and so never clear anything. Q-1b..Q-4 are unchanged and still
// judged per file. --selftest carries plants for each way the clearance could
// be abused (no drop, a different routine dropped, a drop in an EARLIER file,
// a different overload dropped, a reading restatement, a re-create after the
// drop) and controls proving a real later drop / clean restatement clears.
// A clearance is a CHAIN property: when the clearing file's apply-order note
// does not start with APPLIED, the OK line and --list say so by name (Security
// ruling, docs/planning/SEC_TICK_HARVEST_OFF_RPC_2026-09-28.md Q4) — the
// deployment record, not this guard, is what says production has it.
//
// ── Q-5 hr_ops STAYS A SINK (2026-09-28, same ruling) ──────────────────────
// The fix for the Q-1 red moved the reader into the non-exposed schema hr_ops,
// so hr_ops' non-exposure is now load-bearing for Q-1 and is guarded here, per
// file and without clearance: no GRANT on hr_ops or anything in it (to anyone
// but postgres), no default-privilege grant in it, no exposed-schema routine or
// view calling into it outside SINK_CALLERS, no grant of a SINK_CALLER to a
// client/engine role, hr_ops never in pgrst.db_schemas or config.toml, and no
// `alter` of hr_ops or `set schema/owner to/rename` of a routine in it.
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
const APPLY_ORDER = path.join(ROOT, 'tests', 'schema-apply-order.json');
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

// Q-5 — the non-exposed schema that HOLDS the operator-only queue readers
// (2026-09-28-tick-harvest-off-rpc-surface.sql). Its non-exposure is what Q-1's
// clearance of public.hr_tick_edge_harvest rests on, so it is guarded here and
// not only by that file's apply-time h5/h6. SINK_CALLERS is the complete list of
// exposed-schema routines allowed to call into it; each must stay unexecutable
// by every client/engine role (hr_tick_cron_note returns void and writes a log
// no client role can read, 2026-09-21-world-tick-cron.sql:211-216).
const SINK = 'hr_ops';
const SINK_CALLERS = new Set(['public.hr_tick_cron_note']);
const SINK_REF_RE = /\b"?hr_ops"?\s*\.\s*"?[a-z0-9_]+/i;

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

// ── routine identity, for the chain-end judgement of Q-1 ────────────────────
// The text between the `(` at `open` and its matching `)`, or null.
function parenBody(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') { depth--; if (!depth) return text.slice(open + 1, i); }
  }
  return null;
}
function splitTop(s) {
  const out = [];
  let depth = 0; let cur = '';
  for (const c of s) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && !depth) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
const normType = (s) => s.toLowerCase().replace(/"/g, '').replace(/\s+/g, ' ').trim()
  .replace(/\s*\(\s*/g, '(').replace(/\s*\)/g, ')')
  .replace(/\b(?:integer|int4)\b/g, 'int').replace(/\bint8\b/g, 'bigint').replace(/\bbool\b/g, 'boolean')
  .replace(/\btimestamp with time zone\b/g, 'timestamptz');
// One parameter as the catalogue sees it: mode, name and type, default removed.
function params(raw) {
  if (raw == null) return null;
  return splitTop(raw).map((p) => {
    const t = normType(p.replace(/\s(?:default\b|=)[\s\S]*$/i, ''));
    const mode = /^(in|out|inout|variadic)\s/.exec(t)?.[1] || 'in';
    return { mode, text: t.replace(/^(?:in|out|inout|variadic)\s+/, '') };
  });
}
const inputs = (ps) => ps.filter((p) => p.mode !== 'out');
// Does a drop's argument list name this create's signature? Same count, and
// each drop argument is the create parameter or its trailing type.
function dropMatches(createPs, dropArgs) {
  if (dropArgs === null) return true;                     // `drop function s.f;` — the only one
  const ins = inputs(createPs); const ds = inputs(dropArgs);
  return ins.length === ds.length
    && ins.every((p, i) => p.text === ds[i].text || p.text.endsWith(` ${ds[i].text}`));
}
const sameParams = (a, b) => a.length === b.length
  && a.every((p, i) => p.mode === b[i].mode && p.text === b[i].text);

const CREATE_RE = /create\s+(?:or\s+replace\s+)?(function|procedure)\s+(?:"?([a-z0-9_]+)"?\s*\.\s*)?"?([a-z0-9_]+)"?\s*\(/ig;
const DROP_RE = /\bdrop\s+(?:function|procedure|routine)\s+(?:if\s+exists\s+)?([^;]*)/ig;

// ── the scan ────────────────────────────────────────────────────────────────
// `order` is the apply order (file names). Without it nothing is ever cleared
// and Q-1 is the old per-file judgement — the fail-closed direction.
export function scan({ migrations, configToml, order }) {
  const findings = [];
  const looked = [];
  const add = (f) => findings.push(f);
  const pos = new Map((order || []).map((f, i) => [f, i]));
  // Per routine (schema.name), every create and drop at a known position.
  const history = new Map();
  const note = (name, ev) => { if (!history.has(name)) history.set(name, []); history.get(name).push(ev); };

  for (const [file, src] of migrations) {
    const { text, spans } = walk(src);
    const p = pos.has(file) ? pos.get(file) : null;

    // Q-1 history — each create STATEMENT in an exposed schema and its body (the
    // outermost dollar span after its parameter list), and each drop.
    if (p !== null) {
      for (let cm = CREATE_RE.exec(text); cm; cm = CREATE_RE.exec(text)) {
        const schema = (cm[2] || 'public').toLowerCase();
        if (!EXPOSED.has(schema)) continue;
        const open = cm.index + cm[0].length - 1;
        const raw = parenBody(text, open);
        const after = open + (raw == null ? 0 : raw.length + 2);
        const body = spans.filter((s) => s.head >= after)
          .reduce((a, s) => (!a || s.head < a.head || (s.head === a.head && s.end > a.end) ? s : a), null);
        if (!body || raw == null) continue;
        // The body must BELONG to this statement: no `;` between the `)` and `$`.
        if (text.slice(after, body.head).includes(';')) continue;
        note(`${schema}.${cm[3].toLowerCase()}`, {
          kind: READ_RE.test(text.slice(body.body, body.end)) ? 'read' : 'clean',
          at: [p, cm.index], params: params(raw), file,
        });
      }
      for (let dm = DROP_RE.exec(text); dm; dm = DROP_RE.exec(text)) {
        const list = dm[1].replace(/\b(?:cascade|restrict)\b\s*$/i, '');
        for (const item of splitTop(list)) {
          const im = /^\s*(?:"?([a-z0-9_]+)"?\s*\.\s*)?"?([a-z0-9_]+)"?\s*(\()?/i.exec(item);
          if (!im) continue;
          const schema = (im[1] || 'public').toLowerCase();
          const rawArgs = im[3] ? parenBody(item, im.index + im[0].length - 1) : null;
          if (im[3] && rawArgs == null) continue;   // an argument list we cannot read clears nothing
          const args = im[3] ? params(rawArgs) : null;
          note(`${schema}.${im[2].toLowerCase()}`, { kind: 'drop', at: [p, dm.index], args, file });
        }
      }
    }

    // Q-1 — a routine body in an exposed schema that READS a queue table.
    for (const s of spans) {
      const headStart = Math.max(0, s.head - 600);
      const head = text.slice(headStart, s.head);
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
        q1: { at: p === null ? null : [p, s.head],
              params: params(parenBody(text, headStart + m.index + m[0].length - 1)) },
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

    // Q-5a — an exposed-schema routine or view that reaches INTO hr_ops. A
    // public wrapper around an hr_ops reader is the Q-1 bridge with one hop.
    for (const s of spans) {
      const head = text.slice(Math.max(0, s.head - 600), s.head);
      const m = /create\s+(?:or\s+replace\s+)?(function|procedure)\s+(?:"?([a-z0-9_]+)"?\s*\.\s*)?"?([a-z0-9_]+)"?\s*\(/i
        .exec(head.split(/;\s*$/).pop());
      if (!m) continue;
      const schema = (m[2] || 'public').toLowerCase();
      const name = `${schema}.${m[3].toLowerCase()}`;
      const ref = SINK_REF_RE.exec(text.slice(s.body, s.end));
      if (!ref || !EXPOSED.has(schema) || SINK_CALLERS.has(name)) continue;
      add({
        arm: 'Q-5', file, line: lineOf(text, s.body + ref.index), subject: name,
        detail: `${m[1].toLowerCase()} in the exposed schema \`${schema}\` calls into \`${SINK}\` (\`${ref[0]}\`). `
          + `${SINK} exists to keep the pg_net readers off the RPC surface; a public caller puts them back. `
          + 'If the caller is operator-only by construction, add it to SINK_CALLERS with its ACL evidence.',
      });
    }
    const sinkViewRe = /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:"?([a-z0-9_]+)"?\s*\.\s*)?"?([a-z0-9_]+)"?/ig;
    for (let vm = sinkViewRe.exec(text); vm; vm = sinkViewRe.exec(text)) {
      const schema = (vm[1] || 'public').toLowerCase();
      const stop = text.indexOf(';', vm.index);
      const stmt = text.slice(vm.index, stop === -1 ? Math.min(text.length, vm.index + 4000) : stop);
      const ref = SINK_REF_RE.exec(stmt);
      if (!ref || !EXPOSED.has(schema)) continue;
      add({
        arm: 'Q-5', file, line: lineOf(text, vm.index + ref.index), subject: `${schema}.${vm[2]}`,
        detail: `a view in the exposed schema \`${schema}\` reads from \`${SINK}\` (\`${ref[0]}\`).`,
      });
    }
    // Q-5b — any grant ON hr_ops or an object in it (the owner needs none), any
    // default-privilege grant in it, and any grant of a SINK_CALLER to a client role.
    const sinkGrantRe = /\bgrant\b[^;]{0,600}?\bon\b([^;]{0,600}?)\bto\b([^;]{0,300})/ig;
    for (let gm = sinkGrantRe.exec(text); gm; gm = sinkGrantRe.exec(text)) {
      const on = gm[1].toLowerCase();
      const to = gm[2].toLowerCase();
      const onSink = /\b"?hr_ops"?\b/.test(on);
      const onCaller = [...SINK_CALLERS].some((c) => new RegExp(String.raw`\bfunction\s+(?:"?public"?\s*\.\s*)?"?${c.split('.')[1]}"?\b`).test(on));
      const roles = CLIENT_ROLES.filter((r) => new RegExp(String.raw`\b${r}\b`).test(to));
      const grantees = to.replace(/\bwith\s+grant\s+option\b|\bgranted\s+by\b.*$/g, '').replace(/['"\s]/g, '');
      if (!(onSink && grantees !== 'postgres') && !(onCaller && roles.length)) continue;
      add({
        arm: 'Q-5', file, line: lineOf(text, gm.index), subject: gm[0].replace(/\s+/g, ' ').slice(0, 160),
        detail: onSink
          ? `grants on \`${SINK}\`. Nothing but its owner may use, execute or create in it: its routines read a table PUBLIC can read.`
          : `grants a routine that calls into \`${SINK}\` to [${roles.join(', ')}] — the Q-1 bridge, one hop removed.`,
      });
    }
    const sinkDefRe = /\balter\s+default\s+privileges\b[^;]{0,300}?\bin\s+schema\b[^;]{0,200}?\bhr_ops\b[^;]{0,300}?\bgrant\b[^;]{0,300}/ig;
    for (let dm = sinkDefRe.exec(text); dm; dm = sinkDefRe.exec(text)) {
      add({
        arm: 'Q-5', file, line: lineOf(text, dm.index), subject: dm[0].replace(/\s+/g, ' ').slice(0, 160),
        detail: `a default-privilege GRANT in \`${SINK}\` hands every future routine there to its grantee.`,
      });
    }
    // Q-5c — hr_ops joining PostgREST's exposed list (assignment spellings only:
    // the migration's own h6 NAMES the setting in a pattern and is not one).
    const sinkPgrstRe = /(?:\bpgrst\s*\.\s*db_schemas\s*(?:=|\bto\b)\s*|'pgrst\.db_schemas'\s*,\s*|\bPGRST_DB_SCHEMAS\s*=\s*)'?([^';\n]{0,300})/ig;
    for (let pm = sinkPgrstRe.exec(text); pm; pm = sinkPgrstRe.exec(text)) {
      if (!/\bhr_ops\b/i.test(pm[1])) continue;
      add({
        arm: 'Q-5', file, line: lineOf(text, pm.index), subject: pm[0].replace(/\s+/g, ' ').slice(0, 160),
        detail: `adds \`${SINK}\` to PostgREST's exposed schemas — every pg_net reader in it becomes an RPC.`,
      });
    }
    // Q-5d — moving or re-owning what is in hr_ops, or hr_ops itself. Not
    // understood, so never allowed: `set schema public` is a create in public
    // that no create regex sees.
    const sinkAlterRe = /\balter\s+(?:(?:function|procedure|routine)\s+"?hr_ops"?\s*\.[^;]{0,400}?\b(?:set\s+schema|owner\s+to|rename)\b|schema\s+"?hr_ops"?\b[^;]{0,200})/ig;
    for (let am = sinkAlterRe.exec(text); am; am = sinkAlterRe.exec(text)) {
      add({
        arm: 'Q-5', file, line: lineOf(text, am.index), subject: am[0].replace(/\s+/g, ' ').slice(0, 160),
        detail: `alters \`${SINK}\` or moves/re-owns a routine in it. Restate the routine where it must live instead.`,
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
    if (/["']hr_ops["']/.test(apiSchemas[1].toLowerCase())) {
      add({
        arm: 'Q-5', file: 'supabase/config.toml', line: lineOf(configToml, apiSchemas.index),
        subject: apiSchemas[0].trim(),
        detail: `exposes \`${SINK}\` to PostgREST at deploy time — every pg_net reader in it becomes an RPC.`,
      });
    }
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

  // Q-1 at chain end: a finding stands unless a LATER event (apply order, then
  // text order) drops or cleanly restates the same routine and no reading
  // create of it follows. A finding at an unknown position is never cleared.
  const later = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  const superseded = [];
  const live = findings.filter((f) => {
    if (f.arm !== 'Q-1' || !f.q1.at || !f.q1.params) return true;
    const evs = (history.get(f.subject) || []).filter((e) => later(e.at, f.q1.at))
      .sort((a, b) => (later(a.at, b.at) ? 1 : -1));
    let cleared = null;
    for (const e of evs) {
      if (e.kind === 'drop' && dropMatches(f.q1.params, e.args)) cleared = e;
      else if (e.params && sameParams(e.params, f.q1.params)) cleared = e.kind === 'clean' ? e : null;
    }
    if (cleared) superseded.push({ ...f, by: cleared });
    return !cleared;
  });

  return { findings: live, looked, superseded };
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
  let order;
  let notes;
  try {
    const j = JSON.parse(await readFile(APPLY_ORDER, 'utf8'));
    order = [...(j.pre_schema || []), ...(j.order || [])];
    notes = j._order_notes || {};
  } catch (e) {
    throw new Harness(`cannot read the apply order ${APPLY_ORDER}: ${e.message}`);
  }
  if (!order.length) throw new Harness(`${APPLY_ORDER} names no files — Q-1 cannot be judged at chain end`);
  return { migrations, configToml, order, notes };
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

const LATE = '9999-12-31-selftest-late.sql';
const EARLY = '0000-01-01-selftest-early.sql';
const BRIDGE = '\ncreate or replace function public.hr_tick_queue_peek()\nreturns setof record language sql security definer as $peek$\n  select id, headers from net.http_request_queue order by id desc limit 10\n$peek$;\n';
const withTarget = (m, add) => new Map(m).set(TARGET, m.get(TARGET) + add);
/** Add `name` to the migrations and to the apply order — after TARGET if `before` is false. */
function withFile(m, o, name, src, before = false) {
  const order = [...o];
  const at = order.indexOf(TARGET);
  if (at < 0) throw new Harness(`${TARGET} is not in the apply order — the plant anchor has moved`);
  if (before) order.splice(at, 0, name); else order.push(name);
  return { migrations: new Map(m).set(name, src), order };
}

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
  // ── Q-1 AT CHAIN END (2026-09-28): the clearance must not be a way out ────
  //    `set` plants edit several files and the apply order. LATE is a new file
  //    appended to the order; EARLY is one inserted just before TARGET.
  {
    name: 'chain-bridge-no-later-drop', arm: 'Q-1',
    what: 'a bridge, and a LATER file that touches other routines but never drops it',
    set: (m, o) => withFile(withTarget(m, BRIDGE), o, LATE,
      'create or replace function public.hr_other() returns int language sql as $z$ select 1 $z$;\n'),
  },
  {
    name: 'chain-drop-different-routine', arm: 'Q-1',
    what: 'a bridge, and a LATER `drop function` of a DIFFERENT routine',
    set: (m, o) => withFile(withTarget(m, BRIDGE), o, LATE,
      'drop function if exists public.hr_tick_queue_peek2();\ndrop function if exists public.hr_tick_queue();\n'),
  },
  {
    name: 'chain-drop-in-earlier-file', arm: 'Q-1',
    what: 'the right drop, in a file that APPLIES BEFORE the bridge — the wrong order',
    set: (m, o) => withFile(withTarget(m, BRIDGE), o, EARLY,
      'drop function if exists public.hr_tick_queue_peek();\n', true),
  },
  {
    name: 'chain-drop-before-create-same-file', arm: 'Q-1',
    what: 'the right drop, earlier IN THE SAME FILE than the create',
    set: (m, o) => ({ migrations: withTarget(m, `\ndrop function if exists public.hr_tick_queue_peek();\n${BRIDGE}`), order: o }),
  },
  {
    name: 'chain-drop-other-overload', arm: 'Q-1',
    what: 'a LATER drop of the same name with a DIFFERENT argument list — another overload',
    set: (m, o) => withFile(withTarget(m, BRIDGE), o, LATE,
      'drop function if exists public.hr_tick_queue_peek(text);\n'),
  },
  {
    name: 'chain-restated-still-reading', arm: 'Q-1',
    what: 'a LATER `create or replace` of the bridge that still reads the queue',
    set: (m, o) => withFile(withTarget(m, BRIDGE), o, LATE, BRIDGE),
  },
  {
    name: 'chain-recreated-after-drop', arm: 'Q-1',
    what: 'a LATER drop, then the bridge created AGAIN after it',
    set: (m, o) => withFile(withTarget(m, BRIDGE), o, LATE,
      `drop function if exists public.hr_tick_queue_peek();\n${BRIDGE}`),
  },
  {
    name: 'chain-drop-in-unordered-file', arm: 'Q-1',
    what: 'the right drop, in a file the apply order does not list — it may never run',
    set: (m, o) => ({ migrations: new Map([...withTarget(m, BRIDGE),
      [LATE, 'drop function if exists public.hr_tick_queue_peek();\n']]), order: o }),
  },
  // ── Q-5 (2026-09-28): hr_ops, the home of the moved harvest, stays a sink ─
  {
    name: 'sink-usage-grant', arm: 'Q-5',
    what: '`grant usage on schema hr_ops to authenticated`',
    patch: (s) => `${s}\ngrant usage on schema hr_ops to authenticated;\n`,
  },
  {
    name: 'sink-all-functions-grant', arm: 'Q-5',
    what: '`grant execute on all functions in schema hr_ops to anon`',
    patch: (s) => `${s}\ngrant execute on all functions in schema hr_ops to anon;\n`,
  },
  {
    name: 'sink-dynamic-grant', arm: 'Q-5',
    what: 'a dynamic `execute \'grant execute on function hr_ops.… to service_role\'`',
    patch: (s) => `${s}\ndo $g$ begin execute 'grant execute on function hr_ops.hr_tick_edge_harvest() to service_role'; end $g$;\n`,
  },
  {
    name: 'sink-default-privileges', arm: 'Q-5',
    what: '`alter default privileges … in schema hr_ops grant execute on functions to authenticated`',
    patch: (s) => `${s}\nalter default privileges for role postgres in schema hr_ops grant execute on functions to authenticated;\n`,
  },
  {
    name: 'sink-pgrst-exposed', arm: 'Q-5',
    what: '`alter role authenticator set pgrst.db_schemas = \'public, graphql_public, hr_ops\'`',
    patch: (s) => `${s}\nalter role authenticator set pgrst.db_schemas = 'public, graphql_public, hr_ops';\n`,
  },
  {
    name: 'sink-config-exposed', arm: 'Q-5', config: true,
    what: '`hr_ops` added to the exposed schemas in supabase/config.toml',
    patch: (s) => `${s}\n[api]\nschemas = ["public", "graphql_public", "hr_ops"]\n`,
  },
  {
    name: 'sink-public-wrapper', arm: 'Q-5',
    what: 'a public definer function that returns hr_ops.hr_tick_edge_harvest() — Q-1 with one hop',
    patch: (s) => `${s}\ncreate or replace function public.hr_tick_peek() returns jsonb language sql security definer as $w$ select hr_ops.hr_tick_edge_harvest() $w$;\n`,
  },
  {
    name: 'sink-public-view', arm: 'Q-5',
    what: 'a public view selecting an hr_ops routine',
    patch: (s) => `${s}\ncreate or replace view public.hr_tick_peek_v as select hr_ops.hr_tick_edge_harvest() as h;\n`,
  },
  {
    name: 'sink-caller-granted', arm: 'Q-5',
    what: '`grant execute on function public.hr_tick_cron_note(…) to authenticated` — the allowlisted caller handed out',
    patch: (s) => `${s}\ngrant execute on function public.hr_tick_cron_note(text, int, int, int, jsonb) to authenticated;\n`,
  },
  {
    name: 'sink-set-schema', arm: 'Q-5',
    what: '`alter function hr_ops.hr_tick_edge_harvest() set schema public` — a create in public no regex sees',
    patch: (s) => `${s}\nalter function hr_ops.hr_tick_edge_harvest() set schema public;\n`,
  },
  // ── CONTROLS: each of these MUST stay silent ──────────────────────────────
  {
    name: 'sink-revoke', control: true,
    what: 'revokes on hr_ops and an hr_ops routine calling another — the lane\'s own shape',
    patch: (s) => `${s}\nrevoke all on schema hr_ops from public;\nrevoke execute on function public.hr_tick_cron_note(text, int, int, int, jsonb) from anon, authenticated;\n`
      + 'create or replace function hr_ops.hr_x() returns jsonb language sql as $x$ select hr_ops.hr_tick_edge_harvest() $x$;\n',
  },
  {
    name: 'sink-pgrst-assertion', control: true,
    what: 'an assertion that NAMES pgrst.db_schemas and hr_ops in a pattern (the h6 shape)',
    patch: (s) => `${s}\ndo $a$ begin if exists (select 1 from pg_db_role_setting s, unnest(s.setconfig) c where c ilike 'pgrst.db_schemas=%' and c ~* 'hr_ops') then raise exception 'x'; end if; end $a$;\n`,
  },
  {
    name: 'chain-later-drop', control: true,
    what: 'a bridge DROPPED by a later file in the apply order — gone at chain end',
    set: (m, o) => withFile(withTarget(m, BRIDGE), o, LATE,
      'drop function if exists public.hr_tick_queue_peek() cascade;\n'),
  },
  {
    name: 'chain-later-clean-restatement', control: true,
    what: 'a bridge RESTATED by a later file with a body that no longer reads the queue',
    set: (m, o) => withFile(withTarget(m, BRIDGE), o, LATE,
      'create or replace function public.hr_tick_queue_peek()\nreturns setof record language sql security definer as $peek$\n  select 1, null::jsonb where false\n$peek$;\n'),
  },
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
    if (p.set) {
      if (base.migrations.get(TARGET) === undefined) throw new Harness(`${TARGET} is not in supabase/migrations/ — the plant anchor has moved`);
      input = { ...p.set(base.migrations, base.order), configToml: base.configToml };
    } else if (p.config) {
      input = { migrations: base.migrations, configToml: p.patch(base.configToml), order: base.order };
      if (input.configToml === base.configToml) { console.error(`HARNESS  ${p.name}: the plant changed nothing`); process.exit(2); }
    } else {
      const before = base.migrations.get(TARGET);
      if (before === undefined) throw new Harness(`${TARGET} is not in supabase/migrations/ — the plant anchor has moved`);
      const after = p.patch(before);
      if (after === before) { console.error(`HARNESS  ${p.name}: the plant changed nothing`); process.exit(2); }
      const migrations = new Map(base.migrations);
      migrations.set(TARGET, after);
      input = { migrations, configToml: base.configToml, order: base.order };
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
  const { findings, looked, superseded } = scan(src);
  // A clearance is a property of the CHAIN. Whether production has it is the
  // apply-order note's to say (APPLIED …, witnessed by apply-order-honesty and
  // live-hash-drift), and the OK line must not claim more than the chain.
  const staged = (f) => !/^(?:APPLIED|LIVE)\b/.test((src.notes || {})[f.by.file] || '');
  const pending = superseded.filter(staged);

  if (argv.includes('--list')) {
    console.log(`migrations scanned: ${src.migrations.size}   statements examined: ${looked.length}\n`);
    for (const l of looked) {
      const tag = l.read ? (l.exposed ? 'FINDING ' : 'not-exposed') : 'clean   ';
      console.log(`${tag.padEnd(12)} [${l.kind}] ${l.file}  ${l.subject}`);
    }
    for (const f of superseded) {
      console.log(`superseded   [Q-1] ${f.file}:${f.line}  ${f.subject} — cleared at chain end by the `
        + `${f.by.kind === 'drop' ? 'drop' : 'clean restatement'} in ${f.by.file}`
        + `${staged(f) ? ' (STAGED, NOT APPLIED — production still holds the earlier body)' : ' (APPLIED)'}`);
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
    + `${views} views, no exposed-schema read of net.http_request_queue/_http_response at chain end `
    + `(${superseded.length} earlier bridge finding(s) superseded by a later drop/restatement`
    + `${pending.length ? `; ${pending.length} of them by a STAGED file not yet applied — production holds `
      + `${[...new Set(pending.map((f) => f.subject))].join(', ')} until the Coordinator applies `
      + `${[...new Set(pending.map((f) => f.by.file))].join(', ')}` : ''}), `
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
