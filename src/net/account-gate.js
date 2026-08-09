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

      /* The scene, not the game's --app-bg: that one puts its ember at 78% 3%,
         which fights a centred lockup and leaves the composition lit from the
         wrong corner. Same Forge & Stone dusk tokens, one light source, above
         the crest. */
      '.hr-gate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;',
      '  justify-content:center;padding:28px 20px;overflow:auto;',
      '  background:',
      '    radial-gradient(ellipse 72% 46% at 50% 0%,var(--scene-glow-2,rgba(206,116,50,.13)) 0%,var(--scene-glow-0,rgba(206,116,50,0)) 62%),',
      '    linear-gradient(180deg,var(--scene-sky-1,#16120e) 0%,var(--scene-sky-0,#0c0a08) 58%,var(--scene-ridge-near,#0b0806) 100%);',
      '  font-family:var(--f-ui,system-ui,sans-serif);color:var(--ink,#ece1cc);',
      '  -webkit-font-smoothing:antialiased}',

      '.hr-gate-col{position:relative;width:100%;max-width:404px;margin:auto;',
      '  display:flex;flex-direction:column;align-items:center}',

      /* ── crest + wordmark (the b218 lockup, stacked and centred) ── */
      /* No local halo behind the crest — a soft disc at this size reads as a
         rendering artefact, not as light. The one page-level ember above the
         lockup is the whole light source. */
      '.hr-gate-mark{position:relative;display:flex;flex-direction:column;align-items:center;',
      '  gap:14px;margin-bottom:6px}',
      '.hr-gate-mark svg{display:block;width:66px;height:73px}',
      '.hr-gate-word{position:relative;font-family:var(--f-display,Georgia,serif);font-size:37px;line-height:1;',
      '  font-weight:600;letter-spacing:.085em;text-indent:.085em;',
      '  background:linear-gradient(180deg,#f2dda6 0%,#dcbb6c 46%,#b58c37 100%);',
      '  -webkit-background-clip:text;background-clip:text;color:transparent;',
      '  -webkit-text-fill-color:transparent}',
      '.hr-gate-rule{width:112px;height:1px;margin:15px 0 11px;',
      '  background:linear-gradient(90deg,rgba(201,162,74,0),rgba(201,162,74,.62),rgba(201,162,74,0))}',
      '.hr-gate-tag{font-family:var(--f-label,inherit);font-size:11.5px;letter-spacing:.2em;',
      '  text-transform:uppercase;color:var(--ink-3,#9d8b70)}',

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
      '  font-family:var(--f-label,inherit);font-size:13px;letter-spacing:.15em;text-transform:uppercase;',
      '  color:var(--ink-3,#9d8b70);border-bottom:2px solid transparent;margin-bottom:-1px;',
      '  transition:color 120ms ease,border-color 120ms ease}',
      '.hr-gate-mode:hover{color:var(--ink-2,#c4b79e)}',
      '.hr-gate-mode[aria-selected="true"]{color:var(--gold-2,#e3c77e);border-bottom-color:var(--gold-2,#e3c77e)}',

      '.hr-gate-lead{font-size:13.5px;line-height:1.55;color:var(--ink-2,#c4b79e);margin:0 0 16px}',

      '.hr-gate-field{display:block;margin-bottom:12px}',
      '.hr-gate-field span{display:block;font-family:var(--f-label,inherit);font-size:11px;',
      '  letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3,#9d8b70);margin-bottom:5px}',
      '.hr-gate-field input{width:100%;box-sizing:border-box;padding:10px 12px;font:inherit;font-size:15px;',
      '  color:var(--ink,#ece1cc);background:rgba(0,0,0,.30);border-radius:var(--r,3px);',
      '  border:1px solid var(--line,rgba(201,162,74,.20));transition:border-color 120ms ease}',
      '.hr-gate-field input:focus{outline:none;border-color:var(--gold,#c9a24a)}',
      '.hr-gate-field input:-webkit-autofill{-webkit-text-fill-color:var(--ink,#ece1cc);',
      '  -webkit-box-shadow:0 0 0 1000px #241e17 inset}',

      '.hr-gate-go{width:100%;margin-top:6px;min-height:42px;padding:0 18px;cursor:pointer;',
      '  font:700 13px/1 var(--f-ui,inherit);letter-spacing:.06em;',
      '  border:1px solid #e6cd93;border-radius:var(--r,3px);color:#221803;',
      '  background:linear-gradient(180deg,#d9b361 0%,#c09539 52%,#a67c28 100%);',
      '  box-shadow:inset 0 1px 0 rgba(255,246,220,.55),inset 0 -2px 3px rgba(90,60,8,.4),0 2px 5px -2px rgba(0,0,0,.7);',
      '  transition:background 120ms ease,transform 80ms ease}',
      '.hr-gate-go:hover:not(:disabled){background:linear-gradient(180deg,#eaca7d 0%,#d3ab4f 52%,#b98d33 100%)}',
      '.hr-gate-go:active:not(:disabled){transform:translateY(1px)}',
      '.hr-gate-go:disabled{opacity:.6;cursor:progress}',

      '.hr-gate-note{min-height:18px;margin:11px 2px 0;font-size:12.5px;line-height:1.45;text-align:center}',
      '.hr-gate-note[data-tone="bad"]{color:#d98b7a}',
      '.hr-gate-note[data-tone="ok"]{color:var(--gold-2,#e3c77e)}',
      '.hr-gate-note[data-tone="muted"]{color:var(--ink-3,#9d8b70)}',

      '.hr-gate-foot{margin-top:20px;font-size:12.5px;line-height:1.6;text-align:center;',
      '  color:var(--ink-3,#9d8b70);max-width:330px;text-wrap:balance}',
      '.hr-gate-foot b{color:var(--ink-2,#c4b79e);font-weight:700}',

      /* the lapsed-session re-prompt: same form, but a sheet beside a running
         game rather than a door in front of it */
      '.hr-gate.reauth{background:rgba(6,5,3,.72);backdrop-filter:blur(3px);align-items:center}',
      '.hr-gate.reauth::before{display:none}',
      '.hr-gate.reauth .hr-gate-mark{display:none}',
      '.hr-gate.reauth .hr-gate-col{max-width:392px}',
      '.hr-gate.reauth .hr-gate-panel{margin-top:0;background:var(--bg-3,#2a241c)}',
      '.hr-gate-later{display:block;margin:14px auto 0;background:none;border:0;padding:4px;',
      '  font:inherit;font-size:12px;color:var(--ink-3,#9d8b70);text-decoration:underline;cursor:pointer}',
      '.hr-gate-later:hover{color:var(--gold-2,#e3c77e)}',

      '@media (max-height:620px){.hr-gate{align-items:flex-start}.hr-gate-word{font-size:31px}',
      '  .hr-gate-mark svg{width:42px;height:46px}.hr-gate-panel{margin-top:18px}}',
      '@media (max-width:420px){.hr-gate{padding:20px 14px}.hr-gate-word{font-size:31px}}'
    ].join('');
    document.head.appendChild(s);
  }

  // The crest from the sidebar lockup, drawn at gate scale. Same shield +
  // rising sun; no emoji anywhere in this file by project rule.
  var CREST = '' +
    '<svg viewBox="0 0 40 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
    '<defs>' +
    '<radialGradient id="hrg-ember" cx="50%" cy="64%" r="62%">' +
    '<stop offset="0%" stop-color="#f6d391" stop-opacity=".55"/>' +
    '<stop offset="55%" stop-color="#c9902f" stop-opacity=".16"/>' +
    '<stop offset="100%" stop-color="#c9902f" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<linearGradient id="hrg-gild" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#f4d489"/><stop offset="100%" stop-color="#c99433"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<path d="M5 5 L35 5 L35 21 Q35 34.5 20 41 Q5 34.5 5 21 Z" fill="#1a150d"/>' +
    '<path d="M5 5 L35 5 L35 21 Q35 34.5 20 41 Q5 34.5 5 21 Z" fill="url(#hrg-ember)"/>' +
    '<path d="M5 5 L35 5 L35 21 Q35 34.5 20 41 Q5 34.5 5 21 Z" fill="none" stroke="url(#hrg-gild)" stroke-width="1.6"/>' +
    '<path d="M11 27 A9 9 0 0 1 29 27 Z" fill="url(#hrg-gild)"/>' +
    '<line x1="9.5" y1="27" x2="30.5" y2="27" stroke="url(#hrg-gild)" stroke-width="1.6" stroke-linecap="round"/>' +
    '<g stroke="#f4d489" stroke-width="1.4" stroke-linecap="round">' +
    '<line x1="20" y1="11.5" x2="20" y2="15"/><line x1="12.5" y1="14" x2="14.6" y2="16.8"/>' +
    '<line x1="27.5" y1="14" x2="25.4" y2="16.8"/></g></svg>';

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
      var crest = el('span');
      crest.innerHTML = CREST;                       // static, authored above
      mark.appendChild(crest.firstChild);
      mark.appendChild(el('div', 'hr-gate-word', 'Hearthrise'));
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
          ? 'One account carries your name, your progress and your standing across every device you play on.'
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
        foot.textContent = 'Hearthrise is played online. Your account holds your progress, ' +
          'your name, and your place on the boards.';
      }
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
        setTimeout(function () { try { location.reload(); } catch (e) {} }, 220);
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
      return;
    }
    if (signed) { promptedForLapse = false; return; }   // re-arm for the NEXT lapse
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
    _readCachedSession: readCachedSession
  };

  console.log('[account-gate] ' + (open ? 'open (' + reason + ')' : 'CLOSED — account required'));
})();
