// ============================================================================
// supabase/functions/hr-accrue/tick-contract.js — the WORLD TICK CONTRACT, v1.
//
// The tick service is NOT a new engine. It is a new CALLER of the engine the
// Edge Function already runs (`supabase/functions/hr-accrue/accrual.js`
// `computeAccrual`), which itself runs `src/core/*`. This file holds what
// crosses the seam BETWEEN two tick windows: the shadow carrier (RULE 4) and
// the spelling of a window's start (fenceWindowFrom).
//
// RULES 1-3 (tick-aligned polls, the fold law, the progress coalescer, the
// comparison summaries) LEFT WITH THE GATHER CHANNEL (the one-town-work cut,
// 09-crafting.md 4.17): they decomposed a flush window into 10 s polls and
// folded the polls back into one delta. The artisan channel, the tick's only
// pointer channel now, makes ONE engine call per window (tick-artisan.js), so
// there is nothing to align, fold or coalesce.
//
// NOTHING HERE WRITES. No Supabase client, no fetch, no fs.
//
// Read docs/planning/WORLD_TICK_DESIGN.md before changing anything below; each
// rule is there with the measurement that motivated it.
//
// PURE ESM, Node + Deno. Lives IN the edge payload because the op:'tick' entry
// runs it; the offline guards import it directly, so there is ONE copy
// (AWAY-12). No `?v=` (not under src/**).
// ============================================================================

/* ── RULE 4: WHAT THE CHAIN CARRIES BETWEEN FLUSH WINDOWS (2026-09-23) ───────
   This rule is about the seam BETWEEN two calls, and it is the one shadow mode
   gets wrong on production.

   Armed, the carrier is the database: hr_apply writes `hp`, `fight`,
   the counters and the bag, and the next fire's
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
   ABSOLUTE, a checkpoint the later window supersedes (`accrued_to` is not
   carried: the fence's own `shadow_accrued_to` already chains it):
     hp                a window that starts at the row's hp re-fights from full
     fight             every window restarts the foe at full HP: kills inflate
     ammo_carry        the sub-action remainder is forfeit every window
     activity          a pointer the engine idled keeps being settled
   ADDITIVE, as CUMULATIVE MOVEMENT rather than as an absolute:
     gold, xp, items   the bag is the one input the engine SPENDS. Without it
                       a window spends the SAME stack every time — the shadow
                       reads as a character with an infinite larder, which is
                       the PAYING direction.
   COUNTERS hr_apply would have written from the delta's own `progress` ops,
   summed off THAT list rather than re-derived (there is no rule here, only a
   sum of the engine's own output):
     deaths_today / deaths_lifetime   the death rows state them; dropped, every
                       window would restart the count.

   ── WHAT IS DELIBERATELY NOT CARRIED, EACH WITH ITS REASON ─────────────────
     maxHp             NOT A KEY: derived from Level and armour (src/core/vitals.js),
                       never carried (a chained window is a fuel run).
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
     equipment, combatStyle, perks   read-only inputs. No delta key touches one.

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
/* The column's own ceiling, restated from the CHECK constraint in
   2026-09-23-world-tick-shadow-state-chain.sql §1 so the edge refuses to send
   what the database would refuse to store. 16 KiB against a measured ~700 B. */
export const MAX_SHADOW_STATE_BYTES = 16384;

/* The counters the engine files as `progress` ops, read back off that list:
   `stat:deaths` under period '' is lifetime and under a UTC day key is today's.
   Summing the engine's own ops is not arithmetic of our own — it is the same
   number, read where it was put. */
export function countersFromProgress(progress) {
  let deathsLifetime = 0;
  let deathsToday = 0;
  for (const op of progress || []) {
    if (!op) continue;
    const add = Math.floor(Number(op.add) || 0);
    if (add <= 0) continue;
    if (op.kind === 'stat' && op.key === 'deaths') {
      if (op.period === '' || op.period == null) deathsLifetime += add;
      else deathsToday += add;
    }
  }
  return { deathsLifetime, deathsToday };
}

/* BYTES, NOT UTF-16 CODE UNITS (Security S-4, 2026-09-23). The column's CHECK
   in 2026-09-23-world-tick-shadow-state-chain.sql §1 is
   `octet_length(shadow_state::text) <= 16384` and the fence re-checks the same
   `octet_length`, so measuring the edge's half with `String.prototype.length`
   counts a non-ASCII item id, activity id or monster name in `fight` as ONE
   where the database counts two to four. The two halves are supposed to agree
   "by declaration, not by luck"; with `.length` they agree only on pure ASCII,
   and past it the edge would send a carrier the fence refuses
   `shadow_state_too_large` — a countable refusal rather than a silent loss, but
   a bound that does not hold where it says it does. */
function jsonByteLength(o) {
  return new TextEncoder().encode(JSON.stringify(o)).length;
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
  if (xp === false || items === false) return null;

  const st = { v: SHADOW_STATE_V, base_version: Number(o.baseVersion) };
  if (o.atMs != null) st.at = new Date(Number(o.atMs)).toISOString();
  /* PRESENCE OF KEY, exactly as the engine's own switches are: a character
     whose database has no `fight` column must keep reading as "no column"
     through the chain, or the overlay would turn an ABSENT input into an
     explicit one and the engine would start proposing a key hr_apply refuses. */
  if (typeof c.hp === 'number') st.hp = Math.floor(c.hp);
  if ('fight' in c) st.fight = c.fight;
  if ('ammoCarry' in c) st.ammo_carry = c.ammoCarry;
  if (chain.activity) st.activity = chain.activity;
  if (chain.gold) st.gold = Math.floor(chain.gold);
  if (xp) st.xp = xp;
  /* THE XP REMAINDER, a checkpoint per skill (each skill its own), so a shadow chain
     does not restart every skill's carry at the row's value on each fire. */
  if (chain.xpFrac && Object.keys(chain.xpFrac).length) {
    if (Object.keys(chain.xpFrac).length > MAX_SHADOW_XP_KEYS) return null;
    st.xp_frac = {};
    for (const k of Object.keys(chain.xpFrac).sort()) st.xp_frac[k] = Number(chain.xpFrac[k]) || 0;
  }
  if (items) st.items = items;
  if (chain.deathsToday) st.deaths_today = Math.floor(chain.deathsToday);
  if (chain.deathsLifetime) st.deaths_lifetime = Math.floor(chain.deathsLifetime);

  /* Nothing moved — no window settled. Sending `{v:1}` would chain an empty
     proposal and look like a carrier that works; null is the honest answer. */
  if (Object.keys(st).length <= (st.at ? 3 : 2)) return null;
  if (jsonByteLength(st) > MAX_SHADOW_STATE_BYTES) return null;
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
  if ('fight' in st) s.fight = st.fight;
  if ('ammo_carry' in st) s.ammoCarry = st.ammo_carry;
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
  /* PRESENCE OF KEY: only a session whose envelope projects the remainder
     (`xpFrac` non-null) takes the carried one, so a database without the
     column keeps reading as one. */
  if (st.xp_frac && typeof st.xp_frac === 'object' && s.xpFrac && typeof s.xpFrac === 'object') {
    s.xpFrac = Object.assign({}, s.xpFrac, st.xp_frac);
  }
  if (st.items) {
    const inv = Object.assign({}, s.inventory);
    for (const k of Object.keys(st.items)) {
      const q = (inv[k] || 0) + Number(st.items[k] || 0);
      if (q > 0) inv[k] = q; else delete inv[k];
    }
    s.inventory = inv;
  }
  if (st.deaths_today) s.deathsTodayBefore = (Number(s.deathsTodayBefore) || 0) + st.deaths_today;
  if (st.deaths_lifetime) {
    s.deathsLifetimeBefore = (Number(s.deathsLifetimeBefore) || 0) + st.deaths_lifetime;
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
     meals and -5 deaths on a fed fixture: the bag kept refilling itself
     across flush boundaries, which is the very defect the carrier exists to
     close, reproduced one layer up. The ABSOLUTE fields above do not need this
     because they are checkpoints — the last window's value IS the state — but
     every ADDITIVE key does. */
  s._chain = {
    gold: Number(st.gold) || 0,
    xp: Object.assign({}, st.xp),
    xpFrac: Object.assign({}, st.xp_frac),
    items: Object.assign({}, st.items),
    deathsToday: Number(st.deaths_today) || 0,
    deathsLifetime: Number(st.deaths_lifetime) || 0,
    activity: st.activity || null,
  };
  return s;
}

/* ── THE WINDOW STARTS AT THE FENCE'S MARK, SPELLED AS THE FENCE SPELLED IT ──
   (2026-09-28, the shadow stall after a re-point.) The drivers plan every
   window in integer MILLISECONDS — `markMs = Date.parse(<fence mark>)` — and
   bind its start as `new Date(markMs).toISOString()`. The fence compares
   `p_window_from < v_mark` in MICROSECONDS. The two agree only while the mark
   has no digits past the millisecond, which is true of every mark a settle
   writes (`accrued_to` is the engine's own `toISOString()`) and FALSE of the
   one an activity switch writes: hr_apply closes the window with `now()`.
   Measured on production: 21.9 h (combat) and 14.7 h (gather) of
   `window_already_settled` on every fire after a `set_activity`, ending only at
   the next real accrue. tests/world-tick-stall-after-repoint.mjs.

   So a window that starts AT the mark is bound with the fence's own rendering
   of it — the same string the seed label already uses (T-2) — and the CAS is
   untouched: it still refuses anything that starts one microsecond early.
   Any other start is passed through as planned. `markMs` is re-checked against
   the text so a stale or foreign string can never widen a window. */
export function fenceWindowFrom(windowFromIso, markMs, markText) {
  if (typeof markText !== 'string' || markText.length === 0) return windowFromIso;
  if (Date.parse(windowFromIso) !== markMs || Date.parse(markText) !== markMs) return windowFromIso;
  return markText;
}
