// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/rooms-items-and-economy.js — room rungs, the item index, workers, pets, traits, bounties, dungeons, market and theme surfaces.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 105 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, bountyRig, stampBalanceLikeLoad, stampRecordLikeLoad, withServerBacked, withRoomServer, awayArtisanSpan, tryRunRestampingBalance, goldOf, gemsOf, snapshotG, setAway, drain, restoreG, restoreGAndRecord, restoreBankCap, on, snapshot } from './_harness.js?v=555';

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
    assert(/Smithing/i.test(window.itemSourceLine('steel_sword')), 'crafted route regressed');
    assert(/Mining/i.test(window.itemSourceLine('iron_ore')), 'gathered route regressed');
    assert(/Crypt of Bones/.test(window.itemSourceLine('kitchen_blueprint_t2')), 'dungeon route regressed');
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

  () => tryRun('b372: a room rung cost and its blueprint gate are both inspectable', () => {
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
      const gateLink = document.querySelector('.hr-room-scrim .hr-room-gate-nm[data-inspect-item="kitchen_blueprint_t2"]');
      assert(gateLink, 'the blueprint gate — the requirement a player can least easily answer — must be inspectable');

      /* THE STACKING BUG THIS FEATURE WOULD OTHERWISE SHIP: the room modal
         scrim sits at z-index 100000 and `.inv-detail` at 1500, so the flyout
         would have opened BEHIND the modal that launched it. */
      gateLink.click();
      const ov = document.getElementById('inv-detail-overlay');
      assert(ov && ov.classList.contains('show'), 'the gate must open the flyout');
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

  () => tryRun('b372: a dungeon key and a proof bounty name a route, not just an item', () => {
    // The two hardest requirements to answer, because neither can be grinded for.
    if (typeof window.bountyLabel === 'function' && window.MONSTERS && window.MONSTERS.wolf) {
      const label = window.bountyLabel({ type: 'proof', target: 'wolf', required: 5, proofItem: 'wolf_pelt' });
      assert(/data-inspect-item="wolf_pelt"/.test(label),
        'a proof bounty must link the item it wants: ' + label);
    }
    if (typeof window.renderDungeons === 'function' && document.getElementById('panel-dungeons')) {
      window.renderDungeons();
      const key = document.querySelector('#panel-dungeons .dgn-cost [data-inspect-item]');
      assert(key, 'a dungeon entry key must be inspectable — it drops or it is bought, and the card said neither');
      /* b372 also retired the raw data emoji on this line. "No emoji as art"
         is a project rule; itemArt() is the one path every other item takes. */
      const emoji = /[\u{1F300}-\u{1FAFF}]/u.test(key.textContent);
      assert(!emoji, 'the entry key must render painted art, not a system pictograph: ' + key.textContent);
    }
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
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 3 };
      window.G.rooms = { workshop: 0, forge: 2 };
      window.G.gold = 1000;
      stampBalanceLikeLoad(window.G);   // armed: _costPart('gold', …) reads via canAfford
      window.G.inventory = Object.assign({}, window.G.inventory, { normal_log: 2, normal_plank: 2 });

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
    } finally { restoreG(snap); window.HearthriseRoomModal && window.HearthriseRoomModal.close(); }
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
    // Same for the once-a-day sheet: `autoBoot()` opens `#hr-dl-modal` at the first quiet moment iff `todayKey() !== lastClaimDay`, so unpinned this arm's page state depends on the date. Pinned through the module's own day key; put away below through the × the sheet draws, never a node removal (that skips the close unhooking its document-level Escape).
    const dailyBefore = G.dailyReward;
    assert(window.HearthriseDaily._todayKey, 'daily-reward.js stopped publishing its own day key — the sheet cannot be pinned');
    G.dailyReward = { lastClaimDay: window.HearthriseDaily._todayKey() };
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
      G.dailyReward = dailyBefore;
      try { const x = document.querySelector('#hr-dl-modal [data-dl-close]'); if (x) x.click(); } catch (e) {}
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
      const craft = (window.ARTISAN_RECIPES.crafting || []).map(r => r.id);
      assert(craft.includes('carve_runewood_rod'), 'crafting recipe missing: carve_runewood_rod');
    } finally { G.inventory = savedInv; }
  }),
  () => tryRun('b202: pets — skill/boss sources parse, forced roll unlocks, owned pets skip', () => {
    const P = window.HearthrisePets;
    assert(P, 'HearthrisePets present');
    const skillPets = P._parse('skill'), bossPets = P._parse('boss');
    assert(skillPets.length >= 8, 'expected 8+ skilling pets, got ' + skillPets.length);
    assert(bossPets.length >= 2, 'expected 2+ boss pets, got ' + bossPets.length);
    skillPets.concat(bossPets).forEach(p => {
      assert(window.COMPANIONS[p.petId], 'pet def missing: ' + p.petId);
      assert(p.n >= 200, p.petId + ' should be HARD to get (n>=200), got ' + p.n);
    });
    const G = window.G;
    const saved = G.companions ? JSON.parse(JSON.stringify(G.companions)) : undefined;
    /* ── RE-POINTED (b515). THE ROLL IS SYNCHRONOUS; THE OWNERSHIP IS NOT. ────
       This block asserts pets.js's ROLL MATHS — forced win claims, owned pets
       skip, forced loss does not. It used to read `ownedIds` on the line after
       the roll, which stopped being possible when the capstone armed: a
       skill/boss pet is a non-shop acquisition, so `unlockCompanion` waits for
       hr_companion_grant and `ownedIds` is legitimately still empty one line
       later.

       b499 handled that by PINNING THE CAPSTONE OFF for the roll maths. b515
       removed that position: `companions.js blobRetired()` is now the literal
       `true`, so `__setBlobRetired(false)` selects nothing and the pin would
       have been grading the armed path under a dormant name — a green that says
       something false, which is worse than a red.

       So the roll is read through what it DECIDES rather than through what
       happens next: a hit calls `unlockCompanion`, a miss does not, and an
       already-owned pet never even draws. Grants are parked, so the ladder
       cannot leave a retry ticking through the rest of the suite (which is
       exactly what this test used to do, twice, before the runner learned to
       park it). */
    const Cap = window.HearthriseCapstone;
    const CO = window.HearthriseCompanions;
    const realUnlock = window.unlockCompanion;
    const wasParked = (CO && typeof CO.__parkGrants === 'function') ? CO.__parkGrants(true) : false;
    let claims = [];
    try {
      window.unlockCompanion = function (id) { claims.push(id); return false; };
      G.companions = { ownedIds: [], equipped: null, xp: {} };
      // forced win (rng → 0) CLAIMS the woodcutting pet
      claims = [];
      assert(P.rollSkillPet('woodcutting', () => 0) === true, 'forced roll should report a hit on beaver');
      assert(claims.indexOf('beaver') >= 0,
        'a winning roll did not route through unlockCompanion — nothing asks the server, so the pet is '
        + 'never granted: ' + JSON.stringify(claims));
      // owned pets never re-roll — and never claim
      claims = [];
      G.companions.ownedIds.push('beaver');
      assert(P.rollSkillPet('woodcutting', () => 0) === false, 'owned pet must not unlock twice');
      assert(claims.length === 0, 'an owned pet was claimed again: ' + JSON.stringify(claims));
      G.companions.ownedIds = [];
      // forced loss (rng → 1) never unlocks, and never claims
      claims = [];
      assert(P.rollBossPet('lich', () => 0.999999) === false, 'losing roll should not unlock');
      assert(claims.length === 0, 'a LOSING roll claimed a pet: ' + JSON.stringify(claims));
      assert(P.rollBossPet('lich', () => 0) === true, 'forced boss roll should report a hit on lichling');
      assert(claims.indexOf('lichling') >= 0,
        'a winning boss roll did not route through unlockCompanion: ' + JSON.stringify(claims));
      window.unlockCompanion = realUnlock;

      /* THE ARMED CONTRACT, stated rather than assumed: the roll still FIRES (a
         hit is a hit), and the pet does NOT appear locally until the server has
         recorded it. Without this the re-pin above would be a hole. Parked, so
         the dispatch happens without leaving a live retry ladder running
         through the rest of the suite — which is exactly what this test used to
         do, twice, before the runner learned to park it. */
      if (Cap && Cap.__setBlobRetired && CO && typeof CO.needsServerConfirm === 'function') {
        Cap.__setBlobRetired(true);
        if (Cap.isBlobRetired() === true && CO.needsServerConfirm('beaver') === true) {
          const wasParked = CO.__parkGrants(true);
          try {
            G.companions = { ownedIds: [], equipped: null, xp: {} };
            assert(P.rollSkillPet('woodcutting', () => 0) === true,
              'ARMED: a forced roll must still report a HIT — ownership arriving a round trip later '
              + 'is not a miss');
            assert(!G.companions.ownedIds.includes('beaver'),
              'ARMED: the pet appeared BEFORE the server recorded it — reconcileCompanions rebuilds '
              + 'the roster from the server owned-set, so the player would watch it vanish');
          } finally { CO.__parkGrants(wasParked); }
        }
      }
    } finally {
      window.unlockCompanion = realUnlock;
      if (CO && typeof CO.__parkGrants === 'function') CO.__parkGrants(wasParked);
      if (Cap && Cap.__setBlobRetired) Cap.__setBlobRetired(null);
      if (CO && CO.__clearGrantBlocks) CO.__clearGrantBlocks();
      if (saved === undefined) delete G.companions; else G.companions = saved;
    }
  }),
  () => tryRun('b204/b229: world events — deterministic by date, and ONLINE bonuses flow through getBonus', () => {
    const E = window.HearthriseWorldEvents;
    const P = window.HearthrisePresence;
    const NS = window.HearthriseNetStatus;
    assert(E, 'HearthriseWorldEvents present');
    // determinism: same key → same event, different keys spread across the pool
    const a = E.daily('2026-3-14'), b = E.daily('2026-3-14');
    assert(a && b && a.id === b.id, 'same date key must pick the same daily event');
    const picks = new Set(['2026-1-1','2026-1-2','2026-1-3','2026-1-4','2026-1-5','2026-1-6','2026-1-7','2026-1-8'].map(k => E.daily(k).id));
    assert(picks.size >= 3, 'date keys should spread across the pool, got ' + picks.size);
    // b227/b229: the bonus reaches getBonus only while the SESSION IS ONLINE.
    // The b204 contract (the wrapper is wired, every pool key travels) is
    // unchanged — what moved is that it is now conditional, so the test has to
    // hold the condition. b229 drives that condition through the real
    // connectivity oracle instead of the retired idle clock.
    const G = window.G;
    const snap = snapshotG();
    try {
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree'; G.activeMonster = null;
      assert(E.isActive() === true, 'an online player must have the blessing live');
      const d = E.daily(), w = E.weekly();
      const keys = Object.keys(Object.assign({}, d.bonus, w.bonus));
      keys.forEach((k) => {
        const evPart = E.bonusFor(k);
        assert(evPart > 0, 'bonusFor(' + k + ') should be > 0 today');
        assert(E.liveBonusFor(k) === evPart, 'an online player must be PAID the full ' + k + ' blessing');
        assert(window.getBonus(k) >= evPart, 'getBonus(' + k + ') should include the event bonus while online');
      });
      // …and stops travelling the moment the session genuinely drops.
      try {
        NS.setMode('offline');
        assert(E.isActive() === false, 'a disconnected player must not have the blessing live');
        keys.forEach((k) => {
          assert(E.liveBonusFor(k) === 0, 'a disconnected player must be paid NO ' + k + ' blessing');
        });
      } finally { NS.setMode('ok'); }
      assert(E.isActive() === true, 'and reconnecting restores it');
    } finally { restoreG(snap); }
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
  () => tryRun('b217: cooking progresses daily + quest trackers (live artisan path)', () => {
    if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(true);
    const G = window.G;
    const saved = {
      quests: JSON.parse(JSON.stringify(G.quests || [])),
      daily: JSON.parse(JSON.stringify(G.daily || {})),
      inv: JSON.parse(JSON.stringify(G.inventory || {})),
      rooms: JSON.parse(JSON.stringify(G.rooms || {})),
      skills: JSON.parse(JSON.stringify(G.skills || {})),
      activeSkill: G.activeSkill, target: G.skillTargetId
    };
    try {
      // Guard the fix: the LIVE window.doArtisanAction must feed updateDaily +
      // updateQuest for cooking — before b217 it updated only G.stats, so daily
      // "Cook N" tasks and the onboarding cook quest were un-completable.
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
      G.daily = G.daily || {};
      // b414: generateDailyTasks resets on the UTC day key now (server-authoritative
      // selection), not toDateString() — pin lastReset to the same key so this
      // hand-set task is not regenerated out from under the assertion.
      G.daily.lastReset = window.hrGoalDayKey();
      G.daily.tasks = [{ id: 'daily_cook', type: 'cooked', label: 'Cook 12 items', goal: 12, progress: 0, reward: 400, done: false }];
      for (let i = 0; i < 3; i++) window.doArtisanAction('cooking', 'cook_shrimp');
      assert(G.quests[0].progress === 3, 'cooking must progress the onboarding cook quest, got ' + G.quests[0].progress);
      assert(G.daily.tasks[0].progress === 3, 'cooking must progress the daily cook task, got ' + G.daily.tasks[0].progress);
    } finally {
      if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(null);
      G.quests = saved.quests; G.daily = saved.daily; G.inventory = saved.inv;
      G.rooms = saved.rooms; G.skills = saved.skills;
      G.activeSkill = saved.activeSkill; G.skillTargetId = saved.target;
      stampRecordLikeLoad(G);
    }
  }),
  () => tryRun('b269: the Stable nav button lives under Homestead, not Adventure', () => {
    // Tyler: pets are a homestead fixture. companions.js injectNavButton was
    // inserting the Stable button into the Adventure group; it must land in
    // Homestead. Assert by walking the sidebar and tracking the group label
    // that precedes the stable button.
    const sb = document.querySelector('.sidebar') || document.querySelector('aside');
    if (!sb) return;                                   // no sidebar in this harness view
    const stable = sb.querySelector('[data-tab="stable"]');
    if (!stable) return;                               // nav not injected yet — nothing to assert
    let group = null;
    for (const el of Array.from(sb.children)) {
      if (el.classList && el.classList.contains('nav-group-label')) group = el.textContent.trim();
      if (el === stable) break;
    }
    assert(group === 'Homestead',
      'the Stable button must sit under the Homestead group, found it under: ' + group);
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
  () => tryRun('b217: auto-eat is gated behind the purchased trait (unbypassable)', () => {
    const G = window.G;
    const A = window.HearthriseAuto;
    assert(A && typeof A.maybeAutoEat === 'function', 'HearthriseAuto.maybeAutoEat missing');
    const saved = {
      traits: JSON.parse(JSON.stringify(G.traits || {})),
      auto: JSON.parse(JSON.stringify(G.autoActions || {})),
      inv: JSON.parse(JSON.stringify(G.inventory || {})),
      hp: G.playerHp, maxHp: G.playerMaxHp
    };
    try {
      G.traits = {};                                  // locked
      G.autoActions = G.autoActions || {};
      G.autoActions.eat = { enabled: true, threshold: 0.9, foodId: null };
      G.inventory = Object.assign({}, G.inventory, { cooked_shrimp: 5 });
      G.playerMaxHp = 10; G.playerHp = 1;             // well below threshold
      const ateWhileLocked = A.maybeAutoEat();
      assert(ateWhileLocked === false && G.playerHp === 1,
        'auto-eat must NOT fire without the trait, even when enabled + low HP');
      G.traits.auto_eat = true;                        // unlocked
      const ateWhenUnlocked = A.maybeAutoEat();
      assert(ateWhenUnlocked === true && G.playerHp > 1,
        'auto-eat must fire once the trait is unlocked');
    } finally {
      G.traits = saved.traits; G.autoActions = saved.auto;
      G.inventory = saved.inv; G.playerHp = saved.hp; G.playerMaxHp = saved.maxHp;
    }
  }),
  // b227 (Tyler): auto-eat is a BOUNTY MARK purchase (100 marks), not gold —
  // earned at the board, and gold must never be touched by the buy.
  () => tryRunAsync('b227/b46x: buyTrait routes to hr_trait_buy under arm and spends Marks, never gold', async () => {
    const G = window.G;
    assert(typeof window.buyTrait === 'function', 'window.buyTrait missing');
    const saved = {
      gold: G.gold, marks: G.marks,
      traits: JSON.parse(JSON.stringify(G.traits || {})),
      auto: JSON.parse(JSON.stringify(G.autoActions || {}))
    };
    const R = window.HearthriseRecord;
    const S = window.HearthriseGold;
    const realBuyTrait = S && S.buyTrait;
    const realRequestRecord = R && R.requestRecord;
    const realNotify = window.notify;
    try {
      G.traits = {};
      G.bountyHunter = G.bountyHunter || {};

      /* ── b46x: THE ARMED CONTRACT COMES FIRST, AND IT IS NO LONGER A REFUSAL ──
         For two builds the armed branch was a bare "That upgrade is unavailable
         right now" — correct (a raw client debit on a server-owned balance is a
         self-mint) and a P0 in production, because AUTO-EAT is the purchase the
         death sheet teaches on a player's FIRST death and nobody could buy it.
         hr_trait_buy (supabase/migrations/2026-08-23-trait-buy.sql) is the server
         verb; the client contract this guards is exactly three things:
           1. under arm the gesture CALLS THE TRANSPORT (it does not refuse),
           2. it NEVER debits a balance locally — not marks, not gold — because
              the server owns both and the receipt is for rendering only,
           3. `applied` grants the trait; a refusal does NOT, and says why.
         The transport itself is stubbed, so this is a statement about legacy.js
         and not about the network. tests/trait-buy.mjs owns the server half. */
      const marksArmed = typeof window.clientMayWriteRecordField === 'function'
        && window.clientMayWriteRecordField('marks') === false;
      if (marksArmed && S) {
        assert(typeof realBuyTrait === 'function',
          'HearthriseGold.buyTrait is missing — under the marks arm buyTrait() has nothing to route '
          + 'to and every trait in the game is unbuyable');
        const settle = () => new Promise((r) => setTimeout(r, 0));
        const calls = [];
        const toasts = [];
        window.notify = (m) => { toasts.push(String(m)); };
        if (R) R.requestRecord = () => Promise.resolve({ outcome: 'stubbed' });

        // (1) APPLIED — the transport is called, nothing is locally debited, the
        //     trait is granted from the SERVER's owned set.
        S.buyTrait = (id, key) => {
          calls.push({ id, key });
          return Promise.resolve({ outcome: 'applied', reason: null, trait: id, key,
            owned: [id], marks: 135, gold: null, name: 'Auto-Eat I' });
        };
        G.marks = 150; G.gold = 999999;
        stampRecordLikeLoad(G);   // a genuinely KNOWN, genuinely sufficient balance
        window.buyTrait('auto_eat');
        await settle();
        assert(calls.length === 1 && calls[0].id === 'auto_eat',
          'ARMED: buyTrait did not call the hr_trait_buy transport (calls: '
          + JSON.stringify(calls) + ') — the purchase is dead again');
        assert(typeof calls[0].key === 'string' && /^[0-9a-f-]{36}$/i.test(calls[0].key),
          'ARMED: the purchase carried no idempotency key, so a retry would debit twice; got '
          + calls[0].key);
        assert(G.traits && G.traits.auto_eat === true,
          'ARMED: an applied purchase did not grant the trait');
        assert(G.marks === 150,
          'ARMED: buyTrait client-debited a server-owned marks balance, got ' + G.marks
          + ' — the server owns the debit and the receipt is for rendering only');
        assert(G.gold === 999999, 'ARMED: buyTrait must NEVER touch gold for a marks trait');
        assert(toasts.some((t) => /Unlocked/i.test(t)),
          'ARMED: an applied purchase said nothing to the player; toasts=' + JSON.stringify(toasts));

        // (2) REFUSED — the trait is NOT granted and the reason is told honestly.
        G.traits = {};
        toasts.length = 0;
        calls.length = 0;
        S.buyTrait = (id, key) => {
          calls.push({ id, key });
          return Promise.resolve({ outcome: 'refused', reason: 'insufficient_marks', trait: id, key,
            owned: null, marks: null, gold: null, name: null });
        };
        window.buyTrait('auto_eat');
        await settle();
        assert(calls.length === 1, 'ARMED: the refused purchase did not reach the transport');
        assert(!(G.traits && G.traits.auto_eat),
          'ARMED: a REFUSED purchase granted the trait anyway — the client would own a trait the '
          + 'server never sold, and the next envelope would not take it back');
        assert(G.marks === 150 && G.gold === 999999,
          'ARMED: a refused purchase moved a balance (' + G.marks + '/' + G.gold + ')');
        assert(toasts.some((t) => /Bounty Marks/i.test(t)),
          'ARMED: the refusal did not name its reason; toasts=' + JSON.stringify(toasts)
          + ' — one opaque sentence for every failure is what made this shop unfixable for two builds');

        // (3) THE PREREQUISITE REFUSAL renders from the authored table, by name.
        toasts.length = 0;
        S.buyTrait = (id, key) => Promise.resolve({ outcome: 'refused', reason: 'requires:auto_eat',
          trait: id, key, owned: null, marks: null, gold: null, name: null });
        window.buyTrait('auto_eat_2');
        await settle();
        assert(!(G.traits && G.traits.auto_eat_2), 'ARMED: a prerequisite refusal still granted tier II');
        assert(toasts.some((t) => /Auto-Eat I/.test(t)),
          'ARMED: `requires:auto_eat` must render the required trait\'s NAME; toasts='
          + JSON.stringify(toasts));
      }

      /* ── AND THE SPEND MECHANICS, in the position where the client owns them.
         Still shipped code (the kill-switch/dormant position), and the day the
         marks spend gets its server verb this is the arithmetic it must match. */
      if (R && typeof R.__setMarksRecordArm === 'function') {
        try {
          R.__setMarksRecordArm(false);
          G.traits = {};
          /* b459: the price is data (TRAITS), not a literal — Auto-Eat became a
             15-Mark tier I. Short-marks = cost-5; the deduction asserts 150-cost. */
          const _aeCost = (window.TRAITS && window.TRAITS.auto_eat && window.TRAITS.auto_eat.cost) || 15;
          G.marks = _aeCost - 5;
          G.gold = 999999;
          window.buyTrait('auto_eat');
          assert(!(G.traits && G.traits.auto_eat) && G.marks === _aeCost - 5,
            'buyTrait must refuse on short marks (no unlock, no marks spent) — gold is irrelevant');
          assert(G.gold === 999999, 'buyTrait must NEVER touch gold for a marks trait');
          G.marks = 150;
          window.buyTrait('auto_eat');
          assert(G.traits.auto_eat === true, 'buyTrait must unlock when marks afford it');
          assert(G.marks === 150 - _aeCost, 'buyTrait must deduct TRAITS.auto_eat.cost (' + _aeCost + '), got ' + G.marks);
          assert(G.gold === 999999, 'gold untouched after a successful marks purchase');
        } finally { R.__setMarksRecordArm(null); }
      }
    } finally {
      if (S && realBuyTrait) S.buyTrait = realBuyTrait;
      if (R && realRequestRecord) R.requestRecord = realRequestRecord;
      window.notify = realNotify;
      if (G._traitBuying) G._traitBuying = {};
      G.gold = saved.gold; G.traits = saved.traits; G.autoActions = saved.auto;
      G.marks = saved.marks;
      stampRecordLikeLoad(G);
    }
  }),
  /* b44x: MARKS STORAGE MIGRATION (nested→top-level). Marks are a record field
     keyed at the TOP LEVEL (G.marks); the framework strip only removes a top-level
     key, so the client home must be top-level or a stale nested copy coexists with
     the server record under arm (the two-sources bug). ensureBountyState() migrates
     a legacy nested value up ONCE and drops the nested mirror, so there is exactly
     ONE client home. This guards that back-compat + single-source contract. */
  () => tryRun('b44x: marks migrate nested→top-level G.marks (single home)', () => {
    const G = window.G;
    const saved = { marks: G.marks, bh: JSON.parse(JSON.stringify(G.bountyHunter || {})) };
    const R = window.HearthriseRecord;
    try {
      /* ── b456: THE ONE-HOME RULE HOLDS IN **BOTH** ARM STATES, and that is the
         whole contract. What changes with the arm is who may WRITE the home:
           ARMED   → nobody but applyRecord. ensureBountyState must NOT author a
                     top-level G.marks (it is stripped and supplied by the record),
                     but it must STILL drop the nested mirror — otherwise a stale
                     client copy coexists with the server value, which is exactly
                     the two-sources bug this migration exists to end.
           DORMANT → the client owns G.marks, so the legacy nested value migrates
                     up ONCE and an existing top-level value is never clobbered. */
      const marksArmed = typeof window.clientMayWriteRecordField === 'function'
        && window.clientMayWriteRecordField('marks') === false;
      if (marksArmed) {
        G.bountyHunter = Object.assign({}, G.bountyHunter, { marks: 63 });
        delete G.marks;
        window.ensureBountyState();
        assert(!('marks' in G.bountyHunter),
          'ARMED: the nested bountyHunter.marks mirror survived — a stale client copy beside the server record');
        assert(typeof G.marks !== 'number',
          'ARMED: ensureBountyState authored a top-level G.marks (' + G.marks + ') on a server-owned field — '
          + 'the record is the only writer, and a client seed here is a forgeable balance');
      }

      if (R && typeof R.__setMarksRecordArm === 'function') {
        try {
          R.__setMarksRecordArm(false);
          // A legacy save shape: only the NESTED value, no top-level home yet.
          G.bountyHunter = Object.assign({}, G.bountyHunter, { marks: 63 });
          delete G.marks;
          window.ensureBountyState();
          assert(G.marks === 63, 'ensureBountyState must migrate the legacy nested marks up to G.marks, got ' + G.marks);
          assert(!('marks' in G.bountyHunter), 'the nested bountyHunter.marks mirror must be dropped — one home only');
          // marksOf reads the migrated top-level value.
          const MR = window.HearthriseMarks;
          assert(MR && MR.marksOr(G, -1) === 63, 'marksOf must read the migrated top-level value');
          // A save that ALREADY has a top-level value is not clobbered by a stray nested one.
          G.marks = 10;
          G.bountyHunter.marks = 999;
          window.ensureBountyState();
          assert(G.marks === 10, 'an existing top-level G.marks must not be overwritten by a nested value, got ' + G.marks);
          assert(!('marks' in G.bountyHunter), 'a stray nested marks must still be dropped');
        } finally { R.__setMarksRecordArm(null); }
      }
    } finally { G.marks = saved.marks; G.bountyHunter = saved.bh; }
  }),
  /* bug #5 (Paione, live): a CULL bounty that reaches target but hangs because
     the away/span-sim undercounts the attended player's kills. completeBounty
     must now CREDIT the server counter with the observed kills (hr_credit_kills)
     BEFORE it fires the turn-in (hr_claim_bounty), so the counter reaches target
     and the claim completes. This asserts the client wiring: the credit call
     carries the observed count and precedes the claim; on a held (denied) turn-in
     the bar reconciles to the server-confirmed count and shows the calm notice. */
  () => tryRunAsync('bug #5: completeBounty credits observed kills BEFORE the turn-in (cull, armed)', async () => {
    const G = window.G;
    assert(window.HearthriseGoalClaim && typeof window.HearthriseGoalClaim.creditKills === 'function',
      'HearthriseGoalClaim.creditKills transport is missing — the credit RPC is unwired');
    const armed = typeof window.clientMayWriteRecordField === 'function'
      && window.clientMayWriteRecordField('gold') === false;
    if (!armed) return; // the server-gated turn-in path only runs under the gold arm

    const target = (window.MONSTERS && window.MONSTERS.goblin) ? 'goblin' : Object.keys(window.MONSTERS || {})[0];
    const saved = { bh: JSON.parse(JSON.stringify(G.bountyHunter || {})), gc: window.HearthriseGoalClaim };
    const calls = [];
    // Stub the transport: record order + args; hold the turn-in (ok:false) so we
    // observe the reconcile path without running finalizeBounty's side effects.
    window.HearthriseGoalClaim = Object.assign({}, saved.gc, {
      isSignedIn: function () { return true; },
      creditKills: function (t, claimed) { calls.push({ fn: 'credit', t: t, claimed: claimed }); return Promise.resolve({ ok: true, progress: 3, required: 5 }); },
      claimBounty: function () { calls.push({ fn: 'claim' }); return Promise.resolve({ ok: false, error: 'incomplete' }); }
    });
    try {
      window.ensureBountyState && window.ensureBountyState();
      G.bountyHunter.active = { id: 'b_test', type: 'cull', target: target, difficulty: 'normal',
        required: 5, progress: 7, rewards: { gold: 320, marks: 6, xp: 45 } };
      window.completeBounty();
      // creditKills fires SYNCHRONOUSLY; the turn-in is chained on a microtask.
      assert(calls.length === 1 && calls[0].fn === 'credit',
        'creditKills must fire first and synchronously; call log: ' + JSON.stringify(calls));
      assert(calls[0].claimed === 7, 'creditKills must carry the OBSERVED kill count (7), got ' + calls[0].claimed);
      await Promise.resolve(); await Promise.resolve();
      assert(calls.some((c) => c.fn === 'claim'), 'the turn-in (claimBounty) must run after the credit resolves');
      const ci = calls.findIndex((c) => c.fn === 'credit'), qi = calls.findIndex((c) => c.fn === 'claim');
      assert(ci < qi, 'credit must precede the turn-in: ' + JSON.stringify(calls));
      const ab = G.bountyHunter.active;
      assert(ab && ab._serverConfirmed === 3,
        'a held turn-in must reconcile the confirmed count DOWN to the server value (3), got ' + (ab && ab._serverConfirmed));
    } finally {
      window.HearthriseGoalClaim = saved.gc;
      G.bountyHunter = saved.bh;
    }
  }),
  /* ── SETTLED KILLS REACH THE BAR (found by playing) ────────────────────────
     Measured on the QA account: ev:kill_monster:mandrake = 218 real kills, board
     reading 9/20, contract never turned in. hr_claim_bounty has judged the
     turn-in as hr_bounty_kills - baseline since the bounty schema landed, so
     every away kill ALREADY counted; the client rendered a local attended-only
     counter and could not see them. hr_state_of now projects
     `state.bounty.progress`, and these three tests are its contract. See
     bountyRig() above for the shared stub. */
  () => tryRun('bounty: the envelope\'s server progress renders OVER the local attended counter', () => {
    const G = window.G, rig = bountyRig();
    try {
      assert(typeof window.hrNoteServerBounty === 'function' && typeof window.bountyShownProgress === 'function',
        'the server-bounty seam is missing — hrNoteServerBounty/bountyShownProgress are the whole fix');
      // The live shape: 9 attended kills locally, 218 real kills server-side.
      const ab = rig.set({ id: 'b_settled', type: 'cull', target: rig.target, difficulty: 'normal',
        required: 20, progress: 9, rewards: { gold: 100, marks: 6, xp: 40 } });
      assert(window.bountyShownProgress(ab) === 9, 'precondition: with no server value the local counter shows');
      const rec = window.hrNoteServerBounty(rig.envelope('b_settled', 218));
      assert(rec && rec.noted === true, 'a matching envelope bounty must be adopted; got ' + JSON.stringify(rec));
      assert(ab._serverConfirmed === 20, 'the server progress must land clamped to `required` (20), got ' + ab._serverConfirmed);
      assert(window.bountyShownProgress(ab) === 20, 'the bar must show the SERVER 20, not the local 9 — got ' + window.bountyShownProgress(ab));
      assert(window.bountyProgressText(ab) === '20 / 20', 'the text must read the server count, got "' + window.bountyProgressText(ab) + '"');
      // A finished contract offering only "Fight target" is the bug with a full bar.
      assert(/hrTurnInBounty\(\)/.test(String(window.renderBountyPanel() || '')),
        'a finished contract must show the Claim control on the board');

      // THE OTHER DIRECTION ("full bar that will not pay"): local never exceeds server.
      const ah = rig.set({ id: 'b_ahead', type: 'cull', target: rig.target, difficulty: 'normal',
        required: 20, progress: 19, rewards: { gold: 100, marks: 6, xp: 40 } });
      window.hrNoteServerBounty(rig.envelope('b_ahead', 4));
      assert(window.bountyShownProgress(ah) === 4, 'a local 19 must never exceed the server 4; got ' + window.bountyShownProgress(ah));

      // FAIL-SAFE + IDENTITY: a foreign id, or no key at all, writes nothing.
      const miss = window.hrNoteServerBounty(rig.envelope('someone_elses', 20));
      assert(miss.noted === false && miss.reason === 'mismatch', 'an envelope for a DIFFERENT bounty must be refused: ' + JSON.stringify(miss));
      const none = window.hrNoteServerBounty({ state: { gold: 5 } });
      assert(none.noted === false && none.reason === 'no_key', 'an envelope without the key must be a no-op: ' + JSON.stringify(none));
      assert(ah._serverConfirmed === 4, 'neither refusal may move the confirmed count, got ' + ah._serverConfirmed);
    } finally { rig.restore(); }
  }),
  /* A FINISHED CONTRACT IS NEVER BURNED WITHOUT A RECEIPT (P2). The away replay
     reaches completeBounty with inOfflineReplay() true, so control fell through
     to finalizeBounty(), which nulls the active bounty — and under the ARM that
     finalize pays NOTHING, so a contract FINISHED away vanished with its Marks
     unclaimed and nothing left to claim from. */
  () => tryRun('bounty: the away replay never finalizes a cull contract without the server\'s claim receipt', () => {
    const G = window.G, P = window.HearthrisePresence, rig = bountyRig();
    try {
      if (!rig.armed) { skip('the hold only applies under the gold arm'); return; }
      G.bountyHunter.completed = 0;
      const held = rig.set({ id: 'b_away', type: 'cull', target: rig.target, difficulty: 'normal',
        required: 5, progress: 5, rewards: { gold: 320, marks: 6, xp: 45 } });
      P._withOfflineReplay(function () { window.completeBounty(); });
      assert(G.bountyHunter.active === held, 'the away replay CLEARED the active bounty — a finished contract lost with its Marks unclaimed');
      assert(held._awaitingServerClaim === true, 'the held contract must be latched as awaiting the server claim');
      assert(!held._confirmed, 'nothing may be marked confirmed without a server receipt');
      assert(G.bountyHunter.completed === 0, 'the replay must not count a completion the server has not paid, got ' + G.bountyHunter.completed);
    } finally { rig.restore(); }
  }),
  /* The turn-in the player came back to: a projected progress at/above the
     requirement fires the EXISTING two-phase server turn-in (credit → claim),
     reward from the RESPONSE. Without the schedule the contract sits
     finished-but-unclaimed forever — the local counter never gets there. */
  () => tryRunAsync('bounty: a server-finished contract fires the hr_claim_bounty turn-in on the envelope', async () => {
    const G = window.G, rig = bountyRig({ credit: { ok: true, progress: 12 } });
    try {
      if (!rig.armed) { skip('the server-gated turn-in only runs under the gold arm'); return; }
      // Local counter STUCK at 2 (two attended kills); the server has 21 of 12.
      rig.set({ id: 'b_return', type: 'cull', target: rig.target, difficulty: 'normal',
        required: 12, progress: 2, rewards: { gold: 320, marks: 6, xp: 45 } });
      const rec = window.hrNoteServerBounty(rig.envelope('b_return', 21));
      assert(rec.turnIn === true, 'a server-finished contract must schedule the turn-in; got ' + JSON.stringify(rec));
      assert(rig.calls.length === 1 && rig.calls[0].fn === 'credit', 'the two-phase path credits first; log: ' + JSON.stringify(rig.calls));
      await Promise.resolve(); await Promise.resolve();
      assert(rig.calls.some((c) => c.fn === 'claim'), 'the claim must go through hr_claim_bounty; log: ' + JSON.stringify(rig.calls));
      assert(G.bountyHunter.active && !G.bountyHunter.active._confirmed,
        'a REFUSED claim must leave the contract active — the client never finalizes on its own');
    } finally { rig.restore(); }
  }),
  /* bug #5 ROOT (Paione, live): the b484 credit only fired at target, and the
     cap grows with elapsed — so a burst of fast kills reached the bar while the
     server cap was still below it, the turn-in was refused, the player stopped,
     and the retry (gated on "the next kill") never came. This asserts the ROOT
     wiring: a CULL kill BELOW target now feeds the server counter on a throttled
     cadence, and it does NOT complete the bounty (completeBounty owns at target). */
  () => tryRunAsync('bug #5 ROOT: cull kills below target credit the server counter on a cadence (not only at target)', async () => {
    const G = window.G;
    if (typeof window.handleBountyKill !== 'function') { skip('bounty seam absent'); return; }
    assert(window.HearthriseGoalClaim && typeof window.HearthriseGoalClaim.creditKills === 'function',
      'creditKills transport missing');
    const armed = typeof window.clientMayWriteRecordField === 'function'
      && window.clientMayWriteRecordField('gold') === false;
    if (!armed) return; // the server credit cadence only runs under the gold arm
    const target = (window.MONSTERS && window.MONSTERS.goblin) ? 'goblin' : Object.keys(window.MONSTERS || {})[0];
    const saved = { bh: JSON.parse(JSON.stringify(G.bountyHunter || {})), gc: window.HearthriseGoalClaim };
    const calls = [];
    window.HearthriseGoalClaim = Object.assign({}, saved.gc, {
      isSignedIn: function () { return true; },
      creditKills: function (t, claimed) { calls.push({ t: t, claimed: claimed }); return Promise.resolve({ ok: true, progress: claimed, required: 20 }); },
      claimBounty: function () { calls.push({ fn: 'claim' }); return Promise.resolve({ ok: false, error: 'incomplete' }); }
    });
    try {
      window.ensureBountyState && window.ensureBountyState();
      G.bountyHunter.active = { id: 'b_cad', type: 'cull', target: target, difficulty: 'normal',
        required: 20, progress: 0, rewards: { gold: 100, marks: 3, xp: 10 } };
      const b = G.bountyHunter.active;
      // First kill below target → one credit fires; the throttle then suppresses
      // an immediate second kill (the cap is time-based, so a burst buys nothing).
      window.handleBountyKill(target, window.MONSTERS[target]);
      window.handleBountyKill(target, window.MONSTERS[target]);
      window.handleBountyKill(target, window.MONSTERS[target]);
      await Promise.resolve();
      const credits = calls.filter((c) => !c.fn);
      assert(credits.length === 1, 'a below-target kill must credit the server counter ONCE per cadence window; got ' + credits.length);
      assert(credits[0].t === target, 'the credit must carry the bounty target');
      assert(!calls.some((c) => c.fn === 'claim'), 'a below-target kill must NOT fire the turn-in (completeBounty owns at target)');
      // Force the cadence window open and confirm a later kill credits again.
      b._creditAt = Date.now() - 60000;
      window.handleBountyKill(target, window.MONSTERS[target]);
      await Promise.resolve();
      assert(calls.filter((c) => !c.fn).length === 2, 'a kill after the cadence window must credit again');
    } finally {
      window.HearthriseGoalClaim = saved.gc;
      G.bountyHunter = saved.bh;
    }
  }),
  /* live report #41 residual (the kill-DAILY gap): daily AND weekly kill goals are
     graded on the SERVER row player_progress(kind='daily', key='ev:kill_any'),
     whose only writer was the away/span-sim (60-99% undercount). hr_credit_kills
     tops that count up — but its ONLY client caller was the cull-bounty cadence,
     so a player killing with NO bounty credited nothing and their kill-30 daily
     sat at "30/30 · Confirming…" with no Claim. Every kill must now buffer for the
     credit, bounty or not; a kill on the ACTIVE bounty target must NOT double-
     buffer (that target has its own cumulative cadence); and a flush must subtract
     exactly what the SERVER says it accepted, never what the client sent. */
  () => tryRunAsync('report #41: kills with NO bounty buffer for the server daily-kill credit', async () => {
    const G = window.G;
    if (typeof window.handleBountyKill !== 'function') { skip('bounty seam absent'); return; }
    assert(typeof window.hrKillCreditFlush === 'function',
      'hrKillCreditFlush is missing — the bounty-free kill credit is unwired and the daily goal is dead');
    const armed = typeof window.clientMayWriteRecordField === 'function'
      && window.clientMayWriteRecordField('gold') === false;
    if (!armed) return; // the server credit path only runs under the gold arm
    const ids = Object.keys(window.MONSTERS || {});
    const free = ids[0]; const bountied = ids[1] || ids[0];
    if (!free || free === bountied) { skip('need two distinct monsters'); return; }
    const saved = { bh: JSON.parse(JSON.stringify(G.bountyHunter || {})), gc: window.HearthriseGoalClaim,
      pend: G._killCreditPending };
    const calls = [];
    window.HearthriseGoalClaim = Object.assign({}, saved.gc, {
      isSignedIn: function () { return true; },
      // Credit only 2 of whatever is claimed, so "subtract what the server took"
      // is distinguishable from "subtract what we sent".
      creditKills: function (t, claimed) { calls.push({ t: t, claimed: claimed }); return Promise.resolve({ ok: true, bounty: false, credit: 2, credited: 2 }); }
    });
    try {
      window.ensureBountyState && window.ensureBountyState();
      G._killCreditPending = {};
      // A cull bounty is running on `bountied` — its kills belong to that cadence.
      G.bountyHunter.active = { id: 'b_free', type: 'cull', target: bountied, difficulty: 'normal',
        required: 20, progress: 0, rewards: { gold: 100, marks: 3, xp: 10 } };
      window.handleBountyKill(free, window.MONSTERS[free]);
      window.handleBountyKill(free, window.MONSTERS[free]);
      window.handleBountyKill(free, window.MONSTERS[free]);
      assert((G._killCreditPending[free] || 0) >= 1,
        'a kill with NO bounty on that monster must buffer for the daily-kill credit; buffered '
        + (G._killCreditPending[free] || 0));
      window.handleBountyKill(bountied, window.MONSTERS[bountied]);
      assert(!(bountied in G._killCreditPending),
        'a kill on the ACTIVE bounty target must NOT double-buffer — the bounty cadence owns it '
        + 'with cumulative semantics');
      /* Drain whatever the kills started. Like hrCreditCombatXpFlush, a fresh
         session's FIRST kill flushes immediately (the cadence window is open), so
         a call may already be in flight; the assertions below must not race it. */
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
      // Re-seed a KNOWN backlog so the payload assertion is exact regardless of
      // what the immediate first-kill flush happened to send.
      G._killCreditPending = {}; G._killCreditPending[free] = 3;
      const before = calls.length;
      await window.hrKillCreditFlush(true);
      const mine = calls.slice(before).filter((c) => c.t === free);
      assert(mine.length === 1, 'a forced flush must send exactly one credit for the pending target; got '
        + mine.length);
      assert(mine[0].claimed === 3, 'the flush must carry the OBSERVED count (3), got ' + mine[0].claimed);
      assert((G._killCreditPending[free] || 0) === 1,
        'the flush must subtract what the SERVER credited (2 of 3), leaving 1 pending; left '
        + (G._killCreditPending[free] || 0));
      const after = calls.length;
      await window.hrKillCreditFlush();
      assert(calls.length === after,
        'an unforced flush inside the cadence window must send nothing — the cap is time-based, so '
        + 'a faster cadence buys nothing and every call costs a log row');
    } finally {
      if (window.hrKillCreditFlush.clearTrail) window.hrKillCreditFlush.clearTrail();
      window.HearthriseGoalClaim = saved.gc;
      G.bountyHunter = saved.bh;
      G._killCreditPending = saved.pend;
    }
  }),
  /* report #41, THE STOP CASE — and it is the whole reported symptom, not an edge.
     b484 shipped the bounty credit gated on "the next kill" and that is exactly how
     a bounty came to hang forever: the player reaches the target, STOPS, and a retry
     that only fires on a kill never fires again (b485 had to add
     hrScheduleBountyRetry for it). A daily-kill cadence hung off the kill hook
     reproduces the same defect — the kills observed inside the last window sit
     unsent and the goal stays "30/30 · Confirming…". So after a kill there must be
     a SCHEDULED drain that does not need another kill, it must keep going while a
     backlog remains, and it must stop once the backlog is empty (an idle tab that
     calls a money-adjacent RPC on a timer for ever is its own defect). */
  () => tryRunAsync('report #41: stopping at target still drains — a scheduled credit, not one gated on the next kill', async () => {
    const G = window.G;
    if (typeof window.handleBountyKill !== 'function') { skip('bounty seam absent'); return; }
    assert(typeof window.hrKillCreditFlush === 'function'
      && typeof window.hrKillCreditFlush.trailArmed === 'function',
      'the trailing drain seam is missing — a player who stops at target would sit in '
      + '"Confirming…" until they kill again, which is the b484 bounty defect reintroduced');
    const armed = typeof window.clientMayWriteRecordField === 'function'
      && window.clientMayWriteRecordField('gold') === false;
    if (!armed) return; // the server credit path only runs under the gold arm
    const free = Object.keys(window.MONSTERS || {})[0];
    if (!free) { skip('no monsters'); return; }
    const saved = { bh: JSON.parse(JSON.stringify(G.bountyHunter || {})), gc: window.HearthriseGoalClaim,
      pend: G._killCreditPending };
    let credit = 2;   // the server accepts only part of each claim (the cap)
    const calls = [];
    window.HearthriseGoalClaim = Object.assign({}, saved.gc, {
      isSignedIn: function () { return true; },
      creditKills: function (t, claimed) { calls.push({ t: t, claimed: claimed }); return Promise.resolve({ ok: true, bounty: false, credit: credit }); }
    });
    try {
      window.ensureBountyState && window.ensureBountyState();
      G.bountyHunter.active = null;
      G._killCreditPending = {};
      window.hrKillCreditFlush.clearTrail();
      // Nine kills observed; the server's cap accepts 2. Then the player STOPS.
      G._killCreditPending[free] = 9;
      await window.hrKillCreditFlush(true);
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
      assert((G._killCreditPending[free] || 0) === 7,
        'the server accepted 2 of 9, so 7 must stay pending; left ' + (G._killCreditPending[free] || 0));
      // THE PROPERTY: with a backlog and NO further kill, a drain is SCHEDULED.
      window.hrKillCreditFlush.armTrail();
      assert(window.hrKillCreditFlush.trailArmed() === true,
        'with kills still pending and the player stopped, a drain must be SCHEDULED — otherwise the '
        + 'daily counter never reaches target and the goal parks in "Confirming…" for ever');
      // …and the drain really drains: the next window carries the REMAINING count.
      window.hrKillCreditFlush.clearTrail();
      const before = calls.length;
      credit = 7;
      await window.hrKillCreditFlush(true);
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
      assert(calls.length === before + 1, 'the drain must send exactly one credit per window');
      assert(calls[calls.length - 1].claimed === 7,
        'the drain must carry the REMAINING observed count (7), got ' + calls[calls.length - 1].claimed);
      assert(window.hrKillCreditFlush.pendingTotal() === 0,
        'the backlog must be empty once the server has taken it; left ' + window.hrKillCreditFlush.pendingTotal());
      // …and an empty backlog leaves no timer behind.
      assert(window.hrKillCreditFlush.trailArmed() === false,
        'an empty backlog must leave NO scheduled drain — an idle tab must not call a '
        + 'money-adjacent RPC on a timer for ever');
      window.hrKillCreditFlush.armTrail();
      assert(window.hrKillCreditFlush.trailArmed() === false,
        'arming with nothing pending must be a no-op');
    } finally {
      if (window.hrKillCreditFlush.clearTrail) window.hrKillCreditFlush.clearTrail();
      window.HearthriseGoalClaim = saved.gc;
      G.bountyHunter = saved.bh;
      G._killCreditPending = saved.pend;
    }
  }),
  // b269 (Tyler): purchasable bank space. Cap counts distinct stacks; gold path
  // escalates; gem path is the better-value premium deal; can't overspend.
  /* b4xx: CLIENT-AUTHORITATIVE now — buyBankSpaceGold() is wired to unlock_buy
     (seam:bank.buy_gold). With the accrual switch ON but no server configured in
     the harness, the fired intent answers `unconfigured` and rolls the local debit
     back, so the exact-deduction assertions below must run with the switch OFF —
     the shipping-today path, and the same discipline slice 1 applied to its debit
     tests. The gem path and the cap arithmetic are switch-independent.
     gold-arm: gold/gems are ARMED, so the debit lands and the affordability check
     reads a KNOWN balance only after the stamp — stampBalanceLikeLoad below. */
  () => tryRunAsync('b269: buying bank space raises the cap; gold escalates; and the gem rung has no server verb', async () => {
    const G = window.G;
    assert(typeof window.buyBankSpaceGold === 'function', 'buyBankSpaceGold missing');
    assert(typeof window.buyBankSpaceGem === 'function', 'buyBankSpaceGem missing');
    assert(typeof window.bankCap === 'function' && typeof window.bankGoldCost === 'function', 'bank helpers missing');
    const BS = window.BANK_SPACE;
    const saved = { gold: G.gold, gems: G.gems, bank: JSON.parse(JSON.stringify(G.bank || {})), cap: G._bankCap };
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
    } finally { G.gold = saved.gold; G.gems = saved.gems; G.bank = saved.bank; restoreBankCap(saved.cap); }
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
  () => tryRun('b269: v10→v11 migration grandfathers cap above existing distinct stacks', () => {
    assert(typeof window.applyMigrations === 'function', 'applyMigrations missing');
    const inv = {}; for (let i = 0; i < 260; i++) inv['probe_item_' + i] = 1; // 260 stacks > BASE_CAP
    const out = window.applyMigrations({ v: 10, inventory: inv });
    assert(out.bank && typeof out.bank.grandfather === 'number', 'migration must seed G.bank');
    const cap = window.BANK_SPACE.BASE_CAP + out.bank.goldBuys * window.BANK_SPACE.gold.slots
      + out.bank.gemBuys * window.BANK_SPACE.gem.slots + out.bank.grandfather;
    assert(cap >= 260, 'grandfathered cap (' + cap + ') must cover existing 260 stacks — nobody worse off');
    // Idempotent: re-running must not inflate the cap further.
    const out2 = window.applyMigrations(out);
    assert(out2.bank.grandfather === out.bank.grandfather, 'migration must be idempotent');
  }),
  () => tryRun('b217: migration grandfathers pre-v6 saves that already had auto-eat', () => {
    assert(typeof window.applyMigrations === 'function', 'window.applyMigrations missing');
    // A pre-v6 save with auto-eat enabled must come out with the trait granted.
    const legacy = window.applyMigrations({ v: 5, autoActions: { eat: { enabled: true, threshold: 0.5, foodId: 'cooked_shrimp' } } });
    assert(legacy.traits && legacy.traits.auto_eat === true,
      'existing players with auto-eat enabled must be grandfathered the trait on load');
    // A pre-v6 save that never used auto-eat must NOT get it for free.
    const clean = window.applyMigrations({ v: 5, autoActions: { eat: { enabled: false, threshold: 0.5, foodId: null } } });
    assert(!(clean.traits && clean.traits.auto_eat),
      'players who never enabled auto-eat must not be granted the trait');
  }),
  // b206 wrote this test against the ORIGINAL ladder (+25% allXP, +8% gather,
  // +5% artisan, +3h offline, all earned by banking gold). b223 re-scoped that
  // ladder to a membership BASELINE — clan-overhaul §8.3 — because with the
  // castle on top `allXP` alone would have stacked homestead 20 + renown 22 +
  // auto-level 25 + Great Hall 5 = +72%. The contract changed, so the test
  // changed with it, and it now asserts the thing that is easy to lose: that
  // the stat grants really are GONE, not merely smaller.
  () => tryRun('b223: the clan auto-level ladder is a membership baseline, not a stat ladder', () => {
    const C = window.HearthriseClans;
    assert(C, 'HearthriseClans present');
    const p10 = C.perksFor(10);
    // The two survivors, and only these two.
    assert(p10.offlineHours === 3, 'Lv10 total offline hours should be 3 (1+2), got ' + p10.offlineHours);
    assert(C.perksFor(4).offlineHours === 1, 'Lv4 grants +1h offline');
    assert(C.perksFor(6).offlineHours === 1, 'no offline is added between Lv4 and Lv7');
    assert(C.perksFor(7).offlineHours === 3, 'Lv7 brings the total to 3h');
    // Every throughput stat the ladder used to hand out for free is now zero at
    // EVERY level. Banking gold buys the hold an age, not power.
    ['allXP', 'gatherSpeed', 'cookSpeed', 'smithSpeed', 'craftSpeed'].forEach((k) => {
      for (let lv = 1; lv <= 10; lv++) {
        assert(!C.perksFor(lv)[k], 'clan level ' + lv + ' must grant no ' + k + ', got ' + C.perksFor(lv)[k]);
      }
    });
    // Lv10 is still an event — it is just a cosmetic one, and it still says so.
    assert(p10.labels.some((l) => /banner/i.test(l)), 'the Lv10 banner should still be announced');
    assert(!p10.labels.some((l) => /%/.test(l)), 'no perk label may still promise a percentage: ' + p10.labels.join(' | '));
    assert(typeof C.offlineBonusHours() === 'number', 'offlineBonusHours callable');
    // no clan joined in tests → zero perk flows through getBonus without error
    assert(typeof window.getBonus('allXP') === 'number', 'getBonus still numeric with clan wrapper');
    // The header used to document a fourth, invented ladder ("10k, 50k, 200k,
    // 800k, 3M"). The real one is the server's, and it is now exported.
    // At level 4 the hold needs 640,000 banked to become level 5 — the spec's
    // §2.3 table, and the reason level 10 (655,360,000) could never be a gate.
    assert(C.nextTreasuryGoal(1) === 10000 && C.nextTreasuryGoal(4) === 640000
      && C.nextTreasuryGoal(9) === 655360000,
      'nextTreasuryGoal must mirror clan_contribute: 10000 x 4^(level-1)');
  }),
  () => tryRun('b206: IAP — web path can no longer mint receipts (free-gem exploit closed)', () => {
    // Source-inspection (the runner is sync; behavioral async asserts leak as
    // unhandled rejections). The exploit was `receipt={mock:true,...}` in the
    // web default branch — always approved by the mock validator.
    assert(window.IAP && typeof window.IAP.buy === 'function', 'window.IAP.buy exposed');
    const src = window.IAP.buy.toString();
    assert(src.indexOf('mock:true') === -1, 'web branch must not mint a mock receipt');
    assert(/not available in the web beta/.test(src), 'web branch should refuse honestly');
    assert(window.IAP.detectPlatform() === 'web', 'test env detects web platform');
  }),
  /* CLIENT-AUTHORITATIVE, deliberately. This test's subject is the redemption
     MATH (1 token in, exactly 150 gems out) — the switch-off path, byte-for-byte
     what has always shipped. Under the live gems arm redeemHearthToken now
     REFUSES rather than burning the IAP-only bond for gems the next envelope
     erases; that behaviour has its own test (GEM-TOKEN-1) and this one would
     otherwise fail for a reason that has nothing to do with the arithmetic. */
  () => tryRun('b206: hearth token — a real tradable item, and a redemption that REFUSES rather than burning it', () => {
    assert(window.ITEMS.hearth_token && window.ITEMS.hearth_token.premium, 'hearth_token item exists + premium flag');
    const G = window.G;
    const saved = { gems: G.gems, inv: JSON.parse(JSON.stringify(G.inventory || {})) };
    try {
      /* ── b515 — THE REDEMPTION INVERTS, AND THAT IS THE FIX, NOT A REGRESSION.
         This asserted the client burned a token and paid itself 150 gems. It
         ran with the b353 kill switch off, where a local gem credit WAS the
         payment; under the shipping arm `gems` is SERVER-OF-RECORD, nothing
         server-side has ever heard of this redemption, and the old path was the
         single worst trade in the game — it destroyed the IAP-only bond (the
         most valuable object a player can hold, and the ONE sanctioned
         cash→value path) with a local `removeItem`, and paid 150 gems the next
         envelope erased. The token does not come back either: the inventory
         absolute arm is dormant, so nothing restores it.

         `redeemHearthToken` therefore REFUSES while the client may not write the
         balance, and keeping the token is the only outcome here that is not a
         loss. What must hold is exactly that: nothing is consumed, nothing is
         credited, and the player is TOLD — a premium item that silently does
         nothing when tapped is how a bug report about a missing token starts.
         The server half is filed (HANDOFFS.md: an `hr_redeem_token`-shaped verb
         that consumes the token and credits the gems in ONE transaction).
         MUTATION: drop the `gemSpendIsClientAuthored()` gate → the token is
         burnt and the first assertion goes red. */
      G.inventory.hearth_token = 2;
      G.gems = 10;
      stampBalanceLikeLoad(G);
      const toasts = [];
      const realNotify = window.notify;
      window.notify = function (m) { toasts.push(String(m)); };
      try { window.redeemHearthToken(); } finally { window.notify = realNotify; }

      if (window.clientMayWriteRecordField('gems')) {
        // Pre-arm (or a future armed verb): the redemption pays, exactly once.
        assert(G.inventory.hearth_token === 1, 'redeem consumes exactly 1 token');
        assert(gemsOf() === 160, 'redeem grants exactly 150 gems, got ' + gemsOf());
      } else {
        assert((G.inventory.hearth_token || 0) === 2,
          'THE WORST TRADE IN THE GAME: the client BURNT a Hearth Token — the IAP-only bond — for gems '
          + 'the next envelope erases. Nothing server-side has heard of this redemption and the bag is '
          + 'merge-mode, so the token does not come back. Tokens left: ' + G.inventory.hearth_token);
        assert(gemsOf() === 10, 'the client credited itself gems for a redemption no server recorded: ' + gemsOf());
        assert(toasts.length >= 1 && /token/i.test(toasts.join(' ')),
          'the refusal was SILENT — a premium item that does nothing when tapped is how a bug report '
          + 'about a missing token starts: ' + JSON.stringify(toasts));
        assert(!/redeemed/i.test(toasts.join(' ')),
          'the refusal claimed the redemption happened: ' + JSON.stringify(toasts));
      }
      /* AND THE BOND IS NEVER MINTED IN PvE, whichever way the redemption goes.
         That is the Final Directive's line and it is asserted beside the thing
         most likely to break it. */
      assert(window.ITEMS.hearth_token.premium === true,
        'hearth_token lost its premium flag — the drop-table guards key on it');
    } finally {
      G.gems = saved.gems; G.inventory = saved.inv;
      try { stampBalanceLikeLoad(G); } catch (e) {}
    }
  }),
  () => tryRun('b208: market — live-backend seam present, sane offline defaults', () => {
    const M = window.HearthriseMarket;
    assert(M && typeof M.setBackend === 'function', 'HearthriseMarket.setBackend exists (was the missing wire to the finished Supabase backend)');
    assert(typeof M.refreshFromBackend === 'function' && typeof M.collectSaleProceeds === 'function', 'refresh + sales-collection exposed');
    assert(M.backendActive() === false || !!window.HearthriseAuth, 'backendActive only with auth');
    // signed-out: seeding still allowed (dev), listing flow still local + sync
    const G = window.G;
    const snap = snapshotG();
    try {
      G.inventory.normal_log = (G.inventory.normal_log || 0) + 5;
      const r = M.listItem('normal_log', 5, 3);
      assert(r && r.ok === true, 'local listItem still returns sync {ok:true}, got ' + JSON.stringify(r));
      const mine = M.myListings ? M.myListings() : null;
      // cancel it again to restore state (find via listings)
      const all = JSON.parse(localStorage.getItem('hearthrise:market:listings') || '[]');
      const l = all.filter(x => x.itemId === 'normal_log').slice(-1)[0];
      if (l) M.cancelListing(l.id);
    } finally { restoreGAndRecord(snap); }
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
    fixture.innerHTML =
      '<section id="panel-bounty" class="panel active"><div class="bb-board">' +
        '<article class="bb-notice"><p class="bb-task"><b>x</b></p><span class="bb-kind">x</span>' +
        '<div class="bb-pay"><span class="hr-inline"><span class="hr-amt">1</span></span></div>' +
        '<small class="muted">x</small></article></div></section>' +
      '<section id="panel-shop" class="panel active">' +
        '<div class="sc-scene"><span>x</span></div>' +
        '<div class="sc-counter"><div class="shop-row"><div class="info"><b>x</b><span>x</span></div>' +
          '<span class="price"><span class="hr-amt">1</span></span></div><div class="sc-sep">x</div></div>' +
        '<div class="iap-card"><div class="iap-icon"><span class="hr-glyph"></span></div>' +
          '<div class="desc">x</div><div class="iap-price"><small>x</small></div></div>' +
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

  () => tryRun('b215: no purchasable XP multiplier (Season Pass retired)', () => {
    // Premium must stay convenience/cosmetic. The Season Pass sold a permanent
    // +10% all-XP boost, which is pay-to-win against public leaderboards.
    const cat = window.IAP_CATALOG || [];
    cat.forEach(p => {
      assert(p.sku !== 'pass_season', 'the Season Pass must not be purchasable');
      assert(p.type !== 'pass', 'no XP-granting pass product should exist');
    });
    if (typeof window.getBonus === 'function') {
      const snap = snapshotG();
      try {
        // Even a forged legacy pass field must not grant XP any more.
        window.G.seasonPass = { sku: 'pass_season', expiresAt: Date.now() + 8.64e7, tier: 1 };
        const withPass = window.getBonus('allXP');
        delete window.G.seasonPass;
        const without = window.getBonus('allXP');
        assert(withPass === without,
          'a stale seasonPass still grants XP (' + withPass + ' vs ' + without + ')');
      } finally { restoreG(snap); }
    }
  }),

  () => tryRunAsync('b505: the store sells no gold and no accrual boost — permanently', async () => {
    /* Tyler, 2026-09-05: "Kill the starter bundle, remove ads, and both offline
       boosts." Three products left the catalogue and one perk left a product,
       and each was a CLASS rather than a mistake — so this guard asserts the
       class, not the deletion:

         · remove_ads     sold the removal of something that does not exist.
         · offline_boost  sold away-accrual (12h → 16h) on a ranked economy.
         · starter_bundle sold 200,000 GOLD for cash. Gold is the tradeable,
                          rankable currency, so money→gold makes the Hearth
                          Token bond — the ONE sanctioned cash→value path,
                          priced by players on the market — pointless.
         · "+25% offline progress" on Hearth Hall Premium. The SUBSCRIPTION is
                          deliberately still here; only the accrual line went.

       Two standing rules: NO IAP GRANTS GOLD, and NOTHING PURCHASABLE MOVES AN
       ACCRUAL RATE OR TOTAL. Both are checked on the authored catalogue AND on
       the generated one the SERVER charges out of (src/data/shops.js), because
       a product removed in legacy.js but left in the generated copy is still a
       sellable offer id. The runtime cap half is b226/b505 above; the retired
       XP pass is b215 above — this is their sibling, not a copy. */
    const cat = window.IAP_CATALOG || [];
    assert(cat.length > 0,
      'IAP_CATALOG is empty at runtime, so every assertion below would be vacuous');

    for (const sku of ['remove_ads', 'offline_boost', 'starter_bundle']) {
      assert(!cat.some((prod) => prod.sku === sku),
        'the removed product "' + sku + '" is back in IAP_CATALOG');
    }

    const BOOST = /offline\s*\+|offline\s*(progress|cap|boost|time)|\+\s*\d+\s*%\s*(offline|xp|progress|speed|yield)|\bxp\s*(boost|multiplier)\b/i;
    for (const prod of cat) {
      assert(!('gold' in prod),
        'IAP product "' + prod.sku + '" grants gold — no purchase may mint the tradeable, '
        + 'rankable currency, ever');
      assert(prod.ent !== 'offlinePlus' && prod.ent !== 'noAds',
        'IAP product "' + prod.sku + '" grants the retired entitlement "' + prod.ent + '"');
      const copy = String(prod.title || '') + ' — ' + String(prod.desc || '');
      assert(!BOOST.test(copy),
        'IAP product "' + prod.sku + '" advertises an accrual boost: "' + copy.trim() + '"');
    }

    /* THE GENERATED CATALOGUE — what hr-accrue actually authorises. */
    const S = await import('../../data/shops.js?v=555');
    assert(Array.isArray(S.SHOP_OFFERS) && S.SHOP_OFFERS.length > 100,
      'src/data/shops.js published ' + (S.SHOP_OFFERS || []).length + ' offers — a tiny catalogue '
      + 'would make the checks below vacuous');
    for (const id of ['iap.remove_ads', 'iap.offline_boost', 'iap.starter_bundle']) {
      assert(!S.SHOP_OFFERS.some((o) => o.id === id),
        'the generated catalogue still carries "' + id + '" — run: node tools/gen-shops.mjs');
    }
    for (const o of S.SHOP_OFFERS) {
      if (!o.cost.some((l) => l.kind === 'money')) continue;
      assert(!o.grant.some((l) => l.kind === 'currency' && l.id === 'gold'),
        'offer "' + o.id + '" grants gold for real money');
      assert(!o.grant.some((l) => l.kind === 'unlock' && /offlinePlus|noAds/.test(String(l.id))),
        'offer "' + o.id + '" grants a retired entitlement');
    }
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

  () => tryRun('b214: manual dungeon run consumes its entry key', () => {
    // Regression: startManualRun paid gold/tokens but never spent d.cost.key,
    // so one farmed key ran the dungeon forever.
    const D = window.DUNGEONS;
    if (!D || typeof window.startManualDungeonRun !== 'function') return;
    const entry = Object.entries(D).find(([, d]) => d.phases && d.cost && d.cost.key);
    if (!entry) return;
    const [id, d] = entry;
    const snap = snapshotG();
    const R = window.HearthriseDungeonScrip;
    /* BOTH ARMS (b515). The key debit moved to the SERVER when the settle arm went
       live, so "the client spends the key" is now the DORMANT contract only. Until
       b515 the arm was unreachable in a browser (it read a global nothing assigns),
       so this test was silently only ever exercising the dormant half. */
    const runOnce = () => {
      const G = window.G;
      G.inventory = Object.assign({}, G.inventory); G.inventory[d.cost.key] = 3;
      G._serverBag = Object.assign({}, G.inventory);   // the key is REAL server-side; the debit is what is under test
      G.gold = (G.gold || 0) + 100000;
      G._dungeonCooldowns = {};              // clear any server cooldown window
      G.skills = Object.assign({}, G.skills, { attack: 5000000, strength: 5000000, defense: 5000000, hitpoints: 5000000 });
      const before = G.inventory[d.cost.key];
      window.startManualDungeonRun(id);
      const after = G.inventory[d.cost.key] || 0;
      /* CLOSE THE RUN PROPERLY. Hiding the overlay (what this test used to do)
         leaves runState and its phase interval alive, and a second run then ticks
         against half-built phaseData — `Cannot read properties of undefined
         (reading 'type')` in phaseTick. The close button is the game's own teardown:
         it clears the interval and nulls runState. */
      const btn = document.querySelector('#drm-modal .drm-close');
      if (btn) btn.click();
      const ov = document.getElementById('dgn-run-overlay');
      if (ov) ov.classList.remove('open');
      return { before, after };
    };
    try {
      if (R) R.__setDungeonSettleArm(false);
      const dorm = runOnce();
      assert(dorm.after === dorm.before - 1,
        'dormant: manual run must consume 1 ' + d.cost.key + ' (before ' + dorm.before + ', after ' + dorm.after + ')');
      if (R) {
        R.__setDungeonSettleArm(true);
        const armed = runOnce();
        assert(armed.after === armed.before,
          'armed: the entry key is consumed by the SERVER at settle — a local debit here double-spends it'
          + ' (before ' + armed.before + ', after ' + armed.after + ')');
      }
    } finally { if (R) R.__setDungeonSettleArm(null); restoreG(snap); }
  }),

  () => tryRun('b214: no PvE loot table mints the premium hearth_token', () => {
    // hearth_token is the IAP-only bond (1 -> 150 gems). Every dungeon used to
    // drop it at chance 1.0, minting real-money currency from PvE.
    const D = window.DUNGEONS;
    if (!D) return;
    Object.entries(D).forEach(([id, d]) => {
      (d.loot || []).forEach(l => {
        assert(l.id !== 'hearth_token',
          'dungeon ' + id + ' must not drop hearth_token (premium currency is IAP-mint-only)');
      });
    });
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

  // gold-arm: upgradeRoom's gold debit is gated by clientMayWriteRecordField
  // (switch-OFF position); the stamp makes the affordability read known.
  () => tryRunAsync('WAVE2: upgradeRoom requires AND consumes the housing blueprint (P0)', async () => {
    // The most common dungeon reward was inert — upgradeRoom never touched it.
    const G = window.G;
    if (typeof window.upgradeRoom !== 'function' || !window.ROOMS || !window.ROOMS.kitchen || !window.ITEMS) return;
    const bp = 'kitchen_blueprint_t2';
    if (!window.ITEMS[bp]) return;
    const snap = { rooms: JSON.parse(JSON.stringify(G.rooms || {})), homestead: JSON.parse(JSON.stringify(G.homestead || {})), inv: JSON.parse(JSON.stringify(G.inventory || {})), gold: G.gold };
    try {
      G.homestead = { tier: 6 };                              // property tier high enough that the rung gate passes
      G.rooms = Object.assign({}, G.rooms, { kitchen: 1 });   // built; upgrading to tier 2
      const inv = {}; Object.keys(window.ITEMS).forEach(id => inv[id] = 100000); delete inv[bp]; // everything EXCEPT the blueprint
      G.inventory = inv; G.gold = 1e9;
      /* b515: the rooms record is ARMED, so the "already built at 1" premise has
         to arrive through applyRecord or `roomRungG` reads UNKNOWN and this
         would be testing the FIRST build, not the upgrade. */
      stampRecordLikeLoad(G);
      const before = G.rooms.kitchen;
      /* ⚠ THE BLUEPRINT GATE IS THE CLIENT'S, AND THAT IS DELIBERATE — b500's
         own note: "THE ITEM COST + BLUEPRINT STAY CLIENT-SIDE — item authority
         is a separate program; hr_unlock_buy consumes them server-side, so this
         predicts the gold half." So the refusal must cost NO round trip, and the
         consumption is still a local write (inventory is not on the record). */
      await withRoomServer({ kitchen: before + 1 }, G.gold - 1, async (rig) => {
        const noBp = window.upgradeRoom('kitchen');
        await rig.drain();
        assert(noBp === false && G.rooms.kitchen === before, 'kitchen tier 2 must be blocked without the blueprint');
        assert(rig.sent.length === 0,
          'a blueprint-refused build spent a server round trip to be told what the client already knew: '
          + JSON.stringify(rig.sent));

        G.inventory[bp] = 1;
        /* WHO EATS THE BLUEPRINT, AND WHY THE CLIENT MAY NOT PREDICT IT.
           Under b500 the client's `_debitRoom()` — which removed the blueprint
           and the item costs — runs ONLY on the client-authoritative branch. On
           the server branch `hr_unlock_buy` consumes them inside the transaction
           that took them, and the client predicts nothing, deliberately: the
           general bag is still MERGE (`isInventoryAbsolute()` is false in
           production — the inventory arm has not landed), so an envelope cannot
           REMOVE an item, and a local removal would therefore be a subtraction
           nothing can ever reconcile. The b362 report is the same shape pointed
           the other way (14 Dragon Scales decaying 14 -> 2 -> 1 as envelopes
           arrived).

           So the assertion is that the client does NOT author the consumption,
           and the intent does not name the materials. The blueprint disappearing
           from the player's bag is the INVENTORY ARM's to deliver; asserting it
           here would be asserting a bag the client is currently right not to
           write. Named, not tested away.
           MUTATION: restore `_debitRoom()` on the server branch of upgradeRoom
           → red on the "predicted" assertion below. */
        const withBp = window.upgradeRoom('kitchen');
        await rig.drain();
        assert(withBp === true, 'with the blueprint the upgrade must be dispatched');
        assert(rig.sent.length === 1 && rig.sent[0].offer === 'room.kitchen.' + (before + 1),
          'the upgrade named the wrong offer: ' + JSON.stringify(rig.sent));
        assert(!('blueprint' in (rig.sent[0] || {})) && !('items' in (rig.sent[0] || {})),
          'the upgrade body names the materials — the server reads them off hr_unlock_offers, and a '
          + 'client that can name them can name none: ' + JSON.stringify(rig.sent[0]));
        assert(G.rooms.kitchen === before + 1, 'with the blueprint kitchen must upgrade');
        assert((G.inventory[bp] || 0) === 1,
          'the client PREDICTED the blueprint consumption. The bag is merge-mode, so an envelope cannot '
          + 'put an item back — a local removal here is a permanent subtraction nothing reconciles, which '
          + 'is the b362 Dragon-Scale decay in reverse. hr_unlock_buy is the consumer.');
      });
    } finally { G.rooms = snap.rooms; G.homestead = snap.homestead; G.inventory = snap.inv; G.gold = snap.gold;
      try { stampRecordLikeLoad(G); } catch (e) {} }
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

  () => tryRun('WAVE2: a dungeon boss has ONE name — card matches the fight', () => {
    const D = window.DUNGEONS, S = window.SCAVENGER_CONFIGS;
    if (!D || !S) return;
    Object.keys(S).forEach(id => {
      if (D[id] && D[id].boss && S[id].bossName) {
        assert(D[id].boss.name === S[id].bossName,
          id + ': card boss "' + D[id].boss.name + '" must equal fight boss "' + S[id].bossName + '"');
      }
    });
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

  () => tryRun('WAVE3: artisan tools exist and are craftable', () => {
    const I = window.ITEMS, R = window.ARTISAN_RECIPES;
    if (!I || !R) return;
    ['bronze_hammer', 'rune_hammer', 'bone_needle', 'rune_needle', 'bronze_knife', 'rune_knife'].forEach(id => {
      assert(I[id] && I[id].type === 'tool', id + ' must be a tool item');
    });
    const allRec = [].concat(R.smithing || [], R.crafting || []);
    ['forge_rune_hammer', 'craft_rune_needle', 'forge_rune_knife'].forEach(rid => {
      assert(allRec.find(r => r.id === rid), 'recipe ' + rid + ' must exist');
    });
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
      delete G.equipment.belt; delete G.equipment.gloves;
      stampRecordLikeLoad(G);
      assert(!window.getArmorSetBonus(), 'a 4-piece set must NOT trigger the bonus');
    } finally { G.equipment = snap.eq; stampRecordLikeLoad(G); }
  }),

  () => tryRun('b289 E2E: the whole loop — gather -> smelt -> forge -> equip -> fight -> dungeon -> scrip -> buy', () => {
    // Every piece of the cohesion loop has its own unit test, but nobody had ever
    // walked the WHOLE journey in order. A player does; each step must hand off to
    // the next.
    const G = window.G;
    const snap = snapshotG();
    try {
      G.rooms = Object.assign({}, G.rooms, { forge: 3, workshop: 3, kitchen: 3 });
      G.homestead = { tier: 6 };
      G.skills = Object.assign({}, G.skills, {
        mining: 5000000, smithing: 5000000, attack: 5000000, strength: 5000000,
        defense: 5000000, hitpoints: 5000000, woodcutting: 5000000, crafting: 5000000 });
      G.inventory = {}; G.gold = 100000;

      // 1. GATHER — mine copper
      const rock = (window.ROCKS || []).find((r) => r.prod === 'copper_ore') || (window.ROCKS || [])[0];
      assert(rock, 'a mining node must exist');
      G.activeSkill = 'mining'; G.skillTargetId = rock.id;
      for (let i = 0; i < 6; i++) window.doSkillAction(true);
      assert((G.inventory[rock.prod] || 0) > 0, 'gathering must yield ore');
      if (typeof window.stopSkill === 'function') window.stopSkill();

      // 2. REFINE — smelt a bar (the artisan engine + workbench gate)
      const smelt = (window.ARTISAN_RECIPES.smithing || []).find((r) => r.id === 'smelt_copper');
      assert(smelt, 'smelt_copper recipe must exist');
      G.inventory[smelt.input] = 50;
      window.doArtisanAction('smithing', smelt.id, { silent: true });
      assert((G.inventory[smelt.output] || 0) > 0, 'smelting must yield a bar');

      // 3. CRAFT — forge a real weapon from that bar
      const forge = (window.ARTISAN_RECIPES.smithing || []).find((r) => r.output === 'bronze_sword');
      if (forge) {
        Object.keys(forge.inputs || { [forge.input]: 1 }).forEach((k) => { G.inventory[k] = 99; });
        window.doArtisanAction('smithing', forge.id, { silent: true });
        assert((G.inventory.bronze_sword || 0) > 0, 'forging must yield the sword');
        // 4. EQUIP — and it must actually reach the combat rolls
        window.equipItem('bronze_sword');
        assert(G.equipment.weapon === 'bronze_sword', 'the forged sword must equip');
      }
      const mon = window.MONSTERS.slime || Object.values(window.MONSTERS)[0];
      const rolls = window.getPlayerCombatRolls(mon);
      assert(rolls.maxHit > 0 && rolls.accuracy > 0, 'an equipped loadout must produce real combat rolls');

      // 5. DUNGEON -> SCRIP -> 6. SPEND (the b281 cohesion loop, end to end)
      if (typeof window.awardDungeonScrip === 'function' && typeof window.buyFromQuartermaster === 'function') {
        /* The dungeon leg walks the DORMANT economy on purpose (b515): armed, the
           earn and the spend are both server calls with no local mint, and that round
           trip is walked end-to-end against a real database in tests/dungeon-settle.mjs
           + tests/dungeon-scrip-reload.mjs. What this E2E proves is that the CLIENT
           loop hands off step to step. */
        const R = window.HearthriseDungeonScrip;
        if (R) R.__setDungeonSettleArm(false);
        const dId = Object.keys(window.DUNGEONS)[0];
        delete G.inventory.dungeon_scrip; delete G.inventory.bone_key;
        window.awardDungeonScrip(dId, 1);
        const earned = G.inventory.dungeon_scrip || 0;
        assert(earned > 0, 'clearing a dungeon must pay scrip');
        const key = (window.QM_STOCK || []).find((e) => e.id === 'bone_key');
        G.inventory.dungeon_scrip = key.scrip;
        assert(window.buyFromQuartermaster('bone_key') === true, 'scrip must buy the key');
        assert((G.inventory.bone_key || 0) === 1, 'the purchase must deliver the item');
      }
    } finally {
      if (window.HearthriseDungeonScrip) window.HearthriseDungeonScrip.__setDungeonSettleArm(null);
      restoreG(snap);
    }
  }),

  () => tryRun('b292: "Earn 500 gold" counts INCOME, not net balance (paione: sold 10k, no credit)', () => {
    // paione sold ~10k in items and the daily never moved. It measured
    // G.gold - goldAtDayStart — a NET BALANCE delta — so earning then spending
    // scored zero. It must count income.
    const G = window.G;
    if (typeof window._dailyGoldDelta !== 'function') return;
    const saved = { dgs: JSON.parse(JSON.stringify(G.dailyGoldStart || {})), gold: G.gold };
    try {
      const day = (new Date()).getUTCFullYear() * 10000 + ((new Date()).getUTCMonth() + 1) * 100 + (new Date()).getUTCDate();
      // Earned 10,000 today, then spent nearly all of it: balance is flat, income is not.
      G.dailyGoldStart = { day: day, gold: 5000, earned: 10000 };
      G.gold = 5200;
      stampBalanceLikeLoad(G);   // gold is armed: a directly-set balance reads UNKNOWN until stamped
      assert(window._dailyGoldDelta() === 10000,
        'income must be 10000 even though the balance barely moved, got ' + window._dailyGoldDelta());
      // and the goal reader must agree (three copies of this maths existed)
      if (typeof window.readSource === 'function') {
        assert(window.readSource('_dailyGoldDelta') === 10000, 'the goal reader must use the same income figure');
      }
      // a save with no counter yet falls back to the old maths rather than breaking
      G.dailyGoldStart = { day: day, gold: 1000 }; G.gold = 1600;
      stampBalanceLikeLoad(G);
      assert(window._dailyGoldDelta() === 600, 'legacy saves must still report something sane');
    } finally { G.dailyGoldStart = saved.dgs; G.gold = saved.gold; }
  }),

  () => tryRun('b291: weekly quests reset on MONDAY, matching what the panel promises (paione)', () => {
    // paione: "the quests did not reset" — with the panel showing "Resets in 7d
    // (Monday UTC)" while all three sat Claimed. The key bucketed weeks as
    // floor(daysSinceEpoch/7); epoch day 0 is a THURSDAY, so it rolled over on
    // Thursdays while the UI (and its countdown) promised Monday.
    const wk = window.__thisWeekKey;
    if (typeof wk !== 'function') return;
    // Pure re-implementation of the shipped formula, evaluated across a fortnight.
    const keyFor = (y, m, d) => Math.floor((Date.UTC(y, m, d) / 86400000 + 3) / 7);
    let rollovers = [];
    for (let i = 0; i < 21; i++) {
      const d = new Date(Date.UTC(2026, 7, 3 + i));
      if (i > 0) {
        const prev = new Date(Date.UTC(2026, 7, 3 + i - 1));
        if (keyFor(2026, 7, 3 + i) !== keyFor(2026, 7, 3 + i - 1)) rollovers.push(d.getUTCDay());
      }
    }
    assert(rollovers.length >= 2, 'the weekly key must roll over at least twice in three weeks');
    assert(rollovers.every((day) => day === 1), 'every weekly rollover must land on a MONDAY (got days ' + rollovers.join(',') + ')');
    // and the live function must use that same formula
    assert(wk() === keyFor(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
      'the shipped thisWeekKey must match the Monday-aligned formula');
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
      G.achievements = { first_kill: { unlocked: true } };
      G.quests = [{ id: 'q1', progress: 7, done: false }];
      G.daily = { lastReset: DAY, tasks: [{ id: 'd1', progress: 3 }] };
      G.streak = { days: 5, lastClaimDayKey: DAY };      // daily reward ALREADY claimed
      G.collection = { bones: 12 };
      G.traits = { autoEat: true };                      // PURCHASED with gold
      G.homestead = { tier: 4 };

      const cloud = JSON.parse(JSON.stringify(ev.snapshot(G)));   // what reaches the server

      // --- DEVICE B: a fresh install signs in ---
      ['bestiary', 'achievements', 'quests', 'daily', 'streak', 'collection', 'traits', 'homestead']
        .forEach((k) => { delete G[k]; });
      Object.assign(G, cloud);                            // the real restore path (auth.js)

      // (a) progress survived
      assert(G.bestiary && G.bestiary.slime.kills === 42, 'Bestiary must survive the restore');
      assert(G.achievements && G.achievements.first_kill.unlocked, 'Achievements must survive');
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
    ['bestiary', 'achievements', 'quests', 'daily', 'collection', 'traits',
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

  () => tryRun('b283: currency ignores the bank cap; a full-bag purchase never eats scrip (data-loss fix)', () => {
    const G = window.G;
    if (typeof window.addItem !== 'function' || !window.ITEMS || !window.ITEMS.dungeon_scrip || typeof window.bankCap !== 'function') return;
    const snap = { inv: JSON.parse(JSON.stringify(G.inventory || {})), bank: JSON.parse(JSON.stringify(G.bank || {})), cap: G._bankCap };
    try {
      // Pin at the base: the fill loop needs a cap the catalogue can reach.
      G.bank = { goldBuys: 0, gemBuys: 0, grandfather: 0 }; delete G._bankCap;
      const cap = window.bankCap();
      // Fill the bag to cap with non-currency items.
      const inv = {}; let n = 0;
      for (const id in window.ITEMS) { if (n >= cap) break; const t = window.ITEMS[id].tag; if (t !== 'currency' && t !== 'key' && !window.ITEMS[id].premium) { inv[id] = 1; n++; } }
      G.inventory = inv; delete G.inventory.dungeon_scrip;
      // Currency must NEVER be refused by the cap.
      assert(window.addItem('dungeon_scrip', 50) !== false && (G.inventory.dungeon_scrip || 0) === 50, 'currency must ignore the bank cap');
      // A full-bag purchase of a NON-exempt item must fail WITHOUT spending scrip.
      if (typeof window.buyFromQuartermaster === 'function') {
        G.inventory.dungeon_scrip = 999; delete G.inventory.kitchen_blueprint_t2;
        const before = G.inventory.dungeon_scrip;
        const bought = window.buyFromQuartermaster('kitchen_blueprint_t2');
        assert(bought === false, 'a full-bag purchase must fail');
        assert(G.inventory.dungeon_scrip === before, 'a failed purchase must NOT spend scrip (no data loss)');
        assert(!G.inventory.kitchen_blueprint_t2, 'no item granted on a failed purchase');
      }
    } finally { G.inventory = snap.inv; G.bank = snap.bank; restoreBankCap(snap.cap); }
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

  () => tryRun('WAVE-pet: the equipped pet renders beside the hero in the combat arena', () => {
    const G = window.G, A = window.HearthriseArenaStage;
    if (!A || typeof A.ensure !== 'function' || !window.COMPANIONS || !window.companionIconHtml || !window.MONSTERS) return;
    const arena = A.ensure();
    if (!arena) return; // no combat arena in this harness view — skip
    const petId = window.COMPANIONS.fox ? 'fox' : Object.keys(window.COMPANIONS)[0];
    if (!petId) return;
    const snap = { comp: JSON.parse(JSON.stringify(G.companions || {})), am: G.activeMonster };
    try {
      G.companions = Object.assign({}, G.companions, { equipped: petId, ownedIds: [petId], xp: { [petId]: 0 } });
      G.activeMonster = Object.keys(window.MONSTERS)[0];
      A.refresh();
      const pet = document.getElementById('arena-player-pet');
      assert(pet && pet.closest('.arena-side.player'), 'the equipped pet must mount inside the player side of the arena');
      assert(pet.style.display !== 'none', 'the pet must be visible when one is equipped');
      G.companions.equipped = null; A.refresh();
      assert(document.getElementById('arena-player-pet').style.display === 'none', 'no pet equipped → the badge hides');
    } finally {
      G.companions = snap.comp; G.activeMonster = snap.am;
      // Don't leave the arena hidden (refresh with no monster would) — restore the
      // visible default so later combat tests find a laid-out stage.
      var av = document.querySelector('#panel-combat .combat-arena > .arena-vs');
      if (av) av.style.display = '';
      var pet = document.getElementById('arena-player-pet'); if (pet) pet.style.display = 'none';
    }
  }),

  () => tryRun('WAVE4c: data-driven boss registry — full schema + one source of truth', () => {
    const B = window.BOSSES, BD = window.BOSS_BY_DUNGEON, D = window.DUNGEONS;
    if (!B || !D) return;
    const REQ = ['id', 'name', 'title', 'tier', 'reqLv', 'style', 'weakness', 'mechanic', 'signature'];
    Object.entries(B).forEach(([id, b]) => {
      REQ.forEach(f => assert(b[f] != null, 'boss ' + id + ' missing field: ' + f));
      assert(['melee', 'ranged', 'magic'].includes(b.style), b.id + ' style must be a real combat style');
      assert(Array.isArray(b.signature) && b.signature.every(s => window.ITEMS[s]), b.id + ' signature items must exist');
    });
    // single source of truth: a dungeon's boss name must match its registry record
    Object.entries(D).forEach(([did, d]) => {
      const rec = BD && BD[did];
      if (rec && d.boss) assert(rec.name === d.boss.name,
        did + ': registry boss "' + rec.name + '" must match the dungeon card "' + d.boss.name + '"');
    });
  }),

  () => tryRun('WAVE3d: dungeon Scrip economy — earn on clear, spend at the Quartermaster', () => {
    const G = window.G;
    if (typeof window.awardDungeonScrip !== 'function' || typeof window.buyFromQuartermaster !== 'function' || !window.DUNGEONS) return;
    const snap = { inv: JSON.parse(JSON.stringify(G.inventory || {})), scrip: G.dungeonScrip };
    const R = window.HearthriseDungeonScrip;
    try {
      /* THE DORMANT ECONOMY (b515). Earn-and-spend in the BAG is the fallback a
         client without live server accrual takes; armed, both legs are the server's
         (hr_dungeon_settle / hr_quartermaster_buy), pinned by DGN-SETTLE-2/3 and
         tests/dungeon-settle.mjs. The armed no-mint contract is asserted at the end
         of this test. Before b515 the arm could not be reached in a browser at all,
         so this ran dormant by accident rather than by statement. */
      if (R) R.__setDungeonSettleArm(false);
      G.inventory = Object.assign({}, G.inventory); delete G.inventory.dungeon_scrip; delete G.inventory.bone_key;
      const dId = Object.keys(window.DUNGEONS)[0];
      const got = window.awardDungeonScrip(dId, 1);
      assert(got > 0 && (G.inventory.dungeon_scrip || 0) === got, 'clearing a dungeon must grant scrip');
      // buy a key at the Quartermaster
      const key = (window.QM_STOCK || []).find(e => e.id === 'bone_key');
      assert(key, 'Quartermaster must stock dungeon keys');
      G.inventory.dungeon_scrip = key.scrip;                 // exactly enough
      const ok = window.buyFromQuartermaster('bone_key');
      assert(ok && (G.inventory.bone_key || 0) === 1, 'buying a key must grant it');
      assert((G.inventory.dungeon_scrip || 0) === 0, 'the scrip must be spent');
      // can't overspend
      assert(window.buyFromQuartermaster('dragonfang_pike') === false, 'must refuse a purchase you can\'t afford');
      /* ARMED: the clear mints NOTHING locally — the balance comes from the settle
         envelope. A local mint is exactly the reward the next envelope erased. */
      if (R) {
        R.__setDungeonSettleArm(true);
        delete G.inventory.dungeon_scrip; G.dungeonScrip = 0;
        const predicted = window.awardDungeonScrip(dId, 1);
        assert(predicted > 0, 'armed: awardDungeonScrip still returns the PREDICTED amount for display');
        assert(!(G.inventory.dungeon_scrip > 0) && (G.dungeonScrip || 0) === 0,
          'armed: awardDungeonScrip must write NOTHING — scrip is credited by hr_dungeon_settle only');
      }
    } finally { if (R) R.__setDungeonSettleArm(null); G.inventory = snap.inv; G.dungeonScrip = snap.scrip; }
  }),

  () => tryRun('WAVE4b: every combat/dungeon drop has a downstream use (no dead-end loot)', () => {
    const I = window.ITEMS, M = window.MONSTERS, D = window.DUNGEONS, AR = window.ARTISAN_RECIPES;
    if (!I || !M || !AR) return;
    // Everything that drops from a monster or a dungeon.
    const drops = new Set();
    Object.values(M).forEach(m => (m.drops || []).forEach(d => drops.add(d.id)));
    if (D) Object.values(D).forEach(d => (d.loot || []).forEach(l => drops.add(l.id)));
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
      if (usedAsInput.has(id)) return true;
      if (['weapon', 'armor', 'jewelry', 'tool', 'ammo', 'companion'].includes(it.type)) return true;
      if (it.heals || it.buff || it.buryXp) return true;
      if (['key', 'currency', 'housing', 'cosmetic', 'castle', 'crafting-mat'].includes(it.tag)) return true;
      if (it.unlocks || it.recipe || it.premium || it.musterOnly) return true;
      return false;
    };
    // Known, intentional vendor-trash (sold for gold) — an EXPLICIT exemption so the
    // guard is a tripwire for NEW dead-ends, not a demand to route every legacy drop.
    const VENDOR_TRASH = window.__DROP_SINK_EXEMPT || [];
    const orphans = [...drops].filter(id => I[id] && !hasUse(id) && !VENDOR_TRASH.includes(id));
    assert(orphans.length === 0,
      orphans.length + ' drop(s) go nowhere (no recipe/use). Route them or add to __DROP_SINK_EXEMPT: ' + orphans.slice(0, 30).join(', '));
  }),

  () => tryRun('WAVE6b: every dungeon has a real encounter, not a bare loot roll', () => {
    const D = window.DUNGEONS, S = window.SCAVENGER_CONFIGS || {};
    if (!D) return;
    Object.entries(D).forEach(([id, d]) => {
      const hasEncounter = (Array.isArray(d.phases) && d.phases.length) || S[id];
      assert(hasEncounter, id + ' must have a manual encounter (phases or a scavenger config), not just an auto-run loot roll');
    });
  }),

  /* DUNGEON-SETTLE DRIFT GUARD (dungeon-settlement.md §1/§3). src/data/dungeons.js
     is the pure-ESM single source the DB catalogue generator (tools/gen-dungeon-
     catalogue.mjs → hr_dungeons / hr_dungeon_loot, read by hr_dungeon_settle) reads,
     and src/dungeons.js is the CLASSIC-SCRIPT copy the game renders + gates on
     (window.DUNGEONS). src/dungeons.js cannot `import` (the b222/b338 trap), so the
     two are a GUARDED DOUBLE-COPY (the start-kit precedent). This asserts they agree
     on every SERVER-RELEVANT field — id set, kind, reqLv, cooldownH, cost.key, and
     the loot table (id/qty/chance, in order). If they drift, the server would gate
     or roll a run against numbers the client never showed. The generator's own
     --check pins src/data → SQL; this pins src/data → the client literal. */
  () => tryRunAsync('DGN-SETTLE-1: src/data/dungeons.js matches the client window.DUNGEONS (server catalogue = render source)', async () => {
    const D = window.DUNGEONS;
    if (!D) return;
    const mod = await import('../../data/dungeons.js?v=555');
    const SRC = mod && mod.DUNGEONS;
    assert(SRC && typeof SRC === 'object', 'src/data/dungeons.js must export DUNGEONS');
    const a = Object.keys(SRC).sort(), b = Object.keys(D).sort();
    assert(a.join(',') === b.join(','), 'dungeon id set drift: data=[' + a + '] client=[' + b + ']');
    for (const id of a) {
      const s = SRC[id], c = D[id];
      assert(s.kind === c.kind, id + ': kind drift (' + s.kind + ' vs ' + c.kind + ')');
      assert(s.reqLv === c.reqLv, id + ': reqLv drift (' + s.reqLv + ' vs ' + c.reqLv + ')');
      assert(s.cooldownH === c.cooldownH, id + ': cooldownH drift (' + s.cooldownH + ' vs ' + c.cooldownH + ')');
      assert((s.cost && s.cost.key) === (c.cost && c.cost.key), id + ': cost.key drift');
      const sl = s.loot || [], cl = c.loot || [];
      assert(sl.length === cl.length, id + ': loot row count drift (' + sl.length + ' vs ' + cl.length + ')');
      for (let i = 0; i < sl.length; i++) {
        assert(sl[i].id === cl[i].id, id + ' loot#' + i + ': id drift (' + sl[i].id + ' vs ' + cl[i].id + ')');
        assert(sl[i].qty[0] === cl[i].qty[0] && sl[i].qty[1] === cl[i].qty[1], id + ' loot ' + sl[i].id + ': qty drift');
        assert(sl[i].chance === cl[i].chance, id + ' loot ' + sl[i].id + ': chance drift (' + sl[i].chance + ' vs ' + cl[i].chance + ')');
      }
    }
  }),

  /* DGN-QM-1: the QUARTERMASTER stock is a GUARDED DOUBLE-COPY, like DUNGEONS.
     src/data/dungeons.js QM_STOCK is the ESM source the catalogue generator reads
     (→ hr_qm_offers, priced by quartermaster_buy); src/dungeons.js carries the
     classic-script copy the shop renders + buyFromQuartermaster charges. A classic
     script cannot import (the b222/b338 trap), so the two are pinned equal here: a
     price authored on one side that drifts from the other would let the server
     charge a different scrip than the shop shows. */
  () => tryRunAsync('DGN-QM-1: src/data/dungeons.js QM_STOCK matches the client window.QM_STOCK (server price = shop price)', async () => {
    const C = window.QM_STOCK;
    if (!C) return;
    const mod = await import('../../data/dungeons.js?v=555');
    const SRC = mod && mod.QM_STOCK;
    assert(Array.isArray(SRC), 'src/data/dungeons.js must export QM_STOCK (array)');
    assert(SRC.length === C.length, 'QM_STOCK length drift: data=' + SRC.length + ' client=' + C.length);
    const key = (o) => o.id + '=' + o.scrip;
    const a = SRC.map(key).sort(), b = C.map(key).sort();
    assert(a.join(',') === b.join(','), 'QM_STOCK id/price drift: data=[' + a + '] client=[' + b + ']');
    // ids unique (each is the PK of hr_qm_offers as qm.<id>)
    const ids = SRC.map((o) => o.id);
    assert(new Set(ids).size === ids.length, 'QM_STOCK has a duplicate id — the offer id must be unique');
  }),

  /* DGN-SETTLE-2: the client mint is GATED behind the server-authority arm. The
     arm is now ON (DUNGEON_SETTLE_ARM_ENABLED=true, 2026-09-06): scripOf reads the
     top-level G.dungeonScrip and awardDungeonScrip writes NOTHING (the server owns
     it). The dormant branch is still exercised through the override because it is
     the fallback any client without live server accrual takes. */
  () => tryRun('DGN-SETTLE-2: scrip read + mint follow the server-authority arm (dormant = today, armed = server)', () => {
    const R = window.HearthriseDungeonScrip;
    if (!R || typeof R.__setDungeonSettleArm !== 'function') { assert(false, 'dungeon-scrip-record not loaded'); return; }
    assert(R.DUNGEON_SETTLE_ARM_ENABLED === true, 'the arm must be ON (default true) - scrip is server-owned');
    const G = { inventory: { dungeon_scrip: 42 }, dungeonScrip: 7 };
    try {
      R.__setDungeonSettleArm(false);
      assert(R.scripOf(G) === 42, 'dormant: scripOf reads the inventory item');
      R.__setDungeonSettleArm(true);
      assert(R.scripOf(G) === 7, 'armed: scripOf reads the top-level G.dungeonScrip');
      // reconcileScrip sets the top-level field from an envelope state.
      R.reconcileScrip(G, { dungeon_scrip: 99 });
      assert(G.dungeonScrip === 99, 'armed: reconcileScrip mirrors state.dungeon_scrip onto G');
      // and never writes a garbage value.
      R.reconcileScrip(G, { dungeon_scrip: 'nope' });
      assert(G.dungeonScrip === 99, 'armed: a NaN scrip is refused (fail-closed, no data loss)');
    } finally { R.__setDungeonSettleArm(null); }
  }),

  /* DGN-SETTLE-3 (regression, 2026-09-06 - "dungeon scrip vanishes on reload").
     ROOT CAUSE: the whole server settlement was built and shipped DARK - the arm
     flag stayed false while BLOB_RETIRED was true, so every completion path fell
     through to `addItem('dungeon_scrip')`, a client-minted reward the next
     inventory envelope erased. Live proof at the time of the fix: zero
     kind='dungeon' ledger rows and zero characters holding server scrip.
     THE CONTRACT THIS PINS: with the arm ON, a dungeon completion sends the
     hr_dungeon_settle INTENT and mints NOTHING locally - not the scrip, not the
     loot, not even the entry key (the server consumes it) - and the balance the
     player sees comes from the returned envelope. If the arm is ever flipped off
     while the bag is server-rebuilt, this test goes red. */
  () => tryRunAsync('DGN-SETTLE-3: armed, a dungeon clear MINTS NOTHING locally - scrip comes from the server envelope', async () => {
    const R = window.HearthriseDungeonScrip, DS = window.HearthriseDungeonSettle;
    if (!R || !DS || typeof window.runDungeon !== 'function' || !window.DUNGEONS) {
      assert(false, 'dungeon modules must be loaded'); return;
    }
    const dId = Object.keys(window.DUNGEONS).find((k) => window.DUNGEONS[k].cost && window.DUNGEONS[k].cost.key);
    if (!dId) { assert(false, 'no key-gated dungeon in the catalogue'); return; }
    const d = window.DUNGEONS[dId], G = window.G;
    const snap = {
      inv: JSON.parse(JSON.stringify(G.inventory || {})),
      scrip: G.dungeonScrip, cd: G._dungeonCooldowns,
      addItem: window.addItem, getCombatLevel: window.getCombatLevel,
      send: DS.sendDungeonSettle, notify: window.notify,
    };
    const minted = [];
    let sent = null;
    try {
      /* THE REAL PREDICATE FIRST (b515). Everything below forces the arm through
         __setDungeonSettleArm, which short-circuits isDungeonSettleArmed() entirely —
         so this test passed for four builds while PRODUCTION was dormant: the arm read
         `window.HearthriseAccrue`, a global nothing assigns, and serverActive() was
         permanently false. These three assertions drive the production expression
         itself against the REAL published accrual global. */
      const A = window.HearthriseAccrual;
      assert(A && typeof A.isServerAccrualEnabled === 'function',
        'the accrual module must publish window.HearthriseAccrual — the arm predicate reads it BY NAME');
      assert(A.isServerAccrualEnabled() === true,
        'b515: server accrual is a CONSTANT — the b353 kill switch is retired, so there is no OFF state to force');
      assert(R.isDungeonSettleArmed() === true,
        'REAL predicate (no override): flag ON + live accrual → ARMED. Red means the arm reads a global nothing assigns.');
      /* THE FAIL-CLOSED HALF, still reachable after b515. The switch can no
         longer be turned off, but serverActive() also answers NO when the global
         is missing or does not expose the predicate — which is exactly the b511
         misspelt-global class this test exists for. Driven by swapping the global
         for a bag without the function, at call time, and restoring it. */
      try {
        window.HearthriseAccrual = {};
        assert(R.isDungeonSettleArmed() === false,
          'REAL predicate: no isServerAccrualEnabled on the published global → dormant (fails closed, never server-first on a guess)');
      } finally { window.HearthriseAccrual = A; }
      assert(R.isDungeonSettleArmed() === true, 'the global is restored and the arm is live again');

      R.__setDungeonSettleArm(true);
      G.inventory = Object.assign({}, G.inventory);
      G.inventory[d.cost.key] = 1;                       // a real key, so canRun passes
      delete G.inventory.dungeon_scrip;
      G.dungeonScrip = 0;
      G._dungeonCooldowns = {};                          // off cooldown
      window.getCombatLevel = () => 99;
      window.notify = () => {};
      window.addItem = (id, qty) => { minted.push(id + 'x' + qty); return true; };
      /* The transport is stubbed at the SEND (no network in the suite); the
         reconcile is the REAL module function, so the envelope -> G path under
         test is the one production runs. */
      DS.sendDungeonSettle = (o) => { sent = o; return Promise.resolve({
        outcome: 'settled',
        body: { ok: true, version: 2, state: { dungeon_scrip: 15 }, skills: {},
          inventory: { bone_scrap: 3 },
          settled: { dungeon: dId, mode: 'auto', scrip: 15, items: { bone_scrap: 3 }, key_spent: d.cost.key } },
      }); };

      assert(window.runDungeon(dId) === true, 'armed: the run must be accepted');
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

      assert(sent && sent.id === dId && sent.mode === 'auto' && sent.quality === 1,
        'armed: the clear must SEND the settle intent (got ' + JSON.stringify(sent) + ')');
      assert(minted.filter((m) => m.indexOf('dungeon_scrip') === 0).length === 0,
        'armed: the clear must NOT addItem("dungeon_scrip") - that mint is what the reload erased');
      assert(minted.length === 0, 'armed: no loot may be minted client-side either (minted: ' + minted + ')');
      assert((G.inventory[d.cost.key] || 0) === 1,
        'armed: the entry key is consumed by the SERVER, never debited locally (no double spend)');
      assert(G.dungeonScrip === 15 && R.scripOf(G) === 15,
        'armed: the balance shown is the ENVELOPE state.dungeon_scrip (got ' + R.scripOf(G) + ')');
      assert(!(G.inventory.dungeon_scrip > 0), 'armed: nothing lands in the legacy bag slot');
    } finally {
      R.__setDungeonSettleArm(null);
      DS.sendDungeonSettle = snap.send; window.addItem = snap.addItem;
      window.getCombatLevel = snap.getCombatLevel; window.notify = snap.notify;
      G.inventory = snap.inv; G.dungeonScrip = snap.scrip; G._dungeonCooldowns = snap.cd;
    }
  }),

  /* ── regression suite — DGN-COOLDOWN-1: THE RE-ENTRY WINDOW IS THE SERVER'S ──
     Three lies, one seam. canRun() computed the cooldown from a client clock
     (`G.dungeons.lastRun`) the ARMED path had stopped stamping, so every card read
     "ready" and every Auto-Run came back refused; the manual modal wrote "Rewards
     settled…" BEFORE the answer arrived; and the on_cooldown copy advised "try a
     manual run", which the server refuses identically. The projection is PER MODE
     (auto/manual full, scavenger a quarter) so an auto window must not rest the
     scavenger button. MUTATION: the lastRun arithmetic, a mode-blind read, or the literal rewardHtml. */
  () => tryRunAsync('DGN-COOLDOWN-1: the per-mode dungeon cooldown is read from the server mirror, and a refused settle never claims rewards', async () => {
    const A = window.HearthriseAccrual, DS = window.HearthriseDungeonSettle, id = 'crypt_of_bones';
    assert(A && typeof A.reconcileDungeonCooldowns === 'function', 'accrue.js must export reconcileDungeonCooldowns');
    assert(typeof window.canRunDungeon === 'function' && typeof window.dungeonSettleRowHtml === 'function',
      'the dungeon gate reader and the settle-row renderer must both be exposed');
    const G = window.G, snap = snapshotG(), lvl = window.getCombatLevel;
    const at = new Date(Date.now() + 3600000).toISOString();
    try {
      window.getCombatLevel = () => 99;
      G.inventory = Object.assign({}, G.inventory, { bone_key: 1 });
      // (a) a PROJECTED window blocks its OWN mode only, and prints a countdown.
      A.reconcileDungeonCooldowns(G, { dungeon_cooldowns: { [id]: { auto: at, manual: at } } });
      const busy = window.canRunDungeon(id, 'auto');
      assert(G._dungeonCooldowns[id].auto === at && busy.ok === false && /On cooldown.*h remaining/.test(busy.reason),
        'THE BUG: a server window must block that mode and name the time left (got ' + JSON.stringify(busy) + ')');
      assert(window.canRunDungeon(id, 'scavenger').ok === true,
        'a mode the projection omits is READY — the scavenger window is a quarter of the auto one, not the same one');
      if (document.getElementById('panel-dungeons')) {
        window.renderDungeons();
        assert([...document.querySelectorAll('#panel-dungeons button.dgn-run[disabled]')].some((b) => /On cooldown/.test(b.textContent)),
          'the dungeon card must print the countdown on its disabled Auto-Run button');
      }
      // (b) the key ABSENT → exactly today's behaviour, ready (forward-compatible).
      A.reconcileDungeonCooldowns(G, { dungeon_cooldowns: {} });
      assert(window.canRunDungeon(id, 'auto').ok === true && window.canRunDungeon(id).ok === true,
        'an absent window must read READY — that is the pre-apply behaviour this ships ahead of');
      // (c) a 409 refusal paints the reason, never a reward, and adopts its window.
      const body = { ok: false, error: 'on_cooldown', detail: { dungeon: id, mode: 'manual', next_entry_at: at, ready_at: at, cooldown_s: 14400 } };
      const html = window.dungeonSettleRowHtml(Object.assign({ status: 409 }, DS.classifyDungeonSettleResponse(409, body)));
      assert(!/Rewards settled/.test(html) && !/Rewards settled/.test(window.dungeonSettleRowHtml(null)),
        'THE BUG: a refused (or unanswered) settle must never claim the rewards landed (got ' + html + ')');
      assert(/resting/.test(html) && !/manual run/.test(html), 'the refusal must say the dungeon is resting, and must not advise a manual run (got ' + html + ')');
      A.reconcileDungeonCooldowns(G, body);
      assert(G._dungeonCooldowns[id].manual === at && window.canRunDungeon(id, 'manual').ok === false
        && window.canRunDungeon(id, 'auto').ok === true,
        'the refusal detail must rest ITS mode at once and no other (got ' + JSON.stringify(G._dungeonCooldowns) + ')');
    } finally { window.getCombatLevel = lvl; restoreG(snap); }
  }),

  /* -- regression suite -- DGN-KEY-1: THE ENTRY-KEY COUNT IS THE SERVER'S ------
     REPORTED LIVE 2026-09-13, Tyler's own character: the Goblin Warcamp card
     read "Entry: 1x Goblin Seal (have 2)" and every run button toasted "The server
     says you have no key for that dungeon." Measured in production the same minute:
     that character's `player_inventory` held bone_key 142 and obsidian_sigil 56 and
     NO goblin_seal row at all.

     THE MECHANISM: an attended kill rolls its drops with the CLIENT's Math.random
     for instant feedback while the settle pays the SERVER's re-simulation of the
     same span with the server's seeded PRNG, and the envelope's live merge is a
     one-way `Math.max` ratchet (accrue.js, the never-delete rule) which
     can never take the difference back. So a 6%-chance key the client rolled and
     the server did not stays in the display bag for the rest of the session, the
     card counts it, and the button invites a run `hr_dungeon_settle` must refuse.

     The gate and the label now read `serverItemCount` -- the mirror of
     `hr_state_of`'s whole-bag projection of `player_inventory`, which is the exact
     table the RPC debits. Fail-OPEN on silence: an unstated bag still reads the
     local count, so no gesture is ever disabled because no envelope has arrived.
     MUTATION: point keyHeld() back at G.inventory, or drop the _serverBag mirror,
     and (a)/(b) go red; make it fail CLOSED and (d) goes red. */
  () => tryRun('DGN-KEY-1: a dungeon entry key is counted from the server bag, not the client display bag', () => {
    const A = window.HearthriseAccrual, id = 'goblin_warcamp', key = 'goblin_seal';
    assert(A && typeof A.serverItemCount === 'function' && typeof window.canRunDungeon === 'function'
      && typeof window.dungeonKeysHeld === 'function', 'the server count, the gate and the key reader must all be exposed');
    if (!window.DUNGEONS || !window.DUNGEONS[id]) return;
    const G = window.G, snap = snapshotG(), lvl = window.getCombatLevel, bagWas = G._serverBag;
    try {
      window.getCombatLevel = () => 99;
      G._dungeonCooldowns = {};
      /* THE PHANTOM, as the live session held it: two client-rolled seals in the
         display bag, and ONE bone_key the server really does hold. */
      G.inventory = Object.assign({}, G.inventory, { [key]: 2, bone_key: 1 });
      delete G._serverBag;
      A.applyEnvelopeState(G, { state: {}, inventory: { bone_key: 1 } });
      // (a) THE SERVER'S FIGURE -- an omitted id is a real zero (whole-bag projection).
      assert(A.serverItemCount(G, key) === 0 && A.serverItemCount(G, 'bone_key') === 1 && (G.inventory[key] || 0) === 2,
        'the mirror must say 0 seals / 1 bone key while the display bag KEEPS its client-rolled seal under the '
        + 'merge ratchet (the lie this test exists for): ' + JSON.stringify({ srv: A.serverItemCount(G, key), bag: G.inventory[key] }));
      // (b) THE GATE AND THE LABEL -- THE BUG.
      const got = window.canRunDungeon(id, 'auto');
      assert(window.dungeonKeysHeld(key) === 0 && got.ok === false && /Goblin Seal/.test(got.reason),
        'THE BUG: the card counted keys the server has no row for, so the button invited a refusal ("no key for '
        + 'that dungeon"): ' + JSON.stringify({ held: window.dungeonKeysHeld(key), got }));
      // (c) AND IT DOES NOT LOCK OUT A KEY THE SERVER DOES HOLD.
      assert(window.canRunDungeon('crypt_of_bones', 'auto').ok === true,
        'a dungeon whose key the server NAMES must stay runnable: ' + JSON.stringify(window.canRunDungeon('crypt_of_bones', 'auto')));
      if (document.getElementById('panel-dungeons')) {
        window.renderDungeons();
        const stock = [...document.querySelectorAll('#panel-dungeons .dgn-key-stock')].map((e) => e.textContent);
        assert(stock.length && stock.indexOf('(have 2)') === -1 && stock.indexOf('(have 0)') !== -1,
          'the card must print the server count, never the phantom 2: ' + JSON.stringify(stock));
      }
    } finally {
      window.getCombatLevel = lvl;
      if (bagWas === undefined) delete G._serverBag; else G._serverBag = bagWas;
      restoreG(snap);
    }
  }),

  /* DGN-KEY-2: the OTHER half of the rule. A gate closes when the server SAYS none,
     never on silence — before the first envelope of a session there is no stated
     bag at all, and a run refused then would be the client inventing a refusal. */
  () => tryRun('DGN-KEY-2: an unstated server bag never disables a dungeon run', () => {
    const A = window.HearthriseAccrual, id = 'goblin_warcamp', key = 'goblin_seal';
    if (!A || typeof A.serverItemCount !== 'function' || !window.DUNGEONS || !window.DUNGEONS[id]) return;
    const G = window.G, snap = snapshotG(), lvl = window.getCombatLevel, bagWas = G._serverBag;
    try {
      window.getCombatLevel = () => 99;
      G._dungeonCooldowns = {};
      G.inventory = Object.assign({}, G.inventory, { [key]: 2 });
      delete G._serverBag;
      assert(A.serverItemCount(G, key) === null && window.dungeonKeysHeld(key) === 2
        && window.canRunDungeon(id, 'auto').ok === true,
        'an UNSTATED bag must read the local count: ' + JSON.stringify(window.canRunDungeon(id, 'auto')));
    } finally {
      window.getCombatLevel = lvl;
      if (bagWas === undefined) delete G._serverBag; else G._serverBag = bagWas;
      restoreG(snap);
    }
  }),

  /* -- regression suite -- FARM-SEED-1: THE SEED COUNT IS THE SERVER'S TOO -----
     THE SAME CLASS AS DGN-KEY-1, measured on the QA account on live
     (2026-09-13): the bag rendered turnip_seed x5 and the seed picker offered it,
     while every hr_farm_plant answered {"error":"insufficient_seed"} -- 19 of them
     journalled in hr_rejections for that slot. Production held NO turnip_seed and
     NO carrot_seed row for it; wheat_seed 11. Those two numbers are the FRESH-G
     FACTORY LITERAL (src/legacy.js `inventory:{turnip_seed:5,carrot_seed:3,...}`,
     the start kit the SERVER grants at creation and the character spent long ago).
     `loadLocal` cannot strip it -- `inventory` is not a SERVER_OF_RECORD field --
     and the envelope's live merge is a one-way `Math.max` ratchet, so the count
     comes back on every reload and can never be lowered.
     The pre-flight, the picker, Plant all and auto-replant now count with
     `gateItemCount` (the mirror of the server's whole-bag projection), so the
     client stops spending gestures on refusals it could already predict.
     MUTATION: point plantCrop's pre-flight back at hasItem(), or drop the
     _serverBag mirror, and (b) goes red. */
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

  /* FARM-SEED-2: the fail-open half. Before the first envelope of a session no bag
     has been stated, and a plant blocked then would be a refusal the client made up. */
  () => tryRun('FARM-SEED-2: an unstated server bag still sends the plant', () => {
    const A = window.HearthriseAccrual;
    if (!A || typeof A.gateItemCount !== 'function' || !window.CROPS || !window.CROPS.turnip) return;
    const G = window.G, snap = snapshotG(), bagWas = G._serverBag, prevSync = window.HearthriseFarmSync;
    const sent = [];
    try {
      window.HearthriseFarmSync = { isFarmServerArmed: () => true, farmPlantRefusalText: () => 'no seeds',
        farmPlant: (i, c) => { sent.push([i, c]); return Promise.resolve({ ok: false, error: 'insufficient_seed' }); } };
      G.farmPlots = [null, null];
      G.inventory = Object.assign({}, G.inventory, { turnip_seed: 5 });
      delete G._serverBag;
      window.plantCrop(0, 'turnip');
      assert(sent.length === 1 && sent[0][1] === 'turnip',
        'with no envelope-stated bag the gesture must still be SENT: ' + JSON.stringify(sent));
    } finally {
      window.HearthriseFarmSync = prevSync;
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
      G.inventory = { turnip_seed: 5, carrot_seed: 3, shrimp: 10, cooked_shrimp: 20 };
      delete G._serverBag; delete G._startKitHintAt;
      /* THE REALM: a veteran slot that spent the kit long ago and holds its own
         goods, on a projection the server certifies COMPLETE. */
      A.applyEnvelopeState(G, { state: {}, inventory: { cooked_shrimp: 20, maple_log: 7027 }, inventory_complete: true });
      // (a) the realm's own goods land, and a kit id the realm DOES name keeps its figure.
      assert((G.inventory.maple_log || 0) === 7027 && (G.inventory.cooked_shrimp || 0) === 20,
        'the realm\'s own bag must land untouched: ' + JSON.stringify(G.inventory));
      // (b) THE BUG: the two seeds the realm has no row for are GONE, not ratcheted.
      assert(!G.inventory.turnip_seed && !G.inventory.carrot_seed,
        'THE BUG: the start-kit hint survived the realm\'s own complete statement of the bag, so the grid paints '
        + 'seeds hr_farm_plant refuses: '
        + JSON.stringify({ turnip_seed: G.inventory.turnip_seed, carrot_seed: G.inventory.carrot_seed }));
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
      G.inventory = { turnip_seed: 7, carrot_seed: 3 };   // 7 != the hint's 5 -- somebody bought seeds
      delete G._serverBag; delete G._startKitHintAt;
      A.applyEnvelopeState(G, { state: {}, inventory: { maple_log: 1 }, inventory_complete: true });
      assert((G.inventory.turnip_seed || 0) === 7 && !G.inventory.carrot_seed,
        'a TOUCHED figure must survive (7) while the untouched hint (3 carrot seeds) is discarded: '
        + JSON.stringify({ turnip_seed: G.inventory.turnip_seed, carrot_seed: G.inventory.carrot_seed }));
    } finally {
      if (bagWas === undefined) delete G._serverBag; else G._serverBag = bagWas;
      if (hintWas === undefined) delete G._startKitHintAt; else G._startKitHintAt = hintWas;
      restoreG(snap);
    }
  }),

  () => tryRun('WAVE6: a weekly boss exists and pays a bigger bonus than the daily', () => {
    const B = window.HearthriseBossOfDay;
    if (!B || typeof B.weeklyId !== 'function' || !window.MONSTERS) return;
    const wid = B.weeklyId();
    assert(wid && window.MONSTERS[wid], 'weeklyId must resolve to a real monster (' + wid + ')');
    const wb = B.killBonuses(wid);
    assert(wb.dropMult === B.WEEKLY_BONUS.dropMult && wb.dropMult > B.BONUS.dropMult,
      'the weekly boss must pay the bigger weekly bonus (' + wb.dropMult + ' vs daily ' + B.BONUS.dropMult + ')');
    const plain = Object.keys(window.MONSTERS).find(id => id !== wid && id !== B.featuredId());
    if (plain) assert(B.killBonuses(plain).dropMult === 1, 'a non-featured kill must be 1x');
  }),

  () => tryRun('WAVE4: shared drop bands + gold_bar has a real sink', () => {
    if (typeof window.dropBand === 'function') {
      assert(window.dropBand(1) === 'always', '100% → always');
      assert(window.dropBand(0.03) === 'rare', '3% → rare');
      assert(window.dropBand(0.10) === 'uncommon', '10% → uncommon');
      assert(window.dropBand(0.5) === 'common', '50% → common');
    }
    const R = window.ARTISAN_RECIPES && window.ARTISAN_RECIPES.crafting;
    if (R && window.ITEMS) {
      const gr = R.find(r => r.output === 'gold_ring');
      assert(gr && gr.inputs && gr.inputs.gold_bar, 'gold_ring recipe must consume gold_bar (the gold sink)');
      assert(window.ITEMS.gold_ring && window.ITEMS.gold_ring.type === 'jewelry', 'gold_ring must be equippable jewelry');
    }
  }),

  () => tryRun('b268: every solo dungeon has a named end-boss', () => {
    const D = window.DUNGEONS;
    if (!D) return;
    Object.entries(D).forEach(([id, d]) => {
      assert(d.boss && typeof d.boss.name === 'string' && d.boss.name.length > 2,
        'dungeon ' + id + ' must have a named boss (d.boss.name) for the boss ecosystem');
    });
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
    // Cosmetics/trophies/materials + deeds/blueprints = the sellable dungeon money source → tradeable.
    ['warboss_standard','lexarch_seal','voidwoven_sigil','riftmaw_husk','elderscale_heart',
     'farm_deed','kitchen_blueprint_t2','trophy_blueprint_t3','library_blueprint_t3'].forEach(id => {
      assert(I[id], 'tradeable dungeon drop ' + id + ' must exist');
      assert(!I[id].bop, id + ' must be tradeable (non-BoP) — dungeon loot is a market money source');
    });
  }),

  () => tryRun('b268: each signature weapon drops only from its own boss and carries a wield requirement', () => {
    const D = window.DUNGEONS, I = window.ITEMS;
    if (!D || !I) return;
    const sig = {
      wartusk_cleaver: 'goblin_warcamp', whispering_codex: 'haunted_archive',
      ashcrown_greatsword: 'obsidian_keep', voidmaw_scepter: 'voidbringer',
      dragonfang_pike: 'ancient_wyrm',
    };
    Object.entries(sig).forEach(([item, dungeon]) => {
      const homes = Object.entries(D).filter(([, d]) => (d.loot || []).some(l => l.id === item)).map(([k]) => k);
      assert(homes.length === 1 && homes[0] === dungeon,
        item + ' must drop from exactly ' + dungeon + ' (found: ' + homes.join(',') + ')');
      // wield requirement is real (gearWieldReq reads reqLv → gates equipping)
      if (typeof window.gearWieldReq === 'function') {
        const req = window.gearWieldReq(I[item]);
        assert(req && req.lv >= 25, item + ' must carry a real wield-level requirement');
      }
    });
  }),

  () => tryRun('b268: deeds drop from dungeons and remain tradeable', () => {
    const D = window.DUNGEONS, I = window.ITEMS;
    if (!D || !I) return;
    const droppers = Object.entries(D).filter(([, d]) => (d.loot || []).some(l => l.id === 'farm_deed'));
    assert(droppers.length >= 5, 'farm_deed must drop from most dungeons (found ' + droppers.length + ')');
    assert(!I.farm_deed.bop, 'farm_deed must stay tradeable');
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
        id: 'XSS-TEST', sellerId: 'user-hostile-xss', sellerName: evil,
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
  () => tryRun('b209: raids — weekly boss rotation, clamped real-roll strikes, solo pool state', () => {
    const R = window.HearthriseRaids;
    assert(R && R.BOSSES.length >= 3, 'raid bosses present');
    R.BOSSES.forEach(b => assert(b.reward && b.reward.gold > 0 && b.def > 0, 'boss ' + b.id + ' has real stats + reward'));
    const b1 = R.bossOfWeek(), b2 = R.bossOfWeek();
    assert(b1.id === b2.id, 'boss of the week is deterministic');
    const dmg = R.simulateStrike(b1);
    assert(dmg >= 10 && dmg <= 50000, 'strike damage clamped to server bounds, got ' + dmg);
    const G = window.G;
    const saved = G.raids ? JSON.parse(JSON.stringify(G.raids)) : undefined;
    try {
      delete G.raids;
      const st = R.ensureState();
      // b223 (§3.5): the flat SOLO_POOL_HP is obsolete. The Lone Hunt's pool is
      // UNMEASURED until the week's first strike, which is what lets it be
      // 5-6 strikes at CL 30 and at CL 99 alike instead of impossible below 61.
      assert(st.solo && st.solo.max == null && st.solo.hp == null,
        'the solo pool starts unmeasured — it calibrates to the first strike');
      assert(st.solo.week && typeof st.claimed === 'object', 'weekly key + claim ledger present');
      // weekly reset invariant: stale week re-rolls the pool
      st.solo = { week: 'w-stale', hp: 5, max: 10, damage: 999, strikes: 4 };
      const st2 = R.ensureState();
      assert(st2.solo.week !== 'w-stale' && st2.solo.max == null && st2.solo.damage === 0,
        'stale week resets the solo pool');
    } finally { if (saved === undefined) delete G.raids; else G.raids = saved; }
  }),
  // b224 (Asset pass): the six Hunt bosses rendered as a typographic glyph
  // only — this promotes six painted portraits from _archive/reserve-art into
  // assets/icons-bundle/painted/monsters/ and wires them through
  // bossPortraitHtml(). Guards: every boss has art, every path is a shipped
  // folder (never _archive/), and the helper degrades to '' (no <img> tag at
  // all, never a broken-image icon) for an unknown boss — the glyph in the
  // card title is always the fallback.
  () => tryRun('b224: Hunt boss portraits — all six wired to shipped art, graceful fallback', () => {
    const R = window.HearthriseRaids;
    assert(R && R.BOSS_PORTRAIT && typeof R.bossPortraitHtml === 'function', 'boss portrait seam missing');
    R.BOSSES.forEach(b => {
      const p = R.BOSS_PORTRAIT[b.id];
      assert(p, 'boss ' + b.id + ' has no promoted portrait');
      assert(p.indexOf('assets/icons-bundle/') === 0, 'boss ' + b.id + ' portrait not in a shipped folder: ' + p);
      assert(p.indexOf('_archive/') === -1, 'boss ' + b.id + ' portrait points into _archive/, which never ships: ' + p);
      const html = R.bossPortraitHtml(b);
      assert(html.indexOf('<img') === 0, 'boss ' + b.id + ' portrait html should be an <img>, got: ' + html.slice(0, 40));
      assert(html.indexOf(p) !== -1, 'boss ' + b.id + ' portrait html does not reference its own path');
      assert(html.indexOf('onerror=') !== -1, 'boss ' + b.id + ' portrait has no onerror guard — a 404 would render a broken-image icon');
    });
    // Unknown boss id -> no <img> at all (not an empty-src broken image).
    const fallback = R.bossPortraitHtml({ id: 'not_a_real_boss' });
    assert(fallback === '', 'unknown boss should render no portrait markup, got: ' + fallback);
  }),
  // ── Wave 1b raid hardening (2026-08-08) ─────────────────────
  // Three live exploits were fixed at the SERVER (see
  // supabase/migrations/2026-08-08-raid-hardening.sql). Nothing in the
  // browser can prove a server rule, so what these two tests guard is the
  // client's half of the contract: the local mirror must refuse what the
  // server refuses, every server refusal must produce an honest message and
  // never a chest, and the client must keep working against a server that
  // has NOT had the migration applied yet.
  () => tryRun('b219: raid hardening — client mirrors the server day gate and never invents a strike', () => {
    const R = window.HearthriseRaids;
    const G = window.G;
    assert(typeof R._reduceStrike === 'function', 'raid strike reducer missing');
    const saved = G.raids ? JSON.parse(JSON.stringify(G.raids)) : undefined;
    const savedCL = window.getCombatLevel;
    try {
      R._resetClock();
      // The clock must come from the shared world-events utility, not a
      // reimplementation — raids, quests and events must agree on "today".
      const WE = window.HearthriseWorldEvents;
      assert(WE && R.dayKey() === WE.utcDayKey() && R.weekKey() === WE.utcWeekKey(),
        'raid clock diverged from HearthriseWorldEvents');

      window.getCombatLevel = () => 99;
      delete G.raids;
      R.ensureState();
      assert(R.canStrike().ok === true, 'a fresh day should allow a strike');
      G.raids.lastStrikeDay = R.dayKey();
      const gate = R.canStrike();
      assert(gate.ok === false && gate.reason === 'struck_today',
        'a second strike on the same UTC day must be refused locally');
      window.getCombatLevel = () => 5;
      assert(R.canStrike().reason === 'level', 'below combat 30 the level gate wins');

      // Server refusals. `already_struck_today` must resync the mirror, not
      // hand the player a retry that will never succeed.
      const blocked = R._reduceStrike({ ok: false, error: 'already_struck_today', day: '2026-8-8' }, 0);
      assert(blocked.action === 'blocked' && /already struck/i.test(blocked.message),
        'already_struck_today should block with an honest message, got ' + JSON.stringify(blocked));
      assert(R._reduceStrike({ ok: false, error: 'not_member' }, 0).action === 'fail', 'not_member must fail');
      assert(R._reduceStrike(null, 0).action === 'fail', 'a null/garbage body must never be treated as a hit');
      assert(R._reduceStrike({ code: 'PGRST301', message: 'JWT expired' }, 0).action === 'fail',
        'a PostgREST error envelope must never be treated as a hit');
      // Clock correction is allowed exactly once — never a retry loop.
      assert(R._reduceStrike({ ok: false, error: 'week_mismatch', week: 'w9999' }, 0).action === 'retry',
        'first week_mismatch should re-sync and retry');
      assert(R._reduceStrike({ ok: false, error: 'week_mismatch', week: 'w9999' }, 1).action === 'fail',
        'a second week_mismatch must give up, not loop');

      // BACKWARD COMPATIBILITY: the pre-migration server answers with only
      // {ok, hp_remaining, downed}. That must still read as a normal hit.
      const legacy = R._reduceStrike({ ok: true, hp_remaining: 240000, downed: false }, 0);
      assert(legacy.action === 'accept' && legacy.max === R.CLAN_POOL_HP && legacy.hp === 240000,
        'an un-migrated server response must still land a strike, got ' + JSON.stringify(legacy));

      // The self-expiring clock correction: adopting a server key must not
      // outlive the local key it disagreed with.
      R._adoptClock({ week: 'w9999', day: '1999-1-1' });
      assert(R.weekKey() === 'w9999' && R.dayKey() === '1999-1-1', 'server clock keys should be adopted');
      R._adoptClock({ week: WE.utcWeekKey(), day: WE.utcDayKey() });
      assert(R.weekKey() === WE.utcWeekKey(), 'agreeing with the server should clear the correction');
    } finally {
      R._resetClock();
      if (savedCL) window.getCombatLevel = savedCL; else delete window.getCombatLevel;
      if (saved === undefined) delete G.raids; else G.raids = saved;
    }
  }),
  () => tryRun('b219: raid hardening — chests come from the server ledger, and never from an error', () => {
    const R = window.HearthriseRaids;
    const G = window.G;
    assert(typeof R._reduceClaim === 'function', 'raid claim reducer missing');
    const saved = G.raids ? JSON.parse(JSON.stringify(G.raids)) : undefined;
    try {
      // BACKWARD COMPATIBILITY: a server without raid_claim answers 404 /
      // PGRST202. The client must fall back to the b209 path, not fail —
      // this is what lets the client ship before the migration is applied.
      assert(R._reduceClaim(404, { code: 'PGRST202', message: 'Could not find the function' }, 0).action === 'unsupported',
        'a missing raid_claim RPC must fall back, not break claiming');
      assert(R._reduceClaim(200, { ok: true, scale: 0.4 }, 0).action === 'accept', 'a granted claim should be accepted');
      assert(R._reduceClaim(200, { ok: true, scale: 0.4 }, 0).scale === 0.4, 'the server dictates the chest scale');
      assert(R._reduceClaim(200, { ok: false, error: 'already_claimed' }, 0).action === 'spent',
        'a replayed claim must be refused');
      ['not_downed', 'no_contribution', 'joined_after_kill', 'not_member'].forEach((e) => {
        const d = R._reduceClaim(200, { ok: false, error: e }, 0);
        assert(d.action === 'fail', e + ' must refuse the chest');
        assert(d.message && d.message !== R._claimErrorText('__unknown__'),
          e + ' needs its own honest message, not the generic one');
      });
      // The dangerous case: any non-envelope response must refuse. A 401 body
      // has no `ok` field, and treating it as success would hand out a chest.
      assert(R._reduceClaim(401, { code: 'PGRST301', message: 'JWT expired' }, 0).action === 'fail',
        'an auth error must never award a chest');
      assert(R._reduceClaim(500, null, 0).action === 'fail', 'a server error must never award a chest');

      // The local claim map is a mirror, not a ledger — and it must not grow
      // a key per week forever inside the manual snapshotG allowlist.
      delete G.raids;
      const st = R.ensureState();
      st.claimed['w1'] = true;
      st.claimed[R.weekKey()] = true;
      R.ensureState();
      assert(!st.claimed['w1'], 'stale weekly claim keys should be pruned from the save');
      assert(st.claimed[R.weekKey()] === true, 'the current week must survive the prune');

      // Claim UI state: a downed pool offers the chest exactly until it is taken.
      // b385: the rendered raid card is a clan surface — gated to coming-soon while
      // CLAN_LAUNCHED is false, so this functional-UI assertion only holds once the
      // flag flips. The pure claim/reduce contract above is unaffected and still runs.
      const _CL = window.HearthriseClans;
      const _launched = _CL && typeof _CL.clanLaunched === 'function' && _CL.clanLaunched();
      const panel = _launched && document.getElementById('panel-dungeons');
      if (panel) {
        // b223: a downed solo pool is `max` set AND `hp` at zero — an
        // unmeasured pool (max null) is not downed, it has never been fought.
        st.solo.max = 20000;
        st.solo.hp = 0;
        delete st.claimed[R.weekKey()];
        const p1 = R.render(); if (p1 && p1.catch) p1.catch(() => {});
        let html = (document.getElementById('hr-raid-card') || {}).innerHTML || '';
        assert(/Claim raid chest/.test(html), 'a downed solo pool should offer the chest');
        st.claimed[R.weekKey()] = true;
        const p2 = R.render(); if (p2 && p2.catch) p2.catch(() => {});
        html = (document.getElementById('hr-raid-card') || {}).innerHTML || '';
        assert(!/Claim raid chest/.test(html) && /Chest claimed/.test(html),
          'a claimed chest must not be offered again');
      }
    } finally {
      if (saved === undefined) delete G.raids; else G.raids = saved;
      try { const p = R.render(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
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
    /* THE NO-PROFIT RULE, for EVERY item-granting gold offer that ships:
       buy-then-sell must never mint gold. `>=`, not `>`: seven shipped rows sit
       at exactly 1.00 (equip.steel_platebody 1500/1500 and seed.carrot_seed,
       potato_seed, pumpkin_seed, tomato_seed, turnip_seed, wheat_seed) — a
       designer follow-up, not a faucet. The strict food margin is the empty-bag test. */
    const idx = window.HearthriseGold && window.HearthriseGold.shopOfferIndex();
    assert(idx && typeof window.vendorPrice === 'function', 'offer index or vendorPrice not published');
    const ids = Object.keys(idx);
    assert(ids.length > 20, 'the offer index is suspiciously small: ' + ids.length);
    for (const id of ids) {
      const e = idx[id];
      const buyback = e.grants * window.vendorPrice(id);
      assert(e.gold >= buyback,
        e.offer + ' costs ' + e.gold + ' and sells back for ' + buyback + ' — a gold faucet');
    }
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
];
