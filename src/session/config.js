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
  /** Characters one login may play at the same time (WEEK_PLAN 2026-10-17: up to 4). The SERVER enforces it, per
      account and per network (2027-01-19-play-cap.sql, through the generated `max_concurrent` row); here it only
      bounds the tab's connections. */
  maxConcurrentCharacters: 4,
  /** The server's slot bound: hr_load / hr-accrue clamp `slot` to 0..5 (request.js MAX_SLOT). */
  maxSlot: 5,
  /** Where the sign-in token lives: 'device' (survives a closed tab) or 'tab' (one login per tab). */
  authStore: 'device',
  /** The storage key the auth client keeps its session under. */
  authKey: 'hr-auth',
  /** The tab's own session id (sessionStorage), so two tabs are two sessions. */
  tabKey: 'hr-tab-id',
  /** The heroes this tab has open and the one it shows (sessionStorage), so a reload reopens them instead of the
      characters screen (designer 10-30 #8). Display state, never authority: the roster decides what exists. */
  openKey: 'hr-open',
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
  /** The engine reads (hr-accrue {slot}) ONE character sends a minute, sustained (src/session/ask-pacer.js).
      hr_rate_gate's `accrue` budget, 30 a minute, is the ACCOUNT's: maxConcurrentCharacters x this stays
      under it (4 x 6 = 24); the hunt re-read every huntPollMs is 3.75 of it. */
  engineAsksPerMin: 6,
  /** ...and the most that may go at once from a rested budget: the live view's start-point asks (liveAskMs
      doubling up to huntPollMs, six) with a leave and its close. */
  engineAskBurst: 8,
  /** An UNVIEWED hunting character (CLAUDE.md §6: only the viewed one streams live) reads itself this often with a
      plain read (hr_load: never the engine's budget, no live view), so its strip and alerts learn of a hunt's end
      within a minute; the server settles it meanwhile (the world tick, or the party's viewed member). */
  unviewedPollMs: 60000,
  /** A re-read after a refusal (or a re-read that did not land) goes at once, then at most one per this window,
      doubling for each that follows close on the last up to resyncMaxMs (src/session/read-gate.js): N refused
      presses cost one bounded read each window, never N. */
  resyncMinMs: 2000,
  resyncMaxMs: 16000,
  /** While the Work window or the bag is open and the hero gathers or works a bench in town, the viewed
      character asks the engine to bring it up to date this often (src/session/town-poll.js), so the bag,
      the skill XP and the run's progress move as it goes. Just over the engine's town floor
      (accrual.js TOWN_SETTLE_MIN_MS, 15 s) so each ask pays a window. */
  townPollMs: 16000,
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
  /** Without a live start point, ask this soon (the floor answers with hunt_live, writing nothing),
      doubling per answer that brought none, up to huntPollMs, and never before the hunt's first
      boundary (src/session/live-link.js askDelayMs). */
  liveAskMs: 300,
  /** A PENDING LEAVE closes at the server's leave_at: the hunter's settle is asked this long after it
      (clock slack), not up to a huntPollMs later; the settle closes it then (hunt-settle.js: a pending
      leave is never held back by the floor). */
  leaveSlackMs: 400,
  /** ...and, if that settle did not close it yet, asked again this often until leaveLateMs past leave_at
      (then the ordinary poll goes on asking, and the hunt bar says it is still being processed). */
  leaveRetryMs: 2000,
  leaveLateMs: 16000,
  /** THE LOOK-AHEAD KEPT FULL: ask for the next combat seeds this long before the prediction would run
      out of them (src/session/live-link.js refillDelayMs): four swings, room for an answer that brings
      none and one retry. */
  liveRefillMs: 8000,
});
