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
// ── THE HUNT CARD (stage 2) ─────────────────────────────────────────────────
// The Game Designer's "Party hunt as the player sees it" (docs/planning/
// SEC_GATHER_ARM_RUNBOOK_2026-10-06.md), every sentence verbatim. The card is
// drawn ONLY from hr_party_hunt_view's answer (`G._partyHunt.view`): kills, xp,
// gold, split, hp and every member's state are printed as the read sent them,
// and nothing is extrapolated between reads. The two wall clocks it adds are
// the hunt's "{h:mm} so far" (from the server's `started_at`) and "made camp
// {ago}" — durations, not game values, and nothing reads them. The split is
// `share_bp` written as a percent, a unit change of one server number.
// Whether [Start hunt] is drawn at all is the view's `channel_open`, with a
// fail-safe of "not open" until a read says otherwise (§6, residue-ahead).
// There is NO [Rejoin hunt] button: the return itself rejoins (ruling B3).
// `share_bp`, `xp` and `gold` are not in the ROSTER read (retired from
// hr_party_view by 2026-10-15-party-hunt-view.sql); they are the hunt view's.
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
    /* The raw server name only: the 'Adventurer' fallback is nobody's name. */
    var doingText = (!isYou && m && m.name && opts.doing) ? opts.doing(m.name) : '';
    var doing = doingText ? '<span class="party-m-doing">' + esc(doingText) + '</span>' : '';
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
      +   '<span class="party-m-name">' + esc(name) + '</span>' + you + tag + doing
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
  function leaveControl(asking, hunting) {
    if (!asking) {
      return '<button type="button" class="party-btn is-quiet" data-party-act="leave-ask">Leave party</button>';
    }
    /* §3: during a live hunt, leaving IS "stop for me" — say what it costs. */
    return '<div class="party-confirm">'
      + '<span class="party-confirm-q">' + (hunting
          ? 'You\'ll stop earning from this hunt; the others keep going.'
          : 'Leave this party?') + '</span>'
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

  /* ══════════════════════════════════════════════════════════════════════
     THE HUNT CARD. Pure: (hunt projection, party projection, opts) -> HTML.
     ══════════════════════════════════════════════════════════════════════ */
  var CLOSED_LINE = 'Party hunting isn\'t open yet. It switches on during the beta.';

  function huntIsLive(h) { return !!(h && h.view && h.view.hunt && h.view.hunt.live === true); }

  /** "{h:mm}" of a span — the hunt's elapsed WALL clock, display only. */
  function hmm(ms) {
    var v = Number(ms);
    if (!isFinite(v) || v < 0) v = 0;
    var m = Math.floor(v / 60000);
    var mm = m % 60;
    return Math.floor(m / 60) + ':' + (mm < 10 ? '0' : '') + mm;
  }
  /** "just now" under a minute, else minutes/hours — a duration, never a value. */
  function ago(iso, nowMs) {
    var t = Date.parse(String(iso || ''));
    if (!isFinite(t)) return '';
    var mins = Math.floor(Math.max(0, nowMs - t) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    return Math.floor(mins / 60) + ' h ago';
  }
  function monsterName(id) {
    var M = window.MONSTERS || {};
    return (id && Object.prototype.hasOwnProperty.call(M, id) && M[id] && M[id].name) || (id ? String(id) : 'a monster');
  }
  function stanceWord(k) {
    var f = window.huntStanceWord;
    return (typeof f === 'function' && f(k)) || (k ? String(k) : '');
  }
  /** share_bp as a percent: a unit change of one server number, never a sum. */
  function pctOfBp(bp) {
    var v = Number(bp);
    if (bp === null || typeof bp === 'undefined' || !isFinite(v)) return '—';
    return String(Math.round(v) / 100) + '%';
  }

  /* §6, the hunt-ended sentences by `stopped_by` (the view already cut any id
     off at ':'). The view names no leader, so the leader's line says "The
     leader" rather than inventing a name. */
  var ENDED = {
    leader:          'The leader ended the hunt.',
    too_few_hunters: 'The hunt ended: everyone else made camp or left. You\'re back to solo.',
    not_in_cohort:   'The hunt ended: party hunting was paused on the server. Nothing was lost.',
    gate:            'The hunt ended: party hunting was paused on the server. Nothing was lost.',
    stale_hunt:      'The hunt ended after going quiet.'
  };
  function endedSentence(by) { return ENDED[String(by || '')] || 'The hunt ended.'; }
  /* The receipt's "{why}" — the same reasons, as a clause. */
  var WHY = {
    leader:          'the leader ended it',
    too_few_hunters: 'everyone else made camp or left',
    not_in_cohort:   'party hunting was paused on the server',
    gate:            'party hunting was paused on the server',
    stale_hunt:      'it went quiet'
  };

  /** One event-strip line, §6 wording. A `stop` row is the hunt ending. */
  function eventLine(e) {
    if (!e) return '';
    var n = e.name || 'Adventurer';
    if (e.kind === 'drop') return n + ' made camp.';
    if (e.kind === 'rejoin') return n + ' rejoined the hunt.';
    if (e.kind === 'stop') return endedSentence(e.reason);
    return '';
  }

  /* The three tags (§2, §4). Hunting is the default and draws no tag. Camping
     is never red: it is not shame copy. */
  var STATE_TAG = {
    camping:       'Camping',
    rejoining:     'Rejoining',
    camping_today: 'Camping for today'
  };
  function campGlyph() {
    var H = window.HR;
    var svg = (H && typeof H.icon === 'function') ? H.icon('uiFlame', 12, 'currentColor') : '';
    return svg ? '<span class="party-camp-ic" aria-hidden="true">' + svg + '</span>' : '';
  }

  function huntMemberRow(m, nowMs) {
    var st = String((m && m.state) || 'hunting');
    var camping = st === 'camping' || st === 'camping_today';
    var tag = STATE_TAG[st]
      ? '<span class="party-h-tag is-' + esc(st) + '">' + (camping ? campGlyph() : '') + esc(STATE_TAG[st]) + '</span>' : '';
    var when = (camping || st === 'rejoining') && m.camped_at
      ? '<span class="party-h-when">made camp ' + esc(ago(m.camped_at, nowMs)) + '</span>' : '';
    var split = st === 'hunting' ? pctOfBp(m.share_bp) : '—';
    var today = (st === 'camping_today' && m.me === true)
      ? '<p class="party-h-today">You\'ve made camp 3 times today. You can rejoin tomorrow, or hunt solo.</p>' : '';
    return '<li class="party-h-member is-' + esc(st) + (m.me === true ? ' is-you' : '') + '">'
      + '<div class="party-m-line">'
      +   '<span class="party-m-name">' + esc((m && m.name) || 'Adventurer') + '</span>'
      +   (m.me === true ? '<span class="party-m-you">you</span>' : '') + tag + when
      + '</div>'
      + '<span class="party-h-split">' + esc(split) + '</span>'
      + '<div class="party-hp">'
      +   '<span class="party-hp-track"><span class="party-hp-fill" style="width:' + hpPct(m.hp, m.hp_max) + '%"></span></span>'
      +   '<span class="party-hp-num">' + num(m.hp) + ' / ' + num(m.hp_max) + '</span>'
      + '</div>'
      + '<span class="party-h-earn">+' + num(m.xp) + ' XP · +' + num(m.gold) + 'g this hunt</span>'
      + today
      + '</li>';
  }

  /* The five newest lines, newest first (the view already orders them), with a
     run of identical lines collapsed — the reaper writes one `stop` row per
     hunter, and "The hunt ended" four times over is one fact. */
  function eventStrip(events, nowMs) {
    var out = [];
    var last = null;
    (Array.isArray(events) ? events : []).forEach(function (e) {
      var line = eventLine(e);
      if (!line || line === last || out.length >= 5) return;
      last = line;
      out.push('<li class="party-h-ev"><span class="party-h-ev-t">' + esc(line) + '</span>'
        + '<span class="party-h-ev-at">' + esc(ago(e.at, nowMs)) + '</span></li>');
    });
    return out.length ? '<ul class="party-h-events">' + out.join('') + '</ul>' : '';
  }

  /** THE LEADER'S START: the solo picker's list by the solo picker's own reach
      rule (HearthriseMonsterPick, src/features/combat-render.js), filtered to
      the LOWEST member's server-stated combat level, and the solo stance
      picker's buttons (src/render/hunt-panel.js). No stop-rule picker: `stop`
      is the solo default, run until stopped. */
  function startControls(h, party, o, nowMs) {
    var MP = window.HearthriseMonsterPick;
    var levels = (Array.isArray(party.members) ? party.members : [])
      .map(function (m) { return Number(m && m.combat_level); })
      .filter(function (n) { return isFinite(n) && n > 0; });
    var low = levels.length ? Math.min.apply(null, levels) : 1;
    var list = (MP && typeof MP.inReach === 'function') ? MP.inReach(low) : [];
    var pick = o.pick || {};
    var chosen = pick.monster && list.some(function (x) { return x.id === pick.monster; })
      ? pick.monster : (list[0] && list[0].id);
    var stance = pick.stance || 'steady';
    var opts = list.map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (x.id === chosen ? ' selected' : '') + '>'
        + esc(x.name) + '</option>';
    }).join('');
    var waiting = h.waitUntilMs && h.waitUntilMs > nowMs;
    var disabled = (waiting || !chosen) ? ' disabled' : '';
    var stances = (typeof window.huntStanceButtonsHtml === 'function') ? window.huntStanceButtonsHtml(stance) : '';
    return '<div class="party-h-start">'
      + '<label class="party-invite-lab" for="party-hunt-monster">Monster</label>'
      + '<select id="party-hunt-monster" class="party-h-select">' + opts + '</select>'
      + '<span class="party-invite-lab">Stance</span>'
      + '<span class="hunt-stance-buttons party-h-stances">' + stances + '</span>'
      + '<button type="button" class="party-btn is-primary" data-party-act="hunt-start"'
      +   (chosen ? ' data-party-monster="' + esc(chosen) + '"' : '') + ' data-party-stance="' + esc(stance) + '"'
      +   disabled + '>Start hunt</button>'
      + '</div>';
  }

  /** The inline sentence under the button — never a toast (§1). A recovering
      wait restates its own countdown from the server's remaining_ms on every
      repaint, and says nothing once it reaches 0. */
  function huntNotice(h, nowMs) {
    var text = h.notice;
    if (h.waitUntilMs) {
      var P = window.HearthriseParty;
      text = (h.waitUntilMs > nowMs && P && typeof P.huntRefusalSentence === 'function')
        ? P.huntRefusalSentence('party_member_recovering', { member: h.waitMember, remaining_ms: h.waitUntilMs - nowMs })
        : null;
    }
    return text ? '<p class="party-notice party-h-notice" role="status">' + esc(text) + '</p>' : '';
  }

  function stopControl(asking) {
    if (!asking) {
      return '<button type="button" class="party-btn is-quiet" data-party-act="hunt-stop-ask">Stop hunt</button>';
    }
    return '<div class="party-confirm">'
      + '<span class="party-confirm-q">Stop the hunt for everyone? Everyone keeps what\'s earned.</span>'
      + '<button type="button" class="party-btn is-danger" data-party-act="hunt-stop-yes">Stop</button>'
      + '<button type="button" class="party-btn is-quiet" data-party-act="hunt-stop-no">Keep hunting</button>'
      + '</div>';
  }

  function huntCardHtml(h, party, o) {
    var nowMs = isFinite(o.nowMs) ? o.nowMs : Date.now();
    var hh = h || {};
    var view = hh.view || null;
    var hunt = view && view.hunt;
    var leader = party.role === 'leader';
    var body;
    if (hunt && hunt.live === true) {
      var started = Date.parse(String(hunt.started_at || ''));
      var head = '<p class="party-h-head">Hunting ' + esc(monsterName(hunt.active_id))
        + ' · ' + esc(stanceWord(hunt.stance))
        + ' · <span class="party-h-clock">' + esc(isFinite(started) ? hmm(nowMs - started) : '—') + '</span> so far'
        + ' · ' + num(hunt.kills) + ' kills</p>';
      var rows = (Array.isArray(view.members) ? view.members : []).map(function (m) { return huntMemberRow(m, nowMs); }).join('');
      body = head + '<ul class="party-h-roster">' + rows + '</ul>' + eventStrip(view.events, nowMs)
        + huntNotice(hh, nowMs)
        + (leader ? '<div class="party-h-foot">' + stopControl(!!o.stopAsking) + '</div>' : '');
    } else {
      var ended = hunt && hunt.ended_at ? '<p class="party-empty">' + esc(endedSentence(hunt.stopped_by)) + '</p>' : '';
      if (!view || view.channel_open !== true) {
        /* The resting state while the channel is closed — and before any read
           has said it is open (fail-safe "not unlocked"). No Start button. */
        body = ended + '<p class="party-empty">' + esc(CLOSED_LINE) + '</p>';
      } else if (leader) {
        body = ended + startControls(hh, party, o, nowMs) + huntNotice(hh, nowMs);
      } else {
        body = ended + '<p class="party-empty">Waiting for the leader to start a hunt.</p>';
      }
    }
    return '<section class="party-hunt' + (hh.busy ? ' is-busy' : '') + '">'
      + '<h3 class="party-sub">Hunt</h3>' + body + '</section>';
  }

  /* ── §5 THE RETURN RECEIPT'S PARTY LINE ──────────────────────────────────
     ONE sentence for the Home "While you were away" card, from the hunt read
     taken for this receipt (HearthriseParty.huntForReceipt). Every amount is
     the view's own per-hunt ledger sum for MY row, never recomputed; `off` is
     the solo receipt, whose `at` and `awayMs` place the absence. */
  function partyReceiptLine(view, off, nowMs) {
    if (!view || view.ok !== true || !view.hunt || !Array.isArray(view.members)) return '';
    var now = isFinite(nowMs) ? nowMs : Date.now();
    var me = null;
    view.members.forEach(function (m) { if (m && m.me === true) me = m; });
    if (!me) return '';
    var hunt = view.hunt;
    var awayFrom = (Number(off && off.at) || now) - (Number(off && off.awayMs) || 0);
    var endedMs = Date.parse(String(hunt.ended_at || ''));
    var startMs = Date.parse(String(hunt.started_at || ''));
    if (hunt.live !== true) {
      if (!isFinite(endedMs) || endedMs < awayFrom) return '';
      return 'The hunt ended ' + ago(hunt.ended_at, now) + ': ' + (WHY[String(hunt.stopped_by || '')] || 'it ended')
        + '. You earned +' + num(me.xp) + ' XP · +' + num(me.gold) + 'g with the party before it ended.';
    }
    var myDrop = null;
    (Array.isArray(view.events) ? view.events : []).forEach(function (e) {
      if (!myDrop && e && e.kind === 'drop' && e.name === me.name && Date.parse(String(e.at || '')) >= awayFrom) myDrop = e;
    });
    if (me.state === 'camping_today') return 'You made camp. The party is still hunting; you can rejoin tomorrow.';
    if (me.state === 'rejoining' || me.state === 'camping' || myDrop) {
      return 'You made camp ' + ago(me.camped_at || (myDrop && myDrop.at), now) + ' after your offline limit. '
        + 'The party kept hunting ' + monsterName(hunt.active_id) + '.'
        + (me.state === 'camping' ? '' : ' You\'re back in the hunt.');
    }
    return 'Party hunt: +' + num(me.xp) + ' XP · +' + num(me.gold) + 'g · ' + num(me.kills) + ' kills '
      + (isFinite(startMs) && startMs >= awayFrom ? 'while you were away.' : 'this hunt.');
  }

  /* ── THE WHOLE SCREEN ────────────────────────────────────────────────────
     view: the projection src/net/party.js parks in G._party, unchanged.
     opts: { nowMs, you, canon, asking, draft, town } — the wall clock, who I
     am (for the `you` marker only), the two-step confirm's position, the unsent
     invite draft and the realm view each member's doing is read from. None of them is a game value and none of them is persisted. */
  function partyPanelHtml(view, opts) {
    var v = view || {};
    var o = opts || {};
    var nowMs = isFinite(o.nowMs) ? o.nowMs : Date.now();
    var members = Array.isArray(v.members) ? v.members : [];
    var invites = Array.isArray(v.invites) ? v.invites : [];
    var rowOpts = {
      nowMs: nowMs, role: v.role,
      canon: o.canon,
      youCanon: (o.canon && o.you) ? o.canon(o.you) : null,
      doing: function (n) {
        var TP = window.HearthriseTownPanel;
        return (n && o.town && o.canon && TP && TP.doingOf) ? TP.doingOf(o.town, n, o.canon, nowMs) : '';
      }
    };

    var notice = v.notice
      ? '<p class="party-notice" role="status">' + esc(v.notice) + '</p>' : '';
    /* WHILE A VERB IS IN FLIGHT THE CONTROLS ARE INERT. Two clicks on "Form a
       party" are two DIFFERENT idempotency keys, so the server would honour
       both intents and refuse the second `already_in_party` — the player gets a
       refusal for doing nothing wrong. The fence belongs on the gesture. */
    var busy = v.busy ? ' is-busy' : '';

    /* OUT OF A PARTY THE HUNT IS ONE LINE AWAY: the card itself is drawn only
       for a member, because there is no hunt to view without a party. */
    var later = '<p class="party-later">Form a party to hunt together.</p>';

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
    /* NO ROSTER CAME BACK, so there is no length to print: the notice says the
       read failed and the head carries no count rather than a "0" the realm
       never stated (hr_party_view 405 / 25006, found live). */
    var countHtml = v.rosterUnread ? '' : '<span class="party-count">' + esc(count) + '</span>';

    return '<div class="party-panel' + busy + '">'
      + '<div class="party-head">'
      +   '<h3 class="party-sub">Your party</h3>'
      +   countHtml
      +   (v.role === 'leader' ? '<span class="party-role">leader</span>' : '')
      + '</div>'
      + notice
      + '<ul class="party-roster">'
      +   members.map(function (m) { return memberRow(m, rowOpts); }).join('')
      + '</ul>'
      + huntCardHtml(o.hunt || null, v, o)
      + (v.role === 'leader' ? inviteBox(o.draft || '') : '')
      + '<div class="party-foot">' + leaveControl(!!o.asking, huntIsLive(o.hunt)) + '</div>'
      + '</div>';
  }

  /* ══════════════════════════════════════════════════════════════════════
     THE LIVE HALF. Three pieces of view state, all of them scratch that dies
     with the tab: the unsent invite draft, the confirm's position, and nothing
     else. None of it is a game value, so none of it goes near G or the residue.
     ══════════════════════════════════════════════════════════════════════ */
  var draft = '';
  var asking = false;
  var stopAsking = false;
  var pick = { monster: null, stance: null };   // the leader's unsent choice
  var countdown = null;

  function host() { return document.getElementById('party-panel'); }

  function renderParty() {
    var el = host();
    if (!el) return null;
    var P = window.HearthriseParty;
    var view = (P && typeof P.getState === 'function') ? P.getState() : null;
    var I = window.HearthriseIdentity;
    var hunt = (P && typeof P.getHunt === 'function') ? P.getHunt() : null;
    var G = window.G;
    if (!pick.stance) {
      /* The solo stance the SERVER holds for this character, else the default. */
      pick.stance = (G && G._hunt && typeof G._hunt.stance === 'string') ? G._hunt.stance : 'steady';
    }
    if (!pick.monster && G && typeof G.activeMonster === 'string') pick.monster = G.activeMonster;
    var nowMs = Date.now();
    el.innerHTML = partyPanelHtml(view, {
      nowMs: nowMs,
      you: (I && typeof I.displayName === 'function') ? I.displayName() : null,
      canon: (I && typeof I.canon === 'function') ? I.canon : null,
      asking: asking,
      stopAsking: stopAsking,
      pick: pick,
      hunt: hunt,
      draft: draft,
      town: G && G._town
    });
    /* party_member_recovering's countdown repaints once a second while it runs
       and stops at 0 — no retry loop, the button simply comes back. */
    var waiting = !!(hunt && hunt.waitUntilMs && hunt.waitUntilMs > nowMs);
    if (waiting && !countdown) countdown = setInterval(renderParty, 1000);
    if (!waiting && countdown) { clearInterval(countdown); countdown = null; }
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
    if (name === 'hunt-start') {
      P.startHunt(el.getAttribute('data-party-monster'), el.getAttribute('data-party-stance'));
      return;
    }
    if (name === 'hunt-stop-ask') { stopAsking = true; renderParty(); return; }
    if (name === 'hunt-stop-no') { stopAsking = false; renderParty(); return; }
    if (name === 'hunt-stop-yes') { stopAsking = false; P.stopHunt(); return; }
  }

  /* ONE delegated listener on the host, wired once. The panel's innards are
     replaced on every read, so a listener per button would be re-bound on every
     repaint and is how a click quietly stops working. */
  function setupPartyPanel() {
    var el = host();
    if (!el || el.dataset.partyWired === '1') return;
    el.dataset.partyWired = '1';

    el.addEventListener('click', function (ev) {
      /* The solo stance picker's buttons carry `data-stance`, not an act. */
      var st = ev.target && ev.target.closest ? ev.target.closest('[data-stance]') : null;
      if (st) { ev.preventDefault(); pick.stance = st.getAttribute('data-stance'); renderParty(); return; }
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
    el.addEventListener('change', function (ev) {
      if (ev.target && ev.target.id === 'party-hunt-monster') { pick.monster = ev.target.value; renderParty(); }
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
        if (tab === 'party') {
          asking = false; stopAsking = false; renderParty(); P.setVisible(true);
          var T = window.HearthriseTown;
          if (T && typeof T.refreshTown === 'function') {
            T.refreshTown().then(function () {
              var pp = document.getElementById('panel-party');
              if (pp && pp.classList.contains('active')) renderParty();
            }).catch(function () {});
          }
        }
        else {
          P.setVisible(false);
          if (countdown) { clearInterval(countdown); countdown = null; }
        }
      });
    }
  }

  window.partyPanelHtml = partyPanelHtml;
  window.partyReceiptLine = partyReceiptLine;
  window.renderParty = renderParty;
  window.setupPartyPanel = setupPartyPanel;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupPartyPanel);
  } else {
    setupPartyPanel();
  }
}());
