#!/usr/bin/env node
// ============================================================================
// tools/world-tick-parity.mjs — THE PROBE PARITY READ, READ-ONLY.
//
//   node tools/world-tick-parity.mjs                 read production, last 14 days
//   node tools/world-tick-parity.mjs --days 4        a narrower window
//   node tools/world-tick-parity.mjs --hash <sha>    pin the payload by hand
//                                                    (default: GET hr-accrue)
//   node tools/world-tick-parity.mjs --verbose       every probe and its reason
//   node tools/world-tick-parity.mjs --selftest      the eligibility rules and the
//                                                    bar on planted rows,
//                                                    mutation-proved; no token, no DB
//
// Applies Security ruling 1's acceptance bars
// (docs/planning/SEC_WORLD_TICK_ARM_2026-10-05.md) to the rows
// 2026-10-06-world-tick-parity-probe.sql's probe writes, and prints one line per
// channel: PASS / FAIL / UNREADABLE / INSUFFICIENT. The bar itself is
// services/world-tick/parity-bar.js — the module tests/world-tick-probe-bar.mjs
// calibrates and mutation-proves, so the bar read here is the bar that was
// shown to bite.
//
// ── WHAT IT READS, AND HOW ─────────────────────────────────────────────────
// ONE fixed SELECT through the management endpoint tools/vitals.mjs uses
// (token from ~/.supabase-token, read as file bytes, never printed, never
// argv), refused before sending unless it is SELECT-only. Per probe it
// aggregates IN SQL the hr_tick_shadow windows the span covers (a 14-day read
// at 100x is hundreds of thousands of windows; the response carries one row
// per probe), plus the player_ledger rows inside the span for the
// "an accepted intent landed" discard.
//
// ── ELIGIBILITY (ruling 1, "Eligibility of a probe span") ──────────────────
//   off-payload   payload_open or payload_close is not the LIVE payload_sha256
//                 → NOT IN THIS READ (a deploy restarts the count; not a discard)
//   discarded     void (superseded / span_out_of_bounds / no_result), an
//                 accepted intent or a version move inside the span, a tiling
//                 break or overlap (8b), coverage < 99 %, a capped or
//                 unaccrued one-span answer, a pointer that ended
//   > 20 % discarded → UNREADABLE, never averaged.
//
// Exit: 0 every channel PASS · 3 a channel not PASS · 2 harness/credential.
// ============================================================================
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { judgeRead } from '../services/world-tick/parity-bar.js';
import { MONSTERS } from '../src/data/monsters.js';

const ARGV = process.argv.slice(2);
const arg = (k, d) => { const i = ARGV.indexOf(k); return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : d; };
const VERBOSE = ARGV.includes('--verbose');
const SELFTEST = ARGV.includes('--selftest');
const DAYS = Math.max(1, Math.min(14, Math.floor(Number(arg('--days', 14)) || 14)));

const PROJECT = 'nezapsylztqbbwuwembx';
const URL_Q = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const EDGE = `https://${PROJECT}.supabase.co/functions/v1/hr-accrue`;
const RARE_IDS = new Set(Object.values(MONSTERS)
  .flatMap((m) => (m.drops || []).filter((d) => d.lucky).map((d) => d.id)));
const COVERAGE_MIN = 0.99;

export const QUERY = (days) => `
with p as (
  select id, user_id, slot, channel, status, void_reason, span_from, span_to,
         base_version, version_close, payload_open, payload_close, result
    from public.hr_tick_probe
   where opened_at >= now() - make_interval(days => ${Number(days)})
     and status in ('closed', 'void')),
w as (
  select p.id as probe_id, s.window_from, s.window_to, s.version,
         s.would_gold, s.would_qty, s.would_ticks, s.would_kills, s.would_ate,
         s.would_deaths, s.would_xp, s.would_items, s.would_recovering_until,
         (s.window_from < p.span_from or s.window_to > p.span_to) as straddles,
         lag(s.window_to) over (partition by p.id order by s.window_from, s.id) as prev_to
    from p join public.hr_tick_shadow s
      on s.user_id = p.user_id and s.slot = p.slot and s.channel = p.channel
     and s.window_to > p.span_from and s.window_from < p.span_to
   where p.status = 'closed'),
a as (
  select w.probe_id, count(*) as n,
         min(w.window_from) as first_from, max(w.window_to) as last_to,
         sum(extract(epoch from (least(w.window_to, p.span_to) - greatest(w.window_from, p.span_from)))) as covered_s,
         count(*) filter (where w.prev_to is not null and w.prev_to <> w.window_from) as breaks,
         count(*) filter (where w.straddles) as straddles,
         count(*) filter (where w.version <> p.base_version) as off_version,
         sum(w.would_gold) as gold, sum(w.would_qty) as qty, sum(w.would_ticks) as ticks,
         sum(coalesce(w.would_kills, 0)) as kills, sum(coalesce(w.would_ate, 0)) as ate,
         sum(coalesce(w.would_deaths, 0)) as deaths,
         array_agg(w.would_recovering_until) filter (where coalesce(w.would_deaths, 0) > 0) as recover_texts
    from w join p on p.id = w.probe_id
   group by w.probe_id),
xp2 as (
  select probe_id, jsonb_object_agg(key, v) as xp
    from (select w.probe_id, x.key, sum((x.value)::numeric) as v
            from w, jsonb_each_text(coalesce(w.would_xp, '{}'::jsonb)) x
           group by w.probe_id, x.key) e
   group by probe_id),
it as (
  select probe_id, jsonb_object_agg(key, v) as items
    from (select w.probe_id, x.key, sum((x.value)::numeric) as v
            from w, jsonb_each_text(coalesce(w.would_items, '{}'::jsonb)) x
           group by w.probe_id, x.key) e
   group by probe_id)
select p.id, p.user_id, p.slot, p.channel, p.status, p.void_reason,
       to_jsonb(p.span_from) #>> '{}' as span_from, to_jsonb(p.span_to) #>> '{}' as span_to,
       p.base_version, p.version_close, p.payload_open, p.payload_close, p.result,
       a.n, to_jsonb(a.first_from) #>> '{}' as first_from, to_jsonb(a.last_to) #>> '{}' as last_to,
       a.covered_s, a.breaks, a.straddles, a.off_version,
       a.gold, a.qty, a.ticks, a.kills, a.ate, a.deaths, a.recover_texts,
       coalesce(xp2.xp, '{}'::jsonb) as xp, coalesce(it.items, '{}'::jsonb) as items,
       (select count(*) from public.player_ledger l
         where l.user_id = p.user_id and l.slot = p.slot
           and l.at > p.span_from and l.at <= coalesce(p.span_to, p.span_from)) as ledger_rows
  from p
  left join a on a.probe_id = p.id
  left join xp2 on xp2.probe_id = p.id
  left join it on it.probe_id = p.id
 order by p.user_id, p.slot, p.channel, p.span_from`;

/* The vitals.mjs rule, restated as a check over EVERY query this tool can send. */
export const selectOnly = (sql) => !/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|call|do|copy|execute)\b/i.test(sql);

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * One row of QUERY -> a comparator record, or an exclusion.
 * @returns { exclude: 'off_payload' } | { user, slot, channel, id, spanMs, discard, one, chain }
 */
export function classify(row, liveHash) {
  const rec = { user: row.user_id, slot: row.slot, channel: row.channel, id: row.id };
  if (row.payload_open !== liveHash || (row.status === 'closed' && row.payload_close !== liveHash)) {
    return { exclude: 'off_payload' };
  }
  const spanMs = row.span_to ? Date.parse(row.span_to) - Date.parse(row.span_from) : 0;
  const r = row.result || {};
  const recoverOk = (row.recover_texts || []).every((t) => t === null || Number.isFinite(Date.parse(t)));
  const chain = {
    ticks: n(row.ticks), qty: n(row.qty), gold: n(row.gold), kills: n(row.kills), ate: n(row.ate),
    deaths: n(row.deaths), xp: row.xp || {}, items: row.items || {}, recoverOk,
  };
  const oneRecoverOk = !(n(r.deaths) > 0 && r.recovering_until !== null && r.recovering_until !== undefined
    && !Number.isFinite(Date.parse(r.recovering_until)));
  const one = {
    ticks: n(r.ticks), qty: n(r.qty), gold: n(r.gold), kills: n(r.kills), ate: n(r.ate),
    deaths: n(r.deaths), xp: r.xp || {}, items: r.items || {}, recoverOk: oneRecoverOk,
  };
  let discard = null;
  if (row.status === 'void') discard = `void:${row.void_reason || 'unknown'}`;
  else if (n(row.n) === 0) discard = 'no_windows';
  else if (row.first_from !== row.span_from || row.last_to !== row.span_to
           || n(row.breaks) > 0 || n(row.straddles) > 0) discard = 'tiling';
  else if (n(row.covered_s) * 1000 < COVERAGE_MIN * spanMs) discard = 'coverage';
  else if (n(row.off_version) > 0 || n(row.version_close) !== n(row.base_version)) discard = 'version_moved';
  else if (n(row.ledger_rows) > 0) discard = 'intent_in_span';
  else if (r.accrued === false) discard = 'not_accrued';
  else if (r.capped === true) discard = 'capped';
  else if (r.stopped) discard = 'pointer_ended';
  return Object.assign(rec, { spanMs, discard, one, chain });
}

export function readVerdict(rows, liveHash) {
  const recs = [];
  let offPayload = 0;
  for (const row of rows) {
    const c = classify(row, liveHash);
    if (c.exclude) { offPayload++; continue; }
    recs.push(c);
  }
  return Object.assign(judgeRead(recs, { rareIds: RARE_IDS }), { offPayload, records: recs });
}

function print(v, liveHash) {
  console.log(`world-tick-parity: ${v.records.length} probes on payload ${String(liveHash).slice(0, 16)}… `
    + `(${v.offPayload} on another payload, not counted)`);
  for (const g of v.groups) {
    console.log(`  ${g.key}  ${g.verdict}  ${JSON.stringify({ probes: g.stats.probes, hours: g.stats.hours, discarded: g.stats.discarded })}`);
    for (const r of g.reasons.slice(0, VERBOSE ? 50 : 6)) console.log(`      - ${r}`);
    if (VERBOSE) console.log(`      stats ${JSON.stringify(g.stats)}`);
  }
  for (const ch of ['gather', 'combat']) console.log(`${ch}: ${v.channels[ch]}`);
}

// ── --selftest: planted rows, every rule must bite ──────────────────────────
function plantedRows(hash) {
  const base = (i, over) => {
    const from = Date.UTC(2026, 9, 1) + i * 5 * 3600e3;
    const to = from + 4 * 3600e3 + 60e3;
    const iso = (ms) => new Date(ms).toISOString().replace('Z', '+00:00').replace('.000', '');
    return Object.assign({
      id: i + 1, user_id: 'u1', slot: 0, channel: 'gather', status: 'closed', void_reason: null,
      span_from: iso(from), span_to: iso(to), base_version: 3, version_close: 3,
      payload_open: hash, payload_close: hash,
      result: { accrued: true, ticks: 3000, qty: 3000, gold: 0, kills: 0, ate: 0, deaths: 0,
        xp: { woodcutting: 15000 }, items: { logs: 3000 }, capped: false, stopped: null },
      n: 161, first_from: iso(from), last_to: iso(to), covered_s: (to - from) / 1000, breaks: 0,
      straddles: 0, off_version: 0, gold: 0, qty: 3000, ticks: 3000, kills: 0, ate: 0, deaths: 0,
      recover_texts: null, xp: { woodcutting: 15000 }, items: { logs: 3000 }, ledger_rows: 0,
    }, over || {});
  };
  return { base, rows: Array.from({ length: 7 }, (_, i) => base(i)) };
}

async function selftest() {
  const H = 'a'.repeat(64);
  const { base, rows } = plantedRows(H);
  let bad = 0;
  const expect = (name, v, want, ch = 'gather') => {
    const ok = v.channels[ch] === want;
    console.log(`  ${ok ? '✓' : '✗'} ${name}: ${ch} ${v.channels[ch]} (want ${want})`);
    if (!ok) bad++;
  };
  if (!selectOnly(QUERY(DAYS))) { console.log('  ✗ the query is not SELECT-only'); bad++; } else console.log('  ✓ the query is SELECT-only');
  if (selectOnly('select 1; delete from public.player_ledger')) { console.log('  ✗ the SELECT-only check is blind'); bad++; }
  expect('clean 7 x 4 h gather read', readVerdict(rows, H), 'PASS');
  expect('one probe 2 ticks off (a defect, not noise)',
    readVerdict(rows.map((r, i) => (i === 3 ? base(i, { ticks: 3002, qty: 3002, items: { logs: 3002 } }) : r)), H), 'FAIL');
  expect('every probe 12 qty short of the one-span answer', readVerdict(rows.map((r, i) => base(i, {
    result: Object.assign({}, r.result, { ticks: 3000, qty: 2988 }), qty: 3000 })), H), 'FAIL');
  expect('2 of 7 discarded for a tiling break (> 20 %)',
    readVerdict(rows.map((r, i) => (i < 2 ? base(i, { breaks: 1 }) : r)), H), 'UNREADABLE');
  expect('1 of 7 version-moved (≤ 20 %) leaves 6 / 24 h',
    readVerdict(rows.map((r, i) => (i === 0 ? base(i, { off_version: 2 }) : r)), H), 'PASS');
  expect('every probe on another payload: nothing to read',
    readVerdict(rows.map((r, i) => base(i, { payload_close: 'b'.repeat(64) })), H), 'INSUFFICIENT');
  expect('an accepted intent in 2 spans (> 20 %)',
    readVerdict(rows.map((r, i) => (i < 2 ? base(i, { ledger_rows: 1 }) : r)), H), 'UNREADABLE');
  expect('5 probes only', readVerdict(rows.slice(0, 5), H), 'INSUFFICIENT');

  /* ── THE DIRECTION RULE (SEC_WORLD_TICK_PROBE_2026-10-05.md (a)) ─────────
     14 combat probes x 4 h. A zero-death probe of a CORRECT engine ties on
     every field (ticks must be exact), so a low-death character has few
     non-tied probes: scored, its 2-above / 2-below would read one-signed and
     a correct engine would read red. `kinds` is one letter per probe:
     t = tie (no death), + / − = a death-bearing probe the windows over/under-
     shoot by 5 on ticks, kills, gold and xp. */
  const combat = (kinds) => kinds.split('').map((k, i) => {
    const d = k === 't' ? 0 : 1;
    const s = k === '+' ? 5 : k === '-' ? -5 : 0;
    const one = { accrued: true, ticks: 3000, qty: 0, gold: 1000, kills: 2000, ate: d ? 3 : 1, deaths: d,
      xp: { attack: 10000 }, items: {}, capped: false, stopped: null,
      recovering_until: d ? '2026-10-01T02:00:00+00:00' : null };
    return base(i, { channel: 'combat', result: one, qty: 0, ticks: 3000 + s, gold: 1000 + s, kills: 2000 + s,
      ate: one.ate, deaths: d, xp: { attack: 10000 + s }, items: {},
      recover_texts: d ? ['2026-10-01T02:00:00+00:00'] : null });
  });
  expect('a correct LOW-death engine: 10 ties + 2 above / 2 below (4 non-tied < 12)',
    readVerdict(combat('tttttttttt++--'), H), 'INSUFFICIENT', 'combat');
  expect('a correct death-heavy engine: 7 above / 7 below, every field scored',
    readVerdict(combat('+-+-+-+-+-+-+-'), H), 'PASS', 'combat');
  expect('a one-signed engine: 14 below on every field, scored and red',
    readVerdict(combat('--------------'), H), 'FAIL', 'combat');
  if (bad) { console.error(`\nworld-tick-parity --selftest: ${bad} rule(s) did not bite`); process.exit(1); }
  console.log('\nworld-tick-parity --selftest: every eligibility rule and bar bites.');
  process.exit(0);
}

// ── the production read ────────────────────────────────────────────────────
const sql = QUERY(DAYS);
if (!selectOnly(sql)) { console.error('world-tick-parity: refusing — query is not SELECT-only'); process.exit(2); }

async function liveHash() {
  const pinned = arg('--hash', null);
  if (pinned) return pinned;
  const boot = readFileSync(join(process.cwd(), 'src', 'net', 'supabase-bootstrap.js'), 'utf8');
  const key = (boot.match(/eyJ[A-Za-z0-9_\-.]{40,}/) || [])[0] || '';
  const res = await fetch(EDGE, { headers: key ? { Authorization: `Bearer ${key}`, apikey: key } : {} });
  if (!res.ok) throw new Error(`GET hr-accrue answered ${res.status}`);
  const h = (await res.json()).payload_sha256;
  if (typeof h !== 'string' || !/^[0-9a-f]{64}$/.test(h)) throw new Error(`no payload_sha256 in the GET (${h})`);
  return h;
}

async function productionRead() {
  const sql = QUERY(DAYS);
  if (!selectOnly(sql)) { console.error('world-tick-parity: refusing — query is not SELECT-only'); process.exit(2); }
  let hash;
  let rows;
  try {
  hash = await liveHash();
  const token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
  const res = await fetch(URL_Q, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  rows = JSON.parse(body);
} catch (e) {
  console.error(`world-tick-parity: ${String(e.message || e)}`);
  process.exitCode = 2;
}
  if (rows) {
    const v = readVerdict(rows, hash);
    print(v, hash);
    process.exitCode = (v.channels.gather === 'PASS' && v.channels.combat === 'PASS') ? 0 : 3;
  }
}

/* A module the guard imports (tests/world-tick-parity-probe.mjs PP-8 runs QUERY
   on the replayed chain), so the read runs only when invoked directly. */
const isMain = (process.argv[1] || '').replace(/\\/g, '/').endsWith('tools/world-tick-parity.mjs');
if (isMain) {
  if (SELFTEST) await selftest();
  else await productionRead();
}
