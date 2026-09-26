// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/clan-seat-and-front-door.js — the Clan Seat, clan governance, the quest counters and the sign-up door.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 72 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, stampBalanceLikeLoad, stampRecordLikeLoad, withFarmServer, withClaimServer, xpOf, predZero, xpZero, goldOf, snapshotG, restoreG, restoreGAndRecord, TYPE_FLOOR, typeHandoffOwner, typeTokenPx, TYPE_OWNED_SHEETS, on, snapshot, decideRestore, decideSessionEvent, stubSignedIn, drain } from './_harness.js?v=553';


/* ══════════════════════════════════════════════════════════════════════════
   M8 SLICE 1 — THE PARTY PANEL'S RIG.

   A server-shaped realm behind a stubbed `window.fetch`, shared by the two
   END-TO-END arms below (PARTY-1 and PARTY-2) so neither carries its own copy;
   PARTY-3..7 need no realm at all, because the renderer is pure. It answers the
   three table reads and the five verbs the way the applied migrations answer —
   2026-09-23-m8-parties-s1-{1-tables,2-verbs}.sql — and it RECORDS every
   request, because the negative arm's subject is not what the panel drew but
   what the client asked for (findings B7 and B8).

   The numbers it hands back are deliberately ones the client could not derive:
   a combat level it has no skills for, an hp pair belonging to another account.
   A test that asserts the panel shows 43 can only pass if 43 came off the wire.
   ══════════════════════════════════════════════════════════════════════════ */
const partyRig = () => {
  const realFetch = window.fetch;
  const calls = [];
  const WREN = { name: 'Wren', combat_level: 57, hp: 38, hp_max: 61, recovering_until: null, share_bp: null, xp: null, gold: null };
  const BRAM = { name: 'Bram', combat_level: 43, hp: 12, hp_max: 74, share_bp: null, xp: null, gold: null,
                 recovering_until: new Date(Date.now() + 20 * 60000).toISOString() };
  const world = {
    member: [],
    view: null,
    invites: [{ id: 'inv-1', party_id: 'P9', created_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 11 * 60000).toISOString() }],
    inviteAnswer: { ok: false, error: 'invite_target_unavailable' },
    deadView: null,   // PARTY-8: when set, every roster read answers this instead
  };
  const answer = (u) => {
    if (u.indexOf('/rpc/hr_party_create') !== -1) {
      world.member = [{ party_id: 'P1', role: 'leader' }];
      world.view = { ok: true, party_id: 'P1', members: [WREN] };
      world.invites = [];
      return { ok: true, party_id: 'P1', role: 'leader', members: 1 };
    }
    if (u.indexOf('/rpc/hr_party_invite') !== -1) {
      const r = world.inviteAnswer;
      /* A SUCCESSFUL INVITE IS ANSWERED `{ok:true, sent:true}` AND NOTHING ELSE
         — the verb tells the sender nothing about the target. Bram appears in
         the ROSTER, i.e. only once the realm says he is there. */
      if (r.ok) world.view = { ok: true, party_id: 'P1', members: [WREN, BRAM] };
      return r;
    }
    if (u.indexOf('/rpc/hr_party_kick') !== -1) {
      world.view = { ok: true, party_id: 'P1', members: [WREN] };
      return { ok: true, kicked: true, members: 1 };
    }
    if (u.indexOf('/rpc/hr_party_leave') !== -1) {
      world.member = []; world.view = null;
      return { ok: true, left: true, dissolved: true, members: 0 };
    }
    if (u.indexOf('/rpc/hr_party_view') !== -1) return world.deadView || world.view || { ok: false, error: 'not_in_party' };
    if (u.indexOf('party_member?') !== -1) return world.member;
    if (u.indexOf('party_invite?') !== -1) return world.invites;
    if (u.indexOf('party?select=id,size_cap') !== -1) return world.member.length ? [{ id: 'P1', size_cap: 4 }] : [];
    return [];
  };
  window.fetch = (url, init) => {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    let body = null;
    try { body = (init && init.body) ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    calls.push({ url: u, method, body });
    const payload = answer(u);
    // `{ __http, body }` answers a non-200 the way PostgREST does (PARTY-8).
    if (payload && payload.__http) {
      return Promise.resolve({ ok: false, status: payload.__http, json: () => Promise.resolve(payload.body) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
  };
  /* WHO THE LOCAL PLAYER IS — the panel marks your own row and withholds Remove
     from it, and without a name that branch is never taken. A monkey-patch over
     `I.displayName` pinned the panel's reading and nothing else. The first-run
     sheets a session arms are `stubSignedIn`'s business now, not this rig's. */
  const unstub = stubSignedIn(0, 'Wren');
  window.HearthriseParty.__resetForTest();
  const el = (sel) => document.querySelector('#party-panel ' + sel);
  /* EVERY REQUEST THE PAGE MAKES LANDS IN `calls`, NOT JUST THE PANEL'S. The
     stub replaces `window.fetch` wholesale, so a sync, an accrue or a record
     write from the live engine's own timers is recorded too — and those fire on
     a clock nobody here controls, which is how PARTY-2's last arm came to read
     `a closed panel made 1 requests` on a loaded runner and stay green on CI.
     The panel's own surface is the party contract's reads and verbs, so the
     cadence arms count those. */
  const PARTY_URL = /\/rpc\/hr_party_|party_member\?|party_invite\?|party\?select=id,size_cap/;
  return {
    world, calls, el,
    // ALREADY A MEMBER, from the rig's own Wren: two arms re-spelled his fields.
    joinAs: (role) => { world.member = [{ party_id: 'P1', role: role }]; world.view = { ok: true, party_id: 'P1', members: [WREN] }; },
    idle: async (n) => { for (let i = 0; i < n; i++) { window.HearthriseParty.pollNow(); await drain(); } },
    partyCalls: () => calls.filter((c) => PARTY_URL.test(c.url)),
    rpcs: (n) => calls.filter((c) => c.url.indexOf('/rpc/' + n) !== -1),
    text: () => (document.getElementById('party-panel') || { textContent: '' }).textContent,
    open: async () => { window.showTab('party'); await drain(); await drain(); },
    /* TYPE A NAME AND SUBMIT, re-reading the live nodes every time: the panel
       replaces its own innards on each read, so a field captured before a
       repaint is a detached node and the keystrokes go nowhere. That is not a
       test detail — it is the bug a repaint-on-every-read panel invites. */
    invite: async (name) => {
      const field = el('#party-invite-name');
      assert(field, 'the leader has no invite field');
      field.value = name;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      el('form[data-party-act="invite"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await drain(); await drain();
    },
    restore: () => {
      try { window.HearthriseParty.setVisible(false); } catch (e) {}
      try { window.HearthriseParty.__resetForTest(); } catch (e) {}
      window.fetch = realFetch;
      unstub();
      try { window.showTab('profile'); } catch (e) {}
    },
  };
};

export default [

  // ══════════════════════════════════════════════════════════════════
  // b222 regression suite — THE CLAN SEAT foundation (backlog #10, Wave 3a)
  // docs/design/clan-overhaul.md v2. Data + four engine seams + the migration's
  // client-side reducers. No castle UI ships in this wave; everything below is
  // a foundation that must be correct BEFORE anything renders on top of it.
  // ══════════════════════════════════════════════════════════════════

  // #10a: the four castle goods. Their whole job is to be refined, deposited
  // and never eaten — so the properties that make that true are the contract.
  () => tryRun('b222: the four castle goods are stores, not gear and not food', () => {
    const I = window.ITEMS;
    const expect = { timber_beam: [300, 2], iron_fitting: [480, 2], field_ration: [90, 1], keystone: [3000, 5] };
    Object.keys(expect).forEach((id) => {
      const it = I[id];
      assert(it, 'castle good missing from ITEMS: ' + id);
      assert(it.tag === 'castle', id + ' must carry tag:"castle" — it is the ONE field the lane derives from');
      assert(it.v === expect[id][0], id + ' value drifted from the spec: ' + it.v);
      assert(it.tier === expect[id][1], id + ' material tier drifted: ' + it.tier);
      // Typeless: nothing equips a beam. Food-less: auto-eat can never burn a
      // Field Ration, and foodClassOf() must answer null so the cooking screen
      // does not file it under Provisions.
      assert(!it.type, id + ' must have no `type` — it is stores, not gear');
      assert(!it.heals && !it.buff && !it.foodClass, id + ' must not heal or buff');
      assert(window.foodClassOf(it) === null, 'foodClassOf(' + id + ') must be null, got ' + window.foodClassOf(it));
      assert(window.isCastleGood(it) === true, 'isCastleGood must claim ' + id);
    });
    assert(window.isCastleGood(I.cooked_shark) === false, 'isCastleGood must not claim ordinary items');
  }),

  // #10b: THE LANE PROOF. The zero-uncategorized guard above is what would have
  // broken on the commit that added these items (CONFLICTS #2) — so this test
  // asserts the positive: each good is claimed by "Castle Stores" specifically,
  // in the right skill, and the lane holds exactly the four.
  () => tryRun('b222: the Castle Stores lane claims exactly the four goods, in three skills', () => {
    const cz = window.categorizeRecipes;
    const rc = window.recipeCategory;
    const laneOf = (skill) => {
      const res = cz(skill, window.ARTISAN_RECIPES[skill], window.ITEMS);
      assert(res.uncategorized.length === 0, skill + ' stranded a recipe: ' + res.uncategorized.map((r) => r.id).join(','));
      return (res.groups.find((g) => g.key === 'castle') || { recipes: [] }).recipes;
    };
    /* b357 — FOUR SKILLS, FIVE GOODS. Stonemason joins the castle lane and
       ADOPTS `craft_keystone` from Crafting (consumable-economy.md §8.1: a
       keystone is the most masonic object in architecture, and the row had the
       same story as the seven `fletch_*` rows — written where a skill existed,
       waiting for the skill that should own it). The recipe id, inputs, xp and
       req are unchanged, so clan-seat.js's material route still resolves.
       `ashlar` is the new personal capstone good; it sits beside timber_beam
       (Crafting) and iron_fitting (Smithing) so the artisan pillars contribute
       one material each to the property ladder. */
    const crafting = laneOf('crafting'), smithing = laneOf('smithing'),
          cooking = laneOf('cooking'), stonemason = laneOf('stonemason');
    assert(crafting.length === 1, 'crafting Castle Stores should hold 1, got ' + crafting.length);
    assert(smithing.length === 1, 'smithing Castle Stores should hold 1, got ' + smithing.length);
    assert(cooking.length === 1, 'cooking Castle Stores should hold 1, got ' + cooking.length);
    assert(stonemason.length === 2, 'stonemason Castle Stores should hold 2, got ' + stonemason.length);
    const ids = crafting.concat(smithing, cooking, stonemason).map((r) => r.output).sort().join(',');
    assert(ids === 'ashlar,field_ration,iron_fitting,keystone,timber_beam', 'lane contents drifted: ' + ids);
    // Runecrafting deliberately has NO castle lane — it makes consumables, not
    // masonry — so its category list must not declare one.
    assert(!window.ARTISAN_CATEGORIES.runecrafting.some((d) => d.key === 'castle'),
      'runecrafting declares a Castle Stores lane it can never fill — an empty tab is a dead end');
    // Every declared lane carries a label the panel can print.
    ['smithing', 'crafting', 'cooking', 'stonemason'].forEach((s) => {
      const def = window.ARTISAN_CATEGORIES[s].find((d) => d.key === 'castle');
      assert(def && def.label === 'Castle Stores', s + ' is missing the Castle Stores category definition');
    });
    // The lane is the LAST claim: a castle-tagged item that IS food stays in
    // Feasts & Draughts, because that is where the player drinks it. This is
    // the Phase-B Cellar ale case (spec §4.5), asserted now so nobody reorders
    // the derivation later and quietly moves three ales out of the cooking tab.
    const fakeItems = Object.assign({}, window.ITEMS, {
      __ale: { n: 'Test Ale', v: 100, tag: 'castle', foodClass: 'buff', buff: { type: 'all_xp', magnitude: 1, durationMs: 1 } },
    });
    assert(rc('cooking', { output: '__ale' }, fakeItems) === 'feasts',
      'a castle-tagged BUFF food must stay in Feasts & Draughts, not be stolen by Castle Stores');
  }),

  // #10c: the refining margins. The spec deliberately makes refining only
  // mildly profitable in gold — the real payment is CP and Standing, which is
  // what makes a beam worth making for the hold rather than for the market.
  // If someone re-values slime_gel or iron_bar, this is the test that notices.
  () => tryRun('b222: castle recipe margins match the spec (+43/+33/+22/+8%)', () => {
    const I = window.ITEMS;
    const find = (skill, id) => window.ARTISAN_RECIPES[skill].find((r) => r.id === id);
    const cost = (rec) => Object.keys(rec.inputs).reduce((s, k) => s + (I[k].v || 0) * rec.inputs[k], 0);
    const cases = [
      ['crafting', 'craft_timber_beam',  210,  300,  0.43],
      ['smithing', 'smith_iron_fitting', 360,  480,  0.33],
      ['cooking',  'cook_field_ration',  294,  360,  0.22],
      /* b357: the keystone's BENCH moved to Stonemason; its cost, output and
         margin did not. Adopting a recipe verbatim is exactly the change that
         should leave this assertion alone except for the skill key. */
      ['stonemason', 'craft_keystone',   2770, 3000, 0.08],
    ];
    cases.forEach(([skill, id, wantCost, wantOut, wantMargin]) => {
      const rec = find(skill, id);
      assert(rec, 'recipe missing: ' + id);
      const c = cost(rec);
      assert(c === wantCost, id + ' input cost drifted: ' + c + ' (spec says ' + wantCost + ')');
      const out = (I[rec.output].v || 0) * (rec.outputQty || 1);
      assert(out === wantOut, id + ' output value drifted: ' + out);
      const margin = out / c - 1;
      assert(Math.abs(margin - wantMargin) < 0.01, id + ' margin drifted to ' + (margin * 100).toFixed(0) + '%');
    });
    // The four goods are gated behind real artisan levels, which is what makes
    // "day one of a brand-new clan is deliberately not buildable" true.
    assert(find('crafting', 'craft_timber_beam').req === 25, 'Timber Beam must gate at crafting 25');
    assert(find('smithing', 'smith_iron_fitting').req === 25, 'Iron Fitting must gate at smithing 25');
    assert(find('cooking', 'cook_field_ration').req === 22, 'Field Ration must gate at cooking 22');
    assert(find('stonemason', 'craft_keystone').req === 60, 'Keystone must gate at stonemason 60');
    /* b357: and it must be gone from Crafting. An adoption that LEFT the row
       behind would put one recipe id on two benches, which `indexArtisanRecipes`
       resolves by "first id wins" — i.e. silently, by object key order. */
    assert(!find('crafting', 'craft_keystone'),
      'craft_keystone was adopted by Stonemason and must not remain on the Crafting bench');
    /* b357: ashlar, the personal capstone good, gates where the property tier
       that needs it becomes reachable. */
    assert(find('stonemason', 'cut_ashlar').req === 45, 'Ashlar must gate at stonemason 45');
    assert(find('cooking', 'cook_field_ration').outputQty === 4, 'Field Rations are made four at a time');
  }),

  // #10d: SEAM 1 — goldFind, declared since the buff registry shipped and read
  // by nothing. Lich Soul Soup promised +50% gold find for five minutes and
  // delivered zero; the castle Treasury perk would have been the second broken
  // promise on the same key. Both are now real.
  () => tryRun('b222 SEAM 1: goldFind multiplies monster gold (it was declared and never read)', () => {
    assert(typeof window.applyGoldFind === 'function', 'applyGoldFind seam missing');
    const E = window.HearthriseWorldEvents;
    const origBonus = window.getBonus;
    const snap = snapshotG();
    /* b332: this asserted "no goldFind pays 1000" against the REAL calendar,
       so it went red on every day the game happened to draw The Open Coffers
       or The King's Bounty — a live, date-dependent flake (it was failing on
       2026-08-12). Pinned to the QUIET control like every other calendar-
       sensitive test in this suite. */
    if (E) E._force({ daily: E.QUIET, weekly: E.QUIET });
    try {
      /* NO CALENDAR. This assertion's baseline is "the ambient goldFind is
         zero", and from b227 that stopped being true on roughly a quarter of
         all days: `open_coffers` (+3%) and `kings_bounty` (+4%) are gold-find
         blessings, they are picked deterministically from the UTC date, and
         while the player is online they reach getBonus through the calendar's
         own wrapper. So this test went red on 2026-08-12 having passed on the
         11th, with nothing committed in between — a date-dependent test, not a
         defect. The rest of the suite already says QUIET when it needs a known
         baseline; this one never adopted it. */
      E._force({ daily: E.QUIET, weekly: E.QUIET });
      assert(E.liveBonusFor('goldFind') === 0, 'the calendar must be quiet for the baseline');

      // The pure helper, first.
      assert(window.applyGoldFind(1000) === 1000, 'with no goldFind, gold must be untouched');
      window.getBonus = (k) => (k === 'goldFind' ? 0.5 : origBonus(k));
      assert(window.applyGoldFind(1000) === 1500, '+50% goldFind must pay 1500, got ' + window.applyGoldFind(1000));
      window.getBonus = (k) => (k === 'goldFind' ? -5 : origBonus(k));
      assert(window.applyGoldFind(1000) === 1000, 'a negative contributor must clamp at 0, never pay negative gold');
      assert(window.applyGoldFind(0) === 0 && window.applyGoldFind(-3) === 0, 'non-positive base pays nothing');

      // …then the real kill path. A Slime pays 1-3 gold; at +10000% one kill
      // must pay at least 101, which is arithmetically impossible unwired.
      window.getBonus = (k) => (k === 'goldFind' ? 100 : origBonus(k));
      predZero(); window.G.gold = 0;
      window.G.activeMonster = 'slime';
      window.G.monsterHp = 0;
      window.killMonster(window.MONSTERS.slime);
      assert(goldOf() >= 101,   // b455: display read — under the arm a kill's loot is a prediction
        'killMonster ignored goldFind — one Slime paid ' + goldOf() + ', expected >= 101');
      assert(window.G.gold <= 303, 'gold overshot the multiplied range: ' + window.G.gold);
      /* Away combat used to be a SEPARATE kill path, so this guard used to
         check that the second one also called applyGoldFind. There is no
         second one: away and live both resolve a kill through
         src/core/combat-sim.js `resolveKill`. The guard therefore asserts the
         thing that actually keeps the two honest — that the single resolver
         applies gold find, and that the old loop has not been resurrected. */
      assert(String(window.HearthriseCore.combatSim.resolveKill).indexOf('applyGoldFind') >= 0,
        'the one kill resolver no longer applies gold find');
      assert(typeof window.processOfflineCombat === 'undefined',
        'processOfflineCombat is back — a second combat loop is exactly what the away ruling deleted');

      /* …and the thing the red above accidentally proved, now asserted on
         purpose: a gold-find BLESSING is a real gold-find contributor. The
         calendar wraps getBonus, so this only works through the live chain —
         hence no stub here, and the stub is restored first. */
      window.getBonus = origBonus;
      const OPEN = E.DAILY.find((d) => d.id === 'open_coffers');
      assert(OPEN && OPEN.bonus.goldFind > 0, 'the Open Coffers must still be a gold-find blessing');
      E._force({ daily: E.QUIET, weekly: E.QUIET });
      const quietMult = window.goldFindMult(), quietGold = window.applyGoldFind(10000);
      E._force({ daily: OPEN, weekly: E.QUIET });
      const blessMult = window.goldFindMult(), blessGold = window.applyGoldFind(10000);
      // Stated as a DELTA, not an absolute, so a permanent contributor left in
      // the save by an earlier test cannot make this pass or fail by accident.
      if (E.isActive()) {
        assert(Math.abs((blessMult - quietMult) - OPEN.bonus.goldFind) < 1e-9,
          'the Open Coffers must move gold find by exactly ' + OPEN.bonus.goldFind
          + ', moved ' + (blessMult - quietMult));
        assert(blessGold === Math.floor(10000 * blessMult) && blessGold > quietGold,
          'the blessing reached getBonus but not the gold drop — ' + quietGold + ' → ' + blessGold);
      } else {
        // Presence says we are not online: then the calendar must pay NOTHING,
        // which is the other half of the same contract, never "no assertion".
        assert(blessMult === quietMult && blessGold === quietGold,
          'an unblessed session must not receive the calendar gold find');
      }
    } finally {
      E._force(null);
      window.getBonus = origBonus;
      if (E) E._force(null);
      restoreG(snap);
    }
  }),

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

  // b228: the two roads to Rested, and the one ceiling they share.
  () => tryRun('b228: Rested XP — two roads, one ceiling, and the deeper bank', () => {
    const snap = snapshotG();
    try {
      assert(window.RESTED_QUANTUM_CAP === 1600, 'the aggregate Rested ceiling should be 1,600 XP/charge');
      /* b456: the Library rung is server-of-record, so each position is stamped
         through the real hr_load path — an unstamped `G.rooms.library = 5` reads
         as the fail-closed EMPTY map, i.e. no Library, and all three rows would
         have measured the same "no quantum" answer. */
      window.G.rooms = Object.assign({}, window.G.rooms, { library: 0 });
      stampRecordLikeLoad(window.G);
      assert(window.restedQuantum() === 0, 'no Library and no Tavern must mean no quantum');
      assert(window.restedCap() === window.RESTED_CAP, 'the base bank is 80 charges');
      window.G.rooms = Object.assign({}, window.G.rooms, { library: 4 });
      stampRecordLikeLoad(window.G);
      assert(window.restedQuantum() === 800, 'the Scriptorium road pays 800 XP/charge');
      window.G.rooms = Object.assign({}, window.G.rooms, { library: 5 });
      stampRecordLikeLoad(window.G);
      assert(window.restedQuantum() === 1600, 'the Great Library road pays 1,600 XP/charge');
      assert(window.restedCap() === 120, 'the Great Library deepens the bank to 120');
      // The castle road, mirrored from the clan-seat reducer.
      const CS = window.HearthriseClanSeat;
      assert(CS.restedQuantum(0) === 0 && CS.restedQuantum(10) === 1600,
        'the castle road must reach the same ceiling by Tavern 10');
      assert(CS.restedQuantum(10) <= window.RESTED_QUANTUM_CAP,
        'neither road may exceed the shared ceiling');
    } finally { restoreGAndRecord(snap); }
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

  // #10i: SEAM 4 — two systems now wrap updateDaily (CONFLICTS #6). The chain
  // carries a NAMED roster instead of each system inventing a private global
  // the other cannot see, so a double-wrap is loud instead of a silent
  // double-count.
  () => tryRun('b222 SEAM 4: the updateDaily wrapper chain is named, and double-wrapping throws', () => {
    assert(typeof window.wrapUpdateDaily === 'function', 'wrapUpdateDaily seam missing');
    const chain = window.updateDaily;
    assert(chain.__wrappedBy instanceof Set, 'updateDaily carries no wrapper roster');
    assert(chain.__wrappedBy.has('muster'), 'the Muster is not registered on the chain: '
      + window.updateDailyWrappers().join(','));
    const snap = snapshotG();
    const restore = window.updateDaily;
    try {
      // A second system wraps under its own name and both layers fire.
      let a = 0, b = 0;
      window.wrapUpdateDaily('__test_labour', () => { a++; });
      window.wrapUpdateDaily('__test_board', () => { b++; });
      assert(window.updateDailyWrappers().join(',').indexOf('__test_labour') >= 0, 'the roster did not carry forward');
      window.updateDaily('gather', 1);
      assert(a === 1 && b === 1, 'both wrappers must fire once per action, got ' + a + '/' + b);

      // The same system wrapping twice is the double-count bug. It throws.
      let threw = false;
      try { window.wrapUpdateDaily('__test_labour', () => {}); } catch (e) { threw = true; }
      assert(threw, 'double-wrapping under the same name must throw, not silently double-count');
      let threwMuster = false;
      try { window.wrapUpdateDaily('muster', () => {}); } catch (e) { threwMuster = true; }
      assert(threwMuster, 'the live Muster registration did not protect itself');
      // An unnamed wrap is refused — a nameless layer is an invisible one.
      let threwAnon = false;
      try { window.wrapUpdateDaily('', () => {}); } catch (e) { threwAnon = true; }
      assert(threwAnon, 'wrapUpdateDaily must require a system name');
      // A throwing observer must never eat a daily-task tick.
      window.wrapUpdateDaily('__test_throws', () => { throw new Error('boom'); });
      let c = 0;
      window.wrapUpdateDaily('__test_after', () => { c++; });
      window.updateDaily('gather', 1);
      assert(c === 1, 'a throwing wrapper broke the chain below it');
    } finally {
      window.updateDaily = restore;
      restoreG(snap);
    }
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
        const M = (window.HEARTHRISE_MIGRATIONS || []).find((m) => m.from === 6 && m.to === 7);
        assert(M, 'the v6 → v7 migration that reads `watered` must not be deleted');
      } finally { restoreG(snap); }
    })),

  // #10k: the contribution formula. Every row here is lifted verbatim from
  // clan-overhaul v2 §3.4's worked table, computed against the REAL item
  // values, so a change to either the formula or an item value fails loudly.
  () => tryRun('b222: Clan Seat contribution maths matches the spec table exactly', () => {
    const C = window.HearthriseClanSeat;
    assert(C, 'HearthriseClanSeat missing — the reducers module did not load');
    const I = window.ITEMS;
    const row = (id, normal, ordered, standing) => {
      const it = I[id];
      assert(C.cpForUnit(it.v, it.tier, 'normal') === normal,
        id + ' normal CP should be ' + normal + ', got ' + C.cpForUnit(it.v, it.tier, 'normal'));
      assert(C.cpForUnit(it.v, it.tier, 'ordered') === ordered,
        id + ' on-demand CP should be ' + ordered + ', got ' + C.cpForUnit(it.v, it.tier, 'ordered'));
      assert(C.standingFor(ordered) === standing,
        id + ' Standing should be ' + standing + ', got ' + C.standingFor(ordered));
    };
    row('timber_beam',  42,   63,   22);
    row('iron_fitting', 67,   100,  35);
    row('field_ration', 9,    13,   4);
    row('keystone',     1260, 1890, 661);
    // The 0.4×-at-cap rule is load-bearing: it stops one player dumping 40,000
    // planks and owning the ladder while the hold starves for Fittings.
    assert(C.demandMult('capped') === 0.4, 'the at-cap multiplier must be 0.4×');
    assert(C.cpForUnit(300, 2, 'capped') === 16, 'a capped Beam should pay 16 CP, got ' + C.cpForUnit(300, 2, 'capped'));
    assert(C.cpForDeposit(300, 2, 'normal', 10) === 420, 'quantity must multiply linearly');
    assert(C.cpForDeposit(300, 2, 'normal', 0) === 0 && C.cpForUnit(0, 1, 'normal') === 0, 'zero must pay zero');
    // CP decays 12%/week, LAZILY on read. Standing never decays — that is the
    // entire reason there are two numbers.
    const wk = 7 * 24 * 3600000, t = Date.now();
    assert(C.decayedCp(1000, t - wk, t) === 880, 'one week of decay should leave 880, got ' + C.decayedCp(1000, t - wk, t));
    assert(C.decayedCp(1000, t - 2 * wk, t) === 774, 'two weeks should leave 774, got ' + C.decayedCp(1000, t - 2 * wk, t));
    assert(C.decayedCp(1000, t, t) === 1000, 'no elapsed time must not decay');
    assert(C.decayedCp(1000, t + wk, t) === 1000, 'a future stamp must not inflate CP');
    assert(C.decayedCp(0, t - 52 * wk, t) === 0, 'zero CP stays zero');
  }),

  // #10l: the castle ladder, the Work Order curves and the upkeep schedule —
  // the numbers a renderer will otherwise re-derive inline and get wrong.
  () => tryRun('b222: Clan Seat tier, labour and upkeep curves match the spec', () => {
    const C = window.HearthriseClanSeat;
    // Tiers gate on STANDING, never on clan level (§2.3 — level 10 costs
    // 655,360,000 gold, which is why v1's gate was unreachable).
    assert(C.tierDef(2).standing === 12000 && C.tierDef(5).standing === 900000, 'Standing gates drifted');
    assert(C.tierName(1) === 'The Foundation' && C.tierName(5) === 'Fortified Keep', 'tier names drifted'); // b227: tier 1-2 renamed to follow the foundation scene (Tyler)
    assert(C.tierDef(4).contributors === 8 && C.tierDef(5).contributors === 12, 'distinct-contributor gates drifted');
    assert(C.buildingLevelCap(3) === 6, 'no building may exceed castle_tier × 2');
    assert(C.buildSlots(1) === 1 && C.buildSlots(2) === 1 && C.buildSlots(3) === 2 && C.buildSlots(5) === 2,
      'build slots must be 1 + floor(tier/3)');
    assert(C.maxHuntTier(1, 12) === 1, 'the castle tier must cap the Hunt tier');
    assert(C.maxHuntTier(5, 0) === 1, 'a clan with no War Room is stuck on Tier I Hunts');
    assert(C.maxHuntTier(3, 6) === 3, 'War Room 6 at castle 3 should allow Tier III');
    // The 72h membership gate — free, because clan_members.joined_at exists.
    const now = Date.now(), h = 3600000;
    const rows = [
      { user_id: 'a', joined_at: now - 100 * h },
      { user_id: 'b', joined_at: now - 100 * h },
      { user_id: 'a', joined_at: now - 100 * h },   // same member, two deposits
      { user_id: 'c', joined_at: now - 1 * h },     // joined an hour ago
    ];
    assert(C.eligibleContributors(rows, now) === 2,
      'distinct-contributor count must dedupe and exclude sub-72h members, got ' + C.eligibleContributors(rows, now));
    // Labour: a 2× gap between level 20 and level 99, not a 40× gap. This is
    // the number that lets a dozen casuals out-build one whale.
    assert(Math.abs(C.labourFactor(20) - 0.702) < 0.001, 'level 20 factor drifted: ' + C.labourFactor(20));
    assert(C.labourFactor(99) === 1.5, 'level 99 factor must be 1.5');
    assert(C.labourFactor(200) === 1.5 && C.labourFactor(0) > 0, 'the factor must clamp at both ends');
    assert(C.DAILY_LABOUR_CAP === 400 && C.LABOUR_CALL_CLAMP === 200, 'labour clamps drifted');
    assert(C.labourRemainingToday(380) === 20 && C.labourRemainingToday(999) === 0, 'daily remaining must clamp at 0');
    // NOTE the level-10 value: the spec's §6.5 TABLE prints 18,776, but the
    // spec's own stated FORMULA — round(800 × 1.42^(level−1)) — yields 18,780.
    // The formula is authoritative (the table is a rendering of it), so the
    // engine follows the formula and this test pins the difference rather than
    // letting a 4-tick discrepancy be rediscovered as a bug later.
    assert(C.labourTarget(1) === 800 && C.labourTarget(3) === 1613 && C.labourTarget(5) === 3253
        && C.labourTarget(7) === 6559 && C.labourTarget(10) === 18780, 'the labour curve drifted');
    assert(C.timeFloorMs(1) === 2 * 3600000, 'the level-1 time floor is 2h');
    assert(Math.abs(C.timeFloorMs(10) / 3600000 - 7.036) < 0.01, 'the level-10 time floor should be ~7h02m');
    assert(C.timeFloorMs(40) === 48 * 3600000, 'the time floor must cap at 48h');
    // Upkeep, and the spec's own scale check: 22 building levels at Treasury 6.
    const up = C.upkeepDue({ treasury: 6, tavern: 6, sawmill: 4, smeltery: 4, war_room: 2 }, 6);
    assert(up.levels === 22, 'building-level total drifted: ' + up.levels);
    assert(up.gold === 5170 && up.rations === 42, 'upkeep drifted: ' + JSON.stringify(up));
    assert(C.upkeepDue({ treasury: 6, tavern: 6, sawmill: 4, smeltery: 4, war_room: 2 }, 0).gold === 5500,
      'undiscounted upkeep should be 5,500 gold');
    // Forgiving, never punishing: dimmed, never destroyed.
    assert(C.upkeepStateFor(1) === 'active' && C.upkeepStateFor(0.7) === 'strained'
        && C.upkeepStateFor(0.49) === 'dormant' && C.upkeepStateFor(0) === 'dormant', 'upkeep states drifted');
    assert(C.perkScaleFor('strained') === 0.6 && C.perkScaleFor('dormant') === 0, 'perk scaling drifted');
    // The Sunday 00:00 UTC boundary is DERIVED, never stored — same discipline
    // as the Muster's schedule.
    const sunday = Date.UTC(2026, 7, 9, 0, 0, 0);      // 2026-08-09 is a Sunday
    assert(C.lastUpkeepBoundary(Date.UTC(2026, 7, 12, 5)) === sunday, 'the weekly boundary is wrong');
    assert(C.lastUpkeepBoundary(sunday) === sunday, 'the boundary must be inclusive of its own instant');
    assert(C.nextUpkeepBoundary(sunday) === sunday + 7 * 24 * 3600000, 'the next boundary must be +7d');
    assert(C.upkeepWeeksOwed(sunday - 1, Date.UTC(2026, 7, 12)) === 1, 'one boundary crossed = one week owed');
    assert(C.upkeepWeeksOwed(sunday - 21 * 24 * 3600000, Date.UTC(2026, 7, 12)) === 3, 'three weeks owed');
    assert(C.upkeepWeeksOwed(sunday + 3600000, Date.UTC(2026, 7, 12)) === 0, 'already settled = nothing owed');
  }),

  // #10m: the Tavern numbers the two engine seams will consume, plus the two
  // anti-grief rules kept verbatim from the source doc.
  () => tryRun('b222: Tavern, withdrawal-delay and succession maths match the spec', () => {
    const C = window.HearthriseClanSeat;
    // The Hearth feeds registerBuffScaler; the Common Room feeds G.restedXp.
    /* b228 (bonus-rebase.md §3.2): DURATION is exempt from the percent grammar
       and holds at +4%/level; MAGNITUDE is throughput and comes to +1%/level. */
    const h10 = C.hearthScale(10);
    assert(Math.abs(h10.duration - 1.4) < 1e-9 && Math.abs(h10.magnitude - 1.10) < 1e-9,
      'Tavern 10 Hearth should be +40% duration / +10% strength');
    assert(C.hearthScale(0).duration === 1 && C.hearthScale(0).magnitude === 1, 'no Tavern = identity scale');
    assert(Math.abs(C.leftoversChance(10) - 0.05) < 1e-9, 'Leftovers should reach 5% at Tavern 10');
    /* Rested converted from a potency to a flat XP quantum. */
    assert(C.restedPotency === undefined, 'restedPotency must be retired, not left beside its replacement');
    assert(C.restedQuantum(10) === 1600, 'a rested charge is worth 1,600 XP at Tavern 10');
    assert(C.restedQuantum(0) === 0, 'no Tavern means no quantum — the seam stays inert');
    assert(C.RESTED_CHARGE_MS === window.RESTED_CHARGE_MS && C.RESTED_CAP === window.RESTED_CAP,
      'the spec constants and the engine seam disagree about rest');
    // Feasts. 20h cooldown, deliberately NOT 24 — it drifts round the clock so
    // one timezone never owns Last Call.
    assert(C.FEAST_COOLDOWN_MS === 20 * 3600000, 'the Feast cooldown must be 20h, not 24h');
    assert(C.feastMeterCap(10) === 1800 && C.feastMeterCap(1) === 720, 'the meter cap drifted');
    /* b228: the ladder rebased; the HOURS did not move — a feast's length is
       what makes it an event the clan schedules around, and duration is outside
       the percent grammar. */
    assert(C.feastEffect(10).allXP === 0.04 && C.feastEffect(10).hours === 4, 'the Tavern-10 Feast drifted');
    assert(C.feastEffect(1).allXP === 0.01 && C.feastEffect(5).yield === 0.01, 'the Feast ladder drifted');
    assert(C.feastEffect(7).hours === 3 && C.feastEffect(4).hours === 2 && C.feastEffect(1).hours === 1,
      'the feast HOURS must not move — only the magnitudes were rebased');
    // Last Call doubles everything for the final 30 minutes at Tavern 7+.
    const lc = C.feastEffectAt(10, 10 * 60000);
    assert(lc.lastCall === true && Math.abs(lc.allXP - 0.08) < 1e-9, 'Last Call must double every effect');
    assert(!C.feastEffectAt(6, 10 * 60000).lastCall, 'Last Call is Tavern 7+ only');
    assert(!C.feastEffectAt(10, 90 * 60000).lastCall, 'Last Call is the final 30 minutes only');
    // A withdrawal over 10% of the treasury is delayed 24h and announced.
    assert(C.withdrawNeedsDelay(101, 1000) === true, '>10% must require the delay');
    assert(C.withdrawNeedsDelay(100, 1000) === false, 'exactly 10% must not');
    assert(C.withdrawNeedsDelay(0, 1000) === false && C.withdrawNeedsDelay(50, 0) === false, 'degenerate cases');
    assert(C.WITHDRAW_DELAY_MS === 24 * 3600000, 'the withdrawal delay must be 24h');
    // Leader ghosting: 21 days, then the highest-CP officer may claim.
    const now = Date.now(), day = 86400000;
    assert(C.canClaimLeadership(now - 21 * day, now) === true, '21 days must open succession');
    assert(C.canClaimLeadership(now - 20 * day, now) === false, '20 days must not');
    assert(C.canClaimLeadership(null, now) === false, 'a missing last_seen must never open succession');
  }),

  // #10n: the 34 routed spoils. This closes the largest open item on the
  // Designer's backlog — "~25 tier-3-6 combat drops are recipe-less vendor
  // trash", recounted at 34. A routing table nobody checks is how "every drop
  // has a job" quietly becomes false again.
  () => tryRun('b222: all 34 orphan combat drops are routed, and the four recipe routes are real', () => {
    const C = window.HearthriseClanSeat;
    const R = C.SPOILS_ROUTES;
    const ids = Object.keys(R);
    assert(ids.length === 34, 'the spoils table should route exactly 34 drops, got ' + ids.length);
    // Every routed id must be a real item, or the route is a promise to nobody.
    ids.forEach((id) => assert(window.ITEMS[id], 'routed spoil is not a real item: ' + id));
    // Every route must be one the castle actually implements or has specced.
    const ROUTES = ['recipe', 'board', 'work_order', 'tier_bundle', 'capstone', 'archives', 'armory'];
    ids.forEach((id) => assert(ROUTES.indexOf(R[id].route) >= 0, id + ' has an unknown route: ' + R[id].route));
    // The four `recipe` routes are the ones that are LIVE today — they must
    // really appear as inputs on the recipe they name.
    /* b357: search EVERY bench rather than three named ones. `craft_keystone`
       moved to Stonemason and this list would have reported the route as
       broken when only its bench had changed — a hardcoded skill list turning
       a relocation into a false red is precisely the drift this suite exists
       to catch, so the list is now derived. */
    const allRecipes = Object.keys(window.ARTISAN_RECIPES)
      .reduce((a, s) => a.concat(window.ARTISAN_RECIPES[s] || []), []);
    const recipeRoutes = ids.filter((id) => R[id].route === 'recipe');
    assert(recipeRoutes.length === 4, 'exactly four spoils should be live recipe inputs, got ' + recipeRoutes.length);
    recipeRoutes.forEach((id) => {
      const rec = allRecipes.find((r) => r.id === R[id].via);
      assert(rec, id + ' points at a recipe that does not exist: ' + R[id].via);
      assert(rec.inputs && rec.inputs[id] > 0, id + ' is not actually an input of ' + R[id].via);
    });
    // Slime Gel is the flagship of the whole idea: an 80% drop from tier-1
    // Slimes, worth 5g, used by nothing — now the binder that holds the castle
    // together, so a level-3 player is materially useful on build day.
    assert(R.slime_gel.route === 'recipe' && R.slime_gel.via === 'craft_timber_beam', 'the Slime Gel route was lost');
    // The three capstone trophies are ONE each — objects on a wall, not a grind.
    ['war_crown', 'ancient_claw', 'dragon_gem'].forEach((id) => {
      assert(R[id].route === 'capstone' && R[id].qty === 1, id + ' must be a single capstone trophy');
      assert(C.TIER_BUNDLES[5][id] === 1, id + ' must appear once in the tier-5 bundle');
    });
    assert(C.spoilRoute('cooked_shark') === null, 'spoilRoute must answer null for an unrouted item');
  }),

  // #10o: the RPC reducers. Same contract as the Muster's: a missing RPC is
  // 'unsupported' (the castle is not built yet), never 'fail' (your clan is
  // broken). A body without the {ok:boolean} envelope is a REFUSAL — a 401 has
  // no `ok` field, and treating one as success would credit Standing the
  // server never granted.
  () => tryRun('b222: Clan Seat reducers handle ok / error / unsupported shapes', () => {
    const C = window.HearthriseClanSeat;
    // Unsupported: the client may ship before the migration is run.
    assert(C.reduceDeposit(404, null).action === 'unsupported', '404 must be unsupported');
    ['PGRST202', '42883', '42P01'].forEach((code) => {
      assert(C.reduceDeposit(200, { code }).action === 'unsupported', code + ' must be unsupported');
      assert(C.reduceTierUp(400, { code }).action === 'unsupported', code + ' must be unsupported on tier-up too');
    });
    // A response with no envelope is never a success.
    [[401, { message: 'JWT expired' }], [500, null], [200, null], [200, 'nope'], [200, { data: 1 }]]
      .forEach(([st, body]) => {
        const r = C.reduceDeposit(st, body);
        assert(r.action === 'fail', 'status ' + st + ' with ' + JSON.stringify(body) + ' must fail, got ' + r.action);
        assert(typeof r.message === 'string' && r.message.length > 0, 'a failure must carry player-facing copy');
      });
    // A refusal carries the server's reason, translated.
    const refused = C.reduceDeposit(200, { ok: false, error: 'not_castle_good' });
    assert(refused.action === 'fail' && refused.error === 'not_castle_good', 'the refusal reason was lost');
    assert(/refine/i.test(refused.message), 'not_castle_good must explain itself: ' + refused.message);
    assert(/refused/i.test(C.errorText('__unknown__')), 'an unknown error must still produce copy');
    // Acceptance: the SERVER's numbers win, always.
    const ok = C.reduceDeposit(200, { ok: true, cp: 630, standing: 220, clan_standing: 15000,
                                      stored: { timber_beam: 40 }, demand: 'capped', capped: true });
    assert(ok.action === 'accept' && ok.cp === 630 && ok.standing === 220 && ok.clanStanding === 15000,
      'deposit acceptance dropped a field: ' + JSON.stringify(ok));
    assert(ok.demand === 'capped' && ok.capped === true,
      'the applied multiplier must survive — the player previewed 1.0× and was paid 0.4×');
    assert(C.reduceDeposit(200, { ok: true }).demand === 'normal', 'a missing demand must default to normal');
    // Negative / garbage numbers from a compromised server are clamped, never
    // trusted: the same rule the Muster chest reducer enforces.
    const dirty = C.reduceDeposit(200, { ok: true, cp: -50, standing: 'lots' });
    assert(dirty.cp === 0 && dirty.standing === 0, 'the reducer must clamp hostile numbers');
    // Labour: the server total wins over the local accumulator.
    const lab = C.reduceWorkLabour(200, { ok: true, added: 120, labour_done: 4400, labour_target: 6559,
                                          ticks_today: 400, capped: true, phase: 'labour' });
    assert(lab.labourDone === 4400 && lab.ticksToday === 400 && lab.capped === true, 'labour acceptance drifted');
    assert(C.reduceWorkLabour(200, { ok: false, error: 'daily_cap' }).error === 'daily_cap', 'the cap reason was lost');
    // Tier-up names the tier it reached, so the panel never has to look it up.
    const up = C.reduceTierUp(200, { ok: true, castle_tier: 3, standing: 61000, contributors: 5 });
    assert(up.tier === 3 && up.name === 'Timber Hold', 'tier-up must name the tier: ' + JSON.stringify(up));
    // Upkeep maps its state to a perk scale so nothing re-derives it.
    const dorm = C.reduceUpkeep(200, { ok: true, upkeep_state: 'dormant', weeks: 3 });
    assert(dorm.state === 'dormant' && dorm.perkScale === 0, 'dormant must switch perks off');
    assert(C.reduceUpkeep(200, { ok: true, upkeep_state: 'nonsense' }).state === 'active',
      'an unknown upkeep state must fall back to active, never to a broken one');
    // A large withdrawal is DELAYED and announced — not refused, not done.
    const w = C.reduceWithdraw(200, { ok: true, pending: true, ready_at: '2026-08-09T00:00:00Z', amount: 500000 });
    assert(w.action === 'accept' && w.pending === true && w.readyAt, 'a delayed withdrawal must report as pending');
  }),

  // ══════════════════════════════════════════════════════════════════
  // b223 regression suite — THE VISIBLE CLAN SEAT (backlog #10, Wave 3b)
  // docs/design/clan-overhaul.md v2 §16 steps 4-8. The panel, the Work Order
  // loop, the Tavern, and the perk flow into getBonus with its power budget.
  //
  // Every test below stubs the seat rather than a server: the module's whole
  // contract is "given this clan_seat_read payload, what does the player see
  // and what does getBonus return", and that is a pure question.
  // ══════════════════════════════════════════════════════════════════

  // A maxed Phase-A hold: tier 5, every building at 10. The state the power
  // budget is written against (§8.2).
  () => tryRun('b223: castle perks reach getBonus, and the §8.2 audit is the real one', () => {
    const UI = window.HearthriseClanSeatUI;
    assert(UI, 'HearthriseClanSeatUI missing — the panel module did not load');
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    const maxed = (state) => ({
      castle_tier: 5, standing: 900000, treasury: 0, upkeep_state: state || 'active',
      upgrades: { treasury: 10, tavern: 10, sawmill: 10, smeltery: 10, war_room: 10 },
      stores: {}, orders: []
    });
    try {
      UI._reset();
      const base = { craftSpeed: window.getBonus('craftSpeed'), goldFind: window.getBonus('goldFind') };
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 1, treasury: 0, myRole: 'leader' });
      UI._setSeat(maxed(), 'test-hold');

      /* b228 (bonus-rebase.md §3.1) — the rebased table, exactly.
         Each wing pays +1% at levels 4, 7 and 10 → +3% at max, in place of
         0.005/level. The Great Hall pays +1% per tier ABOVE THE FIRST → +4% at
         tier 5. `restedXp` has left the audit entirely: Rested is a flat XP
         quantum now, not a getBonus key the castle produces. */
      const a = UI.budgetAudit();
      assert(near(a.keys.allXP, 0.04), 'Great Hall at tier 5 must be +4% allXP, got ' + a.keys.allXP);
      assert(near(a.keys.goldFind, 0.03), 'Treasury 10 must be +3% goldFind, got ' + a.keys.goldFind);
      assert(near(a.keys.craftSpeed, 0.03), 'Sawmill 10 must be +3% craftSpeed, got ' + a.keys.craftSpeed);
      assert(near(a.keys.smithSpeed, 0.03), 'Smeltery 10 must be +3% smithSpeed, got ' + a.keys.smithSpeed);
      assert(near(a.keys.raidPower, 0.03), 'War Room 10 must be +3% raidPower, got ' + a.keys.raidPower);
      assert(a.keys.restedXp === undefined, 'restedXp must not be audited as a castle throughput key any more');
      assert(UI.castlePermanent('restedXp') === 0, 'the castle must publish no restedXp percentage at all');
      // The three rungs are FELT steps, not a smear: nothing at levels 1-3.
      assert(UI.perkAtLevel(3) === 0 && near(UI.perkAtLevel(4), 0.01)
          && near(UI.perkAtLevel(7), 0.02) && near(UI.perkAtLevel(10), 0.03),
        'the castle perk rungs must land at 4 / 7 / 10, and nowhere else');
      // The Great Hall pays for CLIMBING the tier ladder, not for arriving on it.
      assert(UI.greatHallAllXp(1) === 0 && near(UI.greatHallAllXp(5), 0.04),
        'tier 1 must grant nothing and tier 5 must grant +4%');

      // The castle's own SHARE of the per-key budget (§2.2): ≤ +5% from the
      // castle on any one key, enforced where it is granted.
      assert(a.largest <= UI.CASTLE_KEY_CAP + 1e-9,
        'a castle key exceeded the per-key cap: ' + a.largest);
      assert(UI.CASTLE_KEY_CAP === 0.05, 'the castle share should be 0.05');
      assert(UI.CASTLE_TOTAL_CAP === undefined && UI.PERMANENT_ALLXP_CAP === undefined,
        'the mid-chain caps must be retired — the budget lives in power-budget.js now');

      // It really flows: getBonus is higher by exactly the castle's share.
      assert(near(window.getBonus('craftSpeed') - base.craftSpeed, 0.03), 'craftSpeed did not reach getBonus');
      assert(near(window.getBonus('goldFind') - base.goldFind, 0.03), 'goldFind did not reach getBonus');

      // §10: a strained hold runs at 60%, a dormant one at 0 — and NOTHING is
      // de-levelled either way, which is why the levels are still readable.
      UI._setSeat(maxed('strained'), 'test-hold');
      assert(near(UI.castlePermanent('goldFind'), 0.018), 'strained must scale perks to 60%');
      assert(UI.buildingLevel('sawmill') === 10, 'a strained hold keeps every level it earned');
      UI._setSeat(maxed('dormant'), 'test-hold');
      assert(UI.castlePermanent('goldFind') === 0, 'a dormant hold grants nothing');
      assert(UI.buildingLevel('sawmill') === 10, 'a dormant hold keeps every level it earned');
      assert(near(window.getBonus('craftSpeed'), base.craftSpeed), 'dormant perks must leave getBonus alone');
    } finally { UI._reset(); }
  }),

  /* b228 — THE FUSE LEFT THE CASTLE (bonus-rebase.md §4.1, §6 conflict 1).
     b223 shipped the fuse at layer 4 of a seven-layer chain, where it reduced
     only the castle's OWN contribution and was escaped by companions, buffs,
     the muster aura and the blessing calendar. It also policed one key. This
     test therefore inverts: what it now guards is that the castle does NOT
     self-clamp (the newest-system-yields rule is gone — every source states its
     honest number) and that the real ceiling is enforced at the END of the
     chain, where nothing can be added after it. The end-of-chain clamp has its
     own tests further down. */
  () => tryRun('b228: the castle states its honest share — the ceiling is enforced end-of-chain', () => {
    const UI = window.HearthriseClanSeatUI;
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    const R = window.HearthriseRenown, H = window.HearthriseHomestead;
    const savedR = R && R.getPerks, savedH = H && H.isCastle;
    try {
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 10, treasury: 0, myRole: 'leader' });
      UI._setSeat({ castle_tier: 5, standing: 0, treasury: 0, upkeep_state: 'active',
                    upgrades: { treasury: 10, tavern: 10, sawmill: 10, smeltery: 10, war_room: 10 },
                    stores: {}, orders: [] }, 'test-hold');

      // The real permanent allXP stack with every source at ITS OWN maximum:
      // homestead capstone 2 + renown High King 4 + clan ladder 0 (re-scoped)
      // + Great Hall 4 = 10%. Down from the +32% b223 measured and the +72%
      // the census found before that.
      if (R) R.getPerks = () => ({ allXP: 0.04, offlineHours: 12 });
      if (H) H.isCastle = () => true;
      assert(near(UI.permanentAllXp(), 0.10),
        'the real permanent allXP stack should be +10%, got ' + UI.permanentAllXp());
      assert(UI.permanentAllXp() <= window.HearthrisePowerBudget.PERMANENT_CAP,
        'the permanent stack must sit inside the fuse');
      // The clan ladder really contributes nothing any more.
      assert(!window.HearthriseClans.perksFor(10).allXP, 'the clan ladder must add no allXP');

      // NO MID-CHAIN YIELDING. However hot the rest of the stack runs, the
      // castle keeps stating what it actually grants — a source that lies about
      // its own number to compensate for another source is unreadable, and it
      // was also escapable, which is why the clamp moved.
      if (H) H.isCastle = () => false;
      if (R) R.getPerks = () => ({ allXP: 0.58 });
      assert(near(UI.castleBonus('allXP', true), 0.04),
        'the castle must state its honest +4%, not yield mid-chain, got ' + UI.castleBonus('allXP', true));
      if (R) R.getPerks = () => ({ allXP: 0.70 });
      assert(near(UI.castleBonus('allXP', true), 0.04), 'still honest with an absurd stack beneath it');
      assert(near(UI.permanentAllXp(), 0.74), 'permanentAllXp is a plain audit sum now, not a fuse');

      // THE FEAST — temporary, budgeted separately, and rebased.
      if (R) R.getPerks = () => ({ allXP: 0.04 });
      UI._setSeat({ castle_tier: 5, standing: 0, treasury: 0, upkeep_state: 'active',
                    upgrades: { tavern: 10 }, stores: {}, orders: [],
                    feast_until: new Date(Date.now() + 3 * 3600000).toISOString() }, 'test-hold');
      assert(near(UI.feastBonus('allXP'), 0.04), 'a Tavern-10 feast is +4% allXP, got ' + UI.feastBonus('allXP'));
      assert(UI.castleBonus('allXP') > UI.castleBonus('allXP', true),
        'the feast must reach getBonus on top of the permanent share');
      // Last Call: the final 30 minutes double every effect (Tavern 7+). At +8%
      // on a +15% permanent stack this is a 53% uplift — the ceremony peak.
      UI._setSeat({ castle_tier: 5, standing: 0, treasury: 0, upkeep_state: 'active',
                    upgrades: { tavern: 10 }, stores: {}, orders: [],
                    feast_until: new Date(Date.now() + 10 * 60000).toISOString() }, 'test-hold');
      assert(near(UI.feastBonus('allXP'), 0.08), 'Last Call must double the feast, got ' + UI.feastBonus('allXP'));
      assert(near(UI.feastBonus('craftSpeed'), 0.08), 'Last Call must double the artisan line too');
      // A dormant hold throws no feast, whatever the timestamp says.
      UI._setSeat({ castle_tier: 5, standing: 0, treasury: 0, upkeep_state: 'dormant',
                    upgrades: { tavern: 10 }, stores: {}, orders: [],
                    feast_until: new Date(Date.now() + 10 * 60000).toISOString() }, 'test-hold');
      assert(UI.feastBonus('allXP') === 0, 'a dormant hold cannot be feasting');
    } finally {
      if (R && savedR) R.getPerks = savedR;
      if (H && savedH) H.isCastle = savedH;
      UI._reset();
    }
  }),

  // §6.6: 400 Labour per member per UTC day. Not an anti-cheat measure — the
  // design. Without it one insomniac with an auto-clicker completes every Work
  // Order and the other nine members never see the bar move.
  () => tryRun('b223: Work Order labour is capped at 400/day and wired under its own name', () => {
    const UI = window.HearthriseClanSeatUI;
    const C = window.HearthriseClanSeat;
    try {
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 1, treasury: 0, myRole: 'leader' });
      const order = {
        id: 'order-1', building: 'sawmill', to_level: 3, phase: 'labour',
        materials: {}, supplied: {}, labour_done: 0, labour_target: C.labourTarget(3),
        posted_at: new Date(Date.now() - 3600000).toISOString(),
        floor_until: new Date(Date.now() + 600000).toISOString()
      };
      UI._setSeat({ castle_tier: 3, standing: 60000, treasury: 0, upkeep_state: 'active',
                    upgrades: { sawmill: 2 }, stores: {}, orders: [order] }, 'test-hold');
      UI._resetLabour();

      // 1,500 actions cannot push a member past the cap, whatever their level:
      // at the floor factor of 0.51 that is ~765 labour asked for and 400 given.
      let granted = 0;
      for (let i = 0; i < 1500; i++) granted += UI.addLabour('crafted', 1);
      const l = UI._labour();
      assert(l.pending <= C.DAILY_LABOUR_CAP + 1e-9,
        'the accumulator went past the daily cap: ' + l.pending);
      assert(granted <= C.DAILY_LABOUR_CAP + 1e-9, 'more labour was granted than the cap allows');
      assert(l.capped === true, 'the member must be told they have hit the cap');
      // The cap is per member per day across the WHOLE castle — a second order
      // must not reopen it.
      UI._setLabourToday(C.DAILY_LABOUR_CAP);
      UI._resetLabour();
      UI._setLabourToday(C.DAILY_LABOUR_CAP);
      assert(UI.addLabour('crafted', 1) === 0, 'a member at their daily cap generates no more labour');

      // An action type the castle does not count generates nothing, and a
      // dormant hold freezes work entirely (§10).
      UI._resetLabour();
      assert(UI.addLabour('nonsense_type', 1) === 0, 'only the six real counters feed labour');
      UI._setSeat({ castle_tier: 3, standing: 0, treasury: 0, upkeep_state: 'dormant',
                    upgrades: { sawmill: 2 }, stores: {}, orders: [order] }, 'test-hold');
      assert(UI.addLabour('crafted', 1) === 0, 'a dormant hold freezes Work Orders');

      // CONFLICTS #6: the Muster and castle Labour both wrap updateDaily. The
      // named chain is the whole resolution — each holds its own name, and a
      // second wrap under the same name throws rather than double-counting.
      const owners = window.updateDailyWrappers();
      assert(owners.indexOf('castleLabour') >= 0, 'castle Labour must be in the wrapper roster: ' + owners);
      assert(owners.indexOf('muster') >= 0, 'the Muster must still be in the roster: ' + owners);
      let threw = false;
      try { window.wrapUpdateDaily('castleLabour', () => {}); } catch (e) { threw = true; }
      assert(threw, 'wrapping updateDaily twice under one name must throw');

      // §6.2: the level factor is a 2x gap, not a 40x gap, and the skill it
      // reads is the skill that produced the action.
      assert(Math.abs(C.labourFactor(20) - 0.702) < 0.002, 'a level-20 member generates ~0.70');
      assert(Math.abs(C.labourFactor(99) - 1.5) < 1e-9, 'a level-99 member generates 1.5');
      assert(UI._skillLevelFor('cooked') === window.getLevel('cooking'), 'cooking actions read the cooking level');
      assert(UI._skillLevelFor('smithed') === window.getLevel('smithing'), 'smithing actions read the smithing level');
      assert(UI._skillLevelFor('kill_any') === window.getCombatLevel(), 'kills read the combat level');
    } finally { UI._reset(); }
  }),

  // §9.4 — the Common Room. The b222 seam (G.restedXp, watermarked accrual)
  // was inert because nothing granted a potency. The Tavern grants it, and the
  // rest of the chain was already built.
  () => tryRun('b228: the Tavern makes Rested XP live — a flat quantum, and a charge really burns', () => {
    /* b228 respec: the Tavern's Common Room pays XP PER CHARGE, not a potency
       percentage (bonus-rebase.md §5.3). `restedXp` is not a getBonus key any
       more, so every assertion here moved onto the quantum — including the
       upkeep scaling, which still dims a strained hold and closes a dormant one. */
    const UI = window.HearthriseClanSeatUI;
    const G = window.G;
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    const saved = { rested: G.restedXp, crafting: G.skills.crafting, rooms: G.rooms };
    try {
      UI._reset();
      G.rooms = Object.assign({}, G.rooms, { library: 0 });   // isolate the castle road
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 1, treasury: 0, myRole: 'member' });

      // No Tavern → the bank is real and the quantum is zero, so a charge is
      // never burned. That is the inert state, and it is correct.
      UI._setSeat({ castle_tier: 2, standing: 0, treasury: 0, upkeep_state: 'active',
                    upgrades: {}, stores: {}, orders: [] }, 'test-hold');
      assert(window.getBonus('restedXp') === 0, 'restedXp must not be a getBonus key any more');
      assert(UI.restedQuantum() === 0, 'no Tavern must mean no quantum');
      G.restedXp = 3; xpZero('crafting');
      window.addXp('crafting', 100);
      assert(G.restedXp === 3, 'a charge must never burn while it is worth nothing');

      // Tavern 10 → 160 XP per level per charge = 1,600.
      UI._setSeat({ castle_tier: 5, standing: 0, treasury: 0, upkeep_state: 'active',
                    upgrades: { tavern: 10 }, stores: {}, orders: [] }, 'test-hold');
      assert(near(UI.restedQuantum(), 1600), 'Tavern 10 must pour 1,600 XP per charge, got ' + UI.restedQuantum());
      assert(near(UI.restedQuantum(), window.HearthriseClanSeat.restedQuantum(10)),
        'the quantum must come from the tested reducer, not a second copy');
      assert(near(window.restedQuantum(), 1600), 'and the engine must read the castle road');
      /* The baseline is measured UNDER THE SAME SEAT — the Great Hall's allXP
         differs between tier 2 and tier 5, so an earlier baseline would drift
         the comparison by a point of XP and hide the real question. */
      G.restedXp = 0; xpZero('crafting');
      window.addXp('crafting', 100);
      const plain = xpOf('crafting');
      G.restedXp = 3; xpZero('crafting');
      window.addXp('crafting', 100);
      assert(G.restedXp === 2, 'exactly one charge is spent per XP grant, got bank ' + G.restedXp);
      assert(xpOf('crafting') === plain + 1600,
        'a rested grant must add exactly the quantum, got ' + (xpOf('crafting') - plain));

      // A strained hold pours a weaker rest; a dormant one pours none.
      UI._setSeat({ castle_tier: 5, standing: 0, treasury: 0, upkeep_state: 'strained',
                    upgrades: { tavern: 10 }, stores: {}, orders: [] }, 'test-hold');
      assert(near(UI.restedQuantum(), 960), 'a strained hold rests at 60%, got ' + UI.restedQuantum());
      UI._setSeat({ castle_tier: 5, standing: 0, treasury: 0, upkeep_state: 'dormant',
                    upgrades: { tavern: 10 }, stores: {}, orders: [] }, 'test-hold');
      assert(UI.restedQuantum() === 0, 'a dormant hold rests nobody');
    } finally {
      UI._reset();
      G.restedXp = saved.rested; G.skills.crafting = saved.crafting; G.rooms = saved.rooms;
    }
  }),

  // §13 — the panel is a PLACE, and it is honest in every state. The failure
  // this guards against is the one every social panel eventually commits:
  // drawing a meter whose number it does not have.
  () => tryRun('b223: the Clan Seat panel draws no meter it cannot fill', () => {
    const UI = window.HearthriseClanSeatUI;
    const host = document.createElement('div');
    try {
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 4, treasury: 123456, myRole: 'leader' });

      // 1 — un-migrated. It says so, in words, and draws nothing else.
      UI._setSupport('unsupported');
      UI.render(host);
      let html = host.innerHTML;
      assert(/not chartered on the server yet/.test(html), 'the un-migrated state must say what is missing');
      assert(html.indexOf('hr-cs-bar') < 0, 'the un-migrated panel must draw no bars at all');
      assert(/123,456/.test(html), 'it must still show the treasury it genuinely knows');
      assert(/hrcs-svg/.test(html), 'the hold itself is real even before the migration');

      // 2 — a live Wayside Camp. Every wing is unbuilt, and the picture says so
      // with a dashed outline rather than a dimmer copy of a building.
      UI._setSeat({ castle_tier: 1, standing: 0, treasury: 0, upkeep_state: 'active',
                    upgrades: {}, stores: {}, orders: [] }, 'test-hold');
      UI.render(host);
      html = host.innerHTML;
      assert(/The Foundation/.test(html), 'tier 1 must be named'); // b227 rename
      assert((html.match(/is-ghost/g) || []).length === 5, 'all five wings must be ghosted at a fresh camp');
      assert(/12,000/.test(html), 'the next tier gate must be stated');
      assert(/Needs contributions from <b>3 different members<\/b>/.test(html),
        'the distinct-contributor requirement must be shown honestly, in plain language');

      // 3 — a Timber Hold mid-build. Built wings are lit, unbuilt still ghosted.
      UI._setSeat({ castle_tier: 3, standing: 61000, treasury: 200000, upkeep_state: 'active',
                    upgrades: { tavern: 4, sawmill: 3 }, stores: { timber_beam: 900 },
                    orders: [{ id: 'o1', building: 'smeltery', to_level: 1, phase: 'supply',
                               materials: { timber_beam: 25, iron_fitting: 25 }, supplied: { timber_beam: 25 },
                               labour_done: 0, labour_target: 800,
                               posted_at: new Date().toISOString() }] }, 'test-hold');
      UI.render(host);
      html = host.innerHTML;
      assert(/Timber Hold/.test(html), 'tier 3 must be named');
      assert((html.match(/is-ghost/g) || []).length === 3, 'three wings are still unbuilt at this hold');
      assert(/Lv 4/.test(html) && /Lv 3/.test(html), 'the legend must print the real levels');
      // b228: an open order is the panel's LEAD STORY, not a percentage in a
      // strip. It names the building, the level, and every material.
      assert(/The hold is building/.test(html), 'an open order must lead the panel');
      assert(html.indexOf('Smeltery → Level 1') >= 0, 'the lead block must name the building and the level');
      assert(/Gathering materials/.test(html), 'an order in supply must say it is gathering materials');

      // 4 — a Fortified Keep, dormant. Nothing is de-levelled; the lights are
      // out and the panel says exactly what that costs and how to fix it.
      UI._setSeat({ castle_tier: 5, standing: 900000, treasury: 0, upkeep_state: 'dormant',
                    upgrades: { treasury: 10, tavern: 10, sawmill: 10, smeltery: 10, war_room: 10 },
                    stores: {}, orders: [] }, 'test-hold');
      UI.render(host);
      html = host.innerHTML;
      assert(/Fortified Keep/.test(html), 'tier 5 must be named');
      assert(html.indexOf('is-ghost') < 0, 'a fully built keep ghosts nothing');
      assert((html.match(/is-dorm/g) || []).length >= 5, 'a dormant hold must dim every wing');
      assert(/dormant/.test(html), 'the upkeep state must be named when it is not Active');
      assert(/keeps every level it has earned/.test(html), 'dormancy must promise what it promises');
      assert(/summit of Phase A/.test(html), 'tier 5 must not invent a tier 6 gate');

      // The Hunt column is a STATEMENT, not an empty boss bar — the Hunt owns
      // that meter and it is being rebuilt elsewhere.
      assert(/ceiling/.test(html), 'the War Room must state the Hunt tier ceiling');
      assert(html.indexOf('boss') < 0, 'the castle must not draw the Hunt\'s own meter');
    } finally { UI._reset(); }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b228 — CLAN GOVERNANCE (Tyler, 2026-08-09)

     Three directives, and each one has a failure mode a passing build would
     otherwise hide:
       · the Work Order block can regress to a percentage bar and still "work"
       · the posting gate can widen by accident and only fail at the server
       · the vote can silently fake itself on an un-migrated project
     ══════════════════════════════════════════════════════════════════════ */
  () => tryRun('b228: the Work Order block names every material with have/need', () => {
    const UI = window.HearthriseClanSeatUI;
    const host = document.createElement('div');
    try {
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 3, treasury: 5000, myRole: 'member' });
      UI._setSeat({ castle_tier: 3, standing: 61000, treasury: 5000, upkeep_state: 'active',
                    my_role: 'member', upgrades: { tavern: 2 },
                    stores: { timber_beam: 120, iron_fitting: 5 },
                    orders: [{ id: 'o1', building: 'tavern', to_level: 3, phase: 'supply',
                               materials: { timber_beam: 600, iron_fitting: 200, field_ration: 900 },
                               supplied: { timber_beam: 340, iron_fitting: 80 },
                               labour_done: 0, labour_target: 1613,
                               posted_at: new Date().toISOString() }] }, 'test-hold');
      UI.render(host);
      const html = host.innerHTML;

      assert(/The hold is building/.test(html), 'the block must announce itself as the lead story');
      assert(html.indexOf('The Tavern → Level 3') >= 0, 'it must name the building and the level it is going to');

      // EVERY material, named, with its real have/need — the whole point.
      ['Timber Beam', 'Iron Fitting', 'Field Ration'].forEach((nm) => {
        assert(html.indexOf(nm) >= 0, 'the block must name ' + nm + ' in words');
      });
      assert(/340 \/ 600/.test(html), 'Timber Beams must read 340 / 600');
      assert(/80 \/ 200/.test(html), 'Iron Fittings must read 80 / 200');
      assert(/0 \/ 900/.test(html), 'an untouched material must still get its own row');
      assert(/260 still needed/.test(html), 'the block must say how many more are wanted');

      // The labour half of the same order, and one button that goes somewhere.
      assert(/Labour/.test(html) && /0 \/ 1,613/.test(html), 'the labour meter must be on the block');
      assert(/data-cs="room" data-b="tavern"[^>]*>Contribute/.test(html),
        'the block must end in a one-tap Contribute into the room that owns the order');

      // …and the same news must not also be told as a percentage in the strip.
      assert(!/Work Order &middot; supply/.test(html),
        'the week strip must not repeat an open order as a bare percentage');

      // THE COST-TEXT LAW. Named text, never below 14.5px. Measured against the
      // real stylesheet rather than asserted about the source.
      const probe = document.createElement('div');
      probe.style.position = 'absolute'; probe.style.left = '-9999px';
      probe.innerHTML = '<div class="hr-cs-wo"><div class="hr-cs-wo-mats"><div class="hr-cs-wo-mat">' +
        '<div class="hr-cs-wo-mat-top"><span class="hr-cs-wo-mat-nm">Timber Beams</span>' +
        '<span class="hr-cs-wo-mat-qty">340 / 600</span></div>' +
        '<div class="hr-cs-wo-mat-foot">260 still needed</div></div></div></div>';
      document.body.appendChild(probe);
      try {
        ['hr-cs-wo-mat-nm', 'hr-cs-wo-mat-qty', 'hr-cs-wo-mat-foot'].forEach((cls) => {
          const px = parseFloat(getComputedStyle(probe.querySelector('.' + cls)).fontSize);
          assert(px >= 14.5, '.' + cls + ' is ' + px + 'px — cost text may not drop below 14.5px');
        });
      } finally { probe.remove(); }
    } finally { UI._reset(); }
  }),

  () => tryRun('b228: only the leader and vice leaders may post work orders', () => {
    const UI = window.HearthriseClanSeatUI;
    const C = window.HearthriseClanSeat;

    // The rule itself, in the one place both the client and the migration read.
    assert(C.mayPostOrder('leader', null) === true, 'the leader always posts');
    assert(C.mayPostOrder('officer', 'vice') === true, 'a vice charge posts');
    assert(C.mayPostOrder('member', 'vice') === true, 'the charge carries the right, not the role');
    assert(C.mayPostOrder('officer', 'steward') === true,
      'a steward charge granted before the rename must not be silently demoted');
    assert(C.mayPostOrder('officer', null) === false, 'a plain officer does NOT post');
    assert(C.mayPostOrder('member', null) === false, 'a member does NOT post');
    assert(C.mayPostOrder('member', 'marshal') === false, 'the Marshal is combat authority, not economic');

    const host = document.createElement('div');
    const seatFor = (role, charge) => ({
      castle_tier: 3, standing: 61000, treasury: 5000, upkeep_state: 'active',
      my_role: role, my_charge: charge, upgrades: { tavern: 2 }, stores: {}, orders: []
    });
    try {
      // A member is told who posts, and is given no dead button.
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 3, treasury: 0, myRole: 'member' });
      UI._setSeat(seatFor('member', null), 'test-hold');
      assert(UI.isVice() === false, 'a plain member is not a vice leader');
      UI.render(host);
      assert(/leader and vice leaders post work orders/.test(host.innerHTML),
        'a member must be told plainly who posts the next order');
      let ladder = UI._wingLadder(UI.BUILDINGS.filter((b) => b.id === 'sawmill')[0]);
      assert(/Only the leader and vice leaders post work orders\./.test(ladder.rows[0].why),
        'the ladder must refuse a member in the same words');
      assert(!ladder.rows[0].action, 'a member must get no Commission button at all');

      // Grant the charge and the same hold becomes commissionable.
      UI._setSeat(seatFor('officer', 'vice'), 'test-hold');
      assert(UI.isVice() === true, 'the vice charge must unlock commissioning');
      ladder = UI._wingLadder(UI.BUILDINGS.filter((b) => b.id === 'sawmill')[0]);
      assert(ladder.rows[0].action && ladder.rows[0].action.name === 'post',
        'a vice leader must get the Commission button');

      // Raising the HOLD stays leader-only — that is a different power.
      UI._setSeat(seatFor('officer', 'vice'), 'test-hold');
      const hall = UI.roomDescriptor('great_hall');
      const rung = hall.sections.filter((x) => x.kind === 'ladder')[0];
      assert(rung && !rung.rows[0].action, 'a vice leader may commission work but not raise the hold');
      assert(/Only the leader can raise the hold\./.test(rung.note), 'and it must say so');
    } finally { UI._reset(); }
  }),

  () => tryRun('b228: the vote reducers answer ok / tie / expired / unsupported', () => {
    const C = window.HearthriseClanSeat;

    // UNSUPPORTED — the project has not run the governance migration. This is
    // not an error, and confusing the two hides a whole feature behind a red toast.
    [[404, null], [400, { code: 'PGRST202' }], [400, { code: '42883' }], [400, { code: '42P01' }]]
      .forEach(([st, body]) => {
        assert(C.reduceVoteRead(st, body).action === 'unsupported', 'a missing RPC is unsupported, not a failure');
        assert(C.reduceVoteCast(st, body).action === 'unsupported', 'cast: same contract');
        assert(C.reduceVoteClose(st, body).action === 'unsupported', 'close: same contract');
      });

    // OK — a running vote, normalized into one shape.
    const read = C.reduceVoteRead(200, { ok: true, may_open: true, vote: {
      id: 'v1', deadline: new Date(Date.now() + 3600000).toISOString(),
      candidates: [{ building: 'tavern', to_level: 3 }, { building: 'sawmill', to_level: 2 }],
      tally: { tavern: 4, sawmill: 2 }, my_vote: 'tavern', voters: 6, members: 11 } });
    assert(read.action === 'accept' && read.mayOpen === true, 'a live read must accept');
    assert(read.vote.votes === 6 && read.vote.leaders.join() === 'tavern',
      'the tally must total and lead correctly');
    assert(read.vote.tie === false, 'a clear winner is not a tie');
    assert(read.vote.myVote === 'tavern', 'my own ballot must survive normalization');

    // TIE — reported, never broken.
    assert(C.voteIsTie({ tavern: 3, sawmill: 3 }) === true, 'equal counts are a tie');
    assert(C.voteLeaders({ tavern: 3, sawmill: 3, war_room: 1 }).join() === 'sawmill,tavern',
      'a tie must name every building that tied');
    const tie = C.reduceVoteClose(200, { ok: true, outcome: 'tie', tally: { tavern: 3, sawmill: 3 },
      tied: ['tavern', 'sawmill'] });
    assert(tie.action === 'accept' && tie.outcome === 'tie', 'a tie closes successfully and says so');
    assert(tie.tied.join() === 'sawmill,tavern' && !tie.winner,
      'a tie must name the tied buildings and post nothing');

    // POSTED and VOID — the other two honest outcomes.
    const won = C.reduceVoteClose(200, { ok: true, outcome: 'posted', winner: 'tavern',
      order_id: 'o9', tally: { tavern: 5 } });
    assert(won.outcome === 'posted' && won.winner === 'tavern' && won.orderId === 'o9',
      'a won vote must carry the order it created');
    const none = C.reduceVoteClose(200, { ok: true, outcome: 'void', reason: 'no_ballots', tally: {} });
    assert(none.outcome === 'void' && none.reason === 'no_ballots', 'an empty ballot box is void, with a reason');

    // EXPIRED — a ballot cast into a vote that just closed is its own action,
    // because the player did nothing wrong and must not see a red error.
    // (A Supabase RPC refusal is HTTP 200 with ok:false — the status only
    //  carries transport failures, which is why 400 here would be a network
    //  error rather than the server's own answer.)
    const late = C.reduceVoteCast(200, { ok: false, error: 'vote_closed' });
    assert(late.action === 'expired', 'a late ballot must reduce to expired, not fail');
    assert(/already closed/.test(late.message), 'and it must say so in words');
    assert(C.voteExpired(Date.now() - 1, Date.now()) === true, 'a passed deadline is expired');
    assert(C.voteExpired(Date.now() + 60000, Date.now()) === false, 'a future deadline is not');
    assert(C.voteExpired(null, Date.now()) === false, 'a missing deadline must never read as expired');

    // A refusal is still a refusal, with a sentence rather than a code.
    const refused = C.reduceVoteOpen(200, { ok: false, error: 'not_vice' });
    assert(refused.action === 'fail' && /vice leader/.test(refused.message),
      'the posting refusal must be a sentence a player can read');
    assert(/vice leader/.test(C.errorText('not_steward')),
      'a pre-migration server answering not_steward must produce the same sentence');
    assert(C.reduceVoteRead(401, { message: 'JWT expired' }).action === 'fail',
      'a body with no ok field is a refusal, never a success');

    // The vote's own shape rules.
    assert(C.VOTE_MIN_CANDIDATES === 2 && C.VOTE_MAX_CANDIDATES === 4, 'a vote holds 2 to 4 choices');
    assert(C.VOTE_DEFAULT_HOURS === 24, 'the default deadline is 24 hours');
    assert(C.voteTotal(C.voteTally({ a: 2, b: 'x', c: -1 })) === 2, 'a tally must drop what is not a count');
  }),

  () => tryRun('b228: the vote card is honest — hidden un-migrated, live when it runs', () => {
    const UI = window.HearthriseClanSeatUI;
    const host = document.createElement('div');
    const baseSeat = (role, charge) => ({
      castle_tier: 3, standing: 61000, treasury: 5000, upkeep_state: 'active',
      my_role: role, my_charge: charge, upgrades: { tavern: 2, sawmill: 1 }, stores: {}, orders: []
    });
    try {
      // 1 — un-migrated: NOTHING. Not a greyed button, not "coming soon".
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 3, treasury: 0, myRole: 'leader' });
      UI._setSeat(baseSeat('leader', null), 'test-hold');
      UI._setVote(null);
      assert(UI.voteSupported() === false, 'an un-migrated project must not claim vote support');
      assert(UI._voteCard() === '', 'the vote card must be absent, not faked, before the migration');

      // 2 — a running vote, seen by an ordinary member.
      UI._setSeat(baseSeat('member', null), 'test-hold');
      UI._setVote({ id: 'v1', deadline: new Date(Date.now() + 7200000).toISOString(),
        candidates: [{ building: 'tavern', to_level: 3 }, { building: 'sawmill', to_level: 2 }],
        tally: { tavern: 4, sawmill: 2 }, my_vote: null, voters: 6, members: 11 }, false);
      let card = UI._voteCard();
      assert(/The hold is deciding/.test(card), 'a running vote must announce itself');
      assert(/The Tavern &rarr; Level 3/.test(card) && /Sawmill &rarr; Level 2/.test(card),
        'every candidate must be named with the level it would build');
      assert(/4 votes/.test(card) && /2 votes/.test(card), 'the tally must be visible to everyone');
      assert(/6 of 11 members have voted/.test(card), 'turnout must be stated');
      assert(/data-cs="vote-cast" data-b="tavern"/.test(card), 'a member must be able to vote');
      assert(card.indexOf('vote-close') < 0, 'a member must NOT be offered the close button');

      // 3 — the same vote seen by a vice leader, with my ballot already cast.
      UI._setSeat(baseSeat('officer', 'vice'), 'test-hold');
      UI._setVote({ id: 'v1', deadline: new Date(Date.now() + 7200000).toISOString(),
        candidates: [{ building: 'tavern', to_level: 3 }, { building: 'sawmill', to_level: 2 }],
        tally: { tavern: 4, sawmill: 2 }, my_vote: 'tavern', voters: 6, members: 11 }, true);
      card = UI._voteCard();
      assert(/data-cs="vote-close"/.test(card), 'leadership may close a vote early');
      assert(/Your vote\./.test(card), 'my own ballot must be marked');
      assert(!/data-cs="vote-cast" data-b="tavern"/.test(card), 'and must not offer to cast it again');

      // 4 — a tie: explained, and nothing pretends to have been built.
      UI._setVote({ id: 'v1', deadline: new Date(Date.now() - 1000).toISOString(),
        closed_at: new Date().toISOString(), outcome: 'tie',
        candidates: [{ building: 'tavern', to_level: 3 }, { building: 'sawmill', to_level: 2 }],
        tally: { tavern: 3, sawmill: 3 }, voters: 6, members: 11 }, true);
      card = UI._voteCard();
      assert(/It tied/.test(card) && /Sawmill and The Tavern/.test(card), 'a tie must name who tied');
      assert(/never broken by chance/.test(card), 'and must explain why nothing was built');

      // 5 — the opener. Leadership only, 2-4 picks, and the button is dead
      //     until enough are picked.
      UI._setVote({ id: 'v0', deadline: new Date(Date.now() - 1000).toISOString(),
        closed_at: new Date().toISOString(), outcome: 'void', outcome_error: 'no_ballots',
        candidates: [], tally: {}, voters: 0, members: 11 }, true);
      UI._setVotePick([]);
      card = UI._voteCard();
      assert(/data-cs="vote-pick"/.test(card), 'leadership must be offered candidates to pick');
      assert(/data-cs="vote-open"[^>]*disabled/.test(card), 'the opener is disabled until 2 are picked');
      UI._setVotePick(['tavern', 'sawmill']);
      card = UI._voteCard();
      assert(/data-cs="vote-open"(?![^>]*disabled)/.test(card), 'two picks must arm the opener');
      assert(/2 picked\./.test(card), 'the count of picks must be visible');

      // …and an ordinary member is never shown the opener at all.
      UI._setSeat(baseSeat('member', null), 'test-hold');
      UI._setVote({ id: 'v0', deadline: new Date(Date.now() - 1000).toISOString(),
        closed_at: new Date().toISOString(), outcome: 'void', outcome_error: 'no_ballots',
        candidates: [], tally: {}, voters: 0, members: 11 }, false);
      assert(UI._voteCard().indexOf('vote-pick') < 0, 'a member must never see the vote opener');
    } finally { UI._reset(); }
  }),

  () => tryRun('b228: the leader grants the vice charge from the roster', () => {
    const UI = window.HearthriseClanSeatUI;
    const seatFor = (role, charge) => ({
      castle_tier: 2, standing: 0, treasury: 0, upkeep_state: 'active',
      my_role: role, my_charge: charge, upgrades: {}, stores: {}, orders: []
    });
    const them = { user_id: 'u2', role: 'officer', charge: null, contributed: 500,
                   cp: 100, cp_at: new Date().toISOString(),
                   joined_at: new Date(Date.now() - 10 * 86400000).toISOString(),
                   profiles: { display_name: 'Bramble' } };
    try {
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 1, treasury: 0, myRole: 'leader' });
      UI._setSeat(seatFor('leader', null), 'test-hold');

      let row = UI._rosterRow(them);
      assert(/data-cs="vice" data-u="u2" data-g="1"/.test(row.right), 'the leader must be able to grant the charge');
      assert(/Make vice leader/.test(row.right), 'and the button must say what it does');
      assert(row.meta.indexOf('Officer') === 0, 'the rank must read in words, not as a column value');

      const vice = Object.assign({}, them, { charge: 'vice' });
      row = UI._rosterRow(vice);
      assert(/Vice leader/.test(row.meta), 'a vice leader must read as one on the roster');
      assert(/data-g="0"/.test(row.right) && /Remove vice/.test(row.right), 'and the grant must be revocable');

      // The leader may not demote themself by accident, and nobody else may grant.
      const me = Object.assign({}, them, { user_id: 'u1', role: 'leader' });
      assert(UI._rosterRow(me).right.indexOf('data-cs="vice"') < 0, 'the leader row carries no grant button');
      UI._setSeat(seatFor('officer', 'vice'), 'test-hold');
      assert(UI._rosterRow(them).right.indexOf('data-cs="vice"') < 0,
        'a vice leader may not create another vice leader — that is the leader\'s alone');

      // An un-migrated project hides the button rather than offering a refusal.
      UI._setSeat(seatFor('leader', null), 'test-hold');
      UI._setViceSupport('unsupported');
      assert(UI._rosterRow(them).right.indexOf('data-cs="vice"') < 0,
        'a grant button that can only fail must not be drawn');
    } finally { UI._reset(); }
  }),

  () => tryRun('b228: the clan panel speaks player language, not design-doc register', () => {
    const UI = window.HearthriseClanSeatUI;
    const host = document.createElement('div');
    const texts = [];
    const collect = (node) => {
      const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let t; while ((t = w.nextNode())) texts.push(t.nodeValue);
    };
    try {
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 3, treasury: 9000, myRole: 'leader' });
      UI._setSeat({ castle_tier: 2, standing: 20000, treasury: 9000, upkeep_state: 'active',
                    my_role: 'leader', tier_contributors: 1, members: 8, member_cap: 15,
                    upgrades: { tavern: 2 }, stores: { timber_beam: 100 }, orders: [] }, 'test-hold');
      UI.render(host);
      const html = host.innerHTML;

      // The sentence Tyler could not parse, rewritten — with the live count.
      assert(/Needs contributions from <b>5 different members<\/b> \(<b>1<\/b> so far\)/.test(html),
        'the tier gate must state the requirement AND how far along it is');
      assert(/New members count 3 days after joining/.test(html),
        '"72 hours in the hold" must read as three days, in a sentence of its own');
      assert(/this keeps holds honest/.test(html), 'and it must say WHY the rule exists');
      assert(/Buildings can reach <b>level 4<\/b> now/.test(html),
        'the level cap must read as what you CAN do, not as what you are denied');
      assert(!/each after 72 hours in the hold/.test(html), 'the old welded-together clause must be gone');
      assert(!/capped at level/.test(html), 'and so must "capped at level N until the hold rises"');

      // A server that has not published the count must not have one invented.
      UI._setSeat({ castle_tier: 2, standing: 20000, treasury: 9000, upkeep_state: 'active',
                    my_role: 'leader', upgrades: {}, stores: {}, orders: [] }, 'test-hold');
      UI.render(host);
      assert(!/so far/.test(host.innerHTML), 'without the server count, the clause is dropped, never zeroed');

      // No migration filenames, no schema words, no internal register anywhere
      // a player can read — except the one honest "the tables do not exist yet"
      // sentence the un-migrated Board owns.
      UI._setSeat({ castle_tier: 4, standing: 250000, treasury: 900000, upkeep_state: 'active',
                    my_role: 'leader', tier_contributors: 3,
                    upgrades: { treasury: 3, tavern: 7, sawmill: 2, smeltery: 2, war_room: 6 },
                    stores: { timber_beam: 2400 },
                    orders: [{ id: 'o1', building: 'sawmill', to_level: 3, phase: 'labour',
                               materials: { timber_beam: 88 }, supplied: { timber_beam: 88 },
                               labour_done: 900, labour_target: 1613,
                               posted_at: new Date().toISOString() }] }, 'test-hold');
      UI.render(host);
      texts.length = 0;
      collect(host);
      UI.ROOM_IDS().forEach((room) => {
        UI.openRoom(room);
        const scrim = document.querySelector('.hr-room-scrim');
        if (scrim) collect(scrim);
        UI.closeModal();
      });
      const BAD = /\.sql\b|migration|jsonb|rpc\b|supabase|user_id|clan_members|castle_tier|\bnull\b|§\d/i;
      const offenders = texts.filter((t) => BAD.test(t)).map((t) => t.trim().slice(0, 90));
      assert(offenders.length === 0,
        'design-doc register reached the player: ' + offenders.slice(0, 3).join(' | '));
    } finally { UI.closeModal(); UI._reset(); }
  }),

  () => tryRun('b223: no emoji in the Clan Seat DOM, in any state', () => {
    const UI = window.HearthriseClanSeatUI;
    const EMO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    const host = document.createElement('div');
    const offenders = [];
    const sweep = (label, node) => {
      const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let t;
      while ((t = w.nextNode())) if (EMO.test(t.nodeValue)) offenders.push(label + ': ' + t.nodeValue.trim());
    };
    try {
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 4, treasury: 1000, myRole: 'leader' });
      UI._setSupport('unsupported');
      UI.render(host); sweep('unsupported', host);
      [1, 2, 3, 4, 5].forEach((tier) => {
        ['active', 'strained', 'dormant'].forEach((state) => {
          UI._setSeat({ castle_tier: tier, standing: 1000 * tier, treasury: 5000, upkeep_state: state,
                        upgrades: tier >= 3 ? { tavern: tier, sawmill: 1, treasury: 2 } : {},
                        stores: { timber_beam: 40 }, orders: [] }, 'test-hold');
          UI.render(host);
          sweep('tier' + tier + '/' + state, host);
        });
      });
      // The modals too — they are where most of the copy lives.
      UI._setSeat({ castle_tier: 4, standing: 250000, treasury: 900000, upkeep_state: 'active',
                    upgrades: { treasury: 3, tavern: 7, sawmill: 2, smeltery: 2, war_room: 6 },
                    stores: { timber_beam: 2400, iron_fitting: 100 },
                    orders: [{ id: 'o1', building: 'sawmill', to_level: 3, phase: 'labour',
                               materials: { timber_beam: 88 }, supplied: { timber_beam: 88 },
                               labour_done: 900, labour_target: 1613,
                               posted_at: new Date().toISOString(),
                               floor_until: new Date(Date.now() - 1000).toISOString() }] }, 'test-hold');
      UI.ROOM_IDS().forEach((room) => {
        UI.openRoom(room);
        const scrim = document.querySelector('.hr-room-scrim');
        assert(scrim, 'the ' + room + ' room did not open');
        sweep('room/' + room, scrim);
        UI.closeModal();
      });
      assert(offenders.length === 0, 'emoji in the Clan Seat — ' + offenders.slice(0, 4).join(' | '));
    } finally { UI.closeModal(); UI._reset(); }
  }),

  // §4.2 — "the castle refuses raw gathered materials", and §3.4's 0.4x-at-cap
  // rule, which is the one the player must be WARNED about rather than
  // discovering after being paid 40%.
  () => tryRun('b223: the Storehouse refuses raws and recipe inputs, and previews the real rate', () => {
    const UI = window.HearthriseClanSeatUI;
    const C = window.HearthriseClanSeat;
    const G = window.G;
    const savedInv = JSON.parse(JSON.stringify(G.inventory || {}));
    try {
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 1, treasury: 0, myRole: 'leader' });
      G.inventory = {
        timber_beam: 50, iron_fitting: 10, keystone: 2,     // refined castle goods — accepted
        normal_plank: 500, iron_bar: 40, raw_shrimp: 90,    // raw / intermediate — refused
        wraith_veil: 6, war_crown: 1,                       // routed spoils + a trophy — accepted
        slime_gel: 200, ancient_fragment: 9                 // recipe inputs — refused, like a log
      };
      UI._setSeat({ castle_tier: 2, standing: 0, treasury: 0, upkeep_state: 'active',
                    upgrades: { treasury: 1 }, stores: { timber_beam: 2500 }, orders: [] }, 'test-hold');

      const list = UI._depositable();
      ['timber_beam', 'iron_fitting', 'keystone', 'wraith_veil', 'war_crown'].forEach((id) => {
        assert(list.indexOf(id) >= 0, 'the Storehouse must accept ' + id);
      });
      ['normal_plank', 'iron_bar', 'raw_shrimp'].forEach((id) => {
        assert(list.indexOf(id) < 0, 'the Storehouse must refuse the raw/intermediate ' + id);
      });
      // The four recipe inputs are consumed at a workbench. The server's own
      // catalogue deliberately omits them; the client must agree, or the picker
      // offers a deposit the server will refuse.
      ['slime_gel', 'ancient_fragment'].forEach((id) => {
        assert(list.indexOf(id) < 0, id + ' is a recipe input — the Storehouse must refuse it');
      });

      // The demand multiplier the picker previews, against the three cases.
      assert(UI._demandFor('timber_beam') === 'capped',
        'a full Storehouse must preview 0.4x, not the tier bundle rate');
      assert(UI._demandFor('iron_fitting') === 'ordered',
        'the next tier bundle wants Iron Fittings — that is 1.5x');
      assert(UI._demandFor('war_crown') === 'normal', 'nothing on demand pays 1.0x');

      // And the preview is the SPEC's arithmetic, from the tested module.
      const beam = window.ITEMS.iron_fitting;
      assert(C.cpForDeposit(beam.v, beam.tier, 'ordered', 1) === 100,
        'an Iron Fitting on demand is 100 CP — §3.4\'s worked table');
      assert(C.standingFor(100) === 35, '100 CP is 35 Standing');
    } finally { G.inventory = savedInv; UI._reset(); }
  }),

  // Every structure in the hold is a door, and each door opens ITS room — not
  // six copies of one modal with the title swapped. This is the product-owner
  // direction of 2026-08-08, and the seam is deliberately generic so the
  // personal homestead's rooms can adopt it unchanged.
  () => tryRun('b223: six clickable structures, six distinct rooms, one reusable component', () => {
    const UI = window.HearthriseClanSeatUI;
    const RM = window.HearthriseRoomModal;
    assert(RM && typeof RM.open === 'function', 'the room-modal seam must be published for reuse');
    const host = document.createElement('div');
    try {
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 4, treasury: 500000, myRole: 'leader' });
      UI._setSeat({ castle_tier: 4, standing: 250000, treasury: 500000, upkeep_state: 'active',
                    upgrades: { treasury: 3, tavern: 7, sawmill: 2, smeltery: 2, war_room: 6 },
                    stores: { timber_beam: 2400, iron_fitting: 120 }, orders: [] }, 'test-hold');
      UI.render(host);

      // Every structure in the picture carries the same door contract the
      // buttons do, and is reachable by keyboard.
      const rooms = UI.ROOM_IDS();
      assert(rooms.length === 6, 'the hold has six rooms in Phase A, got ' + rooms.length);
      rooms.forEach((id) => {
        assert(host.querySelector('.hrcs-room[data-b="' + id + '"]'),
          id + ' is not clickable in the picture');
        assert(host.querySelector('.hr-cs-door[data-b="' + id + '"]'),
          id + ' has no keyboard/mobile door');
        const g = host.querySelector('.hrcs-room[data-b="' + id + '"]');
        assert(g.getAttribute('role') === 'button' && g.getAttribute('tabindex') === '0',
          id + ' must be reachable without a mouse');
        assert(g.querySelector('.hrcs-hitbox'), id + ' needs a hit area — a dashed outline is barely clickable');
      });

      // Each room is genuinely ITS room: a distinct interior, a distinct theme,
      // and its own information rather than a shared template.
      const seen = {};
      rooms.forEach((id) => {
        const d = UI.roomDescriptor(id);
        assert(d && d.scene && d.title, id + ' produced no descriptor');
        assert(!seen[d.theme], 'two rooms share the theme "' + d.theme + '" — they must not look alike');
        seen[d.theme] = true;
        assert(!seen['scene:' + d.scene], id + ' reuses another room\'s interior');
        seen['scene:' + d.scene] = true;
        assert(d.sections && d.sections.length >= 2, id + ' has nothing in it');
      });

      // The five commissionable wings each carry a real upgrade ladder — the
      // "what does the next level cost and give me" question, answered from the
      // tested reducers rather than re-derived per room.
      UI.BUILDINGS.forEach((b) => {
        const d = UI.roomDescriptor(b.id);
        const ladder = d.sections.filter((s) => s.kind === 'ladder')[0];
        assert(ladder, b.id + ' must show an upgrade ladder');
        assert(ladder.rows.length >= 1, b.id + ' ladder is empty');
        const next = ladder.rows[0];
        const cur = UI.buildingLevel(b.id);
        assert(next.level === cur + 1, b.id + ' ladder must start at the next level');
        const scale = window.HearthriseClanSeat.materialScale(next.level);
        const beam = next.costs.filter((c) => c.label === window.ITEMS.timber_beam.n)[0];
        assert(beam && beam.need === Math.ceil(b.bundle.timber_beam * scale),
          b.id + ' bundle must scale by the tested materialScale, got ' + (beam && beam.need));
      });

      // The Great Hall is the exception that proves it: it has no ladder of its
      // own because it IS castle_tier, and it carries the roster and the
      // hold-wide Work Order list instead.
      const hall = UI.roomDescriptor('great_hall');
      assert(/Great Hall/.test(hall.title), 'the hall must name itself');
      assert(hall.sections.some((s) => s.title === 'Those sworn to the hold'),
        'the hall is where the hold gathers — the roster belongs in it');

      // The War Room states the Hunt tier ceiling it grants (the Hunt agent's
      // hand-off: raidPower has a consumer in simulateStrike, this is its
      // producer, and this line is how a player learns what the room is for).
      const war = UI.roomDescriptor('war_room');
      assert(JSON.stringify(war.sections).indexOf('Tier ceiling') >= 0,
        'the War Room must display the Hunt tier ceiling');
      /* b228: the War Room's ladder is +1% at levels 4, 7 and 10, so a level-6
         room publishes +1%. Its real payload is the tier ceiling asserted just
         above — access, not throughput (bonus-rebase.md §5.3). */
      assert(Math.abs(UI.castlePermanent('raidPower') - 0.01) < 1e-9,
        'War Room 6 must publish +1% raidPower for simulateStrike, got ' + UI.castlePermanent('raidPower'));

      // The component itself knows nothing about clans — that is what makes it
      // reusable by the homestead next wave.
      const src = RM.open.toString() + RM._section.toString();
      assert(!/clan|castle|standing/i.test(src),
        'the room-modal component leaked a clan concept: it must stay generic');
    } finally { UI.closeModal(); UI._reset(); }
  }),

  // The b222 substrate contract, applied to the third in-world screen. If this
  // fails, somebody is about to start stacking ids again.
  () => tryRun('b223: clan-seat.css owns its colours — no blanket reaches .hr-cs', () => {
    const prevTheme = document.body.getAttribute('data-theme');
    document.body.setAttribute('data-theme', 'hearthlight');
    const fixture = document.createElement('div');
    fixture.innerHTML =
      '<section id="panel-social" class="panel active"><div class="card"><div class="card-body">' +
        '<div class="hr-cs"><div class="hr-cs-hold"><div class="hr-cs-plate">' +
          '<div class="hr-cs-tier">Palisade</div><div class="hr-cs-name">Testhold</div>' +
          '<div class="hr-cs-sub">leader</div></div></div>' +
        '<div class="hr-cs-doors"><button class="hr-cs-door is-built">' +
          '<span class="hr-cs-door-nm">Tavern</span><span class="hr-cs-door-lv">Lv 4</span></button></div>' +
        '<div class="hr-cs-line"><span class="hr-cs-label">Standing</span>' +
          '<span class="hr-cs-val"><b>1</b></span></div>' +
        '<p class="hr-cs-foot">x</p><small class="hr-cs-note">x</small></div>' +
      '</div></div></section>';
    document.body.appendChild(fixture);
    try {
      const els = Array.from(fixture.querySelectorAll('.hr-cs, .hr-cs *'));
      const offenders = [];
      for (const sheet of Array.from(document.styleSheets)) {
        const file = (sheet.href || '').split('/').pop().split('?')[0];
        if (!file || file === 'clan-seat.css') continue;      // the sheet that OWNS this surface
        let rules; try { rules = Array.from(sheet.cssRules); } catch { continue; }
        const walk = (list) => list.forEach((r) => {
          if (r.cssRules && !r.selectorText) { walk(Array.from(r.cssRules)); return; }
          if (!r.selectorText || !r.style) return;
          if (r.style.getPropertyPriority('color') !== 'important') return;
          for (const el of els) {
            let hit = false;
            try { hit = el.matches(r.selectorText); } catch { return; }
            if (hit) {
              offenders.push(file + ' :: ' + r.selectorText.slice(0, 70));
              return;
            }
          }
        });
        walk(rules);
      }
      assert(offenders.length === 0,
        offenders.length + ' !important colour rule(s) reach into the Clan Seat — add .hr-cs to the ' +
        'carve-out in theme-cozy.css instead of stacking ids: ' + offenders.slice(0, 3).join(' | '));

      // …and the other half of the bargain: the sheet that owns it uses none of
      // the weapons the carve-out made unnecessary.
      let own = null;
      for (const s of Array.from(document.styleSheets)) {
        if ((s.href || '').indexOf('clan-seat.css') >= 0) { own = s; break; }
      }
      assert(own, 'clan-seat.css is not loaded — check the <link> in index.html');
      let rules; try { rules = Array.from(own.cssRules); } catch { rules = []; }
      const sins = [];
      const check = (list) => list.forEach((r) => {
        if (r.cssRules && !r.selectorText) { check(Array.from(r.cssRules)); return; }
        if (!r.selectorText) return;
        if (/(#panel-[a-z-]+)\1/.test(r.selectorText)) sins.push('stacked id: ' + r.selectorText.slice(0, 60));
        if (r.style) {
          for (let i = 0; i < r.style.length; i++) {
            if (r.style.getPropertyPriority(r.style[i]) === 'important') {
              sins.push('!important ' + r.style[i] + ' on ' + r.selectorText.slice(0, 50));
            }
          }
        }
      });
      check(rules);
      assert(sins.length === 0, 'clan-seat.css should need neither: ' + sins.slice(0, 3).join(' | '));
    } finally {
      fixture.remove();
      if (prevTheme === null) document.body.removeAttribute('data-theme');
      else document.body.setAttribute('data-theme', prevTheme);
    }
  }),

  // b227 · THE DOOR STRIP CONTAINS ITS OWN TEXT.
  // The strip bleeds past the card body with a negative margin so its mortar
  // reaches the frame, and `#clan-panel` hides its overflow. Those two facts
  // met at the first cell: its 10px inset landed "The Great Hall" and "TIER 1"
  // two pixels OUTSIDE the clipping box, and the b225 type floor (12.5 → 13.5)
  // made the shave visible enough to be reported as a bug. This is the rect
  // containment test the bounty board's notices already get: measured ink
  // against a real clipping box, not eyeballed.
  () => tryRun('b227: no door-strip label is clipped by the panel that bleeds it', () => {
    const UI = window.HearthriseClanSeatUI;
    const prevTab = window.activeTab;
    assert(UI, 'HearthriseClanSeatUI missing');
    try {
      window.showTab('clan');
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Emberfall Watch', level: 1, treasury: 1, myRole: 'leader' });
      const problems = [];
      [1, 3, 5].forEach((tier) => {
        UI._setSeat({ castle_tier: tier, standing: 1000 * tier, treasury: 1, upkeep_state: 'active',
                      upgrades: tier >= 3 ? { tavern: tier, sawmill: 2, treasury: 2 } : {},
                      stores: {}, orders: [], members: 3, member_cap: 10 }, 'test-hold');
        UI.render(document.getElementById('clan-panel'));
        const strip = document.querySelector('#panel-clan .hr-cs-doors');
        assert(strip, 'tier ' + tier + ' rendered no door strip');
        const cells = strip.querySelectorAll('.hr-cs-door');
        assert(cells.length === 6, 'tier ' + tier + ' posted ' + cells.length + ' doors, not 6');
        // Every ancestor that hides its overflow is a box the ink must sit in.
        const clips = [];
        for (let a = strip; a && a !== document.body; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (cs.overflowX === 'hidden' || cs.overflowX === 'clip' ||
              cs.overflowY === 'hidden' || cs.overflowY === 'clip') clips.push(a);
        }
        cells.forEach((cell, i) => {
          const cr = cell.getBoundingClientRect();
          if (cr.height < 46) problems.push('t' + tier + ' cell ' + i + ' is only ' + Math.round(cr.height) + 'px tall');
          cell.querySelectorAll('.hr-cs-door-nm, .hr-cs-door-lv').forEach((label) => {
            const rg = document.createRange();
            rg.selectNodeContents(label);
            const ink = rg.getBoundingClientRect();
            if (!ink.height) return;
            // the label's own box first — `overflow:hidden` for the ellipsis
            // makes it exactly one line box tall, so tight leading shears it
            const lr = label.getBoundingClientRect();
            if (ink.top < lr.top - 0.6 || ink.bottom > lr.bottom + 0.6) {
              problems.push('t' + tier + ' "' + label.textContent + '" ink escapes its own line box — leading is tighter than the face');
            }
            clips.forEach((a) => {
              const b = a.getBoundingClientRect(), cs = getComputedStyle(a);
              const l = b.left + parseFloat(cs.borderLeftWidth);
              const r = b.right - parseFloat(cs.borderRightWidth);
              const t = b.top + parseFloat(cs.borderTopWidth);
              const bo = b.bottom - parseFloat(cs.borderBottomWidth);
              const scrolls = a.scrollHeight > a.clientHeight + 1 &&
                (cs.overflowY === 'auto' || cs.overflowY === 'scroll');
              if (ink.left < l - 0.6 || ink.right > r + 0.6) {
                problems.push('t' + tier + ' "' + label.textContent + '" is cut sideways by ' +
                  (a.id || a.className) + ' (ink ' + Math.round(ink.left) + '–' + Math.round(ink.right) +
                  ' vs ' + Math.round(l) + '–' + Math.round(r) + ')');
              }
              if (!scrolls && (ink.top < t - 0.6 || ink.bottom > bo + 0.6)) {
                problems.push('t' + tier + ' "' + label.textContent + '" is cut top/bottom by ' + (a.id || a.className));
              }
            });
            // and it must not have been ellipsised away
            if (label.scrollWidth - label.clientWidth > 1) {
              problems.push('t' + tier + ' "' + label.textContent + '" is truncated by ' +
                Math.round(label.scrollWidth - label.clientWidth) + 'px');
            }
          });
        });
      });
      assert(problems.length === 0, problems.slice(0, 4).join(' | '));
    } finally {
      UI._reset();
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  // b227 · THE FOOTPRINT IS THE PROGRESSION.
  // Tier 1 used to be a camp — tents and a fire, the homestead's vocabulary on
  // the clan's shared castle. It is now the same castle's foundation, and the
  // thing that makes that true rather than merely claimed is that tier 1 sets
  // out the EXACT rectangle tier 4 builds on. If someone moves one of them,
  // the promise breaks silently: the picture still looks fine, it just stops
  // being the same castle. This guard holds the two ends of that together.
  () => tryRun('b227: every tier draws the castle on one footprint, and the ladder only goes up', () => {
    const UI = window.HearthriseClanSeatUI;
    const host = document.createElement('div');
    // getBBox() is a LAYOUT query: on a detached node every box is 0x0 and this
    // guard passes vacuously. It has to be in the render tree.
    host.style.cssText = 'position:fixed;left:-4000px;top:0;width:1200px';
    document.body.appendChild(host);
    try {
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 1, treasury: 1, myRole: 'leader' });
      const crest = [];
      [1, 2, 3, 4, 5].forEach((tier) => {
        UI._setSeat({ castle_tier: tier, standing: 1, treasury: 1, upkeep_state: 'active',
                      upgrades: {}, stores: {}, orders: [] }, 'test-hold');
        UI.render(host);
        const svg = host.querySelector('.hrcs-svg');
        assert(svg, 'tier ' + tier + ' drew no scene');
        // The Great Hall group holds the tier's defences. Its own drawn extent
        // (hitbox and halo excluded — those are affordances, not the castle)
        // is the wall the tier has.
        const hall = svg.querySelector('[data-b="great_hall"]');
        assert(hall, 'tier ' + tier + ' has no Great Hall door in the picture');
        let lo = Infinity, hi = -Infinity, hiTop = Infinity;
        hall.querySelectorAll('rect, path').forEach((n) => {
          if (n.classList.contains('hrcs-hitbox') || n.classList.contains('hrcs-halo')) return;
          if (n.closest('.hrcs-plan')) return;                 // the plan is a drawing, not stone
          const b = n.getBBox ? n.getBBox() : null;
          if (!b || !b.width) return;
          lo = Math.min(lo, b.x); hi = Math.max(hi, b.x + b.width);
          hiTop = Math.min(hiTop, b.y);
        });
        assert(lo <= 512 && hi >= 1088,
          'tier ' + tier + ' spans ' + Math.round(lo) + '–' + Math.round(hi) +
          ', not the shared 500–1100 footprint — the tiers are drifting apart');
        crest.push(hiTop);
      });
      // Nothing in the hold may get shorter as the hold rises.
      for (let i = 1; i < crest.length; i++) {
        assert(crest[i] <= crest[i - 1] + 0.5,
          'tier ' + (i + 1) + ' is SHORTER than tier ' + i + ' (crest ' +
          Math.round(crest[i]) + ' vs ' + Math.round(crest[i - 1]) + ')');
      }
      // And tier 1 must promise the castle rather than pitch a camp.
      UI._setSeat({ castle_tier: 1, standing: 1, treasury: 1, upkeep_state: 'active',
                    upgrades: {}, stores: {}, orders: [] }, 'test-hold');
      UI.render(host);
      assert(host.querySelector('.hrcs-plan'),
        'tier 1 draws no castle plan over its foundation — nothing tells the player what is being built');
      assert(host.querySelector('.hrcs-terrace'),
        'the hold stands on no levelled ground — at these tokens the foundation is invisible without it');
    } finally { UI._reset(); host.remove(); }
  }),

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

  // ══════════════════════════════════════════════════════════════════════════
  // b224 — LIVE HOTFIX: "the quests are not updating when doing the task"
  //
  // readSource() is declared inside legacy.js block 16's IIFE. The Quests strip
  // and the Quests modal live in block 40's IIFE and read it ACROSS that
  // boundary, behind `if(typeof readSource !== 'function') return 0;`. With no
  // export the guard never threw — it answered 0. Every daily and weekly quest
  // rendered 0 / N forever on the strip that sits under the topbar on every
  // screen, and isComplete() was never true, so nothing was ever claimable.
  //
  // 274 tests stayed green through all of it because every quest test asserted
  // that the panel OPENS, CLOSES or LAYS OUT — never that a number MOVES. That
  // is the hole. These tests move real counters and read the rendered text back.
  // ══════════════════════════════════════════════════════════════════════════
  // gold-arm: claimQuestReward credits gold via clientMayWriteRecordField
  // (deferred GRANT, blocked on server daily/quest counters) — switch-OFF position.
  () => tryRunAsync('b224: a player action moves the RENDERED quest number (strip, modal, claim)', async () => {
    assert(typeof window.readSource === 'function',
      'window.readSource is not exported — the Quests strip/modal cannot compute any progress');
    assert(typeof window.getGoalsForToday === 'function', 'getGoalsForToday missing');
    assert(window.HearthriseEvents && typeof window.HearthriseEvents.emit === 'function',
      'the event bus that repaints the Quests strip is missing');

    const G = window.G;
    /* b492 — this used to SAVE AND RESTORE `G.skills.combat`, i.e. it made room
       for the phantom instead of refusing it. `combat` is not a skill (hr_skills
       carries attack/strength/defense/hitpoints/…; combat level is DERIVED), so
       hr_claim_goal dropped every kill-goal XP grant into `skipped_xp` and the
       XP half of kill_any / kill_more / wk_kills was never paid — while the modal
       printed it as part of the price. The reward now names HITPOINTS, and this
       test asserts the class is dead from the client end: the claim MOVES a real
       skill, and the phantom is never created. */
    const hadCombat = Object.prototype.hasOwnProperty.call(G.skills, 'combat');
    const saved = {
      kills: G.stats.kills, gold: G.gold, gems: G.gems,
      /* hitpoints XP is a REAL skill, so unlike the phantom it can level — and a
         hitpoints level-up assigns G.playerMaxHp (addXp's levelup branch). Both
         are restored, or this test would quietly raise the live player's max HP. */
      hitpoints: G.skills.hitpoints, playerMaxHp: G.playerMaxHp,
      dailyGoals: G.dailyGoals ? JSON.parse(JSON.stringify(G.dailyGoals)) : null,
      weeklyGoals: G.weeklyGoals ? JSON.parse(JSON.stringify(G.weeklyGoals)) : null,
    };
    /* Graded on what the CLAIM does, not on what is already in G: a long-lived
       local save can still carry legacy `combat` residue, and failing the suite
       in that player's browser would be a false alarm. The residue is left
       exactly as found (see the ANTI-MINT note — it is never converted into
       hitpoints, because it was never server-authored). */
    const combatBefore = hadCombat ? G.skills.combat : undefined;
    const repaint = () => window.HearthriseEvents.emit('smokeQuestRepaint', {});
    try {
      window.getGoalsForToday();                 // make sure today's object exists
      const dayKey = G.dailyGoals.dayKey;
      // One known goal ("Slay 30 monsters"), baselined at the current kill count.
      G.stats.kills = 40;
      G.dailyGoals = { dayKey: dayKey, picks: ['kill_more'], startValues: { kill_more: 40 }, claimed: {} };

      repaint();
      const strip = document.getElementById('global-quests-strip');
      assert(strip, 'the global Quests strip never rendered');
      assert(/0\s*\/\s*30/.test(strip.innerText),
        'a freshly baselined quest should read 0 / 30, got: ' + strip.innerText);

      G.stats.kills = 47;                        // seven kills later
      repaint();
      assert(/7\s*\/\s*30/.test(strip.innerText),
        'THE BUG: the Quests strip did not follow the counter — it still reads ' + strip.innerText);

      window.openQuestsModal();
      const prog = document.querySelector('#quests-modal-overlay .qm-q-progtext');
      assert(prog && /7\s*\/\s*30/.test(prog.textContent),
        'the Quests modal did not follow the counter: ' + (prog ? prog.textContent : '(no quest row)'));

      // A quest you cannot finish and claim is a quest that does not exist.
      G.stats.kills = 70;
      repaint();
      const claim = document.querySelector('#quests-modal-overlay .qm-q-claim');
      assert(claim, 'a completed quest offered no Claim button');
      const goldBefore = goldOf();
      const hpBefore = Number(G.skills.hitpoints) || 0;
      /* ── b515 — THE CLAIM IS A ROUND TRIP AND THE REWARD IS THE SERVER'S ────
         `claimQuestReward` tests each reward component and takes the armed
         branch when any is server-owned — gold, gems, skill XP and items ALL
         are — so it awaits `hr_claim_goal` and writes nothing but the
         once-guard mark. `G.gold` going up was only true in the retired
         client-authoritative position; today it would be a client paying itself
         a period reward, which the next envelope takes straight back.

         The b492 property is UNCHANGED and is the reason this block still
         exists: the reward must name a CONSTANT REAL SKILL. Asserted on the
         REWARD DEFINITION and on what the claim writes, rather than on a local
         grant — the phantom `combat` skill was invented by the client, so "the
         client wrote nothing" and "the client did not write `combat`" are now
         the same assertion made twice, and both are worth having. */
      await withClaimServer({ ok: true }, async (rig) => {
        window.claimQuestReward('kill_more', false);
        await new Promise((r) => setTimeout(r, 0));
        for (let i = 0; i < 20; i++) await Promise.resolve();
        assert(rig.calls.length === 1,
          'the quest claim sent ' + JSON.stringify(rig.calls) + ' — exactly one claim intent');
        assert(String(rig.calls[0].args[0]) === 'kill_more',
          'the claim named the wrong goal: ' + rig.calls[0].args[0]);
      });
      assert(goldOf() === goldBefore,
        'the client PAID a server-owned quest reward itself (' + goldBefore + ' -> ' + goldOf()
        + ') — the next envelope takes it back and the player watches it vanish');
      const hpAfter = Number(G.skills.hitpoints) || 0;
      assert(hpAfter === hpBefore,
        'the client authored ' + (hpAfter - hpBefore) + ' hitpoints XP for a claim the server pays — '
        + '`skills` is SERVER-OF-RECORD and this number dies at the next settle');
      /* THE b492 CLASS, AT ITS SOURCE. `combat` is a DERIVED level, not an
         hr_skills row: a reward that names it lands in the server's
         `skipped_xp` and the player is quoted a price they are never paid. */
      const rewardOf = (id) => {
        /* THE POOL IS PUBLISHED AS `window.DAILY_GOAL_POOL` (legacy.js). An
           earlier draft read a `window.HearthriseGoalCatalogue` that nothing
           assigns — the b511 misspelt-global class, caught by
           tests/window-globals-exist.mjs. One name, the real one. */
        const pool = window.DAILY_GOAL_POOL || [];
        return (pool.filter((g) => g && g.id === id)[0] || {}).reward || null;
      };
      const rw = rewardOf('kill_more');
      if (rw && rw.xp) {
        assert(!Object.prototype.hasOwnProperty.call(rw.xp, 'combat'),
          'THE b492 CLASS IS BACK: the kill goal prices its XP as the phantom skill `combat`, which the '
          + 'server drops into skipped_xp — the modal quotes a number nobody pays');
        assert(Object.keys(rw.xp).length > 0 && Object.keys(rw.xp).every((k) => k !== 'combat'),
          'the kill goal must name a CONSTANT real skill: ' + JSON.stringify(rw.xp));
      }
      const combatAfter = Object.prototype.hasOwnProperty.call(G.skills, 'combat')
        ? G.skills.combat : undefined;
      assert(combatAfter === combatBefore,
        'THE b492 CLASS IS BACK: claiming a kill goal wrote G.skills.combat (' + combatBefore + ' -> '
        + combatAfter + '). `combat` is a DERIVED level, not an hr_skills row: the server drops that '
        + 'grant into skipped_xp, so the number only ever exists on this client and dies at the next '
        + 'settle. A PERIOD reward must name a CONSTANT real skill.');
      assert(G.dailyGoals.claimed && G.dailyGoals.claimed.kill_more === true,
        'the claim was not recorded, so the same reward could be taken twice');
    } finally {
      if (typeof window.closeQuestsModal === 'function') window.closeQuestsModal();
      G.stats.kills = saved.kills; G.gold = saved.gold; G.gems = saved.gems;
      if (saved.hitpoints === undefined) delete G.skills.hitpoints;
      else G.skills.hitpoints = saved.hitpoints;
      G.playerMaxHp = saved.playerMaxHp;
      /* Residue is left as found; anything this test caused is removed. Never
         folded into hitpoints — that would mint ranked XP from a client artefact. */
      if (hadCombat) G.skills.combat = combatBefore; else delete G.skills.combat;
      G.dailyGoals = saved.dailyGoals; G.weeklyGoals = saved.weeklyGoals;
    }
  }),

  // The export itself, plus the second half of the same defect: `_dailyGoldDelta`
  // is a DERIVED source, not a path into G, so "Earn 500 gold" read
  // G._dailyGoldDelta (undefined → 0) and could never move even once the
  // renderer could see readSource at all.
  () => tryRun('b224: readSource is exported, walks G, and derives the gold-delta source', () => {
    const G = window.G;
    assert(typeof window.readSource === 'function', 'window.readSource missing');
    const saved = { kills: G.stats.kills, gold: G.gold,
      start: G.dailyGoldStart ? JSON.parse(JSON.stringify(G.dailyGoldStart)) : null };
    try {
      G.stats.kills = 123;
      assert(window.readSource('stats.kills') === 123, 'readSource cannot walk a path into G');
      assert(window.readSource('collection.__no_such_item__') === 0,
        'a missing path must read 0, not undefined — the renderer subtracts it');
      G.dailyGoldStart = { day: 0, gold: 1000 };
      G.gold = 1750;
      stampBalanceLikeLoad(G);   // armed: _dailyGoldDelta reads gold via balanceNum
      assert(window.readSource('_dailyGoldDelta') === 750,
        'the gold-delta daily source is not derived, got ' + window.readSource('_dailyGoldDelta'));
      G.gold = 500;
      stampBalanceLikeLoad(G);
      assert(window.readSource('_dailyGoldDelta') === 0, 'a negative gold delta must clamp to 0');

      // Every source the live pools name has to be readable as a number, or that
      // quest is decorative.
      const defs = (window.getGoalsForToday() || []).concat(window.getWeeklyGoals() || []);
      assert(defs.length > 0, 'no quest definitions to check');
      defs.forEach((d) => {
        assert(typeof window.readSource(d.source) === 'number',
          'quest "' + d.id + '" names an unreadable source: ' + d.source);
      });
    } finally {
      G.stats.kills = saved.kills; G.gold = saved.gold;
      if (saved.start) G.dailyGoldStart = saved.start; else delete G.dailyGoldStart;
    }
  }),

  // Fixing the read without re-baselining would have been worse than the bug:
  // every weekly startValue in every live save was captured as the broken 0, so
  // a long-time player would open the panel to three instantly-complete weeklies
  // and thousands of gold plus gems they never earned.
  () => tryRun('b224: stale weekly baselines are re-captured once, so the fix pays no windfall', () => {
    const G = window.G;
    assert(typeof window.getWeeklyGoals === 'function', 'getWeeklyGoals missing');
    const saved = {
      weekly: G.weeklyGoals ? JSON.parse(JSON.stringify(G.weeklyGoals)) : null,
      kills: G.stats.kills, cooked: G.stats.cooked,
    };
    try {
      G.stats.kills = 5000; G.stats.cooked = 900;
      window.getWeeklyGoals();
      assert(G.weeklyGoals.sv === 1, 'a freshly drawn week must carry the baseline marker');
      const weekKey = G.weeklyGoals.weekKey;
      const picks = G.weeklyGoals.picks.slice();

      // A save written before this build: right week, every baseline a broken 0.
      const zeroed = {};
      picks.forEach((id) => { zeroed[id] = 0; });
      G.weeklyGoals = { weekKey: weekKey, picks: picks, startValues: zeroed, claimed: {} };

      const defs = window.getWeeklyGoals();
      assert(G.weeklyGoals.sv === 1, 'the stale baseline was not re-captured');
      assert(G.weeklyGoals.weekKey === weekKey, 're-baselining must not redraw the week');
      defs.forEach((d) => {
        assert(G.weeklyGoals.startValues[d.id] === window.readSource(d.source),
          d.id + ' kept its broken baseline — a 5,000-kill player would claim it instantly');
      });

      // And the surface agrees: weekly reads 0 progress, nothing claimable.
      window.openQuestsModal();
      const wk = document.querySelector('#quests-modal-overlay .qm-tab[data-tab="weekly"]');
      assert(wk, 'the modal has no Weekly tab');
      wk.click();
      const rows = [...document.querySelectorAll('#quests-modal-overlay .qm-q-progtext')];
      assert(rows.length > 0, 'the Weekly tab rendered no quests');
      rows.forEach((r) => {
        assert(/^0\s*\//.test(r.textContent.trim()),
          'a re-baselined weekly should read 0 / N, got ' + r.textContent);
      });
      assert(!document.querySelector('#quests-modal-overlay .qm-q-claim'),
        'a re-baselined weekly must not be claimable');
      const daily = document.querySelector('#quests-modal-overlay .qm-tab[data-tab="daily"]');
      if (daily) daily.click();
    } finally {
      if (typeof window.closeQuestsModal === 'function') window.closeQuestsModal();
      G.stats.kills = saved.kills; G.stats.cooked = saved.cooked;
      G.weeklyGoals = saved.weekly;
    }
  }),

  // The other half of the report: the Home "Next up" ladder and the daily tasks
  // ride the updateDaily chain that b220-b223 wrapped twice. One real gather has
  // to move the ladder AND be seen exactly once by every wrapper, no matter what
  // order the wrappers booted in — a swallowed, re-ordered or double-fired link
  // would kill or double every counter in the game at once.
  () => tryRun('b224: one real gather ticks the quest ladder and each updateDaily wrapper exactly once', () => {
    const G = window.G;
    const owners = window.updateDailyWrappers();
    assert(owners.indexOf('muster') >= 0 && owners.indexOf('castleLabour') >= 0,
      'the live wrapper chain is not both systems: ' + owners.join(','));
    const snap = snapshotG();
    const saved = {
      chain: window.updateDaily,
      quests: JSON.parse(JSON.stringify(G.quests || [])),
      daily: JSON.parse(JSON.stringify(G.daily || {})),
      collection: JSON.parse(JSON.stringify(G.collection || {})),
      gathered: G.stats.gathered, wc: G.skills.woodcutting,
    };
    try {
      // Two more systems register AFTER the chain is already two deep. Boot order
      // must not matter and nobody may be skipped or fired twice.
      const seen = { a: [], b: [] };
      window.wrapUpdateDaily('__b224_a', (type, amt) => { seen.a.push(type + ':' + amt); });
      window.wrapUpdateDaily('__b224_b', (type, amt) => { seen.b.push(type + ':' + amt); });

      const quest = (G.quests || []).find((q) => q.type === 'gather');
      assert(quest, 'no gather quest on the ladder to measure');
      quest.done = false; quest.progress = 0;
      const task = ((G.daily && G.daily.tasks) || []).find((t) => t.type === 'gather') || null;
      if (task) { task.done = false; task.progress = 0; }
      const g0 = G.stats.gathered || 0;

      // The real player path — the interval callback behind "chop this tree".
      const lvl = window.getLevel('woodcutting');
      const tree = (window.TREES || []).find((t) => t.req <= lvl);
      assert(tree, 'no choppable tree at woodcutting ' + lvl);
      G.activeSkill = 'woodcutting'; G.skillTargetId = tree.id;
      window.doSkillAction(true);

      const gained = (G.stats.gathered || 0) - g0;
      assert(gained > 0, 'the gather never happened');
      assert((quest.progress || 0) === gained,
        'the Home "Next up" quest did not follow the gather: 0 → ' + quest.progress + ' (gathered ' + gained + ')');
      if (task) assert((task.progress || 0) === gained,
        'the daily task did not follow the gather: 0 → ' + task.progress + ' (gathered ' + gained + ')');
      assert(seen.a.length === 1 && seen.b.length === 1,
        'each wrapper must see exactly one event per action, got ' + seen.a.length + ' and ' + seen.b.length);
      assert(seen.a[0] === 'gather:' + gained && seen.b[0] === 'gather:' + gained,
        'a wrapper saw the wrong payload: ' + seen.a[0] + ' / ' + seen.b[0]);
    } finally {
      window.updateDaily = saved.chain;
      G.activeSkill = null; G.skillTargetId = null;
      G.quests = saved.quests; G.daily = saved.daily; G.collection = saved.collection;
      G.stats.gathered = saved.gathered; G.skills.woodcutting = saved.wc;
      restoreG(snap);
    }
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
      assert(/keep playing/i.test(ui.later.textContent), 'the defer action must say play continues: ' + ui.later.textContent);
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
  () => tryRun('b46x OPEN-1: the wall asks for no invite code, and one link reveals it', () => {
    const gate = window.HearthriseGate;
    const ui = gate._buildGate({});
    try {
      assert(ui.invite, 'the invite field must still EXIST — codes already handed out have to keep working');
      assert(ui.getMode() === 'signup', 'the front door must open on Create account');
      assert(ui.invite.__row.style.display === 'none',
        'the invite field must be HIDDEN by default: a visible one reads as a closed door however it is labelled');
      assert(ui.invite.required !== true, 'the invite field must not be required');
      assert(ui.inviteReveal && ui.inviteAside, 'the disclosure that reveals the code is missing');
      assert(/have an invite code/i.test(ui.inviteReveal.textContent),
        'the disclosure must say what it opens, got: ' + ui.inviteReveal.textContent);
      assert(ui.inviteAside.style.display !== 'none', 'the disclosure itself must be visible in signup mode');
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

  // O1b — the copy. "open beta" is the promise; the Discord link is the door.
  () => tryRun('b46x OPEN-2: the wall says open beta, invites the player in, and links Discord', () => {
    const gate = window.HearthriseGate;
    const ui = gate._buildGate({});
    try {
      const text = ui.root.textContent;
      assert(/open beta/i.test(text), 'the wall must say the beta is OPEN: ' + text.slice(0, 220));
      assert(!/closed beta/i.test(text), 'the wall still calls the beta closed');
      assert(/make an account and play/i.test(text),
        'the wall must tell the player what to do, not just what state the beta is in');
      assert(/rough in places/i.test(text), 'the wall must be honest that it is rough');
      const dc = [...ui.root.querySelectorAll('a[href*="discord.gg"]')];
      assert(dc.length >= 1, 'the open-beta line points at Discord and there must be a link to click');
      dc.forEach((a) => {
        assert(a.href.indexOf('discord.gg/eJrUSUJM3M') !== -1, 'wrong Discord invite: ' + a.href);
        assert(a.rel === 'noopener', 'a target=_blank link without rel=noopener is a tabnabbing hole');
      });
      // The b224 rule survives the copy change: still no account-less escape.
      const words = text.toLowerCase();
      ['continue offline', 'play offline', 'without an account'].forEach((s) => {
        assert(words.indexOf(s) === -1, 'the open-beta copy re-opened an account-less escape: ' + s);
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
        'the open-beta pitch is still above the panel — two screens at once');
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
    assert(/open beta/i.test(codeless) && /try again/i.test(codeless),
      'the switch-over message must name the cause and offer the retry: ' + codeless);

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
    ['startFTUE', 'HearthriseProfile', 'HearthriseBetaBanner', 'HearthriseWelcome']
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
    blocker.id = 'beta-banner-overlay';
    document.body.appendChild(blocker);
    try {
      assert(gate.promptReauth() === null, 'the re-prompt opened on top of the beta banner');
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

  () => tryRun('b226: the daily reward joins the modal queue instead of landing on top of it', () => {
    // Found by walking the real post-login sequence in a browser: with the name
    // modal open, the once-a-day sheet opened straight on top of it 1.0s later.
    // Every other first-run flow already named `.hr-id-scrim`; this one did not,
    // so the "fixed precedence" the b221/b223/b224 work claims was never total.
    const D = window.HearthriseDaily;
    assert(D && typeof D._blockingOverlays === 'function', 'the daily-reward precedence guard is not exposed');
    const sel = D._blockingOverlays();
    ['.hr-id-scrim', '#hr-post-signup-modal', '#hr-welcome-modal', '.ftue-root'].forEach((s) => {
      assert(sel.indexOf(s) !== -1, 'the daily sheet would stack on ' + s + ': ' + sel);
    });
    assert(sel.indexOf('.hr-dl-scrim') === -1, 'the sheet must not block on its OWN overlay — that is a deadlock');
    // Both directions, or the pair is only half-exclusive: before b226 the name
    // modal opened on TOP of an already-open daily sheet a second later.
    const I = window.HearthriseIdentity;
    assert(I._FRONT_DOOR.indexOf('.hr-dl-scrim') !== -1,
      'the name modal would still stack on the daily sheet: ' + I._FRONT_DOOR);
    assert(I._FRONT_DOOR.indexOf('.ftue-root') !== -1, 'the b224 FTUE guard must survive');
    // And the live predicate agrees with the selector, for each of them.
    [['div', 'hr-id-scrim', null], ['div', null, 'hr-post-signup-modal'], ['div', null, 'hr-welcome-modal']]
      .forEach(([tag, cls, id]) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (id) n.id = id;
        document.body.appendChild(n);
        try { assert(D._anotherModalUp() === true, 'the live guard ignored ' + (cls || id)); }
        finally { n.remove(); }
      });
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
        //   • clan-seat.css is a whole sheet the clan agent owns;
        //   • home-dashboard.js injects every rule under the literal prefix
        //     `#panel-profile #<root> `, so its namespace cannot be spoofed
        //     by an unrelated rule that merely mentions "hd-".
        if (sheetHref && /clan-seat\.css/.test(sheetHref)) continue;
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
  () => tryRunAsync('M8 PARTY-1: form → invite (refused, then sent) → the server\'s roster → leave', async () => {
    const P = window.HearthriseParty;
    assert(P && typeof P.createParty === 'function', 'HearthriseParty transport missing');
    assert(document.getElementById('panel-party'), '#panel-party is not in index.html — the screen is unreachable');
    const rig = partyRig();
    try {
      // 1. THE EMPTY STATE, and the one honest line about what slice 1 is not.
      await rig.open();
      assert(/not in a party/i.test(rig.text()), 'the empty state is missing: ' + rig.text().slice(0, 120));
      assert(/Hunting together arrives in a later build/.test(rig.text()),
        'the panel must say that hunting together is not here yet');
      // An invitation the player has received is offered where they can act on it.
      assert(rig.el('[data-party-act="accept"]'), 'the received invite has no Accept control');
      assert(/expires in 11 min/.test(rig.text()), 'the invite must print the SERVER\'s expiry: ' + rig.text());

      // 2. FORM ONE. Nothing is predicted — the roster is the re-read's.
      rig.el('[data-party-act="create"]').click();
      await drain(); await drain();
      assert(rig.rpcs('hr_party_create').length === 1, 'create fired ' + rig.rpcs('hr_party_create').length + ' times');
      assert(/Wren/.test(rig.text()), 'the founder is not on the roster: ' + rig.text().slice(0, 160));
      assert(/Lv 57/.test(rig.text()), 'the SERVER\'s combat level 57 is not rendered: ' + rig.text());
      assert(/38 \/ 61/.test(rig.text()), 'the SERVER\'s hp pair is not rendered: ' + rig.text());
      assert(/1 of 4/.test(rig.text()), 'the count must be the roster length over the party\'s own cap: ' + rig.text());
      const idem = rig.rpcs('hr_party_create')[0].body.p_idem;
      assert(/^[0-9a-f-]{36}$/i.test(String(idem)), 'the create carried no uuid idempotency key: ' + idem);

      // 3. INVITE BY NAME — REFUSED. One sentence, and never a guess at which
      //    of the five reasons S-13 collapsed into `invite_target_unavailable`.
      await rig.invite('Nobody');
      assert(rig.rpcs('hr_party_invite').length === 1, 'the invite fired ' + rig.rpcs('hr_party_invite').length + ' times');
      assert(rig.rpcs('hr_party_invite')[0].body.p_name === 'Nobody', 'the typed name did not reach the verb');
      assert(/That adventurer cannot be invited right now\./.test(rig.text()),
        'the single refusal sentence is missing: ' + rig.text().slice(0, 200));
      assert(!/already in a party|does not exist|no such/i.test(rig.text()),
        'the panel invented a reason the server deliberately did not give');
      assert(!/Bram/.test(rig.text()), 'a refused invite must not put anybody on the roster');

      // 4. INVITE AGAIN — SENT. The new member appears only because the realm
      //    named him, with HIS numbers and HIS recovery clock.
      rig.world.inviteAnswer = { ok: true, sent: true };
      await rig.invite('Bram');
      assert(rig.rpcs('hr_party_invite').length === 2, 'the second invite never left the panel');
      assert(!/cannot be invited/.test(rig.text()), 'the previous refusal outlived the gesture that cleared it');
      assert(/Bram/.test(rig.text()), 'the accepted member is not on the roster: ' + rig.text().slice(0, 200));
      assert(/Lv 43/.test(rig.text()), 'Bram\'s SERVER combat level is not rendered: ' + rig.text());
      assert(/12 \/ 74/.test(rig.text()), 'Bram\'s SERVER hp pair is not rendered: ' + rig.text());
      assert(/2 of 4/.test(rig.text()), 'the count did not follow the server roster: ' + rig.text());
      assert(/Recovering/.test(rig.text()), 'a member whose recovering_until is in the future must be tagged');
      const fill = document.querySelector('#party-panel .party-member.is-recovering .party-hp-fill');
      assert(fill && fill.style.width === '16%', 'the hp bar must be 12/74 of its track, got ' + (fill && fill.style.width));
      // The leader may remove a member, and NEVER themselves — the server
      // answers `bad_party` to a self-kick, so offering the button would be a
      // control that exists only to be refused.
      const kicks = [...document.querySelectorAll('#party-panel [data-party-act="kick"]')]
        .map((b) => b.getAttribute('data-party-name'));
      assert(kicks.join(',') === 'Bram', 'Remove is offered on [' + kicks.join(',') + '] — it belongs on Bram alone');
      assert(document.querySelector('#party-panel .party-member.is-you .party-m-name').textContent === 'Wren',
        'the player\'s own row is not marked');

      // 5. LEAVE — two steps, then the empty state the realm now reports.
      rig.el('[data-party-act="leave-ask"]').click();
      assert(rig.el('[data-party-act="leave-yes"]'), 'Leave must confirm before it fires');
      assert(rig.rpcs('hr_party_leave').length === 0, 'asking to leave must not already have left');
      rig.el('[data-party-act="leave-yes"]').click();
      await drain(); await drain();
      assert(rig.rpcs('hr_party_leave').length === 1, 'the confirm did not fire hr_party_leave');
      assert(/not in a party/i.test(rig.text()), 'after leaving, the panel must show the empty state: ' + rig.text().slice(0, 160));
      assert(!/Bram|Wren/.test(rig.text()), 'the roster survived the leave — the projection was merged, not replaced');
    } finally {
      rig.restore();
    }
  }),

  /* PARTY-2 — THE TWO THINGS SECURITY SAID MUST NOT HAPPEN (§5.3, B7/B8).
     B7: hr_party_view is `stable` and transitively writes, so PostgREST run it
     under GET raises 25006 and the panel's only read surface dies. B8: the read
     spends the same 12/min bucket as the five write verbs, so a panel polling
     at the envelope's cadence eats a player's own membership budget.
     Both are properties of the CLIENT, which is why they are asserted here and
     not in SQL, and both are asserted against the recorded requests rather than
     against the source text — a comment promising POST is not a POST. */
  () => tryRunAsync('M8 PARTY-2: the roster read is POSTed, never GET, and never twice inside a minute', async () => {
    const P = window.HearthriseParty;
    const rig = partyRig();
    try {
      rig.joinAs('member');
      await rig.open();
      const reads = rig.rpcs('hr_party_view');
      assert(reads.length === 1, 'opening the panel should read the roster exactly once, got ' + reads.length);

      // B7 — the POST half, on every read this session has made.
      reads.forEach((c) => {
        assert(c.method === 'POST', 'hr_party_view was called with ' + c.method + ' — B7 says that raises 25006');
        assert(c.url.indexOf('?') === -1, 'hr_party_view carried a query string: ' + c.url + ' — that is the { get: true } shape');
        assert(c.body && Object.keys(c.body).join(',') === 'p_party', 'the read body must be p_party alone, got ' + JSON.stringify(c.body));
      });

      // B8 — the floor is real, and an IDLE tick does not spend a read.
      assert(P.SLOW_REFRESH_MS >= 60000, 'the slow refresh is ' + P.SLOW_REFRESH_MS + 'ms — §5.3 sets the floor at 60 s');
      await rig.idle(6);
      assert((Date.now() - P.stats().lastViewAt) < 60000, 'the arm is vacuous — a minute really passed during it');
      assert(rig.rpcs('hr_party_view').length === 1,
        'six idle ticks spent ' + rig.rpcs('hr_party_view').length + ' roster reads — B8 allows one per ' + P.SLOW_REFRESH_MS + 'ms');

      // A read the PLAYER earned is not throttled: their own verb re-reads at once.
      await P.leave();
      assert(rig.rpcs('hr_party_view').length >= 1, 'a verb must reconcile through a re-read');
      assert(rig.rpcs('hr_party_leave').length === 1, 'the verb itself fired once');

      /* OUT of a party there is no roster read to move the meter, so the floor
         has to read the last request of ANY kind. Measured: keyed on the roster
         read alone, an EMPTY panel re-read its membership and its whole inbox
         on every tick, for ever, because no roster read ever happened. */
      const idle = rig.partyCalls().length;
      await rig.idle(4);
      assert(rig.partyCalls().length === idle,
        'an idle EMPTY panel spent ' + (rig.partyCalls().length - idle) + ' requests: '
        + rig.partyCalls().slice(idle).map((c) => c.url).join(', '));

      // And a CLOSED panel reads nothing at all.
      const before = rig.partyCalls().length;
      P.setVisible(false);
      await rig.idle(4);
      assert(rig.partyCalls().length === before,
        'a closed panel made ' + (rig.partyCalls().length - before) + ' requests: '
        + rig.partyCalls().slice(before).map((c) => c.url).join(', '));
    } finally {
      rig.restore();
    }
  }),
  /* PARTY-2b — A READ THE CLOSE CAUGHT IN FLIGHT, which is the leak PARTY-2
     above kept catching by accident and could never name. `doRefresh` is three
     sequential requests; closing or resetting used to null `inFlight` and walk
     away, so the read made its remaining requests against whatever
     `window.fetch` was by then and `put()` a projection for a panel nobody had
     open — a stray request landing in a LATER test's recorded calls. The first
     request is HELD here so the close always lands mid-flight. Both halves are
     asserted: no further request, and no projection, because abandoning a read
     must not evict what the panel last heard (§6). */
  () => tryRunAsync('M8 PARTY-2b: a read the close catches in flight spends nothing more and writes no projection', async () => {
    const P = window.HearthriseParty;
    const rig = partyRig();
    try {
      rig.joinAs('member');
      /* The rig's stub RECORDS first and only then is held, so the membership
         request counts as spent before the close — holding it earlier would
         make the release itself look like a new request. */
      const recording = window.fetch;
      let release = null;
      window.fetch = (url, init) => {
        const p = recording(url, init);
        if (String(url).indexOf('party_member?') !== -1 && !release) {
          return new Promise((res) => { release = () => res(p); });
        }
        return p;
      };
      const flight = P.refresh('in-flight-probe');
      await drain();
      assert(release, 'the probe never caught the membership read in flight — the arm is vacuous');
      const spent = rig.partyCalls().length;
      const projection = JSON.stringify(P.getState());
      P.setVisible(false);
      release();
      await flight; await drain(); await drain();
      assert(rig.partyCalls().length === spent,
        'a read the close abandoned went on to spend ' + (rig.partyCalls().length - spent)
        + ' more request(s) — ' + rig.partyCalls().slice(spent).map((c) => c.url).join(', ')
        + ' — "a closed panel reads NOTHING" is the module\'s own first line, '
        + 'and a stray read lands in whichever test is running when it finishes');
      assert(JSON.stringify(P.getState()) === projection,
        'an abandoned read still wrote a projection for a panel nobody has open');
    } finally {
      rig.restore();
    }
  }),

  /* PARTY-2c — regression suite — THE TWO SHEETS THE RIG USED TO ARM. A stubbed
     session is the ONLY thing either first-run flow waits for: where localStorage
     is fresh `#hr-post-signup-modal` opened after PARTY-2 and the next test's
     teardown reported it; where the name record exists the same rig left
     `div.hr-id-scrim`. THE 2.5 s WAIT IS THE ASSERTION — `maybeShow()` re-polls
     every 2 s while it waits. MUTATION: drop `firstRunAnswered` -> RED. */
  () => tryRunAsync('M8 PARTY-2c: the party rig leaves no first-run sheet behind, and none arrives 2.5 s later', async () => {
    const SHEETS = '.hr-id-scrim, #hr-post-signup-modal';
    const was = new Set(document.querySelectorAll(SHEETS));
    const added = () => [...document.querySelectorAll(SHEETS)].filter((e) => !was.has(e)).map((e) => e.id || e.className);
    const rig = partyRig();
    try { await rig.open(); } finally { rig.restore(); }
    assert(!added().length, 'the rig left a first-run sheet up: ' + added().join(', '));
    await new Promise((r) => setTimeout(r, 2500));
    assert(!added().length, 'a first-run sheet opened 2.5 s after the arm — inside post-signup-welcome\'s '
      + 'own poll window, which is where it landed on CI: ' + added().join(', '));
  }),

  /* PARTY-3..7 — THE PURE HALF. `partyPanelHtml(view, opts)` is a function of
     what it is handed, so these five properties cost a fixture each instead of
     a rig: the states a player can be in, the bar's arithmetic, the three
     columns slice 1 must NOT draw, who may remove whom, and the refusal
     vocabulary. Cheap, and each one is a thing that has to stay true. */
  () => tryRun('M8 PARTY-3: every state says what it is, and every state carries the honest line', () => {
    const H = window.partyPanelHtml;
    const base = { known: true, partyId: null, members: [], invites: [] };
    const cases = [
      [{ ...base, signedOut: true }, /Sign in to play with other people/],
      [{ ...base, known: false }, /Asking the realm/],
      [base, /not in a party — form one or accept an invite/],
      [{ ...base, partyId: 'P1', role: 'member', members: [{ name: 'Nia', combat_level: 9, hp: 5, hp_max: 5 }] }, /Nia/],
    ];
    cases.forEach(([v, re]) => {
      const html = H(v, { nowMs: 0 });
      assert(re.test(html), 'state did not render ' + re + ': ' + html.slice(0, 120));
      assert(/Hunting together arrives in a later build/.test(html),
        'the slice-1 honesty line was dropped from a state — it is never optional');
    });
  }),

  () => tryRun('M8 PARTY-4: the hp bar is the ratio of two SERVER numbers, clamped, and never invents one', () => {
    const H = window.partyPanelHtml;
    const bar = (hp, max) => {
      const m = /party-hp-fill" style="width:(\d+)%/.exec(H({ known: true, partyId: 'P1', role: 'member',
        members: [{ name: 'A', combat_level: 3, hp: hp, hp_max: max }], invites: [] }, { nowMs: 0 }));
      return m ? Number(m[1]) : null;
    };
    assert(bar(12, 74) === 16, '12/74 must draw 16%, got ' + bar(12, 74));
    assert(bar(61, 61) === 100, 'a full bar must be 100%, got ' + bar(61, 61));
    assert(bar(0, 40) === 0, 'an empty bar must be 0%, got ' + bar(0, 40));
    assert(bar(5, 0) === 0, 'a zero maximum must not divide, got ' + bar(5, 0));
    assert(bar(80, 61) === 100, 'hp over hp_max must clamp, got ' + bar(80, 61));
    const unknown = H({ known: true, partyId: 'P1', role: 'member', members: [{ name: 'A' }], invites: [] }, { nowMs: 0 });
    assert(/—/.test(unknown) && !/Lv 0/.test(unknown), 'a value the server did not send must print as an em-dash, never as 0');
  }),

  () => tryRun('M8 PARTY-5: the three columns S2 owns are NOT drawn while they are NULL', () => {
    /* hr_party_view's frozen shape already carries share_bp / xp / gold and
       answers NULL until a party window settles. A column of em-dashes is a
       worse lie than an absent column — and a panel that renders the key today
       is a panel that will quietly show a stale split the day it fills. */
    const html = window.partyPanelHtml({ known: true, partyId: 'P1', role: 'leader', invites: [],
      members: [{ name: 'Nia', combat_level: 51, hp: 44, hp_max: 58, share_bp: null, xp: null, gold: null }] }, { nowMs: 0 });
    assert(!/share|bp|\bxp\b|gold/i.test(html), 'slice 1 rendered a settle column it has no value for: ' + html.slice(0, 200));
  }),

  () => tryRun('M8 PARTY-6: Remove is the leader\'s, by NAME, and never on your own row', () => {
    const H = window.partyPanelHtml;
    const roster = [{ name: 'Wren', combat_level: 57, hp: 61, hp_max: 61 }, { name: 'Nia', combat_level: 51, hp: 44, hp_max: 58 }];
    const view = { known: true, partyId: 'P1', members: roster, invites: [] };
    const opts = { nowMs: 0, you: 'Wren', canon: window.HearthriseIdentity.canon };
    const asLeader = H({ ...view, role: 'leader' }, opts);
    const asMember = H({ ...view, role: 'member' }, opts);
    assert(/data-party-name="Nia"/.test(asLeader), 'the leader cannot remove another member');
    assert(!/data-party-name="Wren"/.test(asLeader), 'the leader is offered Remove on their own row — the server answers bad_party');
    assert(!/data-party-act="kick"/.test(asMember), 'a plain member was offered a control only a leader may use');
    assert(!/user_id|uuid/i.test(asLeader), 'the panel leaked an addressable handle — the frozen view carries names, not ids');
  }),

  () => tryRun('M8 PARTY-7: every refusal the five verbs can answer has a sentence a player can read', () => {
    /* The list is the migrations' own, retyped here ON PURPOSE: it is the drift
       check. A verb that grows a code nobody mapped shows the player "that did
       not work", which is the shrug this test exists to prevent. */
    const P = window.HearthriseParty;
    const CODES = ['not_signed_in', 'rate_limited', 'already_in_party', 'not_in_party', 'not_party_leader',
      'invite_target_unavailable', 'party_full', 'party_level_spread', 'party_hunt_running', 'party_daily_cap',
      'invite_gone', 'invite_expired', 'unknown_party', 'intent_in_flight', 'intent_mismatch', 'no_character',
      'bad_slot', 'bad_party', 'rpc_missing'];
    CODES.forEach((c) => {
      const s = P.refusalSentence(c);
      assert(s && s !== 'That did not work.', c + ' has no sentence of its own — the player is told nothing');
      assert(/[.!]$/.test(s) && s.length < 60, c + ' is not one short sentence: "' + s + '"');
    });
    assert(P.refusalSentence('rate_limited') === 'Slow down a moment.', 'the party bucket must say "Slow down a moment"');
    assert(P.refusalSentence('what_is_this') === 'That did not work.', 'an unmapped code must still say something');
  }),

  /* PARTY-8 (regression, live b553 2026-09-26) — hr_party_view was STABLE and
     wrote the rate bucket, so PostgREST ran it READ ONLY and every roster read
     answered 405 {code:25006}. The body had no `ok` and no `error`, so the
     panel painted "Your party 0 of 4 / LEADER" with no rows and no word why.
     Server half: 2026-09-26-party-view-volatile.sql + tests/readonly-rpc.mjs. */
  () => tryRunAsync('M8 PARTY-8: a roster read that fails (405 / 25006) never paints "0 of 4" — it says so, and keeps a known roster', async () => {
    const rig = partyRig();
    const DEAD = { __http: 405, body: { code: '25006', details: null, hint: null,
      message: 'cannot execute INSERT in a read-only transaction' } };
    try {
      // 1. Exactly the live sequence: form a party, and the re-read that follows
      //    the create fails. No count, no rows, one plain notice.
      rig.world.deadView = DEAD;
      await rig.open();
      rig.el('[data-party-act="create"]').click();
      await drain(); await drain();
      assert(rig.rpcs('hr_party_view').length >= 1, 'the create was not followed by a roster read');
      assert(/Your party/.test(rig.text()), 'the leader is not shown their party: ' + rig.text().slice(0, 160));
      assert(!/\b0 of 4\b/.test(rig.text()), 'a failed roster read painted "0 of 4": ' + rig.text().slice(0, 160));
      assert(/Could not load your party right now/.test(rig.text()), 'no notice said the roster read failed: ' + rig.text().slice(0, 200));
      assert(!document.querySelector('#party-panel .party-member'), 'a failed read drew a member row');
      // 2. A read lands, then fails again: the last known roster stands.
      rig.world.deadView = null;
      await window.HearthriseParty.refresh('test'); await drain();
      assert(/1 of 4/.test(rig.text()) && /Wren/.test(rig.text()), 'the recovered read is not rendered: ' + rig.text().slice(0, 160));
      rig.world.deadView = DEAD;
      await window.HearthriseParty.refresh('test'); await drain();
      assert(/Wren/.test(rig.text()) && /1 of 4/.test(rig.text()), 'a failed read threw away the known roster: ' + rig.text().slice(0, 160));
    } finally {
      rig.restore();
    }
  }),
];
