// ════════════════════════════════════════════════════════════════════════
// src/render/luck-ledger.js — 'WHERE LUCK HIDES', the Bestiary's chase list
//
// One row per {lucky:true} drop in window.MONSTERS, grouped by the monster's
// tier: the item, its one hunting spot, the BASE odds (the same
// HearthriseLuckyFinds.baseOneIn the reveal sheet prints), the hunter's rumour
// and the SERVER's count in your bag. Renders only; decides nothing.
//
// Named rule = bestiary.js's own row predicate (G.bestiary kills or the
// server's trophy count), so the ledger never names a monster the list above
// still prints as '???'. The bag reads HearthriseAccrual.serverItemCount and
// never G.inventory (CLAUDE.md §6): null is the shared pending mark, 0 omits
// the line. html(opts) takes {named, count} overrides as the LUCKY-7 seam.
// ════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function namedDefault(mid) {
    var G = window.G || {};
    var e = G.bestiary && G.bestiary[mid];
    if (e && e.kills > 0) return true;
    var T = window.HearthriseTrophies;
    try { return !!(T && T.killsOfMonster(mid) > 0); } catch (err) { return false; }
  }
  function countDefault(id) {
    var A = window.HearthriseAccrual;
    return (A && typeof A.serverItemCount === 'function') ? A.serverItemCount(window.G, id) : null;
  }
  /* The shared pending mark (HearthriseBalance.countMarkup); the same shape
     built from balance.js's exported constants until that lane lands. */
  function countHtml(q) {
    var B = window.HearthriseBalance || {};
    if (typeof B.countMarkup === 'function') return B.countMarkup(q, { label: 'Not counted yet' });
    if (q != null) return esc(Number(q).toLocaleString('en-US'));
    return '<span class="' + (B.PENDING_CLASS || 'bal-pending') + '" aria-label="Not counted yet" title="Waiting for the realm to count this.">'
      + (B.UNKNOWN_TEXT || '—') + '</span>';
  }

  function rows() {
    var ms = window.MONSTERS || {};
    var out = [];
    Object.keys(ms).forEach(function (mid) {
      (ms[mid].drops || []).forEach(function (d) { if (d && d.lucky) out.push({ id: d.id, mid: mid, m: ms[mid] }); });
    });
    return out;
  }

  function rowHtml(r, named, count) {
    var LF = window.HearthriseLuckyFinds || {};
    var n = typeof LF.baseOneIn === 'function' ? LF.baseOneIn(r.id) : null;
    var odds = n ? 'about 1 in ' + n.toLocaleString('en-US') : '';
    var it = (window.ITEMS || {})[r.id];
    var art = '';
    try { art = (typeof window.itemArt === 'function' && window.itemArt(r.id, 34)) || ''; } catch (e) { art = ''; }
    var isNamed = !!named(r.mid);
    var rumour = isNamed ? (window.HearthriseLuckyRumours || {})[r.id] : '';
    var src = typeof window.itemSourceLine === 'function' ? String(window.itemSourceLine(r.id) || '') : '';
    var q = count(r.id);
    return '<div class="luck-row" data-luck-row="' + esc(r.id) + '">'
      + '<div class="luck-art">' + art + '</div>'
      + '<div class="luck-info"><b>' + esc((it && it.n) || r.id) + '</b>'
      + '<small>' + esc((isNamed ? r.m.name : '???') + (odds ? ' · ' + odds : '')) + '</small>'
      + (rumour ? '<i class="luck-rumour">' + esc(rumour) + '</i>' : '')
      + (/^Crafted/.test(src) ? '<small class="luck-bench">Also made at the bench</small>' : '')
      + (q === 0 ? '' : '<small class="luck-bag">In your bag: ' + countHtml(q) + '</small>')
      + '</div></div>';
  }

  function html(opts) {
    var o = opts || {};
    var named = o.named || namedDefault;
    var count = o.count || countDefault;
    var all = rows();
    var tiers = {};
    all.forEach(function (r) { (tiers[r.m.tier] = tiers[r.m.tier] || []).push(r); });
    var body = Object.keys(tiers).sort(function (a, b) { return a - b; }).map(function (t) {
      return '<div class="luck-tier"><h4>Tier ' + esc(t) + '</h4>'
        + tiers[t].map(function (r) { return rowHtml(r, named, count); }).join('') + '</div>';
    }).join('');
    return '<summary>Where luck hides · ' + all.length + ' named finds</summary>'
      + '<p class="luck-intro">Each of these drops at only one hunting spot. The realm rolls for it on every kill there, watching or away.</p>'
      + body;
  }

  function paint() {
    var el = document.getElementById('best-luck');
    if (el) el.innerHTML = html();
  }

  window.HearthriseLuckLedger = { html: html, paint: paint };
})();
