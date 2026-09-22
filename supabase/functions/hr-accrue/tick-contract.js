// ============================================================================
// supabase/functions/hr-accrue/tick-contract.js — the WORLD TICK CONTRACT, v1.
//
// The tick service is NOT a new engine. It is a new CALLER of the engine the
// Edge Function already runs (`supabase/functions/hr-accrue/accrual.js`
// `computeAccrual`), which itself runs `src/core/*`. This file holds the three
// rules that make "run the same engine every 10 seconds" produce the same
// answer as "run it once over the whole span", plus the fold law that turns a
// sequence of proposed deltas into one proposed delta.
//
// NOTHING HERE WRITES. No Supabase client, no fetch, no fs. Shadow mode is
// "compute the delta hr_apply WOULD be handed, and throw it away".
//
// Read docs/planning/WORLD_TICK_DESIGN.md before changing anything below; each
// rule is there with the measurement that motivated it.
//
// PURE ESM, Node + Deno. Lives IN the edge payload because the op:'tick' entry
// runs it; `services/world-tick/contract.js` re-exports it so the offline guards
// and the replay tool keep ONE copy (AWAY-12). No `?v=` (not under src/**).
// ============================================================================

/* ── RULE 1: TICK-ALIGNED WINDOWS ───────────────────────────────────────────
   `simulateSpan` (src/core/combat-sim.js) budgets a segment as
   `seg.ms * rate + carryMs`, takes `floor(budget / tickMs)` ticks, and keeps the
   remainder in `carryMs` — a LOCAL that is initialised to 0 on every call and
   is not part of any checkpoint the delta carries.

   Consequence, and it is the single biggest hazard of decomposing a span: split
   a span into windows whose length is not a whole multiple of the character's
   `tickMs` and every window silently throws its remainder away. At the default
   2400 ms combat tick a 10 s cadence loses 400 ms per window — 4% of every
   character's night, compounding, invisible, and in the UNDERPAYING direction
   (which is why nobody would report it as a dupe and everybody would report it
   as "away feels worse than playing").

   The fix costs nothing and needs no engine change: the world tick's CADENCE is
   10 s, but the window it settles is snapped DOWN to the last instant that is a
   whole number of `tickMs` from the session anchor. The unsettled remainder is
   not lost — it is simply still unsettled, and the next tick's window starts
   where this one ended. Time is conserved exactly. */
export function alignWindow(anchorMs, fromMs, toMs, tickMs) {
  const t = Math.floor(Number(tickMs) || 0);
  if (!(t > 0)) throw new Error('alignWindow: tickMs must be a positive integer');
  const a = Math.floor(Number(anchorMs) || 0);
  const snap = (ms) => a + Math.floor((ms - a) / t) * t;
  const from = snap(fromMs);
  const to = snap(toMs);
  /* `to <= from` is not an error: it is a character whose cadence tick landed
     inside one of its own combat ticks. It settles nothing and waits. */
  return { fromMs: from, toMs: to, ms: Math.max(0, to - from) };
}

/* Walk [fromMs, toMs] as a sequence of cadence windows, each snapped by
   alignWindow. The LAST window's `toMs` is the last aligned instant at or
   before `toMs`; the tail after it is deliberately left unsettled. */
export function planWindows(anchorMs, fromMs, toMs, cadenceMs, tickMs) {
  const out = [];
  let cursor = alignWindow(anchorMs, fromMs, fromMs, tickMs).fromMs;
  const end = alignWindow(anchorMs, fromMs, toMs, tickMs).toMs;
  while (cursor < end) {
    const w = alignWindow(anchorMs, cursor, Math.min(cursor + cadenceMs, end), tickMs);
    if (w.ms <= 0) {
      /* A cadence shorter than one combat tick snaps to zero. Advance by a
         whole combat tick instead of spinning: the world clock is 10 s, but a
         character whose tick is slower than the cadence settles less often. */
      const next = w.fromMs + tickMs;
      if (next > end) break;
      out.push({ fromMs: w.fromMs, toMs: next, ms: tickMs });
      cursor = next;
      continue;
    }
    out.push(w);
    cursor = w.toMs;
  }
  return out;
}

/* ── RULE 2: THE FOLD LAW ───────────────────────────────────────────────────
   A proposed delta has three kinds of key and confusing them is a dupe or a
   loss. The classification is stated here ONCE and the shadow comparator is the
   only reader; step 2 replaces the fold entirely (each tick applies through
   hr_apply, which already knows each key's arithmetic).

     ADDITIVE   the key is a signed movement; folding is addition.
     ABSOLUTE   the key is a CHECKPOINT of resulting state; folding is "last
                window wins". accrual.js's own header calls these out by name:
                `fight`, `tool_carry`, `ammo_carry`, `recovering_until`,
                `consec_falls`, `accrued_to`, `hp`, `activity`.
     APPEND     the key is a list of events; folding is concatenation, and the
                per-call clamp (MAX_DEATH_ROWS, the progress-op cap) must be
                re-checked AFTER the fold, never only per window. */
export const ADDITIVE_SCALAR = Object.freeze(['gold']);
export const ADDITIVE_MAP = Object.freeze(['xp', 'items']);
export const ABSOLUTE = Object.freeze([
  'accrued_to', 'hp', 'fight', 'activity',
  'recovering_until', 'ammo_carry', 'tool_carry', 'consec_falls',
]);
export const APPEND = Object.freeze(['deaths', 'progress', 'hearthfind']);

export function foldDeltas(deltas) {
  const out = {};
  for (const d of deltas) {
    if (!d) continue;
    for (const k of Object.keys(d)) {
      const v = d[k];
      if (k === 'journal') continue;                     // folded separately below
      if (ADDITIVE_SCALAR.includes(k)) { out[k] = (out[k] || 0) + Number(v || 0); continue; }
      if (ADDITIVE_MAP.includes(k)) {
        const m = out[k] || (out[k] = {});
        for (const id of Object.keys(v || {})) m[id] = (m[id] || 0) + Number(v[id] || 0);
        continue;
      }
      if (ABSOLUTE.includes(k)) { out[k] = v; continue; }
      if (APPEND.includes(k)) {
        const a = out[k] || (out[k] = []);
        if (Array.isArray(v)) a.push(...v); else a.push(v);
        continue;
      }
      /* FAIL LOUD. An unclassified key is exactly the failure this file
         exists to prevent: hr_apply refuses an unknown key with a 409, and a
         fold that silently dropped one would make the shadow comparison agree
         with a delta the database would have rejected. */
      throw new Error(`foldDeltas: unclassified delta key "${k}" — classify it in contract.js`);
    }
  }
  /* Zeroed additive keys are DELETED, not kept at 0: accrual.js only emits
     `gold`/`xp`/`items` when non-empty, so keeping a 0 would make a byte
     comparison against the single-span delta fail for a non-reason. */
  for (const k of ADDITIVE_SCALAR) if (out[k] === 0) delete out[k];
  for (const k of ADDITIVE_MAP) {
    if (!out[k]) continue;
    for (const id of Object.keys(out[k])) if (out[k][id] === 0) delete out[k][id];
    if (Object.keys(out[k]).length === 0) delete out[k];
  }
  return out;
}

/* ── RULE 3: WHAT A TICK IS ALLOWED TO BE COMPARED ON ───────────────────────
   The value summary. Deliberately NOT the whole delta: the journal's `meta.ms`
   and `meta.ticks` are per-call aggregates and a 60-window night journals 60
   rows' worth of meta that one call states once. Folding those is a reporting
   decision (see the design doc's journalling section), not a parity fact.
   Everything a player can SPEND or RANK on is here. */
export function valueSummary(res) {
  if (!res || !res.accrued) return { accrued: false, reason: (res && res.reason) || null };
  const s = res.summary || {};
  const d = res.delta || {};
  return {
    accrued: true,
    gold: Number(d.gold || 0),
    xp: sortedMap(d.xp),
    items: sortedMap(d.items),
    hp: Number(d.hp || 0),
    fight: d.fight || null,
    recovering_until: typeof d.recovering_until === 'undefined' ? undefined : d.recovering_until,
    consec_falls: d.consec_falls,
    kills: Number(s.kills || 0),
    ticks: Number(s.ticks || 0),
    crits: Number(s.crits || 0),
    deaths: Number(s.deaths || 0),
    foodEaten: Number(res.foodEaten || 0),
  };
}

/* Time only. The half of parity that decomposition CAN satisfy today without
   an engine seam, and the half the alignment rule is there to protect. */
export function timeSummary(res) {
  const s = (res && res.summary) || {};
  return {
    ticks: Number(s.ticks || 0),
    recoverMs: Number(s.recoverMs || 0),
    grantMs: Number((res && res.grantMs) || 0),
  };
}

function sortedMap(m) {
  const out = {};
  for (const k of Object.keys(m || {}).sort()) out[k] = Number(m[k] || 0);
  return out;
}

export function addTime(a, b) {
  return {
    ticks: a.ticks + b.ticks,
    recoverMs: a.recoverMs + b.recoverMs,
    grantMs: a.grantMs + b.grantMs,
  };
}

export const ZERO_TIME = Object.freeze({ ticks: 0, recoverMs: 0, grantMs: 0 });
