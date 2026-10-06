#!/usr/bin/env node
// ============================================================================
// tools/world-tick-parity.mjs — THE PROBE PARITY READ, READ-ONLY.
//
//   node tools/world-tick-parity.mjs                 read production, last 14 days
//   node tools/world-tick-parity.mjs --days 4        a narrower window
//   node tools/world-tick-parity.mjs --hash <sha>    pin the payload by hand
//                                                    (default: GET hr-accrue)
//   node tools/world-tick-parity.mjs --verbose       every probe and its reason
//   node tools/world-tick-parity.mjs --replicas 32   seeded replays per combat probe
//   node tools/world-tick-parity.mjs --selftest      the eligibility rules and the
//                                                    bar on planted rows, and the
//                                                    REPLAY bar on the no-food
//                                                    fixture through the shipped
//                                                    engine, mutation-proved; no
//                                                    token, no DB
//
// Applies Security ruling 1's acceptance bars
// (docs/planning/SEC_WORLD_TICK_ARM_2026-10-05.md) to the rows
// 2026-10-06-world-tick-parity-probe.sql's probe writes, and prints one line per
// channel: PASS / FAIL / UNREADABLE / INSUFFICIENT. COMBAT is read on the
// SEEDED REPLAY of each probe (SEC_VIGOUR_LINE_SPLIT_2026-10-06 "Bar ruling";
// services/world-tick/parity-replay.js): R replicas of the one span and the
// shipped chain from the STORED input, on the engine this repo packs — admitted
// only when that engine's payload hash is the probe's. A probe whose input was
// not retained, or whose engine is not this one, has no replay, and the combat
// read is INSUFFICIENT and says which. The bar itself is
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
import { replayProbe, shippedChain, chainFields, fieldsOf, replayStats, REPLAY_FIELDS }
  from '../services/world-tick/parity-replay.js';
import { oneSpan, probeResultOf, encodeProbeInput, decodeProbeInput }
  from '../supabase/functions/hr-accrue/tick-probe.js';
import { offlineSeedFor, atSpan, loadCombatSessions } from '../services/world-tick/combat.js';
import { applyShadowState } from '../supabase/functions/hr-accrue/tick-contract.js';
import { levelFromXp } from '../src/core/xp.js';
import { MONSTERS } from '../src/data/monsters.js';

const ARGV = process.argv.slice(2);
const arg = (k, d) => { const i = ARGV.indexOf(k); return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : d; };
const VERBOSE = ARGV.includes('--verbose');
const SELFTEST = ARGV.includes('--selftest');
const DAYS = Math.max(1, Math.min(14, Math.floor(Number(arg('--days', 14)) || 14)));
const REPLICAS = Math.max(2, Math.min(400, Math.floor(Number(arg('--replicas', 32)) || 32)));

const PROJECT = 'nezapsylztqbbwuwembx';
const URL_Q = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const EDGE = `https://${PROJECT}.supabase.co/functions/v1/hr-accrue`;
const RARE_IDS = new Set(Object.values(MONSTERS)
  .flatMap((m) => (m.drops || []).filter((d) => d.lucky).map((d) => d.id)));
const COVERAGE_MIN = 0.99;

export const QUERY = (days) => `
with p as (
  select id, user_id, slot, channel, status, void_reason, span_from, span_to,
         base_version, version_close, payload_open, payload_close, result, input,
         seed, input_trimmed_at
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
       p.base_version, p.version_close, p.payload_open, p.payload_close, p.result, p.input,
       p.seed, to_jsonb(p.input_trimmed_at) #>> '{}' as input_trimmed_at,
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
  /* RETENTION (2026-10-07-probe-retain-input.sql): a closed COMBAT probe whose
     replay material hr_tick_probe_prune trimmed (past 4 days / 30 per
     character-channel) is OUT of the combat read, like another payload — by
     age and count, never by outcome, so it cannot choose what is judged. A
     closed probe with no input and NO trim stamp is not excluded: it reads
     input_not_retained and keeps the combat read INSUFFICIENT. Gather needs
     no replay and reads every probe. */
  if (row.channel === 'combat' && row.status === 'closed' && row.input_trimmed_at) {
    return { exclude: 'retention_trimmed' };
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

/* opts.replayOf(row, rec) → the combat replay record (parity-replay.js
   replayStats) or { unavailable: reason }, for every eligible combat probe. */
export function readVerdict(rows, liveHash, opts) {
  const replayOf = opts && opts.replayOf;
  const recs = [];
  let offPayload = 0;
  let trimmed = 0;
  for (const row of rows) {
    const c = classify(row, liveHash);
    if (c.exclude === 'retention_trimmed') { trimmed++; continue; }
    if (c.exclude) { offPayload++; continue; }
    if (replayOf && c.channel === 'combat' && !c.discard) c.replay = replayOf(row, c);
    recs.push(c);
  }
  return Object.assign(judgeRead(recs, { rareIds: RARE_IDS }), { offPayload, trimmed, records: recs });
}

function print(v, liveHash) {
  console.log(`world-tick-parity: ${v.records.length} probes on payload ${String(liveHash).slice(0, 16)}… `
    + `(${v.offPayload} on another payload, ${v.trimmed} combat past replay retention; not counted)`);
  for (const g of v.groups) {
    console.log(`  ${g.key}  ${g.verdict}  ${JSON.stringify({ probes: g.stats.probes, hours: g.stats.hours, discarded: g.stats.discarded })}`);
    if (g.stats.replay) console.log(`      replay ${JSON.stringify(g.stats.replay)}`);
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
  /* A planted replay: the one-span expectation at the realised one span, a
     Δ distribution centred on `bias` x one with sd `sdFrac` x one over 400
     replicas. */
  const planted = (bias, over, sdFrac = 0.02) => (row, rec) => {
    const st = { replicas: 400, reproduced: true, one: {}, chain: {}, delta: {} };
    for (const k of REPLAY_FIELDS) {
      const one = k === 'xp' ? Object.values(rec.one.xp).reduce((a, v) => a + v, 0) : (Number(rec.one[k]) || 0);
      const sd = sdFrac * Math.max(1, one);
      st.one[k] = { mean: one, sd };
      st.delta[k] = { mean: bias * one, sd };
      st.chain[k] = { mean: one * (1 + bias), sd };
    }
    return Object.assign(st, over || {});
  };
  const R0 = { replayOf: planted(0) };
  expect('a correct LOW-death engine: 10 ties + 2 above / 2 below (4 non-tied < 12)',
    readVerdict(combat('tttttttttt++--'), H, R0), 'INSUFFICIENT', 'combat');
  expect('a correct death-heavy engine: 7 above / 7 below, every field scored',
    readVerdict(combat('+-+-+-+-+-+-+-'), H, R0), 'PASS', 'combat');
  expect('a one-signed engine: 14 below on every field, scored and red',
    readVerdict(combat('--------------'), H, R0), 'FAIL', 'combat');

  /* ── THE REPLAY BAR (SEC_VIGOUR_LINE_SPLIT_2026-10-06 "Bar ruling") ──── */
  const heavy = combat('+-+-+-+-+-+-+-');
  expect('no replay on any probe (a probe closed before 2026-10-07-probe-retain-input.sql)',
    readVerdict(heavy, H, { replayOf: () => ({ unavailable: 'input_not_retained' }) }), 'INSUFFICIENT', 'combat');
  expect('no replayOf at all: the realised pair alone is never a combat verdict',
    readVerdict(heavy, H), 'INSUFFICIENT', 'combat');
  expect('replay expectation +12 % (se tiny): the aggregate is outside ±10 %',
    readVerdict(heavy, H, { replayOf: planted(0.12) }), 'FAIL', 'combat');
  expect('replay expectation +12 % but se > bar/3: INSUFFICIENT, never widened',
    readVerdict(heavy, H, { replayOf: planted(0.12, { replicas: 2 }, 2) }), 'INSUFFICIENT', 'combat');
  expect('replay expectation +40 % at se ~6 % (> bar/3): past the bar by > 3 se, FAIL at any precision',
    readVerdict(heavy, H, { replayOf: planted(0.40, { replicas: 2 }, 0.32) }), 'FAIL', 'combat');
  expect('the stored one span does NOT reproduce from input + seed',
    readVerdict(heavy, H, { replayOf: planted(0, { reproduced: false }) }), 'FAIL', 'combat');
  expect('the seed is unknown (reproduced null): not proven, INSUFFICIENT',
    readVerdict(heavy, H, { replayOf: planted(0, { reproduced: null }) }), 'INSUFFICIENT', 'combat');
  expect('the realised read at z 5 against its replay (two probes +200 gold)',
    readVerdict(heavy.map((r, i) => (i === 1 || i === 3 ? Object.assign({}, r, { gold: r.gold + 200 }) : r)), H, R0), 'FAIL', 'combat');

  bad += engineReplaySelftest(H);
  if (bad) { console.error(`\nworld-tick-parity --selftest: ${bad} rule(s) did not bite`); process.exit(1); }
  console.log('\nworld-tick-parity --selftest: every eligibility rule and bar bites.');
  process.exit(0);
}

// ── --selftest, engine half: the SHIPPED engine on the no-food fixture ─────
/* Twelve probes, 48 h: ten death-dominated NO-FOOD probes on the QA slot 1
   Slime input that carried the vigour-line defect (probe 8's carrier crosses
   the line, probe 10's is wholly past it; services/world-tick/fixtures/
   vigour-line-qa1.json, shared with tests/world-tick-vigour-line.mjs), and two
   FOOD-EXHAUSTED probes (C6 "the bag empties mid-span") for the ate > 0
   non-vacuity rule. Each live pair is the probe's own: the one span and the
   shipped chain on the offline seed stream, stored through encodeProbeInput
   exactly as the probe stores it. Then:
     correct engine            → PASS (reproduced, aggregate inside ±10 %, z ok)
     +12 % chain bias          → FAIL on the replay aggregate
   The bias multiplies the chain's ticks, kills, gold and xp by 1.12 in the
   live pair AND in every replica — the engine is biased, not the reading. */
export const SELFTEST_REPLICAS = 40;
const SPAN_PAD_MS = 74400;   // probes 8/10: 4 h 01 m 14 s, like production's close
function selftestProbes() {
  const qa1 = JSON.parse(readFileSync(new URL('../services/world-tick/fixtures/vigour-line-qa1.json', import.meta.url), 'utf8'));
  const out = [];
  const userOf = (i) => `00000000-0000-4000-8000-${String(0x5e1f00 + i).padStart(12, '0')}`;
  for (let i = 0; i < 10; i++) {
    const p = qa1.probes[i % 2 ? 'p10' : 'p8'];
    const s = JSON.parse(JSON.stringify(qa1.env));
    s.userId = userOf(i);
    s.accruedToMs = Date.parse(p.fromText); s.accruedToText = p.fromText;
    out.push({ input: applyShadowState(s, JSON.parse(JSON.stringify(p.carrier))),
      fromMs: Date.parse(p.fromText), toMs: Date.parse(p.to) });
  }
  const food = loadCombatSessions().find((x) => /bag empties/.test(x.name));
  for (let i = 0; i < 2; i++) {
    const from = Date.UTC(2026, 9, 2, 3 + 7 * i, 0, 0);
    const s = atSpan(food, from);
    const lvl = Math.max(10, levelFromXp(Number((s.skills || {}).hitpoints) || 0));
    s.hp = Math.max(1, Math.round((Number(s.hp) || 0) / (Number(s.maxHp) || lvl) * lvl));
    s.maxHp = lvl;
    s.userId = userOf(10 + i);
    out.push({ input: s, fromMs: from, toMs: from + 4 * 3600e3 + SPAN_PAD_MS });
  }
  /* Stored the way the probe stores it, then read back. */
  return out.map((p) => Object.assign(p, { input: decodeProbeInput(encodeProbeInput(p.input)) }));
}

function engineReplaySelftest(H) {
  let bad = 0;
  const t0 = Date.now();
  const probes = selftestProbes().map((p, i) => {
    const seed = offlineSeedFor(p.input.userId, p.input.slot, p.input.accruedToText);
    const result = probeResultOf(oneSpan('combat', p.input, p.fromMs, p.toMs, seed));
    const windows = shippedChain(p.input, p.fromMs, p.toMs).windows;
    const chain = chainFields(windows);
    chain.items = {};
    for (const res of windows) {
      if (!res || !res.accrued) continue;
      const it = probeResultOf(res).items;
      for (const k of Object.keys(it)) chain.items[k] = (chain.items[k] || 0) + it[k];
    }
    const replay = replayProbe({ input: p.input, fromMs: p.fromMs, toMs: p.toMs, seed, result },
      { replicas: SELFTEST_REPLICAS });
    return { i, p, result, chain, replay };
  });
  const iso = (ms) => new Date(ms).toISOString().replace('Z', '+00:00');
  const rowsOf = (bias) => probes.map(({ i, p, result, chain }) => {
    const b = (k, v) => (['ticks', 'kills', 'gold', 'xp'].includes(k) ? Math.round(v * bias) : v);
    return {
      id: 100 + i, user_id: p.input.userId, slot: p.input.slot, channel: 'combat', status: 'closed', void_reason: null,
      span_from: iso(p.fromMs), span_to: iso(p.toMs), base_version: 3, version_close: 3,
      payload_open: H, payload_close: H, result, input: null,
      n: 160, first_from: iso(p.fromMs), last_to: iso(p.toMs), covered_s: (p.toMs - p.fromMs) / 1000,
      breaks: 0, straddles: 0, off_version: 0, gold: b('gold', chain.gold), qty: 0, ticks: b('ticks', chain.ticks),
      kills: b('kills', chain.kills), ate: chain.ate, deaths: chain.deaths,
      recover_texts: null, xp: { attack: b('xp', chain.xp) }, items: chain.items, ledger_rows: 0,
    };
  });
  /* One combat group is ONE character: the planted rows share a user and slot. */
  const oneChar = (rows) => rows.map((r) => Object.assign(r, { user_id: 'u-replay', slot: 0 }));
  const replayOf = (bias) => {
    const byId = new Map(probes.map(({ i, replay }) => {
      const s = replay.samples;
      const scale = (x) => Object.fromEntries(REPLAY_FIELDS.map((k) =>
        [k, ['ticks', 'kills', 'gold', 'xp'].includes(k) ? Math.round(x[k] * bias) : x[k]]));
      return [100 + i, replayStats({ one: s.one, chain: s.chain.map(scale) }, replay.reproduced)];
    }));
    return (row) => byId.get(row.id);
  };
  const reproducedAll = probes.every((x) => x.replay.reproduced === true);
  console.log(`  ${reproducedAll ? '✓' : '✗'} every stored one span reproduces from its input + seed on this engine `
    + `(${probes.length} probes, ${SELFTEST_REPLICAS} replicas each, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (!reproducedAll) bad++;

  /* THE RETAINED ROW, AS PRODUCTION STORES IT (2026-10-07-probe-retain-input.sql):
     input kept at close, the one-span seed as the bigint column the
     management endpoint returns. productionReplayOf — the production path,
     not replayProbe called by hand — must reproduce it byte-identically, and
     each mutation must bite: a wrong seed FAILS reproduction, a missing input
     is input_not_retained, a trimmed combat row leaves the read. */
  {
    const { p, result } = probes[0];
    const seed = offlineSeedFor(p.input.userId, p.input.slot, p.input.accruedToText);
    const row = { id: 900, user_id: p.input.userId, slot: p.input.slot, channel: 'combat', status: 'closed',
      span_from: iso(p.fromMs), span_to: iso(p.toMs), payload_open: H, payload_close: H,
      input: JSON.parse(JSON.stringify(encodeProbeInput(p.input))), seed: String(seed), result };
    const rep = productionReplayOf(H, 2);
    const a = rep(row);
    const b = rep(Object.assign({}, row, { seed: String((seed ^ 1) >>> 0) }));
    const c = rep(Object.assign({}, row, { input: null, seed: null }));
    const d = rep(Object.assign({}, row, { seed: null }));
    const checks = [
      ['a retained probe (stored input + stored seed) replays byte-identically', a.reproduced === true, a.reproduceDetail],
      ['the same row with seed^1 does NOT reproduce', b.reproduced === false, b.reproduceDetail],
      ['input NULL reads input_not_retained', c.unavailable === 'input_not_retained', JSON.stringify(c).slice(0, 80)],
      ['input kept but no seed is never reproduced (null)', d.reproduced === null, String(d.reproduced)],
    ];
    for (const [name, ok, why] of checks) {
      console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${why}`}`);
      if (!ok) bad++;
    }
    const trimmedRow = Object.assign({}, rowsOf(1)[0], { input_trimmed_at: '2026-10-01T00:00:00+00:00' });
    const vt = readVerdict([trimmedRow], H, { replayOf: () => ({ unavailable: 'input_not_retained' }) });
    const tOk = vt.trimmed === 1 && vt.records.length === 0;
    console.log(`  ${tOk ? '✓' : '✗'} a combat probe past replay retention leaves the read (trimmed ${vt.trimmed}, `
      + `records ${vt.records.length})`);
    if (!tOk) bad++;
  }

  const ok = readVerdict(oneChar(rowsOf(1)), H, { replayOf: replayOf(1) });
  const g = ok.groups.find((x) => x.channel === 'combat');
  const okPass = ok.channels.combat === 'PASS';
  console.log(`  ${okPass ? '✓' : '✗'} correct engine on the no-food fixture: combat ${ok.channels.combat} (want PASS) `
    + `replay ${JSON.stringify(g && g.stats.replay)}`);
  if (!okPass) { bad++; for (const r of (g ? g.reasons : [])) console.log(`      - ${r}`); }
  const mut = readVerdict(oneChar(rowsOf(1.12)), H, { replayOf: replayOf(1.12) });
  const gm = mut.groups.find((x) => x.channel === 'combat');
  const byReplay = !!gm && gm.reasons.some((r) => r.startsWith('replay '));
  const mutRed = mut.channels.combat === 'FAIL' && byReplay;
  console.log(`  ${mutRed ? '✓' : '✗'} +12 % chain bias (the vigour-line defect's shape): combat ${mut.channels.combat} `
    + `(want FAIL on the replay aggregate)${gm ? ` — ${gm.reasons.filter((r) => r.startsWith('replay ')).slice(0, 2).join('; ')}` : ''}`);
  if (!mutRed) { bad++; for (const r of (gm ? gm.reasons : [])) console.log(`      - ${r}`); }
  return bad;
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
  let engineHash;
  try {
  hash = await liveHash();
  /* The engine this reader would replay with: the payload this repo packs. */
  engineHash = (await (await import('./pack-edge.mjs')).pack('hr-accrue')).hash;
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
    const v = readVerdict(rows, hash, { replayOf: productionReplayOf(engineHash, REPLICAS) });
    console.log(`world-tick-parity: replay engine = this repo's hr-accrue payload ${String(engineHash).slice(0, 16)}… `
      + `(${engineHash === hash ? 'IS' : 'is NOT'} the live payload), ${REPLICAS} replicas per combat probe`);
    print(v, hash);
    process.exitCode = (v.channels.gather === 'PASS' && v.channels.combat === 'PASS') ? 0 : 3;
  }
}

/* THE PRODUCTION REPLAY. The stored input is the only admissible input (a
   re-read at t1 is not the snapshot at t0), and the only admissible engine is
   the one at the probe's payload hash. The seed is the probe row's own: the
   one-span draw hr_tick_probe_commit derived at close from hr_seed's
   span-start label (2026-10-07-probe-retain-input.sql) — one 32-bit value for
   one past span, never the hr_seed secret. A row without one replays with
   `reproduced` null, which can never PASS. */
export const seedOfRow = (row) => {
  if (row.seed === null || row.seed === undefined || row.seed === '') return null;
  const v = Number(row.seed);
  return Number.isInteger(v) && v >= 0 && v <= 4294967295 ? v : null;
};
export function productionReplayOf(engineHash, replicas) {
  return (row) => {
    if (!row.input || typeof row.input !== 'object') return { unavailable: 'input_not_retained' };
    if (row.payload_open !== engineHash || row.payload_close !== engineHash) return { unavailable: 'engine_not_at_payload' };
    const input = decodeProbeInput(row.input);
    const r = replayProbe({ input, fromMs: Date.parse(row.span_from), toMs: Date.parse(row.span_to),
      seed: seedOfRow(row), result: row.result }, { replicas });
    return Object.assign(r.stats, { reproduceDetail: r.reproduceDetail });
  };
}

/* A module the guard imports (tests/world-tick-parity-probe.mjs PP-8 runs QUERY
   on the replayed chain), so the read runs only when invoked directly. */
const isMain = (process.argv[1] || '').replace(/\\/g, '/').endsWith('tools/world-tick-parity.mjs');
if (isMain) {
  if (SELFTEST) await selftest();
  else await productionRead();
}
