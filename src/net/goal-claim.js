// ============================================================================
// src/net/goal-claim.js — CLIENT TRANSPORT FOR THE DAILY/QUEST GOLD CLAIM RPCs.
//
// `window.HearthriseGoalClaim.claimDaily(taskId)` / `.claimQuest(questId)` post
// to the two SECURITY DEFINER RPCs added in
// supabase/migrations/2026-08-20-goal-reward-rpc-credit.sql. The server VERIFIES
// completion from its own ev:<type> counters and CREDITS the server-owned gold
// into player_state; the client only fires the intent and lets the accrual
// envelope reconcile the balance (see the gold-sites.js rows for updateDaily /
// completeQuest — serverCredits mode).
//
// Same transport shape as src/features/muster.js: cfg()/session()/headers(),
// the shared HearthriseRpc.mayCall() session guard (so a pre-auth boot call is
// refused as {ok:false,error:'not_signed_in'} rather than firing a 42501), and a
// ten-minute negative probe so a session open across a deploy self-heals.
//
// FIRE-AND-FORGET by design: completion is auto-detected mid-tick (a kill, a
// gather) and the payout is a once-guarded server credit. The client marks the
// task/quest done locally as a prediction; the server once-guard is the
// authority and a replay returns already_claimed with no second credit. A failed
// call therefore costs nothing that a later call (or the reload path) cannot
// recover — the claim slot is not consumed until the server credits it.
//
// Classic-script friendly: no ESM export; publishes onto window for legacy.js.
// ============================================================================
(function () {
  'use strict';

  function cfg() {
    return (window.HearthriseSupabase && window.HearthriseSupabase.getConfig
      && window.HearthriseSupabase.getConfig()) || null;
  }
  function session() {
    return (window.HearthriseAuth && window.HearthriseAuth.getSession
      && window.HearthriseAuth.getSession()) || null;
  }
  function isSignedIn() { var s = session(); return !!(s && s.user && cfg()); }
  function headers() {
    var c = cfg(), s = session();
    return {
      'apikey': c.anonKey,
      'Authorization': 'Bearer ' + ((s && s.access_token) || c.anonKey),
      'Content-Type': 'application/json'
    };
  }

  /* The active character slot, server-authoritatively derived from the profile
     and clamped to [0,5] — never a client value that could cross to another
     player. Mirrors src/features/muster.js activeSlot(). */
  function activeSlot() {
    try {
      var P = window.HearthriseProfile;
      if (P && typeof P.activeSlot === 'function') {
        var s = P.activeSlot();
        if (typeof s === 'number' && s >= 0 && s <= 5) return s | 0;
      }
    } catch (e) {}
    return 0;
  }

  // One negative probe per RPC name; expires in ten minutes.
  var probe = {};
  function missing(n) { var p = probe[n]; return !!(p && p.known === false && (Date.now() - p.at) < 600000); }
  function note(n, present) { probe[n] = { known: present, at: Date.now() }; }

  function isMissingShape(json, status) {
    // PostgREST answers a missing function with 404 / PGRST202.
    if (status === 404) return true;
    return !!(json && (json.code === 'PGRST202'
      || (typeof json.message === 'string' && /could not find the function/i.test(json.message))));
  }

  async function call(name, body) {
    var R = window.HearthriseRpc;
    if (R && typeof R.mayCall === 'function' && !R.mayCall(name, isSignedIn())) {
      return { ok: false, error: 'not_signed_in', refused: true };
    }
    if (missing(name)) return { ok: false, error: 'rpc_missing' };
    var c = cfg();
    if (!c) return { ok: false, error: 'no_config' };
    try {
      var res = await fetch(c.url + '/rest/v1/rpc/' + name, {
        method: 'POST', headers: headers(), body: JSON.stringify(body || {})
      });
      var json = null;
      try { json = await res.json(); } catch (e) { json = null; }
      if (isMissingShape(json, res.status)) { note(name, false); return { ok: false, error: 'rpc_missing' }; }
      note(name, true);
      if (json && typeof json === 'object') return json;
      return { ok: false, error: 'bad_response', status: res.status };
    } catch (e) {
      return { ok: false, error: 'network' };
    }
  }

  window.HearthriseGoalClaim = {
    activeSlot: activeSlot,
    isSignedIn: isSignedIn,
    /** @returns Promise<jsonb> the RPC envelope: {ok, gold, ...} or {ok:false,error} */
    claimDaily: function (taskId) { return call('hr_claim_daily', { p_task_id: String(taskId || ''), p_slot: activeSlot() }); },
    claimQuest: function (questId) { return call('hr_claim_quest', { p_quest_id: String(questId || ''), p_slot: activeSlot() }); },
    /* Collection-Log MILESTONE credit — supabase/migrations/2026-08-22-collection-claim.sql.
       The server re-derives the DISTINCT count from hr_bestiary_of / hr_collection_of and
       credits the server-owned gold+gems once-guarded per milestone. Fire-and-forget. */
    claimMilestone: function (milestoneId) { return call('hr_claim_milestone', { p_milestone_id: String(milestoneId || ''), p_slot: activeSlot() }); },
    /* Renown RANK credit — supabase/migrations/2026-08-22-renown-claim.sql. The server
       ratchets a high-water off hr_renown_of, maps it to the rank via a server-owned
       catalogue, and credits gold+gems once-guarded per rank. Fire-and-forget. */
    claimRank: function (rankId) { return call('hr_claim_rank', { p_rank_id: String(rankId || ''), p_slot: activeSlot() }); }
  };
})();
