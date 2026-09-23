// ============================================================
// src/net/build-watch.js — b333
//
// THE HOLE UNDER EVERY CLIENT FIX WE WILL EVER SHIP.
//
// b331 fixed the dead-token loop. b331 and b332 are both live. The player the
// fix was written for — user b94fa8c0… — is STILL emitting ~350 HTTP 401/hour
// today, and their game_saves row has been stale for two days. They cannot
// receive the fix, because receiving it requires a page reload they are not
// doing. Nothing in this codebase ever told a live tab that a new build exists:
// `location.reload()` appears only behind explicit user actions, and the service
// worker's skipWaiting()/clients.claim() only helps the NEXT navigation.
//
// For an idle game, a tab left open for days is the INTENDED way to play. So
// "the fix ships" and "the fix arrives" are different events, and the gap
// between them is unbounded. This module closes it.
//
// WHAT IT DOES: periodically re-reads the deployed src/build-info.js (cache
// busted) and compares its BUILD.cache with the one this tab is running.
//
// FOUR RULES IT IS BUILT AROUND:
//
// AMENDMENT — RULE 1 WAS TOO STRONG AND IT COST A PLAYER SIX DAYS. Measured
// live: one tab sent a residue key the server had since deny-listed 550-800
// times a day for six days, persisting nothing and missing every shipped fix.
// The watcher worked the whole time: it polled, it saw the new build, it drew
// the card — and the player ignored the card. `cardShowing` then answers
// 'already-showing' forever, so notify-only leaves staleness unbounded.
// Rule 1 was written for the auth-dead case, where the local copy is the ONLY
// copy. Post-cutover that premise is false for a healthy tab: progression is
// server-owned and the only thing a reload drops is the residue, which we
// flush first with the same forced keepalive save `pagehide` uses. So: one
// build behind is still the card; TWO OR MORE reloads itself at the next safe
// moment (nothing modal, no write in flight); auth-dead still only escalates.
// LOOP-PROOF: the reload stamps sessionStorage (survives the reload, dies with
// the tab) and refuses a second one inside AUTO_RELOAD_COOLDOWN_MS, so a CDN
// edge still serving the old bundle costs one reload, not a spin — and it
// purges Cache Storage + unregisters the SW first, because a reload answered
// from the stale shell IS the loop.
//
//  1. IT NEVER RELOADS WITHOUT CONSENT — *one build behind*. An auto-reload can drop state that has
//     not reached localStorage — and in the exact failure mode this exists for
//     (b331 auth-dead), the local copy is the ONLY copy of the player's
//     progress. Save-before-reload is not available to us there: the save is
//     precisely what is failing. So the player presses the button, and the copy
//     tells the truth about what reloading does.
//
//  2. TWO SEVERITIES, AND THE SECOND IS THE POINT. A routine new build is a
//     dismissible, non-interrupting card — an idle player mid-session must
//     never have the page yanked out from under them. But when sync has
//     TERMINATED into the b331 `auth-dead` state, a stale build is the
//     difference between "your progress is not saving" and "your progress is
//     saving", and that gets escalated — INTO the existing b331 sign-in-expired
//     sheet, never as a second competing modal.
//
//  3. FAIL SILENT AND CHEAP. A failed poll, an offline device, a 404, a
//     truncated or malformed body: all do nothing at all. Every gate is a pure
//     function, backoff is exponential, a poll is never issued while the tab is
//     hidden or while one is already in flight. A build-freshness watchdog that
//     became a request loop would be a perfect self-parody.
//
//  4. THE DECISION IS PURE. `decideBuildUpdate` (running, deployed, auth state,
//     what the player has already been told, busy, cooldown) → none | notify |
//     reload | escalate, with
//     no fetching and no DOM in it, so the suite drives the real decision table
//     rather than a restatement of it.
//
// HONEST LIMITATION, STATED UP FRONT: this cannot rescue the tabs already open
// on b332 and earlier. They have no copy of this module. It closes the hole
// from b333 forward. There is no client-side fix for "the client cannot be
// reached" — only a server-pushed one (realtime broadcast), which is a bigger
// change and rests on the very connection that is dead in this failure mode.
// ============================================================

import { BUILD } from '../build-info.js?v=551';

/* ── Cadence ────────────────────────────────────────────────────────────────
   POLL_INTERVAL_MS: 15 minutes. We ship a handful of builds on a busy day, so
   the exposure window that matters is "hours", not "seconds"; 15 min bounds it
   at 96 requests/day of a ~1 KB static file per open tab — free — while being
   short enough that a mid-session build lands before the session ends.

   VISIBILITY_MIN_GAP_MS: a returning player is about to ACT, and that is the
   moment a stale build costs them something, so coming back to the tab checks
   immediately — throttled to once a minute so alt-tabbing cannot be turned
   into a request loop.

   HIDDEN TABS NEVER POLL. A background tab is not about to act; it will be
   checked the instant it is looked at. This is what keeps 30 idle tabs free.  */
export const POLL_INTERVAL_MS = 15 * 60 * 1000;
export const VISIBILITY_MIN_GAP_MS = 60 * 1000;
export const TICK_MS = 60 * 1000;
export const FAIL_BACKOFF_BASE_MS = 2 * 60 * 1000;
export const FAIL_BACKOFF_MAX_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
/* A build-info.js is ~1 KB. Anything much larger is a captive-portal login page
   or an SPA index.html, not our file — refuse to regex-scan it. */
export const MAX_BODY_BYTES = 64 * 1024;

/* ── Auto-reload ───────────────────────────────────────────────────────
   AUTO_RELOAD_MIN_LAG: 2. "One build behind" is a player who has been playing
   across a release — routine, and the card is the right instrument. "Two or
   more behind" is a tab that has already ignored at least one prompt, which the
   live data says means it will ignore all of them.

   AUTO_RELOAD_COOLDOWN_MS: 30 minutes, stamped in sessionStorage so it survives
   the very reload it guards. If the CDN edge is still serving the old bundle,
   the tab comes back just as stale — and refuses to reload again for half an
   hour, falling back to the card. One reload, never a spin. */
export const AUTO_RELOAD_MIN_LAG = 2;
export const AUTO_RELOAD_COOLDOWN_MS = 30 * 60 * 1000;
export const AUTO_RELOAD_KEY = 'hr-build-autoreload-at';

/** Exponential backoff after consecutive failed polls. Pure. */
export function nextPollBackoffMs(fails) {
  const f = Math.max(0, Math.floor(Number(fails) || 0));
  if (f <= 0) return 0;
  return Math.min(FAIL_BACKOFF_MAX_MS, FAIL_BACKOFF_BASE_MS * Math.pow(2, Math.min(f, 20) - 1));
}

/**
 * Read BUILD.cache out of a fetched build-info.js. Pure.
 *
 * A regex rather than `import()`: importing would execute the deployed file in
 * this tab (it assigns window.HearthriseBuild and logs) and would be served
 * from the module cache, which is exactly the staleness we are trying to
 * detect. Returns null for anything we cannot read with certainty — a captive
 * portal's HTML, a truncated body, a 0/NaN/negative number. Null means DO
 * NOTHING, never "assume stale".
 */
export function parseDeployedBuild(text) {
  if (typeof text !== 'string' || !text.length || text.length > MAX_BODY_BYTES) return null;
  const m = text.match(/cache\s*:\s*(\d{1,9})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * THE DECISION. Pure, total, and the whole contract of this module.
 *
 *   in:  { running, deployed, authDead, promptedFor, dismissedFor, escalatedFor,
 *          cardShowing }
 *   out: { action: 'none' | 'notify' | 'escalate', reason, build }
 *
 * Ordering is load-bearing:
 *
 *   • An unreadable or absent `deployed` is 'none'. Uncertainty never prompts.
 *   • `deployed <= running` is 'none' — including deployed < running, which is a
 *     stale CDN edge or a rollback. Never ask a player to reload BACKWARDS.
 *   • ESCALATE OUTRANKS DISMISSAL. If the player waved away "a new version is
 *     ready" and sync has since died, the message is no longer the one they
 *     dismissed: it is "your progress is not reaching the cloud, and reloading
 *     is what fixes that". Different claim, so it earns one more interruption.
 *   • Every severity latches PER DEPLOYED BUILD, so nothing nags. A player who
 *     dismisses b334 is told again only when b335 ships.
 *   • DISMISSED and SHOWN ARE DIFFERENT FACTS, and the difference is the
 *     player's intent. Only a dismissal is permanent for that build. Having
 *     shown a card that is no longer on screen — the DOM was re-rendered, a
 *     theme swap rebuilt the body, something removed it — means the player
 *     never saw the message they were meant to see, so the next poll puts it
 *     back. (Written this way after a mutation proved the first cut's
 *     dismissal latch was dead code: `promptedFor` masked it, so deleting it
 *     changed no observable behaviour and no test could see it.)
 */
export function decideBuildUpdate(input) {
  const s = input || {};
  const running = Number(s.running);
  const deployed = Number(s.deployed);
  const none = (reason) => ({ action: 'none', reason, build: 0 });

  if (!Number.isFinite(running) || running <= 0) return none('no-running-build');
  if (!Number.isFinite(deployed) || deployed <= 0) return none('unreadable');
  if (deployed === running) return none('up-to-date');
  if (deployed < running) return none('deployed-is-older');

  if (s.authDead) {
    if (Number(s.escalatedFor) === deployed) return none('already-escalated');
    return { action: 'escalate', reason: 'stale-build-while-sync-dead', build: deployed };
  }

  /* Two or more builds behind. This tab has already been told at least
     once and did not act, so it moves itself — but only at a safe moment, and
     only once per cooldown. Placed ABOVE the dismissal / already-showing
     latches on purpose: those latches are what let the six-day tab exist. When
     the moment is not safe (a modal is open, a write is in flight) or the
     cooldown is live, we fall THROUGH to the card path rather than returning
     'none', so the player is still told and the next poll can act. */
  const lag = deployed - running;
  if (lag >= AUTO_RELOAD_MIN_LAG) {
    const now = Number(s.now) || 0;
    const last = Number(s.lastAutoReloadAt) || 0;
    const cooling = last > 0 && now - last >= 0 && now - last < AUTO_RELOAD_COOLDOWN_MS;
    if (!cooling && !s.busy) {
      return { action: 'reload', reason: 'builds-behind', build: deployed };
    }
  }

  if (Number(s.dismissedFor) === deployed) return none('dismissed');
  if (Number(s.promptedFor) === deployed && s.cardShowing) return none('already-showing');
  return { action: 'notify', reason: 'new-build', build: deployed };
}

/**
 * MAY WE PUT A POLL ON THE WIRE RIGHT NOW? Pure, for the same reason the b331
 * breaker is pure: "this can never become a request loop" is a claim about
 * cadence over hours, and a pure gate lets the suite simulate those hours
 * instead of asserting about code shape.
 */
export function decideBuildPoll(input) {
  const s = input || {};
  const now = Number(s.now) || 0;
  const no = (reason) => ({ poll: false, reason });
  if (s.inFlight) return no('in-flight');
  if (s.hidden) return no('hidden');
  const since = now - (Number(s.lastPollAt) || 0);
  if (since < 0) return no('clock-went-backwards');
  const backoff = nextPollBackoffMs(s.fails);
  const floor = Math.max(backoff, s.trigger === 'visible' ? VISIBILITY_MIN_GAP_MS : POLL_INTERVAL_MS);
  if (since < floor) return no(backoff > 0 ? 'backoff' : 'too-soon');
  return { poll: true, reason: s.trigger === 'visible' ? 'returned-to-tab' : 'interval' };
}

// ── Runtime ─────────────────────────────────────────────────────────────────

const HERE = import.meta.url;
export const BUILD_INFO_URL = (() => {
  try { return new URL('../build-info.js', HERE).href; }
  catch (e) { return 'src/build-info.js'; }
})();

/* The auto-reload stamp lives in sessionStorage because it must survive the
   reload it guards and must NOT survive the tab (a new tab is a new decision).
   Unreadable / garbage / a future timestamp all read as "never" — uncertainty
   must not be able to BLOCK the rescue either. */
function readAutoReloadStamp() {
  try {
    if (typeof sessionStorage === 'undefined') return 0;
    const n = Number(sessionStorage.getItem(AUTO_RELOAD_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (e) { return 0; }
}
function writeAutoReloadStamp(now) {
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(AUTO_RELOAD_KEY, String(now)); }
  catch (e) {}
}

const state = {
  running: Number(BUILD && BUILD.cache) || 0,
  deployed: 0,
  lastPollAt: 0,
  inFlight: false,
  fails: 0,
  promptedFor: 0,
  dismissedFor: 0,
  escalatedFor: 0,
  lastAutoReloadAt: readAutoReloadStamp(),
  autoReloads: 0,
};

/**
 * IS THIS A SAFE MOMENT TO TAKE THE PAGE AWAY? Conservative by construction:
 * anything we are not sure about answers "busy", because deferring costs one
 * poll interval and a bad moment costs the player an action.
 *
 * Busy = a dialog/modal owns the screen (including the eviction gate and the
 * sign-in-expired sheet), or a record/intent write is on the wire.
 */
export function defaultBusyProbe() {
  try {
    if (typeof document === 'undefined') return true;
    if (document.getElementById('hr-evicted-gate')) return true;
    if (document.getElementById('hr-auth-expired-gate')) return true;
    if (document.querySelector('dialog[open], .modal.show, .modal.open, .hr-modal:not([hidden])')) return true;
    const R = typeof window !== 'undefined' && window.HearthriseRecord;
    if (R && typeof R.getRecordState === 'function' && R.getRecordState().pending) return true;
    return false;
  } catch (e) { return true; }
}
let busyProbe = defaultBusyProbe;

/* Read-only seam onto b331's terminal state. sync.js already publishes
   getAuthGate(); nothing in that file needed to change for this. Overridable
   so the suite can drive the escalation path without bricking a real session. */
export function defaultAuthDeadProbe() {
  try {
    const S = typeof window !== 'undefined' && window.HearthriseSync;
    const gate = S && typeof S.getAuthGate === 'function' ? S.getAuthGate() : null;
    return !!(gate && gate.dead);
  } catch (e) { return false; }
}
let authDeadProbe = defaultAuthDeadProbe;

function hidden() {
  try { return typeof document !== 'undefined' && document.visibilityState === 'hidden'; }
  catch (e) { return false; }
}

/**
 * The synchronous half of a poll's RESPONSE: parse, decide, act. Split out on
 * purpose — `tryRun` in the smoke suite takes a test's return value, so an
 * async test records PASS before it has asserted anything (the failure family
 * this program has been bitten by twelve times). Entering the real path here
 * lets the b333 battery drive parse → decide → DOM synchronously, with no
 * reimplementation of the thing under test.
 */
export function applyBuildInfoText(text, now = Date.now()) {
  const deployed = parseDeployedBuild(text);
  if (deployed === null) { state.fails++; return { action: 'none', reason: 'unreadable', build: 0 }; }
  state.fails = 0;
  state.deployed = deployed;
  const verdict = decideBuildUpdate({
    running: state.running,
    deployed,
    authDead: !!authDeadProbe(),
    promptedFor: state.promptedFor,
    dismissedFor: state.dismissedFor,
    escalatedFor: state.escalatedFor,
    cardShowing: typeof document !== 'undefined' && !!document.getElementById(CARD_ID),
    busy: !!busyProbe(),
    now,
    lastAutoReloadAt: state.lastAutoReloadAt,
  });
  if (verdict.action === 'reload') {
    autoReloadNow(verdict.build, now);
  } else if (verdict.action === 'notify') {
    if (showUpdateCard(verdict.build)) state.promptedFor = verdict.build;
  } else if (verdict.action === 'escalate') {
    if (escalateIntoAuthSheet(verdict.build)) state.escalatedFor = verdict.build;
  }
  return verdict;
}

/**
 * One tick. Synchronous up to and including the fetch call, so a test can
 * observe that a poll was (or was not) put on the wire without awaiting.
 * Returns the poll verdict.
 */
export function tickBuildWatch(trigger = 'interval', now = Date.now()) {
  const gate = decideBuildPoll({
    now, lastPollAt: state.lastPollAt, inFlight: state.inFlight,
    hidden: hidden(), fails: state.fails, trigger,
  });
  if (!gate.poll) return gate;
  state.lastPollAt = now;
  state.inFlight = true;

  let done = false;
  const settle = (fn) => { if (done) return; done = true; state.inFlight = false; try { fn(); } catch (e) {} };
  let signal, timer = null;
  try {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    if (ctrl) {
      signal = ctrl.signal;
      timer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, FETCH_TIMEOUT_MS);
    }
  } catch (e) {}

  try {
    /* NO PER-POLL CACHE-BUSTER, AND THAT IS DELIBERATE — the first cut had one
       and it was a slow leak. The service worker (legacy.js, b111) treats every
       same-origin `.js` as app shell and does `caches.put(req, res)` on EVERY
       distinct URL it fetches, so `?bw=<timestamp>` would deposit a permanent
       Cache Storage entry per poll — 96 a day, per build, forever. `no-store`
       is the correct instrument here and it is sufficient twice over: it
       bypasses the HTTP cache outright, and the SW's shell strategy is
       NETWORK-FIRST, so a plain URL is fetched fresh and overwrites one single
       entry. Offline, it falls back to the cached copy, which reports the build
       we are already running — i.e. does nothing. */
    Promise.resolve(fetch(BUILD_INFO_URL, { cache: 'no-store', credentials: 'omit', signal }))
      .then((res) => {
        if (!res || !res.ok) throw new Error('bad response');
        return res.text();
      })
      .then((text) => { if (timer) clearTimeout(timer); settle(() => applyBuildInfoText(text, Date.now())); })
      // EVERY failure lands here and does NOTHING but count itself: offline,
      // DNS, 404, abort, a body we cannot read. Never a toast, never a retry
      // storm — the next attempt is gated by nextPollBackoffMs().
      .catch(() => { if (timer) clearTimeout(timer); settle(() => { state.fails++; }); });
  } catch (e) {
    if (timer) clearTimeout(timer);
    settle(() => { state.fails++; });
  }
  return gate;
}

// ── Severity 1: the routine card ────────────────────────────────────────────
// Dismissible, corner-anchored, no scrim, no focus steal, does not stop the
// game. This project's hard rule is that play is never interrupted, and a
// routine build is not an emergency.

export const CARD_ID = 'hr-build-update';

export function showUpdateCard(build) {
  if (typeof document === 'undefined' || !document.body) return false;
  // Both stronger states own the screen: eviction (b302) and the sign-in-expired
  // sheet (b331). Never stack a third thing under them.
  if (document.getElementById('hr-evicted-gate')) return false;
  if (document.getElementById('hr-auth-expired-gate')) return false;
  if (document.getElementById(CARD_ID)) return true;

  const el = document.createElement('div');
  el.id = CARD_ID;
  el.setAttribute('role', 'status');
  /* Same anchor as the b331 sign-in-expired sheet, deliberately: the two are
     mutually exclusive by construction (this refuses to draw while that sheet
     is up, and escalation removes this one), so they can share the position —
     and this is the one spot that covers NEITHER the left rail nor the chat /
     bug buttons on the right. A bottom-left card looked fine until you noticed
     it sat on top of House / Stable / Clan in the nav, which is the worst
     possible thing for a "does not interrupt play" surface to cover. */
  el.style.cssText = [
    'position:fixed', 'left:50%', 'transform:translateX(-50%)', 'bottom:18px',
    'z-index:2147483640',
    'max-width:360px', 'width:calc(100% - 24px)', 'box-sizing:border-box',
    'background:var(--bg-3,#12161f)', 'color:var(--ink,#f2e9d8)',
    'border:1px solid var(--line-strong,#3a4154)', 'border-radius:12px',
    'padding:13px 15px', 'box-shadow:0 8px 24px rgba(0,0,0,.35)',
    'font:400 13.5px/1.45 var(--f-ui,system-ui),system-ui,sans-serif',
  ].join(';');
  el.innerHTML =
    '<div style="font-weight:700;margin-bottom:4px">A new version of Hearthrise is ready</div>'
    + '<p style="margin:0 0 10px;opacity:.8">You are on b' + state.running + ' &middot; b'
    + Number(build) + ' is live. Reload whenever you reach a good stopping point '
    + '&mdash; your game keeps running until you do.</p>'
    + '<div style="display:flex;gap:8px">'
    + '<button type="button" data-act="reload" style="flex:1;font:600 14px/1 var(--f-ui,system-ui),system-ui,sans-serif;'
    + 'background:var(--gold,#d9a441);color:#1a130a;border:0;border-radius:8px;padding:9px 14px;cursor:pointer">Reload now</button>'
    + '<button type="button" data-act="later" style="font:500 13px/1 var(--f-ui,system-ui),system-ui,sans-serif;'
    + 'background:transparent;color:inherit;opacity:.7;border:1px solid var(--line-strong,#3a4154);'
    + 'border-radius:8px;padding:9px 12px;cursor:pointer">Later</button>'
    + '</div>';
  document.body.appendChild(el);
  const reload = el.querySelector('[data-act="reload"]');
  if (reload) reload.addEventListener('click', () => reloadNow());
  const later = el.querySelector('[data-act="later"]');
  if (later) later.addEventListener('click', () => { state.dismissedFor = Number(build) || 0; hideUpdateCard(); });
  return true;
}

export function hideUpdateCard() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(CARD_ID);
  if (el) el.remove();
}

// ── Severity 2: escalation into the b331 sheet ──────────────────────────────
// NOT a second modal. b331 already owns the "your session is broken" surface,
// including its coordination with the b302 eviction gate, and two competing
// dialogs about the same failure is how a player learns to dismiss both.
// showAuthExpiredGate() returns the existing element when one is up, so this
// composes with it whether the sheet is already showing or not — and returns
// null behind the eviction gate, which we honour by doing nothing.
//
// Note it augments the sheet from OUTSIDE. src/net/auth.js just shipped and is
// deliberately not churned for this.

export const ESCALATION_ID = 'hr-authexp-build';

export function escalateIntoAuthSheet(build) {
  if (typeof document === 'undefined' || !document.body) return false;
  let sheet = null;
  try {
    const A = window.HearthriseAuth;
    sheet = A && typeof A.showAuthExpiredGate === 'function'
      ? A.showAuthExpiredGate({ reason: 'stale-build', build: Number(build) || 0 })
      : document.getElementById('hr-auth-expired-gate');
  } catch (e) { sheet = document.getElementById('hr-auth-expired-gate'); }
  if (!sheet) return false;                       // eviction gate is up: it wins
  hideUpdateCard();                               // the quiet card is superseded
  if (sheet.querySelector('#' + ESCALATION_ID)) return true;

  const block = document.createElement('div');
  block.id = ESCALATION_ID;
  block.style.cssText = 'margin:0 0 12px;padding:10px 12px;border-radius:8px;'
    + 'background:rgba(217,164,65,.12);border:1px solid rgba(217,164,65,.45)';
  /* The truth, and only the truth: reloading is what restores saving, and until
     it happens the progress exists on this device alone. We do NOT promise a
     save first — in this state the save is the thing that is failing. */
  block.innerHTML =
    '<div style="font-weight:700;margin-bottom:4px">This tab is running an old version (b'
    + state.running + '; b' + (Number(build) || 0) + ' is live)</div>'
    + '<p style="margin:0 0 9px">Reloading is what restores saving. Until you do, everything you have '
    + 'done stays <strong>on this device only</strong>.</p>'
    + '<button type="button" id="hr-authexp-reload" style="width:100%;font:600 14px/1 system-ui,sans-serif;'
    + 'background:var(--gold,#d9a441);color:#1a130a;border:0;border-radius:8px;padding:10px 14px;cursor:pointer">'
    + 'Reload to the current version</button>';

  // Above the sheet's own button row, so the sheet's structure is unchanged.
  const row = sheet.querySelector('#hr-authexp-signin');
  const anchor = row && row.parentNode ? row.parentNode : null;
  if (anchor && anchor.parentNode === sheet) sheet.insertBefore(block, anchor);
  else sheet.appendChild(block);

  const go = block.querySelector('#hr-authexp-reload');
  if (go) go.addEventListener('click', () => reloadNow());
  return true;
}

/**
 * THE ONLY reload in this module, and the only caller of it in either severity
 * is a click handler. `reloadHook` is a test seam (same shape as sync.js's
 * `__withConfig`): with it set, a reload REQUEST is observable without the
 * suite navigating away, which is what lets "nothing ever reloads without a
 * click" be an assertion rather than a comment.
 */
/**
 * THE UNPROMPTED RELOAD, for a tab two or more builds behind.
 *
 * Order is load-bearing and each step is best-effort:
 *   1. STAMP FIRST. The cooldown must be written before anything that can
 *      navigate, or a reload that happens faster than the write is unguarded.
 *   2. FLUSH THE RESIDUE with the exact forced-keepalive save `pagehide`
 *      already uses. This is the only thing a reload can lose now that
 *      progression is server-owned. We do not await it — keepalive is what
 *      makes it survive teardown, and a hung network must not pin the tab on
 *      the stale bundle forever.
 *   3. PURGE THE SHELL. A reload served the same old bundle out of the service
 *      worker's Cache Storage would come back equally stale — that IS the loop
 *      this function is accused of being. Same body as the boot kill-switch.
 */
export function autoReloadNow(build, now = Date.now()) {
  state.lastAutoReloadAt = Number(now) || Date.now();
  state.autoReloads++;
  writeAutoReloadStamp(state.lastAutoReloadAt);
  hideUpdateCard();
  try {
    const S = typeof window !== 'undefined' && window.HearthriseSync;
    if (S && typeof S.flush === 'function') S.flush();
    if (S && typeof S.snapshotIfDue === 'function') S.snapshotIfDue(true, true);
  } catch (e) {}
  try {
    console.warn('[build-watch] auto-reloading: this tab is b' + state.running
      + ' and b' + (Number(build) || 0) + ' is live');
  } catch (e) {}
  if (reloadHook) { try { reloadHook(); } catch (e) {} return; }
  const go = () => reloadNow();
  let pending = null;
  try {
    if (typeof caches !== 'undefined' && typeof navigator !== 'undefined' && navigator.serviceWorker) {
      pending = Promise.all([
        caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))),
        navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister()))),
      ]);
    }
  } catch (e) { pending = null; }
  if (pending && typeof pending.then === 'function') pending.then(go, go);
  else go();
}

let reloadHook = null;
export function reloadNow() {
  if (reloadHook) { try { reloadHook(); } catch (e) {} return; }
  try { location.reload(); } catch (e) {}
}

// ── Install ─────────────────────────────────────────────────────────────────

let timer = null;
export function startBuildWatch() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (timer) return true;
  // A tab that just loaded IS current by definition; the first poll is a whole
  // interval away rather than at boot.
  state.lastPollAt = Date.now();
  timer = setInterval(() => { tickBuildWatch('interval', Date.now()); }, TICK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tickBuildWatch('visible', Date.now());
  });
  return true;
}

if (typeof window !== 'undefined') {
  window.HearthriseBuildWatch = {
    // pure
    decideBuildUpdate, decideBuildPoll, parseDeployedBuild, nextPollBackoffMs,
    POLL_INTERVAL_MS, VISIBILITY_MIN_GAP_MS, FAIL_BACKOFF_BASE_MS, FAIL_BACKOFF_MAX_MS,
    MAX_BODY_BYTES, CARD_ID, ESCALATION_ID, BUILD_INFO_URL,
    AUTO_RELOAD_MIN_LAG, AUTO_RELOAD_COOLDOWN_MS, AUTO_RELOAD_KEY, defaultBusyProbe,
    // runtime
    startBuildWatch, tickBuildWatch, applyBuildInfoText, autoReloadNow,
    showUpdateCard, hideUpdateCard, escalateIntoAuthSheet,
    getState: () => ({ ...state }),
    /* Test seams. `__setState` restores exactly, and `__setAuthDeadProbe(null)`
       puts the real b331 reader back — the suite runs in a live game, so it
       must leave no latch behind. */
    __setState: (patch) => { Object.assign(state, patch || {}); return { ...state }; },
    __setReloadHook: (fn) => { reloadHook = typeof fn === 'function' ? fn : null; },
    __setAuthDeadProbe: (fn) => {
      authDeadProbe = typeof fn === 'function' ? fn : defaultAuthDeadProbe;
    },
    /* Auto-reload seams. `__setBusyProbe(null)` restores the real safe-moment reader;
       `__clearAutoReloadStamp()` drops the sessionStorage cooldown so the suite
       leaves a live tab exactly as it found it. */
    __setBusyProbe: (fn) => { busyProbe = typeof fn === 'function' ? fn : defaultBusyProbe; },
    __clearAutoReloadStamp: () => {
      state.lastAutoReloadAt = 0;
      try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(AUTO_RELOAD_KEY); } catch (e) {}
    },
  };
  startBuildWatch();
}
