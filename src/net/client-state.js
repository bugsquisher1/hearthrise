// ============================================================================
// src/net/client-state.js — THE HOME (client half) FOR NON-AUTHORITY RESIDUE.
//
// The server-authority program moved every AUTHORITY field into the fail-closed
// record framework (src/net/record.js): gold, gems, skills, equipment, rooms,
// marks, rested XP, plus the inventory/farming/companion mechanisms. What is
// LEFT in the client-authored snapshot() blob is NON-AUTHORITY residue —
// self-only data that, by CLAUDE.md's mandate, "cannot cross into another
// player's economy or ranking", so it does NOT need the record framework's
// fail-closed accessor + fingerprint + UNKNOWN machinery. It needs a HOME so
// the blob can be retired.
//
// THE RESIDUE (the fields the capstone will route through here):
//   · bountyHunter (MINUS marks — marks is already a record field)
//   · stats            (kills/gathered/harvested/rareDrops/playMs — counters)
//   · chronicle        (the permanent achievement log)
//   · activeStyle      (which loadout is active — a pref)
//   · foodSlot         (equipped-food pointer — a pref; the food itself is
//                       server-owned inventory)
//   … plus the wider self-only tail the census names (settings, ownedThemes,
//   ownedCosmetics, houseTheme, daily, collection, quests, entitlements, …) —
//   the capstone decides the exact set; this store is a generic verbatim bag,
//   so adding a field is a client decision, not a schema change.
//
// ── THE CONTRACT, DELIBERATELY SIMPLER THAN record.js ───────────────────────
// This is NOT the record framework and must not be mistaken for it. It is a
// VERBATIM key/value store. A forged value here is self-only (the server never
// computes authority on client_state), so there is no fingerprint, no
// fail-closed UNKNOWN, no strip. The one rule it shares with record.js: while
// DORMANT it changes NOTHING — every read falls through to the blob (`G[field]`)
// exactly as today.
//
//   DORMANT  (CLIENT_STATE_SERVER_BACKED=false, or the master switch off):
//            clientField(G, f) === G[f]. The uploader is a no-op seam.
//   ARMED    (flag true AND the master accrual switch on, POST-WIPE only):
//            clientField(G, f) reads the server envelope's `client_state[f]`;
//            putClientState() ships changes to hr_put_client_state.
//
// ── THE SWITCH (post-wipe capstone) ─────────────────────────────────────────
// Flipping CLIENT_STATE_SERVER_BACKED to true is NOT this file's job. It is the
// capstone, and it additionally requires: (1) every residue READ routed through
// clientField / the typed helpers; (2) the residue fields dropped from
// snapshot() (or the blob stops being uploaded entirely); (3) putClientState
// wired into the save loop so a change is persisted; (4) POST-WIPE. Until then
// the const ships false and this module is inert.
//
// DOM-free. Node-importable. `fetch` resolves at call time (accrue.js's rule),
// so a test's override IS the transport.
// ============================================================================

import { isServerAccrualEnabled, resolveActiveSlot } from './accrue.js?v=439';

/* ── THE DORMANT ARM ─────────────────────────────────────────────────────────
   Same shape as record.js's per-field arms (SKILLS_RECORD_ARM_ENABLED et al):
   a greppable const defaulting OFF, a test override seam, and a runtime
   predicate that ALSO requires the master accrual switch — so the store can
   never be "server-backed" while the record system as a whole is off (which
   would read residue server-first while the blob still authored it). */
export const CLIENT_STATE_SERVER_BACKED = false;   // DORMANT — post-wipe capstone only
let armOverride = null;
export function isClientStateServerBacked() {
  const on = armOverride !== null ? armOverride : CLIENT_STATE_SERVER_BACKED;
  return !!on && isServerAccrualEnabled();
}
/** Test seam, same spirit as record.js's __setSkillsRecordArm. */
export function __setClientStateArm(v) {
  armOverride = (v === null || v === undefined) ? null : !!v;
  return isClientStateServerBacked();
}

/* ── THE SERVER-SUPPLIED VERBATIM BAG ────────────────────────────────────────
   Populated from an envelope's top-level `client_state`. Module-scoped rather
   than stamped onto G, because it is NOT part of the save blob and must never
   ride back up into it — the whole point is to get this OUT of the blob. A
   monotonic-ish guard is unnecessary: this is a verbatim store, not a watermark,
   and a stale envelope simply re-supplies the same bag. */
let serverBag = null;   // null = never received; an object once an envelope arrives.

/** Feed a server envelope (the hr_load / hr-accrue shape) into the store. Only
 *  consulted while ARMED, but always safe to call. A malformed / absent
 *  client_state leaves the previous bag untouched (an absent key is not a
 *  reason to forget what the last good envelope supplied). */
export function applyClientState(res) {
  if (!res || typeof res !== 'object' || res.ok !== true) return false;
  const cs = res.client_state;
  if (cs === null || typeof cs !== 'object' || Array.isArray(cs)) return false;
  serverBag = cs;
  return true;
}

/** Test / boot seam: forget the server bag (a fresh character, a sign-out). */
export function __resetClientState() { serverBag = null; }

/* ── THE READ ────────────────────────────────────────────────────────────────
   The ONE accessor every residue read should route through. DORMANT → the blob
   value, byte-for-byte as today. ARMED → the server bag's value; a key the
   server has never supplied yields `fallback` (default undefined), matching how
   a fresh field reads before it is ever written. There is no UNKNOWN/fail-closed
   state, on purpose: a self-only pref that briefly reads as its default cannot
   be exploited, and blocking the UI on it (the record framework's behaviour for
   money) would be user-hostile for zero security benefit. */
export function clientField(G, field, fallback) {
  if (!G || typeof G !== 'object') return fallback;
  if (!isClientStateServerBacked()) {
    return Object.prototype.hasOwnProperty.call(G, field) ? G[field] : fallback;
  }
  if (serverBag && Object.prototype.hasOwnProperty.call(serverBag, field)) {
    return serverBag[field];
  }
  return fallback;
}

/** Is the residue currently sourced from the server (armed AND a bag received)? */
export function isClientStateFromServer() {
  return isClientStateServerBacked() && serverBag !== null;
}

/* ── THE WRITE (dormant seam) ────────────────────────────────────────────────
   Builds and POSTs a shallow-merge patch to hr_put_client_state. It is EXPORTED
   but NOT wired into the live save loop — the capstone does that. Dormant, it is
   never called; armed, the caller passes the SUPABASE_URL, an anon key, a JWT
   and a fetch (resolved at call time so a test can inject transport). The patch
   is a plain object of the residue fields that changed; the server merges it
   over the stored bag. p_idem makes a replay a no-op (the merge is naturally
   idempotent regardless).

   Returns {ok, ...} from the RPC, or {ok:false, error} on a transport failure —
   a failed put is NEVER fatal (residue is self-only), it just retries next save. */
export async function putClientState(patch, opts) {
  const o = opts || {};
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, error: 'bad_patch' };
  }
  const url = o.url;
  const anonKey = o.anonKey;
  const jwt = o.jwt;
  if (!url || !anonKey || !jwt) return { ok: false, error: 'not_configured' };
  const slot = (o.slot !== undefined && o.slot !== null) ? o.slot : resolveActiveSlot(o.pinnedSlot);
  const idem = o.idem || (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID() : String(Date.now()) + '-' + Math.floor(Math.random() * 1e9));
  const f = (typeof fetch !== 'undefined') ? fetch : null;
  if (!f) return { ok: false, error: 'no_fetch' };
  try {
    const resp = await f(url.replace(/\/$/, '') + '/rest/v1/rpc/hr_put_client_state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': 'Bearer ' + jwt,
      },
      body: JSON.stringify({ p_slot: slot, p_patch: patch, p_idem: idem }),
    });
    if (!resp || !resp.ok) return { ok: false, error: 'http_' + (resp && resp.status) };
    return await resp.json();
  } catch (e) {
    return { ok: false, error: 'transport', detail: e && e.message };
  }
}

if (typeof window !== 'undefined') {
  window.HearthriseClientState = {
    clientField, isClientStateServerBacked, isClientStateFromServer,
    applyClientState, putClientState,
  };
}
