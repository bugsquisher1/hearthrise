// ════════════════════════════════════════════════════════════════════════
// src/features/item-inspect.js — INSPECT THE REQUIREMENT (b372)
//
// KD420, via Tyler, verbatim: "you can right click and inspect items in your
// bag. It clearly shows like where they are from... I'd like to do something
// similar with requirements (ie clicking on the maple planks required for my
// house upgrade and have it show where it's acquired.)"
//
// He is describing a dead end, and it is the most common one this game has.
// Every requirement list in Hearthrise — the property upgrade, a room rung, a
// recipe's inputs, a dungeon key, a proof bounty — names an item and then
// STOPS. "50 Maple Plank · 0 / 50" is a wall with no door in it: the game has
// already computed, in the b242 reverse index, that a Maple Plank is sawn at
// Crafting 45 from a Maple Log, and it simply never offers that fact at the
// one moment the player is asking the question.
//
// So: a requirement is a LINK. One tap (never a right-click — this has to work
// the same on a phone) opens the SAME item flyout the bag opens, because two
// popups that answer the same question would immediately drift apart.
//
// ── THE SEAM ────────────────────────────────────────────────────────────
//   window.hrInspectAttrs(itemId)            → attribute string to splice into
//                                              a chip a renderer already emits
//   window.hrInspectSpan(itemId, html, cls)  → a wrapped span, for bare text
//   window.hrInspectHint(itemId)             → the ' · tap for its source'
//                                              suffix, for a title the caller
//                                              authors
// Renderers stay renderers. Nothing here knows what a room or a recipe is, and
// a NEW requirement surface becomes inspectable by emitting the attrs — there
// is no registry to update.
//
// ── WHY A CAPTURE-PHASE HANDLER ─────────────────────────────────────────
// Requirement chips live INSIDE bigger click targets: an activity tile whose
// whole body starts the craft, a room card whose whole body opens the modal.
// Listening in capture at the document and stopping propagation is what makes
// "tap the plank" mean the plank and not the tile around it. A bubble-phase
// listener could not win that, and duplicating a handler per surface would.
//
// ── WHY THE Z-INDEX IS COMPUTED ─────────────────────────────────────────
// `.inv-detail` sits at z-index 1500 because it was only ever opened from the
// bag. Requirements live in overlays that are far above it (the room modal's
// scrim is 100000, the Recipe Book 3000), so opening the flyout from one would
// have drawn it UNDERNEATH the thing that launched it — a popup you cannot
// see. Rather than start a z-index arms race in the stylesheet (which would
// then out-stack the account gate at 100001), the flyout is lifted to just
// above the overlay it was actually launched from, per open, and dropped back
// to the stylesheet's value on every ordinary bag open.
// ════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var ATTR = 'data-inspect-item';
  /* A ceiling, so a single absurd computed z-index in a third-party or future
     surface cannot push this to the integer limit and strand it there. It sits
     ABOVE every overlay this game actually declares (the highest is 999999 in
     audit-overrides.css) — an earlier draft capped at 99900 to stay under the
     bag's context menu, which was wrong twice over: the room modal's scrim is
     100000, so the cap silently reproduced the very bug the lift exists to
     fix, and the context menu is only ever raised from a BAG tile, where no
     lift is applied at all. */
  var Z_CEIL = 1000000;
  var Z_FLOOR = 1500;   // matches .inv-detail in legacy.css

  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* An id is inspectable only if the flyout can actually say something about
     it. `gold` is the one that matters: it is a legitimate requirement key on
     nearly every cost row in the game and it is NOT an item, so it must render
     as ordinary text rather than as a link that opens nothing. */
  function inspectable(id) {
    if (!id || id === 'gold' || id === 'gems') return false;
    return !!(window.ITEMS && window.ITEMS[id]);
  }

  function attrs(id) {
    if (!inspectable(id)) return '';
    return ' ' + ATTR + '="' + escAttr(id) + '" role="button" tabindex="0"';
  }

  function hint(id) {
    return inspectable(id) ? ' — tap to see where it comes from' : '';
  }

  function span(id, html, cls) {
    var c = cls ? ' class="' + escAttr(cls) + '"' : '';
    if (!inspectable(id)) return c ? '<span' + c + '>' + html + '</span>' : String(html);
    return '<span' + c + attrs(id) + ' title="' +
      escAttr(((window.ITEMS[id] || {}).n || id) + hint(id)) + '">' + html + '</span>';
  }

  /* ── The lift ──────────────────────────────────────────────────────────
     Walk the ancestors of the thing that was tapped and take the largest
     z-index any of them declares. That is the overlay the player is looking
     at, whatever it happens to be — no list of overlay ids to keep current. */
  function zAbove(el) {
    var z = 0;
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      var v = parseInt(window.getComputedStyle(n).zIndex, 10);
      if (!isNaN(v) && v > z) z = v;
    }
    return Math.min(Z_CEIL, Math.max(Z_FLOOR, z + 1));
  }

  /* ── The wrapper ───────────────────────────────────────────────────────
     Two jobs, both of which belong to EVERY open and not just ours:
       1. drop any lift a previous inspect applied, so a bag open is never
          left stacked above an overlay that has since closed;
       2. record which item is on screen. `window._invDetailId` has been read
          by legacy.js's refresh-on-inventory-change since b240 and was never
          written by anything — so the flyout silently stopped refreshing.
          One assignment revives a guard that was already there. */
  function wrap() {
    var f = window.openInvDetail;
    if (typeof f !== 'function' || f.__hrInspect) return;
    var w = function (id) {
      var ov = document.getElementById('inv-detail-overlay');
      if (ov) ov.style.zIndex = '';
      window._invDetailId = id;
      return f.apply(this, arguments);
    };
    w.__hrInspect = true;
    w.__inner = f;
    window.openInvDetail = w;
  }

  function open(el, id) {
    wrap();
    if (typeof window.openInvDetail !== 'function' || !inspectable(id)) return false;
    window.openInvDetail(id);
    var ov = document.getElementById('inv-detail-overlay');
    if (ov && ov.classList.contains('show')) ov.style.zIndex = String(zAbove(el));
    return true;
  }

  function targetOf(e) {
    var t = e.target;
    if (!t || !t.closest) return null;
    return t.closest('[' + ATTR + ']');
  }

  document.addEventListener('click', function (e) {
    var el = targetOf(e);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    open(el, el.getAttribute(ATTR));
  }, true);

  /* Keyboard parity — the chips carry role="button" and tabindex, so they must
     answer the two keys a button answers or the role is a lie to a screen
     reader. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var el = targetOf(e);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    open(el, el.getAttribute(ATTR));
  }, true);

  /* A long-press on a requirement chip must NOT raise the bag's sell/equip
     context menu — the item is not in your bag and half those verbs are
     nonsense there. inv-context-menu.js matches on `[data-item-id]`, which is
     deliberately a different attribute from ours, but a chip nested inside a
     tile that HAS one would still match by closest(). Swallow it here, in
     capture, before that listener runs. */
  document.addEventListener('contextmenu', function (e) {
    var el = targetOf(e);
    if (!el) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open(el, el.getAttribute(ATTR));
  }, true);

  window.hrInspectAttrs = attrs;
  window.hrInspectSpan = span;
  window.hrInspectHint = hint;
  window.HearthriseItemInspect = {
    attrs: attrs, span: span, hint: hint, open: open,
    inspectable: inspectable, ATTR: ATTR, _zAbove: zAbove,
  };
  wrap();
  console.log('[item-inspect] requirement chips are inspectable');
})();
