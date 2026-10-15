// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/rooms-items-and-economy.js — room rungs, the item index, workers, pets, traits, bounties, dungeons, market and theme surfaces.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 105 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, stampBalanceLikeLoad, stampRecordLikeLoad, withServerBacked, withRoomServer, awayArtisanSpan, tryRunRestampingBalance, goldOf, gemsOf, snapshotG, setAway, drain, restoreG, restoreGAndRecord, restoreBankCap, on, snapshot, phoneFrame, farmReplantFixtureG, withDeferredFarmPlant, serverBagFixture } from './_harness.js?v=584';

export default [

  /* ══════════════════════════════════════════════════════════════════════
     b372 — AN ITEM REQUIREMENT IS A LINK  (KD420, via Tyler)
     ══════════════════════════════════════════════════════════════════════
     "you can right click and inspect items in your bag. It clearly shows like
     where they are from... I'd like to do something similar with requirements
     (ie clicking on the maple planks required for my house upgrade and have it
     show where it's acquired.)"

     Six tests, one per surface CLASS rather than per call site, because the
     thing that must not regress is the seam: a renderer splices
     hrInspectAttrs() into a chip, one document-level capture handler turns
     that into the bag's own flyout, and the reverse index supplies the answer.
     A seventh test guards the thing this feature could plausibly break —
     tapping a requirement inside a click target must NOT fire that target. */

  () => tryRun('b372: the inspect seam — an item links, gold and non-items do not', () => {
    assert(typeof window.hrInspectAttrs === 'function' && typeof window.hrInspectSpan === 'function'
      && typeof window.hrInspectHint === 'function', 'the b372 inspect seam must be published');
    const a = window.hrInspectAttrs('maple_plank');
    assert(/data-inspect-item="maple_plank"/.test(a), 'an item requirement must carry the inspect attribute: ' + a);
    assert(/role="button"/.test(a) && /tabindex="0"/.test(a),
      'a chip that answers a click must be reachable by keyboard too');
    /* THE ONE THAT BITES: `gold` is a legitimate key on nearly every cost row
       in the game and is NOT an item. A link there opens an empty flyout. */
    assert(window.hrInspectAttrs('gold') === '', 'gold is not an item and must never render as a link');
    assert(window.hrInspectAttrs('no_such_item_xyz') === '', 'an unknown id must not render as a link');
    assert(window.hrInspectAttrs('') === '' && window.hrInspectAttrs(null) === '',
      'a missing id must degrade to plain text, never to a dead link');
    // The span form leaves non-items as ordinary markup rather than swallowing them.
    assert(window.hrInspectSpan('gold', 'Gold') === 'Gold', 'a non-item span must be its own text');
    assert(/data-inspect-item="wolf_pelt"/.test(window.hrInspectSpan('wolf_pelt', 'Wolf Pelt')),
      'the span form must link a real item');
  }),

  () => tryRun('b372: the reverse index answers "where is it acquired" for every route', () => {
    if (typeof window.itemSourceLine !== 'function') return;
    /* KD420's exact item. "Crafted · Crafting Lv 45" was true and useless —
       it did not say a plank is sawn from a LOG, which is the fact he needed. */
    const plank = window.itemSourceLine('maple_plank');
    assert(/Crafting/.test(plank) && /Maple Log/.test(plank),
      'a crafted item must name the material it is made from, got: ' + plank);
    // The shop counters — the whole class the index used to be blind to.
    const seed = window.itemSourceLine('wheat_seed');
    /* b432: "the Seed shop" → "the Local Shop". The counter is labelled
       "Supplies" now and stocks Blank Runes beside the seeds, so the old
       sentence sent a player looking for a second shop that does not exist.
       The PROPERTY under test is unchanged — a shop item must name its counter
       and its price — only the counter's name moved. */
    assert(/Local Shop/.test(seed), 'a seed must name the counter that sells it, got: ' + seed);
    assert(/\d/.test(seed), 'and its price, got: ' + seed);
    // Farming names the crop, so "which seed do I buy" is answerable.
    const pump = window.itemSourceLine('pumpkin');
    assert(/Farming/.test(pump) && /Pumpkin/.test(pump),
      'a crop product must name the crop to grow, got: ' + pump);
    // Regression: none of the pre-existing routes may be displaced.
    // (The gear recipes and the dungeon route left in the 2026-10-14 demolition.)
    const smithed = window.ARTISAN_RECIPES.smithing[0].output;
    assert(/Smithing/i.test(window.itemSourceLine(smithed)), 'crafted route regressed: ' + smithed);
    assert(/Mining/i.test(window.itemSourceLine('iron_ore')), 'gathered route regressed');
  }),

  () => tryRun('b372: KD420 — tapping the maple planks in the house upgrade shows where they come from', () => {
    /* The literal request, end to end, as a player performs it: open House,
       tap the requirement, read the source. */
    const H = window.HearthriseHomestead;
    if (!H || typeof H.renderCard !== 'function') return;
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 3 };   // next tier is the one that wants maple planks
      window.showTab('house');
      window.renderHouse();
      const chip = document.querySelector('#hh-property-card .hh-req[data-inspect-item="maple_plank"]');
      assert(chip, 'the property upgrade must render Maple Plank as an inspectable requirement');
      assert(chip.querySelector('.hr-si'),
        'the chip is flex, so the dotted-underline affordance needs its inner name span');
      // Gold sits in the same strip and must NOT have become a link.
      const goldChip = [].find.call(document.querySelectorAll('#hh-property-card .hh-req'),
        (c) => /Gold/.test(c.textContent));
      assert(goldChip && !goldChip.hasAttribute('data-inspect-item'), 'the gold requirement must stay plain text');

      chip.click();
      const ov = document.getElementById('inv-detail-overlay');
      assert(ov && ov.classList.contains('show'), 'tapping the requirement must open the item flyout');
      assert(/Maple Plank/.test(ov.textContent), 'the flyout must be about the item that was tapped');
      const info = ov.querySelector('.inv-detail-info');
      assert(info && /Maple Log/.test(ov.textContent),
        'and it must answer where it is acquired: ' + (info ? info.textContent : 'no Source line at all'));
      window.closeInvDetail();
    } finally { restoreG(snap); window.closeInvDetail(); }
  }),

  () => tryRun('b372: a room rung cost is inspectable, and its flyout opens above the modal', () => {
    const H = window.HearthriseHomestead;
    if (!H || !window.HearthriseRoomModal) return;
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 3 };
      window.G.rooms = { kitchen: 1 };
      window.G.gold = 999999;
      window.G.inventory = { normal_log: 999, oak_log: 999 };
      H.openRoom('kitchen');
      const costLink = document.querySelector('.hr-room-scrim .hr-cs-qty[data-inspect-item]');
      assert(costLink, 'a rung cost naming an item must be inspectable');

      /* THE STACKING BUG THIS FEATURE WOULD OTHERWISE SHIP: the room modal
         scrim sits at z-index 100000 and `.inv-detail` at 1500, so the flyout
         would have opened BEHIND the modal that launched it. */
      costLink.click();
      const ov = document.getElementById('inv-detail-overlay');
      assert(ov && ov.classList.contains('show'), 'the cost must open the flyout');
      const scrimZ = parseInt(getComputedStyle(document.querySelector('.hr-room-scrim')).zIndex, 10) || 0;
      assert(parseInt(ov.style.zIndex, 10) > scrimZ,
        'the flyout must be lifted ABOVE the overlay it was opened from (' + ov.style.zIndex + ' vs ' + scrimZ + ')');
      window.closeInvDetail();
      assert(ov.style.zIndex === '', 'and the lift must be dropped on close, or the next bag open inherits it');
    } finally { restoreG(snap); window.closeInvDetail(); window.HearthriseRoomModal && window.HearthriseRoomModal.close(); }
  }),

  () => tryRun('b372: the Recipe Book tree is walkable — every ingredient opens its own source', () => {
    const RB = window.HearthriseRecipeBook;
    if (!RB || typeof RB.open !== 'function') return;
    try {
      RB.open();
      const ing = document.querySelector('#rb-overlay .rb-ing[data-inspect-item]');
      assert(ing, 'a recipe ingredient must be inspectable — the Book exists so the tree can be walked');
      assert(ing.querySelector('.hr-si'), 'the flex chip needs its inner name span for the affordance');
      ing.click();
      const ov = document.getElementById('inv-detail-overlay');
      assert(ov && ov.classList.contains('show'), 'the ingredient must open the item flyout');
      assert(parseInt(ov.style.zIndex, 10) > 3000, 'and above the Book, which sits at 3000');
      window.closeInvDetail();
    } finally { window.closeInvDetail(); RB.close(); }
  }),


  () => tryRun('b372: tapping a requirement inside a click target does NOT fire that target', () => {
    /* The one way this feature could make the game worse. Activity tiles are
       one big start-the-craft button with the inputs printed inside them; a
       link that let the click through would start a craft every time a player
       asked where a plank comes from. The capture-phase handler is what stops
       that, and this is its contract. */
    // SA-013: the builder is published as HearthriseActivitiesGrid.__tileForArtisan,
    // never as window.tileForArtisan — the old guard checked a seam that was never
    // armed, so this test silently early-returned every run and asserted nothing.
    const AG = window.HearthriseActivitiesGrid;
    const tileForArtisan = AG && AG.__tileForArtisan;
    if (typeof tileForArtisan !== 'function' || !window.ARTISAN_RECIPES) { skip('activities-grid __tileForArtisan seam absent'); return; }
    const rec = (window.ARTISAN_RECIPES.smithing || []).find((r) => r.inputs || r.input);
    if (!rec) { skip('no smithing recipe with inputs to build a tile from'); return; }
    const snap = snapshotG();
    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      window.G.activeSkill = null;
      window.G.skillTargetId = null;
      host.innerHTML = tileForArtisan(rec, 'smithing');
      const nm = host.querySelector('.at-inputs [data-inspect-item]');
      assert(nm, 'an artisan input name must be inspectable');
      // The live COUNT stays inert — it is a number, not a noun.
      const cnt = host.querySelector('.at-inputs .at-have');
      assert(cnt && !cnt.hasAttribute('data-inspect-item'), 'the have-count must not be a link');
      nm.click();
      assert((document.getElementById('inv-detail-overlay') || {}).classList.contains('show'),
        'the input name must open the flyout');
      assert(!window.G.activeSkill && !window.G.skillTargetId,
        'and it must NOT have started the craft the surrounding tile is a button for');
      window.closeInvDetail();
    } finally { host.remove(); window.closeInvDetail(); restoreG(snap); }
  }),

  () => tryRun('b227: the House grid shows ownership at a glance (the acceptance test)', () => {
    // Tyler's own bar: open House and KNOW the Forge is yours, at what level,
    // and what is next — without reading a paragraph.
    const H = window.HearthriseHomestead;
    if (!H || typeof H.renderRoomGrid !== 'function') return;
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 2 };
      window.G.rooms = { forge: 2 };
      window.G.gold = 500000;
      window.G.inventory = Object.assign({}, window.G.inventory, { iron_ore: 999 });
      stampRecordLikeLoad(window.G);   // b456: rooms + gold are server-of-record
      window.showTab('house');
      if (typeof window.setHouseTab === 'function') window.setHouseTab('rooms');
      window.renderHouse();

      const cards = document.querySelectorAll('#house-panel .hh-room');
      assert(cards.length === Object.keys(window.ROOMS).length, 'every room needs a card, got ' + cards.length);

      const forge = document.querySelector('#house-panel .hh-room[data-room="forge"]');
      assert(forge, 'the Forge has no card');
      assert(forge.classList.contains('is-owned'), 'an owned Forge must be marked owned');
      assert(/Lv 2/.test(forge.textContent), 'the card must show the level you own');
      assert(/Stone Forge/.test(forge.textContent), 'the card must name the rung you are on');

      const cellar = document.querySelector('#house-panel .hh-room[data-room="cellar"]');
      assert(cellar.classList.contains('is-open'), 'a buildable-but-unbuilt room is "open", not owned');
      assert(!/Lv /.test(cellar.textContent), 'an unbuilt room must not advertise a level');

      const shrine = document.querySelector('#house-panel .hh-room[data-room="shrine"]');
      assert(shrine.classList.contains('is-locked'), 'a tier-4 room must be locked at a farmstead');
      assert(/Ironvale/.test(shrine.textContent), 'a locked card must name the property that opens it');

      // The three states must be mutually exclusive — a card that is both
      // owned and locked is how a screen starts lying.
      cards.forEach((c) => {
        const on = ['is-owned', 'is-open', 'is-locked'].filter((k) => c.classList.contains(k));
        assert(on.length === 1, c.getAttribute('data-room') + ' is in ' + on.length + ' states at once');
      });

      // Clicking a card opens that room, not a list.
      forge.click();
      assert(window.HearthriseRoomModal.isOpen(), 'clicking a room card must open its modal');
      assert(/Forge/.test(document.querySelector('.hr-room-title').textContent), 'the wrong room opened');
    } finally { restoreG(snap); window.HearthriseRoomModal && window.HearthriseRoomModal.close(); }
  }),

  () => tryRun('b227: every price in the House is readable as words, never an icon and a number', () => {
    /* Tyler, on a screenshot of the Workshop row: "It's hard to see what is
       actually required for these upgrades... it should be bigger and either
       have visible text or hover text."

       The cause was `_costPart`, which appended the item's display NAME only
       in its no-artwork branch — so every material that HAS an icon rendered
       as a picture and a bare number, and the name was suppressed by the very
       thing meant to illustrate it. This guards the rule, not the one row:
       nothing purchasable on this screen may state a price the player cannot
       read in words. */
    const snap = snapshotG(), bag = serverBagFixture();
    try {
      window.G.homestead = { tier: 3 };
      window.G.rooms = { workshop: 0, forge: 2 };
      window.G.gold = 1000;
      stampBalanceLikeLoad(window.G);   // armed: _costPart('gold', …) reads via canAfford
      window.G.inventory = Object.assign({}, window.G.inventory, { normal_log: 2, normal_plank: 2 });
      bag.agree();   // the server holds the same 2s: "you have 2" is the server's count

      // (1) the shared helper itself — with art present, which is the bug case.
      const part = window._costPart('normal_plank', 15);
      assert(/Normal Plank/.test(part), '_costPart must name the item even when it has artwork');
      assert(/title="/.test(part), '_costPart must carry hover text');
      assert(/you have 2/.test(part), 'the hover must say what the player actually holds');
      assert(/is-short/.test(part), 'an unaffordable part must be marked short');
      assert(/Gold/.test(window._costPart('gold', 700)), 'gold must be named too, not just a coin');
      assert(/is-met/.test(window._costPart('gold', 700)), 'an affordable part must be marked met');

      // (2) the room card face carries the next rung's price in words.
      window.showTab('house');
      if (typeof window.setHouseTab === 'function') window.setHouseTab('rooms');
      window.renderHouse();
      const card = document.querySelector('#house-panel .hh-room[data-room="workshop"]');
      assert(card, 'the Workshop has no card');
      assert(/Normal Log/.test(card.textContent), 'the card must name what the next rung costs');
      assert(/Gold/.test(card.textContent), 'the card must name the gold cost');
      const costs = card.querySelectorAll('.hh-cost');
      assert(costs.length >= 2, 'each requirement gets its own readable part, got ' + costs.length);
      costs.forEach((c) => {
        assert((c.getAttribute('title') || '').length > 0, 'every cost part needs hover text');
        assert(c.classList.contains('is-met') || c.classList.contains('is-short'),
          'every cost part must say whether it is met');
      });

      // (3) the modal ladder uses the have/need checklist, named, on every rung.
      const H = window.HearthriseHomestead;
      const m = H.modalDescriptor('workshop');
      const ladder = m.sections.find((s) => s.kind === 'ladder');
      ladder.rows.filter((r) => r.costs).forEach((r) => {
        assert(r.costs.length > 0, 'an unowned rung must list its cost');
        r.costs.forEach((c) => {
          assert(typeof c.label === 'string' && c.label.length > 1 && !/^[0-9]+$/.test(c.label),
            'a ladder cost must carry the item DISPLAY NAME, got "' + c.label + '"');
          assert(typeof c.have === 'number' && typeof c.need === 'number',
            'a ladder cost must be a have/need pair so the checklist can render met/short');
        });
      });
      // Rendered, not just described: the seam prints "have/need Name".
      H.openRoom('workshop');
      const meta = document.querySelector('.hr-room-rung .hr-cs-meta');
      assert(meta && /Normal Log/.test(meta.textContent),
        'the rendered ladder must show the item name, got "' + (meta && meta.textContent) + '"');
      assert(/\d+\s*\/\s*\d+/.test(meta.textContent), 'the rendered ladder must show your count over the needed count');
    } finally { restoreG(snap); bag.restore(); window.HearthriseRoomModal && window.HearthriseRoomModal.close(); }
  }),

  /* gold-arm: W.hire() is a deferred SPEND gated by clientMayWriteRecordField
     (gold-sites.js workers#hire) — the debit is a client write the armed switch
     suppresses, so this covers the switch-OFF position; the stamp makes the
     affordability READ known. */
  () => tryRunRestampingBalance('b201: workers — hire, assign, lazy accrual produces resources (never player XP)', () => {
    const W = window.HearthriseWorkers, H = window.HearthriseHomestead;
    assert(W && H, 'workers + homestead modules present');
    const G = window.G;
    const IA = window.HearthriseItemAuthority;
    const saved = {
      homestead: G.homestead, workers: G.workers, gold: G.gold,
      inv: JSON.parse(JSON.stringify(G.inventory || {})), skills: G.skills
    };
    /* The LEGACY client-mint path (flag OFF). With WORKER_PRODUCTION_SERVER_BACKED
       ON the crew is server-owned — hire/assign send intents and accrueWorker is a
       no-op, which is covered by the "worker-settlement" E2E above. This test
       guards the one-line REVERT path stays intact: with the flag off the client
       still hires, assigns and banks resources exactly as it shipped. */
    const flagBefore = IA && IA.WORKER_PRODUCTION_SERVER_BACKED;
    try {
      if (IA) IA.WORKER_PRODUCTION_SERVER_BACKED = false;
      G.homestead = { tier: 1 };                       // 1 worker slot
      G.workers = { hired: [] }; G.gold = 10000;
      stampBalanceLikeLoad(G);   // armed: W.hire() reads gold via canAfford
      G.skills = Object.assign({}, G.skills, { woodcutting: 100000 }); // high enough for any tree
      const w = W.hire();
      assert(w, 'hire should succeed with gold + a free slot');
      assert(W.hire() === null, 'second hire should fail (slot cap 1)');
      assert(W.assign(w.uid, 'woodcutting', 'normal_tree') === true, 'assign should succeed');
      const xpBefore = JSON.stringify(G.skills);
      w.lastCollect = Date.now() - 3600000;            // pretend 1h passed
      const before = (G.inventory.normal_log || 0);
      W.accrueAll(false);
      const gained = (G.inventory.normal_log || 0) - before;
      /* b497 — EXACT, and predicted from the PLAYER's side of the ratio rather
         than from the worker code under test. A worker banks `eff` of what an
         active player would gather in the same hour, and the active interval is
         `window.pacedActionMs(node.ms)` (an independently-authored function), so
         a wrong anchor inside the worker engine cannot satisfy this. The old
         assertion was a 4x-wide band around a figure whose own comment did the
         arithmetic wrong (`~1.5 qty` on a [1,1] node), and it let the whole
         b389→b496 1.60x over-payment through. */
      const node = (window.TREES || []).find((t) => t.id === 'normal_tree');
      assert(node && typeof window.pacedActionMs === 'function', 'normal_tree + pacedActionMs available');
      const activeMs = window.pacedActionMs(node.ms);          // an ACTIVE, perkless player
      const expTicks = Math.floor(3600000 / (activeMs / W.eff({ xp: 0 })));
      const expQty = Math.floor(expTicks * (node.qty[0] + node.qty[1]) / 2);
      assert(gained === expQty,
        'a Lv1 worker banks exactly eff x the ACTIVE paced rate for 1h — expected ' + expQty + ', got ' + gained);
      assert(JSON.stringify(G.skills) === xpBefore, 'workers must never grant player XP');
    } finally {
      if (IA) IA.WORKER_PRODUCTION_SERVER_BACKED = flagBefore;
      G.homestead = saved.homestead; G.workers = saved.workers; G.gold = saved.gold;
      G.inventory = saved.inv; G.skills = saved.skills;
    }
  }),
  () => tryRun('b389/b497: worker rebalance — a full castle crew ≤ ~1 active-equivalent, MEASURED as a ratio', () => {
    const W = window.HearthriseWorkers;
    assert(W && typeof W.eff === 'function' && typeof W.ratePerHour === 'function', 'workers module + eff + ratePerHour present');
    assert(typeof window.pacedActionMs === 'function' && Array.isArray(window.TREES), 'pacedActionMs + TREES available');
    /* A max-level worker's output × the 6-slot castle crew must stay ≈ ONE active
       gatherer — never the pre-b389 3.12x free-24/7 faucet that defeated the b226
       vendor ceiling (~6.3M gold/day passive).

       ⚠ THIS GUARD USED TO ASSERT `6 * W.eff(...) <= 1.1` AND IT WAS GREEN FOR THE
       ENTIRE TIME THE RULE WAS BROKEN. `eff` is one HALF of a ratio; the engine
       divided the RAW `node.ms` while a player gathers at `pacedActionMs(node.ms)`,
       so the shipped crew was 6 x 0.172 x 1.60 = 1.65 equivalents against the 1.03
       b389 ruled — and a guard that measures a proxy cannot see that. It measures
       the RATIO now, through the two functions that actually produce it:
         • `W.ratePerHour(worker)`  — what the crew screen promises and the settle pays;
         • `pacedActionMs(node.ms)` — what an active, perkless player takes.
       Neither can be edited alone to satisfy it. Same shape as W11 in
       tests/worker-accrual.mjs, which proves the server half. */
    const node = window.TREES.find((t) => t.id === 'normal_tree');
    assert(node, 'normal_tree present in TREES');
    const avgQty = (node.qty[0] + node.qty[1]) / 2;
    const activePerHour = 3600000 / window.pacedActionMs(node.ms) * avgQty;
    const maxed = { xp: 1e12, skill: 'woodcutting', targetId: node.id };   // level 10
    const equivalents = W.ratePerHour(maxed) / activePerHour;
    const crew = 6 * equivalents;                                          // castle = 6 slots
    assert(Math.abs(equivalents - W.eff(maxed)) < 1e-6,
      'a worker produces exactly eff x the ACTIVE paced rate — got ' + equivalents + ' vs eff ' + W.eff(maxed));
    assert(equivalents <= 0.20, 'a maxed worker must be ≤ 20% of an active gatherer, got ' + equivalents);
    assert(crew <= 1.1, 'a full 6-worker castle crew must be ≤ 1.1 active-equivalents, got ' + crew);
  }),
  /* worker-settlement slice — THE CLIENT WIRING. With the crew server-owned
     (WORKER_PRODUCTION_SERVER_BACKED), hire() and assign() must send INTENTS to
     hr_worker_hire / hr_worker_assign and render the SERVER's crew, never author
     one locally. This drives the whole gesture with stubbed transports and proves:
       • hire buys the next paid rung, then calls hr_worker_hire, and the
         optimistic worker takes the server's uid;
       • assign fires hr_worker_assign with (uid, skill, node);
       • reconcileWorkers renders the server crew (target_id -> targetId),
         preserves the client display ledger by uid, and treats an omitted
         `workers` array as "unknown" but an empty array as "the crew is empty".
     MUTATION: drop the `if (serverBacked()) return hireServer(...)` line in
     workers.js -> hr_worker_hire is never called -> RED. */
  () => tryRunAsync('worker-settlement: hire + assign go through the server RPCs; the crew reconciles from the envelope', async () => {
    const W = window.HearthriseWorkers, A = window.HearthriseAccrual, IA = window.HearthriseItemAuthority;
    assert(W && A && IA, 'workers + accrual + item-authority modules present');
    assert(typeof A.reconcileWorkers === 'function', 'accrue must publish reconcileWorkers');

    const G = window.G;
    const saved = { workers: G.workers, homestead: G.homestead, skills: G.skills, gold: G.gold };
    const flagBefore = IA.WORKER_PRODUCTION_SERVER_BACKED;
    const netBefore = window.HearthriseWorkersNet;
    const goldBefore = window.HearthriseGold;
    /* Silence hire/assign toasts so this test does not leave a transient
       notification in the DOM for a later whole-document scan (b227) to catch. */
    const notifyBefore = window.notify;
    window.notify = function () {};
    const buyCalls = [], hireCalls = [], assignCalls = [];
    const SRV_UID = 'wSRV1';
    // gold stub: buyUnlock always "lands" so the hire proceeds to materialise.
    window.HearthriseGold = Object.assign({}, goldBefore, {
      buyUnlock: function (offer) { buyCalls.push(offer); return Promise.resolve({ outcome: 'applied' }); }
    });
    /* net stub: HIRE-FIRST — hr_worker_hire is asked FIRST. With no rung paid
       yet it answers crew_cap_reached(paid_cap:0), which drives the client to
       buy worker_hire.1 and hire again (the second call materialises). */
    let hireN = 0;
    window.HearthriseWorkersNet = {
      isSignedIn: function () { return true; },
      hire: function () {
        hireCalls.push(1);
        if (++hireN === 1) return Promise.resolve({ ok: false, error: 'crew_cap_reached', crew: 0, paid_cap: 0 });
        return Promise.resolve({ ok: true, uid: SRV_UID, name: 'Aldric', crew: 1 });
      },
      assign: function (uid, skill, target) { assignCalls.push([uid, skill, target]); return Promise.resolve({ ok: true, uid: uid, skill: skill, target_id: target }); }
    };
    const tick = () => new Promise((r) => setTimeout(r, 0));
    try {
      IA.WORKER_PRODUCTION_SERVER_BACKED = true;   // force the server path regardless of ambient arm
      G.workers = { hired: [] };
      G.homestead = { tier: 5 };                    // castle (TIERS[5]): 6 worker slots
      G.gold = 1e9; stampBalanceLikeLoad(G);
      G.skills = Object.assign({}, G.skills, { woodcutting: 100000 });

      // 1) HIRE — an optimistic worker appears at once; the server materialises it.
      const temp = W.hire();
      assert(temp && temp.uid, 'hire returns an optimistic worker for instant feedback');
      assert(G.workers.hired.length === 1, 'the optimistic worker is shown immediately');
      await tick(); await tick(); await tick(); await tick();   // hire -> cap -> buy -> hire
      assert(buyCalls.length === 1 && buyCalls[0] === 'worker_hire.1',
        'on crew_cap_reached the hire buys the next paid rung worker_hire.1; got ' + JSON.stringify(buyCalls));
      assert(hireCalls.length === 2, 'HIRE-FIRST: hr_worker_hire is called once to probe the cap, then again to materialise after the rung commits; got ' + hireCalls.length);
      assert(G.workers.hired.length === 1 && G.workers.hired[0].uid === SRV_UID,
        'the optimistic worker takes the server uid; got ' + JSON.stringify(G.workers.hired.map((w) => w.uid)));
      assert(G.workers.hired[0]._pending === false, 'the worker is no longer pending once materialised');

      // 2) ASSIGN — the intent goes to hr_worker_assign; the prediction reconciles.
      const ok = W.assign(SRV_UID, 'woodcutting', 'normal_tree');
      assert(ok === true, 'assign returns true (intent accepted)');
      assert(G.workers.hired[0].skill === 'woodcutting' && G.workers.hired[0].targetId === 'normal_tree',
        'the assignment shows optimistically');
      await tick(); await tick();
      assert(assignCalls.length === 1, 'assign must call hr_worker_assign');
      assert(assignCalls[0][0] === SRV_UID && assignCalls[0][1] === 'woodcutting' && assignCalls[0][2] === 'normal_tree',
        'the assign intent carries uid + skill + node; got ' + JSON.stringify(assignCalls[0]));

      // 3) RECONCILE — the envelope is the truth (target_id -> targetId), display
      //    ledger preserved by uid.
      G.workers.hired[0].collected = { normal_log: 42 }; G.workers.hired[0].collectedTotal = 42;
      const n = A.reconcileWorkers(G, { workers: [
        { uid: SRV_UID, name: 'Aldric', skill: 'woodcutting', target_id: 'normal_tree', xp: 5000, acc_ms: 0 }
      ] });
      assert(n === 1, 'reconcileWorkers returns the server crew size');
      const rw = G.workers.hired[0];
      assert(rw.uid === SRV_UID && rw.skill === 'woodcutting' && rw.targetId === 'normal_tree' && rw.xp === 5000,
        'the crew renders the server state (target_id mapped to targetId); got ' + JSON.stringify(rw));
      assert(rw.collectedTotal === 42, 'reconcile preserves the client-only display ledger by uid');

      // 4) ABSENCE IS NOT A CLAIM — a workers-less envelope leaves the crew alone;
      //    an EMPTY array IS a claim (the crew is genuinely empty).
      assert(A.reconcileWorkers(G, { state: {} }) === null && G.workers.hired.length === 1,
        'a workers-less envelope must not wipe the crew');
      assert(A.reconcileWorkers(G, { workers: [] }) === 0 && G.workers.hired.length === 0,
        'an empty workers array clears the roster');
    } finally {
      IA.WORKER_PRODUCTION_SERVER_BACKED = flagBefore;
      window.HearthriseWorkersNet = netBefore;
      window.HearthriseGold = goldBefore;
      window.notify = notifyBefore;
      G.workers = saved.workers; G.homestead = saved.homestead; G.skills = saved.skills; G.gold = saved.gold;
      try { stampBalanceLikeLoad(G); } catch (e) {}
    }
  }),

  () => tryRun('b201: tool ladder — best owned tool applies, recipes exist', () => {
    const T = window.HearthriseTools;
    assert(T, 'HearthriseTools present');
    const G = window.G;
    const savedInv = JSON.parse(JSON.stringify(G.inventory || {}));
    try {
      G.inventory = { bronze_axe: 1 };
      assert(Math.abs(T.bestToolSpeed('woodcutting') - 0.05) < 1e-9, 'bronze axe = +5%');
      G.inventory.rune_axe = 1;
      assert(Math.abs(T.bestToolSpeed('woodcutting') - 0.25) < 1e-9, 'rune axe should win = +25%');
      assert(T.bestToolSpeed('mining') === 0, 'no pickaxe owned = 0');
      const smith = (window.ARTISAN_RECIPES.smithing || []).map(r => r.id);
      ['forge_bronze_axe', 'forge_rune_pickaxe'].forEach(id =>
        assert(smith.includes(id), 'smithing recipe missing: ' + id));
      // (The fishing-rod recipes left with the artisan tools, 2026-10-14; axes and pickaxes stay.)
    } finally { G.inventory = savedInv; }
  }),
  () => tryRun('b204: artisan offline — a cooking session progresses across an absence (was zero)', () => {
    /* b515 — DRIVEN ON THE BENCH ITSELF. This called `processOffline()` and read
       `G.inventory`; the local away engine behind that call is deleted, and the
       one that replaced it is `src/core/artisan-sim.js simulateArtisanSpan`,
       vendored into hr-accrue by tools/pack-edge.mjs. Same fixture, same
       numbers, measured where the work happens — and now on a plain state, so
       an ambient `G.inventory` an earlier test left behind cannot satisfy it. */
    const r = awayArtisanSpan({
      targetId: 'cook_shrimp', spanMs: 2 * 3600000,
      state: { skills: { cooking: 0 }, inventory: { shrimp: 50 }, rooms: { kitchen: 1 } },
    });
    const cooked = r.paid.items.cooked_shrimp || 0;
    const burnt = r.paid.items.burnt_food || 0;
    const attempts = r.paid.removed.shrimp || 0;
    assert(cooked > 0, 'an offline cooking span produced no cooked shrimp, got 0 (' + r.out.stoppedBy + ')');
    assert(cooked <= 50, 'the span must stop when the inputs run out, got ' + cooked);
    /* b225: an attempt is cooked-or-burnt, and raw shrimp are consumed 1:1 with
       ATTEMPTS — which is what "no free food, no lost food" actually means. */
    assert(attempts === cooked + burnt,
      'raw shrimp must be consumed 1:1 with attempts (cooked ' + cooked + ' + burnt ' + burnt + ' = '
      + (cooked + burnt) + '), consumed ' + attempts);
    assert(attempts === 50 - (r.state.inventory.shrimp || 0),
      'the bag disagrees with the consumption the bench reported: ' + JSON.stringify(r.state.inventory));
    assert((r.paid.xp.cooking || 0) > 0, 'an offline cooking span paid no Cooking XP');
  }),

  () => tryRun('b217: onboarding chain guides preparation before combat', () => {
    const G = window.G;
    const saved = { quests: JSON.parse(JSON.stringify(G.quests || [])) };
    try {
      G.quests = [];
      window.ensureRetentionState();
      const ids = (G.quests || []).map(q => q.id);
      const iGather = ids.indexOf('gatherer');
      const iCook   = ids.indexOf('first_cook');
      const iFight  = ids.indexOf('first_blood');
      assert(iGather !== -1 && iCook !== -1 && iFight !== -1,
        'onboarding chain must contain gatherer + first_cook + first_blood, got ' + ids.join(','));
      assert(iGather < iFight && iCook < iFight,
        'prep quests (gather, cook) must come BEFORE combat (first_blood) so new players are guided to prepare');
      const cook = G.quests.find(q => q.id === 'first_cook');
      assert(cook && cook.type === 'cooked', 'first_cook must be a cooking quest');
    } finally { G.quests = saved.quests; }
  }),
  () => tryRun('b217: cooking progresses the quest tracker (live artisan path)', () => {
    if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(true);
    const G = window.G;
    const saved = {
      quests: JSON.parse(JSON.stringify(G.quests || [])),
      inv: JSON.parse(JSON.stringify(G.inventory || {})),
      rooms: JSON.parse(JSON.stringify(G.rooms || {})),
      skills: JSON.parse(JSON.stringify(G.skills || {})),
      activeSkill: G.activeSkill, target: G.skillTargetId
    };
    try {
      // Guard the fix: the LIVE window.doArtisanAction must feed updateQuest for
      // cooking — before b217 it updated only G.stats, so the onboarding cook
      // quest was un-completable.
      // b225: kitchen 3, not 1. This test guards the counter WIRING, and the
      // campfire ruling made a Kitchen-L1 cook a 12% coin-flip — three cooks
      // would fail this assertion roughly one run in three for a reason that
      // has nothing to do with what it is testing. The Cast-Iron Range is
      // burn-proof, so the sample is deterministic again. Burn-vs-counter
      // behaviour has its own dedicated tests in the b225 block.
      G.rooms = Object.assign({}, G.rooms, { kitchen: 3 });
      /* b456: AND THE RUNG HAS TO ARRIVE ON THE RECORD, or the whole reason the
         Cast-Iron Range is here is defeated. `rooms` is server-of-record, so a raw
         `G.rooms = {kitchen:3}` reads UNKNOWN → the fail-closed EMPTY map → an OPEN
         FIRE at 25% burn — and a burn does not tick the cook counter. That is
         exactly the coin-flip the b225 note above says this test must not have:
         observed progress of 1, 2 and 3 across three consecutive runs of an
         unchanged build. */
      stampRecordLikeLoad(G);
      G.inventory = Object.assign({}, G.inventory, { shrimp: 10 });
      G.quests = [{ id: 'first_cook', type: 'cooked', label: 'Cook 5 dishes', goal: 5, progress: 0, reward: { gold: 1 }, done: false }];
      for (let i = 0; i < 3; i++) window.doArtisanAction('cooking', 'cook_shrimp');
      assert(G.quests[0].progress === 3, 'cooking must progress the onboarding cook quest, got ' + G.quests[0].progress);
    } finally {
      if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(null);
      G.quests = saved.quests; G.inventory = saved.inv;
      G.rooms = saved.rooms; G.skills = saved.skills;
      G.activeSkill = saved.activeSkill; G.skillTargetId = saved.target;
      stampRecordLikeLoad(G);
    }
  }),
  () => tryRun('b269: artisan progress bar resets each action (was pinned at 100%)', () => {
    if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(true);
    // Regression (Tyler: "the progress bar stops after moving from 1 activity to
    // another"). _armArtisanTimers filled G.skillProgress to a Math.min(1,…) cap
    // but nothing reset it, so after one cycle the bar stuck at 100% forever
    // while items kept being produced. doArtisanAction must re-zero it each real
    // (non-silent) production tick, exactly like the gather loop's doSkillAction.
    const G = window.G;
    if (typeof window.doArtisanAction !== 'function') return;
    const saved = {
      inv: JSON.parse(JSON.stringify(G.inventory || {})),
      rooms: JSON.parse(JSON.stringify(G.rooms || {})),
      skills: JSON.parse(JSON.stringify(G.skills || {})),
      prog: G.skillProgress,
    };
    try {
      G.rooms = Object.assign({}, G.rooms, { kitchen: 3 });   // burn-proof range
      G.inventory = Object.assign({}, G.inventory, { shrimp: 10 });
      G.skillProgress = 1;                                    // simulate a full bar
      window.doArtisanAction('cooking', 'cook_shrimp');       // a real (non-silent) tick
      assert(G.skillProgress === 0,
        'a live artisan action must reset the progress bar to 0, got ' + G.skillProgress);
      // silent offline-replay ticks must NOT touch the live bar
      G.skillProgress = 0.5;
      G.inventory.shrimp = 10;
      window.doArtisanAction('cooking', 'cook_shrimp', { silent: true });
      assert(G.skillProgress === 0.5,
        'a silent offline tick must leave the live progress bar untouched, got ' + G.skillProgress);
    } finally {
      if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(null);
      G.inventory = saved.inv; G.rooms = saved.rooms; G.skills = saved.skills;
      G.skillProgress = saved.prog;
    }
  }),
  () => tryRunAsync('b269: buying bank space raises the cap; gold escalates; and the gem rung has no server verb', async () => {
    const G = window.G;
    assert(typeof window.buyBankSpaceGold === 'function', 'buyBankSpaceGold missing');
    assert(typeof window.buyBankSpaceGem === 'function', 'buyBankSpaceGem missing');
    assert(typeof window.bankCap === 'function' && typeof window.bankGoldCost === 'function', 'bank helpers missing');
    const BS = window.BANK_SPACE;
    const saved = { gold: G.gold, gems: G.gems, bank: JSON.parse(JSON.stringify(G.bank || {})), cap: G._bankCap };
    const bagHeld = serverBagFixture();   // the rig's envelopes state a bag: put the triple back
    try {
      G.bank = { goldBuys: 0, gemBuys: 0, grandfather: 0 }; delete G._bankCap;   // nothing stated yet
      const cap0 = window.bankCap();
      assert(cap0 === BS.BASE_CAP, 'fresh cap must equal BASE_CAP, got ' + cap0);

      /* ── GOLD PATH: an hr_unlock_buy gesture (b500). The cap moves on the
         server's OK and the balance is whatever the answer states — the client
         does not debit, so "deduct exactly the quoted cost" is now "send the
         right rung and render the server's number". */
      G.gold = 10_000_000; G.gems = 10_000;
      stampBalanceLikeLoad(G);   // armed: buyBankSpace* read via canAfford
      const c0 = window.bankGoldCost();
      const SERVER_GOLD = 10_000_000 - c0 - 7;     // NOT the client's arithmetic
      /* AND THE CAP IS THE SERVER'S TOO: a real rung raises `bank_cap` in the
         same transaction, so the fixture states it as the realm would. */
      await withServerBacked({ state: { gold: SERVER_GOLD, bank_cap: cap0 + BS.gold.slots } }, async (rig) => {
        assert(window.buyBankSpaceGold() === true, 'gold buy should succeed when affordable');
        await rig.drain();
        assert(rig.sent.length === 1 && rig.sent[0].verb === 'unlock_buy' && rig.sent[0].offer === 'bank.0',
          'the bank rung sent ' + JSON.stringify(rig.sent) + ' — one unlock_buy naming bank.0');
        assert(!('gold' in rig.sent[0]) && !('price' in rig.sent[0]),
          'the bank rung named a price: ' + JSON.stringify(rig.sent[0]));
        assert(window.bankCap() === cap0 + BS.gold.slots, 'gold buy must add gold.slots to the cap');
        assert(goldOf() === SERVER_GOLD,
          'the balance is ' + goldOf() + ' and the server said ' + SERVER_GOLD);
      });
      const c1 = window.bankGoldCost();
      assert(c1 > c0, 'gold cost must ESCALATE after a purchase (' + c1 + ' > ' + c0 + ')');

      /* ── GEM PATH: THE LADDER IS AUTHORED AND THE VERB IS NOT. `gems` is
         SERVER-OF-RECORD and armed, and there is NO gem rung in
         src/data/gold-ladders.js (hr_unlock_offers prices in gold only), so
         `buyBankSpaceGem` REFUSES by name rather than granting the rung and
         letting the next envelope refund the gems — the b371 dupe's shape.
         That is a real PRODUCT GAP, filed in HANDOFFS.md ("the GEM PURCHASE
         VERB"), and it is named here rather than tested away.
         What must hold while it is off: the refusal costs NOTHING, and it SAYS
         so — a button that silently does nothing is how a player concludes
         their gems vanished (b494). And the LADDER DATA is still asserted, so
         the day the verb lands the balance question is the only open one. */
      const gemsBefore = gemsOf(), capBeforeGem = window.bankCap();
      const gemBuy = window.buyBankSpaceGem();
      assert(gemBuy !== true,
        'the gem bank rung was GRANTED with no server verb behind it — the rung sticks and the next '
        + 'envelope refunds the gems, which is the b371 free-purchase dupe');
      assert(window.bankCap() === capBeforeGem, 'a refused gem buy moved the cap: ' + window.bankCap());
      assert(gemsOf() === gemsBefore, 'a refused gem buy spent gems: ' + gemsBefore + ' -> ' + gemsOf());
      assert(BS.gem.slots > BS.gold.slots, 'the gem path must grant more slots per buy than gold');
      assert(BS.gem.cost > 0, 'the gem rung must still carry a price for the day it is sellable');

      // Can't overspend. Re-stamp so the refusal is measured on a genuinely-KNOWN
      // zero balance (the "you are broke" path), not on UNKNOWN.
      G.gold = 0; stampBalanceLikeLoad(G);
      await withServerBacked({}, async (rig) => {
        assert(window.buyBankSpaceGold() === false, 'must refuse gold buy with no gold');
        await rig.drain();
        assert(rig.sent.length === 0,
          'a broke player still spent a round trip to be told they are broke: ' + JSON.stringify(rig.sent));
        assert(goldOf() === 0, 'a refused buy moved the balance');
      });
    } finally { G.gold = saved.gold; G.gems = saved.gems; G.bank = saved.bank; restoreBankCap(saved.cap); bagHeld.restore(); }
  }),
  () => tryRun('b269: addItem refuses a NEW stack when the bank is full, but grows existing stacks', () => {
    const G = window.G;
    const saved = { inv: JSON.parse(JSON.stringify(G.inventory || {})), bank: JSON.parse(JSON.stringify(G.bank || {})), cap: G._bankCap };
    try {
      // Two known item ids that stack.
      const ids = Object.keys(window.ITEMS).filter(k => k !== 'gold').slice(0, 2);
      assert(ids.length === 2, 'need two real item ids for the test');
      G.inventory = {}; G.inventory[ids[0]] = 5;
      // Pin the cap to the stack count → full. The lever is the realm's own cap.
      G.bank = { goldBuys: 0, gemBuys: 0, grandfather: 0 };
      G._bankCap = window.bankUsed();                                    // cap == used
      assert(window.bankCap() === window.bankUsed(), 'test setup: cap must equal used');
      // Growing an EXISTING stack is always allowed.
      assert(window.addItem(ids[0], 3) === true, 'existing stack must grow even when full');
      assert(G.inventory[ids[0]] === 8, 'existing stack qty must increase');
      // A brand-new stack is refused while full.
      assert(window.addItem(ids[1], 1) === false, 'new stack must be refused when bank is full');
      assert(!G.inventory[ids[1]], 'refused item must not enter the bag');
      // Free a slot and the new stack now fits.
      G._bankCap += 1;
      assert(window.addItem(ids[1], 1) === true && G.inventory[ids[1]] === 1, 'new stack fits after expansion');
    } finally { G.inventory = saved.inv; G.bank = saved.bank; restoreBankCap(saved.cap); }
  }),
  () => tryRun('b208: market — live-backend seam present, sane offline defaults', () => {
    const M = window.HearthriseMarket;
    assert(M && typeof M.setBackend === 'function', 'HearthriseMarket.setBackend exists (was the missing wire to the finished Supabase backend)');
    assert(typeof M.refreshFromBackend === 'function' && typeof M.collectSaleProceeds === 'function', 'refresh + sales-collection exposed');
    assert(M.backendActive() === false || !!window.HearthriseAuth, 'backendActive only with auth');
    // signed-out: seeding still allowed (dev), listing flow still local + sync
    const G = window.G;
    const snap = snapshotG(), bag = serverBagFixture();
    try {
      G.inventory.normal_log = (G.inventory.normal_log || 0) + 5;
      bag.agree();   // the server holds the logs (listItem counts its bag): the seam's defaults are the subject
      const r = M.listItem('normal_log', 5, 3);
      assert(r && r.ok === true, 'local listItem still returns sync {ok:true}, got ' + JSON.stringify(r));
      const mine = M.myListings ? M.myListings() : null;
      // cancel it again to restore state (find via listings)
      const all = JSON.parse(localStorage.getItem('hearthrise:market:listings') || '[]');
      const l = all.filter(x => x.itemId === 'normal_log').slice(-1)[0];
      if (l) M.cancelListing(l.id);
    } finally { restoreGAndRecord(snap); bag.restore(); }
  }),
  () => tryRun('b216: the light theme never paints under the dark theme', () => {
    // THE root cause of the recurring "mismatched colours". Two ways it broke:
    //   1. `html:not([data-theme])` selectors — the theme attribute is set on
    //      <body>, so <html> never has it and those rules matched FOREVER,
    //      painting cream surfaces and cocoa ink beneath Hearthlight.
    //   2. Rules that hardcode cocoa/cream with no theme scope at all.
    // Both were fixed by scoping the light layer to body[data-theme="cozy-light"].
    // This test fails the moment either pattern reappears, so the fix can't rot.
    let sheet = null;
    for (const s of Array.from(document.styleSheets)) {
      if ((s.href || '').indexOf('theme-cozy') >= 0) { sheet = s; break; }
    }
    if (!sheet) return;
    let rules;
    try { rules = Array.from(sheet.cssRules); } catch { return; }   // CORS-blocked
    const alwaysOn = [];
    const unscoped = [];
    const COCOA_CREAM = /#3d2817|#5c2d08|#7a4623|#fff8e2|#faf0d4|#f4e4bc|#ede0b8|#fff7e0|rgba?\(\s*61,\s*40,\s*23|rgba?\(\s*255,\s*247,\s*224|rgba?\(\s*237,\s*224,\s*184/i;
    const walk = (list) => list.forEach((r) => {
      if (r.cssRules && !r.selectorText) { walk(Array.from(r.cssRules)); return; }  // @media etc.
      if (!r.selectorText || !r.style) return;
      const sel = r.selectorText;
      if (sel.indexOf('html:not([data-theme])') >= 0) { alwaysOn.push(sel.slice(0, 60)); return; }
      if (!COCOA_CREAM.test(r.cssText)) return;
      if (/cozy-light|hearthlight|lane1|data-theme="dark"|classic|cozy-dark/.test(sel)) return;
      // Shadows/borders may legitimately tint; only surfaces + ink matter.
      if (!/(^|;|\s)(color|background|background-color)\s*:/.test(r.style.cssText)) return;
      unscoped.push(sel.slice(0, 60));
    });
    walk(rules);
    assert(alwaysOn.length === 0,
      alwaysOn.length + ' always-on `html:not([data-theme])` rule(s) are back — they match in EVERY theme: ' + alwaysOn.slice(0, 3).join(' | '));
    assert(unscoped.length === 0,
      unscoped.length + ' unscoped cocoa/cream rule(s) paint the light palette under the dark theme: ' + unscoped.slice(0, 3).join(' | '));
  }),

  () => tryRun('b216: dark palette is the default at :root', () => {
    // The colour tokens used to live on :root with the COZY-LIGHT values, so the
    // baseline palette was the light theme and anything resolving a token
    // outside body's scope came out cream/cocoa.
    const rootInk = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim().toLowerCase();
    const rootBg = getComputedStyle(document.documentElement).getPropertyValue('--bg-0').trim().toLowerCase();
    assert(rootInk && rootInk !== '#3d2817',
      ':root --ink must not be the cocoa light value (got ' + rootInk + ')');
    assert(rootBg && rootBg !== '#f4e4bc',
      ':root --bg-0 must not be the cream light value (got ' + rootBg + ')');
  }),

  // REGRESSION (2026-10-14, Tyler: "brown is not very fitting for the theme").
  // The default UI is Charcoal & Gold. A palette is not the --bg-* ladder: the
  // brown a player saw lived in the panel floor, the glass rails and a warm
  // "light" literal, so this reads the ladder AND the painted surfaces. Midnight
  // and Iron are staged behind body[data-theme-palette] and must still move it.
  () => tryRun('PALETTE-1: the default UI is Charcoal & Gold: no brown in the ladder, the light or the painted chrome, the gold unchanged, the staged palettes still apply', () => {
    const body = document.body;
    const prev = body.getAttribute('data-theme-palette');
    const probe = document.createElement('i');
    body.appendChild(probe);
    const colours = (s) => [...String(s).matchAll(/rgba?\(([^)]+)\)/g)].map((m) => m[1].split(/[\s,/]+/).filter(Boolean).map(Number));
    const tok = (t) => { probe.style.color = 'var(' + t + ')'; return colours(getComputedStyle(probe).color)[0]; };
    /* Brown is red well above blue at a visible strength; the gold family is excluded by name. */
    const brown = (c) => (c.length < 4 || c[3] >= 0.25) && c[0] - c[2] > 8;
    try {
      body.removeAttribute('data-theme-palette');
      for (const t of ['--bg-0', '--bg-1', '--bg-2', '--bg-3', '--panel-floor-0', '--panel-floor-1', '--avatar-bg', '--hl', '--ink', '--ink-2', '--ink-3', '--aqua-2']) {
        assert(!brown(tok(t)), t + ' is brown again (' + tok(t) + '): the default palette is Charcoal & Gold');
      }
      assert(tok('--gold').join() === '201,162,74', 'the gold moved (' + tok('--gold') + '): the palette changes the base, never the gold');
      const panel = document.querySelector('.panel.active');
      const painted = [['.sidebar', document.querySelector('.sidebar')], ['.topbar', document.querySelector('.topbar')], ['.panel.active', panel]];
      for (const [name, el] of painted) {
        if (!el) continue;
        const cs = getComputedStyle(el);
        const hit = colours(cs.backgroundColor + ' ' + cs.backgroundImage).find(brown);
        assert(!hit, name + ' paints brown (' + hit + '): a surface literal is back, or the token it reads is');
      }
      const base = tok('--bg-2').join();
      body.setAttribute('data-theme-palette', 'midnight');
      const navy = tok('--bg-2');
      assert(navy.join() !== base && navy[2] > navy[0] + 10, 'the staged Midnight palette no longer moves --bg-2 to navy (' + navy + ')');
      body.setAttribute('data-theme-palette', 'iron');
      const iron = tok('--bg-2');
      assert(iron.join() !== base && Math.abs(iron[0] - iron[2]) <= 8, 'the staged Iron palette no longer moves --bg-2 to steel grey (' + iron + ')');
    } finally {
      probe.remove();
      if (prev === null) body.removeAttribute('data-theme-palette'); else body.setAttribute('data-theme-palette', prev);
    }
  }),

  // ── b222 · CSS substrate guards ────────────────────────────────────────────
  // The b216 guard above catches ONE shape of always-true selector
  // (`html:not([data-theme])`) in ONE file. b222 found three more shapes that
  // shape misses, in every sheet. Each of these fails the moment the pattern
  // comes back; together they are the contract that keeps board-and-shop.css
  // (and any future in-world screen) free of !important arms races.
  () => tryRun('b222: no always-true `:root <descendant>` rules in any sheet', () => {
    // `:root` is <html>; the theme attribute lives on <body>. So a rule like
    // `:root .topbar {…}` matches under EVERY theme. theme-cozy.css carried 25
    // of them as the second half of `body[data-theme="cozy-light"] X, :root X`
    // pairs, quietly painting the retired light theme's component layer beneath
    // Hearthlight (the active nav item wore the light fill AND a real 3px
    // border-left that defeated b217's inset spine). `:root` is for TOKEN
    // BLOCKS ONLY — `:root { --x: … }` and `:root, body[data-theme=…] { --x }`
    // are fine because they have no descendant part.
    const bad = [];
    for (const sheet of Array.from(document.styleSheets)) {
      const file = (sheet.href || '').split('/').pop().split('?')[0];
      if (!file) continue;                                    // injected <style> — not ours to police
      let rules; try { rules = Array.from(sheet.cssRules); } catch { continue; }
      const walk = (list) => list.forEach((r) => {
        if (r.cssRules && !r.selectorText) { walk(Array.from(r.cssRules)); return; }
        if (!r.selectorText) return;
        r.selectorText.split(',').forEach((sel) => {
          const s = sel.trim();
          // `:root` followed by anything that is not the end of the selector
          if (/^:root(\s|\s*>)\s*\S/.test(s)) bad.push(file + ' :: ' + s.slice(0, 70));
        });
      });
      walk(rules);
    }
    assert(bad.length === 0,
      bad.length + ' always-true `:root <descendant>` rule(s) are back — they match in EVERY theme: ' + bad.slice(0, 3).join(' | '));
  }),

  () => tryRun('b222: no selector chains two <body> elements deep', () => {
    // The b216 rescoping pass prefixed `body[data-theme="cozy-light"] ` onto
    // several COMMENTS. A comment is whitespace to the CSS tokenizer, so the
    // prefix glued itself onto the selector after it and produced
    //   `body[data-theme="cozy-light"] body[data-theme="hearthlight"] #panel-profile *`
    // — two <body> elements in one descendant chain, which can never match.
    // That silently removed #panel-profile from the b174 readability blanket
    // for five builds. A selector that can never match is a bug either way:
    // either the rule is dead, or the thing it was meant to style is unstyled.
    const bad = [];
    for (const sheet of Array.from(document.styleSheets)) {
      const file = (sheet.href || '').split('/').pop().split('?')[0];
      if (!file) continue;
      let rules; try { rules = Array.from(sheet.cssRules); } catch { continue; }
      const walk = (list) => list.forEach((r) => {
        if (r.cssRules && !r.selectorText) { walk(Array.from(r.cssRules)); return; }
        if (!r.selectorText) return;
        r.selectorText.split(/,(?![^(]*\))/).forEach((sel) => {
          const s = sel.trim();
          // count `body` compounds that are separated by a combinator
          const bodies = (s.match(/(^|[\s>+~])body\b/g) || []).length;
          if (bodies > 1) bad.push(file + ' :: ' + s.slice(0, 90));
          if (/(^|[\s>+~])html\b[^,]*[\s>+~]html\b/.test(s)) bad.push(file + ' :: ' + s.slice(0, 90));
        });
      });
      walk(rules);
    }
    assert(bad.length === 0,
      bad.length + ' impossible selector chain(s) (two <body>/<html> in one descendant chain): ' + bad.slice(0, 2).join(' | '));
  }),

  () => tryRun('b222: the b174 blankets stay out of in-world surfaces', () => {
    // THE invariant that lets board-and-shop.css style parchment and lit counter
    // wood with ordinary declarations. theme-cozy.css's readability layer forces
    // `color: var(--ink) !important` across whole panels; that is right for a
    // dark UI card and wrong for a surface lit by its own picture, where cream
    // ink lands on cream paper (measured 2:1 on the shop's price tags before
    // b222). The blankets now carve these roots out. If a new blanket forgets
    // the carve-out, this fails BEFORE anyone starts stacking ids to fight it.
    //
    // Uses a synthetic fixture rather than navigating, so the check is the same
    // whichever screen the suite happens to be on.
    const prevTheme = document.body.getAttribute('data-theme');
    document.body.setAttribute('data-theme', 'hearthlight');
    const fixture = document.createElement('div');
    /* The bounty board and the IAP cards left in the 2026-10-14 demolition;
       the shop scene and counter are the in-world surfaces that remain. */
    fixture.innerHTML =
      '<section id="panel-shop" class="panel active">' +
        '<div class="sc-scene"><span>x</span></div>' +
        '<div class="sc-counter"><div class="shop-row"><div class="info"><b>x</b><span>x</span></div>' +
          '<span class="price"><span class="hr-amt">1</span></span></div><div class="sc-sep">x</div></div>' +
      '</section>';
    document.body.appendChild(fixture);
    try {
      const els = Array.from(fixture.querySelectorAll('*'));
      const offenders = [];
      for (const sheet of Array.from(document.styleSheets)) {
        const file = (sheet.href || '').split('/').pop().split('?')[0];
        if (!file || file === 'board-and-shop.css') continue;   // the sheet that OWNS these surfaces
        let rules; try { rules = Array.from(sheet.cssRules); } catch { continue; }
        const walk = (list) => list.forEach((r) => {
          if (r.cssRules && !r.selectorText) { walk(Array.from(r.cssRules)); return; }
          if (!r.selectorText || !r.style) return;
          if (r.style.getPropertyPriority('color') !== 'important') return;
          for (const el of els) {
            let hit = false;
            try { hit = el.matches(r.selectorText); } catch { return; }
            if (hit) {
              offenders.push(file + ' :: ' + r.selectorText.slice(0, 80) + '  →  ' +
                el.tagName.toLowerCase() + '.' + (el.getAttribute('class') || ''));
              return;
            }
          }
        });
        walk(rules);
      }
      assert(offenders.length === 0,
        offenders.length + ' !important colour rule(s) reach into an in-world surface — add the root to the b222 carve-out list in theme-cozy.css instead of stacking ids: ' +
        offenders.slice(0, 3).join(' | '));
    } finally {
      fixture.remove();
      if (prevTheme === null) document.body.removeAttribute('data-theme');
      else document.body.setAttribute('data-theme', prevTheme);
    }
  }),

  () => tryRun('b222: board-and-shop.css does not stack panel ids', () => {
    // Stacked ids (`#panel-shop#panel-shop#panel-shop`) are pure specificity
    // theatre — they buy nothing except the ability to out-shout a blanket, and
    // they hide the fact that a blanket is reaching somewhere it should not.
    // b222 took 35 of them down to exactly one, which is documented at its own
    // line. If this count grows, fix the blanket, not the specificity.
    let sheet = null;
    for (const s of Array.from(document.styleSheets)) {
      if ((s.href || '').indexOf('board-and-shop') >= 0) { sheet = s; break; }
    }
    if (!sheet) return;
    let rules; try { rules = Array.from(sheet.cssRules); } catch { return; }
    const stacked = [];
    const walk = (list) => list.forEach((r) => {
      if (r.cssRules && !r.selectorText) { walk(Array.from(r.cssRules)); return; }
      if (!r.selectorText) return;
      r.selectorText.split(/,(?![^(]*\))/).forEach((sel) => {
        if (/(#panel-[a-z-]+)\1/.test(sel.trim())) stacked.push(sel.trim().slice(0, 90));
      });
    });
    walk(rules);
    assert(stacked.length <= 1,
      stacked.length + ' stacked-id selector(s) in board-and-shop.css (b222 left exactly 1): ' + stacked.slice(0, 3).join(' | '));
  }),

  () => tryRun('b215: level 99 is actually reachable (XP table has all 99 rungs)', () => {
    // Regression: XP_TABLE was missing the level-98 threshold (11,805,606), so
    // it held 98 entries. levelFromXp() could never return 99 — the cap the
    // whole game is pitched around — and the skill header rendered
    // "13,034,431 / NaN" because XP_TABLE[98] was undefined.
    assert(typeof window.levelFromXp === 'function', 'levelFromXp exposed');
    assert(window.levelFromXp(13034431) === 99, 'max XP must be level 99, got ' + window.levelFromXp(13034431));
    assert(window.levelFromXp(11805606) === 98, '11,805,606 must be level 98, got ' + window.levelFromXp(11805606));
    if (typeof window.xpToNext === 'function') {
      const rem = window.xpToNext(13034431);
      assert(rem === 0, 'at 99 there is nothing left to earn, got ' + rem);
      assert(!Number.isNaN(rem), 'xpToNext must never be NaN at the cap');
    }
  }),

  () => tryRun('b215: no skill hits an endgame cliff — every ladder runs near 99', () => {
    // The design rule: a player should never be more than ~20 levels from the
    // next unlock in any skill, and every skill must have content past 85.
    // Before b215 woodcutting/mining stopped at 60, farming at 50, fishing at 76.
    const R = window.ARTISAN_RECIPES || {};
    const ladders = {
      woodcutting: (window.TREES || []).map(t => t.req),
      mining:      (window.ROCKS || []).map(t => t.req),
      fishing:     (window.FISH_SPOTS || []).map(t => t.req),
      farming:     Object.values(window.CROPS || {}).map(c => c.req),
      cooking:     (R.cooking || []).map(r => r.req),
      smithing:    (R.smithing || []).map(r => r.req),
      crafting:    (R.crafting || []).map(r => r.req),
    };
    Object.entries(ladders).forEach(([skill, reqsRaw]) => {
      const reqs = reqsRaw.filter(n => typeof n === 'number').sort((a, b) => a - b);
      assert(reqs.length > 0, skill + ' has no unlocks at all');
      const top = reqs[reqs.length - 1];
      assert(top >= 85, skill + ' tops out at Lv ' + top + ' — endgame cliff before 99');
      let prev = 1, gap = 0;
      reqs.forEach(r => { if (r - prev > gap) gap = r - prev; prev = Math.max(prev, r); });
      assert(gap <= 20, skill + ' has a ' + gap + '-level gap with nothing new to do');
    });
  }),

  () => tryRun('b215: gear ladder is complete — every armour slot at every tier', () => {
    // The generator in src/data/gear-tiers.js must actually reach ITEMS, and a
    // player must be able to complete a set at any tier (armour used to stop
    // dead at steel, with pants/gloves/belt missing entirely).
    const I = window.ITEMS || {};
    const tiers = ['bronze', 'iron', 'steel', 'mithril', 'rune', 'ember', 'dawn'];
    const slots = ['helm', 'platebody', 'platelegs', 'boots', 'gauntlets', 'belt'];
    tiers.forEach(t => slots.forEach(s => {
      const id = t + '_' + s;
      assert(I[id], 'missing gear piece ' + id);
      assert(typeof I[id].defB === 'number' && I[id].defB > 0, id + ' has no defence value');
    }));
    // Defence must strictly increase with tier so an upgrade is never a downgrade.
    slots.forEach(s => {
      for (let i = 1; i < tiers.length; i++) {
        const lo = I[tiers[i - 1] + '_' + s].defB, hi = I[tiers[i] + '_' + s].defB;
        assert(hi > lo, tiers[i] + '_' + s + ' (' + hi + ') must beat ' + tiers[i - 1] + '_' + s + ' (' + lo + ')');
      }
    });
    // Every weapon family runs the full ladder too.
    ['sword', 'warhammer', 'bow', 'staff'].forEach(fam => {
      const found = Object.values(I).filter(it => it && it.type === 'weapon' && it.tier);
      assert(found.length >= 20, 'expected a full weapon ladder, found ' + found.length + ' tiered weapons');
    });
  }),

  () => tryRun('b215: ESM data reaches the legacy engine (one dataset, not two)', () => {
    // The engine's bare `ITEMS[...]` refs resolve to legacy.js's lexical const.
    // main.js merges the ESM data INTO that same object, so both are one
    // identity — otherwise content authored in src/data/*.js is invisible to
    // 10k lines of engine code (that's how mountain_troll went missing).
    const L = window.__LEGACY_INLINE;
    if (!L) return;   // older cached legacy.js
    assert(L.ITEMS === window.ITEMS, 'legacy ITEMS and window.ITEMS must be the same object');
    assert(L.MONSTERS === window.MONSTERS, 'legacy MONSTERS and window.MONSTERS must be the same object');
    assert(L.TREES === window.TREES, 'legacy TREES and window.TREES must be the same array');
    // and the merge actually carried the new content across
    assert(window.ITEMS.dawn_platebody, 'generated gear must be visible to the engine');
    assert((window.TREES || []).some(t => t.id === 'duskwood_tree'), 'new gathering nodes must reach the engine');
  }),



  () => tryRun('b214: an absence is granted exactly ONCE — the catch-up calculators are DISPLAY-ONLY', () => {
    /* THE REGRESSION: three systems read `G.lastSeen` and all three granted —
       `processOffline()` at 100% plus `_applyCatchup()` and `applyRichCatchup()`
       at 50% each, with `lastSeen` never refreshed between them. Every returning
       gatherer banked 2-3x their offline yield.

       b515 — THE GRANTING SYSTEM IS GONE. processOffline no longer grants
       anything (it asks hr-accrue and applies the envelope), so the ONE payer is
       the server.

       b516 — THIS GUARD IS NOW INVERTED, AND THAT IS THE POINT. Until b516 it
       asserted that `_applyCatchup` was merely UNCALLED, and its own note filed
       the residue as P3: "dead client-authored mint with no call site; it should
       be deleted, not merely unreferenced." It has been. `calcCatchup`,
       `window._catchupCalc` and `window._applyCatchup` no longer exist, so the
       property to hold is no longer "they calculate without crediting" — it is
       THEY MUST NOT EXIST. An unreferenced global is still a capability: the
       applier called `addXp`/`addItem` off a device-clock estimate, and anything
       able to run one line in the page (devtools, a bookmarklet, a future line
       of glue) could dial it. Absence is the only state that cannot be dialled.

       WHAT IS STILL ASSERTED, AND WHY BOTH HALVES ARE HERE:
         (a) neither name is back on `window` — the capability;
         (b) the welcome modal still quotes the RECEIPT (`lastOfflineSummary`)
             and never a catch-up CALCULATOR — the wire. `calcRichCatchup` is
             still published and still pure, so the caller is what must not
             exist, exactly as before.

       MUTATIONS (both proved, b516):
         · re-add `window._applyCatchup = function(){}` to legacy.js → (a) red.
         · put `calcCatchup()` back into __maybeShowWelcome        → (b) red. */
    const snap = snapshotG();
    try {
      const G = window.G;
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree';
      G.inventory = {};
      setAway(2);                            // 2h away — the fixture that used to mint +1,200 logs

      /* ── (a) THE CAPABILITY IS GONE, NOT MERELY UNUSED ────────────────────
         Named one at a time so a red says WHICH one came back. `_applyCatchup`
         is the one that credited; `_catchupCalc` is the estimate it was fed,
         and it is refused too because a lone estimator is how the pair grows
         back. Deleted in b516 (src/legacy.js section 3 carries the tombstone). */
      for (const name of ['_applyCatchup', '_catchupCalc']) {
        assert(!(name in window),
          '`window.' + name + '` is back (typeof ' + (typeof window[name]) + '). b516 DELETED the '
          + 'client-side catch-up estimator and its crediting applier: the pair reads the DEVICE clock, '
          + 'invents an absence and pays it through addXp/addItem, which is a client authoring progression '
          + '(CLAUDE.md \u00a71) and the b214 double-pay. Unreferenced is not unreachable — anything that '
          + 'can run one line in this page can call it. If an offline estimate is wanted, read the server '
          + 'RECEIPT (G.lastOfflineSummary); do not re-add a second opinion.');
      }
      assert(JSON.stringify(G.inventory) === '{}',
        'the 2h-away fixture credited items on its own: ' + JSON.stringify(G.inventory)
        + ' — something still grants an absence client-side');

      /* ── (b) AND THE WIRE STILL CANNOT BE RE-ATTACHED ─────────────────────
         `calcRichCatchup` IS still published (`window._calcRichCatchup`) and is
         still pure — it is the modal's numbers. So the property that survives
         deletion is about the CALLER: the welcome modal must quote the RECEIPT
         the server wrote, never a catch-up calculator. This is the wire b342
         cut; re-attaching any of these names recreates the double-SPEAK, and
         (with a crediting applier) the b214 double-PAY. */
      const rawModal = String(window.__maybeShowWelcome || '');
      assert(rawModal.length > 200,
        'the welcome modal is not reachable under __maybeShowWelcome — this guard would be vacuous');
      /* COMMENTS STRIPPED FIRST, and the reason is worth a line: this function
         carries a long b342 note that NAMES `calcCatchup()` as the thing it
         stopped quoting. A bare source match would fail on the explanation of
         the fix, which is the worst kind of red — it teaches the next reader to
         delete the comment. What is being asserted is a CALL, so what is
         searched is code. */
      const modalSrc = rawModal.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
      assert(/lastOfflineSummary/.test(modalSrc),
        'the welcome-back modal no longer reads `lastOfflineSummary` — the RECEIPT the server actually '
        + 'wrote. Whatever it reads instead is a second estimate of the same night.');
      assert(!/(calcCatchup|_catchupCalc|_applyCatchup|_calcRichCatchup|applyRichCatchup)\s*\(/.test(modalSrc),
        'the welcome-back modal is quoting a catch-up CALCULATOR again. b214 stopped it double-PAYING, '
        + 'b342 stopped it double-SPEAKING and b516 deleted the crediting pair outright. The modal has '
        + 'exactly one source for the absence — `G.lastOfflineSummary`, the receipt the server wrote. A '
        + 'second estimate is a second answer to one question, and it is wrong on every absence that '
        + 'ended in a death or hit the cap.');
    } finally { restoreG(snap); }
  }),


  () => tryRun('b214: no PvE loot table mints the premium hearth_token', () => {
    // hearth_token was the IAP-only bond. Every dungeon used to drop it at
    // chance 1.0, minting real-money currency from PvE. The dungeons left in the
    // 2026-10-14 demolition; the monster tables are the PvE loot that remains.
    const M = window.MONSTERS;
    assert(M && Object.keys(M).length > 0, 'CONTROL: no monster table to scan');
    Object.entries(M).forEach(([id, m]) => {
      (m.drops || []).forEach((d) => {
        assert(d.id !== 'hearth_token', 'monster ' + id + ' must not drop hearth_token (premium currency is never a PvE drop)');
      });
    });
    assert(Object.keys(window.DUNGEONS || {}).length === 0, 'the demolished dungeon table has rows again');
  }),

  /* THE WAVE1 ARTISAN BENCH-LOCK TEST WAS RETIRED HERE, NOT SILENCED. Its
     subject — the tile's "Build the Forge" padlock — was removed on
     2026-09-07 when the designer ruled that a room sells speed and a level
     sells permission, so the test name was a contract asserting the opposite
     of the shipped rule (it had already been a bare skip since SA-013: the
     live builder, legacy.js tileForArtisan, is not exposed as a test seam).
     What replaced it is the derived rule test in the homestead block plus the
     played happy path beside it. The seam-exposure debt itself is still real
     and still routed to Systems — see the gather twin immediately below. */
  () => tryRun('WAVE1: gather tile names the active tool and its bonus', () => {
    // Tyler: "the fishing rod doesn't seem to do anything." The rod worked but was
    // never surfaced. The tile must now name the tool + its speed bonus.
    /* SA-013: same shape as the WAVE1 artisan test above — the tool-line feature
       (at-tool / speed bonus) lives ONLY in legacy.js's tileForGather (the live
       builder), which is not exposed as a test seam; the published
       HearthriseActivitiesGrid.__tileForGather dead twin does not implement it.
       Skip honestly and route the seam-exposure to Systems rather than assert
       against absent-by-design code or leave the old silent early-return. */
    skip('live tile builder (legacy.js tileForGather) not exposed as a test seam; module twin is a known-incomplete dead twin — routed to Systems');
    return;
  }),

  () => tryRun('WAVE1: fight preview shows the REAL drop chance, not "1x common"', () => {
    // The loot rows read d.chance/d.qty which monster drops never have, so every
    // drop rendered as "common". Now they read d.ch and show a real percentage.
    if (typeof window.__lootRowHtml !== 'function') return;
    const html = window.__lootRowHtml({ id: 'bones', ch: 0.25 });
    // The old bug rendered the literal chance text "common"; now it must show a
    // real percentage. (The band CSS class mp-common is fine — check the number.)
    assert(/25%/.test(html), 'a ch:0.25 drop must render "25%", got: ' + html);
    assert(!/>\s*1×\s*·\s*common\s*</.test(html), 'must not fall back to the "1× · common" meta');
    const rare = window.__lootRowHtml({ id: 'bones', ch: 0.01 });
    assert(/mp-rare/.test(rare) && /1%|1\.0%/.test(rare), 'a 1% drop must band as rare with its real %');
    const always = window.__lootRowHtml({ id: 'bones', ch: 1 });
    assert(/Always/.test(always), 'a guaranteed drop must read "Always"');
  }),

  () => tryRun('WAVE1: fight-preview forecast uses the real engine rolls', () => {
    // estimateCombat used a divergent formula, so pre-fight DPS/kills were fiction.
    // It must now agree with getPlayerCombatRolls on maxHit.
    if (typeof window.__estimateCombat !== 'function' || typeof window.getPlayerCombatRolls !== 'function') return;
    const m = window.MONSTERS && (window.MONSTERS.slime || Object.values(window.MONSTERS)[0]);
    if (!m) return;
    const est = window.__estimateCombat(m);
    const real = window.getPlayerCombatRolls(m);
    assert(est.maxHit === real.maxHit,
      'preview maxHit (' + est.maxHit + ') must equal the engine maxHit (' + real.maxHit + ')');
    assert(Math.abs(est.hitChance - real.accuracy) < 1e-9,
      'preview hit-chance must equal the engine accuracy');
  }),


  () => tryRun('WAVE2: the damage food buff actually raises max hit (Cooked Shark honest)', () => {
    const G = window.G;
    if (typeof window.applyBuff !== 'function' || typeof window.getPlayerCombatRolls !== 'function') return;
    const m = window.MONSTERS && (window.MONSTERS.slime || Object.values(window.MONSTERS)[0]);
    if (!m) return;
    const snap = { buffs: JSON.parse(JSON.stringify(G.buffs || [])), skills: JSON.parse(JSON.stringify(G.skills || {})) };
    try {
      G.buffs = [];
      /* b492 — 300,000 xp, not 50. The comment beside this line has always said
         "maxHit big enough for a % to move it"; 50 xp is LEVEL 1, and the test
         only ever passed because the ambient boot state happened to carry the
         fresh-G literal's starter bronze sword, whose strength bonus supplied
         the headroom. It was measuring gear, not the skill it sets.
         That accident is gone: under the blob-retire capstone `loadLocal()` now
         forgets every server-of-record field (equipment included), so an
         un-hydrated harness wears nothing — which is the honest state and is the
         whole point of the b492 fix. Setting a REAL strength level makes the
         assertion depend on the thing in its own name. */
      G.skills = Object.assign({}, G.skills, { strength: 300000, attack: 300000 });
      const before = window.getPlayerCombatRolls(m).maxHit;
      window.applyBuff({ type: 'damage', magnitude: 25, durationMs: 600000 }); // +25%
      const after = window.getPlayerCombatRolls(m).maxHit;
      assert(after > before, 'a damage buff must raise max hit (before ' + before + ', after ' + after + ')');
    } finally { G.buffs = snap.buffs; G.skills = snap.skills; }
  }),

  () => tryRun('WAVE2: turnip has a cooking recipe (was the only dead-end crop)', () => {
    const R = window.ARTISAN_RECIPES && window.ARTISAN_RECIPES.cooking;
    if (!R) return;
    const r = R.find(x => x.id === 'cook_turnip');
    assert(r, 'cook_turnip recipe must exist');
    const inputs = r.inputs || (r.input ? { [r.input]: 1 } : {});
    assert(inputs.turnip, 'cook_turnip must consume turnip');
    assert(window.ITEMS && window.ITEMS[r.output], 'cook_turnip output item must exist: ' + r.output);
  }),


  () => tryRun('WAVE3: tools grant tier-scaled XP + double, for gathering AND artisan', () => {
    const T = window.HearthriseTools, G = window.G;
    if (!T || typeof T.bestToolXpB !== 'function') return;
    const snap = { inv: JSON.parse(JSON.stringify(G.inventory || {})) };
    try {
      G.inventory = Object.assign({}, G.inventory, { rune_axe: 1, rune_hammer: 1 });
      assert(Math.abs(T.bestToolXpB('woodcutting') - 0.10) < 1e-9, 'rune axe (T5) → +10% woodcutting XP, got ' + T.bestToolXpB('woodcutting'));
      assert(Math.abs(T.bestToolDouble('woodcutting') - 0.10) < 1e-9, 'rune axe (T5) → 10% double, got ' + T.bestToolDouble('woodcutting'));
      // artisan tools now count too
      assert(T.bestToolSpeed('smithing') > 0, 'a Rune Hammer must apply tool speed to smithing');
      assert(Math.abs(T.bestToolDouble('smithing') - 0.10) < 1e-9, 'a Rune Hammer (T5) → 10% double-craft');
    } finally { G.inventory = snap.inv; }
  }),


  () => tryRun('WAVE3: a gathering tool deterministically adds extra yield over time', () => {
    // The double is a fractional carry (no RNG), so N actions with a 10% tool grant
    // ~N*0.1 extra — testable silently and byte-identical offline.
    const G = window.G;
    if (typeof window.doSkillAction !== 'function' || !window.TREES || !window.HearthriseTools) return;
    const node = window.TREES.find(t => t.qty[0] === 1 && t.qty[1] === 1) || window.TREES[0];
    const snap = { inv: JSON.parse(JSON.stringify(G.inventory || {})), skills: JSON.parse(JSON.stringify(G.skills || {})), as: G.activeSkill, tid: G.skillTargetId, carry: G.toolCarry };
    try {
      G.toolCarry = {};
      G.inventory = Object.assign({}, G.inventory, { rune_axe: 1 }); delete G.inventory[node.prod];
      G.skills = Object.assign({}, G.skills, { woodcutting: 5000000 });
      G.activeSkill = 'woodcutting'; G.skillTargetId = node.id;
      for (let i = 0; i < 10; i++) window.doSkillAction(true);   // silent: no timers, no RNG
      const gained = (G.inventory[node.prod] || 0);
      // 10 base + floor(10 * 0.10) = 11 for a T5 (rune) tool
      assert(gained === 11, '10 actions with a 10% tool must yield 11 (got ' + gained + ')');
    } finally { G.inventory = snap.inv; G.skills = snap.skills; G.activeSkill = snap.as; G.skillTargetId = snap.tid; G.toolCarry = snap.carry; }
  }),

  () => tryRun('WAVE5: weapon family sets attack speed — warhammer slow, bow fast', () => {
    const G = window.G;
    if (typeof window.combatTickMs !== 'function' || !window.ITEMS) return;
    if (!window.ITEMS.rune_sword || !window.ITEMS.rune_warhammer || !window.ITEMS.longbow) return;
    const snap = { eq: JSON.parse(JSON.stringify(G.equipment || {})) };
    try {
      /* b456: `equipment` is server-of-record, so every stat read goes through
         equipmentMap() and a raw `G.equipment = …` is UNKNOWN → the fail-closed
         EMPTY set, i.e. NAKED. All three swings then measured the unarmed 2400ms
         and the comparison was between a number and itself. Each worn set is
         stamped through the real hr_load path. */
      G.equipment = Object.assign({}, G.equipment, { weapon: 'rune_sword' });
      stampRecordLikeLoad(G);
      const swordMs = window.combatTickMs();
      G.equipment = Object.assign({}, G.equipment, { weapon: 'rune_warhammer' });
      stampRecordLikeLoad(G);
      const hammerMs = window.combatTickMs();
      G.equipment = Object.assign({}, G.equipment, { weapon: 'longbow' });
      stampRecordLikeLoad(G);
      const bowMs = window.combatTickMs();
      assert(hammerMs > swordMs, 'a warhammer must swing slower than a sword (' + hammerMs + ' vs ' + swordMs + ')');
      assert(bowMs < swordMs, 'a bow must swing faster than a sword (' + bowMs + ' vs ' + swordMs + ')');
    } finally { G.equipment = snap.eq; stampRecordLikeLoad(G); }
  }),

  () => tryRun('WAVE5b: weapon accuracy (atkB) matters vs high-tier DEF, low tiers unchanged', () => {
    const G = window.G;
    if (typeof window.getPlayerCombatRolls !== 'function' || !window.MONSTERS || !window.ITEMS) return;
    if (!window.ITEMS.dawn_sword || !window.ITEMS.bronze_sword) return;
    const t6 = Object.values(window.MONSTERS).filter(m => m.tier === 6).sort((a, b) => (b.def || 0) - (a.def || 0))[0];
    const t1 = Object.values(window.MONSTERS).find(m => m.tier === 1);
    if (!t6) return;
    const snap = { eq: JSON.parse(JSON.stringify(G.equipment || {})), skills: JSON.parse(JSON.stringify(G.skills || {})) };
    try {
      G.skills = Object.assign({}, G.skills, { attack: 5000000, strength: 5000000 }); // XP → level 99
      // b456: skills AND equipment are both server-of-record — stamp each position.
      G.equipment = Object.assign({}, G.equipment, { weapon: 'bronze_sword' });  // atkB 4
      stampRecordLikeLoad(G);
      const lowAcc = window.getPlayerCombatRolls(t6).accuracy;
      G.equipment = Object.assign({}, G.equipment, { weapon: 'dawn_sword' });    // atkB 42
      stampRecordLikeLoad(G);
      const highAcc = window.getPlayerCombatRolls(t6).accuracy;
      assert(highAcc > lowAcc, 'a high-atkB weapon must land more often vs a tier-6 boss (' + highAcc.toFixed(2) + ' vs ' + lowAcc.toFixed(2) + ')');
      if (t1) {
        G.equipment = Object.assign({}, G.equipment, { weapon: 'bronze_sword' });
        stampRecordLikeLoad(G);
        assert(window.getPlayerCombatRolls(t1).accuracy >= 0.9, 'tier-1 accuracy must stay high (early game unchanged)');
      }
    } finally { G.equipment = snap.eq; G.skills = snap.skills; stampRecordLikeLoad(G); }
  }),

  () => tryRun('WAVE5c: a full same-tier armour set grants a crit passive', () => {
    const G = window.G;
    if (typeof window.getArmorSetBonus !== 'function' || !window.ITEMS) return;
    const set = ['dawn_helm', 'dawn_platebody', 'dawn_platelegs', 'dawn_boots', 'dawn_gauntlets', 'dawn_belt'].filter(id => window.ITEMS[id]);
    if (set.length < 5) return;
    const slots = { dawn_helm: 'helmet', dawn_platebody: 'body', dawn_platelegs: 'pants', dawn_boots: 'boots', dawn_gauntlets: 'gloves', dawn_belt: 'belt' };
    const snap = { eq: JSON.parse(JSON.stringify(G.equipment || {})) };
    try {
      G.equipment = {};
      set.forEach(id => { G.equipment[slots[id] || window.ITEMS[id].slot] = id; });
      stampRecordLikeLoad(G);   // b456: the set only counts if it came off the record
      const sb = window.getArmorSetBonus();
      assert(sb && sb.pieces >= 5, 'a full dawn set must register (got ' + (sb && sb.pieces) + ')');
      assert(sb.tier === 7 && Math.abs(sb.critB - 0.07) < 1e-9, 'dawn (tier 7) set → +7% crit, got ' + (sb && sb.critB));
      // the crit passive must reach the combat rolls
      const m = window.MONSTERS && Object.values(window.MONSTERS)[0];
      if (m) assert(window.getPlayerCombatRolls(m).critChance >= 0.07, 'the set crit must flow into getPlayerCombatRolls');
      const pct = Math.round(window.getPlayerCombatRolls(m).critChance * 100);   // the engine's number
      const setLine = (window.renderEquipmentStatsHTML().match(/class="eqb-set">([\s\S]*?)<\/div>/) || [])[1] || '';
      assert(setLine, 'the set line must render for a stamped full set');
      assert(/Dawnsteel set/.test(setLine) && !/Tier \d/.test(setLine), 'set line names the worn line, never "Tier N": ' + setLine);
      assert(setLine.indexOf('+' + pct + '% crit') !== -1, 'set line % must equal the engine delta');
      assert(Math.abs(window.getPlayerCritChance() - window.getPlayerCombatRolls(m).critChance) < 1e-9, 'the display seam IS the engine number');
      window.renderLoadout(); assert((document.querySelector('#loadout-panel .stat-grid') || {}).textContent.indexOf(pct + '%') !== -1, 'Combat loadout crit is the engine number');
      const pane = window._charPane; window._charPane = 'hero'; window.renderCharacter(); window._charPane = pane;
      assert((document.querySelector('#panel-character .cr-style-stats') || {}).textContent.indexOf(pct + '%') !== -1, 'Character card crit is the engine number');
      window.renderInvFancy(); const inv = (document.getElementById('panel-inventory') || {}).innerHTML || '';
      assert(new RegExp('Crit Chance</span><b>' + pct + '%').test(inv) && !/Damage Reduction/.test(inv), 'Inventory crit is the engine number; no fabricated Damage Reduction row');
      const W = { helmet: 'watchknight_helmet', body: 'watchknight_body', pants: 'watchknight_pants', boots: 'watchknight_boots', gloves: 'watchknight_gloves', belt: 'watchknight_belt' };
      assert(window.armourSetLabel({ tier: 5, armourClass: 'plate', pieces: 6 }, W, window.ITEMS) === 'Watchknight set', 'a shared bucket names the WORN line, never Rune');
      assert(window.armourSetLabel({ tier: 1, armourClass: 'plate', pieces: 6 }, { helmet: 'bronze_helm', body: 'bronze_platebody', pants: 'bronze_platelegs', belt: 'bronze_belt', boots: 'leather_boots', gloves: 'leather_gloves' }, window.ITEMS) === 'tier-1 heavy set', 'a mixed bucket falls back to class + tier');
      delete G.equipment.belt; delete G.equipment.gloves;
      stampRecordLikeLoad(G);
      assert(!window.getArmorSetBonus(), 'a 4-piece set must NOT trigger the bonus');
    } finally { G.equipment = snap.eq; stampRecordLikeLoad(G); }
  }),


  () => tryRun('b289: CROSS-DEVICE ROUND TRIP — save on device A, restore on device B, nothing lost or re-granted', () => {
    // The definitive test for paione's report. Simulates the actual journey:
    // play on phone -> snapshot to cloud -> sign in on tablet (fresh G) -> restore
    // via the REAL restore path (Object.assign, auth.js pullAndMaybeRestore) and
    // assert (a) progress survived and (b) SPENT COOLDOWNS ARE STILL SPENT.
    const ev = window.HearthriseEvents;
    if (!ev || typeof ev.snapshot !== 'function') return;
    const G = window.G;
    const snapSaved = snapshotG();
    try {
      const DAY = 'test-day-key';
      // --- DEVICE A: a played account ---
      G.bestiary = { slime: { kills: 42 } };
      G.quests = [{ id: 'q1', progress: 7, done: false }];
      G.daily = { lastReset: DAY, tasks: [{ id: 'd1', progress: 3 }] };
      G.streak = { days: 5, lastClaimDayKey: DAY };      // daily reward ALREADY claimed
      G.collection = { bones: 12 };
      G.traits = { autoEat: true };                      // PURCHASED with gold
      G.homestead = { tier: 4 };

      const cloud = JSON.parse(JSON.stringify(ev.snapshot(G)));   // what reaches the server

      // --- DEVICE B: a fresh install signs in ---
      ['bestiary', 'quests', 'daily', 'streak', 'collection', 'traits', 'homestead']
        .forEach((k) => { delete G[k]; });
      Object.assign(G, cloud);                            // the real restore path (auth.js)

      // (a) progress survived
      assert(G.bestiary && G.bestiary.slime.kills === 42, 'Bestiary must survive the restore');
      assert(G.quests && G.quests[0].progress === 7, 'Quest progress must survive');
      assert(G.collection && G.collection.bones === 12, 'Collection log must survive');
      assert(G.traits && G.traits.autoEat === true, 'Purchased traits must survive (paid with gold)');
      assert(G.homestead && G.homestead.tier === 4, 'Homestead/castle tier must survive');

      /* (b) THE EXPLOIT: spent cooldowns must still be spent on the new device. The
         DUNGEON half left this list when the window became a SERVER fact (see
         DGN-COOLDOWN-1) — there is no client field left to carry across. */
      assert(G.streak && G.streak.lastClaimDayKey === DAY,
        'daily-reward claim must carry over — otherwise switching device re-grants it');
      assert(G.daily && G.daily.lastReset === DAY, 'daily task state must carry over');
    } finally { restoreG(snapSaved); }
  }),

  () => tryRun('b288: the cloud snapshot carries progress AND cooldowns (paione: cross-device reset/exploit)', () => {
    // paione: "some stuff is not reloaded through the cloud — Bestiary,
    // Achievements, new quests and daily login bonus, Dungeon times are reset,
    // Clan boss can be re-attacked". The snapshot was a 17-field ALLOWLIST while G
    // carries ~40, so unlisted state never synced: data loss AND, wherever the
    // unlisted field was a claim marker, an economy exploit on every new device.
    const ev = window.HearthriseEvents;
    assert(ev && typeof ev.snapshot === 'function', 'HearthriseEvents.snapshot missing');
    const G = window.G;
    const snap = ev.snapshot(G);
    assert(snap, 'snapshot must produce a payload');
    // Everything a second device must not lose or be re-granted.
    /* `wieldGrandfather` left this list with the field itself — a client-held gear
       permission the realm never had; nothing crosses devices by its absence. */
    ['bestiary', 'quests', 'daily', 'collection', 'traits',
      'streak', 'lockedItems', 'offlineBudget', 'homestead', 'v']
      .forEach((k) => {
        if (G[k] === undefined) return;                 // field not present in this save
        assert(k in snap, 'cloud snapshot must carry "' + k + '" or a second device loses/re-earns it');
      });
    // Device-local in-flight state must NOT cross devices.
    ['activeMonster', 'monsterHp', 'combatLog', 'activeSkill'].forEach((k) => {
      assert(!(k in snap), '"' + k + '" is device-local and must not sync');
    });
  }),

  () => tryRun('b287: no visible control calls a function that does not exist (dead-button guard)', () => {
    // The recurring defect in this codebase: a handler calls a global that was never
    // exported, so the button looks fine and silently does nothing (quest strip,
    // bounty repaint, stopSkill, combatXP, and the Clan "Sign in" all shipped so).
    assert(typeof window.hrPromptSignIn === 'function', 'the shared sign-in opener must exist');
    const RESERVED = /^(if|for|while|switch|return|typeof|function|catch|new|do|else|delete|void)$/;
    const dead = [];
    document.querySelectorAll('[onclick]').forEach((el) => {
      if (!el.getBoundingClientRect().width) return;               // visible controls only
      const code = el.getAttribute('onclick') || '';
      [...code.matchAll(/([A-Za-z_$][\w$.]*)\s*\(/g)].map((m) => m[1]).forEach((path) => {
        if (RESERVED.test(path)) return;
        let ref = window;
        for (const p of path.replace(/^window\./, '').split('.')) { if (ref == null) break; ref = ref[p]; }
        if (typeof ref !== 'function') dead.push(path + '() on "' + (el.textContent || '').trim().slice(0, 16) + '"');
      });
    });
    assert(dead.length === 0, 'controls calling missing functions: ' + [...new Set(dead)].slice(0, 6).join(', '));
  }),


  () => tryRun('b283: armour set bonus requires same ARCHETYPE + tier (no mixed-loadout trigger)', () => {
    const G = window.G;
    if (typeof window.getArmorSetBonus !== 'function' || !window.ITEMS) return;
    const snap = { eq: JSON.parse(JSON.stringify(G.equipment || {})) };
    try {
      // 3 dawn plate + 2 dawn cloth: 5 same-tier pieces, but only 3 of one class → NO set.
      if (window.ITEMS.dawn_helm && window.ITEMS.archmage_body) {
        /* b456: the set is read through equipmentMap() — an unstamped worn set is
           UNKNOWN → naked, which makes the NEGATIVE leg pass for the wrong reason
           and the POSITIVE leg impossible. Both positions are stamped. */
        G.equipment = { helmet: 'dawn_helm', body: 'dawn_platebody', pants: 'dawn_platelegs', gloves: 'archmage_gloves', belt: 'apprentice_belt' };
        stampRecordLikeLoad(G);
        const mixed = window.getArmorSetBonus();
        assert(!mixed || mixed.pieces < 5, 'a mixed-archetype loadout must NOT grant a set bonus');
        // a full same-class set still triggers
        G.equipment = { helmet: 'dawn_helm', body: 'dawn_platebody', pants: 'dawn_platelegs', boots: 'dawn_boots', gloves: 'dawn_gauntlets' };
        stampRecordLikeLoad(G);
        const set = window.getArmorSetBonus();
        assert(set && set.armourClass === 'plate' && set.pieces >= 5, 'a full same-class set must still grant the bonus');
      }
    } finally { G.equipment = snap.eq; stampRecordLikeLoad(G); }
  }),

  () => tryRun('b283: the Character card reads attack per active style (plate warrior not dragged negative)', () => {
    // getEquipmentTotals keeps atkB / rangeAtkB / magicAtkB as SEPARATE fields, and
    // character-page reads the active style's field — so a melee warrior in plate
    // (which carries a magicAtkB penalty) never sees that penalty in their Attack.
    if (typeof window.getEquipmentTotals !== 'function') return;
    const fields = window.getEquipmentTotals().fields.map(f => f[0]);
    assert(fields.includes('atkB') && fields.includes('magicAtkB') && fields.includes('rangeAtkB'),
      'attack must be reported per style, never merged into one total');
  }),

  () => tryRun('b282: leather/cloth armour never borrows PLATE art (no wrong-silhouette icon)', () => {
    // Tyler: "hovering an item shows a completely different asset." The auto-mapper's
    // '_helm'/'belt' suffix match was painting cloth mage-hats + leather coifs as an
    // iron plate helm. Only the plate line may borrow the plate SLOT_ART now.
    if (typeof window.__mapGeneratedGearIcons !== 'function' || !window.ITEMS) return;
    window.__mapGeneratedGearIcons();
    const P = window._itemPath || {};
    ['apprentice_helmet', 'leather_helmet', 'archmage_helmet', 'dragonhide_helmet'].forEach(id => {
      if (window.ITEMS[id]) assert(!/(_helm|platebody|_platebody)\.png/.test(P[id] || ''),
        id + ' (leather/cloth) must not borrow plate art, got: ' + (P[id] || '(none)'));
    });
    // the plate line still resolves to its plate art
    if (window.ITEMS.bronze_helm) assert(/helm/.test(P.bronze_helm || ''), 'plate helm must still map to plate art');
  }),

  () => tryRun('WAVE-armor: the combat triangle — cloth boosts magic accuracy, plate penalises it', () => {
    const G = window.G, I = window.ITEMS;
    if (typeof window.getPlayerCombatRolls !== 'function' || !I) { skip('getPlayerCombatRolls / ITEMS seam absent'); return; }
    if (!I.dawn_platebody || !I.archmage_body || !I.dragonhide_body) { skip('combat-triangle body archetypes absent from ITEMS'); return; }
    // SA-013: this test used to gate on `dawn_staff`, an item id that is NOT in
    // ITEMS — so the whole test silently early-returned and asserted nothing.
    // Discover a real magic staff at runtime instead, so the mechanic is actually
    // exercised and a future staff rename cannot re-break it.
    const staffId = Object.keys(I).find((k) => /staff/i.test(k) && I[k] && I[k].slot === 'weapon');
    if (!staffId) { skip('no magic staff weapon in ITEMS to exercise the triangle'); return; }
    // archetype data is present
    assert(I.archmage_body.armourClass === 'cloth' && I.dawn_platebody.armourClass === 'plate', 'armourClass must be set');
    assert(I.archmage_body.magicAtkB > 0 && I.dawn_platebody.magicAtkB < 0, 'cloth +magicAtkB, plate -magicAtkB');
    assert(I.dragonhide_body.rangeAtkB > 0, 'leather must boost ranged accuracy');
    assert(I.archmage_body.defB < I.dawn_platebody.defB, 'cloth must have less defence than plate');
    // and it flows through combat: a mage lands more often in cloth than plate vs a high-DEF foe
    const m = Object.values(window.MONSTERS || {}).filter(x => x.tier >= 5).sort((a, b) => (b.def || 0) - (a.def || 0))[0];
    if (!m) { skip('no tier-5+ monster to test accuracy against'); return; }
    const snap = { eq: JSON.parse(JSON.stringify(G.equipment || {})), skills: JSON.parse(JSON.stringify(G.skills || {})) };
    try {
      G.skills = Object.assign({}, G.skills, { magic: 5000000, defense: 5000000 });
      G.equipment = { weapon: staffId, body: 'archmage_body' };
      const clothAcc = window.getPlayerCombatRolls(m).accuracy;
      G.equipment = { weapon: staffId, body: 'dawn_platebody' };
      const plateAcc = window.getPlayerCombatRolls(m).accuracy;
      assert(clothAcc > plateAcc, 'a mage must land more often in cloth than plate (' + clothAcc.toFixed(2) + ' vs ' + plateAcc.toFixed(2) + ')');
    } finally { G.equipment = snap.eq; G.skills = snap.skills; }
  }),




  () => tryRun('WAVE4b: every combat drop has a downstream use (no dead-end loot)', () => {
    const I = window.ITEMS, M = window.MONSTERS, AR = window.ARTISAN_RECIPES;
    if (!I || !M || !AR) return;
    // Everything that drops from a monster (the dungeons left on 2026-10-14).
    const drops = new Set();
    Object.values(M).forEach(m => (m.drops || []).forEach(d => drops.add(d.id)));
    /* A room rung or a property tier that costs the item is a use too: the
       castle goods and trophies (wolf_pelt, dragon_gem, ancient_rune) are
       spent on the House, not at a bench (designer ruling 2026-10-14 §3). */
    const usedAsCost = new Set();
    Object.values(window.ROOMS || {}).forEach((r) => (r.levels || []).forEach((lv) => Object.keys(lv.cost || {}).forEach((k) => usedAsCost.add(k))));
    ((window.HearthriseHomestead && window.HearthriseHomestead.TIERS) || []).forEach((t) => Object.keys((t && t.cost) || {}).forEach((k) => usedAsCost.add(k)));
    // Everything consumed as a recipe input.
    const usedAsInput = new Set();
    Object.values(AR).forEach(list => (list || []).forEach(r => {
      const ins = r.inputs || (r.input ? { [r.input]: 1 } : {});
      Object.keys(ins).forEach(k => usedAsInput.add(k));
      if (r.secondary) Object.keys(r.secondary).forEach(k => usedAsInput.add(k));
    }));
    // A drop has a "use" if it is: a recipe input, equippable, consumable (heals/buff),
    // buriable (bones), or a tagged currency/key/housing/cosmetic/castle good.
    const hasUse = (id) => {
      const it = I[id]; if (!it) return true; // unknown → not our concern here
      if (usedAsInput.has(id) || usedAsCost.has(id)) return true;
      if (['weapon', 'armor', 'jewelry', 'tool', 'ammo', 'companion'].includes(it.type)) return true;
      if (it.heals || it.buff || it.buryXp) return true;
      if (['key', 'currency', 'housing', 'cosmetic', 'castle', 'crafting-mat'].includes(it.tag)) return true;
      if (it.unlocks || it.recipe || it.premium) return true;
      return false;
    };
    // Known, intentional vendor-trash (sold for gold) — an EXPLICIT exemption so the
    // guard is a tripwire for NEW dead-ends, not a demand to route every legacy drop.
    const VENDOR_TRASH = (window.HearthriseCatalogue && window.HearthriseCatalogue.VENDOR_TRASH) || [];
    const orphans = [...drops].filter(id => I[id] && !hasUse(id) && !VENDOR_TRASH.includes(id));
    assert(orphans.length === 0,
      orphans.length + ' drop(s) go nowhere (no recipe/use). Route them or add to VENDOR_TRASH (src/data/catalogue-coherence.js): ' + orphans.slice(0, 30).join(', '));
  }),

  () => tryRun('FARM-SEED-1: a plant is pre-flighted against the server seed count, not the fresh-G start kit', () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.gateItemCount === 'function' && typeof window.plantCrop === 'function'
      && typeof window.heldByServer === 'function', 'the gate rule, the plant gesture and its count reader must all be exposed');
    if (!window.CROPS || !window.CROPS.turnip) return;
    const G = window.G, snap = snapshotG(), bagWas = G._serverBag;
    const prevSync = window.HearthriseFarmSync, realNotify = window.notify;
    const sent = [], said = [];
    try {
      window.notify = (m) => { said.push(String(m)); };
      window.HearthriseFarmSync = {
        isFarmServerArmed: () => true,
        farmPlantRefusalText: () => 'no seeds',
        farmPlant: (i, c) => { sent.push([i, c]); return Promise.resolve({ ok: false, error: 'insufficient_seed' }); },
      };
      G.farmPlots = [null, null];
      /* THE PHANTOM, as the live slot held it: the factory literal in the display
         bag, and a server bag that names a DIFFERENT seed it really does hold. */
      G.inventory = Object.assign({}, G.inventory, { turnip_seed: 5, wheat_seed: 11 });
      delete G._serverBag;
      A.applyEnvelopeState(G, { state: {}, inventory: { wheat_seed: 11 } });
      // (a) THE SERVER'S FIGURES, against a display bag that keeps the factory seed.
      assert(A.gateItemCount(G, 'turnip_seed') === 0 && window.heldByServer('wheat_seed') === 11
        && (G.inventory.turnip_seed || 0) === 5,
        'the gate must read 0 turnip / 11 wheat from the server bag while the display bag keeps the factory 5 '
        + '(the lie this test exists for): ' + JSON.stringify({ srv: A.gateItemCount(G, 'turnip_seed'), bag: G.inventory.turnip_seed }));
      // (b) THE BUG: the gesture must not go out, and the refusal must be SAID.
      window.plantCrop(0, 'turnip');
      assert(sent.length === 0 && said.some((m) => /Turnip Seed/.test(m)) && !G.farmPlots[0],
        'THE BUG: a plant went out against a seed the server has no row for (19 journalled on live), or the '
        + 'refusal did not NAME the seed: ' + JSON.stringify({ sent, said }));
    } finally {
      window.HearthriseFarmSync = prevSync; window.notify = realNotify;
      if (bagWas === undefined) delete G._serverBag; else G._serverBag = bagWas;
      restoreG(snap);
    }
  }),

  /* FARM-SEED-2: the unstated half (re-ruled visual pass 9). Before the first envelope
     no bag is stated: the plant waits ("counting"), never sent off the display bag
     and never refused as "no seeds". */
  () => tryRun('FARM-SEED-2: an unstated server bag holds the plant as pending, not sent and not refused', () => {
    const A = window.HearthriseAccrual;
    if (!A || typeof A.gateItemCount !== 'function' || !window.CROPS || !window.CROPS.turnip) return;
    const G = window.G, snap = snapshotG(), bagWas = G._serverBag, prevSync = window.HearthriseFarmSync;
    const realNotify = window.notify, sent = [], said = [];
    try {
      window.notify = (m) => { said.push(String(m)); };
      window.HearthriseFarmSync = { isFarmServerArmed: () => true, farmPlantRefusalText: () => 'no seeds',
        farmPlant: (i, c) => { sent.push([i, c]); return Promise.resolve({ ok: false, error: 'insufficient_seed' }); } };
      G.farmPlots = [null, null];
      G.inventory = Object.assign({}, G.inventory, { turnip_seed: 5 });
      delete G._serverBag;
      window.plantCrop(0, 'turnip');
      assert(sent.length === 0 && said.some((m) => /counting/i.test(m)) && !said.some((m) => /no Turnip Seed/.test(m)),
        'with no envelope-stated bag the plant must wait ("counting"), neither sent nor refused: ' + JSON.stringify({ sent, said }));
    } finally {
      window.HearthriseFarmSync = prevSync; window.notify = realNotify;
      if (bagWas === undefined) delete G._serverBag; else G._serverBag = bagWas;
      restoreG(snap);
    }
  }),

  /* FARM-SEED-3 (regression, visual pass 10): unstated bag, display turnip seeds —
     "Plant all (N)" was enabled and toasted "No plantable seeds". Unstated is PENDING.
     MUTATION: fold heldByServer null to 0 in plantAllEmpty/renderFarm and (a) goes red. */
  () => tryRun('FARM-SEED-3: Plant all is pending, not "no seeds", while the server bag is unstated', () => {
    if (!document.getElementById('farm-panel') || typeof window.plantAllEmpty !== 'function' || !window.HearthriseFarmSync) return;
    const G = window.G, snap = snapshotG(), bagWas = G._serverBag, realNotify = window.notify, said = [];
    const fr = window.HearthriseAuto ? window.HearthriseAuto.getFarmReplant() : null;
    const btn = () => {
      window.renderFarm();
      const b = [...document.querySelectorAll('#farm-panel .farm-status button')].find((e) => /^Plant all/.test(e.textContent));
      return b ? { on: !b.disabled, text: b.textContent, title: b.title || '', pending: b.classList.contains('bal-pending') } : null;
    };
    try {
      window.notify = (m) => { said.push(String(m)); };
      if (window.HearthriseAuto) window.HearthriseAuto.setFarmReplant({ enabled: false });
      farmReplantFixtureG({ turnip_seed: 5 });
      G.farmPlots = [null, null, null, null];
      delete G._serverBag;
      const silent = btn();   // (a) unstated: pending, and a forced tap waits
      assert(silent && !silent.on && silent.pending && /counting/i.test(silent.title),
        'THE BUG: an unstated bag must render Plant all PENDING ("counting"): ' + JSON.stringify(silent));
      withDeferredFarmPlant((calls) => {
        const n = window.plantAllEmpty();
        assert(n === 0 && calls.length === 0 && said.some((m) => /counting/i.test(m)) && !said.some((m) => /No plantable/.test(m)),
          'a forced tap while unstated must send nothing and say "counting": ' + JSON.stringify({ n, calls, said }));
      });
      G._serverBag = { turnip_seed: 10 };
      const stated = btn();   // (b) stated: enabled, the count as before
      assert(stated && stated.on && !stated.pending && /Plant all \(\d+\)/.test(stated.text),
        'a stated bag must enable "Plant all (N)": ' + JSON.stringify(stated));
      G._serverBag = {}; said.length = 0;
      withDeferredFarmPlant((calls) => {   // (c) stated none: the honest shop hint
        window.plantAllEmpty();
        assert(calls.length === 0 && said.some((m) => /No plantable seeds/.test(m)),
          'a stated empty bag must say "No plantable seeds": ' + JSON.stringify(said));
      });
    } finally {
      window.notify = realNotify;
      try { if (fr && window.HearthriseAuto) window.HearthriseAuto.setFarmReplant(fr); } catch (e) {}
      if (bagWas === undefined) delete G._serverBag; else G._serverBag = bagWas;
      restoreG(snap);
    }
  }),

  /* -- regression suite -- START-KIT-1: THE FRESH-G START KIT IS A HINT, NOT A BAG
     The ROOT of FARM-SEED-1 above, one layer down. Those seed counts are the
     fresh-G factory literal (src/legacy.js `inventory:{turnip_seed:5,carrot_seed:3,
     shrimp:10,cooked_shrimp:20}` == src/data/start-kit.js START_INVENTORY); the save
     blob is retired so nothing strips them, and the envelope's merge is a one-way
     `Math.max`, so `max(5, omitted)` = 5 on every reload FOREVER. Measured on the
     QA account (slot 2, 2026-09-13): player_inventory held no turnip_seed and no
     carrot_seed row at all, while the bag grid painted 5 and 3 and every
     hr_farm_plant answered insufficient_seed.
     A seed is NOT a server-consumed provision, so the phantom-food rule below could
     never reach it. The kit is now discarded ONCE per page load, on the first bag
     the realm states under a COMPLETE baseline, and only for an id whose local
     figure is still EXACTLY the hint.
     MUTATION: delete the START_INVENTORY block in accrue.js reconcileInventory and
     (b) goes red; drop its `baselineComplete` conjunct and PHANTOM-FOOD-1 +
     SETTLE-2 go red. */
  () => tryRun('START-KIT-1: the first complete bag discards the fresh-G start kit the realm never granted', () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.applyEnvelopeState === 'function', 'the envelope apply must be exposed');
    const IA = window.HearthriseItemAuthority;
    assert(IA && IA.serverConsumedItem('turnip_seed') === false,
      'a seed must NOT be a server-consumed provision, or the phantom-food rule would already cover it');
    const G = window.G, snap = snapshotG(), bagWas = G._serverBag, hintWas = G._startKitHintAt;
    try {
      /* A BOOT: the factory literal, and the hint has not been discarded yet. */
      G.inventory = { turnip_seed: 8, shrimp: 10, cooked_shrimp: 20 };   // the W0 kit (src/data/start-kit.js)
      delete G._serverBag; delete G._startKitHintAt;
      /* THE REALM: a veteran slot that spent the kit long ago and holds its own
         goods, on a projection the server certifies COMPLETE. */
      A.applyEnvelopeState(G, { state: {}, inventory: { cooked_shrimp: 20, maple_log: 7027 }, inventory_complete: true });
      // (a) the realm's own goods land, and a kit id the realm DOES name keeps its figure.
      assert((G.inventory.maple_log || 0) === 7027 && (G.inventory.cooked_shrimp || 0) === 20,
        'the realm\'s own bag must land untouched: ' + JSON.stringify(G.inventory));
      // (b) THE BUG: the kit seeds the realm has no row for are GONE, not ratcheted.
      assert(!G.inventory.turnip_seed,
        'THE BUG: the start-kit hint survived the realm\'s own complete statement of the bag, so the grid paints '
        + 'seeds hr_farm_plant refuses: '
        + JSON.stringify({ turnip_seed: G.inventory.turnip_seed }));
      // (c) ONCE PER LOAD: a LATER envelope leaves the merge rule (never delete) in charge.
      G.inventory.turnip_seed = 5;
      A.applyEnvelopeState(G, { state: {}, inventory: { maple_log: 7027 }, inventory_complete: true });
      assert((G.inventory.turnip_seed || 0) === 5,
        'after the discard the merge rule owns the bag again -- a seed bought since must not be deleted by an '
        + 'envelope that merely omits it: ' + JSON.stringify(G.inventory.turnip_seed));
    } finally {
      if (bagWas === undefined) delete G._serverBag; else G._serverBag = bagWas;
      if (hintWas === undefined) delete G._startKitHintAt; else G._startKitHintAt = hintWas;
      restoreG(snap);
    }
  }),

  /* START-KIT-2: the half that protects real progress. The discard is scoped to a
     figure that is still EXACTLY the hint; a player who has PLAYED holds a number
     the client did not invent, and the merge rule (never delete, never lower) still
     owns it. Without that scope the block would be a bag-wide absolute replace --
     the Phase-2 inventory flip, which is a different lane and a different decision. */
  () => tryRun('START-KIT-2: a start-kit id the player has played is left to the merge rule', () => {
    const A = window.HearthriseAccrual;
    if (!A || typeof A.applyEnvelopeState !== 'function') return;
    const G = window.G, snap = snapshotG(), bagWas = G._serverBag, hintWas = G._startKitHintAt;
    try {
      G.inventory = { turnip_seed: 7, shrimp: 10 };   // 7 != the hint's 8 -- somebody bought seeds; shrimp is the untouched hint
      delete G._serverBag; delete G._startKitHintAt;
      A.applyEnvelopeState(G, { state: {}, inventory: { maple_log: 1 }, inventory_complete: true });
      assert((G.inventory.turnip_seed || 0) === 7 && !G.inventory.shrimp,
        'a TOUCHED figure must survive (7) while the untouched hint (10 raw shrimp) is discarded: '
        + JSON.stringify({ turnip_seed: G.inventory.turnip_seed, shrimp: G.inventory.shrimp }));
    } finally {
      if (bagWas === undefined) delete G._serverBag; else G._serverBag = bagWas;
      if (hintWas === undefined) delete G._startKitHintAt; else G._startKitHintAt = hintWas;
      restoreG(snap);
    }
  }),


  () => tryRun('WAVE4: shared drop bands', () => {
    assert(typeof window.dropBand === 'function', 'window.dropBand must be published');
    assert(window.dropBand(1) === 'always', '100% → always');
    assert(window.dropBand(0.03) === 'rare', '3% → rare');
    assert(window.dropBand(0.10) === 'uncommon', '10% → uncommon');
    assert(window.dropBand(0.5) === 'common', '50% → common');
  }),


  () => tryRun('b268: signature GEAR is BoP, signature COSMETICS/deeds are tradeable', () => {
    const I = window.ITEMS;
    if (!I) return;
    // Signature weapons = the prestige clear-it-yourself reward → bind-on-pickup.
    ['wartusk_cleaver','whispering_codex','ashcrown_greatsword','voidmaw_scepter','dragonfang_pike'].forEach(id => {
      assert(I[id], 'signature gear ' + id + ' must exist');
      assert(I[id].bop === true, 'signature gear ' + id + ' must be bind-on-pickup');
      assert(I[id].type === 'weapon', 'signature gear ' + id + ' must be an equippable weapon');
    });
    // Cosmetics/trophies/materials = a market money source → tradeable. (farm_deed and the
    // room blueprints were cut in the 2026-10-14 demolition, ruling §2.)
    ['warboss_standard','lexarch_seal','voidwoven_sigil','riftmaw_husk','elderscale_heart'].forEach(id => {
      assert(I[id], 'tradeable dungeon drop ' + id + ' must exist');
      assert(!I[id].bop, id + ' must be tradeable (non-BoP) — dungeon loot is a market money source');
    });
  }),



  () => tryRun('b213: market listing row escapes a hostile seller name (stored-XSS guard)', () => {
    // Regression: seller display names come from OTHER players in the live
    // Supabase market and were interpolated raw into innerHTML — a name like
    // <img src=x onerror=...> would run in every viewer's browser and could
    // steal the Supabase JWT from localStorage. The render must HTML-escape it.
    const M = window.HearthriseMarket;
    if (!M || typeof M.list !== 'function') return;
    const KEY = 'hearthrise:market:listings';
    const saved = localStorage.getItem(KEY);
    const evil = '<img src=x onerror="window.__mktXss=1">';
    try {
      window.__mktXss = 0;
      // sellerId must NOT start with 'npc-' — those are filtered as seeds.
      localStorage.setItem(KEY, JSON.stringify([{
        id: '99999999-8888-4777-8666-555555555555', sellerId: 'user-hostile-xss', sellerName: evil,
        itemId: 'normal_log', qty: 1, askEach: 5, postedAt: Date.now(),
      }]));
      window.showTab('market');
      const panel = document.getElementById('panel-market');
      const html = panel ? panel.innerHTML : '';
      /* b230 — this guard was VACUOUS and is now real. It used to run through
         market.js's showTab wrapper, which rendered on `setTimeout(…, 0)`; the
         assertions below ran synchronously against an empty panel and passed
         without ever seeing a listing. showTab() renders the Market
         synchronously now, which exposed two things at once:
           1. the row does render, so the guard finally executes; and
           2. the old string check was a false positive. escapeAttr() turns the
              payload into TEXT, and innerHTML re-serialisation escapes < > &
              but NOT quotes — so `onerror="…"` reappears inside a perfectly
              safe text node. Asserting on serialised source cannot tell live
              markup from escaped text.
         Ask the DOM instead. It cannot be fooled: if the payload were live
         there would be an element carrying that attribute. */
      assert(html.indexOf('mk-row') !== -1,
        'the market rendered no listing — this guard must not pass vacuously');
      assert(!panel.querySelector('[onerror], img[src="x"]'),
        'hostile seller name rendered as LIVE html — stored XSS in the market');
      assert(window.__mktXss === 0, 'injected script executed — stored XSS in the market');
      assert(html.indexOf('&lt;img') !== -1, 'seller name should render HTML-escaped');
    } finally {
      if (saved === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved);
      try { window.showTab('profile'); } catch {}
      delete window.__mktXss;
    }
  }),
  /* ── regression: Market Cancel is SERVER-FIRST ─────────────────────
     Live: clicking Cancel on your own listing did nothing — no toast, no
     refund, listing stayed. cancelListing() was the pre-cutover path: it
     refunded the escrow with a client addItem, deleted the mirror row, and
     fired hr_market_cancel with .catch(noop), the verdict discarded; the click
     handler swallowed the refusal reason, so a stale row id read as silence.
     This test drives the real button under the seam and asserts the two
     properties the cutover requires: exactly one market_cancel intent goes
     out, and G.inventory does NOT move before the answer applies. */
  () => tryRun('b523: market Cancel sends one market_cancel intent and does not refund client-side', () => {
    const M = window.HearthriseMarket;
    if (!M || typeof M.listItem !== 'function') { skip('HearthriseMarket seam absent'); return; }
    const KEY = 'hearthrise:market:listings';
    const saved = { rows: localStorage.getItem(KEY), gold: window.HearthriseGold, key: window.goldIntentKey, g: snapshotG() };
    const UUID = '11111111-2222-4333-8444-555555555555';
    const calls = [];
    try {
      /* 1. A listing owned by THIS seller, made with the seam off, then given a
            server uuid — the shape a live listing has once the receipt is adopted. */
      window.HearthriseGold = { isGoldIntentEnabled: () => false };
      window.G.inventory = window.G.inventory || {};
      window.G.inventory.normal_log = (window.G.inventory.normal_log || 0) + 5;
      assert(M.listItem('normal_log', 1, 5).ok, 'setup: listItem should succeed');
      const rows = M.list();
      assert(rows[rows.length - 1].itemId === 'normal_log', 'setup: my listing is the last row');
      rows[rows.length - 1].id = UUID;
      localStorage.setItem(KEY, JSON.stringify(rows));
      // 2. Seam ON, with the cancel verb captured instead of sent and left unanswered.
      window.HearthriseGold = {
        isGoldIntentEnabled: () => true,
        isListingId: (id) => /^[0-9a-f-]{36}$/.test(String(id)),
        cancelMarketListing: (id, key) => { calls.push({ id, key }); return new Promise(() => {}); },
      };
      window.goldIntentKey = () => '99999999-8888-4777-8666-555555555555';
      window.showTab('market');
      const btn = document.querySelector('#panel-market button.mk-cancel[data-cancel="' + UUID + '"]');
      assert(btn, 'my server listing rendered no Cancel button — this guard must not pass vacuously');
      const bagBefore = window.G.inventory.normal_log || 0;
      btn.click();
      assert(calls.length === 1, 'Cancel must send exactly ONE market_cancel intent, sent ' + calls.length);
      assert(calls[0].id === UUID && !!calls[0].key, 'the intent must name the SERVER listing id and carry a key');
      assert((window.G.inventory.normal_log || 0) === bagBefore,
        'the client refunded the escrow itself — the bag moved before the server answered');
      assert(M.list().filter((l) => l.id === UUID).length === 1,
        'the row was deleted locally before the server answered — the mirror is not the arbiter');
    } finally {
      window.HearthriseGold = saved.gold;
      window.goldIntentKey = saved.key;
      if (saved.rows === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved.rows);
      restoreG(saved.g);
      try { window.showTab('profile'); } catch (e) {}
    }
  }),
  () => tryRun('PROVISION-1: the counter sells lobster by the five and no longer sells one arrow for 150', () => {
    /* Pack 9. Iron Arrows were an EQUIP_SHOP row at 150 g for ONE arrow that
       a ranger burns one per shot — a trap, so the row is retired. Lobster is
       the Supplies meal one band above trout for a knocked-out fighter with
       gold. Pure resolver only: the edge half is tests/gold-intents.mjs G-PROV. */
    const Gold = window.HearthriseGold;
    assert(Gold && typeof Gold.resolvePurchase === 'function' && typeof Gold.shopOfferIndex === 'function',
      'the gold module does not publish the offer resolver');
    const r = Gold.resolvePurchase('cooked_lobster', 5, 2000);
    assert(JSON.stringify(r) === JSON.stringify({ offer: 'seed.cooked_lobster', count: 1 }),
      'the server cannot price the lobster bundle: ' + JSON.stringify(r));
    const bad = Gold.resolvePurchase('cooked_lobster', 5, 1);
    assert(bad.error === 'price_mismatch', 'a forged lobster price resolved: ' + JSON.stringify(bad));
    const idx = Gold.shopOfferIndex();
    assert(!Object.values(idx).some(e => e && e.offer === 'equip.iron_arrows'),
      'equip.iron_arrows is still a gold offer — the one-arrow-for-150 trap is back');
    assert(Array.isArray(window.EQUIP_SHOP) && !window.EQUIP_SHOP.some(row => row.id === 'iron_arrows'),
      'EQUIP_SHOP still lists iron_arrows');
  }),

  () => tryRun('PROVISION-2: no gold offer sells for less than the vendor pays back', () => {
    /* THE NO-PROFIT RULE, for EVERY item-granting gold offer that ships, at the
       strict margin: the vendor pays at most HALF the shop price (SHOP_BUYBACK_RATE). */
    const idx = window.HearthriseGold && window.HearthriseGold.shopOfferIndex();
    assert(idx && typeof window.vendorPrice === 'function', 'offer index or vendorPrice not published');
    const ids = Object.keys(idx);
    assert(ids.length > 20, 'the offer index is suspiciously small: ' + ids.length);
    for (const id of ids) {
      const e = idx[id];
      const buyback = e.grants * window.vendorPrice(id);
      assert(buyback <= 0.5 * e.gold,
        e.offer + ' costs ' + e.gold + ' and sells back for ' + buyback
        + ' — more than half the shop price (SHOP_BUYBACK_RATE)');
    }
  }),

  /* ── regression suite — the vendor bought back at the shop's own price
     (steel_platebody 1500/1500, seeds at par). These are the server's numbers
     (catalogue.js vendorPriceOf); the bag must show exactly them (CLAUDE.md §6). */
  () => tryRun('b565 regression: the vendor pays at most half the cheapest shop unit price', () => {
    assert(window.SHOP_BUYBACK_RATE === 0.5, 'SHOP_BUYBACK_RATE must be 0.5, got ' + window.SHOP_BUYBACK_RATE);
    assert(window.SHOP_UNIT_PRICE && window.SHOP_UNIT_PRICE.stone_maul === 140,
      'window.SHOP_UNIT_PRICE is not published from the catalogue — vendorPrice bids nothing without it');
    const EXPECT = {
      carrot_seed: 5, potato_seed: 10, pumpkin_seed: 25, turnip_seed: 2,
      wheat_seed: 7, tomato_seed: 15, stone_maul: 70, shortbow: 60, apprentice_staff: 60,
      rune_blank: 3, goldenroot_seed: 75, emberfruit_seed: 150,
      cooked_lobster: 200, cooked_trout: 45, cooked_shrimp: 15,
    };
    const wrong = Object.keys(EXPECT).filter((id) => window.vendorPrice(id) !== EXPECT[id])
      .map((id) => id + ' shows ' + window.vendorPrice(id) + ', server pays ' + EXPECT[id]);
    assert(wrong.length === 0, 'the bag disagrees with the server buy-back: ' + wrong.join('; '));
    assert(window.ITEMS.steel_platebody.v === 1500, 'steel_platebody book value moved');
    /* W0: the shop sells starter gear only, so steel_platebody has no shop unit
       price and the cap does not apply — it vends at book, exactly as the edge pays. */
    assert(!('steel_platebody' in window.SHOP_UNIT_PRICE) && window.vendorPrice('steel_platebody') === 1500,
      'an item the shop no longer sells must bid its full book value, got ' + window.vendorPrice('steel_platebody'));
  }),

  /* ── regression suite — ONE BUY GREYED EVERY BUY (live, QA account) ──
     Supplies at 11,826 gold: Buy Cooked Shrimp ×5 → gold and Have were right,
     then all 13 Buy buttons stayed `disabled` for good while balCanAfford(150)
     answered true. The gesture repainted the shop while its own prediction made
     the balance PENDING (canAfford fail-closes), and nothing repainted it when
     the answer resolved the balance. The class: every affordability-gated
     surface must repaint on the resolve, not only at the gesture. Swept, all
     through ONE listener on gold.js's `hr:balance-resolved` (announced from
     reconcilePredictions = every envelope, and rollbackPrediction = a refusal):
       shop (seeds/equip/cosmetics + injected companion rows) · House rooms,
       plots, homestead + room modal (renderHouseSurfaces) · Buy-back modal ·
       bank-space modal · market buy sheet (its own listener: purse + Confirm). Gesture-time-only
       gates (clans, dungeons, workers, bank, multi-character) paint nothing.
     Both resolve points are driven: an applied envelope and a refusal. */
  () => tryRunAsync('b555 regression: the shop repaints its Buy buttons when a purchase settles', async () => {
    if (typeof window.buyShopItem !== 'function' || typeof window.renderShop !== 'function') return;
    const snap = snapshotG();
    const rows = window.SEED_SHOP || [];
    const shrimp = rows.find((r) => r.id === 'cooked_shrimp');
    const top = rows.reduce((a, r) => (r.cost > a.cost ? r : a), rows[0]);
    assert(shrimp && top && top.cost > 3 * shrimp.cost, 'fixture: needs the shrimp row and a dearer row');
    const buttons = () => Array.from(document.querySelectorAll('#shop-panel .shop-row button'))
      .filter((b) => /buyShopItem\(/.test(b.getAttribute('onclick') || ''));
    const btnFor = (id) => buttons().find((b) => (b.getAttribute('onclick') || '').indexOf("'" + id + "'") !== -1);
    const check = (label, serverGold) => {
      assert(goldOf() === serverGold, label + ': the balance is ' + goldOf() + ', the server said ' + serverGold);
      const all = buttons();
      const stuck = all.filter((b) => {
        const cost = Number(((b.getAttribute('onclick') || '').match(/,(\d+)\)\s*$/) || [])[1]);
        return b.disabled && cost <= serverGold;
      });
      assert(all.length === rows.length, label + ': expected ' + rows.length + ' Buy rows, found ' + all.length);
      assert(stuck.length === 0, label + ': ' + stuck.length + '/' + all.length + ' affordable Buy buttons are still '
        + 'disabled after the answer resolved the balance — the fail-closed paint from the pending instant stuck');
      assert(btnFor(top.id) && btnFor(top.id).disabled, label + ': the ' + top.cost + 'g row must stay disabled at '
        + serverGold + ' gold — the repaint must not light a genuinely unaffordable row');
    };
    try {
      window.G.gold = top.cost - 1;
      stampBalanceLikeLoad(window.G);
      window.showTab('shop');
      if (typeof window.setShopTab === 'function') window.setShopTab('seeds');
      assert(btnFor(shrimp.id) && !btnFor(shrimp.id).disabled, 'precondition: the shrimp Buy is enabled before the buy');

      // 1) APPLIED: the server answers with its own number (not the client's subtraction).
      const applied = top.cost - 1 - shrimp.cost - 7;
      await withServerBacked({ state: { gold: applied } }, async (rig) => {
        window.buyShopItem(shrimp.id, shrimp.qty, shrimp.cost);
        await rig.drain();
        assert(rig.sent.length === 1 && rig.sent[0].verb === 'shop_buy', 'expected one shop_buy, sent ' + JSON.stringify(rig.sent));
      });
      check('after an applied buy', applied);

      // 2) REFUSED: no envelope, the prediction is rolled back — the other resolve point.
      await withServerBacked({}, async (rig) => {
        rig.reply(() => new Response(JSON.stringify({ ok: false, error: 'insufficient_gold' }), { status: 409 }));
        window.buyShopItem(shrimp.id, shrimp.qty, shrimp.cost);
        await rig.drain();
        assert(rig.sent.length === 1, 'expected one shop_buy on the refusal leg, sent ' + rig.sent.length);
      });
      check('after a refused buy', applied);
    } finally { restoreGAndRecord(snap); try { window.renderShop(); } catch (e) {} }
  }),

  () => tryRun('HOMELORE-1: every room rung carries its Almanac line; the owned rung shows it in the sheet', () => {
    const H = window.HearthriseHomestead, L = window.HearthriseLore, RR = window.HearthriseRooms;
    assert(H && L && typeof L.room === 'function' && RR && typeof RR.roomRung === 'function', 'homestead / lore / rooms seam absent');
    Object.keys(window.ROOMS || {}).forEach((id) => {
      H.roomDescriptor(id).ladder.forEach((row, i) => {
        assert(row.line && row.line === L.room(id, i + 1), id + ' rung ' + (i + 1) + ' line: ' + row.line);
      });
    });
    const rung = RR.roomRung;
    const html = () => H.modalDescriptor('kitchen').sections.map((s) => (s.html || '') + (s.rows || []).map((r) => r.effect || '').join('')).join('');
    try {
      RR.roomRung = (g, id) => (id === 'kitchen' ? 2 : rung(g, id));
      assert(H.roomDescriptor('kitchen').currentLine === L.room('kitchen', 2), 'kitchen 2: currentLine must be rung 2 lore');
      assert(html().includes(L.room('kitchen', 2)) && html().includes(L.room('kitchen', 5)), 'the sheet must carry the rung 2 and rung 5 lines');
      RR.roomRung = (g, id) => (id === 'kitchen' ? 0 : rung(g, id));
      assert(H.roomDescriptor('kitchen').currentLine === null, 'unbuilt kitchen: currentLine must be null');
    } finally { RR.roomRung = rung; }
  }),

  () => tryRun('FARMLORE-1: a crop guide row says what the crop is and what it is for, escaped', () => {
    const L = window.HearthriseLore, esc = window.escapeHtml;
    assert(typeof window.cropGuideRowHtml === 'function' && typeof esc === 'function' && typeof window.itemDesc === 'function', 'crop guide seam absent');
    const desc = window.itemDesc('carrot'), row = window.cropGuideRowHtml('carrot');
    assert(desc.includes("'") && row.includes(esc(desc)), 'the carrot row must carry its escaped Almanac line: ' + row);
    const used = typeof window.itemUsedInLine === 'function' ? window.itemUsedInLine('carrot') : '';
    assert(row.includes('Used in:') === !!used && (!used || row.includes(esc(used))), 'Used in must appear exactly when the index has uses: ' + row);
    assert(L && typeof L.plot === 'function' && L.plot(1).name === 'The Turnip Patch' && L.plot(6) === null, 'plot tier names must key 1..5');
  }),

  () => tryRun('FARMLORE-2: the plot tier name reads the SERVER tier; unknown shows the pending glyph, never a named tier', () => {
    const F = window.HearthriseFarm, L = window.HearthriseLore, B = window.HearthriseBalance;
    assert(F && typeof F.tierHeadHtml === 'function' && typeof F.tierLoreHtml === 'function' && L && B, 'farm tier builder absent');
    const sv = F.getServerPlotLevel, names = [1, 2, 3, 4, 5].map((n) => L.plot(n).name);
    try {
      F.getServerPlotLevel = () => null;
      const head = F.tierHeadHtml();
      assert(head.includes(B.UNKNOWN_TEXT) && names.every((n) => !head.includes(n)) && F.tierLoreHtml() === '', 'unknown tier must be pending: ' + head);
      window.renderFarm();
      const status = document.querySelector('#farm-panel .farm-status');
      assert(status && status.innerHTML.includes(head), 'the farm header must render the builder output');
      F.getServerPlotLevel = () => 3;
      assert(/The Market Rows · Soil Lv 3\/5/.test(F.tierHeadHtml()) && F.tierLoreHtml().includes(L.plot(3).line), 'tier 3: ' + F.tierHeadHtml());
    } finally { F.getServerPlotLevel = sv; window.renderFarm(); }
  }),

  /* ══ W0 (game-designer, 2026-10-10) — the fun list, played through the page ══
     The data rules live in tests/w0f-fun-content.mjs; these drive the three
     surfaces a player meets. */

  () => tryRun('W0-CHAMP-1: each tier 1-5 has a champion on the Fight list, and its relic is server-revealed', () => {
    const M = window.MONSTERS, LF = window.HearthriseLuckyFinds;
    assert(M && LF && typeof LF.isRevealed === 'function', 'roster or lucky-finds seam absent');
    const champs = Object.keys(M).filter((id) => M[id].champion === true);
    assert(champs.length === 5, 'five champions expected, got ' + champs.length);
    [1, 2, 3, 4, 5].forEach((t) => assert(champs.some((id) => M[id].tier === t), 'tier ' + t + ' has no champion'));
    champs.forEach((id) => {
      const relic = M[id].drops[M[id].drops.length - 1];
      assert(relic && relic.champion === true && LF.isRevealed(relic.id),
        id + ': the relic row must be server-revealed — the client must never show its own dice for it');
      assert(!M[id].boss, id + ': a champion is never a boss');
      assert(window.ITEMS[relic.id] && window.itemDesc(relic.id), id + ': the relic must be a described item');
    });
    // A tier-1 champion is meetable from combat level 0 — the whole point.
    assert((M.old_tusker.tier - 1) * 15 === 0, 'the tier-1 champion must be open to a fresh hero');
    // (The bounty-board arm left with the board in the 2026-10-14 demolition.)
  }),
];
