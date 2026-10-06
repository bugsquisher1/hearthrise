// ============================================================================
// supabase/functions/hr-accrue/tick-probe.js — THE SHADOW PARITY PROBE.
//
// Security ruling 1, docs/planning/SEC_WORLD_TICK_ARM_2026-10-05.md: every 4 h
// per rostered shadow character, run ONE single-span accrual over the same span
// the shadow windows tiled, from the same input and the same seed, so the
// decomposition (fold, RULE-1 alignment, carry/checkpoint continuity, recovery
// resumes, seed labelling, starvation) can be read against one call with no
// offline-cap artefact in the comparison.
//
// ── THE LIFECYCLE, AND WHY IT IS TWO-PHASE ─────────────────────────────────
// A probe OPENS on the shadow window that contains this character's probe
// boundary B_k: the snapshot stored is the session that window was settled
// FROM (ruling 1, rule 4: "input is the snapshot at t0, not a re-read at t1"),
// so span_from is that window's start. It CLOSES on the window that contains
// B_{k+1} = B_k + 4 h: the one-span accrual runs over [span_from, that window's
// end] — a real shadow window boundary on BOTH sides, so the chain it is read
// against tiles the span exactly and no partial window enters the comparison.
// Computing at open time cannot do that: a shadow window ends where the engine
// settled (an action boundary), which is not knowable four hours early.
//
// The boundary grid is staggered per character (`probeOffsetMs`), so a fleet's
// probes do not all close in the same fire, and it is a PURE function of the
// window — a fire spends a database round trip on the probe only on the one
// window in ~160 that contains a boundary.
//
// ── WHAT THIS FILE NEVER DOES ──────────────────────────────────────────────
//   • never writes: it builds the snapshot and the result; tick.js hands them
//     to `hr_tick_probe_commit`, whose only write target is `hr_tick_probe`;
//   • never advances or reseeds the chain: every function here reads a deep
//     COPY of the session, never `run.char`, never the carrier;
//   • never computes a number of its own: the one-span answer is the
//     channel's own poll (`gatherTick` / `combatTick` → `computeAccrual`),
//     the same functions every shadow window calls (AWAY-12).
//
// PURE ESM, Node + Deno. No `?v=` (not under src/**).
// ============================================================================

import { createHash } from 'node:crypto';

import { hydrate } from './tick-shadow.js';
import { CHANNEL as GATHER_CHANNEL, gatherTick } from './tick-gather.js';
import { CHANNEL as COMBAT_CHANNEL, combatTick } from './tick-combat.js';
import { PAYLOAD_SHA256 } from './payload-hash.js';

/* The probe span (ruling 1: "every 4 h"). The SQL side restates the floor and
   the ceiling as `c_min_span` / `c_max_span` in
   2026-10-06-world-tick-parity-probe.sql, and the guard reads both. */
export const PROBE_SPAN_MS = 4 * 3600 * 1000;

/* A closing window ends at least one boundary step past span_from, and at most
   one boundary step plus two flush windows (the opening window started up to
   one flush before B_k; the closing one ends up to one flush after B_{k+1}).
   FLUSH_MS_MAX is 900 s, so 4 h 30 m bounds every honest span; six hours
   leaves room for an action-boundary lag and refuses anything wider. */
export const PROBE_MAX_SPAN_MS = 6 * 3600 * 1000;

/* The two storage bounds, declared twice and agreeing with the table CHECKs. */
export const MAX_PROBE_INPUT_BYTES = 65536;
export const MAX_PROBE_RESULT_BYTES = 16384;

/* BLAST RADIUS. A probe close is one 4 h single-span engine call; at a 90 s
   flush and a staggered grid a 200-character fire meets ~1.25 boundaries, so
   four is headroom, and a fire that meets more defers nothing — the excess
   probes are simply not opened or closed this cycle and read as discarded. */
export const MAX_PROBES_PER_FIRE = 4;

/* The channels a probe can price. Same dispatch rule as tick.js CHANNELS:
   a kind with no entry is never probed under another channel's rules. */
const ONE_SPAN = Object.freeze({
  [GATHER_CHANNEL]: (char, fromMs, toMs, seed) =>
    gatherTick(char, fromMs, toMs, { seedOf: () => seed }),
  [COMBAT_CHANNEL]: (char, fromMs, toMs, seed) =>
    combatTick(char, fromMs, char.accruedToText, toMs, { seedOf: () => seed }),
});
export const PROBE_CHANNELS = Object.freeze(Object.keys(ONE_SPAN));

/* ── THE STAGGER ────────────────────────────────────────────────────────────
   A stable per-character phase in [0, PROBE_SPAN_MS). A hash, not a random
   draw: the boundary must be the same on every fire and every isolate, and it
   is a scheduling choice with no value attached — a character that could pick
   its own phase picks only WHEN it is measured, never what. */
export function probeOffsetMs(userId, slot) {
  const h = createHash('sha256')
    .update(`hearthrise:world-tick-probe:v1\n${String(userId).toLowerCase()}:${Number(slot)}`)
    .digest();
  return h.readUIntBE(0, 6) % PROBE_SPAN_MS;
}

/* The boundary B with fromMs < B <= toMs on this character's grid, or null.
   A flush window is far shorter than the span, so there is at most one. */
export function probeBoundaryIn(userId, slot, fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return null;
  const off = probeOffsetMs(userId, slot);
  const k = Math.floor((toMs - off) / PROBE_SPAN_MS);
  const b = off + k * PROBE_SPAN_MS;
  return (b > fromMs && b <= toMs) ? b : null;
}

/* ── THE SNAPSHOT, AND WHY PLAIN JSON IS LOSSLESS HERE ──────────────────────
   Every settler reaches the engine through `hydrate(session)`
   (tick-shadow.js), which IS a JSON round trip: an `undefined` key is already
   absent and a NaN is already `null` by the time `computeAccrual` reads it.
   So the JSON form of the session is byte-for-byte the input every shadow
   window of the span was built from, and storing exactly that — rather than a
   richer encoding the engine never sees — is what makes "same input" (rule 4)
   a property of the bytes. tests/world-tick-parity-probe.mjs PP-2c asserts
   `hydrate(decode(encode(s)))` deep-equals `hydrate(s)` on the live session.

   `_`-prefixed scratch (the carrier's `_chain`) is dropped: it is never an
   engine input (`engineStateOf` forwards ENGINE_STATE_KEYS only) and it is
   the one field that would make the snapshot grow with the chain. Returns
   null past the column bound; a probe that cannot store its input does not
   open, which costs one measurement and nothing else. */
export function encodeProbeInput(session) {
  const s = {};
  for (const k of Object.keys(session || {})) if (!k.startsWith('_')) s[k] = session[k];
  const text = JSON.stringify(s);
  if (new TextEncoder().encode(text).byteLength > MAX_PROBE_INPUT_BYTES) return null;
  return JSON.parse(text);
}

export function decodeProbeInput(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    throw new Error('probe snapshot: the stored input is not an object');
  }
  return JSON.parse(JSON.stringify(stored));
}

/* ── THE ONE-SPAN ACCRUAL ───────────────────────────────────────────────────
   One poll over the whole span through the channel's own tick function, from
   a hydrated COPY of the snapshot, on the seed of the span's start label (the
   label the first shadow window of the span drew). */
export function oneSpan(channel, session, fromMs, toMs, seed) {
  const f = Object.prototype.hasOwnProperty.call(ONE_SPAN, channel) ? ONE_SPAN[channel] : null;
  if (!f) throw new Error(`probe: channel "${channel}" has no one-span driver`);
  if (!Number.isFinite(seed)) throw new Error('probe: no seed — a probe never runs on a fallback stream');
  const char = hydrate(session);
  return f(char, fromMs, toMs, seed);
}

const n0 = (v) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : 0);
function signedMap(m) {
  const out = {};
  for (const k of Object.keys(m || {}).sort()) {
    const v = n0(m[k]);
    if (v !== 0) out[k] = v;
  }
  return out;
}

/* The comparable summary — the SAME fields `hr_tick_shadow` denormalises from
   the delta the fence journals (would_gold, would_qty, would_ticks,
   would_kills, would_ate, would_xp, would_items, would_deaths,
   would_recovering_until), read off the one-span delta by the same paths. */
export function probeResultOf(res) {
  const d = (res && res.accrued && res.delta) || {};
  const meta = (d.journal && d.journal.meta) || {};
  const out = {
    accrued: !!(res && res.accrued),
    reason: res && !res.accrued ? String(res.reason || res.error || 'not_accrued').slice(0, 64) : null,
    accrued_to: d.accrued_to || null,
    gold: n0(d.gold),
    qty: n0(meta.qty),
    ticks: n0(meta.ticks),
    kills: n0(meta.kills),
    ate: n0(meta.ate),
    deaths: Array.isArray(d.deaths) ? d.deaths.length : 0,
    xp: signedMap(d.xp),
    items: signedMap(d.items),
    recovering_until: typeof d.recovering_until === 'string' ? d.recovering_until : null,
    capped: meta.capped === true || (res && res.capped === true),
    stopped: d.activity ? 'activity' : null,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(out)).byteLength;
  if (bytes > MAX_PROBE_RESULT_BYTES) {
    /* Bounded by construction (items and xp keys are catalogue rows); if it
       ever is not, drop the maps rather than the probe and say so. */
    out.items = {}; out.xp = {}; out.truncated = true;
  }
  return out;
}

/* ── THE TWO STATEMENTS ─────────────────────────────────────────────────────
   Both functions are hr_engine-only and both re-check the lease; the commit
   also re-checks that its window is the journalled shadow CHAIN HEAD
   (2026-10-06-world-tick-parity-probe.sql §2/§3). Exported so the guard
   executes these exact bytes. */
export const PROBE_FETCH_SQL =
  'select public.hr_tick_probe_fetch($1::text, $2::uuid, $3::int, $4::text) as r';
export const PROBE_COMMIT_SQL =
  'select public.hr_tick_probe_commit($1::text, $2::uuid, $3::int, $4::text,'
  + ' $5::timestamptz, $6::timestamptz, $7::text, $8::bigint, $9::text::jsonb,'
  + ' $10::text::jsonb) as r';

const undefinedFunction = (e) => String((e && e.code) ?? '') === '42883';

/* ── ONE PROBE STEP, AFTER A JOURNALLED SHADOW WINDOW ───────────────────────
   Returns a short outcome for the fire summary, or null when this window holds
   no probe boundary (the ~159-in-160 case, which costs no round trip).

   o: { holder, userId, slot, channel, session, windowFrom, windowTo,
        budget: {left}, seedLadder: (labels) => Promise<Map<ms, seed>> }
     session     the session THIS window was settled from — the snapshot at
                 windowFrom. Read, never mutated (encode/oneSpan copy it).
     windowFrom  the string the fence was handed as p_window_from, so the
                 commit names the hr_tick_shadow row by its exact bytes. */
export async function probeStep(exec, o) {
  const fromMs = Date.parse(o.windowFrom);
  const toMs = Date.parse(o.windowTo);
  if (probeBoundaryIn(o.userId, o.slot, fromMs, toMs) === null) return null;
  if (!PROBE_CHANNELS.includes(o.channel)) return 'probe_channel_not_probed';
  if (!o.budget || o.budget.left <= 0) return 'probe_budget';
  o.budget.left -= 1;

  let fetched;
  try {
    [fetched] = await exec(PROBE_FETCH_SQL, [o.holder, o.userId, o.slot, o.channel]);
  } catch (e) {
    /* A database that predates the probe: the step is skipped, the fire is
       not. Anything else propagates to the caller's catch and is counted. */
    if (undefinedFunction(e)) return 'probe_absent';
    throw e;
  }
  const got = fetched && fetched.r;
  if (!got || got.ok !== true) return 'probe_refused:' + String((got && got.error) || 'no_answer').slice(0, 40);

  /* CLOSE the open probe, if one is due. The one-span runs on the STORED
     input and on hr_seed over the stored span_from as Postgres renders it —
     never on this fire's session and never on a JS spelling of the instant. */
  let closeId = null;
  let closeResult = null;
  const open = got.open;
  if (open && open.id != null) {
    const spanFromMs = Date.parse(open.span_from);
    if (!(toMs - spanFromMs >= PROBE_SPAN_MS)) return 'probe_not_due';
    closeId = Number(open.id);
    try {
      const seeds = await o.seedLadder([{ ms: spanFromMs, ts: String(open.span_from) }]);
      const seed = seeds.get(spanFromMs);
      closeResult = probeResultOf(oneSpan(o.channel, decodeProbeInput(open.input), spanFromMs, toMs, seed));
    } catch {
      /* No result → the commit VOIDS the probe (`no_result`), which the
         evaluator counts as a discard. Never a guessed number. */
      closeResult = null;
    }
  }

  const openInput = encodeProbeInput(o.session);
  if (closeId === null && openInput === null) return 'probe_input_too_large';
  const [c] = await exec(PROBE_COMMIT_SQL, [
    o.holder, o.userId, o.slot, o.channel, o.windowFrom, o.windowTo, PAYLOAD_SHA256,
    closeId, closeResult === null ? null : JSON.stringify(closeResult),
    openInput === null ? null : JSON.stringify(openInput),
  ]);
  const r = c && c.r;
  if (!r || r.ok !== true) return 'probe_refused:' + String((r && r.error) || 'no_answer').slice(0, 40);
  if (r.closed != null) return 'probe_closed';
  if (Number(r.voided) > 0 && r.opened == null) return 'probe_voided';
  return r.opened != null ? 'probe_opened' : 'probe_noop';
}
