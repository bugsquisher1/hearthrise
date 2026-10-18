// ════════════════════════════════════════════════════════════════════════
// src/session/config.js — THE SESSION KNOBS, IN ONE PLACE.
//
// Values only; no behaviour. Every limit the account/character sessions apply
// is read from here, so a change of rule (premium per extra character, a
// per-IP cap) is a value change, never a code hunt.
// ════════════════════════════════════════════════════════════════════════

export const SESSION_CONFIG = Object.freeze({
  /** The hosts the game is served from. hr-accrue's CORS allowlist (cors.js
      ALLOWED_ORIGINS) must be exactly these (tests/cors-preflight.mjs C3). */
  playerHosts: Object.freeze(['hearthrise.net', 'www.hearthrise.net', 'bugsquisher1.github.io']),
  /** Characters one login may play at the same time (WEEK_PLAN 2026-10-17: up to 4). */
  maxConcurrentCharacters: 4,
  /** The server's slot bound: hr_load / hr-accrue clamp `slot` to 0..5 (request.js MAX_SLOT). */
  maxSlot: 5,
  /** Where the sign-in token lives: 'device' (survives a closed tab) or 'tab' (one login per tab). */
  authStore: 'device',
  /** The storage key the auth client keeps its session under. */
  authKey: 'hr-auth',
  /** The tab's own session id (sessionStorage), so two tabs are two sessions. */
  tabKey: 'hr-tab-id',
  /** Pre-reset keys that may still hold a token on this device; sign-out removes them too. */
  retiredAuthKeys: Object.freeze(['hearthrise:supabaseSession']),
  /** A residue write waits this long for more changes before it is sent (one put per burst). */
  residueDebounceMs: 1500,
  /** Reconnect delay bounds for a character's push channel. */
  reconnectMinMs: 1000,
  reconnectMaxMs: 60000,
});
