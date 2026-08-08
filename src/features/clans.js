// ============================================================
// src/features/clans.js  (b206, SYS-9 + SYS-10 client)
//
// REAL clans + leaderboards, replacing the legacy NetClient mock
// (8 hardcoded users, 3 fake clans, "GuildMaster Online" roster).
// Talks to the Supabase backbone from supabase/schema.sql:
//   • clans / clan_members tables (+ clan_contribute RPC that banks
//     gold into the treasury and auto-levels the clan)
//   • leaderboard / clan_leaderboard views (over the cloud saves
//     every signed-in player already uploads)
//   • chat clan channel: joining sets G.clanId, and chat.js's
//     clanWireId() routes 'clan' → 'clan:<id>' — so clan chat is
//     live the moment you join.
//
// ── b223: `level` IS NOT THE CASTLE, AND ITS PERK LADDER IS NOW A BASELINE ──
//
// `clan_contribute` computes the next threshold as 10000 x 4^(level-1), which
// puts level 10 at 655,360,000 gold. The comment that used to stand here
// documented the thresholds as "10k, 50k, 200k, 800k, 3M" — a fourth, entirely
// invented ladder that had been wrong since b206. Both are recorded in
// clan-overhaul.md §2.3 / §15.1 as the structural bug that v2 exists to fix.
//
// The real thresholds are: Lv2 10,000 · Lv3 40,000 · Lv4 160,000 · Lv5 640,000
// · Lv6 2,560,000 · Lv7 10,240,000 · Lv8 40,960,000 · Lv9 163,840,000 ·
// Lv10 655,360,000. Castle progression therefore does NOT gate on `level` — it
// gates on Standing (clan-seat.js / clan-seat-ui.js). `level` is a cosmetic
// "age of the hold" badge and its perk ladder is re-scoped to a MEMBERSHIP
// BASELINE:
//
//   Lv4 +1h offline cap · Lv7 +2h offline cap · Lv10 castle banner (cosmetic)
//
// Everything else it used to grant for free — +25% all XP, +8% gather speed,
// +5% artisan speed — is deleted, because with the castle on top `allXP` alone
// would have stacked homestead 20 + renown 22 + auto-level 25 + Great Hall 5 =
// +72% (clan-overhaul §8.3). Post-re-scope the permanent ceiling is +47%, and
// clan-seat-ui.js carries the +60% fuse. Joining a clan now grants +3h offline
// and a banner; everything meaningful is EARNED through the castle rather than
// ACCRUED by banking gold.
//
// This is a deliberate net power REDUCTION and it lands in the same wave as the
// buildings, which is exactly what the perk-stacking conflict demanded.
//
// Offline-friendly: with no Supabase config or signed-out, the
// social panel shows an honest sign-in prompt — never fake data.
// ============================================================
(function () {
  'use strict';

  var PERKS = [
    null,                                                       // Lv1 — founding
    null,
    null,                                                       // Lv2 — re-scoped away (§8.3)
    null,                                                       // Lv3 — re-scoped away
    { offlineHours: 1, label: '+1h offline cap' },              // Lv4
    null,                                                       // Lv5 — re-scoped away
    null,                                                       // Lv6 — re-scoped away
    { offlineHours: 2, label: '+2h offline cap' },              // Lv7
    null,                                                       // Lv8 — re-scoped away
    null,                                                       // Lv9 — re-scoped away
    { label: 'Castle banner (cosmetic)' }                       // Lv10 — no stat
  ];

  function cfg() {
    return (window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig()) || null;
  }
  function session() {
    return (window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession()) || null;
  }
  function headers(withJson) {
    var c = cfg(), s = session();
    var h = { 'apikey': c.anonKey, 'Authorization': 'Bearer ' + ((s && s.access_token) || c.anonKey) };
    if (withJson) { h['Content-Type'] = 'application/json'; h['Prefer'] = 'return=representation'; }
    return h;
  }
  function online() { return !!cfg(); }
  function signedIn() { var s = session(); return !!(s && s.access_token && s.user); }

  var _myClan = null;      // cached {id, name, level, treasury, castle_tier, upgrades}

  // Cumulative perks up to the clan's level
  function perksFor(level) {
    var out = { allXP: 0, gatherSpeed: 0, cookSpeed: 0, smithSpeed: 0, craftSpeed: 0, offlineHours: 0, labels: [] };
    for (var l = 0; l <= Math.min(level || 0, PERKS.length - 1); l++) {
      var p = PERKS[l];
      if (!p) continue;
      Object.keys(p).forEach(function (k) { if (k !== 'label') out[k] += p[k]; });
      out.labels.push('Lv' + l + ': ' + p.label);
    }
    return out;
  }
  function myPerks() { return perksFor(_myClan ? _myClan.level : 0); }

  // ── REST ───────────────────────────────────────────────────
  async function listClans() {
    if (!online()) return [];
    var res = await fetch(cfg().url + '/rest/v1/clan_leaderboard?limit=25', { headers: headers() });
    if (!res.ok) return [];
    return res.json();
  }

  async function fetchMyClan() {
    _myClan = null;
    if (!online() || !signedIn()) return null;
    var uid = session().user.id;
    var res = await fetch(cfg().url + '/rest/v1/clan_members?user_id=eq.' + uid + '&select=clan_id,role,contributed,clans(id,name,level,treasury,castle_tier,upgrades)', { headers: headers() });
    if (!res.ok) return null;
    var rows = await res.json();
    if (!rows.length || !rows[0].clans) return null;
    _myClan = rows[0].clans;
    _myClan.myRole = rows[0].role;
    _myClan.myContributed = rows[0].contributed;
    var G = window.G || {};
    G.clanId = _myClan.id; G.clanName = _myClan.name;
    return _myClan;
  }

  async function createClan(name) {
    name = (name || '').trim();
    if (name.length < 3 || name.length > 24) { notify('Clan name must be 3–24 characters', 'kill'); return null; }
    if (!requireOnline()) return null;
    var uid = session().user.id;
    var res = await fetch(cfg().url + '/rest/v1/clans', {
      method: 'POST', headers: headers(true),
      body: JSON.stringify({ name: name, created_by: uid })
    });
    if (!res.ok) {
      notify(res.status === 409 ? 'That clan name is taken' : 'Could not create clan (' + res.status + ')', 'kill');
      return null;
    }
    var clan = (await res.json())[0];
    await joinById(clan.id, 'leader');
    notify(name + ' is founded — a Wayside Camp, and yours. Rally your allies.', 'levelup');
    return clan;
  }

  async function joinById(clanId, role) {
    if (!requireOnline()) return false;
    var uid = session().user.id;
    var res = await fetch(cfg().url + '/rest/v1/clan_members', {
      method: 'POST', headers: headers(true),
      body: JSON.stringify({ clan_id: clanId, user_id: uid, role: role || 'member' })
    });
    if (!res.ok) { notify('Could not join (' + res.status + ')', 'kill'); return false; }
    await fetchMyClan();
    if (typeof window.saveLocal === 'function') saveLocal();
    if (typeof window.renderSocial === 'function') renderSocial();
    if (typeof window.updateTopbar === 'function') updateTopbar();
    return true;
  }

  async function leave() {
    if (!requireOnline()) return false;
    var uid = session().user.id;
    var id = _myClan && _myClan.id;
    if (!id) { finishLeave(); return true; }
    var res = await fetch(cfg().url + '/rest/v1/clan_members?clan_id=eq.' + id + '&user_id=eq.' + uid, {
      method: 'DELETE', headers: headers()
    });
    if (!res.ok) { notify('Could not leave (' + res.status + ')', 'kill'); return false; }
    finishLeave();
    return true;
  }
  function finishLeave() {
    _myClan = null;
    var G = window.G || {};
    G.clanId = null; G.clanName = null;
    if (typeof window.saveLocal === 'function') saveLocal();
    if (typeof window.renderSocial === 'function') renderSocial();
    if (typeof window.updateTopbar === 'function') updateTopbar();
    notify('You left the clan.', 'info');
  }

  async function contribute(amount) {
    amount = Math.floor(+amount || 0);
    var G = window.G || {};
    if (amount <= 0) return false;
    if ((G.gold || 0) < amount) { notify('Not enough gold', 'kill'); return false; }
    if (!requireOnline() || !_myClan) return false;
    var res = await fetch(cfg().url + '/rest/v1/rpc/clan_contribute', {
      method: 'POST', headers: headers(true),
      body: JSON.stringify({ p_clan_id: _myClan.id, p_amount: amount })
    });
    if (!res.ok) { notify('Contribution failed (' + res.status + ')', 'kill'); return false; }
    var out = await res.json();
    if (!out || out.ok === false) { notify('Contribution rejected: ' + (out && out.error), 'kill'); return false; }
    G.gold -= amount;                                   // gold sink → clan treasury
    var leveled = out.level > _myClan.level;
    _myClan.treasury = out.treasury; _myClan.level = out.level;
    _myClan.myContributed = (_myClan.myContributed || 0) + amount;
    if (typeof window.saveLocal === 'function') saveLocal();
    if (typeof window.updateTopbar === 'function') updateTopbar();
    /* The level is the hold's AGE, not its power (§2.3). Saying "new perk
       unlocked" at every level was a promise the re-scoped ladder no longer
       keeps — it keeps two, at Lv4 and Lv7, and says so where it is true. */
    notify(leveled
      ? ('The hold is older: Lv ' + out.level + '. Its strength comes from the castle, not the coffer.')
      : ('Banked ' + amount.toLocaleString() + 'g — the hold pays its upkeep and its builders from this.'),
      leveled ? 'levelup' : 'info');
    if (typeof window.renderSocial === 'function') renderSocial();
    return true;
  }

  /* b223: the roster carries the castle's ladder too. `cp`/`cp_at`/`charge`/
     `joined_at` are added by 2026-08-08-clan-seat.sql; PostgREST answers 400 on
     a select naming a column that does not exist yet, so the un-migrated shape
     is tried as a FALLBACK rather than assumed. The panel then shows an em dash
     for Contribution instead of a fabricated number — a roster that invents a
     ladder is worse than one that admits it has none. */
  var ROSTER_FULL = 'user_id,role,charge,contributed,cp,cp_at,joined_at,profiles(display_name)';
  var ROSTER_BASE = 'user_id,role,contributed,profiles(display_name)';
  var _rosterCols = null;
  async function roster() {
    if (!online() || !_myClan) return [];
    var cols = _rosterCols || ROSTER_FULL;
    var url = cfg().url + '/rest/v1/clan_members?clan_id=eq.' + _myClan.id +
      '&select=' + cols + '&order=contributed.desc&limit=60';
    var res = await fetch(url, { headers: headers() });
    if (!res.ok && cols === ROSTER_FULL) {
      _rosterCols = ROSTER_BASE;
      return roster();
    }
    if (!res.ok) return [];
    _rosterCols = cols;
    return res.json();
  }

  function requireOnline() {
    if (!online()) { notify('Multiplayer server not configured', 'kill'); return false; }
    if (!signedIn()) {
      notify('Sign in (top of Home) to use clans', 'kill');
      return false;
    }
    return true;
  }

  // ── replace the mock NetClient endpoints ───────────────────
  /* The REAL `clan_contribute` ladder: 10000 x 4^(level-1). Exported so the
     Storehouse can print the next "age of the hold" threshold from the same
     arithmetic the server runs, instead of the invented ladder that used to sit
     in this file's header. */
  function nextTreasuryGoal(level) { return 10000 * Math.pow(4, (level || 1) - 1); }

  function patchNetClient() {
    if (typeof NetClient === 'undefined') return;
    var origLb = NetClient.leaderboard.bind(NetClient);
    NetClient.leaderboard = async function (mode) {
      if (!online()) return origLb(mode);
      try {
        var order = mode === 'combat' ? 'combat_level.desc.nullslast' : mode === 'gold' ? 'gold.desc.nullslast' : 'total_level.desc.nullslast';
        var res = await fetch(cfg().url + '/rest/v1/leaderboard?order=' + order + '&limit=15', { headers: headers() });
        if (!res.ok) return origLb(mode);
        var rows = await res.json();
        var meId = signedIn() ? session().user.id : null;
        var list = rows.map(function (r, i) {
          return { id: r.user_id, rank: i + 1,
            displayName: r.name + (r.user_id === meId ? ' (You)' : '') + (r.clan_name ? ' [' + r.clan_name + ']' : ''),
            total: r.total_level || 0, combat: r.combat_level || 0, gold: +r.gold || 0,
            you: r.user_id === meId };
        });
        return { ok: true, mode: mode, list: list, live: true };
      } catch (e) { return origLb(mode); }
    };
    NetClient.clans = async function () {
      if (!online()) return { ok: true, clans: [] };
      try {
        var rows = await listClans();
        return { ok: true, clans: rows.map(function (c) {
          return { id: c.id, name: c.name, members: +c.members || 0,
            bonus: 'Lv ' + c.level + (perksFor(c.level).labels.length ? ' · ' + perksFor(c.level).labels.slice(-1)[0].split(': ')[1] : '') };
        }) };
      } catch (e) { return { ok: true, clans: [] }; }
    };
  }

  // ── real social-panel clan section ─────────────────────────
  async function renderClanSection() {
    var cl = document.getElementById('social-panel');
    if (!cl) return;
    var G = window.G || {};
    if (!online() || !signedIn()) {
      cl.innerHTML = '<div class="muted tiny" style="margin-bottom:10px">Clans are live multiplayer — sign in to found one, join one, and build your clan castle together.</div>' +
        '<button class="btn btn-primary btn-sm" onclick="(window.HearthriseAuth&&window.HearthriseAuth.showSignIn)?window.HearthriseAuth.showSignIn():notify(\'Open Home → Sign in\',\'info\')">Sign in</button>';
      return;
    }
    if (!_myClan) await fetchMyClan();
    if (_myClan) {
      /* b223: the in-clan half of this panel is THE CASTLE now, and it belongs
         to clan-seat-ui.js. This file keeps what it has always owned — finding,
         joining, leaving, the gold treasury and the membership baseline perks —
         and hands the rendering of the hold to the module that owns the castle
         maths. Two files drawing one screen from two models is how a panel ends
         up disagreeing with itself.

         If that module is absent (it is a separate script tag), the fallback
         below is the honest minimum: the hold's name, its treasury, and the way
         out. It never pretends there is a castle it cannot draw. */
      var UI = window.HearthriseClanSeatUI;
      if (UI && typeof UI.render === 'function') {
        UI.render(cl);
        UI.readSeat().then(function () { UI.render(cl); }).catch(function () {});
        return;
      }
      cl.innerHTML =
        '<div class="tiny" style="margin-bottom:8px"><b>' + escapeHtml(_myClan.name) + '</b> · ' +
          escapeHtml(_myClan.myRole || 'member') + '</div>' +
        '<div class="tiny muted" style="margin-bottom:8px">Treasury ' + (+_myClan.treasury).toLocaleString() + 'g</div>' +
        '<button class="btn btn-sm btn-danger" onclick="window.HearthriseClans.leave()">Leave</button>';
    } else {
      var cr = await NetClient.clans();
      cl.innerHTML =
        '<div class="muted tiny" style="margin-bottom:10px">Join a clan to unlock clan chat + shared perks, and build the clan castle together.</div>' +
        (cr.clans.length ? cr.clans.map(function (c) {
          return '<div class="shop-row"><div class="info"><b>' + escapeHtml(c.name) + '</b><span>' + c.members + ' members · ' + c.bonus + '</span></div>' +
            '<button class="btn btn-sm btn-primary" onclick="window.HearthriseClans.joinById(\'' + c.id + '\')">Join</button></div>';
        }).join('') : '<div class="muted tiny" style="margin-bottom:8px">No clans yet — found the first one.</div>') +
        '<div style="margin-top:10px;display:flex;gap:6px">' +
          '<input type="text" id="clan-input" placeholder="Found a new clan" maxlength="24" style="flex:1;background:rgba(255,255,255,.04);border:1px solid var(--line-soft);border-radius:8px;padding:8px 10px;color:var(--ink)">' +
          '<button class="btn btn-primary" onclick="window.HearthriseClans.createClan(document.getElementById(\'clan-input\').value)">Create</button></div>';
    }
  }

  // Wrap renderSocial: keep the legacy leaderboard half, replace the clan half.
  function patchRenderSocial() {
    var orig = window.renderSocial;
    if (typeof orig !== 'function') return;
    window.renderSocial = async function () {
      await orig.apply(this, arguments);
      try { await renderClanSection(); } catch (e) {}
    };
  }
  // Real clan ops behind the legacy onclick names too.
  function patchClanFns() {
    window.joinClan = function (name) {
      // legacy passed a NAME from the create box; route to createClan
      window.HearthriseClans.createClan(name);
    };
    window.leaveClan = function () { window.HearthriseClans.leave(); };
  }

  // ── perk wiring: getBonus + offline cap ────────────────────
  var origGetBonus2 = null;
  function patchGetBonus() {
    if (typeof window.getBonus !== 'function') return;
    origGetBonus2 = window.getBonus;
    window.getBonus = function (key) {
      var t = origGetBonus2.apply(this, arguments);
      try { var p = myPerks(); if (p[key]) t += p[key]; } catch (e) {}
      return t;
    };
  }

  function boot() {
    try {
      patchNetClient();
      patchRenderSocial();
      patchClanFns();
      patchGetBonus();
      // hydrate clan membership shortly after auth settles
      setTimeout(function () { fetchMyClan().catch(function () {}); }, 2500);
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  window.HearthriseClans = {
    PERKS: PERKS,
    perksFor: perksFor,
    myPerks: myPerks,
    myClan: function () { return _myClan; },
    fetchMyClan: fetchMyClan,
    listClans: listClans,
    createClan: createClan,
    joinById: joinById,
    leave: leave,
    contribute: contribute,
    nextTreasuryGoal: nextTreasuryGoal,
    roster: roster,
    offlineBonusHours: function () { return myPerks().offlineHours || 0; },
    _online: online, _signedIn: signedIn
  };
})();
