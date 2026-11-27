#!/usr/bin/env node
// tests/frame-delta.mjs — A PUSHED FRAME CARRIES ONLY WHAT MOVED, AND THE CLIENT'S RECORD IS STILL THE SERVER'S WHOLE ENVELOPE
// (1076-frame-delta.sql + src/session/envelope.js frameOfDelta, lane/realtime-budget, systems-engineer, 2026-11-27; CLAUDE.md §6, §4 both paths).
//
//   node tests/frame-delta.mjs            the guard
//   node tests/frame-delta.mjs --mutate   the proof: each planted defect is refused by its named §6 arm or turns its case red
//
// THE MEASURE: the replayed chain (PGlite) with a stand-in realtime.send that records each message AND the server's whole projection
// at the instant it was sent (hr_state_of, in the sender's own transaction); the heavy four (one account, four heroes, Krell's Hold,
// tests/per-player-cost.mjs FIXTURES), every hero open in a client; frames read back through the client's own frameOfDelta.
//   FD-1 VIEWED (hero 0 on screen, asking; the shipped hello and settle, the engine's echo rule): on every topic every message, made whole
//        on the chain of the messages before it, IS the server's projection at its send, key for key; the first is whole, every later one a
//        delta; past each topic's first frame the bytes sent are at most FD_STEADY_MAX of the whole frames' (measured 2026-11-27: 0.37).
//   FD-2 BROWSER OPEN, NOBODY ASKING (the world tick's fires, presence on): the same, through the tick's commit point.
//   FD-3 BROWSER CLOSED (no presence): the tick settles the four and pushes nothing, and no memo row is written.
//   FD-4 A REBASE (hr_frame_rebase as the hero's owner) makes that hero's next frame whole; another hero's next one is still a delta.
//
// mutant-anchors: supabase/migrations/1076-frame-delta.sql src/session/envelope.js
// ci-step: db-replay | Frame deltas - only what moved, the client's record whole, viewed, tick and closed (1076)
// ci-run: node tests/frame-delta.mjs
// ci-run: node tools/mutant-gate.mjs node tests/frame-delta.mjs --mutate
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from './_is-main.mjs';
import { bootReplay, ROOT, LAST_PATCHED } from './schema-replay.mjs';
import { FIXTURES, measure } from './per-player-cost.mjs';
import { HARNESS as H } from './hunt-sessions-settle.mjs';
import { frameOfDelta } from '../src/session/envelope.js';

const OWN = '1076-frame-delta.sql';
export const FD_STEADY_MAX = 0.5;
const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');

/* A stable spelling of JSON for key-for-key equality (jsonb has no key order a client could rely on). */
const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v));

const STUB = `create schema if not exists realtime;
  create table if not exists realtime.fd_frames (n bigserial primary key, topic text, event text, payload jsonb, whole jsonb);
  create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
    language sql as $f$ insert into realtime.fd_frames (topic, event, payload, whole) values (topic, event, payload,
      case when payload->>'t' in ('state', 'delta') then public.hr_state_of(split_part(topic, ':', 2)::uuid, split_part(topic, ':', 3)::int) end) $f$;`;

/** The recorded messages of each topic, read back through the client's chain. Answers { problems, topics, sent, whole, steadySent, steadyWhole }. */
export async function readBack(db, label) {
  const rows = (await db.query(`select topic, payload, whole, octet_length(payload::text) as b,
      octet_length(jsonb_build_object('t', 'state', 'frame', payload->'frame', 'env', whole)::text) as wb
    from realtime.fd_frames where payload->>'t' in ('state', 'delta') order by n`)).rows;
  const by = new Map();
  for (const r of rows) { if (!by.has(r.topic)) by.set(r.topic, []); by.get(r.topic).push(r); }
  const problems = []; let sent = 0; let whole = 0; let steadySent = 0; let steadyWhole = 0;
  for (const [topic, list] of by) {
    let chain = null;
    list.forEach((r, i) => {
      const m = r.payload;
      const w = m.t === 'delta' ? frameOfDelta(chain, m) : m;
      if (i === 0 && m.t !== 'state') problems.push(`${label} ${topic.slice(-6)}: its first frame is a ${m.t}, not whole`);
      if (i > 0 && m.t !== 'delta') problems.push(`${label} ${topic.slice(-6)}: frame ${i + 1} (v${m.frame}) went whole with an unbroken chain`);
      if (!w) { problems.push(`${label} ${topic.slice(-6)}: frame ${i + 1} (v${m.frame}, base ${m.base}) could not be made whole on the chain (v${chain && chain.version})`); chain = null; return; }
      if (canon(w.env) !== canon(r.whole)) {
        const keys = [...new Set([...Object.keys(w.env), ...Object.keys(r.whole)])].filter((k) => canon(w.env[k]) !== canon(r.whole[k]));
        problems.push(`${label} ${topic.slice(-6)}: frame ${i + 1} (v${m.frame}) made whole is not the server's envelope (differs in ${keys.slice(0, 6).join(', ')})`);
      }
      chain = w.env;
      sent += Number(r.b); whole += Number(r.wb);
      if (i > 0) { steadySent += Number(r.b); steadyWhole += Number(r.wb); }
    });
  }
  return { problems, topics: by.size, frames: rows.length, sent, whole, steadySent, steadyWhole };
}

/** One door on the heavy four: 'watched' (hero 0 asks), 'tick' (open in a client, nobody asks), 'closed' (no client). */
async function runDoor(db, M, door) {
  await db.query('savepoint fd');
  try {
    await db.query('delete from realtime.fd_frames');
    const name = door === 'watched' ? 'krell4_L80_deadly_watched' : 'krell4_L80_deadly_closed';
    const fx = await FIXTURES[name].build(db, M);
    const [uid] = fx.heroes[0];
    /* the engine's own requests carry no JWT, and the asker's marker spares its own echo (index.ts, hr_frame_wanted) */
    await db.query(`select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true)`);
    await db.query(`select set_config('hr.frame_self', $1, true)`, [door === 'watched' ? uid.toLowerCase() + ':' + fx.heroes[0][1] : '']);
    await db.query('delete from public.character_presence where user_id = $1', [uid]);
    if (door !== 'closed') for (const [u, s] of fx.heroes) await db.query('insert into public.character_presence (user_id, slot, seen_at) values ($1, $2, now())', [u, s]);
    await measure(db, M, fx, door === 'watched' ? 'watched' : 'closed', null);
    const back = await readBack(db, door);
    const memos = Number((await db.query('select count(*)::int as n from public.hr_frame_memo where user_id = $1', [uid])).rows[0].n);
    let rebase = null;
    if (door === 'watched') {
      /* FD-4: hero 1's owner asks for a whole frame; then the emitter frames heroes 1 and 2 again (each its fresh projection) */
      await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`, [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
      const r = (await db.query('select public.hr_frame_rebase(1) as r')).rows[0].r;
      await db.query(`select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true), set_config('hr.frame_self', '', true)`);
      await db.query(`update public.player_state set version = version + 1 where user_id = $1 and slot in (1, 2)`, [uid]);
      await db.query('delete from realtime.fd_frames');
      await db.query('select public.hr_frame_send($1, 1, null), public.hr_frame_send($1, 2, null)', [uid]);
      const t = (await db.query(`select split_part(topic, ':', 3)::int as s, payload->>'t' as t from realtime.fd_frames order by n`)).rows;
      rebase = { answer: r, kinds: Object.fromEntries(t.map((x) => [x.s, x.t])) };
    }
    return { ...back, memos, rebase };
  } finally { await db.query('rollback to savepoint fd'); }
}

export async function run({ patches } = {}) {
  const { db } = await bootReplay(patches ? { patches, upTo: LAST_PATCHED } : undefined);
  await H.pinDice(db);
  const M = await H.loadEdge(H.ROOT);
  await db.exec(STUB);
  await db.query('update public.hr_tick_config set frame_push = true where id');
  const problems = [];
  const fail = (id, msg) => problems.push(`${id}: ${msg}`);
  await db.query('begin');
  try {
    const v = await runDoor(db, M, 'watched');
    for (const p of v.problems) fail('FD-1', p);
    if (v.topics !== 3 || v.frames < 6) fail('FD-1', `the viewed four pushed ${v.frames} frames on ${v.topics} topics (want the three heroes not asking, two frames or more each)`);
    const ratio = v.steadyWhole ? v.steadySent / v.steadyWhole : NaN;
    if (!(ratio <= FD_STEADY_MAX)) fail('FD-1', `past each topic's first frame the bytes sent are ${(ratio * 100).toFixed(1)}% of the whole frames' (most ${FD_STEADY_MAX * 100}%)`);
    if (!v.rebase || v.rebase.answer.ok !== true || v.rebase.kinds[1] !== 'state' || v.rebase.kinds[2] !== 'delta') fail('FD-4', `after hero 1's rebase the next frames were ${JSON.stringify(v.rebase)} (want 1 whole, 2 a delta)`);
    const t = await runDoor(db, M, 'tick');
    for (const p of t.problems) fail('FD-2', p);
    if (t.topics !== 4 || t.frames < 8) fail('FD-2', `the tick pushed ${t.frames} frames on ${t.topics} topics (want all four heroes, two or more each)`);
    const c = await runDoor(db, M, 'closed');
    if (c.frames !== 0 || c.memos !== 0) fail('FD-3', `with the browser closed the tick pushed ${c.frames} frames and wrote ${c.memos} memo rows (want none)`);
    return { problems, v, t, c, ratio, all: v.whole ? v.sent / v.whole : NaN };
  } finally { await db.query('rollback'); }
}

/* SQL defects: each must be refused by its named §6 arm on apply ('apply'), or, past §6, turn the guard's own case red ('case'). */
const MUTANTS = [
  { id: 'no_memo', expect: 's0d', why: 'the memo is never written, so every frame is whole and nothing is cut',
    from: '    insert into public.hr_frame_memo as m (user_id, slot, version, keys, sums, at)\n    values (p_user, p_slot, v_d.version, v_d.keys, v_d.sums, now())\n    on conflict (user_id, slot) do update\n      set version = excluded.version, keys = excluded.keys, sums = excluded.sums, at = excluded.at;\n', to: '' },
  { id: 'not_newer_delta', expect: 's3b', why: 'a frame not newer than the memo goes as a delta on its own version, which no client can build on',
    from: '  if v_base is null or v_base >= version or v_keys is distinct from keys then', to: '  if v_base is null or v_keys is distinct from keys then' },
  { id: 'unchanged_sent', expect: 's2b', why: 'the delta carries every section, so nothing is cut',
    from: "filter (where substr(coalesce(v_sums, ''), (s.i::int - 1) * 16 + 1, 16) is distinct from s.h)", to: 'filter (where true)' },
  { id: 'moved_dropped', expect: 's2b', why: 'a section that moved is left out, so the client keeps a stale copy',
    from: "filter (where substr(coalesce(v_sums, ''), (s.i::int - 1) * 16 + 1, 16) is distinct from s.h)", to: "filter (where s.key <> 'state' and substr(coalesce(v_sums, ''), (s.i::int - 1) * 16 + 1, 16) is distinct from s.h)" },
  { id: 'keys_moved_delta', expect: 's3a', why: 'a frame whose key list moved goes as a delta, so a key the server dropped lives on in the client',
    from: '  if v_base is null or v_base >= version or v_keys is distinct from keys then', to: '  if v_base is null or v_base >= version then' },
  { id: 'ceiling_moves_memo', expect: 's4b', why: 'a frame over the ceiling is sent anyway (and its memo kept)',
    from: "        v_msg->>'frame', p_user, p_slot, octet_length(v_msg::text), c_max_bytes;\n      return;\n", to: "        v_msg->>'frame', p_user, p_slot, octet_length(v_msg::text), c_max_bytes;\n" },
  { id: 'rebase_any_slot', expect: 's5e', why: 'a rebase deletes the memo of every account in that slot',
    from: '  delete from public.hr_frame_memo where user_id = v_uid and slot = p_slot;', to: '  delete from public.hr_frame_memo where slot = p_slot;' },
  { id: 'rebase_noop', expect: 's5d', why: 'a rebase leaves the memo, so a client that joined never gets a whole frame',
    from: '  delete from public.hr_frame_memo where user_id = v_uid and slot = p_slot;', to: '  perform 1;' },
  { id: 'prune_fresh', expect: 's6', why: 'the prune takes a memo still in use',
    from: "     where m.at < now() - interval '1 hour'", to: '     where true' },
  { id: 'rebase_anon', expect: 's0a', why: 'a signed-out caller can reach the rebase',
    from: 'grant execute on function public.hr_frame_rebase(integer) to authenticated;', to: 'grant execute on function public.hr_frame_rebase(integer) to authenticated, anon;' },
  /* past §6 (its probe sections are short): a sum over a section's first 200 characters misses a change deep in a big one */
  { id: 'short_sum', expect: 'FD-1', kind: 'case', why: 'a section is hashed on its head only, so a change deep in the hunt section is never sent',
    from: 'left(md5(e.value::text), 16) as h', to: 'left(md5(left(e.value::text, 200)), 16) as h' },
];

async function main() {
  if (MUTATE) {
    const own = readFileSync(join(ROOT, 'supabase', 'migrations', OWN), 'utf8');
    let bad = 0;
    for (const m of MUTANTS) {
      if (own.split(m.from).length !== 2) { bad += 1; console.error(`  ✗ ${m.id}: anchor matched ${own.split(m.from).length - 1} times (the guard is stale)`); continue; }
      const patches = new Map([[OWN, [[m.from, m.to]]]]);
      let verdict;
      try {
        if (m.kind === 'case') { const r = await run({ patches }); verdict = r.problems.join(' | ') || 'GREEN'; }
        else { await bootReplay({ patches, upTo: LAST_PATCHED }); verdict = 'APPLIED'; }
      } catch (e) {
        if (e && e.harness) { bad += 1; console.error(`  ✗ ${m.id}: harness: ${String(e.message).split('\n')[0]}`); continue; }
        verdict = String((e && e.message) || e);
      }
      const caught = m.kind === 'case' ? verdict.split(' | ').some((p) => p.startsWith(m.expect + ':')) : new RegExp('\\b' + m.expect + '[a-z]?\\b').test(verdict);
      if (caught) console.log(`  ✓ ${m.id} caught by ${m.expect} (${m.why})`);
      else { bad += 1; console.error(`  ✗ ${m.id} NOT caught by ${m.expect} (${verdict.split('\n')[0].slice(0, 240)})`); }
    }
    if (bad) { console.error(`frame-delta --mutate: ${bad} of ${MUTANTS.length} defects not caught`); return 1; }
    console.log(`frame-delta --mutate: ${MUTANTS.length}/${MUTANTS.length} defects caught, each by its named arm`);
    return 0;
  }
  let r;
  try { r = await run(); } catch (e) { console.error('frame-delta: HARNESS ' + ((e && e.stack) || e)); return 2; }
  const kb = (b) => (b / 1024).toFixed(1) + ' KB';
  console.log(`  viewed: ${r.v.frames} frames on ${r.v.topics} topics, ${kb(r.v.sent)} sent of ${kb(r.v.whole)} whole (${(r.all * 100).toFixed(1)}%); `
    + `past each topic's first frame ${kb(r.v.steadySent)} of ${kb(r.v.steadyWhole)} (${(r.ratio * 100).toFixed(1)}%)`);
  console.log(`  tick: ${r.t.frames} frames on ${r.t.topics} topics, ${kb(r.t.sent)} sent of ${kb(r.t.whole)} whole; closed: ${r.c.frames} frames, ${r.c.memos} memos`);
  if (r.problems.length) { for (const p of r.problems) console.error('  ✗ ' + p); console.error(`frame-delta: ${r.problems.length} problem(s)`); return 1; }
  console.log('frame-delta: OK - every frame made whole on the push\'s own copy is the server\'s envelope, viewed and by the tick; closed pushes nothing');
  return 0;
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error('frame-delta: HARNESS ' + ((e && e.stack) || e)); process.exit(2); });
