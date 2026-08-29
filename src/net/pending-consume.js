// ============================================================================
// src/net/pending-consume.js — WHAT THE CLIENT HAS SPENT AND THE SERVER HAS
// NOT YET AGREED TO.  (LIVE P0, reported 4× b467→b479.)
//
//   "Food eaten while in combat gets restocked."
//   "have 2 moonblood and everytime i use 1 it returns back in my inventory."
//
// ── THE ROOT CAUSE, EXACTLY ─────────────────────────────────────────────────
// `reconcileInventory` (src/net/accrue.js) reconciles the bag from an envelope
// by taking, for a key the envelope NAMES, the LARGER of the two figures:
//
//     merge branch     inv[k] = Math.max(have, q)                 (accrue.js)
//     absolute branch  best   = Math.max(have, floor(q))          (excluded ids)
//     absolute branch  next[k]= floor(q)                          (owned ids)
//
// Every one of those RESTOCKS a locally-decremented item BY CONSTRUCTION. The
// player eats one Moonbloom: the client goes 2 → 1 and the server still says 2,
// because the eat intent has not landed yet (or, for AUTO-eat, was never sent at
// all — see the second half of this fix). `Math.max(1, 2)` is 2. The food is
// back. And it is not a transient: `have` is itself the ratcheted value, so once
// a stale 2 has been merged in, every later envelope — including the eat's OWN
// response, which correctly says 1 — loses the max forever. The client is now
// permanently one ahead of the server, which is a dupe as well as a bug.
//
// This is the INVENTORY face of the class the combat-XP credit fix closed for
// skills: **a server reconcile stomping state the client has observed but the
// server has not yet settled.** The answer is the same shape — a small, scratch,
// session-local ledger of what is in flight, folded OUT of the server's figure
// before the reconcile reads it, and drained by EVIDENCE that the server has
// caught up.
//
// ── THE RULE ────────────────────────────────────────────────────────────────
// An entry is `{qty, base, seen, at}`:
//
//   qty    units consumed locally that the server has not yet acknowledged
//   base   the server figure the pending is measured AGAINST — the last figure
//          the server named for this id (or, for a brand-new entry, the client's
//          own pre-decrement count, which is the best estimate available)
//   seen   a monotonic tally of units this session ever noted through the seam.
//          The forgery clamp: `qty` can never exceed it.
//   at     when the entry was last noted (the TTL safety valve, never the
//          settlement rule — settlement is evidence, below)
//
// On every envelope, for every id in the ledger, against the server figure `q`:
//
//     drop      = max(0, base - q)      how much the server has ALREADY taken off
//     remaining = max(0, qty - drop)    what it still has not
//     effective = max(0, q - remaining) the figure the reconcile should believe
//
// and the entry is rewritten as `{qty: remaining, base: q}` — or DELETED when
// `remaining` is 0, which is the server agreeing. A credit in the same window
// (q goes UP) yields `drop = 0`, so a drop that arrives later still drains the
// entry: the arithmetic is anchored to the server's own movement, not a clock.
//
// ── WHY DRAINING IS BY EVIDENCE AND NOT BY "MY INTENT SUCCEEDED" ────────────
// Because the intent's own 200 is not proof that the NEXT envelope in flight
// knows about it. The whole bug is an envelope built BEFORE the eat arriving
// AFTER it. Only "the server's figure has come down" is proof, and it is proof
// no matter which response carries it. `src/net/item-ledger.js` reached the same
// conclusion for the Quartermaster trade — "an entry is retired by EVIDENCE,
// never by a clock" — and this file follows it.
//
// The TTL is therefore a SAFETY VALVE, not the rule: if a consumption is never
// acknowledged (the intent was refused, the network died, the item was never
// the server's to debit), the hold must not suppress a real stack for the whole
// session. After ENTRY_TTL_MS the entry is dropped and the envelope wins again —
// which is the HONEST outcome, because at that point the server really does
// still hold the item.
//
// ── WHAT THIS CAN AND CANNOT DO (the anti-forgery argument) ────────────────
// The fold ONLY EVER LOWERS a server figure. It has no branch that raises one,
// adds a key, or writes the bag. Therefore:
//
//   · IT CANNOT MINT. Not in the merge branch, not in the absolute branch, not
//     under any envelope, not with a forged ledger. That is the property the
//     project's target ("a forged client value cannot cross into another
//     player's economy or ranking") actually turns on.
//   · In the MERGE branch the reconcile still takes `Math.max(have, effective)`,
//     so a forged pending cannot even remove an item the client is holding — the
//     worst it can do is decline a ratchet-up, i.e. self-harm.
//   · In the ABSOLUTE branch a forged pending can make the client DISPLAY fewer
//     than the server holds. The server's rows are untouched; the entry drains
//     or expires and the next envelope restores the true figure. Self-harm
//     again, and bounded in time.
//   · The `seen` clamp bounds `qty` at what actually went through `noteConsumed`
//     this session, and the ledger is `_`-prefixed scratch: it is stripped from
//     the snapshot (save invariant 3) and dies on reload, so nothing here can be
//     laundered into a save.
//
// ── SCALE ───────────────────────────────────────────────────────────────────
// O(ledger size) per envelope, and the ledger is bounded at MAX_IDS with
// oldest-first eviction. When it is EMPTY — the overwhelmingly common case —
// `foldPendingConsume` returns the caller's own object by identity and allocates
// nothing, so the hot path is unchanged at any content scale.
//
// PURE ESM. No DOM, no timers, no fetch, no Math.random. Node-importable, so the
// suite drives the same bytes the browser runs.
// ============================================================================

/* Scratch, deliberately. `_`-prefixed fields are stripped from the snapshot, so
   this can never reach the cloud and can never survive a reload — both of which
   are REQUIRED, not incidental: after a reload the bag is rebuilt from server
   truth, and a surviving hold would subtract from a figure that already
   reflects it. Same reasoning as `G._pendingStyle` and `G._combatXpPending`. */
export const FIELD = '_pendingConsume';

/** Bounded. An entry is ~60 bytes and the honest outstanding count is 0–3; 64 is
 *  far above any real run and stops a mis-wired caller from growing `G` without
 *  limit. Oldest is evicted first — the oldest hold is the one most likely to be
 *  settled already, and evicting the NEWEST would un-hide the item the player
 *  just watched leave their bag. */
export const MAX_IDS = 64;

/** The safety valve (see the header). Envelopes arrive on a ~90 s settle cadence
 *  and an intent's own response is an envelope, so an acknowledged consumption
 *  drains in seconds; ten minutes is ~6 missed settles of slack before the
 *  server's figure is believed again. */
export const ENTRY_TTL_MS = 10 * 60 * 1000;

/** Per-call and per-id clamps. A single gesture consumes one unit; 1000 is room
 *  for a future bulk verb without being a number a loop can run away with. */
export const MAX_QTY_PER_NOTE = 1000;
export const MAX_QTY_PER_ID = 100000;

const ID_RE = /^[a-z0-9_]{1,64}$/;

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : NaN; }

/** The live map, created on demand. Always an object.
 *  Written through the LITERAL `G._pendingConsume` (never `G[FIELD]`) so
 *  tests/gold-site-census.mjs's computed-member-write rule keeps its zero. */
export function ledgerOf(G) {
  if (!G || typeof G !== 'object') return {};
  const cur = G[FIELD];
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) G._pendingConsume = {};
  return G._pendingConsume;
}

/** Is this a structurally sane entry? A corrupt one is DROPPED rather than
 *  repaired — a hold whose arithmetic cannot be trusted must not subtract. */
function sane(e) {
  if (!e || typeof e !== 'object') return false;
  const q = num(e.qty); const b = num(e.base); const s = num(e.seen); const a = num(e.at);
  if (!(q > 0) || q > MAX_QTY_PER_ID) return false;
  if (!(b >= 0)) return false;
  if (!(s > 0)) return false;
  if (!(a >= 0)) return false;
  return true;
}

/**
 * RECORD A CLIENT-LOCAL CONSUMPTION.
 *
 * Call AFTER the bag has already been decremented — this does not move the bag,
 * it remembers that the move happened so the next envelope cannot undo it.
 *
 * @param G      the game state
 * @param id     the item id that left the bag
 * @param qty    units consumed (default 1)
 * @param opts.nowMs   injected clock (the suite; never a gameplay input)
 * @param opts.before  the client's count BEFORE the decrement, when the caller
 *                     knows it. Omitted ⇒ derived as `current + qty`, which is
 *                     the same number for every caller that decrements first.
 * @returns the entry, or null if nothing was recorded
 */
export function noteConsumed(G, id, qty, opts) {
  if (!G || typeof G !== 'object') return null;
  const key = String(id == null ? '' : id);
  if (!ID_RE.test(key)) return null;
  let n = Math.floor(num(qty == null ? 1 : qty));
  if (!(n > 0)) return null;
  if (n > MAX_QTY_PER_NOTE) n = MAX_QTY_PER_NOTE;

  const o = opts || {};
  const now = Number.isFinite(Number(o.nowMs)) ? Number(o.nowMs) : Date.now();
  const led = ledgerOf(G);
  const prev = sane(led[key]) ? led[key] : null;

  if (prev) {
    /* ACCUMULATE, AND KEEP THE OLD `base`. The base is anchored to a SERVER
       observation (the last figure the envelope named, written by the fold); a
       second local eat does not give us a newer one, and recomputing it from the
       client's count would drift the anchor every time the ratchet moved. */
    prev.qty = Math.min(MAX_QTY_PER_ID, prev.qty + n);
    prev.seen = Math.min(MAX_QTY_PER_ID, prev.seen + n);
    prev.at = now;
    return prev;
  }

  const inv = (G.inventory && typeof G.inventory === 'object') ? G.inventory : null;
  const current = inv ? Math.max(0, Math.floor(num(inv[key])) || 0) : 0;
  const beforeGiven = Math.floor(num(o.before));
  const base = Number.isFinite(beforeGiven) && beforeGiven >= 0 ? beforeGiven : current + n;

  const entry = { qty: n, base, seen: n, at: now };
  led[key] = entry;

  /* Oldest-first eviction — see MAX_IDS. */
  const keys = Object.keys(led);
  if (keys.length > MAX_IDS) {
    keys.sort((a, b) => (num(led[a] && led[a].at) || 0) - (num(led[b] && led[b].at) || 0));
    for (let i = 0; i < keys.length - MAX_IDS; i++) delete led[keys[i]];
  }
  return entry;
}

/**
 * RELEASE A HOLD THE SERVER HAS REFUSED (or that will never be sent).
 *
 * The honest direction: if the consumption is not going to become real
 * server-side, the client must stop hiding an item the server still holds and
 * let the next envelope restore it. Called on an ANSWERED-but-refused eat, and
 * when a send is dropped from a full backlog.
 *
 * @param qty  units to release; omitted ⇒ the whole entry.
 * @returns the number of units released.
 */
export function releaseConsumed(G, id, qty) {
  if (!G || typeof G !== 'object') return 0;
  const key = String(id == null ? '' : id);
  const led = ledgerOf(G);
  const e = led[key];
  if (!sane(e)) { if (e !== undefined) delete led[key]; return 0; }
  const want = qty == null ? e.qty : Math.floor(num(qty));
  if (!(want > 0)) return 0;
  const take = Math.min(e.qty, want);
  e.qty -= take;
  if (e.qty <= 0) delete led[key];
  return take;
}

/** How many units are still held for `id`? TTL-aware and non-mutating —
 *  a read for tests, telemetry and callers, never the settlement path. */
export function pendingFor(G, id, nowMs) {
  if (!G || typeof G !== 'object') return 0;
  const led = G[FIELD];
  if (!led || typeof led !== 'object') return 0;
  const e = led[String(id == null ? '' : id)];
  if (!sane(e)) return 0;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  if (now - e.at > ENTRY_TTL_MS) return 0;
  return Math.min(e.qty, e.seen);
}

/** Everything held right now, `{id: qty}`. Read-only; for the drift readout. */
export function pendingSnapshot(G, nowMs) {
  const out = {};
  if (!G || typeof G !== 'object') return out;
  const led = G[FIELD];
  if (!led || typeof led !== 'object') return out;
  for (const k of Object.keys(led)) {
    const n = pendingFor(G, k, nowMs);
    if (n > 0) out[k] = n;
  }
  return out;
}

/** Drop everything. Called when the bag is rebuilt from a fresh server truth
 *  (a restore / character switch), where every hold is by definition stale. */
export function clearPendingConsume(G) {
  if (!G || typeof G !== 'object') return 0;
  const led = G[FIELD];
  const n = (led && typeof led === 'object') ? Object.keys(led).length : 0;
  G._pendingConsume = {};
  return n;
}

/** Does an OMITTED key read as a real zero for this id?
 *  `true` / `false` are blanket answers; a Set names the ids for which omission
 *  is a positive statement (the away-receipt debit list). */
function omissionIsZeroFor(rule, id) {
  if (rule === true) return true;
  if (!rule) return false;
  if (typeof rule === 'function') { try { return !!rule(id); } catch (e) { return false; } }
  if (typeof rule.has === 'function') return !!rule.has(id);
  return false;
}

/**
 * FOLD THE PENDING HOLDS OUT OF AN ENVELOPE'S INVENTORY FIGURES.
 *
 * ⚠ MUST RUN BEFORE the reconcile reads a figure, in BOTH branches. Running it
 *   after would let the envelope's own write stand, which is the bug.
 *
 * @param G      the game state (the ledger is updated in place — the drain)
 * @param named  the envelope's inventory object, or null/undefined when the
 *               envelope carries none (an unreadable bag is NOT a claim)
 * @param opts.nowMs           injected clock
 * @param opts.omissionIsZero  true | false | Set<id> | (id)=>bool — whether an
 *               id the envelope OMITS reads as a real zero. Under the armed,
 *               baseline-complete absolute branch it does (the envelope is a
 *               complete statement); under merge it does not, except for the ids
 *               the away receipt explicitly DEBITED.
 * @returns the figures the reconcile should believe. When nothing is held this
 *          is `named` ITSELF (identity, zero allocation, zero behaviour change).
 */
export function foldPendingConsume(G, named, opts) {
  if (!G || typeof G !== 'object') return named;
  const led = G[FIELD];
  if (!led || typeof led !== 'object' || Array.isArray(led)) return named;
  const ids = Object.keys(led);
  if (!ids.length) return named;

  const o = opts || {};
  const now = Number.isFinite(Number(o.nowMs)) ? Number(o.nowMs) : Date.now();
  const readable = !!(named && typeof named === 'object');
  let out = named;
  let copied = false;

  for (const k of ids) {
    const e = led[k];
    if (!sane(e)) { delete led[k]; continue; }
    /* THE SAFETY VALVE. An unacknowledged hold does not suppress a stack
       forever — after the TTL the server's figure is believed again, which is
       the honest outcome (the server really does still hold the item). */
    if (now - e.at > ENTRY_TTL_MS) { delete led[k]; continue; }

    const rawNamed = readable ? num(named[k]) : NaN;
    const isNamed = Number.isFinite(rawNamed);
    let q;
    if (isNamed) q = Math.max(0, Math.floor(rawNamed));
    else if (readable && omissionIsZeroFor(o.omissionIsZero, k)) q = 0;
    else continue;                       // no statement about this id — keep waiting

    /* THE FORGERY CLAMP. `qty` can never subtract more than actually went
       through `noteConsumed` this session (see the header's anti-forgery note). */
    const held = Math.min(e.qty, e.seen);
    const drop = Math.max(0, e.base - q);          // the server has already taken this much off
    const remaining = Math.max(0, held - drop);    // …so only this much is still unsettled

    if (remaining <= 0) { delete led[k]; continue; }

    e.qty = remaining;
    e.seen = Math.max(remaining, Math.min(e.seen, MAX_QTY_PER_ID));
    e.base = q;

    if (isNamed) {
      if (!copied) { out = { ...named }; copied = true; }
      out[k] = Math.max(0, q - remaining);
    }
  }
  return out;
}

/* ── THE SEAM, NOT A SPECIAL CASE FOR FOOD ──────────────────────────────────
   Nothing above knows what a food is. This is "the client spent N of an item and
   the server has not agreed yet", which is the shape of every client-authored
   consumption the codebase still has: an eat (wired now — legacy.js `eatFood`
   and the auto-eat effect), and, when their verbs land, artisan inputs,
   ammunition, and the Quartermaster's payment leg (today handled atomically by
   src/net/item-ledger.js, which pairs a debit WITH a credit and therefore needs
   its own two-leg rule).

   ⏳ RETIREMENT. This is a reconcile-ordering fix, not a substitute for server
   authority. It retires the day every consumption is an intent the server has
   settled BEFORE it can build an envelope — at which point no envelope can ever
   name a pre-consumption figure, the ledger is empty in the field, and this
   module is deleted. Until then it is what stops a stale figure from being
   ratcheted into permanence. */

if (typeof window !== 'undefined') {
  window.HearthrisePendingConsume = {
    FIELD, MAX_IDS, ENTRY_TTL_MS, MAX_QTY_PER_NOTE, MAX_QTY_PER_ID,
    ledgerOf, noteConsumed, releaseConsumed, pendingFor, pendingSnapshot,
    clearPendingConsume, foldPendingConsume,
  };
}
