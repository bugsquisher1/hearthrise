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
  /* b340 / F5 — THE CLAN BROWSER READS AN RPC, NOT A WORLD-READABLE VIEW.
     `public.clan_leaderboard` is one of two SECURITY DEFINER views that let an
     UNAUTHENTICATED caller enumerate the game (proven by execution as `anon`
     with no JWT). It stayed alive purely because this line read it directly.
     `hr_clan_browser` is the narrowing: same ten columns, `authenticated`
     only, rate-gated, limit clamped server-side.

     The view read is kept ONLY as the pre-migration fallback and ONLY when the
     server PROVES the RPC is absent (404 / PGRST202 / 42883 / 42P01). A 401 or
     a 5xx is a refusal and returns nothing — falling back on those would keep
     the very read the migration exists to close alive on a bad day. When
     2026-08-14-leaderboard-view-lockdown.sql drops the view, this fallback
     answers 404 and disappears on its own; nothing here needs a second edit.

     Unlike the membership WRITES below there IS a fallback here, and the
     difference is deliberate: a fallback on a write would reopen a security
     hole (no ban list, no journal, no rate limit), while this one only reads a
     table that is, until the migration lands, world-readable anyway. */
  var CLAN_BROWSER_RPC = 'hr_clan_browser';
  var CLAN_BROWSER_LIMIT = 25;

  function rpcSeam() { return window.HearthriseRpc || null; }

  async function listClans() {
    if (!online()) return [];
    var R = rpcSeam();
    if (R && R.shouldTry(CLAN_BROWSER_RPC)) {
      var r = await rpc(CLAN_BROWSER_RPC, { p_limit: CLAN_BROWSER_LIMIT });
      if (R.isMissingRpc(r.status, r.out)) {
        R.note(CLAN_BROWSER_RPC, false);
      } else {
        if (r.ok) R.note(CLAN_BROWSER_RPC, true);
        if (r.ok && r.out && r.out.ok === true && Array.isArray(r.out.clans)) return r.out.clans;
        return [];                      // a refusal is a refusal, never a fallback
      }
    }
    var res = await fetch(cfg().url + '/rest/v1/clan_leaderboard?limit=' + CLAN_BROWSER_LIMIT,
      { headers: headers() });
    if (!res.ok) return [];
    return res.json();
  }

  /* ── SERVER-AUTHORITATIVE MEMBERSHIP (2026-08-11, S-CAP-1 / S-KICK) ────────
     Founding, joining, leaving, kicking, inviting and the door policy are RPCs
     now — `supabase/migrations/2026-08-11-clan-membership-authority.sql`. This
     file used to POST straight at `/rest/v1/clan_members`, which was the whole
     of the join path: no invite, no ban, no journal, no rate limit, and no way
     for a clan to say no. A security audit joined an outsider into a live clan
     from a REST call and then acted on that clan's shared surfaces.

     The refusals are NAMED, not numbered, because a player who is told "(403)"
     learns nothing. Every error string below is one the server can actually
     return; anything unrecognised falls through to the raw code rather than
     being dressed up as a sentence we have not verified.

     There is deliberately NO fallback to the old table write. A project without
     the migration answers PGRST202 and the player is told the server is behind,
     which is true — silently reopening the hole would be worse than the outage. */
  var JOIN_ERRORS = {
    not_signed_in: 'Sign in to join a clan',
    rate_limited: 'Slow down a moment, then try again',
    no_clan: 'That hold no longer exists',
    already_in_clan: 'Leave your current clan first',
    invite_only: 'That hold is invite-only — ask a member for an invitation',
    banned: 'You have been removed from that hold and cannot rejoin yet',
    clan_full: 'That hold is full',
    bad_name: 'Clan name must be 3–24 characters',
    name_taken: 'That clan name is taken',
    bad_policy: 'Unknown join policy',
    not_member: 'You are not in a clan',
    not_permitted: 'Only the hold’s leadership can do that',
    cannot_kick_self: 'Use Leave rather than removing yourself',
    cannot_kick_leader: 'The leader cannot be removed',
    no_such_player: 'No player by that name',
    cannot_invite_self: 'You are already here',
    target_in_clan: 'That player already belongs to another hold',
    already_member: 'That player is already in your hold',
    /* clan_kick answers this when p_user_id is null — reachable only from a
       control that lost its target, which is exactly when a player most needs
       a sentence rather than a code. */
    no_target: 'Choose a member to remove first'
  };
  /* One place turns a server code into a sentence, and it is EXPORTED so a test
     can walk every code the migration can return and prove each one reads as a
     refusal. A player told "(403)" learns nothing; a player told "That hold is
     invite-only" knows what to do next. */
  function errorText(code, fallback, status) {
    if (code && JOIN_ERRORS[code]) return JOIN_ERRORS[code];
    if (code) return (fallback || 'That did not work') + ' (' + code + ')';
    return (fallback || 'That did not work') + ' (' + (status == null ? 'no reply' : status) + ')';
  }
  function sayError(out, status, fallback) {
    notify(errorText(out && out.error, fallback, status), 'kill');
    return false;
  }

  // Single place that speaks RPC, so the auth header and the JSON shape cannot
  // drift between six call sites.
  async function rpc(name, body) {
    var res = await fetch(cfg().url + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: headers(true), body: JSON.stringify(body || {})
    });
    var out = null;
    try { out = await res.json(); } catch (e) {}
    return { status: res.status, ok: res.ok, out: out };
  }

  async function fetchMyClan() {
    _myClan = null;
    if (!online() || !signedIn()) return null;
    var uid = session().user.id;
    var res = await fetch(cfg().url + '/rest/v1/clan_members?user_id=eq.' + uid + '&select=clan_id,role,contributed,clans(id,name,level,treasury,castle_tier,upgrades,join_policy)', { headers: headers() });
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

  // Shared tail: membership changed, so re-read it FROM THE SERVER rather than
  // patching the local cache from the RPC's reply. The reply is the truth about
  // what happened; the roster read is the truth about what now is.
  async function afterMembershipChange() {
    _invCache = null;                    // membership moved; any cached inbox is stale
    await fetchMyClan();
    if (typeof window.saveLocal === 'function') saveLocal();
    refreshClanScreens();
    if (typeof window.updateTopbar === 'function') updateTopbar();
  }

  async function createClan(name, joinPolicy) {
    name = (name || '').trim();
    if (name.length < 3 || name.length > 24) { notify('Clan name must be 3–24 characters', 'kill'); return null; }
    if (!requireOnline()) return null;
    // The server re-validates the name, the policy and "are you already in a
    // clan"; these local checks exist only to save a round trip.
    var r = await rpc('clan_create', { p_name: name, p_join_policy: joinPolicy === 'invite' ? 'invite' : 'open' });
    if (!r.ok || !r.out || r.out.ok === false) { sayError(r.out, r.status, 'Could not found the hold'); return null; }
    await afterMembershipChange();
    notify(name + ' is founded — the foundation is laid, and it is yours. Rally your allies.', 'levelup');
    return { id: r.out.clan_id, name: r.out.name, join_policy: r.out.join_policy };
  }

  async function joinById(clanId) {
    if (!requireOnline()) return false;
    var r = await rpc('clan_join', { p_clan_id: clanId });
    if (!r.ok || !r.out || r.out.ok === false) return sayError(r.out, r.status, 'Could not join');
    await afterMembershipChange();
    return true;
  }

  async function leave() {
    if (!requireOnline()) return false;
    var r = await rpc('clan_leave', {});
    if (!r.ok || !r.out || r.out.ok === false) return sayError(r.out, r.status, 'Could not leave');
    finishLeave();
    /* Leaving can promote somebody or disband the hold entirely, and the reply
       says which. Say it — a player who has just dissolved a castle should be
       told, not left to notice. */
    if (r.out.disbanded) notify('The hold is disbanded — you were the last of it.', 'info');
    return true;
  }

  // ── leadership: the S-KICK remedy, plus the door ──────────────────────────
  // No UI is wired here on purpose; that belongs to the clan panel and to the
  // Systems Engineer. These are the transport.
  async function kick(userId, banHours) {
    if (!requireOnline()) return false;
    var body = { p_user_id: userId };
    if (banHours != null) body.p_ban_hours = Math.max(0, Math.min(720, Math.floor(+banHours || 0)));
    var r = await rpc('clan_kick', body);
    if (!r.ok || !r.out || r.out.ok === false) return sayError(r.out, r.status, 'Could not remove that member');
    /* An eviction that says nothing reads as a misclick that did nothing. Say
       what happened, including how long the door is shut — the ban is the half
       of a kick that a leader most needs to be sure of. */
    notify(r.out.already_removed
      ? 'They had already left the hold.'
      : ('Removed from the hold' + (r.out.banned_until
          ? ' — barred until ' + fmtWhen(r.out.banned_until) + '. Inviting them lifts it.'
          : ', with no bar on returning.')), 'info');
    refreshClanScreens();
    return r.out;
  }
  async function invite(displayName) {
    if (!requireOnline()) return false;
    var r = await rpc('clan_invite', { p_display_name: String(displayName || '').trim() });
    if (!r.ok || !r.out || r.out.ok === false) return sayError(r.out, r.status, 'Could not send the invitation');
    notify(r.out.display_name + ' has been invited to the hold — the invitation lapses ' +
      fmtWhen(r.out.expires_at) + '.', 'info');
    return r.out;
  }
  async function inviteRevoke(userId) {
    if (!requireOnline()) return false;
    var r = await rpc('clan_invite_revoke', { p_user_id: userId });
    if (!r.ok || !r.out || r.out.ok === false) return sayError(r.out, r.status, 'Could not withdraw the invitation');
    /* `revoked` is a row count. Zero is not a failure — it is "there was nothing
       to withdraw", which is a different sentence and the player deserves it. */
    notify(r.out.revoked ? 'The invitation is withdrawn.' : 'There was no invitation left to withdraw.', 'info');
    return r.out;
  }
  /* A timestamp a player can read. Deliberately relative for anything inside a
     fortnight — "in 6 days" is the answer to the question actually being asked
     ("have I got time?"), where an ISO string is a lookup. */
  function fmtWhen(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return 'soon';
    var ms = t - Date.now();
    var past = ms < 0;
    var mins = Math.round(Math.abs(ms) / 60000);
    var s = mins < 60 ? (mins + ' minute' + (mins === 1 ? '' : 's'))
      : mins < 1440 ? (Math.round(mins / 60) + ' hour' + (Math.round(mins / 60) === 1 ? '' : 's'))
      : (Math.round(mins / 1440) + ' day' + (Math.round(mins / 1440) === 1 ? '' : 's'));
    return past ? (s + ' ago') : ('in ' + s);
  }
  /* The clan screen re-renders from three callers (`renderClan`, the Social
     signpost, every membership change), and this is a rate-limited RPC — so the
     answer is held briefly rather than re-asked on every repaint. 20s is short
     enough that accepting an invitation elsewhere still shows up promptly, and
     any membership change clears it outright. */
  var _invCache = null, _invCacheAt = 0;
  async function myInvites(force) {
    if (!online() || !signedIn()) return [];
    if (!force && _invCache && (Date.now() - _invCacheAt) < 20000) return _invCache;
    var r = await rpc('clan_invites_list', {});
    if (!r.ok || !r.out || r.out.ok === false) return [];
    _invCache = r.out.invites || [];
    _invCacheAt = Date.now();
    return _invCache;
  }
  /* ── WHO HAS AN OUTSTANDING INVITATION, derived from the hold's journal ────
     `clan_invites` has NO client SELECT policy (deliberately — a readable
     invite table is a readable list of who is being courted), and the
     membership migration shipped `clan_invites_list()` for the INVITEE only.
     So leadership has no server read for "who have we invited". Rather than
     invent one client-side or keep a session-local list that a refresh would
     erase, this derives the answer from `clan_ledger`, which every RPC in the
     membership file writes to and which is `select using (true)`:

       invite         → an invitation was issued (or re-issued) at `at`
       invite_revoke  → withdrawn
       join_invite    → accepted
       join / kick    → the person is a member, or barred; either way not pending

     The LATEST row per user decides, and an 'invite' row older than the
     server's 7-day expiry has lapsed. Every writer of clan_invites journals,
     so this is complete rather than a guess — but it is a DERIVATION, and the
     honest fix is a `clan_invites_outstanding()` RPC (raised in HANDOFFS).
     A stale entry costs nothing: revoking it answers `revoked: 0`, which the
     transport already reports as "there was nothing to withdraw". */
  var INVITE_TTL_MS = 7 * 24 * 3600000;
  async function outstandingInvites() {
    if (!online() || !signedIn() || !_myClan) return [];
    var url = cfg().url + '/rest/v1/clan_ledger?clan_id=eq.' + _myClan.id +
      '&kind=eq.member&select=user_id,item_id,at&order=at.desc&limit=200';
    var res = await fetch(url, { headers: headers() });
    if (!res.ok) return [];
    var rows = await res.json();
    var seen = {}, pending = [];
    (rows || []).forEach(function (r) {
      if (!r.user_id || seen[r.user_id]) return;
      seen[r.user_id] = 1;                       // ordered desc: first row wins
      if (r.item_id !== 'invite') return;        // a closer, or an unrelated act
      var at = Date.parse(r.at);
      if (!isFinite(at) || (Date.now() - at) >= INVITE_TTL_MS) return;   // lapsed
      pending.push({ user_id: r.user_id, at: at, expires_at: new Date(at + INVITE_TTL_MS).toISOString() });
    });
    if (!pending.length) return [];
    // Names come from `profiles`, server-authored, never from anything the
    // inviter typed — the same rule the invite RPC follows.
    try {
      var ids = pending.map(function (p) { return p.user_id; }).join(',');
      var pr = await fetch(cfg().url + '/rest/v1/profiles?id=in.(' + ids + ')&select=id,display_name',
        { headers: headers() });
      if (pr.ok) {
        var names = {};
        (await pr.json() || []).forEach(function (p) { names[p.id] = p.display_name; });
        pending.forEach(function (p) { p.display_name = names[p.user_id] || null; });
      }
    } catch (e) {}
    return pending;
  }

  async function setJoinPolicy(policy) {
    if (!requireOnline()) return false;
    var r = await rpc('clan_join_policy_set', { p_policy: policy });
    if (!r.ok || !r.out || r.out.ok === false) return sayError(r.out, r.status, 'Could not change the door policy');
    if (_myClan) _myClan.join_policy = r.out.join_policy;
    notify(r.out.join_policy === 'invite'
      ? 'The hold is now invite-only.'
      : 'The hold is now open to all.', 'info');
    refreshClanScreens();
    return r.out;
  }
  function finishLeave() {
    _myClan = null;
    var G = window.G || {};
    G.clanId = null; G.clanName = null;
    if (typeof window.saveLocal === 'function') saveLocal();
    refreshClanScreens();
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
    refreshClanScreens();
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
    /* b340 / F5 — THIS OVERRIDE NO LONGER OWNS A LEADERBOARD TRANSPORT.
       It used to fetch `/rest/v1/leaderboard` directly, which is the second of
       the two SECURITY DEFINER views an unauthenticated caller could read for
       every player's uuid, name, gold and levels. It now goes through
       HearthriseLeaderboards.fetchBoard — the module that has OWNED this screen
       since b222 — so there is one RPC-first path with one degrade rule instead
       of two models of the same boards.

       Its consumer is legacy.js:4499, the no-module fallback renderer, which
       prints Lv / CL / gold on every row. hr_leaderboard answers ONE board per
       call, so all three are read and merged by id. That is three requests on a
       path that only runs when this module's own leaderboard script failed to
       load — and the alternative was to fill two of the three columns with
       zeroes, which is fabricated data on a screen about other players. */
    var LB_BOARD = { total: 'total_level', combat: 'combat_level', gold: 'wealth' };
    var LB_STAT  = { total_level: 'total', combat_level: 'combat', wealth: 'gold' };
    NetClient.leaderboard = async function (mode) {
      var LB = window.HearthriseLeaderboards;
      if (!online() || !LB || typeof LB.fetchBoard !== 'function') return origLb(mode);
      try {
        var primary = LB_BOARD[mode] || LB_BOARD.total;
        var boards = ['total_level', 'combat_level', 'wealth'];
        var res = await Promise.all(boards.map(function (b) { return LB.fetchBoard(b); }));
        var lead = res[boards.indexOf(primary)];
        if (!lead || lead.action !== 'accept') return origLb(mode);

        // id -> the three stats, from whichever boards answered.
        var stats = {};
        res.forEach(function (r, i) {
          if (!r || r.action !== 'accept') return;
          var key = LB_STAT[boards[i]];
          (r.top || []).forEach(function (row) {
            if (!row || !row.id) return;
            if (!stats[row.id]) stats[row.id] = { total: 0, combat: 0, gold: 0 };
            stats[row.id][key] = row.score || 0;
          });
        });

        var meId = signedIn() ? session().user.id : null;
        var list = (lead.top || []).slice(0, 15).map(function (row, i) {
          var s = stats[row.id] || { total: 0, combat: 0, gold: 0 };
          return { id: row.id, rank: i + 1,
            displayName: row.name + (row.id === meId ? ' (You)' : '') + (row.clan ? ' [' + row.clan + ']' : ''),
            total: s.total, combat: s.combat, gold: s.gold,
            you: row.id === meId };
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

  /* b225 (#18): membership changed, so BOTH screens that talk about it have to
     agree — the hold on the Clan screen and the signpost + friends half of
     Social. Calling only one of them is how a stale "Find a clan" button ends
     up sitting next to a castle you already joined. */
  function refreshClanScreens() {
    if (typeof window.renderClan === 'function') { try { window.renderClan(); } catch (e) {} }
    if (typeof window.syncClanActivity === 'function') { try { window.syncClanActivity(); } catch (e) {} }
    if (typeof window.renderSocial === 'function') { try { window.renderSocial(); } catch (e) {} }
  }

  // ── the Clan Seat screen (b225 #18: its own panel, was #social-panel) ──
  async function renderClanSection() {
    /* The host moved out of Social into #panel-clan. The `social-panel`
       fallback is kept for one build only as a belt-and-braces against an
       index.html that has not been refreshed from cache — it renders into
       whichever host actually exists rather than silently drawing nothing. */
    var cl = document.getElementById('clan-panel') || document.getElementById('social-panel');
    if (!cl) return;
    var G = window.G || {};
    /* b225 (#18): this screen has no card head above it, so every state has to
       supply its own heading — a player who follows the Clan entry must never
       land on an unlabelled list or a bare button. */
    if (!online() || !signedIn()) {
      cl.innerHTML =
        '<div class="clan-empty"><h4>Your hold awaits</h4>' +
        '<p>Clans are live multiplayer — sign in to found one, join one, and raise a castle together.</p></div>' +
        /* b287 (functional QA): this called HearthriseAuth.showSignIn(), which has
           never existed (auth.js exports signIn/signOut/getSession, no UI opener), so
           the button always fell through to a toast telling you to go find sign-in
           somewhere else — a "Sign in" button that doesn't sign you in. The real
           prompt is HearthriseGate.promptReauth(); the toast stays as a last resort. */
        '<button class="btn btn-primary btn-sm" onclick="window.hrPromptSignIn&&window.hrPromptSignIn()">Sign in</button>';
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
      /* THE INVITATIONS ADDRESSED TO YOU. clan_invites has no client SELECT
         policy, so clan_invites_list() is the only way to learn one exists —
         which means that before this block an invitation was a thing the server
         knew about and the player could not. Read first, render once. */
      var invites = [];
      try { invites = await myInvites(); } catch (e) { invites = []; }
      cl.innerHTML =
        (invites.length ? inviteInboxHtml(invites) : '') +
        '<div class="clan-empty"><h4>Find a hold, or found one</h4>' +
        '<p>A clan raises a castle together — six rooms, shared Work Orders, clan chat and a weekly boss no one downs alone.</p></div>' +
        (cr.clans.length ? cr.clans.map(function (c) {
          return '<div class="shop-row"><div class="info"><b>' + escapeHtml(c.name) + '</b><span>' + c.members + ' members · ' + c.bonus + '</span></div>' +
            '<button class="btn btn-sm btn-primary" onclick="window.HearthriseClans.joinById(\'' + c.id + '\')">Join</button></div>';
        }).join('') : '<div class="muted tiny" style="margin-bottom:8px">No holds have been chartered yet — found the first one.</div>') +
        '<div class="clan-found">' +
          '<input type="text" id="clan-input" placeholder="Name your own hold" maxlength="24">' +
          /* The door is chosen at founding because it is a decision, not a
             setting — and the RPC has taken it since the membership-authority
             migration. `open` is first so the default is today\'s behaviour. */
          '<select id="clan-policy" aria-label="Who may join">' +
            '<option value="open">Open to all</option>' +
            '<option value="invite">Invite only</option>' +
          '</select>' +
          '<button class="btn btn-primary" onclick="window.HearthriseClans.createClan(document.getElementById(\'clan-input\').value, (document.getElementById(\'clan-policy\')||{}).value)">Found it</button></div>' +
        '<div class="muted tiny">A hold that is <b>invite only</b> refuses every uninvited join, and you can ' +
          'change your mind from the Great Hall at any time.</div>';
    }
  }

  /* The invitee's half of the membership system. There is no decline RPC — an
     invitation is withdrawn by the hold or it lapses — so this surface offers
     the two things that are real (accept, or let it lapse) and says which,
     rather than drawing an Ignore button that would only lie to the player. */
  function inviteInboxHtml(invites) {
    return '<div class="clan-invites">' +
      '<h4>You have been invited</h4>' +
      invites.map(function (i) {
        return '<div class="shop-row"><div class="info"><b>' + escapeHtml(i.clan_name || 'A hold') + '</b>' +
          '<span>' + (i.invited_by ? 'Invited by ' + escapeHtml(i.invited_by) + ' · ' : '') +
          (i.members != null ? i.members + ' members · ' : '') +
          'lapses ' + escapeHtml(fmtWhen(i.expires_at)) + '</span></div>' +
          '<button class="btn btn-sm btn-primary" onclick="window.HearthriseClans.joinById(\'' +
            escapeHtml(i.clan_id) + '\')">Accept</button></div>';
      }).join('') +
      '<div class="muted tiny">An invitation lapses on its own if you do nothing, and the hold can withdraw it.</div>' +
      '</div>';
  }

  /* b225 (#18): the clan half left Social, so this file no longer wraps
     renderSocial — it OWNS renderClan. legacy.js keeps a fallback under that
     name for the no-module case; this replaces it, exactly as it replaced the
     clan half of renderSocial before. Social now draws its leaderboards and its
     friends without this module's help. */
  function patchRenderClan() {
    window.renderClan = async function () {
      if (typeof window.syncClanActivity === 'function') { try { window.syncClanActivity(); } catch (e) {} }
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
      /* b349 — `p[key]` alone is a NaN INJECTION, not merely untidy.
         `myPerks()` returns an ordinary object, so `p['constructor']` is the
         Object CONSTRUCTOR: truthy, and `t += Object` makes the whole chain's
         answer a string for the rest of the session. Measured through the real
         chain by src/features/smoke-test.js B349-5. This is Security's C6
         (`MONSTERS['constructor']` passing `!MONSTERS[id]`) living in the bonus
         chain; the same guard now sits at layer 0 in src/core/perks.js `own()`.
         Behaviour is unchanged for every real key — a perk is always a number. */
      try {
        var p = myPerks();
        if (Object.prototype.hasOwnProperty.call(p, key) && typeof p[key] === 'number') t += p[key];
      } catch (e) {}
      return t;
    };
  }

  function boot() {
    try {
      patchNetClient();
      patchRenderClan();
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
    // 2026-08-11 membership authority — transport only; the panel owns the UI.
    kick: kick,
    invite: invite,
    inviteRevoke: inviteRevoke,
    myInvites: myInvites,
    outstandingInvites: outstandingInvites,
    setJoinPolicy: setJoinPolicy,
    fmtWhen: fmtWhen,
    errorText: errorText,
    // Test seam: pure, DOM-free, no I/O — the invitee's inbox markup.
    _inviteInboxHtml: inviteInboxHtml,
    contribute: contribute,
    nextTreasuryGoal: nextTreasuryGoal,
    roster: roster,
    offlineBonusHours: function () { return myPerks().offlineHours || 0; },
    _online: online, _signedIn: signedIn
  };
})();
