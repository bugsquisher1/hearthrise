// ============================================================================
// src/net/dungeon-scrip-record.js — DUNGEON SCRIP, THE CLIENT READ + THE ARM.
//
// Dungeon Scrip is a fungible currency (spent at the Quartermaster). The server
// now owns it (player_state.dungeon_scrip, credited by hr_dungeon_settle,
// projected by hr_state_of — docs/design/dungeon-settlement.md §1/§2). This module
// is the CLIENT half of that read, modelled on src/net/marks-record.js: one arm
// flag, one read helper every display site routes through, and a top-level home
// (`G.dungeonScrip`) so the server value can be reconciled onto it.
//
// ── SHIPPED DORMANT, AND WHY IT MUST STAY COUPLED TO INCREMENT 3 ─────────────
// Scrip is EARNED by hr_dungeon_settle (increment 2, this) and SPENT at the
// Quartermaster by quartermaster_buy (increment 3, NOT built yet). Arming the READ
// here while the SPEND still does `removeItem('dungeon_scrip')` on the INVENTORY
// item would leave the shop debiting a bag entry that no longer holds the balance.
// So DUNGEON_SETTLE_ARM_ENABLED stays FALSE until the rollout that lands BOTH the
// applied+deployed settle server AND quartermaster_buy — flipped by the
// Coordinator, not here. While false this module changes nothing byte-for-byte:
// scripHeld() falls back to the inventory item exactly as today.
//
//   dormant (false): scrip lives at G.inventory.dungeon_scrip, minted client-side
//                    (today's behaviour, and today's "goes to 0 on reload" bug).
//   armed   (true):  scrip is the server's — read from the envelope into the
//                    top-level G.dungeonScrip, credited only by hr_dungeon_settle,
//                    and it SURVIVES a reload because hr_state_of projects it.
//
// PURE ESM. No DOM. Node-importable (the guards drive these exact bytes).
// ============================================================================

/* ⚠ DORMANT. Flip to true ONLY in the post-apply rollout that also ships
   quartermaster_buy (increment 3) and moves every scrip READ/SPEND site
   server-side. If you flip the value, flip this comment in the same edit. */
export const DUNGEON_SETTLE_ARM_ENABLED = false;

let armOverride = null;

/** The master accrual switch, read lazily so this module imports cleanly in Node
    (where there is no localStorage). Mirrors marks-record's isRecordActive gate:
    the arm cannot be true while server accrual is off, which would leave scrip
    read server-first while nothing populated it. */
function serverActive() {
  try {
    if (typeof window !== 'undefined' && window.HearthriseAccrue
        && typeof window.HearthriseAccrue.isServerAccrualEnabled === 'function') {
      return !!window.HearthriseAccrue.isServerAccrualEnabled();
    }
  } catch (e) { /* fall through */ }
  return false;
}

export function isDungeonSettleArmed() {
  const on = armOverride !== null ? armOverride : DUNGEON_SETTLE_ARM_ENABLED;
  return !!on && serverActive();
}

/** Test seam, same spirit as __setMarksRecordArm. Pass null to fall back to the
    const; a boolean forces the arm on/off for a test. Returns the armed state.
    ⚠ It forces the arm regardless of the master switch (tests have no window),
    so a test can exercise the armed READ path without a live accrual switch. */
export function __setDungeonSettleArm(v) {
  armOverride = (v === null || v === undefined) ? null : !!v;
  return armOverride === null ? DUNGEON_SETTLE_ARM_ENABLED : armOverride;
}

/** THE ONE READ. Every scrip display site routes through this so "where scrip
    lives" is decided in ONE place. Armed → the top-level G.dungeonScrip (the
    server's, reconciled from the envelope); dormant → the legacy inventory item,
    byte-for-byte as today. Never throws; a missing G reads 0. */
export function scripOf(G) {
  if (!G || typeof G !== 'object') return 0;
  if (isDungeonSettleArmed()) {
    const v = Number(G.dungeonScrip);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }
  const inv = G.inventory && Number(G.inventory.dungeon_scrip);
  return Number.isFinite(inv) && inv >= 0 ? inv : 0;
}

/** Reconcile the server scrip balance onto G from an hr_state_of envelope's
    `state.dungeon_scrip`. Display-only under the arm — the server column is the
    authority; this mirrors it so the topbar/panel render immediately. A no-op
    while dormant (scrip stays the inventory item). Returns the value applied, or
    null when nothing usable was on the wire (fail-closed: never write a NaN). */
export function reconcileScrip(G, envState) {
  if (!isDungeonSettleArmed() || !G || typeof G !== 'object') return null;
  if (!envState || typeof envState !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(envState, 'dungeon_scrip')) return null;
  const v = Number(envState.dungeon_scrip);
  if (!Number.isFinite(v) || v < 0) return null;
  G.dungeonScrip = v;
  return v;
}

if (typeof window !== 'undefined') {
  window.HearthriseDungeonScrip = {
    DUNGEON_SETTLE_ARM_ENABLED, isDungeonSettleArmed, __setDungeonSettleArm,
    scripOf, reconcileScrip,
  };
}
