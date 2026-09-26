// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/cooking-core-and-save.js — the campfire ruling, the pacing retune, the shared simulation core and the save-system battery.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 92 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, stampRecordLikeLoad, awayArtisanSpan, withFightScreen, xpOf, xpZero, snapshotG, drain, restoreG, restoreGAndRecord, combatScreen, on, snapshot, decideRestore, decideLocalOwnership, withDesktopBanner, assertBannerReserved } from './_harness.js?v=553';

export default [

  /* ══════════════════════════════════════════════════════════════════════
     b225 — THE CAMPFIRE RULING (Tyler, 2026-08-08, binding)

     Cooking is never gated on the Kitchen; the open fire burns instead. The
     gate half is guarded by the b225 test up in the homestead block. These
     six guard the mechanic:
       1. the curve, at every documented point,
       2. the Kitchen ladder is the producer of `noBurn` and the two tables
          (ROOMS.kitchen.bx vs cooking-fire KITCHEN_NO_BURN) agree,
       3. Burnt Food is inert — auto-eat can never touch it,
       4. a burn costs the ingredients, yields carbon and consolation XP,
       5. a burn never ticks a "cook N" goal,
       6. the player is TOLD the risk before pressing the tile.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRun('b225: burnChance() is the documented curve at every published point', () => {
    const CF = window.HearthriseCookingFire;
    assert(CF && typeof CF.burnChance === 'function', 'HearthriseCookingFire.burnChance missing');
    const r = { req: 20, xp: 100 };
    const at = (lv, noBurn) => Math.round(CF.burnChance(r, lv, noBurn) * 100);

    // Open fire, at the recipe's exact requirement: the documented base.
    assert(CF.BASE === 0.25, 'BASE burn should be 25%, got ' + CF.BASE);
    assert(at(20, 0) === 25, 'no Kitchen at req should be 25%, got ' + at(20, 0));

    // The Kitchen ladder: 25 → 12 → 6 → 0.
    assert(at(20, CF.KITCHEN_NO_BURN[0]) === 12, 'Kitchen L1 should be 12%, got ' + at(20, CF.KITCHEN_NO_BURN[0]));
    assert(at(20, CF.KITCHEN_NO_BURN[1]) === 6,  'Kitchen L2 should be 6%, got '  + at(20, CF.KITCHEN_NO_BURN[1]));
    assert(at(20, CF.KITCHEN_NO_BURN[2]) === 0,  'Kitchen L3 must be burn-proof, got ' + at(20, CF.KITCHEN_NO_BURN[2]));

    // Mastery: −1 point per level above the recipe req, and it STACKS.
    assert(at(26, 0) === 19, '6 levels over req on the open fire should be 19%, got ' + at(26, 0));
    assert(at(45, 0) === 0,  '25 levels over req should be burn-proof on the open fire, got ' + at(45, 0));
    assert(at(26, CF.KITCHEN_NO_BURN[0]) === 6, 'Kitchen L1 + 6 levels should stack to 6%, got ' + at(26, CF.KITCHEN_NO_BURN[0]));

    // Floors and ceilings: never negative, never above BASE, never NaN.
    assert(CF.burnChance(r, 99, 5) === 0, 'burn chance must floor at 0');
    assert(CF.burnChance(r, 1, 0) === CF.BASE, 'below req cannot exceed BASE');
    assert(CF.burnChance(r, 20, -3) === CF.BASE, 'a negative noBurn must not raise the risk');
    assert(CF.burnChance(null, NaN, undefined) === CF.BASE, 'garbage input must not produce NaN');
    assert(CF.burnPct(r, 20, 0) === 25, 'burnPct should be the whole-percent twin');

    // Consolation XP: 25% of the recipe, never zero.
    assert(CF.BURN_XP_SHARE === 0.25, 'burn XP share should be 25%');
    assert(CF.burnXp(r) === 25, 'a 100 XP recipe should pay 25 XP on a burn, got ' + CF.burnXp(r));
    assert(CF.burnXp({ xp: 1 }) === 1, 'a burn must never award 0 XP');
  }),

  () => tryRun('b225: the Kitchen is the producer of noBurn, and the two tables agree', () => {
    const CF = window.HearthriseCookingFire;
    const rungs = window.ROOMS.kitchen.levels;
    assert(rungs.length === CF.KITCHEN_NO_BURN.length, 'the Kitchen ladder and KITCHEN_NO_BURN must be the same length');
    rungs.forEach((ld, i) => {
      assert(ld.bx && ld.bx.noBurn === CF.KITCHEN_NO_BURN[i],
        'Kitchen L' + (i + 1) + ' noBurn drifted: room says ' + JSON.stringify(ld.bx) + ', curve says ' + CF.KITCHEN_NO_BURN[i]);
      // Nothing already bought is devalued: cookSpeed is untouched.
      assert(ld.bk === 'cookSpeed', 'Kitchen L' + (i + 1) + ' must still sell cook speed');
    });
    assert(rungs[2].bx.noBurn === CF.BASE, 'the Cast-Iron Range must cancel the whole base burn');

    // getBonus must actually READ the secondary map — this is the ghost key
    // finally getting a producer, so a silent 0 here is the whole bug.
    //
    // b226: measured as a DELTA, not as an absolute. window.getBonus is wrapped
    // additively by world-events.js, companions.js, clans.js, clan-seat-ui.js
    // and muster.js, and the daily/weekly event pool contains Feast Day
    // (+0.30 cookSpeed) and Guild Works (+0.20). Asserting an absolute 0.25
    // therefore FAILED the whole gate on roughly one day in six, depending on
    // nothing but the UTC date — which is how a green suite stops meaning
    // anything. What the Kitchen contributes is the claim; what else is in the
    // stack today is not this test's business.
    const savedRooms = window.G.rooms;
    try {
      /* b456: `rooms` is server-of-record, so getBonus reads the rung through
         roomsOf and a raw `G.rooms = …` is invisible to it (fail-closed empty).
         Each position is stamped through the real record path. */
      window.G.rooms = {};
      stampRecordLikeLoad(window.G);
      const baseCook = window.getBonus('cookSpeed');
      const baseBurn = window.getBonus('noBurn');
      window.G.rooms = { kitchen: 2 };
      stampRecordLikeLoad(window.G);
      assert(Math.abs((window.getBonus('noBurn') - baseBurn) - CF.KITCHEN_NO_BURN[1]) < 1e-9,
        'getBonus("noBurn") should read the Kitchen rung, got ' + window.getBonus('noBurn'));
      /* b227: derived from the rung, not pinned to 0.25. The relationship this
         line guards is "the headline bk/bv still pays out alongside the bx
         map" — the literal was only ever the value that happened to be in the
         table, and the magnitude retune moved it. Same lesson as the delta
         above: assert the claim, not today's number. */
      assert(Math.abs((window.getBonus('cookSpeed') - baseCook) - rungs[1].bv) < 1e-9,
        'the headline cookSpeed bonus must survive the bx addition');
      window.G.rooms = {};
      stampRecordLikeLoad(window.G);
      assert(window.getBonus('noBurn') === baseBurn, 'no Kitchen means no Kitchen noBurn');
    } finally { window.G.rooms = savedRooms; stampRecordLikeLoad(window.G); }
  }),

  () => tryRun('b225: Burnt Food is real, vendor trash, and inert to auto-eat', () => {
    const it = window.ITEMS.burnt_food;
    assert(it, 'burnt_food must be a real item');
    assert(it.n === 'Burnt Food', 'burnt_food should be named "Burnt Food", got ' + it.n);
    assert(it.v === 1, 'burnt_food should be vendor trash at 1g, got ' + it.v);
    assert(!it.heals && !it.foodClass, 'burnt_food must carry no heal and no foodClass');
    assert(!it.type && !it.buff && !it.seed && !it.buryXp, 'burnt_food must not be equipment, a buff, a seed or bones');
    // The two engine predicates that decide whether auto-eat may spend it.
    assert(window.foodClassOf(it) === null, 'foodClassOf(burnt_food) must be null');
    assert(window.isAutoEatable(it) === false, 'auto-eat must never be allowed to eat Burnt Food');
    assert(window.foodKindOf(it) === null, 'burnt_food must not present as a provision/feast/draught');
    // bestProvisionId() is the "what will auto-eat reach for" answer — a bag
    // holding nothing but Burnt Food must return nothing, not carbon.
    const savedInv = window.G.inventory;
    try {
      window.G.inventory = { burnt_food: 99 };
      assert(window.bestProvisionId() === null, 'Burnt Food must never be picked as a provision');
    } finally { window.G.inventory = savedInv; }
  }),

  () => tryRun('b225: a burn costs the ingredients, pays consolation XP, and never ticks a cook goal', () => {
    if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(true);
    const G = window.G;
    const CF = window.HearthriseCookingFire;
    /* NO CALENDAR — same reason as b222 SEAM 1 above. `steady_fire` is a daily
       blessing worth noBurn 0.25, and the burn curve is SUBTRACTIVE, so on the
       days it is dealt an open fire is 0% rather than 25% and this test's
       rigged worst-case roll stops being a burn at all. Date-dependent, and it
       would have gone red on 2026-08-29. */
    const E = window.HearthriseWorldEvents;
    const saved = {
      inv: JSON.parse(JSON.stringify(G.inventory || {})),
      skills: JSON.parse(JSON.stringify(G.skills || {})),
      rooms: JSON.parse(JSON.stringify(G.rooms || {})),
      stats: JSON.parse(JSON.stringify(G.stats || {})),
      random: Math.random,
    };
    const rec = window.ARTISAN_RECIPES.cooking.find((r) => r.output === 'cooked_shrimp');
    assert(rec, 'the shrimp recipe should exist');
    /* b332: The Steady Fire pays −25% burn chance, which makes an open fire
       burn-proof and this test red on whatever days it happens to be drawn.
       It never surfaced before because the broken hash could only reach a few
       of the nine dailies; with the draw fixed, every calendar-sensitive test
       has to say so. QUIET is the no-calendar control. */
    if (E) E._force({ daily: E.QUIET, weekly: E.QUIET });
    try {
      G.rooms = {};                                   // open fire
      G.skills = Object.assign({}, G.skills, { cooking: 0 });
      G.inventory = { shrimp: 10, cooked_shrimp: 0, burnt_food: 0 };
      G.stats = Object.assign({}, G.stats, { cooked: 0, burnt: 0 });
      /* b456: rooms are server-of-record (an unstamped `G.rooms = {}` reads as the
         same empty map, but the Kitchen L3 leg below genuinely needs the record),
         and a cooking grant under the skills arm is a DISPLAY PREDICTION rather
         than a `G.skills` write — so the xp is measured with xpOf, the same read
         the game itself makes. Stamped BEFORE the cooks so nothing retires them. */
      stampRecordLikeLoad(G);
      const xp0 = xpZero('cooking');

      /* PHASE A: the artisan rolls take the injected core RNG, so forcing an
         outcome means injecting a generator — assigning Math.random would
         now silently do nothing and the test would pass on the wrong path. */
      window.HearthriseCore.setRng(window.HearthriseCore.rngMod.rngFrom(() => 0));
      window.doArtisanAction('cooking', rec.id, { silent: true });
      assert((G.inventory.shrimp || 0) === 9, 'a burn must still consume the ingredient');
      assert((G.inventory.cooked_shrimp || 0) === 0, 'a burn must not yield the dish');
      assert((G.inventory.burnt_food || 0) === 1, 'a burn must yield exactly one Burnt Food');
      assert((G.stats.cooked || 0) === 0, 'a burn must NOT tick the cooked counter — cook goals count successes only');
      assert((G.stats.burnt || 0) === 1, 'a burn should be counted as a burn');
      // b226: CF.burnXp(rec) and rec.xp are BOOK values; what lands in the
      // skill is the book value through PACE.xp, because a burn is a rate
      // like any other. The relationship being guarded — a burn pays the
      // consolation fraction and never the full cook — is unchanged; only
      // the scale moved, so the expectation is derived from the same dial
      // the engine uses rather than pinned to a number that will rot.
      const paced = (n) => Math.max(1, Math.floor(window.pacedXp('cooking', n)));
      const burnXp = xpOf('cooking') - xp0;
      assert(burnXp === paced(CF.burnXp(rec)),
        'a burn should pay ' + paced(CF.burnXp(rec)) + ' consolation XP, got ' + burnXp);
      assert(burnXp > 0 && burnXp < paced(rec.xp), 'consolation XP must sting but not be zero');

      window.HearthriseCore.setRng(window.HearthriseCore.rngMod.rngFrom(() => 0.999)); // force a success
      const xp1 = xpOf('cooking');
      window.doArtisanAction('cooking', rec.id, { silent: true });
      assert((G.inventory.cooked_shrimp || 0) === 1, 'a successful cook must yield the dish');
      assert((G.inventory.burnt_food || 0) === 1, 'a successful cook must not yield carbon');
      assert((G.stats.cooked || 0) === 1, 'a successful cook ticks the cooked counter');
      assert(xpOf('cooking') - xp1 >= paced(rec.xp), 'a successful cook pays full XP');

      // Kitchen L3 is burn-proof: even a rigged roll cannot ruin the dish.
      G.rooms = { kitchen: 3 };
      stampRecordLikeLoad(G);   // b456: the rung must reach cookBurnChance through the record
      assert(window.cookBurnChance(rec) === 0, 'a Cast-Iron Range must be burn-proof');
      window.HearthriseCore.setRng(window.HearthriseCore.rngMod.rngFrom(() => 0));
      window.doArtisanAction('cooking', rec.id, { silent: true });
      assert((G.inventory.burnt_food || 0) === 1, 'Kitchen L3 must never burn, even on a worst-case roll');
      assert((G.inventory.cooked_shrimp || 0) === 2, 'Kitchen L3 should have produced a second dish');
    } finally {
      if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(null);
      E._force(null);
      Math.random = saved.random;
      window.HearthriseCore.setRng(null);
      if (E) E._force(null);
      G.inventory = saved.inv; G.skills = saved.skills; G.rooms = saved.rooms; G.stats = saved.stats;
      if (typeof window._stopArtisan === 'function') window._stopArtisan();
    }
  }),

  () => tryRun('b225: only cooking burns — a forge never ruins a bar', () => {
    const G = window.G;
    const saved = {
      inv: JSON.parse(JSON.stringify(G.inventory || {})),
      skills: JSON.parse(JSON.stringify(G.skills || {})),
      rooms: JSON.parse(JSON.stringify(G.rooms || {})),
      random: Math.random,
    };
    const rec = window.ARTISAN_RECIPES.smithing.find((r) => r.output === 'copper_bar');
    if (!rec) return;
    try {
      G.rooms = {};
      G.skills = Object.assign({}, G.skills, { smithing: 500000 });
      const inputs = rec.inputs || { [rec.input]: 1 };
      G.inventory = { burnt_food: 0 };
      Object.keys(inputs).forEach((id) => { G.inventory[id] = 20; });
      G.inventory[rec.output] = 0;
      window.HearthriseCore.setRng(window.HearthriseCore.rngMod.rngFrom(() => 0)); // the worst possible roll
      window.doArtisanAction('smithing', rec.id, { silent: true });
      assert((G.inventory[rec.output] || 0) === 1, 'smithing must always produce its output');
      assert((G.inventory.burnt_food || 0) === 0, 'smithing must never produce Burnt Food');
    } finally {
      Math.random = saved.random;
      window.HearthriseCore.setRng(null);
      G.inventory = saved.inv; G.skills = saved.skills; G.rooms = saved.rooms;
      if (typeof window._stopArtisan === 'function') window._stopArtisan();
    }
  }),

  () => tryRun('b225: the burn risk is on the screen before the player presses the tile', () => {
    const G = window.G;
    const E = window.HearthriseWorldEvents;          // NO CALENDAR — see above
    const saved = {
      rooms: JSON.parse(JSON.stringify(G.rooms || {})),
      skills: JSON.parse(JSON.stringify(G.skills || {})),
    };
    const cook = window.ARTISAN_RECIPES.cooking.find((r) => r.output === 'cooked_shrimp');
    const smith = window.ARTISAN_RECIPES.smithing.find((r) => r.output === 'copper_bar');
    if (E) E._force({ daily: E.QUIET, weekly: E.QUIET });   // b332: see the burn test above
    try {
      assert(typeof window.burnRiskLine === 'function', 'burnRiskLine (the comprehension surface) is missing');
      G.rooms = {}; G.skills = Object.assign({}, G.skills, { cooking: 0 });
      /* b456: every `G.rooms = …` below has to go through the record, because the
         burn curve reads the Kitchen rung via roomsOf and a raw write is UNKNOWN
         (fail-closed empty) — which would silently make every position read as an
         open fire and the 12%/burn-proof legs would prove nothing. */
      stampRecordLikeLoad(G);

      const open = window.burnRiskLine(cook, 'cooking');
      assert(/Burn risk: 25%/.test(open), 'the open fire must show its 25% risk, got: ' + open);
      assert(/build a Kitchen/i.test(open), 'the advice must tell a camper to build a Kitchen, got: ' + open);
      assert(open.indexOf('var(--red)') >= 0, 'the risk line must use the --red token, never a literal colour');

      // The number shown is the number rolled — same source, by construction.
      assert(Math.round(window.cookBurnChance(cook) * 100) === 25, 'preview and roll must agree');

      G.rooms = { kitchen: 1 };
      stampRecordLikeLoad(G);
      const withKitchen = window.burnRiskLine(cook, 'cooking');
      assert(/Burn risk: 12%/.test(withKitchen), 'a Kitchen L1 cook must be told 12%, got: ' + withKitchen);
      assert(/upgrade your Kitchen/i.test(withKitchen), 'a Kitchen owner should be told to UPGRADE, got: ' + withKitchen);

      // Burn-proof and non-cooking recipes must add nothing to the screen.
      G.rooms = { kitchen: 3 };
      stampRecordLikeLoad(G);
      assert(window.burnRiskLine(cook, 'cooking') === '', 'a burn-proof cook must show no risk line');
      G.rooms = {};
      stampRecordLikeLoad(G);
      if (smith) assert(window.burnRiskLine(smith, 'smithing') === '', 'smithing must never show a burn risk');

      /* …and the calendar's own claim, asserted rather than left as an ambient
         accident: The Steady Fire must actually LOWER the number on the tile. */
      const STEADY = E.DAILY.find((d) => d.id === 'steady_fire');
      assert(STEADY && STEADY.bonus.noBurn > 0, 'The Steady Fire must still be a burn-chance blessing');
      G.rooms = {};
      stampRecordLikeLoad(G);
      const plain = window.cookBurnChance(cook);
      E._force({ daily: STEADY, weekly: E.QUIET });
      const eased = window.cookBurnChance(cook);
      if (E.isActive()) {
        /* The curve is SUBTRACTIVE (burn% = BASE − noBurn − relief, clamped),
           so the blessing removes exactly its own points. Stated against that
           arithmetic rather than a pinned percentage, so a retune of BASE or of
           the blessing moves the expectation with it instead of rotting.
           NOTE for the Designer: at BASE 25% and blessing 25% this lands on
           ZERO — a free daily blessing hands a camper the burn-proofing that is
           the Kitchen ladder's L3 reward. Filed in DISCOVERIES.md, not fixed
           here: it is a balance call, not a bug in this seam. */
        assert(eased === Math.max(0, plain - STEADY.bonus.noBurn),
          'The Steady Fire must remove exactly ' + STEADY.bonus.noBurn
          + ' from the burn curve, ' + plain + ' → ' + eased);
        assert(eased < plain, 'The Steady Fire must ease the open fire');
        assert(window.burnRiskLine(cook, 'cooking') === '',
          'a burn-proof camp must show no risk line, got: ' + window.burnRiskLine(cook, 'cooking'));
      } else {
        assert(eased === plain, 'an unblessed session must not receive the calendar burn easing');
      }
    } finally {
      if (E) E._force(null);
      G.rooms = saved.rooms; G.skills = saved.skills;
      stampRecordLikeLoad(G);   // b456: leave the live record agreeing with the restored G
    }
  }),

  /* Found while browser-verifying b225: the cooking screen memoises its
     rebuild on an activeKey, and noBurn was not in it — so a player who built
     or upgraded a Kitchen kept reading the OLD odds until some unrelated event
     happened to change the key. A live number behind a stale cache is worse
     than no number, so noBurn joined the key in both renderer twins. */
  () => tryRun('b225: building a Kitchen repaints the cooking screen (the risk is never stale)', () => {
    if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(true);
    const G = window.G;
    const E = window.HearthriseWorldEvents;          // NO CALENDAR — see above
    const prevTab = window.activeTab;
    const saved = { rooms: JSON.parse(JSON.stringify(G.rooms || {})), inv: G.inventory, skills: JSON.parse(JSON.stringify(G.skills || {})) };
    if (E) E._force({ daily: E.QUIET, weekly: E.QUIET });
    try {
      if (typeof window.renderSkillDetail !== 'function') return;
      G.rooms = {}; G.skills = Object.assign({}, G.skills, { cooking: 0 });
      G.inventory = Object.assign({}, G.inventory, { shrimp: 40 });
      // b456: the rung reaches the risk line through roomsOf — stamp each position.
      stampRecordLikeLoad(G);
      window.showTab('skills');
      window.renderSkillDetail('cooking');
      const camp = document.getElementById('skill-detail');
      assert(camp && /Burn risk: 25%/.test(camp.innerHTML), 'a camp cook should read 25% on screen');

      G.rooms = { kitchen: 1 };                 // built a Kitchen, nothing else changed
      stampRecordLikeLoad(G);
      window.renderSkillDetail('cooking');
      assert(/Burn risk: 12%/.test(document.getElementById('skill-detail').innerHTML),
        'the screen must repaint to 12% the moment a Kitchen exists');

      G.rooms = { kitchen: 3 };                 // Cast-Iron Range: burn-proof
      stampRecordLikeLoad(G);
      window.renderSkillDetail('cooking');
      assert(document.getElementById('skill-detail').innerHTML.indexOf('Burn risk:') === -1,
        'a burn-proof kitchen must leave no risk line on the screen at all');
    } finally {
      if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(null);
      if (E) E._force(null);
      G.rooms = saved.rooms; G.inventory = saved.inv; G.skills = saved.skills;
      stampRecordLikeLoad(G);   // b456: leave the live record agreeing with the restored G
      try { window.showTab(prevTab || 'profile'); } catch {}
    }
  }),

  () => tryRun('b225: an away cooking span burns on the same math, and reports it once', () => {
    /* b515 — SAME MOVE AS b204. The subject is the BURN, not the caller: an
       away bench must roll burns on the same odds a live one does, consume the
       raw input either way, and REPORT the count so the welcome-back card can
       say it. `simulateArtisanSpan` is the one implementation of all three, and
       it is the copy hr-accrue runs.
       The forced-burn rng (every roll a burn) is supplied to the span rather
       than installed globally with `setRng`, so this test can no longer leak a
       pinned stream into whatever runs after it — which the old fixture could,
       and did, whenever it threw before its finally. */
    const C = window.HearthriseCore;
    const rec = window.ARTISAN_RECIPES.cooking.filter((r) => r.output === 'cooked_shrimp')[0];
    assert(rec, 'the cooking catalogue no longer has a cooked_shrimp recipe');
    const r = awayArtisanSpan({
      targetId: rec.id, spanMs: 2 * 3600000,
      state: { skills: { cooking: 0 }, inventory: { shrimp: 30 }, rooms: {} },
      ctx: { rng: C.rngMod.rngFrom(() => 0) },     // every attempt burns
    });
    assert((r.paid.items.burnt_food || 0) === 30,
      'an away cooking span must burn on the same math, got ' + (r.paid.items.burnt_food || 0));
    assert(!(r.paid.items.cooked_shrimp > 0), 'a forced burn must not produce dishes away either');
    assert((r.paid.removed.shrimp || 0) === 30,
      'a burnt attempt still eats its raw input — got ' + (r.paid.removed.shrimp || 0) + ' consumed');
    assert(r.out.burnt === 30,
      'the span must REPORT its burns so the welcome-back card can say so, got ' + r.out.burnt);
    assert(r.out.produced === 0, 'the span reported dishes it did not produce: ' + r.out.produced);

    /* THE CONTROL: with a never-burn stream the same span produces 30 dishes and
       zero burns. Without it "burnt === 30" is satisfied by a bench that burns
       everything unconditionally. */
    const ctrl = awayArtisanSpan({
      targetId: rec.id, spanMs: 2 * 3600000,
      state: { skills: { cooking: 0 }, inventory: { shrimp: 30 }, rooms: {} },
      ctx: { rng: C.rngMod.rngFrom(() => 0.999999) },
    });
    assert(ctrl.out.burnt === 0 && ctrl.out.produced === 30,
      'CONTROL: a never-burn stream still burnt ' + ctrl.out.burnt + ' and produced ' + ctrl.out.produced);
  }),

  // b226 (Tyler): "No progress bar when cooking shrimp." The artisan tile grid
  // marked tiles active on G.activeArtisanRecipe — which startArtisan NEVER
  // writes (it writes activeSkill + skillTargetId) — so no artisan tile was
  // ever .active and lightUpdate had nothing to drive. Guard: starting a cook
  // marks its tile active, and the fill moves within a second.
  // (Rewritten SYNCHRONOUS after the login-flow agent caught the async form
  // being unfailable inside the sync runner: drive the lightUpdate path
  // deterministically instead of sleeping.)
  () => tryRun('b226: cooking marks its tile active and the progress bar moves', () => {
    if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(true);
    const snap = snapshotG();
    try {
      /* Stock BOTH sides: the factory literal is gone and the gate reads the mirror. */
      window.G.inventory.shrimp = (window.G.inventory.shrimp || 0) + 10;
      window.G._serverBag = Object.assign({}, window.G._serverBag, { shrimp: window.G.inventory.shrimp });
      window.showTab('skills');
      if (typeof window.openSkillDetail === 'function') window.openSkillDetail('cooking');
      window.startArtisan('cooking', 'cook_shrimp');
      assert(window.G.activeSkill === 'cooking' && window.G.skillTargetId === 'cook_shrimp',
        'startArtisan did not start the cook');
      const tile = document.querySelector('#skill-detail .act-tile.active, .act-tile.active');
      assert(tile, 'no artisan tile carries .active while cooking runs — the b226 predicate regressed');
      assert(/shrimp/i.test(tile.textContent), 'the wrong tile is marked active');
      const fill = tile.querySelector('.at-prog-fill');
      assert(fill, 'active tile has no progress fill element');
      // Drive the light-update path with a known progress value: a second
      // render with unchanged activeKey takes the lightUpdate branch, which
      // must write the fill width from G.skillProgress.
      window.G.skillProgress = 0.42;
      window.renderSkillDetail('cooking');
      window.renderSkillDetail('cooking');
      const f2 = (document.querySelector('.act-tile.active') || tile).querySelector('.at-prog-fill');
      assert(f2 && /^42(\.0)?%$/.test(f2.style.width || ''),
        'lightUpdate did not drive the fill from G.skillProgress (got "' + (f2 && f2.style.width) + '", want 42%)');
    } finally {
      if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(null);
      if (typeof window.stopSkill === 'function') try { window.stopSkill(); } catch (e) {}
      restoreG(snap);
      try { window.showTab('profile'); } catch (e) {}
    }
  }),


  // ══════════════════════════════════════════════════════════════════════
  // b226 — THE PACING RETUNE (docs/design/pacing-overhaul.md)
  //
  // Every test below fails without its fix. Together they pin the shape of
  // the retune rather than its dial settings: PACE.xp and PACE.actionMs are
  // meant to be re-tuned, so the tests STUB them and assert that the engine
  // moves — a suite that hardcoded 0.39 would have to be rewritten at every
  // re-anchor and would stop being evidence of anything.
  // ══════════════════════════════════════════════════════════════════════

  () => tryRun('b226: PACE.xp is wired at the ONE XP choke-point (a stub moves the grant)', () => {
    const G = window.G;
    const PACE = window.PACE;
    assert(PACE && typeof PACE.xp === 'number' && typeof PACE.actionMs === 'number',
      'window.PACE must publish { xp, actionMs }');
    const snap = snapshotG();
    const realXp = PACE.xp;
    // The dial is asserted by its EFFECT on the grant, not by comparing the
    // grant to a literal: the perk stack (renown allXP, rooms, presence) is a
    // legitimate multiplier on top, and a test that assumed it away would
    // fail the first time a rank was earned mid-suite.
    const grant = (n) => { xpZero('woodcutting'); window.addXp('woodcutting', n); return xpOf('woodcutting'); };
    try {
      G.restedXp = 0;
      G.skills = Object.assign({}, G.skills, { woodcutting: 0 });
      PACE.xp = 1;   const full = grant(100000);
      PACE.xp = 0.5; const half = grant(100000);
      PACE.xp = 0.1; const tenth = grant(100000);
      assert(full > 0, 'the grant must land somewhere');
      assert(Math.abs(full - 2 * half) <= 2,
        'halving PACE.xp must halve the grant (' + full + ' vs 2×' + half + ')');
      assert(Math.abs(full - 10 * tenth) <= 10,
        'a tenth of PACE.xp must be a tenth of the grant (' + full + ' vs 10×' + tenth + ')');
      // And the pure function is the contract the renderers read.
      PACE.xp = 0.25;
      assert(window.pacedXp('woodcutting', 400) === 100, 'pacedXp must apply the dial exactly');
    } finally { PACE.xp = realXp; restoreG(snap); }
  }),

  () => tryRun('b226: PACE.actionMs is wired at the action-interval choke-point', () => {
    const PACE = window.PACE;
    const real = PACE.actionMs;
    try {
      PACE.actionMs = 1;
      assert(window.pacedActionMs(3000) === 3000, 'actionMs = 1 must leave the duration alone');
      PACE.actionMs = 2;
      assert(window.pacedActionMs(3000) === 6000, 'actionMs = 2 must double the duration');
      PACE.actionMs = 0.0001;
      assert(window.pacedActionMs(3000) === 500, 'the 500ms floor must survive any dial value');
    } finally { PACE.actionMs = real; }
  }),

  () => tryRun('b226: startSkill stores the TOOL-ADJUSTED interval in G.skillMs (offline parity)', () => {
    // Regression: G.skillMs held the RAW `ms` while the live interval used the
    // tool/perk-adjusted one, and processOffline divides elapsed time by
    // G.skillMs — so a geared player gathered up to 30-40% slower offline than
    // online, invisibly, scaled by their own gear.
    const G = window.G;
    const snap = snapshotG();
    try {
      const tree = window.TREES.find((t) => t.id === 'normal_tree');
      G.rooms = {}; G.plotBuildings = [];
      G.inventory = Object.assign({}, G.inventory, { rune_axe: 1 });     // at least +25%
      G.skills = Object.assign({}, G.skills, { woodcutting: 0 });
      const speed = window.getBonus('gatherSpeed') + window.HearthriseTools.bestToolSpeed('woodcutting');
      assert(speed >= 0.25, 'the test player must own at least a rune axe, got ' + speed);
      window.startSkill('woodcutting', 'normal_tree', tree.ms);
      const expected = Math.max(500, Math.floor(window.pacedActionMs(tree.ms) * (1 - speed)));
      assert(G.skillMs === expected,
        'G.skillMs must be the adjusted interval ' + expected + ', got ' + G.skillMs);
      assert(G.skillMs < window.pacedActionMs(tree.ms),
        'an axe must make the STORED interval shorter than the unmodified one — this is the whole bug');
      assert(G.skillMs !== tree.ms, 'and it must never be the raw data value again');
    } finally { try { window.stopSkill(); } catch {} restoreG(snap); }
  }),

  () => tryRun('b226: farming is exempt from PACE.xp; crop XP is the ×14 grant', () => {
    const G = window.G;
    const PACE = window.PACE;
    const snap = snapshotG();
    const realXp = PACE.xp;
    try {
      G.restedXp = 0;
      PACE.xp = 0.01;                                   // a dial setting that would obliterate a paced skill
      G.skills = Object.assign({}, G.skills, { farming: 0, mining: 0 });
      window.addXp('farming', 100000);
      window.addXp('mining', 100000);
      assert(xpOf('farming') > xpOf('mining') * 50,
        'farming must ignore PACE.xp entirely (farming ' + xpOf('farming') + ' vs mining ' + xpOf('mining') + ')');
      assert(window.pacedXp('farming', 500) === 500, 'pacedXp must pass farming through untouched');
      assert(window.pacedXp('mining', 500) === 5, 'but every other skill goes through the dial');
      // Growth is wall-clock, so the ×14 has to live in the crop data.
      assert(window.CROPS.turnip.xp === 112, 'Turnip must grant the ×14 harvest XP (8 → 112)');
      assert(window.CROPS.moonbloom.xp === 2380, 'Moonbloom must grant the ×14 harvest XP (170 → 2380)');
    } finally { PACE.xp = realXp; restoreG(snap); }
  }),

  // ══════════════════════════════════════════════════════════════════════
  // PHASE 0 (server authority) — THE SHARED SIMULATION CORE
  //
  // src/core/* is the pure, DOM-free simulation that a Supabase Edge Function
  // will import verbatim, so that the server and the client can never hold two
  // different opinions about what the game's rules are. Node-side purity and
  // determinism are proved by tests/core-purity.mjs (which runs as a preflight
  // in tests/run-smoke.mjs, because no in-page test can prove "works without a
  // browser" from inside a browser).
  //
  // What these four tests prove is the half that only the running game can:
  // that the engine ACTUALLY DELEGATES. An extraction that leaves a second copy
  // behind in legacy.js is worse than no extraction — it looks done, and it
  // drifts silently. So each one reaches through the real player-facing entry
  // point and checks the core is the thing that answered.
  // ══════════════════════════════════════════════════════════════════════

  () => tryRun('Phase 0: the shared core is published and the engine delegates to it', () => {
    const C = window.HearthriseCore;
    assert(C && typeof C === 'object', 'window.HearthriseCore is missing — src/core-bridge.js did not load');
    for (const m of ['xp', 'combat', 'drops', 'pacing', 'rested', 'tools', 'farm', 'progression']) {
      assert(C[m] && typeof C[m] === 'object', 'the core is missing its ' + m + ' module');
    }
    assert(typeof C.rng.next === 'function' && typeof C.rng.int === 'function' && typeof C.rng.chance === 'function',
      'the session RNG must satisfy the next/int/chance contract');

    /* DELEGATION, NOT DUPLICATION. An ES module namespace is frozen, so the
       core's functions cannot be stubbed to prove the engine calls them — and
       "the two agree on 50 sample values" would pass happily on the day someone
       forks the implementation. So this is a STRUCTURAL claim, which is the one
       that actually catches a re-duplication: the engine's function body must
       be a one-line hand-off, containing no arithmetic of its own.

       If you are here because this failed: you did not break a test, you
       reintroduced a second copy of a rule the server also implements. */
    /* getEquipmentStats is deliberately absent: it is WRAPPED at runtime
       (companions.js adds the pet's contribution), so the outermost function is
       a wrapper and its source says nothing about the base. The base still
       delegates — and the bridge routes through window.getEquipmentStats
       precisely so the wrapper stays in the chain. */
    const delegates = ['levelFromXp', 'xpForLevel', 'xpToNext', 'xpPct', 'getLevel', 'getTotalLevel',
      'getCombatLevel', 'dropBand', 'speedClamp', 'pacedXp', 'pacedActionMs', 'actionRate',
      'goldFindMult', 'applyGoldFind', 'getWeaknessInfo', 'getArmorSetBonus',
      'getMonsterCombatRolls', 'getPlayerCombatRolls', 'accrueRestedXp', 'restedQuantum', 'restedCap'];
    for (const name of delegates) {
      const fn = window[name];
      assert(typeof fn === 'function', name + ' is missing from the engine');
      assert(/HearthriseCore/.test(String(fn)),
        name + '() no longer routes through the shared core — a second implementation is back in legacy.js');
    }
    /* And the answers are still real, so "it delegates" cannot be satisfied by
       delegating to nothing. */
    assert(window.levelFromXp(83) === 2 && window.levelFromXp(13034431) === 99, 'the XP curve answers wrongly');
    assert(window.dropBand(0.01) === 'rare' && window.dropBand(1) === 'always', 'the drop bands answer wrongly');
    assert(window.speedClamp(0.1) === 0.9, 'the speed fuse answers wrongly');
  }),

  /* b323 REGRESSION — the core readiness gate.
     Phase 0 moved ~50 simulation call sites in legacy.js onto a MODULE
     (core-bridge.js), which is deferred; legacy.js is a CLASSIC script and
     registers 21 top-level setTimeout/setInterval calls at parse time. On a
     cold load those fired into a coreless engine — six pageerrors from
     getCombatLevel/getLevel/getArmorSetBonus via renderMonsterList, applyAll
     and checkAchievements. src/core-ready.js parks boot-window timers and
     releases them when the core lands.

     This test can only assert the CONTRACT (the page it runs in is warm by
     definition). The cold load itself is proved by the cold-load guard in
     tests/run-smoke.mjs, which delays the /src/core/ responses and requires
     zero pageerrors. Both are needed: a warm-page guard would never have
     caught this, and a node-only guard leaves the API unpinned. */
  () => tryRun('b323: the core readiness gate is present, satisfied, and uninstalled', () => {
    assert(typeof window.whenCoreReady === 'function',
      'window.whenCoreReady is missing — src/core-ready.js did not load (boot timers are unprotected on a cold load)');
    assert(typeof window.isCoreReady === 'function' && window.isCoreReady() === true,
      'the gate never released — the engine would be running on parked timers');
    assert(window.HearthriseCoreReady && typeof window.HearthriseCoreReady.then === 'function',
      'window.HearthriseCoreReady must be thenable so module code can await the core');
    assert(!!window.HearthriseCore,
      'the gate released without a core — core-bridge.js failed to evaluate');

    /* whenCoreReady must run immediately once ready, not queue forever. */
    let got = null;
    window.whenCoreReady(function (c) { got = c; });
    assert(got === window.HearthriseCore, 'whenCoreReady did not fire synchronously after readiness');

    /* THE SELF-UNINSTALL. The shim is a boot-window device; leaving it in place
       would put a wrapper on every timer in the game forever. Once the core is
       up, scheduling must be the platform's own function again. */
    assert(/\[native code\]/.test(String(window.setTimeout)) && /\[native code\]/.test(String(window.setInterval)),
      'the readiness shim is still wrapping setTimeout/setInterval after the core came online');

    /* And a timer scheduled now must actually be a live platform timer. */
    const id = window.setTimeout(function () {}, 50);
    assert(id != null, 'setTimeout returned no id after the gate uninstalled');
    window.clearTimeout(id);
  }),

  () => tryRun('Phase 0: the balance constants are ONE object, not a client copy', () => {
    /* The failure this prevents is the one this codebase has already been
       burned by (main.js:36 unifyObject): two live copies of the same data,
       drifting apart in silence. Identity, not equality — an assertion that
       the numbers merely MATCH would pass on the day someone forks them. */
    const C = window.HearthriseCore;
    const pairs = [
      ['XP_TABLE', C.xp.XP_TABLE], ['COMBAT_BALANCE', C.combat.COMBAT_BALANCE],
      ['WEAPON_TYPES', C.combat.WEAPON_TYPES], ['WEAKNESS_BONUS', C.combat.WEAKNESS_BONUS],
      ['WEAPON_SPEED_MOD', C.combat.WEAPON_SPEED_MOD], ['ACC_DEF_MUL', C.combat.ACC_DEF_MUL],
      ['DROP_BAND_MAX', C.drops.DROP_BAND_MAX], ['PACE', C.pacing.PACE],
      ['SPEED_KEYS', C.pacing.SPEED_KEYS], ['COMBAT_XP_SKILLS', C.progression.COMBAT_XP_SKILLS],
      /* Phase A. ⚠ DELIBERATELY A LIST, not `Object.keys(C.bounty)`: deriving it found `BOUNTY_BOARD_TIER_BY_LEVEL` on window as a COPY of the core value rather than the core object — a real defect of this test's own class, owned by the bounty board and NOT fixed in the lane that found it (widening the pin here would red the suite for an unrelated lane). CONFLICTS.md 2026-09-12. */
      ['COMBAT_STYLES', C.styles.COMBAT_STYLES],
      ['BOUNTY_KILL_COUNTS', C.bounty.BOUNTY_KILL_COUNTS], ['BOUNTY_BASE_REWARDS', C.bounty.BOUNTY_BASE_REWARDS],
      ['BOUNTY_TYPE_MULT', C.bounty.BOUNTY_TYPE_MULT], ['BOUNTY_DIFFICULTY_MULT', C.bounty.BOUNTY_DIFFICULTY_MULT],
      ['BOUNTY_TYPE_LABEL', C.bounty.BOUNTY_TYPE_LABEL], ['BOUNTY_DIFFICULTY_LABEL', C.bounty.BOUNTY_DIFFICULTY_LABEL],
    ];
    for (const [name, coreValue] of pairs) {
      assert(window[name] === coreValue, 'window.' + name + ' is a COPY of the core value, not the core value');
    }
    /* Scalars cannot share identity, so they are pinned by value. */
    assert(window.SPEED_FUSE === C.pacing.SPEED_FUSE, 'SPEED_FUSE drifted from the core');
    assert(window.NEUTRAL_DROP_BONUS === C.combat.NEUTRAL_DROP_BONUS, 'NEUTRAL_DROP_BONUS drifted from the core');
    assert(window.RESTED_CHARGE_MS === C.rested.RESTED_CHARGE_MS, 'RESTED_CHARGE_MS drifted from the core');
    assert(window.RESTED_CAP === C.rested.RESTED_CAP, 'RESTED_CAP drifted from the core');
    assert(window.RESTED_QUANTUM_CAP === C.rested.RESTED_QUANTUM_CAP, 'RESTED_QUANTUM_CAP drifted from the core');
    /* And the curve is still the real one, so "one identity" cannot be
       satisfied by both sides being wrong together. */
    assert(window.XP_TABLE.length === 99 && window.XP_TABLE[98] === 13034431,
      'the XP curve is no longer the 99-rung curve the game is tuned around');
  }),

  () => tryRun('Phase 0: combat is REPLAYABLE — the same seed fights the same fight', () => {
    /* This is the property the whole server-accrual model rests on: given a
       seed derived from (user_id, slot, accrued_to), the server can re-run an
       absence and prove what it paid. If any roll reaches Math.random() again,
       the two runs below diverge and this fails. */
    const C = window.HearthriseCore;
    const snap = snapshotG();
    const G = window.G;
    const runFight = (seed) => {
      C.reseed(seed);
      restoreG(snap);
      G.skills = Object.assign({}, G.skills, { attack: 50000, strength: 50000, hitpoints: 200000, defense: 50000 });
      G.playerHp = G.playerMaxHp = 200;
      G.activeMonster = 'goblin';
      const m = window.MONSTERS.goblin;
      G.monsterHp = G.monsterMaxHp = m.hp;
      G.combatLog = [];
      G.gold = 0;
      const swings = [];
      for (let i = 0; i < 40; i++) {
        const rolls = window.getPlayerCombatRolls(m);
        swings.push(C.combat.rollAttack(C.rng, rolls.accuracy, rolls.maxHit));
      }
      const loot = C.drops.rollDropTable(m.drops, { dropMult: 1 }, C.rng);
      return swings.join(',') + '|' + Object.keys(loot.dropped).sort().join(',');
    };
    try {
      const a = runFight(20260810);
      const b = runFight(20260810);
      const c = runFight(20260811);
      assert(a === b, 'the same seed produced a different fight — combat is not replayable\n  ' + a + '\n  ' + b);
      assert(a !== c, 'a different seed produced an identical fight — the seed is being ignored');
      assert(/[1-9]/.test(a), 'the replay landed no hits at all, so it proves nothing');
    } finally {
      C.randomSeed();          // back to an unpredictable session stream
      restoreG(snap);
    }
  }),

  /* ══ PHASE A — the rest of the simulation core ═══════════════════════════
     Three things left the monolith in this pass: doArtisanAction's production
     step, bounty-board generation, and the killMonster/combatTick XP routing
     table. Each of the three tests below guards a different property, and
     between them they are the contract:
       1. the engine DELEGATES (no second implementation crept back);
       2. the extracted maths is REPLAYABLE from a seed;
       3. the delegation is BEHAVIOUR-PRESERVING at runtime, in the browser,
          through the real wrapped functions — not just in Node.            */

  () => tryRun('Phase A: the artisan bench, bounty board and XP routing all delegate to the core', () => {
    const C = window.HearthriseCore;
    assert(C.artisan && C.bounty && C.styles, 'the Phase A core modules are not published on HearthriseCore');

    /* Only the functions the engine actually publishes — getInputs/hasInputs/
       gateOk live inside the artisan block's scope and are not reachable from
       here, but doArtisanAction is the single caller of all three and it is
       checked below. */
    const delegates = ['isMaterialOutput', 'cookBurnChance',
      'doArtisanAction', 'generateBountyBoard', 'getActiveCombatStyle'];
    for (const name of delegates) {
      const fn = window[name];
      assert(typeof fn === 'function', name + ' is missing from the engine');
      assert(/HearthriseCore/.test(String(fn)),
        name + '() no longer routes through the shared core — a second implementation is back in legacy.js');
    }

    /* The three bare Math.random() calls the extraction existed to remove.
       A source scan is crude but it is the only thing that catches a
       re-introduction, and re-introducing one silently un-replays every
       future server-side accrual of that bench. */
    const src = String(window.doArtisanAction);
    assert(!/Math\s*\.\s*random/.test(src),
      'doArtisanAction reaches for Math.random again — the craftSave / burn / yield rolls must take the injected RNG');

    /* The cooking-fire module is now a face over the core, not a second copy. */
    const CF = window.HearthriseCookingFire;
    assert(CF.BASE === C.artisan.BURN_BASE, 'HearthriseCookingFire.BASE is a COPY of the core burn rate');
    assert(CF.KITCHEN_NO_BURN === C.artisan.KITCHEN_NO_BURN, 'the Kitchen noBurn ladder exists twice');
    assert(CF.BURNT_ITEM === C.artisan.BURNT_ITEM, 'the burnt-food item id exists twice');
  }),

  () => tryRun('Phase A: the bounty board is REPLAYABLE — the same seed offers the same three bounties', () => {
    /* Before the extraction every bounty id carried Date.now() and a bare
       Math.random(), so no two generations could ever agree. That made the
       board impossible to generate server-side and prove. */
    const C = window.HearthriseCore;
    const snap = snapshotG();
    const G = window.G;
    const gen = (seed) => {
      C.reseed(seed);
      /* Pin the clock too: the id embeds it, and this test is about the
         RANDOM half being seeded, not about freezing time. */
      const realNow = Date.now;
      Date.now = () => 1700000000000;
      try {
        return JSON.stringify(window.generateBountyBoard());
      } finally { Date.now = realNow; }
    };
    try {
      window.ensureBountyState();
      const a = gen(777001);
      const b = gen(777001);
      const c = gen(777002);
      assert(a === b, 'the same seed produced a different board — bounty generation is not replayable\n  ' + a + '\n  ' + b);
      assert(a !== c, 'a different seed produced the same board — the seed is being ignored');
      const board = JSON.parse(a);
      assert(board.length === 3, 'the board must always offer three bounties, got ' + board.length);
      for (const bt of board) {
        assert(bt.required > 0, 'a bounty with no target count would complete instantly');
        assert(window.MONSTERS[bt.target], 'a bounty targets a monster that does not exist: ' + bt.target);
        assert(!window.MONSTERS[bt.target].boss, 'a board bounty must never target a boss');
        assert(bt.rewards && bt.rewards.marks >= 1, 'every bounty must pay at least one Mark');
      }
      assert(G.bountyHunter.boardGeneratedAt === 1700000000000,
        'generateBountyBoard must still stamp boardGeneratedAt — the reroll timer reads it');
    } finally {
      C.randomSeed();
      restoreG(snap);
    }
  }),

  () => tryRun('b497: bounty difficulty scales the KILL COUNT, and the pay-per-kill rises with it', () => {
    /* THE b489 INVERSION. bountyCount read (type, tier) and nothing else, so
       the board's EASY slot and its NORMAL slot drew from the SAME range while
       bountyRewards already paid easy 0.85x. Identical work, less gold: "Easy"
       was strictly the best-paying contract on the board.

       This asserts the RULE (a monotonic gold-per-kill ladder) and the two
       numbers the ruling actually names, not a table nobody would notice
       drifting. The SQL half — hr_bounty_kill_range(tier, difficulty), which
       CLAMPS what the server will accept — is bound to these same values by
       tests/bounty-drift.mjs and driven against a real Postgres by
       tests/bounty-difficulty-count.mjs; a client-only change would have the
       board offer 72 kills and the turn-in demand 80. */
    const B = window.HearthriseCore.bounty;
    assert(B && typeof B.bountyCountRange === 'function', 'the bounty core is not published');

    const t1 = ['easy', 'normal', 'hard', 'elite'].map((d) => {
      const r = B.bountyCountRange('cull', 1, 2, d);
      return { d, lo: r[0], hi: r[1], gpk: B.bountyRewards(1, 'cull', d).gold / ((r[0] + r[1]) / 2) };
    });
    assert(t1[0].lo === 72 && t1[0].hi === 108,
      'tier-1 EASY draws ' + t1[0].lo + '-' + t1[0].hi + ', the ruling says 72-108');
    assert(t1[1].lo === 80 && t1[1].hi === 120,
      'tier-1 NORMAL must be the identity (80-120), got ' + t1[1].lo + '-' + t1[1].hi);
    assert(t1[3].lo === 120 && t1[3].hi === 180,
      'tier-1 ELITE draws ' + t1[3].lo + '-' + t1[3].hi + ', the ruling says 120-180');

    for (let t = 1; t <= 6; t++) {
      let prev = null;
      for (const d of ['easy', 'normal', 'hard', 'elite']) {
        const r = B.bountyCountRange('cull', t, 2, d);
        const gpk = B.bountyRewards(t, 'cull', d).gold / ((r[0] + r[1]) / 2);
        /* `prev` is null on the first difficulty of each tier, and an assert
           MESSAGE is evaluated eagerly in JavaScript — `prev.toFixed()` here
           threw on every run rather than asserting anything. Caught by the
           suite itself on the first assembled run, which is the only reason
           this monotonicity check is real. */
        assert(prev === null || gpk > prev,
          'tier ' + t + ': gold-per-kill is not monotonic — ' + d + ' pays ' + gpk.toFixed(3)
          + ' and the easier difficulty paid ' + (prev === null ? 'n/a' : prev.toFixed(3))
          + '. The b489 inversion ("Easy is the best contract on the board") is back.');
        prev = gpk;
      }
    }

    /* AN ABSENT DIFFICULTY IS THE IDENTITY. Every call site written before this
       ruling must keep today's numbers exactly rather than silently drawing a
       different contract — the failure that turns a UX ruling into an economy
       change. (The SERVER does the opposite and fails CLOSED; the asymmetry is
       deliberate and is asserted in bounty-difficulty-count.mjs.) */
    const bare = B.bountyCountRange('cull', 3, 2);
    assert(bare[0] === B.BOUNTY_KILL_COUNTS.cull[3][0] && bare[1] === B.BOUNTY_KILL_COUNTS.cull[3][1],
      'a call with no difficulty no longer returns the tier table: ' + bare.join('-'));
    assert(B.bountyCountMult('nonsense') === 1 && B.bountyCountMult(undefined) === 1,
      'an unknown difficulty must be the identity on the client');

    /* THE FIRST-CONTRACT BRACKET SCALES TOO — the board's first slot is always
       EASY, and the server clamps against the scaled floor. */
    const first = B.bountyCountRange('cull', 1, 1, 'easy');
    assert(first[0] === 14 && first[1] === 23,
      'the b487 first-contract bracket did not scale for the easy slot: ' + first.join('-'));

    /* THE SEEDED STREAM IS UNCHANGED. rng.int consumes exactly one draw per
       call whatever range it is handed, so scaling the RANGE (rather than the
       drawn value) leaves generateBountyBoard's draw order and count identical
       — the property the replayability test above depends on. */
    const C = window.HearthriseCore;
    C.reseed(497001);
    const a = B.bountyCount('cull', 1, C.rng, 2, 'hard');
    C.reseed(497001);
    const b = B.bountyCount('cull', 1, C.rng, 2, 'easy');
    C.randomSeed();
    assert(a >= 96 && a <= 144, 'a hard tier-1 draw landed outside 96-144: ' + a);
    assert(b >= 72 && b <= 108, 'an easy tier-1 draw landed outside 72-108: ' + b);
  }),

  () => tryRun('b497/F2: the accept ENVELOPE becomes the contract (the dead-bounty class)', () => {
    /* THE GAP THIS COVERS, stated because it is the whole point of the test
       existing HERE rather than beside the other two bounty guards:
       tests/bounty-drift.mjs and tests/bounty-difficulty-count.mjs bind SQL to
       src/core — FILE TO FILE. Neither can see whether the server's answer ever
       reaches client state. `hr_accept_bounty` CLAMPS the client's `required`
       and returns what it actually wrote; until b497 nothing read that, so a
       disagreement was invisible until the turn-in refused forever with the bar
       full. Boards persist across a deploy (ensureBountyState only regenerates
       an EMPTY board), so a `hard` slot drawn pre-b497 carries a required in
       [80,95] and the post-deploy server demands 96. */
    const snap = snapshotG();
    const G = window.G;
    try {
      window.ensureBountyState();
      assert(typeof window.hrAdoptAcceptedBounty === 'function',
        'hrAdoptAcceptedBounty is not published — the accept envelope is unread again');
      const mk = () => ({ id: 'cull_goblin_1700_7', type: 'cull', target: 'goblin',
        difficulty: 'hard', tier: 1, progress: 0, required: 88,
        rewards: { gold: 420, marks: 8, xp: 59 } });
      /* `env` builds the SUCCESS envelope only — the shape
         hr_accept_bounty__ungated's final jsonb_build_object actually returns.
         ⚠ IT MUST NEVER BE USED TO BUILD A REFUSAL (Security F7, and the third
         time this program has been bitten by a fixture assembled from a base
         object instead of from the producer's real output): NOT ONE of the
         twelve refusal envelopes the system can emit carries `bounty_id`.
         `Object.assign({…, bounty_id}, {ok:false})` therefore produces a shape
         the server cannot make, and a refusal test built from it tests the
         fixture. `refusal()` below is the real vocabulary. */
      const env = (over) => Object.assign({ ok: true, bounty_id: 'cull_goblin_1700_7',
        target: 'goblin', tier: 1, required: 96, gold: 420, marks: 8, xp: 59 }, over || {});
      /* THE REAL REFUSAL SHAPES, transcribed from the producers — the server's
         hr_accept_bounty / __ungated bodies and goal-claim.js `call()`. No
         bounty_id in any of them; `unknown_monster` carries a target and still
         no id. Each entry is exactly what the client would receive. */
      const REFUSALS = [
        { ok: false, error: 'rate_limited' },                                   // the rate wrapper
        { ok: false, error: 'tier_locked', tier: 3, unlocked_tier: 1, combat_level: 8 },
        { ok: false, error: 'bad_difficulty', difficulty: 'elite', tier: 1 },
        { ok: false, error: 'no_character', slot: 0 },
        { ok: false, error: 'not_signed_in' },
        { ok: false, error: 'type_not_server_verifiable', type: 'proof' },
        { ok: false, error: 'unknown_monster', target: 'goblin' },              // target, no id
        { ok: false, error: 'network' },                                        // goal-claim.js call()
        { ok: false, error: 'bad_response', status: 500 },
        { ok: false, error: 'rpc_missing' },
      ];

      // ── 1. THE DEAD CASE. Client drew 88; the server stored 96.
      G.bountyHunter.active = mk();
      const r1 = window.hrAdoptAcceptedBounty(env());
      assert(r1.adopted === true, 'the envelope was not adopted: ' + JSON.stringify(r1));
      assert(G.bountyHunter.active.required === 96,
        'the client still shows ' + G.bountyHunter.active.required + ' kills while the server '
        + 'demands 96 — the bar fills, the turn-in refuses, and the failure is silent');
      assert(G.bountyHunter.active._serverContract === true,
        'an adopted contract is not marked as server-owned');

      // ── 2. REWARD DRIFT closes on the same path. A player shown 420 gold and
      //      paid 300 is the same defect in the other currency.
      G.bountyHunter.active = mk();
      window.hrAdoptAcceptedBounty(env({ gold: 300, marks: 5, xp: 38, tier: 2 }));
      const rw = G.bountyHunter.active.rewards;
      assert(rw.gold === 300 && rw.marks === 5 && rw.xp === 38,
        'the rewards were not adopted: ' + JSON.stringify(rw));
      assert(G.bountyHunter.active.tier === 2, 'the tier was not adopted');

      // ── 3. AN AGREEING ENVELOPE CHANGES NOTHING (the common case). A repaint
      //      on every accept would churn the DOM for no reason.
      G.bountyHunter.active = mk();
      const r3 = window.hrAdoptAcceptedBounty(env({ required: 88 }));
      assert(r3.adopted === true && r3.changed.length === 0,
        'an agreeing envelope reported changes: ' + JSON.stringify(r3.changed));

      /* ── 4. EVERY REAL REFUSAL adopts NOTHING and stops being silent. There
            is no active_bounty row, so the contract can never settle.
            ⚠ THIS IS THE ASSERTION THAT WOULD HAVE CAUGHT F7, and it only
            works because the fixtures are the PRODUCER'S shapes. The version
            in 66709733 used `env({ok:false, error:'tier_locked'})` — a
            success base with a `bounty_id` bolted on — which the server cannot
            emit. It passed against a refusal branch that was DEAD CODE: with
            the pair check ahead of the ok check, a real (id-less) refusal
            returned `mismatch` and never reached it. Driving all ten shapes
            also means a future refusal that grows an id cannot silently
            re-order this. */
      for (const ref of REFUSALS) {
        assert(!('bounty_id' in ref),
          'a REFUSAL fixture carries bounty_id — no producer emits that, so this test would be '
          + 'testing the fixture (the F7 defect, re-introduced): ' + JSON.stringify(ref));
        G.bountyHunter.active = mk();
        const r = window.hrAdoptAcceptedBounty(ref);
        assert(r.adopted === false && r.reason === 'refused:' + ref.error,
          'the refusal "' + ref.error + '" was not reported as a refusal — got '
          + JSON.stringify(r) + '. If this reads "mismatch", the ok check has been moved back '
          + 'behind the id/target pair and the whole branch is dead again (F7).');
        assert(G.bountyHunter.active.required === 88 && G.bountyHunter.active.tier === 1,
          'the refusal "' + ref.error + '" moved the contract');
        assert(G.bountyHunter.active._acceptError === ref.error,
          'the refusal "' + ref.error + '" was swallowed — nothing records that this bounty is dead');
      }
      /* The two a player meets by ordinary play, named so a future reviewer can
         see the reachability claim rather than infer it. */
      assert(REFUSALS.some((r) => r.error === 'tier_locked')
        && REFUSALS.some((r) => r.error === 'rate_limited'),
      'the two player-reachable refusals are no longer covered');

      // ── 5. A LATE REPLY FOR AN ABANDONED CONTRACT touches nothing. This is
      //      the race the identity guard exists for: writing a stale `required`
      //      onto a live bounty would MANUFACTURE the desync being fixed.
      const sent = mk();
      G.bountyHunter.active = mk();            // a different object, same fields
      const r5 = window.hrAdoptAcceptedBounty(env({ required: 144 }), sent);
      assert(r5.reason === 'superseded' && G.bountyHunter.active.required === 88,
        'a reply for a superseded contract was adopted: ' + JSON.stringify(r5));

      /* ── 6. A SUCCESS REPLY FOR A DIFFERENT BOUNTY is refused on the pair.
            PRODUCER-REAL: the server echoes the p_bounty_id it was given, so
            this is literally the envelope from the player's OTHER accept
            arriving late. */
      G.bountyHunter.active = mk();
      const r6 = window.hrAdoptAcceptedBounty(env({ bounty_id: 'cull_wolf_1_2', required: 144 }));
      assert(r6.reason === 'mismatch' && G.bountyHunter.active.required === 88,
        'a reply for another bounty was adopted: ' + JSON.stringify(r6));
      /* ⚠ SYNTHETIC, and labelled so nobody reads it as a producer shape: the
         server echoes p_bounty_id and p_target from the SAME request, so an
         id that matches while the target does not cannot occur in the wild.
         It exists to prove the TARGET half of the pair check is present at
         all — a guard probe, not a scenario. */
      const r6b = window.hrAdoptAcceptedBounty(env({ target: 'wolf', required: 144 }));
      assert(r6b.reason === 'mismatch', 'the TARGET half of the identity check is missing');

      /* ── 7. A MALFORMED FIELD leaves the client's value alone rather than
            stamping NaN onto the bar the player is watching.
            ⚠ ALSO SYNTHETIC: no producer emits `required: null` or a
            non-numeric gold. This is a defensive probe of the re-derive step,
            deliberately hostile, and is not a claim about what the server
            sends. */
      G.bountyHunter.active = mk();
      window.hrAdoptAcceptedBounty(env({ required: null, gold: 'lots' }));
      assert(G.bountyHunter.active.required === 88 && G.bountyHunter.active.rewards.gold === 420,
        'a malformed envelope corrupted the contract: '
        + JSON.stringify(G.bountyHunter.active.rewards));
    } finally { restoreG(snap); }
  }),

  () => tryRun('Phase A: kill XP is routed by the SAME table the live hit uses (and BotD scales it)', () => {
    /* The routing table used to be four copies of one walk. The away loop
       omitting the KILL half of it is the ~21%-of-combat-XP hole named in
       docs/design/away-time-ruling.md — this test pins the route so the
       accrual engine has something to build parity against. */
    const C = window.HearthriseCore;
    const snap = snapshotG();
    const G = window.G;
    try {
      G.equipment = Object.assign({}, G.equipment);
      delete G.equipment.weapon;                  // bare hands -> sword family
      G.combatStyle = Object.assign({}, G.combatStyle, { sword: 'aggressive' });
      const style = window.getActiveCombatStyle();
      assert(style === C.styles.COMBAT_STYLES.sword.aggressive,
        'getActiveCombatStyle returned a style object that is not IN the core table');

      const hit = C.styles.hitXpRoute(style, 5);
      assert(hit.length === 2 && hit[0].skill === 'strength' && hit[0].amount === 20,
        'an Aggressive hit for 5 must pay 20 Strength XP, got ' + JSON.stringify(hit));
      assert(hit[1].skill === 'hitpoints' && hit[1].amount === 6,
        'every landed hit pays floor(dmg x 1.33) Hitpoints XP, got ' + JSON.stringify(hit[1]));

      /* The kill route, and the Boss-of-the-Day multiplier the ruling says
         must also apply away. */
      const plain = C.styles.killXpRoute(style, 100, 1);
      const featured = C.styles.killXpRoute(style, 100, 1.25);
      assert(plain[0].amount === 100 && featured[0].amount === 125,
        'the featured-boss combat-XP lift is no longer applied inside the kill route');

      /* And a real kill actually moves the routed skill, through the real
         (wrapped) addXp — the property a pure-core test cannot make. */
      G.skills = Object.assign({}, G.skills, { strength: 0, attack: 0 });
      G.activeMonster = 'goblin';
      const before = xpOf('strength');
      const beforeAtk = xpOf('attack');
      window.killMonster(window.MONSTERS.goblin);
      assert(xpOf('strength') > before, 'an Aggressive kill paid no Strength XP');
      assert((G.skills.attack || 0) === beforeAtk, 'an Aggressive kill must not pay Attack XP');
    } finally {
      restoreG(snap);
    }
  }),

  () => tryRun('Phase 0: farm growth is derived from the clock the CALLER passes', () => {
    /* Farming is the domain closest to server-ready: readiness is
       `now >= plantedAt + growth`, with no stored counter and no cron. The
       server will call this same function with the DATABASE's clock, so the
       core must never consult one of its own — and the 2x invariant must hold
       against any watering array, including a forged one. */
    const F = window.HearthriseCore.farm;
    const t0 = 1700000000000;
    const dry = { cropId: 'turnip', plantedAt: t0, waterings: [] };
    assert(Math.abs(F.growthHours(dry, t0 + 7200000) - 2) < 1e-9, 'an unwatered crop must grow 1 hour per hour');
    const wet = { cropId: 'turnip', plantedAt: t0, waterings: [t0] };
    assert(Math.abs(F.growthHours(wet, t0 + 3600000) - 2) < 1e-9, 'a watered crop must grow 2 hours per hour');
    const forged = { cropId: 'turnip', plantedAt: t0, waterings: [t0, t0, t0, t0, t0, t0, t0, t0] };
    assert(F.growthHours(forged, t0 + 3600000) <= 2 + 1e-9,
      'a forged waterings array beat the hard 2x cap — this is the whole anti-abuse invariant');
    assert(F.growthHours(dry, t0 - 1) === 0, 'a clock behind plantedAt must grant no growth');
    /* And the client wrapper still answers with the wall clock. */
    assert(typeof window.HearthriseFarm.growthHours === 'function', 'the HearthriseFarm API must survive the port');
    assert(window.HearthriseFarm.MAX_LEVEL === F.MAX_PLOT_LEVEL, 'the plot ladder is a copy again');
    assert(window.HearthriseFarm.KILL_DEED_CHANCE === F.KILL_DEED_CHANCE, 'the deed chance is a copy again');
  }),

  // ══════════════════════════════════════════════════════════════════════
  // b227 — THE CALENDAR IS THE ONLINE BONUS
  // (DECISIONS 2026-08-09 "Presence rework"; replaces b226's flat ×1.12)
  //
  // The b226 test below this comment used to assert `presence multiplies the
  // grant by 1.12`. That contract was retired by the product owner, so the
  // test is rewritten to the NEW contract rather than loosened: being here is
  // now a GATE (worth nothing by itself) and the blessing is what it gates.
  // The rewritten pair is deliberately stricter than the original — an
  // exact-equality "an online player with no blessing earns EXACTLY base"
  // is a stronger statement than the old ratio check ever made.
  //
  // b229 — "THE TAB SHOULDN'T NEED TO BE OPEN, THEY JUST NEED TO BE ONLINE"
  // Tyler narrowed the gate to SESSION-ONLINE: game open + connected. The
  // tests below drive that through the real connectivity oracle
  // (HearthriseNetStatus) and, where they used to drive the idle clock, they
  // now drive the retired *visibility* seam on purpose — to prove it no
  // longer moves anything. The offline-replay latch tests are untouched in
  // substance: the latch, not the gate, is what holds the offline boundary.
  // ══════════════════════════════════════════════════════════════════════

  () => tryRun('b229: being online pays NOTHING by itself — the flat ×1.12 is gone', () => {
    const G = window.G;
    const P = window.HearthrisePresence;
    const NS = window.HearthriseNetStatus;
    assert(P && typeof P.isOnline === 'function', 'window.HearthrisePresence must publish isOnline()');
    assert(P.MULT === undefined && typeof P.mult !== 'function',
      'the flat presence multiplier must be removed from the API, not merely set to 1');
    // b229: the attention-era API is GONE, not deprecated — nothing may ask
    // "have they clicked lately?" any more, because that is not the rule.
    assert(typeof P.isPresent !== 'function', 'isPresent() must be retired, not left as an alias');
    assert(P.IDLE_MS === undefined && typeof P._setLastInput !== 'function',
      'the idle clock and its test seam must be gone with it');
    const E = window.HearthriseWorldEvents;
    const snap = snapshotG();
    try {
      G.rooms = {}; G.equipment = Object.fromEntries(Object.keys(G.equipment || {}).map((k) => [k, null]));
      G.restedXp = 0; G.plotBuildings = [];
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree'; G.activeMonster = null;
      // Silence the calendar so this measures THE GATE ALONE, whatever today's
      // blessing happens to be. Asserting against a date-derived pool pick
      // would make the test's meaning drift with the wall clock.
      E._force({ daily: E.QUIET, weekly: E.QUIET });

      const grant = () => { xpZero('woodcutting'); window.addXp('woodcutting', 10000); return xpOf('woodcutting'); };
      G.skills = Object.assign({}, G.skills, { woodcutting: 0 });

      NS.setMode('offline');
      assert(P.isOnline() === false, 'a genuinely disconnected session is not online');
      const away = grant();
      NS.setMode('ok');
      assert(P.isOnline() === true, 'a connected session IS online');
      const here = grant();

      // The headline assertion, and it is an exact equality rather than the
      // ratio b226 checked: with no blessing live, being here is worth
      // exactly nothing. That is what "the flat ×1.12 is gone" means.
      assert(away > 0, 'the grant must land somewhere for the comparison to mean anything');
      assert(here === away,
        'an online grant with no blessing must EQUAL an offline one (' + away + ' vs ' + here + ')');
      // …and the rate readouts must quote the same thing.
      const tree = window.TREES.find((t) => t.id === 'normal_tree');
      const rHere = window.actionRate('woodcutting', tree).xpPerAction;
      NS.setMode('offline');
      const rAway = window.actionRate('woodcutting', tree).xpPerAction;
      NS.setMode('ok');
      assert(rHere === rAway, 'actionRate must not carry a presence multiplier either');
    } finally {
      E._force(null);
      NS.setMode('ok'); restoreG(snap);
    }
  }),

  () => tryRun('b229: the blessing rides INSIDE getBonus and switches with CONNECTIVITY', () => {
    const G = window.G;
    const E = window.HearthriseWorldEvents;
    const NS = window.HearthriseNetStatus;
    const snap = snapshotG();
    try {
      G.rooms = {}; G.plotBuildings = []; G.restedXp = 0;
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree'; G.activeMonster = null;

      const keys = Object.keys(Object.assign({}, E.daily().bonus, E.weekly().bonus));
      assert(keys.length > 0, "today's calendar must grant something");

      const online = {}; keys.forEach((k) => { online[k] = window.getBonus(k); });
      NS.setMode('offline');
      const dropped = {}; keys.forEach((k) => { dropped[k] = window.getBonus(k); });
      NS.setMode('ok');

      keys.forEach((k) => {
        assert(Math.abs((online[k] - dropped[k]) - E.bonusFor(k)) < 1e-9,
          'getBonus("' + k + '") must rise by exactly the blessing when the session is online (' +
          dropped[k] + ' → ' + online[k] + ', blessing ' + E.bonusFor(k) + ')');
      });

      // A SLOW cloud is not an absent player. 'degraded' (three Supabase 5xx)
      // means our backend is struggling; charging the player for our outage
      // would be the wrong half of the rule.
      NS.setMode('degraded');
      keys.forEach((k) => {
        assert(Math.abs(window.getBonus(k) - online[k]) < 1e-9,
          'a degraded cloud must not revoke the ' + k + ' blessing — the player never left');
      });
      NS.setMode('ok');

      /* The budget still has to hold with a blessing live — the whole point of
         putting the blessing INSIDE the additive channel is that the clamp can
         see it. A blessing hidden outside the budget is an unbudgeted bonus.
         b228: the bound is the absolute peak, 0.30, not the retired 0.60. */
      assert(window.getBonus('allXP') <= window.HearthrisePowerBudget.TOTAL_CAP + 1e-9,
        'the absolute allXP peak must hold with the blessing live, got ' + window.getBonus('allXP'));
    } finally { NS.setMode('ok'); restoreG(snap); }
  }),

  () => tryRun('b229: a hidden, unfocused, untouched tab is STILL blessed — the tab need not be open', () => {
    // Tyler's actual sentence, as an executable statement: "The tab shouldn't
    // need to be open, they just need to be online." This drives the exact
    // seams the retired gate was built on — document.visibilityState and
    // document.hidden — and proves they no longer move the blessing. If a
    // future refactor reintroduces an attention check, this fails.
    const G = window.G;
    const P = window.HearthrisePresence;
    const E = window.HearthriseWorldEvents;
    const snap = snapshotG();
    const dVis = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    const dHid = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    try {
      G.rooms = {}; G.plotBuildings = []; G.restedXp = 0;
      G.equipment = Object.fromEntries(Object.keys(G.equipment || {}).map((k) => [k, null]));
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree'; G.activeMonster = null;
      // Both halves of a blessing at once: the XP side (read live inside addXp)
      // and the SPEED side (re-derived by activityIntervalMs). If backgrounding
      // moved either one, one of the two equalities below breaks.
      E._force({
        daily: { id: 'test_scholar', name: 'Test Scholar', desc: '+15% all XP · +25% gather speed',
                 bonus: { allXP: 0.15, gatherSpeed: 0.25 } },
        weekly: E.QUIET,
      });
      G.skills = Object.assign({}, G.skills, { woodcutting: 0 });
      const grant = () => { xpZero('woodcutting'); window.addXp('woodcutting', 10000); return xpOf('woodcutting'); };
      const visible = grant();
      const visibleMs = window.activityIntervalMs();

      // Background the tab for real, as far as every API the old gate read.
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      assert(document.visibilityState === 'hidden', 'the seam must actually be driven for this test to mean anything');

      assert(P.isOnline() === true, 'a backgrounded tab is still an online session');
      assert(P.blessingsApply() === true, 'a backgrounded tab must still be blessed');
      assert(E.isActive() === true, 'the world-events layer must agree');
      assert(E.liveBonusFor('allXP') === 0.15, 'and must still PAY the blessing, got ' + E.liveBonusFor('allXP'));
      const hiddenGrant = grant();
      const hiddenMs = window.activityIntervalMs();
      assert(hiddenGrant === visible,
        'a hidden-tab grant must equal a visible-tab grant (' + visible + ' vs ' + hiddenGrant + ')');
      assert(hiddenMs === visibleMs,
        'and the speed side must not change either (' + visibleMs + ' vs ' + hiddenMs + ')');

      // The live hint must not call this player idle — there is no idle state.
      const note = window.HearthriseBlessingNote();
      assert(note.indexOf('idle') < 0, 'the note must not scold a backgrounded tab as idle, got: ' + note);
      assert(note.indexOf('while online') >= 0, 'the note must state the real rule, got: ' + note); // Tyler's exact words
    } finally {
      E._force(null);
      if (dVis) Object.defineProperty(document, 'visibilityState', dVis); else delete document.visibilityState;
      if (dHid) Object.defineProperty(document, 'hidden', dHid); else delete document.hidden;
      try { document.dispatchEvent(new Event('visibilitychange')); } catch (e) {}
      restoreG(snap);
    }
  }),

  () => tryRunAsync('b230: returning to a backgrounded tab ASKS for the frozen span (paione — mobile "logs off, stops collecting ore")', async () => {
    /* THE BUG, unchanged: on a phone "logging off" means backgrounding the app
       or locking the screen — the page is NOT reloaded, so nothing re-ran the
       catch-up and the frozen gather span was credited nowhere. The fix wired
       `visibilitychange` -> visible to `processOffline()`, and this drives the
       exact event a phone fires on unlock.

       b515 — WHAT "CREDITED" MEANS MOVED, AND THAT IS THE WHOLE RE-POINT. The
       old assertion read `G.inventory.normal_log` going up, because
       `processOffline` simulated the span itself. It does not: it asks
       hr-accrue and applies the envelope. So the property a phone actually
       depends on is that the return REACHES THE WIRE — measured on the wire,
       not on a flag — and a client that stopped asking is exactly paione's bug
       in its current shape. The PAYING half is the engine's and is
       AWAY-HONEST-4 / accrual-engine's `gatherParityGuard`.

       MUTATION: delete the `visibilitychange` listener (or the
       `processOffline()` call inside `hrResume`) from legacy.js → zero
       requests, red. */
    const G = window.G;
    const A = window.HearthriseAccrual;
    const C = window.HearthriseCharacter;
    const snap = snapshotG();
    const dHid = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    const dVis = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    const gate = window.HearthriseGate;
    const origOpen = gate && gate.isOpen;
    const realFetch = window.fetch;
    let accrueHits = 0;
    try {
      if (gate) gate.isOpen = () => true;                 // a signed-in session
      window.fetch = function (u) {
        const str = String(u);
        if (/hr-accrue/.test(str)) {
          accrueHits++;
          return Promise.resolve(new Response('{"ok":true,"accrued":false,"reason":"none"}', { status: 200 }));
        }
        if (/hr_create_character/.test(str)) {
          return Promise.resolve(new Response('{"ok":true,"slot":0,"created":false}', { status: 200 }));
        }
        if (/hr_load/.test(str)) {
          return Promise.resolve(new Response('{"ok":false,"error":"no_character"}', { status: 200 }));
        }
        return realFetch.apply(this, arguments);
      };
      const wiring = { url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => 'jwt' };
      A.resetAccrualGate(); A.configureAccrual(wiring);
      C.resetCharacterIntent(); C.configureCharacter({ ...wiring, userId: () => 'user-b230' });

      G.activeMonster = null;
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree';
      // The player left 20 minutes ago: rewind the offline watermark + lastSeen.
      const now = Date.now(), past = now - 20 * 60000;
      G.lastSeen = past;
      G.offlineBudget = { dayKey: window.utcDayKey(now), usedMs: 0, at: past };

      // Come BACK to the tab — the one event a phone fires on unlock.
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      for (let i = 0; i < 40; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 40; i++) await Promise.resolve();

      assert(accrueHits >= 1,
        'returning to the tab put ' + accrueHits + ' accrual requests on the wire — the frozen span is '
        + 'credited by NOBODY, which is paione\'s "logs off, stops collecting ore" exactly. The page was '
        + 'never reloaded, so this event is the only thing that can ask.');
      /* AND IT ONLY ASKS ON THE WAY BACK. A `visibilitychange` to HIDDEN must
         not spend a request; without this the assertion above is satisfied by a
         listener that fires on every transition, which on a phone is a request
         every time the screen locks. */
      const before = accrueHits;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      assert(accrueHits === before,
        'going away spent ' + (accrueHits - before) + ' accrual request(s) — the handler fires on the '
        + 'wrong edge, and a phone would ask every time the screen locked');
    } finally {
      window.fetch = realFetch;
      if (gate && origOpen) gate.isOpen = origOpen;
      if (dHid) Object.defineProperty(document, 'hidden', dHid); else { try { delete document.hidden; } catch (e) {} }
      if (dVis) Object.defineProperty(document, 'visibilityState', dVis); else { try { delete document.visibilityState; } catch (e) {} }
      A.resetAccrualGate(); A.configureAccrual(null);
      C.resetCharacterIntent(); C.configureCharacter(null);
      restoreGAndRecord(snap);
    }
  }),

  () => tryRun('b230: the shop counter scene is width-pinned so it cannot blow a phone viewport open', () => {
    // The bug: `.sc-scene` had aspect-ratio:8/1 + min-height but no width, so a
    // 92px mobile min-height drove the WIDTH to 736px (92×8), forcing sideways
    // scroll on the whole Shop screen. The fix pins width:100%. Guard the rule.
    let found = false, hasWidth = false;
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      if (!rules) continue;
      for (const r of rules) {
        if (r.selectorText && /#panel-shop\s+\.sc-scene\b/.test(r.selectorText) && r.style && r.style.getPropertyValue('aspect-ratio')) {
          found = true;
          const w = r.style.getPropertyValue('width') || r.style.getPropertyValue('max-width');
          if (w) hasWidth = true;
        }
      }
    }
    assert(found, 'the #panel-shop .sc-scene aspect-ratio rule must exist');
    assert(hasWidth, '.sc-scene must pin width so aspect-ratio drives height (not width) — else it overflows mobile');
  }),

  () => tryRun('b231: starting a fight shows the arena on mobile (not a blank combat screen)', () => {
    // The bug (Tyler): on a phone, `body.in-combat` hid the monster picker AND
    // the "Foes" mobile sub-tab hid the arena, so clicking Fight from the default
    // tab blanked the whole combat screen. Two guards: (1) the CSS safety net
    // shows the arena during any live fight; (2) combat-mobile-tabs.js flips the
    // sub-tab to 'arena' on fight start. Both are checked here.
    const panel = document.getElementById('panel-combat');
    assert(panel, 'panel-combat must exist');

    /* (1) THE SAFETY NET, AND WHY IT IS NO LONGER A CSS RULE (b362).
       The net used to be `body.in-combat ... .combat-arena { display:flex }` —
       a rule whose whole job was to out-specify ANOTHER rule that hid the arena
       on the wrong sub-tab. The two-screen split deletes the hider instead of
       adding to the pile: there are no combat sub-tabs, and the stage is the
       Fight view. So the net is now STRUCTURAL and is asserted as such — with a
       fight live, the panel is on the fight view and the stage is laid out.
       That is a stronger claim than the rule ever made, because it survives a
       future sheet that hides the arena by some other mechanism. */
    const CS = window.HearthriseCombatScreens;
    assert(CS, 'the two screens did not boot — there is no blank-combat net at all');
    const Gb = window.G;
    const wasFighting = Gb.activeMonster;
    try {
      window.showTab('combat');
      window.startCombat('slime');
      assert(panel.dataset.combatView === 'fight',
        'a live fight does not put the panel on the stage — that is the blank combat screen');
      const stage = document.querySelector('#panel-combat .arena-vs.fs-stage');
      assert(stage, 'the stage is missing during a live fight');
      const sr = stage.getBoundingClientRect();
      assert(getComputedStyle(stage).display !== 'none' && sr.width > 0 && sr.height > 0,
        'THE b230/b231 BLANK SCREEN: the stage is not laid out during a live fight');
    } finally {
      try { window.stopCombat(); } catch (e) {}
      if (wasFighting) { try { window.startCombat(wasFighting); } catch (e) {} }
    }

    // (2) Behavioural — the sub-tab follows combat state.
    assert(typeof window.__cmbSyncCombatSub === 'function', 'combat sub-tab sync seam missing');
    const hadInCombat = document.body.classList.contains('in-combat');
    const priorSub = panel.dataset.mobileSub;
    try {
      panel.dataset.mobileSub = 'monsters';
      document.body.classList.add('in-combat');
      window.__cmbSyncCombatSub(panel);
      assert(panel.dataset.mobileSub === 'arena', 'fight start must switch the mobile sub-tab to arena, got ' + panel.dataset.mobileSub);
      document.body.classList.remove('in-combat');
      window.__cmbSyncCombatSub(panel);
      assert(panel.dataset.mobileSub === 'monsters', 'fight end must return the mobile sub-tab to foes, got ' + panel.dataset.mobileSub);
    } finally {
      document.body.classList.toggle('in-combat', hadInCombat);
      if (priorSub) panel.dataset.mobileSub = priorSub;
    }
  }),

  () => tryRun('b237: an active gathering skill resumes its LIVE loop after a load/tab-return (not just offline catch-up)', () => {
    // The bug (tester): loadLocal re-armed an active FIGHT but never an active
    // SKILL, so after coming back the save said "fishing" while no timer ticked.
    const G = window.G;
    const snap = snapshotG();
    try {
      assert(typeof window.resumeActiveActivity === 'function', 'resumeActiveActivity() seam missing');
      assert(typeof window.__isSkillLoopArmed === 'function', 'skill-loop probe missing');
      window.stopSkill();                                   // clean, un-armed baseline
      // Simulate a loaded save: the state SAYS active, but nothing is ticking.
      G.activeMonster = null;
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree'; G.skillMs = 1000;
      assert(window.__isSkillLoopArmed() === false, 'precondition: no live loop should be running yet (the bug state)');
      window.resumeActiveActivity();
      assert(window.__isSkillLoopArmed() === true, 'resumeActiveActivity() must re-arm the live gathering loop');
      window.stopSkill();
    } finally { restoreG(snap); }
  }),

  () => tryRun('b237: artisan tiles show how many of each input you own (live)', () => {
    const G = window.G;
    const snap = snapshotG();
    try {
      window.openSkillDetail('crafting');
      window.renderSkillDetail('crafting');
      // The feature: every artisan input carries an owned-count span. Use whatever
      // input actually rendered (recipes render by category lane), then prove the
      // count is live — set stock and re-render (lightUpdate path) and read it back.
      let span = document.querySelector('#skill-detail .at-inputs .at-have[data-have]');
      assert(span, 'artisan tiles must render an owned-count span for each input');
      const inputId = span.getAttribute('data-have');
      G.inventory = G.inventory || {};
      G.inventory[inputId] = 4242;
      window.renderSkillDetail('crafting');                 // lightUpdate refreshes the count
      span = document.querySelector('#skill-detail .at-inputs .at-have[data-have="' + inputId + '"]');
      assert(span && /4\.2K|4242/.test(span.textContent), 'the owned count must reflect real inventory live, got "' + (span && span.textContent) + '"');
    } finally { restoreG(snap); try { window.showTab('profile'); } catch (e) {} }
  }),

  /* b246's gate, RE-POINTED at the realm's rule: the middle arm asserted that
     "grandfathered gear must still equip at any level", i.e. it pinned the lie. */
  () => tryRun('b246: gear level requirements are enforced — the phantom gate is real, and no client flag lifts it', () => {
    const G = window.G;
    const snap = snapshotG();
    try {
      assert(typeof window.canWield === 'function' && typeof window.gearWieldReq === 'function', 'the wield-gate seam must exist');
      const rid = 'rune_platebody';
      const req = window.gearWieldReq(window.ITEMS[rid]);
      assert(req && req.skill === 'defense' && req.lv === 60, 'rune platebody must require Defence 60, got ' + JSON.stringify(req));
      const isEquipped = () => Object.values(G.equipment || {}).indexOf(rid) >= 0;
      // Under-level: cannot equip, item stays in the bag.
      G.skills = { defense: 0 }; G.inventory = { [rid]: 1 }; G.equipment = {};
      window.equipItem(rid);
      assert(!isEquipped() && (G.inventory[rid] || 0) === 1, 'an under-level player must NOT equip gated armour');
      // Meeting the requirement works.
      G.inventory = { [rid]: 1 }; G.equipment = {}; G.skills = { defense: 5000000 };
      window.equipItem(rid);
      assert(isEquipped(), 'meeting the requirement lets you equip');
    } finally { restoreG(snap); }
  }),

  /* regression suite — THE WIELD GATE READS THE REALM, NOT A CLIENT FLAG.
     THE BUG: an Equip control lit for gear above its requirement and the realm
     refused the swap. THE CAUSE, one line in `canWield` — a residue-PERSISTED
     exemption with no server mirror: `if(G.wieldGrandfather[id]) return {ok:true}`.
     Restore it → (a)+(b)+(c) red, measured. Why (d): src/net/equip.js §THE GATE. */
  () => tryRun('WIELD-1: a residue wield-exemption lights nothing and sends nothing; the REALM\'s worn set still reads worn', () => {
    const { CS, G, restore } = combatScreen();
    const RM = window.HearthriseRoomModal;
    const realFetch = window.fetch;
    let posts = 0;
    try {
      const rid = 'rune_platebody';                       // Defence 60, slot `body`
      const req = window.gearWieldReq(window.ITEMS[rid]);
      assert(req && req.skill === 'defense' && req.lv === 60, 'fixture: rune platebody must require Defence 60, got ' + JSON.stringify(req));
      // The realm's answer is Defence 1 (`skills` is SERVER_OF_RECORD), and the
      // forged residue is byte-for-byte what the deleted writers persisted.
      G.skills = { defense: 0 }; G.inventory = { [rid]: 1 }; G.equipment = { body: null, weapon: null };
      G.wieldGrandfather = { [rid]: true };

      // (a) THE RULE.
      const w = window.canWield(rid);
      assert(w.ok === false, 'THE BUG: a client-held `wieldGrandfather` entry unlocked Defence-60 armour for a '
        + 'Defence-1 character. hr_apply answers requirement_not_met — the player is shown a door the realm keeps shut.');
      assert(w.req && w.req.lv === 60 && w.req.skill === 'defense', 'the refusal must name the requirement, got ' + JSON.stringify(w.req));

      // (b) THE CONTROL it was reported on: the Fight-screen slot picker.
      window.showTab('combat');
      try { window.stopCombat(); } catch (e) {}
      G.activeMonster = null;
      CS.preview('goblin');
      assert(CS.openSlotPicker('body'), 'the slot picker did not open');
      let scrim = document.querySelector('.hr-room-scrim');
      assert(scrim, 'the picker opened no modal');
      assert(!scrim.querySelector('[data-cs="equip"][data-item="' + rid + '"]'), 'THE BUG ON THE SURFACE: the picker lit '
        + 'an Equip button for gear the realm refuses — the press bounces, and the rail has already drawn it as worn.');
      assert(/Lv\s*60/.test(scrim.textContent.replace(/\s+/g, ' ')), 'a locked row must state the level it needs '
        + 'instead of the button: ' + scrim.textContent.replace(/\s+/g, ' ').slice(0, 160));
      try { if (RM) RM.close(); } catch (e) {}

      // (c) NO INTENT LEAVES THE CLIENT: equipItem refuses before it snapshots.
      window.fetch = function (u) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        posts++;
        return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'requirement_not_met' }), { status: 409 }));
      };
      window.equipItem(rid);
      assert(Object.values(G.equipment).indexOf(rid) < 0 && (G.inventory[rid] || 0) === 1, 'the refused item moved anyway');
      assert(posts === 0, 'the client spent ' + posts + ' equip intent(s) on a guaranteed requirement_not_met — a round '
        + 'trip out of the shared 30/min accrue bucket for an answer it already had');

      // (d) THE REALM'S WORN SET IS TRUTH, ABOVE THE REQUIREMENT INCLUDED.
      G.equipment = { body: rid, weapon: null };          // as hr_state_of projected it
      assert(CS.openSlotPicker('body'), 'the slot picker did not re-open');
      scrim = document.querySelector('.hr-room-scrim');
      const txt = scrim.textContent.replace(/\s+/g, ' ');
      assert(txt.indexOf(window.ITEMS[rid].n) >= 0, 'a piece the SERVER holds in the slot vanished because the client '
        + 'cannot re-equip it — the client must never re-gate the realm\'s worn set: ' + txt.slice(0, 160));
      assert(scrim.querySelector('[data-cs="unequip"]'), 'the worn row lost its Take off control');
    } finally {
      window.fetch = realFetch;
      try { if (RM) RM.close(); } catch (e) {}
      delete G.wieldGrandfather;      // deleted code now — leave no ghost behind
      restore();
    }
  }),

  () => tryRun('b249: landscape side-rail is theme-neutral — no cozy-light lock (Tyler: dead offset on hearthlight)', () => {
    // The live theme is `hearthlight`. The landscape nav→left-rail rotation was
    // scoped to body[data-theme="cozy-light"], so it never fired live while the
    // un-prefixed .app padding-left:64px still reserved the gutter → dead strip.
    // Read the ACTUAL loaded stylesheets (synchronous, no fetch/await).
    let found = false, themeLocked = false;
    for(const sheet of document.styleSheets){
      let rules; try { rules = sheet.cssRules; } catch(e){ continue; } // skip cross-origin
      for(const rule of rules){
        if(rule.type !== CSSRule.MEDIA_RULE) continue;
        const mt = (rule.media && rule.media.mediaText) || rule.conditionText || '';
        if(!(/max-height:\s*540px/.test(mt) && /landscape/.test(mt))) continue;
        for(const r of rule.cssRules || []){
          if(r.selectorText && /\.bottom-nav\b/.test(r.selectorText) && r.style && r.style.position === 'fixed'){
            found = true;
            if(/cozy-light/.test(r.selectorText)) themeLocked = true;
          }
        }
      }
    }
    assert(found, 'landscape side-rail rule (.bottom-nav position:fixed) must be present in the loaded CSS');
    assert(!themeLocked, 'the fixed left-rail rule must NOT be scoped to cozy-light (that left hearthlight with a dead offset)');
  }),

  () => tryRun('b314: landscape rail reclaims the phantom bottom-nav reserve + lifts the bug FAB off the CTAs (Tyler: cramped in landscape)', () => {
    // On a short landscape phone the nav is a LEFT rail, so there is NO bottom bar
    // to clear. Two portrait-era blocks (b108/b109) still matched a landscape phone
    // and re-reserved ~68px of DEAD space at the foot of a 430px screen (`.panel.active`,
    // !important, equal specificity, later in source → they won). The rail panel rule
    // must therefore be boosted with body[data-theme] (0,2,1) to beat them, and must
    // not itself re-reserve a bottom-bar's height. Separately the bug-report FAB sat
    // bottom-right ON the quest CTAs (it covered "Go farm" in Tyler's shot) and must be
    // moved out of that corner. Read the ACTUAL loaded CSS — no viewport resize needed.
    let panelBoosted = false, panelReReserves = false, bugMoved = false;
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; } // skip cross-origin
      for (const rule of rules) {
        if (rule.type !== CSSRule.MEDIA_RULE) continue;
        const mt = (rule.media && rule.media.mediaText) || rule.conditionText || '';
        if (!(/max-height:\s*540px/.test(mt) && /landscape/.test(mt))) continue;
        for (const r of rule.cssRules || []) {
          if (!r.selectorText || !r.style) continue;
          if (/\.panel\.active\b/.test(r.selectorText) && (r.style.padding || r.style.paddingBottom)) {
            const raw = (r.style.padding || '') + ' ' + (r.style.paddingBottom || '');
            const reserves = /(40|56|60|72)px/.test(raw); // a bottom-nav's worth of reserve
            if (/body\[data-theme\]/.test(r.selectorText)) {
              if (!reserves) panelBoosted = true; else panelReReserves = true;
            }
          }
          if (/#hr-bug-btn\b/.test(r.selectorText) && (r.style.right === 'auto' || /calc\(/.test(r.style.left || ''))) {
            bugMoved = true;
          }
        }
      }
    }
    assert(panelBoosted, 'the landscape rail panel padding must be boosted with body[data-theme] so it beats the b108/b109 bottom-nav reserves (a bare .panel.active loses the cascade and the 68px dead strip returns)');
    assert(!panelReReserves, 'the boosted rail panel rule must NOT itself re-reserve a bottom-nav height (40/56/60/72px) at the foot of a short landscape screen');
    assert(bugMoved, 'the bug-report FAB must be lifted out of the bottom-right corner (left:calc / right:auto) in the landscape rail block so it stops covering the quest CTAs');
  }),

  () => tryRun('b317: landscape iPhone uses the full screen — a token full-bleed bg layer clears the black safe-area bars, and content reclaims the wasted side + bottom reserve (Tyler PWA: 852x339, insets L/R 59px, B 20px; b315 html-bg + double safe padding left a narrow column framed in black)', () => {
    // Device data (Tyler's bug report, installed PWA / display-mode:standalone,
    // iOS 18.7, landscape): viewport 852x339, safe-area top 0 / right 59 / bottom
    // 20 / left 59. The black "frame" is the safe area. b315 gave <html> a token
    // background, but the ROOT element's paint does not reliably cover the inset
    // region under standalone viewport-fit=cover, so the bars stayed black.
    // THE FIX (verified in-browser by reading computed style):
    //  (1) A FIXED, full-viewport background LAYER (body::before, position:fixed;
    //      inset:0; z-index<0; background: a theme token) that paints edge-to-edge
    //      INCLUDING behind the insets, behind all content. Uses body::before so
    //      --bg-0 resolves in the body[data-theme] scope (themed dark stone), and
    //      because <body> is not a stacking context a negative-z ::before paints
    //      behind body's own gradient — the content look is unchanged.
    //  (2) WIDTH reclaim: the landscape .app grid must NOT stack a full safe-r on
    //      the right (that plus the panel's own padding was ~71px of dead margin);
    //      it drops to 0 and the panel supplies a reduced, inset-aware right pad
    //      (capped well below the 59px island reserve — the left rail absorbs the
    //      Dynamic Island). Net: content uses most of the 852px width.
    //  (3) BOTTOM reserve reclaim: no bottom-nav in the rail layout, so panels
    //      (incl. #panel-combat, which carries its own id-level 72px reserve) must
    //      NOT reserve a bottom-nav-height pad — only the ~20px home-indicator inset.
    // Read the ACTUAL loaded CSS (injected <style> sheets live in document.styleSheets).
    let fullBleed = false, bleedHardcoded = false, bleedTransparent = false;
    let heroCapped = false, heroHeightPx = null, htmlEdgeFill = false, htmlEdgeHardcoded = false;
    let appRightReclaimed = false, appRuleSeen = false, appRightVal = null;
    let contentRightReclaimed = false, panelActiveSeen = false, panelRightVal = null;
    let combatBottomReclaimed = false, combatSeen = false, combatBottomVal = null;
    let panelBottomOK = false, panelBottomVal = null;
    const NAVSIZED = /(?:^|[^0-9])(?:56|60|62|68|72|76)px/; // bottom-nav-height reserves we must NOT keep

    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; } // skip cross-origin
      for (const rule of rules) {
        // (1) Top-level full-bleed layer + belt-and-suspenders html bg (not in a media query).
        if (rule.type === CSSRule.STYLE_RULE && rule.selectorText && rule.style) {
          const sel = rule.selectorText;
          if (/body\s*::?before/.test(sel)) {
            const s = rule.style;
            const bg = s.background || s.backgroundColor || s.backgroundImage || '';
            const fixed = /fixed/.test(s.position || '');
            const zNeg = parseInt(s.zIndex, 10) < 0;
            const spans = (s.inset && /(^|\s)0/.test(s.inset)) ||
                          ((s.top === '0px' || s.top === '0') && (s.left === '0px' || s.left === '0') &&
                           (s.right === '0px' || s.right === '0') && (s.bottom === '0px' || s.bottom === '0'));
            if (fixed && zNeg && spans) {
              if (/var\(--/.test(bg)) fullBleed = true;
              else if (/transparent|none|rgba\([^)]*,\s*0\s*\)/.test(bg) || !bg) bleedTransparent = true;
              else if (/#|rgb|hsl|black/i.test(bg)) bleedHardcoded = true;
            }
          }
          if (/(^|,)\s*html\s*(,|$)/.test(sel) && s_bg(rule)) {
            const bg = rule.style.background;
            if (/var\(--/.test(bg)) htmlEdgeFill = true;
            else if (/#|rgb|black/i.test(bg)) htmlEdgeHardcoded = true;
          }
        }
        if (rule.type !== CSSRule.MEDIA_RULE) continue;
        const mt = (rule.media && rule.media.mediaText) || rule.conditionText || '';
        if (!(/max-height:\s*540px/.test(mt) && /landscape/.test(mt))) continue;
        for (const r of rule.cssRules || []) {
          if (!r.selectorText || !r.style) continue;
          const sel = r.selectorText;
          if (/\.hd-hearth\b/.test(sel) && r.style.height) {
            const m = /^([0-9.]+)px$/.exec(r.style.height.trim());
            if (m) { heroHeightPx = parseFloat(m[1]); if (heroHeightPx <= 72) heroCapped = true; }
          }
          // (2) .app / #app must NOT re-add a full safe-r on the right.
          if (/(^|,)\s*(\.app|#app)\b/.test(sel) && r.style.paddingRight) {
            appRuleSeen = true; appRightVal = r.style.paddingRight;
            if (!/safe-r/.test(r.style.paddingRight)) appRightReclaimed = true;
          }
          // (2) .panel.active right pad must be reduced (capped below the full inset), not a bare var(--safe-r).
          // Read cssText: the value is a `padding:` shorthand with max()/calc(), which
          // some CSSOM implementations do not expand into the paddingRight longhand.
          if (/\.panel\.active\b/.test(sel) && !/#panel-combat/.test(sel) && /padding/.test(r.style.cssText || r.cssText || '')) {
            const txt = r.cssText || r.style.cssText || '';
            panelActiveSeen = true; panelRightVal = txt.replace(/\s+/g, ' ').slice(0, 160);
            // reclaimed = the right/inset reserve is CAPPED via calc(var(--safe-r…) - Npx), not applied full
            if (/calc\([^)]*var\(--safe-r[^)]*\)\s*-\s*\d+px/.test(txt)) contentRightReclaimed = true;
            // bottom slot must not carry a bottom-nav-height reserve
            panelBottomVal = txt.replace(/\s+/g, ' ').slice(0, 160);
            if (/safe-b/.test(txt) && !NAVSIZED.test(txt)) panelBottomOK = true;
          }
          // (3) #panel-combat.active bottom reserve reclaimed (no bottom-nav-sized pad).
          if (/#panel-combat\.active\b/.test(sel) && r.style.paddingBottom) {
            combatSeen = true; combatBottomVal = r.style.paddingBottom;
            if (!NAVSIZED.test(r.style.paddingBottom)) combatBottomReclaimed = true;
          }
        }
      }
    }
    function s_bg(rule){ return rule.style && rule.style.background; }

    assert(fullBleed, 'a FIXED, full-viewport background LAYER (body::before; position:fixed; inset:0; negative z-index; token background) must exist so the safe-area insets paint the themed dark surface edge-to-edge instead of black — this is what b315\'s html-only background could not do on a standalone PWA');
    assert(!bleedHardcoded, 'the full-bleed layer background must be a theme token, not a hardcoded colour (HARD RULE: no hardcoded colours)');
    assert(!bleedTransparent, 'the full-bleed layer background must be an opaque token surface, not transparent — a transparent layer lets the black inset show through');
    assert(heroCapped, 'a landscape-rail rule must cap .hd-hearth to a bounded strip (≤72px) — found height=' + (heroHeightPx == null ? 'none' : heroHeightPx + 'px'));
    assert(htmlEdgeFill, 'the <html> element must still carry a TOKEN background (belt-and-suspenders behind the fixed layer)');
    assert(!htmlEdgeHardcoded, 'the <html> edge-fill background must be a theme token, not a hardcoded colour');
    assert(appRuleSeen && appRightReclaimed, 'the landscape .app/#app grid must NOT re-add a full var(--safe-r) on the right — that symmetric inset (plus the panel\'s own padding) was the wasted ~59px column; it must be reclaimed (found padding-right: ' + (appRightVal || 'none') + ')');
    assert(panelActiveSeen && contentRightReclaimed, 'the landscape .panel.active right padding must CAP the safe-area inset (reclaim the island-sized reserve), not apply the full var(--safe-r) — found padding-right: ' + (panelRightVal || 'none'));
    assert(panelBottomOK, 'the landscape .panel.active must NOT reserve a bottom-nav-height pad (there is no bottom nav in the rail layout) — found padding-bottom: ' + (panelBottomVal || 'none'));
    assert(combatSeen, 'a landscape-scoped #panel-combat.active rule must exist to reclaim combat-hud\'s id-level 72px bottom reserve');
    assert(combatBottomReclaimed, 'the landscape #panel-combat.active must NOT keep a bottom-nav-height (60/68/72px) reserve — only the home-indicator inset is owed; found padding-bottom: ' + (combatBottomVal || 'none'));
  }),

  () => tryRun('b327: the bag survives a 423px-tall viewport — paione bug #24 (922x423 Android landscape): "can\'t see my inventory... only have like a 5mm viewing window", HERO panel overlapping the grid', () => {
    /* Report #24, measured on the live build at EXACTLY 922x423:
     *   .invc-bag-col  h=20px   (one clipped row of item tiles)
     *   .invc-stats-col HERO card 298..411, over a bag whose visible box was
     *                   283..303 — a real rectangle intersection, not a
     *                   perceived one.
     *   main.main       padding-bottom 68px reserved for a bottom nav that in
     *                   this layout is a LEFT RAIL (b310) — 16% of the screen.
     * 922 is WIDER than the 900px mobile-nav ceiling, so this device correctly
     * gets the scaled-desktop rail layout; the defect was that the rail layout
     * had no SHORT-viewport treatment at all.
     *
     * HOW THIS MEASURES A VIEWPORT IT IS NOT RUNNING AT: media queries inside
     * an iframe evaluate against the IFRAME's viewport, so a 922x423 iframe,
     * fed the four inventory stylesheets verbatim and the REAL rendered panel
     * markup, reproduces the device geometry exactly (panel 68..415 h347 with
     * the fix; 68..355 h287 without it — both matching the live measurement).
     * `document.write` + `close()` with inline <style> parses synchronously, so
     * no await is needed. The 68px spacer stands in for the topbar + activity
     * bar, which is what puts the panel's top edge at y=68 on the device.
     * Proved RED by dropping art-direction.css's @media (max-height:540px)
     * rules out of the blob: bag h 257 -> 28, HERO 0x0 -> 113px tall and drawn,
     * main padding-bottom 8px -> 68px, sub-tab strip 37px -> 62px. */
    const render = window._renderInvFancy || window.renderInvFancy;
    assert(typeof render === 'function', 'the inventory renderer seam (window._renderInvFancy) must exist to render the bag');
    const panel = document.getElementById('panel-inventory');
    assert(panel, '#panel-inventory must exist');
    render();
    // The renderer wipes the Bag/Equip/Saved strip; restore it synchronously
    // through the published seam so the strip is part of what we measure.
    if (window.HearthriseInvSubTabs) window.HearthriseInvSubTabs.install();
    const markup = panel.innerHTML;
    assert(/invc-bag-col/.test(markup) && /invc-stats-col/.test(markup),
      'the probe needs the real bag + stats markup — renderInvFancy produced neither');

    let css = '';
    let sheetsSeen = 0;
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }   // cross-origin (fonts)
      const href = sheet.href || '';
      if (href && !/(legacy|audit-overrides|theme-cozy|art-direction)\.css/.test(href)) continue;
      if (href) sheetsSeen++;
      for (const r of rules) css += r.cssText + '\n';
    }
    // Guard against the blob silently emptying (a vacuous probe passes on nothing).
    assert(sheetsSeen >= 4, 'the probe must find all four inventory stylesheets, saw ' + sheetsSeen);
    assert(css.length > 100000, 'the CSS blob looks empty (' + css.length + ' chars) — the probe would pass vacuously');

    const frame = document.createElement('iframe');
    frame.setAttribute('style', 'position:fixed;left:-4000px;top:0;width:922px;height:423px;border:0;visibility:hidden');
    document.body.appendChild(frame);
    let out;
    try {
      const doc = frame.contentDocument;
      doc.open();
      doc.write(
        '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head>' +
        '<body data-theme="hearthlight"><div id="app" class="app"><main class="main">' +
        '<div style="flex:0 0 68px;height:68px"></div>' +
        '<section class="panel active" id="panel-inventory" data-mobile-sub="bag">' + markup + '</section>' +
        '</main></div></body></html>'
      );
      doc.close();
      const win = frame.contentWindow;
      const q = (s) => doc.querySelector(s);
      /* The slot line's width is a function of the player's numbers, and the
         suite's bag is nearly empty — narrow enough to fit even when the layout
         is broken. Re-state it at the worst case a real bag produces before
         measuring. The plant is the structure renderInvFancy emits, and that it
         emitted it is asserted below: a missing span must read as a failure. */
      const slotEl = q('.invc-topbar .invc-space');
      const slotNamed = !!(slotEl && slotEl.querySelector('.invc-space-cap')
        && slotEl.querySelector('.invc-space-unit') && slotEl.querySelector('.invc-space-free')
        && slotEl.querySelector('.invc-space-sub'));
      if (slotNamed) slotEl.innerHTML =
        '<span class="invc-space-cap">1,000 / 1,000<span class="invc-space-unit"> slots</span></span>'
        + ' <span class="invc-space-free">(981 free)</span>'
        + '<span class="invc-space-sub"> · 2,719 items · 1,284,905 gp</span>';
      const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right, w: b.width, h: b.height }; };
      const heroH4 = [...doc.querySelectorAll('.invc-stat-card h4')]
        .find((h) => h.textContent.trim().toUpperCase().indexOf('HERO') === 0);
      const bagEl = q('.invc-bag-col');
      const rightEl = q('.invc-right');
      const tabsEl = q('#inv-mob-tabs');
      out = {
        vpW: win.innerWidth, vpH: win.innerHeight,
        panel: rect(q('#panel-inventory')),
        bag: rect(bagEl),
        hero: heroH4 ? rect(heroH4.closest('.invc-stat-card')) : null,
        rightDisplay: rightEl ? win.getComputedStyle(rightEl).display : 'missing',
        bagOverflowY: bagEl ? win.getComputedStyle(bagEl).overflowY : '',
        bagScrolls: bagEl ? bagEl.scrollHeight > bagEl.clientHeight : false,
        panelOverflow: q('#panel-inventory').scrollHeight - q('#panel-inventory').clientHeight,
        mainPadBottom: parseFloat(win.getComputedStyle(q('main.main')).paddingBottom) || 0,
        tabs: rect(tabsEl),
        tabsText: tabsEl ? tabsEl.textContent : '',
        tabGlyphs: doc.querySelectorAll('#inv-mob-tabs .hr-glyph').length,
        slotNamed,
        actionBtns: doc.querySelectorAll('.invc-topbar .invc-actions button, .invc-topbar .invc-actions .btn').length,
        /* The DECLARED ORDER OF SACRIFICE, read off the cascade rather than off a
           width — see the ordering block below for why a width is not trusted here. */
        rank: (function(){
          const g = (sel) => { const el = q('.invc-topbar ' + sel); return el ? win.getComputedStyle(el) : null; };
          const cap = g('.invc-space-cap'), free = g('.invc-space-free'),
                unit = g('.invc-space-unit'), sub = g('.invc-space-sub'), line = g('.invc-space');
          return {
            capShrink: cap && cap.flexShrink, freeShrink: free && free.flexShrink,
            unitDisplay: unit && unit.display, subDisplay: sub && sub.display,
            lineOverflow: line && line.overflowX, lineWrap: line && line.whiteSpace,
          };
        })(),
        space: rect(q('.invc-topbar .invc-space')),
        spaceCap: rect(q('.invc-topbar .invc-space-cap')),
        spaceFree: rect(q('.invc-topbar .invc-space-free')),
        spaceText: (q('.invc-topbar .invc-space') || {}).textContent || '',
        /* What a player at this viewport can actually READ on the slot line:
           the node's text minus every display:none descendant. */
        spaceRead: (function(){
          const src = q('.invc-topbar .invc-space'); if(!src) return '';
          const live = [...src.querySelectorAll('*')];
          const clone = src.cloneNode(true);
          const twins = [...clone.querySelectorAll('*')];   // same document order
          for (let i = live.length - 1; i >= 0; i--) {
            if (win.getComputedStyle(live[i]).display === 'none' && twins[i]) twins[i].remove();
          }
          return (clone.textContent || '').replace(/\s+/g, ' ').trim();
        })(),
      };
    } finally {
      frame.remove();
    }

    assert(out.vpW === 922 && out.vpH === 423, 'the probe frame must be exactly 922x423, got ' + out.vpW + 'x' + out.vpH);

    // (1) The phantom bottom-nav reserve — 68px of the 423 on a rail layout.
    assert(out.mainPadBottom < 40,
      'in the landscape RAIL layout there is no bottom nav, so <main> must not reserve one — found padding-bottom ' + out.mainPadBottom + 'px (the b108/b109 60px+safe-b+8 reserve, which capped the panel at 287px of the 423)');

    // (2) THE OVERLAP. In BAG mode the whole right-hand region is off, so no
    //     part of it can share a pixel with the bag. Asserted as a rectangle
    //     intersection rather than "hero.top >= bag.bottom", because with a
    //     side-by-side layout "beside" is also a correct answer. Checked BEFORE
    //     the size assertions so re-introducing b111's bug names itself.
    assert(out.rightDisplay === 'none',
      'BAG mode must hide the whole right-hand REGION (.invc-right). b111 only hid .invc-equip-col; .invc-stats-col was added later and never joined the rule, which is what painted HERO over the grid — found display:' + out.rightDisplay);
    const overlaps = out.hero && out.hero.w > 0 && out.bag &&
      out.hero.l < out.bag.r && out.hero.r > out.bag.l &&
      out.hero.t < out.bag.b && out.hero.b > out.bag.t;
    assert(!overlaps,
      'the HERO stat card must not share any pixel with the item grid — hero ' + JSON.stringify(out.hero) + ' vs bag ' + JSON.stringify(out.bag));

    // (3) The bag gets the majority of what is left, and IT is the scroller.
    assert(out.bag && out.bag.h >= 140,
      'the item grid must get a real viewing area on a 423px-tall screen — measured ' + Math.round(out.bag ? out.bag.h : 0) + 'px (the shipped bug was 20px: one clipped row)');
    assert(out.bag.h > out.panel.h * 0.5,
      'the bag must own MORE than half the panel; chrome had ' + Math.round(100 - (out.bag.h / out.panel.h) * 100) + '% of it');
    assert(/auto|scroll/.test(out.bagOverflowY) && out.bagScrolls,
      'the bag itself must be the scrolling region (overflow-y auto AND actually overflowing), not the page');
    assert(out.panelOverflow <= 1,
      'the panel must not scroll as a whole — the bag does; panel overflow ' + out.panelOverflow + 'px');

    // (4) The chrome that caused it: a two-line sub-tab strip with an EMPTY
    //     icon row (icon-set.js strips emoji, so the glyph line drew nothing).
    assert(out.tabs && out.tabs.h > 0, 'the Bag/Equip/Saved strip must render at this viewport');
    assert(out.tabs.h <= 44,
      'the Bag/Equip/Saved strip must be one compact rank on a short screen — found ' + Math.round(out.tabs.h) + 'px');
    assert(out.tabGlyphs >= 3,
      'each sub-tab must carry a baked atlas glyph, not an emoji that the chrome sweep deletes (found ' + out.tabGlyphs + ')');
    assert(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(out.tabsText),
      'no emoji may render in the inventory sub-tab strip');

    /* (5) THE SLOT LINE HAS A DECLARED ORDER OF SACRIFICE. The visual
     *     sweep measured `"(81 free)" cut by .invc-space` at exactly this
     *     viewport: the topbar shares its column with four action buttons and
     *     the line was one ellipsised text run, so the cut fell inside the
     *     free-stack count.
     *     ASSERTED OFF THE CASCADE, NOT OFF A WIDTH: this probe has no web
     *     faces, so it lays the line out in the fallback for --f-label (Cinzel)
     *     and the worst case fits here in 197px where it did not on the device.
     *     Widths belong to tests/visual-qa-gate.mjs, which measures the real
     *     page with the real faces and refuses a verdict without them. The
     *     font-independent half — and the fix itself — is the ORDER: capacity
     *     and free stacks never shrink; the unit word and the volatile summary
     *     are what go. Deleting either half turns this red. */
    assert(out.space && out.space.w > 0, 'the slot line must render at 922x423');
    assert(out.slotNamed,
      'renderInvFancy must emit the slot line as NAMED facts (.invc-space-cap + .invc-space-unit, .invc-space-free, .invc-space-sub) — without them a short viewport cannot rank them and every assertion below would be vacuous');
    assert(out.actionBtns >= 3,
      'the probe needs the real action buttons beside the slot line — they are what narrows it; found ' + out.actionBtns);
    assert(out.rank.capShrink === '0' && out.rank.freeShrink === '0',
      'THE b545 BUG: on a landscape phone the capacity and free-stack facts must be unshrinkable, so the cut can never land inside them — flex-shrink cap=' + out.rank.capShrink + ' free=' + out.rank.freeShrink);
    assert(out.rank.unitDisplay === 'none' && out.rank.subDisplay === 'none',
      'THE b545 BUG: the line must give up the unit word and the item/gold summary WHOLE rather than half-draw them — display unit=' + out.rank.unitDisplay + ' sub=' + out.rank.subDisplay + ' (read: "' + out.spaceRead + '")');
    assert(out.rank.lineOverflow === 'hidden' && /nowrap/.test(out.rank.lineWrap || ''),
      'the slot line must still be a single clipped rank on a 423px-tall screen (b327 chrome budget) — overflow ' + out.rank.lineOverflow + ', white-space ' + out.rank.lineWrap);
    assert(out.spaceCap && out.spaceFree, 'the slot line must expose its capacity and free-stack facts as named elements');
    ['spaceCap', 'spaceFree'].forEach((k) => {
      const r = out[k];
      assert(r.r <= out.space.r + 2 && r.l >= out.space.l - 2,
        'THE b545 BUG: .' + (k === 'spaceCap' ? 'invc-space-cap' : 'invc-space-free') + ' is cut by .invc-space on a landscape phone — child ' + Math.round(r.l) + '..' + Math.round(r.r) + ' vs parent ' + Math.round(out.space.l) + '..' + Math.round(out.space.r) + ' (readable line: "' + out.spaceRead + '")');
    });
    assert(/[\d,]+\s*\/\s*[\d,]+/.test(out.spaceRead) && /[\d,]+\s*free\)?/.test(out.spaceRead),
      'the landscape slot line must still state used/cap AND free stacks — read "' + out.spaceRead + '"');
    assert(/[\d,]+\s*\/\s*[\d,]+\s*slots/.test(out.spaceText),
      'the slot line\'s TEXT must keep the b348 wording for _renderInvSummary\'s contract — got "' + out.spaceText + '"');
  }),

  /* ── regression suite — b554: THE BAG'S FILTER CHIPS WERE 28px ON A PHONE ──
     visual-qa P1 since 2026-09-12: at 852x393 the Keep chips were 28px tall and
     33px wide, the category squares 30px — the smallest targets on the screen a
     player filters most. The phone floor is `--tap` (44px) on BOTH axes, and
     what is measured is the HIT AREA (`elementFromPoint` walked out from each
     chip's centre), not the painted box, so a neighbour overlapping the chip
     cannot pass for a big target. Same iframe method as b327 above: the media
     queries evaluate against the frame, so 852x393 is the device. RED at 28. */
  () => tryRun('b554: the bag\'s Keep and category chips take a 44px thumb at 852x393', () => {
    const render = window._renderInvFancy || window.renderInvFancy;
    assert(typeof render === 'function', 'the inventory renderer seam (window._renderInvFancy) must exist');
    const panel = document.getElementById('panel-inventory');
    assert(panel, '#panel-inventory must exist');
    render();
    if (window.HearthriseInvSubTabs) window.HearthriseInvSubTabs.install();
    const markup = panel.innerHTML;
    assert(/invc-lf-chip/.test(markup) && /invc-cat-btn/.test(markup),
      'the probe needs the real Keep chips and category strip — renderInvFancy produced ' + (/invc-lf-chip/.test(markup) ? 'no category strip' : 'no Keep chips'));
    let css = '', sheetsSeen = 0;
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      const href = sheet.href || '';
      if (href && !/(tokens|legacy|audit-overrides|theme-cozy|art-direction)\.css/.test(href)) continue;
      if (href) sheetsSeen++;
      for (const r of rules) css += r.cssText + '\n';
    }
    assert(sheetsSeen >= 5, 'the probe must find the token sheet and all four inventory stylesheets, saw ' + sheetsSeen);
    const frame = document.createElement('iframe');
    frame.setAttribute('style', 'position:fixed;left:-4000px;top:0;width:852px;height:393px;border:0;visibility:hidden');
    document.body.appendChild(frame);
    let chips;
    try {
      const doc = frame.contentDocument;
      doc.open();
      doc.write('<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head>' +
        '<body data-theme="hearthlight"><div id="app" class="app"><main class="main">' +
        '<div style="flex:0 0 72px;height:72px"></div>' +
        '<section class="panel active" id="panel-inventory" data-mobile-sub="bag">' + markup + '</section>' +
        '</main></div></body></html>');
      doc.close();
      const hitOf = (el) => {
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        const hits = (x, y) => { const e = doc.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)); };
        const reach = (dx, dy) => { let n = 0; while (n < 44 && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
        return { cls: el.className.split(' ')[0], t: el.getAttribute('title') || '', box: Math.round(b.width) + 'x' + Math.round(b.height),
          centre: hits(cx, cy), w: reach(-1, 0) + reach(1, 0) + 1, h: reach(0, -1) + reach(0, 1) + 1 };
      };
      chips = [...doc.querySelectorAll('.invc-lf-chip, .invc-cat-btn')].map(hitOf);
    } finally { frame.remove(); }
    assert(chips.filter((c) => c.cls === 'invc-lf-chip').length >= 2, 'the probe found no Keep chips in the 852x393 frame');
    chips.forEach((c) => {
      assert(c.centre, 'the ' + c.cls + ' "' + c.t + '" is covered at its own centre in the 852x393 frame (' + c.box + ')');
      assert(c.h >= 44 && c.w >= 44,
        'THE b554 BUG: the ' + c.cls + ' "' + c.t + '" takes a ' + c.w + 'x' + c.h + 'px thumb on a landscape phone (painted ' + c.box + ') — the floor is --tap, 44px on both axes');
    });
  }),

  /* ── regression suite — b554: A STRAY BRACE DELETED A RULE, SILENTLY ──────
     theme-cozy.css carried `}e: 12px;\n}` — the tail of a botched edit. CSS error
     recovery turns an unmatched `}` at top level into the start of a selector,
     which swallowed the NEXT rule whole: `.global-quests-strip{display:none
     !important}`. So the 80px legacy quest strip, meant to be replaced by the
     topbar Quests pill, sat on every screen — a fifth of a 393px phone, and the
     reason the b554 tap floor first buried the bag. No guard reads a sheet's
     text, so this checks every shipped stylesheet's brace balance (comments and
     quoted strings stripped) and the strip it hid. */
  () => tryRunAsync('b554: every stylesheet balances its braces, and the legacy quest strip stays hidden', async () => {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .map((l) => l.getAttribute('href') || '').filter((h) => /^src\/styles\/[\w-]+\.css/.test(h));
    assert(links.length >= 8, 'the probe found only ' + links.length + ' src/styles sheets linked from index.html');
    for (const href of links) {
      const res = await fetch(href, { cache: 'no-store' });
      assert(res.ok, href + ' did not load (' + res.status + ')');
      const text = (await res.text()).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => m.replace(/[{}]/g, ' '));
      let depth = 0, line = 1;
      for (const ch of text) {
        if (ch === '\n') line++;
        else if (ch === '{') depth++;
        else if (ch === '}' && --depth < 0) break;
      }
      assert(depth >= 0, 'THE b554 BUG: ' + href.split('?')[0] + ' closes a brace it never opened at line ' + line
        + ' — the browser will read the next rule as garbage and drop it');
      assert(depth === 0, href.split('?')[0] + ' ends with ' + depth + ' unclosed brace(s) — every rule after the gap is inside it');
    }
    const strip = document.getElementById('global-quests-strip');
    if (strip) assert(getComputedStyle(strip).display === 'none',
      'THE b554 BUG: the legacy .global-quests-strip is drawn (' + getComputedStyle(strip).display + ') — the topbar Quests pill replaces it (theme-cozy.css)');
  }),

  () => tryRun('b369: Character > Equipment survives a 922x423 landscape phone — square, contained, non-overlapping slots (Tyler: "the weapon sprite is floating over the Cape cell")', () => {
    /* WHY THE EXISTING LANDSCAPE GUARD DID NOT CATCH THIS. b327 (immediately
     * above) is the 922x423 iframe probe, and it renders `#panel-inventory`
     * markup only. The paper-doll ALSO lives on Character > Equipment, in a
     * different panel with a different host, and no guard ever rendered that
     * one at a short viewport. The doll was covered on the surface nobody
     * reported and uncovered on the surface Tyler photographed. This test
     * closes that hole by probing the CHARACTER host at the same viewport,
     * reusing b327's technique.
     *
     * THE BUG. Four sheets each authored a piece of one grid. legacy.css said
     * three 110px columns for a doll whose slots are placed in FOUR, plus a
     * mobile block that re-said it at 130px; art-direction.css said fluid
     * columns against a FIXED 84px row; theme-cozy.css said the slots were
     * square with `height:auto`. A fixed row track cannot describe a square
     * cell whose width is fluid: the moment the host is wider than the row is
     * tall, every cell grows out of its own row and paints over the row below.
     * Measured on the shipped build at 922x423 by widening the host: 340px
     * host -> 0 overlapping pairs; 440px -> 10; 700px -> 10 (170px cells in an
     * 84px row); 860px -> 16 (210px cells). That is the ~200px weapon sprite
     * sitting across CAPE. The doll also measured 808px tall in a 423px
     * viewport, so boots and ring 2 were below the fold.
     *
     * SO THE ASSERTIONS ARE THE INVARIANTS, NOT THE NUMBERS: cells square, no
     * two slots sharing a pixel AT ANY HOST WIDTH, everything above the fold,
     * and the cell still tappable. The host is deliberately stretched to 860px
     * inside the probe — a fixed-row regression is invisible at the natural
     * width and obvious at that one, which is the whole reason it shipped. */
    assert(typeof window.buildTibiaDoll === 'function', 'buildTibiaDoll must exist — it is the doll every equipment surface reuses');
    const built = window.buildTibiaDoll();
    assert(built, 'buildTibiaDoll must return a node to probe');
    const markup = built.outerHTML;
    assert(/td-doll/.test(markup) && (markup.match(/td-slot/g) || []).length >= 12,
      'the probe needs a real doll with its slots — got ' + (markup.match(/td-slot/g) || []).length);

    let css = '';
    let sheetsSeen = 0;
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      const href = sheet.href || '';
      if (href && !/(legacy|audit-overrides|theme-cozy|art-direction)\.css/.test(href)) continue;
      if (href) sheetsSeen++;
      for (const r of rules) css += r.cssText + '\n';
    }
    assert(sheetsSeen >= 4, 'the probe must find all four stylesheets, saw ' + sheetsSeen);
    assert(css.length > 100000, 'the CSS blob looks empty (' + css.length + ' chars) — the probe would pass vacuously');

    const frame = document.createElement('iframe');
    frame.setAttribute('style', 'position:fixed;left:-4000px;top:0;width:922px;height:423px;border:0;visibility:hidden');
    document.body.appendChild(frame);
    let out;
    try {
      const doc = frame.contentDocument;
      doc.open();
      doc.write(
        '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head>' +
        '<body data-theme="hearthlight"><div id="app" class="app"><main class="main">' +
        '<section class="panel active" id="panel-character">' +
        '<div id="char-shell"><div class="char-pane" id="char-equip">' + markup + '</div></div>' +
        '</section>' +
        /* The SECOND host, added because it is where the same doll was found
           overlapping for real: the inventory Equip pane. One component, two
           mounts, and a rule keyed to the mount can only ever be right on the
           mount its author was looking at. */
        '<section class="panel active" id="panel-inventory" data-mobile-sub="equip">' +
        '<div class="invc-main"><div class="invc-equip-col">' + markup + '</div></div>' +
        '</section>' +
        '</main></div></body></html>'
      );
      doc.close();
      const win = frame.contentWindow;
      const doll = doc.querySelector('#char-equip .td-doll');
      const invDoll = doc.querySelector('#panel-inventory .td-doll');
      const measure = (root) => {
        root = root || doll;
        const slots = [...root.querySelectorAll('.td-slot')].map((el) => {
          const b = el.getBoundingClientRect();
          return { c: (el.className.match(/td-(?!slot)[a-z0-9]+/) || ['?'])[0], w: b.width, h: b.height, t: b.top, l: b.left };
        });
        let pairs = 0; let worst = null;
        for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
          const a = slots[i]; const b = slots[j];
          const x = Math.min(a.l + a.w, b.l + b.w) - Math.max(a.l, b.l);
          const y = Math.min(a.t + a.h, b.t + b.h) - Math.max(a.t, b.t);
          if (x > 1 && y > 1) { pairs++; worst = worst || (a.c + ' over ' + b.c + ' by ' + Math.round(x) + 'x' + Math.round(y) + 'px'); }
        }
        const db = root.getBoundingClientRect();
        return {
          slots: slots.length, pairs, worst,
          cellW: slots[0] ? slots[0].w : 0, cellH: slots[0] ? slots[0].h : 0,
          maxSkew: Math.max(...slots.map((s) => Math.abs(s.w - s.h))),
          bottom: Math.max(...slots.map((s) => s.t + s.h)),
          right: db.right, dollH: db.height,
        };
      };
      const natural = measure(doll);
      const inventory = invDoll ? measure(invDoll) : null;
      // The stress: a host wider than the cell. This is the state Tyler's
      // device was in, and the ONLY state in which a fixed row track shows.
      doll.parentElement.style.width = '860px';
      doll.parentElement.style.maxWidth = 'none';
      const stretched = measure(doll);
      /* The paper-doll is six rows tall and a 423px phone cannot hold six
         tappable rows under a 179px header, so the column's own scroll is what
         makes the bottom rows reachable. Read it rather than assume it. */
      const invCol = doc.querySelector('#panel-inventory .invc-equip-col');
      const invColOverflowY = invCol ? win.getComputedStyle(invCol).overflowY : null;
      out = { vpW: win.innerWidth, vpH: win.innerHeight, natural, stretched, inventory, invColOverflowY };
    } finally {
      frame.remove();
    }

    assert(out.vpW === 922 && out.vpH === 423, 'the probe frame must be exactly 922x423, got ' + out.vpW + 'x' + out.vpH);
    assert(out.natural.slots >= 12, 'the doll must render its slots in the probe, got ' + out.natural.slots);

    // (1) NO SLOT MAY SHARE A PIXEL WITH ANOTHER — at either host width.
    assert(out.natural.pairs === 0,
      'no two equipment slots may overlap at the natural host width — ' + out.natural.pairs + ' pairs, e.g. ' + out.natural.worst);
    assert(out.stretched.pairs === 0,
      'no two equipment slots may overlap when the host is WIDER than the cell — ' + out.stretched.pairs + ' pairs, e.g. ' + out.stretched.worst +
      ' (a fixed grid-template-rows against a square slot; this is the exact shipped defect and it is invisible at the natural width)');

    // (2) The cell is square, because the row is derived from it and not authored.
    assert(out.natural.maxSkew <= 1,
      'every slot must be square — worst width/height difference ' + Math.round(out.natural.maxSkew) + 'px (a non-square cell means two sheets are still sizing it)');
    assert(out.stretched.maxSkew <= 1,
      'slots must stay square when the host is stretched — worst difference ' + Math.round(out.stretched.maxSkew) + 'px');

    // (3) A wide host must not inflate the cell. 210px cells were the report.
    assert(out.stretched.cellW <= 96,
      'a wide host must give a CENTRED doll, not an inflated one — cell measured ' + Math.round(out.stretched.cellW) + 'px (the shipped bug reached 210px)');

    // (4) Still tappable, and still entirely on the 423px screen.
    assert(out.natural.cellW >= 44,
      'the slot must stay above the 44px tap floor on a phone — measured ' + Math.round(out.natural.cellW) + 'px');
    /* THE FOLD — RE-RULED when the doll became a real paper-doll, and the
     * re-ruling is stated here rather than buried, because it relaxes a
     * previously absolute assertion.
     *
     * The old budget was `dollH + 179 <= 423`: the header measured 179px on the
     * live page at this viewport (screenshot, not inference), leaving 244px,
     * and a FOUR-row 4x4 table fitted. Fourteen gear slots in the canonical
     * THREE-wide doll is SIX rows, and six rows at the 44px iOS tap floor is
     * 287px. 287 > 244, and no cell size satisfies both — 36px would win the
     * fold by putting every slot under the tap floor, on a touch screen, where
     * these slots are the tap targets. So: KEEP THE TARGET, LET THE COLUMN
     * SCROLL, and assert the two things that actually protect the player —
     *   (a) the height stays BOUNDED, so it can never drift back toward the
     *       808px that started this (that is the regression this test exists
     *       for; it was never really about the exact fold line), and
     *   (b) the column holding it is genuinely scrollable at this viewport, so
     *       "below the fold" means "one flick away" and not "unreachable".
     * (b) is a STRONGER guarantee than the old assertion, which proved the doll
     * fitted but never proved a taller one would be reachable. */
    const HEADER_PX = 179;
    const DOLL_H_CEILING = 300;   // 287px measured; the 808px defect is 2.7x this
    assert(out.natural.dollH <= DOLL_H_CEILING,
      'the doll must stay compact on a 423px-tall landscape phone — measured ' + Math.round(out.natural.dollH) +
      'px against a ' + DOLL_H_CEILING + 'px ceiling (' + HEADER_PX + 'px of that screen is header; the shipped 4-sheet defect reached 808px)');
    assert(/^(auto|scroll)$/.test(String(out.invColOverflowY)),
      'the equipment column must be scrollable at 922x423 — the six-row paper-doll is taller than the fold by design, so overflow-y must be auto/scroll for boots, rings and earrings to be reachable; computed ' + out.invColOverflowY);
    assert(out.natural.right <= 922,
      'the doll must not run off the right edge — right edge at ' + Math.round(out.natural.right) + 'px');

    /* (5) THE SECOND MOUNT. `.invc-equip-col .td-doll` carried its own
     * `repeat(3,1fr)` columns and `repeat(6,minmax(64px,90px))` rows — three
     * columns for a four-column doll against a bounded row on a `width:100%`
     * grid. Measured live before the fix: 152px cells and 19 overlapping pairs
     * at 922x423, 9 at 1440x900. Same component, same invariant. */
    assert(out.inventory, 'the probe must also mount the doll in the inventory equip column');
    assert(out.inventory.pairs === 0,
      'no two slots may overlap on the INVENTORY equip pane either — ' + out.inventory.pairs + ' pairs, e.g. ' + out.inventory.worst +
      ' (this mount had its own column/row tracks and was overlapping in the shipped build)');
    assert(out.inventory.maxSkew <= 1,
      'the inventory doll\'s slots must be square too — worst difference ' + Math.round(out.inventory.maxSkew) + 'px');
    assert(out.inventory.cellW <= 96,
      'the inventory doll must not inflate its cell to fill the column — measured ' + Math.round(out.inventory.cellW) + 'px (was 152px)');
  }),

  () => tryRun('DOLL-LAYOUT: the equipment doll is the canonical paper-doll — helmet at the apex, weapon left of body, offhand right of it, rings flanking the boots (Tyler: "this player doll layout makes no fucking sense. in what game have you seen it work like this?")', () => {
    /* WHAT WAS WRONG. Equipment was drawn twice and neither drawing was a
     * paper-doll. `buildTibiaDoll` laid fourteen slots out as a 4x4 TABLE
     * (cape/helmet/necklace/ammo across the top, weapon/body/offhand/earrings
     * under it). The Fight screen's loadout rail let twelve slots auto-flow in
     * ARRAY order into three columns, which rendered Weapon/Offhand/Ammo over
     * Necklace/Helmet/Body over Pants/Cape/Gloves over Boots/Ring 1/Ring 2 —
     * rows that correspond to nothing on a body, and which DISAGREED with the
     * other doll, so the same slot sat in a different place depending on which
     * screen you opened.
     *
     * WHY THIS TEST ASSERTS RELATIONSHIPS AND NOT COORDINATES. A test that
     * pinned `helmet === [2,1]` would pass on any grid that happened to put a
     * helmet there, including a table. What makes it a doll is the RELATIONS —
     * the helmet is alone at the top, the weapon and the offhand flank the
     * body on one row, the ring pair mirrors around the boots — plus the thing
     * that separates a doll from a spreadsheet: THE APEX CORNERS ARE EMPTY.
     * A layout with no holes is a table however you order it, which is exactly
     * how the 4x4 got shipped.
     *
     * MUTATION PROVEN: restore the old 4-wide LAYOUT in doll-layout.js and the
     * apex-corner, flank and column-count assertions all fail; delete the
     * `place()` call from combat-screens.js renderDoll and the rail-agreement
     * assertions fail. */
    const DL = window.HearthriseDollLayout;
    assert(DL && typeof DL.place === 'function',
      'window.HearthriseDollLayout must exist — it is the ONE table every equipment mount places from');

    // ── 1 · EVERY GEAR SLOT HAS A HOME ────────────────────────────────────
    // A slot with no entry lands in auto-flow, which is silent and is how the
    // rail ended up in array order. Adding a slot to EQUIP_SLOTS must fail here.
    const allSlots = (window.EQUIP_SLOTS || []).filter((s) => s !== 'companion');
    assert(allSlots.length >= 12, 'EQUIP_SLOTS looks empty in this env (' + allSlots.length + ')');
    const homeless = allSlots.filter((s) => !DL.has(s));
    assert(homeless.length === 0,
      'every gear slot must have a cell in the paper-doll or it silently auto-flows — unplaced: ' + homeless.join(', '));
    assert(!DL.has('companion'),
      'the companion is not worn on a body — it belongs in its own pane (b216), not in the doll grid');

    // ── 2 · THE RENDERED CHARACTER DOLL ───────────────────────────────────
    const built = window.buildTibiaDoll();
    assert(built, 'buildTibiaDoll must return a node');
    const grid = built.querySelector('.td-doll');
    assert(grid, 'the built doll has no .td-doll grid');
    const at = {};
    grid.querySelectorAll('.td-slot').forEach((el) => {
      const cls = [...el.classList].find((c) => c.startsWith('td-') && c !== 'td-slot' && c !== 'td-companion-slot');
      if (!cls) return;
      const col = parseInt(el.style.gridColumn, 10);
      const row = parseInt(el.style.gridRow, 10);
      assert(col >= 1 && row >= 1,
        'slot ' + cls + ' was rendered WITHOUT a grid position — it is auto-flowing, which is the defect this layout replaced');
      at[cls.replace(/^td-/, '')] = { col, row };
    });

    const need = ['helmet', 'cape', 'necklace', 'ammo', 'weapon', 'body', 'gloves', 'pants', 'ring1', 'boots', 'ring2'];
    need.forEach((s) => assert(at[s], 'the doll did not render the ' + s + ' slot'));

    // THREE columns. A paper-doll is left-hand / body / right-hand; four is a table.
    const cols = Math.max(...Object.values(at).map((p) => p.col));
    assert(cols === 3, 'the doll must be exactly three columns wide, measured ' + cols +
      ' (four columns is the 4x4 table this replaced)');
    assert(DL.COLS === 3, 'the layout table must declare three columns, declares ' + DL.COLS);

    // THE APEX. Helmet alone on the top row, in the centre column.
    const topRow = Math.min(...Object.values(at).map((p) => p.row));
    assert(at.helmet.row === topRow && at.helmet.col === 2,
      'the helmet must sit alone at the top-centre of the doll — found col ' + at.helmet.col + ' row ' + at.helmet.row);
    const alsoOnTop = Object.keys(at).filter((s) => at[s].row === topRow && s !== 'helmet');
    assert(alsoOnTop.length === 0,
      'the top row belongs to the helmet alone — the empty corners either side of it ARE the silhouette; found ' + alsoOnTop.join(', ') + ' up there too');

    // THE ARMS. Weapon left of the body, offhand right of it, all on one row.
    assert(at.weapon.row === at.body.row && at.weapon.col < at.body.col,
      'the weapon must sit on the body\'s row, to its LEFT — weapon ' + JSON.stringify(at.weapon) + ' body ' + JSON.stringify(at.body));
    if (at.shield) {
      assert(at.shield.row === at.body.row && at.shield.col > at.body.col,
        'the offhand must sit on the body\'s row, to its RIGHT — offhand ' + JSON.stringify(at.shield));
    }

    // THE SHOULDER ROW, directly under the helmet: cape | necklace | ammo.
    assert(at.necklace.col === 2 && at.necklace.row === at.helmet.row + 1,
      'the necklace belongs directly under the helmet — found ' + JSON.stringify(at.necklace));
    assert(at.cape.row === at.necklace.row && at.cape.col < at.necklace.col,
      'the cape belongs on the necklace\'s row, to its left — found ' + JSON.stringify(at.cape));
    assert(at.ammo.row === at.necklace.row && at.ammo.col > at.necklace.col,
      'the ammo/quiver belongs on the necklace\'s row, to its right — found ' + JSON.stringify(at.ammo));

    // THE SPINE. helmet -> necklace -> body -> pants -> boots, all centre column,
    // strictly top to bottom. This is the read that makes it a body.
    const spine = ['helmet', 'necklace', 'body', 'pants', 'boots'];
    spine.forEach((s) => assert(at[s].col === 2, s + ' must sit in the doll\'s centre column, found col ' + at[s].col));
    for (let i = 1; i < spine.length; i++) {
      assert(at[spine[i]].row > at[spine[i - 1]].row,
        'the doll reads head to foot: ' + spine[i] + ' must sit BELOW ' + spine[i - 1] +
        ' (' + spine[i - 1] + ' row ' + at[spine[i - 1]].row + ', ' + spine[i] + ' row ' + at[spine[i]].row + ')');
    }

    // THE RINGS. A mirrored pair around the boots — two identical glyphs read as
    // "your two rings" only when they are symmetric.
    assert(at.ring1.row === at.boots.row && at.ring2.row === at.boots.row,
      'ring 1 and ring 2 must flank the boots on one row — ring1 ' + JSON.stringify(at.ring1) + ' ring2 ' + JSON.stringify(at.ring2) + ' boots ' + JSON.stringify(at.boots));
    assert(at.ring1.col < at.boots.col && at.ring2.col > at.boots.col,
      'the ring pair must MIRROR around the boots (one either side), found ring1 col ' + at.ring1.col + ' ring2 col ' + at.ring2.col);
    assert(at.gloves.col === 1 && at.gloves.row === at.pants.row,
      'the gloves belong on the legs\' row, on the hand side — found ' + JSON.stringify(at.gloves));

    // ── 3 · DOM ORDER IS READING ORDER ────────────────────────────────────
    // Tab order and screen readers follow the DOM, not the grid.
    const domOrder = [...grid.querySelectorAll('.td-slot')].map((el) => ({
      row: parseInt(el.style.gridRow, 10), col: parseInt(el.style.gridColumn, 10),
    }));
    for (let i = 1; i < domOrder.length; i++) {
      const a = domOrder[i - 1]; const b = domOrder[i];
      assert(b.row > a.row || (b.row === a.row && b.col > a.col),
        'the doll\'s DOM order must run top-to-bottom, left-to-right (the tab key walks the DOM) — ' +
        'slot ' + i + ' at r' + b.row + 'c' + b.col + ' follows r' + a.row + 'c' + a.col);
    }

    // ── 4 · THE FIGHT RAIL DRAWS THE SAME DOLL ────────────────────────────
    // One shape, two slot sets: the rail carries no belt and no earrings, so it
    // COMPACTS to five rows while every slot it does draw keeps its column and
    // its relative row. Before this change the rail was a different arrangement
    // entirely, which is what Tyler was looking at.
    const CS = window.HearthriseCombatScreens;
    assert(CS && typeof CS.preview === 'function', 'the Fight screen did not boot — its loadout rail cannot be checked');
    const snap = snapshotG();
    const prevTab = window.activeTab;
    try {
      window.showTab('combat');
      try { window.stopCombat(); } catch (e) {}
      window.G.activeMonster = null;
      assert(CS.preview('goblin'), 'preview() refused a live monster id');
      const rail = document.getElementById('fsm-doll');
      assert(rail, 'there is no loadout rail on the Fight screen');
      const railAt = {};
      rail.querySelectorAll('.fsm-slot').forEach((el) => {
        const s = el.getAttribute('data-slot');
        const col = parseInt(el.style.gridColumn, 10);
        const row = parseInt(el.style.gridRow, 10);
        assert(col >= 1 && row >= 1,
          'the Fight rail rendered ' + s + ' with no grid position — it is auto-flowing in array order again, which IS the reported defect');
        railAt[s] = { col, row };
      });
      ['helmet', 'weapon', 'body', 'shield', 'boots', 'ring1', 'ring2', 'cape', 'necklace', 'ammo', 'pants', 'gloves']
        .forEach((s) => assert(railAt[s], 'the Fight rail is missing the ' + s + ' slot'));

      // Same columns as the Character doll, slot for slot.
      Object.keys(railAt).forEach((s) => {
        assert(at[s] && railAt[s].col === at[s].col,
          'slot "' + s + '" sits in column ' + railAt[s].col + ' on the Fight rail and column ' +
          (at[s] && at[s].col) + ' on Character — one component may not draw itself two ways');
      });
      // Same vertical ORDER (rows compact, so compare the ranking, not the number).
      const rank = (m) => Object.keys(m).sort((a, b) => m[a].row - m[b].row || m[a].col - m[b].col);
      const railRank = rank(railAt);
      const charRank = rank(at).filter((s) => railAt[s]);
      assert(railRank.join(',') === charRank.join(','),
        'the Fight rail must read in the same head-to-foot order as the Character doll —\n  rail: ' +
        railRank.join(' ') + '\n  char: ' + charRank.join(' '));

      // Compaction: no reserved empty track for the slots this mount omits.
      const railRows = Math.max(...Object.values(railAt).map((p) => p.row));
      assert(railRows === 5,
        'the Fight rail carries no belt and no earrings, so its sixth row is empty and must be COMPACTED away — measured ' +
        railRows + ' rows (six means an empty 68px track is being reserved, the exact waste that made a sheet hard-code repeat(4,auto))');
      assert(/repeat\(5,/.test(rail.style.gridTemplateRows || ''),
        'the rail must declare only the rows it uses, declares "' + rail.style.gridTemplateRows + '"');
    } finally {
      try { window.stopCombat(); } catch (e) {}
      restoreG(snap);
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  () => tryRun('b369: a REFUSED equip leaves every equipment surface agreeing — including the Fight screen rail (Tyler: sword worn in the rail and sitting in the bag at once)', () => {
    /* `restoreEquipSnapshot` put `G.equipment` back and repainted three
     * inventory surfaces. The b366 fight rail is a FOURTH surface that draws
     * worn gear, and it is the one on screen when you equip from a fight — so
     * the one refusal a player is most likely to see was also the one the
     * rollback could not correct. The test asserts the LIST is complete by
     * counting repaints on each seam, then asserts the state itself rolled
     * back. Proved red by removing the repaintGear() call from
     * repaintEquipSurfaces: the rail counter stays 0. */
    assert(typeof window.restoreEquipSnapshot === 'function', 'the rollback seam must be published for this test to reach it');
    assert(typeof window.equipStateSnapshot === 'function', 'the snapshot seam must exist');

    const G = window.G;
    const snap = snapshotG();
    const CS = window.HearthriseCombatScreens;
    const realRail = CS && CS.repaintGear;
    const realLoadout = window.renderLoadout;
    const realInv = window.renderInventory;
    let railPaints = 0; let loadoutPaints = 0; let invPaints = 0;
    try {
      assert(CS && typeof realRail === 'function',
        'the Fight screen must publish a gear repaint (HearthriseCombatScreens.repaintGear) — without one the rollback has no way to correct the rail');
      CS.repaintGear = function () { railPaints++; };
      window.renderLoadout = function () { loadoutPaints++; };
      window.renderInventory = function () { invPaints++; };

      // The player is wearing nothing in the weapon slot and owns a sword.
      G.equipment = Object.assign({}, G.equipment, { weapon: null });
      G.inventory = Object.assign({}, G.inventory, { steel_sword: 1 });
      const before = window.equipStateSnapshot();

      // The optimistic local swap: worn, and out of the bag.
      G.equipment.weapon = 'steel_sword';
      G.inventory.steel_sword = 0;
      assert(G.equipment.weapon === 'steel_sword', 'the optimistic swap must have applied before we refuse it');

      // The server refuses.
      window.restoreEquipSnapshot(before);

      assert(G.equipment.weapon === null,
        'a refused equip must put the slot back — found ' + G.equipment.weapon);
      assert(G.inventory.steel_sword === 1,
        'a refused equip must put the item back in the bag — found ' + G.inventory.steel_sword);
      assert(railPaints >= 1,
        'the rollback must repaint the FIGHT SCREEN RAIL, or it keeps showing the sword the server refused (this is the reported bug)');
      assert(loadoutPaints >= 1, 'the rollback must repaint the combat loadout strip');
      assert(invPaints >= 1, 'the rollback must repaint the inventory');
    } finally {
      if (CS && realRail) CS.repaintGear = realRail;
      window.renderLoadout = realLoadout;
      window.renderInventory = realInv;
      restoreG(snap);
    }
  }),

  /* b255 IS RETIRED (b515). Two halves, and b515 removed the ground under
     both: it drove `window.simulateAwayCombat()` (a client wrapper b515 left
     with no production caller — it is now dead code, filed) and then
     `window.processOffline()` (whose local engine is deleted), reading
     `G.stats.kills` and `G.gold` — two fields that are SERVER-OF-RECORD and
     ARMED, so a local credit could not land in them anyway.

     paione's report — "combat not working offline" — is guarded, in the two
     places it now lives:
       · the SIMULATION pays: `AWAY-HONEST-1` runs `simulateSpan` (the copy
         hr-accrue runs) for an hour and asserts kills, gold and XP all move,
         byte-identically at 0/99/100/500 lifetime kills; `AWAY-1` proves away
         and live pay the same seeded fight.
       · the RETURN asks: `b230` (visibilitychange), `b260` (the
         signal-independent resume) and `b337`-ON count the accrual requests
         that actually leave the client.
     The RECEIPT half it also asserted (`lastOfflineSummary.combat` exists) is
     `b341` and `AWAY-HONEST-2`, both driven through the real envelope. */

  () => tryRun('b254: Boss of the Day — deterministic daily pick + featured kill bonus', () => {
    const B = window.HearthriseBossOfDay;
    assert(B && typeof B.featuredId === 'function', 'Boss of the Day module must load');
    // Deterministic: same day key → same boss, and it is a real MONSTER.
    const a = B.featuredId('2026-1-1'), b = B.featuredId('2026-1-1');
    assert(a && a === b, 'the daily pick must be deterministic for a given day');
    assert(window.MONSTERS[a], 'the featured boss must be a real monster: ' + a);
    // Different days can differ; across a week it must not be a single stuck id.
    const week = ['2026-1-1','2026-1-2','2026-1-3','2026-1-4','2026-1-5','2026-1-6','2026-1-7'].map(B.featuredId);
    assert(new Set(week).size >= 2, 'the rotation must vary across a week, got ' + JSON.stringify(week));
    // Kill bonus applies to the featured boss only.
    const today = B.featuredId();
    const feat = B.killBonuses(today);
    assert(feat.dropMult > 1 && feat.xpMult > 1, 'featured boss must grant a drop + XP bonus');
    const other = Object.keys(window.MONSTERS).find(id => id !== today);
    const none = B.killBonuses(other);
    assert(none.dropMult === 1 && none.xpMult === 1, 'non-featured monsters get no bonus');
    // The card renders into the Combat panel with a title + a fight/lock button.
    B.render();
    const card = document.getElementById('hr-botd-card');
    assert(card && /Boss of the Day/.test(card.textContent), 'the featured-boss card must render in the combat panel');
    assert(card.querySelector('.botd-foot button'), 'the card must offer a fight/unlock button');
  }),

  // b309: the bug report used to misread the data shapes — skills reported as 0
  // (read .level off an XP number) and inventory as 0 (Array.isArray on an
  // object). That made every report self-contradicting ("Total 483, all skills
  // 0"). Guard the real extraction against the actual G shapes.
  () => tryRun('b309: bug-report state snapshot reads skills + inventory correctly', () => {
    const B = window.HearthriseBugReport;
    assert(B && typeof B._stateSnapshot === 'function', 'bug-report state snapshot must be exposed');
    const G = window.G;
    const save = { skills: G.skills, inventory: G.inventory };
    try {
      // Skills are XP NUMBERS; a level-99 XP must report a real level, not 0.
      const xp99 = (window.XP_TABLE && window.XP_TABLE[98]) || 13034431;
      G.skills = Object.assign({}, G.skills, { mining: xp99, fishing: 0 });
      G.inventory = { bones: 3, coal: 10, iron_ore: 5 };
      const s = B._stateSnapshot();
      assert(s.skillLevels.mining >= 90, 'a maxed skill must report a high level, got ' + s.skillLevels.mining);
      assert(s.skillLevels.fishing === 1 || s.skillLevels.fishing === 0, 'zero XP maps to level 1/0, got ' + s.skillLevels.fishing);
      assert(s.inventoryCount === 3, 'inventory count must count object keys, got ' + s.inventoryCount);
    } finally { G.skills = save.skills; G.inventory = save.inventory; }
  }),

  // b308: the bug report captures layout-diagnostic metrics (for "crunched UI on
  // one device only" reports). Guard the shape + that it never throws.
  () => tryRun('b308: bug-report device metrics are captured and well-formed', () => {
    assert(typeof window.__hrDeviceMetrics === 'function', '__hrDeviceMetrics must be exposed');
    const m = window.__hrDeviceMetrics();
    assert(m && typeof m === 'object', 'metrics must be an object');
    assert(typeof m.dpr === 'number', 'dpr must be a number, got ' + typeof m.dpr);
    assert(typeof m.screen === 'string', 'screen must be a string');
    assert(typeof m.desktopMode === 'boolean' || m.desktopMode === null, 'desktopMode must be boolean/null');
  }),

  // b313 (paione): a companion LEVEL-UP must refresh the doll so the Companion
  // pane's stats stop lagging behind inventory/combat. Refresh fires only on an
  // actual level change, never on an ordinary XP tick.
  () => tryRun('b313: companion level-up refreshes the doll; a plain XP tick does not', () => {
    if(typeof window.awardCompanionXp !== 'function' || typeof window.companionXpToReach !== 'function'
       || typeof window.companionLevelFromXp !== 'function' || !window.COMPANIONS){ skip('no companion api'); return; }
    const G = window.G;
    const savedComp = G.companions;
    const origRefresh = window.refreshAllDolls;
    /* ── b456: THE ARMED CONTRACT FIRST — awardCompanionXp IS A NO-OP ─────────
       Companion XP is a server-owned aggregate (player_progress
       kind='stat' key='companion_xp:<id>') that reconcileCompanions rebuilds from
       every envelope, so under the blob-retire capstone the local award is gated
       OFF: authoring it would make the bar climb and then snap back to server
       truth. That gate is worth its own assertion, because a regression that
       re-opened it would look like this test passing. */
    const C = window.HearthriseCapstone;
    if (C && C.isBlobRetired()) {
      const idA = Object.keys(window.COMPANIONS)[0];
      G.companions = { ownedIds: [idA], equipped: idA, xp: { [idA]: 0 } };
      window.awardCompanionXp(999999);
      assert((G.companions.xp[idA] || 0) === 0,
        'ARMED: the client authored companion XP while the blob is retired — the accrual engine owns that '
        + 'aggregate, so this number is written and then discarded on the next envelope');
    }
    G.companions = savedComp;
    /* ── b515 — THE WRITER MOVED, AND THE REPAINT DID NOT FOLLOW IT ──────────
       This half drove `awardCompanionXp` with the capstone pinned OFF, on the
       premise that the client is still the writer in that position. There is no
       such position: `companions.js blobRetired()` is the literal `true`, so
       `awardCompanionXp` returns on its first line for every caller — the
       level-up branch inside it, including its `refreshAllDolls()` call, is
       UNREACHABLE. Driving it through a seam that selects nothing would have
       graded dead code and called it a pass.

       WHAT IS LIVE, and what is asserted instead:
         (a) the LEVEL IS THE SERVER'S and arrives through `reconcileCompanions`;
             the READ path (`companionLevelFromXp`, `getCompanionBonus`) must
             follow it, because that is what inventory and combat show.
         (b) the client still authors nothing (asserted above).

       ⚠ AND THE b313 DEFECT IS BACK, ON THE PATH THAT RUNS. paione's report was
         "companion stats mismatch": the equipment doll's Companion pane is only
         rebuilt when the doll is, so after a pet LEVELS UP it kept showing the
         old level while inventory and combat — which read the live bonus every
         call — already showed the higher numbers. The fix was a
         `refreshAllDolls()` on the level change inside `awardCompanionXp`. That
         function no longer runs, and `reconcileCompanions` does NOT repaint:
         `applyServerEnvelope` calls `refreshAll()`, which is `updateTopbar` +
         the active tab's renderer and never touches the dolls. So a pet that
         levels up server-side leaves a stale doll exactly as before.
         FIXED (b313 rev.2): the detector and the two repaints moved to
         `accrue.js reconcileCompanions` / announceCompanionLevelUps, reading
         only envelope values. Asserted in the third block below. */
    try {
      const A = window.HearthriseAccrual;
      const id = Object.keys(window.COMPANIONS)[0];
      assert(id, 'need at least one companion');
      const l2 = window.companionXpToReach(2);

      // (a) one XP shy of level 2, stated by the server.
      A.reconcileCompanions(G, { companions: { owned: [id], xp: { [id]: Math.max(0, l2 - 1) }, equipped: id } });
      assert(window.companionLevelFromXp(G.companions.xp[id]) === 1,
        'the fixture is not one XP shy of level 2: ' + G.companions.xp[id]);
      const bonus1 = window.getCompanionBonus();

      // …and then over it, stated by the server on the next envelope.
      A.reconcileCompanions(G, { companions: { owned: [id], xp: { [id]: l2 + 5 }, equipped: id } });
      assert(window.companionLevelFromXp(G.companions.xp[id]) >= 2,
        'a server-stated companion XP total did not reach level 2: ' + G.companions.xp[id]);
      const bonus2 = window.getCompanionBonus();

      /* THE READ PATH FOLLOWED IT. `getCompanionBonus` scales +5% per level
         above 1, so every non-zero channel must have grown — this is what
         inventory and combat show, and it is the half of b313 that still works.
         MUTATION: make reconcileCompanions drop `xp` → both bonuses come out
         equal and this goes red. */
      const moved = Object.keys(bonus2).some((k) => (bonus2[k] || 0) > (bonus1[k] || 0));
      assert(moved,
        'a server-stated companion level-up did not move the live bonus — inventory and combat would show '
        + 'the OLD numbers: ' + JSON.stringify({ lv1: bonus1, lv2: bonus2 }));

      /* ── b313 rev.2 REGRESSION — THE DOLL FOLLOWS THE ENVELOPE ────────────
         The repaint is the reconcile's job now, so it is driven through the
         reconcile: a server-stated level 3 → 4 must refresh the doll and say so
         ONCE; a second envelope at the SAME level must say nothing (an envelope
         arrives every settle, and a notice per settle is noise); and two levels
         crossed in one envelope are one notice naming the level the player is
         NOW, because that is what the doll will show.
         MUTATION: delete announceCompanionLevelUps' call in reconcileCompanions
         → the first assertion goes red; drop the `to > from` guard → the
         same-level assertion goes red. */
      let dolls = 0;
      const seen = [];
      window.refreshAllDolls = () => { dolls++; };
      const off = window.HearthriseEvents.on('companionLevelUp', (p) => seen.push(p));
      try {
        const at = (L) => window.companionXpToReach(L);
        const env = (xpv) => ({ companions: { owned: [id], xp: { [id]: xpv }, equipped: id } });

        // Prior mirror: level 3, stated by the server.
        A.reconcileCompanions(G, env(at(3)));
        dolls = 0; seen.length = 0;

        // (1) 3 → 4: one notice, one repaint.
        A.reconcileCompanions(G, env(at(4)));
        assert(dolls === 1, 'a server-stated companion level-up did not refresh the doll (b313: the '
          + 'Companion pane keeps the old level while inventory and combat show the new one) — refreshAllDolls x' + dolls);
        assert(seen.length === 1 && seen[0].id === id && seen[0].level === 4,
          'expected exactly one companionLevelUp naming level 4, got ' + JSON.stringify(seen));

        // (2) same level again: silence.
        dolls = 0; seen.length = 0;
        A.reconcileCompanions(G, env(at(4) + 3));
        assert(dolls === 0 && seen.length === 0,
          'an envelope that did NOT change the level announced one anyway — every settle would celebrate: '
          + JSON.stringify({ dolls, seen }));

        // (3) two levels in one envelope: ONE notice, naming the final level.
        A.reconcileCompanions(G, env(at(6)));
        assert(seen.length === 1 && seen[0].level === 6,
          'two levels crossed in one envelope must be ONE notice naming the level the player is now, got '
          + JSON.stringify(seen));
        assert(dolls === 1, 'two levels in one envelope must repaint the doll once, got x' + dolls);
      } finally {
        if (typeof off === 'function') off();
      }
    } finally {
      window.refreshAllDolls = origRefresh;
      G.companions = savedComp;
    }
  }),

  // b306 SECURITY: the IAP grant primitive must NOT be reachable from the client.
  () => tryRun('b306: IAP.grant is not exposed on window (console gem/token mint closed)', () => {
    assert(window.IAP && typeof window.IAP === 'object', 'window.IAP must exist for platform wrappers');
    assert(typeof window.IAP.grant === 'undefined', 'IAP.grant must NOT be exposed — it mints currency/entitlements with no validation');
    assert(typeof window.IAP.buy === 'function', 'IAP.buy must still be available');
  }),

  // b306 SECURITY: the admin cheat panel must be owner/dev-only, never openable by
  // a random player on the live host via ?admin=1.
  () => tryRun('b306: admin panel gate refuses non-owners on player hosts', () => {
    const gate = window.__hrAdminGate;
    assert(typeof gate === 'function', '__hrAdminGate must be exposed');
    const OWNER = '53e3c6a4-1168-47fb-a0c2-c7e6dc9a7acc';
    // On a live player host: no session and a random uid are BOTH refused.
    assert(gate('hearthrise.net', null) === false, 'player host + no account must be refused');
    assert(gate('hearthrise.net', 'some-random-player-uid') === false, 'player host + non-owner must be refused');
    assert(gate('bugsquisher1.github.io', 'some-random-player-uid') === false, 'other player host + non-owner refused');
    // The owner is allowed on the live host; dev origins are always allowed.
    assert(gate('hearthrise.net', OWNER) === true, 'owner must be allowed on the live host');
    assert(gate('localhost', null) === true, 'a dev origin is always allowed (testing)');
  }),

  // ═══ b305: SAVE-SYSTEM STRESS + SECURITY BATTERY ═══════════════════════════
  // The cloud save is the backbone now, so these tests try to BREAK it: garbage
  // inputs, adversarial timestamps, the anti-rollback invariant, the upload
  // contract, and clock-manipulation caps. Each is a rule that must never regress.

  // (1) decideRestore must survive garbage and NEVER roll a newer local back.
  () => tryRun('b305: decideRestore is robust vs garbage + enforces anti-rollback', () => {
    const T = 1_700_000_000_000;
    // Garbage cloud timestamps must never win.
    assert(decideRestore({ lastSeen:T, totalLevel:700 }, { __cloudSavedAt:NaN, totalLevel:800 }).action === 'adopt', 'NaN cloud time must not restore');
    assert(decideRestore({ lastSeen:T, totalLevel:700 }, { __cloudSavedAt:-5, totalLevel:800 }).action === 'adopt', 'negative cloud time must not restore');
    assert(decideRestore({ lastSeen:T, totalLevel:700 }, {}).action === 'adopt', 'empty snap → adopt');
    assert(decideRestore({ lastSeen:T }, null).action === 'none', 'null snap → none');
    // THE ANTI-ROLLBACK INVARIANT: a strictly-newer local is NEVER overwritten,
    // no matter how high the cloud level claims to be.
    [0, 1, 700, 999999].forEach((cl) => {
      const d = decideRestore({ lastSeen:T + 10000, totalLevel:700 }, { __cloudSavedAt:T, totalLevel:cl });
      assert(d.action === 'adopt', 'local-newer must never be rolled back (cloudTL=' + cl + '): ' + d.action);
    });
    // A newer cloud with a garbage/absurd level still can't crash the decision.
    assert(typeof decideRestore({ lastSeen:T, totalLevel:700 }, { __cloudSavedAt:T + 1, totalLevel:'900' }).action === 'string', 'string level tolerated');
    // Timeless cloud (no timestamp at all) must not beat a real local.
    assert(decideRestore({ lastSeen:T, totalLevel:700 }, { totalLevel:5000 }).action === 'adopt', 'a cloud with no timestamp must not win on level alone');
  }),

  // (1b) SYMMETRIC ANTI-CLOBBER (b314). The mirror of the thin-cloud guard: a
  // fresh/empty LOCAL must never overwrite a substantial CLOUD, even when local
  // wins on timestamp. This is the exact reset a re-added iOS Home Screen PWA
  // caused — a fresh empty storage sandbox with a current lastSeen uploaded over
  // a real, high-level account. RED against pre-b314 code (returned 'adopt').
  () => tryRun('b314: a fresh/empty local NEVER clobbers a substantial cloud, even when local wins on time', () => {
    const T = 1_700_000_000_000;
    // THE BUG: fresh PWA sandbox → empty local (fresh floor total ≈ 22) with a
    // CURRENT lastSeen, so local is NEWER than the real cloud (synced earlier).
    // Old code returned 'adopt' and uploaded the empty save over a Lv-141 account.
    const bug = decideRestore({ lastSeen:T + 60000, totalLevel:22 }, { __cloudSavedAt:T, totalLevel:141 });
    assert(bug.action === 'restore', 'fresh/empty local (newer) must NOT clobber a real cloud: ' + bug.action + '/' + bug.reason);
    // Even a totally empty (0) local that wins on time must yield to a real cloud.
    assert(decideRestore({ lastSeen:T + 1, totalLevel:0 }, { __cloudSavedAt:T, totalLevel:200 }).action === 'restore', 'empty local must never overwrite a substantial cloud');
    // ── the guard must NOT over-fire (no new false restores / rollbacks) ──
    // Anti-rollback still holds: a REAL, progressed newer local is kept even when
    // the cloud claims a (possibly forged) far-higher level. This is the case a
    // naive symmetric 0.5 ratio would have wrongly rolled back.
    assert(decideRestore({ lastSeen:T + 10000, totalLevel:700 }, { __cloudSavedAt:T, totalLevel:999999 }).action === 'adopt', 'a real newer local must never be rolled back by a bigger cloud level');
    // Normal offline delta on the real device (local a touch ahead, similar size) → adopt+upload.
    assert(decideRestore({ lastSeen:T + 5000, totalLevel:143 }, { __cloudSavedAt:T, totalLevel:141 }).action === 'adopt', 'normal offline progress must still adopt+upload');
    // Brand-new account, no cloud row at all → none (local adopted, uploaded fresh).
    assert(decideRestore({ lastSeen:T, totalLevel:22 }, null).action === 'none', 'a brand-new account with no cloud must adopt its fresh local');
    // Brand-new account, empty cloud row (no real progress) → adopt the fresh local, never a bogus restore.
    assert(decideRestore({ lastSeen:T + 1, totalLevel:22 }, { __cloudSavedAt:T, totalLevel:0 }).action === 'adopt', 'a fresh local vs an empty cloud must adopt, not restore');
    // A newer, LARGER real local vs an older smaller cloud → adopt (never a false restore).
    assert(decideRestore({ lastSeen:T + 1, totalLevel:300 }, { __cloudSavedAt:T, totalLevel:141 }).action === 'adopt', 'a larger newer local must adopt');
  }),

  // (1c) THE RECONCILE GATE — V1, the SHIPPED mechanism (b314). The clobber that
  // reset the account happened in snapshotIfDue BEFORE decideRestore ever ran: an
  // upload-before-pull race. setupSync installs a 5s flush loop AND pagehide/
  // visibilitychange handlers that force snapshotIfDue immediately; with
  // lastSnapshotAt=0 the first tick (or a pagehide as the PWA is backgrounded in
  // the first seconds) uploads the fresh/empty default G over the real cloud, and
  // the later pull then reads the already-destroyed row. The fix: NO upload path
  // may fire until the first pull+reconcile completes. Every upload entry point
  // (the timer, the FORCED pagehide/visibilitychange save, verifyCloudSave's
  // force-upload) routes through snapshotIfDue, which hard-early-returns while
  // held. RED against pre-b314 code: the seam did not exist and a forced snapshot
  // uploaded unconditionally.
  () => tryRun('b314: V1 — all snapshot uploads (incl. forced pagehide) are HELD until reconcile completes', () => {
    const S = window.HearthriseSync;
    assert(S && typeof S.holdSnapshots === 'function' && typeof S.releaseSnapshots === 'function' && typeof S.isSnapshotHeld === 'function', 'reconcile-gate seam (hold/release/isSnapshotHeld) must be exposed');
    // The detailed pull must distinguish an UNKNOWN cloud from a CONFIRMED-empty
    // one — the difference between "hold + retry" and "safe to adopt".
    assert(typeof S.pullLatestDetailed === 'function', 'pullLatestDetailed must be exposed');
    const dp = S.pullLatestDetailed();
    assert(dp && typeof dp.then === 'function', 'pullLatestDetailed must return a promise');
    dp.then((r) => { assert(r && ['ok','empty','error','skip'].indexOf(r.status) !== -1, 'detailed pull status must be one of ok/empty/error/skip'); }, () => {});
    const was = S.isSnapshotHeld();
    try {
      assert(S.isSnapshotHeld() === false, 'the gate must default OPEN so offline/normal play uploads');
      S.holdSnapshots();
      assert(S.isSnapshotHeld() === true, 'holdSnapshots must engage the gate');
      // The ordinary cadence upload AND the FORCED pagehide/close upload must both
      // refuse while held — resolving false without ever POSTing.
      const pCadence = S.snapshotIfDue(false);
      const pForced  = S.snapshotIfDue(true, true);   // the pagehide/visibilitychange path
      assert(pCadence && typeof pCadence.then === 'function', 'snapshotIfDue must return a promise');
      pCadence.then((r) => { assert(r === false, 'a held cadence snapshot must resolve false (no upload)'); }, () => {});
      pForced.then((r) => { assert(r === false, 'a held FORCED (pagehide) snapshot must resolve false (no upload)'); }, () => {});
      S.releaseSnapshots();
      assert(S.isSnapshotHeld() === false, 'releaseSnapshots must open the gate');
    } finally {
      if (was) S.holdSnapshots(); else S.releaseSnapshots();
    }
  }),

  // (1d) V2 — CROSS-ACCOUNT CLOBBER + ACCOUNT-DATA BLEED (b318). signOut() used
  // to clear only the session key, leaving account A's SAVE_KEY blob live. B
  // signs in on the same device, loadLocal() reads A's save into G, and
  // decideRestore compares A's LOCAL against B's CLOUD on timestamp alone. A is
  // newer → 'adopt' → the next snapshot uploads A's character over B's cloud:
  // B's save destroyed, B playing A's character. Neither b314 guard fires (A's
  // save is substantial, nowhere near FRESH_FLOOR). RED against pre-b318 code:
  // the assertion below returned 'adopt'.
  () => tryRun('b318: V2 — a local save owned by ANOTHER account is never adopted or uploaded over this account\'s cloud', () => {
    const T = Date.now();
    const A = 'user-aaaa-1111', B = 'user-bbbb-2222';
    assert(typeof decideLocalOwnership === 'function', 'auth.js must export the save-ownership rule');
    assert(decideLocalOwnership(A, B) === 'foreign', 'a save stamped with a different user is foreign');
    assert(decideLocalOwnership(B, B) === 'same', 'a save stamped with the signed-in user is its own');
    // THE BUG, exactly: A's local is NEWER and LARGER than B's cloud.
    const v2 = decideRestore({ lastSeen: T + 60000, totalLevel: 1500, owner: A, currentUser: B },
                             { __cloudSavedAt: T, totalLevel: 1200 });
    assert(v2.action !== 'adopt', 'a foreign local must NEVER be adopted (it would upload A over B\'s cloud)');
    assert(v2.action === 'foreign', 'a foreign local must be reported as foreign so the caller parks it');
    // …and identity beats freshness in BOTH directions: a foreign local must not
    // be uploaded even when there is no cloud at all to compare it against
    // (a brand-new second account would otherwise be born as account A).
    assert(decideRestore({ lastSeen: T + 60000, totalLevel: 1500, owner: A, currentUser: B }, null).action === 'foreign',
      'a foreign local with no cloud must not be adopted as this account\'s save');
    // The device-side half: park is a MOVE, not a delete, and it stops autosave.
    assert(typeof window.parkLocalSave === 'function' && typeof window.unparkOwnSave === 'function',
      'legacy.js must expose the park/unpark primitives the reconcile path calls');
    // The stamp is DEVICE-LOCAL identity. If it ever synced, every device would
    // inherit the first device's owner and the guard would mis-fire account-wide.
    const snapOut = window.HearthriseEvents.snapshot(Object.assign({}, window.G, { _saveOwner: A }));
    assert(!('_saveOwner' in snapOut), 'the owner stamp must never ride to the cloud (it is `_`-prefixed scratch)');
  }),

  // (1e) The two ways this fix could itself cause data loss. Both must be safe.
  () => tryRun('b318: V2 — same-owner sign-out→sign-in keeps the save, and a legacy UNSTAMPED save is never discarded', () => {
    const T = Date.now();
    const B = 'user-bbbb-2222';
    // Same owner: ordinary rules, unchanged. Offline progress still adopts+uploads.
    assert(decideRestore({ lastSeen: T + 5000, totalLevel: 143, owner: B, currentUser: B }, { __cloudSavedAt: T, totalLevel: 141 }).action === 'adopt',
      'a same-owner local with offline progress must still adopt (no false wipe of unsynced progress)');
    // LEGACY POLICY: every save that predates b318 has no stamp. Discarding those
    // would wipe the entire live beta on upgrade, so unstamped == adopt-and-stamp.
    assert(decideLocalOwnership(null, B) === 'unstamped', 'a pre-b318 save has no owner stamp');
    assert(decideRestore({ lastSeen: T + 5000, totalLevel: 900, currentUser: B }, { __cloudSavedAt: T, totalLevel: 890 }).action === 'adopt',
      'a legacy unstamped save must NOT be treated as foreign and discarded');
    // Never accuse on a guess: if we cannot tell who is signed in, behaviour is
    // exactly the pre-b318 behaviour.
    assert(decideLocalOwnership('someone', null) === 'unknown-session', 'no session → we cannot judge ownership');
    assert(decideRestore({ lastSeen: T + 5000, totalLevel: 900, owner: 'someone' }, { __cloudSavedAt: T, totalLevel: 890 }).action === 'adopt',
      'an unknown session must not turn a save foreign');
    // The b314 invariants are untouched by the ownership layer.
    assert(decideRestore({ lastSeen: T + 10000, totalLevel: 700, owner: B, currentUser: B }, { __cloudSavedAt: T, totalLevel: 999999 }).action === 'adopt',
      'anti-rollback: a real newer local is still never rolled back');
    assert(decideRestore({ lastSeen: T + 60000, totalLevel: 22, owner: B, currentUser: B }, { __cloudSavedAt: T, totalLevel: 141 }).action === 'restore',
      'V7 thin-guard: a fresh local still never clobbers a substantial cloud');
    assert(decideRestore({ lastSeen: T, totalLevel: 742, owner: B, currentUser: B }, null).action === 'none', 'no cloud → none');
    // Un-parking is same-owner ONLY — a park must never be handed to another user.
    const raw = JSON.stringify({ _saveOwner: B, lastSeen: T, gold: 12345 });
    const key = 'hearthrise:save-backup:signout:' + B;
    const pick = window.chooseParkedSave([{ key, raw }, { key: 'x', raw: 'not json' }]);
    assert(pick && pick.key === key && pick.at === T, 'the freshest parseable parked save wins; garbage is never chosen');
    assert(window.chooseParkedSave([{ key: 'x', raw: '{{' }]) === null, 'an unparseable park is never restored');
  }),

  // (1f) The park/unpark ROUND TRIP against real storage. A park is a MOVE, and
  // the move must be reversible for its owner — that is the whole reason
  // signOut() parks instead of deleting. If this ever became a delete, every
  // sign-out would cost the player any progress not yet in the cloud.
  () => tryRun('b318: V2 — parking a save is recoverable (sign-out never destroys unsynced progress)', () => {
    const SAVE_KEY = 'hearthbound-save-v2';
    const OWNER = 'smoke-owner-' + Date.now();
    const liveBefore = localStorage.getItem(SAVE_KEY);
    const parkedWas = window.__saveParked;
    const probe = JSON.stringify({ _saveOwner: OWNER, lastSeen: Date.now(), gold: 987654 });
    const parkKey = 'hearthrise:save-backup:signout:' + OWNER;
    try {
      localStorage.setItem(SAVE_KEY, probe);
      const key = window.parkLocalSave('signout');
      assert(key === parkKey, 'a park lands in a namespaced, owner-keyed backup slot');
      assert(localStorage.getItem(parkKey) === probe, 'the parked copy must be byte-identical — a park is never a delete');
      assert(localStorage.getItem(SAVE_KEY) === null, 'the parked save must leave the live slot so the next account boots clean');
      assert(window.__saveParked === true, 'autosave must be suppressed after a park or it would resurrect the save');
      // A DIFFERENT account must not be given this park back…
      assert(window.chooseParkedSave([]) === null, 'no candidates → nothing restored');
      // …but the owner gets it back verbatim.
      const restored = window.chooseParkedSave([{ key: parkKey, raw: localStorage.getItem(parkKey) }]);
      assert(restored && restored.raw === probe, 'the owner\'s parked save is returned intact');
      assert(JSON.parse(restored.raw).gold === 987654, 'parked progress survives the round trip');
    } finally {
      try { localStorage.removeItem(parkKey); } catch (e) {}
      if (liveBefore === null) { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
      else { try { localStorage.setItem(SAVE_KEY, liveBefore); } catch (e) {} }
      window.__saveParked = parkedWas;
    }
  }),

  // (2) THE UPLOAD CONTRACT: the snapshot must carry all persistent progress and
  // NEVER carry in-flight/transient state or internal scratch. This is the guard
  // that catches someone adding a progress field to NO_SYNC (silent cloud loss)
  // or leaking transient combat state into the save.
  () => tryRun('b305: cloud snapshot carries progress, never transient/in-flight/scratch', () => {
    const E = window.HearthriseEvents;
    assert(E && typeof E.snapshot === 'function', 'snapshot must be exposed');
    const G = window.G;
    const saved = { am:G.activeMonster, mh:G.monsterHp, cl:G.combatLog, as:G.activeSkill, sp:G.skillProgress, los:G.lastOfflineSummary };
    try {
      // Force transient state to be present so the exclusion is actually exercised.
      G.activeMonster = 'slime'; G.monsterHp = 7; G.combatLog = ['x']; G.activeSkill = 'woodcutting'; G.skillProgress = 0.5; G.lastOfflineSummary = { hrs:1 };
      const snap = E.snapshot(G);
      assert(snap && typeof snap === 'object', 'snapshot must return an object');
      ['activeMonster','monsterHp','monsterMaxHp','playerHp','playerMaxHp','activeSkill','skillTargetId','skillProgress','skillMs','activeArtisanRecipe','combatLog','lastOfflineSummary']
        .forEach((k) => assert(!(k in snap), 'transient/in-flight key must NOT be uploaded: ' + k));
      Object.keys(snap).forEach((k) => assert(k.charAt(0) !== '_', 'internal scratch key must not be uploaded: ' + k));
      ['skills','inventory','gold','bank','equipment','stats'].forEach((k) => assert(k in snap, 'persistent progress key MUST be uploaded: ' + k));
      // Must be JSON-safe (no functions/circular) — a throw here would mean a save that silently fails to upload.
      const rt = JSON.parse(JSON.stringify(snap));
      assert(rt.gold === snap.gold, 'snapshot must round-trip through JSON without loss');
    } finally {
      G.activeMonster = saved.am; G.monsterHp = saved.mh; G.combatLog = saved.cl; G.activeSkill = saved.as; G.skillProgress = saved.sp; G.lastOfflineSummary = saved.los;
    }
  }),

  // ═══ b319: TELEMETRY CONTAINMENT ═══════════════════════════════════════════
  // THE INCIDENT (production, measured): `game_events` reached 1,601,032 rows /
  // 229 MB from SIX players in 3.45 days — 94% of the entire database, 77,320
  // rows per player per day. Cause: sync.js subscribed with on('*') and wrote one
  // row per event, and five of the eleven emit sites live inside per-kill /
  // per-item / per-tick loops (kill 899,745 · gather 403,142 · eat 109,314 ·
  // buffApply 108,565 · companionProc 73,850). These tests are the contract that
  // it cannot come back. All four are RED against pre-b319 code.

  // (2b-i) The allowlist. The five loop-driven types must never reach the upload
  // buffer or the POST body; the five low-frequency ones must.
  () => tryRun('b319: high-frequency events NEVER reach the network; allowlisted ones do', () => {
    const S = window.HearthriseSync, E = window.HearthriseEvents;
    assert(S && typeof S.getEventBuffer === 'function' && typeof S.buildEventRows === 'function', 'b319 telemetry seam must be exposed');
    const HI = ['kill', 'gather', 'eat', 'buffApply', 'companionProc'];
    const LO = ['companionLevelUp', 'companionUnlock', 'companionEquip', 'questClaim', 'dungeonClear'];
    const saved = S.getEventBuffer();          // the suite must not pollute real telemetry
    const wasEnabled = S.isEventLogEnabled();
    try {
      S.setEventLogEnabled(true); S.resetEventLimiter(); S.restoreEventBuffer([]);
      // 100 kills + 100 bites of food is 200 rows under the old code.
      for (let i = 0; i < 100; i++) { E.emit('kill', { monsterId: 'smoke-slime' }); E.emit('eat', { foodId: 'smoke-bread' }); }
      HI.forEach((t) => E.emit(t, { smoke: true }));
      assert(S.getEventBuffer().length === 0, 'no high-frequency event may enter the upload buffer (got ' + S.getEventBuffer().length + ')');
      LO.forEach((t) => E.emit(t, { smoke: true }));
      const buf = S.getEventBuffer();
      LO.forEach((t) => assert(buf.some((ev) => ev.type === t), 'allowlisted event must be uploaded: ' + t));
      // …and the literal POST body flush() builds carries none of the hot types.
      const rows = S.buildEventRows(buf.concat(HI.map((t) => ({ type: t, payload: {}, ts: Date.now() }))), 'smoke-user');
      HI.forEach((t) => assert(!rows.some((r) => r.event_type === t), 'network payload must not contain ' + t));
      assert(rows.length === LO.length, 'the payload is exactly the allowlisted rows');
      assert(rows[0].user_id === 'smoke-user' && typeof rows[0].occurred_at === 'string', 'row shape unchanged (user_id/event_type/payload/occurred_at)');
      // Layer 1 is the SUBSCRIPTION: a hot event costs nothing at all because
      // sync.js never subscribes to it (that is why the 200 emits above did not
      // even reach the gate, and why the drop counter is still clean here).
      assert(S.getEventStats().dropped.notAllowed === 0, 'hot events must not even reach the gate — they are never subscribed');
      HI.forEach((t) => assert(!S.isEventAllowed(t), t + ' must not be on the network allowlist'));
      LO.forEach((t) => assert(S.isEventAllowed(t), t + ' must be on the network allowlist'));
      // Layer 2 is the GATE inside enqueue — defence in depth, so a reintroduced
      // on('*') subscription is still contained, and the drop is COUNTED.
      HI.forEach((t) => assert(S.admitEvent({ type: t, payload: {}, ts: Date.now() }) === false, 'the enqueue gate must also reject ' + t));
      const st = S.getEventStats();
      assert(st.dropped.notAllowed === HI.length, 'a gated drop must be counted (got ' + st.dropped.notAllowed + ')');
      assert(st.dropped.byType.kill === 1 && st.dropped.byType.eat === 1, 'drops are attributed per type');
    } finally {
      S.resetEventLimiter(); S.restoreEventBuffer(saved); S.setEventLogEnabled(wasEnabled);
    }
  }),

  // (2b-ii) Removing them from the NETWORK must not remove them from the GAME.
  // events.js is a pure in-process bus that other features subscribe to; if this
  // regressed, the fix would have silently broken gameplay instead of the DB.
  () => tryRun('b319: the in-process bus still delivers every event, including the un-uploaded ones', () => {
    const E = window.HearthriseEvents;
    const ALL = ['kill', 'gather', 'eat', 'buffApply', 'companionProc', 'companionLevelUp', 'companionUnlock', 'companionEquip', 'questClaim', 'dungeonClear'];
    const S = window.HearthriseSync;
    const saved = S.getEventBuffer();
    const seen = {}, offs = [];
    let starSeen = 0;
    try {
      ALL.forEach((t) => offs.push(E.on(t, (p) => { seen[t] = p; })));
      offs.push(E.on('*', () => { starSeen++; }));
      ALL.forEach((t) => E.emit(t, { probe: t }));
      ALL.forEach((t) => assert(seen[t] && seen[t].probe === t, 'local subscriber must still receive: ' + t));
      assert(starSeen === ALL.length, "a local on('*') subscriber still sees every event (got " + starSeen + ')');
      assert(window.__eventLog.some((e) => e.type === 'kill'), 'the local event log still records dropped-from-network events for debugging');
    } finally {
      offs.forEach((off) => { try { off(); } catch (e) {} });
      S.resetEventLimiter(); S.restoreEventBuffer(saved);
    }
  }),

  // (2b-iii) The BACKSTOP. The allowlist is a judgement call; the rate cap is the
  // guarantee. If someone later allowlists an event and puts its emit inside a
  // loop, the cap — not the database — absorbs it.
  () => tryRun('b319: the rate cap engages, drops (never buffers) the overflow, and counts it', () => {
    const S = window.HearthriseSync;
    const saved = S.getEventBuffer(), wasEnabled = S.isEventLogEnabled();
    try {
      S.setEventLogEnabled(true); S.resetEventLimiter(); S.restoreEventBuffer([]);
      const lim = S.getEventStats().limits;
      assert(lim.perMinute > 0 && lim.perHour >= lim.perMinute && lim.perFlush > 0, 'per-flush/per-minute/per-hour caps must all exist');
      const t0 = 1_700_000_000_000;
      let ok = 0;
      for (let i = 0; i < lim.perMinute + 50; i++) if (S.admitEvent({ type: 'questClaim', payload: {}, ts: t0 }, t0 + i)) ok++;
      assert(ok === lim.perMinute, 'exactly the per-minute cap is admitted (got ' + ok + '/' + lim.perMinute + ')');
      assert(S.getEventStats().dropped.rateLimited === 50, 'the overflow is counted, not silently lost');
      assert(S.getEventBuffer().length === 0, 'a rate-limited event must be DROPPED, never buffered (unbounded growth was the bug)');
      // A new minute reopens the tap — until the hourly ceiling closes it.
      let hourOk = ok;
      for (let m = 1; m < 20; m++) for (let i = 0; i < lim.perMinute; i++) if (S.admitEvent({ type: 'questClaim', payload: {}, ts: t0 }, t0 + m * 61000 + i)) hourOk++;
      assert(hourOk === lim.perHour, 'the hourly ceiling caps a sustained flood at ' + lim.perHour + ' (got ' + hourOk + ')');
      // Worst case is now ~24x the hourly cap per day vs the 77,320/player/day measured.
      assert(lim.perHour * 24 < 10000, 'the daily worst case must stay far below the incident rate');
    } finally {
      S.resetEventLimiter(); S.restoreEventBuffer(saved); S.setEventLogEnabled(wasEnabled);
    }
  }),

  // (2b-iv) THE KILL SWITCH. Before b319 the only way to stop event writes was to
  // kill the sync config — which also killed cloud saves, so nobody ever did it.
  // Turning telemetry off must leave the save path completely untouched.
  () => tryRun('b319: the kill switch stops event upload WITHOUT disabling cloud saves', () => {
    const S = window.HearthriseSync, E = window.HearthriseEvents;
    const saved = S.getEventBuffer(), wasEnabled = S.isEventLogEnabled();
    const wasPaused = S.isPaused(), wasHeld = S.isSnapshotHeld();
    const before = S.getConfig() || {};
    try {
      S.resetEventLimiter(); S.restoreEventBuffer([]);
      assert(S.setEventLogEnabled(false) === false && S.isEventLogEnabled() === false, 'the switch must actually turn off');
      ['companionLevelUp', 'questClaim', 'dungeonClear'].forEach((t) => E.emit(t, { smoke: true }));
      assert(S.getEventBuffer().length === 0, 'no event may be uploaded while logging is off');
      assert(S.getEventStats().dropped.disabled === 3, 'events dropped by the switch are counted');
      // THE POINT: the save path is untouched by the telemetry switch.
      assert(S.isPaused() === wasPaused, 'the event switch must not pause cloud sync');
      assert(S.isSnapshotHeld() === wasHeld, 'the event switch must not touch the b314 reconcile gate');
      const snap = E.snapshot(window.G);
      assert(snap && 'gold' in snap && 'skills' in snap, 'the cloud SAVE snapshot still builds with telemetry off');
      const cfg = S.getConfig();
      assert(typeof S.snapshotIfDue === 'function', 'the save path (snapshotIfDue) is still wired');
      assert(cfg && cfg.eventLog === false, 'the switch lives on its OWN config flag — not on endpoint/snapshotEndpoint');
      assert(cfg.snapshotEndpoint === before.snapshotEndpoint && cfg.endpoint === before.endpoint, 'disabling telemetry must not unwire any endpoint');
      // …and it flips back on.
      assert(S.setEventLogEnabled(true) === true, 'the switch must be reversible');
      E.emit('questClaim', { smoke: true });
      assert(S.getEventBuffer().length === 1, 'allowlisted events resume once re-enabled');
    } finally {
      S.resetEventLimiter(); S.restoreEventBuffer(saved); S.setEventLogEnabled(wasEnabled);
    }
  }),

  // (3) CLOCK MANIPULATION: a forward clock jump (or a very long absence) must be
  // CAPPED at the daily offline budget — it can never mint unbounded progress.
  /* b305-CAP IS RETIRED (b515). It set the watermark ten years back, called
     `processOffline()` and asserted the summary's `hrs` was clipped to the
     budget. The clipping is not the client's any more: `offlineBudget` is
     SERVER-OF-RECORD (the server's `accrued_to`), the grant is sized by
     `src/core/away.js creditWindow` on both sides, and the receipt is whatever
     the envelope stated.

     The property — a forward clock jump cannot mint unlimited progress — is
     asserted on that function directly by the re-pointed `AWAY-BUDGET-1`
     (an 18h absence at a 12h cap credits exactly 12h, reports a real
     `unpaidMs`, and a caller asking for 999h against a 1h absence gets 1h),
     and server-side by `clampGuard` + `dayBudgetGuard` in
     tests/accrual-engine.mjs, which run the real `computeAccrual` against the
     reachable ceiling. `b305: a future watermark (backward clock) grants
     nothing` immediately below is UNCHANGED and still passes — it asserts an
     absence of movement, which survives the engine moving house.
     The b307 per-absence rule is `AWAY-22` + `AWAY-BUDGET-1` (b). */

  // (4) BACKWARD clock: a watermark in the FUTURE (clock set back, or a bad synced
  // timestamp) must not grant negative/garbage progress — it clamps to zero.
  () => tryRun('b305: a future watermark (backward clock) grants nothing, never garbage', () => {
    if(typeof window.processOffline !== 'function'){ skip('no processOffline'); return; }
    const G = window.G;
    const save = { offlineBudget:G.offlineBudget, lastSeen:G.lastSeen, gold:G.gold, skills:G.skills, activeMonster:G.activeMonster, activeSkill:G.activeSkill };
    const hiddenDesc = Object.getOwnPropertyDescriptor(document, 'hidden');
    try {
      Object.defineProperty(document, 'hidden', { configurable:true, get:()=>false });
      G.activeSkill = null; G.activeMonster = null;
      const now = Date.now();
      const beforeGold = G.gold, beforeWc = (G.skills && G.skills.woodcutting) || 0;
      G.lastSeen = now + (365 * 24 * 3600000);                        // watermark 1 year in the FUTURE
      G.offlineBudget = { dayKey:0, usedMs:0, at: now + (365 * 24 * 3600000) };
      window.processOffline();
      assert((G.gold||0) === beforeGold, 'a future watermark must not change gold (was ' + beforeGold + ', now ' + G.gold + ')');
      assert(((G.skills && G.skills.woodcutting)||0) === beforeWc, 'a future watermark must not grant XP');
    } finally {
      if(hiddenDesc) Object.defineProperty(document, 'hidden', hiddenDesc); else { try{ delete document.hidden; }catch(e){} }
      Object.assign(G, { offlineBudget:save.offlineBudget, lastSeen:save.lastSeen, gold:save.gold, skills:save.skills, activeMonster:save.activeMonster, activeSkill:save.activeSkill });
    }
  }),

  /* b303-GATHER, b303-ARTISAN AND b297 ARE RETIRED (b515), together, because
     they were three readings of ONE thing: "the real gated `processOffline()`
     credits an absence". Each stood a character in an activity, rewound the
     watermark, called `processOffline()` and read `G`.

     That call no longer credits anything — b515 deleted the ~500-line local
     away engine behind it, so `processOffline` asks hr-accrue and applies the
     answer — and the fields they read (`G.skills`, `G.stats.kills`) are
     SERVER-OF-RECORD and ARMED, so even a working local grant could not land in
     them. Two independent reasons the assertion could no longer mean what it
     says.

     THE SIMULATION each one was really about is covered, on the engine the Edge
     Function runs, by tests that ARE re-pointed:
       · gather   — `AWAY-HONEST-4` (simulateSkillSpan: an hour of woodcutting
                    pays XP and items, at zero lifetime kills, identically at
                    500) and `AWAY-19 PARITY` (N live actions == one core span).
       · artisan  — `b204` and `b225` (simulateArtisanSpan: a cooking session
                    progresses, burns on the same math, consumes 1:1).
       · combat   — `AWAY-HONEST-1` (simulateSpan pays from kill ONE, byte-
                    identically at 0/99/100/500 lifetime kills) and `AWAY-1`.
     THE GATE they were about — that the return actually ASKS — is
     `b337: with the switch ON, processOffline puts the CONTRACT request on the
     wire`, `B340-8` and the re-pointed `b230`/`b260`/`b261` below, which drive
     the real resume paths and count the requests that leave.
     paione's 71->71 report is therefore still guarded end to end; what is gone
     is the client that used to answer it. */

  /* b267 — RE-POINTED at the one combat engine. This arm asked for
     `window.processOfflineCombat`, deleted when the away-time ruling collapsed the
     two loops into one, so it has declared an honest skip on every run since and
     guarded nothing. The rig is AWAY-1b's: the SHIPPED combat ctx (whose
     `fx.autoEat` is the real `resolveAutoEat` decision) inside `_withOfflineReplay`.
     THE SAME SEEDED SPAN RUNS TWICE, bag and empty: the empty run MUST fall. */
  () => tryRun('b267: auto-eat works AWAY — the same seeded span kills a fighter with an empty bag and is survived with food (Tyler asked to verify)', () => {
    const C = window.HearthriseCore, P = window.HearthrisePresence, A = window.HearthriseAuto, S = window.HearthriseCombatSim;
    assert(C && C.combatSim && S && typeof S.ctx === 'function' && P && typeof P._withOfflineReplay === 'function' && A && typeof A.setEat === 'function',
      'the engine, the away-replay seam and the eat setting must all be reachable');
    const snap = snapshotG(), origBonus = window.getBonus, beforeEat = A.getEat();
    let wasParked = false;
    try {
      wasParked = (typeof A._parkEatSync === 'function') ? A._parkEatSync(true) : false;
      window.getBonus = () => 0;
      const G = window.G, FOOD = 'cooked_shrimp', STOCK = 500, m = window.MONSTERS.wolf;
      const arm = () => { G.activeMonster = 'wolf'; G.monsterHp = m.hp; G.monsterMaxHp = m.hp; };
      const run = (stock) => {
        G.buffs = []; G.quests = []; G.recoveringUntilMs = 0; G.playerMaxHp = 40; G.playerHp = 40;
        G.skills = Object.assign({}, G.skills, { attack: 3000, strength: 3000, defense: 0, hitpoints: 5000 });
        G.inventory = Object.assign({}, G.inventory, { [FOOD]: stock });
        G.traits = Object.assign({}, G.traits, { auto_eat: true, auto_eat_2: true });
        G.stats = Object.assign({}, G.stats, { kills: 0, crits: 0, deaths: 0, rareDrops: 0 });
        A.setEat({ foodId: FOOD, enabled: true, threshold: 0.6 });
        arm(); C.reseed(0x267AEA7);
        /* Re-arm the foe each fall: a dead wolf stops swinging. */
        P._withOfflineReplay(() => { const ctx = S.ctx();
          for (let i = 0; i < 600 && G.playerHp > 0; i++) { if (!G.activeMonster) arm(); C.combatSim.simulateTick(G, ctx); } });
        return { died: G.stats.deaths > 0 || G.playerHp <= 0, ate: stock - (Number(G.inventory[FOOD]) || 0), hp: G.playerHp };
      };
      const starved = run(0), fed = run(STOCK);
      assert(starved.died, 'the rig is not lethal, so surviving proves nothing: ' + JSON.stringify(starved));
      assert(fed.ate > 0, 'auto-eat must fire on the away path, ate=' + fed.ate);
      assert(!fed.died, 'with food set the away fighter must survive, ' + JSON.stringify(fed));
    } finally {
      window.getBonus = origBonus;
      try { A.setEat(beforeEat); } catch (e) {}
      if (typeof A._parkEatSync === 'function') A._parkEatSync(wasParked);
      restoreG(snap);
    }
  }),

  // b297: a killing blow must be VISIBLE on the stage. killMonster() respawns
  // the foe to full HP in the same tick, so the HP-diff that pops damage numbers
  // saw "full→full" on a one-shot and drew nothing — you only got a corner toast.
  // The wrapper now detects a kill via the kills counter and plays a death FX.
  () => tryRun('b297: a kill triggers the arena death FX (foe-dying / Defeated stamp)', () => {
    if(typeof window.combatTick !== 'function' || !window.HearthriseArenaStage){ skip('no combat engine'); return; }
    const snap = snapshotG();
    try {
      const G = window.G;
      // Pick any real monster and stage the arena.
      const id = Object.keys(window.MONSTERS || {})[0];
      assert(id, 'need at least one monster');
      G.activeMonster = id;
      const m = window.MONSTERS[id];
      G.playerHp = G.playerMaxHp = 100000;   // never die mid-test
      window.HearthriseArenaStage.refresh();  // builds + shows the arena-vs
      const foeP = document.querySelector('#panel-combat .arena-vs .arena-side.foe .arena-portrait');
      if(!foeP){ skip('arena not mounted in harness'); return; }
      // Force a one-shot each attempt until a kill lands (accuracy is < 100%).
      let killed = false;
      for(let i=0;i<80 && !killed;i++){
        G.monsterMaxHp = m.hp; G.monsterHp = 1; G.playerHp = G.playerMaxHp;
        const k0 = (G.stats && G.stats.kills) || 0;
        window.combatTick();
        if(((G.stats && G.stats.kills) || 0) > k0) killed = true;
      }
      assert(killed, 'a 1-HP foe should die within a few ticks');
      // The FX children/classes persist synchronously (their removal is on a timer).
      assert(foeP.classList.contains('foe-dying') || foeP.querySelector('.defeat-tag'),
        'a kill must show the death FX on the foe portrait');
    } finally {
      const foeP = document.querySelector('#panel-combat .arena-vs .arena-side.foe .arena-portrait');
      if(foeP){ foeP.classList.remove('foe-dying'); const t=foeP.querySelector('.defeat-tag'); if(t) t.remove(); }
      restoreG(snap);
    }
  }),

  // b299: the cloud-save observability tools — status API + verify self-test.
  // The real sync path now records success (cloudSyncedAt) and exposes a
  // round-trip verifier. Guard the CONTRACT synchronously (the verify itself
  // hits the network; the harness runs offline, so we only assert it's wired,
  // safe, and returns a promise instead of throwing).
  () => tryRun('b299: cloud verify tool + status API are wired and offline-safe', () => {
    const S = window.HearthriseSync;
    assert(S && typeof S.verifyCloudSave === 'function', 'verifyCloudSave must be exposed');
    assert(typeof S.getLastCloudSaveAt === 'function', 'getLastCloudSaveAt must be exposed');
    assert(typeof S.getLastCloudSaveAt() === 'number', 'getLastCloudSaveAt must return a number');
    assert(typeof S.snapshotIfDue === 'function', 'snapshotIfDue must be exposed');
    const p = S.verifyCloudSave();                     // must not throw synchronously
    assert(p && typeof p.then === 'function', 'verifyCloudSave must return a promise');
    p.then(function(r){
      // When unconfigured/offline it must fail cleanly with a reason, never throw.
      assert(!r || typeof r === 'object', 'verify result must be an object');
    }, function(){ /* swallow: offline rejection is fine in the harness */ });
    // b301: concurrent-device detection contract.
    assert(typeof S.checkConcurrentDevice === 'function', 'checkConcurrentDevice must be exposed');
    assert(typeof S.getDeviceId === 'function', 'getDeviceId must be exposed');
    const dev = S.getDeviceId();
    assert(typeof dev === 'string' && dev.length > 0, 'getDeviceId must return a stable non-empty id');
    assert(S.getDeviceId() === dev, 'device id must be stable across calls');
    const cp = S.checkConcurrentDevice();
    assert(cp && typeof cp.then === 'function', 'checkConcurrentDevice must return a promise');
    cp.then(function(r){ assert(r && typeof r.concurrent === 'boolean', 'result has a boolean concurrent flag'); },
            function(){ /* offline in harness is fine */ });
    // b302: single-active-device enforcement contract. The cardinal safety
    // property — never evict on error/offline — is asserted here: with no
    // claimEndpoint configured (harness), a poll must resolve to skip/error and
    // must NOT pause sync.
    assert(typeof S.claimSession === 'function', 'claimSession must be exposed');
    assert(typeof S.checkSessionClaim === 'function', 'checkSessionClaim must be exposed');
    assert(typeof S.pauseSync === 'function', 'pauseSync must be exposed');
    assert(typeof S.isPaused === 'function', 'isPaused must be exposed');
    assert(S.isPaused() === false, 'a fresh session must not be paused');
    const sc = S.checkSessionClaim();
    assert(sc && typeof sc.then === 'function', 'checkSessionClaim must return a promise');
    sc.then(function(r){
      assert(r && ['skip','error','owner','evicted','reclaimed','claimed','paused'].indexOf(r.status) !== -1, 'claim status must be known: ' + (r && r.status));
      assert(r.status !== 'evicted', 'an unconfigured/offline poll must NEVER evict');
      assert(S.isPaused() === false, 'a poll that could not confirm ownership must not pause sync');
    }, function(){ /* offline in harness is fine */ });
  }),

  /* ── REGRESSION: the "verify cloud save" diagnostic must not read a
     RETIRED table, and must describe the truth a player's progress lives in ────
     THE BUG. verifyCloudSave forced an upload and then read `game_saves` back.
     The blob stopped being uploaded pre-cutover and 2026-09-07-game-saves-revoke.sql
     took the client's write grants away, so the read-back was always empty and
     every player who pressed the button — in the ONE tool you open when you are
     afraid of losing progress — was told "Uploaded, but reading it back returned
     nothing." A false data-loss alarm on a perfectly healthy account.

     THREE PROPERTIES, and each one fails without the fix:
       1. the diagnostic issues ZERO requests to `game_saves` (the retired read
          is gone, not merely unused);
       2. it renders the realm's projection — version + last settle + the figures
          — from the hr_load envelope;
       3. when that projection read FAILS it says so, fail-closed, and does not
          imply a loss it has not observed. */
  () => tryRunAsync('b519 regression: "verify cloud save" reads the realm projection, never the retired game_saves', async () => {
    const S = window.HearthriseSync;
    assert(S && typeof S.verifyCloudSave === 'function', 'verifyCloudSave must be exposed');
    assert(typeof S.describeCloudSave === 'function', 'describeCloudSave (the pure copy) must be exposed');
    assert(typeof S.readRealmProjection === 'function', 'readRealmProjection must be exposed');
    const realFetch = window.fetch;
    /* The forced residue save inside the diagnostic stamps this display field on
       success; the probe must not leave a fabricated save time on the live G. */
    const hadSyncedAt = window.G ? window.G.cloudSyncedAt : undefined;
    const urls = [];
    const now = Date.now();
    const envelope = {
      ok: true, version: 42, now: new Date(now).toISOString(),
      state: { slot: 0, gold: 1234, gems: 7, hp: 10, max_hp: 10, bank_cap: 100,
        active_kind: 'idle', active_id: null, active_since: null,
        accrued_to: new Date(now - 600000).toISOString() },
      skills: { woodcutting: { xp: 100, level: 5 }, mining: { xp: 50, level: 3 } },
      inventory: {}, equipment: {}, farm: [], progress: [],
    };
    try {
      S.resetAuthGate();
      window.fetch = function (u, init) {
        const url = String((u && u.url) || u || '');
        urls.push(url);
        if (/rpc\/hr_load/.test(url)) return Promise.resolve(new Response(JSON.stringify(envelope), { status: 200 }));
        return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
      };
      const r = await S.__withConfig({
        endpoint: 'https://example.invalid/rest/v1/game_events',
        snapshotEndpoint: 'https://example.invalid/rest/v1/game_saves',
        claimEndpoint: null,
        apiKey: 'anon', userId: () => 'u1', authToken: () => 'tok',
        onSyncFailure: () => {}, onSyncRecovered: () => {}, onAuthExpired: () => {},
      }, () => S.verifyCloudSave());

      // (1) THE RETIRED TABLE IS NEVER TOUCHED. Note the config still NAMES
      //     game_saves (it is the base every other url is derived from), so this
      //     is a real test of the call sites and not of the string.
      const saves = urls.filter((u) => /game_saves/.test(u));
      assert(saves.length === 0,
        'the diagnostic must issue ZERO game_saves requests, saw ' + saves.length + ': ' + saves.join(', '));
      assert(urls.some((u) => /rpc\/hr_load/.test(u)),
        'the diagnostic must read the server projection (hr_load), urls: ' + urls.join(', '));

      // (2) IT RENDERS THE PROJECTION.
      assert(r && r.realm && r.realm.ok, 'the stubbed projection must read as ok: ' + JSON.stringify(r && r.realm));
      assert(r.realm.version === 42, 'version must come off the envelope, got ' + r.realm.version);
      assert(r.realm.totalLevel === 8, 'total level must be the SERVER levels summed (5+3), got ' + r.realm.totalLevel);
      const realmLine = (r.lines || [])[0];
      assert(realmLine && realmLine.ok, 'the first line must be the realm verdict: ' + JSON.stringify(r.lines));
      assert(/version 42/.test(realmLine.text), 'the realm line must name the version: ' + realmLine.text);
      assert(/last settled 10 min ago/.test(realmLine.text), 'the realm line must name the last settle: ' + realmLine.text);
      assert(/1[,.\s]?234 gold/.test(realmLine.text), 'the realm line must name the gold it holds: ' + realmLine.text);
      assert(!/returned nothing/i.test(r.lines.map((l) => l.text).join(' ')),
        'the retired round-trip copy must be gone entirely');

      // (3) A FAILED PROJECTION READ FAILS CLOSED, AND SAYS SO.
      const bad = await S.__withConfig({
        endpoint: 'https://example.invalid/rest/v1/game_events',
        snapshotEndpoint: 'https://example.invalid/rest/v1/game_saves',
        claimEndpoint: null,
        apiKey: 'anon', userId: () => 'u1', authToken: () => 'tok',
        onSyncFailure: () => {}, onSyncRecovered: () => {}, onAuthExpired: () => {},
      }, () => S.verifyCloudSave({ readRealm: async () => ({ ok: false, outcome: 'unavailable' }) }));
      assert(bad && bad.ok === false, 'a failed projection read must not report ok');
      const badLine = (bad.lines || [])[0];
      assert(badLine && badLine.ok === false, 'the first line must be the failure: ' + JSON.stringify(bad.lines));
      assert(/unavailable/.test(badLine.text), 'the failure line must name the outcome: ' + badLine.text);
      assert(/not lost progress/i.test(badLine.text),
        'an unreadable server is NOT evidence of loss and the copy must say so: ' + badLine.text);
    } finally {
      window.fetch = realFetch;
      if (window.G) { if (typeof hadSyncedAt === 'undefined') delete window.G.cloudSyncedAt; else window.G.cloudSyncedAt = hadSyncedAt; }
      S.resetAuthGate();
      if (typeof S.__resetSyncHealth === 'function') S.__resetSyncHealth();
    }
  }),

  // Bug-report screenshots crashed with "unsupported color function
  // 'color'" because html2canvas can't parse the color(srgb …) form that
  // browsers serialise our color-mix() rules into. convertColorFns() rewrites
  // those to rgb()/rgba() in the cloned DOM before capture. Guard the converter.
  () => tryRun('b295: bug-report color() → rgb() converter (html2canvas screenshot fix)', () => {
    const f = window.__hrConvertColorFns;
    assert(typeof f === 'function', '__hrConvertColorFns must be exposed');
    assert(f('color(srgb 0.5 0.25 0.125)') === 'rgb(128,64,32)',
      'srgb triple must map to rgb, got ' + f('color(srgb 0.5 0.25 0.125)'));
    assert(f('color(srgb 1 0 0 / 0.5)') === 'rgba(255,0,0,0.5)',
      'alpha must be preserved, got ' + f('color(srgb 1 0 0 / 0.5)'));
    // display-p3 is approximated but must still become a parseable rgb().
    assert(/^rgb\(/.test(f('color(display-p3 0 1 0)')), 'display-p3 must convert');
    // A value with color() embedded in a shadow keeps the rest intact.
    assert(f('0 2px 4px color(srgb 0 0 0 / 0.3)') === '0 2px 4px rgba(0,0,0,0.3)',
      'must rewrite color() inside a shadow value');
    // Plain colours are untouched.
    assert(f('rgb(10,20,30)') === 'rgb(10,20,30)', 'plain rgb must pass through');
    assert(f('#abc') === '#abc', 'hex must pass through');
  }),

  // b314: THE MOBILE FREEZE. Tapping "Send report" on iOS Safari hung the whole
  // game on "Sending…" forever, because submit() awaits captureScreenshot() with
  // no timeout and the primary path both imports html-to-image from a CDN (can
  // hang on a dropped mobile connection) and rasterises the full body into a
  // <foreignObject> (can pin the main thread). The fix bounds the whole capture
  // with withTimeout(): a hung capture resolves null so the report still sends
  // text-only. Guard the timeout primitive AND that captureScreenshot is bounded.
  () => tryRun('b314: bug-report screenshot capture can never hang the report (mobile freeze)', () => {
    const wt = window.__hrWithTimeout;
    assert(typeof wt === 'function', '__hrWithTimeout must be exposed');
    // A never-settling promise must resolve to the fallback, and must return a
    // promise (never throw synchronously).
    const never = new Promise(() => {});          // the hung-capture case
    const p = wt(never, 20, 'FALLBACK');
    assert(p && typeof p.then === 'function', 'withTimeout must return a promise');
    p.then(function(v){ assert(v === 'FALLBACK', 'a hung promise must resolve to the fallback, got ' + v); },
           function(){ assert(false, 'withTimeout must never reject'); });
    // A promise that settles fast must win the race (fallback ignored).
    wt(Promise.resolve('REAL'), 5000, 'FB').then(function(v){
      assert(v === 'REAL', 'a fast promise must win over the timeout, got ' + v);
    }, function(){ assert(false, 'withTimeout must never reject on a resolved input'); });
    // captureScreenshot itself must be bounded: calling it must return a promise
    // and never throw synchronously even in this DOM-light harness.
    const B = window.HearthriseBugReport;
    assert(B && typeof B.captureScreenshot === 'function', 'captureScreenshot must be exposed');
    const cap = B.captureScreenshot(20);          // tiny budget → must resolve (to null) quickly
    assert(cap && typeof cap.then === 'function', 'captureScreenshot must return a promise');
    cap.then(function(v){ assert(v === null || typeof v === 'string', 'capture must resolve to a data-url or null, got ' + typeof v); },
             function(){ assert(false, 'captureScreenshot must never reject — it fails soft to null'); });
  }),

  // b316: THE MOBILE FREEZE, CORRECTLY. b314's setTimeout timeout could NOT
  // interrupt the freeze: the primary capture (html-to-image on document.body) is
  // a SYNCHRONOUS main-thread lock (walks the DOM, getComputedStyle per node,
  // serialises an SVG foreignObject), so the event loop is blocked and the timer
  // never fires until the freeze is already over. The real fix: on a touch/coarse
  // device, submit() must NEVER invoke the heavy capture and must send text-only.
  // This test proves it: force a touch env, stub captureScreenshot to a
  // never-resolving promise, and assert submit() never calls it (and still sends).
  // Also assert the safe-area insets — Tyler's iPhone diagnostic field — are in
  // the snapshot. RED against the old `const s = await captureScreenshot()` path:
  // that invokes the stub synchronously, so capInvoked flips true and the assert
  // fails (and, without the stub returning, submit would hang forever).
  () => tryRun('b316: mobile bug-report sends text-only without entering the heavy screenshot capture', () => {
    const B = window.HearthriseBugReport;
    assert(B && typeof B.submit === 'function', 'submit must be exposed');
    assert(typeof window.__hrIsTouchDevice === 'function', '__hrIsTouchDevice must be exposed');

    // Safe-area insets must be captured in the snapshot (present + 4 keys).
    const snap = B._stateSnapshot ? B._stateSnapshot() : null;
    assert(snap && snap.metrics && snap.metrics.safeArea, 'snapshot.metrics.safeArea must exist');
    const sa = snap.metrics.safeArea;
    ['t', 'b', 'l', 'r'].forEach((k) =>
      assert(typeof sa[k] === 'string', 'safeArea.' + k + ' must be a string, got ' + typeof sa[k]));

    // Simulate a touch device and a hung capture.
    const origForce = window.__hrForceTouch;
    const origCap = B.captureScreenshot;
    const origFetch = window.fetch;
    let capInvoked = false;
    window.__hrForceTouch = true;
    assert(window.__hrIsTouchDevice() === true, 'forced touch env must read as touch');
    B.captureScreenshot = function () { capInvoked = true; return new Promise(function () {}); };
    // Neutralise real network so the send paths resolve without POSTing anywhere.
    window.fetch = function () { return Promise.resolve({ ok: true, status: 200 }); };
    try {
      // submit() is async; its body runs synchronously up to the first real await
      // (Promise.all of the sends). On touch it must SKIP capture before that,
      // so capInvoked stays false the instant after the call returns.
      const pr = B.submit({ summary: 'smoke b316', description: 'auto-test — ignore' });
      assert(pr && typeof pr.then === 'function', 'submit must return a promise');
      assert(capInvoked === false, 'submit must NOT invoke the heavy screenshot capture on a touch device');
    } finally {
      window.__hrForceTouch = origForce;
      B.captureScreenshot = origCap;
      window.fetch = origFetch;
    }
  }),

  // b322: THE WEBHOOK IS OUT OF THE CLIENT.
  //
  // src/bug-report.js hard-coded a LIVE Discord webhook URL for ~200 builds.
  // hearthrise.net is GitHub Pages serving a PUBLIC repo, so that token was
  // readable by anyone, in the bundle AND in git history forever — and a
  // webhook token permits POST, PATCH and DELETE. The repo-wide scan lives in
  // tests/run-smoke.mjs (secretGuard); this is the RUNTIME half: the module
  // that is actually loaded must expose no delivery credential on `window`,
  // because publishing one there is the same exposure as hard-coding it.
  () => tryRun('b322: the loaded bug-report module exposes no Discord webhook or delivery credential', () => {
    const B = window.HearthriseBugReport;
    assert(B, 'HearthriseBugReport must be exposed');
    assert(!('webhookUrl' in B), 'HearthriseBugReport.webhookUrl must not exist — a credential on window is public');
    assert(!('bridgeUrl' in B), 'HearthriseBugReport.bridgeUrl must not exist — a credential on window is public');
    // Nothing reachable on the surface may look like a webhook, of any host.
    const needle = ['dis', 'cord.com/api/web', 'hooks'].join('');
    Object.keys(B).forEach(function (k) {
      const v = B[k];
      if (typeof v !== 'string') return;
      assert(v.indexOf(needle) === -1, 'HearthriseBugReport.' + k + ' contains a Discord webhook URL');
    });
    // The relay is wired, and it is a same-project Edge Function path (no host,
    // so it can only ever be joined onto the configured Supabase URL).
    assert(B.relayPath === '/functions/v1/bug-report-bridge',
      'the relay path must point at the bug-report-bridge Edge Function, got ' + B.relayPath);
  }),

  // b322: and the SEND PATH goes to the authenticated relay, never to Discord.
  // Drives a real submit() with a stubbed session + fetch and inspects every
  // request it makes. Also re-proves b316 at the payload level: on a touch
  // device the relay body carries screenshot:null. RED against the old code,
  // which POSTed straight to discord.com with the webhook in the URL.
  () => tryRun('b322: bug-report submit posts only to the authenticated relay, text-only on touch', () => {
    const B = window.HearthriseBugReport;
    assert(B && typeof B.submit === 'function', 'submit must be exposed');
    const origFetch = window.fetch;
    const origTouch = window.__hrForceTouch;
    const origSupa = window.HearthriseSupabase;
    const origAuth = window.HearthriseAuth;
    const calls = [];
    window.__hrForceTouch = true;                       // phone: text-only
    window.HearthriseSupabase = { getConfig: function () {
      return { url: 'https://example-project.supabase.co', anonKey: 'anon-test-key' }; } };
    window.HearthriseAuth = { getSession: function () {
      return { access_token: 'a.b.c', user: { id: '00000000-0000-0000-0000-000000000001', email: 'p@example.com' } }; } };
    window.fetch = function (url, opts) {
      calls.push({ url: String(url), opts: opts || {} });
      return Promise.resolve({
        ok: true, status: 200,
        json: function () { return Promise.resolve({ ok: true, status: 'accepted', report_id: 1, relayed: true }); },
      });
    };
    // submit() runs synchronously up to its first real await, and on a touch
    // device that first await is the relay fetch — so the request is already
    // recorded the instant submit() returns its promise. That is what makes
    // these assertions synchronous (tryRun cannot await), and it is also what
    // makes calls.length meaningful: the OLD code fired Promise.all([bridge,
    // discord, supabase]) and would therefore have recorded 2-3 calls here.
    let sent = null;
    try {
      const pr = B.submit({ summary: 'smoke b322', description: 'auto-test — ignore' });
      assert(pr && typeof pr.then === 'function', 'submit must return a promise');
      pr.catch(function () {});                        // no stray rejection
      assert(calls.length === 1, 'submit must make exactly ONE send call (relay only, no fan-out) — made ' + calls.length);
      sent = calls[0];
    } finally {
      window.fetch = origFetch;
      window.__hrForceTouch = origTouch;
      window.HearthriseSupabase = origSupa;
      window.HearthriseAuth = origAuth;
    }
    assert(sent.url.indexOf('/functions/v1/bug-report-bridge') !== -1,
      'the send must target the relay Edge Function, went to ' + sent.url);
    assert(sent.url.indexOf('discord') === -1, 'the client must never talk to Discord directly: ' + sent.url);
    const h = sent.opts.headers || {};
    assert(String(h.Authorization || '').indexOf('Bearer ') === 0,
      'the relay call must carry the player\'s Supabase JWT — an unauthenticated relay is a spam relay');
    const body = JSON.parse(sent.opts.body);
    assert(body.screenshot === null,
      'a touch-device report must be text-only (screenshot:null) — b316, the iPhone freeze; got ' + typeof body.screenshot);
    assert(typeof body.idem_key === 'string' && body.idem_key.length > 0,
      'every report must carry an idempotency key so a retry cannot double-post');
    assert(!('user' in body),
      'the client identity field must NOT be sent — the server derives the reporter from auth.uid()');
    assert(body.state && body.state.metrics && body.state.metrics.safeArea,
      'the safe-area/device metrics must survive the rewire — they are the iPhone triage fields');
  }),

  // b294: the "Desktop site is on → whole UI is a jumbled mess" detector
  // (paione, Ulefone Armour 27T). The most important property is that it does
  // NOT false-positive on a normal desktop/tester environment — a wrong banner
  // would hit everyone. Also assert the predicate never throws and the banner
  // builds + dismisses cleanly when we drive the DOM path directly.
  () => tryRun('b294: desktop-mode detector exists, is crash-safe, and does not false-positive here', () => {
    assert(typeof window.__hrDesktopModeCheck === 'function', '__hrDesktopModeCheck must be exposed');
    assert(typeof window.__hrDesktopModeEvaluate === 'function', '__hrDesktopModeEvaluate must be exposed');
    // Must return a boolean and never throw regardless of environment.
    const v = window.__hrDesktopModeCheck();
    assert(v === true || v === false, 'predicate must return a boolean, got ' + typeof v);
    // The headless test env is a non-touch desktop → must be false, and
    // evaluate() must not leave a banner in the DOM.
    window.__hrDesktopModeEvaluate();
    const stray = document.getElementById('hr-desktopmode-banner');
    assert(!stray, 'detector must not show its banner on a normal (non-touch) viewport');
  }),

  /* b371: the detector's phone-size threshold was 900px, and 900 is a LAPTOP
     dimension. A 1366x768 touchscreen laptop — the most common laptop panel
     sold — reports a 768px short edge, carries no mobile UA marker and lays
     out well over 820px wide, so every clause passed and the player was
     greeted by a full-width red alert telling them to turn off a setting they
     had never turned on. A false alarm on the chrome whose entire job is to
     explain a broken layout is worse than no alarm: it teaches the player that
     our warnings are noise.

     The b294 test above could not see this. It asserts only that the LIVE
     environment returns false, and the live environment is a non-touch
     headless desktop that bails at the first clause. So the predicate now
     takes its environment as an argument and this drives it with real device
     numbers — which is what b294's own comment ("exposed so the smoke test can
     drive the detector deterministically") has claimed since it was written.

     Every row below is a real device, and each false case names which clause
     must reject it, so a future threshold change fails LOUDLY rather than
     silently re-admitting a class. */
  () => tryRun('b371: the desktop-mode detector does not false-positive on a touchscreen laptop', () => {
    const check = window.__hrDesktopModeCheck;
    assert(typeof check === 'function', '__hrDesktopModeCheck must be exposed');
    assert(check.length >= 1, 'the predicate must accept an injected environment — otherwise this '
      + 'test can only ever assert "the machine running the tests is not a phone", which is the '
      + 'assertion that missed the 1366x768 laptop for six builds');

    const CASES = [
      // ── MUST NOT FIRE ──────────────────────────────────────────────
      { want: false, why: '1366x768 touchscreen laptop (the b370 false positive)',
        env: { touch: true, innerWidth: 1366, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', dpr: 1, screenW: 1366, screenH: 768 } },
      { want: false, why: '1280x800 touchscreen laptop',
        env: { touch: true, innerWidth: 1280, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', dpr: 1, screenW: 1280, screenH: 800 } },
      { want: false, why: '1920x1080 touchscreen all-in-one',
        env: { touch: true, innerWidth: 1920, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', dpr: 1, screenW: 1920, screenH: 1080 } },
      { want: false, why: 'iPad in landscape (a real tablet, not a phone in desktop mode)',
        env: { touch: true, innerWidth: 1024, ua: 'Mozilla/5.0 (iPad; CPU OS 17) Safari', dpr: 2, screenW: 1024, screenH: 1366 } },
      { want: false, why: 'a plain non-touch desktop — rejected by the touch clause',
        env: { touch: false, innerWidth: 1440, ua: 'Mozilla/5.0 (Macintosh) Chrome/120', dpr: 2, screenW: 1440, screenH: 900 } },
      { want: false, why: 'paione\'s phone in LANDSCAPE with desktop mode OFF — mobile UA and a real phone DPR',
        env: { touch: true, innerWidth: 922, ua: 'Mozilla/5.0 (Linux; Android 13; Ulefone) Mobile Chrome/120', dpr: 2.75, screenW: 393, screenH: 873 } },
      { want: false, why: 'a phone in PORTRAIT — the mobile layout is engaging normally (width clause)',
        env: { touch: true, innerWidth: 393, ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', dpr: 1, screenW: 393, screenH: 873 } },

      // ── MUST FIRE — the case the detector exists for ───────────────
      { want: true, why: 'paione\'s Ulefone with Desktop site ON: 980px layout, desktop UA, DPR collapsed',
        env: { touch: true, innerWidth: 980, ua: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120', dpr: 1, screenW: 393, screenH: 873 } },
      { want: true, why: 'a large phone (430px short edge) in desktop mode — the widest of the class',
        env: { touch: true, innerWidth: 980, ua: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120', dpr: 1, screenW: 430, screenH: 932 } },
      { want: true, why: 'a phone that kept its mobile UA but collapsed its DPR (the lowDpr tell)',
        env: { touch: true, innerWidth: 980, ua: 'Mozilla/5.0 (Linux; Android 13) Mobile Chrome/120', dpr: 1, screenW: 393, screenH: 873 } },
    ];

    const wrong = CASES.filter((c) => check(c.env) !== c.want)
      .map((c) => `${c.why} → expected ${c.want}, got ${!c.want}`);
    assert(!wrong.length, 'the desktop-mode predicate misjudges:\n      ' + wrong.join('\n      '));
  }),

  /* b371: THE CHARACTER PANEL MUST BE ABLE TO SCROLL TO THE BOTTOM OF ITS OWN
     CONTENT. `#panel-character` is the scroll container; `#char-shell` was
     `flex:1` + `min-height:0`, which let the shell be SHORTER than the pane
     inside it. The pane is `overflow:visible`, and content that spills out of a
     visible box contributes nothing to any ancestor's scrollHeight — so the
     panel reported less travel than its own content needed and the last rows
     of the account block could not be scrolled to. Measured at 922x423: 14px
     short. Fourteen pixels is not dramatic; the SHAPE is, because it gets worse
     with every row added to the screen and nothing would have told us.

     This asserts the relationship, not a number, so it stays true as the screen
     grows. It is the exact contract `tests/reachability.mjs` cannot express —
     see the note where its M3 mutation would have been. */
  () => tryRun('b371: the Character panel can scroll to the bottom of its own content', () => {
    const panel = document.getElementById('panel-character');
    if (!panel) { skip('no character panel in this build'); return; }
    /* SCOPED TO THE PANEL, not getElementById: an earlier test in this suite
       builds a throwaway `#char-shell` in a sandbox to render an equipment
       fixture, and a document-wide lookup finds whichever came first. */
    const shell = panel.querySelector('#char-shell');
    if (!shell) { skip('the combined shell has not been built yet'); return; }

    /* THE ASSERTION IS `flex-shrink`, NOT `min-height`, and the distinction is
       the actual mechanism. `min-height:0` is only load-bearing while the item
       CAN shrink — it is the release that lets a flex item go under its content
       size. With `flex-shrink:0` the shell cannot shrink at all and the
       min-height declaration becomes inert. So the contract worth pinning is
       "the shell never gets shorter than its pane", and asserting the release
       rather than the shrink would pin a symptom of the old shape. */
    const cs = getComputedStyle(shell);
    assert(cs.flexShrink === '0',
      '#char-shell must not shrink (flex-shrink:' + cs.flexShrink + '). A shell shorter than its '
      + 'pane makes the pane\'s overflow invisible to the panel\'s scrollbar.');

    // The relationship itself, measured: the shell must be at least as tall as
    // the tallest pane it hosts.
    const panes = [...panel.querySelectorAll('.char-pane')].filter((p) => {
      const c = getComputedStyle(p); return c.display !== 'none' && p.getBoundingClientRect().height > 1;
    });
    const shellH = shell.getBoundingClientRect().height;
    const tall = panes.filter((p) => p.getBoundingClientRect().height > shellH + 2)
      .map((p) => (p.id || p.className) + ' is ' + Math.round(p.getBoundingClientRect().height)
        + 'px inside a ' + Math.round(shellH) + 'px shell');
    assert(!tall.length, 'a Character pane is taller than the shell that hosts it, so its bottom '
      + 'cannot be scrolled to: ' + tall.join('; '));
  }),

  /* b371: THE FIGHT SCREEN'S SCROLL NET IS NOT ALLOWED BACK INSIDE A MEDIA
     QUERY. This is a RULE scan rather than a measurement, and deliberately so:
     one window size can never see a breakpoint it is not in, which is precisely
     how the defect survived — the cure existed, correctly written, fenced
     inside `@media (max-height:560px)`, and every desktop verification pass
     ran outside it and saw a screen that looked fine.
     `tests/reachability.mjs` catches the RESULT at four viewports; this catches
     the CAUSE at any viewport, and between them a re-scoping cannot ship. */
  () => tryRun('b371: the Fight screen scroll net is unconditional, not fenced behind a breakpoint', () => {
    const wanted = [
      { prop: 'overflow-y', on: '.fs-view', re: /\.fs-view/, val: /auto/ },
      { prop: 'overflow', on: '.combat-arena', re: /\.combat-arena/, val: /visible/ },
    ];
    let checked = 0;
    const found = { 'fs-view': false, 'combat-arena': false };

    for (const sheet of [...document.styleSheets]) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      if (!rules) continue;
      // TOP LEVEL ONLY — a rule inside a CSSMediaRule is not walked, which is
      // the entire assertion. If the declaration is only reachable through a
      // media query it will simply not be found here, and this fails.
      for (const rule of rules) {
        if (rule.type !== 1 || !rule.selectorText) continue;
        checked++;
        const sel = rule.selectorText;
        if (!/#panel-combat\[data-combat-view="fight"\]/.test(sel)) continue;
        if (/\.fs-view/.test(sel) && /auto/.test(rule.style.overflowY || '')) found['fs-view'] = true;
        if (/\.combat-arena/.test(sel) && /visible/.test(rule.style.overflow || rule.style.overflowY || '')) found['combat-arena'] = true;
      }
    }
    assert(checked > 50, 'no stylesheets were readable — this scan proved nothing (' + checked + ' rules)');
    assert(found['fs-view'],
      'no UNCONDITIONAL rule gives `#panel-combat[data-combat-view="fight"] .fs-view` '
      + '`overflow-y:auto`. Without it the Fight screen cannot scroll, and at 1366x768 the FIGHT '
      + 'button sits below the fold with no gesture that reaches it (b370).');
    assert(found['combat-arena'],
      'no UNCONDITIONAL rule gives `#panel-combat[data-combat-view="fight"] .combat-arena` '
      + '`overflow:visible`. While the arena clips, it reports its own short height and the scroll '
      + 'container above it sees nothing to scroll — the net exists but can never engage (b370).');
    void wanted;
  }),

  /* b371: the empty-slot captions on the Fight screen's equipment rail must not
     break mid-word. b139 ruled that a chopped slot label reads as a random
     string, and this failure has now arrived from three directions: ellipsised
     ("OFFHA…", b366), over-eager `word-break` ("WEAPO / N", b368), and finally
     a tile simply too narrow for the type ("OFFHAN / D" and "NECKLA / CE" at
     51px). The type cannot shrink — `--t-micro` IS b227's guarded 14.5px floor
     — so the TILE grew instead (three columns, b371). This asserts the outcome
     rather than the column count, so a future rail redesign is free as long as
     the words stay whole. */
  /* AND IT BUILDS ITS OWN SUBJECT. The first version measured whatever was on
     screen, and the in-page suite runs on whatever tab the previous ~800 tests
     left active — so on most runs the rail measured 0x0, the test skipped, and
     it PASSED with a four-column doll planted (caught by the mutation harness,
     not by review). A test whose subject is ambient is a test that reports the
     tab order. `withFightScreen()` forces the panel and the fight view visible
     for the duration, measures, and puts everything back. */
  () => tryRun('b371: Fight-rail slot captions never break a word in half', () => {
    const out = withFightScreen(() => [...document.querySelectorAll('#panel-combat .fsm-slot.is-empty')]
      .map((s) => {
        const em = s.querySelector('em');
        if (!em) return null;
        const cs = getComputedStyle(em);
        if (cs.display === 'none') return null;        // the phone rail drops them by design
        const r = em.getBoundingClientRect();
        if (r.width < 1) return null;
        return { text: (em.textContent || '').trim(), width: r.width,
          font: cs.font || (cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + '/' + cs.lineHeight + ' ' + cs.fontFamily),
          ls: cs.letterSpacing };
      }).filter(Boolean));
    if (!out.length) { skip('the fight rail is not built in this session'); return; }
    const bad = [];
    // A single word that does not fit its line is the failure: the browser will
    // break it mid-word (or clip it), and either way the player reads a
    // fragment. Measure the longest WORD against the available line.
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0';
    document.body.appendChild(probe);
    out.forEach((s) => {
      probe.style.font = s.font;
      probe.style.letterSpacing = s.ls;
      let widest = 0, word = '';
      s.text.split(/\s+/).forEach((w) => {
        probe.textContent = w;
        const ww = probe.getBoundingClientRect().width;
        if (ww > widest) { widest = ww; word = w; }
      });
      if (widest > s.width + 0.5) {
        bad.push(`"${s.text}" — the word "${word}" needs ${Math.ceil(widest)}px in a `
          + `${Math.round(s.width)}px caption`);
      }
    });
    probe.remove();
    assert(!bad.length, 'Fight-rail slot captions will break mid-word (b139): ' + bad.join('; '));
  }),

  /* b371: toasts must not stack over the Fight screen's action bar. The toast
     module was BUILT for this — `OBSTACLES` measures live rects and lifts the
     column — and its header says in so many words that new floating chrome
     "registers its selector here". The Fight action bar never did, so a combat
     burst (three "Equipped …", a level-up, a rare drop) parked itself on top of
     Eat, Stop and the metrics strip.

     THE GEOMETRY IS ASSERTED, NOT THE WIRING, and the first version of this
     test is the reason. It fell back to "registering it again must not change
     the offsets" whenever the Fight screen was not the active tab — which is
     almost always, since the in-page suite runs on whatever the previous ~800
     tests left open. That fallback is unfalsifiable: with the element measuring
     0x0 the offsets are equal whether or not the selector is registered, so the
     test PASSED with the registration deleted (caught by the mutation harness).
     `withFightScreen()` gives the action bar a real box, so `layout()` has
     something to measure and the assertion has something to be wrong about. */
  () => tryRun('b371: the Fight action bar is registered as a toast obstacle', () => {
    const T = window.HearthriseToasts;
    if (!T || typeof T.layout !== 'function') { skip('the toast module is not loaded'); return; }

    /* THE SUBJECT IS SYNTHESISED, because forcing the real one visible is not
       reliable enough to assert on. `withFightScreen()` can reveal the panel,
       but the real `.fs-actionbar` is six levels down inside `.combat-arena`
       and legacy's `refreshArenaVs()` parks an inline `display:none` on the
       stage whenever no fight is running — so on a run where no fight has
       started the bar measures 0x0, the probe returns null, and the test skips.
       A skip renders exactly like a pass, which is how the previous version of
       this test survived the registration being deleted.

       So: give `#panel-combat` the fight attribute, hang a `.fs-actionbar` off
       it with a real fixed box, and ask the module to lay out. That is a HONEST
       test of the registration, because `layout()` finds obstacles purely by
       `document.querySelector(selector)` and measures whatever it gets — if the
       selector is not in OBSTACLES, nothing moves. `visibility:hidden` keeps it
       off the screen while still producing a box, and nothing here touches G. */
    const panel = document.getElementById('panel-combat');
    if (!panel) { skip('no combat panel in this build'); return; }
    const hadView = panel.hasAttribute('data-combat-view') ? panel.getAttribute('data-combat-view') : null;
    const prevStyle = panel.getAttribute('style');
    const probe = document.createElement('div');
    let off = null, barTop = 0;
    try {
      panel.setAttribute('data-combat-view', 'fight');
      panel.style.setProperty('display', 'block', 'important');
      panel.style.setProperty('visibility', 'hidden', 'important');
      probe.className = 'fs-actionbar';
      probe.style.cssText = 'position:fixed;left:0;right:0;bottom:120px;height:44px;pointer-events:none';
      /* FIRST CHILD, NOT APPENDED — `layout()` resolves each obstacle with
         `document.querySelector(sel)`, which returns the first match in
         DOCUMENT ORDER. Appended, the probe sat after the real `.fs-actionbar`
         (which is 0x0 with no fight running), so the module measured the real
         one, skipped it as empty, and this test failed identically whether or
         not the selector was registered — a false red that a mutation run
         reads as a true catch. */
      panel.insertBefore(probe, panel.firstChild);
      const r = probe.getBoundingClientRect();
      barTop = r.top;
      assert(r.height > 1 && r.width > 1, 'the synthetic action bar has no box — this test cannot measure');
      off = T.layout();
    } finally {
      probe.remove();
      if (hadView === null) panel.removeAttribute('data-combat-view');
      else panel.setAttribute('data-combat-view', hadView);
      if (prevStyle === null) panel.removeAttribute('style');
      else panel.setAttribute('style', prevStyle);
      // Put the column back where the live screen wants it.
      try { T.layout(); } catch (e) {}
    }

    const needed = window.innerHeight - barTop;
    assert(off && off.bottom + 0.5 >= needed,
      'the toast column rested ' + (off ? off.bottom : '?') + 'px off the bottom while the Fight '
      + 'action bar started ' + Math.round(needed) + 'px up — toasts will stack over Eat and Stop '
      + '(b371). Add `#panel-combat[data-combat-view="fight"] .fs-actionbar` to OBSTACLES in '
      + 'src/features/toasts.js; do not invent an offset, the module computes it.');
  }),

  () => tryRun('b267: auto-eat food picker is reachable via a modal (paione: no food option on landscape)', () => {
    if(typeof window.openAutoEatPicker !== 'function' || typeof window.closeAutoEatPicker !== 'function'){ skip('no picker'); return; }
    const snap = snapshotG();
    try {
      const G = window.G;
      G.inventory = Object.assign({}, G.inventory, { cooked_shrimp: 5, cooked_trout: 3 });
      window.openAutoEatPicker();
      const ov = document.getElementById('aep-overlay');
      assert(ov && getComputedStyle(ov).display !== 'none', 'the picker overlay must open');
      assert(ov.querySelectorAll('.aep-row').length >= 1, 'the picker must render at least the Off row');
      assert(/Off/.test(ov.textContent), 'the picker must offer an Off option');
      // b294 regression: the picker MUST list the Provisions actually in the bag.
      // The old helper `_autoEatOk` was a const scoped to the combat-render fn,
      // out of scope here, so the filter silently rejected every item and the
      // picker always claimed "No Provisions in your bag" (tester report).
      // This assertion (was previously behind `if(foodRow)`) fails without the fix.
      assert(!/No Provisions/i.test(ov.textContent), 'picker wrongly reports no Provisions despite owned cooked food');
      const foodRow = [...ov.querySelectorAll('.aep-row')].find(r => /Shrimp|Trout/i.test(r.textContent));
      assert(foodRow, 'the picker must list owned Provisions (Cooked Shrimp/Trout)');
      foodRow.click();   // sets it + closes
      const cfg = (window.HearthriseAuto && window.HearthriseAuto.getEat) ? window.HearthriseAuto.getEat() : null;
      assert(cfg && cfg.foodId, 'picking a food must set the auto-eat food');
      // Close is reliable regardless.
      window.closeAutoEatPicker();
      assert(getComputedStyle(document.getElementById('aep-overlay')).display === 'none', 'close must hide the picker');
    } finally {
      const ov = document.getElementById('aep-overlay'); if(ov) ov.remove();
      restoreG(snap);
    }
  }),

  () => tryRun('b266: combat activity bar shows trained-skill XP to next level (tester: see Strength XP while fighting)', () => {
    if(typeof window.refreshActivityBar !== 'function' || typeof window.getActiveCombatStyle !== 'function'){ skip('no fn'); return; }
    const meta = document.getElementById('ab-meta');
    if(!meta){ skip('activity bar not mounted'); return; }
    const snap = snapshotG();
    try {
      const G = window.G;
      G.activeMonster = 'goblin'; G.monsterHp = 10; G.monsterMaxHp = 15; G.playerHp = 50; G.playerMaxHp = 50;
      const style = window.getActiveCombatStyle();
      if(!style || !style.xp){ skip('no active combat style in harness'); return; }
      const sk = Object.keys(style.xp).sort((a,b)=>style.xp[b]-style.xp[a])[0];
      G.skills = Object.assign({}, G.skills, { [sk]: 1000 });   // mid-level, not maxed
      window.refreshActivityBar();
      const html = document.getElementById('ab-meta').innerHTML;
      assert(/ab-xp/.test(html), 'combat bar must show the trained-skill XP chip, got: ' + html.slice(0, 180));
      assert(/to go|>99<|> 99 </.test(html), 'the chip must show XP-to-next (or level 99), got: ' + html.slice(0, 180));
    } finally { restoreG(snap); }
  }),

  /* ── THE BURY GESTURE AUTHORS NOTHING ─────────────────────────────
     paione, 2026-09-07: "I got like 2k bones which I can bury a gazillion times and
     get the exp and keep the bones." buryBones() was removeItem + addXp with no
     intent and no settle, so a reload restored the bones. It REPLACES the older
     test, whose contract ("a plain Bury clears the whole stack") was the bug
     written down; that test's real property is kept below. */
  () => tryRun('b521: Bury starts the SERVER-SETTLED altar bench — no client XP, no client debit (paione: "bury a gazillion times and keep the bones")', () => {
    if(typeof window.buryBones !== 'function'){ skip('no buryBones'); return; }
    const snap = snapshotG();
    const realNotify = window.notify;
    /* The bench arms two setIntervals; left running they would tick doArtisanAction()
       through the REST of the suite. The player's own Stop clears the timers AND the
       pointer, so it is also how the fixture is reset between probes — nulling the
       pointer by hand would hide a Stop that cleared neither. */
    const stopBench = () => {
      try {
        if(typeof window.stopSkill === 'function') window.stopSkill();
        else if(typeof window._stopArtisan === 'function') window._stopArtisan();
      } catch(e) {}
    };
    try {
      const G = window.G;
      // The recipe map is DERIVED, never hardcoded — assert the derivation too.
      assert(typeof window.buryRecipeFor === 'function', 'buryRecipeFor seam missing');
      const rec = window.buryRecipeFor('bones');
      assert(rec && rec.id === 'bury_bones',
        'bones must resolve to the bury_bones prayer recipe, got ' + JSON.stringify(rec));

      /* 0. NO ROOM GATE REMAINS ON PRAYER (the altar ruling). This block once asserted
         the OPPOSITE — no Shrine, so a DISABLED Bury naming the room. Re-ruled
         2026-09-07: the Shrine sells prayerSpeed, the server's gate on bury_bones is
         `req_lv` alone, and a client-held tier in front of a server capability is
         CLAUDE §6's residue-ahead class. So the character here is the one the old gate
         refused — WANDERER'S CAMP — and the bench must start. The fixture ARRIVES the
         way a loaded one does instead of being asserted: an hr_load with no progress
         rows (what hr_state_of sends someone who owns nothing), bones through the
         envelope reconcile, and the tier DERIVED by ensureState() — a hand-written
         tier-0 homestead would state the very thing the residue-ahead class is about.
         Prayer is the only XP, so nothing grandfathers a room in. Driven through the
         REAL inv-detail button: the gate that shipped lived in that renderer. */
      delete G.homestead; delete G.rooms;
      G.skills = { prayer: 0 };   // bury_bones is Prayer 1 = level 1
      stopBench();
      stampRecordLikeLoad(G);
      window.HearthriseAccrual.reconcileInventory(G, { inventory: { bones: 20, dragon_bones: 5 } }, false, false);
      const bones0 = (G.inventory && G.inventory.bones) || 0;
      assert(bones0 >= 1, 'setup: the envelope did not put bones in the bag (' + bones0 + ')');
      window.HearthriseHomestead.ensureState();
      assert((G.homestead && G.homestead.tier) === 0,
        'CONTROL: the fixture must be the camp character the old gate refused, got tier '
        + (G.homestead && G.homestead.tier));
      assert(window.HearthriseHomestead.hasWorkbench('prayer').ok === true,
        'the Shrine gate is back on prayer — hasWorkbench refused a tier-0 character');
      if(typeof window.openInvDetail === 'function'){
        window.openInvDetail('bones');
        const html = document.body.innerHTML;
        const live = /<button(?![^>]*disabled)[^>]*onclick="[^"]*buryBones[^"]*"[^>]*>Bury<\/button>/.exec(html);
        assert(live, 'at the camp, with bones and the level, Bury must be a LIVE button; found: '
          + (/(<button[^>]*>Bury[^<]*<\/button>)/.exec(html) || ['none'])[0]);
        assert(!/Shrine/i.test(html.slice(Math.max(0, html.indexOf('>Bury') - 400), html.indexOf('>Bury') + 40)),
          'the Bury affordance still mentions the Shrine');
        if(typeof window.closeInvDetail === 'function') window.closeInvDetail();
      }
      /* AND THE LEVEL GATE — the one the server DOES enforce — survived the removal.
         bury_dragon is Prayer 35; at level 1 it must still refuse, or this build
         traded a wrong gate for no gate at all. */
      {
        const deep = window.buryRecipeFor('dragon_bones');
        assert(deep && deep.req > 1, 'dragon_bones must resolve to a level-gated rite; got ' + JSON.stringify(deep));
        assert((G.inventory.dragon_bones || 0) > 0, 'setup: the envelope did not deliver dragon bones');
        window.openInvDetail && window.openInvDetail('dragon_bones');
        const dhtml = document.body.innerHTML;
        const dm = /<button[^>]*disabled[^>]*>Bury[^<]*<\/button>/.exec(dhtml);
        assert(dm, 'a rite above your Prayer level must still be DISABLED; found: '
          + (/(<button[^>]*>Bury[^<]*<\/button>)/.exec(dhtml) || ['none'])[0]);
        assert(/Prayer\s*\d/.test(dm[0]), 'the disabled Bury must name the LEVEL it needs, got: ' + dm[0]);
        if(typeof window.closeInvDetail === 'function') window.closeInvDetail();
        delete G.inventory.dragon_bones;
      }

      // Still at the CAMP for every probe below — no room is granted, none is required.
      stopBench();
      window.notify = () => {};

      const p0 = xpOf('prayer');
      const started = window.buryBones('bones');

      // 1. THE RUN IS DECLARED — the gesture reached the activity pointer.
      assert(started === 'bury_bones', 'Bury must start the bury_bones run, returned ' + started);
      assert(G.activeSkill === 'prayer' && G.skillTargetId === 'bury_bones',
        'the artisan pointer must be prayer/bury_bones, got '
        + G.activeSkill + '/' + G.skillTargetId);

      // 2. NO CLIENT-AUTHORED XP. Starting a bench grants nothing; the settle does.
      assert(xpOf('prayer') === p0,
        'starting the bench must not grant Prayer XP locally (' + p0 + ' → ' + xpOf('prayer') + ')');

      // 3. NO CLIENT-AUTHORED DEBIT. The stack is untouched until an action ticks.
      assert((G.inventory.bones || 0) === bones0,
        'starting the bench must not burn the stack: ' + bones0 + ' → ' + G.inventory.bones);

      // 4. NO CLIENT COUNTER — G.stats.buried went with the mint.
      assert(!(G.stats && G.stats.buried),
        'G.stats.buried is back — a counter nothing server-side stamps');

      // 5. ONE PATH, ALL SURFACES — the inv-detail `else` wrote XP inline.
      const detailSrc = String(window.openInvDetail || '');
      assert(detailSrc.length > 0, 'openInvDetail is not published — this check would pass vacuously');
      assert(!/G\.skills\.prayer\s*=/.test(detailSrc) && !/addXp\(\s*['"]prayer/.test(detailSrc),
        'the inv-detail Bury button still carries a client-authored prayer grant');

      // 5b. THE SLIDER TELLS THE TRUTH — a bench run has no quantity to promise.
      if(typeof window.openQtySlider === 'function'){
        window.openQtySlider('bones');
        const sum = (document.getElementById('qs-summary') || {}).textContent || '';
        assert(/Bury/.test(sum), 'the slider must still offer Bury, got: ' + sum.slice(0, 160));
        assert(!/Bury\s*\d/.test(sum),
          'the slider still promises a bury QUANTITY the bench cannot honour: ' + sum.slice(0, 160));
        const cancel = document.getElementById('qs-cancel');
        if(cancel) cancel.click();
      }

      /* 6. A BONE WITH NO RITE IS ANSWERED, NOT SILENTLY DROPPED. The probe was hardcoded to `bone_chips` until the 2026-09-12 ladder gave that drop a rite at Prayer 40 — which made this arm assert the opposite of the truth, by name — and any hand-typed "has no recipe" id goes stale the day the designer fills a rung, so it is DERIVED from ARTISAN_RECIPES; `type`/`slot` are excluded so the pick is a bone-like REMAIN, not a fang-named weapon. */
      stopBench();
      const rites = new Set((window.ARTISAN_RECIPES.prayer || []).map((r) => r.input));
      const riteless = Object.keys(window.ITEMS).find((id) => !rites.has(id)
        && !window.ITEMS[id].type && !window.ITEMS[id].slot && /bone|fang|skull|tooth/.test(id));
      assert(riteless, 'every bone-ish remain carries a rite now — this arm can no longer be built');
      let said = '';
      window.notify = (m) => { said += ' ' + m; };
      const none = window.buryBones(riteless);
      assert(none === null, riteless + ' has no prayer recipe and must not start a run');
      assert(!G.activeSkill, 'a rite-less item must leave the activity pointer alone');
      assert(/no altar rite/i.test(said), 'the refusal must say why, got: "' + said.trim() + '"');
    } finally {
      window.notify = realNotify;
      stopBench();
      restoreG(snap);
    }
  }),

  /* ── NO SKILL'S XP FORGES A ROOM OR RAISES A TIER ────────────────────────
     ensureState() used to read "XP in S → you owned WORKBENCH[S] → you were at
     least at its tier", and grant the room to match. That implication held
     only while the rooms WERE the permission; with the gates gone it is false
     in both directions, and dangerous in both. One buried bone would infer
     IRONVALE KEEP and one smelted bar FIELDWORTH FARMSTEAD into the residue of
     a bedroll owner, and `G.rooms[x] = 1` forges an `unlock` row hr_unlock_buy
     never sold while rooms are server-of-record.

     A forged tier is paione's residue-ahead deadlock (2026-09-04) with a
     bigger number on it: the heal conforms the residue DOWN to a KNOWN rung,
     but only a COMPLETE `progress` statement is a known rung, so a truncated
     one (the 1000-row cap) leaves the phantom keep there forever — and a
     phantom keep refuses every room purchase with prereq_property_tier.

     Three legs on three mechanisms, so no one of them can pass vacuously: XP
     infers nothing, an UNKNOWN rung infers nothing (the plot count is RESIDUE
     — a client-held array may not raise a server rung), and an OWNED room
     still does. */
  () => tryRun('no skill XP forges a room or raises a property tier (the residue-ahead class)', () => {
    const H = window.HearthriseHomestead, P = window.HearthriseProperty;
    if(!H || typeof H.ensureState !== 'function' || typeof H.roomMinTier !== 'function'){ skip('homestead API absent'); return; }
    const G = window.G;
    const snap = snapshotG();
    const prevRec = (P && typeof P.__resetPropertyRecord === 'function') ? P.__resetPropertyRecord() : null;
    try {
      const forgeTier = H.roomMinTier('forge'), shrineTier = H.roomMinTier('shrine');
      assert(forgeTier > 0 && shrineTier > 0, 'both rooms must sit above the camp or this test proves nothing');
      // One setup for all three legs; each leg then changes only what it is about.
      G.rooms = {}; G.skills = {}; G.plotBuildings = [];

      /* 1. XP INFERS NOTHING — every artisan skill at once, with the rung
         KNOWN (a complete projection carrying no `property:` row IS a camp),
         so leg 2 cannot be what makes this pass. */
      if (P) P.notePropertyUnlocks({ ok: true, progress: [], progress_truncated: false });
      delete G.homestead;
      G.skills = { cooking: 500, smithing: 5000, crafting: 5000, prayer: 5000 };
      stampRecordLikeLoad(G);
      H.ensureState();
      assert(G.homestead.tier === 0,
        'skill XP inferred a tier-' + G.homestead.tier + ' property at the camp (the Forge is ' + forgeTier
        + ', the Shrine ' + shrineTier + ') — residue-ahead, and unhealable behind a truncated progress read');
      assert(Object.keys(G.rooms || {}).length === 0,
        'skill XP forged ' + JSON.stringify(G.rooms) + ' — a room is sold by hr_unlock_buy, never inferred');

      /* 2. AN UNKNOWN RUNG INFERS NOTHING EITHER. Absence is not a claim, and
         the plot count this pass also reads is RESIDUE (client-state.js
         RESIDUE_FIELDS), so with no server statement even an owned room would
         be inferred through a client-held array's arithmetic. */
      if (P) P.__resetPropertyRecord();
      delete G.homestead; G.rooms = { forge: 1 }; G.skills = {};
      stampRecordLikeLoad(G);
      H.ensureState();
      assert(G.homestead.tier === 0,
        'a tier was inferred with no server rung stated this session, got ' + G.homestead.tier);

      /* 3. THE CONTROL: an OWNED room is a server fact and still raises the
         tier, or legs 1 and 2 pass because the inference is broken rather than
         selective. The statement here is TRUNCATED — a floor of 1 — so
         reaching the Forge's own tier can only have come from the room. */
      if (P) {
        P.__resetPropertyRecord();
        P.notePropertyUnlocks({ ok: true, progress_truncated: true,
          progress: [{ kind: 'unlock', key: 'property:homestead', value: 1, period: '' }] });
        delete G.homestead;
        H.ensureState();
        assert(G.homestead.tier === forgeTier,
          'an owned Forge must still infer its tier (' + forgeTier + '), got ' + G.homestead.tier
          + ' — the inference is broken, not selective, and the legs above are vacuous');
      }
    } finally {
      if (P && prevRec) P.__resetPropertyRecord(prevRec.tier, prevRec.workers);
      restoreGAndRecord(snap);
    }
  }),

  () => tryRun('b264: auto-accept bounty switches combat to the new target (tester: left grinding the old monster)', () => {
    if(typeof window.completeBounty !== 'function' || typeof window.bountyAutoSwitch !== 'function'){ skip('seam absent'); return; }
    const snap = snapshotG();
    try {
      const G = window.G;
      if(typeof window.ensureBountyState === 'function') window.ensureBountyState();
      G.skills = Object.assign({}, G.skills, { attack: 500000, strength: 500000, defense: 500000, hitpoints: 500000 });
      G.bountyHunter.autoBounty = 1;
      // Completing a goblin bounty; the board's next is a WOLF bounty.
      G.bountyHunter.active = { id:'a', type:'cull', target:'goblin', tier:1, difficulty:'easy', progress:5, required:5, rewards:{gold:10,marks:2,xp:5} };
      G.bountyHunter.board = [{ id:'b', type:'cull', target:'wolf', tier:2, difficulty:'easy', progress:0, required:5, rewards:{gold:20,marks:3,xp:8} }];
      G.activeMonster = 'goblin'; G.monsterHp = 15; G.monsterMaxHp = 15; G.playerHp = 200; G.playerMaxHp = 200;
      // Turn in the goblin bounty → auto-accept should take the wolf bounty.
      window.completeBounty();
      assert(G.bountyHunter.active && G.bountyHunter.active.target === 'wolf', 'auto-accept must take the next bounty (wolf), got ' + (G.bountyHunter.active && G.bountyHunter.active.target));
      // Before the switch, combat is still on the OLD monster (the reported bug).
      assert(G.activeMonster === 'goblin', 'precondition: combat is still on the old target');
      // The deferred switch (setTimeout target) moves combat to the new bounty target.
      window.bountyAutoSwitch('wolf');
      assert(G.activeMonster === 'wolf', 'auto-bounty must switch combat to the new target, still on ' + G.activeMonster);
    } finally {
      // Reset the bounty fields this test set, so nothing leaks even if
      // snapshotG ever stops covering bountyHunter.
      try { window.G.bountyHunter.autoBounty = 0; window.G.bountyHunter.active = null; window.G.bountyHunter.board = []; } catch(e){}
      if(typeof window.stopCombat === 'function') window.stopCombat();
      restoreG(snap);
    }
  }),

  /* ═══════════════════════════════════════════════════════════════════════
     b344 — THE TWO BOUNTY-TURN-IN DEFECTS, AND WHY NEITHER HAD A TEST.

     The b264 test directly above is the reason the first one survived. It
     asserts the switch by CALLING `bountyAutoSwitch('wolf')` itself, which
     proves the switch function works and says nothing about whether anything
     ever calls it — and it runs live, where a `setTimeout(…,0)` genuinely does
     fire. Away, the whole night is one synchronous pass, so that callback
     cannot run until the absence is already over. A live-play test passes with
     the bug present; that is the entire reason it lasted from b264 to b344.

     So the test below drives the AWAY path and reads the fight state
     SYNCHRONOUSLY, before any timer can flush. There is no `await`, no
     `setTimeout`, and it asserts on the monster's HIT POINTS as well as its
     name, because the failure the b264 defer existed to avoid (switching
     before resolveKill's respawn line) leaves the new foe wearing the old
     foe's hit points and would otherwise read as a pass.
     ═══════════════════════════════════════════════════════════════════════ */
  /* b456: driven with the local blob LIVE. The "and it must be ON DISK" leg is
     about the local save being written before the drain, and the b455 capstone
     retires that file entirely — so under the shipping default there is no disk
     to read and the assertion would be measuring the capstone rather than the
     drain ordering. The ordering bug it guards (the save still naming `goblin`
     after a night that switched to `wolf`) is real and the code is still there.
     ⚠ KNOWN LIMITATION, stated rather than papered over: under the capstone the
       durable record of the switch is the SERVER's (the activity intent), and
       this test cannot reach that seam. tests/activity-seam.mjs owns it. */
  () => tryRun('b344: an away night switches to the auto-accepted bounty target MID-NIGHT (b264 deferred the switch past the whole absence)', () => {
    if (typeof window.simulateAwayCombat !== 'function' || typeof window.completeBounty !== 'function') { skip('seam absent'); return; }
    const G = window.G, C = window.HearthriseCore, P = window.HearthrisePresence;
    const snap = snapshotG();
    /* ── THE AWAY CHAIN IS A DORMANT-PATH BEHAVIOUR, and driving it means SAYING
       so. Under the gold ARM a cull turn-in may not settle client-side at all:
       completeBounty HOLDS it for hr_claim_bounty, so no away night auto-accepts
       anything. The switch MACHINERY is what this test guards and it is shared,
       so it is driven where it still runs; the ARM gets its own leg at the end. */
    const origMay = window.clientMayWriteRecordField;
    window.clientMayWriteRecordField = function () { return true; };   // DORMANT
    try {
      /* The 11pm situation: mid-fight on GOBLIN, one kill from finishing a
         goblin cull, a WOLF bounty next on the board, Auto-Accept owned. */
      const fixture = () => {
        G.skills = Object.assign({}, G.skills, { attack: 500000, strength: 500000, defense: 500000, hitpoints: 500000 });
        G.equipment = {}; G.buffs = []; G.inventory = {};
        G.playerMaxHp = 1e6; G.playerHp = 1e6;
        G.activeMonster = 'goblin';
        G.monsterHp = window.MONSTERS.goblin.hp; G.monsterMaxHp = window.MONSTERS.goblin.hp;
        G.combatKillsThisFoe = 0;
        G.bountyHunter = {
          marks: 0, xp: 0, completed: 0, autoBounty: 1, boardGeneratedAt: 0,
          freeRerolls: 0, rerollsToday: 0, upgrades: {}, warrants: {},
          active: { id: 'a', type: 'cull', target: 'goblin', tier: 1, difficulty: 'easy',
            progress: 2, required: 3, rewards: { gold: 10, marks: 20, xp: 5 } },
          board: [{ id: 'b', type: 'cull', target: 'wolf', tier: 2, difficulty: 'easy',
            progress: 0, required: 1e9, rewards: { gold: 20, marks: 3, xp: 8 } }],
        };
      };

      fixture();
      C.reseed(0xB0117A);
      let sum = null;
      P._withOfflineReplay(() => { sum = window.simulateAwayCombat(1, Date.now(), false); });

      // Vacuity first: a night that fought nothing would pass everything below.
      assert(sum && sum.kills > 20, 'FIXTURE: the replayed night must produce kills, got ' + JSON.stringify(sum && sum.kills));
      assert(G.bountyHunter.active && G.bountyHunter.active.target === 'wolf',
        'auto-accept must take the wolf bounty during the night, got ' + JSON.stringify(G.bountyHunter.active && G.bountyHunter.active.target));

      /* THE BUG. Read synchronously — no timer has been given a chance to run. */
      assert(G.activeMonster === 'wolf',
        'the away night must switch to the new bounty target INSIDE the loop; still on ' + G.activeMonster
        + ' (a deferred switch fires only after the whole absence is over)');
      /* THE RACE the b264 defer existed to avoid: a switch applied before
         resolveKill respawns the foe leaves the wolf wearing goblin hit points. */
      assert(G.monsterMaxHp === window.MONSTERS.wolf.hp,
        'the new target must carry ITS OWN hit points, got monsterMaxHp=' + G.monsterMaxHp
        + ' (wolf is ' + window.MONSTERS.wolf.hp + ', goblin is ' + window.MONSTERS.goblin.hp + ')');
      /* …and the night must actually have PAID the new bounty. This is the
         player-facing loss: before the fix, progress at sunrise was 0. */
      assert((G.bountyHunter.active.progress || 0) > 0,
        'the rest of the night must count toward the new bounty; progress is ' + G.bountyHunter.active.progress);
      assert((G.inventory.wolf_pelt || 0) > 0, 'the bag must hold the NEW target\'s trophies, wolf_pelt=' + (G.inventory.wolf_pelt || 0));
      /* AND IT MUST REACH THE STORE THAT SURVIVES THE BROWSER CLOSING. The
         symptom this half guards is unchanged — close the tab inside the window
         where the switch has happened in memory but not in the save, and the
         player reopens on the OLD monster holding the NEW bounty, which is the
         pre-fix bug in miniature.

         b515 — THE STORE CHANGED, so the assertion follows it. There is no
         local save blob: `saveLocal()` is one `lastSeen` stamp. `bountyHunter`
         is RESIDUE (client-state.js RESIDUE_FIELDS, "WHOLLY residue now"), so
         the thing that has to carry the accepted bounty is the residue PATCH —
         the bytes `snapshotIfDue` PUTs to `hr_put_client_state`. The activity
         POINTER is the server's (`active_kind`/`active_id` on the accrual
         delta), so it is asserted where it lives instead: the switch must have
         DECLARED, or the server still believes this character is on goblins.
         MUTATION: drop the residue field, or drop the declare from the switch
         path → one of the two below goes red. */
      const CAP = window.HearthriseCapstone;
      assert(CAP && typeof CAP.buildResiduePatch === 'function', 'capstone.js must publish buildResiduePatch');
      const patch = CAP.buildResiduePatch(G);
      assert(patch && patch.bountyHunter && patch.bountyHunter.active
        && patch.bountyHunter.active.target === 'wolf',
        'the switched bounty is not in the residue patch, so a reload comes back on the old contract: '
        + JSON.stringify(patch && patch.bountyHunter && patch.bountyHunter.active));

      /* LIVE IS STILL DEFERRED, and that is not an accident to be tidied away:
         startCombat() clears and re-arms combatInterval and then calls
         combatTick() itself, so applying it from inside a tick is re-entrancy
         into the running loop. Pinned so a future "simplification" that makes
         live switch inline fails here instead of in a player's fight. */
      fixture();
      window.completeBounty();
      assert(G.bountyHunter.active && G.bountyHunter.active.target === 'wolf', 'live auto-accept must still take the next bounty');
      assert(G.activeMonster === 'goblin',
        'LIVE must NOT switch synchronously inside the tick (startCombat re-enters combatTick); activeMonster=' + G.activeMonster);
      assert(window.__bountySwitchPending() === null, 'live must not leave a pending away-switch queued');

      /* ── AND UNDER THE ARM THE SAME NIGHT HOLDS THE CONTRACT INSTEAD ───────
         The server owns the turn-in and holds only ONE active_bounty, so an
         armed away night settles and chains nothing: the contract must still be
         there at sunrise for hr_claim_bounty. Without the hold it is finalized
         for a reward the client may not pay, and the contract is lost. */
      window.clientMayWriteRecordField = function (f) { return f !== 'gold' && f !== 'marks'; };
      fixture();
      const heldAway = G.bountyHunter.active;
      C.reseed(0xB0117A);
      P._withOfflineReplay(() => { window.simulateAwayCombat(1, Date.now(), false); });
      assert(G.bountyHunter.active === heldAway,
        'ARMED: the away night settled the cull contract client-side — a finished contract lost with '
        + 'its Marks unclaimed; active is now '
        + JSON.stringify(G.bountyHunter.active && G.bountyHunter.active.target));
      assert(heldAway._awaitingServerClaim === true,
        'ARMED: the held contract must be latched as awaiting the server claim');
    } finally {
      window.clientMayWriteRecordField = origMay;
      try { window.G.bountyHunter.autoBounty = 0; window.G.bountyHunter.active = null; window.G.bountyHunter.board = []; } catch (e) {}
      try { window.__drainBountySwitch(); } catch (e) {}
      if (typeof window.stopCombat === 'function') window.stopCombat();
      C.randomSeed();
      restoreG(snap);
      /* The drain WRITES a save, so the restored state has to be written back
         over it — same rule AWAY-11 follows. Without this the suite would leave
         the player's local save naming a monster from a test fixture. */
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  () => tryRunAsync('b344: the bounty turn-in bonus is a SEEDED draw — the same seeded night pays the same Marks (it read Math.random())', async () => {
    if (typeof window.simulateAwayCombat !== 'function') { skip('seam absent'); return; }
    const G = window.G, C = window.HearthriseCore, P = window.HearthrisePresence;
    const snap = snapshotG();
    const realRandom = Math.random;
    /* The 10% bonus is drawn inside finalizeBounty, which under the gold ARM an
       away cull turn-in no longer reaches (the contract is HELD for
       hr_claim_bounty). Determinism is a property of the DRAW, so it is
       measured where the draw still happens: the dormant path. */
    const origMay = window.clientMayWriteRecordField;
    try {
      /* A night of one-kill bounties, so a single span turns in dozens of
         them and the 10% bonus is drawn dozens of times. */
      const fixture = () => {
        G.skills = Object.assign({}, G.skills, { attack: 500000, strength: 500000, defense: 500000, hitpoints: 500000 });
        G.equipment = {}; G.buffs = []; G.inventory = {}; G.gold = 0; G.marks = 0;
        G.playerMaxHp = 1e6; G.playerHp = 1e6;
        /* IDENTICAL STARTING STATE, quests and kill counter included — the same
           contract AWAY-1's rig learned in b341. Left un-reset, the first run
           collects the Field Licence quest's one-time 1,500 XP and the second
           cannot, and the comparison below reads that as a divergence caused by
           the roll under test. MEASURED while writing this: the two runs
           differed by exactly 1,500 attack XP and one quest reward, and the
           marks assertion never got a chance to speak. */
        G.quests = [];
        G.stats = Object.assign({}, G.stats, { kills: 0, deaths: 0, crits: 0, rareDrops: 0 });
        G.activeMonster = 'goblin';
        G.monsterHp = window.MONSTERS.goblin.hp; G.monsterMaxHp = window.MONSTERS.goblin.hp;
        G.bountyHunter = {
          marks: 0, xp: 0, completed: 0, autoBounty: 1, boardGeneratedAt: 0,
          freeRerolls: 0, rerollsToday: 0, upgrades: {}, warrants: {},
          active: { id: 'a', type: 'cull', target: 'goblin', tier: 1, difficulty: 'easy',
            progress: 0, required: 1, rewards: { gold: 10, marks: 20, xp: 5 } },
          board: Array.from({ length: 30 }, (_, i) => ({ id: 'x' + i, type: 'cull', target: 'goblin',
            tier: 1, difficulty: 'easy', progress: 0, required: 1, rewards: { gold: 10, marks: 20, xp: 5 } })),
        };
      };
      /* THE EXPERIMENT: hold the SEED fixed and vary Math.random(). A replayable
         night cannot notice. Deterministic — not a coin flip that could pass by
         luck. Before the fix this measured 1,230 Marks against 820 for the
         identical seed, with gold identical, which is what pins the divergence
         on the turn-in bonus rather than on the fight. */
      const night = (mathRandomValue, rngOverride) => {
        fixture();
        if (rngOverride) C.setRng(rngOverride); else C.reseed(0xB0117B);
        Math.random = () => mathRandomValue;
        // DORMANT for the night only — leg (b) below needs the REAL arm.
        window.clientMayWriteRecordField = function () { return true; };
        try { P._withOfflineReplay(() => { window.simulateAwayCombat(0.5, 1767225600000, false); }); }
        finally { Math.random = realRandom; window.clientMayWriteRecordField = origMay; }
        return { marks: G.marks, completed: G.bountyHunter.completed, gold: G.gold };
      };

      /* WARM-UP, then measure. MEASURED on a fresh page: five identical
         replays paid marks 640/640/640/640/640 and gold 5901/5401/5401/5401/
         5401 — the FIRST replay banks a one-time 500-gold grant that no later
         identical replay can collect, and `G.quests`/`G.stats` resets do not
         reach whatever tracks it. That is a property of the harness, not of the
         roll under test, so the comparison below is taken between two
         steady-state nights rather than between the first and the second.
         Without this the gold assertion would pass or fail on suite ORDER. */
      night(0.01);
      const lo = night(0.01);   // every bare 10% roll would SUCCEED
      const hi = night(0.99);   // every bare 10% roll would FAIL
      assert(lo.completed > 5, 'FIXTURE: the night must turn in several bounties, got ' + lo.completed);
      assert(lo.marks === hi.marks,
        'the same seeded night paid different Marks depending only on Math.random() — the turn-in bonus is not replayable: '
        + JSON.stringify([lo, hi]));
      /* Everything else must match too. Not a precondition — a second reading of
         the same property, and the one that catches a future unseeded draw
         anywhere else in the turn-in path. */
      assert(lo.completed === hi.completed && lo.gold === hi.gold,
        'the same seeded night diverged beyond Marks — something else on the turn-in path reads Math.random(): '
        + JSON.stringify([lo, hi]));

      /* …and the roll is not simply GONE. Forcing the SEAM (not Math.random)
         must still move the payout, or the assertion above would be satisfied
         by deleting the bonus altogether. Driven through a single turn-in
         rather than a whole night, because a rigged generator also rigs the
         fight — `()=>0.999` misses every swing, so a night-shaped version of
         this would "pass" by killing nothing, which is the assertion-that-
         asserts-nothing failure wearing a different hat. */
      /* b515 — THE PAYOUT IS NOT MEASURABLE HERE ANY MORE, AND THAT IS ITSELF
         THE PROPERTY. `marks` is SERVER-OF-RECORD and ARMED, so
         `completeBounty`'s bonus credit is explicitly gated
         (`if (bonusRoll && clientMayWriteRecordField('marks'))`) and pays
         nothing — deliberately, because hr_claim_bounty's reward is
         base x type x difficulty with NO bonus roll, so a local credit would be
         Marks that nothing anywhere grants. legacy.js says so at the call site.

         So the two halves are measured where each is true:
           (a) THE DRAW IS ON THE SEEDED STREAM. Forced through the seam, the
               bonus toast fires or does not; forced through Math.random with
               the seam pinned the other way, it follows the SEAM. That is the
               replayability property the server-side recompute rests on, and
               it survives whether or not the bonus currently pays.
           (b) IT PAYS NOTHING TODAY. A forced-hit turn-in must not move the
               balance, or the client is minting a server-owned currency.
         MUTATION: revert the draw to `Math.random() < 0.10` -> (a) goes red;
         drop the `clientMayWriteRecordField('marks')` gate -> (b) goes red. */
      const rngFrom = C.rngMod.rngFrom;
      const savedNotify = window.notify;
      const turnIn = (seamValue, globalValue) => {
        fixture();
        const base = G.bountyHunter.active.rewards.marks;
        let bonusToasts = 0;
        window.notify = function (m) { if (/Bonus turn-in/i.test(String(m))) bonusToasts++; };
        C.setRng(rngFrom(() => seamValue));
        Math.random = () => globalValue;
        const before = marksOfG();
        try { window.completeBounty(); } finally { window.notify = savedNotify; Math.random = realRandom; }
        return { bonusToasts, paid: marksOfG() - before, base };
      };
      const marksOfG = () => {
        /* The module publishes `window.HearthriseMarks`, not
           `HearthriseMarksRecord` (window-globals-exist.mjs caught the draft
           name; the fallback below hid it as a silent pass). */
        const MR = window.HearthriseMarks;
        if (MR && typeof MR.marksOf === 'function') {
          const v = MR.marksOf(G);
          return (v && typeof v.value === 'number') ? v.value : (Number(G.marks) || 0);
        }
        return Number(G.marks) || 0;
      };
      const mayPay = window.clientMayWriteRecordField('marks');
      // (a) the seam decides, in BOTH directions, whatever Math.random says.
      const seamHit = turnIn(0, 0.999);
      const seamMiss = turnIn(0.999, 0);
      if (mayPay) {
        assert(seamHit.bonusToasts === 1,
          'the turn-in bonus did not follow the SEEDED stream: the seam said hit (0 < 0.10) and the global '
          + 'said miss, and no bonus fired — either it reads Math.random() or the roll is gone');
        assert(seamMiss.bonusToasts === 0,
          'the turn-in bonus followed Math.random(): the seam said miss (0.999 > 0.10) and the global said '
          + 'hit, and it fired anyway');
      } else {
        /* (b) THE ARM. Under the Marks record the bonus is gated OFF at the
           call site, so neither the credit nor the toast may appear — a toast
           promising Marks nothing grants is most of what "I got 0 marks" feels
           like (b494). The DRAW is still asserted, structurally, below. */
        assert(seamHit.bonusToasts === 0 && seamHit.paid === 0,
          'the client paid or announced a turn-in bonus for a SERVER-OWNED balance: '
          + JSON.stringify(seamHit) + '. hr_claim_bounty has no bonus roll, so this is Marks that nothing '
          + 'anywhere grants and the next envelope takes back.');
        assert(seamMiss.paid === 0, 'a suppressed roll moved the balance: ' + JSON.stringify(seamMiss));
        /* AND THE DRAW ITSELF IS STILL SEEDED, so the day the bonus moves
           server-side it is replayable. Read off the shipped source with the
           comments stripped — the prose around this line names Math.random() as
           the thing it replaced, and a bare match would fail on the
           explanation. */
        /* ⚠ THE DRAW IS IN `finalizeBounty`, NOT IN `completeBounty`, AND IT IS
           NOT ON `window`. The two-phase turn-in splits: completeBounty fires
           the server intent, finalizeBounty pays out, and the bonus roll lives
           in the payout half — which is block-scoped, so `String(fn)` cannot
           reach it. Read from the SHIPPED BYTES instead, the same technique
           B492-3b uses for loadLocal's body, and anchored on the function that
           actually holds the draw: reading the wrong one would be a guard that
           passes while the draw is a bare Math.random(), which is exactly the
           shape this test exists to catch. */
        const legacySrc = await (await fetch('src/legacy.js')).text();
        assert(legacySrc.length > 100000, 'legacy.js did not come back — this guard would be vacuous');
        const fnAt = legacySrc.indexOf('function finalizeBounty(');
        assert(fnAt !== -1, 'finalizeBounty is gone from legacy.js — the payout half of the turn-in moved');
        const rawSrc = legacySrc.slice(fnAt, fnAt + 6000);
        assert(/bonusRoll/.test(rawSrc), 'the turn-in bonus roll is gone from the payout path entirely');
        const src = rawSrc
          .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
        assert(/rng\s*\.\s*chance\s*\(/.test(src),
          'completeBounty no longer draws the turn-in bonus from the seeded stream — the server recomputes '
          + 'an absence from (user_id, slot, accrued_to) and a bare draw makes its answer differ from the '
          + "client's every single time");
        /* THE SHAPE, not merely the presence: seeded FIRST, and the bare draw
           reachable ONLY as the pre-boot fallback on the other side of the `?:`
           (the same idiom companions.js and dungeons.js use, and legacy.js says
           so at the call site). A revert to an unconditional `Math.random() <
           0.10` fails this while still containing the word `chance` somewhere
           in the function, which is why the presence check above is not enough. */
        const seededFirst = /\?\s*[A-Za-z_$][\w$]*\.rng\.chance\(\s*0?\.10\s*\)\s*:/.test(src);
        assert(seededFirst,
          'the turn-in bonus no longer PREFERS the seeded stream — a bare draw is reachable on the live '
          + 'path, and the server recomputing the same absence would get a different number every time');
        const bare = src.match(/Math\s*\.\s*random\s*\(\s*\)/g) || [];
        assert(bare.length <= 1,
          'finalizeBounty holds ' + bare.length + ' Math.random() draws — at most the ONE documented '
          + 'pre-boot fallback may exist, and a second one is by definition on a path the seed cannot replay');
      }
    } finally {
      Math.random = realRandom;
      window.clientMayWriteRecordField = origMay;
      try { C.setRng(null); C.randomSeed(); } catch (e) {}
      try { window.G.bountyHunter.autoBounty = 0; window.G.bountyHunter.active = null; window.G.bountyHunter.board = []; } catch (e) {}
      try { window.__drainBountySwitch(); } catch (e) {}
      if (typeof window.stopCombat === 'function') window.stopCombat();
      restoreG(snap);
      try { window.saveLocal(); } catch (e) {}   // the turn-ins wrote saves; put the real one back
    }
  }),

  /* ── NO BARE Math.random() IS REACHABLE FROM THE AWAY REPLAY ──────────────
     The server recomputes an absence from (user_id, slot, accrued_to) and its
     answer must equal the client's. Any bare Math.random() on that path breaks
     it BY CONSTRUCTION — not probabilistically, every single time.

     The three sites that were left (companions.js rollProc, pets.js
     rollSkillPet and rollBossPet) were found by INSTRUMENTING the real global
     across a set of away nights, not by grep: hundreds of draws a night, and
     with the SEED PINNED and only Math.random() varied the same night paid
     7,899 gold against 7,789 and unlocked a different pet in each replay.

     THE TEST HAS THREE LAYERS, and it needs all three:

       LAYER 1 — THE CONTRACT, at night scale. Hold the seed fixed, vary
         Math.random() between two constants, and require the night to be
         byte-identical. One observable per site, so a single site coming back
         is named rather than lumped into "something diverged".

       LAYER 2 — THE MECHANISM, at single-action scale. Layer 1 alone is
         satisfied by DELETING a roll, which is the assertions-that-assert-
         nothing failure this repo has met fifteen times. So each roll is also
         driven with the two sources set to OPPOSITE verdicts — the SEAM says
         "hit", the global says "miss" — and the outcome must follow the seam.
         Deterministic in both directions under both code paths, so reverting
         any one site turns exactly its own assertion red rather than making
         it flaky.

       LAYER 3 — THE CENSUS. Layers 1 and 2 can only see the sites they were
         written for. This counts every bare Math.random() the away replay
         touches and requires zero, which is the only assertion that can see a
         FOURTH site nobody has thought of yet. It names the offender's stack
         when it fails, so a future red is a thirty-second diagnosis.

     NO RATE, CHANCE OR AMOUNT IS TOUCHED — the Raccoon's 20%, the Beaver's
     1-in-2,500 and the Lichling's 1-in-200 are read from the live data. The
     proc counter reads the pet's OWN label out of COMPANIONS rather than
     hardcoding it, so a designer renaming a proc cannot rot this. */
  () => tryRun('b345: the last three away rolls are SEEDED — a companion proc, a skill pet and a boss pet all replay from one seed', () => {
    if (typeof window.simulateAwayCombat !== 'function' || typeof window.doSkillAction !== 'function'
        || !window.HearthrisePets || !window.COMPANIONS || !window.MONSTERS.lich) {
      skip('seam absent'); return;
    }
    const G = window.G, C = window.HearthriseCore, P = window.HearthrisePresence;
    const snap = snapshotG();
    const realRandom = Math.random;
    const savedNotify = window.notify;
    const savedSkill = { ms: G.skillMs, progress: G.skillProgress };
    /* A FIXED away timestamp, not Date.now(): the Boss of the Day is a
       function of the clock, so a wall-clock `now` would change the featured
       monster mid-suite and the two replays would not be comparable. */
    const AT_MS = 1767225600000;
    const SEED = 0xC0FFEE;
    const GATHER_ACTIONS = 200;
    const tree = (window.TREES || []).find((t) => t.id === 'normal_tree');
    assert(tree, 'FIXTURE: normal_tree must exist or the gather night has nothing to cut');

    // ── fixtures ───────────────────────────────────────────────────────────
    // Both start from an IDENTICAL state, quests and kill counter included —
    // the b341/b344 lesson: a one-time quest payout collected by the first
    // replay and not the second reads as a divergence caused by the roll.
    const combatFixture = () => {
      G.skills = Object.assign({}, G.skills,
        { attack: 900000, strength: 900000, defense: 900000, hitpoints: 900000 });
      G.equipment = {}; G.buffs = []; G.inventory = {}; G.gold = 0;
      G.playerMaxHp = 1e6; G.playerHp = 1e6;
      G.quests = [];
      G.stats = Object.assign({}, G.stats, { kills: 0, deaths: 0, crits: 0, rareDrops: 0 });
      G.activeSkill = null; G.skillTargetId = null; G.activeArtisanRecipe = null;
      G.activeMonster = 'lich';
      G.monsterHp = window.MONSTERS.lich.hp; G.monsterMaxHp = window.MONSTERS.lich.hp;
      // Auto-bounty OFF: it would switch the monster mid-night (b344) and the
      // boss-pet roll would stop being about the lich.
      /* b503: no `xp` and no `marks` here. Both are SERVER-owned (xp is the
         player_skills 'bountyHunter' row credited by hr_claim_bounty; marks is
         the top-level record field G.marks), and seeding them into the residue
         object re-creates the shadow shape this build deleted — a fixture that
         implies a field exists is how the field comes back. */
      G.bountyHunter = { completed: 0, autoBounty: 0, boardGeneratedAt: 0,
        freeRerolls: 0, rerollsToday: 0, upgrades: {}, warrants: {}, active: null, board: [] };
      // A kill-proc pet equipped, and NO pet owned that the night could roll —
      // an owned pet is skipped without drawing, which would make this vacuous.
      G.companions = { equipped: 'raccoon', ownedIds: ['raccoon'], xp: { raccoon: 0 } };
    };
    const gatherFixture = () => {
      G.equipment = {}; G.buffs = []; G.inventory = {}; G.gold = 0;
      G.quests = [];
      G.stats = Object.assign({}, G.stats, { kills: 0, deaths: 0, crits: 0, rareDrops: 0 });
      G.activeMonster = null; G.activeArtisanRecipe = null;
      G.skills = Object.assign({}, G.skills, { woodcutting: 0 });
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree';
      G.skillMs = tree.ms; G.skillProgress = 0;
      G.companions = { equipped: 'sparrow', ownedIds: ['sparrow'], xp: { sparrow: 0 } };
    };
    const combatNight = () => {
      P._withOfflineReplay(() => { window.simulateAwayCombat(0.5, AT_MS, false); });
    };
    const gatherNight = () => {
      P._withOfflineReplay(() => {
        for (let i = 0; i < GATHER_ACTIONS; i++) window.doSkillAction(true);
      });
    };
    const owns = (id) => (G.companions.ownedIds || []).indexOf(id) >= 0;

    try {
      // ── LAYER 1: same seed, different Math.random() → the same night ──────
      const night = (fixture, run, mathRandomValue) => {
        fixture();
        C.reseed(SEED);
        Math.random = () => mathRandomValue;
        try { run(); } finally { Math.random = realRandom; }
        return { gold: G.gold, kills: (G.stats.kills || 0),
          logs: (G.inventory.normal_log || 0),
          lichling: owns('lichling'), beaver: owns('beaver') };
      };

      // Warm-up first, then measure between two STEADY-STATE nights: the first
      // replay in a fresh page banks one-time grants no later replay can
      // collect, and comparing first-against-second would make this pass or
      // fail on suite ORDER rather than on the rolls (b344, measured).
      night(combatFixture, combatNight, 0.5);
      const cLo = night(combatFixture, combatNight, 0.0001);   // every bare roll HITS
      const cHi = night(combatFixture, combatNight, 0.9999);   // every bare roll MISSES

      assert(cLo.kills > 5,
        'FIXTURE: the away night must land several kills or every assertion below is vacuous, got ' + cLo.kills);
      // SITE 1 — companions.js rollProc. The Raccoon pays extraGold on kill, so
      // an unseeded proc shows up as gold and nothing else.
      assert(cLo.gold === cHi.gold,
        'companions.js rollProc reads Math.random(): the SAME seeded night paid ' + cLo.gold
        + ' gold with Math.random()=0.0001 and ' + cHi.gold + ' with 0.9999. A companion proc pays, '
        + 'so the server and the client would compute different totals for the same absence.');
      // SITE 2 — pets.js rollBossPet, on the lich's 1-in-200.
      assert(cLo.lichling === cHi.lichling,
        'pets.js rollBossPet reads Math.random(): the SAME seeded night unlocked lichling='
        + cLo.lichling + ' with Math.random()=0.0001 and ' + cHi.lichling + ' with 0.9999.');
      assert(cLo.kills === cHi.kills,
        'the same seeded night diverged beyond the two rolls under test — kills ' + cLo.kills
        + ' vs ' + cHi.kills + '; something ELSE on the away combat path reads Math.random()');

      night(gatherFixture, gatherNight, 0.5);
      const gLo = night(gatherFixture, gatherNight, 0.0001);
      const gHi = night(gatherFixture, gatherNight, 0.9999);

      assert(gLo.logs === GATHER_ACTIONS,
        'FIXTURE: the gather night must actually cut ' + GATHER_ACTIONS + ' logs, got ' + gLo.logs);
      // SITE 3 — pets.js rollSkillPet, on woodcutting's 1-in-2,500.
      assert(gLo.beaver === gHi.beaver,
        'pets.js rollSkillPet reads Math.random(): the SAME seeded gather night unlocked beaver='
        + gLo.beaver + ' with Math.random()=0.0001 and ' + gHi.beaver + ' with 0.9999.');
      assert(gLo.logs === gHi.logs,
        'the same seeded gather night diverged beyond the roll under test — something else reads Math.random()');

      /* ── LAYER 2: the seam says HIT, the global says MISS ────────────────
         Every assertion above is also satisfied by deleting the roll outright,
         so each roll is now driven with the two sources contradicting each
         other. The outcome must follow the SEAM. Both directions are pinned,
         so a revert of any single site turns exactly that site's pair red and
         never merely flaky. */
      const followsSeam = (setup, fire, read, seamValue, globalValue) => {
        setup();
        C.setRng(C.rngMod.rngFrom(() => seamValue));
        Math.random = () => globalValue;
        try { fire(); } finally { Math.random = realRandom; C.setRng(null); }
        return read();
      };

      /* b515 — WHAT THE THREE SITES ARE READ THROUGH CHANGED, because the
         client no longer authors the outcome. Each used to be read through its
         EFFECT: the Raccoon's proc toast, and `ownedIds` containing the pet a
         line after the roll. Neither is available now, and both for correct
         reasons documented at their call sites:

           · `rollProc` DEFERS a gold/extraGold proc entirely under the gold arm
             (companions.js: "do NOT show a +Xg proc animation or record a
             contribution the pet did not make"), so the Raccoon fires nothing;
           · `unlockCompanion` waits for hr_companion_grant before a non-shop
             companion joins (`needsServerConfirm`), so `ownedIds` is
             legitimately still empty a line later — HATCH-REFUSE-1..3's subject.

         So each site is read through the thing that is still the CLIENT's: the
         roll DECIDED. A hit routes to `unlockCompanion` (spied), a miss does
         not; a non-gold proc still shows its label. That is a tighter reading
         than the old one — it cannot pass because an effect happened for some
         other reason — and it is the half a server-side recompute depends on. */

      /* SITE 1 again — a proc whose EFFECT is not a gold credit, so the arm
         does not defer it. Chosen from the catalogue rather than named, so a
         data change fails here loudly instead of making this vacuous. */
      const procId = Object.keys(window.COMPANIONS).filter((id) => {
        const pr = window.COMPANIONS[id].proc;
        return pr && pr.trigger === 'kill' && pr.effect !== 'gold' && pr.effect !== 'extraGold';
      })[0];
      if (procId) {
        const procLabel = window.COMPANIONS[procId].proc.label;
        let procs = 0;
        window.notify = function (msg) { if (String(msg).indexOf(procLabel) >= 0) procs++; };
        const oneKill = (seamValue, globalValue) => followsSeam(
          () => {
            combatFixture();
            G.companions = { equipped: procId, ownedIds: [procId], xp: {} };
            G.monsterHp = 999999; G.monsterMaxHp = 999999;
            procs = 0;
          },
          () => window.killMonster(window.MONSTERS.goblin),
          () => procs, seamValue, globalValue);
        assert(oneKill(0, 0.9999) === 1,
          'companions.js rollProc did not follow the SEEDED stream: the seam said hit and the global said '
          + 'miss, and the proc did not fire — either it reads Math.random() or the roll is gone');
        assert(oneKill(0.9999, 0.0001) === 0,
          'companions.js rollProc followed Math.random(): the seam said miss and the global said hit, '
          + 'and the proc fired anyway');
        window.notify = savedNotify;
      } else {
        /* Every kill-triggered proc in the catalogue pays gold, so all of them
           are deferred under the arm and site 1 has no observable effect at
           all. Say so rather than passing quietly. */
        skip('no non-gold kill proc in the catalogue — rollProc is unobservable under the gold arm');
      }

      /* SITES 2 and 3 — the pet rolls, read through the DECISION rather than
         through ownership. `unlockCompanion` is the one call a hit makes; under
         the capstone it returns false and asks the server, so counting the CALL
         is what "the roll fired" means now. Grants are parked so the ladder
         cannot leave a retry running through the rest of the suite. */
      const CO = window.HearthriseCompanions;
      const wasParked = (CO && typeof CO.__parkGrants === 'function') ? CO.__parkGrants(true) : false;
      const realUnlock = window.unlockCompanion;
      let unlockCalls = [];
      try {
        window.unlockCompanion = function (id) { unlockCalls.push(id); return false; };
        const oneBossKill = (seamValue, globalValue) => followsSeam(
          () => {
            combatFixture();
            G.monsterHp = 999999; G.monsterMaxHp = 999999;
            unlockCalls = [];
          },
          () => window.killMonster(window.MONSTERS.lich),
          () => unlockCalls.indexOf('lichling') >= 0, seamValue, globalValue);
        assert(oneBossKill(0, 0.9999) === true,
          'pets.js rollBossPet did not follow the SEEDED stream: the seam said hit (0 < 1/200) and the '
          + 'global said miss, and no lichling was claimed');
        assert(oneBossKill(0.9999, 0.0001) === false,
          'pets.js rollBossPet followed Math.random(): the seam said miss and the global said hit, '
          + 'and the lichling was claimed anyway');

        const oneGather = (seamValue, globalValue) => followsSeam(
          () => { gatherFixture(); unlockCalls = []; },
          () => window.doSkillAction(true),
          () => unlockCalls.indexOf('beaver') >= 0, seamValue, globalValue);
        assert(oneGather(0, 0.9999) === true,
          'pets.js rollSkillPet did not follow the SEEDED stream: the seam said hit (0 < 1/2500) and the '
          + 'global said miss, and no beaver was claimed');
        assert(oneGather(0.9999, 0.0001) === false,
          'pets.js rollSkillPet followed Math.random(): the seam said miss and the global said hit, '
          + 'and the beaver was claimed anyway');
      } finally {
        window.unlockCompanion = realUnlock;
        if (CO && typeof CO.__parkGrants === 'function') CO.__parkGrants(wasParked);
      }

      /* ── LAYER 3: the census ─────────────────────────────────────────────
         The only assertion here that can see a site nobody has named. */
      const census = (fixture, run) => {
        fixture();
        C.reseed(SEED);
        let n = 0; const where = [];
        Math.random = function () {
          n++;
          if (where.length < 3) {
            where.push((new Error().stack || '').split('\n').slice(2, 4)
              .map((s) => s.trim().replace(/^at\s+/, '').replace(/https?:\/\/[^/]+/, '')).join(' <- '));
          }
          return realRandom();
        };
        try { run(); } finally { Math.random = realRandom; }
        return { n, where };
      };
      const cCensus = census(combatFixture, combatNight);
      assert(cCensus.n === 0,
        'the away COMBAT replay drew ' + cCensus.n + ' bare Math.random() value(s) — an away night must be '
        + 'replayable from its seed alone, so every draw belongs to HearthriseCore.rng. Offender(s): '
        + cCensus.where.join(' | '));
      const gCensus = census(gatherFixture, gatherNight);
      assert(gCensus.n === 0,
        'the away GATHER replay drew ' + gCensus.n + ' bare Math.random() value(s). Offender(s): '
        + gCensus.where.join(' | '));
    } finally {
      Math.random = realRandom;
      window.notify = savedNotify;
      try { C.setRng(null); C.randomSeed(); } catch (e) {}
      try { window.G.bountyHunter.autoBounty = 0; window.G.bountyHunter.active = null; window.G.bountyHunter.board = []; } catch (e) {}
      try { window.__drainBountySwitch(); } catch (e) {}
      if (typeof window.stopCombat === 'function') window.stopCombat();
      /* No skill interval to clear: the gather night drives doSkillAction()
         directly and never calls startSkill(), so nothing is armed. skillMs /
         skillProgress ARE written by hand above and are not in snapshotG's
         list, so they are put back by hand. */
      G.skillMs = savedSkill.ms; G.skillProgress = savedSkill.progress;
      restoreG(snap);
      try { window.saveLocal(); } catch (e) {}   // the nights wrote saves; put the real one back
    }
  }),

  () => tryRun('b262: active bounty progress shows in the combat activity bar (paione: task kills-left hidden on landscape)', () => {
    if(typeof window.refreshActivityBar !== 'function'){ skip('no activity-bar fn'); return; }
    const meta = document.getElementById('ab-meta');
    if(!meta){ skip('activity bar not mounted in harness'); return; }
    const snap = snapshotG();
    try {
      const G = window.G;
      if(typeof window.ensureBountyState === 'function') window.ensureBountyState();
      G.bountyHunter.active = { id:'t', type:'cull', target:'goblin', tier:1, difficulty:'easy', progress:3, required:10, rewards:{gold:1,marks:1,xp:1} };
      G.activeMonster = 'goblin'; G.monsterHp = 10; G.monsterMaxHp = 15; G.playerHp = 50; G.playerMaxHp = 50;
      window.refreshActivityBar();
      const html = document.getElementById('ab-meta').innerHTML;
      assert(/ab-bounty/.test(html) && /3\/10/.test(html), 'combat activity bar must show the active bounty progress, got: ' + html.slice(0, 140));
      // No chip when the bounty targets a DIFFERENT monster than the one you're fighting.
      G.activeMonster = 'rat';
      window.refreshActivityBar();
      assert(!/ab-bounty/.test(document.getElementById('ab-meta').innerHTML), 'no bounty chip when fighting a non-target monster');
    } finally { restoreG(snap); }
  }),

  () => tryRunAsync('b261: a throttled background must not shred the offline gap (paione: AFK credits zero on Android)', async () => {
    /* THE BUG: on Android a backgrounded tab keeps firing the 90s autosave and
       the 4s watchdog. If either ADVANCES the away watermark, a real absence is
       sliced into sub-threshold pieces that each credit nothing, and the player
       comes back to zero.

       b515 — THE WATERMARK IS NOT THE CLIENT'S ANY MORE, and that is a stronger
       form of the same guard rather than a weaker one. `offlineBudget` is
       SERVER-OF-RECORD and ARMED, so `clientMayWriteRecordField('offlineBudget')`
       is false and NOTHING on the client may move it — hidden or visible. The
       old test could only show that saveLocal/processOffline happened not to;
       this shows they CANNOT, and then shows the two halves that are still the
       client's: nothing is asked while hidden, and the whole span is asked for
       on the way back.
       MUTATION: drop the `clientMayWriteRecordField('offlineBudget')` guard
       from saveLocal (B347-R1's mutation) → the first assertion goes red. */
    const G = window.G;
    const A = window.HearthriseAccrual;
    const C = window.HearthriseCharacter;
    const snap = snapshotG();
    const dHid = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    const realFetch = window.fetch;
    let bodies = [];
    try {
      window.fetch = function (u, init) {
        const str = String(u);
        if (/hr-accrue/.test(str)) {
          bodies.push(String((init && init.body) || ''));
          return Promise.resolve(new Response('{"ok":true,"accrued":false,"reason":"none"}', { status: 200 }));
        }
        if (/hr_create_character/.test(str)) return Promise.resolve(new Response('{"ok":true,"slot":0,"created":false}', { status: 200 }));
        if (/hr_load/.test(str)) return Promise.resolve(new Response('{"ok":false,"error":"no_character"}', { status: 200 }));
        return realFetch.apply(this, arguments);
      };
      const wiring = { url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => 'jwt' };
      A.resetAccrualGate(); A.configureAccrual(wiring);
      C.resetCharacterIntent(); C.configureCharacter({ ...wiring, userId: () => 'user-b261' });

      G.activeMonster = 'goblin';
      const m = window.MONSTERS.goblin;
      G.monsterHp = m.hp; G.monsterMaxHp = m.hp;
      G.activeSkill = null; G.activeArtisanRecipe = null;
      // Backgrounded 30 min ago; the watermark sits at hide-time.
      const hideAt = Date.now() - 30 * 60000;
      G.offlineBudget = { dayKey: window.utcDayKey(Date.now()), usedMs: 0, at: hideAt };
      stampRecordLikeLoad(G);

      /* (a) WHILE HIDDEN (the Android throttle) the 90s autosave and the 4s
         watchdog keep firing. Neither may advance the watermark. */
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      if (typeof window.saveLocal === 'function') window.saveLocal();
      window.processOffline();
      for (let i = 0; i < 40; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      assert(G.offlineBudget.at === hideAt,
        'the watermark moved by ' + (G.offlineBudget.at - hideAt) + 'ms while hidden — that is the bug '
        + 'that sliced a real absence into sub-threshold pieces crediting zero');
      assert(window.clientMayWriteRecordField('offlineBudget') === false,
        'the CLIENT may write the away watermark again — the assertion above then only says it did not '
        + 'happen to this time, and the server owns `accrued_to`');

      /* (b) AND THE RETURN ASKS FOR THE WHOLE SPAN. The client no longer
         simulates it, so "credited" means "the request left, naming this
         character's slot" — the paying is the engine's (AWAY-HONEST-1). */
      bodies = [];
      /* ⚠ THE ENSURE LATCHES ONCE PER SESSION, and the hidden call above spent
         it — `ensureThenAccrue` is deliberately one round trip per session, not
         one per return (b338). Re-armed here so (b) measures a fresh return
         rather than the latch. */
      A.resetAccrualGate(); A.configureAccrual(wiring);
      C.resetCharacterIntent(); C.configureCharacter({ ...wiring, userId: () => 'user-b261' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      window.processOffline();
      for (let i = 0; i < 40; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 40; i++) await Promise.resolve();
      assert(bodies.length >= 1,
        'returning from a 30-minute background put nothing on the wire — the span is credited by nobody');
      assert(/"slot"\s*:\s*\d/.test(bodies[0]),
        'the accrual request does not name a character slot: ' + bodies[0].slice(0, 120));
      /* THE WATERMARK STILL DID NOT MOVE LOCALLY. The server advances
         `accrued_to` in the answer; a client that moved it on the way OUT would
         shorten the very span it is asking to be paid for. */
      assert(G.offlineBudget.at === hideAt,
        'asking for the span moved the watermark locally by ' + (G.offlineBudget.at - hideAt)
        + 'ms — the request would then under-report the absence it is about');
    } finally {
      window.fetch = realFetch;
      if (dHid) Object.defineProperty(document, 'hidden', dHid); else { try { delete document.hidden; } catch (e) {} }
      A.resetAccrualGate(); A.configureAccrual(null);
      C.resetCharacterIntent(); C.configureCharacter(null);
      restoreGAndRecord(snap);
    }
  }),

  /* b260 — and, since b330, a lesson about what makes a test flaky.
     ─────────────────────────────────────────────────────────────────────────
     This test failed roughly one run in four and the cause was NOT the code it
     guards. `__hrResume(true)` replays five minutes of away combat through the
     real simulator, whose rng is seeded from Math.random() at boot, so every
     run fought a DIFFERENT five minutes. On the unlucky seeds the player DIED
     part-way through — a perfectly legitimate outcome — and a death clears
     `G.activeMonster`, so `resumeActiveActivity()` correctly re-armed nothing
     and the assertion "resume must re-arm the live combat loop" failed. The
     test was asserting "resume re-arms the loop" while its fixture allowed the
     fight to end. Proven by making the fixture weak on purpose (hitpoints 500):
     the failure became 2 out of 2, with that exact message.

     Two fixes, both structural rather than tolerance-based:
       1. DEATH IS REMOVED BY CONSTRUCTION, not by luck. The player is given an
          HP pool no goblin can chew through in a five-minute span, and the test
          ASSERTS that no death occurred — so if a future balance change ever
          makes the fixture killable again this fails loudly with the reason,
          instead of going flaky.
       2. THE SEED IS PINNED. HearthriseCore.reseed() makes the replayed span
          byte-identical run to run, which is the same seam AWAY-1 uses. The
          stream is restored afterwards so no later test inherits it.
     ───────────────────────────────────────────────────────────────────────── */
  () => tryRunAsync('b260: robust resume re-arms combat AND asks for the frozen gap, no visibilitychange needed', async () => {
    /* THE BUG (paione): iOS PWAs do NOT reliably fire `visibilitychange` on
       return — they may fire `pageshow`/`focus`, or nothing at all — so a
       resume path hung off that one event left combat frozen. Every resume
       signal funnels through ONE idempotent handler, and a watchdog runs it
       even when no event fires.

       b515 — "CREDITS" BECAME "ASKS", exactly as in b230, and for the same
       reason: `hrResume` still calls `processOffline()`, but that function no
       longer simulates the span — it puts the accrual request on the wire and
       applies the answer. So the two properties this test owns are (1) the
       live loop is re-armed and (2) the request LEAVES, measured on the wire.
       The paying is the engine's (AWAY-HONEST-1) and the seeded-replay
       flakiness the b330 note below describes goes away with it: nothing here
       simulates a fight any more, so nothing here can die on an unlucky seed.
       MUTATION: delete the `processOffline()` call from `hrResume` → red on
       the request count; delete the `resumeActiveActivity()` call → red on the
       re-arm. */
    if (typeof window.__hrResume !== 'function' || typeof window.__isCombatLoopArmed !== 'function') { skip('seam absent'); return; }
    const G = window.G;
    const A = window.HearthriseAccrual;
    const C = window.HearthriseCharacter;
    const snap = snapshotG();
    const realFetch = window.fetch;
    const hiddenDesc = Object.getOwnPropertyDescriptor(document, 'hidden');
    const gate = window.HearthriseGate;
    const origOpen = gate && gate.isOpen;
    let accrueHits = 0;
    try {
      if (gate) gate.isOpen = () => true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      window.fetch = function (u) {
        const str = String(u);
        if (/hr-accrue/.test(str)) { accrueHits++; return Promise.resolve(new Response('{"ok":true,"accrued":false,"reason":"none"}', { status: 200 })); }
        if (/hr_create_character/.test(str)) return Promise.resolve(new Response('{"ok":true,"slot":0,"created":false}', { status: 200 }));
        if (/hr_load/.test(str)) return Promise.resolve(new Response('{"ok":false,"error":"no_character"}', { status: 200 }));
        return realFetch.apply(this, arguments);
      };
      const wiring = { url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => 'jwt' };
      A.resetAccrualGate(); A.configureAccrual(wiring);
      C.resetCharacterIntent(); C.configureCharacter({ ...wiring, userId: () => 'user-b260' });

      if (typeof window.stopCombat === 'function') window.stopCombat();     // dead interval
      G.activeMonster = 'goblin';
      const m = window.MONSTERS.goblin;
      G.monsterHp = m.hp; G.monsterMaxHp = m.hp;
      G.playerMaxHp = 100000; G.playerHp = G.playerMaxHp;
      G.offlineBudget = { at: Date.now() - 5 * 60000 };
      stampRecordLikeLoad(G);
      assert(!window.__isCombatLoopArmed(), 'precondition: combat loop is dead');

      // The resume handler runs WITHOUT any visibilitychange event.
      window.__hrResume(true);
      for (let i = 0; i < 40; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 40; i++) await Promise.resolve();

      assert(window.__isCombatLoopArmed(), 'resume must re-arm the live combat loop');
      assert(G.activeMonster === 'goblin',
        'resume cleared the activity pointer — the fight the player left running is gone: ' + G.activeMonster);
      assert(accrueHits >= 1,
        'resume put ' + accrueHits + ' accrual requests on the wire — the frozen span is asked for by '
        + 'nobody, which is paione\'s frozen AFK combat in its current shape');

      /* The Android case: the interval EXISTS but is stalled (suspended, not
         cleared) — a stale heartbeat must trigger a fresh restart. */
      window._hrCombatBeat = Date.now() - 20000;
      window.resumeActiveActivity();
      assert(Date.now() - (window._hrCombatBeat || 0) < 2000,
        'a stalled combat loop must be restarted (fresh heartbeat), got age ' + (Date.now() - (window._hrCombatBeat || 0)) + 'ms');
    } finally {
      window.fetch = realFetch;
      if (gate && origOpen) gate.isOpen = origOpen;
      if (hiddenDesc) Object.defineProperty(document, 'hidden', hiddenDesc); else { try { delete document.hidden; } catch (e) {} }
      A.resetAccrualGate(); A.configureAccrual(null);
      C.resetCharacterIntent(); C.configureCharacter(null);
      if (typeof window.stopCombat === 'function') window.stopCombat();
      restoreGAndRecord(snap);
    }
  }),

  () => tryRun('b259: portrait gate exists, hidden on desktop, gated to portrait touch phones only', () => {
    const g = document.getElementById('hr-rotate-gate');
    assert(g, 'the rotate gate element must be present from first paint');
    assert(/sideways|landscape|rotate/i.test(g.textContent), 'it must tell the player to rotate');
    // On the harness viewport (desktop, fine pointer) the gate must be hidden.
    assert(getComputedStyle(g).display === 'none', 'the gate must be hidden on desktop / landscape, got ' + getComputedStyle(g).display);
    // The SHOW rule must be gated to a portrait, phone-width, TOUCH device — never desktop.
    let media = null;
    for(const s of document.styleSheets){
      let rules; try { rules = s.cssRules; } catch(e){ continue; }
      for(const r of rules){
        if(r.type === CSSRule.MEDIA_RULE && /hr-rotate-gate/.test(r.cssText)){
          const mt = (r.media && r.media.mediaText) || '';
          if(/portrait/.test(mt)) media = mt;
        }
      }
    }
    assert(media, 'a portrait media rule for the gate must exist');
    assert(/pointer:\s*coarse/.test(media) && /hover:\s*none/.test(media), 'gate must be limited to touch devices, got: ' + media);
    assert(/max-width/.test(media), 'gate must be limited to phone width, got: ' + media);
  }),

  () => tryRun('b258: combat loop re-arms on resume so AFK/offline combat keeps going (paione: stuck at 71 kills)', () => {
    if(typeof window.resumeActiveActivity !== 'function' || typeof window.__isCombatLoopArmed !== 'function'){ skip('seam absent'); return; }
    const snap = snapshotG();
    try {
      const G = window.G;
      if(typeof window.stopCombat === 'function') window.stopCombat();   // ensure the interval is clear
      assert(!window.__isCombatLoopArmed(), 'precondition: no combat loop running');
      // A save with an active fight but a DEAD interval — exactly the state after a
      // mobile suspend clears the timer. Resume must restart the loop.
      G.activeMonster = 'goblin';
      const m = window.MONSTERS.goblin;
      G.monsterHp = m.hp; G.monsterMaxHp = m.hp; G.playerHp = 50; G.playerMaxHp = 50;
      window.resumeActiveActivity();
      assert(window.__isCombatLoopArmed(), 'resume must re-arm the combat loop when a monster is active');
    } finally {
      if(typeof window.stopCombat === 'function') window.stopCombat();
      restoreG(snap);
    }
  }),

  () => tryRun('b257: renderCombat leaves the auto-eat dropdown alone while it is open (paione: menu closes every few ticks)', () => {
    const el = document.getElementById('combat-area');
    if(!el || typeof window.renderCombat !== 'function'){ skip('combat area absent'); return; }
    const snap = snapshotG();
    try {
      const G = window.G;
      G.activeMonster = 'goblin'; G.monsterHp = 15; G.monsterMaxHp = 15;
      G.playerHp = 30; G.playerMaxHp = 30;
      // Simulate the player having opened the auto-eat <select> (it holds focus).
      el.innerHTML = '<select id="__ae_test"><option>a</option></select>';
      const sel = document.getElementById('__ae_test');
      sel.focus();
      if(document.activeElement !== sel){ skip('focus not honoured here — skip'); return; }
      window.renderCombat();
      assert(document.getElementById('__ae_test'), 'render must NOT tear down the focused dropdown mid-pick');
      // Once the menu is closed (focus leaves), rendering resumes normally.
      sel.blur();
      window.renderCombat();
      assert(!document.getElementById('__ae_test'), 'render rebuilds normally once the dropdown is closed');
    } finally { restoreG(snap); }
  }),

  () => tryRun('b256: Boss of the Day card lives with the picker + hides during a fight (paione: popped up mid-combat)', () => {
    const B = window.HearthriseBossOfDay;
    if(!B || typeof B.render !== 'function'){ skip('boss module absent'); return; }
    const panel = document.getElementById('panel-combat');
    if(!panel){ skip('no combat panel'); return; }
    B.render();
    const card = document.getElementById('hr-botd-card');
    assert(card && card.parentElement === panel, 'the card must be a child of #panel-combat');
    /* b362 — THE CARD'S PLACEMENT CLAIM IS RETIRED, ITS BEHAVIOUR CLAIM IS NOT.
       "sits just before the monster picker" was an ordering rule for a screen
       where three cards shared one grid. The picker is now inside the War Table
       view (so it is not even a sibling), and the featured boss has a real front
       door: a DESTINATION CARD on the War Table (COMBAT-UI-05), which is where a
       destination belongs. What paione actually reported — the boss card
       appearing on top of a live fight — is asserted below, unchanged, plus the
       replacement surface, so the entry point cannot silently vanish. */
    const CS = window.HearthriseCombatScreens;
    if (CS) {
      CS.setView('table'); CS.render();
      const dests = document.getElementById('wt-dests');
      assert(dests && /Boss of the Day/i.test(dests.textContent),
        'the War Table has no Boss of the Day destination — the featured boss lost its front door');
    }
    const hadActive = panel.classList.contains('active');
    const hadCombat = document.body.classList.contains('in-combat');
    panel.classList.add('active'); document.body.classList.add('in-combat');
    try {
      assert(getComputedStyle(card).display === 'none', 'the card must be hidden during an active fight');
      document.body.classList.remove('in-combat');
      /* With the two-screen split the legacy card is retired outright on the
         combat panel (combat-screens.css); the destination row replaced it.
         What must never happen is the b290/b292 report: it drawing over a
         fight. Assert the strong form — it is not on the fighting screen —
         and let the destination assertion above own "it is still reachable". */
      assert(getComputedStyle(card).display === 'none' || CS == null,
        'the retired boss card is drawing on the combat panel beside its own destination card');
    } finally {
      if(!hadActive) panel.classList.remove('active');
      if(hadCombat) document.body.classList.add('in-combat'); else document.body.classList.remove('in-combat');
    }
  }),

  /* ── regression suite — THE DESTINATION RAIL THAT HUNG OFF THE PANEL ───────
     `.wt-dests { min-width: min-content }` sized the row to the widest card's
     intrinsic content — 217px x 6 = 1340px inside a 1240px rail — so the sixth
     destination lived past the panel edge behind a scroll no player would find,
     while the names that did fit were ellipsised anyway. Two properties, both
     measured off the LIVE layout rather than the sheet: a name is never trimmed
     (the catalogue holds "Elderscale, the Great Wyrm", which no card width
     fitting six across can hold on one line, so it must WRAP), and the row fits
     the rail it is drawn in. The landscape chip rail scrolls sideways on
     purpose and is held out by the viewport guard, not by an exception. */
  /* ── regression suite — b554: "Board Board" ────────────────────────────────
     The no-contract Bounty card read "Take one at the Bounty Board" and then a
     button reading "Board ▸" — visual-qa's duplicate-word finding on the combat
     panel at both viewports. Asserted on the RENDERED card text, in the state
     that produced it (no active contract), for every destination, so the next
     card whose prose and verb collide is caught too. */
  () => tryRun('b554: no War Table destination card doubles a word ("Board Board")', () => {
    const CS = window.HearthriseCombatScreens;
    if (!CS || typeof CS.setView !== 'function') { skip('combat screens module absent'); return; }
    const snap = snapshotG();
    try {
      const g = window.G;
      if (g.bountyHunter) g.bountyHunter.active = null;
      CS.setView('table'); CS.render();
      const dests = document.getElementById('wt-dests');
      const cards = dests ? [...dests.querySelectorAll('.wt-dest')] : [];
      assert(cards.some((c) => /Bounty/.test((c.querySelector('.wtd-kick') || {}).textContent || '')),
        'the no-contract Bounty destination did not render — the state that read "Board Board" is not under test');
      cards.forEach((c) => {
        const text = (c.textContent || '').replace(/\s+/g, ' ').trim();
        const dup = text.match(/\b(\w{3,})\s+\1\b/i);
        assert(!dup, 'THE b554 BUG: the ' + ((c.querySelector('.wtd-kick') || {}).textContent || '?')
          + ' destination reads "' + (dup && dup[0]) + '" — "' + text.slice(0, 90) + '"');
      });
    } finally { restoreG(snap); try { CS.render(); } catch (e) {} }
  }),

  () => tryRun('b548: War Table destinations fit their rail and never trim a name', () => {
    const CS = window.HearthriseCombatScreens;
    if (!CS || typeof CS.setView !== 'function') { skip('combat screens module absent'); return; }
    const panel = document.getElementById('panel-combat');
    if (!panel) { skip('no combat panel'); return; }
    CS.setView('table'); CS.render();
    const dests = document.getElementById('wt-dests');
    const cards = dests ? [...dests.querySelectorAll('.wt-dest')] : [];
    if (!cards.length) { skip('no destination cards rendered'); return; }

    cards.forEach((c) => {
      const b = c.querySelector('.wtd-main b');
      if (!b) return;
      const cs = getComputedStyle(b);
      const who = (c.querySelector('.wtd-kick') || {}).textContent || '?';
      assert(cs.whiteSpace !== 'nowrap',
        'the ' + who + ' destination name is nowrap — a name longer than the card is trimmed instead of wrapped');
      assert(cs.textOverflow !== 'ellipsis',
        'the ' + who + ' destination name still ellipsises; the longest catalogued name would never be readable');
      assert(b.scrollWidth <= b.clientWidth + 2,
        'the ' + who + ' destination name is clipped (' + b.scrollWidth + '>' + b.clientWidth + ')');
    });

    /* The containment half only means anything where the design asks for one
       row of six: the landscape chip rail (max-height:560) scrolls on purpose. */
    const rail = panel.querySelector('.wt-dest-rail');
    if (!rail || innerWidth < 1200 || innerHeight <= 560) { skip('narrow/short viewport — rail containment not asserted here'); return; }
    assert(rail.scrollWidth <= rail.clientWidth + 2,
      'the destination row overflows its rail (' + rail.scrollWidth + '>' + rail.clientWidth + ') — a destination is off-panel');
    const pr = panel.getBoundingClientRect();
    cards.forEach((c) => {
      const r = c.getBoundingClientRect();
      assert(r.right <= pr.right + 2,
        'the ' + ((c.querySelector('.wtd-kick') || {}).textContent || '?') + ' destination is drawn past the panel edge ('
          + Math.round(r.right) + '>' + Math.round(pr.right) + ')');
    });
  }),

  /* ── regression suite — THE ALERT THAT COVERED THE NUMBERS IT CAME TO SAVE ──
     `#hr-desktopmode-banner` fires when a phone has "Desktop site" on. It was
     `position:fixed; top:0` with nothing reserving its space, so 91px of banner
     lay over Gold, Gems, Combat Level and the quest count: the one piece of
     chrome whose job is to explain a broken layout was hiding the four numbers
     a player acts on. The banner could only ever be inspected on a real phone in
     desktop mode, which is why it shipped that way for 250 builds;
     `__hrDesktopModeShowBanner` builds it here so it is MEASURED instead. */
  () => tryRun('b550: the desktop-mode banner reserves its space and covers no number', () => {
    const app = document.querySelector('.app');
    if (!app) { skip('no app shell'); return; }
    withDesktopBanner((bar) => {
      const r = bar.getBoundingClientRect();

      // 1. NO EMOJI AS ART. The mark is uiWarn from the baked atlas.
      const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
      const txt = bar.textContent || '';
      assert(!EMOJI.test(txt), 'the banner still renders an emoji as art: ' + JSON.stringify((txt.match(EMOJI) || [])[0]));
      assert(!!bar.querySelector('svg path'), 'the alert mark must be an atlas glyph, not a character');

      // 2. IT WEARS THE THEME. The old slab was a hardcoded #7a1f1f in system-ui.
      const cs = getComputedStyle(bar);
      assert(!/122,\s*31,\s*31/.test(cs.backgroundColor + cs.backgroundImage),
        'the banner is still painted with the hardcoded oxblood slab');
      assert(/Alegreya/i.test(cs.fontFamily), 'the banner is not set in the game\'s type: ' + cs.fontFamily);

      // 3. IT RESERVES ITS OWN HEIGHT — the property the bug was.
      assert(document.body.getAttribute('data-hr-desktop-mode') === '1',
        'the banner did not flag the body, so no rule can move the shell out from under it');
      assertBannerReserved(bar, 'the reservation does not match the banner');
      const ar = app.getBoundingClientRect();
      assert(ar.top >= r.bottom - 1,
        'the app shell still starts UNDER the banner (app top ' + Math.round(ar.top) + ' < banner bottom ' + Math.round(r.bottom) + ')');
      assert(ar.bottom <= innerHeight + 1,
        'the shell was pushed down without being shortened — its bottom (' + Math.round(ar.bottom) + ') is off a ' + innerHeight + 'px screen');

      // 4. NOTHING ACTIONABLE IS UNDERNEATH IT.
      const hit = [...document.querySelectorAll('.topbar *')].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.height > 2 && b.top < r.bottom - 1 && b.bottom > r.top && b.left < r.right && b.right > r.left;
      });
      assert(!hit.length, 'the banner covers ' + hit.length + ' top-bar element(s): '
        + JSON.stringify(hit.slice(0, 4).map((e) => (e.textContent || '').trim().slice(0, 18))));
    });
  }),

  /* The same banner's CONTROLS. The player's way out of desktop mode is a one-tap
     disclosure and a dismissal that is remembered, both on a thumb target — the
     old pair was a 32px ✕ drawn as a character and no instructions beyond one
     Chrome-only line. */
  () => tryRun('b550: the desktop-mode banner explains the fix and dismisses for the session', () => {
    withDesktopBanner((bar) => {
      const [dis, how, steps] = ['#hr-dm-dismiss', '#hr-dm-howbtn', '#hr-dm-how'].map((s) => bar.querySelector(s));
      assert(dis && how && steps, 'the banner must carry a dismiss AND a "how do I turn it off" control');
      [dis, how].forEach((b) => assert(b.getBoundingClientRect().height >= 40,
        'the ' + b.id + ' control is ' + Math.round(b.getBoundingClientRect().height) + 'px — under the 40px thumb target'));
      assert(how.getAttribute('aria-expanded') === 'false' && steps.hasAttribute('hidden'),
        'the steps must start collapsed and say so');
      how.click();
      assert(how.getAttribute('aria-expanded') === 'true' && !steps.hasAttribute('hidden'),
        'one tap on "how" must reveal the steps');
      assert(/Chrome/i.test(steps.textContent) && /Safari/i.test(steps.textContent),
        'the steps must cover both phone browsers, not just Chrome: ' + steps.textContent.slice(0, 80));
      assertBannerReserved(bar, 'the reservation did not follow the opened disclosure');

      dis.click();
      assert(!document.getElementById('hr-desktopmode-banner'), 'Dismiss must remove the banner');
      assert(!document.body.hasAttribute('data-hr-desktop-mode'),
        'dismissing must release the reserved space, or the shell keeps a gap for a banner that is gone');
      assert(sessionStorage.getItem('hr_desktopModeBannerDismissed') === '1',
        'the dismissal must be remembered for the session');
      assert(window.__hrDesktopModeShowBanner() === null, 'a dismissed banner must not rebuild this session');
    });
  }),

  /* ── regression suite — THE ALERT THAT CLIPPED THE BOTTOM OFF EVERY SCREEN ──
     The banner's reservation shortened `.app` by its measured height and
     released the sidebar, and stopped there. `.main` kept `height:100vh`,
     and because `.app` is a grid whose single row is `auto`, a 100vh item
     stretches that row back to the FULL viewport: the shell was 88..423 on a
     922x423 landscape phone while the main column ran 88..511, and
     `.app{overflow:hidden}` sliced off the bottom 88px of every screen — FIGHT,
     EAT, STOP, the last Buy, the last Accept. The cohort the banner exists for
     could read the advice and then not play.
     The reservation test above measured the SHELL, which was correct, so it
     stayed green through all of it; this one measures what the shell CONTAINS,
     on a real screen reached the way a player reaches it. */
  () => tryRun('b553: the desktop-mode banner must not clip the bottom of every screen', () => {
    const app = document.querySelector('.app');
    const main = document.querySelector('.main');
    if (!app || !main) { skip('no app shell'); return; }
    const box = (e) => e.getBoundingClientRect();
    const tag = (e) => (e.tagName + (e.id ? '#' + e.id : '.' + String(e.className || '').split(' ')[0])).slice(0, 34);
    const scrolls = (e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY)
      && e.scrollHeight > e.clientHeight + 1;
    /* Everything inside the shell that pokes past the bottom of the screen AND
       has nothing between it and the shell that a player can scroll. Below the
       fold of a SCROLLER is a list doing what lists do (the rail has been
       `overflow-y:auto` for 300-odd builds); below the fold of an
       `overflow:hidden` box is simply gone. Taken as a DELTA around the banner on top of that, so a
       surface that was already spilling for its own reasons is not this test's
       finding — what must be zero is what the BANNER puts there. */
    const below = () => [...document.querySelectorAll('.app, .app *')].filter((e) => {
      const b = box(e);
      if (b.height <= 2 || b.bottom <= innerHeight + 1) return false;
      for (let p = e.parentElement; p; p = p.parentElement) {
        if (scrolls(p)) return false;
        if (p === app || p === document.body) break;
      }
      return true;
    });

    const fixture = combatScreen();
    try {
      window.showTab('combat');
      try { window.stopCombat(); } catch (e) {}
      fixture.G.activeMonster = null;
      assert(fixture.CS.preview('rat'), 'preview() refused a live monster id');
      const fight = document.querySelector('#panel-combat .fs-fight');
      assert(fight && box(fight).height > 0, 'the Fight screen has no FIGHT button to measure');
      const spillBefore = new Set(below());
      /* The banner is raised LAST, on a screen already standing: the whole
         subject is what it does to a surface that was fine without it. */
      withDesktopBanner((bar) => {
        void app.offsetHeight;                       // the reservation is a reflow
        const ar = box(app), mr = box(main);

        // 1. THE MAIN COLUMN FOLLOWS THE SHORTENED SHELL — the property the bug was.
        assert(ar.bottom <= innerHeight + 1,
          'the shell itself is off the ' + innerHeight + 'px screen (bottom ' + Math.round(ar.bottom) + ')');
        assert(mr.bottom <= ar.bottom + 1,
          'the main column still measures the FULL viewport: its bottom (' + Math.round(mr.bottom)
            + ') is ' + Math.round(mr.bottom - ar.bottom) + 'px past the shortened shell (' + Math.round(ar.bottom)
            + '), and .app{overflow:hidden} clips that band off the bottom of every screen');

        // 2. …AND SO DOES EVERY OTHER THING IN IT. The banner adds no new spill.
        const added = below().filter((e) => !spillBefore.has(e));
        assert(!added.length, 'the banner pushed ' + added.length + ' element(s) below the ' + innerHeight
          + 'px screen: ' + JSON.stringify(added.slice(0, 4).map(tag)));

        // 3. AND THE PRIMARY CTA IS STILL PRESSABLE: on screen, or scrollable to.
        const fits = () => { const b = box(fight); return b.top >= -1 && b.bottom <= innerHeight + 1; };
        if (!fits()) fight.scrollIntoView({ block: 'center' });
        const fb = box(fight);
        assert(fits(), 'FIGHT is off a ' + innerHeight + 'px screen (' + Math.round(fb.top) + '..'
          + Math.round(fb.bottom) + ') with nothing a player can scroll to bring it back');
        /* …and the banner itself is not the thing on top of it. Deliberately not
           "elementFromPoint returns FIGHT": this suite runs with the FTUE scrim up
           and that is a different (and already-guarded) condition — what this test
           owns is whether the ALERT covers the control. */
        const hit = document.elementFromPoint(fb.left + fb.width / 2, fb.top + fb.height / 2);
        assert(!hit || (hit !== bar && !bar.contains(hit)),
          'FIGHT is on screen but the banner is drawn over it — the press lands on ' + tag(hit));
      });
    } finally {
      try { fixture.restore(); } catch (e) {}
    }
  }),

  /* ── regression suite — THE SIDEWAYS RAIL WITH NO WAY TO KNOW IT SCROLLS ────
     The landscape destination rail is a sideways scroller on measured evidence
     (two rows of chips cost 229px of a 393px screen), and it left six
     destinations behind a swipe with no cue that a swipe exists. The eight P1
     `clipped-by-parent` findings on it were a discoverability defect, not a
     clipping one — and clipped text with no cue reads as broken text.

     Two halves, and each half fails alone: the STATE MACHINE (which end of the
     scroll we are at, measured on the live rail by forcing it narrow, so the
     assertion holds at any viewport) and the SHEET (a directional mask for each
     of the three states, under the landscape query where the rail exists). A
     permanently-faded right edge on a rail already at its end would be a lie,
     so "end" must not carry the right fade. */
  () => tryRun('b550: the landscape destination rail shows which way it scrolls', () => {
    const CS = window.HearthriseCombatScreens;
    if (!CS || typeof CS.setView !== 'function') { skip('combat screens module absent'); return; }
    const prevTab = window.activeTab;
    try { window.showTab('combat'); } catch (e) {}   // a hidden panel measures 0 and proves nothing
    CS.setView('table'); CS.render();
    const rail = document.getElementById('wt-dest-rail');
    if (!rail || !rail.getBoundingClientRect().width) { try { window.showTab(prevTab || 'profile'); } catch (e) {} skip('the combat panel did not paint'); return; }
    assert(['auto', 'scroll'].includes(getComputedStyle(rail).overflowX),
      'the rail is no longer a scroller — this test is measuring the wrong element');

    /* Forcing the overflow takes BOTH halves of the landscape shape: a narrow
       rail and a row that refuses to wrap. Without the second the desktop base
       rule simply wraps the cards into more rows and there is no scroll to
       measure — which is exactly what this test read on its first run. */
    const dests = document.getElementById('wt-dests');
    const priorMax = rail.style.maxWidth;
    const priorWrap = dests ? dests.style.cssText : '';
    try {
      rail.style.maxWidth = '240px';                 // force the overflow at any viewport
      if (dests) { dests.style.flexWrap = 'nowrap'; dests.style.minWidth = 'min-content'; }
      dispatchEvent(new Event('resize'));
      const slack = rail.scrollWidth - rail.clientWidth;
      assert(slack > 2, 'the forced-narrow rail does not overflow, so the states cannot be driven');
      assert(rail.dataset.scroll === 'start', 'a rail parked at scrollLeft 0 must read "start", got ' + rail.dataset.scroll);
      assert(rail.getAttribute('tabindex') === '0', 'a scrolling rail must be a keyboard focus stop');
      rail.scrollLeft = Math.round(slack / 2); rail.dispatchEvent(new Event('scroll'));
      assert(rail.dataset.scroll === 'mid', 'a half-scrolled rail must read "mid", got ' + rail.dataset.scroll);
      rail.scrollLeft = rail.scrollWidth; rail.dispatchEvent(new Event('scroll'));
      assert(rail.dataset.scroll === 'end', 'a rail at its far end must read "end", got ' + rail.dataset.scroll);
      rail.scrollLeft = 0; rail.dispatchEvent(new Event('scroll'));
    } finally {
      rail.style.maxWidth = priorMax;
      if (dests) dests.style.cssText = priorWrap;
      dispatchEvent(new Event('resize'));
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
    assert(rail.dataset.scroll === 'none' || rail.scrollWidth > rail.clientWidth + 2,
      'a rail with nothing to scroll must read "none", got ' + rail.dataset.scroll);

    /* The sheet half. The mask lives under the landscape query, so on a desktop
       viewport it is read from the stylesheet rather than the computed style —
       reverting combat-screens.css still reds this. */
    let landscape = '';
    [...document.styleSheets].forEach((sh) => {
      let rules = null; try { rules = sh.cssRules; } catch (e) { return; }
      [...(rules || [])].forEach((r) => {
        const q = r.media ? (r.conditionText || r.media.mediaText || '') : '';
        if (/max-height/.test(q) && /560/.test(q)) landscape += [...(r.cssRules || [])].map((k) => k.cssText).join('\n') + '\n';
      });
    });
    assert(landscape.length > 0, 'no max-height:560 block found in any sheet — the landscape rules are gone');
    ['start', 'mid', 'end'].forEach((state) => assert(
      new RegExp('\\[data-scroll="' + state + '"\\][^{]*\\{[^}]*mask-image').test(landscape),
      'the landscape sheet has no edge fade for the "' + state + '" state'));
    const endRule = (landscape.match(/\[data-scroll="end"\][^{]*\{[^}]*\}/) || [''])[0];
    assert(/transparent 0/.test(endRule) && !/transparent 100%/.test(endRule),
      'the "end" state fades its RIGHT edge — a rail already at its end is telling the player there is more: ' + endRule.slice(0, 160));
    assert(/scroll-snap-type/.test(landscape), 'the rail lost its scroll-snap, so a swipe lands mid-name again');
  }),

  /* The War Table has TWO sideways scrollers — destinations and the class filter
     — and a cue fitted to only the one a report happened to name leaves the same
     defect standing one row below it. Every scroller on the screen is required
     to publish its scroll state, so a third rail cannot ship mute. */
  () => tryRun('b550: every sideways rail on the War Table publishes its scroll state', () => {
    const CS = window.HearthriseCombatScreens;
    if (!CS || typeof CS.setView !== 'function') { skip('combat screens module absent'); return; }
    const prevTab = window.activeTab;
    try {
      try { window.showTab('combat'); } catch (e) {}
      CS.setView('table'); CS.render();
      const view = document.querySelector('#panel-combat .wt-view');
      if (!view || !view.getBoundingClientRect().width) { skip('the combat panel did not paint'); return; }
      /* Both of the design's rails must carry a state at every viewport — the
         class rail is only a scroller under the landscape query, so a count is
         not the assertion. */
      const STATES = ['start', 'mid', 'end', 'none'];
      ['wt-dest-rail', 'wt-classes'].forEach((id) => assert(
        STATES.includes(((document.getElementById(id) || {}).dataset || {}).scroll || ''),
        'the #' + id + ' rail publishes no scroll state, so no edge fade can be drawn for it'));
      /* And nothing else on the screen may overflow sideways in silence. A
         vertical scroller computes overflow-x:auto too, so the filter is what
         ACTUALLY overflows, not what is merely declared. */
      const mute = [...view.querySelectorAll('*')].filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)
        && el.scrollWidth > el.clientWidth + 2 && !el.dataset.scroll);
      assert(!mute.length, 'sideways scroller(s) with no cue that they scroll: '
        + JSON.stringify(mute.map((el) => el.id || String(el.className).split(' ')[0])));
    } finally { try { window.showTab(prevTab || 'profile'); } catch (e) {} }
  }),

  () => tryRun('b253: toasts side-step a corner button on a short landscape screen (paione: toasts over content)', () => {
    const T = window.HearthriseToasts;
    assert(T && typeof T.computeOffsets === 'function', 'toast placement math must be exposed');
    // paione's case: 812x375 landscape, the bug button sits bottom-right (~62px up).
    const bugBtn = { left: 755, right: 800, top: 273 };
    const land = T.computeOffsets(812, 375, [bugBtn]);
    assert(land.bottom <= 20, 'on a short screen the column must stay pinned at the bottom, got bottom=' + land.bottom);
    assert(land.right > 20, 'it must step LEFT of the corner button instead of lifting, got right=' + land.right);
    // Desktop is unchanged: a small lift keeps the column in its corner.
    const desk = T.computeOffsets(1280, 900, [{ left: 1210, right: 1268, top: 800 }]);
    assert(desk.right <= 20, 'desktop must keep the column in the right corner, got right=' + desk.right);
    assert(desk.bottom > 20, 'desktop clears the button with a small lift, got bottom=' + desk.bottom);
    // No obstacles → resting bottom-right.
    const rest = T.computeOffsets(812, 375, []);
    assert(rest.bottom <= 20 && rest.right <= 20, 'with nothing in the way it rests in the corner');
  }),

  () => tryRun('b252: topbar activity bar routes to the CURRENT activity when busy (Tyler)', () => {
    assert(typeof window.__activityBarTarget === 'function', 'the activity-bar target resolver must exist');
    const snap = snapshotG();
    try {
      const G = window.G;
      const clear = () => { G.activeMonster=null; G.activeSkill=null; G.activeArtisanRecipe=null; G.activeArtisanSkill=null; G.activeAction=null; };
      clear(); assert(window.__activityBarTarget() === null, 'idle → no target');
      clear(); G.activeMonster = Object.keys(window.MONSTERS)[0];
      assert(window.__activityBarTarget().tab === 'combat', 'fighting → combat tab');
      clear(); G.activeSkill = 'woodcutting';
      assert(window.__activityBarTarget().id === 'woodcutting', 'gathering → that skill');
      clear(); G.activeArtisanRecipe = 'forge_iron_sword'; G.activeArtisanSkill = 'smithing';
      assert(window.__activityBarTarget().id === 'smithing', 'artisan → that artisan skill');
      clear(); G.activeAction = { kind:'cook', targetId:'shrimp' };
      assert(window.__activityBarTarget().id === 'cooking', 'action-loop cook → cooking');
    } finally { restoreG(snap); }
  }),

  () => tryRun('b251: proof bounty does not auto-complete from a pre-existing stack (paione: marks with no kills)', () => {
    if(typeof window.acceptBounty !== 'function' || typeof window.handleBountyKill !== 'function'){ skip('bounty system absent'); return; }
    const snap = snapshotG();
    try {
      const G = window.G;
      if(typeof window.ensureBountyState === 'function') window.ensureBountyState();
      // Pick a monster + a drop it yields; give the player a big pre-existing stack.
      const monId = Object.keys(window.MONSTERS)[0];
      const proof = (window.MONSTERS[monId].drops||[])[0] && window.MONSTERS[monId].drops[0].id;
      if(!proof){ skip('no proof drop to test'); return; }
      G.inventory[proof] = 999;                         // huge stack from earlier play
      // Craft a proof bounty on the board and accept it.
      const b = { id:'test_proof', type:'proof', target:monId, tier:1, progress:0,
                  proofItem:proof, required:3, rewards:{gold:0,marks:5,xp:0} };
      G.bountyHunter.active = null;
      G.bountyHunter.board = [b];
      const marksBefore = G.marks||0;
      window.acceptBounty(0);
      const a = G.bountyHunter.active;
      assert(a && a.type==='proof', 'proof bounty must be accepted');
      assert(a.proofBaseline === 999, 'accept must snapshot the current stack as baseline, got ' + a.proofBaseline);
      // A kill fires the hook — but with no NEW proof items, it must NOT complete.
      window.handleBountyKill(monId, window.MONSTERS[monId]);
      assert(G.bountyHunter.active, 'bounty must still be active after a kill that yielded no new proof items');
      assert((G.marks||0) === marksBefore, 'no marks may be paid before real progress, got +' + ((G.marks||0)-marksBefore));
      assert(window.bountyProofHave(a) === 0, 'progress must read 0 right after accept, got ' + window.bountyProofHave(a));
      // Collect the required NEW items → it completes.
      G.inventory[proof] = 999 + 3;
      /* completeBounty() rolls a 10% BONUS-marks turn-in — real game behaviour,
         but it makes this exact-marks assertion a coin flip, so the roll is
         pinned rather than tolerated.
         b344: it is pinned through the RNG SEAM now, not by assigning
         Math.random. That roll used to read the global; when it moved to the
         seeded stream (because completeBounty runs inside the away replay and
         a night has to be replayable) this stub silently stopped suppressing
         anything and this test went ~10% flaky — the b330 lesson, in the one
         test that had already been bitten by this exact roll. A stub that no
         longer stubs the thing it names is worse than no stub. */
      const _C = window.HearthriseCore;
      _C.setRng(_C.rngMod.rngFrom(() => 0.99));   // 0.99 > 0.10 → no bonus, deterministically
      try { window.handleBountyKill(monId, window.MONSTERS[monId]); } finally { _C.setRng(null); }
      assert(!G.bountyHunter.active, 'bounty must complete once the required NEW proof items are collected');
      /* ── b456: WHO PAYS THE MARKS DEPENDS ON THE ARM, AND BOTH ARE ASSERTED ──
         Marks are server-of-record. `completeBounty` gates its marks credit on
         clientMayWriteRecordField('marks'), so under the arm the client must NOT
         credit them — a raw debit/credit on a server-owned balance is reconciled
         away by the next envelope and is a self-mint in the meantime. (A CULL
         bounty is credited server-side by hr_claim_bounty; proof/weapon/streak
         have no server turn-in verb yet — see the report.) */
      const marksArmed = typeof window.clientMayWriteRecordField === 'function'
        && window.clientMayWriteRecordField('marks') === false;
      if (marksArmed) {
        assert((G.marks || 0) === marksBefore,
          'ARMED: the client credited ' + ((G.marks || 0) - marksBefore) + ' Marks for a bounty turn-in — marks '
          + 'are server-of-record and this number would be reconciled away while the bounty stayed spent');
      } else {
        assert((G.marks||0) === marksBefore + 5, 'marks must pay out on real completion');
      }
    } finally { restoreG(snap); }
  }),

  /* b456 — THE DORMANT TWIN OF THE ABOVE: the turn-in ARITHMETIC. Still shipped
     code (the kill-switch position), and the numbers the server verb has to
     match. Driven through the marks seam and restored. */
  () => tryRun('b251b: a proof turn-in pays exactly its marks reward (client-owned position)', () => {
    if (typeof window.acceptBounty !== 'function' || typeof window.handleBountyKill !== 'function') return;
    const R = window.HearthriseRecord;
    if (!R || typeof R.__setMarksRecordArm !== 'function') return;
    const snap = snapshotG();
    try {
      R.__setMarksRecordArm(false);
      const G = window.G;
      if (typeof window.ensureBountyState === 'function') window.ensureBountyState();
      const monId = Object.keys(window.MONSTERS)[0];
      const proof = (window.MONSTERS[monId].drops || [])[0] && window.MONSTERS[monId].drops[0].id;
      if (!proof) return;
      G.inventory[proof] = 999;
      G.bountyHunter.active = null;
      G.bountyHunter.board = [{ id: 'test_proof_b', type: 'proof', target: monId, tier: 1, progress: 0,
        proofItem: proof, required: 3, rewards: { gold: 0, marks: 5, xp: 0 } }];
      const marksBefore = G.marks || 0;
      window.acceptBounty(0);
      G.inventory[proof] = 999 + 3;
      const _C = window.HearthriseCore;
      _C.setRng(_C.rngMod.rngFrom(() => 0.99));   // no bonus roll
      try { window.handleBountyKill(monId, window.MONSTERS[monId]); } finally { _C.setRng(null); }
      assert(!G.bountyHunter.active, 'the bounty must complete once the required NEW proof items are collected');
      assert((G.marks || 0) === marksBefore + 5,
        'the turn-in must pay exactly its marks reward, got +' + ((G.marks || 0) - marksBefore));
      assert((G.inventory[proof] || 0) === 999,
        'the turn-in must consume exactly the required proof items, left ' + G.inventory[proof]);
    } finally {
      R.__setMarksRecordArm(null);
      restoreG(snap);
    }
  }),
];
