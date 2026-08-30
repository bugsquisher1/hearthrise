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
//   • Efficiency: a fraction of the ACTIVE PLAYER's rate at the same node —
//     10% at worker Lv1, +0.8%/level to 17.2% at Lv10 (b389). Workers level by
//     working (slowly — days, not minutes). The curve and the paced anchor it
//     is a fraction of are authored ONCE, in src/core/workers.js; this file no
//     longer owns a rate number. (This line read "25% … to 52%" for four builds
//     after b389 changed it — hence the module, and hence the ratio guard.)
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
  /* b389 WORKER REBALANCE (game-designer, Tyler: "workers are overpowered").
     BEFORE: a castle crew of 6 at 52% eff = 3.12x a maxed ACTIVE player, 24/7 for
     free = ~6.3M gold/day passive — strictly better than playing, and a gold faucet
     that defeated the b226 anti-faucet (0.20 vendor) ceiling.
     Lever A — cut+flatten efficiency: crew of 6 at Lv10 now = 6 x 0.172 = 1.03
     active-equivalents (≈ ONE extra gatherer working while you're away).
     Lever B — escalate hire cost so the full crew is a King-tier investment
     (~1.09M total vs 323k), not free money. Workers stay a nice passive helper;
     manual play is the fast path again. (Upkeep/food = Lever C, deferred to Systems.)
     ⚠ b497 — Lever A's ARITHMETIC ABOVE IS THE RULING; its IMPLEMENTATION was
     wrong from b389 to b496. Both engines divided the raw `node.ms` by eff while
     the player gathers at `pacedActionMs(node.ms)`, so the shipped figure was
     6 x 0.172 x 1.60 = 1.65, not 1.03 — the nerf landed 60% short. Nothing in
     this note changed; only the anchor did. HIRE_COSTS is unaffected. */
  var HIRE_COSTS = [500, 3000, 15000, 75000, 250000, 750000];

  /* ── THE RATE MODEL IS NOT AUTHORED HERE (b497) ──────────────────────────
     `BASE_EFF / EFF_PER_LVL / MAX_LVL / ACCRUE_CAP_MS` and the level/eff curve
     used to be literals in this file AND again in
     supabase/functions/hr-accrue/accrual.js, reconciled by a comment reading
     "Mirrors src/features/workers.js". Worse, the quantity the efficiency is a
     fraction OF was named in neither: both divided the RAW `node.ms`, while the
     player gathers at `pacedActionMs(node.ms)` — so b389's "10% efficiency"
     nerf shipped at 1.60x its stated size (a Lv10 crew of six = 1.65
     active-player-equivalents against the 1.03 the ruling names).
     src/core/workers.js owns all of it now and BOTH engines import it. Do not
     re-inline a constant here: a display that quotes a rate the server settle
     does not pay is the away-divergence class this codebase has paid for twice.

     Reached through core-bridge because this is a classic script. If core is
     somehow absent the accessors degrade toward ZERO PRODUCTION, never toward a
     guessed rate — `eff` 0 makes perTickMs Infinity, so `accrueWorker` takes its
     `ticks <= 0` branch, which returns WITHOUT advancing `lastCollect`. Time is
     deferred, never confiscated and never mispaid. */
  function CW() {
    var C = window.HearthriseCore;
    return (C && C.workers) || null;
  }

  function G_() { return window.G || {}; }

  function ensureState() {
    var G = G_();
    if (!G || typeof G !== 'object') return;
    if (!G.workers || !Array.isArray(G.workers.hired)) G.workers = { hired: [] };
  }

  // ---------- the worker ledger (b370) ----------
  // (Workers used to declare themselves NON-combat so the fight rail could
  // filter them out. That denylist is gone: the rail is now an allowlist fed by
  // the single combat-drop credit in COMBAT_FX.addItem, so a worker haul is
  // excluded by simply not being a drop. Nothing to declare here any more.)
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

  function level(w) { var K = CW(); return K ? K.workerLevel(w && w.xp) : 1; }
  function eff(w) { var K = CW(); return K ? K.workerEff(w && w.xp) : 0; }
  /* The interval between this worker's productions — the PACED action interval
     at the node divided by the worker's efficiency. One expression, shared with
     the server settle (which evaluates the same rational in exact integers). */
  function tickMs(w, act) { var K = CW(); return K ? K.workerTickMs(act.ms, w && w.xp) : Infinity; }
  function accrueCapMs() { var K = CW(); return K ? K.WORKER_ACCRUE_CAP_MS : 24 * 3600000; }

  function hire() {
    ensureState();
    var G = G_();
    if (G.workers.hired.length >= slots()) {
      if (window.notify) notify(slots() === 0 ? 'Upgrade your property to hire workers' : 'No free worker slots — upgrade your property', 'kill');
      return null;
    }
    /* ── SERVER-BACKED (the live path). Crew size is a SELLABLE unlock ladder
       (`worker_hire.<N>`) and the crew itself is a SERVER-OWNED table. The two
       are materialised by TWO SECURITY DEFINER RPCs: hr_unlock_buy raises the
       PAID CAP, hr_worker_hire creates a crew row up to that cap. They are NOT
       atomic, so a paid rung with no crew is a real, reachable state — three
       live players hit it in the b463 offers-wipe window and the QA account hit
       it again on 2026-08-25 (rung `worker_hire=1` owned, `player_workers`
       empty, gold correctly unspent). The old order (buy the rung, THEN hire)
       lost the crew whenever the buy came back `already_owned` in a wire shape
       the client did not classify as `owned`, so hr_worker_hire was never
       reached.
       THE ORDER IS NOW HIRE-FIRST. Materialise against the paid cap BEFORE
       spending a coin: if the cap has room — a fresh purchase OR a stranded rung
       — the worker is created for free and NO unlock_buy is sent at all, so the
       hire can no longer be lost to however the edge spells `already_owned`.
       Only when the server itself answers `crew_cap_reached` do we buy the NEXT
       rung (stated by the server as paid_cap+1) and hire again. hr_worker_hire
       is the single authority for "is there room"; the purchase is a CONSEQUENCE
       of hitting the cap, never a precondition. No price crosses either call. */
    if (serverBacked()) return hireServer(G);

    // ── LEGACY LOCAL PATH (flag off): buy the rung, then mint the crew locally.
    var cost = hireCost();
    if (!window.balCanAfford(cost, 'gold')) {
      if (window.notify) notify(window.balKnown('gold') ? ('Need ' + cost.toLocaleString() + ' gold to hire')
        : window.balShortfall(cost, 'gold'), 'kill');
      return null;
    }
    var _offer = 'worker_hire.' + (G.workers.hired.length + 1);
    var _k = (typeof window.goldIntentKey === 'function') ? window.goldIntentKey() : null;
    window.goldSettle(-cost, 'workers.hire', _k);
    if (_k && window.HearthriseGold && typeof window.HearthriseGold.buyUnlock === 'function') {
      var _b = window.HearthriseGold.buyUnlock(_offer, _k); if (_b && _b.catch) _b.catch(function () {});
    }
    var used = G.workers.hired.map(function (w) { return w.name; });
    var pool = NAMES.filter(function (n) { return used.indexOf(n) < 0; });
    var w = {
      uid: 'w' + Date.now() + Math.floor(Math.random() * 999),
      name: pool.length ? pool[Math.floor(Math.random() * pool.length)] : ('Worker ' + (G.workers.hired.length + 1)),
      skill: null, targetId: null, xp: 0, lastCollect: Date.now()
    };
    G.workers.hired.push(w);
    if (window.notify) notify('' + w.name + ' joins your homestead!', 'levelup');
    render();
    return w;
  }

  function makeOptimisticWorker(G) {
    var used = G.workers.hired.map(function (w) { return w.name; });
    var pool = NAMES.filter(function (n) { return used.indexOf(n) < 0; });
    return {
      uid: 'wpending' + Date.now() + Math.floor(Math.random() * 999),
      name: pool.length ? pool[Math.floor(Math.random() * pool.length)] : ('Worker ' + (G.workers.hired.length + 1)),
      skill: null, targetId: null, xp: 0, lastCollect: Date.now(), _pending: true
    };
  }

  function dropWorker(G, w) {
    var i = G.workers.hired.indexOf(w);
    if (i >= 0) G.workers.hired.splice(i, 1);
  }

  /* HIRE-FIRST server materialisation. Show an optimistic worker at once, then
     ask the server to CREATE the authoritative crew row against the paid cap. A
     rung that is already paid (a fresh purchase from a previous click, or a
     stranded rung) is drained here for FREE with no purchase attempt — which is
     the whole fix for the 2026-08-25 stranded-cap failure. Only a genuine
     `crew_cap_reached` triggers a purchase of the NEXT rung, after which we
     materialise again. The server's uid is stamped onto the prediction so the
     next envelope's reconcileWorkers() matches it and preserves the display
     ledger; a hard refusal drops the prediction. Returns the optimistic worker. */
  function hireServer(G) {
    var Net = window.HearthriseWorkersNet;
    if (!Net || !Net.isSignedIn()) {
      if (window.notify) notify('Connect to the server to hire workers', 'kill');
      return null;
    }
    var temp = makeOptimisticWorker(G);
    G.workers.hired.push(temp);
    if (window.notify) notify('' + temp.name + ' joins your homestead!', 'levelup');
    render();

    function settleOk(res) { temp.uid = res.uid; temp.name = res.name; temp._pending = false; render(); }
    function fail(res) { dropWorker(G, temp); notifyHireError(res); render(); }

    // (1) MATERIALISE against the paid cap first — free, and drains a stranded rung.
    Promise.resolve(Net.hire()).then(function (res) {
      if (res && res.ok) { settleOk(res); return; }
      if (!res || res.error !== 'crew_cap_reached') { fail(res); return; }

      /* (2) AT THE PAID CAP — buy the NEXT rung, then materialise. The rung is
         (paid_cap + 1), STATED by the server in the crew_cap_reached answer, so
         the client never guesses which rung it already owns. */
      var paidCap = (res && isFiniteNum(res.paid_cap)) ? (res.paid_cap | 0) : (G.workers.hired.length - 1);
      var nextRung = paidCap + 1;
      if (nextRung > HIRE_COSTS.length) {          // 6 is the hard ceiling
        dropWorker(G, temp);
        if (window.notify) notify('Your crew is already at full strength', 'kill');
        render(); return;
      }
      var cost = HIRE_COSTS[Math.min(paidCap, HIRE_COSTS.length - 1)];
      if (!window.balCanAfford(cost, 'gold')) {
        dropWorker(G, temp);
        if (window.notify) notify(window.balKnown('gold') ? ('Need ' + cost.toLocaleString() + ' gold to hire')
          : window.balShortfall(cost, 'gold'), 'kill');
        render(); return;
      }
      var _k = (typeof window.goldIntentKey === 'function') ? window.goldIntentKey() : null;
      window.goldSettle(-cost, 'workers.hire', _k);
      var _buy = (_k && window.HearthriseGold && typeof window.HearthriseGold.buyUnlock === 'function')
        ? window.HearthriseGold.buyUnlock('worker_hire.' + nextRung, _k) : null;
      if (_buy && _buy.catch) _buy.catch(function () {});
      Promise.resolve(_buy || { outcome: 'applied' }).then(function (r) {
        /* b463 — `already_owned` is a RECEIPT, not a refusal: the rung is paid
           and the gold seam already rolled this attempt's prediction back, so we
           proceed to materialise. Any other refusal is real; drop and explain. */
        var owned = !!(r && r.outcome === 'refused' && r.reason === 'already_owned');
        var ok = !_buy || owned || (r && (r.outcome === 'applied' || r.outcome === 'replayed'));
        if (!ok) {
          dropWorker(G, temp);
          if (window.notify) notify('Could not complete the hire — ' + ((r && r.reason) || 'try again'), 'kill');
          render(); return;
        }
        Promise.resolve(Net.hire()).then(function (res2) {
          if (res2 && res2.ok) settleOk(res2); else fail(res2);
        }).catch(function () {});
      }).catch(function () {});
    }).catch(function () { /* transient — leave the optimistic worker; the next envelope reconciles */ });

    return temp;
  }

  function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }

  function notifyHireError(res) {
    if (!window.notify) return;
    var e = res && res.error;
    if (e === 'crew_cap_reached') notify('Buy the next worker slot before hiring again', 'kill');
    else if (e === 'rate_limited') notify('Slow down — try again in a moment', 'kill');
    else if (e === 'not_signed_in') notify('Connect to the server to hire workers', 'kill');
    else notify('Could not hire a worker' + (e ? ' (' + e + ')' : ''), 'kill');
  }

  function assign(uid, skill, targetId) {
    ensureState();
    var w = G_().workers.hired.find(function (x) { return x.uid === uid; });
    if (!w) return false;
    /* SERVER-BACKED: the server owns the assignment (own-worker + node + your
       level gate) and settles the crew. The client sends the intent and renders
       a display prediction the envelope reconciles. */
    if (serverBacked()) return assignServer(w, uid, skill, targetId);
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

  /* Send the assign intent, render an optimistic prediction, reconcile to the
     server's answer. A refusal reverts the prediction and explains why; the next
     envelope's reconcileWorkers() is the final authority either way. */
  function assignServer(w, uid, skill, targetId) {
    var Net = window.HearthriseWorkersNet;
    if (!Net || !Net.isSignedIn()) {
      if (window.notify) notify('Connect to the server to assign workers', 'kill');
      return false;
    }
    /* Local pre-check for instant feedback only — the SERVER re-checks YOUR level
       against its own xp, so this just avoids a doomed round trip. */
    if (skill && targetId) {
      var act = actFor(skill, targetId);
      if (!act) return false;
      var plv = (typeof window.getLevel === 'function') ? window.getLevel(skill) : 1;
      if (plv < act.req) {
        if (window.notify) notify('You must reach ' + skill + ' Lv ' + act.req + ' before a worker can learn it', 'kill');
        return false;
      }
    }
    var prevSkill = w.skill, prevTarget = w.targetId;
    if (!skill || !targetId) { w.skill = null; w.targetId = null; }
    else { w.skill = skill; w.targetId = targetId; w.lastCollect = Date.now(); }
    render();
    Net.assign(uid, skill || null, targetId || null).then(function (res) {
      if (res && res.ok) {
        w.skill = res.skill || null;
        w.targetId = (res.target_id != null ? res.target_id : null);
        if (window.notify && res.skill) {
          var a = actFor(res.skill, res.target_id);
          notify(w.name + ' assigned to ' + (a ? a.name : res.target_id), 'info');
        }
      } else {
        w.skill = prevSkill; w.targetId = prevTarget;
        notifyAssignError(res);
      }
      render();
    }).catch(function () { w.skill = prevSkill; w.targetId = prevTarget; render(); });
    return true;
  }

  function notifyAssignError(res) {
    if (!window.notify) return;
    var e = res && res.error;
    if (e === 'level_too_low') notify('Your own skill is too low for that task' + (res && res.req_lv ? ' (needs Lv ' + res.req_lv + ')' : ''), 'kill');
    else if (e === 'wrong_skill') notify('That worker cannot do that task', 'kill');
    else if (e === 'unknown_node') notify('That gathering spot is not available', 'kill');
    else if (e === 'bad_skill') notify('That is not a gathering skill', 'kill');
    else if (e === 'unknown_worker') notify('That worker is no longer on your crew', 'kill');
    else if (e === 'rate_limited') notify('Slow down — try again in a moment', 'kill');
    else notify('Could not assign the worker' + (e ? ' (' + e + ')' : ''), 'kill');
  }

  /* ── SERVER-BACKED PRODUCTION (worker-settlement slice) ────────────────────
     When WORKER_PRODUCTION_SERVER_BACKED is true, hired-crew output is settled
     SERVER-SIDE (supabase/functions/hr-accrue accrueWorkers -> hr_apply into
     player_inventory + player_workers.xp). The client MUST NOT mint the items or
     advance the worker xp itself any more — that client `addItem` was the last
     un-backed OWNABLE mint blocking the inventory absolute-replace flip
     (src/data/item-authority.js). With the flag on, this function is a NO-OP for
     authority; the crew's real state (output, xp, level) comes from the server
     envelope. Local prediction/rendering is display-only and reconciled to the
     envelope. The flag OFF keeps the pre-flip local behaviour verbatim, so a
     revert is a one-line flip. */
  function serverBacked() {
    return !!(window.HearthriseItemAuthority
      && window.HearthriseItemAuthority.WORKER_PRODUCTION_SERVER_BACKED);
  }

  // Bank one worker's production since lastCollect. Returns {id, qty} or null.
  function accrueWorker(w) {
    var now = Date.now();
    // SERVER-BACKED: never mint client-side. The server settles the crew on every
    // accrue pass; the client only renders what the envelope returns.
    if (serverBacked()) { w.lastCollect = now; return null; }
    var act = w.skill && actFor(w.skill, w.targetId);
    if (!act) { w.lastCollect = now; return null; }
    var elapsed = Math.min(Math.max(0, now - (w.lastCollect || now)), accrueCapMs());
    var perTickMs = tickMs(w, act);
    var ticks = Math.floor(elapsed / perTickMs);
    if (ticks <= 0) return null;
    var avgQty = (act.qty[0] + act.qty[1]) / 2;
    var qty = Math.max(0, Math.floor(ticks * avgQty));
    if (qty > 0 && typeof window.addItem === 'function') {
      window.addItem(act.prod, qty);
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
      notify('Your workers gathered: ' + txt, 'info');
    }
    return gains;
  }

  /* THE ADVERTISED CREW RATE. Reads the SAME `workerTickMs` the settle prices
     the haul with — the readout under a worker's name is a promise, and before
     b497 it over-quoted by 60% because it divided the un-paced node time. */
  function ratePerHour(w) {
    var act = w.skill && actFor(w.skill, w.targetId);
    if (!act) return null;
    var avgQty = (act.qty[0] + act.qty[1]) / 2;
    var per = tickMs(w, act);
    if (!(per > 0) || !isFinite(per)) return 0;
    return Math.round(3600000 / per * avgQty);
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
          : '<span class="hh-worker-glyph">' + ((window.HR && window.HR.icon) ? (window.HR.icon('uiWorker', 20, '--gold-2') || '') : '') + '</span>') +
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
      /* Server-backed: accrueAll is a no-op for authority, but the crew's xp /
         level / assignment are refreshed into G.workers by reconcileWorkers() as
         envelopes arrive, so repaint on the same cadence to keep an open House
         card live. Flag off: this just repaints after the local bank, harmless. */
      setInterval(function () { accrueAll(false); render(); }, 60000);
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
