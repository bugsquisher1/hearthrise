// ============================================================================
// src/features/discord-invite.js — THE DISCORD INVITE AND THE DISCORD GIFT.
//
// One place for the invite URL, the pitch, the invite row every surface draws
// (sign-in screen, the first-day card, the Home rail, Settings) and the "Claim
// Discord gift" sheet.
//
// THE GIFT IS THE SERVER'S. The player types the code posted in the Discord
// welcome channel (a new one each week); hr_claim_discord_gift (supabase/
// migrations/2026-10-18-discord-gift.sql) derives this week's code on the server
// and pays a fixed gem amount once per ACCOUNT. GIFT_GEMS below is only the
// pitch's copy of that amount, bound to the server constant by
// tests/discord-gift.mjs; the success line quotes the `gems` the server answered,
// and the balance arrives through the record reconcile in goal-claim.js
// (CREDIT_VERBS), never through a client write.
//
// Clicks are delegated from the document ([data-hr-discord-gift]), because Home
// repaints its markup every 1.5 s and a handler bound to a node would die with
// it. Classic script, loaded before account-gate.js, which reads INVITE.
// ============================================================================
(function () {
  'use strict';

  var INVITE = 'https://discord.gg/eJrUSUJM3M';
  var LINK_TEXT = 'Join the Hearthrise Discord';
  var GIFT_GEMS = 25;
  var PITCH = 'meet other players, report bugs, and get a ' + GIFT_GEMS + '-gem welcome gift.';
  var SHEET_ID = 'hr-dc-sheet';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** The invite as a node, for screens built with createElement (the sign-in gate). */
  function link(text, cls) {
    var a = document.createElement('a');
    a.href = INVITE;
    a.target = '_blank';
    a.rel = 'noopener';
    if (cls) a.className = cls;
    a.textContent = text || LINK_TEXT;
    return a;
  }
  /** "<Join the Hearthrise Discord> — meet other players, …", as nodes. */
  function inviteNodes(cls) {
    var f = document.createDocumentFragment();
    f.appendChild(link(LINK_TEXT, cls));
    f.appendChild(document.createTextNode(' — ' + PITCH));
    return f;
  }
  function linkHtml(text, cls) {
    return '<a' + (cls ? ' class="' + esc(cls) + '"' : '') + ' href="' + esc(INVITE)
      + '" target="_blank" rel="noopener">' + esc(text || LINK_TEXT) + '</a>';
  }

  /* The Home-family row (first-day card and the Home rail share it), drawn with
     the dashboard's own hd-card / hd-cta classes. `where` is a suite hook. */
  function rowHtml(where) {
    return '<div class="hd-card hd-mini hr-dc-row" data-hr-discord="' + esc(where) + '">'
      + '<div class="hr-dc-text"><b>' + esc(LINK_TEXT) + '</b> — ' + esc(PITCH) + '</div>'
      + '<div class="hr-dc-actions">'
      + linkHtml('Join', 'hd-cta ghost')
      + '<button type="button" class="hd-cta ghost" data-hr-discord-gift>Claim gift</button>'
      + '</div></div>';
  }

  // ── THE CLAIM ───────────────────────────────────────────────────────────
  /* The code as the server will read it: letters and digits, upper case. A
     shape the server could never accept is answered here without spending the
     player's rate budget; every rule about the CODE itself is the server's. */
  function normalise(code) {
    return String(code == null ? '' : code).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }
  function shapeOk(norm) { return /^[A-Z0-9]{6,32}$/.test(norm); }

  /* Every answer the sheet can show, keyed by the server's error code. One
     table, so the suite can read each state without a network. */
  var COPY = {
    wrong_code: 'That code does not match. Check the welcome channel on Discord and try again.',
    code_expired: 'That code has expired. This week\'s code is pinned in the Discord welcome channel.',
    gift_unavailable: 'Discord gifts are not open yet. Check back soon.',
    daily_budget: 'Your account has earned all the gems it can today. Claim the gift tomorrow.',
    already_claimed: 'Your Discord gift is already claimed on this account. Thanks for joining!',
    rate_limited: 'Too many tries at once. Wait a minute and try again.',
    not_signed_in: 'Sign in first, then claim your gift.',
    no_character: 'Pick a hero first, then claim your gift.',
    rpc_missing: 'Discord gifts are not open yet. Your code will still work once they are.',
    offline: 'Could not reach the realm. Check your connection and try again.'
  };
  function classify(res) {
    if (res && res.ok === true) {
      var g = Math.max(0, Math.floor(Number(res.gems) || 0));
      return { state: 'ok', text: 'Gift claimed: ' + g + ' gems added. Welcome to the Discord!' };
    }
    var err = (res && res.error) || 'offline';
    if (err === 'network' || err === 'timeout' || err === 'no_config' || err === 'bad_response') err = 'offline';
    if (err === 'bad_slot') err = 'no_character';
    return { state: COPY[err] ? err : 'offline', text: COPY[err] || COPY.offline };
  }

  function claim(code) {
    var norm = normalise(code);
    if (!shapeOk(norm)) return Promise.resolve(classify({ ok: false, error: 'wrong_code' }));
    var GC = window.HearthriseGoalClaim;
    if (!GC || typeof GC.claimDiscordGift !== 'function') {
      return Promise.resolve(classify({ ok: false, error: 'offline' }));
    }
    return Promise.resolve(GC.claimDiscordGift(norm))
      .then(classify, function () { return classify({ ok: false, error: 'network' }); });
  }

  // ── THE SHEET (.hr-scrim / .hr-sheet primitive, Escape via data-hr-dismiss) ──
  function close() {
    var s = document.getElementById(SHEET_ID);
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }
  function openGift() {
    if (document.getElementById(SHEET_ID)) return document.getElementById(SHEET_ID);
    var scrim = document.createElement('div');
    scrim.id = SHEET_ID;
    scrim.className = 'hr-scrim hr-dc-scrim';
    scrim.setAttribute('role', 'dialog');
    scrim.setAttribute('aria-modal', 'true');
    scrim.setAttribute('aria-label', 'Claim Discord gift');
    scrim.innerHTML =
      '<form class="hr-sheet hr-dc-box" novalidate>'
      + '<button type="button" class="hr-dc-close" data-hr-dismiss aria-label="Close" title="Close">&times;</button>'
      + '<div class="hr-sheet-head"><div class="hr-dc-h">Claim your Discord gift</div></div>'
      + '<div class="hr-sheet-body">'
      +   '<p class="hr-dc-p">' + linkHtml(LINK_TEXT) + ' — ' + esc(PITCH)
      +   ' This week\'s gift code is pinned in the welcome channel.</p>'
      +   '<label class="hr-dc-label" for="hr-dc-code">Gift code</label>'
      +   '<input id="hr-dc-code" class="hr-dc-input" type="text" maxlength="40" autocomplete="off"'
      +     ' autocapitalize="characters" spellcheck="false" placeholder="e.g. HEARTH-ABC123" />'
      +   '<div class="hr-dc-status" role="status" aria-live="polite" data-state="idle"></div>'
      + '</div>'
      + '<div class="hr-sheet-foot"><button type="submit" class="hr-dc-claim">Claim gift</button></div>'
      + '</form>';
    var form = scrim.querySelector('form');
    var input = scrim.querySelector('.hr-dc-input');
    var status = scrim.querySelector('.hr-dc-status');
    var btn = scrim.querySelector('.hr-dc-claim');
    scrim.querySelector('.hr-dc-close').onclick = close;
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true;
      status.setAttribute('data-state', 'busy');
      status.textContent = 'Checking your code…';
      claim(input.value).then(function (r) {
        status.setAttribute('data-state', r.state);
        status.textContent = r.text;
        /* A paid or already-claimed account has nothing left to submit. */
        btn.disabled = (r.state === 'ok' || r.state === 'already_claimed');
        if (btn.disabled) btn.textContent = 'Claimed';
      });
    });
    document.body.appendChild(scrim);
    try { input.focus(); } catch (e) {}
    return scrim;
  }

  /* ── THE ALWAYS-VISIBLE DISCORD BUTTON ─────────────────────────────────
     In the top bar, on a desktop and (icon only) on a landscape phone, open
     from the first minute: a step-0 reveal row
     (`card:discord`), so the reveal never hides it. A "!" stays on it until the
     player opens it or presses "Got it": `G.discordSeen`, a display-only
     residue field (src/net/client-state.js) that gates nothing. */
  var TIP = 'Join our Discord: meet players, report bugs, get 25 gems';
  var BTN_CSS = 'hr-dc-btn-css';
  function seen() { return !!(window.G && window.G.discordSeen); }
  function markSeen() {
    if (window.G) window.G.discordSeen = true;
    paintButtons();
  }
  function ensureButtonCss() {
    if (document.getElementById(BTN_CSS)) return;
    var s = document.createElement('style');
    s.id = BTN_CSS;
    s.textContent = [
      '.hr-dc-btn{position:relative;display:inline-flex;align-items:center;gap:6px;min-height:44px;min-width:44px;padding:0 10px;',
      'border-radius:var(--r);color:var(--ink-2);font-family:var(--f-label);font-weight:700;text-decoration:none;box-sizing:border-box}',
      '.hr-dc-btn:hover{color:var(--ink)}',
      '.hr-dc-btn .hr-dc-lbl{margin-right:8px}.hr-dc-bang{position:absolute;top:4px;right:0;min-width:18px;height:18px;border-radius:99px;display:grid;place-items:center;font-weight:800;',
      'background:var(--gold);color:var(--bg-0);font-size:calc(14.5px * var(--ui-scale, 1));line-height:1}',
      '.hr-dc-gotit{min-height:44px;padding:0 8px;background:none;border:0;color:var(--ink-3);font-family:var(--f-ui);cursor:pointer}',
      '.hr-dc-wrap{display:inline-flex;align-items:center}',
      /* A landscape phone keeps the top-bar copy, icon only: the rail scrolls, so its foot is off screen. */
      '@media (max-width: 540px), (max-height: 540px) and (max-width: 1024px){.hr-dc-wrap .hr-dc-lbl,.hr-dc-gotit{display:none}}',
    ].join('\n');
    document.head.appendChild(s);
  }
  function buttonHtml() {
    var gly = (window.HR && typeof window.HR.icon === 'function') ? (window.HR.icon('uiPeople', 18, 'currentColor') || '') : '';
    return '<a class="hr-dc-btn" data-hr-discord-btn href="' + esc(INVITE) + '" target="_blank" rel="noopener noreferrer" title="' + esc(TIP) + '" aria-label="' + esc(TIP) + '">'
      + gly + '<span class="hr-dc-lbl">Discord</span>' + (seen() ? '' : '<span class="hr-dc-bang" aria-hidden="true">!</span>') + '</a>'
      + (seen() ? '' : '<button type="button" class="hr-dc-gotit" data-hr-discord-gotit>Got it</button>');
  }
  function paintButtons() {
    var R = window.HearthriseReveal;
    if (R && !R.shows('card:discord')) return;
    ensureButtonCss();
    var hosts = [['is-top', document.querySelector('.topbar .top-stats'), 'afterbegin']];
    var html = buttonHtml();
    hosts.forEach(function (h) {
      if (!h[1]) return;
      var w = document.querySelector('.hr-dc-wrap.' + h[0]);
      if (!w) {
        w = document.createElement('div');
        w.className = 'hr-dc-wrap ' + h[0];
        h[1].insertAdjacentElement(h[2], w);
      }
      if (w.__sig !== html) { w.__sig = html; w.innerHTML = html; }
    });
  }
  setInterval(paintButtons, 1500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintButtons); else paintButtons();

  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[data-hr-discord-btn], [data-hr-discord-gotit]');
    if (!b) return;
    if (b.hasAttribute('data-hr-discord-gotit')) e.preventDefault();
    markSeen();
  });

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-hr-discord-gift]');
    if (!t) return;
    e.preventDefault();
    openGift();
  });

  window.HearthriseDiscord = {
    INVITE: INVITE,
    link: link,
    inviteNodes: inviteNodes,
    linkHtml: linkHtml,
    rowHtml: rowHtml,
    openGift: openGift,
    paintButtons: paintButtons,
    claim: claim,
    classify: classify,
    normalise: normalise
  };
})();
