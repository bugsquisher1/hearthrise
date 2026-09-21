// ============================================================================
// src/net/bank-sync.js — THE CLIENT TRANSPORT FOR THE DEPOT (the bank store).
//
// The server half has been installed and DORMANT since b438
// (supabase/migrations/2026-08-27-bank-store.sql): `public.player_bank` is a
// real table with NO client write policy, `hr_state_of` projects it at
// `res.bank`, and ONE verb moves items:
//
//   hr_bank_move(p_slot, p_item, p_qty, p_dir, p_idem) -> jsonb
//     {ok:true, item, qty, direction, version}  on success
//     {ok:false, error:<code>, …}               on a refusal
//
// It takes the per-character lock, re-derives every quantity under that lock,
// clamps to what the player actually holds, bumps `player_state.version`,
// journals one `player_ledger kind='bank'` row per move and caches the answer
// under (user, intent_id) so a retry is a no-op. This module is the client half
// that was missing: without it the verb existed and nothing could call it.
//
// ── THE READ MODEL IS THE ENVELOPE, NOT THIS RESPONSE ───────────────────────
// This is the one place the Depot differs from src/net/farm-sync.js, and the
// difference is deliberate. Farming has no projection, so its RPC answer IS its
// read model. The bank HAS one — `res.bank`, folded into `G.bank` absolutely by
// accrue.js `reconcileBank` — so the honest sequence is:
//
//   gesture -> hr_bank_move -> the server says ok -> ask for an envelope
//           -> reconcileBank replaces G.bank and reconcileInventory the bag
//           -> the screen repaints from what the realm says it holds
//
// `bankMoveSettled()` below is that sequence in one call, and it is the only
// thing the UI uses. NOTHING here adds, subtracts or clamps a quantity: a
// client that computed `bank[item] + qty` would be authoring the contents of a
// container the server owns, and the first refusal it mis-read (a clamp, a
// partial, a replayed idem) would leave the player looking at items they do not
// have. The test BANK-1 pins exactly this by answering with an envelope that
// DISAGREES with the RPC's own qty and asserting the envelope wins.
//
// ── WHAT CROSSES THE WIRE ───────────────────────────────────────────────────
// Five fields and nothing else: the slot (derived from the profile, clamped),
// the item id, the requested qty, the direction, and an idempotency uuid. No
// price, no balance, no timestamp, no "new total" — every one of those is the
// server's to state. `bankMoveBody()` is the single author of that shape so a
// second call site cannot invent a sixth field.
//
// PURE apart from `fetch` (resolved at call time, so a test's override IS the
// transport) and the optional window singletons. Node-importable.
// ============================================================================

import { BANK_NON_ITEM_KEYS } from './accrue.js?v=550';

export { BANK_NON_ITEM_KEYS };

const RPC = 'hr_bank_move';

function winCfg() {
  try {
    return (typeof window !== 'undefined' && window.HearthriseSupabase
      && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig()) || null;
  } catch (e) { return null; }
}
function winSession() {
  try {
    return (typeof window !== 'undefined' && window.HearthriseAuth
      && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession()) || null;
  } catch (e) { return null; }
}

/** The active character slot, derived from the profile and clamped to [0,5] —
 *  never a client value that could cross to another player. Mirrors
 *  src/net/farm-sync.js activeSlot(). */
export function activeSlot() {
  try {
    const P = (typeof window !== 'undefined') ? window.HearthriseProfile : null;
    if (P && typeof P.activeSlot === 'function') {
      const s = P.activeSlot();
      if (typeof s === 'number' && s >= 0 && s <= 5) return s | 0;
    }
  } catch (e) {}
  return 0;
}

/** A fresh idempotency uuid per GESTURE. A retry of the same gesture must carry
 *  the SAME key (pass `opts.idem`) so the server replays its first answer
 *  instead of moving the stack twice. */
export function newBankIdem() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** THE WIRE SHAPE, authored once. Exactly five fields; `qty` is floored to a
 *  positive integer here only so a UI rounding artefact is not sent as `1.5`
 *  (the server re-validates and owns the verdict either way). */
export function bankMoveBody(slot, item, qty, dir, idem) {
  return {
    p_slot: (slot | 0),
    p_item: String(item == null ? '' : item),
    p_qty: Math.max(1, Math.floor(Number(qty) || 0)),
    p_dir: String(dir === 'withdraw' ? 'withdraw' : 'deposit'),
    p_idem: String(idem || ''),
  };
}

function resolveConfig(opts) {
  const o = opts || {};
  let url = o.url, anonKey = o.anonKey, jwt = o.jwt;
  if (!url || !anonKey) {
    const c = winCfg();
    if (c) { url = url || c.url; anonKey = anonKey || c.anonKey; }
  }
  if (!jwt) { const s = winSession(); jwt = (s && s.access_token) || null; }
  if (!url || !anonKey) return null;
  return { url: String(url).replace(/\/+$/, ''), anonKey, jwt: jwt || anonKey };
}

/**
 * POST one Depot intent. NON-FATAL on every failure: a transport error, a
 * missing config and a server refusal all return `{ok:false, error}` and NEVER
 * throw, because a failed move must leave the screen showing the last thing the
 * realm said rather than a half-applied guess.
 */
export async function bankMove(item, qty, dir, opts) {
  const o = opts || {};
  const cfg = resolveConfig(o);
  if (!cfg) return { ok: false, error: 'no_config' };
  const f = (typeof fetch !== 'undefined') ? fetch : null;
  if (!f) return { ok: false, error: 'no_fetch' };
  const slot = (o.slot !== undefined && o.slot !== null) ? (o.slot | 0) : activeSlot();
  const body = bankMoveBody(slot, item, qty, dir, o.idem || newBankIdem());
  try {
    const resp = await f(cfg.url + '/rest/v1/rpc/' + RPC, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + cfg.jwt,
      },
      body: JSON.stringify(body),
    });
    if (resp && resp.status === 404) return { ok: false, error: 'rpc_missing' };
    if (!resp || !resp.ok) return { ok: false, error: 'http_' + (resp && resp.status) };
    const json = await resp.json();
    return (json && typeof json === 'object') ? json : { ok: false, error: 'bad_response' };
  } catch (e) {
    return { ok: false, error: 'transport', detail: e && e.message };
  }
}

/**
 * THE GESTURE, END TO END: send the intent, and on the server's ok ask for a
 * fresh envelope so the bag and the vault the player then sees are the realm's
 * own projection. Returns `{res, settled}` — `settled` is false when the
 * envelope could not be fetched, in which case the NEXT settle (90s cadence,
 * or the next gesture) reconciles and the UI simply showed stale-but-true
 * numbers in the meantime. It never paints a number this device computed.
 */
export const SETTLE_TIMEOUT_MS = 8000;

export async function bankMoveSettled(item, qty, dir, opts) {
  const o = opts || {};
  const res = await bankMove(item, qty, dir, o);
  if (!res || res.ok !== true) return { res, settled: false };
  let settled = false;
  try {
    const A = (typeof window !== 'undefined') ? window.HearthriseAccrual : null;
    /* THE BAG SIDE OF THE MOVE, declared BEFORE the envelope is asked for. The
       server debited player_inventory in the same transaction, and the bag's fold
       is merge (max) in prod, so without this the envelope's honest lower figure
       loses the max and the stack the player just stored never leaves their bag
       (measured live). accrue.js owns what that means; this only states the fact. */
    if (A && typeof A.noteServerBagMove === 'function') {
      try { A.noteServerBagMove(res.item || item); } catch (e) {}
    }
    if (A && typeof A.requestAccrual === 'function') {
      /* BOUNDED. `requestAccrual` awaits a fetch with no timeout of its own, and
         an hr-accrue call that never answers used to leave the GESTURE unfinished
         forever: no toast, no repaint, and the panel's re-entrancy fuse latched so
         every later press was silently dead (measured live — three presses, one
         POST, no message). The move is already committed and journalled
         server-side; the envelope is how the screen catches up, and the next
         settle brings it. A slow realm must cost a repaint, never the button. */
      const out = await withTimeout(A.requestAccrual({ force: true }),
        Number(o.settleTimeoutMs) > 0 ? Number(o.settleTimeoutMs) : SETTLE_TIMEOUT_MS);
      settled = !!(out && out.applied);
    }
  } catch (e) { settled = false; }
  return { res, settled };
}

/** Resolve with `null` if the promise has not settled in `ms`. Never rejects,
 *  never leaves a timer running past the race. */
export function withTimeout(p, ms) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(null); } }, Math.max(1, ms | 0));
    Promise.resolve(p).then(
      (v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } },
      () => { if (!done) { done = true; clearTimeout(t); resolve(null); } },
    );
  });
}

/** The vault's ITEMS, with the three non-item bank-SPACE counters
 *  (goldBuys/gemBuys/grandfather — they share the object, see reconcileBank)
 *  stripped. The one reader, so no surface can mistake a counter for a stack. */
export function bankItems(G) {
  const out = {};
  const src = (G && G.bank && typeof G.bank === 'object') ? G.bank : {};
  for (const k of Object.keys(src)) {
    if (BANK_NON_ITEM_KEYS.indexOf(k) !== -1) continue;
    const q = Math.floor(Number(src[k]) || 0);
    if (q > 0) out[k] = q;
  }
  return out;
}

/* ── REFUSAL TEXT — SAY WHY, AND WHAT CLEARS IT ───────────────────────────────
   Every code `hr_bank_move` can return, answered with the action that clears
   it. Refusals leave no ledger row and no intent-cache entry server-side, so
   this sentence is the ONLY diagnostic that will ever exist for a failed move —
   the farming lesson (nine days of zero plants, "it doesn't stay", no code
   anywhere). An unknown code still carries itself into the text so a bug report
   names it. Pure over its inputs; `ctx` supplies the display name the net layer
   must not invent. */
export function bankMoveRefusalText(res, ctx) {
  const c = ctx || {};
  const name = c.itemName || 'That item';
  const code = (res && res.error) || 'unknown';
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  switch (code) {
    case 'transport':
    case 'network':
      return "Couldn't reach the realm — nothing was moved. Check your connection and try again.";
    case 'no_config':
    case 'no_fetch':
    case 'rpc_missing':
      return 'The Depot is not open on this realm yet.';
    case 'not_signed_in':
      return 'You are signed out — sign in to use the Depot.';
    case 'no_character':
      return 'No character loaded on this slot — reload and try again.';
    case 'rate_limited':
      return 'Moving too fast — wait a moment and try again.';
    case 'insufficient_item': {
      const have = n(res.have);
      return 'You are not carrying that many — ' + name + ' ×' + (have === null ? 0 : have) + ' in your bag.';
    }
    case 'insufficient_bank': {
      const have = n(res.have);
      return 'Your Depot does not hold that many — ' + name + ' ×' + (have === null ? 0 : have) + ' stored.';
    }
    case 'bank_full': {
      const cap = n(res.cap);
      return 'Your Depot is full' + (cap === null ? '' : ' (' + cap.toLocaleString() + ' stacks)')
        + ' — withdraw or combine a stack to make room.';
    }
    case 'bag_full': {
      const cap = n(res.cap);
      return 'Your bag has no free slot' + (cap === null ? '' : ' (' + cap.toLocaleString() + ')')
        + ' — sell something, or buy space from the bag screen.';
    }
    case 'qty_clamp': {
      const lim = n(res.limit);
      return 'That is more than one move can carry' + (lim === null ? '' : ' (' + lim.toLocaleString() + ')')
        + ' — split it.';
    }
    case 'bad_qty':
      return 'Choose how many to move first.';
    case 'bad_direction':
      return 'That move made no sense — please report this.';
    case 'unknown_item':
      return name + ' cannot be stored in the Depot — please report this.';
    default:
      return 'Could not move it (' + code + ') — please report this.';
  }
}

if (typeof window !== 'undefined') {
  window.HearthriseBankSync = {
    activeSlot, newBankIdem, bankMoveBody,
    bankMove, bankMoveSettled, bankItems, bankMoveRefusalText, withTimeout, SETTLE_TIMEOUT_MS,
  };
}
