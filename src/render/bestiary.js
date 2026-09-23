// ============================================================
// src/render/bestiary.js — Bestiary modal (render layer)
//
// FOURTH render-layer strangler-fig extraction out of src/legacy.js
// (structural track, 2026-08-18). See docs/design/render-extraction-pattern.md
// for the playbook every extraction follows.
//
// WHAT THIS IS: the READ-ONLY Bestiary modal (openBestiary) — a self-contained
// presentation surface that reads window.MONSTERS (the read-only published
// monster catalogue) + G.bestiary (per-player kill/discovery state) and paints a
// sorted list of discovered/undiscovered rows. It reuses the shared .ach-overlay
// / .ach-modal shell (same as Achievements) plus its own .bestiary-* selectors.
// It computes and mutates NOTHING authoritative — the kill tracking that WRITES
// G.bestiary (the killMonster wrapper + the milestone-notify logic) is LOGIC and
// stays in legacy.js on purpose, exactly the render/logic seam Achievements used
// (checkAchievements stayed; only the toast+modal moved). Blast radius is one
// dialog; zero risk to the economy or save path.
//
// PURE REFACTOR. Byte-for-byte the same DOM and behaviour that used to live at
// legacy.js window.openBestiary — moved out, not redesigned. There are NO
// hardcoded theme colours in this JS: the only inline styles are colourless
// (font-size:calc(19px * var(--ui-scale, 1)) on the emoji fallback and
// margin-top:12px;width:100% on the Close button), and the 📖 glyph is
// pre-existing content. All colour lives in the .ach-* / .bestiary-* selectors
// in src/styles/legacy.css, which are already tokenised (var(--ink),
// var(--gold-2), var(--line-soft)) and left unchanged.
//
// Globals are read via window.* (the established src/features/* convention),
// resolved at call time so this script may load in any order after legacy.js.
// openBestiary is re-exported onto window because two inline
// onclick="openBestiary()" handlers (the profile buttons row + the profile
// toolbar) invoke it from legacy.js template strings.
// ============================================================
(function () {
  'use strict';

  window.openBestiary = function () {
    var G = window.G || {};
    var MONSTERS = window.MONSTERS;

    var ov = document.getElementById('best-overlay');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'best-overlay'; ov.className = 'ach-overlay';
      ov.innerHTML = '<div class="ach-modal" onclick="event.stopPropagation()"><h2>Bestiary</h2><div id="best-charms" class="charm-strip"></div><div id="best-list" class="bestiary-list"></div><button class="btn" onclick="document.getElementById(\'best-overlay\').classList.remove(\'show\')" style="margin-top:12px;width:100%">Close</button></div>';
      ov.addEventListener('click', function (e) { if (e.target === ov) ov.classList.remove('show'); });
      document.body.appendChild(ov);
    }
    G.bestiary = G.bestiary || {};
    var list = document.getElementById('best-list');
    if (typeof MONSTERS === 'undefined' || !MONSTERS) { list.innerHTML = '<div class="muted">Monsters not loaded.</div>'; ov.classList.add('show'); return; }
    /* BESTIARY CHARMS (phase 1). Resolved at CALL TIME, unwired-safe: without
       the ESM half this is null and every charm affordance is simply absent —
       the modal renders exactly as it did before. Fail-safe, never a gate. */
    var C = window.HearthriseCharms || null;
    /* BESTIARY TROPHIES (docs/design/BESTIARY_LADDER.md) — the LONG ladder,
       resolved at CALL TIME and unwired-safe exactly like the charms above:
       without the ESM half this is null and every trophy affordance is simply
       absent. Fail-safe, never a gate. */
    var T = window.HearthriseTrophies || null;
    paintCharmStrip(C);
    list.innerHTML = Object.entries(MONSTERS).map(function (kv) {
      var id = kv[0], m = kv[1];
      var entry = G.bestiary[id] || { kills: 0 };
      var disc = entry.kills > 0;
      var path = window._monsterIcon && window._monsterIcon[id];
      /* was  — the monster's data emoji, in a bestiary of 111 rows. */
      var img = path ? '<img src="' + path + '" />' : window.monsterFallbackIcon(id, 26);
      /* The element weakness, printed only once the class is STUDIED (rank ≥1)
         — that is the charm's whole reward, and for Extra Dimensional
         (`hiddenElement`) it is the only door. '' below rank 1. */
      var el = (disc && C) ? C.elementLineHtml(id) : '';
      /* ⚠ THE TROPHY LINE READS THE *SERVER'S* COUNT, NOT `entry.kills`.
         `entry` is G.bestiary — the locally-written residue map the row's `×`
         figure has always come from — and gating a claim on it would put a live
         Claim button on a trophy the server answers `not_yet` to. That is the
         residue-ahead class CLAUDE.md §6 names, and it is the one thing this
         surface must not do. So every trophy affordance below goes through
         window.HearthriseTrophies, which reads only the mirrored server block
         and fails safe to "no stage, not claimed, not claimable".
         The badge/next/claim trio is rendered for an UNDISCOVERED row too when
         the server has counted kills for it: `disc` is a residue fact, and
         hiding a trophy the server holds behind a local flag is the same bug
         pointed the other way. */
      var tKills = T ? T.killsOfMonster(id) : 0;
      var trophy = (T && tKills > 0)
        ? ('<div class="br-trophy">' + T.badgeHtml(id) + T.nextThresholdHtml(id)
           + T.claimButtonHtml(id) + '</div>')
        : '';
      /* The server's count wins the `×` too when it has one: two numbers for
         one fact on one row is how a player learns not to trust either. */
      var shown = tKills > 0 ? tKills : entry.kills;
      return '<div class="bestiary-row ' + (disc || tKills > 0 ? 'discovered' : 'undiscovered') + '">' +
        '<div class="br-icon">' + img + '</div>' +
        '<div class="br-info"><b>' + (disc || tKills > 0 ? m.name : '???') + '</b><small>Tier ' + m.tier + (disc ? ' · ' + m.hp + ' HP' : '') + '</small>' + el + trophy + '</div>' +
        '<div class="br-kills">' + (shown > 0 ? shown.toLocaleString() + '×' : '—') + '</div>' +
      '</div>';
    }).join('');
    ov.classList.add('show');
  };

  /* ── THE CHARM STRIP ────────────────────────────────────────────────────
     One chip per monster class the SERVER has counted kills for: the class
     name, the rank badge, and the "next charm at N kills" affordance. Classes
     with zero server-counted kills are omitted rather than shown at zero — a
     wall of eleven "0 kills" chips teaches nothing, and the row a player has
     actually worked on is the one worth printing.

     Reads window.HearthriseCharms, which reads `G._bestiaryCharms` (the server
     block, scratch, `_`-prefixed) and NEVER `G.bestiary` — that is the
     locally-written residue field, and gating a capability on it is the
     residue-ahead bug class. No counters mirrored yet ⇒ one honest line saying
     so, never a rank. */
  function paintCharmStrip(C) {
    var strip = document.getElementById('best-charms');
    if (!strip) return;
    if (!C) { strip.innerHTML = ''; return; }
    /* The class list, its order and its display names are DERIVED from the
       taxonomy + roster by C.charmClasses() — not listed here. A hardcoded
       eleven-string list in a renderer is a third copy of the taxonomy and the
       first one to go stale when the twelfth class lands. */
    var rows = C.charmClasses();
    var chips = rows.map(function (r) {
      return '<div class="charm-chip' + (r.rank ? ' is-ranked' : '') + '">'
        + '<span class="cc-name">' + r.name + '</span>'
        + C.badgeHtml(r.cls)
        + '<span class="cc-kills">' + r.kills.toLocaleString() + ' killed</span>'
        + C.nextThresholdHtml(r.cls)
        + '</div>';
    });
    strip.innerHTML = chips.length
      ? chips.join('')
      : '<div class="muted charm-empty">No charms yet — 25 kills in any monster class earns your first.</div>';
  }

  console.log('Bestiary modal: loaded');
})();
