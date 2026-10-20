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
  /** While a hunt is open, the character asks the engine to bring it up to date this often (hr-accrue
      {slot}: the hunter's settle, with its track and events). Just over the engine's player-door floor
      (hunt-settle.js HUNT_SETTLE_MIN_MS, 15 s) so each ask pays a window; the world tick only flushes a
      session owed 90 s or more, so without this an attended hunt shows nothing for a minute and a half. */
  huntPollMs: 16000,
  /** How far behind the server the hunt scene plays (src/hunt-view/timeline.js delayMs). A window's
      track and events arrive once per settle (every huntPollMs, the player door's floor), and they
      describe the PAST huntPollMs; played 600 ms behind, a whole window landed in the past at once and
      the scene jumped to its end and froze until the next one (the v0.2.7 "slideshow"). Behind by one
      poll plus slack, every step and blow of every window plays at its own instant. The snapshot's
      numbers (HP, loot, the bar) stay live; only the moving picture is buffered. */
  huntPlaybackDelayMs: 19000,
  /** THE LIVE VIEW (option B): the viewed hunt runs in the browser and plays this far behind the
      engine (a frame or so of slack for a swing simulated at its boundary). */
  liveDelayMs: 150,
  /** A reconcile eases each unit onto the server's world over at least this long (timeline.js T8). */
  liveEaseMs: 250,
  /** Without a live start point, ask this soon (the floor answers with hunt_live, writing nothing). */
  liveAskMs: 300,
  /** ...and at most this many times in a row before falling back to the ordinary poll. */
  liveAskTries: 2,
  /** A PENDING LEAVE closes at the server's leave_at: the hunter's settle is asked this long after it
      (clock slack), not up to a huntPollMs later; the settle closes it then (hunt-settle.js: a pending
      leave is never held back by the floor). */
  leaveSlackMs: 400,
  /** ...and, if that settle did not close it yet, asked again this often until a huntPollMs past leave_at. */
  leaveRetryMs: 2000,
});
