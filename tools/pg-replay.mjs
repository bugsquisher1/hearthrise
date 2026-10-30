#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/pg-replay.mjs — THE CHAIN ON A REAL POSTGRES, THE PRODUCTION MAJOR VERSION, FOR MEASUREMENT.
//
//   node tools/pg-replay.mjs [--build]        build (or reuse) the chain template and print where it is
//   node tools/pg-replay.mjs --stop           stop the scratch server
//   import { bootPg } from './pg-replay.mjs'  a fresh database cloned from the chain, PGlite's { query, exec } shape
//
// WHY IT EXISTS (lane/c-settle-cost-2, 2026-10-30). tests/schema-replay.mjs replays the chain on PGlite, which is
// PostgreSQL 18; production is 17. Version 18 caches the plans of LANGUAGE sql functions; 17 parses, rewrites and
// plans a non-inlined SQL function's body again for every statement execution that calls it. Most of the hunt
// settle's helpers are SQL functions with `set search_path` (never inlined), so on PGlite their cost all but
// vanishes and a measurement there misses exactly the class that dominates production (measured live 10-30:
// hr_vitals_of 2.25 ms a call, five one-line SQL helpers 0.8-1.6 ms). This seam replays the SAME chain, in the SAME
// order, with the SAME fixture, scaffold and GUCs, on a local PostgreSQL 17 cluster, and hands back an object with
// PGlite's `query(text, params) -> { rows }` and `exec(text)` so tools/settle-cost.mjs and the settle guard's
// harness run on it unchanged.
//
// WHERE THE SERVER COMES FROM. HR_PG_BIN (a PostgreSQL bin directory; default: the Windows installer's 17, then
// Debian's /usr/lib/postgresql/17/bin). A scratch cluster under the OS temp dir (HR_PG_DATA overrides), trust auth on
// 127.0.0.1 only, port HR_PG_PORT (55417), fsync off: it is a measuring bench, never a store. The chain is built ONCE
// into a template database named by the hash of every byte it applies; each bootPg() clones it (seconds).
// Never touches production. Not a CI step (CI has no PostgreSQL 17 binaries; the PGlite replay stays the gate).
// ════════════════════════════════════════════════════════════════════════
import { existsSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { isMain } from '../tests/_is-main.mjs';
import { ROOT, chainFiles, manifest, SCAFFOLD, openTheGame, premiumPerCharacter } from '../tests/schema-replay.mjs';

const PORT = Number(process.env.HR_PG_PORT || 55417);
const DATA = process.env.HR_PG_DATA || join(tmpdir(), `hr-pg-replay-${PORT}`);
const BIN = [process.env.HR_PG_BIN, 'C:/Program Files/PostgreSQL/17/bin', '/usr/lib/postgresql/17/bin']
  .find((d) => d && existsSync(join(d, process.platform === 'win32' ? 'postgres.exe' : 'postgres')));
const exe = (n) => join(BIN, process.platform === 'win32' ? n + '.exe' : n);

/* PGlite's value parsing, so a harness written against PGlite reads the same values here: int8 a Number while it is
   safe, numeric a string, json/jsonb parsed, timestamps Dates (postgres.js's own defaults cover the rest). */
const TYPES = {
  /* a STRING bound to a json/jsonb parameter is the JSON text itself (PGlite's rule), never re-stringified */
  json: { to: 114, from: [114, 3802], serialize: (x) => (typeof x === 'string' ? x : JSON.stringify(x)), parse: (x) => JSON.parse(x) },
  int8: { to: 20, from: [20], serialize: (x) => String(x),
    parse: (x) => { const b = BigInt(x); return b < BigInt(Number.MIN_SAFE_INTEGER) || b > BigInt(Number.MAX_SAFE_INTEGER) ? b : Number(b); } },
};
const connect = (database, max = 1) => postgres({ host: '127.0.0.1', port: PORT, user: 'postgres', database, max,
  prepare: false, onnotice: () => {}, types: TYPES, connection: { application_name: 'hr-pg-replay' } });

async function ready() {
  for (let i = 0; i < 100; i++) {
    try { execFileSync(exe('pg_isready'), ['-h', '127.0.0.1', '-p', String(PORT)], { stdio: 'ignore' }); return; }
    catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  throw new Error(`pg-replay: no server on 127.0.0.1:${PORT} after 20 s`);
}

/** Start the scratch cluster (initdb once). Detached: the server outlives this process, as a bench should. */
export async function ensureServer() {
  if (!BIN) throw new Error('pg-replay: no PostgreSQL 17 binaries (set HR_PG_BIN to a bin directory)');
  try { execFileSync(exe('pg_isready'), ['-h', '127.0.0.1', '-p', String(PORT)], { stdio: 'ignore' }); return; } catch { /* start it */ }
  if (!existsSync(join(DATA, 'PG_VERSION'))) {
    mkdirSync(DATA, { recursive: true });
    execFileSync(exe('initdb'), ['-D', DATA, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
  }
  const opts = `-p ${PORT} -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off`
    + ' -c shared_buffers=256MB -c max_connections=30 -c max_locks_per_transaction=1024 -c track_functions=all';
  spawn(exe('pg_ctl'), ['-D', DATA, '-l', join(DATA, 'server.log'), '-o', opts, 'start'], { detached: true, stdio: 'ignore' }).unref();
  await ready();
}

/* The session the replay applies with (tests/schema-replay.mjs `session`): UTC, then the manifest's GUCs. */
async function sessionSql() {
  const gucs = Object.entries((await manifest()).gucs || {}).filter(([k]) => !k.startsWith('_'));
  return [`set time zone 'UTC'`, ...gucs.map(([k, v]) => `select set_config('${k.replace(/'/g, "''")}','${String(v).replace(/'/g, "''")}',false)`)];
}

/** The chain's template database (built once per byte-identical chain): its name. */
export async function chainTemplate({ log = () => {} } = {}) {
  await ensureServer();
  const fixture = await readFile(join(ROOT, 'tests', 'sql', 'pglite-fixture.sql'), 'utf8');
  const files = await chainFiles();
  const sources = [];
  for (const [name, path] of files) sources.push([name, (await readFile(path, 'utf8')).replace(/\r\n/g, '\n')]);
  const session = await sessionSql();
  const h = createHash('sha256');
  for (const part of ['pg-replay:1', fixture, SCAFFOLD, ...session, ...sources.flat()]) h.update(part).update('\0');
  const name = 'hr_chain_' + h.digest('hex').slice(0, 16);
  const admin = connect('postgres');
  try {
    const [have] = await admin`select 1 as ok from pg_database where datname = ${name}`;
    if (have) return name;
    const building = name + '_wip';
    await admin.unsafe(`drop database if exists ${building}`);
    await admin.unsafe(`create database ${building}`);
    const db = connect(building);
    const t0 = Date.now();
    try {
      for (const s of session) await db.unsafe(s);
      await db.unsafe(fixture);
      await db.unsafe(SCAFFOLD);
      for (const [file, text] of sources) {
        try { await db.unsafe(`begin;\n${text}\ncommit;`); }
        catch (e) { await db.unsafe('rollback').catch(() => {}); throw new Error(`pg-replay: ${file} failed to apply: ${String(e.message).split('\n')[0]}`); }
      }
      const shim = { exec: (t) => db.unsafe(t) };
      await openTheGame(shim);
      await premiumPerCharacter(shim);
    } finally { await db.end({ timeout: 5 }); }
    await admin.unsafe(`alter database ${building} rename to ${name}`);
    log(`pg-replay: built ${name} (${files.length} files) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    return name;
  } finally { await admin.end({ timeout: 5 }); }
}

/**
 * A FRESH DATABASE with the whole chain applied, on PostgreSQL 17, in PGlite's shape:
 * { query(text, params) -> { rows }, exec(text), close() }. One connection (session state — role, GUCs, an open
 * transaction — persists between calls, as on PGlite).
 */
export async function bootPg({ log } = {}) {
  const tpl = await chainTemplate({ log });
  const name = 'hr_m_' + randomUUID().replace(/-/g, '').slice(0, 12);
  const admin = connect('postgres');
  try { await admin.unsafe(`create database ${name} template ${tpl}`); } finally { await admin.end({ timeout: 5 }); }
  const sql = connect(name);
  for (const s of await sessionSql()) await sql.unsafe(s);
  const db = {
    async query(text, params) { const rows = await sql.unsafe(text, params || []); return { rows: Array.from(rows) }; },
    async exec(text) { return sql.unsafe(text); },
    async close() {
      await sql.end({ timeout: 5 });
      const a = connect('postgres');
      try { await a.unsafe(`drop database if exists ${name}`); } finally { await a.end({ timeout: 5 }); }
    },
  };
  return { db, name, template: tpl };
}

async function main() {
  if (process.argv.includes('--stop')) {
    execFileSync(exe('pg_ctl'), ['-D', DATA, '-m', 'fast', 'stop'], { stdio: 'inherit' });
    return;
  }
  const t = await chainTemplate({ log: console.log });
  const admin = connect(t);
  try {
    const [v] = await admin`select version() as v, (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public')::int as fns`;
    console.log(`pg-replay: ${t} on 127.0.0.1:${PORT} — ${v.v.split(',')[0]}, ${v.fns} public functions`);
  } finally { await admin.end({ timeout: 5 }); }
}
if (isMain(import.meta.url)) main().then(() => process.exit(0), (e) => { console.error(e && e.stack || e); process.exit(1); });
