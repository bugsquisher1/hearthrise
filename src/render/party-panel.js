// ============================================================================
// src/render/party-panel.js — THE PARTY SCREEN (M8 slice 1: MEMBERSHIP).
//
// The display half of src/net/party.js. That module owns the wire and the read
// cadence; this one owns the picture and nothing else. Render helpers live here
// rather than in the monolith (CLAUDE.md §7: extract render helpers first,
// legacy.js stays glue), and `partyPanelHtml(view, opts)` is a PURE function of
// what it is handed — which is what lets the suite quote every line of it from
// a server-shaped fixture instead of a live account.
//
// ── EVERY NUMBER ON THIS SCREEN IS THE SERVER'S ─────────────────────────────
// A member's name, combat level, hp and hp_max come from `hr_party_view`, whose
// column set is FROZEN by the migration, and they are printed as they arrived.
// Nothing here derives a level, totals a party, predicts a join or keeps a
// count of its own: the HP bar's width is the ratio of two numbers the server
// sent in the same row, which is presentation of a projection rather than a
// computation on top of one. There is no state in which this panel shows a
// member the realm would not name (CLAUDE.md §6).
//
// THE TWO WALL CLOCKS, named so they are not mistaken for game values:
//   · the "Recovering" tag compares the server's `recovering_until` against the
//     browser clock, and
//   · an invite prints how long the SERVER's `expires_at` leaves.
// Both are display only. Neither gates anything: the Accept button is offered
// whatever the browser thinks the time is, and the server answers
// `invite_expired` if it disagrees. A clock that cannot spend anything is not
// authority (the same exception src/render/hunt-panel.js takes for its elapsed
// clock, and for the same reason).
//
// ── WHAT THIS SCREEN HONESTLY IS NOT ────────────────────────────────────────
// Slice 1 is MEMBERSHIP. Hunting together — the shared window, the split, the
// roster settle — is slices 2 to 5 and does not exist for a player today. The
// panel says so in one line rather than implying it with a greyed-out button,
// because a disabled control is a promise with a date attached and this one has
// no date. `share_bp`, `xp` and `gold` arrive from the frozen view as NULL and
// are deliberately not rendered at all: a column of em-dashes is a worse lie
// than an absent column.
//
// No hardcoded colours — every colour is a token (CLAUDE.md §7); the rules live
// in src/styles/legacy.css under THE PARTY PANEL. No new breakpoint: the frozen
// mobile query only (tests/breakpoint-guard.mjs).
//
// Classic script, published on window, globals read at call time — the
// established src/render/* convention, so it may load in any order after
// legacy.js.
// ============================================================================
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* An integer as the server sent it, grouped. It never rounds a value into
     existence: a non-number prints as an em-dash rather than as zero, because
     "0 hp" and "we were not told" are different facts. */
  function num(n) {
    var v = Number(n);
    if (n === null || typeof n === 'undefined' || !isFinite(v)) return '—';
    return Math.round(v).toLocaleString('en-US');
  }

  /** Whole minutes left on a server timestamp, or null when it has passed. A
      WALL CLOCK (see the header): nothing reads this to decide anything. */
  function minutesLeft(iso, nowMs) {
    var t = Date.parse(String(iso || ''));
    if (!isFinite(t)) return null;
    var mins = Math.ceil((t - nowMs) / 60000);
    return mins > 0 ? mins : null;
  }

  /** The bar's width, 0-100, from the two numbers in one server row. Clamped
      so a server that ever sends hp > hp_max draws a full bar instead of an
      overflowing one. */
  function hpPct(hp, hpMax) {
    var a = Number(hp), b = Number(hpMax);
    if (!isFinite(a) || !isFinite(b) || b <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((a / b) * 100)));
  }

  /* ── ONE MEMBER ROW ──────────────────────────────────────────────────────
     Name and level on the first line because that is what a player scans for;
     the HP bar under it, full width, because a bar in a cell is unreadable at
     phone scale. The Remove control is the leader's and never appears on the
     leader's own row — the server refuses a self-kick outright (`bad_party`),
     so this is the courteous half of a fence that is already closed. */
  function memberRow(m, opts) {
    var name = m && m.name ? m.name : 'Adventurer';
    var isYou = opts.youCanon && opts.canon && opts.canon(name) === opts.youCanon;
    var recovering = minutesLeft(m && m.recovering_until, opts.nowMs) !== null;
    var pct = hpPct(m && m.hp, m && m.hp_max);
    var cls = 'party-member'
      + (recovering ? ' is-recovering' : '')
      + (isYou ? ' is-you' : '');
    var tag = recovering ? '<span class="party-m-tag">Recovering</span>' : '';
    var you = isYou ? '<span class="party-m-you">you</span>' : '';
    var remove = (opts.role === 'leader' && !isYou)
      ? ('<button type="button" class="party-m-kick" data-party-act="kick" data-party-name="'
         + esc(name) + '">Remove</button>')
      : '';
    /* FOUR GRID ITEMS IN A FIXED COLUMN SET, not a flex line that ends where
       its content ends. The level, the hp figure and the Remove control each
       own a column, so they line up DOWN the roster: with `margin-left:auto`
       they landed at three different x positions and the list read as three
       unrelated rows. The tag sits against the NAME rather than at the end of
       the line, so "who is hurt" is one saccade instead of a scan. */
    return '<li class="' + cls + '">'
      + '<div class="party-m-line">'
      +   '<span class="party-m-name">' + esc(name) + '</span>' + you + tag
      + '</div>'
      + '<span class="party-m-lvl">Lv ' + num(m && m.combat_level) + '</span>'
      + '<div class="party-hp">'
      +   '<span class="party-hp-track"><span class="party-hp-fill" style="width:' + pct + '%"></span></span>'
      +   '<span class="party-hp-num">' + num(m && m.hp) + ' / ' + num(m && m.hp_max) + '</span>'
      + '</div>'
      + remove
      + '</li>';
  }

  /* ── THE INVITE BOX (leader only) ────────────────────────────────────────
     By display NAME, because the frozen view carries no user id and must not:
     an id is an addressable handle to a person. The single refusal sentence
     prints under the field — "that adventurer cannot be invited right now" and
     nothing more specific, because the server deliberately answers one string
     for no-such-name, already-partied, that-is-you and both receiver clamps,
     and a friendlier guess here would leak exactly what it refuses to. */
  function inviteBox(draft) {
    return '<form class="party-invite" data-party-act="invite">'
      + '<label class="party-invite-lab" for="party-invite-name">Invite by name</label>'
      + '<div class="party-invite-row">'
      +   '<input id="party-invite-name" class="party-invite-in" type="text" autocomplete="off"'
      +     ' spellcheck="false" maxlength="24" placeholder="Their display name" value="' + esc(draft) + '">'
      +   '<button type="submit" class="party-btn is-primary">Invite</button>'
      + '</div>'
      + '</form>';
  }

  /* The leave confirm is TWO STEPS IN THE PANEL, not a browser dialog: leaving
     a party is cheap to redo and a modal for it is heavier than the act. */
  function leaveControl(asking) {
    if (!asking) {
      return '<button type="button" class="party-btn is-quiet" data-party-act="leave-ask">Leave party</button>';
    }
    return '<div class="party-confirm">'
      + '<span class="party-confirm-q">Leave this party?</span>'
      + '<button type="button" class="party-btn is-danger" data-party-act="leave-yes">Leave</button>'
      + '<button type="button" class="party-btn is-quiet" data-party-act="leave-no">Stay</button>'
      + '</div>';
  }

  function inviteCard(inv, nowMs) {
    var mins = minutesLeft(inv && inv.expires_at, nowMs);
    var when = mins === null ? 'expiring now' : ('expires in ' + mins + ' min');
    return '<li class="party-inv">'
      + '<div class="party-inv-line">'
      +   '<span class="party-inv-what">A party has invited you</span>'
      +   '<span class="party-inv-when">' + esc(when) + '</span>'
      + '</div>'
      + '<button type="button" class="party-btn is-primary" data-party-act="accept" data-party-invite="'
      +   esc(inv && inv.id) + '">Accept</button>'
      + '</li>';
  }

  /* ── THE WHOLE SCREEN ────────────────────────────────────────────────────
     view: the projection src/net/party.js parks in G._party, unchanged.
     opts: { nowMs, you, canon, asking, draft } — the wall clock, who I am (for
     the `you` marker only), the two-step confirm's position and the unsent
     invite draft. None of them is a game value and none of them is persisted. */
  function partyPanelHtml(view, opts) {
    var v = view || {};
    var o = opts || {};
    var nowMs = isFinite(o.nowMs) ? o.nowMs : Date.now();
    var members = Array.isArray(v.members) ? v.members : [];
    var invites = Array.isArray(v.invites) ? v.invites : [];
    var rowOpts = {
      nowMs: nowMs, role: v.role,
      canon: o.canon,
      youCanon: (o.canon && o.you) ? o.canon(o.you) : null
    };

    var notice = v.notice
      ? '<p class="party-notice" role="status">' + esc(v.notice) + '</p>' : '';
    /* WHILE A VERB IS IN FLIGHT THE CONTROLS ARE INERT. Two clicks on "Form a
       party" are two DIFFERENT idempotency keys, so the server would honour
       both intents and refuse the second `already_in_party` — the player gets a
       refusal for doing nothing wrong. The fence belongs on the gesture. */
    var busy = v.busy ? ' is-busy' : '';

    /* SLICE 1 SAYS WHAT IT IS. One line, always, in both states — a player who
       forms a party must not spend an evening looking for the hunt button. */
    var later = '<p class="party-later">Hunting together arrives in a later build.</p>';

    if (v.signedOut) {
      return '<div class="party-panel">'
        + '<p class="party-empty">Sign in to play with other people.</p>' + later + '</div>';
    }
    if (!v.known) {
      return '<div class="party-panel">' + notice
        + '<p class="party-empty">Asking the realm…</p>' + later + '</div>';
    }

    if (!v.partyId) {
      var inbox = invites.length
        ? ('<div class="party-inbox">'
           + '<h3 class="party-sub">Invitations</h3>'
           + '<ul class="party-inv-list">' + invites.map(function (i) { return inviteCard(i, nowMs); }).join('') + '</ul>'
           + '</div>')
        : '';
      return '<div class="party-panel' + busy + '">' + notice
        + '<p class="party-empty">You are not in a party — form one or accept an invite.</p>'
        + '<button type="button" class="party-btn is-primary" data-party-act="create">Form a party</button>'
        + inbox + later + '</div>';
    }

    /* The count is `members.length` — the LENGTH OF THE SERVER'S OWN LIST, not
       a tally the client keeps. `size_cap` is the party row's, read under the
       same RLS. If the cap did not come back the count stands alone rather than
       inventing a denominator. */
    var count = isFinite(Number(v.sizeCap))
      ? (members.length + ' of ' + num(v.sizeCap))
      : String(members.length);

    return '<div class="party-panel' + busy + '">'
      + '<div class="party-head">'
      +   '<h3 class="party-sub">Your party</h3>'
      +   '<span class="party-count">' + esc(count) + '</span>'
      +   (v.role === 'leader' ? '<span class="party-role">leader</span>' : '')
      + '</div>'
      + notice
      + '<ul class="party-roster">'
      +   members.map(function (m) { return memberRow(m, rowOpts); }).join('')
      + '</ul>'
      + (v.role === 'leader' ? inviteBox(o.draft || '') : '')
      + '<div class="party-foot">' + leaveControl(!!o.asking) + '</div>'
      + later
      + '</div>';
  }

  /* ══════════════════════════════════════════════════════════════════════
     THE LIVE HALF. Three pieces of view state, all of them scratch that dies
     with the tab: the unsent invite draft, the confirm's position, and nothing
     else. None of it is a game value, so none of it goes near G or the residue.
     ══════════════════════════════════════════════════════════════════════ */
  var draft = '';
  var asking = false;

  function host() { return document.getElementById('party-panel'); }

  function renderParty() {
    var el = host();
    if (!el) return null;
    var P = window.HearthriseParty;
    var view = (P && typeof P.getState === 'function') ? P.getState() : null;
    var I = window.HearthriseIdentity;
    el.innerHTML = partyPanelHtml(view, {
      nowMs: Date.now(),
      you: (I && typeof I.displayName === 'function') ? I.displayName() : null,
      canon: (I && typeof I.canon === 'function') ? I.canon : null,
      asking: asking,
      draft: draft
    });
    return el;
  }

  function act(name, el) {
    var P = window.HearthriseParty;
    if (!P) return;
    if (name === 'create') { asking = false; P.createParty(); return; }
    if (name === 'leave-ask') { asking = true; renderParty(); return; }
    if (name === 'leave-no') { asking = false; renderParty(); return; }
    if (name === 'leave-yes') { asking = false; P.leave(); return; }
    if (name === 'kick') { P.kick(el.getAttribute('data-party-name')); return; }
    if (name === 'accept') { P.accept(el.getAttribute('data-party-invite')); return; }
  }

  /* ONE delegated listener on the host, wired once. The panel's innards are
     replaced on every read, so a listener per button would be re-bound on every
     repaint and is how a click quietly stops working. */
  function setupPartyPanel() {
    var el = host();
    if (!el || el.dataset.partyWired === '1') return;
    el.dataset.partyWired = '1';

    el.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-party-act]') : null;
      if (!btn || btn.tagName === 'FORM') return;
      ev.preventDefault();
      act(btn.getAttribute('data-party-act'), btn);
    });
    /* The draft survives a repaint because it is read on every keystroke — the
       roster can land mid-sentence and must not eat what was typed. */
    el.addEventListener('input', function (ev) {
      if (ev.target && ev.target.id === 'party-invite-name') draft = ev.target.value;
    });
    el.addEventListener('submit', function (ev) {
      var f = ev.target && ev.target.closest ? ev.target.closest('form[data-party-act="invite"]') : null;
      if (!f) return;
      ev.preventDefault();
      var name = draft.trim();
      if (!name) return;
      draft = '';
      window.HearthriseParty.invite(name);
    });

    /* THE ONLY THING THAT ARMS A READ. src/net/party.js reads on open and then
       no faster than its own floor while the panel is up; leaving the screen
       disarms it entirely (B8). Registered through the single showTab owner —
       never a monkey-patch that captures the previous one. */
    if (window.HearthriseShowTab && window.HearthriseShowTab.wrapShowTab) {
      window.HearthriseShowTab.wrapShowTab('party-panel', function (tab) {
        var P = window.HearthriseParty;
        if (!P) return;
        if (tab === 'party') { asking = false; renderParty(); P.setVisible(true); }
        else P.setVisible(false);
      });
    }
  }

  window.partyPanelHtml = partyPanelHtml;
  window.renderParty = renderParty;
  window.setupPartyPanel = setupPartyPanel;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupPartyPanel);
  } else {
    setupPartyPanel();
  }
}());
