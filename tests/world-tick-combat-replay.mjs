#!/usr/bin/env node
// ============================================================================
// tests/world-tick-combat-replay.mjs — THE COMBAT ARM BAR: EVERY RECORDED PROBE
//                                      REPLAYS EXACTLY, AND THE TICK CHAIN PAYS
//                                      WHAT ONE SPAN PAYS
//
//   node tests/world-tick-combat-replay.mjs            FIXTURE: synthetic probes on
//                                                      this checkout's engine (CI)
//   node tests/world-tick-combat-replay.mjs --mutate   every planted defect RED on
//                                                      its named arm
//   node tests/world-tick-combat-replay.mjs --live     PRODUCTION, read-only: the
//                                                      closed combat probes of the
//                                                      last 3 engine payloads
//                                                      (local only; refuses in CI)
//   ... --live --attest      + the c_pin / c_replayed lines the ARM GO commit pastes
//   ... --replicas N         R2 seeds per input (>= 40; default 160 live, 40 fixture)
//   ... --pin <64-hex>       R2's engine (default: the live GET's payload_sha256)
//
// Security GO-WITH-CHANGES, 2026-10-14 (replaces the >= 12 probes x 4 h live
// bar, which held combat unarmed ~6 days and caught nothing real):
//
// R1  Each closed combat probe on the last 3 engine payloads re-runs on ITS OWN
//     payload's code (the payload_close engine computed the result; tools/lib/
//     engine-pack.mjs extracts it from git and refuses it unless it packs to
//     that hash):
//       R1a the stored result carries exactly the 14 probe keys;
//       R1b input + seed reproduce it exactly — all 14 keys, canonical JSON;
//       R1c the reproduced one-span delta, paid through the REPLAYED hr_apply
//           (this checkout's chain, hr_engine, a row seeded from the input — the
//           deploy-differential (iii) path, tools/lib/hr-apply-replay.mjs), is
//           accepted and leaves exactly that result in state AND ledger: gold,
//           xp per skill, items per id, accrued_to, recovering_until, the
//           pointer (stopped), one `accrue` row with gold/kills/ticks/ate/qty/
//           capped, and one `death` row per death.
//     Coverage minimum over that set: >= 2 probes with food eaten, >= 2 with a
//     death AND its knock-out timer, >= 1 on a named hunt (the probe engine's
//     own src/data/hunts.js), >= 1 crossing UTC midnight. MISSING COVERAGE
//     EXITS 2 — never a pass.
// R2  Offline, on the PIN's code: >= 40 seeds per R1 input, the 10 s / 90 s tick
//     chain (parity-replay.js shippedChain) against one span. Gold, XP and
//     kills each within +-6 % in aggregate AND |z| <= 3.29; any single input
//     over-paying by more than 10 % fails outright. Default 160 seeds live:
//     measured 2026-10-14 on the 23 recorded inputs, per-input se reaches 3.9 %
//     at 40 seeds, where a correct engine would breach the per-input 10 % about
//     one read in ten.
//
// The ARM file (2026-10-14-world-tick-arm-combat.sql P2) counts only probes
// this guard attested: `c_replayed` holds id:digest pairs, the digest being
// REPLAY_DIGEST_SQL below, which the file must carry verbatim (FX-2).
//
// SEED HYGIENE (tests/world-tick-seed-no-leak.mjs covers this file): a probe's
// stored seed is secret-equivalent. It is read here and used in memory only —
// never printed, written, attested or sent to CI. The digest excludes it.
//
// Exit: 0 green · 1 red · 2 harness OR missing coverage.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

import { ROOT, readPayloadMap, engineAt, engineForPayload, extractTree, packHashOf, plantedTree, dropTrees,
  EngineHarnessError } from '../tools/lib/engine-pack.mjs';
import { replayCaps, seedCharacter, applyAsEngine } from '../tools/lib/hr-apply-replay.mjs';
import { poolMap } from '../tools/world-tick-replay-pool.mjs';
import { canon, fieldsOf } from '../services/world-tick/parity-replay.js';
import { selectOnly, seedOfRow, fetchLivePayloadHash, sessionProbe, asStored }
  from '../tools/world-tick-parity.mjs';
import { offlineSeedFor } from '../services/world-tick/combat.js';

/* The probe result's keys (tick-probe.js probeResultOf). "All 14 keys". */
export const RESULT_KEYS = Object.freeze(['accrued', 'reason', 'accrued_to', 'gold', 'qty', 'ticks', 'kills', 'ate',
  'deaths', 'xp', 'items', 'recovering_until', 'capped', 'stopped']);
export const BAR = Object.freeze({
  minReplicas: 40, aggFrac: 0.06, zMax: 3.29, inputOverpay: 0.10, fields: Object.freeze(['gold', 'xp', 'kills']),
});
export const COVERAGE = Object.freeze({ ate: 2, death_timer: 2, named_hunt: 1, utc_midnight: 1 });
/* What the ARM file's P2 hashes to bind a counted probe to the row this guard
   replayed. The seed is NOT in it (secret-equivalent; tests/world-tick-seed-no-leak.mjs). */
export const REPLAY_DIGEST_SQL = "encode(sha256(convert_to(concat_ws('|', p.id::text, p.payload_open, "
  + "coalesce(p.payload_close, ''), to_jsonb(p.span_from) #>> '{}', coalesce(to_jsonb(p.span_to) #>> '{}', ''), "
  + "coalesce(p.input::text, ''), coalesce(p.result::text, '')), 'UTF8')), 'hex')";
const ARM_FILE = 'supabase/migrations/2026-10-14-world-tick-arm-combat.sql';
const ENGINE_URL = pathToFileURL(join(ROOT, 'tools', 'lib', 'engine-pack.mjs')).href;

const ARGV = process.argv.slice(2);
const argOf = (k) => { const i = ARGV.indexOf(k); return i >= 0 ? ARGV[i + 1] : null; };
const LIVE = ARGV.includes('--live');
const ATTEST = ARGV.includes('--attest');
const MUTATE = ARGV.includes('--mutate') || ARGV.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`;
const utcDay = (t) => new Date(Date.parse(t)).toISOString().slice(0, 10);
const nonzero = (m) => {
  const out = {};
  for (const k of Object.keys(m).sort()) if (m[k] !== 0) out[k] = m[k];
  return out;
};
const diffMaps = (a, b) => {
  const d = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) d[k] = n0(b[k]) - n0(a[k]);
  return nonzero(d);
};

// ── R1 (engine half): one probe, its own engine ─────────────────────────────
/** @returns { keysOk, keysDetail, reproduced, detail, value } — value: the one-span delta (R1c), never printed. */
export function replayOne(eng, rec) {
  const got = Object.keys(rec.result || {}).sort();
  const want = [...RESULT_KEYS].sort();
  const keysOk = canon(got) === canon(want);
  const keysDetail = keysOk ? '' : `stored result keys ${got.length} (missing ${want.filter((k) => !got.includes(k)).join(',') || '-'}, `
    + `extra ${got.filter((k) => !want.includes(k)).join(',') || '-'})`;
  const s = Number.isInteger(rec.seed) ? rec.seed : null;
  if (s === null || !rec.input) return { keysOk, keysDetail, reproduced: false, detail: 'input or seed not retained', value: null };
  let out;
  try {
    out = eng.probe.oneSpan('combat', eng.probe.decodeProbeInput(rec.input), Date.parse(rec.spanFrom), Date.parse(rec.spanTo), s);
  } catch (e) {
    return { keysOk, keysDetail, reproduced: false, detail: `the engine threw: ${String(e.message).slice(0, 120)}`, value: null };
  }
  const again = eng.probe.probeResultOf(out);
  const reproduced = canon(again) === canon(rec.result);
  const differ = reproduced ? [] : RESULT_KEYS.filter((k) => canon(again[k]) !== canon((rec.result || {})[k]));
  return {
    keysOk, keysDetail, reproduced,
    detail: reproduced ? 'byte-identical on all 14 keys'
      : `differs on ${differ.join(', ')}: replayed ${canon(fieldsOf(again))} vs stored ${canon(fieldsOf(rec.result))}`,
    value: out && out.accrued ? out.delta : null,
  };
}

// ── R1 (server half): the delta through the replayed hr_apply ────────────────
async function snap(db, uid) {
  const ps = (await db.query(`select gold, to_jsonb(accrued_to) #>> '{}' as accrued_to,
      to_jsonb(recovering_until) #>> '{}' as recovering_until, active_kind, active_id
    from public.player_state where user_id = $1 and slot = 0`, [uid])).rows[0];
  const skills = {};
  for (const r of (await db.query('select skill_id, xp from public.player_skills where user_id = $1 and slot = 0', [uid])).rows) skills[r.skill_id] = n0(r.xp);
  const inv = {};
  for (const r of (await db.query('select item_id, qty from public.player_inventory where user_id = $1 and slot = 0', [uid])).rows) inv[r.item_id] = n0(r.qty);
  return { gold: n0(ps.gold), accruedTo: ps.accrued_to, recoveringUntil: ps.recovering_until,
    kind: ps.active_kind, act: ps.active_id, skills, inv };
}
const sameInstant = (a, b) => (a == null || b == null ? a == null && b == null : Date.parse(a) === Date.parse(b));

/** @returns { ok, detail } */
async function applyOne(db, caps, eng, rec, rep, i, dbPlant) {
  const result = rec.result || {};
  if (!result.accrued) {
    return rep.value === null ? { ok: true, detail: 'not accrued: nothing to pay' }
      : { ok: false, detail: 'stored not-accrued, but the engine proposes a delta' };
  }
  if (!rep.value) return { ok: false, detail: 'accrued, but the engine proposed no delta' };
  const uid = `00000000-0000-4000-8000-${String(0xc0ffe000 + i).padStart(12, '0')}`;
  const iid = `00000000-0000-4000-9000-${String(0xc0ffe000 + i).padStart(12, '0')}`;
  await db.exec('begin');
  try {
    if (dbPlant) await db.exec(dbPlant);
    const input = eng.probe.decodeProbeInput(rec.input);
    await seedCharacter(db, caps, uid, input);
    const before = await snap(db, uid);
    const ans = await applyAsEngine(db, uid, rep.value, iid);
    if (!ans || ans.ok !== true) return { ok: false, detail: `hr_apply refused: ${String((ans && (ans.error || ans.why)) || '?').slice(0, 80)}` };
    const after = await snap(db, uid);
    const ledger = (await db.query(`select intent, kind, gold, meta from public.player_ledger
                                     where user_id = $1 and slot = 0 order by id`, [uid])).rows;
    const bad = [];
    if (after.gold - before.gold !== n0(result.gold)) bad.push(`gold +${after.gold - before.gold} vs ${result.gold}`);
    if (canon(diffMaps(before.skills, after.skills)) !== canon(nonzero(result.xp || {}))) bad.push('xp per skill');
    if (canon(diffMaps(before.inv, after.inv)) !== canon(nonzero(result.items || {}))) bad.push('items per id');
    if (!sameInstant(after.accruedTo, result.accrued_to)) bad.push('accrued_to');
    if (!sameInstant(after.recoveringUntil, result.recovering_until)) bad.push('recovering_until');
    const moved = after.kind !== before.kind || after.act !== before.act;
    if (moved !== (result.stopped === 'activity')) bad.push(`pointer ${moved ? 'moved' : 'kept'} vs stopped ${result.stopped}`);
    const acc = ledger.filter((r) => r.intent === 'accrue');
    const m = (acc[0] && acc[0].meta) || {};
    if (acc.length !== 1 || acc[0].kind !== 'combat') bad.push(`${acc.length} accrue rows`);
    else {
      if (n0(acc[0].gold) !== n0(result.gold)) bad.push('ledger gold');
      for (const k of ['kills', 'ticks', 'ate', 'qty']) if (n0(m[k]) !== n0(result[k])) bad.push(`ledger ${k}`);
      if ((m.capped === true) !== (result.capped === true)) bad.push('ledger capped');
    }
    const deaths = ledger.filter((r) => r.intent === 'death').length;
    if (deaths !== n0(result.deaths)) bad.push(`${deaths} death rows vs ${result.deaths}`);
    return bad.length ? { ok: false, detail: `state/ledger differ from the result: ${bad.join('; ')}` }
      : { ok: true, detail: 'state + ledger = the result' };
  } finally {
    await db.exec('rollback');
  }
}

// ── R2: the tick chain against one span, on the pin ──────────────────────────
async function judgeR2(dir, recs, replicas) {
  const tasks = [];
  for (const rec of recs) {
    const p = { input: JSON.parse(JSON.stringify(rec.input)), fromMs: Date.parse(rec.spanFrom), toMs: Date.parse(rec.spanTo) };
    for (let r = 0; r < replicas; r++) tasks.push([dir, p, r]);
  }
  const flat = await poolMap(ENGINE_URL, 'packReplicaSample', tasks);
  const red = { R2agg: [], R2input: [] };
  const lines = [];
  const agg = Object.fromEntries(BAR.fields.map((f) => [f, { one: 0, d: 0, v: 0 }]));
  let worst = { rel: -Infinity, at: null };
  recs.forEach((rec, i) => {
    const mine = flat.slice(i * replicas, (i + 1) * replicas);
    for (const f of BAR.fields) {
      const one = mine.map((s) => s.one[f]);
      const d = mine.map((s) => s.chain[f] - s.one[f]);
      const m1 = one.reduce((a, x) => a + x, 0) / replicas;
      const md = d.reduce((a, x) => a + x, 0) / replicas;
      const sd = Math.sqrt(d.reduce((a, x) => a + (x - md) ** 2, 0) / Math.max(1, replicas - 1));
      agg[f].one += m1; agg[f].d += md; agg[f].v += (sd * sd) / replicas;
      const rel = m1 > 0 ? md / m1 : (md > 0 ? Infinity : 0);
      if (rel > worst.rel) worst = { rel, at: `probe ${rec.id} ${f}` };
      if (rel > BAR.inputOverpay) red.R2input.push(`probe ${rec.id} ${f}: the chain pays ${Number.isFinite(rel) ? pct(rel) : 'from zero'} over one span`);
    }
  });
  for (const f of BAR.fields) {
    const { one, d, v } = agg[f];
    const rel = one > 0 ? d / one : (d === 0 ? 0 : Infinity);
    const se = one > 0 ? Math.sqrt(v) / one : 0;
    const z = se > 0 ? rel / se : (rel === 0 ? 0 : Infinity);
    const ok = Math.abs(rel) <= BAR.aggFrac && Math.abs(z) <= BAR.zMax;
    const line = `R2 ${f}: chain vs one span ${pct(rel)} (se ${(se * 100).toFixed(2)}%, z ${z.toFixed(2)}) over ${recs.length} inputs x ${replicas} seeds`;
    lines.push({ ok, line });
    if (!ok) red.R2agg.push(line);
  }
  lines.push({ ok: !red.R2input.length,
    line: `R2 per input: worst ${worst.at || '-'} ${Number.isFinite(worst.rel) ? pct(worst.rel) : 'from zero'} (fails above ${pct(BAR.inputOverpay)})` });
  return { red, lines };
}

// ── coverage ────────────────────────────────────────────────────────────────
export function coverageOf(recs, huntIndexOf) {
  const counts = { ate: 0, death_timer: 0, named_hunt: 0, utc_midnight: 0 };
  for (const rec of recs) {
    const r = rec.result || {};
    if (n0(r.ate) > 0) counts.ate++;
    if (n0(r.deaths) > 0 && Number.isFinite(Date.parse(r.recovering_until))) counts.death_timer++;
    const act = rec.input && rec.input.activeId;
    if (typeof act === 'string' && huntIndexOf(rec)[act]) counts.named_hunt++;
    if (rec.spanTo && utcDay(rec.spanFrom) !== utcDay(rec.spanTo)) counts.utc_midnight++;
  }
  const missing = Object.keys(COVERAGE).filter((k) => counts[k] < COVERAGE[k]);
  return { counts, missing };
}

// ── FX-2: the ARM file counts what this guard replays ────────────────────────
function armDigestParity() {
  const sql = readFileSync(join(ROOT, ARM_FILE), 'utf8').replace(/\r\n/g, '\n');
  const n = sql.split(REPLAY_DIGEST_SQL).length - 1;
  return { ok: n === 2, line: `FX-2 ${ARM_FILE} carries REPLAY_DIGEST_SQL verbatim in its P2 (${n}x, want 2: the integrity check and the count)` };
}

// ── the only places a probe record reaches the output ───────────────────────
/* tests/world-tick-seed-no-leak.mjs SL-5 runs both on records carrying seeds
   (reproducing and not) and holds that no seed form appears. */
export function r1Line(rec, rep, app) {
  return { ok: rep.keysOk && rep.reproduced && app.ok,
    line: `R1 probe ${rec.id} (${String(rec.payloadClose).slice(0, 8)}): `
      + `${rep.keysOk ? '14 keys' : rep.keysDetail}; ${rep.detail}; ${app.detail}` };
}
export function attestLines(pin, recs) {
  return [
    `  c_pin      constant text   := '${pin}';`,
    `  c_replayed constant text[] := array[${recs.map((r) => `'${r.id}:${r.digest}'`).join(', ')}]::text[];`,
  ];
}

// ── one read: R1 + R2 + coverage ────────────────────────────────────────────
/**
 * @param ctx { recs, engineOf(rec) -> engine, pinDir, db, caps, replicas, dbPlant, skipR2 }
 * @returns { red: {R1a,R1b,R1c,R2agg,R2input}, missing, lines, r1 }
 */
async function judge(ctx) {
  const red = { R1a: [], R1b: [], R1c: [], R2agg: [], R2input: [] };
  const lines = [];
  const r1 = [];
  for (let i = 0; i < ctx.recs.length; i++) {
    const rec = ctx.recs[i];
    const eng = await ctx.engineOf(rec);
    const rep = replayOne(eng, rec);
    if (!rep.keysOk) red.R1a.push(`probe ${rec.id}: ${rep.keysDetail}`);
    if (!rep.reproduced) red.R1b.push(`probe ${rec.id}: ${rep.detail}`);
    const app = rep.reproduced ? await applyOne(ctx.db, ctx.caps, eng, rec, rep, i, ctx.dbPlant)
      : { ok: false, detail: 'not run (R1b red)' };
    if (rep.reproduced && !app.ok) red.R1c.push(`probe ${rec.id}: ${app.detail}`);
    const l = r1Line(rec, rep, app);
    r1.push({ id: rec.id, payload: rec.payloadClose, ok: l.ok });
    lines.push(l);
  }
  const cov = coverageOf(ctx.recs, (rec) => ctx.huntIndexOf(rec));
  lines.push({ ok: !cov.missing.length, line: `coverage ${JSON.stringify(cov.counts)} (need ${JSON.stringify(COVERAGE)})`
    + (cov.missing.length ? ` — MISSING ${cov.missing.join(', ')}` : '') });
  if (!ctx.skipR2) {
    const r2 = await judgeR2(ctx.pinDir, ctx.recs, ctx.replicas);
    red.R2agg.push(...r2.red.R2agg);
    red.R2input.push(...r2.red.R2input);
    lines.push(...r2.lines);
  }
  return { red, missing: cov.missing, lines, r1 };
}
const arms = (red) => Object.keys(red).filter((k) => red[k].length);

// ── the fixture: five synthetic probes, results from the engine under test ───
/* LOW-NOISE ON PURPOSE. Each input's chain-minus-span spread is <= 1.2 % at 100
   seeds (measured 2026-10-14), so the control is green at 40 seeds with room,
   a 5 % chain bias reads |z| well past 3.29, and an engine edit that re-rolls
   the samples cannot flip the control by noise. The QA Slime spans read 2-6 %
   per input at 40 seeds and are the LIVE read's subject, not the fixture's.
   Between them: >= 2 ate (1, 2), >= 2 deaths with a knock-out timer (3, 4),
   named hunts (1, 2, 3), one UTC-midnight crossing (1), the bow/ammo path (4)
   and a training pointer on the drop table (5). */
const FIX_USER = (i) => `00000000-0000-4000-8000-${String(0xf1c500 + i).padStart(12, '0')}`;
const at = (d, h, m) => Date.UTC(2026, 9, d, h, m, 0);
export function fixtureSpecs() {
  return [
    { id: 1, what: 'auto-eat on the Mill Cellar named hunt, 22:30 UTC (food, crosses midnight)',
      p: sessionProbe(/bag empties/, at(2, 22, 30), FIX_USER(1), 'mill_cellar') },
    { id: 2, what: 'the nine combat inputs on the Bramble Edge named hunt (food)',
      p: sessionProbe(/the NINE combat inputs/, at(3, 3, 0), FIX_USER(2), 'bramble_edge') },
    { id: 3, what: 'opens Knocked Out, on the Mill Cellar named hunt (deaths + recovery timer)',
      p: sessionProbe(/opens Knocked Out/, at(3, 9, 0), FIX_USER(3), 'mill_cellar') },
    { id: 4, what: 'a bow user against rats (deaths + recovery timer, the ammo path)',
      p: sessionProbe(/bow user vs rat/, at(3, 14, 0), FIX_USER(4)) },
    { id: 5, what: 'the away goblin grind (drop table, training pointer)',
      p: sessionProbe(/away goblin grind/, at(4, 2, 0), FIX_USER(5)) },
  ].map((x) => Object.assign(x, { p: asStored(x.p) }));
}
const isoPg = (ms) => new Date(ms).toISOString().replace('Z', '+00:00');
/** Records as production stores them; the result is the engine's own, on the synthetic seed. */
export function fixtureRecords(eng, tag) {
  return fixtureSpecs().map(({ id, p }) => {
    const seed = offlineSeedFor(p.input.userId, p.input.slot, p.input.accruedToText);
    const result = JSON.parse(JSON.stringify(eng.probe.probeResultOf(eng.probe.oneSpan('combat', p.input, p.fromMs, p.toMs, seed))));
    return { id, payloadOpen: tag, payloadClose: tag, spanFrom: isoPg(p.fromMs), spanTo: isoPg(p.toMs),
      input: JSON.parse(JSON.stringify(p.input)), seed, result };
  });
}

// ── the production read ─────────────────────────────────────────────────────
const PROJECT = 'nezapsylztqbbwuwembx';
const URL_Q = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
export const LIVE_QUERY = `
with pay as (
  select payload, max(at) as last_at
    from (select payload_open as payload, opened_at as at from public.hr_tick_probe
          union all
          select payload_close, closed_at from public.hr_tick_probe where payload_close is not null) x
   group by payload
   order by max(at) desc
   limit 3)
select pay.payload as pay_payload, to_jsonb(pay.last_at) #>> '{}' as pay_last_at,
       p.id, p.payload_open, p.payload_close,
       to_jsonb(p.span_from) #>> '{}' as span_from, to_jsonb(p.span_to) #>> '{}' as span_to,
       p.input, p.seed, p.result, (p.input_trimmed_at is not null) as trimmed,
       ${REPLAY_DIGEST_SQL} as digest
  from pay
  left join public.hr_tick_probe p
    on p.payload_close = pay.payload and p.channel = 'combat' and p.status = 'closed'
 order by pay.last_at desc, p.id`;

async function liveRead() {
  if (!selectOnly(LIVE_QUERY)) throw new EngineHarnessError('refusing — the live query is not SELECT-only');
  const token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
  const res = await fetch(URL_Q, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: LIVE_QUERY }),
  });
  const text = await res.text();
  if (!res.ok) throw new EngineHarnessError(`management endpoint HTTP ${res.status}: ${text.slice(0, 200)}`);
  const rows = JSON.parse(text);
  const payloads = [...new Set(rows.map((r) => r.pay_payload))];
  const recs = [];
  let trimmed = 0;
  for (const r of rows) {
    if (r.id == null) continue;
    if (r.trimmed) { trimmed++; continue; }
    recs.push({ id: Number(r.id), payloadOpen: r.payload_open, payloadClose: r.payload_close, spanFrom: r.span_from,
      spanTo: r.span_to, input: r.input, seed: seedOfRow(r), result: r.result, digest: r.digest });
  }
  return { recs, payloads, trimmed };
}

// ── main ────────────────────────────────────────────────────────────────────
function print(lines) {
  for (const l of lines) console.log(`  ${l.ok ? '✓' : '✗'} ${l.line}`);
}
function replicasFor(dflt) {
  const v = argOf('--replicas');
  const r = v === null ? dflt : Math.floor(Number(v));
  if (!(r >= BAR.minReplicas)) throw new EngineHarnessError(`--replicas ${v}: R2 needs >= ${BAR.minReplicas} seeds per input`);
  return r;
}
async function bootDb() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const { db } = await bootReplay({});
  return { db, caps: await replayCaps(db) };
}

async function runLive() {
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    console.error('world-tick-combat-replay: refusing — the production read never runs in CI; CI runs the fixture and --mutate');
    process.exit(2);
  }
  const replicas = replicasFor(160);
  const pin = argOf('--pin') || await fetchLivePayloadHash();
  if (!/^[0-9a-f]{64}$/.test(String(pin))) throw new EngineHarnessError(`the pin is not a 64-hex payload (${String(pin).slice(0, 20)})`);
  const { recs, payloads, trimmed } = await liveRead();
  const map = await readPayloadMap();
  const engines = new Map();
  const engineOf = async (h) => {
    if (!engines.has(h)) engines.set(h, await engineForPayload(h, map));
    return engines.get(h);
  };
  const pinEng = await engineOf(pin);
  console.log(`\nworld-tick-combat-replay --live: ${recs.length} closed combat probes on the last ${payloads.length} payloads `
    + `[${payloads.map((h) => String(h).slice(0, 8)).join(', ')}] (${trimmed} past retention, not read); `
    + `pin ${pin.slice(0, 8)} = ${pinEng.commit.slice(0, 8)}${payloads.includes(pin) ? '' : ' (NOT among them)'}`);
  for (const h of new Set(recs.map((r) => r.payloadClose))) {
    const e = await engineOf(h);
    console.log(`  engine ${h.slice(0, 8)} = commit ${e.commit.slice(0, 8)} (re-packed: hash matches)`);
  }
  const { db, caps } = await bootDb();
  const fx2 = armDigestParity();
  const out = await judge({ recs, engineOf: (rec) => engineOf(rec.payloadClose), pinDir: pinEng.dir, db, caps, replicas,
    huntIndexOf: (rec) => engines.get(rec.payloadClose).huntIndex });
  await db.close();
  print([...out.lines, fx2]);
  const exact = out.r1.filter((x) => x.ok).length;
  const redArms = arms(out.red);
  console.log(`\n${exact}/${recs.length} recorded probes replay exactly (R1a+R1b+R1c).`);
  if (redArms.length || !fx2.ok) {
    console.log(`RED: ${[...redArms, ...(fx2.ok ? [] : ['FX-2'])].join(', ')}`);
    for (const k of redArms) for (const m of out.red[k].slice(0, 6)) console.log(`  - ${k} ${m}`);
    return 1;
  }
  if (out.missing.length) {
    console.log(`NOT PROVEN (exit 2): coverage missing ${out.missing.join(', ')} — wait for the probes; never a pass`);
    return 2;
  }
  console.log('GREEN: every recorded probe replays exactly on its own payload, the pin\'s chain pays what one span pays, coverage met');
  if (ATTEST) {
    const onPin = recs.filter((r) => r.payloadOpen === pin && r.payloadClose === pin && out.r1.find((x) => x.id === r.id).ok);
    console.log(`\n-- ${onPin.length} replayed probes on the pin (the ARM file's P2 needs >= 4, >= 2 ate, >= 2 deaths, >= 1 named hunt):`);
    for (const l of attestLines(pin, onPin)) console.log(l);
  }
  return 0;
}

async function fixtureAssertions(eng) {
  const lines = [];
  const keys = Object.keys(eng.probe.probeResultOf({ accrued: false, reason: 'fixture' })).sort();
  lines.push({ ok: canon(keys) === canon([...RESULT_KEYS].sort()),
    line: `FX-1 the engine's probeResultOf emits exactly the ${RESULT_KEYS.length} result keys (${keys.length})` });
  lines.push(armDigestParity());
  /* FX-3 the payload resolver: HEAD re-packed by its own packer is accepted
     under its own hash and REFUSED under any other (a lying map entry). */
  let ok = false;
  let detail = '';
  try {
    const t = await extractTree('HEAD');
    const h = await packHashOf(t.dir);
    const good = await engineForPayload(h, { [h]: t.commit });
    let refused = false;
    try { await engineForPayload('f'.repeat(64), { ['f'.repeat(64)]: t.commit }); } catch (e) { refused = e instanceof EngineHarnessError; }
    ok = good.hash === h && refused;
    detail = `HEAD ${t.commit.slice(0, 8)} packs to ${h.slice(0, 8)}: accepted under it, ${refused ? 'refused' : 'ACCEPTED'} under another`;
  } catch (e) { detail = `threw: ${String(e.message).slice(0, 160)}`; }
  lines.push({ ok, line: `FX-3 the payload resolver: ${detail}` });
  return lines;
}

/* ── --mutate: one defect each, every one RED on its named arm ─────────────── */
const TC = 'supabase/functions/hr-accrue/tick-combat.js';
const chainPlant = (factor, cond) => ({
  file: TC,
  find: '    const res = combatTick(char, watermarkMs, watermarkText, clock, o);\n',
  repl: '    const res = combatTick(char, watermarkMs, watermarkText, clock, o);\n'
    + `    if (res.accrued && (${cond})) { const F = ${factor}; const d = res.delta; const acc = (o.__plant = o.__plant || {});\n`
    + '      const bump = (k, v) => { acc[k] = (acc[k] || 0) + v * (F - 1); const add = Math.floor(acc[k]); acc[k] -= add; return v + add; };\n'
    + "      d.gold = bump('gold', d.gold || 0);\n"
    + "      for (const k of Object.keys(d.xp || {})) d.xp[k] = bump('xp:' + k, d.xp[k]);\n"
    + "      if (d.journal && d.journal.meta) d.journal.meta.kills = bump('kills', d.journal.meta.kills || 0); }\n",
});
const MUTANTS = [
  { id: 'resultKeyDropped', want: 'R1a', why: 'a stored result lost a key (13 of 14)',
    recs: (rs) => { delete rs[0].result.stopped; } },
  { id: 'seedFlipped', want: 'R1b', why: 'a stored seed is one bit off — the probe cannot be this engine\'s',
    recs: (rs) => { rs[1].seed = (rs[1].seed ^ 1) >>> 0; } },
  { id: 'oneSpanOtherStream', want: 'R1b', why: 'the engine\'s one span draws another stream than the one that recorded',
    engine: [{ file: 'supabase/functions/hr-accrue/tick-probe.js',
      find: '    combatTick(char, fromMs, char.accruedToText, toMs, { seedOf: () => seed }),',
      repl: '    combatTick(char, fromMs, char.accruedToText, toMs, { seedOf: () => (seed ^ 1) >>> 0 }),' }] },
  { id: 'serverPaysLess', want: 'R1c', why: 'hr_apply writes one gold less than the engine proposed',
    db: `create function public.__plant_gold() returns trigger language plpgsql as $p$
           begin if new.gold > old.gold then new.gold := new.gold - 1; end if; return new; end $p$;
         create trigger __plant_gold before update on public.player_state
           for each row execute function public.__plant_gold();` },
  { id: 'journalMiscounts', want: 'R1c', why: 'the accrue ledger row journals one kill more than the result',
    db: `create function public.__plant_kills() returns trigger language plpgsql as $p$
           begin if new.intent = 'accrue' and new.meta ? 'kills' then
             new.meta := jsonb_set(new.meta, '{kills}', to_jsonb((new.meta->>'kills')::int + 1)); end if; return new; end $p$;
         create trigger __plant_kills before insert on public.player_ledger
           for each row execute function public.__plant_kills();` },
  { id: 'chainOverpays15', want: 'R2agg', why: 'the tick chain pays every window 15 % more gold, XP and kills', engine: [chainPlant(1.15, 'true')] },
  { id: 'chainBias5', want: 'R2agg', why: 'a 5 % chain bias: inside +-6 %, caught by |z| > 3.29', engine: [chainPlant(1.05, 'true')] },
  { id: 'chainOverpaysOneInput', want: 'R2input', why: 'the chain over-pays ONE input (the bow user vs rats) by 25 %',
    engine: [chainPlant(1.25, "char.activeId === 'rat'")] },
  { id: 'noNamedHunt', want: 'cov:named_hunt', why: 'no probe on a named hunt', drop: [1, 2, 3] },
  { id: 'noMidnight', want: 'cov:utc_midnight', why: 'no probe crosses UTC midnight', drop: [1] },
  { id: 'oneEating', want: 'cov:ate', why: 'only one probe ate', drop: [2] },
  { id: 'oneDeath', want: 'cov:death_timer', why: 'only one probe died with a knock-out timer', drop: [4] },
];

async function runFixture() {
  const replicas = replicasFor(BAR.minReplicas);
  const base = await engineAt(ROOT);
  const { db, caps } = await bootDb();
  const control = fixtureRecords(base, 'fixture');
  const run = (eng, recs, extra) => judge(Object.assign({
    recs, engineOf: () => eng, pinDir: eng.dir, db, caps, replicas, huntIndexOf: () => eng.huntIndex,
  }, extra || {}));

  if (!MUTATE) {
    console.log(`\nworld-tick-combat-replay (fixture): ${control.length} synthetic probes on this checkout's engine`);
    for (const s of fixtureSpecs()) console.log(`  · probe ${s.id}: ${s.what}`);
    const fx = await fixtureAssertions(base);
    const out = await run(base, control);
    await db.close();
    print([...fx, ...out.lines]);
    const redArms = arms(out.red);
    const fxRed = fx.filter((l) => !l.ok).length;
    if (redArms.length || fxRed) { console.log(`\nRED: ${[...redArms, ...(fxRed ? ['FX'] : [])].join(', ')}`); return 1; }
    if (out.missing.length) { console.log(`\nNOT PROVEN (exit 2): coverage missing ${out.missing.join(', ')}`); return 2; }
    console.log('\nGREEN: R1 (keys, exact replay, hr_apply state + ledger) and R2 (+-6 %, |z| <= 3.29, per input <= +10 %) on the fixture, coverage met');
    return 0;
  }

  console.log('\nworld-tick-combat-replay --mutate: every planted defect must go RED on its named arm');
  const ctl = await run(base, control);
  if (arms(ctl.red).length || ctl.missing.length) {
    console.error(`harness: the unmutated control is not green (${[...arms(ctl.red), ...ctl.missing].join(', ')})`);
    await db.close();
    return 2;
  }
  console.log(`[mutants] ${MUTANTS.length}`);
  let survived = 0;
  for (const m of MUTANTS) {
    const recs = fixtureRecords(base, 'fixture');
    let eng = base;
    if (!CONTROL) {
      if (m.recs) m.recs(recs);
      if (m.engine) eng = await engineAt(await plantedTree(ROOT, m.engine));
    }
    const kept = CONTROL || !m.drop ? recs : recs.filter((r) => !m.drop.includes(r.id));
    const needR2 = Boolean(m.engine) && !CONTROL;
    const out = await run(eng, kept, { dbPlant: CONTROL ? null : (m.db || null), skipR2: !needR2 && !m.want.startsWith('R2') });
    const hit = m.want.startsWith('cov:') ? out.missing.includes(m.want.slice(4)) : out.red[m.want].length > 0;
    console.log(`[mutant] ${m.id} ${hit ? 'caught' : 'survived'}`);
    const got = [...arms(out.red), ...out.missing.map((k) => `cov:${k}`)];
    if (hit) console.log(`  ✓ ${m.id} — ${m.why}: RED via ${got.join(', ')}`);
    else { survived++; console.log(`  ✗ ${m.id} — ${m.why}: ${got.length ? `red only via ${got.join(', ')}` : 'SURVIVED'}`); }
  }
  await db.close();
  if (CONTROL) {
    console.log(`\nHR_MUTANT_CONTROL: nothing planted; ${MUTANTS.length - survived} arm(s) read caught`);
    return survived === MUTANTS.length ? 0 : 1;
  }
  console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
  return survived ? 1 : 0;
}

const isMain = (process.argv[1] || '').replace(/\\/g, '/').endsWith('tests/world-tick-combat-replay.mjs');
if (isMain) {
  let code;
  try {
    code = LIVE ? await runLive() : await runFixture();
  } catch (e) {
    console.error(`world-tick-combat-replay: harness — ${e instanceof EngineHarnessError ? e.message : (e.stack || e)}`);
    code = 2;
  } finally {
    await dropTrees();
  }
  process.exit(code);
}
