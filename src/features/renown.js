// ============================================================
// src/features/renown.js  — "Rise to Jarl" Renown ladder (meta-spine)
//
// The account-wide destination the whole game was missing. Every system
// (levels, combat, kills, bosses, quests, collection, daily streak, gold)
// feeds ONE Renown score. Renown never resets and never caps hard — there
// is always a next rank just ahead. This is the retention spine: the reason
// to log in tomorrow is that you're 3 kills from Freeholder.
//
// Design for stickiness (the good kind):
//   • Always a visible next rank you're close to (home hero shows it).
//   • Daily activity feeds it, so logging in daily literally speeds your rise.
//   • Rank-ups are a MOMENT — a claimable reward + a permanent perk + a title.
//   • Early ranks come fast (first-session dopamine); later ranks stretch out.
//
// This file is the DATA + LOGIC layer (pure, testable). UI panel + event
// hooks + nav tab are wired separately. Ranks/weights are plain data so
// tuning is a one-line edit — thresholds still want a real pacing pass.
//
// Loaded as a classic script (window.HearthriseRenown), same pattern as
// home-dashboard.js. Reads window.G defensively — every field guarded so a
// missing/old save scores 0 for that term instead of throwing.
// ============================================================
(function () {
  'use strict';

  // ── The ladder ──────────────────────────────────────────────
  // 12 ranks, Wanderer → High Jarl. `title` is the flex shown by your name.
  // `reward` is claimed once on reaching the rank (the dopamine hit).
  // `perk` is a permanent account bonus (wired incrementally). `unlock` is
  // the tangible reason to climb (regions are future content hooks).
  // `min` = Renown needed. Names are data — rename freely.
  // Every perk uses a WIRED type (allXP → getBonus, offlineHours → processOffline)
  // so nothing shown here is a broken promise. The bonuses stack as you climb —
  // higher rank literally makes everything faster (a retention engine in itself).
  // By High Jarl: +22% XP and +12h offline cap.
  var RANKS = [
    { id: 'peasant',  name: 'Peasant',   title: 'a Peasant',    min: 0,      reward: {},                           perk: null,                            unlock: 'Your journey begins.' },
    { id: 'serf',     name: 'Serf',      title: 'a Serf',       min: 400,    reward: { gold: 250 },                perk: { offlineHours: 1 },             unlock: '+1 hour offline progress' },
    { id: 'squire',   name: 'Squire',    title: 'a Squire',     min: 900,    reward: { gold: 750 },                perk: { allXP: 0.02 },                 unlock: '+2% XP from every skill' },
    { id: 'knight',   name: 'Knight',    title: 'a Knight',     min: 2200,   reward: { gold: 2000 },               perk: { offlineHours: 1 },             unlock: '+1 more hour offline progress' },
    { id: 'baron',    name: 'Baron',     title: 'a Baron',      min: 4500,   reward: { gold: 5000, gems: 25 },     perk: { allXP: 0.03 },                 unlock: '+3% XP · 25 gems' },
    { id: 'viscount', name: 'Viscount',  title: 'a Viscount',   min: 8000,   reward: { gold: 10000 },              perk: { offlineHours: 2 },             unlock: '+2 hours offline progress' },
    { id: 'count',    name: 'Count',     title: 'a Count',      min: 13500,  reward: { gold: 20000, gems: 50 },    perk: { allXP: 0.03 },                 unlock: '+3% XP · 50 gems' },
    { id: 'marquis',  name: 'Marquis',   title: 'a Marquis',    min: 21000,  reward: { gold: 40000 },              perk: { offlineHours: 2 },             unlock: '+2 hours offline · the Marquis title' },
    { id: 'duke',     name: 'Duke',      title: 'a Duke',       min: 32000,  reward: { gold: 75000, gems: 100 },   perk: { allXP: 0.04 },                 unlock: '+4% XP · 100 gems' },
    { id: 'prince',   name: 'Prince',    title: 'a Prince',     min: 48000,  reward: { gold: 150000 },             perk: { offlineHours: 3 },             unlock: '+3 hours offline progress' },
    { id: 'king',     name: 'King',      title: 'the King',     min: 72000,  reward: { gold: 300000, gems: 250 },  perk: { allXP: 0.05 },                 unlock: 'King of your own realm · +5% XP' },
    { id: 'highking', name: 'High King', title: 'the High King', min: 120000, reward: { gold: 1000000, gems: 500 }, perk: { allXP: 0.05, offlineHours: 3 }, unlock: 'Legend of the realm · +5% XP · +3h offline' }
  ];

  // ── Scoring weights (tunable) ───────────────────────────────
  // Renown = Σ(each progress term × weight). Balanced so steady grind (levels)
  // is the core, but "events" (quests, boss kills, mastering a skill) give
  // satisfying jumps, and the daily streak is rewarded (retention).
  var W = {
    totalLevel:   10,   // sum of all skill levels — the steady backbone
    combatLevel:  15,
    kill:         0.5,  // each monster kill (grind)
    bossKill:     40,   // bosses are landmarks
    questDone:    200,  // quests = big renown jumps
    collection:   25,   // each collection-log entry (completionism)
    skill99:      600,  // mastering a skill to 99 = huge flex
    streakBest:   25,   // best login streak ever (rewards the habit)
    bountyDone:   12,
    goldLog:      45    // × (log10(gold)-3) above 1k — a minor flex, not the path
  };

  function lvlFromXp(xp) {
    // Mirror of legacy levelFromXp without depending on load order.
    var T = window.XP_TABLE;
    if (!T) return 1;
    for (var i = T.length - 1; i >= 0; i--) if (xp >= T[i]) return Math.min(i + 1, 99);
    return 1;
  }

  // ── computeRenown(G) → integer score ────────────────────────
  // Defensive: any missing field contributes 0. NOTE: quest/collection/boss
  // field shapes are confirmed against the live G by the smoke test; if a
  // shape differs the term simply scores 0 (never throws).
  function computeRenown(G) {
    G = G || window.G;
    if (!G) return 0;
    var r = 0;

    // Total level + count of maxed skills, in one pass over G.skills.
    var totalLevel = 0, maxed = 0;
    if (G.skills && typeof G.skills === 'object') {
      for (var sk in G.skills) {
        if (!Object.prototype.hasOwnProperty.call(G.skills, sk)) continue;
        var lv = lvlFromXp(G.skills[sk] || 0);
        totalLevel += lv;
        if (lv >= 99) maxed++;
      }
    }
    r += totalLevel * W.totalLevel;
    r += maxed * W.skill99;

    if (typeof window.getCombatLevel === 'function') {
      try { r += (window.getCombatLevel() || 0) * W.combatLevel; } catch (e) {}
    }

    var st = G.stats || {};
    r += (st.kills || 0) * W.kill;

    // Boss kills — no dedicated counter exists; sum bestiary entries whose
    // MONSTERS def is flagged boss.
    var bossKills = 0;
    if (G.bestiary && window.MONSTERS) {
      for (var bid in G.bestiary) {
        if (!Object.prototype.hasOwnProperty.call(G.bestiary, bid)) continue;
        var md = window.MONSTERS[bid];
        if (md && md.boss) bossKills += (G.bestiary[bid].kills || 0);
      }
    }
    r += bossKills * W.bossKill;

    // Quests completed — support both an array of completed and a count.
    var q = G.quests;
    var questsDone = 0;
    if (Array.isArray(q)) questsDone = q.filter(function (x) { return x && (x.done || x.completed || x.claimed); }).length;
    else if (typeof G.questsCompleted === 'number') questsDone = G.questsCompleted;
    r += questsDone * W.questDone;

    // Collection log entries discovered.
    var col = G.collection;
    var colCount = 0;
    if (col && typeof col === 'object') {
      for (var c in col) { if (Object.prototype.hasOwnProperty.call(col, c) && col[c]) colCount++; }
    }
    r += colCount * W.collection;

    if (G.bountyHunter && typeof G.bountyHunter.completed === 'number') r += G.bountyHunter.completed * W.bountyDone;

    var streakBest = (G.streak && (G.streak.best || G.streak.count)) || 0;
    r += streakBest * W.streakBest;

    var gold = G.gold || 0;
    if (gold > 1000) r += (Math.log(gold) / Math.LN10 - 3) * W.goldLog;

    return Math.floor(r);
  }

  // ── Rank lookup ─────────────────────────────────────────────
  function rankIndexFor(renown) {
    var idx = 0;
    for (var i = 0; i < RANKS.length; i++) if (renown >= RANKS[i].min) idx = i;
    return idx;
  }

  // Full state for the UI + home hero. Never throws.
  function getState(G) {
    G = G || window.G;
    var renown = computeRenown(G);
    var i = rankIndexFor(renown);
    var cur = RANKS[i];
    var next = RANKS[i + 1] || null;
    var into = renown - cur.min;
    var span = next ? (next.min - cur.min) : 1;
    var pct = next ? Math.max(0, Math.min(1, into / span)) : 1;
    return {
      renown: renown,
      rankIndex: i,
      rank: cur,
      next: next,
      progress: pct,               // 0..1 toward next rank
      toNext: next ? Math.max(0, next.min - renown) : 0,
      isMax: !next
    };
  }

  // ── Persisted state (claims + rank-up detection) ────────────
  // Derived score is never stored; only what we can't recompute: which rank
  // rewards were claimed, and the highest rank we've already celebrated.
  // Lazy-ensured (like ensureBountyState/ensureBuffState) so no monolith edit.
  function ensureState(G) {
    G = G || window.G; if (!G) return null;
    if (!G.renown || typeof G.renown !== 'object') {
      // First init. Set seenRank to the CURRENT rank so existing players aren't
      // spammed with retroactive rank-up popups — but leave `claimed` empty so
      // the rewards they've already earned are waiting to be claimed (a nice
      // "welcome to Renown" hook on launch).
      G.renown = { claimed: [], seenRank: rankIndexFor(computeRenown(G)) };
    }
    if (!Array.isArray(G.renown.claimed)) G.renown.claimed = [];
    if (typeof G.renown.seenRank !== 'number') G.renown.seenRank = rankIndexFor(computeRenown(G));
    return G.renown;
  }

  function hasReward(rank) {
    return rank && rank.reward && (rank.reward.gold || rank.reward.gems || rank.reward.item);
  }

  // Ranks you've reached, have a reward, and haven't claimed yet.
  function getClaimable(G) {
    G = G || window.G; var s = ensureState(G); if (!s) return [];
    var curIdx = rankIndexFor(computeRenown(G));
    var out = [];
    for (var i = 0; i <= curIdx && i < RANKS.length; i++) {
      if (hasReward(RANKS[i]) && s.claimed.indexOf(RANKS[i].id) < 0) out.push(RANKS[i]);
    }
    return out;
  }

  // Grant a rank's reward once. Returns the reward granted, or null.
  function claimRank(rankId, G) {
    G = G || window.G; var s = ensureState(G); if (!s) return null;
    if (s.claimed.indexOf(rankId) >= 0) return null;         // already claimed
    var idx = -1; for (var i = 0; i < RANKS.length; i++) if (RANKS[i].id === rankId) { idx = i; break; }
    if (idx < 0) return null;
    if (idx > rankIndexFor(computeRenown(G))) return null;    // not reached yet
    var rank = RANKS[idx];
    var rw = rank.reward || {};
    if (rw.gold) G.gold = (G.gold || 0) + rw.gold;
    if (rw.gems) G.gems = (G.gems || 0) + rw.gems;
    if (rw.item && typeof window.addItem === 'function') { try { window.addItem(rw.item, rw.itemQty || 1); } catch (e) {} }
    s.claimed.push(rankId);
    try { if (typeof window.saveLocal === 'function') window.saveLocal(); } catch (e) {}
    return rw;
  }

  // Aggregate passive perks from every rank reached (perks are passive on-rank,
  // not claim-gated). Game systems query this for bonuses.
  function getPerks(G) {
    G = G || window.G;
    var p = { allXP: 0, offlineHours: 0, bankSlots: 0, marketSlots: 0, dailyTasks: 0, dropRate: 0 };
    if (!G) return p;
    var curIdx = rankIndexFor(computeRenown(G));
    for (var i = 0; i <= curIdx && i < RANKS.length; i++) {
      var pk = RANKS[i].perk; if (!pk) continue;
      for (var k in pk) { if (Object.prototype.hasOwnProperty.call(pk, k)) p[k] = (p[k] || 0) + pk[k]; }
    }
    return p;
  }

  // Detect a NEW rank since last celebration. Returns the array of ranks newly
  // reached (usually one), advancing seenRank. UI calls this from a poll.
  function pollRankUp(G) {
    G = G || window.G; var s = ensureState(G); if (!s) return [];
    var curIdx = rankIndexFor(computeRenown(G));
    if (curIdx <= s.seenRank) { if (curIdx < s.seenRank) s.seenRank = curIdx; return []; }
    var reached = RANKS.slice(s.seenRank + 1, curIdx + 1);
    s.seenRank = curIdx;
    try { if (typeof window.saveLocal === 'function') window.saveLocal(); } catch (e) {}
    return reached;
  }

  // ── UI ──────────────────────────────────────────────────────
  // Class names deliberately avoid the substrings card/title/name/tile so the
  // legacy always-on `[class*=...]` rules can't hijack them. Token colors +
  // fallbacks → theme-aware (cream on Cozy, dark on Hearthlight).
  function fmt(n) { return (n || 0).toLocaleString(); }

  function ensureStyle() {
    if (document.getElementById('hr-rn-css')) return;
    var s = document.createElement('style');
    s.id = 'hr-rn-css';
    s.textContent = [
      '.hr-rn-scrim{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px}',
      '.hr-rn-wrap{background:var(--bg-1,#1a1f2e);border:1px solid var(--line,#b8893e);border-radius:14px;width:100%;max-width:460px;max-height:88vh;overflow:auto;color:var(--ink,#e9e2cf);box-shadow:0 18px 50px -12px rgba(0,0,0,.7);font-family:var(--f-ui,system-ui,sans-serif)}',
      '.hr-rn-top{padding:18px 18px 14px;background:radial-gradient(120% 90% at 50% 0,color-mix(in srgb,var(--gold,#e0a64a) 22%,transparent),transparent);border-bottom:1px solid var(--line-soft,rgba(122,94,58,.2));text-align:center;position:sticky;top:0;backdrop-filter:blur(6px)}',
      '.hr-rn-eyebrow{font-size:13.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3,#a5896a)}',
      '.hr-rn-cur{font-family:var(--f-display,serif);font-size:26px;font-weight:800;color:var(--gold,#e0a64a);line-height:1.1;margin:3px 0 2px}',
      '.hr-rn-sub{font-size:13.5px;color:var(--ink-2,#cbb890)}',
      '.hr-rn-bar{height:9px;border-radius:99px;background:var(--bg-0,#0f1320);border:1px solid var(--line-soft,rgba(122,94,58,.25));overflow:hidden;margin:12px 0 5px}',
      '.hr-rn-bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--gold-2,#c8862a),var(--gold,#e0a64a))}',
      '.hr-rn-next{font-size:13.5px;color:var(--ink-3,#a5896a)}',
      '.hr-rn-list{padding:8px}',
      '.hr-rn-rank{display:flex;gap:11px;align-items:center;padding:10px 11px;border-radius:10px;border:1px solid transparent;margin:3px 0}',
      '.hr-rn-rank.is-cur{background:color-mix(in srgb,var(--gold,#e0a64a) 12%,transparent);border-color:var(--gold,#e0a64a)}',
      '.hr-rn-rank.is-done{opacity:.9}',
      '.hr-rn-rank.is-locked{opacity:.5}',
      '.hr-rn-medal{width:38px;height:38px;flex:0 0 auto;border-radius:50%;display:grid;place-items:center;font-size:18px;font-weight:800;background:radial-gradient(circle at 38% 30%,var(--bg-2,#2c2216),var(--bg-0,#1a130c));border:2px solid var(--line,#cda24a);color:var(--gold,#e0a64a)}',
      '.hr-rn-rank.is-cur .hr-rn-medal{border-color:var(--gold,#e0a64a);box-shadow:0 0 0 3px color-mix(in srgb,var(--gold,#e0a64a) 22%,transparent)}',
      '.hr-rn-info{flex:1;min-width:0}',
      '.hr-rn-nm{font-weight:700;font-size:15px;color:var(--ink,#e9e2cf)}',
      '.hr-rn-unlock{font-size:13.5px;color:var(--ink-3,#a5896a);margin-top:1px}',
      '.hr-rn-req{font-size:13.5px;color:var(--ink-3,#a5896a);white-space:nowrap}',
      '.hr-rn-claim{border:none;border-radius:8px;padding:7px 12px;font-weight:800;font-size:13.5px;cursor:pointer;background:linear-gradient(180deg,var(--gold,#f0b860),var(--gold-2,#d99c40));color:var(--bg-0,#20160a);white-space:nowrap;flex:0 0 auto}',
      '.hr-rn-claim:active{transform:translateY(1px)}',
      '.hr-rn-done{font-size:16px;color:var(--green,#5fbf6a);flex:0 0 auto}',
      '.hr-rn-x{position:absolute;top:12px;right:14px;background:var(--bg-0,#0f1320);border:1px solid var(--line-soft,rgba(122,94,58,.25));color:var(--ink-2,#cbb890);width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:15px;line-height:1}',
      // rank-up celebration
      '.hr-rn-cele{background:var(--bg-1,#1a1f2e);border:2px solid var(--gold,#e0a64a);border-radius:16px;max-width:400px;width:100%;padding:26px 22px;text-align:center;color:var(--ink,#e9e2cf);box-shadow:0 0 60px -10px color-mix(in srgb,var(--gold,#e0a64a) 55%,transparent);animation:hr-rn-pop .35s cubic-bezier(.2,1.3,.5,1)}',
      '@keyframes hr-rn-pop{from{transform:scale(.8);opacity:0}to{transform:scale(1);opacity:1}}',
      '.hr-rn-cele .big{font-family:var(--f-display,serif);font-size:30px;font-weight:800;color:var(--gold,#e0a64a);margin:6px 0}'
    ].join('');
    document.head.appendChild(s);
  }

  function rewardText(rw) {
    if (!rw) return '';
    var parts = [];
    if (rw.gold) parts.push('🪙 ' + fmt(rw.gold));
    if (rw.gems) parts.push('💎 ' + fmt(rw.gems));
    if (rw.item) parts.push('🎁 ' + (rw.itemQty || 1) + '× ' + rw.item);
    return parts.join('  ');
  }

  function closeModal() { var m = document.getElementById('hr-rn-modal'); if (m) m.remove(); }

  function openLadder() {
    closeModal();               // idempotent — never stack two ladders
    ensureStyle();
    var G = window.G;
    var st = getState(G);
    var s = ensureState(G);
    var curIdx = st.rankIndex;
    var claimableIds = getClaimable(G).map(function (r) { return r.id; });

    var rows = RANKS.map(function (rank, i) {
      var reached = i <= curIdx;
      var cls = 'hr-rn-rank' + (i === curIdx ? ' is-cur' : reached ? ' is-done' : ' is-locked');
      var medal = reached ? (i === curIdx ? '★' : '✓') : '🔒';
      var right;
      if (claimableIds.indexOf(rank.id) >= 0) {
        right = '<button class="hr-rn-claim" data-claim="' + rank.id + '">Claim</button>';
      } else if (reached && hasReward(rank)) {
        right = '<span class="hr-rn-done">✓</span>';
      } else {
        right = '<span class="hr-rn-req">' + fmt(rank.min) + '</span>';
      }
      return '<div class="' + cls + '">' +
        '<div class="hr-rn-medal">' + medal + '</div>' +
        '<div class="hr-rn-info"><div class="hr-rn-nm">' + rank.name + '</div>' +
        '<div class="hr-rn-unlock">' + rank.unlock + (hasReward(rank) ? '  ·  ' + rewardText(rank.reward) : '') + '</div></div>' +
        right + '</div>';
    }).join('');

    var nextLine = st.isMax
      ? 'You have reached the summit — ' + st.rank.name
      : fmt(st.toNext) + ' Renown to <b>' + st.next.name + '</b>';

    var scrim = document.createElement('div');
    scrim.className = 'hr-rn-scrim';
    scrim.id = 'hr-rn-modal';
    scrim.innerHTML =
      '<div class="hr-rn-wrap">' +
        '<button class="hr-rn-x" data-close="1">✕</button>' +
        '<div class="hr-rn-top">' +
          '<div class="hr-rn-eyebrow">Rise to the Throne · Renown</div>' +
          '<div class="hr-rn-cur">' + st.rank.name + '</div>' +
          '<div class="hr-rn-sub">' + fmt(st.renown) + ' Renown</div>' +
          '<div class="hr-rn-bar"><i style="width:' + Math.round(st.progress * 100) + '%"></i></div>' +
          '<div class="hr-rn-next">' + nextLine + '</div>' +
        '</div>' +
        '<div class="hr-rn-list">' + rows + '</div>' +
      '</div>';
    scrim.addEventListener('click', function (e) {
      if (e.target === scrim || e.target.getAttribute('data-close')) { closeModal(); return; }
      var id = e.target.getAttribute('data-claim');
      if (id) {
        var rw = claimRank(id, window.G);
        if (rw) {
          if (typeof window.notify === 'function') window.notify('Claimed ' + rewardText(rw), 'gold');
          if (typeof window.updateTopbar === 'function') try { window.updateTopbar(); } catch (er) {}
          openLadder(); // re-render (button → ✓)
        }
      }
    });
    document.body.appendChild(scrim);
  }

  function celebrate(rank) {
    ensureStyle();
    var claimable = hasReward(rank);
    var scrim = document.createElement('div');
    scrim.className = 'hr-rn-scrim';
    scrim.id = 'hr-rn-cele';
    scrim.innerHTML =
      '<div class="hr-rn-cele">' +
        '<div class="hr-rn-eyebrow">Rank up</div>' +
        // b225: the meta-spine's highest-ceremony surface was a party-popper
        // emoji (Final Directive violation). A gilt laurel crest, drawn.
        '<svg viewBox="0 0 64 48" style="width:56px;height:42px;margin:2px auto 4px;display:block" aria-hidden="true">' +
          '<path d="M14 40 Q6 30 10 16 Q12 26 18 32 Q13 22 16 10 Q19 22 24 28 Q21 18 26 8 Q28 20 30 26" fill="none" stroke="var(--gold,#e8c476)" stroke-width="2.2" stroke-linecap="round"/>' +
          '<path d="M50 40 Q58 30 54 16 Q52 26 46 32 Q51 22 48 10 Q45 22 40 28 Q43 18 38 8 Q36 20 34 26" fill="none" stroke="var(--gold,#e8c476)" stroke-width="2.2" stroke-linecap="round"/>' +
          '<circle cx="32" cy="34" r="5.5" fill="none" stroke="var(--gold,#e8c476)" stroke-width="2"/>' +
          '<circle cx="32" cy="34" r="1.8" fill="var(--gold,#e8c476)"/>' +
        '</svg>' +
        '<div class="big">' + rank.name + '</div>' +
        '<div class="hr-rn-sub" style="margin-bottom:4px">You are now <b>' + rank.title + '</b></div>' +
        '<div class="hr-rn-unlock" style="font-size:13.5px;margin-bottom:16px">' + rank.unlock + '</div>' +
        (claimable
          ? '<button class="hr-rn-claim" data-cele-claim="' + rank.id + '" style="padding:10px 20px;font-size:15px">Claim ' + rewardText(rank.reward) + '</button>'
          : '<button class="hr-rn-claim" data-cele-close="1" style="padding:10px 20px;font-size:15px">Onward →</button>') +
      '</div>';
    scrim.addEventListener('click', function (e) {
      var id = e.target.getAttribute('data-cele-claim');
      if (id) {
        var rw = claimRank(id, window.G);
        if (rw && typeof window.notify === 'function') window.notify('Claimed ' + rewardText(rw), 'gold');
        if (typeof window.updateTopbar === 'function') try { window.updateTopbar(); } catch (er) {}
      }
      if (id || e.target.getAttribute('data-cele-close') || e.target === scrim) scrim.remove();
    });
    document.body.appendChild(scrim);
  }

  // Poll for rank-ups (mirrors the achievements poll). Slow — Renown moves
  // gradually — but catches a rank-up within a few seconds of earning it.
  // Don't stack the rank-up celebration onto other popups (login gauntlet:
  // beta / welcome-back / daily / FTUE / collection). pollRankUp only advances
  // when it fires, so deferring just waits for the screen to clear.
  function anotherModalUp() {
    return !!document.querySelector(
      '.ftue-root,#hr-welcome-modal,.wbv-overlay,.beta-overlay,[class*="welcome-overlay"],.hr-dl-scrim,.hr-cl-scrim,.acq-overlay,.ach-overlay'
    );
  }
  function tick() {
    if (!window.G) return;
    if (document.getElementById('hr-rn-cele') || document.getElementById('hr-rn-modal')) return; // ours already open
    if (anotherModalUp()) return;                       // wait for the screen to clear
    try {
      var reached = pollRankUp(window.G);
      // Celebrate one at a time; if multiple, queue by re-checking next tick.
      if (reached && reached.length) celebrate(reached[0]);
    } catch (e) { /* never break the loop */ }
  }

  window.HearthriseRenown = {
    RANKS: RANKS,
    WEIGHTS: W,
    compute: computeRenown,
    getState: getState,
    rankIndexFor: rankIndexFor,
    ensureState: ensureState,
    getClaimable: getClaimable,
    claimRank: claimRank,
    getPerks: getPerks,
    pollRankUp: pollRankUp,
    openLadder: openLadder,
    celebrate: celebrate
  };

  // Seed state + start the rank-up watcher once G exists.
  function boot() {
    if (!window.G) { setTimeout(boot, 400); return; }
    ensureState(window.G);
    setInterval(tick, 4000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  console.log('[renown] ladder ready (' + RANKS.length + ' ranks)');
})();
