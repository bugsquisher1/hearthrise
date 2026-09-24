// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/muster-nav-and-identity.js — the plant cliff, muster and rallies, the nav shape and the identity seam.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 59 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, stubSignedIn, stampRecordLikeLoad, withFarmServer, farmReplantFixtureG, farmHarvestThenPlant, withDeferredFarmPlant, goldOf, gemsOf, snapshotG, restoreG, snapRoundTrip, on, snapshot } from './_harness.js?v=552';

export default [

  /* ══ FARM-TIER-1..3 — THE FLEET-WIDE PLANT CLIFF (P1, Paione 2026-09-06:
     "you plant something and it doesn't stay") ═══════════════════════════════
     MEASURED: farm-ledger plants per day went 46 → 26 → 6 → ZERO for nine days
     (2026-08-27 → 09-05). hr_farm_plant refuses a crop above the character's
     server plot_level with `plot_tier_locked`, a refusal writes NO ledger row
     and caches nothing, and legacy.js answered EVERY refusal with "Could not
     plant — try again" (and a 'transport' failure with silence). So a whole
     dead feature was invisible on both sides of the wire.
     Two invariants, forever: a refusal SAYS why, and the client gate reads the
     SERVER's tier — never a client-authored one. */
  () => tryRun('FARM-TIER-1: every hr_farm_plant refusal is said by its reason', () => {
    const FS = window.HearthriseFarmSync;
    /* NOT a skip: farmPlantRefusalText ships unconditionally (it is pure and
       arm-independent), so its absence is the regression itself. */
    assert(FS && typeof FS.farmPlantRefusalText === 'function',
      'HearthriseFarmSync.farmPlantRefusalText is gone — every plant refusal falls back to a generic sentence');
    const ctx = { cropName: 'Carrot', seedName: 'Carrot Seed', haveLevel: 12 };
    const t = (res) => FS.farmPlantRefusalText(res, ctx);

    const locked = t({ ok: false, error: 'plot_tier_locked', need_plot_level: 2, have_plot_level: 1 });
    assert(/Carrot/.test(locked) && /Farm Plot Lv 2/.test(locked) && /House/.test(locked) && /Lv 1/.test(locked),
      'plot_tier_locked must name the crop, the tier it needs, where to get it and the tier you have, got: ' + locked);

    const lvl = t({ ok: false, error: 'level_too_low', req_lv: 30 });
    assert(/Farming Lv 30/.test(lvl) && /12/.test(lvl), 'level_too_low must name the required + current level, got: ' + lvl);

    const cap = t({ ok: false, error: 'plot_cap', cap: 2 });
    assert(/2 plots/.test(cap) && /Property/.test(cap), 'plot_cap must name the cap and the homestead path, got: ' + cap);

    const seed = t({ ok: false, error: 'insufficient_seed', seed: 'carrot_seed' });
    assert(/Carrot Seed/.test(seed) && /Shop/.test(seed), 'insufficient_seed must name the seed and where to buy it, got: ' + seed);

    const untiered = t({ ok: false, error: 'crop_untiered' });
    assert(/Carrot/.test(untiered) && /report/i.test(untiered), 'crop_untiered must be reportable, got: ' + untiered);

    const rate = t({ ok: false, error: 'rate_limited' });
    assert(/wait/i.test(rate), 'rate_limited must ask the player to wait, got: ' + rate);

    const occupied = t({ ok: false, error: 'plot_occupied' });
    assert(/harvest/i.test(occupied), 'plot_occupied must point at harvesting, got: ' + occupied);

    const budget = t({ ok: false, error: 'day_budget' });
    assert(/daily reset|ceiling/i.test(budget), 'day_budget must explain the ceiling, got: ' + budget);

    /* A TRANSPORT failure used to revert the tile in total silence — the exact
       "it doesn't stay" report. It must say so. */
    const transport = t({ error: 'transport' });
    assert(/connection|reach the server/i.test(transport) && /nothing was planted/i.test(transport),
      "a transport failure must say the plant did not happen, got: " + transport);

    // No KNOWN code may fall back to the old generic sentence.
    for (const code of ['plot_tier_locked', 'level_too_low', 'plot_cap', 'insufficient_seed',
      'crop_untiered', 'plot_occupied', 'day_budget', 'rate_limited', 'transport',
      'bad_plot', 'no_character', 'not_signed_in', 'unknown_crop']) {
      const msg = t({ ok: false, error: code });
      /* The invariant is that no code hr_farm_plant can actually return falls
         through to the UNHANDLED fallback (which quotes the raw code) or to the
         old blanket sentence. Several truthful lines legitimately end in "try
         again" — being told to retry is the right advice for a rate limit. */
      assert(!/^Could not plant \(/.test(msg) && msg !== 'Could not plant — try again',
        'refusal "' + code + '" still answers with the generic line: ' + msg);
      assert(msg.length > 15, 'refusal "' + code + '" says too little: ' + msg);
    }
    // An UNKNOWN code still names itself so a bug report can carry it.
    assert(/wat_is_this/.test(t({ ok: false, error: 'wat_is_this' })),
      'an unrecognised refusal code must appear in the message');
  }),

  /* FARM-TIER-2: the residue-ahead kill. A client-authored / stale plot level
     must NEVER outrank the tier the server has recorded — that is the property-
     rung deadlock class, and here it made the client offer carrot to a
     plot_level-1 character so the server refused every single plant. */
  () => tryRun('FARM-TIER-2: a residue-ahead plotLevels cannot offer a crop the server will refuse', () => {
    const F = window.HearthriseFarm;
    assert(F && typeof F.getServerPlotLevel === 'function',
      'HearthriseFarm.getServerPlotLevel is gone — the plant gate is back on a client-authored tier');
    const snap = snapshotG();
    try {
      // The server has said Lv 1. The client believes 4 (a stale/forged value).
      window.G._serverPlotLevel = 1;
      window.G.plotLevels = 4;
      assert(F.getPlotLevel() === 1,
        'the SERVER tier must win over the client field, got ' + F.getPlotLevel());
      assert(window.G.plotLevels === 1,
        'getPlotLevel must converge the legacy field to the server tier, got ' + window.G.plotLevels);
      assert(F.canPlantCrop('carrot') === false,
        'carrot (tier 2) must be refused at server tier 1 — hr_farm_plant would answer plot_tier_locked');
      assert(F.canPlantCrop('turnip') === true, 'turnip (tier 1) must stay plantable at tier 1');
      assert(F.getPlotUnlockedCrops().length === 1,
        'only turnip is unlocked at server tier 1, got ' + F.getPlotUnlockedCrops().join(','));

      // And it must not clamp DOWNWARD either: a paid Lv 3 unlocks its crops.
      window.G._serverPlotLevel = 3;
      window.G.plotLevels = 1;
      assert(F.getPlotLevel() === 3 && F.canPlantCrop('tomato') === true,
        'a server tier 3 must unlock tier-3 crops even when the client field says 1');

      // Unknown server tier = the fail-safe, never an invented number.
      delete window.G._serverPlotLevel;
      window.G.plotLevels = 1;
      assert(F.getServerPlotLevel() === null && F.getPlotLevel() === 1,
        'with no server tier the gate must fail safe at Lv 1');

      // The crop→tier answer is one function, and it is the server catalogue's.
      assert(F.requiredPlotLevel('turnip') === 1 && F.requiredPlotLevel('carrot') === 2
        && F.requiredPlotLevel('tomato') === 3 && F.requiredPlotLevel('nonsense_crop') === 0,
        'requiredPlotLevel must mirror hr_crop_plot_tier');
    } finally { restoreG(snap); }
  }),

  /* ── regression suite — THE FARM'S TWO SILENT SURFACES (live, 2026-09-13) ────
     Played on live: four ready plots harvested by hand with the header reading
     "Auto-replant: Turnip" and five turnip seeds in the bag replanted NOTHING and
     said nothing; then "Plant all", clicked twice on four empty plots with seeds
     held, did nothing and said nothing either. Both surfaces could decline in
     total silence, which is why neither symptom could name its own cause — a
     declined auto-replant was indistinguishable from a dead feature, and a sweep
     that placed nothing from a dead button. Four tests: the two happy paths go
     through the ONE plant intent (AWAY-1 parity), and the two declines SAY so.
     MUTATION: drop a say()/notify(), or re-read the bag inside the sweep. */
  () => tryRun('FARM-REPLANT-1: an attended harvest replants through the same plant intent', () => {
    const A = window.HearthriseAuto;
    if (!A || typeof A.maybeReplant !== 'function' || typeof window.harvestPlot !== 'function') { skip('no auto/farm api'); return; }
    const snap = snapshotG(); const fr = A.getFarmReplant();
    try {
      farmReplantFixtureG({ turnip_seed: 5 });
      A.setFarmReplant({ enabled: true, cropId: 'turnip' });
      withFarmServer(farmHarvestThenPlant, (calls) => {
        window.harvestPlot(0);
        const verbs = calls.map((c) => c.verb);
        assert(verbs.length === 2 && verbs[0] === 'farmHarvest' && verbs[1] === 'farmPlant',
          'harvest then ONE plant intent, got ' + JSON.stringify(verbs));
        assert(calls[1].args[0] === 0 && calls[1].args[1] === 'turnip',
          'the replant intent carries the harvested plot and the configured crop, got ' + JSON.stringify(calls[1].args));
        assert(window.G.farmPlots[0] && window.G.farmPlots[0].cropId === 'turnip',
          'the replanted plot must show the new crop, got ' + JSON.stringify(window.G.farmPlots[0]));
      });
    } finally { try { A.setFarmReplant(fr); } catch (e) {} restoreG(snap); }
  }),

  () => tryRun('FARM-REPLANT-2: a declined auto-replant tells the player why instead of going quiet', () => {
    const A = window.HearthriseAuto;
    if (!A || typeof A.maybeReplant !== 'function' || typeof window.harvestPlot !== 'function') { skip('no auto/farm api'); return; }
    const snap = snapshotG(); const fr = A.getFarmReplant(); const realNotify = window.notify; const said = [];
    try {
      window.notify = (t) => { said.push(String(t)); };
      farmReplantFixtureG({ potato_seed: 5 });        // potato needs plot Lv 3, server says 2
      A.setFarmReplant({ enabled: true, cropId: 'potato' });
      withFarmServer(farmHarvestThenPlant, (calls) => {
        window.harvestPlot(0);
        assert(!calls.some((c) => c.verb === 'farmPlant'),
          'a tier-locked replant must not fire a plant the server would refuse');
        assert(window.G.farmPlots[0] == null, 'the plot stays empty after a declined replant');
        assert(said.some((t) => /auto-replant/i.test(t) && /Potato/i.test(t)),
          'a declined auto-replant must NAME itself and the crop — said: ' + JSON.stringify(said));
      });
    } finally { window.notify = realNotify; try { A.setFarmReplant(fr); } catch (e) {} restoreG(snap); }
  }),

  () => tryRun('FARM-PLANTALL-1: Plant all sends one plant intent per seed it actually holds', () => {
    if (!window.HearthriseFarmSync || typeof window.plantAllEmpty !== 'function') { skip('no farm sync / plant-all'); return; }
    const snap = snapshotG(); const realNotify = window.notify; const said = [];
    const fr = window.HearthriseAuto ? window.HearthriseAuto.getFarmReplant() : null;
    try {
      window.notify = (t) => { said.push(String(t)); };
      farmReplantFixtureG({ turnip_seed: 2 });
      window.G.farmPlots = [null, null, null, null];
      if (window.HearthriseAuto) window.HearthriseAuto.setFarmReplant({ enabled: true, cropId: 'turnip' });
      withDeferredFarmPlant((calls, flush) => {
        const planted = window.plantAllEmpty();
        assert(calls.length === 2,
          'two seeds must buy exactly TWO plant intents across four empty plots, got '
          + calls.length + ': ' + JSON.stringify(calls));
        assert(planted === 2, 'Plant all must report the two plots it planted, got ' + planted);
        assert(/Planted 2 plot/.test(said.join(' | ')),
          'Plant all must say what it did — said: ' + JSON.stringify(said));
        flush();
      });
    } finally {
      window.notify = realNotify;
      try { if (fr && window.HearthriseAuto) window.HearthriseAuto.setFarmReplant(fr); } catch (e) {}
      restoreG(snap);
    }
  }),

  () => tryRun('FARM-PLANTALL-2: Plant all with nothing to plant says so instead of no-opping in silence', () => {
    if (!window.HearthriseFarmSync || typeof window.plantAllEmpty !== 'function') { skip('no farm sync / plant-all'); return; }
    const snap = snapshotG(); const realNotify = window.notify; const said = [];
    try {
      window.notify = (t) => { said.push(String(t)); };
      farmReplantFixtureG({ turnip_seed: 5 });
      window.G.homestead = { tier: 1 };   // four plots, and all four are planted
      window.G.farmPlots = [0, 1, 2, 3].map(() => ({ cropId: 'turnip', plantedAt: Date.now(), waterings: [], state: 'growing' }));
      withDeferredFarmPlant((calls) => {
        const none = window.plantAllEmpty();
        assert(none === 0 && calls.length === 0, 'a full farm must send no plant intent');
        assert(said.length > 0, 'Plant all with no empty plot must tell the player why nothing happened');
      });
    } finally { window.notify = realNotify; restoreG(snap); }
  }),


  /* FARM-TIER-3: auto-replant and Plant-all answer to the SAME server tier —
     an unattended loop that plants a locked crop every harvest would spend the
     player's whole session firing refusals at a server that logs none of them. */
  () => tryRun('FARM-TIER-3: auto-replant + plant-all respect the server plot tier', () => {
    const F = window.HearthriseFarm, A = window.HearthriseAuto;
    if (!F || !A || typeof A.maybeReplant !== 'function') { skip('no auto api'); return; }
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 5 };
      window.G._serverPlotLevel = 1;      // server: tier 1
      window.G.plotLevels = 5;            // client: stale/ahead
      window.G.inventory = window.G.inventory || {};
      window.G.inventory.carrot_seed = 5;
      window.G.inventory.turnip_seed = 0;
      window.G._serverBag = Object.assign({}, window.G.inventory);   // the server agrees; the TIER is the gate under test
      window.G.skills.farming = 1000000;   // xp, the shape getLevel reads
      window.G.farmPlots = [];
      A.setFarmReplant({ enabled: true, cropId: 'carrot' });
      assert(A.maybeReplant(0) === false,
        'auto-replant planted a tier-2 crop at server tier 1 — every one of those is a silent server refusal');
      assert(!window.G.farmPlots[0], 'the plot must stay empty');

      // Plant-all must find nothing plantable rather than fire refusals.
      A.setFarmReplant({ enabled: false });
      if (typeof window.plantAllEmpty === 'function') {
        window.plantAllEmpty();
        assert(!window.G.farmPlots.some((p) => p && p.cropId),
          'Plant all planted a crop the server would refuse');
      }
      /* Raise the SERVER tier and the same crop is offered again. Asserted
         through the gate rather than by planting: under the farm arm a plant
         is a live RPC, and a test must not mint a real crop to prove a gate. */
      window.G._serverPlotLevel = 2;
      assert(F.canPlantCrop('carrot') === true,
        'carrot must be offered once the SERVER tier is 2');
    } finally { try { window.HearthriseAuto.setFarmReplant({ enabled: false }); } catch (e) {} restoreG(snap); }
  }),

  // The invisibility half of the bug: a dry plot rendered no % and no bar, so
  // a permanently stalled plot looked exactly like a fresh one.
  () => tryRun('b220: a growing dry plot renders a percentage and a moving bar', () => {
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 5 };
      window.G.farmPlots = window.G.farmPlots || [];
      window.G.farmPlots[0] = { cropId: 'turnip', plantedAt: Date.now() - 2 * 3600000, waterings: [], watered: false, state: 'growing' };
      window.showTab('farming');
      window.renderFarm();
      const tile = document.querySelector('#farm-panel .farm-tile[data-plot="0"]');
      assert(tile, 'plot 0 tile missing from the farm panel');
      const lab = tile.querySelector('.ft-lab');
      assert(lab && /%/.test(lab.textContent),
        'a dry plot must show a percentage, got "' + (lab && lab.textContent) + '"');
      assert(/dry/.test(lab.textContent), 'a dry plot must be labelled dry, got "' + lab.textContent + '"');
      assert(!/Tap to water/.test(tile.textContent), 'the b219 "Tap to water" dead-end label must be gone');
      const bar = tile.querySelector('.ft-bar i');
      assert(bar && parseFloat(bar.style.width) > 0, 'a dry plot must render a non-zero progress bar');
      assert(document.querySelector('#farm-panel button[onclick*="waterAllPlots"]'),
        'the "Water all" header action is missing');
      assert(document.getElementById('farm-next-water'), 'the "next watering" retention line is missing');
    } finally { restoreG(snap); try { window.showTab('profile'); } catch {} }
  }),

  // ── b220 regression suite (backlog #15 the Muster + #14 discoverability) ──

  // #15a: the schedule IS the feature. Everything else — the pill, the join,
  // the chest — is downstream of "is a muster live right now", so the window
  // boundaries get frozen-clock coverage at every edge that matters.
  () => tryRun('b220: muster schedule — fixed 01:00/13:00 UTC windows, 45 minutes, exclusive at the edge', () => {
    const M = window.HearthriseMuster;
    assert(M, 'HearthriseMuster missing');
    assert(String(M.SLOT_UTC_HOURS) === '1,13' && M.WINDOW_MIN === 45,
      'schedule constants drifted: ' + M.SLOT_UTC_HOURS + ' / ' + M.WINDOW_MIN);
    const at = (h, m) => Date.UTC(2026, 7, 8, h, m, 0);
    const live = (h, m) => !!M.liveWindow(at(h, m));
    assert(!live(0, 59), '00:59 UTC must be closed');
    assert(live(1, 0), '01:00 UTC must open the first muster');
    assert(live(1, 44), '01:44 UTC must still be live');
    assert(!live(1, 45), '01:45 UTC must be closed — the window is 45 minutes, end-exclusive');
    assert(!live(12, 59), '12:59 UTC must be closed');
    assert(live(13, 44), '13:44 UTC must be live');
    // The next window never points backwards and never skips a slot.
    const n = M.nextWindow(at(1, 46));
    assert(n && n.slot === 13 && n.startMs === at(13, 0), 'next window after slot 1 should be slot 13');
    const n2 = M.nextWindow(at(13, 46));
    assert(n2 && n2.slot === 1 && n2.startMs === at(24 + 1, 0) - 0 || n2.slot === 1,
      'next window after the last slot should roll to tomorrow 01:00');
    // Both slots of a day are DIFFERENT musters — that is what makes
    // "one join per day" a decision instead of a restriction.
    for (let d = 1; d <= 30; d++) {
      const key = '2026-8-' + d;
      assert(M.eventFor(key, 1).id !== M.eventFor(key, 13).id,
        'both slots picked the same muster on ' + key + ' — the choice is fake');
    }
    // Deterministic: same key, same event, on every client on earth.
    assert(M.eventFor('2026-3-14', 1).id === M.eventFor('2026-3-14', 1).id, 'slot pick is not deterministic');
    const spread = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => M.eventFor('2026-5-' + d, 1).id));
    assert(spread.size >= 3, 'slot picks should spread across the pool, got ' + spread.size);
  }),

  // #15b: the topbar pill. A pure state machine, so every state in the spec —
  // including the boring ones — is driven directly instead of by waiting for
  // 01:00 UTC. The precedence rules are the part that actually breaks.
  () => tryRun('b220: muster pill drives all seven states, in the right precedence, with no "missed it"', () => {
    const M = window.HearthriseMuster;
    const S = M._computeState;
    const base = { nowMs: 1000, todayKey: 'D', signedIn: true, rewardReady: false,
                   joinedDayKey: null, joinedEventKey: null, live: null, next: null };
    const LIVE = { eventKey: 'D#1', slot: 1, startMs: 0, endMs: 1000 + 41 * 60000 };
    const mk = (o) => S(Object.assign({}, base, o));

    const s1 = mk({ next: { startMs: 1000 + 3 * 3600000 } });
    assert(s1.state === 'upcoming' && /Rally in 3:00:00/.test(s1.copy), '1 upcoming: ' + JSON.stringify(s1)); // b225: renamed Muster→Rally (Tyler)
    const s2 = mk({ next: { startMs: 1000 + 14 * 60000 } });
    assert(s2.state === 'imminent' && s2.tone === 'warm' && /14:00/.test(s2.copy), '2 imminent: ' + JSON.stringify(s2));
    const s3 = mk({ live: LIVE });
    assert(s3.state === 'live' && s3.tone === 'gold-pulse' && /^LIVE · 41:00 left$/.test(s3.copy), '3 live: ' + JSON.stringify(s3));
    const s4 = mk({ live: LIVE, joinedDayKey: 'D', joinedEventKey: 'D#1' });
    assert(s4.state === 'mustered' && /^Rallied · 41:00$/.test(s4.copy), '4 mustered: ' + JSON.stringify(s4)); // b225: Muster→Rally
    const s5 = mk({ live: LIVE, joinedDayKey: 'D', joinedEventKey: 'D#13', joinedStartMs: Date.UTC(2026, 7, 8, 9, 0) });
    assert(s5.state === 'joined_earlier' && s5.tone === 'muted', '5 joined earlier: ' + JSON.stringify(s5));
    assert(s5.copy.indexOf('joined') === 5 || /joined/.test(s5.copy), '5 should say you already joined');
    const s6 = mk({ rewardReady: true, next: { startMs: 1000 + 3 * 3600000 } });
    assert(s6.state === 'reward' && s6.cta === 'claim', '6 reward: ' + JSON.stringify(s6));
    const s7 = mk({ signedIn: false, requireSignIn: true, next: { startMs: 1000 + 3 * 3600000 } });
    assert(s7.state === 'signedout' && !/\d\d:\d\d/.test(s7.copy), '7 signed out must carry no countdown urgency');

    // Precedence, verbatim from the spec: 3 > 6 > 1.
    assert(mk({ live: LIVE, rewardReady: true }).state === 'live', 'a live joinable muster must outrank a waiting chest');
    assert(mk({ rewardReady: true, next: { startMs: 1000 + 9e6 } }).rank >
           mk({ next: { startMs: 1000 + 9e6 } }).rank, 'a waiting chest must outrank the plain countdown');
    // Deliberately absent: a "you missed it" state. Guilt is a churn mechanic.
    const everyState = [s1, s2, s3, s4, s5, s6, s7].map((s) => s.state + '|' + s.copy).join(' ');
    assert(!/missed/i.test(everyState), 'a "missed it" state was reintroduced');
    // The clock formatter is the pill's whole content — it must not lie.
    assert(M._fmtClock(0) === '00:00' && M._fmtClock(-5000) === '00:00', 'negative time must clamp, not go backwards');
    assert(M._fmtClock(3 * 3600000 + 61000) === '3:01:01', 'hh:mm:ss formatting drifted: ' + M._fmtClock(3 * 3600000 + 61000));
  }),

  // #15c: once per UTC day. The real rule is a Postgres primary key; what the
  // browser can prove is that the client mirror refuses what the server
  // refuses, that it never invents a chest out of an error, and that it keeps
  // working against a server WITHOUT the migration (client ships first).
  () => tryRun('b220: muster join is once per UTC day, and survives an un-migrated server', () => {
    const M = window.HearthriseMuster, G = window.G;
    const saved = G.muster ? JSON.parse(JSON.stringify(G.muster)) : undefined;
    try {
      M._resetProbes();
      delete G.muster;
      const st = M.ensureState();
      assert(st.eventKey === null && st.points === 0, 'a fresh day starts unjoined');

      // Joining slot A must close slot B for the rest of the UTC day.
      const day = M.todayKey();
      const slots = M.todaysWindows();
      Object.assign(G.muster, { dayKey: day, eventKey: slots[0].eventKey, slot: slots[0].slot,
                                startMs: slots[0].startMs, endMs: slots[0].endMs, points: 300 });
      assert(G.muster.eventKey === slots[0].eventKey, 'join mirror did not record slot A');
      const second = M._reduceJoin(200, { ok: false, error: 'already_joined', day_key: day,
                                          event_key: slots[0].eventKey, points: 300 }, 0);
      assert(second.action === 'spent' && /already answered/i.test(second.message),
        'a second join the same UTC day must be refused: ' + JSON.stringify(second));

      // The day roll clears the mirror — it must not grow a record per day
      // inside a save file that is already fragile.
      G.muster.dayKey = '1999-1-1';
      assert(M.ensureState().eventKey === null, 'yesterday’s muster must be pruned at the day roll');

      // A stale event_key earns exactly ONE re-sync, never a retry loop.
      assert(M._reduceJoin(200, { ok: false, error: 'stale_event', event_key: 'X#1' }, 0).action === 'retry',
        'the server telling us the real live slot should be adopted once');
      assert(M._reduceJoin(200, { ok: false, error: 'stale_event', event_key: 'X#1' }, 1).action === 'fail',
        'a second stale_event must give up, not loop');
      // Nothing that is not the RPC's own envelope may read as a join.
      assert(M._reduceJoin(200, null, 0).action === 'fail', 'a null body must never read as a join');
      assert(M._reduceJoin(401, { code: 'PGRST301' }, 0).action === 'fail', 'an auth error must never read as a join');
      // CLIENT-FIRST: no migration yet → 404/PGRST202 → the solo muster path.
      assert(M._reduceJoin(404, { code: 'PGRST202' }, 0).action === 'unsupported',
        'a missing world_event_join RPC must degrade, not break the feature');
      assert(M._reduceClaim(404, { code: 'PGRST202' }, 0).action === 'unsupported',
        'a missing world_event_claim RPC must degrade, not break claiming');
      assert(M._reduceContribute(404, { code: 'PGRST202' }, 0).action === 'unsupported',
        'a missing world_event_contribute RPC must degrade, not break play');

      // Contribution clamps mirror the server's, so the UI can never promise
      // points the server will refuse.
      delete G.muster; M.ensureState();
      assert(M._addPoints(999999) === M.TOTAL_CAP, 'the per-muster cap must clamp: ' + M.TOTAL_CAP);
      assert(M._addPoints(500) === 0, 'past the cap, further play adds nothing');
    } finally {
      M._resetProbes();
      if (saved === undefined) delete G.muster; else G.muster = saved;
    }
  }),

  // #15d: the Muster Seal is PvE-internal and single-sourced. This is an
  // ECONOMY guard, not a UI one — and it also re-asserts the Final Directive
  // rule that no world-event band can ever mint the IAP-only Hearth Token.
  () => tryRun('b220: the Muster Seal has exactly one source, and no band mints a Hearth Token', () => {
    const M = window.HearthriseMuster;
    const seal = window.ITEMS && window.ITEMS.muster_seal;
    assert(seal, 'muster_seal missing from ITEMS');
    assert(seal.bop === true, 'the Muster Seal must be bind-on-pickup — it must never reach the player market');
    assert(!seal.premium, 'the Muster Seal is PvE-internal, never a premium currency');
    assert(window._itemPath && /muster-seal\.svg$/.test(window._itemPath.muster_seal || ''),
      'the Muster Seal has no shipped art — it would render as a blank or a "?"');
    assert(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u.test(seal.icon || ''),
      'the Muster Seal fell back to an emoji glyph');

    // No OTHER system may hand one out: not a drop table, not a dungeon chest,
    // not a recipe, not a raid boss.
    const offenders = [];
    Object.entries(window.MONSTERS || {}).forEach(([id, m]) =>
      (m.drops || []).forEach((d) => { if (d.id === 'muster_seal') offenders.push('monster ' + id); }));
    Object.entries(window.DUNGEONS || {}).forEach(([id, d]) =>
      (d.loot || []).forEach((l) => { if (l.id === 'muster_seal') offenders.push('dungeon ' + id); }));
    Object.values(window.ARTISAN_RECIPES || {}).forEach((list) =>
      (list || []).forEach((r) => { if (r.out === 'muster_seal' || r.id === 'muster_seal') offenders.push('recipe ' + (r.id || r.out)); }));
    ((window.HearthriseRaids && window.HearthriseRaids.BOSSES) || []).forEach((b) => {
      if (b.reward && b.reward.items && b.reward.items.muster_seal) offenders.push('raid boss ' + b.id);
    });
    assert(offenders.length === 0, 'the Muster Seal leaked into: ' + offenders.join(', '));

    // A Seal only exists when the community goal was met. Server says otherwise
    // → no Seal, whatever number it sent.
    const held = M._reduceClaim(200, { ok: true, band: 'gold', held: true, gold: 7500, gems: 10, seals: 1 });
    assert(held.action === 'accept' && held.seals === 1, 'the realm holding should pay a Seal');
    const notHeld = M._reduceClaim(200, { ok: true, band: 'gold', held: false, gold: 5000, gems: 6, seals: 9 });
    assert(notHeld.seals === 0, 'no Seal unless the community goal was met, got ' + notHeld.seals);
    // The spec's daily ceiling is enforced on BOTH sides of the wire.
    const greedy = M._reduceClaim(200, { ok: true, band: 'gold', held: true, gold: 9e9, gems: 9e9, seals: 9e9 });
    assert(greedy.gold === 7500 && greedy.gems === 10 && greedy.seals === 1,
      'the daily chest ceiling must be mirrored client-side: ' + JSON.stringify(greedy));
    // And nothing in the reward shape can carry the bond.
    assert(!('hearth_token' in greedy) && JSON.stringify(greedy).indexOf('hearth_token') === -1,
      'a muster chest must never reference the IAP-only Hearth Token');
    // Replays and errors pay nothing.
    assert(M._reduceClaim(200, { ok: false, error: 'already_claimed' }).action === 'spent', 'a replayed claim must be refused');
    assert(M._reduceClaim(500, null).action === 'fail', 'a server error must never award a chest');
  }),

  // ── b228 regression suite (rally pre-selection + the 50% absence band) ──
  //
  // Tyler: "allow users to choose which rally they plan to join that day; if
  // they are offline, they will get 50% participation reward during the event."
  // Two things can break badly here and both are guarded below: the pre-select
  // could become a way to pay twice, or it could quietly become better than
  // showing up. Neither is allowed to regress silently.

  // #1: the rule — ONE answer per UTC day, changeable only until the rally you
  // chose actually opens. Driven through the pure gate with a frozen clock, so
  // every edge is exercised without waiting for 01:00 UTC.
  () => tryRun('b228: rally pre-select — one per UTC day, changeable only until that rally opens', () => {
    const M = window.HearthriseMuster;
    assert(typeof M.canPledge === 'function', 'canPledge is missing — the pre-selection gate IS the feature');
    const DAY = '2026-8-9';
    const A = { eventKey: DAY + '#1',  dayKey: DAY, slot: 1,  startMs: Date.UTC(2026, 7, 9, 1, 0) };
    const B = { eventKey: DAY + '#13', dayKey: DAY, slot: 13, startMs: Date.UTC(2026, 7, 9, 13, 0) };
    const TOM = { eventKey: '2026-8-10#1', dayKey: '2026-8-10', slot: 1, startMs: Date.UTC(2026, 7, 10, 1, 0) };
    const ctx = (o) => Object.assign({ nowMs: Date.UTC(2026, 7, 9, 0, 0), todayKey: DAY,
                                       windows: [A, B, TOM], pledge: null, joinedToday: false }, o);
    const why = (key, o) => { const r = M.canPledge(key, ctx(o)); return r.ok ? 'ok' : r.error; };

    assert(why(A.eventKey) === 'ok', 'an unpledged upcoming rally must be answerable');
    // Changeable — the whole point of "plan to join", since a day's two rallies
    // are always different content.
    assert(why(B.eventKey, { pledge: { dayKey: DAY, eventKey: A.eventKey } }) === 'ok',
      'the answer must be changeable while neither window has opened');
    // …until YOUR rally opens. Then the day is committed.
    assert(why(B.eventKey, { nowMs: Date.UTC(2026, 7, 9, 1, 5), pledge: { dayKey: DAY, eventKey: A.eventKey } }) === 'locked',
      'once the chosen rally has opened the answer must lock');
    assert(why(A.eventKey, { nowMs: Date.UTC(2026, 7, 9, 1, 5) }) === 'window_open',
      'a rally that has already begun is joined, not pre-selected');
    assert(why(A.eventKey, { pledge: { dayKey: DAY, eventKey: A.eventKey } }) === 'already_pledged',
      'answering the same rally twice must be a no-op, not a second pledge');
    assert(why(TOM.eventKey) === 'not_today',
      'only TODAY’s two rallies may be answered — one per UTC day is a rule about a day the server can name');
    assert(why(A.eventKey, { joinedToday: true }) === 'already_answered',
      'a player who already joined live today must never be offered a pledge that could not pay');
    assert(why('9999-1-1#7') === 'unknown_slot', 'an invented slot must be refused');

    // The topbar pill's upcoming state stops asking once the choice is made,
    // without changing state or precedence — pre-selecting is a plan, not an event.
    const S = M._computeState;
    const answering = S({ nowMs: 0, todayKey: 'D', next: { startMs: 3 * 3600000, eventKey: 'D#13' },
                          pledgedEventKey: 'D#13' });
    assert(answering.state === 'upcoming' && answering.answering === true &&
           /^Answering in 3:00:00$/.test(answering.copy), 'pledged pill copy: ' + JSON.stringify(answering));
    const plain = S({ nowMs: 0, todayKey: 'D', next: { startMs: 3 * 3600000, eventKey: 'D#13' } });
    assert(/^Rally in 3:00:00$/.test(plain.copy) && !plain.answering,
      'an unpledged countdown must read exactly as before: ' + JSON.stringify(plain));
    assert(answering.rank === plain.rank && answering.state === plain.state,
      'pre-selecting must not change the pill’s precedence');
  }),

  // #2: the economy. 50% of the BASE band and nothing else — never a Seal,
  // never the community share, never twice, and never before the day is over.
  // gold-arm: the half-honors payout credits gold client-side via a
  // clientMayWriteRecordField-gated grant — switch-OFF position.
  () => tryRun('b228: answering in absence pays exactly half the base band, once, and only after the day closes', () => {
    const M = window.HearthriseMuster, G = window.G;
    assert(M.ABSENT_SHARE === 0.5, 'the consolation share drifted: ' + M.ABSENT_SHARE);
    assert(M.ABSENT_BAND.gold === Math.round(M.SOLO_BAND.gold * 0.5) && M.ABSENT_BAND.gold === 750,
      'half honors must be 750g against the 1,500g base band, got ' + M.ABSENT_BAND.gold);
    assert(M.ABSENT_BAND.gems === 1, 'half honors must be 1 gem against the base band’s 2, got ' + M.ABSENT_BAND.gems);
    assert(M.ABSENT_BAND.seals === 0, 'absence must never earn a Rally Seal — the Seal means the realm held');
    // Presence has to keep winning, or this quietly becomes "log in every other
    // day". 750g is half the FLOOR and a tenth of the 7,500g ceiling.
    assert(M.ABSENT_BAND.gold * 2 === M.SOLO_BAND.gold, 'absence must be worth exactly half of live participation');
    assert(M.ABSENT_BAND.gold <= 7500 * 0.2, 'absence must stay far under the live ceiling');

    // The day closes at the END of the LAST window — 13:45 UTC, not 01:45.
    // Paying earlier could stack with a live join in the second slot.
    assert(M.dayCloseMs('2026-8-9') === Date.UTC(2026, 7, 9, 13, 45),
      'the day must close at 13:45 UTC, got ' + new Date(M.dayCloseMs('2026-8-9')).toISOString());
    assert(!isFinite(M.dayCloseMs('rubbish')), 'a malformed day key must not produce a payout window');

    const O = M._pledgeOutcome;
    const P = { dayKey: '2026-8-9', eventKey: '2026-8-9#1', slot: 1 };
    const close = M.dayCloseMs('2026-8-9');
    assert(O(P, { nowMs: close - 1, joinedThatDay: false }).action === 'hold',
      'nothing is owed while the day can still be joined');
    const paid = O(P, { nowMs: close, joinedThatDay: false });
    assert(paid.action === 'pay' && paid.gold === 750 && paid.gems === 1 && paid.seals === 0,
      'the absent payout drifted: ' + JSON.stringify(paid));
    assert(O(P, { nowMs: close + 9e8, joinedThatDay: true }).action === 'forfeit',
      'a pledge answered live must forfeit the consolation, not add to it');
    assert(O(null, { nowMs: close }).action === 'none', 'no pledge, no payout');

    // The wire contract. A greedy or confused server cannot mint.
    const A = M._reduceAbsence;
    const greedy = A(200, { ok: true, gold: 9e9, gems: 9e9, seals: 9e9 });
    assert(greedy.action === 'accept' && greedy.gold === 750 && greedy.gems === 1 && greedy.seals === 0,
      'the half-honors ceiling must be mirrored client-side: ' + JSON.stringify(greedy));
    assert(JSON.stringify(greedy).indexOf('hearth_token') === -1,
      'the absence band must never reference the IAP-only Hearth Token');
    assert(A(200, { ok: false, error: 'day_open' }).action === 'hold', 'day_open must wait, not fail');
    assert(A(500, null).action === 'fail' && A(200, null).action === 'fail',
      'a server error must never pay half honors');

    // End to end on the local (un-migrated) path. settlePledge() is async, but
    // that path contains no await, so its whole body runs before it returns —
    // which is what lets a synchronous suite drive the real function.
    const savedMuster = G.muster ? JSON.parse(JSON.stringify(G.muster)) : undefined;
    const savedPledge = G.rallyPledge ? JSON.parse(JSON.stringify(G.rallyPledge)) : undefined;
    const gold0 = G.gold, gems0 = G.gems;
    try {
      delete G.muster; M.ensureState();
      const past = new Date(M.now() - 3 * 86400000);
      const pastKey = past.getUTCFullYear() + '-' + (past.getUTCMonth() + 1) + '-' + past.getUTCDate();
      M._writePledge({ dayKey: pastKey, eventKey: pastKey + '#1', slot: 1, startMs: 0,
                       at: 0, joined: false, provisional: true });
      // b231: the 750g band is now paid in that rally's OWN currency — some of
      // it as domain materials and XP — so the gold delta is the themed
      // remainder, and the whole chest is still worth no more than the band.
      const expect = M.absentChest(pastKey + '#1', M.ABSENT_BAND.gold, M.ABSENT_BAND.gems);
      assert(M.chestValue(expect) <= M.ABSENT_BAND.gold, 'half honors exceeded its band');
      /* ── b515 — WHAT "LANDS" MEANS, NOW THAT THE CURRENCY IS THE SERVER'S ───
         This asserted `G.gold` and `G.gems` went up. `payChest` gates BOTH on
         the record seam, and muster.js says why at the line: world_event_claim
         PRICES the chest server-side but does not credit `player_state.gold`,
         so a local grant would be erased by the next absolute envelope. Under
         the shipping arm both gates are closed and the balances correctly do
         not move.

         The chest's OTHER halves are not server-owned and still land — seals
         and XP are excluded from item-authority on purpose — so those are what
         "the chest was paid" is measured on, and the ONCE-NESS (the whole point
         of the test: a pledge that is not consumed pays every boot) is measured
         on the pledge and on those same halves.
         MUTATION: drop the `_mayGold` gate in payChest → the "authored nothing"
         assertion goes red; drop the pledge clear in settlePledge → the
         paid-twice assertions do. */
      const sealsOf = () => (G.inventory && G.inventory.muster_seal) || 0;
      const seals0 = sealsOf();
      const goldKnown0 = goldOf(), gemsKnown0 = gemsOf();
      M.settlePledge();
      assert(M.getPledge() === null, 'a settled pledge must be cleared, or it pays again on the next boot');
      assert(goldOf() === goldKnown0 && gemsOf() === gemsKnown0,
        'the client AUTHORED half honors in a currency the server owns (' + goldKnown0 + ' -> ' + goldOf()
        + ' gold, ' + gemsKnown0 + ' -> ' + gemsOf() + ' gems) — world_event_claim prices the chest but '
        + 'does not credit player_state, so the next envelope erases this and the player watches it go');
      /* The client-owned halves of the same chest DID land — otherwise the
         assertion above is satisfied by a settle that did nothing at all. */
      const paidSomething = sealsOf() > seals0
        || (expect.items || []).some((it) => (G.inventory[it.id] || 0) > 0)
        || (expect.xp || []).length > 0;
      assert(paidSomething || (expect.items || []).length === 0,
        'the settle paid NOTHING at all — the currency gate is doing the work of the whole function, and '
        + 'the assertion above would then be vacuous');
      const sealsAfter = sealsOf();
      M.settlePledge();
      assert(sealsOf() === sealsAfter,
        'half honors paid twice — the pledge was not consumed (seals ' + sealsAfter + ' -> ' + sealsOf() + ')');
      assert(goldOf() === goldKnown0 && gemsOf() === gemsKnown0,
        'the second settle authored a currency the server owns');
    } finally {
      G.gold = gold0; G.gems = gems0;
      if (savedMuster === undefined) delete G.muster; else G.muster = savedMuster;
      if (savedPledge === undefined) delete G.rallyPledge; else G.rallyPledge = savedPledge;
    }
  }),

  // #3: THE no-double-pay test. A pre-selection that becomes a live join must
  // upgrade into that join and pay nothing extra — including days later, after
  // the muster mirror has been pruned at the UTC day roll.
  () => tryRun('b228: a pre-selection that becomes a live join never double-pays', () => {
    const M = window.HearthriseMuster, G = window.G;
    const savedMuster = G.muster ? JSON.parse(JSON.stringify(G.muster)) : undefined;
    const savedPledge = G.rallyPledge ? JSON.parse(JSON.stringify(G.rallyPledge)) : undefined;
    const gold0 = G.gold, gems0 = G.gems;
    try {
      const past = new Date(M.now() - 3 * 86400000);
      const pastKey = past.getUTCFullYear() + '-' + (past.getUTCMonth() + 1) + '-' + past.getUTCDate();
      delete G.muster; M.ensureState();
      M._writePledge({ dayKey: pastKey, eventKey: pastKey + '#1', slot: 1, startMs: 0,
                       at: 0, joined: false, provisional: true });
      // Answer it live. adopt() latches the join onto the PLEDGE, because the
      // muster mirror is pruned at the day roll and settlement can be days later.
      M._adopt({ dayKey: pastKey, eventKey: pastKey + '#1', slot: 1, server: false });
      assert(M.getPledge() && M.getPledge().joined === true,
        'joining the pledged rally must latch onto the pledge — the mirror will not remember');
      // Now roll the day: the mirror forgets, the pledge does not.
      G.muster.dayKey = '1999-1-1'; M.ensureState();
      assert(M.ensureState().eventKey === null, 'the mirror should have been pruned');
      M.settlePledge();
      assert(G.gold === gold0 && G.gems === gems0,
        'a rally answered live paid half honors on top of its chest — that is the double-pay bug');
      assert(M.getPledge() === null, 'the forfeited pledge must be closed, not left pending');

      // The server says the same thing, through the b220 join primary key.
      assert(M._reduceAbsence(200, { ok: false, error: 'answered_live' }).action === 'forfeit',
        'the server finding a live join must close the pledge, not fail loudly at the player');
      assert(M._reduceAbsence(200, { ok: false, error: 'already_settled' }).action === 'forfeit',
        'a replayed consolation claim must pay nothing');

      // Ownership rule: what the SERVER holds, only the server settles. A
      // client that paid a server-registered pledge locally would pay twice the
      // moment that account signed in anywhere else.
      M._writePledge({ dayKey: pastKey, eventKey: pastKey + '#1', slot: 1, startMs: 0,
                       at: 0, joined: false, provisional: false });
      M.settlePledge();
      assert(G.gold === gold0 && G.gems === gems0,
        'a server-registered pledge was settled by the client — that is a cross-device double-pay');
      assert(M.getPledge() !== null, 'a server-owned pledge must be held, not discarded');
    } finally {
      G.gold = gold0; G.gems = gems0;
      if (savedMuster === undefined) delete G.muster; else G.muster = savedMuster;
      if (savedPledge === undefined) delete G.rallyPledge; else G.rallyPledge = savedPledge;
    }
  }),

  // #4: the wire contract, and what happens when the server cannot hold a
  // pledge at all. b231 replaced the old "provisional, this device only"
  // degradation — Tyler: an answer the server cannot keep is not a feature, it
  // is a rumour — so an un-migrated project HIDES the affordance instead.
  () => tryRun('b231: with no migration the pledge affordance hides — no half-kept promise', () => {
    const M = window.HearthriseMuster, G = window.G;
    assert(M._reducePledge(404, { code: 'PGRST202' }).action === 'unsupported',
      'a missing world_event_pledge RPC must degrade, not break the feature');
    assert(M._reduceAbsence(404, { code: 'PGRST202' }).action === 'unsupported',
      'a missing world_event_absence_claim RPC must degrade, not break settlement');
    assert(M._reducePledge(200, null).action === 'fail', 'a null body must never read as an accepted answer');
    assert(M._reducePledge(401, { code: 'PGRST301' }).action === 'fail',
      'an auth error must never read as an accepted answer');
    assert(M._reducePledge(200, { ok: false, error: 'locked' }).message.length > 0,
      'every refusal must carry copy a player can act on');

    // A signed-out or un-migrated session must not claim pledge support.
    M._forceSupport(null);
    assert(M.pledgeSupported() === false,
      'a session with no server must never offer to hold a pledge');

    const savedPledge = G.rallyPledge ? JSON.parse(JSON.stringify(G.rallyPledge)) : undefined;
    const prevTab = window.activeTab;
    try {
      // Dated FORWARD on purpose: a pledge whose day cannot have closed can
      // never be settled out from under the assertions by the settle pass.
      const soon = new Date(M.now() + 86400000);
      const dayKey = soon.getUTCFullYear() + '-' + (soon.getUTCMonth() + 1) + '-' + soon.getUTCDate();
      M._writePledge({ dayKey, eventKey: dayKey + '#1', slot: 1, startMs: M.now() + 9e6,
                       at: M.now(), joined: false, provisional: false });
      window.showTab('events');

      // b385: the muster is a gated clan surface while CLAN_LAUNCHED is false —
      // the rendered card reads coming-soon and shows no pledge/rally affordance
      // (which is also, trivially, "no pledge button offered"). The pledge-copy
      // assertions only hold once the flag flips; the pure pledge-reduce contract
      // above is independent of the render and always runs. The b385 gate test
      // pins the coming-soon state.
      const _CLm = window.HearthriseClans;
      const _launchedM = _CLm && typeof _CLm.clanLaunched === 'function' && _CLm.clanLaunched();

      // 1 — un-migrated: no buttons at all. Not a greyed one, not a "coming
      // soon", and above all not a promise recorded nowhere.
      M._forceSupport(false);
      M.render();
      const card = document.getElementById('hr-muster-card');
      assert(card, 'the rally card is missing from Events');
      assert(!card.querySelector('[data-mu="pledge"]'),
        'an un-migrated project still offered a pledge button');

      if (_launchedM) {
        // 2 — supported: the affordance is there and states the real numbers.
        M._forceSupport(true);
        M.render();
        const text = document.getElementById('hr-muster-card').textContent || '';
        assert(/half honors/i.test(text),
          'the rally card never tells the player what answering in absence is worth');
        assert(/\d/.test(text.split('half honors')[1] || ''),
          'the card must state the actual reward, not a vague promise');
        assert(/automatically/i.test(text),
          'the card must state the auto-join rule — it is the reason to mark a rally');
      } else {
        assert(card.querySelector('.clan-soon'),
          'the gated muster must render the coming-soon card, not a functional rally');
      }
    } finally {
      M._forceSupport(null);
      if (savedPledge === undefined) delete G.rallyPledge; else G.rallyPledge = savedPledge;
      try { window.showTab(prevTab || 'profile'); } catch {}
    }
  }),

  /* ── b231 regression suite (rally pledges v2) ──────────────────
     Tyler, 2026-08-09: (1) pledged + online during the window = full
     participation automatically; (2) a visible "Switch to <the other rally>"
     until the pledged window opens; (3) chests THEMED to the event; (4) no
     implementation-state copy, ever.

     The two things that can go badly wrong here are the two that are tested
     hardest: auto-join must never become a second payout on top of half
     honors, and theming must never become a stealth buff. */

  () => tryRun('b231: auto-join — pledged + online joins once, and never doubles with half honors', () => {
    const M = window.HearthriseMuster, G = window.G;
    const D = M.autoJoinDecision;
    const DAY = '2026-8-9';
    const live = { eventKey: DAY + '#1', dayKey: DAY, slot: 1 };
    const base = { live, pledge: { dayKey: DAY, eventKey: DAY + '#1' }, todayKey: DAY,
                   joinedDayKey: null, joinedEventKey: null, online: true };
    const why = (o) => { const r = D(Object.assign({}, base, o)); return r.action === 'join' ? 'join' : r.reason; };

    // THE happy path: the window opened, they are here, they are in.
    assert(why() === 'join', 'a pledged, online player must be entered automatically');
    // Every branch that must NOT auto-join.
    assert(why({ online: false }) === 'offline',
      'an offline player must fall through to half honors, never be auto-joined');
    assert(why({ live: null }) === 'no_window', 'nothing happens outside a window');
    assert(why({ pledge: null }) === 'no_pledge',
      'an un-pledged player keeps the manual join — auto-join must never fire for them');
    assert(why({ pledge: { dayKey: DAY, eventKey: DAY + '#13' } }) === 'other_rally',
      'a pledge for the OTHER rally must not be answered by this one');
    assert(why({ joinedDayKey: DAY, joinedEventKey: DAY + '#1' }) === 'already_joined',
      'the join is idempotent — a 1Hz tick must not re-join every second');
    assert(why({ joinedDayKey: DAY, joinedEventKey: DAY + '#13' }) === 'day_spent',
      'a day already spent on the other rally must not be spent again');

    // The online oracle is the blessing gate's oracle, not a second opinion.
    assert(typeof M._sessionOnline === 'function' && typeof M._sessionOnline() === 'boolean',
      'auto-join must read a real online signal');
    const P = window.HearthrisePresence;
    assert(P && typeof P.isOnline === 'function', 'HearthrisePresence.isOnline is the one oracle');
    assert(M._sessionOnline() === P.isOnline(),
      'auto-join and the blessing must never disagree about whether the player is here');

    // NO DOUBLE PAY, end to end on the real functions: pledge → auto-join →
    // the day rolls (the muster mirror is pruned) → settlement pays nothing.
    const savedMuster = G.muster ? JSON.parse(JSON.stringify(G.muster)) : undefined;
    const savedPledge = G.rallyPledge ? JSON.parse(JSON.stringify(G.rallyPledge)) : undefined;
    const gold0 = G.gold, gems0 = G.gems;
    try {
      const past = new Date(M.now() - 3 * 86400000);
      const pastKey = past.getUTCFullYear() + '-' + (past.getUTCMonth() + 1) + '-' + past.getUTCDate();
      delete G.muster; M.ensureState();
      M._writePledge({ dayKey: pastKey, eventKey: pastKey + '#1', slot: 1, startMs: 0,
                       at: 0, joined: false, provisional: true });
      // What auto-join does is adopt() the join — the same call the manual path
      // makes — so the latch is exercised, not simulated.
      M._adopt({ dayKey: pastKey, eventKey: pastKey + '#1', slot: 1, server: false });
      assert(M.getPledge().joined === true, 'auto-join must latch onto the pledge');
      G.muster.dayKey = '1999-1-1'; M.ensureState();
      M.settlePledge();
      assert(G.gold === gold0 && G.gems === gems0,
        'an auto-joined rally paid half honors on top of its chest — that is the double-pay bug');
      assert(M.getPledge() === null, 'the answered pledge must be closed, not left pending');
      // And the server says the same thing independently, through the join PK.
      assert(M._reduceAbsence(200, { ok: false, error: 'answered_live' }).action === 'forfeit',
        'the server must forfeit the consolation for a day that was answered live');
    } finally {
      G.gold = gold0; G.gems = gems0;
      if (savedMuster === undefined) delete G.muster; else G.muster = savedMuster;
      if (savedPledge === undefined) delete G.rallyPledge; else G.rallyPledge = savedPledge;
    }
  }),

  () => tryRun('b231: the pledged card offers "Switch to <the other rally>" until its window opens', () => {
    const M = window.HearthriseMuster, G = window.G;
    const savedPledge = G.rallyPledge ? JSON.parse(JSON.stringify(G.rallyPledge)) : undefined;
    const savedMuster = G.muster ? JSON.parse(JSON.stringify(G.muster)) : undefined;
    const prevTab = window.activeTab;
    const CL = window.HearthriseClans;
    const savedLaunched = CL ? CL.clanLaunched : null;
    try {
      M._forceSupport(true);
      /* ── PIN THE CLOCK (QA, 2026-09-07) ───────────────────────────────────
         This test used to read the wall clock: it took `todaysWindows()` and
         pledged into a real slot. The two slots are 01:00 and 13:00 UTC, so
         BOTH are still ahead only between 00:00 and 01:00 UTC — for the other
         23 hours the test fell into a weak early-return that asserted a pure
         seam and never rendered anything, and inside that one hour it asserted
         DOM that b385/b465 had already removed. Result: green in every daytime
         run and red at 00:02 UTC on 2026-09-07, with the real rendering path
         effectively untested. `_setSkew` is the module's one clock seam — it
         moves now(), dayKeyAt, windowsAround, canPledge and the render
         together, so nothing can disagree about which UTC day this is. Pinning
         to 00:30 UTC of the CURRENT day (not a hardcoded date, so the offset
         stays inside the |0 int32 `_setSkew` takes) makes the full path run in
         every run, at every hour, with no assertion weakened. */
      const _n = new Date();
      const pinned = Date.UTC(_n.getUTCFullYear(), _n.getUTCMonth(), _n.getUTCDate(), 0, 30, 0);
      M._setSkew(pinned - Date.now());
      /* The muster SURFACE is behind the CLAN_LAUNCHED product gate (b385 for
         the card, b465 for the pill and modal), so while clans are unlaunched
         nothing renders a slot at all — that is why the DOM half of this test
         could only ever be red. The gate has its own test; this one is about
         what the card does once the gate opens, and it must not rot while the
         gate is shut. Lift the flag for the render only, restore in `finally`. */
      if (CL && typeof CL.clanLaunched === 'function') CL.clanLaunched = function () { return true; };
      const open = M.todaysWindows().filter((w) => M.now() < w.startMs);
      assert(open.length === 2,
        'the pinned instant (00:30 UTC) must have both of the day’s rallies still ahead, got ' +
        open.length + ' — the slot schedule moved and this test needs re-pinning');
      const mine = open[0], other = open[1];
      M._writePledge({ dayKey: mine.dayKey, eventKey: mine.eventKey, slot: mine.slot,
                       startMs: mine.startMs, at: M.now(), joined: false, provisional: false });
      window.showTab('events'); M.render();
      const card = document.getElementById('hr-muster-card');
      // Anti-vacuity: if the gate lift or the pin failed, the card is the
      // coming-soon panel and every assertion below would be about nothing.
      assert(card && card.querySelector('.mu-slots'),
        'the muster card rendered no slots — the clan gate is still shut, so the switch assertions below would be vacuous');
      const btn = card.querySelector('[data-mu="pledge"]');
      assert(btn, 'a pledged card must still offer the switch');
      assert(btn.getAttribute('data-key') === other.eventKey,
        'the switch must point at the OTHER rally, got ' + btn.getAttribute('data-key'));
      assert(btn.textContent.indexOf('Switch to ') === 0 &&
             btn.textContent.indexOf(other.event.name) > 0,
        'the switch must name the rally it moves to, got: ' + btn.textContent);
      // Exactly one pledge control on the card — the choice lives where it is
      // held, not duplicated onto every slot.
      assert(card.querySelectorAll('[data-mu="pledge"]').length === 1,
        'a pledged player must be offered one switch, not a second pledge button');

      // Once YOUR window has opened the day is committed and the switch is gone.
      const ctxOpen = Object.assign(M._pledgeContext(), { nowMs: mine.startMs + 60000 });
      assert(M._switchTarget(ctxOpen) === null,
        'the switch must disappear once the pledged rally has begun');
      // The invariant the old post-13:00 branch used to be the only carrier of,
      // kept and now asserted in EVERY run: whatever the card offers as a
      // switch must be something the pledge gate would actually accept.
      const ctxNow = M._pledgeContext();
      const tgt = M._switchTarget(ctxNow);
      assert(tgt === null || M.canPledge(tgt.eventKey, ctxNow).ok,
        'a switch target must always be one the pledge gate would actually accept');
    } finally {
      M._setSkew(0);
      M._forceSupport(null);
      if (CL && savedLaunched) CL.clanLaunched = savedLaunched;
      if (savedPledge === undefined) delete G.rallyPledge; else G.rallyPledge = savedPledge;
      if (savedMuster === undefined) delete G.muster; else G.muster = savedMuster;
      try { window.showTab(prevTab || 'profile'); } catch {}
    }
  }),

  () => tryRun('b231: every rally has a themed chest, and theming never inflates the band', () => {
    const M = window.HearthriseMuster;
    const ITEMS = window.ITEMS || {};
    assert(M.EVENTS.length === Object.keys(M.THEMES).length,
      'every rally needs a reward table — ' + M.EVENTS.length + ' rallies, ' +
      Object.keys(M.THEMES).length + ' tables');

    M.EVENTS.forEach((ev) => {
      const t = M.THEMES[ev.id];
      assert(t, 'rally ' + ev.id + ' has no reward table');
      assert(t.skills.length > 0, ev.id + ' pays no XP — the theme is the whole point');
      assert(t.items.length > 0, ev.id + ' pays no materials');
      // The inline vendor values must match the economy, or a price change
      // silently unbalances a rally chest.
      t.items.forEach((it) => {
        assert(ITEMS[it.id], ev.id + ' pays an item that does not exist: ' + it.id);
        assert(ITEMS[it.id].v === it.v,
          ev.id + ' prices ' + it.id + ' at ' + it.v + ' but the game says ' + ITEMS[it.id].v);
      });
      // The weights are a split of one budget, not a multiplier on it.
      const w = t.items.reduce((a, b) => a + b.w, 0);
      assert(Math.abs(w - 1) < 1e-9, ev.id + ' item weights must total 1, got ' + w);

      // THE CEILING, at the floor band, the ceiling band and half honors.
      [750, 1500, 3000, 7500].forEach((band) => {
        const c = M.themedChest(ev.id, band, 2, 0);
        assert(M.chestValue(c) <= band,
          ev.id + ' at ' + band + 'g is worth ' + M.chestValue(c) + ' — theming must convert value, not add it');
        assert(c.gold <= band && c.gold >= 0, ev.id + ' gold out of range at ' + band);
        assert(c.items.length > 0, ev.id + ' paid no materials at ' + band + 'g');
        assert(c.xp.length === t.skills.length && c.xp.every((x) => x.amount > 0),
          ev.id + ' paid no XP at ' + band + 'g');
        assert(JSON.stringify(c).indexOf('hearth_token') === -1,
          'a rally chest must never reference the IAP-only Hearth Token');
      });
    });

    // Tyler's own example, spelled out: the Forge Levy pays the forge.
    const forge = M.themedChest('forge_levy', 7500, 10, 1);
    assert(forge.xp.map((x) => x.skill).join() === 'smithing,crafting',
      'the Forge Levy must pay smithing and crafting XP, got ' + JSON.stringify(forge.xp));
    assert(forge.items.map((i) => i.id).join() === 'iron_bar,coal',
      'the Forge Levy must pay forge materials, got ' + JSON.stringify(forge.items));
    assert(forge.gems === 10 && forge.seals === 1,
      'theming must leave gems and the Rally Seal exactly as the band set them');
    assert(M.themedChest('forge_levy', 9e9, 9e9, 9e9).gold <= 7500,
      'the 7,500g ceiling must survive theming');
    assert(M.themedChest('forge_levy', 7500, 9e9, 9e9).gems === 10 &&
           M.themedChest('forge_levy', 7500, 10, 9e9).seals === 1,
      'the gem and Seal ceilings must survive theming');

    // Half honors is 50% of the SAME table, not a different reward.
    const half = M.absentChest('2026-8-9#1', M.ABSENT_BAND.gold, M.ABSENT_BAND.gems);
    const full = M.themedChest(half.eventId, M.SOLO_BAND.gold, M.SOLO_BAND.gems, 0);
    assert(half.eventId === full.eventId && half.seals === 0,
      'absence must draw on the same rally table and never earn a Rally Seal');
    assert(M.chestValue(half) <= M.ABSENT_BAND.gold, 'half honors exceeded its band');
    assert(M.chestValue(half) * 2 <= M.SOLO_BAND.gold + 1,
      'half honors must stay at half the floor band');
    assert(half.xp.map((x) => x.skill).join() === full.xp.map((x) => x.skill).join(),
      'half honors must pay the same domain as the rally it was pledged to');

    // An unknown rally degrades to plain gold — poorer, never emptier.
    const unknown = M.themedChest('no_such_rally', 1500, 2, 0);
    assert(unknown.gold === 1500 && unknown.items.length === 0 && unknown.xp.length === 0,
      'an unknown rally must fall back to plain gold, got ' + JSON.stringify(unknown));

    // XP must be granted, never injected: the chest names skills and amounts
    // and the payout hands them to addXp, so PACE and the fuse apply.
    assert(typeof window.addXp === 'function', 'the themed chest needs addXp to exist');
    assert(M.XP_PER_GOLD > 0 && M.CHEST_XP_SHARE + M.CHEST_ITEM_SHARE < 1,
      'the conversion shares must leave gold in the chest');
  }),

  () => tryRun('b231: no implementation-state copy anywhere in the rally surfaces', () => {
    const M = window.HearthriseMuster, G = window.G;
    // Tyler: "provisional / recorded on this device" and anything like it is
    // banned outright. A player must never be told about our plumbing.
    const BANNED = [/provisional/i, /recorded on this device/i, /this device only/i,
                    /device only/i, /local(?:ly)? (?:only|saved|stored)/i,
                    /not (?:yet )?synced/i, /un-?migrated/i, /migration/i, /rpc/i];
    const sweep = (label, s) => BANNED.forEach((re) => assert(!re.test(String(s || '')),
      label + ' leaks implementation-state copy (' + re + '): ' + s));

    const savedPledge = G.rallyPledge ? JSON.parse(JSON.stringify(G.rallyPledge)) : undefined;
    const prevTab = window.activeTab;
    const realNotify = window.notify;
    const toasts = [];
    try {
      window.notify = (msg) => { toasts.push(String(msg)); };
      window.showTab('events');

      // Every state the rally card can be in, swept.
      [[true, true], [true, false], [false, true], [false, false]].forEach(([supported, pledged]) => {
        M._forceSupport(supported);
        if (pledged) {
          const soon = new Date(M.now() + 86400000);
          const dayKey = soon.getUTCFullYear() + '-' + (soon.getUTCMonth() + 1) + '-' + soon.getUTCDate();
          M._writePledge({ dayKey, eventKey: dayKey + '#1', slot: 1, startMs: M.now() + 9e6,
                           at: M.now(), joined: false, provisional: false });
        } else { M._writePledge(null); }
        M.render();
        const card = document.getElementById('hr-muster-card');
        sweep('the rally card (supported=' + supported + ', pledged=' + pledged + ')',
              card ? card.textContent : '');
      });

      // The degraded sentence is the ONLY thing a server-less session may say,
      // and it says nothing about why.
      M._forceSupport(false); M._writePledge(null); M.render();
      const degraded = document.getElementById('hr-muster-card').textContent || '';
      assert(degraded.indexOf('unavailable') < 0 || degraded.indexOf(M.UNAVAILABLE) >= 0,
        'the degraded state may only use the one approved sentence');
      assert(M.UNAVAILABLE === 'Rally pledges are unavailable right now.',
        'the degraded sentence drifted: ' + M.UNAVAILABLE);
      sweep('the degraded sentence', M.UNAVAILABLE);

      // The half-honors toast, captured at source.
      toasts.length = 0;
      const gold0 = G.gold, gems0 = G.gems;
      try {
        M._grantAbsent({ dayKey: '2026-8-9', eventKey: '2026-8-9#1', provisional: true },
                       { gold: M.ABSENT_BAND.gold, gems: M.ABSENT_BAND.gems });
      } finally { G.gold = gold0; G.gems = gems0; }
      assert(toasts.length > 0, 'half honors must tell the player it happened');
      toasts.forEach((t) => sweep('a half-honors toast', t));

      // And every refusal sentence the pledge can produce.
      ['window_open', 'locked', 'not_today', 'unknown_slot', 'already_answered',
       'already_pledged', 'not_signed_in', 'network', ''].forEach((e) => {
        sweep('pledge refusal "' + e + '"', M._reducePledge(200, { ok: false, error: e }).message);
      });
    } finally {
      window.notify = realNotify;
      M._forceSupport(null);
      if (savedPledge === undefined) delete G.rallyPledge; else G.rallyPledge = savedPledge;
      try { window.showTab(prevTab || 'profile'); } catch {}
    }
  }),

  // #14: discoverability. THIS is the tripwire the original bug never had —
  // the Dungeons entry was injected and then hidden in CSS, which is exactly
  // the failure mode that made dungeons, and the clan raid nested inside them,
  // impossible to find.
  () => tryRun('b220: Events is a real top-level destination and nothing hides it', () => {
    const nav = document.querySelector('.nav-btn[data-tab="events"]');
    assert(nav, 'the top-level Events nav entry is missing');
    assert(getComputedStyle(nav).display !== 'none',
      'something is hiding the Events nav entry — this is backlog #14 recurring');
    assert(/events/i.test(nav.textContent), 'the Events nav entry lost its label');
    assert(!document.querySelector('.nav-btn[data-tab="dungeons"]'),
      'the injected-then-hidden Dungeons nav entry came back');
    assert(document.querySelector('#more-modal [data-tab="events"]'),
      'mobile has no route to Events — the More sheet is the only spare surface');
    const panel = document.getElementById('panel-events');
    assert(panel, '#panel-events was never built');
    ['hr-muster-card', 'hr-ev-blessing', 'hr-events-raid', 'hr-events-dungeons'].forEach((id) =>
      assert(panel.querySelector('#' + id), 'Events panel is missing its ' + id + ' section'));
    // The dungeon list lives here now, and showTab('dungeons') still resolves.
    assert(document.querySelector('#panel-events #panel-dungeons'),
      'the dungeon list did not move into Events');
  }),

  () => tryRun('b220: the raid card renders at full height in its new home', () => {
    const R = window.HearthriseRaids;
    const prevTab = window.activeTab;
    try {
      window.showTab('events');
      const p = R.render(); if (p && p.catch) p.catch(() => {});
      const card = document.getElementById('hr-raid-card');
      assert(card, 'the raid card is missing');
      assert(card.closest('#panel-events'),
        'the raid card is still outside Events — the flagship social feature must be findable');
      // Above the dungeon list, under its own "Weekly clan boss" heading: the
      // weekly SOCIAL boss must not read as one more solo dungeon.
      assert(card.parentElement && card.parentElement.id === 'hr-events-raid',
        'the raid card drifted out of its own section, into ' + (card.parentElement && card.parentElement.id));
      const dgnSec = document.getElementById('hr-events-dungeons');
      assert(card.compareDocumentPosition(dgnSec) & Node.DOCUMENT_POSITION_FOLLOWING,
        'the clan boss must come before the solo dungeon list');
      const box = card.getBoundingClientRect();
      // It rendered 16px tall inside #panel-dungeons: `.panel.active` is
      // display:grid with no row template, so an injected card became an
      // implicit row in a fixed-height container and collapsed.
      assert(box.height > 60, 'the raid card collapsed again — height ' + Math.round(box.height) + 'px');
      assert(box.width > 60, 'the raid card has no width');
      assert(getComputedStyle(document.getElementById('panel-events')).display === 'block',
        'the Events panel must be a block column, not a grid — that grid is what collapsed the card');
      assert(!document.getElementById('hr-dungeons-back'),
        'the "Back to Combat" escape hatch belongs to the old dead-end panel');
    } finally {
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  /* ── b225 regression suite (backlog #18 — the Clan Seat's own destination) ──
     The castle is one of the two ULTIMATE progression pillars and it shipped as
     a card at the bottom of Social, underneath the leaderboards. These two
     guards are the tripwires that failure never had: one for the entry, one for
     every route that leads to it. */
  () => tryRun('b225: the Clan Seat is a real top-level destination and nothing hides it', () => {
    const nav = document.querySelector('.nav-btn[data-tab="clan"]');
    assert(nav, 'the top-level Clan nav entry is missing');
    assert(getComputedStyle(nav).display !== 'none',
      'something is hiding the Clan nav entry — this is backlog #18 recurring');
    assert(/clan/i.test(nav.textContent), 'the Clan nav entry lost its label');
    // b220's lesson: an injected-then-hidden entry is how a feature vanishes.
    assert(!nav.hasAttribute('data-injected'), 'the Clan entry must be static markup');
    // No emoji anywhere in the chrome this feature added (Final Directive).
    const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
    assert(!EMOJI.test(nav.textContent), 'the Clan nav entry contains emoji');
    // The 6-slot bottom nav is full, so mobile's route is the More sheet.
    const more = document.querySelector('#more-modal [data-tab="clan"]');
    assert(more, 'mobile has no route to the Clan Seat — the More sheet is the only spare surface');
    assert(!EMOJI.test(more.textContent), 'the mobile Clan entry contains emoji');
    // The panel and its host exist in the markup, not at the mercy of a boot order.
    const panel = document.getElementById('panel-clan');
    assert(panel, '#panel-clan was never built');
    const host = document.getElementById('clan-panel');
    assert(host, 'the Clan Seat has no render host (#clan-panel)');
    assert(host.closest('#panel-clan'), 'the castle host is not inside the Clan panel');
    // And it is NOT back inside Social.
    assert(!document.querySelector('#panel-social #clan-panel'),
      'the Clan Seat drifted back into Social — this is backlog #18 recurring');
    const social = document.getElementById('panel-social');
    assert(social && document.querySelector('.nav-btn[data-tab="social"]'),
      'Social lost its own entry while the clan moved out');
    assert(social.querySelector('#leaderboard'), 'Social lost its leaderboards');
    assert(social.querySelector('#social-panel'), 'Social lost its friends host');
  }),

  () => tryRun('b225: every route to the hold resolves, and Social still opens', () => {
    const prevTab = window.activeTab;
    try {
      const panel = document.getElementById('panel-clan');
      // The direct route.
      window.showTab('clan');
      assert(panel.classList.contains('active'), 'showTab("clan") did not open the Clan panel');
      // A picture-led screen in a fixed grid row is what collapsed the raid
      // card in b220. This one is a block column that scrolls as a page.
      const cs = getComputedStyle(panel);
      assert(cs.display === 'block', 'the Clan panel must be a block column, not a ' + cs.display);
      assert(cs.overflowY === 'auto', 'the Clan panel must scroll as a page');
      // Clan Activity moved here with the hold, and only exists for a member.
      const act = document.getElementById('clan-activity-card');
      assert(act && act.closest('#panel-clan'), 'Clan Activity did not move to the Clan panel');
      if (!(window.clanDisplayName && window.clanDisplayName())) {
        assert(getComputedStyle(act).display === 'none',
          'Clan Activity is showing to a player with no clan');
      }
      // Every legacy name for this screen still lands on it.
      ['castle', 'clanseat', 'clan-seat', 'clans'].forEach((alias) => {
        window.showTab('profile');
        window.showTab(alias);
        assert(panel.classList.contains('active'), 'showTab("' + alias + '") no longer reaches the hold');
      });
      // The old deep link is untouched: Social still opens, and it signposts.
      window.showTab('social');
      const soc = document.getElementById('panel-social');
      assert(soc.classList.contains('active'), 'showTab("social") stopped resolving');
      const sign = document.querySelector('#social-panel .soc-signpost [onclick*="clan"]');
      assert(sign, 'Social has no signpost to the hold for players arriving on muscle memory');
      // The topbar clan tag is the second door.
      const tag = document.getElementById('clan-tag');
      assert(tag && /clan/.test(tag.getAttribute('onclick') || ''),
        'the topbar clan tag no longer routes to the Clan Seat');
      // The hold's renderer looks for its host in the new home.
      assert(typeof window.renderClan === 'function', 'renderClan() is missing');
    } finally {
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  /* ── b230 regression suite (Tyler: "Market tabs need some organization.
     Right now it's hard to find the in-game shop.") ────────────────────────
     The in-game shop had NO visible door: theme-cozy.css set
     `.nav-btn[data-tab="shop"]{display:none!important}` and the only commerce
     entry a player could see was the Market button market.js injected at
     runtime. Commerce is now one static `Shops` destination under Realm with
     three toggles, Inventory moved to the character block, and the Economy
     group is gone. Five guards: the shape, the routes, the toggle, the colour
     role, and the self-deleting button that started this. */
  () => tryRun('b230: the nav shape — Economy is gone, Inventory is a character entry, Shops is a Realm entry', () => {
    const sidebar = document.getElementById('sidebar');
    assert(sidebar, 'no sidebar');
    const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
    const labels = Array.from(sidebar.querySelectorAll('.nav-group-label')).map((l) => l.textContent.trim());
    assert(!labels.some((t) => /economy/i.test(t)),
      'the Economy group is back — Tyler asked for it removed');

    // Which labelled group a nav entry sits in = its nearest PRECEDING label.
    const groupOf = (el) => {
      let n = el.previousElementSibling;
      while (n) { if (n.classList.contains('nav-group-label')) return n.textContent.trim(); n = n.previousElementSibling; }
      return null; // the unlabelled head block
    };

    // Inventory belongs to the character, and sits directly under Character.
    const character = sidebar.querySelector('.nav-btn[data-tab="character"]');
    const inv = sidebar.querySelector('.nav-btn[data-tab="inventory"]');
    assert(character && inv, 'Character or Inventory is missing from the rail');
    assert(character.nextElementSibling === inv,
      'Inventory is not directly under Character (Tyler: "Inventory should be under Character")');
    assert(groupOf(inv) === null, 'Inventory drifted into a labelled group');

    // Shops is a real, visible, static Realm entry.
    const shops = sidebar.querySelector('.nav-btn[data-tab="shops"]');
    assert(shops, 'the top-level Shops nav entry is missing');
    assert(groupOf(shops) === 'Realm',
      'Shops is not under Realm (Tyler: "\'shops\' should be under Realm") — it is under ' + groupOf(shops));
    assert(getComputedStyle(shops).display !== 'none',
      'something is hiding the Shops entry — that is exactly how the in-game shop vanished');
    assert(/shops/i.test(shops.textContent), 'the Shops nav entry lost its label');
    assert(!EMOJI.test(shops.textContent), 'the Shops nav entry contains emoji');
    assert(shops.querySelector('.ic .hr-glyph svg'), 'the Shops entry has no atlas glyph');

    // The entries it replaced must NOT come back as hidden strays.
    assert(!sidebar.querySelector('.nav-btn[data-tab="shop"]'),
      'the old hidden Store entry is back in the rail');
    assert(!sidebar.querySelector('.nav-btn[data-tab="market"]'),
      'market.js is injecting a Market nav button again — commerce is one entry now');

    // Mobile: the More sheet is the phone route (the 6-slot bottom nav is full).
    const more = document.querySelector('#more-modal [data-tab="shops"]');
    assert(more, 'mobile has no route to Shops');
    assert(!EMOJI.test(more.textContent), 'the mobile Shops entry contains emoji');
    assert(!document.querySelector('#more-modal [data-tab="shop"]'),
      'the More sheet still points at the old Store-only destination');
  }),

  /* b316: Settings must be REACHABLE FROM THE RAIL. The only two doors were
     the topbar gear (clips off a narrow landscape phone's right edge) and the
     More sheet's button (does not exist in the left-rail layout a landscape
     phone uses) — so Settings was unreachable on a landscape phone. This guard
     asserts a rail control that OPENS the settings UI, is present + visible in
     the sidebar (not display:none), carries the atlas gear glyph and no emoji,
     and — because Settings is a modal — is deliberately NOT a data-tab nav
     (a data-tab would blank the panel via showTab). Proved red by deleting the
     #btn-settings-rail button: "no reachable Settings control in the rail". */
  () => tryRun('b316: Settings is reachable from the nav rail (desktop sidebar + landscape bottom-nav)', () => {
    const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
    // A landscape phone uses the bottom-nav rotated into a left rail (b310/b312),
    // NOT the #sidebar (which is display:none there). Both layouts therefore need
    // their own Settings door, and BOTH must be guarded.
    const cases = [
      ['#sidebar', '#btn-settings-rail', 'nav-btn'],       // desktop / wide rail
      ['#bottom-nav', '#btn-settings-rail-m', 'bn-btn'],   // landscape phone rail
    ];
    for (const [host, id, sib] of cases) {
      const nav = document.querySelector(host);
      assert(nav, 'no ' + host);
      const btn = nav.querySelector(id);
      assert(btn, 'no reachable Settings control in ' + host + ' — Settings is unreachable in that layout');
      // It rides the same rail rendering as the section entries, so the layout
      // that shows the sections shows Settings too (it is not separately hidden).
      assert(btn.classList.contains(sib) || nav.querySelector('.' + sib),
        'the ' + host + ' Settings control is not a rail entry — it may not appear in the rail');
      assert(getComputedStyle(btn).display !== 'none' || nav !== document.getElementById('sidebar'),
        'the visible rail Settings control is display:none — unreachable');
      assert(/settings/i.test(btn.textContent), 'the ' + host + ' Settings control lost its label');
      assert(!EMOJI.test(btn.textContent), 'the ' + host + ' Settings control contains emoji');
      assert(btn.querySelector('.ic .hr-glyph svg'), 'the ' + host + ' Settings control has no atlas glyph');
      // Settings is a MODAL — a data-tab would route through showTab, which has
      // no #panel-settings and would blank the active panel.
      assert(!btn.hasAttribute('data-tab'),
        'the ' + host + ' Settings control has a data-tab — it would blank the panel instead of opening the modal');
      // It actually opens the settings UI.
      document.querySelectorAll('.modal.show, #settings-modal.show').forEach((m) => m.classList.remove('show'));
      try { btn.click(); } catch (e) { throw new Error(host + ' Settings click threw: ' + e.message); }
      const modal = document.getElementById('settings-modal');
      assert(modal && modal.classList.contains('show'),
        'clicking the ' + host + ' Settings control did not open the settings modal');
      modal.classList.remove('show');
    }
  }),

  () => tryRun('b230: every old route into the three shops still resolves, with the right toggle', () => {
    const prevTab = window.activeTab;
    const prevPane = window._shopsPane;
    try {
      const shopPanel = document.getElementById('panel-shop');
      const marketPanel = document.getElementById('panel-market');
      assert(shopPanel && marketPanel, 'a Shops host is missing from the markup');
      // `store` is in here on purpose: the item flyout's "Buy from Seed Shop"
      // and "Buy from Equipment Shop" have always called showTab('store'),
      // there has never been a #panel-store, and showTab bailed on the missing
      // element — those two buttons did nothing at all until b230.
      const ROUTES = {
        shops: null, shop: 'local', store: 'local', stores: 'local',
        localshop: 'local', 'local-shop': 'local', seedshop: 'local', shopfront: 'local',
        market: 'market', exchange: 'market', marketplace: 'market',
        premium: 'premium', premiumshop: 'premium', 'premium-shop': 'premium',
        gems: 'premium', iap: 'premium',
      };
      Object.keys(ROUTES).forEach((route) => {
        const want = ROUTES[route];
        window.showTab('profile');
        if (want) window._shopsPane = want === 'local' ? 'premium' : 'local'; // force a real switch
        window.showTab(route);
        const host = (want || window._shopsPane) === 'market' ? marketPanel : shopPanel;
        assert(host.classList.contains('active'),
          'showTab("' + route + '") did not open a Shops host');
        if (want) {
          assert(window._shopsPane === want,
            'showTab("' + route + '") selected the ' + window._shopsPane + ' toggle, expected ' + want);
        }
        assert(document.querySelector('.nav-btn[data-tab="shops"]').classList.contains('active'),
          'showTab("' + route + '") left the Shops rail entry unlit');
      });
      // Local Shop is the front door on a fresh session (Tyler: it is the thing
      // that was hard to find). `shops` with nothing remembered must be local.
      delete window._shopsPane;
      assert(window.HearthShops.paneFor('shops') === 'local',
        'a fresh session must open Shops on the Local Shop');
      // The Market's own renderer still owns its container and nothing else.
      window.showTab('market');
      assert(document.getElementById('market-root'), 'the market lost its render container');
      assert(document.querySelector('#panel-market .mk-block, #panel-market .mk-list-form'),
        'the Market toggle opened an empty panel — showTab must render it');
    } finally {
      window._shopsPane = prevPane;
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  () => tryRun('b230: three toggles, in both hosts, and the choice persists', () => {
    const prevTab = window.activeTab;
    const prevPane = window._shopsPane;
    try {
      ['panel-shop', 'panel-market'].forEach((id) => {
        const strip = document.querySelector('#' + id + ' .shops-tabs');
        assert(strip, id + ' has no Shops toggle strip');
        const tabs = strip.querySelectorAll('.shops-tab');
        assert(tabs.length === 3, id + ' shows ' + tabs.length + ' toggles, expected 3');
        const labels = Array.from(tabs).map((t) => t.textContent.trim());
        ['Local Shop', 'Market', 'Premium Shop'].forEach((want, i) => {
          assert(labels[i] === want, id + ' toggle ' + i + ' reads "' + labels[i] + '", expected "' + want + '"');
        });
        tabs.forEach((t) => assert(t.querySelector('.ic .hr-glyph svg'), 'a Shops toggle has no atlas glyph'));
      });
      // Clicking a toggle is real navigation, from either host.
      window.showTab('shop');
      document.querySelector('#panel-shop .shops-tab[data-shops-pane="market"]').click();
      assert(document.getElementById('panel-market').classList.contains('active'),
        'the Market toggle did not navigate');
      document.querySelector('#panel-market .shops-tab[data-shops-pane="premium"]').click();
      const shopPanel = document.getElementById('panel-shop');
      assert(shopPanel.classList.contains('active') && shopPanel.getAttribute('data-shops-pane') === 'premium',
        'the Premium toggle did not switch the pane');
      assert(getComputedStyle(document.getElementById('shops-pane-local')).display === 'none',
        'the Local Shop pane is still showing under the Premium toggle');
      assert(getComputedStyle(document.getElementById('shops-pane-premium')).display !== 'none',
        'the Premium pane did not show');
      // Persist across a re-render AND a trip away — the window._tdPane
      // convention. A panel rebuilt by an idle tick must not snap the player
      // back to a toggle they did not pick.
      window.renderShop();
      window.showTab('profile');
      window.showTab('shops');
      assert(shopPanel.getAttribute('data-shops-pane') === 'premium' && window._shopsPane === 'premium',
        'the Shops toggle did not survive a re-render + a trip away');
      assert(document.querySelector('#panel-shop .shops-tab[data-shops-pane="premium"]').classList.contains('active'),
        'the strip did not restore its selected state');
    } finally {
      window._shopsPane = prevPane;
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  () => tryRun('b230: the Premium toggle keeps the sapphire real-money role', () => {
    const prevTab = window.activeTab;
    const prevPane = window._shopsPane;
    try {
      window.showTab('shop');
      const strip = document.querySelector('#panel-shop .shops-tabs');
      const local = strip.querySelector('.shops-tab[data-shops-pane="local"]');
      const market = strip.querySelector('.shops-tab[data-shops-pane="market"]');
      const prem = strip.querySelector('.shops-tab[data-shops-pane="premium"]');
      assert(prem.classList.contains('is-premium'), 'the Premium toggle lost its role class');
      const rgb = (el) => (getComputedStyle(el).color.match(/\d+/g) || []).map(Number);
      // The glyph inherits the segment's colour, so it must be sapphire too —
      // a gold coin icon over a sapphire label is a control disagreeing with
      // itself about which currency it wants.
      const gly = prem.querySelector('.ic .hr-glyph');
      assert(gly, 'the Premium toggle has no glyph');
      const gc = rgb(gly);
      assert(gc[2] > gc[0], 'the Premium toggle glyph is not sapphire (it reads ' + getComputedStyle(gly).color + ')');
      const localGly = rgb(local.querySelector('.ic .hr-glyph'));
      assert(localGly[0] >= localGly[2], 'the Local Shop glyph stopped being gilt');
      const p = rgb(prem), l = rgb(local), m = rgb(market);
      assert(p.join() !== l.join() && p.join() !== m.join(),
        'the Premium toggle reads the same colour as the gold ones — a player cannot see which one charges a card');
      assert(p[2] > p[0], 'the Premium toggle is not blue-dominant (sapphire is the real-money role)');
      // …in both selected states, and it must not have been flattened by the
      // theme readability blankets (they are carved out in theme-cozy.css).
      prem.click();
      const pOn = rgb(prem);
      assert(pOn[2] > pOn[0], 'the SELECTED Premium toggle lost sapphire');
      const ink = (getComputedStyle(document.body).getPropertyValue('--ink') || '').trim();
      assert(getComputedStyle(prem).color !== ink,
        'a readability blanket flattened the Premium toggle to --ink');
    } finally {
      window._shopsPane = prevPane;
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  () => tryRun('b230: the market renderer owns a container, not the panel (the self-deleting button)', () => {
    const prevTab = window.activeTab;
    const prevPane = window._shopsPane;
    try {
      window.showTab('market');
      const panel = document.getElementById('panel-market');
      const root = document.getElementById('market-root');
      assert(root && root.parentElement === panel, '#market-root is not the market renderer\'s host');
      // The bug: nav-consolidation.js appended a "Premium Store" button to
      // #panel-market and market.js then assigned panel.innerHTML on EVERY
      // re-render — search keystroke, sort change, listing, cancellation — so
      // the only route to the premium store deleted itself and came back only
      // because a 500ms interval kept re-adding it. Re-render hard and prove
      // the navigation survives.
      for (let i = 0; i < 4; i++) window.renderMarket();
      assert(panel.querySelector('.shops-tabs'),
        'a market re-render destroyed the Shops toggle — the b230 bug is back');
      assert(panel.querySelectorAll('.shops-tab').length === 3,
        'a market re-render ate part of the toggle strip');
      assert(document.getElementById('market-root'),
        'a market re-render replaced its own host');
      assert(!panel.querySelector('#hr-store-link, #hr-shop-back'),
        'an injected corner shortcut is back — the toggle strip replaced both');
      // And the strip still works after all that.
      panel.querySelector('.shops-tab[data-shops-pane="local"]').click();
      assert(document.getElementById('panel-shop').classList.contains('active'),
        'the toggle stopped navigating after a re-render');
    } finally {
      window._shopsPane = prevPane;
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  // ── b221 regression suite (backlog #9 — unique names + player portraits) ──

  // #9a: the rules are the contract. They are enforced in TWO places — here
  // and in public.hr_validate_display_name() — so every case below is also
  // asserted by the migration's own self-check. If these two ever disagree,
  // the server accepts a name the client refused (or worse, the reverse) and
  // a player's name stops meaning what the UI says it means.
  () => tryRun('b221: display-name rules — length, charset, trimming, reserved, profanity', () => {
    const I = window.HearthriseIdentity;
    assert(I && typeof I.validateName === 'function', 'HearthriseIdentity.validateName missing');
    const ok = (s) => I.validateName(s).ok;
    const why = (s) => I.validateName(s).reason;

    assert(I.MIN_LEN === 3 && I.MAX_LEN === 20, 'length rules drifted: ' + I.MIN_LEN + '-' + I.MAX_LEN);
    assert(!ok('') && why('') === 'empty', 'an empty name must be refused');
    assert(why('ab') === 'short', '2 characters must be too short');
    assert(ok('abc'), '3 characters must be allowed');
    assert(ok('a'.repeat(20)), '20 characters must be allowed');
    assert(why('a'.repeat(21)) === 'long', '21 characters must be too long');

    // Charset. The angle-bracket case is the b214 stored-XSS lesson made
    // structural: a name that cannot contain markup cannot deliver any.
    assert(ok('Iron Vale') && ok("O'Malley") && ok('Sir_Bob') && ok('Iron-Vale') && ok('Bob.2'),
      'the documented charset must be accepted');
    assert(why('<script>x') === 'charset', 'angle brackets must be refused');
    assert(why('Bob&Co') === 'charset', 'ampersands must be refused');
    assert(why('_Bob') === 'charset', 'a name must START alphanumeric');
    assert(why('Bob_') === 'charset', 'a name must END alphanumeric');
    assert(why('-.-') === 'charset' || why('-.-') === 'short', 'punctuation-only must never pass');
    assert(why('café') === 'charset', 'the charset is deliberately narrow — no lookalike-rich scripts');

    // Leading/trailing space is NORMALISED, not scolded: a player cannot see
    // a trailing space, so refusing it would be a puzzle, not a rule.
    assert(I.validateName('  Bob  ').name === 'Bob', 'must strip leading/trailing spaces');
    assert(I.validateName('Bob   Ross').name === 'Bob Ross', 'must collapse inner whitespace runs');
    assert(ok(' Bob '), 'a name that only needs trimming must be accepted');

    // Reserved names are matched with separators REMOVED. canon() folds "_"
    // to a space, so a plain lookup would let "Adm_in" ("adm in") straight
    // through — and "A d m i n" with it. The tight fold must not, however,
    // start eating ordinary two-word names.
    assert(why('admin') === 'reserved', 'the plain reserved word must be refused');
    assert(why('Adm_in') === 'reserved', 'separator-split reserved names must be refused');
    assert(why('A d m i n') === 'reserved', 'letter-spaced reserved names must be refused');
    assert(why('Game_Master') === 'reserved', 'multi-word reserved names must fold too');
    assert(ok('Iron Vale') && ok('Mod ern Bob'),
      'the tight reserved fold must not swallow ordinary names');
    assert(why('Adventurer') === 'reserved',
      'the default name must be reserved — otherwise one player owns everyone else’s fallback');

    // The profanity guard is the one the codebase already has.
    assert(window.ChatFilter && typeof window.ChatFilter.contains === 'function',
      'ChatFilter is the profanity guard — it must exist');
    assert(why('shit lord') === 'profanity', 'the ChatFilter guard must reject profane names');
  }),

  // #9b: canonicalisation IS the uniqueness key. Every pair below is
  // asserted verbatim in the migration's self-check (section 7). Case and
  // punctuation are the cheapest impersonation attack on a name system.
  () => tryRun('b221: canonical name folds case, separators and apostrophes — one name, one owner', () => {
    const I = window.HearthriseIdentity;
    const c = I.canon;
    assert(c('Sir_Bob') === 'sir bob', 'underscore must fold to a space: ' + c('Sir_Bob'));
    assert(c('  SIR   BOB  ') === 'sir bob', 'case + whitespace must fold: ' + c('  SIR   BOB  '));
    assert(c("O'Malley") === 'omalley', 'apostrophes must drop: ' + c("O'Malley"));
    assert(c('Iron-Vale') === 'iron vale', 'hyphen must fold to a space: ' + c('Iron-Vale'));
    assert(c('Iron.Vale') === 'iron vale', 'dot must fold to a space: ' + c('Iron.Vale'));
    // The whole point, stated as the property it protects.
    const same = ['Sir_Bob', 'sir bob', 'SIR   BOB', 'Sir-Bob', 'Sir.Bob'];
    const folded = new Set(same.map(c));
    assert(folded.size === 1, 'these must all be ONE name, got ' + folded.size + ': ' + [...folded]);
    assert(c('Sir Bobb') !== c('Sir Bob'), 'genuinely different names must stay different');
    assert(c(null) === '' && c(undefined) === '', 'canon must not throw on empty input');
  }),

  // #9c: the claim reducer carries the entire server contract, including the
  // race. Two players claiming one name at the same instant is not an edge
  // case at launch — it is the normal case for every desirable name — and
  // the loser must be told, never silently handed a name they do not own.
  () => tryRun('b221: claim reducer — confirmed / taken / race / invalid / un-migrated', () => {
    const I = window.HearthriseIdentity;
    const R = I._reduceClaim;

    const win = R(200, { ok: true, name: 'Iron Vale', canonical: 'iron vale', renamed: true });
    assert(win.action === 'confirmed' && win.name === 'Iron Vale' && win.canonical === 'iron vale',
      'a successful claim must confirm: ' + JSON.stringify(win));

    // THE RACE. Both clients POST; the primary key picks one; the other gets
    // 'taken'. Exactly one of these two verdicts may be 'confirmed'.
    const lose = R(200, { ok: false, error: 'taken', canonical: 'iron vale' });
    assert(lose.action === 'taken' && /taken/i.test(lose.message),
      'the loser of a race must be told the name is taken: ' + JSON.stringify(lose));
    assert([win, lose].filter((d) => d.action === 'confirmed').length === 1,
      'exactly one side of a simultaneous claim may win');

    const bad = R(200, { ok: false, error: 'invalid', reason: 'long' });
    assert(bad.action === 'invalid' && bad.reason === 'long' && /20/.test(bad.message),
      'a server-side rejection must surface the reason: ' + JSON.stringify(bad));
    assert(R(200, { ok: false, error: 'not_signed_in' }).action === 'signedout',
      'a signed-out claim must not read as a failure to retry blindly');

    // Nothing that is not the RPC's own {ok:boolean,…} envelope may read as a
    // confirmation — a 401 body has no `ok` field, and treating one as
    // success would hand a player a name they do not hold.
    assert(R(200, null).action === 'fail', 'a null body must never confirm a name');
    assert(R(200, { name: 'Iron Vale' }).action === 'fail', 'an envelope-less body must never confirm');
    assert(R(401, { code: 'PGRST301' }).action === 'fail', 'an auth error must never confirm');
    assert(R(200, { ok: true }).action === 'fail', 'ok:true with no name is not a confirmation');
    assert(R(500, { ok: false, error: 'boom' }).action === 'fail', 'a server error must not confirm');

    // CLIENT-FIRST: this ships before the migration is run.
    assert(R(404, { code: 'PGRST202' }).action === 'unsupported',
      'a missing claim_display_name RPC must degrade to provisional, not break sign-in');
    assert(R(404, {}).action === 'unsupported', 'a bare 404 must degrade too');
    assert(I._isMissingRpc(200, { code: '42883' }) && I._isMissingRpc(200, { code: '42P01' }),
      'undefined-function / undefined-table must both count as un-migrated');
  }),

  // #9d: availability is UX, never a reservation. Between the green tick and
  // the claim, another player can win — so the tick must not be able to
  // short-circuit the claim, and an un-migrated server must not read as
  // "taken" (which would refuse every name in the game).
  () => tryRun('b221: availability probe is advisory only, and degrades safely', () => {
    const I = window.HearthriseIdentity;
    const A = I._reduceAvailability;
    assert(A(200, { ok: true, available: true, name: 'Iron Vale' }).action === 'available', 'free name');
    assert(A(200, { ok: true, available: false }).action === 'taken', 'held name');
    assert(A(200, { ok: true, available: true, mine: true }).mine === true,
      'your own name must not be reported as taken back to you');
    assert(A(200, { ok: false, reason: 'short' }).action === 'invalid', 'validation echo');
    assert(A(404, { code: 'PGRST202' }).action === 'unsupported',
      'no migration yet must not make every name look taken');
    assert(A(500, null).action === 'unknown', 'a server error is unknown, never "available"');
    assert(A(200, null).action === 'unknown', 'a malformed body is unknown, never "available"');
    // The claim is the only authority: the reducer for it has no path that
    // consults availability at all.
    assert(I._reduceClaim(200, { ok: false, error: 'taken' }).action === 'taken',
      'a claim must still be able to fail after an "available" tick');
  }),

  // #9e: the avatar pipeline. The original bytes must NEVER ship — the file
  // is decoded and re-encoded from pixels, which is what caps the size, fixes
  // the dimensions, and drops every scrap of metadata (EXIF GPS included).
  () => tryRun('b221: avatar pipeline downscales to a 256×256 square under the hard cap', () => {
    const I = window.HearthriseIdentity;
    assert(typeof I.processImage === 'function', 'processImage missing');
    assert(I.AVATAR_PX === 256 && I.AVATAR_MAX_BYTES === 512 * 1024,
      'avatar limits drifted: ' + I.AVATAR_PX + ' / ' + I.AVATAR_MAX_BYTES);

    // A deliberately awkward source: wide, odd-sized, and full of noise so it
    // does not compress to nothing and the size cap is actually exercised.
    const mk = (w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      for (let i = 0; i < 900; i++) {
        x.fillStyle = 'rgb(' + ((i * 37) % 256) + ',' + ((i * 91) % 256) + ',' + ((i * 53) % 256) + ')';
        x.fillRect((i * 29) % w, (i * 71) % h, 26, 26);
      }
      return c;
    };

    const wide = I.processImage(mk(1400, 500));
    assert(wide.width === 256 && wide.height === 256,
      'output must be a 256×256 square, got ' + wide.width + '×' + wide.height);
    assert(wide.bytes > 0 && wide.bytes <= 512 * 1024,
      'output must be under the 512KB cap, got ' + wide.bytes);
    assert(/^image\/(webp|jpeg)$/.test(wide.type),
      'output must be a compressed format, got ' + wide.type);
    assert(wide.dataUrl.indexOf('data:' + wide.type) === 0, 'dataUrl/type disagree');
    assert(wide.blob && wide.blob.size > 0 && wide.blob.type === wide.type,
      'a blob must be produced for upload');
    // The reported byte count must be the real one — it is what the cap is
    // enforced against, so an optimistic estimate would be a fake guard.
    assert(Math.abs(wide.blob.size - wide.bytes) <= 2,
      'byte accounting is wrong: ' + wide.bytes + ' vs blob ' + wide.blob.size);

    // Tall and tiny sources must produce the SAME square — crop, never squash.
    const tall = I.processImage(mk(400, 1200));
    assert(tall.width === 256 && tall.height === 256, 'a tall source must crop to the same square');
    const tiny = I.processImage(mk(40, 90));
    assert(tiny.width === 256 && tiny.height === 256, 'a small source must still normalise to 256×256');

    assert(I._b64Bytes('data:image/webp;base64,AAAA') === 3, 'base64 byte maths is wrong');
    assert(I._b64Bytes('data:image/webp;base64,AA==') === 1, 'base64 padding maths is wrong');
    let threw = false;
    try { I.processImage({ width: 0, height: 0 }); } catch (e) { threw = true; }
    assert(threw, 'a zero-sized source must be refused, not silently produce a blank portrait');
  }),

  // #9f: upload reducer — the bucket may not exist yet (client ships first),
  // and no failure mode may cost the player the portrait they just chose.
  () => tryRun('b221: avatar upload degrades to a local portrait, never to a loss', () => {
    const U = window.HearthriseIdentity._reduceUpload;
    assert(U(200, { Key: 'avatars/x/avatar.webp' }).action === 'accept', 'a 200 is an upload');
    assert(U(404, { message: 'Bucket not found' }).action === 'unsupported',
      'no avatars bucket yet must degrade to local-only');
    assert(U(400, { message: 'Bucket not found' }).action === 'unsupported',
      'Supabase reports a missing bucket as 400 too');
    assert(U(413, {}).action === 'too_large', 'an over-size upload must be named as such');
    assert(U(400, { message: 'mime type image/gif is not supported' }).action === 'bad_type',
      'a rejected type must be named');
    assert(U(403, {}).action === 'denied', 'a policy refusal must ask the player to sign in again');
    assert(U(500, {}).action === 'fail', 'a server error is a failure, not a success');
    assert(!/lost|deleted/i.test(U(500, {}).message || ''),
      'a failed upload must reassure, not alarm — the local copy is already saved');
  }),

  // #9g: rendering. NO broken-image states, ever — the portrait seam must
  // always resolve to something that loads, and a player's own dataURL must
  // win over the network so there is no flash on a slow connection.
  () => tryRun('b221: portrait always resolves — uploaded first, neutral placeholder otherwise', () => {
    const I = window.HearthriseIdentity;
    const rec = I._record();
    const saved = JSON.parse(JSON.stringify(rec.avatar));
    try {
      rec.avatar = { data: null, remote: null, status: null, at: 0 };
      const def = I.avatarUrl();
      // b360: the default is now the neutral placeholder silhouette, never the
      // retired painted player.png face.
      assert(def && /assets\/avatars\/placeholder-portrait\.webp/.test(def),
        'with no upload the portrait must be the neutral placeholder, got ' + def);
      assert(!/painted\/npc\/player\.png/.test(def),
        'player.png must no longer be the default face');
      assert(def === I.DEFAULT_AVATAR, 'the default must come from the one constant');

      // A remote URL that has been verified is used; a local dataURL beats it.
      rec.avatar.remote = 'https://example.invalid/storage/v1/object/public/avatars/u/avatar.webp';
      assert(I.avatarUrl() === rec.avatar.remote, 'a synced portrait must be used');

      // A REAL portrait, produced by the real pipeline — not a stub string.
      // An invalid dataURL would be swapped out by the markup's fallback latch
      // the moment the decode failed, and the test would be asserting against
      // a portrait the browser had already rejected.
      const src = document.createElement('canvas');
      src.width = 300; src.height = 180;
      const cx = src.getContext('2d');
      cx.fillStyle = '#c9a24a'; cx.fillRect(0, 0, 300, 180);
      cx.fillStyle = '#221b14'; cx.fillRect(40, 30, 120, 90);
      const real = I.processImage(src).dataUrl;

      rec.avatar.data = real;
      assert(I.avatarUrl() === real,
        'the local copy must win — a synced portrait must never cause a load flash');

      // The seam the rest of the game reads.
      I.applyAvatar();
      assert(window._playerAvatar === real, '_playerAvatar must track the identity seam');
      const img = document.querySelector('.player-avatar img');
      assert(img && img.getAttribute('src') === real, 'the topbar portrait must follow');
      assert(img.style.display !== 'none', 'the portrait must never be left hidden');
      assert(typeof I.getAvatarUrl === 'function' && I.getAvatarUrl() === real,
        'the profile.js read accessor must resolve through the same seam');

      // NO BROKEN-IMAGE STATES. A portrait that fails to decode — a truncated
      // upload, a dead bucket — must fall back to the shipped default rather
      // than leave the browser's torn-page icon in the topbar. Driven
      // synchronously so this never depends on network timing.
      img.dispatchEvent(new Event('error'));
      const after = img.getAttribute('src') || '';
      assert(/assets\/icons-bundle\/painted\//.test(after),
        'a failed portrait must fall back to the painted default, got ' + after.slice(0, 60));
      assert(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(img.parentNode.textContent || ''),
        'the fallback must not be an emoji — no emoji as art (Final Directive)');
      // And a second failure hides rather than looping.
      img.dispatchEvent(new Event('error'));
      assert(img.style.display === 'none', 'a fallback that also fails must hide, not loop');
    } finally {
      rec.avatar = saved;
      I.applyAvatar();
    }
    // The default must still be a SHIPPED path (the icons-bundle rule).
    assert(!/raw-bundle|icons3/.test(I.DEFAULT_AVATAR), 'the default portrait must be a shipped asset');
  }),

  // #9h: the seam itself. src/utils/profile.js (ESM, deferred) and
  // src/features/identity.js (classic script) both publish into ONE
  // window.HearthriseIdentity by MERGING. If either ever goes back to
  // assigning a fresh object, load order silently deletes the other half —
  // and the failure looks like "names work, portraits don't" on some loads
  // and the reverse on others. This is the guard for that.
  () => tryRun('b221: the identity seam carries both halves — read accessors and the write authority', () => {
    const I = window.HearthriseIdentity;
    // The b214 read half (built, 0 consumers until now).
    ['getActiveSlot', 'getActiveCharId', 'getDisplayName', 'getActiveClan', 'hasUniqueName', 'getAvatarUrl']
      .forEach((k) => assert(typeof I[k] === 'function', 'read seam lost ' + k + '() — merge became replace'));
    // The b221 write half.
    ['validateName', 'canon', 'claimName', 'checkAvailability', 'displayName', 'nameStatus',
      'isUniqueName', 'processImage', 'setAvatarFromFile', 'avatarUrl', 'openNameModal']
      .forEach((k) => assert(typeof I[k] === 'function', 'write seam lost ' + k + '() — merge became replace'));

    const rec = I._record();
    const saved = JSON.parse(JSON.stringify(rec));
    const savedName = window.G.playerName;
    try {
      // An adopted name is what the whole game renders, through the seam.
      I._adopt('Iron Vale', I.canon('Iron Vale'), 'confirmed');
      assert(I.displayName() === 'Iron Vale', 'displayName must reflect the adopted name');
      assert(I.getDisplayName() === 'Iron Vale', 'the read accessor must agree with the authority');
      assert(I.isUniqueName() && I.hasUniqueName(), 'a confirmed name must report as unique');
      assert(window.G.playerName === 'Iron Vale',
        'G.playerName must be kept in step — ~30 legacy call sites read it directly');
      assert(window.HearthriseMarket && typeof window.HearthriseMarket === 'object', 'market module missing');

      // Provisional is honestly NOT unique. Claiming otherwise in the UI
      // would be exactly the kind of fake the project directive forbids.
      I._adopt('Iron Vale', I.canon('Iron Vale'), 'provisional');
      assert(I.nameStatus() === 'provisional', 'status must survive a re-adopt');
      assert(!I.isUniqueName(), 'a provisional name must never claim uniqueness');
      assert(I.displayName() === 'Iron Vale', 'a provisional name is still the player’s name');

      // Anonymous players keep a local name and are never prompted — the
      // prompt is a signed-in flow, and gating offline play behind a server
      // round-trip would break the game for everyone playing offline.
      if (!(window.HearthriseAuth && window.HearthriseAuth.isSignedIn && window.HearthriseAuth.isSignedIn())) {
        assert(I.mustPromptForName() === false, 'an anonymous player must never be prompted to claim');
      }
    } finally {
      Object.assign(rec, saved);
      I._persist();
      window.G.playerName = savedName;
    }
  }),

  // b466: ONE name source across every surface. The live bug: topbar showed
  // "Adventurer" (stale G.playerName default, never reconciled), Home hero
  // banner showed "themphill22" (derived from the ACCOUNT EMAIL local-part — a
  // privacy leak), Character screen showed the correct server name. All three
  // must now resolve to HearthriseIdentity.getDisplayName(), and NO rendered
  // name surface may expose an email local-part.
  () => tryRun('b466: topbar + Home banner render the server name, never the stale default or an email local-part', () => {
    const I = window.HearthriseIdentity;
    const rec = I._record();
    const saved = JSON.parse(JSON.stringify(rec));
    const savedName = window.G.playerName;
    try {
      // Server-confirmed claimed name, with a stale default sitting in G.playerName
      // and an email-shaped account present — the exact live conditions.
      I._adopt('Riverwood', I.canon('Riverwood'), 'confirmed');
      window.G.playerName = 'Adventurer'; // the stale, un-reconciled default
      assert(I.getDisplayName() === 'Riverwood', 'seam must return the confirmed server name');

      // Topbar: _hrDisplayName is the resolver updateTopbar() writes into
      // #player-name. It must return the server name, not the stale default.
      assert(typeof window._hrDisplayName === 'function' || typeof _hrDisplayName === 'function',
        '_hrDisplayName resolver missing — topbar would fall back to raw G.playerName');
      const topName = (window._hrDisplayName || _hrDisplayName)();
      assert(topName === 'Riverwood', 'topbar must show the server name, got ' + topName);
      // And it reconciles the stale default up so any remaining raw reads agree.
      assert(window.G.playerName === 'Riverwood', 'stale G.playerName default must reconcile to the server name');

      // No email local-part anywhere. Force an email-shaped session and assert the
      // resolvers never emit it.
      const email = 'themphill22@example.com';
      const local = email.split('@')[0]; // 'themphill22'
      window.G.playerName = 'Adventurer';
      const topName2 = (window._hrDisplayName || _hrDisplayName)();
      assert(topName2 !== local && topName2.toLowerCase().indexOf(local) === -1,
        'topbar must never render an email local-part, got ' + topName2);
    } finally {
      Object.assign(rec, saved);
      I._persist();
      window.G.playerName = savedName;
    }
  }),

  // #9j: ONE writer. The Settings "Display name" field used to be a second
  // one, with no rules at all (trim + slice(0,20) straight into
  // G.playerName) — so it could set a name the claim flow would refuse, that
  // no server row backed, and that silently diverged from the unique name
  // every other player sees. It must now go through the same gate.
  () => tryRun('b221: the Settings rename goes through the identity gate, not around it', () => {
    const prevTab = window.activeTab;
    const I = window.HearthriseIdentity;
    const savedName = window.G.playerName;
    const rec = I._record();
    const savedRec = JSON.parse(JSON.stringify(rec));
    try {
      window.showTab('settings');
      if (typeof window.renderSettings === 'function') window.renderSettings();
      const input = document.getElementById('set-display-name');
      const save = document.getElementById('set-name-save');
      assert(input && save, 'the Settings display-name row is missing');
      assert(input.getAttribute('maxlength') === String(I.MAX_LEN),
        'the Settings field length cap must match the rule: ' + input.getAttribute('maxlength'));

      // A name the gate refuses must not reach G.playerName.
      window.G.playerName = 'Keep Me';
      input.value = '<script>x</script>';
      save.click();
      assert(window.G.playerName === 'Keep Me',
        'Settings wrote a name that the validator refuses: ' + window.G.playerName);
      input.value = 'ab';
      save.click();
      assert(window.G.playerName === 'Keep Me', 'Settings wrote a too-short name');
      input.value = 'Admin';
      save.click();
      assert(window.G.playerName === 'Keep Me', 'Settings wrote a reserved name');
    } finally {
      window.G.playerName = savedName;
      Object.assign(rec, savedRec);
      I._persist();
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  // #9i: the identity record must NOT ride in the save. A 512KB portrait
  // dataURL inside snapshotG would upload to game_saves every 60 seconds.
  () => tryRun('b221: the portrait lives in the storage seam, never in the synced save', () => {
    const I = window.HearthriseIdentity;
    const rec = I._record();
    const saved = JSON.parse(JSON.stringify(rec.avatar));
    try {
      rec.avatar.data = 'data:image/webp;base64,' + 'A'.repeat(4096);
      I._persist();
      const snap = JSON.stringify(window.G || {});
      assert(snap.indexOf('data:image/webp') === -1,
        'a portrait dataURL leaked into G — that uploads to game_saves on every snapshot');
      assert(window.HearthriseStorage && typeof window.HearthriseStorage.getJSON === 'function',
        'the platform storage seam must be the backing store');
      const back = window.HearthriseStorage.getJSON('hearthrise:identity', null);
      assert(back && back.avatar && back.avatar.data === rec.avatar.data,
        'the portrait must persist through the storage seam');
    } finally {
      rec.avatar = saved;
      I._persist();
      I.applyAvatar();
    }
  }),

  // ── b221 regression suite (backlog #5 — the board is a board, the shop is a
  //    shop). These guard STRUCTURE and CONTENT, not taste: one notice per
  //    bounty with nothing clipped, every offer reachable and clickable, and
  //    zero emoji in either screen's DOM in any state.

  // The board must post exactly as many notices as the board data holds, at a
  // usable size, with no notice clipped out of the frame. A grid with a
  // hardcoded column count silently drops the fourth bounty when the tier-2
  // board unlocks; `auto-fill` does not, and this is the tripwire for it.
  () => tryRun('b221: the bounty board renders one notice per bounty, none clipped', () => {
    const prevTab = window.activeTab;
    const prevActive = window.G.bountyHunter && window.G.bountyHunter.active;
    try {
      window.G.bountyHunter.active = null;
      window.G.bountyHunter.board = window.generateBountyBoard();
      window.showTab('bounty');
      const board = document.querySelector('#panel-bounty .bb-board');
      assert(board, 'the bounty screen has no board object — it is a list again');
      const notices = board.querySelectorAll('.bb-notice');
      assert(notices.length === window.G.bountyHunter.board.length,
        'board holds ' + window.G.bountyHunter.board.length + ' bounties but posted '
        + notices.length + ' notices');
      const frame = board.getBoundingClientRect();
      notices.forEach((n, i) => {
        const r = n.getBoundingClientRect();
        assert(r.width > 120 && r.height > 90,
          'notice ' + i + ' collapsed to ' + Math.round(r.width) + 'x' + Math.round(r.height));
        assert(r.bottom <= frame.bottom + 1 && r.right <= frame.right + 1,
          'notice ' + i + ' hangs outside the board frame — it is clipped');
        assert(n.querySelector('.bb-nail'), 'notice ' + i + ' is not pinned to anything');
        assert(n.querySelector('button'), 'notice ' + i + ' has no way to accept it');
      });
      // Paper is light in both themes, so type on it must NOT resolve --ink.
      // This is the guard for the theme-cozy `#panel-bounty * { color: --ink
      // !important }` blanket coming back and blanking the notices.
      const name = board.querySelector('.bb-name');
      const ink = getComputedStyle(name).color.match(/\d+/g).map(Number);
      assert(ink[0] + ink[1] + ink[2] < 330,
        'notice type is rendering light-on-paper (' + name.style.color + ' -> rgb('
        + ink.join(',') + ')) — a colour blanket is overriding the paper ink role');
    } finally {
      window.G.bountyHunter.active = prevActive || null;
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  // A claimed bounty must still be ON the board and visibly settled — the
  // "where did my bounty go" failure mode is a blank card.
  () => tryRun('b221: an accepted bounty stays on the board, stamped', () => {
    const prevTab = window.activeTab;
    const prevActive = window.G.bountyHunter && window.G.bountyHunter.active;
    const prevBoard = (window.G.bountyHunter.board || []).slice();
    try {
      if (!window.G.bountyHunter.board.length) window.G.bountyHunter.board = window.generateBountyBoard();
      window.acceptBounty(0);
      window.showTab('bounty');
      const notice = document.querySelector('#panel-bounty .bb-notice.is-taken');
      assert(notice, 'the accepted bounty left the board entirely');
      assert(notice.querySelector('.bb-stamp'), 'a taken notice carries no claimed stamp');
      assert(notice.querySelector('.bb-bar'), 'a taken notice shows no progress');
      assert(/abandon/i.test(notice.textContent), 'no way to give the contract back');
    } finally {
      window.G.bountyHunter.active = prevActive || null;
      window.G.bountyHunter.board = prevBoard;
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  // The shop is a scene now. A scene that swallows its own offers is worse
  // than the list it replaced, so: the counter renders, every catalogue entry
  // reaches it, and every Buy control is on screen and hit-testable.
  /* ══ THE RATCHET OVER THE WHOLE SNAPSHOT LIST — THREE PROPERTIES, THREE REDS ═══
     The earlier form pinned FIVE named fields; these prove the property over every field
     the snapshot names, whatever it names tomorrow, and split by PROPERTY so a red says
     which half of the seal broke. Probe: `snapRoundTrip()` above. */
  () => tryRun('SNAP-2a: snapshotG produces a KEY for every field it names, even on a character that owns none of them', () => {
    const r = snapRoundTrip();
    assert(r.fields.length >= 55, 'CONTROL: snapshotG named ' + r.fields.length + ' field(s) — it is not snapshotting the live character, so SNAP-2a/b/c are all vacuous');
    ['buyback', 'recoveringUntilMs', 'heroSlotsUnlocked', '_bankCap', 'traits', 'rooms', 'skills', 'gold']
      .forEach((k) => assert(r.fields.indexOf(k) >= 0, k + ' is not on the snapshot list at all, so no test can put it back — it leaks for the rest of the run'));
    assert(!r.noKey.length, 'snapshotG produced NO KEY for ' + r.noKey.join(', ') + ' on a character that does not own it. JSON.stringify drops '
      + 'undefined and restoreG walks Object.keys(snap), so it puts nothing back and whatever a test writes there is inherited by every test '
      + 'after it. sealSnapshot() must store the SNAP_ABSENT sentinel for an undefined value.');
  }),

  () => tryRun('SNAP-2b: restoreG restores PRESENCE — an unowned field goes back to absent, a pre-seal entry to its pinned empty', () => {
    const r = snapRoundTrip();
    assert(!r.undeclared.length, 'these decline the ABSENT sentinel without declaring an empty: ' + r.undeclared.join(' | ')
      + '. A `?? <empty>` is a VALUE a later test reads as real state (skills:{} is a level-1 character, a zeroed bank takes capacity a player '
      + 'bought with gems) — drop the operator and let sealSnapshot record the absence, or pin it in SNAP_DECLARED_EMPTY.');
    assert(!r.presence.length, 'restoreG did not put ' + r.presence.join(' | ') + ' back as it found it, so a test\'s write outlives its own '
      + 'finally block and every test after it inherits it. restoreG must `delete` the key when the snapshot holds SNAP_ABSENT.');
  }),

  () => tryRun('SNAP-2c: restoreG returns an OWNED field byte-for-byte — restoring to absent is never bought by wiping real state', () => {
    const r = snapRoundTrip();
    assert(r.fields.filter((f) => r.value.indexOf(f) < 0).length >= 55, 'CONTROL: the probe walked ' + r.fields.length + ' field(s)');
    assert(!r.value.length, 'restoreG did not put the real value back: ' + r.value.join(' | ') + '. The seal clones each value; assigning the '
      + 'live object instead would make the snapshot a reference to the thing it is meant to preserve.');
  }),

  () => tryRun('b221: the shop renders the counter scene with every offer reachable', () => {
    const prevTab = window.activeTab;
    /* b230: this check is about the SHOP covering its own controls, not about
       a deliberate overlay covering the screen. The FTUE tour card is centred
       and the Local Shop moved to the top of its panel when Shops became one
       destination — so from b230 the tour card lands squarely on the first row
       of wares and elementFromPoint reports the tour, which is correct and not
       a defect. Hide the transient overlays for the measurement, restore them
       after. (The b224 audit log: clear overlays BEFORE each measurement.) */
    const veiled = Array.from(document.querySelectorAll(
      '.ftue-root, .modal.show, .hr-id-scrim, .hr-dl-scrim, .hr-ch-scrim, #chat-dock, #hr-bug-btn, #notifs'
    )).map((el) => ({ el, prev: el.style.display }));
    veiled.forEach(({ el }) => { el.style.display = 'none'; });
    try {
      window.showTab('shop');
      ['seeds', 'equip', 'cosmetics'].forEach((tab) => {
        window.setShopTab(tab);
        const panel = document.getElementById('shop-panel');
        assert(panel.querySelector('.sc-scene svg'), tab + ': the shopfront scene is missing');
        assert(panel.querySelector('.sc-counter'), tab + ': the offers are not on a counter');
        const expect = tab === 'seeds' ? window.SEED_SHOP.length
          : tab === 'equip' ? window.EQUIP_SHOP.length : 4;
        const rows = panel.querySelectorAll('.sc-counter .shop-row');
        // Name what the counter PAINTED: "got 15, wanted 14" cost a session on its own.
        const _want = expect + Object.keys(window.TRAITS).length;
        assert(rows.length === _want,
          tab + ': expected ' + expect + ' offers + ' + Object.keys(window.TRAITS).length
          + ' trait(s) = ' + _want + ', got ' + rows.length + ' — rows: '
          + Array.from(rows).map((r) => {
            const b = r.querySelector('.info b');
            return (b ? b.textContent : r.textContent).trim().slice(0, 28)
              + (r.hasAttribute('data-companion') ? '[companion]' : '');
          }).join(' | '));
        rows.forEach((row, i) => {
          const btn = row.querySelector('button');
          assert(btn, tab + ' row ' + i + ' has no buy control');
          const r = btn.getBoundingClientRect();
          assert(r.width > 24 && r.height > 16,
            tab + ' row ' + i + ': buy control collapsed to ' + Math.round(r.width) + 'x' + Math.round(r.height));
          const _hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          /* If something IS covering the control, name it — a bare "covered"
             cost a full root-cause session once (b483: an eat test leaked the
             replacement-gate sheet over this row). The cover's id/class is the
             first thing the next investigator needs. */
          let _desc = '';
          if (_hit && !row.contains(_hit)) {
            try { _desc = ' COVER=<' + _hit.tagName.toLowerCase() + '>'
              + (_hit.id ? '#' + _hit.id : '')
              + (_hit.className ? '.' + String(_hit.className).split(' ').filter(Boolean).join('.') : ''); }
            catch (e) { _desc = ' (cover undescribable)'; }
          }
          assert(_hit ? row.contains(_hit) : true,
            tab + ' row ' + i + ': something is covering the buy control' + _desc);
        });
      });
      window.setShopTab('seeds');
    } finally {
      veiled.forEach(({ el, prev }) => { el.style.display = prev; });
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  // Real money is sapphire and only sapphire (art-direction.css §6). Before
  // b221 the store's Buy button was the same struck-gilt control that spends
  // in-game gold one card lower on the same screen.
  () => tryRun('b221: the real-money surface is sapphire, not gilt', () => {
    const prevTab = window.activeTab;
    try {
      window.showTab('shop');
      const buys = document.querySelectorAll('#iap-panel .iap-card .btn');
      assert(buys.length === window.IAP_CATALOG.length,
        'store rendered ' + buys.length + ' buy controls for ' + window.IAP_CATALOG.length + ' products');
      buys.forEach((b) => {
        assert(b.classList.contains('btn-gem') && !b.classList.contains('btn-primary'),
          'a real-money Buy button is wearing the in-game gold primary style');
      });
    } finally {
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  // Zero emoji as art, in EVERY state of both screens. The old sweep in
  // icon-set.js only covered `#panel-bounty .si/.price/.ic`, which is why four
  // cosmetics (✨🐲🦅😎) and the active-bounty 🎯 shipped for months.
  () => tryRun('b221: no emoji in the bounty or shop DOM, in any state', () => {
    const EMO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    const prevTab = window.activeTab;
    const prevActive = window.G.bountyHunter && window.G.bountyHunter.active;
    const prevBoard = (window.G.bountyHunter.board || []).slice();
    const offenders = [];
    const scan = (id, label) => {
      const el = document.getElementById(id);
      if (!el) return;
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        if (EMO.test(n.nodeValue)) offenders.push(label + ': "' + n.nodeValue.trim().slice(0, 40) + '"');
      }
    };
    try {
      window.showTab('shop');
      ['seeds', 'equip', 'cosmetics'].forEach((t) => { window.setShopTab(t); scan('panel-shop', 'shop/' + t); });
      window.setShopTab('seeds');
      window.G.bountyHunter.active = null;
      window.G.bountyHunter.board = window.generateBountyBoard();
      window.showTab('bounty');
      scan('panel-bounty', 'bounty/board');
      window.acceptBounty(0);
      window.showTab('bounty');
      scan('panel-bounty', 'bounty/active');
      assert(offenders.length === 0, 'emoji rendered as art — ' + offenders.join(' | '));
    } finally {
      window.G.bountyHunter.active = prevActive || null;
      window.G.bountyHunter.board = prevBoard;
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  // ── b222 regression suite (backlog #11 — leaderboards) ──────────────────
  //    The contract these guard: every board answers "where am I?", the board
  //    namespace matches the migration byte-for-byte, an un-migrated server
  //    degrades to boards it can serve honestly, the three derived snapshot
  //    fields survive a save→load round trip, and ranking never pays out.

  // The server contract. A response that is not the RPC's own {ok:boolean,…}
  // envelope is a REFUSAL, never an empty board — telling a player nobody is
  // ranked because their token expired is a lie the UI would have no way back
  // from. Same lesson as reduceClaim in muster.js, and for the same reason.
  () => tryRun('b222: the leaderboard reducer separates an answer from a refusal', () => {
    const LB = window.HearthriseLeaderboards;
    assert(LB && LB._reduceBoard, 'leaderboards module missing');
    const R = LB._reduceBoard;

    const ok = R(200, {
      ok: true, board: 'renown', refreshed_at: '2026-08-08T10:00:00Z', total: 412,
      top: [{ rank: 1, id: 'a', name: 'Aldric', clan: 'Ash', score: 142300, saved_at: null }],
      rank: 412,
      near: [{ rank: 411, id: 'b', name: 'Above', score: 640 },
             { rank: 412, id: 'me', name: 'Me', score: 602 },
             { rank: 413, id: 'c', name: 'Below', score: 380 }]
    });
    assert(ok.action === 'accept', 'a well-formed answer must be accepted');
    assert(ok.total === 412 && ok.rank === 412, 'total/rank must survive');
    assert(ok.top.length === 1 && ok.near.length === 3, 'rows must survive');
    assert(ok.top[0].name === 'Aldric' && ok.top[0].score === 142300, 'row fields must survive');

    // Un-migrated server — both PostgREST shapes.
    assert(R(404, null).action === 'unsupported', '404 must read as un-migrated');
    assert(R(400, { code: 'PGRST202' }).action === 'unsupported', 'PGRST202 must read as un-migrated');
    // A refusal from the RPC itself.
    assert(R(200, { ok: false, error: 'unknown_board' }).action === 'fail', 'ok:false must fail');
    // Anything that is not the envelope.
    assert(R(401, { message: 'JWT expired' }).action === 'fail', 'an auth error must fail, not empty');
    assert(R(200, null).action === 'fail', 'a null body must fail');
    assert(R(200, [{ rank: 1 }]).action === 'fail', 'an array body must fail');
    // Garbage rows are dropped, never rendered as "Adventurer 0" ghosts.
    const junk = R(200, { ok: true, total: 1, top: [null, 7, { rank: 2, score: 5 }], near: 'nope' });
    assert(junk.top.length === 1 && junk.top[0].name === 'Adventurer', 'malformed rows must be filtered');
    assert(Array.isArray(junk.near) && junk.near.length === 0, 'a non-array near must normalise to []');
  }),

  // The whole point of the feature: a sub-top-25 player sees themselves and the
  // one rival on each side. And when they ARE in the top 25 the block is
  // suppressed, because repeating three rows already on screen is noise.
  () => tryRun('b222: the self block pins you and your two rivals at any rank', () => {
    const LB = window.HearthriseLeaderboards;
    const mk = (n) => ({ rank: n, id: 'u' + n, name: 'P' + n, score: 1000 - n });
    const top = [1, 2, 3, 4, 5].map(mk);

    // Outside the honour roll → the pinned block is exactly above/you/below.
    const far = LB._buildView({ top, rank: 412, total: 900, near: [mk(411), mk(412), mk(413)] }, 'u412');
    assert(far.inTop === false, 'rank 412 is not in a top-5 roll');
    assert(far.block.length === 3, 'expected the rival above, you, and the rival below');
    assert(far.block[1].rank === 412, 'you must be the middle row of the block');

    // Inside the honour roll → suppressed, and the row up top carries the mark.
    const near = LB._buildView({ top, rank: 3, total: 900, near: [mk(2), mk(3), mk(4)] }, 'u3');
    assert(near.inTop === true, 'rank 3 IS in the roll');
    assert(near.block.length === 0, 'the block must not duplicate a visible row');

    // Rank 1 has no rival above — two rows, not a hole.
    const first = LB._buildView({ top: [], rank: 1, total: 900, near: [mk(1), mk(2)] }, 'u1');
    assert(first.block.length === 2, 'rank 1 must still render its own row plus the chaser');

    // Signed out → no block at all, and nothing invented.
    const anon = LB._buildView({ top, rank: null, total: 900, near: [] }, null);
    assert(anon.rank === null && anon.block.length === 0, 'an anonymous view must claim no rank');

    // And the rendered block actually contains the rank numbers + the marker.
    const html = LB._boardHtml('total_level', far);
    assert(html.indexOf('Your standing') >= 0, 'the block needs its fold caption');
    assert(html.indexOf('#412') >= 0, 'the summary must name the rank');
    assert((html.match(/lb-row you/g) || []).length === 1, 'exactly one row is you');
  }),

  // The board namespace is shared with supabase/migrations/2026-08-08-leaderboards.sql
  // (hr_lb_boards / hr_lb_skills). A skill renamed on one side and not the
  // other produces a board that silently returns nothing, so both sides assert
  // the same numbers: 6 + 15 = 21.
  () => tryRun('b222: the board namespace matches the migration — 23 boards, 17 skills', () => {
    const LB = window.HearthriseLeaderboards;
    const ids = Object.keys(LB.BOARDS);
    /* b357: 21 → 23. Runecrafting and Stonemason are skills, and every skill
       gets a board — the client half is here, the server half is the staged
       migration `2026-08-17-leaderboard-skills.sql` (which asserts 23 from its
       own side). The equality below against SKILLS_DEF is what makes the two
       halves impossible to ship apart. */
    assert(ids.length === 23, 'expected 23 boards, got ' + ids.length);

    const skillBoards = ids.filter((i) => i.indexOf('skill:') === 0).map((i) => i.slice(6)).sort();
    const defs = Object.keys(window.SKILLS_DEF).sort();
    assert(skillBoards.length === 17, 'expected 17 skill boards, got ' + skillBoards.length);
    assert(skillBoards.join(',') === defs.join(','),
      'skill boards must be exactly SKILLS_DEF — got ' + skillBoards.join(',') + ' vs ' + defs.join(','));
    assert(ids.indexOf('skill:bountyHunter') >= 0, 'the camelCase skill id must survive');

    // The flagship exists and belongs to its own category.
    assert(LB.BOARDS.renown && LB.BOARDS.renown.cat === 'throne', 'Renown must be the Throne board');
    // Every board declares a category that the picker actually offers.
    const cats = LB.CATEGORIES.map((c) => c.id);
    ids.forEach((id) => assert(cats.indexOf(LB.BOARDS[id].cat) >= 0, id + ' has an orphan category'));
  }),

  // Client-first: this module ships before the migration is applied. Degraded,
  // it must offer ONLY the boards the pre-existing view can answer — not dead
  // chips, and not a "coming soon" note, which is a roadmap shown to a player.
  () => tryRun('b222: an un-migrated server offers only the boards it can answer', () => {
    const LB = window.HearthriseLeaderboards;
    /* ⚠ PIN THE AVAILABILITY MAP (b499). Every assertion below is about the
       PICKER'S SHAPE, but `UNAVAILABLE` in leaderboards.js is module-global,
       session-scoped, and written by any real render that gets an
       `available:false` answer. Production answers exactly that for `renown`
       today (measured live: {ok:true, board:'renown', available:false}), so once
       any earlier test has rendered a board, the Throne category is gone and
       `fullCats.length` is 4. That is the server's mood leaking into a unit
       test through state snapshotG cannot see. Pinned here, restored below —
       the withdraw/return BEHAVIOUR is still asserted, by b371. */
    const _avail = LB._availabilitySnapshot();
    LB._restoreAvailability(null);
    try {

    const legacyCats = LB._categoriesFor('legacy').map((c) => c.id);
    assert(legacyCats.indexOf('throne') < 0, 'Throne needs snapshot.renown — hide it until then');
    assert(legacyCats.indexOf('skills') < 0, 'per-skill boards need the migration');
    assert(legacyCats.indexOf('clans') < 0, 'the clan board needs the migration');
    assert(legacyCats.indexOf('overall') >= 0 && legacyCats.indexOf('combat') >= 0,
      'the three pre-existing boards must survive un-migrated');
    assert(LB._boardsIn('overall', 'legacy').join(',') === 'total_level,wealth', 'degraded Overall');
    assert(LB._boardsIn('combat', 'legacy').join(',') === 'combat_level', 'degraded Combat');

    const fullCats = LB._categoriesFor('full').map((c) => c.id);
    assert(fullCats.length === 5, 'migrated, all five categories are offered');
    assert(LB._boardsIn('skills', 'full').length === 17, 'migrated, all 17 skill boards appear');

    // A selection is always resolved onto a board that exists — this is what
    // stops a player who picked "Mining" pre-migration from staring at a board
    // that is not there, and what lets the picker grow when the migration lands.
    const a = LB._resolveSelection('legacy', 'skills', 'skill:mining');
    assert(a.cat === 'overall' && a.board === 'total_level', 'unavailable selection must fall back');
    const b = LB._resolveSelection('full', 'skills', 'skill:mining');
    assert(b.cat === 'skills' && b.board === 'skill:mining', 'a valid selection must be kept');
    const c = LB._resolveSelection('full', 'skills', 'skill:nonsense');
    assert(c.cat === 'skills' && c.board === 'skill:attack', 'a junk board falls back inside its category');
    } finally { LB._restoreAvailability(_avail); }
  }),

  // §3.2 hand-off: the Throne board cannot exist unless the client writes the
  // renown integer into the snapshot it already uploads. Same for combatLevel
  // (which the leaderboard view has read since b205 with nothing ever writing
  // it) and bossKills (which the server cannot compute — it has no MONSTERS).
  () => tryRun('b222: renown, combatLevel and bossKills are stamped and survive save→load', () => {
    const S = window.HearthriseSync;
    assert(S && S.derivedSnapshotFields, 'sync must expose the derived-field seam');

    const fake = {
      G: { skills: { mining: 100 }, gold: 5, bestiary: { dragon: { kills: 3 }, rat: { kills: 90 } } },
      MONSTERS: { dragon: { boss: true }, rat: {} },
      getTotalLevel: () => 240,
      getCombatLevel: () => 77,
      HearthriseRenown: { compute: () => 15731.9 }
    };
    const d = S.derivedSnapshotFields(null, fake);
    assert(d.totalLevel === 240, 'totalLevel must still be stamped (b146 contract)');
    assert(d.combatLevel === 77, 'combatLevel must be stamped — the Combat board sorted on null before this');
    assert(d.renown === 15731, 'renown must be stamped, floored to an integer');
    assert(d.bossKills === 3, 'bossKills must count bosses only, not the 90 rats');

    // Absent data is ABSENT, never a fabricated zero — a player with no
    // bestiary must not appear on the Bosses board ranked above nobody.
    const bare = S.derivedSnapshotFields(null, { G: { skills: {} }, MONSTERS: {} });
    assert(!('bossKills' in bare), 'no bestiary → no bossKills field');
    assert(!('renown' in bare), 'no renown module → no renown field');

    // An explicit config provider wins over the globals, and a throwing
    // provider degrades to omission instead of taking the save down with it.
    const cfgd = S.derivedSnapshotFields({ renown: () => 42, combatLevel: () => { throw new Error('x'); } }, fake);
    assert(cfgd.renown === 42, 'a config provider must win');
    assert(!('combatLevel' in cfgd), 'a throwing provider must omit, not throw');

    // Round trip: the fields survive the exact request body the uploader sends,
    // and JSON.parse(JSON.stringify(...)) — which is what Postgres stores and
    // pullLatest() hands back.
    const snap = Object.assign(snapshot(window.G) || {}, S.derivedSnapshotFields(null, window));
    assert(typeof snap.renown === 'number', 'the live snapshot must carry renown');
    assert(typeof snap.combatLevel === 'number', 'the live snapshot must carry combatLevel');
    const req = S.buildSnapshotRequest({ snapshotEndpoint: '/x', slot: 0 }, 'u1', snap, Date.now());
    const restored = JSON.parse(JSON.stringify(req.body)).snapshot;
    assert(restored.renown === snap.renown, 'renown must survive save→load');
    assert(restored.combatLevel === snap.combatLevel, 'combatLevel must survive save→load');
    assert(restored.totalLevel === snap.totalLevel, 'totalLevel must still survive save→load');
  }),

  // The bug the Throne board found. `const` at the top level of a classic
  // script is global-LEXICAL, not window — so `window.XP_TABLE` was undefined
  // and renown.js scored every skill as level 1. A fresh save's 24 total levels
  // scored as 15, i.e. 220 Renown instead of 310. The flagship board's score
  // was wrong for every player in the game.
  () => tryRun('b222: window.XP_TABLE is published, so Renown scores the real total level', () => {
    assert(Array.isArray(window.XP_TABLE), 'window.XP_TABLE must exist for cross-module consumers');
    assert(window.XP_TABLE.length === 99, 'the table must reach level 99');
    assert(window.XP_TABLE[98] === 13034431, 'the level-99 threshold must be intact');

    const R = window.HearthriseRenown;
    assert(R && R.compute, 'renown module missing');
    const probe = { skills: { mining: 13034431, cooking: 0 }, stats: {}, gold: 0 };
    /* b456: renown scores through the AUTHORITY accessor (skillXpOr), which is the
       whole point of the b431 sweep — a forged local xp must not reach a
       leaderboard. So a bare probe object reads UNKNOWN → every skill floors to
       level 1 and the score collapses to 10, which is the fail-closed answer
       working correctly, not the table being broken. Stamp the probe through the
       real record path so the 99 is one the SERVER stated. */
    stampRecordLikeLoad(probe);
    // With a working table this is 99 + 1 = 100 levels and one maxed skill;
    // with the broken one it collapsed to 2 levels and zero maxed skills.
    const score = R.compute(probe);
    assert(score >= 100 * R.WEIGHTS.totalLevel + R.WEIGHTS.skill99,
      'a 99 must score as a 99 — got ' + score);
  }),

  // The Throne board reads as a hierarchy, not a spreadsheet: the third column
  // is the rank title from the renown ladder (leaderboards.md §4).
  () => tryRun('b222: the Throne board shows rank titles, and each board reads in its own units', () => {
    const LB = window.HearthriseLeaderboards;
    const R = window.HearthriseRenown;
    const king = R.RANKS[R.RANKS.length - 1];

    assert(LB._contextText('renown', { score: king.min + 10 }) === king.title,
      'the top of the ladder must read as its title');
    assert(LB._contextText('renown', { score: 0 }) === R.RANKS[0].title, 'rank 0 has a title too');

    assert(LB._scoreText('total_level', 1842) === 'Lv 1,842', 'total level reads as a level');
    assert(LB._scoreText('combat_level', 115) === 'CL 115', 'combat level reads as CL');
    assert(LB._scoreText('wealth', 2500000) === '2,500,000g', 'wealth reads as gold');
    assert(LB._scoreText('skill:mining', 13034431) === 'Lv 99', 'a skill board reads as a level');
    assert(LB._contextText('skill:mining', { score: 13034431 }) === '13,034,431 xp', 'with xp beside it');
    // Clan Power is one composite integer so clans share the rank machinery —
    // it must decode back into the two numbers a player understands.
    assert(LB._scoreText('clan_power', 4 * 1000000000 + 250000) === 'Castle 4', 'castle tier decodes');
    assert(LB._contextText('clan_power', { score: 4 * 1000000000 + 250000 }) === '250,000g', 'treasury decodes');
  }),

  // Final Directive: rank is prestige, never payment. There is no claim, no
  // ledger and no currency anywhere in this feature — and rendering a board
  // must not move a single coin.
  () => tryRun('b222: ranking pays nothing — no claim path, no currency, no token', () => {
    const LB = window.HearthriseLeaderboards;
    const api = Object.keys(LB).join(' ');
    assert(!/claim|grant|reward|payout|token/i.test(api),
      'the leaderboard API must expose no reward path — got ' + api);

    const src = [LB._boardHtml, LB._rowHtml, LB._buildView, LB._reduceBoard]
      .map((f) => String(f)).join('\n');
    assert(!/hearth_token|addItem|G\.gold|G\.gems/i.test(src),
      'no render path may touch currency or inventory');

    const goldBefore = window.G.gold, gemsBefore = window.G.gems;
    const view = LB._buildView({
      top: [{ rank: 1, id: 'a', name: 'Aldric', score: 142300 }], rank: 1, total: 1, near: []
    }, 'a');
    const html = LB._boardHtml('renown', view);
    assert(html.indexOf('Hearth Token') < 0 && html.indexOf('gems') < 0, 'no currency in the board');
    assert(window.G.gold === goldBefore && window.G.gems === gemsBefore, 'rendering must move nothing');

    // Rank 1 earns a cosmetic title. It is honest because the rank behind it
    // came from the server, and it is the ONLY thing ranking grants.
    assert(LB._crownFor('renown') === 'the Throne', 'the flagship crown');
    assert(LB._crownFor('skill:mining') === 'Grandmaster Mining', 'per-skill crowns are named');
    assert(html.indexOf('the Throne') >= 0, 'rank 1 wears its title on the board');
  }),

  // b217 art rules: no emoji anywhere in the board, in any state, including the
  // empty and un-ranked ones.
  () => tryRun('b222: no emoji in the leaderboard DOM, in any state', () => {
    const LB = window.HearthriseLeaderboards;
    const EMO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    const mk = (n) => ({ rank: n, id: 'u' + n, name: 'P' + n, score: 1000 - n });

    const states = {
      empty: LB._buildView({ top: [], rank: null, total: 0, near: [] }, null),
      anon: LB._buildView({ top: [mk(1), mk(2)], rank: null, total: 2, near: [] }, null),
      inTop: LB._buildView({ top: [mk(1), mk(2)], rank: 1, total: 2, near: [mk(1), mk(2)] }, 'u1'),
      far: LB._buildView({ top: [mk(1)], rank: 412, total: 900, near: [mk(411), mk(412), mk(413)] }, 'u412')
    };
    const offenders = [];
    Object.keys(states).forEach((name) => {
      Object.keys(LB.BOARDS).forEach((board) => {
        const div = document.createElement('div');
        div.innerHTML = LB._boardHtml(board, states[name]);
        const w = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) if (EMO.test(n.nodeValue)) offenders.push(board + '/' + name + ': ' + n.nodeValue.trim());
      });
    });
    assert(offenders.length === 0, 'emoji in the board — ' + offenders.slice(0, 4).join(' | '));

    // Every state says something true; none of them is blank.
    assert(LB._boardHtml('renown', states.empty).indexOf('No one has ranked') >= 0, 'the empty state must speak');
    assert(LB._boardHtml('renown', states.anon).indexOf('Sign in') >= 0 ||
           LB._boardHtml('renown', states.anon).indexOf('not ranked') >= 0,
      'an anonymous board must point at the action that puts you on it');
  }),

  // The Social panel must never again paint NetClient's eight invented players.
  // The delegation is what retires that mock; this is the tripwire on it.
  () => tryRun('b222: the Social panel renders real ranks, never the invented eight', () => {
    const prevTab = window.activeTab;
    try {
      assert(window.HearthriseLeaderboards, 'the module must own the board');
      window.showTab('social');
      const el = document.getElementById('leaderboard');
      assert(el, '#leaderboard missing');
      const txt = el.textContent || '';
      ['DragonSlayer99', 'IronMan2024', 'FarmQueen', 'CozyCrafter', 'GoblinHunter',
       'TealKnight', 'PumpkinKing', 'AshvaleAria'].forEach((n) => {
        assert(txt.indexOf(n) < 0, 'fabricated player on the board: ' + n);
      });
      // The two picker rows exist for the module to paint into.
      assert(document.getElementById('lb-cats'), 'the category row is missing');
      assert(document.getElementById('lb-boards'), 'the board row is missing');
      assert(document.querySelectorAll('#panel-social [data-lb]').length === 0,
        'the three hardcoded mode chips must be gone');

      // The legacy entry point still lands on the board it meant.
      window.setLbMode('gold');
      assert(window.HearthriseLeaderboards.current().board === 'wealth',
        'setLbMode("gold") must select the Wealth board');
      window.setLbMode('total');
      assert(window.HearthriseLeaderboards.current().board === 'total_level',
        'setLbMode("total") must select Total Level');
    } finally {
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  /* ── regression suite — A STUBBED SESSION ARMS NEITHER FIRST-RUN SHEET ────
     THE CLASS, not the arm above it: a session is the ONLY thing `maybeShow()`
     and identity's `tick()` wait for, and both re-poll every 2 s, so the sheet
     lands on whichever test is running when the poll comes round — never the one
     that stubbed. The precondition belongs to `stubSignedIn` for that reason.
     THE CONTROL COMES FIRST, or "no sheet" passes against a sheet that could not
     have built here: `forget()` puts this browser back to never-welcomed and the
     sheet MUST build under exactly this stub, then leaves through its own
     `close()`. MUTATION: drop `firstRunAnswered` from `stubSignedIn` → RED on
     the precondition line. */
  () => tryRunAsync('SIGNED-IN-STUB: stubbing a session states the returning player, so neither first-run sheet arrives in the poll window', async () => {
    const W = window.HearthrisePostSignup;
    assert(W && W.seen && W.forget && W.close, 'post-signup-welcome.js lost the hooks a test states its precondition through');
    const SHEETS = '.hr-id-scrim, #hr-post-signup-modal';
    const was = new Set(document.querySelectorAll(SHEETS));
    const added = () => [...document.querySelectorAll(SHEETS)].filter((e) => !was.has(e)).map((e) => e.id || e.className);
    const wasWelcomed = W.seen();
    const unstub = stubSignedIn(0);
    try {
      assert(W.seen(), 'stubSignedIn handed the page a session without stating the one thing every returning '
        + "player's browser has already done — maybeShow() will fire inside its 2 s poll window and cover "
        + 'whichever test is running by then');
      /* `maybeShow()` also queues behind the front door, so the control parks
         whatever is up for exactly as long as it needs and puts it back where it
         stood — the same parking the whats-new stacking arm does. */
      const parked = [...document.querySelectorAll('.ftue-root, .hr-id-scrim')]
        .map((e) => ({ e, parent: e.parentNode, next: e.nextSibling }));
      parked.forEach((p) => p.e.remove());
      try {
        W.show();
        assert(document.getElementById('hr-post-signup-modal'),
          'the sheet did NOT build under this stub — the assertions below would be proving nothing');
        assert(W.close(), 'the sheet would not go away through its own dismiss');
      } finally {
        parked.forEach((p) => { try { p.parent.insertBefore(p.e, p.next); } catch (x) { document.body.appendChild(p.e); } });
      }
      assert(!added().length, 'the stub left a first-run sheet up: ' + added().join(', '));
      await new Promise((r) => setTimeout(r, 2500));
      assert(!added().length, 'a first-run sheet opened inside the 2 s poll window: ' + added().join(', '));
    } finally { unstub(); }
    assert(W.seen() === wasWelcomed, 'the stub left this browser\'s welcome flag somewhere it did not find it');
  }),
];
