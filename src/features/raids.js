// ============================================================
// src/features/raids.js  (b209, SYS-6 · hardened Wave 1b 2026-08-08)
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
// ── WHERE THE RULES LIVE (Wave 1b) ──────────────────────────
// The SERVER owns the raid economy. Everything in this file is a
// MIRROR for UX — a fast local "no" so the player isn't waiting on a
// round trip to be told they already struck today. The server is the
// only thing that decides:
//   • one strike per UTC day        (raid_strike, day gate)
//   • which UTC day/week it is      (hr_utc_day_key / hr_utc_week_key)
//   • how big the pool is           (server constant, not a parameter)
//   • who may claim a chest, once   (raid_claim + the raid_claims ledger)
// See supabase/migrations/2026-08-08-raid-hardening.sql.
//
// This file is written to work against BOTH the hardened server and a
// server that hasn't had the migration run yet: raid_strike keeps its
// original signature and old response shape is tolerated, and the new
// raid_claim RPC is FEATURE-DETECTED (404 → fall back to the legacy
// PATCH). So the client can ship before the migration is applied.
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

  // ── Clock ───────────────────────────────────────────────────
  // HearthriseWorldEvents is the shared clock for every timed system —
  // read it, never reimplement it. The server derives the same two keys
  // itself (hr_utc_day_key / hr_utc_week_key) and is authoritative. If a
  // device clock is wrong enough to straddle a boundary the server tells
  // us its key and we adopt it — but only while OUR key is still the one
  // it disagreed with, so the correction expires on its own.
  var clockFix = { week: null, day: null };
  function localWeekKey() { return W() ? W().utcWeekKey() : 'w0'; }
  function localDayKey() { return W() ? W().utcDayKey() : 'd0'; }
  function weekKey() {
    var l = localWeekKey();
    return (clockFix.week && clockFix.week.local === l) ? clockFix.week.server : l;
  }
  function dayKey() {
    var l = localDayKey();
    return (clockFix.day && clockFix.day.local === l) ? clockFix.day.server : l;
  }
  function adoptWeek(w) {
    if (!w) return;                                   // old server: says nothing, we keep ours
    var l = localWeekKey();
    clockFix.week = (w === l) ? null : { local: l, server: w };
  }
  function adoptDay(d) {
    if (!d) return;
    var l = localDayKey();
    clockFix.day = (d === l) ? null : { local: l, server: d };
  }

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
  function persist() { if (typeof window.saveLocal === 'function') window.saveLocal(); }

  function ensureState() {
    var G = window.G || {};
    if (!G.raids) G.raids = { lastStrikeDay: null, solo: null, claimed: {} };
    if (!G.raids.claimed || typeof G.raids.claimed !== 'object') G.raids.claimed = {};
    var wk = weekKey();
    // reset the solo pool each week
    if (!G.raids.solo || G.raids.solo.week !== wk) {
      G.raids.solo = { week: wk, hp: SOLO_POOL_HP, damage: 0 };
    }
    // The claim mirror only ever needs the CURRENT week — without this it
    // grows a key per week forever inside the manual snapshotG allowlist.
    var cur = +String(wk).replace(/^w/, '');
    if (isFinite(cur)) {
      Object.keys(G.raids.claimed).forEach(function (k) {
        var n = +String(k).replace(/^w/, '');
        if (isFinite(n) && n < cur) delete G.raids.claimed[k];
      });
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

  // ── Honest messages for every server refusal ────────────────
  // A player who is told "try again" for something that will never succeed
  // learns to spam the button. Every code the server can return gets its
  // own truthful sentence, and none of them invite a retry loop.
  var STRIKE_ERRORS = {
    already_struck_today: 'You already struck the raid boss today — return tomorrow',
    not_member: 'You are no longer a member of that clan',
    not_signed_in: 'Sign in to strike the clan raid',
    bad_damage: 'The server refused that strike',
    week_mismatch: 'Your clock is out of step with the server — reload and try again'
  };
  var CLAIM_ERRORS = {
    already_claimed: 'You have already claimed a raid chest this week',
    not_downed: 'The boss still stands — keep striking!',
    no_contribution: 'You never struck this boss — no chest this week',
    joined_after_kill: 'You joined after the boss fell — no chest this week',
    not_member: 'You are no longer a member of that clan',
    not_signed_in: 'Sign in to claim your raid chest',
    bad_scope: 'The server refused that claim',
    bad_clan: 'The server refused that claim',
    week_mismatch: 'Your clock is out of step with the server — reload and try again',
    network: 'Could not reach the server — try again in a moment'
  };
  function strikeErrorText(err) { return STRIKE_ERRORS[err] || 'Strike failed — the boss is untouched'; }
  function claimErrorText(err) { return CLAIM_ERRORS[err] || 'The server refused that claim'; }

  // ── Pure reducers over the server payloads ──────────────────
  // Kept free of fetch and DOM so the backward-compatibility contract is
  // directly testable (see smoke-test.js "raid hardening").
  //
  // reduceStrike tolerates the PRE-MIGRATION response shape, which carries
  // only {ok, hp_remaining, downed} — no day, no week, no max_hp.
  function reduceStrike(out, attempt) {
    // Contract check first: the RPC always answers with a boolean `ok`. A
    // PostgREST error envelope, an HTML error page or a null body must never
    // fall through to the success branch.
    if (!out || typeof out !== 'object' || typeof out.ok !== 'boolean') {
      return { action: 'fail', message: strikeErrorText('') };
    }
    if (out.ok === false) {
      var err = out.error || '';
      if (err === 'week_mismatch' && out.week && !attempt) {
        return { action: 'retry', week: out.week, day: out.day };
      }
      if (err === 'already_struck_today') {
        return { action: 'blocked', week: out.week, day: out.day, message: strikeErrorText(err) };
      }
      return { action: 'fail', message: strikeErrorText(err) };
    }
    return {
      action: 'accept', week: out.week, day: out.day,
      hp: Math.max(0, +out.hp_remaining || 0),
      max: +out.max_hp || CLAN_POOL_HP,
      damage: +out.damage || 0,
      downed: !!out.downed
    };
  }

  // reduceClaim also decides "this server has no raid_claim RPC yet", which
  // is what lets this client ship before the migration is applied.
  function reduceClaim(status, out, attempt) {
    if (status === 404 || (out && (out.code === 'PGRST202' || out.code === '42883'))) {
      return { action: 'unsupported' };
    }
    // Anything that isn't the RPC's own {ok:boolean,…} envelope — a 401, a
    // 500, an error object — is a refusal, never a chest.
    if (status >= 400 || !out || typeof out !== 'object' || typeof out.ok !== 'boolean') {
      return { action: 'fail', message: claimErrorText('') };
    }
    if (out.ok === false) {
      var err = out.error || '';
      if (err === 'week_mismatch' && out.week && !attempt) return { action: 'retry', week: out.week };
      if (err === 'already_claimed') return { action: 'spent', message: claimErrorText(err) };
      return { action: 'fail', message: claimErrorText(err) };
    }
    return { action: 'accept', scale: +out.scale || null, week: out.week };
  }

  // ── Transport ───────────────────────────────────────────────
  // Feature detection for the raid_claim RPC. A NEGATIVE probe expires after
  // ten minutes so a session that was open while the migration was applied
  // starts using the hardened path without a reload.
  var claimRpc = { known: null, at: 0 };
  function claimRpcMissing() { return claimRpc.known === false && (Date.now() - claimRpc.at) < 600000; }
  function noteClaimRpc(present) { claimRpc = { known: present, at: Date.now() }; }

  async function rpc(name, body) {
    var res = await fetch(cfg().url + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: headers(true), body: JSON.stringify(body)
    });
    var json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    return { status: res.status, ok: res.ok, json: json };
  }

  // ── Strike ──────────────────────────────────────────────────
  function canStrike() {
    var st = ensureState();
    var lv = (typeof window.getCombatLevel === 'function' ? window.getCombatLevel() : 0);
    if (lv < REQ_COMBAT_LV) return { ok: false, reason: 'level', message: 'Reach combat level ' + REQ_COMBAT_LV + ' to raid' };
    if (st.lastStrikeDay === dayKey()) return { ok: false, reason: 'struck_today', message: STRIKE_ERRORS.already_struck_today };
    return { ok: true, reason: '' };
  }

  async function strike() {
    var gate = canStrike();                 // fast local mirror — UX only
    if (!gate.ok) { notify(gate.message, 'kill'); return null; }
    var boss = bossOfWeek();
    var dmg = simulateStrike(boss);
    return inClan() ? await clanStrike(boss, dmg, 0) : soloStrike(boss, dmg);
  }

  async function clanStrike(boss, dmg, attempt) {
    var st = ensureState(), G = window.G, r;
    try {
      r = await rpc('raid_strike', {
        p_clan_id: G.clanId, p_week: weekKey(), p_boss: boss.id,
        p_max_hp: CLAN_POOL_HP, p_damage: dmg
      });
    } catch (e) {
      notify('Strike failed (network) — the boss is untouched', 'kill');
      return null;
    }
    var d = reduceStrike(r.ok ? r.json : null, attempt);

    if (d.action === 'retry') {                     // exactly one, never a loop
      adoptWeek(d.week); adoptDay(d.day);
      ensureState();                                // the solo pool follows the corrected week
      return await clanStrike(boss, dmg, attempt + 1);
    }
    if (d.action === 'blocked') {                   // the server's day gate said no
      adoptDay(d.day); adoptWeek(d.week);
      st.lastStrikeDay = dayKey();                  // resync the mirror to the truth
      persist(); render();
      notify(d.message, 'kill');
      return null;
    }
    if (d.action !== 'accept') { notify(d.message, 'kill'); return null; }

    // Accepted. The mirror moves only AFTER the server has recorded it, so a
    // failed request can never leave the player locked out of a real strike.
    adoptDay(d.day); adoptWeek(d.week);
    st.lastStrikeDay = dayKey();
    var dealt = d.damage || dmg;
    var pct = Math.round(100 * d.hp / (d.max || CLAN_POOL_HP));
    notify('⚔ You dealt ' + dealt.toLocaleString() + ' to ' + boss.name + ' — ' +
      (d.downed ? 'THE BOSS FALLS! Claim your chest.' : pct + '% remains'),
      d.downed ? 'levelup' : 'loot');
    persist(); render();
    return { dmg: dealt, downed: d.downed };
  }

  function soloStrike(boss, dmg) {
    var st = ensureState();
    st.lastStrikeDay = dayKey();
    st.solo.hp = Math.max(0, st.solo.hp - dmg);
    st.solo.damage += dmg;
    var downed = st.solo.hp === 0;
    notify('⚔ You dealt ' + dmg.toLocaleString() + ' to ' + boss.name + ' — ' +
      (downed ? 'THE BOSS FALLS! Claim your chest.' : Math.round(100 * st.solo.hp / SOLO_POOL_HP) + '% remains'),
      downed ? 'levelup' : 'loot');
    persist(); render();
    return { dmg: dmg, downed: downed };
  }

  async function clanStatus() {
    if (!inClan()) return null;
    try {
      var res = await fetch(cfg().url + '/rest/v1/clan_raids?clan_id=eq.' + window.G.clanId + '&week_key=eq.' + encodeURIComponent(weekKey()), { headers: headers() });
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
    persist();
    if (typeof window.updateTopbar === 'function') updateTopbar();
  }

  // ── Claim ───────────────────────────────────────────────────
  // The server ledger (raid_claims) is what makes a chest un-replayable.
  // The local `claimed` map is only a mirror so the card can render without
  // a round trip — editing it grants nothing once the migration is applied.
  async function serverClaim(scope, clanId, wk, attempt) {
    if (!cfg() || !session()) return { action: 'unsupported' };
    if (claimRpcMissing()) return { action: 'unsupported' };
    var r;
    try {
      r = await rpc('raid_claim', { p_scope: scope, p_clan_id: clanId || null, p_week: wk });
    } catch (e) {
      return { action: 'fail', message: claimErrorText('network') };
    }
    var d = reduceClaim(r.status, r.json, attempt);
    noteClaimRpc(d.action !== 'unsupported');
    return d;
  }

  async function claim() {
    var st = ensureState();
    var wk = weekKey();
    if (st.claimed[wk]) { notify(CLAIM_ERRORS.already_claimed, 'kill'); return false; }
    return inClan() ? await clanClaim(wk, 0) : await soloClaim(wk, 0);
  }

  async function clanClaim(wk, attempt) {
    var st = ensureState(), boss = bossOfWeek(wk);
    var raid = await clanStatus();
    if (!raid || +raid.hp_remaining > 0) { notify(CLAIM_ERRORS.not_downed, 'kill'); return false; }
    var d = await serverClaim('clan', window.G.clanId, wk, attempt);

    if (d.action === 'retry') { adoptWeek(d.week); return await clanClaim(weekKey(), attempt + 1); }
    if (d.action === 'unsupported') return await legacyClanClaim(wk);   // pre-migration server
    if (d.action === 'spent') {
      st.claimed[wk] = true; persist(); render();
      notify(d.message, 'kill'); return false;
    }
    if (d.action !== 'accept') { notify(d.message, 'kill'); return false; }

    st.claimed[wk] = true;
    grantReward(boss, d.scale || 1.0);              // full clan-scale reward
    render();
    return true;
  }

  // The b209 path: a conditional PATCH that only flips MY own claimed=false
  // row. Kept solely so this client works against a server that hasn't had
  // the hardening migration run yet. Once it has, the RLS update policy is
  // gone and this branch is unreachable.
  async function legacyClanClaim(wk) {
    var st = ensureState(), boss = bossOfWeek(wk);
    var s = session();
    var uid = s && s.user && s.user.id;
    if (!uid) { notify(CLAIM_ERRORS.not_signed_in, 'kill'); return false; }
    var flipped;
    try {
      var res = await fetch(cfg().url + '/rest/v1/raid_contributions?clan_id=eq.' + window.G.clanId +
        '&week_key=eq.' + encodeURIComponent(wk) + '&user_id=eq.' + uid + '&claimed=eq.false', {
        method: 'PATCH', headers: headers(true), body: JSON.stringify({ claimed: true })
      });
      flipped = res.ok ? await res.json() : [];
    } catch (e) { notify(CLAIM_ERRORS.network, 'kill'); return false; }
    if (!flipped || !flipped.length) { notify(CLAIM_ERRORS.no_contribution, 'kill'); return false; }
    st.claimed[wk] = true;
    grantReward(boss, 1.0);
    render();
    return true;
  }

  async function soloClaim(wk, attempt) {
    var st = ensureState(), boss = bossOfWeek(wk);
    if (st.solo.hp > 0) { notify(CLAIM_ERRORS.not_downed, 'kill'); return false; }
    var d = await serverClaim('solo', null, wk, attempt);

    if (d.action === 'retry') { adoptWeek(d.week); return await soloClaim(weekKey(), attempt + 1); }
    if (d.action === 'spent') {
      st.claimed[wk] = true; persist(); render();
      notify(d.message, 'kill'); return false;
    }
    // 'unsupported' = signed out, offline-only, or a server without the
    // migration. That is the b209 behaviour: local ledger, local chest.
    if (d.action !== 'accept' && d.action !== 'unsupported') { notify(d.message, 'kill'); return false; }

    st.claimed[wk] = true;
    grantReward(boss, (d.action === 'accept' && d.scale) || 0.4);   // solo pays less — join a clan
    render();
    return true;
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
    if (clan) { var r = await clanStatus(); hp = r ? +r.hp_remaining : max; if (r && +r.max_hp) max = +r.max_hp; }
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
    weekKey: weekKey,
    dayKey: dayKey,
    canStrike: canStrike,
    CLAN_POOL_HP: CLAN_POOL_HP, SOLO_POOL_HP: SOLO_POOL_HP,
    // Server-contract seams — pure, no I/O. Exposed for the regression suite.
    _reduceStrike: reduceStrike,
    _reduceClaim: reduceClaim,
    _strikeErrorText: strikeErrorText,
    _claimErrorText: claimErrorText,
    _adoptClock: function (o) { adoptWeek(o && o.week); adoptDay(o && o.day); },
    _clockFix: function () { return clockFix; },
    _resetClock: function () { clockFix = { week: null, day: null }; }
  };
})();
