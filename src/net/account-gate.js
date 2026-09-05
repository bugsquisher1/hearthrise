// ============================================================
// src/net/account-gate.js — THE ACCOUNT WALL
//
// Hearthrise is an online realm. Since the 2026-08-08 product ruling
// ("Accounts are REQUIRED — no account-less play") there is no anonymous
// entrance: a player who is not signed in meets a full-screen gate at the
// front door, and the game does not boot behind it.
//
// ── WHAT THIS IS, HONESTLY ──────────────────────────────────
// This is CLIENT-SIDE UX ENFORCEMENT, not a security boundary. The game is
// static hosting; anyone with devtools can delete the wall's DOM node and
// poke at a local save. That costs nothing, because the things that matter
// — the economy, the market, chat, clans, raids, leaderboards, unique names
// — are all server-authoritative and already refuse an unauthenticated
// caller. The wall's job is to make "an account" the shape of the product
// for every real player, not to stop an attacker. Do not describe it as a
// security control anywhere.
//
// ── WHAT IT DOES NOT DO ─────────────────────────────────────
// It does NOT remove local persistence. A signed-in account keeps its local
// save as the offline cache and the offline-progression bank — that is the
// whole reason an idle game can be played on a train. The wall is at the
// FRONT DOOR only: once a session has opened it, losing the network (or the
// access token) mid-play must never eject the player or discard progress.
// See promptReauth() — a lapsed session re-prompts beside a running game, it
// does not close the gate again.
//
// ── LOCAL SAVES ARE ADOPTED, NEVER DISCARDED ────────────────
// An existing beta player has a local-only save. Signing in for the first
// time must ADOPT it. This module's contribution to that promise is entirely
// negative — it touches no save key, and it hard-stops saveLocal() while the
// gate is closed (legacy.js), because behind the wall the engine has NOT
// loaded the player's save and `G` is still the factory default. One stray
// autosave in that state would erase a real player's beta save. The
// adoption itself is the pre-existing sync seam: after sign-in we reload,
// loadLocal() reads the untouched local save, and sync.js's first snapshot
// uploads it. auth.js `decideRestore()` owns the both-saves-exist conflict.
//
// ── THE HARNESS SEAM (TEST-ONLY) ────────────────────────────
// The 274-test smoke suite boots the real index.html with no account. A hard
// wall would break every one of them, so there is ONE deliberate bypass:
//
//     window.__HR_TEST_HARNESS__ === true   AND   a non-player origin
//
// Both halves are required. tests/run-smoke.mjs sets the flag via Playwright
// `addInitScript`, which runs before any page script — so it is a JS global,
// NOT a URL parameter: it cannot be typed into an address bar, bookmarked,
// linked to a friend, or arrived at by accident. And on the hosts real
// players actually use (PLAYER_HOSTS below) the flag is ignored outright and
// logged, so even a shipped-by-mistake assignment cannot open the wall in
// production. The suite asserts both halves (see smoke-test.js "b224").
// ============================================================
(function () {
  'use strict';

  // The origins real players load the game from. On any of these the harness
  // flag is INERT. Everything else (localhost, 127.0.0.1, file://, a preview
  // box, CI) is a development origin where the flag is honoured.
  var PLAYER_HOSTS = ['hearthrise.net', 'www.hearthrise.net', 'bugsquisher1.github.io'];

  var SESSION_KEY = 'hearthrise:supabaseSession';
  var SAVE_KEY    = 'hearthbound-save-v2';
  var WALL_ID     = 'hr-account-gate';
  var STYLE_ID    = 'hr-account-gate-style';

  // ════════════════════════════════════════════════════════════
  // 1 · PURE DECISION (no DOM, no I/O — the part the suite tests)
  // ════════════════════════════════════════════════════════════

  /** Is `host` one of the origins real players use? */
  function isPlayerOrigin(host) {
    return PLAYER_HOSTS.indexOf(String(host || '').toLowerCase()) !== -1;
  }

  /**
   * TEST-ONLY. True only for the smoke harness: the explicit global AND a
   * non-player origin. Never true for a real player on a real host.
   */
  function isHarnessContext(win, host) {
    win = win || window;
    host = host === undefined ? (location && location.hostname) : host;
    if (win.__HR_TEST_HARNESS__ !== true) return false;
    if (isPlayerOrigin(host)) {
      // Loud on purpose: the only way to reach this line in production is a
      // bug — the flag leaking into shipped code — and it must not be quiet.
      try { console.error('[account-gate] __HR_TEST_HARNESS__ is set on a player origin (' + host + ') and is being IGNORED.'); } catch (e) {}
      return false;
    }
    return true;
  }

  /**
   * Is this stored session worth opening the gate for? Deliberately generous
   * about EXPIRY: an expired access_token with a refresh_token is a session
   * supabase-js will silently renew, and walling a returning player while
   * their token refreshes would be the "hard eject" the ruling forbids. A
   * session with neither token is not a session.
   */
  function sessionIsUsable(sess) {
    if (!sess || typeof sess !== 'object') return false;
    if (typeof sess.refresh_token === 'string' && sess.refresh_token) return true;
    if (typeof sess.access_token !== 'string' || !sess.access_token) return false;
    var exp = Number(sess.expires_at || 0);
    if (!exp) return true;                       // no stated expiry — let auth.js arbitrate
    return exp * 1000 > Date.now();
  }

  /**
   * THE decision. Pure: hand it a context, get a verdict. Exported so the
   * guard test can assert the wall exists for a clean boot even though the
   * suite itself always runs with the harness flag on.
   * @returns {{open:boolean, reason:'harness'|'session'|'wall'}}
   */
  function decide(ctx) {
    ctx = ctx || {};
    if (ctx.harness === true) return { open: true, reason: 'harness' };
    if (sessionIsUsable(ctx.session)) return { open: true, reason: 'session' };
    return { open: false, reason: 'wall' };
  }

  // ════════════════════════════════════════════════════════════
  // 1b · THE DOOR'S RULES, AND THE URL WE ARRIVED ON
  // ════════════════════════════════════════════════════════════
  // src/net/signup-door.js is a classic script loaded immediately above this
  // one, so it is present by the time this line runs. Guarded anyway, with a
  // NULL-OBJECT rather than a crash: this file is the front door, and a missing
  // helper module must degrade to "the old wall" rather than to a blank screen.
  function door() { return window.HearthriseSignupDoor || null; }

  /* Read ONCE, at parse time, before anything else on the page can look.
     ARRIVAL decides what the wall paints on its very first frame (a player
     coming back from a confirmation email must never be shown a sign-in form),
     and the INVITE has to be lifted out of the URL and then removed from it —
     see stripInviteFromHref()'s note on Referer leakage. Captured into module
     state because the strip destroys the source a moment later. */
  var ARRIVAL = { kind: 'none' };
  var LINK_INVITE = { present: false, code: '', malformed: false };
  (function readUrlOnce() {
    var D = door();
    if (!D) return;
    try { ARRIVAL = D.classifyArrival(location) || ARRIVAL; } catch (e) {}
    try { LINK_INVITE = D.readInviteFromUrl(location) || LINK_INVITE; } catch (e) {}
    if (!LINK_INVITE.present) return;
    try {
      var clean = D.stripInviteFromHref(location.href);
      if (clean && clean !== location.href && window.history && window.history.replaceState) {
        window.history.replaceState(window.history.state, '', clean);
      }
    } catch (e) {}
  })();

  // ════════════════════════════════════════════════════════════
  // 2 · STATE
  // ════════════════════════════════════════════════════════════
  function storage() { return window.HearthriseStorage || null; }
  function readRaw(key) {
    try {
      var s = storage();
      return s ? s.get(key) : localStorage.getItem(key);
    } catch (e) { return null; }
  }
  function readCachedSession() {
    var raw = readRaw(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function hasLocalSave() {
    var raw = readRaw(SAVE_KEY);
    if (!raw || raw.length < 40) return false;
    try {
      var d = JSON.parse(raw);
      return !!(d && typeof d === 'object' && d.skills);
    } catch (e) { return false; }
  }

  var verdict = decide({ harness: isHarnessContext(window), session: readCachedSession() });
  var open = verdict.open;
  var reason = verdict.reason;
  var queue = [];

  function isOpen() { return open; }
  function openReason() { return reason; }

  /** Run `fn` now if the gate is open, else when it opens. */
  function whenOpen(fn) {
    if (typeof fn !== 'function') return;
    if (open) { fn(); return; }
    queue.push(fn);
  }

  function markOpen(why) {
    if (open) return;
    open = true;
    reason = why || 'session';
    try { document.documentElement.removeAttribute('data-hr-gate'); } catch (e) {}
    var q = queue; queue = [];
    for (var i = 0; i < q.length; i++) { try { q[i](); } catch (e) { try { console.warn('[account-gate] deferred boot failed', e); } catch (e2) {} } }
    try { window.dispatchEvent(new CustomEvent('hearthrise:gate-open', { detail: { reason: reason } })); } catch (e) {}
  }

  // ════════════════════════════════════════════════════════════
  // 3 · PRESENTATION
  // ════════════════════════════════════════════════════════════
  // Styles are injected here rather than added to one of the three shared
  // sheets, for the same reason identity.js does it: those sheets already
  // fight each other on specificity and a self-contained front door has no
  // business making that worse. Every colour is a theme token.
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      /* While the wall is up NOTHING else on the page is visible or reachable.
         Deliberately a blanket over every top-level child rather than a list of
         known ones (.app, .bottom-nav, .notifs, the floating bug button, the
         modals legacy.js ships): a list goes stale the first time somebody
         appends a new widget to <body>, and the failure mode is a stray control
         sitting on the game's first impression — or worse, invisible under the
         wall but still in the tab order. `visibility` rather than `display` so
         the shell keeps its layout and measures correctly the moment the gate
         opens. */
      'html[data-hr-gate="closed"] body{overflow:hidden}',
      'html[data-hr-gate="closed"] body > *:not(#hr-account-gate){visibility:hidden !important}',

      /* b361 — the front door is the dawn homestead, not a gradient.
         The painting is the one screen in the game where an illustration can
         carry the whole frame, so it does: `background-size:cover` on a fixed
         full-viewport box, focal point held slightly above centre so the lit
         valley and the smoking cottage survive a 16:9 crop.
         The gradient it replaces stays as the background-COLOR underneath, so
         a failed image request degrades to the b219 dusk rather than to white.
         Everything readable sits on the scrim in ::after, never on the paint. */
      '.hr-gate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;',
      '  justify-content:center;padding:28px 20px;overflow:auto;',
      '  background-color:var(--scene-sky-0,#0c0a08);',
      '  background-image:',
      '    radial-gradient(ellipse 72% 46% at 50% 0%,var(--scene-glow-2,rgba(206,116,50,.13)) 0%,var(--scene-glow-0,rgba(206,116,50,0)) 62%),',
      '    linear-gradient(180deg,var(--scene-sky-1,#16120e) 0%,var(--scene-sky-0,#0c0a08) 58%,var(--scene-ridge-near,#0b0806) 100%);',
      '  font-family:var(--f-ui,system-ui,sans-serif);color:var(--scene-ink,#f4ecda);',
      '  -webkit-font-smoothing:antialiased}',
      /* position:FIXED, not absolute, and this was a real defect before it was
         a decision. `.hr-gate` is `overflow:auto`, and on a landscape phone the
         form is taller than the viewport — an absolutely-positioned child
         resolves `inset:0` against the padding box, so the painting stayed
         423px tall while the content scrolled 900px past it and the lower half
         of the screen went flat black. Fixed pins both layers to the viewport,
         which is also the behaviour you want: the scene stays still and the
         panel travels over it. Seen at 922x423; invisible at 1440x900. */
      '.hr-gate::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;',
      '  background:url(assets/brand/hearthrise-splash.jpg?v=502) 50% 42%/cover no-repeat}',
      /* The scrim. --scene-scrim-* exist precisely for "keep UI legible on top
         of the picture" and are dark in BOTH themes, so this one rule holds on
         parchment too. Vignetted rather than flat: the lightest point sits
         under the lockup, which is where the painting's own sunrise is. */
      '.hr-gate::after{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;',
      '  background:radial-gradient(ellipse 118% 86% at 50% 34%,',
      '    var(--scene-scrim-1,rgba(9,7,5,.20)) 0%,var(--scene-scrim-2,rgba(9,7,5,.72)) 74%),',
      '    var(--scene-scrim-2,rgba(9,7,5,.72))}',

      '.hr-gate-col{position:relative;z-index:1;width:100%;max-width:404px;margin:auto;',
      '  display:flex;flex-direction:column;align-items:center}',

      /* ── crest above wordmark — the stacked lockup ── */
      /* No local halo behind the crest: a soft disc at this size reads as a
         rendering artefact, not as light. The painting is the light source. */
      '.hr-gate-mark{position:relative;display:flex;flex-direction:column;align-items:center;',
      '  gap:13px;margin-bottom:6px}',
      '.hr-gate-crest{display:block;width:auto;height:104px;',
      '  filter:drop-shadow(0 6px 14px rgba(0,0,0,.75))}',
      '.hr-gate-word{display:block;width:246px;max-width:100%;height:auto;',
      '  filter:drop-shadow(0 2px 5px rgba(0,0,0,.7))}',
      '.hr-gate-rule{width:112px;height:1px;margin:15px 0 11px;',
      '  background:linear-gradient(90deg,rgba(201,162,74,0),rgba(201,162,74,.62),rgba(201,162,74,0))}',
      /* b361: --scene-ink-*, not --ink-*. Everything from here to the panel sits
         ON the painting under a dark scrim, and --ink-3 is a cocoa brown in
         cozy-light — the exact theme leak this project keeps re-finding. The
         --scene-ink roles exist because their background is the scrim, not the
         theme surface, and they stay light in both. */
      '.hr-gate-tag{font-family:var(--f-label,inherit);font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.2em;',
      '  text-transform:uppercase;color:var(--scene-ink-3,#b0a186)}',

      /* ── the one contained object on the screen ── */
      /* The top edge is where the light lands: a gilt hairline, brighter than
         the other three, so the panel sits IN the scene instead of on it. */
      '.hr-gate-panel{position:relative;width:100%;margin-top:28px;padding:22px 22px 20px;',
      '  background:var(--bg-card,linear-gradient(180deg,#26201a,#1a1610));',
      '  border:1px solid var(--line,rgba(201,162,74,.20));',
      '  border-top-color:var(--line-strong,rgba(201,162,74,.42));border-radius:var(--r-lg,5px);',
      '  box-shadow:inset 0 1px 0 rgba(255,240,205,.10),0 30px 70px -26px rgba(0,0,0,.95)}',

      '.hr-gate-modes{display:flex;gap:24px;border-bottom:1px solid var(--line-soft,rgba(236,225,204,.055));',
      '  margin:-2px 0 18px}',
      '.hr-gate-mode{appearance:none;background:none;border:0;padding:0 0 11px;cursor:pointer;',
      '  font-family:var(--f-label,inherit);font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.15em;text-transform:uppercase;',
      '  color:var(--ink-3,#9d8b70);border-bottom:2px solid transparent;margin-bottom:-1px;',
      '  transition:color 120ms ease,border-color 120ms ease}',
      '.hr-gate-mode:hover{color:var(--ink-2,#c4b79e)}',
      '.hr-gate-mode[aria-selected="true"]{color:var(--gold-2,#e3c77e);border-bottom-color:var(--gold-2,#e3c77e)}',

      '.hr-gate-lead{font-size:calc(14.5px * var(--ui-scale, 1));line-height:1.55;color:var(--ink-2,#c4b79e);margin:0 0 16px}',
      '.hr-gate-lead a{color:var(--gold-2,#e3c77e);text-decoration:underline;text-underline-offset:2px}',

      /* b46x — OPEN BETA. The invite code stopped being the thing that decides
         whether an account may exist, so it stopped being a field and became a
         disclosure: one quiet line under the password, for the minority who
         still hold a code. Styled as a secondary link and nothing more — an
         optional control that looks like a required one is how a form teaches
         people they cannot sign up. */
      '.hr-gate-aside{margin:2px 0 4px;font-size:calc(14.5px * var(--ui-scale, 1));',
      '  line-height:1.5;color:var(--ink-3,#9d8b70)}',
      '.hr-gate-link{appearance:none;background:none;border:0;padding:2px 1px;cursor:pointer;',
      '  font:inherit;font-size:inherit;color:var(--ink-3,#9d8b70);text-decoration:underline;',
      '  text-underline-offset:2px;border-radius:var(--r,3px)}',
      '.hr-gate-link:hover{color:var(--gold-2,#e3c77e)}',
      '.hr-gate-link:focus-visible{outline:2px solid var(--gold,#c9a24a);outline-offset:2px}',

      '.hr-gate-field{display:block;margin-bottom:12px}',
      '.hr-gate-field span{display:block;font-family:var(--f-label,inherit);font-size:calc(14.5px * var(--ui-scale, 1));',
      '  letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3,#9d8b70);margin-bottom:5px}',
      '.hr-gate-field input{width:100%;box-sizing:border-box;padding:10px 12px;font:inherit;font-size:calc(16px * var(--ui-scale, 1));',
      '  color:var(--ink,#ece1cc);background:rgba(0,0,0,.30);border-radius:var(--r,3px);',
      '  border:1px solid var(--line,rgba(201,162,74,.20));transition:border-color 120ms ease}',
      '.hr-gate-field input:focus{outline:none;border-color:var(--gold,#c9a24a)}',
      '.hr-gate-field input:-webkit-autofill{-webkit-text-fill-color:var(--ink,#ece1cc);',
      '  -webkit-box-shadow:0 0 0 1000px #241e17 inset}',

      '.hr-gate-go{width:100%;margin-top:6px;min-height:42px;padding:0 18px;cursor:pointer;',
      // Longhands, not `font:` — the shorthand's size slot cannot carry the
      // --ui-scale calc. This is the wall's primary button; b225 already found
      // the wall carrying the smallest type in the game once.
      '  font-weight:700;font-size:calc(14.5px * var(--ui-scale, 1));line-height:1;',
      '  font-family:var(--f-ui,inherit);letter-spacing:.06em;',
      '  border:1px solid #e6cd93;border-radius:var(--r,3px);color:#221803;',
      '  background:linear-gradient(180deg,#d9b361 0%,#c09539 52%,#a67c28 100%);',
      '  box-shadow:inset 0 1px 0 rgba(255,246,220,.55),inset 0 -2px 3px rgba(90,60,8,.4),0 2px 5px -2px rgba(0,0,0,.7);',
      '  transition:background 120ms ease,transform 80ms ease}',
      '.hr-gate-go:hover:not(:disabled){background:linear-gradient(180deg,#eaca7d 0%,#d3ab4f 52%,#b98d33 100%)}',
      '.hr-gate-go:active:not(:disabled){transform:translateY(1px)}',
      '.hr-gate-go:disabled{opacity:.6;cursor:progress}',

      /* ── THE "CHECK YOUR EMAIL" STATE ──────────────────────────────────
         It replaces the form in place rather than opening a second sheet: the
         player has not left the door, they are one step further through it.
         Every colour is a token; the two controls are the two real recoveries
         (the mail did not arrive / the link signed me in somewhere else). */
      '.hr-gate-sent{display:none}',
      '.hr-gate-sent-title{margin:0 0 8px;font-family:var(--f-label,inherit);',
      '  font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.14em;text-transform:uppercase;',
      '  color:var(--gold-2,#e3c77e)}',
      '.hr-gate-sent-body{margin:0 0 10px;font-size:calc(14.5px * var(--ui-scale, 1));line-height:1.55;',
      '  color:var(--ink-2,#c4b79e);overflow-wrap:anywhere}',
      '.hr-gate-sent-hint{margin:0 0 14px;font-size:calc(14.5px * var(--ui-scale, 1));line-height:1.5;',
      '  color:var(--ink-3,#9d8b70)}',
      /* Wraps rather than shrinks: at 922x423 two buttons on one line push the
         labels below the type floor, and the door has been caught doing that
         once already (b225). */
      '.hr-gate-row{display:flex;flex-wrap:wrap;gap:10px;align-items:stretch}',
      '.hr-gate-row > *{flex:1 1 150px;margin-top:0}',
      '.hr-gate-second{min-height:42px;padding:0 16px;cursor:pointer;font-weight:600;',
      '  font-size:calc(14.5px * var(--ui-scale, 1));line-height:1;font-family:var(--f-ui,inherit);',
      '  letter-spacing:.04em;color:var(--ink,#ece1cc);background:rgba(0,0,0,.30);',
      '  border:1px solid var(--line,rgba(201,162,74,.20));border-radius:var(--r,3px);',
      '  transition:border-color 120ms ease,color 120ms ease}',
      '.hr-gate-second:hover:not(:disabled){border-color:var(--gold,#c9a24a);color:var(--gold-2,#e3c77e)}',
      '.hr-gate-second:disabled{opacity:.5;cursor:default}',
      '.hr-gate-note{min-height:18px;margin:11px 2px 0;font-size:calc(14.5px * var(--ui-scale, 1));line-height:1.45;text-align:center}',
      '.hr-gate-note[data-tone="bad"]{color:#d98b7a}',
      '.hr-gate-note[data-tone="ok"]{color:var(--gold-2,#e3c77e)}',
      '.hr-gate-note[data-tone="muted"]{color:var(--ink-3,#9d8b70)}',

      /* Also on the picture — see the note on .hr-gate-tag. */
      '.hr-gate-foot{margin-top:20px;font-size:calc(14.5px * var(--ui-scale, 1));line-height:1.6;text-align:center;',
      '  color:var(--scene-ink-3,#b0a186);max-width:330px;text-wrap:balance}',
      '.hr-gate-foot b{color:var(--scene-ink-2,#d8cbb1);font-weight:700}',
      '.hr-gate-help{margin-top:10px;font-size:calc(14.5px * var(--ui-scale, 1));text-align:center;color:var(--scene-ink-3,#b0a186)}',
      '.hr-gate-help a{color:var(--scene-gilt,#ecd7a0);text-decoration:underline;text-underline-offset:2px}',

      /* the lapsed-session re-prompt: same form, but a sheet beside a running
         game rather than a door in front of it */
      '.hr-gate.reauth{background:rgba(6,5,3,.72);backdrop-filter:blur(3px);align-items:center}',
      /* b361: BOTH pseudo-elements now paint the front door's scene, and the
         re-prompt is a sheet over a running game — it must show the game
         behind it, not the login painting. */
      '.hr-gate.reauth::before,.hr-gate.reauth::after{display:none}',
      '.hr-gate.reauth .hr-gate-mark{display:none}',
      '.hr-gate.reauth .hr-gate-col{max-width:392px}',
      '.hr-gate.reauth .hr-gate-panel{margin-top:0;background:var(--bg-3,#2a241c)}',
      '.hr-gate-later{display:block;margin:14px auto 0;background:none;border:0;padding:4px;',
      '  font:inherit;font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3,#9d8b70);text-decoration:underline;cursor:pointer}',
      '.hr-gate-later:hover{color:var(--gold-2,#e3c77e)}',

      /* Landscape phones (b310: scaled desktop, ~423px tall) — the lockup gives
         up height first, because the form is the only thing that must fit. */
      '@media (max-height:620px){.hr-gate{align-items:flex-start}',
      '  .hr-gate-crest{height:62px}.hr-gate-word{width:186px}',
      '  .hr-gate-mark{gap:9px}.hr-gate-panel{margin-top:18px}}',
      '@media (max-width:420px){.hr-gate{padding:20px 14px}.hr-gate-word{width:194px}}'
    ].join('');
    document.head.appendChild(s);
  }

  // b361: the hand-drawn stand-in crest is gone. The front door now wears the
  // same approved brand assets as the sidebar — crest above wordmark. Built as
  // <img> nodes rather than an innerHTML blob so there is no HTML string to
  // audit, and the wordmark carries the alt text (it IS the word "Hearthrise";
  // an empty alt there would leave a screen reader with only the dialog label).
  var BRAND = {
    crest: 'assets/brand/hearthrise-crest.png?v=502',
    word:  'assets/brand/hearthrise-wordmark.svg?v=502'
  };
  function brandImg(cls, src, alt, w, h) {
    var i = document.createElement('img');
    i.className = cls;
    i.src = src;
    i.alt = alt || '';
    if (!alt) i.setAttribute('aria-hidden', 'true');
    if (w) { i.width = w; i.height = h; }
    i.decoding = 'async';
    return i;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /**
   * Build the gate DOM. Detached — the caller mounts it. `opts.reauth` swaps
   * the front-door framing for the lapsed-session sheet.
   * Exposed for the suite so the wall's markup can be asserted without the
   * suite having to actually be walled out.
   */
  function buildGate(opts) {
    opts = opts || {};
    ensureStyle();
    var reauth = !!opts.reauth;

    var root = el('div', 'hr-gate' + (reauth ? ' reauth' : ''));
    if (!reauth) root.id = WALL_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', reauth ? 'Sign in again' : 'Sign in to Hearthrise');

    var col = el('div', 'hr-gate-col');
    root.appendChild(col);

    if (!reauth) {
      var mark = el('div', 'hr-gate-mark');
      mark.appendChild(brandImg('hr-gate-crest', BRAND.crest, '', 311, 384));
      mark.appendChild(brandImg('hr-gate-word', BRAND.word, 'Hearthrise'));
      col.appendChild(mark);
      col.appendChild(el('div', 'hr-gate-rule'));
      col.appendChild(el('div', 'hr-gate-tag', 'An online realm'));
    }

    var panel = el('div', 'hr-gate-panel');
    col.appendChild(panel);

    var form = document.createElement('form');
    form.setAttribute('novalidate', '');
    panel.appendChild(form);

    // ── mode switch ──
    var mode = reauth ? 'signin' : 'signup';
    var modes = el('div', 'hr-gate-modes');
    modes.setAttribute('role', 'tablist');
    var bCreate = el('button', 'hr-gate-mode', 'Create account');
    var bSignIn = el('button', 'hr-gate-mode', 'Sign in');
    [bCreate, bSignIn].forEach(function (b) { b.type = 'button'; b.setAttribute('role', 'tab'); });
    if (!reauth) modes.appendChild(bCreate);
    modes.appendChild(bSignIn);
    form.appendChild(modes);

    var lead = el('p', 'hr-gate-lead');
    form.appendChild(lead);

    /* ── THE STATE THAT REPLACED THE DEAD END ───────────────────────────────
       "Account created. Confirm the link in your email, then sign in." asked
       the player to leave the product, find it again, and authenticate a
       second time — and it was the LAST thing the client had to say to them.
       This is that moment rebuilt as a state with two exits, because there are
       exactly two ways it fails in the field:

         · the mail never arrives (spam, typo'd address, SMTP throughput on a
           signup wave)                                        → Resend
         · the link DID work, but somewhere this session cannot see — the game
           is played inside the itch.io iframe, whose storage is partitioned
           away from the top-level tab a mail client opens
                                                               → I've confirmed

       Both live inside the same panel the player is already looking at. The
       door never closes on them. */
    var sent = el('div', 'hr-gate-sent');
    var sentTitle = el('div', 'hr-gate-sent-title');
    var sentBody = el('p', 'hr-gate-sent-body');
    var sentHint = el('p', 'hr-gate-sent-hint');
    var sentRow = el('div', 'hr-gate-row');
    var resendBtn = el('button', 'hr-gate-second', 'Resend email');
    var confirmedBtn = el('button', 'hr-gate-go', 'I’ve confirmed');
    // ⚠ type=button on BOTH. Inside a <form> the default is submit, and a
    // "Resend" that silently re-ran the sign-up would create nothing and
    // report the account already exists.
    resendBtn.type = 'button';
    confirmedBtn.type = 'button';
    sentRow.appendChild(resendBtn);
    sentRow.appendChild(confirmedBtn);
    sent.appendChild(sentTitle);
    sent.appendChild(sentBody);
    sent.appendChild(sentHint);
    sent.appendChild(sentRow);
    /* ⚠ MOUNTED AFTER THE SUBMIT BUTTON, not here where it is built. It looks
       identical either way — on the sent stage every node above it is hidden,
       so it is the first thing on the panel regardless — but DOM ORDER decides
       what `querySelector('.hr-gate-go')` returns, and `confirmedBtn` wears the
       same primary-button class so it does not need a duplicate of forty lines
       of gradient CSS. Built here, appended below, so the wall's primary CTA is
       still the FIRST .hr-gate-go for anything that looks the obvious way:
       a reachability row, a visual-QA script, the next person. Measured: with
       it appended here, the CTA probe read a 0x0 rect and reported the button
       missing at every viewport. */

    function field(labelText, type, name, autocomplete) {
      var l = el('label', 'hr-gate-field');
      l.appendChild(el('span', null, labelText));
      var i = document.createElement('input');
      i.type = type; i.name = name; i.autocomplete = autocomplete;
      i.spellcheck = false;
      l.appendChild(i);
      form.appendChild(l);
      i.__row = l;                 // so paintMode can hide the whole row, label included
      return i;
    }
    var email = field('Email', 'email', 'email', 'email');
    var pass  = field('Password', 'password', 'password', 'current-password');

    /* ── THE INVITE CODE, AFTER THE OPEN-BETA SWITCH ──────────────────────
       It used to come FIRST, because it decided whether an account could exist
       at all. It no longer decides anything: the beta is OPEN, and a signup
       with no code is the normal case. So it is last, OPTIONAL, and collapsed.

       Collapsed rather than merely un-required, and that is the whole point of
       the change. A visible field labelled "Invite code" reads as a gate no
       matter what the label says next to it — the b457 form taught every
       visitor without a code that the door was shut, and most of them left
       rather than trying it. One quiet line below the password says the
       opposite: there is nothing to hold you up, and if you happen to have a
       code we will still honour it.

       It is NOT deleted. Codes already handed out must keep working, the
       server still consumes one when it is given, and this is the field that
       presents it. */
    var invite = reauth ? null : field('Invite code', 'text', 'invite', 'off');
    var inviteAside = null, inviteReveal = null;
    var inviteShown = false;
    if (invite) {
      /* ⚠ NEVER use a real code format as the example — the b457 placeholder
         'FRIEND-001' WAS a live unused invite (QA-caught within minutes of
         deploy): players could type the placeholder and get in. The example
         must be an unmistakably fake shape. */
      invite.placeholder = 'Your invite code';
      invite.autocapitalize = 'characters';
      invite.style.textTransform = 'uppercase';
      invite.style.letterSpacing = '1px';
      invite.id = 'hr-gate-invite-' + Math.random().toString(36).slice(2, 8);

      inviteAside = el('div', 'hr-gate-aside');
      inviteReveal = el('button', 'hr-gate-link', 'Have an invite code?');
      inviteReveal.type = 'button';
      // A real disclosure, not a div that happens to toggle: the control names
      // the region it opens, so a screen reader is told what appeared.
      inviteReveal.setAttribute('aria-expanded', 'false');
      inviteReveal.setAttribute('aria-controls', invite.id);
      inviteAside.appendChild(inviteReveal);
      form.appendChild(inviteAside);
      inviteReveal.addEventListener('click', function () {
        setInviteShown(true);
        try { invite.focus(); } catch (e) {}
      });
    }

    /* The field and its disclosure are two views of ONE state, painted in one
       place — and both are subordinate to the mode, because on Sign in neither
       belongs on the screen at all. (…and to the STAGE: once the account has
       been created there is nothing left for either of them to do.) */
    function setInviteShown(on) {
      inviteShown = !!on;
      if (!invite) return;
      var creating = mode === 'signup' && stage === 'form';
      invite.__row.style.display = (creating && inviteShown) ? '' : 'none';
      inviteAside.style.display = (creating && !inviteShown) ? '' : 'none';
      inviteReveal.setAttribute('aria-expanded', inviteShown ? 'true' : 'false');
    }

    /* ── THE OTHER DOOR A CONFIRMATION CAN NEED ─────────────────────────────
       A confirmation link is single-use and time-boxed; `otp_expired` is the
       most common auth error a real beta produces. The player who meets it
       lands in SIGN-IN mode holding an account that exists and cannot be
       used, and before this line there was nothing on the screen that could
       help them — the only resend in the product was on a panel they could no
       longer reach. Same cooldown, same implementation, one quiet line. */
    var resendAside = null, resendLink = null;
    if (!reauth) {
      resendAside = el('div', 'hr-gate-aside');
      resendLink = el('button', 'hr-gate-link', 'Didn’t get the confirmation email?');
      resendLink.type = 'button';
      resendAside.appendChild(resendLink);
      form.appendChild(resendAside);
    }

    var go = el('button', 'hr-gate-go');
    go.type = 'submit';
    form.appendChild(go);
    form.appendChild(sent);          // see the note where `sent` is built

    var note = el('div', 'hr-gate-note');
    note.setAttribute('data-tone', 'muted');
    form.appendChild(note);

    var later = null;
    if (reauth) {
      later = el('button', 'hr-gate-later', 'Keep playing offline for now');
      later.type = 'button';
      form.appendChild(later);
    }

    var foot = el('div', 'hr-gate-foot');
    col.appendChild(foot);

    /* ── THE THREE THINGS THIS PANEL CAN BE ─────────────────────────────────
         'form'     — ask for credentials (the only stage that existed before)
         'sent'     — the account exists; the confirmation is in flight
         'arriving' — the player came back on a confirmation link and
                      supabase-js is turning it into a session RIGHT NOW.
       'arriving' is not cosmetic. Without it a player who clicks the link in
       their email is shown a SIGN-IN FORM for the second or two before the
       session lands — i.e. the product's answer to "I just confirmed" is to
       ask them to log in, which is the dead end this build exists to remove,
       reproduced by a race instead of by copy. */
    var stage = 'form';

    function paintStage() {
      var isForm = stage === 'form';
      modes.style.display = isForm ? '' : 'none';
      email.__row.style.display = isForm ? '' : 'none';
      pass.__row.style.display = isForm ? '' : 'none';
      go.style.display = isForm ? '' : 'none';
      /* The lead is the FORM's sentence and the ARRIVING message; on the
         check-your-email stage the panel has its own title and body, and
         leaving the open-beta pitch above them reads as two screens at once. */
      lead.style.display = (stage === 'sent') ? 'none' : '';
      // The arriving message is the only thing on the panel; left-aligned it
      // reads as a paragraph with three missing siblings.
      lead.style.textAlign = (stage === 'arriving') ? 'center' : '';
      /* ⚠ 'block', NOT ''. `.hr-gate-sent` is `display:none` in the sheet, so
         `style.display = ''` means "use the stylesheet" — i.e. still hidden.
         Measured: the panel rendered completely EMPTY (title, body, resend and
         confirm buttons all invisible) while `sent.style.display !== 'none'`
         was true, so the guard passed and the screen was blank. The release
         visual gate is what caught it; a DOM assertion could not. */
      sent.style.display = (stage === 'sent') ? 'block' : 'none';
      if (later) later.style.display = isForm ? '' : 'none';
      setInviteShown(inviteShown);
      if (resendAside) resendAside.style.display = (isForm && mode === 'signin') ? '' : 'none';
    }

    function paintMode() {
      var creating = mode === 'signup';
      bCreate.setAttribute('aria-selected', creating ? 'true' : 'false');
      bSignIn.setAttribute('aria-selected', creating ? 'false' : 'true');
      pass.autocomplete = creating ? 'new-password' : 'current-password';
      go.textContent = creating ? 'Create account' : 'Sign in';
      setInviteShown(inviteShown);
      paintStage();
      if (stage !== 'form') return;      // the lead belongs to the stage, not the mode
      while (lead.firstChild) lead.removeChild(lead.firstChild);
      if (reauth) {
        lead.textContent = 'Your session ended. Sign in again to keep your progress syncing to the realm — ' +
          'nothing you have earned is lost either way.';
      } else if (creating) {
        /* THE OPEN-BETA LINE. It is built from nodes rather than assigned as a
           string because the last word is a LINK — "tell us in Discord" that
           you cannot click is an instruction with no door behind it, and this
           screen runs before anything else in the game has loaded, so it is
           the only door there is. */
        lead.appendChild(document.createTextNode(
          'Hearthrise is in open beta — make an account and play. It’s rough in places; tell us in '));
        lead.appendChild(discordLink('Discord'));
        lead.appendChild(document.createTextNode('.'));
      } else {
        lead.textContent = 'Welcome back. Sign in to pick up where the realm left you.';
      }
    }
    bCreate.addEventListener('click', function () { mode = 'signup'; paintMode(); note.textContent = ''; email.focus(); });
    bSignIn.addEventListener('click', function () { mode = 'signin'; paintMode(); note.textContent = ''; email.focus(); });
    paintMode();

    if (!reauth) {
      // The one promise a returning beta player needs to read before they type
      // anything: their save is being carried in, not replaced.
      while (foot.firstChild) foot.removeChild(foot.firstChild);
      if (hasLocalSave()) {
        var b = el('b', null, 'Played the beta on this device?');
        foot.appendChild(b);
        foot.appendChild(document.createTextNode(
          ' Sign in and the save already on this browser is carried into your account. Nothing is erased.'));
      } else {
        foot.textContent = 'Everything is saved to the cloud, so you can play on any ' +
          'device and pick up right where you left off.';
      }
      // b225 (Coordinator ruling): the bug-report button lives BEHIND the wall,
      // so a player who cannot sign in must still have a way to reach us.
      var help = el('div', 'hr-gate-help');
      help.appendChild(document.createTextNode('Trouble signing in? '));
      help.appendChild(discordLink('Join the Discord'));
      foot.parentNode.appendChild(help);
    }

    /** Move the panel to a stage and repaint everything that depends on it. */
    function setStage(next, opts) {
      opts = opts || {};
      stage = next;
      if (next === 'sent') {
        var D = door();
        var copy = (D && D.signupSentCopy)
          ? D.signupSentCopy({ email: opts.email, usedCode: opts.usedCode })
          /* The null-object copy. Deliberately still ACCURATE if the door
             module is missing — a fallback that reintroduced "then sign in"
             would put the dead end back on the one path nobody tests. */
          : { title: 'Check your email', body: 'We sent a confirmation link. Open it to finish creating your account.',
              hint: 'No email after a minute? Check spam, or resend it below.' };
        sentTitle.textContent = copy.title;
        sentBody.textContent = copy.body;
        sentHint.textContent = copy.hint;
      } else if (next === 'arriving') {
        while (lead.firstChild) lead.removeChild(lead.firstChild);
        lead.textContent = opts.message || 'Signing you in…';
      }
      paintMode();
    }

    return {
      root: root, form: form, email: email, pass: pass, go: go, note: note,
      later: later, foot: foot, invite: invite, lead: lead,
      inviteReveal: inviteReveal, inviteAside: inviteAside,
      // the sign-up door's controls, published for the guards and for wire()
      sent: sent, sentTitle: sentTitle, sentBody: sentBody, sentHint: sentHint,
      resendBtn: resendBtn, confirmedBtn: confirmedBtn,
      resendAside: resendAside, resendLink: resendLink,
      inviteShown: function () { return inviteShown; },
      getMode: function () { return mode; },
      setMode: function (m) { mode = (m === 'signin') ? 'signin' : 'signup'; paintMode(); },
      getStage: function () { return stage; },
      setStage: setStage,
      say: function (text, tone) { note.textContent = text || ''; note.setAttribute('data-tone', tone || 'muted'); },
      busy: function (on) {
        go.disabled = !!on; email.disabled = !!on; pass.disabled = !!on;
        if (invite) invite.disabled = !!on;
        // The stage-2 controls belong to the same busy state: a second press
        // while the first request is in flight is how a resend becomes two.
        confirmedBtn.disabled = !!on;
        if (on) resendBtn.disabled = true;
      }
    };
  }

  var DISCORD_INVITE = 'https://discord.gg/eJrUSUJM3M';
  /** The one place this URL is written on the front door. */
  function discordLink(text) {
    var a = el('a', null, text);
    a.href = DISCORD_INVITE;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  // ════════════════════════════════════════════════════════════
  // 4 · AUTH WIRING
  // ════════════════════════════════════════════════════════════
  function auth() { return window.HearthriseAuth || null; }
  function authReady() {
    var a = auth();
    return !!(a && typeof a.signIn === 'function' && typeof a.signUp === 'function');
  }
  function isSignedIn() {
    var a = auth();
    try { return !!(a && a.isSignedIn && a.isSignedIn()); } catch (e) { return false; }
  }
  /**
   * Has the auth layer finished booting — i.e. is there a live Supabase client
   * that has had its chance to restore or reject the cached session?
   *
   * This is what makes "you are signed out" a FINDING rather than a guess.
   * auth.js loads supabase-js from a CDN, so for the first second or several
   * of every page life `isSignedIn()` is false simply because nothing has
   * looked yet — and on a slow connection that is many seconds. Nagging a
   * player for a sign-in during that window would be the exact false alarm
   * this project keeps having to un-ship. Equally: if the client NEVER
   * arrives (CDN blocked, genuinely offline) there is nothing to sign in to,
   * and a prompt would be a dead end, so we stay quiet and let the honest
   * "Offline" pill and local play carry the session.
   */
  function authClientReady() {
    var a = auth();
    try { return !!(a && typeof a.getClient === 'function' && a.getClient()); } catch (e) { return false; }
  }

  /** Wait (briefly) for the auth layer, which is booted by an ESM module. */
  function whenAuthReady(ms) {
    return new Promise(function (resolve) {
      if (authReady()) { resolve(true); return; }
      var waited = 0;
      var iv = setInterval(function () {
        waited += 120;
        if (authReady()) { clearInterval(iv); resolve(true); }
        else if (waited >= (ms || 12000)) { clearInterval(iv); resolve(false); }
      }, 120);
    });
  }

  var ERR = {
    unavailable: 'The realm’s sign-in service could not be reached. Check your connection and reload.',
    email:       'Enter your email address.',
    password:    'Enter your password.',
    short:       'Passwords must be at least 6 characters.',
    inviteBad:   'That invite code cannot be used. Check it for typos, or ask in the Discord.',
    /* THE OPEN-BETA TRANSITION SENTENCE, and it is not decoration. The client
       goes codeless-optional the moment this build deploys; the server's signup
       gate comes off in a separate change. For the minutes between them, a
       codeless signup is REFUSED by a trigger that has no vocabulary for saying
       so — GoTrue returns a 500 and supabase-js says "Database error saving new
       user". Telling that player "that invite code cannot be used" when they
       never typed one would be the worst kind of wrong: it blames them for the
       thing we are in the middle of removing. */
    notOpenYet:  'Sign-ups are still switching over to open beta. Try again in a minute — or add an invite code if you have one.'
  };

  // ════════════════════════════════════════════════════════════
  // 4a · THE INVITE PRE-CHECK
  // ════════════════════════════════════════════════════════════
  // ⚠ THIS IS UX, NOT THE GATE. The gate is server-side and unconditional:
  // 2026-08-23-beta-invite-gate.sql attaches an AFTER INSERT trigger to
  // auth.users that consumes an unused code in the same transaction as the
  // account, plus a before-user-created auth hook. Deleting this function, or
  // POSTing straight at /auth/v1/signup, gets a 403 — that is the difference
  // between this and what shipped before, where the equivalent check WAS the
  // only gate and five of eight live accounts had walked past it.
  // What it buys is that a player learns their code is wrong BEFORE they type
  // an email and a password.
  //
  // It lives here rather than in settings-page.js (which used to own it) for one
  // reason: this is the front door. It has to work when nothing else has loaded.
  // settings-page.js now delegates to the object published below, so there is
  // one implementation, not two — the b332 shape this project keeps re-finding.
  //
  // NEVER read the beta_invites table directly (b329/A11): its SELECT policy was
  // world-readable to the anon key, so one request returned every code in the
  // beta. beta_invite_check() is SECURITY DEFINER, rate-gated, and answers only
  // about the ONE code it was handed. Keep the code in the POST BODY — a GET
  // would put it in proxy and server access logs.
  function validateInvite(code) {
    var cfg = cloudConfig();
    // Not a refusal — we could not ASK. Before this carried the transport
    // marker it classified as the generic "cannot be used right now", i.e. the
    // player was told their code was bad because OUR module had not booted yet.
    if (!cfg) return Promise.resolve(UNREACHABLE('Could not check that code — try again in a moment.'));
    return fetch(cfg.url + '/rest/v1/rpc/beta_invite_check', {
      method: 'POST',
      headers: {
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + cfg.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_code: code })
    }).then(function (res) {
      if (!res.ok) return UNREACHABLE('Could not check that code — try again in a moment.');
      return res.json();
    }).then(function (out) {
      if (!out || typeof out !== 'object') return UNREACHABLE('Could not check that code — try again in a moment.');
      if (out.ok) return { ok: true };
      /* THE SERVER'S OWN ANSWER, PASSED THROUGH INTACT — including
         `reason_code` if it is ever added (an additive, rules-unchanged server
         change; see docs/design/signup-door-config-gates.md). The classifier in
         signup-door.js prefers a machine code and falls back to the prose, so
         the day the column lands the client is already reading it. Flattening
         this to one sentence here is exactly what made all thirteen beta-2
         `refused_unknown` look identical to a used code. */
      return { ok: false, reason: out.reason || ERR.inviteBad, reason_code: out.reason_code || out.code || '' };
    }).catch(function () {
      return UNREACHABLE('Network error — check your connection.');
    });
  }

  /* "We could not ASK" is a different answer from "the server said no", and
     conflating them tells a player with flaky wifi that their code is bad. */
  function UNREACHABLE(reason) { return { ok: false, transport: 'unreachable', reason: reason }; }

  function cloudConfig() {
    var S = window.HearthriseSupabase;
    try { return (S && typeof S.getConfig === 'function' && S.getConfig()) || null; } catch (e) { return null; }
  }

  /** Resolve once the cloud credentials exist (a deferred module publishes
      them), or after `ms` — never hang the door on a module that never came. */
  function whenCloudConfigured(ms) {
    return new Promise(function (resolve) {
      if (cloudConfig()) { resolve(true); return; }
      var waited = 0;
      var iv = setInterval(function () {
        waited += 120;
        if (cloudConfig()) { clearInterval(iv); resolve(true); }
        else if (waited >= (ms || 12000)) { clearInterval(iv); resolve(false); }
      }, 120);
    });
  }

  /**
   * The one place a refusal becomes a sentence. Delegates to the door's pure
   * classifier so the vocabulary (unknown / used / expired / throttled / blank
   * / unreachable) is testable without a browser, and degrades to the server's
   * own words if that module is missing — never to a made-up cause.
   */
  function inviteRefusalMessage(res) {
    var D = door();
    if (D && typeof D.classifyInviteRefusal === 'function') {
      try { return D.classifyInviteRefusal(res).message; } catch (e) {}
    }
    return (res && res.reason) || ERR.inviteBad;
  }
  window.HearthriseInvite = { validate: validateInvite };

  /**
   * Turn whatever the auth layer threw into something a player can act on.
   *
   * Two server refusal shapes, both real and both observed against production
   * on 2026-08-23:
   *   · the auth HOOK refuses with HTTP 403 and our own sentence — that arrives
   *     as error.message and is already the right thing to show.
   *   · the TRIGGER refuses with HTTP 500 (GoTrue has no vocabulary for "a
   *     trigger said no"), and supabase-js may surface either our message or its
   *     own "Database error saving new user". The second is meaningless to a
   *     player, so it is translated. Matching on the STRING is admittedly
   *     brittle; it is a fallback behind a path that should not normally be
   *     reached (the hook refuses first), and the honest alternative — showing
   *     the raw text — is worse.
   *
   * `hadCode` is what makes the translation honest after the open-beta switch.
   * The SAME opaque 500 now has two completely different causes — a bad code
   * that was presented, or a codeless signup meeting a server gate that has not
   * come off yet — and the client is the only party that knows which. Blaming a
   * code the player never typed is a lie the server cannot correct.
   */
  function humaniseAuthError(err, creating, hadCode) {
    var msg = (err && err.message) ? String(err.message) : '';
    if (!msg) return 'That did not work — try again.';
    if (!creating) return msg;
    if (/database error|unexpected_failure|saving new user/i.test(msg)) {
      return hadCode
        ? ERR.inviteBad + ' If it is definitely right, tell us in the Discord.'
        : ERR.notOpenYet;
    }
    return msg;
  }

  function wire(ui, opts) {
    opts = opts || {};
    var working = false;

    // ── THE RESEND, and the two rules that make it honest ────────────────
    // 1. ONE cooldown for the whole panel. The "check your email" button and
    //    the sign-in-mode link are two views of the same allowance, because
    //    the SERVER's allowance is per-address, not per-button. Two independent
    //    timers would let a player spend the budget twice and read the second
    //    press as a failure of the product.
    // 2. `resendOutcome()` decides the words, from the ENVELOPE. supabase-js
    //    resolves `auth.resend()` with `{data, error}` even when nothing was
    //    sent, so "the promise resolved" is not evidence of anything.
    var resendLastAt = null;
    var resendInFlight = false;
    var resendTimer = null;

    function resendState(now) {
      var D = door();
      var s = { now: (typeof now === 'number' ? now : Date.now()),
                lastSentAt: resendLastAt, inFlight: resendInFlight };
      if (D && typeof D.resendDecision === 'function') return D.resendDecision(s);
      return { allowed: !resendInFlight, reason: resendInFlight ? 'inflight' : 'ready', waitMs: 0 };
    }

    function paintResend() {
      var d = resendState();
      var D = door();
      ui.resendBtn.disabled = working || !d.allowed;
      ui.resendBtn.textContent = (D && D.resendLabel) ? D.resendLabel(d) : 'Resend email';
      if (ui.resendLink) ui.resendLink.disabled = working || resendInFlight;
      // Tick only while a cooldown is actually running: a permanent 1 Hz timer
      // on the front door would outlive the wall it belongs to.
      if (resendTimer) { clearTimeout(resendTimer); resendTimer = null; }
      if (d.reason === 'cooldown') resendTimer = setTimeout(paintResend, 500);
    }
    ui.__paintResend = paintResend;      // so busy(false) callers can re-arm it
    paintResend();

    function doResend(addr) {
      addr = String(addr || '').trim();
      if (!addr) { ui.say(ERR.email, 'bad'); try { ui.email.focus(); } catch (e) {} return; }
      var d = resendState();
      if (!d.allowed) {
        ui.say(d.reason === 'inflight'
          ? 'Still sending — give it a moment.'
          : 'Just sent one — you can ask again in ' + Math.max(1, Math.ceil(d.waitMs / 1000)) + 's.', 'muted');
        return;
      }
      resendInFlight = true;
      paintResend();
      ui.say('Sending…', 'muted');
      whenAuthReady().then(function (ok) {
        if (!ok) throw new Error(ERR.unavailable);
        var a = auth();
        if (!a || typeof a.resendSignupEmail !== 'function') throw new Error(ERR.unavailable);
        return a.resendSignupEmail(addr);
      }).then(function (res) {
        var D = door();
        var out = (D && D.resendOutcome) ? D.resendOutcome(res)
          : (res && res.error ? { ok: false, kind: 'failed', tone: 'bad', message: 'That did not send. Try again in a moment.' }
                              : { ok: true, kind: 'sent', tone: 'ok', message: 'Sent. Check your email.' });
        resendInFlight = false;
        /* ⚠ THE COOLDOWN STARTS ONLY ON A REAL SEND. Stamping it on every
           attempt would punish a player for OUR failure: a network error would
           lock the recovery control for a minute for no reason. */
        if (out.kind === 'sent') resendLastAt = Date.now();
        ui.say(out.message, out.tone);
        paintResend();
      }).catch(function (err) {
        resendInFlight = false;
        paintResend();
        ui.say((err && err.message) || 'That did not send. Try again in a moment.', 'bad');
      });
    }

    ui.resendBtn.addEventListener('click', function () { doResend(ui.email.value); });
    if (ui.resendLink) ui.resendLink.addEventListener('click', function () { doResend(ui.email.value); });

    /* ── "I'VE CONFIRMED" ────────────────────────────────────────────────
       The half of the funnel `emailRedirectTo` structurally cannot reach. The
       game is played inside the itch.io iframe, whose storage is partitioned
       under the itch top-level site; a mail client opens the confirm link in a
       normal top-level tab, so the session it establishes is in a DIFFERENT
       bucket and this document will never see it. For that player the link
       worked perfectly and the game still shows a wall. This button is their
       door: the credentials they typed are still in the (hidden) fields, so
       one press turns a confirmed account into a session HERE. */
    ui.confirmedBtn.addEventListener('click', function () {
      if (working) return;
      var addr = ui.email.value.trim();
      var pw = ui.pass.value;
      if (!addr || !pw) { ui.say('Enter the email and password you signed up with.', 'bad'); return; }
      working = true; ui.busy(true); ui.say('Checking…', 'muted');
      whenAuthReady().then(function (ok) {
        if (!ok) throw new Error(ERR.unavailable);
        return auth().signIn(addr, pw);
      }).then(function () {
        ui.say('Entering the realm…', 'ok');
        if (typeof opts.onSuccess === 'function') opts.onSuccess();
      }).catch(function (err) {
        working = false; ui.busy(false); paintResend();
        var D = door();
        var out = (D && D.confirmRetryOutcome) ? D.confirmRetryOutcome(err)
          : { message: (err && err.message) || 'That did not work — try again.', tone: 'bad' };
        ui.say(out.message, out.tone);
      });
    });

    ui.form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (working) return;
      var creating = ui.getMode() === 'signup';
      var addr = ui.email.value.trim();
      var pw = ui.pass.value;
      // Uppercased and trimmed here AND normalised again server-side. The client
      // copy is so the player sees the canonical form; the server one is because
      // the client's is not evidence of anything.
      var code = (creating && ui.invite) ? ui.invite.value.trim().toUpperCase() : '';
      if (!addr) { ui.say(ERR.email, 'bad'); ui.email.focus(); return; }
      if (!pw) { ui.say(ERR.password, 'bad'); ui.pass.focus(); return; }
      if (creating && pw.length < 6) { ui.say(ERR.short, 'bad'); ui.pass.focus(); return; }

      working = true;
      ui.busy(true);
      ui.say(!creating ? 'Signing in…' : (code ? 'Checking your invite code…' : 'Creating your account…'), 'muted');

      whenAuthReady().then(function (ok) {
        if (!ok) throw new Error(ERR.unavailable);
        var a = auth();
        if (!creating) return a.signIn(addr, pw);
        /* The pre-check runs only when a code was actually presented. Calling it
           with '' after the open-beta switch would be worse than pointless: the
           RPC would refuse the empty string, and the normal signup — the one
           that is now the whole product — would die on a check for a thing it
           deliberately does not have. No code, nothing to check. */
        var checked = code
          ? validateInvite(code).then(function (res) {
              if (!res.ok) {
                /* NAMES THE CAUSE. beta-2 logged 13 `refused_unknown` against
                   5 redeemed — roughly three refusals per success — and every
                   one of them showed the player the same undifferentiated
                   sentence, so "you typed it wrong", "this code is spent" and
                   "we could not reach the server" were indistinguishable
                   despite having three different next actions. */
                var e = new Error(inviteRefusalMessage(res));
                e.__invite = true;                  // already a player-facing sentence
                throw e;
              }
            })
          : Promise.resolve();
        return checked.then(function () {
          ui.say('Creating your account…', 'muted');
          /* THE SIGNUP PAYLOAD, and the shape matters to the server.
             With a code:    signUp(email, pw, {invite_code: 'ABC-123'})
                             → GoTrue POST /auth/v1/signup {email, password,
                               data:{invite_code:'ABC-123'}} → the trigger reads
                               raw_user_meta_data->>'invite_code' and consumes it.
             Without a code: signUp(email, pw, null)
                             → auth.js takes its no-metadata branch, so the body
                               is {email, password} with NO `data` key at all and
                               raw_user_meta_data->>'invite_code' is SQL NULL.
             `null` rather than `{}` or `{invite_code:''}` on purpose: absent and
             empty-string are different values to the gate, and "the player gave
             us nothing" should reach the server as nothing. */
          return a.signUp(addr, pw, code ? { invite_code: code } : null);
        });
      }).then(function (data) {
        /* Sign-up with email confirmation on returns NO session, and this is
           the moment the beta-2 funnel died. It used to say "Confirm the link
           in your email, then sign in." — the product's last words to a new
           player being an instruction to leave, find us again, and
           authenticate a second time.
           It is a STAGE now, not a sentence: the door stays open on the
           check-your-email panel, which carries the resend and the
           confirmed-and-still-walled recovery. See buildGate()'s note. */
        if (creating && data && !data.session) {
          working = false; ui.busy(false);
          ui.setStage('sent', { email: addr, usedCode: !!code });
          paintResend();
          ui.say('', 'muted');
          return;
        }
        ui.say('Entering the realm…', 'ok');
        if (typeof opts.onSuccess === 'function') opts.onSuccess();
      }).catch(function (err) {
        working = false; ui.busy(false); paintResend();
        if (err && err.__invite) {
          ui.say(err.message, 'bad');
          if (ui.invite) { try { ui.invite.focus(); ui.invite.select(); } catch (e) {} }
          return;
        }
        ui.say(humaniseAuthError(err, creating, !!code), 'bad');
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  // 5 · THE WALL
  // ════════════════════════════════════════════════════════════
  /**
   * Resolve once the signed-in session is actually IN STORAGE — i.e. once the
   * next boot is guaranteed to find it.
   *
   * b226: this used to be a flat 220ms guess. auth.js persists the session
   * from its onAuthStateChange handler, which supabase-js normally fires
   * inside the sign-in call, so 220ms was usually enough — but "usually" here
   * means the reloaded page meets the WALL AGAIN and the player is asked to
   * sign in twice. Waiting for the fact instead of for a duration is both
   * faster in the common case (it resolves on the first poll, ~0ms) and
   * correct in the slow one. Exported so the suite can assert the handoff
   * without a real Supabase.
   */
  function whenSessionPersisted(ms, stepMs) {
    return new Promise(function (resolve) {
      var waited = 0, step = stepMs || 40, limit = ms == null ? 3000 : ms;
      function check() {
        if (sessionIsUsable(readCachedSession())) { resolve(true); return; }
        if (waited >= limit) { resolve(false); return; }
        waited += step;
        setTimeout(check, step);
      }
      check();
    });
  }

  /* ── ARRIVING FROM THE CONFIRMATION EMAIL ────────────────────────────────
     The player clicked the link, GoTrue bounced them back here with
     `#access_token=…`, and supabase-js is about to turn that into a session.
     The wall is a CLASSIC script and runs at parse time; auth.js is a deferred
     module and constructs the client afterwards — so for the first second or
     several of that page life `isSignedIn()` is false for the boring reason
     that nothing has looked yet. The generic 2 s watcher below would eventually
     unmount the wall, but "eventually" here means the player is shown a SIGN-IN
     FORM immediately after confirming, which is the dead end reappearing as a
     race. So: hold the form, say what is happening, and poll fast.

     THE FALLBACK IS HONEST. If the session never lands (a blocked network, a
     link that GoTrue accepted but the library could not consume) we do not sit
     on a spinner forever — we show the form and say so. */
  var ARRIVAL_SETTLE_MS = 20000;
  var ARRIVAL_POLL_MS = 250;

  /* `arrival` is an OVERRIDE, defaulting to what the wall read out of the real
     URL at parse time. A guard cannot navigate the suite's page to a
     confirmation link (that would sign the harness out of its own document), so
     the alternative to this parameter is a test that re-implements the branch
     it is grading. Production passes nothing. */
  function applyArrival(ui, arrival) {
    var D = door();
    if (!D) return;
    var A = arrival || ARRIVAL;
    if (A.kind === 'error') {
      ui.setMode('signin');
      ui.say(D.arrivalErrorMessage(A), 'bad');
      return;
    }
    if (!D.arrivalIsPending(A)) return;
    ui.setStage('arriving', { message: 'Confirming your account and signing you in…' });
    var waited = 0;
    (function poll() {
      if (open) return;                                  // already let in
      if (isSignedIn()) { unmountWall(); markOpen('session'); return; }
      waited += ARRIVAL_POLL_MS;
      if (waited >= ARRIVAL_SETTLE_MS) {
        ui.setStage('form');
        ui.setMode('signin');
        ui.say('Your email is confirmed, but we could not open the session automatically. '
             + 'Sign in below and you are through.', 'bad');
        try { ui.email.focus(); } catch (e) {}
        return;
      }
      setTimeout(poll, ARRIVAL_POLL_MS);
    })();
  }

  /* ── AN INVITE THAT ARRIVED AS A LINK ────────────────────────────────────
     Hand-typing a code is a transcription task with a measured ~3:1 failure
     rate in beta-2 (13 `refused_unknown` against 5 redeemed). A link removes
     the transcription: the field is revealed, filled with the canonical form,
     and CHECKED before the player has typed an email — so a dud code is known
     at the door rather than after they have invested a password.

     Hand entry stays exactly as it was. This adds a path; it removes none. */
  function applyLinkInvite(ui, link) {
    var L = link || LINK_INVITE;                         // override: see applyArrival
    if (!L.present || !ui.invite) return;
    if (ui.getStage() !== 'form') return;                // mid sign-in; not now
    ui.setMode('signup');
    ui.inviteReveal.click();                             // one place owns the reveal
    if (L.malformed) {
      ui.say('That invite link did not carry a usable code. Type it in below, or ask in the Discord.', 'bad');
      return;
    }
    ui.invite.value = L.code;
    ui.say('Checking your invite code…', 'muted');
    /* ⚠ WAIT FOR THE CLOUD FIRST, and this is not defensive padding — it was a
       real defect, found by loading a real ?invite= link rather than by driving
       the function. This wall is a CLASSIC script and mounts at parse time;
       `window.HearthriseSupabase` is published by a DEFERRED module. So the
       pre-check fired before the config existed, could not build a request, and
       every linked code — including a perfectly good one — was refused at the
       door. The hand-typed path never showed it because `wire()` already goes
       through `whenAuthReady()` before it validates. */
    return whenCloudConfigured().then(function () {
      return validateInvite(L.code);
    }).then(function (res) {
      if (res && res.ok) {
        ui.say('Invite code accepted — fill in your email and password to claim it.', 'ok');
        try { ui.email.focus(); } catch (e) {}
        return;
      }
      ui.say(inviteRefusalMessage(res), 'bad');
    });
  }

  function mountWall() {
    if (document.getElementById(WALL_ID)) return;
    var ui = buildGate({});
    wire(ui, {
      onSuccess: function () {
        // A RELOAD, not an in-place hand-off. Behind the wall the engine never
        // booted: legacy.js's boot() (loadLocal → processOffline → the tick
        // resumes) is deferred, and dozens of modules have already taken their
        // one shot at DOMContentLoaded. Resuming that half-built page in place
        // would be a bug farm, and the thing at stake is the player's save.
        // One clean boot with a live session runs the ORIGINAL, well-tested
        // order — loadLocal reads the untouched local save, sync.js adopts it,
        // then name-claim and FTUE take their turns.
        //
        // ONE reload, and the boot on the far side of it must not show this
        // wall again: that is the whole reason we wait for the session to be
        // on disk rather than for a stopwatch. If it somehow never lands we
        // still reload — supabase-js persists its own copy, so auth.js
        // restores and the watcher below opens the gate a beat later — but we
        // say so in the console rather than pretending it went to plan.
        whenSessionPersisted().then(function (ok) {
          if (!ok) { try { console.warn('[account-gate] signed in, but no cached session was written before reload'); } catch (e) {} }
          try { location.reload(); } catch (e) {}
        });
      }
    });
    document.body.appendChild(ui.root);
    applyArrival(ui);
    applyLinkInvite(ui);
    // Don't steal focus from a panel that is not asking for anything.
    if (ui.getStage() === 'form') setTimeout(function () { try { ui.email.focus(); } catch (e) {} }, 60);
  }

  function unmountWall() {
    var w = document.getElementById(WALL_ID);
    if (w && w.parentNode) w.parentNode.removeChild(w);
  }

  // ════════════════════════════════════════════════════════════
  // 6 · THE LAPSED SESSION (in-session, never an eject)
  // ════════════════════════════════════════════════════════════
  // The front-door overlays a re-prompt must never land on top of. Same list
  // the b221/b223 modal-precedence work settled on — this sheet joins that
  // queue rather than jumping it, because a lapsed token is never more urgent
  // than the tutorial the player is in the middle of.
  var BLOCKING = '.ftue-root .ftue-card.show, .hr-id-scrim, .hr-dl-scrim, ' +
                 '#beta-banner-overlay, #hr-welcome-modal, #hr-post-signup-modal';

  var reauthUp = false;
  function promptReauth() {
    if (reauthUp || !open) return null;
    if (document.querySelector('.hr-gate.reauth')) return null;
    if (document.querySelector(BLOCKING)) return null;   // wait our turn
    reauthUp = true;
    var ui = buildGate({ reauth: true });
    function close() { reauthUp = false; if (ui.root.parentNode) ui.root.parentNode.removeChild(ui.root); }
    wire(ui, { onSuccess: function () { setTimeout(close, 400); } });
    ui.later.addEventListener('click', function () {
      close();
      try {
        if (typeof window.notify === 'function') {
          /* b465: "your progress is kept on this device and will sync when you
             sign in" is not true of a server-authoritative, online-only game —
             the server owns every progression number and nothing accrues while
             signed out. Promising a sync that will not happen is how a player
             discovers the truth by losing an evening. */
          window.notify('Signed out — nothing you do now is saved. Sign back in to keep playing.', 'info');
        }
      } catch (e) {}
    });
    document.body.appendChild(ui.root);
    return ui.root;
  }

  // ════════════════════════════════════════════════════════════
  // 6b · whenSignedIn — "there is a token to sign this with" (b349)
  // ════════════════════════════════════════════════════════════
  // whenOpen() answers "may the game run", which the harness and a CACHED
  // session both satisfy. That is not the same question as "is there a live
  // access token", and conflating the two cost 3,196 refused database calls a
  // day: muster.js fired its clock sync 420ms after DOMContentLoaded, auth.js
  // could not publish a session until a CDN import() of supabase-js resolved
  // (measured 94–1,040ms later, every run), and the fallback in every
  // transport helper in this repo —
  //
  //     'Authorization': 'Bearer ' + ((s && s.access_token) || c.anonKey)
  //
  // — quietly downgraded the call to anonymous instead of not making it. The
  // server refused it with 42501 and nothing anywhere said so.
  //
  // ── WHY THIS MODULE OWNS IT ─────────────────────────────────
  // Because it already owns the hard half. authClientReady() exists here, with
  // a paragraph of reasoning, precisely because "isSignedIn() is false" means
  // two completely different things depending on whether auth has finished
  // looking — and the lapse watcher below already runs on that distinction.
  // A second module re-deriving it would be the b332 shape: one predicate,
  // several copies, one of them subtly wrong.
  //
  // ── THE CONTRACT ────────────────────────────────────────────
  //   • signed in now            → run immediately (synchronously)
  //   • not signed in yet        → hold, run on the first live session
  //   • signed out, and auth has  → HOLD FOREVER. Never run. A 42501 is
  //     finished looking            "you are not signed in", which is an
  //                                 ANSWER, not a failure to retry.
  //   • signs in later (the       → runs then. The realm came back; the
  //     reauth sheet, another        deferred work is still worth doing.
  //     tab, a token refresh)
  //
  // It is therefore NOT a promise: a promise must settle, and the honest
  // answer here is often "never". A callback that is simply never invoked is
  // the shape that cannot be accidentally awaited into a call that goes out
  // anyway.
  var signedInQueue = [];   // [{ fn, label }]

  /**
   * Run everything that has been waiting for a session. With `onlyLabel`, run
   * just that one and leave the rest queued — which is how the guard exercises
   * its own deferral without consuming the boot-path deferral it also has to
   * be able to see.
   */
  function drainSignedIn(onlyLabel) {
    if (!signedInQueue.length) return 0;
    /* The invariant lives HERE, not in the one caller that currently honours
       it. The watcher below already checks `signed` before calling — but a
       rule that is true only because its single call site remembers is the
       b347 shape, and the next caller will not remember. Asking is free. */
    if (!isSignedIn()) return 0;
    var run = [], keep = [], i;
    for (i = 0; i < signedInQueue.length; i++) {
      if (onlyLabel == null || signedInQueue[i].label === onlyLabel) run.push(signedInQueue[i]);
      else keep.push(signedInQueue[i]);
    }
    signedInQueue = keep;
    for (i = 0; i < run.length; i++) {
      try { run[i].fn(); }
      catch (e) { try { console.warn('[account-gate] deferred signed-in work failed (' + run[i].label + ')', e); } catch (e2) {} }
    }
    return run.length;
  }

  /**
   * Run `fn` once, as soon as there is a live session. Never without one.
   * `label` names the work, so "what is currently blocked on sign-in?" is a
   * question with an answer — in the console, and in the guard that has to be
   * able to tell one caller's deferral from another's.
   */
  function whenSignedIn(fn, label) {
    if (typeof fn !== 'function') return;
    if (isSignedIn()) { try { fn(); } catch (e) { try { console.warn('[account-gate] signed-in work failed', e); } catch (e2) {} } return; }
    signedInQueue.push({ fn: fn, label: String(label || 'anonymous') });
  }

  // ════════════════════════════════════════════════════════════
  // 7 · BOOT
  // ════════════════════════════════════════════════════════════
  if (!open) {
    try { document.documentElement.setAttribute('data-hr-gate', 'closed'); } catch (e) {}
    ensureStyle();
    if (document.body) mountWall();
    else document.addEventListener('DOMContentLoaded', mountWall);
  }

  // One watcher covers both directions:
  //   • closed → a session appeared (another tab signed in, or auth.js
  //              restored one after the wall had already gone up)
  //   • open   → we are CONFIRMED signed out mid-play: re-prompt, never eject
  //
  // The gate opens optimistically on a cached session rather than blocking the
  // front door on a network round-trip — an honest trade, because a token this
  // client cannot validate is a token the SERVER will refuse for everything
  // that matters. When supabase-js then rejects it, the player is already in a
  // running game, and this is the path that tells them, without taking the
  // game away.
  var promptedForLapse = false;
  setInterval(function () {
    var signed = isSignedIn();
    if (!open) {
      if (signed) { unmountWall(); markOpen('session'); }
      else return;                                      // still walled — nothing to drain
    }
    // b349: the whenSignedIn() queue drains HERE — one timer, not two, and
    // strictly after markOpen(), so deferred work can never run behind the wall.
    if (signed) { drainSignedIn(); promptedForLapse = false; return; }   // re-arm for the NEXT lapse
    if (reason === 'harness') return;                   // the suite has no session to lose
    if (!authClientReady()) return;                     // not a finding yet — see authClientReady()
    if (promptedForLapse) return;                       // asked once; "later" means later
    if (promptReauth()) promptedForLapse = true;        // stays false if a modal blocked us — retry next tick
  }, 2000);

  // ── The seam ────────────────────────────────────────────────
  window.HearthriseGate = {
    isOpen: isOpen,
    openReason: openReason,
    whenOpen: whenOpen,
    whenSignedIn: whenSignedIn,
    promptReauth: promptReauth,
    hasLocalSave: hasLocalSave,
    // pure, for the guard tests
    decide: decide,
    isPlayerOrigin: isPlayerOrigin,
    isHarnessContext: isHarnessContext,
    sessionIsUsable: sessionIsUsable,
    PLAYER_HOSTS: PLAYER_HOSTS.slice(),
    // test seams
    _buildGate: buildGate,
    /* b46x: the wall's markup was already testable; its BEHAVIOUR was not.
       `wire()` is where the invite code becomes (or does not become) part of a
       signup payload, and a test that could only read the DOM would pass
       against a client that still sent `{invite_code:''}` to a server that
       treats '' and NULL differently. Exported so the guard drives the real
       submit handler with a stubbed HearthriseAuth and reads what LEFT. */
    _wire: wire,
    /* THE SIGN-UP DOOR's seams. Same reason as `_wire`: the interesting
       assertions are about BEHAVIOUR (which stage the panel is in, what the
       resend actually rendered, which refusal the player was given), and a
       test that could only read the initial markup would pass against every
       one of the bugs these exist to catch. `_arrival`/`_linkInvite` are the
       parse-time URL reads, exposed so a guard can see what the wall decided
       before it stripped the evidence out of the address bar. */
    _applyArrival: applyArrival,
    _applyLinkInvite: applyLinkInvite,
    _inviteRefusalMessage: inviteRefusalMessage,
    _arrival: function () { return ARRIVAL; },
    _linkInvite: function () { return LINK_INVITE; },
    _humaniseAuthError: humaniseAuthError,
    _readCachedSession: readCachedSession,
    _whenSessionPersisted: whenSessionPersisted,
    // b349: how many jobs are still holding for a session, WHICH ones, and the
    // drain the 2s watcher calls. A test that could only observe "it did not
    // run" would pass against a whenSignedIn() that threw the callback away;
    // one that could only count would pass against a caller that stopped
    // deferring while some other caller kept the number the same.
    _signedInPending: function () { return signedInQueue.length; },
    _signedInWaiting: function () { return signedInQueue.map(function (j) { return j.label; }); },
    _drainSignedIn: drainSignedIn
  };

  console.log('[account-gate] ' + (open ? 'open (' + reason + ')' : 'CLOSED — account required'));
})();
