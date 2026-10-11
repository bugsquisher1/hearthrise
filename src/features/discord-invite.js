// ============================================================================
// src/features/discord-invite.js — THE DISCORD INVITE AND THE DISCORD GIFT.
//
// One place for the invite URL, the pitch, the invite row every surface draws
// (sign-in screen, the first-day card, the Home rail, Settings) and the "Claim
// Discord gift" sheet.
//
// THE GIFT IS THE SERVER'S. The player types the code posted in the Discord
// welcome channel; hr_claim_discord_gift (supabase/migrations/
// 2026-10-18-discord-gift.sql) checks it against the server's own code table and
// pays a fixed gem amount once per ACCOUNT. Nothing here knows the amount: the
// success line quotes the `gems` the server answered, and the balance arrives
// through the record reconcile in goal-claim.js (CREDIT_VERBS), never through a
// client write.
//
// Clicks are delegated from the document ([data-hr-discord-gift]), because Home
// repaints its markup every 1.5 s and a handler bound to a node would die with
// it. Classic script, loaded before account-gate.js, which reads INVITE.
// ============================================================================
(function () {
  'use strict';

  var INVITE = 'https://discord.gg/eJrUSUJM3M';
  var LINK_TEXT = 'Join the Hearthrise Discord';
  var PITCH = 'meet other players, report bugs, get a gift.';
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
    code_expired: 'That code has expired. The current one is pinned in the Discord welcome channel.',
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
      +   ' The gift code is pinned in the welcome channel.</p>'
      +   '<label class="hr-dc-label" for="hr-dc-code">Gift code</label>'
      +   '<input id="hr-dc-code" class="hr-dc-input" type="text" maxlength="40" autocomplete="off"'
      +     ' autocapitalize="characters" spellcheck="false" placeholder="e.g. HEARTH1234" />'
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
    claim: claim,
    classify: classify,
    normalise: normalise
  };
})();
