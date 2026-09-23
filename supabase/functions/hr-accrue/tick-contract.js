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

/* ── RULE 4: WHAT THE CHAIN CARRIES BETWEEN FLUSH WINDOWS (2026-09-23) ───────
   Rules 1-3 decompose a span INSIDE one call. This rule is about the seam
   BETWEEN two calls, and it is the one shadow mode gets wrong on production.

   Armed, the carrier is the database: hr_apply writes `hp`, `fight`,
   `recovering_until`, the counters and the bag, and the next fire's
   `hr_state_of` reads them back. SHADOW PAYS NOTHING — deliberately, e15 —
   so `player_state` never moves and every fire re-seeds the character from
   the same row. Measured on production 2026-09-23 16:40 UTC, QA slot 1 armed
   in SHADOW at 15:36 with hp 4/10, no food and auto-eat off: 42 windows in
   62 minutes, `would_deaths = 1` in 41 of them, `would_hp = 4` in ALL of
   them, and `would_recovering_until` ~31 minutes past the end of every one.
   A chained character dies ONCE and then sits inside its own recovery clock
   for the next twenty windows. Forty-one deaths in an hour is not a
   simulation result, it is the absence of one.

   THE CARRIER THEREFORE HAS TO BE EXPLICIT, and this is its whole definition.
   It is NOT a second copy of hr_apply: nothing here computes a delta, decides
   whether one may land, or clamps anything. It SERIALISES the continuation
   object `advance()` already produces — the same object the attended loop and
   the parity harness hold between windows — and reads it back.

   ── WHAT IS CARRIED, AND WHY EACH ONE HAS TO BE ────────────────────────────
   ABSOLUTE (the ABSOLUTE list above, minus `accrued_to` which the fence's own
   `shadow_accrued_to` already chains):
     hp                a window that starts at the row's hp re-fights from full
     recovering_until  the knockout never sticks; this is the measured defect
     consec_falls      `retreatAtFall` never fires, so the pointer never ends
     fight             every window restarts the foe at full HP: kills inflate
     ammo_carry        the sub-action remainder is forfeit every window
     tool_carry        the same, on gather, and it is forfeit TODAY
     activity          a pointer the engine idled keeps being settled
   ADDITIVE, as CUMULATIVE MOVEMENT rather than as an absolute:
     gold, xp, items   the bag is the one input the engine SPENDS. Without it
                       auto-eat eats the SAME food every window — the shadow
                       reads as a character with an infinite larder, which is
                       the PAYING direction.
   COUNTERS hr_apply would have written from the delta's own `progress` ops,
   summed off THAT list rather than re-derived (there is no rule here, only a
   sum of the engine's own output):
     deaths_today / deaths_lifetime   `recoveryFor()` prices every fall from
                       these. Dropped, a character six falls into the day is
                       handed the first-death novice grace, every window,
                       forever. Less knockout is more paying time: a mint.
     vigour_spent_min  the daily budget refills itself every window, so
                       `vigourMult` never decays. Also a mint.
   And `bestiary_kills`, the charm index's counter, which `advance()` already
   maintains from `summary.kills`.

   ── WHAT IS DELIBERATELY NOT CARRIED, EACH WITH ITS REASON ─────────────────
     maxHp             hr_apply DERIVES it on a level-up and the engine emits
                       no delta key for it. Carrying it would mean writing
                       hr_apply's derivation here, which is the one thing this
                       file exists to refuse. UNDER-paying, and named.
     hearthfindReady   `hr_state_of` projects the LITERAL `true`
                       (2026-09-08-hearthfind.sql L466: "Always true once this
                       has run … not a feature flag"). There is nothing for
                       hr_apply to clear and so nothing to chain.
     combatXpAccruedToMs  moved ONLY by hr_credit_combat_xp, never by a settle
                       delta. A tick cannot advance it and must not pretend to.
     buffs             the engine proposes no delta key: the queue is drained
                       IN the simulation for pricing and the durable expiry is
                       the ABSOLUTE `until` the server already holds, so the
                       envelope's copy stays correct window after window.
     version, gems     no settle moves them, and in shadow nothing moves at all.
     equipment, enchant, combatStyle, the auto-eat trio, huntStance, huntStop,
     traits, perks     read-only inputs. No delta key touches one.

   ── THE BOUND (design constraint 6) ────────────────────────────────────────
   `inventory` can be hundreds of stacks and this object rides a column on
   every ticked character's ownership row. So the maps hold ONLY the keys the
   window actually moved, and they are CUMULATIVE, so a chain's `items` map is
   bounded by the drop table plus the auto-eat foods reachable from ONE
   pointer — measured at 6 keys over a ten-minute goblin grind. The caps below
   are the hard ceiling, and BREACHING ONE IS NOT A CLAMP: `shadowStateOf`
   returns null, the driver sends no state, and the next window re-seeds from
   `hr_state_of`. A chain that restarts is a measurement that under-reports;
   a chain that silently drops half its bag is a measurement that lies. */
export const SHADOW_STATE_V = 1;
export const MAX_SHADOW_XP_KEYS = 32;
export const MAX_SHADOW_ITEM_KEYS = 64;
export const MAX_SHADOW_BESTIARY_KEYS = 16;
/* The column's own ceiling, restated from the CHECK constraint in
   2026-09-23-world-tick-shadow-state-chain.sql §1 so the edge refuses to send
   what the database would refuse to store. 16 KiB against a measured ~700 B. */
export const MAX_SHADOW_STATE_BYTES = 16384;

/* The two counters the engine files as `progress` ops, read back off that list.
   `stat:deaths` under period '' is lifetime and under a UTC day key is today's;
   `daily:ev:vigour_min` is the hunt's charge. Summing the engine's own ops is
   not arithmetic of our own — it is the same number, read where it was put. */
export function countersFromProgress(progress) {
  let deathsLifetime = 0;
  let deathsToday = 0;
  let vigourMin = 0;
  for (const op of progress || []) {
    if (!op) continue;
    const add = Math.floor(Number(op.add) || 0);
    if (add <= 0) continue;
    if (op.kind === 'stat' && op.key === 'deaths') {
      if (op.period === '' || op.period == null) deathsLifetime += add;
      else deathsToday += add;
      continue;
    }
    if (op.kind === 'daily' && op.key === 'ev:vigour_min') vigourMin += add;
  }
  return { deathsLifetime, deathsToday, vigourMin };
}

/* Serialise the continuation object `advance()` holds into the bounded jsonb
   the fence stores verbatim. `baseVersion` is `player_state.version` as the
   chain STARTED — the overlay is dropped when it no longer matches, so any
   real write to the character (a purchase, a claim, a client accrue) ends the
   chain rather than being papered over by a stale proposal.
   Returns null when there is nothing to carry or when the bound is breached. */
export function shadowStateOf(char, opts) {
  const c = char || {};
  const o = opts || {};
  const chain = c._chain || {};
  const trim = (m, cap) => {
    if (!m) return null;
    const keys = Object.keys(m).filter((k) => Number(m[k]) !== 0);
    if (keys.length === 0) return null;
    if (keys.length > cap) return false;            // false = the bound broke
    const out = {};
    for (const k of keys.sort()) out[k] = Number(m[k]);
    return out;
  };
  const xp = trim(chain.xp, MAX_SHADOW_XP_KEYS);
  const items = trim(chain.items, MAX_SHADOW_ITEM_KEYS);
  const bestiary = trim(chain.bestiaryKills, MAX_SHADOW_BESTIARY_KEYS);
  if (xp === false || items === false || bestiary === false) return null;

  const st = { v: SHADOW_STATE_V, base_version: Number(o.baseVersion) };
  if (o.atMs != null) st.at = new Date(Number(o.atMs)).toISOString();
  /* PRESENCE OF KEY, exactly as the engine's own switches are: a character
     whose database has no `fight` column must keep reading as "no column"
     through the chain, or the overlay would turn an ABSENT input into an
     explicit one and the engine would start proposing a key hr_apply refuses. */
  if (typeof c.hp === 'number') st.hp = Math.floor(c.hp);
  if ('recoveringUntilMs' in c) st.recovering_until = c.recoveringUntilMs || 0;
  if ('consecFalls' in c) st.consec_falls = c.consecFalls;
  if ('fight' in c) st.fight = c.fight;
  if ('ammoCarry' in c) st.ammo_carry = c.ammoCarry;
  if ('toolCarry' in c) st.tool_carry = c.toolCarry;
  if (chain.activity) st.activity = chain.activity;
  if (chain.gold) st.gold = Math.floor(chain.gold);
  if (xp) st.xp = xp;
  if (items) st.items = items;
  if (bestiary) st.bestiary_kills = bestiary;
  if (chain.deathsToday) st.deaths_today = Math.floor(chain.deathsToday);
  if (chain.deathsLifetime) st.deaths_lifetime = Math.floor(chain.deathsLifetime);
  if (chain.vigourMin) st.vigour_spent_min = Math.floor(chain.vigourMin);

  /* Nothing moved — no window settled. Sending `{v:1}` would chain an empty
     proposal and look like a carrier that works; null is the honest answer. */
  if (Object.keys(st).length <= (st.at ? 3 : 2)) return null;
  if (JSON.stringify(st).length > MAX_SHADOW_STATE_BYTES) return null;
  return st;
}

/* Read it back onto a session assembled from `hr_state_of`. The session is
   TRUTH; this is the shadow's own PROPOSAL laid over it, and the caller has
   already established that the fence is chaining (design constraint 3).
   Nothing here is authority and nothing here is written anywhere. */
export function applyShadowState(session, state) {
  const s = session;
  const st = state;
  if (!s || !st || typeof st !== 'object') return s;
  if (Number(st.v) !== SHADOW_STATE_V) return s;
  /* THE STALENESS GATE. `version` is the number hr_apply refuses a stale copy
     of, and in SHADOW nothing the tick does moves it — so a version that has
     moved means a REAL write landed on this character between the two fires
     (a purchase, a claim, a client accrue). The proposal was built on a row
     that no longer exists; the honest answer is to drop it and re-seed from
     truth, not to reconcile two things neither of which is authority. */
  if (Number(st.base_version) !== Number(s.version)) return s;

  if (typeof st.hp === 'number') s.hp = st.hp;
  if ('recovering_until' in st) s.recoveringUntilMs = st.recovering_until || 0;
  if ('consec_falls' in st) s.consecFalls = st.consec_falls;
  if ('fight' in st) s.fight = st.fight;
  if ('ammo_carry' in st) s.ammoCarry = st.ammo_carry;
  if ('tool_carry' in st) s.toolCarry = st.tool_carry;
  if (st.activity && st.activity.kind) {
    s.activeKind = st.activity.kind;
    s.activeId = st.activity.id;
  }
  if (typeof st.gold === 'number') s.gold = Math.max(0, Math.floor((s.gold || 0) + st.gold));
  if (st.xp) {
    const skills = Object.assign({}, s.skills);
    for (const k of Object.keys(st.xp)) skills[k] = (skills[k] || 0) + Number(st.xp[k] || 0);
    s.skills = skills;
  }
  if (st.items) {
    const inv = Object.assign({}, s.inventory);
    for (const k of Object.keys(st.items)) {
      const q = (inv[k] || 0) + Number(st.items[k] || 0);
      if (q > 0) inv[k] = q; else delete inv[k];
    }
    s.inventory = inv;
  }
  if (st.bestiary_kills) {
    const b = Object.assign({}, s.bestiaryKills);
    for (const k of Object.keys(st.bestiary_kills)) {
      b[k] = (b[k] || 0) + Number(st.bestiary_kills[k] || 0);
    }
    s.bestiaryKills = b;
  }
  if (st.deaths_today) s.deathsTodayBefore = (Number(s.deathsTodayBefore) || 0) + st.deaths_today;
  if (st.deaths_lifetime) {
    s.deathsLifetimeBefore = (Number(s.deathsLifetimeBefore) || 0) + st.deaths_lifetime;
  }
  /* VIGOUR IS A BLOCK, NOT A SCALAR: `hr_vigour_of` hands the engine
     `{budget_min, spent_min, …}` and only `spent_min` is a counter a settle
     moves. A session with no vigour block has a database without the column
     and must keep reading that way. */
  if (st.vigour_spent_min && s.vigour && typeof s.vigour === 'object') {
    s.vigour = Object.assign({}, s.vigour,
      { spent_min: (Number(s.vigour.spent_min) || 0) + st.vigour_spent_min });
  }

  /* ── THE ACCUMULATOR IS SEEDED, NOT RESTARTED ───────────────────────────
     `_chain` is movement SINCE `hr_state_of`, and every fire re-seeds its
     session from `hr_state_of` — so without this line `advance()` would open a
     fresh accumulator on each fire and the carrier it produced would describe
     only the LAST flush window instead of the whole chain. The next overlay
     would then lay one window's movement over the base row and silently throw
     away every window before it.

     CAUGHT BY C17, NOT BY REVIEW. The first draft of this function did not
     seed it, and the carried chain diverged from the in-memory chain by +21
     meals and -5 deaths on the auto-eat fixture: the bag kept refilling itself
     across flush boundaries, which is the very defect the carrier exists to
     close, reproduced one layer up. The ABSOLUTE fields above do not need this
     because they are checkpoints — the last window's value IS the state — but
     every ADDITIVE key does. */
  s._chain = {
    gold: Number(st.gold) || 0,
    xp: Object.assign({}, st.xp),
    items: Object.assign({}, st.items),
    bestiaryKills: Object.assign({}, st.bestiary_kills),
    deathsToday: Number(st.deaths_today) || 0,
    deathsLifetime: Number(st.deaths_lifetime) || 0,
    vigourMin: Number(st.vigour_spent_min) || 0,
    activity: st.activity || null,
  };
  return s;
}
