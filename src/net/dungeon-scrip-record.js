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
// -- ARMED 2026-09-06 -- WHY IT IS NOW SAFE TO FLIP -------------------------
// Scrip is EARNED by hr_dungeon_settle (increment 2) and SPENT at the
// Quartermaster by hr_quartermaster_buy (increment 3). Arming the READ while the
// SPEND still did `removeItem('dungeon_scrip')` on the INVENTORY item would have
// left the shop debiting a bag entry that no longer holds the balance -- so this
// stayed FALSE until BOTH halves existed server-side AND client-side. All of that
// is now true and VERIFIED read-only against production (2026-09-06):
//   * hr_dungeon_settle + hr_quartermaster_buy both exist live (pg_proc).
//   * hr_dungeons 6 / hr_dungeon_loot 38 / hr_qm_offers 19 rows seeded, and
//     `node tools/gen-dungeon-catalogue.mjs --check` says the catalogue matches
//     src/data/dungeons.js.
//   * player_state.dungeon_scrip exists and hr_state_of projects it.
//   * the deployed hr-accrue reports payload 276af1c6... == this repo's
//     `node tools/pack-edge.mjs hr-accrue --hash`, so the dungeon_settle and
//     quartermaster_buy verbs are ROUTED live.
//   * and the proof this flip IS the bug: player_ledger holds ZERO kind='dungeon'
//     rows and ZERO characters hold server scrip -- every clear since BLOB_RETIRED
//     minted into the bag and was erased by the next envelope.
// The remaining gate is operational, not technical: the arm is a player-facing
// economy loop, so it does not PUSH without the live play gate (settle -> scrip +
// loot + key; QM buy -> debit + grant; reload -> scrip survives; same-key retry ->
// no double-spend). See docs/STABILIZATION_AUDIT.md SA-015.
//
//   dormant (false): scrip lives at G.inventory.dungeon_scrip, minted client-side
//                    (the pre-arm behaviour, and the "goes to 0 on reload" bug).
//   armed   (true):  scrip is the server's — read from the envelope into the
//                    top-level G.dungeonScrip, credited only by hr_dungeon_settle,
//                    and it SURVIVES a reload because hr_state_of projects it.
//
// PURE ESM. No DOM. Node-importable (the guards drive these exact bytes).
// ============================================================================

/* ⚠ ARMED (2026-09-06). Both increments are applied, deployed and wired — see
   "ARMED" in the header for the production evidence. If you flip the value, flip
   that comment in the same edit, and never arm the READ without the
   quartermaster_buy SPEND: the earn and the spend are ONE switch. */
export const DUNGEON_SETTLE_ARM_ENABLED = true;

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
  /* A forced test override FULLY determines the arm — __setDungeonSettleArm is
     documented to "force the arm regardless of the master switch (tests have no
     window)", and the in-page DGN-SETTLE-2 has a window whose accrual switch is
     off, so gating the override with serverActive() left the forced-armed READ
     path unreachable in the browser (it only worked in Node via a window stub).
     PRODUCTION is unchanged: nothing sets armOverride in prod, so the arm still
     requires BOTH the flag AND live server accrual (never read server-first
     while nothing populates the server value). */
  if (armOverride !== null) return armOverride;
  return !!DUNGEON_SETTLE_ARM_ENABLED && serverActive();
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
