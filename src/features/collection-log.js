// ============================================================
// src/features/collection-log.js  — Collection Log (completionism)
//
// The classic long-tail retention engine (Melvor/OSRS): a browsable record
// of every monster you've slain and every item you've found, with a running
// completion % and milestone rewards. The undiscovered "???" slots create
// pull ("what drops from the Lich?"), and every entry already feeds Renown.
//
// Reads existing tracking with zero new bookkeeping:
//   • Monsters  → G.bestiary  { id: {kills, firstKill} }   (all MONSTERS)
//   • Items     → G.collection{ id: count }                 (all ITEMS)
//
// Milestones (G.collectionLog.claimed[]) hand out a reward the first time you
// cross a completion threshold — the reason to chase 100%.
//
// Classic IIFE (window.HearthriseCollection), loaded after legacy.js.
// ============================================================
(function () {
  'use strict';

  /* The log is a WALL of icons — it was the densest emoji surface left in the
     game (❔ for undiscovered, the data emoji for everything else). Cells now
     draw painted art via itemArt/monsterArt, and every remaining slot goes
     through this one gilt-glyph helper. Never a character. */
  function _clGly(key, px, col) {
    return (window.HR && window.HR.icon)
      ? (window.HR.icon(key, px || 13, col || 'currentColor') || '')
      : '';
  }

  var MILESTONES = [
    { id: 'hunter10',  label: 'Novice Hunter',   test: function (s) { return s.mon.found >= 10; },        reward: { gold: 2000 } },
    { id: 'hunterAll', label: 'Bestiary Master',  test: function (s) { return s.mon.total && s.mon.found >= s.mon.total; }, reward: { gold: 50000, gems: 25 } },
    { id: 'collect50', label: 'Collector',        test: function (s) { return s.item.found >= 50; },       reward: { gold: 5000 } },
    { id: 'collect100', label: 'Hoarder',         test: function (s) { return s.item.found >= 100; },      reward: { gold: 15000, gems: 15 } }
  ];

  function ensureState(G) {
    G = G || window.G; if (!G) return null;
    if (!G.collectionLog || typeof G.collectionLog !== 'object') G.collectionLog = { claimed: [] };
    if (!Array.isArray(G.collectionLog.claimed)) G.collectionLog.claimed = [];
    return G.collectionLog;
  }

  function getStats(G) {
    G = G || window.G;
    var MON = window.MONSTERS || {}, ITEMS = window.ITEMS || {};
    var monTotal = Object.keys(MON).length;
    var monFound = 0, best = G.bestiary || {};
    for (var m in MON) { if (best[m] && (best[m].kills || 0) > 0) monFound++; }
    var itemTotal = Object.keys(ITEMS).length;
    var col = G.collection || {}, itemFound = 0;
    for (var it in ITEMS) { if (col[it]) itemFound++; }
    return {
      mon: { found: monFound, total: monTotal, pct: monTotal ? monFound / monTotal : 0 },
      item: { found: itemFound, total: itemTotal, pct: itemTotal ? itemFound / itemTotal : 0 },
      overall: (monTotal + itemTotal) ? (monFound + itemFound) / (monTotal + itemTotal) : 0
    };
  }

  function claimable(G) {
    G = G || window.G; var s = ensureState(G); if (!s) return [];
    var st = getStats(G);
    return MILESTONES.filter(function (m) { return m.test(st) && s.claimed.indexOf(m.id) < 0; });
  }

  function claimMilestone(id, G) {
    G = G || window.G; var s = ensureState(G); if (!s) return null;
    if (s.claimed.indexOf(id) >= 0) return null;
    var m = null; for (var i = 0; i < MILESTONES.length; i++) if (MILESTONES[i].id === id) m = MILESTONES[i];
    if (!m) return null;
    var st = getStats(G); if (!m.test(st)) return null;
    var rw = m.reward || {};
    /* SERVER-CREDITED (2026-08-22-collection-claim.sql). hr_claim_milestone
       RE-DERIVES the DISTINCT monster/item count from the server's own
       hr_bestiary_of / hr_collection_of projections, owns the gold+gems amount,
       once-guards a player_progress kind='collection' claim row per milestone,
       and journals it (kind='collection'). The b411 arm-safety DEFER is GONE —
       the claim proceeds and the local gold/gems write is a GATED PREDICTION the
       server envelope reconciles: pre-arm it credits locally (the server credit
       is dark), under arm it no-ops and the server's player_state value arrives
       on the next envelope. Fire-and-forget; the server once-guard is the
       authority and a replay returns already_claimed with no second credit. */
    try {
      if (window.HearthriseGoalClaim && typeof window.HearthriseGoalClaim.claimMilestone === 'function') {
        var _p = window.HearthriseGoalClaim.claimMilestone(id); if (_p && _p.catch) _p.catch(function () {});
      }
    } catch (e) {}
    var _mayGold = !window.clientMayWriteRecordField || window.clientMayWriteRecordField('gold');
    var _mayGems = !window.clientMayWriteRecordField || window.clientMayWriteRecordField('gems');
    if (rw.gold && _mayGold) G.gold = (G.gold || 0) + rw.gold;   // prediction; no-op under arm
    if (rw.gems && _mayGems) G.gems = (G.gems || 0) + rw.gems;   // prediction; no-op under arm
    s.claimed.push(id);
    try { if (typeof window.saveLocal === 'function') window.saveLocal(); } catch (e) {}
    try { if (typeof window.updateTopbar === 'function') window.updateTopbar(); } catch (e) {}
    return rw;
  }

  function fmt(n) { return (n || 0).toLocaleString(); }

  function ensureStyle() {
    if (document.getElementById('hr-cl-css')) return;
    var s = document.createElement('style');
    s.id = 'hr-cl-css';
    s.textContent = [
      '.hr-cl-scrim{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px}',
      '.hr-cl-wrap{background:var(--bg-1,#1a1f2e);border:1px solid var(--line,#b8893e);border-radius:14px;width:100%;max-width:520px;max-height:88vh;overflow:auto;color:var(--ink,#e9e2cf);box-shadow:0 18px 50px -12px rgba(0,0,0,.7);font-family:var(--f-ui,system-ui,sans-serif)}',
      '.hr-cl-top{padding:16px 18px 12px;position:sticky;top:0;background:var(--bg-1,#1a1f2e);border-bottom:1px solid var(--line-soft,rgba(122,94,58,.2));z-index:2}',
      '.hr-cl-hn{font-family:var(--f-display,serif);font-size:calc(21px * var(--ui-scale, 1));font-weight:800;color:var(--gold,#e0a64a)}',
      '.hr-cl-eyebrow{font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3,#a5896a)}',
      '.hr-cl-x{position:absolute;top:12px;right:14px;background:var(--bg-0,#0f1320);border:1px solid var(--line-soft,rgba(122,94,58,.25));color:var(--ink-2,#cbb890);width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:calc(16px * var(--ui-scale, 1))}',
      '.hr-cl-bar{height:8px;border-radius:99px;background:var(--bg-0,#0f1320);border:1px solid var(--line-soft,rgba(122,94,58,.25));overflow:hidden;margin:9px 0 3px}',
      '.hr-cl-bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--gold-2,#c8862a),var(--gold,#e0a64a))}',
      '.hr-cl-tabs{display:flex;gap:6px;padding:10px 12px 0}',
      '.hr-cl-tab{flex:1;text-align:center;padding:8px;border-radius:9px 9px 0 0;border:1px solid transparent;cursor:pointer;font-weight:700;font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3,#a5896a)}',
      '.hr-cl-tab.on{color:var(--ink,#e9e2cf);background:color-mix(in srgb,var(--gold,#e0a64a) 10%,transparent);border-color:var(--line-soft,rgba(122,94,58,.25))}',
      '.hr-cl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:7px;padding:12px}',
      '.hr-cl-cell{aspect-ratio:1;border-radius:9px;border:1px solid var(--line-soft,rgba(122,94,58,.25));background:var(--bg-2,#2c2216);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:3px;text-align:center;overflow:hidden}',
      '.hr-cl-cell.miss{opacity:.4;filter:grayscale(1)}',
      '.hr-cl-ic{font-size:calc(25px * var(--ui-scale, 1));line-height:1}',
      '.hr-cl-nm{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3,#a5896a);line-height:1.05;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}',
      '.hr-cl-sec{padding:2px 12px;font-size:calc(14.5px * var(--ui-scale, 1));font-weight:700;color:var(--gold-2,#c8862a);text-transform:uppercase;letter-spacing:.08em}',
      '.hr-cl-ms{display:flex;align-items:center;gap:10px;padding:9px 12px;margin:6px 12px;border:1px solid var(--gold,#e0a64a);border-radius:10px;background:color-mix(in srgb,var(--gold,#e0a64a) 10%,transparent)}',
      '.hr-cl-msb{flex:1;font-size:calc(14.5px * var(--ui-scale, 1))}',
      '.hr-cl-claim{border:none;border-radius:8px;padding:7px 13px;font-weight:800;font-size:calc(14.5px * var(--ui-scale, 1));cursor:pointer;background:linear-gradient(180deg,var(--gold,#f0b860),var(--gold-2,#d99c40));color:var(--bg-0,#20160a)}',
      '.hr-cl-detail{padding:14px}',
      /* the detail sheet's hero slot. Was an inline 46px font-size holding an
         emoji; it holds painted art or a glyph now, so it needs a box. */
      '.hr-cl-hero{display:flex;align-items:center;justify-content:center;min-height:52px;margin-bottom:4px}',
      '.hr-cl-hero img{width:52px;height:52px;object-fit:contain}',
      '.hr-cl-ic img{width:26px;height:26px;object-fit:contain}',
      '.hr-cl-drop img{width:18px;height:18px;object-fit:contain;vertical-align:-4px}',
      '.hr-cl-stats{padding:2px 12px;font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-2,#cbb890);line-height:1.5}',
      '.hr-cl-drop{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 9px;border-radius:7px;background:var(--bg-2,#2c2216);margin:4px 0;font-size:calc(14.5px * var(--ui-scale, 1))}',
      '.hr-cl-drop b{color:var(--gold,#e0a64a);font-variant-numeric:tabular-nums}',
      '.hr-cl-drop em{color:var(--ink-3,#a5896a);font-style:normal;font-size:calc(14.5px * var(--ui-scale, 1))}'
    ].join('');
    document.head.appendChild(s);
  }

  function cell(icon, name, found) {
    return '<div class="hr-cl-cell' + (found ? '' : ' miss') + '" title="' + (name || '') + '">' +
      '<div class="hr-cl-ic">' + (found ? (icon || _clGly('uiChest', 22)) : _clGly('uiSearch', 22)) + '</div>' +
      '<div class="hr-cl-nm">' + (found ? name : '???') + '</div></div>';
  }
  // Bestiary cell — clickable into a drop-table detail when discovered.
  function cellMon(id, icon, name, found) {
    return '<div class="hr-cl-cell' + (found ? '' : ' miss') + '"' + (found ? ' data-mon="' + id + '" style="cursor:pointer"' : '') + ' title="' + (name || '') + '">' +
      '<div class="hr-cl-ic">' + (found ? (icon || _clGly('uiChest', 22)) : _clGly('uiSearch', 22)) + '</div>' +
      '<div class="hr-cl-nm">' + (found ? name : '???') + '</div></div>';
  }
  function monDetailHtml(id) {
    var M = (window.MONSTERS || {})[id]; if (!M) return '';
    var b = (window.G.bestiary || {})[id] || {};
    var drops = (M.drops || []).map(function (d) {
      var it = (window.ITEMS || {})[d.id];
      var pct = (d.ch || 0) * 100;
      var found = window.G.collection && window.G.collection[d.id];
      /* b293 (Tyler/Xarnathos): a recipe scroll is READ ON PICKUP — it never sits in
         the bag — so "not yet found" was the only signal and a learned recipe looked
         identical to one you'd never seen. Say plainly that you already know it. */
      var learned = !!(it && it.recipe && window.G.unlockedRecipes && window.G.unlockedRecipes[d.id]);
      var mark = learned ? ' <em class="hr-cl-learned">· recipe learned</em>'
                         : (found ? '' : ' <em>· not yet found</em>');
      return '<div class="hr-cl-drop"><span>' + window.itemArt(d.id, 18) + ' ' + (it ? it.n : d.id) + mark + '</span><b>' + (pct < 1 ? '<1' : Math.round(pct)) + '%</b></div>';
    }).join('') || '<div class="hr-cl-drop"><span>No drops</span></div>';
    return '<div class="hr-cl-detail">' +
      '<button class="hr-cl-claim" data-cl-back="1" style="margin-bottom:12px">← Back to log</button>' +
      '<div style="text-align:center"><div class="hr-cl-hero">' + window.monsterArt(id, 46) + '</div>' +
      '<div class="hr-cl-hn" style="font-size:calc(23px * var(--ui-scale, 1))">' + M.name + '</div>' +
      '<div class="hr-cl-eyebrow">Tier ' + (M.tier || 1) + ' · ' + (M.family || '') + ' · ' + fmt(b.kills || 0) + ' slain</div></div>' +
      '<div class="hr-cl-sec">Combat</div>' +
      '<div class="hr-cl-stats">' + M.hp + ' HP · ' + M.atk + ' ATK · ' + M.def + ' DEF · ' + M.xp + ' xp · weak to ' + (M.weaponWeak || '—') + '</div>' +
      '<div class="hr-cl-sec">Drop table</div><div style="padding:2px 12px 14px">' + drops + '</div>' +
    '</div>';
  }

  // Item cell — clickable into a detail (value, properties, where it drops).
  function cellItem(id, icon, name, found) {
    return '<div class="hr-cl-cell' + (found ? '' : ' miss') + '"' + (found ? ' data-item="' + id + '" style="cursor:pointer"' : '') + ' title="' + (name || '') + '">' +
      '<div class="hr-cl-ic">' + (found ? (icon || _clGly('uiChest', 22)) : _clGly('uiSearch', 22)) + '</div>' +
      '<div class="hr-cl-nm">' + (found ? name : '???') + '</div></div>';
  }
  function itemSources(id) {
    var MON = window.MONSTERS || {}, out = [];
    for (var mid in MON) {
      var drops = MON[mid].drops || [];
      for (var i = 0; i < drops.length; i++) { if (drops[i].id === id) { out.push(MON[mid].name); break; } }
    }
    return out;
  }
  function itemDetailHtml(id) {
    var it = (window.ITEMS || {})[id]; if (!it) return '';
    var props = [];
    if (it.heals) props.push(_clGly('uiHeart',13,'--red') + ' heals ' + it.heals);
    if (it.buff) props.push(_clGly('uiSpark',13,'--gold-2') + ' buff: ' + (it.buff.type || 'effect'));
    if (it.buryXp) props.push(_clGly('prayer',13,'--gem') + ' ' + it.buryXp + ' prayer xp (bury)');
    if (it.atkB || it.strB || it.defB) props.push(_clGly('uiSword',13) + ' +' + (it.atkB || 0) + ' atk / +' + (it.strB || 0) + ' str / +' + (it.defB || 0) + ' def');
    if (it.slot) props.push(_clGly('uiBody',13) + ' ' + it.slot);
    var src = itemSources(id);
    var have = (window.G.collection || {})[id];
    return '<div class="hr-cl-detail">' +
      '<button class="hr-cl-claim" data-cl-back="1" style="margin-bottom:12px">← Back to log</button>' +
      '<div style="text-align:center"><div class="hr-cl-hero">' + window.itemArt(id, 46) + '</div>' +
      '<div class="hr-cl-hn" style="font-size:calc(23px * var(--ui-scale, 1))">' + it.n + '</div>' +
      '<div class="hr-cl-eyebrow">Worth ' + fmt(it.v || 0) + ' gold' + (have ? ' · discovered' : '') + '</div></div>' +
      (props.length ? '<div class="hr-cl-sec">Properties</div><div class="hr-cl-stats">' + props.join('<br>') + '</div>' : '') +
      '<div class="hr-cl-sec">Where it drops</div><div class="hr-cl-stats">' + (src.length ? src.join(', ') : 'Not a monster drop — gathered, crafted, or bought.') + '</div>' +
    '</div>';
  }

  var activeTab = 'bestiary';
  var detailMon = null;
  var detailItem = null;

  function renderBody(G) {
    var MON = window.MONSTERS || {}, ITEMS = window.ITEMS || {};
    var best = G.bestiary || {}, col = G.collection || {};
    if (activeTab === 'bestiary') {
      // drilled into a specific monster's drop table
      if (detailMon && MON[detailMon] && best[detailMon] && (best[detailMon].kills || 0) > 0) return monDetailHtml(detailMon);
      // group monsters by tier
      var byTier = {};
      Object.keys(MON).forEach(function (id) { var t = MON[id].tier || 1; (byTier[t] = byTier[t] || []).push(id); });
      var tiers = Object.keys(byTier).map(Number).sort(function (a, b) { return a - b; });
      return tiers.map(function (t) {
        var cells = byTier[t].map(function (id) {
          var found = best[id] && (best[id].kills || 0) > 0;
          return cellMon(id, window.monsterArt(id, 30), MON[id].name, found);
        }).join('');
        return '<div class="hr-cl-sec">Tier ' + t + '</div><div class="hr-cl-grid">' + cells + '</div>';
      }).join('');
    }
    // items — drilled into one item's detail?
    if (detailItem && ITEMS[detailItem] && col[detailItem]) return itemDetailHtml(detailItem);
    // group by simple category
    function catOf(it) { return it.slot || (it.heals ? 'Food' : it.buryXp ? 'Bones' : it.equip ? 'Equipment' : 'Materials'); }
    var byCat = {};
    Object.keys(ITEMS).forEach(function (id) { var c = catOf(ITEMS[id]); (byCat[c] = byCat[c] || []).push(id); });
    return Object.keys(byCat).sort().map(function (c) {
      var ids = byCat[c];
      var found = ids.filter(function (id) { return col[id]; }).length;
      var cells = ids.map(function (id) { return cellItem(id, window.itemArt(id, 26), ITEMS[id].n, !!col[id]); }).join('');
      return '<div class="hr-cl-sec">' + c + ' · ' + found + '/' + ids.length + '</div><div class="hr-cl-grid">' + cells + '</div>';
    }).join('');
  }

  function open() {
    if (document.getElementById('hr-cl-modal')) document.getElementById('hr-cl-modal').remove();
    ensureStyle();
    var G = window.G;
    var st = getStats(G);
    var claims = claimable(G);
    var msHtml = claims.map(function (m) {
      var rw = []; if (m.reward.gold) rw.push(_clGly('gold',13,'--gold-2') + ' ' + fmt(m.reward.gold)); if (m.reward.gems) rw.push(_clGly('gems',13,'--gem') + ' ' + fmt(m.reward.gems));
      return '<div class="hr-cl-ms"><div class="hr-cl-msb"><b>' + m.label + '</b> — ' + rw.join(' ') + '</div><button class="hr-cl-claim" data-cl-claim="' + m.id + '">Claim</button></div>';
    }).join('');

    var scrim = document.createElement('div');
    scrim.className = 'hr-cl-scrim'; scrim.id = 'hr-cl-modal';
    scrim.innerHTML =
      '<div class="hr-cl-wrap">' +
        '<div class="hr-cl-top">' +
          '<button class="hr-cl-x" data-cl-close="1">✕</button>' +
          '<div class="hr-cl-eyebrow">Collection Log</div>' +
          '<div class="hr-cl-hn">' + Math.round(st.overall * 100) + '% Complete</div>' +
          '<div class="hr-cl-bar"><i style="width:' + Math.round(st.overall * 100) + '%"></i></div>' +
          '<div class="hr-cl-eyebrow">Bestiary ' + st.mon.found + '/' + st.mon.total + ' · Items ' + st.item.found + '/' + st.item.total + '</div>' +
        '</div>' +
        msHtml +
        '<div class="hr-cl-tabs">' +
          '<div class="hr-cl-tab' + (activeTab === 'bestiary' ? ' on' : '') + '" data-cl-tab="bestiary">Bestiary</div>' +
          '<div class="hr-cl-tab' + (activeTab === 'items' ? ' on' : '') + '" data-cl-tab="items">Items</div>' +
        '</div>' +
        '<div id="hr-cl-body">' + renderBody(G) + '</div>' +
      '</div>';
    scrim.addEventListener('click', function (e) {
      var t = e.target;
      if (t === scrim || t.getAttribute('data-cl-close')) { scrim.remove(); return; }
      if (t.getAttribute('data-cl-back')) { detailMon = null; detailItem = null; open(); return; }
      var tab = t.getAttribute('data-cl-tab');
      if (tab) { activeTab = tab; detailMon = null; detailItem = null; open(); return; }
      var monCell = t.closest && t.closest('[data-mon]');
      if (monCell) { detailMon = monCell.getAttribute('data-mon'); open(); return; }
      var itemCell = t.closest && t.closest('[data-item]');
      if (itemCell) { detailItem = itemCell.getAttribute('data-item'); open(); return; }
      var cid = t.getAttribute('data-cl-claim');
      if (cid) {
        var rw = claimMilestone(cid, G);
        if (rw && typeof window.notify === 'function') {
          var s2 = []; if (rw.gold) s2.push(_clGly('gold',13,'--gold-2') + ' ' + fmt(rw.gold)); if (rw.gems) s2.push(_clGly('gems',13,'--gem') + ' ' + fmt(rw.gems));
          window.notify('Collection reward: ' + s2.join(' '), 'gold');
        }
        open();
      }
    });
    document.body.appendChild(scrim);
  }

  window.HearthriseCollection = {
    getStats: getStats,
    claimable: claimable,
    claimMilestone: claimMilestone,
    open: open,
    ensureState: ensureState
  };

  // In-the-moment discovery feedback: the first time an item enters your
  // collection, pop a small toast. Wraps the (already-decorated) addItem with a
  // before/after check so it fires only on a genuinely new entry, debounced so a
  // drop burst doesn't spam. Never breaks item pickups (guarded).
  var lastToast = 0;
  function hookDiscovery() {
    if (window.__hrDiscoveryHooked) return;
    if (typeof window.addItem !== 'function') { setTimeout(hookDiscovery, 500); return; }
    window.__hrDiscoveryHooked = true;
    function toast(msg) {
      var now = Date.now();
      if (now - lastToast > 700 && typeof window.notify === 'function') { lastToast = now; window.notify(msg, 'loot'); }
    }
    function totals(G) { var st = getStats(G); return (st.item.found + st.mon.found) + '/' + (st.item.total + st.mon.total); }
    // Item discovery
    var origAdd = window.addItem;
    window.addItem = function (id) {
      var G = window.G;
      var before = (G && G.collection) ? G.collection[id] : undefined;
      var r = origAdd.apply(this, arguments);
      try {
        if (!before && G && G.collection && G.collection[id] && window.ITEMS && window.ITEMS[id]) {
          toast('New discovery: ' + window.ITEMS[id].n + ' (' + totals(G) + ')');
        }
      } catch (e) { /* never break item pickups */ }
      return r;
    };
    // Monster discovery (first kill). Bestiary keys on G.activeMonster; capture
    // it before the kill resolves (which may clear it), then compare after the
    // bestiary decorator (inside orig) has recorded the kill.
    if (typeof window.killMonster === 'function') {
      var origKill = window.killMonster;
      window.killMonster = function () {
        var G = window.G;
        var mid = G && G.activeMonster;
        var before = (mid && G.bestiary) ? G.bestiary[mid] : undefined;
        var wasNew = mid && (!before || !(before.kills > 0));
        var r = origKill.apply(this, arguments);
        try {
          if (wasNew && mid && G.bestiary && G.bestiary[mid] && G.bestiary[mid].kills > 0 && window.MONSTERS && window.MONSTERS[mid]) {
            toast('Bestiary: ' + window.MONSTERS[mid].name + ' discovered! (' + totals(G) + ')');
          }
        } catch (e) { /* never break combat */ }
        return r;
      };
    }
  }
  hookDiscovery();

  console.log('[collection-log] ready');
})();
