// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/clan-seat-and-front-door.js — the Clan Seat, clan governance, the quest counters and the sign-up door.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 72 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, stampBalanceLikeLoad, stampRecordLikeLoad, withFarmServer, withClaimServer, xpOf, predZero, xpZero, goldOf, snapshotG, restoreG, restoreGAndRecord, TYPE_FLOOR, typeHandoffOwner, typeTokenPx, TYPE_OWNED_SHEETS, on, snapshot, decideRestore, decideSessionEvent, stubSignedIn, drain } from './_harness.js?v=589';


export default [





  // #10e: SEAM 2 — the timed-buff scaling choke-point the Tavern's Hearth needs
  // (+40% duration / +20% strength at Tavern 10). Default must be exactly
  // identity, or every food in the game silently changes length today.
  () => tryRun('b222 SEAM 2: buff duration/magnitude scaler — identity by default, both axes when stubbed', () => {
    assert(typeof window.registerBuffScaler === 'function', 'registerBuffScaler seam missing');
    assert(typeof window.buffScaleFor === 'function', 'buffScaleFor missing');
    const G = window.G;
    const saved = JSON.parse(JSON.stringify(G.buffs || []));
    try {
      // Default: 1.0 × 1.0, and applyBuff stores exactly what it was given.
      const d = window.buffScaleFor({ type: 'all_xp' });
      assert(d.duration === 1 && d.magnitude === 1, 'default scale must be identity, got ' + JSON.stringify(d));
      G.buffs = [];
      window.applyBuff({ type: 'all_xp', magnitude: 10, durationMs: 60000 });
      let b = G.buffs.find((x) => x.type === 'all_xp');
      assert(b && b.remainingMs === 60000 && b.magnitude === 10,
        'unscaled buff drifted: ' + JSON.stringify(b));

      // A stubbed Tavern-10 Hearth: +40% duration, +20% strength.
      window.registerBuffScaler('__test_hearth', () => ({ duration: 1.4, magnitude: 1.2 }));
      G.buffs = [];
      window.applyBuff({ type: 'all_xp', magnitude: 10, durationMs: 60000 });
      b = G.buffs.find((x) => x.type === 'all_xp');
      assert(b.remainingMs === 84000, 'duration multiplier not applied: ' + b.remainingMs);
      assert(Math.abs(b.magnitude - 12) < 1e-9, 'magnitude multiplier not applied: ' + b.magnitude);
      /* A SECOND HELPING IS A SECOND SEGMENT, AND IT MUST ALSO BE SCALED.
         2026-09-13: applyBuff no longer folds the helping into the existing row
         (`remainingMs += dur; magnitude = max(old,new)`) — that merge laundered a
         Feast's magnitude onto a cheap food, so the game-designer replaced it with
         contiguous per-segment entries, each carrying its own magnitude. What this
         arm is protecting is unchanged and is the reason the b222 seam exists: the
         scaler must reach the SECOND helping too, which is exactly where a
         "multiply at the call site" fix would have leaked. So the assertion moved
         from "the row now reads 168000" to "the queue's TAIL ends at 168000", which
         is the same 84000 + 84000 stated against the new shape. */
      window.applyBuff({ type: 'all_xp', magnitude: 10, durationMs: 60000 });
      const segs = G.buffs.filter((x) => x.type === 'all_xp');
      assert(segs.length === 2, 'a second helping must queue a second SEGMENT, not merge: ' + JSON.stringify(segs));
      const tail = Math.max.apply(null, segs.map((x) => x.remainingMs));
      assert(tail === 168000, 'stacking a second buff ignored the scaler: ' + tail);
      assert(segs.every((x) => Math.abs(x.magnitude - 12) < 1e-9),
        'every segment must carry its own SCALED magnitude: ' + JSON.stringify(segs));
      b = segs[0];

      // Registration is idempotent by NAME — a boot retry cannot compound.
      window.registerBuffScaler('__test_hearth', () => ({ duration: 1.4, magnitude: 1.2 }));
      assert(window.buffScaleFor({}).duration === 1.4, 're-registering the same name compounded the multiplier');
      // A throwing scaler must not break buff application.
      window.registerBuffScaler('__test_throws', () => { throw new Error('boom'); });
      assert(window.buffScaleFor({}).duration === 1.4, 'a throwing scaler must be ignored, not fatal');
    } finally {
      window.unregisterBuffScaler('__test_hearth');
      window.unregisterBuffScaler('__test_throws');
      window.G.buffs = saved;
    }
    assert(window.buffScaleFor({}).duration === 1 && window.buffScaleFor({}).magnitude === 1,
      'unregister must restore identity — the seam is inert until the Tavern exists');
  }),

  // #10f: SEAM 3 — the Rested XP bank, consumed by the XP grant path.
  () => tryRun('b228 SEAM 3: a Rested charge is a flat XP QUANTUM, spent exactly once per grant', () => {
    /* b228 respec (bonus-rebase.md §5.3). Rested used to be a percentage
       potency multiplying one XP grant per charge — inert at +20% and provably
       worth single-digit XP at the rebased scale. It is now a flat quantum, so
       this test measures XP DELTA rather than a multiplier, and pins the two
       properties that actually protect the bank: one charge per grant, and
       nothing spent when the quantum is zero. */
    const snap = snapshotG();
    const origQ = window.restedQuantum;
    try {
      // Level 99 woodcutting so no level-up fires mid-measurement.
      window.G.skills.woodcutting = 12000000;
      const xpNow = () => xpOf('woodcutting');   // b455: display read (server + prediction)

      // Inert: charges banked, but neither road is built, so nothing is spent.
      window.restedQuantum = () => 0;
      window.G.restedXp = 3;
      const before = xpNow();
      window.addXp('woodcutting', 1000);
      const plain = xpNow() - before;
      assert(window.G.restedXp === 3, 'a charge was burned for no benefit — the seam is not inert');

      // A quantum of 1,600: exactly one charge is spent, and the grant is
      // larger by EXACTLY the quantum — a flat grant no perk may scale.
      window.restedQuantum = () => 1600;
      const b2 = xpNow();
      window.addXp('woodcutting', 1000);
      const rested = xpNow() - b2;
      assert(window.G.restedXp === 2, 'exactly one charge must be spent per grant, bank is ' + window.G.restedXp);
      assert(rested === plain + 1600,
        'a charge must add exactly its quantum, not a multiple of it: ' + rested + ' vs ' + (plain + 1600));
      // Draining the bank must stop the bonus, not go negative.
      window.G.restedXp = 1;
      window.addXp('woodcutting', 10);
      window.addXp('woodcutting', 10);
      assert(window.G.restedXp === 0, 'the bank must floor at 0, got ' + window.G.restedXp);
      // A zero grant must not consume a charge.
      window.G.restedXp = 1;
      window.addXp('woodcutting', 0);
      assert(window.G.restedXp === 1, 'a 0-XP grant must not burn a rested charge');
    } finally {
      window.restedQuantum = origQ;
      restoreG(snap);
    }
  }),


  // #10g: SEAM 3, THE ONE THAT MATTERS. b214 shipped offline rewards paid two
  // and three times per login because processOffline and two catch-up systems
  // all read the same unrefreshed G.lastSeen. Rested XP accrues on exactly that
  // path, so it is watermarked instead: G.restedAt is the instant already paid
  // for, and it advances by what was granted. Re-running cannot re-pay.
  () => tryRun('b222 SEAM 3: rested accrual is watermarked — no offline double-bank', () => {
    /* b515 — DRIVEN ON `src/core/rested.js`, WHICH IS BOTH SIDES. The old
       fixture called `window.accrueRestedXp()` and `window.processOffline()` on
       the live G. Neither can bank now, and for two different reasons that are
       both correct: `restedXp`/`restedAt` are SERVER-OF-RECORD and ARMED, so
       legacy.js's wrapper fails closed on its first line
       (`clientMayWriteRecordField('restedXp')`), and the away engine that used
       to call it is deleted. The BANKING is the accrual engine's
       (`accrual.js accrueRested`), and it runs THIS function.

       So the watermark rule is asserted on the shared implementation, with a
       plain state — which also removes the fixture's old dependence on whatever
       `G.restedAt` the previous test left behind. The client-side REFUSAL is
       asserted at the end, because "the client may not bank" is the other half
       of "there is exactly one banker". */
    const C = window.HearthriseCore;
    const R = C.rested;
    const CHARGE = window.RESTED_CHARGE_MS;
    const CAP = window.RESTED_CAP;
    assert(CHARGE === 360000 && CAP === 80, 'rested constants drifted: ' + CHARGE + ' / ' + CAP);
    assert(R.RESTED_CHARGE_MS === CHARGE && R.RESTED_CAP === CAP,
      'the window constants and the core constants disagree — two copies of a rate is how they drift');

    const now = Date.UTC(2026, 0, 16, 6, 0, 0);
    /* THE PLAIN CAP, not `C.restedLibraryCap()`. That helper reads the Great
       Library rung off `G.rooms`, which is SERVER-OF-RECORD and reads UNKNOWN
       (0) in a harness with no envelope — and `restedCap(0)` correctly falls
       back to RESTED_CAP, so passing it here would work by accident today and
       silently measure the LIBRARY cap on any run where a previous test left a
       rooms stamp behind. Stated, so the fixture is a fixture. */
    const cap = R.restedCap(0);
    assert(cap === CAP, 'the default rested cap is not ' + CAP + ', got ' + cap);

    // One hour away = 10 charges, banked ONCE. The watermark is the whole rule.
    const st = { restedXp: 0, restedAt: now - 60 * 60000 };
    const first = R.accrueRestedXp(st, now, cap);
    assert(first === 10 && st.restedXp === 10, 'one hour should bank 10 charges, got ' + first);
    assert(R.accrueRestedXp(st, now, cap) === 0 && st.restedXp === 10, 'the second read re-banked charges');
    assert(R.accrueRestedXp(st, now, cap) === 0 && st.restedXp === 10, 'the third read re-banked charges');

    /* THE b214 SHAPE, EXACTLY: a STALE `lastSeen` re-read by a second caller.
       The rested watermark is a DIFFERENT clock, so it cannot be fooled by it —
       which is the property, and it is why `restedAt` exists at all. */
    const st2 = { restedXp: 0, restedAt: now - 30 * 60000, lastSeen: now - 30 * 60000 };
    const a = R.accrueRestedXp(st2, now, cap);
    const b = R.accrueRestedXp(st2, now, cap);      // lastSeen deliberately not refreshed
    assert(a === 5, 'thirty minutes should bank 5 charges, got ' + a);
    assert(b === 0 && st2.restedXp === 5, 'a stale lastSeen re-banked the same half hour: +' + b);

    // The cap is hard, and a capped bank must not leave the watermark behind —
    // otherwise spending one charge would instantly re-bank it.
    const st3 = { restedXp: 0, restedAt: now - 30 * 24 * 3600000 };
    R.accrueRestedXp(st3, now, cap);
    assert(st3.restedXp === cap, 'a month away must cap at ' + cap + ', got ' + st3.restedXp);
    assert(st3.restedAt <= now, 'the watermark must never run ahead of now');
    assert(R.accrueRestedXp(st3, now, cap) === 0, 'a capped bank must not keep accruing');

    // A fresh save must not be handed a bank it never earned.
    const st4 = {};
    R.accrueRestedXp(st4, now, cap);
    assert(st4.restedXp === 0, 'a save with no watermark must start empty, got ' + st4.restedXp);
    // A future-dated watermark (clock skew, edited save) must self-heal.
    const st5 = { restedXp: 0, restedAt: now + 9e8 };
    R.accrueRestedXp(st5, now, cap);
    assert(st5.restedAt <= now && st5.restedXp === 0, 'a future watermark must be repaired');

    /* AND THE CLIENT IS NOT THE BANKER. Under the armed record the wrapper must
       refuse rather than write a second copy of a server-owned bank — the b347
       two-writers rule, at the one call site that used to do it.
       MUTATION: drop the `clientMayWriteRecordField('restedXp')` guard from
       legacy.js accrueRestedXp → red here. */
    if (typeof window.accrueRestedXp === 'function' && !window.clientMayWriteRecordField('restedXp')) {
      const snap = snapshotG();
      try {
        window.G.restedXp = 0;
        window.G.restedAt = Date.now() - 3600000;
        assert(window.accrueRestedXp(Date.now()) === 0 && (window.G.restedXp || 0) === 0,
          'the CLIENT banked rested charges for a field the server owns — applyRecord is the only writer, '
          + 'and a second one strands the server\'s copy');
      } finally { restoreGAndRecord(snap); }
    }
  }),

  // #10h: SEAM 3 — the fragile manual save allowlist. A bank that does not
  // survive a cloud restore is not a bank, and a restored save with a fresh
  // watermark would re-bank the same hours: both fields or neither.
  () => tryRun('b222 SEAM 3: restedXp + restedAt are in the cloud-save allowlist and round-trip', () => {
    const snap = snapshotG();
    try {
      const E = window.HearthriseEvents;
      assert(E && typeof E.snapshot === 'function', 'HearthriseEvents.snapshot missing');
      window.G.restedXp = 17;
      window.G.restedAt = 1234567890000;
      const s = E.snapshot(window.G);
      assert(s.restedXp === 17, 'restedXp missing from the save snapshot');
      assert(s.restedAt === 1234567890000, 'restedAt missing from the save snapshot');
      // Round-trip through the same Object.assign the cloud restore uses.
      window.G.restedXp = 0; window.G.restedAt = 0;
      Object.assign(window.G, JSON.parse(JSON.stringify(s)));
      assert(window.G.restedXp === 17 && window.G.restedAt === 1234567890000,
        'the bank did not survive a save/restore round-trip');
    } finally { restoreG(snap); }
  }),


  // #10j: the farming `watered` dual-write is gone from every writer. b220
  // mirrored it purely so a rollback to b219 read a sane value; two builds have
  // shipped since. A field written by four code paths and read by one migration
  // is state waiting to be trusted by accident.
  () => tryRun('b222: the farming `watered` dual-write is deleted from every writer', () => withFarmServer(
    (verb, args) => (verb === 'farmPlant'
      ? { ok: true, plot: args[0], crop: args[1], planted_at: new Date().toISOString(), seed_spent: 'turnip_seed', plant_xp: 28 }
      : { ok: true, plot: args[0], crop: 'turnip', watered_at: new Date().toISOString(), water_xp: 7 }),
    () => {
      /* b514: the writers are now the OPTIMISTIC prediction in farmSyncPlant and
         reconcileFarmResult. Both must still write waterings[] and neither may
         resurrect the `watered` mirror. */
      const snap = snapshotG();
      try {
        window.G.farmPlots = window.G.farmPlots || [];
        // plantCrop
        window.G.inventory.turnip_seed = (window.G.inventory.turnip_seed || 0) + 2;
        /* The pre-flight counts what the SERVER holds (gateItemCount), so a fixture
           that wants the plant SENT states a server bag too. */
        window.G._serverBag = Object.assign({}, window.G._serverBag, { turnip_seed: 2 });
        window.G.farmPlots[0] = null;
        window.plantCrop(0, 'turnip');
        const planted = window.G.farmPlots[0];
        assert(planted && Array.isArray(planted.waterings), 'plantCrop must write waterings[]');
        assert(!('watered' in planted), 'plantCrop still writes the `watered` mirror');
        // waterPlot
        planted.plantedAt = Date.now() - 3600000;
        window.waterPlot(0);
        assert(window.G.farmPlots[0].waterings.length === 1, 'waterPlot must record a watering');
        assert(!('watered' in window.G.farmPlots[0]), 'waterPlot still writes the `watered` mirror');
        // The one surviving READER — the legacy-save conversion — must stay.
        const legacy = { cropId: 'turnip', plantedAt: 1000, watered: true };
        window.HearthriseFarm.normalizePlot(legacy);
        assert(legacy.waterings.length === 1 && legacy.waterings[0] === 1000,
          'the legacy watered→waterings conversion was removed — old saves would stall');
      } finally { restoreG(snap); }
    })),






















  // b223 P1: the three b215 endgame crops (farming 62/75/88) were absent from
  // every plot-tier unlock list, so `canPlantCrop()` hard-refused them even at
  // MAX plot level — farming's last 37 levels had nothing new to plant, and
  // Emberfruit/Moonbloom cooking recipes were unreachable. Guard: every crop
  // in CROPS is plantable at max plot level, and the endgame three sit at
  // exactly the tiers the fix placed them.
  () => tryRun('b223: every crop in CROPS is plantable at max plot level', () => {
    const F = window.HearthriseFarm;
    const map = (F && F.getTierMap) ? F.getTierMap() : null;
    assert(map, 'farm-progression tier map not exposed');
    const maxUnlocks = map[map.length - 1].unlocks;
    const missing = Object.keys(window.CROPS || {}).filter(id => maxUnlocks.indexOf(id) === -1);
    assert(missing.length === 0, 'crops unplantable at MAX plot level: ' + missing.join(', '));
    assert(map[4].unlocks.indexOf('goldenroot') !== -1, 'goldenroot must unlock at plot Lv 4');
    assert(map[5].unlocks.indexOf('emberfruit') !== -1 && map[5].unlocks.indexOf('moonbloom') !== -1,
      'emberfruit + moonbloom must unlock at plot Lv 5');
  }),


  // ── b224 regression suite — THE ACCOUNT WALL ────────────────────────────
  // Product ruling 2026-08-08: accounts are REQUIRED, there is no account-less
  // play. That is enforced client-side (see src/net/account-gate.js — it is
  // UX enforcement of an online-only product, NOT a security boundary; the
  // server already owns the economy). This suite itself runs THROUGH the one
  // deliberate bypass, so the tests below assert the PURE decision rather than
  // the rendered outcome — otherwise the harness would be marking its own
  // homework.

  // #1 The wall exists. A clean boot — no harness flag, no cached session —
  // must be walled. This is the test that would fail if someone ever "fixed"
  // the gate by defaulting it open.
  () => tryRun('b224: a clean boot with no session and no harness flag is WALLED', () => {
    const gate = window.HearthriseGate;
    assert(gate && typeof gate.decide === 'function', 'HearthriseGate.decide missing — the wall is gone');
    const clean = gate.decide({ harness: false, session: null });
    assert(clean.open === false, 'a clean boot must be closed, got ' + JSON.stringify(clean));
    assert(clean.reason === 'wall', 'the closed reason must be "wall", got ' + clean.reason);
    // An empty object is not a session either — a truthy blob must not open it.
    assert(gate.decide({ harness: false, session: {} }).open === false,
      'an empty session object must not open the gate');
    assert(gate.decide({ harness: false, session: { access_token: '' } }).open === false,
      'a blank access token must not open the gate');
  }),

  // #2 A real session opens it — including an EXPIRED access token that still
  // has a refresh token. Walling a returning player mid-refresh would be the
  // "hard eject" the ruling explicitly forbids.
  () => tryRun('b224: a usable session opens the gate; an expired-but-refreshable one still does', () => {
    const gate = window.HearthriseGate;
    const future = Math.floor(Date.now() / 1000) + 3600;
    const past = Math.floor(Date.now() / 1000) - 3600;
    assert(gate.decide({ session: { access_token: 'a', expires_at: future } }).open === true,
      'a live access token must open the gate');
    assert(gate.decide({ session: { access_token: 'a', expires_at: past } }).open === false,
      'an expired token with NO refresh token is not a session');
    assert(gate.decide({ session: { access_token: 'a', expires_at: past, refresh_token: 'r' } }).open === true,
      'an expired token WITH a refresh token must not wall a returning player');
    assert(gate.decide({ session: { access_token: 'a', expires_at: future } }).reason === 'session',
      'the open reason must name the session');
  }),

  // #3 THE SEAM CANNOT LEAK. The bypass is (explicit global) AND (not a host
  // real players use). If either half ever became sufficient on its own, a
  // production player could be handed an account-less game.
  () => tryRun('b224: the test-harness bypass is inert on the hosts real players use', () => {
    const gate = window.HearthriseGate;
    assert(Array.isArray(gate.PLAYER_HOSTS) && gate.PLAYER_HOSTS.length >= 2,
      'the player-origin list is missing');
    // Probing the leak guard deliberately trips its console.error (which is
    // correct — a real leak must be loud). Muffle it for the probe only, and
    // assert it FIRED, so the alarm is tested rather than merely tolerated.
    const realErr = console.error;
    let alarms = 0;
    console.error = () => { alarms++; };
    try {
      ['hearthrise.net', 'www.hearthrise.net', 'bugsquisher1.github.io'].forEach((h) => {
        assert(gate.isPlayerOrigin(h), h + ' must be treated as a player origin');
        assert(gate.isHarnessContext({ __HR_TEST_HARNESS__: true }, h) === false,
          'the harness flag must be IGNORED on ' + h + ' — that is the production leak');
      });
      assert(alarms === 3, 'a leaked harness flag must log loudly on every player origin, saw ' + alarms);
      ['localhost', '127.0.0.1', ''].forEach((h) => {
        assert(gate.isPlayerOrigin(h) === false, h + ' must not be a player origin');
        assert(gate.isHarnessContext({ __HR_TEST_HARNESS__: true }, h) === true,
          'the harness flag must work on the dev origin ' + h);
      });
      assert(alarms === 3, 'the dev origins must not raise the leak alarm');
    } finally {
      console.error = realErr;
    }
    // The flag alone, without being set, opens nothing anywhere.
    assert(gate.isHarnessContext({}, 'localhost') === false, 'an unset flag must never count as the harness');
    assert(gate.isHarnessContext({ __HR_TEST_HARNESS__: 'true' }, 'localhost') === false,
      'the flag is === true only — a truthy string must not pass');
  }),

  // #4 The seam is the thing that let THIS run in. Either the harness flag or
  // a real session — never a third way, and never a wall the suite tunnelled
  // through some other route.
  () => tryRun('b224: this suite is running through the declared seam, not around the wall', () => {
    const gate = window.HearthriseGate;
    assert(gate.isOpen() === true, 'the suite cannot run behind a closed gate');
    const why = gate.openReason();
    assert(why === 'harness' || why === 'session',
      'the gate opened for an unrecognised reason: ' + why);
    if (why === 'harness') {
      assert(window.__HR_TEST_HARNESS__ === true, 'harness reason without the harness flag');
      assert(gate.isPlayerOrigin(location.hostname) === false,
        'the harness opened the gate on a PLAYER origin — the bypass has leaked');
    }
  }),

  // #5 The wall itself: a real sign-in surface, not a shrug. Built detached so
  // the assertion costs the running suite nothing.
  () => tryRun('b224: the wall renders a real account surface — email, password, both modes, no emoji', () => {
    const gate = window.HearthriseGate;
    const ui = gate._buildGate({});
    try {
      const root = ui.root;
      assert(root.querySelector('form'), 'the wall must be a real form (Enter must submit)');
      assert(ui.email && ui.email.type === 'email', 'no email field');
      assert(ui.pass && ui.pass.type === 'password', 'no password field');
      assert(ui.email.autocomplete === 'email', 'password managers need autocomplete="email"');
      const modes = [...root.querySelectorAll('.hr-gate-mode')].map((b) => b.textContent);
      assert(modes.indexOf('Create account') !== -1 && modes.indexOf('Sign in') !== -1,
        'the wall must offer BOTH create-account and sign-in: ' + modes.join('/'));
      /* b361: the lockup is now the two approved brand assets, not type + an
         inline SVG. The wordmark IS the word, so its alt carries it — that is
         what a screen reader reads, and asserting the alt is asserting the
         thing that actually reaches a player. */
      const gword = root.querySelector('img.hr-gate-word');
      assert(gword && gword.alt === 'Hearthrise', 'the wordmark is missing');
      assert(/hearthrise-wordmark\.svg/.test(gword.getAttribute('src') || ''),
        'the wordmark must be the approved brand asset');
      const gcrest = root.querySelector('.hr-gate-mark img.hr-gate-crest');
      assert(gcrest && /hearthrise-crest\.png/.test(gcrest.getAttribute('src') || ''),
        'the crest is missing');
      // No escape hatch: an account-less way past the front door would make
      // the whole ruling decorative.
      const words = root.textContent.toLowerCase();
      ['continue offline', 'play offline', 'skip', 'maybe later', 'without an account'].forEach((s) => {
        assert(words.indexOf(s) === -1, 'the wall must offer no account-less escape, found: ' + s);
      });
      // Project rule: zero emoji as art, anywhere.
      const emoji = root.textContent.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu);
      assert(!emoji, 'the wall renders emoji: ' + (emoji || []).join(' '));
      // Forge & Stone means tokens, not literals, for the surface colours.
      const style = document.getElementById('hr-account-gate-style');
      assert(style, 'the wall injected no stylesheet');
      /* b361: --f-display was the old CSS wordmark's face and left with it.
         The token that replaced it in importance is the SCRIM — the wall now
         sits on a painting, and the scrim is the only thing keeping the type
         legible on it. Both scene-scrim roles are dark in cozy-light too,
         which is why this is a token and not a literal. */
      assert(/var\(--bg-card/.test(style.textContent) && /var\(--line/.test(style.textContent) &&
             /var\(--scene-scrim-2/.test(style.textContent),
        'the wall must draw its surface, lines and scrim from theme tokens');
    } finally {
      if (ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
    }
  }),

  // #6 The re-prompt is a SHEET, not a second wall. A token that lapses
  // mid-session must never eject a player from a game they are playing.
  () => tryRun('b224: a lapsed session re-prompts beside a running game and can be deferred', () => {
    const gate = window.HearthriseGate;
    const ui = gate._buildGate({ reauth: true });
    try {
      assert(ui.root.classList.contains('reauth'), 'the re-prompt must render in its sheet form');
      assert(ui.root.id !== 'hr-account-gate', 'the re-prompt must not masquerade as the front-door wall');
      assert(ui.later, 'the re-prompt must be deferrable — no hard eject');
      assert(/not now/i.test(ui.later.textContent) && !/offline/i.test(ui.later.textContent),
        'the defer action must defer without promising offline play: ' + ui.later.textContent);
      assert(gate.isOpen() === true, 'building a re-prompt must never close the gate');
    } finally {
      if (ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
    }
  }),

  /* ═══════════════════════════════════════════════════════════════════════
     b46x — THE OPEN BETA, ASSERTED AT THE FRONT DOOR

     The product went from "you need a code" to "make an account and play", and
     that is a change to the ONE screen every player meets before anything else
     exists. Four things have to be true at once, and only one of them is
     visible in the markup:

       O1  the code is not on the screen, and one line reveals it
       O2  a codeless signup REACHES signUp — and reaches it carrying NOTHING
           where the code would be. `null`, not `{}`, not `{invite_code:''}`:
           the server gate distinguishes absent from blank, and a blank string
           is the shape that would pass every DOM assertion and still be wrong.
       O3  a code that IS given still travels, and is still pre-checked
       O3b what the player is told when the account exists. Until b50x this
           test asserted the DEAD END — "Confirm the link in your email, then
           sign in" — as production-correct, which made removing the measured
           beta-2 funnel bug look like a regression. It now asserts the
           replacement contract and forbids the old sentence.
       O4  the refusal copy is honest during the switch-over window, when the
           client is codeless-optional and the server gate is still armed

     O2/O3 drive the REAL submit handler through the exported `_wire` seam with
     `HearthriseAuth` stubbed, and read what left. A test that only inspected
     the DOM would pass against every one of the wrong payloads above.
     ═══════════════════════════════════════════════════════════════════════ */

  // O1 — the code is collapsed, and the disclosure actually discloses.
  () => tryRun('b46x OPEN-1 (W0): the wall shows no invite code at all, and a link-borne code still reveals the field', () => {
    const gate = window.HearthriseGate;
    const ui = gate._buildGate({});
    try {
      assert(ui.invite, 'the invite field must still EXIST — codes already handed out have to keep working');
      assert(ui.getMode() === 'signup', 'the front door must open on Create account');
      assert(ui.invite.__row.style.display === 'none',
        'the invite field must be HIDDEN by default: a visible one reads as a closed door however it is labelled');
      assert(ui.invite.required !== true, 'the invite field must not be required');
      assert(ui.inviteReveal && ui.inviteAside, 'the disclosure that reveals the code is missing');
      assert(ui.inviteAside.style.display === 'none',
        'W0: Early Access has no invite codes — the "Have an invite code?" line must not show');
      assert(!/invite code/i.test(ui.lead.textContent), 'the wall still talks about invite codes');
      // A real disclosure, not a div that toggles.
      assert(ui.inviteReveal.getAttribute('aria-expanded') === 'false',
        'the disclosure must report its collapsed state to assistive tech');
      assert(ui.inviteReveal.getAttribute('aria-controls') === ui.invite.id,
        'the disclosure must name the region it opens');
      assert(ui.inviteReveal.type === 'button',
        'a submit-typed disclosure would fire the signup instead of revealing the field');

      ui.inviteReveal.click();
      assert(ui.invite.__row.style.display !== 'none', 'the link did not reveal the field');
      assert(ui.inviteAside.style.display === 'none', 'the link must step aside once the field is showing');
      assert(ui.inviteReveal.getAttribute('aria-expanded') === 'true', 'aria-expanded did not follow the reveal');
      assert(ui.inviteShown() === true, 'the published state disagrees with the DOM');

      // Sign in has no business showing either half.
      [...ui.root.querySelectorAll('.hr-gate-mode')].filter((b) => /sign in/i.test(b.textContent))[0].click();
      assert(ui.invite.__row.style.display === 'none', 'the invite field must not follow the player to Sign in');
      assert(ui.inviteAside.style.display === 'none', 'the disclosure must not follow the player to Sign in');
    } finally {
      if (ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
    }
  }),

  // O1b — the copy (W0): Early Access, not open beta; the Discord link stays as the help door.
  () => tryRun('b46x OPEN-2 (W0): the wall says Early Access, invites the player in, and keeps a Discord help link', () => {
    const gate = window.HearthriseGate;
    const ui = gate._buildGate({});
    try {
      const text = ui.root.textContent;
      assert(/early access/i.test(ui.lead.textContent), 'the wall must say Early Access: ' + ui.lead.textContent.slice(0, 220));
      assert(!/\bbeta\b/i.test(ui.lead.textContent), 'the wall still says beta: ' + ui.lead.textContent.slice(0, 220));
      assert(!/tell us in/i.test(ui.lead.textContent), 'the beta-era "tell us in Discord" line is back');
      assert(/make an account/i.test(ui.lead.textContent),
        'the wall must tell the player what to do, not just what state the game is in');
      const dc = [...ui.root.querySelectorAll('a[href*="discord.gg"]')];
      assert(dc.length >= 1, 'a player who cannot sign in must still have the Discord door to click');
      dc.forEach((a) => {
        assert(a.href.indexOf('discord.gg/eJrUSUJM3M') !== -1, 'wrong Discord invite: ' + a.href);
        assert(a.rel === 'noopener', 'a target=_blank link without rel=noopener is a tabnabbing hole');
      });
      // The b224 rule survives the copy change: still no account-less escape.
      const words = text.toLowerCase();
      ['continue offline', 'play offline', 'without an account'].forEach((s) => {
        assert(words.indexOf(s) === -1, 'the Early Access copy re-opened an account-less escape: ' + s);
      });
    } finally {
      if (ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
    }
  }),

  /* O2 + O3 — WHAT LEAVES THE CLIENT.
     Both cases through one driver, because the interesting assertion is the
     DIFFERENCE between them: the same form, the same submit, and a third
     argument that is `null` in one case and an object in the other. */
  () => tryRunAsync('b46x OPEN-3: a codeless signup carries NO invite_code, and success opens the check-your-email stage', async () => {
    const gate = window.HearthriseGate;
    assert(typeof gate._wire === 'function',
      'HearthriseGate._wire is gone — the signup payload is only assertable by driving the real handler');

    const prevAuth = window.HearthriseAuth;
    const prevFetch = window.fetch;
    const prevSupa = window.HearthriseSupabase;
    const calls = [];
    const checked = [];

    window.HearthriseAuth = {
      signIn: () => Promise.reject(new Error('signIn must not be called by a create-account submit')),
      signUp: (email, password, metadata) => {
        calls.push({ email, password, metadata });
        // No session back = "confirm your email", which is the real production
        // shape with email confirmation on, and it avoids opts.onSuccess.
        return Promise.resolve({ user: { id: 'u-test' }, session: null });
      },
      isSignedIn: () => false,
      getSession: () => null,
      getClient: () => null
    };
    /* THE NETWORK is stubbed, not the pre-check. account-gate.js calls its OWN
       validateInvite(), not window.HearthriseInvite.validate — swapping the
       published seam would leave the real code path making a real request to
       production and would tell us nothing. Stubbing fetch drives the shipped
       function and lets the test SEE whether it was called at all, which is the
       whole question for the codeless case. Everything else passes through. */
    if (!(prevSupa && typeof prevSupa.getConfig === 'function' && prevSupa.getConfig())) {
      window.HearthriseSupabase = { getConfig: () => ({ url: 'https://stub.invalid', anonKey: 'stub-anon' }) };
    }
    window.fetch = function (url, opts) {
      const u = String(url || '');
      if (u.indexOf('/rest/v1/rpc/beta_invite_check') !== -1) {
        let body = {};
        try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
        checked.push(body.p_code);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
      }
      return prevFetch.apply(window, arguments);
    };

    async function submit(fill) {
      const ui = gate._buildGate({});
      gate._wire(ui, {});
      // Deliberately DETACHED: a live #hr-account-gate in the suite's document
      // is a wall over a running game, and nothing here needs layout.
      fill(ui);
      ui.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: false }));
      /* Waits on the STAGE, not on a sentence. A successful sign-up no longer
         writes a note — it moves the panel to the check-your-email stage — so a
         loop that only watched `note` would time out on the happy path and
         report the failure text it eventually found. */
      for (let i = 0; i < 80 && ui.getStage() !== 'sent'
        && !/did not work|switching over|cannot be used|recognise|already been used/i.test(ui.note.textContent); i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      return ui;
    }

    try {
      // ── the normal open-beta signup: no code anywhere near it ──
      const a = await submit((ui) => { ui.email.value = 'open@example.com'; ui.pass.value = 'hunter2!'; });
      assert(calls.length === 1,
        'a codeless signup did not reach signUp — the client is still gating on a code it no longer asks for. note=' + a.note.textContent);
      assert(calls[0].email === 'open@example.com', 'wrong email reached signUp: ' + calls[0].email);
      /* THE ASSERTION THIS WHOLE TEST EXISTS FOR. `{}` and `{invite_code:''}`
         both satisfy "no code was typed" from the DOM's point of view and both
         reach the server as something other than NULL. Only `null` makes
         auth.js take its no-metadata branch, so the GoTrue body carries no
         `data` key at all. */
      assert(calls[0].metadata === null,
        'a codeless signup must pass `null` as metadata, not ' + JSON.stringify(calls[0].metadata)
        + ' — the gate distinguishes an absent invite_code from a blank one');
      assert(checked.length === 0,
        'the invite pre-check ran for a signup with no code — that call refuses the empty string and would '
        + 'kill every ordinary open-beta signup');
      /* ── THE CONTRACT THIS TEST USED TO DEFEND, AND NOW FORBIDS ──────────
         Until b50x this asserted that a successful sign-up rendered
         "Account created. Confirm the link in your email, then sign in." — i.e.
         it PINNED the dead end as production-correct. That copy is the measured
         beta-2 email wall: the product's last words to a brand-new player were
         an instruction to leave, find us again, and authenticate a second time.
         A test that defends a funnel bug is worse than no test, because it
         makes removing the bug look like a regression.
         The contract now is a STATE with the two real recoveries on it. */
      assert(a.getStage() === 'sent',
        'a successful sign-up must open the check-your-email stage, not leave the player on a form: '
        + a.getStage() + ' / ' + a.note.textContent);
      /* Read from the SENT panel, not from root.textContent: the form's own
         nodes (the "Have an invite code?" disclosure, the sign-in help line)
         are only display:none, and textContent happily reports hidden text —
         an assertion against the whole root would be graded on copy the player
         cannot see. */
      const aText = a.sent.textContent;
      /* `!== 'none'` is NOT sufficient and this assertion is why. `.hr-gate-sent`
         is `display:none` in the sheet, so an inline `''` satisfies "not none"
         while the panel is completely invisible — measured, and caught by the
         release visual gate rather than by this suite. Pin the value that
         actually paints, and pin that the form's own lead has stepped aside. */
      assert(a.sent.style.display === 'block',
        'the check-your-email panel is not painting (inline display=' + JSON.stringify(a.sent.style.display)
        + '; an empty string falls back to the sheet’s display:none)');
      assert(a.lead.style.display === 'none',
        'the front-door pitch is still above the panel — two screens at once');
      assert(/check your email/i.test(aText) && /confirmation link/i.test(aText),
        'the panel must say what we actually did: ' + aText.slice(0, 200));
      assert(aText.indexOf('open@example.com') !== -1,
        'the panel must name the address we sent to — a typo is invisible otherwise');
      assert(!/then sign in|sign in again/i.test(aText + ' ' + a.note.textContent),
        'THE DEAD END IS BACK: the door is telling a brand-new player to go and sign in. '
        + 'This is the exact sentence the beta-2 funnel died on: ' + aText.slice(0, 200));
      assert(/resend/i.test(a.resendBtn.textContent),
        'there must be a resend on the screen: ' + a.resendBtn.textContent);
      assert(/confirm/i.test(a.confirmedBtn.textContent),
        'there must be a way through for a player whose link signed them in somewhere else: '
        + a.confirmedBtn.textContent);
      assert(!/invite code/i.test(aText),
        'the success copy credits an invite code the player never gave');

      // ── the minority path: a code IS presented, and must still work ──
      const b = await submit((ui) => {
        ui.email.value = 'coded@example.com';
        ui.pass.value = 'hunter2!';
        ui.inviteReveal.click();
        ui.invite.value = 'friend-777';
      });
      assert(calls.length === 2, 'the coded signup did not reach signUp: ' + b.note.textContent);
      assert(calls[1].metadata && calls[1].metadata.invite_code === 'FRIEND-777',
        'a presented code must travel as metadata, upper-cased: ' + JSON.stringify(calls[1].metadata));
      assert(checked.length === 1 && checked[0] === 'FRIEND-777',
        'a presented code must still be pre-checked before an account is created: ' + JSON.stringify(checked));
      assert(b.getStage() === 'sent', 'the coded signup must reach the same stage: ' + b.getStage());
      assert(/invite code is now used/i.test(b.sent.textContent),
        'a player who spent a code should be told it was spent: ' + b.sent.textContent.slice(0, 240));
    } finally {
      window.HearthriseAuth = prevAuth;
      window.fetch = prevFetch;
      window.HearthriseSupabase = prevSupa;
    }
  }),

  /* O4 — THE SWITCH-OVER WINDOW. The client goes codeless-optional on deploy;
     the server gate comes off in a separate change. In between, a codeless
     signup is refused by a trigger whose only vocabulary is HTTP 500 /
     "Database error saving new user". Telling that player their invite code is
     bad — when they never typed one — blames them for our rollout. */
  () => tryRun('b46x OPEN-4: a server still refusing codeless signups is explained honestly, not blamed on a code', () => {
    const gate = window.HearthriseGate;
    const H = gate._humaniseAuthError;
    assert(typeof H === 'function', 'the auth-error translation is no longer assertable');
    const dbErr = new Error('Database error saving new user');

    const codeless = H(dbErr, true, false);
    assert(!/invite code/i.test(codeless) || /if you have one/i.test(codeless),
      'a player who gave no code must not be told their code is bad: ' + codeless);
    assert(/not open/i.test(codeless) && /try again/i.test(codeless) && !/beta/i.test(codeless),
      'the refusal must say sign-ups are not open and offer the retry, without beta copy: ' + codeless);

    const coded = H(dbErr, true, true);
    assert(/invite code cannot be used/i.test(coded),
      'a player who DID give a code must still be told the code was refused: ' + coded);

    // Unchanged for everything else: a sign-in error is the server's sentence.
    assert(H(new Error('Invalid login credentials'), false, false) === 'Invalid login credentials',
      'sign-in errors must pass through untranslated');
    assert(H(null, true, false) === 'That did not work — try again.', 'a messageless throw still needs a sentence');
  }),

  /* ═══════════════════════════════════════════════════════════════════════
     THE SIGN-UP DOOR — the beta-2 email wall, and the mechanisms that made it.

     Measured: 11 of 49 sign-ups lost at the email wall, and every mechanism was
     still in the tree byte for byte.
       · `signUp` was called with NO `emailRedirectTo`, so the confirm link had
         no return address and GoTrue bounced it at the project's Site URL.
       · There was no resend anywhere in the client.
       · The success copy told a brand-new player to go and sign in again.
       · Every invite refusal read as one undifferentiated sentence — against
         13 `refused_unknown` for 5 redeemed.

     The RULES are pure and live in src/net/signup-door.js; tests/signup-door.mjs
     grades them against 21 planted defects, all caught. THESE tests grade the
     WIRING, in a real page, through the shipped functions: that the redirect
     actually reaches GoTrue, that the wall actually changes state, that a
     failed resend actually cannot render as success, and that a refusal
     actually names which.

     ⚠ NONE OF IT IS EVIDENCE ABOUT PRODUCTION. GoTrue silently falls back to
     the project Site URL when the redirect is not in the Auth redirect
     allowlist, so every assertion below can be green while the live confirm
     link lands nowhere. The three gates no test in this repo can read are in
     docs/design/signup-door-config-gates.md.
     ═══════════════════════════════════════════════════════════════════════ */

  // DOOR-1 — the confirm link has a return address, and it is THIS game.
  () => tryRunAsync('DOOR-1: signUp carries an emailRedirectTo that points at this game', async () => {
    const A = window.HearthriseAuth;
    assert(A && typeof A.signUpWith === 'function' && typeof A.signupRedirectTo === 'function',
      'the auth module no longer exposes the sign-up seam — the payload is only assertable by '
      + 'driving the shipped function');
    const redirect = A.signupRedirectTo();
    assert(typeof redirect === 'string' && /^https?:\/\//.test(redirect),
      'signupRedirectTo() produced no absolute URL, so signUp will send none: ' + redirect);
    assert(redirect.indexOf(location.origin) === 0,
      'the confirm link must return to the origin the player is actually on (' + location.origin
      + ') — a hard-coded host sends a github.io player to a different storage partition: ' + redirect);
    assert(!/[?#]/.test(redirect.slice(location.origin.length)),
      'the return address must carry no query and no fragment: ' + redirect);

    /* The SHIPPED sign-up, with the Supabase client injected — so this reads
       what actually left, rather than what a re-implementation would have sent. */
    const seen = [];
    const client = {
      auth: {
        signUp: (args) => { seen.push(args); return Promise.resolve({ data: { user: { id: 'u' }, session: null }, error: null }); }
      }
    };
    await A.signUpWith(client, 'door@example.com', 'hunter2!', null, redirect);
    assert(seen.length === 1, 'the shipped signUp never reached the client');
    const args = seen[0];
    assert(args.email === 'door@example.com' && args.password === 'hunter2!',
      'wrong credentials reached GoTrue: ' + JSON.stringify({ e: args.email }));
    assert(args.options && args.options.emailRedirectTo === redirect,
      'THE MEASURED BUG: no emailRedirectTo reached GoTrue, so the confirmation link falls back to '
      + 'the project Site URL and the player confirms into a dead tab. options='
      + JSON.stringify(args.options || null));

    /* ── AND NOW THE PRODUCTION CALLER, WHICH THE ABOVE DOES NOT REACH ─────
       The block above hands `redirect` to `signUpWith` itself, so it proves the
       PAYLOAD rule and nothing about whether `signUp()` — the function the wall
       actually calls — still computes and passes one. Measured: reverting
       `signUp` to `…, metadata, null)` left every assertion above green. That
       is the "assert against the real seam" trap, caught in this test's own
       first run.
       So drive `signUp()` for real, with the LIVE client's `auth.signUp`
       swapped for a recorder — the shipped caller, the shipped binding, no
       request on the wire — and restore it in the finally. */
    const client2 = (typeof A.getClient === 'function') ? A.getClient() : null;
    if (client2 && client2.auth && typeof client2.auth.signUp === 'function') {
      const realSignUp = client2.auth.signUp;
      const live = [];
      client2.auth.signUp = function (a) {
        live.push(a);
        return Promise.resolve({ data: { user: { id: 'u' }, session: null }, error: null });
      };
      try {
        await A.signUp('caller@example.com', 'hunter2!', null);
      } finally {
        client2.auth.signUp = realSignUp;
      }
      assert(live.length === 1, 'the production signUp() never reached the Supabase client');
      assert(live[0].options && typeof live[0].options.emailRedirectTo === 'string'
        && live[0].options.emailRedirectTo.indexOf(location.origin) === 0,
        'signUp() — the function the wall calls — sent no return address. The payload builder can '
        + 'be perfect and the confirm link still lands nowhere: options='
        + JSON.stringify(live[0].options || null));
      assert(!('data' in live[0].options),
        'the production codeless signup carries a `data` key: ' + JSON.stringify(live[0].options));
    } else {
      /* No live client (auth unconfigured on this page). Fall back to a SOURCE
         PIN on the one-line delegation, and say plainly that it is a pin. */
      assert(/signUpWith\(\s*supabase,\s*email,\s*password,\s*metadata,\s*signupRedirectTo\(\)\s*\)/
        .test(String(A.signUp)),
        'signUp() no longer hands the computed redirect to the shipped sign-up (source pin — no live '
        + 'client on this page to drive it behaviourally): ' + String(A.signUp).slice(0, 200));
    }
  }),

  // DOOR-2 — adding the redirect must not change what the invite gate reads.
  () => tryRun('DOOR-2: the redirect does not smuggle a `data` key into a codeless signup', () => {
    const A = window.HearthriseAuth;
    assert(typeof A.buildSignUpArgs === 'function', 'the sign-up payload rule is no longer assertable');

    const bare = A.buildSignUpArgs('a@b.c', 'pw', null, 'https://example.test/');
    assert(bare.options && bare.options.emailRedirectTo === 'https://example.test/',
      'the redirect is missing from a codeless signup: ' + JSON.stringify(bare));
    /* THE ASSERTION THIS TEST EXISTS FOR. The obvious way to add a redirect is
       `options: { data: metadata || {}, emailRedirectTo }` — and that sends
       `data: {}`, so `raw_user_meta_data->>'invite_code'` stops being SQL NULL.
       The beta invite gate distinguishes ABSENT from BLANK; this is the one
       line that keeps them distinguishable. */
    assert(!('data' in bare.options),
      'a codeless signup now carries a `data` key — the invite gate distinguishes an absent '
      + 'invite_code from a blank one and this changes its meaning underneath it: '
      + JSON.stringify(bare.options));

    const coded = A.buildSignUpArgs('a@b.c', 'pw', { invite_code: 'FRIEND-777' }, 'https://example.test/');
    assert(coded.options.data && coded.options.data.invite_code === 'FRIEND-777',
      'a presented code stopped travelling once the redirect was added: ' + JSON.stringify(coded.options));
    assert(coded.options.emailRedirectTo === 'https://example.test/', 'the coded path lost the redirect');

    // No origin worth returning to → OMIT it. GoTrue rejects the WHOLE signup
    // on a malformed redirect, so "send something" is the wrong failure mode.
    const none = A.buildSignUpArgs('a@b.c', 'pw', null, null);
    assert(!none.options,
      'with no return address the body must carry no options at all: ' + JSON.stringify(none));
  }),

  // DOOR-3 — the arrival. A player who has just confirmed is never shown a form.
  () => tryRun('DOOR-3: a player arriving from the confirmation email is never shown a sign-in form', () => {
    const gate = window.HearthriseGate;
    assert(typeof gate._applyArrival === 'function', 'the arrival path is no longer assertable');
    const ui = gate._buildGate({});
    const ui2 = gate._buildGate({});
    try {
      assert(ui.getStage() === 'form', 'the door should start on the form');
      /* STRUCTURAL, and it earned its place: "I've confirmed" wears the same
         primary-button class as the submit button so it does not need a
         duplicate of the gradient CSS, which makes DOM ORDER the thing that
         decides what `querySelector('.hr-gate-go')` returns. Built above the
         form it silently became the FIRST match, and a CTA probe read a 0x0
         rect (it lives inside a display:none panel) and reported the wall's
         primary button missing at every viewport. Anything that looks the
         obvious way — a reachability row, a visual-QA script — hits this. */
      assert(ui.root.querySelector('.hr-gate-go') === ui.go,
        'the FIRST .hr-gate-go in the wall is no longer the submit button, so every selector-based '
        + 'probe of the front door now measures a hidden element');
      gate._applyArrival(ui, { kind: 'implicit', type: 'signup', expired: false, code: '', description: '' });
      assert(ui.getStage() === 'arriving',
        'the wall showed a SIGN-IN FORM to somebody who has just confirmed their email — the dead '
        + 'end reproduced as a race instead of as copy. stage=' + ui.getStage());
      assert(ui.go.style.display === 'none' && ui.email.__row.style.display === 'none',
        'the credential form must be off the screen while the session is being completed');
      assert(/sign(ing)? you in|confirming/i.test(ui.lead.textContent),
        'the panel must say what is happening: ' + ui.lead.textContent);

      // …and an expired link is an ANSWER, with its remedy on the same screen.
      gate._wire(ui2, {});
      gate._applyArrival(ui2, {
        kind: 'error', code: 'otp_expired',
        description: 'Email link is invalid or has expired', expired: true
      });
      assert(ui2.getMode() === 'signin', 'an expired link should land the player on Sign in');
      assert(/expired|already used/i.test(ui2.note.textContent),
        'an expired confirmation link must be explained, not silently ignored: ' + ui2.note.textContent);
      assert(!/invalid or has expired/i.test(ui2.note.textContent),
        'the player must not be shown GoTrue’s developer-facing error_description verbatim');
      assert(ui2.resendAside && ui2.resendAside.style.display !== 'none',
        'the resend must be reachable from the very screen an expired link lands on — otherwise the '
        + 'only recovery lives on a panel the player can no longer reach');
    } finally {
      [ui, ui2].forEach((u) => { if (u.root.parentNode) u.root.parentNode.removeChild(u.root); });
    }
  }),

  // DOOR-4 — the resend: cooldown respected, and a failure never reads as sent.
  () => tryRunAsync('DOOR-4: the resend respects its cooldown, and a failure never renders as success', async () => {
    const gate = window.HearthriseGate;
    const prevAuth = window.HearthriseAuth;
    const calls = [];
    let answer = { data: null, error: { message: 'For security purposes, you can only request this after 44 seconds.', status: 429 } };
    window.HearthriseAuth = {
      signIn: () => Promise.reject(new Error('signIn must not be called by a resend')),
      signUp: () => Promise.reject(new Error('signUp must not be called by a resend')),
      /* Resolves with an envelope, exactly as supabase-js does. A caller that
         reads "the promise resolved" as success is the bug this test exists
         for, and a stub that REJECTED would hide it. */
      resendSignupEmail: (addr) => { calls.push(addr); return Promise.resolve(answer); },
      isSignedIn: () => false, getSession: () => null, getClient: () => null
    };
    const ui = gate._buildGate({});
    gate._wire(ui, {});
    const settle = async (pred) => { for (let i = 0; i < 120 && !pred(); i++) await new Promise((r) => setTimeout(r, 20)); };
    try {
      ui.email.value = 'resend@example.com';
      ui.setStage('sent', { email: 'resend@example.com', usedCode: false });

      // 1 · a rate-limited resend must not read as sent, and must not spend the cooldown
      ui.resendBtn.click();
      await settle(() => calls.length === 1 && !/sending/i.test(ui.note.textContent));
      assert(calls.length === 1 && calls[0] === 'resend@example.com',
        'the resend did not reach the auth layer: ' + JSON.stringify(calls));
      assert(ui.note.getAttribute('data-tone') !== 'ok' && !/^sent\b/i.test(ui.note.textContent.trim()),
        'A FAILED RESEND RENDERED AS SUCCESS. The player is now waiting for a mail that was never '
        + 'dispatched, which is strictly worse than no resend button: "' + ui.note.textContent + '"');
      assert(/wait|minute|too many/i.test(ui.note.textContent),
        'a 429 must be explained as a rate limit so "wait" is the advice: ' + ui.note.textContent);
      assert(ui.resendBtn.disabled === false,
        'a resend that never sent must not spend the cooldown — that punishes the player for our failure');

      // 2 · a real send starts the cooldown, and the RULE (not the styling) refuses the next press
      answer = { data: {}, error: null };
      ui.resendBtn.click();
      await settle(() => calls.length === 2 && /^sent/i.test(ui.note.textContent.trim()));
      assert(/^sent/i.test(ui.note.textContent.trim()), 'a clean send must say so: ' + ui.note.textContent);
      assert(ui.note.getAttribute('data-tone') === 'ok', 'a clean send is good news');
      assert(ui.resendBtn.disabled === true, 'the cooldown must disable the button');
      assert(/\d+s/.test(ui.resendBtn.textContent),
        'the button must count down rather than just looking broken: ' + ui.resendBtn.textContent);

      /* Defeat the VISUAL guard and press again. A disabled button proves the
         styling; the rule has to hold on its own, because the same cooldown is
         shared with the sign-in-mode link, which is a different element. */
      ui.resendBtn.disabled = false;
      ui.resendBtn.click();
      await new Promise((r) => setTimeout(r, 80));
      assert(calls.length === 2,
        'THE COOLDOWN WAS NOT RESPECTED — a second request went out ' + (calls.length - 2)
        + ' time(s) and the server will rate-limit the address');
      assert(/ask again in \d+s/i.test(ui.note.textContent),
        'a refused press must say when it can be retried: ' + ui.note.textContent);
    } finally {
      window.HearthriseAuth = prevAuth;
      if (ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
    }
  }),

  // DOOR-5 — a refusal states WHICH.
  () => tryRunAsync('DOOR-5: an invite refusal says which — unknown vs already used vs unreachable', async () => {
    const gate = window.HearthriseGate;
    const prevAuth = window.HearthriseAuth;
    const prevFetch = window.fetch;
    const prevSupa = window.HearthriseSupabase;
    let reply = null;              // the beta_invite_check payload of the moment
    let httpOk = true;

    window.HearthriseAuth = {
      signIn: () => Promise.reject(new Error('signIn must not be called')),
      signUp: () => { throw new Error('a refused invite code must never reach signUp'); },
      isSignedIn: () => false, getSession: () => null, getClient: () => null
    };
    if (!(prevSupa && typeof prevSupa.getConfig === 'function' && prevSupa.getConfig())) {
      window.HearthriseSupabase = { getConfig: () => ({ url: 'https://stub.invalid', anonKey: 'stub-anon' }) };
    }
    window.fetch = function (url) {
      if (String(url || '').indexOf('/rest/v1/rpc/beta_invite_check') !== -1) {
        return Promise.resolve({ ok: httpOk, status: httpOk ? 200 : 503, json: () => Promise.resolve(reply) });
      }
      return prevFetch.apply(window, arguments);
    };

    const uis = [];
    async function refuse(payload, ok) {
      reply = payload; httpOk = ok !== false;
      const ui = gate._buildGate({});
      uis.push(ui);
      gate._wire(ui, {});
      ui.email.value = 'who@example.com';
      ui.pass.value = 'hunter2!';
      ui.inviteReveal.click();
      ui.invite.value = 'friend-777';
      ui.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: false }));
      for (let i = 0; i < 120 && ui.note.getAttribute('data-tone') !== 'bad'; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      return ui.note.textContent;
    }

    try {
      // The two sentences beta_invite_check actually ships today.
      const used = await refuse({ ok: false, reason: 'Code already used.' });
      const unknown = await refuse({ ok: false, reason: 'Invalid invite code.' });
      const down = await refuse(null, false);        // HTTP failure: we could not ASK

      assert(/already been used|one account/i.test(used),
        'a spent code must be named as spent, so the player asks for a new one instead of retyping '
        + 'a correct code forever: ' + used);
      assert(/recognise|typo/i.test(unknown),
        'an unrecognised code must be named as unrecognised, so the player retypes it: ' + unknown);
      assert(/connection|could not check/i.test(down),
        'a transport failure must not be reported as a bad code — flaky wifi would tell the player '
        + 'their invite is worthless: ' + down);
      const all = [used, unknown, down];
      assert(new Set(all).size === 3,
        'two or more refusals are the SAME sentence, so the player still cannot tell which of the '
        + 'three happened even though they have three different next actions: ' + JSON.stringify(all));

      // The machine channel wins when it is present — forward-compatible with a
      // `reason_code` on beta_invite_check (additive; rules unchanged).
      assert(/already been used|one account/i.test(
        gate._inviteRefusalMessage({ ok: false, reason_code: 'refused_used', reason: 'anything at all' })),
        'a machine reason code must outrank the prose — it is the durable channel');
    } finally {
      window.HearthriseAuth = prevAuth;
      window.fetch = prevFetch;
      window.HearthriseSupabase = prevSupa;
      uis.forEach((u) => { if (u.root.parentNode) u.root.parentNode.removeChild(u.root); });
    }
  }),

  // DOOR-6 — the code arrives as a LINK; hand entry survives untouched.
  () => tryRunAsync('DOOR-6: an invite code can arrive as a link — pre-filled, checked, never left in the URL', async () => {
    const gate = window.HearthriseGate;
    const D = window.HearthriseSignupDoor;
    assert(D && typeof D.readInviteFromUrl === 'function', 'the invite-link reader is gone');
    const prevFetch = window.fetch;
    const prevSupa = window.HearthriseSupabase;
    const checked = [];
    if (!(prevSupa && typeof prevSupa.getConfig === 'function' && prevSupa.getConfig())) {
      window.HearthriseSupabase = { getConfig: () => ({ url: 'https://stub.invalid', anonKey: 'stub-anon' }) };
    }
    window.fetch = function (url, opts) {
      if (String(url || '').indexOf('/rest/v1/rpc/beta_invite_check') !== -1) {
        let body = {};
        try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
        checked.push(body.p_code);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
      }
      return prevFetch.apply(window, arguments);
    };
    const ui = gate._buildGate({});
    const ui2 = gate._buildGate({});
    try {
      await gate._applyLinkInvite(ui, { present: true, code: 'FRIEND-777', malformed: false });
      assert(ui.invite.value === 'FRIEND-777',
        'the link did not pre-fill the code — the transcription step is exactly what fails 3:1: '
        + ui.invite.value);
      assert(ui.invite.__row.style.display !== 'none', 'the field must be revealed so the player can see what will be used');
      assert(checked.length === 1 && checked[0] === 'FRIEND-777',
        'a linked code must be CHECKED at the door, before the player invests an email and a '
        + 'password: ' + JSON.stringify(checked));
      assert(/accepted/i.test(ui.note.textContent),
        'a good code should say so rather than sitting silent: ' + ui.note.textContent);
      // The link ADDS a path; it removes none.
      assert(ui.inviteReveal && ui.invite && ui.getMode() === 'signup',
        'hand entry must still be on the screen — the link is an addition, not a replacement');

      // A garbled link is malformed, which is a different thing to say than
      // "unknown code" and must not be reported as one.
      await gate._applyLinkInvite(ui2, { present: true, code: '', malformed: true });
      assert(/did not carry a usable code/i.test(ui2.note.textContent),
        'a garbled invite link must say so instead of blaming a code the player never typed: '
        + ui2.note.textContent);
      assert(checked.length === 1, 'a malformed link must not spend a check');

      // …and the code never stays where it can leak.
      assert(!/invite=/.test(D.stripInviteFromHref('https://x.test/?invite=A1&ref=discord')),
        'the code is not being stripped for history.replaceState');
      assert(!/[?&#]invite=/i.test(location.href),
        'the wall left an invite code in the address bar, where it rides out in the Referer of the '
        + 'door’s own target=_blank Discord link: ' + location.href);
    } finally {
      window.fetch = prevFetch;
      window.HearthriseSupabase = prevSupa;
      [ui, ui2].forEach((u) => { if (u.root.parentNode) u.root.parentNode.removeChild(u.root); });
    }
  }),

  /* DOOR-7 — the half `emailRedirectTo` structurally cannot reach.
     The game is played inside the itch.io iframe, whose storage is partitioned
     under the itch top-level site. A mail client opens the confirmation link in
     an ordinary top-level tab, so the session it establishes is in a DIFFERENT
     bucket and the iframe will never see it: for that player the link worked
     perfectly and the game still shows a wall. No redirect fixes that. This
     button does. */
  () => tryRunAsync('DOOR-7: "I have confirmed" turns a confirmed account into a session HERE', async () => {
    const gate = window.HearthriseGate;
    const prevAuth = window.HearthriseAuth;
    let signInAnswer = () => Promise.reject(new Error('not wired'));
    const attempts = [];
    window.HearthriseAuth = {
      signIn: (addr, pw) => { attempts.push(addr); return signInAnswer(addr, pw); },
      signUp: () => Promise.reject(new Error('signUp must not be called by the confirm retry')),
      isSignedIn: () => false, getSession: () => null, getClient: () => null
    };
    const ui = gate._buildGate({});
    let entered = 0;
    gate._wire(ui, { onSuccess: () => { entered++; } });
    const settle = async (pred) => { for (let i = 0; i < 120 && !pred(); i++) await new Promise((r) => setTimeout(r, 20)); };
    try {
      ui.email.value = 'iframe@example.com';
      ui.pass.value = 'hunter2!';
      ui.setStage('sent', { email: 'iframe@example.com', usedCode: false });

      // Not confirmed yet → an honest "not yet", never a success.
      signInAnswer = () => Promise.reject(new Error('Email not confirmed'));
      ui.confirmedBtn.click();
      await settle(() => attempts.length === 1 && !/checking/i.test(ui.note.textContent));
      assert(entered === 0, 'an unconfirmed account must not be let in');
      assert(/not confirmed yet/i.test(ui.note.textContent),
        'the player must be told the link has not been opened yet, in words they can act on: '
        + ui.note.textContent);

      // Confirmed → straight in, with no second trip to a sign-in form.
      signInAnswer = () => Promise.resolve({ session: { access_token: 't' } });
      ui.confirmedBtn.click();
      await settle(() => entered === 1);
      assert(entered === 1,
        'a confirmed account did not get in from the check-your-email panel: ' + ui.note.textContent);
      assert(attempts.length === 2 && attempts[1] === 'iframe@example.com',
        'the retry must reuse the credentials the player already typed: ' + JSON.stringify(attempts));
    } finally {
      window.HearthriseAuth = prevAuth;
      if (ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
    }
  }),

  // #7 THE SAVE-DESTROYER GUARD. Behind the wall legacy boot() never ran, so
  // `G` is the factory default — one autosave in that state would write a new
  // character straight over a beta player's save. saveLocal() must be inert.
  /* b456: driven with the blob LIVE. The account-wall gate is a rule about WHEN
     saveLocal may write; with the capstone armed it never writes at all, so the
     "resumes once the gate is open" half could not be observed and the "refuses
     while closed" half would pass for the wrong reason — the worst pair a guard
     can have. The gate still ships and is still the thing that stops a
     factory-default G being written over a real player's save at the door. */
  /* b224-SAVEGATE IS RETIRED (b515). It proved that `saveLocal()` refused to
     write while the account wall was closed — "this is how a beta player loses
     their save". `saveLocal()` no longer writes a save at ANY position: b515
     deleted the blob upsert under its capstone gate, and what remains is a
     single `G.lastSeen = Date.now()` stamp that rides the residue. There is
     nothing left for the gate to protect at this call site, and driving it
     would grade a branch that does not exist.

     The WALL itself is untouched and better covered than it was: the headless
     harness's own wall pass (tests/run-smoke.mjs, "the wall guard") boots with
     NO harness flag on a clean context and asserts the gate is up, the engine
     did not boot behind it, the console is clean AND that nothing was written
     to the player's save — which is this assertion, made about a real closed
     gate rather than a stubbed one. CAPSTONE-NOOP holds the write-nothing half. */

  // #8 ADOPTION. A beta player signing in for the first time brings a local
  // save and an empty cloud. "Adoption" is mechanically: we change nothing,
  // and sync.js uploads what is already there. The rule has exactly three
  // outcomes and none of them is a silent overwrite.
  // b300: CLOUD IS AUTHORITATIVE. The conflict rule now compares TIMESTAMPS
  // (newest wins, cloud is the store), not total level. Local is a cache/journal.
  () => tryRun('b300: save conflict resolves by freshness — newest wins, thin cloud can never roll back', () => {
    assert(typeof decideRestore === 'function', 'auth.js no longer exports the save-conflict rule');
    const T = 1_700_000_000_000;   // an arbitrary fixed "now" in ms
    // No cloud row at all — first sign-in on an account. Local is adopted.
    assert(decideRestore({ lastSeen: T, totalLevel: 742 }, null).action === 'none', 'no cloud → none/adopt local');
    assert(decideRestore({ lastSeen: T, totalLevel: 742 }, undefined).action === 'none', 'undefined cloud → none');
    // Cloud is NEWER → cloud wins (restore). This is the data-loss path the old
    // level-tie rule missed: newer cloud with equal/greater progress.
    const newer = decideRestore({ lastSeen: T, totalLevel: 700 }, { __cloudSavedAt: T + 60000, totalLevel: 710 });
    assert(newer.action === 'restore', 'a newer cloud save must win: ' + newer.action + '/' + newer.reason);
    // Local is NEWER (offline play / a failed prior sync) → keep local, never roll back.
    const localNewer = decideRestore({ lastSeen: T + 60000, totalLevel: 700 }, { __cloudSavedAt: T, totalLevel: 700 });
    assert(localNewer.action === 'adopt', 'a newer local save must be kept, not overwritten: ' + localNewer.action);
    // Dead heat → keep local (no needless reload on a same-device reopen).
    assert(decideRestore({ lastSeen: T, totalLevel: 500 }, { __cloudSavedAt: T, totalLevel: 500 }).action === 'adopt', 'a timestamp tie keeps local');
    // THIN/CORRUPT GUARD: cloud is newer but its total level is a fraction of
    // local's → it's a partial/damaged save and must NOT roll a real one back.
    const thin = decideRestore({ lastSeen: T, totalLevel: 800 }, { __cloudSavedAt: T + 99999, totalLevel: 30 });
    assert(thin.action === 'adopt', 'a newer-but-thin cloud must be refused: ' + thin.action + '/' + thin.reason);
    // Fresh device (no local save) pulling an established account → restore.
    const freshDevice = decideRestore({ lastSeen: 0, totalLevel: 0 }, { __cloudSavedAt: T, totalLevel: 640 });
    assert(freshDevice.action === 'restore', 'a fresh device must pull the account down from cloud');
    // lastSeen is the fallback freshness signal when __cloudSavedAt is absent.
    const viaLastSeen = decideRestore({ lastSeen: T, totalLevel: 400 }, { lastSeen: T + 5000, totalLevel: 420 });
    assert(viaLastSeen.action === 'restore', 'cloud.lastSeen must serve as the freshness fallback');
    // Never invent an outcome, and never restore when local is strictly newer.
    [[{lastSeen:T,totalLevel:742}, null], [{lastSeen:T+1,totalLevel:700},{__cloudSavedAt:T,totalLevel:700}],
     [{lastSeen:T,totalLevel:700},{__cloudSavedAt:T+1,totalLevel:710}], [{lastSeen:0,totalLevel:0},{}]].forEach(([loc, snap]) => {
      const a = decideRestore(loc, snap).action;
      assert(['none', 'adopt', 'restore'].indexOf(a) !== -1, 'unknown restore action: ' + a);
    });
  }),

  // #9 The first-run flows queue on the gate rather than racing it. Asserted
  // through whenOpen()'s contract, which is what every one of them now calls.
  () => tryRun('b224: whenOpen() runs immediately while open and never drops a caller', () => {
    const gate = window.HearthriseGate;
    assert(typeof gate.whenOpen === 'function', 'the deferral seam is missing');
    let ran = 0;
    gate.whenOpen(() => { ran++; });
    assert(ran === 1, 'whenOpen must run synchronously when the gate is already open');
    gate.whenOpen(null);                              // must not throw
    assert(ran === 1, 'a non-function must be ignored, not queued');
    // The modules that must be behind it are all present and gated.
    ['HearthriseCoach', 'HearthriseProfile', 'HearthriseWelcome']
      .forEach((k) => assert(k in window, 'gated module vanished: ' + k));
  }),

  // #11 Precedence, found by the b224 gate verification: the name modal used
  // to open a hair BEFORE the FTUE card finished animating in, because both
  // fired at DOMContentLoaded+600 and identity guarded on `.ftue-card.show`
  // rather than on the tour existing. A first-sign-in player met two modals
  // stacked. The guard is the tour's ROOT now.
  () => tryRun('b224: the name modal waits for the FTUE tour from the moment it BUILDS, not when it animates', () => {
    const I = window.HearthriseIdentity;
    assert(typeof I._frontDoorBusy === 'function', 'the precedence guard is not exposed');
    assert(/\.ftue-root/.test(I._FRONT_DOOR) && !/\.ftue-card/.test(I._FRONT_DOOR),
      'the guard must watch the tour root, not the animated card: ' + I._FRONT_DOOR);
    // Ambient-independent: the tour may genuinely be running during the suite
    // (a fresh headless save IS a new player), so assert what the guard MATCHES
    // rather than what the document happens to contain right now.
    const root = document.createElement('div');
    root.className = 'ftue-root';                      // built, card not yet .show
    assert(root.matches(I._FRONT_DOOR),
      'a built-but-not-shown FTUE root must match the guard — that is the whole fix');
    const shown = document.createElement('div');
    shown.className = 'ftue-card show';
    assert(!shown.matches(I._FRONT_DOOR),
      'the guard must key off the tour ROOT, not a card that may live elsewhere');
    const scrim = document.createElement('div');
    scrim.className = 'hr-id-scrim';
    assert(scrim.matches(I._FRONT_DOOR), 'an open name modal must block a second one');
    // And the live predicate agrees with the selector.
    document.body.appendChild(root);
    try { assert(I._frontDoorBusy() === true, 'the live guard ignored an FTUE root in the document'); }
    finally { root.remove(); }
  }),

  // #12 The lapsed-session sheet joins the modal queue instead of jumping it.
  () => tryRun('b224: the re-prompt refuses to stack on a front-door overlay', () => {
    const gate = window.HearthriseGate;
    const blocker = document.createElement('div');
    blocker.id = 'hr-welcome-modal';
    document.body.appendChild(blocker);
    try {
      assert(gate.promptReauth() === null, 'the re-prompt opened on top of the what\'s-new sheet');
      assert(!document.querySelector('.hr-gate.reauth'), 'a re-prompt sheet was mounted anyway');
    } finally {
      blocker.remove();
      const stray = document.querySelector('.hr-gate.reauth');
      if (stray) stray.remove();
    }
  }),

  // #10 No surface may still INVITE account-less play. The degraded code paths
  // stay (they are network resilience now) — the sales pitch does not.
  () => tryRun('b224: no chrome copy invites playing without an account', () => {
    const pill = document.getElementById('status-pill');
    assert(pill, 'status pill missing');
    const pillText = pill.textContent.toLowerCase();
    assert(pillText.indexOf('offline play') === -1,
      'the topbar pill still advertises "Offline play": ' + pill.textContent);
    assert(pillText.indexOf('sign in to sync') === -1,
      'the topbar pill still pitches sign-in as optional: ' + pill.textContent);
    // The Settings account card must not offer an offline alternative.
    const prevTab = window.activeTab;
    try {
      window.showTab('settings');
      if (typeof window.renderSettings === 'function') window.renderSettings();
      const body = document.getElementById('settings-body');
      assert(body, 'settings body missing');
      const t = body.textContent.toLowerCase();
      assert(t.indexOf("don't want an account") === -1 && t.indexOf('don’t want an account') === -1,
        'Settings still offers an account-less alternative');
      assert(t.indexOf('keep playing offline') === -1,
        'Settings still invites offline play as a mode');
    } finally {
      if (prevTab) window.showTab(prevTab);
    }
  }),

  /* ── b226 regression suite — THE NAME YOU ALREADY OWN ────────────────────
     LIVE BUG, reported by Tyler while signed in on production: "it's asking me
     to choose a name when one should already be attached to the account." His
     claim existed server-side the whole time (display_names.canonical =
     'khemphill22', claimed_at 2026-05-03 — i.e. written by section 4 of the
     unique-names migration, which BACKFILLED every existing player from
     profiles.display_name).

     b221 answered "does this account have a name?" from the LOCAL record
     alone, and that record is only ever written by a claim THIS browser
     performed. So every player whose name reached the server by any other
     route — the backfill, another device, a claim made before storage was
     cleared — was nameless as far as the client could tell, and was shown a
     first-run modal for a name they already held. The backfill makes that the
     DEFAULT for the entire existing player base, not an edge case.

     The rule these guards pin: the SERVER decides whether a player needs a
     name, and this browser never prompts from its own ignorance. */

  () => tryRun('b226: the display_names read is reduced correctly — found / none / unknown', () => {
    const R = window.HearthriseIdentity._reduceServerName;
    assert(typeof R === 'function', 'the server-name reducer is not exposed');

    // The live shape, verified against production REST on 2026-08-08.
    const found = R(200, [{ name: 'khemphill22', canonical: 'khemphill22' }]);
    assert(found.action === 'found', 'a claimed row must read as found: ' + JSON.stringify(found));
    assert(found.name === 'khemphill22' && found.canonical === 'khemphill22', 'the row must carry through verbatim');
    // A row with a display spelling but no canonical is still a claim.
    assert(R(200, [{ name: 'Sir_Bob' }]).canonical === 'sir bob', 'a missing canonical must be derived, not dropped');

    // DEFINITE "no claim" — this is the only answer that may open the modal.
    assert(R(200, []).action === 'none', 'an empty result means no claim');
    assert(R(200, [{ canonical: 'x' }]).action === 'none', 'a row with no name is not a claim');
    // No namespace at all (migration not applied) is also a definite no-claim:
    // it is exactly the pre-migration state the provisional path exists for.
    assert(R(404, null).action === 'none', 'a missing table means there are no claims yet');
    assert(R(200, { code: 'PGRST205' }).action === 'none', 'PGRST205 (unknown table) means no claims yet');

    // UNKNOWN — we could not ask. Never a prompt.
    [[500, null], [401, { message: 'nope' }], [200, null], [0, null], [503, 'gateway']].forEach(([s, j]) => {
      assert(R(s, j).action === 'unknown', 'status ' + s + ' must reduce to unknown, got ' + R(s, j).action);
    });
  }),

  () => tryRun('b226: a name the server already holds is adopted silently — no modal', () => {
    const I = window.HearthriseIdentity;
    const store = window.HearthriseStorage;
    const KEY = 'hearthrise:identity';
    const uid = '53e3c6a4-1168-47fb-a0c2-c7e6dc9a7acc';
    const before = store.get(KEY);
    const savedAuth = window.HearthriseAuth;
    const savedName = window.G && window.G.playerName;
    const savedSave = window.saveLocal;
    try {
      window.saveLocal = () => {};
      window.HearthriseAuth = Object.assign({}, savedAuth, { getSession: () => ({ user: { id: uid }, access_token: 't' }) });
      I._reset(); I._resetServerName();
      assert(!I._record().name, 'the probe must start from a record that knows nothing');

      // THE BUG: with an empty local record and no server answer yet, b221
      // said "prompt". It must now say nothing at all.
      assert(I._mustPrompt() === false,
        'the modal fired from local ignorance — this is the exact b226 report');

      I._applyServerName(uid, { action: 'found', name: 'khemphill22', canonical: 'khemphill22' });
      const rec = I._record();
      assert(rec.name === 'khemphill22', 'the server name was not adopted: ' + JSON.stringify(rec));
      assert(rec.canonical === 'khemphill22', 'the canonical form was not adopted');
      assert(rec.status === 'confirmed', 'a server-held claim is confirmed, not provisional: ' + rec.status);
      assert(rec.userId === uid, 'the adopted name must be filed under the account that owns it');
      assert(I._mustPrompt() === false, 'a player whose name the server holds must never be prompted');
      assert(I.displayName() === 'khemphill22', 'the adopted name must be what the game renders');
      assert(I.isUniqueName() === true, 'a server-held claim is a unique name');
      assert(window.G.playerName === 'khemphill22', 'the ~30 legacy call sites read G.playerName — it must be written too');
    } finally {
      window.HearthriseAuth = savedAuth;
      window.saveLocal = savedSave;
      if (window.G) window.G.playerName = savedName;
      I._reset(); I._resetServerName();
      if (before == null) store.remove(KEY); else store.set(KEY, before);
    }
  }),

  () => tryRun('b226: an account the server has no claim for IS still prompted', () => {
    const I = window.HearthriseIdentity;
    const store = window.HearthriseStorage;
    const KEY = 'hearthrise:identity';
    const uid = '00000000-0000-4000-8000-00000000beef';
    const before = store.get(KEY);
    const savedAuth = window.HearthriseAuth;
    try {
      window.HearthriseAuth = Object.assign({}, savedAuth, { getSession: () => ({ user: { id: uid }, access_token: 't' }) });
      I._reset(); I._resetServerName();

      // Pending → silence. An unreachable registry → silence. Only a definite
      // "this account holds no name" opens the modal.
      assert(I._mustPrompt() === false, 'a pending answer must not prompt');

      // …but a read still IN FLIGHT is not "no prompt is owed": it is "we have
      // not found out yet", and the other first-run flows must keep waiting or
      // they open in the gap and the name modal lands on top of them.
      const realFetch = window.fetch;
      try {
        window.fetch = () => new Promise(() => {});     // never settles
        I._resetServerName();
        I._resolveServerName();
        assert(I._serverPending() === true, 'an in-flight read must report itself pending');
        assert(I._mustPrompt() === false, 'an in-flight read must never open the modal');
        assert(I.mustPromptForName() === true, 'the welcome sheet must keep waiting while we ask');
        assert(I._SERVER_NAME_DEADLINE_MS > 0 && I._SERVER_NAME_DEADLINE_MS <= 30000,
          'the wait must be bounded, or a hung request suppresses the welcome sheet forever');
      } finally {
        window.fetch = realFetch;
        I._resetServerName();
      }
      assert(I._serverPending() === false, 'a reset must not leave a phantom pending read');

      I._applyServerName(uid, { action: 'unknown' });
      assert(I._mustPrompt() === false, 'an unreachable registry must not prompt — we do not know');
      I._applyServerName(uid, { action: 'none' });
      assert(I._mustPrompt() === true, 'a genuinely nameless account must still be asked');
      assert(I.mustPromptForName() === true, 'the public seam must agree with the internal rule');
    } finally {
      window.HearthriseAuth = savedAuth;
      I._reset(); I._resetServerName();
      if (before == null) store.remove(KEY); else store.set(KEY, before);
    }
  }),

  () => tryRun('b226: adopting the server name never discards a name the player just chose', () => {
    const S = window.HearthriseIdentity._shouldAdoptServerName;
    const uid = 'u-1';
    const found = { action: 'found', name: 'Ironvale', canonical: 'ironvale' };

    // The fix's whole point: an empty record takes the server's name.
    assert(S({ userId: null, name: '', status: null }, uid, found) === true, 'an empty record must adopt');
    assert(S(null, uid, found) === true, 'a missing record must adopt');
    // A PROVISIONAL local name is a choice the player made and reconcile() is
    // already claiming. Overwriting it would silently undo a rename.
    assert(S({ userId: uid, name: 'Bob', canonical: 'bob', status: 'provisional' }, uid, found) === false,
      'a provisional name the player chose must survive — reconcile() owns it');
    // Already in step: no write, no re-render, no churn.
    assert(S({ userId: uid, name: 'Ironvale', canonical: 'ironvale', status: 'confirmed' }, uid, found) === false,
      'an identical confirmed name must not be rewritten every session');
    // Renamed on another device: the server is the authority.
    assert(S({ userId: uid, name: 'Oldname', canonical: 'oldname', status: 'confirmed' }, uid, found) === true,
      'a rename made on another device must reach this one');
    // Only the spelling changed (claim_display_name refreshes it): still adopt.
    assert(S({ userId: uid, name: 'ironvale', canonical: 'ironvale', status: 'confirmed' }, uid, found) === true,
      'a re-spelled name must be picked up');
    // A record belonging to somebody else on this device is not a defence.
    assert(S({ userId: 'other', name: 'Someone', canonical: 'someone', status: 'confirmed' }, uid, found) === true,
      'another account\'s record must not shield this one from its own name');
    // Nothing found is never an adoption.
    assert(S({ userId: null, name: '', status: null }, uid, { action: 'none' }) === false, 'no claim, no adoption');
  }),

  () => tryRun('b226: sign-in reloads on the session being on disk, not on a stopwatch', () => {
    const gate = window.HearthriseGate;
    assert(typeof gate._whenSessionPersisted === 'function',
      'the sign-in handoff still has no seam — it is back to guessing a delay');
    // The wall reloads after sign-in because the engine never booted behind it.
    // That reload must land on a boot that finds the session, or the player
    // meets the wall a SECOND time and signs in twice. This is the predicate
    // the handoff waits on, and it is the same one the next boot's decide()
    // uses — so if it is true here, the reloaded page opens without a flash.
    const store = window.HearthriseStorage;
    const KEY = 'hearthrise:supabaseSession';
    const before = store.get(KEY);
    try {
      store.remove(KEY);
      assert(gate.sessionIsUsable(gate._readCachedSession()) === false,
        'with nothing on disk the handoff must not believe a session was persisted');
      assert(gate.decide({ harness: false, session: gate._readCachedSession() }).open === false,
        'that state is exactly the second wall the reload must never land on');
      store.set(KEY, JSON.stringify({ access_token: 'a', refresh_token: 'r', user: { id: 'u' } }));
      assert(gate.sessionIsUsable(gate._readCachedSession()) === true,
        'a persisted session must be visible to the handoff');
      assert(gate.decide({ harness: false, session: gate._readCachedSession() }).open === true,
        'the reloaded boot must open on the cached session with no wall in between');
      store.set(KEY, '{not json');
      assert(gate._readCachedSession() === null, 'a corrupt session blob must read as no session, not throw');
    } finally {
      if (before == null) store.remove(KEY); else store.set(KEY, before);
    }
  }),


  () => tryRun('b226: a transient null auth event must not evict the cached session', () => {
    assert(typeof decideSessionEvent === 'function', 'auth.js no longer exports the session-event rule');
    const live = { access_token: 'a', user: { id: 'u' } };
    // Anything carrying a session persists it, whatever the event is called.
    ['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION', 'USER_UPDATED', ''].forEach((e) => {
      assert(decideSessionEvent(e, live) === 'persist', e + ' with a session must persist it');
    });
    // Only an explicit end of the session clears the cache the account wall
    // opens on. Everything else is a blip we must not turn into a sign-out.
    assert(decideSessionEvent('SIGNED_OUT', null) === 'clear', 'an explicit sign-out must clear the cache');
    assert(decideSessionEvent('USER_DELETED', null) === 'clear', 'a deleted user must clear the cache');
    ['TOKEN_REFRESHED', 'INITIAL_SESSION', 'PASSWORD_RECOVERY', undefined].forEach((e) => {
      assert(decideSessionEvent(e, null) === 'ignore',
        String(e) + ' with no session must be IGNORED — clearing it walls a signed-in player');
    });
  }),

  // ── b225/b227 regression suite (backlog #19 — the type FLOOR + the dial) ──
  //
  // Three passes, three complaints, and the third one is the reason this block
  // now guards a dial as well as a number:
  //   b218 multiplied the ramp ~x1.13 — "still too small in a lot of places",
  //         because a multiplier leaves the BOTTOM of a ramp proportionally tiny.
  //   b225 set a FLOOR of 13.5px and moved 1,093 elements onto it — "still too
  //         small", because a measurement then showed 1,093 of 2,112 visible
  //         elements (51.8%) sitting at EXACTLY 13.5px. When half the game
  //         stands on the floor, the floor value IS the reading experience.
  //   b227 raises the floor to 14.5 and every step with it (+1, separations
  //         unchanged), and — the actual fix — makes text size a PLAYER
  //         setting instead of a number only a build can change.
  //
  // The contract:
  //   19a  the token ramp holds its floor and its ordering
  //   19b  no stylesheet declares a reading size below the floor
  //   19c  nothing in the RENDERED document draws below the floor — the guard
  //        b218 needed, because inline style= and `font:` shorthand never
  //        touch a token
  //   19d  every font-size the project owns is authored in the scalable form,
  //        so the dial can actually reach it
  //   19e  the dial itself: moves a real computed size, clamps, and persists

  // b227 (#19a): the ramp's bottom step is the floor, and the tiers above it
  // keep their separation. Raising --t-body is NOT the fix and must not be the
  // way a future pass satisfies this test.
  () => tryRun('b227: the type ramp holds its floor (micro 14.5 / small 16 / body 17)', () => {
    // The dial multiplies the whole ramp, so the ramp is only pinned at 100%.
    const S = window.HearthriseUIScale;
    const restore = S ? S.get() : null;
    try {
      if (S) S.apply(100);
      const micro = typeTokenPx('--t-micro'), small = typeTokenPx('--t-small');
      const body = typeTokenPx('--t-body'), h3 = typeTokenPx('--t-h3');
      assert(micro >= TYPE_FLOOR, '--t-micro is ' + micro + 'px — below the ' + TYPE_FLOOR + 'px reading floor');
      assert(small >= 16, '--t-small is ' + small + 'px — secondary reading text must be >= 16px');
      assert(body >= 17, '--t-body is ' + body + 'px — the base must not regress');
      // Small caps have no ascenders and a cap-height near the regular face's
      // x-height, so the SC section label needs a size ABOVE its nominal tier.
      assert(h3 >= small, '--t-h3 (' + h3 + 'px) is below --t-small (' + small + 'px) — the small-caps face renders smaller than its nominal size, so it may not sit under the tier it labels');
      assert(micro < small && small <= body, 'the ramp lost its ordering: micro ' + micro + ' / small ' + small + ' / body ' + body);
    } finally { if (S && restore != null) S.apply(restore); }
  }),

  // b225 (#19b): no stylesheet may declare a reading size under the floor.
  // Same-origin sheets only — a cross-origin sheet throws on .cssRules and is
  // not ours to police. Font sizes used to size a GLYPH (icon hosts) are the
  // documented exception and are matched by selector, not waved through.
  () => tryRun('b227: no stylesheet rule sets a font-size below the 14.5px floor', () => {
    const FLOOR = TYPE_FLOOR;
    const offenders = [];
    // NOTE: check `rule.style` BEFORE recursing. Chromium's nested-CSS support
    // gives every CSSStyleRule a `cssRules` list, and an EMPTY CSSRuleList is
    // truthy — a `if (rule.cssRules) { recurse; continue; }` first branch skips
    // every style rule in the document and makes this test pass vacuously.
    const scan = (rules, sheetHref) => {
      for (const rule of rules) {
        if (rule.cssRules && rule.cssRules.length) scan(rule.cssRules, sheetHref);
        if (!rule.style || !rule.selectorText) continue;
        const raw = (rule.style.getPropertyValue('font-size') || '').trim();
        // Two authored forms carry a literal size: the bare `14.5px` a sweep
        // has not reached yet, and b227's scalable `calc(14.5px * var(...))`.
        // Reading only the first form would let `calc(9px * var(--ui-scale))`
        // sail straight past the floor.
        const m = /^([0-9]+(?:\.[0-9]+)?)px$/.exec(raw)
               || /^calc\(\s*([0-9]+(?:\.[0-9]+)?)px\s*\*/.exec(raw);
        if (!m) continue;
        const v = parseFloat(m[1]);
        if (v >= FLOOR) continue;
        // Pending handoffs (see TYPE_PENDING_HANDOFF). Only two of the four
        // held files author STYLESHEET rules — the other two write inline
        // style= attributes, which no sheet scan can see and which 19c
        // catches instead. Both discriminators below are exact:
        //   • room-modal.css is a whole sheet: the room/hrcs rules that left
        //     clan-seat.css in the 2026-10-14 demolition, pending their sweep;
        //   • home-dashboard.js injects every rule under the literal prefix
        //     `#panel-profile #<root> `, so its namespace cannot be spoofed
        //     by an unrelated rule that merely mentions "hd-".
        if (sheetHref && /room-modal\.css/.test(sheetHref)) continue;
        if (/#panel-profile\s+#hd-/.test(rule.selectorText)) continue;
        // `font-size:0` is not small type — it is the glyph-suppression idiom:
        // an element that carries an emoji/text fallback in its markup and an
        // image or SVG as its real content collapses the fallback to nothing.
        // Seven rules use it (skill icons, monster/fighter portraits, the
        // activity-bar icon, the raw-bundle image guard). Nobody reads them.
        if (v === 0) continue;
        offenders.push((sheetHref || 'inline').replace(/^.*\//, '') + ' — ' + rule.selectorText.slice(0, 90) + ' @ ' + v + 'px');
      }
    };
    for (const sheet of document.styleSheets) {
      let rules = null;
      try { rules = sheet.cssRules; } catch (e) { continue; } // cross-origin
      if (!rules) continue;
      scan(rules, sheet.href);
    }
    assert(offenders.length === 0,
      offenders.length + ' rule(s) below the ' + FLOOR + 'px floor: ' + offenders.slice(0, 6).join(' | '));
  }),

  // b225 (#19c): the floor as a PLAYER sees it. Walks every element that owns
  // visible text in the live document — chrome, sidebar, topbar and whatever
  // panel is active — and fails on anything rendering under the floor. This is
  // the guard that would have caught b218's blind spot: inline `style=` and
  // `font:` shorthand never touched a token.
  () => tryRun('b227: nothing in the rendered document draws text below the floor', () => {
    const FLOOR = TYPE_FLOOR;
    const bad = [];
    const pending = {};
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('#hr-smoke-overlay')) continue;      // the test overlay itself
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || el.ownerSVGElement) continue;
      let own = '';
      for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
      own = own.replace(/\s+/g, ' ').trim();
      if (!own) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const px = parseFloat(cs.fontSize);
      if (px >= FLOOR) continue;
      // A file another agent held during b227's wave. Counted, not ignored:
      // if a handoff lands and the count does not drop, that shows up here.
      const owner = typeHandoffOwner(el);
      if (owner) { pending[owner] = (pending[owner] || 0) + 1; continue; }
      bad.push(tag + (el.id ? '#' + el.id : '') +
        (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '') +
        ' @ ' + px + 'px "' + own.slice(0, 24) + '"');
    }
    assert(bad.length === 0,
      bad.length + ' rendered element(s) below the ' + FLOOR + 'px floor: ' + bad.slice(0, 6).join(' | ')
      + (Object.keys(pending).length ? ' | (pending handoffs, not counted: ' + JSON.stringify(pending) + ')' : ''));
  }),

  // b227 (#19d): the dial must be able to REACH the type. A font-size written
  // as a bare `14px` is a size no player setting can change — it is exactly
  // the shape of the bug the click-through audit found (a "UI scale" control
  // with nothing downstream of it). Every size in the five sheets this project
  // sweeps must therefore be `calc(<n>px * var(--ui-scale …))` or a --t-* token
  // (which is that calc). Sheets not yet swept are handoffs, not failures.
  () => tryRun('b227: every font-size in the owned sheets is reachable by the UI-scale dial', () => {
    const unreachable = [];
    const scan = (rules, href) => {
      for (const rule of rules) {
        if (rule.cssRules && rule.cssRules.length) scan(rule.cssRules, href);
        if (!rule.style || !rule.selectorText) continue;
        const raw = (rule.style.getPropertyValue('font-size') || '').trim();
        if (!raw) continue;
        if (/var\(\s*--ui-scale/.test(raw)) continue;       // the scalable form
        if (/var\(\s*--t-/.test(raw)) continue;             // a token, which is that form
        if (/^0(px)?$/.test(raw)) continue;                 // glyph suppression
        if (/^(inherit|initial|unset|revert|smaller|larger|100%|1em)$/.test(raw)) continue; // relative: scales with its parent
        if (/%|em$/.test(raw)) continue;                    // ditto
        unreachable.push(href.replace(/^.*\//, '') + ' — ' + rule.selectorText.slice(0, 70) + ' @ ' + raw);
      }
    };
    let sheetsSeen = 0;
    for (const sheet of document.styleSheets) {
      if (!sheet.href || !TYPE_OWNED_SHEETS.test(sheet.href)) continue;
      let rules = null;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      if (!rules) continue;
      sheetsSeen++;
      scan(rules, sheet.href);
    }
    // Guard the guard: if the href pattern ever stops matching, this test
    // would pass on zero sheets. b225 shipped a vacuous version of #19b for
    // exactly this class of reason.
    assert(sheetsSeen >= 4, 'only ' + sheetsSeen + ' owned sheet(s) were scanned — the test is not looking at the CSS');
    assert(unreachable.length === 0,
      unreachable.length + ' font-size(s) the dial cannot reach: ' + unreachable.slice(0, 6).join(' | '));
  }),

  // b227 (#19e): the dial itself. The shipped "UI scale" select wrote
  // G.settings.scale and NOTHING read it — the audit measured documentElement
  // zoom 1 -> 1 and font-size 16px -> 16px at the 150% setting. This asserts
  // the opposite: a real element's real computed size moves with the control,
  // the range clamps, and the choice survives on the storage seam.
  () => tryRun('b227: the UI-scale dial moves a real computed size, clamps, and persists', () => {
    const S = window.HearthriseUIScale;
    assert(S && typeof S.set === 'function' && typeof S.get === 'function',
      'window.HearthriseUIScale missing — the Settings dial has no controller');
    assert(S.MIN === 90 && S.MAX === 130 && S.STEP === 5 && S.DEFAULT === 100,
      'dial range changed: ' + S.MIN + '-' + S.MAX + ' step ' + S.STEP + ' default ' + S.DEFAULT);

    const before = S.get();
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:-9999px;top:-9999px;font-size:var(--t-body)';
    document.body.appendChild(probe);
    try {
      S.apply(100);
      const at100 = parseFloat(getComputedStyle(probe).fontSize);
      S.apply(130);
      const at130 = parseFloat(getComputedStyle(probe).fontSize);
      S.apply(90);
      const at90 = parseFloat(getComputedStyle(probe).fontSize);
      assert(Math.abs(at130 / at100 - 1.3) < 0.001,
        '130% gave ' + at130 + 'px against ' + at100 + 'px — ratio ' + (at130 / at100).toFixed(3));
      assert(Math.abs(at90 / at100 - 0.9) < 0.001,
        '90% gave ' + at90 + 'px against ' + at100 + 'px');

      // Out of range is clamped, not obeyed — 150% was a shipped option and
      // must not silently come back as a save value.
      assert(S.set(400, false) === S.MAX, 'a 400% request must clamp to ' + S.MAX);
      assert(S.set(10, false) === S.MIN, 'a 10% request must clamp to ' + S.MIN);
      assert(S.set(103, false) === 105, '103 must snap to the 5% step grid, got ' + S.set(103, false));

      // Persistence: through the platform seam AND onto the per-account save.
      S.set(115, true);
      const store = window.HearthriseStorage;
      assert(store && store.get(S.KEY) === '115',
        'the seam holds "' + (store && store.get(S.KEY)) + '" after setting 115%');
      assert(window.G && window.G.settings && window.G.settings.uiScale === 115,
        'G.settings.uiScale is ' + (window.G && window.G.settings && window.G.settings.uiScale) + ' — the choice will not follow the account');
      // And the dead key it replaced must not come back.
      assert(!('scale' in window.G.settings),
        'G.settings.scale is back — that is the control the audit found dead');
    } finally {
      probe.remove();
      S.set(before, true);
    }
  }),
  // ══════════════════════════════════════════════════════════════════
  // M8 SLICE 1 — THE PARTY PANEL (player actions)
  // ══════════════════════════════════════════════════════════════════

  /* PARTY-1 — THE WHOLE GESTURE, THROUGH THE REAL SCREEN.
     Not a render of a fixture: showTab opens the panel, the buttons in it are
     clicked, the form in it is submitted, and every number asserted is one the
     stubbed REALM sent. Bram's combat level 43 and his 12/74 belong to another
     account — this build has no skills, no hp and no formula that could produce
     them — so the assertions can only pass if the panel printed what came off
     the wire (CLAUDE.md §6). */








  () => tryRun('DISCORD-1: the first screen invites the player to the Discord, with the gift, in both modes', () => {
    const D = window.HearthriseDiscord;
    assert(D && /^https:\/\/discord\.gg\//.test(D.INVITE), 'HearthriseDiscord.INVITE is not published');
    const ui = window.HearthriseGate._buildGate({});
    try {
      const help = ui.root.querySelector('.hr-gate-help');
      const a = help && help.querySelector('a.hr-gate-dc');
      assert(a, 'the sign-in screen has no Discord invite link');
      assert(a.href === D.INVITE && a.rel === 'noopener' && a.target === '_blank', 'the invite link is wrong: ' + a.outerHTML);
      assert(/join the hearthrise discord/i.test(help.textContent) && /meet other players/i.test(help.textContent)
        && /gift/i.test(help.textContent), 'the invite does not say why to join: ' + help.textContent);
      [...ui.root.querySelectorAll('.hr-gate-mode')].filter((b) => /sign in/i.test(b.textContent))[0].click();
      assert(ui.root.contains(help) && help.style.display !== 'none' && help.querySelector('a.hr-gate-dc'),
        'the invite left with the Create tab');
    } finally {
      if (ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
    }
  }),

  () => tryRun('DISCORD-2: the invite row carries Join and Claim gift, and no retired first-day card draws a second one', () => {
    /* The spine (b569) retired the first-day card that used to carry the
       invite after step one; the Home rail is now its one place on Home. */
    const H = window.HearthriseHome;
    assert(H && typeof H.__firstDayHtml !== 'function', 'a first-day card is back beside the spine: it would draw a second invite');
    const row = window.HearthriseDiscord.rowHtml('home');
    assert(/data-hr-discord-gift/.test(row) && row.indexOf(window.HearthriseDiscord.INVITE) !== -1, 'the row lacks Join or Claim gift');
  }),

  () => tryRun('DISCORD-2b: Settings carries the Discord link and the Claim Discord gift button', () => {
    try {
      window.openSettings();
      const body = document.getElementById('settings-body');
      const a = body && body.querySelector('a[href="' + window.HearthriseDiscord.INVITE + '"]');
      assert(a && a.rel === 'noopener', 'Settings lost the Discord link');
      assert(body.querySelector('button[data-hr-discord-gift]'), 'Settings has no Claim Discord gift button');
    } finally {
      const m = document.getElementById('settings-modal'); if (m) m.classList.remove('show');
    }
  }),

  () => tryRun('DISCORD-3: Home shows the invite exactly once, on the rail', () => {
    window.showTab('profile'); window.HearthriseHome.render();
    const root = document.getElementById('hd-root');
    assert(root, 'Home did not render');
    if (root.querySelector('.hd-pending')) return skip('Home is waiting for the record');
    const rows = root.querySelectorAll('[data-hr-discord]');
    assert(rows.length === 1, 'Home drew the Discord invite ' + rows.length + ' times');
    const where = rows[0].getAttribute('data-hr-discord');
    assert(where === 'home', 'the invite is in the wrong place: ' + where);
  }),

  () => tryRunAsync('DISCORD-4: the gift sheet shows every server answer in words and never pays gems itself', async () => {
    const GC = window.HearthriseGoalClaim, D = window.HearthriseDiscord;
    assert(GC && typeof GC.claimDiscordGift === 'function', 'goal-claim.js has no claimDiscordGift');
    const saved = GC.claimDiscordGift, calls = [];
    let answer = null;
    GC.claimDiscordGift = (code) => { calls.push(code); return Promise.resolve(answer); };
    const gems0 = window.G.gems;
    const btn = document.createElement('button');
    btn.setAttribute('data-hr-discord-gift', '');
    document.body.appendChild(btn);
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const submit = async (code, a) => {
      answer = a;
      const s = document.getElementById('hr-dc-sheet');
      s.querySelector('.hr-dc-input').value = code;
      s.querySelector('.hr-dc-claim').disabled = false;
      s.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flush(); await flush();
      return s.querySelector('.hr-dc-status');
    };
    try {
      btn.click();
      const sheet = document.getElementById('hr-dc-sheet');
      assert(sheet && sheet.classList.contains('hr-scrim'), 'Claim gift did not open the sheet on the modal primitive');
      assert(sheet.querySelector('[data-hr-dismiss]'), 'the sheet has no dismiss control for Escape');
      let st = await submit('x!', { ok: true, gems: 50 });
      assert(calls.length === 0 && st.getAttribute('data-state') === 'wrong_code', 'a malformed code spent a server call');
      const cases = [
        [{ ok: false, error: 'wrong_code' }, 'wrong_code', /does not match/],
        [{ ok: false, error: 'code_expired' }, 'code_expired', /expired/],
        [{ ok: false, error: 'rate_limited' }, 'rate_limited', /wait a minute/i],
        [{ ok: false, error: 'rpc_missing' }, 'rpc_missing', /not open yet/],
        [{ ok: false, error: 'gift_unavailable' }, 'gift_unavailable', /not open yet/],
        [{ ok: false, error: 'network' }, 'offline', /connection/],
        [{ ok: false, error: 'already_claimed' }, 'already_claimed', /already claimed/],
      ];
      for (const [a, state, re] of cases) {
        st = await submit('hearth-abc123', a);
        assert(st.getAttribute('data-state') === state && re.test(st.textContent), state + ' read: ' + st.textContent);
      }
      assert(calls.every((c) => c === 'HEARTHABC123'), 'the code was not normalised before sending: ' + calls.join(','));
      assert(document.querySelector('#hr-dc-sheet .hr-dc-claim').disabled, 'an already-claimed account can submit again');
      st = await submit('hearth-abc123', { ok: true, gems: 37, balance: 99 });
      assert(st.getAttribute('data-state') === 'ok' && /37 gems/.test(st.textContent), 'the success line does not quote the server amount: ' + st.textContent);
      assert(window.G.gems === gems0, 'the sheet changed G.gems itself (' + gems0 + ' -> ' + window.G.gems + ')');
      sheet.querySelector('[data-hr-dismiss]').click();
      assert(!document.getElementById('hr-dc-sheet'), 'the sheet did not close');
    } finally {
      GC.claimDiscordGift = saved;
      btn.remove();
      const s = document.getElementById('hr-dc-sheet'); if (s) s.remove();
    }
  }),

  /* CLOSED MODE (2026-10-21-closed-mode.sql) — the server refuses a signed-in
     account that is not on the allowlist with HTTP 403 {code:'hr_closed'} on
     every Data-API request. The client's only job is to SAY so: the notice
     appears on exactly that refusal, on any /rest/v1/ request, and on nothing
     else. The server half (refused vs admitted) is tests/closed-rebuild.mjs. */
  () => tryRunAsync('CLOSED-1: the server\'s hr_closed refusal shows the closed screen; no other answer does', async () => {
    const C = window.HearthriseClosed;
    assert(C && C.CODE === 'hr_closed' && C.STATUS === 403, 'closed-screen.js is not loaded');
    /* The PAGE's fetch chain reaches the watcher: later scripts wrap fetch
       around it, so the proof is a real request counted on the way back. */
    const seen0 = C.observed();
    await window.fetch('index.html?closed-probe=1', { cache: 'no-store' }).catch(() => null);
    assert(C.observed() > seen0, 'a page request never reached the closed-screen watcher');
    const base = 'https://nezapsylztqbbwuwembx.supabase.co';
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const answers = {
      [base + '/rest/v1/rpc/hr_load']: () => json(403, { code: 'hr_closed', message: 'Hearthrise is closed while we rebuild it.', details: null, hint: null }),
      [base + '/rest/v1/rpc/hr_heartbeat']: () => json(403, { code: '42501', message: 'permission denied' }),
      [base + '/rest/v1/rpc/hr_server_now']: () => json(200, { code: 'hr_closed' }),
      [base + '/functions/v1/hr-accrue']: () => json(403, { code: 'hr_closed' }),
    };
    const f = C.wrap((url) => Promise.resolve(answers[url]()));
    const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
    C.resetForTest();
    try {
      for (const u of [base + '/rest/v1/rpc/hr_heartbeat', base + '/rest/v1/rpc/hr_server_now', base + '/functions/v1/hr-accrue']) {
        await f(u); await settle();
        assert(!C.isShown() && !document.getElementById('hr-closed-screen'), 'the closed screen showed for ' + u);
      }
      const res = await f(base + '/rest/v1/rpc/hr_load');
      const body = await res.json();
      assert(body.code === 'hr_closed', 'the caller lost the response body to the watcher');
      await settle();
      const root = document.getElementById('hr-closed-screen');
      assert(C.isShown() && root, 'the hr_closed refusal did not show the closed screen');
      const text = root.textContent;
      assert(/closed/i.test(text) && /rebuild/i.test(text) && /back soon/i.test(text) && /discord/i.test(text), 'the copy does not say why and when: ' + text);
      const dc = root.querySelector('a[data-hr-closed-discord]');
      assert(dc && dc.href === window.HearthriseDiscord.INVITE && dc.rel === 'noopener', 'the Discord link is missing or wrong');
      assert(root.querySelector('button[data-hr-closed-signout]'), 'there is no way to sign out');
      assert(document.documentElement.hasAttribute('data-hr-closed'), 'the game behind the notice is still reachable');
    } finally {
      C.resetForTest();
    }
    assert(!document.getElementById('hr-closed-screen') && !document.documentElement.hasAttribute('data-hr-closed'),
      'the test left the closed screen up');
  }),
];
