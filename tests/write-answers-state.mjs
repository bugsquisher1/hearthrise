#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/write-answers-state.mjs — A CLIENT WRITE ANSWERS WITH THE STATE IT CHANGED
// (architecture audit 2026-11-18, new rule 11; CLAUDE.md §6)
//
//   node tests/write-answers-state.mjs             the guard (replays the chain: tests/schema-replay.mjs)
//   node tests/write-answers-state.mjs --list      every client RPC and how it was judged
//   node tests/write-answers-state.mjs --write     SHRINK the allowlist to what still needs it (never grows it)
//   node tests/write-answers-state.mjs --selftest  planted defects, each must be named; a clean control must pass
//
// mutant-anchors: none — --selftest plants rows into the judge's input in memory, never a file
//
// ── THE COST THIS RULE REMOVES ─────────────────────────────────────────────
// The client sends an intent and applies the envelope the server returns
// (CLAUDE.md §1, §6). When a write answers only {ok:true}, the client has to
// ask again: src/session/character-session.js _settled() runs a follow-up
// hr_load after every write whose answer does not CARRY the envelope. That is
// a second round trip and a second full projection (hr_state_of rebuilds the
// whole character) for every press, and the DB CPU wall in the 2026-11-19
// server audit (tools/qa/audit-2026-11-19-server/findings.md, wall 1) is spent
// exactly there. A write that answers with its envelope costs one call.
//
// ── WHAT IS JUDGED ─────────────────────────────────────────────────────────
// The client surface is public.hr_client_rpc_baseline as the chain builds it
// (the grant-hygiene contract, CLAUDE.md §6). Each function's body is read from
// the replay (bodies are patched by later files; only the chain end is truth):
//   PROJECTED  the tables the envelope is built from: every public table named
//            after from/join in hr_state_of's body, in the bodies of the public
//            functions it calls (one level), and in every section function the
//            registry public.hr_state_sections names, read from the replay.
//   WRITE    volatile, and the body (comments stripped) writes a PROJECTED table
//            (insert into / update / delete from) or calls hr_apply. A write that
//            touches only tables the envelope does not carry (chat, friends,
//            presence, the idempotency journal) answers with its own result and
//            is judged 'other': there is no envelope for it to carry.
//   CARRIES  the body builds its answer from the projection: hr_state_of( or
//            hr_apply( (which returns the envelope it computed).
// A WRITE that does not CARRY is red unless it is on the allowlist in
// tests/write-answers-state.baseline.json, which only SHRINKS: an entry whose
// function now carries, or is no longer on the client surface, is red as STALE
// until --write removes it. A new write RPC cannot join the list by --write; an
// entry is added by hand with its reason, which is the reviewable diff.
//
// ── WHAT IT CANNOT SEE ─────────────────────────────────────────────────────
// It reads text: a body that calls hr_state_of on a path the answer never
// returns would pass. The client half (which verbs send carries=true to
// _ask) is src/session's; tests/session-core.mjs owns it.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, bootReplay } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';

const BASELINE = join(ROOT, 'tests', 'write-answers-state.baseline.json');
const argv = process.argv.slice(2);

const stripComments = (src) => String(src || '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
const CARRIES = /\bhr_state_of\s*\(|\bhr_apply\s*\(/i;
const tableName = (s) => s.replace(/^public\./i, '').replace(/"/g, '').toLowerCase();
const dmlTargets = (body) => new Set([...body.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+([\w."]+)/gi)].map((m) => tableName(m[1])));

/**
 * @param {{key:string, volatile:string, src:string}[]} fns  the client surface, bodies from the replay
 * @param {Record<string,string>} allow  the allowlist (only shrinks)
 * @param {Set<string>} projected  the tables the envelope is built from
 */
export function judge(fns, allow, projected) {
  const red = []; const stale = []; const rows = [];
  const seen = new Set();
  for (const f of fns) {
    const body = stripComments(f.src);
    const touches = [...dmlTargets(body)].filter((t) => projected.has(t));
    const write = f.volatile === 'v' && (touches.length > 0 || /\bhr_apply\s*\(/i.test(body));
    const carries = CARRIES.test(body);
    seen.add(f.key);
    const verdict = !write ? 'other' : carries ? 'carries' : (allow[f.key] ? 'allowed' : 'RED');
    rows.push({ key: f.key, verdict });
    if (verdict === 'RED') red.push(f.key);
    if (allow[f.key] && verdict !== 'allowed') stale.push(`${f.key} (${verdict === 'carries' ? 'now answers with the envelope' : 'writes nothing the envelope carries'})`);
  }
  for (const k of Object.keys(allow)) if (!seen.has(k)) stale.push(`${k} (no longer on the client surface)`);
  return { red, stale, rows };
}

async function surface() {
  const { db } = await bootReplay({ raw: true });
  const rows = (await db.query(`
    select distinct b.proname || '(' || b.identity_args || ')' as key, p.provolatile::text as volatile, p.prosrc as src
      from public.hr_client_rpc_baseline b
      join pg_proc p on p.proname = b.proname and p.pronamespace = 'public'::regnamespace
       and pg_get_function_identity_arguments(p.oid) = b.identity_args
     order by 1`)).rows;
  // The envelope's tables: hr_state_of's own body and the public functions it calls, one level.
  const tables = new Set((await db.query(`select c.relname::text as t from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v')`)).rows.map((r) => r.t));
  const src = async (name) => (await db.query(`select string_agg(p.prosrc, E'\\n') as s from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [name])).rows[0].s || '';
  const top = stripComments(await src('hr_state_of'));
  if (!top.trim()) { const e = new Error('hr_state_of is not in the replay: the projection cannot be read'); e.harness = true; throw e; }
  const called = new Set([...top.matchAll(/\bpublic\.(hr_[a-z0-9_]+)\s*\(/gi)].map((m) => m[1].toLowerCase()));
  // The section registry (hr_state_sections key -> fn) builds most of the envelope by name, not by a call in the text.
  if ((await db.query("select to_regclass('public.hr_state_sections') is not null as t")).rows[0].t) {
    for (const r of (await db.query('select fn from public.hr_state_sections')).rows) called.add(String(r.fn).replace(/^public\./, '').toLowerCase());
  }
  let text = top;
  for (const fn of called) if (fn !== 'hr_state_of') text += '\n' + stripComments(await src(fn));
  const projected = new Set([...text.matchAll(/\b(?:from|join)\s+([\w."]+)/gi)].map((m) => tableName(m[1])).filter((t) => tables.has(t)));
  if (!projected.has('player_state')) { const e = new Error(`the projection's tables were not found (${[...projected].join(', ') || 'none'})`); e.harness = true; throw e; }
  return { fns: rows, projected };
}

const loadAllow = () => (existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).allow || {} : null);

function selftest(fns, allow, projected) {
  const fails = [];
  const expect = (label, got, cond) => { console.log(`  ${cond ? 'caught' : 'SLIPPED'}  ${label}${got ? `  (${got})` : ''}`); if (!cond) fails.push(label); };
  const clean = judge(fns, allow, projected);
  expect('CONTROL: the real surface against the real allowlist is green', `${clean.red.length} red, ${clean.stale.length} stale`,
    !clean.red.length && !clean.stale.length);
  const planted = { key: 'hr_planted_write(p_slot integer, p_idem uuid)', volatile: 'v',
    src: "begin update public.player_state set gold = gold + 1 where user_id = auth.uid(); return jsonb_build_object('ok', true); end" };
  const a = judge([...fns, planted], allow, projected);
  expect('NEW: a client write that answers {ok:true} only is red', a.red.join(','), a.red.includes(planted.key));
  const commented = { ...planted, key: 'hr_planted_commented(p_slot integer)', src: planted.src.replace("return", "-- return public.hr_state_of(auth.uid(), 0);\n return") };
  const b = judge([...fns, commented], allow, projected);
  expect('NEW: hr_state_of in a COMMENT does not count as carrying', b.red.join(','), b.red.includes(commented.key));
  const allowedKey = Object.keys(allow)[0];
  if (allowedKey) {
    const healed = fns.map((f) => (f.key === allowedKey ? { ...f, src: `${f.src}\n return public.hr_state_of(auth.uid(), 0);` } : f));
    const c = judge(healed, allow, projected);
    expect('STALE: an allowlisted write that now carries the envelope must leave the list', c.stale.join(','), c.stale.some((s) => s.startsWith(allowedKey)));
    const gone = judge(fns.filter((f) => f.key !== allowedKey), allow, projected);
    expect('STALE: an allowlisted RPC no longer on the client surface must leave the list', gone.stale.join(','), gone.stale.some((s) => s.startsWith(allowedKey)));
  }
  const readOnly = { key: 'hr_planted_read(p_slot integer)', volatile: 's', src: "begin return (select jsonb_build_object('n', count(*)) from public.player_state); end" };
  const d = judge([...fns, readOnly], allow, projected);
  expect('CONTROL: a stable read is not judged a write', '', !d.red.includes(readOnly.key));
  return fails.length ? 1 : 0;
}

async function main() {
  const { fns, projected } = await surface();
  const allow = loadAllow();
  if (argv.includes('--selftest')) {
    if (!allow) { console.error('write-answers-state: no baseline (tests/write-answers-state.baseline.json)'); return 2; }
    return selftest(fns, allow, projected);
  }
  if (argv.includes('--write')) {
    const now = judge(fns, allow || {}, projected);
    const keep = {};
    if (!allow) {
      // First pin: today's debt, each with the reason it is allowed (to be paid down, never added to by --write).
      for (const r of now.rows) if (r.verdict === 'RED') keep[r.key] = 'pinned 2026-11-19 (rule 11 lands): answers without the envelope, so the client re-reads with hr_load';
    } else {
      for (const r of now.rows) if (r.verdict === 'allowed') keep[r.key] = allow[r.key];
      if (now.red.length) { console.error(`--write never adds: ${now.red.length} new write(s) answer without the envelope:\n  ${now.red.join('\n  ')}`); return 1; }
    }
    writeFileSync(BASELINE, JSON.stringify({ _readme: [
      'Client write RPCs that answer WITHOUT the envelope (tests/write-answers-state.mjs, CLAUDE.md §6 rule 11).',
      'This list only shrinks: --write removes entries that now carry; a new entry is added by hand with its reason.',
    ], allow: keep }, null, 1) + '\n');
    console.log(`write-answers-state: allowlist pinned at ${Object.keys(keep).length} (was ${allow ? Object.keys(allow).length : 'none'})`);
    return 0;
  }
  if (!allow) { console.error('write-answers-state: no baseline; run --write once'); return 2; }
  const { red, stale, rows } = judge(fns, allow, projected);
  if (argv.includes('--list')) { console.log(`  projected tables: ${[...projected].sort().join(' ')}`); for (const r of rows) console.log(`  ${r.verdict.padEnd(8)} ${r.key}`); }
  const n = (v) => rows.filter((r) => r.verdict === v).length;
  if (red.length || stale.length) {
    for (const k of red) console.error(`  RED    ${k}: a client write that answers without the envelope (the client re-reads with hr_load). Return public.hr_state_of(...) with ok:true.`);
    for (const s of stale) console.error(`  STALE  ${s}: remove it with  node tests/write-answers-state.mjs --write`);
    console.error(`\nwrite-answers-state: ${red.length} red, ${stale.length} stale (rule 11, CLAUDE.md §6)`);
    return 1;
  }
  console.log(`write-answers-state: green — ${rows.length} client RPCs: ${n('carries')} writes carry the envelope, `
    + `${n('allowed')} allowlisted (only shrinks), ${n('other')} reads or writes the envelope does not carry`);
  return 0;
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c)).catch((e) => { console.error(e.stack || e.message); process.exit(2); });
