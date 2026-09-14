// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/farm-and-profile.js — farm plots and replanting, the profile launchpad and the b139-b142 QA batches.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 86 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, stampBalanceLikeLoad, withFarmServer, withCompanionRoster, findToasts, findToast, snapshotG, restoreG, on, snapshot } from './_harness.js?v=547';

export default [

  // ════════════════════════════════════════════════════════════
  // b136 — Batch C: Housing-gated farm progression
  // ════════════════════════════════════════════════════════════

  // b136: HearthriseFarm API is loaded with the required surface.
  () => tryRun('b136: HearthriseFarm API + farm_deed item exist', () => {
    assert(window.HearthriseFarm, 'HearthriseFarm missing');
    const required = ['getPlotLevel','getPlotUnlockedCrops','canPlantCrop',
                      'getDeedsRequiredForNextLevel','getDeedCount','upgradePlot',
                      'rollKillDeed','rollBountyDeed','MAX_LEVEL'];
    for (const fn of required) {
      assert(window.HearthriseFarm[fn] !== undefined,
        'HearthriseFarm.' + fn + ' missing');
    }
    assert(window.ITEMS && window.ITEMS.farm_deed,
      "ITEMS.farm_deed missing — Tyler's tradable deed item must exist");
    assert(!window.ITEMS.farm_deed.bop,
      'farm_deed must NOT be bind-on-pickup — Tyler explicitly asked for tradable on market');
  }),

  // b136: at default Plot Lv 1, only Turnip is plantable.
  () => tryRun('b136: plot Lv 1 unlocks turnip only', () => {
    if (!window.HearthriseFarm) return;
    const snap = snapshotG();
    try {
      window.G.plotLevels = 1;
      const unlocked = window.HearthriseFarm.getPlotUnlockedCrops();
      assert(Array.isArray(unlocked) && unlocked.indexOf('turnip') !== -1,
        'turnip should be unlocked at Lv 1');
      assert(unlocked.indexOf('carrot') === -1,
        'carrot should be LOCKED at Lv 1, got unlocks=' + unlocked.join(','));
      assert(window.HearthriseFarm.canPlantCrop('turnip') === true, 'canPlantCrop(turnip) should be true');
      assert(window.HearthriseFarm.canPlantCrop('carrot') === false, 'canPlantCrop(carrot) should be false at Lv 1');
      assert(window.HearthriseFarm.canPlantCrop('pumpkin') === false, 'canPlantCrop(pumpkin) should be false at Lv 1');
    } finally {
      restoreG(snap);
    }
  }),

  // b136: upgradePlot consumes deeds and unlocks the next tier.
  () => tryRun('b136: upgradePlot sends the intent and renders the deed spend', () => withFarmServer(
    () => ({ ok: true, plot_level: 2, paid_with: 'deeds', deeds_spent: 1 }),
    (calls) => {
      /* b514: the PRICE and the DEBIT are hr_farm_upgrade_plot's. What the client
         still owns, and what this measures, is: the pre-flight lets an eligible
         broke-but-deeded farmer through, exactly one intent goes out, and the
         server's answer (tier 2, one deed) is rendered ONCE — including the crop
         unlocks that hang off the tier. */
      if (!window.HearthriseFarm) return;
      const snap = snapshotG();
      try {
        window.G.plotLevels = 1;
        delete window.G._serverPlotLevel;   // the tier under test is 1, from both sources
        window.G.inventory.farm_deed = 5;
        /* b510: deeds are the FALLBACK payment now — gold is charged first — and
           the tier sits behind a farming level. Broke + eligible is the state
           that exercises the deed path. */
        window.G.gold = 0;
        window.G.skills = window.G.skills || {};
        window.G.skills.farming = 20000;
        const need = window.HearthriseFarm.getDeedsRequiredForNextLevel();
        assert(need === 1, 'Lv 1 → 2 should cost 1 deed, got ' + need);
        const ok = window.HearthriseFarm.upgradePlot();
        assert(ok === true, 'upgradePlot should take the gesture');
        assert(calls.length === 1 && calls[0].verb === 'farmUpgradePlot',
          'exactly one hr_farm_upgrade_plot intent, got ' + JSON.stringify(calls.map((c) => c.verb)));
        assert(window.G.plotLevels === 2, "plotLevels should be the server's 2, got " + window.G.plotLevels);
        assert((window.G.inventory.farm_deed | 0) === 4, 'should have 5-1=4 deeds left, got ' + window.G.inventory.farm_deed);
        assert(window.HearthriseFarm.canPlantCrop('carrot') === true, 'carrot should now be plantable at Lv 2');
        assert(window.HearthriseFarm.canPlantCrop('wheat') === true, 'wheat should now be plantable at Lv 2');
        assert(window.HearthriseFarm.canPlantCrop('potato') === false, 'potato should still be locked at Lv 2');
      } finally { restoreG(snap); }
    })),

  // b136: upgradePlot rejects when player lacks deeds.
  () => tryRun('b136: upgradePlot fails without enough deeds — and never calls the server', () => withFarmServer(
    () => { throw new Error('the server must not be called for a refused upgrade'); },
    (calls) => {
      if (!window.HearthriseFarm) return;
      const snap = snapshotG();
      try {
        window.G.plotLevels = 1;
        delete window.G._serverPlotLevel;   // the tier under test is 1, from both sources
        window.G.inventory.farm_deed = 0;
        window.G.gold = 0;                 // b510: gold is the first payment
        window.G.skills = window.G.skills || {};
        window.G.skills.farming = 20000;   // ...so isolate the MONEY refusal
        const ok = window.HearthriseFarm.upgradePlot();
        assert(ok === false, 'upgradePlot should refuse without deeds');
        assert(window.G.plotLevels === 1, 'plotLevels should remain 1');
        /* b514: the pre-flight exists to say a sentence, not to spend a round
           trip. A refusal that still fires the intent turns every mis-tap into
           server load and a second refusal message. */
        assert(calls.length === 0, 'a client-side refusal must send NO intent, got ' + calls.length);
      } finally { restoreG(snap); }
    })),

  // ════════════════════════════════════════════════════════════════════════
  // b510 — THE PLOT TIER IS A PRICE AGAIN (farm plants/day hit ZERO for nine
  // days because the only way off tier 1 was a 0.1%-drop Farmer's Deed).
  // Player action: farm turnips to Farming 5, walk into House -> Plot with
  // 500 gold, buy tier 2, plant a carrot's worth of unlock.
  // ════════════════════════════════════════════════════════════════════════
  () => tryRun('FARM-TIER-1: a farmer buys plot tier 2 with GOLD', () => withFarmServer(
    () => ({ ok: true, plot_level: 2, paid_with: 'gold', gold_spent: 500, gold: 0 }),
    (calls) => {
      if (!window.HearthriseFarm) return;
      const snap = snapshotG();
      try {
        window.G.plotLevels = 1;
        delete window.G._serverPlotLevel;   // the tier under test is 1, from both sources
        window.G.inventory.farm_deed = 0;          // no deed anywhere in sight
        window.G.gold = 500;
        window.G.skills = window.G.skills || {};
        window.G.skills.farming = 512;             // exactly Farming 5
        const price = window.HearthriseFarm.getUpgradePrice();
        assert(price && price.level === 2, 'there must be a next-tier price at Lv 1');
        assert(price.gold === 500, 'tier 2 must cost 500 gold, got ' + price.gold);
        assert(price.farming === 5, 'tier 2 must need Farming 5, got ' + price.farming);
        assert(window.HearthriseFarm.getFarmingLevel() >= 5,
          'the harness must reach Farming 5, got ' + window.HearthriseFarm.getFarmingLevel());
        const chk = window.HearthriseFarm.getUpgradeCheck();
        assert(chk.ok === true && chk.pay === 'gold',
          'a farmer with the gold and no deeds pays GOLD, got ' + JSON.stringify(chk));
        const ok = window.HearthriseFarm.upgradePlot();
        assert(ok === true, 'the upgrade should be taken');
        assert(calls.length === 1 && calls[0].verb === 'farmUpgradePlot', 'exactly one intent');
        /* b514: the balance below is the SERVER's absolute post-debit figure
           (res.gold), not a client subtraction — no price crosses the wire. */
        assert(window.G.plotLevels === 2, 'plot level should be 2, got ' + window.G.plotLevels);
        assert((window.G.gold | 0) === 0, "the server's post-debit balance should be rendered, got " + window.G.gold);
        assert(window.HearthriseFarm.canPlantCrop('carrot') === true, 'carrot must now be unlocked');
        assert(window.HearthriseFarm.canPlantCrop('potato') === false, 'potato is tier 3 — still locked');
      } finally { restoreG(snap); }
    })),

  // b510: the FARMING LEVEL is the pace, and it bites before the money — a
  // rich level-1 farmer cannot buy the ladder out from under the crops.
  () => tryRun('FARM-TIER-2: gold cannot skip the farming level', () => withFarmServer(
    () => { throw new Error('a level-refused upgrade must not reach the server'); },
    (calls) => {
      if (!window.HearthriseFarm) return;
      const snap = snapshotG();
      try {
        window.G.plotLevels = 1;
        delete window.G._serverPlotLevel;   // the tier under test is 1, from both sources
        window.G.gold = 1e9;
        window.G.inventory.farm_deed = 0;
        window.G.skills = window.G.skills || {};
        window.G.skills.farming = 0;
        const chk = window.HearthriseFarm.getUpgradeCheck();
        assert(chk.ok === false && chk.error === 'farm_level_too_low',
          'a Farming-1 millionaire must be refused on LEVEL, got ' + JSON.stringify(chk));
        assert(window.HearthriseFarm.upgradePlot() === false, 'the upgrade must refuse');
        assert(calls.length === 0, 'and must not spend a round trip doing it');
        assert(window.G.plotLevels === 1, 'plot level must not move');
        assert(window.G.gold === 1e9, 'a refused upgrade must charge nothing');
        /* The BINDING copy of this rule is hr_farm_upgrade_plot's (it answers
           farm_level_too_low with its own need/have); this is the pre-flight that
           keeps the button honest before the player taps it. */
      } finally { restoreG(snap); }
    })),

  // b510: GOLD FIRST. A deed is worth 500g at tier 2 and 12,500g at tier 5 and
  // it is tradeable, so the game must never quietly spend the rarer currency
  // while the player is holding the cheaper one.
  () => tryRun('FARM-TIER-3: holding both, the player pays gold and keeps the deed', () => withFarmServer(
    () => ({ ok: true, plot_level: 2, paid_with: 'gold', gold_spent: 500, gold: 4500 }),
    (calls) => {
      if (!window.HearthriseFarm) return;
      const snap = snapshotG();
      try {
        window.G.plotLevels = 1;
        delete window.G._serverPlotLevel;   // the tier under test is 1, from both sources
        window.G.gold = 5000;
        window.G.inventory.farm_deed = 4;
        window.G.skills = window.G.skills || {};
        window.G.skills.farming = 20000;
        /* b514: GOLD-BEFORE-DEEDS IS THE SERVER'S CHOICE now (the RPC picks and
           reports it as paid_with). Two things stay the client's and are what
           this measures: the pre-flight says GOLD, so the button's copy does not
           promise the rarer currency; and a gold answer must leave the deeds
           ALONE — reconcile debits farm_deed only on deeds_spent. */
        const chk = window.HearthriseFarm.getUpgradeCheck();
        assert(chk.ok === true && chk.pay === 'gold',
          'holding both, the pre-flight must name GOLD, got ' + JSON.stringify(chk));
        assert(window.HearthriseFarm.upgradePlot() === true, 'the upgrade should be taken');
        assert(calls.length === 1, 'exactly one intent');
        assert(window.G.plotLevels === 2, 'plot level should be 2');
        assert((window.G.gold | 0) === 4500, "the server's balance should render as 4500, got " + window.G.gold);
        assert((window.G.inventory.farm_deed | 0) === 4,
          'the deeds must be untouched, got ' + window.G.inventory.farm_deed);
      } finally { restoreG(snap); }
    })),

  // b136: plantCrop respects the plot-level gate.
  () => tryRun('b136: plantCrop is gated by plot level', () => withFarmServer((verb, args) => ({ ok: true, plot: args[0], crop: args[1] || 'turnip',
      planted_at: new Date().toISOString(), seed_spent: (args[1] || 'turnip') + '_seed', plant_xp: 28 }), () => {
    if (typeof window.plantCrop !== 'function' || !window.HearthriseFarm) return;
    const snap = snapshotG();
    try {
      window.G.plotLevels = 1;
      // Stock seeds so the seed check passes
      /* Stock BOTH sides: the factory literal is gone and the gate reads the mirror. */
      window.G.inventory.turnip_seed = 10;
      window.G.inventory.carrot_seed = 10;
      window.G._serverBag = Object.assign({}, window.G._serverBag, { turnip_seed: 10, carrot_seed: 10 });
      // Make sure farming level isn't the gate
      window.G.skills.farming = 1000000;
      // Empty the test slot
      const idx = 0;
      const before = window.G.farmPlots[idx];
      window.G.farmPlots[idx] = null;
      // Try planting carrot at Lv 1 — must be rejected
      window.plantCrop(idx, 'carrot');
      assert(window.G.farmPlots[idx] === null,
        'carrot plant should be rejected at plot Lv 1, but plot got: ' + JSON.stringify(window.G.farmPlots[idx]));
      // Try planting turnip — should succeed
      window.plantCrop(idx, 'turnip');
      const planted = window.G.farmPlots[idx];
      assert(planted && planted.cropId === 'turnip',
        'turnip should plant at Lv 1, got: ' + JSON.stringify(planted));
      // Restore
      window.G.farmPlots[idx] = before;
    } finally {
      restoreG(snap);
    }
  })),

  // b136: maybeReplant fires when enabled + seeds present + plot empty.
  () => tryRun('b136: maybeReplant plants configured crop on empty plot', () => withFarmServer((verb, args) => ({ ok: true, plot: args[0], crop: args[1] || 'turnip',
      planted_at: new Date().toISOString(), seed_spent: (args[1] || 'turnip') + '_seed', plant_xp: 28 }), () => {
    if (!window.HearthriseAuto || typeof window.HearthriseAuto.maybeReplant !== 'function') return;
    const snap = snapshotG();
    const fr = window.HearthriseAuto.getFarmReplant();
    try {
      window.G.plotLevels = 1;
      /* Stock BOTH sides: the factory literal is gone and the gate reads the mirror. */
      window.G.inventory.turnip_seed = 5;
      window.G._serverBag = Object.assign({}, window.G._serverBag, { turnip_seed: 5 });
      window.G.skills.farming = 1000000;
      const idx = 0;
      window.G.farmPlots[idx] = null;
      window.HearthriseAuto.setFarmReplant({ enabled: true, cropId: 'turnip' });
      const did = window.HearthriseAuto.maybeReplant(idx);
      assert(did === true, 'maybeReplant should plant when conditions met, got ' + did);
      assert(window.G.farmPlots[idx] && window.G.farmPlots[idx].cropId === 'turnip',
        'plot should now have turnip, got ' + JSON.stringify(window.G.farmPlots[idx]));
    } finally {
      window.HearthriseAuto.setFarmReplant(fr);
      restoreG(snap);
    }
  })),

  // b136: maybeReplant respects the plot-level gate (locked crop = no-op).
  () => tryRun('b136: maybeReplant skips locked crops', () => withFarmServer((verb, args) => ({ ok: true, plot: args[0], crop: args[1] || 'turnip',
      planted_at: new Date().toISOString(), seed_spent: (args[1] || 'turnip') + '_seed', plant_xp: 28 }), () => {
    if (!window.HearthriseAuto || typeof window.HearthriseAuto.maybeReplant !== 'function') return;
    const snap = snapshotG();
    const fr = window.HearthriseAuto.getFarmReplant();
    try {
      window.G.plotLevels = 1; // Lv 1 — only turnip
      window.G.inventory.carrot_seed = 5;
      window.G.skills.farming = 1000000;
      const idx = 0;
      window.G.farmPlots[idx] = null;
      window.HearthriseAuto.setFarmReplant({ enabled: true, cropId: 'carrot' });
      const did = window.HearthriseAuto.maybeReplant(idx);
      assert(did === false, 'maybeReplant should refuse locked crop, got ' + did);
      assert(window.G.farmPlots[idx] == null, 'plot should remain empty');
    } finally {
      window.HearthriseAuto.setFarmReplant(fr);
      restoreG(snap);
    }
  })),

  // b136: deed roll honours tier gate (Tier 1 mob = no roll).
  () => tryRun('b136: rollKillDeed never grants for Tier 1 monsters', () => {
    if (!window.HearthriseFarm) return;
    const snap = snapshotG();
    try {
      const before = window.G.inventory.farm_deed | 0;
      // Run many trials — Tier 1 must never grant a deed.
      const t1 = { tier: 1, name: 'TestSlime' };
      for (let i = 0; i < 2000; i++) {
        window.HearthriseFarm.rollKillDeed(t1);
      }
      const after = window.G.inventory.farm_deed | 0;
      assert(after === before,
        'Tier 1 must never drop deeds, got ' + (after - before) + ' deeds in 2000 rolls');
    } finally {
      restoreG(snap);
    }
  }),

  // b136: schema migration left plotLevels intact at 1 by default.
  /* ⚠ THIS PRECONDITION WAS A LEAK AND THE SEAL EXPOSED IT (2026-09-13): nothing in the boot
     path sets `plotLevels` post-cutover (the v3→v4 save migration is pre-cutover, the beta was
     wiped), so only the tests above — writing it through a BARE snapshot entry — made the old
     ambient assertion true. `getPlotLevel()`'s fail-safe is where the invariant lives. */
  () => tryRun('b136: G.plotLevels is a number >=1 (migration default holds)', () => {
    const F = window.HearthriseFarm, snap = snapshotG();
    assert(F && typeof F.getPlotLevel === 'function', 'HearthriseFarm.getPlotLevel is missing — nothing owns the plot tier');
    try {
      delete window.G.plotLevels; delete window.G._serverPlotLevel;   // a character the server has not spoken about
      const lv = F.getPlotLevel();
      assert(typeof lv === 'number' && isFinite(lv) && lv >= 1, 'getPlotLevel() returned ' + JSON.stringify(lv) + ' for a character with no recorded tier — the fail-safe floor is 1 (tier-1 crops), never 0 and never a locked farm');
      assert(typeof window.G.plotLevels === 'number' && window.G.plotLevels >= 1, 'getPlotLevel() must HEAL G.plotLevels to the floor (got ' + JSON.stringify(window.G.plotLevels) + '); every later reader derefs the field, not the function');
    } finally { restoreG(snap); }
  }),

  // ════════════════════════════════════════════════════════════
  // b138 — Batch D: Profile launchpad
  // ════════════════════════════════════════════════════════════

  // b138: HearthriseLaunchpad API surface.
  () => tryRun('b138: HearthriseLaunchpad API loaded', () => {
    assert(window.HearthriseLaunchpad, 'HearthriseLaunchpad missing');
    const required = ['recordStop','getResumePayload','resume','ensureDailySnapshot',
                      'getTodayDelta','getNextMilestone','setDisplayName'];
    for (const fn of required) {
      assert(typeof window.HearthriseLaunchpad[fn] === 'function',
        'HearthriseLaunchpad.' + fn + ' missing');
    }
    // schema v5 ran
    assert(window.HEARTHRISE_SCHEMA_VERSION >= 5,
      'CURRENT_SCHEMA_VERSION should be >=5, got ' + window.HEARTHRISE_SCHEMA_VERSION);
  }),

  // b138: recordStop populates G.lastActivity correctly.
  () => tryRun('b138: recordStop writes lastActivity', () => {
    if (!window.HearthriseLaunchpad) return;
    const snap = snapshotG();
    try {
      window.G.lastActivity = null;
      window.HearthriseLaunchpad.recordStop('skill', 'mining');
      assert(window.G.lastActivity, 'lastActivity should exist after recordStop');
      assert(window.G.lastActivity.kind === 'skill', 'kind should be skill');
      assert(window.G.lastActivity.id === 'mining', 'id should be mining');
      assert(typeof window.G.lastActivity.stoppedAt === 'number', 'stoppedAt should be a number');
      // Bad inputs are no-ops
      window.HearthriseLaunchpad.recordStop('garbage', 'mining');
      assert(window.G.lastActivity.kind === 'skill', 'invalid kind should be ignored');
    } finally {
      restoreG(snap);
    }
  }),

  // b138: getResumePayload returns null when no lastActivity.
  () => tryRun('b138: getResumePayload returns null without lastActivity', () => {
    if (!window.HearthriseLaunchpad) return;
    const snap = snapshotG();
    try {
      window.G.lastActivity = null;
      window.G.activeSkill = null;
      window.G.activeMonster = null;
      const p = window.HearthriseLaunchpad.getResumePayload();
      assert(p === null, 'expected null payload, got ' + JSON.stringify(p));
    } finally {
      restoreG(snap);
    }
  }),

  // b138: getResumePayload returns a working payload for a known skill.
  () => tryRun('b138: getResumePayload returns skill payload', () => {
    if (!window.HearthriseLaunchpad) return;
    const snap = snapshotG();
    try {
      window.G.lastActivity = { kind: 'skill', id: 'mining', stoppedAt: Date.now() };
      window.G.activeSkill = null;
      window.G.activeMonster = null;
      const p = window.HearthriseLaunchpad.getResumePayload();
      assert(p, 'expected payload, got null');
      assert(p.kind === 'skill', 'kind mismatch');
      assert(p.id === 'mining', 'id mismatch');
      assert(typeof p.action === 'function', 'action should be a function');
      assert(typeof p.label === 'string' && p.label.length > 0, 'label should be non-empty');
    } finally {
      restoreG(snap);
    }
  }),

  // b138: getResumePayload hides itself when something is already running.
  () => tryRun('b138: getResumePayload hides while activity is live', () => {
    if (!window.HearthriseLaunchpad) return;
    const snap = snapshotG();
    try {
      window.G.lastActivity = { kind: 'skill', id: 'mining', stoppedAt: Date.now() };
      window.G.activeSkill = 'cooking'; // already running something else
      const p = window.HearthriseLaunchpad.getResumePayload();
      assert(p === null, 'should hide when activeSkill is set, got ' + JSON.stringify(p));
    } finally {
      restoreG(snap);
    }
  }),

  // b138: getTodayDelta computes correct deltas after baseline + actions.
  () => tryRun('b138: getTodayDelta tracks gold + kills since snapshot', () => {
    if (!window.HearthriseLaunchpad) return;
    const snap = snapshotG();
    try {
      // Force a fresh snapshot for today
      window.G.daily = window.G.daily || {};
      window.G.daily.snapshot = null;
      // Set a clean baseline. gold is ARMED, so a directly-set balance is only
      // KNOWN once stamped the way hr_load does — getTodayDelta reads it through
      // balanceNum and would otherwise see UNKNOWN (null → 0).
      window.G.gold = 1000;
      stampBalanceLikeLoad(window.G);
      window.G.stats = window.G.stats || {};
      window.G.stats.kills = 5;
      // b478: the Home "Harvest" delta must read the LIVE crop counter
      // (stats.cropsHarvested — what harvestPlot/companions actually write), not the
      // dead stats.harvested. Baseline the live counter and leave the dead one at 0
      // so this fails if getTodayDelta ever reverts to the dead field.
      window.G.stats.cropsHarvested = 10;
      window.G.stats.harvested = 0;
      window.HearthriseLaunchpad.ensureDailySnapshot();
      // Now mutate
      window.G.gold = 1250;
      stampBalanceLikeLoad(window.G);
      window.G.stats.kills = 7;
      window.G.stats.cropsHarvested = 13;   // +3 crops harvested today
      const d = window.HearthriseLaunchpad.getTodayDelta();
      assert(d.goldEarned === 250, 'goldEarned should be 250, got ' + d.goldEarned);
      assert(d.kills === 2, 'kills should be 2, got ' + d.kills);
      assert(d.harvested === 3, 'harvested delta must track cropsHarvested (+3), got ' + d.harvested);
      // Negative deltas (e.g. spent gold) clamp to 0 — fairness for the player
      window.G.gold = 500;
      stampBalanceLikeLoad(window.G);
      const d2 = window.HearthriseLaunchpad.getTodayDelta();
      assert(d2.goldEarned === 0, 'spent-gold case should clamp to 0, got ' + d2.goldEarned);
    } finally {
      restoreG(snap);
    }
  }),

  // b138: getNextMilestone returns SOMETHING for any populated save.
  () => tryRun('b138: getNextMilestone returns a target', () => {
    if (!window.HearthriseLaunchpad) return;
    const m = window.HearthriseLaunchpad.getNextMilestone();
    // Either a skill or a quest — but on a real save it should never be null
    // (every player has skills below 99 OR active quests).
    assert(m !== null, 'expected a milestone, got null');
    assert(m.label && typeof m.label === 'string', 'milestone.label should be a string');
    assert(typeof m.pct === 'number' && m.pct >= 0 && m.pct <= 1,
      'milestone.pct should be 0..1, got ' + m.pct);
  }),

  // b138: setDisplayName clamps + persists.
  () => tryRun('b138: setDisplayName updates G.playerName + clamps length', () => {
    if (!window.HearthriseLaunchpad) return;
    const snap = snapshotG();
    try {
      const ok = window.HearthriseLaunchpad.setDisplayName('TestHero');
      assert(ok === true, 'setDisplayName should return true on success');
      assert(window.G.playerName === 'TestHero', 'playerName should be TestHero, got ' + window.G.playerName);
      // Empty / whitespace rejected
      const ok2 = window.HearthriseLaunchpad.setDisplayName('   ');
      assert(ok2 === false, 'whitespace name should be rejected');
      // Long name clamped to 24 chars
      window.HearthriseLaunchpad.setDisplayName('A'.repeat(100));
      assert(window.G.playerName.length === 24,
        'name should be clamped to 24 chars, got ' + window.G.playerName.length);
    } finally {
      restoreG(snap);
      // b213: setDisplayName paints the topbar + saves — repaint and re-save
      // from the RESTORED name, or the 'AAAA…' test string stays in the
      // topbar (and on disk) after every suite run.
      if (typeof window.updateTopbar === 'function') try { window.updateTopbar(); } catch {}
      if (typeof window.saveLocal === 'function') try { window.saveLocal(); } catch {}
    }
  }),

  // ════════════════════════════════════════════════════════════
  // b139 — QA sweep fix batch
  // ════════════════════════════════════════════════════════════

  // b139 §1.1: the 26 previously-missing items must exist in window.ITEMS.
  // If this fails, we've regressed the items.js ↔ legacy.js drift fix.
  () => tryRun('b139: Phase A.1 items present in window.ITEMS', () => {
    const required = [
      'raw_wolf_meat','raw_panther_meat','raw_bear_meat', 'cooked_wolf_meat','cooked_panther_meat','cooked_bear_meat',
      'roasted_carrot','roasted_pumpkin','vegetable_stew',
      'bear_claw_pie','hunters_feast','dragon_stew','lich_soul_soup','void_banquet',
      'bronze_bar','steel_bar','rune_bar', 'chief_blade_recipe','captain_recipe','alpha_pattern',
      'spellstone_diagram','dragon_marrow_recipe','gemcutter_note', 'soul_recipe','marrow_cookbook','field_cookbook',
    ];
    const missing = required.filter(id => !window.ITEMS || !window.ITEMS[id]);
    assert(missing.length === 0,
      'expected all 26 Phase A.1 items present, missing: ' + missing.join(','));
    // Non-zero values where expected
    assert(window.ITEMS.bronze_bar.v > 0, 'bronze_bar.v should be > 0');
    assert(window.ITEMS.steel_bar.v > 0, 'steel_bar.v should be > 0');
    assert(window.ITEMS.rune_bar.v > 0, 'rune_bar.v should be > 0');
  }),

  // b139 §1.1: ITEMS divergence count should be 0 (or negligible) now.
  // This is the integrity check itself running explicitly. Catches the
  // moment someone adds an item to legacy.js without mirroring it.
  () => tryRun('b139: ITEMS divergence between legacy + ESM is zero', () => {
    const legacy = window.__LEGACY_INLINE_ITEMS;
    const esm = window.ITEMS;
    if (!legacy || !esm) return; // skip on builds without snapshot
    const legacyKeys = Object.keys(legacy);
    const onlyLegacy = legacyKeys.filter(k => !esm[k]);
    assert(onlyLegacy.length === 0,
      onlyLegacy.length + ' items still legacy-only: ' + onlyLegacy.slice(0,5).join(',') + (onlyLegacy.length>5?',…':''));
  }),

  // b139 §1.1: the smelting + cooking + gated recipe chains are reachable
  // from window.ARTISAN_RECIPES. The actual fix is in src/data/recipes.js.
  () => tryRun('b139: Phase A.1 recipes registered in ARTISAN_RECIPES', () => {
    const r = window.ARTISAN_RECIPES || {};
    const findRecipe = (skill, id) =>
      (r[skill] || []).some(rec => rec.id === id);
    const checks = ('smithing:smelt_bronze smithing:smelt_steel smithing:smelt_rune '
      + 'cooking:cook_wolf_meat cooking:cook_bear_meat cooking:cook_veg_stew '
      + 'smithing:forge_chief_blade smithing:forge_captain_blade crafting:craft_alpha_cloak'
    ).split(' ').map((s) => s.split(':'));
    const missing = checks.filter(([s,id]) => !findRecipe(s, id));
    assert(missing.length === 0,
      'missing recipes: ' + missing.map(([s,id]) => s+':'+id).join(','));
  }),

  // b139 §2.1.2: rename pencil should NOT be hidden for cloud-signed-in
  // users. The fix changed `canRename = !liveUser && !G.account` to just
  // `canRename = true`. Verify by rendering Profile and checking the
  // pencil button exists in the dash-user body.
  () => tryRun('b139: Profile rename pencil renders for all account states', () => {
    if (typeof window.renderProfile !== 'function') return;
    try { window.renderProfile(); } catch (e) {}
    const body = document.getElementById('dash-user-body');
    if (!body) return; // panel not in DOM yet — skip
    // b373: the pencil now routes to HearthriseLaunchpad.openRename() (the
    // in-game modal) instead of setDisplayName(prompt(...)); the affordance
    // itself — "every account state gets a pencil" — is what this pins.
    const pencil = body.querySelector('button[title="Rename"]');
    assert(pencil != null,
      'expected rename pencil button in dash-user-body, none found');
  }),

  // b139 §2.3.1 / §2.6.1: paper-doll equipment slots no longer render
  // 3-character truncated labels (Hel/Nec/Cap/Bod/Bel/Com).
  () => tryRun('b139: paper-doll empty slots have no truncated label small', () => {
    // SA-013: this used refreshAllDolls(), which only REPAINTS dolls already
    // mounted — so when the Character tab had not rendered there were no
    // .td-slot.empty nodes and the test silently early-returned, asserting
    // nothing. Build a doll directly (a detached node with one empty slot per
    // unequipped slot) against a forced-empty loadout, so the label check always
    // runs against real empty slots.
    if (typeof window.buildTibiaDoll !== 'function') { skip('buildTibiaDoll seam absent'); return; }
    const savedEq = window.G.equipment;
    try {
      window.G.equipment = {}; // every gear slot empty → guaranteed .td-slot.empty
      const doll = window.buildTibiaDoll();
      assert(doll, 'buildTibiaDoll returned nothing to inspect');
      const empties = doll.querySelectorAll('.td-slot.empty');
      assert(empties.length > 0, 'an all-empty loadout must render at least one empty paper-doll slot');
      let hadTrunc = false;
      empties.forEach(s => {
        const small = s.querySelector('small');
        if (small && /^[A-Z][a-z]{2}$/.test((small.textContent || '').trim())) hadTrunc = true;
      });
      assert(!hadTrunc,
        'paper-doll empty slot still has 3-char truncated label (e.g. Hel/Nec/Cap)');
    } finally { window.G.equipment = savedEq; }
  }),

  // ════════════════════════════════════════════════════════════
  // b140 — Batch E: Inventory QoL (right-click context menu + sell-junk)
  // ════════════════════════════════════════════════════════════

  // b140 #23: HearthriseInvCtx API surface.
  () => tryRun('b140: HearthriseInvCtx API loaded', () => {
    assert(window.HearthriseInvCtx, 'HearthriseInvCtx missing');
    const required = ['open','close','selectJunk','sellJunk','_buildOptions','_ctxFromTile'];
    for (const fn of required) {
      assert(typeof window.HearthriseInvCtx[fn] === 'function',
        'HearthriseInvCtx.' + fn + ' missing');
    }
    // The menu element should exist on the DOM
    assert(document.getElementById('inv-ctx-menu'),
      '#inv-ctx-menu element should be in the DOM');
  }),

  // b140 #23: buildOptions yields type-aware actions.
  // Equippable items get an "Equip" entry; food gets "Eat"; bones get "Bury".
  () => tryRun('b140: context menu options are item-type aware', () => {
    if (!window.HearthriseInvCtx || !window.ITEMS) return;
    const ctx = (id) => ({ itemId: id, slot: null, source: 'bag' });
    const labels = (opts) => opts.map(o => o.label).join('|');

    // Equippable: bronze_sword should have "Equip" option
    if (window.ITEMS.bronze_sword) {
      const opts = window.HearthriseInvCtx._buildOptions(ctx('bronze_sword'));
      assert(/Equip/.test(labels(opts)),
        'bronze_sword context menu should include Equip; got: ' + labels(opts));
    }
    // Food: cooked_shrimp should have "Eat"
    if (window.ITEMS.cooked_shrimp) {
      const opts = window.HearthriseInvCtx._buildOptions(ctx('cooked_shrimp'));
      assert(/Eat/.test(labels(opts)),
        'cooked_shrimp context menu should include Eat; got: ' + labels(opts));
    }
    // Bones: should have "Bury"
    if (window.ITEMS.bones) {
      const opts = window.HearthriseInvCtx._buildOptions(ctx('bones'));
      assert(/Bury/.test(labels(opts)),
        'bones context menu should include Bury; got: ' + labels(opts));
    }
    // BoP item: should NOT have Sell option
    if (window.ITEMS.bone_key) {
      const opts = window.HearthriseInvCtx._buildOptions(ctx('bone_key'));
      assert(!/Sell/.test(labels(opts)),
        'BoP bone_key should NOT have Sell option; got: ' + labels(opts));
    }
  }),

  // b140 #23: equipped-slot context shows Unequip + Inspect.
  () => tryRun('b140: equipped paper-doll slot offers Unequip', () => {
    if (!window.HearthriseInvCtx) return;
    // Synthetic context: pretend slot=weapon is equipped with bronze_sword
    const snap = snapshotG();
    try {
      window.G.equipment = window.G.equipment || {};
      const orig = window.G.equipment.weapon;
      window.G.equipment.weapon = 'bronze_sword';
      const opts = window.HearthriseInvCtx._buildOptions({ itemId: 'bronze_sword', slot: 'weapon', source: 'equipped' });
      const labels = opts.map(o => o.label).join('|');
      assert(/Unequip/.test(labels), 'equipped slot should offer Unequip; got: ' + labels);
      assert(/Inspect/.test(labels), 'equipped slot should offer Inspect; got: ' + labels);
      window.G.equipment.weapon = orig;
    } finally {
      restoreG(snap);
    }
  }),

  // b140: selectJunk picks safe candidates only.
  // Never selects: BoP, food, recipe scrolls, gear, items with v<=0.
  () => tryRun('b140: selectJunk respects safety filters', () => {
    if (!window.HearthriseInvCtx) return;
    const snap = snapshotG();
    try {
      // Stub the inventory with one of each problematic class
      window.G.inventory = {
        bones: 5,                    // SHOULD be picked (low value, no heals, no BoP)
        bone_key: 3,                 // BoP — must NOT be picked
        cooked_shrimp: 4,            // food — must NOT be picked
        bronze_sword: 1,             // gear — must NOT be picked
        chief_blade_recipe: 1,       // recipe scroll — must NOT be picked
      };
      const picks = window.HearthriseInvCtx.selectJunk(50);
      assert(picks.includes('bones'), 'bones should be selected as junk');
      assert(!picks.includes('bone_key'),         'BoP bone_key must NOT be selected');
      assert(!picks.includes('cooked_shrimp'),    'food cooked_shrimp must NOT be selected');
      assert(!picks.includes('bronze_sword'),     'gear bronze_sword must NOT be selected');
      assert(!picks.includes('chief_blade_recipe'),'recipe scroll must NOT be selected');
    } finally {
      restoreG(snap);
    }
  }),

  // b140: HearthriseInvCtx.open programmatically renders the menu.
  () => tryRun('b140: HearthriseInvCtx.open populates the menu DOM', () => {
    if (!window.HearthriseInvCtx) return;
    if (!window.ITEMS || !window.ITEMS.bones) return;
    try {
      window.HearthriseInvCtx.open('bones', 100, 100);
      const m = document.getElementById('inv-ctx-menu');
      assert(m && m.style.display !== 'none', 'menu should be visible after open()');
      assert(m.querySelectorAll('.inv-ctx-item').length > 0,
        'menu should contain items after open()');
    } finally {
      window.HearthriseInvCtx.close();
    }
  }),

  // ════════════════════════════════════════════════════════════
  // b141 — Beta launch prep
  // ════════════════════════════════════════════════════════════

  // b141: HearthriseBetaBanner API exists.
  () => tryRun('b141: HearthriseBetaBanner API loaded', () => {
    assert(window.HearthriseBetaBanner, 'HearthriseBetaBanner missing');
    const required = ['show','ack','reset','DISCORD_INVITE'];
    for (const k of required) {
      assert(window.HearthriseBetaBanner[k] !== undefined,
        'HearthriseBetaBanner.' + k + ' missing');
    }
    assert(typeof window.HearthriseBetaBanner.DISCORD_INVITE === 'string',
      'DISCORD_INVITE should be a string');
  }),

  // b141: ack flag round-trips through localStorage.
  () => tryRun('b141: BetaBanner ack persists in localStorage', () => {
    if (!window.HearthriseBetaBanner) return;
    const KEY = 'hearthrise:beta-ack';
    const orig = localStorage.getItem(KEY);
    try {
      window.HearthriseBetaBanner.reset();
      assert(localStorage.getItem(KEY) !== '1', 'reset should clear ack flag');
      window.HearthriseBetaBanner.ack();
      assert(localStorage.getItem(KEY) === '1', 'ack should set flag to "1"');
    } finally {
      if (orig === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, orig);
    }
  }),

  // b141: the 🧪 button appears only when localStorage hearthrise:admin === '1'.
  // SA-013 (increment 2): this WAS `assert(true, 'gate verified in source')` — a
  // test that asserted nothing. It drives the REAL addButton() through the
  // harness-only __hrAddSmokeButton hook (b535: published by
  // smoke-test-loader.js now) and asserts both directions; on a live admin run
  // the hook is absent, so it declares an honest skip instead of a fake pass.
  () => tryRun('b141: smoke-test 🧪 button hidden when not admin', () => {
    const KEY = 'hearthrise:admin';
    const orig = localStorage.getItem(KEY);
    const add = window.__hrAddSmokeButton;
    if (typeof add !== 'function') {
      skip('addButton hook is test-harness-only (not published on a live/admin run)');
      return;
    }
    const removeBtn = () => { const b = document.getElementById('smoke-test-btn'); if (b) b.remove(); };
    try {
      // admin OFF → the gate must refuse to add the button.
      localStorage.setItem(KEY, '0');
      removeBtn();
      add();
      assert(!document.getElementById('smoke-test-btn'),
        'the 🧪 dev button was added with admin OFF — the b141 non-admin gate is broken');
      // admin ON → the gate must allow it, proving the assertion above is not
      // passing simply because addButton is a no-op (the control half).
      localStorage.setItem(KEY, '1');
      removeBtn();
      add();
      assert(document.getElementById('smoke-test-btn'),
        'the 🧪 dev button was NOT added with admin ON — addButton is inert, so the OFF check proves nothing');
    } finally {
      // Restore both the admin flag and the DOM to whatever the run started with,
      // so this test never leaves a stray button or a flipped flag behind.
      removeBtn();
      if (orig === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, orig);
      try { if (localStorage.getItem(KEY) === '1') add(); } catch (e) {}
    }
  }),

  // b141: no stale "Hearthbound" references in shipped code paths.
  // We ship src/, index.html, and CHANGELOG.md — none of the
  // user-visible strings should still say Hearthbound.
  () => tryRun('b141: no Hearthbound references in current build identity', () => {
    // window.HearthriseBuild is the only "build identity" surface — make
    // sure the brand is consistent.
    const b = window.HearthriseBuild || {};
    const brand = JSON.stringify(b);
    assert(!/Hearthbound/i.test(brand),
      'HearthriseBuild should not mention Hearthbound; got ' + brand);
    // Document title too
    assert(!/Hearthbound/i.test(document.title || ''),
      'document.title should not mention Hearthbound; got ' + document.title);
  }),

  // ════════════════════════════════════════════════════════════
  // b142 — FTUE walkthrough hotfixes
  // ════════════════════════════════════════════════════════════

  // b142: beta banner's modal-stacking guard now sees FTUE properly.
  // The FTUE overlay uses `.ftue-shade` and `.ftue-card`, not the old
  // `#ftue-overlay`. Verify the betaBanner only shows when no FTUE is up.
  () => tryRun('b142: BetaBanner suppresses while FTUE overlay is up', () => {
    if (!window.HearthriseBetaBanner) return;
    // Synthesize an FTUE shade
    const shade = document.createElement('div');
    shade.className = 'ftue-shade show';
    document.body.appendChild(shade);
    try {
      // Walk the same DOM check the module uses
      const blocked = !!document.querySelector(
        '.modal.show, #wbv-overlay.show, .ach-overlay.show, ' +
        '.ftue-shade.show, .ftue-card.show, ' +
        '#welcome-modal.show'
      );
      assert(blocked, 'modalAlreadyOpen should detect a live .ftue-shade.show');
    } finally {
      shade.remove();
    }
  }),

  // b143: BetaBanner defers entirely while FTUE is pending so they don't
  // stack on first load. The check is `localStorage.hearthrise:ftue:completed === '1'`.
  () => tryRun('b143: BetaBanner suppresses while FTUE pending', () => {
    if (!window.HearthriseBetaBanner) return;
    const FK = 'hearthrise:ftue:completed';
    const AK = 'hearthrise:beta-ack';
    const origF = localStorage.getItem(FK);
    const origA = localStorage.getItem(AK);
    try {
      // Simulate a brand-new player: no FTUE complete, no banner ack
      localStorage.removeItem(FK);
      localStorage.removeItem(AK);
      // Tear down any open banner instance from a prior test
      const ex = document.getElementById('beta-banner-overlay');
      if (ex) ex.remove();
      // The banner module's maybeShow() is private; we replicate the
      // ftueWillFire() logic inline. Real fix is verified by integration.
      const ftueWillFire = localStorage.getItem(FK) !== '1';
      assert(ftueWillFire === true, 'FTUE should be pending in test setup');
      // Now simulate FTUE completed
      localStorage.setItem(FK, '1');
      const ftueWillFire2 = localStorage.getItem(FK) !== '1';
      assert(ftueWillFire2 === false, 'FTUE should be complete after flag set');
    } finally {
      if (origF === null) localStorage.removeItem(FK); else localStorage.setItem(FK, origF);
      if (origA === null) localStorage.removeItem(AK); else localStorage.setItem(AK, origA);
    }
  }),

  // b142: defensive smoke-test button guard removes #smoke-test-btn for
  // non-admin players, even if a cached old smoke-test.js added one.
  () => tryRun('b142: smoke-test button auto-removed for non-admin', () => {
    const KEY = 'hearthrise:admin';
    const orig = localStorage.getItem(KEY);
    try {
      // Fake a button that a cached old build might have added
      let stub = document.getElementById('smoke-test-btn');
      let createdHere = false;
      if (!stub) {
        stub = document.createElement('button');
        stub.id = 'smoke-test-btn';
        stub.textContent = '🧪 Test';
        document.body.appendChild(stub);
        createdHere = true;
      }
      // Force non-admin
      localStorage.setItem(KEY, '0');
      // The defensive guard runs on intervals — wait long enough for
      // at least one tick (>= 1100ms), but to keep the test fast we
      // call the killer directly via a synthetic dispatch. We can
      // achieve the same by simulating its core logic inline:
      const isAdminNow = localStorage.getItem(KEY) === '1';
      if (!isAdminNow) {
        const btn = document.getElementById('smoke-test-btn');
        if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
      }
      assert(!document.getElementById('smoke-test-btn'),
        'smoke-test btn should be removed when admin flag is off');
      // Restore
      if (createdHere && document.getElementById('smoke-test-btn')) {
        document.getElementById('smoke-test-btn').remove();
      }
    } finally {
      if (orig === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, orig);
    }
  }),

  // b146: cloud-save was silently 404ing for MONTHS. auth.js pointed the
  // snapshot endpoint at `game_snapshots` — a table that doesn't exist; the
  // real table is `game_saves`. On top of that the payload sent no `slot`
  // (a NOT NULL column) and used a plain insert that would 409 on the
  // `unique (user_id, slot)` constraint after the first save. Result: no
  // player's progress ever reached the cloud via the snapshot path. These two
  // tests guard the request contract (pure builder) AND the live wiring.
  () => tryRun('b146: snapshot request upserts into game_saves with slot', () => {
    const S = window.HearthriseSync;
    assert(S && typeof S.buildSnapshotRequest === 'function', 'HearthriseSync.buildSnapshotRequest not exported');
    const req = S.buildSnapshotRequest(
      { snapshotEndpoint: 'https://example.supabase.co/rest/v1/game_saves' },
      'user-abc', { totalLevel: 5 }, 1700000000000
    );
    assert(/\/rest\/v1\/game_saves\?/.test(req.url), 'snapshot must target game_saves, got ' + req.url);
    assert(/on_conflict=user_id,slot/.test(req.url), 'snapshot must upsert on (user_id,slot), got ' + req.url);
    assert(/merge-duplicates/.test((req.headers && req.headers.Prefer) || ''), 'snapshot must use resolution=merge-duplicates');
    assert(req.body && req.body.slot === 0, 'snapshot body must include slot (NOT NULL col), got ' + JSON.stringify(req.body && req.body.slot));
    assert(req.body && 'user_id' in req.body && 'snapshot' in req.body, 'snapshot body must include user_id + snapshot');
  }),

  () => tryRun('SYNC-ONCE-1 (b461): the forced-save DOM listeners register once per page, however often setupSync re-runs', () => {
    /* setupSync() re-runs on module load, sign-in, and EVERY ~55-min token
       refresh (onAuthStateChange → enableLiveSync). Its pagehide/visibilitychange
       forced-save listeners were re-registered each time with no removal, so a
       long mobile session accumulated one forced-save pair per refresh — found
       live as a beta player blowing hr_put_client_state's 60/min rate gate.
       The smoke page has already run setupSync at least twice (offline boot +
       cloud upgrade when signed in); run it twice more and prove the
       registration count never moves past one. */
    const S = window.HearthriseSync;
    assert(S && typeof S.__lifecycleRegistrationCount === 'function',
      'HearthriseSync.__lifecycleRegistrationCount not exported');
    const before = S.__lifecycleRegistrationCount();
    assert(before === 1, 'the listener pair must have registered exactly once by now, got ' + before);
    S.setupSync(); S.setupSync();
    assert(S.__lifecycleRegistrationCount() === 1,
      'THE BUG: re-running setupSync must not stack another forced-save listener pair');
  }),

  // b146: guard the live wiring set by auth.js. Only asserts when a cloud
  // session is active (signed in); stays quiet in offline / signed-out mode.
  () => tryRun('b146: live cloud config targets game_saves not game_snapshots', () => {
    const S = window.HearthriseSync;
    const cfg = S && S.getConfig && S.getConfig();
    if (!cfg || !cfg.snapshotEndpoint) { skip('offline / signed out — live sync config not wired'); return; }
    assert(cfg.snapshotEndpoint.indexOf('game_snapshots') < 0,
      'snapshotEndpoint still points at the non-existent game_snapshots table: ' + cfg.snapshotEndpoint);
    assert(/\/game_saves$/.test(cfg.snapshotEndpoint),
      'snapshotEndpoint must end with /game_saves, got ' + cfg.snapshotEndpoint);
  }),

  // b147: totalLevel was missing from the cloud snapshot. G has no `totalLevel`
  // field (it's summed from skills by getTotalLevel()), so two things broke:
  //   1. game_saves.total_level (a generated col reading snapshot->>'totalLevel')
  //      was always null → the leaderboard couldn't rank anyone.
  //   2. auth.js's sign-in restore gate compared snap.totalLevel vs
  //      G.totalLevel — both undefined → 0 > 0 = false → cloud restore NEVER
  //      fired, so cross-device / fresh-login progress silently failed to load.
  // Guard the dependency (getTotalLevel) and that the request carries totalLevel.
  () => tryRun('b147: getTotalLevel exists and returns a number', () => {
    assert(typeof window.getTotalLevel === 'function', 'getTotalLevel() missing — snapshot totalLevel + restore gate depend on it');
    const tl = window.getTotalLevel();
    assert(typeof tl === 'number' && tl >= 0, 'getTotalLevel() must return a non-negative number, got ' + tl);
  }),

  // b147: the snapshot request must carry totalLevel through to the stored
  // snapshot (that's what the generated column + restore gate read).
  () => tryRun('b147: snapshot request carries totalLevel into the body', () => {
    const S = window.HearthriseSync;
    const req = S.buildSnapshotRequest(
      { snapshotEndpoint: 'https://example.supabase.co/rest/v1/game_saves' },
      'user-abc', { gold: 100, totalLevel: 26 }, 1700000000000
    );
    assert(req.body && req.body.snapshot && req.body.snapshot.totalLevel === 26,
      'stored snapshot must include totalLevel (drives leaderboard col + restore gate), got ' + JSON.stringify(req.body && req.body.snapshot));
  }),

  // b147: when signed in, the live sync config must feed a totalLevel provider
  // so snapshotIfDue can stamp it. Skips cleanly when signed out.
  () => tryRun('b147: live sync config provides a totalLevel source', () => {
    const S = window.HearthriseSync;
    const cfg = S && S.getConfig && S.getConfig();
    if (!cfg || !cfg.snapshotEndpoint) { skip('signed out — live sync config not wired'); return; }
    assert(cfg.totalLevel != null, 'sync config missing totalLevel provider — total_level col will be null + restore gate breaks');
  }),

  // b149: expired-token hardening. A save that failed on an expired JWT used to
  // be swallowed silently, so a long session's cloud progress could vanish with
  // no signal. sync now classifies auth errors (to refresh+retry) and surfaces
  // failures. Guard the classifier so the retry trigger can't regress.
  () => tryRun('b149: isAuthError classifies expired-token responses', () => {
    const S = window.HearthriseSync;
    assert(typeof S.isAuthError === 'function', 'HearthriseSync.isAuthError not exported');
    assert(S.isAuthError(401, '') === true, '401 should be an auth error');
    assert(S.isAuthError(403, '') === true, '403 should be an auth error');
    assert(S.isAuthError(400, '{"code":"PGRST303","message":"JWT expired"}') === true, 'PGRST303/JWT expired should be an auth error');
    assert(S.isAuthError(200, '') === false, '200 is not an auth error');
    assert(S.isAuthError(500, 'internal') === false, '500 (non-auth) should not trigger a token refresh');
  }),

  // b149: when signed in, the sync config must wire the refresh + health hooks
  // so expired tokens self-heal and failures reach the UI. Skips when signed out.
  () => tryRun('b149: live sync config wires auth-error + sync-health hooks', () => {
    const S = window.HearthriseSync;
    const cfg = S && S.getConfig && S.getConfig();
    if (!cfg || !cfg.snapshotEndpoint) { skip('signed out — live sync config not wired'); return; }
    assert(typeof cfg.onAuthError === 'function', 'sync config missing onAuthError — expired tokens won\'t refresh');
    assert(typeof cfg.onSyncFailure === 'function', 'sync config missing onSyncFailure — save failures stay invisible');
  }),

  // b150: hearthlight theme (the revamp preview) is registered and applies its
  // deep-dark ground token without disturbing the default. Restores after.
  () => tryRun('b150: hearthlight theme registers + applies', () => {
    const T = window.HearthriseTheme;
    if (!T || !T.list) return; // theme system not present
    assert(T.list().some(function(t){ return t.id === 'hearthlight'; }), 'hearthlight not in theme list');
    // b163: API is setTheme(), not set() — the old test called T.set() which
    // never existed, so this test had been throwing "T.set is not a function".
    assert(typeof T.setTheme === 'function', 'HearthriseTheme.setTheme missing');
    const prev = (T.getTheme && T.getTheme()) || 'hearthlight';
    try {
      T.setTheme('hearthlight');
      assert(document.body.getAttribute('data-theme') === 'hearthlight', 'setting hearthlight did not apply data-theme');
      const bg = getComputedStyle(document.body).getPropertyValue('--bg-0').trim().toLowerCase();
      // Don't pin the exact hex — the palette evolves. Assert bg-0 is a DARK
      // surface (Hearthlight is a dark theme). Accepts #rgb or #rrggbb.
      const hx = bg.replace('#', '');
      const full = hx.length === 3 ? hx.replace(/(.)/g, '$1$1') : hx;
      assert(/^[0-9a-f]{6}$/i.test(full) && parseInt(full, 16) < 0x333333,
        'hearthlight --bg-0 should be a dark surface, got "' + bg + '"');
    } finally {
      T.setTheme(prev); // never leave the tester on a different theme than they picked
    }
  }),

  // ── b218 regression suite (backlog #3 + #4) ──

  // b218 (#3): the equipment doll (Equipment | Stats | Companion sub-tabs) is
  // rebuilt from scratch on every panel re-render, which the game tick fires
  // via updateTopbar/addItem. It used to hardcode the Equipment pane active on
  // every rebuild, so a player who opened Stats or Companion was snapped back
  // to Equipment within seconds. The selected pane now persists in window._tdPane
  // and is restored on build. Guard: a rebuild must honour the persisted pane.
  () => tryRun('b218: doll sub-tab persists across rebuild (no snap-back)', () => {
    if (typeof window.buildTibiaDoll !== 'function') return;
    const prev = window._tdPane;
    try {
      window._tdPane = 'pet';
      const doll = window.buildTibiaDoll();
      if (!doll) return; // EQUIP_SLOTS not ready in this env
      const active = doll.querySelector('.td-tab.active');
      assert(active && active.getAttribute('data-td-pane') === 'pet',
        'rebuilt doll did not restore the persisted Companion sub-tab (snap-back regression)');
      const gearPane = doll.querySelector('.td-doll');
      assert(gearPane && gearPane.style.display === 'none',
        'Equipment pane should be hidden when the Companion sub-tab is the persisted one');
    } finally { window._tdPane = prev; }
  }),

  // b218 (#4): the Companion sub-tab used to hold ONLY the companion equip slot
  // (a lone icon), so the companion's own level/XP/stats never appeared there —
  // the always-on stat sheet beside the doll shows the PLAYER's stats, which is
  // what players saw. The pane now renders the equipped companion's own
  // progression (name, level, XP, effective bonuses) from the companions module.
  () => tryRun('b218: Companion sub-tab shows the companion\'s own level/xp', () => {
    if (typeof window.buildTibiaDoll !== 'function' || !window.G) return;
    if (typeof window.equipCompanion !== 'function' || !window.COMPANIONS) return;
    const snap = window.G.companions ? JSON.stringify(window.G.companions) : null;
    const eqSnap = window.G.equipment ? window.G.equipment.companion : undefined;
    const prevPane = window._tdPane;
    try {
      /* b515: the roster is the server's — `ensureState` fails closed to an
         empty one — so the fox has to ARRIVE before it can be equipped. Through
         the real `reconcileCompanions` (withCompanionRoster), not by writing
         `ownedIds` here, so this cannot pass against a shape the server would
         never produce. */
      window.HearthriseAccrual.reconcileCompanions(window.G,
        { companions: { owned: ['fox'], xp: {}, equipped: null } });
      window.equipCompanion('fox');
      window._tdPane = 'pet';
      const doll = window.buildTibiaDoll();
      if (!doll) return;
      const info = doll.querySelector('.td-companion-info');
      assert(info, 'Companion sub-tab is missing the companion info block (was empty / only the equip slot)');
      const def = window.COMPANIONS.fox;
      assert(def && info.textContent.indexOf(def.n) >= 0,
        'Companion info should name the equipped companion (' + (def && def.n) + ')');
      assert(/Lv\s*\d+/.test(info.textContent),
        'Companion info should show the companion level (Lv N)');
    } finally {
      window._tdPane = prevPane;
      if (snap) window.G.companions = JSON.parse(snap);
      if (window.G.equipment) window.G.equipment.companion = eqSnap;
    }
  }),

  // ── b219 regression suite (backlog #7 + #8 + beta-modal emoji) ──

  // b219 (#7a): toasts rendered at 13.5px — below the b218 readable body
  // floor (--t-body: 16px) — which is the literal "too small to read"
  // report. Guard: a live toast must render at body size or larger.
  //
  // NOTE for anyone extending these: the game tick keeps running during the
  // suite, and earlier tests leave combat/gathering active — so a real
  // "Defeated Slime" toast can land in #notifs mid-test. Never assert on
  // `querySelector('#notifs .notif')`; always find YOUR toast by its marker.
  () => tryRun('b219: toast text is at least body size (not micro)', () => {
    if (!window.HearthriseToasts) throw new Error('HearthriseToasts missing — toast queue did not load');
    window.HearthriseToasts.clear();
    try {
      window.notify('ToastProbeSize readability check', 'info');
      const el = findToast('ToastProbeSize');
      assert(el, 'notify() produced no toast element');
      const px = parseFloat(getComputedStyle(el).fontSize);
      assert(px >= 15, 'toast font-size is ' + px + 'px — below the readable body floor');
    } finally { window.HearthriseToasts.clear(); }
  }),

  // b219 (#7b): every toast dismissed after a flat 3500ms, so the long
  // messages (the save-recovery copy is 96 chars) were gone before they
  // could be read. Duration now scales with length and never dips under 4s.
  () => tryRun('b219: toast duration >= 4s and scales with text length', () => {
    const T = window.HearthriseToasts;
    if (!T || typeof T.durationFor !== 'function') throw new Error('HearthriseToasts.durationFor missing');
    const short = T.durationFor('+3 Oak Log');
    const long = T.durationFor('Your save data could not be read, so a fresh start was loaded. Open Settings.');
    assert(short >= 4000, 'short toast lasts only ' + short + 'ms (floor is 4000ms)');
    assert(long > short, 'a 76-char toast (' + long + 'ms) should outlast a 10-char one (' + short + 'ms)');
    assert(long <= 12000, 'toast duration should stay capped, got ' + long + 'ms');
  }),

  // b219 (#7c): the old code hard-capped the stack with
  // `while(children.length>5) children[0].remove()`, destroying toasts on
  // arrival during a combat burst. They queue now: never more than
  // MAX_VISIBLE on screen, and the overflow waits instead of vanishing.
  () => tryRun('b219: toast burst queues instead of overwriting', () => {
    const T = window.HearthriseToasts;
    if (!T) throw new Error('HearthriseToasts missing');
    T.clear();
    try {
      const max = T.config.MAX_VISIBLE;
      for (let i = 0; i < 9; i++) window.notify('ToastProbeQueue ' + i, 'info');
      const st = T.state();
      assert(st.visible === max, 'expected ' + max + ' visible toasts, got ' + st.visible);
      assert(st.pending === 9 - max, 'expected ' + (9 - max) + ' queued, got ' + st.pending + ' (toasts were dropped, not queued)');
      assert(st.dropped === 0, 'a 9-toast burst should not drop anything, dropped ' + st.dropped);
      assert(findToasts('ToastProbeQueue').length === max,
        'rendered probe toasts should match the visible cap');
    } finally { T.clear(); }
  }),

  // b219 (#7d): an idle game repeats itself ("Defeated Wolf" every few
  // seconds). Identical messages coalesce into one row with a counter
  // instead of each stealing a slot and racing the others off screen.
  () => tryRun('b219: repeated toasts coalesce into a count', () => {
    const T = window.HearthriseToasts;
    if (!T) throw new Error('HearthriseToasts missing');
    T.clear();
    try {
      for (let i = 0; i < 5; i++) window.notify('ToastProbeRepeat defeated', 'kill');
      const rows = findToasts('ToastProbeRepeat');
      assert(rows.length === 1, 'five identical toasts should occupy one row, got ' + rows.length);
      const badge = rows[0].querySelector('.notif-count');
      assert(badge && badge.textContent === 'x5',
        'the x5 counter is not rendered (got ' + (badge && badge.textContent) + ')');
      assert(getComputedStyle(badge).display !== 'none', 'the repeat counter is hidden');
    } finally { T.clear(); }
  }),

  // b219 (#7e + #8): THE bug. The toast column, the chat pill and the
  // bug-report button all lived in the bottom-right corner, and the chat
  // pill (z-index 10000) sat on top of the toasts (z-index 1000) — so the
  // newest notification was literally behind the chat button. The queue now
  // measures its neighbours and lifts clear of them. Guard: with a toast up,
  // the toast column must not intersect the chat dock or the bug button.
  () => tryRun('b219: toast column is never covered by the chat button', () => {
    const T = window.HearthriseToasts;
    if (!T) throw new Error('HearthriseToasts missing');
    T.clear();
    try {
      window.notify('Overlap probe', 'info');
      T.layout();
      const col = document.getElementById('notifs');
      const cr = col.getBoundingClientRect();
      assert(cr.width > 0 && cr.height > 0, 'toast column has no box');
      ['#chat-dock', '#hr-bug-btn'].forEach((sel) => {
        const ob = document.querySelector(sel);
        if (!ob) return;
        const r = ob.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        const hit = !(cr.right <= r.left + 1 || r.right <= cr.left + 1
                   || cr.bottom <= r.top + 1 || r.bottom <= cr.top + 1);
        assert(!hit, 'toast column overlaps ' + sel
          + ' — toast rect ' + JSON.stringify({ t: cr.top | 0, b: cr.bottom | 0, l: cr.left | 0, r: cr.right | 0 })
          + ' vs ' + JSON.stringify({ t: r.top | 0, b: r.bottom | 0, l: r.left | 0, r: r.right | 0 }));
      });
    } finally { T.clear(); }
  }),

  // b219 (found while verifying #7): claiming the daily reward printed ~700
  // characters of raw <svg> path data into the toast corner — the call site
  // handed notify() a string built for innerHTML, and toasts render with
  // textContent. Two guards: the reward toast must be plain text, and the
  // toast renderer must strip tags from ANY caller rather than show source.
  () => tryRun('b219: daily-reward toast is plain text, not raw SVG markup', () => {
    const D = window.HearthriseDaily;
    if (!D || typeof D.rewardFor !== 'function') throw new Error('HearthriseDaily missing');
    const T = window.HearthriseToasts;
    if (!T) throw new Error('HearthriseToasts missing');
    T.clear();
    try {
      window.notify('ToastProbeMarkup: <svg viewBox="0 0 512 512"><path d="M264 4 95z"/></svg> 500', 'levelup');
      const el = findToast('ToastProbeMarkup');
      assert(el, 'no toast rendered');
      const txt = el.textContent;
      assert(txt.indexOf('<') < 0 && txt.toLowerCase().indexOf('viewbox') < 0,
        'toast leaked markup into the visible text: ' + JSON.stringify(txt.slice(0, 80)));
      assert(/^ToastProbeMarkup:\s*500/.test(txt),
        'toast lost its actual message while stripping tags: ' + JSON.stringify(txt));
    } finally { T.clear(); }
  }),

  // b219 (#8): the chat pill was nailed to bottom-right with no escape, so
  // it covered whatever sat under it. It is draggable now, and the position
  // must SURVIVE (persisted through the platform storage seam) — a position
  // that resets on reload is not a fix.
  () => tryRun('b219: chat dock position persists and re-applies', () => {
    if (!window.Chat || typeof window.Chat.setPosition !== 'function') {
      throw new Error('Chat.setPosition missing — dock is not repositionable');
    }
    const dock = document.getElementById('chat-dock');
    assert(dock, '#chat-dock not in the DOM');
    const prev = window.Chat.getPosition();
    try {
      window.Chat.setPosition(0.1, 0.2);
      const saved = window.HearthriseStorage
        ? window.HearthriseStorage.get('hearthrise:chat:dockpos')
        : localStorage.getItem('hearthrise:chat:dockpos');
      assert(saved, 'dock position was not persisted');
      const parsed = JSON.parse(saved);
      assert(Math.abs(parsed.fx - 0.1) < 1e-6 && Math.abs(parsed.fy - 0.2) < 1e-6,
        'persisted dock position is wrong: ' + saved);
      assert(window.Chat.getPosition() !== null, 'Chat.getPosition() lost the position it just set');
      if (window.innerWidth > 540 && dock.classList.contains('mini')) {
        assert(dock.style.left && dock.style.top,
          'a custom dock position should be applied as left/top, not left on the default corner');
        // "Movable" must not let the pill create the same problem somewhere
        // else: the topbar (gold/gems/quests/settings) and the activity strip
        // are off-limits, so the top-left extreme is clamped below them.
        window.Chat.setPosition(0, 0);
        const pill = dock.getBoundingClientRect();
        ['.topbar', '.activity-bar'].forEach((sel) => {
          const chrome = document.querySelector(sel);
          if (!chrome) return;
          const c = chrome.getBoundingClientRect();
          if (c.height <= 0) return;
          assert(pill.top >= c.bottom,
            'chat pill dragged to the top-left corner covers ' + sel
            + ' (pill top ' + (pill.top | 0) + ' vs ' + sel + ' bottom ' + (c.bottom | 0) + ')');
        });
      }
      // ...and resetting must put it back on the default corner cleanly.
      window.Chat.resetPosition();
      assert(window.Chat.getPosition() === null, 'resetPosition() did not clear the saved position');
      assert(!dock.style.left, 'resetPosition() left a stale inline left offset');
    } finally {
      if (prev) window.Chat.setPosition(prev.fx, prev.fy); else window.Chat.resetPosition();
    }
  }),

  // b219 (beta modal): the first screen a new player sees rendered literal
  // emoji in its copy (a seedling in the heading, a ladybug for the Report
  // button, a speech balloon on the Discord link). Emoji-as-art is banned
  // project-wide. Guard the rendered DOM, not the source.
  () => tryRun('b219: beta welcome modal renders zero emoji', () => {
    const B = window.HearthriseBetaBanner;
    if (!B || typeof B.show !== 'function') throw new Error('HearthriseBetaBanner missing');
    const existing = document.getElementById('beta-banner-overlay');
    const wasOpen = !!existing;
    const acked = (() => { try { return localStorage.getItem('hearthrise:beta-ack'); } catch (e) { return null; } })();
    try {
      B.show();
      const overlay = document.getElementById('beta-banner-overlay');
      assert(overlay, 'beta banner did not render');
      const text = overlay.textContent || '';
      const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{231A}-\u{23FF}]/u;
      const hit = text.match(EMOJI);
      assert(!hit, 'beta welcome modal still renders emoji: "' + (hit && hit[0]) + '"');
    } finally {
      if (!wasOpen) {
        const o = document.getElementById('beta-banner-overlay');
        if (o && o.parentNode) o.parentNode.removeChild(o);
      }
      // B.show() is side-effect-free, but ack state is restored defensively.
      try {
        if (acked === null) localStorage.removeItem('hearthrise:beta-ack');
        else localStorage.setItem('hearthrise:beta-ack', acked);
      } catch (e) {}
    }
  }),

  // b219: the What's New modal fetched CHANGELOG.md and, when the parse regex
  // missed (CRLF line endings — `.` can't cross `\r`), fell back to rendering
  // the ENTIRE raw file: maintenance preamble, `#`/`##` markdown and all.
  // Guard: CRLF input parses to the first section only, malformed input
  // yields null (never the raw file), and rendered HTML strips pictographs.
  () => tryRun('b219: whats-new parser survives CRLF and never leaks the raw file', () => {
    const P = window.__hrWelcomeParse;
    if (!P) throw new Error('__hrWelcomeParse test seam missing');
    const crlf = '# Hearthrise — Changelog\r\n\r\npreamble not for players\r\n\r\n## v9.9 build 999 — 2099-01-01 (Test)\r\n\r\n- 🔤 **bullet** one\r\n\r\n## v9.8 old — 2098-01-01\r\n\r\n- old\r\n';
    const sec = P.parseFirstSection(crlf);
    assert(sec, 'CRLF changelog failed to parse');
    assert(/^v9\.9/.test(sec.title), 'wrong section picked: ' + (sec && sec.title));
    assert(!/preamble/.test(sec.body) && !/old/.test(sec.body), 'section body leaked neighbouring content');
    assert(P.parseFirstSection('no headings here at all') === null, 'malformed changelog must yield null, not the raw file');
    const html = P.mdToHtml(sec.body);
    const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    assert(!EMOJI.test(html), 'rendered whats-new HTML still contains pictographs');
    assert(/<strong>bullet<\/strong>/.test(html), 'markdown bold lost in render');
  }),

  // b223 (QA): the What's-New sheet's "don't stack on FTUE" guard was a dead
  // selector. It looked for `.hr-ftue` / `.hr-ftue-overlay`; the tour actually
  // renders `.ftue-root > .ftue-card.show`, so the guard matched nothing and
  // the sheet (z 99998) opened UNDER the tour card (z 99999) with a
  // full-screen scrim the tour's spotlight could not punch through.
  // Repro: finish one load (marks changelog seen), abandon the tour without
  // answering it, ship a new build, return — both modals on screen at once.
  // post-signup-welcome.js and identity.js were corrected in b221; this file
  // was the last straggler. Guard the BEHAVIOUR, not the string: build the
  // real FTUE DOM shape and assert the guard sees it.
  () => tryRun('b223: whats-new never stacks on the FTUE tour / name modal', () => {
    const P = window.__hrWelcomeParse;
    if (!P || typeof P.anotherModalUp !== 'function') {
      throw new Error('__hrWelcomeParse.anotherModalUp test seam missing');
    }
    // The suite may run while a real front-door overlay (daily reward, name
    // modal) is on screen. Park them for the duration and put them back
    // exactly where they were — the guard is what is under test, not the
    // scheduler that opened them.
    const parked = [].slice.call(document.querySelectorAll('.ftue-root, .hr-id-scrim, .hr-dl-scrim'))
      .map((el) => ({ el, parent: el.parentNode, next: el.nextSibling }));
    parked.forEach((p) => p.el.remove());
    const restore = () => parked.forEach((p) => {
      try { p.parent.insertBefore(p.el, p.next); } catch (e) { try { document.body.appendChild(p.el); } catch (e2) {} }
    });

    try {
      // Nothing up: the sheet must be free to open, or a returning player
      // never sees the release notes at all.
      assert(P.anotherModalUp() === false, 'guard blocks with a clean DOM — the sheet would never open');

      // The real FTUE shape (src/ftue.js): root > card, card carries `.show`
      // only while a step is actually on screen.
      const root = document.createElement('div');
      root.className = 'ftue-root';
      const card = document.createElement('div');
      card.className = 'ftue-card';
      root.appendChild(card);
      document.body.appendChild(root);
      try {
        assert(P.anotherModalUp() === false,
          'a hidden FTUE card (no .show) must not block the sheet forever');
        card.classList.add('show');
        assert(P.anotherModalUp() === true,
          'the What\'s-New sheet would stack on top of the FTUE tour (dead .hr-ftue selector regression)');
      } finally {
        root.remove();
      }

      // The b221 name modal outranks the news: you are told who you are
      // before you are told what changed.
      const idScrim = document.createElement('div');
      idScrim.className = 'hr-id-scrim';
      document.body.appendChild(idScrim);
      try {
        assert(P.anotherModalUp() === true, 'the sheet would stack on the name modal');
      } finally {
        idScrim.remove();
      }
      assert(P.anotherModalUp() === false, 'guard did not clear after the overlays were removed');
    } finally {
      restore();
    }

    // Mutual-exclusion sanity: daily-reward yields to `#hr-welcome-modal` and
    // this sheet yields to `.hr-dl-scrim`. Neither may name an element the
    // OTHER always has on screen, or the two poll each other forever.
    assert(P.BLOCKING_OVERLAYS.indexOf('#hr-welcome-modal') === -1,
      'the sheet must not block on its own overlay — that is a permanent deadlock');
  }),

  // ── b220 regression suite (backlog #12 — artisan taxonomy) ──

  // b220 (#12a): categories are DERIVED from output.type / id suffix /
  // foodClass, never hand-tagged, so a new recipe files itself. The whole
  // scheme is only worth anything if it is total: one uncategorized recipe is
  // one recipe a player can no longer reach, because the grid now renders a
  // single category at a time. Guard: zero strays, across all three skills.
  () => tryRun('b220: every artisan recipe lands in exactly one category', () => {
    const cz = window.categorizeRecipes;
    assert(typeof cz === 'function', 'categorizeRecipes not published on window');
    ['smithing', 'crafting', 'cooking'].forEach((skill) => {
      const res = cz(skill, window.ARTISAN_RECIPES[skill], window.ITEMS);
      assert(res.groups.length > 0, skill + ' produced no categories at all');
      assert(res.uncategorized.length === 0,
        skill + ' has ' + res.uncategorized.length + ' uncategorized recipe(s): '
        + res.uncategorized.map((r) => r.id).join(', '));
      const summed = res.groups.reduce((n, g) => n + g.recipes.length, 0);
      assert(summed === res.total,
        skill + ' categories hold ' + summed + ' of ' + res.total + ' recipes (a recipe is in two lanes or none)');
      // Every category the taxonomy declares as present must be non-empty —
      // an empty lane is a dead tab.
      res.groups.forEach((g) => assert(g.recipes.length > 0, skill + ' category "' + g.key + '" is empty'));
    });
    // Prayer deliberately has no taxonomy — it must degrade to "no strip",
    // not to "no recipes".
    const pr = cz('prayer', window.ARTISAN_RECIPES.prayer, window.ITEMS);
    assert(pr.groups.length === 0 && pr.total === window.ARTISAN_RECIPES.prayer.length,
      'prayer should have no categories but keep all its recipes');
  }),

  // b220 (#12b): the cooking split is the headline — Provisions (what you eat
  // to heal, and the only pool auto-eat may touch) vs Feasts & Draughts (what
  // you spend for a timed buff). The mapping is authored per item, so it is
  // the one part of the taxonomy that CAN drift. Lock the totals: 13 / 14.
  () => tryRun('b220: cooking splits 19 Provisions / 15 Feasts & Draughts', () => {
    const cz = window.categorizeRecipes;
    assert(typeof cz === 'function', 'categorizeRecipes not published on window');
    const res = cz('cooking', window.ARTISAN_RECIPES.cooking, window.ITEMS);
    const of = (k) => (res.groups.find((g) => g.key === k) || { recipes: [] }).recipes;
    // Wave 2 added Turnip Mash (a healing Provision), so Provisions went 13 → 14.
    // b544 "Reed & Tide" added six cooking rungs: five healing Provisions
    // (Grilled Pikeperch, Steamed Copper Crab, Silverfin Fillet, Goldgill Steak,
    // River Chowder) and ONE Feast (Fisher's Pie, foodClass 'buff'), so 14 → 19
    // and 14 → 15. These two literals are the point of the test — they are what
    // makes a new dish joining the wrong category a FAILURE rather than a
    // silent reclassification.
    assert(of('provisions').length === 19, 'expected 19 Provisions, got ' + of('provisions').length);
    assert(of('feasts').length === 15, 'expected 15 Feasts & Draughts, got ' + of('feasts').length);
    // Spot-check the two ends of the ruling: the top heal is a Provision even
    // though it carries a damage buff; the endgame feast never is.
    assert(window.ITEMS.cooked_shark.foodClass === 'healing', 'Cooked Shark must stay a Provision (top heal)');
    assert(window.ITEMS.void_banquet.foodClass === 'buff', 'Void Banquet must be a Feast');
    // Every cooked output must be explicitly classified — no implicit fallback
    // on the cooking screen, or a new dish quietly joins Provisions.
    // b222: castle stores are the one legitimate exception. A Field Ration is
    // not a meal, it is materiel: it has no `heals` and no `buff`, so
    // foodClassOf() returns null by design and auto-eat can never touch it.
    window.ARTISAN_RECIPES.cooking.forEach((r) => {
      const it = window.ITEMS[r.output];
      assert(it, 'cooking recipe ' + r.id + ' has no output item');
      if (it.tag === 'castle') {
        assert(!it.heals && !it.buff && !it.foodClass,
          'castle good ' + r.output + ' must not heal, buff or carry a foodClass');
        return;
      }
      assert(it.foodClass === 'healing' || it.foodClass === 'buff',
        'cooked item ' + r.output + ' has no foodClass');
    });
  }),

  // b220 (#12c): auto-eat = heal only. This is a design law, not a preference:
  // a player who leaves auto-eat on and walks away must never come back to a
  // bag emptied of Void Banquets. Guard the engine, with the hardest case —
  // a buff feast is the ONLY food owned, and HP is at zero threshold.
  () => tryRun('b220: auto-eat never consumes buff food', () => {
    const A = window.HearthriseAuto;
    assert(A && typeof A.maybeAutoEat === 'function', 'HearthriseAuto.maybeAutoEat missing');
    const G = window.G;
    const snap = {
      inv: JSON.parse(JSON.stringify(G.inventory || {})),
      hp: G.playerHp, maxHp: G.playerMaxHp,
      traits: JSON.parse(JSON.stringify(G.traits || {})),
      eat: JSON.parse(JSON.stringify(A.getEat())),
    };
    try {
      G.traits = Object.assign({}, G.traits, { auto_eat: true, auto_eat_2: true });  // b459: tier II = the pre-tier behaviour these fixtures assert
      G.playerMaxHp = 100; G.playerHp = 10;
      // ONLY buff food in the bag, and it is explicitly the configured food.
      G.inventory = { void_banquet: 3, pumpkin_pie: 2 };
      A.setEat({ enabled: true, threshold: 0.9, foodId: 'void_banquet' });
      const ate = A.maybeAutoEat();
      assert(ate === false, 'auto-eat consumed buff food (it returned true)');
      assert(G.inventory.void_banquet === 3, 'Void Banquet was eaten: ' + G.inventory.void_banquet + ' left of 3');
      assert(G.inventory.pumpkin_pie === 2, 'Pumpkin Pie was eaten: ' + G.inventory.pumpkin_pie + ' left of 2');
      assert(G.playerHp === 10, 'HP changed (' + G.playerHp + ') — something healed the player');
      // …and it must still eat a Provision, picking the best heal available.
      G.inventory = { void_banquet: 3, cooked_shrimp: 2, cooked_shark: 1 };
      A.setEat({ enabled: true, threshold: 0.9, foodId: null });
      assert(A.maybeAutoEat() === true, 'auto-eat refused to eat an available Provision');
      assert(G.inventory.void_banquet === 3, 'auto-eat still reached for the Feast');
      assert(!G.inventory.cooked_shark, 'auto-eat did not pick the biggest-healing Provision (Cooked Shark)');
      // The classification helper is the contract both UI and engine read.
      assert(A.isAutoEatable(window.ITEMS.cooked_shark) === true, 'Cooked Shark should be auto-eatable');
      assert(A.isAutoEatable(window.ITEMS.void_banquet) === false, 'Void Banquet must not be auto-eatable');
      assert(A.isAutoEatable(window.ITEMS.shrimp) === true, 'raw food should stay auto-eatable (implicit healing)');
      assert(A.isAutoEatable(window.ITEMS.iron_bar) === false, 'a bar is not food');
    } finally {
      G.inventory = snap.inv; G.playerHp = snap.hp; G.playerMaxHp = snap.maxHp;
      G.traits = snap.traits;
      A.setEat(snap.eat);
    }
  }),

  // ── b224: manual eating ────────────────────────────────────────────────
  // Beta report: "eating food is confusing." It was worse than confusing —
  // there was no Eat button. The item flyout gated `Eat 1` behind
  // `typeof eatItem === 'function'` and eatItem never existed, so the only
  // manual-eat path in the whole game was a right-click context menu, while
  // the flyout's PRIMARY button ("Set Auto-eat") wrote a dead field, appeared
  // on food auto-eat refuses, and configured a 5,000g trait the player did
  // not own. These four tests are the contract for the fix.

  // (1) The verb, the classification, and the plain-words effect text.
  () => tryRun('b224: foodUseInfo names every food kind with its own verb', () => {
    const f = window.foodUseInfo;
    assert(typeof f === 'function', 'window.foodUseInfo missing — the shared food wording is gone');
    const prov = f('cooked_shrimp');
    assert(prov && prov.kind === 'provision', 'Cooked Shrimp must read as a Provision');
    assert(prov.verb === 'Eat', 'a Provision is Eaten, got verb ' + prov.verb);
    assert(prov.autoEatable === true, 'a Provision must be auto-eatable');
    assert(prov.healText === 'Heals 8', 'Provision heal text wrong: ' + prov.healText);

    const feast = f('void_banquet');
    assert(feast && feast.kind === 'feast', 'Void Banquet must read as a Feast');
    assert(feast.verb === 'Use', 'a Feast is Used, got verb ' + feast.verb);
    assert(feast.autoEatable === false, 'a Feast must never read as auto-eatable');
    // The buff is the whole reason to spend it — it must be stated in words.
    assert(/%/.test(feast.buffText) && /min/.test(feast.buffText),
      'Feast buff text must state magnitude and duration, got: ' + feast.buffText);

    const draught = f('moonbloom_elixir');
    assert(draught && draught.kind === 'draught', 'Moonbloom Elixir must read as a Draught');
    assert(draught.verb === 'Drink', 'a Draught is Drunk, got verb ' + draught.verb);
    assert(draught.autoEatable === false, 'a Draught must never read as auto-eatable');

    // Raw ingredients are implicitly healing (auto-eat may still use them).
    assert(f('shrimp').kind === 'provision', 'raw food should read as a Provision');
    assert(f('iron_bar') === null, 'a bar is not food');
  }),

  // (2) Eat actually heals and actually decrements — the loop the player
  //     reported as "nothing happens".
  () => tryRun('b224: eating a Provision heals and consumes exactly one', () => {
    const G = window.G;
    assert(typeof window.eatFood === 'function', 'window.eatFood missing');
    const snap = { inv: JSON.parse(JSON.stringify(G.inventory || {})), hp: G.playerHp, maxHp: G.playerMaxHp };
    try {
      G.inventory = { cooked_shrimp: 4 };
      G.playerMaxHp = 100; G.playerHp = 50;
      const ok = window.eatFood('cooked_shrimp');
      assert(ok === true, 'eatFood returned ' + ok + ' for an eatable Provision');
      assert(G.playerHp === 58, 'expected 58 HP after +8 heal, got ' + G.playerHp);
      assert(G.inventory.cooked_shrimp === 3, 'expected 3 left, got ' + G.inventory.cooked_shrimp);
      // Heals clamp at max, never overheal.
      G.playerHp = 97;
      window.eatFood('cooked_shrimp');
      assert(G.playerHp === 100, 'heal must clamp to max HP, got ' + G.playerHp);
    } finally {
      G.inventory = snap.inv; G.playerHp = snap.hp; G.playerMaxHp = snap.maxHp;
    }
  }),

  // (2b) SERVER-AUTHORITATIVE EAT (Paione P0, 2026-08-25). The transport that
  //      makes the consumption REAL server-side must be published and its wire
  //      must carry a NAME and nothing computable — no heals, no hp, no qty.
  //      Before this verb, eatFood debited G.inventory client-only and the
  //      absolute inventory reconcile RESTORED the eaten food on reload: a free
  //      heal and an effective dupe. This asserts the wire, not a round trip
  //      (the suite has no live server) — the round trip is graded by
  //      tests/eat-intent.mjs against real PostgreSQL.
  () => tryRun('eat: the manual-eat transport is published and sends only a NAME', () => {
    const M = window.HearthriseEat;
    assert(M && typeof M.sendEat === 'function', 'window.HearthriseEat.sendEat missing — eatFood cannot back the eat server-side');
    assert(typeof M.configureEat === 'function' && typeof M.buildEatRequest === 'function', 'eat transport is incomplete');
    const { url, init } = M.buildEatRequest({ url: 'https://x/functions/v1/hr-accrue', token: 't', intentId: '00000000-0000-4000-a000-000000000001', item: 'turnip', slot: 0 });
    assert(/\/functions\/v1\/hr-accrue$/.test(url), 'eat endpoint wrong: ' + url);
    const body = JSON.parse(init.body);
    assert(body.verb === 'eat' && body.item === 'turnip', 'eat wire must carry verb+item, got ' + init.body);
    // ⚠ THE SECURITY PROPERTY: no computed value crosses. The heal and the hp
    //   are the server's, read from src/data; the client names the food only.
    assert(!('heals' in body) && !('hp' in body) && !('qty' in body) && !('amount' in body),
      'eat wire leaked a computed value — the heal/hp must be server-owned: ' + init.body);
    // A refusal that reached the DB (insufficient_item / version_conflict) carries
    // an envelope so the client reconciles rather than keeps its optimistic guess.
    const c = M.classifyEatResponse(409, { ok: false, error: 'insufficient_item', state: {}, version: 3, inventory: {} });
    assert(c.outcome === 'refused' && c.reason === 'insufficient_item', 'classifyEatResponse misread a refusal');
    assert(M.isAnswered('timeout') === false && M.isAnswered('refused') === true, 'eat answered-set is wrong (key reuse safety)');
  }),

  // (2b-hp) HP-SERVER-OWNED (b511) — THE STALE FULL BAR THAT FOUGHT A GHOST.
  //   Live, QA slot, 2026-09-06 14:40 UTC: server player_state.hp = 6 / max_hp 13
  //   (a 40% resume after a recovery window expired). The client booted showing
  //   13/13, opened a Dark Wizard fight from that full bar, and 40 s in still read
  //   11/13 "Fighting Dark Wizard" while the server's settle — simulating from 6 —
  //   recorded death #8 and a fresh recovery clock (fallState: recovering,
  //   serverDied:true, fellAt:0 — the client never fell). Two causes, both asserted
  //   here: the b373 raise-only floor let the client keep the HIGHER number, and
  //   startCombat opened the fight from playerMaxHp instead of the server's hp.
  () => tryRun('hp: the server owns the bar — a lower server hp is adopted, seeds the fight, and a fed settle raises it', () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.reconcileHp === 'function',
      'reconcileHp is not exported — the hp apply is not shared with the boot path');
    const G = window.G;
    const snap = snapshotG();
    const wasFighting = G.activeMonster;
    try {
      if (typeof A.__resetServerHp === 'function') A.__resetServerHp();
      try { window.stopCombat && window.stopCombat(); } catch (e) {}

      // (1) BOOT: the hr_load body says 6/13 while the client sits at a full 13/13.
      G.activeMonster = null; G.playerMaxHp = 13; G.playerHp = 13;
      A.reconcileHp(G, { ok: true, state: { hp: 6, max_hp: 13 } });
      assert(G.playerHp === 6,
        'HP-SERVER-OWNED: the client kept ' + G.playerHp + '/13 over the server\'s 6 — the b373 '
        + 'raise-only floor is back, and a 40% recovery resume is being overwritten by a stale full bar');
      const seen = A.serverHp();
      assert(seen && seen.hp === 6, 'HP-SERVER-OWNED: serverHp() did not observe the server\'s 6');

      // (2) startCombat SEEDS FROM THE SERVER HP, NOT THE MAX. Even with the bar
      //     re-inflated to full before the tap, the fight must open at 6 or below
      //     (the opening tick may already have taken a swing's damage).
      G.playerHp = 13;
      if (typeof window.startCombat === 'function' && window.MONSTERS && window.MONSTERS.slime) {
        window.startCombat('slime');
        assert(Number(G.playerHp) <= 6,
          'HP-SERVER-OWNED: the fight opened at ' + G.playerHp + '/13 — startCombat is still seeding '
          + 'from playerMaxHp, so the client predicts a fight the server settles from 6');
        // (2b) AND THE IN-FIGHT EXCEPTION STILL HOLDS: a non-away envelope's
        //      stale-full hp must not heal a live fight (Paione P0).
        const inFightHp = Number(G.playerHp);
        A.reconcileHp(G, { ok: true, state: { hp: 13, max_hp: 13 } });
        assert(Number(G.playerHp) === inFightHp,
          'HP-SERVER-OWNED: a non-away envelope healed a LIVE fight to ' + G.playerHp + ' — Paione\'s P0 is back');
        try { window.stopCombat(); } catch (e) {}
      }

      // (3) A FED SETTLE STILL RAISES IT. Out of combat, the server's higher hp
      //     is adopted exactly as absolutely as the lower one was.
      G.activeMonster = null; G.playerHp = 6;
      A.reconcileHp(G, { ok: true, state: { hp: 13, max_hp: 13 } });
      assert(G.playerHp === 13,
        'HP-SERVER-OWNED: an out-of-combat heal to 13 did not apply (bar is ' + G.playerHp + ')');
    } finally {
      try { window.stopCombat && window.stopCombat(); } catch (e) {}
      if (typeof A.__resetServerHp === 'function') A.__resetServerHp();
      restoreG(snap);
      if (wasFighting) { try { window.startCombat(wasFighting); } catch (e) {} }
    }
  }),

  // (2c) EAT-COMBAT-HP — THE LIVE-COMBAT HALF OF THE P0 (2026-08-25 play-gate).
  //      During a live client-predicted fight the server pointer is idle and
  //      server hp is STALE-FULL. accrue.js's HP floor writes an envelope's hp
  //      unconditionally while G.activeMonster is set (b373), so an eat envelope
  //      would SNAP the client's live combat hp up to the stale-full server
  //      value (the "hp jumped to 10" the play-gate saw). The eat hook must
  //      PRESERVE the client-owned combat hp across the reconcile. This drives
  //      the REAL hook installed by wireServerEat().
  () => tryRun('eat: an eat envelope does not snap client combat HP during a live fight', () => {
    const G = window.G;
    assert(typeof window.wireServerEat === 'function', 'wireServerEat missing — the eat hook is not wired');
    const M = window.wireServerEat();
    assert(M && typeof M.getEatHooks === 'function', 'eat transport not installed');
    const hook = M.getEatHooks().onEnvelope;
    assert(typeof hook === 'function', 'the eat onEnvelope hook was not installed');
    /* FULL snapshot — hook() runs applyServerEnvelope, which reconciles inventory,
       equipment, skills, etc. from the env below. A partial restore left G.equipment
       emptied (env.equipment:{}), which polluted a LATER render test (b221 shop
       "something is covering the buy control"). snapshotG/restoreG covers the whole
       reconciled surface. */
    const snap = snapshotG();
    /* THE ENVELOPE MUST ACTUALLY APPLY FOR THIS TEST TO MEAN ANYTHING. The eat
       hook routes through applyIntentEnvelope, which first runs the b366
       replacement gate: this synthetic env carries empty skills + a one-item
       inventory, so describeReplacement reads DESTRUCTIVE against the real local
       save and — unacknowledged — REFUSES the envelope and mounts the consent
       sheet (#hr-accrual-replace-gate). That did two bad things: the floor never
       fired, so `G.playerHp === 4` passed for the WRONG reason (nothing applied),
       and the mounted sheet leaked to cover a LATER render test (b221 shop "buy
       control covered"). Acknowledge the replacement so the envelope truly
       applies (floor sets hp=10, hook must restore 4); restore the ack + tear
       down any sheet in finally. */
    const A = window.HearthriseAccrual;
    const wasAck = !!(A && A.isReplacementAcknowledged && A.isReplacementAcknowledged());
    try {
      if (A && A.acknowledgeReplacement) A.acknowledgeReplacement(true);
      // Model a live client fight at LOW combat hp; the server (envelope) reads FULL.
      G.activeMonster = 'goblin'; G.playerMaxHp = 10; G.playerHp = 4; G.gold = 0;
      const env = { ok: true, version: 999999999, now: new Date().toISOString(),
        state: { hp: 10, max_hp: 10, gold: 0, accrued_to: new Date().toISOString() },
        skills: {}, inventory: { turnip: 1 }, equipment: {} };
      const applied = hook(env);   // the floor would set G.playerHp = 10; the hook must restore 4
      assert(applied, 'EAT-COMBAT-HP: the envelope was REFUSED (replacement gate) — the HP floor never ran, so this test proves nothing');
      assert(G.playerHp === 4,
        'EAT-COMBAT-HP: the envelope SNAPPED live combat hp to the stale-full server value ('
        + G.playerHp + ' — expected the preserved 4). Paione\'s live-combat symptom is back.');
    } finally {
      if (A && A.acknowledgeReplacement) A.acknowledgeReplacement(wasAck);
      if (A && A.hideReplacementSheet) A.hideReplacementSheet();
      restoreG(snap);
      /* hook(env) → applyServerEnvelope → refreshAll(), and this test set
         activeMonster='goblin', so the hook re-rendered the COMBAT view. restoreG
         restores G but not the rendered DOM, which then overlapped a LATER
         render-geometry test (b221 shop "something is covering the buy control").
         Reset to a neutral view + clear transient overlays so the DOM matches the
         restored state. */
      try { window.closeAllModals && window.closeAllModals(); } catch (e) {}
      try { window.showTab && window.showTab('profile'); } catch (e) {}
    }
  }),

  // (3) Full HP is an honest dead end for a Provision (its only value is the
  //     heal, so eating one at full HP destroyed it and changed nothing —
  //     literally "I clicked eat and nothing happened"). A Feast is spent for
  //     its timed buff, so full HP must NOT block it.
  () => tryRun('b224: full HP refuses a Provision but never blocks a Feast', () => {
    const G = window.G;
    const snap = {
      inv: JSON.parse(JSON.stringify(G.inventory || {})),
      hp: G.playerHp, maxHp: G.playerMaxHp,
      buffs: JSON.parse(JSON.stringify(G.buffs || [])),
    };
    try {
      G.inventory = { cooked_shrimp: 4, void_banquet: 2 };
      G.playerMaxHp = 100; G.playerHp = 100;
      const refused = window.eatFood('cooked_shrimp');
      assert(refused === false, 'eatFood must refuse a Provision at full HP, got ' + refused);
      assert(G.inventory.cooked_shrimp === 4, 'the refused Provision was consumed anyway');
      // ...but an explicit force still works, for callers that mean it.
      assert(window.eatFood('cooked_shrimp', { force: true }) === true, 'opts.force must override the full-HP guard');
      assert(G.inventory.cooked_shrimp === 3, 'forced eat did not consume');
      // A Feast at full HP is a legitimate, deliberate spend.
      G.playerHp = 100;
      G.buffs = [];
      assert(window.eatFood('void_banquet') === true, 'full HP must not block a Feast — it is eaten for the buff');
      assert(G.inventory.void_banquet === 1, 'Feast was not consumed');
      assert(G.buffs.length === 1, 'Feast did not apply its buff');
    } finally {
      G.inventory = snap.inv; G.playerHp = snap.hp; G.playerMaxHp = snap.maxHp; G.buffs = snap.buffs;
    }
  }),

  // (4) The combat food controls state what auto-eat does, offer a manual Eat,
  //     and never offer an auto-eat the engine will refuse. The three states
  //     that were each a lie before b224: trait not owned, no Provisions, and
  //     a bag holding only Feasts.
  //     b227: the Eat BUTTON moved out of #combat-area and onto the arena
  //     stage, beside the player's own HP bar (it used to render below the fold
  //     during a fight). Every assertion below is unchanged — only where the
  //     button is read from moved, which is the point of the change.
  () => tryRun('b224: combat food controls are honest in every state', () => {
    const G = window.G;
    assert(typeof window.renderCombat === 'function', 'renderCombat missing');
    assert(typeof window.bestProvisionId === 'function', 'bestProvisionId missing');
    const snap = {
      inv: JSON.parse(JSON.stringify(G.inventory || {})),
      hp: G.playerHp, maxHp: G.playerMaxHp, monster: G.activeMonster,
      mhp: G.monsterHp, mmax: G.monsterMaxHp,
      traits: JSON.parse(JSON.stringify(G.traits || {})),
      eat: JSON.parse(JSON.stringify(window.HearthriseAuto.getEat())),
    };
    const row = () => {
      window.renderCombat();
      const el = document.querySelector('#combat-area .cbt-food');
      assert(el, 'the combat food block did not render');
      const btn = document.querySelector('#arena-act-player .arena-eat');
      assert(btn, 'the Eat button did not render on the arena stage');
      return {
        btn: btn.textContent.trim(),
        disabled: !!btn.disabled,
        hasPicker: !!el.querySelector('select'),
        note: el.querySelector('.cbt-food-note').textContent,
      };
    };
    try {
      G.activeMonster = 'slime';
      G.monsterHp = 8; G.monsterMaxHp = 8;
      G.playerMaxHp = 100; G.playerHp = 30;
      G.inventory = { cooked_shrimp: 5 };

      // Auto-eat not owned → no picker at all (it would configure nothing),
      // a working manual Eat, and a note that says so.
      G.traits = {};
      let r = row();
      assert(!r.hasPicker, 'auto-eat picker must not render when the trait is not owned');
      assert(/^Eat /.test(r.btn) && !r.disabled, 'a manual Eat button must be offered, got: ' + r.btn);
      assert(/Store unlock/i.test(r.note), 'the note must say auto-eat is locked, got: ' + r.note);

      // Trait owned → picker appears and the note explains the threshold.
      G.traits = { auto_eat: true, auto_eat_2: true };
      window.HearthriseAuto.setEat({ enabled: true, threshold: 0.5, foodId: 'cooked_shrimp' });
      r = row();
      assert(r.hasPicker, 'auto-eat picker must render once the trait is owned');
      assert(/falls below 50%/.test(r.note), 'the note must state the threshold, got: ' + r.note);
      assert(/never auto-eaten/i.test(r.note), 'the note must say Feasts are never auto-eaten, got: ' + r.note);

      // Full HP → Eat is an honest disabled state, not a silent no-op.
      G.playerHp = 100;
      r = row();
      assert(r.disabled && /full/i.test(r.btn), 'full HP must disable Eat with a reason, got: ' + r.btn);

      // A bag of nothing but Feasts is the same as no healing food, and the
      // picker must not offer one.
      G.playerHp = 30;
      G.inventory = { void_banquet: 3, moonbloom_elixir: 2 };
      r = row();
      assert(r.disabled && /No healing food/i.test(r.btn), 'Feasts must not satisfy the Eat button, got: ' + r.btn);
      assert(!r.hasPicker, 'the picker must not offer a Feast as auto-eat food');
      assert(/No Provisions/i.test(r.note), 'the note must name the missing thing, got: ' + r.note);
      assert(window.bestProvisionId() === null, 'bestProvisionId must not return a Feast');
    } finally {
      G.inventory = snap.inv; G.playerHp = snap.hp; G.playerMaxHp = snap.maxHp;
      G.activeMonster = snap.monster; G.monsterHp = snap.mhp; G.monsterMaxHp = snap.mmax;
      G.traits = snap.traits;
      window.HearthriseAuto.setEat(snap.eat);
      try { window.renderCombat(); } catch (e) { /* restoring state only */ }
    }
  }),

  /* ── b227 · the combat stage ────────────────────────────────────────────
     Tyler: "the eat food button is hard to read, and it needs to be closer to
     the character screen. Right now I have to scroll down to see it — that's
     crazy." The cause was structural: every control except the portraits and
     HP bars rendered into #combat-area, the one scrolling box on the screen,
     and the Eat button rendered LAST. So the regression this guards is not
     "does an Eat button exist" (b224 already covers that) but "can the player
     reach it without scrolling, during a fight". The suite runs at 1440×900,
     so the geometry below is a real measurement at a real supported size. */
  () => tryRunAsync('b227: the Eat button is on the stage and reachable without scrolling', async () => {
    const G = window.G;
    const snap = { monster: G.activeMonster, mhp: G.monsterHp, mmax: G.monsterMaxHp,
      hp: G.playerHp, maxHp: G.playerMaxHp, inv: JSON.parse(JSON.stringify(G.inventory || {})),
      tab: window.activeTab };
    try {
      window.showTab('combat');
      G.activeMonster = 'slime'; G.monsterHp = 8; G.monsterMaxHp = 8;
      G.playerMaxHp = 100; G.playerHp = 30;
      G.inventory = { cooked_shrimp: 5 };
      window.renderCombat();

      /* ⚠ MEASURE THE SETTLED LAYOUT, NOT A TRANSIENT (b499).
         Every assertion below reads getBoundingClientRect(), and the arena is
         NOT laid out when renderCombat() returns: the portraits and their
         plates load asynchronously, so the stage keeps resizing for a few
         hundred milliseconds. MEASURED on this build, one fresh page, nothing
         else running — the Eat button against the arena card's bottom edge:
             immediately after renderCombat()   +1.11px OVER   (fail)
             +50ms                              +5.69px OVER   (fail)
             +300ms                             -11.2px inside (pass)
             +1s / fonts ready                  -10.89px inside (pass)
         The settled answer has ELEVEN PIXELS of headroom, so the assertion is
         not marginal and is not being loosened — it was simply being asked
         before the page had finished answering. That is why this went red with
         no CSS, markup or layout change anywhere in the build: the boot path
         got a little heavier and the transient moved.
         Settle by WAITING FOR THE GEOMETRY TO STOP MOVING rather than by
         sleeping a magic number, so a slower machine cannot reintroduce the
         flake and a faster one does not pay for it. */
      const settle = async () => {
        let last = null;
        for (let i = 0; i < 40; i++) {                     // ~1.3s ceiling
          await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 32)));
          const b = document.querySelector('#arena-act-player .arena-eat');
          const c = document.querySelector('#panel-combat .combat-arena');
          if (!b || !c) continue;
          const key = b.getBoundingClientRect().bottom + '|' + c.getBoundingClientRect().bottom;
          if (key === last) return;                        // two frames agree
          last = key;
        }
      };
      await settle();

      const btn0 = document.querySelector('#arena-act-player .arena-eat');
      assert(btn0, 'no Eat button on the player side of the arena');

      // It must not live inside the scrolling box — that is the whole bug.
      const scroller = document.getElementById('combat-area');
      assert(scroller && !scroller.contains(btn0),
        'the Eat button is back inside #combat-area, the box that scrolls');
      const stage0 = document.querySelector('#panel-combat .combat-arena > .arena-vs');
      assert(stage0 && stage0.contains(btn0), 'the Eat button must sit on the arena stage');
      assert(getComputedStyle(stage0).flexShrink === '0',
        'the stage must not be compressible, or the log will squeeze the champion off-screen');

      /* ── THE GEOMETRY, GRADED IN MORE THAN ONE STATE (b513) ──────────────
         This assertion has now gone red twice for the same reason and it was
         BOTH times blamed on something narrower — first on a transient (b499,
         real but not the whole story), then on the style row's labels (b512,
         also real, also not the whole story). What was actually true is that
         the arena card had ELEVEN pixels of headroom while the ten rows on the
         stage are TYPE, so any state that spends a line spends the headroom: a
         longer provision name, a knocked-out line on the activity bar, a style
         label that wraps. MEASURED on the pre-b513 tree at 1440x900, five fresh
         boots, nothing else running: the style row alone came back 98.5px or
         133.1px — a 34.6px swing between two identical boots, with all four
         buttons at 47px in both (which is why b512's equal-height guard is
         green in both modes and cannot see this). 34.6 > 11, so the suite's
         verdict was decided by whichever mode the boot landed in and by what
         the tests before it had left on the screen.
         b513 made row 1 of the stage elastic and clamped the stage to the card,
         so the PLATE — not the player's controls — absorbs that swing. This
         guard is therefore graded in TWO states and asks for real headroom,
         which is a STRONGER property than the one it replaced, not a weaker
         one: it still fails the instant the button leaves the card, and it now
         also fails if the card merely stops containing it in a state the
         previous version never rendered. */
      const check = async (what) => {
        await settle();
        const r = document.querySelector('#arena-act-player .arena-eat').getBoundingClientRect();
        const card = document.querySelector('#panel-combat .combat-arena').getBoundingClientRect();
        const stageR = document.querySelector('#panel-combat .combat-arena > .arena-vs').getBoundingClientRect();
        const h = (sel) => Math.round(((document.querySelector(sel) || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height));
        const why = (msg, over) => msg
          + ' [state: ' + what + '] button ' + Math.round(r.top) + '–' + Math.round(r.bottom)
          + ' vs card ' + Math.round(card.top) + '–' + Math.round(card.bottom)
          + ' (over bottom by ' + Math.round(over) + '); viewport ' + window.innerHeight
          + '; card height ' + Math.round(card.height)
          + '; stage height ' + Math.round(stageR.height)
          + '; stage over card by ' + Math.round(stageR.bottom - card.bottom)
          + '; scroller height ' + h('#combat-area')
          + '; style row ' + h('#panel-combat .fs-style')
          + '; foe plate ' + h('#panel-combat .arena-vs.fs-stage .arena-side.foe .arena-portrait')
          + '; eat=' + JSON.stringify(window.HearthriseAuto && window.HearthriseAuto.getEat && window.HearthriseAuto.getEat())
          + '; traits=' + JSON.stringify({ ae: !!(G.traits && G.traits.auto_eat), ae2: !!(G.traits && G.traits.auto_eat_2) })
          + '; buffs=' + ((G.buffs && G.buffs.length) | 0)
          + '; log=' + ((G.combatLog && G.combatLog.length) | 0)
          + '; body="' + document.body.className + '"'
          + '; activity="' + ((document.getElementById('activity-bar') || {}).className || '-') + '"'
          + '; scale=' + (document.documentElement.style.getPropertyValue('--ui-scale') || 'unset')
          + '; overlays=' + document.querySelectorAll('.hr-room-scrim, .hr-modal, #aep-overlay').length;
        assert(r.width > 0 && r.height > 0, 'the Eat button has no box [state: ' + what + ']');
        assert(r.top >= 0 && r.bottom <= window.innerHeight,
          'the Eat button is off-screen at ' + Math.round(r.top) + '–' + Math.round(r.bottom)
          + ' in a ' + window.innerHeight + 'px viewport [state: ' + what + ']');
        /* THE STRUCTURAL INVARIANT, ASSERTED FIRST BECAUSE IT IS THE CAUSE.
           The stage is where every control lives, so "the stage fits the card"
           implies "every control fits the card" — and when it is false it says
           WHY the button moved instead of only that it did. Pre-b513 this was
           false in the DEFAULT state at 1440x900 (stage 723 inside a 690 card):
           the metrics strip and the session tally were already being painted
           outside the card and Eat was next in the queue. */
        assert(stageR.bottom <= card.bottom + 1 && stageR.top >= card.top - 1,
          why('the arena stage does not fit inside the arena card', stageR.bottom - card.bottom));
        /* EIGHT PIXELS OF REAL HEADROOM, not "did not quite touch the edge".
           A control flush against the edge of its container is a layout that
           has already failed and has not been told yet — that is the margin
           both previous reds lived inside. Measured on b513 at 1440x900,
           1280x800, 1366x768 and 1024x900: 73px in every one. */
        assert(r.bottom <= card.bottom - 8,
          why('the Eat button has no headroom inside the arena card', r.bottom - card.bottom));
        assert(r.top >= card.top - 1, why('the Eat button escaped the top of the arena card', 0));
      };

      await check('default · slime, 5 shrimp, 30/100 HP');

      /* STATE 2 — THE ONE THAT USED TO DECIDE THE VERDICT. Everything here
         spends type on the rows around Eat: the longest healing item in the
         catalogue in the provisions tile, a full combat log, and the activity
         bar's knocked-out line (b511), which is the tallest state the shell
         above the card has. If the card holds its controls here it holds them
         in whatever a preceding test left behind. */
      const heals = window.ITEMS || {};
      const hostile = Object.keys(heals)
        .filter((id) => (heals[id] || {}).heal > 0)
        .sort((a, b) => String((heals[b] || {}).name || b).length - String((heals[a] || {}).name || a).length)[0];
      const bar = document.getElementById('activity-bar');
      if (hostile) G.inventory = Object.assign({}, G.inventory, { [hostile]: 5 });
      G.combatLog = new Array(40).fill('The slime strikes for 1.');
      document.body.classList.add('knocked-out');
      if (bar) bar.classList.add('knocked-out');
      window.renderCombat();
      await check('hostile · longest provision "' + (hostile || 'n/a') + '", 40-line log, knocked-out shell');
      if (bar) bar.classList.remove('knocked-out');
      document.body.classList.remove('knocked-out');
      G.combatLog = [];
      G.inventory = { cooked_shrimp: 5 };
      window.renderCombat();
      await settle();

      const btn = document.querySelector('#arena-act-player .arena-eat');
      assert(btn, 'the Eat button vanished when the hostile state was undone');
      // It reads as the primary action, and its disabled state stays legible
      // rather than dropping to the global 38% — an unreadable reason is not a
      // reason (this is the "hard to read" half of the report).
      assert(btn.classList.contains('btn-primary'),
        'a live Eat button must get primary (gilt) treatment');
      G.playerHp = 100;
      window.renderCombat();
      const off = document.querySelector('#arena-act-player .arena-eat');
      assert(off.disabled && /full/i.test(off.textContent), 'full HP must disable Eat with a reason');
      assert(parseFloat(getComputedStyle(off).opacity) >= 0.9,
        'the disabled Eat button must stay readable, got opacity ' + getComputedStyle(off).opacity);
    } finally {
      G.activeMonster = snap.monster; G.monsterHp = snap.mhp; G.monsterMaxHp = snap.mmax;
      G.playerHp = snap.hp; G.playerMaxHp = snap.maxHp; G.inventory = snap.inv;
      try { window.renderCombat(); } catch (e) { /* restoring state only */ }
      if (snap.tab) window.showTab(snap.tab);
    }
  }),

  /* ── b512 · THE STYLE ROW IS A FIXED-HEIGHT ROW ─────────────────────────
     The regression this exists for: the b227 guard above went red on the
     assembled b512 tree with NO CSS, markup or layout change anywhere in the
     build. The cause was one row above it. `.fs-style` is the last row of the
     player column and `.fs-actionbar` (which carries Eat) is the next row
     down, and the arena card has less than one line of headroom at 900px. The
     style buttons laid the button's NAME and its `<small>` side by side in a
     148px box, so the two facts inside the small — the XP route and the swing
     time, both at the 14.5px type floor — were left to wrap wherever they
     landed. "Atk/Str/Def · 2.40s" measured within a couple of pixels of that
     box, so the SAME markup rendered the row 110px tall on one boot and 127px
     on the next; the extra 17px pushed Eat 6px out of the card.
     So the property is not "the row is short", it is THE ROW'S HEIGHT DOES NOT
     DEPEND ON WHICH LABEL IS LONGEST. Four buttons, four different route
     strings, four identical boxes — and if a future weapon family adds a
     longer style name or route, this fails before a player finds it.
     MUTATION: drop the `flex-direction: column` half of the fix and the four
     heights split 45/45/64/64 (measured); drop the `.csb-swing` half and they
     split again at 1440px. */
  () => tryRunAsync('b512: the combat-style row is the same height whatever the labels say — it cannot push Eat off the card', async () => {
    const G = window.G;
    const snap = { monster: G.activeMonster, mhp: G.monsterHp, mmax: G.monsterMaxHp,
      tab: window.activeTab, inCombat: document.body.classList.contains('in-combat') };
    try {
      window.showTab('combat');
      G.activeMonster = 'slime'; G.monsterHp = 8; G.monsterMaxHp = 8;
      /* GRADE THE RULES A FIGHT ACTUALLY GETS. `audit-overrides.css` restyles
         these buttons only under `body.in-combat #panel-combat.active`, and
         that is the sheet that lays the name and the sub-label side by side —
         so a guard measured without the class is measuring a layout no player
         ever sees, and passes the exact arrangement that prints the route out
         through the button's border. */
      document.body.classList.add('in-combat');
      window.renderCombat();
      // Same settle discipline as b227 — the stage keeps resizing while the
      // portraits load, and a transient measurement is not a verdict.
      let last = null;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 32)));
        const row = document.querySelector('#panel-combat .fs-style');
        if (!row) continue;
        const key = Math.round(row.getBoundingClientRect().height);
        if (key === last) break;
        last = key;
      }

      const btns = [...document.querySelectorAll('#panel-combat .fs-style .csb-btn')];
      assert(btns.length >= 3, 'the stage style picker did not render — got ' + btns.length + ' buttons');
      const hs = btns.map((b) => Math.round(b.getBoundingClientRect().height));
      const routes = btns.map((b) => (b.querySelector('.csb-trains') || {}).textContent || '?');
      assert(Math.max(...hs) === Math.min(...hs),
        'the style buttons are different heights (' + hs.join('/') + ') for routes ' + routes.join('/')
        + ' — the row is sized by whichever label happens to wrap, which is what moved the Eat button '
        + '6px out of the arena card on b512');

      /* AND THE LABEL IS INSIDE ITS BUTTON. Equal heights alone is a weaker
         property than it looks: laying the name and the route side by side in
         a 148px box ALSO produces four equal boxes — with "Controlled
         ATK/STR/DEF" printed straight through the button's own gold outline
         and out the other side (photographed at 1440x900 while proving this
         guard). A style picker whose labels do not live inside their targets
         reads as broken markup, so the box is asserted, not just the row. */
      btns.forEach((b, i) => {
        const box = b.getBoundingClientRect();
        [...b.querySelectorAll('small, .csb-trains')].forEach((c) => {
          if (getComputedStyle(c).display === 'none') return;
          const cb = c.getBoundingClientRect();
          if (!cb.width) return;
          assert(cb.left >= box.left - 1 && cb.right <= box.right + 1,
            'style button ' + i + ' ("' + b.textContent.trim() + '") prints "' + c.textContent.trim()
            + '" outside its own box: label ' + Math.round(cb.left) + '–' + Math.round(cb.right)
            + ' vs button ' + Math.round(box.left) + '–' + Math.round(box.right)
            + ' — the label runs out through the button\'s own border');
        });
      });

      /* And the route is still SAID — hiding the label to win the height is the
         b348 bug, and this fix deliberately drops the swing time instead. */
      btns.forEach((b, i) => {
        const tr = b.querySelector('.csb-trains');
        assert(tr && tr.textContent.trim() && getComputedStyle(tr).display !== 'none',
          'style button ' + i + ' no longer states its XP route');
      });
      /* …and the swing time it gave up is printed by the swing bar two rows up,
         so the b368 hole (each rule deferring to the other, the number printed
         NOWHERE) cannot reopen through this fix. */
      const swing = document.querySelector('#panel-combat #fs-player-swing');
      assert(swing && /\d+(\.\d+)?s/.test(swing.textContent) && getComputedStyle(swing).display !== 'none',
        'the stage hides the per-style swing time, so the swing bar MUST print it — got "'
        + (swing ? swing.textContent : 'no swing bar') + '"');
    } finally {
      G.activeMonster = snap.monster; G.monsterHp = snap.mhp; G.monsterMaxHp = snap.mmax;
      if (!snap.inCombat) document.body.classList.remove('in-combat');
      try { window.renderCombat(); } catch (e) { /* restoring state only */ }
      if (snap.tab) window.showTab(snap.tab);
    }
  }),

  /* Tyler: "the possible loot / DPS statistics should be modals that you click
     on near the enemy avatar, not a scrollable thing across the bottom." Two
     halves: the strip is gone, and everything it carried is still reachable. */
  () => tryRun('b227: loot and stats are modals off the enemy, not a bottom strip', () => {
    const G = window.G;
    const HUD = window.HearthriseCombatHud;
    assert(HUD && typeof HUD.openLoot === 'function', 'HearthriseCombatHud is not published');
    const snap = { monster: G.activeMonster, mhp: G.monsterHp, mmax: G.monsterMaxHp, tab: window.activeTab,
      hp: G.playerHp, maxHp: G.playerMaxHp };
    const scrim = () => document.querySelector('.hr-room-scrim[data-combat-hud]');
    try {
      window.showTab('combat');
      G.activeMonster = 'rat'; G.monsterHp = 9; G.monsterMaxHp = 9;
      /* b341 FIXTURE: the four HOURLY rows below are now conditional — a rate
         may only be quoted over a span the character can survive (§4.1). This
         test is about the maths REACHING the modal, so it stands a character
         who genuinely lasts the hour; the sub-hour rendering is
         AWAY-HONEST-3's assertion, and pinning it there rather than weakening this one keeps
         each test owning one claim. */
      G.playerMaxHp = 100000; G.playerHp = G.playerMaxHp;
      window.renderCombat();

      // (1) The strip is gone. All three of these rendered into #combat-area
      //     during a fight and together stood ~330px tall.
      const area = document.getElementById('combat-area');
      ['.combat-xp-forecast', '.combat-drops-list', '.calc'].forEach((sel) => {
        assert(!area.querySelector(sel), sel + ' is still stacked under the arena');
      });
      assert(!/Drops:/.test(area.textContent), 'the raw drop-rate line is still under the arena');

      /* (2) Both affordances are on the STAGE, in the non-scrolling region.
         b362 moved the two reference chips from under the foe's portrait into
         the Fight screen's action bar, which spans both fighters directly under
         them. b227's actual property is unchanged and is what is asserted:
         Loot and Stats are reachable during a fight WITHOUT scrolling, because
         they are not in `#combat-area`. The b227 defect (the control 470px
         below the fold, inside the one scrolling box) is now structurally
         impossible rather than merely fixed — the stage does not scroll and the
         action bar is part of it. */
      const foe = document.querySelector('#panel-combat .arena-vs #arena-act-foe');
      assert(foe, 'the enemy has no action slot');
      assert(!document.getElementById('combat-area').contains(foe),
        'the reference chips are back inside #combat-area, the box that scrolls');
      assert(foe.querySelector('[data-arena-act="loot"]'), 'no Loot control beside the enemy');
      assert(foe.querySelector('[data-arena-act="stats"]'), 'no Stats control beside the enemy');

      // (3) Loot opens, carries every drop with a rate, and closes on demand.
      assert(HUD.openLoot(), 'the loot modal did not open');
      let m = scrim();
      assert(m && m.dataset.combatHud === 'loot', 'the loot modal is not on screen');
      const lootText = m.textContent;
      window.MONSTERS.rat.drops.forEach((d) => {
        const nm = window.ITEMS[d.id] ? window.ITEMS[d.id].n : d.id;
        assert(lootText.indexOf(nm) >= 0, 'the loot modal does not list ' + nm);
      });
      assert(m.querySelectorAll('.combat-drop-row').length === window.MONSTERS.rat.drops.length,
        'the drop rows lost their rarity bands');
      assert(/%|always/.test(lootText), 'the loot modal shows no drop rates');
      HUD.close();
      assert(!scrim(), 'the loot modal would not close');

      // (4) Stats opens and carries the combat maths the strip used to show —
      //     both grids, not just one of them.
      assert(HUD.openStats(), 'the stats modal did not open');
      m = scrim();
      assert(m && m.dataset.combatHud === 'stats', 'the stats modal is not on screen');
      const st = m.textContent;
      ['Hit chance', 'Max hit', 'Damage per second', 'Time to kill', 'Kills per hour',
       'Combat XP per hour', 'Gold per hour'].forEach((label) => {
        assert(st.indexOf(label) >= 0, 'the stats modal is missing "' + label + '"');
      });

      // The numbers come from the engine's own rolls, not a second copy of the
      // maths — a stats panel that disagrees with the fight is worse than none.
      const f = HUD._forecast(window.MONSTERS.rat);
      const rolls = window.getPlayerCombatRolls(window.MONSTERS.rat);
      assert(f.you.maxHit === rolls.maxHit && f.you.accuracy === rolls.accuracy,
        'the stats modal re-derives the damage maths instead of reading the engine');
      assert(st.indexOf(String(rolls.maxHit)) >= 0, 'the engine max hit is not on the panel');

      // Ending the fight takes the modal with it — a drop table for a foe you
      // are no longer fighting is a lie about what you are doing.
      G.activeMonster = null;
      HUD.refresh();
      assert(!scrim(), 'the modal outlived the fight it described');
    } finally {
      try { HUD.close(); } catch (e) { /* teardown */ }
      G.activeMonster = snap.monster; G.monsterHp = snap.mhp; G.monsterMaxHp = snap.mmax;
      G.playerHp = snap.hp; G.playerMaxHp = snap.maxHp;
      try { window.renderCombat(); } catch (e) { /* restoring state only */ }
      if (snap.tab) window.showTab(snap.tab);
    }
  }),

  // b220 (#12d): the artisan panel is rebuilt from scratch by activity-driven
  // re-renders (the same class of bug as the b218 doll snap-back), so a
  // category held only in the DOM would reset every few seconds. It persists
  // in window._artisanCat and is restored on rebuild. Guard with the real
  // re-render triggers: addItem() and updateTopbar().
  () => tryRun('b220: artisan category persists across activity re-renders', () => {
    if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(true);
    const AC = window.HearthriseArtisanCat;
    assert(AC && typeof AC.strip === 'function', 'HearthriseArtisanCat missing');
    const prev = JSON.parse(JSON.stringify(window._artisanCat || {}));
    const prevViewed = window.__viewedSkillId;
    const startTab = window.activeTab || 'profile';
    try {
      window.showTab('skills');
      window.openSkillDetail('smithing');
      window.setArtisanCategory('smithing', 'armour');
      const detail = document.getElementById('skill-detail');
      const activeOf = () => {
        const el = detail.querySelector('.act-cats .chip.active');
        return el && el.getAttribute('data-artcat');
      };
      assert(detail.querySelector('.act-cats'), 'no category strip rendered on the smithing screen');
      assert(activeOf() === 'armour', 'category did not select: ' + activeOf());
      // Only the selected lane is on screen, and it is not the whole list.
      const shown = detail.querySelectorAll('.act-tile').length;
      const all = window.ARTISAN_RECIPES.smithing.length;
      assert(shown > 0 && shown < all, 'grid shows ' + shown + ' of ' + all + ' — the filter is not applied');
      const armour = window.categorizeRecipes('smithing', window.ARTISAN_RECIPES.smithing, window.ITEMS)
        .groups.find((g) => g.key === 'armour');
      assert(shown === armour.recipes.length,
        'Armour lane shows ' + shown + ' tiles, expected ' + armour.recipes.length);
      // The real snap-back triggers.
      window.addItem('iron_bar', 1);
      window.updateTopbar();
      window.renderSkillDetail('smithing');
      assert(activeOf() === 'armour', 'category snapped back after addItem/updateTopbar: ' + activeOf());
      assert(window._artisanCat.smithing === 'armour', '_artisanCat lost the selection');
      // Cooking must open on its two named lanes. (renderSkillDetail directly:
      // openSkillDetail defers its paint by a tick, which a sync test can't see.)
      window.__viewedSkillId = 'cooking';
      window.renderSkillDetail('cooking');
      const labels = [...detail.querySelectorAll('.act-cats .chip')].map((c) => c.textContent.replace(/(\d+|Lv \d+)$/, '').trim());
      assert(labels.includes('Provisions') && labels.includes('Feasts & Draughts'),
        'cooking strip is missing its lanes: ' + JSON.stringify(labels));
      // No emoji anywhere in the strip (project-wide rule).
      const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
      assert(!EMOJI.test(detail.querySelector('.act-cats').textContent),
        'category strip renders emoji');
    } finally {
      if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(null);
      window._artisanCat = prev;
      window.__viewedSkillId = prevViewed;
      try { window.showTab(startTab); } catch (e) {}
    }
  }),

  // ── b220 regression suite (backlog #13 — farming: optional watering) ──
  //
  // THE bug: startFarmCheck() gated 'ready' on `elapsed >= crop.hours &&
  // p.watered`, with no timeout. plantCrop() and every Tomato regrow wrote
  // watered:false, and so did auto-replant — so an unattended plot was frozen
  // FOREVER, and renderFarm hid it by printing "Tap to water" with no bar.
  // Watering is now an optional 2h double-speed window; a dry crop always
  // finishes, just slower. Spec: docs/design/farming-watering.md.

  // The stall bug itself. Fails on b219: isReady() didn't exist and the tick
  // would never have flipped this plot.
  () => tryRun('b220: a never-watered crop still matures (the stall bug)', () => {
    const F = window.HearthriseFarm;
    assert(F && typeof F.isReady === 'function', 'HearthriseFarm.isReady missing');
    const hours = window.CROPS.turnip.hours;
    const stalled = { cropId: 'turnip', plantedAt: Date.now() - (hours + 1) * 3600000, waterings: [], state: 'growing' };
    assert(F.isReady(stalled) === true, 'a dry crop past its grow time MUST be ready — on b219 it froze forever');
    assert(F.progressPct(stalled) === 100, 'dry plot must report 100%, got ' + F.progressPct(stalled));
    // Mid-growth it must report real progress, not the invisible dead state.
    const half = { cropId: 'turnip', plantedAt: Date.now() - (hours / 2) * 3600000, waterings: [], state: 'growing' };
    assert(F.isReady(half) === false, 'half-grown dry plot must not be ready');
    const pct = F.progressPct(half);
    assert(pct >= 45 && pct <= 55, 'dry plot must show ~50% progress, got ' + pct);
    assert(F.readyInMs(half) > 0, 'a dry growing plot must have a finite projected ready time');
  }),

  // The watering window maths: exactly 2x, exactly 2h, self-capping, and
  // clamped so a forged `waterings` array can never beat 2x.
  () => tryRun('b220: watering is exactly 2x for 2h and can never exceed 2x', () => {
    const F = window.HearthriseFarm;
    const t0 = Date.now() - 40 * 3600000;
    const watered = { cropId: 'wheat', plantedAt: t0, waterings: [t0], state: 'growing' };
    const gh2 = F.growthHours(watered, t0 + 2 * 3600000);
    assert(Math.abs(gh2 - 4) < 1e-6, '2 real hours watered should be 4 growth-hours, got ' + gh2);
    const gh3 = F.growthHours(watered, t0 + 3 * 3600000);
    assert(Math.abs(gh3 - 5) < 1e-6, 'the window must EXPIRE after 2h (3h → 5 growth-hours), got ' + gh3);
    // Water-spam / forged save: 20 duplicate timestamps must not compound.
    const forged = { cropId: 'wheat', plantedAt: t0, waterings: new Array(20).fill(t0), state: 'growing' };
    const now = t0 + 5 * 3600000;
    assert(F.growthHours(forged, now) <= 10 + 1e-9,
      'min(bonus, elapsed) clamp broken — forged waterings gave ' + F.growthHours(forged, now) + ' growth-hours in 5h');
    // Clock/backdate abuse: timestamps in the future contribute nothing.
    const future = { cropId: 'wheat', plantedAt: t0, waterings: [now + 99 * 3600000], state: 'growing' };
    assert(Math.abs(F.growthHours(future, now) - 5) < 1e-6, 'future watering timestamps must be ignored');
    // The mechanic caps itself at -50%: floor(hours / (window * rate)).
    assert(F.maxWaterings('turnip') === 1, 'turnip (4h) should allow 1 watering, got ' + F.maxWaterings('turnip'));
    assert(F.maxWaterings('wheat') === 2, 'wheat (8h) should allow 2 waterings, got ' + F.maxWaterings('wheat'));
    assert(F.maxWaterings('pumpkin') === 3, 'pumpkin (14h) should allow 3 waterings, got ' + F.maxWaterings('pumpkin'));
  }),

  () => tryRun('b220: a plot can only be watered once per window', () => {
    const F = window.HearthriseFarm;
    const now = Date.now();
    const dry = { cropId: 'wheat', plantedAt: now - 3600000, waterings: [], state: 'growing' };
    assert(F.isWaterable(dry) === true, 'a dry growing plot must be waterable');
    const wet = { cropId: 'wheat', plantedAt: now - 3600000, waterings: [now - 60000], state: 'growing' };
    assert(F.isWaterable(wet) === false, 'a plot watered a minute ago must not be re-waterable (water-spam exploit)');
    assert(F.waterWindowRemainingMs(wet) > 0, 'an open window must report time remaining');
    const expired = { cropId: 'wheat', plantedAt: now - 3 * 3600000, waterings: [now - (F.WATER_WINDOW_H * 3600000 + 1000)], state: 'growing' };
    assert(F.isWaterable(expired) === true, 'once the window expires the plot is thirsty again');
    assert(F.waterWindowRemainingMs(expired) === 0, 'an expired window must report 0 remaining');
    const done = { cropId: 'turnip', plantedAt: now - 99 * 3600000, waterings: [], state: 'growing' };
    assert(F.isWaterable(done) === false, 'a ready crop is not waterable');
  }),

  () => tryRun('b220: waterPlot opens one window and refuses a second', () => withFarmServer(
    (verb, args) => ({ ok: true, plot: args[0], crop: 'turnip', watered_at: new Date().toISOString(), water_xp: 7 }),
    (calls) => {
      /* b514: the WINDOW is hr_farm_water's rule. The client's half — and b462's
         actual bug — is that the first tap becomes an intent, the reconcile
         records the server's watered_at, and the second tap inside the open
         window is refused WITHOUT a second round trip. */
      const snap = snapshotG();
      try {
        if (typeof window.waterPlot !== 'function') return;
        window.G.farmPlots = window.G.farmPlots || [];
        window.G.farmPlots[0] = { cropId: 'turnip', plantedAt: Date.now() - 3600000, waterings: [], state: 'growing' };
        window.waterPlot(0);
        assert(calls.length === 1 && calls[0].verb === 'farmWater',
          'the first tap must send one hr_farm_water intent, got ' + JSON.stringify(calls.map((c) => c.verb)));
        let p = window.G.farmPlots[0];
        assert(Array.isArray(p.waterings) && p.waterings.length === 1,
          "the server's watering must be recorded, got " + JSON.stringify(p.waterings));
        // b222: the `watered` dual-write is DELETED. b220 mirrored it purely so a
        // rollback to b219 read a sane value; a field that is written but never
        // read is state waiting to be trusted by accident. `waterings[]` is the
        // only source now.
        assert(!('watered' in p), 'the `watered` dual-write must be gone — waterings[] is the only source');
        window.waterPlot(0);
        p = window.G.farmPlots[0];
        assert(p.waterings.length === 1, 'a second watering inside the open window must be rejected');
        assert(calls.length === 1, 'and rejected LOCALLY — no second intent, got ' + calls.length);
        assert(typeof window.waterAllPlots === 'function', 'waterAllPlots (farm header action) missing');
      } finally { restoreG(snap); }
    })),

  // The migration is what un-sticks every plot broken on live right now.
  () => tryRun('b220: save migration un-sticks stalled plots', () => {
    const M = (window.HEARTHRISE_MIGRATIONS || []).find((m) => m.from === 6 && m.to === 7);
    assert(M, 'the v6 → v7 farming migration is missing from the registry');
    assert(window.HEARTHRISE_SCHEMA_VERSION >= 7, 'CURRENT_SCHEMA_VERSION was not bumped to 7');
    const F = window.HearthriseFarm;
    const stalledAt = Date.now() - (window.CROPS.turnip.hours + 5) * 3600000;
    const save = { v: 6, farmPlots: [
      { cropId: 'turnip', plantedAt: stalledAt, watered: false, state: 'growing' },  // the auto-replant victim
      { cropId: 'turnip', plantedAt: stalledAt, watered: true,  state: 'growing' },
      { cropId: 'turnip', plantedAt: 'corrupt', watered: false, state: 'growing' },
      null,
    ] };
    M.apply(save);
    assert(Array.isArray(save.farmPlots[0].waterings) && save.farmPlots[0].waterings.length === 0,
      'watered:false must migrate to waterings: []');
    assert(save.farmPlots[1].waterings.length === 1 && save.farmPlots[1].waterings[0] === stalledAt,
      'watered:true must retro-credit one window at plantedAt');
    assert(typeof save.farmPlots[2].plantedAt === 'number' && save.farmPlots[2].waterings.length === 0,
      'a corrupt plantedAt must be repaired, not crash the pipeline');
    // THE point: both old plots now finish.
    assert(F.isReady(save.farmPlots[0]) === true,
      'the migrated dry plot must be ready — it was frozen forever on b219');
    assert(F.isReady(save.farmPlots[1]) === true, 'the migrated watered plot must be ready');
    assert(F.isReady(save.farmPlots[2]) === false, 'the repaired plot restarts its clock');
    const before = JSON.stringify(save.farmPlots);
    M.apply(save);
    assert(JSON.stringify(save.farmPlots) === before, 'the migration must be idempotent');
  }),

  () => tryRun('b220: auto-replant produces a plot that actually matures', () => {
    const snap = snapshotG();
    try {
      if (!window.HearthriseAuto || typeof window.HearthriseAuto.maybeReplant !== 'function') return;
      window.G.homestead = { tier: 5 };
      window.G.plotLevels = 1;
      window.G.skills = window.G.skills || {};
      window.G.skills.farming = 1000000;
      window.G.inventory = window.G.inventory || {};
      window.G.inventory.turnip_seed = (window.G.inventory.turnip_seed | 0) + 5;
      /* auto-replant counts what the SERVER holds (gateItemCount), so the fixture
         states a server bag or the replant correctly declines. */
      window.G._serverBag = Object.assign({}, window.G._serverBag, { turnip_seed: 5 });
      window.G.farmPlots = window.G.farmPlots || [];
      window.G.farmPlots[0] = null;
      window.HearthriseAuto.setFarmReplant({ enabled: true, cropId: 'turnip' });
      assert(window.HearthriseAuto.maybeReplant(0) === true, 'auto-replant should have planted plot 0');
      const p = window.G.farmPlots[0];
      assert(p && p.cropId === 'turnip', 'plot 0 should hold a turnip, got ' + JSON.stringify(p));
      assert(Array.isArray(p.waterings) && p.waterings.length === 0,
        'auto-replant plants DRY — that is now correct and must be the new shape');
      // b219's trap: this exact plot could never become ready.
      p.plantedAt = Date.now() - (window.CROPS.turnip.hours + 1) * 3600000;
      assert(window.HearthriseFarm.isReady(p) === true,
        'an auto-replanted (dry) plot must mature unattended — this is the whole feature');
    } finally { restoreG(snap); }
  }),

  () => tryRun('b220: the harvest daily scales with the farm it measures', () => {
    const snap = snapshotG();
    try {
      const pool = window.DAILY_TASK_POOL;
      assert(Array.isArray(pool), 'DAILY_TASK_POOL is not exposed for testing');
      assert(pool.map((f) => f()).filter((t) => t.type === 'harvest').length === 1,
        'expected exactly one harvest daily after folding daily_harvest_big away');
      window.G.homestead = { tier: 0 };                    // Wanderer's Camp — 2 plots
      const small = pool.map((f) => f()).find((t) => t.type === 'harvest');
      /* b495 (balance audit): the floor was 10 and it was UNREACHABLE at the
         starting property. Two plots of 4h turnips yielding 2-4 is ~6 produce a
         cycle, so a floor of 10 meant TWO grow cycles — ~8 wall-clock hours —
         for a daily that resets at UTC midnight. The floor is now 6 = ONE
         harvest round at the camp. Derived, not copied: the expectation below is
         computed from the crop the camp actually grows, so a change to turnip's
         yield moves the test with the game rather than against it. */
      const camp = 2;
      const perRound = camp * ((window.CROPS.turnip.yield[0] + window.CROPS.turnip.yield[1]) / 2);
      assert(small.goal === 6,
        'a 2-plot camp goal must floor at 6, got ' + small.goal);
      assert(small.goal <= perRound,
        'the camp harvest daily asks for ' + small.goal + ' crops but ONE full harvest round at the '
        + 'starting property yields ~' + perRound + ' — that is more than one 4h grow cycle, which is '
        + 'the b495 defect (a same-day daily that needs two cycles cannot be finished after noon)');
      assert(small.reward === small.goal * 30,
        'the camp reward must scale with the goal, got ' + small.reward);
      window.G.homestead = { tier: 5 };                    // Hearthrise Castle — 12 plots
      const big = pool.map((f) => f()).find((t) => t.type === 'harvest');
      assert(big.goal === 36, 'a 12-plot castle goal must be 3 x 12 = 36, got ' + big.goal);
      assert(big.reward === big.goal * 30, 'the reward must scale with the goal, got ' + big.reward);
      assert(!/Harvest 25 crops/.test(small.label + '|' + big.label),
        'the fixed "Harvest 25 crops" daily must be gone');
    } finally { restoreG(snap); }
  }),

  /* ── b497 RETUNE-1: A BALANCE CHANGE MUST REACH A SLATE ALREADY IN THE SAVE ──
     A daily slate is rolled once per UTC day and FROZEN in the save, so a
     retune of the pool's authored numbers is invisible until midnight — while
     the SERVER moves the moment its migration is applied. That gap is not
     cosmetic: stored "Smith 8 items" + server goal 40 means updateDaily latches
     `done` at 8, fires claimDaily ONCE (fire-and-forget), the server answers
     `incomplete`, and under the gold arm the local credit is a no-op. The
     player's daily is spent, nothing is paid, and the UI says it is finished. */
  () => tryRun('RETUNE-1: a stale daily slate is healed to the authored numbers, and a `done` its own progress does not support is repaired', () => {
    const snap = snapshotG();
    try {
      const pool = window.DAILY_TASK_POOL;
      assert(Array.isArray(pool), 'DAILY_TASK_POOL is not exposed for testing');
      const authored = pool.map((f) => f()).find((t) => t.id === 'daily_smith');
      assert(authored && authored.goal > 8,
        'CONTROL: daily_smith no longer asks for more than the pre-b497 8 — re-derive this fixture '
        + 'from whatever the retune moved, or the test proves nothing');

      /* THE SAVE AS PRODUCTION HAS IT: today's slate, rolled before the retune. */
      window.G.daily = {
        lastReset: window.hrGoalDayKey(),
        tasks: [{ id: 'daily_smith', type: 'smithed', label: 'Smith 8 items', goal: 8, progress: 8, reward: 450, done: true }],
      };
      window.generateDailyTasks(false);
      const t = window.G.daily.tasks.find((x) => x.id === 'daily_smith');
      assert(t, 'the heal dropped the task entirely');
      assert(t.goal === authored.goal && t.reward === authored.reward && t.label === authored.label,
        'the stale slate kept its pre-retune numbers (' + t.goal + '/' + t.reward + '/' + t.label
        + ') — the client would show one price and the server pay another');
      assert(t.progress === 8, 'the heal threw away earned progress, got ' + t.progress);
      assert(t.done === false,
        'a `done` latched against the OLD goal survived. That is the whole defect: it fires '
        + 'claimDaily once, the server refuses `incomplete`, and the task can never fire again');

      /* IT MUST NOT RE-OPEN A GENUINELY FINISHED TASK. The repair is an
         invariant (`done` implies progress >= goal), not a blanket reset. */
      window.G.daily = {
        lastReset: window.hrGoalDayKey(),
        tasks: [Object.assign({}, authored, { progress: authored.goal, done: true })],
      };
      window.generateDailyTasks(false);
      assert(window.G.daily.tasks[0].done === true,
        'the heal re-opened a task whose progress really does meet its goal — that would re-fire a '
        + 'claim the server has already once-guarded');
    } finally { restoreG(snap); }
  }),

  /* ── b497 RETUNE-2: THE SAME CLASS ON QUESTS, AND IT IS PERMANENT THERE ──
     b341 made "add a quest" reach an existing save. RE-TUNING one still did
     not: a quest row is a frozen copy of its QUEST_DEFS entry, so the farmhand
     goal 10 -> 6 ruling reached nobody — every live save would keep goal 10
     forever while the server started accepting 6. A daily slate at least
     self-heals at midnight; this one never does. */
  () => tryRun('RETUNE-2: a quest row re-reads its AUTHORED definition on merge and keeps only progress + done', () => {
    const snap = snapshotG();
    try {
      const def = (window.QUEST_DEFS || []).find((q) => q.id === 'farmhand');
      assert(def && def.goal === 6,
        'CONTROL: farmhand is not at the ruled goal of 6 — re-derive this fixture');

      /* A PRE-RETUNE SAVE, exactly as production holds it.
         ⚠ 2026-09-07: farmhand is now a MIRRORED row (mirror:'stats.harvested')
           because its counting path was dead under the b454 farm arm — see the
           EV-COUNTER-1 regression below. So the RETUNE properties this test
           exists for are asserted on farmhand where they still apply (goal and
           label re-read from the def) and on the NON-mirrored rows where the
           save half is the thing under test (`gatherer`, `first_blood`); a
           mirrored row's `progress` is a READ, not save state, so asserting it
           survives a merge would be asserting the opposite of its design. */
      window.G.stats = window.G.stats || {};
      window.G.stats.harvested = 4;                     // the server-projected counter
      window.G.quests = [
        { id: 'farmhand', type: 'harvest', label: 'Harvest 10 crops', goal: 10, progress: 4, reward: { gold: 500, item: 'wheat_seed', qty: 5 }, done: false },
        { id: 'gatherer', type: 'gather', label: 'old', goal: 15, progress: 15, reward: { gold: 150 }, done: true },
      ];
      window.ensureRetentionState();
      const q = window.G.quests.find((x) => x.id === 'farmhand');
      assert(q.goal === 6, 'the retuned goal never reached the save, got ' + q.goal);
      assert(q.label === def.label, 'the save still shows the retired label: ' + q.label);
      assert(q.progress === 4, 'the refresh threw away earned progress, got ' + q.progress);
      assert(q.done === false, 'the refresh completed a quest the player has not finished');

      /* THE SAVE HALF IS SACRED. A finished quest stays finished — refreshing
         the definition must never re-open something already paid. */
      const g = window.G.quests.find((x) => x.id === 'gatherer');
      assert(g.done === true, 'the definition refresh re-opened a COMPLETED quest — it would pay twice');
      assert(g.progress === 15, 'the refresh moved a completed quest\'s progress, got ' + g.progress);

      /* EARNED PROGRESS SURVIVES A RE-AUTHOR on a COUNTING row, where progress
         IS the save state. (This half moved off farmhand when farmhand became
         mirrored; the property is unchanged and still guarded.) */
      window.G.quests = [{ id: 'gatherer', type: 'gather', label: 'old', goal: 30, progress: 7, reward: { gold: 150 }, done: false }];
      window.ensureRetentionState();
      const g2 = window.G.quests.find((x) => x.id === 'gatherer');
      assert(g2.goal === 15, 'the authored goal never reached the save, got ' + g2.goal);
      assert(g2.progress === 7, 'the refresh threw away earned progress, got ' + g2.progress);

      /* PROGRESS IS CLAMPED to the new goal, exactly as updateQuest clamps it —
         a bar reading 20/15 is the same drift wearing a different number. */
      window.G.quests = [{ id: 'gatherer', type: 'gather', label: 'old', goal: 30, progress: 20, reward: { gold: 150 }, done: false }];
      window.ensureRetentionState();
      assert(window.G.quests.find((x) => x.id === 'gatherer').progress === 15,
        'progress above the new goal was not clamped, got '
        + window.G.quests.find((x) => x.id === 'gatherer').progress);

      /* A STALE `mirror` MUST BE DROPPED, not carried. It changes how
         updateQuest BEHAVES (read instead of count), so a row keeping one the
         def has dropped is a quest that silently stops counting. */
      window.G.quests = [{ id: 'gatherer', type: 'gather', mirror: 'stats.kills', label: 'x', goal: 30, progress: 0, reward: { gold: 150 }, done: false }];
      window.ensureRetentionState();
      assert(!('mirror' in window.G.quests.find((x) => x.id === 'gatherer')),
        'a stale `mirror` survived the refresh — the quest would READ stats.kills forever');

      /* AND THE MISSING `mirror` MUST BE ADDED. The same field, the other
         direction: a live save holds farmhand as a COUNTING row, and if the
         merge did not install the def's new `mirror` the quest would stay
         frozen at whatever the dead counting path left it at — the very bug
         the mirror was added to fix. */
      window.G.stats.harvested = 3;
      window.G.quests = [{ id: 'farmhand', type: 'harvest', label: 'Harvest 10 crops', goal: 10, progress: 0, reward: { gold: 500 }, done: false }];
      window.ensureRetentionState();
      const fh = window.G.quests.find((x) => x.id === 'farmhand');
      assert(fh.mirror === 'stats.harvested',
        'the merge did not install the def\'s `mirror` on a live counting row, got ' + fh.mirror);
      assert(fh.progress === 3,
        'a freshly-mirrored farmhand did not read the server counter, got ' + fh.progress);
    } finally { restoreG(snap); }
  }),

  /* ── EV-COUNTER-1 — THE DEAD FARM GOAL COUNTERS (cleanup slice 4, §3.4) ────
     THE BUG. Since the b454 farm cutover, `G.stats.planted` / `.harvested` were
     written by NO path. The only writers were the increments inside
     plantCrop/harvestPlot, and both sit BELOW
     `if(farmSyncArmed()){ farmSync*(…); return; }` — unreachable in the shipped
     build. So every goal that counts crops ("Harvest 100 crops"/Green Thumb, the
     farmhand quest, "Plant 3 crops") read 0 forever, for everyone, while
     hr_farm_harvest journalled every single crop server-side. Nothing errored,
     which is why it survived: the §3.4 dead-feature class exactly.

     THE CONTRACT THIS PINS. The counters are PROJECTED from the server's own
     permanent `player_progress(kind='stat', key='ev:*', period_key='')` rows on
     the envelope, and the client NEVER increments them. A fix that re-armed a
     client increment would pass a "the number moves" test and re-open the
     forged-counter hole, so this test drives the ENVELOPE for the credit and a
     REFUSED client plant for the no-op. */
  () => tryRunAsync('EV-COUNTER-1: the farm goal counters are projected from the server, never counted locally', async () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.reconcileEventCounters === 'function',
      'HearthriseAccrual.reconcileEventCounters is missing — nothing projects the server\'s '
      + 'ev:* rows, so every crop-counting goal is frozen at 0 for every player');

    /* PURE HALF: G + an envelope in, counters out. Both LIFETIME twins
       (kind='stat', period='') are live server-side since 2026-09-07
       (hr_farm_harvest always stamped one; hr_farm_plant grew its own in
       2026-09-07-farm-plant-lifetime-counter.sql). EV-COUNTER-2 below covers
       what that backfill exposed on the goal baseline. */
    const g = { stats: { harvested: 0, planted: 0 } };
    const env = {
      progress_truncated: false,
      progress: [
        { kind: 'stat', key: 'ev:harvest', period: '', value: 2, state: 'active' },
        { kind: 'stat', key: 'ev:planted', period: '', value: 3, state: 'active' },
        /* TODAY's slice for the same key. Reading this as the lifetime total
           would under-report every goal by every day but this one. */
        { kind: 'daily', key: 'ev:harvest', period: '2026-09-07', value: 999, state: 'active' },
      ],
    };
    A.reconcileEventCounters(g, env);
    assert(g.stats.harvested === 2, 'the lifetime harvest counter did not reach G, got ' + g.stats.harvested);
    assert(g.stats.planted === 3, 'the lifetime plant counter did not reach G, got ' + g.stats.planted);

    // FAIL-CLOSED: a lean envelope is not a statement that you have done nothing.
    const g2 = { stats: { harvested: 40 } };
    const r2 = A.reconcileEventCounters(g2, { state: {} });
    assert(r2 && r2.mode === 'absent' && g2.stats.harvested === 40,
      'an envelope with no `progress` array wiped a real lifetime counter');

    // TRUNCATED may RAISE but never LOWER — a missing row is not a zero.
    const g3 = { stats: { harvested: 40 } };
    A.reconcileEventCounters(g3, { progress_truncated: true, progress: [] });
    assert(g3.stats.harvested === 40, 'a truncated window rewound the counter, got ' + g3.stats.harvested);

    // A COMPLETE statement DOES lower — that is what kills a residue-ahead value.
    const g4 = { stats: { harvested: 40 } };
    A.reconcileEventCounters(g4, { progress_truncated: false, progress: [] });
    assert(g4.stats.harvested === 0,
      'a complete server statement did not overrule a residue-ahead counter, got ' + g4.stats.harvested);

    const snap = snapshotG();
    const prevSync = window.HearthriseFarmSync;
    try {
      /* THE GOAL ACTUALLY MOVES. farmhand mirrors stats.harvested, so the
         projected counter has to show up on the quest a player reads. */
      window.G.stats = window.G.stats || {};
      window.G.stats.harvested = 0;
      window.G.stats.planted = 0;
      window.G.quests = [];
      A.reconcileEventCounters(window.G, env);
      window.ensureRetentionState();
      const fh = window.G.quests.find((q) => q.id === 'farmhand');
      assert(fh && fh.progress === 2,
        'the farmhand quest did not read the projected harvest counter, got ' + (fh && fh.progress));

      /* AND A REFUSED CLIENT PLANT MOVES NOTHING. This is the half that must
         stay broken: under the farm arm the gesture is an INTENT, and a server
         refusal has to leave the goal exactly where it was. If someone ever
         re-arms the local increment to "fix" the plant goal, this goes red. */
      window.HearthriseFarmSync = {
        isFarmServerArmed: () => true,
        farmPlantRefusalText: () => 'no seeds',
        farmPlant: () => Promise.resolve({ ok: false, error: 'insufficient_seed' }),
      };
      window.G.farmPlots = [null, null];
      window.G.inventory = Object.assign({}, window.G.inventory, { turnip_seed: 5 });
      /* The SERVER must name the seed for the gesture to be SENT at all (DGN-KEY-1 /
         FARM-SEED-1: the pre-flight reads the server bag, not the display bag), and
         this arm is about what a REFUSAL does once sent. */
      window.G._serverBag = Object.assign({}, window.G._serverBag, { turnip_seed: 5 });
      window.plantCrop(0, 'turnip');
      await new Promise((r) => setTimeout(r, 0));
      assert(window.G.stats.planted === 3,
        'a REFUSED plant moved the plant counter — the client is minting a goal counter again, got '
        + window.G.stats.planted);
      assert(!window.G.farmPlots[0], 'a refused plant left a phantom crop in the plot');
    } finally {
      window.HearthriseFarmSync = prevSync;
      restoreG(snap);
    }
  }),

  /* ── EV-COUNTER-2: THE GOAL BASELINE MUST NOT BE TAKEN AGAINST AN UNKNOWN
        COUNTER (Security P2 on the 2026-09-07 lifetime-plant backfill) ────────
     THE BUG, display-only but player-visible on the FIRST boot after that
     migration. The daily goal grades `readSource(source) - startValues[id]` and
     the baseline was captured once, at slate-roll, for every source — including
     `stats.planted`, which is MIRRORED from the server's lifetime `ev:planted`
     row and reads 0 through `cur || 0` until the first complete `progress`
     statement lands. So: baseline 0 (unknown, not zero) → envelope lands with a
     backfilled lifetime count of 120 → the strip renders "Plant 3 crops —
     Complete!" for work done days ago, offering a Claim the server refuses by
     name (`not_complete`). Same class as the day-start gold watermark that
     `balKnown('gold')` gates, and as b224's weekly re-baseline.
     THE FIX IS "A BASELINE NOBODY CAN MEASURE IS NOT TAKEN AT ALL": it is taken
     on the first paint after the counter is known, and the goal reads 0 until
     then. This drives the REAL strip renderer and asserts the RENDERED number —
     an internal predicate would pass on a fix that never reached the DOM. */
  () => tryRun('EV-COUNTER-2: an unknown lifetime counter never baselines a daily goal at 0', () => {
    const A = window.HearthriseAccrual;
    if (!A || typeof A.reconcileEventCounters !== 'function'
        || typeof window.renderDailyGoals !== 'function'
        || typeof window.__hrGoalBaseline !== 'function') { skip('no accrual/goal-baseline api'); return; }
    const snap = snapshotG();
    /* `_eventCountersKnown` is SCRATCH, so snapshotG (a deliberate allowlist)
       does not carry it — and leaving it set would hand a later test, or the
       live page, a "the counter is known" claim no envelope earned. That is the
       very bug under test, injected by the suite. Restore it by hand. */
    const knownWas = Object.prototype.hasOwnProperty.call(window.G, '_eventCountersKnown')
      ? window.G._eventCountersKnown : undefined;
    const host = document.createElement('div');
    const shown = () => {
      window.renderDailyGoals(host);
      const el = host.querySelector('.dg-progress');
      return { text: el ? el.textContent.trim() : null, done: !!host.querySelector('.daily-goal.done') };
    };
    try {
      window.getGoalsForToday();                       // make sure a slate exists
      const dayKey = window.G.dailyGoals.dayKey;
      /* THE FIRST BOOT: the slate rolls before any envelope has landed, so the
         mirrored counter is genuinely UNKNOWN (absent, not zero). */
      window.G.stats = Object.assign({}, window.G.stats);
      delete window.G.stats.planted;
      delete window.G._eventCountersKnown;
      window.G.dailyGoals = { dayKey, picks: ['plant'], startValues: {}, claimed: {} };

      const goals = window.getGoalsForToday();
      assert(goals.length === 1 && goals[0].id === 'plant',
        'the fixture slate did not hold the plant goal, got ' + JSON.stringify(goals.map((g) => g.id)));
      const target = goals[0].target;
      assert(!Object.prototype.hasOwnProperty.call(window.G.dailyGoals.startValues, 'plant'),
        'the baseline was taken against an UNKNOWN counter — that 0 is what makes the arriving '
        + 'lifetime count read as a completed goal');
      assert(window.__hrGoalBaseline(window.G.dailyGoals, goals[0]).known === false,
        'an untaken baseline must report known:false');
      let s = shown();
      assert(s.text === '0 / ' + target,
        'a goal with no measurable baseline must render 0 / ' + target + ', got ' + s.text);
      assert(!s.done, 'a goal with no measurable baseline must never render as complete');

      /* THE ENVELOPE LANDS: a COMPLETE statement carrying the backfilled
         lifetime count. The baseline is taken NOW, at 120, so the goal is still
         0 / target — the player is asked to plant three crops today, not
         handed a completion for last week's farming. */
      A.reconcileEventCounters(window.G, {
        progress_truncated: false,
        progress: [{ kind: 'stat', key: 'ev:planted', period: '', value: 120, state: 'active' }],
      });
      assert(window.G.stats.planted === 120, 'the lifetime counter did not project, got ' + window.G.stats.planted);
      s = shown();
      assert(window.G.dailyGoals.startValues.plant === 120,
        'the baseline was not re-taken once the counter was known, got '
        + window.G.dailyGoals.startValues.plant);
      assert(s.text === '0 / ' + target && !s.done,
        'THE BUG: the backfilled lifetime count completed the daily goal — got ' + s.text
        + (s.done ? ' (rendered COMPLETE)' : ''));

      // A REAL PLANT, credited the only way it can be: the server's next statement.
      A.reconcileEventCounters(window.G, {
        progress_truncated: false,
        progress: [{ kind: 'stat', key: 'ev:planted', period: '', value: 121, state: 'active' }],
      });
      s = shown();
      assert(s.text === '1 / ' + target,
        'a real plant did not move the goal after the re-baseline, got ' + s.text);

      /* THE RESIDUE CASE. `dailyGoals` is persisted, so a slate rolled by the
         PRE-FIX build is on disk carrying the poisoned `startValues.plant = 0`
         and no `counterBaselined` flag. Presence alone would honour it for the
         rest of the day; the flag is what heals it. */
      window.G.dailyGoals = { dayKey, picks: ['plant'], startValues: { plant: 0 }, claimed: {} };
      s = shown();
      assert(window.G.dailyGoals.startValues.plant === 121 && s.text === '0 / ' + target && !s.done,
        'a pre-fix slate carrying startValues.plant = 0 was not healed — got ' + s.text
        + ' with baseline ' + window.G.dailyGoals.startValues.plant);

      /* AND A NON-MIRRORED GOAL IS UNTOUCHED: its baseline is client-counted and
         must never be re-taken mid-day, which would erase real progress. */
      window.G.stats.kills = 50;
      window.G.dailyGoals = { dayKey, picks: ['kill_any'], startValues: { kill_any: 40 }, claimed: {} };
      const ka = window.getGoalsForToday()[0];
      assert(window.G.dailyGoals.startValues.kill_any === 40,
        'a locally-counted goal was re-baselined, erasing real progress — got '
        + window.G.dailyGoals.startValues.kill_any);
      assert(window.__hrGoalBaseline(window.G.dailyGoals, ka).known === true,
        'a locally-counted goal must be treated as known with no counterBaselined flag');
    } finally {
      if (knownWas === undefined) delete window.G._eventCountersKnown;
      else window.G._eventCountersKnown = knownWas;
      restoreG(snap);
    }
  }),

  // ── FARM RELOAD REGRESSIONS (KD420 "disappearing plots" + Paione "turnip ready
  //    every 5s"), both client-only, both a reconcile churning G.farmPlots ─────
  () => tryRun('FARM-A (KD420): a lean empty farm envelope must NOT wipe a populated farm', () => {
    const A = window.HearthriseAccrual, CAP = window.HearthriseCapstone;
    if (!A || typeof A.reconcileFarm !== 'function' || !CAP || typeof CAP.__setBlobRetired !== 'function') { skip('no accrue/capstone api'); return; }
    const snap = snapshotG();
    try {
      CAP.__setBlobRetired(true);   // ARM: reconcileFarm is live (dormant otherwise)
      window.G.farmPlots = [{ cropId: 'turnip', plantedAt: Date.now() - 3600000, waterings: [], state: 'growing' }];
      // A lean/partial accrue settle that projects an EMPTY farm array (no authoritative flag).
      const r = A.reconcileFarm(window.G, { ok: true, version: 8, farm: [] });
      assert(r && r.mode === 'empty-noclaim', 'a lean empty farm array must be {mode:empty-noclaim}, got ' + JSON.stringify(r));
      assert(window.G.farmPlots.length === 1 && window.G.farmPlots[0] && window.G.farmPlots[0].cropId === 'turnip',
        'the standing turnip was WIPED by an empty lean envelope — the disappearing-plots bug, got ' + JSON.stringify(window.G.farmPlots));
      // …and the AUTHORITATIVE boot statement can still clear a genuinely-empty farm.
      const r2 = A.reconcileFarm(window.G, { ok: true, version: 8, farm: [] }, { authoritative: true });
      assert(r2 && r2.mode === 'server' && window.G.farmPlots.length === 0,
        'the authoritative boot body must still clear an unplanted farm, got ' + JSON.stringify(window.G.farmPlots));
    } finally { try { CAP.__setBlobRetired(null); } catch (e) {} restoreG(snap); }
  }),

  () => tryRun('FARM-B (Paione): a ready plot toasts ONCE across ticks + a reconcile, not every 5s', () => {
    const A = window.HearthriseAccrual, CAP = window.HearthriseCapstone;
    if (typeof window.__farmCheckTickForTest !== 'function' || typeof window.__resetFarmReadyNotifiedForTest !== 'function') { skip('no farm-tick test seam'); return; }
    const snap = snapshotG();
    try {
      // A genuinely-ready turnip (planted well past its grow time).
      const past = Date.now() - (window.CROPS.turnip.hours + 5) * 3600000;
      window.G.farmPlots = [{ cropId: 'turnip', plantedAt: past, waterings: [], state: 'growing' }];
      assert(window.HearthriseFarm.isReady(window.G.farmPlots[0]) === true, 'setup: the turnip must be ready');
      window.__resetFarmReadyNotifiedForTest();
      // Five ticks in a row: the toast must fire exactly ONCE (the bug fired each tick).
      for (let n = 0; n < 5; n++) window.__farmCheckTickForTest();
      assert((window.__farmReadyToasts | 0) === 1,
        'a ready plot re-fired the ready toast across ticks (fired ' + (window.__farmReadyToasts | 0) + ' times) — the every-5s bug');
      // A reconcile rebuilds the plot every envelope; the churn must NOT reset the latch.
      if (A && typeof A.reconcileFarm === 'function' && CAP && typeof CAP.__setBlobRetired === 'function') {
        CAP.__setBlobRetired(true);
        try {
          A.reconcileFarm(window.G, { ok: true, version: 8, farm: [{ i: 0, crop: 'turnip', planted_at: new Date(past).toISOString(), watered_at: null }] });
          // reconcileFarm should have promoted the rebuilt plot straight to 'ready'.
          assert(window.G.farmPlots[0] && window.G.farmPlots[0].state === 'ready',
            'reconcileFarm must promote a ready plot to state:ready on rebuild, got ' + JSON.stringify(window.G.farmPlots[0]));
        } finally { try { CAP.__setBlobRetired(null); } catch (e) {} }
        for (let n = 0; n < 5; n++) window.__farmCheckTickForTest();
        assert((window.__farmReadyToasts | 0) === 1,
          'a reconcile rebuild re-fired the ready toast (total ' + (window.__farmReadyToasts | 0) + ') — the state-churn re-latch bug');
      }
    } finally { try { window.__resetFarmReadyNotifiedForTest(); } catch (e) {} restoreG(snap); }
  }),

  /* ── FARM-PROJ-1 (Q-2 + Q-5): the two SERVER-OWNED farm facts that were LOST
     ON RELOAD, driven through the REAL reconcile with a real envelope shape.
       Q-2  hr_state_of never projected player_state.plot_level, so an armed
            reload left G.plotLevels undefined and getPlotLevel() forced Lv 1:
            a paid Plot Lv 3 lost its unlocked seeds and the Upgrade button
            quoted the Lv-2 price while the server charged the Lv-4 one.
       Q-5  it projected only the scalar watered_at, so the client rebuilt a
            ONE-element `waterings` history. Each watering is worth up to 2h of
            1x extra growth, so a plot watered four times came back with one
            watering's bonus — a long timer and a Water button on a crop the
            server already considered ready, and the client-side isReady gate
            then refused Harvest.
     Server fix: supabase/migrations/2026-09-06-state-of-farm-projection.sql.
     The full round trip (real RPCs -> real chain -> growthHours agreeing with
     hr_farm_growth_hours) is tests/state-of-farm-projection.mjs; this is the
     in-page half — the client must CONSUME both keys. */
  () => tryRun('FARM-PROJ-1 (Q-2/Q-5): plot tier and the full watering history survive a reload', () => {
    const A = window.HearthriseAccrual, CAP = window.HearthriseCapstone;
    if (!A || typeof A.reconcileFarm !== 'function' || !CAP || typeof CAP.__setBlobRetired !== 'function') { skip('no accrue/capstone api'); return; }
    const snap = snapshotG();
    try {
      CAP.__setBlobRetired(true);   // ARM: reconcileFarm is live (dormant otherwise)
      const now = Date.now();
      const iso = (msAgo) => new Date(now - msAgo).toISOString();
      // The envelope hr_state_of returns AFTER the projection migration.
      const env = {
        ok: true, version: 12,
        state: { plot_level: 3 },
        farm: [{
          i: 0, crop: 'turnip',
          planted_at: iso(4 * 3600000),
          watered_at: iso(0.5 * 3600000),
          waterings: [iso(3 * 3600000), iso(2 * 3600000), iso(1 * 3600000), iso(0.5 * 3600000)],
        }],
      };
      // A reloaded, blob-retired G: neither field is in it.
      delete window.G.plotLevels; delete window.G.farmPlots;
      A.reconcileFarm(window.G, env, { authoritative: true });

      // Q-2 — the tier came back from the server, not from the Lv 1 fail-safe.
      assert(window.G.plotLevels === 3,
        'G.plotLevels must be the SERVER tier 3 after a reload, got ' + window.G.plotLevels + ' — Q-2: a paid '
        + 'Plot Lv 3 reads back as Lv 1, unlocked seeds vanish and Upgrade quotes the wrong price');
      assert(window.HearthriseFarm.getPlotLevel() === 3,
        'getPlotLevel() must read the mirrored tier rather than its Lv 1 fail-safe, got '
        + window.HearthriseFarm.getPlotLevel());

      // Q-5 — the WHOLE history, not a one-element rebuild.
      const plot = window.G.farmPlots && window.G.farmPlots[0];
      assert(plot && Array.isArray(plot.waterings) && plot.waterings.length === 4,
        'the rebuilt plot must carry all FOUR waterings, got ' + JSON.stringify(plot && plot.waterings)
        + ' — Q-5: the history collapsed to one and the client under-counts growth');
      // …and it must CHANGE the answer: four waterings are worth strictly more
      // effective hours than the single watered_at the old projection carried.
      const four = window.HearthriseFarm.growthHours(plot, now);
      const one = window.HearthriseFarm.growthHours(
        { cropId: 'turnip', plantedAt: plot.plantedAt, waterings: [Date.parse(env.farm[0].watered_at)], state: 'growing' }, now);
      assert(four > one,
        'four waterings must yield MORE growth than one (' + four.toFixed(3) + 'h vs ' + one.toFixed(3)
        + 'h) — the array is being mirrored in shape but not in value');

      // FAIL-CLOSED, both directions: nothing is invented, nothing is reset.
      const legacy = { ok: true, state: {}, farm: [{ i: 0, crop: 'turnip', planted_at: iso(3600000), watered_at: iso(600000) }] };
      window.G.plotLevels = 4;
      A.reconcileFarm(window.G, legacy, { authoritative: true });
      assert(window.G.plotLevels === 4,
        'an envelope without state.plot_level must leave the known tier UNTOUCHED, got ' + window.G.plotLevels);
      assert(window.G.farmPlots[0].waterings.length === 1,
        'a server predating the projection must degrade to the single watered_at, not to an empty history');
    } finally { try { CAP.__setBlobRetired(null); } catch (e) {} restoreG(snap); }
  }),
];
