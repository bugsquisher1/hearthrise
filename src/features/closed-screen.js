// ============================================================
// src/features/closed-screen.js — "HEARTHRISE IS CLOSED WHILE WE REBUILD IT"
//
// Tyler's ruling 2026-10-14/15: the game is closed to the public during a full
// rebuild. The SERVER decides who gets in (supabase/migrations/
// 2026-10-21-closed-mode.sql): a signed-in account that is not on the allowlist
// is refused by every Data-API request with HTTP 403 and the body
//     {"code":"hr_closed", "message":"Hearthrise is closed while we rebuild it.", …}
// This module is only the WINDOW onto that refusal: it watches responses for
// exactly that status and code and puts up a full-screen notice. It decides
// nothing. Deleting its DOM node opens nothing — every request behind it is
// still refused by the server.
//
// ── WHY IT WATCHES fetch ────────────────────────────────────
// The client has no single RPC helper: thirty-odd modules call
// `fetch(<url>/rest/v1/rpc/…)` themselves and supabase-js calls the global
// fetch too. The refusal can arrive on whichever request happens to be first
// (the boot hr_load, a heartbeat, a chat read), so the one place that sees all
// of them is the global fetch. The wrapper never changes a request or a
// response: it reads a CLONE of a 403 from this project's /rest/v1/ and passes
// the original through untouched.
//
// ── WHAT A PLAYER CAN DO HERE ───────────────────────────────
// Read why, join the Discord, or sign out (to switch to an allowlisted account
// on a shared device). Copy is plain English (player-text rule).
// ============================================================
(function () {
  'use strict';

  var CODE   = 'hr_closed';   // bound to the SQL by tests/closed-rebuild.mjs D-CLIENT
  var STATUS = 403;           // ditto: the hook's detail {"status":403}
  var ROOT_ID  = 'hr-closed-screen';
  var STYLE_ID = 'hr-closed-screen-style';
  var shown = false;
  var observed = 0;   // responses the PAGE's fetch chain handed this watcher (in-page test reads it)

  function isClosedBody(body) {
    return !!body && typeof body === 'object' && body.code === CODE;
  }

  function urlOf(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return String(input || '');
  }

  /* Read a clone of a candidate refusal. Never throws, never consumes the
     caller's body. Resolves true when the response was the closed refusal. */
  function inspect(url, res) {
    if (shown || !res || res.status !== STATUS || url.indexOf('/rest/v1/') === -1) return Promise.resolve(false);
    var copy;
    try { copy = res.clone(); } catch (e) { return Promise.resolve(false); }
    return copy.json().then(function (body) {
      if (!isClosedBody(body)) return false;
      show();
      return true;
    }, function () { return false; });
  }

  function wrap(fetchFn, onResponse) {
    if (typeof fetchFn !== 'function') return fetchFn;
    if (fetchFn.__hrClosedWrapped) return fetchFn;
    var wrapped = function (input) {
      var url = urlOf(input);
      return fetchFn.apply(this, arguments).then(function (res) {
        if (onResponse) onResponse();
        inspect(url, res);
        return res;
      });
    };
    wrapped.__hrClosedWrapped = true;
    return wrapped;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      'html[data-hr-closed] body{overflow:hidden}',
      'html[data-hr-closed] body > *:not(#' + ROOT_ID + '){visibility:hidden !important}',
      /* The layer is the .hr-scrim primitive (src/styles/art-direction.css):
         it supplies position, inset and the safe-area padding; this adds only
         the paint, the stacking and the centring. No [data-hr-dismiss]: Escape
         is consumed and the notice stays (src/render/modal-sheet.js). */
      '#' + ROOT_ID + '{z-index:2147483600;display:flex;align-items:center;justify-content:center;',
      '  background:var(--scene-sky-0);font-family:var(--f-ui);color:var(--scene-ink)}',
      '#' + ROOT_ID + ' .hr-closed-card{max-width:420px;width:100%;padding:28px 24px;text-align:center;',
      '  border:1px solid var(--line);border-radius:var(--r-lg);background:var(--scene-scrim-2)}',
      '#' + ROOT_ID + ' h1{margin:0 0 12px;font-size:1.5rem;color:var(--gold)}',
      '#' + ROOT_ID + ' p{margin:0 0 12px;line-height:1.5;color:var(--scene-ink-2)}',
      '#' + ROOT_ID + ' .hr-closed-actions{display:flex;flex-direction:column;gap:10px;margin-top:18px}',
      '#' + ROOT_ID + ' a,#' + ROOT_ID + ' button{display:block;padding:10px 14px;border-radius:var(--r);',
      '  font:inherit;cursor:pointer;text-decoration:none}',
      '#' + ROOT_ID + ' a{border:1px solid var(--gold-2);color:var(--gold)}',
      '#' + ROOT_ID + ' button{border:1px solid var(--line);background:transparent;color:var(--scene-ink-2)}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function discordUrl() {
    var d = window.HearthriseDiscord;
    return d && typeof d.INVITE === 'string' ? d.INVITE : '';
  }

  function show() {
    if (shown) return;
    shown = true;
    ensureStyle();
    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'hr-scrim';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', ROOT_ID + '-title');
    var card = document.createElement('div');
    card.className = 'hr-sheet hr-closed-card';
    var head = document.createElement('div');
    head.className = 'hr-sheet-head';
    var body = document.createElement('div');
    body.className = 'hr-sheet-body';
    var h = document.createElement('h1');
    h.id = ROOT_ID + '-title';
    h.textContent = 'Hearthrise is getting a major overhaul';
    var p1 = document.createElement('p');
    p1.textContent = 'We are rebuilding the game from the ground up: a living world you walk around, new hunts, and new combat. The game is closed while we work, and every character starts fresh when it reopens.';
    var p2 = document.createElement('p');
    p2.textContent = 'We will be back soon. The Discord gets the date first.';
    var actions = document.createElement('div');
    actions.className = 'hr-sheet-foot hr-closed-actions';
    var url = discordUrl();
    if (url) {
      var a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute('data-hr-closed-discord', '');
      a.textContent = 'Join the Discord';
      actions.appendChild(a);
    }
    var out = document.createElement('button');
    out.type = 'button';
    out.setAttribute('data-hr-closed-signout', '');
    out.textContent = 'Sign out';
    out.addEventListener('click', function () {
      var auth = window.HearthriseAuth;
      var done = function () { location.reload(); };
      if (auth && typeof auth.signOut === 'function') Promise.resolve(auth.signOut()).then(done, done);
      else done();
    });
    actions.appendChild(out);
    head.appendChild(h);
    body.appendChild(p1);
    body.appendChild(p2);
    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(actions);
    root.appendChild(card);
    document.body.appendChild(root);
    document.documentElement.setAttribute('data-hr-closed', '');
    (url ? actions.firstChild : out).focus();
  }

  function isShown() { return shown; }

  /* Test seam: the in-page suite shows the screen, reads it, and must leave the
     page exactly as it found it. */
  function resetForTest() {
    shown = false;
    var n = document.getElementById(ROOT_ID);
    if (n) n.remove();
    document.documentElement.removeAttribute('data-hr-closed');
  }

  // Later scripts (network-status.js) wrap window.fetch again, around this one;
  // every page request still passes through here, which `observed` proves.
  window.fetch = wrap(window.fetch, function () { observed++; });

  window.HearthriseClosed = {
    CODE: CODE,
    STATUS: STATUS,
    observed: function () { return observed; },
    isClosedBody: isClosedBody,
    inspect: inspect,
    wrap: wrap,
    show: show,
    isShown: isShown,
    resetForTest: resetForTest
  };
})();
