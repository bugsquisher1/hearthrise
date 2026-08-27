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

  /* A client-generated idempotency key (uuid). A retry of the SAME gesture carries
     the same key so the server re-debits nothing; a new gesture gets a fresh one. */
  function newIdem() {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
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
    /* MODAL daily/weekly GOAL claim — supabase/migrations/2026-08-23-modal-goal-claims.sql
       (b461). The quest modal's pools (DAILY_GOAL_POOL / WEEKLY_GOAL_POOL) are a THIRD
       goal system, distinct from QUEST_DEFS and DAILY_TASK_POOL; under the arm their
       claims were a silent no-op (the b411 defer predates the credit RPCs and was never
       rewired — found live by Tyler, 2026-08-23). hr_claim_goal verifies completion from
       the server's own period counters and credits the WHOLE reward server-side
       (gold+gems+xp+items — client-applied xp/items would be retired at the next settle
       under the skills/inventory arms). NOT fire-and-forget: claimQuestReward awaits the
       verdict and surfaces refusals honestly. */
    claimGoal: function (goalId, weekly) {
      return call('hr_claim_goal', { p_goal_id: String(goalId || ''), p_weekly: !!weekly, p_slot: activeSlot(), p_idem: newIdem() });
    },
    /* The server's projection of every catalogued modal goal for the current
       day / ISO week — {ok, day_key, week_key, goals:[{goal_id, weekly, target,
       have, complete, claimed, ...}]}. Under arm the modal/strip paint THIS, so
       a Claim button only appears when hr_claim_goal will honor it. */
    goalState: function () { return call('hr_goal_state', { p_slot: activeSlot() }); },
    /* Collection-Log MILESTONE credit — supabase/migrations/2026-08-22-collection-claim.sql.
       The server re-derives the DISTINCT count from hr_bestiary_of / hr_collection_of and
       credits the server-owned gold+gems once-guarded per milestone. Fire-and-forget. */
    claimMilestone: function (milestoneId) { return call('hr_claim_milestone', { p_milestone_id: String(milestoneId || ''), p_slot: activeSlot() }); },
    /* Renown RANK credit — supabase/migrations/2026-08-22-renown-claim.sql. The server
       ratchets a high-water off hr_renown_of, maps it to the rank via a server-owned
       catalogue, and credits gold+gems once-guarded per rank. Fire-and-forget. */
    claimRank: function (rankId) { return call('hr_claim_rank', { p_rank_id: String(rankId || ''), p_slot: activeSlot() }); },
    /* Bounty ACCEPT — supabase/migrations/2026-08-23-bounty.sql. The server derives
       the tier from hr_bounty_monsters, owns the reward + required-count, and
       SNAPSHOTS the target's current kill count as the baseline into active_bounty so
       the turn-in requires NEW kills. Only the ids/type/difficulty cross the wire; the
       reward never does. 'cull' only (proof/weapon/streak are refused server-side). */
    acceptBounty: function (b) {
      b = b || {};
      return call('hr_accept_bounty', {
        p_slot: activeSlot(),
        p_bounty_id: String(b.id || ''),
        p_target: String(b.target || ''),
        p_type: String(b.type || ''),
        p_difficulty: String(b.difficulty || 'normal'),
        p_required: Math.max(0, Math.floor(Number(b.required) || 0))
      });
    },
    /* Bounty TURN-IN — the once-guarded credit. The server reads the target's CURRENT
       kill count, subtracts the accept-time baseline, and credits server-owned gold +
       Bounty Marks only if (current - baseline) >= required; the active_bounty row IS
       the once-guard (deleted under a row lock). Fire-and-forget: a replay returns
       no_active_bounty with no second credit. */
    claimBounty: function () { return call('hr_claim_bounty', { p_slot: activeSlot() }); },
    /* Bounty KILL CREDIT — supabase/migrations/2026-08-30-bounty-kill-credit.sql
       (bug #5). The server bounty counter (ev:kill_monster:<target>) is written
       only by the away/span-sim, which re-simulates the window UNATTENDED and
       realizes 60–99% fewer kills than the attended player got — so the bar hits
       102/102 while the server counter never reaches target and hr_claim_bounty
       refuses forever. This lets the LIVE client TOP UP the server counter with
       its OBSERVED kills; the server CLAMPS the credit to the physical-max
       plausibility cap (floor(1.3 × elapsed / min_time_to_kill)), grants NO
       gold/XP/drops (the turn-in still pays the reward, once), and journals any
       throttled claim as a forgery signal.

       DISPLAY-SAFE + IDEMPOTENT: the server tops UP to (baseline + capped credit),
       never lower and never double-counting the settle, and p_idem makes a replay
       a no-op. Only the target id + the client's observed count cross the wire;
       the cap, the level and the elapsed clock are all the server's. A refusal
       (no_active_bounty / rate_limited / throttled) costs nothing — the client
       just retries on the next kill. @returns {ok, progress, required, cap,
       credited, throttled, ...}. */
    creditKills: function (target, claimed) {
      return call('hr_credit_kills', {
        p_slot: activeSlot(),
        p_target: String(target || ''),
        p_claimed: Math.max(0, Math.floor(Number(claimed) || 0)),
        p_idem: newIdem()
      });
    },
    /* ATTENDED COMBAT-XP credit — supabase/migrations/2026-08-31-combat-xp-credit.sql
       (bug #5 root, part 2 — "attack level reverts 5→4"). Live combat XP is
       client-PREDICTED only; the only server writer is the away/span-sim, which
       prices the window UNATTENDED and undercounts 60-99%, so on settle predict.js
       retires the client's prediction DOWN to the undercount and the gained level
       reverts. This lets the LIVE client SUBMIT its observed per-combat-skill XP;
       the server CLAMPS each skill to the physical-max cap (floor(1.3 × elapsed ×
       max_hit × 1200 / 6000000)), charges it against the shared daily XP budget,
       advances the SEPARATE combat_xp_accrued_to watermark (so the settle does not
       double-pay), and journals any throttled skill as a forgery signal.

       Only the observed per-skill XP map crosses the wire; the cap, the damage
       level and the elapsed clock are all the server's. A refusal (rate_limited /
       daily_budget / bad_skill) costs nothing — the caller keeps the pending XP
       and flushes again later. @param xpMap {skill_id: observed_xp}. */
    creditCombatXp: function (xpMap) {
      var clean = {};
      if (xpMap && typeof xpMap === 'object') {
        for (var k in xpMap) {
          if (!Object.prototype.hasOwnProperty.call(xpMap, k)) continue;
          var n = Math.floor(Number(xpMap[k]) || 0);
          if (n > 0) clean[k] = n;
        }
      }
      return call('hr_credit_combat_xp', {
        p_slot: activeSlot(),
        p_xp: clean,
        p_idem: newIdem()
      });
    },
    /* Bounty MARKS spend — supabase/migrations/2026-08-26-marks-record.sql. ONE
       server-authoritative debit for reroll + abandon. The server derives the
       reroll cost (5 + paid-rerolls-today*5, counted from the ledger) and the
       abandon fee (min(10, floor(reward_marks*0.25)) for BH level >= 10, reward
       taken from the server's own active_bounty when present); the client value it
       accepts is only context, never a balance. p_idem makes a retry a no-op.
       Fire-and-forget, DISPLAY-PREDICTION shape: the server owns player_state.marks
       and the next envelope reconciles it. Only fired for a PAID reroll (free
       rerolls never reach the server) or an abandon with a fee. */
    bountyReroll: function () {
      return call('hr_bounty_spend', {
        p_slot: activeSlot(), p_reason: 'reroll', p_bounty_level: 0,
        p_reward_marks: 0, p_idem: newIdem()
      });
    },
    bountyAbandon: function (bountyLevel, rewardMarks) {
      return call('hr_bounty_spend', {
        p_slot: activeSlot(), p_reason: 'abandon',
        p_bounty_level: Math.max(0, Math.floor(Number(bountyLevel) || 0)),
        p_reward_marks: Math.max(0, Math.floor(Number(rewardMarks) || 0)),
        p_idem: newIdem()
      });
    },
    /* Companion EQUIP / UNEQUIP — supabase/migrations/2026-08-20-companion-model.sql.
       hr_companion_equip(slot, companion, unequip) sets the SERVER-OWNED
       player_state.companion_equipped AFTER an ownership check (a companion:<id>
       unlock row or the starter fox), and hr_perks_of prices the equipped
       companion's passive bonus at accrual. Only the id crosses the wire; the
       server owns the ownership test, the bonus and the version bump.

       Fire-and-forget, DISPLAY-PREDICTION shape like the claim transports: the
       client sets G.companions.equipped optimistically for responsiveness and the
       server reconciles on the next envelope. A refusal (not_owned / collect_first /
       rate_limited) costs nothing the client authored — the equipped id is a
       display preference, not a value that crosses to another player; the passive
       bonus it unlocks is priced SERVER-SIDE off the server's own equipped id, so a
       forged local equip pays nothing until the server accepts it. */
    equipCompanion: function (id) {
      return call('hr_companion_equip', { p_slot: activeSlot(), p_companion: String(id || ''), p_unequip: false });
    },
    unequipCompanion: function () {
      return call('hr_companion_equip', { p_slot: activeSlot(), p_companion: null, p_unequip: true });
    },
    /* NON-SHOP companion GRANT — supabase/migrations/2026-08-22-companion-grant.sql.
       hr_companion_grant(slot, companion, source, idem) writes a server-owned
       companion:<id> unlock row when a legitimate NON-shop acquisition happens
       (drop / quest / hatch / skill / boss), so that under the blob-retire capstone
       arm accrue.js reconcileCompanions (which rebuilds G.companions from the
       server owned-set) does NOT drop a companion obtained without a server row.

       The server GATES on its own allowlist (hr_companion_grants): a SHOP companion
       (bought with gold via hr_unlock_buy) and an unknown/forged id are refused
       'not_grantable', so a forged grant mints no server-owned perk. Where the
       acquisition has a server-verifiable cost (the dragon_egg hatch) the RPC
       consumes it server-side. Only the id/source cross the wire; the ownership
       decision, the version bump and any consume are the server's.

       Fire-and-reconcile, DISPLAY-PREDICTION shape like the equip/claim transports:
       the client already wrote G.companions.ownedIds locally for responsiveness and
       the server owned-set reconciles on the next envelope. A refusal costs nothing
       the client authored. p_idem makes a retry of the same acquisition a no-op
       (the grant is owned-once regardless). Fired ONLY under the capstone arm (see
       src/features/companions.js maybeServerGrant) so dormant behaviour is unchanged. */
    grantCompanion: function (id, source) {
      return call('hr_companion_grant', {
        p_slot: activeSlot(),
        p_companion: String(id || ''),
        p_source: String(source || ''),
        p_idem: newIdem()
      });
    },
    /* COMBAT STYLE — supabase/migrations/2026-08-24-combat-style.sql (P0, live).
       hr_set_style(family, key, slot, idem) writes the SERVER-OWNED
       player_state.combat_style, which the accrual engine reads to decide WHICH
       SKILL every combat XP grant lands in. Until this existed the server settled
       every styled grant with `resolveStyle(weaponType, null)` — Accurate, i.e.
       100% to Attack — and, because skills are server-of-record and armed, it
       overwrote the client's predicted Strength/Defence XP at every settle. That
       is Paione's report ("only Attack saves").

       Only the FAMILY and the KEY cross the wire; both are looked up in the
       server's own catalogue (public.hr_combat_styles) and a pair it does not
       carry is REFUSED, never clamped. No XP, no rate, no tick, no timestamp.

       ── WHY IT SETTLES FIRST ────────────────────────────────────────────────
       The server refuses a flip with an unpaid window (`collect_first`): the
       accrual prices a WHOLE window with the style read at collection time, so
       "fight all night on Accurate, flip to Defensive, collect" would re-route —
       and, through speedMod, slightly re-price — the entire night. The house
       answer is refuse-then-retry rather than the accrued_to stamp that
       forfeits the window. Under live settlement the pointer is settled every
       ~90 s, which is longer than the server's 60 s grace, so an ACTIVE player
       would hit that refusal on most flips. `settleBeforeIntent()` closes the
       window first — the same thing the equip/activity intents do — and the two
       retries below cover the case where the settle itself was declined
       (below-min-span) and the window closes a moment later.

       FIRE-AND-FORGET, DISPLAY-PREDICTION shape: applyCombatStyle() has already
       written G.combatStyle locally for responsiveness, and reconcileCombatStyle()
       in src/net/accrue.js pulls the server's own map back off every envelope. A
       refusal costs nothing the client authored — the style is a preference, and
       the routing it decides is computed SERVER-SIDE from the server's own
       column, so a forged local style routes nothing until the server accepts it.

       THE SAME IDEMPOTENCY KEY IS REUSED ACROSS THE RETRIES, deliberately: they
       are retries of ONE gesture, and hr_set_style caches successes only, so a
       `collect_first` refusal never poisons the key (this is the one place the
       intent contract's "a REJECTED intent is retried with a NEW key" rule does
       not apply, because the server explicitly releases this refusal). */
    setStyle: async function (family, key) {
      var fam = String(family || ''), k = String(key || '');
      if (!fam || !k) return { ok: false, error: 'bad_style' };
      /* ⚠ BAIL BEFORE THE FIRST TIMER, NOT AFTER. `call()` already refuses a
         signed-out caller, but only AFTER settleBeforeIntent() and only on the
         first pass — so a signed-out client (a fresh boot, the account wall, and
         every in-page suite run, which clicks the style buttons) would still
         schedule a settle and up to 19 s of retry timers for an RPC that can
         never go out. Nothing below is meaningful without a session; refuse
         here, synchronously, and the gesture stays free. */
      if (!isSignedIn()) return { ok: false, error: 'not_signed_in', refused: true };
      var idem = newIdem();
      var delays = [0, 4000, 15000];
      var last = { ok: false, error: 'unsent' };
      for (var i = 0; i < delays.length; i++) {
        if (delays[i] > 0) await new Promise(function (r) { setTimeout(r, delays[i]); });
        /* Close the unpaid window before asking. Best-effort: if the settle
           transport is absent or declines, the call still goes out and either
           succeeds (idle / inside the grace) or comes back collect_first and we
           try again after the next settle tick. */
        try {
          var A = window.HearthriseAccrual;
          if (A && typeof A.settleBeforeIntent === 'function') await A.settleBeforeIntent();
        } catch (e) {}
        last = await call('hr_set_style', {
          p_family: fam, p_key: k, p_slot: activeSlot(), p_idem: idem
        });
        if (!last || last.error !== 'collect_first') return last;
      }
      return last;
    }
  };
})();
