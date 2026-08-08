// ============================================================
// src/features/home-dashboard.js  (revamp b154)
//
// A REAL rebuild of the Home/Profile screen — not a recolor of the
// old layout. Matches the revamp pitch: header + legible pills, an
// illuminated "next milestone" hero, actionable quests ("every card
// is a door"), today tiles, resume, and buffs.
//
// Architecture note (per CLAUDE.md): this is the first screen of the
// new component layer. It is styled with DESIGN TOKENS ONLY, so it
// renders correctly in every theme automatically — cream on Cozy Day,
// warm-dark on Hearthlight — with zero per-theme overrides. That is
// the whole point: build it right once, and theming is free.
//
// Integration is non-destructive: it renders into #panel-profile and
// hides the legacy dash cards via a scoped rule. The old renderer keeps
// running harmlessly against the (hidden) legacy nodes, so nothing else
// that depends on them breaks. Reads real state through the existing
// HearthriseLaunchpad API + window.G.
// ============================================================
(function () {
  'use strict';

  var STYLE_ID = 'home-dashboard-css';
  var ROOT_ID = 'hd-root';

  // Gate: the new Home is ON by default (solo build weekend — Tyler is the only
  // player). Easy opt-out if it misbehaves:
  //   localStorage.setItem('hearthrise:home-v2','0')   → old Home back
  //   localStorage.removeItem('hearthrise:home-v2')    → new Home again
  function enabled() {
    try { return localStorage.getItem('hearthrise:home-v2') !== '0'; }
    catch (e) { return true; }
  }

  function css() {
    // Every rule is prefixed with #hd-root and uses !important on colour /
    // background / border, so the legacy sheets' broad !important rules can't
    // leak cozy values into this component. Token VALUES still come from the
    // active theme — so it's cream on Cozy, warm-dark on Hearthlight, for free.
    // Two-ID prefix (#panel-profile #hd-root): the legacy theme has broad
    // always-on rules like `#panel-x [class*="tile"] { ... !important }` that
    // match our .hd-* classes and outrank a single-ID selector. Two IDs beat
    // any one-ID theme rule regardless of its class count.
    var R = '#panel-profile #' + ROOT_ID + ' ';
    return [
      '#panel-profile.active:has(#' + ROOT_ID + ') > .card,',
      '#panel-profile.active:has(#' + ROOT_ID + ') > .feat-buttons,',
      '#panel-profile.active:has(#' + ROOT_ID + ') > .prof-toolbar,',
      '#panel-profile.active:has(#' + ROOT_ID + ') > .dash-grid{display:none !important}',
      /* b213 (phase 2): legacy "block 30" forces the profile panel into a
         two-column dashboard grid (450px cells). This component owns the
         whole panel — without this reset it gets crushed into one cell and
         renders as a broken half-width column. */
      '#panel-profile.active:has(#' + ROOT_ID + '){display:block !important}',
      '#panel-profile #' + ROOT_ID + '{display:block;max-width:1120px;margin:0 auto;padding:6px 4px 24px;font-family:var(--f-ui);color:var(--ink) !important}',

      R + '.hd-top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}',
      R + '.hd-who{display:flex;align-items:center;gap:13px;min-width:0}',
      R + '.hd-ava{width:52px;height:52px;border-radius:14px;flex:0 0 auto;display:grid;place-items:center;font-size:26px;background:var(--bg-2) !important;border:1px solid var(--line-strong) !important}',
      R + '.hd-name{font-family:var(--f-display);font-size:22px;line-height:1.1;color:var(--ink) !important;display:flex;align-items:center;gap:6px}',
      R + '.hd-sub{font-size:12.5px;color:var(--green) !important;font-weight:600}',
      R + '.hd-sub.off{color:var(--ink-3) !important}',
      R + '.hd-rename{background:none !important;border:0;cursor:pointer;opacity:.6;font-size:13px;padding:2px}',
      R + '.hd-rename:hover{opacity:1}',
      R + '.hd-pills{display:flex;gap:9px;flex-wrap:wrap}',
      R + '.hd-pill{display:flex;align-items:center;gap:8px;background:var(--bg-2) !important;border:1px solid var(--line) !important;border-radius:11px;padding:8px 13px}',
      R + '.hd-pill em{font-style:normal;font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-3) !important;font-weight:700}',
      R + '.hd-pill b{font-family:var(--f-display);font-size:16px;color:var(--ink) !important;font-variant-numeric:tabular-nums}',
      R + '.hd-pill.gold b{color:var(--gold-2) !important}',
      R + '.hd-pill.gem b{color:var(--gem) !important}',

      R + '.hd-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:16px;align-items:start}',
      '@media(max-width:820px){' + R + '.hd-grid{grid-template-columns:1fr}}',
      R + '.hd-col{display:flex;flex-direction:column;gap:14px;min-width:0}',
      R + '.hd-h{display:flex;align-items:center;justify-content:space-between;margin:2px 2px 2px}',
      R + '.hd-h h3{margin:0;font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3) !important;font-weight:700;font-family:var(--f-ui)}',
      R + '.hd-h a{font-size:12px;color:var(--gold) !important;font-weight:600;text-decoration:none;cursor:pointer}',

      R + '.hd-card{background:var(--bg-card) !important;border:1px solid var(--line) !important;border-radius:14px;box-shadow:0 10px 26px -18px rgba(0,0,0,.5)}',

      R + '.hd-mile{display:flex;align-items:center;gap:16px;padding:18px;position:relative;overflow:hidden}',
      R + '.hd-mile-badge{flex:0 0 60px;height:60px;border-radius:50%;display:grid;place-items:center;font-size:28px;background:var(--bg-2) !important;border:2px solid var(--gold) !important;box-shadow:0 0 0 4px var(--gold-bg)}',
      R + '.hd-mile-body{flex:1;min-width:0}',
      R + '.hd-mile-title{font-family:var(--f-display);font-size:20px;color:var(--ink) !important}',
      R + '.hd-mile-sub{font-size:12px;color:var(--ink-3) !important;margin:2px 0 9px;font-variant-numeric:tabular-nums}',
      // Renown meta-spine hero (the destination — most prominent card on Home)
      R + '.hd-renown{cursor:pointer;transition:border-color .15s,box-shadow .15s}',
      R + '.hd-renown:hover{border-color:var(--gold) !important;box-shadow:0 0 0 3px var(--gold-bg)}',
      R + '.hd-renown .hd-mile-badge{font-size:30px}',
      R + '.hd-rn-eyebrow{font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--gold-2) !important;font-weight:700;margin-bottom:1px}',
      R + '.hd-rn-claimdot{font-size:11px;background:var(--gold) !important;color:var(--bg-0) !important;border-radius:99px;padding:2px 8px;font-weight:700;vertical-align:middle;margin-left:6px;white-space:nowrap}',
      // Daily reward claim card (shown only when a reward is waiting)
      R + '.hd-daily{cursor:pointer;background:color-mix(in srgb,var(--gold) 10%,var(--bg-2)) !important;border-color:var(--gold) !important}',
      R + '.hd-daily:hover{box-shadow:0 0 0 3px var(--gold-bg)}',
      R + '.hd-daily .hd-mile-badge{animation:hd-daily-pulse 1.8s ease-in-out infinite}',
      '@keyframes hd-daily-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}',

      R + '.hd-bar{height:9px;border-radius:6px;background:rgba(0,0,0,.28) !important;overflow:hidden}',
      'html:not([data-theme]) ' + R + '.hd-bar,body[data-theme="cozy-light"] ' + R + '.hd-bar{background:rgba(90,60,20,.14) !important}',
      R + '.hd-bar i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--accent,var(--green)),color-mix(in srgb,var(--accent,var(--green)) 55%,#fff)) !important}',

      R + '.hd-quest{display:flex;align-items:center;gap:13px;padding:14px;position:relative;overflow:hidden}',
      R + '.hd-quest::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--accent,var(--green))}',
      R + '.hd-qic{flex:0 0 44px;height:44px;border-radius:11px;display:grid;place-items:center;font-size:21px;background:var(--bg-2) !important;border:1px solid var(--line) !important}',
      R + '.hd-qbody{flex:1;min-width:0}',
      R + '.hd-qtitle{font-family:var(--f-display);font-size:16px;color:var(--ink) !important}',
      R + '.hd-qmeta{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:5px 0 7px}',
      R + '.hd-qmeta .p{font-size:12px;color:var(--ink-2) !important;font-weight:600;font-variant-numeric:tabular-nums}',
      R + '.hd-qmeta .r{font-size:12px;color:var(--gold-2) !important;font-weight:600}',

      R + '.hd-cta{flex:0 0 auto;align-self:stretch;display:flex;align-items:center;gap:6px;padding:0 15px;border:1px solid transparent;border-radius:11px;cursor:pointer;font:600 13.5px/1 var(--f-ui);white-space:nowrap;color:#20160c !important;background:linear-gradient(180deg,var(--gold-2),var(--gold)) !important;box-shadow:0 6px 15px -8px var(--gold)}',
      R + '.hd-cta:hover{filter:brightness(1.06)}',
      R + '.hd-cta.ghost{background:transparent !important;color:var(--accent,var(--green)) !important;border:1px solid color-mix(in srgb,var(--accent,var(--green)) 50%,transparent) !important;box-shadow:none}',

      R + '.hd-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}',
      /* b213 (phase 2): the cozy sheet's always-on `[class*="tile"]` rules
         painted the Today row cream-on-dark (washed-out strip with unreadable
         numbers). Repeated-id prefix beats their specificity for good. */
      '#panel-profile#panel-profile #hd-root .hd-tiles{background:transparent !important;border:0 !important;padding:0 !important}',
      '#panel-profile#panel-profile #hd-root .hd-tile{background:var(--bg-2) !important;border:1px solid var(--line) !important;border-radius:12px;padding:13px}',
      '#panel-profile#panel-profile #hd-root .hd-tile b{font-family:var(--f-display);font-size:22px;color:var(--ink) !important;display:block;line-height:1;font-variant-numeric:tabular-nums}',
      '#panel-profile#panel-profile #hd-root .hd-tile span{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3) !important;font-weight:700}',

      R + '.hd-mini{padding:15px;font-size:13px;color:var(--ink-2) !important;display:flex;align-items:center;gap:11px}',
      R + '.hd-mini .mi{flex:0 0 40px;height:40px;border-radius:10px;display:grid;place-items:center;font-size:19px;background:var(--bg-2) !important;border:1px solid var(--line) !important}',
      R + '.hd-mini b{color:var(--ink) !important;font-family:var(--f-display);font-size:15px;font-weight:600}',
      /* nested/classless text inside minis (buffs blurb, resume subtitle) kept
         readable — accent links carry data-hd so they keep their colour */
      R + '.hd-mini div:not([data-hd]),' + R + '.hd-mini span:not([data-hd]){color:var(--ink-2) !important}',
      R + '.hd-mini .go{margin-left:auto}'
    ].join('\n');
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css();
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function num(n) { try { return (n | 0).toLocaleString(); } catch (e) { return String(n || 0); } }

  var LP = function () { return window.HearthriseLaunchpad || {}; };
  var call = function (fn) { try { return typeof fn === 'function' ? fn() : null; } catch (e) { return null; } };

  // Map a quest to a place ("every card is a door").
  /* b213 (phase 2): gilt SVG glyph from the shared icon set. Falls back to
     the supplied emoji only until the icon paths finish their one-time
     fetch — after that the dashboard is emoji-free (directive). */
  function gly(key, px, fallback, color) {
    var IS = window.HearthriseIconSet;
    var p = key && IS && IS.path && IS.path(key);
    if (!p) return fallback || '';
    return '<svg viewBox="0 0 512 512" style="width:' + (px || 20) + 'px;height:' + (px || 20) + 'px;' +
      'display:inline-block;vertical-align:middle" aria-hidden="true"><path fill="' + (color || 'var(--gold-2)') + '" d="' + p + '"/></svg>';
  }
  function questRoute(label) {
    var l = (label || '').toLowerCase();
    var map = [
      ['fish', { key: 'fishing', icon: '🎣', verb: 'Go fish', accent: 'var(--green)', go: function () { nav('skills'); openSkill('fishing'); } }],
      ['cook', { key: 'cooking', icon: '🍳', verb: 'Cook', accent: 'var(--hearth,var(--red))', go: function () { nav('skills'); openSkill('cooking'); } }],
      ['wood|log|chop|tree', { key: 'woodcutting', icon: '🪓', verb: 'Chop', accent: 'var(--green)', go: function () { nav('skills'); openSkill('woodcutting'); } }],
      ['min(e|ing)|ore|rock', { key: 'mining', icon: '⛏️', verb: 'Mine', accent: 'var(--green)', go: function () { nav('skills'); openSkill('mining'); } }],
      ['smith|smelt|bar', { key: 'smithing', icon: '⚒️', verb: 'Smith', accent: 'var(--hearth,var(--red))', go: function () { nav('skills'); openSkill('smithing'); } }],
      ['craft', { key: 'crafting', icon: '🧵', verb: 'Craft', accent: 'var(--hearth,var(--red))', go: function () { nav('skills'); openSkill('crafting'); } }],
      ['farm|plant|harvest|crop|seed', { key: 'farming', icon: '🌾', verb: 'Farm', accent: 'var(--hearth,var(--red))', go: function () { nav('farming'); } }],
      ['gold|sell|coin|market|trade', { key: 'gold', icon: '🪙', verb: 'Sell', accent: 'var(--gold)', go: function () { nav('market'); } }],
      ['kill|defeat|slay|monster|combat|fight', { key: 'navCombat', icon: '⚔️', verb: 'Fight', accent: 'var(--red)', go: function () { nav('combat'); } }]
    ];
    for (var i = 0; i < map.length; i++) {
      if (new RegExp(map[i][0]).test(l)) return map[i][1];
    }
    return { key: 'bountyHunter', icon: '🎯', verb: 'View', accent: 'var(--gold)', go: function () { openQuests(); } };
  }
  function nav(t) { if (typeof window.showTab === 'function') window.showTab(t); }
  function openSkill(id) { if (typeof window.openSkillDetail === 'function') window.openSkillDetail(id); }
  function openQuests() { if (typeof window.openQuestsModal === 'function') window.openQuestsModal(); else nav('profile'); }

  function playerName() {
    var G = window.G || {};
    var sess = call(function () { return window.HearthriseAuth && window.HearthriseAuth.getSession(); });
    var u = sess && sess.user;
    var custom = (typeof G.playerName === 'string' && G.playerName && G.playerName !== 'Adventurer') ? G.playerName : null;
    return custom || (u && (u.user_metadata && u.user_metadata.display_name || (u.email || '').split('@')[0])) || G.playerName || 'Adventurer';
  }
  function isOnline() {
    var sess = call(function () { return window.HearthriseAuth && window.HearthriseAuth.getSession(); });
    return !!((sess && sess.user) || (window.G && window.G.account));
  }

  function render() {
    if (!enabled()) return;
    var panel = document.getElementById('panel-profile');
    if (!panel || !panel.classList.contains('active') || !window.G) return;
    ensureStyle();

    var root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      panel.insertBefore(root, panel.firstChild);
    }

    var G = window.G;
    var cl = (typeof window.getCombatLevel === 'function') ? window.getCombatLevel() : 0;
    var tl = (typeof window.getTotalLevel === 'function') ? window.getTotalLevel() : 0;
    var mile = LP().getNextMilestone ? call(LP().getNextMilestone) : null;
    var today = LP().getTodayDelta ? call(LP().getTodayDelta) : null;
    var resume = LP().getResumePayload ? call(LP().getResumePayload) : null;
    var tasks = (G.daily && Array.isArray(G.daily.tasks)) ? G.daily.tasks.filter(function (t) { return !t.done; }).slice(0, 3) : [];

    // current activity
    var activeName = G.activeMonster ? (window.MONSTERS && window.MONSTERS[G.activeMonster] && window.MONSTERS[G.activeMonster].name)
      : G.activeSkill ? (window.SKILLS_DEF && window.SKILLS_DEF[G.activeSkill] && window.SKILLS_DEF[G.activeSkill].name) : null;

    var html = '';
    // ── header ──
    html += '<div class="hd-top">';
    html += '<div class="hd-who"><div class="hd-ava" style="overflow:hidden;padding:0">' +
      '<img src="assets/icons-bundle/painted/npc/player.png" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></div><div style="min-width:0">';
    html += '<div class="hd-name">' + esc(playerName()) +
      '<button class="hd-rename" title="Rename" data-hd="rename">' + gly('uiEdit', 13, '✎', 'var(--ink-3)') + '</button></div>';
    html += '<div class="hd-sub' + (isOnline() ? '' : ' off') + '">' + (isOnline() ? '● Online · cloud save active' : 'Offline play · sign in to sync') + '</div>';
    html += '</div></div>';
    html += '<div class="hd-pills">';
    html += '<div class="hd-pill"><em>Total Lv</em><b>' + tl + '</b></div>';
    html += '<div class="hd-pill"><em>Combat</em><b>' + cl + '</b></div>';
    html += '<div class="hd-pill gold"><em>Gold</em><b>' + num(G.gold) + '</b></div>';
    html += '<div class="hd-pill gem"><em>Gems</em><b>' + num(G.gems || 0) + '</b></div>';
    if (window.HearthriseCollection && window.HearthriseCollection.getStats) {
      try {
        var _clp = Math.round(window.HearthriseCollection.getStats(G).overall * 100);
        html += '<div class="hd-pill" data-hd="collection" style="cursor:pointer"><em>' + gly('uiQuests', 11, '', 'var(--ink-3)') + ' Log</em><b>' + _clp + '%</b></div>';
      } catch (e) {}
    }
    html += '</div></div>';

    // ── grid ──
    html += '<div class="hd-grid"><div class="hd-col">';

    // Daily reward — top priority when a reward is waiting to be claimed
    var DL = window.HearthriseDaily;
    if (DL && DL.isClaimable && DL.isClaimable(G)) {
      try {
        var dlrw = DL.rewardFor(G);
        var dlt = [];
        if (dlrw.gold) dlt.push(gly('gold', 13, '', 'var(--gold-2)') + ' ' + num(dlrw.gold) + (gly('gold', 1) ? '' : ' gold'));
        if (dlrw.gems) dlt.push(gly('gems', 13, '', 'var(--gem)') + ' ' + num(dlrw.gems) + (gly('gems', 1) ? '' : ' gems'));
        html += '<div class="hd-card hd-mile hd-daily" data-hd="daily">' +
          '<div class="hd-mile-badge">' + gly('gold', 26, '🎁') + '</div>' +
          '<div class="hd-mile-body">' +
            '<div class="hd-rn-eyebrow">Daily reward · Day ' + DL.cycleDay(G) + '</div>' +
            '<div class="hd-mile-title" style="color:var(--gold)">Reward ready!</div>' +
            '<div class="hd-mile-sub">' + dlt.join(' · ') + ' waiting to claim</div>' +
          '</div>' +
          '<button class="hd-cta">Claim →</button>' +
        '</div>';
      } catch (e) { /* daily optional */ }
    }

    // Renown meta-spine hero — the account-wide destination, first thing on Home
    var RN = window.HearthriseRenown;
    if (RN && RN.getState) {
      try {
        var rs = RN.getState(G);
        var claimN = (RN.getClaimable ? RN.getClaimable(G) : []).length;
        var rpct = Math.round((rs.progress || 0) * 100);
        var nextTxt = rs.isMax ? 'Summit reached' : (num(rs.toNext) + ' Renown to ' + esc(rs.next.name));
        html += '<div class="hd-card hd-mile hd-renown" data-hd="renown">' +
          '<div class="hd-mile-badge">' + gly('totalLvl', 26, '👑') + '</div>' +
          '<div class="hd-mile-body">' +
            '<div class="hd-rn-eyebrow">Renown · Rise to the Throne</div>' +
            '<div class="hd-mile-title" style="color:var(--gold)">' + esc(rs.rank.name) +
              (claimN ? '<span class="hd-rn-claimdot">' + claimN + ' reward' + (claimN > 1 ? 's' : '') + ' ready</span>' : '') + '</div>' +
            '<div class="hd-mile-sub">' + num(rs.renown) + ' Renown · ' + nextTxt + '</div>' +
            '<div class="hd-bar" style="--accent:var(--gold)"><i style="width:' + rpct + '%"></i></div>' +
          '</div>' +
          '<button class="hd-cta">View →</button>' +
        '</div>';
      } catch (e) { /* renown optional */ }
    }

    // milestone hero
    if (mile) {
      var mpct = Math.round((mile.pct || 0) * 100);
      var isQuest = mile.kind === 'quest';
      html += '<div class="hd-card hd-mile">' +
        '<div class="hd-mile-badge">' + gly('bountyHunter', 26, esc(mile.icon || '🎯')) + '</div>' +
        '<div class="hd-mile-body">' +
        '<div class="hd-mile-title">' + esc(mile.label) + '</div>' +
        '<div class="hd-mile-sub">' + num(mile.current) + ' / ' + num(mile.target) + ' · ' + mpct + '% · next milestone</div>' +
        '<div class="hd-bar" style="--accent:var(--gold)"><i style="width:' + mpct + '%"></i></div>' +
        '</div>' +
        '<button class="hd-cta" data-hd="mile">' + (isQuest ? 'View →' : 'Train →') + '</button>' +
        '</div>';
    }

    // quests — actionable
    html += '<div><div class="hd-h"><h3>Today’s quests</h3><a data-hd="allquests">All quests →</a></div><div class="hd-col">';
    if (tasks.length) {
      tasks.forEach(function (t, i) {
        var r = questRoute(t.label);
        var pct = t.goal ? Math.round(((t.progress || 0) / t.goal) * 100) : 0;
        var reward = t.reward ? esc(t.reward) : (t.rewardText ? esc(t.rewardText) : '');
        html += '<div class="hd-card hd-quest" style="--accent:' + r.accent + '">' +
          '<div class="hd-qic">' + gly(r.key, 22, r.icon) + '</div>' +
          '<div class="hd-qbody">' +
          '<div class="hd-qtitle">' + esc(t.label) + '</div>' +
          '<div class="hd-qmeta"><span class="p">' + num(t.progress || 0) + ' / ' + num(t.goal || 0) + '</span>' +
          (reward ? '<span class="r">' + reward + '</span>' : '') + '</div>' +
          '<div class="hd-bar" style="--accent:' + r.accent + '"><i style="width:' + pct + '%"></i></div>' +
          '</div>' +
          '<button class="hd-cta ghost" style="--accent:' + r.accent + '" data-hd="q" data-i="' + i + '">' + r.verb + ' →</button>' +
          '</div>';
      });
    } else {
      html += '<div class="hd-card hd-mini"><div class="mi" style="color:var(--green);font-weight:800">✓</div><div>All daily quests done — nice. New ones at reset.</div></div>';
    }
    html += '</div></div>';

    html += '</div><div class="hd-col">';

    // today tiles
    var xp = today && (today.xp != null ? today.xp : today.totalXp);
    var kills = today && (today.kills != null ? today.kills : (G.stats && G.stats.kills));
    var harvest = today && (today.harvested != null ? today.harvested : today.gathered);
    html += '<div><div class="hd-h"><h3>Today</h3></div><div class="hd-tiles">' +
      '<div class="hd-tile"><b>' + (xp != null ? '+' + num(xp) : '—') + '</b><span>XP</span></div>' +
      '<div class="hd-tile"><b>' + (kills != null ? num(kills) : '0') + '</b><span>Kills</span></div>' +
      '<div class="hd-tile"><b>' + (harvest != null ? num(harvest) : '0') + '</b><span>Harvest</span></div>' +
      '</div></div>';

    // resume / current
    if (activeName) {
      html += '<div><div class="hd-h"><h3>Right now</h3></div>' +
        '<div class="hd-card hd-mini"><div class="mi">' + (G.activeMonster ? gly('navCombat', 20, '⚔️') : gly(G.activeSkill || 'smithing', 20, '🛠️')) + '</div>' +
        '<div><b>' + esc(activeName) + '</b><div style="font-size:12px;color:var(--ink-3)">' + (G.activeMonster ? 'In combat' : 'Training') + '</div></div>' +
        '<button class="hd-cta ghost" style="--accent:var(--gold)" data-hd="active">Open →</button></div></div>';
    } else if (resume) {
      html += '<div><div class="hd-h"><h3>Jump back in</h3></div>' +
        '<div class="hd-card hd-mini"><div class="mi">' + gly(resume.skill || resume.id, 20, esc(resume.icon || '')) + '</div>' +
        '<div><b>' + esc(resume.label) + '</b></div>' +
        '<button class="hd-cta ghost" style="--accent:var(--green)" data-hd="resume">Resume →</button></div></div>';
    }

    // buffs
    var hasFood = G.foodSlot || (G.buffs && G.buffs.length);
    html += '<div><div class="hd-h"><h3>Buffs</h3></div>' +
      '<div class="hd-card hd-mini">' + (hasFood
        ? '<div class="mi">' + gly('cooking', 20, '🍖') + '</div><div>Active buffs running.</div>'
        : '<div class="mi">' + gly('cooking', 20, '🍖') + '</div><div>No food buffs active. <span style="color:var(--hearth,var(--red));font-weight:600;cursor:pointer" data-hd="cook">Cook something →</span></div>') +
      '</div></div>';

    html += '</div></div>';

    root.innerHTML = html;
    wire(root, tasks, mile, resume);
  }

  function wire(root, tasks, mile, resume) {
    root.querySelectorAll('[data-hd]').forEach(function (el) {
      var kind = el.getAttribute('data-hd');
      el.onclick = function (e) {
        e.preventDefault();
        try {
          if (kind === 'rename') {
            var nm = prompt('Display name:', (window.G && window.G.playerName) || 'Adventurer');
            if (nm && LP().setDisplayName) { LP().setDisplayName(nm); render(); }
          } else if (kind === 'collection') { if (window.HearthriseCollection) window.HearthriseCollection.open(); }
          else if (kind === 'daily') { if (window.HearthriseDaily) window.HearthriseDaily.open(); }
          else if (kind === 'renown') { if (window.HearthriseRenown) window.HearthriseRenown.openLadder(); }
          else if (kind === 'mile' && mile && mile.deepLink) { mile.deepLink(); }
          else if (kind === 'allquests') { openQuests(); }
          else if (kind === 'q') { var i = +el.getAttribute('data-i'); var t = tasks[i]; if (t) questRoute(t.label).go(); }
          else if (kind === 'active') { nav('profile'); if (window.G.activeMonster) nav('combat'); else nav('skills'); }
          else if (kind === 'resume' && resume && resume.action) { resume.action(); }
          else if (kind === 'cook') { nav('skills'); openSkill('cooking'); }
        } catch (err) { /* no-op */ }
      };
    });
  }

  // ── triggers ──
  function maybeRender() {
    var p = document.getElementById('panel-profile');
    if (p && p.classList.contains('active')) render();
  }
  // wrap the global showTab (nav clicks) so switching to Profile draws us
  var _st = window.showTab;
  window.showTab = function (t) {
    var r = (typeof _st === 'function') ? _st.apply(this, arguments) : undefined;
    if (t === 'profile') setTimeout(render, 30);
    return r;
  };
  // keep fresh while visible (progress bars, live activity)
  setInterval(maybeRender, 1500);
  // initial
  if (document.readyState !== 'loading') setTimeout(maybeRender, 300);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(maybeRender, 300); });

  window.HearthriseHome = { render: render };
  console.log('[home-dashboard] loaded');
})();
