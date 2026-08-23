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
      '  background:url(assets/brand/hearthrise-splash.jpg?v=454) 50% 42%/cover no-repeat}',
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
    crest: 'assets/brand/hearthrise-crest.png?v=454',
    word:  'assets/brand/hearthrise-wordmark.svg?v=454'
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

    function field(labelText, type, name, autocomplete) {
      var l = el('label', 'hr-gate-field');
      l.appendChild(el('span', null, labelText));
      var i = document.createElement('input');
      i.type = type; i.name = name; i.autocomplete = autocomplete;
      i.spellcheck = false;
      l.appendChild(i);
      form.appendChild(l);
      return i;
    }
    var email = field('Email', 'email', 'email', 'email');
    var pass  = field('Password', 'password', 'password', 'current-password');

    var go = el('button', 'hr-gate-go');
    go.type = 'submit';
    form.appendChild(go);

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

    function paintMode() {
      var creating = mode === 'signup';
      bCreate.setAttribute('aria-selected', creating ? 'true' : 'false');
      bSignIn.setAttribute('aria-selected', creating ? 'false' : 'true');
      pass.autocomplete = creating ? 'new-password' : 'current-password';
      go.textContent = creating ? 'Create account' : 'Sign in';
      if (reauth) {
        lead.textContent = 'Your session ended. Sign in again to keep your progress syncing to the realm — ' +
          'nothing you have earned is lost either way.';
      } else {
        lead.textContent = creating
          ? 'Your account holds your name, your progress, and your place on the boards.'
          : 'Welcome back. Sign in to pick up where the realm left you.';
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
      var dc = el('a', null, 'Join the Discord');
      dc.href = 'https://discord.gg/eJrUSUJM3M';
      dc.target = '_blank';
      dc.rel = 'noopener';
      help.appendChild(dc);
      foot.parentNode.appendChild(help);
    }

    return {
      root: root, form: form, email: email, pass: pass, go: go, note: note,
      later: later, foot: foot,
      getMode: function () { return mode; },
      say: function (text, tone) { note.textContent = text || ''; note.setAttribute('data-tone', tone || 'muted'); },
      busy: function (on) { go.disabled = !!on; email.disabled = !!on; pass.disabled = !!on; }
    };
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
    short:       'Passwords must be at least 6 characters.'
  };

  function wire(ui, opts) {
    opts = opts || {};
    var working = false;

    ui.form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (working) return;
      var addr = ui.email.value.trim();
      var pw = ui.pass.value;
      if (!addr) { ui.say(ERR.email, 'bad'); ui.email.focus(); return; }
      if (!pw) { ui.say(ERR.password, 'bad'); ui.pass.focus(); return; }
      if (ui.getMode() === 'signup' && pw.length < 6) { ui.say(ERR.short, 'bad'); ui.pass.focus(); return; }

      working = true;
      ui.busy(true);
      ui.say(ui.getMode() === 'signup' ? 'Creating your account…' : 'Signing in…', 'muted');

      whenAuthReady().then(function (ok) {
        if (!ok) throw new Error(ERR.unavailable);
        var a = auth();
        return ui.getMode() === 'signup' ? a.signUp(addr, pw) : a.signIn(addr, pw);
      }).then(function (data) {
        // Sign-up with email confirmation on returns no session. Say so
        // plainly rather than pretending the player is in.
        if (ui.getMode() === 'signup' && data && !data.session) {
          working = false; ui.busy(false);
          ui.say('Account created. Confirm the link in your email, then sign in.', 'ok');
          return;
        }
        ui.say('Entering the realm…', 'ok');
        if (typeof opts.onSuccess === 'function') opts.onSuccess();
      }).catch(function (err) {
        working = false; ui.busy(false);
        ui.say((err && err.message) || 'That did not work — try again.', 'bad');
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
    setTimeout(function () { try { ui.email.focus(); } catch (e) {} }, 60);
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
          window.notify('Playing offline — your progress is kept on this device and will sync when you sign in.', 'info');
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
