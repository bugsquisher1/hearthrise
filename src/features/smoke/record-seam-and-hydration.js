// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/record-seam-and-hydration.js — the server-of-record flips, the record seam, boot hydration and the activity intent.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 110 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, stampBalanceLikeLoad, stampRecordLikeLoad, withLocalBlob, applyAwayEnvelope, predZero, snapshotG, armActivityTransport, drain, restoreAccrualSwitch, seedPlayStreak, restoreG, restoreGAndRecord, on, snapshot } from './_harness.js?v=548';

/* A RUNNING SMITHING BENCH ON A SCRIPTED WIRE — written once, driven by the two
   recipe-switch regressions below. See their header for the report. */
const benchSwitchArc = async (body) => {
  const G = window.G, M = window.HearthriseActivity, A = window.HearthriseAccrual;
  const R = (window.ARTISAN_RECIPES && window.ARTISAN_RECIPES.smithing) || [];
  const a = R.find((x) => x.id === 'forge_iron_helm'), b = R.find((x) => x.id === 'forge_iron_platebody');
  assert(a && b, 'the fixture needs two smithing recipes');
  const snap = snapshotG(), realFetch = window.fetch, origNotify = window.notify, wasOn = A.isServerAccrualEnabled();
  const sent = [], probe = [], log = [], said = [];
  let steps = [], release = null;
  const envOf = (v, id) => ({ version: v, now: null, activity: { kind: 'artisan', id },
    state: { slot: 0, active_kind: 'artisan', active_id: id, gold: G.gold, hp: G.playerHp, max_hp: G.playerMaxHp, accrued_to: '2026-09-17T06:00:00Z' },
    skills: Object.keys(G.skills || {}).reduce((o, k) => { o[k] = { xp: G.skills[k] }; return o; }, {}),
    inventory: Object.assign({}, G.inventory) });
  const t = {
    a, b, sent, probe, log, said,
    plan: (s) => { steps = s.slice(); },
    accept: (v, id) => ({ status: 200, body: Object.assign({ ok: true, verb: 'set_activity' }, envOf(v, id)) }),
    refuse: (v, id) => ({ status: 409, body: Object.assign({ ok: false, error: 'version_conflict', stage: 'switch' }, envOf(v, id)) }),
    reset: () => { sent.length = 0; probe.length = 0; log.length = 0; release = null; },
    canRelease: () => typeof release === 'function',
    release: () => release(),
    /* A SETTLE THE TEST HOLDS OPEN, so the ordering under test is a fact rather
       than a timing coincidence. */
    armSettle: () => {
      A.configureAccrual({ url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => 'jwt', slot: 0 });
      const p = A.requestAccrual({ force: true }); if (p && p.catch) p.catch(() => {});
    },
  };
  try {
    window.notify = function (m) { said.push(String(m)); };
    G.skills = Object.assign({}, G.skills, { smithing: 200000 });
    G.inventory = Object.assign({}, G.inventory, { iron_bar: 200, oak_plank: 50 });
    window.fetch = function (u, init) {
      if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
      let bd = null; try { bd = JSON.parse(init && init.body); } catch (e) {}
      const verb = (bd && bd.verb) || 'accrue';
      if (verb === 'accrue') {
        log.push('accrue:sent');
        return new Promise((resolve) => { release = () => { log.push('accrue:answered'); resolve(new Response('{"ok":false,"error":"rate_limited"}', { status: 429 })); }; });
      }
      if (verb !== 'set_activity') return Promise.resolve(new Response('{"ok":false,"error":"rate_limited"}', { status: 429 }));
      sent.push(bd); probe.push({ target: G.skillTargetId }); log.push('switch:' + sent.length);
      const step = steps.shift();
      if (!step) return Promise.resolve(new Response('{"ok":false,"error":"rate_limited"}', { status: 429 }));
      return Promise.resolve(new Response(JSON.stringify(step.body), { status: step.status }));
    };
    armActivityTransport();
    t.plan([t.accept(900, a.id)]);
    window.startArtisan('smithing', a.id); await drain();
    assert(G.skillTargetId === a.id, 'setup: the bench never started ' + a.id + ' (' + G.skillTargetId + ')');
    t.reset();
    await body(t);
  } finally {
    window.fetch = realFetch; window.notify = origNotify; restoreAccrualSwitch(wasOn);
    try { if (release) release(); } catch (e) {}
    M.resetActivity(); M.configureActivity(null);
    try { A.configureAccrual(null); } catch (e) {}
    try { window.stopSkill(); } catch (e) {}
    restoreG(snap);
  }
};

export default [

  /* ══ b337 — SERVER-AUTHORITATIVE AWAY TIME (the client rewire, slice 1) ════
     On return from an absence the client ASKS `hr-accrue` what it earned and
     renders the answer. The property every test below exists to hold is a
     NEGATIVE one, and it is the only thing that makes the slice worth anything:

       WITH THE SWITCH ON, THERE IS NO PATH THROUGH processOffline() THAT
       GRANTS A NUMBER THIS DEVICE COMPUTED — including when the server is
       unreachable, rate-limited, 500ing, or says the character does not exist.

     A silent fallback would look exactly like success while the client quietly
     kept authoring the economy, and would be found only by an economy that no
     longer balances — so the failure tests below are the load-bearing ones.

     THE TRANSPORT IS REAL. These swap `window.fetch` and return real Response
     objects: a test that cannot observe an actual request is not a test of a
     network path.

     tests/cors-preflight.mjs C4 is the live gate for the transport; nothing
     here can stand in for it, because Chromium in this harness is talking to a
     stub, not to the gateway. */

  /* ══════════════════════════════════════════════════════════════════════════
     B353-1 (INVERTED, b515) — THE SWITCH NO LONGER EXISTS.
     ══════════════════════════════════════════════════════════════════════════
     This test asserted, twice over, that `hr:serverAccrual` WAS a working kill
     switch: absent ⇒ ON, the literal 'off' ⇒ OFF, every consumer family
     agreeing, the value persisting across a re-read. It has now inverted a
     second time, and the reason is worth stating because "we deleted the test
     that was in the way" is exactly what this file exists to prevent.

     Security measured what the OFF position actually did (2026-09-07): not
     "the pre-cutover client" its header claimed, but a divergent SINGLE-DEVICE
     LOCAL GAME — see accrue.js's kill-switch block for the inventory — all of
     it silently discarded the moment the key was cleared. CLAUDE.md §1 forbids
     a client-authored fallback in exactly those words.

     So the switch is retired and this test proves the retirement, in the three
     places a half-retirement would hide:

       (a) THE PREDICATE IS A CONSTANT. `isServerAccrualEnabled()` is true with
           a stale `hr:serverAccrual=off` sitting in localStorage — which is the
           state of every device that ever tested the switch, and the one a
           player could still be booting with today.
       (b) THE SETTER IS INERT. `setServerAccrualEnabled(false)` leaves both the
           predicate and `isBlobRetired()` true. It is kept for one release as a
           logging no-op, because a SILENTLY inert setter is how a tester ends up
           believing they are in a state they are not.
       (c) NOBODY WRITES THE BLOB. `snapshotIfDue` issues ZERO requests to
           game_saves — measured on the wire, not asserted from a flag — while
           still making its residue write. That is the property the staged
           2026-09-07-game-saves-revoke.sql enforces server-side, checked here
           on the client where it originates.

     Consumer-family agreement (the old (d)) is preserved: every family must
     answer TRUE, permanently, with no way to make one disagree.

     MUTATION THIS FAILS ON: restore the localStorage read in accrue.js
     `isServerAccrualEnabled` and (a) goes red; make the setter mutate anything
     and (b) goes red; restore the blob upsert in sync.js `snapshotIfDue` and
     (c) goes red. */
  () => tryRunAsync('b515: the b353 kill switch is RETIRED — no stale key, setter or blob write can bring it back', async () => {
    const A = window.HearthriseAccrual;
    const C = window.HearthriseCapstone;
    const S = window.HearthriseSync;
    assert(A, 'src/net/accrue.js did not load — the whole slice is absent and nothing below means anything');
    assert(C, 'src/net/capstone.js did not load');
    const KEY = 'hr:serverAccrual';        // named LITERALLY: the export is gone, and that is the point
    const G = window.G;
    const save = { offlineBudget: G && G.offlineBudget, restedAt: G && G.restedAt };
    /* Every family, re-read from scratch. Named, so a failure says WHICH half of
       the client believes it can still be switched off. */
    const families = () => {
      const out = {};
      out['legacy.js serverAccrualActive'] = window.serverAccrualActive();
      const M = window.HearthriseActivity;
      if (M && M.isActivityIntentEnabled) out['activity.js isActivityIntentEnabled'] = M.isActivityIntentEnabled();
      const gold = window.HearthriseGold;
      if (gold && gold.isGoldIntentEnabled) out['gold.js isGoldIntentEnabled'] = gold.isGoldIntentEnabled();
      const CH = window.HearthriseCharacter;
      if (CH && CH.isCharacterIntentEnabled) out['character.js isCharacterIntentEnabled'] = CH.isCharacterIntentEnabled();
      const R = window.HearthriseRecord;
      if (R && R.isRecordActive) out['record.js isRecordActive'] = R.isRecordActive();
      const mk = window.HearthriseMarket;
      if (mk && typeof mk.serverMarketActive === 'function') out['market.js serverMarketActive'] = mk.serverMarketActive();
      return out;
    };
    const allOn = (why) => {
      const f = families();
      const names = Object.keys(f);
      assert(names.length >= 4, 'fewer than four consumer families were reachable — this compared almost nothing');
      for (const n of names) {
        assert(f[n] === true, n + ' answers ' + f[n] + ' ' + why + ' — a consumer that can still be turned '
          + 'off is a consumer that can still author the economy on somebody\'s device');
      }
      return names.length;
    };
    try {
      // ── (a) A STALE 'off' IN STORAGE CHANGES NOTHING. ─────────────────────
      try { localStorage.setItem(KEY, 'off'); } catch (e) {}
      A.__clearAccrualOverride();
      assert(A.isServerAccrualEnabled() === true,
        'a leftover hr:serverAccrual=off still disables server authority. Every device that ever tested '
        + 'the switch is carrying that key, and this build would hand each of them a local game.');
      assert(C.isBlobRetired() === true, 'the capstone still reads the retired kill switch');
      const checked = allOn('with a stale off key in storage');
      assert(checked >= 4, 'consumer families: ' + checked);
      assert(A.ACCRUE_KILL_KEY === undefined && A.ACCRUE_OFF_VALUE === undefined,
        'accrue.js still publishes the kill-switch key/value. The names are the invitation: they are what '
        + 'a future reader wires a new fork to.');

      // ── (b) THE SETTER IS INERT, IN BOTH DIRECTIONS. ─────────────────────
      assert(A.setServerAccrualEnabled(false) === true, 'setServerAccrualEnabled(false) claims it turned it off');
      assert(A.isServerAccrualEnabled() === true, 'the setter turned server accrual off');
      assert(C.isBlobRetired() === true, 'the setter un-retired the save blob');
      allOn('after setServerAccrualEnabled(false)');
      assert(A.setServerAccrualEnabled(true) === true, 'setServerAccrualEnabled(true) does not answer true');
      assert(typeof A.stampAwayWatermarks !== 'function',
        'stampAwayWatermarks survived. Its only job was to stop a FLIP minting a span the other side had '
        + 'already paid for; with no flip it is a client writer of two watermarks the server owns.');

      // ── (c) NOTHING WRITES game_saves. MEASURED ON THE WIRE. ─────────────
      if (S && typeof S.snapshotIfDue === 'function' && typeof S.__withConfig === 'function') {
        const realFetch = window.fetch;
        const urls = [];
        window.fetch = (u, init) => {
          urls.push(String((u && u.url) || u));
          return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
        };
        try {
          await S.__withConfig({
            snapshotEndpoint: 'https://example.invalid/rest/v1/game_saves',
            apiKey: 'anon', userId: () => 'u1', authToken: () => 'jwt',
            onSyncFailure: () => {}, onSyncRecovered: () => {},
          }, async () => { await S.snapshotIfDue(true, false); });
        } catch (e) { /* a refused write is fine; the URLs are the evidence */ }
        finally { window.fetch = realFetch; }
        const blobWrites = urls.filter((u) => u.indexOf('game_saves') !== -1);
        assert(blobWrites.length === 0,
          'snapshotIfDue issued ' + blobWrites.length + ' request(s) to game_saves (' + blobWrites.join(', ')
          + '). The client-authored save blob is retired: the only periodic write is the self-only residue '
          + 'through hr_put_client_state, and 2026-09-07-game-saves-revoke.sql takes the grant away.');
      }
    } finally {
      A.__clearAccrualOverride();
      try { localStorage.removeItem(KEY); } catch (e) {}
      if (G) { G.offlineBudget = save.offlineBudget; G.restedAt = save.restedAt; }
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     B353-2 — WITH THE FLAG ABSENT, THE THREE AUTHORITIES ROUTE TO THE SERVER.
     ══════════════════════════════════════════════════════════════════════════
     B353-1 proves the PREDICATE flipped. This proves the three things that
     predicate is supposed to switch actually switched, from the pristine state
     a real player boots in — because "the flag reads true" and "accrual, gold
     and the market went server-side" are different claims, and the b348 outage
     was exactly the gap between two such claims.

       ACCRUAL  legacy.js's authority gate is armed, so processOffline() returns
                before anything local is credited.
       RECORD   the moved fields are stripped out of a save blob on the way in
                and `clientMayWrite` refuses them — the blob is a cache.
       MARKET   `serverMarketActive()` is true, so the v1 direct-table paths and
                the whole buy-offer sub-market are unreachable.

     ⚠ GOLD IS NOT ON THE REGISTRY AND THAT IS NOT AN OVERSIGHT — see the b353
       block in src/net/record.js and B353-3 below for the measurement that held
       it back. Its decoders ARE live and are exercised here, because they are
       the reviewed half. */
  () => tryRun('b353: flag ABSENT routes accrual, the record and the market through the server', () => {
    const A = window.HearthriseAccrual;
    const R = window.HearthriseRecord;
    assert(A && R, 'accrue.js / record.js did not load');
    const KEY = 'hr:serverAccrual';   // b515: named literally; the export is gone
    const G = window.G;
    const save = { offlineBudget: G && G.offlineBudget, restedAt: G && G.restedAt,
      gold: G && G.gold, gems: G && G.gems, _record: G && G._record };
    try {
      A.__clearAccrualOverride();
      try { localStorage.removeItem(KEY); } catch (e) {}

      // ── ACCRUAL: the gate is armed from the pristine state. ───────────────
      assert(window.serverAccrualActive() === true, 'legacy.js does not see the flip');

      // ── RECORD: the strip is what makes a field moved. ────────────────────
      const fields = R.serverOfRecordFields();
      assert(fields.length >= 1, 'SERVER_OF_RECORD is empty — nothing has moved at all');
      const blob = { level: 7 };
      for (const f of fields) {
        assert(R.clientMayWrite(f) === false,
          "clientMayWrite('" + f + "') answers true with the switch on — the record has a second writer");
        blob[f] = 'FORGED';
      }
      const stripped = R.stripServerOfRecord(blob);
      for (const f of fields) {
        assert(stripped.blob[f] === undefined,
          "a forged '" + f + "' in a save blob survived the strip, so a devtools edit is read back into a "
          + "live G on every boot under the server's name");
        assert(stripped.stripped.indexOf(f) !== -1, "the strip did not report removing '" + f + "'");
      }
      assert(stripped.blob.level === 7, 'the strip took a field it does not own');

      /* THE BALANCE DECODER — live, unit-tested, and not yet armed. It is the
         only way a balance may ever enter G, and it refuses everything it is
         not certain about rather than substituting a zero: "you have nothing"
         is a claim, not a default. `bigint` comes back from PostgREST as a
         number when it fits and a string when it does not, so both are taken. */
      assert(R.decodeBalance(123456) === 123456 && R.decodeBalance('123456') === 123456,
        'the balance decoder does not accept a bigint in both of the shapes PostgREST sends it');
      assert(R.decodeBalance(0) === 0, 'a real zero balance must decode — only UNCERTAIN is null');
      for (const bad of [null, undefined, -1, 'abc', NaN, Infinity, {}, [], true]) {
        assert(R.decodeBalance(bad) === null,
          'the balance decoder accepted ' + JSON.stringify(String(bad)) + ' — an uncertain value must be '
          + 'UNKNOWN, never a substituted number');
      }
      assert(R.fingerprintBalance(7) === 'n=7' && R.fingerprintBalance(undefined) === 'absent',
        'the balance fingerprint is not total — `want === have` would then match two unknowns by accident');

      // ── MARKET: the swap is live and the v1 halves are unreachable. ───────
      const M = window.HearthriseMarket;
      assert(M && typeof M.serverMarketActive === 'function',
        'src/market.js does not publish serverMarketActive, so nothing can check that the market swapped');
      assert(M.serverMarketActive() === true,
        'the market is still on the v1 direct-table client with the flag absent — market-v2 is APPLIED in '
        + 'production, so those writes are refused by the database and the market screen is simply broken');
      const off = M.placeBuyOffer('normal_log', 1, 1);
      assert(off && off.ok === false, 'a buy offer was accepted under the server market — the sub-market is '
        + 'retired and has no server escrow, so this would escrow gold nothing on the server knows about');
      const coff = M.cancelBuyOffer('anything');
      assert(coff && coff.ok === false, 'a buy-offer cancel was accepted under the server market');
    } finally {
      A.__clearAccrualOverride();
      try { localStorage.removeItem(KEY); } catch (e) {}
      if (G) {
        G.offlineBudget = save.offlineBudget; G.restedAt = save.restedAt;
        G.gold = save.gold; G.gems = save.gems; G._record = save._record;
      }
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     B353-3 — A MOVED FIELD MUST BE RENDERABLE AS **UNKNOWN**.
     ══════════════════════════════════════════════════════════════════════════
     THIS IS THE GUARD WHOSE ABSENCE MADE THE b353 FLIP LOOK LIKE A ONE-LINER,
     and it is written from a measurement rather than from a worry.

     `gold` was scoped into SERVER_OF_RECORD for this commit. Every server-side
     precondition was met. Adding the entry and running the suite produced, on
     the first boot:

         Cold-load guard — 1 uncaught error:
         Cannot read properties of undefined (reading 'toLocaleString')
         ...6 of 22 browser arms red, the engine never booted.

     The site is `updateTopbar` in src/legacy.js:
       document.getElementById('top-gold').textContent = G.gold.toLocaleString()
     — one of 359 `G.gold` reads in src/**, and none of them has an UNKNOWN
     case. record.js's header says a moved field "is briefly UNKNOWN until the
     server answers, which is a state this module has". True of the module and
     FALSE of the game: nothing renders unknown, so UNKNOWN is a crash.

     The contract, stated so it holds for the NEXT field as well as for gold:

       ⚠ A FIELD ON SERVER_OF_RECORD IS ABSENT FROM G BETWEEN A LOAD AND THE
         FIRST ENVELOPE. Every render path must survive that. It is not enough
         for the seam to be honest; the screen has to be.

     So this deletes each moved field from the LIVE G, runs the real render, and
     requires no uncaught error. It passes today (only `offlineBudget` has
     moved, and nothing formats it).

     ⚠ WHAT THE MUTATION ACTUALLY DOES, STATED HONESTLY — because "this guard
       goes red" would be the fifteenth assertion in this file that asserts
       something slightly different from what it claims. Arming `gold` and
       re-running produced:

         Cold-load guard — 1 uncaught error at src/legacy.js:4749
         (`G.gold.toLocaleString()`), the engine did not boot, 16/22 browser
         arms, 6 red — and THIS TEST NEVER RAN, because nothing ran.

       The boot crash is louder and EARLIER than this guard, and that is fine:
       the signal is unmissable either way and it names the same line. What this
       guard is for is the other half — a moved field that is NOT read during
       boot and therefore breaks a screen the player reaches later, or on one
       device, or only while offline. That failure has no cold-load arm and
       would otherwise ship. */
  () => tryRun('B353-3: every SERVER_OF_RECORD field survives being UNKNOWN through a real render', () => {
    const R = window.HearthriseRecord;
    const G = window.G;
    assert(R && G, 'record.js / G missing');
    const fields = R.serverOfRecordFields();
    assert(fields.length >= 1, 'SERVER_OF_RECORD is empty, so this compared nothing and would pass whatever broke');
    /* The render paths a boot actually runs, in the order it runs them. Named
       individually so a failure says WHICH screen cannot spell unknown. */
    const renders = [
      ['updateTopbar', window.updateTopbar],
      ['renderProfile', window.renderProfile],
      ['refreshAll', window.refreshAll],
    ].filter((r) => typeof r[1] === 'function');
    assert(renders.length >= 2,
      'fewer than two render paths were reachable — B353-3 would pass by not looking. Reachable: '
      + renders.map((r) => r[0]).join(', '));
    for (const f of fields) {
      const had = Object.prototype.hasOwnProperty.call(G, f);
      const was = G[f];
      try {
        delete G[f];
        for (const [name, fn] of renders) {
          try {
            fn();
          } catch (e) {
            assert(false,
              name + '() threw with the SERVER_OF_RECORD field `' + f + '` UNKNOWN: ' + (e && e.message)
              + '. That is the state EVERY boot is in between the local load and the first server envelope, '
              + 'and for a player who is offline or rate-limited it is the state they stay in. A moved field '
              + 'needs a read accessor that renders UNKNOWN as something a player understands and that can '
              + 'never be spent, saved or uploaded — see the b353 block in src/net/record.js.');
          }
        }
      } finally {
        if (had) G[f] = was; else delete G[f];
      }
    }
    /* ── THE CONTROL, AND WHY IT HAD TO CHANGE (b356) ─────────────────────
       The original control set `G.gold = null` and required a throw, "the exact
       path the real failure took": `G.gold.toLocaleString()` in updateTopbar.

       ⚠ THAT CONTROL WAS SELF-DESTROYING. Its whole premise was that the gold
         render sites are UNGUARDED — so the moment the UNKNOWN sweep landed and
         gave them a guard, the control stopped throwing and B353-3 went RED
         while the thing it guards got STRICTLY BETTER. A control that fails
         when the code is fixed is not a control, it is a countdown.

       What the control actually has to establish is narrower and permanent:
       THESE RENDER FUNCTIONS PROPAGATE A THROW. So poison the one primitive
       every balance render in the game ends at — `Number.prototype
       .toLocaleString` — and require the propagation. It is independent of
       which fields are on the registry and of how any one site is written, and
       it additionally proves the renders really do FORMAT A NUMBER (a render
       that had quietly stopped painting the balance at all would no longer
       reach the poisoned method, and this would name it).

       Restored in a `finally`: a control must not leave the page damaged for
       whatever runs next. */
    let controlThrew = false;
    const origToLocale = Number.prototype.toLocaleString;
    /* gold/gems are ARMED, so a render only reaches `toLocaleString` when the
       balance is KNOWN — otherwise it renders the pending em dash and the control
       could not throw for the wrong reason (no number formatted). Stamp the live
       G the way hr_load does, so the control measures a real formatted balance. */
    stampBalanceLikeLoad(G);
    try {
      // eslint-disable-next-line no-extend-native
      Number.prototype.toLocaleString = function () { throw new Error('B353-3 control'); };
      try { for (const [, fn] of renders) fn(); } catch (e) { controlThrew = true; }
    } finally {
      // eslint-disable-next-line no-extend-native
      Number.prototype.toLocaleString = origToLocale;
    }
    assert(controlThrew,
      'the control did not throw — either these render functions swallow their own errors (so B353-3 is an '
      + 'assertion that asserts nothing) or not one of them formats a number any more. Drive a path that '
      + 'propagates.');
    try { if (typeof window.refreshAll === 'function') window.refreshAll(); } catch (e) {}
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     B353-3b — THE FLIP, SIMULATED. GOLD AND GEMS AS UNKNOWN, THROUGH THE GAME.
     ══════════════════════════════════════════════════════════════════════════
     B353-3 sweeps the fields that are ALREADY on `SERVER_OF_RECORD`, and today
     that is `offlineBudget` alone — which nothing formats. So B353-3 passes
     without ever touching the failure it was written about, and it will keep
     passing right up until the flip commit, at which point it goes red in
     production instead of in CI. That is the wrong order.

     This guard closes the gap by testing the CANDIDATES. `gold` and `gems` are
     written into `record.js`'s registry block, commented, waiting; deleting
     them from a live `G` puts the client in exactly the state arming those two
     entries would — the state record.js measured as "the engine never booted".

     It asserts three things, and the second and third are the Art Direction:

       1. NOTHING THROWS. The b353 crash, guarded by name.
       2. NOTHING LIES. No render may put "NaN", "undefined", "null" or the
          string "0" where a balance was. `0` is the dangerous one and the
          reason it is worth a guard of its own: it is the value every
          `(G.gold || 0)` in the pre-sweep client produced, it does not look
          like a bug in a screenshot, and it tells a player their money is gone.
       3. IT SAYS SOMETHING. The pending presentation has to actually be on the
          screen — the em dash, in an element carrying the pending class, with
          an accessible label. A balance that renders as empty space is honest
          and useless.

     PROVED RED by reverting `updateTopbar` to `G.gold.toLocaleString()`
     (assertion 1, by name) and, separately, by giving `fmtBalance` an UNKNOWN
     answer of `'0'` (assertion 2, by name). */
  () => tryRun('B353-3b: gold and gems render an honest PENDING state when the server has not answered', () => {
    const B = window.HearthriseBalance;
    const G = window.G;
    assert(B && G, 'src/net/balance.js did not load — the UNKNOWN accessor is the whole contract');
    assert(typeof B.balanceOf === 'function' && typeof B.fmtBalance === 'function'
      && typeof B.canAfford === 'function' && typeof B.paintBalance === 'function',
      'the balance accessor is missing one of its four forms (read / display / decide / paint)');

    /* THE CONTRACT ITSELF, unit-first, so a failure below can be read as
       "the accessor is wrong" vs "a screen is wrong" rather than as one blur.
       gold/gems are ARMED, so a "known" balance is one the SERVER stamped — the
       harness simulates that stamp through the real applyRecord path (exactly
       what hr_load does), rather than trusting a bare number in the object. This
       proves the armed READ path; the UNKNOWN fixtures below stay UNSTAMPED so
       the fail-closed contract is still measured on a genuinely-unloaded balance. */
    const mkKnown = (o) => { stampBalanceLikeLoad(o); return o; };
    const probe = mkKnown({ gold: 1234, gems: 7 });
    assert(B.balanceNum(probe, 'gold') === 1234, 'a known balance does not read back');
    assert(B.fmtBalance(probe, 'gold') === (1234).toLocaleString(), 'a known balance does not format');
    assert(B.canAfford(probe, 1234, 'gold') === true && B.canAfford(probe, 1235, 'gold') === false,
      'affordability is wrong on a KNOWN balance');
    for (const bad of [{}, { gold: undefined }, { gold: null }, { gold: NaN }, { gold: -5 }, { gold: 'x' }]) {
      assert(B.balanceNum(bad, 'gold') === null,
        'balanceNum vouched for ' + JSON.stringify(bad) + ' — UNKNOWN must be null, never a substituted number');
      assert(B.fmtBalance(bad, 'gold') === B.UNKNOWN_TEXT,
        'an UNKNOWN balance formatted as "' + B.fmtBalance(bad, 'gold') + '" instead of the pending glyph');
      assert(B.canAfford(bad, 1, 'gold') === false,
        'an UNKNOWN balance afforded a purchase — a spend against a number nobody has read is exactly the '
        + 'client authoring a value that the whole program exists to prevent');
      assert(B.affordability(bad, 1, 'gold') === 'unknown',
        'affordability collapsed UNKNOWN into a plain no — the caller can no longer tell "you are short" '
        + 'from "we have not been told", which is the difference between two very different messages');
    }
    /* ⚠ A KNOWN BALANCE MUST ADD NOTHING TO THE TREE — the regression this
       sweep shipped once and then measured. The first cut wrapped the real
       figure in `<span class="bal-known">` for symmetry; this codebase ships
       several `… span { font-size: … }` / `… span { color: … }` readability
       blankets, so the Home user card's gold figure rendered at 14.5px inside
       a 21.5px `<b>` and in the wrong colour in cozy-light. The promise of the
       whole sweep is that a KNOWN balance renders exactly as it did before, and
       the only structural way to keep it is to emit no element. */
    assert(B.balanceMarkup(mkKnown({ gold: 1234 }), 'gold') === (1234).toLocaleString(),
      'balanceMarkup wrapped a KNOWN balance in an element ("' + B.balanceMarkup(mkKnown({ gold: 1234 }), 'gold')
      + '"). A span inside a numeral is restyled by this codebase\'s span-targeting readability blankets, '
      + 'so the figure changes size and colour on the screens that have one — the sweep is supposed to be '
      + 'invisible when the balance is known.');
    assert(/^<span class="bal-pending"/.test(B.balanceMarkup({}, 'gold')),
      'balanceMarkup did not produce a pending ELEMENT for an UNKNOWN balance — a bare dash carries no '
      + 'class, no label and none of the pending treatment');

    assert(B.shortfallMessage({}, 5, 'gold') !== B.shortfallMessage(mkKnown({ gold: 0 }), 5, 'gold'),
      'the refusal copy is identical for "you are short" and "we do not know yet" — telling a player they '
      + 'have not got enough gold when the client has simply not been told the balance is a bug report they '
      + 'would be right to file');

    /* THE REAL RENDERS, with both candidates deleted from the live G. */
    const renders = [
      ['updateTopbar', window.updateTopbar], ['renderProfile', window.renderProfile],
      ['renderShop', window.renderShop], ['renderHouse', window.renderHouse], ['refreshAll', window.refreshAll],
    ].filter((r) => typeof r[1] === 'function');
    assert(renders.length >= 3,
      'fewer than three render paths were reachable — this guard would pass by not looking. Reachable: '
      + renders.map((r) => r[0]).join(', '));

    const CANDIDATES = ['gold', 'gems'];
    const saved = {};
    const had = {};
    for (const f of CANDIDATES) { had[f] = Object.prototype.hasOwnProperty.call(G, f); saved[f] = G[f]; }
    let topbarText = '';
    let topbarPending = false;
    let topbarLabelled = false;
    try {
      for (const f of CANDIDATES) delete G[f];
      for (const [name, fn] of renders) {
        try {
          fn();
        } catch (e) {
          assert(false,
            name + '() threw with gold/gems UNKNOWN: ' + (e && e.message) + '. That is the exact state '
            + 'arming those two entries in SERVER_OF_RECORD produces, and record.js measured it as "the '
            + 'engine never booted". Route the read through src/net/balance.js.');
        }
      }
      const cell = document.getElementById('top-gold');
      assert(cell, 'the topbar gold cell is gone — this guard would then measure nothing');
      topbarText = String(cell.textContent || '');
      topbarPending = !!(cell.classList && cell.classList.contains(B.PENDING_CLASS));
      topbarLabelled = !!(cell.getAttribute && cell.getAttribute('aria-label'));

      /* NOTHING LIES — swept over the whole rendered document, not just the one
         cell, because the lie that matters is the one on the screen the player
         happens to be looking at. */
      for (const id of ['top-gold', 'top-gems']) {
        const el = document.getElementById(id);
        if (!el) continue;
        const t = String(el.textContent || '').trim();
        assert(!/NaN|undefined|null/i.test(t),
          '#' + id + ' rendered "' + t + '" with the balance UNKNOWN');
        assert(t !== '0',
          '#' + id + ' rendered "0" with the balance UNKNOWN. That is not a placeholder, it is a claim that '
          + 'the player has nothing — the single most alarming thing this state could say, and it is what '
          + 'every `(G.gold || 0)` in the pre-sweep client produced.');
      }

      // IT SAYS SOMETHING.
      assert(topbarText === B.UNKNOWN_TEXT,
        'the topbar balance rendered "' + topbarText + '" instead of the pending glyph "' + B.UNKNOWN_TEXT
        + '". A balance that renders as empty space is honest and useless.');
      assert(topbarPending,
        'the pending balance carries no `' + B.PENDING_CLASS + '` class, so it gets none of the pending '
        + 'treatment — it is an em dash in the numeral colour, which reads as a dead field');
      assert(topbarLabelled,
        'the pending balance has no accessible label — a screen reader is handed a bare dash and the fact '
        + 'that the number is still loading is lost entirely');
    } finally {
      for (const f of CANDIDATES) { if (had[f]) G[f] = saved[f]; else delete G[f]; }
      try { if (typeof window.updateTopbar === 'function') window.updateTopbar(); } catch (e) {}
      try { if (typeof window.refreshAll === 'function') window.refreshAll(); } catch (e) {}
    }

    /* AND IT MUST GO BACK. A pending state that never clears is worse than no
       pending state, and `paintBalance` toggling a class ON is a different code
       path from toggling it OFF — the second one is the one nobody tests. */
    const cell2 = document.getElementById('top-gold');
    assert(cell2 && !cell2.classList.contains(B.PENDING_CLASS),
      'the topbar stayed in the pending state after the balance came back — paintBalance does not clear it');
    assert(cell2 && !cell2.getAttribute('aria-label'),
      'the pending accessible label survived the balance arriving, so the cell now lies to a screen reader');
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     B353-3c — THE GOLD-VERB ENVELOPE RE-STAMPS THE RECORD (the fourth caller).
     ══════════════════════════════════════════════════════════════════════════
     B353-3b simulates UNKNOWN with `delete G.gold` — the LOAD gap. It does NOT
     touch the OTHER way a moved balance goes UNKNOWN: a SECOND WRITER moving
     G.gold and leaving `_record.stamp.gold` stale, at which point recordValue's
     b347 fingerprint check reports `source:'client-overwrote'` and balanceOf
     fails closed. That is precisely what `applyGoldEnvelope` did before b395 —
     it wrote the balance through `applyEnvelopeState` but did not re-stamp the
     record, unlike the away/boot/switch path (applyServerEnvelope in legacy.js).

     Gold and gems are not yet ARMED into SERVER_OF_RECORD, so this proves the
     invariant on the field that IS armed today — `offlineBudget` / `accrued_to`,
     the watermark. A gold verb that carries activity stamps `accrued_to = now()`
     (record.js's b347 note: "a switch moves the watermark", and so does a verb),
     so after a gold envelope carrying a NEWER `accrued_to`, `recordValue` must
     report the NEWER watermark — which can only be true if `applyGoldEnvelope`
     routed the envelope through `applyRecord`. The SAME re-stamp will follow
     gold/gems the instant those entries are armed, because it is one call over
     whatever SERVER_OF_RECORD holds — this is the prerequisite, not the arming.

     MUTATION-PROVED RED by deleting the `applyRecord(G, env)` line at the tail of
     `applyGoldEnvelope` (src/net/gold.js): the watermark stays at the OLD value
     and the first assertion below goes red. */
  () => tryRun('B353-3c: a gold-verb envelope re-stamps the record (the fourth applyRecord caller — b395)', () => {
    const R = window.HearthriseRecord;
    const Gd = window.HearthriseGold;
    const B = window.HearthriseBalance;
    assert(R && typeof R.applyRecord === 'function' && typeof R.recordValue === 'function',
      'record.js did not load — the re-stamp invariant is the whole contract');
    assert(Gd && typeof Gd.applyGoldEnvelope === 'function', 'gold.js applyGoldEnvelope must be published');
    assert(B && typeof B.balanceOf === 'function' && typeof B.canAfford === 'function',
      'balance.js did not load');

    /* A PRIVATE G, exactly like B340-5 — never window.G, so nothing global is
       mutated and the destructive-replacement gate sees no local progress to
       lose (an absent gold/skills/inventory is "no loss", not "a loss of zero"). */
    const g = {};
    const T1 = Date.parse('2026-08-18T10:00:00Z');
    const T2 = Date.parse('2026-08-18T10:30:00Z');   // the verb moved the watermark forward
    /* Versions high enough to clear gold.js's module-global monotonic
       `lastVersion` regardless of what ran earlier in the suite. resetGold() in
       the finally puts it back to pristine (-1), as every gold test does. */
    const vBase = Date.now();

    try {
      Gd.resetGold();

      // 1) The record is armed at T1 the ONLY legitimate way — through applyRecord.
      const arm = R.applyRecord(g, { ok: true, version: vBase, now: '2026-08-18T10:00:00Z',
        state: { accrued_to: T1 } });
      assert(arm && arm.written && arm.written.indexOf('offlineBudget') !== -1,
        'the fixture did not arm the watermark: ' + JSON.stringify(arm));
      const rv0 = R.recordValue(g, 'offlineBudget');
      assert(rv0.known === true && rv0.value && rv0.value.at === T1,
        'the armed watermark did not read back as T1: ' + JSON.stringify(rv0));

      // 2) A shop_buy envelope lands, moving gold/gems AND carrying a newer accrued_to.
      const body = {
        ok: true, verb: 'shop_buy', version: vBase + 1, now: '2026-08-18T10:30:00Z',
        state: { gold: 500, gems: 10, accrued_to: T2 },
        skills: {}, inventory: {},
        receipt: { kind: 'shop_buy', item: 'log', qty: 1 },
      };
      const written = Gd.applyGoldEnvelope(g, body, Gd.newIntentKey());
      assert(written && written.gold === 500, 'the gold envelope did not apply the balance: ' + JSON.stringify(written));

      // 3) THE FIX, PROVED. Without applyGoldEnvelope re-stamping the record, the
      //    watermark stays at T1 (the stamp the arm wrote) and recordValue reads
      //    it as such; b395 makes the gold verb the fourth applyRecord caller, so
      //    the record now FOLLOWS the verb to T2.
      const rv1 = R.recordValue(g, 'offlineBudget');
      assert(rv1.known === true,
        'the watermark went UNKNOWN after a gold verb — the record was left in an inconsistent state: '
        + JSON.stringify(rv1));
      assert(rv1.value && rv1.value.at === T2,
        'the gold-verb envelope did NOT re-stamp the record: the watermark is still '
        + JSON.stringify(rv1.value) + ' (expected at=' + T2 + '). applyGoldEnvelope wrote the balance but '
        + 'not the record — exactly the two-writer drift that flips a moved gold/gems balance to '
        + '`client-overwrote` and disables every Buy/Sell control the moment those fields are armed.');
      assert(R.recordValue(g, 'offlineBudget').version === vBase + 1,
        'the record version did not advance to the verb envelope — applyRecord did not run on this path');

      // 4) The balance read side still answers on the post-purchase G (sanity: the
      //    fix is a no-op for the currently-unmoved gold field, which reads local).
      const bal = B.balanceOf(g, 'gold');
      assert(bal.known === true && bal.value === 500,
        'balanceOf lost the post-purchase gold: ' + JSON.stringify(bal));
      assert(B.canAfford(g, 300, 'gold') === true && B.canAfford(g, 501, 'gold') === false,
        'canAfford fail-closed on a known post-purchase balance — the exact symptom this prerequisite prevents');
    } finally {
      Gd.resetGold();
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     b517 REGRESSION — A REFUSAL ENVELOPE IS RECONCILIATION, NOT A RECEIPT.
     Three cases, one seam: `applyRecord(G, { ...body, ok: true })`.
     ══════════════════════════════════════════════════════════════════════════
     THE SHAPE OF THE BUG, AND WHY IT IS A MONEY-PATH P1 RATHER THAN A DETAIL.
     `applyGoldEnvelope` writes the balance and stamps the record from the SAME
     server answer, and until b517 those two halves disagreed about what an
     answer is:

       · `applyEnvelopeState` writes `G.gold` ABSOLUTELY from any body that
         `envelopeOf()` validated. settleVerdict routes a body to the applier on
         SHAPE, independent of the 4xx outcome — so a REFUSAL that carries state
         moves the displayed balance.
       · `decodeRecord` (record.js, the only writer of record fields) refuses
         `ok !== true` outright.

     So a refusal left `G.gold` at the server's new number and `_record.stamp.gold`
     at the OLD fingerprint. A stamped-but-mismatched field is exactly what
     `recordValue` reports as `source:'client-overwrote'` → `balanceOf('gold')`
     UNKNOWN → `canAfford` fail-closed → every Buy / Sell / List control disabled
     until an unrelated hr_load or the 90-second settle happened to re-stamp.
     That is the b395 class ("the record must follow the gold verb"), restored by
     omission — and it fires on the single most common refusal there is,
     `version_conflict`, which a second tab or a racing settle produces routinely.
     b516 asserted the WRONG half of it (that a refusal writes no record at all)
     and this test replaces that contract with the reviewed one.

     WHY BELIEVING THE REFUSAL'S STATE IS CORRECT — the Security ruling, and it
     rests on a fact about the server, not on a preference. A refusal envelope is
     a DELIBERATE reconciliation aid: `supabase/functions/hr-accrue/envelope.js
     refusalBody()` attaches a **fresh `hr_state_of` read taken on the refusal
     path**, precisely because the refusal that most needs one is
     `version_conflict`, which means BY DEFINITION that the pre-call read was
     stale. The `state` / `version` / `progress` in a refusal body is therefore
     CURRENT SERVER TRUTH about this character. It is not a receipt for the verb
     — and nothing here treats it as one: the PREDICTION is still rolled back or
     abandoned by settleVerdict on the outcome, untouched by this seam. The
     record's question is only ever "what does the server say the value is", and
     a refusal body answers it with the newest reading that exists.

     THE GATE IS `envelopeOf`, AND CASE (B) IS THE ASSERTION THAT KEEPS IT ONE.
     A STATELESS refusal — the shape and pre-database codes, which the server's
     `refusalCarriesState` answers false for — has no `state`, so
     `applyGoldEnvelope` returns null at the top and writes nothing at all. The
     `ok:true` this seam adds is a statement about the ENVELOPE (validated,
     monotonic, freshly read), never about the verb.

     MUTATION-PROVED (b517, at module level against the real record.js — drop the
     `, ok: true` from the applyRecord call at the tail of applyGoldEnvelope in
     src/net/gold.js):
       · (A3), (A4) and (A5) go RED, and (A4)/(A5) report exactly
         `client-overwrote` — the live symptom, reproduced from the seam. That
         fidelity is why case (A) primes the record with a good envelope first:
         on a virgin G the same mutant only reports `unknown`, which is the
         weaker (merely uninformed) failure, not the one players hit. (A6) stays
         green in the mutant because the priming envelope already carried the
         rung; it guards the refusal's `progress` against a future narrowing.
       · (B) and (C) stay green, which is why all three are here: (B) proves the
         widening did not swallow a stateless refusal, (C) is the b515/b227
         double-build property that the body-passing fix bought in the first
         place and that this change must not regress. */
  () => tryRun('b517 regression: a refusal envelope reconciles the record, a stateless refusal writes nothing', () => {
    const R = window.HearthriseRecord;
    const Gd = window.HearthriseGold;
    const B = window.HearthriseBalance;
    assert(R && typeof R.applyRecord === 'function' && typeof R.recordValue === 'function',
      'record.js did not load — this whole contract is about its only writer');
    assert(Gd && typeof Gd.applyGoldEnvelope === 'function' && typeof Gd.envelopeOf === 'function'
      && typeof Gd.getGoldState === 'function',
      'gold.js applyGoldEnvelope/envelopeOf/getGoldState must be published');
    assert(B && typeof B.balanceOf === 'function',
      'balance.js balanceOf must be published — it is the reader the player actually feels');

    /* PRIVATE Gs, never window.G — so nothing global moves and the destructive-
       replacement gate sees no local progress to lose. The server balance is
       kept ABOVE the local one for the same reason: a spend reads as destructive
       on arithmetic alone and would divert every case into the consent sheet
       (a known limitation of this path), which would make the test vacuous. */
    const vBase = Date.now();          // clear whatever lastVersion the suite left
    const mkBody = (ok, version, gold) => ({
      ok, verb: 'unlock_buy', version, now: new Date(version).toISOString(),
      state: { gold: (gold === undefined ? 500 : gold), gems: 0 }, skills: {}, inventory: {},
      progress: [{ kind: 'unlock', key: 'room:forge', value: 1 }],
      ...(ok ? {} : { error: 'version_conflict', stage: 'apply' }),
    });

    try {
      /* ── PRECONDITIONS. Both halves of the seam are only measurable while
         these hold, and a silent change to either would leave this test green
         and hollow — so it says so instead of passing. */
      const env = Gd.envelopeOf(mkBody(true, vBase + 1, 500));
      assert(env && !('progress' in env),
        'envelopeOf now carries `progress`, so passing `env` and passing `body` are no longer '
        + 'distinguishable and case (C) measures nothing. Either narrow it again or retire that half '
        + 'deliberately — do not leave it green and hollow.');
      assert(Gd.envelopeOf({ ok: false, verb: 'unlock_buy', version: vBase + 1, error: 'bad_offer' }) === null,
        'envelopeOf accepted a body with no state/skills/inventory. That gate is the ONLY thing keeping '
        + 'a stateless refusal out of the record writer, and case (B) below is written to prove it holds.');

      /* ══ (A) A REFUSAL THAT CARRIES STATE **RECONCILES** THE RECORD ════════
         The refusal body is a fresh hr_state_of read. The balance moves; the
         record must move WITH it, or the player's gold reads UNKNOWN. */
      Gd.resetGold();
      const gA = { gold: 10, gems: 0, skills: {}, inventory: {} };
      /* PRIMED WITH A GOOD ENVELOPE FIRST, AND THAT IS THE FIDELITY OF THIS
         FIXTURE. A player who reaches a refusal has ALREADY had a successful
         answer, so `_record` is stamped at the old fingerprint when the refusal
         arrives — which is the difference between the mutant reporting `unknown`
         (a virgin G, merely uninformed) and `client-overwrote` (the live b395
         symptom: a stamp that now contradicts G). Start from where a player is. */
      Gd.applyGoldEnvelope(gA, mkBody(true, vBase + 1, 300), Gd.newIntentKey());
      assert(R.recordValue(gA, 'gold').source === 'server' && gA.gold === 300,
        'the priming envelope did not stamp gold — the refusal case below would then measure an '
        + 'uninformed record rather than a contradicted one, which is the weaker of the two.');
      const wA = Gd.applyGoldEnvelope(gA, mkBody(false, vBase + 2, 500), Gd.newIntentKey());
      // (A1) The call reached the apply path — not the consent sheet, not the stale branch.
      assert(wA && !wA.stale,
        'the ok:false fixture never reached the apply path (' + JSON.stringify(wA) + ') — the assertions '
        + 'below would be vacuous. Check the replacement gate and the monotonic branch.');
      // (A2) The balance was written absolutely, which is the half that was never in doubt…
      assert(gA.gold === 500,
        'the refusal envelope did not write the balance absolutely (G.gold = ' + gA.gold + '). If this '
        + 'ever stops being true the split this test is about no longer exists — re-read the seam.');
      // (A3) …and the record was stamped from the SAME answer, at the same version.
      assert(gA._record && Number(gA._record.version) === vBase + 2,
        'the record watermark did not follow the refusal envelope: ' + JSON.stringify(gA._record)
        + '. The balance moved from this answer; the record must move with it or they disagree.');
      // (A4) THE POINT, in the vocabulary the bug spoke.
      const rvA = R.recordValue(gA, 'gold');
      assert(rvA.known === true && rvA.source === 'server',
        'gold reads `' + rvA.source + '` after a refusal envelope (expected `server`). '
        + '`client-overwrote` is the live b395 symptom: applyEnvelopeState moved G.gold while the stamp '
        + 'stayed at the old fingerprint, so the record cannot vouch for a number the server itself sent.');
      // (A5) …and the reader the player actually feels.
      const bA = B.balanceOf(gA, 'gold');
      assert(bA.known === true && bA.value === 500,
        'balanceOf reports UNKNOWN (' + bA.reason + ') after a refusal envelope. That is a top bar showing '
        + 'an em dash and every Buy / Sell / List control disabled until an unrelated sync re-stamps.');
      // (A6) The rung in `progress` is current truth too, from the same fresh read.
      assert(gA.rooms && gA.rooms.forge === 1,
        'the refusal envelope’s `progress` was dropped: G.rooms = ' + JSON.stringify(gA.rooms)
        + '. It is the same fresh hr_state_of read as the balance — a refusal is not a receipt, but it '
        + 'IS the newest statement of what this character owns.');
      // (A7) The module watermark advanced, so a genuinely older answer is refused after it.
      assert(Gd.getGoldState().version === vBase + 2,
        'gold.js lastVersion did not advance on the refusal envelope (' + Gd.getGoldState().version
        + '). It is the same envelope the balance was written from; leaving it behind would let a '
        + 'strictly older answer overwrite it.');

      /* ══ (B) A **STATELESS** REFUSAL WRITES NOTHING AT ALL ═════════════════
         No state, no skills, no inventory — the server refused on shape or
         before any database work, so there is no reading to reconcile to. */
      Gd.resetGold();
      const gB = { gold: 10, gems: 0, skills: {}, inventory: {} };
      const wB = Gd.applyGoldEnvelope(gB,
        { ok: false, verb: 'unlock_buy', version: vBase + 5, error: 'bad_offer' }, Gd.newIntentKey());
      assert(wB === null,
        'a stateless refusal was applied as an envelope (' + JSON.stringify(wB) + '). envelopeOf must '
        + 'refuse it at the top of applyGoldEnvelope; anything else is the client believing a body that '
        + 'contains no server reading.');
      assert(gB.gold === 10 && gB._record === undefined,
        'a stateless refusal moved state: gold=' + gB.gold + ', _record=' + JSON.stringify(gB._record));
      assert(R.recordValue(gB, 'gold').known === false,
        'gold reads KNOWN after a stateless refusal — nothing authoritative arrived to know it from');
      assert(Gd.getGoldState().version === -1,
        'gold.js lastVersion advanced on a body carrying no envelope (' + Gd.getGoldState().version
        + '). A refusal with no reading must not raise the watermark that gates real ones.');

      /* ══ (C) AN ok:true ANSWER MARKS THE ROOM OWNED — ON THIS ENVELOPE ═════
         Kept verbatim in intent from b516: this is the b515 fix (pass the BODY,
         not the narrowed envelope) and the b227 double-build report. "Without a
         second envelope" is the whole P1 — no hr_load, no settle, no further
         call between the answer and the assertion. */
      Gd.resetGold();
      const gC = { gold: 10, gems: 0, skills: {}, inventory: {} };
      const wC = Gd.applyGoldEnvelope(gC, mkBody(true, vBase + 3), Gd.newIntentKey());
      assert(wC && !wC.stale && wC.gold === 500,
        'the ok:true fixture did not apply its balance: ' + JSON.stringify(wC));
      assert(gC.rooms && gC.rooms.forge === 1,
        'the purchased room did not land from the answer: G.rooms = ' + JSON.stringify(gC.rooms)
        + '. The rung travels as `progress[]`, which `envelopeOf` drops — so passing the narrowed '
        + 'envelope to applyRecord leaves the House rendering `Build` at the next price and the next '
        + 'tap buys the NEXT rung. That is the b227 double-build report.');
      assert(R.recordValue(gC, 'rooms').known === true,
        'the rooms record is still UNKNOWN after a successful unlock_buy — the rung was written to G '
        + 'by something other than applyRecord, which is a second writer for a server-owned field');
      assert(gC._record && Number(gC._record.version) === vBase + 3,
        'the record version did not advance to the verb envelope: ' + JSON.stringify(gC._record));
    } finally {
      Gd.resetGold();
    }
  }),

  /* ── b521 regression — "SOMETIMES THE GAME TRIPS AND DROPS MY MAX HIT TO 25" ─
     Paione, 2026-09-07, two screen recordings of ONE Wraith fight with ONE loadout:
     the weapon row read `Iron Warhammer · 3.17s` in the good frame and `· 2.4s` in the
     bad one, max hit 30 → 25, the 2H-hammer weakness gone. 2400 ms is the base tick
     with NOTHING equipped, and the hammer was still NAMED because the label is a raw
     `G.equipment.weapon` read while every NUMBER goes through equipmentMapG() →
     recordValue → the stamp. The mechanism is written once, at the fix, in
     src/net/record.js `fingerprintEquipment`. This test drives the REAL path — a
     sparse worn set through `stampRecordLikeLoad`, then the production repaint — and
     asserts the forecast inputs are IDENTICAL across it. Without the fix all five fail
     (measured: hammer→neutral, strB 12→0, defB 14→0, 3175→2400 ms, weakness→false).
     (E) is the CONTROL: a forged weapon swap on a stamped set must STILL be caught, so
     this cannot be satisfied by never fail-closing at all. */
  () => tryRun('b521 regression: a doll repaint cannot disarm the worn set (Paione — "drops my max hit to 25")', () => {
    const G = window.G;
    const R = window.HearthriseRecord;
    if (!R || typeof R.isServerOfRecord !== 'function') return;
    if (typeof window.migrateEquipmentSlots !== 'function') return;
    if (!window.ITEMS || !window.ITEMS.iron_warhammer || !window.ITEMS.leather_boots) return;
    if (!window.MONSTERS || !window.MONSTERS.wraith) return;
    const snap = snapshotG();
    try {
      /* THE SPARSE MAP THE SERVER REALLY SENDS — only the slots with a row. */
      G.equipment = { weapon: 'iron_warhammer', boots: 'leather_boots' };
      stampRecordLikeLoad(G);
      assert(R.recordValue(G, 'equipment').known === true,
        'the fixture did not arrive on the record — this test would then compare naked with naked');

      const read = () => {
        const eq = window.getEquipmentStats();
        const rolls = window.getPlayerCombatRolls(window.MONSTERS.wraith, eq);
        return { weaponType: eq.weaponType, strB: eq.strB, defB: eq.defB, spdB: eq.spdB,
          tickMs: window.combatTickMs(), maxHit: rolls.maxHit,
          weakMatched: !!(rolls.weak && rolls.weak.matched) };
      };
      const before = read();
      assert(before.weaponType === 'hammer',
        'the fixture is not swinging a hammer (' + before.weaponType + ') — nothing below can bite');

      /* ONE REPAINT. No gear changed; the player did not touch anything. */
      window.migrateEquipmentSlots();
      const after = read();

      assert(R.recordValue(G, 'equipment').known === true,
        'a doll repaint disarmed the worn set: recordValue says `'
        + R.recordValue(G, 'equipment').source + '`. migrateEquipmentSlots() only ADDS empty slots — it '
        + 'changes nothing the player is wearing — so it must not read as a second writer.');
      assert(after.weaponType === before.weaponType,
        'the weapon class was lost on a repaint: ' + before.weaponType + ' → ' + after.weaponType);
      assert(after.tickMs === before.tickMs,
        'the swing interval moved on a repaint: ' + before.tickMs + 'ms → ' + after.tickMs + 'ms. '
        + '(Paione saw exactly this as `3.17s` → `2.4s` on the weapon row mid-fight.)');
      assert(after.strB === before.strB && after.defB === before.defB && after.spdB === before.spdB,
        'gear bonuses were lost on a repaint: str ' + before.strB + '→' + after.strB
        + ', def ' + before.defB + '→' + after.defB + ', spd ' + before.spdB + '→' + after.spdB);
      assert(after.maxHit === before.maxHit,
        'max hit moved on a repaint: ' + before.maxHit + ' → ' + after.maxHit);
      assert(after.weakMatched === before.weakMatched && after.weakMatched === true,
        'the 2H-hammer weakness bonus was lost on a repaint (matched '
        + before.weakMatched + ' → ' + after.weakMatched + ')');

      /* (E) THE TEETH. A repaint is invisible; a real change to the set is not. */
      G.equipment.weapon = 'dragon_sword';
      const forged = R.recordValue(G, 'equipment');
      assert(forged.known === false && forged.source === 'client-overwrote',
        'a client weapon SWAP on a stamped set was not caught: ' + JSON.stringify(forged));
      G.equipment.weapon = 'iron_warhammer';
      delete G.equipment.boots;
      const dropped = R.recordValue(G, 'equipment');
      assert(dropped.known === false && dropped.source === 'client-overwrote',
        'a client REMOVING a worn item was not caught: ' + JSON.stringify(dropped));
    } finally { restoreG(snap); stampRecordLikeLoad(G); }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     B429 — SKILL XP IS SERVER-OF-RECORD (shipped DORMANT).
     ══════════════════════════════════════════════════════════════════════════
     The gold template applied to a MAP. These prove the whole slice through the
     REAL record.js + skill-record.js, POKING NO `_record` internals — a green
     run therefore proves the armed READ path (pick → decodeSkills → applyRecord
     → recordValue → skillXpOf) end to end, and the DORMANT default (no-op today).
     Every arm is via the __setSkillsRecordArm test seam and reverted in finally,
     so the suite leaves the flag pristine. */
  /* b456 TEST-DEBT BURN-DOWN — THE ARM LANDED, SO THE DEFAULT ASSERTION INVERTS.
     This test shipped as the "do not arm by accident" guarantee: it asserted
     SKILLS_RECORD_ARM_ENABLED === false. The rollout flipped that const, which is
     the intended end state — so keeping the old assertion would only prove the
     suite had not been updated.

     What must still be guarded is BOTH halves, and neither is weaker than before:
       (1) THE ARM IS THE SHIPPED CONTRACT. An accidental REVERT to dormant is now
           the regression, and it is exactly as silent as an accidental arm was —
           `skills` would quietly become client-authored again, which is the
           forgeable-blob hole the whole program exists to close. So the const is
           still asserted, with the opposite expected value and a message that
           names the new failure.
       (2) THE DORMANT PATH IS STILL SHIPPED CODE and must still be a byte-for-byte
           no-op, because it is the kill-switch position: skill-record.js's
           fall-through branch runs whenever the SKILLS ARM is off. An untested
           off-position is not a kill switch — and b515 is the counter-example
           that says when it stops being true: the b353 master switch's off
           position was untested for so long that it had quietly become a
           divergent client-authored game, and the answer was to delete the
           position rather than to test it. This one is a per-field ARM with a
           published seam and a real rollout ahead of it, so it is driven
           explicitly through `__setSkillsRecordArm` and restored to PRISTINE in
           `finally`. */
  () => tryRun('B429-1: ARMED by default — skills is on the active registry; the dormant seam still falls through to G.skills', () => {
    const R = window.HearthriseRecord;
    const S = window.HearthriseSkillRecord;
    assert(R && typeof R.isServerOfRecord === 'function' && typeof R.isSkillsRecordArmed === 'function',
      'record.js did not load with the skills arm seam');
    assert(S && typeof S.skillXpOf === 'function', 'skill-record.js did not load — the read side is the contract');
    // The shipped default is ARMED. A revert to dormant re-opens the forgeable blob.
    assert(R.SKILLS_RECORD_ARM_ENABLED === true,
      'SKILLS_RECORD_ARM_ENABLED shipped FALSE — skills would fall back to the client-authored blob, un-arming the record');
    assert(R.isSkillsRecordArmed() === true, 'skills reports dormant with the flag on (is the master accrual switch off in this run?)');
    assert(R.isServerOfRecord('skills') === true, 'skills is NOT on the ACTIVE registry while armed — the strip would not fire');
    assert(R.serverOfRecordFields().indexOf('skills') !== -1, 'serverOfRecordFields omits an armed field');
    // ARMED: the strip removes G.skills from any blob on the way in.
    const armedStrip = R.stripServerOfRecord({ skills: { mining: 4000 }, gold: 5, foo: 1 });
    assert(armedStrip.stripped.indexOf('skills') !== -1, 'the armed strip left skills in the blob — it is still client-authored');
    assert(!('skills' in armedStrip.blob), 'skills survived the armed strip');
    assert('foo' in armedStrip.blob, 'the strip removed a key it does not own');
    // ARMED: a local map nothing vouched for is UNKNOWN — never the forgeable number.
    const forged = S.skillXpOf({ skills: { mining: 999999 } }, 'mining');
    assert(forged.known === false && forged.value === null,
      'an unstamped armed skill was not UNKNOWN — the forged local value crossed: ' + JSON.stringify(forged));

    // ── THE DORMANT (kill-switch) POSITION, driven explicitly and restored. ──
    try {
      R.__setSkillsRecordArm(false);
      assert(R.isSkillsRecordArmed() === false, 'the dormant seam did not take');
      assert(R.isServerOfRecord('skills') === false, 'skills stayed on the ACTIVE registry with the seam off');
      assert(R.serverOfRecordFields().indexOf('skills') === -1, 'serverOfRecordFields lists a dormant field');
      // A dormant read is byte-for-byte the raw local read.
      const g = { skills: { mining: 4000, hitpoints: 1154 } };
      const b = S.skillXpOf(g, 'mining');
      assert(b.known === true && b.value === 4000 && b.source === 'local', 'dormant skillXpOf did not answer the local value: ' + JSON.stringify(b));
      assert(S.skillXpOf(g, 'fishing').value === 0 && S.skillXpOf(g, 'fishing').known === true, 'an unlisted skill on a present local map is 0, known');
      // Dormant strip leaves G.skills alone.
      const strip = R.stripServerOfRecord({ skills: { mining: 4000 }, gold: 5 });
      assert(strip.stripped.indexOf('skills') === -1, 'dormant strip removed skills from the blob — that is arming by accident');
    } finally {
      R.__setSkillsRecordArm(null);
    }
  }),

  () => tryRun('B429-2: decodeSkills / fingerprintSkills — the map off the wire, fail-closed', () => {
    const R = window.HearthriseRecord;
    assert(typeof R.decodeSkills === 'function' && typeof R.fingerprintSkills === 'function', 'skills decode/fingerprint not published');
    // The wire shape hr_state_of sends: {id:{xp,level}} → G shape {id: xp}.
    const dec = R.decodeSkills({ mining: { xp: 4000, level: 40 }, hitpoints: { xp: 1154, level: 10 } });
    assert(dec && dec.mining === 4000 && dec.hitpoints === 1154, 'decodeSkills did not flatten the wire map: ' + JSON.stringify(dec));
    assert(typeof dec.mining === 'number', 'decodeSkills stored a structured cell instead of the flat xp number (a derived level would ride along)');
    // The flattened form (hr-accrue index.ts) also decodes.
    const dec2 = R.decodeSkills({ mining: 4000 });
    assert(dec2 && dec2.mining === 4000, 'decodeSkills did not accept the flattened {id:xp} form');
    // FAIL-CLOSED: one bad cell condemns the whole map; empty is not a character.
    assert(R.decodeSkills({ mining: { xp: -1 } }) === null, 'a negative xp cell did not condemn the map');
    assert(R.decodeSkills({ mining: { xp: 'NaN' } }) === null, 'a non-finite xp cell did not condemn the map');
    assert(R.decodeSkills({}) === null, 'an empty map decoded to a value instead of UNKNOWN');
    assert(R.decodeSkills(null) === null && R.decodeSkills([]) === null, 'a non-object decoded to a value');
    // Fingerprint is deterministic over sorted keys and never empty/NaN.
    const fa = R.fingerprintSkills({ mining: 4000, hitpoints: 1154 });
    const fb = R.fingerprintSkills({ hitpoints: 1154, mining: 4000 });
    assert(fa === fb, 'fingerprintSkills depends on key order: ' + fa + ' vs ' + fb);
    assert(fa !== 'absent' && R.fingerprintSkills({ mining: 4001 }) !== fa, 'fingerprintSkills does not distinguish a changed xp');
    assert(R.fingerprintSkills({}) === 'absent' && R.fingerprintSkills(null) === 'absent', 'an empty/absent map did not fingerprint as absent');
  }),

  () => tryRun('B429-3: ARMED — a server envelope resolves skills KNOWN; the blob is STRIPPED; unstamped is fail-closed', () => {
    const R = window.HearthriseRecord;
    const S = window.HearthriseSkillRecord;
    const A = window.HearthriseAccrual;
    const wasA = A.isServerAccrualEnabled();
    try {
      if (!wasA) A.setServerAccrualEnabled(true);   // skills only arms when the master switch is on too
      R.__setSkillsRecordArm(true);
      assert(R.isServerOfRecord('skills') === true, 'arming did not put skills on the active registry (is the master switch off in this run?)');
      // The blob strip now removes skills.
      const strip = R.stripServerOfRecord({ skills: { mining: 4000 }, level: 7, foo: 1 });
      assert(strip.stripped.indexOf('skills') !== -1, 'armed strip did NOT remove skills from the blob — it is still client-authored');
      assert(!('skills' in strip.blob), 'skills survived the strip');
      assert('foo' in strip.blob && strip.blob.level === 7, 'the strip removed a key it does not own (gold IS a record field, so it is not tested here)');

      // A fresh G with NO record → UNKNOWN, fail-closed. Never a local fallback.
      const g = { skills: { mining: 999999 } };   // a forged local value that must NOT be trusted once armed
      const before = S.skillXpOf(g, 'mining');
      assert(before.known === false && before.value === null && before.source === 'record',
        'an unstamped armed skill was not UNKNOWN — the forged local value crossed: ' + JSON.stringify(before));

      // A real server envelope arrives (skills at TOP LEVEL, the hr_load shape).
      const applied = R.applyRecord(g, {
        ok: true, version: Date.now(), now: '2026-08-21T10:00:00Z',
        state: { gold: 100 }, skills: { mining: { xp: 4000, level: 40 }, hitpoints: { xp: 1154, level: 10 } },
      });
      assert(applied && applied.written && applied.written.indexOf('skills') !== -1,
        'applyRecord did not write skills from the envelope: ' + JSON.stringify(applied));
      const after = S.skillXpOf(g, 'mining');
      assert(after.known === true && after.value === 4000 && after.source === 'server',
        'skillXpOf did not resolve the server value: ' + JSON.stringify(after));
      // The forged 999999 is gone — the record replaced the map wholesale.
      assert(g.skills.mining === 4000, 'the server envelope did not overwrite the forged local xp: ' + g.skills.mining);
      // An unlisted skill under a KNOWN map is 0, KNOWN (server authoritative).
      assert(S.skillXpOf(g, 'cooking').known === true && S.skillXpOf(g, 'cooking').value === 0,
        'an unlisted skill under a known server map was not 0/known');
    } finally {
      R.__setSkillsRecordArm(null);
      if (!wasA) A.setServerAccrualEnabled(false);
    }
  }),

  () => tryRun('B429-4: ARMED — monotonic; a stale envelope cannot rewind a known skills map', () => {
    const R = window.HearthriseRecord;
    const S = window.HearthriseSkillRecord;
    const A = window.HearthriseAccrual;
    const wasA = A.isServerAccrualEnabled();
    try {
      if (!wasA) A.setServerAccrualEnabled(true);
      R.__setSkillsRecordArm(true);
      const g = {};
      const vNew = Date.now();
      R.applyRecord(g, { ok: true, version: vNew, now: '2026-08-21T11:00:00Z',
        state: { gold: 1 }, skills: { mining: { xp: 5000, level: 44 } } });
      assert(S.skillXpNum(g, 'mining') === 5000, 'the fresh map did not apply');
      // A STALE (older-version) envelope carrying LOWER xp must not rewind a KNOWN field.
      const res = R.applyRecord(g, { ok: true, version: vNew - 1000, now: '2026-08-21T10:00:00Z',
        state: { gold: 1 }, skills: { mining: { xp: 10, level: 1 } } });
      assert(res.skipped === 'stale', 'a stale envelope on a fully-known record was not skipped: ' + JSON.stringify(res));
      assert(S.skillXpNum(g, 'mining') === 5000, 'a stale envelope rewound the skills map from 5000 to ' + S.skillXpNum(g, 'mining'));
    } finally {
      R.__setSkillsRecordArm(null);
      if (!wasA) A.setServerAccrualEnabled(false);
    }
  }),

  () => tryRun('B429-5: ARMED — the device-handoff divergence for skills collapses to zero (the reconcile-modal cause)', () => {
    const R = window.HearthriseRecord;
    const S = window.HearthriseSkillRecord;
    const A = window.HearthriseAccrual;
    const wasA = A.isServerAccrualEnabled();
    try {
      if (!wasA) A.setServerAccrualEnabled(true);
      R.__setSkillsRecordArm(true);
      /* Two devices. Device A last uploaded a snapshot whose skills say mining=8000.
         Device B's local blob is AHEAD/BEHIND with mining=3000 (the client-authored
         divergence that surfaced the handoff reconcile modal). Under the record,
         BOTH are stripped and neither is authority — the SERVER map is the only
         source, so the two devices cannot disagree. */
      const deviceA = R.stripServerOfRecord({ skills: { mining: 8000 }, gold: 1 }).blob;
      const deviceB = R.stripServerOfRecord({ skills: { mining: 3000 }, gold: 1 }).blob;
      assert(!('skills' in deviceA) && !('skills' in deviceB), 'a device blob kept its client-authored skills after the strip');
      // Both devices load the SAME server envelope → identical, divergence == 0.
      const gA = Object.assign({}, deviceA);
      const gB = Object.assign({}, deviceB);
      const env = { ok: true, version: Date.now(), now: '2026-08-21T12:00:00Z',
        state: { gold: 1 }, skills: { mining: { xp: 6000, level: 47 } } };
      R.applyRecord(gA, env);
      R.applyRecord(gB, env);
      const a = S.skillXpNum(gA, 'mining'), b = S.skillXpNum(gB, 'mining');
      assert(a === 6000 && b === 6000, 'the devices did not converge on the server value: A=' + a + ' B=' + b);
      assert(a - b === 0, 'the device-handoff skills divergence did not collapse to zero: ' + (a - b));
    } finally {
      R.__setSkillsRecordArm(null);
      if (!wasA) A.setServerAccrualEnabled(false);
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     B433 — EQUIPMENT IS SERVER-OF-RECORD (shipped DORMANT).
     ══════════════════════════════════════════════════════════════════════════
     The skills template applied to the WORN SET. The equip WRITE already moved
     (equip.js → hr_apply), and hr_state_of already projects `equipment` at the
     envelope top level, so this slice is the LOAD copy only. These prove the whole
     path through the REAL record.js — pick → decodeEquipment → applyRecord →
     recordValue — poking NO `_record` internals, and the DORMANT default (no-op
     today). Every arm is via the __setEquipmentRecordArm seam, reverted in finally,
     so the suite leaves the flag pristine. */
  /* b456 TEST-DEBT BURN-DOWN — see B429-1's note. Same inversion, same two halves:
     the arm is now the shipped contract (a revert re-opens the client-authored
     worn set), and the dormant fall-through is still the kill-switch position and
     still asserted, driven through the seam and restored. */
  () => tryRun('B433-1: ARMED by default — equipment is on the active registry and the strip fires; the dormant seam does not', () => {
    const R = window.HearthriseRecord;
    assert(R && typeof R.isEquipmentRecordArmed === 'function', 'record.js did not load with the equipment arm seam');
    // The shipped default is ARMED. A revert to dormant re-opens the forgeable worn set.
    assert(R.EQUIPMENT_RECORD_ARM_ENABLED === true,
      'EQUIPMENT_RECORD_ARM_ENABLED shipped FALSE — the worn set would fall back to the client-authored blob');
    assert(R.isEquipmentRecordArmed() === true, 'equipment reports dormant with the flag on (is the master accrual switch off in this run?)');
    assert(R.isServerOfRecord('equipment') === true, 'equipment is NOT on the ACTIVE registry while armed — the strip would not fire');
    assert(R.serverOfRecordFields().indexOf('equipment') !== -1, 'serverOfRecordFields omits an armed field');
    // ARMED: the strip removes the worn set from any blob on the way in.
    const armed = R.stripServerOfRecord({ equipment: { weapon: 'dragon_sword' }, foo: 1 });
    assert(armed.stripped.indexOf('equipment') !== -1, 'the armed strip left equipment in the blob — it is still client-authored');
    assert(!('equipment' in armed.blob), 'equipment survived the armed strip');
    assert('foo' in armed.blob, 'the strip removed a key it does not own');
    // ARMED: an unvouched local set is UNKNOWN — never the forged dragon sword.
    const forged = R.recordValue({ equipment: { weapon: 'dragon_sword' } }, 'equipment');
    assert(forged.known === false, 'an unstamped armed worn set was reported KNOWN: ' + JSON.stringify(forged));

    // ── THE DORMANT (kill-switch) POSITION, driven explicitly and restored. ──
    try {
      R.__setEquipmentRecordArm(false);
      assert(R.isEquipmentRecordArmed() === false, 'the dormant seam did not take');
      assert(R.isServerOfRecord('equipment') === false, 'equipment stayed on the ACTIVE registry with the seam off');
      assert(R.serverOfRecordFields().indexOf('equipment') === -1, 'serverOfRecordFields lists a dormant field');
      // A dormant strip leaves G.equipment in the blob (client-owned in the off position).
      const strip = R.stripServerOfRecord({ equipment: { weapon: 'bronze_sword' }, foo: 1 });
      assert(strip.stripped.indexOf('equipment') === -1, 'dormant strip removed equipment from the blob — that is arming by accident');
      assert('equipment' in strip.blob, 'dormant strip dropped equipment');
    } finally {
      R.__setEquipmentRecordArm(null);
    }
  }),

  () => tryRun('B433-2: decodeEquipment / fingerprintEquipment — the worn set off the wire, fail-closed', () => {
    const R = window.HearthriseRecord;
    assert(typeof R.decodeEquipment === 'function' && typeof R.fingerprintEquipment === 'function', 'equipment decode/fingerprint not published');
    // The wire shape hr_state_of sends: {equip_slot: item_id}, same shape the client holds.
    const dec = R.decodeEquipment({ weapon: 'iron_sword', shield: 'oak_shield' });
    assert(dec && dec.weapon === 'iron_sword' && dec.shield === 'oak_shield', 'decodeEquipment did not pass the worn set: ' + JSON.stringify(dec));
    // An explicit empty slot (null) is a valid, KNOWN state.
    const dn = R.decodeEquipment({ weapon: 'iron_sword', shield: null });
    assert(dn && dn.weapon === 'iron_sword' && dn.shield === null, 'decodeEquipment rejected an explicit null slot: ' + JSON.stringify(dn));
    // ⚠ THE DIVERGENCE FROM SKILLS: {} is KNOWN-empty (naked character), NOT UNKNOWN.
    const empty = R.decodeEquipment({});
    assert(empty !== null && typeof empty === 'object' && Object.keys(empty).length === 0,
      'an empty worn set decoded to UNKNOWN instead of a KNOWN-empty set: ' + JSON.stringify(empty));
    // ABSENT (undefined/null at the top) IS UNKNOWN — the only UNKNOWN case.
    assert(R.decodeEquipment(undefined) === null && R.decodeEquipment(null) === null, 'an absent equipment key did not decode to UNKNOWN');
    // FAIL-CLOSED: a bad slot name or a bad item id condemns the whole set.
    assert(R.decodeEquipment({ 'BAD SLOT': 'iron_sword' }) === null, 'a malformed slot name did not condemn the set');
    assert(R.decodeEquipment({ weapon: 'Iron Sword!' }) === null, 'a malformed item id did not condemn the set');
    assert(R.decodeEquipment({ weapon: 5 }) === null, 'a non-string item did not condemn the set');
    assert(R.decodeEquipment([]) === null, 'an array decoded to a value');
    // Fingerprint: deterministic over sorted keys, never empty, distinguishes changes.
    const fa = R.fingerprintEquipment({ weapon: 'iron_sword', shield: 'oak_shield' });
    const fb = R.fingerprintEquipment({ shield: 'oak_shield', weapon: 'iron_sword' });
    assert(fa === fb, 'fingerprintEquipment depends on key order: ' + fa + ' vs ' + fb);
    assert(fa !== 'absent' && R.fingerprintEquipment({ weapon: 'steel_sword', shield: 'oak_shield' }) !== fa,
      'fingerprintEquipment does not distinguish a changed slot');
    // KNOWN-empty fingerprints as a real token, distinct from UNKNOWN's 'absent'.
    assert(R.fingerprintEquipment({}) !== 'absent' && R.fingerprintEquipment({}) !== R.fingerprintEquipment(null),
      'a known-empty set collided with the absent fingerprint');
  }),

  () => tryRun('B433-3: ARMED — a server envelope resolves equipment KNOWN; the blob is STRIPPED; a forged local set is ignored', () => {
    const R = window.HearthriseRecord;
    const A = window.HearthriseAccrual;
    const wasA = A.isServerAccrualEnabled();
    try {
      if (!wasA) A.setServerAccrualEnabled(true);   // equipment only arms when the master switch is on too
      R.__setEquipmentRecordArm(true);
      assert(R.isServerOfRecord('equipment') === true, 'arming did not put equipment on the active registry (is the master switch off in this run?)');
      // The blob strip now removes equipment.
      const strip = R.stripServerOfRecord({ equipment: { weapon: 'dragon_sword' }, foo: 1 });
      assert(strip.stripped.indexOf('equipment') !== -1, 'armed strip did NOT remove equipment — it is still client-authored');
      assert(!('equipment' in strip.blob), 'equipment survived the strip');
      assert('foo' in strip.blob, 'the strip removed a key it does not own');

      // A fresh G whose local set is FORGED (a dragon sword the player never earned)
      // → UNKNOWN before any envelope, fail-closed via recordValue. Never trusted.
      const g = { equipment: { weapon: 'dragon_sword' } };
      const before = R.recordValue(g, 'equipment');
      assert(before.known === false, 'an unstamped armed equipment set was reported KNOWN — the forged set crossed: ' + JSON.stringify(before));

      // A real server envelope arrives (equipment at TOP LEVEL, the hr_load shape).
      const applied = R.applyRecord(g, {
        ok: true, version: Date.now(), now: '2026-08-22T10:00:00Z',
        state: { gold: 100 }, equipment: { weapon: 'bronze_sword', shield: null },
      });
      assert(applied && applied.written && applied.written.indexOf('equipment') !== -1,
        'applyRecord did not write equipment from the envelope: ' + JSON.stringify(applied));
      const after = R.recordValue(g, 'equipment');
      assert(after.known === true && after.source === 'server', 'recordValue did not resolve the server equipment set: ' + JSON.stringify(after));
      assert(g.equipment.weapon === 'bronze_sword', 'the server envelope did not overwrite the forged local weapon: ' + JSON.stringify(g.equipment));
    } finally {
      R.__setEquipmentRecordArm(null);
      if (!wasA) A.setServerAccrualEnabled(false);
    }
  }),

  () => tryRun('B433-4: ARMED — KNOWN-empty (naked) is authoritative; a client re-equip after the strip is caught by the fingerprint', () => {
    const R = window.HearthriseRecord;
    const A = window.HearthriseAccrual;
    const wasA = A.isServerAccrualEnabled();
    try {
      if (!wasA) A.setServerAccrualEnabled(true);
      R.__setEquipmentRecordArm(true);
      // The server says the character is wearing NOTHING (unequipped all). That is
      // an authoritative KNOWN-empty set, not UNKNOWN.
      const g = {};
      R.applyRecord(g, { ok: true, version: Date.now(), now: '2026-08-22T11:00:00Z',
        state: { gold: 1 }, equipment: {} });
      const rv = R.recordValue(g, 'equipment');
      assert(rv.known === true && rv.source === 'server', 'a server-empty equipment set was not KNOWN: ' + JSON.stringify(rv));
      assert(g.equipment && Object.keys(g.equipment).length === 0, 'the empty set did not apply as {}: ' + JSON.stringify(g.equipment));
      // A SECOND writer (a client re-equip) mutates G behind the record's back.
      // recordValue must catch it via the fingerprint and fail-closed to UNKNOWN.
      g.equipment.weapon = 'dragon_sword';
      const tampered = R.recordValue(g, 'equipment');
      assert(tampered.known === false && tampered.source === 'client-overwrote',
        'a client write to a known equipment set was not caught by the fingerprint: ' + JSON.stringify(tampered));
    } finally {
      R.__setEquipmentRecordArm(null);
      if (!wasA) A.setServerAccrualEnabled(false);
    }
  }),

  () => tryRun('B433-5: ARMED — monotonic; a stale envelope cannot rewind a known equipment set but fills a gap', () => {
    const R = window.HearthriseRecord;
    const A = window.HearthriseAccrual;
    const wasA = A.isServerAccrualEnabled();
    try {
      if (!wasA) A.setServerAccrualEnabled(true);
      R.__setEquipmentRecordArm(true);
      const g = {};
      const vNew = Date.now();
      R.applyRecord(g, { ok: true, version: vNew, now: '2026-08-22T12:00:00Z',
        state: { gold: 1 }, equipment: { weapon: 'steel_sword' } });
      assert(g.equipment.weapon === 'steel_sword', 'the fresh equipment set did not apply');
      // A STALE (older-version) envelope carrying a DIFFERENT set must not rewind
      // the KNOWN set.
      const res = R.applyRecord(g, { ok: true, version: vNew - 1000, now: '2026-08-22T11:00:00Z',
        state: { gold: 1 }, equipment: { weapon: 'bronze_sword' } });
      assert(res.skipped === 'stale', 'a stale envelope on a fully-known record was not skipped: ' + JSON.stringify(res));
      assert(g.equipment.weapon === 'steel_sword', 'a stale envelope rewound the equipment set to ' + JSON.stringify(g.equipment));
    } finally {
      R.__setEquipmentRecordArm(null);
      if (!wasA) A.setServerAccrualEnabled(false);
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     B429-6 — THE CLIENT READ-SITE SWEEP. legacy.js's skill-xp/level reads now go
     through the accessor (getLevel → skillLevelOf, the display xp reads → skillXp
     → skillXpOr). This is the analogue of the gold `balanceOf` sweep done BEFORE
     gold armed: while dormant the accessor returns the raw local value, so a
     faithful sweep must change NOTHING today. This asserts exactly that — the
     swept seams are byte-for-byte the classic reads — plus the one behaviour the
     sweep ADDS for the armed future: getLevel fail-closes to the floor level on
     UNKNOWN rather than returning null/NaN or opening a gate.
     MUTATION: revert the getLevel edit → armed-UNKNOWN returns null → the last
     assertion goes red; break skillXp → the dormant-identity loop goes red. */
  /* b456 TEST-DEBT BURN-DOWN. The dormant-identity half used to be readable
     "for free" because dormant WAS the shipped default; it no longer is, so it is
     driven through the __setSkillsRecordArm seam (and restored) exactly like the
     kill-switch half of B429-1. The property is unchanged: with the record off,
     the swept seams must be the classic raw reads, byte for byte.
     The armed half is UNCHANGED and is now also the shipped position. */
  () => tryRun('B429-6: the legacy read-site sweep is behavior-identical while DORMANT; getLevel fail-closes when ARMED+UNKNOWN', () => {
    const R = window.HearthriseRecord;
    assert(R && typeof R.__setSkillsRecordArm === 'function', 'record.js did not load with the skills arm seam');
    assert(typeof window.getLevel === 'function' && typeof window.skillXp === 'function',
      'legacy.js did not expose the swept getLevel/skillXp seam');
    const G = window.G;
    const core = window.HearthriseCore.xp;
    try {
      /* DORMANT, forced: the kill-switch position, where the accessor must be a
         no-op wrapper around the raw local read. Predictions do not exist here —
         with the write gate open addXp writes G.skills directly — so display and
         raw must agree exactly. */
      R.__setSkillsRecordArm(false);
      assert(R.isSkillsRecordArmed() === false, 'the dormant seam did not take — the identity half below would be vacuous');
      // Cover the live skills plus a few well-known ids and one that is absent.
      const ids = Object.keys((G && G.skills) || {}).concat(['mining', 'hitpoints', 'attack', 'cooking', '__nope__']);
      for (const id of ids) {
        const raw = (G.skills && G.skills[id]) || 0;
        assert(window.skillXp(id) === raw,
          'dormant skillXp diverged from the raw local read for "' + id + '": ' + window.skillXp(id) + ' vs ' + raw);
        assert(window.getLevel(id) === core.levelOf(G.skills, id),
          'dormant getLevel diverged from levelOf for "' + id + '": ' + window.getLevel(id) + ' vs ' + core.levelOf(G.skills, id));
      }
    } finally {
      R.__setSkillsRecordArm(null);
    }
    /* ── ARMED + NOTHING HAS ARRIVED ────────────────────────────────────────
       b456 TEST-DEBT BURN-DOWN, and this half is a genuine SEMANTIC change, not
       a harness gap — so it is restated rather than re-tuned.

       b429 wired `getLevel` to the AUTHORITY accessor and floored UNKNOWN to 1.
       Live, that turned one un-gated `G.skills` write into "my woodcutting is
       bouncing from lvl 5 to lvl 1 over and over again", so b456 moved getLevel
       onto the DISPLAY ladder (skillLevelForDisplay): server value, else the
       optimistic local number, else last-known-good, else UNKNOWN.

       The property b429-6 was written to hold — a gate cannot open on an
       un-arrived skill, and nobody does arithmetic on null — is UNCHANGED and is
       asserted below in the place it now lives:
         (1) AUTHORITY still fail-closes. skillLevelOf/skillXpOf answer null on an
             unstamped map, so the forged 999999 cannot open a gate or a score.
             (B431-1 (C) proves the same thing end-to-end through renown.)
         (2) DISPLAY never returns null/NaN, and — the b456 contract — never
             collapses a real character to level 1 while a local number exists.
         (3) With `skills` genuinely ABSENT (the strip state — what a cold boot
             looks like AFTER the record framework has deleted the blob's copy and
             before the first envelope), the display DOES fail-close to the floor
             of 1, which is the original assertion in the state it truly applies
             to. */
    const A = window.HearthriseAccrual;
    const wasA = A.isServerAccrualEnabled();
    const savedSkills = G.skills, savedRec = G._record, hadSkills = Object.prototype.hasOwnProperty.call(G, 'skills');
    const S = window.HearthriseSkillRecord;
    try {
      if (!wasA) A.setServerAccrualEnabled(true);
      R.__setSkillsRecordArm(true);
      delete G._record;                 // no record → the authority is UNKNOWN
      predZero();                       // no outstanding prediction may colour the read
      G.skills = { mining: 999999 };     // a forged local value

      // (1) AUTHORITY fail-closes — the forgery cannot cross into a gate.
      assert(S.skillXpOf(G, 'mining').known === false,
        'armed+unstamped skillXpOf vouched for a forged local xp: ' + JSON.stringify(S.skillXpOf(G, 'mining')));
      assert(S.skillLevelOf(G, 'mining', window.levelFromXp) === null,
        'armed+unstamped skillLevelOf did not answer UNKNOWN — a gate could open on it');

      // (2) DISPLAY is always a finite number, and never the level-1 bounce.
      const lv = window.getLevel('mining');
      assert(typeof lv === 'number' && Number.isFinite(lv), 'armed getLevel returned a non-number: ' + lv);
      assert(lv === window.levelFromXp(999999),
        'armed getLevel collapsed a present local xp instead of showing it optimistically — that is the '
        + 'level-1 bounce b456 exists to make unreachable: ' + lv);

      // (3) THE STRIP STATE — `skills` absent — is the one that genuinely floors.
      delete G.skills;
      const floored = window.getLevel('mining');
      assert(floored === 1,
        'armed + the field STRIPPED (nothing has ever arrived) must fail-close to the floor level 1, got ' + floored);
      assert(S.skillXpForDisplay(G, 'mining').known === false,
        'the stripped state must read UNKNOWN on the display ladder too — a resurrected number would be a forgery');
    } finally {
      R.__setSkillsRecordArm(null);
      if (!wasA) A.setServerAccrualEnabled(false);
      if (hadSkills) G.skills = savedSkills; else { try { delete G.skills; } catch (e) {} }
      G._record = savedRec;
    }
  }),
  /* ══════════════════════════════════════════════════════════════════════════
     B455-1 — THE INSTANT-DISPLAY SEAM, THROUGH THE REAL ENGINE.

     tests/predict-display.mjs proves the MODULES (predict/record/skill-record/
     balance). This proves the WIRING those modules are useless without: that
     legacy.js's `addXp` — the single choke point every fx.addXp in src/core
     routes through — actually takes the prediction branch under the arm, and
     that `getLevel`/`skillXp` actually read the display side.

     THE TWO LIVE REPORTS THIS ENCODES:
       · "it all needs to be instant, drops, kills, exp, everything."
       · "my woodcutting exp is bouncing from lvl 5 to lvl 1 over and over."

     MUTATION: revert addXp's `clientMayWriteRecordField('skills')` branch → the
     record-unchanged assertion goes red (G.skills moved) AND the fingerprint
     assertion goes red. Revert getLevel to skillLevelOf → the bounce assertion
     goes red (level 1). Drop clearPredictionsFor from applyRecord → the
     no-double-count assertion goes red. */
  () => tryRun('B455-1: ARMED, a grant is INSTANT on the display and leaves the record byte-unchanged', () => {
    const R = window.HearthriseRecord, A = window.HearthriseAccrual, P = window.HearthrisePredict;
    if (!R || !A || !P) return;   // modules not attached (a stripped harness) — nothing to prove
    const G = window.G;
    const wasA = A.isServerAccrualEnabled();
    const savedSkills = G.skills, savedRec = G._record, savedPred = G._pred, savedHp = G.playerMaxHp;
    try {
      if (!wasA) A.setServerAccrualEnabled(true);
      R.__setSkillsRecordArm(true);
      assert(window.clientMayWriteRecordField('skills') === false,
        'ARMED SETUP: the skills write gate is open, so addXp would never take the prediction branch '
        + 'and everything below would pass vacuously.');
      P.resetPredictions(G);
      delete G._record;
      /* A real envelope, applied by the real applyRecord — so the fingerprint
         under test is the one the live path stamps, not one this test invented. */
      const now = new Date().toISOString();
      const env = { ok: true, version: 900001, now,
        state: { accrued_to: now, gold: 5000, gems: 0, marks: 0, rested_xp: 0, rested_at: now },
        skills: { woodcutting: 50000, hitpoints: 50000 }, equipment: {}, progress: [] };
      R.applyRecord(G, env);
      assert(R.recordValue(G, 'skills').known === true, 'SETUP: the record did not stamp skills');

      const stamped = JSON.stringify(G.skills);
      const lvBefore = window.getLevel('woodcutting');
      const xpBefore = window.skillXp('woodcutting');

      window.addXp('woodcutting', 40, { authored: true });

      /* THE GAIN IS NOT ASSERTED AGAINST A LITERAL. The perk stack (renown allXP,
         rooms, a companion) is a legitimate multiplier on top of an authored
         grant, so a test that expected exactly 40 would fail the first time a
         rank was earned mid-suite — the same reasoning the b226 pacing tests
         already state. What is asserted is the RELATIONSHIP: whatever the engine
         paid, all of it landed in the prediction and none of it in the record. */
      const gain = P.predictedXp(G, 'woodcutting');
      assert(JSON.stringify(G.skills) === stamped,
        'ARMED: addXp WROTE G.skills. Under the arm that trips the b347 fingerprint and every skill '
        + 'collapses to level 1 until the next settle — the live bounce. Got ' + JSON.stringify(G.skills));
      assert(R.recordValue(G, 'skills').known === true,
        'ARMED: the record stopped vouching for skills after a grant — something moved a stamped field.');
      assert(gain > 0,
        'ARMED: the grant was not recorded as a prediction at all — the player would see nothing '
        + 'happen until the next settle.');
      assert(window.skillXp('woodcutting') === xpBefore + gain,
        'INSTANT: the displayed xp did not move by the predicted gain (' + window.skillXp('woodcutting')
        + ' vs ' + (xpBefore + gain) + '). This IS "nothing happens for 90 seconds".');
      assert(window.getLevel('woodcutting') >= lvBefore,
        'INSTANT: the displayed level went BACKWARDS after a grant.');

      /* THE SETTLE. The server restates the truth INCLUDING that grant, with a
         watermark that covers it (`accrued_to === now`), so the prediction must
         retire — and the display must not double-count it. */
      const env2 = { ok: true, version: 900002, now,
        state: { accrued_to: now, gold: 5000, gems: 0, marks: 0, rested_xp: 0, rested_at: now },
        skills: { woodcutting: 50000 + gain, hitpoints: 50000 }, equipment: {}, progress: [] };
      R.applyRecord(G, env2);
      assert(P.predictedXp(G, 'woodcutting') === 0,
        'RECONCILE: a prediction the envelope\'s watermark COVERS survived it — the next render '
        + 'double-counts the grant, and every settle after that adds another copy.');
      assert(window.skillXp('woodcutting') === 50000 + gain,
        'RECONCILE: the display DOUBLE-COUNTED the settled grant (' + window.skillXp('woodcutting')
        + ' vs ' + (50000 + gain) + ').');

      /* ── THE ANTI-REWIND, THROUGH THE ENGINE ────────────────────────────────
         A grant made AFTER the window an envelope settles must SURVIVE it. This
         is the live "gold 501 → 500, atkXp 5 → 1" rewind, reproduced at the seam
         it happened at: the server settles a lagging window and must not be
         allowed to delete what the player has already watched land. */
      const shown = window.skillXp('woodcutting');
      window.addXp('woodcutting', 40, { authored: true });
      const shownAfterGrant = window.skillXp('woodcutting');
      assert(shownAfterGrant > shown, 'ANTI-REWIND SETUP: the second grant did not show');
      /* An envelope that has settled only up to 60 seconds ago — i.e. before that
         grant existed — and therefore restates the OLD number. */
      const lagged = { ok: true, version: 900003, now,
        state: { accrued_to: new Date(Date.parse(now) - 60000).toISOString(),
          gold: 5000, gems: 0, marks: 0, rested_xp: 0, rested_at: now },
        skills: { woodcutting: 50000 + gain, hitpoints: 50000 }, equipment: {}, progress: [] };
      R.applyRecord(G, lagged);
      assert(window.skillXp('woodcutting') === shownAfterGrant,
        'ANTI-REWIND: a settle whose watermark PREDATES the grant rewound the display ('
        + shownAfterGrant + ' → ' + window.skillXp('woodcutting') + '). The envelope says nothing '
        + 'about that grant; deleting it is taking back progress the player watched happen.');
    } finally {
      R.__setSkillsRecordArm(null);
      if (!wasA) A.setServerAccrualEnabled(false);
      try { P.resetPredictions(G); } catch (e) {}
      G.skills = savedSkills; G._record = savedRec; G.playerMaxHp = savedHp;
      if (savedPred === undefined) { try { delete G._pred; } catch (e) {} } else { G._pred = savedPred; }
    }
  }),

  /* B455-2 — THE BOUNCE IS UNREACHABLE, AND THE KILL'S GOLD IS A PREDICTION.
     Half one reproduces the live defect at the seam it happened at (a direct
     G.skills write while armed) and asserts the DISPLAY survives it. Half two
     covers the one XP-adjacent write that does NOT go through addXp: core's
     `resolveKill` writes `state.gold` directly, so COMBAT_FX.onLoot has to undo
     it into the prediction or every kill em-dashes the whole economy UI. */
  () => tryRun('B455-2: a stray stamped-field write cannot bounce the display to level 1, and a kill\'s gold is a prediction', () => {
    const R = window.HearthriseRecord, A = window.HearthriseAccrual, P = window.HearthrisePredict;
    const B = window.HearthriseBalance, CS = window.HearthriseCombatSim;
    if (!R || !A || !P || !B) return;
    const G = window.G;
    const wasA = A.isServerAccrualEnabled();
    const savedSkills = G.skills, savedRec = G._record, savedPred = G._pred, savedGold = G.gold;
    try {
      if (!wasA) A.setServerAccrualEnabled(true);
      R.__setSkillsRecordArm(true);
      P.resetPredictions(G);
      delete G._record;
      const now = new Date().toISOString();
      R.applyRecord(G, { ok: true, version: 900010, now,
        state: { accrued_to: now, gold: 5000, gems: 0, marks: 0, rested_xp: 0, rested_at: now },
        skills: { woodcutting: 50000 }, equipment: {}, progress: [] });

      /* (1) THE BOUNCE. A writer this sweep did not find. */
      G.skills.woodcutting += 1000;
      assert(R.recordValue(G, 'skills').known === false,
        'the b347 fingerprint did not notice a direct G.skills write — the authority model rests on it');
      const lv = window.getLevel('woodcutting');
      assert(lv !== 1,
        'BOUNCE: getLevel collapsed to 1 after a stray G.skills write. That is exactly '
        + '"my woodcutting exp is bouncing from lvl 5 to lvl 1 over and over again".');
      assert(lv === window.HearthriseCore.xp.levelFromXp(51000),
        'BOUNCE: the display did not fall back to the local optimistic value (got level ' + lv + ')');

      /* (2) THE KILL'S GOLD. Drive the REAL fx the combat sim calls. */
      if (CS && CS.fx && typeof CS.fx.onLoot === 'function') {
        R.applyRecord(G, { ok: true, version: 900011, now,
          state: { accrued_to: now, gold: 5000, gems: 0, marks: 0, rested_xp: 0, rested_at: now },
          skills: { woodcutting: 50000 }, equipment: {}, progress: [] });
        P.resetPredictions(G);
        const goldStamped = G.gold;
        /* Exactly what src/core/combat-sim.js resolveKill does, in order. */
        G.gold = (G.gold || 0) + 17;
        CS.fx.onLoot(17, { name: 'Test Slime' }, { away: false });
        assert(G.gold === goldStamped,
          'KILL GOLD: G.gold moved. Under the arm that trips the fingerprint and the topbar em-dashes '
          + 'while every Buy/Sell control fail-closes. Got ' + G.gold + ' vs ' + goldStamped);
        assert(R.recordValue(G, 'gold').known === true,
          'KILL GOLD: the record stopped vouching for gold after a kill.');
        assert(P.predictedBalance(G, 'gold') === 17,
          'KILL GOLD: the loot was not recorded as a prediction.');
        assert(B.fmtBalance(G, 'gold') === (goldStamped + 17).toLocaleString(),
          'KILL GOLD: the displayed balance did not move on the kill (got ' + B.fmtBalance(G, 'gold') + ').');
        assert(B.balanceOf(G, 'gold').value === goldStamped,
          'KILL GOLD: the AUTHORITY balance followed the prediction — a prediction may never be spendable.');
      }
    } finally {
      R.__setSkillsRecordArm(null);
      if (!wasA) A.setServerAccrualEnabled(false);
      try { P.resetPredictions(G); } catch (e) {}
      G.skills = savedSkills; G._record = savedRec; G.gold = savedGold;
      if (savedPred === undefined) { try { delete G._pred; } catch (e) {} } else { G._pred = savedPred; }
    }
  }),

  /* B431-1 — THE features/* READ-SITE SWEEP (the second stage of the client
     skill-xp read surface; b429 did legacy.js). activities-grid / character-page /
     profile-launchpad / renown / chronicle / auto-actions / combat-screens /
     homestead / lifetime-stats now read a skill's xp through the accessor
     (window.HearthriseSkillRecord.skillXpOr) rather than off G.skills directly.
     Like the gold balanceOf sweep before gold armed, a faithful sweep must change
     NOTHING while dormant — so (A) asserts the accessor those sites all call is
     byte-for-byte the classic raw read, and (B) that renown (a swept SCORE read)
     still tracks the local map dormant. (C) is the property the sweep ADDS for the
     armed future: a forged local xp cannot cross into the renown score — armed +
     UNKNOWN floors every skill to level 1, identical to genuinely-zero skills.
     MUTATION: revert renown.js:163 back to G.skills[sk] → (C) reads the forged
     999999 as level 99 and the equality goes red; break skillXpOr's dormant
     passthrough → (A) goes red. */
  () => tryRun('B431-1: the features/* skill-xp read sweep is behavior-identical while DORMANT; renown fail-closes when ARMED+UNKNOWN', () => {
    const R = window.HearthriseRecord;
    const S = window.HearthriseSkillRecord;
    const A = window.HearthriseAccrual;
    const RN = window.HearthriseRenown;
    assert(R && typeof R.__setSkillsRecordArm === 'function', 'record.js did not load with the skills arm seam');
    assert(S && typeof S.skillXpOr === 'function', 'the skill-record accessor is not attached');
    const G = window.G;
    /* b456 TEST-DEBT BURN-DOWN: dormant is no longer the shipped default, so (A)
       and (B) — which are ABOUT the off position of the kill switch — force it
       through the seam and restore to PRISTINE. The properties are unchanged. */
    try {
      R.__setSkillsRecordArm(false);
      assert(R.isSkillsRecordArmed() === false, 'the dormant seam did not take — (A) and (B) would be vacuous');
      // (A) DORMANT IDENTITY — every swept features/* site is literally this call,
      // so the accessor equalling the classic raw read proves the sweep is a no-op.
      const ids = Object.keys((G && G.skills) || {}).concat(['mining', 'hitpoints', 'attack', 'cooking', '__nope__']);
      for (const id of ids) {
        const raw = (G.skills && G.skills[id]) || 0;
        assert(S.skillXpOr(G, id, 0) === raw,
          'dormant skillXpOr diverged from the raw read for "' + id + '": ' + S.skillXpOr(G, id, 0) + ' vs ' + raw);
      }
      // (B) DORMANT FUNCTIONAL — renown.compute (renown.js:163 swept) tracks the
      // LOCAL map while dormant: adding a trained skill raises the score, exactly as
      // the classic read did.
      if (RN && typeof RN.compute === 'function') {
        const savedSkills = G.skills;
        try {
          G.skills = { attack: 5000, mining: 3000 };
          const base = RN.compute(G);
          G.skills = { attack: 5000, mining: 3000, strength: 8000 };
          const more = RN.compute(G);
          assert(more > base, 'dormant renown did not track the local skills map (more=' + more + ' base=' + base + ')');
        } finally { G.skills = savedSkills; }
      }
    } finally {
      R.__setSkillsRecordArm(null);
    }
    // (C) ARMED + UNKNOWN — a forged local xp must not cross into the renown score.
    // With no record the accessor reads UNKNOWN → skillXpOr floors to 0 → level 1,
    // so a map of two skills at 999999 scores IDENTICALLY to two genuinely-zero
    // skills. If the sweep were reverted, the forged xp would read as level 99.
    if (RN && typeof RN.compute === 'function') {
      const wasA = A.isServerAccrualEnabled();
      try {
        const gForged = { skills: { attack: 999999, mining: 999999 } };
        // control: the SAME shape but skills genuinely at 0 (level 1), read dormant.
        R.__setSkillsRecordArm(null);
        if (A.isServerAccrualEnabled()) A.setServerAccrualEnabled(false);
        const control = RN.compute({ skills: { attack: 0, mining: 0 } });
        // armed + UNKNOWN over the forged map.
        A.setServerAccrualEnabled(true);
        R.__setSkillsRecordArm(true);
        const armed = RN.compute(gForged);
        assert(armed === control,
          'armed+UNKNOWN renown was not identical to level-1 skills — forged local xp leaked into the score: armed=' + armed + ' control=' + control);
      } finally {
        R.__setSkillsRecordArm(null);
        A.setServerAccrualEnabled(wasA);
      }
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     B431 — ROOMS / HOUSE UPGRADES ARE SERVER-OF-RECORD (shipped DORMANT), AND
     THE COOKING SETTLEMENT ARM THAT COUPLES TO IT.
     ══════════════════════════════════════════════════════════════════════════
     Same discipline as B429: exercise the REAL record.js seam through the public
     API, poke no `_record` internals, arm only via the test seam and revert in
     finally so the suite leaves every flag pristine. The DORMANT default is the
     "do not arm" guarantee in CI. */
  /* b456 TEST-DEBT BURN-DOWN — see B429-1's note. Inverted default, both halves kept. */
  () => tryRun('B431-1: rooms is ARMED by default — on the active registry and stripped; the dormant seam is not', () => {
    const R = window.HearthriseRecord;
    assert(R && typeof R.isRoomsRecordArmed === 'function', 'record.js did not load with the rooms arm seam');
    assert(R.ROOMS_RECORD_ARM_ENABLED === true,
      'ROOMS_RECORD_ARM_ENABLED shipped FALSE — room rungs would fall back to the client-authored blob, and noBurn with them');
    assert(R.isRoomsRecordArmed() === true, 'rooms reports dormant with the flag on (is the master accrual switch off in this run?)');
    assert(R.isServerOfRecord('rooms') === true, 'rooms is NOT on the ACTIVE registry while armed — the strip would not fire');
    assert(R.serverOfRecordFields().indexOf('rooms') !== -1, 'serverOfRecordFields omits an armed field');
    // ARMED strip removes G.rooms from the blob on the way in.
    const armed = R.stripServerOfRecord({ rooms: { kitchen: 3 }, gold: 5, foo: 1 });
    assert(armed.stripped.indexOf('rooms') !== -1, 'the armed strip left rooms in the blob — rungs are still client-authored');
    assert(!('rooms' in armed.blob) && 'foo' in armed.blob, 'the armed strip removed the wrong keys');

    // ── THE DORMANT (kill-switch) POSITION, driven explicitly and restored. ──
    try {
      R.__setRoomsRecordArm(false);
      assert(R.isRoomsRecordArmed() === false, 'the dormant seam did not take');
      assert(R.isServerOfRecord('rooms') === false, 'rooms stayed on the ACTIVE registry with the seam off');
      assert(R.serverOfRecordFields().indexOf('rooms') === -1, 'serverOfRecordFields lists a dormant field');
      // Dormant strip leaves G.rooms alone → no accidental client-authored loss.
      const strip = R.stripServerOfRecord({ rooms: { kitchen: 3 }, gold: 5 });
      assert(strip.stripped.indexOf('rooms') === -1, 'dormant strip removed rooms from the blob — that is arming by accident');
      assert(strip.blob.rooms && strip.blob.rooms.kitchen === 3, 'dormant strip did not preserve G.rooms');
    } finally {
      R.__setRoomsRecordArm(null);
    }
  }),

  () => tryRun('B431-2: pickRooms shapes the progress array; decodeRooms/fingerprintRooms fail-closed on ABSENCE, keep EMPTY', () => {
    const R = window.HearthriseRecord;
    assert(typeof R.pickRooms === 'function' && typeof R.decodeRooms === 'function' && typeof R.fingerprintRooms === 'function',
      'rooms pick/decode/fingerprint not published');
    // The envelope shape: room rungs ride as permanent unlock rows in `progress`.
    const env = { ok: true, progress: [
      { kind: 'unlock', key: 'room:kitchen', value: 3, period: '' },
      { kind: 'unlock', key: 'room:forge', value: 1, period: '' },
      { kind: 'unlock', key: 'property:manor', value: 2, period: '' },   // a non-room unlock — ignored
      { kind: 'stat', key: 'ev:kill_monster:goblin', value: 40, period: '' },  // a counter — ignored
    ] };
    const picked = R.pickRooms(env);
    assert(picked && picked.kitchen === 3 && picked.forge === 1, 'pickRooms did not shape the room rows: ' + JSON.stringify(picked));
    assert(!('manor' in picked) && !('property' in picked), 'pickRooms leaked a non-room unlock');
    const dec = R.decodeRooms(picked);
    assert(dec && dec.kitchen === 3 && dec.forge === 1, 'decodeRooms rejected a valid room map: ' + JSON.stringify(dec));
    // EMPTY is a valid "owns no rooms yet" (a fresh character) — NOT unknown.
    assert(R.pickRooms({ ok: true, progress: [] }) && Object.keys(R.pickRooms({ ok: true, progress: [] })).length === 0,
      'pickRooms on an empty progress array is not {}');
    const decEmpty = R.decodeRooms({});
    assert(decEmpty && typeof decEmpty === 'object' && Object.keys(decEmpty).length === 0, 'decodeRooms({}) is not a known-empty map');
    // ABSENCE (no progress array) is the UNKNOWN signal — fail-closed.
    assert(R.pickRooms({ ok: true }) === undefined, 'pickRooms without a progress array did not signal UNKNOWN');
    assert(R.decodeRooms(undefined) === null && R.decodeRooms(null) === null && R.decodeRooms([]) === null,
      'decodeRooms did not fail-closed on a non-object');
    // One bad cell condemns the whole map (save-invariant #2).
    assert(R.decodeRooms({ kitchen: -1 }) === null, 'a negative rung did not condemn the map');
    assert(R.decodeRooms({ kitchen: 'NaN' }) === null, 'a non-finite rung did not condemn the map');
    // Fingerprint: deterministic over sorted keys, empty is a stable non-absent string.
    const fa = R.fingerprintRooms({ kitchen: 3, forge: 1 });
    const fb = R.fingerprintRooms({ forge: 1, kitchen: 3 });
    assert(fa === fb, 'fingerprintRooms depends on key order: ' + fa + ' vs ' + fb);
    assert(fa !== 'absent' && R.fingerprintRooms({ kitchen: 4, forge: 1 }) !== fa, 'fingerprintRooms does not distinguish a changed rung');
    assert(R.fingerprintRooms({}) !== 'absent', 'the owns-no-rooms state must fingerprint to a real value, not absent');
    assert(R.fingerprintRooms(null) === 'absent', 'a non-object did not fingerprint absent');
  }),

  () => tryRun('B431-3: ARMED — the blob is STRIPPED and a server envelope resolves rooms KNOWN; UNKNOWN is fail-closed', () => {
    const R = window.HearthriseRecord;
    const A = window.HearthriseAccrual;
    const wasA = A.isServerAccrualEnabled();
    try {
      if (!wasA) A.setServerAccrualEnabled(true);   // rooms only arms when the master switch is on too
      R.__setRoomsRecordArm(true);
      assert(R.isServerOfRecord('rooms') === true, 'arming did not put rooms on the active registry (is the master switch off in this run?)');
      const strip = R.stripServerOfRecord({ rooms: { kitchen: 3 }, level: 7 });
      assert(strip.stripped.indexOf('rooms') !== -1, 'armed strip did NOT remove rooms from the blob — still client-authored');
      assert(!('rooms' in strip.blob) && strip.blob.level === 7, 'armed strip removed the wrong keys');

      // A fresh G with a FORGED local rooms and no record → applyRecord supplies the only value.
      const g = { rooms: { kitchen: 9 } };   // forged; must not be trusted once armed
      const env = { ok: true, version: 5, now: Date.now(), state: {}, progress: [
        { kind: 'unlock', key: 'room:kitchen', value: 3, period: '' },
      ] };
      const applied = R.applyRecord(g, env);
      assert(applied.written.indexOf('rooms') !== -1, 'applyRecord did not write rooms from the envelope');
      assert(g.rooms.kitchen === 3, 'applyRecord did not overwrite the forged local rung with the server rung');
      const rv = R.recordValue(g, 'rooms');
      assert(rv.known === true && rv.source === 'server', 'a server-supplied rooms map did not read back KNOWN/server: ' + JSON.stringify(rv));

      // A client write AFTER the stamp is caught (client-overwrote → UNKNOWN, fail-closed).
      g.rooms = { kitchen: 99 };
      const rv2 = R.recordValue(g, 'rooms');
      assert(rv2.known === false && rv2.source === 'client-overwrote', 'a client overwrite of a stamped rooms map was vouched for as server truth');
    } finally {
      R.__setRoomsRecordArm(null);
      A.setServerAccrualEnabled(wasA);
    }
  }),

  /* COOKING REAL-FIX (supersedes the R4 pause) — COOKING IS ARMED, and this
     guard pins the ARMED state so it cannot silently drift back to unpayable.

     WHY ARMED IS NOW CORRECT. The precondition the R4 pause waited on is met:
     the `noBurn` Kitchen rung is server-owned END TO END. src/legacy.js
     upgradeRoom() routes the purchase through hr_unlock_buy
     (window.HearthriseGold.buyUnlock('room.<id>.<rung>')); `rooms` is on
     record.js SERVER_OF_RECORD with ROOMS_RECORD_ARM_ENABLED=true so
     clientMayWriteRecordField('rooms')===false (the client no longer authors
     G.rooms); and the READ is hr_perks_of → makeBonus → noBurn off the
     server-owned room:kitchen rung. So serverOwnedBonusKeys() honestly includes
     noBurn → benchPayable('cooking')=true → set-activity accepts cooking and
     accrual settles it at the correct server burn rate. The client un-pauses
     because cookingPaused() reads this predicate.

     ⚠ THE TWO COOKING TWINS MOVE TOGETHER (B431-5 asserts that). If cooking
       ever reports unpayable again, this guard goes RED and points at the flag
       that regressed. artisan-sim.js is VENDORED into hr-accrue, so a flip here
       requires an Edge redeploy to take effect server-side. */
  () => tryRun('B431-4: cooking bench is ARMED-payable, noBurn is server-owned, and the disarm seam still works', () => {
    const C = window.HearthriseCore;
    const AS = C.artisanSim;
    const IA = window.HearthriseItemAuthority;
    const M = window.HearthriseActivity;
    assert(AS && typeof AS.benchPayable === 'function' && typeof AS.isCookingSettlementArmed === 'function',
      'artisan-sim did not publish the cooking arm seam');
    // The shipped default is ARMED, on BOTH halves of the coupled pair.
    assert(IA.COOKING_SETTLEMENT_ARM_ENABLED === true,
      'item-authority COOKING_SETTLEMENT_ARM_ENABLED shipped FALSE — the cooking real-fix requires TRUE (the Kitchen write is server-owned now)');
    assert(AS.COOKING_SETTLEMENT_ARM_ENABLED === true,
      'artisan-sim COOKING_SETTLEMENT_ARM_ENABLED shipped FALSE — the cooking real-fix requires TRUE');
    assert(AS.isCookingSettlementArmed() === true, 'cooking reports disarmed with the flag on');
    // ARMED: cooking is payable, noBurn is server-owned, classified payable.
    assert(AS.serverOwnedBonusKeys().indexOf('noBurn') !== -1, 'armed serverOwnedBonusKeys does not contain noBurn');
    assert(AS.benchPayable('cooking') === true, 'cooking is not payable while ARMED — the noBurn source is server-owned now');
    assert(AS.benchBlockedBy('cooking') === null, 'armed cooking still reports a blocker: ' + AS.benchBlockedBy('cooking'));
    assert(IA.ARTISAN_SETTLEMENT.cooking === 'payable', 'ARTISAN_SETTLEMENT.cooking is not payable while armed');
    // The other benches are unaffected.
    assert(AS.benchPayable('smithing') === true && AS.benchPayable('runecrafting') === true, 'a non-cooking bench lost payability');
    // THE CLIENT AGREES WITH THE SERVER: every cooking recipe is now payable and
    // declares as artisan (no downgrade), so a set-activity cooking call is a 200.
    if (M && typeof M.declarationFor === 'function') {
      const cook = (window.ARTISAN_RECIPES && window.ARTISAN_RECIPES.cooking) || [];
      assert(cook.length > 0, 'no cooking recipes found — the payable proof is vacuous');
      for (const r of cook) {
        if (!r || !r.id) continue;
        assert(M.isPayableRecipe(r.id) === true, 'a cooking recipe (' + r.id + ') is reported unpayable while armed');
        const d = M.declarationFor('artisan', r.id);
        assert(d && d.kind === 'artisan' && d.id === r.id,
          'a cooking recipe (' + r.id + ') did not declare as artisan — the client would not settle it: ' + JSON.stringify(d));
      }
    }
    // The DISARM seam still works (proves the kill-switch path is wired), then
    // reverts to the armed default so the suite leaves cooking armed.
    try {
      AS.__setCookingSettlementArm(false);
      assert(AS.isCookingSettlementArmed() === false, 'the disarm seam did not take');
      assert(AS.serverOwnedBonusKeys().indexOf('noBurn') === -1, 'disarmed serverOwnedBonusKeys still contains noBurn');
      assert(AS.benchPayable('cooking') === false, 'cooking stayed payable with the seam disarmed');
      assert(AS.benchBlockedBy('cooking') === 'noBurn', 'disarmed cooking is not reporting noBurn as its blocker: ' + AS.benchBlockedBy('cooking'));
    } finally {
      AS.__setCookingSettlementArm(null);
    }
    assert(AS.benchPayable('cooking') === true, 'the cooking seam did not revert — the suite must leave it ARMED');
  }),

  /* COOKING REAL-FIX — the DRIFT GUARD, pinning the ARMED coupling.
     The two cooking twins must move together (permanent invariant); the rooms
     record arm stays TRUE (its write path is the real-fix precondition). */
  () => tryRun('B431-5: the cooking-arm twins agree (both ARMED), rooms record stays ARMED, and cooking outputs stay INVENTORY-excluded', () => {
    const AS = window.HearthriseCore.artisanSim;
    const IA = window.HearthriseItemAuthority;
    const R = window.HearthriseRecord;
    // COUPLING DRIFT GUARD: the artisan-sim and item-authority twins must ship identical.
    assert(AS.COOKING_SETTLEMENT_ARM_ENABLED === IA.COOKING_SETTLEMENT_ARM_ENABLED,
      'the cooking-arm twin consts disagree (artisan-sim ' + AS.COOKING_SETTLEMENT_ARM_ENABLED
      + ' vs item-authority ' + IA.COOKING_SETTLEMENT_ARM_ENABLED + ') — they MUST flip together');
    // Both cooking twins are ARMED (real fix).
    assert(AS.COOKING_SETTLEMENT_ARM_ENABLED === true,
      'cooking is disarmed — the real fix requires it ARMED (both twins true) now that the server owns noBurn\'s write');
    // The rooms record arm is the write-path precondition and stays TRUE.
    assert(R.ROOMS_RECORD_ARM_ENABLED === true,
      'ROOMS_RECORD_ARM_ENABLED is false — the Kitchen rung WRITE would not be server-owned and cooking must not be armed against a client-authored rung');
    // The output-ownership safety: cooking dishes are ALWAYS excluded from the inventory
    // ownable set, so even a (future) armed cooking cannot make the absolute-replace flip
    // DELETE a live-cooked dish. Excluded wins on overlap — proven here on the real partition.
    const dishes = [...IA.cookingOutputIds()];
    assert(dishes.length > 0, 'no cooking outputs found — the exclusion proof is vacuous');
    for (const id of dishes) {
      assert(!IA.serverOwnedItem(id), 'a cooking output (' + id + ') is in the inventory ownable set — the absolute flip could delete it');
    }
  }),

  /* COOKING REAL-FIX — THE PLAYER-FACING UN-PAUSE, end to end. The R4 pause is
     lifted: cooking reports NOT paused, the screen offers a start affordance (no
     "being upgraded" banner), and a live cook CONSUMES its input, PRODUCES the
     dish and GRANTS cooking XP — the loop the pause froze. Burn is neutralised by
     a burn-proof bonus (getBonus('noBurn')=1 → burnChance clamps to 0), which the
     client doArtisanAction reads directly, so the produce path is deterministic
     without touching the rng. MUTATION: disarm the cooking twins → cookingPaused()
     goes true and the first assertion goes RED. */
  () => tryRun('COOKING-UNPAUSE: not paused, start offered, a cook consumes input + produces dish + grants cooking XP', () => {
    assert(typeof window._cookingPaused === 'function' && window._cookingPaused() === false,
      'cooking must report UN-PAUSED in this build (the real fix armed the settlement)');
    const recipe = ((window.ARTISAN_RECIPES && window.ARTISAN_RECIPES.cooking) || [])
      .find(r => r && r.id && r.output);
    assert(recipe, 'no cooking recipe with an output to exercise');
    const inputs = recipe.inputs || (recipe.input ? { [recipe.input]: recipe.inputQty || 1 } : {});
    const inIds = Object.keys(inputs);
    assert(inIds.length > 0, 'the chosen cooking recipe has no inputs — the consume proof is vacuous');
    const outId = recipe.output;

    const G = window.G;
    const realBonus = window.getBonus;
    /* Cooking is now SERVER-ACCRUED (armed), so addXp writes the display
       PREDICTION (hrPredictXp) rather than G.skills.cooking when the skills
       record is armed — reading the DISPLAY value covers both the armed and
       dormant worlds. */
    const xpView = () => {
      try { if (typeof window.hrSkillXpDisplay === 'function') return window.hrSkillXpDisplay('cooking').value || 0; }
      catch (e) {}
      return (G.skills && G.skills.cooking) || 0;
    };
    const save = {
      activeSkill: G.activeSkill, skillTargetId: G.skillTargetId, skillProgress: G.skillProgress,
      inv: {}, outHad: (G.inventory && G.inventory[outId]) || 0,
      xp: (G.skills && G.skills.cooking) || 0,
      pred: G._pred ? JSON.parse(JSON.stringify(G._pred)) : undefined,
    };
    inIds.forEach(id => { save.inv[id] = (G.inventory && G.inventory[id]) || 0; });
    try {
      G.inventory = G.inventory || {};
      inIds.forEach(id => { G.inventory[id] = 500; });
      G.skills = G.skills || {}; G.skills.cooking = save.xp;
      G.activeSkill = null; G.skillTargetId = null;
      // Burn-proof (noBurn>=1 → burnChance clamps to 0) so the produce path is
      // deterministic; doArtisanAction reads getBonus('noBurn') directly.
      window.getBonus = (k) => (k === 'noBurn' ? 1 : 0);

      // 1 — the cooking screen offers a start, NOT a pause banner.
      if (typeof window.renderSkillDetail === 'function' && document.getElementById('skill-detail')) {
        window.__viewedSkillId = 'cooking';
        window.renderSkillDetail('cooking');
        const html = document.getElementById('skill-detail').innerHTML;
        assert(!/being upgraded/i.test(html), 'the cooking screen still shows the pause banner while un-paused: ' + html.slice(0, 200));
      }

      // 2 — a production tick consumes input, produces the dish, grants cooking XP
      //     (display value = server truth + prediction; rises either way).
      const xpBefore = xpView();
      const inHad = {}; inIds.forEach(id => { inHad[id] = G.inventory[id]; });
      if (typeof window.doArtisanAction === 'function') window.doArtisanAction('cooking', recipe.id);
      let consumedAny = false;
      inIds.forEach(id => { if (G.inventory[id] < inHad[id]) consumedAny = true; });
      assert(consumedAny, 'a cook did not consume any input — the loop is still frozen');
      assert(((G.inventory[outId]) || 0) > save.outHad, 'a cook did not produce the dish (' + outId + ')');
      assert(xpView() > xpBefore, 'a cook did not grant cooking XP (display was ' + xpBefore + ', now ' + xpView() + ')');
    } finally {
      window.getBonus = realBonus;
      if (typeof window.stopSkill === 'function') try { window.stopSkill(); } catch (e) {}
      G.activeSkill = save.activeSkill; G.skillTargetId = save.skillTargetId; G.skillProgress = save.skillProgress;
      G.skills.cooking = save.xp;
      if (save.pred === undefined) delete G._pred; else G._pred = save.pred;
      inIds.forEach(id => { G.inventory[id] = save.inv[id]; });
      if (outId) G.inventory[outId] = save.outHad;
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     B353-4 — NOT SIGNED IN IS NOT AN OUTAGE.
     ══════════════════════════════════════════════════════════════════════════
     Found by the flip, and it is the clearest example of a defect that a dark
     seam cannot have: `unconfigured` (no endpoint / no token — i.e. nobody is
     signed in yet) counted toward the halt streak, so three settles raised the
     "⏳ Away progress is paused / This device is not wired to the progress
     server / Nothing has been credited for your time away" sheet.

     While the switch defaulted OFF nobody ever saw it: a device that had armed
     the switch had also signed in. With the switch defaulting ON it is what
     EVERY signed-out boot does — a scary modal over the account gate, which
     already owns that conversation, pinned to the bottom of the screen at
     z-index 2147483645. Measured in this suite before the fix: it covered the
     shop's buy control (b221) and the arena's Recommended card (b342-3), and
     its own body copy failed the 14.5px legibility floor (b227). Three
     unrelated-looking reds, one cause.

     `rate-limited` already had this exemption and states the reason: the server
     working correctly is not an outage. `unconfigured` is not even a server
     condition. It backs off, it is recorded in `lastOutcome`, it never
     escalates.

     MUTATION: drop `&& outcome !== 'unconfigured'` from accrualGateStep → red
     on the first assertion, and the three DOM tests above go red with it. */
  () => tryRun('B353-4: "not signed in" never raises the away-outage sheet (and it is a real halt for real outages)', () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.accrualGateStep === 'function', 'accrue.js did not load');
    const now = Date.now();
    let g = A.newAccrualGate();
    for (let i = 0; i < 8; i++) g = A.accrualGateStep(g, 'unconfigured', now + i * 1000, 'no_token');
    assert(g.halted === false,
      'eight `unconfigured` settles halted the gate — every signed-out boot now shows the player an '
      + '"away progress is paused" modal for the sin of not having signed in yet. It is not a server '
      + 'condition and there is nothing to retry.');
    assert(g.lastOutcome === 'unconfigured',
      'the outcome was not even recorded — exempting it from the halt must not make it invisible to a bug report');
    assert(g.blockedUntil > now, 'unconfigured did not back off, so a signed-out page would spin on it');

    /* CONTROLS. Exempting one outcome must not have switched the halt off
       wholesale — that is how this test would pass for the wrong reason. */
    let real = A.newAccrualGate();
    for (let i = 0; i < 3; i++) real = A.accrualGateStep(real, 'unreachable', now + i * 1000, 'net');
    assert(real.halted === true,
      'control: a genuine 3-strike outage no longer halts, so the sheet can never appear at all and '
      + 'B353-4 proves nothing');
    let mixed = A.newAccrualGate();
    mixed = A.accrualGateStep(mixed, 'unconfigured', now, 'no_token');
    for (let i = 1; i <= 3; i++) mixed = A.accrualGateStep(mixed, 'unavailable', now + i * 1000, '5xx');
    assert(mixed.halted === true,
      'control: an unconfigured settle before a real outage suppressed the halt — the exemption must not '
      + 'count DOWN, only not count up');
    let ok = A.accrualGateStep(real, 'accrued', now + 9000, null);
    assert(ok.halted === false && ok.streak === 0,
      'control: a success no longer clears the halt, so a recovered player is told they are broken forever');

    /* And the sheet itself is legible, because it is now a surface players
       actually reach. The b227 floor is 14.5px. */
    const el = A.showAccrualHaltedSheet('unreachable');
    try {
      assert(el, 'the halted sheet did not render at all');
      const sizes = [...el.querySelectorAll('p,button,div,strong')]
        .map((n) => parseFloat(getComputedStyle(n).fontSize))
        .filter((n) => Number.isFinite(n));
      assert(sizes.length >= 3, 'the sheet rendered almost nothing to measure');
      const small = sizes.filter((s) => s < 14.5);
      assert(small.length === 0,
        'the away-outage sheet draws text at ' + small.join('/') + 'px, under the 14.5px floor the rest of '
        + 'the game is held to. It was invisible while the sheet only rendered for an armed tester.');
    } finally {
      try { A.hideAccrualHaltedSheet(); } catch (e) {}
    }
  }),

  /* b337-OFF IS RETIRED (b515). It drove `processOffline()` with the b353 kill
     switch OFF and asserted that the LOCAL away engine still credited an
     absence, because a kill switch whose off position is untested is not a kill
     switch. There is no off position and there is no local away engine: b515
     deleted `processOffline`'s ~500-line client-side replay, and the shipping
     ON twin immediately below ("with the switch ON, processOffline puts the
     CONTRACT request on the wire") is now the whole of the away path from this
     caller. The SIMULATION those assertions were really about (an absence pays,
     from kill zero, through the same engine the Edge Function runs) is asserted
     by tests/accrual-engine.mjs `parityGuard` + `gatherParityGuard` against
     `computeAccrual` itself. */

  /* b338 made this async. NOTHING WAS WEAKENED — every assertion below is
     unchanged, including `seen.length === 1`. What changed is the timing: the
     b337 gate now runs `ensureThenAccrue()`, so the accrual request is issued
     from a `.then()` rather than synchronously inside processOffline(). One
     microtask later is not a behaviour anybody can observe (accrue.js has
     always documented that its promise is deliberately not awaited, because the
     game must not block a frame on a round trip) — but a synchronous assertion
     would read it as "no request was sent", which is a false red. The drain
     below is the fix; converting the assertion would have been the weakening. */
  () => tryRunAsync('b337: with the switch ON, processOffline puts the CONTRACT request on the wire — POST {"slot":0} + bearer', async () => {
    const A = window.HearthriseAccrual;
    const G = window.G;
    const save = { skills: G.skills, activeSkill: G.activeSkill, skillTargetId: G.skillTargetId,
      activeMonster: G.activeMonster, activeArtisanRecipe: G.activeArtisanRecipe,
      inventory: G.inventory, offlineBudget: G.offlineBudget, lastSeen: G.lastSeen, los: G.lastOfflineSummary };
    const hiddenDesc = Object.getOwnPropertyDescriptor(document, 'hidden');
    const realFetch = window.fetch;
    const seen = [];
    try {
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        seen.push({ url: String(u), init });
        return Promise.resolve(new Response('{"ok":true,"accrued":false,"reason":"below_threshold"}', { status: 200 }));
      };
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      A.resetAccrualGate();
      A.configureAccrual({ url: 'https://proj.supabase.co/', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      A.setServerAccrualEnabled(true);
      G.activeSkill = 'woodcutting'; G.activeMonster = null;
      G.lastSeen = Date.now() - 3600000;
      G.offlineBudget = { at: Date.now() - 3600000 };
      window.processOffline();
      /* Drain the microtasks the ensure→accrue chain queued. See the note above
         the test name: this is the only thing b338 changed here. */
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 20; i++) await Promise.resolve();

      assert(seen.length === 1, 'processOffline sent ' + seen.length + ' accrual requests — expected exactly 1');
      const r = seen[0];
      /* THE CONTRACT, quoted from supabase/functions/hr-accrue/index.ts +
         request.js. Every one of these is a thing the server actually reads. */
      assert(r.url === 'https://proj.supabase.co/functions/v1/hr-accrue',
        'wrong endpoint: ' + r.url + ' — the URL is derived from the configured project URL, never hand-copied');
      assert(r.init.method === 'POST', 'the accrual intent must be a POST (GET is the health probe): ' + r.init.method);
      assert(r.init.headers['Authorization'] === 'Bearer jwt-token',
        'no bearer token — the function verifies the JWT against the project JWKS and would 401');
      assert(r.init.headers['apikey'] === 'anon-key', 'no apikey header — the gateway requires one');
      assert(r.init.headers['Content-Type'] === 'application/json', 'the body is JSON and must say so');
      const body = JSON.parse(r.init.body);
      assert(Object.keys(body).length === 1 && body.slot === 0,
        'the request body carries something other than {slot}: ' + r.init.body
        + ' — request.js reads ONE integer, and anything else here is a client-authored value pretending to matter');
    } finally {
      window.fetch = realFetch;
      A.setServerAccrualEnabled(false);
      A.resetAccrualGate();
      if (hiddenDesc) Object.defineProperty(document, 'hidden', hiddenDesc); else { try { delete document.hidden; } catch (e) {} }
      Object.assign(G, { skills: save.skills, activeSkill: save.activeSkill, skillTargetId: save.skillTargetId,
        activeMonster: save.activeMonster, activeArtisanRecipe: save.activeArtisanRecipe, inventory: save.inventory,
        offlineBudget: save.offlineBudget, lastSeen: save.lastSeen, lastOfflineSummary: save.los });
    }
  }),

  () => tryRunAsync('b337: EVERY way the server can fail credits NOTHING — no silent fallback to local computation', async () => {
    const A = window.HearthriseAccrual;
    const G = window.G;
    const save = { gold: G.gold, skills: G.skills, inventory: G.inventory, activeSkill: G.activeSkill,
      skillTargetId: G.skillTargetId, activeMonster: G.activeMonster, activeArtisanRecipe: G.activeArtisanRecipe,
      offlineBudget: G.offlineBudget, lastSeen: G.lastSeen, los: G.lastOfflineSummary, restedXp: G.restedXp, restedAt: G.restedAt };
    const hiddenDesc = Object.getOwnPropertyDescriptor(document, 'hidden');
    const realFetch = window.fetch;
    /* Every failure the contract can produce. The last one is the nastiest: a
       200 that says ok+accrued but carries no envelope — "the server answered"
       is not the same as "the server told us what we earned". */
    const failures = [
      { label: 'network/CORS', throws: true },
      { label: '401 not_signed_in', status: 401, body: '{"ok":false,"error":"not_signed_in"}' },
      { label: '409 no_character', status: 409, body: '{"ok":false,"error":"no_character"}' },
      { label: '409 xp_clamp', status: 409, body: '{"ok":false,"error":"xp_clamp"}' },
      { label: '429 rate_limited', status: 429, body: '{"ok":false,"error":"rate_limited"}' },
      { label: '503 engine_unconfigured', status: 503, body: '{"ok":false,"error":"engine_unconfigured"}' },
      { label: '500 server_error', status: 500, body: '{"ok":false,"error":"server_error"}' },
      { label: '200 with no envelope', status: 200, body: '{"ok":true,"accrued":true}' },
      { label: '200 that is not JSON', status: 200, body: '<html>gateway</html>' },
    ];
    const wasParked = window.__saveParked;
    try {
      /* PARK THE SAVE. This test wipes G to a fixture and spans real
         microtask/stream boundaries, so a 90s autosave landing mid-test would
         write the fixture over the player's real save AND advance the offline
         watermark it is asserting on. */
      window.__saveParked = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      A.configureAccrual({ url: 'https://proj.supabase.co', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      A.setServerAccrualEnabled(true);
      for (const f of failures) {
        A.resetAccrualGate();
        A.hideAccrualHaltedSheet();
        window.fetch = function (u) {
          if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
          if (f.throws) return Promise.reject(new TypeError('Failed to fetch'));
          return Promise.resolve(new Response(f.body, { status: f.status }));
        };
        // A real, long, credit-worthy absence with a real activity running.
        G.gold = 777; G.skills = { woodcutting: 1000 }; G.inventory = { logs: 5 };
        G.activeSkill = 'woodcutting'; G.skillTargetId = (window.TREES && window.TREES[0] && window.TREES[0].id) || null;
        G.activeMonster = null; G.activeArtisanRecipe = null;
        /* restedAt is the OTHER local watermark processOffline touches, and it
           advances whenever a whole charge is due regardless of whether the
           player has the cap to bank it — so it is observable proof that
           accrueRestedXp() did not run, which no assertion on restedXp itself
           could give (a cap of 0 makes that one always-true). */
        G.restedXp = 0; G.restedAt = Date.now() - 8 * 3600000;
        const restedAtBefore = G.restedAt;
        const watermark = Date.now() - 8 * 3600000;
        G.lastSeen = watermark; G.offlineBudget = { at: watermark };
        G.lastOfflineSummary = null;

        window.processOffline();
        await A.requestAccrual({ force: true }).catch(() => {});
        await Promise.resolve();

        assert(G.gold === 777, f.label + ': gold moved to ' + G.gold + ' — the client computed a grant the server never authorised');
        assert(G.skills.woodcutting === 1000, f.label + ': XP moved to ' + G.skills.woodcutting + ' — a local fallback is running');
        assert(G.inventory.logs === 5 && Object.keys(G.inventory).length === 1,
          f.label + ': the inventory changed — ' + JSON.stringify(G.inventory));
        assert(G.lastOfflineSummary === null,
          f.label + ': a welcome-back receipt was written for an absence nobody paid — ' + JSON.stringify(G.lastOfflineSummary));
        assert(G.restedAt === restedAtBefore,
          f.label + ': the rested-XP watermark advanced — the authority gate is not the FIRST statement of processOffline, '
          + 'so a local system is still crediting elapsed time');
        assert(G.offlineBudget.at === watermark,
          f.label + ': the local watermark advanced to ' + G.offlineBudget.at
          + ' — a failed accrual just confiscated the absence it declined to pay for');
      }
    } finally {
      window.fetch = realFetch;
      A.setServerAccrualEnabled(false);
      A.resetAccrualGate();
      A.hideAccrualHaltedSheet();
      if (hiddenDesc) Object.defineProperty(document, 'hidden', hiddenDesc); else { try { delete document.hidden; } catch (e) {} }
      Object.assign(G, { gold: save.gold, skills: save.skills, inventory: save.inventory, activeSkill: save.activeSkill,
        skillTargetId: save.skillTargetId, activeMonster: save.activeMonster, activeArtisanRecipe: save.activeArtisanRecipe,
        offlineBudget: save.offlineBudget, lastSeen: save.lastSeen, lastOfflineSummary: save.los,
        restedXp: save.restedXp, restedAt: save.restedAt });
      window.__saveParked = wasParked;
    }
  }),

  () => tryRunAsync('b337: the server\'s answer REPLACES local state — it is not merged with it', async () => {
    const A = window.HearthriseAccrual;
    const G = window.G;
    const save = { gold: G.gold, skills: G.skills, inventory: G.inventory, playerHp: G.playerHp,
      playerMaxHp: G.playerMaxHp, activeSkill: G.activeSkill, activeMonster: G.activeMonster,
      activeArtisanRecipe: G.activeArtisanRecipe, offlineBudget: G.offlineBudget, lastSeen: G.lastSeen,
      los: G.lastOfflineSummary };
    const hiddenDesc = Object.getOwnPropertyDescriptor(document, 'hidden');
    const realFetch = window.fetch;
    const envelope = {
      ok: true, accrued: true, version: 7, now: '2026-08-13T12:00:00+00:00',
      state: { slot: 0, gold: 1234, gems: 0, hp: 55, max_hp: 99,
        active_kind: 'combat', active_id: 'rat', accrued_to: '2026-08-13T12:00:00+00:00' },
      skills: { attack: { xp: 5000, level: 20 }, hitpoints: { xp: 1400, level: 12 } },
      inventory: { rat_tail: 3, shrimp: 2 },
      equipment: {}, farm: [], progress: [], total_level: 32,
      levels: { attack: 20, hitpoints: 12 },
      away: { grantMs: 7200000, capped: false, tickMs: 2400, kills: 42, crits: 7, died: false,
        blessed: false, buffsPaused: false, featuredMs: 0, featuredDropMult: 1,
        gold: 400, xp: { attack: 900, hitpoints: 300 }, items: { rat_tail: 3 }, levelUps: [], events: [] },
    };
    const wasParked = window.__saveParked;
    const wasAcked = A.isReplacementAcknowledged();
    try {
      /* The applied envelope is a FIXTURE, and the hook that applies it calls
         saveLocal() for real. Park persistence so a test character never
         reaches the player's save. */
      window.__saveParked = true;
      /* b339: this fixture IS a destructive replacement (999999 local gold for
         the server's 1234), which now asks the player once before it lands —
         see B339-5. NOTHING BELOW IS WEAKENED: the consent gate is orthogonal
         to the replacement semantics this test pins, and B339-5 asserts the
         un-acknowledged case refuses. Standing in for the player's click. */
      A.acknowledgeReplacement(true);
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      window.fetch = function (u) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify(envelope), { status: 200 }));
      };
      A.resetAccrualGate();
      A.configureAccrual({ url: 'https://proj.supabase.co', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      A.setServerAccrualEnabled(true);
      /* Local state that DISAGREES with the server on every axis, including a
         skill and an item the server does not know about. Under server
         authority those must not survive: a merge means the client's copy of a
         number outlived contact with the server's, which is precisely the
         property this program removes. */
      G.gold = 999999; G.skills = { woodcutting: 88, attack: 4 }; G.inventory = { forged_sword: 40 };
      G.playerHp = 1; G.playerMaxHp = 1;
      G.activeSkill = 'woodcutting'; G.activeMonster = null; G.activeArtisanRecipe = null;
      G.lastSeen = Date.now() - 7200000; G.offlineBudget = { at: Date.now() - 7200000 };
      G.lastOfflineSummary = null;

      window.processOffline();
      await A.requestAccrual({ force: true }).catch(() => {});
      await Promise.resolve();

      assert(G.gold === 1234, 'gold is ' + G.gold + ', not the server\'s 1234 — the client kept authoring it');
      assert(G.skills.attack === 5000, 'attack xp is ' + G.skills.attack + ', not the server\'s 5000');
      /* ═══ b359 — TWO ASSERTIONS HERE WERE INVERTED, AND THEY WERE THE BUG ═══
         This test used to require `woodcutting === undefined` and
         `forged_sword === undefined`, arguing "a merge is not authority". The
         argument is sound for a field whose WRITER has moved to the server. It
         was applied to `skills` and `inventory`, whose writers have NOT: there
         is no kill/gather/craft intent verb, so live play still awards XP and
         drops on the client and the server has never been told. Under that
         truth, "absent from the envelope" means UNKNOWN, not zero — and this
         assertion made deleting a real player's real progress the CONTRACT.
         It cost a player 12 Dragon Scales and his Stonemason level on
         2026-08-17 before he reported it.
         What the test defends now is the property that actually holds today:
         the server WINS EVERY CONTEST IT ENTERS, and forfeits none of them —
         it simply cannot win a contest it never joined. Restore the old form
         only in the commit that gives live play a server verb; at that point
         the envelope names every key it owns and omission stops being
         ambiguous. `src/net/record.js:119-144` is the ordering rule this
         violated: a field moves only after every path that mutates it has. */
      /* ═══ b456 — AND THE CONDITION THE b359 COMMENT NAMED HAS NOW HAPPENED ═══
         b359 restored `woodcutting === 88` with an explicit expiry: "Restore the
         old form only in the commit that gives live play a server verb; at that
         point the envelope names every key it owns and omission stops being
         ambiguous." The b454 cutover is that commit for SKILLS. `skills` is a
         record field, `clientMayWriteRecordField('skills')` is false, and
         legacy.js `addXp` no longer writes `G.skills` at all — a live gain is a
         DISPLAY PREDICTION (src/net/predict.js) that never touches the map. So
         the server's map is a COMPLETE statement and applyRecord replaces it
         wholesale; an omitted skill is the server saying "zero", not a gap.

         ⚠ THIS IS NOT A RETURN TO THE BUG THAT COST A PLAYER HIS STONEMASON
           LEVEL. That bug was a complete statement being assumed about a field
           the CLIENT was still authoring. The predicate below is the same one the
           writer branches on, so the assertion can never again outrun the writer:
           the day skills were un-armed, the merge expectation returns with it.

         INVENTORY is deliberately NOT given the same treatment — its live writers
         (drops, gathers, crafts) have not moved, so an omitted item is still
         UNKNOWN and must still survive. That asymmetry IS the ordering rule. */
      const skillsArmed = typeof window.clientMayWriteRecordField === 'function'
        && window.clientMayWriteRecordField('skills') === false;
      if (skillsArmed) {
        assert(G.skills.woodcutting === undefined,
          'ARMED: the server map did not REPLACE the local one — a client-authored skill survived an '
          + 'envelope that owns the whole map, which is the two-sources bug: ' + G.skills.woodcutting);
        assert(window.skillXp('woodcutting') === 0,
          'ARMED: the display resurrected a skill the server did not state (' + window.skillXp('woodcutting')
          + ') — an absent skill under a KNOWN server map is zero, not a stale local number');
      } else {
        assert(G.skills.woodcutting === 88,
          'a local skill the envelope OMITS must survive — the server never owned live XP; got ' + G.skills.woodcutting);
      }
      assert(G.inventory.rat_tail === 3 && G.inventory.shrimp === 2, 'the server inventory did not land: ' + JSON.stringify(G.inventory));
      assert(G.inventory.forged_sword === 40,
        'a local item the envelope OMITS must survive — got ' + G.inventory.forged_sword);
      assert(G.playerHp === 55 && G.playerMaxHp === 99, 'hp/maxHp were not taken from the server');

      const s = G.lastOfflineSummary;
      assert(s && s.serverAuthoritative === true,
        'the welcome-back receipt is not marked server-authoritative — nothing can tell a stated receipt from an invented one');
      assert(s.gainedGold === 400, 'the receipt quotes ' + s.gainedGold + ' gold, not the server\'s stated 400');
      assert(s.gainedXp === 1200, 'the receipt quotes ' + s.gainedXp + ' XP, not the server\'s stated 900+300');
      assert(s.gainedItems === 3, 'the receipt quotes ' + s.gainedItems + ' items, not the server\'s stated 3');
      assert(s.gainedKills === 42 && s.crits === 7, 'kills/crits were not taken from the away receipt');
      assert(s.hrs === 2, 'grantMs 7200000 should read as 2h, got ' + s.hrs);
      assert(s.blessed === false, 'the receipt claims a blessing the away simulation says it did not pay');
      assert(G._serverAccrual && G._serverAccrual.version === 7,
        'the server version was not recorded — the next apply would have nothing to send');
    } finally {
      window.fetch = realFetch;
      A.setServerAccrualEnabled(false);
      A.resetAccrualGate();
      if (hiddenDesc) Object.defineProperty(document, 'hidden', hiddenDesc); else { try { delete document.hidden; } catch (e) {} }
      delete G._serverAccrual;
      Object.assign(G, { gold: save.gold, skills: save.skills, inventory: save.inventory, playerHp: save.playerHp,
        playerMaxHp: save.playerMaxHp, activeSkill: save.activeSkill, activeMonster: save.activeMonster,
        activeArtisanRecipe: save.activeArtisanRecipe, offlineBudget: save.offlineBudget, lastSeen: save.lastSeen,
        lastOfflineSummary: save.los });
      A.acknowledgeReplacement(wasAcked);
      A.hideReplacementSheet();
      window.__saveParked = wasParked;
      try { if (typeof window.refreshAll === 'function') window.refreshAll(); } catch (e) {}
    }
  }),

  () => tryRunAsync('b337: repeated silence TELLS THE PLAYER (b331 posture) — once, dismissibly, never over b302/b331', async () => {
    const A = window.HearthriseAccrual;
    const realFetch = window.fetch;
    try {
      window.fetch = function (u) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.reject(new TypeError('Failed to fetch'));
      };
      A.configureAccrual({ url: 'https://proj.supabase.co', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      A.setServerAccrualEnabled(true);
      A.resetAccrualGate();
      A.hideAccrualHaltedSheet();

      for (let i = 0; i < A.ACCRUE_HALT_AFTER_TRIES - 1; i++) await A.requestAccrual({ force: true });
      assert(!document.getElementById(A.ACCRUE_SHEET_ID),
        'the sheet appeared on the first hiccup — one failed request is a hiccup, not an outage');
      await A.requestAccrual({ force: true });
      const sheet = document.getElementById(A.ACCRUE_SHEET_ID);
      assert(sheet, 'after ' + A.ACCRUE_HALT_AFTER_TRIES + ' silent failures the player was told nothing — '
        + 'that is the "Reconnecting…" lie b331 exists to end, in a new place');
      const t = sheet.textContent.toLowerCase();
      assert(/nothing has been credited/.test(t), 'the sheet does not say that nothing was credited');
      assert(!/credited \+|we credited|progress is safe/.test(t.replace('nothing has been credited', '')),
        'the sheet claims something was credited — it was not, that is the entire failure');
      // Once. Not once per tick.
      await A.requestAccrual({ force: true });
      assert(document.querySelectorAll('#' + A.ACCRUE_SHEET_ID).length === 1, 'the sheet stacked');
      // Dismissible: the game is running and nothing is at risk.
      sheet.querySelector('#hr-accrue-later').click();
      assert(!document.getElementById(A.ACCRUE_SHEET_ID), 'the sheet cannot be dismissed');

      // b302 and b331 both outrank it — never two dialogs about one broken session.
      for (const id of ['hr-evicted-gate', 'hr-auth-expired-gate']) {
        const fake = document.createElement('div'); fake.id = id; document.body.appendChild(fake);
        try {
          A.resetAccrualGate();
          for (let i = 0; i < A.ACCRUE_HALT_AFTER_TRIES; i++) await A.requestAccrual({ force: true });
          assert(!document.getElementById(A.ACCRUE_SHEET_ID), 'b337 drew a sheet over ' + id);
        } finally { fake.remove(); }
      }

      // A server that came back clears the terminal state — a recovered player
      // must not be told they are broken forever.
      window.fetch = function (u) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response('{"ok":true,"accrued":false,"reason":"below_threshold"}', { status: 200 }));
      };
      const ok = await A.requestAccrual({ force: true });
      assert(ok.outcome === 'nothing', 'a healthy "nothing to pay" was misread as ' + ok.outcome);
      assert(A.getAccrualState().halted === false, 'the halt latched permanently — recovery is impossible');
    } finally {
      window.fetch = realFetch;
      A.setServerAccrualEnabled(false);
      A.resetAccrualGate();
      A.hideAccrualHaltedSheet();
    }
  }),

  () => tryRunAsync('HALT-BOOT-1 (b368): a CARRIED-OVER halt is re-checked before the player is told, and a live refusal still tells them', async () => {
    /* Tyler's report: yesterday a server-side `unknown_skill` (stonemason, since
       fixed) put his phone into the halted state. This morning the app came back
       to the foreground already showing "the server refused the result" — BEFORE
       trying anything — and his manual Try Again succeeded on the first tap. The
       accrual was healthy; the SHEET was stale. Nothing in this module ever took
       that sheet down except the player, and on a phone the document that owns
       it lives for days.

       Two claims, and the second is the one that keeps the fix honest:
        (1) a carried-over halt + a now-healthy transport shows NOTHING;
        (2) a carried-over halt + a still-refusing transport shows the sheet.
       MUTATION PROVEN: delete `verifyHaltedState`'s retry (return the halt
       verbatim) → (1) fails; delete its `showAccrualHaltedSheet` → (2) fails;
       delete the `hideAccrualHaltedSheet()` in settle() → the recovery half of
       (1) fails. */
    const A = window.HearthriseAccrual;
    const realFetch = window.fetch;
    const refuse = () => { window.fetch = function (u) {
      if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
      return Promise.resolve(new Response('{"ok":false,"error":"unknown_skill"}', { status: 400 }));
    }; };
    const answer = () => { window.fetch = function (u) {
      if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
      return Promise.resolve(new Response('{"ok":true,"accrued":false,"reason":"below_threshold"}', { status: 200 }));
    }; };
    try {
      A.configureAccrual({ url: 'https://proj.supabase.co', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      A.setServerAccrualEnabled(true);

      // ── Yesterday: three real refusals halt the device and raise the sheet.
      A.resetAccrualGate(); A.hideAccrualHaltedSheet();
      refuse();
      for (let i = 0; i < A.ACCRUE_HALT_AFTER_TRIES; i++) await A.requestAccrual({ force: true });
      assert(A.getAccrualState().halted === true, 'three refusals did not halt the device');
      assert(document.getElementById(A.ACCRUE_SHEET_ID),
        'a LIVE repeated refusal no longer tells the player — this fix must not weaken that');

      // ── This morning: the server is fixed, the halt (and the sheet) carried over.
      answer();
      const r = await A.verifyHaltedState();
      assert(r.checked === true, 'the carried-over halt was never re-checked, it was just believed');
      assert(r.cleared === true, 're-check read a healthy server as ' + r.outcome);
      assert(!document.getElementById(A.ACCRUE_SHEET_ID),
        'THE b368 DEFECT: the player is still being told the server refuses them, after it answered');
      assert(A.getAccrualState().halted === false, 'a successful re-check left the halt latched');

      // ── The other half: still refusing => the sheet stands. No amnesty.
      A.resetAccrualGate(); A.hideAccrualHaltedSheet();
      refuse();
      for (let i = 0; i < A.ACCRUE_HALT_AFTER_TRIES; i++) await A.requestAccrual({ force: true });
      A.hideAccrualHaltedSheet();                       // simulate the carry-over edge
      const r2 = await A.verifyHaltedState();
      assert(r2.checked === true && r2.cleared === false,
        'a server that is still refusing was reported as recovered: ' + JSON.stringify(r2));
      assert(document.getElementById(A.ACCRUE_SHEET_ID),
        'a still-refusing server was silently hidden from the player — that is the pretending b337 exists to stop');
      assert(A.getAccrualState().halted === true, 'the re-check cleared a halt the server has not earned back');

      // ── And a device that is NOT halted spends no request on this at all.
      A.resetAccrualGate(); A.hideAccrualHaltedSheet();
      let calls = 0;
      window.fetch = function (u) {
        if (/hr-accrue/.test(String(u))) { calls++; return Promise.resolve(new Response('{"ok":true,"accrued":false}', { status: 200 })); }
        return realFetch.apply(this, arguments);
      };
      const r3 = await A.verifyHaltedState();
      assert(r3.checked === false && calls === 0,
        'a healthy device fired ' + calls + ' extra accrual request(s) on every foreground');
    } finally {
      window.fetch = realFetch;
      A.setServerAccrualEnabled(false);
      A.resetAccrualGate();
      A.hideAccrualHaltedSheet();
    }
  }),

  () => tryRun('b337: exactly one verdict can grant, and an incomplete envelope is never one of them', () => {
    const A = window.HearthriseAccrual;
    const full = {
      ok: true, accrued: true, version: 1, state: { gold: 1 }, skills: {}, inventory: {},
      away: { grantMs: 1000, gold: 0, xp: {}, items: {} },
    };
    const cases = [
      [200, full, 'accrued'], [200, { ok: true, accrued: false, reason: 'below_threshold' }, 'nothing'],
      [200, { ok: true, accrued: false, reason: 'replayed' }, 'nothing'],
      [200, { ok: true, accrued: false, reason: 'clamped' }, 'nothing'],
      [200, { ok: false, error: 'x' }, 'malformed'], [200, null, 'malformed'],
      [401, { ok: false, error: 'not_signed_in' }, 'not-signed-in'],
      [409, { ok: false, error: 'no_character' }, 'no-character'],
      [409, { ok: false, error: 'version_conflict' }, 'rejected'],
      [429, { ok: false, error: 'rate_limited' }, 'rate-limited'],
      [500, { ok: false, error: 'server_error' }, 'unavailable'],
      [503, { ok: false, error: 'engine_unconfigured' }, 'unavailable'], [404, null, 'malformed'],
    ];
    for (const [status, body, want] of cases) {
      const got = A.classifyAccrueResponse(status, body).outcome;
      assert(got === want, status + ' ' + JSON.stringify(body) + ' classified as ' + got + ', expected ' + want);
      assert(A.ACCRUE_OUTCOMES.indexOf(got) >= 0, 'unknown outcome ' + got);
    }
    /* FAIL CLOSED. Each of these is `ok:true, accrued:true` — the server saying
       it paid — with one piece of the envelope missing. Applying any of them
       would blank the corresponding half of the save. */
    for (const drop of ['state', 'skills', 'inventory', 'away', 'version']) {
      const partial = { ...full }; delete partial[drop];
      assert(A.isEnvelopeApplicable(partial) === false,
        'an envelope with no `' + drop + '` was accepted as truth — applying it would wipe that half of the save');
      assert(A.classifyAccrueResponse(200, partial).outcome === 'malformed',
        'a 200 missing `' + drop + '` was not classified malformed');
    }
    // …and applyEnvelope itself refuses one, rather than trusting its caller.
    const probe = { gold: 5, skills: { a: 1 }, inventory: { b: 2 } };
    assert(A.applyEnvelope(probe, { ok: true, accrued: true, version: 1, state: {}, skills: {} }) === null,
      'applyEnvelope applied an incomplete envelope');
    assert(probe.gold === 5 && probe.skills.a === 1 && probe.inventory.b === 2,
      'applyEnvelope mutated the target before deciding it could not trust the envelope');
  }),

  /* ── REGRESSION (Paione, 2026-08-18): away kills feed the kill COUNTERS ─────
     The server pays away loot/XP through the envelope, but the three kill
     counters a kill also feeds — lifetime `stats.kills`, the this-fight streak
     `combatKillsThisFoe`, and kill quests/dailies — are not in the envelope
     STATE, so an away night left "total kills", "kills this fight" and the
     weekly kill-quest standing still. `creditServerAwayKills` replays the away
     kill total through the SAME live seams a real kill uses, and ONLY for a
     genuine 'away' receipt — a 'sync' or 'switch' already counted its kills
     through the live combatTick, so re-crediting there would double-count.
     Fails without the fix (the function does not exist / never runs). */
  () => tryRun('away-kills: a genuine absence credits stats.kills, the this-fight streak and kill quests; a live sync does not', () => {
    assert(typeof window.creditServerAwayKills === 'function',
      'creditServerAwayKills is not wired — away kills never reach the counters');
    const G = window.G;
    const saved = {
      kills: (G.stats && G.stats.kills) || 0,
      foe: G.combatKillsThisFoe || 0,
      active: G.activeMonster,
      quests: G.quests,
    };
    try {
      G.stats = G.stats || {};
      G.stats.kills = 100;
      G.combatKillsThisFoe = 3;
      G.activeMonster = 'slime';                    // still fighting, so the streak resumes
      /* A fresh, non-mirror kill_any quest so the assertion is self-contained. */
      G.quests = [{ id: '__away_kills_probe', type: 'kill_any', progress: 0, goal: 1000, done: false }];

      /* SYNC — a live settle of the last minute. Its kills were already counted
         live, so nothing here may move. `awayMs` under SYNC_MAX_MS (10m). */
      window.creditServerAwayKills({ awayMs: 60000, gainedKills: 5, combat: { kills: 5, died: false } });
      assert((G.stats.kills || 0) === 100, 'a live sync double-credited stats.kills');
      assert((G.combatKillsThisFoe || 0) === 3, 'a live sync double-credited the this-fight streak');
      assert(G.quests[0].progress === 0, 'a live sync double-credited a kill quest');

      /* AWAY — a real 8h absence the live loop did not run in. All three move. */
      window.creditServerAwayKills({ awayMs: 8 * 3600000, gainedKills: 25, combat: { kills: 25, died: false } });
      assert((G.stats.kills || 0) === 125, 'away kills did not reach lifetime stats.kills, got ' + G.stats.kills);
      assert((G.combatKillsThisFoe || 0) === 28, 'away kills did not resume the this-fight streak, got ' + G.combatKillsThisFoe);
      assert(G.quests[0].progress === 25, 'away kills did not advance the kill quest, got ' + G.quests[0].progress);

      /* A DEATH ended the fight — the streak must NOT resume onto a foe that
         killed the player (the next startCombat resets it). Lifetime still moves. */
      window.creditServerAwayKills({ awayMs: 8 * 3600000, gainedKills: 4, combat: { kills: 4, died: true } });
      assert((G.stats.kills || 0) === 129, 'a fatal away night must still credit lifetime kills');
      assert((G.combatKillsThisFoe || 0) === 28, 'a fatal away night must not resume the this-fight streak');
    } finally {
      G.stats.kills = saved.kills;
      G.combatKillsThisFoe = saved.foe;
      G.activeMonster = saved.active;
      G.quests = saved.quests;
    }
  }),

  /* ── REGRESSION (security F1, 2026-09-07): A RESTORED RECEIPT IS NEVER PAID ──
     The realm now KEEPS the last away-classified receipt in
     `player_state.last_away_receipt` (ruling 2026-09-07) and the client seeds
     `G.lastOfflineSummary` from the projection on boot, so the Home "While you
     were away" card survives a reload. That seed classifies as 'away' by
     construction — same span, same kills — and `creditServerAwayKills` credits
     on exactly that classification.

     LEFT ALONE IT IS AN EXPLOIT, NOT A DISPLAY BUG. The kill total goes to
     lifetime `stats.kills`, the this-fight streak, `updateQuest`, and
     `updateDaily('kill_any')` — the wrapper chain the Muster hangs off
     (src/features/muster.js), which turns the count into
     `world_event_contribute(p_event_key, p_points)` with CLIENT-SUPPLIED points
     against a SHARED world-event meter. Reload, switch activity, repeat: last
     night's kills re-credited into a live leaderboard every time.

     BOTH HALVES ARE ASSERTED, and so is the CONTROL — without the control, a
     build where `creditServerAwayKills` credited NOTHING AT ALL would pass this
     test while silently reopening the Paione 2026-08-18 regression.
     Fails without the fix: the restored receipt moves all four counters. */
  () => tryRun('F1: a server-RESTORED away receipt renders the card and reaches NO crediting seam', () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.reconcileAwayReceipt === 'function',
      'reconcileAwayReceipt is not exported — the projection would arrive and nothing would read it');
    const G = window.G;
    const saved = {
      kills: (G.stats && G.stats.kills) || 0,
      foe: G.combatKillsThisFoe || 0,
      active: G.activeMonster,
      quests: G.quests,
      los: G.lastOfflineSummary,
      muster: G.muster,
      updateDaily: window.updateDaily,
    };
    /* The stored receipt is in the SERVER's `away` payload shape (flat `kills`),
       which is what hr_state_of projects raw — not the client's card shape. */
    const STORED = { grantMs: 8 * 3600000, awayMs: 8 * 3600000, paidMs: 8 * 3600000,
      at: Date.now() - 40 * 60000, gold: 1234, kills: 42, crits: 3,
      xp: { attack: 5000 }, items: { oak_log: 40 }, died: false, deaths: 0 };
    const BOOT = { ok: true, version: 7, state: { last_away_receipt: STORED } };
    let dailyCalls = [];
    try {
      G.stats = G.stats || {};
      G.stats.kills = 100;
      G.combatKillsThisFoe = 3;
      G.activeMonster = 'slime';
      G.quests = [{ id: '__restored_probe', type: 'kill_any', progress: 0, goal: 1000, done: false }];
      G.muster = { dayKey: null, eventKey: null, slot: null, startMs: 0, endMs: 0,
                   points: 0, pending: 0, rallied: false, claimed: false, server: false };
      G.lastOfflineSummary = null;

      /* WATCH THE SEAM ITSELF, not only its effects. `updateDaily` is the single
         call that reaches the Muster's pending queue and therefore the wire; a
         test that only checked G.muster.pending would pass on a build where the
         wrapper chain happened to be unwired in the harness. */
      window.updateDaily = function (type, amt) { dailyCalls.push([type, amt]); };

      // ── (1) THE BOOT SEED RENDERS THE CARD ──────────────────────────────
      const seeded = A.reconcileAwayReceipt(G, BOOT);
      assert(!!seeded && G.lastOfflineSummary === seeded,
        'the boot envelope did not seed the away card from state.last_away_receipt');
      assert(seeded.gainedKills === 42 && seeded.combat && seeded.combat.kills === 42,
        'the restored card does not render the 42 kills the server paid, got ' + JSON.stringify(seeded.combat));
      assert(seeded.gainedGold === 1234 && seeded.awayMs === 8 * 3600000,
        'the restored card lost the totals the server stated');
      assert(seeded.restored === true,
        'the seeded summary is not marked `restored` — nothing downstream can tell it from a paid receipt');

      // ── (2) AND IT REACHES NO CREDITING SEAM ────────────────────────────
      const credited = window.creditServerAwayKills(G.lastOfflineSummary);
      assert(credited === 0, 'a RESTORED receipt was credited (' + credited + ' kills) — a night already paid, '
        + 'journalled and banked was paid again');
      assert((G.stats.kills || 0) === 100, 'a restored receipt moved lifetime stats.kills');
      assert((G.combatKillsThisFoe || 0) === 3, 'a restored receipt moved the this-fight streak');
      assert(G.quests[0].progress === 0, 'a restored receipt advanced a kill quest');
      assert(dailyCalls.length === 0,
        'a restored receipt called updateDaily(' + JSON.stringify(dailyCalls) + ') — that is the seam the Muster '
        + 'wraps, so this is a world_event_contribute on a SHARED meter');
      assert((G.muster.pending || 0) === 0,
        'a restored receipt queued ' + G.muster.pending + ' points for world_event_contribute');

      // ── (3) THE CONTROL: THE SAME NIGHT, PAID NOW, STILL CREDITS ────────
      const paid = Object.assign({}, seeded); delete paid.restored;
      const n = window.creditServerAwayKills(paid);
      assert(n === 42, 'a genuine away receipt stopped crediting (' + n + ') — the Paione 2026-08-18 regression '
        + 'is reopened and away kills reach no counter at all');
      assert((G.stats.kills || 0) === 142, 'the control did not move lifetime kills, got ' + G.stats.kills);
      assert(dailyCalls.length === 1 && dailyCalls[0][0] === 'kill_any' && dailyCalls[0][1] === 42,
        'the control did not reach updateDaily(kill_any, 42), got ' + JSON.stringify(dailyCalls));

      // ── (4) THE SEED YIELDS TO THIS SESSION'S RECEIPT ───────────────────
      G.lastOfflineSummary = { gainedKills: 7, marker: 'this session' };
      assert(A.reconcileAwayReceipt(G, BOOT) === null
        && G.lastOfflineSummary.marker === 'this session',
        'the stored receipt overwrote the settle the player is looking at');
    } finally {
      G.stats.kills = saved.kills;
      G.combatKillsThisFoe = saved.foe;
      G.activeMonster = saved.active;
      G.quests = saved.quests;
      G.lastOfflineSummary = saved.los;
      G.muster = saved.muster;
      window.updateDaily = saved.updateDaily;
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     F1b — THE RESTORED NIGHT SURVIVES THE SYNC THAT FOLLOWS IT.

     A MERGE-EMERGENT REGRESSION, measured on the assembled tree 2026-09-07,
     and the reason this test exists rather than a comment.

     The Home away card reads a module-scope holder in accrue.js (written in
     `applyEnvelope` when the receipt classifies away) rather than
     `G.lastOfflineSummary`, which every 90-second settle overwrites. The holder
     was reasoned not to need a reload because "the very next envelope re-states
     the absence anyway" — and that premise is what F1 measured FALSE: after a
     night has been paid the next boot answers `{accrued:false, reason:'idle'}`,
     `applyEnvelope` never runs, and nothing re-states it. So the restore seeded
     `G` alone, the card drew, and the first sync ninety seconds later evicted
     it — the player reloaded, started reading the night, and it vanished.

     GRADED ON THE RENDERED BAND, through the real path both times (the boot
     seed, then `applyAwayEnvelope` -> applyServerEnvelope -> applyEnvelope),
     because the bug lived in which HOLDER the card reads and a test that
     inspected the summary object could not have seen it.

     MUTATION PROOF: delete the `lastAwayReceipt` seed at the end of
     `reconcileAwayReceipt` (accrue.js) and this goes red twice — first on the
     holder assert, then on "the restored night was evicted". */
  () => tryRun('F1b: a RESTORED away card is not evicted by the 90-second sync that follows it', () => {
    const A = window.HearthriseAccrual;
    const H = window.HearthriseHome;
    assert(H && typeof H.render === 'function', 'the Home renderer must exist');
    assert(typeof A.getLastAwayReceipt === 'function' && typeof A.__resetAwayReceipt === 'function',
      'the b519 away-receipt holder seam must be published — the card has no source of truth without it');
    const G = window.G;
    const snap = snapshotG();
    const prevSummary = G.lastOfflineSummary;
    const prevTab = window.activeTab;
    const bandText = () => {
      H.render();
      const b = document.querySelector('#hd-root .hd-awayband');
      return b ? b.textContent.replace(/\s+/g, ' ').trim() : null;
    };
    try {
      A.__resetAwayReceipt();
      G.lastOfflineSummary = null;
      window.showTab('profile');

      /* THE BOOT AFTER A PAID NIGHT — the case `last_away_receipt` exists for.
         No `away:` block, because hr-accrue has nothing left to accrue; the
         seed is the only thing that can put the night on screen. `at` is inside
         the card's own 30-minute freshness box. */
      const STORED = { grantMs: 8 * 3600000, awayMs: 8 * 3600000, paidMs: 8 * 3600000,
        at: Date.now() - 3 * 60000, gold: 6750, kills: 41, crits: 0,
        xp: { attack: 14208 }, items: { shrimp: 13 }, died: false };
      const seeded = A.reconcileAwayReceipt(G, { ok: true, version: 9, state: { last_away_receipt: STORED } });
      assert(!!seeded, 'the boot envelope did not seed the restored receipt at all');
      const before = bandText();
      assert(before && before.indexOf('While you were away') >= 0,
        'the restored night did not draw the away card at boot: ' + before);
      assert(/41/.test(before), 'the restored card does not state what the night paid: ' + before);
      assert(A.getLastAwayReceipt() === seeded,
        'THE MERGE BUG: the restore seeded only G.lastOfflineSummary, which every settle overwrites. '
        + 'The b519 holder is what the card actually reads and nothing put the restored night into it');

      /* NINETY SECONDS OF ORDINARY PLAY. */
      const sync = applyAwayEnvelope({ grantMs: 90000, awayMs: 90000, paidMs: 90000,
        kills: 2, crits: 0, gold: 0, xp: {}, items: {}, died: false, capped: false, blessed: false });
      assert(A.classifyReceipt(sync.rec) === 'sync',
        'the settle must classify as a sync, got ' + A.classifyReceipt(sync.rec));
      assert(G.lastOfflineSummary === sync.rec,
        'the LATEST receipt must still be the latest — the toast and the bug report read it');
      const after = bandText();
      assert(after !== null,
        'THE BUG: the RESTORED night was evicted by a 90-second sync — the player reloaded to read what '
        + 'happened overnight and it disappeared under them ninety seconds in');
      assert(after === before,
        'the restored away card CHANGED when a sync landed — a settle must not re-state the night:'
        + '\n  before: ' + before + '\n  after:  ' + after);

      /* AND THE RESTORE STILL CREDITS NOTHING (F1's property, re-checked here
         because this test is the one that lands a restored receipt AND then
         runs a real envelope through the crediting seam). */
      assert(window.creditServerAwayKills(seeded) === 0,
        'the restored receipt reached the crediting seam after a live settle');
    } finally {
      A.__resetAwayReceipt();
      G.lastOfflineSummary = prevSummary;
      restoreG(snap);
      try { H.render(); } catch (e) {}
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  () => tryRun('b337: the accrual endpoint is DERIVED from the project URL, and the intent carries one integer', () => {
    const A = window.HearthriseAccrual;
    assert(A.accrueEndpoint('https://x.supabase.co') === 'https://x.supabase.co/functions/v1/hr-accrue', 'bad endpoint derivation');
    assert(A.accrueEndpoint('https://x.supabase.co///') === 'https://x.supabase.co/functions/v1/hr-accrue', 'trailing slashes not normalised');
    /* request.js clamps slot to [0,5] server-side; the client must not send
       something it knows is out of range and then rely on the server's
       tolerance to look correct. */
    for (const [ask, want] of [[0, 0], [5, 5], [6, 0], [-1, 0], [1.5, 0], ['3', 0], [null, 0], [undefined, 0]]) {
      const b = JSON.parse(A.buildAccrueRequest({ url: 'https://x.supabase.co', slot: ask }).init.body);
      assert(b.slot === want, 'slot ' + JSON.stringify(ask) + ' was sent as ' + b.slot + ', expected ' + want);
    }
    const noAuth = A.buildAccrueRequest({ url: 'https://x.supabase.co', slot: 0 });
    assert(!('Authorization' in noAuth.init.headers), 'a bearer header was invented with no token to put in it');
    /* ⚠ ONE key, and the MISSING key is the point — the message says why. */
    const keys = Object.keys(JSON.parse(noAuth.init.body));
    assert(keys.length === 1 && keys[0] === 'slot',
      'the accrue intent must carry ONE integer and NO client-chosen window; got '
      + JSON.stringify(keys) + '. The window END is a server now() (hr-accrue/index.ts:540, :638) '
      + 'and accrued_to advances to it (accrual.js:2480), so the forfeited sub-tick carry '
      + '(measured in tests/settle-carry-loss.mjs: up to 6.66% on a 7000ms node) is NOT fixable '
      + 'here — a client-supplied `to` is exactly the forged-value faucet CLAUDE.md §1 forbids. '
      + 'Fix it where the watermark is chosen, as accrueRested already does (index.ts:1063).');
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b338 — THE CHARACTER-CREATION INTENT.

     `player_state` held ZERO ROWS, so hr-accrue answered `no_character` for
     everybody and the b337 switch could not be turned on for anyone. The RPC
     that fixes it has been live since the foundation landed; NOTHING CALLED IT.
     These tests cover the call, and the one thing the SQL cannot check for
     itself: that the server's starting kit still equals the client's.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRunAsync('B338-1: the SERVER\'s starting kit still equals the CLIENT\'s fresh character', async () => {
    /* THE DRIFT GUARD. src/data/start-kit.js is the single source; the server
       gets it as generated catalogue rows and legacy.js's fresh-G literal is
       the client's copy, which CANNOT import it (classic script, parse-time
       literal — the b222 trap). Two copies with a guard, chosen knowingly.
       This is the guard, and without it the divergence is invisible: production
       granted 0 gold and no weapon against a client that starts with 500 and a
       Bronze Sword, and nothing in the repo could see it. */
    const KIT = await import('../../data/start-kit.js?v=548');
    const F = window.__FRESH_START;
    assert(F && typeof F === 'object',
      'window.__FRESH_START is missing — legacy.js no longer snapshots its fresh-character literal, '
      + 'so nothing compares the client\'s starting kit to the server\'s');

    assert(F.gold === KIT.START_CURRENCY.gold,
      'fresh gold is ' + F.gold + ' but START_CURRENCY.gold is ' + KIT.START_CURRENCY.gold
      + ' — the server would create a character with different money than the client does');
    assert(F.gems === KIT.START_CURRENCY.gems, 'fresh gems disagree with START_CURRENCY');
    assert(F.maxHp === KIT.START_CURRENCY.maxHp && F.hp === KIT.START_CURRENCY.hp,
      'fresh HP ' + F.hp + '/' + F.maxHp + ' disagrees with START_CURRENCY');

    /* maxHp is DERIVED from the hitpoints level everywhere in this client
       (legacy.js :898). If the kit's hitpoints XP does not buy exactly maxHp,
       the first refresh after a server-created character silently rewrites a
       server value — the client re-authoring authority, which is the one thing
       the whole program exists to stop. */
    assert(window.levelFromXp(KIT.START_SKILL_XP.hitpoints || 0) === KIT.START_CURRENCY.maxHp,
      'START_SKILL_XP.hitpoints is level ' + window.levelFromXp(KIT.START_SKILL_XP.hitpoints || 0)
      + ' but START_CURRENCY.maxHp is ' + KIT.START_CURRENCY.maxHp
      + ' — the client derives maxHp from the hitpoints level, so these must agree');

    /* Skills: absent means 0, so compare on VALUE rather than on key presence —
       the client omits `ranged`/`bountyHunter` and the server writes them as 0,
       and levelFromXp(0) is level 1 either way. */
    const every = new Set([...Object.keys(F.skills), ...Object.keys(KIT.START_SKILL_XP)]);
    for (const k of every) {
      assert((F.skills[k] || 0) === (KIT.START_SKILL_XP[k] || 0),
        'fresh skill ' + k + ' is ' + (F.skills[k] || 0) + ' but START_SKILL_XP says '
        + (KIT.START_SKILL_XP[k] || 0));
    }

    /* ── INVERTED: THE CLIENT MUST NOT HOLD THE KIT AT ALL ──────────────────
       This used to assert the fresh-G literal EQUALLED START_INVENTORY. The
       agreement was real and still cost three live bugs, because a client-held
       copy of the kit cannot be told from a forged stack and the merge ratchet
       can never lower it. The kit is the SERVER'S, and character-bootstrap-guard
       C3 pins hr_start_kit to START_INVENTORY against a real migration replay —
       so that agreement is still checked, on the half that grants the items.
       MUTATION: put any id back in legacy.js's `inventory:{}` literal ⇒ red. */
    const invKeys = Object.keys(F.inventory).filter((k) => F.inventory[k] > 0).sort();
    assert(invKeys.length === 0,
      'the fresh-character literal seeds ' + JSON.stringify(invKeys) + ' into the bag — the starting kit '
      + 'is the SERVER\'s (hr_start_kit), and a client-seeded stack is a permanent phantom: `inventory` '
      + 'is not a SERVER_OF_RECORD field so loadLocal cannot strip it, and the envelope merge ratchet '
      + 'takes Math.max so a non-owned id can never come back down');
    assert(Object.keys(KIT.START_INVENTORY).length > 0,
      'START_INVENTORY is empty — the server would create a character with no starting kit at all');

    /* Equipment: the client fills every slot with null, so only the occupied
       ones are the kit. An extra occupied slot on either side is drift. */
    const worn = Object.keys(F.equipment).filter((k) => F.equipment[k]).sort();
    assert(JSON.stringify(worn) === JSON.stringify(Object.keys(KIT.START_EQUIPMENT).sort()),
      'fresh equipment occupies ' + JSON.stringify(worn) + ' but START_EQUIPMENT is '
      + JSON.stringify(Object.keys(KIT.START_EQUIPMENT).sort()));
    for (const k of worn) {
      assert(F.equipment[k] === KIT.START_EQUIPMENT[k],
        'fresh ' + k + ' is ' + F.equipment[k] + ' but START_EQUIPMENT says ' + KIT.START_EQUIPMENT[k]);
    }

    /* CONSERVATION. hr_apply conserves an item's total across the equip/unequip
       pair, so a starting item that is BOTH worn and in the bag becomes two the
       moment it is taken off. The server's bootstrap grants each exactly once;
       the client must not disagree about which. */
    for (const id of Object.values(KIT.START_EQUIPMENT)) {
      assert(KIT.START_INVENTORY[id] === undefined,
        'START_EQUIPMENT wears "' + id + '" and START_INVENTORY also grants it — '
        + 'unequipping it would yield two, because hr_apply conserves the pair');
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b495 — THE FIRST HOUR. Three properties from the balance audit
     (2026-08-30, ahead of the beta wave), each pinned as a NUMBER the engine
     produces rather than as a constant the test copies.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRunAsync('B495-1: the starting kit carries enough food to survive the first fight', async () => {
    /* THE DEFECT. The kit was `shrimp: 8` — raw, heals 3 — i.e. 24 HP of buffer
       on a 10 HP character, against a Goblin that costs 4.94 HP per kill. Two
       kills and the death sheet; measured, 36 deaths in the first thirty
       minutes. Away it was worse and that is why this is a P0: simulateSpan
       BREAKS on the first death, so a first overnight paid 30 SECONDS of twelve
       hours (0.1%).

       B338-1 above already pins the kit's exact SHAPE against the server. This
       test pins the PROPERTY that shape exists for, so a future edit that keeps
       the shape honest while swapping the bridge for a prettier item that heals
       3 fails here instead of shipping. */
    const KIT = await import('../../data/start-kit.js?v=548');
    const AE = window.HearthriseCore && window.HearthriseCore.autoEat;
    assert(AE && typeof AE.isAutoEatable === 'function',
      'HearthriseCore.autoEat.isAutoEatable missing — cannot grade the starting food');

    let healing = 0;
    for (const id of Object.keys(KIT.START_INVENTORY)) {
      const it = window.ITEMS[id];
      if (!AE.isAutoEatable(it)) continue;               // a Feast is never auto-eaten (b220)
      healing += KIT.START_INVENTORY[id] * (Number(it.heals) || 0);
    }
    /* The floor is DERIVED: 24 goblin kills at the measured 4.94 HP per kill is
       ~119 HP, which is `first_blood` (5 kills) plus a first-contract bounty
       (15-25 kills) without a single death. Rounded to 120. */
    assert(healing >= 120,
      'the starting kit carries only ' + healing + ' HP of auto-eatable healing; the ruled floor is '
      + '120 (a fresh character takes ~4.94 damage per Goblin kill, so below this the first bounty '
      + 'contract cannot be finished without dying and the first away night pays seconds)');

    /* AND THE SLOT MUST POINT AT IT. `estimateSurvival()` prices the away food
       pool off G.foodSlot and `awayLineHtml` chooses its whole sentence from it,
       so a null slot told a character holding twenty cooked shrimp that they
       would fall in five kills — the preview honest about the wrong state. */
    const F = window.__FRESH_START;
    assert(F && F.foodSlot,
      'a fresh character has no foodSlot — the away preview will price their food pool at zero and '
      + 'quote "then you fall" to a player who is carrying a bag of food');
    assert((KIT.START_INVENTORY[F.foodSlot] || 0) > 0,
      'the fresh foodSlot is "' + F.foodSlot + '" but the starting kit does not contain it');
    assert(AE.isAutoEatable(window.ITEMS[F.foodSlot]),
      'the fresh foodSlot "' + F.foodSlot + '" is not an auto-eatable Provision');
  }),

  () => tryRun('B495-2: armour reduction is a CURVE, not a one-point truncation step', () => {
    /* THE DEFECT. `maxHit = Math.floor(maxHit - defScore * 0.03)` — but `maxHit`
       was ALREADY an integer, so `floor(int - 0.03)` is `int - 1`. Every monster
       with def >= 1 cost a full point of max hit and the second point only
       arrived past defScore 33. The authored 3%-per-point curve never ran; a
       flat -1 ran instead, and at tier 1 that is 25-33% of the player's damage.

       Graded as a RELATION between two monsters that differ only in `def`, so
       the test cannot pass by copying the formula it is testing. */
    const C = window.HearthriseCore && window.HearthriseCore.combat;
    assert(C && typeof C.playerCombatRolls === 'function', 'HearthriseCore.combat is missing');

    const eqp = { weapon: 'bronze_sword' };
    const eq = C.equipmentStats(eqp, window.ITEMS);
    /* A synthetic tier-1 VERMIN: hammer-weak, so a sword never matches and the
       weakness multiplier is a constant 1 across the whole sweep. The relation
       under test is `maxHit(def)`, and folding a x1.20 through it would make the
       differences non-linear for no reason. Only `def` varies. */
    const foe = (def) => ({ tier: 1, def, cls: 'vermin', weaponWeak: 'hammer',
      weaponResist: ['ranged'], elementWeak: 'frost', elementResist: [], elementImmune: ['poison'] });
    const rollAt = (strXp) => (def) => C.playerCombatRolls(foe(def), {
      equipment: eqp, items: window.ITEMS, skills: { attack: 0, strength: strXp }, eq, bonus: () => 0,
    }).maxHit;

    /* (a) THE DEFECT, at the level it actually bit: a level-1 character. */
    const low = rollAt(0);
    assert(low(1) === low(0),
      'a def-1 monster costs ' + (low(0) - low(1)) + ' max hit vs a def-0 one ('
      + low(0) + ' -> ' + low(1) + '). 3% of 1 is 0.03 — it must cost NOTHING. This is the b495 '
      + 'truncation tax: `floor(maxHit - defScore*0.03)` on an ALREADY-INTEGER maxHit, which is a '
      + 'flat -1 for every armoured foe and 25% of a starting character\'s damage.');

    /* And the player-visible number it produces: a fresh character swinging the
       starting Bronze Sword at the starting-area Goblin (def 1, sword-weak, so
       x1.20 applies). Pinned because this ONE figure is what the first hour
       feels like — it was 3, it is 4, and the kill went 25.3s -> 20.2s. */
    const goblin = C.playerCombatRolls(window.MONSTERS.goblin, {
      equipment: eqp, items: window.ITEMS, skills: { attack: 0, strength: 0 }, eq, bonus: () => 0,
    });
    assert(goblin.maxHit === 4,
      'a fresh character\'s max hit on a Goblin is ' + goblin.maxHit + ', expected 4 '
      + '(floor(1*0.35 + 3*0.6 + 2) = 4, def 1 costs nothing, x1.20 sword weakness floors back to 4)');

    /* (b) THE CURVE MUST STILL BITE. Graded at a high strength level so the
       `Math.max(1, …)` damage floor cannot mask a difference — at level 1 a
       6-point reduction clamps and would make "never reduce" pass. */
    const hi = rollAt(window.HearthriseCore.xp.xpForLevel(60));
    const base = hi(0);
    assert(base > 10, 'the high-level fixture must have headroom above the max(1) floor, got ' + base);
    assert(hi(33) === base,
      'defScore 33 is 0.99 points of reduction and must still cost nothing, got ' + hi(33) + ' vs ' + base);
    assert(hi(34) === base - 1,
      'defScore 34 is the FIRST whole point of armour reduction and must cost exactly 1, got '
      + hi(34) + ' vs ' + base);
    assert(hi(200) === base - 6,
      'defScore 200 must cost floor(200 * 0.03) = 6 max hit, got ' + (base - hi(200)));

    /* The reduction reads its rate from COMBAT_BALANCE rather than a literal,
       so a tuning change moves one number. */
    assert(window.COMBAT_BALANCE.monsterDefenseDamageReduction === 0.03,
      'monsterDefenseDamageReduction moved — re-derive the defScore thresholds above (they are '
      + '1/rate and 2/rate) rather than editing them to match');
  }),

  () => tryRunAsync('B495-3: a fresh character survives a first away night instead of dying in seconds', async () => {
    /* THE PROPERTY THE KIT EXISTS FOR, measured through the REAL engine rather
       than argued from the item table. As shipped before b495, a fresh
       character on a Goblin survived ~30 seconds of a twelve-hour night.
       ⚠ `survivedMs` STILL MEANS "ms that earned", and that meaning is what
         this test rests on — but since the Recovery ruling (2026-09-05) it is
         no longer "ms before the first death". A death now interrupts the run
         (src/core/away.js RECOVERY_MS), so the span continues and `survivedMs`
         is the simulated part of it, with the knockouts in `recoverMs`. The
         floors below are unchanged and remain cliff detectors: this test asks
         whether the KIT keeps a new character fighting, and Recovery raising
         the number is not a reason to stop asking. */
    const CS = window.HearthriseCore && window.HearthriseCore.combatSim;
    const C = window.HearthriseCore && window.HearthriseCore.combat;
    const AE = window.HearthriseCore && window.HearthriseCore.autoEat;
    const RNGM = window.HearthriseCore && window.HearthriseCore.rngMod;
    const ST = window.HearthriseCore && window.HearthriseCore.styles;
    const KIT = await import('../../data/start-kit.js?v=548');
    if (!CS || !C || !AE || !RNGM || !ST) { skip('core sim unavailable'); return; }

    const eqp = { weapon: KIT.START_EQUIPMENT.weapon };
    const eq = C.equipmentStats(eqp, window.ITEMS);
    const style = ST.resolveStyle(eq.weaponType, null);
    const skills = Object.assign({}, KIT.START_SKILL_XP);
    const maxHp = window.levelFromXp(skills.hitpoints || 0);
    const state = {
      skills, gold: 0, stats: {}, buffs: [],
      inventory: Object.assign({}, KIT.START_INVENTORY),
      activeMonster: 'goblin', playerHp: maxHp, playerMaxHp: maxHp,
      monsterHp: window.MONSTERS.goblin.hp, monsterMaxHp: window.MONSTERS.goblin.hp,
    };
    const from = Date.UTC(2026, 8, 3, 2, 0, 0);
    const bonus = () => 0;
    const summary = CS.simulateSpan(state, {
      away: true, rng: RNGM.createRng(0x5eed1234), bonus, style, monsters: window.MONSTERS,
      fromMs: from, toMs: from + 12 * 3600000, tickMs: C.swingIntervalMs(eq, style),
      playerRolls: (m) => C.playerCombatRolls(m, { equipment: eqp, items: window.ITEMS, skills, eq, style, bonus }),
      monsterRolls: (m) => C.monsterCombatRolls(m, { eq, skills, bonus }),
      weakness: (m) => C.weaknessInfo(m, eq),
      fx: {
        /* auto-eat OWNED, because the ruling is that the entry tier is the
           baseline affordance. If the grant is ever taken away this test still
           measures the kit; it is the kit that is on trial here. */
        autoEat: () => {
          const r = AE.resolveAutoEat({
            enabled: true, owned: true, hp: state.playerHp, maxHp: state.playerMaxHp,
            threshold: 0.25, foodId: window.__FRESH_START && window.__FRESH_START.foodSlot,
            inventory: state.inventory, items: window.ITEMS,
          });
          if (!r) return false;
          state.playerHp = r.hp;
          state.inventory[r.foodId] -= 1;
          return true;
        },
        onDeath: () => { state.activeMonster = null; },
      },
    });

    const mins = summary.survivedMs / 60000;
    /* The floor is 10 minutes, and it is deliberately far below the ~14 the kit
       measures: this test is a CLIFF DETECTOR for the 0.5-minute regression, not
       a pin on an RNG-sensitive figure. */
    assert(mins >= 10,
      'a fresh character with the starting kit survived only ' + mins.toFixed(1) + ' minutes of a '
      + '12h away night (' + summary.kills + ' kills). The floor is 10. As shipped before b495 this '
      + 'was 0.5 minutes — an overnight paid 23 XP and no gold, so the idle pillar was off by '
      + 'default for every new account.');
    assert(summary.kills >= 24,
      'the starting kit banked only ' + summary.kills + ' away kills; the ruled floor is 24 (a '
      + 'first-contract bounty is 15-25 kills and must be finishable while the player sleeps)');
  }),

  () => tryRun('B495-4: a filled starting foodSlot arms auto-eat WITHOUT bypassing the trait gate', () => {
    /* THE COUPLING b495 INTRODUCED, pinned so it cannot rot in either
       direction. Giving a fresh character a foodSlot makes auto-actions.js's
       b163 migration branch fire (`if (G.foodSlot) aa.eat.enabled = true`), so
       the trait now WORKS the moment it is bought instead of needing the player
       to also find the settings toggle. That is the wanted half.
       The dangerous half is the other one: `DEFAULTS.eat.enabled` is false with
       the comment "never accidentally start auto-eating someone's food", and an
       enabled config must still eat NOTHING until Auto-Eat is owned. */
    const A = window.HearthriseAuto;
    if (!A || typeof A.maybeAutoEat !== 'function') { skip('HearthriseAuto unavailable'); return; }
    const snap = snapshotG();
    try {
      const G = window.G;
      /* a fresh-shaped character, hurt, carrying food, with NO trait. */
      delete G.autoActions;
      G.foodSlot = window.__FRESH_START.foodSlot;
      G.traits = {};
      G.playerMaxHp = 10; G.playerHp = 1;
      G.inventory = Object.assign({}, G.inventory, { [G.foodSlot]: 20 });

      const cfg = (typeof A._ensureShape === 'function') ? A._ensureShape() : null;
      assert(!A.maybeAutoEat(),
        'auto-eat fired for a character who owns NO Auto-Eat tier — the trait gate in '
        + 'resolveAutoEat({owned}) has been bypassed, and a filled foodSlot is now spending food '
        + 'nobody paid for the right to spend');
      assert(G.inventory[G.foodSlot] === 20 && G.playerHp === 1,
        'nothing may be consumed or healed without the trait');

      /* …and the moment the entry tier is owned it works, with no settings trip. */
      G.traits = { auto_eat: true };
      assert(A.maybeAutoEat() === true,
        'a character who has just bought Auto-Eat I, is at 10% HP and is carrying 20 Cooked Shrimp '
        + 'did NOT auto-eat. Buying the trait must be sufficient — needing to also toggle a setting '
        + 'and nominate a food is the b495 defect this default removes.');
      assert(G.playerHp > 1 && G.inventory[G.foodSlot] === 19,
        'the eat did not apply: hp ' + G.playerHp + ', food ' + G.inventory[G.foodSlot]);
      if (cfg && cfg.eat) {
        assert(cfg.eat.enabled === true && cfg.eat.foodId === window.__FRESH_START.foodSlot,
          'the migrated eat config is ' + JSON.stringify(cfg.eat) + ' — it must adopt the kit food');
      }
    } finally { restoreG(snap); }
  }),

  () => tryRun('B338-2: the intent carries ONE integer to hr_create_character, and no way to name another player', () => {
    const C = window.HearthriseCharacter;
    assert(C, 'src/net/character.js did not publish — the b337 switch can never credit anybody');
    assert(C.characterEndpoint('https://x.supabase.co') === 'https://x.supabase.co/rest/v1/rpc/hr_create_character',
      'bad endpoint derivation');
    assert(C.characterEndpoint('https://x.supabase.co///') === 'https://x.supabase.co/rest/v1/rpc/hr_create_character',
      'trailing slashes not normalised');

    const r = C.buildCreateCharacterRequest({ url: 'https://x.supabase.co', apiKey: 'anon-key', token: 'jwt', slot: 3 });
    assert(r.init.method === 'POST', 'not a POST');
    assert(r.init.headers.Authorization === 'Bearer jwt', 'no bearer token — auth.uid() would be null and the RPC would refuse');
    assert(r.init.headers.apikey === 'anon-key', 'no apikey header — the gateway requires one');
    const body = JSON.parse(r.init.body);
    assert(Object.keys(body).length === 1 && body.p_slot === 3,
      'the body carries something other than {p_slot}: ' + r.init.body);
    /* The identity is the JWT, never a payload field. If a user id could ride in
       the body, one player could bootstrap a character onto another's account. */
    assert(!/user|uid|gold|kit|item|skill/i.test(r.init.body),
      'the request body names a value that is not a slot: ' + r.init.body);

    for (const [ask, want] of [[0, 0], [5, 5], [6, 0], [-1, 0], [1.5, 0], ['3', 0], [null, 0], [undefined, 0]]) {
      const b = JSON.parse(C.buildCreateCharacterRequest({ url: 'https://x.supabase.co', slot: ask }).init.body);
      assert(b.p_slot === want, 'slot ' + JSON.stringify(ask) + ' was sent as ' + b.p_slot);
    }
    const noAuth = C.buildCreateCharacterRequest({ url: 'https://x.supabase.co', slot: 0 });
    assert(!('Authorization' in noAuth.init.headers), 'a bearer header was invented with no token to put in it');
  }),

  () => tryRun('B338-3: every answer is a NAMED verdict, and only two of them mean a character exists', () => {
    const C = window.HearthriseCharacter;
    const cases = [
      [200, { ok: true, slot: 0, created: true }, 'created', true],
      [200, { ok: true, slot: 0, created: false }, 'existed', true],
      [200, { ok: true, slot: 2, created: false, raced: true }, 'existed', true],
      [200, { ok: false, error: 'not_signed_in' }, 'not-signed-in', false],
      [200, { ok: false, error: 'bad_slot' }, 'bad-slot', false],
      [200, { ok: false, error: 'rate_limited' }, 'rate-limited', false],
      [200, { ok: false, error: 'no_start_kit' }, 'unavailable', false],
      [200, { ok: false, error: 'something_new' }, 'refused', false],
      /* A 200 that says ok but omits `created`. "The server answered" is not the
         same as "the server said a character exists" — and reading the missing
         field as falsy would latch a character nobody has. */
      [200, { ok: true, slot: 0 }, 'malformed', false], [200, null, 'malformed', false],
      [401, null, 'not-signed-in', false], [403, null, 'not-signed-in', false], [404, null, 'not-deployed', false],
      [500, null, 'unavailable', false], [503, null, 'unavailable', false],
    ];
    for (const [status, body, want, present] of cases) {
      const v = C.classifyCreateResponse(status, body);
      assert(v.outcome === want,
        status + ' ' + JSON.stringify(body) + ' classified as ' + v.outcome + ', expected ' + want);
      assert(C.CHARACTER_OUTCOMES.includes(v.outcome), 'unnamed outcome ' + v.outcome);
      assert(C.isCharacterPresent(v.outcome) === present,
        v.outcome + ' reports presence ' + C.isCharacterPresent(v.outcome) + ', expected ' + present);
    }
  }),

  () => tryRunAsync('B338-4: NO failure creates a character locally — not one gold, not one item, ever', async () => {
    /* The mirror of b337's no-fallback test, for the other half of the slice. A
       "helpful" local seed would hand the client back authorship of the starting
       state — 500 gold and a sword per device, unverifiable — which is the exact
       failure server authority exists to close. */
    const C = window.HearthriseCharacter;
    const G = window.G;
    const save = { gold: G.gold, gems: G.gems, skills: G.skills, inventory: G.inventory,
      equipment: G.equipment, playerHp: G.playerHp, playerMaxHp: G.playerMaxHp,
      los: G.lastOfflineSummary };
    const realFetch = window.fetch;
    const failures = [
      { label: 'network/CORS', throws: true },
      { label: '401', status: 401, body: '{}' },
      { label: '404 not deployed', status: 404, body: '{}' },
      { label: '500', status: 500, body: '{}' },
      { label: 'rate_limited', status: 200, body: '{"ok":false,"error":"rate_limited"}' },
      { label: 'bad_slot', status: 200, body: '{"ok":false,"error":"bad_slot"}' },
      { label: 'no_start_kit', status: 200, body: '{"ok":false,"error":"no_start_kit"}' },
      { label: '200 with no created flag', status: 200, body: '{"ok":true,"slot":0}' },
      { label: '200 that is not JSON', status: 200, body: '<html>gateway</html>' },
    ];
    try {
      C.configureCharacter({ url: 'https://probe.invalid', apiKey: 'k', authToken: () => 'jwt', slot: 0 });
      for (const f of failures) {
        C.resetCharacterIntent();
        window.fetch = async () => {
          if (f.throws) throw new TypeError('Failed to fetch');
          return { status: f.status, ok: f.status < 400, json: async () => JSON.parse(f.body) };
        };
        const v = await C.ensureCharacter({ slot: 0 });
        assert(v.present === false, f.label + ': reported a character as present — ' + JSON.stringify(v));
        assert(C.isCharacterConfirmed(0) === false, f.label + ': latched a character the server never confirmed');
        assert(G.gold === save.gold, f.label + ': gold changed to ' + G.gold);
        assert(G.gems === save.gems, f.label + ': gems changed');
        assert(G.skills === save.skills, f.label + ': skills were replaced');
        assert(G.inventory === save.inventory, f.label + ': inventory was replaced');
        assert(G.equipment === save.equipment, f.label + ': equipment was replaced');
        assert(G.lastOfflineSummary === save.los, f.label + ': a receipt was written for a character nobody made');
      }

      /* THE CONTROL. Every assertion above is a refusal, so without this the
         whole test would pass against a module that does nothing at all. */
      C.resetCharacterIntent();
      let sent = null;
      window.fetch = async (u, init) => {
        sent = { u, init };
        return { status: 200, ok: true, json: async () => ({ ok: true, slot: 0, created: true }) };
      };
      const good = await C.ensureCharacter({ slot: 0 });
      assert(good.outcome === 'created' && good.present === true,
        'CONTROL: a successful create was not recognised — ' + JSON.stringify(good));
      assert(sent && /\/rest\/v1\/rpc\/hr_create_character$/.test(sent.u),
        'CONTROL: nothing was actually put on the wire');
      /* ...and even SUCCESS writes no game value. The server states the kit; the
         client learns it from hr-accrue's envelope, not from this call. */
      assert(G.gold === save.gold && G.inventory === save.inventory && G.equipment === save.equipment,
        'a SUCCESSFUL create wrote game state locally — the starting kit is the server\'s to state');
    } finally {
      window.fetch = realFetch;
      C.resetCharacterIntent();
      C.configureCharacter(null);
      Object.assign(G, save);
      G.lastOfflineSummary = save.los;
    }
  }),

  () => tryRunAsync('B338-5: the ensure is LATCHED — one round trip per session, and re-wiring clears it', async () => {
    const C = window.HearthriseCharacter;
    const realFetch = window.fetch;
    try {
      let calls = 0;
      window.fetch = async () => {
        calls++;
        return { status: 200, ok: true, json: async () => ({ ok: true, slot: 0, created: false }) };
      };
      C.resetCharacterIntent();
      /* b339 — a `userId` is now REQUIRED for a latch: the key must name the
         player, or (as it did until b339) it matches for every account on the
         device. Not a weakening of anything below; the assertions are unchanged
         and B339-1/1b own the identity property itself. */
      C.configureCharacter({ url: 'https://probe.invalid', apiKey: 'k', authToken: () => 'jwt',
        userId: () => 'user-b338', slot: 0 });

      await C.ensureCharacter({ slot: 0 });
      assert(calls === 1, 'the first ensure did not reach the network');
      assert(C.isCharacterConfirmed(0) === true, 'a confirmed character was not latched');
      await C.ensureCharacter({ slot: 0 });
      await C.ensureCharacter({ slot: 0 });
      assert(calls === 1, 'the latch leaked — ' + calls + ' round trips for one confirmed character; '
        + 'processOffline can fire on every return from hidden and would burn the 60/min ensure budget');

      /* `force` must still work — it is what a retry needs. */
      await C.ensureCharacter({ slot: 0, force: true });
      assert(calls === 2, 'force did not bypass the latch');

      /* A DIFFERENT SLOT is a different character and must not inherit it. */
      await C.ensureCharacter({ slot: 1 });
      assert(calls === 3, 'the latch for slot 0 also silenced slot 1');

      /* RE-WIRING = possibly a different account. Keeping the latch across a
         sign-out would tell the next player their character exists. */
      C.configureCharacter({ url: 'https://other.invalid', apiKey: 'k', authToken: () => 'jwt',
        userId: () => 'user-b338', slot: 0 });
      assert(C.isCharacterConfirmed(0) === false, 'the latch survived a re-wire to a different project');
      await C.ensureCharacter({ slot: 0 });
      assert(calls === 4, 're-wiring did not re-arm the ensure');
    } finally {
      window.fetch = realFetch;
      C.resetCharacterIntent();
      C.configureCharacter(null);
    }
  }),

  () => tryRunAsync('B338-6: with the switch ON, processOffline ENSURES then ACCRUES — and still credits nothing itself', async () => {
    const A = window.HearthriseAccrual;
    const C = window.HearthriseCharacter;
    const G = window.G;
    const save = { gold: G.gold, skills: G.skills, inventory: G.inventory, activeSkill: G.activeSkill,
      skillTargetId: G.skillTargetId, activeMonster: G.activeMonster,
      activeArtisanRecipe: G.activeArtisanRecipe, offlineBudget: G.offlineBudget,
      lastSeen: G.lastSeen, los: G.lastOfflineSummary, restedAt: G.restedAt };
    const hiddenDesc = Object.getOwnPropertyDescriptor(document, 'hidden');
    const realFetch = window.fetch;
    const wasParked = window.__saveParked;
    try {
      window.__saveParked = true;
      /* b515: this used to flip the kill switch ON first, because the flip
         stamped both local watermarks and a flip AFTER the fixture would have
         moved the very watermark the assertion reads. There is no flip: server
         accrual is unconditional and nothing stamps. The fixture and the
         assertion are unchanged. */
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      /* A real absence: an activity running, and lastSeen four hours ago. With
         the switch OFF this is a paying absence (b337 asserts that separately). */
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree';
      G.activeMonster = null; G.activeArtisanRecipe = null;
      G.lastSeen = Date.now() - 4 * 3600 * 1000;
      G.offlineBudget = { at: Date.now() - 4 * 3600 * 1000, usedMs: 0, day: null };
      G.lastOfflineSummary = null;
      const goldBefore = G.gold;
      const watermark = G.offlineBudget.at;

      const seen = [];
      window.fetch = async (u) => {
        seen.push(String(u));
        if (/hr_create_character/.test(String(u))) {
          return { status: 200, ok: true, json: async () => ({ ok: true, slot: 0, created: true }) };
        }
        /* The accrual answers "nothing to pay" — the point of this test is the
           ORDER and the fact that the local path never ran, not the payout. */
        return { status: 200, ok: true, json: async () => ({ ok: true, accrued: false, reason: 'none' }) };
      };

      A.resetAccrualGate();
      C.resetCharacterIntent();
      A.configureAccrual({ url: 'https://probe.invalid', apiKey: 'k', authToken: () => 'jwt', slot: 0 });
      C.configureCharacter({ url: 'https://probe.invalid', apiKey: 'k', authToken: () => 'jwt', slot: 0 });

      window.processOffline();
      /* processOffline deliberately does not await — it must not block a frame
         on a network round trip. Drain the microtasks it queued. */
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 20; i++) await Promise.resolve();

      assert(seen.some((u) => /hr_create_character/.test(u)),
        'processOffline never asked the server to create a character — with player_state empty, '
        + 'every accrual answers no_character and the b337 switch can credit nobody. Saw: ' + JSON.stringify(seen));
      assert(seen.some((u) => /hr-accrue/.test(u)),
        'processOffline never asked for accrual. Saw: ' + JSON.stringify(seen));
      assert(seen.findIndex((u) => /hr_create_character/.test(u)) < seen.findIndex((u) => /hr-accrue/.test(u)),
        'accrual was requested BEFORE the character was ensured — the first call of a new '
        + 'player\'s session would always be answered no_character. Order: ' + JSON.stringify(seen));

      /* ...and the authority gate still holds: nothing local ran. */
      assert(G.gold === goldBefore, 'processOffline credited gold locally with the switch ON');
      assert(G.lastOfflineSummary === null, 'a local welcome-back receipt was written');
      assert(G.offlineBudget.at === watermark,
        'the local watermark advanced — the b337 gate is no longer the FIRST statement of processOffline');
    } finally {
      window.fetch = realFetch;
      A.setServerAccrualEnabled(false);
      A.resetAccrualGate();
      A.hideAccrualHaltedSheet();
      C.resetCharacterIntent();
      C.configureCharacter(null);
      if (hiddenDesc) Object.defineProperty(document, 'hidden', hiddenDesc); else { try { delete document.hidden; } catch (e) {} }
      Object.assign(G, { gold: save.gold, skills: save.skills, inventory: save.inventory,
        activeSkill: save.activeSkill, skillTargetId: save.skillTargetId, activeMonster: save.activeMonster,
        activeArtisanRecipe: save.activeArtisanRecipe, offlineBudget: save.offlineBudget,
        lastSeen: save.lastSeen, lastOfflineSummary: save.los, restedAt: save.restedAt });
      window.__saveParked = wasParked;
    }
  }),

  /* B338-7 IS RETIRED (b515), and the reason it is retired rather than rewritten
     is the whole point of the retirement. It proved that the character intent
     shared ONE kill switch with accrual (`C.ACCRUE_KILL_KEY === A.ACCRUE_KILL_KEY`)
     and followed it in both directions, so no state could exist where the client
     created characters it would never accrue against, or accrued against one it
     never created. There is no switch left to share: `isCharacterIntentEnabled()`
     is a constant, the re-export is gone, and the two-state problem it defended
     against cannot be expressed. The surviving half of its subject — the intent
     answering TRUE on a pristine device, and every other family agreeing with it
     — is asserted by the inverted B353-1 above, which reads the SAME families
     through `families()`. */

  /* ══ b339 — CLEARING SECURITY'S CONDITIONS ON THE CLIENT REWIRE ══════════
     Six findings from the CLEAR-WITH-CONDITIONS review, each with the property
     it exists to hold stated as an assertion rather than as a comment. The
     recurring shape of this program's failures is an assertion that asserts
     nothing — thirteen instances now — so every test below was written by
     planting the bug first and watching it go red. The mutation that proves
     each one is named in its own comment. */

  () => tryRun('B339-1: the character latch is an IDENTITY — a different account never inherits a confirmation', () => {
    const C = window.HearthriseCharacter;
    /* PURE first, because the whole bug was that the key was a CONSTANT: the
       endpoint is the project URL (identical for every account) and the slot was
       hard-coded to 0, so `latchKey()` returned the same string for everybody.
       MUTATION: drop the userId from latchKey → the first assertion goes red. */
    const kA = C.latchKey('https://proj.supabase.co', 'user-A', 0);
    const kB = C.latchKey('https://proj.supabase.co', 'user-B', 0);
    const kA2 = C.latchKey('https://proj.supabase.co', 'user-A', 2);
    assert(kA && kB && kA !== kB,
      'two DIFFERENT accounts produce the same latch key (' + kA + ') — signing out of A and into B '
      + 'on this device would tell B its character exists without ever asking the server');
    assert(kA !== kA2, 'two different character slots produce the same latch key — slot 0\'s confirmation '
      + 'would be accepted for slot 2');
    assert(C.latchKey('https://proj.supabase.co', null, 0) === null,
      'an UNKNOWN identity produces a latch key — a signed-out device would inherit the last player\'s '
      + 'confirmation, which is the same bug wearing a null');
  }),

  () => tryRunAsync('B339-1b: signing into a DIFFERENT account re-asks the server (the latch does not carry over)', async () => {
    const C = window.HearthriseCharacter;
    const realFetch = window.fetch;
    let who = 'user-A';
    const calls = [];
    try {
      window.fetch = function (u, init) {
        if (!/hr_create_character/.test(String(u))) return realFetch.apply(this, arguments);
        calls.push(JSON.parse(init.body));
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true, slot: 0, created: false }) });
      };
      C.resetCharacterIntent();
      C.configureCharacter({ url: 'https://proj.supabase.co', apiKey: 'k',
        authToken: () => 'jwt', userId: () => who });

      const first = await C.ensureCharacter();
      assert(first.present === true, 'the first ensure did not confirm a character: ' + JSON.stringify(first));
      const second = await C.ensureCharacter();
      assert(second.cached === true && calls.length === 1,
        'the latch did not hold for the SAME account — ' + calls.length + ' requests. Without this control '
        + 'the next assertion would pass on a latch that never works at all');

      /* THE BUG. Same device, same endpoint, same slot — different player.
         MUTATION: revert latchKey to (endpoint, slot) → calls stays at 1. */
      who = 'user-B';
      const third = await C.ensureCharacter();
      assert(calls.length === 2,
        'a DIFFERENT account reused the first account\'s latch (' + calls.length + ' request(s)) — this device '
        + 'told player B the server had confirmed a character it has never asked about');
      assert(third.present === true, 'the re-ask did not confirm: ' + JSON.stringify(third));
    } finally {
      window.fetch = realFetch;
      C.resetCharacterIntent();
      C.configureCharacter(null);
    }
  }),

  () => tryRun('B339-2: signing out drops the character latch (resetCharacterIntent finally has a caller)', () => {
    const C = window.HearthriseCharacter;
    const Auth = window.HearthriseAuth;
    assert(Auth && typeof Auth.signOut === 'function', 'auth.js did not load');
    /* The b338 comment called resetCharacterIntent "the thing auth.js calls on
       sign-out" and grep found NO caller in src/. This drives the REAL sign-out
       path rather than asserting that the source contains a call.
       MUTATION: remove the resetCharacterIntent() line from signOut() → red. */
    const SAVE_KEY = 'hearthbound-save-v2';
    const savedBlob = (() => { try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; } })();
    /* signOut() genuinely parks the live save. Snapshot the park keys that
       already exist so the cleanup below removes ONLY the one this test caused —
       deleting a player's real parked backup to tidy up after a test would be a
       far worse bug than the one being guarded. */
    const parkBefore = (() => { try { return Object.keys(localStorage).filter((k) => k.startsWith('hearthrise:save-backup:')); } catch (e) { return []; } })();
    const wasParked = window.__saveParked;
    let fired = 0;
    const real = C.resetCharacterIntent;
    try {
      C.resetCharacterIntent = function () { fired++; return real.apply(this, arguments); };
      /* NOT awaited on purpose: everything this asserts happens synchronously,
         before signOut()'s first await, and awaiting would put a live Supabase
         round trip inside the suite. */
      try { Auth.signOut(); } catch (e) {}
      assert(fired === 1,
        'signOut() did not clear the character intent (' + fired + ' calls) — the latch, the in-flight '
        + 'request and the stop latch all survive into the next account on this device');
    } finally {
      C.resetCharacterIntent = real;
      try {
        if (savedBlob !== null) localStorage.setItem(SAVE_KEY, savedBlob);
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith('hearthrise:save-backup:') && parkBefore.indexOf(k) < 0) localStorage.removeItem(k);
        }
      } catch (e) {}
      window.__saveParked = wasParked;
      try { window.HearthriseSync?.releaseSnapshots?.(); } catch (e) {}
    }
  }),

  () => tryRunAsync('B339-3: both server intents address the ACTIVE character slot, not a hard-coded 0', async () => {
    const A = window.HearthriseAccrual;
    const C = window.HearthriseCharacter;
    const P = window.HearthriseProfile;
    assert(P && typeof P.activeSlot === 'function',
      'multi-character.js does not publish the active slot — the net layer would have to parse the '
      + 'profile record itself, which is a second reader of it');
    const realFetch = window.fetch;
    const savedProfile = P.profile;
    const seen = [];
    try {
      P.profile = { activeSlot: 2, unlockedSlots: 5, slots: [{ id: 0 }, { id: 1 }, { id: 2 }] };
      assert(A.resolveActiveSlot() === 2, 'accrue.js does not resolve the active slot: ' + A.resolveActiveSlot());
      assert(A.resolveActiveSlot(4) === 4, 'an explicitly pinned slot is ignored — the suite seam is gone');
      assert(A.clampSlot(9, 0) === 0 && A.clampSlot(-1, 0) === 0 && A.clampSlot('2', 0) === 0,
        'the slot is not clamped to [0,MAX_SLOT] as an integer — the server clamps too, but a client that '
        + 'sends nonsense cannot be told apart from one that is wrong');

      window.fetch = function (u, init) {
        const url = String(u);
        if (!/hr_create_character|hr-accrue/.test(url)) return realFetch.apply(this, arguments);
        seen.push({ url, body: JSON.parse(init.body) });
        if (/hr_create_character/.test(url)) {
          return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true, slot: 2, created: false }) });
        }
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true, accrued: false, reason: 'none' }) });
      };
      A.resetAccrualGate();
      C.resetCharacterIntent();
      /* NO `slot` in either config — exactly what auth.js now passes.
         MUTATION: put `slot: 0` back in either call → that endpoint sends 0. */
      A.configureAccrual({ url: 'https://proj.supabase.co', apiKey: 'k', authToken: () => 'jwt' });
      C.configureCharacter({ url: 'https://proj.supabase.co', apiKey: 'k', authToken: () => 'jwt', userId: () => 'user-A' });

      await C.ensureCharacter();
      await A.requestAccrual({ force: true });

      const create = seen.find((r) => /hr_create_character/.test(r.url));
      const accrue = seen.find((r) => /hr-accrue/.test(r.url));
      assert(create && create.body.p_slot === 2,
        'the character intent asked the server to create slot ' + JSON.stringify(create && create.body)
        + ' while the player is on slot 2 — it would bootstrap the wrong character');
      assert(accrue && accrue.body.slot === 2,
        'accrual asked for slot ' + JSON.stringify(accrue && accrue.body) + ' while the player is on slot 2 — '
        + 'applyEnvelope replaces G wholesale, so slot 0\'s server state would land in slot 2\'s save');
      assert(A.getAccrualConfig().slot === 2 && C.getCharacterConfig().slot === 2,
        'the reported config still says slot 0');
    } finally {
      window.fetch = realFetch;
      P.profile = savedProfile;
      A.resetAccrualGate();
      C.resetCharacterIntent();
      C.configureCharacter(null);
      A.configureAccrual(null);
    }
  }),

  () => tryRun('B339-3b: auth.js itself passes NO slot and a live user id — the wiring, not a stand-in for it', () => {
    const Auth = window.HearthriseAuth;
    assert(Auth && typeof Auth.wireServerIntents === 'function',
      'auth.js does not expose its server-intent wiring — the only way to check what it passes would be '
      + 'to re-derive it, which proves nothing about auth.js');
    /* B339-3 proves accrue.js RESOLVES the active slot. It cannot see auth.js
       going on pinning `slot: 0`, because it configures the modules itself —
       and a slot: 0 mutation in auth.js did slip past it. That is the "proof of
       the adjacent thing" family. This drives the REAL wiring function with spy
       modules and asserts the literal objects it hands over.
       MUTATION: add `slot: 0` to buildIntentWiring → red. */
    const token = () => 'tok';
    const uid = () => 'user-A';
    const got = {};
    const fakeWin = {
      HearthriseAccrual: { configureAccrual: (c) => { got.accrual = c; } },
      HearthriseCharacter: { configureCharacter: (c) => { got.character = c; } },
    };
    Auth.wireServerIntents(fakeWin, { url: 'https://proj.supabase.co', anonKey: 'anon', authToken: token, userId: uid });

    assert(got.accrual && got.character, 'wireServerIntents configured nothing: ' + JSON.stringify(Object.keys(got)));
    assert(!('slot' in got.accrual),
      'auth.js still pins a slot for accrual (' + got.accrual.slot + ') — the player\'s active character is '
      + 'irrelevant to it, and applyEnvelope would write that slot\'s state over theirs');
    assert(!('slot' in got.character),
      'auth.js still pins a slot for the character intent (' + got.character.slot + ') — it would bootstrap '
      + 'the wrong character');
    assert(got.character.userId === uid && typeof got.character.userId === 'function',
      'the user id is not the live accessor — a captured id is the id at sign-in, and the latch stops being '
      + 'an identity the moment it changes');
    assert(got.accrual.authToken === token && got.character.authToken === token,
      'the token is not the live accessor (the b331 dead-token loop started with a captured one)');
    assert(got.accrual.url === 'https://proj.supabase.co' && got.accrual.apiKey === 'anon'
      && got.character.url === 'https://proj.supabase.co' && got.character.apiKey === 'anon',
      'the two intents were given different credentials — there must be exactly one copy: ' + JSON.stringify(got));

    /* Each side independently guarded: one module throwing must not leave the
       other unwired. */
    const got2 = {};
    Auth.wireServerIntents({
      HearthriseAccrual: { configureAccrual: () => { throw new Error('boom'); } },
      HearthriseCharacter: { configureCharacter: (c) => { got2.character = c; } },
    }, { url: 'u', anonKey: 'k', authToken: token, userId: uid });
    assert(got2.character, 'a throw in the accrual wiring also skipped the character wiring');
  }),

  /* B339-4 IS RETIRED (b515). It proved that FLIPPING the kill switch stamped
     both away watermarks in BOTH directions, because a flip that did not was a
     flip whose OFF position minted progress: the server owns `accrued_to` and
     never advances the local watermarks, so an OFF that measured from before the
     armed span re-paid everything the server had already paid, capped only by
     offlineCapHours. Every assertion in it turned on a CHANGE OF POSITION.

     There are no positions. The switch is retired, `stampAwayWatermarks` is
     deleted with it (its only production caller was the flip), and the local
     `processOffline` that would have re-measured the span is deleted too. The
     property it defended — a local path paying a span the server already paid —
     is now unreachable by construction rather than by a stamp, and B353-1 above
     asserts the deletion (`typeof A.stampAwayWatermarks !== 'function'`) so the
     watermark writer cannot quietly come back as a client-side helper. */

  () => tryRun('B339-5: the server character REPLACES local progress, and it says so before it does it', () => {
    const A = window.HearthriseAccrual;
    /* The envelope a fresh server character produces, against a device holding a
       real beta save. applyEnvelope rebuilds skills + inventory from the
       envelope ALONE and saveLocal() then makes it the newest save, so this is
       permanent and unrecoverable. That is the DESIGNED behaviour (importing a
       client-authored blob would launder the exploit the program exists to
       close) and it is not changed here — but it may not happen silently. */
    const envelope = {
      ok: true, accrued: true, version: 3, now: '2026-08-14T00:00:00Z',
      state: { slot: 0, gold: 500, hp: 100, max_hp: 100 },
      skills: { woodcutting: { xp: 0, level: 1 }, hitpoints: { xp: 1154, level: 10 } },
      inventory: { turnip_seed: 3 },
      away: { grantMs: 0, gold: 0, xp: {}, items: {} },
    };
    /* `normal_log` (a woodcutting gather product) is a SERVER-OWNED id — the only
       kind describeReplacement now counts as a potential loss, because an omitted
       UN-modeled id is preserved by the carve-out and would be a false alarm.
       See SERVER-OWNED-3. */
    const veteran = () => ({ gold: 900000, skills: { woodcutting: 5000000, hitpoints: 1154 },
      inventory: { normal_log: 400, turnip_seed: 3 } });
    const wasAcked = A.isReplacementAcknowledged();
    try {
      A.acknowledgeReplacement(false);
      A.hideReplacementSheet();

      const loss = A.describeReplacement(veteran(), envelope);
      assert(loss.destructive === true, 'a 900k-gold, 5M-XP save is not counted as a destructive replacement');
      assert(loss.gold === 899500 && loss.skillXp === 5000000 - 0 && loss.items === 400,
        'the loss is misreported — a sheet that states the wrong numbers is worse than none: '
        + JSON.stringify(loss));

      /* ══ b456 — THE SHEET HAS RETIRED, EXACTLY WHERE ITS OWN ⏳ NOTE SAID ══
         accrue.js's gate carries the expiry condition in prose: "THE SHEET
         RETIRES FULLY when the client stops holding a rival copy at all — i.e.
         when gold/skills/inventory are on SERVER_OF_RECORD and the load strip
         deletes them, at which point describeReplacement is permanently
         non-destructive and this branch is unreachable." The b455 capstone did
         exactly that, so under the shipping default there IS no local authored
         character to be replaced: applying the envelope IS the load, and putting
         a consent modal in front of it would be asking the player to approve
         their own save file loading.
         Both positions are asserted, and the DORMANT one still pins the whole
         original gate — including the mutation it was written for. */
      /* ══ THE SHEET IS GONE, AND THAT IS THE ASSERTION NOW (b515) ═══════════
         This test used to grade TWO positions: with the local blob live the
         envelope was REFUSED until the player consented, and with it retired the
         envelope applied silently. b515 deleted the consent branch from
         accrue.js applyEnvelope outright (its header says so in as many words:
         "the replacement sheet is GONE, not gated"), because the rival local
         character it protected no longer exists on any device — the b353 kill
         switch that could bring one back is retired too.

         So the surviving property is the ARMED one, and it is asserted
         unconditionally rather than behind an `if (isBlobRetired())` that can
         only be true: a cold load applies, the SERVER's gold lands, and the
         "permanently gone" modal is never raised on a path the player cannot
         get past. `describeReplacement` is still exported and still measured
         above, because the DRIFT COUNTER (`envelopeDrift.destructive`, which the
         inventory-arm decision reads) is built on it.
         MUTATION: make `applyEnvelope` return null when `loss.destructive` →
         'ARMED: the envelope was refused' goes red. */
      A.acknowledgeReplacement(false);
      A.hideReplacementSheet();
      const GArmed = veteran();
      const wroteArmed = A.applyEnvelope(GArmed, envelope);
      assert(wroteArmed, 'ARMED: the envelope was refused even though the local blob is retired — there is no '
        + 'rival copy to protect, so this is a load the player can never get past');
      assert(GArmed.gold === 500, 'ARMED: the server gold did not land: ' + GArmed.gold);
      assert(!document.getElementById(A.ACCRUE_REPLACE_SHEET_ID),
        'ARMED: the replacement consent sheet was shown with the blob retired — under the capstone this '
        + 'fires on a normal load and the only way through it is to consent, so it protects nothing '
        + 'while making the game unusable');
      /* AND THE COPY IS STILL RIGHT, because `showReplacementSheet` remains
         exported and a future caller must not find a sheet that lies. Driven
         directly — it has no load-path caller left to reach it through. */
      A.showReplacementSheet(loss, veteran(), envelope, () => {});
      const sheet = document.getElementById(A.ACCRUE_REPLACE_SHEET_ID);
      assert(sheet, 'showReplacementSheet renders nothing at all');
      const copy = sheet.textContent;
      assert(/899500|899,500/.test(copy) && /permanently/i.test(copy),
        'the sheet does not state what is lost, in numbers: ' + copy.slice(0, 200));
      A.hideReplacementSheet();

      /* …and once acknowledged it applies, silently, forever after.
         b359 — WHAT "APPLIES" MEANS NARROWED, AND THE OLD MEANING WAS THE P0.
         This asserted `skills.woodcutting === 0` and `inventory.logs ===
         undefined`: the envelope had to ZERO a veteran's live-earned skill and
         DELETE his stack. That is the deletion a player reported on
         2026-08-17. Live XP and drops have no server writer yet, so an
         envelope that omits them is silent, not authoritative.
         What still must hold — and is what the consent sheet is actually
         warning about — is that the server's GOLD lands (its writer HAS
         moved), and that a contest the server enters, it wins. The sheet's
         own copy is asserted above and is unchanged. */
      A.acknowledgeReplacement(true);
      const G2 = veteran();
      const written = A.applyEnvelope(G2, envelope);
      assert(written && G2.gold === 500,
        'the acknowledged replacement did not apply — ' + JSON.stringify({ written, G2 }));
      assert(G2.skills.woodcutting === 5000000 && G2.inventory.normal_log === 400,
        'live-earned XP/items the envelope omits must SURVIVE it — ' + JSON.stringify({ skills: G2.skills, inv: G2.inventory }));

      /* CONTROL: a device with NOTHING to lose must never see the sheet. A gate
         that fires on every player is a gate nobody reads. */
      A.acknowledgeReplacement(false);
      A.hideReplacementSheet();
      const fresh = { gold: 0, skills: {}, inventory: {} };
      assert(A.describeReplacement(fresh, envelope).destructive === false,
        'a brand-new device is treated as a destructive replacement');
      assert(A.applyEnvelope(fresh, envelope) && fresh.gold === 500,
        'a non-destructive envelope was refused');
      assert(!document.getElementById(A.ACCRUE_REPLACE_SHEET_ID),
        'the sheet was shown to a player with nothing to lose');
    } finally {
      A.hideReplacementSheet();
      A.acknowledgeReplacement(wasAcked);
    }
  }),

  /* ── b366 — DEVICE HANDOFF ────────────────────────────────────────────────
     Tyler, moving from his computer to his phone: "I keep getting warnings about
     stuff not being synced, and all I tried to do was move from my computer to my
     phone. Wildly terrible experience."
     Four independent defects conspired, and each one below is the guard against
     its own return. The shared root cause is worth naming once: the code kept
     inferring LIVENESS ("someone is playing elsewhere") from a WRITE ("someone
     saved recently"). A departing device's last act is a save, so every clean
     handoff looked identical to a double-session. Liveness is a heartbeat. */

  () => tryRun('CONCURRENT-1: a recent WRITER with no live CLAIM is not a concurrent session (the handoff false alarm)', () => {
    const S = window.HearthriseSync;
    assert(typeof S.decideConcurrent === 'function', 'decideConcurrent must be exposed');
    const NOW = 1770000000000;
    const ME = 'i-me', OTHER = 'i-desktop';
    const STALE = S.CLAIM_STALE_MS;
    assert(typeof STALE === 'number' && STALE > 0, 'CLAIM_STALE_MS must be exposed as a number');

    /* THE REPRODUCTION. The desktop wrote game_saves 3 seconds ago (its b299
       pagehide keepalive snapshot) and then STOPPED — its claim heartbeat is
       older than the stale window because the tab is closed. Pre-b366 this was
       the only input checked and it read "concurrent", every single handoff.
       MUTATION that turns this red: gate on the save row's __device/__cloudSavedAt
       instead of the claim heartbeat. */
    const departed = { owner: OTHER, hbMs: NOW - (STALE + 1000), at: NOW };
    assert(S.decideConcurrent(departed, ME, NOW).concurrent === false,
      'a device that saved on its way out but stopped beating must NOT be called concurrent');

    /* …and the genuine case must still be caught, or the fix is just a mute. */
    const live = { owner: OTHER, hbMs: NOW - 5000, at: NOW };
    const v = S.decideConcurrent(live, ME, NOW);
    assert(v.concurrent === true && v.otherDevice === OTHER && v.agoMs === 5000,
      'a still-beating foreign claim must be reported: ' + JSON.stringify(v));

    // Every no-evidence shape resolves to "not concurrent" — never a guess.
    assert(S.decideConcurrent(null, ME, NOW).concurrent === false, 'unknown claim view must not warn');
    assert(S.decideConcurrent({ owner: null, hbMs: NOW, at: NOW }, ME, NOW).concurrent === false, 'no owner must not warn');
    assert(S.decideConcurrent({ owner: ME, hbMs: NOW, at: NOW }, ME, NOW).concurrent === false, 'our OWN claim must never warn');
    assert(S.decideConcurrent({ owner: OTHER, hbMs: 0, at: NOW }, ME, NOW).concurrent === false, 'a claim with no heartbeat must not warn');
    assert(S.decideConcurrent({ owner: OTHER, hbMs: NOW + 60000, at: NOW }, ME, NOW).concurrent === false,
      'a future-dated heartbeat (clock skew) must not warn');
  }),

  () => tryRun('CONCURRENT-2: the same device is never accused twice, not even across the restore reload', () => {
    const S = window.HearthriseSync;
    assert(typeof S.hasWarnedConcurrent === 'function' && typeof S.markWarnedConcurrent === 'function',
      'the warned-state seam must be exposed');
    const KEY = 'hr:concurrentWarnedFor';
    let prior = null;
    try { prior = sessionStorage.getItem(KEY); } catch (e) {}
    try {
      try { sessionStorage.removeItem(KEY); } catch (e) {}
      S.markWarnedConcurrent('');
      assert(S.hasWarnedConcurrent('i-desktop') === false, 'a device we have never warned about must be warnable');
      S.markWarnedConcurrent('i-desktop');
      assert(S.hasWarnedConcurrent('i-desktop') === true, 'we must not warn about the same device twice');

      /* THE RELOAD. A cloud restore ends in location.reload(), which re-evaluates
         the module and reset the old module-scope `concurrentWarned` flag — so the
         player got the same accusation a second time, seconds later, having done
         nothing. sessionStorage survives a reload; that is why the state lives
         there. Simulated by reading the persisted key directly, which is exactly
         what the freshly-evaluated module does.
         MUTATION that turns this red: store warned-state in a module variable. */
      let persisted = null;
      try { persisted = sessionStorage.getItem(KEY); } catch (e) {}
      assert(persisted === 'i-desktop',
        'warned-state must be persisted per TAB so a reload cannot re-accuse the same device, got ' + persisted);

      // A DIFFERENT device is a different fact and must still be able to warn.
      assert(S.hasWarnedConcurrent('i-tablet') === false, 'a different device must still be warnable');
      // Nothing to warn about is treated as already-warned (never fires a null warning).
      assert(S.hasWarnedConcurrent(null) === true, 'a null device id must never produce a warning');
    } finally {
      try { if (prior === null) sessionStorage.removeItem(KEY); else sessionStorage.setItem(KEY, prior); } catch (e) {}
      S.markWarnedConcurrent(prior || '');
    }
  }),

  () => tryRun('CLAIM-CLOBBER: a snapshot upload from an instance that no longer owns the claim is refused', () => {
    const S = window.HearthriseSync;
    assert(typeof S.decideUploadAllowed === 'function', 'decideUploadAllowed must be exposed');
    const NOW = 1770000000000;
    const ME = 'i-desktop', PHONE = 'i-phone';
    const STALE = S.CLAIM_STALE_MS;

    /* THE CLOBBER WINDOW. The phone claims at t+1.5s and restores; the desktop
       only learns it lost the claim at its next 15s poll — and its 60s
       snapshotIfDue can fire in between, uploading a pre-handoff save over the
       phone's fresh one. The player watches progress vanish.
       MUTATION that turns this red: delete the mayUploadSnapshot() guard from
       snapshotIfDue, or make it return true unconditionally. */
    assert(S.decideUploadAllowed({ owner: PHONE, hbMs: NOW - 2000, at: NOW }, ME, NOW) === false,
      'a non-owning instance must not upload over the live owner');

    /* INVARIANT 2 — REFUSE ONLY ON CERTAINTY. Every uncertain shape must still
       upload: a device that cannot read the claim table must never silently stop
       saving. This half matters more than the half above — the failure it
       prevents is total, silent data loss on a flaky connection. */
    assert(S.decideUploadAllowed(null, ME, NOW) === true, 'an UNKNOWN claim must not block saving');
    assert(S.decideUploadAllowed({ owner: null, hbMs: 0, at: NOW }, ME, NOW) === true, 'nobody owning the claim must not block saving');
    assert(S.decideUploadAllowed({ owner: ME, hbMs: NOW - 1000, at: NOW }, ME, NOW) === true, 'the owner must be able to save');
    assert(S.decideUploadAllowed({ owner: PHONE, hbMs: 0, at: NOW }, ME, NOW) === true, 'a heartbeat-less claim is not certainty');
    assert(S.decideUploadAllowed({ owner: PHONE, hbMs: NOW - (STALE + 1), at: NOW }, ME, NOW) === true,
      'an abandoned (stale) claim must not block saving — that is a closed tab, not a live session');

    // The guard and the warning must be the SAME fact, always, or they will drift.
    [null, { owner: PHONE, hbMs: NOW - 2000, at: NOW }, { owner: ME, hbMs: NOW, at: NOW },
     { owner: PHONE, hbMs: NOW - (STALE + 1), at: NOW }].forEach((v) => {
      assert(S.decideUploadAllowed(v, ME, NOW) === !S.decideConcurrent(v, ME, NOW).concurrent,
        'the upload guard and the concurrency verdict disagree for ' + JSON.stringify(v));
    });

    // The claim view is a real, inspectable seam (the guard's live input).
    assert(typeof S.getClaimView === 'function' && typeof S.__setClaimView === 'function',
      'the claim view seam must be exposed');
    const was = S.getClaimView();
    try {
      S.__setClaimView({ owner: PHONE, hbMs: NOW, at: NOW });
      const cv = S.getClaimView();
      assert(cv && cv.owner === PHONE, 'the claim view must round-trip');
    } finally { S.__setClaimView(was); }
  }),

  () => tryRun('TAKEOVER-1: a tab that reclaimed with a NEWER epoch is not stolen back by the parked tab on its next heartbeat', () => {
    const S = window.HearthriseSync;
    assert(typeof S.decideClaimAction === 'function', 'decideClaimAction must be exposed');
    assert(typeof S.CLAIM_DEAD_MS === 'number' && S.CLAIM_DEAD_MS > S.CLAIM_STALE_MS,
      'CLAIM_DEAD_MS must be exposed and exceed the stale window');
    const NOW = 1770000000000;
    const STALE = S.CLAIM_STALE_MS;
    const A = 'i-desktop', B = 'i-phone';

    /* THE PING-PONG. Tab B pressed "Bring it back here" and reclaimed at T2,
       stamping claimed_at = T2 (a strictly-newer epoch than A's last claim at
       T1). B is mid-reload, so its heartbeat is momentarily STALE. Pre-b374 A's
       next poll saw "foreign owner, stale heartbeat" and RECLAIMED — stealing the
       session straight back and re-evicting the tab the user just chose. With the
       epoch, A parks instead: B out-ranks it.
       MUTATION that turns this red: drop the epoch comparison from
       decideClaimAction (reclaim on any stale foreign owner). */
    const T1 = NOW - 120000;   // A's own last explicit claim
    const T2 = NOW - 20000;    // B's newer claim (it reclaimed 20s ago, now reloading)
    const bReloading = { owner: B, hbMs: NOW - (STALE + 4000), epochMs: T2, at: NOW };
    assert(S.decideClaimAction(bReloading, A, T1, NOW) === 'evict',
      'a strictly-newer-epoch owner mid-return must PARK the parked tab, not be reclaimed');

    // And the same view, but A being the OWNER, is trivially kept.
    assert(S.decideClaimAction({ owner: A, hbMs: NOW - 1000, epochMs: T1, at: NOW }, A, T1, NOW) === 'owner',
      'our own live claim must be kept, never contended');

    // A live newer-epoch owner (fresh heartbeat) is likewise an eviction, not a fight.
    assert(S.decideClaimAction({ owner: B, hbMs: NOW - 3000, epochMs: T2, at: NOW }, A, T1, NOW) === 'evict',
      'a live foreign owner must evict us regardless of epoch');

    /* CONTROL — proof the epoch is what flips it. Same stale foreign owner, but
       with an OLDER epoch than ours: now it does NOT out-rank us, so it is a dead
       tab we may take over (that is TAKEOVER-2's mechanism, asserted here as the
       negative of this test so a reversed comparison is caught). */
    assert(S.decideClaimAction({ owner: B, hbMs: NOW - (STALE + 4000), epochMs: T1 - 1, at: NOW }, A, T1, NOW) === 'reclaim',
      'a stale foreign owner with an OLDER epoch does not out-rank us and stays reclaimable');
  }),

  () => tryRun('TAKEOVER-2: a genuinely dead tab is still silently reclaimable (single-session must never deadlock)', () => {
    const S = window.HearthriseSync;
    const NOW = 1770000000000;
    const STALE = S.CLAIM_STALE_MS;
    const DEAD = S.CLAIM_DEAD_MS;
    const ME = 'i-desktop', GHOST = 'i-old';

    /* THE CLOSED TAB. The account's prior tab owns the row but was closed — its
       heartbeat stopped beating past the stale window. The surviving/new tab must
       take over silently rather than sit on an eviction gate for a tab that no
       longer exists. */
    // Owner epoch older-or-equal to ours → never out-ranks → reclaim at STALE.
    assert(S.decideClaimAction({ owner: GHOST, hbMs: NOW - (STALE + 1000), epochMs: NOW - 200000, at: NOW }, ME, NOW - 100000, NOW) === 'reclaim',
      'a stale owner that does not out-rank us must be reclaimed silently');
    // A tab that never claimed before (myEpoch 0) meeting a nobody-owned row claims it.
    assert(S.decideClaimAction({ owner: null, hbMs: 0, epochMs: 0, at: NOW }, ME, 0, NOW) === 'claim',
      'an unowned claim row must be taken');

    /* THE ESCAPE HATCH — never lock a player out. Even a NEWER-epoch owner, once
       silent past CLAIM_DEAD_MS, is genuinely gone (not reloading), so it becomes
       reclaimable. Without this a device that crashed right after claiming could
       leave the account permanently gated on every other device.
       MUTATION that turns this red: park unconditionally on a newer epoch. */
    assert(S.decideClaimAction({ owner: GHOST, hbMs: NOW - (DEAD + 1000), epochMs: NOW - 10000, at: NOW }, ME, NOW - 100000, NOW) === 'reclaim',
      'a newer-epoch owner silent past CLAIM_DEAD_MS is gone and must be reclaimable — never a permanent lockout');
    // Just BEFORE the dead horizon, the same newer-epoch owner is still respected.
    assert(S.decideClaimAction({ owner: GHOST, hbMs: NOW - (STALE + 1000), epochMs: NOW - 10000, at: NOW }, ME, NOW - 100000, NOW) === 'evict',
      'inside the dead horizon a newer-epoch owner is still given room to return');

    // The epoch round-trips through the live claim-view seam (the real input).
    assert(typeof S.getMyEpoch === 'function' && typeof S.__setMyEpoch === 'function',
      'the own-epoch seam must be exposed');
    const wasEp = S.getMyEpoch();
    try {
      S.__setMyEpoch(NOW - 5000);
      assert(S.getMyEpoch() === NOW - 5000, 'our own epoch must round-trip');
    } finally { S.__setMyEpoch(wasEp); }
  }),

  () => tryRun('ACCRUE-REPLACE-HANDOFF: the "permanently gone" sheet never fires while the cloud reconcile is unresolved', () => {
    const A = window.HearthriseAccrual;
    const S = window.HearthriseSync;
    assert(typeof A.isReconcilePending === 'function', 'isReconcilePending must be exposed');

    /* THE RACE. On the phone, loadLocal() puts a WEEK-OLD save in G; the server
       envelope reflects the desktop session, which SPENT gold — so local > server
       on plain arithmetic and describeReplacement says "destructive". The sheet
       fired, telling the player their progress would be "permanently gone",
       while pullAndMaybeRestore was still in flight with the save that actually
       wins. The gate is correct; its ORDERING was not.
       MUTATION that turns this red: remove the isReconcilePending() deferral from
       applyEnvelope. */
    const envelope = {
      ok: true, accrued: true, version: 3, now: '2026-08-16T00:00:00Z',
      state: { slot: 0, gold: 40, hp: 100, max_hp: 100 },
      skills: { woodcutting: { xp: 10, level: 2 } },
      inventory: {},
      away: { grantMs: 0, gold: 0, xp: {}, items: {} },
    };
    const stalePhoneSave = () => ({ gold: 12000, skills: { woodcutting: 90000 }, inventory: { logs: 60 } });

    const wasAck = A.isReplacementAcknowledged();
    const wasHeld = S.isSnapshotHeld();
    try {
      A.acknowledgeReplacement(false);
      A.hideReplacementSheet();
      assert(A.describeReplacement(stalePhoneSave(), envelope).destructive === true,
        'the fixture must actually look destructive, or this test proves nothing');

      // ── reconcile IN FLIGHT ────────────────────────────────────────────────
      S.holdSnapshots();
      assert(A.isReconcilePending() === true, 'the reconcile gate must be visible to accrue');
      const G1 = stalePhoneSave();
      assert(A.applyEnvelope(G1, envelope) === null, 'a deferred envelope must write nothing');
      assert(G1.gold === 12000 && G1.skills.woodcutting === 90000 && G1.inventory.logs === 60,
        'the save was mutated during the deferral: ' + JSON.stringify(G1));
      assert(!document.getElementById(A.ACCRUE_REPLACE_SHEET_ID),
        'the "permanently gone" sheet was shown mid-handoff, before the reconcile decided which save wins');

      // ── reconcile SETTLED — the gate is NOT softened, only re-ordered ──────
      S.releaseSnapshots();
      assert(A.isReconcilePending() === false, 'releasing the gate must end the deferral');
      /* …and once it HAS settled the envelope applies, silently. b515 deleted
         the consent branch (see B339-5), so the second position this test used
         to grade — "genuine divergence must STILL ask the player", driven with
         the local blob live — no longer exists to be graded: there is no rival
         local character for the sheet to protect. What remains, and what this
         test is named for, is that the DEFERRAL is ordering and not amnesty:
         while the reconcile is unresolved nothing is written, and the moment it
         resolves the same envelope lands.
         MUTATION: remove the `isReconcilePending()` branch from applyEnvelope →
         the 'deferred envelope must write nothing' assertion above goes red. */
      A.hideReplacementSheet();
      A.acknowledgeReplacement(false);
      const G3 = stalePhoneSave();
      assert(A.applyEnvelope(G3, envelope) && G3.gold === 40,
        'a post-reconcile envelope was refused — the deferral became a permanent block and the player '
        + 'cannot get past it');
      assert(!document.getElementById(A.ACCRUE_REPLACE_SHEET_ID),
        'the load path raised the "permanently gone" sheet — it is deleted, and a normal load must never '
        + 'ask the player to approve their own save file loading');
    } finally {
      A.hideReplacementSheet();
      A.acknowledgeReplacement(wasAck);
      if (wasHeld) S.holdSnapshots(); else S.releaseSnapshots();
    }
  }),

  /* ── THE TWO TWINS OF THE ABOVE (b366) ────────────────────────────────────
     The handoff deferral shipped in accrue.js's applyEnvelope and NOWHERE ELSE,
     while `describeReplacement` + the same consent gate are copied into two
     more appliers: the activity switch and the gold verbs. A device handoff
     does not know which verb happens to answer first — a phone that wakes up
     mid-reconcile and switches activity, or completes a purchase, reaches the
     SAME stale-save comparison down a path that never got the fix. Recorded as
     a handoff at the time; this is it being paid.
     MUTATION for each: remove the isReconcilePending() branch from the named
     function → RED. */
  () => tryRun('ACCRUE-REPLACE-HANDOFF-2: the ACTIVITY envelope defers the same sheet mid-reconcile', () => {
    const A = window.HearthriseAccrual;
    const S = window.HearthriseSync;
    const M = window.HearthriseActivity;
    assert(M && typeof M.applyIntentEnvelope === 'function', 'applyIntentEnvelope must be published');
    const body = {
      ok: true, verb: 'set_activity', version: 3, now: '2026-08-16T00:00:00Z',
      state: { slot: 0, gold: 40, hp: 100, max_hp: 100 },
      skills: { woodcutting: { xp: 10, level: 2 } }, inventory: {},
    };
    const stalePhoneSave = () => ({ gold: 12000, skills: { woodcutting: 90000 }, inventory: { logs: 60 } });
    const wasAck = A.isReplacementAcknowledged();
    const wasHeld = S.isSnapshotHeld();
    try {
      A.acknowledgeReplacement(false);
      A.hideReplacementSheet();
      assert(A.describeReplacement(stalePhoneSave(), body).destructive === true,
        'the fixture must actually look destructive, or this test proves nothing');

      S.holdSnapshots();
      const G1 = stalePhoneSave();
      assert(M.applyIntentEnvelope(G1, body) === null, 'a deferred switch envelope must write nothing');
      assert(G1.gold === 12000 && G1.skills.woodcutting === 90000,
        'the save was mutated during the deferral: ' + JSON.stringify(G1));
      assert(!document.getElementById(A.ACCRUE_REPLACE_SHEET_ID),
        'the "permanently gone" sheet was shown by the ACTIVITY verb mid-handoff');

      /* ORDERING, NOT AMNESTY — the same proof the accrue twin carries. */
      S.releaseSnapshots();
      const G2 = stalePhoneSave();
      assert(M.applyIntentEnvelope(G2, body) === null, 'a genuinely destructive switch envelope must still refuse');
      assert(document.getElementById(A.ACCRUE_REPLACE_SHEET_ID),
        'once reconcile has settled the activity verb must STILL ask the player');
    } finally {
      A.hideReplacementSheet();
      A.acknowledgeReplacement(wasAck);
      if (wasHeld) S.holdSnapshots(); else S.releaseSnapshots();
    }
  }),

  () => tryRun('ACCRUE-REPLACE-HANDOFF-3: the GOLD envelope defers too — and abandons its prediction (F3)', () => {
    const A = window.HearthriseAccrual;
    const S = window.HearthriseSync;
    const Gd = window.HearthriseGold;
    assert(Gd && typeof Gd.applyGoldEnvelope === 'function', 'applyGoldEnvelope must be published');
    const body = {
      ok: true, verb: 'vendor_sell', version: 9, now: '2026-08-16T00:00:00Z',
      state: { slot: 0, gold: 40, hp: 100, max_hp: 100 },
      skills: { woodcutting: { xp: 10, level: 2 } }, inventory: {},
    };
    const stalePhoneSave = () => ({ gold: 12000, skills: { woodcutting: 90000 }, inventory: { logs: 60 } });
    const wasAck = A.isReplacementAcknowledged();
    const wasHeld = S.isSnapshotHeld();
    try {
      Gd.resetGold();
      A.acknowledgeReplacement(false);
      A.hideReplacementSheet();
      S.holdSnapshots();

      const G1 = stalePhoneSave();
      const key = Gd.newIntentKey();
      Gd.settle(G1, 250, 'vendor.sell_one', key);
      assert(Gd.getGoldState().inflight === 1, 'the fixture must have an outstanding prediction');
      assert(Gd.applyGoldEnvelope(G1, body, key) === null, 'a deferred gold envelope must write nothing');
      assert(!document.getElementById(A.ACCRUE_REPLACE_SHEET_ID),
        'the "permanently gone" sheet was shown by a GOLD verb mid-handoff');
      /* ⚠ EVERY EXIT MUST ACCOUNT FOR `ownKey`. A deferral that left the
         prediction INFLIGHT would carry it onto every future envelope for the
         rest of the session — F1 wearing a deferral instead of a dialog. */
      const st = Gd.getGoldState();
      assert(st.inflight === 0 && st.abandoned === 1,
        'the deferral left the prediction inflight (' + JSON.stringify(st.pending) + ')');
    } finally {
      A.hideReplacementSheet();
      A.acknowledgeReplacement(wasAck);
      Gd.resetGold();
      if (wasHeld) S.holdSnapshots(); else S.releaseSnapshots();
    }
  }),

  () => tryRunAsync('B339-6: a pre-b338 server (ok:true, no `created`) is refused LOUDLY and asked exactly once', async () => {
    const C = window.HearthriseCharacter;
    const realFetch = window.fetch;
    const realErr = console.error;
    const errs = [];
    let calls = 0;
    try {
      /* THE LIVE PRODUCTION RESPONSE, quoted from a rolled-back probe of the
         deployed hr_create_character: {"ok":true,"slot":0} and no `created`.
         2026-08-14-character-bootstrap.sql is STAGED AND UNAPPLIED, so this is
         what the switch would meet today. */
      const v = C.classifyCreateResponse(200, { ok: true, slot: 0 });
      assert(v.outcome === 'malformed' && v.reason === 'no_created_flag',
        'a 200 with no `created` flag was accepted as a confirmation — the client would latch a character '
        + 'it cannot prove exists: ' + JSON.stringify(v));
      assert(C.isCharacterPresent(v.outcome) === false, 'no_created_flag counts as a present character');

      console.error = function (...a) { errs.push(a.join(' ')); };
      window.fetch = function (u) {
        if (!/hr_create_character/.test(String(u))) return realFetch.apply(this, arguments);
        calls++;
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true, slot: 0 }) });
      };
      C.resetCharacterIntent();
      C.configureCharacter({ url: 'https://proj.supabase.co', apiKey: 'k',
        authToken: () => 'jwt', userId: () => 'user-A' });

      const r1 = await C.ensureCharacter();
      assert(r1.present === false, 'the client claimed a character exists on a malformed answer');
      assert(errs.some((m) => /pre-b338/i.test(m) && /character-bootstrap\.sql/.test(m)),
        'the failure was not reported loudly or by name — a generic warning sends the next reader looking '
        + 'at the client for a database problem. Saw: ' + JSON.stringify(errs));

      /* Asked ONCE. The live body charges the 6/hour CREATION budget BEFORE its
         slot_taken check, so six reloads exhaust it and the player is then told
         `rate_limited` on top of a problem they cannot fix.
         MUTATION: delete the `stopped` latch → calls becomes 2. */
      const r2 = await C.ensureCharacter();
      assert(calls === 1, 'the client re-asked a question only a database deploy can change ('
        + calls + ' requests) — six of those exhaust the 6/hour creation budget');
      assert(r2.present === false && r2.cached === true, 'the second answer changed: ' + JSON.stringify(r2));

      // …and it is not permanent: a re-wire (new account, new session) re-arms it.
      C.resetCharacterIntent();
      await C.ensureCharacter();
      assert(calls === 2, 'resetCharacterIntent did not clear the stop latch — a real fix would never be seen');
    } finally {
      window.fetch = realFetch;
      console.error = realErr;
      C.resetCharacterIntent();
      C.configureCharacter(null);
    }
  }),

  /* ═══════════════════════════════════════════════════════════════════════
     b340 — THE CLIENT IS OFF THE TABLES IT USED TO WRITE AND READ DIRECTLY

     Two migrations were blocked on this client, and both blockers are the same
     shape: a table (or view) the browser touches directly, which the server
     wants to take away.

       · 2026-08-11-market-v2.sql revokes every client write grant on
         market_listings. src/net/supabase-market-backend.js POSTed and DELETEd
         that table, so applying it would have taken listing and cancelling
         down on a live beta.
       · 2026-08-14-leaderboard-view-lockdown.sql drops `leaderboard` and
         `clan_leaderboard`, two SECURITY DEFINER views an UNAUTHENTICATED
         caller can read for every player's uuid, name, gold and levels.
         src/features/clans.js fetched both.

     Every test below drives the REAL CALLER with a stubbed transport and reads
     the request it issued, rather than testing a pure helper the caller might
     not use. b339 shipped a fix that spanned a module and its caller, tested
     the module, and left the bug in the caller with the suite green at
     639/639 — so the assertion here is always "which URL did the SHIPPING
     method actually request".

     Every refusal is paired with a CONTROL proving the legacy path still works
     on a server that has not been migrated yet, because a client that refuses
     to talk to production at all would pass an assertion of the form "it never
     requests the table".
     ═══════════════════════════════════════════════════════════════════════ */

  // The predicate itself. "The RPC is missing" is the decision that governs
  // whether a security narrowing is in effect, and it must never be inferred
  // from a bad day on the server.
  () => tryRun('b340: the RPC-capability seam separates a proven absence from a refusal', () => {
    const R = window.HearthriseRpc;
    assert(R && typeof R.isMissingRpc === 'function', 'HearthriseRpc must be published');

    // ABSENT — all four shapes PostgREST/PostgreSQL use.
    assert(R.isMissingRpc(404, null), '404 must read as absent');
    assert(R.isMissingRpc(400, { code: 'PGRST202' }), 'PGRST202 must read as absent');
    assert(R.isMissingRpc(400, { code: '42883' }), '42883 (undefined_function) must read as absent');
    assert(R.isMissingRpc(400, { code: '42P01' }), '42P01 (undefined_table — a dropped view) must read as absent');

    // NOT ABSENT — the control. Reading any of these as "the server has no such
    // function" would silently fall back to the exact table read the migration
    // exists to close, and would do it precisely when the server is unhappy.
    assert(!R.isMissingRpc(200, { ok: true }), 'a successful answer is not an absence');
    assert(!R.isMissingRpc(401, { message: 'JWT expired' }), 'an expired token is a refusal, not an absence');
    assert(!R.isMissingRpc(403, { code: '42501' }), 'insufficient_privilege is a refusal, not an absence');
    assert(!R.isMissingRpc(429, null), 'a rate limit is a refusal, not an absence');
    assert(!R.isMissingRpc(500, { code: 'XX000' }), 'a server fault is a refusal, not an absence');

    // The probe cache: a NEGATIVE expires (a migration can be applied while a
    // session is open), a POSITIVE cannot (an RPC is never un-applied).
    R.reset('smoke_probe');
    assert(R.capability('smoke_probe') === 'unknown', 'an unprobed name is unknown');
    const t0 = 1000000;
    R.note('smoke_probe', false, t0);
    assert(R.capability('smoke_probe', t0 + 1000) === 'absent', 'a fresh negative is absent');
    assert(R.shouldTry('smoke_probe', t0 + 1000) === false, 'a fresh negative must stop the RPC attempt');
    assert(R.capability('smoke_probe', t0 + R.NEGATIVE_TTL_MS + 1) === 'unknown',
      'a stale negative must re-probe — otherwise a session open across the migration never heals');
    R.note('smoke_probe', true, t0);
    assert(R.capability('smoke_probe', t0 + R.NEGATIVE_TTL_MS * 100) === 'present',
      'a positive never expires');
    R.reset('smoke_probe');

    /* THE DRIFT GUARD. src/features/leaderboards.js has carried its own copy of
       this predicate since b222 and is not being churned to adopt the seam.
       b332 cost five builds of silently deleted content because FNV-1a was
       copied into five files and one copy differed, so the two copies are
       required to AGREE rather than merely to exist. reduceBoard maps an
       absence to action:'unsupported'. */
    const LB = window.HearthriseLeaderboards;
    assert(LB && LB._reduceBoard, 'leaderboards module missing');
    [[404, null], [400, { code: 'PGRST202' }], [400, { code: '42883' }], [400, { code: '42P01' }],
     [401, { message: 'x' }], [403, { code: '42501' }], [429, null], [500, { code: 'XX000' }],
     [200, { ok: true }]].forEach(([st, body]) => {
      const mine = R.isMissingRpc(st, body);
      const theirs = LB._reduceBoard(st, body).action === 'unsupported';
      assert(mine === theirs,
        `the two copies of isMissingRpc disagree on ${st}/${JSON.stringify(body)} — `
        + 'seam says ' + mine + ', leaderboards.js says ' + theirs);
    });
  }),

  // MARKET — the write path. The whole reason market-v2 was blocked.
  () => tryRunAsync('b340: listing and cancelling go through market_list/market_cancel, never the table', async () => {
    const M = window.HearthriseSupabaseMarket;
    assert(M && typeof M.createListing === 'function',
      'the supabase market backend must be loaded and published for its request shape to be testable');
    const R = window.HearthriseRpc;

    const calls = [];
    const realFetch = window.fetch;
    const sb = window.HearthriseSupabase;
    const auth = window.HearthriseAuth;
    const realGetConfig = sb && sb.getConfig;
    const realGetSession = auth && auth.getSession;
    try {
      if (sb) sb.getConfig = () => ({ url: 'https://probe.invalid', anonKey: 'anon-probe-key' });
      if (auth) auth.getSession = () => ({ access_token: 'tok', user: { id: 'u-1' } });
      window.fetch = function (url, opts) {
        calls.push({ url: String(url), opts: opts || {} });
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ ok: true, listing_id: 'srv-1' }),
        });
      };

      // ── v2 available (capability unknown → the RPC is tried first)
      R.reset(M._CAPABILITY);
      await M.createListing({ itemId: 'normal_log', qty: 5, askEach: 12, sellerSlot: 2, sellerName: 'X' });
      assert(calls.length === 1, `createListing must issue exactly one request, saw ${calls.length}`);
      let c = calls[0];
      /* The control substring: this is what the block looked like. */
      assert(!/\/rest\/v1\/market_listings/.test(c.url),
        'the client must not POST market_listings directly — that write is what blocks market-v2: ' + c.url);
      assert(c.url.indexOf('/rest/v1/rpc/market_list') !== -1, 'listing must go through market_list: ' + c.url);
      assert(String(c.opts.method).toUpperCase() === 'POST', 'a PostgREST RPC call must be POST');
      let body = JSON.parse(c.opts.body || '{}');
      assert(body.p_item_id === 'normal_log' && body.p_qty === 5 && body.p_ask_each === 12 && body.p_slot === 2,
        'market_list param names must match the SQL signature exactly: ' + c.opts.body);
      assert(typeof body.p_intent_id === 'string' && body.p_intent_id.length >= 32,
        'every v2 call must carry an idempotency key, or a retry double-lists: ' + c.opts.body);
      /* NOT SENT, and that is the point: identity, name and clock are derived
         by the server. A client that still sends them is a client that still
         believes it owns them. */
      assert(!('seller_user_id' in body) && !('seller_name' in body) && !('posted_at' in body),
        'the v2 request must not carry client-authored identity/name/clock: ' + c.opts.body);

      calls.length = 0;
      await M.cancelListing('L-9');
      c = calls[0];
      assert(String(c.opts.method).toUpperCase() !== 'DELETE',
        'cancelling must not DELETE the table row directly: ' + c.url);
      assert(c.url.indexOf('/rest/v1/rpc/market_cancel') !== -1, 'cancel must go through market_cancel: ' + c.url);

      calls.length = 0;
      await M.buyListing('L-9', 3);
      c = calls[0];
      assert(c.url.indexOf('/rest/v1/rpc/market_buy') !== -1,
        'buying must go through market_buy, which is the RPC that actually moves the gold: ' + c.url);
      assert(!/rpc\/buy_listing/.test(c.url), 'buy_listing moves no value — it must not be preferred: ' + c.url);

      // ── CONTROL: a server WITHOUT the RPCs must still work. Without this the
      //    assertions above would pass on a client that had simply stopped
      //    talking to production, which is today's server.
      R.reset(M._CAPABILITY);
      calls.length = 0;
      window.fetch = function (url, opts) {
        calls.push({ url: String(url), opts: opts || {} });
        if (/\/rpc\//.test(String(url))) {
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ code: 'PGRST202' }) });
        }
        return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve([]) });
      };
      await M.createListing({ itemId: 'normal_log', qty: 1, askEach: 1, sellerSlot: 0, sellerName: 'X' });
      assert(calls.length >= 1 && calls[0].url.indexOf('/rest/v1/rpc/market_list') !== -1,
        'the RPC must still be TRIED first on an unprobed server');
      assert(R.capability(M._CAPABILITY) === 'absent',
        'a proven 404 must be remembered, or every listing pays for two round trips');
    } finally {
      window.fetch = realFetch;
      if (sb && realGetConfig) sb.getConfig = realGetConfig;
      if (auth && realGetSession) auth.getSession = realGetSession;
      window.HearthriseRpc.reset(M._CAPABILITY);
    }
  }),

  /* THE DEPENDENCY THE HANDOFF'S BLOCKER LIST DID NOT NAME. market-v2
     recreates market_sales with no `collected` column — the seller is paid at
     sale time — so the v1 collect poll would filter on a column that does not
     exist, every minute, forever, and swallow the failure. */
  () => tryRunAsync('b340: the v1 sale-collect poll stops once the server is proven to be market v2', async () => {
    const M = window.HearthriseSupabaseMarket;
    assert(M && typeof M.collectSales === 'function', 'the market backend must be loaded');
    const R = window.HearthriseRpc;

    const calls = [];
    const realFetch = window.fetch;
    const sb = window.HearthriseSupabase;
    const auth = window.HearthriseAuth;
    const realGetConfig = sb && sb.getConfig;
    const realGetSession = auth && auth.getSession;
    try {
      if (sb) sb.getConfig = () => ({ url: 'https://probe.invalid', anonKey: 'anon-probe-key' });
      if (auth) auth.getSession = () => ({ access_token: 'tok', user: { id: 'u-1' } });
      window.fetch = function (url, opts) {
        calls.push({ url: String(url), opts: opts || {} });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      };

      // CONTROL FIRST: on a v1 server the poll must still run, or sellers stop
      // being paid and this test would "pass" by doing nothing at all.
      R.reset(M._CAPABILITY);
      let p = M.collectSales();
      if (p && p.catch) p.catch(() => {});
      assert(calls.length === 1 && /market_sales/.test(calls[0].url),
        'on a v1 server the collect poll must still read market_sales: ' + JSON.stringify(calls));
      assert(/collected=eq\.false/.test(calls[0].url), 'the v1 poll filters on the collected flag');

      // …and on a proven-v2 server it must issue NOTHING.
      calls.length = 0;
      R.note(M._CAPABILITY, true);
      p = M.collectSales();
      if (p && p.catch) p.catch(() => {});
      assert(calls.length === 0,
        'under market v2 there is nothing to collect and no `collected` column to filter on — '
        + 'the poll must stop, not fail silently once a minute: ' + JSON.stringify(calls));

      // …and a 42703 from the table read is itself the proof that v2 is live,
      // so the capability heals with no probe request and no reload.
      R.reset(M._CAPABILITY);
      window.fetch = function () {
        return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ code: '42703' }) });
      };
      const rows = await M.collectSales();
      assert(Array.isArray(rows) && rows.length === 0, 'a failed collect returns no proceeds');
      assert(R.capability(M._CAPABILITY) === 'present',
        'an undefined-column answer identifies the v2 schema — it must not be retried forever');
    } finally {
      window.fetch = realFetch;
      if (sb && realGetConfig) sb.getConfig = realGetConfig;
      if (auth && realGetSession) auth.getSession = realGetSession;
      window.HearthriseRpc.reset(M._CAPABILITY);
    }
  }),

  // F5 — the clan browser. `clan_leaderboard` stayed anon-readable for one line.
  () => tryRun('b340/F5: the clan browser reads the hr_clan_browser RPC, not the anon-readable view', () => {
    const C = window.HearthriseClans;
    assert(C && typeof C.listClans === 'function', 'HearthriseClans.listClans must be published');
    const R = window.HearthriseRpc;

    const calls = [];
    const realFetch = window.fetch;
    const sb = window.HearthriseSupabase;
    const realGetConfig = sb && sb.getConfig;
    try {
      if (sb) sb.getConfig = () => ({ url: 'https://probe.invalid', anonKey: 'anon-probe-key' });
      window.fetch = function (url, opts) {
        calls.push({ url: String(url), opts: opts || {} });
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ ok: true, clans: [{ id: 'c1', name: 'Ashfell', level: 4, members: 2 }] }),
        });
      };

      R.reset('hr_clan_browser');
      let p = C.listClans();
      if (p && p.catch) p.catch(() => {});
      assert(calls.length === 1, `listClans must issue exactly one request, saw ${calls.length}`);
      let c = calls[0];
      /* The control substring: this read is the reason two advisor ERRORs are
         still open, and it answers to an anon key. */
      assert(c.url.indexOf('/rest/v1/clan_leaderboard') === -1,
        'the client must not read clan_leaderboard directly — anon can read that view: ' + c.url);
      assert(c.url.indexOf('/rest/v1/rpc/hr_clan_browser') !== -1,
        'the browser must go through hr_clan_browser: ' + c.url);
      assert(String(c.opts.method).toUpperCase() === 'POST', 'a PostgREST RPC call must be POST');
      assert(JSON.parse(c.opts.body || '{}').p_limit === 25, 'the browser asks for 25 (the server clamps at 50)');

      // A REFUSAL IS NOT AN ABSENCE. A 401 must not silently reopen the view.
      R.reset('hr_clan_browser');
      calls.length = 0;
      window.fetch = function (url, opts) {
        calls.push({ url: String(url), opts: opts || {} });
        return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ message: 'JWT expired' }) });
      };
      p = C.listClans();
      if (p && p.catch) p.catch(() => {});
      assert(calls.length === 1 && calls[0].url.indexOf('/rest/v1/rpc/') !== -1,
        'an expired token must NOT fall back to the world-readable view: ' + JSON.stringify(calls.map((x) => x.url)));

      // CONTROL: a server that genuinely has no such function still gets a
      // working clan browser, because the migration is staged and production
      // has not had it applied.
      R.reset('hr_clan_browser');
      calls.length = 0;
      window.fetch = function (url, opts) {
        calls.push({ url: String(url), opts: opts || {} });
        if (/\/rpc\//.test(String(url))) {
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ code: 'PGRST202' }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      };
      p = C.listClans();
      if (p && p.catch) p.catch(() => {});
      assert(calls[0].url.indexOf('/rest/v1/rpc/hr_clan_browser') !== -1,
        'the RPC must be tried first even on an un-migrated server');
    } finally {
      window.fetch = realFetch;
      if (sb && realGetConfig) sb.getConfig = realGetConfig;
      window.HearthriseRpc.reset('hr_clan_browser');
    }
  }),

  // F5 — the other view. clans.js kept a SECOND leaderboard transport alive.
  () => tryRun('b340/F5: NetClient.leaderboard goes through hr_leaderboard, never the `leaderboard` view', () => {
    assert(typeof NetClient !== 'undefined' && typeof NetClient.leaderboard === 'function',
      'NetClient.leaderboard must exist — src/features/clans.js patches it');
    const LB = window.HearthriseLeaderboards;
    assert(LB && typeof LB.fetchBoard === 'function',
      'leaderboards.js must publish fetchBoard — it is now the ONE leaderboard transport');

    const calls = [];
    const realFetch = window.fetch;
    const sb = window.HearthriseSupabase;
    const realGetConfig = sb && sb.getConfig;
    try {
      if (sb) sb.getConfig = () => ({ url: 'https://probe.invalid', anonKey: 'anon-probe-key' });
      LB._resetProbe();
      window.fetch = function (url, opts) {
        calls.push({ url: String(url), opts: opts || {} });
        return Promise.resolve({
          ok: true, status: 200,
          headers: { get: () => null },
          json: () => Promise.resolve({
            ok: true, board: 'total_level', total: 2, rank: null, near: [],
            top: [{ rank: 1, id: 'u1', name: 'Aldric', clan: 'Ash', score: 812 }],
          }),
        });
      };

      const p = NetClient.leaderboard('total');
      if (p && p.catch) p.catch(() => {});
      assert(calls.length >= 1, 'NetClient.leaderboard must issue at least one request');
      /* The control substring: this exact read is what kept the view alive and
         is what an anon key could call. */
      const leaked = calls.filter((c) => /\/rest\/v1\/leaderboard\?/.test(c.url));
      assert(leaked.length === 0,
        'the client must not read the `leaderboard` view directly: ' + leaked.map((c) => c.url).join(' | '));
      assert(calls.every((c) => c.url.indexOf('/rest/v1/rpc/hr_leaderboard') !== -1),
        'every board read must go through hr_leaderboard: ' + calls.map((c) => c.url).join(' | '));
      /* Lv / CL / gold are three different boards, and the fallback renderer
         prints all three on every row. Filling two of them with zeroes would be
         fabricated data about other players. */
      const boards = calls.map((c) => JSON.parse(c.opts.body || '{}').p_board).sort();
      assert(boards.join(',') === 'combat_level,total_level,wealth',
        'all three stat boards must be read, not one padded with zeroes: ' + boards.join(','));
    } finally {
      window.fetch = realFetch;
      if (sb && realGetConfig) sb.getConfig = realGetConfig;
      LB._resetProbe();
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b340 — MOVING THE RECORD (src/net/record.js).

     b337/b338/b339 moved a COMPUTATION to the server. Security's summary was
     exact: the RECORD stayed on the client, in `game_saves.snapshot`, a blob a
     player edits in devtools. These tests pin the seam that moves a record, and
     the property they exist for is narrow and mechanical:

       A FIELD THE SERVER OWNS HAS EXACTLY ONE SOURCE. It is deleted from every
       save blob on the way IN, and written only by record.js's applyRecord from
       a server envelope. A value with two sources is the class that produced
       the starting-kit divergence and the five-copies FNV hash.

     THE STRIP IS TESTED AT THE CALLER, TWICE. b339's post-mortem: a test drove
     accrue.js's slot resolver, proved it correct, and auth.js went on pinning
     `slot: 0` — the mutation was in the CALLER and slipped. So B340-3 drives the
     real `window.loadLocal()` and B340-4 drives auth.js's own overlay function,
     rather than both testing record.js and calling it covered.

     WHAT IS NOT MOVED, said plainly so nobody reads more into this than it
     does: gold, inventory, skill XP, rested XP, the farm and every other value
     in the snapshot are still client-authored. ONE field moved — the away
     watermark — because it is the only field whose WRITER has already moved
     (b337 owns it), and the record must follow the writer. See the ordering
     table in src/net/record.js. */

  () => tryRun('B340-1: the registry decodes fail-closed — a garbage watermark is UNKNOWN, never 1970', () => {
    const R = window.HearthriseRecord;
    assert(R, 'src/net/record.js did not load — the record seam is absent and nothing below means anything');
    assert(R.serverOfRecordFields().indexOf('offlineBudget') !== -1,
      'offlineBudget is not on the registry: ' + JSON.stringify(R.serverOfRecordFields()));

    const at = Date.parse('2026-08-14T10:00:00Z');
    const ok = R.decodeRecord({ ok: true, version: 3, state: { accrued_to: '2026-08-14T10:00:00Z' } });
    assert(ok.ok && ok.fields.offlineBudget && ok.fields.offlineBudget.at === at,
      'a valid ISO watermark did not decode: ' + JSON.stringify(ok));

    /* THE LOAD-BEARING HALF. `0` is the most dangerous fallback a watermark can
       have — it means "last paid in 1970", i.e. a whole capped window, every
       boot. It must be UNREACHABLE, not merely unlikely.
       MUTATION: relax the decode to `if (!Number.isFinite(ms)) return null` and
       the epoch/negative cases below go green while the field decodes to 0. */
    for (const bad of [null, undefined, 'not-a-date', 0, -1, '1970-01-01T00:00:00Z', NaN, {}, []]) {
      const d = R.decodeRecord({ ok: true, version: 3, state: { accrued_to: bad } });
      assert(d.ok === true, 'a bad watermark broke the whole decode: ' + JSON.stringify(bad));
      assert(!('offlineBudget' in d.fields),
        'the watermark ' + JSON.stringify(bad) + ' decoded to ' + JSON.stringify(d.fields.offlineBudget)
        + ' instead of being reported missing — a 1970 watermark grants a full capped window on every boot');
      assert(d.missing.indexOf('offlineBudget') !== -1, 'it was dropped without being reported missing');
    }

    // An envelope that is not an envelope decodes to nothing at all.
    for (const junk of [null, {}, { ok: false }, { ok: true }, { ok: true, state: {} }]) {
      assert(R.decodeRecord(junk).ok === false || !Object.keys(R.decodeRecord(junk).fields).length,
        'junk was decoded as a record: ' + JSON.stringify(junk));
    }
  }),

  () => tryRun('B340-2: the strip removes the moved field, touches nothing else, and never mutates its input', () => {
    const R = window.HearthriseRecord;
    /* b456: THE FIXTURE IS DERIVED FROM THE REGISTRY, NOT LISTED BY HAND, and
       that is the whole repair. This test used to hand-build a blob holding the
       three fields that were moved at the time and compare `out.stripped` with
       `serverOfRecordFields()`. The cutover armed six more, none of which were in
       the fixture, so the comparison failed on fields the strip had never been
       GIVEN — a fixture rotting against the thing it is supposed to measure.
       Building the blob FROM the registry means the next arm cannot rot it, and
       the property is the same one, now total: every moved field is removed,
       nothing else is, and the caller's object is not touched.
       `restedAt` used to be the unmoved exemplar; it is armed now, so the
       exemplars are two fields that are genuinely not on the registry. */
    const moved = R.serverOfRecordFields();
    assert(moved.length > 0, 'the registry is empty — everything below would be vacuous');
    const UNMOVED = { lastSeen: 99, stats: { kills: 10 }, playerName: 'Ash' };
    for (const k of Object.keys(UNMOVED)) {
      assert(moved.indexOf(k) === -1, '`' + k + '` is on the registry now — pick a different unmoved exemplar');
    }
    const blob = JSON.parse(JSON.stringify(UNMOVED));
    moved.forEach((f, i) => { blob[f] = { __moved: f, n: i + 1 }; });
    const before = JSON.stringify(blob);

    const out = R.stripServerOfRecord(blob);
    for (const f of moved) assert(!(f in out.blob), 'the moved field `' + f + '` survived the strip');
    assert(out.stripped.slice().sort().join(',') === moved.slice().sort().join(','),
      'the strip did not report exactly the moved set: ' + JSON.stringify(out.stripped)
      + ' vs ' + JSON.stringify(moved));
    assert(out.blob.lastSeen === 99 && out.blob.stats.kills === 10 && out.blob.playerName === 'Ash',
      'the strip took something it does not own: ' + JSON.stringify(out.blob));
    assert(JSON.stringify(blob) === before,
      'the strip MUTATED its argument — the caller may still be holding the parsed snapshot for logging, '
      + 'and a strip that reaches back into it makes that log lie about what arrived');

    // forgetServerOfRecord works on a LIVE object (G is one reference, b127).
    const g = JSON.parse(JSON.stringify(UNMOVED));
    moved.forEach((f) => { g[f] = { __moved: f }; });
    const forgot = R.forgetServerOfRecord(g);
    for (const f of moved) assert(!(f in g), 'forgetServerOfRecord left `' + f + '` on the live object');
    assert(g.lastSeen === 99 && g.playerName === 'Ash', 'forgetServerOfRecord cleared a field it does not own');
    assert(forgot.slice().sort().join(',') === moved.slice().sort().join(','),
      'forgetServerOfRecord did not report exactly the moved set: ' + JSON.stringify(forgot));
  }),

  /* b456: driven with the blob LIVE (withLocalBlob). Under the capstone default
     `loadLocal()` returns before it reads anything, so the strip-at-the-caller
     seam this test exists to pin would never run and the test would measure the
     absence of a read. The seam still ships and still matters the moment the
     capstone is disarmed — and it is the ONLY thing standing between a devtools
     watermark and a full capped window. The armed no-op is CAPSTONE-NOOP's job. */
  /* B340-3 IS RETIRED (b515), and its subject is deleted rather than moved.
     It proved that `loadLocal()` ran `stripRecordFields()` on the blob BEFORE
     `Object.assign(G, …)` — the caller, not the callee — so a forged
     `offlineBudget` in a devtools-edited save could not become the record.
     b515 deleted the blob read, and `stripRecordFields` with it (its only
     caller was that read). There is no `Object.assign(G, parsedBlob)` left in
     legacy.js for a forged field to travel through.

     What replaced it is strictly stronger and is asserted by CAPSTONE-NOOP
     immediately above: loadLocal reads NOTHING and DROPS any leftover blob, so
     a forged field cannot reach G by that route at all — there is no field
     list to keep in sync and no strip to forget to call. The CLOUD twin of the
     same seam (B340-4, `stripRecordFieldsForOverlay`) is live, still forks, and
     is still tested. */

  /* ══════════════════════════════════════════════════════════════════════════
     b456 CAPSTONE-NOOP — THE SHIPPING DEFAULT: THE LOCAL BLOB IS RETIRED.
     ══════════════════════════════════════════════════════════════════════════
     Nine save/load tests in this file are now driven through `withLocalBlob`,
     which means nine tests assert the OFF position and NOTHING asserted the ON
     one. That asymmetry is how "the flag is armed" becomes an ambient belief
     rather than a fact: every one of those tests would go on passing if the
     capstone silently disarmed.

     THE PROPERTY, and why it is worth a test of its own. The live cutover failed
     because the pagehide autosave kept re-persisting a pre-wipe blob between
     clear-and-reloads, resurrecting dead state on every boot ("the items are
     still here" loop). Under the arm the blob is not a cache, it is a STALE
     RIVAL, so:
       · saveLocal() must WRITE NOTHING — not a smaller blob, nothing;
       · loadLocal() must READ NOTHING **and drop any leftover blob**, so a later
         disarm cannot resurrect a save from before the wipe.
     MUTATION: delete either capstone gate in legacy.js → this goes red. */
  () => tryRun('CAPSTONE-NOOP: with the blob RETIRED, saveLocal writes nothing and loadLocal drops what it finds', () => {
    const C = window.HearthriseCapstone;
    assert(C && typeof C.isBlobRetired === 'function', 'src/net/capstone.js did not load — the capstone is the contract');
    assert(C.BLOB_RETIRED === true,
      'BLOB_RETIRED shipped FALSE — the local blob is live again, and a stale local rival is exactly what the '
      + 'cutover incident was');
    assert(C.isBlobRetired() === true, 'the capstone reports dormant with the flag on (is the master accrual switch off?)');
    if (typeof window.saveLocal !== 'function' || typeof window.loadLocal !== 'function') return;
    const KEY = 'hearthbound-save-v2';
    const G = window.G;
    const before = localStorage.getItem(KEY);
    const savedKills = G.stats && G.stats.kills;
    try {
      // A leftover blob from a pre-capstone session, carrying a value G does not have.
      localStorage.setItem(KEY, JSON.stringify({ stats: { kills: 424242 }, lastSeen: 1 }));
      window.saveLocal();
      assert(localStorage.getItem(KEY) === JSON.stringify({ stats: { kills: 424242 }, lastSeen: 1 }),
        'saveLocal WROTE while the blob is retired — the autosave is re-persisting a rival copy of the character');

      G.stats = G.stats || {};
      G.stats.kills = 7;
      window.loadLocal();
      assert(G.stats.kills === 7,
        'loadLocal READ the retired blob back into G (kills became ' + G.stats.kills + ') — a stale local copy '
        + 'the server never authored has just become the character');
      assert(localStorage.getItem(KEY) === null,
        'loadLocal left the leftover blob in place — a later disarm would resurrect a pre-wipe save');
    } finally {
      if (savedKills === undefined) { try { delete G.stats.kills; } catch (e) {} } else { G.stats.kills = savedKills; }
      if (before === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, before);
    }
  }),

  () => tryRun('B340-4: the CLOUD overlay is stripped too, and a missing record.js fails LOUD rather than silently restoring', () => {
    const Auth = window.HearthriseAuth;
    const A = window.HearthriseAccrual;
    assert(Auth && typeof Auth.stripRecordFieldsForOverlay === 'function',
      'auth.js does not expose its overlay strip — the only way to check the cloud seam would be to '
      + 're-derive it, which proves nothing about auth.js (B339-3b, same lesson)');
    const wasOn = A.isServerAccrualEnabled();
    try {
      /* b456: `restedAt` used to be the genuinely-unmoved control here; the
         cutover armed it, so the overlay correctly stripped it too and the
         "touches nothing else" half of this test started failing on a field it
         was never supposed to keep. The control is now a field that is NOT on
         the registry, asserted to be off it rather than assumed. */
      const R = window.HearthriseRecord;
      assert(R.serverOfRecordFields().indexOf('lastSeen') === -1,
        '`lastSeen` is on the registry now — pick a different unmoved control for this test');
      const snap = { lastSeen: 7, offlineBudget: { at: 5 } };

      /* b515: the "switch OFF returns the snapshot untouched" control is gone
         with the switch. `stripRecordFieldsForOverlay` strips unconditionally
         now, so the honest control is the COMPLEMENT rather than a position:
         the unmoved field must survive the strip, which the assertion below
         states directly (`on.lastSeen === 7`). A strip that returned an empty
         object would pass "offlineBudget is gone" and fail that. */
      const on = Auth.stripRecordFieldsForOverlay(snap, window);
      assert(on !== snap, 'the overlay strip returned its ARGUMENT — it must never mutate the caller\'s '
        + 'parsed snapshot (the log would then lie about what arrived)');
      assert(!('offlineBudget' in on) && on.lastSeen === 7,
        'the cloud overlay still carries the server-owned field — the local seam was closed and the cloud '
        + 'one left open, which is a hole, not a slice: ' + JSON.stringify(on));

      /* FAIL LOUD, NOT SILENT. If record.js is absent while the switch is on,
         returning the blob would read a forgeable field into G invisibly. The
         switch is read from accrue.js and the field list from record.js
         precisely so a missing record.js cannot present itself as "switch off".
         MUTATION: `if (!R) return snap;` → this assertion goes red. */
      let threw = null;
      try { Auth.stripRecordFieldsForOverlay(snap, { HearthriseAccrual: A }); }
      catch (e) { threw = e; }
      assert(threw && /record\.js/.test(String(threw.message)),
        'a missing record.js silently restored a cloud save carrying server-owned fields');
    } finally {
      restoreAccrualSwitch(wasOn);
    }
  }),

  () => tryRun('B340-5: applyRecord is the ONE writer, and it is monotonic — a slow answer cannot rewind the watermark', () => {
    const R = window.HearthriseRecord;
    const g = {};
    const envelope = (v, iso) => ({ ok: true, version: v, now: iso, state: { accrued_to: iso } });

    const a = R.applyRecord(g, envelope(5, '2026-08-14T10:00:00Z'));
    assert(a.written.length === 1 && g.offlineBudget.at === Date.parse('2026-08-14T10:00:00Z'),
      'applyRecord did not write the record: ' + JSON.stringify(a));
    assert(R.recordValue(g, 'offlineBudget').known === true, 'the applied field is not reported known');

    /* hr_load and hr-accrue race BY DESIGN — one reads, the other pays — and
       both answer truthfully. The slower answer is the OLDER one, and without
       this it would put back a watermark the payment already advanced, i.e. pay
       the same span twice.
       MUTATION: delete the `dec.version < prev` guard → RED. */
    const stale = R.applyRecord(g, envelope(4, '2026-08-14T08:00:00Z'));
    assert(stale.skipped === 'stale' && g.offlineBudget.at === Date.parse('2026-08-14T10:00:00Z'),
      'an OLDER envelope rewound the watermark to ' + new Date(g.offlineBudget.at).toISOString()
      + ' — the span between the two would be paid a second time');

    // A newer one applies. Equal applies (an idempotent rewrite is not a rewind).
    R.applyRecord(g, envelope(6, '2026-08-14T12:00:00Z'));
    assert(g.offlineBudget.at === Date.parse('2026-08-14T12:00:00Z'), 'a newer envelope was refused');

    /* An envelope whose watermark is garbage writes NOTHING — not the field,
       and not the provenance stamp either. Stamping it would mean "the server
       told us" quietly coming to mean "the server was asked".
       This assertion was WRITTEN THE OTHER WAY ROUND first — it demanded that a
       later unreadable answer blank the earlier known value — and B340-6's fix
       made the two contradict, which is what exposed it. The rule the rest of
       this codebase already follows decides it: save-invariant #2, act only on
       CERTAINTY. An unreadable later read is not certainty that the earlier one
       was wrong, so it must not destroy it. The same reasoning is why a network
       error never evicts a device. */
    const known0 = JSON.stringify(R.recordValue(g, 'offlineBudget'));
    const bad = R.applyRecord(g, { ok: true, version: 9, state: { accrued_to: 'nonsense' } });
    assert(bad.written.length === 0 && bad.missing.indexOf('offlineBudget') !== -1
      && bad.skipped === 'no_record_fields',
      'a garbage watermark was written: ' + JSON.stringify(bad));
    assert(g.offlineBudget.at === Date.parse('2026-08-14T12:00:00Z'),
      'a garbage watermark overwrote a good one: ' + JSON.stringify(g.offlineBudget));
    assert(JSON.stringify(R.recordValue(g, 'offlineBudget')) === known0,
      'an envelope carrying no record changed the provenance of one that does — a version bump with no '
      + 'record must be indistinguishable from never having asked: ' + JSON.stringify(R.recordValue(g, 'offlineBudget')));
  }),

  () => tryRun('B422: a stale boot read still FILLS an UNKNOWN balance (em-dash-gold after a cloud restore) without rewinding the watermark', () => {
    const R = window.HearthriseRecord;
    const B = window.HearthriseBalance;
    assert(R && typeof R.applyRecord === 'function' && typeof R.recordValue === 'function'
      && B && typeof B.balanceOf === 'function', 'record.js / balance.js did not load');
    // gold must be armed for this to mean anything (it is — see B353-3c).
    assert(R.isServerOfRecord('gold'), 'gold is not on SERVER_OF_RECORD — this guard is moot');

    /* THE STATE A CLOUD-RESTORE / NEW-DEVICE BOOT LANDS IN, reproduced through the
       REAL applyRecord path (no _record poking):
         1. an away-accrue lands FIRST at a higher version, but its lean envelope
            carries only the watermark — gold/gems are in `missing`. So the record
            is stamped at v7 with offlineBudget KNOWN and gold UNKNOWN.
         2. the boot hr_load — which DID carry gold — arrives SECOND and OLDER
            (it read the pre-accrue row, or the persisted _record.version is high).
       Before b422 step 2 was rejected `stale` wholesale, so gold stayed UNKNOWN:
       em-dash top bar, Buy/Sell fail-closed, until the next higher-version settle. */
    const g = {};
    const accrue = R.applyRecord(g, { ok: true, version: 7, now: '2026-08-18T10:00:00Z',
      state: { accrued_to: '2026-08-18T10:00:00Z' } });               // lean: watermark only
    assert(accrue.written.indexOf('offlineBudget') !== -1, 'setup: the watermark did not stamp');
    assert(B.balanceOf(g, 'gold').known === false, 'setup: gold should be UNKNOWN before the boot read');
    const wmBefore = g.offlineBudget.at;

    const boot = R.applyRecord(g, { ok: true, version: 5, now: '2026-08-18T09:00:00Z',
      state: { gold: 72181, gems: 15, accrued_to: '2026-08-18T08:00:00Z' } });  // OLDER, but carries gold

    // THE FIX: gold/gems are filled from the older read because they were UNKNOWN.
    const rvGold = B.balanceOf(g, 'gold');
    assert(rvGold.known === true && rvGold.value === 72181,
      'the stale boot read did not fill UNKNOWN gold — em-dash-gold survives a cloud restore: ' + JSON.stringify(rvGold));
    // And recordValue itself — the accessor balanceOf delegates to — reports the
    // field MOVED (known), correctly argumented as recordValue(G, field). "moved"
    // is not a state separate from the stamp: it IS _record.known + a matching
    // fingerprint, both of which the gap-fill now writes.
    assert(R.recordValue(g, 'gold').known === true && R.recordValue(g, 'gold').source === 'server',
      'recordValue still reports gold not-served after the gap-fill: ' + JSON.stringify(R.recordValue(g, 'gold')));
    assert(B.balanceOf(g, 'gems').known === true && B.balanceOf(g, 'gems').value === 15,
      'gems was not filled alongside gold');
    assert(boot.filledStale === true && boot.written.indexOf('gold') !== -1,
      'applyRecord did not report a stale gap-fill: ' + JSON.stringify(boot));

    // ...and the watermark (a KNOWN field) was NOT rewound to the older read, and
    // the record version was not lowered — the monotonic invariant B340-5 protects.
    assert(g.offlineBudget.at === wmBefore,
      'the older read rewound the watermark — the span between the two would be paid twice: '
      + new Date(g.offlineBudget.at).toISOString());
    assert(R.recordValue(g, 'offlineBudget').known === true && g._record.version === 7,
      'the stale gap-fill lowered the record version or dropped the known watermark: v=' + g._record.version);
  }),

  () => tryRunAsync('B428: a boot read that outruns its config is REPLAYED when the endpoint arrives (the new-device em dash)', async () => {
    const R = window.HearthriseRecord;
    const B = window.HearthriseBalance;
    assert(R && typeof R.beginRecordLoad === 'function' && typeof R.configureRecord === 'function'
      && typeof R.onRecordApplied === 'function' && B, 'record.js/balance.js did not load');
    assert(R.isServerOfRecord('gold'), 'gold is not armed — this guard is moot');

    const realFetch = window.fetch;
    const realG = window.G;
    let painted = 0;
    try {
      // A fresh new-device boot: NO endpoint yet (auth.js has not wired it).
      R.resetRecord();
      R.configureRecord(null);
      window.G = {};                                   // the record applies onto window.G
      R.onRecordApplied(() => { painted++; });
      window.fetch = function (u) {
        if (!/hr_load/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, version: 12, now: '2026-08-18T10:00:00Z',
          state: { slot: 0, gold: 72131, gems: 15, accrued_to: '2026-08-18T10:00:00Z' },
        }), { status: 200 }));
      };

      // 1) The boot read fires BEFORE config → unconfigured, and is NOT abandoned
      //    silently: the field stays UNKNOWN (fail-closed) and nothing repaints.
      const early = await R.beginRecordLoad();
      assert(early.outcome === 'unconfigured' && early.reason === 'no_endpoint',
        'an unconfigured boot read did not report no_endpoint: ' + JSON.stringify(early));
      assert(B.balanceOf(window.G, 'gold').known === false, 'gold must be UNKNOWN before the endpoint exists');
      assert(painted === 0, 'a failed load must not repaint');

      // 2) configureRecord arrives (auth wired the session). It REPLAYS the boot
      //    read; awaiting the same in-flight promise settles the retry.
      R.configureRecord({ url: 'https://proj.supabase.co/', apiKey: 'anon', authToken: () => 'jwt', slot: 0 });
      const retry = await R.beginRecordLoad();          // dedups onto the in-flight replay
      assert(retry.outcome === 'loaded',
        'the boot read was not replayed when the endpoint arrived — the new-device em dash: ' + JSON.stringify(retry));

      // 3) The balance now resolves KNOWN, and the repaint hook fired for the retry.
      const bg = B.balanceOf(window.G, 'gold');
      assert(bg.known === true && bg.value === 72131,
        'gold did not resolve after the replayed load: ' + JSON.stringify(bg));
      assert(R.recordValue(window.G, 'gold').known === true, 'recordValue still not served after replay');
      assert(painted >= 1, 'the repaint hook did not fire for the replayed load — the top bar would stay em-dash');
    } finally {
      window.fetch = realFetch;
      window.G = realG;
      R.onRecordApplied(null);
      R.resetRecord();
      R.configureRecord(null);
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     B492 — THE SILENT BOOT-HYDRATION FAILURE.

     THE LIVE REPRO, 2026-08-29, QA account 0a47ba77 slot 0, build 491, Chrome
     cold start after a PC restart. A clean boot of hearthrise.net reached
     "ready" and stayed there for 36+ seconds showing the FRESH-G FACTORY
     LITERAL — attack 0, hitpoints 1154 xp, 500 gold — on an account holding
     attack 428 and 7,520 gold (DB-verified). Net pill "Online". No banner, no
     gate, no error. A hand-typed `HearthriseAccrual.requestAccrual('probe')`
     from that same page succeeded INSTANTLY and hydrated everything, which is
     what proved the transport and the token were fine and the BOOT read had
     simply failed and been forgotten. Seen once before, 2026-08-26, after a tab
     freeze; written off then as a frozen-tab artifact.

     FOUR INDEPENDENT DEFECTS, each sufficient on its own, each with a test:

       B492-1  requestRecord awaited a bare fetch with NO AbortController, and
               released its single-flight latch from the CALLER'S FRAME. A
               stalled socket therefore pinned `inFlight` for the life of the
               page and every later caller — including the 4s resume watchdog,
               the only thing that re-fires the boot read today — was handed the
               dead promise. One stalled socket, one dead session.
       B492-2  a failed boot read scheduled NOTHING. One console.warn, and the
               only re-fire was b428's once-only no-endpoint replay.
       B492-3  legacy.js chained the record read off `ensureThenAccrue().then(f)`
               — a ONE-ARGUMENT then, so a rejected (or never-settling, same
               un-timed fetch) ensure silently deleted every hr_load the session
               would ever make.
       B492-4  under the blob-retire capstone `loadLocal()` returns at its first
               statement and never reaches `forgetServerOfRecord(G)`, so the
               FACTORY LITERAL for every armed record field stayed in a live G —
               and that is what the player was shown.

     The fifth thing, which is not a defect but its absence: there was no PICTURE
     for "the character has not arrived", so the picture defaulted. B492-5 covers
     the veil.
     ══════════════════════════════════════════════════════════════════════════ */

  () => tryRunAsync('B492-1: a boot read that never answers is ABORTED and un-latched — one stalled socket cannot wedge the session', async () => {
    const R = window.HearthriseRecord;
    assert(R && typeof R.RECORD_TIMEOUT_MS === 'number' && R.RECORD_TIMEOUT_MS > 0,
      'record.js has no timeout budget — a browser fetch never times out on its own');
    const realFetch = window.fetch;
    const realG = window.G;
    let calls = 0;
    let stalledSignal = null;
    try {
      R.resetRecord();
      window.G = {};
      R.configureRecord({ url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => 'jwt', slot: 0 });
      /* THE FIRST REQUEST NEVER ANSWERS — the cold-start / frozen-tab socket. It
         resolves only when its abort signal fires, which is exactly what a real
         `fetch` does under an AbortController. */
      window.fetch = function (u, init) {
        if (!/hr_load/.test(String(u))) return realFetch.apply(this, arguments);
        calls++;
        if (calls === 1) {
          stalledSignal = init && init.signal;
          assert(stalledSignal, 'the boot read went on the wire with NO abort signal — it can stall forever');
          return new Promise((_res, rej) => {
            stalledSignal.addEventListener('abort', () => rej(new Error('aborted')));
          });
        }
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, version: 41, now: '2026-08-29T10:00:00Z',
          state: { slot: 0, gold: 7520, gems: 0, accrued_to: '2026-08-29T10:00:00Z' },
        }), { status: 200 }));
      };

      const stalled = R.requestRecord();
      // The latch is held while it is genuinely in flight — that part is correct.
      assert(R.getRecordState().pending === true, 'setup: the stalled request is not in flight');
      // …and it is RELEASED the moment the request dies, not when this frame
      // happens to resume. That is the whole of the wedge fix.
      stalledSignal.dispatchEvent(new Event('abort'));
      const v1 = await stalled;
      assert(v1.outcome === 'timeout' || v1.outcome === 'unreachable',
        'an aborted boot read must name itself, got: ' + JSON.stringify(v1));
      assert(R.getRecordState().pending === false,
        'the single-flight latch survived the dead request — every later retry would be handed the corpse');

      // A SECOND caller now issues a REAL request rather than joining the dead one.
      const v2 = await R.requestRecord();
      assert(v2.outcome === 'loaded',
        'the retry after a stalled boot read did not reach the server — the session is still wedged: '
        + JSON.stringify(v2));
      assert(calls === 2, 'expected a second hr_load on the wire, saw ' + calls);
    } finally {
      window.fetch = realFetch;
      window.G = realG;
      R.resetRecord();
      R.configureRecord(null);
    }
  }),

  () => tryRunAsync('B492-2: a failed boot read RETRIES on a ladder until a verdict lands, and never presents defaults as hydrated', async () => {
    const R = window.HearthriseRecord;
    assert(R && typeof R.bootHydrationState === 'function' && typeof R.bootRetryDelayFor === 'function',
      'record.js did not ship the boot-hydration ladder');

    /* (a) THE LADDER IS DATA, and it never gives up. An online-only client that
       stops asking is a client showing a fresh character forever. */
    assert(R.bootRetryDelayFor(0) > 0 && R.bootRetryDelayFor(0) <= 1000,
      'the FIRST retry must be fast — the live probe proved a retry succeeds within seconds: '
      + R.bootRetryDelayFor(0));
    let prev = 0;
    for (let i = 0; i < R.BOOT_RETRY_DELAYS_MS.length; i++) {
      const d = R.bootRetryDelayFor(i);
      assert(d >= prev, 'the ladder is not monotonic at rung ' + i);
      prev = d;
    }
    assert(R.bootRetryDelayFor(9999) === R.BOOT_RETRY_DELAYS_MS[R.BOOT_RETRY_DELAYS_MS.length - 1],
      'the ladder must CLAMP, not terminate — giving up is the bug');

    /* (b) ONLY a real answer settles it. Everything else keeps climbing. */
    assert(R.isBootHydrationSettled('loaded') === true, 'a loaded envelope must settle the ladder');
    assert(R.isBootHydrationSettled('no-character') === true,
      'a definitive "no character" is a legitimate fresh account and must settle');
    ['timeout', 'unreachable', 'not-signed-in', 'unavailable', 'rate-limited',
     'malformed', 'refused', 'not-deployed', 'unconfigured'].forEach((o) => {
      assert(R.isBootHydrationSettled(o) === false,
        'outcome "' + o + '" stops the ladder — that is the silent failure, restored');
    });

    /* (b2) …AND THE ONE FAILURE IT MUST NOT CHASE. `unconfigured/no_endpoint` has
       no request to retry — b428's configureRecord replay owns it, event-driven
       and faster. Laddering it too makes a client that never configures the record
       (a signed-out visitor; the harness) wake every 30s for the life of the page,
       re-entering settle() beside whatever else is running. Measured: that showed
       up as an unrelated click-forwarding test failing in half of full suite runs.
       `no_token` is the opposite — the endpoint exists, auth is refreshing — and
       must keep laddering, because it IS the expired-JWT case. */
    assert(R.isBootRetryWorthwhile('unconfigured', 'no_endpoint') === false,
      'the ladder chases a boot read that has no endpoint — a 30s wake for the life of every '
      + 'signed-out page, and b428 already replays it the instant the endpoint arrives');
    assert(R.isBootRetryWorthwhile('unconfigured', 'no_token') === true,
      'the ladder gave up on a missing TOKEN — that is the expired-JWT cold start this build exists for');
    assert(R.isBootRetryWorthwhile('timeout', null) === true
      && R.isBootRetryWorthwhile('not-signed-in', null) === true,
      'a real failure must still be retried');
    assert(R.isBootRetryWorthwhile('loaded', null) === false
      && R.isBootRetryWorthwhile('no-character', null) === false,
      'a settled verdict must not keep the ladder climbing');

    const realFetch = window.fetch;
    const realG = window.G;
    let calls = 0;
    const phases = [];
    try {
      R.resetRecord();
      window.G = {};
      R.onHydrationChange((s) => phases.push(s.phase + ':' + (s.outcome || '-')));
      R.configureRecord({ url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => 'jwt', slot: 0 });
      window.fetch = function (u) {
        if (!/hr_load/.test(String(u))) return realFetch.apply(this, arguments);
        calls++;
        // The live shape: a 401 while the JWT is being refreshed, then success.
        if (calls === 1) return Promise.resolve(new Response('null', { status: 401 }));
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, version: 77, now: '2026-08-29T10:00:00Z',
          state: { slot: 0, gold: 7520, gems: 3, accrued_to: '2026-08-29T10:00:00Z' },
        }), { status: 200 }));
      };

      const first = await R.beginRecordLoad();
      assert(first.outcome === 'not-signed-in', 'setup: the first read did not 401: ' + JSON.stringify(first));

      /* (c) THE FAILED BOOT IS NOT HYDRATED, and says so. This is the assertion
         that would have caught the live defect: before b492 there was nothing to
         ask, and the client happily rendered on. */
      const s1 = R.bootHydrationState();
      assert(s1.phase === 'pending', 'a failed boot read must stay PENDING, not settle: ' + JSON.stringify(s1));
      assert(R.isCharacterHydrated() === false,
        'the client claimed a hydrated character after a 401 — that is the "looks wiped" render');
      assert(s1.attempts >= 1, 'the failed attempt was not counted: ' + JSON.stringify(s1));
      assert(R.recordValue(window.G, 'gold').known === false,
        'gold must stay UNKNOWN after a failed boot read — never a default');

      /* (d) A RETRY ACTUALLY FIRES, and recovery is complete. Waiting on the real
         timer rather than poking the scheduler: the ladder is only worth
         anything if the timer it arms is real. */
      const t0 = Date.now();
      while (calls < 2 && Date.now() - t0 < 6000) await new Promise((r) => setTimeout(r, 40));
      assert(calls >= 2,
        'NOTHING RETRIED the failed boot read — this is the live P1 exactly: a 401 during a token '
        + 'refresh left the character un-loaded for the whole session');
      const t1 = Date.now();
      while (!R.isCharacterHydrated() && Date.now() - t1 < 4000) await new Promise((r) => setTimeout(r, 40));
      assert(R.isCharacterHydrated() === true,
        'the retry did not hydrate: ' + JSON.stringify(R.bootHydrationState()));
      assert(R.recordValue(window.G, 'gold').known === true && window.G.gold === 7520,
        'the recovered load did not stamp the real balance: ' + JSON.stringify(R.recordValue(window.G, 'gold')));
      assert(phases.some((p) => p.indexOf('hydrated') === 0),
        'the hydration hook never reported success — the veil would never lift: ' + phases.join(', '));
    } finally {
      window.fetch = realFetch;
      window.G = realG;
      R.onHydrationChange(null);
      R.resetRecord();
      R.configureRecord(null);
    }
  }),

  () => tryRun('B492-3: nothing client-authored survives the capstone boot — no default may wear the character\'s name', () => {
    /* THE FIELD THE LIVE BUG SHOWED THE PLAYER. `loadLocal()`'s capstone early
       return skipped `forgetServerOfRecord(G)`, so `G.skills` stayed at the
       fresh-G literal (attack 0 … hitpoints 1154) and `G.gold` at 500 — and the
       display ladder, which is entitled to show a PRESENT local value as an
       optimistic client write, showed them as the player's character.

       This asserts the property at the seam rather than the symptom: after the
       capstone load path, under the switch, G holds no client-authored copy of
       anything on the active registry. MUTATION: delete the forgetServerOfRecord
       call from loadLocal's capstone branch → red. */
    const R = window.HearthriseRecord, A = window.HearthriseAccrual, C = window.HearthriseCapstone;
    assert(R && A && C, 'record/accrue/capstone did not load');
    const G = window.G;
    const wasA = A.isServerAccrualEnabled();
    const saved = {};
    const fields = R.serverOfRecordFields();
    assert(fields.length > 0, 'no field is on the active registry — this guard would be vacuous');
    for (const f of fields) saved[f] = Object.prototype.hasOwnProperty.call(G, f) ? G[f] : undefined;
    const savedRec = G._record;
    try {
      if (!wasA) A.setServerAccrualEnabled(true);
      assert(C.isBlobRetired() === true,
        'the capstone is not armed — the branch under test is unreachable and this guard is vacuous');

      /* Put the FACTORY LITERAL back exactly as a fresh page would have it, then
         run the real boot load path. */
      G.gold = 500;
      G.skills = { attack: 0, strength: 0, defense: 0, hitpoints: 1154 };
      G.equipment = { weapon: 'bronze_sword' };
      G.rooms = {};
      delete G._record;
      /* legacy.js's loadLocal is file-scoped, so drive the SEAM it now calls —
         the same function, with the same argument, from the same switch state.
         B492-3b below asserts the CALL SITE exists, which is the half a seam
         test cannot see (the B339 lesson: prove the caller, not only the callee). */
      R.forgetServerOfRecord(G);

      for (const f of fields) {
        assert(Object.prototype.hasOwnProperty.call(G, f) === false,
          'the factory default for "' + f + '" survived into a live G under an armed record — '
          + 'that is the value the player was shown as their character');
      }
      assert(R.recordValue(G, 'gold').known === false,
        'gold reported KNOWN with no envelope — a default wearing the server\'s name');
      const S = window.HearthriseSkillRecord;
      if (S) {
        assert(S.skillXpForDisplay(G, 'attack').known === false,
          'the DISPLAY ladder resurrected a skill the server has never stated — the "looks wiped" render');
      }
    } finally {
      if (!wasA) A.setServerAccrualEnabled(false);
      for (const f of fields) {
        if (typeof saved[f] === 'undefined') { try { delete G[f]; } catch (e) {} } else G[f] = saved[f];
      }
      G._record = savedRec;
    }
  }),

  () => tryRunAsync('B492-3b: the capstone boot branch actually CALLS the forget, and the record read is not hostage to the ensure', async () => {
    /* THE CALL SITE, NOT THE CALLEE — the B339 lesson, verbatim: a test drove
       accrue.js's slot resolver, proved it correct, and auth.js went on pinning
       `slot: 0`. Both properties below live inside `loadLocal()` / the b337 gate
       in a CLASSIC script with no exports, so the only honest way to assert them
       is against the shipped bytes. Fetched from the same origin the engine
       loaded from, the way B-accrue and the observability guard already do. */
    const src = await (await fetch('src/legacy.js?v=548')).text();
    assert(src.length > 100000, 'legacy.js did not come back — this guard would be vacuous');

    /* (1) THE FORGET. `loadLocal()`'s capstone early return skipped it, so the
       fresh-G factory literal (attack 0 … hitpoints 1154, gold 500) stayed in a
       live G under an armed record — and that is what the player was shown on
       2026-08-29 when the boot read failed.

       THE ANCHOR MOVED WITH THE BRANCH IT ANCHORED ON. This used to find
       `isBlobRetired()` inside loadLocal and assert the forget sat BEFORE the
       early `return;`. There is no branch and no early return: the cutover
       deleted the ~120-line blob read that followed it, so loadLocal's whole
       body is the two lines the forget used to guard. That makes the ordering
       unsatisfiable-by-construction (there is no `return;` to be before), and an
       assertion that cannot fail is the family this program keeps meeting.

       So the anchor is the FUNCTION, and the property is stated as what must be
       true of the whole body: it forgets, and it does NOT read a blob back into
       G. The second half is what stops the deleted read quietly returning.
       MUTATION: put `Object.assign(G, JSON.parse(_readSave(SAVE_KEY)))` back
       into loadLocal → red on the second assertion. */
    const fn = src.indexOf('function loadLocal(');
    assert(fn !== -1, 'loadLocal is gone from legacy.js');
    const close = src.indexOf('\n}', fn);
    assert(close !== -1 && close - fn < 4000, 'loadLocal has no readable body');
    const branch = src.slice(fn, close);
    assert(/forgetServerOfRecord\(G\)/.test(branch),
      'loadLocal does NOT forget the server-of-record fields — the fresh-G factory literal survives into '
      + 'a live G and IS what the player is shown when the boot read fails');
    assert(/_removeSave\(SAVE_KEY\)/.test(branch),
      'loadLocal no longer DROPS the leftover blob — a save from before the wipe would survive on disk '
      + 'and any future read would resurrect it');
    assert(!/Object\.assign\(G\s*,/.test(branch),
      'loadLocal is assigning a parsed blob into G again — the client-authored rival copy is back, and '
      + 'it is the stale-state loop the live cutover failed on');

    /* (2) THE CHAIN. `p.then(fn)` is a ONE-ARGUMENT then: it runs on fulfilment
       only. A rejected ensure — or one whose promise never settled, which is
       what an un-timed fetch behind a single-flight latch produces — silently
       deleted every hr_load the session was ever going to make. */
    const ens = src.indexOf('ensureThenAccrue()');
    assert(ens !== -1, 'the boot ensure call site is gone');
    const after = src.slice(ens, ens + 1600);
    assert(!/p\.then\(function\(\)\s*\{\s*R\.beginRecordLoad\(\);\s*\}\)/.test(after),
      'the record read is chained off a single-argument .then again — a failed ensure deletes every '
      + 'hr_load this session would have made');
    assert(/p\.then\(_load,\s*_load\)/.test(after),
      'the boot read must fire whether the ensure resolved OR rejected');
  }),

  () => tryRun('B492-4: the boot veil shows "Connecting your character" instead of a fresh account, and never lies', () => {
    const V = window.HearthriseBootVeil;
    assert(V && typeof V.shouldVeil === 'function', 'src/features/boot-hydration.js did not load');

    /* THE RULE, driven as data. The live state — capstone armed, session live,
       nothing hydrated — is the one that must veil. */
    assert(V.shouldVeil({ blobRetired: true, signedIn: true, hydrated: false }) === true,
      'the live failure state does not veil — the player is shown a fresh account');
    assert(V.shouldVeil({ blobRetired: true, signedIn: true, hydrated: true }) === false,
      'the veil outlives hydration — the player would be locked out of their own game');
    assert(V.shouldVeil({ blobRetired: true, signedIn: false, hydrated: false }) === false,
      'a signed-out visitor is the account gate\'s screen, not this one');
    assert(V.shouldVeil({ blobRetired: false, signedIn: true, hydrated: false }) === false,
      'with the capstone dormant the save blob has already loaded a real character — veiling it is a regression');
    assert(V.shouldVeil({ blobRetired: true, signedIn: true, hydrated: false, harness: true }) === false,
      'the smoke harness has no server and no session; veiling it would blanket the whole suite');

    /* THE COPY. It must never claim a failure is a loss, and it must get LOUDER
       rather than giving up — an online-only client that stops asking is a
       client showing a fresh character forever. */
    const early = V.veilCopy({ attempts: 0, outcome: null });
    assert(/connecting/i.test(early.title), 'the first frame must say it is connecting: ' + early.title);
    assert(early.loud === false, 'the first frame must not be an error');
    const late = V.veilCopy({ attempts: V.LOUD_AFTER_ATTEMPTS + 1, outcome: 'timeout' });
    assert(late.loud === true, 'a persistent failure must escalate into an explanation');
    assert(/retry/i.test(late.body), 'the loud copy must state that it is still retrying: ' + late.body);
    [early, late].forEach((c) => {
      assert(!/wipe|lost|reset|deleted|new character/i.test(c.title + ' ' + c.body),
        'the veil must never suggest anything was lost: ' + c.title + ' / ' + c.body);
    });

    /* AND IT ACTUALLY RENDERS, with the sentence that does the work. */
    const doc = document;
    const before = doc.getElementById(V.VEIL_ID);
    assert(!before, 'the veil is up during a normal harness boot — it must be inert without a session');
    let el = null;
    try {
      el = V.syncVeil(window);
      assert(el === null, 'the harness veiled itself — every visual guard would be blanketed');
    } finally {
      try { V.uninstallBootHydrationVeil(window); } catch (e) {}
    }
  }),

  () => tryRunAsync('B340-6: the boot read puts the CONTRACT hr_load request on the wire, and a failure leaves the field UNKNOWN', async () => {
    const R = window.HearthriseRecord;
    const realFetch = window.fetch;
    const seen = [];
    const g = {};
    try {
      window.fetch = function (u, init) {
        if (!/hr_load/.test(String(u))) return realFetch.apply(this, arguments);
        seen.push({ url: String(u), init });
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, version: 2, now: '2026-08-14T10:00:00Z',
          state: { slot: 3, accrued_to: '2026-08-14T09:00:00Z' },
        }), { status: 200 }));
      };
      R.resetRecord();
      R.configureRecord({ url: 'https://proj.supabase.co/', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 3 });
      const v = await R.requestRecord();
      assert(v.outcome === 'loaded', 'the boot read did not load: ' + JSON.stringify(v));
      assert(seen.length === 1, 'expected exactly one hr_load request, saw ' + seen.length);
      assert(seen[0].url === 'https://proj.supabase.co/rest/v1/rpc/hr_load',
        'wrong endpoint: ' + seen[0].url);
      assert(seen[0].init.method === 'POST', 'hr_load must be POSTed (PostgREST RPC)');
      assert(seen[0].init.headers['Authorization'] === 'Bearer jwt-token'
        && seen[0].init.headers['apikey'] === 'anon-key',
        'the request is missing its credentials: ' + JSON.stringify(seen[0].init.headers));
      assert(seen[0].init.body === '{"p_slot":3}',
        'the body is not the one-integer contract (a spread body is a body a future field rides into): '
        + seen[0].init.body);

      /* EVERY FAILURE LEAVES THE FIELD UNKNOWN. Same property b337's failure
         battery holds for grants: no silent fallback to a client value, ever.
         MUTATION: make classifyLoadResponse default to `loaded` → RED here. */
      const failures = [
        [200, { ok: false, error: 'no_character' }, 'no-character'],
        [200, { ok: false, error: 'rate_limited' }, 'rate-limited'],
        [200, { ok: false, error: 'not_signed_in' }, 'not-signed-in'],
        [200, { ok: false, error: 'brand_new_code' }, 'refused'],
        /* A PRE-apply-engine hr_load: an envelope carrying NO decodable record
           field (gold/gems/accrued_to are now all record fields, so the state
           holds only a non-record key). This is the branch that keeps b340
           independent of whether 2026-08-11-apply-engine.sql has been applied. */
        [200, { ok: true, version: 2, state: { slot: 3 } }, 'malformed'], [200, null, 'malformed'],
        [401, null, 'not-signed-in'], [404, null, 'not-deployed'], [503, null, 'unavailable'],
      ];
      for (const [status, body, want] of failures) {
        const c = R.classifyLoadResponse(status, body);
        assert(c.outcome === want,
          'status ' + status + ' ' + JSON.stringify(body) + ' classified as ' + c.outcome + ', expected ' + want);
        const before = JSON.stringify(g);
        assert(R.applyRecord(g, body).written.length === 0,
          'a ' + want + ' answer wrote a record');
        assert(JSON.stringify(g) === before, 'a ' + want + ' answer changed state: ' + JSON.stringify(g));
        assert(R.recordValue(g, 'offlineBudget').known === false,
          'after a ' + want + ' the field is reported known — this device would be guessing');
      }
    } finally {
      window.fetch = realFetch;
      R.resetRecord();
      R.configureRecord(null);
    }
  }),

  /* ═══════════════════════════════════════════════════════════════════════
     INV-HYDRATE-1 (b46x) — AN IDLE BOOT HYDRATES THE BAG FROM THE hr_load BODY.

     THE LIVE P1, root-caused by QA: on an IDLE reload the bag showed a stale
     ~3-stack remnant while the server held the full inventory — near-total
     apparent loss to any player whose activity had ended (out of ore/food)
     before they reloaded. Root cause: inventory hydration lived ONLY in
     accrue.js's applyEnvelopeState, reached ONLY on `accrued:true`. On an idle
     boot hr-accrue answers {accrued:false, reason:'idle'} so applyEnvelopeState
     never runs — and record.js's settle() rebuilt companions/farm/traits/activity
     from the always-full hr_load body but NOT inventory/bank. The fix routes the
     boot hr_load body through the SAME shared reconcileInventory the accrue path
     uses.

     This drives the REAL record-load path (requestRecord → settle → applyRecord
     + reconcileInventory) with a stubbed fetch, exactly as B340-6 does, so it
     proves the wiring and not just the extracted function.

     MUTATION: delete the `reconcileInventory(G, verdict.body)` line in
     record.js settle() → the bag stays {coal:3} → RED. ─────────────────────── */
  () => tryRunAsync('INV-HYDRATE-1 (b46x): an IDLE boot hydrates the full bag from the hr_load body (inventory-loss-on-reload P1)', async () => {
    const R = window.HearthriseRecord;
    const realFetch = window.fetch;
    const savedG = window.G;
    /* The idle character: the client booted with a stale remnant, the server
       holds the full inventory. NO `away` block on an hr_load body, so no debit
       ever fires on this path — it can only ratchet the full bag in. */
    const FULL = { coal: 100, iron_ore: 50, dragon_scale: 14, shrimp: 30 };
    try {
      window.fetch = function (u) {
        if (!/hr_load/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, version: 3, now: '2026-08-24T10:00:00Z',
          state: { slot: 0, accrued_to: '2026-08-24T09:00:00Z' },
          skills: {}, inventory: FULL,
        }), { status: 200 }));
      };
      window.G = { inventory: { coal: 3 }, offlineBudget: {} };
      R.resetRecord();
      R.configureRecord({ url: 'https://proj.supabase.co/', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      const v = await R.requestRecord();
      assert(v.outcome === 'loaded', 'the idle boot read did not load: ' + JSON.stringify(v));
      const inv = window.G.inventory || {};
      assert(inv.coal === 100, 'the stale remnant did not ratchet up to the server figure (coal): ' + inv.coal
        + ' — the bag was never hydrated on the idle boot (the reported P1)');
      assert(inv.iron_ore === 50 && inv.dragon_scale === 14 && inv.shrimp === 30,
        'the server-held stacks the client never had were not hydrated: ' + JSON.stringify(inv));
    } finally {
      window.fetch = realFetch;
      R.resetRecord();
      R.configureRecord(null);
      window.G = savedG;
    }
  }),

  /* INV-HYDRATE-2 (b46x) — a NON-IDLE boot must not DOUBLE-COUNT. applyEnvelopeState
     (the hr-accrue envelope) AND settle() (the hr_load body) both reconcile the bag
     now; the merge ratchet (Math.max) must leave the server figure, never a sum. */
  () => tryRunAsync('INV-HYDRATE-2 (b46x): the away/active path is not double-applied — merge ratchet stays at the server figure', async () => {
    const A = window.HearthriseAccrual;
    const R = window.HearthriseRecord;
    const realFetch = window.fetch;
    const savedG = window.G;
    const FULL = { coal: 100, iron_ore: 50 };
    try {
      window.fetch = function (u) {
        if (!/hr_load/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, version: 4, now: '2026-08-24T11:00:00Z',
          state: { slot: 0, accrued_to: '2026-08-24T10:30:00Z' },
          skills: {}, inventory: FULL,
        }), { status: 200 }));
      };
      const G = { inventory: { coal: 5 }, offlineBudget: {} };
      window.G = G;
      /* FIRST the hr-accrue envelope (the non-idle path), THEN the boot hr_load
         body — the exact order a non-idle boot produces. */
      A.applyEnvelopeState(G, { state: {}, skills: {}, inventory: FULL });
      R.resetRecord();
      R.configureRecord({ url: 'https://proj.supabase.co/', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      await R.requestRecord();
      const inv = window.G.inventory || {};
      assert(inv.coal === 100 && inv.iron_ore === 50,
        'the bag was double-applied — the ratchet summed instead of taking the max: ' + JSON.stringify(inv));
    } finally {
      window.fetch = realFetch;
      R.resetRecord();
      R.configureRecord(null);
      window.G = savedG;
    }
  }),

  /* ════════════════════════════════════════════════════════════════════════
     PHANTOM-FOOD-1 (b511) — A PROVISION THE SERVER ATE MUST READ ZERO ON THE
     CLIENT AFTER THE BOOT RECONCILE.

     THE LIVE P0, measured on the QA slot 2026-09-06 (b510): `player_inventory`
     held NO food at all — the 12:15 away settle receipt said `ate 23
     cooked_shrimp` and the 13:49 settle ate 0 because none was left. After a
     FRESH RELOAD the client still showed `cooked_shrimp: 20`. The knocked-out
     sheet then told the player they "were carrying 20 x Cooked Shrimp and never
     ate one" (false) and offered a Rest that `hr_rest` refused with
     `insufficient_food`.

     ROOT CAUSE: a cooked dish is EXCLUDED from server ownership (so an
     incomplete baseline can never delete a live-cooked meal), and exclusion is
     a NEVER-LOWER rule — so once the server row hit zero the key vanished from
     the envelope and the stale client 20 was never contradicted again, by any
     envelope, forever. The fix reads a SERVER-CONSUMED id (`heals > 0`)
     absolutely whenever the server certifies the baseline COMPLETE.

     Drives the REAL boot path (requestRecord -> settle -> reconcileInventory)
     with a stubbed fetch, exactly as INV-HYDRATE-1 does.

     MUTATION: drop the `consumableAbsolute` clauses in reconcileInventory
     (src/net/accrue.js) -> cooked_shrimp stays 20 -> RED. ───────────────── */
  () => tryRunAsync('PHANTOM-FOOD-1 (b511): a provision the server has eaten to zero reads 0 after the boot reconcile (phantom-food P0)', async () => {
    const R = window.HearthriseRecord;
    const IA = window.HearthriseItemAuthority;
    const realFetch = window.fetch;
    const savedG = window.G;
    assert(IA && typeof IA.serverConsumedItem === 'function', 'item-authority does not publish serverConsumedItem');
    assert(IA.serverConsumedItem('cooked_shrimp') === true,
      'cooked_shrimp is not classified as a SERVER-CONSUMED provision — the rule cannot fire');
    assert(IA.serverConsumedItem('copper_ore') === false,
      'a non-food id is classified as server-consumed — the rule is too wide');
    try {
      /* The server bag AFTER the night: every provision eaten, so neither food
         key appears at all. `inventory_complete: true` is the server's own
         assertion that no settle window is open. */
      const SERVER_BAG = { coal: 12, copper_ore: 4 };
      window.fetch = function (u) {
        if (!/hr_load/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, version: 9, now: '2026-09-06T14:00:00Z',
          state: { slot: 0, accrued_to: '2026-09-06T13:59:00Z' },
          skills: {}, inventory: SERVER_BAG, inventory_complete: true,
        }), { status: 200 }));
      };
      window.G = { inventory: { cooked_shrimp: 20, shrimp: 10, coal: 1 }, offlineBudget: {} };
      R.resetRecord();
      R.configureRecord({ url: 'https://proj.supabase.co/', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      const v = await R.requestRecord();
      assert(v.outcome === 'loaded', 'the boot read did not load: ' + JSON.stringify(v));
      const inv = window.G.inventory || {};
      assert(!inv.cooked_shrimp,
        'the phantom food survived the boot reconcile: cooked_shrimp = ' + inv.cooked_shrimp
        + ' — the client still believes in food the server ate (the reported P0)');
      /* AND THE NEVER-DELETE RULE IS INTACT FOR EVERYTHING ELSE. The ordinary
         merge ratchet must still hydrate a non-provision id. */
      assert(inv.coal === 12, 'the ordinary merge ratchet stopped working: coal = ' + inv.coal);
      /* AN INCOMPLETE BASELINE MUST CHANGE NOTHING — fail-closed. */
      const G2 = { inventory: { cooked_shrimp: 20 } };
      window.HearthriseAccrual.reconcileInventory(G2, { inventory: { coal: 1 } });
      assert(G2.inventory.cooked_shrimp === 20,
        'an envelope with NO inventory_complete flag deleted a provision — the rule is not fail-closed');
    } finally {
      window.fetch = realFetch;
      R.resetRecord();
      R.configureRecord(null);
      window.G = savedG;
    }
  }),

  /* ════════════════════════════════════════════════════════════════════════
     REST-REFUSAL-1 (b511) — hr_rest REFUSALS ARE SURFACED, AND THE SHEET STAYS
     OPEN.

     THE LIVE P0 (same session): pressing "Rest at the Hearth" returned 200 with
     `{ok:false, error:'insufficient_food'}`; the handler had ALREADY called
     close() and navigated away, so the player saw NOTHING and stayed knocked
     out with no idea why. A refusal the player cannot see is indistinguishable
     from a dead button.

     MUTATION: restore the unconditional `close()` at the top of act(), or drop
     the `note(...)` in the refusal branch -> RED. ───────────────────────── */
  () => tryRunAsync('REST-REFUSAL-1 (b511): an insufficient_food refusal keeps the death sheet OPEN and says why; ok:true closes it', async () => {
    const D = window.HearthriseDeathSheet;
    const savedGC = window.HearthriseGoalClaim;
    assert(D && typeof D._render === 'function' && typeof D._act === 'function',
      'the death sheet does not publish its render/act seams');
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const sheet = () => document.getElementById('hr-death-scrim');
    const openNow = () => { const el = sheet(); return !!(el && el.classList.contains('show')); };
    const noteText = () => { const el = sheet(); const n = el && el.querySelector('[data-note]'); return n ? n.textContent : ''; };
    const restBtn = () => { const el = sheet(); return el && el.querySelector('[data-act="rest"]'); };
    /* Knocked out, hurt, and CARRYING food — so the button is offered. */
    const moment = { monsterName: 'Grey Wolf', maxHp: 30, resumeHp: 12, deathsToday: 2,
      recoveryMs: 120000, recoveringUntilMs: Date.now() + 180000, nowMs: Date.now(),
      missingHp: 7, foodQty: 4, foodName: 'Cooked Shrimp', ateThisFight: 0 };
    try {
      const model = D.describeDeath(moment);
      const rest = model.actions.filter((a) => a.k === 'rest')[0];
      assert(rest && !rest.disabled, 'the Rest action was not offered to a hurt, foodful, knocked-out player');

      // (1) REFUSED
      window.HearthriseGoalClaim = { rest: () => Promise.resolve({ ok: false, error: 'insufficient_food', need_hp: 7, covered_hp: 0 }) };
      D._render(model, moment);
      assert(openNow(), 'the sheet did not open');
      D._act('rest', moment, restBtn());
      await flush(); await flush();
      assert(openNow(), 'the sheet CLOSED on a refusal — the player is knocked out and was told nothing (the reported P0)');
      assert(/no cooked food left/i.test(noteText()),
        'the insufficient_food refusal was not surfaced; the note read: "' + noteText() + '"');
      assert(/nothing was eaten/i.test(noteText()),
        'the refusal never states that no food was spent: "' + noteText() + '"');
      const b = restBtn();
      assert(b && !b.disabled, 'the Rest button was left disabled after a refusal the player can retry');

      // (2) ACCEPTED
      let cleared = false;
      const AC = window.HearthriseAccrual;
      const savedClear = AC.clearFall;
      AC.clearFall = function () { cleared = true; return savedClear.apply(this, arguments); };
      window.HearthriseGoalClaim = { rest: () => Promise.resolve({ ok: true, rested: { healed_hp: 7, units: 1 } }) };
      try {
        D._render(model, moment);
        D._act('rest', moment, restBtn());
        await flush(); await flush();
        assert(!openNow(), 'a successful Rest did not close the sheet');
        assert(cleared, 'a successful Rest did not retire the unanswered fall (clearFall) — the watch can re-open the sheet');
      } finally { AC.clearFall = savedClear; }

      // (3) NO FOOD AT ALL: the button cannot lie
      const dryMoment = Object.assign({}, moment, { foodQty: 0 });
      const dry = D.describeDeath(dryMoment);
      const dryRest = dry.actions.filter((a) => a.k === 'rest')[0];
      assert(dryRest && dryRest.disabled && /no food/i.test(dryRest.label),
        'an empty bag still offered a Rest the server will refuse: ' + JSON.stringify(dryRest));
      D._render(dry, dryMoment);
      assert(/no cooked food left/i.test(noteText()),
        'a foodless sheet does not explain why Rest is closed: "' + noteText() + '"');
    } finally {
      window.HearthriseGoalClaim = savedGC;
      D.__resetForTest();
    }
  }),

  /* HERO-SLOT-HYDRATE-1 (SA-016) — THE THIRD INSTANCE OF THE IDLE-BOOT CLASS,
     after INV-HYDRATE-1 (b467 inventory) and the crew (b477). reconcileHeroSlots
     lands the account's owned set in the `_heroSlots` scratch that
     multi-character.js reads for `serverKnown`; before this fix it was called ONLY
     from accrue.js applyEnvelopeState (accrued:true). On an idle or backgrounded
     tab hr-accrue answers {accrued:false} AND the accrue cadence is
     visibility-gated, so applyEnvelopeState may NEVER run — leaving `_heroSlots`
     absent and the Hero-slot Buy stuck on "Checking…" for the whole session (QA
     slot 4, live 2026-09-04). The boot hr_load body carries the same top-level
     `hero_slots` projection hr_state_of builds, so the owned set must resolve on
     the FIRST load with NO accrue envelope. This test drives the REAL load path
     (requestRecord → settle) and asserts exactly that.
     FAILS WITHOUT THE FIX: with the load-path reconcile un-wired, `_heroSlots`
     stays undefined and the first assert throws. */
  () => tryRunAsync('HERO-SLOT-HYDRATE-1 (SA-016): an IDLE boot hydrates the owned hero slots from the hr_load body, resolving "Checking…" WITHOUT an accrue', async () => {
    const R = window.HearthriseRecord;
    const realFetch = window.fetch;
    const savedG = window.G;
    /* Owns the free slot 0 plus two paid slots — the flat top-level array
       hr_state_of projects (2026-09-08 migration GATE(g)/GATE(h)). */
    const OWNED = [0, 1, 2];
    try {
      window.fetch = function (u) {
        if (!/hr_load/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, version: 5, now: '2026-09-04T10:00:00Z',
          state: { slot: 0, accrued_to: '2026-09-04T09:00:00Z' },
          skills: {}, hero_slots: OWNED,
        }), { status: 200 }));
      };
      /* A fresh boot: NO `_heroSlots` scratch, so serverKnown is decided purely
         by what the load path hydrates — the exact idle-boot state. */
      window.G = { offlineBudget: {} };
      R.resetRecord();
      R.configureRecord({ url: 'https://proj.supabase.co/', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      const v = await R.requestRecord();
      assert(v.outcome === 'loaded', 'the idle boot read did not load: ' + JSON.stringify(v));

      /* THE CORE PROOF (fails without the fix): the load path populated the
         scratch reconcileHeroSlots owns, with the server's owned set — no accrue
         envelope was ever applied. */
      const hs = window.G._heroSlots;
      assert(hs && Array.isArray(hs.owned),
        'the hr_load body carried hero_slots but the load path never hydrated G._heroSlots — the Buy '
        + 'stays on "Checking…" for the whole idle session (SA-016): ' + JSON.stringify(hs));
      assert(hs.owned.indexOf(0) !== -1 && hs.owned.indexOf(1) !== -1 && hs.owned.indexOf(2) !== -1,
        'the hydrated owned set is missing a projected slot: ' + JSON.stringify(hs.owned));

      /* THE PLAYER-FACING PROOF: with the owned set now known, the Hero-slot Buy
         resolves — a locked, buyable rung reads serverKnown:true (not the
         "Checking…"/Unavailable disabled state). Only run when multi-character is
         loaded; the core assertion above already guards the fix unconditionally. */
      const HP = window.HearthriseProfile;
      if (HP && typeof HP.slotRows === 'function') {
        const rows = HP.slotRows();
        assert(rows.some((r) => r.kind === 'locked' && !r.free && r.serverKnown === true),
          'no locked hero-slot row reads serverKnown:true after the owned set was hydrated — the Buy is '
          + 'still stuck on "Checking…" (SA-016): ' + JSON.stringify(rows.map((r) => ({ serverKnown: r.serverKnown, kind: r.kind }))));
      }
    } finally {
      window.fetch = realFetch;
      R.resetRecord();
      R.configureRecord(null);
      window.G = savedG;
    }
  }),

  () => tryRun('B340-7: the moved field is still UPLOADED — a record move is not a NO_SYNC addition', () => {
    const A = window.HearthriseAccrual;
    const R = window.HearthriseRecord;
    const G = window.G;
    assert(R && A, 'record.js and accrue.js must load together — the load-strip reads the switch from one '
      + 'and the field list from the other, so a missing record.js must be impossible, not merely unlikely');
    const save = { offlineBudget: G.offlineBudget };
    try {
      /* b515: this test opened by turning the b353 kill switch OFF and asserting
         `isRecordActive() === false` — "two switches means which half is on
         becomes a question during an incident". There is ONE switch's worth of
         state left and it is a constant, so that assertion has become
         `false === false` by construction and is retired with the switch; the
         inverted B353-1 asserts the constant itself. The half worth keeping is
         the one in the title, and it is asserted at the SHIPPING default, which
         is where it matters. */
      assert(R.isRecordActive() === true,
        'the record system is inert — every assertion about a MOVED field below would be vacuous');

      /* THE DENYLIST IS UNCHANGED. CLAUDE.md save-invariant #3: adding a
         persistent-progress field to NO_SYNC is silent cloud data loss and is
         forbidden. b340 stops the blob being READ for a moved field; it does not
         stop it being WRITTEN, so b302/b305/b314 all keep the blob they key off.
         MUTATION: add 'offlineBudget' to NO_SYNC in src/net/events.js → RED. */
      G.offlineBudget = { at: 1234567890 };
      const snap = window.HearthriseEvents && typeof window.HearthriseEvents.snapshot === 'function'
        ? window.HearthriseEvents.snapshot(G) : null;
      if (snap) {
        assert(snap.offlineBudget && snap.offlineBudget.at === 1234567890,
          'the moved field stopped being uploaded — that is a NO_SYNC addition by another name, and it '
          + 'makes the blob\'s shape depend on a kill switch: ' + JSON.stringify(snap.offlineBudget));
      }
    } finally {
      G.offlineBudget = save.offlineBudget;
    }
  }),

  () => tryRunAsync('B340-8: processOffline() actually ASKS for the record — the caller, again', async () => {
    /* Written because the mutation run had no way to see this call site at all:
       every other b340 test drove record.js or auth.js, and legacy.js's b337
       gate could have stopped calling beginRecordLoad() entirely with the suite
       staying green. That is the b339 shape exactly — a correct callee and a
       caller nobody looked at. MUTATION: delete the `p.then(… beginRecordLoad
       …)` line in legacy.js's gate → RED. */
    const A = window.HearthriseAccrual;
    const C = window.HearthriseCharacter;
    const R = window.HearthriseRecord;
    const G = window.G;
    const save = { offlineBudget: G.offlineBudget, restedAt: G.restedAt, lastSeen: G.lastSeen,
      activeSkill: G.activeSkill, activeMonster: G.activeMonster };
    const savedRecord = G._record;
    const hiddenDesc = Object.getOwnPropertyDescriptor(document, 'hidden');
    const realFetch = window.fetch;
    const hits = { load: 0, accrue: 0, create: 0 };
    try {
      /* ⚠ THE FIXTURE MUST START UNKNOWN, AND IT DID NOT (found b515). The final
         assertion is that a `no_character` load leaves the record UNKNOWN —
         which is only meaningful if it was unknown to begin with. `R.resetRecord()`
         clears the MODULE's config; the provenance stamp lives on `G._record`,
         on the live G every test shares, and any earlier test that called
         `stampRecordLikeLoad`/`stampBalanceLikeLoad` leaves `offlineBudget` on
         its `known` list. This test passed alone and failed in the suite for
         exactly that reason. Forgotten here, restored in the finally. */
      R.forgetServerOfRecord(G);
      window.fetch = function (u) {
        const s = String(u);
        if (/hr_load/.test(s)) { hits.load++; return Promise.resolve(new Response('{"ok":false,"error":"no_character"}', { status: 200 })); }
        if (/hr-accrue/.test(s)) { hits.accrue++; return Promise.resolve(new Response('{"ok":true,"accrued":false,"reason":"none"}', { status: 200 })); }
        if (/hr_create_character/.test(s)) { hits.create++; return Promise.resolve(new Response('{"ok":true,"slot":0,"created":false}', { status: 200 })); }
        return realFetch.apply(this, arguments);
      };
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      const wiring = { url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => 'jwt' };
      A.resetAccrualGate(); A.configureAccrual(wiring);
      C.resetCharacterIntent(); C.configureCharacter({ ...wiring, userId: () => 'user-B340' });
      R.resetRecord(); R.configureRecord(wiring);
      A.setServerAccrualEnabled(true);
      G.activeSkill = 'woodcutting'; G.activeMonster = null;
      window.processOffline();
      for (let i = 0; i < 40; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 40; i++) await Promise.resolve();

      assert(hits.load === 1,
        'the b337 gate did not ask hr_load for the record (' + hits.load + ' requests) — the field the strip '
        + 'deleted from the blob would stay UNKNOWN forever, which is safe but is not a working game');
      assert(hits.accrue === 1,
        'adding the record read cost the accrual request (' + hits.accrue + ') — b337 must be unchanged');
      /* A `no_character` load supplies nothing, and nothing is what it must
         leave behind: no field, no provenance, no guess. */
      assert(R.recordValue(G, 'offlineBudget').known === false,
        'a no_character load left the record reported KNOWN');
    } finally {
      window.fetch = realFetch;
      if (hiddenDesc) Object.defineProperty(document, 'hidden', hiddenDesc); else { try { delete document.hidden; } catch (e) {} }
      A.setServerAccrualEnabled(false);
      try { A.__clearAccrualOverride(); localStorage.removeItem('hr:serverAccrual'); } catch (e) {}
      A.resetAccrualGate(); A.configureAccrual(null);
      C.resetCharacterIntent(); C.configureCharacter(null);
      R.resetRecord(); R.configureRecord(null);
      Object.assign(G, save);
      if (savedRecord === undefined) { try { delete G._record; } catch (e) {} } else G._record = savedRecord;
      try { stampRecordLikeLoad(G); } catch (e) {}
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b347 — THE RECORD FOLLOWS THE WRITER (Part 2 of the record seam).

     b340 moved ONE field — `offlineBudget` — and stated the rule in as many
     words: "a field on the SERVER_OF_RECORD registry is DELETED from every save
     blob on the way IN, and is only ever written by applyRecord() from a server
     envelope. There is no third writer and no fallback." That was true of
     record.js and false of the game. TWO client sites went on writing it:

       legacy.js saveLocal()      advanced it to `lastSeen` on every autosave
       auth.js   the cloud overlay re-stamped it to `cloudAt` THREE LINES after
                 stripping it out of that same snapshot

     Measured with a control: the server said 06:00Z, a client write moved it to
     09:30Z, and `recordValue` — the accessor built to catch exactly this — went
     on answering `source:'server'`.

     WHY THIS IS URGENT OUT OF PROPORTION TO ITS SIZE: this field is the
     TEMPLATE. Gold (~40 writers), inventory, skill xp and hearth tokens are
     queued behind it in record.js's ordering table, and a broken template gets
     copied four times.

     THE TESTS MUTATE THE CALLERS. That is b339's post-mortem verbatim — a test
     configured the module under test, proved it correct, and the caller went on
     doing the wrong thing. B347-R1 drives the real `window.saveLocal()` and
     B347-R2 drives auth.js's own overlay function; neither is satisfied by
     record.js being right. */

  () => tryRun('B347-R1: saveLocal() stops advancing a watermark the SERVER owns — the caller, not the callee', () => {
    const A = window.HearthriseAccrual;
    const R = window.HearthriseRecord;
    const G = window.G;
    assert(A && R, 'accrue.js + record.js must both load');
    if (typeof window.saveLocal !== 'function') { skip('no save'); return; }
    const save = { offlineBudget: G.offlineBudget, restedAt: G.restedAt, lastSeen: G.lastSeen,
      _record: G._record };
    const hiddenDesc = Object.getOwnPropertyDescriptor(document, 'hidden');
    try {
      /* saveLocal only advances the watermark WHILE VISIBLE (b261). The harness
         reports hidden, so a test that did not force this would pass with the
         line deleted, the fix reverted, or anything at all. */
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });

      /* ── THE CONTROL, RE-POINTED (b515). It used to be a POSITION: turn the
         b353 kill switch off, and saveLocal must still advance the watermark,
         because a "fix" that stops the write unconditionally breaks a shipping
         game to protect a field nothing owns yet. There is no off position any
         more, so the control is now the one thing saveLocal still writes at all
         — `lastSeen`, which is NOT on the registry. Same job, and a stronger
         one: it proves the refusal below is scoped to the FIELD rather than
         being saveLocal having stopped writing.
         b515 note: the blob write is gone; this stamp is all that remains. */
      assert(R.serverOfRecordFields().indexOf('lastSeen') === -1,
        '`lastSeen` is on the registry now — pick a different client-owned control for this test');
      G.lastSeen = 0;
      window.saveLocal();
      assert(G.lastSeen > 0,
        'saveLocal stopped advancing `lastSeen`, a field the client still owns — the write guard has '
        + 'become an unconditional freeze rather than a per-field refusal, and everything below would '
        + 'then pass for the wrong reason');

      /* ── THE FIX. The server has ANSWERED (applyRecord wrote a real
         watermark), and saveLocal must leave it alone.
         MUTATION: drop `clientMayWriteRecordField('offlineBudget')` from the
         condition in legacy.js's saveLocal → RED here. */
      const serverAt = Date.parse('2026-08-15T06:00:00Z');
      G._record = null;
      const wrote = R.applyRecord(G, { ok: true, version: 900, now: '2026-08-15T06:00:00Z',
        state: { accrued_to: '2026-08-15T06:00:00Z' } });
      assert(wrote.written.indexOf('offlineBudget') !== -1 && G.offlineBudget.at === serverAt,
        'the fixture never got a server watermark in place, so nothing below would mean anything: '
        + JSON.stringify(wrote));

      G.lastSeen = 0;                      // so a client write is unmistakable
      window.saveLocal();
      assert(G.offlineBudget.at === serverAt,
        'saveLocal() overwrote the SERVER\'s watermark with its own (' + G.offlineBudget.at + ' vs '
        + serverAt + ') — the field now has two sources, which is the exact divergence class b340 exists '
        + 'to close, and it is the TEMPLATE gold/inventory/skills/tokens all copy');

      const v = R.recordValue(G, 'offlineBudget');
      assert(v.known === true && v.source === 'server' && v.value.at === serverAt,
        'after an honest save the record no longer reports as the server\'s: ' + JSON.stringify(v));
    } finally {
      if (hiddenDesc) Object.defineProperty(document, 'hidden', hiddenDesc); else { try { delete document.hidden; } catch (e) {} }
      Object.assign(G, save);
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  () => tryRun('B347-R2: the cloud overlay stops re-stamping the watermark it just stripped — auth.js\'s own caller', () => {
    const Auth = window.HearthriseAuth;
    const A = window.HearthriseAccrual;
    const R = window.HearthriseRecord;
    assert(Auth && typeof Auth.applyCloudOverlay === 'function',
      'auth.js does not expose the cloud→G seam — the strip and the re-stamp were undoing each other and '
      + 'the only way to check either would be to re-derive it, which proves nothing about auth.js');
    try {
      const cloudAt = Date.parse('2026-08-15T09:30:00Z');
      const serverAt = Date.parse('2026-08-15T06:00:00Z');

      /* b515: the CONTROL was a POSITION — switch the b353 kill switch off and
         the overlay must land whole, watermark re-stamped, byte-for-byte b305.
         There is no off position, so the control moves to the COMPLEMENT and is
         asserted inside the one remaining path: a field that is NOT on the
         registry must still be overlaid, and `lastSeen` must still be stamped.
         That is what stops "the re-stamp was removed" and "the overlay stopped
         working" looking the same. */
      assert(R.serverOfRecordFields().indexOf('stats') === -1,
        '`stats` is on the registry now — pick a different client-owned control for this test');

      /* ── THE FIX. A SERVER-SUPPLIED watermark is already in place. The strip
         removes `offlineBudget` from the snapshot; the re-stamp used to put a
         blob-derived number straight back over the server's, three lines later,
         in the same function.
         MUTATION: restore `if (G.offlineBudget) G.offlineBudget.at = cloudAt;`
         unguarded in auth.js applyCloudOverlay → RED here. */
      const on = {};
      R.applyRecord(on, { ok: true, version: 901, now: '2026-08-15T06:00:00Z',
        state: { accrued_to: '2026-08-15T06:00:00Z' } });
      assert(on.offlineBudget.at === serverAt, 'the fixture never got a server watermark');

      const rOn = Auth.applyCloudOverlay(on, { stats: { kills: 7 }, offlineBudget: { at: 5 } }, cloudAt, window);
      assert(on.stats && on.stats.kills === 7 && on.lastSeen === cloudAt,
        'the overlay stopped applying the fields the client DOES own: ' + JSON.stringify(on));
      assert(on.offlineBudget.at === serverAt && rOn.restampedWatermark === false,
        'the cloud overlay re-stamped the server\'s watermark to the snapshot\'s own save time ('
        + on.offlineBudget.at + ' vs ' + serverAt + ') — the strip deleted the field from the blob and the '
        + 'next statement put a blob-derived number back under the server\'s name');
      assert(R.recordValue(on, 'offlineBudget').source === 'server',
        'after a restore the record no longer reports as the server\'s: '
        + JSON.stringify(R.recordValue(on, 'offlineBudget')));
    } finally { /* nothing pinned — the seam has one position */ }
  }),

  () => tryRun('B347-R3: the accessor cannot report a CLIENT number under the server\'s name', () => {
    const R = window.HearthriseRecord;
    const serverAt = Date.parse('2026-08-15T06:00:00Z');
    const clientAt = Date.parse('2026-08-15T09:30:00Z');

    /* Every registry entry carries every column. A hard-coded list cannot notice
       a column being ADDED, so the guard reads the contract (REGISTRY_FIELDS)
       instead of restating it — hr-accrue/intents.js's shape, same reason. */
    assert(Array.isArray(R.REGISTRY_FIELDS) && R.REGISTRY_FIELDS.indexOf('fingerprint') !== -1,
      'the registry contract does not require a fingerprint: ' + JSON.stringify(R.REGISTRY_FIELDS));
    for (const e of R.SERVER_OF_RECORD) {
      for (const k of R.REGISTRY_FIELDS) {
        assert(e[k] !== undefined && e[k] !== null,
          'registry entry ' + e.field + ' is missing `' + k + '` — a field with no fingerprint is a field '
          + 'whose provenance cannot be checked, which is the state this test exists to end');
      }
    }

    const g = {};
    R.applyRecord(g, { ok: true, version: 3, now: '2026-08-15T06:00:00Z',
      state: { accrued_to: '2026-08-15T06:00:00Z' } });
    const good = R.recordValue(g, 'offlineBudget');
    assert(good.known === true && good.source === 'server' && good.value.at === serverAt,
      'the control failed — an honestly applied record is not reported as the server\'s: ' + JSON.stringify(good));

    /* THE MEASUREMENT, REPRODUCED. A client write of exactly the shape
       saveLocal() and the cloud overlay were making. `known` is a claim about
       the PAST ("an envelope wrote this during this session"); it says nothing
       about the present, and the entire point of an accessor built to catch a
       second writer is that a second writer may have run since.
       MUTATION: drop the `want !== have` branch in record.js recordValue → RED. */
    g.offlineBudget.at = clientAt;
    const lied = R.recordValue(g, 'offlineBudget');
    assert(lied.known === false && lied.source === 'client-overwrote',
      'a client write is still reported as ' + JSON.stringify(lied) + ' — the forged number wearing the '
      + 'server\'s name, which is strictly worse than never having moved the record, because everyone '
      + 'downstream now believes it');
    assert(lied.expected !== lied.found,
      'the accessor reported tampering without being able to say what changed: ' + JSON.stringify(lied));

    /* AND THE STALE-SESSION HOLE THAT FALLS OUT OF IT. `_record` is `_`-prefixed
       so it never syncs — but saveLocal() writes all of G, so a `_record` from a
       PREVIOUS session survives a reload while stripServerOfRecord deletes the
       field it claims. That pair used to report `known:true, value:undefined`. */
    const stale = { _record: { version: 2, known: ['offlineBudget'] } };
    const v = R.recordValue(stale, 'offlineBudget');
    assert(v.known === false,
      'a `known` claim restored from a previous session vouches for a field that is not there: '
      + JSON.stringify(v));

    /* The guard direction: a field that is NOT on the registry is not this
       module's business and must never be reported as anything but 'not-moved'.
       b456: `restedAt` was the exemplar until the cutover armed it; the exemplar
       is now picked from the registry's COMPLEMENT and its absence is asserted,
       so the next arm cannot quietly turn this assertion into a tautology. */
    const UNMOVED_NAME = 'stats';
    assert(R.serverOfRecordFields().indexOf(UNMOVED_NAME) === -1,
      '`' + UNMOVED_NAME + '` is on the registry now — pick a different unmoved exemplar for this test');
    assert(R.recordValue(g, UNMOVED_NAME).source === 'not-moved', 'an unmoved field was claimed');
  }),

  () => tryRun('B347-R4: the write guard is ONE implementation, and it fails CLOSED', () => {
    const A = window.HearthriseAccrual;
    const R = window.HearthriseRecord;
    try {
      /* b515: the guard used to be graded in two POSITIONS — switch off, the
         client may write its own field; switch on, it may not. The switch is
         retired, so what distinguishes "the registry is the list" from "nothing
         may ever be written" is the unmoved exemplar below, which was already
         here and is now doing the whole job of the control. */
      assert(A.mayClientWrite('offlineBudget', window) === false,
        'with the switch ON a client site is still allowed to write the record');
      /* b456: `restedAt` armed in the cutover, so it is no longer an unmoved
         exemplar. Take one from the registry's complement, and assert it IS in the
         complement so this cannot silently become vacuous the next time a field
         moves. The property — the REGISTRY is the list, the switch is only the
         master gate — is unchanged. */
      const unmoved = 'stats';
      assert(R.serverOfRecordFields().indexOf(unmoved) === -1,
        '`' + unmoved + '` is on the registry now — pick a different unmoved exemplar for this test');
      assert(A.mayClientWrite(unmoved, window) === true,
        'a field that has NOT moved was refused — the registry is the list, not the switch');

      /* FAIL CLOSED, and it is why the switch is read from accrue.js and the
         field list from record.js: a missing record.js must not be able to
         present itself as "nothing has moved". Same property
         stripRecordFieldsForOverlay holds, same reason.
         MUTATION: `if (!R) return true;` in accrue.js mayClientWrite → RED. */
      assert(A.mayClientWrite('offlineBudget', { HearthriseAccrual: A }) === false,
        'with record.js absent, the client was told it may write — a missing module silently answering '
        + '"not moved" is the failure this pairing exists to prevent');
      assert(R.clientMayWrite('offlineBudget') === false, 'record.js disagrees with accrue.js');
    } finally { /* nothing pinned — the seam has one position */ }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b347 — THE ACTIVITY INTENT SEAM (src/net/activity.js).

     Contract: supabase/functions/hr-accrue/intents.js §"THE CLIENT SEAM". The
     server half has been live since b346 with Security's two conditions landed
     and proven against production; this is the client half.

     THE FOUR PROPERTIES THESE TESTS EXIST FOR, in the order they would hurt:

       ONE KEY PER GESTURE, AND A REJECTED KEY IS NEVER REUSED. `hr_apply`
         records the DECISION under the key outside the protected block, so it
         survives the rollback — a refusal retried with the same key returns the
         same refusal for up to 25 hours. Measured against production: the same
         delta with the same CORRECT version answered `version_conflict,
         replayed` on the reused key and `ok:true` on a fresh one. Getting this
         backwards produces a silent 25-hour outage rather than an error.
       A SWITCH PAYS. The collect runs first, so a successful switch returns a
         `collected` receipt with real gold, XP and items. Discard it and those
         numbers appear out of nowhere at the next hr_load.
       ONE SWITCH, ONE KILL SWITCH. Two would let the client start activities
         the server never hears about.
       FIRE AND RECONCILE. The optimistic pointer is DISPLAY-ONLY and goes back
         to what the ENVELOPE says on a refusal — never to the client's guess.

     Every one of these drives the REAL pointer writers in legacy.js and reads
     what actually went on the wire. */

  () => tryRunAsync('ACT-1: startCombat/stopCombat put the CONTRACT set_activity bytes on the wire — the callers', async () => {
    const A = window.HearthriseAccrual;
    const M = window.HearthriseActivity;
    const G = window.G;
    assert(M, 'src/net/activity.js did not load — the seam is absent and nothing below means anything');
    const mid = (window.MONSTERS && window.MONSTERS.slime) ? 'slime' : Object.keys(window.MONSTERS || {})[0];
    const save = { activeMonster: G.activeMonster, monsterHp: G.monsterHp, monsterMaxHp: G.monsterMaxHp,
      combatLog: G.combatLog, combatKillsThisFoe: G.combatKillsThisFoe, gold: G.gold,
      skills: G.skills, inventory: G.inventory, playerHp: G.playerHp, playerMaxHp: G.playerMaxHp,
      los: G.lastOfflineSummary, offlineBudget: G.offlineBudget, restedAt: G.restedAt,
      _record: G._record, _serverAccrual: G._serverAccrual };
    const realFetch = window.fetch;
    const seen = [];
    const wasOn = A.isServerAccrualEnabled();
    try {
      /* THE ENVELOPE MIRRORS THE LIVE CHARACTER. applyIntentEnvelope replaces
         gold/skills/inventory wholesale (that IS server authority), so an
         envelope built from G leaves the running game exactly as it found it and
         the test still drives every line of the real path. */
      const mirror = (over) => Object.assign({
        ok: true, verb: 'set_activity', version: 910, now: '2026-08-15T06:00:00Z',
        activity: { kind: 'combat', id: mid },
        state: { slot: 0, gold: G.gold, hp: G.playerHp, max_hp: G.playerMaxHp,
          active_kind: 'combat', active_id: mid, accrued_to: '2026-08-15T06:00:00Z' },
        skills: Object.keys(G.skills || {}).reduce((o, k) => { o[k] = { xp: G.skills[k] }; return o; }, {}),
        inventory: Object.assign({}, G.inventory), collected: null,
      }, over || {});

      window.fetch = function (u, init) {
        const s = String(u);
        if (!/hr-accrue/.test(s)) return realFetch.apply(this, arguments);
        let body = null;
        try { body = JSON.parse(init && init.body); } catch (e) {}
        seen.push({ url: s, init, body });
        const kind = body && body.activity && body.activity.kind;
        return Promise.resolve(new Response(JSON.stringify(mirror(kind === 'idle'
          ? { activity: { kind: 'idle', id: null },
            state: { slot: 0, gold: G.gold, hp: G.playerHp, max_hp: G.playerMaxHp,
              active_kind: 'idle', active_id: null, accrued_to: '2026-08-15T06:00:00Z' } }
          : null)), { status: 200 }));
      };
      M.resetActivity();
      M.configureActivity({ url: 'https://proj.supabase.co/', apiKey: 'anon-key', authToken: () => 'jwt-token' });
      A.setServerAccrualEnabled(true);

      /* THE GESTURE. The real function a monster row calls. The pointer is
         cleared first ON PURPOSE: startCombat TOGGLES when it is already on that
         monster, so a test that inherited `mid` from an earlier test would be
         grading a stop while claiming to grade a start. */
      G.activeMonster = null;
      window.startCombat(mid);
      for (let i = 0; i < 60; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 60; i++) await Promise.resolve();

      assert(seen.length === 1,
        'one tap produced ' + seen.length + ' set_activity calls. startCombat begins by calling stopCombat, '
        + 'so an unquieted pair declares idle-then-combat: two idempotency keys and two COLLECTS for one '
        + 'gesture: ' + JSON.stringify(seen.map((r) => r.body && r.body.activity)));
      const req = seen[0];
      assert(req.url === 'https://proj.supabase.co/functions/v1/hr-accrue',
        'wrong endpoint: ' + req.url);
      assert(req.init.method === 'POST', 'set_activity must be POSTed');
      assert(req.init.headers['Authorization'] === 'Bearer jwt-token'
        && req.init.headers['apikey'] === 'anon-key',
        'the request is missing its credentials: ' + JSON.stringify(req.init.headers));
      assert(req.body.verb === 'set_activity',
        'the verb is not the contract\'s (an ABSENT verb still means `accrue`, so a missing one silently '
        + 'runs the accrual instead of the switch): ' + JSON.stringify(req.body));
      assert(req.body.slot === 0, 'the slot is not an integer: ' + JSON.stringify(req.body.slot));
      assert(M.isIntentKey(req.body.intentId),
        'the idempotency key is not a canonical uuid — the server answers `missing_intent_id` before any '
        + 'database work: ' + JSON.stringify(req.body.intentId));
      assert(req.body.activity && req.body.activity.kind === 'combat' && req.body.activity.id === mid,
        'the declaration does not name what the player tapped: ' + JSON.stringify(req.body.activity));
      assert(!('user' in req.body) && !('userId' in req.body) && !('gold' in req.body)
        && !('xp' in req.body) && !('at' in req.body),
        'the body carries something other than a DECLARATION — never a computed value, never a timestamp, '
        + 'and never an identity (the JWT is the only identity there is): ' + JSON.stringify(req.body));

      /* THE STOP is the same call with {kind:'idle', id:null} — it never names
         what it stopped, because `set_activity:idle` is one intent name. */
      seen.length = 0;
      window.stopCombat();
      for (let i = 0; i < 60; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 60; i++) await Promise.resolve();
      assert(seen.length === 1, 'a stop produced ' + seen.length + ' calls');
      assert(seen[0].body.activity.kind === 'idle' && seen[0].body.activity.id === null,
        'a stop declared ' + JSON.stringify(seen[0].body.activity) + ' — without a stop the server goes on '
        + 'paying an activity the player abandoned, which is the away-time bug in reverse');
      assert(seen[0].body.intentId !== req.body.intentId,
        'the stop reused the start\'s idempotency key — a key means ONE gesture, and hr_apply answers '
        + '`intent_mismatch` for a reuse against a different target');
    } finally {
      window.fetch = realFetch;
      restoreAccrualSwitch(wasOn);
      M.resetActivity(); M.configureActivity(null);
      try { window.stopCombat(); } catch (e) {}
      Object.assign(G, { activeMonster: save.activeMonster, monsterHp: save.monsterHp,
        monsterMaxHp: save.monsterMaxHp, combatLog: save.combatLog,
        combatKillsThisFoe: save.combatKillsThisFoe, gold: save.gold, skills: save.skills,
        inventory: save.inventory, playerHp: save.playerHp, playerMaxHp: save.playerMaxHp,
        lastOfflineSummary: save.los, offlineBudget: save.offlineBudget, restedAt: save.restedAt,
        _record: save._record, _serverAccrual: save._serverAccrual });
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  () => tryRunAsync('ACT-2: a REJECTED key is retried with a NEW one; only an UNANSWERED call reuses it', async () => {
    const A = window.HearthriseAccrual;
    const M = window.HearthriseActivity;
    const G = window.G;
    const mid = (window.MONSTERS && window.MONSTERS.slime) ? 'slime' : Object.keys(window.MONSTERS || {})[0];

    /* ── THE RULE, PURE. Reuse is the EXCEPTION, and the first revision of the
       contract had it backwards. A key is spent the moment it is ANSWERED,
       whatever the answer said. */
    assert(M.nextIntentKey('KEY-A', { outcome: 'unreachable' }) === 'KEY-A',
      'an UNANSWERED call rotated its key — that is the one case idempotency exists for ("I do not know '
      + 'whether it landed"), and a new key there can pay the same window twice');
    assert(M.nextIntentKey('KEY-A', { outcome: 'timeout' }) === 'KEY-A', 'a timeout rotated its key');
    for (const o of ['refused', 'rate-limited', 'not-signed-in', 'unavailable', 'malformed', 'switched', 'replayed']) {
      const k = M.nextIntentKey('KEY-A', { outcome: o });
      assert(k !== 'KEY-A' && M.isIntentKey(k),
        'an ANSWERED `' + o + '` reused its key — hr_apply records the DECISION under the key OUTSIDE the '
        + 'protected block, so it survives the rollback and is handed back to every later call presenting '
        + 'it, for up to 25 hours. Measured in production: same delta, same CORRECT version, '
        + '`version_conflict replayed` on the reused key and ok:true on a fresh one');
    }
    assert(M.shouldRetryActivity({ outcome: 'unreachable' }, 1, 2) === true, 'an unanswered call is not retried');
    assert(M.shouldRetryActivity({ outcome: 'refused', reason: 'version_conflict' }, 1, 2) === true,
      'a version conflict is not retried — it is a statement about the READ, rolled back in full, and the '
      + 'defined recovery is re-read and try again');
    assert(M.shouldRetryActivity({ outcome: 'refused', reason: 'uncollectable_window', stage: 'collect' }, 1, 2) === false,
      'a refused COLLECT is being retried in a loop — the contract says never; the recovery is the ACCRUE '
      + 'verb, which owns the degrade ladder');
    assert(M.shouldRetryActivity({ outcome: 'unreachable' }, 2, 2) === false, 'the retry is unbounded');

    const save = { activeMonster: G.activeMonster, monsterHp: G.monsterHp, monsterMaxHp: G.monsterMaxHp,
      offlineBudget: G.offlineBudget, restedAt: G.restedAt, gold: G.gold, skills: G.skills,
      inventory: G.inventory, los: G.lastOfflineSummary, _record: G._record };
    const realFetch = window.fetch;
    const wasOn = A.isServerAccrualEnabled();
    let seen = [];
    let plan = [];
    try {
      window.fetch = function (u, init) {
        const s = String(u);
        if (!/hr-accrue/.test(s)) return realFetch.apply(this, arguments);
        let body = null;
        try { body = JSON.parse(init && init.body); } catch (e) {}
        seen.push(body);
        const step = plan.shift();
        if (!step) return Promise.resolve(new Response('{"ok":false,"error":"rate_limited"}', { status: 429 }));
        if (step.throw) return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve(new Response(JSON.stringify(step.body), { status: step.status }));
      };
      armActivityTransport();

      /* ── UNANSWERED → THE SAME KEY. The declaration may have landed; reuse is
         what makes the retry safe. */
      seen = []; plan = [{ throw: true }, { status: 200, body: { ok: true, version: 1, now: null,
        activity: { kind: 'combat', id: mid },
        state: { active_kind: 'combat', active_id: mid }, skills: {}, inventory: {} } }];
      await window.declareActivity('combat', mid);
      assert(seen.length === 2, 'an unanswered call was not retried (' + seen.length + ' requests)');
      assert(seen[0].intentId === seen[1].intentId,
        'the retry of an UNANSWERED call rotated its key (' + seen[0].intentId + ' → ' + seen[1].intentId
        + ') — the first attempt may have landed, and a second key would collect the window again');

      /* ── ANSWERED REFUSAL → A NEW KEY. This is Security's C1 and the condition
         the whole review turned on.
         MUTATION: `return prevKey;` unconditionally in nextIntentKey → RED. */
      seen = []; plan = [
        { status: 409, body: { ok: false, error: 'version_conflict', stage: 'switch' } },
        { status: 200, body: { ok: true, version: 2, now: null, activity: { kind: 'combat', id: mid },
          state: { active_kind: 'combat', active_id: mid }, skills: {}, inventory: {} } }];
      await window.declareActivity('combat', mid);
      assert(seen.length === 2, 'a version conflict was not retried (' + seen.length + ' requests)');
      assert(seen[0].intentId !== seen[1].intentId,
        'the retry of a REJECTED intent reused the key (' + seen[0].intentId + ') — a rejected key stays '
        + 'rejected by design until hr_intents_prune runs, so that retry could never have succeeded');

      /* ── A REFUSED COLLECT IS NOT RETRIED, AND THE ACCRUE VERB IS ASKED ONCE.
         The window is intact; the degrade ladder lives in the accrue verb, and
         spinning the switch against a clamp can only burn the rate budget. */
      seen = []; plan = [{ status: 409, body: { ok: false, error: 'uncollectable_window', stage: 'collect' } }];
      A.resetAccrualGate(); A.configureAccrual({ url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => 'jwt' });
      await window.declareActivity('combat', mid);
      for (let i = 0; i < 40; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 40; i++) await Promise.resolve();
      const switches = seen.filter((b) => b && b.verb === 'set_activity');
      const accruals = seen.filter((b) => b && !b.verb);
      assert(switches.length === 1,
        'a refused COLLECT was retried ' + switches.length + ' times — the contract says never retry the '
        + 'switch alone in a loop');
      assert(accruals.length === 1,
        'a refused collect did not kick the ACCRUE verb (' + accruals.length + ' accrual calls) — that is '
        + 'the contract\'s named recovery, and without it a clamped player can never change activity again');
    } finally {
      window.fetch = realFetch;
      restoreAccrualSwitch(wasOn);
      M.resetActivity(); M.configureActivity(null);
      A.resetAccrualGate(); A.configureAccrual(null);
      try { window.stopCombat(); } catch (e) {}
      Object.assign(G, save);
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  () => tryRunAsync('ACT-3: A SWITCH PAYS — `collected` reaches the player through the away card\'s own renderer', async () => {
    const A = window.HearthriseAccrual;
    const M = window.HearthriseActivity;
    const G = window.G;
    const mid = (window.MONSTERS && window.MONSTERS.slime) ? 'slime' : Object.keys(window.MONSTERS || {})[0];
    const save = { gold: G.gold, skills: G.skills, inventory: G.inventory,
      playerHp: G.playerHp, playerMaxHp: G.playerMaxHp, los: G.lastOfflineSummary,
      activeMonster: G.activeMonster, offlineBudget: G.offlineBudget, restedAt: G.restedAt,
      _record: G._record, _serverAccrual: G._serverAccrual };
    const realFetch = window.fetch;
    const wasOn = A.isServerAccrualEnabled();
    let body = null;
    try {
      /* The server is AHEAD of the client by the collected gold, which is what a
         real collect looks like — and it keeps the replacement gate quiet, since
         nothing local would be lost. */
      const goldAfter = (Number(G.gold) || 0) + 512;
      const mkBody = (collected) => ({
        ok: true, verb: 'set_activity', version: 920, now: '2026-08-15T06:00:00Z',
        activity: { kind: 'combat', id: mid },
        state: { slot: 0, gold: goldAfter, hp: G.playerHp, max_hp: G.playerMaxHp,
          active_kind: 'combat', active_id: mid, accrued_to: '2026-08-15T06:00:00Z' },
        skills: Object.keys(G.skills || {}).reduce((o, k) => { o[k] = { xp: G.skills[k] }; return o; }, {}),
        inventory: Object.assign({}, G.inventory),
        collected,
      });
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      };
      armActivityTransport();

      body = mkBody({ ms: 1800000, capped: false, kills: 7, gold: 512,
        xp: { attack: 1200, hitpoints: 400 }, items: { bone: 3 }, levelUps: [], died: false });
      G.lastOfflineSummary = null;
      await window.declareActivity('combat', mid);
      for (let i = 0; i < 40; i++) await Promise.resolve();

      const rec = G.lastOfflineSummary;
      assert(rec,
        'THE ONE THE CONTRACT SAYS WILL BITE: a switch PAYS (the collect runs first), and this client wrote '
        + 'no receipt at all — 512 gold, 1,600 XP, 3 items and 7 kills the player genuinely earned would '
        + 'appear out of nowhere at the next hr_load');
      assert(rec.gainedGold === 512 && rec.gainedXp === 1600 && rec.gainedItems === 3 && rec.gainedKills === 7,
        'the receipt does not carry what the server said it paid: ' + JSON.stringify(rec));
      assert(rec.awayMs === 1800000 && rec.hrs === 0.5,
        'the receipt did not go through summaryFromAway — the away card and this call must not describe the '
        + 'same kind of payment differently: ' + JSON.stringify({ awayMs: rec.awayMs, hrs: rec.hrs }));
      assert(rec.serverAuthoritative === true && rec.source === 'switch',
        'the receipt cannot say it came from a SWITCH rather than an absence, so no surface can tell the '
        + 'two apart and a bug report cannot either: ' + JSON.stringify({ sa: rec.serverAuthoritative, s: rec.source }));
      assert(G.gold === goldAfter,
        'the ENVELOPE was not applied (gold ' + G.gold + ' vs ' + goldAfter + ') — the receipt would then '
        + 'describe a payment the client never received');
      assert(G._serverAccrual && G._serverAccrual.via === 'set_activity',
        'the provenance stamp does not name the verb that wrote it');

      /* A ZERO RECEIPT IS NOT A RECEIPT. `collected` is null when there was
         nothing to collect and null when the collect itself was a replay;
         rendering a zero over a real away card is the mirror image of the bug
         above, and it is the one a naive `if (body.collected)` ships.
         MUTATION: `if (collected !== undefined)` in collectedOf → RED. */
      const kept = G.lastOfflineSummary;
      body = mkBody(null);
      await window.declareActivity('idle', null);
      for (let i = 0; i < 40; i++) await Promise.resolve();
      assert(G.lastOfflineSummary === kept,
        'a switch that collected NOTHING overwrote the last real receipt: ' + JSON.stringify(G.lastOfflineSummary));

      body = mkBody({ ms: 0, kills: 0, gold: 0, xp: {}, items: {}, levelUps: [] });
      await window.declareActivity('combat', mid);
      for (let i = 0; i < 40; i++) await Promise.resolve();
      assert(G.lastOfflineSummary === kept,
        'an all-zero receipt was rendered — the welcome-back card would read "+0 gold" over a real night');
    } finally {
      window.fetch = realFetch;
      restoreAccrualSwitch(wasOn);
      M.resetActivity(); M.configureActivity(null);
      try { window.stopCombat(); } catch (e) {}
      Object.assign(G, { gold: save.gold, skills: save.skills, inventory: save.inventory,
        playerHp: save.playerHp, playerMaxHp: save.playerMaxHp, lastOfflineSummary: save.los,
        activeMonster: save.activeMonster, offlineBudget: save.offlineBudget, restedAt: save.restedAt,
        _record: save._record, _serverAccrual: save._serverAccrual });
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  () => tryRunAsync('ACT-4: the pointer reconciles to the ENVELOPE, never to the client\'s guess', async () => {
    const A = window.HearthriseAccrual;
    const M = window.HearthriseActivity;
    const G = window.G;
    const ids = Object.keys(window.MONSTERS || {});
    const mid = (window.MONSTERS && window.MONSTERS.slime) ? 'slime' : ids[0];
    const other = ids.find((k) => k !== mid);
    assert(mid && other, 'the fixture needs two monsters');
    const save = { activeMonster: G.activeMonster, monsterHp: G.monsterHp, monsterMaxHp: G.monsterMaxHp,
      combatLog: G.combatLog, gold: G.gold, skills: G.skills, inventory: G.inventory,
      playerHp: G.playerHp, playerMaxHp: G.playerMaxHp, los: G.lastOfflineSummary,
      offlineBudget: G.offlineBudget, restedAt: G.restedAt, _record: G._record };
    const realFetch = window.fetch;
    const wasOn = A.isServerAccrualEnabled();
    let answer = null;
    try {
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify(answer.body), { status: answer.status }));
      };
      armActivityTransport();

      /* A REFUSED SWITCH THAT CARRIES AN ENVELOPE. The player tapped `other`;
         the server says they are still on `mid`. The optimistic pointer is
         DISPLAY-ONLY and goes back to what the server says.
         MUTATION: skip the onReconcile fire for a refusal in activity.js settle
         → RED here. */
      answer = { status: 409, body: { ok: false, error: 'version_conflict', stage: 'switch',
        version: 930, now: null, activity: { kind: 'combat', id: mid },
        state: { slot: 0, active_kind: 'combat', active_id: mid, gold: G.gold,
          hp: G.playerHp, max_hp: G.playerMaxHp, accrued_to: '2026-08-15T06:00:00Z' },
        skills: Object.keys(G.skills || {}).reduce((o, k) => { o[k] = { xp: G.skills[k] }; return o; }, {}),
        inventory: Object.assign({}, G.inventory), collected: null } };
      G.activeMonster = other; G.monsterHp = 1; G.monsterMaxHp = 1;
      await window.declareActivity('combat', other);
      for (let i = 0; i < 60; i++) await Promise.resolve();
      assert(G.activeMonster === mid,
        'a refused switch left the client fighting ' + G.activeMonster + ' while the server says ' + mid
        + ' — the client kept its own guess, which is the one thing it is never allowed to do');

      /* A STATELESS REFUSAL (rate_limited: refused BEFORE any database work, so
         attaching an envelope would hand the rate budget back). Nothing was
         written, so the client reconciles to the LAST envelope it holds. */
      answer = { status: 429, body: { ok: false, error: 'rate_limited' } };
      G.activeMonster = other; G.monsterHp = 1; G.monsterMaxHp = 1;
      await window.declareActivity('combat', other);
      for (let i = 0; i < 60; i++) await Promise.resolve();
      assert(G.activeMonster === mid,
        'a stateless refusal left the optimistic pointer on ' + G.activeMonster + ' — nothing was written '
        + 'server-side, so the last envelope is still current and is what it must reconcile to');

      /* AND THE RECONCILE DOES NOT DECLARE ITSELF BACK. Moving the pointer runs
         through startCombat/stopCombat (they own the interval, the log and the
         repaint); without the quiet counter that is an intent per round trip,
         forever. */
      const st = M.getActivityState();
      assert(st.last && st.last.applied && st.last.applied.reconciled
        && st.last.applied.reconciled.id === mid,
        'the module does not report what it reconciled to: ' + JSON.stringify(st.last));
    } finally {
      window.fetch = realFetch;
      restoreAccrualSwitch(wasOn);
      M.resetActivity(); M.configureActivity(null);
      try { window.stopCombat(); } catch (e) {}
      Object.assign(G, save);
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  /* ── regression suite — THE SMITHING SWITCH THE PLAYER HAD TO PRESS TWICE ───
     REPORTED (Paione, 2026-09-17 04:29, on live): «when I'm smithing for example a
     steel platebody and swap to plate legs, the game doesn't change to the legs, it
     stays on the platebody. After pressing a few times it changes.»

     ONE FIXTURE, TWO PROPERTIES: a running bench, a scripted `set_activity`
     plan, and a settle the test can hold open on the wire. The arm owns its own
     try/finally so neither test can leak a fetch stub, a notify stub or an
     unrestored G into the rest of the suite. */
  () => tryRunAsync('B549-1: a recipe switch refused version_conflict is the CLIENT\'s retry, and the retry does not re-enter the window it just lost', async () => {
    await benchSwitchArc(async (t) => {
      // ONE TAP, ONE CONFLICT: the switch races a settle, the server's read loses, and the client asks again.
      t.plan([t.refuse(901, t.a.id), t.accept(902, t.b.id)]);
      window.startArtisan('smithing', t.b.id); await drain();
      assert(t.sent.length === 2, 'ONE tap sent ' + t.sent.length + ' set_activity — a version_conflict is retried by the CLIENT, once');
      assert(t.probe[1] && t.probe[1].target === t.b.id, 'between the refusal and the retry the client put the bench back on ' + (t.probe[1] && t.probe[1].target) + ' — the reconcile is HELD while the gesture is still asking');
      assert(window.G.skillTargetId === t.b.id, 'after ONE tap the bench is smithing ' + window.G.skillTargetId + ', not ' + t.b.id + ' — this is Paione\'s "after pressing a few times it changes"');

      /* AND THE RETRY WAITS FOR THIS CLIENT'S OWN SETTLE. A conflict is the
         server's read losing a race to a write that is very often still on our
         wire; re-sending in the same microtask loses to that same write, which
         is how ONE retry still left the player pressing. */
      t.reset(); t.armSettle();
      t.plan([t.refuse(903, t.b.id), t.accept(904, t.a.id)]);
      await drain();
      assert(t.log.indexOf('accrue:sent') === 0 && t.canRelease(), 'setup: no settle is on the wire (' + JSON.stringify(t.log) + ') — this arm would measure nothing');
      window.startArtisan('smithing', t.a.id); await drain();
      assert(t.log.filter((x) => /^switch:/.test(x)).length === 1, 'the retry was sent while this client\'s own settle was still on the wire (' + JSON.stringify(t.log) + ') — it re-enters the window it just lost and is refused for the same reason');
      t.release(); await drain();
      assert(t.log.join(',') === 'accrue:sent,switch:1,accrue:answered,switch:2', 'the retry must wait for the settle to answer and then go: ' + JSON.stringify(t.log));
      assert(window.G.skillTargetId === t.a.id, 'the waited retry did not land the bench on ' + t.a.id + ' (' + window.G.skillTargetId + ')');
    });
  }),

  /* …AND THE CONFLICT THE CLIENT CANNOT CLOSE IS SAID OUT LOUD. The bench slides
     back to the server's pointer — that is server truth and it stays — but in
     silence a refused tap and a dead button look identical, which is the other
     half of "I press it a few times". */
  () => tryRunAsync('B549-2: a switch the retry could not close lands on the server\'s recipe AND tells the player', async () => {
    await benchSwitchArc(async (t) => {
      const stuck = t.refuse(905, t.a.id);
      t.plan([stuck, stuck]);
      window.startArtisan('smithing', t.b.id); await drain();
      assert(window.G.skillTargetId === t.a.id, 'a switch the server refused twice left the bench on the client\'s own guess (' + window.G.skillTargetId + ') — the envelope is the truth');
      assert(t.said.length >= 1, 'the bench slid back to ' + t.a.id + ' and the player was told NOTHING — a refused tap and a dead button are indistinguishable, so the player presses again');
    });
  }),

  /* ACT-7 — A REFUSED DECLARATION MUST STOP THE LOCAL RUN. MEASURED LIVE
     (2026-09-11 02:05 UTC): a gather intent the realm answered 409
     `unknown_activity` left the client reading "Fishing" and running the local
     loop for five minutes with the server idle — all of it client-authored and
     gone on the next reload. PRISTINE ON PURPOSE: `settle` reconciles a
     stateless refusal to `lastServerActivity`, whose only writers are its own
     envelope branch and record.js's boot resume — and the resume files the
     pointer ONLY for a NON-idle record, so a session that booted idle has never
     been told anything and every refusal fell through to `unresolved`.
     `resetActivity()` IS that state, asserted not assumed. The stops are QUIET because `stopCombat` declares unconditionally and a stop outside the quiet counter puts a real intent on the wire (measured: two CSP errors).
     MUTATIONS RUN: `applied.unresolved = true` back for a refusal in `settle` → ① red; drop `verdict` from the reconcile hook → ④ red. */
  () => tryRunAsync('ACT-7: a REFUSED gather declaration stops the local run, lands on the server\'s '
    + 'pointer and says why — the client never keeps a run the realm refused', async () => {
    const M = window.HearthriseActivity, G = window.G, said = [];
    const spot = (window.FISH_SPOTS || []).find((f) => f.id === 'shrimp_s') || (window.FISH_SPOTS || [])[0];
    if (!M || typeof M.activityRefusalMessage !== 'function' || !spot
        || typeof window.__isSkillLoopArmed !== 'function' || typeof window.activityQuietly !== 'function') {
      skip('the activity seam or the gather loop is not wired'); return; }
    const snap = snapshotG(), realFetch = window.fetch, realNotify = window.notify;
    const hadConfig = M.getActivityConfig(), t0 = Date.now();
    const stop = () => window.activityQuietly(() => { try { window.stopSkill(); } catch (e) {} try { window.stopCombat(); } catch (e) {} });
    try { stop(); M.resetActivity();
      assert(M.getActivityState().lastServerActivity === null, 'the fixture could not reach the never-told state this bug lives in');
      M.configureActivity({ url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => 'jwt' });
      /* The live 409 verbatim: a STATELESS code answered from the catalogue before any database work — no version/skills/inventory, so `envelopeOf` correctly returns null — whose body still states the server's pointer. */
      window.fetch = function (u) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'unknown_activity', state: { slot: 0, active_kind: 'idle', active_id: null } }), { status: 409 }));
      };
      window.notify = (m, k) => said.push({ m: String(m), k: k });
      window.startSkill('fishing', spot.id, spot.ms);
      assert(G.activeSkill === 'fishing' && G.skillTargetId === spot.id && window.__isSkillLoopArmed(), 'the fixture could not start the local gather run, so the refusal below would prove nothing');
      while (M.getActivityState().pending && Date.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 5));
      assert(!G.activeSkill && !G.skillTargetId && window.__isSkillLoopArmed() === false, '① THE BUG: the realm REFUSED the declaration (409 unknown_activity) and the client is still on ' + G.activeSkill + '/' + G.skillTargetId + ', loop ' + (window.__isSkillLoopArmed() ? 'ARMED' : 'idle') + ' — everything that loop paints is client-authored and gone on the next reload');
      window.refreshActivityBar();
      const txt = String((document.getElementById('ab-name') || {}).textContent || ''), st = M.getActivityState();
      assert(/^Idle/.test(txt), '② THE SYMPTOM VERBATIM: the strip reads "' + txt + '" over a run the realm refused');
      assert(st.last.applied.reconciled && st.last.applied.reconciled.kind === 'idle' && !st.last.applied.unresolved, '③ no reconcile for a refusal this module had no earlier envelope for — `unresolved` is the exact field that let the optimistic pointer stand for five minutes: ' + JSON.stringify(st.last.applied));
      assert(st.lastServerActivity === null && M.isActivityConfirmed('gather', spot.id) === false, '③ the client filed its own fail-safe as a SERVER statement — an acknowledgement the transport never produced');
      const want = M.activityRefusalMessage('unknown_activity'), hit = said.find((s) => s.m === want);
      assert(hit && hit.k === 'kill', '④ the run stopped in SILENCE (or off the refusal channel) — a player whose activity stops by itself files "the game ignored me", and they are right to. Said: ' + JSON.stringify(said.map((s) => s.m)).slice(0, 160));
      assert(want !== M.activityRefusalMessage(''), '④ the player got the GENERIC line — the server\'s own reason never travelled');
    } finally { window.fetch = realFetch; window.notify = realNotify;
      stop(); M.resetActivity(); M.configureActivity(hadConfig || null); restoreG(snap);
      try { window.refreshActivityBar(); window.saveLocal(); } catch (e) {}
    }
  }),

  /* ACT-5 IS RETIRED (b515). Its subject was the SHARED kill switch: the
     activity seam had to follow accrual in both directions, because two
     switches would let the client start activities the server never hears
     about. `isActivityIntentEnabled()` is a one-line delegation to a constant
     now — there is no second state to be in and no direction to follow — and
     the inverted B353-1 asserts every family answers TRUE on a pristine device.

     Its two OTHER refusals were not about the switch at all and are kept, in
     ACT-5b below: a tokenless client and an unsupported kind are both refused
     BY THE CLIENT, before the wire. They matter more now than they did, because
     they are the only inert positions left. */
  () => tryRunAsync('ACT-5b: an intent nobody can authorise never reaches the wire — tokenless is inert, and an unsupported kind is refused by the client', async () => {
    const M = window.HearthriseActivity;
    const G = window.G;
    const mid = (window.MONSTERS && window.MONSTERS.slime) ? 'slime' : Object.keys(window.MONSTERS || {})[0];
    const save = { activeMonster: G.activeMonster, monsterHp: G.monsterHp, monsterMaxHp: G.monsterMaxHp,
      combatLog: G.combatLog, gold: G.gold, playerHp: G.playerHp, inventory: G.inventory,
      skills: G.skills, offlineBudget: G.offlineBudget, restedAt: G.restedAt };
    const realFetch = window.fetch;
    let hits = 0;
    try {
      window.fetch = function (u) {
        if (/hr-accrue/.test(String(u))) { hits++; return Promise.resolve(new Response('{}', { status: 200 })); }
        return realFetch.apply(this, arguments);
      };
      M.resetActivity();

      /* Configured-but-unauthenticated is inert: an intent with no token is a
         request that can only be refused, and sending it spends a rate budget
         to learn that. */
      M.configureActivity({ url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => null });
      const v = await window.declareActivity('combat', mid);
      assert(v && v.outcome === 'unconfigured' && hits === 0,
        'a tokenless client still put an intent on the wire: ' + JSON.stringify(v));

      /* The client refuses its OWN request rather than declaring something the
         server can only answer `activity_unsupported` to. */
      const bad = await M.declareActivity('woodcutting', 'oak');
      assert(bad && bad.outcome === 'undeclarable' && hits === 0,
        'an unsupported kind was declared: ' + JSON.stringify(bad));

      /* THE CONTROL, and it is the whole reason the two zeros above mean
         anything: with a token and a supported kind the SAME spy must see a
         request. Without it, a seam that had stopped sending altogether would
         satisfy every assertion here. */
      M.configureActivity({ url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => 'jwt' });
      await M.declareActivity('combat', mid);
      assert(hits === 1,
        'CONTROL FAILED: an authorised, supported declaration sent ' + hits + ' request(s) — the two '
        + 'inert cases above are then indistinguishable from a dead transport');
    } finally {
      window.fetch = realFetch;
      M.resetActivity(); M.configureActivity(null);
      try { window.stopCombat(); } catch (e) {}
      Object.assign(G, save);
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  () => tryRun('ACT-6: an AWAY death declares NOTHING — the fourth pointer writer, and the silent one', () => {
    /* THE CONTRACT names four pointer writers and says the fourth must NOT call
       the seam: the SERVER already decided the pointer inside the accrual
       delta, so the client here is RECONCILING to state it was told, not
       declaring. A declaration would tell the server something the server told
       it, and spend an idempotency key and a rate budget doing it.

       b515 — THE FOURTH WRITER MOVED, AND IT IS EASIER TO SEE NOW. The away
       death used to happen inside `processOffline`'s local replay, so the
       fixture had to produce one through the client engine and the test's own
       header spent a paragraph on why `ctx.away` had to come from the latch.
       There is no local replay: an away death arrives as `away.died` on an
       accrual ENVELOPE, and `applyServerEnvelope` is the code that must not
       declare. Same property, one indirection fewer, and no fixture that can
       fail for a reason unrelated to the assertion.

       THE CONTROL IS THE WHOLE TEST. "Zero calls" passes trivially if the spy
       is dead, which would make this the thirteenth assertion in this repo that
       asserts nothing. So the same spy must record exactly one declaration from
       a LIVE stop first. */
    const G = window.G;
    const snap = snapshotG();
    const realDeclare = window.declareActivity;
    const calls = [];
    try {
      window.declareActivity = function (kind, id) {
        calls.push({ kind, id, from: String((new Error()).stack || '').split('\n').slice(1, 4).join(' | ') });
        return null;
      };

      // CONTROL: a live stop declares idle, exactly once, through this spy.
      const mid = (window.MONSTERS && window.MONSTERS.slime) ? 'slime' : Object.keys(window.MONSTERS)[0];
      G.activeMonster = mid;
      window.stopCombat();
      assert(calls.length === 1 && calls[0].kind === 'idle' && calls[0].id === null,
        'the spy never saw a live stop declare, so a zero below would prove nothing: ' + JSON.stringify(calls));

      /* THE AWAY DEATH. The server states it; the client applies it. */
      calls.length = 0;
      const dragon = window.MONSTERS.dragon ? 'dragon' : mid;
      G.activeMonster = dragon;
      const landed = applyAwayEnvelope({
        grantMs: 4 * 3600000, awayMs: 4 * 3600000, paidMs: 60000,
        kills: 3, crits: 0, gold: 0, xp: {}, items: {},
        died: true, diedTo: dragon, deaths: 1, recoverMs: 0, recoverRemainingMs: 0,
        recoverLadder: [0], capped: false, blessed: false,
      }, { state: { active_kind: 'combat', active_id: dragon } });
      assert(landed.rec && landed.rec.died === true,
        'the fixture did not produce an AWAY death, so the branch under test never ran: '
        + JSON.stringify(landed.rec));

      /* ╔═ THE POINTER SURVIVES (Recovery Rule rev. 2, 2026-09-06) ════════
         This asserted `activeMonster === null` — the pre-rev.2 contract, where
         a death ENDED the night and the away branch reconciled to an idle
         pointer the server had already set. A death is an INTERRUPTION now: the
         character is Knocked Out and RESUMES THE SAME ACTIVITY, so clearing the
         pointer here would be the client silently cancelling a run the server
         still owns — and the player would come back to a fight they never
         stopped, stopped.
         WHAT THIS TEST IS ABOUT IS UNCHANGED and is the line below: whatever
         the branch does to the pointer, it must not DECLARE it. */
      assert(G.activeMonster === dragon,
        'the away death branch cleared the activity pointer — under rev. 2 a fall does not end the '
        + 'run, it interrupts it, and the same activity resumes: ' + G.activeMonster);
      assert(calls.length === 0,
        'applying a server-stated away death declared ' + JSON.stringify(calls) + ' — the server set the '
        + 'pointer inside the accrual delta already, so this is the client telling the server what the '
        + 'server told it, at the cost of an idempotency key and a rate-gate spend, running a collect on '
        + 'a window the accrual just closed');
    } finally {
      window.declareActivity = realDeclare;
      try { window.stopCombat(); } catch (e) {}
      try { window.HearthriseAccrual.__resetAwayReceipt(); } catch (e) {}   // the away holder outlives G
      restoreGAndRecord(snap);
    }
  }),

  () => tryRunAsync('B348-1: starting a gathering activity puts the CONTRACT bytes on the wire', async () => {
    const A = window.HearthriseAccrual;
    const M = window.HearthriseActivity;
    const G = window.G;
    assert(M && typeof M.declarationFor === 'function',
      'src/net/activity.js has no declarationFor — the b348 seam is absent and nothing below means anything');
    assert(M.ACTIVITY_KINDS.indexOf('gather') !== -1,
      'the client may not declare `gather`, but the server\'s SETTABLE_KINDS can SET it — that is exactly '
      + 'the b348 gap: the server pays an activity this client can never tell it about');

    const tree = (window.TREES || []).find((t) => t.id === 'normal_tree') || (window.TREES || [])[0];
    const save = { activeSkill: G.activeSkill, skillTargetId: G.skillTargetId, skillMs: G.skillMs,
      activeMonster: G.activeMonster, gold: G.gold, offlineBudget: G.offlineBudget, restedAt: G.restedAt };
    const realFetch = window.fetch;
    const wasOn = A.isServerAccrualEnabled();
    const seen = [];
    try {
      window.fetch = function (u, init) {
        const s = String(u);
        if (!/hr-accrue/.test(s)) return realFetch.apply(this, arguments);
        let body = null; try { body = JSON.parse(init && init.body); } catch (e) {}
        seen.push(body);
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, verb: 'set_activity', version: 7, now: null,
          activity: { kind: 'gather', id: tree.id },
          state: { active_kind: 'gather', active_id: tree.id },
          skills: {}, inventory: {},
        }), { status: 200 }));
      };
      armActivityTransport();

      window.startSkill('woodcutting', tree.id, tree.ms);
      for (let i = 0; i < 60; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 60; i++) await Promise.resolve();

      const sw = seen.filter((b) => b && b.verb === 'set_activity');
      /* MUTATION: delete `declareActivity('gather', targetId)` from startSkill
         in src/legacy.js → RED here, naming `gather`. That is the b348 bug,
         reproduced exactly. */
      assert(sw.length >= 1,
        'starting woodcutting declared NOTHING (' + seen.length + ' requests). This is the b348 bug: the '
        + 'server can be TOLD `gather` and this client never says it, so `player_state` stays idle through '
        + 'a real session and the away grant is zero');
      const b = sw[sw.length - 1];
      assert(b.verb === 'set_activity', 'wrong verb: ' + b.verb);
      assert(b.activity && b.activity.kind === 'gather',
        'the declaration named kind `' + (b.activity && b.activity.kind) + '` — the server\'s SETTABLE_KINDS '
        + 'has `gather`, and any other kind is refused or, worse, silently rewritten to a STOP');
      assert(b.activity.id === tree.id, 'the declaration named the wrong node: ' + b.activity.id);
      assert(M.isIntentKey(b.intentId), 'the declaration carried no canonical uuid key: ' + b.intentId);
      assert(Object.keys(b).sort().join(',') === 'activity,intentId,slot,verb',
        'the request body grew a field: ' + Object.keys(b).join(',') + ' — the body is CONSTRUCTED field by '
        + 'field precisely so a future value cannot ride into it');
      assert(M.getActivityState().confirmed
        && M.getActivityState().confirmed.kind === 'gather' && M.getActivityState().confirmed.id === tree.id,
        'the server agreed with the declaration and it was not recorded as CONFIRMED — the reconcile then '
        + 'cannot tell "the server stopped me" from "the server was never told", which is B348-5');

      /* ── AND A REFUSAL IS NOT AN ACKNOWLEDGEMENT, even when it carries a
         perfectly good envelope. A refused switch's `activity` field is the
         server's OLD state; recording it as agreement to THIS declaration
         would make a refused switch indistinguishable from a successful one —
         and the next `idle` would then stop the player's run on the strength
         of a switch that never happened.
         MUTATION: `confirmed = {…}` unconditionally in settle() → RED. */
      M.setConfirmedActivity(null);
      window.fetch = function (u, init) {
        const s = String(u);
        if (!/hr-accrue/.test(s)) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify({
          ok: false, verb: 'set_activity', error: 'unknown_activity', version: 8, now: null,
          activity: { kind: 'idle', id: null },
          state: { active_kind: 'idle', active_id: null }, skills: {}, inventory: {},
        }), { status: 409 }));
      };
      await window.declareActivity('gather', 'not_a_real_node');
      for (let i = 0; i < 60; i++) await Promise.resolve();
      assert(M.getActivityState().confirmed === null,
        'a REFUSED switch was recorded as CONFIRMED (' + JSON.stringify(M.getActivityState().confirmed)
        + ') — the refusal\'s `activity` field is the server\'s OLD state, and treating it as agreement '
        + 'makes a refusal look like a success to the one check that decides whether an `idle` may stop '
        + 'the player');
    } finally {
      window.fetch = realFetch;
      restoreAccrualSwitch(wasOn);
      M.resetActivity(); M.configureActivity(null);
      try { window.stopSkill(); } catch (e) {}
      Object.assign(G, save);
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  () => tryRunAsync('B348-2/3/4: every declarable kind has a real gesture; a stop declares idle; one gesture is one intent', async () => {
    const A = window.HearthriseAccrual;
    const M = window.HearthriseActivity;
    const G = window.G;
    const tree = (window.TREES || []).find((t) => t.id === 'normal_tree') || (window.TREES || [])[0];
    const mid = (window.MONSTERS && window.MONSTERS.slime) ? 'slime' : Object.keys(window.MONSTERS || {})[0];

    /* ── B348-3, AND IT IS THE POINT OF THE WHOLE FILE ────────────────────
       The table is keyed by KIND and the loop iterates `ACTIVITY_KINDS` — the
       list src/net/activity.js keeps in step with the server's SETTABLE_KINDS
       (tests/activity-seam.mjs asserts that half). So the day `artisan` becomes
       payable, `SETTABLE_KINDS` grows, the Node guard forces `ACTIVITY_KINDS`
       to grow, and THIS loop then fails by name until somebody wires a gesture.
       A kind cannot be settable, declarable and unreachable all at once. */
    /* b356 — THE ARTISAN GESTURE. `artisan` joined ACTIVITY_KINDS when the
       engine learned to price it, and this loop is what stopped that from
       shipping server-only. The recipe is chosen from the DATA and filtered
       through the client's OWN payability predicate (`isPayableRecipe`), so the
       fixture follows the gate rather than naming a bench: the day cooking
       becomes payable this picks whatever the ladder offers and nothing here
       changes. `startArtisan` gates on a workbench, a level, the scroll and the
       INPUTS, so the rig grants all four below — a gesture that silently
       returns early would make this arm pass for the wrong reason, which
       `armed` asserts against. */
    const AR = window.ARTISAN_RECIPES || {};
    const isPayable = (id) => !M.isPayableRecipe || M.isPayableRecipe(id);
    let bench = null; let recipe = null;
    for (const sk of Object.keys(AR)) {
      const r = (AR[sk] || []).find((x) => x && x.id && !x.gated && isPayable(x.id)
        && Object.keys((window.getInputs ? window.getInputs(x) : (x.inputs || {}))).length > 0);
      if (r) { bench = sk; recipe = r; break; }
    }

    const GESTURES = {
      combat: () => window.startCombat(mid),
      gather: () => window.startSkill('woodcutting', tree.id, tree.ms),
      artisan: () => {
        assert(!!recipe, 'no ungated, input-taking, PAYABLE artisan recipe exists in ARTISAN_RECIPES — '
          + 'the artisan gesture has nothing to drive, so B348-3 cannot prove the call site exists. '
          + 'That is a content/payability problem, not a missing declaration.');
        window.startArtisan(bench, recipe.id);
      },
    };

    const save = { activeSkill: G.activeSkill, skillTargetId: G.skillTargetId, skillMs: G.skillMs,
      activeMonster: G.activeMonster, monsterHp: G.monsterHp, monsterMaxHp: G.monsterMaxHp,
      playerHp: G.playerHp, playerMaxHp: G.playerMaxHp, combatLog: G.combatLog,
      gold: G.gold, skills: JSON.parse(JSON.stringify(G.skills)),
      inventory: JSON.parse(JSON.stringify(G.inventory)),
      rooms: JSON.parse(JSON.stringify(G.rooms || {})),
      offlineBudget: G.offlineBudget, restedAt: G.restedAt };

    /* Every gate `startArtisan` checks, satisfied — and then ASSERTED, so a
       gesture that returns early cannot look like a missing declaration. */
    if (recipe) {
      G.rooms = Object.assign({}, G.rooms, { forge: 3, workshop: 3, shrine: 3, kitchen: 3 });
      G.skills[bench] = Math.max(G.skills[bench] || 0, 14000000);
      /* The rungs are granted for their room BONUSES only — no bench gates a
         recipe any more — but they still have to arrive on the record, since
         `rooms` is server-of-record and a raw assignment no reader can see. */
      stampRecordLikeLoad(G);
      const inputs = window.getInputs ? window.getInputs(recipe) : (recipe.inputs || {});
      for (const id of Object.keys(inputs)) G.inventory[id] = (G.inventory[id] || 0) + 500;
    }
    const realDeclare = M.declare;
    let calls = [];
    try {
      /* ⚠ THE SPY GOES ON `HearthriseActivity.declare`, NOT ON
         `window.declareActivity`, AND THE DIFFERENCE IS THE TEST.

         legacy.js's `declareActivity` is where the QUIET COUNTER lives — the
         thing that stops one gesture declaring twice. Replacing that function
         (which is what the b347 tests do, for a different property) removes the
         counter along with it, so the spy then records calls the real seam
         would have suppressed and this test fails on a bug that is not there.
         Measured: it did exactly that on the first run.

         `M.declare` is one level below the counter and one level above the
         kill switch, which makes it the honest answer to "what actually left
         the seam" — and it never reaches the network. */
      M.declare = function (kind, id) { calls.push({ kind, id }); return null; };

      for (const kind of M.ACTIVITY_KINDS) {
        if (kind === 'idle') continue;
        assert(typeof GESTURES[kind] === 'function',
          'the client may declare `' + kind + '` and this suite has no PLAYER GESTURE that produces it. '
          + 'Either a call site was never wired (the b348 bug: the server grew a payable kind and legacy.js '
          + 'did not) or the gesture table is stale. Wire the declaration, then add the gesture here.');
        try { window.stopSkill(); } catch (e) {}
        try { window.stopCombat(); } catch (e) {}
        calls = [];
        GESTURES[kind]();
        /* THE GESTURE ACTUALLY STARTED SOMETHING. `startArtisan` and
           `startSkill` both return early — silently — when a gate is unmet, and
           an early return declares nothing, which is indistinguishable from the
           b348 bug this whole arm exists to catch. Asserting the run began is
           what tells "the call site is missing" from "my fixture is wrong". */
        assert(!!(G.activeSkill || G.activeMonster),
          'the player gesture for `' + kind + '` started nothing at all, so the declaration below would '
          + 'be missing for a reason that is NOT the b348 bug. Fix the fixture, not the assertion.');
        const got = calls.filter((c) => c.kind === kind);
        assert(got.length >= 1,
          'the real player gesture for `' + kind + '` declared ' + JSON.stringify(calls) + ' — no `' + kind
          + '` reached the seam, so the server would never learn the player was doing it');
        assert(calls.length === 1,
          'one `' + kind + '` gesture from idle produced ' + calls.length + ' declarations ('
          + JSON.stringify(calls) + ')');
      }

      /* ── B348-4: ONE GESTURE, ONE INTENT — ACROSS THE MUTEX ──────────────
         ⚠ THE FIXTURE IS THE TEST, and the first version of it proved nothing.
           It started each gesture from IDLE, so the activity mutex's
           cross-stop (`startCombat` stops the skill; `startSkill` stops the
           fight) never had anything to stop — and the mutation that removes
           the quiet wrapper left the suite green. A guard that only exercises
           the branch where the bug cannot happen is decoration.

         So each gesture here interrupts the OTHER kind, which is what a player
         actually does. Unless the mutex's inner stop is quiet, one tap sends
         `idle` and then the real kind: two idempotency keys, two rate spends,
         and a second collect pricing a span of milliseconds.
         MUTATION: make block 22's `clearToStart` call `stop()` directly
         instead of through `activityQuietly` → RED. */
      const SWITCHES = [
        { from: () => window.startSkill('woodcutting', tree.id, tree.ms), to: 'combat',
          go: () => window.startCombat(mid) },
        { from: () => window.startCombat(mid), to: 'gather',
          go: () => window.startSkill('woodcutting', tree.id, tree.ms) },
      ];
      for (const s of SWITCHES) {
        try { window.stopSkill(); } catch (e) {}
        try { window.stopCombat(); } catch (e) {}
        s.from();
        assert(!!(G.activeSkill || G.activeMonster),
          'the switch fixture never started anything, so the cross-stop below has nothing to stop and this '
          + 'assertion would pass on a build with no quiet counter at all');
        calls = [];
        s.go();
        assert(calls.length === 1 && calls[0].kind === s.to,
          'switching to `' + s.to + '` mid-activity produced ' + calls.length + ' declarations ('
          + JSON.stringify(calls) + ') — the activity mutex cross-stops the other loop OUTSIDE the function '
          + 'that declares, so unless that stop is quiet a single tap spends two idempotency keys and runs a '
          + 'second collect over a span of milliseconds');
      }

      /* ── B348-2: A STOP IS A DECLARATION — AND ONLY WHEN THERE WAS A RUN. */
      window.startSkill('woodcutting', tree.id, tree.ms);
      calls = [];
      window.stopSkill();
      assert(calls.length === 1 && calls[0].kind === 'idle' && calls[0].id === null,
        'stopping a gathering run declared ' + JSON.stringify(calls) + ' — without an `idle` the server goes '
        + 'on paying an activity the player abandoned, which is the away-time bug in reverse');

      calls = [];
      window.stopSkill();
      window.stopSkill();
      assert(calls.length === 0,
        'a DEFENSIVE stop with nothing running declared ' + JSON.stringify(calls) + '. stopSkill() has '
        + 'thirteen callers in legacy.js and most of them are "make sure nothing is running" — an unguarded '
        + 'declaration here puts an intent, a key and a rate spend on the wire every time a player opens a '
        + 'screen');
    } finally {
      M.declare = realDeclare;
      try { window.stopSkill(); } catch (e) {}
      try { window.stopCombat(); } catch (e) {}
      Object.assign(G, save);
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  () => tryRun('B348-5/6/7 (re-spec b519): a server `idle` stops the run — told or not — and an artisan '
    + '`idle` is agreement, not a contradiction', () => {
    const A = window.HearthriseAccrual;
    const M = window.HearthriseActivity;
    const G = window.G;
    const tree = (window.TREES || []).find((t) => t.id === 'normal_tree') || (window.TREES || [])[0];
    const save = { activeSkill: G.activeSkill, skillTargetId: G.skillTargetId, skillMs: G.skillMs,
      activeMonster: G.activeMonster, gold: G.gold,
      offlineBudget: G.offlineBudget, restedAt: G.restedAt };
    /* Below the quiet counter, above the kill switch — see the note in
       B348-2/3/4 for why spying on `window.declareActivity` would delete the
       very mechanism this test is checking. Nothing reaches the network: the
       spy is the last thing before the transport. */
    const realDeclare = M.declare;
    const wasOn = A.isServerAccrualEnabled();
    let calls = [];
    try {
      /* ARMED, because the re-assertion LATCH is only spent when the seam is
         armed — an inert attempt must not consume the one re-assertion a
         pointer gets, or flipping the switch on mid-run would leave the current
         activity permanently undeclared. The bound below is only meaningful in
         the state the bound applies to. */
      A.setServerAccrualEnabled(true);
      M.declare = function (kind, id) { calls.push({ kind, id }); return null; };
      /* PRECONDITION, STATED RATHER THAN ASSUMED. Every `startSkill`
         below now passes the recovery gate, so a fall left standing by an
         earlier test would make this test REFUSE instead of fail — and a
         refusal that looks like a failure of the thing under test is how a
         fixture becomes a false accusation. Retired the only way the client
         may retire a server-owned line: an envelope that says it is gone. */
      try { A.clearFall(); A.applyEnvelopeState(G, { state: { recovering_until: null } }); } catch (e) {}

      /* ── B348-7: THE RECONCILE CAN REPRESENT `gather` AT ALL. Before b348 it
         had a `combat` branch and an `idle` branch, so a server saying "you are
         chopping oak" landed on nothing — the one function whose contract is
         "the envelope is the truth" silently applied half of it. */
      try { window.stopSkill(); } catch (e) {}
      try { window.stopCombat(); } catch (e) {}
      /* The setup stops are REAL stops and declare a real `idle`; clearing here
         rather than before them is what keeps this an assertion about the
         reconcile instead of about whatever the previous test left running. */
      calls = [];
      window.reconcileActivityPointer({ kind: 'gather', id: tree.id });
      assert(G.activeSkill === 'woodcutting' && G.skillTargetId === tree.id,
        'the server said gather:' + tree.id + ' and the local pointer is ' + G.activeSkill + '/'
        + G.skillTargetId + ' — a reconcile that cannot represent a settable kind is a reconcile that '
        + 'silently disagrees with the server');
      assert(window.__isSkillLoopArmed(),
        'the reconcile moved the pointer but armed no loop — the player would sit on an "active" tile '
        + 'earning nothing, which is the b237 bug arriving through a new door');
      assert(calls.length === 0,
        'reconciling ECHOED a declaration back at the server (' + JSON.stringify(calls) + ') — that is a '
        + 'loop with a round trip in it, and the quiet counter exists to stop it');

      /* ── B348-5, RE-SPECIFIED. THE RULING IT ASSERTED IS RETIRED.
         ═══════════════════════════════════════════════════════════════════
         This arm used to assert the OPPOSITE: that a server `idle` must not
         stop an unconfirmed run, and must re-declare it instead. That was
         right while pre-seam saves existed — every beta character held a
         running activity the server had never heard of, and obeying `idle`
         would have ended their session on a statement nobody made.

         The cutover is complete and the beta was wiped. The only way a run is
         unconfirmed now is that the server was asked and did not agree, and
         the live proof is a knockout: set-activity.js §(1b) refuses every
         PAYABLE kind inside a recovery window BEFORE hr_apply, so the answer
         carries the server's own pointer (`idle`) and there is not even a
         `player_intents` row. Under the old ruling the client re-declared, was
         refused again, spent its latch — and left the LOCAL loop running.
         Measured on hearthrise.net 2026-09-07: four minutes of fishing, a Qty
         badge climbing 37 → 51 and an invented level-up, none of it real.

         So the property is now the same in both directions — the client does
         not run what the server does not own.
         MUTATION: restore `if(!told) return {…undeclared:true}` → RED here. */
      M.setConfirmedActivity(null);
      calls = [];
      let out = window.reconcileActivityPointer({ kind: 'idle', id: null });
      assert(!G.activeSkill && !G.skillTargetId,
        'a server `idle` left an UNCONFIRMED gathering run alive (' + G.activeSkill + '/' + G.skillTargetId
        + '). A run the server does not own earns nothing and vanishes on reload — every item and every '
        + 'XP point the loop paints from here is client-authored, which is the one thing §1 forbids');
      assert(!window.__isSkillLoopArmed(),
        'the pointer was cleared and the TIMER was left running — a headless loop still calling '
        + 'doSkillAction is the same phantom production with nothing on screen to explain it');
      assert(out && out.stopped === 'unconfirmed',
        'the reconcile did not report WHICH stop this was: ' + JSON.stringify(out) + '. The caller owes '
        + 'the player an explanation for an unconfirmed stop and owes nothing for a confirmed one');
      assert(calls.length === 0,
        'the stop DECLARED back at the server (' + JSON.stringify(calls) + ') — the server already holds '
        + '`idle`; telling it so spends an idempotency key and a rate budget to say nothing');

      /* ── B348-5b: AN ARTISAN RUN AND A SERVER `idle` ARE IN AGREEMENT.
         Kept verbatim from before because it still holds, and it is the one case
         the stop above would get catastrophically wrong: `declarationFor`
         downgrades an unpayable recipe to `idle`, so the server saying `idle`
         is the server repeating what this client told it. Reading that as a
         contradiction stops a player mid-smelt.
         MUTATION: drop the `d.kind==='idle'&&told` early return → RED. */
      const cookRecipe = ((window.ARTISAN_RECIPES || {}).cooking || [])
        .filter((r) => r && r.id && M.isPayableRecipe && !M.isPayableRecipe(r.id))[0];
      if (cookRecipe) {
        G.activeSkill = 'cooking'; G.skillTargetId = cookRecipe.id;
        M.setConfirmedActivity({ kind: 'idle', id: null });
        calls = [];
        const agreed = window.reconcileActivityPointer({ kind: 'idle', id: null });
        assert(G.activeSkill === 'cooking' && G.skillTargetId === cookRecipe.id,
          'a server `idle` stopped an ARTISAN run that had itself declared `idle`. The two are in perfect '
          + 'agreement — reading agreement as a contradiction is the same class of bug as the one the '
          + 'stop above fixes, pointed the other way');
        assert(agreed && agreed.agreed === true,
          'the agreement was not reported as one: ' + JSON.stringify(agreed));
        assert(calls.length === 0, 'the agreement declared something: ' + JSON.stringify(calls));
        G.activeSkill = null; G.skillTargetId = null;
      }

      /* ── B348-6: AND IT STOPS ONE IT WAS TOLD ABOUT. Authority. This half
         has always held and still does; it is now the same code path as the
         unconfirmed stop, differing only in what the player is told.
         MUTATION: make the idle branch return early unconditionally → RED. */
      try { window.stopSkill(); } catch (e) {}
      window.startSkill('woodcutting', tree.id, tree.ms);
      M.setConfirmedActivity({ kind: 'gather', id: tree.id });
      calls = [];
      window.reconcileActivityPointer({ kind: 'idle', id: null });
      assert(!G.activeSkill,
        'the server ACKNOWLEDGED this exact activity and then said idle, and the client kept running it. '
        + 'That is not caution, it is the client overruling the server — the one thing server authority '
        + 'removes');
      assert(calls.length === 0, 'the authoritative stop declared back at the server: ' + JSON.stringify(calls));
    } finally {
      M.declare = realDeclare;
      M.setConfirmedActivity(null);
      restoreAccrualSwitch(wasOn);
      try { window.stopSkill(); } catch (e) {}
      Object.assign(G, save);
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  /* ═══════════════════════════════════════════════════════════════════════
     B520-1 — A BOOT RECORD THAT SAYS `artisan` MUST RESUME THE BENCH.

     REPORTED LIVE (Paione, 2026-09-07): "when I log out doing any quarry
     granite or rubble, when I log back in it says I am idle." The realm was
     right — `active_kind='artisan'`, `active_id='quarry_granite'`, 24 `craft`
     ledger rows in three days, the bench ran and PAID all night — while
     `reconcileActivityPointer` had a `combat` branch, a `gather` branch and
     nothing for `artisan`, so the boot resume handed the server's own pointer
     to a function that could not represent it. The strip read "Idle — pick an
     activity" over a run the server was settling.

     DRIVEN THROUGH THE REAL BOOT, not the reconcile alone — the bug is half in
     legacy.js and half in the wiring, so this stubs `hr_load` and runs
     `requestRecord()` → `settle()` → `hydrationStep` → the reconcile.

     FOUR PROPERTIES, each a distinct way this has been got wrong:
       ① the pointer resumes the BENCH with its loop ARMED (a pointer without a
         timer is the "active tile earning nothing" bug);
       ② the strip NAMES it — "Idle" is the entire player-visible symptom;
       ③ NOTHING is declared back — echoing the server spends an idempotency
         key, a rate budget and a COLLECT to say what it just said;
       ④ the server's statement counts as CONFIRMATION, so the next resume does
         not re-declare it and a later `idle` is a quiet stop, not a surprise.

     MUTATION: delete the `kind==='artisan'` branch → ① ② RED; delete the
     setConfirmedActivity/setLastServerActivity pair in record.js → ④ RED. */
  () => tryRunAsync('B520-1: a boot record that says `artisan` resumes the bench — the strip names it, '
    + 'nothing is re-declared, and the server\'s own statement counts as confirmation', async () => {
    const R = window.HearthriseRecord;
    const M = window.HearthriseActivity;
    const C = window.HearthriseCore;
    const G = window.G;
    const RID = 'quarry_granite';
    const hit = (C && typeof C.artisanRecipe === 'function') ? C.artisanRecipe(RID) : null;
    assert(hit && hit.skill && hit.recipe,
      'the recipe this bug was reported against (`' + RID + '`) is not in this build\'s artisan index, so '
      + 'the fixture would be testing nothing. If the id genuinely moved, repoint it at another '
      + 'input-free bench recipe rather than deleting the test');
    const SKILL = hit.skill;
    const snap = snapshotG();
    const realFetch = window.fetch;
    const realDeclare = M.declare;
    let calls = [];
    try {
      /* Start stopped. These stops are REAL and declare a real `idle`, so they
         happen before the spy is cleared, not after. */
      try { window.stopSkill(); } catch (e) {}
      try { window.stopCombat(); } catch (e) {}
      M.setConfirmedActivity(null);
      M.setLastServerActivity(null);
      /* Below the quiet counter and above the transport, for the reason
         B348-5/6/7 states: spying on `declareActivity` would delete the
         mechanism under test. Nothing reaches the network. */
      M.declare = function (kind, id) { calls.push({ kind, id }); return null; };

      /* THE ENVELOPE, BUILT FROM THE LIVE CHARACTER so `applyRecord` is nearly
         idempotent and the only thing that MOVES is the pointer. The one raised
         value is the bench's level: the honest way to satisfy a server-of-record
         gate is to have the SERVER supply the number — poking `G.skills` leaves
         it UNKNOWN and the gate refuses for an unrelated reason. */
      const skills = {};
      const cur = (G.skills && typeof G.skills === 'object') ? G.skills : {};
      for (const k in cur) { const n = Number(cur[k]); if (Number.isFinite(n) && n >= 0) skills[k] = Math.floor(n); }
      const needXp = (C && C.xp && typeof C.xp.xpForLevel === 'function')
        ? C.xp.xpForLevel(Math.min(99, (hit.recipe.req || 1) + 1)) : 0;
      skills[SKILL] = Math.max(skills[SKILL] || 0, needXp);
      const version = Math.max(((G._record && Number(G._record.version)) || 0) + 1, Date.now());
      const body = {
        ok: true, version, now: new Date(version).toISOString(),
        state: {
          slot: 0,
          gold: Number(G.gold) || 0,
          gems: Number(G.gems) || 0,
          /* THE TWO FIELDS THIS TEST IS ABOUT — `activityOf` reads them off
             `state`, the shape hr_state_of really projects. */
          active_kind: 'artisan', active_id: RID,
        },
        skills,
        inventory: { ...(G.inventory || {}) },
        equipment: { ...(G.equipment || {}) },
      };
      window.fetch = function (u) {
        if (!/hr_load/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      };
      R.resetRecord();
      R.configureRecord({ url: 'https://proj.supabase.co/', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      calls = [];
      const v = await R.requestRecord();
      assert(v.outcome === 'loaded', 'the stubbed boot read did not load: ' + JSON.stringify(v));

      /* ① THE RUN RESUMED, AND IT IS ACTUALLY RUNNING. */
      assert(G.activeSkill === SKILL && G.skillTargetId === RID,
        'THE B520 BUG: the boot record said artisan:' + RID + ' and the local pointer is '
        + G.activeSkill + '/' + G.skillTargetId + '. The server is settling and PAYING this bench; a '
        + 'reconcile that cannot represent a settable kind is a client that silently disagrees with the '
        + 'realm about what the player is doing');
      assert(window.__isSkillLoopArmed(),
        'the pointer moved but no artisan timer was armed — the player sits on an "active" bench that '
        + 'produces nothing locally, which is the b237 bug arriving through a new door');

      /* ② AND THE STRIP SAYS SO — asserting the pointer alone would let the
         reported symptom come back through the renderer. */
      window.refreshActivityBar();
      const nameEl = document.getElementById('ab-name');
      assert(nameEl, 'the activity strip is missing from the page, so the reported symptom cannot be measured');
      const txt = String(nameEl.textContent || '');
      const benchName = (window.SKILLS_DEF && window.SKILLS_DEF[SKILL] && window.SKILLS_DEF[SKILL].name) || SKILL;
      assert(txt.indexOf(benchName) !== -1 && txt.indexOf(RID.replace(/_/g, ' ')) !== -1,
        'the activity strip reads "' + txt + '" — it must name the bench and the recipe ("' + benchName
        + ' — ' + RID.replace(/_/g, ' ') + '"), which is the sentence the player said was missing');
      assert(!/^Idle/.test(txt), 'THE REPORTED SYMPTOM VERBATIM: the strip still reads "' + txt + '"');

      /* ③ NOTHING WENT BACK ON THE WIRE. */
      assert(calls.length === 0,
        'the boot resume DECLARED the activity back at the server (' + JSON.stringify(calls) + '). The '
        + 'server is where this pointer came from; telling it spends an idempotency key, a rate budget '
        + 'and a COLLECT to say something it just said');

      // ④ THE RECORD IS AN ACKNOWLEDGEMENT — without it every resume re-declares.
      assert(M.isActivityConfirmed('artisan', RID) === true,
        'the server STATED artisan:' + RID + ' in the boot record and `isActivityConfirmed` says no. Every '
        + 'resumeActiveActivity from here re-declares a run the server already owns, and the b519 '
        + 'unconfirmed-stop path will treat the player\'s own Stop as a surprise');
      const st = M.getActivityState();
      assert(st && st.lastServerActivity && st.lastServerActivity.kind === 'artisan'
        && st.lastServerActivity.id === RID,
        '`confirmed` was filed without `lastServerActivity` (' + JSON.stringify(st && st.lastServerActivity)
        + ') — a module state the transport can never produce, and it leaves a later no-envelope refusal '
        + 'with nothing to reconcile TO');
    } finally {
      window.fetch = realFetch;
      try { R.resetRecord(); } catch (e) {}
      try { R.configureRecord(null); } catch (e) {}
      try { window.stopSkill(); } catch (e) {}
      try { window.stopCombat(); } catch (e) {}
      restoreGAndRecord(snap);
      M.setConfirmedActivity(null);
      M.setLastServerActivity(null);
      M.declare = realDeclare;
    }
  }),

  () => tryRunAsync('B348-8: b339 is NOT reopened — a gated envelope moves the loops and moves no gold', async () => {
    const A = window.HearthriseAccrual;
    const M = window.HearthriseActivity;
    const G = window.G;
    const tree = (window.TREES || []).find((t) => t.id === 'normal_tree') || (window.TREES || [])[0];
    const save = { activeSkill: G.activeSkill, skillTargetId: G.skillTargetId, skillMs: G.skillMs,
      activeMonster: G.activeMonster, gold: G.gold,
      skills: JSON.parse(JSON.stringify(G.skills)), inventory: JSON.parse(JSON.stringify(G.inventory)),
      offlineBudget: G.offlineBudget, restedAt: G.restedAt, _serverAccrual: G._serverAccrual };
    const hadAck = A.isReplacementAcknowledged();
    const realFetch = window.fetch;
    const wasOn = A.isServerAccrualEnabled();
    try {
      A.acknowledgeReplacement(false);                       // the gate is ARMED
      try { A.hideReplacementSheet(); } catch (e) {}
      G.gold = 999999;                                       // far ahead of the server
      G.skills = Object.assign({}, G.skills, { woodcutting: 500000 });

      window.fetch = function (u, init) {
        const s = String(u);
        if (!/hr-accrue/.test(s)) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, verb: 'set_activity', version: 11, now: null,
          activity: { kind: 'gather', id: tree.id },
          state: { active_kind: 'gather', active_id: tree.id, gold: 500 },
          skills: { woodcutting: { xp: 0, level: 1 } }, inventory: {},
        }), { status: 200 }));
      };
      armActivityTransport();

      window.startSkill('woodcutting', tree.id, tree.ms);
      for (let i = 0; i < 60; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 60; i++) await Promise.resolve();

      /* THE PROPERTY. The declaration LANDED (the server switched), the pointer
         is reconciled, and NOT ONE game value moved — because the replacement
         gate is on the ENVELOPE and b348 does not touch it. The failure this
         guards against is the tempting simplification "we are reconciling
         anyway, just apply the state": that is the b339 clobber, silently, on
         every tap of a tree. */
      assert(G.gold === 999999,
        'the server character was applied over local progress with the replacement gate ARMED — gold went '
        + G.gold + ' instead of 999999. b339 exists because that write is permanent and there is no merge');
      assert((G.skills.woodcutting || 0) === 500000, 'skills were replaced behind the gate: ' + G.skills.woodcutting);
      assert(!!document.getElementById(A.ACCRUE_REPLACE_SHEET_ID),
        'the replacement was refused and the player was never asked — a silent refusal is how a switch that '
        + 'pays real gold ends up reporting nothing');
      assert(G.activeSkill === 'woodcutting' && G.skillTargetId === tree.id,
        'the gated envelope also lost the POINTER — the server did switch, and only the state application '
        + 'was withheld; conflating the two would stop the run the player is watching');
      const st = M.getActivityState();
      assert(st.last && st.last.applied && st.last.applied.envelope === false,
        'the seam reported an envelope it did not apply: ' + JSON.stringify(st.last && st.last.applied));
    } finally {
      window.fetch = realFetch;
      try { A.hideReplacementSheet(); } catch (e) {}
      A.acknowledgeReplacement(hadAck ? true : false);
      restoreAccrualSwitch(wasOn);
      M.resetActivity(); M.configureActivity(null);
      try { window.stopSkill(); } catch (e) {}
      Object.assign(G, save);
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  () => tryRun('B348-9/10: an unpriceable activity declares IDLE, not silence; and the client index IS the engine\'s', () => {
    const M = window.HearthriseActivity;
    const C = window.HearthriseCore;
    const G = window.G;

    /* ── B348-9. The tempting answer for an activity this build cannot price is
       to say nothing: the server refuses it anyway. Silence leaves the server's
       pointer on the PREVIOUS activity, so a player who chops oak for an hour
       and then cooks is paid for oak for as long as they cook. `idle` collects
       what was really earned and stops the meter.

       ⚠ b356 MOVED THE LINE WITHOUT MOVING THE RULE. `artisan` is settable now
         and 261 of its 290 recipes are payable, so the downgrade is no longer
         per-KIND — it is per-RECIPE, because the COOKING bench is still held
         back (`noBurn`'s Kitchen rung is read from server state and written by
         the client). The fixture therefore asks the payability model which
         recipes are which, rather than naming `cook_shrimp`: the day the gate
         opens, this follows it instead of going quietly vacuous.
       MUTATION: return the declaration unchanged for an unpayable recipe → RED. */
    const unpayable = ['cook_shrimp', 'cook_trout', 'cook_shark']
      .filter((id) => M.isPayableRecipe && !M.isPayableRecipe(id));
    if (unpayable.length) {
      const d = M.declarationFor('artisan', unpayable[0]);
      assert(d && d.kind === 'idle' && d.id === null,
        'the unpayable recipe `' + unpayable[0] + '` produced ' + JSON.stringify(d) + '. Saying nothing is '
        + 'not neutral — it leaves the server paying for the activity the player STOPPED — and declaring '
        + 'it anyway earns a 409 and leaves the pointer in exactly the same wrong place');
      assert(d.downgradedFrom === 'artisan',
        'the downgrade did not record what it downgraded: ' + JSON.stringify(d));
    }
    /* THE CONTROL, and without it "downgrade everything" passes the arm above
       while paying nothing for 261 recipes. */
    const payable = (window.ARTISAN_RECIPES && window.ARTISAN_RECIPES.smithing || [])
      .filter((r) => r && r.id && (!M.isPayableRecipe || M.isPayableRecipe(r.id)))[0];
    assert(!!payable, 'no PAYABLE smithing recipe exists — the control below is vacuous');
    if (payable) {
      const p = M.declarationFor('artisan', payable.id);
      assert(p && p.kind === 'artisan' && p.id === payable.id,
        'a PAYABLE artisan recipe was downgraded to ' + JSON.stringify(p) + ' — the 261 recipes the '
        + 'engine can price would all report `idle` and pay nothing');
    }
    assert(M.declarationFor('combat', 'slime').kind === 'combat', 'a settable kind was downgraded');
    assert(M.declarationFor('gather', 'normal_tree').kind === 'gather', 'gather was downgraded');
    assert(M.declarationFor('nonsense', 'x') === null, 'a kind the game cannot do was accepted as a stop');
    assert(M.declarationFor('combat', 'BAD ID') === null,
      'a malformed id was quietly turned into a STOP — that hides a client bug behind a legitimate-looking '
      + 'declaration');
    /* And the wire builder may never emit a kind this build has not decided on.
       Driven with a kind the GAME has and this build cannot declare, derived
       from the two lists rather than named — `farm` is the fallback when they
       coincide, and an unknown kind must fall to `idle` too. */
    const nonDeclarable = (M.GAME_ACTIVITY_KINDS || [])
      .filter((k) => M.ACTIVITY_KINDS.indexOf(k) === -1)[0] || 'farm';
    const body = JSON.parse(M.buildActivityRequest({ kind: nonDeclarable, id: 'some_id', intentId: 'k' }).init.body);
    assert(body.activity.kind === 'idle' && body.activity.id === null,
      'buildActivityRequest put `' + body.activity.kind + '` on the wire for the non-declarable kind `'
      + nonDeclarable + '` — the body must only ever carry a kind from ACTIVITY_KINDS');

    /* ── B348-10. The reconcile resolves a node id through the SAME index the
       accrual engine reads (`indexGatherNodes` over TREES/ROCKS/FISH_SPOTS). A
       hand-rolled fourth copy is how the client comes to think a rock is a fish. */
    assert(C && typeof C.gatherNode === 'function', 'HearthriseCore.gatherNode is missing — the reconcile has no index');
    const idx = C.gatherNodes();
    const authored = [].concat(window.TREES || [], window.ROCKS || [], window.FISH_SPOTS || []).map((n) => n.id).sort();
    assert(Object.keys(idx).sort().join(',') === authored.join(','),
      'the client gather index and the authored data disagree — index has ' + Object.keys(idx).length
      + ' nodes, data has ' + authored.length + '. tests/activity-seam.mjs holds the other half of this '
      + '(index === the accrual engine\'s GATHER_NODES)');
    assert(C.gatherNode('normal_tree') && C.gatherNode('normal_tree').skill === 'woodcutting',
      'normal_tree does not resolve to woodcutting');
    assert(C.gatherNode('__proto__') === null && C.gatherNode('constructor') === null,
      'the index is not null-prototype — `__proto__` resolves to something truthy, and a lookup followed by '
      + 'a property read walks straight past every truthiness check downstream');
    assert(typeof window.localActivityPointer === 'function', 'localActivityPointer is missing');
    const before = { activeSkill: G.activeSkill, skillTargetId: G.skillTargetId, activeMonster: G.activeMonster };
    try {
      G.activeMonster = null; G.activeSkill = 'cooking'; G.skillTargetId = 'cook_shrimp';
      assert(window.localActivityPointer().kind === 'artisan',
        'a cooking run reports as `' + window.localActivityPointer().kind + '` — the reconcile would then '
        + 'read an agreeing server as a contradiction and stop the player mid-smelt');
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree';
      assert(window.localActivityPointer().kind === 'gather', 'a chopping run does not report as gather');
    } finally { Object.assign(G, before); }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b354 — THE GOLD SEAM. THE DOUBLE-PAY WINDOW, CLOSED AND PROVEN CLOSED.

     Security named this window before a line of it existed: *"the double-pay
     window opens the moment the client seam is wired."* The shape is one
     sentence — the client pays itself AND the server's receipt is added — and
     the only defence that survives a busy week is one that makes it
     UNSPELLABLE rather than one that avoids it.

     So the rule is: THE SERVER'S ANSWER IS APPLIED ABSOLUTELY, NEVER
     ADDITIVELY. `G.gold = state.gold`. The local payment is a PREDICTION,
     recorded against the intent key and retired by the envelope; `granted` /
     `receipt` are RENDERED and never added to anything.

     These eight drive the real player gestures — the daily-reward sheet, the
     shop button, the bag's Sell 1 — with a stubbed transport, and assert what
     the balance actually did.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRunAsync('B354-1/2/3/4: a claim with the switch ON moves gold by EXACTLY the server receipt, once', async () => {
    const A = window.HearthriseAccrual;
    const Gd = window.HearthriseGold;
    const G = window.G;
    const D = window.HearthriseDaily;
    assert(Gd && typeof Gd.settle === 'function', 'src/net/gold.js did not load — the whole gold seam is absent');

    const realFetch = window.fetch;
    const wasOn = A.isServerAccrualEnabled();
    const wasAck = A.isReplacementAcknowledged();
    /* ⚠ A MICROTASK DRAIN IS NOT ENOUGH, and the first run proved it. The stub
       returns a real `Response`, and `res.json()` resolves on a TASK rather
       than a microtask — so 80 `await Promise.resolve()`s asserted on a balance
       the envelope had not reached yet and reported THE DOUBLE-PAY WINDOW AS
       OPEN when it was closed. A guard that cries wolf about the one hazard it
       exists for teaches its readers to skim it. */
    const save = { gold: G.gold, gems: G.gems, streak: G.streak, dailyReward: G.dailyReward,
      skills: JSON.parse(JSON.stringify(G.skills)), inventory: JSON.parse(JSON.stringify(G.inventory)) };
    let ver = 10;
    let sent = [];

    /* An envelope that carries the CURRENT skills and inventory, so the
       replacement gate is not what this test ends up measuring. */
    const envelope = (gold, gems, extra) => {
      const skills = {}; for (const k of Object.keys(G.skills || {})) skills[k] = { xp: G.skills[k] };
      return Object.assign({
        ok: true, verb: 'claim_reward', version: ++ver, now: Date.now(),
        state: { gold, gems, active_kind: 'idle', active_id: null, accrued_to: null },
        skills, inventory: Object.assign({}, G.inventory),
      }, extra || {});
    };

    try {
      A.setServerAccrualEnabled(true);
      A.acknowledgeReplacement(true);
      Gd.resetGold();
      Gd.configureGold({ url: 'https://probe.supabase.co', apiKey: 'anon', authToken: () => 'jwt' });
      seedPlayStreak(1);
      G.dailyReward = { lastClaimDay: 0 };
      G.gold = 1000; G.gems = 5;
      const rw = D.rewardFor(G);
      assert(rw && rw.gold > 0,
        'B354-CONTROL: the daily reward prices no gold, so every assertion below would pass for free');

      // ── B354-1: THE EITHER/OR. ONE payment, and it is the SERVER'S number.
      const SERVER_GOLD = 1000 + rw.gold * 3;   // deliberately NOT the client's guess
      sent = [];
      window.fetch = function (u, init) {
        const s = String(u);
        if (!/hr-accrue/.test(s)) return realFetch.apply(this, arguments);
        sent.push(JSON.parse(init.body));
        return Promise.resolve(new Response(JSON.stringify(
          envelope(SERVER_GOLD, 5, { granted: { kind: 'daily', key: 'login', gold: rw.gold, gems: rw.gems || 0 } })
        ), { status: 200 }));
      };
      D.claim(G);
      await drain();

      assert(sent.length === 1 && sent[0].verb === 'claim_reward',
        'the claim sent ' + JSON.stringify(sent) + ' — with the switch on it must send exactly one '
        + 'claim_reward intent');
      assert(sent[0].reward && sent[0].reward.kind === 'daily' && sent[0].reward.key === 'login',
        'the claim named ' + JSON.stringify(sent[0].reward) + ' instead of {daily, login}');
      for (const forbidden of ['gold', 'gems', 'amount', 'price', 'period', 'streak']) {
        assert(!(forbidden in sent[0]),
          'the claim body carries a `' + forbidden + '` field. The client may name a REWARD; the moment it '
          + 'can name a VALUE or a PERIOD, "claim every day since launch" becomes a request that can be '
          + 'spelled');
      }
      assert(G.gold === SERVER_GOLD,
        'THE DOUBLE-PAY WINDOW IS OPEN. Gold is ' + G.gold + ' and the server said ' + SERVER_GOLD
        + '. The local payment (' + rw.gold + ') is a PREDICTION and the envelope must be applied '
        + 'ABSOLUTELY (`G.gold = state.gold`) — ' + (G.gold === SERVER_GOLD + rw.gold
          ? 'this is exactly the additive apply Security flagged: the player was paid twice for one claim.'
          : 'something between the prediction and the reconcile is not accounted for.'));
      assert(Gd.goldPredictions().length === 0,
        'the envelope did not RETIRE this gesture\'s prediction (' + JSON.stringify(Gd.goldPredictions())
        + ') — a prediction that outlives its own answer is added on top of the next envelope, forever');

      // ── B354-2: A REFUSAL WITH NO ENVELOPE ROLLS THE PREDICTION BACK.
      G.dailyReward.lastClaimDay = 0;
      G.gold = 2000;
      sent = [];
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        sent.push(JSON.parse(init.body));
        return Promise.resolve(new Response(JSON.stringify({ ok: false, verb: 'claim_reward', error: 'bad_reward' }),
          { status: 400 }));
      };
      D.claim(G);
      await drain();
      assert(G.gold === 2000,
        'a claim the server REFUSED left ' + (G.gold - 2000) + ' phantom gold behind. `bad_reward` is refused '
        + 'on shape, before any database work — nothing was written server-side, so the local prediction is '
        + 'the only thing that moved and it must be undone exactly.');
      assert(Gd.goldPredictions().length === 0, 'the rolled-back prediction is still on the books');

      // ── B354-3: A REFUSAL THAT CARRIES AN ENVELOPE RECONCILES TO IT.
      G.dailyReward.lastClaimDay = 0;
      G.gold = 3000;
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify(
          Object.assign(envelope(3000, 5), { ok: false, error: 'not_claimable', stage: 'claim' })
        ), { status: 409 }));
      };
      D.claim(G);
      await drain();
      assert(G.gold === 3000,
        'a `not_claimable` refusal carrying the server\'s own state left gold at ' + G.gold + '. The envelope '
        + 'is the truth on a refusal too — that is the whole of Security\'s C2 finding — and reconciling to '
        + 'it is what stops a second device\'s claim paying twice.');

      // ── B354-4: NEVER ANSWERED ⇒ THE PREDICTION STANDS, MARKED UNRESOLVED.
      G.dailyReward.lastClaimDay = 0;
      G.gold = 4000;
      window.fetch = function (u) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.reject(new Error('network down'));
      };
      D.claim(G);
      await drain();
      assert(G.gold === 4000 + rw.gold,
        'an UNANSWERED claim moved gold to ' + G.gold + '. A dropped socket is the one case where the client '
        + 'genuinely does not know whether the intent landed; snapping the number either way would be the '
        + 'client authoring a value. The prediction stands and the next envelope settles it.');
      assert(Gd.goldPredictions().length === 1 && Gd.getGoldState().last.applied.unresolved === true,
        'the unanswered call did not leave an UNRESOLVED prediction (' + JSON.stringify(Gd.getGoldState().last)
        + ') — an unresolved payment that is not recorded as one can never be settled');

      /* ══════════════════════════════════════════════════════════════════════
         B354-9 — F1. THE TEST USED TO STOP ONE LINE ABOVE, AND THAT IS THE BUG.
         ══════════════════════════════════════════════════════════════════════
         "The prediction stands" was asserted and "…until the next envelope
         settles it" was not, so nothing checked that a prediction EVER stops
         standing. Security's probe walked straight through the gap: 32
         unanswered sells, then any later envelope, and gold reads 32,000,000
         against a server saying 0 — permanently, because `reconcile` re-adds
         every outstanding prediction to every envelope forever.

         An unanswered call is ABANDONED (not reversed — it may have landed, and
         reversing would be the client authoring a value) and the first envelope
         after it DROPS the entry. The envelope is absolute and already contains
         whatever really happened.
         MUTATION: leave `inflight: true` on the unanswered path → RED. */
      const SERVER_AFTER = 12345;
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify(envelope(SERVER_AFTER, 5)), { status: 200 }));
      };
      G.dailyReward.lastClaimDay = 0;
      D.claim(G);
      await drain();
      assert(G.gold === SERVER_AFTER,
        'AN UNANSWERED PREDICTION IS IMMORTAL. Gold is ' + G.gold + ' and the server said '
        + SERVER_AFTER + ' — the abandoned entry was carried onto a later envelope. That is not a '
        + 'display glitch: `reconcilePredictions` re-adds outstanding entries to EVERY envelope, so '
        + 'an orphan is a permanent additive offset for the rest of the session. 32 dropped sockets '
        + 'and it is 32,000,000 gold against a server saying 0.');
      const st = Gd.getGoldState();
      assert(st.abandoned === 0,
        'the envelope did not drop the abandoned prediction(s): ' + JSON.stringify(st.pending));

      /* AND A SECOND ENVELOPE MUST NOT MOVE IT EITHER — an offset that takes two
         envelopes to appear would pass the assertion above. */
      G.dailyReward.lastClaimDay = 0;
      D.claim(G);
      await drain();
      assert(G.gold === SERVER_AFTER,
        'a SECOND envelope moved gold to ' + G.gold + ' — something is still being carried');
    } finally {
      window.fetch = realFetch;
      Gd.resetGold(); Gd.configureGold(null);
      A.acknowledgeReplacement(wasAck);
      restoreAccrualSwitch(wasOn);
      Object.assign(G, save);
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  /* B354-5 IS RETIRED (b515), and it is the clearest case in the batch. Every
     one of its assertions was about the DARK position: with the b353 kill
     switch off, no gold verb may reach hr-accrue, the daily claim and the
     vendor sale pay LOCALLY byte-for-byte as they did pre-seam, and `settle()`
     records no prediction because nothing will ever retire one. That client
     does not exist: the switch is retired, `isGoldIntentEnabled()` is a
     constant, and a local payment of a server-owned balance is exactly the
     client-authored fallback CLAUDE.md §1 forbids.

     The LIT position — one payment, the SERVER's number, applied absolutely,
     with the prediction retired, rolled back or abandoned according to what the
     server actually said — is B354-1 through B354-4 immediately above, and the
     prediction LIFECYCLE is B354-6 onward. Nothing it covered is uncovered. */

  /* b373: the sweep's confirmation moved off window.confirm (which blocks the
     renderer) onto the shared modal, so the quote is no longer observable by
     stubbing the global. It is observable as a VALUE instead — quoteJunk() —
     which is a stronger assertion than reading a sentence: settleJunk() pays
     the quote it is handed and computes no second price. The dialog half (the
     modal states that same number, and cancelling pays nothing) is B373-2. */
  () => tryRun('B354-6: the sell-junk sweep pays the price it quoted (one vendor bid, not two)', () => {
    const G = window.G;
    const CM = window.HearthriseInvCtx;
    assert(CM && typeof CM.quoteJunk === 'function' && typeof CM.settleJunk === 'function',
      'src/features/inv-context-menu.js did not load, or no longer separates the quote from the payment');
    /* snapshotG() now names gold/inventory/lockedItems, so the bespoke bag is just the confirm stub. */
    const snap = snapshotG(); const save = { confirm: window.confirm };
    try {
      /* A RAW item worth 10+: below that the `max(1,…)` floor makes the
         discounted bid equal the book value and the two prices cannot differ,
         so the test would pass for free. (The same trap tests/gold-intents.mjs
         G1 records finding the hard way with `bones`, v=1.) */
      const raw = Object.keys(window.ITEMS).find((id) => window.ITEMS[id].raw && Number(window.ITEMS[id].v) >= 10);
      assert(!!raw, 'B354-6-CONTROL: no raw item is worth 10+, so the discount half of the vendor formula is '
        + 'unexercised and this test compares two identical numbers');
      assert(window.vendorPrice(raw) < Number(window.ITEMS[raw].v),
        'B354-6-CONTROL: ' + raw + ' is raw and vendorPrice bids full book value — the discount is not being '
        + 'applied at all, so "the quote equals the payment" would only prove they are both wrong');

      G.lockedItems = {};
      G.inventory = {}; G.inventory[raw] = 40;
      G.gold = 0;
      let native = 0;
      window.confirm = function () { native++; return true; };
      const q = CM.quoteJunk(1e9);
      /* The quote the PLAYER is shown, from the same value the payment uses —
         so "the dialog lied about it" cannot come back through the wording. */
      const quoted = Number(String(CM._quoteText(q)).replace(/,/g, '').match(/for (\d+) gold/)[1]);
      assert(quoted === q.totalGold, 'the sentence shown to the player (' + quoted + ') is not the quote ('
        + q.totalGold + ') — the dialog and the payment are two numbers again');
      const returned = CM.settleJunk(q);
      assert(native === 0, 'the sweep raised a NATIVE confirm() — it blocks the renderer main thread (b371/b373)');
      assert(q.ids.length > 0, 'the sweep selected nothing, so there is no quote to compare against');
      assert(G.gold === quoted,
        'THE SWEEP QUOTED ' + quoted + ' GOLD AND PAID ' + G.gold + '. It totalled with vendorPrice() and '
        + 'paid ITEMS[id].v — the undiscounted book value — so every raw material sold through this button '
        + 'minted 5x, silently, and the dialog lied about it. legacy.js\'s own rule: "A price that differs '
        + 'by which button you pressed is not a price."');
      assert(returned === quoted, 'sellJunk() reported ' + returned + ' and paid ' + G.gold);
      assert(!G.inventory[raw], 'the sweep paid but did not take the items');
    } finally {
      window.confirm = save.confirm;
      restoreG(snap);
    }
  }),

  () => tryRunAsync('B354-7/8: a purchase names an OFFER and a sale names an ITEM — and neither names a price', async () => {
    const A = window.HearthriseAccrual;
    const Gd = window.HearthriseGold;
    const G = window.G;
    const realFetch = window.fetch;
    const wasOn = A.isServerAccrualEnabled();
    const wasAck = A.isReplacementAcknowledged();
    const snap = snapshotG();   /* gold/inventory/skills/lockedItems are all named by the allowlist now */
    let ver = 40;
    let sent = [];
    const envelope = (gold) => {
      const skills = {}; for (const k of Object.keys(G.skills || {})) skills[k] = { xp: G.skills[k] };
      return { ok: true, version: ++ver, now: Date.now(),
        state: { gold, active_kind: 'idle', active_id: null, accrued_to: null },
        skills, inventory: Object.assign({}, G.inventory) };
    };
    try {
      A.setServerAccrualEnabled(true);
      A.acknowledgeReplacement(true);
      Gd.resetGold();
      Gd.configureGold({ url: 'https://probe.supabase.co', apiKey: 'anon', authToken: () => 'jwt' });
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        sent.push(JSON.parse(init.body));
        /* The server's answer is DELIBERATELY not the client's arithmetic. */
        return Promise.resolve(new Response(JSON.stringify(envelope(777777)), { status: 200 }));
      };

      // ── B354-7: the shop button. The offer id is DERIVED, never typed.
      const idx = Gd.shopOfferIndex();
      assert(idx.iron_sword && idx.iron_sword.offer === 'equip.iron_sword',
        'the item→offer index does not resolve iron_sword (' + JSON.stringify(idx.iron_sword) + '). It is '
        + 'derived from src/data/shops.js so a new shop row is sellable the moment the generator runs — a '
        + 'broken index means every purchase answers `no_offer` and silently stops reaching the server');
      G.gold = 100000; G.inventory = {}; sent = []; stampBalanceLikeLoad(G);
      window.buyShopItem('iron_sword', 1, idx.iron_sword.gold);
      await drain();
      assert(sent.length === 1 && sent[0].verb === 'shop_buy',
        'the shop button sent ' + JSON.stringify(sent));
      assert(sent[0].offer === 'equip.iron_sword' && sent[0].qty === 1,
        'the purchase named ' + JSON.stringify({ offer: sent[0].offer, qty: sent[0].qty })
        + ' — it must name the catalogue OFFER and a count of offers, never an item and a price');
      for (const forbidden of ['price', 'cost', 'gold', 'unit', 'total']) {
        assert(!(forbidden in sent[0]),
          'the purchase body carries `' + forbidden + '`. The moment the client can name a VALUE, the '
          + 'economy is forgeable from devtools again.');
      }
      assert(G.gold === 777777,
        'the purchase left gold at ' + G.gold + ' instead of the server\'s 777777 — the envelope is applied '
        + 'ABSOLUTELY, so whatever the client charged itself is superseded');

      /* A PRICE THE SHOP AND THE CATALOGUE DISAGREE ABOUT IS NOT SENT. The
         server would charge its own number anyway, so this cannot cost money —
         it costs CONFIDENCE, and a button that says 500 while the balance drops
         by 2,000 is indistinguishable from theft. */
      G.gold = 100000; sent = []; stampBalanceLikeLoad(G);
      window.buyShopItem('iron_sword', 1, 7);
      await drain();
      assert(sent.length === 0,
        'a purchase whose client price (7) disagrees with the catalogue was still sent: ' + JSON.stringify(sent));
      assert(Gd.getGoldState().last.reason === 'price_mismatch',
        'the mismatched purchase was refused as `' + Gd.getGoldState().last.reason + '` — it must be refused '
        + 'BY NAME so the drift is legible instead of looking like a dead network');

      // ── B354-8: the bag's Sell 1.
      G.gold = 500; G.lockedItems = {}; G.inventory = { normal_log: 4 }; sent = [];
      window.invSellOne('normal_log');
      await drain();
      assert(sent.length === 1 && sent[0].verb === 'vendor_sell' && sent[0].item === 'normal_log' && sent[0].qty === 1,
        'the Sell 1 button sent ' + JSON.stringify(sent));
      for (const forbidden of ['price', 'unit', 'gold', 'total', 'value']) {
        assert(!(forbidden in sent[0]),
          'the sale body carries `' + forbidden + '` — the vendor bid is computed server-side from the '
          + 'item\'s own book value and the client never names it');
      }
      assert(G.gold === 777777, 'the sale left gold at ' + G.gold + ' instead of the server\'s 777777');

      /* b377 REGRESSION — SELL A BIG STACK, GET PAID FOR ALL OF IT. `vendor_sell`
         prices ≤MAX_QTY (1,000) per call; the old Sell All sent ONE oversized
         intent whose local `qty_out_of_range` refusal rolled back the WHOLE gold
         prediction — Tyler sold 4,600 iron platebodies and received nothing while
         the stack vanished. It must now SPLIT into ceil(qty/MAX_QTY) intents,
         each ≤MAX_QTY, so every chunk has a server story and pays for itself. */
      const bigQty = Gd.MAX_QTY * 4 + 137;               // 4,137 — a Tyler-sized stack
      const wantChunks = Math.ceil(bigQty / Gd.MAX_QTY); // 5
      G.gold = 500; G.inventory = { normal_log: bigQty }; sent = [];
      window.invSellAll('normal_log');
      await drain();
      assert(sent.length === wantChunks,
        'selling a ' + bigQty + ' stack sent ' + sent.length + ' intents, expected ' + wantChunks
        + ' chunks of ≤' + Gd.MAX_QTY + ' — an oversized single intent is refused and pays nothing: '
        + JSON.stringify(sent.map((s) => s.qty)));
      assert(sent.every((s) => s.verb === 'vendor_sell' && s.item === 'normal_log' && s.qty >= 1 && s.qty <= Gd.MAX_QTY),
        'a chunk exceeded the per-intent bound or named the wrong verb/item: ' + JSON.stringify(sent));
      assert(sent.reduce((n, s) => n + s.qty, 0) === bigQty,
        'the chunks summed to ' + sent.reduce((n, s) => n + s.qty, 0) + ', not the whole ' + bigQty + '-stack');
      assert(Gd.getGoldState().last.reason !== 'qty_out_of_range',
        'the big sell still refused locally as qty_out_of_range instead of chunking: '
        + JSON.stringify(Gd.getGoldState().last));
      assert(G.gold === 777777,
        'the chunked sale left gold at ' + G.gold + ' instead of the server\'s absolute 777777 — '
        + 'the old single-intent refusal rolled the whole prediction back to leave the player with nothing');
    } finally {
      window.fetch = realFetch;
      Gd.resetGold(); Gd.configureGold(null);
      A.acknowledgeReplacement(wasAck);
      restoreAccrualSwitch(wasOn);
      restoreG(snap);
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b355 — THE MARKET GESTURE. THE FIRST VALUE THAT CROSSES TO ANOTHER PLAYER.

     Everything above moves value between a player and the HOUSE: a shop, a
     vendor, a daily reward. `market_buy` is the first gesture in this client
     whose gold lands on somebody else's row, and the client's half of it has to
     satisfy the same either/or as the rest — the gold moves EITHER by the
     server's number OR not at all — plus one property the others do not have:
     THE BUY NAMES NO PRICE. The seller named it once, about their own goods,
     and from that moment it is server state.

     One test, three arms: the wire, the either/or, and the rollback.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRunAsync('B355-1/2/3: a market buy names a listing and a count, moves the SERVER\'s gold once, and a refusal reverses it exactly', async () => {
    const A = window.HearthriseAccrual;
    const Gd = window.HearthriseGold;
    const M = window.HearthriseMarket;
    const G = window.G;
    assert(Gd && typeof Gd.buyMarketListing === 'function',
      'src/net/gold.js carries no market transport — the whole market seam is absent');
    assert(M && typeof M.buyListing === 'function', 'src/market.js did not load');

    const realFetch = window.fetch;
    const wasOn = A.isServerAccrualEnabled();
    const wasAck = A.isReplacementAcknowledged();
    const save = { gold: G.gold, gems: G.gems,
      skills: JSON.parse(JSON.stringify(G.skills)), inventory: JSON.parse(JSON.stringify(G.inventory)) };
    const savedListings = localStorage.getItem('hearthrise:market:listings');
    let ver = 400;
    let sent = [];

    /* A LISTING WITH A SERVER-SHAPED ID. The client may only name a listing the
       server knows, so a locally-created 'L…' row deliberately gets no key and
       no intent — asserted in the third arm. */
    const LID = '11111111-2222-4333-8444-555555555555';
    const seedListing = (askEach, qty) => {
      localStorage.setItem('hearthrise:market:listings', JSON.stringify([{
        id: LID, sellerId: 'someone-else', sellerName: 'Someone Else',
        itemId: 'normal_log', qty: qty, askEach: askEach, postedAt: Date.now(),
      }]));
    };
    const envelope = (gold, extra) => {
      const skills = {}; for (const k of Object.keys(G.skills || {})) skills[k] = { xp: G.skills[k] };
      return Object.assign({
        ok: true, verb: 'market_buy', version: ++ver, now: Date.now(),
        state: { gold: gold, gems: G.gems, active_kind: 'idle', active_id: null, accrued_to: null },
        skills, inventory: Object.assign({}, G.inventory),
      }, extra || {});
    };

    try {
      A.setServerAccrualEnabled(true);
      A.acknowledgeReplacement(true);
      Gd.resetGold();
      Gd.configureGold({ url: 'https://probe.supabase.co', apiKey: 'anon', authToken: () => 'jwt' });

      // ── B355-1: THE WIRE. A listing and a count, and NOTHING that is a price.
      seedListing(10, 5);
      G.gold = 1000; G.inventory = {}; sent = []; stampBalanceLikeLoad(G);
      /* The server charges a number the client never guessed, so an additive
         client would land on 1000 - 40 + (something) and only the ABSOLUTE rule
         produces exactly this. */
      const SERVER_GOLD = 424242;
      window.fetch = function (u, init) {
        const s = String(u);
        if (!/hr-accrue/.test(s)) return realFetch.apply(this, arguments);
        sent.push(JSON.parse(init.body));
        return Promise.resolve(new Response(JSON.stringify(envelope(SERVER_GOLD, {
          bought: { listing_id: LID, item_id: 'normal_log', qty: 4, each: 10,
            gold_gross: 40, tax: 0, seller_name: 'Someone Else' },
        })), { status: 200 }));
      };
      const r1 = M.buyListing(LID, 4);
      assert(r1 && r1.ok === true, 'the market buy refused locally: ' + JSON.stringify(r1));
      await drain();

      assert(sent.length === 1 && sent[0].verb === 'market_buy',
        'the market buy sent ' + JSON.stringify(sent) + ' — with the switch on it must send exactly '
        + 'one market_buy intent');
      assert(sent[0].listing === LID && sent[0].qty === 4,
        'the buy named ' + JSON.stringify(sent[0]) + ' instead of {listing, qty:4}');
      for (const forbidden of ['ask', 'price', 'each', 'cost', 'gold', 'total', 'unit', 'seller', 'item']) {
        assert(!(forbidden in sent[0]),
          'the market_buy body carries a `' + forbidden + '` field. The BUYER never supplies a price '
          + '— hr_market_buy reads ask_each off the listing row it locked — and the moment this wire '
          + 'can name one, a forged client value crosses into another player\'s economy');
      }

      // ── B355-2: THE EITHER/OR. The server's number, exactly once.
      assert(G.gold === SERVER_GOLD,
        'the buy left gold at ' + G.gold + ' instead of the server\'s ' + SERVER_GOLD
        + '. Either the local debit was added to the envelope (the double-pay) or the envelope was '
        + 'not applied absolutely');
      assert(Gd.getGoldState().pending.length === 0,
        'the buy left ' + Gd.getGoldState().pending.length + ' prediction(s) outstanding after its own '
        + 'envelope landed. An unretired prediction is re-added to EVERY future envelope — a '
        + 'permanent additive offset, which is the double-pay arriving through the lifecycle');

      // ── B355-3: A REFUSAL REVERSES THE PREDICTION EXACTLY, AND ONLY IT.
      /* `gone` is the honest shape of losing a race: somebody bought the last
         units first. Nothing was written server-side, so the local debit is the
         only thing that moved and it comes back — not more, not less. */
      seedListing(25, 8);
      G.gold = 5000; G.inventory = {}; sent = []; stampBalanceLikeLoad(G);
      window.fetch = function (u, init) {
        const s = String(u);
        if (!/hr-accrue/.test(s)) return realFetch.apply(this, arguments);
        sent.push(JSON.parse(init.body));
        return Promise.resolve(new Response(JSON.stringify({ ok: false, verb: 'market_buy', error: 'gone' }),
          { status: 409 }));
      };
      const r2 = M.buyListing(LID, 8);
      assert(r2 && r2.ok === true, 'the second market buy refused locally: ' + JSON.stringify(r2));
      await drain();
      assert(sent.length === 1, 'the refused buy sent ' + sent.length + ' intents, expected 1');
      assert(G.gold === 5000,
        'a refused market buy left gold at ' + G.gold + ' instead of 5000. `gone` is refused before '
        + 'anything is written, so the prediction is PROVABLY unwritten and must be reversed by '
        + 'exactly its own amount');
      assert(Gd.getGoldState().pending.length === 0,
        'the refused buy left a prediction on the books');

      /* …AND A LOCAL-ONLY LISTING SENDS NOTHING AND PREDICTS NOTHING. An 'L…'
         row has no server counterpart to name, so a key here would create an
         entry no envelope could ever retire — F1, from the market side. */
      localStorage.setItem('hearthrise:market:listings', JSON.stringify([{
        id: 'L' + Date.now(), sellerId: 'someone-else', sellerName: 'Someone Else',
        itemId: 'normal_log', qty: 3, askEach: 7, postedAt: Date.now(),
      }]));
      const localId = JSON.parse(localStorage.getItem('hearthrise:market:listings'))[0].id;
      G.gold = 900; G.inventory = {}; sent = []; stampBalanceLikeLoad(G);
      M.buyListing(localId, 3);
      await drain();
      assert(sent.length === 0,
        'a listing that exists only locally was named to the server: ' + JSON.stringify(sent));
      assert(Gd.getGoldState().pending.length === 0,
        'a local-only listing recorded a prediction nothing will ever retire');
      assert(G.gold === 900 - 21,
        'the local-only buy left gold at ' + G.gold + ' instead of ' + (900 - 21)
        + ' — with no server call the local payment IS the payment');
    } finally {
      window.fetch = realFetch;
      Gd.resetGold(); Gd.configureGold(null);
      A.acknowledgeReplacement(wasAck);
      restoreAccrualSwitch(wasOn);
      if (savedListings === null) localStorage.removeItem('hearthrise:market:listings');
      else localStorage.setItem('hearthrise:market:listings', savedListings);
      Object.assign(G, save);
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  () => tryRunAsync('B355-4: the client-authored buy-offer sub-market is INERT under the seam (Security M5/M6)', async () => {
    const A = window.HearthriseAccrual;
    const M = window.HearthriseMarket;
    const G = window.G;
    assert(M && typeof M.placeBuyOffer === 'function', 'src/market.js buy-offer API is absent');

    const save = { gold: G.gold };
    const savedOffers = localStorage.getItem('hearthrise:market:offers');
    const savedListings = localStorage.getItem('hearthrise:market:listings');
    try {
      /* EVERY buy-offer gesture is refused BEFORE it moves gold. The bug this
         guards: placeBuyOffer/cancelBuyOffer escrow and refund with a bare
         `G.gold -=` / `+=` that NO server verb reconciles, so under the
         absolute envelope they would be silently refunded/minted at the next
         envelope. Inert = the gesture is refused and gold is UNCHANGED. */
      G.gold = 100000;
      stampBalanceLikeLoad(G);   // armed: prove inertness comes from the SEAM flag, not a fail-closed read
      G.inventory = { normal_log: 0 };
      localStorage.setItem('hearthrise:market:offers', JSON.stringify([]));

      const before = G.gold;
      const p = M.placeBuyOffer('normal_log', 5, 100);
      assert(p && p.ok === false,
        'placeBuyOffer succeeded under the seam: ' + JSON.stringify(p) + ' — the buy-offer sub-market '
        + 'has no server model, so escrowing gold here is a value the next envelope silently refunds');
      assert(G.gold === before,
        'placeBuyOffer moved gold (' + before + ' -> ' + G.gold + ') under the seam before being '
        + 'refused — it must not touch the balance at all');
      assert(M.listOffers().length === 0, 'placeBuyOffer wrote an offer row under the seam');

      /* A pre-existing local offer cannot be cancelled for a refund under the
         seam (that would mint gold the server never saw leave). */
      localStorage.setItem('hearthrise:market:offers', JSON.stringify([{
        id: 'O-stale', buyerId: (M.list, 'anyone'), buyerName: 'x', itemId: 'normal_log',
        qty: 2, maxEach: 50, postedAt: Date.now(), escrowed: 100,
      }]));
      const c = M.cancelBuyOffer('O-stale');
      assert(c && c.ok === false && G.gold === before,
        'cancelBuyOffer refunded escrow under the seam (gold ' + before + ' -> ' + G.gold + ') — that '
        + 'is a mint of gold the server never saw leave');

      /* b515: the second half of this test drove the SWITCH-OFF position and
         asserted the sub-market still worked there — "the gating must be the
         flag, not a removal of the feature". The b353 switch is retired, so that
         position is gone and the refusal above is now unconditional. That is a
         REAL PRODUCT GAP and it is named rather than tested away: the buy-offer
         sub-market is OFF for every player until a server verb exists, exactly
         as the theme/cosmetic gem purchases are (see HANDOFFS.md, "the GEM
         PURCHASE VERB"). What this test still holds is the property that
         matters while it is off — the refusal costs the player NOTHING.

         The refusal must also be HONEST rather than silent, because a button
         that does nothing is how a player concludes their gold vanished. */
      assert(typeof p.reason === 'string' && p.reason.length > 0,
        'placeBuyOffer refused without a reason the UI can say out loud: ' + JSON.stringify(p));
    } finally {
      if (savedOffers === null) localStorage.removeItem('hearthrise:market:offers');
      else localStorage.setItem('hearthrise:market:offers', savedOffers);
      if (savedListings === null) localStorage.removeItem('hearthrise:market:listings');
      else localStorage.setItem('hearthrise:market:listings', savedListings);
      Object.assign(G, save);
      try { window.saveLocal(); } catch (e) {}
    }
  }),
];
