// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/companions-claims-and-renown.js — companion grants, collection/milestone/rank/muster claims and the quest-reward transport.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 43 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, stampBalanceLikeLoad, stampRecordLikeLoad, predZero, snapshotG, drain, stubSignedIn, restoreG, zeroRenownTerms, restoreRenownTerms, on } from './_harness.js?v=548';

export default [

  /* ══════════════════════════════════════════════════════════════════════════
     HATCH-REFUSE — A REFUSED COMPANION GRANT IS SURFACED, AND NOTHING IS SHOWN
     UNTIL THE SERVER HAS RECORDED IT.   (b499, regression)

     THE DEFECT. src/features/companions.js unlockCompanion PUSHED the id into
     G.companions.ownedIds, toasted "Companion unlocked", emitted the chronicle
     milestone, and only THEN fired hr_companion_grant fire-and-forget with a
     bare `.catch(noop)`. The blob-retire capstone is ARMED (capstone.js
     BLOB_RETIRED = true), so accrue.js reconcileCompanions rebuilds
     G.companions from the SERVER owned-set on the next envelope: a refused grant
     therefore produced a toast, a Stable card and a chronicle line, and then the
     companion VANISHED with nothing said. Same shape as b494's rank claims.

     2026-09-06-companion-grant-hardening.sql made the refusals MACHINE CODES
     (unknown_unlock:<key> · missing_req_item · not_grantable) instead of a 500,
     so the client can now tell a refusal from an outage — and the fixtures below
     are that migration's own return envelopes, verbatim from its §4 probes.

     MUTATION (both proved): move applyUnlockLocally back ahead of the confirm →
     -1 goes red on four assertions; delete the notify in requestServerUnlock's
     refusal branch → -1 goes red on the notice assertions.
     ══════════════════════════════════════════════════════════════════════════ */
  () => tryRunAsync('HATCH-REFUSE-1: under the capstone arm a REFUSED grant shows NO companion, spends nothing, and says why', async () => {
    const CO = window.HearthriseCompanions;
    const Cap = window.HearthriseCapstone;
    if (!CO || typeof CO.requestServerUnlock !== 'function' || !Cap || !Cap.__setBlobRetired) return;
    if (!window.COMPANIONS || !window.COMPANIONS.whelp) return;
    const snap = snapshotG();
    const origFetch = window.fetch, origSb = window.HearthriseSupabase, origAuth = window.HearthriseAuth;
    const origRpc = window.HearthriseRpc, origProf = window.HearthriseProfile, origNotify = window.notify;
    const said = [];
    let grantCalls = 0, body = null, wasParked = false;
    try {
      Cap.__setBlobRetired(true);
      wasParked = CO.__parkGrants(false);   // this test drives the ladder itself
      CO.__clearGrantBlocks();
      CO.__setGrantRetryMs([0, 5]);          // keep the transport ladder test-fast
      window.HearthriseSupabase = { getConfig: () => ({ url: 'https://test.local', anonKey: 'k' }) };
      window.HearthriseAuth = { getSession: () => ({ user: { id: 'u' }, access_token: 't' }) };
      window.HearthriseRpc = { mayCall: () => true };
      window.HearthriseProfile = { activeSlot: () => 2 };
      window.notify = function (m, k) { said.push({ m: String(m), k }); };
      window.G.companions = { ownedIds: [], xp: {}, equipped: null };
      window.G.inventory = Object.assign({}, window.G.inventory, { dragon_egg: 2 });

      /* PRODUCER-REAL FIXTURE — 2026-09-06-companion-grant-hardening.sql §4(e):
         `return jsonb_build_object('ok', false, 'error', 'missing_req_item',
          'item', v_cat.req_item, 'companion', p_companion)`. */
      window.fetch = function (url, init) {
        if (String(url).indexOf('hr_companion_grant') !== -1) {
          grantCalls++;
          try { body = JSON.parse(init && init.body); } catch (e) { body = null; }
          return Promise.resolve(new Response(
            JSON.stringify({ ok: false, error: 'missing_req_item', item: 'dragon_egg', companion: 'whelp' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };

      let consumed = 0;
      const got = await CO.requestServerUnlock('whelp', () => { consumed++; });
      assert(got === false, 'a refused grant must report failure');
      assert(grantCalls === 1, 'a DEFINITIVE refusal must not be retried (a rejected call still burns the '
        + '60/hour budget); saw ' + grantCalls + ' calls');
      assert(body && body.p_slot === 2 && body.p_companion === 'whelp',
        'the grant must carry the active slot + the companion id; got ' + JSON.stringify(body));
      assert(window.G.companions.ownedIds.indexOf('whelp') < 0,
        'THE BUG: the refused companion was added to the stable anyway — reconcileCompanions will remove it '
        + 'on the next envelope and the player watches it vanish');
      assert(!window.G.companions.xp || window.G.companions.xp.whelp === undefined,
        'a refused grant seeded an xp row');
      assert(consumed === 0, 'the call-site callback (the hatch\'s egg consume) ran for a REFUSED grant');
      assert(window.G.inventory.dragon_egg === 2, 'a refused hatch spent the egg; have ' + window.G.inventory.dragon_egg);
      /* ⚠ MATCH THE SUBJECT, NOT THE CHANNEL. This counted every 'kill'-channel
         notice that arrived while the stub was installed, and the suite runs on a
         LIVE page: an unrelated async toast from an earlier test ("Could not
         plant — try again", measured on the assembled run) landed in the
         collector and the assertion blamed this code for it. A test that any
         other feature's toast can fail is not measuring what its name says. */
      const refusal = said.filter((s) => /Whelp|Dragon Egg/.test(s.m));
      assert(refusal.length === 1, 'a refusal about THIS acquisition must be surfaced exactly once; saw '
        + refusal.length + ' of ' + JSON.stringify(said));
      assert(refusal[0].k === 'kill', 'the refusal must use the refusal channel; got ' + refusal[0].k);
      assert(/Dragon Egg/.test(refusal[0].m),
        'the missing_req_item refusal must NAME the item the server wanted; said "' + refusal[0].m + '"');
      assert(!/missing_req_item/.test(refusal[0].m),
        'an error code is a note to us, not a sentence to the player; said "' + refusal[0].m + '"');
      assert(!said.some((s) => /Companion unlocked/.test(s.m)),
        'a refused grant still toasted "Companion unlocked"');

      /* ── ASK ONCE, NOT ONCE PER HARVEST ────────────────────────────────────
         The old code pushed the id into ownedIds immediately, so the
         `ownedIds.includes(id)` guard at the top of unlockCompanion stopped
         every later call. Waiting for the server means that guard no longer
         closes — and wireBunnyQuest calls unlockCompanion('bunny') on EVERY
         harvest past the hundredth. Without a refusal memo, one refusal becomes
         one RPC, one hr_rejections row and one toast PER HARVEST. */
      const mine = () => said.filter((s) => /Whelp|Dragon Egg/.test(s.m)).length;
      const before = grantCalls, saidBefore = mine();
      await CO.requestServerUnlock('whelp');
      await CO.requestServerUnlock('whelp');
      assert(grantCalls === before,
        'a DEFINITIVE refusal must be remembered — the repeating trigger asked the server again ('
        + (grantCalls - before) + ' extra call(s)), burning the 60/hour budget to be told the same thing');
      assert(mine() === saidBefore,
        'and the player must be told ONCE, not once per harvest; saw ' + (mine() - saidBefore) + ' extra');
    } finally {
      CO.__parkGrants(wasParked);
      CO.__clearGrantBlocks();
      CO.__setGrantRetryMs();
      Cap.__setBlobRetired(null);
      window.fetch = origFetch; window.HearthriseSupabase = origSb; window.HearthriseAuth = origAuth;
      window.HearthriseRpc = origRpc; window.HearthriseProfile = origProf; window.notify = origNotify;
      restoreG(snap);
    }
  }),

  () => tryRunAsync('HATCH-REFUSE-2: a CONFIRMED grant delivers the companion exactly once and celebrates once', async () => {
    const CO = window.HearthriseCompanions;
    const Cap = window.HearthriseCapstone;
    if (!CO || typeof CO.requestServerUnlock !== 'function' || !Cap || !Cap.__setBlobRetired) return;
    const id = Object.keys(window.COMPANIONS || {}).find((k) => String(window.COMPANIONS[k].source || '').indexOf('drop:') === 0);
    if (!id) return;
    const snap = snapshotG();
    const origFetch = window.fetch, origSb = window.HearthriseSupabase, origAuth = window.HearthriseAuth;
    const origRpc = window.HearthriseRpc, origNotify = window.notify;
    const said = [];
    let grantCalls = 0, wasParked = false;
    try {
      Cap.__setBlobRetired(true);
      wasParked = CO.__parkGrants(false);   // this test drives the ladder itself
      CO.__clearGrantBlocks();
      CO.__setGrantRetryMs([0, 5]);
      window.HearthriseSupabase = { getConfig: () => ({ url: 'https://test.local', anonKey: 'k' }) };
      window.HearthriseAuth = { getSession: () => ({ user: { id: 'u' }, access_token: 't' }) };
      window.HearthriseRpc = { mayCall: () => true };
      window.notify = function (m, k) { said.push({ m: String(m), k }); };
      window.G.companions = { ownedIds: [], xp: {}, equipped: null };
      /* §4(a)'s success envelope. `egg_consumed` is null for the sixteen
         companions with no req_item — exactly what the server returns. */
      window.fetch = function (url) {
        if (String(url).indexOf('hr_companion_grant') !== -1) {
          grantCalls++;
          return Promise.resolve(new Response(JSON.stringify({ ok: true, companion: id, egg_consumed: null }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      let cheered = 0;
      const got = await CO.requestServerUnlock(id, () => { cheered++; });
      assert(got === true, 'a confirmed grant must report success');
      assert(grantCalls === 1, 'one acquisition, one call; saw ' + grantCalls);
      const owned = window.G.companions.ownedIds.filter((x) => x === id).length;
      assert(owned === 1, 'the companion must appear EXACTLY once; ownedIds has it ' + owned + ' times');
      assert(window.G.companions.xp[id] === 0, 'the xp row must be seeded at 0');
      assert(cheered === 1, 'the call-site celebration must fire exactly once; fired ' + cheered);
      const cheers = said.filter((s) => /Companion unlocked/.test(s.m));
      assert(cheers.length === 1, 'exactly one unlock toast; saw ' + JSON.stringify(said));
      /* Subject-scoped, not channel-scoped — see the note in HATCH-REFUSE-1. The
         suite is a live page and unrelated async toasts share the 'kill' channel. */
      const nameOf = (window.COMPANIONS[id] || {}).n || id;
      assert(!said.some((s) => s.k === 'kill' && s.m.indexOf(nameOf) >= 0),
        'a SUCCESS produced a refusal notice about ' + nameOf + ': ' + JSON.stringify(said));
    } finally {
      CO.__parkGrants(wasParked);
      CO.__clearGrantBlocks();
      CO.__setGrantRetryMs();
      Cap.__setBlobRetired(null);
      window.fetch = origFetch; window.HearthriseSupabase = origSb; window.HearthriseAuth = origAuth;
      window.HearthriseRpc = origRpc; window.notify = origNotify;
      restoreG(snap);
    }
  }),

  () => tryRunAsync('HATCH-REFUSE-3: an unknown_unlock (the b453 catalogue class) gets its OWN sentence, and a TRANSPORT failure is retried', async () => {
    const CO = window.HearthriseCompanions;
    const Cap = window.HearthriseCapstone;
    if (!CO || typeof CO.requestServerUnlock !== 'function' || !Cap || !Cap.__setBlobRetired) return;
    const id = Object.keys(window.COMPANIONS || {}).find((k) => String(window.COMPANIONS[k].source || '').indexOf('drop:') === 0);
    if (!id) return;
    const snap = snapshotG();
    const origFetch = window.fetch, origSb = window.HearthriseSupabase, origAuth = window.HearthriseAuth;
    const origRpc = window.HearthriseRpc, origNotify = window.notify;
    let said = [], grantCalls = 0, answers = [], wasParked = false;
    try {
      Cap.__setBlobRetired(true);
      wasParked = CO.__parkGrants(false);   // this test drives the ladder itself
      CO.__clearGrantBlocks();
      CO.__setGrantRetryMs([0, 5, 5]);
      window.HearthriseSupabase = { getConfig: () => ({ url: 'https://test.local', anonKey: 'k' }) };
      window.HearthriseAuth = { getSession: () => ({ user: { id: 'u' }, access_token: 't' }) };
      window.HearthriseRpc = { mayCall: () => true };
      window.notify = function (m, k) { said.push({ m: String(m), k }); };
      window.fetch = function (url) {
        if (String(url).indexOf('hr_companion_grant') !== -1) {
          grantCalls++;
          const a = answers.shift();
          if (a === 'boom') return Promise.reject(new TypeError('Failed to fetch'));
          return Promise.resolve(new Response(JSON.stringify(a),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };

      /* (a) THE CATALOGUE REFUSAL — §4(f)/(h)'s envelope verbatim. A server-side
         defect, so it must NOT be retried and must not blame the player. */
      window.G.companions = { ownedIds: [], xp: {}, equipped: null };
      said = []; grantCalls = 0;
      answers = [{ ok: false, error: 'unknown_unlock:companion:' + id,
        detail: { companion: id, unlock_id: 'companion:' + id, raced: false } }];
      await CO.requestServerUnlock(id);
      assert(grantCalls === 1, 'an unknown_unlock is a server catalogue defect — retrying it is pointless spend; saw ' + grantCalls);
      assert(window.G.companions.ownedIds.length === 0, 'an unknown_unlock still delivered the companion');
      /* Subject-scoped, not channel-scoped — see the note in HATCH-REFUSE-1. An
         unrelated async toast from an earlier test ("Could not plant — try
         again", measured twice) also rides the 'kill' channel, and counting the
         channel made this test fail on another feature's noise. */
      const nameOf = (window.COMPANIONS[id] || {}).n || id;
      const r = said.filter((s) => s.k === 'kill' && s.m.indexOf(nameOf) >= 0);
      assert(r.length === 1 && !/unknown_unlock/.test(r[0].m),
        'the catalogue refusal needs its own player sentence, not the machine code; said ' + JSON.stringify(said));

      /* THE MEMO IS REAL, and this is where it has to be cleared: (a) blocked
         this id for the session, so (b) would be refused before it reached the
         transport. Asserted rather than just cleared, so the block cannot
         silently stop existing. */
      assert(await CO.requestServerUnlock(id) === false && grantCalls === 1,
        'the definitive refusal in (a) was not remembered — the repeating trigger would re-ask forever');
      CO.__clearGrantBlocks();

      /* (b) THE TRANSPORT FAILURE — the acquisition was never DECIDED, so it is
         retried. This is the half that stops a twenty-second reconnect eating a
         1-in-2,500 drop. */
      window.G.companions = { ownedIds: [], xp: {}, equipped: null };
      said = []; grantCalls = 0;
      answers = ['boom', { ok: true, companion: id, egg_consumed: null }];
      const got = await CO.requestServerUnlock(id);
      assert(grantCalls === 2, 'a transport failure must be RETRIED, not surfaced as a refusal; saw ' + grantCalls);
      assert(got === true && window.G.companions.ownedIds.indexOf(id) >= 0,
        'the retry landed but the companion was not delivered');
      assert(!said.some((s) => s.k === 'kill' && s.m.indexOf(nameOf) >= 0),
        'an eventually-successful retry must not scare the player with a refusal about ' + nameOf
        + ': ' + JSON.stringify(said));
    } finally {
      CO.__parkGrants(wasParked);
      CO.__clearGrantBlocks();
      CO.__setGrantRetryMs();
      Cap.__setBlobRetired(null);
      window.fetch = origFetch; window.HearthriseSupabase = origSb; window.HearthriseAuth = origAuth;
      window.HearthriseRpc = origRpc; window.notify = origNotify;
      restoreG(snap);
    }
  }),

  /* HATCH-REFUSE-4 IS RETIRED (b515). It was the DORMANT control for the three
     tests above: with the capstone disarmed, `needsServerConfirm()` must answer
     false, the companion must be added inline, the celebration must run
     synchronously and NO hr_companion_grant may be fired — otherwise a dormant
     client (and every offline suite run) would stop delivering companions.

     companions.js's `blobRetired()` is now `return true`, a literal, not a read
     of `window.HearthriseCapstone`. That is deliberate and it is documented at
     the definition: the capstone predicate ANDed the b353 kill switch, so its
     false position only existed on a device holding `hr:serverAccrual=off`.
     `__setBlobRetired(false)` therefore selects nothing here, and a "dormant"
     assertion would have been grading the armed path under a dormant name —
     which is worse than no test.

     Its OTHER half is not about a position at all and is kept, below: which
     acquisitions route through hr_companion_grant and which must not. That fork
     is live, it is the one a wrong answer breaks (a shop companion sent to the
     grant verb is refused `not_grantable` and the player never receives it), and
     it is the positive control HATCH-REFUSE-1..3 need in order to mean anything. */
  () => tryRun('HATCH-REFUSE-4b: WHICH acquisitions are server-confirmed is a fork, and shop/starter are not on it', () => {
    const CO = window.HearthriseCompanions;
    if (!CO || typeof CO.needsServerConfirm !== 'function') { skip('companions seam absent'); return; }
    if (!(window.HearthriseGoalClaim && typeof window.HearthriseGoalClaim.grantCompanion === 'function')) {
      skip('hr_companion_grant transport absent'); return;
    }
    const src = window.COMPANIONS || {};
    const bySource = (pfx) => Object.keys(src).find((k) => String(src[k].source || '').indexOf(pfx) === 0);
    const dropId = bySource('drop:');
    const shopId = bySource('shop');
    const starterId = bySource('starter');
    assert(dropId, 'no drop-sourced companion in the catalogue — this guard would be vacuous');

    /* A DROP is the case the ladder exists for: it has no other server writer,
       so it MUST be confirmed before it appears, or a reload takes it back. */
    assert(CO.needsServerConfirm(dropId) === true,
      'a drop companion (' + dropId + ') is not server-confirmed — it would be added locally, the residue '
      + 'would not carry it, and reconcileCompanions would delete it on the next envelope');

    /* A SHOP companion already gets its row from hr_unlock_buy, and
       hr_companion_grant refuses it `not_grantable`
       (2026-09-06-companion-grant-hardening.sql §4(d)) — routing it here would
       be a purchase the player pays for and never receives. */
    if (shopId) {
      assert(CO.needsServerConfirm(shopId) === false,
        'a SHOP companion (' + shopId + ') was routed through hr_companion_grant — the server refuses it '
        + 'not_grantable, so the purchase would complete and the companion would never arrive');
    }
    /* The starter fox is owned by GRAMMAR — reconcileCompanions unions it into
       every roster and there is no row to grant. */
    if (starterId) {
      assert(CO.needsServerConfirm(starterId) === false,
        'the starter companion (' + starterId + ') was routed through the grant verb — it has no server row '
        + 'and never will; reconcileCompanions owns it');
    }
    /* CONTROL: an id the catalogue does not know must not be confirmable, or the
       three answers above could all be a function that says whatever it likes. */
    assert(CO.needsServerConfirm('no_such_companion_xyz') === false,
      'an unknown id was declared server-confirmable');
  }),

  () => tryRunAsync('server-credited (Tier-1 collection): under arm a milestone claim PROCEEDS, fires hr_claim_milestone WITH the slot, and does not double-pay locally', async () => {
    // 2026-08-22: hr_claim_milestone RE-DERIVES the DISTINCT monster/item count
    // from hr_bestiary_of / hr_collection_of and CREDITS the server-owned
    // gold+gems into player_state, once-guarded. The b411 defer is GONE. So under
    // arm the claim must PROCEED (mark claimed, fire the RPC with the active slot)
    // and NOT double-pay gold locally — the local write is a gated prediction the
    // envelope reconciles. Pre-arm it still pays locally (the control). Mirrors
    // the muster/raid and daily/quest server-credited tests.
    const C = window.HearthriseCollection;
    if (!C || typeof C.claimMilestone !== 'function' || !window.MONSTERS) return;
    const monIds = Object.keys(window.MONSTERS).slice(0, 10);
    if (monIds.length < 10) return;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origFetch = window.fetch;
    let unstub = () => {};
    const origRec = window.HearthriseRecord;
    let claimBody = null, claimCalls = 0, refreshCalls = 0;
    try {
      // A signed-in, server-backed environment with a mocked hr_claim_milestone.
      // Never let the balance refresh apply a real envelope into the live G.
      window.HearthriseRecord = { requestRecord: () => { refreshCalls++; return Promise.resolve(null); } };
      unstub = stubSignedIn(3);
      window.fetch = function (url, init) {
        if (String(url).indexOf('hr_claim_milestone') !== -1) {
          claimCalls++;
          try { claimBody = JSON.parse(init && init.body); } catch (e) { claimBody = null; }
          return Promise.resolve(new Response(
            JSON.stringify({ ok: true, milestone: 'hunter10', gold: 2000, gems: 0, credited: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      // Seed 10 discovered monsters so 'hunter10' (reward gold:2000) tests true.
      window.G.bestiary = {}; monIds.forEach((m) => { window.G.bestiary[m] = { kills: 1 }; });

      // ── CONTROL (pre-arm): the claim pays LOCALLY as a display prediction.
      window.clientMayWriteRecordField = function () { return true; };
      window.G.collectionLog = { claimed: [] };
      predZero(); window.G.gold = 0; claimCalls = 0; claimBody = null;
      const r1 = await C.claimMilestone('hunter10');
      assert(r1 && r1.gold === 2000, 'pre-arm claim must return the reward');
      assert(window.G.gold === 2000, 'pre-arm claim renders the reward locally; got ' + window.G.gold);
      assert(window.G.collectionLog.claimed.indexOf('hunter10') >= 0, 'pre-arm claim marks the milestone claimed');
      assert(claimCalls === 1, 'pre-arm claim must fire hr_claim_milestone exactly once; saw ' + claimCalls);
      assert(claimBody && claimBody.p_slot === 3, 'claim must pass the active slot; got ' + JSON.stringify(claimBody));

      // ── ARMED: the claim PROCEEDS, fires the RPC WITH the slot, marks claimed,
      //    and does NOT write gold locally (the server credited player_state).
      window.clientMayWriteRecordField = function (f) { return f !== 'gold' && f !== 'gems'; };
      window.G.collectionLog = { claimed: [] };
      predZero(); window.G.gold = 0; claimCalls = 0; claimBody = null; refreshCalls = 0;
      const r2 = await C.claimMilestone('hunter10');
      assert(r2 && r2.gold === 2000, 'armed claim must PROCEED and return the reward (the b411 defer is gone)');
      assert(window.G.gold === 0, 'armed claim must NOT double-pay gold locally (server credits player_state); got ' + window.G.gold);
      assert(window.G.collectionLog.claimed.indexOf('hunter10') >= 0, 'armed claim marks the milestone claimed (consumed server-side)');
      assert(claimCalls === 1, 'armed claim must fire hr_claim_milestone; the defer is removed; saw ' + claimCalls);
      assert(claimBody && claimBody.p_slot === 3, 'armed claim must pass the active slot for the server to credit; got ' + JSON.stringify(claimBody));
      assert(refreshCalls === 1, 'an ok credit must refresh the record so the balance moves; saw ' + refreshCalls);
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.fetch = origFetch;
      unstub();
      window.HearthriseRecord = origRec;
      if (C.__resetClaimState) C.__resetClaimState();
      restoreG(snap);
    }
  }),

  /* ── MILESTONE-CLAIM-1 — THE SAME DEFECT ON THE SIBLING SURFACE ──────────────
     claimMilestone was fire-and-forget with an UNCONDITIONAL
     `s.claimed.push(id)`, and `G.collectionLog` is RESIDUE — so a refused
     milestone was marked claimed forever. And the refusal is the COMMON case,
     not the edge: `getStats` counts what the ATTENDED player saw (G.bestiary /
     G.collection), hr_claim_milestone counts its own away-sim rows, which
     realise 60–99% fewer kills. Client 12 monsters, server 4, `incomplete`, and
     an EARNED milestone is consumed with nothing paid. */
  () => tryRunAsync('MILESTONE-CLAIM-1: a REFUSED hr_claim_milestone leaves the milestone re-claimable, pays nothing, and says so honestly', async () => {
    const C = window.HearthriseCollection;
    if (!C || typeof C.claimMilestone !== 'function' || !window.MONSTERS) return;
    const monIds = Object.keys(window.MONSTERS).slice(0, 12);
    if (monIds.length < 12) return;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origFetch = window.fetch;
    let unstub = () => {};
    const origRec = window.HearthriseRecord;
    const origNotify = window.notify;
    let claimCalls = 0, refreshCalls = 0;
    const said = [];
    try {
      unstub = stubSignedIn(0);
      window.HearthriseRecord = { requestRecord: () => { refreshCalls++; return Promise.resolve(null); } };
      window.notify = (m) => { said.push(String(m || '')); };
      window.fetch = function (url) {
        if (String(url).indexOf('hr_claim_milestone') !== -1) {
          claimCalls++;
          return Promise.resolve(new Response(
            JSON.stringify({ ok: false, error: 'incomplete', milestone: 'hunter10', have: 4, goal: 10, domain: 'monsters' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      window.clientMayWriteRecordField = function (f) { return f !== 'gold' && f !== 'gems'; };  // ARMED
      window.G.bestiary = {}; monIds.forEach((m) => { window.G.bestiary[m] = { kills: 1 }; });
      window.G.collectionLog = { claimed: [] };
      predZero(); window.G.gold = 0;

      assert(C.claimable(window.G).some((m) => m.id === 'hunter10'), 'hunter10 must be claimable at 12 monsters');
      const out = await C.claimMilestone('hunter10', window.G);

      assert(claimCalls === 1, 'the claim must reach the server exactly once; saw ' + claimCalls);
      assert(out === null, 'a refused claim must resolve to null, never the reward');
      assert(window.G.collectionLog.claimed.indexOf('hunter10') < 0,
        'THE BUG: a REFUSED milestone was marked claimed — permanently and silently lost. It must stay unclaimed.');
      assert(C.claimable(window.G).some((m) => m.id === 'hunter10'),
        'a refused milestone must still be offered — the player has not been paid for it');
      assert((window.G.gold || 0) === 0, 'a refused claim must leave no gold prediction; got ' + window.G.gold);
      assert(refreshCalls === 0, 'a refused claim has nothing to refresh');
      const msg = said.join(' | ');
      assert(said.length >= 1, 'a refused claim must TELL the player — silence is the original defect');
      assert(msg.indexOf('incomplete') < 0, 'the player is told a sentence, never the raw error code: ' + msg);
      assert(/4/.test(msg) && /10/.test(msg), 'the refusal must answer in the SERVER’s own count: ' + msg);
      const sh = C.milestoneShortfall('hunter10');
      assert(sh && sh.have === 4 && sh.goal === 10 && sh.domain === 'monsters',
        'the server shortfall must be retained for the modal row; got ' + JSON.stringify(sh));

      // And it must be re-claimable for real once the server's count catches up.
      window.fetch = function (url) {
        if (String(url).indexOf('hr_claim_milestone') !== -1) {
          claimCalls++;
          return Promise.resolve(new Response(
            JSON.stringify({ ok: true, milestone: 'hunter10', gold: 2000, gems: 0, credited: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      const out2 = await C.claimMilestone('hunter10', window.G);
      assert(out2 && out2.gold === 2000, 'the retry after the server caught up must pay');
      assert(window.G.collectionLog.claimed.indexOf('hunter10') >= 0, 'the successful retry marks it claimed');
      assert(C.milestoneShortfall('hunter10') === null, 'a paid milestone must drop its shortfall note');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.fetch = origFetch;
      unstub();
      window.HearthriseRecord = origRec;
      window.notify = origNotify;
      if (C.__resetClaimState) C.__resetClaimState();
      restoreG(snap);
    }
  }),

  () => tryRunAsync('server-credited (Tier-1 renown): under arm a rank claim PROCEEDS, fires hr_claim_rank WITH the slot, and does not double-pay locally', async () => {
    // 2026-08-22: hr_claim_rank reads the SERVER-DERIVED renown score, ratchets a
    // SERVER HIGH-WATER, and CREDITS the server-owned gold+gems, once-guarded. The
    // b411 defer is GONE. Under arm the claim must PROCEED (mark claimed, fire the
    // RPC with the active slot) and NOT double-pay gold locally.
    // b494: claimRank is now AWAITED (two-phase) — see RANK-CLAIM-1/2 below.
    const R = window.HearthriseRenown;
    if (!R || typeof R.claimRank !== 'function' || typeof R.getClaimable !== 'function') return;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origFetch = window.fetch;
    let unstub = () => {};
    const origRec = window.HearthriseRecord;
    let claimBody = null, claimCalls = 0, refreshCalls = 0;
    try {
      unstub = stubSignedIn(4);
      // Never let the balance refresh apply a real envelope into the live G.
      window.HearthriseRecord = { requestRecord: () => { refreshCalls++; return Promise.resolve(null); } };
      window.fetch = function (url, init) {
        if (String(url).indexOf('hr_claim_rank') !== -1) {
          claimCalls++;
          try { claimBody = JSON.parse(init && init.body); } catch (e) { claimBody = null; }
          return Promise.resolve(new Response(
            JSON.stringify({ ok: true, rank: 'serf', gold: 250, gems: 0, renown_high: 999999, credited: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      if (!window.G.stats) window.G.stats = {};
      window.G.stats.kills = 60000;                  // → high renown, ranks reached

      // ── CONTROL (pre-arm): pays locally as a display prediction.
      window.clientMayWriteRecordField = function () { return true; };
      window.G.renown = { claimed: [], seenRank: 0 };
      predZero(); window.G.gold = 0; claimCalls = 0; claimBody = null;
      const claimables = R.getClaimable(window.G);
      assert(claimables.length > 0, 'high renown should expose claimable ranks');
      const id = claimables[0].id;
      const before = window.G.gold || 0;
      const g1 = await R.claimRank(id, window.G);
      assert(g1 && (window.G.gold || 0) > before, 'pre-arm rank claim must pay locally');
      assert(claimCalls === 1, 'pre-arm claim must fire hr_claim_rank once; saw ' + claimCalls);
      assert(claimBody && claimBody.p_slot === 4, 'claim must pass the active slot; got ' + JSON.stringify(claimBody));
      assert(claimBody && claimBody.p_rank_id === id, 'claim must pass the rank id; got ' + JSON.stringify(claimBody));

      // ── ARMED: PROCEEDS, fires the RPC, marks claimed, no local gold double-pay.
      window.clientMayWriteRecordField = function (f) { return f !== 'gold' && f !== 'gems'; };
      window.G.renown = { claimed: [], seenRank: 0 };
      predZero(); window.G.gold = 0; claimCalls = 0; claimBody = null; refreshCalls = 0;
      const g2 = await R.claimRank(id, window.G);
      assert(g2, 'armed rank claim must PROCEED (the b411 defer is gone)');
      assert(window.G.gold === 0, 'armed claim must NOT double-pay gold locally; got ' + window.G.gold);
      assert(window.G.renown.claimed.indexOf(id) >= 0, 'armed claim marks the rank claimed');
      assert(claimCalls === 1, 'armed claim must fire hr_claim_rank; saw ' + claimCalls);
      assert(claimBody && claimBody.p_slot === 4, 'armed claim must pass the active slot; got ' + JSON.stringify(claimBody));
      /* bug_reports #46 class: gold is SERVER_OF_RECORD, so the server's credit is
         invisible to the topbar until an envelope arrives. The largest single
         payout in the game must ask for one. */
      assert(refreshCalls === 1, 'an ok credit must refresh the record so the balance moves; saw ' + refreshCalls);
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.fetch = origFetch;
      unstub();
      window.HearthriseRecord = origRec;
      if (R.__resetClaimState) R.__resetClaimState();
      restoreG(snap);
    }
  }),

  /* ── RANK-CLAIM-1 — A REFUSED hr_claim_rank MUST LEAVE THE RANK RE-CLAIMABLE ──
     THE BUG (P1, found by the security pass on the renown kill-faucet fix).
     claimRank fired hr_claim_rank fire-and-forget (`.catch(noop)`) and then did
     `s.claimed.push(rankId)` UNCONDITIONALLY. The server decides on ITS OWN
     score and answers `not_reached` whenever the client's client-authored score
     runs ahead of it — which the kill-faucet discount deliberately makes
     routine. `G.renown` is RESIDUE (src/net/client-state.js), so the refused
     rank was marked claimed FOREVER: gone from getClaimable, ✓ in the ladder, no
     gold. Up to 1,000,000 gold + 500 gems, silently, from an honest player.

     The guard: refuse, and NOTHING may be written — not the claimed mark, not a
     gold/gem prediction — and the player must be told in a sentence, not a code. */
  () => tryRunAsync('RANK-CLAIM-1: a REFUSED hr_claim_rank leaves the rank re-claimable, pays nothing, and says so honestly', async () => {
    const R = window.HearthriseRenown;
    if (!R || typeof R.claimRank !== 'function' || typeof R.getClaimable !== 'function') return;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origFetch = window.fetch;
    let unstub = () => {};
    const origRec = window.HearthriseRecord;
    const origNotify = window.notify;
    let claimCalls = 0, refreshCalls = 0;
    const said = [];
    try {
      unstub = stubSignedIn(0);
      window.HearthriseRecord = { requestRecord: () => { refreshCalls++; return Promise.resolve(null); } };
      window.notify = (m) => { said.push(String(m || '')); };
      window.fetch = function (url) {
        if (String(url).indexOf('hr_claim_rank') !== -1) {
          claimCalls++;
          // The server's own score is SHORT of the rank — the shape the faucet
          // discount makes routine for a kill-heavy account.
          return Promise.resolve(new Response(
            JSON.stringify({ ok: false, error: 'not_reached', rank: 'serf', renown_high: 180, min: 400 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      window.clientMayWriteRecordField = function (f) { return f !== 'gold' && f !== 'gems'; };  // ARMED
      if (!window.G.stats) window.G.stats = {};
      window.G.stats.kills = 60000;                 // the CLIENT score says the rank is reached
      window.G.renown = { claimed: [], seenRank: 0 };
      predZero(); window.G.gold = 0; window.G.gems = 0;

      const claimables = R.getClaimable(window.G);
      assert(claimables.length > 0, 'high renown should expose claimable ranks');
      const rank = claimables[0];
      const goldBefore = window.G.gold || 0, gemsBefore = window.G.gems || 0;

      const out = await R.claimRank(rank.id, window.G);

      assert(claimCalls === 1, 'the claim must reach the server exactly once; saw ' + claimCalls);
      assert(out === null, 'a refused claim must resolve to null, never the reward');
      assert(window.G.renown.claimed.indexOf(rank.id) < 0,
        'THE BUG: a REFUSED rank was marked claimed — permanently and silently lost. It must stay unclaimed.');
      assert(R.getClaimable(window.G).some((r) => r.id === rank.id),
        'a refused rank must still be offered — the player has not been paid for it');
      assert((window.G.gold || 0) === goldBefore, 'a refused claim must leave no gold prediction; got ' + window.G.gold);
      assert((window.G.gems || 0) === gemsBefore, 'a refused claim must leave no gem prediction; got ' + window.G.gems);
      assert(refreshCalls === 0, 'a refused claim has nothing to refresh');
      assert(said.length >= 1, 'a refused claim must TELL the player — silence is the original defect');
      const msg = said.join(' | ');
      assert(msg.indexOf('not_reached') < 0, 'the player is told a sentence, never the raw error code (b465): ' + msg);
      assert(/180/.test(msg) && /400/.test(msg),
        'the refusal must answer in the SERVER’s own figures so it is honest, not mysterious: ' + msg);
      /* The server's shortfall is retained so the ladder row can explain itself
         after the toast is gone — the closest the client gets to painting the
         server's score without a projection RPC. */
      const short = R.serverShortfall(rank.id);
      assert(short && short.high === 180 && short.min === 400,
        'the server shortfall must be retained for the ladder row; got ' + JSON.stringify(short));
      assert(R.serverRenownHigh() === 180, 'the server high-water must be learned from the verdict; got ' + R.serverRenownHigh());

      // ── AND IT MUST BE RE-CLAIMABLE FOR REAL: the same click, once the server's
      //    own score has caught up, pays. (The click is what advances the server
      //    high-water, which is why the button must never be hidden.)
      window.fetch = function (url) {
        if (String(url).indexOf('hr_claim_rank') !== -1) {
          claimCalls++;
          return Promise.resolve(new Response(
            JSON.stringify({ ok: true, rank: rank.id, gold: rank.reward.gold || 0, gems: rank.reward.gems || 0, renown_high: 9999, credited: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      const out2 = await R.claimRank(rank.id, window.G);
      assert(out2, 'the retry after the server caught up must pay');
      assert(window.G.renown.claimed.indexOf(rank.id) >= 0, 'the successful retry marks it claimed');
      assert(R.serverShortfall(rank.id) === null, 'a paid rank must drop its shortfall note');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.fetch = origFetch;
      unstub();
      window.HearthriseRecord = origRec;
      window.notify = origNotify;
      if (R.__resetClaimState) R.__resetClaimState();
      restoreG(snap);
    }
  }),

  /* ── RANK-CLAIM-2 — ok:true PAYS ONCE; already_claimed IS THE SERVER'S MEMORY;
     AN UNREACHABLE SERVER NEVER CONSUMES THE RANK. Three outcomes that must not
     collapse into each other: the claimed mark follows the server, and only the
     server. */
  () => tryRunAsync('RANK-CLAIM-2: an ok claim pays once and is idempotent; already_claimed marks it without paying; an offline claim consumes nothing', async () => {
    const R = window.HearthriseRenown;
    if (!R || typeof R.claimRank !== 'function' || typeof R.getClaimable !== 'function') return;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origFetch = window.fetch;
    const origSb = window.HearthriseSupabase;
    const origAuth = window.HearthriseAuth;
    const origRpc = window.HearthriseRpc;
    const origProf = window.HearthriseProfile;
    const origRec = window.HearthriseRecord;
    const origNotify = window.notify;
    let claimCalls = 0, verdict = null;
    const said = [];
    try {
      window.HearthriseSupabase = { getConfig: () => ({ url: 'https://test.local', anonKey: 'k' }) };
      window.HearthriseRpc = { mayCall: () => true };
      window.HearthriseProfile = { activeSlot: () => 0 };
      window.HearthriseRecord = { requestRecord: () => Promise.resolve(null) };
      window.notify = (m) => { said.push(String(m || '')); };
      window.fetch = function (url) {
        if (String(url).indexOf('hr_claim_rank') !== -1) {
          claimCalls++;
          return Promise.resolve(new Response(JSON.stringify(verdict),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      window.clientMayWriteRecordField = function (f) { return f !== 'gold' && f !== 'gems'; };  // ARMED
      if (!window.G.stats) window.G.stats = {};
      window.G.stats.kills = 60000;

      // ── (a) SIGNED OUT: the payout is the server's and the server is out of
      //    reach. Nothing may be consumed — the old code marked it claimed anyway.
      window.HearthriseAuth = { getSession: () => null };
      window.G.renown = { claimed: [], seenRank: 0 };
      predZero(); window.G.gold = 0;
      const id = R.getClaimable(window.G)[0].id;
      claimCalls = 0; said.length = 0;
      const offline = await R.claimRank(id, window.G);
      assert(offline === null, 'a claim with no session resolves to null');
      assert(claimCalls === 0, 'a signed-out claim must not even reach the wire; saw ' + claimCalls);
      assert(window.G.renown.claimed.indexOf(id) < 0, 'a signed-out claim must NOT consume the rank');
      assert(said.length >= 1, 'a signed-out claim must say why');

      // ── (b) ok:true — pays exactly once, and a replay is a local no-op (the
      //    claimed mark short-circuits before the wire; the server once-guard is
      //    the second net).
      window.HearthriseAuth = { getSession: () => ({ user: { id: 'u' }, access_token: 't' }) };
      window.G.renown = { claimed: [], seenRank: 0 };
      predZero(); window.G.gold = 0;
      verdict = { ok: true, rank: id, gold: 250, gems: 0, renown_high: 9999, credited: true };
      claimCalls = 0;
      const first = await R.claimRank(id, window.G);
      assert(first, 'an ok claim must resolve to the reward');
      assert(window.G.renown.claimed.indexOf(id) >= 0, 'an ok claim marks the rank claimed');
      assert(claimCalls === 1, 'one claim, one call; saw ' + claimCalls);
      const second = await R.claimRank(id, window.G);
      assert(second === null, 'a replay must not pay twice');
      assert(claimCalls === 1, 'a replay of a claimed rank must not re-hit the server; saw ' + claimCalls);
      assert(window.G.renown.claimed.filter((x) => x === id).length === 1,
        'the claimed list must not grow a duplicate');

      // ── (c) already_claimed — the server once-guard IS the memory (the mark is
      //    residue and a reload can precede the verdict). Mark it, pay nothing.
      window.G.renown = { claimed: [], seenRank: 0 };
      predZero(); window.G.gold = 0;
      verdict = { ok: false, error: 'already_claimed', rank: id };
      claimCalls = 0; said.length = 0;
      const dup = await R.claimRank(id, window.G);
      assert(dup === null, 'already_claimed resolves to null — there is no new reward');
      assert(claimCalls === 1, 'already_claimed still costs one call; saw ' + claimCalls);
      assert(window.G.renown.claimed.indexOf(id) >= 0,
        'already_claimed MUST mark it claimed — the server has already paid it, and re-offering it is a lie');
      assert(said.join(' ').indexOf('already_claimed') < 0, 'the player is told a sentence, never the code');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.fetch = origFetch;
      window.HearthriseSupabase = origSb;
      window.HearthriseAuth = origAuth;
      window.HearthriseRpc = origRpc;
      window.HearthriseProfile = origProf;
      window.HearthriseRecord = origRec;
      window.notify = origNotify;
      if (R.__resetClaimState) R.__resetClaimState();
      restoreG(snap);
    }
  }),

  () => tryRunAsync('server-credited (Tier-1 muster): under arm the rally claim PROCEEDS, calls world_event_claim WITH the slot, and does not double-pay locally', async () => {
    // 2026-08-19: world_event_claim now CREDITS the chest into player_state,
    // atomically with consuming the once-per-day claim (the in-RPC credit). The
    // b411 entry-defer is GONE. So under arm the claim must PROCEED to the RPC
    // (passing the active slot the server credits against) and NOT double-pay
    // gold locally — payChest's local write is a display prediction the envelope
    // reconciles, gated off under arm. Pre-arm it still pays locally (the control).
    const M = window.HearthriseMuster;
    if (!M || typeof M.claim !== 'function') return;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origFetch = window.fetch;
    let unstub = () => {};
    let claimBody = null, claimCalls = 0;
    try {
      // A signed-in, server-backed environment with a mocked world_event_claim.
      unstub = stubSignedIn(2);
      window.fetch = function (url, init) {
        if (String(url).indexOf('world_event_claim') !== -1) {
          claimCalls++;
          try { claimBody = JSON.parse(init && init.body); } catch (e) { claimBody = null; }
          return Promise.resolve(new Response(
            JSON.stringify({ ok: true, gold: 1500, gems: 2, seals: 0, band: 'answered', held: false }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };

      // ── CONTROL (pre-arm): the RPC path pays the chest LOCALLY as a display
      //    prediction, exactly today's behaviour.
      window.clientMayWriteRecordField = function () { return true; };
      window.G.muster = { dayKey: null, eventKey: 'ev', slot: null, startMs: 0, endMs: 0,
                          points: 500, pending: 0, rallied: false, claimed: false, server: true };
      predZero(); window.G.gold = 0; claimCalls = 0; claimBody = null;
      const okUnarmed = await M.claim();
      assert(okUnarmed === true, 'pre-arm server claim must succeed');
      assert(claimCalls === 1, 'pre-arm claim must call world_event_claim exactly once; saw ' + claimCalls);
      assert(window.G.gold === 1500, 'pre-arm claim renders the server amount locally; got ' + window.G.gold);
      assert(window.G.muster.claimed === true, 'pre-arm claim marks the day claimed');

      // ── ARMED: the claim PROCEEDS (no defer), calls the RPC WITH the slot, and
      //    does NOT write gold locally — the server credited player_state.
      window.clientMayWriteRecordField = function (f) { return f !== 'gold' && f !== 'gems'; };
      window.G.muster = { dayKey: null, eventKey: 'ev', slot: null, startMs: 0, endMs: 0,
                          points: 500, pending: 0, rallied: false, claimed: false, server: true };
      predZero(); window.G.gold = 0; claimCalls = 0; claimBody = null;
      const okArmed = await M.claim();
      assert(okArmed === true, 'armed claim must PROCEED and succeed (the b411 defer is gone)');
      assert(claimCalls === 1, 'armed claim must call world_event_claim; the defer is removed; saw ' + claimCalls);
      assert(claimBody && claimBody.p_slot === 2, 'armed claim must pass the active slot for the server to credit; got ' + JSON.stringify(claimBody));
      assert(window.G.gold === 0, 'armed claim must NOT double-pay gold locally (server credits player_state); got ' + window.G.gold);
      assert(window.G.muster.claimed === true, 'armed claim consumes the once-per-day claim server-side');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.fetch = origFetch;
      unstub();
      restoreG(snap);
    }
  }),

  /* ── regression suite — THE RENOWN HEADLINE IS THE REALM'S COUNT ─────────
     MEASURED LIVE (QA, 2026-09-11): a card offered "Rank up — Squire — Claim
     750", the server refused it ("the realm has counted 779 of 900"), the header
     painted 955 — all in one breath. Structural: a client kill credit scores ZERO
     renown server-side (renown-kill-faucet), so the client runs permanently ahead.
     MUTATION, both red: getState on `effectiveRenown(G)` paints 955; pollRankUp on it offers the card. Residue-ahead, CLAUDE.md §6. */
  () => tryRun('B534-1: the rank headline and the rank-up card read what the REALM has counted — a client score 176 ahead neither paints nor ranks up', () => {
    const R = window.HearthriseRenown;
    assert(R && typeof R.noteServerRenown === 'function' && typeof R.getState === 'function',
      'the renown server mirror seam is missing — every headline is back on the client score');
    const G = window.G;
    const snap = snapshotG();
    const srvBefore = R.serverRenownHigh();
    let termsBefore = null;
    try {
      // A prediction of EXACTLY 955: the terms are emptied, so the ratchet IS it.
      termsBefore = zeroRenownTerms(G);
      G.renownHigh = 955;
      G.renown = { claimed: [], seenRank: 1 };        // Serf already seen — the live shape
      if (R.__resetClaimState) R.__resetClaimState();
      assert(R.effective(G) === 955, 'fixture: the local prediction must be exactly 955; got ' + R.effective(G));
      assert(R.serverRenownHigh() === null, 'fixture: the realm must have stated nothing yet');

      // (1) THE REALM HAS COUNTED 779. Squire needs 900. The client says 955.
      const noted = R.noteServerRenown({ ok: true, renown_high: 779, progress: [], progress_truncated: false });
      assert(noted.high === 779, 'the envelope figure must land in the mirror; got ' + JSON.stringify(noted));
      const st = R.getState(G);
      assert(st.renown === 779,
        'THE BUG: the headline painted the CLIENT score (955) while the server decided on 779 and said so in a toast. '
        + 'It must read what the realm has counted; got ' + st.renown);
      assert(st.local === 955 && st.counted === true,
        'the prediction rides along, marked as counted, so no surface has to guess; got ' + JSON.stringify({ local: st.local, counted: st.counted }));
      assert(st.rank.id === 'serf', 'the rank follows the counted figure (779 → Serf), not the prediction; got ' + st.rank.id);
      assert(R.pollRankUp(G).length === 0,
        'THE BUG: a "Rank up — Squire — Claim 750" card was offered on a figure the realm had not counted, and the claim it offers is refused');
      assert(G.renown.seenRank === 1, 'a card that never fired may not advance the seen rank; got ' + G.renown.seenRank);

      // (2) THE REALM CATCHES UP — only now is the rank-up real.
      R.noteServerRenown({ ok: false, error: 'not_reached', renown_high: 900, min: 2200 });
      const st2 = R.getState(G);
      assert(st2.renown === 900 && st2.rank.id === 'squire',
        'the counted figure is what ranks a player up; got ' + st2.renown + ' / ' + st2.rank.id);
      const reached = R.pollRankUp(G);
      assert(reached.length === 1 && reached[0].id === 'squire',
        'the card fires the moment the realm has counted the threshold; got ' + JSON.stringify(reached.map((r) => r.id)));
      assert(R.pollRankUp(G).length === 0, 'the card is offered once — seenRank advanced with it');

      R.noteServerRenown({ renown_high: 400 });
      assert(R.getState(G).renown === 900,
        'the mirror is a high-water: a stale lower reading is staleness, never a demotion; got ' + R.getState(G).renown);

      if (R.__resetClaimState) R.__resetClaimState();
      R.noteServerRenown({ ok: true, progress_truncated: false, progress: [
        { kind: 'flag', key: 'renown_claim:knight', value: 1, period: '', state: 'claimed' },
        { kind: 'flag', key: 'renown_claim:__unknown__', value: 1, period: '', state: 'claimed' },
        { kind: 'unlock', key: 'property:homestead', value: 1, period: '', state: '' }
      ] });
      assert(R.serverRenownHigh() === 2200,
        'a paid rank floors the count at its threshold (knight = 2200), and an unknown rank id is never guessed; got ' + R.serverRenownHigh());
      assert(R.noteServerRenown({ ok: true }).mode === 'absent',
        'a body that says nothing about renown must leave the record alone');
      assert(R.serverRenownHigh() === 2200, 'absence is not a statement of zero; got ' + R.serverRenownHigh());
    } finally {
      if (R.__resetClaimState) R.__resetClaimState();
      if (srvBefore !== null) R.noteServerRenown({ renown_high: srvBefore });
      restoreRenownTerms(G, termsBefore);
      restoreG(snap);
    }
  }),

  /* ── regression: THE RENOWN FIGURE LIED EVERYWHERE BUT THE HEADLINE ──
     MEASURED (QA account, 2026-09-13): client 1193, `player_state.renown_high`
     1058. `renown_high` has been PROJECTED top-level on hr_state_of since
     2026-09-12 and `noteServerRenown` reads it off every envelope — but only
     getState was ever moved onto the mirror. getClaimable, getPerks,
     claimRank's reached-gate, the Chronicle's rank marks and the daily renown
     baseline still decided on `effectiveRenown`, the CLIENT ratchet over the
     `G.renownHigh` residue. The two never converge on their own: the
     kill-faucet scores a client kill at zero renown server-side, so a played
     session drifts ahead by construction (CLAUDE.md §6, with PERKS attached).
     The fix is one reader — countedRenown — and this test is the mutation
     lever: a residue 135 points ahead, and a realm that says otherwise. */
  () => tryRun('b547: the renown the client acts on is the realm\'s renown_high, never the residue ratchet', () => {
    const R = window.HearthriseRenown;
    assert(R && typeof R.counted === 'function' && typeof R.noteServerRenown === 'function',
      'the counted-renown reader and the observation seam must both be published');
    const G = window.G, snap = snapshotG();
    const srvBefore = R.serverRenownHigh();
    let termsBefore = null;
    try {
      /* Every term emptied, so the ratchet IS the prediction — 1193 exactly. */
      termsBefore = zeroRenownTerms(G);
      G.renownHigh = 1193;
      G.renown = { claimed: [], seenRank: 2 };      // Squire already seen
      if (R.__resetClaimState) R.__resetClaimState();
      assert(R.effective(G) === 1193, 'fixture: the prediction must be exactly 1193; got ' + R.effective(G));
      assert(R.serverRenownHigh() === null, 'fixture: the realm must have stated nothing yet');
      assert(R.counted(G) === 1193, 'until the realm speaks the prediction is all there is');

      /* THE ENVELOPE. hr_state_of projects `renown_high` top-level; this is the
         body accrue.js and client-state.js hand to noteServerRenown. */
      R.noteServerRenown({ ok: true, renown_high: 1058, progress: [], progress_truncated: false });
      assert(R.counted(G) === 1058,
        'THE BUG: the figure every gate decides on must be the realm\'s 1058, got ' + R.counted(G));
      const st = R.getState(G);
      assert(st.renown === 1058, 'the headline reads 1058; got ' + st.renown);
      assert(st.local === 1193 && st.counted === true,
        'the prediction rides along, marked counted: ' + JSON.stringify({ local: st.local, counted: st.counted }));

      /* A PREDICTION A WHOLE RANK AHEAD — Knight needs 2200 — which is what the
         measured 135-point drift becomes at the wrong threshold. */
      G.renownHigh = 2500;
      assert(R.effective(G) === 2500 && R.rankIndexFor(R.effective(G)) === 3,
        'fixture: the prediction must now read Knight');
      assert(R.rankIndexFor(R.counted(G)) === 2,
        'THE BUG: the realm counted a Squire (1058); acted on ' + R.RANKS[R.rankIndexFor(R.counted(G))].id);

      /* AND IT RENDERS. The Character identity line is the surface the number
         was read off; it must name the realm's rank, not the prediction's. */
      if (typeof window.showTab === 'function' && typeof window.renderCharacter === 'function') {
        window.showTab('character');
        window.renderCharacter();
        const sub = document.querySelector('.csk-hero-sub');
        if (sub) {
          assert(/Squire/.test(sub.textContent), 'the identity line prints the counted rank: ' + sub.textContent);
          assert(!/Knight/.test(sub.textContent), 'THE BUG: it printed the prediction, a rank the realm refuses');
        }
      }

    } finally {
      if (R.__resetClaimState) R.__resetClaimState();
      if (srvBefore !== null) R.noteServerRenown({ renown_high: srvBefore });
      restoreRenownTerms(G, termsBefore);
      restoreG(snap);
      try { window.showTab('profile'); } catch (e) {}
    }
  }),

  /* THE CAPABILITY HALF. A rank perk is a PAYOUT (allXP, dropRate, bank and
     market slots), so it may not exist on a number the realm has not counted —
     and the claim BUTTON is the deliberate exception, because the click is what
     advances the realm's count in the first place (RANK-CLAIM-1). */
  () => tryRun('b547: a rank PERK arrives with the realm\'s count, while the claim button stays offered', () => {
    const R = window.HearthriseRenown;
    assert(R && typeof R.counted === 'function' && typeof R.getPerks === 'function',
      'the counted-renown reader and the perk aggregator must both be published');
    const G = window.G, snap = snapshotG();
    const srvBefore = R.serverRenownHigh();
    let termsBefore = null;
    try {
      termsBefore = zeroRenownTerms(G);
      G.renownHigh = 2500;                          // the prediction says Knight
      G.renown = { claimed: [], seenRank: 2 };
      if (R.__resetClaimState) R.__resetClaimState();
      R.noteServerRenown({ ok: true, renown_high: 1058, progress: [], progress_truncated: false });
      assert(R.rankIndexFor(R.effective(G)) === 3 && R.rankIndexFor(R.counted(G)) === 2,
        'fixture: a Knight prediction against a Squire count');
      const perksShort = R.getPerks(G);
      assert(R.pollRankUp(G).length === 0, 'and no rank-up card fires on the prediction');

      /* ⚠ THE CLAIM BUTTON IS THE DELIBERATE EXCEPTION (RANK-CLAIM-1): the click
         is what advances the server's high-water, so the row stays offered on
         the prediction and the SERVER decides it. */
      assert(R.getClaimable(G).some((r) => r.id === 'knight'),
        'the Knight row stays OFFERED — the click is the only thing that moves the realm\'s count');

      /* THE REALM CATCHES UP — only now does the perk exist. */
      R.noteServerRenown({ ok: true, renown_high: 2200, progress: [], progress_truncated: false });
      const perksFull = R.getPerks(G);
      assert(perksFull.offlineHours > perksShort.offlineHours,
        'THE BUG: Knight\'s +1 offline hour must arrive with the realm\'s count, not with the '
        + 'prediction; got ' + perksShort.offlineHours + ' → ' + perksFull.offlineHours);
    } finally {
      if (R.__resetClaimState) R.__resetClaimState();
      if (srvBefore !== null) R.noteServerRenown({ renown_high: srvBefore });
      restoreRenownTerms(G, termsBefore);
      restoreG(snap);
      try { window.showTab('profile'); } catch (e) {}
    }
  }),

  /* ── regression suite — THE HEADLINE NAMES, IT DOES NOT EXPLAIN ──────────
     renown_high is ratcheted at APPLY time, so the counted figure lags a settle.
     b540 said so in a sentence painted under five headlines; TYLER, 2026-09-12,
     reading it live: *"wtf does this even mean lol"*. The contract now: the
     headline is `rank · N Renown` and NOTHING under it, and the whole
     explanation is ONE short tooltip on the ONE headline figure (the Home
     hearth band), '' while the realm has stated nothing.
     MUTATION, both red: restore the painted sub-line on the ladder/rail → the
     "no standing sentence" assert; drop the title from the hearth-band figure
     → the tooltip assert. */
  () => tryRun('B536-1: the renown headline is rank · N Renown with NOTHING under it — the settle lag is one short tooltip on the figure, and nothing at all while the realm is silent', () => {
    const R = window.HearthriseRenown;
    assert(R && typeof R.lagTip === 'function',
      'the lag-copy seam is missing — five headlines would each hand-write their own copy');
    assert(typeof R.lagHint === 'undefined',
      'the b540 sentence seam is still exported; a surface can still paint it');
    const snap = snapshotG();
    const srvBefore = R.serverRenownHigh();
    const closeLadder = () => { const m = document.getElementById('hr-rn-modal'); if (m) m.remove(); };
    /* HearthriseHome.render() no-ops unless #panel-profile is ACTIVE (its own
       guard), so force the Home screen for the read and restore it in finally. */
    const panel = document.getElementById('panel-profile');
    const panelWasActive = !!(panel && panel.classList.contains('active'));
    const paintHome = () => {
      if (panel) panel.classList.add('active');
      if (window.HearthriseHome && window.HearthriseHome.render) window.HearthriseHome.render();
      return document.getElementById('panel-profile');
    };
    const bandTip = () => {
      const el = document.querySelector('#panel-profile .hd-hearth [data-hr-renown-hint]');
      return el ? String(el.getAttribute('title') || '') : null;
    };
    try {
      if (R.__resetClaimState) R.__resetClaimState();

      // ── UNKNOWN — the realm has stated nothing this session.
      assert(R.serverRenownHigh() === null, 'fixture: the mirror starts UNKNOWN');
      assert(R.getState(window.G).counted === false, 'fixture: an UNKNOWN state must say so');
      assert(R.lagTip(R.getState(window.G)) === '',
        'UNKNOWN must carry no settle copy; got "' + R.lagTip(R.getState(window.G)) + '"');
      const unknownPanel = paintHome();
      if (unknownPanel) {
        assert(bandTip() === null,
          'THE UNKNOWN CASE: a settle tooltip hung on a figure the realm has never counted; got ' + JSON.stringify(bandTip()));
      }

      // ── COUNTED 779 — the envelope reader (top-level renown_high).
      const noted = R.noteServerRenown({ ok: true, renown_high: 779, progress: [] });
      assert(noted.high === 779, 'fixture: the envelope figure must land in the mirror; got ' + JSON.stringify(noted));
      const st = R.getState(window.G);
      assert(st.renown === 779 && st.counted === true,
        'fixture: the headline reads the realm count; got ' + st.renown + ' / counted=' + st.counted);

      // The copy itself: plain words, short, and not the b540 sentence.
      const tip = R.lagTip(st);
      assert(tip && tip.split(/\s+/).filter(Boolean).length <= 8,
        'the tooltip is a short plain sentence (≤8 words); got "' + tip + '"');
      const low = tip.toLowerCase();
      assert(low.indexOf('best yet') < 0 && low.indexOf('next settle') < 0,
        'the b540 sentence is back, in the tooltip; got "' + tip + '"');
      assert(low.indexOf('779') < 0, 'the tooltip never restates the figure it hangs on; got "' + tip + '"');

      // ── THE RENDERED HEADLINE — one tooltip on the figure, no sentence anywhere.
      const homePanel = paintHome();
      if (homePanel) {
        assert(bandTip() === tip,
          'THE ONE TOOLTIP: the hearth-band renown figure must carry the settle copy; got ' + JSON.stringify(bandTip()));
        const band = homePanel.querySelector('.hd-hearth');
        assert(band && band.textContent.indexOf('779 Renown') >= 0,
          'the tooltip RIDES the counted figure — it never replaces it');
        assert(band && band.textContent.indexOf(tip) < 0,
          'THE BUG: the settle copy is PAINTED under the headline instead of riding it as a tooltip');
        const painted = String(homePanel.textContent || '').toLowerCase();
        assert(painted.indexOf('best yet') < 0 && painted.indexOf('settles') < 0,
          'a standing settle sentence is painted on Home; the headline names, it does not explain');
      }
      closeLadder(); R.openLadder();
      const ladder = document.querySelector('#hr-rn-modal .hr-rn-wrap');
      assert(ladder && ladder.textContent.indexOf('779 Renown') >= 0,
        'the ladder still paints the counted figure');
      assert(ladder && ladder.textContent.toLowerCase().indexOf('best yet') < 0
             && ladder.textContent.indexOf(tip) < 0,
        'the ladder header still carries the standing sentence under the figure');
      assert(!document.querySelector('#hr-rn-modal [data-hr-renown-hint]'),
        'the ladder hung a second settle note; there is exactly ONE, on the headline figure');
    } finally {
      closeLadder();
      if (panel && !panelWasActive) panel.classList.remove('active');
      if (R.__resetClaimState) R.__resetClaimState();
      if (srvBefore !== null) R.noteServerRenown({ renown_high: srvBefore });
      restoreG(snap);
    }
  }),

  () => tryRun('server-credited (muster chest ITEMS): reduceClaim passes the server item list through; items are NOT re-derived client-side', () => {
    // 2026-08-20: world_event_claim now computes the themed chest server-side
    // (hr_rally_chest) and WRITES the materials into player_inventory. Its
    // response carries `items` (and the reduced goldOut). The reducer must carry
    // that list through — the payout path renders it instead of re-deriving a
    // chest from the full band gold (which would double-convert / under-pay).
    const M = window.HearthriseMuster;
    if (!M || typeof M._reduceClaim !== 'function') return;
    // New RPC shape: reduced goldOut + a server item list + xp.
    const withItems = M._reduceClaim(200, {
      ok: true, band: 'answered', held: false, gold: 750, gems: 2, seals: 0,
      items: [{ id: 'iron_ore', qty: 12, value: 300 }, { id: 'coal', qty: 3, value: 120 }],
      xp: [{ skill: 'mining', amount: 300 }], credited: true, chest: true
    });
    assert(withItems.action === 'accept', 'a credited chest is accepted');
    assert(Array.isArray(withItems.items) && withItems.items.length === 2,
      'the server item list is carried through the reducer; got ' + JSON.stringify(withItems.items));
    assert(withItems.items[0].id === 'iron_ore' && withItems.items[0].qty === 12,
      'item id + qty survive sanitisation');
    assert(withItems.gold === 750, 'the reduced goldOut is used, not the full band');
    // A forged qty is clamped, never trusted blindly (defence-in-depth even though
    // the list originates server-side).
    const forged = M._reduceClaim(200, {
      ok: true, band: 'answered', held: false, gold: 100,
      items: [{ id: 'iron_bar', qty: 1e15 }, { id: '', qty: 5 }, { id: 'coal', qty: -3 }]
    });
    assert(forged.items.length === 1 && forged.items[0].id === 'iron_bar',
      'empty ids and non-positive qtys are dropped; got ' + JSON.stringify(forged.items));
    assert(forged.items[0].qty <= 1e6, 'an absurd qty is clamped; got ' + forged.items[0].qty);
    // Legacy RPC (no items) → the reducer returns items:null so the payout path
    // falls back to computing the chest client-side (the un-migrated server case).
    const legacy = M._reduceClaim(200, { ok: true, band: 'answered', held: false, gold: 1500, gems: 2, seals: 0 });
    assert(legacy.items === null, 'an item-less (legacy) response yields items:null → client recompute path');
  }),

  () => tryRunAsync('server-credited (muster chest ITEMS): payChest does NOT locally re-mint server-credited items once inventory is armed; survives an absolute replace', async () => {
    // The materials now live in player_inventory. Pre-arm the server write is
    // dark, so the client credits locally for display; post-arm the absolute
    // envelope carries the rows, so the client must NOT addItem them (double).
    // This mirrors the gold gate. Seals + XP stay client-authored on every path.
    const M = window.HearthriseMuster;
    if (!M || typeof M._payChest !== 'function') return;
    const origAdd = window.addItem;
    const origXp = window.addXp;
    const origMay = window.clientMayWriteRecordField;
    const added = {};
    let xpCalls = 0;
    try {
      window.addItem = function (id, qty) { added[id] = (added[id] || 0) + qty; };
      window.addXp = function () { xpCalls++; };
      const chest = { eventId: 'deep_seam', gold: 0, gems: 0, seals: 1,
        items: [{ id: 'iron_ore', qty: 12 }, { id: 'coal', qty: 3 }],
        xp: [{ skill: 'mining', amount: 300 }] };

      // ── PRE-ARM: inventory record not yet armed → local credit for display.
      window.clientMayWriteRecordField = function () { return true; };
      M._payChest(chest, { serverItems: true });
      assert(added.iron_ore === 12 && added.coal === 3,
        'pre-arm server-item chest credits locally for display; got ' + JSON.stringify(added));
      assert(added.muster_seal === 1, 'the Muster Seal is always client-credited (not server-owned)');

      // ── ARMED: inventory on SERVER_OF_RECORD → the client must NOT re-mint the
      //    materials (the player_inventory rows arrive via the absolute envelope).
      const added2 = {};
      window.addItem = function (id, qty) { added2[id] = (added2[id] || 0) + qty; };
      window.clientMayWriteRecordField = function (f) { return f !== 'inventory'; };
      M._payChest(chest, { serverItems: true });
      assert(!('iron_ore' in added2) && !('coal' in added2),
        'armed: server-credited materials are NOT locally re-minted; got ' + JSON.stringify(added2));
      assert(added2.muster_seal === 1,
        'armed: the Seal is still client-credited (muster_seal is excluded from item-authority, survives the flip untouched)');

      // ── LEGACY path (serverItems false) still mints locally under arm — nothing
      //    wrote those items server-side, so the client remains their only writer.
      const added3 = {};
      window.addItem = function (id, qty) { added3[id] = (added3[id] || 0) + qty; };
      M._payChest({ eventId: 'deep_seam', gold: 0, gems: 0, seals: 0,
        items: [{ id: 'iron_ore', qty: 5 }], xp: [] });
      assert(added3.iron_ore === 5,
        'legacy/solo chest (no server write) still credits items locally even when armed; got ' + JSON.stringify(added3));
    } finally {
      window.addItem = origAdd;
      window.addXp = origXp;
      window.clientMayWriteRecordField = origMay;
    }
  }),

  () => tryRun('server-credited (Tier-1 daily/quest): under arm a daily task + a gold quest PROCEED, fire the claim RPC with the id, and do not double-pay locally', () => {
    // b414: updateDaily + completeQuest gold is now server-credited
    // (hr_claim_daily / hr_claim_quest verify the ev:<type> counter and credit
    // player_state). Under arm the completion must PROCEED (mark done, fire the
    // claim, grant non-gold parts) and NOT write gold locally — the local write
    // is a gated prediction the envelope reconciles. Unarmed is the control.
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const calls = [];
    try {
      window.HearthriseGoalClaim = {
        claimDaily: (id) => { calls.push(['daily', id]); return Promise.resolve({ ok: true, gold: 500, credited: true }); },
        claimQuest: (id) => { calls.push(['quest', id]); return Promise.resolve({ ok: true, gold: 150, credited: true }); },
      };
      window.ensureRetentionState();

      /* ⚠ THE FIXTURE IS DERIVED FROM THE AUTHORED POOL, never hand-typed
         (b497). It used to state `reward: 500` and assert `G.gold === 500`
         because that is what daily_kill happened to pay. The Designer's balance
         retune moved it to 600 AND the b497 stale-slate heal now corrects any
         stored task whose numbers disagree with the pool — so a hand-typed
         fixture both stops describing the game and gets rewritten underneath
         the assertion. The PROPERTY here is "the unarmed prediction credits THE
         REWARD", which is a statement about the code, not about a balance
         number that is the Designer's to move. */
      const kill = window.DAILY_TASK_POOL.map((f) => f()).find((t) => t.id === 'daily_kill');
      assert(kill && kill.reward > 0, 'CONTROL: daily_kill is not in the authored pool with a reward');
      const freshKill = () => Object.assign(
        window.DAILY_TASK_POOL.map((f) => f()).find((t) => t.id === 'daily_kill'),
        { progress: kill.goal - 1, done: false });

      // ── DAILY under arm: proceeds, fires claimDaily, no local gold ──
      window.clientMayWriteRecordField = function (f) { return f !== 'gold'; };
      predZero(); window.G.gold = 0;
      window.G.daily = { lastReset: window.hrGoalDayKey(), tasks: [freshKill()] };
      window.updateDaily('kill_any', 1);
      const dt = window.G.daily.tasks[0];
      assert(dt.done === true, 'armed daily completion must mark the task done (defer is gone)');
      assert(calls.some((c) => c[0] === 'daily' && c[1] === 'daily_kill'), 'armed daily must fire claimDaily(id)');
      assert(window.G.gold === 0, 'armed daily must NOT credit gold locally (server credits it); got ' + window.G.gold);

      // ── QUEST under arm: proceeds, fires claimQuest, no local gold, item granted ──
      predZero(); window.G.gold = 0;
      const q = { id: 'gatherer', type: 'gather', label: 'Gather 15', goal: 15, progress: 15, reward: { gold: 150 }, done: false };
      window.completeQuest(q);
      assert(q.done === true, 'armed quest completion must mark done');
      assert(calls.some((c) => c[0] === 'quest' && c[1] === 'gatherer'), 'armed quest must fire claimQuest(id)');
      assert(window.G.gold === 0, 'armed quest must NOT credit gold locally; got ' + window.G.gold);

      // ── UNARMED control: daily credits gold locally (prediction), still fires the claim ──
      calls.length = 0;
      window.clientMayWriteRecordField = function () { return true; };
      predZero(); window.G.gold = 0;
      window.G.daily = { lastReset: window.hrGoalDayKey(), tasks: [freshKill()] };
      window.updateDaily('kill_any', 1);
      assert(window.G.gold === kill.reward,
        'unarmed daily must credit THE AUTHORED REWARD locally as the prediction; expected '
        + kill.reward + ', got ' + window.G.gold);
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.HearthriseGoalClaim = origClaim;
      restoreG(snap);
    }
  }),

  () => tryRunAsync('QUEST-ITEM-1: a quest ITEM reward comes from the hr_claim_quest RESPONSE — completeQuest never mints it, and a failed claim grants nothing', async () => {
    /* ── THE BUG (P1, live) ─────────────────────────────────────────────────
       Every quest item reward was PHANTOM. completeQuest paid `reward.item`
       with `addItem()`, which writes G.inventory and nothing else, while
       hr_claim_quest credited GOLD only — so the item never existed on the
       server and the first envelope that spoke about the id took it back.
       `shrimp` is a FISH_SPOTS product, so serverOwnedItem('shrimp') is true and
       one away-eaten shrimp makes the envelope's figure for it ABSOLUTE: the
       server says 0 and the stack is deleted. That is why first_cook's
       first-night grant was withdrawn rather than shipped.

       THE PROPERTY, stated so it cannot be satisfied by the old code: the
       reward appears ONLY when the server says it credited it. Two halves —
         (1) a claim that RESOLVES ok+credited puts the items in the bag;
         (2) a claim that FAILS puts NOTHING in the bag.
       (2) is the whole test. The old `addItem(r.item, r.qty)` line passes (1)
       trivially and fails (2) every time.

       MUTATION: restore `if(r.item)addItem(r.item,r.qty||1,false);` in
       completeQuest → (2) goes red with 30 phantom shrimp. */
    const snap = snapshotG();
    const origClaim = window.HearthriseGoalClaim;
    const origMay = window.clientMayWriteRecordField;
    try {
      const C = window.HearthriseCore;
      assert(C && C.goalCatalogue && typeof C.goalCatalogue.questItemsAreServerCredited === 'function',
        'CONTROL: HearthriseCore.goalCatalogue.questItemsAreServerCredited must be published — without it '
        + 'completeQuest falls back to the client mint and this test is vacuous');
      assert(C.goalCatalogue.questItemsAreServerCredited('first_cook') === true,
        'CONTROL: first_cook must be a server-item-credited quest in the catalogue');

      const questRow = () => window.QUEST_DEFS.find((q) => q.id === 'first_cook');
      assert(questRow() && questRow().reward && questRow().reward.item === 'shrimp',
        'CONTROL: the authored first_cook reward must still carry an item (the parity guard binds the qty)');
      const authored = Object.assign({}, questRow(), { progress: questRow().goal, done: false });

      window.clientMayWriteRecordField = function () { return false; };   // armed, the live shape

      // ── (2) THE CLAIM FAILS → NOTHING IS GRANTED. ────────────────────────
      window.G.inventory = {};
      let fired = 0;
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        claimQuest: (id) => { fired++; return Promise.resolve({ ok: false, error: 'network', quest: id }); },
      };
      const qFail = Object.assign({}, authored);
      window.completeQuest(qFail);
      assert(fired === 1, 'completeQuest must fire exactly one claimQuest, fired ' + fired);
      assert(!window.G.inventory.shrimp,
        'SYNCHRONOUSLY after completeQuest the bag must still be empty — a client mint here is the phantom '
        + 'bug; got ' + window.G.inventory.shrimp);
      await Promise.resolve(); await Promise.resolve();
      assert(!window.G.inventory.shrimp,
        'THE BUG: a REFUSED claim granted ' + window.G.inventory.shrimp + ' shrimp locally. The item must come '
        + 'from the server receipt or not at all.');
      assert(qFail.claimed !== true, 'a refused claim must NOT mark the quest claimed — the sweep has to retry it');

      // ── (1) THE CLAIM SUCCEEDS → THE RECEIPT IS WHAT LANDS. ──────────────
      window.G.inventory = {};
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        claimQuest: (id) => Promise.resolve({ ok: true, credited: true, quest: id, gold: 200, items: { shrimp: 30 } }),
      };
      const qOk = Object.assign({}, authored);
      window.completeQuest(qOk);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      assert(window.G.inventory.shrimp === 30,
        'the granted items must be mirrored from the RPC response; got ' + window.G.inventory.shrimp);
      assert(qOk.claimed === true, 'a credited claim must mark the quest claimed so the sweep stops asking');

      // THE RECEIPT IS THE AUTHORITY, not the authored row: a server that says 7
      // must land 7. This is what makes it a mirror rather than a second copy of
      // the catalogue.
      window.G.inventory = {};
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        claimQuest: () => Promise.resolve({ ok: true, credited: true, gold: 200, items: { shrimp: 7 } }),
      };
      const qSeven = Object.assign({}, authored);
      window.completeQuest(qSeven);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      assert(window.G.inventory.shrimp === 7,
        'the client must render what the SERVER granted (7), not what the row authors (30); got '
        + window.G.inventory.shrimp);

      // A REPLAY (already_claimed) credits nothing but still stops the retry.
      window.G.inventory = {};
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        claimQuest: () => Promise.resolve({ ok: false, error: 'already_claimed' }),
      };
      const qReplay = Object.assign({}, authored);
      window.completeQuest(qReplay);
      await Promise.resolve(); await Promise.resolve();
      assert(!window.G.inventory.shrimp, 'already_claimed must grant nothing a second time');
      assert(qReplay.claimed === true, 'already_claimed IS the server confirming it paid — stop retrying');
    } finally {
      window.HearthriseGoalClaim = origClaim;
      window.clientMayWriteRecordField = origMay;
      restoreG(snap);
    }
  }),

  () => tryRunAsync('QUEST-ITEM-2: a done-but-unconfirmed quest is re-claimed by the sweep, and a confirmed one is never asked again', async () => {
    /* completeQuest is fire-and-forget and `G.quests` is a RESIDUE field, so
       `done:true` survives a reload while a dropped claim does not — one lost
       packet used to mean the quest was finished forever with nothing paid.
       That was already true of the gold; the item credit makes it cost more.
       hrSweepUnclaimedQuests re-fires any done-and-unconfirmed quest (the server
       once-guard makes that free) and drains itself via `q.claimed`.
       MUTATION: delete the `!q.claimed` term → the confirmed-quest assertion
       goes red (it would ask for ever). */
    const snap = snapshotG();
    const origClaim = window.HearthriseGoalClaim;
    try {
      const asked = [];
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        claimQuest: (id) => { asked.push(id); return Promise.resolve({ ok: false, error: 'network' }); },
      };
      window.G.quests = [
        { id: 'gatherer', type: 'gather', goal: 15, progress: 15, reward: { gold: 150 }, done: true },
        { id: 'first_cook', type: 'cooked', goal: 5, progress: 5, reward: { gold: 200, item: 'shrimp', qty: 30 }, done: true, claimed: true },
        { id: 'first_blood', type: 'kill_any', goal: 5, progress: 2, reward: { gold: 150 }, done: false },
      ];
      window.hrSweepUnclaimedQuests._at = 0;
      const n = window.hrSweepUnclaimedQuests();
      await Promise.resolve(); await Promise.resolve();
      assert(n === 1 && asked.length === 1 && asked[0] === 'gatherer',
        'the sweep must re-claim exactly the done-and-unconfirmed quest; asked ' + JSON.stringify(asked));

      // THROTTLED: a second pass inside the window must not re-fire.
      const again = window.hrSweepUnclaimedQuests();
      assert(again === 0 && asked.length === 1,
        'the sweep must be throttled — a busy session must not spin the RPC; asked ' + JSON.stringify(asked));

      // DRAINED: once every quest is confirmed there is nothing to ask, ever.
      window.G.quests.forEach((q) => { q.claimed = true; });
      window.hrSweepUnclaimedQuests._at = 0;
      assert(window.hrSweepUnclaimedQuests() === 0 && asked.length === 1,
        'a fully-confirmed quest list must cost zero RPCs; asked ' + JSON.stringify(asked));
    } finally {
      window.HearthriseGoalClaim = origClaim;
      if (window.hrSweepUnclaimedQuests) window.hrSweepUnclaimedQuests._at = 0;
      restoreG(snap);
    }
  }),

  () => tryRunAsync('COMBAT-XP-CREDIT-1 (#5 root pt2): armed combat XP accumulates + flushes to hr_credit_combat_xp, subtracts only what was sent, keeps failures pending', async () => {
    // Bug #5 root pt2 — "attack level reverts 5→4". Live combat XP is
    // client-predicted; the server's only combat-XP writer is the away/span-sim,
    // which undercounts, so on settle the prediction is retired DOWN and the level
    // reverts. The fix accumulates observed combat XP and flushes it to
    // hr_credit_combat_xp (server-clamped), so the server credits the ATTENDED
    // number. This proves the CLIENT half: the transport exists, addXp under the
    // arm buffers combat XP, and the flush subtracts exactly what it sent (so a
    // gain DURING the async call survives) and keeps a refused flush pending.
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const origLatch = !!(window.HearthriseAccrual && window.HearthriseAccrual.awaySettleDone
      && window.HearthriseAccrual.awaySettleDone());
    try {
      assert(typeof window.hrCreditCombatXpFlush === 'function', 'hrCreditCombatXpFlush transport must exist');
      /* The flush is suppressed until the session's away window has been settled
         (2026-09-09 settle-first). This test is about the ATTENDED path, so stand
         in for "the boot settle already landed" rather than assert around it. */
      window.HearthriseAccrual.__resetAwaySettleLatch(true);

      // ── accumulation: armed, signed OUT → addXp buffers combat XP, no flush ──
      window.clientMayWriteRecordField = function (f) { return f !== 'skills'; };
      window.HearthriseGoalClaim = { isSignedIn: () => false, creditCombatXp: () => Promise.resolve({ ok: true }) };
      window.G._combatXpPending = {};
      window.addXp('attack', 400);
      window.addXp('woodcutting', 999);   // NON-combat — must NOT buffer
      assert((window.G._combatXpPending.attack || 0) > 0, 'armed addXp must buffer combat XP for the credit');
      assert(!('woodcutting' in window.G._combatXpPending), 'a non-combat skill must never enter the combat-XP buffer');

      // ── flush: armed + signed in → sends the buffer, subtracts what was sent ──
      const calls = [];
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => {
          calls.push(JSON.parse(JSON.stringify(m)));
          // A gain lands DURING the in-flight call — it must survive the subtract.
          window.G._combatXpPending.attack = (Number(window.G._combatXpPending.attack) || 0) + 50;
          return Promise.resolve({ ok: true, credited: m, credit: 999 });
        },
      };
      window.G._combatXpPending = { attack: 1000, strength: 300 };
      await window.hrCreditCombatXpFlush(true);
      assert(calls.length === 1, 'flush must call creditCombatXp exactly once');
      assert(calls[0].attack === 1000 && calls[0].strength === 300, 'flush must send the buffered per-skill XP');
      assert((window.G._combatXpPending.attack || 0) === 50, 'flush must subtract ONLY what it sent (the mid-call +50 survives); got ' + window.G._combatXpPending.attack);
      assert((window.G._combatXpPending.strength || 0) === 0, 'a fully-sent skill must drain to 0');

      // ── refusal: a !ok verdict keeps the pending XP for the next flush ──
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: () => Promise.resolve({ ok: false, error: 'daily_budget' }),
      };
      window.G._combatXpPending = { attack: 777 };
      await window.hrCreditCombatXpFlush(true);
      assert((window.G._combatXpPending.attack || 0) === 777, 'a refused flush must keep the pending XP untouched; got ' + window.G._combatXpPending.attack);

      // ── b486: a FORCED flush while one is IN FLIGHT must AWAIT the in-flight
      //    credit, NOT early-return null. If it early-returned, accrue.js's
      //    credit-before-settle guarantee would break: the settle could price the
      //    attended window UNATTENDED and a live-gained level reverts on reconcile. ──
      let releaseInflight;
      const gate = new Promise((r) => { releaseInflight = r; });
      const raceCalls = [];
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => {
          raceCalls.push(JSON.parse(JSON.stringify(m)));
          // the FIRST call blocks on the gate; the caller must await this commit.
          return raceCalls.length === 1
            ? gate.then(() => ({ ok: true, credited: m }))
            : Promise.resolve({ ok: true, credited: m });
        },
      };
      window.G._combatXpPending = { attack: 500 };
      const firstFlush = window.hrCreditCombatXpFlush(true);   // starts, now in flight (blocked)
      let secondSettled = false;
      const secondFlush = window.hrCreditCombatXpFlush(true).then((r) => { secondSettled = true; return r; });
      // Let microtasks drain — the forced second flush must STILL be pending
      // (awaiting the in-flight credit), not resolved-null.
      await Promise.resolve(); await Promise.resolve();
      assert(secondSettled === false, 'THE BUG: a forced flush during an in-flight credit must AWAIT it, not early-return null (would lose credit-before-settle)');
      releaseInflight();                                       // let the in-flight credit commit
      await firstFlush; await secondFlush;
      assert(secondSettled === true, 'the forced flush resolves only AFTER the in-flight credit settles');
      assert((window.G._combatXpPending.attack || 0) === 0, 'the in-flight credit still subtracts exactly what it sent — no lost/under-credited attended XP');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.HearthriseGoalClaim = origClaim;
      window.HearthriseAccrual.__resetAwaySettleLatch(origLatch);
      restoreG(snap);
    }
  }),

  /* COMBAT-XP-SETTLE-FIRST-1 (regression suite) — Paione: "I did some offline
     combat. The items and kills are given but the experience is not." The booting
     client fired THREE attended combat-XP credits before the away settle landed;
     each stamped combat_xp_accrued_to = now(), and the settle credits combat XP
     only from max(fromMs, that watermark) — so a 4h02m / 828-kill window paid
     23,068 gold and every item, and ZERO XP. THE CLIENT HALF: the flush must not
     fire until the session's away window has been settled. THE SERVER HALF (the
     one that holds against a forged client) is hr_credit_combat_xp's
     `settle_first` refusal, proven by its own §4 gates and by
     tests/combat-xp-settle-first.mjs.
     MUTATION: delete the awaySettleDone() guard in hrCreditCombatXpFlush → the
     first assertion goes RED (the credit fires before any settle). */
  () => tryRunAsync('COMBAT-XP-SETTLE-FIRST-1: the attended combat-XP credit does not fire before the session away settle (would trim the whole absence)', async () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.awaySettleDone === 'function' && typeof A.__resetAwaySettleLatch === 'function',
      'the settle-first latch is missing — a boot can credit XP over an away window the server has not paid');
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const origLatch = !!A.awaySettleDone();
    try {
      const calls = [];
      window.clientMayWriteRecordField = function (f) { return f !== 'skills'; };
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => { calls.push(m); return Promise.resolve({ ok: true, credited: m }); },
      };
      window.G._combatXpPending = { attack: 400, strength: 250 };

      // BEFORE the settle: suppressed, and the XP is KEPT (never thrown away).
      A.__resetAwaySettleLatch(false);
      await window.hrCreditCombatXpFlush(true);
      assert(calls.length === 0,
        'THE BUG: a credit fired before the away settle — it stamps combat_xp_accrued_to and the settle then pays 0 combat XP for the whole absence');
      assert((window.G._combatXpPending.attack || 0) === 400,
        'the suppressed XP must stay pending — a deferred credit is not a lost one');

      // AFTER the settle: the attended credit resumes and sends the backlog.
      A.__resetAwaySettleLatch(true);
      await window.hrCreditCombatXpFlush(true);
      assert(calls.length === 1 && (calls[0].attack || 0) === 400,
        'the credit did not resume once the away window was settled — attended XP would be priced unattended forever');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.HearthriseGoalClaim = origClaim;
      A.__resetAwaySettleLatch(origLatch);
      restoreG(snap);
    }
  }),

  /* COMBAT-XP-SETTLE-FIRST-2 (regression suite) — vitals 2026-09-16/17: 41
     `settle_first` refusals on one character. The server refuses the attended
     credit while `accrued_to` is >180 s stale (correct: the away settle owns that
     window) and WRITES NOTHING — its own migration comment says "The client keeps
     its pending XP and re-flushes after the settle." The client did the opposite:
     it dropped the pending snapshot on the refusal ALONE, so a throttled
     background tab (which makes the watermark stale every window) deleted the
     player's observed attended XP with nothing having paid it whenever the settle
     then failed, halted, or never ran. The BOOT path next door has always waited
     for a confirmed `accrued`/`nothing` before dropping; this is that asymmetry
     closed, plus asking for the settle the refusal names.
     MUTATION: restore `dropPendingCombatXp(snap, G)` on the refusal branch in
     hrCreditCombatXpFlush → the "must stay pending" assertion goes RED. */
  () => tryRunAsync('COMBAT-XP-SETTLE-FIRST-2: a `settle_first` refusal DEFERS the attended XP and re-submits it after the settle, and drops it only on a CONFIRMED settle', async () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.deferPendingCombatXp === 'function' && typeof A.resolveCombatXpDeferral === 'function'
      && typeof A.__resetCombatXpDeferral === 'function',
      'THE BUG: there is no deferral seam for a `settle_first` refusal — the refused snapshot is discarded on the refusal alone, before anything has paid it');
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const origLatch = !!A.awaySettleDone();
    const origReq = A.requestAccrual;
    try {
      A.__resetCombatXpDeferral();
      const calls = []; let refuse = true; let settles = 0;
      A.requestAccrual = () => { settles++; return Promise.resolve({ outcome: 'unreachable' }); };
      window.clientMayWriteRecordField = function (f) { return f !== 'skills'; };
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => {
          calls.push(JSON.parse(JSON.stringify(m)));
          return Promise.resolve(refuse ? { ok: false, error: 'settle_first' } : { ok: true, credited: m });
        },
      };
      A.__resetAwaySettleLatch(true);            // ATTENDED path: the session away window is closed

      // ── (1) refused: the XP stays pending and the settle is ASKED FOR ──
      window.G._combatXpPending = { attack: 600, strength: 200 };
      await window.hrCreditCombatXpFlush(true);
      assert(calls.length === 1, 'the flush must reach the RPC once; it fired ' + calls.length + ' time(s)');
      assert((window.G._combatXpPending.attack || 0) === 600 && (window.G._combatXpPending.strength || 0) === 200,
        'THE BUG: a `settle_first` refusal discarded the attended XP (attack=' + (window.G._combatXpPending.attack || 0)
        + '). The refusal writes NOTHING server-side — nothing has paid these fights yet');
      assert(settles === 1, 'a `settle_first` refusal must ask for the settle it is being told to run first (a throttled tab is not running the 90 s cadence)');
      assert(A.pendingCombatXpDeferral() && A.pendingCombatXpDeferral().attack === 600,
        'the refused snapshot must be held as the settle\u2019s debt, so a later confirmed settle can retire exactly it');

      // ── (2) the settle did NOT confirm ⇒ the window is still unpaid ⇒ re-submit ──
      A.resolveCombatXpDeferral('unreachable');
      assert(A.pendingCombatXpDeferral() && A.pendingCombatXpDeferral().attack === 600,
        'an unconfirmed settle must not retire the debt — nothing was paid');
      refuse = false;
      await window.hrCreditCombatXpFlush(true);
      assert(calls.length === 2 && (calls[1].attack || 0) === 600 && (calls[1].strength || 0) === 200,
        'the deferred attended XP must be RE-SUBMITTED once the credit is admitted again; sent ' + JSON.stringify(calls[1] || null));
      assert((window.G._combatXpPending.attack || 0) === 0, 'the admitted re-submit drains what the server applied');
      assert(!A.pendingCombatXpDeferral(),
        'an ADMITTED credit must void the debt — otherwise the next confirmed settle restores XP the server has already credited (double credit)');

      // ── (3) the other half: a CONFIRMED settle retires the debt (no double credit) ──
      refuse = true;
      window.G._combatXpPending = { attack: 400 };
      await window.hrCreditCombatXpFlush(true);
      assert((window.G._combatXpPending.attack || 0) === 400, 'still deferred, not dropped, on the refusal');
      window.G._combatXpPending = {};                       // as if a drain had run
      const restored = A.resolveCombatXpDeferral('accrued');
      assert(restored === 400 && (window.G._combatXpPending.attack || 0) === 400,
        'a CONFIRMED settle stamps the span it just priced away — the deferred snapshot must go BACK so the server top-up can be claimed; restored=' + restored);
      assert(!A.pendingCombatXpDeferral(), 'the debt is cleared once handed back to the pending map');
      await A.combatXpReflushPromise();       // let the re-flush land on the stubs, not on the real RPC
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.HearthriseGoalClaim = origClaim;
      A.__resetAwaySettleLatch(origLatch);
      A.requestAccrual = origReq;
      A.__resetCombatXpDeferral();
      restoreG(snap);
    }
  }),

  /* COMBAT-XP-SETTLE-FIRST-3 / ATTENDED (regression suite) — Security S-1 on
     2026-09-17-attended-xp-on-settle. The server half stamps
     `player_state.combat_settle_span` on a >180 s stale settle and lets the NEXT
     hr_credit_combat_xp within 120 s top that span up to the attended cap
     (minus what the away sim already paid). It is reachable ONLY if the client
     re-sends the snapshot the `settle_first` refusal deferred. The client DROPPED
     it on a confirmed settle, so the stamp was written, never claimed, and NULLed
     by the next settle: the whole server half inert and the window priced away.
     MUTATION: make resolveCombatXpDeferral drop (dropPendingCombatXp) again →
     "must be RE-SUBMITTED" goes RED.
     AWAY half: COMBAT-XP-SETTLE-FIRST-4 below. */
  () => tryRunAsync('COMBAT-XP-SETTLE-FIRST-3 (attended): a stale settle confirmed ⇒ the deferred attended XP is re-submitted ONCE, inside the top-up grace', async () => {
    const A = window.HearthriseAccrual;
    assert(typeof A.restorePendingCombatXp === 'function' && typeof A.combatXpReflushPromise === 'function',
      'THE UNCLAIMED SPAN: accrue.js has no restore/re-flush seam — a confirmed settle drops the deferral, so the span the settle stamped is never claimed');
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const origLatch = !!A.awaySettleDone();
    const origReq = A.requestAccrual;
    try {
      A.__resetCombatXpDeferral();
      const calls = []; let refuse = true;
      A.requestAccrual = () => Promise.resolve({ outcome: 'accrued' });
      window.clientMayWriteRecordField = function (f) { return f !== 'skills'; };
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => {
          calls.push(JSON.parse(JSON.stringify(m)));
          return Promise.resolve(refuse ? { ok: false, error: 'settle_first' } : { ok: true, credited: m });
        },
      };
      A.__resetAwaySettleLatch(true);

      // (1) the attended flush is refused because the watermark is >180 s stale.
      window.G._combatXpPending = { attack: 500, strength: 120 };
      await window.hrCreditCombatXpFlush(true);
      assert(calls.length === 1, 'the first flush must reach the RPC once; it fired ' + calls.length);

      // (2) the settle CONFIRMS. It has just stamped the span it priced away, so
      //     the deferral is handed back and re-flushed — one round trip, far
      //     inside the server's 120 s grace, with no intent sent in between.
      refuse = false;
      const t0 = Date.now();
      A.resolveCombatXpDeferral('accrued');
      await A.combatXpReflushPromise();
      assert(Date.now() - t0 < 120000, 're-flush must land inside the 120 s top-up grace');
      assert(calls.length === 2, 'THE UNCLAIMED SPAN: the confirmed settle sent ' + (calls.length - 1)
        + ' follow-up credit(s) — the stamped span must be claimed by exactly one re-submit');
      assert((calls[1].attack || 0) === 500 && (calls[1].strength || 0) === 120,
        'the re-submit must carry the deferred snapshot; sent ' + JSON.stringify(calls[1]));

      // (3) it is idempotent in the ordinary way: the admitted credit drained the
      //     map, so a second flush has nothing to send (never a second top-up).
      await window.hrCreditCombatXpFlush(true);
      assert(calls.length === 2, 'a second flush re-sent the same fights — the drained map must send nothing');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.HearthriseGoalClaim = origClaim;
      A.__resetAwaySettleLatch(origLatch);
      A.requestAccrual = origReq;
      A.__resetCombatXpDeferral();
      restoreG(snap);
    }
  }),

  /* COMBAT-XP-SETTLE-FIRST-4 / AWAY (regression suite) — the other half of the
     pair. A genuine absence has no deferred attended snapshot: the settle pays
     the window by simulation and the client must send NO credit afterwards, or
     the away window would be claimed at the attended rate. */
  () => tryRunAsync('COMBAT-XP-SETTLE-FIRST-4 (away): a confirmed settle with nothing deferred sends no credit at all', async () => {
    const A = window.HearthriseAccrual;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const origLatch = !!A.awaySettleDone();
    try {
      A.__resetCombatXpDeferral();
      const calls = [];
      window.clientMayWriteRecordField = function (f) { return f !== 'skills'; };
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => { calls.push(m); return Promise.resolve({ ok: true, credited: m }); },
      };
      A.__resetAwaySettleLatch(true);
      /* XP is pending, but NOTHING was deferred: no `settle_first` refusal ever
         happened, so this settle is an ordinary away window the simulation just
         priced. The confirmed settle must therefore fire NO credit of its own —
         a credit here would claim the absence at the attended rate and stamp the
         watermark over it. The cadence flush owns this map, not the settle. */
      window.G._combatXpPending = { attack: 300 };

      const restored = A.resolveCombatXpDeferral('accrued');
      assert(restored === 0 && !A.pendingCombatXpDeferral(),
        'an away settle has no debt to restore; restored=' + restored);
      const p = A.combatXpReflushPromise();
      if (p) await p;
      assert(calls.length === 0,
        'THE AWAY DOUBLE-CREDIT: the client sent a combat-XP credit after an away settle — that window was paid by the simulation');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.HearthriseGoalClaim = origClaim;
      A.__resetAwaySettleLatch(origLatch);
      A.__resetCombatXpDeferral();
      restoreG(snap);
    }
  }),

  () => tryRunAsync("CADENCE-NIC-1 (Security F1): a `not_in_combat` credit re-declares the fight ONCE and retries ONCE — never a loop", async () => {
    // supabase/migrations/2026-09-06-cadence-recovery-floor.sql caps the attended
    // credit window at player_state.active_since once the SERVER's pointer leaves
    // combat, and answers {reason:'not_in_combat', credited:0}. A client whose
    // DECLARATION was lost (a dropped set_activity, a server auto-stop, a
    // rate-limited switch) would otherwise keep polling the 60 s cadence and be
    // paid NOTHING for as long as it fights — silently, because a zero credit
    // looks like a throttle. The refusal is NAMED so the client can say again
    // what it is doing and ask once more.
    //
    // THE TWO HALVES OF THE CONTRACT, and the second is the one that matters:
    // exactly ONE re-declare + ONE retry, and a SECOND not_in_combat is accepted
    // as the server's verdict. A retry-on-retry would be an unbounded loop
    // spending a real player's rate budget against a server that has already
    // answered — the shape CLAUDE.md's intent contract forbids ("never retry the
    // switch alone in a loop").
    const GC = window.HearthriseGoalClaim;
    assert(GC && typeof GC._creditWithCombatRedeclare === 'function',
      'HearthriseGoalClaim._creditWithCombatRedeclare is missing — nothing recovers a lost combat declaration, so '
      + 'every attended kill/XP credit after one silently pays zero');
    const origPointer = window.localActivityPointer;
    const origActivity = window.HearthriseActivity;
    try {
      let declares = [];
      window.HearthriseActivity = {
        declareActivity: (kind, id, opts) => { declares.push({ kind, id, opts }); return Promise.resolve({ outcome: 'switched' }); },
      };
      window.localActivityPointer = () => ({ kind: 'combat', id: 'goblin' });

      // ── (1) refused once, then paid: ONE re-declare, ONE retry, the retry wins ──
      let fired = 0;
      let res = await GC._creditWithCombatRedeclare(() => {
        fired++;
        return Promise.resolve(fired === 1
          ? { ok: true, credited: 0, reason: 'not_in_combat' }
          : { ok: true, credited: 3 });
      });
      assert(fired === 2, 'a not_in_combat refusal must be retried exactly once; the RPC fired ' + fired + ' time(s)');
      assert(declares.length === 1, 're-declare must happen exactly once; it happened ' + declares.length + ' time(s)');
      assert(declares[0].kind === 'combat' && declares[0].id === 'goblin' && !!(declares[0].opts && declares[0].opts.force),
        're-declare must restate the CURRENT combat activity with {force:true} (a queued declaration would race the retry)');
      assert(res && res.credited === 3, 'the retry\'s verdict is what the caller gets back');

      // ── (2) THE ANTI-LOOP: refused TWICE → still exactly one re-declare and
      //       one retry, and the second refusal is returned as the answer. ──
      declares = []; fired = 0;
      res = await GC._creditWithCombatRedeclare(() => {
        fired++;
        return Promise.resolve({ ok: true, credited: 0, reason: 'not_in_combat' });
      });
      assert(fired === 2, 'THE BUG: a second not_in_combat must NOT be retried again; the RPC fired ' + fired + ' times');
      assert(declares.length === 1, 'THE BUG: a second not_in_combat must NOT re-declare again; declared ' + declares.length + ' times');
      assert(res && res.reason === 'not_in_combat', "the server's second verdict is returned verbatim, not swallowed");

      // ── (3) the client is NOT fighting → the refusal is RIGHT; touch nothing ──
      declares = []; fired = 0;
      window.localActivityPointer = () => ({ kind: 'idle', id: null });
      await GC._creditWithCombatRedeclare(() => { fired++; return Promise.resolve({ ok: true, credited: 0, reason: 'not_in_combat' }); });
      assert(fired === 1 && declares.length === 0,
        'when the CLIENT itself is idle the refusal is correct — re-declaring would assert a fight that is not happening');

      // ── (4) an ordinary answer is passed straight through, untouched ──
      declares = []; fired = 0;
      window.localActivityPointer = () => ({ kind: 'combat', id: 'goblin' });
      res = await GC._creditWithCombatRedeclare(() => { fired++; return Promise.resolve({ ok: true, credited: 7 }); });
      assert(fired === 1 && declares.length === 0 && res.credited === 7,
        'a successful credit must not re-declare or re-fire — the helper is inert on every path but the named refusal');
    } finally {
      window.localActivityPointer = origPointer;
      window.HearthriseActivity = origActivity;
    }
  }),

  () => tryRunAsync('CLIENT-STATE-CAP (b486): putClientState surfaces state_too_large distinctly, not swallowed into a silent infinite retry', async () => {
    // The whole residue bag shares ONE 256 KiB server cap; on overflow the RPC
    // answers {ok:false,error:'state_too_large'} and EVERY residue field stops
    // persisting. Swallowed into the generic {ok:false} it was an invisible
    // infinite retry (self-only progress quietly stops saving). Contract: the
    // overflow is FLAGGED (capExceeded) and surfaced, still non-fatal (no throw),
    // and a generic failure is NOT mis-flagged.
    const CS = window.HearthriseClientState;
    assert(CS && typeof CS.putClientState === 'function', 'putClientState must exist');
    if (typeof CS.__resetClientStateCapWarned === 'function') CS.__resetClientStateCapWarned();
    const mkFetch = (bodyObj) => async () => ({ ok: true, status: 200, json: async () => bodyObj });
    const opts = (bodyObj) => ({ url: 'https://example.test', anonKey: 'k', jwt: 'j', slot: 0, idem: 'cap-test-idem', fetch: mkFetch(bodyObj) });

    /* The overflow path SHOULD shout (console.error + captureException) — but a
       deliberate trigger inside the suite must not trip the harness's
       console-error detector. Capture-and-assert instead of leak. */
    const realError = console.error;
    const realCapture = window.captureException;
    let shouted = 0;
    console.error = () => { shouted++; };
    window.captureException = () => {};
    let over, patchOver, gen;
    try {
      over = await CS.putClientState({ stats: {} }, opts({ ok: false, error: 'state_too_large', cap: 262144 }));
      patchOver = await CS.putClientState({ stats: {} }, opts({ ok: false, error: 'patch_too_large', cap: 262144 }));
      gen = await CS.putClientState({ stats: {} }, opts({ ok: false, error: 'no_character' }));
    } finally {
      console.error = realError;
      window.captureException = realCapture;
    }
    assert(over && over.ok === false, 'a too-large put is still non-fatal (ok:false, never throws)');
    assert(over.capExceeded === true, 'THE BUG: an overflow must be FLAGGED (capExceeded), not swallowed into a generic {ok:false}');
    assert(over.error === 'state_too_large', 'the overflow error must be preserved for telemetry/observation');
    assert(shouted >= 1, 'the overflow must be SURFACED (console.error fired at least once — the one-time latch)');
    assert(patchOver.capExceeded === true, 'a single over-cap patch (patch_too_large) is flagged the same way');
    assert(gen && gen.ok === false && !gen.capExceeded, 'a generic failure must NOT be mis-flagged as a cap overflow');
  }),

  /* ── regression suite — THE OUTGOING RESIDUE IS ITS ALLOWLIST PROJECTION ────
     MEASURED 2026-09-16 (vitals --refusals): 569 forbidden_field/`buffs` refusals
     in a day from ONE character, 532 the day before. The server refuses the WHOLE
     patch on one denied key, so that character persisted NO residue for two days.
     A deny-list only refuses the names somebody typed; structurally now, the sent
     body is `patch ∩ RESIDUE_FIELDS` minus what the server refused, at the put. */
  () => tryRunAsync('CLIENT-STATE-ALLOWLIST (2026-09-16): the SENT residue body equals its allowlist projection, whatever the caller handed the put', async () => {
    const CS = window.HearthriseClientState;
    assert(CS && typeof CS.putClientState === 'function' && Array.isArray(CS.RESIDUE_FIELDS),
      'CONTROL: putClientState / RESIDUE_FIELDS unpublished — this test would pass vacuously');
    const allow = new Set(CS.RESIDUE_FIELDS);
    assert(!allow.has('buffs'), 'CONTROL: `buffs` is back in RESIDUE_FIELDS — the server denies it, so this is the bug itself');
    assert(allow.has('lootFilter') && allow.has('bestiary'),
      'CONTROL: the honest fields this test rides along are not on the allowlist');
    const sent = [];
    const fetchStub = async (url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
    /* As a stale/forgetful assembly path hands it over: real preferences, plus the
       measured server-owned name and one no bundle ever owned. */
    const r = await CS.putClientState({
      lootFilter: ['junk'], bestiary: { rat: { kills: 3 } },
      buffs: [{ type: 'damage', magnitude: 2, remainingMs: 600000 }],
      someFieldNoAllowlistEverHad: 1,
    }, { url: 'https://example.test', anonKey: 'k', jwt: 'j', slot: 0, idem: 'allowlist-test', fetch: fetchStub });
    assert(r && r.ok === true, 'the put must still succeed — dropping the whole patch would BE the bug: ' + JSON.stringify(r));
    assert(sent.length === 1, 'exactly one request');
    const body = sent[0].p_patch;
    const strays = Object.keys(body).filter((k) => !allow.has(k));
    assert(strays.length === 0,
      'THE BUG: the residue body carried ' + JSON.stringify(strays) + ' — hr_put_client_state refuses the WHOLE patch on one '
      + 'non-allowlisted key, so every preference in the bag stops saving and the tab retries the identical body for ever');
    assert(Object.prototype.hasOwnProperty.call(body, 'lootFilter') && Object.prototype.hasOwnProperty.call(body, 'bestiary'),
      'the allowlisted fields must still ride — the projection KEEPS the residue, it does not empty it: ' + JSON.stringify(Object.keys(body)));
  }),

  () => tryRunAsync('CLIENT-STATE-FORBIDDEN (2026-09-14): a forbidden_field refusal drops the key, tells the player and reloads ONCE — never a silent retry for ever', async () => {
    /* MEASURED LIVE 2026-09-14 15:08 UTC: user b94fa8c0, code forbidden_field,
       intent hr_put_client_state, n=603 today, first refusal 2026-09-13
       20:48:28Z — the minute 2026-09-13-client-state-buffs-denylist.sql applied.
       A tab on an older bundle kept sending `buffs`; the server refuses the
       WHOLE patch on one denied key, so that account saved NO residue for 18
       hours (loot filter, achievements, bestiary, the "shown today" markers)
       while the client retried the identical bag every 60 s for ever.
       The contract, in the order a player meets it: the key is DROPPED for this
       page life (so the other twenty fields save again on the very next put),
       the player is TOLD, and the tab reloads ONCE — a key already reloaded for
       is never reloaded for again, because a reload loop is worse than the bug.
       2026-09-14-client-state-projection-denylist.sql adds nine more denied
       names, so this is the path every stale tab will take. */
    const CS = window.HearthriseClientState;
    assert(CS && typeof CS.putClientState === 'function', 'putClientState must exist');
    assert(typeof CS.__setClientStateReloadHook === 'function' && typeof CS.__resetForbiddenField === 'function',
      'the forbidden-field seam must expose its test hooks — otherwise this test can only be written by reloading the harness');
    const KEY = 'hr-forbidden-field-reload';
    const savedSession = sessionStorage.getItem(KEY);
    const realWarn = console.warn;
    const realNotify = window.notify;
    let reloads = 0;
    const toasts = [];
    const prevHook = CS.__setClientStateReloadHook(() => { reloads++; });
    const sent = [];
    const mkFetch = (bodyObj) => async (url, init) => {
      sent.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => bodyObj };
    };
    const opts = (bodyObj) => ({ url: 'https://example.test', anonKey: 'k', jwt: 'j', slot: 0, idem: 'forbidden-test', fetch: mkFetch(bodyObj) });
    const REFUSED = { ok: false, error: 'forbidden_field', field: 'streak' };
    try {
      sessionStorage.removeItem(KEY);
      CS.__resetForbiddenField();
      console.warn = () => {};
      window.notify = (m) => { toasts.push(String(m)); };

      /* 1. THE REFUSAL. A denied key, with an honest preference riding along. */
      const r1 = await CS.putClientState({ streak: { count: 1 }, lootFilter: ['junk'] }, opts(REFUSED));
      assert(r1 && r1.ok === false, 'a forbidden put stays non-fatal (ok:false, never throws)');
      assert(r1.forbiddenField === true && r1.dropped === true,
        'THE BUG: a forbidden_field refusal must be FLAGGED and the key dropped, not swallowed into a generic {ok:false} and retried for ever: '
        + JSON.stringify(r1));
      assert(reloads === 1, 'the tab must reload exactly once for a newly-refused key (reloads=' + reloads + ')');
      assert(toasts.some((t) => /older build/i.test(t)),
        'the player must be TOLD why the tab is reloading — a reload with no explanation is indistinguishable from a crash: ' + JSON.stringify(toasts));
      assert(String(sessionStorage.getItem(KEY) || '').split(',').indexOf('streak') >= 0,
        'the refused key must be recorded in sessionStorage BEFORE the reload, or the loop guard cannot survive it');
      assert(CS.forbiddenResidueFields().indexOf('streak') >= 0,
        'the dropped set must be readable for triage: ' + JSON.stringify(CS.forbiddenResidueFields()));

      /* 2. THE NEXT PUT NO LONGER CARRIES IT. This is the half that gives the
            player their other twenty preferences back. */
      sent.length = 0;
      const r2 = await CS.putClientState({ streak: { count: 1 }, lootFilter: ['junk'] }, opts({ ok: true }));
      assert(r2 && r2.ok === true, 'the put after the drop must succeed');
      assert(sent.length === 1, 'exactly one request');
      const patch = sent[0].p_patch;
      assert(!Object.prototype.hasOwnProperty.call(patch, 'streak'),
        'THE BUG: the refused key was sent AGAIN — every residue field stays unsaved for as long as the tab lives: ' + JSON.stringify(patch));
      assert(Object.prototype.hasOwnProperty.call(patch, 'lootFilter'),
        'the honest preferences must still be sent — dropping the whole patch would BE the bug');

      /* 3. NO RELOAD LOOP. A fresh page life (the module state resets; the
            sessionStorage record does not) that is refused for the SAME key
            drops it and carries on rather than reloading a second time. */
      CS.__resetForbiddenField();
      const r3 = await CS.putClientState({ streak: { count: 1 } }, opts(REFUSED));
      assert(r3.forbiddenField === true && r3.dropped === true, 'the key is still dropped after a reload');
      assert(reloads === 1, 'THE SECOND BUG: a key refused again AFTER a reload must NOT reload again — that is an infinite reload loop (reloads=' + reloads + ')');

      /* 4. A REFUSAL WITH NO NAMED FIELD still reloads once and never loops. */
      CS.__resetForbiddenField();
      const r4 = await CS.putClientState({ lootFilter: [] }, opts({ ok: false, error: 'forbidden_field' }));
      assert(r4.forbiddenField === true && r4.dropped === false,
        'a refusal that names no field cannot drop one, and must say so honestly');
      assert(reloads === 2, 'an unnamed forbidden_field reloads once on its own sentinel (reloads=' + reloads + ')');
      CS.__resetForbiddenField();
      await CS.putClientState({ lootFilter: [] }, opts({ ok: false, error: 'forbidden_field' }));
      assert(reloads === 2, 'the unnamed sentinel must not reload twice either');
    } finally {
      console.warn = realWarn;
      window.notify = realNotify;
      CS.__setClientStateReloadHook(prevHook);
      CS.__resetForbiddenField();
      if (savedSession === null) sessionStorage.removeItem(KEY);
      else sessionStorage.setItem(KEY, savedSession);
    }
  }),

  () => tryRunAsync('GOAL-CLAIM-1 (b461): under arm a MODAL goal claim fires hr_claim_goal and surfaces every outcome — never a silent no-op', async () => {
    // The beta-morning regression: the quest modal's daily/weekly pools are a
    // THIRD goal system (≠ QUEST_DEFS, ≠ DAILY_TASK_POOL) and their
    // claimQuestReward carried the b411 bare-return defer — every Claim button
    // was a silent no-op under the arm (no RPC, no toast, no error). Found live
    // by Tyler. The contract now: armed claims go through
    // HearthriseGoalClaim.claimGoal, and ok / already_claimed / refusal /
    // missing-transport ALL surface to the player.
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const origNotify = window.notify;
    const calls = []; const toasts = [];
    const microtasks = () => new Promise((r) => setTimeout(r, 0));
    try {
      window.clientMayWriteRecordField = (f) => f !== 'gold';
      window.notify = (m) => { toasts.push(String(m)); };
      window.getGoalsForToday();
      const dayKey = window.G.dailyGoals.dayKey;
      window.G.stats.kills = 99;
      window.G.dailyGoals = { dayKey, picks: ['kill_more'], startValues: { kill_more: 0 }, claimed: {} };
      window.G._goalClaimsInFlight = null; window._goalClaimsInFlight = {};

      // 1 — ok:true → RPC fired with the id, claimed marked, toast shown, no local gold
      window.HearthriseGoalClaim = { isSignedIn: () => true,
        claimGoal: (id, weekly) => { calls.push([id, !!weekly]); return Promise.resolve({ ok: true, gold: 400 }); } };
      const goldBefore = window.G.gold;
      window.claimQuestReward('kill_more', false);
      assert(calls.length === 1 && calls[0][0] === 'kill_more' && calls[0][1] === false,
        'THE BUG: an armed modal claim must FIRE claimGoal (was a silent bare return)');
      await microtasks();
      assert(window.G.dailyGoals.claimed && window.G.dailyGoals.claimed.kill_more === true,
        'an ok claim must mark the goal claimed');
      assert(toasts.some((t) => /claimed/i.test(t)), 'an ok claim must toast the player');
      assert(window.G.gold === goldBefore, 'armed claim must NOT credit gold locally (server credits it)');

      // 2 — already_claimed → marked claimed + honest toast (reload forgot the flag; server remembered)
      toasts.length = 0;
      window.G.dailyGoals.claimed = {};
      window.HearthriseGoalClaim = { isSignedIn: () => true,
        claimGoal: () => Promise.resolve({ ok: false, error: 'already_claimed' }) };
      window.claimQuestReward('kill_more', false);
      await microtasks();
      assert(window.G.dailyGoals.claimed.kill_more === true, 'already_claimed must mark the goal claimed');
      assert(toasts.some((t) => /already claimed/i.test(t)), 'already_claimed must be surfaced');

      // 3 — refusal (incomplete) → NOT claimed, honest toast
      toasts.length = 0;
      window.G.dailyGoals.claimed = {};
      window.HearthriseGoalClaim = { isSignedIn: () => true,
        claimGoal: () => Promise.resolve({ ok: false, error: 'incomplete' }) };
      window.claimQuestReward('kill_more', false);
      await microtasks();
      assert(!window.G.dailyGoals.claimed.kill_more, 'a refused claim must stay claimable');
      assert(toasts.length > 0, 'a refusal must be surfaced, never silent');

      // 4 — no transport → honest toast, no crash
      toasts.length = 0;
      window.HearthriseGoalClaim = null;
      window.claimQuestReward('kill_more', false);
      assert(toasts.length > 0, 'a missing transport must be surfaced, never silent');

      // 5 — GOAL-STATE + R1: the SERVER GATES the claim, but the DISPLAY is the
      // player's own monotonic predicted progress (ruling R1 supersedes b461's
      // "server is display truth"). Local stats say 99/30; the server confirms
      // only 4/30 — so the row shows the player's progress held at the goal in a
      // "Confirming…" state, offers NO Claim, and nothing reads as claimable.
      // Then the server says claimed → the row reads claimed.
      window.G.dailyGoals.claimed = {};
      window.__hrGoalDisplay && window.__hrGoalDisplay.reset();
      window.HearthriseGoalClaim = { isSignedIn: () => true,
        claimGoal: () => Promise.resolve({ ok: false, error: 'incomplete' }),
        goalState: () => Promise.resolve({ ok: true, day_key: 'x', week_key: 'y', goals: [
          { goal_id: 'kill_more', weekly: false, target: 30, have: 4, complete: false, claimed: false },
        ] }) };
      await new Promise((r) => window.__hrSyncServerGoals((fresh) => r(fresh)));
      let badge = window.questBadgeState();
      assert(badge.claimable === 0, 'server says incomplete → nothing may read as claimable (local stats said 99/30)');
      window.openQuestsModal();
      (document.querySelector('#quests-modal-overlay .qm-tab[data-tab="daily"]') || {click(){}}).click();
      await microtasks();
      const prog = document.querySelector('#quests-modal-overlay .qm-q-progtext');
      assert(prog && /Confirming/i.test(prog.textContent), 'R1: the row must read Confirming… while the server has not confirmed, got: ' + (prog && prog.textContent));
      assert(!document.querySelector('#quests-modal-overlay .qm-q-claim'), 'no Claim button when the server says incomplete');
      window.closeQuestsModal();
      window.HearthriseGoalClaim.goalState = () => Promise.resolve({ ok: true, goals: [
        { goal_id: 'kill_more', weekly: false, target: 30, have: 30, complete: true, claimed: true } ] });
      await new Promise((r) => window.__hrSyncServerGoals((fresh) => r(fresh)));
      window.openQuestsModal();
      (document.querySelector('#quests-modal-overlay .qm-tab[data-tab="daily"]') || {click(){}}).click();
      await microtasks();
      assert(document.querySelector('#quests-modal-overlay .qm-q-claimed'),
        'server says claimed → the row reads "Claimed" even with no local flag');
      window.closeQuestsModal();
    } finally {
      // drop the stubbed server picture so later tests read local again
      window.__hrSyncServerGoals.reset();
      if (typeof window.closeQuestsModal === 'function') window.closeQuestsModal();
      window.clientMayWriteRecordField = origMay;
      window.HearthriseGoalClaim = origClaim;
      window.notify = origNotify;
      window._goalClaimsInFlight = {};
      window._goalRetry = {}; window._goalSyncNotice = {};
      if (window.__hrGoalDisplay) window.__hrGoalDisplay.reset();
      restoreG(snap);
    }
  }),

  () => tryRunAsync('R1-MONO (ruling R1): the predicted display is MONOTONIC — a server reconcile DOWN never decrements the shown count', async () => {
    // The counter under server-authority is server-truth fed by a ~90s span-sim
    // that undercounts live actions. R1: shown = max(shownLastFrame, confirmed,
    // min(predicted, goal)) — once on screen a number only ever climbs; a
    // down-reconcile HOLDS at the high-water. Tested against the ONE published
    // implementation the render layer reads, so the rule and the display cannot
    // drift. RED before the fix: window.HearthriseGoals is undefined.
    const GLS = window.HearthriseGoals && window.HearthriseGoals.goalDisplayState;
    assert(typeof GLS === 'function', 'window.HearthriseGoals.goalDisplayState must be published for the render layer + tests');
    // predicted 30/30 while the server confirms only 27 → shown reaches 30
    let s = GLS({ goal: 30, confirmed: 27, predicted: 30, prevShown: 0 });
    assert(s.shown === 30, 'predicted 30/30 must show 30 even while the server confirms 27, got ' + s.shown);
    assert(s.phase === 'confirming' && s.canClaim === false, 'predicted-complete + server-incomplete is CONFIRMING, not claimable');
    // a settle that keeps confirmed at 27 must HOLD the shown high-water at 30
    s = GLS({ goal: 30, confirmed: 27, predicted: 30, prevShown: s.shown });
    assert(s.shown === 30, 'a settle must never drop the shown count below its high-water (30), got ' + s.shown);
    // even a hard down-reconcile (server 5) holds at the shown high-water
    s = GLS({ goal: 30, confirmed: 5, predicted: 5, prevShown: 30 });
    assert(s.shown === 30, 'even a hard down-reconcile holds at 30 (no decrement ever), got ' + s.shown);
    // shown never over-fills the bar; a server that counted MORE (away night) is honoured
    s = GLS({ goal: 30, confirmed: 40, predicted: 99, prevShown: 0 });
    assert(s.shown === 30, 'shown clamps to the goal (never > 100%), got ' + s.shown);
    assert(s.phase === 'complete' && s.canClaim === true, 'a server-confirmed >= goal is COMPLETE + claimable');
    // a goal-less counter can never complete
    s = GLS({ goal: 0, confirmed: 9, predicted: 9, prevShown: 0 });
    assert(s.phase === 'progress' && s.canClaim === false, 'a 0-goal counter is never complete/claimable');
  }),

  () => tryRunAsync('R1-CONFIRM (ruling R1): predicted-complete but server-incomplete shows "Confirming…", NO Claim, NO completion toast', async () => {
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField, origClaim = window.HearthriseGoalClaim, origNotify = window.notify;
    const toasts = [];
    const mt = () => new Promise((r) => setTimeout(r, 0));
    try {
      window.clientMayWriteRecordField = (f) => f !== 'gold';   // armed: server owns the counter
      window.notify = (m) => toasts.push(String(m));
      window.__hrGoalDisplay.reset(); window.__hrSyncServerGoals.reset();
      window.getGoalsForToday();
      const dayKey = window.G.dailyGoals.dayKey;
      window.G.stats.kills = 999;   // local optimistic is well past the goal
      window.G.dailyGoals = { dayKey, picks: ['kill_more'], startValues: { kill_more: 0 }, claimed: {} };
      // The server has only counted 27 of the 30 — CONFIRMING, not complete.
      window.HearthriseGoalClaim = { isSignedIn: () => true,
        goalState: () => Promise.resolve({ ok: true, goals: [
          { goal_id: 'kill_more', weekly: false, target: 30, have: 27, complete: false, claimed: false } ] }) };
      await new Promise((r) => window.__hrSyncServerGoals((f) => r(f)));
      window.openQuestsModal();
      (document.querySelector('#quests-modal-overlay .qm-tab[data-tab="daily"]') || { click() {} }).click();
      await mt();
      const prog = document.querySelector('#quests-modal-overlay .qm-q-progtext');
      assert(prog && /Confirming/i.test(prog.textContent), 'the row must read "Confirming…" when predicted hit the goal but the server has not, got: ' + (prog && prog.textContent));
      assert(prog && /30\s*\/\s*30/.test(prog.textContent), 'the bar is FULL (30 / 30) during Confirming, got: ' + (prog && prog.textContent));
      assert(!document.querySelector('#quests-modal-overlay .qm-q-claim'), 'NO Claim button while the server has not confirmed');
      assert(document.querySelector('#quests-modal-overlay .qm-q-confirming'), 'a Confirming chip stands in for the Claim button');
      assert(!toasts.some((t) => /Quest complete/i.test(t)), 'NO completion toast may fire while merely Confirming');
    } finally {
      if (typeof window.closeQuestsModal === 'function') window.closeQuestsModal();
      window.__hrSyncServerGoals.reset(); window.__hrGoalDisplay.reset();
      window.clientMayWriteRecordField = origMay; window.HearthriseGoalClaim = origClaim; window.notify = origNotify;
      restoreG(snap);
    }
  }),

  () => tryRunAsync('R1-COMPLETE (ruling R1): when the SERVER confirms >= goal, EXACTLY ONE completion toast fires and Claim is enabled', async () => {
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField, origClaim = window.HearthriseGoalClaim, origNotify = window.notify;
    const toasts = [];
    const mt = () => new Promise((r) => setTimeout(r, 0));
    let have = 27, complete = false;
    try {
      window.clientMayWriteRecordField = (f) => f !== 'gold';
      window.notify = (m) => toasts.push(String(m));
      window.__hrGoalDisplay.reset(); window.__hrSyncServerGoals.reset();
      window.getGoalsForToday();
      const dayKey = window.G.dailyGoals.dayKey;
      window.G.stats.kills = 999;
      window.G.dailyGoals = { dayKey, picks: ['kill_more'], startValues: { kill_more: 0 }, claimed: {} };
      window.HearthriseGoalClaim = { isSignedIn: () => true,
        goalState: () => Promise.resolve({ ok: true, goals: [
          { goal_id: 'kill_more', weekly: false, target: 30, have, complete, claimed: false } ] }) };
      // Phase 1 — server incomplete: render must NOT celebrate.
      await new Promise((r) => window.__hrSyncServerGoals((f) => r(f)));
      window.openQuestsModal();
      (document.querySelector('#quests-modal-overlay .qm-tab[data-tab="daily"]') || { click() {} }).click();
      await mt();
      assert(toasts.filter((t) => /Quest complete/i.test(t)).length === 0, 'no completion toast before the server confirms');
      // Phase 2 — the server catches up.
      have = 30; complete = true;
      window.__hrSyncServerGoals.reset();
      await new Promise((r) => window.__hrSyncServerGoals((f) => r(f)));
      window.closeQuestsModal(); window.openQuestsModal();
      (document.querySelector('#quests-modal-overlay .qm-tab[data-tab="daily"]') || { click() {} }).click();
      await mt();
      const completeToasts = toasts.filter((t) => /Quest complete/i.test(t));
      assert(completeToasts.length === 1, 'exactly ONE completion toast on the server confirm, got ' + completeToasts.length);
      assert(document.querySelector('#quests-modal-overlay .qm-q-claim'), 'Claim must be enabled once the server confirms');
      assert(!document.querySelector('#quests-modal-overlay .qm-q-confirming'), 'the Confirming chip is gone once complete');
    } finally {
      if (typeof window.closeQuestsModal === 'function') window.closeQuestsModal();
      window.__hrSyncServerGoals.reset(); window.__hrGoalDisplay.reset();
      window.clientMayWriteRecordField = origMay; window.HearthriseGoalClaim = origClaim; window.notify = origNotify;
      restoreG(snap);
    }
  }),

  () => tryRunAsync('R5-TWOPHASE (ruling R5): a server-DENIED claim never reads "failed"/"0 reward"/consumed — it holds Confirming and auto-retries to pay EXACTLY once', async () => {
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField, origClaim = window.HearthriseGoalClaim, origNotify = window.notify;
    const toasts = []; const okCalls = [];
    const mt = () => new Promise((r) => setTimeout(r, 0));
    let denyClaim = true;
    try {
      window.clientMayWriteRecordField = (f) => f !== 'gold';
      window.notify = (m) => toasts.push(String(m));
      window.__hrGoalDisplay.reset(); window.__hrSyncServerGoals.reset();
      window._goalRetry = {}; window._goalSyncNotice = {}; window._goalClaimsInFlight = {};
      window.getGoalsForToday();
      const dayKey = window.G.dailyGoals.dayKey;
      window.G.stats.kills = 999;
      window.G.dailyGoals = { dayKey, picks: ['kill_more'], startValues: { kill_more: 0 }, claimed: {} };
      // The server's projection SAYS complete (so Claim is offered), but the
      // claim RPC's own counter lags and denies 'incomplete' — the exact race.
      window.HearthriseGoalClaim = { isSignedIn: () => true,
        goalState: () => Promise.resolve({ ok: true, goals: [
          { goal_id: 'kill_more', weekly: false, target: 30, have: 30, complete: true, claimed: false } ] }),
        claimGoal: (id, w) => {
          if (denyClaim) return Promise.resolve({ ok: false, error: 'incomplete' });
          okCalls.push([id, !!w]); return Promise.resolve({ ok: true, gold: 600 });
        } };
      await new Promise((r) => window.__hrSyncServerGoals((f) => r(f)));
      const goldBefore = window.G.gold;
      // Two RAPID claims — the in-flight latch must collapse them to one fire.
      window.claimQuestReward('kill_more', false);
      window.claimQuestReward('kill_more', false);
      await mt(); await mt();
      // Denial handled as two-phase, NOT failure.
      assert(!(window.G.dailyGoals.claimed && window.G.dailyGoals.claimed.kill_more), 'a denied claim must NOT mark the goal claimed/consumed');
      assert(window.G.gold === goldBefore, 'a denied claim must credit NO reward (never "0 reward" either)');
      assert(!toasts.some((t) => /fail|failed|0 reward|error|couldn.t pay|didn.t go through/i.test(t)), 'a denied claim must NEVER read as failed / 0-reward, got: ' + JSON.stringify(toasts));
      assert(toasts.some((t) => /syncing/i.test(t)), 'a denied claim shows the calm "still syncing…" notice');
      assert(window._goalRetry && window._goalRetry['d:kill_more'], 'the denied claim parks an auto-retry');
      // The server catches up; the auto-retry drives EXACTLY one payment.
      denyClaim = false;
      window.__hrDriveGoalRetries();
      await mt(); await mt(); await mt(); await mt();
      assert(okCalls.length === 1, 'the auto-retry must pay EXACTLY once, fired ' + okCalls.length);
      assert(window.G.dailyGoals.claimed && window.G.dailyGoals.claimed.kill_more === true, 'after the server confirms, the goal is claimed');
      // A second drive must not double-pay (the once-guard + cleared retry).
      window.__hrDriveGoalRetries();
      await mt(); await mt();
      assert(okCalls.length === 1, 'a second drive must not re-pay, fired ' + okCalls.length);
    } finally {
      if (typeof window.closeQuestsModal === 'function') window.closeQuestsModal();
      window.__hrSyncServerGoals.reset(); window.__hrGoalDisplay.reset();
      window._goalRetry = {}; window._goalSyncNotice = {}; window._goalClaimsInFlight = {};
      window.clientMayWriteRecordField = origMay; window.HearthriseGoalClaim = origClaim; window.notify = origNotify;
      restoreG(snap);
    }
  }),

  () => tryRun('b227: the save migration clamps room levels to the live ladder', () => {
    // Insurance, not a repair — no live writer can produce an out-of-range
    // level (upgradeRoom advances by one only when levels[lv] exists, and the
    // grandfather pass writes the literal 1). The clamp exists so the
    // invariant is ENFORCED at load rather than true by inspection.
    const M = window.HEARTHRISE_MIGRATIONS || window.__migrations;
    const run = (save) => {
      const list = (M && (M.list || M)) || null;
      const m = (Array.isArray(list) ? list : []).find((x) => x && x.from === 8 && x.to === 9);
      assert(m, 'the v8 → v9 room clamp migration is not registered');
      m.apply(save);
      return save;
    };
    const cap = window.ROOMS.forge.levels.length;
    const out = run({ rooms: { forge: 99, kitchen: -2, library: 2.7, garden: NaN, workshop: '3', mystery_room: 4 } });
    assert(out.rooms.forge === cap, 'a level past the ladder must clamp to the cap, got ' + out.rooms.forge);
    assert(out.rooms.kitchen === 0, 'a negative level must clamp to 0');
    assert(out.rooms.library === 2, 'a fractional level must floor');
    assert(out.rooms.garden === 0, 'NaN must become 0, never propagate');
    assert(out.rooms.workshop === 3, 'a numeric string must coerce');
    // A room this build does not know keeps its level: we cannot know its cap,
    // and deleting it would lose a feature during a staged rollout.
    assert(out.rooms.mystery_room === 4, 'an unknown room id must be left alone');
    // …and a legitimate save must come out untouched.
    const clean = run({ rooms: { forge: 2, kitchen: cap } });
    assert(clean.rooms.forge === 2 && clean.rooms.kitchen === cap, 'a valid save must be unchanged by the clamp');
    // Idempotent, as every migration in this registry must be.
    assert(JSON.stringify(run({ rooms: { forge: 2 } })) === JSON.stringify({ rooms: { forge: 2 } }),
      'the clamp must be idempotent');
  }),

  () => tryRun('b227: every room has a five-rung ladder with real, reachable costs', () => {
    // The b213 deadlock rule, re-run against the rungs this wave added: no
    // cost may name an item the game does not define. A ladder that lists a
    // price nobody can pay is a placeholder wearing a number.
    const ids = Object.keys(window.ROOMS);
    assert(ids.length === 8, 'expected 8 rooms, got ' + ids.length);
    ids.forEach((id) => {
      const r = window.ROOMS[id];
      assert(r.levels.length === 5, id + ' should have 5 rungs, has ' + r.levels.length);
      r.levels.forEach((rung, i) => {
        assert(typeof rung.nm === 'string' && rung.nm.length, id + ' L' + (i + 1) + ' needs a rung name');
        assert(typeof rung.bonus === 'string' && rung.bonus.length, id + ' L' + (i + 1) + ' needs an effect line');
        assert(rung.cost && Object.keys(rung.cost).length, id + ' L' + (i + 1) + ' needs a cost');
        Object.keys(rung.cost).forEach((k) => {
          assert(k === 'gold' || window.ITEMS[k], id + ' L' + (i + 1) + ' costs unknown item "' + k + '"');
          assert(rung.cost[k] > 0, id + ' L' + (i + 1) + ' cost ' + k + ' must be positive');
        });
        // Costs must rise. A rung that is cheaper than the one below it is a
        // typo the ladder cannot express any other way.
        if (i > 0) assert(rung.cost.gold > r.levels[i - 1].cost.gold,
          id + ' L' + (i + 1) + ' must cost more gold than L' + i);
      });
      // L1-L3 are gate-free (they are the live rungs); L4/L5 carry a tier.
      assert(r.levels[3].tier >= 3, id + ' L4 must require property tier 3 or better');
      assert(r.levels[4].tier >= 4, id + ' L5 must require property tier 4 or better');
      [0, 1, 2].forEach((i) => assert(r.levels[i].tier == null,
        id + ' L' + (i + 1) + ' is a live rung and must not have gained a tier gate'));
    });
  }),

  () => tryRun('b227 P1: no room rung can require a good the player cannot yet make (the §7 proof, executable)', () => {
    /* THE BUG THIS CLOSES. Workshop L1 cost `normal_plank:15`. The only plank
       source is the crafting recipe `saw_normal`; crafting is bench-gated on
       the Workshop; the Workshop is that room. A fresh account could never
       build it. b213 fixed exactly this class for the PROPERTY TIER costs and
       never walked ROOM costs, and homestead-deepening §7 proves its new L4/L5
       castle goods are reachable while simply ASSUMING the live rungs were.
       Both blind spots are the same blind spot, so this is the whole proof,
       run against live data instead of asserted in prose.

       The model: walk the property ladder. At tier T a player has passed every
       tier below, so they may own every room those tiers unlocked — and rooms
       ARE the benches. Anything they can gather, farm, kill or buy is free;
       anything else must come off a bench they can actually have by then. */
    const R = window.ROOMS, H = window.HearthriseHomestead;
    assert(R && H, 'rooms + homestead modules present');

    // ── what the world gives you for free, with no bench at all ──
    const raw = new Set(['gold']);
    [].concat(window.TREES || [], window.ROCKS || [], window.FISH_SPOTS || [])
      .forEach((n) => n && n.prod && raw.add(n.prod));
    Object.keys(window.CROPS || {}).forEach((c) => {
      const d = window.CROPS[c];
      if (d && d.prod) raw.add(d.prod);
      if (d && d.seed) raw.add(d.seed);      // seeds drop and are shop-stocked
    });
    Object.keys(window.MONSTERS || {}).forEach((m) => {
      ((window.MONSTERS[m] || {}).drops || []).forEach((d) => d && d.id && raw.add(d.id));
    });

    /* ── which bench each artisan skill needs, and when you may own it ──
       Every mapped skill is UNGATED since 2026-09-07 (a room sells speed, a
       level sells permission), so today this is 0 across the board and the
       walk below is a "reachable at all" proof rather than a bench-order one.
       It is kept as a FUNCTION of UNGATED rather than folded to 0 because the
       day a room gates something again is the day the circularity returns —
       and this is the only executable proof that it does not. */
    const BENCH = H.WORKBENCH;                    // skill → room
    const benchTier = (skill) => (H.UNGATED[skill] ? 0 : H.roomMinTier(BENCH[skill]));

    const inputsOf = (r) => (typeof window.getInputs === 'function')
      ? window.getInputs(r)
      : (r.inputs || (r.input ? { [r.input]: 1 } : {}));

    /* Everything obtainable by a player at property tier T, as a fixpoint:
       start from raw, then keep adding any recipe output whose bench is
       available by T and whose inputs are already obtainable.

       `without` is the whole point of the check and the reason a first draft
       of this test PASSED the very bug it was written for. The Workshop is a
       tier-2 room, so at T=2 a naive walk counts the crafting bench as
       available — and then Workshop L1's plank cost looks perfectly
       reachable, via the Workshop. That circularity IS the deadlock. So when
       checking a room's FIRST rung, the bench that room itself provides is
       removed from the world: you cannot use a workshop to build the
       workshop. From L2 onward it is legitimately available, because owning
       L1 is a precondition of buying L2. */
    const reachableAt = (T, without) => {
      const have = new Set(raw);
      for (let pass = 0; pass < 12; pass++) {
        let grew = false;
        Object.keys(window.ARTISAN_RECIPES || {}).forEach((skill) => {
          if (benchTier(skill) > T) return;       // that bench is not open yet
          if (without && BENCH[skill] === without && !H.UNGATED[skill]) return;
          (window.ARTISAN_RECIPES[skill] || []).forEach((r) => {
            if (!r.output || have.has(r.output)) return;
            const inp = inputsOf(r);
            if (Object.keys(inp).every((k) => have.has(k))) { have.add(r.output); grew = true; }
          });
        });
        if (!grew) break;
      }
      return have;
    };
    const cache = {};
    const reach = (T, without) => {
      const k = T + '|' + (without || '');
      return cache[k] || (cache[k] = reachableAt(T, without));
    };

    const problems = [];
    Object.keys(R).forEach((id) => {
      const roomTier = H.roomMinTier(id);
      R[id].levels.forEach((rung, i) => {
        // The earliest property tier at which this rung is legal at all.
        const T = Math.max(roomTier, rung.tier || 0);
        // Rung 1 is bought by someone who does NOT yet own this room.
        const have = reach(T, i === 0 ? id : null);
        Object.keys(rung.cost || {}).forEach((item) => {
          if (!have.has(item)) {
            problems.push(id + ' L' + (i + 1) + ' needs "' + item +
              '" but nothing reachable at property tier ' + T +
              (i === 0 ? ' (without the ' + R[id].name + ' itself)' : '') + ' produces it');
          }
        });
      });
    });
    assert(problems.length === 0, 'DEADLOCK — ' + problems.join(' | '));
    assert(reach(2, 'workshop').has('normal_log'), 'sanity: logs are free with no Workshop');
    /* THE VACUITY GUARD, IN THE ONLY TWO POSITIONS IT HAS. The self-exclusion
       above can only bite while some bench is GATED on its room; since
       2026-09-07 none is, so the circularity is structurally impossible and
       `without` is a no-op. That must be asserted from the exemption set rather
       than assumed, or this proof would decay into "somebody could make it",
       and the moment a bench is re-gated the first branch takes over again. */
    const gatedBench = Object.keys(BENCH).filter((s) => !H.UNGATED[s]);
    if (gatedBench.length) {
      const s = gatedBench[0], room = BENCH[s];
      const made = (window.ARTISAN_RECIPES[s] || []).find((r) => r.output);
      assert(made && !reach(9, room).has(made.output),
        'the self-exclusion is not working — ' + (made && made.output) + ' must be unreachable while the '
        + room + ' is excluded');
    } else {
      assert(reach(2, 'workshop').has('normal_plank'),
        'no bench is gated on a room, so a plank must be reachable with no Workshop — this walk and '
        + 'HearthriseHomestead.UNGATED disagree about the same rule');
    }

    /* The specific regression, still pinned — though the deadlock behind it is
       now impossible twice over: the cost is logs, AND the saw is a level-1
       crafting recipe no room gates, so a plank is reachable from the camp. */
    assert(!('normal_plank' in R.workshop.levels[0].cost),
      'Workshop L1 must not cost planks — it was once priced in its own output');
    assert(reach(0).has('normal_log'), 'logs must be free at a Wanderer\'s Camp');
    assert(reach(0).has('normal_plank'),
      'a plank must be reachable at the camp — saw_normal is Crafting 1 and no room gates it');
  }),

  () => tryRun('b227: the magnitude retune — small increments, and costs untouched', () => {
    /* Tyler, binding, mid-build: "the % boosts across the board are way too
       high. 50% smithing? it should be like increments of 2%."

       This OVERRIDES spec §1's "nothing already bought is devalued" corollary
       for MAGNITUDES, by the owner, as a stated global rebalance. What the
       corollary still protects — and what this test therefore guards — is that
       LEVELS and COSTS did not move: a player who bought Kitchen 3 still owns
       Kitchen 3 and still paid 8,000g and 30 Oak Log for it. Only the number
       printed on it came down. */
    const MAG = {
      kitchen:  ['cookSpeed', [.02, .04, .06, .08, .10]],
      forge:    ['smithSpeed', [.02, .04, .06, .08, .10]],
      workshop: ['craftSpeed', [.02, .04, .06, .08, .10]],
      shrine:   ['prayerSpeed', [.02, .04, .06, .08, .10]],
      library:  ['allXP', [.01, .02, .03, .04, .05]],
      trophy:   ['combatXP', [.01, .02, .03, .04, .05]],
      // Duration is EXEMPT from the small-percent grammar (bonus-rebase.md):
      // it is not throughput power, so it keeps the generous curve.
      cellar:   ['buffDuration', [.20, .40, .60, .80, 1.0]],
      garden:   ['farmYield', [1, 2, 4, 6, 8]],   // units, not a percentage
    };
    Object.keys(MAG).forEach((id) => {
      const [key, vals] = MAG[id];
      vals.forEach((v, i) => {
        const rung = window.ROOMS[id].levels[i];
        assert(rung.bk === key, id + ' L' + (i + 1) + ' should sell ' + key + ', sells ' + rung.bk);
        assert(Math.abs(rung.bv - v) < 1e-9,
          id + ' L' + (i + 1) + ' should grant ' + v + ', grants ' + rung.bv + ' — the retune drifted');
      });
    });
    // Every percentage on this screen is a whole even number of points (or a
    // whole point for the two +1..5 ladders). "Increments of 2%" as a shape,
    // not a one-off edit — a rung at 0.075 would pass a ceiling test and still
    // be exactly what Tyler asked us to stop doing.
    // Whole percentages EVERYWHERE, including the secondary maps — the rebase
    // spec's grammar test asserts integers, and a rung at 0.075 would pass a
    // ceiling check while being exactly what Tyler asked us to stop doing.
    const EXEMPT = { farmYield: 1, buffDuration: 1 };   // units / not throughput power
    Object.keys(window.ROOMS).forEach((id) => window.ROOMS[id].levels.forEach((rung, i) => {
      const seen = [];
      if (rung.bk) seen.push([rung.bk, rung.bv || 0]);
      if (rung.bx) Object.keys(rung.bx).forEach((k) => seen.push([k, rung.bx[k]]));
      seen.forEach(([k, v]) => {
        const pts = v * 100;
        assert(Math.abs(pts - Math.round(pts)) < 1e-9,
          id + ' L' + (i + 1) + ' grants ' + pts + ' points of ' + k + ' — not a whole percentage');
        if (!EXEMPT[k]) {
          assert(pts <= 25, id + ' L' + (i + 1) + ' grants ' + pts + '% ' + k + ' — too high for the retuned grammar');
        }
      });
    }));
    // No room ships at the old 10/25/50 shape anywhere.
    Object.keys(window.ROOMS).forEach((id) => window.ROOMS[id].levels.forEach((rung, i) => {
      if (EXEMPT[rung.bk]) return;
      assert(!(Math.abs(rung.bv - 0.25) < 1e-9 || Math.abs(rung.bv - 0.5) < 1e-9),
        id + ' L' + (i + 1) + ' is still on the pre-rebase 25/50 curve');
    }));
    // b228: the reserved payload is PAID. Library L4/L5 pay Rested XP as a flat
    // QUANTUM per banked charge (capacity, outside the percent grammar) instead
    // of the percentage potency that was provably worth nothing, and L5 also
    // deepens the bank. What must never come back is a `restedXp` PERCENTAGE.
    assert(window.ROOMS.library.levels[3].rested === 800, 'Library L4 must pay 800 XP per rested charge');
    assert(window.ROOMS.library.levels[4].rested === 1600, 'Library L5 must pay 1,600 XP per rested charge');
    assert(window.ROOMS.library.levels[4].restedCap === 120, 'the Great Library must deepen the bank to 120 charges');
    [3, 4].forEach((i) => {
      const rung = window.ROOMS.library.levels[i];
      assert(!rung.resv, 'Library L' + (i + 1) + ' must no longer say "reserved" — the payload shipped');
      assert(/[Rr]ested/.test(rung.bonus || ''), 'Library L' + (i + 1) + ' must SAY it pays Rested XP');
    });
    let restedProducers = 0;
    Object.keys(window.ROOMS).forEach((id) => window.ROOMS[id].levels.forEach((r) => {
      if (r.bk === 'restedXp' || (r.bx && r.bx.restedXp != null)) restedProducers++;
    }));
    assert(restedProducers === 0, 'no homestead rung may promise Rested XP as a PERCENTAGE — it is a flat quantum now');

    // COSTS AND LEVELS ARE UNTOUCHED. This is the half of the corollary that
    // still stands, so it is frozen literally.
    const COST = {
      kitchen:  [{ gold: 500, normal_log: 20 }, { gold: 2000, normal_log: 50 }, { gold: 8000, oak_log: 30 }],
      cellar:   [{ gold: 1200, normal_log: 60 }, { gold: 4000, oak_log: 60 }, { gold: 12000, willow_log: 50 }],
      forge:    [{ gold: 800, copper_ore: 30 }, { gold: 3000, iron_ore: 50 }, { gold: 12000, iron_ore: 100 }],
      library:  [{ gold: 1000, normal_log: 50 }, { gold: 4000, oak_log: 50 }, { gold: 15000, maple_log: 30 }],
      garden:   [{ gold: 600, wheat: 20 }, { gold: 2500, wheat: 60 }, { gold: 9000, pumpkin: 5 }],
      trophy:   [{ gold: 2000, wolf_pelt: 5 }, { gold: 8000, troll_hide: 3 }, { gold: 25000, dragon_scale: 2 }],
      shrine:   [{ gold: 900, bones: 40 }, { gold: 3500, big_bones: 25 }, { gold: 13000, dragon_bones: 8 }],
    };
    Object.keys(COST).forEach((id) => COST[id].forEach((c, i) => {
      assert(JSON.stringify(window.ROOMS[id].levels[i].cost) === JSON.stringify(c),
        id + ' L' + (i + 1) + ' price changed: ' + JSON.stringify(window.ROOMS[id].levels[i].cost));
    }));
    // The Workshop is the ONE live cost that moved, and only because it was a
    // deadlock (see the §7 proof above). Pinned so the fix cannot be reverted.
    assert(JSON.stringify(window.ROOMS.workshop.levels[0].cost) === JSON.stringify({ gold: 700, normal_log: 40 }),
      'Workshop L1 must stay on raw logs — planks were the deadlock');

    // The Cellar is the one deliberate change of EFFECT, and it is a strict
    // gain: `storage` was read by nothing, so nobody can be worse off.
    window.ROOMS.cellar.levels.forEach((rung, i) => {
      assert(rung.bk === 'buffDuration', 'Cellar L' + (i + 1) + ' should now sell buff duration');
    });
    assert(window.getBonus('storage') === 0, 'storage must no longer be produced by anything');
    // Reliability is the Kitchen's mechanic, not a power number — explicitly
    // exempt from the retune.
    assert(window.ROOMS.kitchen.levels[2].bx.noBurn === 0.25, 'the noBurn column must NOT have been retuned');
  }),

  () => tryRun('b227 P1: the ESM merge does not silently eat legacy drop injections', () => {
    /* Found by the deadlock proof, and it is a live content bug ~80 builds old.
       legacy.js pushed 11 drops onto MONSTERS at parse time; main.js then runs
       `unifyObject` = `Object.assign(legacyObj, esmObj)`, a PER-KEY overwrite
       that replaces each whole monster object — discarding every push. Result:
       3 raw meats never dropped (so cooked_wolf_meat, and therefore
       field_ration — a castle good — were unobtainable) and 6 recipe scrolls
       never dropped (so 6 `gated:` recipes could never unlock). They now live
       in src/data/monsters.js with every other drop. */
    const M = window.MONSTERS || {};
    const dropsOf = (id) => ((M[id] || {}).drops || []).map((d) => d.id);
    const EXPECT = {
      small_wolf: 'raw_wolf_meat', wolf: 'raw_wolf_meat', dire_wolf: 'raw_wolf_meat',
      panther: 'raw_panther_meat', bear: 'raw_bear_meat', ancient_bear: 'raw_bear_meat',
      goblin_warlord: 'chief_blade_recipe', warband_captain: 'captain_recipe',
      lich: 'soul_recipe', dragon: 'marrow_cookbook', plague_swarm: 'field_cookbook',
    };
    Object.keys(EXPECT).forEach((mid) => {
      assert(dropsOf(mid).indexOf(EXPECT[mid]) >= 0,
        mid + ' no longer drops ' + EXPECT[mid] + ' — the ESM merge ate it again');
    });
    assert(dropsOf('ancient_bear').indexOf('alpha_pattern') >= 0, 'ancient_bear must also drop alpha_pattern');
    // No duplicates: if the legacy pushes are ever restored alongside the data,
    // every one of these would drop twice.
    Object.keys(EXPECT).forEach((mid) => {
      const ids = dropsOf(mid);
      assert(ids.length === new Set(ids).size, mid + ' has a duplicated drop entry');
    });
    // The b145 Phase-B suppression holds — a scroll that unlocks nothing is a
    // dead end, so a scroll must NOT drop until its target item ships.
    //
    // b343: two of the original three have now shipped their targets
    // (spellstone_diagram → spellstone_ring, gemcutter_note →
    // dragon_gem_earrings, both in src/data/slot-ladders.js), so they are
    // asserted the OTHER way round below. dragon_marrow_recipe's target
    // (dragonbone_spear) still does not exist and stays suppressed. The rule is
    // now stated as a rule rather than as a hardcoded list, so it cannot rot:
    // EVERY scroll item is checked against whether its target exists.
    const all = Object.keys(M).reduce((a, k) => a.concat(dropsOf(k)), []);
    assert(all.indexOf('dragon_marrow_recipe') < 0,
      'dragon_marrow_recipe is dropping but its target item (dragonbone_spear) does not exist yet (b145)');
    Object.entries(window.ITEMS || {}).forEach(([id, it]) => {
      if (!it || !it.recipe) return;                       // not a scroll
      const targetExists = !!(window.ITEMS || {})[it.recipe];
      if (!targetExists) {
        assert(all.indexOf(id) < 0, 'scroll ' + id + ' drops but its target item "' + it.recipe + '" does not exist (b145)');
      }
    });
    // b343: and the two that were unblocked must actually be obtainable now —
    // shipping the item without the drop leaves the recipe permanently locked.
    ['spellstone_diagram', 'gemcutter_note'].forEach((s) => {
      assert(all.indexOf(s) >= 0, s + ' must now drop — its target item shipped in b343 (slot-ladders.js)');
    });
    // And every scroll that DOES drop must actually unlock a live recipe.
    const gates = new Set();
    Object.keys(window.ARTISAN_RECIPES || {}).forEach((sk) =>
      (window.ARTISAN_RECIPES[sk] || []).forEach((r) => { if (r.gated) gates.add(r.gated); }));
    all.filter((id) => (window.ITEMS[id] || {}).recipe).forEach((id) => {
      assert(gates.has(id), 'scroll ' + id + ' drops but unlocks no recipe — a dead end');
    });
  }),

  () => tryRun('b227: the power budget holds at a maxed homestead (spec §6/H2)', () => {
    /* Asserted against the LADDER, not against a live getBonus reading, and
       that is deliberate. getBonus is wrapped additively by world-events,
       companions, clans, clan-seat-ui and muster, and the daily/weekly event
       pool contains speed and XP boosts — so a reading-based ceiling test goes
       red or green on the UTC date alone. (I shipped exactly that mistake in
       b225 and had to fix it in b226; a gate that flips on the calendar is
       worse than no gate.) The budget is a statement about what the HOMESTEAD
       may grant, so the homestead's own tables are what it is checked against. */
    const CEIL = {
      // Post-retune (Tyler, binding): small increments across the board.
      allXP: 0.05,
      combatXP: 0.05, cookSpeed: 0.10, smithSpeed: 0.10, craftSpeed: 0.10, prayerSpeed: 0.10,
      farmYield: 8, craftSave: 0.08, yield_cooking: 0.08, yield_smithing: 0.08,
      buffDuration: 1.0,    // exempt from the % grammar — not throughput power
      noBurn: 0.25,         // the Kitchen cancels the whole open-fire burn, never more
      restedXp: 0,          // reserved for the b228 rested rework — promised by nothing
    };
    const peak = {};
    Object.keys(window.ROOMS).forEach((id) => window.ROOMS[id].levels.forEach((rung) => {
      const add = (k, v) => { peak[k] = Math.max(peak[k] || 0, v); };
      if (rung.bk) add(rung.bk, rung.bv || 0);
      if (rung.bx) Object.keys(rung.bx).forEach((k) => add(k, rung.bx[k]));
    }));
    Object.keys(CEIL).forEach((k) => {
      assert(Math.abs((peak[k] || 0) - CEIL[k]) < 1e-9,
        'the homestead ceiling for ' + k + ' should be ' + CEIL[k] + ', the ladder grants ' + (peak[k] || 0));
    });
    // No room may invent a key the budget has not accounted for — that is how
    // a ceiling stops meaning anything.
    Object.keys(peak).forEach((k) => assert(CEIL[k] != null,
      'a room rung grants "' + k + '", which is outside the audited power budget'));
    // H2: the homestead contributes NO goldFind. That lane is the castle
    // Treasury's, so the two pillars do not duplicate.
    assert(peak.goldFind == null, 'the homestead must contribute no goldFind');

    // allXP is the game's tightest budget (the fuse is 0.60 across every
    // system). Post-retune the homestead's whole contribution is 5 points,
    // which is the headroom problem solved rather than merely managed.
    assert(peak.allXP <= 0.05 + 1e-9, 'the homestead may not contribute more than +5% allXP');
  }),

  () => tryRun('b227: the fuses live where the number is SPENT, so no wrapper can escape them', () => {
    /* This test is the reason the fuses are not where the spec put them.

       homestead-deepening §8 specs both clamps as one-liners inside getBonus.
       Built there, this test measured prayerSpeed at 0.8999 through a clamp
       that said 0.85 — because getBonus is a CHAIN of seven additive wrappers
       (world-events, companions, clans, clan-seat-ui, muster + two in
       legacy.js), and a clamp in the base function is escaped by every wrapper
       above it. Both fuses therefore moved to the point of consumption. */
    /* b228: the chain-wide budget moved to features/power-budget.js as the
       FINAL wrapper (its own tests are below), and speedClamp stayed exactly
       where it is — as the last line of defence at `ms × (1 − speed)`. Its
       constant came to 0.70: the largest legal reading is gatherSpeed at the
       0.30 absolute peak plus the out-of-budget tool ladder's 0.35 = 0.65, so
       the fuse sits five points clear and never binds on a legal stack.
       RESTED_POTENCY_CAP is gone — Rested is a flat XP quantum now. */
    assert(typeof window.speedClamp === 'function', 'the speed fuse choke-point is not published');
    assert(window.SPEED_FUSE === 0.70, 'the speed fuse should be 0.70, got ' + window.SPEED_FUSE);
    assert(window.RESTED_POTENCY_CAP === undefined, 'the rested POTENCY cap must be retired, not left behind');
    assert(window.SPEED_FUSE > 0.30 + 0.35,
      'the speed fuse must sit above the highest legal gatherSpeed + tool ladder, or it silently nerfs a legal stack');

    // (a) The clamp clamps, at any input a wrapper chain could produce.
    assert(Math.abs(window.speedClamp(0.60) - 0.40) < 1e-9, 'an in-budget speed must pass through untouched');
    assert(Math.abs(window.speedClamp(0.90) - 0.30) < 1e-9, 'an over-budget speed must clamp to the fuse');
    assert(Math.abs(window.speedClamp(4) - 0.30) < 1e-9, 'an absurd total must still land on the fuse');
    assert(Math.abs(window.speedClamp(1) - 0.30) < 1e-9, 'speed 1.0 must never produce a zero interval');
    assert(window.speedClamp(2) > 0, 'the multiplier must never go negative — setInterval would spin');
    // A debuff still slows you: the fuse is a ceiling on fast, not a floor on slow.
    assert(Math.abs(window.speedClamp(-0.5) - 1.5) < 1e-9, 'a negative speed must still lengthen the action');
    assert(window.speedClamp(undefined) === 1 && window.speedClamp(NaN) === 1, 'garbage must be identity, not NaN');

    // (b) Every site that spends a speed key goes through it. A single
    //     un-routed `(1 - speed)` is a hole the fuse cannot see — and this
    //     codebase keeps TWO copies of the activity renderers
    //     (features/activities-grid.js overrides legacy.js's at boot), so
    //     "patch both or you patch neither" is checked, not assumed.
    //     Read off the live function bodies rather than a source blob, so this
    //     cannot quietly become a no-op the way a missing global would.
    [['startArtisan', window.startArtisan],
     ['renderSkillDetail', window.renderSkillDetail],
     ['_activityXpHr', window._activityXpHr]].forEach(([name, fn]) => {
      if (typeof fn !== 'function') return;
      const src = Function.prototype.toString.call(fn);
      if (!/speed/.test(src)) return;                 // this copy does no interval math
      assert(!/\(\s*1\s*-\s*speed\s*\)/.test(src),
        name + ' still computes a raw (1 - speed) — that site bypasses the fuse');
    });
    // startArtisan is the live loop and MUST be routed. Asserted BEHAVIOURALLY
    // rather than by reading its source: startArtisan is defined three times in
    // legacy.js and the outermost copy is whichever loaded last, so a source
    // scan tests the wrapper's shape instead of the game's behaviour. Drive a
    // deliberately over-budget speed and read the interval the engine actually
    // committed to (G.skillMs, which the offline replay also uses).
    if (typeof window.startArtisan === 'function' && window.ARTISAN_RECIPES) {
      const snapA = snapshotG();
      try {
        const rec = (window.ARTISAN_RECIPES.cooking || [])[0];
        if (rec) {
          window.G.rooms = { __fuse_probe: 1 };
          window.ROOMS.__fuse_probe = { name: 'probe', icon: '', desc: '',
            levels: [{ nm: 'p', bonus: 'p', cost: { gold: 1 }, bk: 'cookSpeed', bv: 4 }] };
          window.G.skills = Object.assign({}, window.G.skills, { cooking: 9999999 });
          const inp = (typeof window.getInputs === 'function') ? window.getInputs(rec) : {};
          const bag = {}; Object.keys(inp).forEach((k) => { bag[k] = 9999; });
          window.G.inventory = Object.assign({}, window.G.inventory, bag);
          window.startArtisan('cooking', rec.id);
          if (typeof window.stopSkill === 'function') window.stopSkill();
          const floorMs = Math.max(500, Math.floor(window.pacedActionMs(rec.ms) * (1 - window.SPEED_FUSE)));
          assert(window.G.skillMs >= floorMs - 1,
            'a 400% cook speed produced a ' + window.G.skillMs + 'ms interval — the fuse was bypassed (floor ' + floorMs + ')');
          assert(window.G.skillMs > 0, 'the committed interval must never be zero or negative');
        }
      } finally { delete window.ROOMS.__fuse_probe; restoreG(snapA); }
    }

    // (c) A real spend honours it: drive the interval with an over-budget
    //     bonus and assert the resulting ms is the floored, fused one.
    const snap = snapshotG();
    try {
      window.G.plotBuildings = [];
      window.G.rooms = {};
      Object.keys(window.ROOMS).forEach((id) => { window.G.rooms[id] = window.ROOMS[id].levels.length; });
      // Permanent power must sit UNDER the fuse — that is what makes it a fuse
      // and not a nerf. Read off the ladder, not off getBonus, because the
      // wrapper chain includes calendar-driven world events and a test that
      // flips on the UTC date is worse than no test.
      ['cookSpeed', 'smithSpeed', 'craftSpeed', 'prayerSpeed'].forEach((k) => {
        let peak = 0;
        Object.keys(window.ROOMS).forEach((id) => window.ROOMS[id].levels.forEach((r) => {
          if (r.bk === k) peak = Math.max(peak, r.bv || 0);
        }));
        assert(Math.abs(peak - 0.10) < 1e-9, 'the ' + k + ' ladder should top out at 0.10 post-retune, got ' + peak);
        assert(peak < window.SPEED_FUSE, k + ' permanent power reaches the fuse — that is a nerf, not a fuse');
      });
    } finally { restoreG(snap); }
  }),

  () => tryRun('b227: the material-only yield law (H6) — no extra output on equipment', () => {
    // Without this predicate a 20% extra-output roll on endgame armour prints
    // six figures at the vendor and the Forge becomes the game's largest gold
    // faucet. Materials, never equipment.
    assert(typeof window.isMaterialOutput === 'function', 'isMaterialOutput seam missing');
    const material = Object.keys(window.ITEMS).find((k) => !window.ITEMS[k].type);
    const equip = Object.keys(window.ITEMS).find((k) => !!window.ITEMS[k].type);
    assert(material && equip, 'need one material and one equipment item to test with');
    assert(window.isMaterialOutput({ output: material }) === true, material + ' is a material and should qualify');
    assert(window.isMaterialOutput({ output: equip }) === false, equip + ' has a type and must NEVER qualify');
    assert(window.isMaterialOutput({}) === false, 'a recipe with no output cannot yield extra');
    assert(window.isMaterialOutput({ output: 'nope_not_an_item' }) === false, 'an unknown output must not qualify');
    // Every recipe an extra-output rung can actually fire on must be a
    // material — i.e. the Forge's smelting lane, not its armoury.
    const smith = (window.ARTISAN_RECIPES.smithing || []).filter((r) => window.isMaterialOutput(r));
    assert(smith.length > 0, 'the Forge must have at least one material recipe for yield_smithing to mean anything');
    assert(smith.every((r) => !window.ITEMS[r.output].type), 'the filter must not admit a typed output');
  }),

  () => tryRun('b227: the Cellar finally does something — buff duration via registerBuffScaler', () => {
    // The oldest item on the design backlog. getBonus('storage') was read by
    // NOTHING, so up to 17,200 gold bought literally zero. Repurposed with no
    // migration and no seam: registerBuffScaler was built in b222 for exactly
    // this second consumer.
    const H = window.HearthriseHomestead;
    assert(H && typeof H.cellarScale === 'function', 'the Cellar scaler is not published');
    const snap = snapshotG();
    try {
      window.G.plotBuildings = [];
      /* b456: `rooms` is server-of-record, so a raw `G.rooms = …` is UNKNOWN to
         every reader (fail-closed to the empty map) and this test would measure
         "no Cellar" three times over. stampRecordLikeLoad pushes the rung through
         the REAL hr_load path, which is also what a player's Cellar actually is. */
      window.G.rooms = {};
      stampRecordLikeLoad(window.G);
      assert(Math.abs(H.cellarScale().duration - 1) < 1e-9, 'no Cellar means no change to a buff');
      // Derived from the ladder so the magnitude retune cannot silently break
      // the wiring test — what is guarded is that the rung reaches the scaler.
      const rungs = window.ROOMS.cellar.levels;
      window.G.rooms = { cellar: 1 };
      stampRecordLikeLoad(window.G);
      assert(Math.abs(H.cellarScale().duration - (1 + rungs[0].bv)) < 1e-9,
        'Root Cellar should lengthen buffs by its rung value, got ' + H.cellarScale().duration);
      window.G.rooms = { cellar: 5 };
      stampRecordLikeLoad(window.G);
      assert(Math.abs(H.cellarScale().duration - (1 + rungs[4].bv)) < 1e-9,
        'The Deep Cellar should lengthen buffs by its rung value, got ' + H.cellarScale().duration);
      assert(rungs[4].bv > rungs[0].bv, 'the Cellar ladder must still climb');
      // H7: duration ONLY. Magnitude is the castle Tavern Hearth's lane, and
      // the Cellar touching it is how two pillars multiply into a second
      // character.
      assert(H.cellarScale().magnitude == null, 'the Cellar must never scale buff MAGNITUDE');
      // …and it is registered, so applyBuff actually sees it.
      const scaled = window.buffScaleFor({ type: 'x' });
      assert(scaled.duration >= 1 + rungs[4].bv - 1e-9,
        'the registered scaler should be in the composition, got ' + scaled.duration);
    } finally { restoreG(snap); }
  }),

  () => tryRun('b227: roomDescriptor is pure and answers owned / available / locked', () => {
    const H = window.HearthriseHomestead;
    assert(H && typeof H.roomDescriptor === 'function', 'roomDescriptor is not published');
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 2 };                  // farmstead
      window.G.rooms = { forge: 2 };
      predZero(); window.G.gold = 0;
      window.G.inventory = {};
      // b456: rooms + gold are server-of-record — stamp them through the real
      // record path or every read below fail-closes and the test measures nothing.
      stampRecordLikeLoad(window.G);

      const owned = H.roomDescriptor('forge');
      assert(owned.state === 'built' && owned.level === 2, 'the Forge should read as owned at level 2');
      assert(owned.currentName === 'Stone Forge', 'an owned room must name the rung it is on');
      assert(owned.ladder.length === 5, 'the FULL ladder always renders, owned rungs included');
      assert(owned.ladder[0].owned && owned.ladder[1].owned, 'rungs 1-2 should be marked owned');
      assert(owned.ladder[2].next === true, 'rung 3 is the next one');
      assert(owned.ladder[3].locked === true, 'rung 4 is tier-locked at a farmstead');
      assert(/Stonecross/.test(owned.ladder[3].gateReason || ''), 'a locked rung must SAY which property opens it');
      assert(owned.next && owned.next.affordable === false, 'a broke player cannot afford the next rung');
      assert(owned.next.missing.length > 0, 'and the descriptor must name what is short');

      const unbuilt = H.roomDescriptor('cellar');
      assert(unbuilt.state === 'unbuilt' && unbuilt.level === 0, 'the Cellar is legal but unbuilt at a farmstead');
      assert(unbuilt.lockReason === null, 'an available room has no lock reason');

      const locked = H.roomDescriptor('shrine');
      assert(locked.state === 'locked', 'the Shrine is a tier-4 room and must be locked at a farmstead');
      assert(/Ironvale/.test(locked.lockReason || ''), 'a locked room must name the property tier that opens it');

      // Purity: it renders nothing and mutates nothing.
      const before = JSON.stringify(window.G.rooms);
      H.roomDescriptor('forge'); H.roomDescriptor('shrine');
      assert(JSON.stringify(window.G.rooms) === before, 'roomDescriptor must not mutate state');
      // Total over every live room — no room may be undescribable.
      Object.keys(window.ROOMS).forEach((id) => {
        const d = H.roomDescriptor(id);
        assert(d && d.title && d.theme && d.flavour, id + ' has no complete descriptor');
        assert(d.ladder.length === window.ROOMS[id].levels.length, id + ' ladder length disagrees with its room');
      });
    } finally { restoreG(snap); }
  }),

  () => tryRun('b521: the Forge and Workshop rung-1 CARD names the proc it pays', () => {
    /* Designer ruling 1b. With the permission gate gone, the first rung has to
       SELL the room, and a player reads the ladder line before they ever feel a
       proc. So the copy and the payload are asserted together: the line the card
       shows for rung 1 must name the mechanic, and the rung must actually carry
       it. A rung whose copy promises an extra bar and whose bx is empty is the
       Scarecrow bug (b228) again — description and grant wrong in different
       directions, each looking fine on its own. */
    const H = window.HearthriseHomestead;
    assert(H && typeof H.roomDescriptor === 'function', 'roomDescriptor is not published');
    const CASES = [
      ['forge',    'yield_smithing', /extra bar/i,           'Extra bar'],
      ['workshop', 'craftSave',      /crafts cost nothing/i, 'Free crafts'],
    ];
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 5 };
      window.G.rooms = { forge: 1, workshop: 1 };
      stampRecordLikeLoad(window.G);
      CASES.forEach(([id, key, copyRe, label]) => {
        const d = H.roomDescriptor(id);
        const line = d.ladder[0].effects || '';
        assert(copyRe.test(line), id + ' rung 1 reads "' + line + '" — it must name the proc it pays');
        assert(/1%/.test(line), id + ' rung 1 must state the 1% magnitude, reads "' + line + '"');
        const rung = window.ROOMS[id].levels[0];
        assert(rung.bx && Math.abs(rung.bx[key] - 0.01) < 1e-9,
          id + ' rung 1 promises the proc in copy but grants ' + ((rung.bx || {})[key]) + ' of ' + key);
        // And the owned-room panel shows it as a live effect, by its label.
        assert((d.now || []).some((e) => e.label === label),
          id + ' at rung 1 does not list "' + label + '" among what the room does right now');
      });
      // The ladder climbs 1/2/4/6/8 in the copy too, so no rung reads as a
      // downgrade of the one below it.
      CASES.forEach(([id]) => {
        const pcts = window.ROOMS[id].levels.map((r, i) => {
          const m = /·\s*(\d+)%/.exec(r.bonus || '');
          assert(m, id + ' L' + (i + 1) + ' states no proc percentage: "' + r.bonus + '"');
          return Number(m[1]);
        });
        assert(pcts.join(',') === '1,2,4,6,8', id + ' proc copy ladders ' + pcts.join('/') + ', expected 1/2/4/6/8');
      });
    } finally { restoreG(snap); }
  }),

  () => tryRun('b227: every room opens a themed modal through the shared seam', () => {
    const H = window.HearthriseHomestead;
    if (!H || typeof H.modalDescriptor !== 'function' || !window.HearthriseRoomModal) return;
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 3 };
      window.G.rooms = { forge: 2, kitchen: 5 };
      stampRecordLikeLoad(window.G);   // b456: rooms are server-of-record
      const themes = {};
      Object.keys(window.ROOMS).forEach((id) => {
        const m = H.modalDescriptor(id);
        assert(m && m.title && m.theme, id + ' produced no modal descriptor');
        assert(typeof m.onAction === 'function', id + ' modal must handle its own actions');
        assert(/^<svg/.test(m.scene || ''), id + ' modal needs a scene');
        // The seam's published grammar, and nothing outside it.
        const kinds = m.sections.map((s) => s.kind);
        kinds.forEach((k) => assert(['note', 'meter', 'rows', 'ladder', 'actions', 'field'].indexOf(k) >= 0,
          id + ' used a section kind the seam does not define: ' + k));
        assert(kinds.indexOf('ladder') >= 0, id + ' modal must show its ladder');
        const ladder = m.sections.find((s) => s.kind === 'ladder');
        assert(ladder.rows.length === 5, id + ' modal ladder must show all five rungs');
        themes[m.theme] = (themes[m.theme] || 0) + 1;
      });
      // Themes are homestead vocabulary, never the castle's.
      Object.keys(themes).forEach((t) => {
        assert(['hearth', 'garden', 'workshop', 'cellar', 'forge', 'library', 'shrine', 'trophy'].indexOf(t) >= 0,
          'unexpected room theme "' + t + '" — homestead themes only');
      });

      // An owned rung shows no price (you already paid it) and says so.
      const maxed = H.modalDescriptor('kitchen');
      const kl = maxed.sections.find((s) => s.kind === 'ladder');
      assert(kl.rows.every((r) => r.costs === null), 'a fully owned ladder must show no prices');
      assert(/Built/.test(kl.rows[0].effect), 'an owned rung must be marked built');
      assert(!maxed.sections.some((s) => s.kind === 'actions' && s.buttons.some((b) => /^Build|^Upgrade/.test(b.label))),
        'a maxed room must offer no upgrade button');

      // A disabled action always carries a reason (spec §5 rule 5).
      predZero(); window.G.gold = 0; window.G.inventory = {};
      stampRecordLikeLoad(window.G);   // b456: the zeroed gold must be KNOWN-zero, not UNKNOWN
      const poor = H.modalDescriptor('forge');
      const acts = poor.sections.find((s) => s.kind === 'actions');
      const up = acts.buttons.find((b) => /^Upgrade|^Build/.test(b.label));
      assert(up && up.disabled && /Missing/.test(up.why || ''),
        'an unaffordable upgrade must be disabled AND name what is short');

      // It really opens, and really closes.
      H.openRoom('forge');
      assert(window.HearthriseRoomModal.isOpen(), 'the room modal did not open');
      assert(document.querySelector('.hr-room-wrap[data-room-theme="forge"]'), 'the theme did not reach the DOM');
      window.HearthriseRoomModal.close();
      assert(!window.HearthriseRoomModal.isOpen(), 'the room modal did not close');
    } finally { restoreG(snap); window.HearthriseRoomModal.close(); }
  }),

  /* ── b355 · THE INVISIBLE BLUEPRINT ──────────────────────────────────────
     Tyler, live, on the Kitchen room modal: "this doesn't tell me anywhere it
     requires a blueprint or how to get a blueprint. that should be made way
     more obvious."

     He could afford Iron Stove — gold and logs both green — so the pinned
     Build button was lit and PRIMARY. Clicking it produced a toast and no
     stove. The requirement existed only inside upgradeRoom, so no surface
     could state it and the view actively disagreed with the authority about
     whether the action was possible.

     These three tests are the contract: the gate is DATA on the descriptor,
     it REACHES the DOM with the item's name, its held state and its real
     source, and the button is dead-with-a-reason rather than lit-and-lying. */
  () => tryRun('b355: an item-gated rung states the blueprint, its state and its source', () => {
    const H = window.HearthriseHomestead;
    if (!H || typeof H.modalDescriptor !== 'function' || !window.HearthriseRoomModal) return;
    if (typeof window.roomRungItemGate !== 'function') { assert(false, 'roomRungItemGate must be published'); return; }
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 3 };
      window.G.rooms = { kitchen: 1 };
      window.G.gold = 999999;
      // b456: gold AND rooms are both server-of-record now — one stamp, real path.
      stampRecordLikeLoad(window.G);    // armed: `affordable` reads gold via canAfford, the rung via roomsOf
      window.G.inventory = { normal_log: 999, oak_log: 999 };

      // ── the descriptor carries it, on the rung AND on `next`
      const d = H.roomDescriptor('kitchen');
      const rung2 = d.ladder[1];
      assert(rung2.gates && rung2.gates.length === 1, 'kitchen rung 2 must carry exactly one item gate');
      assert(rung2.gates[0].id === 'kitchen_blueprint_t2', 'the gate must be the Kitchen Blueprint II');
      assert(rung2.gates[0].ok === false, 'with an empty bag the gate must be unmet');
      assert(rung2.gates[0].source, 'the gate must know where the blueprint comes from');
      assert(/Crypt of Bones/.test(rung2.gates[0].source),
        'the source must come from the real loot table, got: ' + rung2.gates[0].source);
      assert(d.ladder[0].gates.length === 0, 'rung 1 has no blueprint and must claim none');

      /* THE BUG ITSELF: affordable said yes while upgradeRoom said no. */
      assert(d.next.affordable === false,
        'a rung missing its blueprint is NOT affordable, however much gold you hold');
      assert(window.upgradeRoom('kitchen') === false && (window.G.rooms.kitchen === 1),
        'the authority must still refuse — and the view must agree with it');

      // ── it reaches the DOM, in the ladder, with name + state + source
      H.openRoom('kitchen');
      const gates = document.querySelectorAll('.hr-room-body .hr-room-gate');
      assert(gates.length >= 1, 'the ladder must render a requirement line for the gated rung');
      const txt = [].map.call(gates, (g) => g.textContent).join(' | ');
      assert(/Kitchen Blueprint II/.test(txt), 'the requirement line must NAME the item: ' + txt);
      assert(/You have none/.test(txt), 'it must say whether you hold one');
      assert(/Crypt of Bones/.test(txt), 'it must say where one comes from');
      const need = document.querySelector('.hr-room-body .hr-room-gate.is-need');
      assert(need, 'an unheld gate must be marked as needed, not styled like a met cost');

      // ── holding one flips the same line, and unblocks the rung
      window.G.inventory.kitchen_blueprint_t2 = 1;
      window.HearthriseRoomModal.refresh();
      assert(document.querySelector('.hr-room-body .hr-room-gate.is-met'), 'holding the blueprint must show as met');
      assert(/In your bags/.test(document.querySelector('.hr-room-body .hr-room-gate.is-met').textContent),
        'a held blueprint must say so in words');
      assert(H.roomDescriptor('kitchen').next.affordable === true,
        'with the blueprint and the cost in hand the rung must be buildable');

      // ── an OWNED rung keeps the requirement visible, marked spent, so the
      //    ladder teaches the pattern before you hit the rung you cannot pay.
      window.G.rooms = { kitchen: 3 };
      stampRecordLikeLoad(window.G);   // b456: the new rung must come off the record, not the blob
      window.HearthriseRoomModal.refresh();
      assert(document.querySelector('.hr-room-body .hr-room-gate.is-spent'),
        'a built gated rung must still show its requirement, marked spent');
    } finally { restoreG(snap); window.HearthriseRoomModal && window.HearthriseRoomModal.close(); }
  }),

  () => tryRun('b355: the pinned Build bar says WHY it is blocked — never a toast', () => {
    const H = window.HearthriseHomestead;
    if (!H || !window.HearthriseRoomModal) return;
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 3 };
      window.G.rooms = { kitchen: 1 };
      window.G.gold = 999999;
      stampRecordLikeLoad(window.G);    // b456: modalDescriptor reads gold via canAfford AND the rung via roomsOf
      window.G.inventory = { normal_log: 999 };

      const m = H.modalDescriptor('kitchen');
      const acts = m.sections.find((s) => s.kind === 'actions');
      const btn = acts.buttons.find((b) => /^Upgrade|^Build/.test(b.label));
      assert(btn && btn.pin, 'the Build control must still be the pinned one');
      assert(btn.disabled, 'a blueprint-gated Build button must be disabled, not lit');
      assert(/Kitchen Blueprint II/.test(btn.why || ''), 'the button must name the gate: ' + btn.why);
      assert(btn.gates && btn.gates.length === 1, 'the pinned control must carry the gate as data');

      H.openRoom('kitchen');
      const bar = document.querySelector('.hr-room-build');
      assert(bar, 'the pinned build bar must exist');
      assert(/Kitchen Blueprint II/.test(bar.textContent), 'the BAR must name the gate, not a toast');
      assert(/Crypt of Bones/.test(bar.textContent), 'the bar must say where to get one');
      assert(bar.querySelector('.hr-room-gate.is-need'), 'the bar gate must render in its unmet state');
      assert(bar.querySelector('button[disabled]'), 'the bar button must be dead while the gate is unmet');
      assert(/Kitchen Blueprint II/.test(bar.querySelector('button[disabled]').getAttribute('title') || ''),
        'the reason must survive on the button hover too');
      /* Said ONCE. A bar that prints "Needs Kitchen Blueprint II" above a block
         saying "Kitchen Blueprint II — you have none" reads as a rendering
         fault, which is the same standard the House card already holds. */
      assert((bar.textContent.match(/Kitchen Blueprint II/g) || []).length === 1,
        'the gate must be stated once in the bar, not twice');
      /* The whole point of the pin: this is ABOVE the scroll container. */
      assert(!bar.closest('.hr-room-body'), 'the build bar must never be inside the scrolling body');

      /* Two blockers at once must name BOTH — fixing the one you were told
         about only to find the button still dead is the same bug again. */
      predZero(); window.G.gold = 0;
      /* b456 ⚠ stampRecordLikeLoad, NOT stampBalanceLikeLoad. applyRecord replaces
         `G._record` WHOLESALE, so a balance-only re-stamp here silently drops the
         Kitchen rung out of `known` — the room reverts to UNKNOWN/level 0, the
         pinned control becomes "Build" instead of "Upgrade", and the assertion
         below stops finding a button at all. Measured exactly that way. */
      stampRecordLikeLoad(window.G);    // armed: the shortfall line must read a KNOWN 0, not UNKNOWN
      const both = H.modalDescriptor('kitchen');
      const b2 = both.sections.find((s) => s.kind === 'actions').buttons.find((b) => /^Upgrade/.test(b.label));
      assert(/Kitchen Blueprint II/.test(b2.why) && /Missing/.test(b2.why),
        'both the gate and the shortfall must be named: ' + b2.why);
    } finally { restoreG(snap); window.HearthriseRoomModal && window.HearthriseRoomModal.close(); }
  }),

  () => tryRun('b355: dungeon loot and the Quartermaster are real sources in the item index', () => {
    /* The gate line refuses to invent prose, so an item the reverse index has
       no route for would show a bare name. Blueprints are dungeon-only, and
       the index knew nothing about dungeons — that emptiness is exactly why
       the old toast hardcoded "they drop from dungeons". */
    if (typeof window.itemSourceLine !== 'function') return;
    const bp = window.itemSourceLine('kitchen_blueprint_t2');
    assert(/Crypt of Bones/.test(bp), 'a blueprint must name the dungeon it drops in: ' + bp);
    assert(/Quartermaster/.test(bp) && /55/.test(bp), 'the deterministic scrip route must be named too: ' + bp);
    // Nothing the index already answered may regress.
    assert(/Dropped by/.test(window.itemSourceLine('big_bones') || ''), 'monster drops must still resolve');
  }),
];
