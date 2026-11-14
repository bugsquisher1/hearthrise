#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/restore-drill.local.mjs — THE RESTORE DRILL THAT COSTS NOTHING, AS A RUNBOOK THAT RUNS.
//
//   node tools/restore-drill.local.mjs              backups -> export production -> rebuild locally -> load -> prove, timed
//   node tools/restore-drill.local.mjs --mutate     the drill, then seven defects planted in the restored copy: each must be caught
//   node tools/restore-drill.local.mjs --selftest   no network, no token: a replay with one hero made by the real RPCs stands in
//                                                  for production, every keyed table is paged, the same restore and proofs run,
//                                                  then the seven mutants
//   node tools/restore-drill.local.mjs --backups    backup posture and the price of the real drill only (read-only API)
//   --keep <dir>                                    keep the export there (default: an OS temp dir, deleted when done)
//   --from <dir>                                    restore and prove an export kept earlier, without reading production
//
// THE STEPS, in the order a 3am responder runs them (each is timed; export start to loaded is the RTO of THIS path):
//   0 BACKUPS   GET /database/backups: >= 7 COMPLETED, newest < 26 h, no gap > 26 h, PITR state. Billing prices the real drill.
//   1 EXPORT    ONE statement, so ONE snapshot (what pg_dump's single transaction gives): every public table's rows as JSON
//               with an exact count and a content hash, auth.users ids, sequences, every hero's hr_state_of envelope, the
//               grant-hygiene report, RLS policies, function bodies, constraints and every FK's orphan count, one instant.
//               A table over 64 MB (player_ledger) is too big for one answer: the snapshot pins its last primary key, count
//               and hash, and keyset pages up to that key must add up to exactly the same count and hash.
//   2 REBUILD   tests/schema-replay.mjs bootReplay: the schema and catalogues from the repo, as a disaster rebuild would.
//   3 LOAD      NOT VALID checks lifted, session_replication_role = replica (no trigger or FK fires, as pg_restore
//               --disable-triggers), every table truncated and refilled from the export FILES on disk, sequences set,
//               materialized views refreshed, the NOT VALID checks put back (pg_dump's order).
//   4 PROVE     V1 rows: every table's count and content hash equal the snapshot's. V2 graph: every FK's orphan count
//               equals production's. V3 envelopes: hr_state_of for EVERY hero equals production's at the same instant
//               (the database clock is pinned to the snapshot's now()). V4 census: tests/restore-census.mjs --live-compare
//               on the restored rows, and production's cron jobs a rebuild lacks. V5 grants: hr_assert_grant_hygiene(true)
//               holds and reports what production reports. V6 RLS: flags and policies equal production's, every user_id
//               table has RLS on. V7 code: every function body (live-hash-drift's normalisation; its graded divergences
//               honoured) and every constraint equal production's. V8 a player: as `authenticated` with the player's own
//               uid, hr_load answers ok and no other player's row is readable. V9 the repo alone: every seeded catalogue
//               rebuilds to production's content; the operator values a rebuild with no backup reverts are listed.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. It proves production's rows can be taken out through the read-only door the
// repo already uses, rebuilt into a working database from the repo alone, and that the result serves a player the same
// envelope production serves. It does NOT open a Supabase backup: physical daily backups restore only through the
// dashboard (Restore to a New Project has no Management API endpoint, re-audited 2026-11-14) or IN PLACE over production.
// That drill is priced by step 0 and stays a human click; this tool is what runs against its result.
//
// WHAT THIS PATH CANNOT CARRY (printed by every run): hr_server_secrets values (withheld from disk; a rebuild makes new
// ones), auth credentials and identities (only ids leave production: no email, no password hash), vault.secrets (the
// world tick's gateway keys and webhooks), the hr_engine_login password and the Edge Function secrets (not in ANY backup),
// UNLOGGED tables (a physical restore brings them back empty), Storage objects.
//
// THE READ FENCE. Table pages go through the Management API's read-only role (read_only:true, a read-only transaction),
// as every tools/*.local.mjs read does. The snapshot calls hr_state_of and hr_assert_grant_hygiene, which that role may
// not execute, so it runs as postgres INSIDE a read-only transaction, never committed: Postgres refuses every insert, update,
// delete, DDL and nextval in it, the envelope and hygiene calls are cross-joined to a CTE that is empty unless
// transaction_read_only is on, and the tool aborts if the returned fence row says otherwise. Every SQL text passes a
// keyword fence first. The token is ~/.supabase-token, read as file bytes, never printed and never in argv.
// mutant-anchors: none — the mutants plant into the restored local copy only, never the tree
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { isMain } from '../tests/_is-main.mjs';
import { bootReplay, ROOT } from '../tests/schema-replay.mjs';

const REF = 'nezapsylztqbbwuwembx';
/* A table bigger than PAGE_BYTES is paged by its integer primary key, PAGE_ROWS a page (~10 MB of ledger JSON an answer,
   3.5 s, measured 2026-11-14). The selftest pages every keyed table 7 rows at a time so the pager itself is proven. */
let PAGE_BYTES = 64 * 1048576;
let PAGE_ROWS = 20000;
const SECRET_COLS = { hr_server_secrets: ['secret'] };   // never leaves production; the rebuild's own rows stay
/* REPEATABLE READ, as pg_dump runs: under READ COMMITTED every statement INSIDE a volatile function (hr_state_of is
   plpgsql) takes a fresh snapshot, so the envelopes saw a hero's accrual that committed while the export statement ran
   (version 17259 against the exported rows' 17258, measured 2026-11-14). One transaction snapshot for everything. */
const BEGIN = 'begin isolation level repeatable read read only;';
const GUCS = "set local time zone 'UTC'; set local datestyle = 'ISO, MDY'; set local intervalstyle = 'postgres';"
  + " set local extra_float_digits = 1; set local bytea_output = 'hex';";
const flag = (k) => process.argv.includes(`--${k}`);
const argOf = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const qi = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// ── THE SOURCES: production through the Management API, or a replay standing in for it (--selftest) ──
function readFence(sql) {
  if (!/^\s*(select|with)\b/i.test(sql)
      || /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|call|vacuum|copy|do|commit|rollback|begin|set|execute|prepare|listen|notify)\b/i.test(sql)) {
    throw new Error('restore-drill: a production read failed the keyword fence');
  }
}
function liveSource() {
  const token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
  const api = async (path) => {
    const r = await fetch(`https://api.supabase.com/v1/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: r.ok ? await r.json() : null };
  };
  const read = async (sql, { privileged = false } = {}) => {
    readFence(sql);
    const body = { query: `${BEGIN} ${GUCS} ${sql};` };
    if (!privileged) body.read_only = true;
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const t = await r.text();
    if (!r.ok) throw new Error(`restore-drill: production answered ${r.status} ${t.slice(0, 300)}`);
    return JSON.parse(t);
  };
  return { name: 'production', live: true, api, read };
}
function replaySource(db) {
  const read = async (sql) => {
    readFence(sql);
    await db.exec(`${BEGIN} ${GUCS}`);
    try { return (await db.query(sql)).rows; } finally { await db.exec('rollback'); }
  };
  return { name: 'replay standing in for production', live: false, api: null, read, db };
}

// ── THE SQL: one builder for the catalogue, the manifest, the snapshot, the pages, the orphan counts ──
const CAT_SQL = `select c.relname as t, c.relpersistence::text as p, pg_relation_size(c.oid)::text as bytes,
  c.relrowsecurity::text as rls,
  (select json_agg(json_build_array(a.attname, format_type(a.atttypid, a.atttypmod), a.attgenerated <> '', a.attnotnull, a.attidentity = 'a')
     order by a.attname)::text from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as cols,
  (select json_agg(json_build_array(a.attname, format_type(a.atttypid, a.atttypmod)) order by k.o)::text
     from pg_index i cross join unnest(i.indkey::int2[]) with ordinality k(n, o) join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n
     where i.indrelid = c.oid and i.indisprimary and k.o <= i.indnkeyatts) as pk
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`;
const FK_SQL = `select c.conname as name, c.convalidated::text as valid,
  (select format('%I.%I', n.nspname, r.relname) from pg_class r join pg_namespace n on n.oid = r.relnamespace where r.oid = c.conrelid) as child,
  (select format('%I.%I', n.nspname, r.relname) from pg_class r join pg_namespace n on n.oid = r.relnamespace where r.oid = c.confrelid) as parent,
  (select json_agg(a.attname order by k.o)::text from unnest(c.conkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n) as ccols,
  (select json_agg(a.attname order by k.o)::text from unnest(c.confkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n) as pcols
  from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace order by 1, 3`;

function catalogue(rows) {
  const out = new Map();
  for (const r of rows) {
    const cols = JSON.parse(r.cols).map(([n, ty, gen, nn, ident]) => ({ n, ty, gen, nn, ident }));
    out.set(r.t, { t: r.t, p: r.p, bytes: Number(r.bytes), rls: r.rls, cols, pk: r.pk ? JSON.parse(r.pk) : null });
  }
  return out;
}
/* A row's content hash: the first 64 bits of md5 over its columns IN NAME ORDER (the two sides may order columns
   differently), summed as numeric, so it is order-free and adds up across pages. Secret columns are left out.
   `semantic` (V9 only) also leaves out timestamps and prose notes: a seeded row carries the instant it was applied
   (generated_at, approved_at) and a note an older apply kept, and neither is what a catalogue means. */
const isStamp = (c) => c.ty.startsWith('timestamp') || c.n === 'note' || c.n === 'notes';
function rowHash(t, semantic = false) {
  const keep = t.cols.filter((c) => !(SECRET_COLS[t.t] || []).includes(c.n) && !(semantic && isStamp(c))).map((c) => `r__.${qi(c.n)}`);
  return `('x' || left(md5(row(${keep.join(', ')})::text), 16))::bit(64)::bigint`;
}
const sel = (k, name, n, h, j) => `select ${lit(k)}::text as k, ${name}::text as name, ${n}::text as n, ${h}::text as h, ${j}::text as j`;
function tableBranch(t, mode) {
  const from = `from public.${qi(t.t)} r__`;
  const hash = `coalesce(sum(${rowHash(t, mode === 'semantic')}), 0)`;
  if (mode === 'semantic') return `${sel('rows', lit(t.t), 'count(*)', hash, 'null')} ${from}`;
  if (mode === 'hash') return `${sel('rows', lit(t.t), 'count(*)', hash, 'null')} ${from}`;
  if (paged(t)) return `${sel('paged', lit(t.t), 'count(*)', hash, `(select ${keyText(t, 'm__')} from public.${qi(t.t)} m__ order by ${keyOrder(t, 'm__', ' desc')} limit 1)`)} ${from}`;
  const j = SECRET_COLS[t.t] ? `json_agg(to_jsonb(r__) - array[${SECRET_COLS[t.t].map(lit).join(', ')}])` : 'json_agg(r__)';
  return `${sel('rows', lit(t.t), 'count(*)', hash, j)} ${from}`;
}
const paged = (t) => t.bytes > PAGE_BYTES && !!t.pk;
function orphanBranches(fks) {
  return fks.map((f) => {
    const cc = JSON.parse(f.ccols); const pc = JSON.parse(f.pcols);
    const notNull = cc.map((c) => `o__.${qi(c)} is not null`).join(' and ');
    const join = cc.map((c, i) => `p__.${qi(pc[i])} = o__.${qi(c)}`).join(' and ');
    const [cs, ct] = f.child.split('.'); const [ps, pt] = f.parent.split('.');
    const n = `(select count(*) from ${qi(cs.replace(/"/g, ''))}.${qi(ct.replace(/"/g, ''))} o__ where ${notNull} and not exists `
      + `(select 1 from ${qi(ps.replace(/"/g, ''))}.${qi(pt.replace(/"/g, ''))} p__ where ${join}))`;
    return sel('orphan', lit(`${f.child}.${f.name}`), n, 'null', 'null');
  });
}
const AUTH_HASH = "coalesce(sum(('x' || left(md5(r__.id::text), 16))::bit(64)::bigint), 0)";
function schemaBranches() {
  return [
    sel('policy', "tablename || '.' || policyname", 'null', 'null', 'json_build_array(permissive, roles, cmd, qual, with_check)')
      + " from pg_policies where schemaname = 'public'",
    // tests/live-hash-drift.mjs's normalisation, verbatim: whitespace collapsed by the POSIX class (CRLF bodies on
    // production), so its graded divergences (functions[].agree false + why) are the same set and are honoured.
    sel('fn', "p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'", 'null',
      "md5(regexp_replace(pg_get_functiondef(p.oid), '[[:space:]]+', ' ', 'g'))", 'null')
      + " from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')",
    sel('cron', 'jobname', 'null', 'null', "schedule || ' | ' || trim(command)") + ' from cron.job',
    // contype 'n' excluded: PostgreSQL 18 (the replay) catalogues NOT NULL as constraints, 17 (production) does not.
    sel('con', "r.relname || '.' || c.conname", 'c.convalidated', 'md5(pg_get_constraintdef(c.oid))', 'null')
      + " from pg_constraint c join pg_class r on r.oid = c.conrelid where c.connamespace = 'public'::regnamespace and c.contype <> 'n'",
  ];
}
function snapshotSql(cat, fks, live) {
  const parts = [...cat.values()].map((t) => tableBranch(t, 'rows'));
  parts.push(`${sel('auth', "'users'", 'count(*)', AUTH_HASH, "json_agg(json_build_object('id', r__.id, 'aud', r__.aud, 'role', r__.role, 'instance_id', r__.instance_id))")} from auth.users r__`);
  parts.push(sel('seq', "format('%I.%I', schemaname, sequencename)", 'last_value', 'null', 'null') + " from pg_sequences where schemaname = 'public'");
  parts.push(sel('fence', 'current_user', "current_setting('transaction_read_only')", 'null', 'to_json(now())'));
  parts.push(sel('env', "s.user_id::text || ':' || s.slot", 'null', 'null', 'public.hr_state_of(s.user_id, s.slot)') + ' from public.player_state s cross join fence');
  parts.push(sel('hygiene', "''", 'null', 'null', 'public.hr_assert_grant_hygiene(false)') + ' from fence');
  parts.push(...schemaBranches(), ...orphanBranches(fks));
  if (live) {
    for (const r of ['auth.identities', 'auth.sessions', 'auth.refresh_tokens', 'storage.buckets', 'storage.objects', 'vault.secrets']) {
      parts.push(sel('outside', lit(r), 'count(*)', 'null', 'null') + ` from ${r}`);
    }
  }
  return `with fence as (select 1 where current_setting('transaction_read_only') = 'on')\n${parts.join('\nunion all\n')}`;
}
/* KEYSET PAGES ON THE PRIMARY KEY, whatever its shape: player_ledger's is (at, id) and it has no index on id alone,
   so `id > x order by id` would scan and sort 170 MB a page. A key is carried as a JSON array of its columns' text
   and compared as a row, which the primary key's btree answers directly. */
const keyText = (t, a) => `json_build_array(${t.pk.map(([c]) => `${a}.${qi(c)}::text`).join(', ')})::text`;
const keyOrder = (t, a, dir = '') => t.pk.map(([c]) => `${a}.${qi(c)}${dir}`).join(', ');
const keyRow = (t, a) => `row(${t.pk.map(([c]) => `${a}.${qi(c)}`).join(', ')})`;
const keyLit = (t, json) => `row(${JSON.parse(json).map((v, i) => `${lit(v)}::${t.pk[i][1]}`).join(', ')})`;
const pageSql = (t, last, max) => `select count(*)::text as n, coalesce(sum(${rowHash(t)}), 0)::text as h, json_agg(r__)::text as j,
  (array_agg(${keyText(t, 'r__')} order by ${keyOrder(t, 'r__', ' desc')}))[1] as last
  from (select * from public.${qi(t.t)} s__ where ${last ? `${keyRow(t, 's__')} > ${keyLit(t, last)} and ` : ''}${keyRow(t, 's__')} <= ${keyLit(t, max)}
  order by ${keyOrder(t, 's__')} limit ${PAGE_ROWS}) r__`;

// ── THE RUN ──────────────────────────────────────────────────────────────
const T = [];
async function step(name, fn) {
  console.error(`… ${name}`);
  const t0 = performance.now();
  const out = await fn();
  T.push([name, Math.round(performance.now() - t0), out?.note || '']);
  return out;
}
const kindRows = (rows, k) => rows.filter((r) => r.k === k);

async function backups(src) {
  const b = await src.api(`projects/${REF}/database/backups`);
  const add = await src.api(`projects/${REF}/billing/addons`);
  const list = (b.body?.backups || []).filter((x) => x.status === 'COMPLETED').map((x) => Date.parse(x.inserted_at)).sort((a, z) => z - a);
  const failed = (b.body?.backups || []).filter((x) => x.status !== 'COMPLETED').length;
  const gaps = list.slice(1).map((t, i) => (list[i] - t) / 3600e3);
  const newestH = list.length ? (Date.now() - list[0]) / 3600e3 : Infinity;
  const healthy = list.length >= 7 && newestH < 26 && failed === 0 && gaps.every((g) => g <= 26);
  const compute = add.body?.selected_addons?.find((a) => a.type === 'compute_instance')?.variant;
  const pitr = add.body?.available_addons?.find((a) => a.type === 'pitr')?.variants?.find((v) => v.id === 'pitr_7');
  const perH = compute?.price?.amount ?? null;
  const out = {
    healthy, completed: list.length, failed, newest_h: +newestH.toFixed(1), max_gap_h: +Math.max(0, ...gaps).toFixed(1),
    pitr_enabled: b.body?.pitr_enabled ?? null, compute: compute?.name ?? null, compute_per_h: perH,
    drill_3h_usd: perH === null ? null : +(perH * 3).toFixed(3), pitr7_month_usd: pitr?.price?.amount ?? null,
  };
  out.note = `${out.completed} COMPLETED, ${failed} not, newest ${out.newest_h} h, largest gap ${out.max_gap_h} h, PITR ${out.pitr_enabled}`;
  return out;
}

/* A transaction in flight at the snapshot can commit a ledger row inside the snapshot's key range a moment later; the
   pages then hold one row the snapshot did not, and V1 would call the export inconsistent. One retry takes a fresh cut. */
async function exportFrom(src, dir) {
  for (let attempt = 1; ; attempt++) {
    const ex = await exportOnce(src, dir, attempt);
    if (attempt >= 2 || ex.pages.every((p) => p.n === p.want_n && p.h === p.want_h)) return ex;
    console.error('… a paged table moved inside the snapshot range; taking the export again');
  }
}
async function exportOnce(src, dir, attempt) {
  const cat = catalogue(await src.read(CAT_SQL));
  const fks = await src.read(FK_SQL);
  const snap = await step(`1 export: one-snapshot statement${attempt > 1 ? ' (again)' : ''}`, async () => {
    const sql = snapshotSql(cat, fks, src.live);
    writeFileSync(join(dir, 'snapshot.sql'), sql);
    const rows = await src.read(sql, { privileged: true });
    const fence = kindRows(rows, 'fence')[0];
    if (!fence || fence.n !== 'on') throw new Error('restore-drill: the snapshot did not run read-only; aborting');
    writeFileSync(join(dir, 'snapshot.json'), JSON.stringify({ cat: [...cat.values()], fks, rows }));
    const n = kindRows(rows, 'rows').reduce((s, r) => s + Number(r.n), 0);
    return { rows, note: `${cat.size} tables, ${n} rows inline, ${kindRows(rows, 'env').length} envelopes as ${fence.name}` };
  });
  const pagesOut = [];
  await step('1b export: paged tables, keyset up to the snapshot key', async () => {
    for (const p of kindRows(snap.rows, 'paged')) {
      const t = cat.get(p.name);
      let last = null; let n = 0; let h = 0n; let i = 0;
      while (p.j !== null) {
        const [pg] = await src.read(pageSql(t, last, p.j));
        if (Number(pg.n) === 0) break;
        writeFileSync(join(dir, `${t.t}.${String(++i).padStart(4, '0')}.json`), pg.j);
        n += Number(pg.n); h += BigInt(pg.h); last = pg.last;
      }
      pagesOut.push({ t: t.t, pages: i, n: String(n), h: h.toString(), want_n: p.n, want_h: p.h });
    }
    const sum = (k) => pagesOut.reduce((s, p) => s + Number(p[k]), 0);
    return { note: pagesOut.length > 3 ? `${pagesOut.length} tables, ${sum('n')} rows in ${sum('pages')} pages`
      : pagesOut.map((p) => `${p.t} ${p.n} rows in ${p.pages} pages`).join('; ') || 'nothing paged' };
  });
  writeFileSync(join(dir, 'pages.json'), JSON.stringify(pagesOut));
  return { cat, fks, rows: snap.rows, pages: pagesOut };
}

/* --from <dir>: restore an export taken earlier (the 3am order: export while production answers, restore after). */
function loadExport(d) {
  const s = JSON.parse(readFileSync(join(d, 'snapshot.json'), 'utf8'));
  return { cat: catalogue(s.cat.map((t) => ({ ...t, bytes: String(t.bytes), pk: t.pk ? JSON.stringify(t.pk) : null,
    cols: JSON.stringify(t.cols.map((c) => [c.n, c.ty, c.gen, c.nn, c.ident])) }))),
    fks: s.fks, rows: s.rows, pages: JSON.parse(readFileSync(join(d, 'pages.json'), 'utf8')) };
}

async function restoreInto(db, dir) {
  const { cat: catArr, rows } = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
  const pages = JSON.parse(readFileSync(join(dir, 'pages.json'), 'utf8'));
  const cat = new Map(catArr.map((t) => [t.t, t]));
  const mine = catalogue((await db.query(CAT_SQL)).rows);
  /* The exported JSON text goes to Postgres AS TEXT, one statement a table or page (<= ~11 MB). It is never parsed in
     JavaScript: JSON.parse turns numeric 0.50 into 0.5 and a bigint past 2^53 into a different number, and V1 caught
     exactly that on hr_hunt_stances.eat_at the first time this ran. */
  const insert = async (t, json) => {
    const m = mine.get(t);
    const cols = m.cols.filter((c) => !c.gen).map((c) => qi(c.n)).join(', ');
    const over = m.cols.some((c) => c.ident) ? ' overriding system value' : '';
    const r = await db.query(`with ins as (insert into public.${qi(t)} (${cols})${over} select ${cols}
      from json_populate_recordset(null::public.${qi(t)}, $1::json) returning 1) select count(*)::int as n from ins`, [json || '[]']);
    return Number(r.rows[0].n);
  };
  /* What the repo ALONE rebuilt, read before a row is replaced: V9 compares it with production, which is what a
     rebuild without any backup would run (the census pins seeded COUNTS; this compares their content). */
  const census = JSON.parse(readFileSync(join(ROOT, 'tests', 'restore-census.baseline.json'), 'utf8')).tables;
  const judged = [...mine.values()].filter((t) => ['seeded', 'operator_tunable'].includes(census[t.t]?.class));
  const semanticSql = judged.map((t) => tableBranch(t, 'semantic')).join('\nunion all\n');
  const rebuilt = new Map((await restoredRead(db, semanticSql)).map((r) => [r.name, r]));
  const tunables = new Map();
  for (const [t, s] of Object.entries(census)) {
    if (s.class === 'operator_tunable' && mine.has(t)) tunables.set(t, (await db.query(`select coalesce(json_agg(r__), '[]')::text as j from public.${qi(t)} r__`)).rows[0].j);
  }
  /* NOT VALID checks go on AFTER the rows, as pg_dump orders them. Production holds rows its own NOT VALID checks
     reject (player_ledger_gold_purse / _gold_kind: ledger rows written before the purse columns existed); a NOT VALID
     check still judges every INSERT, so loading first and re-adding after is the only order that restores them. */
  const notValid = (await db.query(`select format('%I.%I', n.nspname, r.relname) as t, c.conname, pg_get_constraintdef(c.oid) as d
    from pg_constraint c join pg_class r on r.oid = c.conrelid join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public' and c.contype = 'c' and not c.convalidated`)).rows;
  for (const c of notValid) await db.exec(`alter table ${c.t} drop constraint ${qi(c.conname)}`);
  let loaded = 0;
  await db.exec('set session_replication_role = replica');
  const wipe = [...mine.keys()].filter((t) => !SECRET_COLS[t]).map((t) => `public.${qi(t)}`);
  await db.exec(`truncate table auth.users, ${wipe.join(', ')}`);
  const au = kindRows(rows, 'auth')[0];
  await db.query('insert into auth.users (id, aud, role, instance_id) select id, aud, role, instance_id from json_populate_recordset(null::auth.users, $1::json)', [au.j || '[]']);
  for (const r of kindRows(rows, 'rows')) {
    if (SECRET_COLS[r.name] || !mine.has(r.name)) continue;
    loaded += await insert(r.name, r.j);
  }
  for (const p of pages) {
    for (let i = 1; i <= p.pages; i++) loaded += await insert(p.t, readFileSync(join(dir, `${p.t}.${String(i).padStart(4, '0')}.json`), 'utf8'));
  }
  for (const s of kindRows(rows, 'seq')) {
    if (s.n === null) continue;
    const ok = (await db.query('select to_regclass($1) is not null as ok', [s.name])).rows[0].ok;
    if (ok) await db.query('select setval($1::regclass, $2::bigint, true)', [s.name, s.n]);
  }
  for (const v of (await db.query("select format('%I.%I', schemaname, matviewname) as v from pg_matviews where schemaname = 'public'")).rows) {
    await db.exec(`refresh materialized view ${v.v}`);
  }
  await db.exec('set session_replication_role = origin');
  for (const c of notValid) await db.exec(`alter table ${c.t} add constraint ${qi(c.conname)} ${c.d}`);
  const restored = new Map((await restoredRead(db, semanticSql)).map((r) => [r.name, r]));
  return { cat, mine, loaded, census, rebuilt, restored, tunables, note: `${loaded} rows + ${Number(au.n)} auth ids loaded from ${dir}` };
}

// ── THE PROOFS. Each returns a list of findings; [] is green. ─────────────
/* Every proof reads inside its own transaction and rolls it back. Under a mutant the proof already runs INSIDE the
   mutant's transaction, so it must nest as a savepoint: a plain rollback there undid the mutant before the proof's
   second read (measured: "a check never re-added" read green on the selftest). */
let IN_MUTANT = false;
const open = (db, extra = '') => db.exec(IN_MUTANT ? `savepoint p__; ${extra}` : `begin; ${extra}`);
const close = (db) => db.exec(IN_MUTANT ? 'rollback to savepoint p__' : 'rollback');
const restoredRead = async (db, sql) => { await open(db, GUCS); try { return (await db.query(sql)).rows; } finally { await close(db); } };
async function v1rows(db, ex, mine) {
  const f = [];
  const want = new Map(kindRows(ex.rows, 'rows').map((r) => [r.name, r]));
  for (const p of kindRows(ex.rows, 'paged')) want.set(p.name, p);
  for (const p of ex.pages) if (p.n !== p.want_n || p.h !== p.want_h) f.push(`export: ${p.t} pages hold ${p.n} rows, the snapshot ${p.want_n} (hash ${p.h === p.want_h ? 'equal' : 'differs'})`);
  const got = new Map((await restoredRead(db, [...mine.values()].map((t) => tableBranch(t, 'hash')).join('\nunion all\n'))).map((r) => [r.name, r]));
  for (const [t, w] of want) {
    const g = got.get(t);
    if (!g) { f.push(`${t}: in production, NOT in the rebuild (the repo cannot recreate it)`); continue; }
    if (SECRET_COLS[t]) { if (g.n !== w.n) f.push(`${t}: ${w.n} rows in production, ${g.n} rebuilt`); continue; }
    if (g.n !== w.n || g.h !== w.h) f.push(`${t}: production ${w.n} rows, restored ${g.n}${g.n === w.n ? ' (same count, DIFFERENT CONTENT)' : ''}`);
  }
  for (const t of got.keys()) if (!want.has(t)) f.push(`${t}: in the rebuild, not in production`);
  const au = kindRows(ex.rows, 'auth')[0];
  const [ag] = await restoredRead(db, `select count(*)::text as n, ${AUTH_HASH}::text as h from auth.users r__`);
  if (ag.n !== au.n || ag.h !== au.h) f.push(`auth.users: production ${au.n} ids, restored ${ag.n}`);
  for (const t of ex.cat.values()) {
    const m = mine.get(t.t); if (!m) continue;
    const sig = (x) => x.cols.map((c) => `${c.n}:${c.ty}:${c.gen}:${c.nn}`).join(',');
    if (sig(m) !== sig(t)) f.push(`${t.t}: columns differ between production and the rebuild`);
    if (m.p !== t.p) f.push(`${t.t}: persistence ${t.p} in production, ${m.p} rebuilt`);
  }
  return f;
}
async function v2graph(db, ex) {
  const fks = (await db.query(FK_SQL)).rows;
  const got = new Map((await restoredRead(db, orphanBranches(fks).join('\nunion all\n'))).map((r) => [r.name, r.n]));
  const f = [];
  for (const o of kindRows(ex.rows, 'orphan')) {
    if (!got.has(o.name)) { f.push(`FK ${o.name}: in production, not in the rebuild`); continue; }
    if (got.get(o.name) !== o.n) f.push(`FK ${o.name}: ${o.n} orphan row(s) in production, ${got.get(o.name)} restored`);
  }
  for (const k of got.keys()) if (!kindRows(ex.rows, 'orphan').some((o) => o.name === k)) f.push(`FK ${k}: in the rebuild, not in production`);
  return f;
}
/* THE CLOCK ECHO. The restored clock is pinned to production's now() through Date.now, which has millisecond grain,
   while production's now() has microseconds; an envelope field that IS now() (`now`, stamina.at) renders
   …02.60608 there and …02.606 here. That exact pair, and only it, is equal. */
let CLOCK = null;
function diffJson(a, b, path, out) {
  if (out.length >= 6) return;
  if (CLOCK && a === CLOCK.live && b === CLOCK.restored) return;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${path}: ${JSON.stringify(a)?.slice(0, 60)} vs ${JSON.stringify(b)?.slice(0, 60)}`); return; }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffJson(a[k], b[k], `${path}.${k}`, out);
}
async function v3envelopes(db, ex) {
  const live = JSON.parse(kindRows(ex.rows, 'fence')[0].j);
  const pin = Date.parse(live);
  const f = [];
  const real = Date.now;
  Date.now = () => pin;
  try {
    const restored = JSON.parse((await db.query('select to_json(now())::text as n')).rows[0].n);
    if (Date.parse(restored) !== pin) return [`clock pin did not take: restored now() ${restored}, production ${live}`];
    CLOCK = { live, restored };
    for (const e of kindRows(ex.rows, 'env')) {
      const [u, s] = e.name.split(':');
      const [r] = (await db.query('select public.hr_state_of($1::uuid, $2::int)::text as j', [u, Number(s)])).rows;
      const d = []; diffJson(JSON.parse(e.j), JSON.parse(r.j), '$', d);
      if (d.length) f.push(`hero ${u.slice(0, 8)}:${s} envelope differs: ${d.join('; ')}`);
    }
  } finally { Date.now = real; CLOCK = null; }
  return f;
}
function v4census(db, ex, dir) {
  return async () => {
    const f = [];
    const gen = spawnSync(process.execPath, ['tests/restore-census.mjs', '--live-sql'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
    if (gen.status !== 0) return [`census --live-sql exited ${gen.status}`];
    let sql = gen.stdout.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').trim().replace(/;\s*$/, '');
    for (const r of ['auth.identities', 'auth.sessions', 'auth.refresh_tokens', 'storage.buckets', 'storage.objects', 'supabase_migrations.schema_migrations', 'pg_stat_activity']) {
      if (!(await db.query('select to_regclass($1) is not null as ok', [r])).rows[0].ok) sql = sql.split(`from ${r}`).join('from (select 1 where false) as missing__');
    }
    const rows = (await restoredRead(db, sql)).map((r) => ({ kind: r.kind, name: r.name, n: Number(r.n), txt: r.txt }));
    writeFileSync(join(dir, 'census-restored.json'), JSON.stringify(rows));
    const cmp = spawnSync(process.execPath, ['tests/restore-census.mjs', '--live-compare', join(dir, 'census-restored.json')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
    if (cmp.status !== 0) f.push(`census --live-compare on the restored rows exited ${cmp.status}: ${(cmp.stderr.match(/· [^\n]+/g) || [cmp.stderr.slice(-300)]).join(' | ')}`);
    // Jobs the census records as scheduled by a real rebuild but invisible to PGlite (no pg_cron / pg_net extension).
    const notObs = Object.keys(JSON.parse(readFileSync(join(ROOT, 'tests', 'restore-census.baseline.json'), 'utf8')).cron?.not_observable_in_replay || {});
    const prodCron = kindRows(ex.rows, 'cron').filter((c) => !notObs.includes(c.name)).map((c) => `${c.name} | ${c.j}`);
    const mineCron = new Set((await db.query("select jobname || ' | ' || schedule || ' | ' || trim(command) as c from cron.job")).rows.map((r) => r.c));
    for (const c of prodCron) if (!mineCron.has(c)) f.push(`cron job on production a rebuild does not produce: ${c.split(' | ').slice(0, 2).join(' ')}`);
    return f;
  };
}
async function v5grants(db, ex) {
  const f = [];
  try { await restoredRead(db, 'select public.hr_assert_grant_hygiene(true)::text as j'); } catch (e) { f.push(`hr_assert_grant_hygiene(true) raised: ${String(e.message).split('\n')[0]}`); }
  const [r] = await restoredRead(db, 'select public.hr_assert_grant_hygiene(false)::text as j');
  const live = kindRows(ex.rows, 'hygiene')[0];
  // platform_schema_defacls_open is the function's own "residual, reported only" arm: supabase_admin's default ACL on
  // public, a platform role a local rebuild does not have. It is never a finding there and is not one here.
  const strip = (j) => { const o = JSON.parse(j); delete o.platform_schema_defacls_open; return o; };
  const d = []; diffJson(strip(live.j), strip(r.j), '$', d);
  if (d.length) f.push(`grant hygiene report differs from production's: ${d.join('; ')}`);
  return f;
}
async function v6rls(db, ex, mine) {
  const f = [];
  const fresh = catalogue((await db.query(CAT_SQL)).rows);
  for (const t of ex.cat.values()) {
    const m = fresh.get(t.t); if (!m) continue;
    if (m.rls !== t.rls) f.push(`${t.t}: RLS ${t.rls} in production, ${m.rls} restored`);
    if (m.cols.some((c) => c.n === 'user_id') && m.rls !== 'true') f.push(`${t.t}: carries user_id and RLS is OFF`);
  }
  const want = new Map(kindRows(ex.rows, 'policy').map((p) => [p.name, p.j]));
  const got = new Map((await restoredRead(db, schemaBranches()[0])).map((p) => [p.name, p.j]));
  for (const [k, v] of want) if (got.get(k) !== v) f.push(`policy ${k}: ${got.has(k) ? 'differs' : 'missing'} after restore`);
  for (const k of got.keys()) if (!want.has(k)) f.push(`policy ${k}: in the rebuild, not in production`);
  return f;
}
/* Divergences this drill MEASURED and graded harmless, each with what was measured. Anything else is red. A real code
   difference is never graded here: it is a restore that would run a different game. */
const GRADED = {
  'function bug_report_submit__ungated(p_summary text, p_description text, p_build text, p_state jsonb, p_errors jsonb, p_idem_key text)':
    '2026-11-14: comments only. With -- comments stripped both bodies are the same 3,737 characters.',
  'constraint hr_bounty_monsters.hr_bounty_monsters_hp_check':
    '2026-11-14: a fresh rebuild creates the table with an inline check (hp >= 1), auto-named _hp_check, then adds '
    + '_hp_chk; production only took the additive _hp_chk. The same condition twice, rebuild only.',
};
async function v7code(db, ex) {
  const want = new Map(kindRows(ex.rows, 'fn').map((p) => [p.name, p.h]));
  const got = new Map((await restoredRead(db, schemaBranches()[1])).map((p) => [p.name, p.h]));
  const f = [];
  const graded = new Set(JSON.parse(readFileSync(join(ROOT, 'tests', 'live-hash-drift.baseline.json'), 'utf8')).functions
    .filter((e) => e.agree === false && e.why).map((e) => e.sig));
  for (const [k, v] of want) {
    if (got.get(k) === v || (got.has(k) && (graded.has(k) || GRADED[`function ${k}`]))) continue;
    f.push(`function ${k}: ${got.has(k) ? 'body differs from production' : 'missing from the rebuild'}`);
  }
  for (const k of got.keys()) if (!want.has(k)) f.push(`function ${k}: in the rebuild, not in production`);
  const cw = new Map(kindRows(ex.rows, 'con').map((c) => [c.name, `${c.n}/${c.h}`]));
  const cg = new Map((await restoredRead(db, schemaBranches()[3])).map((c) => [c.name, `${c.n}/${c.h}`]));
  for (const [k, v] of cw) if (cg.get(k) !== v) f.push(`constraint ${k}: ${cg.has(k) ? `production ${v}, restored ${cg.get(k)} (validated/md5)` : 'missing after restore'}`);
  for (const k of cg.keys()) if (!cw.has(k) && !GRADED[`constraint ${k}`]) f.push(`constraint ${k}: in the rebuild, not in production`);
  return f;
}
async function v8player(db, ex) {
  const f = [];
  const heroes = kindRows(ex.rows, 'env').map((e) => e.name.split(':')).slice(0, 3);
  for (const [u, s] of heroes) {
    await open(db);
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [u]);
      await db.exec('set local role authenticated');
      const [r] = (await db.query('select public.hr_load($1::int)::text as j', [Number(s)])).rows;
      const env = JSON.parse(r.j);
      if (env?.ok !== true) f.push(`hr_load as hero ${u.slice(0, 8)}:${s} did not answer ok: ${r.j.slice(0, 120)}`);
      let seen = 0;
      try { seen = Number((await db.query('select count(*)::int as n from public.player_state where user_id <> $1::uuid', [u])).rows[0].n); } catch { seen = 0; }
      if (seen) f.push(`as hero ${u.slice(0, 8)} another player's ${seen} player_state row(s) are readable`);
    } catch (e) { f.push(`hr_load as hero ${u.slice(0, 8)}:${s} raised: ${String(e.message).split('\n')[0]}`); }
    finally { await close(db); }
  }
  if (!heroes.length) f.push('no hero to round-trip');
  return f;
}

/* V9: a seeded catalogue the repo rebuilds to production's COUNT but different CONTENT is a different game under the
   restored players' rows. Operator-tunable rows a rebuild reverts are listed (not red): the census live_value is their
   source, and this list is what an operator re-applies after a rebuild with no backup. */
function v9rebuild(ex, ld) {
  const f = []; const reverts = [];
  const prodRows = new Map(kindRows(ex.rows, 'rows').map((r) => [r.name, r.j]));
  for (const [t, s] of Object.entries(ld.census)) {
    const w = ld.restored.get(t); const g = ld.rebuilt.get(t);   // production's rows (V1-proven) vs the repo alone
    if (!w || !g || (w.n === g.n && w.h === g.h)) continue;
    if (s.class === 'seeded') f.push(`seeded ${t}: production ${w.n} rows, the repo rebuilds ${g.n}${w.n === g.n ? ' with DIFFERENT CONTENT' : ''}`);
    if (s.class === 'operator_tunable') {
      const meta = ld.mine.get(t);
      const pk = meta.pk ? meta.pk.map(([c]) => c) : meta.cols.map((c) => c.n);
      const keep = meta.cols.filter((c) => !isStamp(c)).map((c) => c.n);
      const byKey = (j) => new Map(JSON.parse(j || '[]').map((r) => [pk.map((c) => r[c]).join('/'), r]));
      const P = byKey(prodRows.get(t)); const R = byKey(ld.tunables.get(t));
      const d = [];
      for (const k of new Set([...P.keys(), ...R.keys()])) {
        if (!R.has(k)) { d.push(`[${k}] only on production`); continue; }
        if (!P.has(k)) { d.push(`[${k}] only in the rebuild`); continue; }
        for (const c of keep) if (JSON.stringify(P.get(k)[c]) !== JSON.stringify(R.get(k)[c])) d.push(`[${k}].${c} ${JSON.stringify(P.get(k)[c])} -> ${JSON.stringify(R.get(k)[c])}`);
      }
      reverts.push(`${t}: ${d.join('; ')}`);
    }
  }
  return { f, reverts };
}

/* THE MUTANTS: each plants one defect in the restored copy inside a transaction that is rolled back, and names the
   proof that must catch it. A proof that stays green under its mutant is not a proof. */
const MUTANTS = [
  ['a lost ledger row', 'v1', "set local session_replication_role = replica; delete from public.player_ledger where id = (select max(id) from public.player_ledger)"],
  ['a changed hero', 'v3', "update public.player_state set version = version + 1 where (user_id, slot) = (select user_id, slot from public.player_state order by user_id, slot limit 1)"],
  ['an orphaned hero', 'v2', "set local session_replication_role = replica; delete from auth.users where id = (select user_id from public.player_state order by user_id limit 1)"],
  ['RLS off a player table', 'v6', 'alter table public.player_inventory disable row level security'],
  ['a leaked grant', 'v5', 'grant execute on function public.hr_state_of(uuid, integer) to anon'],
  ['a definer turned invoker', 'v7', 'alter function public.hr_state_of(uuid, integer) security invoker'],
  ['a check never re-added', 'v7', 'alter table public.player_ledger drop constraint player_ledger_gold_purse'],
];
/* The control plants nothing and must NOT be caught by any proof: a harness that reports everything as caught is no
   proof of anything. */
const CONTROL = ['control: nothing planted', 'every', 'select 1'];
/* Caught means a finding the UNMUTATED run did not have: a proof that is already red (a real drift) would otherwise
   "catch" every mutant planted under it, which is how V7's mutants first read caught on production. */
async function mutate(db, proofs, before, pin) {
  const out = [];
  const real = Date.now;
  for (const [name, proof, sql] of [...MUTANTS, CONTROL]) {
    // now() is the OUTER transaction's start, so the clock is pinned before it opens, or V3 reads the real clock.
    Date.now = () => pin;
    await db.exec('begin');
    Date.now = real;
    IN_MUTANT = true;
    let caught = false;
    try {
      await db.exec(sql);
      for (const k of proof === 'every' ? Object.keys(proofs) : [proof]) {
        const fresh = (await proofs[k]()).find((x) => !(before[k] || []).includes(x));
        if (fresh) caught = proof === 'every' ? `${k}: ${fresh.slice(0, 160)}` : true;
      }
    } catch (e) { caught = `harness: ${String(e.message).split('\n')[0]}`; }
    finally { IN_MUTANT = false; await db.exec('rollback'); }
    // The control's verdict is inverted: green means nothing new was found.
    out.push([name, proof, proof === 'every' ? (caught === false ? true : `CAUGHT WITH NOTHING PLANTED (${caught})`) : caught]);
  }
  return out;
}

async function main() {
  const selftest = flag('selftest');
  const keep = argOf('keep');
  const from = argOf('from');
  const dir = keep || join(tmpdir(), `hr-restore-drill-${Date.now()}`);
  let src = null; let srcDb = null;
  if (selftest) {
    PAGE_BYTES = 8192; PAGE_ROWS = 7;
    const { db } = await bootReplay();
    srcDb = db;
    const u = '000000d1-0000-4000-a000-0000000d0001';
    await db.exec(`insert into auth.users (id) values ('${u}')`);
    await db.exec(`begin; select set_config('request.jwt.claim.sub', '${u}', true); set local role authenticated; select public.hr_create_character(0);`
      + ` select public.hr_character_name_set(0, 'Drill Hero', '000000d1-0000-4000-a000-0000000d00ff'); commit;`);
    src = replaySource(db);
  } else if (!from) src = liveSource();

  let posture = null;
  if (src?.live) {
    posture = await step('0 backups + prices (API)', () => backups(src));
    if (flag('backups')) { report(posture, null, [], [], null); process.exit(posture.healthy ? 0 : 1); }
    const m = new Date().getUTCMinutes();
    if (m >= 5 && m < 10) { console.log('waiting out hr-ledger-prune (:07) so the ledger pages and the snapshot agree…'); await new Promise((r) => setTimeout(r, (10 - m) * 60e3)); }
  }
  mkdirSync(dir, { recursive: true });
  const tAll = performance.now();
  const ex = from ? loadExport(from) : await exportFrom(src, dir);
  const { db } = await step('2 rebuild: schema + catalogues from the repo (bootReplay)', async () => ({ ...(await bootReplay()), note: 'PGlite (PostgreSQL 18), the repo chain' }));
  const ld = await step('3 load: rows from the export files', () => restoreInto(db, from || dir));
  const rto = Math.round(performance.now() - tAll);
  const census = v4census(db, ex, dir);
  const proofs = {
    v1: () => v1rows(db, ex, ld.mine), v2: () => v2graph(db, ex), v3: () => v3envelopes(db, ex), v5: () => v5grants(db, ex),
    v6: () => v6rls(db, ex, ld.mine), v7: () => v7code(db, ex), v8: () => v8player(db, ex),
  };
  const results = []; const before = {};
  for (const [k, label] of [['v1', 'V1 rows: count + content hash, every table'], ['v2', 'V2 graph: FK orphans equal production'],
    ['v3', 'V3 envelopes: hr_state_of, every hero, same instant'], ['v5', 'V5 grants: hr_assert_grant_hygiene'], ['v6', 'V6 RLS: flags + policies'],
    ['v7', 'V7 code: function bodies + constraints'], ['v8', 'V8 a player: hr_load as authenticated + isolation']]) {
    const r = await step(`4 ${label}`, async () => { const f = await proofs[k](); return { f, note: f.length ? `RED ${f.length}` : 'green' }; });
    results.push([label, r.f]); before[k] = r.f;
  }
  /* V4 judges the restored rows against what the census MEASURED on production (operator-tunable live values, cron);
     a replay standing in for production holds the authored defaults instead, so the selftest skips it. */
  if (!selftest) {
    const c = await step('4 V4 census: restore-census --live-compare on the restored rows', async () => { const f = await census(); return { f, note: f.length ? `RED ${f.length}` : 'green' }; });
    results.push(['V4 census', c.f]);
  }
  const v9 = await step('4 V9 rebuild alone: seeded content equals production', async () => { const r = v9rebuild(ex, ld); return { ...r, note: r.f.length ? `RED ${r.f.length}` : 'green' }; });
  results.push(['V9 rebuild alone', v9.f]);
  const muts = (flag('mutate') || selftest) ? await mutate(db, proofs, before, Date.parse(JSON.parse(kindRows(ex.rows, 'fence')[0].j))) : null;
  const outside = kindRows(ex.rows, 'outside').map((o) => `${o.name} ${o.n}`);
  const unlogged = [...ex.cat.values()].filter((t) => t.p === 'u').map((t) => t.t);
  report(posture, rto, results, muts, { outside, unlogged, dir, from, loaded: ld.loaded, src: src ? src.name : `the export in ${from}`, reverts: v9.reverts });
  if (!keep) rmSync(dir, { recursive: true, force: true });
  if (srcDb) await srcDb.close();
  await db.close();
  const red = results.some(([, f]) => f.length) || (muts && muts.some(([, , ok]) => ok !== true));
  process.exit(red ? 1 : 0);
}

function report(posture, rto, results, muts, x) {
  console.log('\nRESTORE DRILL — timed steps');
  for (const [name, ms, note] of T) console.log(`  ${name.padEnd(62)} ${String(ms).padStart(8)} ms  ${note}`);
  if (posture) {
    console.log(`\nBACKUPS: ${posture.healthy ? 'healthy' : 'UNHEALTHY'} — ${posture.note}. Loss window today: ${posture.pitr_enabled ? 'minutes (PITR)' : 'up to 24 h (daily, ~10:28 UTC)'}.`);
    console.log(`REAL DRILL PRICE: Restore to a New Project on ${posture.compute} compute at $${posture.compute_per_h}/h = ~$${posture.drill_3h_usd} for 3 h (dashboard click, no API).`
      + ` PITR-7 is $${posture.pitr7_month_usd}/month on top. Neither is spent by this tool.`);
  }
  if (rto !== null) console.log(`\nRTO OF THIS PATH (${x?.from ? 'rebuild + load of a kept export' : 'export start -> restored database loaded'}): ${(rto / 1000).toFixed(1)} s`);
  for (const [label, f] of results) for (const line of f) console.log(`  RED ${label}: ${line}`);
  if (results.length && !results.some(([, f]) => f.length)) console.log('  every proof green');
  if (results.length) for (const [k, why] of Object.entries(GRADED)) console.log(`  graded, not red: ${k.split('(')[0]} — ${why}`);
  const word = (proof) => (proof === 'every' ? 'clean' : 'caught');
  if (muts) for (const [name, proof, ok] of muts) console.log(`  mutant ${name.padEnd(26)} -> ${proof} ${ok === true ? word(proof) : ok === false ? 'NOT CAUGHT' : ok}`);
  if (x) {
    console.log(`\nNOT CARRIED BY THIS PATH (source: ${x.src}): hr_server_secrets values; auth credentials/identities (ids only);`
      + ` vault.secrets; the hr_engine_login password and Edge Function secrets (no backup carries them); Storage objects;`
      + ` unlogged tables restore EMPTY from a physical backup: ${x.unlogged.join(', ') || 'none'}.`);
    if (x.outside.length) console.log(`  outside public on production: ${x.outside.join(', ')}`);
    if (x.reverts.length) {
      console.log('A REBUILD WITH NO BACKUP REVERTS THESE OPERATOR VALUES (production first, then the repo default; re-apply from the census live_value):');
      for (const r of x.reverts) console.log(`  ${r}`);
    }
  }
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(String(e.stack || e)); process.exit(2); });
}
