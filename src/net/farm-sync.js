// ============================================================================
// src/net/farm-sync.js — THE CLIENT TRANSPORT FOR SERVER-SIDE FARMING (DORMANT).
//
// The four farm gestures — plant / water / harvest / upgrade-plot — are SERVER
// authoritative as of b435: hr_farm_plant / hr_farm_water / hr_farm_harvest /
// hr_farm_upgrade_plot (supabase/migrations/2026-08-22-server-farming-complete.sql)
// own the seed debit, the watering window, the seeded yield roll, the farmYield
// perk, the finite-perennial wither and the deed spend. This module is the
// CLIENT half the security review found missing on main: without it, flipping
// FARM_SERVER_ARM_ENABLED would arm a server surface the client never calls.
//
// ── THE MODEL UNDER ARM ─────────────────────────────────────────────────────
// Farming is NOT a SERVER_OF_RECORD/hr_load field and NOT hydrated residue:
// there is no farm-state block in the load envelope. So the read model is the
// RPC RESPONSE ITSELF. The client sends an INTENT (plant/water/harvest/upgrade),
// the RPC returns the authoritative new plot state, and the client RECONCILES
// G.farmPlots / G.plotLevels from that response — it never computes the outcome
// locally under arm. This mirrors the other client-callable RPC transports
// (goal-claim.js's claim/bounty verbs, client-state.js's putClientState): a
// plain PostgREST RPC POST, an idempotency key, non-fatal on failure.
//
//   ⚠ CROP PRODUCE IS SERVER-OWNED VIA THE HARVEST RPC — NOT THE INVENTORY FLIP.
//   cropProductIds is a documented EXCLUSION from the ownable-inventory set
//   (item-authority.js), so the harvest RPC (which writes player_inventory
//   server-side) is what makes farm produce server-owned, independent of
//   INVENTORY_ARM_ENABLED. Under arm the client must therefore NOT run its local
//   yield roll AND then apply the response — that is a DOUBLE CREDIT. It applies
//   the SERVER'S NUMBER (res.qty of res.produce) EXACTLY ONCE, through
//   reconcileFarmResult, and never the local rand() roll.
//
// ── DORMANT ─────────────────────────────────────────────────────────────────
// isFarmServerArmed() (item-authority.js) ships false. While dormant the legacy
// farm writers run byte-for-byte as today and nothing here is called. Flipping
// the arm is a POST-WIPE rollout decision (the server player_farm baseline is
// SPARSE vs the rich client blob — arming pre-wipe would strand growing crops,
// the inventory-flip lesson), NOT this file's job.
//
// PURE apart from `fetch` (resolved at call time, so a test's override IS the
// transport) and the optional window config lookup. Node-importable. Classic-
// script friendly: no ESM export is required by the browser — it publishes onto
// window for legacy.js — but the ESM exports exist for the Node guard.
// ============================================================================

import { isFarmServerArmed } from '../data/item-authority.js?v=491';

export { isFarmServerArmed };

/* ── CONFIG / SESSION — the goal-claim.js shape, with a test override ─────────
   In the browser these read the same singletons every other transport does. A
   Node test (and a future pure caller) may instead pass an explicit
   {url, anonKey, jwt, slot} to any gesture, so the module never needs a window. */
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

/** The active character slot, server-authoritatively derived from the profile
 *  and clamped to [0,5] — never a client value that could cross to another
 *  player. Mirrors goal-claim.js activeSlot(). */
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

/** A client-generated idempotency key (uuid). A RETRY of the SAME gesture must
 *  carry the SAME key so the server's player_intents cache replays the identical
 *  result with no second seed debit / no second harvest credit; a NEW gesture
 *  gets a fresh one. */
export function newFarmIdem() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Resolve {url, anonKey, jwt, slot} from an explicit opts override first, then
 *  the window singletons. Returns null when there is no usable config — the
 *  caller then answers {ok:false, error:'no_config'} rather than throwing. */
function resolveConfig(opts) {
  const o = opts || {};
  let url = o.url, anonKey = o.anonKey, jwt = o.jwt;
  if (!url || !anonKey) {
    const c = winCfg();
    if (c) { url = url || c.url; anonKey = anonKey || c.anonKey; }
  }
  if (!jwt) {
    const s = winSession();
    jwt = (s && s.access_token) || null;
  }
  if (!url || !anonKey) return null;
  const slot = (o.slot !== undefined && o.slot !== null) ? (o.slot | 0) : activeSlot();
  // The anon key is a valid bearer for the RPC shell's rate gate even pre-auth,
  // but a farm RPC needs auth.uid() — a missing jwt yields not_signed_in server-
  // side, which is a non-fatal answer the reconciler simply ignores.
  return { url: String(url).replace(/\/+$/, ''), anonKey, jwt: jwt || anonKey, slot };
}

/**
 * POST one farm intent to a PostgREST RPC and return the parsed result.
 *
 * NON-FATAL on every failure (the putClientState contract): a transport error,
 * a missing config or a server refusal returns {ok:false, error} and NEVER
 * throws. A failed call leaves G untouched — the plot the player sees is either
 * the last reconciled server state or their optimistic prediction, and the next
 * gesture (carrying the SAME idem on a retry) settles it.
 */
async function callFarmRpc(name, body, opts) {
  const cfg = resolveConfig(opts);
  if (!cfg) return { ok: false, error: 'no_config' };
  const f = (typeof fetch !== 'undefined') ? fetch : null;
  if (!f) return { ok: false, error: 'no_fetch' };
  try {
    const resp = await f(cfg.url + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + cfg.jwt,
      },
      body: JSON.stringify(body),
    });
    if (!resp || !resp.ok) return { ok: false, error: 'http_' + (resp && resp.status) };
    const json = await resp.json();
    return (json && typeof json === 'object') ? json : { ok: false, error: 'bad_response' };
  } catch (e) {
    return { ok: false, error: 'transport', detail: e && e.message };
  }
}

/* ── THE FOUR GESTURES. Only ids/slots/plot indices cross the wire — never a
   price, a yield, an xp figure or a timestamp; the server owns every one of
   those. p_idem makes a retry a no-op. Each returns Promise<jsonb result>. ─── */
export function farmPlant(plotIdx, cropId, opts) {
  const o = opts || {};
  return callFarmRpc('hr_farm_plant', {
    p_slot: (o.slot !== undefined && o.slot !== null) ? (o.slot | 0) : activeSlot(),
    p_plot_idx: plotIdx | 0,
    p_crop: String(cropId == null ? '' : cropId),
    p_idem: o.idem || newFarmIdem(),
  }, o);
}
export function farmWater(plotIdx, opts) {
  const o = opts || {};
  return callFarmRpc('hr_farm_water', {
    p_slot: (o.slot !== undefined && o.slot !== null) ? (o.slot | 0) : activeSlot(),
    p_plot_idx: plotIdx | 0,
    p_idem: o.idem || newFarmIdem(),
  }, o);
}
export function farmHarvest(plotIdx, opts) {
  const o = opts || {};
  return callFarmRpc('hr_farm_harvest', {
    p_slot: (o.slot !== undefined && o.slot !== null) ? (o.slot | 0) : activeSlot(),
    p_plot_idx: plotIdx | 0,
    p_idem: o.idem || newFarmIdem(),
  }, o);
}
export function farmUpgradePlot(opts) {
  const o = opts || {};
  return callFarmRpc('hr_farm_upgrade_plot', {
    p_slot: (o.slot !== undefined && o.slot !== null) ? (o.slot | 0) : activeSlot(),
    p_idem: o.idem || newFarmIdem(),
  }, o);
}

/* ── RECONCILE — RENDER THE SERVER'S RESPONSE INTO G ──────────────────────────
   The read model. Given an RPC result, write the authoritative new plot state
   into G.farmPlots (or the new plot level into G.plotLevels), and apply the
   inventory/XP the SERVER credited (once, from the response) via the injected
   deps so the client cache tracks the server row. PURE over its inputs (no DOM,
   no window); legacy.js passes deps = {addItem, removeItem, addXp} and re-renders
   after.

   ⚠ THE DOUBLE-CREDIT BOUNDARY LIVES HERE. There is NO local yield roll in this
   function: harvest applies `res.qty` of `res.produce` and nothing else. So a
   call site that routes through here under arm CANNOT also add a locally-rolled
   yield without it being a second, visible write — which is exactly what the
   legacy gate removes. */
function parseTs(v, fallbackMs) {
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : (fallbackMs !== undefined ? fallbackMs : Date.now());
}
function dep(deps, name) {
  const fn = deps && deps[name];
  return typeof fn === 'function' ? fn : function () {};
}

export function reconcileFarmResult(G, kind, res, deps) {
  if (!G || typeof G !== 'object' || !res || res.ok !== true) return false;
  const addItem = dep(deps, 'addItem');
  const removeItem = dep(deps, 'removeItem');
  const addXp = dep(deps, 'addXp');

  if (kind === 'upgrade') {
    if (typeof res.plot_level === 'number') G.plotLevels = res.plot_level;
    if (res.deeds_spent > 0) removeItem('farm_deed', res.deeds_spent | 0);
    return true;
  }

  if (!Array.isArray(G.farmPlots)) G.farmPlots = [];
  const idx = res.plot | 0;

  if (kind === 'plant') {
    G.farmPlots[idx] = {
      cropId: res.crop,
      plantedAt: parseTs(res.planted_at),
      waterings: [],
      state: 'growing',
      regrowCount: 0,
    };
    // Server debited exactly one seed + granted the plant XP; mirror into cache.
    if (res.seed_spent) removeItem(res.seed_spent, 1);
    if (res.plant_xp) addXp('farming', res.plant_xp | 0);
    return true;
  }

  if (kind === 'water') {
    const p = G.farmPlots[idx];
    if (p && typeof p === 'object') {
      const ws = Array.isArray(p.waterings) ? p.waterings.slice() : [];
      ws.push(parseTs(res.watered_at));
      G.farmPlots[idx] = { ...p, waterings: ws };
    }
    if (res.water_xp) addXp('farming', res.water_xp | 0);
    return true;
  }

  if (kind === 'harvest') {
    // SERVER-OWNED PRODUCE + XP — applied ONCE, from the response. No local roll.
    if (res.produce && res.qty > 0) addItem(res.produce, res.qty | 0);
    if (res.xp) addXp('farming', res.xp | 0);
    const prev = G.farmPlots[idx];
    if (res.withered) {
      G.farmPlots[idx] = null;
    } else if (res.regrew) {
      const prevCount = (prev && typeof prev.regrowCount === 'number') ? prev.regrowCount : 0;
      G.farmPlots[idx] = {
        cropId: res.crop,
        plantedAt: Date.now(),   // server reset planted_at = now(); approximated
        waterings: [],
        state: 'growing',
        regrowCount: prevCount + 1,
      };
    } else {
      G.farmPlots[idx] = null;   // non-regrowing crop → plot cleared
    }
    return true;
  }

  return false;
}

if (typeof window !== 'undefined') {
  window.HearthriseFarmSync = {
    isFarmServerArmed,
    activeSlot, newFarmIdem,
    farmPlant, farmWater, farmHarvest, farmUpgradePlot,
    reconcileFarmResult,
  };
}
