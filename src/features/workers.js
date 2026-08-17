// ============================================================
// src/features/workers.js  (b201, SYS-2)
//
// Hired workers = idle resource production. Assign a worker to any
// gathering action you've unlocked yourself (worker can't out-skill
// you) and they produce that resource continuously — online, offline,
// whenever — at a fraction of your active rate.
//
// Design:
//   • Slots come from the property tier (features/homestead.js): 0 at
//     the camp → 6 at the castle. Hiring costs gold, escalating.
//   • Efficiency: 25% of player rate at worker Lv1, +3%/level to 52%
//     at Lv10. Workers level by working (slowly — days, not minutes).
//   • Workers produce RESOURCES ONLY, never player XP — your 99s stay
//     yours; workers feed the castle build costs. That's the loop:
//     workers gather → you upgrade property → more workers.
//   • LAZY ACCRUAL: no background sim. Each worker stores lastCollect;
//     on boot / House render / a 60s tick we bank elapsed×rate. This
//     makes offline production free and exact. Accrual caps at 24h
//     ("workers rest without direction") — log in daily to keep them
//     at it, which is the retention hook.
// ============================================================
(function () {
  'use strict';

  var NAMES = ['Aldric', 'Berta', 'Cedric', 'Dagny', 'Edwin', 'Freya', 'Gareth', 'Hilda',
               'Ivor', 'Jorunn', 'Kellan', 'Liesl', 'Magnus', 'Nella', 'Osric', 'Petra'];
  var HIRE_COSTS = [500, 2500, 10000, 30000, 80000, 200000];
  var ACCRUE_CAP_MS = 24 * 3600000;   // workers rest after 24h without direction
  var BASE_EFF = 0.25, EFF_PER_LVL = 0.03, MAX_LVL = 10;

  function G_() { return window.G || {}; }

  function ensureState() {
    var G = G_();
    if (!G || typeof G !== 'object') return;
    if (!G.workers || !Array.isArray(G.workers.hired)) G.workers = { hired: [] };
  }

  // ---------- credit attribution (b370) ----------
  // A worker payout is an inventory credit that DID NOT come from the fight the
  // player is watching. The fight rail (features/combat-screens.js) measures
  // loot as positive inventory deltas — it cannot tell a Slime Gel from a
  // shipment of Oak Logs, so Aldric's haul was showing up under "Drops this
  // fight". Rather than teach the rail about workers, every non-combat credit
  // declares itself into ONE shared bucket that the rail folds into its
  // baseline. Bounded (one key per item id), owner-less (no load-order
  // dependency between a classic script and an ESM feature), and reusable by
  // any future non-combat source — pets, farm auto-harvest, mail.
  function noteNonCombatCredit(id, qty) {
    if (!id || !(qty > 0)) return;
    try {
      var b = window.__hrNonCombatCredits || (window.__hrNonCombatCredits = {});
      b[id] = (b[id] || 0) + qty;
    } catch (e) { /* attribution is best-effort; never block a payout */ }
  }

  // ---------- the worker ledger (b370) ----------
  // Tyler: "we should store that data somewhere so those who are interested can
  // keep track of what their workers are gaining." So every banked payout is
  // tallied per worker, lifetime, on the worker record itself — it rides G.workers
  // into the save by default (denylist rule; never add it to NO_SYNC). Aggregates
  // are DERIVED, not stored, so the two can never disagree.
  // The session figure is deliberately in-memory only: same ruling as the
  // Chronicle's Recent tier — "what have they done since I sat down" is a session
  // question, and persisting it would put churn in the cloud snapshot.
  var sessionByItem = {};
  var sessionTotal = 0;

  function recordCollect(w, id, qty) {
    if (!id || !(qty > 0)) return;
    if (!w.collected || typeof w.collected !== 'object') w.collected = {};
    w.collected[id] = (w.collected[id] || 0) + qty;
    w.collectedTotal = (w.collectedTotal || 0) + qty;
    if (!w.collectedSince) w.collectedSince = Date.now();
    sessionByItem[id] = (sessionByItem[id] || 0) + qty;
    sessionTotal += qty;
  }

  // Derived view of the whole crew. byItem is lifetime; session is this sitting.
  function ledger() {
    ensureState();
    var byItem = {}, total = 0;
    var per = G_().workers.hired.map(function (w) {
      var c = (w.collected && typeof w.collected === 'object') ? w.collected : {};
      var t = 0;
      for (var id in c) {
        var q = c[id] || 0;
        if (!(q > 0)) continue;
        t += q; byItem[id] = (byItem[id] || 0) + q;
      }
      total += t;
      return { uid: w.uid, name: w.name, total: t, byItem: c, since: w.collectedSince || 0 };
    });
    return {
      byItem: byItem, total: total, workers: per,
      session: { byItem: sessionByItem, total: sessionTotal },
    };
  }

  // Lifetime tallies sorted biggest-first — what the summary line reads.
  function ledgerTop(n) {
    var by = ledger().byItem;
    return Object.keys(by)
      .map(function (id) { return { id: id, qty: by[id] }; })
      .sort(function (a, b) { return b.qty - a.qty; })
      .slice(0, n || 5);
  }

  function slots() {
    return (window.HearthriseHomestead && window.HearthriseHomestead.workerSlots()) || 0;
  }
  function hireCost() {
    ensureState();
    var n = G_().workers.hired.length;
    return HIRE_COSTS[Math.min(n, HIRE_COSTS.length - 1)];
  }

  function actFor(skill, targetId) {
    var tables = { woodcutting: window.TREES, mining: window.ROCKS, fishing: window.FISH_SPOTS };
    var t = tables[skill];
    if (!t) return null;
    for (var i = 0; i < t.length; i++) if (t[i].id === targetId) return t[i];
    return null;
  }

  function level(w) { return Math.min(MAX_LVL, 1 + Math.floor(Math.sqrt((w.xp || 0) / 2000))); }
  function eff(w) { return BASE_EFF + EFF_PER_LVL * (level(w) - 1); }

  function hire() {
    ensureState();
    var G = G_();
    if (G.workers.hired.length >= slots()) {
      if (window.notify) notify(slots() === 0 ? 'Upgrade your property to hire workers' : 'No free worker slots — upgrade your property', 'kill');
      return null;
    }
    var cost = hireCost();
    if (!window.balCanAfford(cost, 'gold')) {
      if (window.notify) notify(window.balKnown('gold') ? ('Need ' + cost.toLocaleString() + ' gold to hire')
        : window.balShortfall(cost, 'gold'), 'kill');
      return null;
    }
    G.gold -= cost;
    var used = G.workers.hired.map(function (w) { return w.name; });
    var pool = NAMES.filter(function (n) { return used.indexOf(n) < 0; });
    var w = {
      uid: 'w' + Date.now() + Math.floor(Math.random() * 999),
      name: pool.length ? pool[Math.floor(Math.random() * pool.length)] : ('Worker ' + (G.workers.hired.length + 1)),
      skill: null, targetId: null, xp: 0, lastCollect: Date.now()
    };
    G.workers.hired.push(w);
    if (window.notify) notify('🤝 ' + w.name + ' joins your homestead!', 'levelup');
    render();
    return w;
  }

  function assign(uid, skill, targetId) {
    ensureState();
    var w = G_().workers.hired.find(function (x) { return x.uid === uid; });
    if (!w) return false;
    accrueWorker(w);                             // bank the old task before switching
    if (!skill || !targetId) { w.skill = null; w.targetId = null; render(); return true; }
    var act = actFor(skill, targetId);
    if (!act) return false;
    var plv = (typeof window.getLevel === 'function') ? window.getLevel(skill) : 1;
    if (plv < act.req) { if (window.notify) notify('You must reach ' + skill + ' Lv ' + act.req + ' before a worker can learn it', 'kill'); return false; }
    w.skill = skill; w.targetId = targetId; w.lastCollect = Date.now();
    if (window.notify) notify(w.name + ' assigned to ' + act.name, 'info');
    render();
    return true;
  }

  // Bank one worker's production since lastCollect. Returns {id, qty} or null.
  function accrueWorker(w) {
    var act = w.skill && actFor(w.skill, w.targetId);
    var now = Date.now();
    if (!act) { w.lastCollect = now; return null; }
    var elapsed = Math.min(Math.max(0, now - (w.lastCollect || now)), ACCRUE_CAP_MS);
    var perTickMs = act.ms / eff(w);
    var ticks = Math.floor(elapsed / perTickMs);
    if (ticks <= 0) return null;
    var avgQty = (act.qty[0] + act.qty[1]) / 2;
    var qty = Math.max(0, Math.floor(ticks * avgQty));
    if (qty > 0 && typeof window.addItem === 'function') {
      window.addItem(act.prod, qty);
      /* AFTER the credit lands, never before — the fight rail folds this into
         its baseline on its next sample, and a note that preceded the actual
         inventory write would discount loot that had not arrived yet. */
      noteNonCombatCredit(act.prod, qty);
      recordCollect(w, act.prod, qty);
    }
    w.xp = (w.xp || 0) + Math.floor(ticks * act.xp * 0.5);   // worker XP, never player XP
    w.lastCollect = now - (elapsed - ticks * perTickMs);     // preserve remainder
    return qty > 0 ? { id: act.prod, qty: qty } : null;
  }

  function accrueAll(announce) {
    ensureState();
    var gains = [];
    G_().workers.hired.forEach(function (w) {
      var g = accrueWorker(w);
      if (g) gains.push(g);
    });
    if (announce && gains.length && window.notify) {
      var txt = gains.map(function (g) {
        var n = (window.ITEMS && window.ITEMS[g.id] && window.ITEMS[g.id].n) || g.id;
        return n + ' ×' + g.qty;
      }).join(', ');
      notify('🧺 Your workers gathered: ' + txt, 'info');
    }
    return gains;
  }

  function ratePerHour(w) {
    var act = w.skill && actFor(w.skill, w.targetId);
    if (!act) return null;
    var avgQty = (act.qty[0] + act.qty[1]) / 2;
    return Math.round(3600000 / (act.ms / eff(w)) * avgQty);
  }

  // ---------- UI (renders into the host div inside the Property card) ----------
  function fmtN(n) { return Math.round(n || 0).toLocaleString(); }
  function itemName(id) {
    return (window.ITEMS && window.ITEMS[id] && window.ITEMS[id].n) || id;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  /* THE LEDGER LINE. One sentence under the crew: the lifetime haul, its top
     few items, and — only when they have actually produced while you sat here
     — what they have brought in this session. Data over UI: no panel, no tab,
     no chart. It answers "what are my workers gaining" at a glance and gets
     out of the way. */
  function ledgerHtml() {
    var L = ledger();
    if (!(L.total > 0)) return '';
    var top = ledgerTop(4);
    var extra = Object.keys(L.byItem).length - top.length;
    var items = top.map(function (r) {
      return esc(itemName(r.id)) + ' ×' + fmtN(r.qty);
    }).join(' · ') + (extra > 0 ? ' · +' + extra + ' more' : '');
    /* The session figure earns its line only when it says something the
       lifetime figure does not. On a first sitting the two are the same number
       and printing both is noise. */
    var sess = (L.session.total > 0 && L.session.total < L.total)
      ? '<div class="tiny muted">' + fmtN(L.session.total) + ' of it since you sat down.</div>'
      : '';
    return '<div class="tiny muted" style="margin-top:6px">' +
      '<b>' + fmtN(L.total) + '</b> gathered by your workers — ' + items + '</div>' + sess;
  }

  function taskOptions(w) {
    var out = '<option value="">— idle —</option>';
    [['woodcutting', window.TREES], ['mining', window.ROCKS], ['fishing', window.FISH_SPOTS]].forEach(function (pair) {
      var skill = pair[0], table = pair[1] || [];
      var plv = (typeof window.getLevel === 'function') ? window.getLevel(skill) : 1;
      var opts = table.filter(function (a) { return plv >= a.req; }).map(function (a) {
        var sel = (w.skill === skill && w.targetId === a.id) ? ' selected' : '';
        return '<option value="' + skill + ':' + a.id + '"' + sel + '>' + a.name + '</option>';
      }).join('');
      if (opts) out += '<optgroup label="' + skill.charAt(0).toUpperCase() + skill.slice(1) + '">' + opts + '</optgroup>';
    });
    return out;
  }

  function render() {
    var host = document.getElementById('hh-workers-host');
    if (host) renderInto(host);
  }

  function renderInto(host) {
    if (!host) return;
    ensureState();
    var G = G_();
    var s = slots();
    var rows = G.workers.hired.map(function (w) {
      var rph = ratePerHour(w);
      var act = w.skill && actFor(w.skill, w.targetId);
      /* The per-worker tally sits on the line that already answers "what is
         this one doing" — one more fact in an existing sentence, not a new
         surface. A worker who has banked nothing says nothing. */
      var haul = (w.collectedTotal || 0) > 0
        ? ' · <span title="Everything ' + w.name + ' has ever banked">' + fmtN(w.collectedTotal) + ' gathered</span>'
        : '';
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--line-soft)">' +
        ((window.HearthriseIconSet && window.HearthriseIconSet.path && window.HearthriseIconSet.path('navProfile'))
          ? '<svg viewBox="0 0 512 512" style="width:18px;height:18px;flex:0 0 auto" aria-hidden="true"><path fill="var(--gold-2,#cda24a)" d="' + window.HearthriseIconSet.path('navProfile') + '"/></svg>'
          : '<span style="font-size:calc(19px * var(--ui-scale, 1))">🧑‍🌾</span>') +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:calc(14.5px * var(--ui-scale, 1))"><b>' + w.name + '</b> <span class="tiny muted">Lv ' + level(w) + '</span></div>' +
          '<div class="tiny muted">' + (act ? (act.name + ' · ~' + rph + '/hr') : 'Idle — assign a task') + haul + '</div>' +
        '</div>' +
        '<select style="max-width:150px;font-size:calc(14.5px * var(--ui-scale, 1));background:rgba(0,0,0,.25);color:var(--ink);border:1px solid var(--line);border-radius:5px;padding:3px 6px" ' +
          'onchange="window.HearthriseWorkers._onAssign(\'' + w.uid + '\', this.value)">' + taskOptions(w) + '</select>' +
        '</div>';
    }).join('');
    var canHire = G.workers.hired.length < s;
    host.innerHTML =
      '<div style="border-top:1px solid var(--line-soft);margin-top:10px;padding-top:8px">' +
        /* b217: was uppercase + .06em tracking on a 11px tiny — the treatment
           the rest of the game uses for section headings is the small-caps
           face, so this one read as a different design. */
        '<div class="hr-label" style="margin-bottom:4px">Workers ' + G.workers.hired.length + '/' + s + '</div>' +
        (s === 0 ? '<div class="tiny muted">Upgrade to a Homestead to hire your first worker.</div>' : '') +
        rows +
        (s > 0 && canHire
          ? '<button class="btn btn-sm" style="margin-top:8px" onclick="window.HearthriseWorkers.hire()">Hire worker — ' + hireCost().toLocaleString() + 'g</button>'
          : '') +
        (s > 0 ? '<div class="tiny muted" style="margin-top:6px">Workers gather while you\'re away (up to 24h). They only do what you\'ve mastered yourself.</div>' : '') +
        ledgerHtml() +
      '</div>';
  }

  window.HearthriseWorkers = {
    ensureState: ensureState,
    slots: slots,
    hireCost: hireCost,
    hire: hire,
    assign: assign,
    accrueAll: accrueAll,
    level: level,
    eff: eff,
    ratePerHour: ratePerHour,
    ledger: ledger,
    ledgerTop: ledgerTop,
    renderInto: renderInto,
    _onAssign: function (uid, value) {
      if (!value) { assign(uid, null, null); return; }
      var parts = value.split(':');
      assign(uid, parts[0], parts[1]);
    }
  };

  function boot() {
    try {
      ensureState();
      accrueAll(true);                          // banks offline production + announces it
      setInterval(function () { accrueAll(false); }, 60000);
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
