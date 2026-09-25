// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/property-and-unlocks.js — the House ladder, server-confirmed unlocks, bank rungs and the gem-spend battery.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 49 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, stampBalanceLikeLoad, stampRecordLikeLoad, withServerBacked, withRoomServer, awayArtisanSpan, snapshotG, restoreG, restoreGAndRecord, bankEnv, on, snapshot } from './_harness.js?v=553';

export default [

  /* ══════════════════════════════════════════════════════════════════════
     b227 — THE HOUSE IS A PLACE (homestead-deepening.md §3, §5, §6)

     Two Tyler reports, one wave:
       "It let me just keep building the forge."
       "No good indication that I own the forge on my house screen."

     The first was a MISSING REPAINT, not a missing guard — so the regression
     test that matters most is the one that reads the rendered DOM back after a
     build. A test that only asserted `G.rooms.forge === 1` was green through
     the entire bug, which is exactly the b224 lesson (every quest test asserted
     the panel opened; none asserted a number moved).
     ══════════════════════════════════════════════════════════════════════ */

  // CLIENT-AUTHORITATIVE: upgradeRoom is now WIRED to unlock_buy (b3xx). Under the
  // shipping switch a build is a PREDICTION the server envelope reconciles, so the
  // exact local charge is only deterministic with the switch off. The subject of
  // this test — the House REPAINTING after a completed build — is switch-agnostic;
  // the charge assertion needs the local-payment path. The server-authoritative
  // path (offer-only wire, prediction lifecycle) is covered by the 'unlock_buy
  // client transport' test above and by tests/unlock-buy.mjs.
  // gold-arm: gold is ARMED, so the affordability READ still needs the balance
  // stamped after it is set (stampBalanceLikeLoad below) even in the switch-OFF
  // position — canAfford fail-closes on an unstamped balance.
  () => tryRunAsync('b227 regression: building a room repaints the House (the double-build report)', async () => {
    // THE BUG. refreshAll() renders profile/inventory/skills/combat/shop and
    // has never rendered the House; nothing else repainted it after a mutation
    // either. So the row kept its old level, its old price and its "Build"
    // label after a real purchase, and clicking again bought the NEXT rung at
    // the NEXT price with still no acknowledgement. Three real buys, zero
    // feedback, then a silent dead button.
    if (typeof window.upgradeRoom !== 'function' || typeof window.renderHouse !== 'function') return;
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 2 };                 // farmstead: the Forge is legal
      window.G.rooms = {};
      window.G.gold = 500000;
      stampBalanceLikeLoad(window.G);   // armed: canPayCost reads gold via the balance accessor
      window.G.inventory = Object.assign({}, window.G.inventory, { copper_ore: 500, iron_ore: 500 });
      window.showTab('house');
      if (typeof window.setHouseTab === 'function') window.setHouseTab('rooms');
      window.renderHouse();

      const panel = document.getElementById('house-panel');
      assert(panel, 'house-panel missing');
      assert(!/Lv 1/.test(panel.textContent), 'precondition: the Forge should not read as owned yet');

      /* b515 — THE BUILD IS THE SERVER'S, so the fixture supplies a server.
         `upgradeRoom` sends `room.forge.1` and advances NOTHING locally (the
         rooms record is armed); the rung and the balance both come back on the
         envelope. The gold the server is left holding is deliberately NOT
         `goldBefore - 800` — it is a number the client could not have computed
         — so "the build charged" cannot pass by the client having debited. */
      const goldBefore = window.G.gold;
      const SERVER_GOLD = goldBefore - 800 - 7;      // the client's guess, minus a number only the server knows
      await withRoomServer({ forge: 1 }, SERVER_GOLD, async (rig) => {
        window.upgradeRoom('forge');
        await rig.drain();

        assert(rig.sent.length === 1 && rig.sent[0].verb === 'unlock_buy',
          'the build sent ' + JSON.stringify(rig.sent) + ' — it must be exactly one unlock_buy intent');
        assert(rig.sent[0].offer === 'room.forge.1',
          'the build named the wrong offer: ' + rig.sent[0].offer);
        for (const forbidden of ['gold', 'price', 'cost', 'amount']) {
          assert(!(forbidden in rig.sent[0]),
            'the build body carries a `' + forbidden + '` field — the server reads the price off '
            + 'hr_unlock_offers, and a client that can name one can name a cheaper one');
        }
        assert(window.G.rooms.forge === 1,
          'the build did not land: the rung arrives as a `progress` row on the answer, and '
          + 'record.js is its only writer — got ' + JSON.stringify(window.G.rooms));
        assert(window.G.gold === SERVER_GOLD,
          'the balance is ' + window.G.gold + ' and the server said ' + SERVER_GOLD
          + ' — the client either kept its own debit or applied the answer additively');

        // THE ASSERTION THE OLD CODE FAILED. No manual renderHouse() here on
        // purpose — upgradeRoom itself must leave the screen agreeing with state.
        const after = document.getElementById('house-panel').textContent;
        assert(/Lv 1/.test(after),
          'the House still does not show the Forge as owned after building it — this is the double-build report');
      });
    } finally { restoreGAndRecord(snap); }
  }),

  () => tryRun('b227 regression: a maxed room refuses another build, out loud', () => {
    // The fourth click used to hit `if(!nx)return` — a silent no-op that is
    // indistinguishable from a broken button, and the reason the screen read
    // as "it let me keep building". Refusal now happens in the STATE path
    // (not merely as a disabled button) and it says something.
    if (typeof window.upgradeRoom !== 'function') return;
    const snap = snapshotG();
    try {
      const cap = window.ROOMS.forge.levels.length;
      window.G.homestead = { tier: 5 };
      window.G.rooms = { forge: cap };
      window.G.gold = 5000000;
      const goldBefore = window.G.gold, lvBefore = window.G.rooms.forge;
      const ok = window.upgradeRoom('forge');
      assert(ok === false, 'a maxed room must refuse the build and say so');
      assert(window.G.rooms.forge === lvBefore, 'a maxed room must not gain a level');
      assert(window.G.gold === goldBefore, 'a refused build must not charge the player');
      // …and it must not throw on an id that is not a room at all. That path
      // console.errors ON PURPOSE (a missing room is a wiring break and the
      // b224 lesson is that those must be loud, never a silent plausible
      // value) — so the error is captured here rather than left to fail the
      // headless gate, and the fact that it fired is itself asserted.
      const realError = console.error;
      let logged = 0;
      console.error = () => { logged++; };
      try {
        assert(window.upgradeRoom('not_a_room') === false, 'an unknown room id must be refused, not thrown on');
        assert(logged === 1, 'an unknown room id must be reported loudly, not swallowed');
      } finally { console.error = realError; }
    } finally { restoreG(snap); }
  }),

  () => tryRunAsync('b227 regression: the property gate is enforced on EVERY rung, not just the first', async () => {
    // The old gate ran only at `lv === 0`. Harmless while a room's three rungs
    // shared one gate; a hole the moment L4 needs a Manor. A tier-2 player who
    // owns a Forge could otherwise buy the tier-3 and tier-4 rungs outright.
    if (typeof window.upgradeRoom !== 'function') return;
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 2 };                 // farmstead — below the L4 gate of 3
      window.G.rooms = { forge: 3 };                    // owns every ungated rung
      window.G.gold = 9000000;
      /* b515: the rooms record is ARMED, so `roomRungG` reads the RECORD and a
         bare `G.rooms = {forge:3}` is UNKNOWN — the gate would be measuring a
         character who owns nothing. Stamped through the real applyRecord. */
      stampRecordLikeLoad(window.G);
      const inv = {};
      Object.keys(window.ROOMS.forge.levels[3].cost).forEach((k) => { if (k !== 'gold') inv[k] = 9999; });
      window.G.inventory = Object.assign({}, window.G.inventory, inv);
      const goldBefore = window.G.gold;

      /* THE REFUSAL IS THE CLIENT'S, AND IT MUST NOT COST A ROUND TRIP. A
         pre-flight gate that still calls the server is a rate budget spent to be
         told what the client already knew — the same property the farm refusal
         tests hold. So the refusal half runs inside the fixture and asserts ZERO
         intents left. */
      await withRoomServer({ forge: 4 }, goldBefore - 1, async (rig) => {
        assert(window.upgradeRoom('forge') === false, 'rung 4 must be refused below its property tier');
        await rig.drain();
        assert(rig.sent.length === 0,
          'a tier-refused build still spent a server round trip: ' + JSON.stringify(rig.sent));
        assert(window.G.rooms.forge === 3, 'a tier-gated rung must not be granted');
        assert(window.G.gold === goldBefore, 'a tier-refused build must not charge the player');

        /* Raise the property and the same call now succeeds — proving the
           refusal was the TIER and not the cost. The rung arrives on the
           answer, because the client may not write it. */
        window.G.homestead = { tier: 3 };
        assert(window.upgradeRoom('forge') === true, 'rung 4 must be dispatched at Stonecross Manor');
        await rig.drain();
        assert(rig.sent.length === 1 && rig.sent[0].offer === 'room.forge.4',
          'the fitted rung sent ' + JSON.stringify(rig.sent) + ' — one unlock_buy naming room.forge.4');
        assert(window.G.rooms.forge === 4, 'the fitted rung should be owned once the server records it');
      });
    } finally { restoreGAndRecord(snap); }
  }),

  () => tryRunAsync('unlock_buy client transport: offer id crosses, a price never does', async () => {
    // THE SLICE. upgradeProperty + upgradeRoom now debit gold through the live
    // `unlock_buy` verb instead of authoring the number themselves. The load-
    // bearing client property is that the wire carries an OFFER ID and NOTHING
    // ELSE — no price, no qty, no cost — so a forged client value cannot author
    // a permanent capability's cost. hr_unlock_buy reads the price server-side.
    const S = window.HearthriseGold;
    if (!S || typeof S.buildGoldRequest !== 'function') return;

    // 1. THE BYTES. The unlock_buy body is exactly {verb, slot, intentId, offer}.
    const req = S.buildGoldRequest({ verb: 'unlock_buy', slot: 0, intentId: 'k', offer: 'property.homestead' });
    const body = JSON.parse(req.init.body);
    assert(body.verb === 'unlock_buy' && body.offer === 'property.homestead',
      'the unlock_buy body must carry the verb and the offer id');
    assert(!('qty' in body) && !('price' in body) && !('cost' in body) && !('gold' in body) && !('amount' in body),
      'the unlock_buy wire must carry NO price/qty/cost — a client price authoring a rung is the '
      + 'exact thing this verb exists to make impossible; got ' + JSON.stringify(body));

    // 2. THE ID SHAPE. Room offers have TWO dots (`room.cellar.1`); the single-dot
    //    shop pattern would wrongly refuse them, so unlock_buy has its own mirror
    //    of the server's OFFER_ID_RE.
    const RE = S.UNLOCK_OFFER_ID_RE;
    assert(RE.test('property.homestead') && RE.test('room.cellar.1') && RE.test('room.forge.4'),
      'the unlock offer regex must accept the real property + room offer ids');
    assert(!RE.test('room') && !RE.test('room.') && !RE.test('a.b.c.d.e') && !RE.test('Room.Cellar.1'),
      'the unlock offer regex must reject malformed / over-segmented / cased ids');

    // 3. A MALFORMED OFFER IS REFUSED LOCALLY — sent:false, no rate slot burned,
    //    regardless of the accrual switch.
    const bad = S.buyUnlock('not a valid id!!', S.newIntentKey ? (S.newIntentKey() || 'k') : 'k');
    assert(bad && typeof bad.then === 'function', 'buyUnlock must return a promise');
    const r = await bad;
    assert(r && r.sent === false && r.reason === 'bad_offer',
      'a malformed offer id must refuse locally as bad_offer, not go to the server; got ' + JSON.stringify(r));
  }),

  () => tryRunAsync('hr_trait_buy client transport: a trait id crosses, a price never does', async () => {
    /* THE SLICE (b46x). A permanent TRAIT is now bought through hr_trait_buy —
       a direct PostgREST RPC, not a gold verb, because it moves no gold and
       returns no envelope. The load-bearing client properties are the same two
       unlock_buy's are: the wire carries a NAME and never a NUMBER, and a
       malformed gesture is refused locally instead of spending a real player's
       rate budget to be told so. The server half is tests/trait-buy.mjs. */
    const S = window.HearthriseGold;
    if (!S || typeof S.buildTraitBuyRequest !== 'function') {
      assert(false, 'HearthriseGold.buildTraitBuyRequest is missing — legacy.js buyTrait() has '
        + 'nothing to route to under the marks arm and every trait is unbuyable');
      return;
    }

    // 1. THE BYTES. Exactly {p_trait_id, p_slot, p_idem} and nothing else.
    const req = S.buildTraitBuyRequest({ trait: 'auto_eat', slot: 0, intentId: 'k',
      url: 'https://x.example', apiKey: 'a', token: 't' });
    const body = JSON.parse(req.init.body);
    assert(body.p_trait_id === 'auto_eat' && body.p_slot === 0 && body.p_idem === 'k',
      'the trait-buy body must carry the trait id, the slot and the idempotency key; got '
      + JSON.stringify(body));
    assert(Object.keys(body).length === 3,
      'the trait-buy body grew a field: ' + JSON.stringify(body) + '. Price, currency and '
      + 'prerequisite live in public.hr_traits — a number added here is a client authoring a '
      + 'permanent capability, which is exactly what this verb was written to make impossible.');
    assert(!('p_cost' in body) && !('p_price' in body) && !('p_currency' in body)
      && !('p_marks' in body) && !('p_gold' in body),
      'the trait-buy wire must carry NO price/currency/balance; got ' + JSON.stringify(body));
    assert(/\/rest\/v1\/rpc\/hr_trait_buy$/.test(req.url),
      'the trait-buy request must POST to the hr_trait_buy RPC; got ' + req.url);

    // 2. A REFUSAL ARRIVES AS HTTP 200. PostgREST returns 200 for any function
    //    that RETURNS a value, so classifying on status alone would read
    //    {ok:false,error:'insufficient_marks'} as a purchase and grant it free.
    const C = S.classifyTraitResponse;
    assert(C(200, { ok: true, trait_id: 'auto_eat' }).outcome === 'applied',
      'a successful purchase must classify as applied');
    assert(C(200, { ok: true, replayed: true }).outcome === 'replayed',
      'a replayed purchase must classify as replayed (the original landed — the trait IS owned)');
    const refused = C(200, { ok: false, error: 'insufficient_marks' });
    assert(refused.outcome === 'refused' && refused.reason === 'insufficient_marks',
      'a 200 carrying ok:false is a REFUSAL, not a purchase; got ' + JSON.stringify(refused));
    assert(C(429, null).outcome === 'rate-limited' && C(404, null).reason === 'rpc_missing'
      && C(503, null).outcome === 'unavailable' && C(401, null).outcome === 'not-signed-in',
      'the transport must name each transport-level failure separately');
    assert(S.isTraitOwnedOutcome('applied') && S.isTraitOwnedOutcome('replayed')
      && !S.isTraitOwnedOutcome('refused') && !S.isTraitOwnedOutcome('unavailable'),
      'ownership must follow applied/replayed only');

    // 3. A MALFORMED TRAIT ID IS REFUSED LOCALLY — no rate slot burned.
    const bad = S.buyTrait('not a trait!!', S.newIntentKey ? (S.newIntentKey() || 'k') : 'k');
    assert(bad && typeof bad.then === 'function', 'buyTrait must return a promise');
    const r = await bad;
    assert(r && r.outcome === 'unsendable' && r.reason === 'bad_trait',
      'a malformed trait id must refuse locally as bad_trait, not go to the server; got '
      + JSON.stringify(r));
    // …and so is a missing idempotency key: a purchase with no key cannot be
    // replayed safely, so it must never leave the client.
    const noKey = await S.buyTrait('auto_eat', 'not-a-uuid');
    assert(noKey && noKey.outcome === 'unsendable' && noKey.reason === 'no_intent_key',
      'a purchase with no valid idempotency key must not be sent; got ' + JSON.stringify(noKey));
  }),

  () => tryRun('b536: the trait ownership hydration MIRRORS the server, both directions', () => {
    /* This shipped as a UNION — add-only — for players who bought Auto-Eat
       before hr_trait_buy existed. The wipe removed them (§1) and the rule
       outlived its reason: add-only means a trait the server never sold gates
       every surface as "owned" forever (§6). The projection is UNFILTERED and
       `[]` is KNOWN (2026-08-23-trait-buy.sql): it is the set. */
    const A = window.HearthriseAccrual;
    if (!A || typeof A.reconcileTraits !== 'function') {
      assert(false, 'HearthriseAccrual.reconcileTraits is missing — nothing hydrates trait '
        + 'ownership from the server envelope, so a purchase would not survive a device change');
      return;
    }
    const g = { traits: { legacy_local: true } };
    const r1 = A.reconcileTraits(g, { traits: ['auto_eat'] });
    assert(g.traits.auto_eat === true, 'a server-owned trait must be hydrated onto the client');
    assert(!('legacy_local' in g.traits) && r1 && r1.removed === 1,
      'THE BUG: a trait the server does not project survived the hydration — a client-only flag '
      + 'that keeps gating a server capability as owned is the residue-ahead class');

    // FAIL-CLOSED on absence: no `traits` key changes nothing (never evict on
    // uncertainty — absence is not "you own nothing").
    const g2 = { traits: { auto_eat: true } };
    const res = A.reconcileTraits(g2, { state: {} });
    assert(res && res.mode === 'absent' && g2.traits.auto_eat === true,
      'an envelope that does not project traits must not be read as "you own nothing"');

    // An EMPTY server set is a valid known state: grants nothing, and takes back
    // anything the client invented.
    const g3 = { traits: {} };
    A.reconcileTraits(g3, { traits: [] });
    assert(Object.keys(g3.traits).length === 0, 'an empty owned set must grant nothing');
    const g4 = { traits: { auto_eat: true, auto_eat_2: true } };
    A.reconcileTraits(g4, { traits: [] });
    assert(Object.keys(g4.traits).length === 0,
      'an empty PROJECTED set is the server saying "this character owns nothing" — it must clear');

    /* THE ONE EXCEPTION, on the EXISTING optimistic/answer seam: buyTrait parks
       `G._traitBuying[id]` for a purchase; an envelope predating it must not
       un-paint it — until the server answers. */
    const g5 = { traits: { auto_eat: true }, _traitBuying: { auto_eat: true } };
    const r5 = A.reconcileTraits(g5, { traits: [] });
    assert(g5.traits.auto_eat === true && r5.held === 1 && r5.removed === 0,
      'a purchase IN FLIGHT must hold its optimistic trait until the server answers');
    g5._traitBuying.auto_eat = false;                      // the answer landed
    A.reconcileTraits(g5, { traits: [] });
    assert(!('auto_eat' in g5.traits),
      'once the purchase is no longer in flight the server set is the set — the optimistic paint '
      + 'must not become a second source of truth');
  }),

  () => tryRun('P0 (Paione): the combat style is the SERVER\'s, and the picker tells it', () => {
    /* THE BUG. "When training combat, Strength/Defense/HP exp is not saving —
       only Attack saves; the rest reset to level 1." The chosen style had no
       server home (save blob → client_state RESIDUE bag, both self-only), so
       the accrual engine settled every window with the family DEFAULT —
       Accurate, 100% of styled XP to Attack — and, because skills are
       server-of-record and armed, overwrote the client's predicted Strength /
       Defence XP at every settle.

       The engine half is proven behaviourally in tests/combat-style.mjs. THIS
       is the client half: the picker must TELL the server, and the envelope
       must be able to correct the picker. */
    const A = window.HearthriseAccrual;
    const GC = window.HearthriseGoalClaim;
    assert(GC && typeof GC.setStyle === 'function',
      'HearthriseGoalClaim.setStyle is missing — nothing sends hr_set_style, so the server never '
      + 'learns the choice and the settle keeps routing every styled grant to Attack');
    if (!A || typeof A.reconcileCombatStyle !== 'function') {
      assert(false, 'HearthriseAccrual.reconcileCombatStyle is missing — the picker could disagree '
        + 'with what the engine actually pays, with no way to notice');
      return;
    }

    // 1. SERVER WINS, PER FAMILY. The engine pays from the server's map, so a
    //    local value that disagrees is a lie the player is being shown.
    const g = { combatStyle: { sword: 'accurate', ranged: 'longrange' } };
    const r = A.reconcileCombatStyle(g, { state: { combat_style: { sword: 'defensive' } } });
    assert(g.combatStyle.sword === 'defensive',
      'the server\'s style did not win — the picker would show Accurate while the server pays '
      + 'Defensive');
    assert(g.combatStyle.ranged === 'longrange',
      'a family the SERVER has no opinion about was reset — the map is deliberately partial, and '
      + 'a whole-map assignment silently un-picks every pre-migration choice');

    // 2. THE ONE-SHOT BACK-FILL is reported, and ONLY for a non-default choice.
    //    legacy.js migrate() fills all four families with their defaults, so an
    //    unfiltered back-fill would fire four RPCs on every account's first boot
    //    AND destroy the "{} means chosen nothing" distinction the column rests on.
    assert(r && Array.isArray(r.adopt), 'reconcileCombatStyle must report an adopt list');
    const adopted = r.adopt.map((p) => p.join('/'));
    assert(adopted.indexOf('ranged/longrange') >= 0,
      'a locally-chosen family the server has never been told about must be back-filled; got '
      + JSON.stringify(adopted));
    const fresh = { combatStyle: { sword: 'controlled', hammer: 'smash', ranged: 'rapid', magic: 'cast' } };
    const r2 = A.reconcileCombatStyle(fresh, { state: { combat_style: {} } });
    assert(r2 && r2.adopt.length === 0,
      'a fresh account whose four families are all DEFAULTS tried to back-fill '
      + JSON.stringify(r2 && r2.adopt) + ' — four RPCs on every first boot, and the server map '
      + 'would then say "chose Accurate" where it means "chose nothing"');

    // 3. FAIL-CLOSED on absence. A lean envelope, or a server predating the
    //    migration, must never be read as "you chose nothing".
    const g3 = { combatStyle: { sword: 'aggressive' } };
    const r3 = A.reconcileCombatStyle(g3, { state: {} });
    assert(r3 && r3.mode === 'absent' && g3.combatStyle.sword === 'aggressive',
      'an envelope with no combat_style wiped the local choice');

    // 4. THE OPTIMISTIC-PICK GUARD ("magic style swaps back to attack when you
    //    level a stat or switch cast↔focus"). applyCombatStyle writes the pick
    //    locally + fires set_style fire-and-forget; set_style settles-first then
    //    retries on a ladder, so an envelope that lands in that window carries the
    //    server's OLD map. Server-wins would roll the fresh pick straight back to
    //    the family default. The pending marker must HOLD it.
    const gm = { combatStyle: { sword: 'controlled', hammer: 'smash', ranged: 'rapid', magic: 'cast' } };
    gm.combatStyle.magic = 'focus';           // player taps Focus on a magic weapon
    gm._pendingStyle = { magic: 'focus' };     // applyCombatStyle records this
    const rStale = A.reconcileCombatStyle(gm, { state: { combat_style: { magic: 'cast' } } });
    assert(gm.combatStyle.magic === 'focus',
      'a STALE envelope reverted the just-picked magic style to the family default — this is the '
      + '"cast↔focus / level-up swaps back to attack" bug; got ' + gm.combatStyle.magic);
    assert(rStale && rStale.held >= 1,
      'reconcile did not report HOLDING the pending pick against a stale server echo');
    assert(rStale.adopt.some((p) => p[0] === 'magic' && p[1] === 'focus'),
      'a held pick must be re-queued in adopt so the intent keeps being resent until the server agrees');
    // The pick NEVER lands under the wrong family — a magic write must not touch sword.
    assert(gm.combatStyle.sword === 'controlled',
      'selecting a magic style disturbed the sword family — the picker wrote the wrong weapon key');

    // Server catches up: the marker clears and the pick stays.
    const rCaught = A.reconcileCombatStyle(gm, { state: { combat_style: { magic: 'focus' } } });
    assert(gm.combatStyle.magic === 'focus' && (!gm._pendingStyle || !gm._pendingStyle.magic) && rCaught.held === 0,
      'once the server echoes the pick the pending marker must clear and Focus must remain');

    // A genuine cross-device change (no pending) still wins — the guard only
    // protects the in-flight local gesture, it does not freeze the family.
    const rCross = A.reconcileCombatStyle(gm, { state: { combat_style: { magic: 'warded' } } });
    assert(gm.combatStyle.magic === 'warded' && rCross.corrected >= 1,
      'with no pending pick, a server change must still win — the guard must not pin the family');

    // 5. EACH FAMILY stays in-family through a held stale echo. A pick under one
    //    weapon family must never bleed into another (part (a)/(c) of the report).
    [['sword', 'defensive', 'controlled'], ['hammer', 'crush', 'smash'],
     ['ranged', 'longrange', 'rapid'], ['magic', 'focus', 'cast']].forEach(([fam, pick, def]) => {
      const gf = { combatStyle: { sword: 'controlled', hammer: 'smash', ranged: 'rapid', magic: 'cast' } };
      gf.combatStyle[fam] = pick;
      gf._pendingStyle = { [fam]: pick };
      // stale echo for THIS family, plus untouched values for the others
      const stale = { sword: 'controlled', hammer: 'smash', ranged: 'rapid', magic: 'cast' };
      A.reconcileCombatStyle(gf, { state: { combat_style: stale } });
      assert(gf.combatStyle[fam] === pick,
        fam + ': a stale echo reverted the pick to ' + gf.combatStyle[fam] + ' (default ' + def + ')');
      ['sword', 'hammer', 'ranged', 'magic'].filter((o) => o !== fam).forEach((other) => {
        assert(gf.combatStyle[other] === { sword: 'controlled', hammer: 'smash', ranged: 'rapid', magic: 'cast' }[other],
          fam + ' pick leaked into the ' + other + ' family (now ' + gf.combatStyle[other] + ')');
      });
    });

    /* ⚠ WHAT THIS TEST DELIBERATELY DOES NOT DO: call applyCombatStyle().
       It is the ONE writer and it now fires the transport, re-times a running
       fight and re-renders three panels — driving it from inside the in-page
       budget is how a suite starts timing out for reasons that have nothing to
       do with the assertion. That applyCombatStyle reaches
       HearthriseGoalClaim.setStyle is proven STATICALLY by tests/combat-style.mjs
       section E, and the routing it decides is proven BEHAVIOURALLY against the
       real engine in that file's section B. */
  }),

  () => tryRun('the UNCHOSEN sword style trains all three melee skills (the onboarding trap: Attack 13 / Strength 1 / Defence 1 after ~200 kills)', () => {
    /* THE BUG, FOUND BY PLAYING (live QA account, 2026-09-05). The sword family
       default was `accurate` — `xp:{attack:1}`. Most players never open the style
       picker, so most players trained Attack and ONLY Attack: Attack 13 while
       Strength and Defence sat at level 1 with 0 xp after ~200 kills.

       Two compounding harms, which is why this is a P1 and not a preference:
         · Strength 1 ⇒ a tiny max hit, so every fight is slow — the game reads as
           stalled, with nothing on screen explaining why.
         · The combat-XP anti-forgery clamp keys on
           dmg_level = max(strength, ranged, magic). Strength stuck at 1 therefore
           pins the CAP as well, so the trap tightens itself.

       The ruling (game-designer): a hands-off default must build the whole melee
       triple ⇒ `controlled`. This asserts the ROUTING TABLE, not just the key,
       because `trains` is an authored label and `xp` is what the engine actually
       pays (hitXpRoute / killXpRoute) — asserting the key alone would go green
       against a `controlled` whose xp map had been edited down to one skill.

       Fails if the default returns to `accurate` (verified by reverting it). */
    const CK = window.HearthriseCore;
    if (!CK || !CK.styles) {
      assert(false, 'HearthriseCore.styles is missing — the default style, the picker and the '
        + 'server accrual all read that one table');
      return;
    }
    const S = CK.styles;
    const MELEE = ['attack', 'strength', 'defense'];

    // 1. THE DEFAULT TABLE. One fact, one place — the engine, the picker and
    //    supabase/functions/hr-accrue (which VENDORS this module) all read it.
    assert(S.DEFAULT_STYLE_KEYS && S.DEFAULT_STYLE_KEYS.sword === 'controlled',
      'the unchosen sword style is "' + (S.DEFAULT_STYLE_KEYS && S.DEFAULT_STYLE_KEYS.sword)
      + '" — a new player who never opens the picker must not be put on a single-skill route');

    // 2. A FRESH CHARACTER — no explicit style anywhere — RESOLVES to it. All
    //    three "chose nothing" doors: normaliseStyleKeys (what legacy.js
    //    migrate() runs on boot), and resolveStyle off an empty / absent map
    //    (what the server does with combat_style '{}', i.e. every account that
    //    never picked). They must agree, or the picker shows one route while the
    //    settle pays another.
    const freshMap = S.normaliseStyleKeys({});
    assert(freshMap.sword === 'controlled',
      'normaliseStyleKeys filled a fresh character sword family with "' + freshMap.sword + '"');
    const resolvedFresh = S.resolveStyle('sword', freshMap);
    const resolvedEmpty = S.resolveStyle('sword', {});
    const resolvedNull = S.resolveStyle('sword', null);
    assert(resolvedFresh === S.COMBAT_STYLES.sword.controlled
        && resolvedEmpty === resolvedFresh && resolvedNull === resolvedFresh,
      'the three "chose nothing" doors disagree — fresh=' + (resolvedFresh && resolvedFresh.name)
      + ' empty=' + (resolvedEmpty && resolvedEmpty.name)
      + ' null=' + (resolvedNull && resolvedNull.name));

    // 3. THE ROUTE ITSELF: Attack AND Strength AND Defence, on the hit route and
    //    the kill route — the two functions combat-sim.js actually calls.
    MELEE.forEach((sk) => {
      assert(resolvedFresh.xp && resolvedFresh.xp[sk] > 0,
        'the default sword style pays no ' + sk + ' XP (xp=' + JSON.stringify(resolvedFresh.xp)
        + ') — that skill would stay at level 1 forever');
    });
    const hit = S.hitXpRoute(resolvedFresh, 25);
    const kill = S.killXpRoute(resolvedFresh, 100, 1);
    MELEE.forEach((sk) => {
      assert(hit.some((g) => g.skill === sk && g.amount > 0),
        'hitXpRoute paid no ' + sk + ' on the default style — the per-damage grant is the bulk of '
        + 'combat XP, so a missing skill here IS the trap');
      assert(kill.some((g) => g.skill === sk && g.amount > 0),
        'killXpRoute paid no ' + sk + ' on the default style');
    });

    // 4. STILL A ROUTE, NOT A BONUS. The default must not also be the best XP
    //    rate, or it stops being a neutral default and becomes the only choice.
    const styledHit = hit.filter((g) => g.skill !== 'hitpoints').reduce((a, g) => a + g.amount, 0);
    assert(Math.abs(styledHit - 25 * S.HIT_XP_PER_DAMAGE) < 1e-6,
      'the default style pays ' + styledHit + ' styled XP for 25 damage, not '
      + (25 * S.HIT_XP_PER_DAMAGE) + ' — a default that multiplies XP is a balance change in disguise');

    // 5. THE OTHER FAMILIES ARE UNCHANGED, AND WERE NEVER TRAPPED: each trains
    //    its own damage skill, so dmg_level (and the XP cap) grows on its own.
    assert(S.DEFAULT_STYLE_KEYS.hammer === 'smash' && S.DEFAULT_STYLE_KEYS.ranged === 'rapid'
        && S.DEFAULT_STYLE_KEYS.magic === 'cast',
      'a non-sword family default moved — only sword had the Attack-only trap and only sword was ruled on');
    [['hammer', 'strength'], ['ranged', 'ranged'], ['magic', 'magic']].forEach((pair) => {
      const st = S.resolveStyle(pair[0], S.normaliseStyleKeys({}));
      assert(st.xp && st.xp[pair[1]] > 0,
        pair[0] + ' default trains no ' + pair[1] + ' — the sword/accurate trap shape, where '
        + 'dmg_level = max(strength, ranged, magic) never leaves 1');
    });

    // 6. AND THE FALLBACK AGREES. A corrupt stored key or an unknown weapon type
    //    must not quietly drop the player back onto the old Attack-only route.
    assert(S.FALLBACK_STYLE === S.COMBAT_STYLES.sword.controlled,
      'FALLBACK_STYLE is "' + (S.FALLBACK_STYLE && S.FALLBACK_STYLE.name) + '" — a corrupt style '
      + 'key would silently restore the single-skill default');
    assert(S.resolveStyle('slingshot', null) === S.COMBAT_STYLES.sword.controlled,
      'an unknown weapon type falls back to a style other than the sword default');
  }),

  () => tryRun('combat style FAMILY follows the actual weapon, not a fail-closed equipment read (Paione: "styles keep swapping from attack to magic when you swap them / on level up")', () => {
    // ROOT CAUSE this guards: getWeaponType() picks the style SET from the worn
    // weapon via the SERVER-authoritative equipment record accessor. That accessor
    // (correctly) fail-closes to UNKNOWN the instant the client writes G.equipment
    // — which EVERY equip / unequip / loadout swap does (it breaks the record
    // fingerprint → recordValue 'client-overwrote') — and also before the first
    // envelope. Without the fix the family then snapped to the 'sword'/Attack
    // default and flipped back when the next envelope re-applied the record: a
    // magic/ranged user watched their picker swap Attack↔Magic on every gear swap
    // and every level-up re-render. The family is DISPLAY-ONLY (the server routes
    // XP from its own equipment row), so it must fall back to the player's own
    // best-known weapon rather than fail-close.
    const R = window.HearthriseRecord;
    if (!R || typeof R.applyRecord !== 'function' || typeof window.getWeaponType !== 'function') {
      assert(false, 'record/getWeaponType wiring missing — the style family could silently flip');
      return;
    }
    const G = window.G;
    const savedRecord = G._record ? JSON.parse(JSON.stringify(G._record)) : undefined;
    const savedEquip = G.equipment ? JSON.parse(JSON.stringify(G.equipment)) : undefined;
    const armed = R.isServerOfRecord && R.isServerOfRecord('equipment');
    /* ⚠ NEWER THAN WHATEVER IS ALREADY STAMPED, and derived rather than
       hard-coded (found b515). `applyRecord` is MONOTONIC on `version`, and a
       STALE envelope only fills the GAPS — so these three used to be 9000001..3
       and were silently refused whenever an earlier test had stamped a record
       with `Date.now()` (~1.79e12). The staff never landed, `getWeaponType()`
       read the sword default, and the failure looked exactly like the paione
       bug this test exists to catch. It passed alone and failed in the suite,
       which is the worst way for a guard to be wrong. The three-step LADDER is
       the part that matters (each envelope must be newer than the last), so it
       is preserved on a base that cannot be beaten. */
    const V = Math.max(((G._record && Number(G._record.version)) || 0) + 1, Date.now()) + 1;
    try {
      // MAGIC user: server record confirms a staff → family is magic.
      R.applyRecord(G, { ok: true, version: V, state: {}, equipment: { weapon: 'apprentice_staff' } });
      assert(window.getWeaponType() === 'magic',
        'a confirmed magic weapon must resolve to the magic style family; got ' + window.getWeaponType());
      // The player equips a helmet — a client write to G.equipment. Under the arm
      // this makes recordValue 'client-overwrote' (the exact flip trigger).
      G.equipment = G.equipment || {};
      G.equipment.weapon = 'apprentice_staff';
      G.equipment.helmet = 'leather_helm';
      if (armed) {
        assert(R.recordValue(G, 'equipment').source === 'client-overwrote',
          'precondition: a client G.equipment write should make the equipment record client-overwrote');
      }
      assert(window.getWeaponType() === 'magic',
        'THE BUG: after a client gear swap the magic family flipped to the sword/Attack default; '
        + 'got ' + window.getWeaponType());
      // BOTH DIRECTIONS: a melee user must stay melee through the same gesture.
      R.applyRecord(G, { ok: true, version: V + 1, state: {}, equipment: { weapon: 'bronze_sword' } });
      assert(window.getWeaponType() === 'sword', 'a confirmed sword must resolve to the sword family');
      G.equipment.weapon = 'bronze_sword';
      G.equipment.body = 'leather_body';
      assert(window.getWeaponType() === 'sword',
        'a melee gear swap wrongly flipped the family away from sword; got ' + window.getWeaponType());
      // THE LEVEL-UP CASE: a lean envelope (a settle / level-up) that OMITS
      // equipment must leave the family exactly where the last worn weapon put it.
      R.applyRecord(G, { ok: true, version: V + 2, state: { combat_style: { sword: 'aggressive' } } });
      assert(window.getWeaponType() === 'sword',
        'a lean level-up envelope disturbed the weapon family; got ' + window.getWeaponType());
    } finally {
      if (savedRecord === undefined) { try { delete G._record; } catch (e) { G._record = undefined; } }
      else G._record = savedRecord;
      if (savedEquip === undefined) { try { delete G.equipment; } catch (e) { G.equipment = undefined; } }
      else G.equipment = savedEquip;
    }
  }),

  () => tryRun('maxHp tracks the shown Hitpoints level — one source of truth (Paione: "character screen shows 11 HP, combat shows 10")', () => {
    // A hitpoints level gained through the DISPLAY prediction, or one that only
    // settles later via the away/settle envelope, left the STORED G.playerMaxHp
    // behind — so the character/skills screen showed level 11 while the combat HP
    // bar read the stale cap (10) until a reload. hrSyncMaxHp() re-derives the cap
    // from the SAME level the character screen shows (getLevel), raise-only.
    assert(typeof window.hrSyncMaxHp === 'function',
      'hrSyncMaxHp is missing — nothing re-derives maxHp from the hitpoints level, so the HP bar '
      + 'drifts from the character screen until a reload');
    const G = window.G;
    const snap = snapshotG();
    try {
      G.skills = G.skills || {};
      G.skills.hitpoints = 1358;   // level 11
      G.playerMaxHp = 10;          // stale — one behind the level-up
      G.playerHp = 10;             // resting at (old) full
      const shown = window.getLevel('hitpoints');
      assert(shown === 11, 'precondition: the shown hitpoints level should be 11; got ' + shown);
      window.hrSyncMaxHp();
      assert(G.playerMaxHp === shown,
        'THE BUG: maxHp did not follow the shown hitpoints level (' + shown + '); combat still reads '
        + G.playerMaxHp);
      assert(G.playerHp === G.playerMaxHp,
        'a resting player at full HP should be handed the new headroom, not stay one under');
      // RAISE-ONLY: a later, lower level (a prediction rollback) must not shrink a
      // resting player's cap — HP is not tradeable/rankable.
      G.skills.hitpoints = 100;    // ~level 2
      window.hrSyncMaxHp();
      assert(G.playerMaxHp === 11, 'maxHp must be raise-only; a lower level shrank the cap to ' + G.playerMaxHp);
      // MID-FIGHT: an injured live hp is preserved (not topped up), max still rises.
      G.skills.hitpoints = 1358; G.playerMaxHp = 10; G.playerHp = 3;
      window.hrSyncMaxHp();
      assert(G.playerMaxHp === 11 && G.playerHp === 3,
        'a mid-fight level-up must raise the cap but leave an injured hp where the fight put it; got '
        + G.playerHp + '/' + G.playerMaxHp);
    } finally { restoreG(snap); }
  }),

  () => tryRunAsync('unlock_buy slice: upgradeProperty resolves property.<tierId>, and the TIER comes back on the answer', async () => {
    /* b515 — "DEBITS ONCE" WAS A CLIENT PROPERTY AND THERE IS NO CLIENT DEBIT.
       This ran with the b353 kill switch off, where `goldSettle` was the plain
       local subtraction that shipped pre-seam, and asserted the rewiring had not
       double-debited. Under the shipping arm `gold` is SERVER-OF-RECORD: the
       gesture sends ONE `unlock_buy` naming `property.<nextTierId>`, no price
       crosses, and the balance is whatever the answer states — absolutely.

       So the three things worth holding are held, and the third is the one the
       old shape could not see: exactly ONE intent, the right offer id with no
       price on it, and the balance ending at the SERVER's number rather than at
       the client's arithmetic (a double-debit would now show up as the client
       having computed anything at all). */
    const H = window.HearthriseHomestead;
    if (!H || typeof H.upgradeProperty !== 'function') return;
    const snap = snapshotG();
    /* ── ORDER-DEPENDENCE (QA P3, b495) ────────────────────────────────────
       `G.homestead.tier = 0` is NOT the tier this test upgrades from.
       property-record.js keeps a MODULE-LEVEL, session-scoped, MONOTONE cache of
       the highest property rung the server has ever reported, and getTier()
       heals `G.homestead.tier` UP to it on every read — deliberately, so a
       residue hydrate cannot demote a paid-for tier. `snapshotG()` cannot see
       that cache (it is not in G), so any earlier test that let a server
       envelope through leaves this one upgrading from tier N, buying a
       different offer at a different price, and failing on assertions that have
       nothing to do with the seam under test. Reset it, and put back exactly
       what was there — `__resetPropertyRecord` returns the previous pair for
       precisely this, so a live signed-in session does not lose a real rung. */
    const propRec = window.HearthriseProperty;
    const prevProp = (propRec && typeof propRec.__resetPropertyRecord === 'function')
      ? propRec.__resetPropertyRecord() : null;
    try {
      window.G.homestead = { tier: 0 };                 // camp → next is homestead (400g)
      window.G.gold = 500000;
      stampBalanceLikeLoad(window.G);   // armed: upgradeProperty's affordability read is registry-first
      window.G.inventory = Object.assign({}, window.G.inventory, { copper_ore: 500, normal_log: 500 });
      const goldBefore = window.G.gold;
      /* NOT `goldBefore - 400`: a number the client could not have computed, so
         "the tier was bought" cannot pass on a client debit. */
      const SERVER_GOLD = goldBefore - 400 - 3;
      await withRoomServer({ 'property:homestead': 1 }, SERVER_GOLD, async (rig) => {
        const ok = H.upgradeProperty();
        await rig.drain();
        assert(ok === true, 'the property upgrade from camp should be accepted with funds in hand');
        assert(rig.sent.length === 1 && rig.sent[0].verb === 'unlock_buy',
          'the upgrade sent ' + JSON.stringify(rig.sent) + ' — exactly one unlock_buy');
        assert(rig.sent[0].offer === 'property.homestead',
          'the upgrade named the wrong offer: ' + rig.sent[0].offer);
        for (const forbidden of ['gold', 'price', 'cost', 'amount', 'tier']) {
          assert(!(forbidden in rig.sent[0]),
            'the upgrade body carries a `' + forbidden + '` field — the server reads price and prereq off '
            + 'hr_unlock_offers, and a client that can name a TIER can name any tier');
        }
        assert(window.G.homestead.tier === 1,
          'the tier should advance to homestead; got ' + window.G.homestead.tier
          + ' (if this is > 1 the property-record ratchet was not reset — see the note above)');
        assert(window.G.gold === SERVER_GOLD,
          'the balance is ' + window.G.gold + ' and the server said ' + SERVER_GOLD
          + ' — the client either kept its own debit or applied the answer additively');
      });
    } finally {
      if (prevProp && propRec) {
        try { propRec.__resetPropertyRecord(prevProp.tier, prevProp.workers); } catch (e) {}
      }
      restoreG(snap);
    }
  }),

  /* ════════════════════════════════════════════════════════════════════════
     b500 — SERVER-CONFIRMED UNLOCK. Player report #1 (the Forge): the class is
     "optimistic client-apply of a server-owned unlock, refusal swallowed." The
     unlock_buy sites advanced a capability locally and fired buyUnlock with a
     `.catch(function(){})` that COULD NOT fire (buyUnlock resolves, never
     rejects), so a server "no" left the player looking at progress the realm
     never recorded, gone on reload. These pin the fix on both the reported
     surface (the property tier) and the class (the shared verdict reader + the
     room rung). Each mutation-proof by named expect.
     ════════════════════════════════════════════════════════════════════════ */
  () => tryRun('UNLOCK-VERDICT-1 (b500): hrClassifyUnlock reads ok/owned/refused; the refusal is a sentence, not a code', () => {
    const C = window.hrClassifyUnlock, M = window.hrUnlockRefusalMessage;
    if (typeof C !== 'function' || typeof M !== 'function') {
      throw new Error('hrClassifyUnlock / hrUnlockRefusalMessage are not published — the shared verdict reader '
        + 'every unlock_buy site depends on is gone');
    }
    assert(C({ outcome: 'applied' }).ok === true, 'an applied verdict must be ok');
    assert(C({ outcome: 'replayed' }).ok === true, 'a replayed verdict (idempotent re-land) must be ok');
    assert(C({ outcome: 'refused', reason: 'insufficient_item' }).ok === false, 'a refusal must NOT be ok');
    const owned = C({ outcome: 'refused', reason: 'already_owned' });
    assert(owned.ok === true && owned.owned === true,
      'already_owned is a RECEIPT (ok+owned), not a refusal — the rung is paid; got ' + JSON.stringify(owned));
    assert(C({ outcome: 'rate-limited' }).ok === false, 'rate-limited must NOT be ok (nothing was recorded)');
    assert(C(null).ok === false && C(undefined).ok === false, 'a missing verdict must fail closed, never ok');
    // The messages: honest sentences, the shortfall stated, no raw code, and the
    // load-bearing reassurance for a pre-write refusal.
    const item = M({ reason: 'insufficient_item', detail: { item_id: 'wolf_pelt', have: 3, need: 4 } }, 'the upgrade');
    assert(/short 1 Wolf Pelt/.test(item), 'insufficient_item must NAME the item and state the shortfall (need-have=1); got "' + item + '"');
    assert(!/insufficient_item/.test(item), 'a refusal is a sentence to the player, not an error code; got "' + item + '"');
    assert(/[Nn]othing was spent/.test(item), 'a pre-write refusal must reassure nothing was spent; got "' + item + '"');
    const gold = M({ reason: 'insufficient_gold', detail: { have: 100, need: 2500 } }, 'the upgrade');
    assert(/short 2,400 gold/.test(gold), 'insufficient_gold must state the gold shortfall (2,400); got "' + gold + '"');
  }),

  () => tryRunAsync('PROP-REFUSE-1 (b500): a server-REFUSED property upgrade does NOT advance the tier and speaks the refusal', async () => {
    const H = window.HearthriseHomestead;
    if (!H || typeof H.upgradeProperty !== 'function') return;
    const snap = snapshotG();
    const origGold = window.HearthriseGold, origNotify = window.notify;
    const propRec = window.HearthriseProperty;
    const prevProp = (propRec && typeof propRec.__resetPropertyRecord === 'function') ? propRec.__resetPropertyRecord() : null;
    const said = [];
    let buyCalls = 0, sentOffer = null;
    try {
      window.G.homestead = { tier: 1 };                 // homestead → next is property.farmstead
      window.G.gold = 500000;
      window.G.inventory = Object.assign({}, window.G.inventory,
        { oak_log: 500, copper_ore: 500, wolf_pelt: 4, cooked_shrimp: 500 });   // client SHOWS 4 pelts
      stampBalanceLikeLoad(window.G);
      window.notify = function (m, k) { said.push({ m: String(m), k: k }); };
      /* SERVER-OWNED (switch on), and the server REFUSES insufficient_item — the
         exact Forge divergence: the client shows 4 Wolf Pelt, the server settled 3. */
      window.HearthriseGold = Object.assign({}, origGold, {
        isGoldIntentEnabled: function () { return true; },
        newIntentKey: function () { return 'k-prop-refuse'; },
        buyUnlock: function (offer, key) {
          buyCalls++; sentOffer = offer;
          return Promise.resolve({ outcome: 'refused', reason: 'insufficient_item', verb: 'unlock_buy', key: key,
            body: { ok: false, error: 'insufficient_item', detail: { item_id: 'wolf_pelt', have: 3, need: 4 } } });
        },
      });
      const before = H.getTier();
      H.upgradeProperty();
      await new Promise(function (r) { setTimeout(r, 30); });
      assert(sentOffer === 'property.farmstead', 'the upgrade must send offer property.farmstead; got ' + sentOffer);
      assert(buyCalls === 1, 'the upgrade must attempt the purchase exactly once; got ' + buyCalls);
      assert(H.getTier() === before, 'THE FORGE BUG: a server-REFUSED property upgrade advanced the tier from '
        + before + ' to ' + H.getTier() + ' (optimistic ++ with the refusal swallowed)');
      assert(window.G.homestead.tier === 1, 'the residue tier must stay 1 after a refusal; got ' + window.G.homestead.tier);
      const refusal = said.filter(function (s) { return s.k === 'kill' && /Wolf Pelt/.test(s.m); });
      assert(refusal.length >= 1, 'a refused upgrade must SURFACE the refusal naming the material; saw ' + JSON.stringify(said));
      assert(!said.some(function (s) { return /built!/.test(s.m); }), 'a refused upgrade must NOT toast "built!"');
    } finally {
      window.HearthriseGold = origGold; window.notify = origNotify;
      if (prevProp && propRec) { try { propRec.__resetPropertyRecord(prevProp.tier, prevProp.workers); } catch (e) {} }
      restoreG(snap);
    }
  }),

  /* ════════════════════════════════════════════════════════════════════════
     b502 — THE SERVER'S RUNG IS THE TIER, IN BOTH DIRECTIONS.

     THE LIVE P1 (paione, 2026-09-04: "the rooms are still not being built"),
     proven from server data before a line was written:
       player_progress slot 0 : unlock property:homestead = 1. NO farmstead row.
       player_state.client_state -> 'homestead' : { "tier": 2 }.
       hr_rejections 16:23–16:32 UTC : unlock_buy room.forge.1 refused
         prereq_property_tier {have:1, need:2} — ×10. Same refusal 09-01, 08-31;
         worker_hire.2 since 08-27; a second player on room.workshop.1 ×11.
     b500 stopped NEW optimistic advances; it could not repair a residue that was
     ALREADY ahead, because src/net/property-record.js was a RAISE-ONLY floor —
     max(server, residue) preserves the lie by construction. The House named the
     Farmstead, the Forge card looked buildable, "Upgrade Property" offered the
     rung ABOVE the one he was missing, and every build bounced. An account that
     cannot build, cannot hire and is not offered the rung it needs.
     ════════════════════════════════════════════════════════════════════════ */
  () => tryRun('PROP-TRUTH-1 (b502): PAIONE\'S ROW — residue 2 against a server rung of 1 resolves to 1, the Forge locks, and the Farmstead is what is offered', () => {
    const P = window.HearthriseProperty;
    const H = window.HearthriseHomestead;
    if (!P || !H) return;
    const prev = P.__resetPropertyRecord();
    const snap = snapshotG();
    try {
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 2 };            // the forged residue, verbatim
      window.G.rooms = {};
      /* The envelope he actually gets: one permanent property row at rung 1,
         complete (no progress_truncated), exactly as hr_state_of projects it. */
      P.notePropertyUnlocks({ ok: true, progress_truncated: false, progress: [
        { kind: 'unlock', key: 'property:homestead', value: 1, period: '' },
        { kind: 'unlock', key: 'worker_hire', value: 1, period: '' },
      ] });

      assert(H.getTier() === 1, 'THE BUG: the effective tier is ' + H.getTier()
        + ' with a server rung of 1 — the residue is still out-ranking the realm');
      assert(window.G.homestead.tier === 1, 'the conform was not WRITTEN back into the residue (got '
        + window.G.homestead.tier + ') — the lie would survive the reload and the next residue upload');

      // The room gate — the surface he reported. Both the feature API and the
      // legacy authority upgradeRoom actually enforces with.
      const gate = H.canBuildRoom('forge');
      assert(gate.ok === false, 'the Forge must be LOCKED at server rung 1 — it needs the Farmstead');
      /* THE PROVISIONAL FLAG. Every gate is a PRE-FLIGHT for a decision
         hr_unlock_buy makes on its own copy of the rung, so the verdict states
         whether the client is answering from a server statement or from the
         residue cache. It is published, never used to refuse — see
         features/homestead.js serverRungKnown for that ruling and its evidence.
         Asserted here (KNOWN) and in PROP-REFUSE-2 (UNKNOWN, then KNOWN on the
         refusal) so the contract holds before anything adopts it. */
      assert(gate.pending === false,
        'the server has stated the rung this session, so the gate must not report itself provisional');
      assert(H.serverRungKnown() === true, 'serverRungKnown disagrees with the record it reads');
      assert(/Farmstead/.test(gate.reason || ''), 'the lock must NAME the property he needs; got "' + gate.reason + '"');
      if (typeof window.roomRungGate === 'function') {
        assert(window.roomRungGate('forge', 1).ok === false,
          'roomRungGate — the gate upgradeRoom enforces with — still passes the Forge at server rung 1');
      }
      // The card a player looks at.
      if (typeof H.roomDescriptor === 'function' && window.ROOMS && window.ROOMS.forge) {
        const d = H.roomDescriptor('forge');
        assert(d && d.state === 'locked', 'the Forge room card state is "' + (d && d.state) + '", not "locked"');
        assert(/Farmstead/.test((d && d.lockReason) || ''),
          'the Forge card must state the property requirement; got "' + (d && d.lockReason) + '"');
      }
      // The offer. THE OTHER HALF OF THE TRAP: at a forged tier 2 the card
      // offered the rung above 2, so the rung he was missing was unbuyable.
      const nxt = H.nextTier();
      assert(nxt && nxt.id === 'farmstead',
        'Upgrade Property must offer the rung he is MISSING (property.farmstead); got property.' + (nxt && nxt.id));
      // And everything else the one integer gates.
      assert(H.maxPlots() === H.TIERS[1].plots, 'the plot cap did not conform to the server rung: ' + H.maxPlots());
      assert(H.workerSlots() === 1, 'the crew cap did not conform to the server rung: ' + H.workerSlots());
    } finally {
      P.__resetPropertyRecord(prev.tier, prev.workers);
      restoreG(snap);
    }
  }),

  () => tryRun('PROP-TRUTH-2 (b502): the b492 case still heals UPWARD — residue 0 + server rung 1 is still a Homestead', () => {
    /* The regression this fix must not trade away. b492 shipped because a lost
       residue save demoted a paid Homestead to the camp (worker cap 0 beside a
       hired worker, 2 plots instead of 4). Making the record authoritative in
       BOTH directions must not weaken the direction that already worked. */
    const P = window.HearthriseProperty;
    const H = window.HearthriseHomestead;
    if (!P || !H) return;
    const prev = P.__resetPropertyRecord();
    const snap = snapshotG();
    try {
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 0 };
      P.notePropertyUnlocks({ ok: true, progress_truncated: false, progress: [
        { kind: 'unlock', key: 'property:homestead', value: 1, period: '' },
      ] });
      const r = P.healPropertyTier(window.G);
      assert(r.healed === true && r.tier === 1 && !r.lowered,
        'the upward heal regressed: ' + JSON.stringify(r));
      assert(H.getTier() === 1 && window.G.homestead.tier === 1,
        'residue 0 + server rung 1 must still resolve (and persist) as 1; got ' + H.getTier());
      assert(H.maxPlots() === H.TIERS[1].plots && H.workerSlots() >= 1,
        'the plot/crew caps did not follow the upward heal');
    } finally {
      P.__resetPropertyRecord(prev.tier, prev.workers);
      restoreG(snap);
    }
  }),

  () => tryRun('PROP-TRUTH-3 (b502): an envelope that never DECLARED its completeness may raise a rung and may never lower one', () => {
    /* THE REGRESSION THIS TEST EXISTS FOR, found by this very suite hours after
       the first cut of b502 landed. `isCompleteStatement` was written as
       "`progress_truncated !== true`" — an ABSENT flag counted as a COMPLETE
       answer. One envelope fixture elsewhere in this file carries a filler
       `progress: []` and applies it through the real applyEnvelopeState; under
       that rule it read as "this player owns no property", conformed the tier to
       0, and left it there. Two unrelated tests went red on capabilities their
       own seed had paid for — `b354` (the Build button: "an affordable rung must
       be buildable from the bar") and `WORKER-LEDGER-1` ("hire should succeed").

       A fixture found it. The CLASS is not fixtures: any body carrying a PARTIAL
       `progress` array without saying so — a lean or legacy response, a
       hand-assembled one, a future caller building an envelope by hand — would
       demote a real manor owner to the Wanderer's Camp. That is b492's P1 rebuilt
       from the other side, and the precise hazard b492's header refused
       server-only over.

       REQUIRING THE FLAG IS FREE IN PRODUCTION, and it is measured rather than
       assumed: every response envelope is hr_state_of verbatim, hr_state_of
       builds `progress` and `progress_truncated` in the same jsonb_build_object,
       a migration guard fails the deploy if its body lacks either, and
       tests/goal-counters.mjs G7 asserts the value arrives as `false` off the
       real migration chain. So RAISING is untouched, and LOWERING — the one
       direction that can take a capability away — now requires the server to have
       said, in the same breath, that it was telling the whole story. */
    const P = window.HearthriseProperty;
    const H = window.HearthriseHomestead;
    if (!P || !H) return;
    const prev = P.__resetPropertyRecord();
    const snap = snapshotG();
    try {
      // (a) A bare array must NOT lower. This is the exact shape that went red.
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 4 };
      P.notePropertyUnlocks({ ok: true, progress: [] });      // no completeness claim
      assert(H.getTier() === 4, 'an envelope that never declared its completeness DEMOTED a property '
        + 'owner to ' + H.getTier() + ' — a filler `progress: []` was read as "you own nothing"');
      assert(P.propertyTierExact() === false,
        'an undeclared statement was recorded as EXACT, so it is licensed to lower a rung it never measured');

      // (b) …but it must still RAISE. The b492 direction is not what this tightens.
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 0 };
      P.notePropertyUnlocks({ ok: true, progress: [{ kind: 'unlock', key: 'property:homestead', value: 1, period: '' }] });
      assert(H.getTier() === 1 && window.G.homestead.tier === 1,
        'an undeclared envelope must still raise a stale residue; got ' + H.getTier());

      // (c) …and it must not BLUNT an exact reading already in hand, or paione
      //     would stop being healed the moment any lean body landed after boot.
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 2 };
      P.notePropertyUnlocks({ ok: true, progress_truncated: false,
        progress: [{ kind: 'unlock', key: 'property:homestead', value: 1, period: '' }] });
      P.notePropertyUnlocks({ ok: true, progress: [] });      // declares nothing
      assert(H.getTier() === 1 && P.propertyTierExact() === true,
        'an undeclared envelope blunted an EXACT reading (tier ' + H.getTier()
        + ', exact=' + P.propertyTierExact() + ')');
    } finally {
      P.__resetPropertyRecord(prev.tier, prev.workers);
      restoreG(snap);
    }
  }),

  () => tryRunAsync('PROP-REFUSE-2 (b502): a prereq_property_tier refusal on the ROOM path names the property AND teaches the client the true rung', async () => {
    /* THE SELF-HEAL FOR A SESSION WHOSE ENVELOPE NEVER CARRIED THE ROW. `have`
       in a prereq_property_tier refusal IS hr_unlock_buy's own
       max(value) over namespace 'property' — the number that just refused the
       build. Ingesting it means the FIRST refused click corrects the House card,
       locks the room and re-points the upgrade offer, instead of the player
       clicking into the same refusal ten times in nine minutes. */
    const H = window.HearthriseHomestead;
    const P = window.HearthriseProperty;
    if (!P || !H || typeof window.upgradeRoom !== 'function' || !window.ROOMS || !window.ROOMS.forge) return;
    const snap = snapshotG();
    const origGold = window.HearthriseGold, origNotify = window.notify;
    const prev = P.__resetPropertyRecord();
    const said = [];
    let sentOffer = null;
    try {
      P.__resetPropertyRecord();                   // UNKNOWN: no envelope this session
      window.G.homestead = { tier: 2 };            // the forged residue — the client gate passes
      assert(H.serverRungKnown() === false,
        'SETUP: the record must be UNKNOWN here, or the "learned from the refusal" half below proves nothing');
      assert(H.canBuildRoom('forge').pending === true,
        'with no server statement the gate is answering from the residue cache and must SAY so (pending)');
      window.G.rooms = {};
      window.G.stats = window.G.stats || {}; window.G.stats.roomsBuilt = 0;
      window.G.gold = 500000;
      const cost = window.ROOMS.forge.levels[0].cost || {};
      const inv = {}; Object.keys(cost).forEach(function (k) { if (k !== 'gold') inv[k] = (cost[k] || 0) + 10; });
      window.G.inventory = Object.assign({}, window.G.inventory, inv);
      stampBalanceLikeLoad(window.G);
      window.notify = function (m, k) { said.push({ m: String(m), k: k }); };
      window.HearthriseGold = Object.assign({}, origGold, {
        isGoldIntentEnabled: function () { return true; },
        newIntentKey: function () { return 'k-prereq-tier'; },
        buyUnlock: function (offer, key) {
          sentOffer = offer;
          // The live verdict, verbatim from hr_rejections 2026-09-04.
          return Promise.resolve({ outcome: 'refused', reason: 'prereq_property_tier', verb: 'unlock_buy', key: key,
            body: { ok: false, error: 'prereq_property_tier',
                    detail: { have: 1, need: 2, offer: 'room.forge.1' } } });
        },
      });
      window.upgradeRoom('forge');
      await new Promise(function (r) { setTimeout(r, 30); });

      assert(sentOffer === 'room.forge.1', 'the room build must send offer room.forge.1; got ' + sentOffer);
      assert(!(window.G.rooms && window.G.rooms.forge > 0), 'a refused room was shown built');
      assert((window.G.stats.roomsBuilt || 0) === 0, 'a refused room build incremented roomsBuilt');
      // (1) THE SENTENCE — it must name the property, not print a code.
      const refusal = said.filter(function (s) { return s.k === 'kill'; });
      assert(refusal.some(function (s) { return /Farmstead/.test(s.m); }),
        'the refusal must NAME the property the Forge needs; saw ' + JSON.stringify(said));
      assert(!said.some(function (s) { return /prereq_property_tier/.test(s.m); }),
        'a refusal is a sentence to the player, not an error code; saw ' + JSON.stringify(said));
      // (2) THE LEARNING — the client now knows the rung the server just stated.
      assert(P.serverPropertyTier() === 1,
        'the client did not learn the server rung from the refusal (got ' + P.serverPropertyTier()
        + ') — the player would keep clicking into the same "no"');
      assert(H.getTier() === 1, 'the tier did not conform to the rung the refusal stated; got ' + H.getTier());
      assert(window.G.homestead.tier === 1, 'the learned rung was not written back into the residue');
      // (3) AND THE SCREEN IS HONEST AFTERWARDS.
      const after = H.canBuildRoom('forge');
      assert(after.ok === false, 'the Forge is still offered as buildable after the refusal');
      assert(after.pending === false,
        'the refusal taught the record the true rung, so the gate is no longer provisional');
      const nxt = H.nextTier();
      assert(nxt && nxt.id === 'farmstead',
        'after the refusal the upgrade must offer the missing rung; got property.' + (nxt && nxt.id));
    } finally {
      window.HearthriseGold = origGold; window.notify = origNotify;
      P.__resetPropertyRecord(prev.tier, prev.workers);
      restoreG(snap);
    }
  }),

  () => tryRunAsync('PROP-OK-1 (b500): a server-CONFIRMED property upgrade advances the tier EXACTLY once', async () => {
    const H = window.HearthriseHomestead;
    if (!H || typeof H.upgradeProperty !== 'function') return;
    const snap = snapshotG();
    const origGold = window.HearthriseGold, origNotify = window.notify;
    const propRec = window.HearthriseProperty;
    const prevProp = (propRec && typeof propRec.__resetPropertyRecord === 'function') ? propRec.__resetPropertyRecord() : null;
    const said = [];
    let buyCalls = 0;
    try {
      window.G.homestead = { tier: 1 };                 // homestead → next is property.farmstead
      window.G.gold = 500000;
      window.G.inventory = Object.assign({}, window.G.inventory,
        { oak_log: 500, copper_ore: 500, wolf_pelt: 20, cooked_shrimp: 500 });
      stampBalanceLikeLoad(window.G);
      window.notify = function (m, k) { said.push({ m: String(m), k: k }); };
      window.HearthriseGold = Object.assign({}, origGold, {
        isGoldIntentEnabled: function () { return true; },
        newIntentKey: function () { return 'k-prop-ok'; },
        buyUnlock: function (offer, key) {
          buyCalls++;
          return Promise.resolve({ outcome: 'applied', reason: null, verb: 'unlock_buy', key: key,
            body: { ok: true, verb: 'unlock_buy' } });
        },
      });
      const before = H.getTier();
      H.upgradeProperty();
      await new Promise(function (r) { setTimeout(r, 30); });
      assert(buyCalls === 1, 'a confirmed upgrade must purchase exactly once; got ' + buyCalls);
      assert(H.getTier() === before + 1, 'a confirmed upgrade must advance the tier by exactly one; from '
        + before + ' to ' + H.getTier());
      assert(window.G.homestead.tier === 2, 'the residue tier must be 2 after confirmation; got ' + window.G.homestead.tier);
      assert(said.some(function (s) { return /built!/.test(s.m) && s.k === 'levelup'; }),
        'a confirmed upgrade must celebrate the build; saw ' + JSON.stringify(said));
    } finally {
      window.HearthriseGold = origGold; window.notify = origNotify;
      if (prevProp && propRec) { try { propRec.__resetPropertyRecord(prevProp.tier, prevProp.workers); } catch (e) {} }
      restoreG(snap);
    }
  }),

  () => tryRunAsync('ROOM-REFUSE-1 (b500): a server-REFUSED room build shows NO room and speaks the refusal', async () => {
    if (typeof window.upgradeRoom !== 'function' || !window.ROOMS || !window.ROOMS.forge
        || !window.ROOMS.forge.levels || !window.ROOMS.forge.levels[0]) return;
    const snap = snapshotG();
    const origGold = window.HearthriseGold, origNotify = window.notify;
    const propRec = window.HearthriseProperty;
    const prevProp = (propRec && typeof propRec.__resetPropertyRecord === 'function') ? propRec.__resetPropertyRecord() : null;
    const said = [];
    let sentOffer = null;
    try {
      window.G.homestead = { tier: 2 };                 // Farmstead — the Forge's own tier (client gate passes)
      window.G.rooms = {};
      window.G.stats = window.G.stats || {}; window.G.stats.roomsBuilt = 0;
      window.G.gold = 500000;
      const cost = window.ROOMS.forge.levels[0].cost || {};
      const inv = {}; Object.keys(cost).forEach(function (k) { if (k !== 'gold') inv[k] = (cost[k] || 0) + 10; });
      window.G.inventory = Object.assign({}, window.G.inventory, inv);
      stampBalanceLikeLoad(window.G);
      window.notify = function (m, k) { said.push({ m: String(m), k: k }); };
      const costItem = Object.keys(cost).filter(function (k) { return k !== 'gold'; })[0] || 'copper_ore';
      window.HearthriseGold = Object.assign({}, origGold, {
        isGoldIntentEnabled: function () { return true; },
        newIntentKey: function () { return 'k-room-refuse'; },
        buyUnlock: function (offer, key) {
          sentOffer = offer;
          return Promise.resolve({ outcome: 'refused', reason: 'insufficient_item', verb: 'unlock_buy', key: key,
            body: { ok: false, error: 'insufficient_item', detail: { item_id: costItem, have: 0, need: 1 } } });
        },
      });
      window.upgradeRoom('forge');
      await new Promise(function (r) { setTimeout(r, 30); });
      assert(sentOffer === 'room.forge.1', 'the room build must send offer room.forge.1; got ' + sentOffer);
      assert(!(window.G.rooms && window.G.rooms.forge > 0),
        'THE CLASS: a server-REFUSED room was shown built (G.rooms.forge=' + (window.G.rooms && window.G.rooms.forge) + ')');
      assert((window.G.stats.roomsBuilt || 0) === 0, 'a refused room build incremented roomsBuilt; got ' + window.G.stats.roomsBuilt);
      const refusal = said.filter(function (s) { return s.k === 'kill' && /couldn.t record/i.test(s.m); });
      assert(refusal.length >= 1, 'a refused room build must SURFACE the refusal; saw ' + JSON.stringify(said));
      assert(!said.some(function (s) { return /it's yours|upgraded to/.test(s.m); }), 'a refused room build toasted a success');
    } finally {
      window.HearthriseGold = origGold; window.notify = origNotify;
      if (prevProp && propRec) { try { propRec.__resetPropertyRecord(prevProp.tier, prevProp.workers); } catch (e) {} }
      restoreG(snap);
    }
  }),

  () => tryRunAsync('FORGE-E2E-1 (b500): a REFUSED Farmstead leaves the Forge honestly BLOCKED ("build the Farmstead first"), not silently buildable', async () => {
    // THE EXACT PLAYER-REPORT-#1 SCENARIO, end to end. Client shows 4 Wolf Pelt,
    // the server settled 3, so the Farmstead upgrade is refused. The tier must
    // stay 1 (fix #1) so the Forge — which needs the Farmstead (tier 2) — is
    // gated CLIENT-SIDE with an honest message and never reaches the server.
    const H = window.HearthriseHomestead;
    if (!H || typeof H.upgradeProperty !== 'function' || typeof window.upgradeRoom !== 'function'
        || !window.ROOMS || !window.ROOMS.forge) return;
    const snap = snapshotG();
    const origGold = window.HearthriseGold, origNotify = window.notify;
    const propRec = window.HearthriseProperty;
    const prevProp = (propRec && typeof propRec.__resetPropertyRecord === 'function') ? propRec.__resetPropertyRecord() : null;
    const said = [];
    let forgeBuyCalls = 0;
    try {
      window.G.homestead = { tier: 1 };            // Homestead — one short of the Forge's Farmstead
      window.G.rooms = {};
      window.G.stats = window.G.stats || {}; window.G.stats.roomsBuilt = 0;
      window.G.gold = 5000000;
      window.G.inventory = Object.assign({}, window.G.inventory,
        { oak_log: 500, copper_ore: 500, wolf_pelt: 4, cooked_shrimp: 500 });   // client SHOWS 4 pelts
      stampBalanceLikeLoad(window.G);
      window.notify = function (m, k) { said.push({ m: String(m), k: k }); };
      window.HearthriseGold = Object.assign({}, origGold, {
        isGoldIntentEnabled: function () { return true; },
        newIntentKey: function () { return 'k-forge-e2e'; },
        buyUnlock: function (offer, key) {
          if (offer === 'room.forge.1') { forgeBuyCalls++; return Promise.resolve({ outcome: 'applied', body: { ok: true } }); }
          // the Farmstead: refused, the server has only 3 Wolf Pelt
          return Promise.resolve({ outcome: 'refused', reason: 'insufficient_item', verb: 'unlock_buy', key: key,
            body: { ok: false, error: 'insufficient_item', detail: { item_id: 'wolf_pelt', have: 3, need: 4 } } });
        },
      });
      H.upgradeProperty();                          // attempt the Farmstead → refused
      await new Promise(function (r) { setTimeout(r, 30); });
      assert(H.getTier() === 1, 'a REFUSED Farmstead must leave the player at tier 1 (not the optimistic 2); got ' + H.getTier());
      const ret = window.upgradeRoom('forge');      // now try the Forge
      await new Promise(function (r) { setTimeout(r, 20); });
      assert(ret === false, 'the Forge must be refused at tier 1; got ' + ret);
      assert(forgeBuyCalls === 0,
        'THE FIX: the Forge must NOT reach the server at tier 1 — it is gated on the property tier client-side; '
        + 'buyUnlock(room.forge.1) fired ' + forgeBuyCalls + ' time(s)');
      assert(!(window.G.rooms && window.G.rooms.forge > 0), 'the Forge must not be shown built');
      assert(said.some(function (s) { return /Farmstead/.test(s.m); }),
        'the player must be told to build the Farmstead first — the honest block, not a silent fail; saw ' + JSON.stringify(said));
    } finally {
      window.HearthriseGold = origGold; window.notify = origNotify;
      if (prevProp && propRec) { try { propRec.__resetPropertyRecord(prevProp.tier, prevProp.workers); } catch (e) {} }
      restoreG(snap);
    }
  }),

  () => tryRunAsync('BANK-REFUSE-1 (b500): a server-REFUSED bank expansion does NOT advance goldBuys and says why', async () => {
    if (typeof window.buyBankSpaceGold !== 'function') return;
    /* goldBuys is carried UNTOUCHED by reconcileBank (the item store) — so an
       optimistic ++ on a refusal is a rung the realm never sold. Since SA-010 the
       counter IS restored, but only from the server's own `unlock` row
       (reconcileBankRungs), which a refusal never writes: the advance must not
       happen here either way. */
    const snap = snapshotG();
    const origGold = window.HearthriseGold, origNotify = window.notify;
    const origSave = window.saveLocal, origTop = window.updateTopbar, origInv = window.renderInventory;
    const said = [];
    let sentOffer = null;
    try {
      window.G.bank = { goldBuys: 3 };
      window.G.gold = 5000000;
      stampBalanceLikeLoad(window.G);
      window.notify = function (m, k) { said.push({ m: String(m), k: k }); };
      window.saveLocal = function () {}; window.updateTopbar = function () {}; window.renderInventory = function () {};
      window.HearthriseGold = Object.assign({}, origGold, {
        isGoldIntentEnabled: function () { return true; },
        newIntentKey: function () { return 'k-bank-refuse'; },
        buyUnlock: function (offer, key) {
          sentOffer = offer;
          return Promise.resolve({ outcome: 'refused', reason: 'insufficient_gold', verb: 'unlock_buy', key: key,
            body: { ok: false, error: 'insufficient_gold', detail: { have: 1, need: 999999999 } } });
        },
      });
      const before = window.G.bank.goldBuys;
      window.buyBankSpaceGold();
      await new Promise(function (r) { setTimeout(r, 30); });
      assert(sentOffer === 'bank.3', 'the bank buy must send offer bank.<owned> = bank.3; got ' + sentOffer);
      assert(window.G.bank.goldBuys === before,
        'THE CLASS: a server-REFUSED bank expansion advanced goldBuys from ' + before + ' to ' + window.G.bank.goldBuys
        + ' (a stranded residue counter — bank space the realm never granted)');
      const refusal = said.filter(function (s) { return s.k === 'kill' && /couldn.t record/i.test(s.m); });
      assert(refusal.length >= 1, 'a refused bank expansion must SURFACE the refusal; saw ' + JSON.stringify(said));
      assert(!said.some(function (s) { return /Bank expanded/.test(s.m); }), 'a refused bank expansion toasted "Bank expanded"');
    } finally {
      window.HearthriseGold = origGold; window.notify = origNotify;
      window.saveLocal = origSave; window.updateTopbar = origTop; window.renderInventory = origInv;
      restoreG(snap);
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     SA-010 — PURCHASED BANK SPACE IS FORGOTTEN ON RELOAD (Q-4, live P1)
     ══════════════════════════════════════════════════════════════════════════
     THE PLAYER'S REPORT: the bank cap snaps back to the 100 base after a reload,
     "Bank full" nags start with paid space unused, and Buy must be pressed once
     per already-owned rung, each answering "That bank space is already yours."

     TWO INDEPENDENT FAULTS, one per test below.
       (a) The fresh-G literal declared `bank:` TWICE — the documented b269
           defaults at the top and a bare `bank:{}` twelve lines down. Last key
           wins, so the defaults never existed. Invisible at runtime everywhere
           except the frozen literal snapshot, because ensureSave() Object.assigns
           them back on every load — which is why this is graded against
           `window.__FRESH_START`, taken before boot and before any load.
       (b) NOTHING RESTORED THE COUNTERS. `bank` is on no record and in no
           RESIDUE_FIELDS, so under the allowlist persistence `G.bank.goldBuys`
           read 0 on every reload; the purchased ladder lives in the server's
           `unlock` rows and no client reader shaped them back. The cap is a pure
           function of that counter (bankCap()), so losing it loses the space.
     ══════════════════════════════════════════════════════════════════════════ */

  () => tryRun('SA010-1 (Q-4a): the fresh-G literal declares `bank` ONCE, with the b269 defaults', () => {
    const F = window.__FRESH_START;
    assert(F && typeof F === 'object', 'window.__FRESH_START is missing');
    assert(F.bank && typeof F.bank === 'object',
      'the fresh-character literal no longer snapshots `bank` — SA010-1 cannot see the duplicate-key class it '
      + 'was written for');
    assert(F.bank.goldBuys === 0 && F.bank.gemBuys === 0 && F.bank.grandfather === 0,
      'THE BUG (SA-010a): the fresh G literal\'s `bank` is ' + JSON.stringify(F.bank) + ' — the documented b269 '
      + 'defaults {goldBuys,gemBuys,grandfather} are NOT there, which means a SECOND `bank:` key in the literal is '
      + 'shadowing the first one (last key wins) and the bank-space state has no declared shape at all');
    assert('grandfather' in F.bank,
      'the b269 grandfather allowance is gone from the fresh literal — the v10→v11 "nobody worse off" migration '
      + 'has nowhere to land');
  }),

  () => tryRunAsync('SA010-2 (Q-4b): purchased bank rungs come back from the SERVER after a reload', async () => {
    const A = window.HearthriseAccrual;
    if (!A || typeof A.reconcileBankRungs !== 'function') {
      assert(false, 'HearthriseAccrual.reconcileBankRungs is missing — nothing restores the purchased bank ladder from the server envelope, so every rung is forgotten on reload (SA-010)');
      return;
    }
    if (typeof window.bankCap !== 'function' || typeof window.buyBankSpaceGold !== 'function') return;
    const SLOTS = (window.BANK_SPACE && window.BANK_SPACE.gold.slots) || 20, BASE = (window.BANK_SPACE && window.BANK_SPACE.BASE_CAP) || 100;
    const envelope = () => bankEnv(BASE + 2 * SLOTS, 2);   // two purchased gold rungs, and the cap they bought
    const snap = snapshotG();
    const origGold = window.HearthriseGold, origNotify = window.notify, origSave = window.saveLocal,
      origTop = window.updateTopbar, origInv = window.renderInventory;
    try {
      // THE RELOAD: what ensureSave() leaves — zero rungs, no cap stated yet.
      window.G.bank = { goldBuys: 0, gemBuys: 0, grandfather: 0 };
      delete window.G._bankCap;
      assert(window.bankCap() === BASE,
        'the pre-condition is wrong: a zero-rung bank should cap at the base ' + BASE + ', got ' + window.bankCap());

      A.reconcileBankRungs(window.G, envelope());
      assert(window.G.bank.goldBuys === 2, 'THE BUG (SA-010b): the server states two purchased bank rungs and the client still holds '
        + window.G.bank.goldBuys + ' — the paid space is gone on every reload');
      const capAfterReload = window.bankCap();
      assert(capAfterReload === BASE + 2 * SLOTS, 'the restored cap is ' + capAfterReload + ', expected ' + (BASE + 2 * SLOTS)
        + ' — the bag draws the cap the realm projects (state.bank_cap → G._bankCap), so the envelope\'s statement did not reach it');

      // RELOAD AGAIN (the repro): same envelope → same cap, and never compounded.
      window.G.bank = { goldBuys: 0, gemBuys: 0, grandfather: 0 };
      A.reconcileBankRungs(window.G, envelope());
      assert(window.bankCap() === capAfterReload, 'a second reload settled on a DIFFERENT cap ('
        + window.bankCap() + ' vs ' + capAfterReload + ') — the restore is not deterministic');
      A.reconcileBankRungs(window.G, envelope());
      assert(window.G.bank.goldBuys === 2,
        're-applying one envelope compounded the rungs to ' + window.G.bank.goldBuys + ' — not idempotent');

      // ABSENCE IS NOT A CLAIM: a lean envelope must not delete the ladder.
      A.reconcileBankRungs(window.G, { ok: true, state: {} });
      assert(window.G.bank.goldBuys === 2,
        'an envelope with no `progress` array wiped the purchased rungs — absence is not a statement of zero');

      // THE PLAYER-VISIBLE HALF: Buy must ask for the rung ABOVE the ones owned.
      let sentOffer = null;
      window.notify = function () {}; window.saveLocal = function () {};
      window.updateTopbar = function () {}; window.renderInventory = function () {};
      window.G.gold = 5000000;
      stampBalanceLikeLoad(window.G);
      window.HearthriseGold = Object.assign({}, origGold, {
        isGoldIntentEnabled: function () { return true; },
        newIntentKey: function () { return 'k-sa010'; },
        buyUnlock: function (offer, key) { sentOffer = offer;
          return Promise.resolve({ outcome: 'applied', verb: 'unlock_buy', key: key, body: { ok: true } }); },
      });
      window.buyBankSpaceGold();
      await new Promise(function (r) { setTimeout(r, 30); });
      assert(sentOffer === 'bank.2', 'THE NAG: after a reload the Buy button asked the server for ' + sentOffer
        + ' instead of bank.2 — every offer at or below an owned rung is refused `already_owned` ("That bank space '
        + 'is already yours"), one press wasted per rung the player already paid for');
      /* A RECEIPT IS "AT LEAST", NOT "ONE MORE": the buy's own confirm envelope
         has already written the server's rung by the time the callback runs, so
         the local advance must be idempotent rather than a blind ++. */
      assert(window.G.bank.goldBuys === 3,
        'a confirmed purchase of bank.2 must leave exactly 3 rungs; got ' + window.G.bank.goldBuys);
      A.reconcileBankRungs(window.G, bankEnv(BASE + 3 * SLOTS, 3));
      assert(window.G.bank.goldBuys === 3,
        'the confirm envelope and the local advance double-counted the rung (' + window.G.bank.goldBuys + ')');
    } finally {
      window.HearthriseGold = origGold; window.notify = origNotify; window.saveLocal = origSave;
      window.updateTopbar = origTop; window.renderInventory = origInv;
      restoreG(snap);
    }
  }),

  () => tryRun('SA010-3: the server rung out-ranks the client in BOTH directions (the deadlock class)', () => {
    /* The property-tier deadlock, one ladder over. A client sitting ABOVE the
       server (the pre-b500 optimistic `goldBuys++` whose refusal was swallowed)
       asks for a rung hr_unlock_buy refuses on rung ORDER — a bank that can
       never be expanded again — so a raise-only heal would preserve the lie
       forever. A COMPLETE projection therefore SETS; a truncated one is a floor. */
    const A = window.HearthriseAccrual;
    if (!A || typeof A.reconcileBankRungs !== 'function') return;
    const row = (v) => [{ kind: 'unlock', key: 'bank', value: v, period: '' }];

    const ahead = { bank: { goldBuys: 4, gemBuys: 1, grandfather: 7 } };
    A.reconcileBankRungs(ahead, { ok: true, progress: row(1), progress_truncated: true });
    assert(ahead.bank.goldBuys === 4,
      'a TRUNCATED `progress` projection lowered the rungs to ' + ahead.bank.goldBuys
      + ' — a clipped window may raise but never lower');

    A.reconcileBankRungs(ahead, { ok: true, progress: row(1), progress_truncated: false });
    assert(ahead.bank.goldBuys === 1,
      'a COMPLETE projection did not lower a client-ahead ladder (' + ahead.bank.goldBuys + ') — that is the '
      + 'residue-ahead deadlock: every subsequent buy bounces off the server\'s rung order, forever');
    assert(ahead.bank.gemBuys === 1 && ahead.bank.grandfather === 7,
      'the rung reader touched a counter the server does not state — gemBuys/grandfather have no server row and '
      + 'must be left exactly alone');

    // A PRESENT array with no bank row is a real "bought none yet", not UNKNOWN.
    const none = { bank: { goldBuys: 2 } };
    A.reconcileBankRungs(none, { ok: true, progress: [{ kind: 'unlock', key: 'worker_hire', value: 1, period: '' }], progress_truncated: false });
    assert(none.bank.goldBuys === 0,
      'a complete projection with no `bank` row means the player owns no rung; got ' + none.bank.goldBuys);
  }),

  /* regression suite — THE CAP, NOT THE RUNG. `bankCap()` summed THREE client-held
     counters; only `goldBuys` is server-stated, so the other two gated a SERVER
     capability both ways, all session (§6). Why: accrue.js noteServerBankCap. */
  () => tryRun('SA010-4 (b537): the bag draws the cap the REALM enforces, in both directions — client counters cannot move it', () => {
    const A = window.HearthriseAccrual, BS = window.BANK_SPACE;
    if (!A || typeof A.reconcileBankRungs !== 'function' || !BS) return;
    if (typeof window.bankCap !== 'function' || typeof window.bankGoldCost !== 'function') return;
    const BASE = BS.BASE_CAP, SLOTS = BS.gold.slots, TWO = BASE + 2 * SLOTS;
    const rung3 = Math.round(BS.gold.base * Math.pow(BS.gold.growth, 2));
    const snap = snapshotG();
    try {
      // THE CENSUS SHAPE: the old reader summed these to 100+5*20+1*60+80 = 340.
      window.G.bank = { goldBuys: 5, gemBuys: 1, grandfather: 80 };
      delete window.G._bankCap;

      // (a) NOTHING STATED YET → the BASE cap, never the counters.
      assert(window.bankCap() === BASE, 'THE CLASS (fail-safe): with no statement from the realm the bag capped at '
        + window.bankCap() + ' instead of the base ' + BASE + ' — client-held counters are drawing space nobody '
        + 'sold, and every item-touching apply past the server\'s own cap is refused `bank_full`, whole delta and all');

      // (b) THE REALM STATES CAP AND RUNG in one body, as hr_state_of does.
      A.reconcileBankRungs(window.G, bankEnv(TWO, 2));
      assert(window.bankCap() === TWO, 'THE CLASS (client ahead): the realm enforces bank_cap ' + TWO
        + ' and the bag drew ' + window.bankCap() + ' — a bag the player is shown and then refused');

      // (c) THE PRICING HALF IS UNTOUCHED: two owned → the next offer is bank.2.
      assert(window.G.bank.goldBuys === 2, 'the rung reader stopped conforming goldBuys (' + window.G.bank.goldBuys
        + ') — the Buy button would ask for a rung the realm already sold and be refused `already_owned`, once each');
      assert(window.bankGoldCost() === rung3,
        'the next rung is priced at ' + window.bankGoldCost() + ', not the third rung\'s ' + rung3);

      // (d) ABSENCE IS NOT A CLAIM: wiping a KNOWN cap is this bug, other way round.
      A.reconcileBankRungs(window.G, { ok: true, progress: [], progress_truncated: false });
      assert(window.bankCap() === TWO, 'a body carrying no `state.bank_cap` reset the known cap to '
        + window.bankCap() + ' — absence is not a statement of the base');

      // (e) THE REALM ABOVE THE CLIENT (bank-cap-rungs B4): no sum reaches it.
      A.reconcileBankRungs(window.G, bankEnv(5000, 2));
      assert(window.bankCap() === 5000, 'THE CLASS (realm ahead): the realm holds 5000 stacks open and the bag drew '
        + window.bankCap() + ' — an imported or grandfathered cap is nagged "Bank full" on space already paid for');
    } finally { restoreG(snap); }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     THE GEM-UNLOCK BATTERY — OWNERSHIP IS THE REALM'S ANSWER
     ══════════════════════════════════════════════════════════════════════════
     WHAT THIS REPLACED AND WHY. b500 swept "optimistic-apply, swallowed-
     rejection" and walked past three GEM sites because the sweep was
     GOLD-shaped. The tests that caught up with it pinned a REFUSAL: with no
     server verb in existence, the honest behaviour of buyTheme / buyCosmetic was
     to decline the gesture and spend nothing. Their own header said the
     confirmed purchase would be "a new test, not an edit to these".

     This is that new test. hr_buy_gem_unlock is APPLIED (2026-09-14), so the two
     purchase twins are WIRED: they send an intent, debit nothing locally, and
     take ownership from the envelope. `ownedThemes` / `ownedCosmetics` left
     RESIDUE_FIELDS in the same build, so there is exactly ONE answer to "do you
     own this" and it is the realm's.

     THE MECHANISM THESE STILL PIN, because it has not changed: `gems` is on
     SERVER_OF_RECORD with no dormant gate, so accrue.js writes it ABSOLUTELY on
     every envelope. A local `G.gems -= price` is therefore a PREDICTION the next
     envelope retires — and while the goods lived in a residue bag, the purchase
     became free and repeatable. GEM-BUY-1's "the client debited nothing" arm is
     that bug, stated as a property. The gem ARM GATE itself is still tested, by
     GEM-REFUSE-1 below, for the two sites that still have no verb. */
  () => tryRun('GEM-REFUSE-1: an ARMED gem purchase with NO server verb debits no gems and grants no bank rung', () => {
    if (typeof window.buyBankSpaceGem !== 'function') return;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField, origNotify = window.notify;
    const origSave = window.saveLocal, origTop = window.updateTopbar, origInv = window.renderInventory;
    const said = [];
    try {
      /* ARMED: the server owns the gem balance. This is production today. */
      window.clientMayWriteRecordField = function (f) { return f !== 'gems'; };
      window.notify = function (m, k) { said.push({ m: String(m), k: k }); };
      window.saveLocal = function () {}; window.updateTopbar = function () {}; window.renderInventory = function () {};

      window.G.gems = 100000;
      stampBalanceLikeLoad(window.G);   // affordability must read a KNOWN balance, or it refuses for the WRONG reason
      window.G.bank = { goldBuys: 0, gemBuys: 0, grandfather: 0 };
      const gems0 = window.G.gems, rung0 = window.G.bank.gemBuys;

      /* THE BANK GEM RUNG — the one purchase twin still without a verb, because
         there is no `bank.gem.<n>` rung in any catalogue to point one at. Until
         there is, refusing by name is the shipped behaviour and this is its
         contract. */
      const ret = window.buyBankSpaceGem();
      assert(ret === false, 'a refused gem bank expansion must report false, got ' + ret);
      assert(window.G.gems === gems0,
        'THE CLASS: an armed buyBankSpaceGem debited ' + (gems0 - window.G.gems) + ' gems the server '
        + 'never saw — the next envelope refunds them and the rung stays. That is the free-purchase dupe.');
      assert(window.G.bank.gemBuys === rung0,
        'THE CLASS: gemBuys advanced from ' + rung0 + ' to ' + window.G.bank.gemBuys
        + ' — bank space the realm never recorded');

      // AND IT SAYS SO. A silent no-op is the b494 dead-button bug.
      const refusals = said.filter(function (s) { return s.k === 'kill' && /can.t record/i.test(s.m); });
      assert(refusals.length === 1,
        'a refused gem purchase must SPEAK its refusal — expected 1, saw ' + refusals.length
        + ': ' + JSON.stringify(said));
      assert(!said.some(function (s) { return /Bank expanded/i.test(s.m); }),
        'a refused gem purchase claimed success: ' + JSON.stringify(said));
    } finally {
      window.clientMayWriteRecordField = origMay; window.notify = origNotify;
      window.saveLocal = origSave; window.updateTopbar = origTop; window.renderInventory = origInv;
      restoreG(snap);
    }
  }),

  /* ── THE HAPPY PATH, PLAYED ─────────────────────────────────────────────────
     A player with gems buys Forest Lodge. Everything a top-tier review would ask
     of a premium purchase is asserted here: ONE intent per gesture, no number on
     the wire, no local debit, ownership from the envelope, and the thing equips.
     The price fixture comes from the AUTHORED table — a hardcoded 500 goes green
     on the day a Designer reprices Forest Lodge and silently stops testing that
     the gesture matches the quote. */
  () => tryRunAsync('GEM-BUY-1: buying a theme sends ONE intent carrying no price, debits nothing locally, and takes ownership from the envelope', async () => {
    if (typeof window.buyTheme !== 'function' || typeof window.ownsGemUnlock !== 'function') return;
    const snap = snapshotG();
    const prevGC = window.HearthriseGoalClaim, prevRec = window.HearthriseRecord;
    const origNotify = window.notify, origSave = window.saveLocal;
    const origTop = window.updateTopbar, origHouse = window.renderHouse;
    const sent = [], said = [];
    try {
      const theme = (window.HOUSE_THEMES || []).find(function (t) { return t.currency === 'gem'; });
      assert(theme, 'the fixture needs a gem-priced theme in HOUSE_THEMES (window.HOUSE_THEMES)');
      window.notify = function (m, k) { said.push({ m: String(m), k: k }); };
      window.saveLocal = function () {}; window.updateTopbar = function () {}; window.renderHouse = function () {};
      window.HearthriseRecord = Object.assign({}, prevRec, { requestRecord: function () { return Promise.resolve(null); } });
      window.HearthriseGoalClaim = Object.assign({}, prevGC, {
        buyGemUnlock: function () {
          sent.push(Array.prototype.slice.call(arguments));
          return Promise.resolve({
            ok: true, unlock_id: 'theme:' + theme.id, name: theme.name, currency: 'gems',
            cost: theme.price, gems: 4242, version: 9, slot: 0,
            gem_unlocks: ['theme:default', 'theme:' + theme.id]
          });
        }
      });

      window.G.gems = 100000;
      stampBalanceLikeLoad(window.G);
      window.G._gemUnlocks = { owned: ['theme:default'], at: Date.now() };
      window.G.houseTheme = 'default';
      const gems0 = window.G.gems;

      await window.buyTheme(theme.id);

      assert(sent.length === 1, 'exactly ONE purchase intent per gesture — saw ' + sent.length
        + '. Two keys for one tap costs a rate spend and reads to the player as a failure.');
      /* NO PRICE CROSSES. The server reads the cost from public.hr_gem_unlocks
         under the character lock; a number on the wire would be a client
         authoring a permanent capability, which is the thing the verb exists to
         make impossible. */
      assert(sent[0].length === 1 && typeof sent[0][0] === 'string',
        'the transport takes an unlock id and nothing else — got ' + JSON.stringify(sent[0]));
      assert(sent[0][0] === 'theme:' + theme.id,
        'the intent must name the catalogue id `<namespace>:<id>`, got ' + sent[0][0]);
      assert(!sent[0].some(function (a) { return typeof a === 'number'; }),
        'THE CLASS: a NUMBER crossed the wire on a premium purchase — ' + JSON.stringify(sent[0]));

      assert(window.G.gems === gems0,
        'THE CLASS: the client debited ' + (gems0 - window.G.gems) + ' gems itself. gems are '
        + 'SERVER_OF_RECORD and armed, so that is a prediction the next envelope refunds while the '
        + 'theme stays — the b371 dupe.');
      assert(window.ownsGemUnlock('theme', theme.id) === true,
        'ownership must arrive in the ENVELOPE (gem_unlocks) and be adopted — the client no longer '
        + 'has a bag to write, so if the reconcile is skipped the purchase is invisible');
      assert(window.G.houseTheme === theme.id, 'a bought theme equips itself — that is the gesture');
      assert(window.activeHouseTheme() === theme.id,
        'the equipped pointer must survive the fail-closed read: it is owned, so it paints');
      assert(said.some(function (x) { return x.k === 'levelup'; }),
        'a completed purchase must say so: ' + JSON.stringify(said));
      assert(!said.some(function (x) { return x.k === 'kill'; }),
        'a completed purchase raised a failure toast: ' + JSON.stringify(said));
    } finally {
      if (prevGC) window.HearthriseGoalClaim = prevGC; else delete window.HearthriseGoalClaim;
      if (prevRec) window.HearthriseRecord = prevRec; else delete window.HearthriseRecord;
      window.notify = origNotify; window.saveLocal = origSave;
      window.updateTopbar = origTop; window.renderHouse = origHouse;
      restoreG(snap);
    }
  }),

  /* ── THE SAME CONTRACT ON THE OTHER SURFACE, PLUS THE REFUSAL THAT MATTERS ──
     `already_owned` is the answer that makes the ACCOUNT-WIDE ruling real: Hero 2
     opening the shop before its first envelope sees a Buy button, presses it,
     and the realm says "you already have this" and hands back the whole owned
     set. Nothing is charged, and the stale view heals in that one round trip.
     If this test ever goes red the way it can — by that path charging a gem —
     the bug is a 1,200-gem Phoenix Pet sold twice to one person. */
  () => tryRunAsync('GEM-BUY-2: a cosmetic the ACCOUNT already owns is refused, charges nothing, and the refusal heals the view', async () => {
    if (typeof window.buyCosmetic !== 'function' || typeof window.ownsGemUnlock !== 'function') return;
    const snap = snapshotG();
    const prevGC = window.HearthriseGoalClaim, prevRec = window.HearthriseRecord;
    const origNotify = window.notify, origSave = window.saveLocal;
    const origTop = window.updateTopbar, origShop = window.renderShop;
    const sent = [], said = [];
    try {
      window.notify = function (m, k) { said.push({ m: String(m), k: k }); };
      window.saveLocal = function () {}; window.updateTopbar = function () {}; window.renderShop = function () {};
      window.HearthriseRecord = Object.assign({}, prevRec, { requestRecord: function () { return Promise.resolve(null); } });
      window.HearthriseGoalClaim = Object.assign({}, prevGC, {
        buyGemUnlock: function () {
          sent.push(Array.prototype.slice.call(arguments));
          /* The shape hr_buy_gem_unlock returns when the widened (account-wide)
             owned-set read catches a re-buy: an error, WITH the set. */
          return Promise.resolve({
            ok: false, error: 'already_owned', unlock_id: 'cosmetic:pet_phoenix',
            gem_unlocks: ['theme:default', 'cosmetic:pet_phoenix']
          });
        }
      });

      window.G.gems = 100000;
      stampBalanceLikeLoad(window.G);
      /* A character that has NOT heard about the purchase — hero 2's first paint. */
      window.G._gemUnlocks = { owned: ['theme:default'], at: Date.now() };
      const gems0 = window.G.gems;
      assert(window.ownsGemUnlock('cosmetic', 'pet_phoenix') === false,
        'the fixture needs the cosmetic to look UNOWNED before the gesture, or it proves nothing');

      await window.buyCosmetic('pet_phoenix', 1200);

      assert(sent.length === 1, 'the gesture must reach the realm — the client cannot know the '
        + 'account owns it, and guessing is the residue-ahead class');
      assert(window.G.gems === gems0, 'THE CLASS: an already-owned cosmetic charged ' + (gems0 - window.G.gems)
        + ' gems. Account-wide ownership exists precisely so hero 2 is not billed twice.');
      assert(window.ownsGemUnlock('cosmetic', 'pet_phoenix') === true,
        'the refusal carries the owned set and must HEAL the stale view in the same round trip');
      assert(said.some(function (x) { return /already yours/i.test(x.m); }),
        'the player must be told what happened, in plain words: ' + JSON.stringify(said));
      assert(!said.some(function (x) { return x.k === 'kill'; }),
        '"you already own it" is not a failure and must not be shouted as one: ' + JSON.stringify(said));
    } finally {
      if (prevGC) window.HearthriseGoalClaim = prevGC; else delete window.HearthriseGoalClaim;
      if (prevRec) window.HearthriseRecord = prevRec; else delete window.HearthriseRecord;
      window.notify = origNotify; window.saveLocal = origSave;
      window.updateTopbar = origTop; window.renderShop = origShop;
      restoreG(snap);
    }
  }),

  /* THE FREE DEFAULT. The unlock catalogue's own warning is that a zero-priced
     offer is an infinite faucet, so `theme.default` stays a FREE EQUIP and must
     never become a purchase — on either side of the wire. The server refuses the
     free row `not_for_sale`; this pins that the client never posts it at all. */
  () => tryRunAsync('GEM-FREE-1: the default theme is a FREE EQUIP — it posts no purchase and spends nothing', async () => {
    if (typeof window.buyTheme !== 'function') return;
    const snap = snapshotG();
    const prevGC = window.HearthriseGoalClaim;
    const origNotify = window.notify, origSave = window.saveLocal;
    const origTop = window.updateTopbar, origHouse = window.renderHouse;
    const sent = [];
    try {
      window.notify = function () {}; window.saveLocal = function () {};
      window.updateTopbar = function () {}; window.renderHouse = function () {};
      window.HearthriseGoalClaim = Object.assign({}, prevGC, {
        buyGemUnlock: function () { sent.push(Array.prototype.slice.call(arguments)); return Promise.resolve({ ok: false, error: 'not_for_sale' }); }
      });
      window.G.gems = 0; window.G.gold = 12345;
      stampBalanceLikeLoad(window.G);
      /* The projection ALWAYS carries the free rows (hr_gem_unlocks_of unions
         `where g.free`), which is what keeps the starter cottage equippable. */
      window.G._gemUnlocks = { owned: ['theme:default'], at: Date.now() };
      window.G.houseTheme = 'forest';
      const gold0 = window.G.gold, gems0 = window.G.gems;

      await window.buyTheme('default');

      assert(window.G.houseTheme === 'default',
        'the free default must equip — it is the only theme every player owns, and gating it would '
        + 'break the one surface the arm is live on');
      assert(sent.length === 0,
        'THE CLASS: the client posted a PURCHASE for a free row. A zero-priced offer is an infinite '
        + 'faucet (the unlock catalogue says so in those words), which is why there is no zero-gem '
        + 'path on either side — ' + JSON.stringify(sent));
      assert(window.G.gold === gold0, 'the free default must spend no gold (slice 6)');
      assert(window.G.gems === gems0, 'the free default must spend no gems');
    } finally {
      if (prevGC) window.HearthriseGoalClaim = prevGC; else delete window.HearthriseGoalClaim;
      window.notify = origNotify; window.saveLocal = origSave;
      window.updateTopbar = origTop; window.renderHouse = origHouse;
      restoreG(snap);
    }
  }),

  /* ── OWNERSHIP: THE SERVER, AND NOTHING ELSE ────────────────────────────────
     The residue-ahead class with a wardrobe on: a client-held bag asserting
     ownership of a server-sold capability. Before 2026-09-14 a forged
     `G.ownedThemes` entry WAS ownership — it drew "Apply", it passed setTheme,
     and hr_put_client_state stored it verbatim for ever. Both bags are gone, and
     this is the arm that keeps them gone: planting one confers nothing. */
  () => tryRun('GEM-OWN-1: ownership comes ONLY from the server set — a client-held bag confers nothing, and silence is not ownership', () => {
    if (typeof window.ownsGemUnlock !== 'function' || typeof window.setTheme !== 'function') return;
    const snap = snapshotG();
    const origNotify = window.notify, origHouse = window.renderHouse;
    try {
      window.notify = function () {}; window.renderHouse = function () {};

      // 1. NO SERVER ANSWER YET → nothing is owned. "Unknown" renders a live Buy
      //    offer, which the realm heals in one round trip (already_owned). The
      //    other direction — granting on silence — cannot be undone by one.
      delete window.G._gemUnlocks;
      assert(window.ownsGemUnlock('theme', 'forest') === false,
        'an unheard-from projection conferred ownership. Fail to UNKNOWN, never to OWNED.');
      assert(window.ownsGemUnlock('cosmetic', 'pet_phoenix') === false, 'same for cosmetics');
      assert(window.gemUnlocksKnown() === false,
        'gemUnlocksKnown() must be able to tell "not heard" from "heard, and you own nothing" — '
        + 'a surface that cannot make that distinction has to guess');

      /* 2. A CLIENT-HELD BAG IS NOT AN ANSWER. These fields no longer exist in
            the game; a console (or a stale cloud blob) can still type them.
            ⚠ WRITTEN THROUGH A COMPUTED KEY ON PURPOSE, twice over: the field
            names are RETIRED, so a literal `G.ownedThemes =` here would be a
            forgery the arm-homing census reads as the game re-acquiring an
            un-homed field — and the `finally` deletes them, because snapshotG
            no longer carries what no longer exists. */
      const forged = ['ownedThemes', 'ownedCosmetics'];
      window.G[forged[0]] = ['forest', 'volcanic'];
      window.G[forged[1]] = ['pet_phoenix'];
      assert(window.ownsGemUnlock('theme', 'forest') === false,
        'THE CLASS: a client-written bag still conferred ownership of a server-sold capability. '
        + 'That is the b371 dupe\u2019s sticking half and the residue-ahead class in one line.');
      assert(window.ownsGemUnlock('cosmetic', 'pet_phoenix') === false,
        'THE CLASS: a forged cosmetic bag conferred ownership');

      // 3. THE SERVER HAS SPOKEN → its set is the answer, both ways.
      window.G._gemUnlocks = { owned: ['theme:default'], at: Date.now() };
      assert(window.ownsGemUnlock('theme', 'default') === true, 'a theme the server DOES carry is owned');
      assert(window.ownsGemUnlock('theme', 'forest') === false, 'and one it does not carry is not');
      assert(window.gemUnlocksKnown() === true, 'the projection arrived, so ownership is KNOWN');

      // 4. AND THE GATE IS LOAD-BEARING: equipping reads the same one seam.
      window.G.houseTheme = 'default';
      window.setTheme('forest');
      assert(window.G.houseTheme === 'default',
        'setTheme equipped a theme the realm does not record as owned — ownership must be read '
        + 'through ONE seam, not re-derived per caller');
      window.setTheme('default');
      assert(window.G.houseTheme === 'default', 'a server-owned theme must still equip');
    } finally {
      delete window.G.ownedThemes; delete window.G.ownedCosmetics;   // forged above; they are not real fields
      window.notify = origNotify; window.renderHouse = origHouse;
      restoreG(snap);
    }
  }),

  /* ── AND THE PROJECTION NEVER NARROWS ───────────────────────────────────────
     The security condition of this build, and the one failure mode that would
     look to a paying player exactly like theft: an envelope that does not carry
     `gem_unlocks` (an older server body, a partial, a body shaped for another
     verb) must NOT be read as "you own nothing". Absence leaves the last known
     set standing; only a real, present array replaces it. */
  () => tryRun('GEM-NARROW-1: an envelope with no (or garbage) gem_unlocks leaves the owned set exactly as it was', () => {
    const A = window.HearthriseAccrual;
    if (!A || typeof A.reconcileGemUnlocks !== 'function') return;
    const snap = snapshotG();
    try {
      const G = { _gemUnlocks: { owned: ['theme:default', 'theme:forest'], at: 1 } };
      const held = function () { return (G._gemUnlocks.owned || []).join(','); };

      assert(A.reconcileGemUnlocks(G, { ok: true }).mode === 'absent', 'a body with no key is ABSENT, not empty');
      assert(held() === 'theme:default,theme:forest', 'THE CLASS: a body carrying no gem_unlocks de-owned a paid theme');
      A.reconcileGemUnlocks(G, { gem_unlocks: null });
      assert(held() === 'theme:default,theme:forest', 'a null projection de-owned a paid theme');
      A.reconcileGemUnlocks(G, { gem_unlocks: 'theme:forest' });
      assert(held() === 'theme:default,theme:forest', 'a STRING is not the array shape and must be ignored, not parsed');
      A.reconcileGemUnlocks(G, { gem_unlocks: {} });
      assert(held() === 'theme:default,theme:forest', 'an object is not the array shape');

      /* PRESENT AND WELL-FORMED → absolute. The server always projects the free
         rows, so a shorter set is a real revoke and the client does not vote. */
      A.reconcileGemUnlocks(G, { gem_unlocks: ['theme:default'] });
      assert(held() === 'theme:default',
        'a REAL projection is absolute — a union would keep a revoked or refunded unlock alive for ever');
      /* And a malformed entry inside a real array is dropped rather than carried:
         it can never match `kind:id`, so keeping it would only inflate the set. */
      A.reconcileGemUnlocks(G, { gem_unlocks: ['theme:default', 'nonsense', 42, 'theme:forest'] });
      assert(held() === 'theme:default,theme:forest', 'entries that are not `<namespace>:<id>` must be dropped: ' + held());
    } finally { restoreG(snap); }
  }),

  /* ── THE EQUIPPED POINTER FAILS CLOSED ──────────────────────────────────────
     `houseTheme` stays residue — it is a per-character display pointer the server
     has no column for — so it is the one field in this lane a player (or a stale
     cloud blob) can still author. It must therefore be READ through a fail-closed
     seam: a pointer at a theme the owned set does not carry paints `default`,
     silently, and re-grants nothing. */
  () => tryRun('THEME-CLOSED-1: an equipped theme the realm does not record renders `default`, silently, and is never re-granted', () => {
    if (typeof window.activeHouseTheme !== 'function') return;
    const snap = snapshotG();
    const said = [], origNotify = window.notify;
    try {
      window.notify = function (m, k) { said.push({ m: String(m), k: k }); };
      window.G._gemUnlocks = { owned: ['theme:default'], at: Date.now() };
      window.G.houseTheme = 'volcanic';           // forged, or paid for on a server that revoked it
      assert(window.activeHouseTheme() === 'default',
        'THE CLASS: a forged `houseTheme` painted a theme the realm never sold — the residue gating '
        + 'a server-sold capability, one field over from the Forge deadlock');
      assert(window.ownsGemUnlock('theme', 'volcanic') === false,
        'and the fail-closed READ must not quietly become a GRANT');
      assert(window.G.houseTheme === 'volcanic',
        'the read fails closed; it does not rewrite the player\u2019s pointer. A theme they own again '
        + 'tomorrow must come back by itself.');
      assert(said.length === 0,
        'silently — the player did nothing wrong and there is nothing they can act on: ' + JSON.stringify(said));
      // And the moment the realm carries it, the same pointer paints.
      window.G._gemUnlocks = { owned: ['theme:default', 'theme:volcanic'], at: Date.now() };
      assert(window.activeHouseTheme() === 'volcanic', 'an owned theme must paint from the very same pointer');
    } finally { window.notify = origNotify; restoreG(snap); }
  }),

  /* ── THE RESIDUE ALLOWLIST IS THE CONTRACT ──────────────────────────────────
     Three fields left it in this build and one stayed. Pinning the list itself is
     what stops the easy regression: re-adding `ownedThemes` "so it survives a
     reload" would restore the forgeable bag AND give ownership two sources again,
     and it would do it in a file nobody re-reads. */
  () => tryRun('RESIDUE-CUT-1: ownedThemes / ownedCosmetics / unlockedRecipes are OFF the residue allowlist; houseTheme is on it', () => {
    const RF = window.HearthriseCapstone && window.HearthriseCapstone.RESIDUE_FIELDS;
    assert(Array.isArray(RF) && RF.length > 0, 'RESIDUE_FIELDS is not published — this test would pass vacuously');
    ['ownedThemes', 'ownedCosmetics', 'unlockedRecipes'].forEach(function (f) {
      assert(RF.indexOf(f) < 0,
        'THE CLASS: `' + f + '` is back on the residue allowlist. It is a client-written bag the '
        + 'server stores verbatim, and it asserts ownership of a SERVER-SOLD capability — themes and '
        + 'cosmetics are hr_buy_gem_unlock\u2019s, recipes are hr_recipe_learn\u2019s. Ownership has one source.');
    });
    assert(RF.indexOf('houseTheme') >= 0,
      '`houseTheme` must STAY residue: it is the equipped pointer, a per-character display preference '
      + 'the server has no column for, and it is read fail-closed (activeHouseTheme)');
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     RECIPE SCROLLS — THE REALM LEARNS, NOT THE BROWSER
     ══════════════════════════════════════════════════════════════════════════
     THE DEFECT, measured in the engine rather than guessed.
     2026-08-16-artisan-progress-model.sql built the STORAGE for a learned recipe
     and left the WRITE to a later author who never arrived, so no recipe flag had
     ever been written for anybody. Meanwhile legacy.js wrapped `addItem`: picking
     up a scroll set `G.unlockedRecipes[id]` (residue) and deleted the item
     locally, 100 ms later, on a timer. So the browser said "Recipe Unlocked" and
     the away engine — which reads hr_perks_of — saw `{}` and stopped all eight
     gated recipes at tick 0, every night, silently. CLAUDE.md \u00a76's 2026-09-14 rule
     in its purest form.

     BOTH PATHS ARE HERE because this is exactly the class \u00a74 wrote the both-path
     rule for: the attended gate and the away engine must agree, and before this
     they disagreed for a month. */
  () => tryRunAsync('RECIPE-READ-1: reading a scroll asks the realm — the recipe unlocks from the ENVELOPE, and the client deletes nothing', async () => {
    if (typeof window.readRecipeScroll !== 'function' || typeof window.knowsRecipe !== 'function') return;
    const snap = snapshotG();
    const prevGC = window.HearthriseGoalClaim, prevRec = window.HearthriseRecord;
    const origNotify = window.notify, origInv = window.renderInventory;
    const sent = [], said = [];
    try {
      window.notify = function (m, k) { said.push({ m: String(m), k: k }); };
      window.renderInventory = function () {};
      window.HearthriseRecord = Object.assign({}, prevRec, { requestRecord: function () { return Promise.resolve(null); } });
      window.HearthriseGoalClaim = Object.assign({}, prevGC, {
        learnRecipe: function () {
          sent.push(Array.prototype.slice.call(arguments));
          return Promise.resolve({ ok: true, item: 'soul_recipe', recipe: 'recipe:soul_recipe', qty: 0,
            version: 4, slot: 0, unlocked_recipes: { soul_recipe: true } });
        }
      });

      delete window.G._recipeUnlocks;
      window.G.inventory = Object.assign({}, window.G.inventory, { soul_recipe: 1 });
      assert(window.knowsRecipe('soul_recipe') === false, 'the fixture needs the recipe UNKNOWN first');

      await window.readRecipeScroll('soul_recipe');

      assert(sent.length === 1 && sent[0].length === 1 && sent[0][0] === 'soul_recipe',
        'one intent, carrying the scroll id and nothing else — ' + JSON.stringify(sent));
      assert(window.knowsRecipe('soul_recipe') === true,
        'THE CLASS: the recipe must be unlocked BY THE ENVELOPE. A client-side unlock is what made the '
        + 'browser and the realm disagree for a month while eight recipes paid nothing away.');
      assert((window.G.inventory.soul_recipe || 0) === 1,
        'the client must not delete the scroll: the consume is the server\u2019s, inside the same '
        + 'transaction as the flag, and the bag the player sees comes back in the envelope. Deleting '
        + 'it locally is what made a refused reading LOOK like a spent scroll.');
      assert(said.some(function (x) { return /Recipe Unlocked/i.test(x.m); }), 'the unlock must be announced: ' + JSON.stringify(said));

      /* AND A SECOND SCROLL OF A RECIPE YOU KNOW IS NOT EATEN FOR NOTHING. The
         client refuses locally (the realm refuses `already_learned` too — belt
         and braces on the one gesture that can waste a rare drop). */
      const before = sent.length;
      await window.readRecipeScroll('soul_recipe');
      assert(sent.length === before,
        'a recipe already known must not post a second reading — the scroll is the price, and a '
        + 'refusal that costs a scroll is a bug a player cannot undo');
    } finally {
      if (prevGC) window.HearthriseGoalClaim = prevGC; else delete window.HearthriseGoalClaim;
      if (prevRec) window.HearthriseRecord = prevRec; else delete window.HearthriseRecord;
      window.notify = origNotify; window.renderInventory = origInv;
      restoreG(snap);
    }
  }),

  /* THE DELETED WRAPPER, PINNED. `addItem` used to unlock the recipe and schedule
     a local `removeItem` 100 ms later — a client-authored grant AND a client-
     authored consume, neither of which the realm ever saw. The 150 ms wait is
     deliberate: the old bug lived on a timer, so a synchronous assertion would
     have passed while the scroll was still on its way out of the bag. */
  () => tryRunAsync('RECIPE-PICKUP-1: picking up a scroll neither learns it nor eats it — the scroll stays in the bag until it is READ', async () => {
    if (typeof window.addItem !== 'function' || typeof window.knowsRecipe !== 'function') return;
    if (!window.ITEMS || !window.ITEMS.soul_recipe) return;
    const snap = snapshotG();
    const origNotify = window.notify;
    try {
      window.notify = function () {};
      delete window.G._recipeUnlocks;
      window.G.inventory = Object.assign({}, window.G.inventory);
      delete window.G.inventory.soul_recipe;

      window.addItem('soul_recipe', 1);
      await new Promise(function (r) { setTimeout(r, 150); });

      assert(window.knowsRecipe('soul_recipe') === false,
        'THE CLASS: picking a scroll up LEARNED it client-side. The realm was never told, so the away '
        + 'engine kept refusing the recipe while the book said it was learned.');
      assert((window.G.inventory.soul_recipe || 0) >= 1,
        'THE CLASS: the scroll was consumed by a 100 ms timer with no server call — and because the '
        + 'consume was local, the realm still held the scroll, which is why no amnesty is owed and '
        + 'why every one of them is still readable');
    } finally { window.notify = origNotify; restoreG(snap); }
  }),

  /* ── BOTH PATHS, ON THE ONE PROJECTION ──────────────────────────────────────
     The attended gate (legacy.js gateOk \u2192 unlockedRecipesMap) and the away engine
     (artisan-sim simulateArtisanSpan \u2192 gateOk) must answer the same question the
     same way. Before this build the away half read the server and the attended
     half read residue, so a player could craft Lich Soul Soup all evening and be
     paid nothing for the night. */
  () => tryRun('RECIPE-AWAY-1 (both-path): a gated recipe pays NOTHING away until the realm carries the row, and pays the moment it does', () => {
    const C = window.HearthriseCore;
    if (!C || !C.artisanSim || !window.ARTISAN_RECIPES) return;
    const idx = C.artisanSim.indexArtisanRecipes(window.ARTISAN_RECIPES);
    const entry = idx.cook_lich_soup;
    if (!entry || !entry.recipe || !entry.recipe.gated) return;
    const snap = snapshotG();
    try {
      const span = function (map) {
        return awayArtisanSpan({
          targetId: 'cook_lich_soup', spanMs: 3600000, away: true,
          state: {
            activeSkill: entry.skill, skillTargetId: 'cook_lich_soup',
            skills: { cooking: C.xp.XP_TABLE[(entry.recipe.req || 1) - 1] },
            inventory: { lich_soul: 50, wheat: 50 },
            unlockedRecipes: map,
          },
        });
      };

      // AWAY, with no server row: the span stops AT THE GATE and pays nothing.
      const closed = span({});
      assert(closed.out.stoppedBy === C.artisanSim.STOP_REASON.GATE,
        'the away engine must stop a gated recipe at the GATE when the realm holds no row, got '
        + closed.out.stoppedBy);
      assert(!Object.keys(closed.paid.items).length && !Object.keys(closed.paid.xp).length,
        'an un-learned recipe paid ' + JSON.stringify(closed.paid) + ' away');

      // AWAY, with the row: it pays.
      const open = span({ soul_recipe: true });
      assert(open.out.stoppedBy !== C.artisanSim.STOP_REASON.GATE,
        'with the server row the span must run, got ' + open.out.stoppedBy);
      assert(Object.keys(open.paid.xp).length > 0,
        'a learned recipe paid nothing away — the row exists and the engine ignored it');

      // ATTENDED, through the SAME projection the away path just used.
      delete window.G._recipeUnlocks;
      assert(window.gateOk(entry.recipe) === false,
        'THE CLASS: the attended gate opened a recipe the realm has no row for — the browser saying '
        + 'one thing while the server says another (\u00a76, 2026-09-14)');
      /* AND A CLIENT-HELD BAG IS NOT A KEY. `unlockedRecipes` was residue until
         2026-09-14; a console (or a stale cloud blob) can still type it, and a
         gate that fell back to it would be the residue-ahead class on a surface
         that SPENDS materials — the player would watch the Forge accept the row
         and the realm refuse the run. Written through a computed key because the
         field is retired (see GEM-OWN-1 for the same reasoning). */
      const forged = 'unlockedRecipes';
      window.G[forged] = { soul_recipe: true };
      assert(window.gateOk(entry.recipe) === false,
        'THE CLASS: a client-written recipe bag opened a gate the realm has no row for');
      delete window.G[forged];

      window.G._recipeUnlocks = { map: { soul_recipe: true }, at: Date.now() };
      assert(window.gateOk(entry.recipe) === true,
        'the attended gate must open on the SAME projection the engine paid on — one answer, two paths');
    } finally { delete window.G.unlockedRecipes; restoreG(snap); }
  }),

  /* The fourth site the sweep turned up, and the only one in the class that
     costs the PLAYER. redeemHearthToken burns the IAP-only bond with a local
     removeItem and credits 150 gems the next envelope erases — the inventory
     absolute arm is dormant, so the token does not come back either. */
  () => tryRun('GEM-TOKEN-1: an ARMED Hearth Token redemption keeps the token rather than burning it for nothing', () => {
    if (typeof window.redeemHearthToken !== 'function' || !window.ITEMS || !window.ITEMS.hearth_token) return;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField, origNotify = window.notify;
    const origSave = window.saveLocal, origTop = window.updateTopbar, origShop = window.renderShop;
    try {
      window.clientMayWriteRecordField = function (f) { return f !== 'gems'; };
      window.notify = function () {}; window.saveLocal = function () {}; window.updateTopbar = function () {};
      window.renderShop = function () {};
      window.G.inventory = Object.assign({}, window.G.inventory, { hearth_token: 1 });
      window.G.gems = 0;
      stampBalanceLikeLoad(window.G);
      window.redeemHearthToken();
      assert((window.G.inventory.hearth_token || 0) === 1,
        'THE CLASS, POINTING AT THE PLAYER: an armed redemption consumed the Hearth Token — the '
        + 'IAP-only bond — for gems the next envelope erases. The token does not come back; the '
        + 'inventory absolute arm is dormant.');
      assert(window.G.gems === 0, 'a refused redemption must not credit gems either');
    } finally {
      window.clientMayWriteRecordField = origMay; window.notify = origNotify;
      window.saveLocal = origSave; window.updateTopbar = origTop; window.renderShop = origShop;
      restoreG(snap);
    }
  }),

  () => tryRunAsync('PLOT-REFUSE-1 (b500): a server-REFUSED farm plot is NOT added to plotBuildings and says why', async () => {
    if (typeof window.buildPlot !== 'function' || !window.HearthriseHomestead) return;
    /* plotBuildings is a RESIDUE array with NO reconcile — an optimistic push on
       a refusal is STRANDED (a plot the realm never recorded). farm_plot cost is
       {gold:100, normal_log:5} (PLOT_BUILDINGS), stocked below. */
    const snap = snapshotG();
    const origGold = window.HearthriseGold, origNotify = window.notify;
    const propRec = window.HearthriseProperty;
    const prevProp = (propRec && typeof propRec.__resetPropertyRecord === 'function') ? propRec.__resetPropertyRecord() : null;
    const said = [];
    let sentOffer = null;
    try {
      window.G.homestead = { tier: 3 };          // plenty of plot headroom (client gate passes)
      window.G.plotBuildings = [];
      window.G.gold = 5000000;
      window.G.inventory = Object.assign({}, window.G.inventory, { normal_log: 500, copper_ore: 500, oak_log: 500 });
      stampBalanceLikeLoad(window.G);
      window.notify = function (m, k) { said.push({ m: String(m), k: k }); };
      window.HearthriseGold = Object.assign({}, origGold, {
        isGoldIntentEnabled: function () { return true; },
        newIntentKey: function () { return 'k-plot-refuse'; },
        buyUnlock: function (offer, key) {
          sentOffer = offer;
          return Promise.resolve({ outcome: 'refused', reason: 'prereq_property_tier', verb: 'unlock_buy', key: key,
            body: { ok: false, error: 'prereq_property_tier', detail: { have: 1, need: 3 } } });
        },
      });
      const before = window.G.plotBuildings.length;
      window.buildPlot('farm_plot');
      await new Promise(function (r) { setTimeout(r, 30); });
      assert(sentOffer === 'farm_land.1', 'the plot build must send offer farm_land.<count+1> = farm_land.1; got ' + sentOffer);
      assert(window.G.plotBuildings.length === before,
        'THE CLASS: a server-REFUSED farm plot was pushed to plotBuildings (' + before + ' -> '
        + window.G.plotBuildings.length + ') — a stranded plot the realm never recorded');
      const refusal = said.filter(function (s) { return s.k === 'kill' && /couldn.t record/i.test(s.m); });
      assert(refusal.length >= 1, 'a refused plot build must SURFACE the refusal; saw ' + JSON.stringify(said));
      assert(!said.some(function (s) { return /^Built /.test(s.m); }), 'a refused plot build toasted "Built ..."');
    } finally {
      window.HearthriseGold = origGold; window.notify = origNotify;
      if (prevProp && propRec) { try { propRec.__resetPropertyRecord(prevProp.tier, prevProp.workers); } catch (e) {} }
      restoreG(snap);
    }
  }),

  () => tryRun('unlock_buy slices 2-3: worker/farm/bank offer ids cross, a price never does', () => {
    // THE BYTES. hire()/buildPlot('farm_plot')/buyBankSpaceGold() now debit gold
    // through the live `unlock_buy` verb. The load-bearing property is the same as
    // slice 1's: the wire carries an OFFER ID and NOTHING ELSE — no price, no qty
    // — so a forged client value cannot author a permanent capability's cost.
    const S = window.HearthriseGold;
    if (!S || typeof S.buildGoldRequest !== 'function') return;
    ['worker_hire.1', 'worker_hire.6', 'farm_land.1', 'farm_land.12', 'bank.0', 'bank.29'].forEach((offer) => {
      const body = JSON.parse(S.buildGoldRequest({ verb: 'unlock_buy', slot: 0, intentId: 'k', offer }).init.body);
      assert(body.verb === 'unlock_buy' && body.offer === offer,
        'the unlock_buy body must carry the verb and the offer id ' + offer);
      assert(!('qty' in body) && !('price' in body) && !('cost' in body) && !('gold' in body) && !('amount' in body),
        'the ' + offer + ' wire must carry NO price/qty/cost — a client price authoring a rung is the '
        + 'exact thing this verb exists to make impossible; got ' + JSON.stringify(body));
      assert(S.UNLOCK_OFFER_ID_RE.test(offer), offer + ' must match the unlock offer id shape');
    });
  }),

  () => tryRunAsync('unlock_buy slices 2-3: buildPlot and bank each send ONE intent, and the balance is the SERVER\'s', async () => {
    /* b515 — "DEBITS EXACTLY ONCE" WAS A CLIENT PROPERTY AND THERE IS NO CLIENT
       DEBIT. This ran with the b353 kill switch off, where `goldSettle` was the
       plain local subtraction that shipped pre-seam. Under the shipping arm
       `gold` is SERVER-OF-RECORD: each gesture sends ONE `unlock_buy` naming an
       offer id, no price crosses, and the balance is whatever the answer states
       — absolutely. A double-debit is not expressible; what IS expressible, and
       is the same defect wearing today's clothes, is a double-SEND (two intents
       for one tap, two charges server-side) or a client that keeps its own
       arithmetic on top of the answer. Both are asserted, per gesture.

       The WORKER block is gone from this test rather than converted: with
       WORKER_PRODUCTION_SERVER_BACKED armed (the live default) `hire()` is
       HIRE-FIRST and async — it materialises against the server's paid cap and
       debits only on a real crew_cap_reached round trip — so it is a different
       shape with its own tests (worker-settlement / HIRE-OWNED-1 /
       HIRE-STRANDED-1). A converted copy here would duplicate them badly.

       The BYTES (offer id crosses, price never does) are the sibling test
       immediately above, unchanged. */
    const snap = snapshotG();
    try {
      if (typeof window.buildPlot === 'function' && window.HearthriseHomestead) {
        window.G.homestead = { tier: 1 };
        window.G.plotBuildings = [];
        window.G.gold = 100000;
        stampBalanceLikeLoad(window.G);
        window.G.inventory = Object.assign({}, window.G.inventory, { normal_log: 100 });
        const before = window.G.gold;
        const SERVER_GOLD = before - 100 - 5;   // NOT the client's arithmetic
        await withServerBacked({ state: { gold: SERVER_GOLD } }, async (rig) => {
          window.buildPlot('farm_plot');
          await rig.drain();
          assert(window.G.plotBuildings.filter((x) => x.id === 'farm_plot').length === 1,
            'a farm plot should be built');
          assert(rig.sent.length === 1 && rig.sent[0].verb === 'unlock_buy'
            && rig.sent[0].offer === 'farm_land.1',
            'buildPlot must send exactly one unlock_buy naming farm_land.1: ' + JSON.stringify(rig.sent));
          assert(window.G.gold === SERVER_GOLD,
            'buildPlot left the balance at ' + window.G.gold + ' and the server said ' + SERVER_GOLD
            + ' — the client kept its own debit, or applied the answer additively');
        });
      }
      if (typeof window.buyBankSpaceGold === 'function' && typeof window.bankGoldCost === 'function') {
        window.G.bank = { goldBuys: 0 };
        window.G.gold = 1000000;
        stampBalanceLikeLoad(window.G);
        const cost = window.bankGoldCost();
        const before = window.G.gold;
        const SERVER_GOLD = before - cost - 5;
        await withServerBacked({ state: { gold: SERVER_GOLD } }, async (rig) => {
          window.buyBankSpaceGold();
          await rig.drain();
          assert(window.G.bank.goldBuys === 1, 'a bank rung should be bought');
          assert(rig.sent.length === 1 && rig.sent[0].verb === 'unlock_buy'
            && rig.sent[0].offer === 'bank.0',
            'buyBankSpaceGold must send exactly one unlock_buy naming bank.0: ' + JSON.stringify(rig.sent));
          assert(window.G.gold === SERVER_GOLD,
            'buyBankSpaceGold left the balance at ' + window.G.gold + ' and the server said ' + SERVER_GOLD);
        });
      }
    } finally { restoreGAndRecord(snap); }
  }),

  () => tryRun('unlock_buy slices 2-3: each site sends offer.<next rung> and NOTHING else on the wire', () => {
    // With the accrual switch ON (the pristine default), each wired site fires
    // HearthriseGold.buyUnlock(offer, key). Stubbing it captures the exact offer id
    // the SITE computed from server-mirrored local state — the NEXT rung — and lets
    // us prove it is an offer-id-only gesture (buyUnlock takes no price argument at
    // all). resetGold() clears the predictions the stub leaves outstanding.
    const S = window.HearthriseGold;
    if (!S || typeof S.buyUnlock !== 'function' || !S.isGoldIntentEnabled || !S.isGoldIntentEnabled()) return;
    const snap = snapshotG();
    const origBuy = S.buyUnlock;
    const sent = [];
    try {
      S.buyUnlock = function () { sent.push(Array.prototype.slice.call(arguments)); return Promise.resolve({ sent: false }); };

      /* WORKER block is FLAG-OFF only: HIRE-FIRST fires buyUnlock asynchronously,
         and only after the server answers crew_cap_reached — a synchronous
         `sent`-capture cannot observe it. The armed path's wire (buyUnlock sends
         worker_hire.<next rung>, offer+key only) is asserted in the async
         worker-settlement test. buildPlot + bank below are synchronous and stay. */
      const workerArmed = !!(window.HearthriseItemAuthority && window.HearthriseItemAuthority.WORKER_PRODUCTION_SERVER_BACKED);
      if (!workerArmed && window.HearthriseWorkers && typeof window.HearthriseWorkers.hire === 'function' && window.HearthriseHomestead) {
        window.G.homestead = { tier: 1 }; window.G.workers = { hired: [] }; window.G.gold = 100000;
        stampBalanceLikeLoad(window.G);   // armed: hire() gates on the affordability read before firing buyUnlock
        sent.length = 0;
        window.HearthriseWorkers.hire();
        const call = sent.find((a) => a[0] === 'worker_hire.1');
        assert(call, 'hire must send offer worker_hire.1; sent ' + JSON.stringify(sent));
        assert(call.length === 2 && S.isIntentKey(call[1]), 'buyUnlock takes ONLY (offer, key) — no price arg; got ' + JSON.stringify(call));
      }
      if (typeof window.buildPlot === 'function' && window.HearthriseHomestead) {
        window.G.homestead = { tier: 1 }; window.G.plotBuildings = []; window.G.gold = 100000;
        stampBalanceLikeLoad(window.G);   // armed: buildPlot gates on the affordability read before firing buyUnlock
        window.G.inventory = Object.assign({}, window.G.inventory, { normal_log: 100 });
        sent.length = 0;
        window.buildPlot('farm_plot');
        assert(sent.some((a) => a[0] === 'farm_land.1'), 'buildPlot must send offer farm_land.1; sent ' + JSON.stringify(sent));
      }
      if (typeof window.buyBankSpaceGold === 'function') {
        window.G.bank = { goldBuys: 0 }; window.G.gold = 1000000;
        stampBalanceLikeLoad(window.G);   // armed: buyBankSpaceGold gates on the affordability read before firing buyUnlock
        sent.length = 0;
        window.buyBankSpaceGold();
        assert(sent.some((a) => a[0] === 'bank.0'), 'buyBankSpaceGold must send offer bank.0; sent ' + JSON.stringify(sent));
      }
    } finally {
      S.buyUnlock = origBuy;
      try { S.resetGold(); } catch (e) {}
      restoreG(snap);
    }
  }),

  () => tryRun('unlock_buy slice 2: the bank gold ladder clamps at 30 rungs client-side (defence-in-depth)', () => {
    // The SERVER ceiling is the 30-rung bank ladder and the per-namespace daily
    // clamp is 32 (c_max_unlocks_per_day in 2026-08-16-unlock-buy.sql), so a full
    // 30-rung climb in one day is legal — that is WHY the clamp moved to 32 and
    // became per-namespace. The client also clamps at goldBuys<=30 so a maxed bag
    // stops asking. ⚠ THE SERVER 30-rung ceiling + the per-namespace 32/day clamp
    // are enforced in SQL and must be verified on a LIVE migration apply — the JS
    // smoke harness cannot reach the RPC.
    if (typeof window.buyBankSpaceGold !== 'function') return;
    const snap = snapshotG();
    try {
      window.G.bank = { goldBuys: 30 };
      window.G.gold = 1e12;
      const before = window.G.gold;
      const r = window.buyBankSpaceGold();
      assert(r === false, 'a 31st gold bank buy must be refused client-side');
      assert(window.G.gold === before, 'a refused bank buy must spend no gold; got -' + (before - window.G.gold));
      assert(window.G.bank.goldBuys === 30, 'goldBuys must not advance past 30');
    } finally { restoreG(snap); }
  }),

  () => tryRun('slice 6: buyTheme has no gold branch — the default equips free, gem themes never touch gold', () => {
    if (typeof window.buyTheme !== 'function') return;
    const snap = snapshotG();
    try {
      // The free default (currency !== 'gem', price 0) is a FREE EQUIP, not a gold buy.
      window.G.gold = 12345; window.G.gems = 0;
      /* Ownership is the realm's set since 2026-09-14, and the projection always
         carries the free rows — which is exactly what keeps the starter cottage
         equippable for a character who has bought nothing. */
      window.G._gemUnlocks = { owned: ['theme:default'], at: Date.now() };
      const goldBefore = window.G.gold;
      window.buyTheme('default');
      assert(window.G.gold === goldBefore, 'equipping the free default theme must spend no gold; got -' + (goldBefore - window.G.gold));
      assert(window.G.houseTheme === 'default', 'the default theme should be equipped');
      // A gem theme with no gems is refused and — the whole point of slice 6 — never touches gold.
      window.G.gems = 0;
      const g0 = window.G.gold;
      window.buyTheme('forest');
      assert(window.G.gold === g0, 'a gem theme must never debit gold; got -' + (g0 - window.G.gold));
      assert(window.G.houseTheme !== 'forest', 'a gem theme must not equip without gems');
    } finally { restoreG(snap); }
  }),

  () => tryRun('slice 7: buyback is gated on the record seam — works UNARMED, fails CLOSED when gold is armed', () => {
    if (typeof window.repurchase !== 'function' || !window.ITEMS || !window.ITEMS.copper_ore) return;
    /* A leftover entry here draws an extra Vendor-buy-back row in the seed shop and fails
       b221 — `buyback` used to need a hand-restore for that; sealSnapshot does it now. */
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    try {
      // UNARMED (today): clientMayWriteRecordField('gold') is true → the buy-back works.
      window.clientMayWriteRecordField = function () { return true; };
      window.G.buyback = [{ id: 'copper_ore', qty: 2, unit: 3, at: Date.now() }];
      window.G.gold = 1000;
      /* armed: gold is registry-first, so the affordability read is UNKNOWN until
         stamped the way hr_load does — even though the WRITE gate is stubbed open.
         The ARMED half below is deliberately left UNSTAMPED so the genuine
         fail-closed refusal is measured. */
      stampBalanceLikeLoad(window.G);
      window.G.inventory = Object.assign({}, window.G.inventory);
      const before = window.G.gold;
      window.repurchase(0);
      assert(window.G.gold === before - 6, 'unarmed buy-back must debit 2×3 gold; got -' + (before - window.G.gold));
      assert(window.G.buyback.length === 0, 'a completed buy-back removes the entry');

      // ARMED: clientMayWriteRecordField('gold') is false → refused, no debit, entry kept.
      window.clientMayWriteRecordField = function (f) { return f !== 'gold'; };
      window.G.buyback = [{ id: 'copper_ore', qty: 2, unit: 3, at: Date.now() }];
      window.G.gold = 1000;
      const g2 = window.G.gold;
      window.repurchase(0);
      assert(window.G.gold === g2, 'armed buy-back must NOT debit gold (a client past-price is a mint); got -' + (g2 - window.G.gold));
      assert(window.G.buyback.length === 1, 'a refused buy-back keeps the entry');
    } finally {
      window.clientMayWriteRecordField = origMay;
      restoreG(snap);
    }
  }),

  () => tryRun('slice 4: buying a shop companion sends offer companion.<id> (offer-id only) and debits via the seam', () => {
    // With the accrual switch ON (pristine default), _buyCompanion fires
    // HearthriseGold.buyUnlock(offer, key). Stub it to capture the exact offer id
    // the site sends and prove it is offer-id-only — no price crosses the wire.
    const S = window.HearthriseGold;
    if (typeof window._buyCompanion !== 'function' || !S || typeof S.buyUnlock !== 'function'
      || !S.isGoldIntentEnabled || !S.isGoldIntentEnabled() || !window.COMPANIONS) return;
    const snap = snapshotG();
    const origBuy = S.buyUnlock;
    const origMay = window.clientMayWriteRecordField;
    const sent = [];
    try {
      window.clientMayWriteRecordField = function () { return true; }; // UNARMED (today)
      S.buyUnlock = function () { sent.push(Array.prototype.slice.call(arguments)); return Promise.resolve({ sent: false }); };
      window.G.companions = { ownedIds: [], xp: {}, equipped: null };
      window.G.gold = 100000;
      stampBalanceLikeLoad(window.G);   // armed: _buyCompanion gates on the affordability read before firing buyUnlock
      window._buyCompanion('sparrow', 5000);
      const call = sent.find((a) => a[0] === 'companion.sparrow');
      assert(call, '_buyCompanion must send offer companion.sparrow; sent ' + JSON.stringify(sent));
      assert(call.length === 2 && S.isIntentKey(call[1]), 'buyUnlock takes ONLY (offer, key) — no price arg; got ' + JSON.stringify(call));
      assert(window.G.companions.ownedIds.indexOf('sparrow') >= 0, 'the companion must be granted locally as a prediction');
    } finally {
      S.buyUnlock = origBuy;
      window.clientMayWriteRecordField = origMay;
      try { S.resetGold(); } catch (e) {}
      restoreG(snap);
    }
  }),

  () => tryRun('b420: shop-companion buy is NO LONGER arm-gated — buyable both UNARMED and when gold is armed', () => {
    // The b410 clientMayWriteRecordField('gold') defer in _buyCompanion is LIFTED:
    // the pet EFFECT is server-owned now (hr_companion_equip owns the equipped id,
    // hr_perks_of prices the passive bonus), so buying under arm is no longer "pay
    // gold, get nothing". This test proves the buy grants + debits in BOTH arm
    // states — the inverse of the old fails-CLOSED assertion.
    if (typeof window._buyCompanion !== 'function' || !window.COMPANIONS || !window.COMPANIONS.sparrow) return;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const S = window.HearthriseGold;
    // Stub buyUnlock so the (signed-out) transport does not immediately roll back
    // the seam prediction — this test measures the un-gate + the local debit.
    const origBuy = S && S.buyUnlock;
    try {
      if (S && typeof S.buyUnlock === 'function') S.buyUnlock = function () { return Promise.resolve({ sent: false }); };
      // UNARMED: the buy works.
      window.clientMayWriteRecordField = function () { return true; };
      window.G.companions = { ownedIds: [], xp: {}, equipped: null };
      window.G.gold = 100000;
      /* armed: the affordability read is registry-first — stamp it the way hr_load
         does so the (write-gate-open) unarmed path can debit. The ARMED half below
         is left UNSTAMPED so the genuine fail-closed refusal is measured. */
      stampBalanceLikeLoad(window.G);
      const before = window.G.gold;
      window._buyCompanion('sparrow', 5000);
      assert(window.G.companions.ownedIds.indexOf('sparrow') >= 0, 'unarmed buy must grant the companion');
      assert(window.G.gold === before - 5000, 'unarmed buy must debit the price once; got -' + (before - window.G.gold));

      // ARMED: gold on SERVER_OF_RECORD → the buy STILL works (no longer gated).
      window.clientMayWriteRecordField = function (f) { return f !== 'gold'; };
      window.G.companions = { ownedIds: [], xp: {}, equipped: null };
      window.G.gold = 100000;
      const g2 = window.G.gold;
      window._buyCompanion('honeybee', 8000);
      assert(window.G.companions.ownedIds.indexOf('honeybee') >= 0, 'ARMED buy must grant the companion — the gate is lifted (pet effect is server-owned)');
      assert(window.G.gold === g2 - 8000, 'ARMED buy must debit the price once; got -' + (g2 - window.G.gold));
    } finally {
      window.clientMayWriteRecordField = origMay;
      if (S && origBuy) S.buyUnlock = origBuy;
      try { S && S.resetGold(); } catch (e) {}
      restoreG(snap);
    }
  }),

  () => tryRun('b420: equipping a companion fires hr_companion_equip with the companion id; unequip fires p_unequip', () => {
    // The equip transport tells the server which companion is equipped so
    // hr_perks_of can price its passive bonus. Stub HearthriseGoalClaim to capture
    // the RPC the equip/unequip gestures send.
    if (typeof window.equipCompanion !== 'function' || typeof window.unequipCompanion !== 'function') return;
    const GC = window.HearthriseGoalClaim;
    if (!GC || typeof GC.equipCompanion !== 'function' || typeof GC.unequipCompanion !== 'function') {
      assert(false, 'HearthriseGoalClaim.equipCompanion/unequipCompanion transport must exist');
    }
    const snap = snapshotG();
    const origEquip = GC.equipCompanion;
    const origUnequip = GC.unequipCompanion;
    const sent = [];
    try {
      GC.equipCompanion = function (id) { sent.push(['equip', id]); return Promise.resolve({ ok: true }); };
      GC.unequipCompanion = function () { sent.push(['unequip']); return Promise.resolve({ ok: true }); };
      window.G.companions = { ownedIds: ['fox', 'sparrow'], xp: { fox: 0, sparrow: 0 }, equipped: null };
      window.equipCompanion('sparrow');
      const eq = sent.find((a) => a[0] === 'equip');
      assert(eq && eq[1] === 'sparrow', 'equipCompanion must fire the transport with the companion id; sent ' + JSON.stringify(sent));
      window.unequipCompanion();
      assert(sent.some((a) => a[0] === 'unequip'), 'unequipCompanion must fire the unequip transport; sent ' + JSON.stringify(sent));
    } finally {
      GC.equipCompanion = origEquip;
      GC.unequipCompanion = origUnequip;
      restoreG(snap);
    }
  }),

  () => tryRun('b420: companion gold PROC stays arm-gated (the un-gate is purchase-only, not the proc)', () => {
    // The PURCHASE un-gated, but rollProc's clientMayWriteRecordField('gold') defer
    // for gold/extraGold procs is UNTOUCHED. Reuses the b342 MARK harness: a
    // distinctive proc amount (no gather reward is near it) fired through the
    // addItem/gather seam with chance=1. With gold UNARMED the proc pays exactly
    // once; with gold ARMED it pays NOTHING — proving the proc gate survives.
    if (!window.COMPANIONS || !window.COMPANIONS.fox || typeof window.addItem !== 'function') return;
    const MARK = 1e7;
    const G = window.G;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const savedFoxProc = JSON.parse(JSON.stringify(window.COMPANIONS.fox.proc));
    const fireGatherProc = () => {
      const g0 = G.gold;
      G.activeMonster = null; G.activeArtisanRecipe = null; G.activeSkill = 'mining';
      window.addItem('copper_ore', 1);
      return Math.floor((G.gold - g0) / MARK);
    };
    try {
      Object.assign(window.COMPANIONS.fox.proc,
        { trigger: 'gather', chance: 1, effect: 'extraGold', amount: MARK, label: '__b420proc__' });
      G.companions = { ownedIds: ['fox'], xp: { fox: 0 }, equipped: 'fox' };

      // UNARMED: the proc pays once (control — proves the harness fires the proc).
      window.clientMayWriteRecordField = function () { return true; };
      G.gold = 0;
      assert(fireGatherProc() === 1, 'control: an UNARMED gold proc must pay exactly once');

      // ARMED: the rollProc gold-flip defer no-ops the whole proc — nothing minted.
      window.clientMayWriteRecordField = function (f) { return f !== 'gold'; };
      G.gold = 0;
      assert(fireGatherProc() === 0, 'an ARMED companion gold proc must mint NO gold — the proc gate must stay');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.COMPANIONS.fox.proc = savedFoxProc;
      restoreG(snap);
    }
  }),

  () => tryRun('slice 4: non-shop companion acquisition is UNAFFECTED by the gold arm-gate', () => {
    // unlockCompanion is the acquisition path for drop/quest/skill/boss/hatch
    // companions. It moves NO gold, so arming gold must not touch it — a player
    // who earns a companion from a drop still gets it while gold is armed.
    if (typeof window.unlockCompanion !== 'function' || !window.COMPANIONS) return;
    // Pick a companion that is NOT a shop companion (no `shop:` source).
    const nonShop = Object.keys(window.COMPANIONS).find((k) => !String(window.COMPANIONS[k].source || '').startsWith('shop'));
    if (!nonShop) return;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const Cap = window.HearthriseCapstone;
    try {
      /* b499: PIN THE CAPSTONE OFF. This test's subject is the GOLD arm-gate,
         and it asserted the SYNCHRONOUS local add — which is only the dormant
         contract now that a non-shop acquisition is server-confirmed under the
         blob-retire arm (HATCH-REFUSE-1..4 below own the armed path). The
         coupling was accidental and unstated; pinning it makes the test measure
         what its name says. */
      if (Cap && Cap.__setBlobRetired) Cap.__setBlobRetired(false);
      window.clientMayWriteRecordField = function (f) { return f !== 'gold'; }; // gold ARMED
      window.G.companions = { ownedIds: [], xp: {}, equipped: null };
      const g0 = window.G.gold;
      const r = window.unlockCompanion(nonShop);
      assert(r === true, 'unlockCompanion must grant a non-shop companion even with gold armed');
      assert(window.G.companions.ownedIds.indexOf(nonShop) >= 0, 'the non-shop companion must be owned');
      assert(window.G.gold === g0, 'unlockCompanion must move no gold');
    } finally {
      if (Cap && Cap.__setBlobRetired) Cap.__setBlobRetired(null);
      window.clientMayWriteRecordField = origMay;
      restoreG(snap);
    }
  }),
];
