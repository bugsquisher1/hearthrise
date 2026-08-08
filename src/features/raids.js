// ============================================================
// src/features/raids.js  (b209, SYS-6)
//
// Weekly RAIDS that actually function (final directive §16): an
// ASYNCHRONOUS cooperative boss. One shared HP pool per clan per UTC
// week (Supabase clan_raids + the raid_strike RPC — atomic decrement,
// server-clamped damage, per-member contribution ledger). Members
// strike on their own schedule; when the pool hits zero, every
// contributor claims the chest once. No lobby needed — real
// cooperation that fits an idle game.
//
// Solo players raid a personally-scaled pool (same loop, local state)
// so the content is never a locked door — but the clan pool pays
// better, which is the social pull.
//
// A STRIKE is real combat math: 120 simulated ticks of YOUR rolls
// (getPlayerCombatRolls — gear, style, weakness, buffs, world events
// all flow in) against the raid boss's defense. One strike per UTC
// day per player. Better gear = visibly bigger strikes.
//
// Bosses are ORIGINAL (no OSRS IP), rotating weekly.
// ============================================================
(function () {
  'use strict';

  var BOSSES = [
    { id: 'emberclad_tyrant', name: 'The Emberclad Tyrant', glyph: '☲',
      desc: 'A furnace given a crown. Its slag-armor weeps molten iron.',
      def: 55, weak: 'hammer',
      reward: { gold: 12000, gems: 25, items: { mithril_bar: 6, hell_ember: 2 } } },
    { id: 'hollow_regent', name: 'The Hollow Regent', glyph: '♔',
      desc: 'A king who outlived his own bones. The crown remembers.',
      def: 48, weak: 'magic',
      reward: { gold: 10000, gems: 25, items: { ancient_rune: 4, grave_dust: 8 } } },
    { id: 'maw_below', name: 'The Maw Below', glyph: '◎',
      desc: 'The lake was never empty. It was waiting.',
      def: 62, weak: 'ranged',
      reward: { gold: 14000, gems: 30, items: { dragon_scale: 3, silk_thread: 10 } } }
  ];
  var CLAN_POOL_HP = 250000;
  var SOLO_POOL_HP = 30000;
  var REQ_COMBAT_LV = 30;

  function W() { return window.HearthriseWorldEvents; }
  function weekKey() { return W() ? W().utcWeekKey() : 'w0'; }
  function dayKey() { return W() ? W().utcDayKey() : 'd0'; }
  function bossOfWeek(wk) {
    var h = W() ? W()._hash('hr-raid-' + (wk || weekKey())) : 0;
    return BOSSES[h % BOSSES.length];
  }

  function cfg() { return (window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig()) || null; }
  function session() { return (window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession()) || null; }
  function headers(j) {
    var c = cfg(), s = session();
    var h = { 'apikey': c.anonKey, 'Authorization': 'Bearer ' + ((s && s.access_token) || c.anonKey) };
    if (j) { h['Content-Type'] = 'application/json'; h['Prefer'] = 'return=representation'; }
    return h;
  }
  function inClan() { return !!(window.G && window.G.clanId && cfg() && session()); }

  function ensureState() {
    var G = window.G || {};
    if (!G.raids) G.raids = { lastStrikeDay: null, solo: null, claimed: {} };
    // reset the solo pool each week
    if (!G.raids.solo || G.raids.solo.week !== weekKey()) {
      G.raids.solo = { week: weekKey(), hp: SOLO_POOL_HP, damage: 0 };
    }
    return G.raids;
  }

  // Real combat math: simulate N ticks of the player's rolls vs the boss.
  function simulateStrike(boss) {
    var ticks = 120, total = 0;
    var mob = { def: boss.def, weaponWeak: boss.weak, family: 'Mythic' };
    for (var i = 0; i < ticks; i++) {
      try {
        var r = window.getPlayerCombatRolls(mob);
        if (Math.random() < (r.accuracy || 0.5)) {
          total += Math.max(1, Math.floor(Math.random() * (r.maxHit || 2)) + 1);
        }
      } catch (e) { total += 1; }
    }
    return Math.max(10, Math.min(50000, total));   // mirror the server clamp
  }

  async function strike() {
    var G = window.G || {};
    var st = ensureState();
    if ((typeof window.getCombatLevel === 'function' ? window.getCombatLevel() : 0) < REQ_COMBAT_LV) {
      notify('Reach combat level ' + REQ_COMBAT_LV + ' to raid', 'kill'); return null;
    }
    if (st.lastStrikeDay === dayKey()) {
      notify('You already struck the raid boss today — return tomorrow', 'kill'); return null;
    }
    var boss = bossOfWeek();
    var dmg = simulateStrike(boss);
    st.lastStrikeDay = dayKey();

    if (inClan()) {
      try {
        var res = await fetch(cfg().url + '/rest/v1/rpc/raid_strike', {
          method: 'POST', headers: headers(true),
          body: JSON.stringify({ p_clan_id: G.clanId, p_week: weekKey(), p_boss: boss.id, p_max_hp: CLAN_POOL_HP, p_damage: dmg })
        });
        var out = res.ok ? await res.json() : null;
        if (!out || out.ok === false) { st.lastStrikeDay = null; notify('Strike failed — try again', 'kill'); return null; }
        var pct = Math.round(100 * out.hp_remaining / CLAN_POOL_HP);
        notify('⚔ You dealt ' + dmg.toLocaleString() + ' to ' + boss.name + ' — ' + (out.downed ? 'THE BOSS FALLS! Claim your chest.' : pct + '% remains'), out.downed ? 'levelup' : 'loot');
        if (typeof window.saveLocal === 'function') saveLocal();
        render();
        return { dmg: dmg, downed: out.downed };
      } catch (e) { st.lastStrikeDay = null; notify('Strike failed (network)', 'kill'); return null; }
    } else {
      st.solo.hp = Math.max(0, st.solo.hp - dmg);
      st.solo.damage += dmg;
      var downed = st.solo.hp === 0;
      notify('⚔ You dealt ' + dmg.toLocaleString() + ' to ' + boss.name + ' — ' + (downed ? 'THE BOSS FALLS! Claim your chest.' : Math.round(100 * st.solo.hp / SOLO_POOL_HP) + '% remains'), downed ? 'levelup' : 'loot');
      if (typeof window.saveLocal === 'function') saveLocal();
      render();
      return { dmg: dmg, downed: downed };
    }
  }

  async function clanStatus() {
    if (!inClan()) return null;
    try {
      var res = await fetch(cfg().url + '/rest/v1/clan_raids?clan_id=eq.' + window.G.clanId + '&week_key=eq.' + weekKey(), { headers: headers() });
      var rows = res.ok ? await res.json() : [];
      return rows[0] || null;
    } catch (e) { return null; }
  }

  function grantReward(boss, scale) {
    var G = window.G;
    var gold = Math.floor(boss.reward.gold * scale);
    var gems = Math.floor(boss.reward.gems * scale);
    G.gold = (G.gold || 0) + gold;
    G.gems = (G.gems || 0) + gems;
    Object.keys(boss.reward.items).forEach(function (id) {
      var q = Math.max(1, Math.floor(boss.reward.items[id] * scale));
      if (typeof window.addItem === 'function') addItem(id, q);
    });
    notify('🏆 Raid chest: +' + gold.toLocaleString() + 'g, +' + gems + ' gems, rare materials!', 'levelup');
    if (typeof window.saveLocal === 'function') saveLocal();
    if (typeof window.updateTopbar === 'function') updateTopbar();
  }

  async function claim() {
    var st = ensureState();
    var boss = bossOfWeek();
    var wk = weekKey();
    if (st.claimed[wk]) { notify('Chest already claimed this week', 'kill'); return false; }
    if (inClan()) {
      var raid = await clanStatus();
      if (!raid || +raid.hp_remaining > 0) { notify('The boss still stands — keep striking!', 'kill'); return false; }
      // atomic: only flips my own claimed=false row
      var uid = session().user.id;
      var res = await fetch(cfg().url + '/rest/v1/raid_contributions?clan_id=eq.' + window.G.clanId + '&week_key=eq.' + wk + '&user_id=eq.' + uid + '&claimed=eq.false', {
        method: 'PATCH', headers: headers(true), body: JSON.stringify({ claimed: true })
      });
      var flipped = res.ok ? await res.json() : [];
      if (!flipped.length) { notify('No unclaimed contribution found — strike at least once', 'kill'); return false; }
      st.claimed[wk] = true;
      grantReward(boss, 1.0);                        // full clan-scale reward
      render();
      return true;
    } else {
      if (st.solo.hp > 0) { notify('The boss still stands — keep striking!', 'kill'); return false; }
      st.claimed[wk] = true;
      grantReward(boss, 0.4);                        // solo pool pays less — join a clan
      render();
      return true;
    }
  }

  // ── UI card at the top of the Dungeons panel ───────────────
  async function render() {
    var panel = document.getElementById('panel-dungeons');
    if (!panel) return;
    ensureState();
    var host = document.getElementById('hr-raid-card');
    if (!host) {
      host = document.createElement('div');
      host.id = 'hr-raid-card';
      host.className = 'card';
      host.style.cssText = 'margin-bottom:10px';
      panel.insertBefore(host, panel.firstChild);
    }
    var G = window.G, st = G.raids, boss = bossOfWeek(), wk = weekKey();
    var clan = inClan();
    var hp = null, max = clan ? CLAN_POOL_HP : SOLO_POOL_HP;
    if (clan) { var r = await clanStatus(); hp = r ? +r.hp_remaining : max; }
    else hp = st.solo.hp;
    var pct = Math.max(0, Math.min(100, Math.round(100 * hp / max)));
    var struckToday = st.lastStrikeDay === dayKey();
    var downed = hp === 0;
    var claimed = !!st.claimed[wk];
    host.innerHTML =
      '<div class="card-head"><div class="card-title">' + boss.glyph + ' Weekly Raid — ' + boss.name + '</div>' +
      '<div class="card-sub">' + (clan ? 'Clan raid' : 'Solo raid (join a clan for the full pool + bigger chest)') + '</div></div>' +
      '<div class="card-body" style="padding:12px 14px">' +
        '<div class="tiny muted" style="margin-bottom:8px">' + boss.desc + ' Weak to <b style="color:var(--gold-2)">' + boss.weak + '</b>.</div>' +
        '<div style="height:10px;background:rgba(0,0,0,.35);border-radius:99px;overflow:hidden;border:1px solid var(--line-soft)">' +
          '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,var(--red),#d4633f)"></div></div>' +
        '<div class="tiny muted" style="margin:4px 0 10px">' + hp.toLocaleString() + ' / ' + max.toLocaleString() + ' HP · resets weekly</div>' +
        (downed
          ? (claimed
            ? '<div class="tiny" style="color:var(--gold-2)">🏆 Chest claimed — a new horror rises next week.</div>'
            : '<button class="btn btn-primary btn-sm" onclick="window.HearthriseRaids.claim()">Claim raid chest</button>')
          : '<button class="btn ' + (struckToday ? '' : 'btn-primary') + ' btn-sm" ' + (struckToday ? 'disabled' : '') + ' onclick="window.HearthriseRaids.strike()">' +
              (struckToday ? 'Struck today — return tomorrow' : 'Strike the boss (1/day)') + '</button>') +
      '</div>';
  }

  function boot() {
    try {
      ensureState();
      render();
      setInterval(function () {
        if (document.getElementById('panel-dungeons') && document.getElementById('panel-dungeons').classList.contains('active')) render();
      }, 15000);
      // re-render when the dungeons tab is shown
      document.addEventListener('click', function (e) {
        var t = e.target && e.target.closest && e.target.closest('[data-tab="dungeons"]');
        if (t) setTimeout(render, 150);
      });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 400); });
  else setTimeout(boot, 400);

  window.HearthriseRaids = {
    BOSSES: BOSSES,
    bossOfWeek: bossOfWeek,
    simulateStrike: simulateStrike,
    strike: strike,
    claim: claim,
    ensureState: ensureState,
    render: render,
    CLAN_POOL_HP: CLAN_POOL_HP, SOLO_POOL_HP: SOLO_POOL_HP
  };
})();
