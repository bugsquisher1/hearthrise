// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/muster-nav-and-identity.js — the plant cliff, muster and rallies, the nav shape and the identity seam.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 59 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, stubSignedIn, stampRecordLikeLoad, withFarmServer, farmReplantFixtureG, farmHarvestThenPlant, withDeferredFarmPlant, goldOf, gemsOf, snapshotG, restoreG, snapRoundTrip, on, snapshot, serverBagFixture } from './_harness.js?v=584';

/* The server mirrors snapshotG does not carry: put them back exactly, absent stays absent. */
const keepServerMirrors = () => {
  const G = window.G, keys = ['_bestiaryTrophies', '_bestiaryCharms', '_collectionServer', '_collectionServerClaimed'];
  const had = keys.map((k) => [k, Object.prototype.hasOwnProperty.call(G, k), G[k]]);
  return () => had.forEach(([k, has, v]) => { if (has) G[k] = v; else delete G[k]; });
};

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
    assert(/Carrot/.test(locked) && /Soil Lv 2/.test(locked) && /House/.test(locked) && /Lv 1/.test(locked),
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

  /* -- regression suite -- FARM-HEAD-1: four READY tiles under a header
     reading "No crops growing". The header reads the same per-plot predicate as the
     tiles, for every mix. Mutation: restore the growing-only filter ⇒ (a) red. */
  () => tryRun('FARM-HEAD-1: the farm header agrees with the tiles (ready / thirsty / watered / mixed / empty)', () => {
    if (!document.getElementById('farm-panel')) return;
    const snap = snapshotG(), now = Date.now(), hours = window.CROPS.turnip.hours;
    const ready = () => ({ cropId: 'turnip', plantedAt: now - (hours + 1) * 3600000, waterings: [], state: 'ready' });
    const dry = () => ({ cropId: 'wheat', plantedAt: now - 3600000, waterings: [], state: 'growing' });
    const wet = () => ({ cropId: 'wheat', plantedAt: now - 3600000, waterings: [now - 60000], state: 'growing' });
    const head = (plots) => { window.G.farmPlots = plots; window.renderFarm();
      const el = document.getElementById('farm-next-water'); return el ? el.textContent : null; };
    try {
      window.G.homestead = { tier: 5 };
      const a = head([ready(), ready(), ready(), ready()]);
      assert(a === '4 ready to harvest', '(a) THE BUG: four ready plots read "' + a + '"');
      assert(document.querySelectorAll('#farm-panel .farm-tile.ready').length === 4, 'CONTROL: the four tiles are not ready');
      const b = head([dry(), dry()]);
      assert(b === '2 plots are thirsty', '(b) two dry plots read "' + b + '"');
      const c = head([wet()]);
      assert(/^Next watering in /.test(c), '(c) a watered plot read "' + c + '"');
      const d = head([ready(), dry(), null]);
      assert(d === '1 ready to harvest · 1 plot is thirsty', '(d) mixed plots read "' + d + '"');
      const e = head([null, null]);
      assert(e === 'No crops growing', '(e) empty plots read "' + e + '"');
    } finally { restoreG(snap); try { window.renderFarm(); } catch (e) {} }
  }),














  /* The Clan and Events doors left with their systems in the 2026-10-14 demolition. */
  () => tryRun('NAV-DOORS-1: the menu is seven static doors in the audit\'s order, on both rails', () => {
    const N = window.HearthriseNav;
    assert(N && Array.isArray(N.hubs), 'window.HearthriseNav is not published');
    const want = ['profile', 'character', 'skills', 'combat', 'homestead', 'shops', 'social'];
    const labels = ['Home', 'Character', 'Skills', 'Combat', 'Homestead', 'Market', 'Social'];
    assert(N.hubs.map((h) => h.id).join() === want.join(), 'HUBS order is ' + N.hubs.map((h) => h.id).join());
    const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
    for (const [host, cls] of [['#sidebar', 'nav-btn'], ['#bottom-nav', 'bn-btn']]) {
      const btns = [...document.querySelectorAll(host + ' .' + cls + '[data-tab]')].filter((b) => b.dataset.tab !== 'more');
      assert(btns.map((b) => b.dataset.tab).join() === want.join(), host + ' doors are ' + btns.map((b) => b.dataset.tab).join());
      btns.forEach((b, i) => {
        assert(b.textContent.trim() === labels[i], host + ' door ' + i + ' reads "' + b.textContent.trim() + '", expected ' + labels[i]);
        assert(!EMOJI.test(b.textContent), host + ' door ' + labels[i] + ' carries emoji');
        assert(!b.hasAttribute('data-injected'), host + ' door ' + labels[i] + ' was injected');
      });
    }
    document.querySelectorAll('#sidebar .nav-btn[data-tab]').forEach((b) => {
      assert(getComputedStyle(b).display !== 'none', 'something hides the ' + b.dataset.tab + ' door');
      assert(b.querySelector('.ic .hr-glyph svg'), 'the ' + b.dataset.tab + ' door has no atlas glyph');
    });
    const seen = {};
    N.hubs.forEach((h) => h.panes.forEach((p) => {
      assert(!seen[p.tab], p.tab + ' is a pane of two doors (' + seen[p.tab] + ', ' + h.id + ')');
      seen[p.tab] = h.id;
      assert(document.getElementById('panel-' + p.tab), 'pane ' + p.tab + ' has no #panel-' + p.tab);
    }));
    assert(!N.premiumOpen && !Object.keys(seen).some((t) => /premium|iap/.test(t)), 'Premium has a door in Early Access');
    assert(!document.querySelector('#more-modal [data-tab]'), 'the More sheet still duplicates a door — it carries utilities only');
  }),

  /* The tripwire for the merge itself: everything a player could reach from
     the old fourteen entries is reached here by GESTURES — a click on the rail,
     then a click on the pane strip — and lands on its real content. */
  () => tryRunAsync('NAV-DOORS-2: every old menu entry\'s screen is one door and one pane away', async () => {
    const OLD = [
      ['Home', 'profile', 'profile', '#dash-user'],
      ['Character', 'character', 'character', '#char-shell'],
      ['Inventory', 'character', 'inventory', '#panel-inventory > *'],
      ['Skills', 'skills', 'skills', '#panel-skills > *'],
      ['Combat', 'combat', 'combat', '#panel-combat .combat-picker'],
      ['Farm', 'homestead', 'farming', '#farm-panel'],
      ['House', 'homestead', 'house', '#house-panel'],
      ['Shops: Local Shop', 'shops', 'shop', '#shop-panel'],
      ['Shops: Market', 'shops', 'market', '#market-root > *'],
      ['Social', 'social', 'social', '#leaderboard'],
    ];
    const tick = () => new Promise((r) => setTimeout(r, 60));
    try {
      for (const [old, door, pane, marker] of OLD) {
        document.querySelector('#sidebar .nav-btn[data-tab="' + door + '"]').click();
        await tick();
        const strip = document.getElementById('hub-tabs');
        const tab = strip.querySelector('[data-hub-pane="' + pane + '"]');
        if (tab) { tab.click(); await tick(); }
        else assert(document.getElementById('panel-' + pane).classList.contains('active'),
          old + ': the ' + door + ' door neither opens ' + pane + ' nor offers it on the strip');
        const panel = document.getElementById('panel-' + pane);
        assert(panel.classList.contains('active'), old + ': #panel-' + pane + ' did not open');
        assert(document.querySelector('#panel-' + pane + ' ' + marker.replace('#panel-' + pane + ' ', '')) || document.querySelector(marker),
          old + ': #panel-' + pane + ' opened without its content (' + marker + ')');
        assert(document.querySelector('#sidebar .nav-btn[data-tab="' + door + '"]').classList.contains('active'),
          old + ': the ' + door + ' door is not lit while ' + pane + ' is open');
        if (tab) assert(strip.querySelector('.hub-tab.active[data-hub-pane="' + pane + '"]'), old + ': the strip does not mark ' + pane);
      }
    } finally {
      try { window.showTab('profile'); } catch (e) {}
    }
  }),

  /* -- regression suite -- NAV-PERF-1 (2026-10-14, Tyler: "super weird and choppy"):
     badges() repaints after every topbar and screen render, and it looked each door up
     with its own document-wide query: 9 querySelectorAll (plus 9 querySelector for the
     dots and one per pane for the open screen) per call, growing with the menu. 129 s of
     a 488 s suite profile. The doors are found once and kept, so a call costs at most 2
     querySelectorAll at ANY door count — proved with twenty extra doors — and still
     paints the same dot. */
  () => tryRun('NAV-PERF-1: badges() makes at most 2 querySelectorAll calls, whatever the door count', () => {
    const N = window.HearthriseNav;
    assert(N && typeof N.badges === 'function' && Array.isArray(N.hubs), 'window.HearthriseNav is not published');
    const D = Document.prototype, E = Element.prototype;
    const real = { dAll: D.querySelectorAll, eAll: E.querySelectorAll, dOne: D.querySelector };
    let all = 0, one = 0;
    const measure = () => {
      all = 0; one = 0;
      D.querySelectorAll = function () { all++; return real.dAll.apply(this, arguments); };
      E.querySelectorAll = function () { all++; return real.eAll.apply(this, arguments); };
      D.querySelector = function () { one++; return real.dOne.apply(this, arguments); };
      try { N.badges({}); } finally { D.querySelectorAll = real.dAll; E.querySelectorAll = real.eAll; D.querySelector = real.dOne; }
      return { all, one };
    };
    const hadBadge = N.badgeOf('inventory');
    const extra = [];
    for (let i = 0; i < 20; i++) extra.push({ id: 'perf-door-' + i, panes: [{ tab: 'perf-pane-' + i, label: 'Perf ' + i, glyph: 'uiBook' }] });
    let pushed = false;
    try {
      N.badges({});   // the first paint after boot may be the one that finds the doors
      const nine = measure();
      N.hubs.push(...extra); pushed = true;
      const many = measure();
      assert(nine.all <= 2, 'badges() made ' + nine.all + ' querySelectorAll calls with ' + (N.hubs.length - extra.length)
        + ' doors (at most 2): a document-wide query per door is the hot path this test exists for');
      assert(many.all <= 2, 'badges() made ' + many.all + ' querySelectorAll calls with ' + N.hubs.length + ' doors (at most 2)');
      assert(many.one === nine.one, 'document.querySelector calls grow with the menu: ' + nine.one + ' at '
        + (N.hubs.length - extra.length) + ' doors, ' + many.one + ' at ' + N.hubs.length);
      N.hubs.splice(N.hubs.length - extra.length, extra.length); pushed = false;
      /* Same paint: the Bag pane's dot lights the Character door, and clears. */
      N.badges({ inventory: true });
      const dot = document.querySelector('#sidebar .nav-btn[data-tab="character"] .nav-badge');
      assert(dot && !dot.classList.contains('hide'), 'a Bag badge no longer lights the Character door');
      N.badges({ inventory: false });
      assert(dot.classList.contains('hide'), 'clearing the Bag badge left the Character door lit');
    } finally {
      if (pushed) N.hubs.splice(N.hubs.length - extra.length, extra.length);
      N.badges({ inventory: hadBadge });
    }
  }),

  /* The eleven record screens became four Journal tabs. Each old screen's
     content is reached from the menu by gestures alone. */
  () => tryRunAsync('NAV-DOORS-3: every old record screen is in the Journal, reached from the menu', async () => {
    const tick = () => new Promise((r) => setTimeout(r, 40));
    const ST = window.HearthriseStandings;
    const ids = Object.keys(window.MONSTERS || {});
    const snap = snapshotG(), putBack = keepServerMirrors();
    try {
      // Standings draws nothing when the realm has nothing to say (signed out /
      // known-empty); prove the tab asks it.
      if (ST) window.HearthriseStandings = Object.assign({}, ST, { card: () => '<div data-test-standings>standings</div>' });
      // The realm counts one kill, so the row is named and opens its drop table.
      window.HearthriseTrophies.noteEnvelope({ bestiary: { kills_by_monster: { [ids[0]]: 1 } } });
      document.querySelector('#sidebar .nav-btn[data-tab="character"]').click(); await tick();
      document.querySelector('#hub-tabs [data-hub-pane="journal"]').click(); await tick();
      assert(document.getElementById('panel-journal').classList.contains('active'), 'the Journal pane did not open');
      const SCREENS = [
        ['Collection Log', 'collection', '.hr-cl-top'],
        ['luck ledger', 'collection', '#best-luck summary'],
        ['Hearthfinds', 'collection', '.hr-hf-cl'],
        ['Bestiary', 'bestiary', '.bestiary-list .bestiary-row'],
        ['Chronicle', 'recent', '.jr-chronicle'],
        ['lifetime stats', 'stats', '.stats-grid .stat-tile'],
        ['lifetime tally', 'stats', '.stats-section'],
        ['your week', 'stats', '.jr-week'],
        ['standings', 'stats', '[data-test-standings]'],
      ];
      for (const [old, tab, marker] of SCREENS) {
        document.querySelector('#panel-journal .jr-tab[data-jr-tab="' + tab + '"]').click(); await tick();
        assert(document.querySelector('#panel-journal .jr-tab.active[data-jr-tab="' + tab + '"]'), old + ': the ' + tab + ' tab did not select');
        assert(document.querySelector('#panel-journal ' + marker), old + ': not in the Journal\'s ' + tab + ' tab (' + marker + ')');
      }
      // The drop table: a named bestiary row opens it, and Back returns.
      document.querySelector('#panel-journal .jr-tab[data-jr-tab="bestiary"]').click(); await tick();
      const row = document.querySelector('#panel-journal [data-jr-mon="' + ids[0] + '"]');
      assert(row, 'a named bestiary row is not tappable');
      row.click(); await tick();
      assert(/Drop table/.test(document.querySelector('#panel-journal .hr-cl-detail').textContent), 'the drop table did not open');
      document.querySelector('#panel-journal [data-jr-back]').click(); await tick();
      assert(document.querySelector('#panel-journal .bestiary-list'), 'Back did not return to the Bestiary');
      // The bell opens the Chronicle where it now lives.
      window.showTab('profile');
      document.getElementById('btn-notif').click(); await tick();
      assert(document.querySelector('#panel-journal.active .jr-tab.active[data-jr-tab="recent"]'), 'the bell did not open the Journal on Recent');
      // Every old record route still lands.
      for (const [route, tab] of [['bestiary', 'bestiary'], ['collection', 'collection'], ['chronicle', 'recent']]) {
        window.showTab('profile');
        window.showTab(route); await tick();
        assert(document.querySelector('#panel-journal.active .jr-tab.active[data-jr-tab="' + tab + '"]'), 'showTab("' + route + '") did not land on Journal ' + tab);
      }
      ['best-overlay', 'ach-overlay', 'hr-cl-modal', 'hr-ch-modal', 'lifetime-stats'].forEach((id) =>
        assert(!document.getElementById(id), '#' + id + ' exists — the old record screen came back'));
      ['openBestiary', 'openAchievements', 'openLifetimeStats'].forEach((fn) =>
        assert(typeof window[fn] !== 'function', 'window.' + fn + ' is back — the Journal replaced it'));
    } finally {
      if (ST) window.HearthriseStandings = ST;
      restoreG(snap); putBack();
      try { window.showTab('profile'); } catch (e) {}
    }
  }),

  () => tryRun('JOURNAL-SERVER-1: the Journal prints the realm\'s counts or the pending dash, never the residue', () => {
    const G = window.G, T = window.HearthriseTrophies, C = window.HearthriseCollection;
    const ids = Object.keys(window.MONSTERS || {});
    const snap = snapshotG(), putBack = keepServerMirrors();
    try {
      G.bestiary = { [ids[0]]: { kills: 7777 } };   // the client's own residue: the belief under test
      delete G._bestiaryTrophies; delete G._collectionServer;
      window.HearthriseJournal.open('bestiary');
      let row = document.querySelector('#panel-journal [data-jr-mon="' + ids[0] + '"]');
      assert(row, 'the residue-named row is missing');
      assert(!/7,?777/.test(row.textContent), 'the Bestiary printed the residue kill count 7777');
      assert(row.querySelector('.br-kills .bal-pending'), 'an unknown server count must be the pending dash');
      row.click();
      assert(!/7,?777/.test(document.querySelector('#panel-journal .hr-cl-detail').textContent), 'the drop table printed the residue count');
      window.HearthriseJournal.open('collection');
      const top = document.querySelector('#panel-journal .hr-cl-top');
      assert(top && top.querySelectorAll('.bal-pending').length >= 2, 'unknown server counts must print pending in the Collection head');
      // Once the realm states them (the envelope seams), its numbers are what show.
      T.noteEnvelope({ bestiary: { kills_by_monster: { [ids[0]]: 42 } } });
      C.noteServerCounts({ collection: { found: 3 } });
      window.HearthriseJournal.open('bestiary');
      row = document.querySelector('#panel-journal [data-jr-mon="' + ids[0] + '"]');
      assert(/42×/.test(row.querySelector('.br-kills').textContent), 'the Bestiary did not print the server count, got ' + row.querySelector('.br-kills').textContent);
      window.HearthriseJournal.open('collection');
      assert(/Items 3\//.test(document.querySelector('#panel-journal .hr-cl-top').textContent), 'the Collection head did not print the server item count');
    } finally {
      restoreG(snap); putBack();
      try { window.showTab('profile'); } catch (e) {}
    }
  }),



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

  () => tryRun('b230: every old route into the shops still resolves, with the right pane', () => {
    const prevPane = window._shopsPane;
    try {
      const shopPanel = document.getElementById('panel-shop');
      const marketPanel = document.getElementById('panel-market');
      assert(shopPanel && marketPanel, 'a Market host is missing from the markup');
      // Premium has no door in Early Access: every premium route opens the Local Shop.
      const ROUTES = {
        shops: null, shop: 'local', store: 'local', stores: 'local',
        localshop: 'local', 'local-shop': 'local', seedshop: 'local', shopfront: 'local',
        market: 'market', exchange: 'market', marketplace: 'market',
        premium: 'local', premiumshop: 'local', 'premium-shop': 'local', gems: 'local', iap: 'local',
      };
      Object.keys(ROUTES).forEach((route) => {
        const want = ROUTES[route];
        window.showTab('profile');
        if (want) window._shopsPane = want === 'local' ? 'market' : 'local'; // force a real switch
        window.showTab(route);
        const host = (want || window._shopsPane) === 'market' ? marketPanel : shopPanel;
        assert(host.classList.contains('active'), 'showTab("' + route + '") did not open a Market pane');
        if (want) assert(window._shopsPane === want, 'showTab("' + route + '") selected ' + window._shopsPane + ', expected ' + want);
        assert(document.querySelector('.nav-btn[data-tab="shops"]').classList.contains('active'),
          'showTab("' + route + '") left the Market door unlit');
        assert(shopPanel.getAttribute('data-shops-pane') !== 'premium', 'showTab("' + route + '") showed the Premium pane');
      });
      delete window._shopsPane;
      assert(window.HearthShops.paneFor('shops') === 'local', 'a fresh session must open the Market door on the Local Shop');
      window.showTab('market');
      assert(document.querySelector('#panel-market .mk-block, #panel-market .mk-list-form'),
        'the Player Market opened an empty panel — showTab must render it');
    } finally {
      window._shopsPane = prevPane;
      try { window.showTab('profile'); } catch (e) {}
    }
  }),

  () => tryRun('NAV-MARKET-1: the Market door\'s two panes are on the strip, survive a re-render, and the choice persists', () => {
    const prevPane = window._shopsPane;
    try {
      window.showTab('shop');
      const strip = document.getElementById('hub-tabs');
      assert(!strip.hidden, 'the Market door shows no pane strip');
      const tabs = [...strip.querySelectorAll('.hub-tab')];
      assert(tabs.map((t) => t.textContent.trim()).join('|') === 'Local Shop|Player Market',
        'the Market strip reads ' + tabs.map((t) => t.textContent.trim()).join('|'));
      tabs.forEach((t) => assert(t.querySelector('.ic .hr-glyph svg'), 'a Market pane tab has no atlas glyph'));
      assert(!document.querySelector('.shops-tabs, .shops-tab'), 'the old in-panel shop toggles are back beside the pane strip');
      strip.querySelector('[data-hub-pane="market"]').click();
      assert(document.getElementById('panel-market').classList.contains('active'), 'the Player Market pane did not open');
      // The strip is outside the panel, so no market re-render can eat it.
      for (let i = 0; i < 4; i++) window.renderMarket();
      assert(document.querySelector('#hub-tabs .hub-tab.active[data-hub-pane="market"]'), 'a market re-render cost the strip its state');
      assert(document.getElementById('market-root') && document.getElementById('market-root').parentElement.id === 'panel-market',
        '#market-root is not the market renderer\'s host');
      window.showTab('profile');
      window.showTab('shops');
      assert(document.getElementById('panel-market').classList.contains('active') && window._shopsPane === 'market',
        'the Market door did not remember the Player Market across a trip away');
      document.querySelector('#hub-tabs [data-hub-pane="shop"]').click();
      assert(document.getElementById('panel-shop').classList.contains('active'), 'the Local Shop pane did not open from the strip');
    } finally {
      window._shopsPane = prevPane;
      try { window.showTab('profile'); } catch (e) {}
    }
  }),

  // ── b221 regression suite (backlog #9 — unique names + player portraits) ──

  // #9a: the rules are the contract. They are enforced in TWO places — here
  // and in public.hr_validate_display_name() — so every case below is also
  // asserted by the migration's own self-check. If these two ever disagree,
  // the server accepts a name the client refused (or worse, the reverse) and
  // a player's name stops meaning what the UI says it means.
  () => tryRun('b221: display-name rules — length, charset, trimming, reserved; content is the server\'s', () => {
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

    // The moderator's placeholder shape is the server's alone (2026-10-11).
    assert(why('Adventurer-1234') === 'reserved' && why('adventurer_77') === 'reserved',
      'Adventurer-NNNN must be reserved — it is what hr_mod_force_rename assigns');
    assert(ok('Adventurer Bob'), 'only the digits shape is reserved, not every name starting Adventurer');

    // CONTENT IS THE SERVER'S (2026-10-11-name-moderation.sql). The client holds
    // no word list, so it can never refuse a name the server accepts — the
    // Scunthorpe set the server's §13 passes must pass here too.
    for (const n of ['Dickens', 'Scunthorpe', 'Cockburn', 'Peacock', 'Spicer', 'Shitake', 'Essex', 'Raccoon']) {
      assert(ok(n), n + ' was refused by the client, which the server allows (the browser disagreeing with the server)');
    }
  }),

  /* ══ MOD-NAME-1/2 — THE SERVER OWNS NAME CONTENT (2026-10-11, P1) ═══════════
     A live leaderboard name was a racial slur: the server had no content
     filter, and the client's slur layer was placeholder hashes. The server now
     answers `name_blocked` (claim + availability) and can force a rename
     (`must_rename` on the envelope). These two pin the client's half. */
  () => tryRunAsync('MOD-NAME-1: a blocked name is refused by the server and the player is told plainly', async () => {
    const I = window.HearthriseIdentity;
    const BLOCKED = "That name isn't allowed. Try another.";
    const A = I._reduceAvailability(200, { ok: false, error: 'name_blocked' });
    assert(A.action === 'invalid' && A.message === BLOCKED, 'availability did not map name_blocked: ' + JSON.stringify(A));
    const C = I._reduceClaim(200, { ok: false, error: 'name_blocked' });
    assert(C.action === 'invalid' && C.reason === 'blocked' && C.message === BLOCKED,
      'claim did not map name_blocked: ' + JSON.stringify(C));
    const realFetch = window.fetch, savedName = window.G.playerName;
    const restore = stubSignedIn(0, 'Harness Knight');
    const calls = [];
    window.fetch = (u) => {
      const url = String((u && u.url) || u);
      calls.push(url);
      const body = /rpc\/(claim_display_name|hr_display_name_available)/.test(url) ? { ok: false, error: 'name_blocked' } : [];
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
    try {
      I._resetProbes();
      const before = JSON.stringify(I._record());
      const d = await I.claimName('Quiet Probe');
      assert(calls.some((c) => /rpc\/claim_display_name/.test(c)), 'the claim never reached the server');
      assert(d.action === 'invalid' && d.message === BLOCKED, 'the server refusal was not surfaced: ' + JSON.stringify(d));
      assert(JSON.stringify(I._record()) === before && window.G.playerName === savedName,
        'a refused name was adopted locally anyway');
      // ...and the sheet says it live, from the availability answer.
      I.openNameModal();
      const scrim = document.querySelector('.hr-id-scrim');
      const input = scrim && scrim.querySelector('input');
      assert(input, 'the name sheet did not open');
      input.value = 'Quiet Probe';
      input.dispatchEvent(new Event('input'));
      const note = scrim.querySelector('.hr-id-note');
      // Polled, not slept: the 350 ms debounce slips under a loaded runner.
      for (let t = 0; t < 60 && note && note.textContent !== BLOCKED; t++) await new Promise((r) => setTimeout(r, 50));
      assert(note && note.textContent === BLOCKED, 'the sheet showed ' + JSON.stringify(note && note.textContent));
      assert(scrim.querySelector('.btn-primary').disabled, 'the claim button stayed armed on a refused name');
    } finally {
      document.querySelectorAll('.hr-id-scrim').forEach((n) => n.remove());
      window.fetch = realFetch; window.G.playerName = savedName; I._resetProbes(); restore();
    }
  }),

  () => tryRunAsync('MOD-NAME-2: must_rename opens a prompt that cannot be dismissed, and a new name clears it', async () => {
    const I = window.HearthriseIdentity;
    assert(typeof I.noteEnvelope === 'function' && typeof I.mustRename === 'function', 'the must_rename seam is missing');
    assert(I._readMustRename({ must_rename: true }) === true && I._readMustRename({ must_rename: false }) === false
      && I._readMustRename({ state: {} }) === null, 'readMustRename is not key-presence based');
    const realFetch = window.fetch, savedName = window.G.playerName;
    const restore = stubSignedIn(0, 'Harness Knight');
    window.fetch = (u) => {
      const url = String((u && u.url) || u);
      const body = /rpc\/claim_display_name/.test(url) ? { ok: true, name: 'Clover Probe', canonical: 'clover probe', renamed: true }
        : (/rpc\/hr_display_name_available/.test(url) ? { ok: true, available: true, name: 'Clover Probe' } : []);
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
    const forced = () => document.querySelector('.hr-id-scrim[data-forced]');
    try {
      I._resetProbes();
      I.noteEnvelope({ state: {} });
      assert(!forced() && I.mustRename() === false, 'an envelope without the key opened the prompt');
      I.noteEnvelope({ must_rename: true, state: {} });
      let scrim = forced();
      assert(scrim && I.mustRename() === true, 'must_rename did not open the forced prompt');
      assert(scrim.querySelectorAll('.hr-id-row button').length === 1, 'the forced prompt offers a way out');
      scrim.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      assert(forced(), 'a scrim click dismissed the forced prompt');
      I.openNameModal();                       // e.g. the Character screen's "Change name"
      assert(forced() && forced().querySelectorAll('.hr-id-row button').length === 1,
        'another way into the name sheet replaced the forced prompt with a cancellable one');
      scrim = forced();
      const input = scrim.querySelector('input');
      input.value = 'Clover Probe';
      input.dispatchEvent(new Event('input'));
      scrim.querySelector('.btn-primary').click();
      for (let t = 0; t < 60 && (document.querySelector('.hr-id-scrim') || I.mustRename()); t++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      await new Promise((r) => setTimeout(r, 400));   // and past the 350 ms debounce, so no probe outlives the stub
      assert(!document.querySelector('.hr-id-scrim') && I.mustRename() === false,
        'a confirmed claim did not clear the forced prompt');
      // The server's next envelope is the authority both ways.
      I.noteEnvelope({ must_rename: true });
      assert(forced(), 'a renewed must_rename did not re-open the prompt');
      I.noteEnvelope({ must_rename: false });
      assert(!forced() && I.mustRename() === false, 'must_rename:false did not close the prompt');
    } finally {
      try { I.noteEnvelope({ must_rename: false }); } catch (e) {}
      document.querySelectorAll('.hr-id-scrim').forEach((n) => n.remove());
      window.fetch = realFetch; window.G.playerName = savedName; I._resetProbes(); restore();
    }
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


  () => tryRun('SNAP-2a: snapshotG produces a KEY for every field it names, even on a character that owns none of them', () => {
    const r = snapRoundTrip();
    assert(r.fields.length >= 55, 'CONTROL: snapshotG named ' + r.fields.length + ' field(s) — it is not snapshotting the live character, so SNAP-2a/b/c are all vacuous');
    ['buyback', 'recoveringUntilMs', 'heroSlotsUnlocked', '_bankCap', 'traits', 'rooms', 'skills', 'gold', '_serverBag', '_bagFromServerAt', '_startKitHintAt']
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

  /* SNAP-BAG-1 — restoreG PUTS THE STATED SERVER BAG BACK. `_serverBag` was off the
     snapshot list, so a test that stated a bag left it for every later item gate. restoreG
     is the boundary for a test that SNAPSHOTS; it is driven here three ways: a bare fixture
     write, the production writer (reconcileInventory on a COMPLETE baseline stamps the bag,
     `_bagFromServerAt` AND `_startKitHintAt` — the control below proves all three were
     written), and a test that starts with a bag. A test that applies an envelope WITHOUT a
     snapshot is the runner's per-test bag check's (smoke-test.js) and SNAP-BAG-2's.
     MUTATION: drop any of the three keys from snapshotG → a named red here. */
  () => tryRun('SNAP-BAG-1: a test that states a server bag and never hand-restores it does not change the next test\'s gate view', () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.gateItemCount === 'function' && typeof A.reconcileInventory === 'function' && typeof A.bagHydrated === 'function',
      'HearthriseAccrual no longer publishes gateItemCount / reconcileInventory / bagHydrated — the gates this test guards are unreachable');
    const G = window.G, own = (k) => Object.prototype.hasOwnProperty.call(window.G, k);
    const BAG = ['_serverBag', '_bagFromServerAt', '_startKitHintAt'], ABSENT = {}, held = {};
    BAG.forEach((k) => { held[k] = own(k) ? G[k] : ABSENT; });   // hand-held so a RED run cannot leak what it proves leaks
    const outer = snapshotG();
    try {
      BAG.forEach((k) => { delete G[k]; });
      const s1 = snapshotG();
      G._serverBag = { copper_ore: 3 };          // FARM-TIER-3's shape: a bare write, no hand restore
      restoreG(s1);
      assert(!own('_serverBag'), 'a bare `G._serverBag =` outlived restoreG: the next test inherits a stated bag of '
        + JSON.stringify(window.G._serverBag) + ' and every item gate counts it as the server\'s');
      assert(A.gateItemCount(window.G, 'copper_ore') === null, 'the next test\'s gate read '
        + A.gateItemCount(window.G, 'copper_ore') + ' — with no envelope stated it must read PENDING (null)');

      const s2 = snapshotG();
      A.reconcileInventory(window.G, { inventory: { copper_ore: 2 } }, false, true);   // a COMPLETE baseline: all three stamps
      assert(window.G._serverBag && window.G._serverBag.copper_ore === 2 && A.bagHydrated(window.G),
        'CONTROL: reconcileInventory did not state the bag, so the production-writer half proves nothing');
      assert(BAG.every(own), 'CONTROL: the production writer stamped only ' + BAG.filter(own).join(', ')
        + ' — the restore check below would not bite on the missing field');
      restoreG(s2);
      const left = BAG.filter(own);
      assert(!left.length, 'an applied envelope left ' + left.join(', ') + ' behind restoreG — the bag and the stamps written with it '
        + 'must restore as ONE, or the next test reads "hydrated" over a bag nobody stated');
      assert(!A.bagHydrated(window.G) && A.gateItemCount(window.G, 'copper_ore') === null,
        'after the boundary the next test must see an UNSTATED bag (bagHydrated false, gate null)');

      G._serverBag = { copper_ore: 1, turnip_seed: 4 };
      const s3 = snapshotG();
      G._serverBag.copper_ore = 9; G._serverBag.tin_ore = 50;   // nested writes are writes to the field
      restoreG(s3);
      assert(JSON.stringify(window.G._serverBag) === '{"copper_ore":1,"turnip_seed":4}',
        'a test that STARTED with a stated bag got ' + JSON.stringify(window.G._serverBag) + ' back — restoring is never a wipe or a merge');
      assert(A.gateItemCount(window.G, 'copper_ore') === 1, 'the restored bag must gate on its own figure (1)');
    } finally {
      restoreG(outer);
      BAG.forEach((k) => { if (held[k] === ABSENT) delete window.G[k]; else window.G[k] = held[k]; });
    }
  }),

  /* SNAP-BAG-2 — serverBagFixture IS THE RESTORE FOR A TEST THAT DOES NOT SNAPSHOT, AND THE
     RUNNER'S PER-TEST CHECK. Its restore() used to put back `_serverBag` alone, so a test that
     applied an envelope through production (WAVE2's room rig, the bank buy) left
     `_bagFromServerAt` — bagHydrated read TRUE over a bag nobody stated. changed() is what
     smoke-test.js runs after every test to name the one that moved the triple.
     MUTATION: restore() back to `_serverBag` only, or changed() blind to a stamp → red here. */
  () => tryRun('SNAP-BAG-2: serverBagFixture().restore() puts back the bag AND both stamps, and changed() names what moved', () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.reconcileInventory === 'function' && typeof A.bagHydrated === 'function',
      'HearthriseAccrual no longer publishes reconcileInventory / bagHydrated');
    const G = window.G, own = (k) => Object.prototype.hasOwnProperty.call(window.G, k);
    const BAG = ['_serverBag', '_bagFromServerAt', '_startKitHintAt'], ABSENT = {}, held = {};
    BAG.forEach((k) => { held[k] = own(k) ? G[k] : ABSENT; });
    const outer = snapshotG();
    try {
      BAG.forEach((k) => { delete G[k]; });
      const fx = serverBagFixture();
      assert(fx.changed().length === 0, 'an untouched triple read as changed: ' + fx.changed().join(', '));
      A.reconcileInventory(window.G, { inventory: { copper_ore: 2 } }, false, true);
      assert(BAG.every(own), 'CONTROL: the production writer stamped only ' + BAG.filter(own).join(', '));
      assert(fx.changed().join() === BAG.join(), 'changed() named [' + fx.changed().join(', ') + '] after an envelope wrote all three');
      fx.restore();
      const left = BAG.filter(own);
      assert(!left.length, 'serverBagFixture().restore() left ' + left.join(', ') + ' — a test restoring through it hands the next '
        + 'test a bag that reads hydrated (bagHydrated ' + A.bagHydrated(window.G) + ')');
      assert(fx.changed().length === 0, 'after restore() changed() still names ' + fx.changed().join(', '));

      G._serverBag = { copper_ore: 1 }; G._bagFromServerAt = 111; G._startKitHintAt = 222;
      const fx2 = serverBagFixture();
      G._bagFromServerAt = 333;                                  // a re-stamp alone is a change
      assert(fx2.changed().join() === '_bagFromServerAt', 'a re-stamped `_bagFromServerAt` read as [' + fx2.changed().join(', ') + ']');
      G._serverBag.copper_ore = 7;                               // a nested write after capture is a change, not an edit of the capture
      fx2.restore();
      assert(JSON.stringify(window.G._serverBag) === '{"copper_ore":1}' && window.G._bagFromServerAt === 111 && window.G._startKitHintAt === 222,
        'restore() did not put back the triple it captured: ' + JSON.stringify(BAG.map((k) => window.G[k])));
    } finally {
      restoreG(outer);
      BAG.forEach((k) => { if (held[k] === ABSENT) delete window.G[k]; else window.G[k] = held[k]; });
    }
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
      ['seeds', 'equip'].forEach((tab) => {
        window.setShopTab(tab);
        const panel = document.getElementById('shop-panel');
        assert(panel.querySelector('.sc-scene svg'), tab + ': the shopfront scene is missing');
        assert(panel.querySelector('.sc-counter'), tab + ': the offers are not on a counter');
        const expect = tab === 'seeds' ? window.SEED_SHOP.length : window.EQUIP_SHOP.length;
        const rows = panel.querySelectorAll('.sc-counter .shop-row');
        // Name what the counter PAINTED: "got 15, wanted 14" cost a session on its own.
        assert(rows.length === expect,
          tab + ': expected ' + expect + ' offers, got ' + rows.length + ' — rows: '
          + Array.from(rows).map((r) => {
            const b = r.querySelector('.info b');
            return (b ? b.textContent : r.textContent).trim().slice(0, 28);
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
    assert(legacyCats.indexOf('skills') < 0, 'per-skill boards need the migration');
    assert(legacyCats.indexOf('overall') >= 0 && legacyCats.indexOf('combat') >= 0,
      'the three pre-existing boards must survive un-migrated');
    assert(LB._boardsIn('overall', 'legacy').join(',') === 'total_level,wealth', 'degraded Overall');
    assert(LB._boardsIn('combat', 'legacy').join(',') === 'combat_level', 'degraded Combat');

    /* The Throne (renown) and Clans categories left in the 2026-10-14 demolition. */
    const fullCats = LB._categoriesFor('full').map((c) => c.id);
    assert(fullCats.join(',') === 'overall,skills,combat', 'migrated, the three categories are offered: ' + fullCats.join(','));
    assert(LB._boardsIn('skills', 'full').length === LB.SKILL_ORDER.length,
      'migrated, every skill board appears (' + LB.SKILL_ORDER.length + ')');

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
    const html = LB._boardHtml('total_level', view);
    assert(html.indexOf('Hearth Token') < 0 && html.indexOf('gems') < 0, 'no currency in the board');
    assert(window.G.gold === goldBefore && window.G.gems === gemsBefore, 'rendering must move nothing');

    // Rank 1 earns a cosmetic title. It is honest because the rank behind it
    // came from the server, and it is the ONLY thing ranking grants.
    assert(LB._crownFor('total_level') === 'the Peerless', 'the flagship crown');
    assert(LB._crownFor('skill:mining') === 'the Veinfinder', 'per-skill crowns are named');
    assert(html.indexOf('the Peerless') >= 0, 'rank 1 wears its title on the board');
  }),

  // THE STANDINGS: Home's sentence and the Social note read one server answer;
  // a rival's name is escaped, and each case picks its own line.
  () => tryRun('STAND-A: the standing sentence reads one server answer', () => {
    const ST = window.HearthriseStandings;
    const near = [{ rank: 6, name: 'Bran<b>', score: 412 }, { rank: 7, name: 'Me', score: 400 }];
    const a = ST.standingLine('total_level', { rank: 7, total: 38, top: [], near });
    assert(a && a.key === 'standing.chase' && a.text.indexOf('12 levels behind Bran<b>') >= 0, 'chase line, got ' + JSON.stringify(a));
    const html = ST.cardHtml({ rows: [{ boardId: 'total_level', ans: { rank: 7, total: 38, top: [], near, available: true } }], refreshedAt: null });
    assert(html.indexOf('Bran&lt;b&gt;') >= 0 && html.indexOf('Bran<b>') < 0, 'the rival name must be escaped');
    const one = (s1, s2) => ST.standingLine('skill:mining', { rank: 1, total: 2, top: [{ rank: 1, name: 'Me', score: s1 }], near: [{ rank: 2, name: 'Cyn', score: s2 }] });
    const c = one(5000, 1860);
    assert(c.key === 'standing.crown' && c.text.indexOf('the Veinfinder') >= 0, 'rank 1 wears the crown, got ' + c.text);
    assert(c.text.indexOf((3140).toLocaleString() + ' xp clear of') >= 0, 'rank 1 names its lead, got ' + c.text);
    assert(one(900, 900).key === 'standing.level', 'equal scores read as dead level');
    assert(ST.standingLine('skill:mining', { rank: null, total: 2, top: [], near: [] }).key === 'standing.unranked', 'rank null is unranked');
    const alone = ST.standingLine('skill:mining', { rank: 1, total: 1, top: [{ rank: 1, name: 'Me', score: 9 }], near: [] });
    assert(alone.key === 'standing.crownAlone', 'a lone rank 1 holds the crown alone');
    assert(ST.standingLine('wealth', { rank: 2, total: 3, top: [], near: [] }) === null, 'no sentence for boards without units');
  }),

  () => tryRun('STAND-B: crowns, eligibility and the pending card', () => {
    const LB = window.HearthriseLeaderboards, ST = window.HearthriseStandings;
    assert(LB._crownFor('skill:mining') === 'the Veinfinder' && LB._crownFor('wealth') === 'the Magnate', 'crowns');
    assert(ST.eligible({ signedIn: true, slot: 1, online: true }) === false, 'slot 1 is not on the boards');
    assert(ST.eligible({ signedIn: false, slot: 0, online: true }) === false, 'signed out is not eligible');
    assert(ST.eligible({ signedIn: true, slot: 0, online: true }) === true, 'slot 0 signed in is eligible');
    const div = document.createElement('div');
    div.innerHTML = ST.cardHtml(null);
    assert(div.textContent.indexOf('Reading the boards') >= 0 && !/\d/.test(div.textContent), 'pending card, no number: ' + div.textContent);
    assert(!/claim|grant|reward|payout|token/i.test(Object.keys(ST).join(' ')), 'the standings API grants nothing');
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
    assert(LB._boardHtml('total_level', states.empty).indexOf('No one has ranked') >= 0, 'the empty state must speak');
    assert(LB._boardHtml('total_level', states.anon).indexOf('Sign in') >= 0 ||
           LB._boardHtml('total_level', states.anon).indexOf('no place on the') >= 0,
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

  /* ── W0 regression — ONE INTRO, NOT FIVE (coherence audit top-10 #3) ──────
     The post-signup welcome sheet ('Train your first skill') was cut: the name
     picker, the tour and the first-day card already say it. Proven by absence at
     RUNTIME, not by grep: no module publishes it, and a stubbed sign-in (the one
     thing it waited for) raises no such sheet inside its old 2 s poll window.
     MUTATION: restore src/post-signup-welcome.js in index.html -> RED on the
     first assertion. */
  () => tryRunAsync('W0-INTRO-1: there is no post-signup welcome sheet — a stubbed sign-in raises none', async () => {
    assert(window.HearthrisePostSignup === undefined, 'the post-signup welcome is loaded again — the cut intro layer is back');
    assert(window.HearthriseBetaBanner === undefined && !document.getElementById('beta-banner-overlay'),
      'the open-beta welcome card is loaded again — W0 cut it with the beta copy');
    const was = new Set(document.querySelectorAll('#hr-post-signup-modal'));
    const unstub = stubSignedIn(0);
    try {
      await new Promise((r) => setTimeout(r, 2500));
      const added = [...document.querySelectorAll('#hr-post-signup-modal')].filter((e) => !was.has(e));
      assert(!added.length, 'a post-signup welcome sheet opened after sign-in');
    } finally { unstub(); }
  }),

  /* CODEX-1 — the Hearth Codex (src/features/codex.js). The copy is bound to the
     engine by tests/codex-claims.mjs; this proves the three doors reach it. */
  () => tryRunAsync('CODEX-1: the Hearth Codex opens on an entry with a door, closes, and every door to it exists', async () => {
    const C = window.HearthriseCodex;
    assert(C && typeof C.open === 'function', 'window.HearthriseCodex is missing — the glossary has no way in');
    try {
      await C.open('knocked-out');
      assert(document.querySelector('#codex-modal.show'), 'open() did not show #codex-modal');
      const d = document.getElementById('cx-knocked-out');
      assert(d && d.open && /first fall of each day/.test(d.textContent), 'open(id) did not open that entry');
      assert(d.querySelector('button.codex-door'), 'the entry has no door');
    } finally { C.close(); }
    assert(!document.querySelector('#codex-modal.show'), 'close() left the Codex up');
    assert(document.querySelector('#more-modal #more-codex'), 'the More sheet has no Codex button');
    assert(document.querySelector('#tb-codex, .feat-buttons [onclick*="HearthriseCodex"]'), 'the profile toolbar has no Codex button');
  }),
];
