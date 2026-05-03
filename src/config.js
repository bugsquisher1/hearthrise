// ============================================================
// src/config.js
//
// Central configuration constants. Anything that's a "knob" — a
// magic number that gets tuned during balance passes — lives here
// and is imported where used. The goal is:
//   • single place to retune balance during beta,
//   • git diffs that show "we lowered the tax from 1.5% to 1.0%"
//     instead of buried inside a render function,
//   • one definition shared between the live game and the smoke /
//     migration tests.
//
// Modules opt in by importing { CONFIG } and dereferencing what
// they need. Existing inline `const HOUSE_TAX = 0.015` declarations
// in market.js, chat.js, etc. shadow these for backward compat —
// gradually migrate inline constants to imports without changing
// behavior.
//
// Keep this file small; resist the urge to dump every constant in
// the codebase here. Only put things in CONFIG that you'd want to
// tune between releases.
// ============================================================

export const MARKET = {
  /** House tax taken from every successful sale. 1.5% during soft beta. */
  HOUSE_TAX: 0.015,
  /** Listings expire and refund the seller after this many ms. 48h. */
  LISTING_TTL_MS: 48 * 3600 * 1000,
  /** Max simultaneous active listings PER character (also used for buy offers). */
  PER_CHAR_LIMIT: 12,
  /** localStorage cap for sales history per item id. */
  SALES_HISTORY_CAP: 50,
  /** Window for "7-day" stats. Bump during testing if needed. */
  STATS_WINDOW_MS: 7 * 24 * 3600 * 1000,
};

export const CHAT = {
  /** Max characters in a single chat message. */
  MAX_MSG_LEN: 240,
  /** Per-channel message buffer cap (FIFO eviction). */
  MSG_CAP: 200,
  /** Min ms between sends from the same player (anti-spam). */
  SEND_THROTTLE: 800,
};

export const OFFLINE = {
  /** Free-tier offline progression cap (hours). */
  CAP_HOURS_FREE: 12,
  /** Hearth Hall Premium offline cap. */
  CAP_HOURS_PLUS: 16,
};

export const COMBAT = {
  /** Tick interval ms during live combat. Lower = faster, more CPU. */
  TICK_MS: 2400,
  /** Player damage variability around the computed max. */
  DAMAGE_RANGE_MIN: 0,
  DAMAGE_RANGE_MAX: 1,
};

export const SAVE = {
  /** localStorage key for the active character's save. */
  KEY: 'hearthbound-save-v2',
  /** Number of legacy migration backups to retain. */
  BACKUP_RETENTION: 3,
};

export const FTUE = {
  /** Total session XP under which a player counts as "new" for the FTUE. */
  NEW_PLAYER_XP_THRESHOLD: 100,
  /** Delay before showing step 1 on a fresh boot, in ms. */
  BOOT_DELAY_MS: 600,
};

// ── Aggregate view for devtools ──────────────────────────────
export const CONFIG = { MARKET, CHAT, OFFLINE, COMBAT, SAVE, FTUE };

// Classic-script bridge
if (typeof window !== 'undefined') {
  window.HearthriseConfig = CONFIG;
}
