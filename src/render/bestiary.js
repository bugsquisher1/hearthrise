// ============================================================
// src/render/bestiary.js — the Bestiary (render layer, the Journal's Bestiary tab)
//
// The READ-ONLY monster list: window.MONSTERS (the published catalogue) plus
// the per-player record, painted as one row per monster with the charm strip
// above it. It computes and mutates NOTHING authoritative. Every count on a row
// is the SERVER's (window.HearthriseTrophies reads the mirrored server block and
// fails safe); G.bestiary is the locally-written residue and is read for one
// thing only, whether a row is named. The kill-tracking LOGIC that writes it
// stays in legacy.js. All colour lives in the .bestiary-* selectors.
//
// window.HearthriseBestiary.html() is the whole tab; a named row carries
// data-jr-mon so the Journal can open its drop table.
// ============================================================
(function () {
  'use strict';

  function html() {
    var G = window.G || {};
    var MONSTERS = window.MONSTERS;

    G.bestiary = G.bestiary || {};
    if (!MONSTERS) return '<div class="muted">Monsters not loaded.</div>';
    /* BESTIARY CHARMS (phase 1). Resolved at CALL TIME, unwired-safe: without
       the ESM half this is null and every charm affordance is simply absent —
       the list renders without them. Fail-safe, never a gate. */
    var C = window.HearthriseCharms || null;
    /* BESTIARY TROPHIES (docs/design/BESTIARY_LADDER.md) — the LONG ladder,
       resolved at CALL TIME and unwired-safe exactly like the charms above:
       without the ESM half this is null and every trophy affordance is simply
       absent. Fail-safe, never a gate. */
    var T = window.HearthriseTrophies || null;
    var pending = '<span class="bal-pending" aria-label="Not counted yet" title="Waiting for the realm to count this.">—</span>';
    var rows = Object.entries(MONSTERS).map(function (kv) {
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
      /* The `×` is the SERVER's count or the pending dash, never the residue:
         two numbers for one fact is how a player learns to trust neither. */
      var countsKnown = !!(T && typeof T.countsKnown === 'function' && T.countsKnown());
      var named = disc || tKills > 0;
      var note = (window.HearthriseMonsterNotes || {})[id];
      /* The note is a full-card-width teaser BELOW the row, clamped to two
         lines — never inside .br-info, whose ~76px column glued it to the
         stats and stretched the card one word per line. The full text
         rides title/aria-label; the collection log prints it whole. */
      var noteHtml = (named && typeof note === 'string')
        ? ('<small class="br-note" title="' + note + '" aria-label="' + note + '">' + note + '</small>') : '';
      return '<div class="bestiary-row ' + (named ? 'discovered' : 'undiscovered') + '"' +
        (named ? ' data-jr-mon="' + id + '" role="button" tabindex="0" title="' + m.name + ': drop table"' : '') + '>' +
        '<div class="br-icon">' + img + '</div>' +
        '<div class="br-info"><b>' + (named ? m.name : '???') + '</b><small>Tier ' + m.tier + (disc ? ' · ' + m.hp + ' HP' : '') + '</small>' + el + trophy + '</div>' +
        '<div class="br-kills">' + (!countsKnown ? pending : (tKills > 0 ? tKills.toLocaleString() + '×' : '—')) + '</div>' + noteHtml +
      '</div>';
    }).join('');
    return '<div id="best-charms" class="charm-strip">' + charmStripHtml(C) + '</div><div id="best-list" class="bestiary-list">' + rows + '</div>';
  }
  window.HearthriseBestiary = { html: html };

  /* ── THE CHARM STRIP ────────────────────────────────────────────────────
     One chip per monster class the SERVER has counted kills for: the class
     name, the rank badge, and the "next charm at N kills" affordance. Classes
     with zero server-counted kills are omitted rather than shown at zero — a
     wall of eleven "0 kills" chips teaches nothing, and the row a player has
     actually worked on is the one worth printing.

     Reads window.HearthriseCharms, which reads `G._bestiaryCharms` (the server
     block, scratch, `_`-prefixed) and NEVER `G.bestiary` — that is the
     locally-written residue field, and gating a capability on it is the
     residue-ahead bug class. No counters mirrored yet ⇒ a pending line, never "No charms". */
  function charmStripHtml(C) {
    if (!C) return '';
    if (typeof C.countersKnown === 'function' && !C.countersKnown()) {
      return '<div class="muted charm-pending" data-charm-pending="1">Charm kills not counted yet <span class="bal-pending" aria-label="Not counted yet" title="Waiting for the realm to count this.">—</span></div>';
    }
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
    return chips.length
      ? chips.join('')
      : '<div class="muted charm-empty">No charms yet — 25 kills in any monster class earns your first.</div>';
  }

  console.log('Bestiary: loaded');
})();
