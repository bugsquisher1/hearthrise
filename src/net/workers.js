// ============================================================================
// src/net/workers.js — CLIENT TRANSPORT FOR THE HIRED-WORKER SERVER RPCs.
//
// `window.HearthriseWorkersNet.hire()` / `.assign(uid, skill, targetId)` post to
// the two SECURITY DEFINER RPCs added in supabase/migrations/2026-08-25-workers.sql:
//
//   hr_worker_hire(p_slot, p_idem)                    -> {ok, uid, name, crew}
//     MATERIALISES a crew row up to the PAID cap (the worker_hire.<N> unlock
//     level, bought separately through HearthriseGold.buyUnlock). NO gold and no
//     crew size cross this call — the RPC only creates a worker the player has
//     already paid the rung for. Errors: crew_cap_reached / no_character /
//     rate_limited / not_signed_in.
//
//   hr_worker_assign(p_slot, p_uid, p_skill, p_target, p_idem) -> {ok, uid, skill, target_id}
//     ASSIGNS one of the caller's own workers to a gather node. The server owns
//     every gate (own-worker, node exists, skill matches, YOUR level >= node req).
//     Passing skill/target null clears the assignment (idle). No qty/rate crosses.
//     Errors: unknown_worker / bad_skill / unknown_node / wrong_skill /
//     level_too_low / no_character / rate_limited / not_signed_in.
//
// Same transport shape as src/net/goal-claim.js: cfg()/session()/headers(), the
// shared HearthriseRpc.mayCall() session guard (a pre-auth boot call is refused
// as {ok:false,error:'not_signed_in'} rather than firing a 42501), and a
// ten-minute negative probe so a session open across a deploy self-heals.
//
// These RPCs each take a client-supplied idempotency uuid (p_idem): the server
// caches the first answer under (user, intent_id) and replays it, so a retried
// hire never doubles the crew and a retried assign is a no-op. A FRESH uuid is
// minted per gesture — a hire and an assign are distinct intents.
//
// AUTHORITY: the crew the client renders is the SERVER's crew, reconciled from
// the accrual envelope (env.workers) by src/net/accrue.js reconcileWorkers().
// These calls only send INTENTS; they never author a worker, a quantity or a
// rate. src/features/workers.js keeps a display prediction that the envelope
// overwrites. Classic-script friendly: no ESM export; publishes onto window.
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
     player. Mirrors src/net/goal-claim.js activeSlot(). */
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

  function idem() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    } catch (e) {}
    // RFC-4122 v4 fallback (a hire/assign uuid, not a security token)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // One negative probe per RPC name; expires in ten minutes. Mirrors goal-claim.js.
  var probe = {};
  function missing(n) { var p = probe[n]; return !!(p && p.known === false && (Date.now() - p.at) < 600000); }
  function note(n, present) { probe[n] = { known: present, at: Date.now() }; }
  function isMissingShape(json, status) {
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

  window.HearthriseWorkersNet = {
    activeSlot: activeSlot,
    isSignedIn: isSignedIn,
    /** MATERIALISE a worker up to the paid cap. @returns Promise<{ok,uid,name,crew}|{ok:false,error}> */
    hire: function () { return call('hr_worker_hire', { p_slot: activeSlot(), p_idem: idem() }); },
    /** ASSIGN (or, with null skill/target, idle) a worker. @returns Promise<{ok,uid,skill,target_id}|{ok:false,error}> */
    assign: function (uid, skill, targetId) {
      return call('hr_worker_assign', {
        p_slot: activeSlot(),
        p_uid: String(uid || ''),
        p_skill: skill ? String(skill) : null,
        p_target: targetId ? String(targetId) : null,
        p_idem: idem()
      });
    }
  };
})();
