// ============================================================
// src/features/daily-reward.js  — Daily login reward (retention)
//
// The single most proven "keep them coming back" mechanic, built on the
// login streak the game already tracks (G.streak = {count,lastDay}).
//
// How it works:
//   • A 7-day escalating cycle (Day 1 small → Day 7 jackpot).
//   • Which day you're on = your current streak position, so a longer streak
//     keeps landing bigger days; each COMPLETED week scales the whole cycle up
//     (+50% per week) so veterans still care.
//   • Claim once per UTC day. Miss a day → streak resets to Day 1 (you lose
//     nothing you had — just the escalation restarts. Loss aversion, the kind
//     that doesn't punish).
//   • Surfaced as a prominent Home card AND a gentle once-per-day popup that
//     waits for any other modal to clear (so it never stacks onto the welcome
//     /beta/rank-up modals — the game already has too many front-door popups).
//
// Classic IIFE (window.HearthriseDaily), loaded after legacy.js. Reads G
// defensively.
// ============================================================
(function () {
  'use strict';

  // Base 7-day cycle. Scaled by completed weeks at claim time.
  var CYCLE = [
    { gold: 500 },
    { gold: 1000 },
    { gold: 2000, gems: 5 },
    { gold: 3500 },
    { gold: 6000, gems: 10 },
    { gold: 10000 },
    { gold: 20000, gems: 30 }     // Day 7 jackpot
  ];

  function todayKey() {
    // Must match legacy checkStreak()'s UTC day key exactly.
    var d = new Date();
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }

  function ensureState(G) {
    G = G || window.G; if (!G) return null;
    if (!G.dailyReward || typeof G.dailyReward !== 'object') G.dailyReward = { lastClaimDay: 0 };
    if (typeof G.dailyReward.lastClaimDay !== 'number') G.dailyReward.lastClaimDay = 0;
    return G.dailyReward;
  }

  function streakCount(G) {
    return (G && G.streak && typeof G.streak.count === 'number' && G.streak.count > 0) ? G.streak.count : 1;
  }

  // 1-based day within the current 7-day cycle.
  function cycleDay(G) { return (((streakCount(G) - 1) % 7) + 1); }
  function weeksDone(G) { return Math.floor((streakCount(G) - 1) / 7); }

  // The reward waiting today, scaled by completed weeks (+50% each).
  function rewardFor(G) {
    var base = CYCLE[cycleDay(G) - 1] || CYCLE[0];
    var mult = 1 + weeksDone(G) * 0.5;
    var out = {};
    if (base.gold) out.gold = Math.round(base.gold * mult);
    if (base.gems) out.gems = Math.round(base.gems * mult);
    return out;
  }

  function isClaimable(G) {
    G = G || window.G; var s = ensureState(G); if (!s) return false;
    return todayKey() !== s.lastClaimDay;
  }

  function claim(G) {
    G = G || window.G; var s = ensureState(G); if (!s) return null;
    if (!isClaimable(G)) return null;
    var rw = rewardFor(G);
    if (rw.gold) G.gold = (G.gold || 0) + rw.gold;
    if (rw.gems) G.gems = (G.gems || 0) + rw.gems;
    s.lastClaimDay = todayKey();
    try { if (typeof window.saveLocal === 'function') window.saveLocal(); } catch (e) {}
    try { if (typeof window.updateTopbar === 'function') window.updateTopbar(); } catch (e) {}
    return rw;
  }

  function fmt(n) { return (n || 0).toLocaleString(); }
  function rewardText(rw) {
    var p = [];
    if (rw.gold) p.push('🪙 ' + fmt(rw.gold));
    if (rw.gems) p.push('💎 ' + fmt(rw.gems));
    return p.join('  ');
  }

  function ensureStyle() {
    if (document.getElementById('hr-daily-css')) return;
    var s = document.createElement('style');
    s.id = 'hr-daily-css';
    s.textContent = [
      '.hr-dl-scrim{position:fixed;inset:0;z-index:99997;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px}',
      '.hr-dl-box{background:var(--bg-1,#1a1f2e);border:2px solid var(--gold,#e0a64a);border-radius:16px;max-width:420px;width:100%;padding:22px;color:var(--ink,#e9e2cf);text-align:center;box-shadow:0 0 55px -12px color-mix(in srgb,var(--gold,#e0a64a) 50%,transparent);font-family:var(--f-ui,system-ui,sans-serif)}',
      '.hr-dl-eyebrow{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3,#a5896a)}',
      '.hr-dl-h{font-family:var(--f-display,serif);font-size:24px;font-weight:800;color:var(--gold,#e0a64a);margin:4px 0 12px}',
      '.hr-dl-week{display:flex;gap:6px;justify-content:center;margin:6px 0 16px;flex-wrap:wrap}',
      '.hr-dl-day{flex:1;min-width:38px;max-width:52px;border:1px solid var(--line-soft,rgba(122,94,58,.25));border-radius:9px;padding:7px 3px;font-size:10px;color:var(--ink-3,#a5896a);background:var(--bg-0,#0f1320)}',
      '.hr-dl-day.done{opacity:.55}',
      '.hr-dl-day.today{border-color:var(--gold,#e0a64a);background:color-mix(in srgb,var(--gold,#e0a64a) 16%,transparent);color:var(--ink,#e9e2cf)}',
      '.hr-dl-day b{display:block;font-size:14px;color:var(--gold,#e0a64a);margin-top:2px}',
      '.hr-dl-claim{border:none;border-radius:9px;padding:11px 22px;font-weight:800;font-size:15px;cursor:pointer;background:linear-gradient(180deg,var(--gold,#f0b860),var(--gold-2,#d99c40));color:var(--bg-0,#20160a)}',
      '.hr-dl-claim:active{transform:translateY(1px)}'
    ].join('');
    document.head.appendChild(s);
  }

  function open() {
    if (document.getElementById('hr-dl-modal')) return;
    ensureStyle();
    var G = window.G;
    var day = cycleDay(G), wk = weeksDone(G), mult = 1 + wk * 0.5;
    var claimable = isClaimable(G);
    var week = CYCLE.map(function (r, i) {
      var d = i + 1;
      var val = r.gems ? ('💎' + Math.round(r.gems * mult)) : ('🪙' + (r.gold >= 1000 ? Math.round(r.gold * mult / 1000) + 'k' : Math.round(r.gold * mult)));
      var cls = 'hr-dl-day' + (d < day ? ' done' : d === day ? ' today' : '');
      return '<div class="' + cls + '">D' + d + '<b>' + val + '</b></div>';
    }).join('');
    var scrim = document.createElement('div');
    scrim.className = 'hr-dl-scrim'; scrim.id = 'hr-dl-modal';
    scrim.innerHTML =
      '<div class="hr-dl-box">' +
        '<div class="hr-dl-eyebrow">Daily reward · ' + streakCount(G) + '-day streak' + (wk ? ' · week ' + (wk + 1) : '') + '</div>' +
        '<div class="hr-dl-h">Welcome back!</div>' +
        '<div class="hr-dl-week">' + week + '</div>' +
        (claimable
          ? '<button class="hr-dl-claim" data-dl-claim="1">Claim Day ' + day + ' · ' + rewardText(rewardFor(G)) + '</button>'
          : '<div class="hr-dl-eyebrow">Come back tomorrow for Day ' + ((day % 7) + 1) + '</div>') +
      '</div>';
    scrim.addEventListener('click', function (e) {
      if (e.target.getAttribute('data-dl-claim')) {
        var rw = claim(G);
        if (rw && typeof window.notify === 'function') window.notify('Daily reward: ' + rewardText(rw), 'gold');
        scrim.remove();
        try { if (window.HearthriseHome && window.HearthriseHome.render) window.HearthriseHome.render(); } catch (er) {}
      } else if (e.target === scrim) { scrim.remove(); }
    });
    document.body.appendChild(scrim);
  }

  window.HearthriseDaily = {
    isClaimable: isClaimable,
    claim: claim,
    rewardFor: rewardFor,
    cycleDay: cycleDay,
    open: open,
    ensureState: ensureState
  };

  // Gentle once-per-day auto-popup: wait for G, then only show when no other
  // modal/overlay is already up (never stack on welcome-back/beta/FTUE/rank-up).
  function anotherModalUp() {
    return !!document.querySelector(
      '.ftue-root,.hr-rn-scrim,#hr-welcome-modal,.wbv-overlay,.beta-overlay,[class*="welcome-overlay"],.acq-overlay,.ach-overlay'
    );
  }
  function autoBoot(tries) {
    if (!window.G) { setTimeout(function () { autoBoot(tries); }, 500); return; }
    ensureState(window.G);
    if (!isClaimable(window.G)) return;              // already claimed today
    if (anotherModalUp() && tries < 20) { setTimeout(function () { autoBoot(tries + 1); }, 1200); return; }
    open();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { autoBoot(0); }, 2200); });
  else setTimeout(function () { autoBoot(0); }, 2200);

  console.log('[daily-reward] ready');
})();
