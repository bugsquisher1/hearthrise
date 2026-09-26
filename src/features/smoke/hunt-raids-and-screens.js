// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/hunt-raids-and-screens.js — the Hunt and raids, the render/click census, charms, the Depot and the artisan ladders.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 131 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { errorLog, pass, fail, tryRun, tryRunAsync, assert, skip, stubSignedIn, drain, callOk, clickOk, withCookingArmed, stampBalanceLikeLoad, stampRecordLikeLoad, withLocalBlob, withFarmServer, withServerBacked, withRoomServer, withClaimServer, withCompanionRoster, armEquipFlipForTest, goldOf, snapshotG, seedPlayStreak, restoreG, restoreGAndRecord, hrCharmFixture, hrCharmDriver, on, snapshot, findUiOverlaps, CHARM_RANKS, closeOverlays } from './_harness.js?v=553';

export default [

  // ══ b223 · THE HUNT (backlog #16) ═══════════════════════════
  // docs/design/clan-boss-events.md §8 lists twelve required tests. Nine of
  // them are statements about SERVER behaviour (the day gate, the anti-hop
  // rule, the Standing-once guard) and a browser cannot prove a server rule —
  // supabase/migrations/2026-08-08-hunt.sql carries its own DO-block self
  // checks for those. What these guard is the half that lives here: the maths
  // the card previews with, the ladder the client and the server must agree
  // on, the reducers that decide whether a response is a chest, and the six
  // signature materials that would otherwise ship as vendor trash.

  () => tryRun('b223: the Hunt ladder — pools scale to the roster, exactly as specced', () => {
    const R = window.HearthriseRaids;
    assert(R && Array.isArray(R.HUNT_TIERS) && R.HUNT_TIERS.length === 5, 'five Hunt tiers');
    // §3.3's own table. If these drift the server's hr_hunt_tiers must drift
    // with them, or a clan is shown a pool it is not fighting.
    const table = [
      [1, 'Warband Hunt',  5000,  3000,  35000], [2, 'Keep Hunt',     15000, 7500,  90000],
      [3, 'Fortress Hunt', 30000, 12500, 155000], [4, 'Citadel Hunt',  50000, 16000, 210000],
      [5, 'Crown Hunt',    80000, 21000, 290000],
    ];
    table.forEach(([t, name, base, per, at10]) => {
      const d = R.tierDef(t);
      assert(d.name === name, 'tier ' + t + ' should be ' + name + ', got ' + d.name);
      assert(d.base === base && d.perMember === per, 'tier ' + t + ' ladder numbers drifted');
      assert(R.poolFor(t, 10) === at10, 'tier ' + t + ' @ n=10 should be ' + at10 + ', got ' + R.poolFor(t, 10));
    });
    // §8.4 — the spec's own worked assertion.
    assert(R.poolFor(2, 5) === 52500, 'Tier II @ n=5 must be 52,500, got ' + R.poolFor(2, 5));
    assert(R.poolFor(2, 25) === 202500, 'Tier II @ n=25 must be 202,500, got ' + R.poolFor(2, 25));
    // §3.3's headroom check, and the whole reason the flat pool was replaced.
    assert(R.poolFor(5, 40) === 920000, 'Tier V @ n=40 must be 920,000');
    // The point of the whole ladder: the flat 250,000 the game shipped with is
    // HARDER than the top Phase-A tier at a ten-member roster — it was tuned
    // for a large endgame clan and served to everyone, which is why it has
    // never been downed (§2.3). Every tier a real clan can declare is now
    // easier than what they were being handed.
    assert(R.CLAN_POOL_HP > R.poolFor(4, 10),
      'the legacy flat pool must be harder than Tier IV at n=10 — that was the bug');
    assert(R.poolFor(1, 10) < R.CLAN_POOL_HP / 5,
      'a small clan must now face a pool it can actually finish');
    // §5.5 — the clamp is self-scaling, so a new tier never needs a new number.
    assert(R.strikeClamp(35000) === 5000, 'the clamp floor is 5,000');
    assert(R.strikeClamp(920000) === 92000, 'the clamp is a tenth of the pool');
    assert(R.strikeClamp(0) > 0, 'an unknown pool must still clamp');
  }),

  () => tryRun('b223: the Hunt tier ceiling is the castle, never clan level', () => {
    const R = window.HearthriseRaids;
    const S = window.HearthriseClanSeat;
    // max_hunt_tier = min(castle_tier, 1 + floor(war_room/3)) — §3.3.
    assert(R.maxHuntTier(1, 12) === 1, 'the Great Hall caps the Hunt regardless of the War Room');
    assert(R.maxHuntTier(5, 0) === 1, 'no War Room means Tier I, however grand the hall');
    assert(R.maxHuntTier(3, 6) === 3, 'War Room 6 + castle 3 → Tier III');
    assert(R.maxHuntTier(4, 6) === 3, 'War Room 6 caps at Tier III even at castle 4');
    assert(R.maxHuntTier(5, 12) === 5, 'castle 5 + War Room 12 → Tier V');
    assert(R.maxHuntTier(0, 0) === 1, 'a founding hold still fields Tier I — never a locked door');
    // ONE implementation, shared with the castle. Two copies of a gate is how
    // the card and the castle panel end up disagreeing about what is legal.
    assert(S && typeof S.maxHuntTier === 'function' && S.maxHuntTier(4, 9) === R.maxHuntTier(4, 9),
      'the Hunt ceiling must come from HearthriseClanSeat, not a second copy');
    // The castle is READ, never owned — an absent clan reads as the floor.
    const st = R.castleState();
    assert(st && st.castleTier >= 1 && st.warRoom >= 0, 'castle state reads defensively');
    assert(R.tierCeiling() >= 1 && R.tierCeiling() <= 5, 'the ceiling is always a legal tier');
  }),

  /* REPLACES the b223 median test. That test was the CONTRACT for the median
     ladder, so retuning the ladder without rewriting it would have been
     disabling a failing test to unblock a push. The rule it guarded is gone —
     see 2026-08-12-raid-band-fairness.sql for why, and
     tests/raid-band-denial.mjs for the executed proof that the old rule let
     one member's honest good week pay a teammate nothing. */
  () => tryRun('b331: bands are measured against the boss, and there is no unpaid band', () => {
    const R = window.HearthriseRaids;
    // Tier I declared by a clan of ten: pool 5,000 + 3,000×10 = 35,000,
    // so one head of it is 3,500. Mirrors the server's hr_hunt_share.
    const share = R.shareFor(R.poolFor(1, 10), 10);
    assert(share === 3500, 'a Tier I pool for ten members is 3,500 a head, got ' + share);
    assert(R.shareFor(35000, 0) === 35000, 'a zero roster must not divide by zero');
    assert(R.shareFor(0, 10) === 1, 'a zero pool floors at 1, never 0');

    // The ladder.
    assert(R.bandFor(5250, share, 4).key === 'champion', '1.5× your share is a Champion');
    assert(R.bandFor(5249, share, 4).key === 'full', 'just under 1.5× is a Full share');
    assert(R.bandFor(3500, share, 4).key === 'full', 'exactly your share is a Full share');
    assert(R.bandFor(1750, share, 4).key === 'full', 'half your share is a Full share');
    assert(R.bandFor(1749, share, 4).key === 'partisan', 'just under half is a Partisan share');

    /* THE REGRESSION THIS EXISTS FOR. Under the median rule a contributor at
       13% of the bar was refused outright — and the bar was other players'
       damage, so a clanmate having a good week moved it. There is no longer
       any damage above zero that earns nothing. */
    assert(R.bandFor(100, share, 4).key === 'partisan', '100 of a 3,500 share is still a share');
    assert(R.bandFor(1, share, 7).key === 'partisan', 'one point of damage over seven days still pays');
    assert(R.BANDS.every((b) => b.scale > 0), 'no band may pay zero');

    // The anti-freeload gates are ABSOLUTE, and they are the only refusals.
    assert(R.bandFor(0, share, 7) === null, 'no damage is no chest, however many strikes');
    assert(R.bandFor(99999, share, 1) === null, 'one strike is not turning up, however big the number');
    assert(R.bandFor(99999, share, 2).key === 'champion', 'two strikes qualify');
    assert(R.MIN_STRIKES_FOR_CHEST === 2, 'the strike minimum is 2');

    /* THE PROPERTY, stated as a property: the band is a function of YOUR
       damage and THE BOSS. bandFor has no argument through which another
       player's number could arrive — sweep every legal teammate week and the
       victim's verdict cannot move, because there is nowhere to put it. */
    assert(R.bandFor.length === 4, 'bandFor takes (damage, share, strikes, partial) — nothing else');
    const victim = R.bandFor(1200, share, 3).key;
    for (let mate = 0; mate <= 35000; mate += 2500) {
      const again = R.previewScale({ damage: 1200, strikes: 3, pool: 35000, members: 10,
                                     downed: true, clanDamage: 1200 + mate });
      assert(again.band === victim,
        'a clanmate dealing ' + mate + ' moved an unchanged player from ' + victim + ' to ' + again.band);
    }

    // A partial week is penalised once, by the factor — not twice, by the band.
    assert(R.bandFor(100, share, 4, true).key === 'full',
      'a week the boss survived does not ALSO step the band down');
    assert(R.bandFor(5250, share, 4, true).key === 'champion',
      'champion is still earnable on a week that fell short');
  }),

  () => tryRun('b223: partial credit has no all-or-nothing cliff, and is capped at 0.6', () => {
    const R = window.HearthriseRaids;
    // §8.7 — the spec's worked case.
    assert(R.partialFactor(40000, 100000) === 0.4, '40% of the pool pays 0.4×');
    assert(R.partialFactor(90000, 100000) === R.PARTIAL_CAP, '90% is capped at 0.6×');
    assert(R.PARTIAL_CAP === 0.6, 'the partial cap is 0.6');
    assert(R.partialFactor(0, 100000) === 0, 'an untouched pool pays nothing');
    assert(R.partialFactor(5000, 0) === 0, 'a zero pool cannot be divided by');
    // The kill must stay strictly better than the best possible partial —
    // otherwise a clan is rewarded for stopping short.
    const kill = R.previewScale({ damage: 1000, share: 1000, strikes: 5, downed: true });
    const near = R.previewScale({ damage: 1000, share: 1000, strikes: 5, downed: false,
                                 clanDamage: 99000, pool: 100000 });
    assert(kill.scale === 1 && near.scale === 0.6 && kill.scale > near.scale,
      'a kill must beat the best partial week');
    assert(near.partial === true && kill.partial === false, 'the preview must say which it is');
    // Two strikes and a Champion share, partially credited, still beats nothing.
    const champ = R.previewScale({ damage: 5000, share: 1000, strikes: 3, downed: false,
                                   clanDamage: 50000, pool: 100000 });
    assert(Math.abs(champ.scale - 1.3 * 0.5) < 1e-9, 'band × factor, got ' + champ.scale);
  }),

  () => tryRun('b223: the Lone Hunt calibrates to the player, and cannot be one-tapped', () => {
    const R = window.HearthriseRaids;
    // §8.8 — the spec's worked assertions.
    assert(R.soloPoolFor(1200) === 20000, 'a 1,200 first strike floors the pool at 20,000');
    assert(R.soloPoolFor(8000) === 40000, 'an 8,000 first strike sets a 40,000 pool');
    assert(R.soloPoolFor(60000) === R.SOLO_POOL_MAX, 'the pool is capped at 200,000');
    assert(R.soloPoolFor(0) === R.SOLO_POOL_MIN, 'a zero reading still yields the floor');
    // The clamp makes a one-tap arithmetically impossible at every level —
    // this is the correction to the old "solo pool one-tap chest" note: the
    // real bug was the opposite, honest players could not finish either pool.
    [1200, 3000, 8000, 40000].forEach((first) => {
      const pool = R.soloPoolFor(first);
      const clamp = Math.floor(pool * R.SOLO_CLAMP_FRAC);
      assert(clamp * 4 <= pool, 'no single solo strike may exceed a quarter of the pool');
      assert(pool / clamp >= 4, 'the Lone Hunt must take at least four strikes');
    });
    assert(R.SOLO_SCALE === 0.4, 'solo still pays 0.4× — joining a clan is the social pull');
  }),

  () => tryRun('b223: raidPower reaches the strike — the War Room finally buffs something', () => {
    const R = window.HearthriseRaids;
    const saved = window.getBonus;
    try {
      // The key has been declared-but-unread since the buff registry shipped
      // (CONFLICTS 2026-08-08). simulateStrike is its ONE consumer, so the
      // perk can never be wired half-way.
      window.getBonus = (k) => (k === 'raidPower' ? 0 : 0);
      assert(R.raidPower() === 0 && R.raidPowerMult() === 1, 'no War Room means no multiplier');
      // b228: the War Room ladder rebased to +1% at levels 4, 7 and 10.
      window.getBonus = (k) => (k === 'raidPower' ? 0.03 : 0);
      assert(Math.abs(R.raidPowerMult() - 1.03) < 1e-9, 'War Room L10 is +3%');
      // A negative contributor must never make an honest strike weaker.
      window.getBonus = () => -5;
      assert(R.raidPowerMult() === 1, 'raidPower is clamped at >= 0');
      // And it must actually reach the damage. Deterministic rolls so the
      // assertion is about the multiplier, not about variance.
      const savedRolls = window.getPlayerCombatRolls;
      const savedRandom = Math.random;
      try {
        window.getPlayerCombatRolls = () => ({ accuracy: 1, maxHit: 10 });
        Math.random = () => 0.5;                      // every tick lands 6
        window.getBonus = () => 0;
        const base = R.simulateStrike({ def: 55, weak: 'hammer' });
        window.getBonus = (k) => (k === 'raidPower' ? 0.5 : 0);
        const buffed = R.simulateStrike({ def: 55, weak: 'hammer' });
        assert(buffed === Math.floor(base * 1.5),
          'raidPower must scale the strike total: ' + base + ' → ' + buffed);
        // ...but never past the clamp, at any tier.
        const capped = R.simulateStrike({ def: 55, weak: 'hammer' }, { clamp: 100 });
        assert(capped === 100, 'the pool-scaled clamp wins over raidPower, got ' + capped);
      } finally {
        if (savedRolls) window.getPlayerCombatRolls = savedRolls;
        Math.random = savedRandom;
      }
    } finally {
      if (saved) window.getBonus = saved; else delete window.getBonus;
    }
  }),

  () => tryRun('b223: six tiered bosses, and every signature material has a recipe', () => {
    const R = window.HearthriseRaids;
    const ITEMS = window.ITEMS, RECIPES = window.ARTISAN_RECIPES;
    assert(R.BOSSES.length === 6, 'six Hunt bosses, got ' + R.BOSSES.length);
    // Every tier must have somewhere to send a declaration.
    for (let t = 1; t <= 5; t++) {
      assert(R.bossesForTier(t).length > 0, 'tier ' + t + ' has no legal boss');
      const b = R.bossOfWeek(R.weekKey(), t);
      assert(b.tiers.indexOf(t) >= 0, 'tier ' + t + ' rotated in an illegal boss: ' + b.id);
      assert(R.bossOfWeek(R.weekKey(), t).id === b.id, 'the tier rotation must be deterministic');
    }
    // THE CONFLICTS REQUIREMENT (2026-08-08, Game Designer → Systems): the six
    // signature materials must ship WITH recipes, or they become the 35th-40th
    // recipe-less vendor-trash drops — the exact problem b222's castle routing
    // had just closed. A routing promise nobody checks quietly becomes false.
    const inputs = new Set();
    Object.keys(RECIPES).forEach((skill) => {
      (RECIPES[skill] || []).forEach((r) => {
        if (r.input) inputs.add(r.input);
        Object.keys(r.inputs || {}).forEach((id) => inputs.add(id));
        Object.keys(r.secondary || {}).forEach((id) => inputs.add(id));
      });
    });
    const seat = window.HearthriseClanSeat;
    R.BOSSES.forEach((b) => {
      assert(b.sig, b.id + ' has no signature material');
      assert(ITEMS[b.sig], b.id + "'s signature material " + b.sig + ' is not in ITEMS');
      const routed = seat && seat.spoilRoute && seat.spoilRoute(b.sig);
      assert(inputs.has(b.sig) || routed,
        b.sig + ' is vendor trash — it needs a recipe or a castle route');
      assert(b.reward && b.reward.gold > 0 && b.def > 0, b.id + ' needs real stats + reward');
      assert(!/^[\uD800-\uDBFF]/.test(b.glyph || ''), b.id + ' uses an emoji as art');
    });
    // The Hunt-forged kit is the recipe side of that promise, and it must be
    // reachable: every input of every new recipe has to exist.
    ['regent_helm', 'slagheart_platebody', 'abyssal_greaves',
     'choirbone_gauntlets', 'warden_girdle', 'wyrmgilt_mantle'].forEach((id) => {
      assert(ITEMS[id] && ITEMS[id].type === 'armor', id + ' is missing from the Hunt-forged kit');
      assert(ITEMS[id].rarity === 'unique', id + ' should read as the rarest band');
    });
    /* Designer ruling, clan-boss-events.md §3.4a — the ladder must not invert.
       Three of the six shipped BELOW the Dawnsteel rung they replace (helm 92
       vs 93, legs 93 vs 96, body 95 vs 98) and the girdle tied at 91, so a
       player at Smithing 95 could forge the best platebody in the game but not
       the second-best. Each Hunt-forged piece is now pinned strictly above its
       Dawnsteel counterpart, derived from gear-tiers.js rather than hardcoded,
       so a future lvOff change can never silently re-open the inversion. */
    (function () {
      const all = RECIPES.smithing.concat(RECIPES.crafting);
      const reqOf = (rid) => { const r = all.find((x) => x.id === rid); return r ? r.req : null; };
      // Dawnsteel's own generated rungs are the comparison — read live, never
      // hardcoded, so a gear-tiers.js lvOff change moves both sides together.
      [['forge_choirbone_gauntlets', 'forge_dawn_gauntlets'],
       ['forge_warden_girdle',       'forge_dawn_belt'],
       ['forge_regent_helm',         'forge_dawn_helm'],
       ['forge_abyssal_greaves',     'forge_dawn_platelegs'],
       ['forge_slagheart_platebody', 'forge_dawn_platebody']].forEach(([mineId, dawnId]) => {
        const mine = reqOf(mineId), below = reqOf(dawnId);
        assert(mine != null, mineId + ' is missing from the recipe tables');
        assert(below != null, dawnId + ' is missing — the Dawnsteel rung it sits above');
        assert(mine > below || below >= 99,
          mineId + ' (' + mine + ') must gate ABOVE the Dawnsteel rung it replaces (' + below + ')');
        assert(mine <= 99, mineId + ' asks for a level that does not exist');
      });
      const cape = reqOf('craft_wyrmgilt_mantle');
      const topCraft = RECIPES.crafting.filter((r) => r.id !== 'craft_wyrmgilt_mantle')
                          .reduce((m, r) => Math.max(m, r.req || 0), 0);
      assert(cape >= topCraft, 'the Wyrmgilt Mantle must be the top crafting rung (' + cape + ' vs ' + topCraft + ')');
    })();
    Object.keys(RECIPES).forEach((skill) => {
      (RECIPES[skill] || []).forEach((r) => {
        Object.keys(r.inputs || {}).forEach((id) => {
          assert(ITEMS[id], 'recipe ' + r.id + ' consumes an item that does not exist: ' + id);
        });
        if (r.output) assert(ITEMS[r.output], 'recipe ' + r.id + ' outputs a missing item');
      });
    });
  }),

  () => tryRun('b223: the Hunt chest comes from the server, and the tier decides its size', () => {
    const R = window.HearthriseRaids;
    // §5.4 + §10.4 — the chest table, including the Standing column that is
    // paid FLAT PER KILL. A per-claimer Standing payment would let a 40-member
    // clan pay itself 40× for one boss, which is why the server guards it with
    // clan_raids.standing_paid and why the number lives in exactly one place.
    const expected = [[1, 7000, 12, 1200], [2, 14000, 20, 3000], [3, 28000, 30, 7000],
                      [4, 50000, 45, 15000], [5, 90000, 60, 32000]];
    expected.forEach(([t, gold, gems, standing]) => {
      const c = R.chestFor(t);
      assert(c.gold === gold && c.gems === gems, 'tier ' + t + ' chest drifted');
      assert(c.standing === standing, 'tier ' + t + ' Standing drifted');
      assert(c.sig, 'tier ' + t + ' chest must name a signature material');
    });
    // Tier II sits on today's shipped chest, deliberately, so the ladder
    // extends in both directions from a known anchor (§5.4).
    assert(R.chestFor(2).gold === 14000, 'Tier II must stay the anchor');
    // §5.4 — Tier V is guaranteed; Tier I never drops one; Tier II is Champion-only.
    assert(R.chestFor(1).sigChance === 0, 'Tier I drops no signature material');
    assert(R.chestFor(5).sigChance === 1, 'Tier V guarantees it');
    assert(R.chestFor(2).sigChampionOnly === true, 'Tier II is Champion-only');
    // No Hearth Tokens at any tier or band (Final Directive: IAP-only).
    for (let t = 1; t <= 5; t++) {
      const c = R.chestFor(t);
      assert(!c.items.hearth_token && c.sig !== 'hearth_token',
        'tier ' + t + ' mints a Hearth Token — the IAP bond is never PvE-minted');
    }
    assert(!R.soloChestFor().items.hearth_token, 'the Lone Hunt must not mint a Hearth Token');
  }),

  () => tryRun('b223: the declare contract — feature-detected, never a silent failure', () => {
    const R = window.HearthriseRaids;
    assert(typeof R._reduceDeclare === 'function', 'the declare reducer is missing');
    // The migration may not have been run yet. That is 'unsupported' — "the
    // War Room isn't built on this realm" — and it must never read as an error.
    assert(R._reduceDeclare(404, { code: 'PGRST202' }, 0).action === 'unsupported',
      'a missing clan_hunt_declare RPC must fall back, not break the card');
    assert(R._reduceDeclare(200, { code: '42883' }, 0).action === 'unsupported',
      'an undefined-function error is also "not built yet"');
    // Every refusal gets its own honest sentence and none invite a retry loop.
    ['not_officer', 'already_declared', 'tier_too_high', 'bad_tier', 'not_member'].forEach((e) => {
      const d = R._reduceDeclare(200, { ok: false, error: e }, 0);
      assert(d.action === 'fail', e + ' must refuse');
      assert(d.message && d.message !== R._declareErrorText('__unknown__'),
        e + ' needs its own message, not the generic one');
    });
    assert(R._reduceDeclare(200, { ok: false, error: 'week_mismatch', week: 'w9999' }, 0).action === 'retry',
      'a clock disagreement re-syncs once');
    assert(R._reduceDeclare(200, { ok: false, error: 'week_mismatch', week: 'w9999' }, 1).action === 'fail',
      'and exactly once — never a loop');
    assert(R._reduceDeclare(401, { code: 'PGRST301' }, 0).action === 'fail',
      'an auth error must never read as a declaration');
    assert(R._reduceDeclare(500, null, 0).action === 'fail', 'a server error must never declare');
    const ok = R._reduceDeclare(200, { ok: true, tier: 3, pool_hp: 155000, members: 10, boss_id: 'maw_below' }, 0);
    assert(ok.action === 'accept' && ok.tier === 3 && ok.pool === 155000 && ok.members === 10,
      'a real declaration must carry the tier, the pool and the snapshotted roster');

    // The strike reducer's new cases, and its OLD ones unchanged.
    const undeclared = R._reduceStrike({ ok: false, error: 'no_hunt', tier_ceiling: 3 }, 0);
    assert(undeclared.action === 'undeclared' && undeclared.ceiling === 3,
      'an undeclared week must be its own state, not a generic failure');
    const hit = R._reduceStrike({ ok: true, hp_remaining: 8000, max_hp: 90000, damage: 2900,
                                 tier: 2, members: 10, my_damage: 5800, strikes: 2 }, 0);
    assert(hit.action === 'accept' && hit.tier === 2 && hit.max === 90000 && hit.mine === 5800,
      'a Hunt strike must carry its tier and the pool it was fought against');
    // §4.1 The Faltering — derived, so an older server produces it too.
    assert(hit.faltering === true, 'below 10% the boss is faltering');
    assert(R._reduceStrike({ ok: true, hp_remaining: 50000, max_hp: 90000 }, 0).faltering === false,
      'a healthy boss is not faltering');
    // The claim reducer must carry the band, and must still refuse everything
    // it refused in b219 — the hardening is not allowed to regress.
    const paid = R._reduceClaim(200, { ok: true, scale: 1.3, band: 'champion', tier: 4,
                                       median: 1000, sig: true, standing: 15000 }, 0);
    assert(paid.action === 'accept' && paid.band === 'champion' && paid.tier === 4 && paid.sig === true,
      'the server dictates the band, the tier and the signature roll');
    ['too_few_strikes', 'below_band', 'joined_after_declare', 'grace_expired'].forEach((e) => {
      const d = R._reduceClaim(200, { ok: false, error: e }, 0);
      assert(d.action === 'fail' && d.message !== R._claimErrorText('__unknown__'),
        e + ' needs its own honest refusal');
    });
    assert(R._reduceClaim(200, { ok: false, error: 'joined_after_kill' }, 0).action === 'fail',
      'the b219 anti-chest-hop refusal must still refuse');
    assert(R._reduceClaim(200, { ok: false, error: 'already_claimed' }, 0).action === 'spent',
      'the b219 claim ledger must still be honoured');
    assert(R._reduceClaim(401, { code: 'PGRST301' }, 0).action === 'fail',
      'b219: an auth error must never award a chest');
  }),

  () => tryRun('b223: the blueprint gate and the 24h grace are derived, never stored', () => {
    const R = window.HearthriseRaids;
    const now = Date.UTC(2026, 7, 8);
    const iso = (d) => new Date(now - d * 86400000).toISOString();
    // §10.2 — castle tiers 4 and 5 require a Hunt clear at the matching tier
    // inside 28 days. This is the client's read of the rule clan_tier_up
    // enforces, so the castle panel can grey a button and say WHY.
    assert(R.huntGateMet([], 0, now) === true, 'tiers with no Hunt requirement are always open');
    assert(R.huntGateMet([], 2, now) === false, 'no clears at all cannot satisfy the gate');
    assert(R.huntGateMet([{ tier: 2, downed_at: iso(5) }], 2, now) === true, 'a recent Tier II clear opens tier 4');
    assert(R.huntGateMet([{ tier: 2, downed_at: iso(30) }], 2, now) === false, 'a 30-day-old clear has expired');
    assert(R.huntGateMet([{ tier: 1, downed_at: iso(5) }], 2, now) === false, 'a Tier I clear is not a Tier II clear');
    assert(R.huntGateMet([{ tier: 4, downed_at: iso(5) }], 2, now) === true, 'a higher clear satisfies a lower gate');
    assert(R.huntGateMet([{ tier: 2, downed_at: null }], 2, now) === false, 'an undowned Hunt is not a clear');
    // A pre-Hunt row carries no tier; it must read as Tier I, which is the
    // SAFE reading — no historical row can accidentally unlock castle tier 4.
    assert(R.huntGateMet([{ downed_at: iso(1) }], 2, now) === false,
      'a pre-Hunt clear must not satisfy a Tier II gate');
    // §5.3's grace window, derived from the week key on both sides.
    const wk = R.weekKey();
    const start = R.weekStartMs(wk);
    assert(R.prevWeekKey(wk) === 'w' + (+wk.slice(1) - 1), 'the previous week key is arithmetic');
    assert(R.graceOpen(start + 1000) === true, 'the grace window opens as the week rolls');
    assert(R.graceOpen(start + R.GRACE_MS + 1000) === false, 'and closes 24h later');
    assert(R.graceOpen(start - 1000) === false, 'it never reaches back before the boundary');
    // The claim mirror keeps exactly two weeks: the current one and the one
    // the grace window can still pay for. Never more — it lives in the save.
    const G = window.G;
    const saved = G.raids ? JSON.parse(JSON.stringify(G.raids)) : undefined;
    try {
      const st = R.ensureState();
      const cur = +R.weekKey().slice(1);
      st.claimed['w' + (cur - 5)] = true;
      st.claimed['w' + (cur - 1)] = true;
      st.claimed['w' + cur] = true;
      R.ensureState();
      assert(!st.claimed['w' + (cur - 5)], 'stale weekly claim keys must be pruned from the save');
      assert(st.claimed['w' + (cur - 1)] === true, 'the grace week must survive the prune');
      assert(st.claimed['w' + cur] === true, 'the current week must survive the prune');
    } finally {
      if (saved === undefined) delete G.raids; else G.raids = saved;
    }
  }),

  () => tryRun('b223: the Hunt card shows the tier, your share and a way to declare', () => {
    const R = window.HearthriseRaids;
    const prevTab = window.activeTab;
    const G = window.G;
    const savedRaids = G.raids ? JSON.parse(JSON.stringify(G.raids)) : undefined;
    const savedClans = window.HearthriseClans;
    try {
      window.showTab('events');
      // Offline / signed-out is the DEGRADED path, and it must be a real card
      // rather than an error: the Lone Hunt is playable with no server at all.
      const p = R.render(); if (p && p.catch) p.catch(() => {});
      const card = document.getElementById('hr-raid-card');
      assert(card && card.parentElement && card.parentElement.id === 'hr-events-raid',
        'the Hunt card must live in its own Events section');
      // b385: the weekly clan boss is a gated clan surface while CLAN_LAUNCHED is
      // false — the DOM card reads coming-soon, not the functional Lone Hunt. The
      // functional-card assertions below only hold once the flag flips (the b385
      // gate test pins the coming-soon state); the pure declare/ceiling contract
      // that follows is independent of the render and always runs.
      const _CL0 = window.HearthriseClans;
      const _launched0 = _CL0 && typeof _CL0.clanLaunched === 'function' && _CL0.clanLaunched();
      if (_launched0) {
        assert(/Lone Hunt/.test(card.innerHTML), 'signed out, the card must offer the Lone Hunt');
        assert(/Unmeasured/.test(card.innerHTML),
          'an unstruck solo pool must say so, not invent a number it has not measured');
        assert(!/NaN|undefined|\[object/.test(card.innerHTML), 'the card rendered a hole');
        assert(card.getBoundingClientRect().height > 60,
          'the Hunt card collapsed again — this is the b220 grid bug recurring');
      } else {
        assert(card.querySelector('.clan-soon'),
          'the gated weekly clan boss must render the coming-soon card, not a functional Hunt');
      }
      // The tier ceiling must be readable from castle state without importing
      // any of the castle's render code.
      window.HearthriseClans = { myClan: () => ({ castle_tier: 4, upgrades: { war_room: 6 }, myRole: 'officer' }) };
      assert(R.tierCeiling() === 3, 'the ceiling must follow the War Room, got ' + R.tierCeiling());
      assert(R.canDeclare() === true, 'an officer may declare');
      window.HearthriseClans = { myClan: () => ({ castle_tier: 4, upgrades: { war_room: 6 }, myRole: 'member' }) };
      assert(R.canDeclare() === false, 'a rank-and-file member may not declare');
    } finally {
      if (savedClans) window.HearthriseClans = savedClans; else delete window.HearthriseClans;
      if (savedRaids === undefined) delete G.raids; else G.raids = savedRaids;
      try { const q = R.render(); if (q && q.catch) q.catch(() => {}); } catch (e) {}
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  () => tryRun('b186: player avatar resolves to a shipped painted portrait', () => {
    // b221 widened this deliberately. The bug it guards is "the portrait seam
    // points at an UNSHIPPED folder and 404s" (b186 pointed it at raw-bundle),
    // and that guard is kept exactly as strict as it was. What changed is that
    // players can now upload a portrait, so a self-contained data: URL is also
    // a legitimate resolution — it is, in fact, the one value that cannot 404.
    const seam = window._playerAvatar;
    assert(seam, 'player avatar seam is empty');
    const uploaded = /^data:image\//.test(seam);
    // b360: the neutral default now lives under assets/avatars/ (the placeholder
    // silhouette), a prefab pick is a data: URL, and the old painted default is
    // still a legitimate shipped resolution. The invariant this guards is
    // UNCHANGED: never an unshipped folder, never a 404.
    assert(uploaded || /assets\/(icons-bundle\/painted|avatars)\//.test(seam),
      'player avatar path bad: ' + String(seam).slice(0, 80));
    assert(!/raw-bundle|icons3/.test(seam), 'player avatar seam points at an unshipped folder: ' + seam);
    const img = document.querySelector('.player-avatar img');
    const src = (img && img.getAttribute('src')) || '';
    assert(!/raw-bundle|icons3/.test(src), 'topbar avatar points at unshipped folder: ' + src);
  }),
  () => tryRun('b186: item rarity tiers resolve by value + named uniques', () => {
    assert(typeof window.itemRarity === 'function', 'itemRarity missing');
    // b215: steel_platebody was 'epic' here purely because the VALUE fallback
    // (v1500) landed in the epic band — while steel_sword read 'rare'. Two
    // steel pieces with different borders is the exact inconsistency the tier
    // ladder exists to remove, so tiered gear now resolves by MATERIAL, per
    // the documented mapping (bronze→common … rune→legendary, dawn→mythic).
    const cases = { bronze_sword: 'common', iron_sword: 'uncommon', steel_sword: 'rare', rune_sword: 'legendary', steel_platebody: 'rare', chief_blade: 'unique' };
    for (const id in cases) assert(window.itemRarity(id) === cases[id], id + ' rarity should be ' + cases[id] + ', got ' + window.itemRarity(id));
    // A whole material tier must read as ONE rarity across every slot.
    ['helm', 'platebody', 'platelegs', 'boots', 'gauntlets', 'belt'].forEach((slot) => {
      assert(window.itemRarity('steel_' + slot) === 'rare', 'steel_' + slot + ' should be rare like the rest of the steel set');
      assert(window.itemRarity('dawn_' + slot) === 'mythic', 'dawn_' + slot + ' should be mythic');
    });
    // The value fallback still governs gear with no explicit tier.
    assert(window.itemRarity('leather_boots') === 'common', 'untiered gear still falls back to value');
    assert(window.itemRarity('normal_log') === null, 'non-gear should have null rarity');
    assert(window.RARITY && window.RARITY.classFor('rune_sword') === 'rr-legendary', 'classFor should map to rr-legendary');
  }),
  () => tryRun('b163: old foodSlot save migrates to unified auto-eat config', () => {
    // Regression: removing the combatTick auto-eat watchdog must not strand
    // pre-setEat players whose auto-eat lived on G.foodSlot/G.autoEatPct.
    // ensureShape (via HearthriseAuto) carries it over to G.autoActions.eat.
    assert(window.HearthriseAuto && typeof window.HearthriseAuto.getEat === 'function', 'HearthriseAuto.getEat missing');
    const G = window.G;
    /* `autoEatPct` was unsnapshotted — a throw past its hand-rolled restore wrote
       a fixture threshold into the player's auto-eat config. */
    const snap = snapshotG();
    const savedAA = G.autoActions;
    try {
      delete G.autoActions;
      G.foodSlot = 'shrimp';
      /* ⚠ THE THRESHOLD HALF OF THIS MIGRATION IS GONE (2026-09-14). It read
         `G.autoEatPct`, which was a second copy of `player_state.auto_eat_pct` —
         the column the engine prices every settle with — and is deleted with the
         field. A stale one left in an old bag must now be IGNORED, not adopted:
         adopting it is how the panel ended up promising 50% while the server ate
         at 25%. The pointer half stands: foodSlot is still the local gesture. */
      G.autoEatPct = 0.4;
      const eat = window.HearthriseAuto.getEat();   // triggers ensureShape → migration
      assert(eat.enabled === true, 'migrated auto-eat should be enabled');
      assert(eat.foodId === 'shrimp', 'migrated foodId should be shrimp, got ' + eat.foodId);
      assert(Math.abs((eat.threshold || 0) - 0.5) < 1e-9,
        'a stale G.autoEatPct must NOT be adopted — the threshold is the server\'s auto_eat_pct; got '
        + eat.threshold);
    } finally {
      if (savedAA === undefined) delete G.autoActions; else G.autoActions = savedAA;
      restoreG(snap);
    }
  }),
  // gold-arm: claimMilestone credits gold via clientMayWriteRecordField (a
  // deferred GRANT, blocked on the server collection model) — switch-OFF position.
  () => tryRunAsync('b167: Collection Log tracks completion + claims milestones', async () => {
    const C = window.HearthriseCollection;
    assert(C && typeof C.getStats === 'function' && typeof C.claimMilestone === 'function', 'HearthriseCollection missing');
    const G = window.G;
    const st = C.getStats(G);
    assert(st.mon && st.item && typeof st.overall === 'number', 'getStats shape wrong');
    assert(st.mon.total > 0 && st.item.total > 0, 'totals should reflect MONSTERS/ITEMS');
    assert(st.overall >= 0 && st.overall <= 1, 'overall completion must be 0..1');
    const sBest = G.bestiary ? JSON.parse(JSON.stringify(G.bestiary)) : undefined;
    const sCL = G.collectionLog ? JSON.parse(JSON.stringify(G.collectionLog)) : undefined;
    const sGold = G.gold;
    /* LEDGER OF FIRSTS: a rung is earned by the SERVER's count only, so the 12
       monsters are seeded through the hr_bestiary_of mirror (`_` scratch,
       saved and restored by reference here). */
    const hadMirror = Object.prototype.hasOwnProperty.call(G, '_bestiaryTrophies');
    const sMirror = G._bestiaryTrophies;
    const hadClaims = Object.prototype.hasOwnProperty.call(G, '_collectionServerClaimed');
    const sClaims = G._collectionServerClaimed;
    try {
      const kbm = Object.create(null);
      Object.keys(window.MONSTERS).slice(0, 12).forEach(function (id) { kbm[id] = 1; });
      G._bestiaryTrophies = { killsByMonster: kbm, index: Object.create(null), hasTrophyKey: false, claimed: new Set() };
      delete G._collectionServerClaimed;
      G.collectionLog = { claimed: [] };
      assert(C.claimable(G).some(function (m) { return m.id === 'hunter10'; }), 'hunter10 should be claimable at 12 server-counted monsters');
      const before = goldOf();
      /* b515 — THE MILESTONE'S REWARD IS THE SERVER'S. `claimMilestone` takes
         its armed branch (the reward is gold/gems, both server-of-record), so it
         awaits the verdict and `msGrantLocally` writes only the claimed mark —
         `msMayWrite('gold')` is false. The old assertion (`G.gold` went up) was
         the one thing the shipping path must not do. */
      const rw = await withClaimServer({ ok: true }, async (rig) => {
        const r = await C.claimMilestone('hunter10', G);
        assert(rig.calls.length === 1 && rig.calls[0].verb === 'claimMilestone'
          && rig.calls[0].args[0] === 'hunter10',
          'the claim sent ' + JSON.stringify(rig.calls) + ' — one hr_claim_milestone naming hunter10');
        assert(goldOf() === before,
          'the client PAID a server-owned milestone itself (' + before + ' -> ' + goldOf()
          + ') — the next envelope takes it straight back');
        return r;
      });
      assert(rw, 'a confirmed claim must report the reward it was granted');
      assert(!C.claimable(G).some(function (m) { return m.id === 'hunter10'; }), 'a claimed milestone should not be claimable again');
      /* A REFUSED claim marks nothing. hr_claim_milestone is once-guarded, so a
         client that marked first would lose the reward permanently on any
         transient refusal. */
      G.collectionLog = { claimed: [] };
      await withClaimServer({ ok: false, error: 'rate_limited' }, async (rig) => {
        await C.claimMilestone('hunter10', G);
        assert(rig.calls.length === 1, 'the refused claim did not reach the wire');
      });
      assert(C.claimable(G).some(function (m) { return m.id === 'hunter10'; }),
        'a REFUSED milestone was marked claimed — the reward is gone and nothing was paid for it');
    } finally {
      G.gold = sGold;
      if (sBest === undefined) delete G.bestiary; else G.bestiary = sBest;
      if (sCL === undefined) delete G.collectionLog; else G.collectionLog = sCL;
      if (hadMirror) G._bestiaryTrophies = sMirror; else delete G._bestiaryTrophies;
      if (hadClaims) G._collectionServerClaimed = sClaims; else delete G._collectionServerClaimed;
    }
  }),
  () => tryRunAsync('b166: daily login reward claims once per day + escalates with streak', async () => {
    const D = window.HearthriseDaily;
    assert(D && typeof D.claim === 'function' && typeof D.isClaimable === 'function', 'HearthriseDaily missing');
    const G = window.G;
    const sDR = G.dailyReward ? JSON.parse(JSON.stringify(G.dailyReward)) : undefined;
    const sGold = G.gold, sStreak = G.streak ? JSON.parse(JSON.stringify(G.streak)) : undefined;
    try {
      /* b498: the day now comes from the server's claim rows when an envelope
         has been seen. Forget any capture so this fixture is total. */
      if (typeof D.noteServerStreak === 'function') D.noteServerStreak(null);
      seedPlayStreak(3);
      G.dailyReward = { lastClaimDay: 0 };            // force "new day, unclaimed"
      assert(D.isClaimable(G), 'should be claimable when not yet claimed today');
      assert(D.cycleDay(G) === 3, 'cycle day should track streak count (expected 3), got ' + D.cycleDay(G));
      const rw = D.rewardFor(G);
      assert(rw && rw.gold > 0, 'reward should include gold');
      /* b515 — THE PAYMENT IS THE SERVER'S, AND IT IS A GOLD VERB. `D.claim`
         sends `claim_reward {kind:'daily', key:'login'}` through hr-accrue and
         the balance arrives ABSOLUTELY on the answer — B354-1 owns that
         arithmetic in full. What this test owns is the DAY RULE either side of
         it: claimable once, not twice, and the streak drives the cycle. So the
         claim is answered with a server balance the client could not have
         computed, and the once-per-day half is asserted around it. */
      const before = goldOf();
      const SERVER_GOLD = before + rw.gold + 11;
      const claimed = await withServerBacked({ state: { gold: SERVER_GOLD } }, async (rig) => {
        const c = D.claim(G);
        await rig.drain();
        assert(rig.sent.length === 1 && rig.sent[0].verb === 'claim_reward',
          'the claim sent ' + JSON.stringify(rig.sent) + ' — one claim_reward intent');
        assert(rig.sent[0].reward && rig.sent[0].reward.kind === 'daily'
          && rig.sent[0].reward.key === 'login',
          'the claim named ' + JSON.stringify(rig.sent[0].reward) + ' instead of {daily, login}');
        assert(goldOf() === SERVER_GOLD,
          'the balance is ' + goldOf() + ' and the server said ' + SERVER_GOLD
          + ' — the local payment is a PREDICTION and the envelope must be applied absolutely');
        return c;
      });
      assert(claimed, 'the claim was not accepted at all');
      assert(!D.isClaimable(G), 'should not be claimable again the same day');
      assert(D.claim(G) === null, 'a second same-day claim must return null');
    } finally {
      G.gold = sGold;
      if (sDR === undefined) delete G.dailyReward; else G.dailyReward = sDR;
      if (sStreak === undefined) delete G.streak; else G.streak = sStreak;
      seedPlayStreak(null);
    }
  }),
  () => tryRun('B349-1: the daily login cycle is DATA, read by the client, and its multiplier is capped', () => {
    /* THE SERVER IS ABOUT TO OWN THIS PAYOUT. It can only own a number it can
       READ, and until b349 the seven-entry cycle was a literal inside
       src/features/daily-reward.js — a classic <script> that neither Deno nor
       Node can import (the b222 trap). It now lives in src/data/rewards.js and
       there is exactly ONE copy: the browser reaches it through
       window.HearthriseRewards (published by src/main.js) and the Edge Function
       vendors the same file.

       So this test asserts the WIRE, not the numbers. If the client ever goes
       back to its own arithmetic, the server and the sheet start disagreeing
       about what a day is worth and nothing else in the suite notices. */
    const R = window.HearthriseRewards;
    assert(R && Array.isArray(R.DAILY_LOGIN_CYCLE) && typeof R.priceDailyLogin === 'function',
      'window.HearthriseRewards is missing — src/main.js is the only publication point for '
      + 'src/data/rewards.js, and daily-reward.js has no fallback copy by design');
    assert(R.DAILY_LOGIN_CYCLE.length === R.DAILY_LOGIN_CYCLE_DAYS && R.DAILY_LOGIN_CYCLE.length > 1,
      'the cycle is empty or disagrees with DAILY_LOGIN_CYCLE_DAYS');

    const D = window.HearthriseDaily;
    assert(D && typeof D.rewardFor === 'function', 'HearthriseDaily missing');
    const G = window.G;
    const sStreak = G.streak ? JSON.parse(JSON.stringify(G.streak)) : undefined;
    const sGold = G.gold;
    const sDR = G.dailyReward ? JSON.parse(JSON.stringify(G.dailyReward)) : undefined;
    try {
      /* b498 — THE SHEET'S DAY IS AN INPUT HERE, SO IT IS PINNED. This test is
         about the LADDER wire (one arithmetic, not two), and it drives the day
         through `G.streak.count`. Since b498 the day comes from the server's
         claim rows when an envelope has been seen, and from the local claim
         history otherwise — so both must be neutralised or the fixture is
         whatever the real account happened to be carrying, and the loop below
         fails on a real player for a reason that has nothing to do with the
         ladder. `lastClaimDay: 0` = "no claim history", which is the state in
         which the residue is the honest answer. */
      if (typeof D.noteServerStreak === 'function') D.noteServerStreak(null);
      G.dailyReward = { lastClaimDay: 0 };
      /* ONE ARITHMETIC, not two that agree today. Checked across a whole cycle
         plus a second week, so a client that re-derived the multiplier from its
         own `weeksDone` would diverge somewhere in here. */
      for (const streak of [1, 2, 3, 5, 7, 8, 15, 43]) {
        seedPlayStreak(streak);
        const want = R.priceDailyLogin(streak);
        const got = D.rewardFor(G) || {};
        assert((got.gold || 0) === want.gold,
          'streak ' + streak + ': the sheet says ' + got.gold + ' gold, the data says ' + want.gold);
        assert((got.gems || 0) === want.gems,
          'streak ' + streak + ': the sheet says ' + got.gems + ' gems, the data says ' + want.gems);
        assert(D.cycleDay(G) === want.cycleDay,
          'streak ' + streak + ': cycleDay disagrees (' + D.cycleDay(G) + ' vs ' + want.cycleDay + ')');
      }

      /* THE CAP. `1 + weeksDone * 0.5` was UNBOUNDED and the client has been
         paying it that way: a two-year perfect streak is x53, i.e. 1,060,000
         gold from ONE day-7 claim. A server that authorises a payout may not
         propose an unbounded number. The cap is deliberately non-binding for
         anyone reachable today (a full year of perfect attendance), so this is
         a fuse rather than a balance change — the DIAL is the Designer's. */
      const far = R.priceDailyLogin(7 * 500);              // ~9.6 years
      assert(far.mult <= R.DAILY_LOGIN_MAX_WEEK_MULT,
        'a 3,500-day streak proposes a x' + far.mult + ' multiplier — the cap is not applied');
      assert(R.priceDailyLogin(8).gold > R.priceDailyLogin(1).gold,
        'CONTROL: week 2 pays the same as week 1, so the cap assertion above is vacuous');

      /* ⚠ AND IT FAILS LOUD RATHER THAN PAYING AN INVENTED NUMBER. A fallback
         cycle in daily-reward.js would be exactly the second copy this move
         deletes, and the failure it would hide is the worst kind: the sheet
         keeps paying, from numbers the server has never seen, with no error
         anywhere. console.error is captured here BECAUSE the headless gate
         treats a console error as a suite failure — the point is that it is
         produced, not that it is silent. */
      const errs = [];
      const realError = console.error;
      console.error = function () { errs.push(Array.prototype.join.call(arguments, ' ')); };
      let unpriced;
      let stillClaimable;
      try {
        delete window.HearthriseRewards;
        seedPlayStreak(3);
        G.dailyReward = { lastClaimDay: 0 };
        G.gold = 1000;
        unpriced = D.claim(G);
        stillClaimable = D.isClaimable(G);
      } finally {
        window.HearthriseRewards = R;
        console.error = realError;
      }
      assert(unpriced === null, 'a claim that cannot be PRICED must pay nothing, not guess');
      assert(G.gold === 1000, 'the unpriced claim moved gold (' + G.gold + ')');
      assert(stillClaimable,
        'the unpriced claim consumed the day — the player would lose the reward once the wiring '
        + 'is fixed, which is worse than the wiring break');
      assert(errs.some(function (m) { return m.indexOf('HearthriseRewards') >= 0; }),
        'the missing data module was SILENT. A wiring break that pays nothing and says nothing '
        + 'is a support ticket nobody can diagnose; it must be loud.');
    } finally {
      G.gold = sGold;
      if (sStreak === undefined) delete G.streak; else G.streak = sStreak;
      seedPlayStreak(null);
      if (sDR === undefined) delete G.dailyReward; else G.dailyReward = sDR;
    }
  }),
  // gold-arm: claimRank credits gold via clientMayWriteRecordField (deferred
  // GRANT, blocked on server-side Renown) — switch-OFF position.
  () => tryRunAsync('b164: Renown ladder scores, ranks up, claims, and perks apply', async () => {
    const R = window.HearthriseRenown;
    assert(R && typeof R.compute === 'function' && typeof R.getState === 'function', 'HearthriseRenown missing');
    // ladder thresholds strictly increase
    for (let i = 1; i < R.RANKS.length; i++) assert(R.RANKS[i].min > R.RANKS[i - 1].min, 'rank thresholds must increase at ' + R.RANKS[i].id);
    const G = window.G;
    const rn0 = R.compute(G);
    assert(typeof rn0 === 'number' && rn0 >= 0, 'renown should be a non-negative number');
    const st = R.getState(G);
    assert(st.rank && typeof st.rank.name === 'string', 'getState.rank missing');
    assert(st.progress >= 0 && st.progress <= 1, 'progress must be 0..1');
    // claim + perk flow — snapshot & restore everything we touch
    const sKills = (G.stats && G.stats.kills) || 0;
    const sRenown = G.renown ? JSON.parse(JSON.stringify(G.renown)) : undefined;
    const sGold = G.gold;
    try {
      G.renown = { claimed: [], seenRank: 0 };
      if (!G.stats) G.stats = {};
      G.stats.kills = 60000;                 // → very high renown, top ranks reached
      const claimables = R.getClaimable(G);
      assert(claimables.length > 0, 'high renown should expose claimable rewards');
      const before = goldOf();
      /* b515 — THE REWARD IS THE SERVER'S. `claimRank` tests each component and
         takes the armed branch when any is server-owned: it awaits the verdict
         and writes NOTHING but the once-guard mark. So the assertions are the
         three that are actually true of the shipping path — the intent went, the
         mark landed, and the client paid nothing itself. */
      const granted = await withClaimServer({ ok: true }, async (rig) => {
        const g = await R.claimRank(claimables[0].id, G);
        assert(rig.calls.length === 1 && rig.calls[0].verb === 'claimRank',
          'the claim sent ' + JSON.stringify(rig.calls) + ' — one hr_claim_rank intent');
        assert(rig.calls[0].args[0] === claimables[0].id,
          'the claim named the wrong rank: ' + rig.calls[0].args[0]);
        assert(goldOf() === before,
          'the client PAID a server-owned reward itself (' + before + ' -> ' + goldOf() + ') — the next '
          + 'envelope takes it straight back and the player watches it vanish');
        return g;
      });
      assert(granted, 'a confirmed claim must report the reward it was granted');
      assert(R.getClaimable(G).length < claimables.length, 'a claimed reward should no longer be claimable');
      /* AND A REFUSAL MARKS NOTHING — the half the old client-authoritative
         shape could not express at all, because there was no verdict to refuse.
         MUTATION: mark the rank claimed before awaiting the verdict → red. */
      const stillOpen = R.getClaimable(G);
      if (stillOpen.length) {
        await withClaimServer({ ok: false, error: 'rate_limited' }, async (rig) => {
          await R.claimRank(stillOpen[0].id, G);
          assert(rig.calls.length === 1, 'the refused claim did not reach the wire');
        });
        assert(R.getClaimable(G).some((c) => c.id === stillOpen[0].id),
          'a REFUSED claim was marked claimed — the reward is gone and nothing was ever paid for it');
      }
      const perks = R.getPerks(G);
      assert(typeof perks.allXP === 'number' && perks.allXP > 0, 'top ranks should aggregate an allXP perk');
      if (typeof window.getBonus === 'function') {
        assert(window.getBonus('allXP') >= perks.allXP - 1e-9, 'renown allXP perk should flow into getBonus');
      }
    } finally {
      G.stats.kills = sKills;
      G.gold = sGold;
      if (sRenown === undefined) delete G.renown; else G.renown = sRenown;
    }
  }),
  () => tryRun('b163: platform Storage seam present + round-trips', () => {
    // Architecture layer 4: all local persistence routes through one swappable
    // facade so Steam/mobile can change the backend without touching game logic.
    const S = window.HearthriseStorage;
    assert(S && typeof S.getJSON === 'function' && typeof S.setJSON === 'function' && typeof S.remove === 'function',
      'HearthriseStorage seam missing');
    S.setJSON('__hr_smoke_seam__', { n: 7 });
    const back = S.getJSON('__hr_smoke_seam__');
    assert(back && back.n === 7, 'Storage seam round-trip failed');
    S.remove('__hr_smoke_seam__');
    assert(S.get('__hr_smoke_seam__') === null, 'Storage seam remove failed');
    // saveLocal must route the real save through the seam (the platform swap
    // point). Behavioral, not source-based — saveLocal is wrapped (multi-char),
    // so inspecting its source would miss the underlying call. Spy passes
    // through, so the real save still happens.
    /* b515 — RE-POINTED AT THE CALL SITE THAT STILL EXISTS. This half used to
       spy on `saveLocal()` writing the save blob through the facade, driven with
       the blob live (`withLocalBlob`). There is no blob write at ANY position now:
       b515 deleted the ~65 lines under saveLocal's capstone gate, and `saveLocal`
       is one `G.lastSeen = Date.now()`. Driving a deleted branch would be a test
       of nothing wearing the name of the platform-swap guard.

       `loadLocal()` is the surviving user of the facade, and it uses the half
       that matters most for a platform swap: the REMOVE. It drops any leftover
       blob on the way past (CAPSTONE-NOOP owns the behaviour; this owns the
       ROUTING), so a Steam/mobile backend that implemented get/set but not
       remove would leave a stale rival save on disk forever.
       MUTATION: change `_removeSave` to call `localStorage.removeItem` directly
       → red here. */
    if (typeof window.loadLocal === 'function') {
      const origRemove = S.remove;
      let sawSaveKey = false;
      S.remove = function (k) { if (k === 'hearthbound-save-v2') sawSaveKey = true; return origRemove.apply(S, arguments); };
      try { window.loadLocal(); } finally { S.remove = origRemove; }
      assert(sawSaveKey,
        'loadLocal dropped the leftover save without going through the Storage seam — the platform swap '
        + 'point has a hole in it, and a backend that does not implement remove() would keep a stale '
        + 'client-authored rival on disk');
    }
  }),
  () => tryRun('b162: cozy chips use a light face (no dark-tint-on-cream)', () => {
    // Regression: .invc-hero-stat and .at-qty hardcoded rgba(0,0,0,.25/.35) dark
    // tints (built for dark/colored grounds). On Cozy's cream cards with cocoa
    // text that read ~1.5:1. Both now use var(--bg-2) so they invert per theme.
    // Only meaningful on the light default — dark themes intentionally use a
    // dark chip face with light text.
    // SA-013: cozy-light is a RETIRED theme — HearthriseTheme.list() now holds
    // only 'hearthlight' and setTheme('cozy-light') is a no-op, so there is no
    // light ground for this chip face to render under (dark themes intentionally
    // use a dark chip). It cannot be armed by a fixture without resurrecting the
    // theme; declaring it a skip is the honest state (was a silent early-return).
    const theme = document.body.getAttribute('data-theme');
    if (theme && theme !== 'cozy-light') { skip('cozy-light theme retired (only hearthlight registered) — no light ground to measure'); return; }
    function lumOf(sel, html) {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0';
      host.innerHTML = html;
      document.body.appendChild(host);
      const cs = getComputedStyle(host.querySelector(sel));
      const m = (cs.backgroundColor || '').match(/\d+/g);
      document.body.removeChild(host);
      if (!m) return null;
      const p = m.map(Number);
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
    }
    const a = lumOf('.invc-hero-stat', '<div class="invc-hero-stat"><b>1</b><span>x</span></div>');
    const b = lumOf('.at-qty', '<div class="act-tile"><span class="at-qty muted">Qty: 0</span></div>');
    assert(a === null || a > 0.4, '.invc-hero-stat bg should be light on Cozy (lum ' + a + ')');
    assert(b === null || b > 0.4, '.at-qty bg should be light on Cozy (lum ' + b + ')');
  }),
  () => tryRun('b162: mobile chat button targets the real window.Chat API', () => {
    // Regression: mobile-more-chat.js used to call window.HearthriseChat.open()
    // — a global that never existed (chat.js exposes window.Chat) — so the
    // mobile More→Chat button always missed the API and fell through to a
    // class-swap that left chat.js's `minimized` state stale. Guard the real
    // contract: the global the mobile button now depends on must exist.
    assert(window.Chat && typeof window.Chat.open === 'function',
      'window.Chat.open missing — mobile More→Chat (mobile-more-chat.js) depends on it');
  }),
  () => tryRun('tabs: each tab activates', () => {
    // b229: 'skills' is no longer its own panel — it aliases to the Character
    // screen's Skills sub-tab (asserted separately below). It's out of this
    // real-panel loop precisely because showTab('skills') now activates
    // #panel-character, not #panel-skills.
    const tabs = ['profile', 'character', 'combat', 'bounty', 'inventory', 'shop', 'farming', 'house', 'social'];
    for (const t of tabs) {
      try { window.showTab(t); }
      catch (e) { throw new Error(`showTab("${t}") threw: ${e.message || e}`); }
      const p = document.getElementById('panel-' + t);
      assert(p, 'panel-' + t + ' missing');
      assert(p.classList.contains('active'), 'panel-' + t + ' did not activate');
    }
    window.showTab('profile');
  }),
  () => tryRun('renders: skills + activities', () => {
    // b229: the skills grid lives inside #panel-character now; showTab('skills')
    // aliases there and openSkillDetail paints the relocated #skill-detail.
    window.showTab('skills');
    if (typeof window.renderSkillsList === 'function') window.renderSkillsList();
    if (typeof window.renderSkillDetail === 'function') window.renderSkillDetail('mining');
    const grid = document.querySelector('#skill-detail .act-grid');
    assert(grid, 'activities grid missing');
    assert(grid.querySelectorAll('.act-tile').length > 0, 'no tiles');
  }),
  () => tryRun('renders: combat', () => {
    window.showTab('combat');
    if (typeof window.renderMonsterList === 'function') window.renderMonsterList();
    const ml = document.getElementById('monster-list');
    assert(ml && ml.children.length > 0, 'monster list empty');
  }),
  () => tryRun('renders: inventory', () => {
    window.showTab('inventory');
    if (typeof window.renderInvFancy === 'function') window.renderInvFancy();
    assert(document.querySelector('.invc-bag-col'), 'inventory bag column missing');
  }),
  () => tryRun('renders: profile', () => {
    window.showTab('profile');
    if (typeof window.renderProfile === 'function') window.renderProfile();
    assert(document.getElementById('dash-user'), 'dash-user missing');
  }),
  () => tryRun('renders: farm + house', () => {
    // SA-013: was a no-op render (verified only "did not throw"). Now assert the
    // two panels actually PRODUCE content — a render that silently paints an
    // empty panel is the regression a "renders" test exists to catch.
    window.showTab('farming');
    if (typeof window.renderFarm === 'function') window.renderFarm();
    const farmPanel = document.getElementById('panel-farming');
    assert(farmPanel && farmPanel.childElementCount > 0, 'farming panel rendered no content');
    window.showTab('house');
    if (typeof window.renderHouse === 'function') window.renderHouse();
    const housePanel = document.getElementById('panel-house');
    assert(housePanel && housePanel.childElementCount > 0, 'house panel rendered no content');
  }),
  () => tryRun('skill: start + stop mining', () => {
    const snap = snapshotG();
    window.showTab('skills');
    if (typeof window.startSkill === 'function') {
      window.startSkill('mining', 'copper_rock', 1500);
      assert(window.G.activeSkill === 'mining', 'activeSkill should be mining');
      window.stopSkill();
      assert(!window.G.activeSkill, 'stopSkill failed');
    }
    restoreG(snap);
  }),
  () => tryRun('combat: start + stop slime', () => {
    const snap = snapshotG();
    window.showTab('combat');
    if (typeof window.startCombat === 'function') {
      window.startCombat('slime');
      const am = window.G.activeMonster;
      const amId = (typeof am === 'string') ? am : (am && am.id);
      assert(amId === 'slime', 'startCombat did not set activeMonster: ' + JSON.stringify(am));
      window.stopCombat();
      assert(!window.G.activeMonster, 'stopCombat failed');
    }
    restoreG(snap);
  }),
  () => tryRun('mutex: combat stops skill', () => {
    const snap = snapshotG();
    if (typeof window.startSkill === 'function' && typeof window.startCombat === 'function') {
      window.startSkill('mining', 'copper_rock', 1500);
      window.startCombat('slime');
      assert(!window.G.activeSkill, 'starting combat should clear activeSkill');
      window.stopCombat();
    }
    restoreG(snap);
  }),
  () => tryRun('equip: equipped items exist in ITEMS', () => {
    // Live coverage: the player's OWN equipped items must resolve.
    for (const [slot, id] of Object.entries(window.G.equipment || {})) {
      if (!id) continue;
      // b213: the companion slot holds ids from the COMPANIONS registry
      // (data/companions.js), not ITEMS — a player with an equipped pet
      // used to fail this test.
      if (slot === 'companion') {
        assert(window.COMPANIONS && window.COMPANIONS[id], 'equipped companion ' + id + ' missing from COMPANIONS');
        continue;
      }
      assert(window.ITEMS[id], 'equipped item ' + id + ' missing from ITEMS');
    }
    /* SA-013: a fresh account has an EMPTY equipment map, so the loop above can
       assert nothing and this test passed vacuously. Drive the same resolution
       check with a fixture so it always exercises its subject — a real item id in
       a gear slot, and a real companion id in the companion slot. Restored after. */
    const savedEq = window.G.equipment;
    try {
      const anyItem = Object.keys(window.ITEMS || {})[0];
      assert(anyItem, 'ITEMS registry is empty — the equip-resolution check has nothing to exercise');
      window.G.equipment = { weapon: anyItem };
      assert(window.ITEMS[window.G.equipment.weapon], 'fixture-equipped item ' + anyItem + ' did not resolve in ITEMS');
      const anyComp = Object.keys(window.COMPANIONS || {})[0];
      if (anyComp) {
        window.G.equipment = { companion: anyComp };
        assert(window.COMPANIONS[window.G.equipment.companion], 'fixture-equipped companion ' + anyComp + ' did not resolve in COMPANIONS');
      }
    } finally { window.G.equipment = savedEq; }
  }),
  () => tryRun('errors: clean log', () => {
    // SA-013: was a bare `throw` (real teeth, but invisible to the assertion
    // counter). Same check as an `assert` so coverage is measurable.
    const n = errorLog.length;
    assert(n === 0, n + ' errors captured: ' + JSON.stringify(errorLog.slice(0, 3)));
  }),
  // Visual regression — walks a few key tabs and runs the overlap detector
  // on each. Catches drift like the Lifetime Stats button covering the
  // Active Effects card title.
  () => tryRun('ui: no critical overlaps', () => {
    const tabs = ['profile', 'combat', 'inventory', 'skills'];
    const allViolations = [];
    for (const t of tabs) {
      try { window.showTab(t); } catch (e) {}
      // Force a synchronous layout flush
      void document.body.offsetHeight;
      const v = findUiOverlaps();
      v.forEach(x => allViolations.push(Object.assign({ tab: t }, x)));
    }
    // SA-013: was a bare `throw` — same check via assert so it is counted.
    const overlapSummary = allViolations.map(v =>
      `[${v.tab}] ${v.note || 'overlap'} — A:${v.a} B:${v.b}`
    ).join('\n  ');
    assert(allViolations.length === 0, allViolations.length + ' visual overlap(s) detected:\n  ' + overlapSummary);
  }),
  () => tryRun('dom: critical containers', () => {
    const ids = ['top-gold', 'top-combat', 'top-total', 'panel-profile', 'panel-combat',
                 'panel-skills', 'panel-inventory', 'panel-farming', 'panel-house'];
    for (const id of ids) assert(document.getElementById(id), 'missing #' + id);
  }),
  () => tryRun('companions: data + state — the starter fox is GRAMMAR, and it arrives from the server', () => {
    assert(typeof window.COMPANIONS === 'object' && Object.keys(window.COMPANIONS).length >= 12, 'expected 12+ companions');
    assert(window.G.companions, 'G.companions missing');
    /* b515 — THE FOX IS NOT SEEDED BY THE CLIENT, and this test was passing on
       residue. `companions.js ensureState` fails CLOSED to an EMPTY roster under
       the capstone, deliberately: seeding the starter fox before the envelope
       lands would silently reset a player who owns more. So a bare
       `G.companions.ownedIds` contains whatever an earlier test happened to
       leave — this assertion was order-dependent and only surfaced when the
       tests that seeded it were retired.

       The property is real and worth keeping, so it is asserted where it is
       actually decided: `accrue.js reconcileCompanions` unions the fox into
       EVERY roster ("OWNED = server's unlock set ∪ the grammar-owned starter
       fox"), which is what makes it grammar rather than a row. A server that
       lists nothing must still produce a fox; a server that lists more must
       keep both.
       MUTATION: drop `'fox'` from the `new Set([...])` seed in
       reconcileCompanions → red on the first assertion. */
    const A = window.HearthriseAccrual;
    assert(A && typeof A.reconcileCompanions === 'function',
      'accrue.js must export reconcileCompanions — it is the only writer of the roster now');
    const empty = {};
    A.reconcileCompanions(empty, { companions: { owned: [], xp: {}, equipped: null } });
    assert(empty.companions && empty.companions.ownedIds.indexOf('fox') >= 0,
      'a server roster listing NOTHING did not produce the starter fox — it is owned by grammar, not by '
      + 'a row, and a new player would have no companion at all: ' + JSON.stringify(empty.companions));
    const some = {};
    A.reconcileCompanions(some, { companions: { owned: ['beaver'], xp: { beaver: 40 }, equipped: 'beaver' } });
    assert(some.companions.ownedIds.indexOf('fox') >= 0 && some.companions.ownedIds.indexOf('beaver') >= 0,
      'the union dropped one of them: ' + JSON.stringify(some.companions.ownedIds));
    assert(some.companions.equipped === 'beaver' && some.companions.xp.beaver === 40,
      'the server-owned equip/xp did not land: ' + JSON.stringify(some.companions));
    /* AND THE CLIENT DOES NOT INVENT ONE. The fail-closed direction is the half
       that protects a real player: an envelope that says nothing about
       companions must leave the roster ALONE, not rebuild it. */
    const untouched = { companions: { ownedIds: ['beaver'], xp: {}, equipped: 'beaver' } };
    A.reconcileCompanions(untouched, {});
    assert(untouched.companions.ownedIds.length === 1 && untouched.companions.ownedIds[0] === 'beaver',
      'a partial envelope rebuilt the roster — an un-projecting server would wipe what the player owns: '
      + JSON.stringify(untouched.companions));
  }),
  () => tryRun('companions: bonus + stable panel', () => {
    /* b515: the roster arrives through the real `reconcileCompanions`, not from
       whatever an earlier test left in `G.companions` — see
       `withCompanionRoster`. This test's subject is the BONUS, and it needs a
       fox that is genuinely owned before it can equip one. */
    const snap = JSON.stringify(window.G.companions);
    withCompanionRoster(['fox'], null, () => {
    if (typeof window.equipCompanion === 'function') window.equipCompanion('fox');
    if (typeof window.getCompanionBonus === 'function') {
      const b = window.getCompanionBonus();
      /* b228: `xpB` was a misspelling of `allXP` and the Fox therefore paid
         nothing from the day it shipped. The corrected key is the contract. */
      assert(b.allXP > 0, 'fox allXP should apply');
      assert(b.xpB === undefined, 'the misspelled xpB key must not come back');
    }
    assert(document.getElementById('panel-stable'), 'panel-stable missing');
    assert(document.getElementById('stable-body'), 'stable-body missing');
    });
    window.G.companions = JSON.parse(snap);
  }),

  // Render-layer extraction guard: the Lifetime Stats modal moved out of
  // legacy.js into src/render/lifetime-stats.js (first strangler-fig render
  // extraction, 2026-08-18). This asserts the extracted surface still exposes
  // its entry point, renders identically (every section header + a couple of
  // derived numbers read off G.stats), and that its wired ESC handler closes
  // it. Behavior-identical is the contract for a pure refactor.
  () => tryRun('render: lifetime stats modal (extracted surface)', () => {
    assert(typeof window.openLifetimeStats === 'function',
      'openLifetimeStats must stay on window (invoked by inline onclick handlers)');
    const s = window.G.stats = window.G.stats || {};
    const snap = JSON.stringify(s);
    s.kills = 4242; s.deaths = 7;
    window.openLifetimeStats();
    const modal = document.getElementById('lifetime-stats');
    assert(modal, 'lifetime-stats modal element not created');
    assert(modal.classList.contains('show'), 'lifetime-stats modal did not open (missing .show)');
    const html = modal.innerHTML;
    ['Lifetime Stats', 'Combat', 'Economy', 'Bounty Hunter', 'Production']
      .forEach(h => assert(html.indexOf(h) >= 0, 'lifetime stats missing section: ' + h));
    assert(html.indexOf((4242).toLocaleString()) >= 0, 'lifetime stats did not render kills off G.stats');
    // The wired ESC handler must close it (moved with the surface).
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    assert(!modal.classList.contains('show'), 'ESC did not close the lifetime-stats modal');
    window.G.stats = JSON.parse(snap);
  }),

  // render-layer extraction: the Profile "Objectives" popout moved out of
  // legacy.js to src/render/objectives-popout.js. Pure refactor —
  // openObjectivesPopout must stay on window (buildProfileToolbar wires it via
  // addEventListener with the bare global). Read-only: it mirrors the
  // #dash-objectives card innerHTML into a modal and writes no game state.
  () => tryRun('render: objectives popout (extracted surface)', () => {
    assert(typeof window.openObjectivesPopout === 'function',
      'openObjectivesPopout must stay on window (buildProfileToolbar addEventListener global)');
    // Seed a source card with a known marker the popout should mirror.
    let src = document.getElementById('dash-objectives');
    const hadSrc = !!src;
    if (!src) { src = document.createElement('div'); src.id = 'dash-objectives'; document.body.appendChild(src); }
    const savedSrc = src.innerHTML;
    src.innerHTML = '<div class="obj-marker">OBJECTIVE_SMOKE_MARKER</div>';
    window.openObjectivesPopout();
    const ov = document.getElementById('prof-pop-objectives');
    assert(ov, 'prof-pop-objectives overlay not created');
    assert(ov.classList.contains('show'), 'objectives popout did not open (missing .show)');
    const body = document.getElementById('prof-pop-objectives-body');
    assert(body && body.innerHTML.indexOf('OBJECTIVE_SMOKE_MARKER') >= 0,
      'objectives popout did not mirror #dash-objectives content');
    // Backdrop click (target === overlay) must close it.
    ov.dispatchEvent(new MouseEvent('click'));
    assert(!ov.classList.contains('show'), 'backdrop click did not close the objectives popout');
    // Restore source card state.
    if (hadSrc) src.innerHTML = savedSrc; else src.remove();
  }),

  // 2nd render-layer extraction: the Active Effects panel (Profile card) moved
  // out of legacy.js block 8 to src/render/active-effects.js. Pure refactor —
  // the card must still self-install and renderActiveEffects must stay on window
  // (buff/gold paths, admin.js, item-ux.js all call window.renderActiveEffects()).
  () => tryRun('render: active effects panel (extracted surface)', () => {
    assert(typeof window.renderActiveEffects === 'function',
      'renderActiveEffects must stay on window (called after buff/bonus changes)');
    const body = document.getElementById('aef-body');
    assert(body, 'aef-body not created — Active Effects card did not self-install');
    // With no food buffs and no house bonuses, the two always-on sections render
    // their empty states. Force the legacy fallback path (no buff-queue feature)
    // so the render is deterministic regardless of load order.
    const savedRender = window.__renderBuffsSection;
    const savedBuffs = window.G.buffs;
    try {
      window.__renderBuffsSection = undefined;
      window.G.buffs = [];
      window.renderActiveEffects();
      const html = body.innerHTML;
      assert(html.indexOf('Food Buffs') >= 0, 'Active Effects missing Food Buffs heading');
      assert(html.indexOf('House Buffs') >= 0, 'Active Effects missing House Buffs heading');
    } finally {
      window.__renderBuffsSection = savedRender;
      window.G.buffs = savedBuffs;
    }
  }),

  // 3rd render-layer extraction: the Achievements presentation (unlock toast +
  // full modal) moved out of legacy.js to src/render/achievements.js. Pure
  // refactor — both fns must stay on window: showAchToast (checkAchievements
  // calls it by bare global on unlock) and openAchievements (inline onclick in
  // the achievements button row + profile toolbar). Read-only surface.
  () => tryRun('render: achievements toast + modal (extracted surface)', () => {
    assert(typeof window.showAchToast === 'function',
      'showAchToast must stay on window (checkAchievements calls it on unlock)');
    assert(typeof window.openAchievements === 'function',
      'openAchievements must stay on window (invoked by inline onclick handlers)');
    // Toast: paints from the def it is handed, appends to body, auto-removes.
    const beforeToasts = document.querySelectorAll('.ach-toast').length;
    window.showAchToast({ icon: '🏆', name: 'Smoke Test Trophy' });
    const toasts = document.querySelectorAll('.ach-toast');
    assert(toasts.length === beforeToasts + 1, 'showAchToast did not append a .ach-toast');
    const toast = toasts[toasts.length - 1];
    assert(toast.innerHTML.indexOf('Smoke Test Trophy') >= 0, 'toast did not render the achievement name');
    toast.remove(); // don't leave it lingering for the 4.2s timer
    // Modal: reads window.ACHIEVEMENTS + G.achievements and paints a sorted list.
    assert(Array.isArray(window.ACHIEVEMENTS) && window.ACHIEVEMENTS.length > 0,
      'ACHIEVEMENTS catalogue must be published for the modal to read');
    const snap = JSON.stringify(window.G.achievements || {});
    window.openAchievements();
    const ov = document.getElementById('ach-overlay');
    assert(ov, 'ach-overlay element not created');
    assert(ov.classList.contains('show'), 'achievements modal did not open (missing .show)');
    const list = document.getElementById('ach-list');
    assert(list && list.querySelectorAll('.ach-row').length === window.ACHIEVEMENTS.length,
      'modal must render one .ach-row per catalogue entry');
    ov.classList.remove('show');
    window.G.achievements = JSON.parse(snap);
  }),

  () => tryRun('render: bestiary modal (extracted surface)', () => {
    assert(typeof window.openBestiary === 'function',
      'openBestiary must stay on window (invoked by inline onclick handlers)');
    assert(window.MONSTERS && typeof window.MONSTERS === 'object' &&
      Object.keys(window.MONSTERS).length > 0,
      'MONSTERS catalogue must be published for the modal to read');
    const snap = JSON.stringify(window.G.bestiary || {});
    // Seed one discovered monster so we exercise the discovered branch too.
    const firstId = Object.keys(window.MONSTERS)[0];
    window.G.bestiary = window.G.bestiary || {};
    window.G.bestiary[firstId] = { kills: 7, firstKill: Date.now() };
    window.openBestiary();
    const ov = document.getElementById('best-overlay');
    assert(ov, 'best-overlay element not created');
    assert(ov.classList.contains('show'), 'bestiary modal did not open (missing .show)');
    const list = document.getElementById('best-list');
    assert(list && list.querySelectorAll('.bestiary-row').length === Object.keys(window.MONSTERS).length,
      'modal must render one .bestiary-row per monster in the catalogue');
    const discovered = list.querySelector('.bestiary-row.discovered');
    assert(discovered, 'seeded (killed) monster must render as a .discovered row');
    assert(discovered.querySelector('.br-kills').textContent.indexOf('7') >= 0,
      'discovered row must show the kill count');
    ov.classList.remove('show');
    window.G.bestiary = JSON.parse(snap);
  }),

  () => tryRun('render: equipment bonuses stats renderer (extracted surface)', () => {
    // b402: the standalone openEquipmentBonuses modal was retired as confirmed dead
    // code (its pop-out button was removed long ago; zero live callers). The one live
    // surface is renderEquipmentStatsHTML, consumed by buildTibiaDoll's Stats pane.
    assert(typeof window.renderEquipmentStatsHTML === 'function',
      'renderEquipmentStatsHTML must stay on window (buildTibiaDoll stats pane calls it)');
    assert(typeof window.openEquipmentBonuses === 'undefined',
      'openEquipmentBonuses was retired as dead code — must NOT come back');
    const html = window.renderEquipmentStatsHTML();
    assert(typeof html === 'string' && html.indexOf('eqb-grid') >= 0,
      'renderEquipmentStatsHTML must return an .eqb-grid block');
    // b403: a NEGATIVE flat bonus must render "-5", not the old doubled-sign "+-5".
    // Stub getEquipmentTotals with a controlled negative + positive flat field.
    const _origTotals = window.getEquipmentTotals;
    try {
      window.getEquipmentTotals = () => ({ fields: [['atkB', 'Attack'], ['strB', 'Strength']], totals: { atkB: -5, strB: 7 }, worn: [] });
      const signed = window.renderEquipmentStatsHTML();
      assert(signed.indexOf('+-') === -1, 'negative flat bonus must not render a doubled sign "+-"');
      assert(signed.indexOf('>-5<') >= 0, 'a -5 flat bonus must render as "-5"');
      assert(signed.indexOf('>+7<') >= 0, 'a +7 flat bonus must still render as "+7"');
    } finally {
      window.getEquipmentTotals = _origTotals;
    }
  }),

  // b385: 6th render-layer extraction — the level-up celebration toast moved to
  // src/render/levelup-celebration.js. It must stay a window global (the addXp
  // wrapper in legacy.js calls it by bare name), paint the transient overlay with
  // the expected class + skill name + level, and NOT persist (auto-removes).
  () => tryRun('render: level-up celebration toast (extracted surface)', () => {
    assert(typeof window.showLevelupCelebration === 'function',
      'showLevelupCelebration must stay on window (addXp wrapper calls it by bare name)');
    const before = document.querySelectorAll('.lvl-celebration').length;
    window.showLevelupCelebration('mining', 42);
    const nodes = document.querySelectorAll('.lvl-celebration');
    assert(nodes.length === before + 1, 'a .lvl-celebration node must be appended');
    const el = nodes[nodes.length - 1];
    assert(el.querySelector('.lc-ring'), 'toast must render its .lc-ring');
    assert(el.querySelector('.lc-icon'), 'toast must render its .lc-icon');
    const txt = el.querySelector('.lc-text');
    assert(txt && txt.textContent.indexOf('Level 42') >= 0,
      'toast must show the level number');
    const skname = (window.SKILLS_DEF && window.SKILLS_DEF.mining) ? window.SKILLS_DEF.mining.name : 'mining';
    const sk = el.querySelector('.lc-skill');
    assert(sk && sk.textContent.indexOf(skname) >= 0, 'toast must show the skill name');
    // Clean up the transient node so it doesn't linger past the test.
    el.remove();
  }),

  // 9th render-layer extraction: the Shop / IAP store controller moved out of
  // legacy.js to src/render/shop.js. Pure refactor — renderShop must stay on
  // window (legacy dispatch + setShopTab + error-boundary call it by name),
  // paint BOTH halves (#iap-panel IAP grid, #shop-panel counter scene), and
  // its tab-state must live on window.shopTab so the extracted painter and the
  // still-in-legacy setShopTab handler share one identity.
  () => tryRun('render: shop / IAP store controller (extracted surface)', () => {
    assert(typeof window.renderShop === 'function',
      'renderShop must stay on window (legacy dispatch + setShopTab + error-boundary call it by name)');
    // Ensure the two host panels exist (they live in the Shop tab template).
    const iap = document.getElementById('iap-panel');
    const shop = document.getElementById('shop-panel');
    assert(iap && shop, 'shop host panels (#iap-panel/#shop-panel) missing from DOM');
    const savedTab = window.shopTab;
    try {
      // IAP grid: one card per catalogue entry, each with a Buy control.
      window.renderShop();
      const cards = iap.querySelectorAll('.iap-card');
      assert(cards.length === (window.IAP_CATALOG || []).length && cards.length > 0,
        'the IAP grid rendered ' + cards.length + ' cards for '
        + (window.IAP_CATALOG || []).length + ' products');
      assert(iap.querySelector('.iap-card button'), 'an IAP card has no Buy control');
      // Local Shop counter: the drawn SHOP_SCENE plus the tabbed wares.
      assert(shop.querySelector('.sc-scene'), 'the SHOP_SCENE shopfront did not paint');
      // Seeds tab (default) shows seed rows priced from SEED_SHOP.
      window.shopTab = 'seeds';
      window.renderShop();
      assert(shop.querySelectorAll('.shop-row').length >= (window.SEED_SHOP || []).length,
        'the seeds tab rendered fewer rows than SEED_SHOP has offers');
      // Equipment tab surfaces the wield-requirement chip authority (b341): at
      // least one row carries data-req-skill (the gear gate the shop must read).
      window.shopTab = 'equip';
      window.renderShop();
      assert(shop.querySelectorAll('.shop-row').length >= (window.EQUIP_SHOP || []).length,
        'the equipment tab rendered fewer rows than EQUIP_SHOP has offers');
      assert(shop.querySelector('.shop-row[data-req-skill]'),
        'no equipment row states a wield requirement — the b341 gear-gate read is gone');
    } finally {
      window.shopTab = savedTab;
      try { window.renderShop(); } catch (e) {}
    }
  }),

  // 10th render-layer extraction: the vendor Buy Back modal moved out of
  // legacy.js to src/render/buyback.js. Pure refactor — openBuyback + renderBuyback
  // must stay on window (shop.js inline onclick="openBuyback()" and repurchase()'s
  // bare renderBuyback() call both resolve to the globals). Read-only paint of the
  // G.buyback journal; the gold/inventory mutation stays in repurchase() in legacy.
  () => tryRun('render: buy back modal (extracted surface)', () => {
    assert(typeof window.openBuyback === 'function',
      'openBuyback must stay on window (shop.js inline onclick="openBuyback()")');
    assert(typeof window.renderBuyback === 'function',
      'renderBuyback must stay on window (repurchase() calls it after a buy-back)');
    const savedBuyback = window.G.buyback;
    try {
      // Empty journal → the empty-state copy.
      window.G.buyback = [];
      window.openBuyback();
      const m = document.getElementById('bb-modal');
      assert(m, 'bb-modal was not created by openBuyback');
      assert(m.classList.contains('show'), 'buy-back modal did not open (missing .show)');
      let body = document.getElementById('bb-modal-body');
      assert(body && body.innerHTML.indexOf('Nothing to buy back') >= 0,
        'empty buy-back journal did not render its empty state');
      // A journalled sale → one .bb-row with a repurchase() Buy Back control.
      const anyId = Object.keys(window.ITEMS || {})[0];
      assert(anyId, 'ITEMS empty — cannot seed a buy-back row');
      window.G.buyback = [{ id: anyId, qty: 2, unit: 5 }];
      window.renderBuyback();
      body = document.getElementById('bb-modal-body');
      const rows = body.querySelectorAll('.bb-row');
      assert(rows.length === 1, 'expected exactly one buy-back row, got ' + rows.length);
      const btn = rows[0].querySelector('button');
      assert(btn && btn.getAttribute('onclick').indexOf('repurchase(0)') >= 0,
        'buy-back row is missing its repurchase(0) control');
      // Close control removes .show.
      m.classList.remove('show');
      assert(!m.classList.contains('show'), 'buy-back modal did not close');
    } finally {
      window.G.buyback = savedBuyback;
    }
  }),

  // ── b126 regression suite: every bug we fixed in b119–b125 ──
  // Each test guards against a specific historical regression. If
  // any of these fail we're shipping a bug we already paid for once.

  // b119: renderProfile crashed in a loop when onAuthStateChange fired
  // before the Profile panel template was in the DOM. Null guards added.
  () => tryRun('b119: renderProfile survives missing dash-user-sub', () => {
    if (typeof window.renderProfile !== 'function') return;
    const sub = document.getElementById('dash-user-sub');
    const body = document.getElementById('dash-user-body');
    if (!sub || !body) return; // can't simulate cleanly; skip silently
    const subParent = sub.parentNode, bodyParent = body.parentNode;
    sub.remove(); body.remove();
    // SA-013: the whole point of the test is "renderProfile does NOT throw when
    // these nodes are missing" — capture that and assert it, instead of letting
    // a survived call and a thrown one both report PASS (a throw would surface
    // via the global error log, but the test's own name promised the check).
    let threw = null;
    try { window.renderProfile(); }
    catch (e) { threw = e; }
    finally { subParent.appendChild(sub); bodyParent.appendChild(body); }
    assert(!threw, 'renderProfile threw with dash-user-sub/body missing: ' + (threw && threw.message));
  }),

  // b122: skill icons should fall back to emoji on every renderer.
  // If something re-populates _skillIcon with broken paths, renderers
  // would emit broken-image squares.
  () => tryRun('b122: skill icon map stays empty', () => {
    const n = Object.keys(window._skillIcon || {}).length;
    assert(n === 0, '_skillIcon should be empty (emoji fallback), got ' + n + ' entries');
  }),

  // b122: topbar avatar must resolve. Earlier it was an icons3 path
  // that 404'd as a dark square.
  () => tryRun('b122: topbar avatar src is a shipped path', () => {
    const img = document.querySelector('.player-avatar img');
    if (!img) return; // not yet rendered; pass
    const src = img.getAttribute('src') || '';
    assert(
      src.indexOf('icons3/') !== 0 && src.indexOf('assets/raw-bundle/') !== 0,
      'topbar avatar points at unshipped folder: ' + src
    );
  }),

  // b124: hide the duplicate prof-toolbar on mobile so we don't see
  // both Achievements/Bestiary/LastSession/Lifetime AND Objectives/
  // Achievements/Bestiary/Lifetime stacked on small viewports.
  () => tryRun('b124: prof-toolbar hidden on mobile', () => {
    if (window.innerWidth > 540) { skip('mobile-only rule; desktop viewport'); return; }
    const pt = document.querySelector('#panel-profile .prof-toolbar');
    if (!pt) { skip('prof-toolbar not in DOM'); return; }
    const d = getComputedStyle(pt).display;
    assert(d === 'none', 'prof-toolbar should be display:none on mobile, got ' + d);
  }),

  // b123: feat-buttons must be a 2-column grid on mobile. Earlier they
  // stayed in a vertical flex stack because audit-overrides.css had
  // higher specificity than the b122 mobile rule.
  () => tryRun('b123: feat-buttons grid on mobile', () => {
    if (window.innerWidth > 540) { skip('mobile-only rule; desktop viewport'); return; }
    const fb = document.querySelector('#panel-profile .feat-buttons');
    if (!fb) { skip('feat-buttons not in DOM'); return; }
    const cs = getComputedStyle(fb);
    assert(cs.display === 'grid', 'feat-buttons display should be grid on mobile, got ' + cs.display);
    assert(/1fr.*1fr/.test(cs.gridTemplateColumns), 'feat-buttons should be 2-col grid, got ' + cs.gridTemplateColumns);
  }),

  // b124: universal SW kill-switch must fire on cache-name mismatch.
  // We can't actually trigger it (would reload the page), but we can
  // assert the inline script is present + parses the build correctly.
  () => tryRun('b124: SW kill-switch script present', () => {
    const head = document.head.innerHTML;
    assert(head.indexOf('hr-sw-killswitch') >= 0 || head.indexOf('hr-sw-purged') >= 0,
      'SW kill-switch inline script not detected in <head>');
  }),

  // b125: the deploy root should NOT contain old monolith snapshots.
  // If anyone restores them, friends could land on a stale URL with
  // an old SW that re-haunts their cache.
  () => tryRun('b125: no references to legacy snapshot HTMLs', () => {
    const html = document.documentElement.outerHTML;
    const banned = ['hearthbound-phaseA.html', 'hearthrise-phaseA.html', 'hearthbound-v2.html'];
    for (const f of banned) {
      assert(html.indexOf(f) < 0, 'page references legacy snapshot: ' + f);
    }
  }),

  // Build version sanity — every cache-buster on the page should match
  // window.HearthriseBuild.cache. If they drift, users see stale assets.
  () => tryRun('build: cache-busters all match HearthriseBuild', () => {
    const expected = String((window.HearthriseBuild && window.HearthriseBuild.cache) || '');
    if (!expected) return;
    const tags = document.querySelectorAll('script[src*="?v="], link[href*="?v="]');
    let mismatches = 0, sample = '';
    for (const t of tags) {
      const a = t.src || t.href || '';
      const m = a.match(/\?v=(\d+)/);
      if (m && m[1] !== expected) {
        mismatches++;
        if (!sample) sample = a;
      }
    }
    assert(mismatches === 0, mismatches + ' tags with wrong ?v=, expected v=' + expected + ', e.g. ' + sample);
  }),

  // The bug-report pipeline must be reachable. A missing button = silent bug
  // reports going nowhere, and silence is this feature's failure mode.
  // b322: delivery is now the `bug-report-bridge` Edge Function (the webhook
  // moved to a server secret), so the check is "the entry point renders and
  // the module is wired", not "a webhook constant is filled in".
  () => tryRun('bug-report: entry point rendered and relay wired', () => {
    const btn = document.getElementById('hr-bug-btn') || document.querySelector('[id*="bug-btn"]');
    assert(btn, 'bug-report 🐛 button not found in DOM');
    const B = window.HearthriseBugReport;
    assert(B && typeof B.submit === 'function' && typeof B.relayPath === 'string',
      'the bug-report module must expose submit() and the relay path');
  }),

  // Service-worker registration: when served over https the SW should
  // be installed (or installing). Catches the b108-b110 era where the
  // SW silently failed to register on some builds.
  () => tryRun('sw: registered when served over https', () => {
    if (location.protocol !== 'https:') { skip('https-only; served over ' + location.protocol); return; }
    if (!('serviceWorker' in navigator)) { skip('serviceWorker not supported in this environment'); return; }
    // navigator.serviceWorker.controller is null until the SW activates
    // — getRegistration() is what we want for "is one installed".
    // This test is async-flavored but we check synchronously and only
    // fail if the API itself is broken.
    assert(typeof navigator.serviceWorker.getRegistration === 'function',
      'serviceWorker.getRegistration not available');
  }),

  // Cloud config: in production builds DEFAULT_CONFIG should be set so
  // players can sign in. Without this, the "Auth not configured" error
  // surfaces on every signIn() click.
  () => tryRun('cloud: HearthriseSupabase configured', () => {
    if (!window.HearthriseSupabase) return; // not loaded yet
    const cfg = window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig();
    assert(cfg && cfg.url && cfg.anonKey, 'no Supabase config — sign-in will throw "Auth not configured"');
    assert(cfg.url.indexOf('.supabase.co') > 0, 'Supabase URL looks malformed: ' + cfg.url);
    assert(cfg.anonKey.indexOf('eyJ') === 0, 'Supabase anon key should be a JWT (start with eyJ)');
  }),

  // Feature flag: the universal SW kill-switch should NOT loop. If
  // sessionStorage flag is set, the killer should bail. This tests
  // the flag is honored.
  () => tryRun('b124: kill-switch idempotent within session', () => {
    // We don't run the kill-switch directly (would reload), just
    // assert the sessionStorage flag mechanism exists. Inline script
    // sets 'hr-sw-purged' = '1' after a purge; we verify the key name.
    const head = document.head.innerHTML;
    assert(head.indexOf('hr-sw-purged') >= 0, 'kill-switch idempotency flag not present in inline script');
  }),

  // ─────────────────────────────────────────────────────────────
  // INTERACTIVE COVERAGE — click every interactive element in every
  // panel. Goal: catch silent breakage where a button stops firing
  // or throws when clicked. Tests are grouped by panel; each test
  // saves + restores G state so the suite is idempotent.
  // ─────────────────────────────────────────────────────────────

  // Helper-driven walk: simulates a real click on each element in
  // a query selector, swallowing the action result, asserting no
  // errors thrown + element stayed in DOM. Returns count clicked.
  () => tryRun('clicks: every bottom-nav tab activates its panel', () => {
    const tabs = ['profile', 'character', 'combat', 'skills', 'farming'];
    for (const t of tabs) {
      const el = document.querySelector(`.bottom-nav [data-tab="${t}"]`);
      if (!el) continue; // mobile only — desktop hides
      try { el.click(); } catch (e) { throw new Error(`bottom-nav ${t} click threw: ${e.message}`); }
      const panel = document.getElementById('panel-' + t);
      assert(panel && panel.classList.contains('active'), `panel-${t} did not activate after bottom-nav click`);
    }
    window.showTab('profile');
  }),

  () => tryRun('clicks: every sidebar nav item activates its panel', () => {
    const items = document.querySelectorAll('.sidebar [data-tab]');
    if (!items.length) return; // mobile — sidebar hidden, tested in bottom-nav
    const seen = new Set();
    for (const el of items) {
      const t = el.dataset.tab;
      if (seen.has(t)) continue; // dedupe (sidebar has duplicate items)
      seen.add(t);
      try { el.click(); } catch (e) { throw new Error(`sidebar ${t} click threw: ${e.message}`); }
      /* b230: the invariant is "every entry in the rail leads somewhere live",
         not "every entry owns a panel whose id matches its data-tab". Shops is
         one destination over two hosts (#panel-shop / #panel-market) and
         resolves through showTab's alias table, so an id-equality check would
         have failed a route that works. Assert what actually matters: a panel
         became active, and it is the one the entry claims to open. */
      const active = document.querySelector('.panel.active');
      assert(active, `sidebar ${t} activated no panel at all`);
      const named = document.getElementById('panel-' + t);
      if (named) assert(named === active, `sidebar ${t} did not open panel-${t}`);
    }
    window.showTab('profile');
  }),

  () => tryRun('clicks: topbar buttons (notif/save/settings/quests)', () => {
    const ids = ['btn-notif', 'btn-settings', 'hr-quests-btn']; // b227: btn-save removed
    let clicked = 0;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      clickOk(el, `topbar #${id} click`); // SA-013: counted no-throw assertion per button
      clicked++;
    }
    // The topbar is core UI on the desktop viewport the suite runs at — at least
    // one of these controls must exist, or the assertions above never ran.
    try {
      assert(clicked > 0, 'no topbar buttons (' + ids.join(', ') + ') were present to click');
    } finally {
      /* These buttons open the Chronicle scrim and the Quests overlay, neither
         of which is a `.modal.show` — the class-removal sweep that used to
         stand here missed both and left them covering every screen after. */
      closeOverlays();
    }
  }),

  () => tryRun('clicks: profile feat-buttons (achievements/bestiary/etc)', () => {
    window.showTab('profile');
    const btns = document.querySelectorAll('#panel-profile .feat-buttons button, #panel-profile .feat-buttons .stats-btn-trigger');
    /* This was a bare `>= 4`, which silently encoded a FOURTH button that
       no longer exists: welcome-v2's "Last Session Summary" (retired in a779c9cf,
       Set the Night, FEATURE_SLATE.md §3). A count threshold cannot tell "the row
       shrank by ruling" from "a button was dropped by accident", so it is now the
       NAMED census of the surviving row:
         · Achievements + Bestiary — injectProfileButtons(), src/legacy.js
         · Lifetime Stats          — src/render/lifetime-stats.js
       Both directions bite: a missing entry is a lost button, an unexpected entry
       is a button added without being clicked-through here. */
    const EXPECT_FEATS = ['achievements', 'bestiary', 'lifetime stats'];
    const labels = [...btns].map((b) => (b.textContent || '').trim().toLowerCase());
    const missing = EXPECT_FEATS.filter((n) => !labels.some((l) => l.includes(n)));
    assert(missing.length === 0, 'profile feat button(s) missing from the row: ' + missing.join(', ') + ' (present: ' + labels.join(' | ') + ')');
    const extra = labels.filter((l) => !EXPECT_FEATS.some((n) => l.includes(n)));
    assert(extra.length === 0, 'unexpected profile feat button(s) not in the census: ' + extra.join(' | '));
    try {
      for (const b of btns) {
        try { b.click(); } catch (e) { throw new Error(`feat button "${b.textContent.trim()}" threw: ${e.message}`); }
      }
    } finally {
      /* Lifetime Stats is `.stats-modal`, Achievements and Bestiary are
         `.ach-overlay` — the `.modal.show` sweep that used to sit inside this
         loop closed none of the three. */
      closeOverlays();
    }
  }),

  () => tryRun('clicks: every combat tier chip', () => {
    window.showTab('combat');
    const chips = document.querySelectorAll('#panel-combat #tier-chips .chip, #panel-combat .chips [data-tier]');
    assert(chips.length >= 6, 'expected 6 tier chips, got ' + chips.length);
    for (const c of chips) {
      try { c.click(); } catch (e) { throw new Error(`tier chip ${c.dataset.tier || c.textContent} threw: ${e.message}`); }
    }
    // Reset to tier 1
    const t1 = document.querySelector('#panel-combat [data-tier="1"]');
    if (t1) try { t1.click(); } catch {}
  }),

  () => tryRun('clicks: combat monster rows render preview', () => {
    const snap = snapshotG();
    window.showTab('combat');
    if (typeof window.renderMonsterList === 'function') window.renderMonsterList();
    const rows = document.querySelectorAll('#monster-list .monster-row, #monster-list [data-mid], #monster-list [onclick*="startCombat"]');
    assert(rows.length > 0, 'no monster rows rendered');
    // Click first 3 — clicking ALL would be slow + spammy
    let clicked = 0;
    for (const r of Array.from(rows).slice(0, 3)) {
      try { r.click(); clicked++; } catch (e) { throw new Error(`monster row ${r.dataset.mid || ''} threw: ${e.message}`); }
      /* b341: a row click now genuinely opens the mob preview (before, it
         started the fight, which is the bug this test's own NAME describes).
         The preview is #mob-preview.open, not a `.modal.show` — leaving it up
         floated a full-screen overlay over every later test, and the shop's
         "nothing covers the buy control" check was the one that noticed. */
      document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
      if (typeof window.closeMobPreview === 'function') window.closeMobPreview();
    }
    if (typeof window.stopCombat === 'function') try { window.stopCombat(); } catch {}
    restoreG(snap);
  }),

  () => tryRun('clicks: every skill row in skills panel', () => {
    const snap = snapshotG();
    try {
      window.showTab('skills');
      if (typeof window.renderSkillsList === 'function') window.renderSkillsList();
      const rows = document.querySelectorAll('#skills-list .skill-row, #skills-list [onclick*="openSkillDetail"], #skills-list .skill-card');
      if (rows.length === 0) { skip('skills panel uses a different row layout in this build'); return; }
      for (const r of Array.from(rows).slice(0, 5)) clickOk(r, 'skill row'); // SA-013: counted per row
      if (typeof window.stopSkill === 'function') try { window.stopSkill(); } catch {}
    } finally { restoreG(snap); }
  }),

  () => tryRun('clicks: activities grid tile starts a skill', () => {
    const snap = snapshotG();
    try {
      window.showTab('skills');
      if (typeof window.openSkillDetail === 'function') window.openSkillDetail('mining');
      void document.body.offsetHeight;
      const tile = document.querySelector('#skill-detail .act-tile, #skill-detail [onclick*="startSkill"]');
      if (!tile) { skip('activities grid is inlined in this build (no standalone act-tile)'); return; }
      clickOk(tile, 'act-tile click'); // SA-013: counted no-throw assertion
      if (typeof window.stopSkill === 'function') try { window.stopSkill(); } catch {}
    } finally { restoreG(snap); }
  }),

  () => tryRun('clicks: inventory category strip', () => {
    /* Was 'inventory sub-tabs (Bag / Bank)': it clicked the STATIC chips authored
       in index.html, which the live renderer (renderInvFancy) overwrites on its
       first paint — the test only ever saw them because it ran in the same task
       that scheduled that paint. Those chips are gone with the dead second bag
       renderer; the live equivalent of "switch what the bag shows" is the
       category strip, so the click target is now a control that exists. It is
       painted in a 0ms hop, so paint it in this task before reading it. */
    window.showTab('inventory'); if (typeof window._renderInvFancy === 'function') window._renderInvFancy();
    const cats = document.querySelectorAll('#panel-inventory .invc-cat-btn');
    if (cats.length === 0) { skip('inventory category strip absent in this build layout'); return; }
    try { for (const c of Array.from(cats).slice(0, 4)) clickOk(c, 'inv category btn'); } finally { if (typeof window._invSetCat === 'function') window._invSetCat('all'); }
  }),

  () => tryRun('clicks: house room rows + tab switches', () => {
    window.showTab('house');
    if (typeof window.renderHouse === 'function') window.renderHouse();
    const tabs = document.querySelectorAll('[data-house]');
    if (tabs.length === 0) { skip('house tabs absent in this build layout'); return; }
    for (const t of tabs) clickOk(t, `house tab ${t.dataset.house}`); // SA-013: counted per tab
    // Click the first room row's upgrade button if present (will no-op
    // when player can't afford, but click should not throw).
    const upBtn = document.querySelector('#house-panel [onclick*="upgradeRoom"]');
    if (upBtn) clickOk(upBtn, 'house upgrade btn');
  }),

  () => tryRun('clicks: farm plot tiles open seed picker (or harvest)', () => {
    const snap = snapshotG();
    try {
      window.showTab('farming');
      if (typeof window.renderFarm === 'function') window.renderFarm();
      const plots = document.querySelectorAll('.farm-tile, [onclick*="openSeedPicker"], [onclick*="harvestPlot"], [onclick*="waterPlot"]');
      if (plots.length === 0) { skip('no farm plot tiles rendered in this build'); return; }
      for (const p of Array.from(plots).slice(0, 2)) {
        clickOk(p, 'farm plot'); // SA-013: counted no-throw assertion per tile
        document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
      }
    } finally { restoreG(snap); }
  }),

  () => tryRun('clicks: bounty board rows', () => {
    const snap = snapshotG();
    try {
      window.showTab('bounty');
      if (typeof window.renderBounty === 'function') window.renderBounty();
      void document.body.offsetHeight;
      const rows = document.querySelectorAll('#panel-bounty .bounty-row, #panel-bounty [onclick]');
      if (rows.length === 0) { skip('no bounty board rows rendered in this build/state'); return; }
      for (const r of Array.from(rows).slice(0, 3)) {
        clickOk(r, 'bounty row'); // SA-013: counted no-throw assertion per row
        document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
      }
    } finally { restoreG(snap); }
  }),

  () => tryRun('clicks: stable companion cards', () => {
    window.showTab('stable');
    if (typeof window.renderStable === 'function') window.renderStable();
    void document.body.offsetHeight;
    const cards = document.querySelectorAll('#panel-stable .sc-card, #panel-stable [onclick*="equipCompanion"], #panel-stable [onclick*="unequipCompanion"]');
    if (cards.length === 0) { skip('no stable companion cards in this build/state'); return; }
    for (const c of Array.from(cards).slice(0, 3)) clickOk(c, 'stable card click'); // SA-013: counted per card
  }),

  // BUG 4 (Paione: "only way I found it was Character → Equipment → Companion →
  // unequip → then Stable"). The Stable nav button + #panel-stable were injected
  // at runtime by TWO competing owners (legacy.js block-32 + companions.js),
  // both guarded on [data-tab="stable"] existence, so whichever ran first won
  // and the legacy one bailed unless a literal 'Homestead' label was present —
  // the button was effectively unreachable, and never existed on mobile at all.
  // Collapsed to ONE owner (companions.js) with FIRST-CLASS STATIC nav entries
  // in index.html: one in the desktop rail, one in the mobile More sheet.
  () => tryRun('BUG4: Stable is a single-owner, first-class nav entry (desktop + mobile)', () => {
    // Single owner in the desktop rail: exactly one, no runtime duplicate.
    const railBtns = document.querySelectorAll('.sidebar [data-tab="stable"]');
    assert(railBtns.length === 1, 'expected exactly ONE Stable button in the rail, found ' + railBtns.length + ' (duplicate injector regression)');
    // Mobile reachability: a route in the More sheet (wired by muster wireMoreSheet).
    const moreBtn = document.querySelector('#more-modal [data-tab="stable"]');
    assert(moreBtn, 'Stable has no route in the mobile More sheet');
    // The panel exists and showTab reveals it (viewport-independent path).
    window.showTab('stable');
    const panel = document.getElementById('panel-stable');
    assert(panel, '#panel-stable missing from DOM');
    assert(panel.classList.contains('active'), 'showTab("stable") did not activate #panel-stable');
    // The mobile route resolves to the same panel: click it, panel stays active.
    window.showTab('profile');
    try { moreBtn.click(); } catch (e) { throw new Error('mobile More Stable button threw: ' + e.message); }
    assert(document.getElementById('panel-stable').classList.contains('active'),
      'mobile More → Stable did not open #panel-stable');
  }),

  // BUG 5 (Tyler): the War Table BROWSE card used to teaser only the top 2 drops
  // (m.drops.slice(0,2)); the full rarity-banded table only appeared once you
  // opened the fight-setup screen. "What do I win" must be answerable while
  // scanning. The full table now renders in the card's hover/focus overlay.
  () => tryRun('BUG5: War Table card carries the FULL drop table (not a 2-drop teaser)', () => {
    const MON = window.MONSTERS || {};
    let mid = null, m = null;
    for (const [k, v] of Object.entries(MON)) {
      if (Array.isArray(v.drops) && v.drops.length > 2) { mid = k; m = v; break; }
    }
    assert(mid, 'test needs a monster with >2 drops');
    const CS = window.HearthriseCombatScreens;
    assert(CS && typeof CS.render === 'function', 'combat screens render seam missing');
    const g = window.G;
    const savedTier = g.currentCombatTier;
    g.currentCombatTier = m.tier || 1;
    window.showTab('combat');
    try {
      CS.render();
      // Defensively clear any class filter left by an earlier test.
      const allChip = document.querySelector('#wt-classes [data-cls="all"]');
      if (allChip) { try { allChip.click(); } catch (e) { /* ignore */ } CS.render(); }
      void document.body.offsetHeight;
      const card = document.querySelector('#wt-grid [data-monster="' + mid + '"]');
      assert(card, 'war table card for ' + mid + ' did not render at tier ' + (m.tier || 1));
      const shown = new Set(Array.from(card.querySelectorAll('.wtc-drop-row[data-drop]'))
        .map((el) => el.getAttribute('data-drop')));
      for (const d of m.drops) {
        assert(shown.has(d.id), 'drop ' + d.id + ' missing from browse card — slice(0,2) teaser regression');
      }
      assert(shown.size >= 3, 'expected the full table (>2 rows), got ' + shown.size);
    } finally {
      g.currentCombatTier = savedTier;
    }
  }),

  // b229 (Asset Director — "pet icons"): the Stable rendered all ~22
  // companions/pets as raw emoji (art-director audit, 2026-08-08) — the
  // widest single 0-emoji-rule violation on one screen. Fixed by bypassing
  // `def.icon` at every render seam (Stable grid, the doll's companion slot,
  // the Character page's companion detail pane, the profile mini-card, the
  // shop's "buy a companion" rows) in favour of `companionIconHtml()`:
  // a painted portrait for the 2 companions with an honest identity match
  // (wolf_pup, hawk) and the shared gilt "paw" atlas glyph for the other 20.
  // Sweep every state a player can reach: nothing owned, everything owned,
  // and each of the 22 equipped in turn (walks both the portrait path and
  // the glyph-fallback path, in both the grid and the doll/detail seams that
  // read the same equipped id) — mirrors the b221/b222/b223 sweep pattern.
  () => tryRun('b229: no emoji in the Stable panel DOM, in any state', () => {
    const EMO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    const offenders = [];
    const sweep = (label, node) => {
      if (!node) return;
      const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let t;
      while ((t = w.nextNode())) if (EMO.test(t.nodeValue)) offenders.push(label + ': ' + t.nodeValue.trim());
    };
    const snap = JSON.stringify(window.G.companions);
    try {
      const allIds = Object.keys(window.COMPANIONS || {});
      assert(allIds.length >= 20, 'expected 20+ companions/pets (12 base + skill/boss pets), got ' + allIds.length);

      window.showTab('stable');

      // All locked (fresh account has none owned but the starter isn't yet granted)
      window.G.companions = { ownedIds: [], xp: {}, equipped: null };
      if (typeof window.renderStable === 'function') window.renderStable();
      sweep('all-locked', document.getElementById('panel-stable'));

      // All owned, none equipped
      window.G.companions = {
        ownedIds: allIds.slice(),
        xp: Object.fromEntries(allIds.map((id) => [id, 500])),
        equipped: null,
      };
      if (typeof window.renderStable === 'function') window.renderStable();
      sweep('all-owned', document.getElementById('panel-stable'));

      // Every companion equipped in turn — the Stable grid, plus the doll's
      // companion slot and Character page detail pane, which read the same
      // G.companions.equipped id through the same companionIconHtml() seam.
      allIds.forEach((id) => {
        window.G.companions.equipped = id;
        if (typeof window.renderStable === 'function') window.renderStable();
        sweep('stable/equipped:' + id, document.getElementById('panel-stable'));
        if (typeof window.buildTibiaDoll === 'function') {
          const doll = window.buildTibiaDoll();
          sweep('doll/equipped:' + id, doll);
        }
      });

      assert(offenders.length === 0, 'emoji in the Stable — ' + offenders.slice(0, 6).join(' | '));
    } finally {
      window.G.companions = JSON.parse(snap);
      if (typeof window.renderStable === 'function') window.renderStable();
    }
  }),

  () => tryRun('clicks: market panel renders + inputs respond', () => {
    window.showTab('market');
    if (typeof window.renderMarket === 'function') window.renderMarket();
    void document.body.offsetHeight;
    // SA-013: the market panel is a core surface — assert it rendered, so this
    // test always executes at least one real assertion (before this it counted
    // nothing unless an input happened to throw).
    assert(document.getElementById('panel-market'), 'market panel did not render');
    const search = document.querySelector('#panel-market input[type="search"], #panel-market input[type="text"]');
    if (search) {
      callOk('market search input', () => {
        search.value = 'log';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    const sortBtns = document.querySelectorAll('#panel-market [data-sort], #panel-market .sort-btn');
    for (const b of Array.from(sortBtns).slice(0, 3)) clickOk(b, 'market sort'); // SA-013: counted per sort
  }),

  () => tryRun('clicks: bug-report 🐛 button opens modal', () => {
    // SA-013: the 🐛 button is guaranteed present (asserted by the "bug-report:
    // entry point rendered" test), so silently skipping when absent hid a real
    // regression. Assert it exists and that clicking it actually OPENS the modal
    // — the behaviour this test's name promises.
    const btn = document.getElementById('hr-bug-btn');
    assert(btn, '🐛 bug-report button not in DOM');
    try { btn.click(); } catch (e) { throw new Error('🐛 button threw: ' + e.message); }
    const modal = document.getElementById('hr-bug-modal');
    assert(modal, 'clicking the 🐛 button did not open #hr-bug-modal');
    if (modal) {
      // b213: close via the real Cancel control. The old querySelector
      // ('button') grabbed the FIRST button — "Send report" — which
      // submitted the empty form and left the modal (plus a browser
      // validation bubble) sitting open after every suite run.
      const closer = modal.querySelector('[data-act="cancel"], [data-close], .close');
      if (closer) try { closer.click(); } catch {}
      const still = document.getElementById('hr-bug-modal');
      if (still) still.remove();
    }
  }),

  () => tryRun('clicks: settings panel opens + tabs switch', () => {
    const btn = document.getElementById('btn-settings');
    if (!btn) { skip('settings button (#btn-settings) absent in this build'); return; }
    clickOk(btn, 'settings open'); // SA-013: counted no-throw assertion
    const settingsTabs = document.querySelectorAll('#panel-settings [data-settings-tab], #settings-modal [data-tab], .settings-tab');
    for (const t of Array.from(settingsTabs).slice(0, 6)) clickOk(t, `settings tab "${t.textContent.trim()}"`); // SA-013: counted per tab
    // Close any modal we may have opened
    document.querySelectorAll('.modal.show, #settings-modal.show').forEach(m => m.classList.remove('show'));
  }),

  // Sanity: after running the entire interactive suite, the page
  // should still be on a real tab + the topbar should still render.
  () => tryRun('clicks: post-suite — page state intact', () => {
    window.showTab('profile');
    void document.body.offsetHeight;
    const top = document.querySelector('.topbar');
    assert(top && top.offsetHeight > 0, 'topbar disappeared after click suite');
    const profile = document.getElementById('panel-profile');
    assert(profile && profile.classList.contains('active'), 'profile panel did not re-activate');
    // b213: re-render the topbar from restored G — the b138 setDisplayName
    // test's 'AAAA…' name stayed painted in the DOM after restoreG put
    // G.playerName back (restore fixes state, not stale renders).
    if (typeof window.updateTopbar === 'function') try { window.updateTopbar(); } catch {}
    if (typeof window.renderProfile === 'function') try { window.renderProfile(); } catch {}
  }),

  // ─────────────────────────────────────────────────────────────
  // PLAYER ACTIONS — end-to-end behavioral tests that exercise
  // the core game loops a player would actually run. Each test
  // saves G state, mutates, runs the action, asserts the expected
  // outcome, then restores. NEVER pollutes the player's save.
  // ─────────────────────────────────────────────────────────────

  /* ── CHARM-1 — BESTIARY CHARMS, PLAYED (phase 1, display only) ─────────────
     Driven through the REAL accrual funnel on the `accrued:false` reply, because
     that is the response a reloading idle player actually gets: a mirror that
     only rode `accrued:true` would be invisible to exactly the player who opens
     the Bestiary after a reload, which is the "forgotten on reload" class. The
     absent-key arm is the fail-safe — no server block must read as rank 0 and
     paint nothing, never as a rank — and the second envelope proves the reveal
     is the CHARM's and not the roster's: void_mote's element is withheld at 3
     kills and printed at 25, which is the whole of `hiddenElement`. Nothing here
     asserts a multiplier: none is wired in this build, by design. */
  () => tryRunAsync('CHARM-1: 25 class kills earn Studied off the idle envelope — badge, next threshold, hidden element revealed, absent key ⇒ rank 0', async () => {
    const G = window.G, C = window.HearthriseCharms, A = window.HearthriseAccrual;
    assert(C && typeof C.noteEnvelope === 'function' && typeof window.hrNoteServerBestiary === 'function', 'CONTROL: the charm seam is unpublished (HearthriseCharms / hrNoteServerBestiary) — the feature has no client half');
    const snap = snapshotG(); const realFetch = window.fetch; const prevCharms = G._bestiaryCharms;
    const chips = () => (document.getElementById('best-charms') || {}).innerHTML || '';
    const listHtml = () => (document.getElementById('best-list') || {}).innerHTML || '';
    const envOf = (bestiary) => ({ ok: true, accrued: false, reason: 'idle', version: 3, now: new Date().toISOString(), ...(bestiary ? { bestiary } : {}) });
    const drive = async (bestiary) => {
      window.fetch = (u, init) => (/hr-accrue/.test(String(u))
        ? Promise.resolve(new Response(JSON.stringify(envOf(bestiary)), { status: 200 }))
        : realFetch.call(window, u, init));
      A.resetAccrualGate(); A.configureAccrual({ url: 'https://proj.supabase.co', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      return A.requestAccrual({ force: true });
    };
    try {
      /* ARM 1 — NO SERVER BLOCK. Fail-safe: rank 0 and nothing painted. */
      delete G._bestiaryCharms;
      const none = await drive(null);
      assert(none && none.outcome === 'nothing', 'the idle envelope classified as ' + (none && none.outcome) + ', not "nothing" — the arm below is not testing the boot path');
      assert(C.noteEnvelope({ ok: true }).reason === 'no_key' && C.rankOfClass('vermin') === 0 && C.badgeHtml('vermin') === '', 'an envelope with no bestiary block produced a rank — the fail-safe must be "not studied", never a charm the server does not believe in');
      G.bestiary = { rat: { kills: 9 }, void_mote: { kills: 2 } };
      window.openBestiary();
      assert(!/charm-chip/.test(chips()) && /charm-empty/.test(chips()) && !/charm-element/.test(listHtml()), 'the strip painted a chip or an element line with no server counters: ' + chips().slice(0, 120));
      /* ARM 2 — THE COUNTERS ARRIVE ON THE IDLE REPLY. */
      const got = await drive({ kills_by_class: { vermin: 25, extra_dimensional: 3, not_a_class: 500, constructor: 7 } });
      assert(got && got.outcome === 'nothing' && G._bestiaryCharms && G._bestiaryCharms.killsByClass.vermin === 25, 'the idle envelope did not mirror the counters into G._bestiaryCharms: ' + JSON.stringify(G._bestiaryCharms));
      assert(!('not_a_class' in G._bestiaryCharms.killsByClass) && Object.keys(G._bestiaryCharms.killsByClass).length === 2, 'a key outside the eleven-class taxonomy survived the mirror — a hostile block could put a junk class on screen: ' + Object.keys(G._bestiaryCharms.killsByClass).join(','));
      assert(C.rankOfClass('vermin') === 1 && C.rankOfClass('extra_dimensional') === 0, 'vermin 25 kills read rank ' + C.rankOfClass('vermin') + ' and extra_dimensional 3 kills read rank ' + C.rankOfClass('extra_dimensional') + ' — the first rung is 25 and nothing below it ranks');
      const nx = C.nextOfClass('vermin');
      assert(nx && nx.at === 100 && nx.remaining === 75, 'the next threshold said ' + JSON.stringify(nx) + ' — it must name the next rung and the kills left, derived, never stored');
      window.openBestiary();
      assert(/charm-chip/.test(chips()) && /Vermin/.test(chips()) && /Studied/.test(chips()) && /Next charm at 100/.test(chips()), 'the Vermin chip did not paint its badge and threshold: ' + chips().slice(0, 240));
      assert(/charm-element/.test(listHtml()) && /weak to frost/.test(listHtml()), 'a Studied class did not print its element weakness — that reveal IS rank 1\'s reward');
      assert(!/ember/.test(listHtml()), 'void_mote\'s hidden element printed at 3 kills — hiddenElement must stay hidden until the class is Studied');
      /* ARM 3 — THE HIDDEN ELEMENT, REVEALED BY THE CHARM AND NOTHING ELSE. */
      await drive({ kills_by_class: { vermin: 2000, extra_dimensional: 25 } });
      assert(C.rankOfClass('vermin') === 4 && C.rankOfClass('extra_dimensional') === 1, 'the ladder top read ' + C.rankOfClass('vermin') + ' at 2000 kills');
      window.openBestiary();
      assert(/Banesworn/.test(chips()) && /Ladder complete/.test(chips()), 'the top rung did not paint as complete: ' + chips().slice(0, 240));
      assert(/weak to ember/.test(listHtml()), 'void_mote\'s element stayed hidden at 25 kills — the charm is the only door there is');
    } finally {
      window.fetch = realFetch;
      try { A.resetAccrualGate(); A.configureAccrual(null); } catch (e) {}
      const ov = document.getElementById('best-overlay'); if (ov) ov.classList.remove('show');
      if (prevCharms === undefined) delete G._bestiaryCharms; else G._bestiaryCharms = prevCharms;
      restoreG(snap);
    }
  }),

  /* ── CHARM-2 — THE CHARM PAYS, AND ONLY THE SERVER'S COUNTERS BUY IT ───────
     Phase 2 armed the ladder's DROP multiplier inside `weaknessInfo` — the one
     expression the live tick, the loot preview and the Edge away replay all call.
     Played through the real accrual funnel, three properties:
       1. THE SERVER'S COUNTERS RAISE THE DROP RATE, by the ladder's own factor
          (read from CHARM_RANKS, never retyped) against a monster of that class.
       2. THE LOCAL RESIDUE BUYS NOTHING. `G.bestiary` is a residue field the
          killMonster wrapper increments locally, so it can run AHEAD of the
          server; a charm read off it is the residue-ahead class verbatim
          (CLAUDE.md §6) and — now the multiplier is real — a drop rate the away
          replay would refuse to pay. 99,999 local kills must buy nothing.
       3. ONE ANSWER, NOT TWO: `getPlayerCombatRolls(m).weak.dropMult` (the fight
          screen) and `getWeaknessInfo(m).dropMult` (the loot preview) agree — two
          callers of one expression, the charm threaded through `combatCtx`.
     Rank 1 pays NOTHING: the first rung is the element reveal, and paying power
     for it would make the first 25 kills of every class mandatory. */
  () => tryRunAsync('CHARM-2: the server\u2019s class kills raise the predicted drop rate; the local bestiary residue cannot', async () => {
    const G = window.G, A = window.HearthriseAccrual, C = window.HearthriseCharms;
    assert(typeof window.getWeaknessInfo === 'function' && C && typeof C.indexForCombat === 'function',
      'CONTROL: getWeaknessInfo / HearthriseCharms.indexForCombat is unpublished \u2014 the charm has no client seam');
    const TOP = CHARM_RANKS[CHARM_RANKS.length - 1];
    const FIRST = CHARM_RANKS[0];
    const M = window.MONSTERS || {};
    const fx = hrCharmFixture(); const id = fx.id; const cls = fx.cls;
    assert(id && cls, 'CONTROL: no roster monster resolved a class and a rollable drop row');
    const snap = snapshotG(); const prevCharms = G._bestiaryCharms;
    const rig = hrCharmDriver(); const drive = (b) => rig.drive(b);
    const dropOf = () => window.getWeaknessInfo(M[id]).dropMult;
    try {
      /* ARM 1 — NO SERVER BLOCK, A HUGE LOCAL RESIDUE. The base rate, exactly. */
      delete G._bestiaryCharms;
      G.bestiary = { [id]: { kills: 99999 } };
      await drive(null);
      const base = dropOf();
      assert(C.indexForCombat() === null, 'the client built a charm index with no server counters \u2014 the fail-safe is "no charm", never a rank the server does not believe in');
      const mDrop = Number(M[id].dropBonus);
      const expectBase = (Number.isFinite(mDrop) && mDrop > 0) ? mDrop : 1;
      assert(Math.abs(base - expectBase) < 1e-9,
        'with no server counters ' + id + ' predicted dropMult ' + base + ', not the monster\u2019s own ' + expectBase
        + ' \u2014 99,999 LOCAL kills bought a charm, which is the residue-ahead class and a drop rate the server would refuse to pay');
      /* ARM 2 — THE FIRST RUNG IS THE REVEAL, NOT POWER. */
      await drive({ kills_by_class: { [cls]: FIRST.at } });
      assert(C.rankOfClass(cls) === FIRST.rank && Math.abs(dropOf() - base) < 1e-9,
        'rank ' + FIRST.rank + ' moved the drop rate to ' + dropOf() + ' (base ' + base + ') \u2014 the first rung is the element reveal; paying power for it makes the first '
        + FIRST.at + ' kills of every class mandatory');
      /* ARM 3 — THE TOP RUNG PAYS THE LADDER’S OWN NUMBER, AND ONE ANSWER ONLY. */
      await drive({ kills_by_class: { [cls]: TOP.at } });
      assert(C.rankOfClass(cls) === TOP.rank, 'the top rung read rank ' + C.rankOfClass(cls) + ' at ' + TOP.at + ' server kills');
      const charmed = dropOf();
      assert(Math.abs(charmed - base * TOP.drop) < 1e-9,
        'a rank-' + TOP.rank + ' charm predicted dropMult ' + charmed + ', expected ' + (base * TOP.drop)
        + ' (the ladder\u2019s own ' + TOP.drop + ' x the monster\u2019s ' + base + ')');
      const rolls = window.getPlayerCombatRolls(M[id]);
      assert(rolls && rolls.weak && Math.abs(rolls.weak.dropMult - charmed) < 1e-9,
        'the fight screen quoted dropMult ' + (rolls && rolls.weak && rolls.weak.dropMult) + ' while the loot preview quoted ' + charmed
        + ' \u2014 two callers of one expression must not answer twice; the charm rides combatCtx for exactly this reason');
      assert(rolls.weak.damageMult === window.getWeaknessInfo(M[id]).damageMult,
        'the charm moved damageMult \u2014 phase 3 is not armed (floor(maxHit x 1.01) is maxHit, so it would be a stated effect that does nothing)');
    } finally {
      rig.restore();
      if (prevCharms === undefined) delete G._bestiaryCharms; else G._bestiaryCharms = prevCharms;
      restoreG(snap);
    }
  }),

  /* ── CHARM-3 — THE AWAY CARD NAMES THE CHARM THAT PAID ────────────────
     Security review 2026-09-13 item 6: a paid multiplier that no receipt names is
     one the player has to take on trust. Both directions, the b326 standard — the
     line appears when the server's receipt carries the fields and is ABSENT when
     it does not, because a card that invents a bonus is the same lie reversed.
     The wire is asserted first: a card cannot name what the reader dropped. */
  () => tryRun('CHARM-3: the welcome-back card names the bestiary charm the night was priced with, and nothing when none was', () => {
    const G = window.G, A = window.HearthriseAccrual, C = window.HearthriseCharms;
    const H = window.HearthriseHome;
    assert(C && typeof C.awayLine === 'function' && H && typeof H.render === 'function',
      'CONTROL: HearthriseCharms.awayLine / HearthriseHome is unpublished');
    const TOP = CHARM_RANKS[CHARM_RANKS.length - 1];
    const cls = hrCharmFixture().cls;
    assert(cls, 'CONTROL: no roster monster resolved a class');
    const prevSummary = G.lastOfflineSummary; const prevTab = window.activeTab;
    const AWAY = { hrs: 8.2, awayMs: 8.2 * 3600000, gainedItems: 38, gainedXp: 12408, gainedGold: 5121,
      gainedKills: 142, crits: 21, at: Date.now(), featuredMs: 0, featuredDropMult: 1, rateMult: 1.0 };
    const band = () => { H.render(); const b = document.getElementById('hd-root').querySelector('.hd-awayband'); return b ? b.textContent.replace(/\s+/g, ' ') : ''; };
    try {
      window.showTab('profile');
      const rec = A.summaryFromAway({ grantMs: 1, awayMs: 1, kills: 3,
        charmClass: cls, charmRank: TOP.rank, charmDropMult: TOP.drop }, { version: 9 });
      assert(rec.charmClass === cls && rec.charmRank === TOP.rank && rec.charmDropMult === TOP.drop,
        'summaryFromAway dropped the charm receipt: ' + JSON.stringify([rec.charmClass, rec.charmRank, rec.charmDropMult]));
      G.lastOfflineSummary = Object.assign({}, AWAY, { charmClass: cls, charmRank: TOP.rank, charmDropMult: TOP.drop });
      const withText = band(); const label = C.classLabel(cls);
      assert(new RegExp(label + ' charm').test(withText) && /Banesworn/.test(withText)
        && new RegExp('\\+' + Math.round((TOP.drop - 1) * 100) + '% drops').test(withText),
        'the band did not name the charm class, its rank and what it paid: ' + withText);
      G.lastOfflineSummary = Object.assign({}, AWAY, { at: Date.now() });
      const without = band();
      assert(!/charm/i.test(without), 'the band printed a charm line for a receipt carrying none: ' + without);
    } finally {
      G.lastOfflineSummary = prevSummary;
      try { H.render(); } catch (e) {}
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  /* ── CHARM-4 — THE LOOT MODAL ATTRIBUTES THE LIFT IT PRINTS ─────────────
     The modal credited the WHOLE of `dropMult` to the matchup ("fears no weapon,
     and an even matchup pays 15% better") — a sentence that became untrue the
     moment a charm could contribute to that product. A panel that misattributes a
     bonus teaches the player the wrong thing about their own build, so the
     product is split into its two factors and each is named. */
  () => tryRunAsync('CHARM-4: the loot modal names the charm that lifted the rates it prints, and only the matchup when there is none', async () => {
    const G = window.G, C = window.HearthriseCharms, HUD = window.HearthriseCombatHud;
    assert(C && HUD && typeof HUD.openLoot === 'function', 'CONTROL: HearthriseCombatHud is unpublished');
    const TOP = CHARM_RANKS[CHARM_RANKS.length - 1];
    const fx = hrCharmFixture(); const rig = hrCharmDriver();
    assert(fx.id && fx.cls, 'CONTROL: no roster monster resolved a class and a rollable drop row');
    const snap = snapshotG(); const prevCharms = G._bestiaryCharms; const prevTab = window.activeTab;
    const modalText = () => (document.querySelector('.hr-room-scrim[data-combat-hud]') || {}).textContent || '';
    try {
      window.showTab('combat');
      G.activeMonster = fx.id; G.monsterHp = fx.m.hp; G.monsterMaxHp = fx.m.hp;
      G.playerMaxHp = 100000; G.playerHp = G.playerMaxHp;
      delete G._bestiaryCharms;
      await rig.drive(null);
      assert(HUD.openLoot(), 'the loot modal did not open');
      const plain = modalText();
      assert(!/charm/i.test(plain), 'the loot modal named a charm for an unstudied class: ' + plain.slice(0, 200));
      HUD.close();
      await rig.drive({ kills_by_class: { [fx.cls]: TOP.at } });
      assert(HUD.openLoot(), 'the loot modal did not reopen');
      const charmed = modalText(); const label = C.classLabel(fx.cls);
      assert(new RegExp(label + ' charm').test(charmed),
        'the modal did not name the charm that lifted the rates it prints: ' + charmed.slice(0, 300));
      assert(new RegExp('adds ' + Math.round((TOP.drop - 1) * 100) + '%').test(charmed),
        'the modal did not state what the charm adds: ' + charmed.slice(0, 300));
    } finally {
      rig.restore();
      try { HUD.close(); } catch (e) {}
      if (prevCharms === undefined) delete G._bestiaryCharms; else G._bestiaryCharms = prevCharms;
      restoreG(snap);
      try { window.showTab(prevTab || 'combat'); } catch (e) {}
    }
  }),

  /* ── CHARM-5 — THE FOE PANEL NAMES THE RANK IT IS FIGHTING UNDER ────────
     Security review 2026-09-13 item 6, second half: the charm's lift vanishes
     into `weaknessInfo().dropMult`, so the Fight screen showed a bigger number
     and never said why. The foe line now states the class, the RUNG and what it
     pays. Both directions, the b326 standard — absent on an unstudied class,
     because a panel that invents a rank is the same lie reversed.
     MUTATION PROVEN: drop `charmRank` from the readout in src/core/combat.js, or
     the `panelLine` call from renderFight, and the studied arm goes red. */
  () => tryRunAsync('CHARM-5: the Fight screen foe line names the bestiary charm rank it is fighting under, and nothing when the class is unstudied', async () => {
    const G = window.G, C = window.HearthriseCharms, CS = window.HearthriseCombatScreens;
    assert(C && typeof C.panelLine === 'function' && CS && typeof CS.renderFight === 'function',
      'CONTROL: HearthriseCharms.panelLine / HearthriseCombatScreens.renderFight is unpublished');
    const TOP = CHARM_RANKS[CHARM_RANKS.length - 1];
    const fx = hrCharmFixture(); const rig = hrCharmDriver();
    assert(fx.id && fx.cls, 'CONTROL: no roster monster resolved a class and a rollable drop row');
    const snap = snapshotG(); const prevCharms = G._bestiaryCharms; const prevTab = window.activeTab;
    const line = () => { CS.renderFight(); const el = document.getElementById('fs-weak'); return el ? el.textContent.replace(/\s+/g, ' ') : ''; };
    try {
      window.showTab('combat');
      G.activeMonster = fx.id; G.monsterHp = fx.m.hp; G.monsterMaxHp = fx.m.hp;
      G.playerMaxHp = 100000; G.playerHp = G.playerMaxHp;
      delete G._bestiaryCharms;
      await rig.drive(null);
      const plain = line();
      assert(/Weak to/.test(plain), 'CONTROL: the foe line did not render at all: ' + plain);
      assert(!/charm/i.test(plain), 'the foe line named a charm for an unstudied class: ' + plain);
      await rig.drive({ kills_by_class: { [fx.cls]: TOP.at } });
      const charmed = line(); const label = C.classLabel(fx.cls);
      assert(new RegExp('Charm: ' + label + ' rank ' + TOP.rank).test(charmed),
        'the foe line did not name the charm class and the RANK it is fighting under: ' + charmed);
      assert(new RegExp('[+]' + Math.round((TOP.drop - 1) * 100) + '% drops').test(charmed),
        'the foe line did not state what the rung pays: ' + charmed);
    } finally {
      rig.restore();
      if (prevCharms === undefined) delete G._bestiaryCharms; else G._bestiaryCharms = prevCharms;
      restoreG(snap);
      try { CS.renderFight(); } catch (e) {}
      try { window.showTab(prevTab || 'combat'); } catch (e) {}
    }
  }),

  /* ── TROPHY-1..3 — THE BESTIARY TROPHY LADDER, PLAYED ────────────────────
     docs/design/BESTIARY_LADDER.md. The LONG ladder: 2,500 kills against ONE
     monster earns Quarry, and the trophy ROW is claimed while the power is
     DERIVED and already on. Three registered tests because these are three
     properties, and they share `hrCharmDriver` — the same idle-envelope funnel
     the charm battery above rides, which is the response a RELOADING player
     actually gets. No multiplier is asserted here: that half is proven headless
     against the real RPC in tests/bestiary-trophy.mjs. */
  () => tryRunAsync('TROPHY-1: the server’s per-monster kills earn Quarry and paint the ladder; 99,999 LOCAL kills earn nothing', async () => {
    const G = window.G, T = window.HearthriseTrophies;
    assert(T && typeof T.noteEnvelope === 'function' && typeof window.hrNoteServerTrophies === 'function',
      'CONTROL: the trophy seam is unpublished (HearthriseTrophies / hrNoteServerTrophies) — the feature has no client half');
    const snap = snapshotG(); const rig = hrCharmDriver(); const prev = G._bestiaryTrophies;
    const listHtml = () => (document.getElementById('best-list') || {}).innerHTML || '';
    try {
      /* ARM 1 — NO SERVER BLOCK, AND A LOUD LOCAL RESIDUE. `G.bestiary` is the
         client-written map the row's `×` has always come from and it can run
         AHEAD of the server; a claim gated on it is the residue-ahead class
         (CLAUDE.md §6) and on this surface it is the exact "browser says one
         thing, server says another" report Tyler called a P1 class-kill. */
      delete G._bestiaryTrophies;
      G.bestiary = { goblin: { kills: 99999 } };
      const none = await rig.drive(null);
      assert(none && none.outcome === 'nothing', 'the idle envelope classified as ' + (none && none.outcome) + ', not "nothing"');
      assert(T.noteEnvelope({ ok: true }).reason === 'no_key' && T.stageOfMonster('goblin') === 0
        && T.badgeHtml('goblin') === '' && T.claimButtonHtml('goblin') === '',
        'an envelope with no bestiary block produced a stage off 99,999 LOCAL kills — the residue must buy nothing');
      window.openBestiary();
      assert(!/trophy-claim/.test(listHtml()), 'a Claim button painted with no server counters: ' + listHtml().slice(0, 200));
      /* ARM 2 — THE COUNTERS ARRIVE, AND THE LADDER PAINTS FROM THEM. */
      const got = await rig.drive({ kills_by_class: {}, kills_by_monster: { goblin: 2500, slime: 12, not_a_monster: 99999 }, trophies: [] });
      assert(got && got.outcome === 'nothing' && G._bestiaryTrophies && G._bestiaryTrophies.killsByMonster.goblin === 2500,
        'the idle envelope did not mirror the per-monster counters: ' + JSON.stringify(G._bestiaryTrophies && G._bestiaryTrophies.killsByMonster));
      assert(!('not_a_monster' in G._bestiaryTrophies.killsByMonster),
        'an id outside the roster survived the mirror — a hostile block could put a junk monster on screen');
      assert(T.stageOfMonster('goblin') === 1 && T.stageOfMonster('slime') === 0,
        'goblin at 2,500 read stage ' + T.stageOfMonster('goblin') + ' and slime at 12 read ' + T.stageOfMonster('slime') + ' — the first rung is 2,500');
      const nx = T.nextOfMonster('goblin');
      assert(nx && nx.row.at === 5000 && nx.remaining === 2500,
        'the next threshold said ' + JSON.stringify(nx && { at: nx.row.at, r: nx.remaining }) + ' — it must name the next rung and the kills left, derived, never stored');
      window.openBestiary();
      assert(/trophy-badge/.test(listHtml()) && /Quarry/.test(listHtml()) && /2,500 more to Stalker/.test(listHtml()),
        'the goblin row did not paint its badge and the number a player can act on: ' + listHtml().slice(0, 300));
    } finally {
      rig.restore();
      const ov = document.getElementById('best-overlay'); if (ov) ov.classList.remove('show');
      if (prev === undefined) delete G._bestiaryTrophies; else G._bestiaryTrophies = prev;
      restoreG(snap);
    }
  }),

  /* THE CLAIMED SET IS THE SERVER'S ROWS, never a local flag set on success.
     Reaching a rung is what pays the derived drop bonus; CLAIMING it is the
     gesture and the collection row, and the button must read the second. */
  () => tryRunAsync('TROPHY-2: a trophy the SERVER lists as claimed offers no button; one it does not, does', async () => {
    const G = window.G, T = window.HearthriseTrophies;
    const snap = snapshotG(); const rig = hrCharmDriver(); const prev = G._bestiaryTrophies;
    const listHtml = () => (document.getElementById('best-list') || {}).innerHTML || '';
    try {
      await rig.drive({ kills_by_class: {}, kills_by_monster: { goblin: 2500 }, trophies: [] });
      assert(T.isClaimable('goblin', 1) === true && T.isClaimed('goblin', 1) === false,
        'a reached, unclaimed trophy did not read claimable');
      window.openBestiary();
      assert(/trophy-claim/.test(listHtml()) && /Claim Quarry/.test(listHtml()), 'no Claim button on a reached, unclaimed trophy');
      await rig.drive({ kills_by_class: {}, kills_by_monster: { goblin: 2500 }, trophies: [{ monster: 'goblin', stage: 1 }] });
      assert(T.isClaimed('goblin', 1) === true && T.isClaimable('goblin', 1) === false,
        'the server listed the trophy as claimed and the client still offered it');
      window.openBestiary();
      assert(!/trophy-claim/.test(listHtml()) && /is-claimed/.test(listHtml()),
        'a claimed trophy still painted a Claim button: ' + listHtml().slice(0, 300));
    } finally {
      rig.restore();
      const ov = document.getElementById('best-overlay'); if (ov) ov.classList.remove('show');
      if (prev === undefined) delete G._bestiaryTrophies; else G._bestiaryTrophies = prev;
      restoreG(snap);
    }
  }),

  /* THE WIRE AND THE REFUSAL. Two names and no kill count may cross — the field
     a future caller adds by accident is the field that turns a NAME into a
     VALUE — and a `not_yet` (what a client whose count ran ahead gets) must
     repaint from the envelope riding it rather than leave its own number up. */
  () => tryRunAsync('TROPHY-3: the claim sends two names and no count, and a not_yet puts the client’s own number back', async () => {
    const G = window.G, T = window.HearthriseTrophies, TC = window.HearthriseTrophyClaim;
    assert(TC && typeof TC.sendTrophyClaim === 'function' && typeof window.hrClaimTrophy === 'function',
      'CONTROL: the trophy claim transport or its modal handler is unpublished');
    const snap = snapshotG(); const realFetch = window.fetch; const prev = G._bestiaryTrophies;
    const prevCfg = TC.getTrophyClaimConfig(); let sent = null;
    try {
      const body = JSON.parse(TC.buildTrophyClaimRequest({ url: 'https://proj.supabase.co', apiKey: 'anon-key',
        token: 'jwt', slot: 0, intentId: '11111111-1111-4111-8111-111111111111', monster: 'goblin', stage: 2 }).init.body);
      assert(Object.keys(body).sort().join(',') === 'intentId,slot,trophy,verb',
        'the claim carries ' + Object.keys(body).join(',') + ' — exactly {verb,slot,intentId,trophy} may cross');
      assert(Object.keys(body.trophy).sort().join(',') === 'monster,stage',
        'the trophy object carries ' + Object.keys(body.trophy).join(',') + ' — a kill count here is a number the server would have to disbelieve');
      assert(body.verb === 'trophy_claim' && body.trophy.monster === 'goblin' && body.trophy.stage === 2,
        'the claim did not name the trophy it was asked for: ' + JSON.stringify(body));
      window.hrNoteServerTrophies({ ok: true, bestiary: { kills_by_class: {}, kills_by_monster: { goblin: 2500 }, trophies: [] } });
      window.fetch = (u, init) => {
        if (!/hr-accrue/.test(String(u))) return realFetch.call(window, u, init);
        sent = JSON.parse(init.body);
        return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'not_yet', verb: 'trophy_claim',
          version: 4, now: new Date().toISOString(), state: { gold: G.gold }, detail: { have: 2400, need: 2500 },
          bestiary: { kills_by_class: {}, kills_by_monster: { goblin: 2400 }, trophies: [] } }), { status: 409 }));
      };
      TC.configureTrophyClaim({ url: 'https://proj.supabase.co', apiKey: 'anon-key', authToken: () => 'jwt' });
      const verdict = await window.hrClaimTrophy('goblin', 1);
      assert(sent && sent.verb === 'trophy_claim' && sent.trophy.monster === 'goblin',
        'the Claim button did not send a trophy_claim intent: ' + JSON.stringify(sent));
      assert(verdict && verdict.outcome === 'refused' && verdict.reason === 'not_yet',
        'a not_yet answer classified as ' + JSON.stringify(verdict && { o: verdict.outcome, r: verdict.reason }));
      assert(TC.refusalCopyFor(verdict).length > 0,
        'a not_yet produced no sentence — the panel just said the trophy was ready, and silence there is the whole complaint');
      window.hrNoteServerTrophies({ ok: true, bestiary: { kills_by_class: {}, kills_by_monster: { goblin: 2400 }, trophies: [] } });
      assert(T.killsOfMonster('goblin') === 2400 && T.stageOfMonster('goblin') === 0 && T.isClaimable('goblin', 1) === false,
        'after a not_yet the client still showed its own count — the envelope on a refusal is how a client that ran ahead is put back');
    } finally {
      window.fetch = realFetch;
      try { TC.configureTrophyClaim(prevCfg); } catch (e) {}
      const ov = document.getElementById('best-overlay'); if (ov) ov.classList.remove('show');
      if (prev === undefined) delete G._bestiaryTrophies; else G._bestiaryTrophies = prev;
      restoreG(snap);
    }
  }),

  /* ── BANK-1 — THE DEPOT, PLAYED ─────────────────────────────────────────────
     The server's bank store shipped b438 and sat dormant for a hundred builds
     because nothing could call it: the flyout's "→ Bank" button was guarded on a
     `bankItem` function that was never defined anywhere in the repo. So the
     happy path here is the whole feature — and the one property worth pinning is
     that the client does NOT compute the new contents. The RPC answers `qty 3`
     and the ENVELOPE that follows disagrees on purpose (99 in the vault, 1 in the
     bag): a client doing `bank[id] + 3` / `bag[id] - 3` would paint 3 and 2, and
     both numbers would be fiction the moment the server clamped, replayed an
     idem or settled a concurrent fight. The wire is asserted field-by-field for
     the same reason the sell-lock asserts the wire: a sixth field is a value the
     player's device authored about a container it does not own. */
  () => tryRunAsync('BANK-1: the Depot stores through hr_bank_move — five fields on the wire, the count from the envelope, a refusal in words', async () => {
    const G = window.G, D = window.HearthriseDepot, BS = window.HearthriseBankSync, A = window.HearthriseAccrual, E = window.HearthriseEquip;
    assert(D && typeof D.move === 'function' && BS && typeof BS.bankMoveBody === 'function', 'CONTROL: the Depot seam is unpublished (HearthriseDepot/HearthriseBankSync) — the feature has no client half');
    const body = BS.bankMoveBody(2, 'normal_log', 7, 'deposit', 'IDEM-1'); assert(Object.keys(body).sort().join(',') === 'p_dir,p_idem,p_item,p_qty,p_slot', 'the intent carries ' + Object.keys(body).join(',') + ' — exactly {slot,item,qty,dir,idem} may cross, nothing else');
    const snap = snapshotG(); const realFetch = window.fetch; const prevEquip = E.getEquipConfig();
    const reply = (b) => Promise.resolve(new Response(JSON.stringify(b), { status: 200 }));
    let rpc = [], answer = { ok: true, item: 'normal_log', qty: 3, direction: 'deposit', version: 9 };
    const env = { ok: true, accrued: true, version: 9, now: new Date().toISOString(), state: { gold: G.gold, bank_cap: 123 }, skills: {}, equipment: {}, inventory_complete: true, inventory: { normal_log: 1 }, bank: { normal_log: 99 }, away: { minutes: 0, kind: 'idle' } };
    try {
      await armEquipFlipForTest(E); A.noteBaselineComplete({ inventory_complete: true }); A.markInventoryAuthorityLive(true);
      assert(A.isInventoryAbsolute() === true, 'the bag/vault fold is not absolute on this client, so no envelope could paint the Depot');
      window.fetch = (u, init) => (/rpc\/hr_bank_move/.test(String(u))
        ? (rpc.push(JSON.parse((init && init.body) || 'null')), reply(answer))
        : /hr-accrue/.test(String(u)) ? reply(env) : realFetch.call(window, u, init));
      A.resetAccrualGate(); A.configureAccrual({ url: 'https://proj.supabase.co', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 }); G.inventory = { normal_log: 5 }; G.bank = { goldBuys: 1 }; delete G._bankCap;
      assert(/HearthriseDepot.open/.test(D.toolbarButtonHtml()) && /normal_log',5,'deposit'/.test(D.flyoutButtonHtml('normal_log', 5)) && D.flyoutButtonHtml('normal_log', 0) === '', 'the two doors into the Depot (the Inventory toolbar and the item flyout) do not both produce a working control — a bank nothing can reach is what shipped for a hundred builds');
      await D.move('normal_log', 3, 'deposit'); assert(rpc.length === 1, 'the Store gesture put ' + rpc.length + ' intents on the wire, not one');
      assert(rpc[0].p_item === 'normal_log' && rpc[0].p_qty === 3 && rpc[0].p_dir === 'deposit', 'the intent said ' + JSON.stringify(rpc[0]) + ' — item/qty/direction are the gesture\'s');
      assert(/^[0-9a-f-]{36}$/i.test(String(rpc[0].p_idem)), 'the intent carried no idempotency uuid (' + rpc[0].p_idem + ') — a retried Store would move the stack twice');
      assert(G.bank.normal_log === 99, 'the vault shows ' + G.bank.normal_log + ', not the envelope\'s 99 — the client computed the new contents instead of rendering the realm\'s');
      assert(G.inventory.normal_log !== 2, 'the bag shows 2 — the client subtracted the qty locally instead of taking the envelope\'s number');
      assert(G.bank.goldBuys === 1, 'the fold ate the bank-SPACE counter (goldBuys) — purchased rungs are not stacks');
      assert(window.bankCap() === 123, 'the capacity mirror reads ' + window.bankCap() + ', not the envelope\'s bank_cap 123');
      const cap = D.bagCapacityLine(D.bankPanelView(G, {})); assert(/\/ 123 slots$/.test(cap), 'the Depot\'s capacity line reads "' + cap + '" — it must quote the mirrored cap, not a client sum');
      rpc = []; answer = { ok: false, error: 'insufficient_bank', have: 0, item_id: 'normal_log' };
      const refused = await D.move('normal_log', 4, 'withdraw'); assert(refused && refused.ok === false && rpc.length === 1 && rpc[0].p_dir === 'withdraw', 'the Take gesture did not reach the server as a withdraw: ' + JSON.stringify(rpc));
      assert(G.bank.normal_log === 99 && G.inventory.normal_log !== 5 + 4, 'a REFUSED withdraw moved something anyway — bank ' + G.bank.normal_log + ', bag ' + G.inventory.normal_log);
      const why = BS.bankMoveRefusalText(refused, { itemName: 'Log' }); assert(/Depot does not hold/.test(why), 'the refusal rendered "' + why + '" — every hr_bank_move code must name what it was and what clears it');
    } finally {
      window.fetch = realFetch;
      try { A.markInventoryAuthorityLive(false); A.resetAccrualGate(); A.configureAccrual(null); } catch (e) {}
      E.resetEquip(); if (prevEquip) E.configureEquip(prevEquip); restoreG(snap);
    }
  }),

  /* ── regression suite — DEPOT-2: THE DEPOT, PLAYED UNARMED ──────────────────
     THE LIVE P1. The release note said "The Depot opens". On live it did not: the
     panel read "The realm has not sent your Depot yet — reload if this persists"
     with 0 stacks over an envelope that carried `bank: {}` on EVERY settle, and
     pressing Store sent one hr_bank_move → 200 after which the bag still showed
     876 Bones, the Depot column still showed nothing, and no message appeared at
     all. Root cause: `reconcileBank` was gated on the BAG's absolute arm
     (isInventoryAbsolute(), false in prod), so the fold answered 'dormant'
     forever; the bag's merge `Math.max` then refused to let the deposited stack
     leave; and the panel's re-entrancy fuse returned silently.

     THIS TEST IS BANK-1 WITH THE ARM OFF, which is the only configuration a real
     player has ever run. It plays the gesture through the REAL delegated click
     listener on the REAL panel — the press, not the function — because the press
     is what did nothing. Everything it asserts is the SERVER's: `bank: {}` means
     an EMPTY Depot (a claim only the realm can make, and it makes it), and the
     figures after the move are the second envelope's, never this device's. */
  () => tryRunAsync('DEPOT-2 (b545): with the bag arm OFF the Depot still folds, a pressed Store posts once and lands, and a refusal says why', async () => {
    const G = window.G, D = window.HearthriseDepot, BS = window.HearthriseBankSync, A = window.HearthriseAccrual;
    assert(D && typeof D.open === 'function' && BS && typeof BS.bankMoveSettled === 'function' && A
      && typeof A.reconcileBank === 'function' && typeof A.__resetBankFoldMode === 'function',
      'CONTROL: the Depot seam is unpublished (HearthriseDepot/HearthriseBankSync/reconcileBank) — the feature has no client half');
    const ID = window.ITEMS && window.ITEMS.bones ? 'bones'
      : Object.keys(window.ITEMS || {}).find((k) => window.ITEMS[k] && window.ITEMS[k].n);
    assert(!!ID, 'CONTROL: no nameable item in the catalogue, so no Depot row can be drawn');
    const NAME = window.ITEMS[ID].n;
    const snap = snapshotG(); const realFetch = window.fetch; const realNotify = window.notify;
    const said = [];
    let rpc = [], answer = { ok: true, item: ID, qty: 10, direction: 'deposit', version: 9 };
    /* THE TWO ENVELOPES: before the move the realm holds nothing and the player
       carries 876; after it the realm holds 10 and the bag is 866. Both carry
       `inventory_complete: false` on purpose — the Depot must not wait for the
       bag's completeness flag any more than for its arm. */
    let env = { ok: true, accrued: true, version: 9, now: new Date().toISOString(), state: { gold: G.gold },
      skills: {}, equipment: {}, inventory_complete: false, inventory: { [ID]: 876 }, bank: {}, away: { minutes: 0, kind: 'idle' } };
    const reply = (b) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const view = () => D.bankPanelView(G, {});
    const bodyText = () => {
      const el = document.getElementById('bank-panel-overlay');
      return el ? (el.textContent || '').replace(/\s+/g, ' ') : '';
    };
    const press = async (qty) => {
      const el = document.querySelector('#bank-panel-overlay [data-bank-move="deposit"][data-bank-qty="' + qty + '"]');
      assert(!!el, 'no enabled Store ×' + qty + ' control on the ' + NAME + ' row — the panel drew a Depot a player cannot act on: ' + bodyText());
      assert(el.disabled !== true, 'the Store ×' + qty + ' control is DISABLED while the realm is reachable');
      el.click();                                   // the REAL delegated listener
      for (let i = 0; i < 60 && !said.length; i++) await new Promise((r) => setTimeout(r, 20));
    };
    try {
      window.notify = (m) => { said.push(String(m)); };
      A.markInventoryAuthorityLive(false); A.__resetBankFoldMode();
      assert(A.isInventoryAbsolute() === false, 'CONTROL: the bag arm is ON in this suite run, so this test would not be measuring the live configuration');
      window.fetch = (u, init) => (/rpc\/hr_bank_move/.test(String(u))
        ? (rpc.push(JSON.parse((init && init.body) || 'null')), reply(answer))
        : /hr-accrue/.test(String(u)) ? reply(env) : realFetch.call(window, u, init));
      A.resetAccrualGate(); A.configureAccrual({ url: 'https://proj.supabase.co', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      G.inventory = { [ID]: 876 }; G.bank = { goldBuys: 1 }; delete G._depotCap;

      /* (a) NOTHING STATED YET → "not sent", which is the honest line. */
      assert(view().projected === false, 'the panel claimed a projected Depot before any envelope stated one — absence is not a claim of zero');

      /* (b) THE PANEL OPENS AND ASKS THE REALM. `bank: {}` is a COMPLETE
             statement of an empty container, so the copy must flip. */
      D.open();
      for (let i = 0; i < 60 && A.lastBankFoldMode() !== 'absolute'; i++) await new Promise((r) => setTimeout(r, 20));
      assert(A.lastBankFoldMode() === 'absolute', 'the fold answered "' + A.lastBankFoldMode() + '" for an envelope carrying `bank: {}` with the bag arm off — THE LIVE P1: the Depot is server-owned and does not wait for the bag');
      assert(view().projected === true && /Your Depot is empty/.test(bodyText()) && !/has not sent/.test(bodyText()),
        'the Depot column still says the realm has not sent it: ' + bodyText());
      assert(G.bank.goldBuys === 1, 'the fold ate the bank-SPACE counter (goldBuys) — purchased rungs are not stacks');

      /* (c) THE PRESS. One intent, five fields, and the figures that follow are
             the SECOND envelope's — not 876-10 and not the RPC's own qty. */
      env = { ...env, version: env.version + 1, inventory: { [ID]: 866 }, bank: { [ID]: 10 } };   // ⚠ THE VERSION MOVES (M5): the same character's SECOND server statement, so reusing 9 makes it a duplicate the gate drops whole.
      await press(10);
      assert(rpc.length === 1, 'the pressed Store put ' + rpc.length + ' intents on the wire, not one (live: three presses, one POST, no message)');
      assert(rpc[0].p_item === ID && rpc[0].p_qty === 10 && rpc[0].p_dir === 'deposit' && /^[0-9a-f-]{36}$/i.test(String(rpc[0].p_idem)),
        'the intent said ' + JSON.stringify(rpc[0]) + ' — item/qty/direction/idem are the gesture\'s');
      assert(G.bank[ID] === 10, 'the Depot shows ' + G.bank[ID] + ' after a confirmed deposit — the envelope said 10 and the fold was dormant again');
      assert(G.inventory[ID] === 866, 'the bag still shows ' + G.inventory[ID] + ' — the merge max kept the stale 876 the player watched NOT leave their bag');
      assert(/Stored/.test(said.join(' ')) , 'a confirmed move said nothing to the player: ' + JSON.stringify(said));
      assert(new RegExp('1 stack stored').test(bodyText()), 'the Depot column did not repaint to the realm\'s one stack: ' + bodyText());
      assert(A.isInventoryAbsolute() === false, 'this test armed the BAG — the Depot fix must not smuggle the inventory flip in early');

      /* (d) A REFUSAL IS A SENTENCE, and the realm's own ceiling is learned only
             from the realm saying it. */
      rpc = []; said.length = 0; answer = { ok: false, error: 'bank_full', cap: 1000 };
      await press(1);
      assert(rpc.length === 1, 'the second gesture did not reach the server: ' + JSON.stringify(rpc));
      assert(/Depot is full/.test(said.join(' ')) && /1,000 stacks/.test(said.join(' ')),
        'a refusal was swallowed into silence — the player pressed Store and nothing happened: ' + JSON.stringify(said));
      assert(G._depotCap === 1000, 'the ceiling the realm just named was not remembered (' + G._depotCap + ')');

      /* (e) THE FUSE SPEAKS. A press while a move is in flight is answered, not
             silently dropped — the other half of "nothing happened". */
      said.length = 0; answer = { ok: true, item: ID, qty: 1, direction: 'deposit', version: 10 };
      const first = D.move(ID, 1, 'deposit');
      const second = await D.move(ID, 1, 'deposit');
      assert(second && second.ok === false && second.error === 'busy', 'a concurrent gesture was not fused: ' + JSON.stringify(second));
      assert(/One move at a time/.test(said.join(' ')), 'the fused press said nothing — a dead button with no message is how the live Depot read: ' + JSON.stringify(said));
      await first;
    } finally {
      window.fetch = realFetch; window.notify = realNotify;
      try { D.close(); } catch (e) {}
      try { A.resetAccrualGate(); A.configureAccrual(null); A.__resetBankFoldMode(); } catch (e) {}
      restoreG(snap);
    }
  }),

  /* ── SELLLOCK-1 — the sell-lock and the loot filter, played ─────────────────
     The lock's whole contract is NEGATIVE: it stops this client from ever
     AUTHORING a sale for that id. So the proof is the WIRE, never a disabled
     button — a refusal that still posts the intent is a race the server settles in
     the seller's favour. Both sale surfaces are here because the lock was wired
     into the vendor and stopped: the market listing, the one sale with no
     buy-back, went out locked until now. The filter half asserts the PAINT and the
     bag together: it must hide a class and must never REMOVE one. Then the residue
     round-trip, because a pref that does not survive a reload is §6's "forgotten
     on reload" class with a padlock on it. */
  () => tryRunAsync('SELLLOCK-1: a locked item sends no sale and cannot be listed; the loot filter hides a class; both survive a reload', async () => {
    const G = window.G, CS = window.HearthriseClientState, CAP = window.HearthriseCapstone, MK = window.HearthriseMarket, LF = window.HearthriseLootFilter;
    const snap = snapshotG();
    const bag = () => G.inventory.normal_log || 0;
    assert(CS && typeof CS.hydrateInto === 'function' && CAP && typeof CAP.buildResiduePatch === 'function' && MK && typeof MK.listItem === 'function' && LF && typeof LF.toggle === 'function' && typeof window.toggleItemLock === 'function', 'CONTROL: a seam this test drives is unpublished (residue / market / lock) — it would pass vacuously');
    assert(CAP.RESIDUE_FIELDS.indexOf('lockedItems') >= 0 && CAP.RESIDUE_FIELDS.indexOf('lootFilter') >= 0, 'lockedItems/lootFilter are not on the residue allowlist, so hr_put_client_state never carries them and every lock and every kept class is forgotten on reload');
    const food = Object.keys(window.ITEMS).find((id) => window.ITEMS[id].heals && !window.ITEMS[id].type);
    assert(!!food, 'CONTROL: no plain food item in the catalogue, so "the filter drops a class" is untestable');
    try {
      await withServerBacked({ state: { gold: 777777 } }, async (rig) => {
        G.inventory = { normal_log: 5 }; G.lockedItems = {}; G.lootFilter = []; G.gold = 500; stampBalanceLikeLoad(G); window.toggleItemLock('normal_log');
        assert(window.isItemLocked('normal_log') === true, 'the Lock action did not lock the item');
        window.invSellOne('normal_log'); await rig.drain();
        assert(rig.sent.length === 0, 'a LOCKED item put ' + JSON.stringify(rig.sent) + ' on the wire — the lock must stop the client AUTHORING the sale, not merely hide a button');
        assert(bag() === 5, 'the locked stack left the bag anyway (' + bag() + ' of 5)');
        const refused = MK.listItem('normal_log', 1, 50);
        assert(refused && refused.ok === false && /unlock/i.test(String(refused.reason)), 'the MARKET listed a locked item — the one sale with no buy-back: ' + JSON.stringify(refused));
        assert(bag() === 5, 'the refused listing escrowed the stack out of the bag anyway');
        window.toggleItemLock('normal_log'); window.invSellOne('normal_log'); await rig.drain();
        assert(rig.sent.length === 1 && rig.sent[0].verb === 'vendor_sell' && rig.sent[0].item === 'normal_log', 'after unlocking, the sale sent ' + JSON.stringify(rig.sent) + ' — the lock must GATE the sale, not break it');
      });

      /* THE FILTER, measured as TILES on the renderer the player looks at
         (renderInvFancy / `.invc-tile`, not the dead `.inv-item` grid). */
      G.inventory = { normal_log: 3 }; G.inventory[food] = 3; G.lootFilter = []; G.lockedItems = { normal_log: true };
      window.showTab('inventory');
      await new Promise((r) => setTimeout(r, 60));
      const paint = async () => {
        window._renderInvFancy(); await new Promise((r) => setTimeout(r, 20));
        const q = (sel) => document.querySelectorAll('#panel-inventory ' + sel);
        return { tiles: Array.prototype.map.call(q('.invc-tile:not(.invc-slot)'), (t) => t.getAttribute('title') || ''), chips: q('.invc-lf-chip').length, locks: q('.invc-lock').length };
      };
      const before = await paint();
      assert(before.tiles.length === 2 && before.chips === LF.classes().length + 1 && before.locks === 1, 'CONTROL: the bag drew ' + before.tiles.length + ' tiles, ' + before.chips + ' Keep chips and ' + before.locks + ' padlocks for two stacks (one locked) and ' + LF.classes().length + ' classes + Everything — the control and the badge must be ON SCREEN, not merely computed: ' + JSON.stringify(before.tiles));
      LF.toggle('food'); const after = await paint();
      assert(after.tiles.length === 1 && after.tiles[0].indexOf(window.ITEMS[food].n) === 0, 'keeping only Food painted ' + JSON.stringify(after.tiles) + ' — the filter did not drop the other class');
      assert(bag() === 3, 'the filtered-out stack was REMOVED from the bag (' + bag() + ') — the filter is a display pref and the server owns the inventory');

      /* THE ROUND-TRIP: out through the uploader's patch, back in through the hydrate a reload runs — then a garbage bag, which must read KEEP ALL. */
      G.lockedItems = { normal_log: true };
      const patch = JSON.parse(JSON.stringify(CAP.buildResiduePatch(G)));
      assert(patch.lockedItems && patch.lockedItems.normal_log === true && patch.lootFilter.indexOf('food') >= 0, 'the residue patch dropped the lock or the filter: ' + JSON.stringify([patch.lockedItems, patch.lootFilter]));
      delete G.lockedItems; delete G.lootFilter; CS.hydrateInto(G, patch);
      assert(window.isItemLocked('normal_log') === true && (G.lootFilter || []).indexOf('food') >= 0, 'a reload forgot the lock or the filter: ' + JSON.stringify([G.lockedItems, G.lootFilter]));
      CS.hydrateInto(G, { lootFilter: 'food' });
      assert(Array.isArray(G.lootFilter) && G.lootFilter.length === 0, 'a garbage lootFilter hydrated as ' + JSON.stringify(G.lootFilter) + ' — the fail-safe is KEEP ALL, because a hidden bag is indistinguishable from a robbed one');
    } finally {
      restoreG(snap); try { window._renderInvFancy(); } catch (e) {}
    }
  }),

  /* PRAYER-LADDER-1 — Prayer shipped with rungs at 1/15/35 and NOTHING from 36 to 99, on the one bench whose whole output is XP. Drives the REAL tile renderer at Prayer 39 and again at 40; the boundary IS the property, and it is the same one hr_apply's `activity_locked` arm enforces server-side.
     `PAY` below is the literal (id, req, xp, ms) of all thirteen rungs: NOTHING else in the repo measures what a Prayer rung PAYS — hr_activities has no yield columns and the edge engine reads these very rows — so a typo (2400 → 24000) shipped green until it existed. Its 840 XP/s ceiling is MEASURED, just above the catalogue's own non-prayer maximum (forge_slagheart_platebody, 833.3): the one bench whose entire output is XP must never out-pay every other bench. */
  () => tryRun('PRAYER-LADDER-1: the Prayer ladder reaches 99 — Prayer 40 sees Sift Bone Chips live, Prayer 39 sees it locked', () => {
    const snap = snapshotG();
    try {
      const G = window.G, rows = window.ARTISAN_RECIPES.prayer;
      const first = rows.find((r) => r.id === 'bury_bone_chips');
      assert(first && first.req === 40 && first.input === 'bone_chips' && first.output == null,
        'bury_bone_chips must be the Prayer 40 pure sink fed by bone_chips, got ' + JSON.stringify(first));
      const PAY = ('bury_bones 1 4.5 1200|bury_big 15 15 1500|bury_dragon 35 72 2000|'
        + 'bury_bone_chips 40 105 2200|consecrate_grave_dust 46 155 2400|offer_razor_claw 52 212 2500|'
        + 'scatter_vamp_dust 58 295 2600|banish_demon_shard 65 420 2800|unbind_wraith_veil 72 600 3000|'
        + 'consecrate_dragon_scale 79 855 3200|release_lich_soul 86 1210 3400|offer_ancient_claw 92 1700 3600|'
        + 'purge_void_chitin 99 2400 3800').split('|').map((s) => s.split(' '));
      assert(rows.length === PAY.length, 'the prayer bench holds ' + rows.length + ' rungs, the ruling pins ' + PAY.length);
      PAY.forEach(([id, req, xp, ms], i) => { const r = rows[i], rate = r.xp / (r.ms / 1000);
        assert(r.id === id && r.req === +req && r.xp === +xp && r.ms === +ms, 'rung ' + i + ' must be '
          + [id, req, xp, ms].join('/') + ' (id/req/xp/ms), got ' + [r.id, r.req, r.xp, r.ms].join('/'));
        assert(i === 0 || r.req > rows[i - 1].req, id + ' does not sit above ' + (rows[i - 1] || {}).id);
        assert(window.ITEMS[r.input], id + ' consumes ' + r.input + ', which is not an item');
        assert(rate <= 840, id + ' pays ' + rate.toFixed(1) + ' XP/s, over the catalogue ceiling 840 (non-prayer max 833.3)');
      });
      assert(rows[12].req === 99, 'the bench must reach Prayer 99, its top rung is ' + rows[12].req);


      G.inventory = { bone_chips: 5 };
      G.skills = { prayer: window.xpForLevel(39) };
      assert(window.getLevel('prayer') === 39, 'fixture: Prayer is ' + window.getLevel('prayer') + ', not 39');
      const at39 = window.renderArtisanActivities('prayer');
      const cell = (html) => {   /* the WHOLE button: `disabled` sits in the opening tag BEFORE the onclick carrying the id, so slicing forward from the id would read the NEXT tile's state */
        const at = html.indexOf('bury_bone_chips');
        assert(at > 0, 'the prayer bench rendered no bury_bone_chips tile at all');
        return html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at) + 9);
      };
      assert(at39.indexOf('bury_bone_chips') >= 0, 'Prayer 39 must still SEE the rung it is one level short of');
      assert(/disabled/.test(cell(at39)), 'at Prayer 39 the ' + first.req + ' rung must render DISABLED');
      assert(cell(at39).indexOf('Lv ' + first.req) >= 0,
        'the locked tile must name the level it needs (Lv ' + first.req + ')');

      G.skills = { prayer: window.xpForLevel(40) };
      const at40 = window.renderArtisanActivities('prayer');
      assert(!/disabled/.test(cell(at40)),
        'at Prayer 40, holding bone chips, the rung must be LIVE: ' + cell(at40).slice(0, 200));
      assert(cell(at40).indexOf(first.name) >= 0, 'the live tile must carry the row\'s name, ' + first.name);
      assert(cell(at40).indexOf(' → ') < 0,
        'a null-output rung must promise no product — the tile printed an output arrow');
      assert(cell(at40).indexOf(window.ITEMS.bone_chips.n) >= 0,
        'the live tile must name the drop it consumes');
    } finally { restoreG(snap); }
  }),

  /* ── REEDTIDE-1..5 — the "Reed & Tide" band, PLAYED ─────────────────────
     Fishing ran Trout(20) → Lobster(40): one rung per twenty levels, straight
     through the band where a player learns fish → cook → eat → fight. Four
     nodes and six cooking rows close it, and these are the happy paths a player
     walks — a REAL gather through `doSkillAction` and a REAL cook through
     `doArtisanAction`, never a read of the tables.
     FIVE PROPERTIES, ONE TEST EACH, because a content batch gets a DIFFERENT
     one wrong each time and a mega-test reports only the first: (1) the rungs
     exist, the CATCH lands and the tile names the fish, not the pool; (2) the
     COOK banks the dish and debits the fish; (3) the HEAL reaches the AUTO-EAT
     POOL — a wrong `foodClass` is a bag item the away engine cannot spend, or
     spends when it must not, so the Fisher's Pie is the negative control;
     (4) the two COMBOS read their full input map through `recipeInputs`, the ONE
     helper the edge imports, because a dish read as input-free MINTS; (5) the
     cooking tile gates one level short — hr_apply's client half. */
  () => tryRun('REEDTIDE-1: the four new fishing rungs exist at 24/28/32/36, a real action at Reed Pike Pool lands a Pikeperch, and the tile names the fish', () => {
    const snap = snapshotG();
    const G = window.G, I = window.ITEMS;
    try {
      const ids = ['pikeperch_s', 'copper_crab_s', 'silverfin_s', 'goldgill_s'];
      const nodes = ids.map((id) => (window.FISH_SPOTS || []).find((f) => f.id === id));
      nodes.forEach((n, i) => assert(n, 'fishing node ' + ids[i] + ' is missing — the Trout→Lobster silence is back'));
      assert(nodes.map((n) => n.req).join(',') === '24,28,32,36', 'the four new rungs must gate at 24/28/32/36, got ' + nodes.map((n) => n.req).join(','));
      nodes.forEach((n) => {
        assert(I[n.prod], n.id + ' yields ' + n.prod + ', which is not an item');
        assert(n.xp > 0 && n.ms > 0 && n.qty[0] === 1 && n.qty[1] === 1, n.id + ' must carry real xp/ms and yield exactly 1, got ' + n.xp + '/' + n.ms + '/' + n.qty);
      });
      /* THE CATCH — the real interval callback behind "fish this spot". */
      const node = nodes[0];
      G.skills = Object.assign({}, G.skills, { fishing: window.xpForLevel(node.req) });
      assert(window.getLevel('fishing') === node.req, 'fixture: fishing is ' + window.getLevel('fishing') + ', not ' + node.req);
      G.inventory = {}; G.activeSkill = 'fishing'; G.skillTargetId = node.id;
      const fished0 = G.stats.fished || 0;
      window.doSkillAction(true);
      assert((G.inventory[node.prod] || 0) >= 1, 'a real fishing action at ' + node.id + ' banked no ' + node.prod + ' — the node is in the table but not in the loop');
      assert((G.stats.fished || 0) > fished0, 'the catch did not tick stats.fished');
      /* THE TILE NAMES ITS YIELD — the standing rule, on a new row. */
      const AG = window.HearthriseActivitiesGrid;
      assert(AG && typeof AG.__tileForGather === 'function', 'the gather-tile builder is unpublished — the paint half would pass vacuously');
      assert(AG.__tileForGather(node, 'fishing').indexOf('Yields ' + I[node.prod].n) >= 0, 'the Reed Pike Pool tile does not name ' + I[node.prod].n + ' as its yield');
    } finally { restoreG(snap); }
  }),

  () => tryRun('REEDTIDE-2: a real cook at Cooking 18 turns one Raw Pikeperch into exactly one Grilled Pikeperch and debits the fish', () => {
    const snap = snapshotG();
    const G = window.G;
    /* ⚠ `rooms` IS SAVED AND RESTORED BY HAND, and it has to be. `snapshotG()`
       carries `rooms: G.rooms` with NO `|| null`, and its own header records why
       that matters: JSON.stringify DROPS an undefined property, so when G.rooms
       is unset at boot the snapshot has no `rooms` key and `restoreG` puts
       NOTHING back. A Cast-Iron Range (kitchen 3) makes the one cook
       deterministic, and that rung then LEAKED into every later test.
       Measured, not guessed: `--only "fish"` was 20/21 with 0 red before this
       test existed and 20/22 with ONE red after — `AWAY-19 PARITY` failing on
       "the fixture never burnt", because a leaked Range drives burnChance() to 0
       and AWAY-19's setup() does not reset rooms. Any test writing G.rooms onto
       a boot state with none has the same hole; widening snapshotG is REPORTED. */
    const localSnap = { rooms: JSON.parse(JSON.stringify(G.rooms || {})) };
    try {
      const rec = (window.ARTISAN_RECIPES.cooking || []).find((r) => r.id === 'cook_pikeperch');
      assert(rec && rec.req === 18 && rec.input === 'pikeperch' && rec.output === 'cooked_pikeperch', 'cook_pikeperch must be the Cooking 18 pikeperch → cooked_pikeperch rung, got ' + JSON.stringify(rec));
      G.rooms = Object.assign({}, G.rooms, { kitchen: 3 });
      stampRecordLikeLoad(G);   // `rooms` is server-of-record; a raw write reads as UNKNOWN
      G.skills = Object.assign({}, G.skills, { cooking: window.xpForLevel(rec.req) });
      G.inventory = { pikeperch: 1 };
      window.doArtisanAction('cooking', 'cook_pikeperch');
      assert((G.inventory.cooked_pikeperch || 0) === 1, 'the fire produced ' + (G.inventory.cooked_pikeperch || 0) + ' Grilled Pikeperch from one raw fish');
      assert(!(G.inventory.pikeperch > 0), 'the cook did not debit the raw fish — a free dish');
    } finally { restoreG(snap); G.rooms = localSnap.rooms; stampRecordLikeLoad(G); }
  }),

  () => tryRun('REEDTIDE-3: the four new provisions are auto-eatable rungs between Cooked Trout and Cooked Lobster, and the Fisher\'s Pie Feast is not', () => {
    const I = window.ITEMS, fc = window.foodClassOf, ae = window.isAutoEatable;
    assert(typeof fc === 'function' && typeof ae === 'function', 'foodClassOf/isAutoEatable are unpublished — this test would pass vacuously');
    assert(I.cooked_pikeperch.heals === 16 && I.cooked_pikeperch.foodClass === 'healing', 'Grilled Pikeperch must heal 16 as a healing provision, got ' + I.cooked_pikeperch.heals + '/' + I.cooked_pikeperch.foodClass);
    assert(I.fishers_pie.heals === 34 && I.fishers_pie.foodClass === 'buff', "Fisher's Pie must be a 34-heal FEAST, or auto-eat will spend a 10-minute damage buff as a bandage");
    assert(fc(I.cooked_pikeperch) === 'healing' && fc(I.fishers_pie) === 'buff', 'foodClassOf disagrees with the authored class — auto-eat reads foodClassOf, not `heals`');
    assert(ae(I.cooked_pikeperch) === true && ae(I.fishers_pie) === false, 'the auto-eat pool is wrong: Grilled Pikeperch must be eligible and the Feast must not be');
    assert(ae(I.river_chowder) === true, 'River Chowder is a healing provision and must be in the auto-eat pool');
    /* Between Cooked Trout and Cooked Lobster, or the pool gained a cliff. */
    [['cooked_pikeperch', 16], ['cooked_copper_crab', 18], ['cooked_silverfin', 21], ['cooked_goldgill', 23]].forEach(([id, h]) => {
      assert(I[id] && I[id].heals === h, id + ' must heal ' + h + ', got ' + (I[id] || {}).heals);
      assert(I[id].heals > I.cooked_trout.heals && I[id].heals < I.cooked_lobster.heals, id + ' (' + I[id].heals + ') must sit between Cooked Trout (' + I.cooked_trout.heals + ') and Cooked Lobster (' + I.cooked_lobster.heals + ')');
    });
  }),

  () => tryRun('REEDTIDE-4: the two multi-input dishes read their full input map through recipeInputs — the helper the edge engine imports', () => {
    const I = window.ITEMS, inputsOf = window.HearthriseCore.artisan.recipeInputs;
    assert(typeof inputsOf === 'function', 'HearthriseCore.artisan.recipeInputs is unpublished — an input map nobody can read is a recipe that mints');
    [['cook_river_chowder', { silverfin: 2, potato: 2, carrot: 1 }], ['cook_fishers_pie', { goldgill: 2, wheat: 3, potato: 1 }]].forEach(([id, want]) => {
      const r = (window.ARTISAN_RECIPES.cooking || []).find((x) => x.id === id);
      assert(r, id + ' is missing from the cooking bench');
      assert(JSON.stringify(inputsOf(r)) === JSON.stringify(want), id + ' reads as ' + JSON.stringify(inputsOf(r)) + ', the ruling says ' + JSON.stringify(want));
      Object.keys(want).forEach((k) => assert(I[k], id + ' consumes ' + k + ', which is not an item'));
    });
  }),

  () => tryRun('REEDTIDE-5: the Grill Pikeperch tile is DISABLED at Cooking 17 and LIVE at 18 — the client half of hr_apply activity_locked', () => {
    const snap = snapshotG();
    const G = window.G, I = window.ITEMS;
    try {
      const rec = (window.ARTISAN_RECIPES.cooking || []).find((r) => r.id === 'cook_pikeperch');
      assert(rec, 'cook_pikeperch is missing from the cooking bench');
      G.inventory = { pikeperch: 5 };
      /* The WHOLE button: `disabled` sits BEFORE the onclick carrying the id. */
      const cell = (html) => {
        const at = html.indexOf('cook_pikeperch');
        assert(at > 0, 'the cooking bench rendered no cook_pikeperch tile at all');
        return html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at) + 9);
      };
      G.skills = Object.assign({}, G.skills, { cooking: window.xpForLevel(rec.req - 1) });
      const below = cell(window.renderArtisanActivities('cooking'));
      assert(/disabled/.test(below), 'at Cooking ' + (rec.req - 1) + ' the ' + rec.req + ' rung must render DISABLED');
      assert(below.indexOf('Lv ' + rec.req) >= 0, 'the locked tile must name the level it needs (Lv ' + rec.req + ')');
      G.skills = Object.assign({}, G.skills, { cooking: window.xpForLevel(rec.req) });
      const live = cell(window.renderArtisanActivities('cooking'));
      assert(!/disabled/.test(live), 'at Cooking ' + rec.req + ', holding pikeperch, the rung must be LIVE: ' + live.slice(0, 200));
      assert(live.indexOf(I.cooked_pikeperch.n) >= 0, 'the live tile must name what it makes, ' + I.cooked_pikeperch.n);
    } finally { restoreG(snap); }
  }),

  /* ── DEEPSEAM-1..6 — the "Deep Seam" band, PLAYED ───────────────────────
     The smith's ORE SUPPLY did not change between Mining 15 and Mining 60:
     coal is a reagent, Rich Coal is more coal and Gold makes jewellery only, so
     a player crossing Mining 36→56 mined nothing that became armour, Smithing
     had no bar between Steel(35) and Mithril(55), and the WIELD ladder jumped
     Defence 30 → 45 with nothing to put on in between. Four nodes, one bar and
     five pieces (VERDITE) close all three.
     SIX PROPERTIES, ONE TEST EACH, because a content batch gets a DIFFERENT one
     wrong each time and a mega-test reports only the first: (1) the nodes exist,
     the SWING lands and the tile names the ore; (2) the SMELT banks one bar and
     debits BOTH inputs; (3) the five pieces are a real BRIDGE — every stat,
     wield level and price strictly between the steel and mithril rung of the
     same slot; (4) the forge tile gates one level short — hr_apply's client
     half; (5) every new rung is SELF-SUPPLYING, and the shipped rungs that are
     not are frozen at 57 so the class can only shrink; (6) the wield gate bites
     on the client at Defence 37 and opens at 38, which is what stops the market
     selling 28 defence to a new account. */
  () => tryRun('DEEPSEAM-1: the four new mining rungs exist at 36/40/48/56, a real swing at the Verdite Seam lands Verdite Ore, and the tile names the ore', () => {
    const snap = snapshotG();
    const G = window.G, I = window.ITEMS;
    try {
      const ids = ['verdite_seam', 'fluxsalt_pocket', 'deep_verdite_seam', 'heartgarnet_geode'];
      const nodes = ids.map((id) => (window.ROCKS || []).find((r) => r.id === id));
      nodes.forEach((n, i) => assert(n, 'mining node ' + ids[i] + ' is missing — the Mining 15→60 ore silence is back'));
      assert(nodes.map((n) => n.req).join(',') === '36,40,48,56', 'the four new rungs must gate at 36/40/48/56, got ' + nodes.map((n) => n.req).join(','));
      nodes.forEach((n) => {
        assert(I[n.prod], n.id + ' yields ' + n.prod + ', which is not an item');
        assert(I[n.prod].raw === true, n.id + ' yields ' + n.prod + ', which is not flagged raw — the vendor would bid FULL book value on a mined material');
        assert(n.xp > 0 && n.ms > 0 && n.qty[0] >= 1 && n.qty[1] >= n.qty[0], n.id + ' must carry real xp/ms/qty, got ' + n.xp + '/' + n.ms + '/' + n.qty);
      });
      /* THE SWING — the real interval callback behind "mine this rock". */
      const node = nodes[0];
      G.skills = Object.assign({}, G.skills, { mining: window.xpForLevel(node.req) });
      assert(window.getLevel('mining') === node.req, 'fixture: mining is ' + window.getLevel('mining') + ', not ' + node.req);
      G.inventory = {}; G.activeSkill = 'mining'; G.skillTargetId = node.id;
      const mined0 = G.stats.mined || 0;
      window.doSkillAction(true);
      assert((G.inventory[node.prod] || 0) >= 1, 'a real mining action at ' + node.id + ' banked no ' + node.prod + ' — the node is in the table but not in the loop');
      assert((G.stats.mined || 0) > mined0, 'the swing did not tick stats.mined');
      /* THE TILE NAMES ITS YIELD — the standing rule, on a new row. */
      const AG = window.HearthriseActivitiesGrid;
      assert(AG && typeof AG.__tileForGather === 'function', 'the gather-tile builder is unpublished — the paint half would pass vacuously');
      assert(AG.__tileForGather(node, 'mining').indexOf('Yields ' + I[node.prod].n) >= 0, 'the Verdite Seam tile does not name ' + I[node.prod].n + ' as its yield');
    } finally { restoreG(snap); }
  }),

  () => tryRun('DEEPSEAM-2: a real smelt at Smithing 42 turns 2 Verdite Ore + 1 Fluxsalt into exactly one Verdite Bar and debits BOTH inputs', () => {
    const snap = snapshotG();
    const G = window.G;
    /* `rooms` IS SAVED AND RESTORED BY HAND for the reason REEDTIDE-2 records:
       snapshotG() carries `rooms: G.rooms` with no `|| null`, so when it is
       unset at boot restoreG puts NOTHING back and a rung written here LEAKS
       into every later test. It is written at all because a Forge rung grants
       `craftSave`, which REFUNDS inputs — the exact thing this test measures. */
    const localSnap = { rooms: JSON.parse(JSON.stringify(G.rooms || {})) };
    try {
      const rec = (window.ARTISAN_RECIPES.smithing || []).find((r) => r.id === 'smelt_verdite');
      assert(rec && rec.req === 42 && rec.output === 'verdite_bar', 'smelt_verdite must be the Smithing 42 verdite_bar rung, got ' + JSON.stringify(rec));
      const inputsOf = window.HearthriseCore.artisan.recipeInputs;
      assert(typeof inputsOf === 'function', 'HearthriseCore.artisan.recipeInputs is unpublished — an input map nobody can read is a recipe that MINTS');
      assert(JSON.stringify(inputsOf(rec)) === JSON.stringify({ verdite_ore: 2, flux_salt: 1 }),
        'smelt_verdite reads as ' + JSON.stringify(inputsOf(rec)) + ', the ruling says 2 ore + 1 fluxsalt — and this is the helper the EDGE imports, so a mis-read mints away too');
      G.rooms = {};                     // no Forge rung ⇒ no craftSave refund
      stampRecordLikeLoad(G);           // `rooms` is server-of-record; a raw write reads as UNKNOWN
      G.skills = Object.assign({}, G.skills, { smithing: window.xpForLevel(rec.req) });
      G.inventory = { verdite_ore: 2, flux_salt: 1 };
      window.doArtisanAction('smithing', 'smelt_verdite');
      assert((G.inventory.verdite_bar || 0) === 1, 'the forge produced ' + (G.inventory.verdite_bar || 0) + ' Verdite Bar from 2 ore + 1 fluxsalt');
      assert(!(G.inventory.verdite_ore > 0), 'the smelt did not debit the ore — a free bar');
      assert(!(G.inventory.flux_salt > 0), 'the smelt did not debit the fluxsalt — the second input is decorative');
    } finally { restoreG(snap); G.rooms = localSnap.rooms; stampRecordLikeLoad(G); }
  }),

  () => tryRun('DEEPSEAM-3: every verdite piece is a real BRIDGE — stat, wield level and price strictly between its steel and mithril twin', () => {
    const I = window.ITEMS;
    const R = window.ARTISAN_RECIPES;
    const all = Object.keys(R).reduce((a, k) => a.concat(R[k] || []), []);
    /* new id · steel twin · mithril twin · the stat that must climb */
    [['verdite_helm', 'steel_helm', 'mithril_helm', 'defB'],
      ['verdite_platebody', 'steel_platebody', 'mithril_platebody', 'defB'],
      ['verdite_platelegs', 'steel_platelegs', 'mithril_platelegs', 'defB'],
      ['verdite_blade', 'steel_sword', 'mithril_sword', 'atkB'],
      ['heartgarnet_maul', 'steel_warhammer', 'mithril_warhammer', 'strB']].forEach(([id, lo, hi, stat]) => {
      const n = I[id], a = I[lo], b = I[hi];
      assert(n && a && b, id + ': one of ' + id + '/' + lo + '/' + hi + ' is missing');
      assert(n.slot === a.slot && n.slot === b.slot, id + ' sits in slot ' + n.slot + ', its twins in ' + a.slot + '/' + b.slot + ' — it is not the same lane');
      assert(n[stat] > a[stat] && n[stat] < b[stat], id + ' carries ' + stat + ' ' + n[stat] + ', which is not strictly between ' + lo + ' (' + a[stat] + ') and ' + hi + ' (' + b[stat] + ') — a bridge that ties or beats the tier above it is not a bridge');
      assert(n.v > a.v && n.v < b.v, id + ' is priced ' + n.v + ', not between ' + a.v + ' and ' + b.v + ' — the vendor and the market read this number');
      /* The WIELD gate is the half a player meets first, and it is the hole
         this batch exists to fill: armour gates on `defense` at a
         MATERIAL_TIERS level, so the ladder read 30 → 45 with nothing between. */
      const rq = window.gearWieldReq(n), rqa = window.gearWieldReq(a), rqb = window.gearWieldReq(b);
      assert(rq && rqa && rqb, id + ': a piece in this lane carries no wield requirement — a tradeable 28-defence plate with no gate is the market selling power to a level-1 account');
      assert(rq.skill === rqa.skill, id + ' gates on ' + rq.skill + ' while ' + lo + ' gates on ' + rqa.skill + ' — armour requirements are DEFENCE-only (standing ruling, 2026-08-15)');
      assert(rq.lv > rqa.lv && rq.lv < rqb.lv, id + ' wields at ' + rq.lv + ', not between ' + lo + ' (' + rqa.lv + ') and ' + hi + ' (' + rqb.lv + ')');
      /* And it is obtainable: exactly one recipe makes it. */
      const made = all.filter((r) => r.output === id);
      assert(made.length === 1, id + ' is made by ' + made.length + ' recipes — vendor trash with no recipe is what this batch exists to stop, and two recipes is two authorities');
      Object.keys(window.HearthriseCore.artisan.recipeInputs(made[0])).forEach((k) => assert(I[k], id + "'s recipe consumes " + k + ', which is not an item'));
    });
  }),

  () => tryRun('DEEPSEAM-4: the Forge Verdite Platebody tile is DISABLED at Smithing 49 and LIVE at 50 — the client half of hr_apply activity_locked', () => {
    const snap = snapshotG();
    const G = window.G, I = window.ITEMS;
    try {
      const rec = (window.ARTISAN_RECIPES.smithing || []).find((r) => r.id === 'forge_verdite_platebody');
      assert(rec && rec.req === 50, 'forge_verdite_platebody must be the Smithing 50 rung, got ' + JSON.stringify(rec));
      G.inventory = { verdite_bar: 20, flux_salt: 10 };
      /* The WHOLE button: `disabled` sits BEFORE the onclick carrying the id. */
      const cell = (html) => {
        const at = html.indexOf('forge_verdite_platebody');
        assert(at > 0, 'the smithing bench rendered no forge_verdite_platebody tile at all');
        return html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at) + 9);
      };
      G.skills = Object.assign({}, G.skills, { smithing: window.xpForLevel(rec.req - 1) });
      const below = cell(window.renderArtisanActivities('smithing'));
      assert(/disabled/.test(below), 'at Smithing ' + (rec.req - 1) + ' the ' + rec.req + ' rung must render DISABLED');
      assert(below.indexOf('Lv ' + rec.req) >= 0, 'the locked tile must name the level it needs (Lv ' + rec.req + ')');
      G.skills = Object.assign({}, G.skills, { smithing: window.xpForLevel(rec.req) });
      const live = cell(window.renderArtisanActivities('smithing'));
      assert(!/disabled/.test(live), 'at Smithing ' + rec.req + ', holding bars, the rung must be LIVE: ' + live.slice(0, 200));
      assert(live.indexOf(I.verdite_platebody.n) >= 0, 'the live tile must name what it makes, ' + I.verdite_platebody.n);
    } finally { restoreG(snap); }
  }),

  () => tryRun('SELFSUPPLY-1: at Smithing 30 the bench offers the Steel Bar AND the steel armour it feeds — the tier opens on ONE rung', () => {
    /* THE PLAYED MOMENT this ruling exists for. Before 2026-09-13 a smith who
       reached 30 saw the steel tier open — Gauntlets 31, Boots 32, Belt 33 — with
       the Steel Bar locked until 35, so the first thing a new tier taught was that
       you cannot make it. This renders the REAL bench at 29, 30 and 31 and reads
       the buttons, i.e. it fails on the pre-ruling data at the `30` assertion.
       Ore is in the bag so the test measures the LEVEL GATE and nothing else. */
    const snap = snapshotG();
    const G = window.G, I = window.ITEMS;
    try {
      const bar = (window.ARTISAN_RECIPES.smithing || []).find((r) => r.id === 'smelt_steel');
      const glove = (window.ARTISAN_RECIPES.smithing || []).find((r) => r.id === 'forge_steel_gauntlets');
      assert(bar && bar.req === 30, 'smelt_steel must be the Smithing 30 rung (the steel tier gate), got ' + (bar && bar.req));
      assert(glove && glove.req === 31, 'forge_steel_gauntlets must still be the 31 rung, got ' + (glove && glove.req));

      G.inventory = { iron_bar: 40, coal: 40, steel_bar: 10 };
      const cell = (html, id) => {
        const at = html.indexOf(id);
        assert(at > 0, 'the smithing bench rendered no ' + id + ' tile at all');
        return html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at) + 9);
      };
      const atLevel = (lv) => {
        G.skills = Object.assign({}, G.skills, { smithing: window.xpForLevel(lv) });
        return window.renderArtisanActivities('smithing');
      };

      const at29 = atLevel(29);
      assert(/disabled/.test(cell(at29, 'smelt_steel')), 'at Smithing 29 the Steel Bar must still be locked');
      assert(/disabled/.test(cell(at29, 'forge_steel_gauntlets')), 'at Smithing 29 the gauntlets must still be locked');

      const at30 = atLevel(30);
      const barTile = cell(at30, 'smelt_steel');
      assert(!/disabled/.test(barTile), 'AT SMITHING 30 THE STEEL BAR MUST BE LIVE — this is the whole ruling: '
        + barTile.slice(0, 200));
      assert(barTile.indexOf(I.steel_bar.n) >= 0, 'the live tile must name what it makes, ' + I.steel_bar.n);
      assert(/disabled/.test(cell(at30, 'forge_steel_gauntlets')),
        'the gauntlets are the 31 rung — at 30 the player smelts first, then forges');

      const at31 = atLevel(31);
      assert(!/disabled/.test(cell(at31, 'forge_steel_gauntlets')),
        'at Smithing 31, holding bars, the first steel armour rung must be LIVE');
    } finally { restoreG(snap); }
  }),

  () => tryRun('SELFSUPPLY-2: no tier gate sits above the first rung it feeds, and no bar opens below the reagent it eats', () => {
    /* The two rules that bound the ruling from either side, on every metal tier
       at once rather than on the one the test above plays. (1) THE TIER GATE: a
       bar is made at `MATERIAL_TIERS.smith`, which is at or below every forge in
       its tier because gear generates at smith+lvOff. (2) THE BRONZE WALL, the
       other direction: a rung reachable before its reagent is gatherable is a
       wall, which is how bronze once demanded Mining-30 coal at Smithing 1. */
    const R = window.ARTISAN_RECIPES.smithing || [], T = window.MATERIAL_TIERS || [];
    const ROCKS = window.ROCKS || [];
    assert(T.length >= 7, 'MATERIAL_TIERS is unpublished — this guard would grade nothing');
    const inputsOf = window.HearthriseCore.artisan.recipeInputs;
    const req = (id) => { const r = R.find((x) => x.id === id); return r && r.req; };
    const bars = { steel: 'smelt_steel', mithril: 'smelt_mithril', rune: 'smelt_rune',
      ember: 'smelt_ember', dawn: 'smelt_dawn' };
    T.forEach((mat) => {
      if (!bars[mat.id]) return;
      const at = req(bars[mat.id]);
      assert(at === mat.smith, mat.id + "'s bar is made at " + at + ' but its tier opens at '
        + mat.smith + ' — a tier whose own metal is not its first rung');
      const first = R.filter((r) => (inputsOf(r) || {})[mat.bar]).map((r) => r.req).sort((a, b) => a - b)[0];
      assert(first === undefined || at <= first,
        mat.id + ' bar ' + at + ' > its first forge ' + first + ' — the gate is above what it feeds');
    });
    const coal = ROCKS.filter((n) => n.prod === 'coal').sort((a, b) => a.req - b.req)[0];
    assert(coal && coal.req === 30, 'the coal rung moved (' + (coal && coal.req) + ') — re-read the wall below');
    assert(req('smelt_steel') >= coal.req, 'the Steel Bar is the first coal sink and must not open below Mining '
      + coal.req + ' — it is at Smithing ' + req('smelt_steel'));
    assert(!(inputsOf(R.find((r) => r.id === 'smelt_gold')) || {}).coal,
      'the Gold Bar (Smithing 25) eats coal again — that is the Bronze Wall, and the ruling removed the reagent');
  }),

  () => tryRun('SELFSUPPLY-3: re-gating a RECIPE never re-gates the WIELD — nobody loses a piece they are wearing', () => {
    /* The promise that made the ruling safe to ship: five rungs moved UP, and not
       one of their items may have followed. A raised `reqLv` would strip the piece
       off a character who already met the old one — the one outcome a balance pass
       is never allowed to have. Pinned as literals because that is the point. */
    const I = window.ITEMS || {};
    [['crown_of_the_fallen_king', 'defense', 85], ['demoncaller_staff', 'magic', 68],
      ['dawnbound_amulet', 'defense', 86], ['dawnforged_signet', 'defense', 84],
      ['dragon_gem_earrings', 'defense', 82], ['ruby_signet', 'defense', 52]].forEach(([id, sk, lv]) => {
      const it = I[id];
      assert(it && it.reqSkill === sk && it.reqLv === lv,
        id + ' must still be worn at ' + sk + ' ' + lv + ', got ' + (it && it.reqSkill) + ' ' + (it && it.reqLv)
        + ' — the recipe moved, the wield gate must not');
    });
  }),

  () => tryRun('DEEPSEAM-5: EVERY artisan rung is SELF-SUPPLYING — no recipe asks for a material its own level cannot make (ratchet 57 → 0)', () => {
    const inputsOf = window.HearthriseCore.artisan.recipeInputs;
    /* THE PROPERTY, in one line: for every recipe R and every input i,
       `req(R) >= the cheapest level at which i can be MADE`. Scan a TABLE rather
       than the global, so the same code can be run against a deliberately broken
       copy below — a guard that has never been red is not a guard (CLAUDE.md §4). */
    const scan = (R) => {
      const madeAt = {};
      Object.keys(R).forEach((sk) => (R[sk] || []).forEach((r) => {
        if (!r || !r.output) return;
        if (madeAt[r.output] === undefined || r.req < madeAt[r.output]) madeAt[r.output] = r.req;
      }));
      const ghosts = [];
      Object.keys(R).forEach((sk) => (R[sk] || []).forEach((r) => {
        if (!r) return;
        Object.keys(inputsOf(r)).forEach((k) => {
          if (madeAt[k] !== undefined && madeAt[k] > r.req) ghosts.push(sk + '/' + r.id + '@' + r.req + ' needs ' + k + '@' + madeAt[k]);
        });
      }));
      return ghosts;
    };

    const R = window.ARTISAN_RECIPES;
    /* CONTROL: the scan must be looking at the real, whole catalogue. A guard
       reading an empty table reports zero violations forever. */
    const total = Object.keys(R).reduce((n, sk) => n + (R[sk] || []).length, 0);
    assert(total >= 300, 'the scan saw only ' + total + ' recipes — it is not reading the live catalogue');

    /* THE RATCHET IS PAID. It was FROZEN AT 57 (34 smithing) from the Deep Seam
       batch until 2026-09-13, when the self-supply ruling moved the SUPPLY rungs
       to their own tier gates (steel bar 35→30, mithril 55→45, rune 75→60, ember
       82→75, dawn 92→88, gold 40→25, deathsteel 62→60, duskwood plank 90→88,
       blank runes 4→1), re-materialled three rungs that named a tier above their
       own band (longbow→oak, apprentice staff→normal, ruby signet→mithril) and
       raised the four dawn-identity rungs to 88. The rationale for each lives
       next to the data it moved (src/data/recipes.js, above the smelting lane).
       THIS NUMBER IS ZERO AND MUST STAY ZERO — it is not a ratchet any more, it
       is a property. A new rung that breaks it is a red build, which is the whole
       point: the ladder must never again promise a forge the player cannot feed. */
    const ghosts = scan(R);
    assert(ghosts.length === 0, ghosts.length + ' rung(s) ask for a material their own level cannot make — '
      + 'the self-supply property is broken (it has been ZERO since 2026-09-13). Move the SUPPLY rung down to '
      + 'its tier gate, or the material down to the rung\'s own band; only raise the rung when doing so opens '
      + 'no b343 hole: ' + ghosts.slice(0, 8).join(' | '));

    /* MUTATION ARM — the detector still bites. Break ONE rung in a shallow copy
       (the first smithing rung that consumes a craftable material, gated one level
       BELOW its input) and require the scan to name it. Without this, "0" is
       indistinguishable from a scan that stopped reading inputs. */
    const madeAt = {};
    Object.keys(R).forEach((sk) => (R[sk] || []).forEach((r) => {
      if (!r || !r.output) return;
      if (madeAt[r.output] === undefined || r.req < madeAt[r.output]) madeAt[r.output] = r.req;
    }));
    let victim = null, victimIn = null;
    (R.smithing || []).some((r) => {
      const hit = Object.keys(inputsOf(r) || {}).find((k) => madeAt[k] !== undefined && madeAt[k] > 1);
      if (hit) { victim = r; victimIn = hit; }
      return !!hit;
    });
    assert(victim, 'no smithing rung consumes a craftable material — the mutation arm cannot run');
    const broken = Object.assign({}, R, {
      smithing: (R.smithing || []).map((r) => (r === victim ? Object.assign({}, r, { req: madeAt[victimIn] - 1 }) : r)),
    });
    const caught = scan(broken);
    assert(caught.some((g) => g.indexOf(victim.id + '@') >= 0),
      'MUTATION NOT CAUGHT: ' + victim.id + ' was moved to ' + (madeAt[victimIn] - 1) + ', one level below its input '
      + victimIn + '@' + madeAt[victimIn] + ', and the scan still reported it clean (' + caught.length + ' found) — '
      + 'the zero above is measuring nothing');
    assert(scan(R).length === 0, 'the mutation leaked into the live catalogue — the copy was not shallow');
  }),

  () => tryRun('DEEPSEAM-6: the client wield gate refuses the Verdite Platebody at Defence 37 and equips it at 38', () => {
    const snap = snapshotG();
    const G = window.G;
    try {
      assert(typeof window.canWield === 'function' && typeof window.equipItem === 'function', 'canWield/equipItem are unpublished — the client half of the wield gate would pass vacuously');
      G.inventory = { verdite_platebody: 1 };
      G.equipment = Object.assign({}, G.equipment, { body: null });
      G.skills = Object.assign({}, G.skills, { defense: window.xpForLevel(37) });
      const no = window.canWield('verdite_platebody');
      assert(no.ok === false && no.req && no.req.skill === 'defense' && no.req.lv === 38,
        'at Defence 37 the Verdite Platebody must be refused with defense/38, got ' + JSON.stringify(no));
      window.equipItem('verdite_platebody');
      assert(G.equipment.body !== 'verdite_platebody', 'the refused equip still put the platebody on the body slot');
      assert((G.inventory.verdite_platebody || 0) === 1, 'the refused equip consumed the piece out of the bag');
      /* ONE level of Defence is the whole difference. */
      G.skills = Object.assign({}, G.skills, { defense: window.xpForLevel(38) });
      assert(window.canWield('verdite_platebody').ok === true, 'at Defence 38 the piece must be wieldable — the bridge is unreachable otherwise');
      window.equipItem('verdite_platebody');
      assert(G.equipment.body === 'verdite_platebody', 'at Defence 38 the platebody did not equip');
    } finally { restoreG(snap); }
  }),

  /* ── TOWN-1 — THE COMMON, painted and un-paintable ──────────────────────
     THE HAPPY PATH for the live-world week-1 slice: a fixture town body is
     parked exactly as `hr_town_of` would answer it, Home is drawn, and the
     presence rail + The Crier are read off the real DOM.

     It also pins the two properties the feature is only allowed to exist under:
       · THE FAIL-SAFE. `{off:true}` — which is also every client between this
         build and the lane-C apply — paints NO row at all. Not an empty frame,
         not "nobody is here".
       · IT IS NOT PERSISTENCE. `_town` is scratch: the residue allowlist must
         never carry it, or the client would hold its own view of other people
         across a reload (the residue-ahead class with a social face). */
  () => tryRun('TOWN-1: the town presence rail + The Crier paint from a server projection, and vanish when the realm has no common', () => {
    const T = window.HearthriseTown, TP = window.HearthriseTownPanel;
    assert(T && typeof T.__setTown === 'function' && TP && typeof TP.townPanelHtml === 'function',
      'the Common seams are not published — this test would pass vacuously');
    const RF = window.HearthriseCapstone && window.HearthriseCapstone.RESIDUE_FIELDS;
    assert(Array.isArray(RF) && !RF.some((f) => String(f).charAt(0) === '_')
      && !['_town', '_place', 'zone', 'pos', 'quiet'].some((f) => RF.includes(f)),
      'presence is scratch: the residue must carry no `_` field and never zone/pos/quiet — ' + JSON.stringify(RF));
    const prior = window.G._town;
    try {
      window.showTab('profile');
      const mon = Object.keys(window.MONSTERS || {})[0];
      const view = T.__setTown({
        ok: true, zone: 'the_common', now: new Date().toISOString(), stale_s: 7, here: 214, shown: 3, cap: 60,
        peers: [
          { name: 'Paione', activity_kind: 'combat', activity_id: mon, activity_label: 'a beast', level_band: 40, seen_ago_s: 20, away: false },
          { name: 'Tamsin', activity_kind: 'gather', activity_id: 'copper_rock', activity_label: 'Copper ore', level_band: 20, seen_ago_s: 4200, away: true },
          { name: 'Bram', activity_kind: 'combat', activity_id: null, activity_label: 'Bog Lurker', level_band: 30, seen_ago_s: 90, away: false },
        ],
        crier: [{ name: 'Paione', item_id: 'ruby', source_kind: 'monster', source_id: mon, one_in: 5000, found_ago_s: 120 }],
      });
      assert(view.status === 'ok' && window.G._town === view, 'the projection parks in G._town scratch');
      window.HearthriseHome.render();
      const row = document.querySelector('#hd-root .tc-row');
      assert(row, 'the Common did not paint its own row on Home');
      const grps = [...row.querySelectorAll('.tc-grp')].map((e) => e.textContent.trim());
      assert(grps.length === 2 && /Out hunting\s*2/.test(grps.join(' ')) && /Out gathering\s*1/.test(grps.join(' ')),
        'the rail groups people by WHERE they are, with per-group counts: ' + JSON.stringify(grps));
      assert(row.textContent.indexOf('214') < 0 && /3 of many shown/.test(row.textContent) && row.querySelector('[data-town-quiet]'),
        'the true population is NEVER painted (a capped list says "of many") and the opt-out is on the panel: ' + row.textContent.slice(0, 220));
      const peers = [...row.querySelectorAll('.tc-peer')];
      const away = row.querySelector('.tc-peer.is-away');
      assert(peers.length === 3 && away && /Tamsin/.test(away.textContent) && !peers[0].classList.contains('is-away'),
        'every peer is listed with away folk dimmed by class and sorted last, got ' + peers.length + ' peer(s)');
      assert(away.getAttribute('data-town-peer') === 'Tamsin' && /Lv 20–29/.test(away.textContent),
        'each name carries the inspect seam and the SERVER\'s coarse band reads as a range: ' + away.textContent);
      /* THE CATALOGUE, NOT THE WIRE: the monster's authored name beats the
         server's coarse label, and an unknown id falls back to that label. */
      assert(peers[0].textContent.indexOf(window.MONSTERS[mon].name) >= 0 && peers[0].textContent.indexOf('a beast') < 0
        && row.textContent.indexOf('Bog Lurker') >= 0,
        'a known activity_id renders the AUTHORED name and an unknown one falls back to the label: ' + peers[0].textContent);
      const crier = [...row.querySelectorAll('.tc-line')];
      assert(crier.length === 1 && /Paione found .+ from .+ \(1 in 5,000\)/.test(crier[0].textContent)
        && /2 min ago/.test(crier[0].textContent),
        'The Crier states the hearthfind with its odds and a relative time: ' + (crier[0] && crier[0].textContent));
      /* THE FAIL-SAFE, through the same render path the player gets — first the
         flag-down body, then the shape every client answers before the apply. */
      T.__setTown({ ok: true, off: true });
      window.HearthriseHome.render();
      assert(!document.querySelector('#hd-root .tc-row'), 'a realm with no common must paint no row at all');
      assert(TP.townPanelHtml({ status: 'unknown', peers: [], crier: [] }, Date.now()) === ''
        && TP.townPanelHtml(T.normalizeTown({ ok: false, error: 'rate_limited' }), Date.now()) === '',
        'an unanswered read and a refusal both paint nothing');
    } finally {
      window.G._town = prior;
      window.showTab('profile');
    }
  }),

  /* ── STUB-ORIGIN-1 — regression suite — THE HARNESS ORIGIN IS NOT A SERVER ─
     `https://test.local` is `stubSignedIn`'s own fake origin. A module that runs
     on a CADENCE and reads the CONFIGURED origin spends a request on it for as
     long as a stubbed session stands; the CSP refuses it, and the refusal is a
     PAGE ERROR that fails the run's clean-console gate however many tests passed.
     Two callers, measured, NOT the same two in every runner — which is why one
     fix for one symptom would read green here and stay red there:
       · GitHub 36001561175 on next@c380562d (`passed 1354/1367 failed 0`, step
         exit 1) caught net/town.js's 25 s poll and its heartbeat — `Fetch API
         cannot load https://test.local/rest/v1/rpc/hr_heartbeat … violates the
         document's Content Security Policy`, and the same for hr_town_of;
       · this runner catches network-status.js's 4 s reconnect probe (twice per
         run) and never the town pair.
     c380562d widened the window; it did not create it. No number was ever lost.
     THE PROPERTY, for the class: while a stubbed session stands, not one request
     leaves for the stub origin from any channel on the helper's list, and every
     pause is BALANCED, so each is live again the moment the stub is restored.

     MUTATION: comment out the `__pauseForTest` line in `stubSignedIn` → RED,
     `the stub origin was asked for 4 request(s): …/hr_town_of, …/hr_heartbeat,
     2 network-status probe(s)`. The spy REJECTS a stub-origin request, so even
     the RED run raises none of the page errors this test exists to prevent. */
  () => tryRunAsync('STUB-ORIGIN-1: a stubbed session pauses every cadenced channel, and none asks the harness origin', async () => {
    const T = window.HearthriseTown, N = window.HearthriseNetStatus;
    const hookable = (m) => m && typeof m.__pauseForTest === 'function' && typeof m.__resumeForTest === 'function';
    assert(hookable(T) && typeof T.refreshTown === 'function' && typeof T.heartbeat === 'function'
      && hookable(N) && typeof N.__probeForTest === 'function' && typeof N.__probesForTest === 'function',
      'a channel on the helper\'s list has no pause seam — this test would pass vacuously');
    const realFetch = window.fetch, hits = [], prior = window.G._town;
    const STUB = 'https://test.local';
    /* TWO OBSERVATION POINTS: net/town.js goes out through `window.fetch`, but
       network-status.js holds the fetch it captured at module load, so no spy
       can see its probe — its own counter is the only honest read of that half. */
    const probes0 = N.__probesForTest();
    window.fetch = function (input, init) {
      const url = String((input && input.url) || input || '');
      if (url.indexOf(STUB) === 0) { hits.push(url); return Promise.reject(new Error('blocked by STUB-ORIGIN-1')); }
      return realFetch.apply(this, arguments);
    };
    try {
      const unstub = stubSignedIn(0, 'Wren');
      /* Driven directly rather than waited out (the intervals are 25 s and 4 s).
         Three straddle the restore unawaited — the "after teardown with a cached
         config" half of the live symptom. */
      const straddling = [T.refreshTown(Date.now() + T.TOWN_POLL_MS), T.heartbeat(Date.now() + T.TOWN_POLL_MS), N.__probeForTest()];
      await T.refreshTown(Date.now() + T.TOWN_POLL_MS);
      await T.heartbeat(Date.now() + T.TOWN_POLL_MS);
      await N.__probeForTest();
      unstub();
      await Promise.all(straddling);
      await T.refreshTown(Date.now() + T.TOWN_POLL_MS * 2);
      await T.heartbeat(Date.now() + T.TOWN_POLL_MS * 2);
      const spent = N.__probesForTest() - probes0;
      assert(!hits.length && !spent, 'the stub origin was asked for ' + (hits.length + spent)
        + ' request(s): ' + hits.concat(spent ? [spent + ' network-status probe(s)'] : []).join(', '));
      assert(T.__pauseForTest() === 1 && T.__resumeForTest() === 0
        && N.__pauseForTest() === 1 && N.__resumeForTest() === 0,
        'the stub did not resume a channel it paused — a depth did not return to zero, so that channel '
        + 'stays dead for every arm after it and this test would pass by silencing the feature');
    } finally {
      window.fetch = realFetch;
      window.G._town = prior;
    }
  }),

  /* ── FIRST-LIGHT-1 — the first day, played ──────────────────────────────
     THE HAPPY PATH for docs/planning/FEATURE_SLATE.md §1: a brand-new
     character opens Home and sees the whole first-day chain, with the first
     step lit; they finish it and the card moves on WITHOUT being re-rendered
     by hand, because the card is a read of the rows the engine already keeps.

     It drives the REAL engine (`updateQuest`), not a hand-set `done` flag, so
     it also proves the completion path still fires `hr_claim_quest` — the
     claimable state the card draws is the server's outstanding claim, never a
     client-invented one.

     ⚠ THE CLAIM IS STUBBED, and it must be. This suite runs on a live signed-in
       account during the play gate; an unstubbed `updateQuest('gather',15)`
       would post a real hr_claim_quest for the QA character and pay a real
       quest out of a test. The stub is the same idiom two hundred lines up. */
  () => tryRun('FIRST-LIGHT-1: Home pins the whole first-day chain, row 1 lit; finishing step 1 lights step 2', () => {
    const snap = snapshotG();
    const origClaim = window.HearthriseGoalClaim;
    const fired = [];
    try {
      const H = window.HearthriseHome;
      assert(H && typeof H.__firstDayModel === 'function' && typeof H.__firstDayHtml === 'function',
        'the First Light seams are not published — this test would pass vacuously');
      assert(Array.isArray(window.QUEST_DEFS) && window.QUEST_DEFS.length > 0,
        'CONTROL: QUEST_DEFS is the chain; without it there is nothing to render');

      window.HearthriseGoalClaim = {
        isSignedIn: () => false,     // the recovery sweep must not also fire
        claimQuest: (id) => { fired.push(id); return Promise.resolve({ ok: false, error: 'test_stub' }); },
      };

      /* A FRESH CHARACTER. The two MIRRORED rows (farmhand, hundred_kills)
         read their progress off G.stats, so a live account's lifetime counters
         would complete them before the card ever drew — zero the counters and
         the fixture is a first boot rather than whoever ran the suite. */
      window.G.stats = { kills: 0, gathered: 0, harvested: 0, cropsHarvested: 0, rareDrops: 0 };
      window.G.quests = [];
      window.G.daily = { lastReset: window.hrGoalDayKey(), tasks: [] };
      window.ensureRetentionState();

      const m0 = H.__firstDayModel();
      assert(m0, 'a fresh character has an open chain — the card must draw');
      /* THE COUNT IS THE DATA'S, NEVER FIVE. Five today, six the day the
         `first_light` capstone row lands; asserting a literal here is how a
         lane-C row would arrive and silently not be shown. */
      assert(m0.total === window.QUEST_DEFS.length,
        'the card must render every chain row the data declares: QUEST_DEFS has '
        + window.QUEST_DEFS.length + ', the card drew ' + m0.total);
      assert(m0.steps.length === m0.total, 'model.total must equal the rows drawn');
      assert(m0.steps[0].id === 'gatherer', 'row 1 must be the first authored step, got ' + m0.steps[0].id);
      assert(m0.currentIndex === 0 && m0.steps[0].state === 'current',
        'row 1 must be the lit step on a fresh character, got ' + m0.steps[0].state);
      assert(m0.steps.every((s, i) => i === 0 || s.state === 'ahead'),
        'no step past the first is current, and none is "locked" — they all count from minute one');

      /* The rows are DOORS, resolved by the one shared resolver — never a
         private route table in the dashboard. */
      const QN = window.HearthriseQuestNav;
      assert(QN && typeof QN.destination === 'function', 'CONTROL: the quest-nav resolver must be loaded');
      m0.steps.forEach((s) => {
        const d = QN.destination(s.goalRow);
        assert(d && d.tab && d.via !== 'fallback',
          'chain step "' + s.id + '" has no resolved destination — its row would be a dead door');
      });

      const html0 = H.__firstDayHtml(m0);
      assert(/Your first day/.test(html0), 'the card must be titled: ' + html0.slice(0, 200));
      assert(new RegExp('Step 1 of ' + m0.total).test(html0),
        'the header states the step, derived: ' + html0.slice(0, 300));
      assert(/is-current/.test(html0), 'the lit step carries its state class');

      // ── the player finishes step one, through the real engine ──
      window.updateQuest('gather', 15);
      assert(fired.indexOf('gatherer') !== -1,
        'completing a chain quest must fire hr_claim_quest for it — the "reward on the way" row is the '
        + 'server\'s outstanding claim, not a label the card invented');

      const m1 = H.__firstDayModel();
      assert(m1, 'four steps are still open — the card must still draw');
      assert(m1.steps[0].state === 'claimable',
        'a finished, server-payable, unconfirmed step reads claimable, got ' + m1.steps[0].state);
      assert(m1.currentIndex === 1 && m1.steps[1].state === 'current',
        'step 2 must light up, got currentIndex ' + m1.currentIndex);
      assert(m1.steps[1].id === window.QUEST_DEFS[1].id,
        'step 2 must be the second AUTHORED row, got ' + m1.steps[1].id);

      const html1 = H.__firstDayHtml(m1);
      assert(/is-claimable/.test(html1) && /Reward on the way/.test(html1),
        'the claimable step must say so: ' + html1.slice(0, 400));
      assert(new RegExp('Step 2 of ' + m1.total).test(html1), 'the header must advance with the chain');

      /* NOTHING WAS AUTHORED CLIENT-SIDE. The card is a read; the only writes
         are the engine's own (done + progress), and no gold/xp/item crossed. */
      assert(m1.steps[0].goalRow.claimed !== true,
        'a refused claim must never mark the row paid — the sweep has to be able to retry it');
    } finally {
      window.HearthriseGoalClaim = origClaim;
      restoreG(snap);
    }
  }),

  () => tryRun('action: gain XP from a skill tick', () => {
    const snap = snapshotG();
    try {
      // Mining copper rock at level 1 = guaranteed first-tick yield.
      if (typeof window.startSkill !== 'function') return;
      const beforeXp = (window.G.skills?.mining?.xp) || 0;
      window.startSkill('mining', 'copper_rock', 1500);
      // Manually tick the skill engine if exposed (most builds expose it
      // as window.applySkillTick or run it in a setInterval). Otherwise
      // we just assert the intent state was set correctly.
      assert(window.G.activeSkill === 'mining', 'activeSkill should be mining');
      assert(window.G.skillTargetId === 'copper_rock', 'skillTargetId should be copper_rock');
      window.stopSkill();
      assert(!window.G.activeSkill, 'stopSkill failed to clear activeSkill');
    } finally { restoreG(snap); }
  }),

  () => tryRun('action: equip + unequip a weapon', () => {
    const snap = snapshotG();
    try {
      // Grant a bronze sword + try to equip it. The equipment slot
      // should reflect it post-equip; then unequip restores nothing.
      if (typeof window.equipItem !== 'function') return;
      window.G.inventory = window.G.inventory || {};
      window.G.inventory.bronze_sword = (window.G.inventory.bronze_sword || 0) + 1;
      window.equipItem('bronze_sword');
      const slot = window.G.equipment?.weapon || window.G.equipment?.mainhand;
      assert(slot === 'bronze_sword', `expected weapon slot=bronze_sword, got ${slot}`);
      // Unequip — most builds expose this as unequipSlot('weapon')
      if (typeof window.unequipSlot === 'function') {
        window.unequipSlot('weapon');
        const after = window.G.equipment?.weapon || window.G.equipment?.mainhand;
        assert(!after || after !== 'bronze_sword', `weapon slot should be empty after unequip, got ${after}`);
      }
    } finally { restoreG(snap); }
  }),

  () => tryRun('action: combat starts + sets activeMonster', () => {
    const snap = snapshotG();
    try {
      if (typeof window.startCombat !== 'function') return;
      window.startCombat('slime');
      const am = window.G.activeMonster;
      const id = (typeof am === 'string') ? am : am?.id;
      assert(id === 'slime', `startCombat did not set activeMonster, got ${JSON.stringify(am)}`);
      // playerHp should have a value during combat
      assert(window.G.playerHp > 0 || window.G.hp > 0, 'playerHp should be > 0 during combat');
      window.stopCombat();
      assert(!window.G.activeMonster, 'stopCombat did not clear activeMonster');
    } finally { restoreG(snap); }
  }),

  () => tryRun('action: the session tally counts SETTLED server credit only (never a projection)', () => {
    const ST = window.HearthriseSessionTally;
    assert(ST && typeof ST.addReceipt === 'function', 'HearthriseSessionTally must be exposed');

    // A client-authored receipt (no serverAuthoritative flag) must NEVER count —
    // this is the whole settled-only invariant, and it is what stops a forged
    // local number from entering the tally.
    const forged = { gainedGold: 1e9, gainedXp: 1e9, gainedItems: 99, gainedKills: 50, awayMs: 3600000, at: 1000 };
    let acc = ST.addReceipt(ST.emptyTally(), forged);
    assert(acc.gold === 0 && acc.settles === 0, 'a non-serverAuthoritative receipt must be ignored');

    // A settled receipt counts exactly once, and the per-hour figure is
    // settled-total / settled-paid-span — actuals over credited time, not a
    // forecast. 600 gold + 1200 xp over 0.5h => 1200 gold/h, 2400 xp/h.
    const settled = { serverAuthoritative: true, version: 7, gainedGold: 600, gainedXp: 1200,
      gainedItems: 4, gainedKills: 3, awayMs: 1800000, at: 2000 };
    acc = ST.addReceipt(ST.emptyTally(), settled);
    assert(acc.gold === 600 && acc.kills === 3 && acc.settles === 1, 'a settled receipt must count once');
    assert(Math.round(ST.perHour(acc.gold, acc.paidMs)) === 1200, 'gold/h must be settled gold / settled span');

    const shape = ST.tallyForReceipt(settled);
    assert(shape.ready === true, 'a receipt with a credited span must be ready to render');
    assert(Math.round(shape.perHour.xp) === 2400, 'xp/h from 1200 xp over 0.5h must be 2400');
    assert(shape.net === 600, 'net must be the settled gold in');

    // No credited span => NO rate. A projection is exactly what this refuses.
    const noSpan = ST.tallyForReceipt({ serverAuthoritative: true, version: 8, gainedGold: 100, awayMs: 0, at: 3 });
    assert(noSpan.ready === false && noSpan.perHour.gold === null,
      'with no credited span there must be no per-hour rate (no projection)');

    // The away card and the live Fight strip read ONE shape — same receipt in,
    // same formatted rows out. This is the guarantee that they cannot diverge.
    const rows = ST.tallyRows(shape);
    assert(rows.some((r) => r.key === 'xp' && r.value === '2,400'), 'tallyRows must format the settled xp/h');
    assert(rows.some((r) => r.key === 'kills' && r.value === '3'), 'tallyRows must carry settled kills');

    // The live accumulator must be wired and must ignore a forged receipt too.
    const CS = window.HearthriseCombatScreens;
    if (CS && CS._session) {
      const before = CS._session.shape();
      assert(before && typeof before.ready === 'boolean', 'the live session shape must be readable');
    }
  }),

  () => tryRun('action: cook a fish creates a buff item', () => {
    const snap = snapshotG();
    try {
      // SA-013: this was an "informational, don't fail" test — it tried three
      // cook entry points, swallowed every error, and asserted NOTHING (its own
      // comment said so), so it passed even if cooking produced no food at all.
      // Cooking is server-routed (and paused in this build), so the live LOOP
      // is exercised by the withCookingArmed core-sim battery elsewhere; here we
      // assert the DATA the test's name promises: the "cook a fish" recipe
      // exists and its output is a genuine BUFF item. Teeth: rename/remove the
      // recipe, drop the buff, and this fails. (Loop-level outcome assertion:
      // increment 2, once cooking re-arms — see the SA-013 backlog.)
      const cooking = (window.ARTISAN_RECIPES && window.ARTISAN_RECIPES.cooking) || [];
      const rec = cooking.find((r) => r && r.input === 'shrimp' && r.output === 'cooked_shrimp');
      assert(rec, 'the "cook a fish" recipe (shrimp -> cooked_shrimp) is missing from ARTISAN_RECIPES.cooking');
      const out = (window.ITEMS || {})[rec.output];
      assert(out && (out.buff || out.heals), 'the cooked fish is not a buff/food item (no buff, no heals): ' + rec.output);
      // Best-effort exercise of whatever direct cook entry the build exposes — it
      // must not throw even when it no-ops under server authority.
      window.G.inventory = window.G.inventory || {};
      window.G.inventory.shrimp = (window.G.inventory.shrimp || 0) + 5;
      if (typeof window.cookFood === 'function') { try { window.cookFood('shrimp'); } catch {} }
      else if (typeof window.startCook === 'function') { try { window.startCook('cooked_shrimp'); } catch {} }
    } finally { restoreG(snap); }
  }),

  () => tryRun('action: plant + harvest a farm plot (state-level)', () => withFarmServer(
    (verb, args) => (verb === 'farmPlant'
      ? { ok: true, plot: args[0], crop: args[1], planted_at: new Date().toISOString(), seed_spent: 'turnip_seed', plant_xp: 28 }
      : { ok: true, plot: args[0], crop: 'turnip', produce: 'turnip', qty: 3, xp: 30, regrew: false, withered: false }),
    (calls) => {
      /* b514: the gesture is an INTENT and the plot is what the SERVER said.
         Planting a turnip must reach hr_farm_plant with this plot and this crop
         and nothing else; harvesting must credit the server's qty, once. */
      const snap = snapshotG();
      try {
        if (typeof window.plantCrop !== 'function') return;
        window.G.inventory = window.G.inventory || {};
        window.G.inventory.turnip_seed = (window.G.inventory.turnip_seed || 0) + 1;
        /* The pre-flight counts what the SERVER holds (gateItemCount), so the
           fixture states a server bag or the intent is never sent. */
        window.G._serverBag = Object.assign({}, window.G._serverBag, { turnip_seed: 1 });
        window.G.farmPlots = window.G.farmPlots || [];
        window.G.farmPlots[0] = null;
        window.plantCrop(0, 'turnip');
        assert(calls.length === 1 && calls[0].verb === 'farmPlant',
          'planting must send exactly one hr_farm_plant intent, got ' + JSON.stringify(calls.map((c) => c.verb)));
        assert(calls[0].args[0] === 0 && calls[0].args[1] === 'turnip',
          'the intent carries the plot and the crop id only, got ' + JSON.stringify(calls[0].args));
        const plot = window.G.farmPlots[0];
        assert(plot && plot.cropId === 'turnip' && plot.state === 'growing',
          `plot[0] should hold the server's growing turnip, got ${JSON.stringify(plot)}`);
        // Fast-forward + harvest: the produce is the SERVER's number, applied once.
        plot.state = 'ready';
        const beforeQty = window.G.inventory.turnip || 0;
        window.harvestPlot(0);
        assert(calls.length === 2 && calls[1].verb === 'farmHarvest',
          'harvesting must send one hr_farm_harvest intent, got ' + JSON.stringify(calls.map((c) => c.verb)));
        const afterQty = window.G.inventory.turnip || 0;
        assert(afterQty - beforeQty === 3,
          `harvest must credit the SERVER's qty (3) exactly once: before=${beforeQty} after=${afterQty}`);
        assert(window.G.farmPlots[0] == null, 'a non-regrowing crop leaves the plot cleared');
      } finally { restoreG(snap); }
    })),

  // b420 regression: a perennial (tomato/emberfruit) is FINITE. It regrows
  // `regrowLimit` times after the first harvest, then the plant withers and
  // the plot clears — it must NOT yield free food forever (the reported bug).
  () => tryRun('action: perennial tomato regrows then withers (the SERVER decides which)', () => {
    /* b420 regression, restated for the cutover. The FINITE-PERENNIAL RULE is
       hr_farm_harvest's (2026-08-22-server-farming-complete.sql §10 asserts the
       ladder); the client's job is to render whichever of `regrew` / `withered`
       comes back, and to keep regrowCount in step. Both are asserted here, plus
       the catalogue fact the two sides share: tomato must still BE a finite
       perennial, or neither half has a ladder to run. */
    if (typeof window.harvestPlot !== 'function' || !window.CROPS || !window.CROPS.tomato) return;
    const crop = window.CROPS.tomato;
    assert(crop.regrows === true && (crop.regrowLimit || 0) > 0,
      `tomato must be a finite perennial (regrows + regrowLimit>0), got regrows=${crop.regrows} limit=${crop.regrowLimit}`);
    // A regrow: the plot comes back growing with the count advanced.
    withFarmServer(() => ({ ok: true, plot: 0, crop: 'tomato', produce: 'tomato', qty: 4, xp: 60, regrew: true, withered: false }), (calls) => {
      const snap = snapshotG();
      try {
        window.G.farmPlots = window.G.farmPlots || [];
        window.G.farmPlots[0] = { cropId: 'tomato', plantedAt: Date.now() - 3600000, waterings: [], state: 'ready', regrowCount: 2 };
        window.harvestPlot(0);
        assert(calls.length === 1 && calls[0].verb === 'farmHarvest', 'a harvest must send one intent');
        const p = window.G.farmPlots[0];
        assert(p && p.state === 'growing' && p.regrowCount === 3,
          `a server regrow must leave a growing plot with regrowCount 3, got ${JSON.stringify(p)}`);
      } finally { restoreG(snap); }
    });
    // The wither: the plant does NOT yield forever (the reported bug).
    withFarmServer(() => ({ ok: true, plot: 0, crop: 'tomato', produce: 'tomato', qty: 4, xp: 60, regrew: false, withered: true }), () => {
      const snap = snapshotG();
      try {
        window.G.farmPlots[0] = { cropId: 'tomato', plantedAt: Date.now() - 3600000, waterings: [], state: 'ready', regrowCount: crop.regrowLimit };
        window.harvestPlot(0);
        assert(window.G.farmPlots[0] == null,
          `a server wither must clear the plot, got ${JSON.stringify(window.G.farmPlots[0])}`);
      } finally { restoreG(snap); }
    });
  }),

  // gold-arm: upgradeRoom's debit is gated by clientMayWriteRecordField
  // (switch-OFF position); the stamp makes the affordability read known.
  () => tryRunAsync('action: upgrade a house room (state-level)', async () => {
    const snap = snapshotG();
    try {
      if (typeof window.upgradeRoom !== 'function') return;
      // b201 homestead gate: rooms are tier-locked (a tier-0 camp has no
      // workbenches). Raise the property tier so the kitchen is buildable —
      // restoreG puts the real tier back afterwards.
      window.G.homestead = { tier: 5 };
      // Give plenty of gold + the materials kitchen lv1 needs.
      window.G.gold = (window.G.gold || 0) + 100000;
      stampBalanceLikeLoad(window.G);   // armed: upgradeRoom reads gold via canAfford
      window.G.inventory = window.G.inventory || {};
      // Pre-pay every possible mat cost in absurd quantity.
      const mats = ['normal_log','oak_log','willow_log','copper_bar','iron_bar','stone','normal_plank','oak_plank'];
      for (const m of mats) window.G.inventory[m] = 999;
      /* b515: the rung is the SERVER's — `clientMayWriteRecordField('rooms')` is
         false and `upgradeRoom` advances nothing locally, so the build has to be
         answered before it can be read. */
      const beforeLv = window.G.rooms?.kitchen || 0;
      await withRoomServer({ kitchen: beforeLv + 1 }, window.G.gold - 1, async (rig) => {
        window.upgradeRoom('kitchen');
        await rig.drain();
        assert(rig.sent.length === 1 && rig.sent[0].verb === 'unlock_buy',
          'the build must send exactly one unlock_buy: ' + JSON.stringify(rig.sent));
        const afterLv = window.G.rooms?.kitchen || 0;
        assert(afterLv === beforeLv + 1, `kitchen should be Lv ${beforeLv + 1}, got ${afterLv}`);
      });
    } finally { restoreGAndRecord(snap); }
  }),

  () => tryRun('action: create + cancel a market listing', () => {
    const snap = snapshotG();
    try {
      // Real API: M.listItem(itemId, qty, askEach) → { ok, reason?, id? }
      // M.cancelListing(listingId) → { ok }. b127 fixed this test.
      const M = window.HearthriseMarket;
      if (!M || typeof M.listItem !== 'function') return;
      window.G.inventory = window.G.inventory || {};
      window.G.inventory.normal_log = (window.G.inventory.normal_log || 0) + 10;
      const beforeQty = window.G.inventory.normal_log;
      const r = M.listItem('normal_log', 1, 5);
      assert(r && r.ok, 'listItem should succeed, got ' + JSON.stringify(r));
      assert(window.G.inventory.normal_log === beforeQty - 1,
        'inventory should decrement by 1 after listing (escrow), before=' + beforeQty + ' after=' + window.G.inventory.normal_log);
      // Cancel — find the listing id we just created.
      const all = (typeof M.list === 'function') ? M.list() : [];
      const mine = all.filter && all.filter(l => l.itemId === 'normal_log' && l.qty === 1 && l.askEach === 5);
      if (mine && mine.length && typeof M.cancelListing === 'function') {
        M.cancelListing(mine[mine.length - 1].id);
      }
    } finally { restoreG(snap); }
  }),

  () => tryRun('action: purchase a market listing', () => {
    const snap = snapshotG();
    try {
      const M = window.HearthriseMarket;
      // SA-013: an absent market API is an unarmed seam, not a silent pass.
      if (!M || typeof M.listItem !== 'function' || typeof M.buyListing !== 'function') {
        skip('HearthriseMarket listItem/buyListing seam absent'); return;
      }
      window.G.gold = (window.G.gold || 0) + 1000;
      window.G.inventory = window.G.inventory || {};
      window.G.inventory.normal_log = (window.G.inventory.normal_log || 0) + 5;
      const r = M.listItem('normal_log', 1, 5);
      // The listing itself is the first real assertion: listing a held item must succeed.
      assert(r && r.ok, 'listItem(normal_log) failed: ' + JSON.stringify(r));
      const all = (typeof M.list === 'function') ? M.list() : [];
      const mine = all.filter && all.filter(l => l.itemId === 'normal_log');
      assert(mine && mine.length, 'the listing we just created is not in M.list()');
      // We're the seller of every test listing — buyListing usually rejects
      // self-purchases with a value, but it must not THROW (counted assertion).
      callOk('buyListing (self-purchase)', () => M.buyListing(mine[mine.length - 1].id, 1));
      // Clean up: cancel anything we left
      if (typeof M.cancelListing === 'function') {
        for (const l of (mine || [])) try { M.cancelListing(l.id); } catch {}
      }
    } finally { restoreG(snap); }
  }),

  () => tryRun('action: claim a daily quest reward', () => {
    const snap = snapshotG();
    try {
      // Force-complete a daily quest then trigger the claim. Quest ID
      // shape varies; we use whichever the build exposes.
      if (!window.G.quests || typeof window.claimQuest !== 'function') {
        skip('quests state / claimQuest seam absent'); return;
      }
      const dailies = (window.G.quests.daily || window.G.quests.dailies || []);
      if (!dailies.length) { skip('no daily quests present to claim in this state'); return; }
      const q = dailies[0];
      q.progress = q.target || 1;
      q.completed = true;
      // The contract this test's name promises: claiming a completed daily must
      // not throw. Quest reward shapes vary across builds, so the no-throw is the
      // stable assertion (counted) — not a fake pass on a swallowed error.
      callOk('claimQuest(' + q.id + ')', () => window.claimQuest(q.id));
    } finally { restoreG(snap); }
  }),

  () => tryRun('action: save + reload localStorage round-trip', () => {
    const snap = snapshotG();
    try {
      // gold-arm: gold USED to be this test's round-trip proxy, but gold is now a
      // SERVER_OF_RECORD field — stripServerOfRecord DELETES it on the way in and
      // hr_load re-supplies it, so a save→reload deliberately does NOT round-trip
      // gold through the blob (that is the whole point of the record move). Prove
      // the round-trip on a genuinely-persisted, non-record field instead.
      /* b515 — THERE IS NO LOCAL ROUND-TRIP LEFT, AND THE DURABILITY MOVED.
         This drove a save→load round-trip with the blob pinned live and asserted
         a client-owned counter came back. b515 deleted both halves of that trip:
         `saveLocal` is one `lastSeen` stamp and `loadLocal` reads nothing and
         DROPS what it finds. Pinning the blob no longer selects a branch — it
         selects a branch that is gone — so the assertion would report a field
         surviving a journey nothing took.

         The two properties are re-pointed at where they live now:
           · b127 (loadLocal mutates G IN PLACE — a reassignment silently breaks
             every module holding `window.G`) is asserted against the real
             loadLocal, unpinned. It is the same defect and the same call.
           · DURABILITY of a client-owned counter is the RESIDUE's job now
             (`stats` is on RESIDUE_FIELDS), and it is proven end to end through
             the real `buildResiduePatch` → `hydrateInto` pair — the two functions
             the capstone save and the capstone load actually use. `hydrateInto`
             is the security boundary that must not trust an arbitrary bag key,
             so exercising it here is strictly more than the blob trip was. */
      if (typeof window.loadLocal !== 'function') return;
      const CAP = window.HearthriseCapstone, CS = window.HearthriseClientState;
      assert(CAP && typeof CAP.buildResiduePatch === 'function'
        && CS && typeof CS.hydrateInto === 'function',
        'the capstone residue pair is not published — there is then no durable store for a client-owned field at all');
      const tag = 12345;
      window.G.stats = window.G.stats || {};
      const killsBefore = window.G.stats.kills || 0;
      const gRef = window.G;
      window.G.stats.kills = killsBefore + tag;

      const patch = CAP.buildResiduePatch(window.G);
      assert(patch && patch.stats && patch.stats.kills === killsBefore + tag,
        'the residue patch does not carry `stats` — a client-owned counter would be lost on every reload: '
        + JSON.stringify(patch && patch.stats));

      window.G.stats = { kills: -1 };          // mutate in memory only
      window.loadLocal();
      assert(window.G === gRef, 'loadLocal replaced the G reference instead of mutating it in place (b127)');
      CS.hydrateInto(window.G, patch);
      assert((window.G.stats && window.G.stats.kills) === killsBefore + tag,
        `the residue round-trip lost a persisted field: expected ${killsBefore + tag}, got ${window.G.stats && window.G.stats.kills}`);
    } finally {
      /* Restore + persist cleanup so we don't leave the player +12345g.
         b456: restoreGAndRecord, because the real loadLocal above ends in
         forgetServerOfRecord — putting the VALUES back without re-stamping the
         RECORD leaves every armed field UNKNOWN for the rest of the run. */
      restoreGAndRecord(snap);
      try { window.saveLocal(); } catch {}
    }
  }),

  () => tryRun('action: smelt a copper bar (artisan loop)', () => {
    const snap = snapshotG();
    try {
      // SA-013: this asserted nothing — it started an artisan action, swallowed
      // any error, and passed regardless of whether a copper bar could ever be
      // smelted. The loop is server-routed; here we assert the DATA the name
      // depends on (the smelt recipe copper_ore -> copper_bar and a real output
      // item), which has teeth against a renamed/removed recipe. (Loop outcome:
      // increment 2, via the armed artisan-sim battery.)
      const smithing = (window.ARTISAN_RECIPES && window.ARTISAN_RECIPES.smithing) || [];
      const rec = smithing.find((r) => r && r.input === 'copper_ore' && r.output === 'copper_bar');
      assert(rec, 'the copper-bar smelt recipe (copper_ore -> copper_bar) is missing from ARTISAN_RECIPES.smithing');
      assert((window.ITEMS || {})[rec.output], 'smelt output copper_bar is not a known item');
      // Best-effort exercise of the live entry point — must not throw on a no-op.
      window.G.inventory = window.G.inventory || {};
      window.G.inventory.copper_ore = (window.G.inventory.copper_ore || 0) + 5;
      const startFn = window.startArtisan || window.startSmithing;
      if (typeof startFn === 'function') {
        try { startFn('copper_bar'); } catch (e) { /* recipe shape may differ under server routing */ }
        if (window.G.activeArtisanRecipe && typeof window.stopArtisan === 'function') window.stopArtisan();
      }
    } finally { restoreG(snap); }
  }),

  () => tryRun('action: equip + unequip a companion', () => {
    const snap = snapshotG();
    try {
      // b127: real field is `G.companions.equipped`, not `equippedId`.
      if (typeof window.equipCompanion !== 'function') return;
      /* b515: a companion can only be equipped if it is OWNED, and ownership is
         the server's now — `ensureState` fails closed to an empty roster rather
         than seeding the fox locally. The roster is installed through the real
         `reconcileCompanions` (withCompanionRoster) so this measures the
         equip/unequip gesture and not whatever an earlier test left behind. */
      withCompanionRoster(['fox'], null, () => {
        window.equipCompanion('fox');
        const eq = window.G.companions?.equipped;
        assert(eq === 'fox', `expected equipped=fox, got ${JSON.stringify(window.G.companions)}`);
        if (typeof window.unequipCompanion === 'function') {
          window.unequipCompanion();
          const after = window.G.companions?.equipped;
          assert(!after, `companion should be unequipped, got ${after}`);
        }
        /* AND AN UNOWNED ONE IS REFUSED. Without this the assertions above are
           satisfied by an `equipCompanion` that writes whatever it is handed —
           which is the residue-ahead shape: the client showing an entitlement
           the server never granted. */
        window.equipCompanion('lichling');
        assert(window.G.companions.equipped !== 'lichling',
          'a companion the player does not own was equipped — the client is authoring an entitlement');
      });
    } finally { restoreG(snap); }
  }),

  () => tryRun('action: enter and leave a clan (mock)', () => {
    const snap = snapshotG();
    try {
      if (typeof window.joinClan !== 'function' || typeof window.leaveClan !== 'function') {
        skip('joinClan/leaveClan seam absent'); return;
      }
      // joinClan is async on the live backend (a rejected promise from a missing
      // backend does NOT throw synchronously); the contract both these entry
      // points must honour is that the SYNCHRONOUS call does not throw. Assert it
      // (counted) instead of swallowing — the test name promises enter AND leave.
      callOk('joinClan', () => window.joinClan('TestClan'));
      callOk('leaveClan', () => window.leaveClan());
    } finally { restoreG(snap); }
  }),

  // ── b127 regression suite ──

  // b127: Character page rendered "HP: — / —" because it read G.hp +
  // window.getMaxHp(), neither of which exist. Real fields are
  // G.playerHp + G.playerMaxHp.
  () => tryRun('b127: character page shows real HP, not "—"', () => {
    if (typeof window.G !== 'object' || typeof window.G.playerHp !== 'number') return;
    window.showTab('character');
    // b229: HP now lives on the Hero sub-tab of the combined Character screen.
    window._charPane = 'hero';
    void document.body.offsetHeight;
    if (typeof window.renderCharacter === 'function') window.renderCharacter();
    void document.body.offsetHeight;
    const charPanel = document.getElementById('panel-character');
    if (!charPanel) return;
    const text = charPanel.textContent || '';
    const hpMatch = text.match(/HP:\s*([^\s/]+)\s*\/\s*([^\s]+)/);
    if (!hpMatch) return; // page may not show HP at all in some layouts
    const lhs = hpMatch[1], rhs = hpMatch[2];
    assert(lhs !== '—' && rhs !== '—',
      `Character HP shows em-dashes ("HP: ${lhs} / ${rhs}") — playerHp/playerMaxHp wiring broken`);
    window.showTab('profile');
  }),

  // b127: closeAllModals must dismiss every overlay style. Tests by
  // opening the Quests modal (qm-overlay element-removal pattern)
  // then asserting closeAllModals removes it.
  () => tryRun('b127: closeAllModals dismisses qm-overlay', () => {
    if (typeof window.openQuestsModal !== 'function' ||
        typeof window.closeAllModals !== 'function') return;
    window.openQuestsModal();
    let overlay = document.getElementById('quests-modal-overlay');
    assert(overlay, 'openQuestsModal did not create #quests-modal-overlay');
    window.closeAllModals();
    overlay = document.getElementById('quests-modal-overlay');
    assert(!overlay, 'closeAllModals did not remove #quests-modal-overlay');
  }),

  // b127: navigating to a different tab should auto-close any open
  // modal (the 3-modals-stacked-on-Combat bug from the QA sweep).
  () => tryRun('b127: showTab() auto-closes open modals', () => {
    if (typeof window.openQuestsModal !== 'function') return;
    window.openQuestsModal();
    assert(document.getElementById('quests-modal-overlay'), 'Quests modal did not open');
    window.showTab('combat');
    assert(!document.getElementById('quests-modal-overlay'),
      'Quests modal stayed open after navigating to Combat — showTab should auto-close');
    window.showTab('profile');
  }),

  // b127: hoursTillUTCMidnight must be on `window` so the quests
  // modal renderer can read it. Was rendering "Resets in ?h" because
  // the function declaration didn't reach the window scope from
  // inside the modal IIFE.
  () => tryRun('b127: hoursTillUTCMidnight exposed on window', () => {
    assert(typeof window.hoursTillUTCMidnight === 'function',
      'window.hoursTillUTCMidnight missing — quests modal will render "Resets in ?h"');
    const h = window.hoursTillUTCMidnight();
    assert(typeof h === 'number' && h >= 1 && h <= 24,
      'hoursTillUTCMidnight should return 1..24, got ' + h);
  }),

  // b127: smoke test for the universal close — it shouldn't throw if
  // there's nothing open.
  () => tryRun('b127: closeAllModals is safe when nothing open', () => {
    if (typeof window.closeAllModals !== 'function') return;
    // Make sure nothing is open first
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    if (typeof window.closeQuestsModal === 'function') window.closeQuestsModal();
    // Now call it — should be a no-op, must not throw. SA-013: assert BOTH the
    // no-throw contract and the post-condition (nothing is left open), instead
    // of only "did not throw".
    let threw = null;
    try { window.closeAllModals(); } catch (e) { threw = e; }
    assert(!threw, 'closeAllModals threw with nothing open: ' + (threw && threw.message));
    assert(document.querySelectorAll('.modal.show').length === 0, 'closeAllModals left a modal open');
  }),

  // b128: loadLocal must mutate G in place — earlier it did
  // `G = {...G, ...migrated}` which orphaned `window.G` as a stale
  // reference. Every feature that reads window.G post-load was getting
  // pre-load data. The save/load round-trip test caught it via gold
  // not restoring; this test pins the underlying invariant.
  () => tryRun('b128: loadLocal preserves window.G reference identity', () => {
    if (typeof window.saveLocal !== 'function' || typeof window.loadLocal !== 'function') return;
    const snap = snapshotG();
    try {
      const refBefore = window.G;
      window.saveLocal();
      window.loadLocal();
      assert(window.G === refBefore,
        'window.G changed identity across loadLocal — every feature holding a reference is now stale');
    } finally { restoreG(snap); }
  }),

  // ── b129 regression suite (user-story playthrough fixes) ──

  // b129: skill tile emoji glyphs were invisible because legacy.css forced
  // font-size:0 !important on .sicon, assuming an <img> child. With
  // _skillIcon empty (b122+), the emoji span had nothing to display.
  () => tryRun('b129: skill tile emoji glyphs render', () => {
    window.showTab('skills');
    if (typeof window.renderSkillsList === 'function') window.renderSkillsList();
    void document.body.offsetHeight;
    const tile = document.querySelector('#skills-list .skill-tile .sicon');
    if (!tile) return;
    const cs = getComputedStyle(tile);
    assert(parseFloat(cs.fontSize) > 0,
      'skill tile .sicon font-size is 0 — emoji glyph invisible. Got ' + cs.fontSize);
    window.showTab('profile');
  }),

  // b129: locked activity tile click should toast a "Requires Lv X" hint
  // instead of silently doing nothing. We can't reliably trigger toasts
  // in test, but we can verify the onclick attribute is no longer empty.
  () => tryRun('b129: locked activity tiles have feedback onclick', () => {
    window.showTab('skills');
    if (typeof window.openSkillDetail === 'function') window.openSkillDetail('smithing');
    void document.body.offsetHeight;
    const lockedTiles = document.querySelectorAll('#skill-detail .act-tile.locked');
    if (lockedTiles.length === 0) return; // no locked tiles in this state
    let dead = 0;
    for (const t of lockedTiles) {
      const oc = t.getAttribute('onclick') || '';
      if (!oc.trim()) dead++;
    }
    assert(dead === 0,
      dead + ' of ' + lockedTiles.length + ' locked tiles have empty onclick — players get no feedback');
    window.showTab('profile');
  }),

  // ── b130 regression suite ──

  // b130: getGoalsForToday must be on window so the Quests modal can find
  // it. Same pattern as b127's hoursTillUTCMidnight — top-level function
  // declarations don't reach window from inside the modal IIFE.
  () => tryRun('b130: getGoalsForToday exposed on window', () => {
    assert(typeof window.getGoalsForToday === 'function',
      'window.getGoalsForToday missing — Quests modal will show "No daily quests"');
    const goals = window.getGoalsForToday();
    assert(Array.isArray(goals), 'getGoalsForToday should return an array, got ' + typeof goals);
  }),

  // b130: openSkillDetail on mobile must scroll the detail into view.
  // Hard to verify without real layout — we check the wrapper invokes
  // scrollIntoView when called below 540px width. The code path uses
  // requestAnimationFrame so we just assert the function still works.
  () => tryRun('b130: openSkillDetail callable + scrolls on mobile', () => {
    if (typeof window.openSkillDetail !== 'function') return;
    window.showTab('skills');
    // SA-013: this test captured a `called` scroll-spy flag and then asserted
    // NOTHING (the comment even said so). Assert the two things it can prove
    // deterministically in the harness: the call does not throw on a real skill,
    // and it leaves a populated #skill-detail behind. (The mobile-scroll half of
    // the name needs a mobile viewport + rAF — filed to increment 2.)
    let threw = null;
    try { window.openSkillDetail('woodcutting'); void document.body.offsetHeight; }
    catch (e) { threw = e; }
    finally { window.showTab('profile'); }
    assert(!threw, 'openSkillDetail threw on woodcutting: ' + (threw && threw.message));
    const detail = document.getElementById('skill-detail');
    assert(detail && (detail.childElementCount > 0 || detail.textContent.trim().length > 0),
      'openSkillDetail did not populate #skill-detail');
  }),

  // b132: on mobile, low-priority topbar widgets (Total Level, streak,
  // notif bell, save, settings) hide so the essentials fit without
  // horizontal scroll clipping.
  () => tryRun('b132: low-priority topbar widgets hidden on mobile', () => {
    if (window.innerWidth > 540) { skip('mobile-only rule; desktop viewport'); return; }
    const ids = ['btn-notif', 'btn-settings']; // b227: btn-save removed
    let visible = 0;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && el.offsetWidth > 0) visible++;
    }
    assert(visible === 0,
      visible + ' of ' + ids.length + ' low-priority topbar buttons still visible on mobile (should be hidden, accessed via MORE menu)');
  }),

  // b132: on mobile, the quests modal qm-body should collapse to single
  // column. The 280px right sidebar (QUEST INFO) is hidden so the
  // quest list gets the full width.
  () => tryRun('b132: quest modal single-column on mobile', () => {
    if (window.innerWidth > 540) { skip('mobile-only rule; desktop viewport'); return; }
    if (typeof window.openQuestsModal !== 'function') { skip('openQuestsModal seam absent'); return; }
    window.openQuestsModal();
    const body = document.querySelector('#quests-modal-overlay .qm-body');
    if (!body) { if (window.closeQuestsModal) window.closeQuestsModal(); skip('quests modal body not rendered'); return; }
    const cs = getComputedStyle(body);
    const cols = (cs.gridTemplateColumns || '').split(' ').filter(Boolean).length;
    if (window.closeQuestsModal) window.closeQuestsModal();
    assert(cols <= 1,
      'qm-body should be single-column on mobile, got ' + cols + ' columns');
  }),

  // ── b133 — Batch A foundations (auto-actions + drop-log + migrations) ──

  // b133: HearthriseAuto API exists with the expected shape. Other
  // batches will call setEat/getTrainGoal/etc — if any of these is
  // missing the dependent batches break.
  () => tryRun('b133: HearthriseAuto API surface', () => {
    assert(window.HearthriseAuto, 'HearthriseAuto missing');
    const required = ['getEat', 'setEat', 'getTrainGoal', 'setTrainGoal',
                      'getFarmReplant', 'setFarmReplant', 'reset',
                      'maybeAutoEat', 'maybeStopTraining', 'maybeReplant'];
    for (const fn of required) {
      assert(typeof window.HearthriseAuto[fn] === 'function',
        'HearthriseAuto.' + fn + ' missing');
    }
  }),

  // b133: getEat returns the default shape; setEat persists.
  () => tryRun('b133: HearthriseAuto.setEat round-trips', () => {
    if (!window.HearthriseAuto) return;
    const before = window.HearthriseAuto.getEat();
    try {
      window.HearthriseAuto.setEat({ enabled: true, threshold: 0.3, foodId: 'cooked_shrimp' });
      const after = window.HearthriseAuto.getEat();
      assert(after.enabled === true, 'eat.enabled should be true');
      assert(after.threshold === 0.3, 'eat.threshold should be 0.3');
      assert(after.foodId === 'cooked_shrimp', 'eat.foodId should be cooked_shrimp');
    } finally {
      window.HearthriseAuto.setEat(before);
      if (window.HearthriseAuto._resetEatSync) window.HearthriseAuto._resetEatSync();
    }
  }),

  // ══ THE HUNT PANEL (docs/design/HUNT_ANALYZER_UI.md) ══════════════
  // PLAYER ACTIONS, happy path: a player opens the Hunt panel and reads what
  // last night was worth. The panel is a PURE function of the three
  // server-projected blocks, which is exactly what makes it assertable here —
  // there is no request to stub and no state to seed, because the client holds
  // no hunt arithmetic of its own.
  () => tryRun('hunt panel: the Hunt panel renders the server projection', () => {
    assert(typeof window.huntPanelHtml === 'function', 'huntPanelHtml missing');
    const html = window.huntPanelHtml({
      hunt: { stance: 'careful', stop: { hours: 8 } },
      // Today's PRODUCTION meter: 2026-09-22-vigour-daily.sql's whole shape,
      // WITHOUT the price-by-level fields (refills_left / next_refill_gold).
      vigour: { day_key: '2026-9-25', grant_min: 720, refills: 0, refills_max: 5, bought_min: 0,
        budget_min: 720, ceiling_min: 1320, spent_min: 512, remaining_min: 208, dry_mult: 0.25 },
      analyzer: {
        spawn_id: 'goblin', stance: 'careful', elapsed_ms: 11520000, paid_ms: 9660000,
        downtime_ms: 1860000, kills: 3114, kills_per_h: 974, deaths: 2, gold: 9800,
        loot_value: 41200, supplies_value: 8400, profit_per_h: 14200,
        xp_per_h: 18400, raw_xp_per_h: 21900, settled_at: new Date().toISOString(),
      },
      monsters: window.MONSTERS || {},
    });
    // THE TEN-SECOND TEST (§1), as four assertions.
    assert(/hunting/.test(html), 'the live pill does not say the character is hunting');
    assert(/hunt-stance-btn is-on/.test(html), 'no stance is visibly selected');
    assert(/Stops after 8 hours/.test(html), 'the stop rules are not stated as a sentence');
    assert(/\+ 14,200 gold \/ h/.test(html), 'the profit verdict is not the headline number');
    // §C: THE VIGOUR BAR IS HELD WITHOUT A PRICED METER (C-1, condition 5).
    // The switch is the meter's own refill fields: a meter that does not state
    // refills_left draws nothing. The block above hands over today's full
    // production meter on purpose, so this fails the moment the bar can appear
    // before 2026-09-25-vigour-price-by-level.sql is applied.
    assert(!/hunt-vigour/.test(html),
      'the Vigour bar rendered off a meter with no refill fields — it is HELD until the server '
      + 'states refills_left / next_refill_gold; see THE LIMITER in src/render/hunt-panel.js');
    assert(!/512 \/ 720 min today/.test(html),
      'the panel printed a Vigour figure off a meter the server is not projecting yet');
    // §E: a cost rendered as a positive number is a cost players do not subtract.
    assert(/− 8,400 g/.test(html), 'supplies is not rendered with a leading minus');
    // §E: raw XP/h is shown BESIDE effective — the gap IS the diagnosis.
    assert(/18,400/.test(html) && /21,900/.test(html), 'raw and effective XP/h are not both shown');
    // §F: the honesty line is a requirement, not decoration.
    assert(/settled \d\d:\d\d UTC/.test(html), 'the honesty line is missing');
  }),

  // an UNSETTLED hunt shows em-dashes, never zeroes. A zero is a claim.
  () => tryRun('hunt panel: the Hunt panel never invents a number', () => {
    if (typeof window.huntPanelHtml !== 'function') return;
    const html = window.huntPanelHtml({
      hunt: { stance: 'steady', stop: null },
      vigour: { spent_min: 0, budget_min: 720 },
      analyzer: { spawn_id: 'goblin', elapsed_ms: 60000, paid_ms: 0, kills: null,
                  profit_per_h: null, xp_per_h: null, raw_xp_per_h: null, settled_at: null },
      monsters: window.MONSTERS || {},
    });
    assert(/nothing settled yet/.test(html),
      'a hunt with no settled window did not say so');
    assert(/—/.test(html), 'the unsettled panel shows numbers where it has none');
    assert(!/refill/i.test(html),
      'slice 1 ships Vigour READ-ONLY (HUNTS_AND_ANALYZER.md 4.6) — there must be no refill control');
  }),

  // A HUNT OLDER THAN A DAY SAYS WHICH SPAN ITS TOTALS COVER (finding A-1). The
  // ledger scan is floored at 24 h and every sum and rate divides by
  // `window_ms`, while the header clock is the WHOLE hunt — a panel showing both
  // without saying which is which is the two disagreeing in the reader's head.
  () => tryRun('hunt panel: a capped readout names the span it covers', () => {
    if (typeof window.huntPanelHtml !== 'function') return;
    const base = {
      spawn_id: 'goblin', stance: 'steady', paid_ms: 79200000, downtime_ms: 7200000,
      kills: 3000, kills_per_h: 125, deaths: 0, gold: 9000, loot_value: 100,
      supplies_value: 50, profit_per_h: 380, xp_per_h: 900, raw_xp_per_h: 1000,
      settled_at: new Date().toISOString(),
    };
    const capped = window.huntPanelHtml({
      hunt: null, vigour: null, monsters: window.MONSTERS || {},
      analyzer: { ...base, elapsed_ms: 259200000, window_ms: 86400000, window_capped: true },
    });
    assert(/totals cover the last 24h/.test(capped),
      'a three-day hunt printed 24 hours of totals beside a three-day clock and said nothing');
    const uncapped = window.huntPanelHtml({
      hunt: null, vigour: null, monsters: window.MONSTERS || {},
      analyzer: { ...base, elapsed_ms: 86400000, window_ms: 86400000, window_capped: false },
    });
    assert(!/totals cover the last 24h/.test(uncapped),
      'an uncapped hunt claimed its totals were truncated — the line must come from the '
      + 'server\'s window_capped, never from a clock read here');
  }),

  // THE EMPTY STATE. Eleven words, no tutorial, no modal.
  () => tryRun('hunt panel: the Hunt panel empty state explains itself', () => {
    if (typeof window.huntPanelHtml !== 'function') return;
    const html = window.huntPanelHtml({ hunt: null, vigour: null, analyzer: null, monsters: {} });
    assert(/No hunts yet/.test(html), 'the empty state does not explain itself');
    assert(!/gold \/ h/.test(html), 'the empty state still renders a verdict it has no data for');
  }),

  // ══ THE VIGOUR BAR + REFILL (HUNTS_AND_ANALYZER.md §4.4 / §4.6) ══════
  // The bar is ON only when the SERVER's meter (hr_vigour_of, field names
  // copied from 2026-09-25-vigour-price-by-level.sql §3) states the refill
  // fields, and every number on it is a field of the stubbed server's answer.
  // The stub's numbers are ones the client could not derive (a 913-minute
  // grant, a 7,777-gold next refill that no level formula yields), so an
  // assertion that finds them can only pass if they came off the wire. Signed
  // in via stubSignedIn; fetch stubbed and restored in `finally`.
  ...(() => {
    const METER = () => ({ day_key: '2026-9-25', grant_min: 913, refills: 1, refills_max: 5,
      refill_min: 120, refills_left: 4, next_refill_gold: 7777, level: 37,
      bought_min: 120, budget_min: 1033, ceiling_min: 1320, spent_min: 407, remaining_min: 626,
      dry_mult: 0.25 });
    /* Today's production meter (2026-09-22-vigour-daily.sql): no refill fields. */
    const PROD_METER = () => { const { refill_min, refills_left, next_refill_gold, level, ...m } = METER(); return m; };
    const rig = (world) => {
      const realFetch = window.fetch, realRecord = window.HearthriseRecord;
      const calls = [];
      window.fetch = (url, init) => {
        const u = String(url);
        let body = null; try { body = JSON.parse(init.body); } catch (e) { /* a GET has no body */ }
        calls.push({ url: u, method: (init && init.method) || 'GET', body });
        if (u.indexOf('/rpc/hr_vigour_refill') !== -1) {
          const a = world.refill(body);
          return Promise.resolve({ ok: a.status !== 404, status: a.status || 200, json: () => Promise.resolve(a.json) });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      };
      /* The balance repaint asks the record; answered here so no live read
         leaves the page during the arm. */
      window.HearthriseRecord = Object.assign({}, realRecord || {}, { requestRecord: () => Promise.resolve(null) });
      const unstub = stubSignedIn(0, 'Wren');
      const G = window.G;
      const saved = { v: G._vigour, a: G._huntAnalyzer, h: G._hunt };
      window.HearthriseVigour.__resetForTest();
      window.HearthriseAccrual.hydrateHunt(G, { vigour: world.meter });
      G._huntAnalyzer = null; G._hunt = null;
      const host = document.createElement('div');
      host.id = 'vigour-test-host';
      document.body.appendChild(host);
      const paint = async () => { window.renderHuntPanel(host); await drain(); await drain(); };
      return {
        calls, host, paint,
        text: () => ((host.querySelector('.hunt-vigour-block') || {}).textContent || ''),
        rpcs: () => calls.filter((c) => c.url.indexOf('/rpc/hr_vigour_refill') !== -1),
        click: async () => {
          const b = host.querySelector('[data-vigour-refill]');
          assert(b, 'no refill button to press');
          b.click();
          await drain(); await drain();
        },
        restore: () => {
          window.fetch = realFetch;
          window.HearthriseRecord = realRecord;
          unstub();
          window.HearthriseVigour.__resetForTest();
          G._vigour = saved.v; G._huntAnalyzer = saved.a; G._hunt = saved.h;
          if (saved.v === undefined) delete G._vigour;
          host.remove();
        },
      };
    };
    /* Every digit-run in the bar's TEXT, commas stripped. The regression arm
       checks each against the numbers the stub actually sent. */
    const numbersIn = (t) => (String(t).replace(/(\d),(?=\d{3})/g, '$1').match(/\d+(?:\.\d+)?/g) || []);
    const numbersOf = (...objs) => {
      const out = new Set();
      const walk = (o) => {
        if (o == null) return;
        if (typeof o === 'number') { out.add(String(o)); return; }
        if (Array.isArray(o)) { o.forEach(walk); return; }
        if (typeof o === 'object') Object.keys(o).forEach((k) => walk(o[k]));
      };
      objs.forEach(walk);
      return out;
    };
    return [
      // PLAYER ACTIONS, happy path: the meter offers a refill, the bar and button
      // appear with the server's numbers, a click sends ONE intent with an
      // idempotency key and renders the server's new balance, minutes and price.
      () => tryRunAsync('vigour: a priced meter shows the bar and a refill renders the server answer', async () => {
        const after = Object.assign(METER(), { refills: 2, refills_left: 3, next_refill_gold: 11665,
          bought_min: 240, budget_min: 1153, remaining_min: 746 });
        const world = { meter: METER(),
          refill: () => ({ json: { ok: true, nth: 2, cost: 7777, minutes: 120, currency: 'gold', level: 37,
            gold: 40404, version: 9, slot: 0, vigour: after } }) };
        const r = rig(world);
        try { await r.paint();
          const t = r.text();
          assert(/407 \/ 1,033 min today/.test(t), 'the meter does not show the server\'s spent/budget: ' + t);
          assert(/913 free/.test(t) && /120 bought/.test(t), 'the grant and bought minutes are not the server\'s: ' + t);
          assert(/Refill \+120 min · 7,777 gold/.test(t), 'the button does not show the meter\'s next_refill_gold: ' + t);
          assert(/1 of 5 refills bought today/.test(t), 'the refills counter is not the server\'s: ' + t);
          assert(!/gem|token/i.test(t), 'gems or tokens appear beside a gold-only refill');
          await r.click();
          const sent = r.rpcs();
          assert(sent.length === 1, 'one tap sent ' + sent.length + ' refill intents');
          const b = sent[0].body || {};
          assert(typeof b.p_idem === 'string' && b.p_idem.length >= 32, 'the refill intent carries no idempotency key');
          assert(Object.keys(b).sort().join(',') === 'p_idem,p_slot',
            'the refill intent carries more than a slot and a key: ' + Object.keys(b).join(','));
          const t2 = r.text();
          assert(/Bought 120 min for 7,777 gold — 40,404 gold left/.test(t2), 'the receipt is not the server\'s answer: ' + t2);
          assert(/407 \/ 1,153 min today/.test(t2), 'the meter did not follow the server\'s new budget: ' + t2);
          assert(/Refill \+120 min · 11,665 gold/.test(t2), 'the button did not move to the server\'s next price: ' + t2);
        } finally { r.restore(); }
      }),

      // THE SWITCH IS THE METER (C-1, condition 5): today's production meter (no
      // refill fields), a closed shop (refills_max 0) and no meter at all draw
      // nothing, and never ask the verb. All bought today keeps the meter and
      // says so, with no button.
      () => tryRunAsync('vigour: a meter without refill fields keeps the whole bar hidden', async () => {
        const closed = Object.assign(METER(), { refills_max: 0, refills_left: 0, next_refill_gold: null, level: null });
        for (const meter of [PROD_METER(), closed, null]) {
          const r = rig({ meter, refill: () => ({ json: { ok: false, error: 'refill_unpriced' } }) });
          try { if (meter === null) delete window.G._vigour; await r.paint();
            assert(!r.host.querySelector('.hunt-vigour'), 'the Vigour bar rendered off meter ' + JSON.stringify(meter));
            assert(!r.host.querySelector('[data-vigour-refill]'), 'a refill control rendered with nothing for sale');
            assert(!/refill|vigour/i.test(r.host.textContent), 'the panel mentions refills with nothing for sale');
            assert(r.rpcs().length === 0, 'the verb was called with nothing for sale');
          } finally { r.restore(); }
        }
        const done = Object.assign(METER(), { refills: 5, refills_left: 0, next_refill_gold: null, level: null });
        const r = rig({ meter: done, refill: () => ({ json: { ok: false, error: 'vigour_daily_cap' } }) });
        try { await r.paint();
          assert(r.host.querySelector('.hunt-vigour'), 'the meter vanished once every refill was bought');
          assert(!r.host.querySelector('[data-vigour-refill]'), 'a refill button with refills_left 0');
          assert(/No refills left today/.test(r.text()) && /5 of 5 refills bought today/.test(r.text()),
            'the sold-out state is not stated from the server\'s fields: ' + r.text());
        } finally { r.restore(); }
      }),

      // REFUSED: the server's refusal is shown in plain words, the server's
      // meter is kept, and `refill_unpriced` closes the bar in the same trip.
      () => tryRunAsync('vigour: a refused refill is shown in plain words and spends nothing', async () => {
        const world = { meter: METER(),
          refill: () => ({ json: { ok: false, error: 'insufficient_gold', cost: 7777, have: 1000, short_by: 6777, vigour: METER() } }) };
        const r = rig(world);
        try { await r.paint(); await r.click();
          const t = r.text();
          assert(/Not enough gold — you need 6,777 more/.test(t), 'the refusal is not in plain words: ' + t);
          assert(/407 \/ 1,033 min today/.test(t), 'a refusal changed the meter: ' + t);
          assert(/Refill \+120 min · 7,777 gold/.test(t), 'a refusal moved the price: ' + t);
          world.refill = () => ({ json: { ok: false, error: 'refill_unpriced' } });
          await r.click();
          assert(!r.host.querySelector('.hunt-vigour'), 'refill_unpriced left the bar standing');
        } finally { r.restore(); }
      }),

      // REGRESSION: the bar renders NO number the server did not send, and the
      // client never asks the DROPPED hr_vigour_prices catalogue. Every digit-run
      // in its text must be a field of the stubbed meter (a price computed from
      // `level`, a retyped constant or a derived "left" count fails); then a
      // projected field is MUTATED and the DOM must follow it (a cached render
      // fails); and not one request may name the catalogue.
      () => tryRunAsync('vigour: the bar prints only numbers the server sent, and never reads hr_vigour_prices', async () => {
        const world = { meter: Object.assign(METER(), { spent_min: 1100, remaining_min: 0 }),
          refill: () => ({ json: { ok: false, error: 'rate_limited' } }) };
        const r = rig(world);
        try { await r.paint();
          const allowed = numbersOf(world.meter);
          const seen = numbersIn(r.text());
          assert(seen.length >= 5, 'the bar printed too few numbers to judge: ' + r.text());
          seen.forEach((n) => assert(allowed.has(n), 'the bar printed ' + n + ', which the server never sent: ' + r.text()));
          assert(/Tired — hunts pay ×0\.25/.test(r.text()), 'the dry state does not quote the server\'s dry_mult: ' + r.text());
          const m2 = Object.assign(METER(), { spent_min: 222, budget_min: 1400, grant_min: 1280, refills: 2,
            refills_left: 3, next_refill_gold: 23456, level: 88 });
          window.HearthriseAccrual.hydrateHunt(window.G, { vigour: m2 });
          await r.paint();
          const t2 = r.text();
          assert(/222 \/ 1,400 min today/.test(t2) && /1,280 free/.test(t2), 'the DOM did not follow the mutated meter: ' + t2);
          assert(/23,456 gold/.test(t2) && /2 of 5/.test(t2), 'the price did not follow the mutated next_refill_gold: ' + t2);
          assert(!/7,777/.test(t2), 'the old price outlived the envelope that replaced it');
          assert(!/Tired/.test(t2), 'the dry line outlived the server\'s remaining_min');
          numbersIn(t2).forEach((n) => assert(numbersOf(m2).has(n), 'after the mutation the bar printed ' + n));
          await r.click();
          const cat = r.calls.filter((c) => c.url.indexOf('hr_vigour_prices') !== -1);
          assert(cat.length === 0, 'the client queried the dropped hr_vigour_prices catalogue ' + cat.length + ' time(s)');
        } finally { r.restore(); }
      }),
    ];
  })(),

  // THE STOP SENTENCE never promises a stop the server cannot deliver.
  // This game has NO bag capacity, so the bag_full rule cannot fire; the field
  // is accepted and stored for the day a cap exists, and until then the panel
  // must not print it. (Reported to the Game Designer by the M6 backend lane.)
  () => tryRun('hunt panel: the stop sentence promises only rules that can fire', () => {
    assert(typeof window.huntStopSentence === 'function', 'huntStopSentence missing');
    const s = window.huntStopSentence({ hours: 8, bag_full: true });
    assert(/after 8 hours/.test(s), 'the hours rule is not stated');
    assert(!/bag/i.test(s),
      'the panel promises "if the bag fills", but this game has no bag capacity and the rule '
      + 'cannot fire — a stop that never comes is how a player concludes the game cheated them');
    assert(/Runs until you stop it/.test(window.huntStopSentence(null)),
      'a hunt with no rules does not say so');
  }),

  // THE INTENT CARRIES THE TWO FIELDS ONLY WHEN NAMED. An absent field
  // leaves the standing order alone; an explicit null CLEARS it. A client that
  // restated its own copy on every declaration is how a stale client value ends
  // up overwriting a server one.
  () => tryRunAsync('hunt panel: set_activity carries stance/stop only when named', async () => {
    const mod = await import('../../net/activity.js?v=553');
    const bodyOf = (o) => JSON.parse(mod.buildActivityRequest(
      Object.assign({ kind: 'combat', id: 'goblin', intentId: 'k' }, o)).init.body);
    const bare = bodyOf({});
    assert(!('stance' in bare.activity) && !('stop' in bare.activity),
      'an ordinary declaration grew fields the player did not set');
    const named = bodyOf({ stance: 'careful', stop: { hours: 8 } });
    assert(named.activity.stance === 'careful', 'the stance did not reach the request');
    assert(named.activity.stop.hours === 8, 'the stop rules did not reach the request');
    const cleared = bodyOf({ stance: null });
    assert('stance' in cleared.activity && cleared.activity.stance === null,
      'an explicit null did not survive as a CLEAR — a player cannot turn a stance off');
  }),
];
