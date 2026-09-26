// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/market-night-and-prices.js — the market gesture, the return ritual, the Hearthfind, retreat and the price catalogue.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 76 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, stampBalanceLikeLoad, stampRecordLikeLoad, withServerBacked, awaySpan, awayGatherSpan, awayArtisanSpan, applyAwayEnvelope, xpOf, predZero, goldOf, snapshotG, setAway, drain, restoreAccrualSwitch, seedPlayStreak, restoreG, restoreGAndRecord, nightWorld, retreatFixture, retreatReload, restoreBankCap, hfPoll, on, snapshot, decideRestore } from './_harness.js?v=554';

export default [

  /* ══════════════════════════════════════════════════════════════════════
     b354 ROUND 2 — SECURITY'S FINDINGS, EACH WITH ITS OWN GUARD.

     The envelope arithmetic survived their attack. THE LIFECYCLE DID NOT: three
     paths left a prediction that nothing would ever retire, and because
     `reconcilePredictions` re-adds every outstanding entry to every envelope,
     an orphan is a PERMANENT additive offset rather than a moment of
     inaccuracy. F1 is guarded in B354-9 above; these are the other three exits
     plus the two fields the accounting did not reach.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRunAsync('B354-10/11/12/13: every exit accounts for its prediction, and gems are one of them', async () => {
    const A = window.HearthriseAccrual;
    const Gd = window.HearthriseGold;
    const G = window.G;
    const D = window.HearthriseDaily;
    const realFetch = window.fetch;
    const wasOn = A.isServerAccrualEnabled();
    const wasAck = A.isReplacementAcknowledged();
    const save = { gold: G.gold, gems: G.gems, streak: G.streak, dailyReward: G.dailyReward,
      lockedItems: G.lockedItems,
      skills: JSON.parse(JSON.stringify(G.skills)), inventory: JSON.parse(JSON.stringify(G.inventory)) };
    const envelope = (gold, gems, version) => {
      const skills = {}; for (const k of Object.keys(G.skills || {})) skills[k] = { xp: G.skills[k] };
      return { ok: true, version, now: Date.now(),
        state: { gold, gems, active_kind: 'idle', active_id: null, accrued_to: null },
        skills, inventory: Object.assign({}, G.inventory) };
    };
    try {
      A.setServerAccrualEnabled(true);
      A.acknowledgeReplacement(true);
      Gd.configureGold({ url: 'https://probe.supabase.co', apiKey: 'anon', authToken: () => 'jwt' });
      G.lockedItems = {};

      /* ── B354-10 — F2: TWO IN FLIGHT, ANSWERED OUT OF ORDER ───────────────
         Both calls are real and both are answered; the SECOND answer carries the
         OLDER version, which is exactly what two overlapping requests produce.
         The stale branch used to just `return`, leaving that call's prediction
         outstanding forever — and it had already been CARRIED onto the newer
         envelope, so the amount was sitting in G.gold with nothing left to take
         it out. MUTATION: drop the `rollbackPrediction` on the stale return → RED. */
      Gd.resetGold();
      G.gold = 1000; G.gems = 0; G.inventory = { normal_log: 50 };
      let order = 0;
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        order++;
        /* First call answers with version 9, second with version 5 — the older
           one arriving last. Both state the same absolute gold. */
        const v = order === 1 ? 9 : 5;
        return Promise.resolve(new Response(JSON.stringify(envelope(50000, 0, v)), { status: 200 }));
      };
      window.invSellOne('normal_log');
      await drain();
      window.invSellOne('normal_log');
      await drain();
      assert(G.gold === 50000,
        'TWO ANSWERS OUT OF ORDER LEFT ' + G.gold + ' AGAINST A SERVER SAYING 50000. The older '
        + 'envelope is correctly ignored for its NUMBERS, but the call it answers is over — its '
        + 'prediction was already carried onto the newer envelope and must come back off. Returning '
        + 'early there leaves a permanent offset (F2).');
      assert(Gd.getGoldState().pending.length === 0,
        'a prediction survived both answers: ' + JSON.stringify(Gd.getGoldState().pending));

      /* ── B354-11 — F3: THE REPLACEMENT GATE, DISMISSED, THEN ACKNOWLEDGED ──
         A destructive envelope with no acknowledgement writes NOTHING and shows a
         sheet. The call is still over. Leaving the entry INFLIGHT makes it
         immortal for every player who dismisses that sheet.
         MUTATION: remove `abandonPrediction(ownKey)` from the gate branch → RED. */
      Gd.resetGold();
      A.acknowledgeReplacement(false);
      try { A.hideReplacementSheet(); } catch (e) {}
      G.gold = 100000; G.inventory = { normal_log: 50 };
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        /* Server gold FAR below local ⇒ destructive ⇒ the gate refuses. */
        return Promise.resolve(new Response(JSON.stringify(envelope(1, 0, 20)), { status: 200 }));
      };
      window.invSellOne('normal_log');
      await drain();
      const gated = Gd.getGoldState();
      assert(gated.pending.length === 1 && gated.inflight === 0 && gated.abandoned === 1,
        'the replacement gate refused the envelope and left the prediction INFLIGHT ('
        + JSON.stringify(gated.pending) + '). No second envelope is coming for that key, so it is '
        + 'carried onto every future envelope for the rest of the session — F1 wearing a consent '
        + 'dialog (F3).');
      try { A.hideReplacementSheet(); } catch (e) {}

      /* ⚠ AND ASSERTED AGAIN, DIRECTLY, BECAUSE THE GESTURE-LEVEL CHECK ABOVE
         CANNOT SEE IT. Mutation run: deleting `abandonPrediction(ownKey)` from
         the gate branch SLIPPED. `settleVerdict` reads a null return from the
         applier as "nothing was written" and abandons there too, so through the
         transport the two defences are indistinguishable — and the day the
         transport's shape changes, the gate is the only one left. The sheet's
         own re-apply callback and any future direct caller reach
         `applyGoldEnvelope` WITHOUT going through settleVerdict, which is
         exactly the path this covers. Same failure the kill-switch check had in
         B354-5, same fix: drive the function, not the gesture. */
      Gd.resetGold();
      A.acknowledgeReplacement(false);
      G.gold = 100000;
      const gk = Gd.newIntentKey();
      Gd.settle(G, 250, 'vendor.sell_one', gk);
      const refused = Gd.applyGoldEnvelope(G, envelope(1, 0, 21), gk);
      try { A.hideReplacementSheet(); } catch (e) {}
      assert(refused === null, 'B354-11-CONTROL: the replacement gate did NOT refuse a destructive '
        + 'envelope (' + JSON.stringify(refused) + '), so this assertion has no subject');
      const direct = Gd.getGoldState();
      assert(direct.inflight === 0 && direct.abandoned === 1,
        'applyGoldEnvelope returned from the replacement gate without accounting for THIS call\'s '
        + 'prediction (' + JSON.stringify(direct.pending) + '). Every exit from that function must '
        + 'account for `ownKey`; the gate is the one that looks like an early return rather than '
        + 'like an answer (F3).');
      A.acknowledgeReplacement(true);

      /* And once acknowledged, the next envelope drops it and gold is the server's. */
      A.acknowledgeReplacement(true);
      G.inventory = { normal_log: 50 };
      window.invSellOne('normal_log');
      await drain();
      assert(G.gold === 1 && Gd.getGoldState().pending.length === 0,
        'after acknowledgement gold is ' + G.gold + ' with ' + Gd.getGoldState().pending.length
        + ' prediction(s) left — expected the server\'s 1 and none');

      /* ── B354-12 — F4: AN AWAY ENVELOPE MUST ACCOUNT FOR GOLD PREDICTIONS ──
         accrue.js and activity.js write `G.gold` absolutely through
         `applyEnvelopeState` and have never heard of this ledger. Before the
         shared seam an outstanding prediction survived their envelope untouched
         and was re-added on top of the NEXT gold envelope — the same offset,
         reached from a module that does not import gold.js.
         Driven through the REAL accrue applier, not a stub.
         MUTATION: delete the `predictionSeam` call in applyEnvelopeState → RED. */
      Gd.resetGold();
      G.gold = 1000;
      const k = Gd.newIntentKey();
      Gd.settle(G, 500, 'vendor.sell_one', k);
      assert(G.gold === 1500 && Gd.getGoldState().pending.length === 1,
        'B354-12-CONTROL: the prediction was not recorded, so the assertion below proves nothing');
      A.applyEnvelopeState(G, envelope(9000, 0, 30));
      assert(G.gold === 9500,
        'an ACCRUAL envelope left gold at ' + G.gold + '. It writes 9000 absolutely and the one '
        + 'genuinely-outstanding prediction (+500) is carried on top — 9500. Anything else means '
        + 'the away path and the gold path have two different ideas of the ledger (F4).');
      Gd.abandonPrediction(k);
      A.applyEnvelopeState(G, envelope(9000, 0, 31));
      assert(G.gold === 9000 && Gd.getGoldState().pending.length === 0,
        'an ACCRUAL envelope did not DROP an abandoned prediction (gold ' + G.gold + ', pending '
        + JSON.stringify(Gd.getGoldState().pending) + ') — the sweep has to run for every envelope, '
        + 'not only for the gold verbs');

      /* ── B354-13 — F5: GEMS GET THE SAME TREATMENT AS GOLD ────────────────
         The daily claim pays both. The gem half used to be a bare `G.gems +=`
         next to the seam call: no prediction, no reconcile, so two tabs claiming
         the same UTC day paid gems twice locally while the server refused the
         second claim under a lock.
         MUTATION: put `G.gems = (G.gems||0) + rw.gems` back in daily-reward → RED. */
      Gd.resetGold();
      A.acknowledgeReplacement(true);
      seedPlayStreak(7);
      G.dailyReward = { lastClaimDay: 0 };
      G.gold = 0; G.gems = 0;
      const rw = D.rewardFor(G);
      assert(rw && rw.gems > 0,
        'B354-13-CONTROL: day ' + D.cycleDay(G) + ' of the cycle pays no gems, so the gem half of '
        + 'this test has no subject. Pick a day that does.');
      let claims = 0;
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        claims++;
        /* TAB TWO. The server pays the day ONCE: the first claim is honoured and
           the second is `not_claimable`, refused under the character lock, with
           the same absolute state either way. */
        if (claims === 1) {
          return Promise.resolve(new Response(JSON.stringify(
            Object.assign(envelope(rw.gold, rw.gems, 40),
              { granted: { kind: 'daily', key: 'login', gold: rw.gold, gems: rw.gems } })
          ), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify(
          Object.assign(envelope(rw.gold, rw.gems, 41), { ok: false, error: 'not_claimable', stage: 'claim' })
        ), { status: 409 }));
      };
      D.claim(G);
      await drain();
      G.dailyReward.lastClaimDay = 0;    // the second tab has not seen the first tab's cache
      D.claim(G);
      await drain();
      assert(G.gems === rw.gems,
        'TWO TABS CLAIMED THE SAME DAY AND THE PLAYER HOLDS ' + G.gems + ' GEMS; the server paid '
        + rw.gems + ' and refused the second claim under a lock. Gems are a real currency with a '
        + '5,000/day server ceiling.');
      assert(G.gold === rw.gold, 'the same double-claim moved gold to ' + G.gold + ', expected ' + rw.gold);
      assert(Gd.getGoldState().pending.length === 0,
        'the double claim left predictions behind: ' + JSON.stringify(Gd.getGoldState().pending));

      /* ⚠ AND THE ASSERTION THAT ACTUALLY DISTINGUISHES IT. Mutation run: putting
         the bare `G.gems += rw.gems` back SLIPPED against the two-tab check
         above, and the reason is worth more than the check — F4's shared seam
         reconciles gems ABSOLUTELY on every envelope, so an unpredicted gem
         payment converges to server truth anyway. It flickers; it does not
         double.

         What it genuinely costs is the CARRY. An envelope that arrives while a
         claim is still in flight predates that claim and cannot describe it, so
         a predicted payment is re-added on top and an unpredicted one is simply
         ERASED — the player watches their gems vanish and reappear, or not
         reappear at all if the claim is the thing that never answers. So: hold
         the claim open (a fetch that never settles), land an unrelated away
         envelope stating zero gems, and require the in-flight gems to survive.
         MUTATION: bare `G.gems +=` in daily-reward.js → RED here. */
      Gd.resetGold();
      G.dailyReward = { lastClaimDay: 0 };
      G.gold = 0; G.gems = 0;
      window.fetch = function (u) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        return new Promise(function () {});          // in flight, forever
      };
      D.claim(G);
      await drain();
      assert(G.gems === rw.gems && Gd.getGoldState().inflight === 1,
        'B354-13-CONTROL: the held-open claim did not leave ONE in-flight prediction paying '
        + rw.gems + ' gems (gems ' + G.gems + ', state '
        + JSON.stringify(Gd.getGoldState().pending) + ')');
      A.applyEnvelopeState(G, envelope(4242, 0, 50));
      assert(G.gems === rw.gems,
        'AN UNRELATED ENVELOPE ERASED ' + rw.gems + ' IN-FLIGHT GEMS (now ' + G.gems + '). The gem '
        + 'half of the claim was paid locally with no prediction, so the shared seam had nothing to '
        + 'carry and wrote the server\'s zero straight over it. Gold in the same gesture survives, '
        + 'which is the tell: one gesture with two lifecycles (F5).');
      assert(G.gold === 4242 + (rw.gold || 0),
        'B354-13-CONTROL: gold did not carry either (' + G.gold + ') — then the gems assertion '
        + 'above is measuring the carry being broken for everything, not for gems');

      /* ── F7: A 5xx IS NOT PROOF OF NON-WRITE ──────────────────────────────
         The rollback set used to be "answered, no envelope", which swept in a
         500 and a malformed 200. Neither is proof the apply did not happen: a
         502 from the edge AFTER `hr_apply` committed describes a sale that
         REALLY HAPPENED, and reversing it hands the player their gold back for
         an item the server has already taken — a mint, from the function
         written to prevent one. Those two ABANDON instead.
         MUTATION: put 'unavailable' back in PROVABLY_UNWRITTEN → RED. */
      Gd.resetGold();
      A.acknowledgeReplacement(true);
      G.gold = 1000; G.inventory = { normal_log: 50 }; G.lockedItems = {};
      const bid = window.vendorPrice('normal_log');
      assert(bid > 0, 'B354-F7-CONTROL: normal_log has no vendor bid, so nothing would move');
      window.fetch = function (u) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'server_error' }), { status: 500 }));
      };
      window.invSellOne('normal_log');
      await drain();
      assert(G.gold === 1000 + bid,
        'A 500 REVERSED THE SALE (gold ' + G.gold + ', expected ' + (1000 + bid) + '). A 5xx after '
        + '`hr_apply` committed describes a sale that HAPPENED; taking the gold back while the '
        + 'server keeps the item is a loss, and on a PURCHASE the same rule refunds gold for goods '
        + 'already delivered — a mint (F7).');
      const after5xx = Gd.getGoldState();
      assert(after5xx.abandoned === 1 && after5xx.inflight === 0,
        'the 5xx left the prediction INFLIGHT instead of abandoned: ' + JSON.stringify(after5xx.pending));
      /* CONTROL — a 400 IS provably unwritten and MUST reverse, or the check
         above would pass simply because rollback had been switched off. */
      G.gold = 2000; G.inventory = { normal_log: 50 };
      window.fetch = function (u) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'bad_qty' }), { status: 400 }));
      };
      window.invSellOne('normal_log');
      await drain();
      assert(G.gold === 2000,
        'B354-F7-CONTROL: a 400 did NOT reverse the prediction (gold ' + G.gold + ') — rollback has '
        + 'been disabled wholesale, so the 5xx assertion above proves nothing');

      /* ── F8: A NON-FINITE AMOUNT IS REFUSED, NOT RECORDED ─────────────────
         `Number(x) || 0` maps NaN to 0 and lets Infinity straight through; one
         Infinity in the ledger turns every later sum into NaN, after which every
         gold comparison in the game silently answers false. */
      Gd.resetGold();
      G.gold = 100;
      Gd.settle(G, Infinity, 'vendor.sell_one', Gd.newIntentKey());
      Gd.settle(G, NaN, 'vendor.sell_one', Gd.newIntentKey());
      assert(G.gold === 100 && Number.isFinite(Gd.predictedGold()),
        'a non-finite amount reached the balance or the ledger (gold ' + G.gold + ', predicted '
        + Gd.predictedGold() + ') — from here every comparison against gold answers false (F8)');
    } finally {
      window.fetch = realFetch;
      try { A.hideReplacementSheet(); } catch (e) {}
      Gd.resetGold(); Gd.configureGold(null);
      A.acknowledgeReplacement(wasAck);
      restoreAccrualSwitch(wasOn);
      Object.assign(G, save);
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b343 — AWAY COMBAT PAYS FROM KILL ONE, AND EVERY SURFACE SAYS WHAT IT PAYS

     b341/b342 gated away combat behind 100 hand-landed kills (the "Field
     Licence") and shipped twelve tests asserting that the gate and its copy
     RENDER. Tyler's ruling removed the gate: "I think we just needed to make
     it a quest and get rid of the license shit it's way too confusing."

     These tests are those tests, rewritten rather than deleted — a test
     deleted to unblock a removal is how the honesty bug that started all of
     this shipped in the first place. Each one now guards what REPLACED the
     behaviour it used to guard:

       AWAY-HONEST-1  no precondition: an 8h absence at ZERO kills pays, field
                      by field, and leaves no gate residue on the receipt
       AWAY-HONEST-2  the caller applies no modifier either — processOffline's
                      span is byte-identical to the direct simulation at both
                      ends of the kill range the gate used to split
       AWAY-HONEST-3  a rate is only quoted over a span you can survive, and
                      the Away line names the thing that really ends the night
       AWAY-HONEST-4  gathering banks the whole absence, from kill zero
       AWAY-HONEST-5  the FTUE promises exactly what the engine delivers
       AWAY-SCOPE-1   `AWAY_SCOPE` is still the frozen table, and no gate
                      module has come back by any name
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRun('AWAY-HONEST-1: away combat pays from kill ONE — the engine takes no lifetime-kill input at all', () => {
    /* b343's bug was a PRECONDITION: an away span was refused until the
       character had N lifetime kills, so the players who most needed overnight
       progress were the ones who got none. The old test drove
       `window.processOffline()` at 0 lifetime kills and asserted kills/gold/XP
       all moved.

       b515 deleted that caller's local engine, so the assertion has to move to
       the engine itself — which turns out to be the STRONGER form of the same
       property. A precondition can only exist if the simulation can SEE the
       lifetime count, so the contract is stated as an identity: the same seed,
       the same span, the same state except `stats.kills`, must pay BYTE-
       IDENTICALLY at 0, at 99 and at 500. That is unfalsifiable by a "> 0"
       assertion and it catches an ATTENUATION (half rate under N) as well as a
       gate, which the original could not.

       MUTATION: add `if ((state.stats.kills||0) < 100) return emptySpan;` — or
       any rate term reading it — to simulateSpan → red on the first mismatch.
       The `licence` module's absence is AWAY-SCOPE-1's subject and stays there. */
    const at0 = awaySpan({ state: { stats: { kills: 0, crits: 0, deaths: 0, rareDrops: 0 } } });
    assert(at0.paid.kills > 0 && at0.paid.gold > 0 && Object.keys(at0.paid.xp).length > 0,
      'THE b343 BUG: an away combat span at 0 lifetime kills paid nothing — ' + JSON.stringify(at0.paid));

    const fingerprint = (r) => JSON.stringify({
      kills: r.paid.kills, gold: r.paid.gold, xp: r.paid.xp, items: r.paid.items,
      ticks: r.out.ticks, survivedMs: r.out.survivedMs, died: r.out.died,
    });
    const base = fingerprint(at0);
    [99, 100, 500].forEach((k) => {
      const r = awaySpan({ state: { stats: { kills: k, crits: 0, deaths: 0, rareDrops: 0 } } });
      assert(fingerprint(r) === base,
        'a span paid DIFFERENTLY at ' + k + ' lifetime kills than at 0 — the engine is reading the '
        + 'lifetime count, which is either a gate or an attenuation, and b343 is back.\n  at 0:  '
        + base + '\n  at ' + k + ': ' + fingerprint(r));
    });

    /* AND THE RECEIPT CARRIES NO GATE. `summaryFromAway` is the ONE translator
       from the server's away payload to the welcome-back card now, so it is
       where a resurrected verdict would have to surface. A stale `licence`
       block would be read by nothing today; its presence is how a removed
       feature comes back, because the next author sees the field and rebuilds
       the branch that reads it. */
    const A = window.HearthriseAccrual;
    assert(A && typeof A.summaryFromAway === 'function',
      'accrue.js must export summaryFromAway — it is the only path from the server payload to the card');
    const rec = A.summaryFromAway({ grantMs: 3600000, kills: at0.paid.kills, gold: at0.paid.gold,
      xp: at0.paid.xp, items: at0.paid.items }, { version: 1 });
    assert(rec && rec.gainedKills === at0.paid.kills && rec.hrs > 0,
      'the receipt reports a night that paid nothing while the payload says otherwise: ' + JSON.stringify(rec));
    assert(!('licence' in rec),
      'the receipt still carries the retired gate verdict: ' + JSON.stringify(rec.licence));
    assert(!window.G._awayLicence, 'the retired gate is still publishing its scratch field');
  }),

  () => tryRunAsync('AWAY-HONEST-2: the CALLER applies nothing it was not told — the receipt is the envelope, field for field', async () => {
    /* WHAT THIS TEST WAS. "A seeded span through processOffline equals the
       direct simulation, at 0 kills and at 500" — because the removed b343 gate
       lived at the CALLER, so the caller is where a residue of it would hide.

       WHAT THE CALLER IS NOW. b515 deleted processOffline's local engine. The
       caller that turns an absence into a receipt is `applyEnvelope`, and the
       identical class of defect is available to it: a caller that ADDS to, or
       infers around, what the server stated. That is not hypothetical here —
       b361 shipped a receipt whose only label came from `source === 'switch'`
       and told every live settle it had been away all night.

       So the property is restated for the caller that exists: apply an envelope
       carrying a known `away` block, and the receipt on G must equal
       `summaryFromAway` of that block EXACTLY. Nothing added, nothing dropped,
       nothing recomputed locally.
       MUTATION: make applyEnvelope massage any away field before the call (e.g.
       `away.kills = away.kills || G.stats.kills`) → red on the deep compare. */
    const A = window.HearthriseAccrual;
    const G = window.G;
    const snap = snapshotG();
    const wasAck = A.isReplacementAcknowledged();
    try {
      A.acknowledgeReplacement(true);
      /* A REAL span, not a hand-written one: the numbers on the envelope are
         what the SERVER's copy of this engine would have produced, so the
         fixture cannot drift from the thing it stands for. */
      const r = awaySpan({ spanMs: 2 * 3600000 });
      assert(r.paid.kills > 0, 'the fixture simulated nothing — the comparison below would be vacuous');
      const away = {
        grantMs: 2 * 3600000, kills: r.paid.kills, crits: r.out.crits || 0,
        gold: r.paid.gold, xp: r.paid.xp, items: r.paid.items,
        died: false, capped: false, blessed: false,
        windowFrom: r.out.fromMs || null, windowTo: r.out.toMs || null,
      };
      const skills = {}; for (const k of Object.keys(G.skills || {})) skills[k] = { xp: G.skills[k] };
      const env = { ok: true, accrued: true, version: 9001, now: new Date().toISOString(),
        state: { slot: 0, gold: G.gold, active_kind: 'idle', active_id: null },
        skills, inventory: Object.assign({}, G.inventory), away };

      const expected = A.summaryFromAway(away, env);
      const written = A.applyEnvelope(G, env);
      assert(written, 'the envelope was refused, so there is no receipt to compare');
      const got = G.lastOfflineSummary;
      assert(got, 'applyEnvelope wrote no welcome-back receipt at all');

      /* `at` is a timestamp taken inside the translator, so the two calls
         legitimately differ by a millisecond; every other field must match. */
      const strip = (o) => { const c = Object.assign({}, o); delete c.at; return c; };
      assert(JSON.stringify(strip(got)) === JSON.stringify(strip(expected)),
        'the caller did not apply the envelope verbatim — it added, dropped or recomputed a field.\n'
        + '  server said: ' + JSON.stringify(strip(expected)) + '\n'
        + '  receipt is:  ' + JSON.stringify(strip(got)));
      assert(got.serverAuthoritative === true,
        'the receipt does not label itself server-stated — a screenshot and a bug report can no longer '
        + 'tell a server receipt from a locally-computed one');
      /* AND THE PAYOUT IS THE SERVER'S, ABSOLUTELY. The away block names a gold
         figure; the STATE names the balance. A caller that added the away gold
         to the state gold would pay twice for one night. */
      assert(G.gold === env.state.gold,
        'the caller added the away payload to the absolute balance: gold is ' + G.gold + ', the server '
        + 'said ' + env.state.gold + ' — that is the b354 double-pay shape, one settle at a time');
    } finally {
      A.acknowledgeReplacement(wasAck);
      restoreGAndRecord(snap);
    }
  }),

  () => tryRun('AWAY-BUDGET-1: an absence is paid ONCE and the next one still gets the whole cap — from kill zero', () => {
    /* THE RULE (b307): the cap is PER ABSENCE, not a shared daily bucket. The
       old test proved it by calling `window.processOffline()` three times and
       watching `G.offlineBudget.at` and `G.stats.kills`.

       BOTH HALVES OF THAT FIXTURE ARE GONE, and for different reasons worth
       keeping apart. The local away engine was deleted (b515), so the kill
       counter cannot move; and `offlineBudget` is SERVER-OF-RECORD and ARMED,
       so the watermark is `player_state.accrued_to` — the client may not write
       it at all, which is B347-R1's subject.

       The arithmetic itself did not move: `src/core/away.js creditWindow` is
       the shared function BOTH sides run (the client to size a preview, the
       Edge engine to size the grant), so the rule is asserted on it directly,
       as pure data. Three properties, each one an exploit if it breaks:

       (a) A PAID ABSENCE LEAVES NOTHING BEHIND. `toMs` is where the next
           watermark lands, so paying and then re-asking from that watermark
           must yield zero — otherwise the same hours are paid twice, which is
           the b214 double-pay shape.
       (b) THE NEXT ABSENCE GETS THE WHOLE CAP. No bucket carries over.
       (c) THE CAP CLIPS THE PAYOUT, NOT THE CLOCK. An over-cap absence still
           reports its full `awayMs` and a real `unpaidMs`, so a 40-hour absence
           is one capped night rather than four 12h instalments.

       MUTATION: make `fromMs` fall back to `nowMs - capMs` (the pre-b352 shape)
       → (a) still passes and (c) goes red, which is the point of asserting all
       three: the window has two ends and a fix to one can move the other.
       The SERVER-side twin is `creditWindowGuard` in tests/accrual-engine.mjs. */
    const A = window.HearthriseCore.away;
    assert(typeof A.creditWindow === 'function', 'src/core/away.js must export creditWindow');
    const HOUR = 3600000;
    const CAP = 12 * HOUR;
    const now = Date.UTC(2026, 0, 16, 6, 0, 0);

    // (a) an 8h absence, wholly inside the cap, is paid in full and leaves nothing.
    const first = A.creditWindow({ nowMs: now, watermarkMs: now - 8 * HOUR, capMs: CAP });
    assert(first.paidMs === 8 * HOUR, 'an 8h absence under a 12h cap must pay all 8h, got ' + (first.paidMs / HOUR) + 'h');
    assert(first.unpaidMs === 0 && first.capped === false, 'it must not report itself capped: ' + JSON.stringify(first));
    const again = A.creditWindow({ nowMs: now, watermarkMs: first.toMs, capMs: CAP });
    assert(again.paidMs === 0,
      'returning immediately re-paid ' + (again.paidMs / 60000) + ' minutes of an absence that was already '
      + 'credited — the watermark the last grant set does not close the window it paid for');

    // (b) and the NEXT absence gets the whole cap, with nothing carried over.
    const later = now + 20 * HOUR;
    const second = A.creditWindow({ nowMs: later, watermarkMs: first.toMs, capMs: CAP });
    assert(second.paidMs === CAP,
      'the following absence lost part of its allowance: ' + (second.paidMs / HOUR) + 'h of ' + (CAP / HOUR) + 'h — '
      + 'the cap is PER ABSENCE and a shared bucket is exactly what b307 removed');

    // (c) over the cap: the payout clips, the clock does not.
    const over = A.creditWindow({ nowMs: now, watermarkMs: now - 18 * HOUR, capMs: CAP });
    assert(over.paidMs === CAP, 'an 18h absence at a 12h cap must credit 12h, got ' + (over.paidMs / HOUR) + 'h');
    assert(over.awayMs === 18 * HOUR,
      'the absence itself must still be reported in full (' + (over.awayMs / HOUR) + 'h) — a receipt that '
      + 'shortens the absence to the cap cannot explain the hours it did not pay for');
    assert(over.unpaidMs === 6 * HOUR && over.capped === true,
      'the forfeited tail must be the 6h the cap refused: ' + JSON.stringify(over));
    /* AND THE WATERMARK STILL LANDS ON THE PAID EDGE, not on `now`: that pairing
       is what stops a 40-hour absence becoming four capped instalments on four
       reloads, and it is the half a "just clamp the payout" fix would miss. */
    const tail = A.creditWindow({ nowMs: now, watermarkMs: over.toMs, capMs: CAP });
    assert(tail.paidMs === 6 * HOUR,
      'the 6h tail the cap refused is not reachable at all from the paid edge (' + (tail.paidMs / HOUR) + 'h) — '
      + 'either it is lost or it is being re-paid');

    // (d) A CLIENT CANNOT BUY TIME THE WATERMARKS DO NOT CONTAIN.
    const forged = A.creditWindow({ nowMs: now, watermarkMs: now - HOUR, capMs: CAP, grantMs: 999 * HOUR });
    assert(forged.paidMs === HOUR,
      'a caller asked for ' + 999 + 'h against a 1h absence and got ' + (forged.paidMs / HOUR) + 'h — a supplied '
      + 'grant must be a CEILING clamped into the window that exists, never a source of time');
  }),

  () => tryRun('AWAY-SCOPE-1: AWAY_SCOPE is the pinned table, and no away-eligibility gate has come back by any name', () => {
    const C = window.HearthriseCore;
    /* THE PINNED TABLE. away.js's contract is that an UNKNOWN channel PAYS,
       because every historical away bug was a base reward silently vanishing.
       This test predates b343 and outlives it: whatever anyone builds next,
       the resolver stays a table of bonus channels and never a permission.

       `buff` moved false -> true (2026-08-14, Tyler: personal buffs pay away,
       server-wide blessings do not). Changing a pin is legal when the rule it
       pins changed and the change is deliberate; what this test refuses is a
       DRIFT — a channel appearing, disappearing, or flipping without anyone
       editing this line. */
    const scope = C.away.AWAY_SCOPE;
    const expected = { permanent: true, crit: true, botd: true, heal: true, blessing: false, buff: true };
    assert(Object.keys(scope).sort().join(',') === Object.keys(expected).sort().join(','),
      'AWAY_SCOPE gained or lost a channel: ' + JSON.stringify(scope));
    Object.keys(expected).forEach((k) => {
      assert(scope[k] === expected[k], 'AWAY_SCOPE.' + k + ' changed to ' + scope[k] + ' — the ruling says ' + expected[k]);
    });
    assert(C.away.AWAY_RATE_MULT === 1.00, 'AWAY_RATE_MULT must stay exactly 1.00, found ' + C.away.AWAY_RATE_MULT);
    /* b343: THE GATE MODULE IS GONE AND MUST STAY GONE. `src/core/licence.js`
       exported a predicate that decided whether an away span ran at all; Tyler
       removed the rule it served. Asserting the absence of the module AND of
       its window binding is what makes "removed" a contract rather than a
       commit message — the next author rebuilding it has to delete a test
       first, and that is the conversation this line exists to force.
       MUTATION PROVEN: re-export any module as `HearthriseCore.licence` and
       this fails. */
    assert(!('licence' in C) && !('fieldLicence' in C.away) && !('FIELD_LICENCE_KILLS' in C.away)
      && !('FIELD_LICENCE_KILLS' in C),
      'an away-eligibility gate is back in the core: ' + Object.keys(C).join(','));
    assert(typeof window.HearthriseLicence === 'undefined',
      'the retired away-gate window API is back — every surface that reads it will grow a branch again');
  }),

  () => tryRun('AWAY-HONEST-4: gathering banks the whole absence, from kill zero', () => {
    /* THE PROMISE THE FTUE MAKES WITHOUT QUALIFICATION: "even when you're
       offline, progress continues". This was written in the gate era, where it
       proved the b343 combat gate did not leak past combat, and it drove
       `window.processOffline()` on the live G.

       b515 deleted that engine, so it drives the one that replaced it —
       `simulateSkillSpan`, vendored into hr-accrue by tools/pack-edge.mjs — on
       a plain state, at zero lifetime kills. Same promise, measured on the
       bytes the server runs, and now as an IDENTITY rather than a "> 0": a
       gather span may not read the lifetime kill count at all.
       MUTATION: give simulateSkillSpan any `state.stats.kills` term → red. */
    const zero = awayGatherSpan({ state: { stats: { kills: 0 } } });
    const prod = (window.TREES || []).filter((t) => t.id === zero.targetId)[0];
    assert(prod, 'the fixture needs a level-1 tree');
    assert(zero.out.gathered > 0,
      'an hour of woodcutting gathered nothing at all (stoppedBy=' + zero.out.stoppedBy + ') — everything '
      + 'below would be vacuous');
    assert((zero.paid.xp.woodcutting || 0) > 0, 'a 0-kill player must still bank gathering XP away');
    assert((zero.paid.items[prod.prod] || 0) > 0, 'a 0-kill player must still bank gathered items away');

    const veteran = awayGatherSpan({ state: { stats: { kills: 500 } } });
    assert(JSON.stringify(zero.paid) === JSON.stringify(veteran.paid),
      'a gather span paid differently at 500 lifetime kills than at 0 — the gather branch is reading the '
      + 'combat gate again.\n  at 0:   ' + JSON.stringify(zero.paid)
      + '\n  at 500: ' + JSON.stringify(veteran.paid));
  }),

  () => tryRun('AWAY-HONEST-3: the forecast is survivable — a rate is only quoted over a span you can live through', () => {
    const G = window.G;
    assert(typeof window._hrEstimateCombat === 'function', 'the estimator must be published for this assertion');
    const snap = snapshotG();
    try {
      /* THE ACCEPTANCE CRITERION from the spec, so nobody has to trust the
         model's constants: a fresh save (10 HP, bronze sword, empty food slot)
         against Slime must land within 5 kills +/-1 and 75s +/-20s. Ground
         truth from 4,000 seeded runs of the real engine: 4.49 kills / 58.5s. */
      G.skills = Object.assign({}, G.skills, { attack: 0, strength: 0, defense: 0, hitpoints: 1154 });
      G.equipment = Object.assign({}, G.equipment, { weapon: 'bronze_sword' });
      G.playerMaxHp = 10; G.playerHp = 10;
      G.foodSlot = null;
      G.traits = Object.assign({}, G.traits); delete G.traits.auto_eat;
      const est = window._hrEstimateCombat(window.MONSTERS.slime);
      assert(est.survivalKills >= 4 && est.survivalKills <= 6,
        'survivalKills must be 5 +/-1 for a fresh character on Slime, got ' + est.survivalKills);
      assert(est.survivalSeconds >= 55 && est.survivalSeconds <= 95,
        'survivalSeconds must be 75 +/-20 for a fresh character on Slime, got ' + est.survivalSeconds.toFixed(1));
      assert(est.survivesAnHour === false, 'a fresh character does not survive an hour on Slime');

      /* THE LIE ITSELF: below the hour the preview must not print an hourly
         rate anywhere. This is the assertion that keeps it from coming back. */
      window.openMobPreview('slime');
      const modal = document.getElementById('mp-modal');
      assert(modal && modal.textContent.length > 0, 'the monster preview did not render');
      assert(!/\/\s*hr/i.test(modal.textContent),
        'the preview still quotes an hourly rate to a character who cannot survive the hour:\n'
        + modal.textContent.replace(/\s+/g, ' ').slice(0, 400));
      assert(/kills/i.test(modal.textContent) && /Away:/.test(modal.textContent),
        'the preview must print the run and the Away line instead');
      /* b343: THE AWAY LINE NAMES THE THING THAT REALLY ENDS THE NIGHT. It
         used to name a permission ("land 100 kills for your Field Licence"),
         which was never the reason a fresh character's night was short — the
         reason is that nobody eats for you without Auto-Eat, and this
         character has no trait and no food slot. A line that withholds the
         promise without naming the fix is only half of honest.
         MUTATION PROVEN: return a flat "<b>Away:</b> pays at the base rate"
         from `awayLineHtml` and both assertions fail. */
      const awayLine = document.querySelector('#mp-modal .mp-away-line');
      assert(awayLine, 'the preview must carry an Away line — it is the answer to "can I leave this running?"');
      const awayTxt = awayLine.textContent.replace(/\s+/g, ' ');
      assert(/you fall/i.test(awayTxt),
        'the Away line does not say what ends the fight: ' + awayTxt);
      assert(/Auto-Eat/i.test(awayTxt),
        'the Away line names no way out — the fix is the trait, and it is buyable: ' + awayTxt);

      /* The other side of the rule: a character who DOES survive the hour
         still gets the hourly rate. The fix must not have deleted it. */
      G.playerMaxHp = 500000; G.playerHp = 500000;
      const est2 = window._hrEstimateCombat(window.MONSTERS.slime);
      assert(est2.survivesAnHour === true, 'a 500k HP character must survive the hour');
      window.openMobPreview('slime');
      assert(/\/\s*hr/i.test(document.getElementById('mp-modal').textContent),
        'the hourly rate must still be printed for a character who can hold the hour');

      /* GATHERING IS UNTOUCHED, on purpose — a tree does not hit back, so its
         hourly forecast is exactly true over an eight-hour absence. */
      assert(typeof window.HearthriseCore.pacing.actionRate === 'function'
        && window.HearthriseCore.pacing.actionRate('woodcutting', (window.TREES || [])[0], { bonus: () => 0 }).xpPerHour > 0,
        'the gathering rate must still be a rate — do not harmonise the honest preview with the dishonest one');
    } finally {
      try { window.closeMobPreview(); } catch (e) {}
      restoreG(snap);
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     b341 regression suite — WHAT THE GAME TELLS YOU, AND WHAT IT DOES INSTEAD

     Five findings from a live playthrough. Four of the five are the same
     species of defect: a surface that states one thing while the engine did
     another. They are grouped because the fix for each is "make the surface
     read the authority that already exists" — not new mechanics.
     ══════════════════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════════════════
     NIGHT- · SET THE NIGHT (feature slate §3) — the return ritual

     Two halves of one promise: before the tab closes the game says how far
     tonight's supplies carry the CURRENT activity; in the morning it says how
     right that was, FROM THE SERVER'S RECEIPT. The forecast is advisory
     display — nothing reads it, nothing is credited from it — so what these
     tests guard is not a number but four properties:

       1. the forecast comes out of THE ONE ENGINE and touches nothing
          (`simulateSpan` on a deep clone; the real `G` is byte-identical
          after a forecast that simulated eight hours of fighting);
       2. the bench half tells the truth about materials rather than
          promising a night the inputs cannot pay for;
       3. the MORNING line is derived from `G.lastOfflineSummary` — the
          receipt — and never from the prediction it is grading;
       4. exactly ONE welcome modal exists (the b341 ruling), and the
          retired one is DELETED rather than unreferenced.
     ══════════════════════════════════════════════════════════════════════════ */

  () => tryRun('NIGHT-1: the Tonight forecast runs the ONE engine on a clone and never touches G', () => {
    const STN = window.HearthriseSetTheNight;
    assert(STN && typeof STN.forecast === 'function',
      'HearthriseSetTheNight.forecast is missing — the whole ritual hangs off this seam');
    const snap = snapshotG();
    try {
      const foe = (window.MONSTERS && window.MONSTERS.slime) ? 'slime'
        : Object.keys(window.MONSTERS || {})[0];
      nightWorld({ foe, inventory: { cooked_shrimp: 107 }, food: 'cooked_shrimp' });

      /* THE PROPERTY THAT MATTERS MOST. A forecast is eight hours of the live
         combat engine; if it ran against the real save it would hand the
         player a night's gold, XP, kills and eaten food for free — the b214
         double-pay through a colder door. Compared as a whole object, not
         field by field, so a future forecast that starts touching some other
         part of G goes red here rather than in production. */
      const before = JSON.stringify({ inv: G.inventory, gold: G.gold, stats: G.stats, hp: G.playerHp });
      const f = STN.forecast(G);
      const after = JSON.stringify({ inv: G.inventory, gold: G.gold, stats: G.stats, hp: G.playerHp });
      assert(before === after,
        'forecasting MUTATED the live save. The simulation must run on a deep clone with a bare `fx`; '
        + 'anything else credits a night that has not happened.\n  before: ' + before + '\n  after:  ' + after);

      assert(f && f.kind === 'combat', 'an active fight must forecast as combat, got ' + JSON.stringify(f && f.kind));
      assert(f.foodQty === 107 && /shrimp/i.test(f.foodName || ''),
        'the forecast must NAME the bag it is talking about, got ' + f.foodQty + ' ' + f.foodName);
      assert(f.spanMs > 0 && f.spanMs <= STN.HORIZON_MS,
        'the forecast span must sit inside the night, got ' + f.spanMs);
      assert(f.kills > 0, 'a fed character fighting a weak foe must forecast at least one kill, got ' + f.kills);

      const s = STN.sentence(f);
      assert(/^Tonight: your 107 /.test(s),
        'the sentence must open with the bag, got: ' + JSON.stringify(s));
      assert(/carry you/.test(s), 'the sentence must say what the food DOES, got: ' + JSON.stringify(s));
      assert(f.allNight
        ? /through the night/.test(s)
        : /then you fall and the night ends in recovery\.$/.test(s),
        'a night that ends in a fall must SAY so (Recovery Rule rev.2 — it is a knock-out, not a stop), got: '
          + JSON.stringify(s));

      /* DETERMINISM. A forecast that moved on every repaint would be noise
         dressed as advice, and the strip repaints on every Home render. */
      const f2 = STN.forecast(G);
      assert(f2 && f2.spanMs === f.spanMs && f2.kills === f.kills,
        'the forecast is not deterministic — the seed is being drawn from the live stream. '
        + f.spanMs + '/' + f.kills + ' vs ' + f2.spanMs + '/' + f2.kills);

      /* AND IT RENDERS. Home drops this string straight into "Right now". */
      const html = STN.strip(G);
      assert(/hd-night/.test(html) && html.indexOf('Tonight:') > 0,
        'the Home strip did not render the forecast, got: ' + String(html).slice(0, 160));
      assert(!/#[0-9a-f]{3}\b|#[0-9a-f]{6}\b/i.test(html),
        'the Tonight strip carries a hardcoded colour — tokens only (CLAUDE.md §7): ' + html.slice(0, 200));
    } finally {
      try { STN.forget(); } catch (e) {}
      restoreG(snap);
    }
  }),

  () => tryRun('NIGHT-2: a payable bench runs all night, or states exactly what it runs out of', () => {
    const STN = window.HearthriseSetTheNight;
    const SA = window.HearthriseSkillAuthority;
    assert(SA && SA.serverAccruedSkill('cooking') === true,
      'CONTROL: cooking must be a server-settled skill (COOKING_SETTLEMENT_ARM_ENABLED) — '
      + 'without that this test would be asserting the wrong branch');
    const snap = snapshotG();
    try {
      // A bench with more raw than a night can eat: the honest answer is "all night".
      nightWorld({ skill: 'cooking', target: 'cook_shrimp', inventory: { shrimp: 100000 } });
      const deep = STN.forecast(G);
      assert(deep && deep.kind === 'bench' && deep.allNight === true,
        'a bench with 100k inputs must run all night, got ' + JSON.stringify(deep && { k: deep.kind, a: deep.allNight }));
      assert(STN.sentence(deep) === 'Tonight: this bench runs all night.',
        'the payable-bench copy is the slate\'s literal string, got: ' + JSON.stringify(STN.sentence(deep)));

      // And a bench that will dry out states the number, not a vibe.
      nightWorld({ skill: 'cooking', target: 'cook_shrimp', inventory: { shrimp: 5 } });
      const thin = STN.forecast(G);
      assert(thin && thin.allNight === false && thin.actions === 5,
        'a 5-input bench must forecast 5 actions and NOT all night, got '
          + JSON.stringify(thin && { a: thin.actions, n: thin.allNight }));
      const s = STN.sentence(thin);
      assert(/runs out after 5\.$/.test(s) && /shrimp/i.test(s),
        'the honest limit must name the input and the count, got: ' + JSON.stringify(s));

      /* THE UNPAYABLE CASE. A skill the accrual engine does not settle must
         never be promised as a night — this is the same `serverAccruedSkill`
         predicate the banking row beside it reads, so the two lines on one
         card cannot contradict each other (b388 shipped exactly that bug). */
      const unpaid = (window.SKILLS_DEF ? Object.keys(window.SKILLS_DEF) : [])
        .filter((id) => SA.serverAccruedSkill(id) === false)[0];
      if (unpaid) {
        nightWorld({ skill: unpaid, target: 'nothing_in_particular' });
        const u = STN.forecast(G);
        assert(u && u.banks === false && /only earns while you are here\.$/.test(STN.sentence(u)),
          'an unsettled skill must be told it does not bank, got: ' + JSON.stringify(STN.sentence(u)));
      }
    } finally {
      try { STN.forget(); } catch (e) {}
      restoreG(snap);
    }
  }),

  () => tryRun('NIGHT-3: the morning line is graded from the RECEIPT, never from the prediction', () => {
    const STN = window.HearthriseSetTheNight;
    const AC = window.HearthriseAccrual;
    assert(AC && typeof AC.receiptStopClause === 'function' && typeof AC.receiptRecoveryClause === 'function',
      'CONTROL: the receipt clauses must exist — the morning line quotes them rather than re-writing them');
    const snap = snapshotG();
    const setAt = Date.now() - 8 * 3600e3;
    try {
      STN.forget();
      assert(STN.morningLine({ at: Date.now(), paidMs: 3600e3 }) === null,
        'with NO remembered forecast the modal must say nothing at all — a ritual degrades to silence, never to a guess');

      STN.remember({ at: setAt, kind: 'combat', spanMs: 6 * 3600e3 + 20 * 60e3, allNight: false,
                     banks: true, targetName: 'Goblin' });

      /* THE FORECAST HELD. `paidMs` is the SERVER's credited span. */
      const held = STN.morningLine({ at: Date.now(), paidMs: 6 * 3600e3 });
      assert(held === 'You set about 6h 20m; the night paid 6h — the forecast held.',
        'the close-enough morning line is wrong, got: ' + JSON.stringify(held));

      /* A NIGHT THAT RAN SHORT, and WHY — the why is the receipt's own clause,
         not a sentence this module invented. */
      const short = STN.morningLine({ at: Date.now(), paidMs: 40 * 60e3,
        stoppedBy: 'supplies', stoppedById: 'shrimp', stoppedSkill: 'cooking' });
      assert(/the night ran short\./.test(short),
        'a 40m payout against a 6h20m forecast is short, got: ' + JSON.stringify(short));
      assert(/ran out of/.test(short),
        'the morning line must carry the receipt\'s OWN stop clause, got: ' + JSON.stringify(short));

      /* A DEATH NIGHT reads the recovery clause — the receipt says the run
         picked up, so the line must not imply the night simply ended. */
      const fell = STN.morningLine({ at: Date.now(), paidMs: 7 * 3600e3, deaths: 4,
        diedTo: 'slime', recoverMs: 8 * 60e3 });
      assert(/You fell 4 times/.test(fell) && /picked up/.test(fell),
        'a night with deaths must quote receiptRecoveryClause, got: ' + JSON.stringify(fell));

      /* A RECEIPT WITH NO SPAN GRADES NOTHING. */
      assert(STN.morningLine({ at: Date.now(), paidMs: 0 }) === null,
        'a receipt that credited no span cannot grade a forecast');
      /* AND A RECEIPT OLDER THAN THE FORECAST IS A DIFFERENT ABSENCE. */
      assert(STN.morningLine({ at: setAt - 1000, paidMs: 6 * 3600e3 }) === null,
        'a receipt written BEFORE the forecast is about another night and must not be graded against it');
    } finally {
      try { STN.forget(); } catch (e) {}
      restoreG(snap);
    }
  }),

  () => tryRun('NIGHT-5: the Tonight strip never speaks before the SERVER has stated the bag', () => {
    /* THE LIVE BUG (QA account, 2026-09-09, reproduced twice).
       On a plain reload Home read "Tonight: your 29 Cooked Shrimp carry you
       about 26m against Goblin" for ~10 seconds, then flipped to "with nothing
       to eat you last about 5m" when the envelope landed. The server bag had
       held no food for hours (the away receipt said autoEat.hadFood:false).

       THE 29 WAS THE FRESH-G FACTORY LITERAL: src/legacy.js seeds
       `inventory:{turnip_seed:5,carrot_seed:3,shrimp:10,cooked_shrimp:20}` —
       30 auto-eatable units, one already eaten by the live tick before the
       screenshot. `loadLocal()` cannot strip it, because `inventory` is not a
       SERVER_OF_RECORD field and `forgetServerOfRecord` deletes only those; it
       is corrected only when `reconcileInventory` applies an envelope.

       THE PROPERTY: the forecast is a SERVER-DERIVED statement, so before an
       envelope has stated the bag the surface says NOTHING — no placeholder,
       no number, an empty strip — and it does not REMEMBER a guess either (a
       remembered pre-envelope forecast would go on to grade the morning line
       against a bag that never existed). Once the envelope lands, the same
       surface tells the truth about an empty bag. */
    const STN = window.HearthriseSetTheNight;
    const AC = window.HearthriseAccrual;
    assert(AC && typeof AC.bagHydrated === 'function',
      'HearthriseAccrual.bagHydrated is missing — the strip has no way to ask whether the bag is real');
    const snap = snapshotG();
    const hadStamp = window.G._bagFromServerAt;
    try {
      const foe = (window.MONSTERS && window.MONSTERS.slime) ? 'slime'
        : Object.keys(window.MONSTERS || {})[0];

      // ── BOOT, PRE-ENVELOPE: the factory literal is in the bag and nothing has stated it.
      nightWorld({ foe, inventory: { cooked_shrimp: 20, shrimp: 10 }, food: 'cooked_shrimp' });
      STN.forget();
      AC.__forgetBagHydrated(window.G);
      assert(AC.bagHydrated(window.G) === false,
        'CONTROL: the stamp must be gone, or this test is measuring a hydrated boot');
      const early = STN.strip(window.G);
      assert(early === '',
        'THE b525 BUG: the Tonight strip painted a forecast before any envelope stated the bag — '
        + 'that is the fresh-G literal being read to the player as their supplies. Got: '
        + JSON.stringify(String(early).slice(0, 200)));
      assert(STN.forecast(window.G) === null,
        'the forecast itself must be null pre-envelope, not merely unrendered — every sentence in the '
        + 'ritual is priced off the bag');
      assert(STN.recall() === null,
        'a pre-envelope guess was REMEMBERED. It would be graded against the server receipt in the '
        + 'morning, turning an unhydrated boot into a wrong statement about a night that did happen.');

      // ── THE ENVELOPE LANDS, AND THE BAG IS EMPTY. Same surface, now honest.
      nightWorld({ foe, inventory: {}, food: 'cooked_shrimp' });
      assert(AC.bagHydrated(window.G) === true,
        'reconcileInventory did not stamp the bag as server-stated — the strip would stay silent forever');
      const f = STN.forecast(window.G);
      assert(f && f.kind === 'combat' && f.foodQty === 0,
        'after the envelope the forecast must run against the SERVER bag (empty), got '
        + JSON.stringify(f && { k: f.kind, q: f.foodQty }));
      const s = STN.sentence(f);
      assert(/^Tonight: with nothing to eat you last /.test(s),
        'an empty server bag must read as "with nothing to eat", got: ' + JSON.stringify(s));
      assert(STN.strip(window.G).indexOf('Tonight:') > 0,
        'the strip must render once the bag is real');
    } finally {
      try { STN.forget(); } catch (e) {}
      restoreG(snap);
      if (typeof hadStamp === 'undefined') { try { AC.__forgetBagHydrated(window.G); } catch (e) {} }
      else window.G._bagFromServerAt = hadStamp;
    }
  }),

  () => tryRun('NIGHT-4: exactly ONE welcome modal exists, and the retired one is DELETED not unreferenced', () => {
    /* THE RULING (docs/planning/FEATURE_SLATE.md §3): "v2 retires, b341
       survives." Hearthrise shipped two welcome-back modals whose only
       relationship was a suppression that did not suppress — the v2 block's
       `window.maybeShowWelcome = function(){}` ran AFTER boot had already
       captured the lexical reference in `setTimeout(maybeShowWelcome, 1500)`.
       So the property is not "v2 is switched off"; it is that v2 IS NOT
       THERE. Unreferenced is not unreachable (the b516 rule): anything that
       can run one line in this page can call a function still on `window`. */
    for (const name of ['_renderWelcomeV2', '_closeWelcomeV2', '_calcRichCatchup']) {
      assert(!(name in window),
        '`window.' + name + '` is back (typeof ' + (typeof window[name]) + '). The welcome-v2 modal was '
        + 'RETIRED, not disabled: it built a second welcome-back card from a THIRD client-side estimate '
        + 'of the absence (`Date.now() - G.lastSeen`, the device clock — §1 says the client clock is '
        + 'never authority) and raced the b341 card that reads the server receipt. If a session summary '
        + 'is wanted again, render it from `G.lastOfflineSummary`.');
    }
    assert(!document.getElementById('wbv-overlay'),
      'the welcome-v2 overlay is in the DOM again — one ritual, one modal');

    const snap = snapshotG();
    try {
      assert(typeof window.__maybeShowWelcome === 'function',
        'CONTROL: the surviving b341 modal must still be drivable, or this test proves nothing');
      /* `setAway` moves the watermark that is the real clock; the seed is the field under test. */
      setAway(8);
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      /* THE COUNT, over every welcome surface the game has ever had. A second
         one appearing here is the exact regression the ruling closed. */
      const open = document.querySelectorAll('#welcome-overlay.show, #wbv-overlay.show, #hr-welcome-modal');
      assert(open.length === 1,
        'expected exactly ONE welcome modal open, got ' + open.length + ': '
        + [...open].map((n) => n.id || n.className).join(', '));
    } finally {
      const ov = document.getElementById('welcome-overlay'); if (ov) ov.classList.remove('show');
      restoreG(snap);
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     HF-1 … HF-5 — THE HEARTHFIND, CLIENT HALF (Feature Slate §2)

     The client half renders a moment the SERVER decided. So what these tests
     grade is not a rate and not a roll — there is neither in the client — but
     five properties:

       1. a forced envelope carrying a find produces the reveal, in the ruled
          copy, and the reveal STAYS until it is dismissed (HF-1);
       2. an AWAY find never opens a modal: it leads the return card in its own
          full-width band, and the collection row flips (HF-2);
       3. the global chat line is rendered from a world_finds ROW, character for
          character, with the first-ever variant (HF-3);
       4. a find moves NOTHING — no gold, no XP, no inventory, no skills. The
          rarest event in the game pays a trophy and a moment, and a client that
          could add a coin to it is a client that could add a thousand (HF-4);
       5. the line is never SENT. This client cannot put a hearthfind into
          chat_messages, so it cannot announce a find the server never
          journalled (HF-5) — the "must NOT: broadcast what the ledger did not
          journal" clause of the slate, as an executable property.

     THE FIXTURES ARE SERVER SHAPES, not client ones: `envelope.hearthfind` and
     `state.hearthfind_last` exactly as hr_apply and hr_state_of build them.
     ══════════════════════════════════════════════════════════════════════════ */

  /** One find, in the server's own receipt shape. */
  () => tryRun('HF-1: an envelope carrying a find opens the reveal in the ruled copy, and it NEVER auto-dismisses', () => {
    const HF = window.HearthriseHearthfind;
    assert(HF && typeof HF.noteEnvelope === 'function',
      'HearthriseHearthfind.noteEnvelope is missing — the whole client half hangs off this seam');
    const snap = snapshotG();
    const G = window.G;
    const savedLos = G.lastOfflineSummary;
    try {
      HF.__forgetSeen();
      HF.dismissReveal();
      G.lastOfflineSummary = null;                 // ⇒ attended, not a return
      G.bestiary = G.bestiary || {};
      G.bestiary.dragon = { kills: 4211, firstKill: 1 };
      HF.__setBoardCount('emberheart', 3);

      const find = HF.findOn({
        version: 9, state: {},
        hearthfind: {
          item: 'emberheart', source_kind: 'monster', source_id: 'dragon',
          one_in: 26000, nth_today: 1, broadcast: true, at: '2026-09-08T12:00:00Z',
        },
      });
      assert(find && find.item === 'emberheart' && find.oneIn === 26000,
        'the receipt shape hr_apply actually returns did not normalise — ' + JSON.stringify(find));

      /* THE COPY, EXACTLY AS RULED. Asserted on the strings, not on the DOM,
         so a renderer refactor cannot quietly reword the rarest sentence in
         the game. */
      const L = HF.revealLines(find, G);
      assert(L.headline === 'A HEARTHFIND', 'the headline is not the ruled one: ' + L.headline);
      assert(L.odds === 'You beat 1 in 26,000.', 'the odds line drifted: ' + L.odds);
      assert(/^3rd ever found · [\d,]+ swings for this one$/.test(L.meta),
        'the provenance line drifted from "{ordinal} ever found · {n} swings for this one": ' + L.meta);
      assert(L.meta.indexOf('4,211 swings') !== -1,
        'the swing count is not the lifetime kills on that source — ' + L.meta);

      const veil = HF.showReveal(find, G);
      assert(veil && document.getElementById('hr-hf-veil'),
        'the reveal did not mount');
      /* NOT A TOAST. The toast dock is where every other drop goes; this one
         must own the screen. */
      assert(veil.className.indexOf('hr-hf-veil') !== -1 && !veil.closest('#toasts'),
        'the reveal rendered inside the toast dock — the one thing the ruling forbids');
      const txt = veil.textContent.replace(/\s+/g, ' ');
      assert(txt.indexOf('A HEARTHFIND') !== -1 && txt.indexOf('You beat 1 in 26,000.') !== -1,
        'the mounted reveal does not carry the ruled copy — ' + txt);
      /* NEVER AUTO-DISMISSED. Nothing in this module schedules a removal, and
         this is the assertion that keeps it that way: the entrance is ~3.5s, so
         a card still on screen after 4s has no timeout behind it. */
      const t0 = Date.now();
      while (Date.now() - t0 < 40) { /* one paint's worth, sync */ }
      assert(document.getElementById('hr-hf-veil'),
        'the reveal removed itself — a rare drop that can vanish while the player looks away');
      assert(HF.dismissReveal() === true, 'the reveal is not dismissible');
    } finally {
      HF.dismissReveal();
      const v = document.getElementById('hr-hf-veil'); if (v) v.remove();
      G.lastOfflineSummary = savedLos;
      restoreG(snap);
    }
  }),

  () => tryRun('HF-2: an AWAY find leads the return card as a band — never a modal — and the collection row flips', () => {
    const HF = window.HearthriseHearthfind;
    const snap = snapshotG();
    const G = window.G;
    const savedLos = G.lastOfflineSummary;
    try {
      HF.__forgetSeen();
      HF.dismissReveal();
      HF.__setBoardCount('worldroot_seed', 1);
      /* THE RETURN. An eight-hour absence receipt is what makes this find an
         away find; without it the same envelope is an attended reveal. */
      G.lastOfflineSummary = {
        hrs: 8, awayMs: 8 * 3600000, gainedItems: 12, gainedXp: 900,
        gainedKills: 0, at: Date.now(), source: 'away',
      };
      const find = HF.findOn({
        version: 9,
        state: {
          hearthfind_last: {
            item: 'worldroot_seed', source_kind: 'node', source_id: 'normal_tree',
            one_in: 420000, nth_today: 1, at: new Date().toISOString(),
          },
        },
      });
      assert(find, 'state.hearthfind_last (the durable projection) did not normalise');
      assert(HF.classify(find, G) === 'away',
        'a find inside an eight-hour absence receipt was classified attended — it would open a modal over the return card');

      HF.__setPending(find);
      const band = HF.claimAwayBand();
      assert(band && band.indexOf('hr-hf-band') !== -1, 'the away band did not render');
      const bandTxt = band.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      assert(bandTxt.indexOf('Something happened while you were away.') !== -1,
        'the away band lead line drifted — ' + bandTxt);
      assert(bandTxt.indexOf('Worldroot Seed — 1 in 420,000. The 1st ever found.') !== -1,
        'the away band body drifted from the ruled sentence — ' + bandTxt);
      assert(!document.getElementById('hr-hf-veil'),
        'an away find ALSO opened the attended modal — the player returns to a dialog over their receipt');

      /* IT OWNS THE TOP OF THE RETURN CARD. Not a loot row: the band must be
         the FIRST child of #welcome-rows, above the XP/loot summary. */
      HF.__setPending(find);
      G.lastSeen = Date.now() - 8 * 3600000;
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      const rowsEl = document.getElementById('welcome-rows');
      assert(rowsEl, 'the return card did not build');
      const first = rowsEl.firstElementChild;
      assert(first && first.className.indexOf('hr-hf-band') !== -1,
        'the hearthfind band is not the first thing on the return card — it is: '
        + (first ? first.className : '(nothing)'));

      /* THE COLLECTION ROW FLIPS. Locked prints the ruled sentence; held
         prints the record. */
      G.collection = G.collection || {};
      delete G.collection.worldroot_seed;
      let rows = HF.collectionRows(G);
      assert(rows.length === 4, 'The Four Hearthfinds is not four rows: ' + rows.length);
      const locked = rows.filter((r) => r.id === 'worldroot_seed')[0];
      assert(locked && locked.found === false
        && locked.text === 'Worldroot Seed — not yet found. Somewhere in ordinary trees, yews, duskwood.',
        'the locked collection row drifted from the ruled sentence — ' + (locked && locked.text));

      G.collection.worldroot_seed = 1;
      HF.__setLastShown(find);
      rows = HF.collectionRows(G);
      const found = rows.filter((r) => r.id === 'worldroot_seed')[0];
      assert(found && found.found === true && found.text === 'Worldroot Seed',
        'the collection row did not flip once the trophy was held');
      assert(/beat 1 in 420,000/.test(found.sub) && /1st ever found/.test(found.sub),
        'the found row does not carry the odds beaten and the ordinal — ' + found.sub);
    } finally {
      const ov = document.getElementById('welcome-overlay'); if (ov) ov.classList.remove('show');
      HF.__setPending(null); HF.__setLastShown(null); HF.dismissReveal();
      G.lastOfflineSummary = savedLos;
      restoreG(snap);
    }
  }),

  () => tryRun('HF-3: the global chat line is rendered FROM A world_finds ROW, in the ruled copy, first-ever included', () => {
    const HF = window.HearthriseHearthfind;
    /* A world_finds row, exactly as the migration defines it (snake_case, one_in
       stored on the row so a later retune cannot restate a past find's odds). */
    const row = {
      id: 7, user_id: '00000000-0000-0000-0000-0000000000aa',
      item_id: 'emberheart', source_kind: 'monster', source_id: 'dragon',
      one_in: 26000, found_at: '2026-09-08T12:00:00Z',
    };
    const dragonName = HF.sourceName('monster', 'dragon');
    const third = HF.chatLine(row, 'Paione', 3);
    assert(third === '✦ HEARTHFIND — Paione pulled the Emberheart from ' + dragonName
      + '. 1 in 26,000. The 3rd ever found in Hearthrise.',
      'the global chat line drifted from the ruled copy — ' + third);

    const first = HF.chatLine(row, 'Paione', 1);
    assert(first === '✦ HEARTHFIND — Paione pulled the Emberheart from ' + dragonName
      + '. 1 in 26,000. Nobody in Hearthrise has ever found one before.',
      'the FIRST-EVER variant drifted — ' + first);
    assert(HF.chatLine(row, 'Paione', null) === first,
      'an unknown ordinal did not fall back to the first-ever sentence');

    /* THE BOARD STORES NO NAME. A row whose display name could not be joined
       must still render — as "An adventurer", never as a raw uuid. */
    const anon = HF.chatLine(row, null, 2);
    assert(anon.indexOf('An adventurer pulled') !== -1 && anon.indexOf(row.user_id) === -1,
      'a nameless board row leaked the account id into global chat — ' + anon);

    assert(HF.ordinal(1) === '1st' && HF.ordinal(2) === '2nd' && HF.ordinal(3) === '3rd'
      && HF.ordinal(11) === '11th' && HF.ordinal(12) === '12th' && HF.ordinal(13) === '13th'
      && HF.ordinal(21) === '21st' && HF.ordinal(112) === '112th',
      'the ordinal is wrong on the cases English is weird about');
  }),

  () => tryRun('HF-4: a find moves NOTHING — no gold, no XP, no inventory, no skills', () => {
    const HF = window.HearthriseHearthfind;
    const G = window.G;
    const savedLos = G.lastOfflineSummary;
    const snap = snapshotG();
    try {
      HF.__forgetSeen();
      HF.dismissReveal();
      G.lastOfflineSummary = null;
      /* THE WHOLE ECONOMY OF THIS CHARACTER, BEFORE. Compared as one object,
         because the failure this guards against is a single field. */
      const before = JSON.stringify({
        gold: G.gold, gems: G.gems, marks: G.marks,
        inventory: G.inventory, skills: G.skills, bank: G.bank,
      });
      const env = {
        version: 9, state: {},
        hearthfind: {
          item: 'tidecallers_pearl', source_kind: 'node', source_id: 'shrimp_s',
          one_in: 360000, nth_today: 1, broadcast: true, at: '2026-09-08T13:00:00Z',
        },
      };
      HF.noteEnvelope(env);
      const find = HF.findOn(env);
      HF.showReveal(find, G);
      HF.awayBandHtml(find);
      HF.collectionSection(G);
      const after = JSON.stringify({
        gold: G.gold, gems: G.gems, marks: G.marks,
        inventory: G.inventory, skills: G.skills, bank: G.bank,
      });
      assert(before === after,
        'THE ANTI-P2W / ANTI-MINT PROPERTY: the client half moved a value while rendering a find. '
        + 'Before ' + before.slice(0, 220) + ' … after ' + after.slice(0, 220));
      /* And it never grants the trophy either — the inventory row is hr_apply's. */
      assert(!(G.inventory && G.inventory.tidecallers_pearl),
        'the client GRANTED the trophy — the item row belongs to hr_apply and to nothing else');
    } finally {
      HF.dismissReveal();
      const v = document.getElementById('hr-hf-veil'); if (v) v.remove();
      G.lastOfflineSummary = savedLos;
      restoreG(snap);
    }
  }),

  () => tryRun('HF-5: the client can never SEND a hearthfind line — it injects one it read from the board', () => {
    const HF = window.HearthriseHearthfind;
    assert(window.Chat && typeof window.Chat.inject === 'function',
      'Chat.inject is missing — the board line would have to go through Chat.send, which is a CLAIM');
    const sent = [];
    const origSend = window.Chat.send;
    const injected = [];
    const origInject = window.Chat.inject;
    try {
      window.Chat.send = function (ch, body) { sent.push([ch, body]); };
      window.Chat.inject = function (ch, msg) { injected.push([ch, msg]); return true; };
      const row = {
        id: 42, user_id: 'u1', item_id: 'deepvein_lodestar', source_kind: 'node',
        source_id: 'copper_rock', one_in: 420000, found_at: '2026-09-08T14:00:00Z',
      };
      const body = HF.announce(row, 'Tyler', 1);
      assert(sent.length === 0,
        'THE PROPERTY: the client SENT the hearthfind line into chat_messages. A client that can send it '
        + 'can send one for a find that never happened, and chat_messages cannot check.');
      assert(injected.length === 1 && injected[0][0] === 'global',
        'the line did not land on the global tab, locally — ' + JSON.stringify(injected));
      const msg = injected[0][1];
      assert(msg.system === true && msg.id === 'hf-42',
        'the injected line is not keyed on the board row id, so a re-poll would render it twice');
      assert(msg.body === body && /^✦ HEARTHFIND — Tyler pulled the/.test(msg.body),
        'the injected body is not the rendered board line — ' + msg.body);
      assert(msg.link && msg.link.action === 'hearthfind' && msg.link.item === 'deepvein_lodestar'
        && msg.link.label === 'Deepvein Lodestar',
        'the item name is not clickable through to its card — ' + JSON.stringify(msg.link));
    } finally {
      window.Chat.send = origSend;
      window.Chat.inject = origInject;
    }
  }),

  () => tryRunAsync('HF-6: an hr_world_finds_of that has not been migrated yet is learned ONCE, not polled forever', async () => {
    const HF = window.HearthriseHearthfind;
    assert(typeof HF.__boardMissing === 'function' && typeof HF.__resetProbe === 'function',
      'the board has no capability probe — the client half would 404 every 90s until the lane-C migration lands');
    HF.__resetProbe();
    assert(HF.__boardMissing() === false, 'the probe did not reset');
    /* The self-configuring switch, driven for real: one 404 from the board and
       the poll stands down. Without it, shipping the client half before the
       migration means a 404 in every player's console forever — and the two
       halves of this feature are explicitly allowed to land in either order. */
    const origFetch = window.fetch;
    const origAuth = window.HearthriseAuth;
    let calls = 0;
    try {
      /* hr_world_finds_of is granted to `authenticated` only, so refreshBoard
         stands down without a session. Stub one, or this arm measures nothing on
         a signed-out page. */
      window.HearthriseAuth = Object.assign({}, origAuth, {
        getSession: () => ({ access_token: 'smoke-hf6' }),
      });
      window.fetch = function (u) {
        if (String(u).indexOf('world_finds') !== -1) {
          calls++;
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
        }
        return origFetch.apply(this, arguments);
      };
      const first = await HF.refreshBoard();
      if (calls === 0) {
        /* No Supabase config in this page ⇒ the poll never dispatches at all,
           which is the same property by a shorter road. Assert THAT, honestly,
           rather than passing on a call that never happened. */
        assert(first === false, 'an unconfigured client still claimed a board read');
        return;
      }
      assert(HF.__boardMissing() === true,
        'a 404 from world_finds did not arm the negative probe');
      const before = calls;
      await HF.refreshBoard();
      await HF.refreshBoard();
      assert(calls === before,
        'the client kept polling a table it had already learned does not exist — ' + calls + ' calls');
    } finally {
      window.fetch = origFetch;
      window.HearthriseAuth = origAuth;
      HF.__resetProbe();
    }
  }),

  /* == HF-9/HF-10 - REGRESSION, named pre-launch P2 (Security, 2026-09-13) ===
     THE DEFECT: this file's board poll read `world_finds` directly with
     `select=id,user_id,...` and then resolved those uuids through the public
     `display_names` table. world_finds granted SELECT on user_id to anon AND
     authenticated and profiles/display_names are public-read, so the shipped
     client NAMED EVERY FINDER - including characters who had set
     `presence_quiet`, whose opt-out hr_town_refresh's crier could therefore only
     pretend to honour.
     Split in two because they fail separately: the read is ONE RPC that asks for
     no identity column (HF-9), and the name rendered is the SERVER's, so
     nameless - i.e. quiet - becomes "An adventurer" with no uuid in the line
     (HF-10). Both fail without the fix: the old path made a second request to
     display_names and read `row.user_id`. Fixture: hfPoll/HF_BOARD above. */
  () => tryRunAsync('HF-9: the board is ONE hr_world_finds_of call and asks for no identity column', async () => {
    assert(typeof window.HearthriseHearthfind.__setWatermark === 'function',
      'the board has no watermark seam - this arm cannot poll without stranding a real dock');
    const r = await hfPoll();
    /* No Supabase config on this page => the poll never dispatches. Assert THAT
       honestly rather than passing on a call that never happened. */
    if (!r.urls.length) { assert(r.got === false, 'an unconfigured client claimed a board read'); return; }
    assert(r.urls.length === 1, 'the board took ' + r.urls.length + ' requests - ' + r.urls.join(' | ')
      + '. One RPC is the whole read; a second request is the display_names join coming back.');
    assert(/\/rpc\/hr_world_finds_of POST$/.test(r.urls[0]),
      'the board was not read through the hr_world_finds_of RPC - ' + r.urls[0]);
    assert(r.urls[0].indexOf('user_id') === -1 && r.urls[0].indexOf('display_names') === -1,
      'the client still asks for an identity column or joins display_names - ' + r.urls[0]);
  }),

  () => tryRunAsync('HF-10: the name and the ordinal are the SERVER\'s - a quiet finder renders as "An adventurer"', async () => {
    const HF = window.HearthriseHearthfind, r = await hfPoll();
    if (!r.urls.length) { assert(r.got === false, 'an unconfigured client claimed a board read'); return; }
    assert(r.injected.length === 2, 'expected both board rows on the global tab, got ' + r.injected.length);
    const loud = r.injected[0][1].body, quiet = r.injected[1][1].body;
    assert(/LoudFinder pulled the/.test(loud),
      'THE CONTROL FAILED: the loud finder was not named, so "the quiet one is nameless" proves '
      + 'nothing - ' + loud);
    assert(/An adventurer pulled the/.test(quiet),
      'a nameless (presence_quiet) finder was not rendered as "An adventurer" - ' + quiet);
    assert(!/[0-9a-f]{8}-[0-9a-f]{4}/.test(quiet) && !/user_id/.test(quiet),
      'an account id leaked into the global chat line - ' + quiet);
    assert(/The 2nd ever found in Hearthrise\.$/.test(quiet),
      "the server's ordinal was not printed - " + quiet);
    assert(HF.ordinalFor('emberheart') === 2,
      "the per-item count is not the server's `counts` - " + HF.ordinalFor('emberheart'));
    HF.__setBoardCount('emberheart', 0);
  }),

  () => tryRun('HF-7: an earned title is PROJECTED onto the name — topbar, profile badge and a chooser that only offers what the server granted', () => {
    const HF = window.HearthriseHearthfind;
    assert(HF && typeof HF.noteTitles === 'function' && typeof HF.paintTitle === 'function',
      'the title seam is missing — the client half of the cosmetic projection does not exist');
    const slot = document.getElementById('player-title');
    assert(slot, '#player-title is not in the topbar markup — nothing can render the earned title beside the name');
    try {
      HF.__resetTitles();
      /* THE SERVER'S OWN SHAPE. hr_state_of builds hearthfind_titles as
         jsonb_agg(... order by granted_at) over player_cosmetics, so it is
         oldest-first and every row carries the SERVER's name string. Two rows
         so the "which one" question is real. */
      HF.noteTitles({ state: { hearthfind_titles: [
        { code: 'rootwarden', name: 'Rootwarden', at: '2026-09-01T00:00:00Z' },
        { code: 'emberborn',  name: 'Emberborn',  at: '2026-09-08T00:00:00Z' }
      ] } });

      const earned = HF.earnedTitles();
      assert(earned.length === 2 && earned[1].code === 'emberborn',
        'the projection did not normalise oldest-first — ' + JSON.stringify(earned));
      /* THE DEFAULT is the newest earned: the thing the player just did. */
      const active = HF.activeTitle();
      assert(active && active.code === 'emberborn', 'the default shown title is not the newest earned — '
        + JSON.stringify(active));
      assert(slot.textContent === 'Emberborn' && slot.classList.contains('hide') === false,
        'the topbar slot did not paint the projected title — "' + slot.textContent + '"');
      assert(HF.titleBadgeHtml().indexOf('Emberborn') !== -1,
        'the profile-card badge does not carry the projected title — ' + HF.titleBadgeHtml());

      /* THE CHOICE. Only codes the server projected are accepted; the pick is
         a preference over a server-owned set, never a new fact. */
      const chips = HF.titlesSection();
      assert(chips.indexOf('data-hf-title="rootwarden"') !== -1
        && chips.indexOf('data-hf-title="emberborn"') !== -1,
        'the chooser does not offer both earned titles — ' + chips);
      const picked = HF.chooseTitle('rootwarden');
      assert(picked && picked.code === 'rootwarden', 'choosing an earned title did not take');
      assert(slot.textContent === 'Rootwarden', 'the topbar did not repaint on the choice — "' + slot.textContent + '"');
      assert(HF.chooseTitle(HF.NO_TITLE) === null && slot.textContent === ''
        && slot.classList.contains('hide'),
        'choosing None did not clear the badge — "' + slot.textContent + '"');
    } finally {
      HF.__resetTitles();
    }
  }),

  () => tryRun('HF-8: NO projection ⇒ NO title — an absent key, an empty grant and a forged pick all render nothing', () => {
    const HF = window.HearthriseHearthfind;
    const slot = document.getElementById('player-title');
    assert(slot, '#player-title is not in the topbar markup');
    try {
      HF.__resetTitles();
      /* (1) A CLIENT THAT HAS SEEN NOTHING wears nothing. This is the fail-safe
         CLAUDE.md §6 asks for: the absence of a server statement is "not
         unlocked", never a guess from the inventory. */
      assert(HF.activeTitle() === null && HF.titleBadgeHtml() === '' && HF.titlesSection() === '',
        'a client with no projection rendered a title anyway');
      HF.paintTitle();
      assert(slot.textContent === '' && slot.classList.contains('hide'),
        'the topbar slot showed something with nothing projected — "' + slot.textContent + '"');

      /* (2) AN ENVELOPE THAT SAYS NOTHING ABOUT TITLES changes nothing — key
         presence, not truthiness, so a mixed-deploy window cannot erase an
         earned title. */
      HF.noteTitles({ state: { hearthfind_titles: [{ code: 'tidesworn', name: 'Tidesworn', at: null }] } });
      assert(HF.activeTitle().code === 'tidesworn', 'the projection did not land');
      assert(HF.noteTitles({ state: { gold: 5 } }) === null && HF.activeTitle().code === 'tidesworn',
        'an envelope with no hearthfind_titles key wiped the last projection');

      /* (3) AN EMPTY GRANT IS A STATEMENT and must clear. */
      HF.noteTitles({ state: { hearthfind_titles: [] } });
      assert(HF.activeTitle() === null && slot.textContent === '',
        'an empty projection did not clear the title');

      /* (4) A FORGED PICK CANNOT MINT ONE. The pick is stored client-side, so
         the property that matters is that it only ever SELECTS from the
         projection: a code the server never granted renders nothing here and
         falls back to the default when there is one. */
      const st = window.HearthriseStorage;
      assert(st && typeof st.set === 'function', 'the storage seam is missing — the pick has nowhere honest to live');
      st.set('hearthrise:hearthfind:title', 'wonderkeeper');   // hand-edited, as an attacker would
      assert(HF.activeTitle() === null && HF.titleBadgeHtml() === '',
        'a forged pick rendered with nothing projected — the client authored a cosmetic the server did not grant');
      HF.noteTitles({ state: { hearthfind_titles: [{ code: 'deepdelver', name: 'Deepdelver', at: null }] } });
      assert(HF.activeTitle().code === 'deepdelver',
        'the forged pick beat the server projection — "wonderkeeper" was never granted to this character');

      /* (5) A MALFORMED ROW IS NOT RENDERABLE and is dropped rather than drawn
         as a raw id. */
      HF.noteTitles({ state: { hearthfind_titles: [{ code: 'ghost' }, null, { name: 'Nameless' }] } });
      assert(HF.activeTitle() === null && HF.titlesSection() === '',
        'a row with no name or no code survived normalisation');
    } finally {
      HF.__resetTitles();
    }
  }),

  () => tryRun('b341: the away card SAYS you died, when, and that the rest paid nothing', () => {
    const HD = window.HearthriseHome;
    assert(HD && typeof HD.__awayCardHtml === 'function',
      'the away card renderer has no test seam — a card whose text nothing can assert is a card that will lie again');
    /* THE MEASURED BUG. A new character set on the game's own Recommended foe
       died ~60s into an 8h absence: 3 kills, 51 XP, 7 gold, `combat.died:true`.
       The toast that mentioned it is gone in ten seconds; the DURABLE Home card
       read "8h away — +51 XP · +3 items · +7 gold … At the base rate", which a
       player correctly reads as eight hours of honest pay. */
    const died = {
      hrs: 8, awayMs: 8 * 3600000, gainedXp: 51, gainedItems: 3, gainedGold: 7,
      gainedKills: 3, burnt: 0, crits: 0, featuredMs: 0, featuredDropMult: 1,
      capped: false, blessed: false, buffsPaused: false, rateMult: 1, at: Date.now(),
      /* The measured span: 21 ticks x 2400ms ~= 50 SECONDS of an eight-hour
         night. Sub-minute is the case that matters — a card that floors to
         whole minutes prints "0m in" for exactly the death this was filed for. */
      died: true, diedAfterMs: 50400, diedTo: 'slime',
      combat: { kills: 3, died: true, survivedMs: 50400, diedTo: 'slime', crits: 0 },
    };
    const html = HD.__awayCardHtml(died);
    const text = String(html).replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
    assert(/died/i.test(text),
      'THE b341 BUG: the away card never mentions the death that ended the absence — ' + text);
    assert(/Slime/.test(text),
      'the card does not name what killed you, so "you died" is unactionable — ' + text);
    // The card must state WHEN, or "8h away" and "you died" sit side by side
    // and the player still has to guess which minutes earned. 50400ms is 50s —
    // "0m in" would satisfy a sloppier assertion and tell the player nothing.
    assert(/\b50s\b/.test(text),
      'the card does not say how far into the absence you died — ' + text);
    assert(!/\b0m\b/.test(text),
      'a sub-minute death floored to "0m in", which reads as a broken number — ' + text);
    assert(/paid nothing|earned after/i.test(text),
      'the card does not say the remainder of the absence paid nothing — ' + text);
    assert(/hd-away-note is-bad/.test(String(html)),
      'the death line is not toned as the one clause a player must not skim past');

    // …and the same card must NOT invent a death on an absence that survived.
    const lived = Object.assign({}, died, { died: false, diedAfterMs: 0, diedTo: null,
      combat: { kills: 3, died: false, survivedMs: 8 * 3600000, diedTo: null, crits: 0 } });
    const livedText = String(HD.__awayCardHtml(lived)).replace(/<[^>]*>/g, ' ');
    assert(!/died/i.test(livedText),
      'the card claims a death on an absence that survived — the same lie, pointed the other way');

    /* A pre-b341 receipt carries no death fields at all. It must degrade to
       silence, never to a guess. */
    const legacyShape = { hrs: 8, awayMs: 8 * 3600000, gainedXp: 51, gainedKills: 3, at: Date.now() };
    assert(!/died/i.test(String(HD.__awayCardHtml(legacyShape)).replace(/<[^>]*>/g, ' ')),
      'an old summary with no death payload produced a death line — the renderer is inferring');

    /* THE OTHER SURFACE. The welcome-back modal is the FIRST thing a returning
       player reads, and it put "Time away 8h 0m" directly above "Total kills 2"
       with the death between them unsaid. It reads the same receipt. */
    const G = window.G;
    const save = { los: G.lastOfflineSummary, lastSeen: G.lastSeen, lastWelcome: G.lastWelcome };
    try {
      G.lastOfflineSummary = died;
      G.lastSeen = Date.now() - 8 * 3600000;
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      assert(typeof window.__maybeShowWelcome === 'function',
        'the welcome-back modal has no test seam — and `window.maybeShowWelcome` is a no-op stub that '
        + 'the welcome-v2 block installs, so asserting through that name would grade nothing');
      const rowsEl = document.getElementById('welcome-rows');
      assert(rowsEl, 'the welcome-back modal did not build');
      const t2 = (rowsEl.textContent || '').replace(/\s+/g, ' ');
      /* ── REV. 2 WORDING, SAME PROPERTY (Recovery Rule, 2026-09-06) ────────
         A death is an INTERRUPTION now, not the end of the night, so the modal
         says "you fell" rather than "you died" — but the three facts b341 was
         filed for are unchanged and are what this asserts: that it is MENTIONED
         at all, that it NAMES the foe, and that it says HOW FAR IN.
         ⚠ THIS RECEIPT STATES `died` AND NO `deaths` — the pre-Recovery shape,
           and the shape the currently deployed hr-accrue still writes. It is
           here deliberately: gating the fall line on the recovery count deleted
           it outright for every one of those receipts, which is the b341 bug
           returning through the back door. */
      assert(/You fell once/.test(t2),
        'THE b341 BUG: the first screen a returning player sees reports the hours and the kills and '
        + 'never mentions the death that ended the night — ' + t2);
      assert(/Slime/.test(t2), 'the modal does not name what killed you — ' + t2);
      assert(/50s in/.test(t2), 'the modal does not say how far in you died — ' + t2);
      /* …AND IT CLAIMS NOTHING RECOVERY NEVER TOLD IT. A receipt with no
         `deaths`/`recoverMs` payload has no basis for the 40% line, the ladder
         or "your run picked up" — every one of those would be the renderer
         inferring, which is the rule b341 exists to enforce. */
      assert(!/40% health|picked up|Recovery grows|Still recovering/.test(t2),
        'the modal invented a recovery story from a receipt that states only a death — ' + t2);
      assert(!/💀|☠/.test(rowsEl.innerHTML),
        'the death row shipped an emoji as art — the project uses the glyph atlas');
      // …and it must stay silent when nobody died.
      G.lastOfflineSummary = null; G.lastWelcome = 0;
      window.__maybeShowWelcome();
      assert(!/You fell|You died/.test(document.getElementById('welcome-rows').textContent || ''),
        'the modal claims a death with no receipt saying so');
    } finally {
      const ov = document.getElementById('welcome-overlay'); if (ov) ov.classList.remove('show');
      Object.assign(G, save);
    }
  }),

  () => tryRun('b341: the away SIMULATION states how long it survived and what killed you — and the translator mirrors it', () => {
    /* THE RULE: a renderer may never INFER why a night was short. The engine
       states it, the translator carries it, the card prints it. b339's escaped
       mutation was in the CALLER, not the module, so both halves are graded.

       b515 — BOTH HALVES MOVED HOUSE, and neither property did:
         · the SIMULATION half drove `window.simulateAwayCombat()`, a client
           wrapper that b515 left with no production caller. It is driven
           through `awaySpan` instead — `simulateSpan` itself, the function
           tools/pack-edge.mjs vendors into hr-accrue, on a plain state.
         · the CALLER half drove `window.processOffline()`, which used to build
           `lastOfflineSummary` itself. The caller is now
           `applyServerEnvelope` -> `accrue.js summaryFromAway`, and that is
           what is graded here.

       ⚠ AND THE WIRE BETWEEN THEM IS BROKEN — see applyAwayEnvelope's header
         and DISCOVERIES.md (2026-09-07, P1). `deaths`/`recoverMs`/
         `recoverRemainingMs`/`recoverLadder` ARE read by summaryFromAway and
         are NOT sent by hr-accrue/index.ts, so on a live envelope every one of
         them is 0 and the recovery rows on the card are blank. This test grades
         the translator, which is correct; it does not and cannot claim the
         player sees these numbers today. */
    const G = window.G;
    const A = window.HearthriseAccrual;
    const snap = snapshotG();
    try {
      /* (1) THE SIMULATION. A level-1 character bare-handed against a Tier-7
         foe dies almost at once, and must say WHEN and TO WHAT. The rolls are
         the real ones here (not awaySpan's always-hit pair), because a death is
         the subject. */
      const m = window.MONSTERS.dragon;
      assert(m, 'the fixture needs a dragon');
      const r = awaySpan({
        monster: 'dragon', spanMs: 8 * 3600000,
        state: { playerHp: 10, playerMaxHp: 10, equipment: {}, skills: {}, recoveringUntilMs: 0 },
        ctx: {
          playerRolls: () => ({ accuracy: 1, maxHit: 1, critChance: 0 }),
          monsterRolls: () => ({ accuracy: 1e9, maxHit: 9999 }),
        },
      });
      const sum = r.out;
      assert(sum && sum.died === true, 'the fixture did not produce a death; pick a deadlier foe');
      assert(typeof sum.survivedMs === 'number' && sum.survivedMs > 0,
        'THE b341 BUG: the simulation reports `died` but not WHEN — survivedMs=' + sum.survivedMs);
      assert(sum.survivedMs < 8 * 3600000,
        'a death reported the whole absence as survived (' + sum.survivedMs + 'ms of ' + (8 * 3600000) + ')');
      assert(sum.diedTo === 'dragon',
        'the simulation did not name the foe that landed the killing blow (got ' + sum.diedTo + ') — '
        + 'the death fx clears activeMonster, so it has to be captured before the tick');
      /* rev. 2: a death INTERRUPTS. The ladder as CHARGED, one rung per fall,
         stated by the simulation so no card has to regenerate the doubling. */
      assert((sum.deaths || 0) >= 1, 'the simulation counts no falls: ' + sum.deaths);
      assert(Array.isArray(sum.recoverLadder) && sum.recoverLadder.length === sum.deaths,
        'the ladder does not carry one rung per fall (' + (sum.recoverLadder || []).length
        + ' rungs for ' + sum.deaths + ' falls) — a renderer would have to regenerate it and be wrong');
      assert(sum.recoverLadder[0] === 0,
        'the first fall of the day was charged ' + sum.recoverLadder[0] + 'ms — it is free');

      /* (2) THROUGH THE CALLER. The module can be perfect and the receipt still
         silent: the flat `lastOfflineSummary` every welcome-back surface reads
         is built by summaryFromAway, and dropping a mirror there is exactly the
         mutation that slipped past b339 (module covered, caller not).
         MUTATION: delete any of the `died`/`diedAfterMs`/`diedTo`/`deaths`/
         `recoverMs`/`recoverLadder` lines from summaryFromAway → red below. */
      const landed = applyAwayEnvelope({
        grantMs: 8 * 3600000, awayMs: 8 * 3600000, paidMs: sum.survivedMs,
        kills: sum.kills || 0, crits: sum.crits || 0, gold: 0, xp: {}, items: {},
        died: true, diedTo: 'dragon',
        deaths: sum.deaths, recoverMs: sum.recoverMs || 0,
        recoverRemainingMs: sum.recoverRemainingMs || 0,
        recoverLadder: sum.recoverLadder,
        capped: false, blessed: false,
      });
      const rec = landed.rec;
      assert(rec, 'the envelope wrote no welcome-back receipt at all');
      assert(rec.died === true,
        'THE b341 BUG: the receipt the Home card reads does not carry `died`, so the card cannot say it — '
        + JSON.stringify({ died: rec.died, combat: rec.combat && rec.combat.died }));
      assert(typeof rec.diedAfterMs === 'number' && rec.diedAfterMs > 0,
        'the receipt does not carry WHEN you died (diedAfterMs=' + rec.diedAfterMs + ')');
      assert(rec.diedTo === 'dragon',
        'the receipt does not carry WHAT killed you (diedTo=' + rec.diedTo + ')');
      assert(rec.diedAfterMs < (rec.awayMs || Infinity),
        'the receipt claims the whole absence was survived by a character who died in it');
      assert(rec.deaths === sum.deaths,
        'the receipt states a death and counts ' + rec.deaths + ' falls against the simulation\'s '
        + sum.deaths + ' — the card cannot say how many');
      assert(Array.isArray(rec.recoverLadder) && rec.recoverLadder.length === rec.deaths,
        'the ladder does not carry one rung per fall (' + (rec.recoverLadder || []).length
        + ' rungs for ' + rec.deaths + ' falls) — a renderer would have to regenerate it and be wrong');
      assert(rec.recoverLadder[0] === 0,
        'the first fall of the day was charged ' + rec.recoverLadder[0] + 'ms — it is free');
      assert(rec.deaths === 1 || rec.recoverMs > 0,
        'a night with ' + rec.deaths + ' falls spent no time Knocked Out: ' + rec.recoverMs);
      assert(rec.recoverMs <= rec.awayMs,
        'more of the night was spent recovering than the night was long: '
        + rec.recoverMs + ' of ' + rec.awayMs);
      assert(typeof rec.recoverRemainingMs === 'number' && rec.recoverRemainingMs >= 0,
        'the receipt cannot say whether the character is still down: ' + rec.recoverRemainingMs);
      /* AND IT LABELS ITSELF. A screenshot, a bug report and a renderer can all
         tell a server-stated receipt from a locally computed one — there is no
         locally computed one any more, so this is the label that says so. */
      assert(rec.serverAuthoritative === true, 'the receipt does not label itself server-stated');
    } finally {
      try { window.HearthriseAccrual.__resetAwayReceipt(); } catch (e) {}   // the away holder outlives G
      restoreGAndRecord(snap);
    }
  }),

  () => tryRun('rev.2: the DURABLE away card describes a recovery night as one that kept paying', () => {
    /* THE MEASURED LIE. The welcome-back modal was reconciled with the Recovery
       Rule; the Home dashboard's away card — the surface that is still there
       after the modal is dismissed, and the only one a player can go back and
       read — was not. It rendered the terminal-death sentence off
       `diedAfterMs || survivedMs`: "You died to Slime 50s in — the remaining
       11h 59m paid nothing." on a night that fell thirteen times, got back up
       thirteen times and banked the lot. Two surfaces, one receipt, opposite
       stories, and the durable one was wrong.

       Everything below reads a field the receipt STATES (`deaths`, `recoverMs`,
       `recoverRemainingMs`, `stoppedBy`) — nothing is re-derived, which is the
       whole rule the b341 death line was written under.
       MUTATION PROVEN: restore the old `t +=` fall-through (drop the
       `statedDeaths >= 1` branch) and case (a) fails on both the falls count
       and the "nothing earned after" prohibition. */
    const H = window.HearthriseHome;
    assert(H && typeof H.__awayCardHtml === 'function', 'the away card seam must exist');
    const flat = (rec) => String(H.__awayCardHtml(rec))
      .replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
    const NIGHT = {
      hrs: 12, awayMs: 12 * 3600000, gainedXp: 4100, gainedItems: 88, gainedGold: 260,
      gainedKills: 210, crits: 12, featuredMs: 0, featuredDropMult: 1,
      capped: false, blessed: false, buffsPaused: false, rateMult: 1, at: Date.now(),
    };

    /* (a) A REV. 2 NIGHT. Thirteen falls, two hours of it Knocked Out, and the
       run picked up every time — `survivedMs` is the span that EARNED, not the
       span before the first fall. */
    const rev2 = Object.assign({}, NIGHT, {
      died: true, deaths: 13, diedTo: 'slime', diedAfterMs: 50400,
      recoverMs: 2 * 3600000, recoverRemainingMs: 0,
      recoverLadder: [0, 120000, 240000], stoppedBy: null,
      combat: { kills: 210, died: true, survivedMs: 10 * 3600000, diedTo: 'slime', crits: 12 },
    });
    const aTxt = flat(rev2);
    assert(/You fell 13 times to the Slime/.test(aTxt),
      'the card does not state how many falls the night held — ' + aTxt);
    assert(/knocked out for 2h in total/.test(aTxt),
      'the card does not price the time spent Knocked Out, which is the only cost a '
      + 'recovery night actually has — ' + aTxt);
    assert(/your run picked up each time/i.test(aTxt),
      'the card never says the run carried on — the single most important fact about '
      + 'a night with falls in it — ' + aTxt);
    assert(!/nothing (was )?earned after|paid nothing/i.test(aTxt),
      'THE REV. 2 LIE: the durable card still tells a player who banked a full night '
      + 'that their absence stopped paying — ' + aTxt);

    /* Still down when they got back: the durable surface owes this too, or it
       describes a character who is fighting while the server refuses swings. */
    const stillDown = flat(Object.assign({}, rev2, { recoverRemainingMs: 47000 }));
    assert(/Still recovering — 47s to go/.test(stillDown),
      'the card does not say the character is still Knocked Out — ' + stillDown);
    assert(!/Still recovering/.test(aTxt),
      'a night that finished its recovery still claims time owed — ' + aTxt);

    /* A SINGLE stated fall keeps its "when" — it is the only detail it has. */
    const oneFall = flat(Object.assign({}, rev2, { deaths: 1, recoverMs: 120000,
      recoverLadder: [120000] }));
    assert(/You fell to the Slime 50s in — knocked out for 2m, then your run picked up\./.test(oneFall),
      'the one-fall recovery night lost its shape — ' + oneFall);

    /* (b) A LEGACY RECEIPT — `died` with NO `deaths`, which is what the
       currently-deployed hr-accrue writes. Exactly ONE fall is stated, and NO
       recovery story is invented: that engine never ran the rule. */
    const legacy = Object.assign({}, NIGHT, {
      died: true, diedTo: 'slime', diedAfterMs: 50400,
      combat: { kills: 3, died: true, survivedMs: 50400, diedTo: 'slime', crits: 0 },
    });
    const bTxt = flat(legacy);
    assert(/You died to Slime 50s in/.test(bTxt),
      'the pre-Recovery death line was deleted — the receipt shape the live edge still writes '
      + 'must keep the sentence it has had since b341: ' + bTxt);
    assert(!/\d+ times|knocked out|picked up|Still recovering/i.test(bTxt),
      'a receipt with no recovery payload was handed a recovery story it has no basis for — ' + bTxt);
    assert(/paid nothing|earned after/i.test(bTxt),
      'the pre-Recovery night no longer says the remainder paid nothing, which for THAT '
      + 'engine was true — ' + bTxt);

    /* (c) AND THE RUN THAT REALLY DID STOP KEEPS THE STOPPED SENTENCE. */
    const stopped = flat(Object.assign({}, rev2, { stoppedBy: 'death' }));
    assert(/paid nothing|earned after/i.test(stopped),
      'a run that genuinely stopped on the death no longer says so — ' + stopped);
    assert(!/picked up/.test(stopped),
      'a run that stopped on the death still tells the player it picked back up — ' + stopped);
  }),

  () => tryRun('RETREAT-A1: the third foodless fall ends the run', () => {
    const { C, CS, AW, FOE, FOOD, MAXHP, mkState, mkCtx, runUntil } = retreatFixture();

      /* ── RETREAT-A1 — THE THIRD FOODLESS FALL ENDS THE RUN ─────────────────
         MUTATION PROVEN: delete the `hasCounter && retreatAtFall(...)` term from
         resolveDeath and this goes red at `retreat` on the third fall. */
      {
        const st = mkState({});
        const falls = runUntil(st, mkCtx(), 8);
        assert(falls.length === AW.RETREAT_FOODLESS_FALLS,
          'A1: the foodless run produced ' + falls.length + ' falls before it ended; the rung is '
          + AW.RETREAT_FOODLESS_FALLS + '. This is the QA night and it must STOP.');
        assert(falls[0].retreat === false && falls[1].retreat === false,
          'A1: the run ended on fall 1 or 2. Rungs 1-2 stay interrupt-don\'t-terminate — ending on '
          + 'the first foodless fall is the pre-rev.2 CLIFF, which was the largest retention loss '
          + 'measured on the beta.');
        const last = falls[falls.length - 1];
        assert(last.retreat === true && last.foodless === true,
          'A1: the third foodless fall did not retreat (retreat=' + last.retreat
          + ', foodless=' + last.foodless + ')');
        assert(st.playerHp === AW.resumeHpFor(MAXHP),
          'A1: the hero stood up on ' + st.playerHp + ' HP, not the 40% resume ('
          + AW.resumeHpFor(MAXHP) + '). A retreat is not a heal.');
        assert(last.recoverMs > 0,
          'A1: the retreating fall was charged ' + last.recoverMs + ' ms. It charges its own ladder '
          + 'rung BEFORE the run ends — a free last fall is a dodge, not a mercy.');
        assert(st.consecFalls === AW.RETREAT_FOODLESS_FALLS,
          'A1: the durable counter reads ' + st.consecFalls + ' — it is what the settle proposes to '
          + 'hr_apply, so a wrong number here is a wrong number on the server.');

      }
  }),
  () => tryRun('RETREAT-A1b: the death sheet says so, in the ruled words', () => {
    const { FOE, MAXHP, mkState, mkCtx, runUntil } = retreatFixture();
    const st = mkState({});
    const falls = runUntil(st, mkCtx(), 8);
    const last = falls[falls.length - 1];
          /* AND THE SHEET SAYS SO, IN THE RULED WORDS. `describeDeath` is the
             sheet's pure model - no DOM, no G - driven from the fields the ENGINE
             just stated, never hand-typed ones.
             ⚠ THE CLOCK IS `recovering_until` MINUS NOW, as the away card does it -
               41 minutes here, pinning the ruling's own example verbatim. */
          const DS = window.HearthriseDeathSheet;
          assert(DS && typeof DS.describeDeath === 'function', 'A1: the death-sheet model seam is gone');
          const T0 = Date.now();
          const m = DS.describeDeath({ monsterName: window.MONSTERS[FOE].name, maxHp: MAXHP,
            deaths: 3, deathsToday: 3, recoveryMs: last.recoverMs, resumeHp: st.playerHp,
            recoveringUntilMs: T0 + 41 * 60000, nowMs: T0, hadFood: false,
            retreat: true, retreatFoodless: last.foodless, retreatFalls: last.consecFalls });
          assert(m.title === 'You pulled back',
            'A1: the death sheet is titled "' + m.title + '". Ended BY CHOICE is not the same as '
            + 'FAILED, and the ruling names the words.');
          /* THE RULED COPY, VERBATIM AND WHOLE - one equality rather than three
             regexes: a partial match is how half a sentence quietly goes missing. */
          assert(m.lead === 'Three falls in a row on an empty bag — you retreated to camp rather than '
            + 'keep going down. Still recovering — 41m to go. The clock runs down on its own; the '
            + 'fight does not restart itself. Bring food, then pick the fight back up.',
            'A1: the sheet does not carry the ruled lead — ' + m.lead);
          /* THE COUNT IS THE ENGINE'S: change RETREAT_FOODLESS_FALLS and this word
             moves with it, because it is looked up rather than typed. */
          assert(/^Three falls/.test(m.lead) && last.consecFalls === 3,
            'A1: the lead does not name the rung the engine actually charged ('
            + last.consecFalls + ') — ' + m.lead);
          assert(m.recoverMsLeft > 0 && m.retreat === true,
            'A1: the model reads recoverMsLeft=' + m.recoverMsLeft + ' retreat=' + m.retreat
            + '. The recovery clock on a retreat is REAL (the retreating fall charged its rung and '
            + 'hr_rest is still the cure); what must not be promised is the RESUME, and that is what '
            + 'the retreat flag says.');
          /* THE CLOCK CLAUSE DISAPPEARS ONCE THE LINE HAS PASSED — never "0s to go",
             which is a sentence about a state the player is no longer in. */
          const upAgain = DS.describeDeath({ monsterName: window.MONSTERS[FOE].name, maxHp: MAXHP,
            deaths: 3, deathsToday: 3, recoveryMs: last.recoverMs, resumeHp: st.playerHp,
            recoveringUntilMs: 0, nowMs: T0, hadFood: false,
            retreat: true, retreatFoodless: true, retreatFalls: last.consecFalls });
          assert(upAgain.lead === 'Three falls in a row on an empty bag — you retreated to camp rather '
            + 'than keep going down. Bring food, then pick the fight back up.',
            'A1: the retreat lead kept a dead clock clause — ' + upAgain.lead);
          /* AND AN ORDINARY FALL IS UNTOUCHED — the regression this override could
             most easily cause. */
          const ord = DS.describeDeath({ monsterName: window.MONSTERS[FOE].name, maxHp: MAXHP,
            deaths: 2, deathsToday: 2, recoveryMs: 120000, resumeHp: 6,
            recoveringUntilMs: Date.now() + 120000, nowMs: Date.now(), hadFood: false });
          assert(ord.title === 'Knocked out' && ord.recoverMsLeft > 0,
            'A1: an ORDINARY fall was rendered as a retreat — title "' + ord.title + '"');
  }),
  () => tryRun('RETREAT-A2: a kill resets the consecutive-fall count', () => {
    const { C, CS, AW, FOE, FOOD, MAXHP, mkState, mkCtx, runUntil } = retreatFixture();
      /* ── RETREAT-A2 — A KILL RESETS THE COUNT ──────────────────────────────
         The ruling's whole premise, and the reason the trigger is CONSECUTIVE
         falls rather than "N deaths a day".
         MUTATION PROVEN: delete `state.consecFalls = 0` from resolveKill and the
         run retreats on the third fall despite the kill in the middle. */
      {
        const st = mkState({});
        runUntil(st, mkCtx(), 2);
        assert(st.consecFalls === 2, 'A2: the fixture did not reach two falls (' + st.consecFalls + ')');
        /* A KILL, through the same resolveKill the live tick and the away replay
           both run - not a hand-written `consecFalls = 0`. */
        CS.resolveKill(st, window.MONSTERS[FOE], mkCtx());
        assert(st.consecFalls === 0,
          'A2: the counter reads ' + st.consecFalls + ' after a kill. "Reset by ANY kill" is what '
          + 'makes a hero who can win at all never retreat.');
        const more = runUntil(st, mkCtx(), 2);
        assert(more.length === 2 && more.every((f) => f.retreat === false),
          'A2: the run ended within two falls of a kill. The count restarts from zero, so it takes '
          + AW.RETREAT_FOODLESS_FALLS + ' fresh consecutive falls to end it again.');
      }
  }),
  () => tryRun('RETREAT-A3: a fed hero gets the other rung - six falls, never three', () => {
    const { C, CS, AW, FOE, FOOD, MAXHP, mkState, mkCtx, runUntil } = retreatFixture();
      /* RETREAT-A3 - A FED HERO GETS THE OTHER RUNG. Six falls, never three: the
         two rungs answer two different questions ("bring provisions" vs "this is
         out of your league") and must not collapse into one.
         ⚠ AUTO-EAT IS OFF on purpose. The point is the BAG, not the eating: a
           hero carrying 400 provisions is not foodless even if nothing feeds them,
           which proves the read is `chooseFood(inventory)`. */
      if (FOOD) {
        const st = mkState({ [FOOD]: 400 });
        const falls = runUntil(st, mkCtx(), 9);
        assert(falls.length === AW.RETREAT_ANY_FALLS,
          'A3: the fed run ended after ' + falls.length + ' falls; the any-hero rung is '
          + AW.RETREAT_ANY_FALLS);
        assert(falls.slice(0, AW.RETREAT_ANY_FALLS - 1).every((f) => f.retreat === false),
          'A3: a hero with 400 provisions in the bag was sent home on the foodless rung. Foodless is '
          + 'read from the bag AT THE FALL, and this bag is full.');
        assert(falls[falls.length - 1].foodless === false,
          'A3: the fed hero\'s last fall was reported foodless with a full bag');
      }
  }),
  () => tryRun('RETREAT-A3b: the fed retreat sentence names the target, not the bag', () => {
    const { FOE, FOOD, MAXHP, mkState, mkCtx, runUntil } = retreatFixture();
    if (FOOD) {
      const st = mkState({ [FOOD]: 400 });
      const falls = runUntil(st, mkCtx(), 9);
          /* AND THE OTHER SENTENCE. The two rungs answer two different questions,
             and a fed hero told to "bring food" has been given advice they took. */
          const last3 = falls[falls.length - 1];
          const T3 = Date.now();
          const m3 = window.HearthriseDeathSheet.describeDeath({
            monsterName: window.MONSTERS[FOE].name, maxHp: MAXHP, deaths: 6, deathsToday: 6,
            recoveryMs: last3.recoverMs, resumeHp: st.playerHp,
            recoveringUntilMs: T3 + 41 * 60000, nowMs: T3, hadFood: true,
            retreat: true, retreatFoodless: last3.foodless, retreatFalls: last3.consecFalls });
          assert(m3.lead === 'Six falls in a row — you retreated to camp. That fight is out of your '
            + 'league for now. Still recovering — 41m to go. The clock runs down on its own; the '
            + 'fight does not restart itself. Pick a softer target when you are back up.',
            'A3: the fed rung does not carry the ruled lead — ' + m3.lead);
          assert(!/Bring food/.test(m3.lead),
            'A3: a hero with 400 provisions was told to bring food — ' + m3.lead);
    }
  }),
  () => tryRun('RETREAT-A6: the countdown must not un-say the retreat', () => {
    const { C, CS, AW, FOE, FOOD, MAXHP, mkState, mkCtx, runUntil } = retreatFixture();
      /* RETREAT-A6 - THE COUNTDOWN MUST NOT UN-SAY THE RETREAT. The defect shipped
         in rev. 3: the model stated `retreat` so the countdown would not rewrite a
         retreat's lead into 'Back on your feet in 3:47' - and the renderer never
         read it. The 1 Hz tick only tested whether the recovery instant was in the
         future, which it IS on a retreat, so the ruled lead was replaced by the
         wrong promise one second after the sheet opened. IT WAS UNREACHABLE FROM
         ANY TEST inside a `setInterval`; the decision is now a pure function
         (`__leadTick`). MUTATION PROVEN: delete the `model.retreat` branch. */
      {
        const DS = window.HearthriseDeathSheet;
        assert(DS && typeof DS.__leadTick === 'function',
          'A6: the countdown\'s decision is inline again. A branch no test can call is the branch '
          + 'that shipped unread in rev. 3.');
        const retreatModel = { retreat: true, retreatFoodless: true, retreatFalls: 3,
          title: 'You pulled back' };
        const t41 = DS.__leadTick(retreatModel, 41 * 60000);
        assert(t41 === 'Three falls in a row on an empty bag — you retreated to camp rather than '
          + 'keep going down. Still recovering — 41m to go. The clock runs down on its own; the '
          + 'fight does not restart itself. Bring food, then pick the fight back up.',
          'A6: the tick rewrote the retreat lead — ' + t41);
        assert(!/Back on your feet/.test(t41),
          'A6: one second after the sheet opened it promised the fight resumes. After a retreat the '
          + 'settle has idled the pointer and it does not.');
        /* AND AT ZERO IT STILL DOES NOT PROMISE A RESUME — the clock clause drops,
           the rest of the sentence stands. */
        const t0 = DS.__leadTick(retreatModel, 0);
        assert(t0 === 'Three falls in a row on an empty bag — you retreated to camp rather than '
          + 'keep going down. Bring food, then pick the fight back up.',
          'A6: the expired retreat lead is wrong — ' + t0);
      }
  }),
  () => tryRun('RETREAT-A6b: the ordinary countdown is byte-for-byte what it was', () => {
    const DS = window.HearthriseDeathSheet;
    /* THE REGRESSION THIS EXTRACTION COULD MOST EASILY CAUSE - pulling the
       tick's decision out must change NOTHING for a fall that DOES resume. */
          assert(DS.__leadTick({ retreat: false }, 107000) === 'Back on your feet in 1:47.',
            'A6: the ordinary countdown changed — ' + DS.__leadTick({ retreat: false }, 107000));
          assert(DS.__leadTick({ retreat: false }, 0) === 'You are back on your feet.',
            'A6: the ordinary countdown\'s zero case changed');
  }),
  () => tryRunAsync('RETREAT-A5: warn, never refuse - the pre-fight gate end to end', async () => {
    const { C, CS, AW, FOE, FOOD, MAXHP, mkState, mkCtx, runUntil } = retreatFixture();
      /* ── RETREAT-A5 — WARN, NEVER REFUSE ───────────────────────────────────
         The ruling REJECTED refusing an overmatched fight by name (the
         residue-ahead class: beating something you should not be able to beat is
         a reward). So the pre-fight check is ADVISORY, the default button is
         "Fight anyway", and the server never reads it. */
      {
        assert(typeof window.__hrPreFightWarning === 'function',
          'A5: the pre-fight warning seam is missing');
        const w = window.__hrPreFightWarning(FOE);
        /* The warning is a FORECAST of the LIVE character, so on a well-equipped
           QA save there may be nothing to warn about. Either way it never
           REFUSES, and when it speaks it speaks the ruled words. */
        if (w) {
          assert(w.kind === 'no-food' || w.kind === 'unwinnable',
            'A5: an unknown warning kind "' + w.kind + '" — the ruling has exactly two');
          if (w.kind === 'no-food') {
            assert(/^You have no food\./.test(w.body)
              && /every fall today costs longer to shake off\.$/.test(w.body),
              'A5: the no-food warning is not the ruled sentence — ' + w.body);
          } else {
            assert(/would take you down before you took it down/.test(w.body)
              && /better gear or a few more levels\.$/.test(w.body),
              'A5: the unwinnable warning is not the ruled sentence — ' + w.body);
          }
        }
        /* AND THE FORECAST IS PURE - asked twice, the live save is unchanged and
           the answer is the same. A warning that flickered between two taps
           teaches the player to ignore it. */
        const hpBefore = window.G.playerHp;
        const invBefore = JSON.stringify(window.G.inventory || {});
        const w2 = window.__hrPreFightWarning(FOE);
        assert(window.G.playerHp === hpBefore && JSON.stringify(window.G.inventory || {}) === invBefore,
          'A5: asking "should I fight?" CHANGED the character. forecastFight must clone.');
        assert(JSON.stringify(w) === JSON.stringify(w2),
          'A5: two forecasts of the same state disagreed — the seed is not fixed');

        /* THE REAL GATE, DRIVEN END TO END against the LIVE `startCombat` on the
           ruling's population - empty bag, 13 max HP - not the pure forecast:
             ONCE PER MONSTER ID PER TAB SESSION (not per kind)
             NEVER WHILE A FIGHT RUNS / NEVER WHEN THE BAG HAS FOOD
             ANY DISMISSAL resolves as "Fight anyway" and STARTS the fight.
           The last is why this is `tryRunAsync`: a sync runner would assert
           BEFORE the fight it proves. ⚠ try/finally tears down fight and dialog. */
        const D = window.HearthriseDialog;
        const hadFlag = window.__HR_TEST_HARNESS__;
        const wasFighting = window.G.activeMonster;
        const savedInv = window.G.inventory;
        const savedMax = window.G.playerMaxHp; const savedHp = window.G.playerHp;
        /* ⚠ MICROTASKS ONLY - NEVER `setTimeout`, AND THIS IS A MEASURED FLAKE.
           Every dismissal below starts a REAL fight on the ruling's population;
           the fixture stops it on the next line, so it lives exactly as long as
           this helper yields - and a `setTimeout(0)` CROSSES A MACROTASK BOUNDARY,
           precisely when `setInterval(combatTick)` may run. Measured at 1 run in
           3: the tick landed, the character fell, and an overlay outlived the
           fixture. `.then(go,go)` is a MICROTASK, so awaiting the queue cannot let
           a timer fire; two turns because `go` queues behind the resolve. */
        const settle = () => Promise.resolve().then(() => {}).then(() => {});
        try {
          window.stopCombat();
          /* THE POPULATION THE RULING IS ABOUT: empty bag, 13 max HP. Restored in
             the finally below — this is the live save. */
          window.G.inventory = {};
          window.G.playerMaxHp = MAXHP; window.G.playerHp = MAXHP;

          /* (0) THE HARNESS IS ONE MORE DISMISSAL - asserted FIRST and with the
             flag still on, because the other thirty `startCombat` callers depend
             on it: under the harness the fight starts SYNCHRONOUSLY and no modal
             is raised. MEASURED - before this rule a foodless `startCombat` left
             `activeMonster` null AND an overlay nothing would ever answer. */
          window.__HR_TEST_HARNESS__ = true;
          window.__hrClearFightWarnings();
          assert(!!window.__hrFightGate(FOE),
            'A5: the gate had nothing to say about ' + FOE + ' on an empty bag at 13 max HP, so the '
            + 'harness case below would prove nothing. This is the exact state the ruling was '
            + 'written about.');
          window.startCombat(FOE);
          assert(window.G.activeMonster === FOE,
            'A5: under the test harness the warned tap did not start the fight. The harness is one '
            + 'more DISMISSAL, and a dismissal starts the fight — a warning may delay a tap, it may '
            + 'never eat one.');
          assert(!(D && D.isOpen && D.isOpen()),
            'A5: the harness raised a modal nothing in this run can answer. That is the b221 overlay '
            + 'cascade: one leaked modal fails the next thirty tests, thousands of lines away.');
          window.stopCombat();
          /* AND THE LATCH IS SPENT - the assertion that tells the RULE from the
             blanket skip it replaces. MEASURED: with the old
             `&& !window.__HR_TEST_HARNESS__` back on the gate, every other
             assertion still passes, because a skipped gate also starts the fight.
             A DISMISSAL does both: starts the fight AND spends the warning. */
          assert(window.__hrFightGate(FOE) === null,
            'A5: the harness tap did not consume the latch, so the harness is SKIPPING the gate '
            + 'rather than dismissing it. The ruling makes the harness one more dismissal, and a '
            + 'dismissal spends the warning.');

          window.__HR_TEST_HARNESS__ = false;
          window.__hrClearFightWarnings();
          const warned = window.__hrFightGate(FOE);
          assert(warned && warned.kind === 'no-food',
            'A5: a 13-HP hero with an empty bag was not warned about ' + FOE + '.');
          assert(!/\b1 minutes\b/.test(warned.body),
            'A5: the warning says "1 minutes" — ' + warned.body);

          /* ── (1) A WARNED TAP WITHHOLDS THE FIGHT AND RAISES THE DIALOG ─── */
          window.startCombat(FOE);
          assert(!window.G.activeMonster,
            'A5: the warned tap started the fight without saying anything. The player is owed the '
            + 'sentence before the swing.');
          assert(D && D.isOpen && D.isOpen(),
            'A5: no dialog was raised, so the player is refused in silence — which is the one thing '
            + 'the ruling forbids.');
          /* ONE BUTTON, because every exit means the same thing: a "Not yet"
             control beside a dialog whose Escape starts the fight is a label
             that does not describe what the control does. */
          const ov = document.getElementById(D.OVERLAY_ID);
          assert(ov && !ov.querySelector('[data-hrc="no"]'),
            'A5: the warning still carries a cancel button. ANY dismissal starts the fight, so a '
            + 'second control labelled "Not yet" is a lie about what it does.');
          assert(/Fight anyway/.test(((ov.querySelector('[data-hrc="yes"]') || {}).textContent) || ''),
            'A5: the one button is not "Fight anyway" — the ruling names the words.');

          /* ── (2) ESCAPE IS A DISMISSAL, AND A DISMISSAL STARTS THE FIGHT ── */
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await settle();
          assert(!D.isOpen(), 'A5: Escape did not close the warning');
          assert(window.G.activeMonster === FOE,
            'A5: Escape ATE the tap. Every exit from this dialog — Escape, the backdrop, the button '
            + '— resolves as "Fight anyway"; a warning may delay a tap, it may never eat one.');
          window.stopCombat();

          /* ── (3) WARN ONCE PER MONSTER ID, PER TAB SESSION ───────────────── */
          window.startCombat(FOE);
          assert(window.G.activeMonster === FOE && !D.isOpen(),
            'A5: the second tap was warned again. A modal on every re-tap trains the player to '
            + 'dismiss it without reading, which is the same as not warning.');
          window.stopCombat();
          assert(window.__hrFightGate(FOE) === null,
            'A5: the latch is keyed by KIND rather than by monster id — the same foe can then warn '
            + 'twice about one decision (no food, then out of your league).');

          /* ── (4) NEVER WHILE A FIGHT IS ALREADY RUNNING ──────────────────── */
          window.__hrClearFightWarnings();
          assert(!!window.__hrFightGate(FOE), 'A5: control — the gate must speak again once cleared');
          window.startCombat(FOE, { confirmed: true });
          assert(window.G.activeMonster === FOE,
            'A5: "Fight anyway" did not start the fight. The warning is ADVISORY — refusing an '
            + 'overmatched fight was rejected by name as the residue-ahead class.');
          assert(window.__hrFightGate(FOE) === null,
            'A5: the gate spoke mid-fight. A tap while a fight is running is a SWITCH, and answering '
            + 'the dialog re-enters startCombat — so the warning would interrupt the run it exists '
            + 'to protect.');
          window.stopCombat();

          /* ── (5) NEVER WHEN THE BAG HAS FOOD ────────────────────────────── */
          if (FOOD) {
            window.__hrClearFightWarnings();
            window.G.inventory = {};
            assert(!!window.__hrFightGate(FOE), 'A5: control — the empty bag must still warn');
            window.G.inventory = { [FOOD]: 5 };
            assert(window.__hrFightGate(FOE) === null,
              'A5: a hero carrying provisions was warned. This warning exists for the empty-bag '
              + 'population the Retreat was written about; a fed hero who is outmatched finds that '
              + 'out by fighting, and finding out by fighting is the reward the ruling refused to '
              + 'take away.');
            window.G.inventory = {};
          }

          /* ── (6) THE BACKDROP IS A DISMISSAL TOO ─────────────────────────── */
          window.__hrClearFightWarnings();
          window.startCombat(FOE);
          assert(!window.G.activeMonster && D.isOpen(), 'A5: the warned tap did not raise the dialog');
          const ov2 = document.getElementById(D.OVERLAY_ID);
          ov2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await settle();
          assert(!D.isOpen() && window.G.activeMonster === FOE,
            'A5: clicking the backdrop ate the tap. Every way out of this dialog starts the fight.');
          window.stopCombat();
        } finally {
          try { if (D && D.isOpen && D.isOpen()) D.close(); } catch (e) {}
          try { window.stopCombat(); } catch (e) {}
          /* AND THE DEATH SHEET, BELT AND BRACES - this fixture points a doomed
             character at a real fight, and if it ever DOES fall the sheet must
             not outlive the fixture. Cheap, idempotent, the named teardown. */
          try { window.HearthriseDeathSheet.__resetForTest(); } catch (e) {}
          window.__HR_TEST_HARNESS__ = hadFlag;
          window.G.inventory = savedInv;
          window.G.playerMaxHp = savedMax; window.G.playerHp = savedHp;
          window.__hrClearFightWarnings();
          if (wasFighting) { try { window.startCombat(wasFighting, { confirmed: true }); } catch (e) {} }
        }
      }
  }),
  () => tryRun('RETREAT-W5a: the foodless retreat sentence, verbatim on the away card', () => {
    /* (i) THE FOODLESS SENTENCE, VERBATIM. The receipt and its flattened text
       are the fixture's - built there once for every battery that reads them. */
    const { fTxt } = retreatFixture();
          assert(/You ran out of food and fell three times in a row, so you pulled back to camp 2h 14m in\./
            .test(fTxt), 'W5: the foodless retreat sentence is not the ruled copy — ' + fTxt);
          assert(/The rest of the night was rest — bring provisions before the next hunt\./.test(fTxt),
            'W5: the foodless retreat lost its second clause, which is the only actionable one — ' + fTxt);
          assert(!/picked up each time|picked up\./.test(fTxt),
            'W5: the card promises the run "picked up" on a night the hero went home. Two sentences '
            + 'about one night that contradict each other is how a player learns to distrust both — '
            + fTxt);
          assert(!/ran out of materials/.test(fTxt),
            'W5: the retreat fell through to the SUPPLIES sentence — a fabricated cause on the one '
            + 'surface that exists to state a real one — ' + fTxt);
  }),
  () => tryRun('RETREAT-W5b: the fed retreat sentence names the foe, not the bag', () => {
    const { FOE, H, flat, BASE } = retreatFixture();
          /* (ii) THE FED SENTENCE names the foe and points at the target, not the bag. */
          const fed = Object.assign({}, BASE,
            { retreatMs: 10920000, retreatFalls: 6, retreatFoodless: false, deaths: 6 });
          const dTxt = flat(fed);
          assert(/Six falls in a row to the .+, so you pulled back to camp 3h 02m in\./.test(dTxt),
            'W5: the fed retreat sentence is not the ruled copy — ' + dTxt);
          assert(/out of your league for now — try a softer target or better gear\./.test(dTxt),
            'W5: the fed retreat lost the advice that distinguishes it from the foodless one — ' + dTxt);
  }),
  () => tryRun('RETREAT-W5c: "Still recovering" survives a retreat', () => {
    const { down } = retreatFixture();
          /* (iii) "STILL RECOVERING" SURVIVES A RETREAT. The retreating fall
             charged its rung; that clock is the player's next constraint, and the
             ruling says this sentence is unchanged. */
          assert(/Still recovering — 47s to go\./.test(down),
            'W5: a retreat with a live clock does not tell the player they are still down. Pulling '
            + 'back is mercy, not amnesty — ' + down);
  }),
  () => tryRun('RETREAT-W5d: one author for the retreat sentence', () => {
    const { H, foodless, fTxt } = retreatFixture();
          /* (iv) ONE AUTHOR. The welcome-back modal reads this very function, so
             the two surfaces cannot grow two voices for one night. */
          assert(typeof H.retreatSentence === 'function', 'W5: the shared retreat sentence is not exported');
          const s = H.retreatSentence(foodless);
          assert(s && fTxt.indexOf(s) >= 0,
            'W5: the away card and the shared sentence disagree. The modal renders the shared one, so '
            + 'a divergence here IS two voices — ' + s);
          assert(H.retreatSentence(Object.assign({}, foodless, { stoppedBy: null })) === null,
            'W5: a night that did not retreat was handed a retreat sentence');
  }),
  () => tryRun('RETREAT-W5e: one author for the recovery clock line', () => {
    const { FOE, MAXHP, down } = retreatFixture();
          /* (v) AND ONE AUTHOR FOR THE CLOCK LINE - both surfaces say how long
             recovery has to run, in the SAME words, composed once in death-sheet.js.
             The cautionary precedent is the SUPPLIES sentence, which exists three
             times and has drifted. MUTATION: change either wording and this reds. */
          const DS2 = window.HearthriseDeathSheet;
          assert(DS2 && typeof DS2.stillRecovering === 'function',
            'W5: the shared recovery sentence is not exported from death-sheet.js');
          const shared = DS2.stillRecovering(47000);
          assert(shared === 'Still recovering — 47s to go.',
            'W5: the shared recovery sentence is not the ruled copy — ' + shared);
          assert(down.indexOf(shared) >= 0,
            'W5: the away card no longer prints the shared sentence — ' + down);
          const T5 = Date.now();
          const sheet5 = DS2.describeDeath({ monsterName: window.MONSTERS[FOE].name, maxHp: MAXHP,
            deaths: 3, deathsToday: 3, recoveryMs: 240000, resumeHp: 5,
            recoveringUntilMs: T5 + 47000, nowMs: T5, hadFood: false,
            retreat: true, retreatFoodless: true, retreatFalls: 3 }).lead;
          assert(sheet5.indexOf(shared) >= 0,
            'W5: the death sheet words the recovery clock differently from the away card. Two surfaces '
            + 'describing one clock in two voices is how a player learns to distrust both — ' + sheet5);
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     RETREAT-A4 - THE RETREAT SURVIVES A RELOAD.
     THE RULING'S FOURTH PROPERTY, and the only one no other test could reach:
     the run ended, the hero is off their feet, and the player closes the tab.
     When they come back four things must still be true - the character is still
     recovering, the surfaces say so, `hr_rest` is still the only cure and still
     charges food, and THE FIGHT DOES NOT RESTART ITSELF.
     WHAT THIS FOUND. Every existing recovery test (RECOVER-8/10..15) drives
     `applyEnvelopeState`, which runs ONLY on `accrued:true` - and a RETREAT ends
     with the server's pointer IDLE, so the next boot is answered
     `{accrued:false, reason:'idle'}` and it never runs. Driven against the REAL
     record.js boot path with `recovering_until` 32 minutes ahead and
     `consec_falls: 3`, the client came up:
         fallState().phase   "up"      the client believed nobody was down
         recoveringUntilMs() 0
         G.consecFalls       undefined the durable retreat counter was GONE
         activity bar        "Idle - pick an activity"   death sheet: not raised
     which is the reported defect word for word - 27 minutes in which nothing
     earns, with no sheet, no countdown and no Rest button - reached through the
     IDLE-BOOT door rather than the reload door RECOVER-11 closed. And it cost
     the Retreat its own rule: with `consec_falls` forgotten, one reload put the
     player back into the hopeless grind with the count restarted at zero.
     FIXED by routing the always-full boot body through the SAME shared observer
     the accrue path uses (`reconcileFall`, called from record.js settle as
     `hydrationStep('fall')`) - the fifth instance of the idle-boot hydration
     class record.js names - and by giving the activity bar's knocked-out
     readout its IDLE twin (src/render/retreat.js).
     THE TWO MUTATIONS THIS BATTERY IS PROVEN AGAINST:
       - delete `hydrationStep('fall')` from record.js settle (or the
         `recovering_until` clause inside reconcileFall) -> (1) goes red: the
         boot reads phase 'up' with 0 ms left, which is the bug above.
       - make the boot restart the fight (`reconcileActivityPointer` on an IDLE
         answer, or re-pointing G.activeMonster) -> (4) goes red: the retreat
         that ended the run un-ends it on the next boot.
     ⚠ NOTHING HERE TOUCHES THE LIVE CHARACTER. `window.G` is swapped for a
       synthetic object and restored in `finally`, as INV-HYDRATE-1 does, and the
       record transport is reset. The recovery line, the raise latch and the
       sheet are torn down together or a full-screen overlay outlives it. */
  () => tryRunAsync('RETREAT-A4: a retreat survives a reload — still recovering, hr_rest still the '
    + 'only cure, and the fight does not restart itself', async () => {
    const R = window.HearthriseRecord;
    const A = window.HearthriseAccrual;
    const D = window.HearthriseDeathSheet;
    const AW = window.HearthriseCore && window.HearthriseCore.away;
    assert(R && typeof R.requestRecord === 'function', 'A4: the boot record path is not wired');
    assert(A && typeof A.fallState === 'function' && typeof A.recoveringUntilMs === 'function',
      'A4: the fall seam is missing');
    assert(D && typeof D.describeDeath === 'function' && typeof D._restRefusalText === 'function',
      'A4: the death-sheet seams are missing');
    assert(AW && typeof AW.retreatAtFall === 'function',
      'A4: src/core/away.js does not export the Retreat table');

    const FOE = window.MONSTERS.dark_wizard ? 'dark_wizard' : 'slime';
    const realFetch = window.fetch;
    const savedG = window.G;
    /* THE LIVE POINTER IS IDLED FOR THE DURATION, AND RESTORED IN `finally`.
       `refreshActivityBar` reads legacy.js's OWN `G` binding (a module `let`),
       which swapping `window.G` cannot rebind - so without this the bar under
       test is painted from the QA save's real activity and the retreat's own
       readout is never exercised. A retreat ends with the pointer IDLE, so
       idling it here is the state the assertion is about, not a convenience. */
    const savedPtr = { monster: savedG.activeMonster, skill: savedG.activeSkill,
      action: savedG.activeAction, recipe: savedG.activeArtisanRecipe };
    const wasOn = A.isServerAccrualEnabled();
    /* THE RULING'S OWN NUMBER. 32 minutes ahead: comfortably inside the ladder's
       64-minute cap and far enough from any boundary that a slow page cannot
       round it to zero. */
    const UNTIL = Date.now() + 32 * 60000;
    const RUNG = AW.RETREAT_FOODLESS_FALLS;

    try {
      savedG.activeMonster = null; savedG.activeSkill = null;
      savedG.activeAction = null; savedG.activeArtisanRecipe = null;
      D.__resetForTest();
      A.clearFall();
      A.setServerAccrualEnabled(true);

      /* THE SERVER STATE A RETREAT LEAVES BEHIND, every field of it read from
         the boot envelope rather than assumed by the fixture. */
      window.fetch = function (u) {
        if (!/hr_load/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, version: 9, now: new Date().toISOString(),
          state: {
            slot: 0, accrued_to: new Date().toISOString(),
            hp: 5, max_hp: 13,
            active_kind: 'idle', active_id: null,
            recovering_until: new Date(UNTIL).toISOString(),
            consec_falls: RUNG, deaths_today: RUNG, deaths_lifetime: 63,
          },
          skills: {}, inventory: {},
        }), { status: 200 }));
      };
      /* A FRESHLY BOOTED CLIENT: nothing known, no fight, a full bar. This is
         what a reload actually is — the fall MOMENT is gone with the page. */
      window.G = { inventory: {}, offlineBudget: {}, playerHp: 13, playerMaxHp: 13,
        activeMonster: null, skills: {}, stats: {}, combatLog: [] };
      R.resetRecord();
      R.configureRecord({ url: 'https://proj.supabase.co/', apiKey: 'anon-key',
        authToken: () => 'jwt-token', slot: 0 });

      const v = await R.requestRecord();
      assert(v.outcome === 'loaded', 'A4: the boot read did not load: ' + JSON.stringify(v));

      /* ── (1) THE CHARACTER IS STILL RECOVERING ─────────────────────────── */
      const f = A.fallState();
      assert(f.phase === 'recovering',
        'A4: the boot came up phase "' + f.phase + '". The server holds a recovery line 32 minutes '
        + 'ahead and the client believes nobody is down — that is b510 through the IDLE-BOOT door, '
        + 'and a retreat ALWAYS leaves the pointer idle, so it is the only door the Retreat uses.');
      assert(Math.abs(A.recoveringUntilMs() - UNTIL) < 1500,
        'A4: the client is not reading the SERVER\'s instant (' + A.recoveringUntilMs() + ' vs '
        + UNTIL + '). The line is absolute and is never re-derived here.');
      assert(f.msLeft > 31 * 60000 && f.msLeft <= 32 * 60000,
        'A4: ' + Math.round(f.msLeft / 60000) + ' minutes left, not 32');
      assert(f.serverDied === true && f.answered === true,
        'A4: the boot did not treat a running server line as an answered fall');

      /* (1b) AND THE DURABLE RETREAT COUNTER SURVIVED IT - the rule itself.
         `resolveDeath` gates the entire Retreat on `G.consecFalls` being a
         NUMBER, so a reload that drops it hands the player back the hopeless
         grind with the count restarted at zero. Read off `window.G`, the object
         the live tick passes to `simulateTick`: one identity, not a copy. */
      assert(window.G.consecFalls === RUNG,
        'A4: G.consecFalls reads ' + JSON.stringify(window.G.consecFalls) + ' after the reload, not '
        + RUNG + '. The Retreat forgot it fired: the next fall starts a fresh count and the run '
        + 'the realm just ended begins again.');
      assert(window.G.playerHp === 5,
        'A4: the 40% resume did not survive the reload (bar reads ' + window.G.playerHp + ')');

      /* ── (2) THE SURFACES SAY SO. The bar first — it is the always-on
         readout and it is the one a player sees without opening anything. */
      window.refreshActivityBar();
      const nameEl = document.getElementById('ab-name');
      assert(nameEl && /Knocked out/.test(nameEl.textContent),
        'A4: the activity bar reads "' + (nameEl && nameEl.textContent) + '". A player who cannot '
        + 'act for another 32 minutes is being invited to pick an activity: the b510 knocked-out '
        + 'line lives inside the COMBAT branch, and a retreat ends with an IDLE pointer.');
      assert(/32m|31m/.test(nameEl.textContent),
        'A4: the bar does not carry the server\'s clock — ' + nameEl.textContent);
      const metaEl = document.getElementById('ab-meta');
      assert(metaEl && !/resumes automatically/.test(metaEl.textContent || ''),
        'A4: the bar promises the run resumes automatically. After a retreat the server has idled '
        + 'the pointer and it does not — ' + (metaEl && metaEl.textContent));

      /* AND THE SHEET RAISED ITSELF, off the envelope alone. A reload has no
         fall moment, so this is the only trigger there is. */
      const scrim = document.getElementById('hr-death-scrim');
      assert(scrim && scrim.classList.contains('show'),
        'A4: the reload showed the player NOTHING — no sheet, no countdown, no Rest button, for '
        + '32 minutes in which nothing earns.');
      /* COUNTING THE SERVER'S LINE DOWN, IN THE RUN'S OWN WORDS. This read
         "Back on your feet in 31:47" until 2026-09-08, which was the sheet
         promising a resume the idled pointer will never honour (RETREAT-A4b/c);
         the clock is the same server instant, the sentence around it is now the
         ruled one. */
      assert(/Still recovering — 3[12]m to go/.test(scrim.textContent || ''),
        'A4: the raised sheet is not counting the SERVER\'s line down — '
        + (scrim.textContent || '').slice(0, 140));

      /* (3) THE RETREAT COPY, DRIVEN BY THE SERVER'S OWN COUNTER - the ruled
         sentence built from the number the RELOAD hydrated, not a typed 3.
         ⚠ `describeDeath` is asked DIRECTLY here, with the numbers the reload
           hydrated, because this leg is about the COPY surviving a reload. That
           the raised sheet itself now claims the retreat (it did not until
           2026-09-08) is RETREAT-A4b/A4c's subject, asserted there off the
           rendered DOM rather than off a hand-built model. */
      const m = D.describeDeath({
        monsterName: window.MONSTERS[FOE].name, maxHp: 13,
        deaths: RUNG, deathsToday: RUNG, recoveryMs: 32 * 60000, resumeHp: window.G.playerHp,
        /* THE CLOCK IS PINNED TO THE HYDRATED INSTANT, not to Date.now(). Both
           numbers are still the reload's own, but the minute the sentence quotes
           is then arithmetic rather than a race with the page: unpinned, a slow
           boot renders '31m to go' and the assertion is a flake. */
        recoveringUntilMs: A.recoveringUntilMs(), nowMs: A.recoveringUntilMs() - 32 * 60000,
        hadFood: false,
        retreat: true, retreatFoodless: true, retreatFalls: window.G.consecFalls });
      assert(m.title === 'You pulled back', 'A4: the retreat title moved — ' + m.title);
      assert(m.lead === 'Three falls in a row on an empty bag — you retreated to camp rather than '
        + 'keep going down. Still recovering — 32m to go. The clock runs down on its own; the '
        + 'fight does not restart itself. Bring food, then pick the fight back up.',
        'A4: the ruled lead does not survive the reload\'s own numbers — ' + m.lead);
      assert(!/Back on your feet/.test(m.lead),
        'A4: the reload lead promises a resume the idled pointer will not honour — ' + m.lead);

      /* (4) THE FIGHT DOES NOT RESTART ITSELF - the property the whole rule
         rests on. The server idled the pointer; a boot that re-points it hands
         the player the same doomed fight with the counter at the rung. MUTATION:
         call `reconcileActivityPointer` on an idle answer, or drop the
         `act.kind !== 'idle'` test in record.js, and this goes red. */
      assert(!window.G.activeMonster,
        'A4: the boot restarted the fight (' + window.G.activeMonster + '). The server idled the '
        + 'pointer BECAUSE the run ended; re-pointing it on the next boot makes the Retreat a '
        + '32-minute pause instead of an ending.');
      assert(!window.G.activeSkill,
        'A4: the boot started a gather run on a knocked-out character (' + window.G.activeSkill + ')');
      /* And the client is still gated: `isKnockedOut` is what the live tick
         asks before it swings, so a client that answered "no" here would swing
         through the whole window. */
      assert(A.isKnockedOut() === true,
        'A4: the tick gate reads NOT knocked out while the server line runs — the client would '
        + 'swing through a window the server pays nothing for');

      /* (5) hr_rest IS STILL THE ONLY CURE, AND IT STILL CHARGES FOOD. The
         recovery line is SERVER-OWNED with no client setter (RECOVER-8 pins the
         absence of one); the paid cure eats a real provision, and a reload must
         not have invented a free way out. The refusal VOCABULARY is asserted
         unchanged: `insufficient_food` must keep saying nothing was eaten. */
      assert(typeof A.setRecoveringUntil !== 'function' && typeof A.clearRecovery !== 'function',
        'A4: a client-side setter for the recovery line appeared. The reload is exactly when one '
        + 'would be reached for, and it would make the Retreat a page refresh away from nothing.');
      const GC = window.HearthriseGoalClaim;
      assert(GC && typeof GC.rest === 'function',
        'A4: HearthriseGoalClaim.rest is gone — the sheet\'s Rest button has no transport and the '
        + 'knockout has no cure at all');
      const refusal = D._restRefusalText({ error: 'insufficient_food' },
        { maxHp: 13, recoverMsLeft: A.recoveringUntilMs() - Date.now() });
      assert(/^You have no cooked food left/.test(refusal) && /Nothing was eaten\.$/.test(refusal),
        'A4: the empty-bag rest refusal changed — a player who taps Rest with nothing to eat must '
        + 'be told the Hearth ate nothing: ' + refusal);
      assert(/not_recovering/.test(String(D._restRefusalText)) === false
        || D._restRefusalText({ error: 'not_recovering' })
           === 'You are already back on your feet — there is nothing to rest off.',
        'A4: the not_recovering refusal changed');
      assert(D._restRefusalText({ error: 'not_hurt' })
        === 'You are at full health — there is nothing to heal.',
        'A4: the not_hurt refusal changed');
      /* THE SHEET STILL OFFERS IT, AND STILL PRICES IT IN FOOD - a cure nothing
         on screen can reach is not a cure. THIS BAG IS EMPTY, the foodless
         rung's own population, so the DISABLED label is the correct render (the
         sheet must not offer a tap hr_rest will refuse). Both halves are
         asserted, so "food still buys it" cannot rot into "the button went". */
      const restRow = /No food to rest with/.test(scrim.textContent || '');
      assert(restRow,
        'A4: the raised sheet carries no Rest control at all — the one action a downed player has '
        + 'is unreachable after a reload: ' + (scrim.textContent || '').slice(0, 200));
      const fed = D.describeDeath({
        monsterName: window.MONSTERS[FOE].name, maxHp: 13, deaths: RUNG, deathsToday: RUNG,
        recoveryMs: 32 * 60000, resumeHp: 5, recoveringUntilMs: A.recoveringUntilMs(),
        nowMs: A.recoveringUntilMs() - 32 * 60000, hadFood: true, foodQty: 9, missingHp: 8,
        retreat: true, retreatFoodless: false, retreatFalls: RUNG });
      const restAct = (fed.actions || []).filter(function (x) { return x.k === 'rest'; })[0];
      assert(restAct && restAct.disabled !== true && /eat 8 health/.test(restAct.label),
        'A4: with food in the bag the cure is no longer priced in health — hr_rest is bought with '
        + 'FOOD and nothing else (the R10 standing rule): ' + JSON.stringify(restAct));
    } finally {
      savedG.activeMonster = savedPtr.monster; savedG.activeSkill = savedPtr.skill;
      savedG.activeAction = savedPtr.action; savedG.activeArtisanRecipe = savedPtr.recipe;
      window.fetch = realFetch;
      try { R.resetRecord(); R.configureRecord(null); } catch (e) {}
      try { D.__resetForTest(); } catch (e) {}
      try { A.clearFall(); } catch (e) {}
      window.G = savedG;
      try { A.setServerAccrualEnabled(wasOn); } catch (e) {}
      /* The recovery line is module state on the accrual singleton, not on G, so
         restoring `window.G` does not retire it and a live 32-minute knockout
         would gate the tick for every later test. The only sanctioned retirement
         is an envelope saying the character is up, re-asserted here so the state
         and the object agree. */
      try { A.applyEnvelopeState(window.G || {}, { state: { recovering_until: null } }); } catch (e) {}
      try { D.__resetForTest(); } catch (e) {}
      try { window.refreshActivityBar(); } catch (e) {}
    }
  }),

  /* ═══════════════════════════════════════════════════════════════════════════
     RETREAT-A4b / A4c / A4d — THE RELOADED SHEET SAYS THE RUN ENDED.
     WHAT RETREAT-A4 LEFT OPEN (CONFLICTS.md 2026-09-07, ruled by the brief of
     2026-09-08). A4 hydrates `recovering_until` and `consec_falls` on a reload
     and raises a sheet; but a boot-raised sheet carries no engine `info`, and
     EVERY retreat field was gated on `info` — so the player whose run the realm
     ENDED came back to "Knocked out" / "Back on your feet in 31:47" / a row
     reading "Your run picks up the moment you are up · automatic", all three of
     which describe somebody about to carry on. They are not: the retreat idled
     the server's pointer. RETREAT-A6's defect through the BOOT door.
     THE FIX IS AN OBSERVATION, NOT A SECOND RULE: `bootRetreat`
     (src/features/death-sheet.js) takes the SERVER's durable counter to
     src/core/away.js `retreatAtFall`, the one definition both runtimes import.
     BOTH DOORS, because only one was ever tested — A4b the ATTENDED settle, A4c
     the AWAY idle boot (see the `retreatReload` fixture); A4d is the
     no-client-invented-number half.
     THE MUTATIONS THIS BATTERY IS PROVEN AGAINST (run 2026-09-08):
       - `retreat:` back to `!!(info && info.retreat)` → A4b, A4c and RETREAT-A4
         go red: the ended run reads "Knocked out" again.
       - `bootRetreat` defaulting an ABSENT counter to the rung → A4d goes red
         (RECOVER-13/16 with it): silence becomes an ending nothing backs.
       - restoring the unconditional "picks up · automatic" row → A4b and A4c. */
  () => tryRun('RETREAT-A4b: the ATTENDED reload settle raises a sheet that says the run ENDED, '
    + 'not one that promises it resumes', () => {
    const F = retreatReload();
    try {
      const txt = F.settle(F.AW.RETREAT_FOODLESS_FALLS);
      assert(window.G.consecFalls === F.AW.RETREAT_FOODLESS_FALLS,
        'A4b: the settle did not hydrate the durable counter (' + window.G.consecFalls + ')');
      assert(/You pulled back/.test(txt),
        'A4b: the reloaded sheet reads "' + txt.slice(0, 60) + '". The server states consec_falls '
        + F.AW.RETREAT_FOODLESS_FALLS + ' with the pointer idled — the realm ENDED this run, and '
        + 'the sheet is telling the player they were merely knocked out.');
      assert(/on an empty bag/.test(txt),
        'A4b: the foodless rung fired but the sheet does not name the bag — ' + txt.slice(0, 200));
      assert(/the fight does not restart itself/.test(txt),
        'A4b: the ruled clock sentence is missing from the reloaded lead — ' + txt.slice(0, 220));
      assert(!/picks up the moment you are up/.test(txt),
        'A4b: the sheet still promises the run picks up automatically. The server idled the '
        + 'pointer BECAUSE the run ended; that row is a false promise on a retreat.');
      assert(!/Back on your feet in/.test(txt),
        'A4b: the reloaded lead promises a resume the idled pointer will not honour');
    } finally { F.done(); }
  }),

  () => tryRunAsync('RETREAT-A4c: the AWAY idle boot says the run ENDED and words the FED rung as '
    + 'the fight, not the bag', async () => {
    const F = retreatReload();
    try {
      /* Six falls in a row ends the run whatever the bag held, and the ruled
         sentence for it names the FIGHT. The count is the server's; which rung
         it is at is away.js's. */
      const fed = await F.boot(F.AW.RETREAT_ANY_FALLS);
      assert(/You pulled back/.test(fed),
        'A4c: the idle boot shows an ordinary knockout after a retreat — ' + fed.slice(0, 60));
      assert(/out of your league for now/.test(fed),
        'A4c: consec_falls ' + F.AW.RETREAT_ANY_FALLS + ' is the FED rung and must not be worded '
        + 'as an empty bag — ' + fed.slice(0, 220));
      assert(!/on an empty bag/.test(fed),
        'A4c: the sheet invented a foodless retreat at the fed rung — ' + fed.slice(0, 220));
      assert(!/picks up the moment you are up/.test(fed),
        'A4c: the sheet promises the run resumes automatically after a retreat');
    } finally { F.done(); }
  }),

  () => tryRunAsync('RETREAT-A4c2: the FOODLESS rung survives the idle boot, worded as the bag and '
    + 'still carrying the recovery clock', async () => {
    const F = retreatReload();
    try {
      /* One rung below the fed one, and the wording matters: the bag is the
         cure this player can act on. */
      const lean = await F.boot(F.AW.RETREAT_FOODLESS_FALLS);
      assert(/You pulled back/.test(lean) && /on an empty bag/.test(lean),
        'A4c2: the foodless rung does not survive the idle boot — ' + lean.slice(0, 220));
      assert(/Still recovering/.test(lean),
        'A4c2: the retreat sheet dropped the recovery clock the ruling puts on it (hr_rest is '
        + 'still the cure and the recovery is still real) — ' + lean.slice(0, 220));
    } finally { F.done(); }
  }),

  () => tryRunAsync('RETREAT-A4d: no server counter, no retreat — the reload never invents the one '
    + 'number that ends a run', async () => {
    const F = retreatReload();
    try {
      /* AN ENVELOPE WITH NO `consec_falls` IS AN OLDER SERVER, and a sheet that
         ends a run on a number nobody stated is exactly the second copy of the
         rule this fix refuses to be. The ordinary knockout still renders in
         full — the absence must cost the player nothing. */
      const silent = await F.boot(null);
      assert(!/You pulled back/.test(silent),
        'A4d: with NO consec_falls in the envelope the sheet still claimed a retreat. The client '
        + 'invented the one number the ruling says only the server may hold.');
      assert(/Knocked out|Back on your feet/.test(silent),
        'A4d: the ordinary knockout sheet stopped rendering — ' + silent.slice(0, 200));
      assert(/picks up the moment you are up/.test(silent),
        'A4d: the ordinary knockout lost its resume row; only a RETREAT may take it away');
    } finally { F.done(); }
  }),

  () => tryRunAsync('RETREAT-A4d2: two consecutive falls interrupt, they do not terminate — through '
    + 'BOTH reload doors', async () => {
    const F = retreatReload();
    try {
      /* Rungs 1–2 are the ruling's "interrupt, don't terminate" case, named by
         number. Both doors read the same counter, so both are asked. */
      assert(!/You pulled back/.test(await F.boot(2)),
        'A4d2: two consecutive falls ended the run at the boot door. The ruling fires at '
        + F.AW.RETREAT_FOODLESS_FALLS + ' foodless / ' + F.AW.RETREAT_ANY_FALLS + ' fed.');
      assert(!/You pulled back/.test(F.settle(2)),
        'A4d2: two consecutive falls ended the run at the settle door');
    } finally { F.done(); }
  }),

  () => tryRun('b341: NO monster row can start a fight on one tap — however the list was painted', () => {
    /* THE MEASURED BUG. Two wrappers re-pointed monster rows at the preview
       after every render, both hooked on `renderMonsterList` / `showTab`.
       src/features/combat-render.js REPLACES window.renderMonsterList and its
       tier-chip handler calls the module-local copy — a render path neither
       wrapper could see. So after pressing any Tier chip the rows kept their raw
       inline `startCombat(...)`: a Combat-Lv-3 character one-tapped a Green
       Dragon and was dead within six seconds, with no preview and no
       confirmation. Measured 3/3.

       The diagnostic that pinned it was the row's own onclick attribute, so
       that is what this asserts — plus the behaviour, through the tier path. */
    const G = window.G;
    const snap = snapshotG();
    const prevTier = G.currentCombatTier;
    try {
      window.showTab('combat');
      const chips = document.querySelectorAll('#panel-combat #tier-chips .chip');
      assert(chips.length >= 6, 'the tier chips are the render path under test; found ' + chips.length);

      const armed = (label) => {
        const rows = document.querySelectorAll('#panel-combat .monster-row');
        assert(rows.length > 0, label + ': no monster rows rendered');
        const bad = Array.from(rows).filter((r) => /startCombat/.test(r.getAttribute('onclick') || ''));
        assert(bad.length === 0,
          'THE b341 BUG (' + label + '): ' + bad.length + ' monster row(s) carry a live inline '
          + 'startCombat() — the next tap starts the fight with no preview. First: '
          + (bad[0] && bad[0].getAttribute('onclick')));
        return rows;
      };

      armed('first paint');
      // Every tier, because the bug was tier-specific and Tier 6 is where it kills you.
      for (const c of chips) {
        c.click();
        armed('after Tier ' + (c.dataset.tier || c.textContent));
      }

      /* THE BLAST RADIUS. Three separate readers identified a row's monster by
         parsing its inline `startCombat(...)` — the exact attribute this fix
         removes: the two rewire walkers (both retired) and the icon painters in
         legacy.js `paintMonsterIcons()` / icon-set.js `paintMonsters()`. The
         painters have no exception to throw when they miss; the portrait simply
         stops appearing. Grade the visible outcome, which is the thing a player
         would actually notice. */
      const chipT1 = Array.from(chips).find((c) => (c.dataset.tier || '') === '1');
      if (chipT1) chipT1.click();
      const withArt = Array.from(document.querySelectorAll('#panel-combat .monster-row'))
        .filter((r) => (window._monsterIcon || {})[r.getAttribute('data-monster')]);
      assert(withArt.length > 0,
        'no Tier-1 row resolved a painted portrait path — either the rows lost their ids or '
        + '_monsterIcon is unwired, and both are ways for the art to vanish');
      const blank = withArt.filter((r) => !r.querySelector('.mi img, .mi .hr-med, .mi svg'));
      assert(blank.length === 0,
        'THE b341 BLAST RADIUS: ' + blank.length + ' of ' + withArt.length + ' rows render no portrait '
        + 'despite having painted art — a reader is still looking for the id in an inline onclick '
        + 'that no longer exists. First: ' + (blank[0] && blank[0].getAttribute('data-monster')));

      /* Behaviour, not just markup: on the deadliest tier available, a row tap
         must open the preview and must NOT have entered combat. */
      const last = chips[chips.length - 1];
      last.click();
      const rows = document.querySelectorAll('#panel-combat .monster-row');
      const row = Array.from(rows).find((r) => !r.disabled);
      assert(row, 'no clickable row on the top tier');
      const id = row.getAttribute('data-monster');
      assert(id && window.MONSTERS[id], 'a row must carry its monster id for the delegated listener: ' + id);
      G.activeMonster = null;
      row.click();
      assert(G.activeMonster === null,
        'THE b341 BUG: tapping ' + id + ' started the fight instead of opening the preview');
      /* b362: the preview MOVED from a modal to the Fight screen's preview
         state (COMBAT-UI-15) — same guarantee, better surface. The rule under
         test is unchanged and is asserted against whichever preview is live:
         the tap must land on an honest forecast for THIS foe, never in combat. */
      const CS = window.HearthriseCombatScreens;
      if (CS) {
        assert(CS.view() === 'fight' && CS.previewId === id,
          'the row tap opened nothing at all — delegation is not bound (a silent row is safe, '
          + 'but it is not the feature). view=' + CS.view() + ' preview=' + CS.previewId);
        const panel = document.getElementById('panel-combat');
        assert(panel.dataset.fightState === 'preview',
          'the fight screen opened LIVE instead of in preview — one tap entered combat');
        assert(/\d/.test(document.getElementById('fs-foe-tiles').textContent),
          'the preview shows no forecast for the foe — the honest screen is empty');
      } else {
        const ov = document.getElementById('mob-preview');
        assert(ov && ov.classList.contains('open'),
          'the row tap opened nothing at all — delegation is not bound (a silent row is safe, but it is not the feature)');
      }
    } finally {
      if (typeof window.closeMobPreview === 'function') window.closeMobPreview();
      try { window.stopCombat(); } catch (e) {}
      G.currentCombatTier = prevTier;
      restoreG(snap);
      try { window.renderMonsterList(); } catch (e) {}
    }
  }),

  () => tryRun('b341: the shop states the level you need to WEAR what it is selling', () => {
    /* THE MEASURED BUG. "Iron Sword · +7 ATK · +6 STR · 500 · Buy", and nothing
       in the row, its title or its aria-label mentioned Attack Lv 15. A new
       player has exactly 500 gold; the purchase succeeds; the requirement is
       first spoken at equip time, and undoing it costs 300 gold because the
       vendor buys back at 40%. */
    const G = window.G;
    const snap = snapshotG();
    const prevTab = window.activeTab;
    try {
      // A level-1 character, so every gated piece reads as locked. (There
      // is no exemption set to clear any more — the gate is the realm's rule.)
      G.skills = Object.assign({}, G.skills, { attack: 0, strength: 0, defense: 0, ranged: 0, magic: 0 });
      window.showTab('shop');
      window.setShopTab('equip');
      const panel = document.getElementById('shop-panel');
      const rows = Array.from(panel.querySelectorAll('.sc-counter .shop-row'));
      assert(rows.length > 0, 'no shop rows');

      let gatedSeen = 0;
      for (const s of window.EQUIP_SHOP) {
        const req = window.gearWieldReq(window.ITEMS[s.id]);
        if (!req) continue;
        gatedSeen++;
        const name = window.ITEMS[s.id].n;
        const row = rows.find((r) => {
          const b = r.querySelector('.info b');
          return b && b.textContent.trim() === name;
        });
        assert(row, 'no shop row for ' + name);
        /* Three separate assertions on purpose. The finding was that the
           requirement appeared in NONE of the row, its title, or its
           aria-label — so each surface is graded on its own, or a fix that
           only tooltips it would pass while the row still reads
           "Iron Sword · +7 ATK · +6 STR · 500 · Buy". */
        const says = (s2) => /Requires/i.test(s2) && new RegExp('Lv\\s*' + req.lv).test(s2);
        assert(says(row.textContent || ''),
          'THE b341 BUG: ' + name + ' is sold for ' + s.cost + ' gold and the ROW never says it needs '
          + req.skill + ' Lv ' + req.lv + ' — the player finds out at equip time, after paying, and the '
          + 'vendor buys back at 40%. Row read: ' + (row.textContent || '').replace(/\s+/g, ' '));
        assert(says(row.getAttribute('aria-label') || ''),
          name + ': the requirement is visible but not in the aria-label — a screen reader still hears '
          + 'a purchase with no gate. aria-label: ' + row.getAttribute('aria-label'));
        assert(says(row.getAttribute('title') || ''),
          name + ': the requirement is missing from the row title. title: ' + row.getAttribute('title'));
        // Informed, not blocked: buying ahead of a level is a legitimate choice.
        const buy = row.querySelector('button');
        assert(buy && /Buy/i.test(buy.textContent),
          'the row stopped offering the purchase — b341 informs, it does not block ' + name);
      }
      assert(gatedSeen >= 4,
        'the fixture found only ' + gatedSeen + ' level-gated items in EQUIP_SHOP; the test is no longer measuring anything');
    } finally {
      restoreG(snap);
      try { window.setShopTab('seeds'); } catch (e) {}
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  () => tryRun('b341: the daily ledger reads the field getTodayDelta actually returns', () => {
    /* THE MEASURED BUG. The tile read `today.xp`, falling back to
       `today.totalXp`. getTodayDelta() returns NEITHER — the field is
       `xpGained` — so "XP today" printed a hardcoded 0 for every player forever,
       while "Kills" beside it read `today.kills`, which does exist. Symptom:
       "0 XP TODAY" directly above a welcome-back card reading "+15,000 XP". */
    const LP = window.HearthriseLaunchpad;
    assert(LP && typeof LP.getTodayDelta === 'function', 'no launchpad');
    const d = LP.getTodayDelta();
    assert(d && typeof d.xpGained === 'number',
      'getTodayDelta no longer returns xpGained — the dashboard reads that name');

    const G = window.G;
    const save = { skills: JSON.parse(JSON.stringify(G.skills)), daily: G.daily, stats: JSON.parse(JSON.stringify(G.stats || {})),
      record: G._record, gold: G.gold, hadGold: Object.prototype.hasOwnProperty.call(G, 'gold') };
    try {
      /* ⚠ b515 — THE SNAPSHOT REFUSES TO BE TAKEN AGAINST AN UNKNOWN BALANCE,
         and that refusal is deliberate: `ensureDailySnapshot` returns NULL while
         `balKnown('gold')` is false, because a midnight baseline of `G.gold | 0`
         recorded ZERO for a client that had simply not been told the balance yet
         — and the next envelope's entire fortune then read as "earned today" on
         two surfaces. `gold` is SERVER-OF-RECORD and armed, and this harness
         never runs a real hr_load, so the snapshot was never taken, every field
         came back 0, and this test failed on a number that has nothing to do
         with the field name it is about. Stamped like a load, through the real
         applyRecord, which is the state a signed-in player is always in by the
         time they can read a ledger. */
      if (typeof G.gold !== 'number') G.gold = 1000;   // a figure to baseline against
      stampRecordLikeLoad(G);
      assert(window.balKnown('gold') === true,
        'the balance is UNKNOWN, so the daily snapshot correctly refuses to exist and every delta below '
        + 'would be a hardcoded 0 — the fixture is wrong, not the ledger');
      G.daily = Object.assign({}, G.daily, { snapshot: null });
      const base = LP.getTodayDelta();           // capture a fresh baseline
      assert(base && base.xpGained === 0,
        'the baseline was not fresh (xpGained ' + base.xpGained + ') — everything below measures the '
        + 'wrong window');
      const first = Object.keys(G.skills)[0];
      G.skills[first] = (G.skills[first] || 0) + 4321;
      stampRecordLikeLoad(G);                    // …as an envelope would state it
      G.stats = Object.assign({}, G.stats, { kills: (G.stats.kills || 0) + 7 });
      const after = LP.getTodayDelta();
      assert(after.xpGained === 4321, 'getTodayDelta miscounted XP: ' + after.xpGained);

      // Render synchronously — showTab defers the dashboard by 30ms, and a test
      // that read the DOM before that would grade the PREVIOUS paint.
      window.showTab('profile');
      window.HearthriseHome.render();
      const el = document.querySelector('#panel-profile .hd-ledger');
      assert(el, 'the Home ledger is missing');
      const led = Array.from(el.querySelectorAll('.hd-led'))
        .find((n) => /XP today/i.test(n.textContent || ''));
      assert(led, 'no "XP today" tile');
      const printed = (led.querySelector('b') || {}).textContent || '';
      assert(/4,?321/.test(printed),
        'THE b341 BUG: the ledger printed "' + printed + '" XP today while 4,321 was earned today — '
        + 'the tile is reading a field getTodayDelta does not return, so it can only ever print 0');
    } finally {
      G.skills = save.skills; G.daily = save.daily; G.stats = save.stats;
      if (save.hadGold) G.gold = save.gold; else { try { delete G.gold; } catch (e) {} }
      G._record = save.record;
      try { stampRecordLikeLoad(G); } catch (e) {}
      try { window.showTab('profile'); } catch (e) {}
    }
  }),

  () => tryRun('b374: the hearth band is the PAINTED holding, not the flat-vector SVG', () => {
    /* b374 — the Home banner was a flat-vector silhouette (backdrop.js
       homesteadScene) that clashed with the painted account-gate/login. It now
       shares the login's dawn plate. This guards two halves of that decision:
       (1) the painted plate is actually the band's ::before background, and
       (2) the retired flat-vector scene is NOT injected back into the band —
       a plausible regression, since homesteadScene() is still exported. */
    window.showTab('profile');
    window.HearthriseHome.render();
    const band = document.querySelector('#panel-profile .hd-hearth');
    assert(band, 'the hearth band is missing');
    const bg = getComputedStyle(band, '::before').backgroundImage || '';
    assert(/hearthrise-splash/.test(bg),
      'the hearth band no longer paints the login plate (::before background-image was "' + bg + '") — '
      + 'reverting to the flat-vector scene reopens the "two games" clash Tyler flagged in b374');
    assert(!band.querySelector('svg.hrs-svg'),
      'the flat-vector homesteadScene SVG is back inside the hearth band — it was retired in b374');
  }),

  () => tryRun('b341: a LOCKED auto-eat picker offers no choice it is going to refuse', () => {
    /* THE MEASURED BUG. setAutoEatFood() has always refused every pick without
       the Auto-Eat trait, but the picker rendered its rows live anyway: tapping
       one closed the overlay as if it had taken, `foodId` stayed null, and the
       only contradiction was a toast that expires. Re-opening still showed
       "— Off —" marked `is-on`. */
    if (typeof window.openAutoEatPicker !== 'function') { skip('no picker'); return; }
    const G = window.G;
    const snap = snapshotG();
    const realHasTrait = window.hasTrait;
    try {
      window.hasTrait = function (id) { return id === 'auto_eat' ? false : realHasTrait.apply(this, arguments); };
      G.inventory = Object.assign({}, G.inventory, { cooked_shrimp: 5 });
      window.openAutoEatPicker();
      const ov = document.getElementById('aep-overlay');
      assert(ov, 'the picker did not open');
      const rows = Array.from(ov.querySelectorAll('.aep-row'));
      assert(rows.length >= 1, 'the picker rendered no rows at all');
      const live = rows.filter((r) => !r.disabled);
      assert(live.length === 0,
        'THE b341 BUG: ' + live.length + ' of ' + rows.length + ' rows are still tappable while auto-eat is '
        + 'locked — tapping one closes the overlay as if it took, and nothing is set');
      assert(/locked/i.test(ov.textContent) && /Store/i.test(ov.textContent),
        'the picker does not say WHY it is refusing, so a disabled row reads as broken: ' + ov.textContent.slice(0, 160));
      assert(!rows.some((r) => r.classList.contains('is-on')),
        'a locked picker still marks a row as the active selection — there is no active selection');
    } finally {
      window.hasTrait = realHasTrait;
      const ov = document.getElementById('aep-overlay'); if (ov) ov.remove();

      restoreG(snap);
    }
  }),

  () => tryRun('QUEST-100: the hundred-kill milestone is an ordinary QUEST — it reaches an existing save, mirrors stats.kills, pays authored combat XP once, and never pays twice across the b343 rename', () => {
    const G = window.G;
    const ID = 'hundred_kills';
    const snap = snapshotG();
    try {
      const def = (window.QUEST_DEFS || []).find((q) => q.id === ID);
      assert(def, 'the hundred-kill milestone must be a QUEST_DEFS row, not bespoke UI');
      assert(def.goal === 100, 'the goal must be 100 monsters, got ' + def.goal);
      assert(def.mirror === 'stats.kills',
        'the quest must MIRROR stats.kills, or the counter drifts from the number it displays');
      assert(def.reward && def.reward.combatXp === 1500,
        'the reward must be the authored 1,500 combat XP, got ' + JSON.stringify(def.reward));
      assert(!def.reward.marks && !def.reward.gold, 'it pays XP, not marks and not gold');
      /* IT IS A GOAL, NOT A PERMIT. Tyler's ruling was about the WORD as much
         as the rule: 20 beta players meet this label cold at round-two wipe. */
      assert(/^Defeat 100 monsters$/.test(def.label),
        'the label must plainly describe the achievement: ' + def.label);
      assert(!/licen[cs]e|permit/i.test(def.label + ' ' + (def.note || '')),
        'the retired permit wording is back on the quest: ' + def.label + ' / ' + def.note);

      /* (1) IT REACHES AN EXISTING SAVE. Seeding "only when the array is
         empty" is why a quest added after launch used to reach nobody. */
      G.quests = [{ id: 'gatherer', type: 'gather', label: 'old', goal: 15, progress: 15, reward: { gold: 150 }, done: true }];
      G.stats = Object.assign({}, G.stats, { kills: 40 });
      window.ensureRetentionState();
      const q = G.quests.find((x) => x.id === ID);
      assert(q, 'the quest never reached a save that already had quests');
      assert(G.quests.find((x) => x.id === 'gatherer').done === true, 'the merge clobbered a completed quest');

      /* (2) IT MIRRORS. A save that already had 40 kills shows 40/100 the
         moment the quest appears — an event counter would show 0. */
      assert(q.progress === 40, 'the counter must mirror stats.kills, got ' + q.progress);
      G.stats.kills = 77;
      window.updateQuest('kill_any', 1);
      assert(G.quests.find((x) => x.id === ID).progress === 77,
        'the counter drifted from stats.kills — it must READ, never count');
      assert(!G.quests.find((x) => x.id === ID).done, 'the quest completed below its goal');

      /* (3) IT PAYS, ONCE, AS AN AUTHORED PAYOUT ROUTED LIKE A KILL. */
      const origBonus = window.getBonus;
      window.getBonus = () => 0;
      try {
        const style = window.getActiveCombatStyle();
        const route = window.HearthriseCore.styles.killXpRoute(style, def.reward.combatXp, 1);
        assert(route.length > 0, 'the style must route the reward somewhere');
        const before = {}; route.forEach((r) => { before[r.skill] = xpOf(r.skill); });
        G.stats.kills = 100;
        window.updateQuest('kill_any', 1);
        const done = G.quests.find((x) => x.id === ID);
        assert(done.done === true, 'the quest did not complete at 100 kills');
        route.forEach((r) => {
          const gained = xpOf(r.skill) - before[r.skill];
          /* AUTHORED means PACE.xp does not scale it: 1,500 pays 1,500, not
             1,500 x 0.39. pacing-overhaul.md §4.5 lists quest payouts as
             authored, explicitly not rates. */
          assert(gained === Math.max(1, Math.floor(r.amount)),
            'the ' + r.skill + ' share paid ' + gained + ', expected the authored '
            + Math.max(1, Math.floor(r.amount)) + ' — PACE.xp must not scale a quest payout');
        });
        /* ONCE. Another 500 kills pays nothing more. */
        const after = {}; route.forEach((r) => { after[r.skill] = xpOf(r.skill); });
        G.stats.kills += 500;
        window.updateQuest('kill_any', 1);
        route.forEach((r) => {
          assert(xpOf(r.skill) === after[r.skill], 'the milestone paid twice on ' + r.skill);
        });

        /* (4) THE RENAME IS A MIGRATION, NOT A NEW QUEST. Every live beta save
           carries this row under its b341 id. Renaming without moving them
           would leave the retired LABEL on screen and seed the new id fresh —
           re-granting 1,500 XP to everyone who had already finished it.
           MUTATION PROVEN: empty `QUEST_ID_RENAMES` and the first assertion
           fails on a duplicated row; drop the `done`/`progress` carry-over in
           `migrateQuestIds` and the pay-again assertion fails. */
        const paid = {}; route.forEach((r) => { paid[r.skill] = xpOf(r.skill); });
        G.quests = [
          { id: 'gatherer', type: 'gather', label: 'old', goal: 15, progress: 15, reward: { gold: 150 }, done: true },
          { id: 'field_licence', type: 'kill_any', mirror: 'stats.kills', label: 'Field Licence — defeat 100 monsters',
            goal: 100, progress: 100, reward: { combatXp: 1500 }, done: true },
        ];
        G.stats.kills = 4000;
        window.ensureRetentionState();
        window.updateQuest('kill_any', 1);
        const rows = G.quests.filter((x) => x.id === ID || x.id === 'field_licence');
        assert(rows.length === 1 && rows[0].id === ID,
          'the b341 quest id survived the rename (' + rows.map((r) => r.id).join(',') + ') — '
          + 'the player keeps reading the retired label');
        assert(rows[0].done === true, 'a completed milestone came back unfinished through the rename');
        route.forEach((r) => {
          assert(xpOf(r.skill) === paid[r.skill],
            'the rename re-granted the milestone on ' + r.skill + ': +'
            + (xpOf(r.skill) - paid[r.skill]) + ' XP');
        });

        /* An IN-FLIGHT row keeps its place too, and is still payable. */
        G.quests = [{ id: 'field_licence', type: 'kill_any', mirror: 'stats.kills', label: 'old',
          goal: 100, progress: 62, reward: { combatXp: 1500 }, done: false }];
        G.stats.kills = 62;
        window.ensureRetentionState();
        const mid = G.quests.filter((x) => x.id === ID);
        assert(mid.length === 1 && mid[0].done === false && mid[0].progress === 62,
          'an in-flight milestone lost its progress in the rename: ' + JSON.stringify(mid));

        /* (5) BOTH IDS IN ONE SAVE — the one state a rename can produce, and
           the reason the migration dedupes rather than only renaming. Two rows
           under one id both complete and both PAY. Asserted in BOTH orders,
           because which row the merge meets first decides which one survives
           and only one of the two orders exercises the carry-over.
           MUTATION PROVEN: drop the `prev.done || q.done` term in
           `migrateQuestIds` and the fresh-row-first order fails on a finished
           milestone coming back unfinished — and then paying again. */
        const oldRow = () => ({ id: 'field_licence', type: 'kill_any', mirror: 'stats.kills',
          label: 'Field Licence — defeat 100 monsters', goal: 100, progress: 100,
          reward: { combatXp: 1500 }, done: true });
        const newRow = () => ({ id: ID, type: 'kill_any', mirror: 'stats.kills',
          label: 'Defeat 100 monsters', goal: 100, progress: 0,
          reward: { combatXp: 1500 }, done: false });
        [['old first', [oldRow(), newRow()]], ['fresh first', [newRow(), oldRow()]]].forEach(([label, rows2]) => {
          G.quests = rows2;
          G.stats.kills = 4000;
          const held = {}; route.forEach((r) => { held[r.skill] = G.skills[r.skill] || 0; });
          window.ensureRetentionState();
          window.updateQuest('kill_any', 1);
          const merged = G.quests.filter((x) => x.id === ID || x.id === 'field_licence');
          assert(merged.length === 1 && merged[0].id === ID,
            label + ': the duplicate survived (' + merged.map((r) => r.id).join(',') + ') — two rows '
            + 'under one id complete twice and pay twice');
          assert(merged[0].done === true,
            label + ': a finished milestone came back unfinished through the merge');
          route.forEach((r) => {
            assert((G.skills[r.skill] || 0) === held[r.skill],
              label + ': the merge re-granted the milestone on ' + r.skill + ': +'
              + ((G.skills[r.skill] || 0) - held[r.skill]) + ' XP');
          });
        });
      } finally { window.getBonus = origBonus; }
    } finally { restoreG(snap); }
  }),

  /* ── AWAY-HONEST-5 — THE TOUR'S AWAY PROMISE, BOUND TO THE AWAY ENGINE ──────────────────────────
     One question since b340 — "does the tour promise what the engine pays?" — re-specified whenever
     the answer changes, never deleted. It used to pin "only until you fall" IN; Recovery Rule rev. 2
     (src/core/away.js) made a fall an INTERRUPTION, so that pin is now the honesty defect this test
     catches. It binds each NEW sentence to a MEASURED SPAN of `simulateSpan`/`simulateSkillSpan` (the
     bytes pack-edge vendors into hr-accrue) over an 8h absence on a foodless character who really
     falls — a player is promised a NIGHT, not a constant. FIRST-LIGHT-4 pins the RETIRED sentences
     OUT; this pins the REPLACEMENT in and ties it to the payout.
     MUTATIONS PROVEN 2026-09-07, six, each RED with the clause named:
       copy   wrap "…picks itself back up and carries on" → "…banks only until you fall"  → clause 3
       engine combat-sim ends the run on a fall                                           → clause 2
       engine away.js `RESUME_HP_FRACTION = 1.00` (the free full heal security BLOCKED)   → clause 5
       engine away.js `recoveryFor` charges the day's first fall                          → clause 4
       engine combat-sim doubles the clock when `ctx.away` (the away-only rule forbidden) → clause 6
       engine skill-sim caps a gather span at one hour                                    → clause 1 */
  () => tryRun('AWAY-HONEST-5: the FTUE promises exactly what the engine pays — a skill banks the whole night, and a fight that falls picks itself back up', () => {
    const F = window.HearthriseFTUE;
    const C = window.HearthriseCore;
    assert(F && typeof F.steps === 'function', 'the FTUE must publish its steps for this assertion');
    assert(C && C.combatSim && C.skillSim && C.away,
      'CONTROL: the away engine must be published or every binding below is vacuous');
    const steps = F.steps();
    const byId = {}; steps.forEach((s) => { byId[s.id] = s; });
    assert(byId.combat && byId.wrap && byId.skills, 'the FTUE lost a step: ' + Object.keys(byId).join(','));
    const combatBody = String(byId.combat.body || '');
    const wrapBody = String(byId.wrap.body || '');

    /* The b340 sentence: away rewards for "any skill" and "anything that moves", in one breath. */
    assert(!/check back tomorrow for offline rewards/i.test(wrapBody),
      'the wrap step still promises away rewards for combat and skills in one breath');

    const NIGHT_MS = 8 * 3600000;

    /* CLAUSE 1 · "even when you're offline, progress continues" — over a whole NIGHT, not
       AWAY-HONEST-4's hour, and "continues" is `paidMs === awayMs`, never merely "> 0". */
    assert(/offline, progress continues/i.test(String(byId.skills.body || '')),
      'the skills step must promise offline progress — it is true, and it is the promise the game keeps');
    const gather = awayGatherSpan({ spanMs: NIGHT_MS });
    assert(gather.out.paidMs === NIGHT_MS && gather.out.stopped === false,
      'the tour promises a skill keeps running while you are offline; an 8h gather span paid '
      + gather.out.paidMs + 'ms of ' + NIGHT_MS + ' (stopped=' + gather.out.stopped + ')');
    assert((gather.paid.xp[gather.skill] || 0) > 0 && Object.keys(gather.paid.items).length > 0,
      'the whole night counted as paid and granted nothing: ' + JSON.stringify(gather.paid));

    /* THE NIGHT THAT FALLS. A foodless character on slimes: hits 3, is hit for 2, 120 max HP;
       deterministic over whole 2.4s ticks, so clause 2 is an equality and not a tolerance, and
       `fromMs` is named because the truncated twin derives from it. MEASURED: 132 kills, 13 falls. */
    const FROM = Date.UTC(2026, 0, 15, 6, 0, 0);
    const fixture = {
      fromMs: FROM,
      state: { playerHp: 120, playerMaxHp: 120 },
      ctx: {
        playerRolls: () => ({ accuracy: 1e9, maxHit: 3, critChance: 0 }),
        monsterRolls: () => ({ accuracy: 1e9, maxHit: 2 }),
      },
    };
    const night = awaySpan({ ...fixture, spanMs: NIGHT_MS });
    assert(night.out.deaths > 0 && night.out.kills > 0,
      'CONTROL: this fixture must both kill and fall or nothing below is measuring the rule — '
      + JSON.stringify({ kills: night.out.kills, deaths: night.out.deaths }));

    /* CLAUSE 2 · "it banks the whole time you are gone" — THE ACCOUNTING IDENTITY: every ms either
       EARNED (`survivedMs`) or was a recovery clock (`recoverMs`). "The run ended" is a remainder. */
    assert(/banks the whole time you are gone/i.test(wrapBody),
      'the wrap step no longer states the deal it is being held to here: ' + wrapBody);
    assert(night.out.survivedMs + night.out.recoverMs === NIGHT_MS,
      'the tour says the night banks whole; the engine accounted for only '
      + (night.out.survivedMs + night.out.recoverMs) + 'ms of ' + NIGHT_MS
      + ' (earned ' + night.out.survivedMs + ', knocked out ' + night.out.recoverMs
      + ') — the rest of the absence went nowhere, which is what "the fight ended" looks like');

    /* CLAUSE 3 · "a fight that falls picks itself back up and carries on" — a DELTA against the
       identical span truncated at the first fall, because "kills > 0" passes on a run that STOPPED
       there. The difference IS what resuming is worth. */
    assert(/picks itself back up/i.test(wrapBody),
      'the wrap step dropped the resume promise this test binds: ' + wrapBody);
    const firstFall = night.out.deathLog[0];
    assert(firstFall, 'CONTROL: the night recorded no fall, so the resume below is unmeasured');
    const upToTheFall = awaySpan({ ...fixture, spanMs: firstFall.atMs - FROM });
    assert(upToTheFall.out.deaths === 1,
      'CONTROL: the truncated twin must end ON the first fall, not before or after it — deaths='
      + upToTheFall.out.deaths);
    assert(night.out.kills > upToTheFall.out.kills,
      'the night paid ' + night.out.kills + ' kills and the run up to the first fall paid '
      + upToTheFall.out.kills + ' — nothing was earned after the character fell, so the tour is '
      + 'selling a resume the engine does not perform');
    assert(night.out.deaths >= 2,
      'the character fell once in eight hours and never again — a run that ended at the first fall '
      + 'cannot fall twice, so this is the retired rule wearing the new copy');
    assert(night.state.activeMonster === 'slime',
      'the fight resumed against ' + night.state.activeMonster + ' — the copy says the SAME fight '
      + 'carries on, and src/core/combat-sim.js restores the target the death fx cleared');

    /* CLAUSE 4 · "the first fall of each day costs you no time at all" — as a span CHARGED it, not
       as the pure function (FIRST-LIGHT-4's): a span is where a caller can add its own clock. */
    assert(/first fall of each day costs you no time at all/i.test(combatBody),
      'the combat step dropped the free-first-fall promise: ' + combatBody);
    assert(night.out.recoverLadder[0] === 0,
      'the tour promises the day\'s first fall is free; the span charged '
      + night.out.recoverLadder[0] + 'ms for it. Ladder: ' + night.out.recoverLadder.join(','));

    /* CLAUSE 5 · "stand back up on part of your health" — PART, not all (the full heal this replaced
       made dying the cheapest top-up), and agreeing with `resumeHpFor`, the one definition. */
    assert(/part of your health/i.test(combatBody),
      'the combat step no longer says a fall returns PART of your health: ' + combatBody);
    assert(firstFall.resumeHp > 0 && firstFall.resumeHp < 120,
      'the character stood up on ' + firstFall.resumeHp + ' of 120 max HP — "part of your health" is '
      + 'false at both ends: 0 is a corpse and a full bar is the free heal the ladder exists to remove');
    assert(firstFall.resumeHp === C.away.resumeHpFor(120),
      'the span stood the character up on ' + firstFall.resumeHp + ' while away.js resumeHpFor(120) says '
      + C.away.resumeHpFor(120) + ' — two definitions of the same rule');

    /* CLAUSE 6 · "while you are away … under exactly the same rule" — the SAME span at `away:false`
       must be byte-identical: AWAY-1 parity as a copy binding, so an away-only table fails here. */
    assert(/while you're away|while you are away/i.test(combatBody)
      && /the same rule/i.test(combatBody),
      'the combat step must state the away deal AND that it is the same rule: ' + combatBody);
    const attended = awaySpan({ ...fixture, spanMs: NIGHT_MS, away: false });
    const fingerprint = (r) => JSON.stringify({
      kills: r.out.kills, deaths: r.out.deaths, survivedMs: r.out.survivedMs,
      recoverMs: r.out.recoverMs, ladder: r.out.recoverLadder,
      resumeHps: r.out.deathLog.map((d) => d.resumeHp),
    });
    assert(fingerprint(night) === fingerprint(attended),
      'the tour says an away fight runs under exactly the same rule as an attended one, and the same '
      + 'seeded span paid differently:\n  away:     ' + fingerprint(night)
      + '\n  attended: ' + fingerprint(attended));
  }),

  () => tryRunAsync('B342-1: the SAVE BLOB addresses the active character — both directions — and auth.js pins no slot', async () => {
    /* THE BUG, THIRD OCCURRENCE. b339 fixed accrue.js and character.js; b340
       fixed record.js. src/net/sync.js — the module that carries the SAVE
       ITSELF — was never fixed. buildSnapshotRequest read `cfg.slot ?? 0` and
       enableLiveSync() passes no slot, so every 60s autosave wrote slot 0
       whatever character was live. MEASURED before the fix, through the real
       setupAuth->enableLiveSync->setupSync path with the wire intercepted:
       HearthriseProfile.activeSlot() === 2, request body slot === 0.

       Silent today (once 2026-08-10-save-integrity.sql is applied it becomes a
       hard 23514 instead), and silent is the dangerous half: character 3's
       progress lands on character 1's row and nothing says so.

       MUTATIONS, all three RED:
         M1 buildSnapshotRequest  -> `(cfg && cfg.slot != null) ? cfg.slot : 0`
         M2 pullLatestDetailed    -> `(config.slot != null) ? config.slot : 0`
         M3 auth.js buildSaveWiring -> add `slot: 0`   (the CALLER — b339's
            escaped mutation was exactly this shape, so it is asserted here) */
    const S = window.HearthriseSync;
    const Auth = window.HearthriseAuth;
    const P = window.HearthriseProfile;
    assert(S && typeof S.buildSnapshotRequest === 'function' && typeof S.pullLatestDetailed === 'function',
      'sync.js does not expose the save request paths');
    assert(P && typeof P.activeSlot === 'function', 'multi-character.js does not publish the active slot');

    const savedProfile = P.profile;
    const realFetch = window.fetch;
    let pulledUrl = null;
    try {
      P.profile = { activeSlot: 2, unlockedSlots: 3, slots: [{ id: 0 }, { id: 1 }, { id: 2 }] };

      /* ── (1) THE CALLER. No `slot` key anywhere in what auth.js hands to
         setupSync — that omission is what selects the live character. */
      assert(typeof Auth.buildSaveWiring === 'function',
        'auth.js does not expose its save wiring — the only way to check what it passes to setupSync would be '
        + 'to re-derive it, which proves nothing about auth.js (B339-3b, same lesson)');
      const wiring = Auth.buildSaveWiring({ url: 'https://proj.supabase.co', anonKey: 'anon' });
      assert(!('slot' in wiring),
        'auth.js pins slot ' + wiring.slot + ' for the save blob — every autosave would go to that character\'s '
        + 'row regardless of who is being played, which is silent cross-character data loss');
      assert(/\/rest\/v1\/game_saves$/.test(wiring.snapshotEndpoint),
        'the snapshot endpoint is no longer game_saves: ' + wiring.snapshotEndpoint);

      /* ── (2) THE WRITE. The config auth.js actually produces, through the
         real builder, with the player on character 3. */
      const cfg = { ...wiring, userId: () => 'user-A', authToken: () => 'jwt' };
      const req = S.buildSnapshotRequest(cfg, 'user-A', { gold: 7 }, Date.now());
      assert(req.body.slot === 2,
        'the autosave targets slot ' + req.body.slot + ' while the player is on slot 2 — game_saves is '
        + 'UNIQUE (user_id, slot), so this upsert overwrites another character\'s save');
      assert(/on_conflict=user_id,slot/.test(req.url), 'the upsert lost its on_conflict key: ' + req.url);

      /* The pin still works — the suite seam, and what a future "snapshot a
         specific slot" caller would use. Only the DEFAULT changed, to the safe
         direction: forget to say which character and you get the live one. */
      assert(S.buildSnapshotRequest({ ...cfg, slot: 4 }, 'u', {}, 0).body.slot === 4,
        'an explicitly pinned slot is ignored — the seam is gone');
      assert(S.buildSnapshotRequest({ ...cfg, slot: '2' }, 'u', {}, 0).body.slot === 2,
        'a STRING slot was coerced onto the wire instead of falling back to the resolved active slot');

      /* ── (3) THE READ, AND THE ANTI-ROLLBACK INVARIANT IT PROTECTS.
         pullLatestDetailed() feeds decideRestore(), which resolves by
         FRESHNESS. "Newest wins" is only safe between two copies of the SAME
         save: reading slot 0 while playing slot 2 compares two different
         CHARACTERS, so a recently-saved-but-untouched character 1 reads as
         "cloud is newer" and gets overlaid onto character 3's live game. So the
         read must name the same slot as the write, from the same config. */
      /* ⚠ RECORD ONLY THE game_saves READ. The first version of this stub kept
         the LAST url that went through window.fetch, and the game preloads
         icons through fetch() during the same await — so roughly half of all
         runs measured `.../painted/items/dragon_gem.png?1786763534435`, parsed
         no `slot=eq.N` out of it, and reported "the cloud read asked for slot
         NaN". Measured 2 red in 4 runs on an unmodified tree.

         An intermittently-red guard is worse than no guard: it trains everyone
         to re-run until green, which is exactly how a real red gets waved
         through. The bug was never in the product — b342's fix is fine — it was
         a probe that did not say WHICH request it was grading. */
      window.fetch = function (u) {
        const seen = String(u);
        if (/\/rest\/v1\/game_saves/.test(seen)) pulledUrl = seen;
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      S.setClockTrusted(true);
      S.resetAuthGate();
      await S.__withConfig({ ...cfg, onSyncFailure: () => {}, onSyncRecovered: () => {} },
        async () => { await S.pullLatestDetailed(); });

      assert(pulledUrl, 'the read path issued no game_saves request at all — this assertion would otherwise pass '
        + 'vacuously, and now that the stub filters by endpoint it is the only thing standing between "the read '
        + 'names the right slot" and "the read never happened"');
      const readSlot = Number((String(pulledUrl).match(/slot=eq\.(\d+)/) || [])[1]);
      assert(readSlot === 2,
        'the cloud read asked for slot ' + readSlot + ' while the player is on slot 2 (' + pulledUrl + ') — '
        + 'decideRestore would then compare a DIFFERENT character\'s save against this one by timestamp, and '
        + 'restore the wrong one over the live game');
      assert(readSlot === req.body.slot,
        'the read and the write address different characters (' + readSlot + ' vs ' + req.body.slot + ') — '
        + 'freshness only decides correctly between two copies of the same save');

      /* ── (4) And it TRACKS. Switching character moves both, with no
         reconfiguration — a slot captured at sign-in is wrong the moment the
         player switches, the same rule the auth token follows. */
      P.profile = { activeSlot: 0, unlockedSlots: 3, slots: [{ id: 0 }] };
      assert(S.buildSnapshotRequest(cfg, 'user-A', {}, Date.now()).body.slot === 0,
        'the slot was captured at configure time rather than resolved per call');
    } finally {
      window.fetch = realFetch;
      P.profile = savedProfile;
      try { S.resetAuthGate(); S.__resetSyncHealth(); } catch (e) {}
    }
  }),
  /* ══════════════════════════════════════════════════════════════════════════
     b342 — THE AWAY HONESTY SURFACES, ASSERTED AS SURFACES

     b341 built the rule and the copy and shipped with both invisible at all
     three moments a player meets them — starting a fight, dying, and coming
     back — while its own guard test passed the whole time, because it asserted
     that a FIELD EXISTS rather than that anything renders it. That is this
     repo's recurring failure one layer out: a test that grades the DATA while
     the player's EXPERIENCE is the thing under contract.

     So every assertion below reads a rendered surface — the away band in
     `#hd-root`, `#ab-meta`'s text, the boss cards' DOM, the `.ce-next` button's
     click behaviour, `#welcome-rows` — and none of them is satisfied by a field
     being present in G. Each one was mutation-proven; the mutation that breaks
     it is named in its own comment.

     b343 removed the away-combat GATE these were written around. They are
     rewritten, not deleted: the surfaces still have to be honest, and the
     honest thing to report is now a DEATH and an EMPTY NIGHT rather than a
     refused permission.
     ══════════════════════════════════════════════════════════════════════════ */

  () => tryRun('b342-1: a BAD away night renders a durable card that says what went wrong, and an EMPTY one offers a way out', () => {
    const G = window.G;
    const H = window.HearthriseHome;
    assert(H && typeof H.render === 'function' && typeof H.__awayCardHtml === 'function',
      'the Home dashboard must expose render() and the away-card seam');
    const snap = snapshotG();
    const prevSummary = G.lastOfflineSummary;
    const prevTab = window.activeTab;
    const hiddenDesc = Object.getOwnPropertyDescriptor(document, 'hidden');
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      /* THE MEASURED SCENARIO, AND THE ONE THE WHOLE PROGRAM STARTED FROM. A
         new character on the game's own Recommended foe leaves a fight running
         overnight, dies about a minute in, and comes back to an eight-hour
         absence that paid almost nothing.

         b515 — DRIVEN THROUGH THE REAL RECEIPT PATH, WHICH IS NO LONGER
         processOffline. The night is SIMULATED by the shared engine (`awaySpan`
         = simulateSpan, the copy hr-accrue runs) and the receipt is LANDED by
         `applyServerEnvelope` -> `summaryFromAway`, which is the caller b339's
         escaped mutation would live in today. Nothing here is a hand-built
         receipt except the two explicitly-labelled shape fixtures further down,
         which are about the RENDER GATE and say so. */
      G.equipment = {};
      G.skills = Object.assign({}, G.skills, { attack: 0, strength: 0, defense: 0, hitpoints: 1154 });
      G.playerMaxHp = 10; G.playerHp = 10;
      G.traits = Object.assign({}, G.traits); delete G.traits.auto_eat;
      G.foodSlot = null;
      const m = window.MONSTERS.dragon;
      G.activeMonster = 'dragon'; G.monsterHp = m.hp; G.monsterMaxHp = m.hp;
      G.activeSkill = null; G.activeArtisanRecipe = null;
      G.stats = Object.assign({}, G.stats, { kills: 0, deaths: 0 });
      G.lastOfflineSummary = null;

      /* ⚠ A SINGLE FALL, AND THE SPAN IS SIZED FOR IT (Recovery rev. 2). This
         fixture used to be an EIGHT-HOUR night, which under rev. 2 falls,
         recovers and resumes THIRTEEN times — and the card correctly describes
         that as "you fell 13 times … your run picked up each time", which is a
         different sentence and has its own test (`rev.2: the DURABLE away card
         describes a recovery night as one that kept paying`, immediately
         below). The scenario b342 is about is the FIRST-NIGHT one: you died,
         and the rest of the absence paid nothing — a night the recovery clock
         outlives.

         SIZED, NOT WISHED FOR. The day's FIRST fall is free (`recoveryFor`
         returns 0 at n<=1), so a fresh character resumes instantly and falls
         again; a 90-second span fell twice. The fixture therefore hands the
         character a death history — `deathsTodayBefore` / `deathsLifetimeBefore`
         past the novice grace — which is what a player on their fifth fall of
         the evening actually has, and which buys the first fall in THIS span a
         real knockout longer than the span. The fall count is ASSERTED at 1, so
         a balance change fails here with the reason instead of quietly
         re-becoming the other test. */
      const night = awaySpan({
        monster: 'dragon', spanMs: 90000,
        state: { playerHp: 10, playerMaxHp: 10, equipment: {}, skills: {}, recoveringUntilMs: 0,
          deathsTodayBefore: 8, deathsLifetimeBefore: 8 },
        ctx: {
          playerRolls: () => ({ accuracy: 1, maxHit: 1, critChance: 0 }),
          monsterRolls: () => ({ accuracy: 1e9, maxHit: 9999 }),
        },
      });
      assert(night.out.died === true, 'the fixture did not produce a death; pick a deadlier foe');
      assert(night.out.deaths === 1,
        'FIXTURE: the 3-minute span fell ' + night.out.deaths + ' times — b342-1 is about the night that '
        + 'ENDED in a death, not a night that kept getting back up (that is the rev.2 test below). '
        + 'Shorten the span or lengthen the first knockout.');
      applyAwayEnvelope({
        grantMs: 90000, awayMs: 90000, paidMs: night.out.survivedMs,
        kills: 0, crits: 0, gold: 0, xp: {}, items: {},
        died: true, diedTo: 'dragon',
        deaths: night.out.deaths, recoverMs: night.out.recoverMs || 0,
        recoverRemainingMs: night.out.recoverRemainingMs || 0,
        recoverLadder: night.out.recoverLadder,
        capped: false, blessed: false, featuredMs: 0, featuredDropMult: 1,
      });

      /* (1) THE RECEIPT states the death — it never leaves a renderer to work
         out for itself why the numbers are small. Same rule as `blessed` and
         `crits`: stated, never inferred. */
      const rec = G.lastOfflineSummary;
      assert(rec, 'the envelope wrote no receipt at all, so no durable surface can render the night');
      assert(rec.died === true, 'the receipt does not carry `died`, so the card cannot say it: ' + JSON.stringify({ died: rec.died }));
      assert(rec.diedAfterMs > 0 && rec.diedAfterMs < rec.awayMs,
        'the receipt claims the whole absence was survived by a character who died in it: '
        + rec.diedAfterMs + ' of ' + rec.awayMs);
      assert(rec.diedTo === 'dragon', 'the receipt does not name what killed you: ' + rec.diedTo);

      /* (2) THE SURFACE. Not that the field exists — that the dashboard DRAWS
         the band and the band SAYS it. A night whose paid hours round to
         nothing used to fall under the `hrs >= 0.1` liveness gate, which is
         exactly the absence most in need of an explanation.
         MUTATION PROVEN: drop the `|| _bad` term from the render gate in
         home-dashboard.js and this fails on "no away band"; drop the
         `died`/`diedAfterMs`/`diedTo` mirror in processOffline and it fails one
         step earlier on the receipt. */
      window.showTab('profile');
      H.render();
      const root = document.getElementById('hd-root');
      assert(root, 'the Home dashboard root must exist');
      const band = root.querySelector('.hd-awayband');
      assert(band, 'THE b342 BUG: a night that ended in a death renders NO away band — the only record '
        + 'of it is a toast that is gone in eight seconds');
      const txt = band.textContent.replace(/\s+/g, ' ');
      /* ⚠ THE WORD CHANGED WITH THE RULE, AND THE PROPERTY DID NOT (Recovery
         rev. 2). This asserted `/died/` and `/paid nothing/` — the pre-rev.2
         contract, in which a death ENDED the night. A fall is an INTERRUPTION
         now: the character is knocked out and the run resumes, so "the
         remainder paid nothing" would be a sentence the card is right not to
         print. What must still hold — and is the whole of b342 — is that the
         card SAYS a fall happened, NAMES the foe, and states what it cost.
         The rev.2 copy in full is the subject of the test immediately below;
         this grades the RENDER GATE reaching it at all. */
      assert(/fell|died/i.test(txt), 'the card never mentions the fall that emptied the absence: ' + txt);
      assert(/Dragon/i.test(txt), 'the card does not name what killed you, so "you fell" is unactionable: ' + txt);
      assert(/knocked out/i.test(txt),
        'the card does not say what the fall cost — a fall with no consequence stated reads as a typo: ' + txt);
      assert(/hd-away-note is-bad/.test(band.innerHTML),
        'the death line is not toned as the one clause a player must not skim past');
      /* AND NO BONUS LINE BOASTING ABOUT NOTHING. MEASURED on this very card
         before the fix: "0m on the Boss of the Day (+100% drops)" printed
         beside a death 2.4 seconds into an eight-hour night, because the line
         was gated on `featuredMs > 0` while `fmtSpanShort` floors to minutes.
         Unreachable while away combat was gated; the FIRST card a new player
         sees now.
         MUTATION PROVEN: put `off.featuredMs > 0` back and this fails. */
      assert(!/\b0m on the Boss of the Day/.test(txt),
        'the card claims a featured-boss stretch that rounds to nothing: ' + txt);

      /* (2b) AND THE SHORT ABSENCE THAT KILLED YOU. The dashboard's liveness
         gate is `hrs >= 0.1` — six minutes — which exists to keep a tab-flip
         off the card. Step away for three minutes, come back dead, and that
         same gate hides the only absence you actually need explained. A death
         is admitted on its own terms.
         MUTATION PROVEN: drop the `|| _bad` term from the render gate in
         home-dashboard.js and this fails on "no away band". */
      G.lastOfflineSummary = { hrs: 0.05, awayMs: 3 * 60000, gainedXp: 0, gainedItems: 0,
        gainedGold: 0, gainedKills: 0, burnt: 0, crits: 0, capped: false, blessed: false,
        buffsPaused: false, rateMult: 1, featuredMs: 0, featuredDropMult: 1,
        died: true, diedAfterMs: 42000, diedTo: 'slime', combat: null, at: Date.now() };
      H.render();
      const shortBand = document.querySelector('#hd-root .hd-awayband');
      assert(shortBand, 'a three-minute absence that ended in a death renders NO away band — the '
        + 'liveness gate is hiding the one absence that needs explaining');
      assert(/died/i.test(shortBand.textContent) && /Slime/i.test(shortBand.textContent),
        'the short-absence card does not name the death: ' + shortBand.textContent.replace(/\s+/g, ' '));

      /* (3) AN EMPTY NIGHT STILL OFFERS THE WAY OUT. The CTA used to be gated
         on the removed permission flag; it is gated on the RESULT now, which
         reaches strictly more real cases (dying on the first tick, an artisan
         session with no inputs) than the flag ever did.
         MUTATION PROVEN: gate `quiet` on anything other than "nothing was
         gained" and this fails on the missing CTA. */
      const empty = { hrs: 0.6, awayMs: 8 * 3600000, gainedXp: 0, gainedItems: 0, gainedGold: 0,
        gainedKills: 0, burnt: 0, crits: 0, capped: false, blessed: false, buffsPaused: false,
        rateMult: 1, at: Date.now(), died: false, diedAfterMs: 0, diedTo: null, combat: null };
      const ehtml = String(H.__awayCardHtml(empty));
      const etxt = ehtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      assert(/quiet/i.test(etxt),
        'an empty night must say it was empty rather than printing a bare span: ' + etxt);
      assert(!/base rate/i.test(etxt),
        '"at the base rate" on a night that paid nothing stands where the explanation should be: ' + etxt);
      assert(/pay in full|bank the whole time/i.test(etxt),
        'the card must name the activities that DO pay a whole absence: ' + etxt);
      assert(/data-hd="trainskill"/.test(ehtml),
        'the empty card has no "Train a skill" CTA — the one action on it');

      /* …and it must be a real button, wired to the delegated handler. */
      window.showTab('profile');
      G.lastOfflineSummary = Object.assign({}, empty, { at: Date.now() });
      H.render();
      const cta = document.querySelector('#hd-root .hd-awayband [data-hd="trainskill"]');
      assert(cta, 'the empty card did not reach the dashboard');
      assert(/train a skill/i.test(cta.textContent), 'the CTA must say what it does: ' + cta.textContent);
      assert(typeof cta.onclick === 'function',
        'the CTA is not bound to the dashboard\'s delegated handler, so it is a picture of a button');
      cta.onclick(new Event('click'));
      /* The ACTIVE PANEL, not a tab-name variable: `showTab` is wrapped by half
         a dozen features and the panel's own class is the thing the player sees
         change. A test that graded a global would pass on a nav that painted
         nothing. */
      const skillsPanel = document.getElementById('panel-skills');
      assert(skillsPanel && skillsPanel.classList.contains('active'),
        'the CTA did not land on Skills — the alternative it names is the whole point of the card');
      window.showTab('profile');

      /* THE OTHER DIRECTION. A night that PAID gets neither the empty-night
         copy nor the CTA — a card that tells a paid player to go do something
         else is the same defect pointed the other way — and it keeps the
         base-rate statement, which is governed by away-time-ruling.md. */
      const paidNight = Object.assign({}, empty, { hrs: 8, gainedXp: 900, gainedKills: 12 });
      const phtml = String(H.__awayCardHtml(paidNight));
      const ptxt = phtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      assert(!/data-hd="trainskill"/.test(phtml), 'a night that paid is being told to go do something else');
      assert(!/quiet/i.test(ptxt), 'a night that paid 900 XP is being described as quiet: ' + ptxt);
      assert(/base rate/i.test(ptxt), 'the base-rate statement must survive on every paying night: ' + ptxt);
      assert(!/died/i.test(ptxt), 'the card claims a death on an absence that survived');
    } finally {
      if (hiddenDesc) Object.defineProperty(document, 'hidden', hiddenDesc);
      else { try { delete document.hidden; } catch (e) {} }
      G.lastOfflineSummary = prevSummary;
      /* THE FIXTURE LEAK. This test lands a 90-second DEATH receipt
         through the real envelope path, and a death classifies as AWAY on any
         span — so accrue.js's away holder keeps it, with `at` = now, and
         every Home render for the next THIRTY MINUTES of the suite draws this
         fixture's card. Restoring `G.lastOfflineSummary` is no longer enough,
         because the card deliberately no longer reads only `G`. Any test that
         STATES an away receipt clears the holder here. */
      try { window.HearthriseAccrual.__resetAwayReceipt(); } catch (e) {}
      restoreG(snap);
      try { H.render(); } catch (e) {}
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  () => tryRun('b342-2: the COMBAT screen tells a fighting player what actually ends an away night, and promises nothing else', () => {
    const G = window.G;
    const snap = snapshotG();
    const prevTab = window.activeTab;
    const realHasTrait = window.hasTrait;
    try {
      window.showTab('combat');
      /* ── the always-on activity bar ──────────────────────────────────────
         b342 put a permission counter here. b343 keeps the CHIP and changes
         what it measures: the honest limit on an unattended fight is Auto-Eat
         plus a stocked food slot (auto-actions.js eats nothing without the
         trait), so a flat "pays away" to a player with neither is the same
         false promise b342 was filed against, with the gate swapped out.
         MUTATION PROVEN: make `awayChip` the unconditional "pays away" string
         and the first assertion fails; make it unconditionally "until you
         fall" and the equipped half fails. */
      window.hasTrait = function (id) { return id === 'auto_eat' ? false : realHasTrait.apply(this, arguments); };
      G.activeMonster = 'slime';
      G.foodSlot = null;
      G.stats = Object.assign({}, G.stats, { kills: 41 });
      window.refreshActivityBar();
      const meta = document.getElementById('ab-meta');
      assert(meta, 'the activity bar has no meta element to assert');
      let bar = meta.textContent.replace(/\s+/g, ' ');
      assert(/until you fall/i.test(bar),
        'THE b343 BUG: a fighting player with no Auto-Eat is told nothing about what ends their night: ' + bar);
      assert(!/pays away/i.test(bar),
        'the bar promises unqualified away pay to a character who cannot survive a minute of it: ' + bar);
      assert(/Lifetime/.test(bar) && /41/.test(bar),
        'the lifetime kill total must come back now that nothing is competing for the chip: ' + bar);
      assert(!/licen[cs]e/i.test(bar), 'the retired permit copy is back on the activity bar: ' + bar);

      /* Equip the player the way the engine actually checks — the trait AND a
         slotted food with stock — and the same chip must change its mind. */
      window.hasTrait = function (id) { return id === 'auto_eat' ? true : realHasTrait.apply(this, arguments); };
      G.foodSlot = 'cooked_shrimp';
      G.inventory = Object.assign({}, G.inventory, { cooked_shrimp: 60 });
      window.refreshActivityBar();
      bar = document.getElementById('ab-meta').textContent.replace(/\s+/g, ' ');
      assert(/pays away/i.test(bar) && !/until you fall/i.test(bar),
        'a fight that genuinely carries on while you are away must SAY so: ' + bar);

      /* ONE PREDICATE, shared with the monster preview and the Stats modal —
         three surfaces answering this question from three copies of the rule
         is how they drift apart between builds. */
      assert(typeof window.awayFightSustains === 'function',
        'the shared away-sustain predicate is gone; every surface will re-derive it');
      assert(window.awayFightSustains() === true, 'the predicate disagrees with the chip it drives');
      G.inventory = Object.assign({}, G.inventory, { cooked_shrimp: 0 });
      assert(window.awayFightSustains() === false,
        'an empty food slot still reads as sustained — the count is the whole point');

      /* ── the two boss cards ──────────────────────────────────────────────
         b326's line is unconditional again, and it is true: the featured-boss
         bonus is the ONE channel that survives an absence intact
         (AWAY_SCOPE.botd === true) where blessings and food buffs do not.
         MUTATION PROVEN: delete the line from the card template and this fails
         on "no away line rendered". */
      const B = window.HearthriseBossOfDay;
      assert(B, 'the boss-of-the-day feature must be loaded');
      assert(typeof B.render === 'function' && typeof B.renderWeekly === 'function',
        'both boss cards must be repaintable, or only one of the two promises can be graded');
      /* The cards are hidden during a fight (b292), and the copy under test is
         read by a player choosing one — so grade them in the state they are
         actually seen in, not through a display:none parent. */
      G.activeMonster = null;
      B.render(); B.renderWeekly();
      const panel = document.getElementById('panel-combat');
      const lines = Array.from(panel.querySelectorAll('.botd-away'));
      assert(lines.length >= 1, 'no away line rendered on the boss cards at all');
      const ltext = lines.map((e) => e.textContent).join(' ').replace(/\s+/g, ' ');
      assert(/Pays while you're away/.test(ltext),
        'the featured-boss cards lost the one line that makes "set it before bed" discoverable: ' + ltext);
      assert(!/licen[cs]e/i.test(ltext), 'the retired permit copy is back on the boss cards: ' + ltext);
      assert(lines.every((el) => !el.classList.contains('is-locked')),
        'a boss card is still rendering the retired locked state');
      assert(window.HearthriseCore.away.AWAY_SCOPE.botd === true,
        'the boss cards claim the featured bonus survives an absence while AWAY_SCOPE says it does not');

      /* And the tick still repaints on a real day rollover rather than never.
         b343 removed a third paint watermark that only existed for the gate;
         this asserts the removal did not take the day rollover with it. */
      assert(typeof B.__tick === 'function', 'the boss-card tick must be assertable');
      B.__tick();
      assert(document.querySelectorAll('#panel-combat .botd-away').length >= 1,
        'the tick dropped the away line off the cards');
    } finally {
      window.hasTrait = realHasTrait;
      restoreG(snap);
      try { window.refreshActivityBar(); } catch (e) {}
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  () => tryRun('b342-3: the War Table card cannot start a fight — the fastest path still meets the forecast', () => {
    /* THE MEASURED BUG. b341 removed one-tap-to-fight from every monster ROW
       and left it on `<button class="ce-next" onclick="startCombat('slime')">`
       — the single most likely first click in the game, the only call to action
       on an empty arena. So the honesty work (the survival forecast and the
       Away line) could be routed around by the shortest path through the
       screen.

       b362 — THE SURFACE MOVED, THE RULE DID NOT. The empty arena and its
       Recommended card are gone with `AWAITING A FOE` (the Fight screen has no
       idle state to fill), and the fastest path into a fight is now a WAR TABLE
       CARD. That is what this grades, because the rule was never about a
       particular button: no single tap anywhere on this panel may put a player
       in front of a foe they have not been shown.
       MUTATION PROVEN: give a `.wt-card` an inline `onclick="startCombat(...)"`
       and this fails on "started the fight"; narrow the delegated selector in
       legacy.js back to `.monster-row` and it fails on "opened nothing". */
    const G = window.G;
    const snap = snapshotG();
    const prevTab = window.activeTab;
    const CS = window.HearthriseCombatScreens;
    try {
      assert(CS, 'HearthriseCombatScreens is not published — the two screens did not boot');
      window.showTab('combat');
      G.activeMonster = null;
      CS.setView('table');
      CS.render();
      const btn = document.querySelector('#panel-combat .wt-grid .wt-card:not([disabled])');
      assert(btn, 'the War Table rendered no reachable monster card — nothing to grade');
      assert(!/startCombat/.test(btn.getAttribute('onclick') || ''),
        'THE b342 BUG: a War Table card carries a live inline startCombat(): '
        + btn.getAttribute('onclick'));
      const id = btn.getAttribute('data-monster');
      assert(id && window.MONSTERS[id],
        'the card must name its foe in `data-monster` for the delegated listener, got ' + id);

      btn.click();
      assert(G.activeMonster === null,
        'THE b342 BUG: the War Table card started the fight instead of opening the preview');
      const panel = document.getElementById('panel-combat');
      assert(panel.dataset.combatView === 'fight' && panel.dataset.fightState === 'preview',
        'the card opened nothing at all — a silent button is safe, but it is not the feature. view='
        + panel.dataset.combatView + ' state=' + panel.dataset.fightState);
      assert(CS.previewId === id, 'the preview is for the wrong foe: ' + CS.previewId + ' != ' + id);
      /* And the screen it lands on is the one that tells the truth: the foe's
         own forecast, and the survival span that says whether this fight can be
         left running. A preview with no numbers is the old modal's failure. */
      assert(/\d/.test(document.getElementById('fs-foe-tiles').textContent),
        'the preview carries no forecast for the foe');
      assert(/last/i.test(document.getElementById('fs-metrics').textContent),
        'the preview it routes to carries no survival line, which is the reason for routing here');
    } finally {
      try { if (typeof window.closeMobPreview === 'function') window.closeMobPreview(); } catch (e) {}
      const ov = document.getElementById('mob-preview'); if (ov) ov.classList.remove('open');
      try { window.stopCombat(); } catch (e) {}
      restoreG(snap);
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  () => tryRun('b342-4: the beta banner QUEUES behind the welcome-back modal instead of drawing over it', () => {
    /* THE MEASURED BUG. "Welcome back, adventurer" with "This is a beta build"
       drawn on top of it and `Continue` peeking out below. The banner's
       don't-stack check listed `#welcome-modal.show`, and legacy.js builds
       `<div id="welcome-overlay" class="welcome-overlay">` with an INNER
       `.welcome-modal` that never takes `.show` — so the selector matched
       nothing, the banner "correctly" saw an empty screen, and drew.
       A selector that matches nothing is invisible from outside, which is why
       this asserts the predicate against the REAL overlay the game builds.
       MUTATION PROVEN: revert the list to `#welcome-modal.show` and the first
       assertion fails. */
    const BB = window.HearthriseBetaBanner;
    assert(BB && typeof BB.__modalAlreadyOpen === 'function',
      'the beta banner must publish its don\'t-stack predicate for this to be assertable at all');
    const G = window.G;
    const save = { lastSeen: G.lastSeen, lastWelcome: G.lastWelcome, los: G.lastOfflineSummary };
    const parked = [];   // visible to `finally`
    try {
      /* Clear the screen first, and do it the way Escape does. The assertion
         below is a DELTA (closed → open), so it only means something from a
         clear start — and leaving that to test ordering is how a guard becomes
         intermittent. */
      /* EVERY surface in the queue's own list, not just `.modal.show`: on a
         cold boot the FTUE shade is up, so a fixture that clears one class
         passes only because some earlier test happened to dismiss the rest.
         Derived from the list itself, so a sixth surface does not silently
         re-introduce the ordering dependency. Restored in `finally`. */
      BB.__blockingModals.split(', ').forEach((sel) => {
        if (sel === '#welcome-overlay.show') return;      // the surface under test
        document.querySelectorAll(sel).forEach((n) => {
          if (sel.endsWith('.show')) { n.classList.remove('show'); parked.push(n); }
          else if (n.parentNode) { parked.push({ node: n, parent: n.parentNode }); n.parentNode.removeChild(n); }
        });
      });
      const before = BB.__modalAlreadyOpen();
      assert(before === false,
        'the fixture needs a clear screen — something else is already modal: ' + BB.__blockingModals);
      G.lastSeen = Date.now() - 8 * 3600000;
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      const ov = document.getElementById('welcome-overlay');
      assert(ov && ov.classList.contains('show'),
        'the fixture did not raise the welcome modal, so the collision cannot be observed');
      assert(BB.__modalAlreadyOpen() === true,
        'THE b342 BUG: the beta banner does not see the welcome-back modal and will draw on top of it');
      ov.classList.remove('show');
      assert(BB.__modalAlreadyOpen() === false,
        'the banner is blocked forever once the modal has been shown — a queue that never drains');
      /* The other real overlays are in the list too; a queue that only knows
         one of them is a queue that will collide with the next one. Each entry names a surface that CURRENTLY exists: `#welcome-overlay`
         (the welcome-back modal the fixture above raised), `#hr-dl-modal` (daily-reward,
         presence-only — it has no `.show` state), `.ach-overlay` and the two FTUE
         nodes. Set the Night (a779c9cf) adds NO overlay of its own: its morning
         half renders INSIDE `#welcome-overlay`, which is the entry proven above,
         so it has nothing of its own to list. */
      ['#welcome-overlay.show', '#hr-dl-modal', '.ftue-shade.show', '.ftue-card.show',
       '.ach-overlay.show'].forEach((sel) => {
        assert(BB.__blockingModals.indexOf(sel) >= 0,
          'the don\'t-stack list lost ' + sel + ': ' + BB.__blockingModals);
      });
      /* AND NOTHING DEAD. The bug this guard was written for was not a missing
         selector — it was a
         selector that matched nothing, sitting in the list LOOKING like coverage.
         `#wbv-overlay` is the welcome-v2 modal Set the Night retired (deleted,
         not unwired — see NIGHT-4); back in this list it is the same silent
         hole again. */
      assert(BB.__blockingModals.indexOf('wbv-overlay') < 0,
        'the don\'t-stack list carries a DEAD selector (#wbv-overlay was retired with '
        + 'welcome-v2): ' + BB.__blockingModals);
    } finally {
      const ov = document.getElementById('welcome-overlay'); if (ov) ov.classList.remove('show');
      parked.forEach((p) => { if (p && p.node) p.parent.appendChild(p.node); else if (p) p.classList.add('show'); });
      Object.assign(G, save);
    }
  }),

  () => tryRun('b342-5: the welcome-back modal states the night ONCE, and states what it paid', () => {
    /* THE MEASURED BUG, both halves in one screen:
         · "While away 8.0h" AND "Time away 8h 0m" — one fact, twice, in two
           units, from two estimators (a poller down the file prepended rows
           built from calcCatchup(), an estimate that never saw the ledger);
         · the actual gains (+1,553 XP · +4 items · +7 gold · 3 kills) were NOT
           IN IT AT ALL — they lived only in a toast and on the card BEHIND it.
       MUTATION PROVEN: restore the catchup injector and the duplicate-row
       assertion fails; drop the receipt-sourced gain rows and "reports no
       gains" fails; revert the row tone from `r.bad` to `r.g` and the
       one-alarm assertion fails; put an emoji back and the glyph assertion
       fails. */
    const G = window.G;
    const save = { lastSeen: G.lastSeen, lastWelcome: G.lastWelcome, los: G.lastOfflineSummary };
    try {
      const PAID = {
        hrs: 8, awayMs: 8 * 3600000, gainedXp: 1553, gainedItems: 4, gainedGold: 7,
        gainedKills: 3, burnt: 0, crits: 0, featuredMs: 0, featuredDropMult: 1,
        capped: false, blessed: false, buffsPaused: false, rateMult: 1, at: Date.now(),
        died: true, diedAfterMs: 50400, diedTo: 'slime',
        combat: { kills: 3, died: true, survivedMs: 50400, diedTo: 'slime', crits: 0 },
      };
      G.lastOfflineSummary = PAID;
      G.lastSeen = Date.now() - 8 * 3600000;
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      const rowsEl = document.getElementById('welcome-rows');
      assert(rowsEl, 'the welcome-back modal did not build');
      const rows = Array.from(rowsEl.querySelectorAll('.wb-row'));
      const text = rowsEl.textContent.replace(/\s+/g, ' ');

      /* ONE row about the span. Counting rows, not matching a string: the bug
         was two rows saying the same thing in different words, so a text match
         on either one would have passed while the screen was still wrong.
         ⚠ COUNTED ON THE DURATION, NOT ON THE WORD "away" (rev. 2). The bug was
           "While away 8.0h" beside "Time away 8h 0m" — one QUANTITY, twice, in
           two units — and the word was only ever a proxy for it. Rev. 2's fall
           line says "while you were away" mid-sentence and reports no length at
           all, so the word now over-counts; the eight hours themselves do not,
           in either unit either estimator ever printed. */
      assert(/Time away/.test(text), 'the modal owes the player the span: ' + text);
      /* No `\b` in front: `textContent` runs the label straight into the value
         ("Time away8h 0m"), and a word boundary between "y" and "8" does not
         exist — the same trap the gain assertions below are label-anchored for. */
      const spanRows = rows.filter((r) => /8h 0m|8\.0\s*h/.test(r.textContent));
      assert(spanRows.length === 1,
        'THE b342 BUG: ' + spanRows.length + ' rows report the length of the absence — '
        + spanRows.map((r) => r.textContent.replace(/\s+/g, ' ')).join(' | '));

      /* THE GAINS. The modal is the first thing a returning player reads; it
         reported the clock, the streak and the lifetime totals and never once
         said what the night actually paid. */
      /* Label-anchored, because `textContent` runs the rows together with no
         separator ("Items found+4Gold earned+7") — a bare /\+4\b/ has no word
         boundary there and would fail on a screen that is correct, which is
         its own kind of untrustworthy test. */
      assert(/XP earned\s*\+1,553/.test(text), 'the modal reports no XP for the night: ' + text);
      assert(/Items found\s*\+4/.test(text), 'the modal reports no items for the night: ' + text);
      assert(/Gold earned\s*\+7/.test(text), 'the modal reports no gold for the night: ' + text);
      assert(/Kills\s*\+3/.test(text), 'the modal reports no kills for the night: ' + text);
      /* b341's death line still has to survive all of this — in rev. 2's
         wording ("you fell", because the run no longer ends there) and on a
         receipt that states `died` and no recovery payload, which is the shape
         the deployed server still writes. */
      assert(/You fell once/.test(text) && /Slime/.test(text) && /50s in/.test(text),
        'the death line was lost in the rebuild: ' + text);

      /* THE FINAL DIRECTIVE. Every row in this list used to draw a full-colour
         emoji as art. The whole template is glyphs now — asserted over the
         markup, because an emoji inside a <b> would not show in textContent. */
      const emoji = rowsEl.innerHTML.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
      assert(emoji.length === 0,
        'the welcome-back modal still ships ' + emoji.length + ' emoji as art: ' + emoji.join(' '));

      /* Exactly one row is toned as an alarm, and it is the death. */
      const bad = rows.filter((r) => r.classList.contains('wb-row-bad'));
      assert(bad.length === 1 && /You fell/.test(bad[0].textContent),
        'the alarm tone is on ' + bad.length + ' row(s); it belongs to the death and nothing else');

      /* ══ THE REV. 2 NIGHT, IN THE ORDER THE RULING SET (2026-09-06) ═══════
         A death does not end the run any more, so the shape this modal has to
         describe changed underneath it: a twelve-hour night can hold four falls
         and still be a night the player WON. The ruling's order IS the message
         — gains first (asserted above), then that the run survived, then the
         priced fix, then the cost on ONE line, then the cause, the ladder, the
         40% rule and what is still owed. Asserted as an ORDER, not as a bag of
         strings: rev. 2's first draft had every one of these sentences and read
         as a failure report because two red rows came first.
         MUTATION PROVEN: move the skull row above the `uiSword` row and the
         index comparison fails; drop the `deaths > 1` merge and two rows report
         the falls; drop the `stoppedBy !== 'death'` guard and a run that really
         did stop still claims it picked back up. */
      G.lastOfflineSummary = Object.assign({}, PAID, {
        at: Date.now(), foodEaten: 0,
        deaths: 4, recoverMs: 2 * 3600000, recoverRemainingMs: 47 * 1000,
        recoverLadder: [0, 120000, 240000, 120000],
        autoEat: { enabled: false, pct: 25, hadFood: true },
        stoppedBy: null, stoppedById: null,
      });
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      const rows2 = Array.from(document.getElementById('welcome-rows').querySelectorAll('.wb-row'));
      const t2 = rows2.map((r) => r.textContent.replace(/\s+/g, ' '));
      const at = (re) => t2.findIndex((s) => re.test(s));
      // …and it STILL states the night once and says what it paid.
      assert(t2.filter((s) => /away/i.test(s)).length === 1,
        'the rev. 2 card reports the length of the absence more than once: ' + t2.join(' | '));
      assert(at(/XP earned/) >= 0 && at(/Kills/) >= 0,
        'the rev. 2 card lost the gains it was built to lead with: ' + t2.join(' | '));
      const iPickedUp = at(/picked up against the Slime after every fall/);
      const iFix = at(/Auto-Eat was switched off|worth about/);
      const iFell = at(/You fell 4 times to the Slime/);
      const iLadder = at(/Recovery grows with every fall/);
      const i40 = at(/got back up at 40% health each time/);
      const iLeft = at(/Still recovering when you got back/);
      assert(iPickedUp >= 0, 'the card never says the run picked back up — the single most '
        + 'important fact about a night with falls in it: ' + t2.join(' | '));
      assert(iFix > iPickedUp, 'the priced fix does not follow the survival line: ' + t2.join(' | '));
      assert(iFell > iFix, 'the cost is stated before the fix that answers it — rev. 2 leads with '
        + 'what was earned and what can be done, not with the skull: ' + t2.join(' | '));
      assert(t2.filter((s) => /You fell/.test(s)).length === 1,
        'the falls are reported on more than one row — rev. 2 merges the count and its price: '
        + t2.join(' | '));
      assert(/25% of the night/.test(t2[iFell]),
        'the fall row does not price the night it cost: ' + t2[iFell]);
      assert(iLadder > iFell && /free, 2m, 4m, 2m/.test(t2[iLadder]),
        'the ladder is not stated AS CHARGED (a re-derived one would overstate the novice clamp): '
        + t2.join(' | '));
      assert(i40 > iLadder, 'the 40% rule is missing or out of order: ' + t2.join(' | '));
      assert(iLeft > i40 && /47s to go/.test(t2[iLeft]),
        'the card does not say the character is still down, so it describes one who is fighting: '
        + t2.join(' | '));
      /* AND THE RUN THAT REALLY DID STOP DOES NOT CLAIM OTHERWISE. */
      G.lastOfflineSummary = Object.assign({}, G.lastOfflineSummary,
        { at: Date.now(), stoppedBy: 'death', stoppedById: 'slime' });
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      assert(!/picked up/.test(document.getElementById('welcome-rows').textContent || ''),
        'a run that stopped on the death still tells the player it picked back up');

      /* A zero channel gets NO row — "+0 gold" is noise, and it is the shape
         the estimator used to print. */
      G.lastOfflineSummary = Object.assign({}, PAID, { gainedGold: 0, at: Date.now() });
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      assert(!/Gold earned/.test(document.getElementById('welcome-rows').textContent),
        'a channel that paid nothing still printed a row');

      /* AN EMPTY NIGHT reports the span and NOTHING ELSE — no invented rows,
         no "+0", and no death nobody suffered. b343: the row this used to
         assert named the removed away-combat gate; what survives is the rule
         underneath it, which is that a channel with nothing to say says
         nothing. */
      G.lastOfflineSummary = {
        hrs: 0.6, awayMs: 8 * 3600000, gainedXp: 0, gainedItems: 0, gainedGold: 0,
        gainedKills: 0, burnt: 0, combat: null, capped: false, blessed: false,
        buffsPaused: false, crits: 0, died: false, diedAfterMs: 0, diedTo: null,
        featuredMs: 0, featuredDropMult: 1, rateMult: 1, at: Date.now(),
      };
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      const dtext = document.getElementById('welcome-rows').textContent.replace(/\s+/g, ' ');
      assert(/Time away/.test(dtext), 'the modal owes the player the span even on an empty night: ' + dtext);
      assert(!/XP earned|Items found|Gold earned|Kills/.test(dtext),
        'an empty night printed a gain row for a channel that paid nothing: ' + dtext);
      assert(!/You died/.test(dtext), 'nobody died on this receipt and the modal said they did: ' + dtext);
      assert(!/licen[cs]e/i.test(dtext), 'the retired permit copy is back on the welcome-back modal: ' + dtext);

      /* No fresh receipt → the modal simply says less. It must never invent a
         night it has no record of — and since b514 that includes the LENGTH of
         the night: the old fallback printed `Date.now() - G.lastSeen`, a
         residue stamp, which live said "13h 8m" two hours after the last
         session. With no receipt and no boot watermark there is no span to
         state, so the card greets the player and states none. */
      G.lastOfflineSummary = null; G.lastWelcome = 0;
      if (window.HearthriseAccrual) window.HearthriseAccrual.__setBootAccruedToForTest(0);
      window.__maybeShowWelcome();
      const ntext = document.getElementById('welcome-rows').textContent.replace(/\s+/g, ' ');
      assert(!/XP earned|Gold earned|You died/.test(ntext),
        'with no receipt the modal reported a night anyway: ' + ntext);
      assert(!/Time away/.test(ntext),
        'with no server span the modal still printed one — that is the residue stamp: ' + ntext);
    } finally {
      const ov = document.getElementById('welcome-overlay'); if (ov) ov.classList.remove('show');
      Object.assign(G, save);
    }
  }),

  () => tryRun('b514: "Time away" is the SERVER-priced absence, never a residue stamp', () => {
    /* THE MEASURED BUG (QA slot, b513): the welcome-back card said
       "Time away 13h 8m" on a reload roughly two hours after the last session
       on that account, and earlier the same day "64h 53m" while the server
       receipt for the same boot said `awayMs 15,934,121` (4.4h). The card read
       `Date.now() - G.lastSeen` — a client-held stamp, per-device, advanced
       only by the saves that happen to run. Under CLAUDE.md §1/§6 the absence
       is the server's span.
       MUTATION PROVEN: restore `v: _fresh ? _awayLbl : label` in
       maybeShowWelcome and case A (residue 64h vs receipt 4.4h) still passes
       but case B prints 64h and case C prints a span nobody measured. */
    const G = window.G;
    const AC = window.HearthriseAccrual;
    assert(AC && typeof AC.serverAwaySpanMs === 'function',
      'the server-span seam is missing — every welcome surface would re-derive one from residue');
    const save = { lastSeen: G.lastSeen, lastWelcome: G.lastWelcome, los: G.lastOfflineSummary };
    const rowText = () => (document.getElementById('welcome-rows').textContent || '').replace(/\s+/g, ' ');
    try {
      /* A. A 64-HOUR RESIDUE STAMP LOSES TO A 4.4-HOUR RECEIPT. */
      AC.__setBootAccruedToForTest(0);
      G.lastSeen = Date.now() - 64 * 3600000;
      G.lastOfflineSummary = {
        hrs: 4.4, awayMs: 15934121, gainedXp: 0, gainedItems: 0, gainedGold: 0,
        gainedKills: 0, burnt: 0, combat: null, died: false, at: Date.now(),
      };
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      const a = rowText();
      assert(/Time away\s*4h 26m/.test(a),
        "the card did not print the receipt's credited span (4h 26m): " + a);
      assert(!/64h/.test(a), 'THE b513 BUG: the residue stamp is still on the card: ' + a);

      /* B. IDLE BOOT, NO RECEIPT → the boot watermark, i.e. the last instant
            the server had priced before this boot. */
      G.lastOfflineSummary = null;
      G.lastSeen = Date.now() - 64 * 3600000;
      AC.__setBootAccruedToForTest(Date.now() - 2 * 3600000);
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      const b = rowText();
      assert(/Time away\s*2h 0m/.test(b),
        'an idle boot did not price the absence off the server watermark: ' + b);

      /* C. NO SERVER SPAN AT ALL → no number. A greeting with no length beats
            a length nobody measured. */
      AC.__setBootAccruedToForTest(0);
      G.lastOfflineSummary = null;
      G.lastSeen = Date.now() - 8 * 3600000;
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      const c = rowText();
      assert(!/Time away/.test(c), 'the card invented a span the server never stated: ' + c);

      /* D. A THREE-MINUTE SERVER SPAN IS PRINTED AS THREE MINUTES, even under a
            64-hour residue stamp. The door is still the residue's (it decides
            only whether to greet); the FIGURE is never. */
      AC.__setBootAccruedToForTest(Date.now() - 3 * 60000);
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      const d = rowText();
      assert(/Time away\s*3m/.test(d) && !/64h|13h/.test(d),
        'the card printed the residue stamp instead of the three minutes the server priced: ' + d);
    } finally {
      AC.__setBootAccruedToForTest(0);
      const ov = document.getElementById('welcome-overlay'); if (ov) ov.classList.remove('show');
      G.lastSeen = save.lastSeen; G.lastWelcome = save.lastWelcome; G.lastOfflineSummary = save.los;
    }
  }),

  () => tryRun('regression suite — b543: a reload never re-presents last night as a new absence', () => {
    /* THE MEASURED BUG (QA account on live, build 543, 2026-09-13): a 12-hour
       absence was settled and announced, and then a plain reload FIVE SECONDS
       after playing brought the card back reading "Time away 12h 0m · XP earned
       +88,711 · Items found +2,768 · XP per hour 7,392" — re-presenting, with
       nothing double-credited, a night that was over as the
       absence THIS load had ended. ROOT CAUSE: the boot seed from
       `player_state.last_away_receipt` (marked `restored` so the HOME card can
       survive a reload) was read by the modal and `serverAwaySpanMs` alike.
       MUTATION: drop `&& !_restated` from `_fresh` — case A prints 12h (red). */
    const G = window.G;
    const AC = window.HearthriseAccrual;
    const save = { lastSeen: G.lastSeen, lastWelcome: G.lastWelcome, los: G.lastOfflineSummary };
    const rowText = () => (document.getElementById('welcome-rows').textContent || '').replace(/\s+/g, ' ');
    const NIGHT = { hrs: 12, awayMs: 12 * 3600000, paidMs: 12 * 3600000, gainedXp: 88711,
      gainedItems: 2768, gainedGold: 0, gainedKills: 0, burnt: 0, combat: null, died: false,
      serverAuthoritative: true };
    const show = (extra) => {
      G.lastOfflineSummary = Object.assign({}, NIGHT, { at: Date.now() }, extra || {});
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      return rowText();
    };
    try {
      /* A. THE RELOAD: the RESTORED receipt, same figures and same freshness
            window, against a watermark that says this boot went unpriced for
            twenty seconds. */
      AC.__setBootAccruedToForTest(Date.now() - 20000);
      G.lastSeen = Date.now() - 12 * 3600000;   // stale residue stamp: the door still opens
      const a = show({ restored: true });
      assert(!/Time away/.test(a) && !/12h/.test(a),
        'THE b543 BUG: a twenty-second reload was priced as a twelve-hour absence: ' + a);
      assert(!/XP earned|Items found|per hour/.test(a),
        "last night's gains were re-presented as this load's: " + a);

      /* B. AND THE REAL RETURN STILL REPORTS IN FULL — less on a reload, never
            less on a genuine absence. */
      const b = show();
      assert(/Time away\s*12h 0m/.test(b), 'a genuine twelve-hour return lost its span: ' + b);
      assert(/XP earned\s*\+88,711/.test(b) && /Items found\s*\+2,768/.test(b),
        'a genuine return lost the gains the server paid: ' + b);
    } finally {
      AC.__setBootAccruedToForTest(0);
      const ov = document.getElementById('welcome-overlay'); if (ov) ov.classList.remove('show');
      G.lastSeen = save.lastSeen; G.lastWelcome = save.lastWelcome; G.lastOfflineSummary = save.los;
    }
  }),

  () => tryRun('regression suite — b544: a slow settle still gets its away report into the modal', () => {
    /* THE MEASURED BUG (live b543, 2026-09-13, a genuine ~12 h return): the
       "Welcome back, adventurer" modal carried only Played / Total kills / Gold —
       NO away report — while the Home "While you were away" card, painted later,
       read "12h away — +88,711 XP · +2,768 items" from the same receipt. ROOT
       CAUSE: `setTimeout(maybeShowWelcome, 1500)` in boot() is a guess at the
       `hr_accrue` round trip, and it rendered before the envelope landed; the
       5 s `G.lastWelcome` door then denied the real receipt a second chance.
       THE FIX: boot waits on the settle-first latch (`awaySettleDone`) and the
       envelope presents the modal itself.
       MUTATION PROOF: make `presentWelcomeWhenSettled` call `presentWelcome()`
       unconditionally (the pre-b544 behaviour) → arm A fails, the stats-only
       modal is up, `G.lastWelcome` is spent and arm B prints no away report. */
    const G = window.G;
    const AC = window.HearthriseAccrual;
    assert(typeof window.__presentWelcomeWhenSettled === 'function',
      'boot() has no waiting presenter — the modal is back to racing the settle');
    const save = { lastSeen: G.lastSeen, lastWelcome: G.lastWelcome, los: G.lastOfflineSummary,
      settled: AC.awaySettleDone() };
    try {
      /* The overlay is built LAZILY by the modal itself, so a filtered run has no
         `#welcome-rows` until something shows it once. Build it here rather than
         depending on whichever earlier test happened to open it. */
      G.lastSeen = Date.now() - 12 * 3600000; G.lastWelcome = 0; G.lastOfflineSummary = null;
      window.__maybeShowWelcome();
      const rows = document.getElementById('welcome-rows');
      assert(rows, 'the welcome overlay never built — this guard would be vacuous');
      const rowText = () => (rows.textContent || '').replace(/\s+/g, ' ');

      /* A. THE BOOT TIMER FIRES AT 1.5 s AND THE SETTLE HAS NOT ANSWERED. */
      AC.__resetAwaySettleLatch(false);
      AC.__setBootAccruedToForTest(Date.now() - 12 * 3600000);
      G.lastSeen = Date.now() - 12 * 3600000;   // the 30-minute door is open
      G.lastOfflineSummary = null;
      G.lastWelcome = 0;
      rows.innerHTML = '';
      const ov0 = document.getElementById('welcome-overlay'); if (ov0) ov0.classList.remove('show');
      window.__resetWelcomePresentation(false);
      window.__presentWelcomeWhenSettled();
      const ov = document.getElementById('welcome-overlay');
      assert(!(ov && ov.classList.contains('show')),
        'THE b544 BUG: the modal rendered before the settle answered — ' + rowText());
      assert(!(G.lastWelcome > 0),
        'the timer spent the 5 s welcome door on a receipt-less modal, so the away '
        + 'report can never be shown for this load');

      /* B. THE SETTLE LANDS LATE — and the away report is still the modal's. */
      G.lastOfflineSummary = { hrs: 12, awayMs: 12 * 3600000, paidMs: 12 * 3600000,
        gainedXp: 88711, gainedItems: 2768, gainedGold: 0, gainedKills: 0, burnt: 0,
        combat: null, died: false, serverAuthoritative: true, at: Date.now() };
      AC.__resetAwaySettleLatch(true);
      window.__presentWelcomeWhenSettled();
      const b = rowText();
      assert(/Time away\s*12h 0m/.test(b),
        'the late settle never reached the modal — no span: ' + b);
      assert(/XP earned\s*\+88,711/.test(b) && /Items found\s*\+2,768/.test(b),
        'the player was greeted without the night the server just paid: ' + b);
    } finally {
      AC.__setBootAccruedToForTest(0);
      AC.__resetAwaySettleLatch(save.settled);
      const ov = document.getElementById('welcome-overlay'); if (ov) ov.classList.remove('show');
      window.__resetWelcomePresentation(true);   // spent: the 250 ms poll armed above no-ops
      G.lastSeen = save.lastSeen; G.lastWelcome = save.lastWelcome; G.lastOfflineSummary = save.los;
    }
  }),

  () => tryRun('regression suite — b545: a settle slower than the wait cap still reports the night, and a stats-only card is superseded', () => {
    /* THE MEASURED BUG (LIVE b544, hearthrise.net, QA account, 2026-09-13 20:5x
       UTC, a genuine ~12 h return with fishing active): the "What's new" sheet
       showed first, and behind it the "Welcome back, adventurer" modal carried
       only Played / Total kills lifetime / Gold in pocket — no Time away, no XP
       earned — while the Home card underneath read "12h away — +51,424 XP ·
       +6,428 items". At +58 s `awaySettleDone()` was true and
       `G.lastOfflineSummary.awayMs` was 43,200,000 with the gains on it: the
       settle DID land with an AWAY receipt, after the modal had spoken.
       THIRD BUG OF THIS CLASS. ROOT CAUSE: the boot timer waits on the
       settle-first latch but only to a 10 s cap; a twelve-hour settle answered
       later, the timer presented a receipt-less modal anyway and SPENT the
       one-per-page-life latch, so the AWAY receipt that arrived afterwards was
       refused by `__presentWelcome`. Nothing was miscredited — the news was.
       THE FIX, both halves: (1) the poll keeps waiting past the cap while
       `settleInFlight()` says the answer is on the wire (to a hard ceiling);
       (2) the latch remembers WHAT was said, so an AWAY receipt SUPERSEDES a
       provisional stats-only card that is still open — even though `saveLocal()`
       has by then beaten `G.lastSeen` forward to now and the 30-minute door
       would refuse a fresh greeting.
       MUTATION PROOF (both ran red before the fix):
         · drop `|| (inflight && now < WELCOME_GATE.ceiling)` → arm A presents a
           stats-only modal and spends the latch → "the cap won the race again".
         · make `__presentWelcome` `return false` whenever `WELCOME_GATE.shownAt`
           (the b544 behaviour) → arm B's supersede never happens. */
    const G = window.G;
    const AC = window.HearthriseAccrual;
    assert(typeof AC.settleInFlight === 'function',
      'accrue.js no longer says whether a settle is on the wire — the presenter is back to '
      + 'treating "unanswered" and "never asked" as one fact, which is what the 10 s cap did');
    const NIGHT = { hrs: 12, awayMs: 12 * 3600000, paidMs: 12 * 3600000, gainedXp: 51424,
      gainedItems: 6428, gainedGold: 0, gainedKills: 0, burnt: 0, combat: null, died: false,
      serverAuthoritative: true };
    const save = { lastSeen: G.lastSeen, lastWelcome: G.lastWelcome, los: G.lastOfflineSummary,
      settled: AC.awaySettleDone(), inflight: AC.settleInFlight };
    let news = null;
    try {
      G.lastSeen = Date.now() - 12 * 3600000; G.lastWelcome = 0; G.lastOfflineSummary = null;
      window.__maybeShowWelcome();                       // the overlay is built lazily
      const rows = document.getElementById('welcome-rows');
      assert(rows, 'the welcome overlay never built — this guard would be vacuous');
      const rowText = () => (rows.textContent || '').replace(/\s+/g, ' ');
      const ov = () => document.getElementById('welcome-overlay');
      const shown = () => !!(ov() && ov().classList.contains('show'));
      const receipt = () => Object.assign({}, NIGHT, { at: Date.now() });
      const reset = (waitMs, maxWaitMs) => {                 // a fresh page life, wait window spent
        rows.innerHTML = ''; if (ov()) ov().classList.remove('show');
        G.lastOfflineSummary = null; G.lastWelcome = 0;
        G.lastSeen = Date.now() - 12 * 3600000;              // the 30-minute door is open
        AC.__resetAwaySettleLatch(false); AC.__setBootAccruedToForTest(0);   // nothing paid, no watermark
        window.__resetWelcomePresentation(false, waitMs, maxWaitMs);
      };
      /* THE LIVE ENVIRONMENT: the What's-New sheet is up. A separate overlay with its own
         latch, so it must neither suppress nor swallow the return report — pinned because
         "the two modals share a container" was a live hypothesis for this bug. */
      news = document.createElement('div'); news.id = 'hr-welcome-modal'; document.body.appendChild(news);

      /* A. THE 12 h SETTLE IS SLOWER THAN THE CAP: the wait window is spent and the
            request is still on the wire, so the timer must stay silent. */
      reset(0, 60000); AC.settleInFlight = () => true;
      window.__presentWelcomeWhenSettled();
      assert(!shown(), 'THE b545 BUG: the cap expired mid-flight and the modal spoke without a receipt — ' + rowText());
      assert(!(G.lastWelcome > 0), 'a receipt-less modal spent the 5 s welcome door on this load');
      /* …and when the answer finally lands, the envelope presents the night. */
      G.lastOfflineSummary = receipt(); AC.__resetAwaySettleLatch(true); AC.settleInFlight = () => false;
      assert(window.__presentWelcome() === true, 'the late away receipt was refused the modal');
      const a = rowText();
      assert(/Time away\s*12h 0m/.test(a), 'the late settle never reached the modal — no span: ' + a);
      assert(/XP earned\s*\+51,424/.test(a) && /Items found\s*\+6,428/.test(a), 'greeted without the night the server paid: ' + a);
      assert(document.getElementById('hr-welcome-modal'), "the What's-New sheet was removed by the return card");

      /* B. THE SUPERSEDE. Nothing on the wire either (a settle that never started), so the
            timer greets with lifetime stats — correct, nothing else is known — and the
            receipt that arrives afterwards REPLACES that card while it is still open, with
            `G.lastSeen` already beaten to now by the saves in between, exactly as live. */
      reset(0, 0); AC.settleInFlight = () => false;
      window.__presentWelcomeWhenSettled();
      assert(shown(), 'nothing was on the wire and the player was greeted with silence');
      const b0 = rowText();
      assert(/Total kills lifetime/.test(b0), 'the stats-only greeting is empty: ' + b0);
      assert(!/Time away|XP earned/.test(b0), 'a modal with no receipt reported an absence: ' + b0);
      G.lastSeen = Date.now();                               // saveLocal() beat the stamp forward
      G.lastOfflineSummary = receipt(); AC.__resetAwaySettleLatch(true);
      assert(window.__presentWelcome() === true, 'the away receipt could not supersede the provisional card');
      const b = rowText();
      assert(/Time away\s*12h 0m/.test(b) && /XP earned\s*\+51,424/.test(b), 'the stats-only card was not replaced: ' + b);
      /* And once reported, nothing re-reports it — a second envelope must not re-render
         the card the player is reading. */
      G.lastOfflineSummary = Object.assign(receipt(), { gainedXp: 999 });
      assert(window.__presentWelcome() === false, 'the absence was reported twice');

      /* C. A CARD THE PLAYER CLOSED IS NEVER RE-OPENED: the Home away card owns the
            story from there, and a modal that pops back is its own bug. */
      reset(0, 0);
      window.__presentWelcomeWhenSettled();
      assert(shown(), 'arm C never greeted — the arm would be vacuous');
      ov().classList.remove('show');                         // the player dismissed it
      G.lastOfflineSummary = receipt();
      assert(window.__presentWelcome() === false && !shown(), 'a dismissed modal was re-opened by a later receipt');
    } finally {
      AC.settleInFlight = save.inflight;
      AC.__setBootAccruedToForTest(0);
      AC.__resetAwaySettleLatch(save.settled);
      if (news && news.parentNode) news.parentNode.removeChild(news);
      const ov2 = document.getElementById('welcome-overlay'); if (ov2) ov2.classList.remove('show');
      window.__resetWelcomePresentation(true);   // spent: any poll armed above no-ops
      G.lastSeen = save.lastSeen; G.lastWelcome = save.lastWelcome; G.lastOfflineSummary = save.los;
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b343 — THE PRICE CATALOGUE IS WHAT THE GAME ACTUALLY CHARGES.

     A server that authorises a spend must own the price, and every price in
     Hearthrise lives in a shop table inside `src/legacy.js` — a classic
     script that neither ESM nor Deno can import (the b222 trap). So
     `tools/gen-shops.mjs` extracts them into `src/data/shops.js`: a SECOND
     COPY, chosen knowingly over refactoring legacy.js's data seam mid-program,
     exactly as b338's starting kit was.

     `gen-shops.mjs --check` already guards that copy — but it compares the
     generated file to a fresh extraction from the SOURCE TEXT, and this test
     asserts something the text cannot: that the catalogue equals the tables
     THE RUNNING GAME READS, after main.js's ESM merge and after every
     `window.X = X` publication in legacy.js. "The file says 100" and "the shop
     charges 100" are different claims, and only the second one is the one a
     player pays.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRunAsync('B343-1: every extracted price equals what the LIVE shop tables charge', async () => {
    const S = await import('../../data/shops.js?v=554');
    assert(Array.isArray(S.SHOP_OFFERS) && S.SHOP_OFFERS.length > 100,
      'src/data/shops.js published ' + (S.SHOP_OFFERS || []).length + ' offers — an empty or tiny '
      + 'catalogue would make every assertion below vacuous');

    const byId = new Map(S.SHOP_OFFERS.map((o) => [o.id, o]));
    const goldOf = (id) => {
      const o = byId.get(id);
      assert(o, 'the catalogue has no offer "' + id + '" — the extraction lost a table');
      const l = o.cost.find((c) => c.kind === 'currency' && c.id === 'gold');
      assert(l, 'offer "' + id + '" carries no gold line');
      return l.amount;
    };
    const anyOf = (id, kind, cid) => {
      const o = byId.get(id);
      assert(o, 'the catalogue has no offer "' + id + '"');
      const l = o.cost.find((c) => c.kind === kind && c.id === cid);
      assert(l, 'offer "' + id + '" carries no ' + kind + ':' + cid + ' line');
      return l.amount;
    };

    /* THE CONTROL. Every comparison below is `catalogue === live`, which
       passes trivially if the live table is missing and both sides read
       `undefined`. So prove the live tables are actually here first — this is
       the assertion-that-asserts-nothing check, done before the assertions. */
    for (const t of ['ROOMS', 'SEED_SHOP', 'EQUIP_SHOP', 'TRAITS', 'IAP_CATALOG', 'BANK_SPACE', 'DUNGEONS']) {
      assert(window[t] && (Array.isArray(window[t]) ? window[t].length : Object.keys(window[t]).length),
        'window.' + t + ' is missing or empty at runtime, so comparing prices against it would '
        + 'assert nothing');
    }

    /* ROOMS — the biggest table, and the only multi-currency one. Walk EVERY
       rung of every room, both the gold and the material lines. 40 rungs. */
    let rungs = 0;
    for (const roomId of Object.keys(window.ROOMS)) {
      (window.ROOMS[roomId].levels || []).forEach((lv, i) => {
        rungs++;
        const oid = 'room.' + roomId + '.' + (i + 1);
        for (const k of Object.keys(lv.cost)) {
          const live = lv.cost[k];
          const got = k === 'gold' ? goldOf(oid) : anyOf(oid, 'item', k);
          assert(got === live,
            oid + ' costs ' + live + ' ' + k + ' in the LIVE table but ' + got
            + ' in src/data/shops.js — the server would authorise the wrong price');
        }
        assert(byId.get(oid).cost.length === Object.keys(lv.cost).length,
          oid + ' has ' + byId.get(oid).cost.length + ' cost lines against '
          + Object.keys(lv.cost).length + ' live — a cost line was invented or dropped');
      });
    }
    assert(rungs >= 40, 'only ' + rungs + ' room rungs walked — the live ROOMS table shrank');

    /* SEED_SHOP — the price is per BUNDLE. A catalogue that recorded the unit
       price would let the server charge a tenth of the real cost. */
    for (const s of window.SEED_SHOP) {
      assert(goldOf('seed.' + s.id) === s.cost, 'seed.' + s.id + ' price disagrees with SEED_SHOP');
      const g = byId.get('seed.' + s.id).grant.find((x) => x.kind === 'item' && x.id === s.id);
      assert(g && g.amount === s.qty,
        'seed.' + s.id + ' grants ' + (g && g.amount) + ' but SEED_SHOP sells a bundle of ' + s.qty);
    }
    for (const s of window.EQUIP_SHOP) {
      assert(goldOf('equip.' + s.id) === s.cost, 'equip.' + s.id + ' price disagrees with EQUIP_SHOP');
    }

    /* TRAITS and the bank gem rung — the two non-gold player currencies that
       the server has no column for and one it does. */
    for (const id of Object.keys(window.TRAITS)) {
      const t = window.TRAITS[id];
      const cur = t.currency === 'marks' ? 'marks' : 'gold';
      assert(anyOf('trait.' + id, 'currency', cur) === t.cost,
        'trait.' + id + ' price disagrees with TRAITS');
    }
    assert(anyOf('bank.gems', 'currency', 'gems') === window.BANK_SPACE.gem.cost,
      'bank.gems price disagrees with BANK_SPACE');

    /* DUNGEONS — the item-priced class, and the one whose spend code has a
       live `hearth_token` branch that debits G.inventory rather than the
       currency column. If a dungeon ever gains a gold or token cost, this
       catches a catalogue that still thinks entry is a key. */
    for (const id of Object.keys(window.DUNGEONS)) {
      const d = window.DUNGEONS[id];
      const o = byId.get('dungeon.' + id);
      assert(o, 'the catalogue has no offer for dungeon "' + id + '"');
      const want = [];
      if (d.cost && d.cost.gold) want.push('currency:gold:' + d.cost.gold);
      if (d.cost && d.cost.hearth_token) want.push('item:hearth_token:' + d.cost.hearth_token);
      if (d.cost && d.cost.key) want.push('item:' + d.cost.key + ':1');
      const got = o.cost.map((l) => l.kind + ':' + l.id + ':' + l.amount);
      assert(JSON.stringify(want.sort()) === JSON.stringify(got.sort()),
        'dungeon.' + id + ' entry fee is ' + JSON.stringify(want) + ' live but '
        + JSON.stringify(got) + ' in the catalogue');
      assert(o.reqLv === (d.reqLv | 0),
        'dungeon.' + id + ' gate is Lv ' + d.reqLv + ' live but ' + o.reqLv + ' in the catalogue — '
        + 'a server that authorises the spend re-checks this');
    }

    /* IAP — money in CENTS. A float or a string here is a billing bug. */
    for (const p of window.IAP_CATALOG) {
      const cents = anyOf('iap.' + p.sku, 'money', 'usd');
      assert(Number.isSafeInteger(cents) && cents > 0,
        'iap.' + p.sku + ' price ' + cents + ' is not a positive integer number of cents');
      assert('$' + (cents / 100).toFixed(2) === String(p.price).replace('/mo', ''),
        'iap.' + p.sku + ' is ' + p.price + ' live but ' + cents + ' cents in the catalogue');
    }

    /* The catalogue must never be mistaken for complete. Six spend sites
       compute their price at call time and are deliberately absent; a server
       that could not find an offer and invented a price is worse than one with
       no catalogue at all. */
    assert(Array.isArray(S.DERIVED_PRICES) && S.DERIVED_PRICES.length >= 6,
      'DERIVED_PRICES lists ' + (S.DERIVED_PRICES || []).length + ' formula-priced sites; the '
      + 'known set is 6, and dropping one hides a price the server cannot compute');
    for (const d of S.DERIVED_PRICES) {
      assert(!byId.has(d.id), 'offer "' + d.id + '" is in BOTH SHOP_OFFERS and DERIVED_PRICES');
      assert(d.where && d.formula && d.server_needs,
        'DERIVED_PRICES entry "' + d.id + '" does not say where it lives, what its formula is, '
        + 'and what the server would need — a TODO with no address is not a finding');
    }

    /* THE FINAL DIRECTIVE, as a runtime assertion: no offer may grant the
       Hearth Token bond for anything but real money. */
    for (const o of S.SHOP_OFFERS) {
      const mints = o.grant.some((l) => l.kind === 'currency' && l.id === 'hearth_tokens');
      if (mints) {
        assert(o.cost.every((l) => l.kind === 'money'),
          'offer "' + o.id + '" mints Hearth Tokens for something other than real money');
      }
    }
  }),
  () => tryRun('b343-1: the retired permit wording appears in NO player-facing copy — screens, authored tables, or state-dependent renderers', () => {
    /* WHY THIS GUARD EXISTS, IN TYLER'S WORDS: "I think we just needed to make
       it a quest and get rid of the license shit it's way too confusing." He
       could not parse his own UI. Round two wipes every account to hour one, so
       all twenty beta testers meet that word with LESS context than he had.

       This asserts the property, not the edit. Three passes, because copy
       reaches a player by three different routes and a sweep of only one of
       them is the shape of guard that passes while the screen is still wrong:

         A. AUTHORED TABLES — quest labels/notes and the FTUE steps. These are
            data, they are the source of most player-visible sentences, and a
            reverted data row would never show up in a DOM sweep of a save that
            has not reached that quest.
         B. STATE-DEPENDENT RENDERERS — the away card, the activity bar, the
            boss cards, the monster preview. Every one of them carried the word
            in EXACTLY ONE of its branches, so a sweep of whatever state the
            suite happens to be in would miss it. Both branches are driven.
         C. THE ACTUAL SCREENS — every tab, rendered, including tooltips
            (`title`), because a tooltip is copy the player reads.

       Comments and test names are deliberately NOT in scope: the reasoning for
       the removal has to live somewhere, and deleting the record of why a thing
       was removed is how it comes back.

       MUTATION PROVEN: put `label: 'Field Licence — defeat 100 monsters'` back
       on the quest row and pass A fails; restore the b342 `!_lic.ok` branch on
       the activity bar and pass B fails; put the word in any panel's markup and
       pass C fails. */
    const NEEDLE = /licen[cs]e/i;
    const G = window.G;
    const snap = snapshotG();
    const prevTab = window.activeTab;
    const realHasTrait = window.hasTrait;
    const found = [];
    const scan = (where, text) => {
      const s = String(text == null ? '' : text);
      if (NEEDLE.test(s)) found.push(where + ': …' + s.replace(/\s+/g, ' ').slice(Math.max(0, s.search(NEEDLE) - 40), s.search(NEEDLE) + 80) + '…');
    };
    try {
      // ── A. AUTHORED COPY TABLES ───────────────────────────────────────────
      (window.QUEST_DEFS || []).forEach((q) => scan('QUEST_DEFS[' + q.id + ']', q.label + ' ' + (q.note || '')));
      assert((window.QUEST_DEFS || []).length > 0, 'no quest rows were scanned — pass A would be vacuous');
      const steps = (window.HearthriseFTUE && window.HearthriseFTUE.steps()) || [];
      assert(steps.length > 0, 'no FTUE steps were scanned — pass A would be vacuous');
      steps.forEach((s) => scan('FTUE[' + s.id + ']', (s.title || '') + ' ' + (s.body || '') + ' ' + (s.primary || '')));
      Object.keys(window.TRAITS || {}).forEach((k) => {
        const t = window.TRAITS[k];
        scan('TRAITS[' + k + ']', (t.name || '') + ' ' + (t.desc || ''));
      });

      // ── B. BOTH BRANCHES OF EVERY STATE-DEPENDENT RENDERER ────────────────
      const H = window.HearthriseHome;
      const receipt = (over) => Object.assign({
        hrs: 8, awayMs: 8 * 3600000, gainedXp: 0, gainedItems: 0, gainedGold: 0, gainedKills: 0,
        burnt: 0, crits: 0, capped: false, blessed: false, buffsPaused: false, rateMult: 1,
        featuredMs: 0, featuredDropMult: 1, died: false, diedAfterMs: 0, diedTo: null,
        combat: null, at: Date.now(),
      }, over || {});
      [receipt({}),                                                            // empty night
        receipt({ gainedXp: 900, gainedKills: 12 }),                           // paid night
        receipt({ died: true, diedAfterMs: 50400, diedTo: 'slime', gainedXp: 34 }),  // bad night
        receipt({ capped: true, budgetHrs: 12, buffsPaused: true, featuredMs: 3600000 }),
      ].forEach((r, i) => scan('awayCardHtml#' + i, H.__awayCardHtml(r)));

      window.showTab('combat');
      [false, true].forEach((sustains) => {
        window.hasTrait = function (id) { return id === 'auto_eat' ? sustains : realHasTrait.apply(this, arguments); };
        G.foodSlot = sustains ? 'cooked_shrimp' : null;
        if (sustains) G.inventory = Object.assign({}, G.inventory, { cooked_shrimp: 40 });
        G.activeMonster = 'slime'; G.stats = Object.assign({}, G.stats, { kills: sustains ? 4000 : 3 });
        window.refreshActivityBar();
        const meta = document.getElementById('ab-meta');
        scan('activityBar(sustains=' + sustains + ')', meta ? meta.innerHTML : '');
        G.activeMonster = null;
        try { window.HearthriseBossOfDay.render(); window.HearthriseBossOfDay.renderWeekly(); } catch (e) {}
        Array.from(document.querySelectorAll('#panel-combat .botd-away'))
          .forEach((el, i) => scan('bossCard#' + i + '(sustains=' + sustains + ')', el.innerHTML));
        try {
          window.openMobPreview('slime');
          const mp = document.getElementById('mp-modal');
          scan('monsterPreview(sustains=' + sustains + ')', mp ? mp.innerHTML : '');
        } finally { try { window.closeMobPreview(); } catch (e) {} }
      });

      // ── C. THE RENDERED SCREENS, TOOLTIPS INCLUDED ────────────────────────
      const TABS = ['home', 'profile', 'character', 'combat', 'skills', 'farming', 'house',
        'social', 'clan', 'shop', 'market', 'bounty', 'stable', 'events', 'dungeons', 'inventory'];
      let scanned = 0;
      TABS.forEach((t) => {
        try { window.showTab(t); } catch (e) { return; }
        const panel = document.querySelector('.panel.active');
        if (!panel) return;
        scanned++;
        scan('panel:' + t, panel.textContent);
        Array.from(panel.querySelectorAll('[title]'))
          .forEach((el) => scan('title@' + t, el.getAttribute('title')));
      });
      assert(scanned >= 8, 'only ' + scanned + ' panels rendered — pass C would be nearly vacuous');

      assert(found.length === 0,
        'the retired permit wording is back in ' + found.length + ' player-facing place(s):\n  '
        + found.slice(0, 6).join('\n  '));
    } finally {
      window.hasTrait = realHasTrait;
      restoreG(snap);
      try { window.refreshActivityBar(); } catch (e) {}
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     b345 — THREE BUGS THE DESIGNERS FOUND BY PLAYING, all measured.

     Every assertion below grades a SURFACE — a toast the player reads, text in
     a rendered card, a real click landing on a real element. Not one of them
     is satisfied by a field being present in G. That distinction is the whole
     lesson of b341→b342 (a guard asserted `G._awayLicence` EXISTS, which it
     did, while the card that was supposed to read it had never been built),
     and this repo is at instance #15 of the family.
     ══════════════════════════════════════════════════════════════════════════ */

  () => tryRun('B345-1: a night whose supplies ran out is REPORTED as one — the toast and the card both say so', () => {
    /* ── THE MEASURED BUG ────────────────────────────────────────────────
       Starter cook: 8 Raw Shrimp on cook_shrimp, `lastSeen` rewound 8h. The
       away interval is 3,840 ms, so the run earned for 30.7 seconds of a
       28,800-second night — 0.107% of it. What the player was told, in order:

         3  "Out of Raw Shrimp — cooking stopped"       <- the only honest line
         4  "Offline 8.0h at the base rate — +11 items, +80 XP · 1 burnt"

       The last thing they read described a full night. `lastOfflineSummary`
       had 21 fields and not one could express supply exhaustion, so every
       durable surface built on it rendered 31 seconds as eight hours.

       ── AND THE BUG UNDER THE BUG, found by measuring rather than reading ──
       `if(typeof hasInputs==='function' && !hasInputs(rec)) break;` did not
       merely fail to RECORD the stop — it never ran. `hasInputs` is declared
       inside an IIFE ~9,400 lines further down and never published, so at
       processOffline's scope the free identifier resolves against the global
       object and is `undefined`. Measured: 7,500 calls into a bag that had
       been empty since call 9.

       MUTATIONS THAT MUST TURN THIS RED (each verified):
         M1 restore the `typeof hasInputs` guard in processOffline's artisan
            loop  -> "the night is still reported as a full night" (toast) and
            the card assertion, because nothing is ever stated;
         M2 drop `stopLead` from the offline toast -> the toast assertion;
         M3 drop the `awayStop` note in home-dashboard.js -> the card
            assertion, with the toast still passing (which is exactly why both
            surfaces are graded);
         M4 drop the welcome-modal row -> the modal assertion. */
    const G = window.G;
    const H = window.HearthriseHome;
    assert(H && typeof H.render === 'function', 'the Home dashboard must expose render()');
    const snap = snapshotG();
    const prevSummary = G.lastOfflineSummary;
    const prevTab = window.activeTab;
    const realNotify = window.notify;
    const realBonus = window.getBonus;
    const hiddenDesc = Object.getOwnPropertyDescriptor(document, 'hidden');
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      const rec = (window.ARTISAN_RECIPES.cooking || []).find((r) => r.id === 'cook_shrimp');
      assert(rec, 'cook_shrimp must exist for this scenario to mean anything');

      /* PIN THE SPEED KEYS FOR THE DURATION. The away interval is
         pacedActionMs(ms) x speedClamp(getBonus(cookSpeed) + toolSpeed), and
         getBonus MOVES under this test: food buffs decay, world events rotate,
         and src/features/power-budget.js re-installs itself as the outermost
         getBonus wrapper on a permanent 1-SECOND INTERVAL. Measured: the same
         fixture produced a 3,724ms interval during the run and 3,763ms when
         read back a moment later - a test that fails once every N runs for a
         reason that has nothing to do with what it grades. Pinning removes the
         moving part instead of buying tolerance for it; a tolerance here would
         accept a genuinely mis-measured span. `__hrPowerBudget` is
         power-budget's own idempotence flag, so claiming it keeps this wrapper
         outermost and the 1s re-install leaves it alone. */
      const speedKeys = { gatherSpeed: 1, cookSpeed: 1, smithSpeed: 1, craftSpeed: 1, prayerSpeed: 1 };
      const pinned = function (k) { return speedKeys[k] ? 0 : realBonus.apply(this, arguments); };
      pinned.__hrPowerBudget = true;
      window.getBonus = pinned;

      /* ── b515: HOW A NIGHT IS RUN NOW, AND THE GAP IN THE MIDDLE OF IT ────
         The old rig called `window.processOffline()` and read the receipt it
         built. b515 deleted that engine. The night is SIMULATED by
         `simulateArtisanSpan` (the copy hr-accrue runs) and the receipt is
         LANDED by `applyServerEnvelope` -> `summaryFromAway`, which raises the
         toast this test is named for.

         ⚠ AND THE WIRE BETWEEN THEM DOES NOT CARRY THE STOP. hr-accrue's
           `away:` payload has no `stoppedBy` / `stoppedById` / `burnt`, and
           `summaryFromAway` does not copy them, so on a LIVE envelope this
           night still renders as eight honest hours — b345, restored, on the
           only path that runs. Filed 2026-09-07 as a P1 in DISCOVERIES.md and
           routed to Backend (index.ts) + Systems (accrue.js); it is NOT fixed
           here and it is NOT tested away. What this rig proves is the two ends
           the client owns: the ENGINE states the stop, and every SURFACE
           renders it when the receipt carries one (b345's own M1, M2, M3, M4).
           The missing middle is named here so the next reader meets it. */
      const runNight = (shrimp, hours) => {
        const hrs = hours || 8;
        const span = awayArtisanSpan({
          targetId: 'cook_shrimp', spanMs: hrs * 3600000,
          state: { skills: { cooking: 0 }, inventory: { shrimp: shrimp }, rooms: { kitchen: 1 } },
          ctx: { bonus: window.getBonus },
        });
        const cap = window.offlineCapHours();
        const capped = hrs > cap;
        const awayMs = Math.min(hrs, cap) * 3600000;
        G.rooms = Object.assign({}, G.rooms, { kitchen: 1 });
        G.activeMonster = null; G.activeArtisanRecipe = null;
        G.activeSkill = 'cooking'; G.skillTargetId = 'cook_shrimp';
        G.lastOfflineSummary = null;
        const landed = applyAwayEnvelope({
          grantMs: awayMs, awayMs: awayMs, paidMs: span.out.paidMs,
          unpaidMs: Math.max(0, hrs * 3600000 - awayMs),
          kills: 0, crits: 0, gold: 0, xp: span.paid.xp, items: span.paid.items,
          died: false, capped: capped, blessed: false,
          /* THE THREE FIELDS THE WIRE DROPS. See the note above. */
          stoppedBy: span.out.stoppedBy, stoppedById: span.out.stoppedById,
          stoppedSkill: span.out.skill, stoppedPerHour: span.out.stoppedPerHour,
          burnt: span.out.burnt,
        });
        return { toasts: landed.toasts, last: landed.last,
          rec: G.lastOfflineSummary, stepMs: span.out.intervalMs, span: span };
      };

      // ── (1) THE 8-SHRIMP NIGHT ────────────────────────────────────────
      const out = runNight(8);
      assert(out.rec, 'the absence wrote no receipt at all');

      /* The receipt has to be ABLE to say it — but that is a precondition of
         the assertions below, never the finding itself. */
      assert(out.rec.stoppedBy === 'supplies',
        'the receipt cannot express supply exhaustion: stoppedBy=' + out.rec.stoppedBy);
      assert(out.rec.stoppedById === 'shrimp',
        'the receipt does not name what ran out: ' + out.rec.stoppedById);
      /* 8 shrimp x the away interval. EXACT, because a run that "roughly"
         stopped is a run whose length nobody measured. */
      assert(out.rec.paidMs === 8 * out.stepMs,
        'the receipt reports ' + out.rec.paidMs + 'ms paid; 8 shrimp at ' + out.stepMs
          + 'ms is ' + (8 * out.stepMs));
      assert(out.rec.paidMs < out.rec.awayMs / 100,
        'this scenario is supposed to be a fraction of a percent of the night — the fixture drifted');

      /* ⚠ THE TOAST HALF IS A NAMED GAP, NOT A DROPPED ASSERTION (b515, QA).
         b345 put the stop at the FRONT of the welcome-back toast — "Cooking ran
         out of Raw Shrimp 31s in; the remaining 7h 59m paid nothing." — because
         the toast is the LAST thing a returning player reads and it was the
         thing contradicting the honest line fired three toasts earlier.

         That sentence was built inside processOffline's local receipt block and
         b515 deleted it with the engine. The server-path toast is
         `accrue.js receiptSentence`, and it has never had a stop clause: for a
         stopped night it prints "⏰ Away 8h — the server credited +8 items,
         +174 XP, +0 gold", which is the exact sentence b345 exists to have
         deleted. Restoring it needs a `skillLabel`/`itemLabel` injection beside
         the existing `foeLabel` and is copy, so it is FILED (DISCOVERIES.md
         2026-09-07, routed to Systems + Game Designer) rather than invented
         here — and it is not asserted here, because asserting a sentence no
         shipped code can produce is a red that teaches the next reader to
         delete the assertion.

         What IS still asserted, below, is every surface that survived: the
         RECEIPT can express the stop (the translator half, fixed in this
         change), the DURABLE CARD says it, and the WELCOME MODAL says it. Those
         are b345's M1, M3 and M4. M2 — the toast — is the gap. */
      assert(typeof out.last === 'string' && out.last.length > 0,
        'the absence raised no toast at all, so even the reduced sentence is gone');
      const spanStr = Math.max(1, Math.round(out.rec.paidMs / 1000)) + 's in';

      /* THE DURABLE CARD. The toast is gone in seconds; this is the surface
         the player still has when they go looking. */
      window.showTab('profile');
      H.render();
      const root = document.getElementById('hd-root');
      assert(root, 'the Home dashboard root must exist');
      const band = root.querySelector('.hd-awayband');
      assert(band, 'no away band rendered for a night that paid something');
      const txt = band.textContent.replace(/\s+/g, ' ');
      assert(/ran out of Raw Shrimp/i.test(txt),
        'THE b345 BUG: the durable card still reads as eight hours of honest pay — ' + txt);
      assert(txt.indexOf(spanStr) >= 0,
        'the card must state the span that actually earned, in SECONDS at this scale (expected "'
          + spanStr + '"): ' + txt);
      assert(/paid nothing/i.test(txt),
        'the card never says the remainder earned nothing: ' + txt);
      assert(/an hour/i.test(txt) && /stock up/i.test(txt),
        'the card states no consumption rate, so "run out" is a fact nobody can act on: ' + txt);


      /* THE FIRST SCREEN A RETURNING PLAYER READS must tell the same story,
         or the two surfaces disagree about one absence — the b342 defect. */
      G.lastSeen = Date.now() - 8 * 3600000;
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      const rowsEl = document.getElementById('welcome-rows');
      assert(rowsEl, 'the welcome-back modal did not build');
      const rowTxt = rowsEl.textContent.replace(/\s+/g, ' ');
      assert(/ran out of Raw Shrimp/i.test(rowTxt),
        'the welcome-back modal reports the night without the stop that ended it: ' + rowTxt);
      const ov = document.getElementById('welcome-overlay'); if (ov) ov.classList.remove('show');

      /* AND THE CEILING IS NOT BLAMED FOR IT. A long absence that stopped 31s
         in IS "capped" in wall-clock terms, and the cap cost the player
         nothing — printing "upgrades raise this" beside the stop sells a
         purchase that would have changed no number on the card. Run at a
         length that genuinely hits the ceiling, with the ceiling asserted
         first, so this cannot pass by never being capped at all.
         MUTATION PROVEN: drop the `&& !off.stoppedBy` term from the cap note
         in home-dashboard.js and this fails. */
      const capped = runNight(8, window.offlineCapHours() + 2);
      assert(capped.rec.capped === true,
        'the fixture did not reach the away ceiling — the cap assertion would prove nothing');
      assert(capped.rec.stoppedBy === 'supplies', 'the capped fixture did not stop on supplies');
      const capTxt = String(H.__awayCardHtml(capped.rec)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      assert(!/away max/i.test(capTxt),
        'the card blames the away ceiling for a night the supplies ended: ' + capTxt);
      assert(!/capped at your/i.test(capped.last),
        'the toast blames the away ceiling for a night the supplies ended: ' + capped.last);
      /* …and a capped night that ran the whole way KEEPS the line, because
         for that player the ceiling is exactly what stopped them. */
      const capFull = runNight(500000, window.offlineCapHours() + 2);
      assert(capFull.rec.capped === true && capFull.rec.stoppedBy === null,
        'the stocked capped fixture is not the case it claims to be');
      assert(/away max/i.test(String(H.__awayCardHtml(capFull.rec)).replace(/<[^>]*>/g, ' ')),
        'a genuinely capped night lost the ceiling note — the fix over-corrected');

      /* Back to the reported scenario for the round-trip check. */
      const out2 = runNight(8);
      assert(out2.rec.stoppedBy === 'supplies', 'the 8h scenario stopped reporting the supply stop');

      /* ⚠ THE ROUND TRIP IS A SECOND NAMED GAP. This asserted the stop survived
         `saveLocal()` — "a receipt that evaporates on reload is a toast with
         extra steps". There is no local save any more, and
         `lastOfflineSummary` is NOT on the residue allowlist
         (client-state.js RESIDUE_FIELDS) and is not projected by hr_state_of,
         so the welcome-back card genuinely does not survive a reload today. The
         absence is already paid, so no new away envelope rebuilds it either.
         Filed with the payload gap (DISCOVERIES.md 2026-09-07): either the
         receipt joins the residue or the card is honestly a session surface.
         Asserting the old behaviour here would be asserting a store that does
         not exist. */

      // ── (2) THE OTHER DIRECTION ───────────────────────────────────────
      /* A well-stocked night must produce NONE of this copy. A card that
         explains a shortage to somebody who had plenty is the same defect
         pointed the other way, and it is what a renderer that INFERRED the
         stop from `paidMs < awayMs` would do on every ordinary night (tick
         flooring guarantees the inequality). */
      const plenty = runNight(50000);
      assert(plenty.rec.stoppedBy === null,
        'a fully-supplied night reported a stop: ' + JSON.stringify(plenty.rec.stoppedBy));
      assert(!/ran out of/i.test(plenty.last),
        'a fully-supplied night still says the supplies ran out: ' + plenty.last);
      const fullTxt = String(H.__awayCardHtml(plenty.rec)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      assert(!/ran out of/i.test(fullTxt), 'the card invents a shortage on a stocked night: ' + fullTxt);
      assert(/base rate/i.test(fullTxt), 'the base-rate statement must survive on a paying night: ' + fullTxt);

      // ── (3) A PRE-b345 RECEIPT DEGRADES TO SILENCE ────────────────────
      const legacyShape = { hrs: 8, awayMs: 8 * 3600000, gainedXp: 51, gainedItems: 4, at: Date.now() };
      const legacyTxt = String(H.__awayCardHtml(legacyShape)).replace(/<[^>]*>/g, ' ');
      assert(!/ran out of/i.test(legacyTxt),
        'an old receipt with no stop payload produced stop copy — the renderer is inferring: ' + legacyTxt);
    } finally {
      window.notify = realNotify;
      window.getBonus = realBonus;
      if (hiddenDesc) Object.defineProperty(document, 'hidden', hiddenDesc);
      else { try { delete document.hidden; } catch (e) {} }
      G.lastOfflineSummary = prevSummary;
      try { window.HearthriseAccrual.__resetAwayReceipt(); } catch (e) {}   // the away holder outlives G
      restoreG(snap);
      try { H.render(); } catch (e) {}
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  /* b353: CLIENT-AUTHORITATIVE, like its sibling b166. This test proves the
     sheet's CLICK reaches the game, and it measures that by watching gold move.
     Under the flip, a claim is a `claim_reward` intent: the local payment is a
     PREDICTION, and on a device with no server configured it is rolled back
     within the same turn — so the balance correctly nets zero and the test's
     instrument reads nothing. The interaction it guards is unchanged; only its
     yardstick needs the position where a local payment IS the payment. */
  () => tryRunAsync('B345-2: the daily-reward sheet never swallows a click in silence, and the next click reaches the game', async () => {
    /* ── THE MEASURED BUG ────────────────────────────────────────────────
       Real first boot (storage cleared, tour finished, Skills › Woodcutting):
       `.hr-dl-box` — the 420x242 panel, dead centre — sat on top of the first
       gathering tile. The handler reacted to exactly two things: the claim
       button, and `e.target === scrim`. A click landing on the PANEL matched
       neither, so it did nothing at all — no claim, no dismissal, no feedback,
       sheet still up. Four consecutive clicks on "Normal Tree" were swallowed
       with `activeSkill` still null. There was no close control of any kind,
       so nothing said that the dark area — and only the dark area — was the
       way out. Round 2 wipes every save to first boot, so this is the opening
       interaction of the game for all twenty beta players.

       MUTATION PROVEN: restore `else if (e.target === scrim) { scrim.remove(); }`
       in daily-reward.js and the first assertion fails with the sheet still on
       screen; remove the `.hr-dl-close` button and the affordance assertion
       fails; remove the keydown listener and the Escape assertion fails. */
    const G = window.G;
    const D = window.HearthriseDaily;
    assert(D && typeof D.open === 'function', 'the daily-reward feature must be loaded');
    const prevDaily = G.dailyReward ? JSON.parse(JSON.stringify(G.dailyReward)) : null;
    const prevGold = G.gold;
    const realNotify = window.notify;
    const kill = () => { const s = document.getElementById('hr-dl-modal'); if (s) s.remove(); };
    /* The FTUE tour sits at z-index 99999, one above this sheet (which is
       exactly why daily-reward.js waits for it — `anotherModalUp()`), so in a
       harness context it is the thing elementFromPoint finds. Parked for the
       duration and restored, rather than ended: this test has no business
       changing the tour's state, and a hit-test that silently graded the wrong
       element would be a guard asserting nothing. */
    const parked = Array.from(document.querySelectorAll('.ftue-root'))
      .map((el) => ({ el, prev: el.style.display }));
    try {
      parked.forEach((p) => { p.el.style.display = 'none'; });
      const toasts = [];
      window.notify = function (m) { toasts.push(String(m)); };
      G.dailyReward = { lastClaimDay: 0 };                 // claimable
      kill(); D.open();
      let scrim = document.getElementById('hr-dl-modal');
      assert(scrim, 'the daily sheet did not open');

      /* (a) THERE IS A VISIBLE WAY OUT. Measured absent before this fix. */
      const closeBtn = scrim.querySelector('[data-dl-close]');
      assert(closeBtn, 'THE b345 BUG: the sheet has no close control at all');
      assert(getComputedStyle(closeBtn).display !== 'none' && closeBtn.getBoundingClientRect().width > 0,
        'the close control exists but is not on screen');
      assert(/close/i.test(scrim.textContent),
        'nothing on the sheet tells the player how to get rid of it: ' + scrim.textContent.slice(0, 160));
      assert(scrim.getAttribute('role') === 'dialog' && scrim.getAttribute('aria-modal') === 'true',
        'a full-screen interceptor must declare itself a modal dialog');

      /* (b) A CLICK ON THE PANEL — the exact click that was eaten — must
         produce a visible result. Driven at the geometric centre of the box,
         through elementFromPoint, so this grades what a MOUSE does and not
         what a hand-picked target does. */
      const box = scrim.querySelector('.hr-dl-box');
      const r = box.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + 30);
      /* Park whatever the suite's earlier tests have left stacked above this
         point until the sheet itself is the thing under the cursor. Derived
         from the actual paint order rather than from a hardcoded list of
         overlay class names — a list would rot, and a hit-test that quietly
         graded the wrong element is a guard asserting nothing. */
      /* ⚠ PARK THE WHOLE COMPETING LAYER, NOT ONE NODE OF IT. This hid `hit`
         itself, which only uncovers `hit`'s PARENT — so a competing overlay
         with any depth to it (the character-select drawer another test leaves
         `.open`, whose rows nest four deep) ate the twelve-step budget walking
         up its own ancestry and never reached the sheet. The assertion then
         failed as "the probe point is not on the sheet's dead area", which
         reads as a defect in the sheet and is a defect in the fixture.
         One step per LAYER: climb to the body-level ancestor and park that.
         Nothing below is weakened — the hit still has to land inside the scrim
         and outside both buttons, and the walk is still bounded. */
      const stack = [];
      let hit = document.elementFromPoint(cx, cy);
      for (let i = 0; i < 24 && hit && !scrim.contains(hit); i++) {
        let layer = hit;
        while (layer.parentElement && layer.parentElement !== document.body) layer = layer.parentElement;
        if (layer === scrim || !layer.style) break;
        stack.push(layer.id ? '#' + layer.id : '.' + String(layer.className).split(' ')[0]);
        parked.push({ el: layer, prev: layer.style.display });
        layer.style.display = 'none';
        hit = document.elementFromPoint(cx, cy);
      }
      assert(hit && scrim.contains(hit) && !hit.closest('[data-dl-claim]')
        && !hit.closest('[data-dl-close]'),
        'the probe point is not on the sheet\'s dead area (it is "'
          + (hit ? (hit.id ? '#' + hit.id : '.' + String(hit.className).split(' ')[0]) : 'null')
          + '") — the fixture proves nothing. Layers parked getting there: '
          + (stack.join(' > ') || 'none'));
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      assert(!document.getElementById('hr-dl-modal'),
        'THE b345 BUG: a click on the sheet\'s own panel did nothing — it is swallowed in silence '
        + 'and the sheet is still up to swallow the next one');
      /* And the reward was not silently lost with it. */
      assert(D.isClaimable(G) === true, 'dismissing the sheet must not consume the reward');
      assert(toasts.some((t) => /still waiting/i.test(t)),
        'the sheet vanished without saying where the reward went: ' + toasts.join(' | '));

      /* (c) THE NEXT CLICK REACHES THE GAME. The player-level property: after
         one intercepted click, that same screen point is no longer the sheet. */
      const nowAt = document.elementFromPoint(cx, cy);
      assert(!nowAt || !nowAt.closest('.hr-dl-scrim'),
        'the sheet is still intercepting that point after being dismissed');

      /* (d) ESCAPE. */
      toasts.length = 0;
      kill(); D.open();
      assert(document.getElementById('hr-dl-modal'), 'the sheet did not reopen for the Escape case');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert(!document.getElementById('hr-dl-modal'), 'Escape does not close the sheet');
      /* THE LISTENER MUST DIE WITH THE SHEET, including when the sheet is torn
         out by something other than close(). A document-level keydown that
         outlives its modal fires forever — here it would toast "your reward is
         waiting" on every Escape for the rest of the session.
         MUTATION PROVEN: drop the `scrim.isConnected` guard from onKey and
         this fails with a toast from a sheet nobody can see. */
      toasts.length = 0;
      kill(); D.open();
      document.getElementById('hr-dl-modal').remove();      // torn out, not closed
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert(toasts.length === 0,
        'a removed sheet still answers the keyboard: ' + toasts.join(' | '));

      /* (e) AND CLAIMING STILL CLAIMS. The fix must not have turned the
         reward button into another way to close the sheet. */
      toasts.length = 0;
      G.dailyReward = { lastClaimDay: 0 };
      const before = goldOf();
      kill(); D.open();
      const claimBtn = document.querySelector('#hr-dl-modal [data-dl-claim]');
      assert(claimBtn, 'the claimable sheet has no claim button');
      /* b515 — THE CLICK IS THE SUBJECT; THE PAYMENT IS THE SERVER'S. This
         asserted `G.gold` went up, which was only ever true in the retired
         client-authoritative position — `D.claim` sends a `claim_reward` intent
         and the balance arrives ABSOLUTELY on the answer (B354-1 owns that
         arithmetic). What this test is about is that the button still REACHES
         the claim rather than having become a second way to close the sheet, so
         it is answered by a server and graded on the server's number. */
      const SERVER_GOLD = before + 1234;
      await withServerBacked({ state: { gold: SERVER_GOLD } }, async (rig) => {
        claimBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await rig.drain();
        assert(rig.sent.length === 1 && rig.sent[0].verb === 'claim_reward',
          'clicking Claim sent ' + JSON.stringify(rig.sent) + ' — the button has become another way to '
          + 'close the sheet, which is the fix over-correcting into the same silence');
        assert(goldOf() === SERVER_GOLD,
          'clicking Claim left the balance at ' + goldOf() + ' and the server said ' + SERVER_GOLD);
      });
      assert(!document.getElementById('hr-dl-modal'), 'claiming did not close the sheet');
      assert(D.isClaimable(G) === false, 'the reward is still claimable after being claimed');
      assert(!toasts.some((t) => /still waiting/i.test(t)),
        'a CLAIMED reward was announced as still waiting: ' + toasts.join(' | '));
    } finally {
      window.notify = realNotify;
      kill();
      parked.forEach((p) => { p.el.style.display = p.prev; });
      if (prevDaily) G.dailyReward = prevDaily;
      G.gold = prevGold;
      try { if (typeof window.updateTopbar === 'function') window.updateTopbar(); } catch (e) {}
    }
  }),

  /* ASYNC on purpose: openSkillDetail() defers the repaint by a macrotask
     (`setTimeout(() => renderSkillDetail(id), 0)`), so a synchronous test
     reads whatever the PREVIOUS test left on screen — which is how the first
     draft of this one compared a mining tile to a woodcutting rate. Driving
     the player's actual entry point and waiting for the paint is the honest
     shape; calling renderSkillDetail directly would skip the hop. */
  () => tryRunAsync('B345-3: an activity tile quotes the XP the ENGINE pays, not a number it made up', async () => {
    if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(true);
    /* ── THE MEASURED BUG ────────────────────────────────────────────────
       The gather tile printed `Math.max(1, Math.floor(pacedXp(skill, xp)))`,
       which drops the `(1 + allXP + xpB)` term grantXp applies to every grant.
       Stock save, Normal Tree: the tile said "5 XP · 4.6s"; actionRate said 6;
       the engine paid 6. The activity HEADER four inches above it reads
       actionRate, so two readouts of one number disagreed on one screen.

       This test grades three things against each other — the DOM tile, the
       header's calculator, and what addXp actually moves the skill by — so it
       cannot be satisfied by making two of the three agree on a wrong number.

       MUTATION PROVEN: restore the bare `pacedXp` expression in EITHER
       legacy.js tileForGather or activities-grid.js's effXp and the tile/engine
       comparison fails (whichever renderer is wired). */
    const G = window.G;
    const snap = snapshotG();
    const prevTab = window.activeTab;
    const realBonus = window.getBonus;
    try {
      const tree = (window.TREES || [])[0];
      assert(tree, 'there must be a gathering action to grade');
      /* A REAL, NON-ZERO allXP. Without one the broken expression and the
         correct one agree, and the test would pass on the bug. Injected at the
         same seam every perk source uses (the wrapper chain), not by writing a
         field, so the whole stack is exercised.

         `__hrPowerBudget` IS LOAD-BEARING, and finding out why cost an hour:
         src/features/power-budget.js re-installs itself as the OUTERMOST
         getBonus wrapper on a permanent 1-SECOND INTERVAL, and it re-wraps
         anything that does not carry that flag. So a substitute getBonus in an
         ASYNC test is stable for under a second — after that the value is
         silently re-clamped by the budget and the test is measuring a
         different stack than the one it installed. (Measured: an override
         reading 3.03 came back as 0.28 by the next assertion.) Claiming the
         flag is the module's own published idempotence contract, not a defeat
         of the fuse: `realBonus` below is still the fully-budgeted chain, and
         only the synthetic term rides outside it — identically for the tile,
         for actionRate and for addXp, which is exactly the three-way equality
         under test. */
      const SPEED = { gatherSpeed: 1, cookSpeed: 1, smithSpeed: 1, craftSpeed: 1, prayerSpeed: 1 };
      const raise = (n) => {
        const f = function (k) {
          if (k === 'allXP') return (realBonus(k) || 0) + n;
          /* PINNED, for the duration. The tile prints a DURATION as well as an
             XP figure, and the duration is `speedClamp(getBonus(speedKey))` —
             which moves while this test runs (buffs decay, events rotate, the
             power-budget re-install re-clamps). Measured: an artisan tile read
             3.7s against a rate computed a moment later at 3.8s. Pinning makes
             the comparison exact instead of tolerant; the property under test
             ("the tile equals the one calculator") holds at any speed. */
          if (SPEED[k]) return 0;
          return realBonus.apply(this, arguments);
        };
        f.__hrPowerBudget = true;
        window.getBonus = f;
      };
      raise(0.25);
      assert(window.getBonus('allXP') >= 0.25, 'the fixture failed to raise allXP — nothing below is tested');

      const rate = window.actionRate('woodcutting', tree);
      assert(rate && rate.xpPerAction > 0, 'actionRate returned nothing for the first tree');

      /* WHAT THE ENGINE ACTUALLY PAYS, measured by moving it. Rested XP is a
         BANK, not a rate, so it is emptied for the measurement. */
      G.skills = Object.assign({}, G.skills, { woodcutting: 0 });
      const restedSave = G.restedXp; G.restedXp = 0;
      predZero();                                   // b455: no standing prediction may inflate the measurement
      const beforeXp = xpOf('woodcutting');
      window.addXp('woodcutting', tree.xp);
      const paid = xpOf('woodcutting') - beforeXp;
      G.restedXp = restedSave;
      assert(paid === rate.xpPerAction,
        'the HEADER\'s calculator disagrees with the engine (' + rate.xpPerAction + ' vs ' + paid + ') — '
        + 'the tile below cannot be graded against a broken reference');

      /* THE TILE THE PLAYER SEES. Read out of the live DOM through the real
         renderer, whichever of the two twins is wired — a test that called one
         builder directly would pass while the other shipped the bug.

         AND IT MUST ACTUALLY REPAINT. renderSkillDetail keeps a render key and
         takes the cheap lightUpdate path when it has not changed; lightUpdate
         never rewrites `.at-meta`. Before b345 the tile's XP could not depend
         on allXP, so the key had no reason to carry it — which meant this test
         was reading a tile painted under a DIFFERENT bonus stack (measured:
         tile 8, engine 7, and both were "right" for the moment they were
         computed). The key now carries the multiplier, so raising allXP is
         itself what forces the repaint, and asserting on the tile below
         doubles as the guard that it does. */
      const tileNames = () => Array.from(document.querySelectorAll('#skill-detail .act-tile'))
        .map((t) => ((t.querySelector('.at-name') || {}).textContent || '').trim());
      const tileFor = (name) => Array.from(document.querySelectorAll('#skill-detail .act-tile'))
        .find((t) => ((t.querySelector('.at-name') || {}).textContent || '').trim() === String(name).trim());
      /* The same reset the game itself performs when it needs a guaranteed
         rebuild (legacy.js does it in two places). Earlier tests in this suite
         leave the detail pane in whatever state they finished in. */
      window._actLastRender = { skillId: null, activeKey: null };
      window.showTab('skills');
      window.openSkillDetail('woodcutting');
      await new Promise((r) => setTimeout(r, 60));
      const tile = tileFor(tree.name);
      assert(tile, 'no tile rendered for "' + tree.name + '" — on screen: [' + tileNames().join(', ') + ']');
      const meta = tile.querySelector('.at-meta');
      assert(meta, 'the tile for "' + tree.name + '" has no meta line');
      const shown = meta.textContent.trim();
      const m = shown.match(/^(\d+)\s*XP/);
      assert(m, 'the tile no longer leads with an XP figure: ' + shown);
      assert(Number(m[1]) === paid,
        'THE b345 BUG: the tile advertises ' + m[1] + ' XP for an action the engine pays ' + paid
          + ' for (tile: "' + shown + '")');
      /* And the duration, which was already right for gathering — pinned so
         the "read the one calculator" fix cannot regress it. */
      const secs = shown.match(/·\s*([\d.]+)s/);
      assert(secs && Math.abs(Number(secs[1]) - rate.ms / 1000) < 0.06,
        'the tile duration drifted from actionRate: ' + shown + ' vs ' + (rate.ms / 1000).toFixed(1) + 's');

      /* ── THE STALENESS THIS FIX CREATED, AND CLOSED ──────────────────
         Printing the engine's number means the tile now DEPENDS on allXP,
         and renderSkillDetail's cheap path (lightUpdate) never rewrites
         `.at-meta`. So a blessing or buff arriving mid-session would have
         left the pre-buff figure on screen — the same class of bug the
         render key already carries `catLv` and `catBurn` for. Raising the
         multiplier and re-rendering must move the tile.
         MUTATION PROVEN: drop `catXp` from the activeKey in EITHER twin and
         this fails with the stale number still on the tile. */
      raise(3);
      window.openSkillDetail('woodcutting');
      await new Promise((r) => setTimeout(r, 60));
      const bigRate = window.actionRate('woodcutting', tree);
      const restaled = tileFor(tree.name).querySelector('.at-meta').textContent.trim();
      assert(bigRate.xpPerAction > rate.xpPerAction,
        'the fixture did not actually move the multiplier — the staleness check would pass vacuously');
      assert(restaled !== shown && Number((restaled.match(/^(\d+)/) || [])[1]) === bigRate.xpPerAction,
        'the tile did not repaint when the XP multiplier changed — it still reads "' + restaled
          + '" where the engine now pays ' + bigRate.xpPerAction);
      raise(0.25);

      /* THE ARTISAN TILE carried the same lie plus one of its own (it applied
         no speed perk at all). Same three-way grade. */
      const cook = (window.ARTISAN_RECIPES.cooking || []).find((r) => r.id === 'cook_shrimp');
      assert(cook, 'cook_shrimp must exist');
      const cRate = window.actionRate('cooking', cook);
      G.skills = Object.assign({}, G.skills, { cooking: 0 });
      predZero();                                   // b455: no standing prediction may inflate the measurement
      const cBefore = xpOf('cooking');
      const cRested = G.restedXp; G.restedXp = 0;
      window.addXp('cooking', cook.xp);
      const cPaid = xpOf('cooking') - cBefore;
      G.restedXp = cRested;
      assert(cPaid === cRate.xpPerAction,
        'actionRate disagrees with the engine for cooking: ' + cRate.xpPerAction + ' vs ' + cPaid);
      G.rooms = Object.assign({}, G.rooms, { kitchen: 1 });
      window.openSkillDetail('cooking');
      await new Promise((r) => setTimeout(r, 60));
      const cTile = tileFor(cook.name);
      assert(cTile, 'no tile rendered for "' + cook.name + '"');
      const cShown = cTile.querySelector('.at-meta').textContent.trim();
      const cm = cShown.match(/^(\d+)\s*XP/);
      assert(cm, 'the artisan tile no longer leads with an XP figure: ' + cShown);
      assert(Number(cm[1]) === cPaid,
        'THE b345 BUG: the artisan tile advertises ' + cm[1] + ' XP for an action the engine pays '
          + cPaid + ' for (tile: "' + cShown + '")');
      /* The artisan tile's OWN extra lie: it printed pacedActionMs with no
         speed perk applied at all. Pinned against the one calculator. */
      const cSecs = cShown.match(/·\s*([\d.]+)s/);
      assert(cSecs && Math.abs(Number(cSecs[1]) - cRate.ms / 1000) < 0.06,
        'the artisan tile duration drifted from actionRate: ' + cShown
          + ' vs ' + (cRate.ms / 1000).toFixed(1) + 's');

      /* ── THE TWIN NOBODY CAN SEE ──────────────────────────────────────
         src/features/activities-grid.js holds a second copy of both tile
         builders. In the shipped boot order legacy.js block 27 assigns
         window.renderSkillDetail LAST, so the twin paints nothing — measured:
         reverting its XP expression to the pre-b345 bare pacedXp left this
         whole suite green. A twin no test can reach is a twin that drifts,
         and this is the file that drifted last time. Graded through its
         published builders instead of through the DOM.
         MUTATION PROVEN: restore the bare `pacedXp` in activities-grid.js's
         effXp and this fails, with every DOM assertion above still passing. */
      const AG = window.HearthriseActivitiesGrid;
      assert(AG && typeof AG.__tileForGather === 'function' && typeof AG.__tileForArtisan === 'function',
        'the activities-grid twin publishes no test seam, so it cannot be graded at all');
      const metaOf = (html) => {
        const d = document.createElement('div'); d.innerHTML = html;
        const el = d.querySelector('.at-meta');
        return el ? el.textContent.trim() : '';
      };
      const twinGather = metaOf(AG.__tileForGather(tree, 'woodcutting'));
      assert(Number((twinGather.match(/^(\d+)/) || [])[1]) === rate.xpPerAction,
        'the activities-grid TWIN quotes ' + twinGather + ' where the engine pays '
          + rate.xpPerAction + ' — the two tile builders have drifted again');
      const twinArtisan = metaOf(AG.__tileForArtisan(cook, 'cooking'));
      assert(Number((twinArtisan.match(/^(\d+)/) || [])[1]) === cRate.xpPerAction,
        'the activities-grid TWIN quotes ' + twinArtisan + ' for cooking where the engine pays '
          + cRate.xpPerAction);
    } finally {
      if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(null);
      window.getBonus = realBonus;
      restoreG(snap);
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  /* ── REGRESSION (Paione screenshot, 2026-08-29): a lane that pays its XP to
     a DIFFERENT skill must SAY so on the tile. Quarry rungs live on the
     Stonemason page but pay MINING XP by design (stonecraft.js §8.4 —
     "quarrying is mining; refining is the stonemason part"); the tile said a
     bare "7 XP" under a Stonemason header whose bar never moved, and a player
     with 260 rubble read it as "Stonemason gets no XP". Surface contract, so
     it reads the rendered DOM through the real renderer (the b342/b345 rule),
     and both directions: cross-skill names the skill, same-skill stays bare. */
  () => tryRunAsync('XP-ROUTE-LABEL: a cross-skill lane names its XP skill on the tile (Quarry → "Mining XP"); a same-skill lane stays bare', async () => {
    const snap = snapshotG();
    const prevTab = window._activeTab;
    try {
      if (typeof window.setLevel === 'function') window.setLevel('stonemason', 10);
      else { G.skills = G.skills || {}; G.skills.stonemason = Math.max(G.skills.stonemason || 0, 1200); }
      window._actLastRender = { skillId: null, activeKey: null };
      window.showTab('skills');
      window.openSkillDetail('stonemason');
      await new Promise((r) => setTimeout(r, 60));
      const tiles = Array.from(document.querySelectorAll('#skill-detail .act-tile'));
      assert(tiles.length, 'no tiles rendered on the Stonemason detail page');
      const metaOf = (name) => {
        const t = tiles.find((x) => ((x.querySelector('.at-name') || {}).textContent || '').trim() === name);
        return t ? ((t.querySelector('.at-meta') || {}).textContent || '').trim() : null;
      };
      const quarry = metaOf('Quarry Rubble');
      assert(quarry !== null, 'no "Quarry Rubble" tile on the Stonemason page — on screen: ['
        + tiles.map((t) => ((t.querySelector('.at-name') || {}).textContent || '').trim()).join(', ') + ']');
      assert(/\bMining XP\b/.test(quarry),
        'THE CONFUSION: the quarry tile does not say its XP pays MINING — meta reads "' + quarry + '"');
      /* Direction 2: a lane whose XP stays home must NOT grow a skill label. */
      const same = tiles.map((t) => ((t.querySelector('.at-meta') || {}).textContent || '').trim())
        .find((m) => m && !/Mining XP/.test(m) && /\bXP\b/.test(m));
      if (same) assert(/\d+\s+XP\b/.test(same),
        'a same-skill lane grew an unexpected label — meta reads "' + same + '"');
    } finally {
      restoreG(snap);
      window._actLastRender = { skillId: null, activeKey: null };
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b348 — XARN'S REPORTS #2, #3 AND #4

     All three are SURFACE contracts, so every assertion below reads a rendered
     surface rather than a field. That is this file's own hard-won rule (b342:
     a guard that asserted `G._awayLicence` EXISTS could not tell that the card
     meant to read it had never been built) and it is exactly the shape of #2 —
     the data was always correct, and a stylesheet was eating it.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRun('b348: every combat style SAYS which skills its XP goes to, and no stylesheet may hide it', () => {
    const S = window.COMBAT_STYLES || {};
    const skillNames = Object.keys(S).length;
    assert(skillNames >= 4, 'COMBAT_STYLES must be published — got ' + skillNames + ' weapon families');

    /* (1) THE TABLE IS HONEST. `trains` is an authored abbreviation and `xp` is
       what the engine pays; two copies of one fact. Assert they name the same
       skills, so a new style cannot advertise a route it does not run. */
    const ABBREV = { attack: ['atk', 'attack'], strength: ['str', 'strength'], defense: ['def', 'defen'],
      ranged: ['ranged', 'range'], magic: ['magic'], hitpoints: ['hp', 'hitpoints'] };
    const mismatches = [];
    Object.keys(S).forEach((fam) => Object.entries(S[fam]).forEach(([k, s]) => {
      const claimed = String(s.trains || '').toLowerCase();
      Object.keys(s.xp || {}).forEach((sk) => {
        const forms = ABBREV[sk] || [sk];
        if (!forms.some((f) => claimed.indexOf(f) >= 0)) {
          mismatches.push(fam + '.' + k + ' pays ' + sk + ' XP but its label says "' + s.trains + '"');
        }
      });
      // …and the reverse: no skill named that is never paid.
      Object.entries(ABBREV).forEach(([sk, forms]) => {
        if (!(sk in (s.xp || {})) && forms.some((f) => claimed.indexOf(f) >= 0) && sk !== 'hitpoints') {
          mismatches.push(fam + '.' + k + ' NAMES ' + sk + ' but pays it no XP');
        }
      });
    }));
    assert(mismatches.length === 0, 'a style label disagrees with its XP routing table — ' + mismatches.join(' | '));

    /* (2) THE DERIVED SENTENCE MATCHES THE TABLE. styleXpRouteText walks
       `style.xp`, so it cannot describe a route the engine does not run — but
       it can still be wired to nothing. Grade it. */
    assert(typeof window.styleXpRouteText === 'function', 'styleXpRouteText must be published');
    const solo = window.styleXpRouteText(S.sword.aggressive);
    assert(/all to/i.test(solo) && /strength/i.test(solo),
      'a single-skill style should read "all to Strength", got "' + solo + '"');
    const split = window.styleXpRouteText(S.sword.controlled);
    ['attack', 'strength', 'defen'].forEach((n) => assert(new RegExp(n, 'i').test(split),
      'the three-way split must name ' + n + ', got "' + split + '"'));
    /* Authored order, not sorted — Controlled is 33/33/34 and sorting put
       Defence first purely on a rounding difference. */
    assert(split.toLowerCase().indexOf('attack') < split.toLowerCase().indexOf('defen'),
      'an even split must keep the authored order so it agrees with the "Atk/Str/Def" chip, got "' + split + '"');

    /* (3) THE BUTTON ACTUALLY CARRIES IT. This is the assertion the regression
       needed: the data was always right. */
    if (typeof window.renderStyleSelector === 'function') window.renderStyleSelector();
    const block = document.querySelector('.combat-style-block');
    assert(block, 'the combat style picker did not render');
    const btns = [...block.querySelectorAll('.csb-btn')];
    assert(btns.length >= 3, 'expected the weapon family\'s styles, got ' + btns.length + ' buttons');
    btns.forEach((b) => {
      const tr = b.querySelector('.csb-trains');
      assert(tr && tr.textContent.trim().length > 0,
        'style button "' + b.textContent.trim() + '" carries no .csb-trains — the XP route is unstated');
    });

    /* (4) AND NO STYLESHEET MAY HIDE IT. THE ACTUAL b348 BUG: theme-cozy.css
       carried `#panel-combat .csb-btn small { display:none }` inside the mobile
       media query, with the comment "hide ATTACK/STRENGTH/DEFENSE labels". It
       landed in b110 when this font was 10px, survived b227 raising the type
       floor, and then swallowed b329's swing readout too — so the number that
       answered Xarn's PREVIOUS report was invisible on his phone from the day
       it shipped.
       An in-page test cannot force a media query, so this walks the CSSOM
       instead — including rules inside @media, which is where the offender
       lived. That is the point: it grades the rule wherever it sleeps, not only
       the viewport the suite happens to run at. */
    const offenders = [];
    const walk = (rules, media) => {
      for (const r of rules || []) {
        if (r.type === CSSRule.MEDIA_RULE || r.cssRules) { walk(r.cssRules, media || (r.conditionText || '')); }
        if (!r.selectorText || !r.style) continue;
        const hidesTrains = /\.csb-trains\b/.test(r.selectorText)
          || (/\.csb-btn\b/.test(r.selectorText) && /\bsmall\b/.test(r.selectorText));
        if (hidesTrains && (r.style.display === 'none' || r.style.visibility === 'hidden')) {
          offenders.push(r.selectorText + (media ? ' @media ' + media : ''));
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules, ''); } catch (e) { /* cross-origin sheet — none of ours */ }
    }
    assert(offenders.length === 0,
      'THE b348 BUG: a stylesheet hides the combat style XP label — ' + offenders.join(' | '));
  }),

  () => tryRunAsync('b348: the bag renders the space you PURCHASED, not the space you have filled', async () => {
    const G = window.G;
    assert(typeof window.bankCap === 'function' && typeof window.buyBankSpaceGem === 'function',
      'the bank helpers must exist');
    /* G.bank is NOT in snapshotG, and buying slots is permanent progress — save
       and restore it here exactly as the b269 bank tests do. */
    const saved = { inv: JSON.parse(JSON.stringify(G.inventory || {})), bank: JSON.parse(JSON.stringify(G.bank || {})),
      gems: G.gems, gold: G.gold, cap: G._bankCap, filter: JSON.parse(JSON.stringify(window._invFilter || {})) };
    const prevTab = window.activeTab;
    try {
      window._invFilter = { category: 'all', search: '' };
      /* The fixture must hold at least one WEAPON, because the filtered half of
         this test switches to that lane — and an EMPTY lane renders the "no
         items in this category" message instead of tiles, which would make the
         filtered assertion read 0 and fail for the wrong reason. (Found by
         mutation: an unrelated mutation showed this test red at "0 tiles for 0
         matches".) */
      G.inventory = {}; Object.keys(window.ITEMS).slice(0, 5).forEach((id) => { G.inventory[id] = 1; });
      G.inventory.bronze_sword = 1;
      // Start from "the realm has not said"; the confirm envelope moves the cap.
      G.bank = { goldBuys: 0, gemBuys: 0, grandfather: 0 }; delete G._bankCap;
      window.showTab('inventory');
      await new Promise((r) => setTimeout(r, 60));

      const paint = async () => {
        window._renderInvFancy();
        await new Promise((r) => setTimeout(r, 20));
        const grid = document.querySelector('#panel-inventory .invc-grid');
        assert(grid, 'the bag grid did not render');
        return {
          filled: grid.querySelectorAll('.invc-tile:not(.invc-slot)').length,
          empty: grid.querySelectorAll('.invc-tile.invc-slot:not(.invc-slot-more)').length,
          total: grid.querySelectorAll('.invc-tile').length,
          head: (document.querySelector('#panel-inventory .invc-space') || {}).textContent || '',
        };
      };

      const before = await paint();
      assert(before.total === window.bankCap(),
        'the bag must draw one tile per PURCHASED stack: cap ' + window.bankCap() + ', tiles ' + before.total);
      assert(before.filled === window.bankUsed(), 'filled tiles must equal the stacks held');

      /* THE REPORT, exactly: buy space and the rows must appear NOW, not when
         you next find an item. Measured before the fix: 88 tiles at cap 100, 88
         at cap 160, 88 at cap 200 — the purchase was invisible until the player
         outgrew it. */
      /* ⚠ b515 — THE PURCHASE MOVES TO THE RUNG THAT CAN ACTUALLY BE BOUGHT.
         This test's SUBJECT is the bag renderer; it used a gem buy only as the
         cheapest way to raise `bankCap()`, and b456 kept that working by pinning
         the b353 kill switch off. That position is retired, and the gem rung is
         genuinely unbuyable today — `buyBankSpaceGem` refuses by name because
         there is no gem offer in `gold-ladders.js` (filed in HANDOFFS.md, "the
         GEM PURCHASE VERB"). Pinning a seam that selects nothing would have made
         this test grade the refusal.

         So the cap is raised by the GOLD rung, which is a real, live
         `hr_unlock_buy` gesture — the real function stays in the loop (a stub
         would stop testing that a purchase moves the cap at all) and it is the
         path a player actually has. b269 owns the gem refusal. */
      G.gold = 10_000_000;
      stampBalanceLikeLoad(G);   // armed: buyBankSpaceGold reads gold via canAfford
      await withServerBacked({ state: { gold: 9_000_000,
        bank_cap: window.BANK_SPACE.BASE_CAP + window.BANK_SPACE.gold.slots } }, async (rig) => {
        assert(window.buyBankSpaceGold() === true, 'the bank rung purchase must succeed');
        await rig.drain();
        assert(rig.sent.length === 1 && rig.sent[0].offer === 'bank.0',
          'the bank rung sent ' + JSON.stringify(rig.sent));
      });
      const after = await paint();
      assert(after.total - before.total === window.BANK_SPACE.gold.slots,
        'THE b348 BUG: buying +' + window.BANK_SPACE.gold.slots + ' stacks changed the bag by '
          + (after.total - before.total) + ' tiles — the purchase is invisible until you outgrow it');
      assert(after.filled === before.filled, 'a space purchase must not change what you are holding');

      /* The header states the truth, and keeps stating it — _renderInvSummary()
         used to overwrite this whole node, so the capacity readout survived
         about 50ms after every tab entry. */
      assert(/\b\d+\s*\/\s*\d+\s*slots/.test(after.head),
        'the bag header must state used / cap slots, got "' + after.head + '"');
      window._renderInvSummary();
      const head2 = (document.querySelector('#panel-inventory .invc-space') || {}).textContent || '';
      assert(/\b\d+\s*\/\s*\d+\s*slots/.test(head2),
        'THE b348 BUG: _renderInvSummary erased the slot capacity from the bag header — "' + head2 + '"');
      assert(/gp/.test(head2), 'the summary itself must still be written: "' + head2 + '"');

      /* A FILTERED lane must not claim bag capacity: free space belongs to the
         bag, not to "Weapons". */
      window._invFilter = { category: 'weapons', search: '' };
      const filtered = await paint();
      /* Asserted as an EQUALITY against the container fill, not as "less than
         the cap": free space is `cap - used`, so a lane holding fewer items
         than the bag does still lands under the cap even when it IS deriving
         from capacity — a `< cap` assertion passes on the bug. (Found by
         mutation: forcing every view to the capacity path stayed green.) */
      const MIN_FILL = 88;
      assert(filtered.total === Math.max(MIN_FILL, filtered.filled),
        'a filtered lane must show its matches padded only to the container fill, not derived from the bank cap — '
          + filtered.total + ' tiles for ' + filtered.filled + ' matches (cap ' + window.bankCap() + ')');
    } finally {
      G.inventory = saved.inv; G.bank = saved.bank; G.gems = saved.gems; G.gold = saved.gold;
      restoreBankCap(saved.cap);
      window._invFilter = saved.filter;
      try { window._renderInvFancy(); window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  /* ── regression suite — EQUIP-REQLV-1: THE WIELD GATE IS DATA, NOT A CLIENT ARRAY ──
     31 of 237 equippables carried a `tier` and no `reqLv`: the CLIENT gated them
     from a second copy of the ladder (legacy.js `_TIER_WIELD_LV`), the SERVER read
     only `hr_items.req_lv` (which gen-catalogues mirrors from `reqLv`) and so
     hr_apply §EQUIPMENT refused nobody. A client-only gate is not a gate (§1). That
     array has no index 8, so the six tier-8 uniques — defB to 120, all TRADEABLE —
     were ungated on BOTH sides and a level-1 buyer could wear a Slagheart Platebody
     off the market. Ruling 2026-09-12: reqLv = the tier's shipped rung
     (1/15/30/45/60/75/88/88, tier 8 SHARES 88), reqSkill = the skill the power
     serves. MUTATION: delete the reqSkill/reqLv lines from the b215 backfill in
     src/data/items.js (17 rows go red by name), or move any row below off its rung. */
  () => tryRun('EQUIP-REQLV-1: every tiered equippable carries its wield gate as DATA the realm can read; cosmetics carry none', () => {
    const I = window.ITEMS, S = window.SKILLS_DEF || {}, EQ = { weapon: 1, armor: 1, jewelry: 1, ammo: 1 };
    const LADDER = { 1: 1, 2: 15, 3: 30, 4: 45, 5: 60, 6: 75, 7: 88, 8: 88 };
    const tiered = Object.keys(I).filter((id) => EQ[I[id].type] && I[id].tier != null);
    assert(tiered.length > 200, 'the equippable corpus must be the real one, got ' + tiered.length);
    const ungated = tiered.filter((id) => typeof I[id].reqLv !== 'number' || !I[id].reqSkill);
    assert(ungated.length === 0, 'THE BUG: a tiered equippable with no reqSkill/reqLv is NULL in hr_items, '
      + 'so the realm refuses nobody and only the client pretends to gate it — ' + ungated.join(' '));
    tiered.forEach((id) => {
      assert(S[I[id].reqSkill], id + ': reqSkill "' + I[id].reqSkill + '" is not a skill');
      assert(I[id].reqLv >= 1 && I[id].reqLv <= LADDER[8],
        id + ': reqLv ' + I[id].reqLv + ' is outside the 1..' + LADDER[8] + ' ladder');
    });
    ('abyssal_greaves defense 88|apprentice_staff magic 1|bone_earrings prayer 45|'   /* the 41 ruled rows, id · skill · level, literal so a regeneration or a merge cannot move one off its rung. The last SEVEN carry NO `tier`, so they are absent from `tiered` above and this list is all that holds them: ungated on BOTH sides (gearWieldReq null AND hr_items.req_lv NULL), four of them TRADEABLE */
      + 'alpha_cloak defense 30|gold_ring defense 30|gold_amulet defense 30|fox_companion defense 15|'
      + 'copper_ring defense 1|hunter_necklace defense 1|traveler_cape defense 1|'
      + 'bronze_belt defense 1|bronze_sword attack 1|captains_ribblade attack 30|'
      + 'chief_blade attack 15|choirbone_gauntlets defense 88|copper_studs defense 1|'
      + 'frost_locket defense 45|heartwood_cape defense 75|hunters_torc defense 30|'
      + 'iron_arrows ranged 1|iron_helm defense 15|iron_platebody defense 15|iron_sword attack 15|'
      + 'iron_warhammer attack 15|leather_boots defense 1|leather_gloves defense 1|longbow ranged 15|'
      + 'oak_staff magic 15|pathfinder_studs defense 1|regent_helm defense 88|rune_sword attack 60|'
      + 'shortbow ranged 1|slagheart_platebody defense 88|steel_helm defense 30|'
      + 'steel_platebody defense 30|steel_sword attack 30|stone_maul attack 1|tally_ring defense 1|'
      + 'unlit_earrings defense 75|warden_girdle defense 88|wyrmgilt_mantle defense 88'
    ).split('|').forEach((row) => {
      const p = row.split(' '), it = I[p[0]] || {};
      assert(it.reqSkill === p[1] && it.reqLv === Number(p[2]), p[0] + ' must gate on ' + p[1] + ' Lv ' + p[2]
        + ', got ' + it.reqSkill + ' Lv ' + it.reqLv);
    });
    /* A cosmetic is EARNED, not out-levelled — no tier and no gate, on both sides. */
    ['bestiary_cloak', 'hearthstone_signet'].forEach((id) => {
      const it = I[id] || {};
      assert(it.tier == null && it.reqSkill == null && it.reqLv == null && window.gearWieldReq(it) == null,
        id + ' is a cosmetic and must stay ungated, got ' + JSON.stringify(window.gearWieldReq(it)));
    });
    assert(JSON.stringify(window.gearWieldReq(I.fox_companion)) === '{"skill":"defense","lv":15}',   /* `companion` is a TYPE the authority returned null for, so the fox carried a gate hr_apply enforced and the UI never painted. reqLv 1 still yields NO gate on purpose (`lv<=1`) — the data form of "belongs to Defence", which keeps hr_items.req_lv non-NULL across the slot */
      'the fox must paint Defence 15 — `companion` has to be a gated type or the server refuses a wield '
        + 'the player was never warned about (got ' + JSON.stringify(window.gearWieldReq(I.fox_companion)) + ')');
    ['copper_ring', 'hunter_necklace', 'traveler_cape'].forEach((id) => {
      assert(I[id].reqSkill === 'defense' && I[id].reqLv === 1 && window.gearWieldReq(I[id]) == null,
        id + ': reqLv 1 must restrict nobody while still keeping hr_items.req_lv non-NULL');
    });
    assert(JSON.stringify(window.gearWieldReq(I.slagheart_platebody)) === '{"skill":"defense","lv":88}',
      'the tier-8 uniques must gate from their OWN fields — `_TIER_WIELD_LV` has no index 8, '
        + 'so the array fallback yields no gate at all (got ' + JSON.stringify(window.gearWieldReq(I.slagheart_platebody)) + ')');
  }),

  () => tryRunAsync('b348: every surface that offers gear states the level needed to WEAR it, through the one authority', async () => {
    const G = window.G;
    assert(typeof window.gearWieldReq === 'function' && typeof window.canWield === 'function',
      'the wield-gate seam must exist');
    /* The probe is `steel_platebody`. Until b542 it carried NO `reqSkill`/`reqLv`
       and its gate came from `tier` alone — which is exactly why the item modal
       showed nothing — so this test asserted "the probe has no raw fields" as its
       precondition. EQUIP-REQLV-1 (above) ended that class, the precondition is now
       false for EVERY equippable, and it is dropped. The surfaces below are still
       read against the AUTHORITY, never the raw field, so one that re-derives its
       own number still fails here. */
    const probe = 'steel_platebody';
    const it = window.ITEMS[probe];
    assert(it, 'the probe item must exist');
    const req = window.gearWieldReq(it);
    assert(req && req.skill === 'defense' && req.lv > 0,
      'the authority must derive a defence gate for ' + probe + ', got ' + JSON.stringify(req));

    const saved = { inv: JSON.parse(JSON.stringify(G.inventory || {})), skills: JSON.parse(JSON.stringify(G.skills || {})) };
    const prevTab = window.activeTab;
    try {
      G.inventory[probe] = 1;

      /* (1) HOVER TOOLTIP — b341 put this on the shop row; the tooltip a player
         uses to compare gear they already own never said it. */
      const tipHost = document.getElementById('item-tooltip');
      assert(tipHost, 'the item tooltip host must exist');
      const tile = document.createElement('div');
      tile.className = 'invc-tile'; tile.setAttribute('data-item-id', probe);
      document.body.appendChild(tile);
      try {
        tile.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 60));
        const reqEl = tipHost.querySelector('.ttl-req');
        assert(reqEl, 'the hover tooltip states no wear requirement for ' + probe);
        assert(reqEl.textContent.indexOf(String(req.lv)) >= 0 && /defen/i.test(reqEl.textContent),
          'the tooltip requirement must name the skill and the level, got "' + reqEl.textContent + '"');
      } finally { tile.remove(); }

      /* (2) THE ITEM DETAIL MODAL — the mobile equivalent of the hover tip. */
      window.openInvDetail(probe);
      await new Promise((r) => setTimeout(r, 60));
      const modal = document.getElementById('inv-detail-overlay');
      const modalText = (modal ? modal.textContent : '').replace(/\s+/g, ' ');
      assert(/to wear/i.test(modalText) && modalText.indexOf('' + req.lv) >= 0,
        'the item detail modal states no wear requirement for ' + probe + ' — "' + modalText.slice(0, 200) + '"');
      if (typeof window.closeInvDetail === 'function') window.closeInvDetail();

      /* (3) THE CRAFTING TILE — "what def requirements we need to wear those
         too". The craft gate and the wear gate are different numbers on
         different skills (Smithing 40 to forge, Defence 30 to wear). */
      const rec = window.ARTISAN_RECIPES.smithing.find((r) => r.output === probe);
      assert(rec, 'no smithing recipe produces ' + probe);
      assert(typeof window.hrWearLineHtml === 'function', 'the shared wear-line helper must be published');
      const line = window.hrWearLineHtml(probe);
      assert(/at-wear/.test(line) && line.indexOf('' + req.lv) >= 0,
        'the wear line does not state the requirement: "' + line + '"');
      assert(window.hrWearLineHtml('normal_log') === '',
        'a non-wearable output must produce no wear line');

      // Painted, through whichever tile builder is actually wired.
      G.skills.smithing = 1e7;
      window._actLastRender = { skillId: null, activeKey: null };
      window.showTab('skills');
      window.openSkillDetail('smithing');
      await new Promise((r) => setTimeout(r, 80));
      if (typeof window.setArtisanCategory === 'function') window.setArtisanCategory('smithing', 'armour');
      await new Promise((r) => setTimeout(r, 80));
      const plate = [...document.querySelectorAll('#skill-detail .act-tile')]
        .find((t) => t.getAttribute('data-prod') === probe);
      assert(plate, 'the ' + probe + ' recipe tile did not render on the Armour lane');
      const wearEl = plate.querySelector('.at-wear');
      assert(wearEl && wearEl.textContent.indexOf('' + req.lv) >= 0,
        'the crafting tile does not say what you need to WEAR the output — "' + plate.innerText.replace(/\s+/g, ' ') + '"');

      /* (4) AND THE ESM TWIN, which paints nothing today and therefore drifts
         (b345's lesson). Graded through its published builder. */
      const AG = window.HearthriseActivitiesGrid;
      assert(AG && typeof AG.__tileForArtisan === 'function', 'the activities-grid test seam is gone');
      assert(/at-wear/.test(AG.__tileForArtisan(rec, 'smithing')),
        'the activities-grid TWIN does not carry the wear line — the two tile builders have drifted');
    } finally {
      G.inventory = saved.inv; G.skills = saved.skills;
      window._actLastRender = { skillId: null, activeKey: null };
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),


  /* ══════════════════════════════════════════════════════════════════════
     b349 — THE PERMANENT PERK CHANNEL, from the BROWSER side.

     tests/perk-channel.mjs proves the SERVER half against a real PostgreSQL:
     an unlock row reaches burnChance with the right magnitude. It cannot
     prove the CLIENT half, because `getBonus` is a classic-script function
     inside a seven-layer monkey-patch chain that only exists in a page.

     So these five drive the REAL `window.getBonus` and the REAL
     `window.clientPerkState`. That distinction is the b339 lesson: an
     extraction can be perfect and the CALLER can still pass a literal, and
     every test of the extracted half passes anyway.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRun('B349-1: the real getBonus reads the room rung through core — noBurn, rung by rung', () => {
    const snap = snapshotG();
    /* PIN THE CALENDAR TO A QUIET SEASON FIRST.
       This test measures what a ROOM RUNG pays, but `getBonus` is additively
       wrapped by world-events.js, so an active blessing lands in the same
       number. That made the assertions silently date-dependent: on a `feast_day`
       (`+0.04 cookSpeed`) the Kitchen-5 row reads 0.14 instead of 0.10, and on a
       `steady_fire` (`+0.25 noBurn`) EVERY noBurn row goes red — two of the
       eleven daily events, so this was a ~1-in-6 chance of a red suite that had
       nothing to do with the code under test. `QUIET` exists in world-events.js
       for exactly this ("the 'no calendar' control every gate test needs, so an
       assertion never depends on today's date"); this test simply never took it.
       Caught on 2026-08-16 when the daily rotated into feast_day mid-session:
       the same tree ran green three times, then red three times, with no edit in
       between — and b363 reproduced it identically, which is what proved it was
       the calendar and not the change under review. */
    const WE = window.HearthriseWorldEvents;
    if (WE && typeof WE._force === 'function') WE._force({ daily: WE.QUIET, weekly: WE.QUIET });
    try {
      /* MEASURED EXPECTATIONS, not restated from the table under test:
         src/core/artisan.js BURN_BASE is 0.25 and the Kitchen ladder is
         13/19/25/25/25, so a cook AT the required level burns
         0.25 / 0.12 / 0.06 / 0.00 / 0.00 / 0.00.
         MUTATION: point getBonus's delegation at a stale table, or drop the
         `bx` merge from tools/gen-perks.mjs → every row below goes RED. */
      const EXPECT = [
        [0, 0, 0.25], [1, 0.13, 0.12], [2, 0.19, 0.06], [3, 0.25, 0.00], [5, 0.25, 0.00],
      ];
      const A = window.HearthriseCore.artisan;
      for (const [rung, noBurn, burn] of EXPECT) {
        G.rooms = rung > 0 ? { kitchen: rung } : {};
        /* b456: `rooms` is server-of-record, so getBonus resolves the rung through
           roomsOf. A raw `G.rooms = …` is unvouched and reads as the fail-closed
           EMPTY map, which would have made all five rows measure rung 0 and the
           whole table pass-by-accident on row 1 alone. Stamped through the real
           hr_load path so the rung genuinely arrives from a server envelope. */
        stampRecordLikeLoad(G);
        assert(Math.abs(window.getBonus('noBurn') - noBurn) < 1e-9,
          'Kitchen ' + rung + ' gives noBurn ' + window.getBonus('noBurn') + ', expected ' + noBurn
          + ' — the client and the accrual engine now read ONE table, so this is both sides');
        const got = A.burnChance({ req: 10 }, 10, window.getBonus('noBurn'));
        assert(Math.abs(got - burn) < 1e-9,
          'Kitchen ' + rung + ' burns at ' + got + ', expected ' + burn);
      }
      /* The other headline key off the same rung, so a delegation that only
         forwarded `bx` (or only `bk`) cannot pass. */
      /* b364 — DELTA, not absolute: getBonus is a seven-layer ADDITIVE chain and
         earlier tests may lawfully leave a wrapper layer's module state behind
         (snapshotG only restores G). This test owns the rung-0→rung-5 DELTA. */
      G.rooms = {};
      stampRecordLikeLoad(G);
      const base = window.getBonus('cookSpeed');
      const baseY = window.getBonus('yield_cooking');
      G.rooms = { kitchen: 5 };
      stampRecordLikeLoad(G);
      assert(Math.abs((window.getBonus('cookSpeed') - base) - 0.10) < 1e-9,
        'Kitchen 5 cookSpeed is ' + window.getBonus('cookSpeed') + ', expected 0.10 — the rung\'s bk '
        + 'half is not reaching getBonus');
      assert(Math.abs((window.getBonus('yield_cooking') - baseY) - 0.08) < 1e-9,
        'Kitchen 5 adds yield_cooking ' + (window.getBonus('yield_cooking') - baseY) + ', expected +0.08');
    } finally {
      restoreG(snap);
      // Hand the calendar back to the real date for every test after this one.
      if (WE && typeof WE._force === 'function') WE._force(null);
    }
  }),
  /* ══════════════════════════════════════════════════════════════════════
     b349 — THE CALL THAT WAS MADE BEFORE THE CLIENT HAD THE RIGHT TO MAKE IT

     MEASURED, not suspected. 24h of postgres_logs: 5,217 rows of
     sql_state_code 42501 as `authenticator` — 19% of every request the project
     served — and 3,249 of them were hr_server_now(). That RPC has exactly ONE
     call site (muster.js syncClock, once per boot), so the count is one refused
     call PER PAGE LOAD, from every player, signed in or not.

     THE CAUSE IS A RACE, AND IT ALWAYS LOSES. muster.js boots at
     DOMContentLoaded+420ms. auth.js cannot publish a session until a CDN
     import() of supabase-js resolves. Instrumented in real Chromium over four
     runs on a warm LOCAL server, with a valid cached session in place: the
     session landed 94ms / 159ms / 358ms / 1,040ms AFTER the RPC had already
     gone out, and it went out anonymous every time — because every transport
     helper in this repo ends its Authorization header with `|| c.anonKey`,
     which does not mean "call this anonymously", it means "send it without the
     standing to send it". Postgres refused each one and the client shrugged.

     Nothing was exposed and no player was broken. What it broke was the error
     dashboard: at 81% success, a real outage is invisible in the noise.

     THE SHAPE OF THE FIX, and what these three tests hold down:
       R1  the DECISION  — HearthriseRpc.mayCall(), inverted so a NEW RPC is
                           protected by nobody remembering anything.
       R2  the TIMING    — HearthriseGate.whenSignedIn(): holds, then runs, and
                           never runs at all if no session ever arrives.
       R3  the CALLER    — muster.js's own rpc(), driven for real. b339's rule:
                           a test that only proves the seam correct is the test
                           that let the caller go on being wrong.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRun('B349-R1: the client knows which RPCs need a session, and an unknown one DOES', () => {
    const R = window.HearthriseRpc;
    assert(R && typeof R.mayCall === 'function' && typeof R.needsSession === 'function',
      'HearthriseRpc.mayCall/needsSession are gone — the one shared answer to "may this call go out" '
      + 'is what stops six transport helpers each inventing their own');

    /* FAIL CLOSED. This is the whole design: the maintained list is the SHORT
       one (what may go out anonymously), so an RPC nobody has told this module
       about is protected on the day it is written. */
    assert(R.needsSession('hr_server_now') === true, 'hr_server_now must need a session');
    assert(R.needsSession('an_rpc_written_next_year') === true,
      'an unknown RPC was judged safe to call anonymously — the predicate has been inverted back to a '
      + 'denylist, and every RPC added after this line is unguarded until someone remembers it');
    assert(R.mayCall('hr_server_now', false) === false, 'a session-less authenticated call was permitted');
    assert(R.mayCall('hr_server_now', true) === true, 'a signed-in authenticated call was refused');

    /* Anything that is not literally `true` is "no session". A caller that has
       not looked yet hands over undefined, and that caller is the bug. */
    [undefined, null, 0, '', 'yes', {}, []].forEach((v) => {
      assert(R.mayCall('hr_server_now', v) === false,
        'mayCall accepted a truthy non-boolean (' + JSON.stringify(v) + ') as proof of a session');
    });

    /* THE CONTROL. A "fix" that refuses everything would silently delete the
       public honour roll — leaderboards.js is allowed to read it anonymously
       when a player's token has expired (b222), and production grants it to
       anon (tests/rpc-resolution.baseline.json: the sole 200/OK entry). */
    assert(R.needsSession('hr_leaderboard') === false && R.mayCall('hr_leaderboard', false) === true,
      'the public leaderboard now needs a session — an expired token would blank the whole board, '
      + 'which is the b222 bug back again');
  }),

  () => tryRunAsync('B349-R2: whenSignedIn() holds without a session, runs with one, and never fires signed-out', async () => {
    const gate = window.HearthriseGate;
    assert(gate && typeof gate.whenSignedIn === 'function',
      'HearthriseGate.whenSignedIn is gone — this is the seam that knows the difference between '
      + '"signed out" and "auth has not finished looking yet", and without it every caller re-derives it');
    assert(typeof gate._signedInPending === 'function' && typeof gate._drainSignedIn === 'function'
      && typeof gate._signedInWaiting === 'function',
      'the whenSignedIn test seams are gone — a test that could only observe "it did not run" would '
      + 'pass against an implementation that threw the callback away');

    /* ── THE CALLER, by name. The suite boots with no session, so muster.js's
       clock+pledge chain must still be SITTING here waiting. Counting alone
       would pass the day some other module started deferring and muster
       stopped, so the label is the assertion.
       MUTATION: call syncClock() directly from muster's boot() again → RED. */
    assert(gate._signedInWaiting().indexOf('muster:clock+pledge') !== -1,
      'muster.js is not holding its clock sync behind a session — it is back to firing hr_server_now '
      + '420ms after DOMContentLoaded, which is before auth.js can publish a token, which is 3,196 '
      + 'refused calls a day. Waiting: [' + gate._signedInWaiting().join(', ') + ']');

    const Auth = window.HearthriseAuth;
    /* account-gate reads HearthriseAuth.isSignedIn() — not getSession() — so
       this is the function the seam actually consults. Stubbing the other one
       would leave the test measuring a path the gate never takes. */
    assert(Auth && typeof Auth.isSignedIn === 'function', 'auth.js is not loaded');
    const realIsSignedIn = Auth.isSignedIn;
    const TAG = 'test:b349';
    const before = gate._signedInPending();
    let ran = 0;
    try {
      /* ── SIGNED OUT: held, not dropped, not run. */
      Auth.isSignedIn = () => false;
      gate.whenSignedIn(() => { ran++; }, TAG);
      assert(ran === 0, 'whenSignedIn ran its callback with no session — this is the 3,196-a-day bug itself');
      assert(gate._signedInPending() === before + 1,
        'the callback was not queued either; it was thrown away, so a player who signs in mid-session '
        + 'never gets the work that was waiting for them');

      /* A drain while STILL signed out must not fire it. The watcher ticks
         every 2s for the whole life of a walled page — if a drain could fire
         without a session, the fix would leak once every two seconds instead
         of once per boot. */
      gate._drainSignedIn(TAG);
      assert(ran === 0 && gate._signedInPending() === before + 1,
        'a drain fired the callback while signed out — worse than the original bug, which at least '
        + 'only fired once');

      /* ── SIGNED IN: the held work runs, exactly once. Only this test's own
         job is drained; muster's stays parked, so re-running the suite in the
         same page grades the same thing it graded the first time. */
      Auth.isSignedIn = () => true;
      gate._drainSignedIn(TAG);
      assert(ran === 1, 'the held callback did not run once a session appeared (ran ' + ran + 'x)');
      gate._drainSignedIn(TAG);
      assert(ran === 1, 'the callback ran again on a second drain — a boot probe would repeat forever');

      /* ── ALREADY SIGNED IN: runs immediately, no wait. */
      let now = 0;
      gate.whenSignedIn(() => { now++; }, TAG);
      assert(now === 1, 'whenSignedIn deferred work that could have run immediately — a signed-in '
        + 'player would wait up to a watcher tick for something with no reason to wait');
    } finally {
      Auth.isSignedIn = realIsSignedIn;
      try { gate._drainSignedIn(TAG); } catch (e) {}
    }
  }),

  () => tryRunAsync('B349-R3: muster\'s OWN transport refuses to send an authenticated RPC with no session', async () => {
    const M = window.HearthriseMuster;
    assert(M && typeof M.syncClock === 'function', 'muster.js is not loaded');
    const Auth = window.HearthriseAuth;
    const realGetSession = Auth.getSession;
    const realFetch = window.fetch;
    const sent = [];
    try {
      window.fetch = function (u, o) {
        const url = typeof u === 'string' ? u : (u && u.url) || '';
        if (url.indexOf('/rest/v1/rpc/') !== -1) {
          const h = (o && o.headers) || {};
          sent.push({ url: url, auth: h.Authorization || h.authorization || '' });
          return Promise.resolve(new Response(JSON.stringify({ ok: true, epoch_ms: Date.now() }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return realFetch.apply(this, arguments);
      };

      /* ── THE BUG, driven through the real caller. MUTATION: delete the
         mayCall() refusal from muster.js's rpc() → this goes RED, because the
         request is exactly what production logged 3,196 times a day. */
      Auth.getSession = () => null;
      await M.syncClock();
      assert(sent.length === 0,
        'THE b349 BUG: muster.js sent ' + sent.length + ' RPC(s) with no session — '
        + sent.map((s) => s.url.split('/rpc/')[1]).join(', ') + '. Postgres answers 42501 and the '
        + 'client cannot tell that apart from a healthy call it forgot to read');

      /* THE CONTROL, and it is the whole test. "Zero calls" passes trivially
         against a broken fetch stub, a renamed function, or a syncClock that
         was deleted. The SAME stub must record a real, correctly-signed call
         the moment a session exists — otherwise the assertion above is
         measuring nothing. */
      Auth.getSession = () => ({ access_token: 'real-token-abc', user: { id: 'u1' } });
      await M.syncClock();
      // Count is the contract; NAMES are the diagnostic — "2 call(s)" alone cannot say whose.
      const seen = sent.map((c) => c.url.split('/rpc/')[1] || c.url).join(' + ');
      assert(sent.length === 1 && sent[0].url.indexOf('/rpc/hr_server_now') !== -1,
        'with a session the clock did NOT sync (' + sent.length + ' call(s): ' + seen + ') — the '
        + 'guard above is passing against a dead path and proves nothing');
      assert(sent[0].auth === 'Bearer real-token-abc',
        'the clock went out signed with something other than the player\'s token ("' + sent[0].auth
        + '") — the `|| anonKey` fallback in headers() is still downgrading the call');
    } finally {
      window.fetch = realFetch;
      Auth.getSession = realGetSession;
      try { M._setSkew(0); } catch (e) {}
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b354 — AUTO-EAT IS SOLD WHERE THE MARKS ARE.

     Tyler ruled (2026-08-09) that auto-eat costs 100 Bounty Marks. It was
     reachable only from the Shop tab's trait strip — a screen a player who
     spends marks never opens — so the currency and the only thing worth
     buying with it lived on two different tabs.

     The interesting risk in adding it is NOT the row. It is that a second
     storefront becomes a second OWNER: a bounty row that set its own upgrades
     key would make `hasTrait('auto_eat')` and `upgrades.autoEat` two answers
     to one question, and a row that charged its own marks before delegating
     would take 200 for a 100-mark trait. Both are asserted below, in the
     direction that fails if the delegation is ever unpicked.

     The panel's offer list is COMPOSED (`bountyShopOffers()`) — the board's own
     upgrades plus everything in the game priced in marks — rather than a second
     authored row, so there is exactly one offer id for one purchase and the
     generated server catalogue is untouched.
     ══════════════════════════════════════════════════════════════════════ */
  () => tryRunAsync('b354: the Bounty Shop sells Auto-Eat at 100 Marks, through the ONE writer of the trait', async () => {
    assert(typeof window.bountyShopOffers === 'function',
      'bountyShopOffers() is not published — this test must read the REAL offer list the panel '
      + 'renders from, never a copy of it');
    const SHOP = window.bountyShopOffers();
    assert(Array.isArray(SHOP) && SHOP.length >= 6, 'the composed offer list is ' + SHOP.length + ' long');

    /* (1) THE ROW, in the real list, at the ruled price. */
    const row = SHOP.filter((r) => r.trait === 'auto_eat')[0];
    assert(row, 'the Bounty Shop has no auto-eat offer — a player with 100 marks has nothing to '
      + 'spend them on that they came for');
    /* b459: the designer re-ruled the 2026-08-09 price — Auto-Eat I is the
       15-Mark entry tier (auto_eat_2 carries the old 100). The contract is now
       "the row charges the trait's OWN price", derived, not a literal. */
    assert(row.cost === ((window.TRAITS && window.TRAITS.auto_eat && window.TRAITS.auto_eat.cost) || 15),
      'the Auto-Eat row must charge TRAITS.auto_eat.cost, the row says ' + row.cost);
    assert(!row.flag, 'a delegating row must not also carry a `flag` — that is the second owner');
    assert(!row.repeatable, 'a permanent trait is not a repeatable purchase');
    assert(window.BOUNTY_SHOP.every((r) => !r.trait),
      'the marks-priced trait was COPIED into BOUNTY_SHOP as well — that is a second offer id for '
      + 'one purchase, and it is what the composition exists to avoid');

    /* (2) THE PRICE HAS ONE SOURCE — the row IS the trait's own price, so the
       shop cannot advertise 100 and charge 250. Asserted against TRAITS
       directly, because the composition is exactly what would hide a drift. */
    const T = (window.TRAITS || {}).auto_eat;
    assert(T && T.currency === 'marks' && T.cost === row.cost,
      'TRAITS.auto_eat charges ' + (T && T.cost) + ' ' + (T && T.currency)
      + ' while the Bounty Shop advertises ' + row.cost + ' marks');
    /* THE RULE, not the row: every marks-priced trait reaches this screen. A
       future one that did not would repeat the whole bug. */
    Object.keys(window.TRAITS).forEach((id) => {
      if (window.TRAITS[id].currency !== 'marks') return;
      assert(SHOP.some((r) => r.trait === id),
        'TRAITS.' + id + ' is priced in Bounty Marks but is not sold on the Bounty Shop');
    });

    /* (3) THE GENERATED CATALOGUE the server reads is UNCHANGED by this: one
       purchase, one offer id, priced in marks, granting the trait unlock. */
    const S = await import('../../data/shops.js?v=554');
    const ids = S.SHOP_OFFERS.filter((o) => o.grant.some((g) => g.id === 'trait:auto_eat')).map((o) => o.id);
    assert(ids.length === 1 && ids[0] === 'trait.auto_eat',
      'trait:auto_eat is granted by ' + ids.length + ' offer(s) (' + ids.join(', ') + ') — a second '
      + 'storefront must not become a second offer id the server would have to bookkeep separately');
    const off = S.SHOP_OFFERS.filter((o) => o.id === 'trait.auto_eat')[0];
    assert(off.cost.length === 1 && off.cost[0].kind === 'currency'
      && off.cost[0].id === 'marks' && off.cost[0].amount === row.cost,
      'trait.auto_eat is priced ' + JSON.stringify(off.cost) + ' in the catalogue, not '
      + row.cost + ' marks');

    /* (4) THE PLAYER'S PATH, driven end to end.

       ⚠ b456 — DRIVEN WITH MARKS IN THE CLIENT-OWNED POSITION, and the reason is
       a documented live gap rather than a harness gap. `spendMarks`/`buyTrait`
       have NO server spend verb (only reroll/abandon moved to hr_bounty_spend), so
       under the marks arm they FAIL CLOSED — legacy.js refuses with "That upgrade
       is unavailable right now". That refusal is CORRECT (a raw client debit on a
       server-owned balance would be reconciled away while the trait stayed
       granted) and it is asserted by the b227 buyTrait test. It also means a
       100-mark shop item cannot currently be bought by anyone — filed for the
       Game Designer / Systems Engineer as a post-arm follow-up (build the
       hr_bounty_spend sibling).
       What THIS test is about is the shop's own contract — one offer id, one
       price, one owner of the trait flag, charged exactly once — which is the
       arithmetic the server verb will have to reproduce. So it runs where that
       arithmetic executes. Sections (1)-(3) above are pure data and are asserted
       at the shipping default. */
    const snap = snapshotG();
    const _R = window.HearthriseRecord;
    try {
      if (_R && typeof _R.__setMarksRecordArm === 'function') _R.__setMarksRecordArm(false);
      window.G.traits = {};
      window.ensureBountyState && window.ensureBountyState();
      /* b459: the price is DATA (TRAITS.auto_eat.cost — now the 15-Mark tier I),
         so every phase derives from it instead of hardcoding the old 100. */
      const _aeC = (window.TRAITS && window.TRAITS.auto_eat && window.TRAITS.auto_eat.cost) || 15;
      window.G.marks = _aeC - 5;   // top-level record-field home; too poor by 5
      window.showTab('bounty');
      window.renderBountyTab();

      const node = document.querySelector('#bounty-shop-body .bounty-shop-row[data-offer="' + row.id + '"]');
      assert(node, 'the Auto-Eat row is not on the Bounty Shop panel');
      assert(/Auto-Eat/.test(node.textContent), 'the row must name what it sells');
      assert(new RegExp(String(_aeC)).test(node.querySelector('.price').textContent),
        'the row must PRINT the price (' + _aeC + '), got "' + node.querySelector('.price').textContent + '"');
      assert(node.querySelector('button').disabled,
        'below the price the Buy button must be disabled — a control that cannot act must not look like it can');

      // Too poor: nothing is taken and nothing is granted.
      window.spendMarks(row.id);
      assert(window.G.marks === _aeC - 5,
        'a refused purchase took marks anyway (' + window.G.marks + ')');
      assert(!window.hasTrait('auto_eat'), 'a refused purchase granted the trait');

      // Affordable: charged EXACTLY once, and by the trait's own price.
      window.G.marks = _aeC + 37;
      window.spendMarks(row.id);
      assert(window.hasTrait('auto_eat'), 'buying auto-eat in the Bounty Shop did not unlock it');
      assert(window.G.marks === 37,
        'the purchase debited ' + (_aeC + 37 - window.G.marks) + ' marks, not ' + _aeC + ' — the shop '
        + 'row is charging on top of buyTrait()');
      assert(!(window.G.bountyHunter.upgrades || {}).auto_eat
        && !(window.G.bountyHunter.upgrades || {}).autoEat,
        'the bounty shop wrote its own ownership key — hasTrait() and upgrades are now two answers');

      // …and the panel says so without being told twice.
      window.renderBountyTab();
      const after = document.querySelector('#bounty-shop-body .bounty-shop-row[data-offer="' + row.id + '"]');
      assert(/Owned/.test(after.querySelector('button').textContent),
        'an owned trait must read Owned in the Bounty Shop, got "'
        + after.querySelector('button').textContent + '"');
      assert(after.querySelector('button').disabled, 'an owned trait must not be buyable again');

      // Buying it twice must not cost a second 100.
      window.spendMarks(row.id);
      assert(window.G.marks === 37, 'a second purchase of an owned trait charged again');
    } finally {
      if (_R && typeof _R.__setMarksRecordArm === 'function') _R.__setMarksRecordArm(null);
      restoreG(snap);
    }
  }),
];
