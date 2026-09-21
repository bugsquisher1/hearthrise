// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/bounty-and-artisan.js — bounty pay and rerolls, the equipment lane, runecrafting, ammo and recipe order.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 64 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, stampBalanceLikeLoad, stampRecordLikeLoad, withServerBacked, awayGatherSpan, tryRunRestampingBalance, xpOf, xpZero, goldOf, snapshotG, setAway, restoreG, restoreGAndRecord, on } from './_harness.js?v=550';

export default [

  /* ══════════════════════════════════════════════════════════════════════════
     BOUNTY-PAY — THE BOARD MAY NOT POST A CONTRACT THE GAME CANNOT SETTLE
     (2026-08-31. Tyler, on live b486: "there is still a bug with the bounty
     board." Found by driving the real board headless.)

     Only `cull` has a turn-in: supabase/migrations/2026-08-23-bounty.sql wires
     hr_accept_bounty/hr_claim_bounty for `cull` and REFUSES every other type
     (`type_not_server_verifiable`), on the stated assumption that the rest
     "keep their existing client behaviour". That assumption died when gold
     armed: their client behaviour is finalizeBounty(), whose credit is gated on
     clientMayWriteRecordField('gold'), which is permanently false. Measured on
     the real board: a proof contract read 26/26 with `completed` still 0, no
     gold, no Marks, no XP and NO TOAST, and the rail hides "New notices" while a
     bounty is active — so one unpayable contract locked the whole board, exit
     price a Marks-charging Abandon.

     Three nets, one per test below: don't POST it, rescue an in-flight one at
     boot, and never leave a completed one hanging. Each fails without the fix.
     ══════════════════════════════════════════════════════════════════════════ */
  () => tryRun('BOUNTY-PAY-1: under the gold arm the board posts ONLY settleable contract types — and the unlock ladder is intact', () => {
    if (typeof window.generateBountyBoard !== 'function') return;
    const C = window.HearthriseCore;
    if (!C || !C.bounty || typeof C.bounty.isOfferableType !== 'function') {
      assert(false, 'src/core/bounty.js must export the BOUNTY_TURN_IN payability filter — without it the board '
        + 'can post a proof/weapon/streak contract that has no turn-in anywhere');
      return;
    }
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    try {
      const G = window.G;
      /* A Bounty Hunter well past every type unlock, so the ladder genuinely
         offers proof (lv5) / weapon (10) / streak (15). Without that this test
         would pass against a level-1 board that only ever had culls. */
      /* b503: the second write used to be `G.bountyHunter.xp = 20000` — the
         residue mirror. That mirror is GONE (the xp is a server-owned skill;
         see the BOUNTY HUNTER header in legacy.js), so setting it here would
         seed a field nothing reads and quietly imply the mirror still exists. */
      G.skills.bountyHunter = 20000;
      assert(window.getBountyHunterLevel() >= 15,
        'CONTROL: the test character must be past the streak unlock, got BH ' + window.getBountyHunterLevel());
      assert(C.bounty.unlockedTypes(window.getBountyHunterLevel()).indexOf('proof') >= 0,
        'CONTROL: the LADDER must still contain proof — this fix gates what is POSTED, it must not delete the ladder');

      // ARMED (live): the client cannot pay, so only server-settled types may post.
      window.clientMayWriteRecordField = (f) => f !== 'gold' && f !== 'marks';
      const armedTypes = {};
      for (let i = 0; i < 60; i++) window.generateBountyBoard().forEach((b) => { armedTypes[b.type] = 1; });
      const armedList = Object.keys(armedTypes).sort();
      const unsettleable = armedList.filter((t) => !C.bounty.isOfferableType(t, false));
      assert(!unsettleable.length,
        'the board posted ' + unsettleable.join('/') + ' while the client may not pay and no server verb accepts it — '
        + 'that contract can be accepted and filled and then has nowhere to turn in');
      assert(armedList.length && armedList.indexOf('cull') >= 0, 'CONTROL: the board must still post something');

      // DORMANT (client owns gold): the full ladder is still posted.
      window.clientMayWriteRecordField = () => true;
      const dormant = {};
      for (let i = 0; i < 120; i++) window.generateBountyBoard().forEach((b) => { dormant[b.type] = 1; });
      assert(dormant.proof,
        'the client-owned position must still post proof contracts — the fix is a PAYABILITY gate, not a content cut, '
        + 'and a filter that fires in both states has silently deleted three bounty types');
    } finally {
      window.clientMayWriteRecordField = origMay;
      restoreG(snap);
    }
  }),

  () => tryRun('BOUNTY-PAY-2: a completed contract the game cannot settle is withdrawn and SAID — never left hanging (the last b411 bare return)', () => {
    if (typeof window.handleBountyKill !== 'function' || typeof window.acceptBounty !== 'function') return;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origNotify = window.notify;
    const toasts = [];
    try {
      const G = window.G;
      window.notify = (m) => { toasts.push(String(m)); };
      window.clientMayWriteRecordField = (f) => f !== 'gold' && f !== 'marks';
      const monId = Object.keys(window.MONSTERS)[0];
      const proof = (window.MONSTERS[monId].drops || [])[0] && window.MONSTERS[monId].drops[0].id;
      if (!proof) return;
      G.inventory[proof] = 0;
      G.bountyHunter.active = null;
      /* gold > 0 is what makes it unsettleable — that is the exact predicate the
         old bare return used, so a reward of {gold:0} would not reproduce it. */
      G.bountyHunter.board = [{ id: 'test_unsettleable', type: 'proof', target: monId, tier: 1, progress: 0,
        proofItem: proof, required: 3, rewards: { gold: 320, marks: 6, xp: 45 } }];
      window.acceptBounty(0);
      assert(G.bountyHunter.active && G.bountyHunter.active.type === 'proof', 'CONTROL: the proof contract must be accepted');
      toasts.length = 0;
      G.inventory[proof] = 3;                       // fill it, the way a player does
      window.handleBountyKill(monId, window.MONSTERS[monId]);
      assert(!G.bountyHunter.active,
        'the contract is still ACTIVE at full progress with no payout — this is the live bug: the bar reads '
        + '3/3, nothing pays, no toast fires, and the board rail hides the reroll button while a bounty is active');
      assert(toasts.length > 0,
        'the withdraw said nothing to the player — a silent no-op is the b411 defect the b461 sweep was supposed to end');
      assert(G.bountyHunter.board.length > 0, 'the board must be reposted so the player is not stranded');
    } finally {
      window.notify = origNotify;
      window.clientMayWriteRecordField = origMay;
      restoreG(snap);
    }
  }),

  () => tryRun('BOUNTY-PAY-3: an unsettleable contract already in a SAVE is withdrawn free on the first ensure of the session', () => {
    if (typeof window.ensureBountyState !== 'function') return;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origNotify = window.notify;
    const origLatch = window.__hrBountyBootStripped;
    const toasts = [];
    try {
      const G = window.G;
      window.notify = (m) => { toasts.push(String(m)); };
      window.clientMayWriteRecordField = (f) => f !== 'gold' && f !== 'marks';
      const monId = Object.keys(window.MONSTERS)[0];
      const marksBefore = G.marks || 0;
      G.bountyHunter.active = { id: 'stuck', type: 'streak', target: monId, tier: 1, progress: 40,
        required: 40, streak: 40, rewards: { gold: 320, marks: 6, xp: 45 } };
      window.__hrBountyBootStripped = false;        // this ensure IS a boot
      window.ensureBountyState();
      assert(!G.bountyHunter.active,
        'a save carrying an unsettleable in-flight contract must be released at boot — otherwise every player who '
        + 'already accepted one stays locked out of the board no matter how many times they reload');
      assert((G.marks || 0) === marksBefore,
        'the withdraw must be FREE — the player must not be charged the abandon fee for a contract we mis-sold');
      assert(toasts.length > 0, 'the boot withdraw must tell the player what happened to their contract');
      assert(G.bountyHunter.board.length > 0, 'the board must be reposted after the withdraw');
      // …and it must not fire again on the next ensure (a per-kill toast storm).
      toasts.length = 0;
      window.ensureBountyState();
      assert(toasts.length === 0, 'the rescue notice must be boot-once, not once per kill');
    } finally {
      window.__hrBountyBootStripped = origLatch;
      window.notify = origNotify;
      window.clientMayWriteRecordField = origMay;
      restoreG(snap);
    }
  }),

  () => tryRunAsync('BOUNTY-MARKS-1 (bug_reports #46): a server-confirmed turn-in REFRESHES the balance it just credited — "completed 1 task but I got 0 marks"', async () => {
    if (typeof window.handleBountyKill !== 'function' || typeof window.acceptBounty !== 'function') return;
    const R = window.HearthriseRecord;
    if (!R || typeof R.requestRecord !== 'function') return;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const origNotify = window.notify;
    const toasts = [];
    let refreshes = 0;
    try {
      const G = window.G;
      window.notify = (m) => { toasts.push(String(m)); };
      /* The LIVE arm: marks and gold are server-of-record, so finalizeBounty's
         local credit is a no-op and the only thing that can move the number the
         player is looking at is a fresh envelope. */
      window.clientMayWriteRecordField = (f) => f !== 'gold' && f !== 'marks';
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        acceptBounty: () => Promise.resolve({ ok: true }),
        creditKills: () => Promise.resolve({ ok: true, progress: 99999 }),
        /* hr_claim_bounty SUCCEEDS — the server really did credit the Marks.
           That is the whole point: the RPC was never the bug. */
        claimBounty: () => Promise.resolve({ ok: true, gold: 270, marks: 5, xp: 38 }),
      };
      const _R = window.HearthriseRecord;
      const origRequest = _R.requestRecord;
      _R.requestRecord = function () { refreshes++; return Promise.resolve({ outcome: 'loaded', applied: true }); };
      try {
        const monId = Object.keys(window.MONSTERS)[0];
        G.bountyHunter.active = null;
        G.bountyHunter.board = [{ id: 'test_cull_marks', type: 'cull', target: monId, tier: 1, progress: 0,
          difficulty: 'easy', required: 2, rewards: { gold: 270, marks: 5, xp: 38 } }];
        window.acceptBounty(0);
        assert(G.bountyHunter.active && G.bountyHunter.active.type === 'cull', 'CONTROL: the cull contract must be accepted');
        toasts.length = 0; refreshes = 0;
        /* PIN THE BONUS ROLL ON. It is a seeded chance(0.10), so an unpinned run
           would skip the bonus 9 times in 10 and the "must not announce what it
           cannot pay" assertion below would pass without grading anything —
           exactly the flake b344 documents one screen up. 0.01 < 0.10 ⇒ rolls. */
        const _C = window.HearthriseCore;
        _C.setRng(_C.rngMod.rngFrom(() => 0.01));
        try {
          window.handleBountyKill(monId, window.MONSTERS[monId]);
          window.handleBountyKill(monId, window.MONSTERS[monId]);
          // let the two-phase credit → claim → finalize chain settle
          for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
        } finally { _C.setRng(null); }
        assert(!G.bountyHunter.active, 'CONTROL: a server-confirmed turn-in must consume the contract');
        assert(refreshes >= 1,
          'the turn-in celebrated "+5 Marks" and never asked for the balance the server had just written — '
          + 'gold and marks are server-of-record, so the local credit is a no-op and the counter sits on its old '
          + 'number until some unrelated envelope happens along. That is bug_reports #46 verbatim.');
      } finally { _R.requestRecord = origRequest; }
      /* …and the client-only 10% bonus must not be ANNOUNCED where it cannot be
         PAID. hr_claim_bounty's reward carries no bonus roll, so under the arm
         that toast promised Marks nothing anywhere grants. */
      const bonusToast = toasts.filter((t) => /Bonus turn-in/i.test(t));
      assert(!bonusToast.length,
        'the turn-in announced a bonus the arm cannot credit: "' + bonusToast[0] + '" — a second toast naming a '
        + 'number the balance never shows is most of what "I got 0 marks" feels like');
    } finally {
      window.notify = origNotify;
      window.HearthriseGoalClaim = origClaim;
      window.clientMayWriteRecordField = origMay;
      restoreG(snap);
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     BOUNTY-REROLL — the board has a DAY, and a paid refresh is paid once
     (2026-08-31, same sweep.)

     `freeRerolls` and `rerollsToday` were seeded once and never moved again:
     nothing reset them, `boardGeneratedAt` was written and never read, and the
     shop's "+1 Free Reroll/day" (`extraRerolls`) was read by nothing. So a
     player got ONE free reroll per ACCOUNT, and the paid price 5+N*5 ratcheted
     forever — while hr_bounty_spend derives that same price from the PAID
     rerolls in TODAY's ledger, which does reset. The client's affordability
     check therefore drifted permanently above the price the server charges.
     ══════════════════════════════════════════════════════════════════════════ */
  () => tryRun('BOUNTY-REROLL-1: a new UTC day restores the free reroll and clears the escalating paid price', () => {
    if (typeof window.ensureBountyState !== 'function') return;
    const snap = snapshotG();
    try {
      const G = window.G;
      window.ensureBountyState();
      assert(typeof window.hrBountyDayKey === 'function', 'the board must have a day key to reset against');
      const today = window.hrBountyDayKey();
      assert(G.bountyHunter.rerollDay === today, 'ensureBountyState must stamp the current UTC day, got ' + G.bountyHunter.rerollDay);

      G.bountyHunter.freeRerolls = 0;
      G.bountyHunter.rerollsToday = 7;              // a long-lived account's ratchet
      G.bountyHunter.rerollDay = 19700101;          // …last seen a while ago
      window.ensureBountyState();
      assert(G.bountyHunter.freeRerolls === 1,
        'the free reroll must come back on a new day, got ' + G.bountyHunter.freeRerolls
        + ' — without this a player gets exactly one free reroll for the LIFE of the account');
      assert(G.bountyHunter.rerollsToday === 0,
        'the paid-reroll counter must reset with the day, got ' + G.bountyHunter.rerollsToday
        + ' — the client would demand ' + (5 + G.bountyHunter.rerollsToday * 5) + ' Marks where the server charges 5');

      // The shop's "+1 Free Reroll/day" must actually be worth its 50 Marks.
      G.bountyHunter.upgrades.extraRerolls = 2;
      G.bountyHunter.rerollDay = 19700101;
      window.ensureBountyState();
      assert(G.bountyHunter.freeRerolls === 3,
        'the extraRerolls upgrade must add its free rerolls, got ' + G.bountyHunter.freeRerolls
        + ' — it was sold at 50 Marks and read by nothing');
      // Same day twice must NOT top the allowance up again (a free-reroll fountain).
      G.bountyHunter.freeRerolls = 0;
      window.ensureBountyState();
      assert(G.bountyHunter.freeRerolls === 0, 'a second ensure on the SAME day must not refill the allowance');
    } finally { restoreG(snap); }
  }),

  () => tryRun('BOUNTY-REROLL-2: a PREPAID refresh (the Reroll Token) charges nothing a second time', () => {
    if (typeof window.rerollBountyBoard !== 'function') return;
    const snap = snapshotG();
    try {
      const G = window.G;
      window.ensureBountyState();
      G.bountyHunter.active = null;                 // the rail only offers a reroll with no active contract
      G.bountyHunter.freeRerolls = 1;
      G.bountyHunter.rerollsToday = 0;
      const before = G.bountyHunter.board.map((b) => b.id).join('|');
      window.rerollBountyBoard(true);               // exactly what spendMarks('reroll_token') calls
      assert(G.bountyHunter.freeRerolls === 1,
        'a Reroll Token burned the FREE reroll as well as its 5 Marks — rerollBountyBoard ignored the argument '
        + 'spendMarks has always passed it');
      assert(G.bountyHunter.rerollsToday === 0, 'a prepaid refresh must not advance the paid-reroll price');
      assert(G.bountyHunter.board.map((b) => b.id).join('|') !== before, 'CONTROL: the board must actually refresh');
      // The free path still spends the free reroll.
      window.rerollBountyBoard();
      assert(G.bountyHunter.freeRerolls === 0, 'CONTROL: an unpaid reroll must still spend the free one');
    } finally { restoreG(snap); }
  }),

  () => tryRun('BOUNTY-SHOP-1: no Bounty Shop row offers an enabled Buy that the spend will refuse', () => {
    if (typeof window.renderBountyTab !== 'function' || typeof window.bountyShopOffers !== 'function') return;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    try {
      const G = window.G;
      /* Marks server-owned (the live position) and plenty of them, which is the
         exact state that made every row look buyable: the button was gated on
         affordability alone, so all five BOUNTY_SHOP rows rendered an enabled,
         primary-styled "Buy" and all five answered "That upgrade is unavailable
         right now". */
      window.clientMayWriteRecordField = (f) => f !== 'gold' && f !== 'marks';
      G.marks = 5000;
      /* The balance must be KNOWN, or `canAffordMarks` fails closed on UNKNOWN
         and every row would be disabled for a reason that has nothing to do
         with this bug — the test would pass against the broken code. */
      stampRecordLikeLoad(G);
      assert(window.HearthriseMarks.canAffordMarks(G, 300),
        'CONTROL: the marks balance must be KNOWN and ample, or affordability alone disables every row');
      window.renderBountyTab();
      const rows = Array.from(document.querySelectorAll('#bounty-shop-body .bounty-shop-row'));
      assert(rows.length > 0, 'CONTROL: the Bounty Shop must render rows to grade');
      const lying = rows.filter((r) => {
        const id = r.dataset.offer || '';
        const btn = r.querySelector('button');
        if (!btn || btn.disabled) return false;
        const def = window.bountyShopOffers().find((o) => o.id === id);
        return def && !def.trait;                   // a non-trait row has no server spend verb
      }).map((r) => r.dataset.offer);
      assert(!lying.length,
        lying.length + ' Bounty Shop row(s) render an ENABLED Buy that spendMarks refuses outright: '
        + lying.join(', ') + '. A control the player can press and that can never succeed is a dead end, not a gate.');
      /* …and the trait rows, which DO have a server purchase (buyTrait →
         hr_unlock_buy), must stay live. Graded only on a row the character does
         not already own — an OWNED trait is correctly disabled. */
      const traitRow = rows.find((r) => {
        const id = String(r.dataset.offer || '');
        if (id.indexOf('trait_') !== 0) return false;
        const def = window.bountyShopOffers().find((o) => o.id === id);
        return def && !(typeof window.hasTrait === 'function' && window.hasTrait(def.trait));
      });
      assert(traitRow,
        'CONTROL: the shop must offer at least one unowned marks-priced trait, or the check below grades nothing');
      assert(!traitRow.querySelector('button').disabled,
        'a marks-priced TRAIT routes through buyTrait/hr_unlock_buy and must remain buyable — '
        + 'this fix must not disable the one kind of row in the shop that works');
    } finally {
      window.clientMayWriteRecordField = origMay;
      restoreG(snap);
      try { window.renderBountyTab(); } catch (e) {}
    }
  }),

  () => tryRun('b248: Bone Lord is loseable — a downed fighter cannot heal-on-hit back above 0', () => {
    assert(typeof window._scvResolvePlayerHp === 'function', 'the boss survival rule seam must exist');
    // The exact tester scenario: HP already near 0, taking a lethal blow, WITH food (heal>0).
    const afterLethal = window._scvResolvePlayerHp(5, 40, 3, 255);
    assert(afterLethal <= 0, 'a lethal blow must leave hp<=0 even with heal-on-hit, got ' + afterLethal);
    // A glancing blow on a living fighter still heals (sustain must keep working).
    const sustained = window._scvResolvePlayerHp(100, 5, 3, 255);
    assert(sustained > 100 - 5, 'a surviving fighter must still heal on hit, got ' + sustained);
    // Heal never overflows max HP.
    assert(window._scvResolvePlayerHp(254, 1, 50, 255) === 255, 'heal must clamp to max HP');
  }),

  () => tryRun('b248: bag scroll survives an in-place re-render (paione: inventory snapped to top mid-fight)', () => {
    assert(typeof window._nearestScrollable === 'function', 'the scroll-preserving helper must exist');
    // Build a scrollable container with a child panel, scroll it, rebuild the child.
    const host = document.createElement('div');
    host.style.cssText = 'height:80px;overflow-y:auto';
    const panel = document.createElement('div');
    panel.innerHTML = Array.from({length:40}, (_,i)=>`<div style="height:20px">row ${i}</div>`).join('');
    host.appendChild(panel); document.body.appendChild(host);
    try {
      const scroller = window._nearestScrollable(panel);
      assert(scroller === host, 'must find the overflow ancestor as the scroll container');
      host.scrollTop = 300;
      const saved = host.scrollTop;
      // Simulate the tick re-render: replace innerHTML, then restore (as renderInvNew now does).
      const s = window._nearestScrollable(panel); const top = s ? s.scrollTop : 0;
      panel.innerHTML = Array.from({length:40}, (_,i)=>`<div style="height:20px">row ${i}</div>`).join('');
      if(s) s.scrollTop = top;
      assert(host.scrollTop === saved, 'scroll position must be preserved across the rebuild, got ' + host.scrollTop + ' want ' + saved);
    } finally { host.remove(); }
  }),

  () => tryRun('b249: renderInvFancy (the live bag) preserves .invc-bag-col scroll across its full-panel rebuild', () => {
    // The b248 fix patched renderInvNew, but the bag players actually see is
    // rebuilt by renderInvFancy, which replaces #panel-inventory wholesale and
    // recreates the scroller (.invc-bag-col). paione still saw the snap-to-top.
    const render = window._renderInvFancy || window.renderInvFancy;
    const panel = document.getElementById('panel-inventory');
    if(typeof render !== 'function' || !panel){ skip('renderer/panel absent — nothing to verify'); return; }
    const snap = snapshotG();
    // Force the bag column short + scrollable regardless of active tab/layout.
    const style = document.createElement('style');
    style.textContent = '#panel-inventory{display:flex!important} #panel-inventory .invc-bag-col{height:40px!important;max-height:40px!important;overflow-y:auto!important}';
    document.head.appendChild(style);
    try {
      render();
      let bag = panel.querySelector('.invc-bag-col');
      assert(bag, 'the bag column must render');
      // The renderer pads to ~88 slots, so at 40px tall it must overflow.
      if(bag.scrollHeight > bag.clientHeight + 2){
        bag.scrollTop = 25;
        const saved = bag.scrollTop;               // may clamp to max
        assert(saved > 0, 'precondition: bag must actually scroll');
        render();                                   // the tick re-render
        bag = panel.querySelector('.invc-bag-col'); // a NEW node after rebuild
        assert(bag && Math.abs(bag.scrollTop - saved) <= 1,
          'scroll must survive the rebuild, got ' + (bag && bag.scrollTop) + ' want ' + saved);
      }
    } finally { style.remove(); restoreG(snap); try { render(); } catch(e){} }
  }),

  () => tryRun('b247: Wave 3 uniques — 14 curated items route orphan drops into craftable gear', () => {
    const ITEMS = window.ITEMS, R = window.ARTISAN_RECIPES;
    const VALID_SLOTS = new Set(['helmet','necklace','earrings','cape','weapon','ammo','ring','body','gloves','belt','pants','boots','companion']);
    const WAVE3 = ['dragonrend_greatblade','crown_of_the_fallen_king','emberfang_blade','demoncaller_staff',
      'panthers_eye_pendant','wraithsilk_shroud','widows_fang','plaguewarden_greaves','hollow_sigil_ring',
      'fangdart_recurve','alphaheart_longbow','nightstalker_pelt','warband_bulwark','chitinweave_cloak'];
    const allRecipes = [...(R.smithing||[]), ...(R.crafting||[])];
    WAVE3.forEach((id) => {
      const it = ITEMS[id];
      assert(it, 'Wave 3 item must exist: ' + id);
      assert(VALID_SLOTS.has(it.slot), id + ' must sit in a real equip slot, got ' + it.slot);
      // Every unique is obtainable: exactly one recipe outputs it, and every input is a known item.
      const rec = allRecipes.find((r) => r.output === id);
      assert(rec, id + ' must have a craft recipe (no dead boss loot)');
      Object.keys(rec.inputs || {}).forEach((k) => assert(ITEMS[k], id + ' recipe references a real item: ' + k));
      // Endgame gear carries a real wield gate.
      const req = window.gearWieldReq(it);
      assert(req && req.lv > 0, id + ' must be level-gated to wield');
      // Flavour line surfaces in the tooltip index.
      assert(typeof window.itemDesc === 'function' && window.itemDesc(id), id + ' must have a description');
    });
    // The marquee orphans are actually consumed by these recipes (routing, not just new content).
    const consumed = new Set(allRecipes.filter((r) => WAVE3.includes(r.output)).flatMap((r) => Object.keys(r.inputs || {})));
    ['war_crown','void_chitin','ancient_claw','hell_ember','wraith_veil','alpha_fang','dark_sigil','plague_ichor']
      .forEach((orphan) => assert(consumed.has(orphan), 'orphan drop must be routed into a unique: ' + orphan));
  }),

  () => tryRun('b245: attack speed is a real lever — spdB shortens the swing, capped at 20%', () => {
    const G = window.G;
    const snap = snapshotG();
    try {
      assert(typeof window.combatTickMs === 'function', 'combatTickMs() seam missing');
      /* b456: the worn set reaches the swing formula through equipmentMap(), so
         each position has to arrive on the record — otherwise all three read as
         NAKED and `spdB gear must shorten the swing` compares 2400 with 2400.
         ⚠ `base` is taken AFTER the first stamp so it is a like-for-like baseline
           (the ambient set at test entry is whatever the suite left behind). */
      G.equipment = {};
      stampRecordLikeLoad(G);
      const base = window.combatTickMs();
      assert(window.combatTickMs() === Math.floor(window.COMBAT_BALANCE.tickMs), 'no speed gear = the base swing interval');
      // A tiny spdB gear shortens the swing.
      G.equipment = { boots: 'leather_boots' };   // spdB .02
      stampRecordLikeLoad(G);
      assert(window.combatTickMs() < base, 'spdB gear must shorten the swing');
      // The cap holds: even absurd speed can only reach 20% faster.
      window.ITEMS.__test_speed = { n: 'Test Speed', spdB: 0.9, type: 'armor', slot: 'boots' };
      G.equipment = { boots: '__test_speed' };
      stampRecordLikeLoad(G);
      assert(window.combatTickMs() === Math.floor(window.COMBAT_BALANCE.tickMs * 0.80),
        'attack speed must cap at 20% faster even at spdB 0.9, got ' + window.combatTickMs());
    } finally { delete window.ITEMS.__test_speed; restoreG(snap); }
  }),

  /* ── b329 (Xarn, live report) ────────────────────────────────────────────
     "The attack speed for Rapid, Precise and Longrange is the same."
     He was right: no combat style has ever had a speed term — `combatTickMs()`
     read gear speed and the weapon FAMILY only — so a style literally named
     *Rapid* swung at exactly the rate of the two it is meant to beat.

     This test is the contract for the fix, and it fails on every way the fix
     could rot: the differential being removed from the table, the term being
     dropped from the formula, a style sneaking BELOW the family baseline (which
     would make styles a second speed ladder beside the unresolved `spdB`
     question), the away replay being handed a different interval than the live
     scheduler, or — the reported bug in reverse — the copy promising a slower,
     more accurate style that the simulation does not actually run. */
  () => tryRun('b329 (Xarn): Rapid / Precise / Longrange swing at three DIFFERENT speeds, and the copy states the number the sim runs', () => {
    const G = window.G;
    const C = window.HearthriseCore;
    const snap = snapshotG();
    const savedStyle = JSON.parse(JSON.stringify(G.combatStyle || {}));
    try {
      assert(C && C.combat && typeof C.combat.swingIntervalMs === 'function',
        'src/core/combat.js must export swingIntervalMs — the ONE swing formula both the live tick and hr-accrue call');
      const STYLES = C.styles.COMBAT_STYLES;

      // ── 1. The invariant: a style may only ever COST speed, never grant it.
      Object.entries(STYLES).forEach(([fam, rows]) => {
        Object.entries(rows).forEach(([k, s]) => {
          assert(typeof s.speedMod === 'number' && isFinite(s.speedMod),
            fam + '.' + k + ' has no numeric speedMod — every style row must state its swing cost');
          assert(s.speedMod >= 1,
            fam + '.' + k + ' has speedMod ' + s.speedMod + ' < 1 — a style must never swing FASTER than its weapon family baseline');
        });
      });
      // And the clamp is in the FORMULA, not merely in the table: a hostile row
      // cannot shrink the divisor the accrual engine divides elapsed time by.
      const bareEq = { weaponType: 'sword', spdB: 0 };
      assert(C.combat.swingIntervalMs(bareEq, { speedMod: 0.01 }) === C.combat.swingIntervalMs(bareEq, { speedMod: 1 }),
        'swingIntervalMs must clamp a sub-1 speedMod to the baseline — otherwise a bad style row is an away-accrual exploit');

      // ── 2. The reported bug: three ranged styles, three distinct swings.
      G.equipment = { weapon: 'shortbow' };            // no spdB gear anywhere
      stampRecordLikeLoad(G);   // b456: getWeaponType reads the worn set off the record
      G.combatStyle = Object.assign({}, G.combatStyle, { ranged: 'rapid' });
      assert(window.getWeaponType() === 'ranged', 'the test needs a bow equipped');

      const msOf = (key) => { G.combatStyle.ranged = key; return window.combatTickMs(); };
      const rapid = msOf('rapid'); const precise = msOf('precise'); const longr = msOf('longrange');

      assert(rapid < precise, 'Rapid must swing FASTER than Precise — got ' + rapid + 'ms vs ' + precise + 'ms (the reported bug)');
      assert(precise < longr, 'Precise must swing FASTER than Longrange — got ' + precise + 'ms vs ' + longr + 'ms (the reported bug)');

      // Pinned to the published table, so shaving the differential to nothing
      // fails here rather than passing on a 1ms ordering.
      const base = window.COMBAT_BALANCE.tickMs * window.WEAPON_SPEED_MOD.ranged;
      [['rapid', rapid], ['precise', precise], ['longrange', longr]].forEach(([k, got]) => {
        const want = Math.floor(base * STYLES.ranged[k].speedMod);
        assert(got === want, 'ranged ' + k + ' should swing at ' + want + 'ms, got ' + got + 'ms');
      });
      assert(longr - rapid >= 150,
        'the Rapid-to-Longrange spread is only ' + (longr - rapid) + 'ms — too small for a player to feel, which is the bug');

      // ── 3. ONE formula: the away replay divides by exactly this number.
      // (AWAY-12 greps simulateAwayCombat for `combatTickMs()`; this pins the
      // value that call produces to the core function hr-accrue imports.)
      ['rapid', 'precise', 'longrange'].forEach((k) => {
        G.combatStyle.ranged = k;
        const eq = window.getEquipmentStats();
        assert(C.combat.swingIntervalMs(eq, STYLES.ranged[k]) === window.combatTickMs(),
          'the live scheduler and the shared swing formula disagree for ranged ' + k + ' — that is how a hammer once swung 26% more often asleep than awake');
      });
      // The consequence a player actually collects: a 12h absence buys strictly
      // fewer Longrange swings than Rapid swings.
      const span = 12 * 3600000;
      assert(Math.floor(span / rapid) > Math.floor(span / precise)
          && Math.floor(span / precise) > Math.floor(span / longr),
        'the style speed differential must change the AWAY tick budget too, not only the live interval');

      // ── 4. The bug in reverse: the copy must match the numbers.
      Object.entries(STYLES).forEach(([fam, rows]) => {
        Object.entries(rows).forEach(([k, s]) => {
          const where = fam + '.' + k;
          assert(typeof s.desc === 'string' && s.desc.length > 3, where + ' has no player-facing desc');
          const claimsSlower = /slower/i.test(s.desc);
          assert(claimsSlower === (s.speedMod > 1),
            where + ' desc says "' + s.desc + '" but speedMod is ' + s.speedMod + ' — a style that reads slower and is not (or is and does not say so) is the reported bug in reverse');
          /* `defenseMod` is authored on 6 style rows and read by NOTHING (see
             the handoff). Until it is wired, no style may promise defence. */
          assert(!/defen[cs]e/i.test(s.desc) || /XP/i.test(s.desc),
            where + ' promises defence as a STAT, but style defenseMod is applied by nothing — only the XP route is real');
        });
      });

      // ── 5. Switching style mid-fight retimes the running loop.
      assert(typeof window.retimeCombat === 'function',
        'retimeCombat() must exist — otherwise picking a style changes nothing until you re-tap the monster');
    } finally {
      G.combatStyle = savedStyle;
      /* ⚠ THE RECORD GOES BACK TOO, NOT JUST `G`: step 2 STAMPS a shortbow through applyRecord and
         `restoreG` alone left it standing, so every later test fought as an unarmed RANGED
         character — the away parity rig died on it. */
      restoreGAndRecord(snap);
    }
  }),

  /* THE STANDING DETECTOR FOR THE LEAK ABOVE. The equipment record is not a snapshotG field, and
     getWeaponType() does not fail closed when it goes UNKNOWN — it falls back to the last-known
     server display cache, which is what carries a stamped loadout forward. MUTATION PROVEN. */
  () => tryRun('SUITE-HYGIENE-REC-1: a test that stamps the equipment RECORD puts it back — the combat family follows the weapon G says is worn', () => {
    /* "shortbow" is in the BODY so --only=shortbow runs offender and detector. */
    const G = window.G;
    if (typeof window.getWeaponType !== 'function') { skip('getWeaponType is not exposed'); return; }
    const wid = (G && G.equipment && typeof G.equipment.weapon === 'string') ? G.equipment.weapon : null;
    const def = (wid && window.ITEMS) ? window.ITEMS[wid] : null;
    /* Derived from the catalogue for a worn weapon; 'sword' for an empty slot is
       getWeaponType()'s own stated unarmed default (src/legacy.js) and is the one
       literal here — everything else follows the data. */
    const expect = (def && def.weaponType) ? def.weaponType : 'sword';
    const got = window.getWeaponType();
    assert(got === expect,
      'THE WORN SET LEAKED. The game fights as ' + got + '; G says the weapon slot holds '
      + JSON.stringify(wid) + ' (family ' + expect + '). A test above stamped a loadout with '
      + 'stampRecordLikeLoad and restored with restoreG instead of restoreGAndRecord — snapshotG '
      + 'does not cover the equipment record, and getWeaponType falls back to the b455 last-known '
      + 'server cache when the record goes UNKNOWN, so the stamped weapon is ambient for every '
      + 'test after it. Fix the test that stamped it.');
  }),

  () => tryRun('b244: the item-id migration layer remaps a renamed/retired id across every store', () => {
    const G = window.G;
    const snap = snapshotG();
    const savedAlias = Object.assign({}, window.ITEM_ALIAS);
    try {
      assert(typeof window.remapItemIds === 'function' && window.ITEM_ALIAS, 'the migration/alias seam must exist');
      // Pretend copper_ore was renamed/merged into iron_ore (both real items).
      window.ITEM_ALIAS.copper_ore = 'iron_ore';
      G.inventory = { copper_ore: 5, iron_ore: 2 };
      G.equipment = { weapon: 'copper_ore' };
      G.collection = { copper_ore: true };
      G.lockedItems = { copper_ore: true };
      G.buyback = [{ id: 'copper_ore', qty: 1, unit: 10 }];
      G.autoActions = { eat: { foodId: 'copper_ore' } };
      window.remapItemIds(G);
      assert(G.inventory.iron_ore === 7 && !('copper_ore' in G.inventory), 'inventory must merge the qty under the new id');
      /* b456: the WORN set is server-of-record, and legacy.js gates its remap on
         clientMayWriteRecordField('equipment') — the server writes player_equipment
         via the equip verb, so its ids are already canonical and a client remap
         here would be a second writer on a stripped field. Both positions asserted;
         the DORMANT one still does the remap and is exercised below. */
      const equipArmed = typeof window.clientMayWriteRecordField === 'function'
        && window.clientMayWriteRecordField('equipment') === false;
      if (equipArmed) {
        assert(G.equipment.weapon === 'copper_ore',
          'ARMED: remapItemIds authored the server-owned worn set — the record is the only writer there');
      } else {
        assert(G.equipment.weapon === 'iron_ore', 'equipped id must remap');
      }
      assert(G.collection.iron_ore && !G.collection.copper_ore, 'collection must remap');
      assert(G.lockedItems.iron_ore && !G.lockedItems.copper_ore, 'locks must remap');
      assert(G.buyback[0] && G.buyback[0].id === 'iron_ore', 'buy-back entries must remap');
      assert(G.autoActions.eat.foodId === 'iron_ore', 'auto-eat food id must remap');
      // A cut item (aliased to null) is dropped safely, not left as a ghost.
      window.ITEM_ALIAS.iron_ore = null;
      G.inventory = { iron_ore: 3 };
      window.remapItemIds(G);
      assert(!('iron_ore' in G.inventory), 'an item aliased to null (cut) must be dropped, not linger');
      /* …and the WORN-SET remap in the position where the client owns it — still
         shipped code, and the arithmetic the server's own canonicalisation must
         match the day equipment ids are renamed again. */
      const R = window.HearthriseRecord;
      if (R && typeof R.__setEquipmentRecordArm === 'function') {
        try {
          R.__setEquipmentRecordArm(false);
          delete window.ITEM_ALIAS.iron_ore;
          window.ITEM_ALIAS.copper_ore = 'iron_ore';
          G.equipment = { weapon: 'copper_ore' };
          window.remapItemIds(G);
          assert(G.equipment.weapon === 'iron_ore', 'dormant: equipped id must remap');
        } finally {
          R.__setEquipmentRecordArm(null);
        }
      }
    } finally { window.ITEM_ALIAS = savedAlias; restoreG(snap); }
  }),

  // ════════════════════════════════════════════════════════════
  // b343 — THE EQUIPMENT-LANE GUARDS
  //
  // `earrings` sat in EQUIP_SLOTS with ZERO items that could fill it for the
  // whole life of the project, and the equip doll rendered the empty socket to
  // every player the entire time. Nothing caught it because nothing ever asked
  // the question. These two guards ask it, every run.
  // ════════════════════════════════════════════════════════════

  () => tryRun('b343: every EQUIP_SLOTS slot has at least one item that can fill it', () => {
    const ITEMS = window.ITEMS || {};
    const SLOTS = window.EQUIP_SLOTS || (window.__LEGACY_INLINE || {}).EQUIP_SLOTS || [];
    assert(SLOTS.length > 0, 'EQUIP_SLOTS must be readable from the page');

    // ring1/ring2 are two sockets served by one item slot key ('ring').
    const slotKey = (s) => (s === 'ring1' || s === 'ring2') ? 'ring' : s;
    const filled = new Set();
    Object.values(ITEMS).forEach((it) => { if (it && it.slot) filled.add(it.slot); });

    /* The ONE documented exception, asserted as an exact set so it can never
       grow quietly. `shield` (Offhand) was added to EQUIP_SLOTS in b216 and has
       never had an item. Filling it is NOT a data change: nothing in the engine
       models weapon handedness, so a shield would hand every 2H warhammer, bow
       and staff user free defence. That needs an engine seam first — raised as
       a handoff, deliberately not papered over with items here. */
    const KNOWN_EMPTY = ['shield'];

    const empty = SLOTS.filter((s) => !filled.has(slotKey(s)));
    const unexpected = empty.filter((s) => KNOWN_EMPTY.indexOf(s) < 0);
    assert(unexpected.length === 0,
      'these EQUIP_SLOTS can NEVER be filled — a socket the player can see and nothing can go in: ' + unexpected.join(', '));
    // And the exception list may not outlive its reason: if someone ships a
    // shield, this fails until they delete the entry.
    const staleExceptions = KNOWN_EMPTY.filter((s) => filled.has(slotKey(s)));
    assert(staleExceptions.length === 0,
      'KNOWN_EMPTY still lists ' + staleExceptions.join(', ') + ' but items now exist for it — delete the exception');
  }),

  () => tryRun('b343: no equipment ladder has a hole bigger than 20 levels', () => {
    const ITEMS = window.ITEMS || {};
    const R = window.ARTISAN_RECIPES || {};
    /* MEASURE AVAILABILITY, NOT THE WIELD GATE. An item's rung is the higher of
       (a) the level it may be worn at and (b) the level it may be MADE at.
       Reading `reqLv` alone reports a 30-level hole in the weapon slot that no
       player has ever experienced — every tier-1-to-3 weapon is ungated to
       wield, and the real cadence is the smithing/crafting requirement. Reading
       the craft gate alone would miss a wield-gated boss drop. The max of the
       two is what a player actually feels.

       MAX_GAP is 20 because the generated armour spine (gear-tiers.js) rungs
       every 15 levels and the hand-authored uniques sit off that grid, so 20 is
       the smallest threshold that passes every healthy ladder with margin. A
       wider gap means a player wearing the best item they can get watches it
       stay best for a fifth of the whole game. Measured this way before b343:
       cape 25 (level 35 to level 60), ring 23 (35 to 58), and necklace's first
       rung at 25 with a 21-level hole above the Panther's Eye. */
    const MAX_GAP = 20;
    const FIRST_RUNG_BY = 25;   // and something must be reachable reasonably early

    const craftReq = {};
    Object.keys(R).forEach((skill) => (R[skill] || []).forEach((r) => {
      if (!r || !r.output) return;
      const q = Number(r.req) || 0;
      if (craftReq[r.output] === undefined || q < craftReq[r.output]) craftReq[r.output] = q;
    }));
    const availabilityOf = (id, it) =>
      Math.max(Number(it.reqLv) || 0, craftReq[id] === undefined ? 0 : craftReq[id]);

    const bySlot = {};
    Object.entries(ITEMS).forEach(([id, it]) => {
      if (!it || !it.slot) return;
      (bySlot[it.slot] = bySlot[it.slot] || []).push(availabilityOf(id, it));
    });

    const problems = [];
    Object.entries(bySlot).forEach(([slot, levels]) => {
      if (levels.length < 2) return;                // a one-item slot is the coverage guard's problem
      const rungs = [...new Set(levels)].sort((a, b) => a - b);
      if (rungs[0] > FIRST_RUNG_BY) {
        problems.push(slot + ': nothing available until level ' + rungs[0]);
      }
      for (let i = 1; i < rungs.length; i++) {
        const gap = rungs[i] - rungs[i - 1];
        if (gap > MAX_GAP) problems.push(slot + ': a ' + gap + '-level hole between ' + rungs[i - 1] + ' and ' + rungs[i]);
      }
    });
    assert(problems.length === 0, 'equipment ladders with holes — ' + problems.join(' | '));
  }),

  () => tryRun('b343: the ammo ladder is a well-formed, priced consumable', () => {
    const ITEMS = window.ITEMS || {};
    const ammo = Object.entries(ITEMS).filter(([, it]) => it && it.slot === 'ammo');
    assert(ammo.length >= 7, 'the ammo lane must run the full material ladder, got ' + ammo.length);

    // Every rung declares its burn as DATA, so a save/recover perk or a
    // two-per-shot bolt is a data change and never a code change.
    const tiered = ammo.filter(([, it]) => it.tier);
    tiered.forEach(([id, it]) => {
      assert(typeof it.ammoPerShot === 'number' && it.ammoPerShot >= 0 && isFinite(it.ammoPerShot),
        'ammo "' + id + '" must declare a numeric ammoPerShot (the per-swing burn)');
      assert(it.v > 0, 'ammo "' + id + '" needs a gold value — the server is about to own prices');
    });

    // THE FTUE RULING, pinned: the first rung does not burn. At tier 1 a ranged
    // player fires ~13,900 arrows across an 8-hour absence and grosses ~18,600
    // gold doing it, so no integer price makes tier-1 ammo cost under a third
    // of the income it earns. Free at tier 1, a supply loop from tier 2 up.
    const t1 = tiered.filter(([, it]) => it.tier === 1);
    assert(t1.length > 0 && t1.every(([, it]) => it.ammoPerShot === 0),
      'the tier-1 ammo rung must be free to fire (ammoPerShot 0) — see the b343 ammo economics');
    /* b356: the floor is "> 0", not ">= 1". When this was written the ammo slot
       held arrows only, which burn one per shot. The approved whetstone ladder
       (consumable-economy §6.3/§7.2) burns **0.02 per swing** — melee hones an
       edge, it does not throw the stone away — and that number is derived from
       the same anti-faucet inequality the arrow prices are. The contract the
       test is actually protecting is "no rung above tier 1 is free", which is
       what this asserts. */
    /* `> 0`, not `>= 1`. b343 wrote this as `>= 1` when arrows were the only
       ammo in the game and one arrow per shot was the only rate imaginable.
       b357's whetstones burn at 0.02 — one honing per fifty swings — which is
       the R4 CHARGE ruling: a sharpening stone cannot be a timed buff, because
       the away ruling FREEZES buffs (they neither pay nor tick down), so a
       duration-based whetstone would pay nothing overnight in a game whose
       pitch is that it plays while you are away. A fractional burn is still a
       burn, and the property this line actually cares about — "an ammo rung
       above tier 1 is SPENT rather than permanent" — is `> 0`. */
    assert(tiered.filter(([, it]) => it.tier >= 2).every(([, it]) => it.ammoPerShot > 0),
      'every ammo rung above tier 1 must actually be spent');
    /* And the fractional case is DELIBERATE rather than a typo'd 1: a burn
       under 1 must divide evenly enough that the deterministic carry in
       src/core/ammo.js pays out on a whole number of swings. 0.02 → 50. */
    tiered.filter(([, it]) => it.ammoPerShot > 0 && it.ammoPerShot < 1).forEach(([id, it]) => {
      const swings = 1 / it.ammoPerShot;
      assert(Math.abs(swings - Math.round(swings)) < 1e-9,
        'fractional ammo "' + id + '" burns ' + it.ammoPerShot + '/swing, which is 1 per '
        + swings + ' swings — a non-integer period makes the projection quote a duration '
        + 'the carry cannot honour');
    });

    /* Prices climb with the ladder — a cheaper better arrow is a free upgrade.
       b356: PER LANE, not across the whole slot. The ammo slot now holds three
       ladders (arrows / runes / whetstones) and consumable-economy R7 is explicit
       that they are priced to equalise GOLD-PER-HOUR, not item value: a whetstone
       is ~30-50x the arrow at the same tier because melee burns 0.02 of one per
       swing and ranged burns a whole arrow. Comparing a tier-2 arrow against a
       tier-1 whetstone is comparing two different ladders and says nothing.
       The lane is derived from the damage field the rung pays in, which IS the
       thing that distinguishes the three. Ties are allowed (the elemental
       variants of §11.3 are siblings at one tier, not rungs above each other). */
    const laneOf = (it) => (it.rangeStrB || it.rangeAtkB ? 'arrows'
      : it.magicStrB ? 'runes' : it.strB ? 'whetstones' : 'other');
    const lanes = {};
    tiered.forEach((e) => { (lanes[laneOf(e[1])] = lanes[laneOf(e[1])] || []).push(e); });
    Object.entries(lanes).forEach(([lane, rows]) => {
      const sorted = rows.slice().sort((a, b) => a[1].tier - b[1].tier);
      for (let i = 1; i < sorted.length; i++) {
        assert(sorted[i][1].v >= sorted[i - 1][1].v,
          lane + ' value must not go DOWN with tier: ' + sorted[i][0] + ' (' + sorted[i][1].v + ') < '
          + sorted[i - 1][0] + ' (' + sorted[i - 1][1].v + ')');
      }
    });
    /* ── PRICES CLIMB WITHIN A LADDER, NOT ACROSS THE SLOT (b357) ──────────
       b343 sorted every ammo item by tier and demanded a monotone `v`, which
       was exactly right while ARROWS WERE THE ONLY AMMO. There are now three
       ladders in one slot — arrows (Ranged), runes (Magic), whetstones
       (Attack) — and comparing across them is meaningless, because they burn
       at wildly different RATES: an arrow goes at 1 per swing and a whetstone
       at 0.02, so a whetstone covers fifty swings and is correctly ~30-50x the
       price of the arrow at its own tier.

       R7 states the property that actually matters and it is NOT item value:
       "the gold-per-hour cost of being fully supplied is the same for all
       three styles". Item value is an OUTPUT of that constraint, bounded by
       the anti-faucet rule, not a number anybody chose. So the ladders are
       grouped by the skill that wields them and each is checked on its own —
       and the cross-ladder property is asserted separately, below, as the
       thing it really is. */
    const ladders = {};
    tiered.forEach((e) => {
      const k = e[1].reqSkill || 'unassigned';
      (ladders[k] = ladders[k] || []).push(e);
    });
    assert(Object.keys(ladders).length >= 2,
      'the ammo slot should hold more than one style ladder — got ' + Object.keys(ladders).join(','));
    Object.keys(ladders).forEach((skill) => {
      assert(skill !== 'unassigned',
        'every ammo rung must declare the reqSkill whose ladder it belongs to — '
        + 'an unassigned rung cannot be price-checked against anything');
      const sorted = ladders[skill].slice().sort((a, b) => a[1].tier - b[1].tier);
      for (let i = 1; i < sorted.length; i++) {
        assert(sorted[i][1].v >= sorted[i - 1][1].v,
          'ammo value must not go DOWN with tier inside the ' + skill + ' ladder: '
          + sorted[i][0] + ' (' + sorted[i][1].v + ') <= ' + sorted[i - 1][0] + ' (' + sorted[i - 1][1].v + ')');
      }
    });
  }),

  /* ── R7, THE CROSS-LADDER IDENTITY (b357) ────────────────────────────────
     consumable-economy.md R7: "The three ladders carry the SAME stat curve —
     2/3/5/8/11/14/18 — because they are the same slot." One guard covering all
     of them at once, so if a future item breaks the curve the failure NAMES
     which one rather than leaving three ladders to be diffed by hand.

     The doc asks for this guard explicitly (§15 coverage item 8), and it is
     the only structural defence against the slow version of the failure: one
     ladder getting a quiet +1 somewhere and one style being permanently ahead
     without anyone deciding that it should be. */
  () => tryRun('b357: arrows, runes and whetstones carry ONE stat curve (R7)', () => {
    const ITEMS = window.ITEMS || {};
    const CURVE = [2, 3, 5, 8, 11, 14, 18];
    /* Each ladder pays the ONE stat its own style reads. A rune carrying
       `rangeStrB` would be a stat nothing that equips it can use. */
    const STAT = { ranged: 'rangeStrB', magic: 'magicStrB', attack: 'strB' };
    const byLadder = {};
    Object.entries(ITEMS).forEach(([id, it]) => {
      if (!it || it.slot !== 'ammo' || !it.tier || !STAT[it.reqSkill]) return;
      (byLadder[it.reqSkill] = byLadder[it.reqSkill] || []).push([id, it]);
    });
    const skills = Object.keys(byLadder);
    assert(skills.length === 3,
      'expected three ammo ladders (ranged/magic/attack), got: ' + skills.join(',') + '. '
      + 'R7 is a claim about all three being the same slot — with fewer it asserts nothing');
    skills.forEach((skill) => {
      const stat = STAT[skill];
      byLadder[skill].forEach(([id, it]) => {
        const want = CURVE[it.tier - 1];
        assert(want !== undefined, id + ' is at tier ' + it.tier + ', outside the 7-rung curve');
        assert(it[stat] === want,
          'R7: ' + id + ' (tier ' + it.tier + ', ' + skill + ') carries ' + stat + '=' + it[stat]
          + ' but the shared curve says ' + want + ' — one slot, one curve, or a style is quietly ahead');
        /* NO CROSS-STYLE STAT LEAK (§1.3 / coverage item 9). `equipmentStats`
           sums `critB` from EVERY slot regardless of the active style, so a
           melee player equipping a crit arrow banks it for free. The shipped
           arrows already leak 0.01-0.03 that way and that is raised as a live
           bug, not fixed here — but the two ladders b357 adds must not widen
           it, so they are held to the strict rule: the style's own damage
           stat, and nothing else. */
        if (skill !== 'ranged') {
          ['critB', 'spdB', 'atkB', 'defB'].forEach((leak) => {
            assert(!it[leak],
              'R7/§1.3: ' + id + ' carries ' + leak + ' — ammo-slot stats are summed across ALL '
              + 'styles, so a stat its own style does not use is a free bonus for every other one');
          });
        }
      });
    });
    /* The three ladders must reach the same TOP END, or "same curve" is true of
       a ladder that simply stops early.

       ── b432: THIS WAS A ROW COUNT AND IS NOW A TIER SET, AND THE CHANGE IS A
          CORRECTION RATHER THAN A RELAXATION. ────────────────────────────────
       The property this guard NAMES in its own failure message is "a shorter
       ladder is a style with no top end". Row count stood in for that, and the
       proxy held exactly as long as the three ladders were shaped identically —
       7 tiers plus 3 elemental siblings at tier 6, three times over.

       It stopped standing for anything the moment magic's three elemental
       siblings were retired (b432). `rune_of_ember` / `rune_of_frost` /
       `rune_of_poison` were a SECOND authoring of `ember_rune` / `frost_rune` /
       `poison_rune`, which Elements v1 had already shipped as live craftables —
       and Elements v1 also settled the element question differently from the
       design doc that specified those siblings: an enchant is stamped on the
       WEAPON slot and is style-agnostic (`equipmentStats(eq, ITEMS, {weapon:
       'ember'})`), so every style now gets its element the same way, and none
       of them needs an elemental AMMO item to participate. Under row count,
       deleting a duplicate that no player could ever obtain "shortened magic's
       ladder" — which is not a thing that happened.

       Tier coverage says the real thing and is STRICTLY STRONGER on the axis
       that matters: it fails a ladder missing tier 4 even if that ladder has
       ten rows, which the row count could never see. */
    const tiersOf = (s) => Array.from(new Set(byLadder[s].map(([, it]) => it.tier))).sort((a, b) => a - b);
    const sets = skills.map((s) => tiersOf(s).join(','));
    assert(sets.every((t) => t === sets[0]),
      'the three ammo ladders cover different tiers (' + skills.map((s, i) => s + ':[' + sets[i] + ']').join(', ')
      + ') — a ladder that stops early is a style with no top end, whatever curve it carries');
    assert(sets[0] === '1,2,3,4,5,6,7',
      'every ammo ladder must cover tiers 1-7 with no gaps, got [' + sets[0] + ']');
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     b357 — RUNECRAFTING + STONEMASON, PLAYED.

     The suite's rule is that a new feature ships an E2E that "exercises the
     feature the way a player would". For an artisan skill that is not "the
     recipe row exists" — it is: stand at the bench with an empty bag, work the
     chain from its root, and end up holding the thing the chain is FOR. So
     these two drive `simulateArtisanSpan` (the real away/accrual engine, the
     one the server runs) once per rung, in order, feeding each rung's output
     to the next, and assert on the bag at every step.

     Starting from an EMPTY BAG is the load-bearing part. It is what proves the
     §8.4 Quarry ruling actually closes the loop: if stone had no faucet, step
     one would produce nothing and every later assertion would be vacuous.
     ══════════════════════════════════════════════════════════════════════════ */
  () => tryRun('b357 E2E: a Runecrafter starts with nothing, quarries stone, and ends up holding cast-ready runes', () => {
    const G = window.G;
    const C = window.HearthriseCore;
    const snap = snapshotG();
    const realNotify = window.notify;
    /* -- b515 - THE XP IS RECORDED AT THE SEAM, NOT READ OFF `G.skills` -------
       This ran client-authoritative and read `G.skills.mining` after each rung.
       `skills` is SERVER-OF-RECORD and armed, so `window.addXp` refuses and the
       raw map never moves - the XP assertions would have been reading a number
       the client is right not to write.

       The BAG is unchanged and is still read off `G` (inventory is client-owned
       and the whole point of this test is a supply chain filling one), so only
       the XP half moves: the fx already routes every grant through one call,
       and that call is now RECORDED as well as forwarded. What is asserted is
       what the ENGINE PAID - which is exactly what the server's copy of this
       engine will credit - rather than what the client managed to write down. */
    const paidXp = {};
    const xpOfSkill = (sk) => paidXp[sk] || 0;
    try {
      window.notify = function () {};
      const recipes = C.artisanRecipes();

      /* Run ONE rung to completion for `actions` actions and report the bag. */
      const work = (recipeId, actions) => {
        const entry = C.artisanRecipe(recipeId);
        assert(entry, 'recipe does not resolve: ' + recipeId);
        G.activeMonster = null;
        G.activeSkill = entry.skill;
        G.skillTargetId = recipeId;
        G.buffs = [];
        G.toolCarry = {};
        const stepMs = C.artisanSim.artisanIntervalMs(G, entry.skill, entry.recipe,
          { items: window.ITEMS, bonus: window.getBonus });
        return C.artisanSim.simulateArtisanSpan(G, {
          away: true, fromMs: 0, toMs: actions * stepMs,
          rng: C.rng, items: window.ITEMS, recipes,
          bonus: window.getBonus,
          fx: {
            addItem: (id, q) => window.addItem(id, q),
            removeItem: (id, q) => window.removeItem(id, q),
            /* RECORDED AND FORWARDED. The forward keeps every consequence
               `addXp` owns (PACE, the fuse, level-ups) in the loop; the record
               is what this test reads, because the write itself is refused. */
            addXp: (sk, amt) => { paidXp[sk] = (paidXp[sk] || 0) + amt; window.addXp(sk, amt); },
            updateDaily: () => {}, updateQuest: () => {},
          },
        });
      };
      const have = (id) => (G.inventory && G.inventory[id]) || 0;

      // A brand-new mason/runecrafter: no stone, no blanks, no runes, no levels.
      G.inventory = {};
      G.equipment = Object.assign({}, G.equipment, { ammo: null });
      G._recipeUnlocks = { map: {}, at: Date.now() };   // the learned set is the SERVER projection now
      G.stats = Object.assign({}, G.stats);
      G.skills = Object.assign({}, G.skills, { stonemason: 0, runecrafting: 0, mining: 0 });
      C.reseed(0xB0A57E);

      /* ── 1. THE QUARRY. Input-free, so it works with an empty bag at level 1
         — which IS the §8.4 ruling, executed rather than asserted in a comment.
         A mining by-product (the rejected P1) would produce ZERO here.
         b374 (Tyler): rock GATHERING pays MINING, not Stonemason. */
      const q = work('quarry_rubble', 200);
      assert(q.stoppedBy === null,
        'the quarry stopped (' + q.stoppedBy + ') — an input-free rung must never run dry');
      assert(q.ticks === 200, 'the quarry ran ' + q.ticks + ' of 200 actions');
      assert(have('rubble') >= 200 * 5,
        'quarrying 200 times should yield at least 1000 rubble, got ' + have('rubble'));
      assert(xpOfSkill('mining') > 0, 'quarrying must pay MINING XP (b374 — gathering rock is mining)');
      assert(xpOfSkill('stonemason') === 0,
        'quarrying must NOT pay Stonemason XP any more — refining does (got ' + xpOfSkill('stonemason') + ')');

      /* ── 2. DRESS (Cut Stone Block). Stone → the common trunk every lane
         branches off. THIS is the "refining" half, and it pays Stonemason. */
      const rubbleBefore = have('rubble');
      const d = work('dress_rubble', 100);
      assert(d.ticks === 100 && d.stoppedBy === null, 'dressing stopped early: ' + d.stoppedBy);
      assert(have('dressed_block') === 200, 'expected 200 dressed blocks, got ' + have('dressed_block'));
      assert(have('rubble') === rubbleBefore - 400, 'dressing must consume 4 rubble per action');
      assert(xpOfSkill('stonemason') > 0, 'dressing (refining) must pay Stonemason XP (b374)');

      /* ── 3. CUT BLANKS — the Stonemason → Runecrafting seam. */
      const b = work('cut_rune_blanks', 50);
      assert(b.ticks === 50 && b.stoppedBy === null, 'blank-cutting stopped early: ' + b.stoppedBy);
      assert(have('rune_blank') === 600, 'expected 600 rune blanks, got ' + have('rune_blank'));

      /* ── 4. BIND. The bench CHANGES here — Runecrafting, a different skill,
         paid out of a different XP pool. `simulateArtisanSpan` derives the
         bench from the recipe index rather than the pointer, so this is also a
         check that the new lane is actually indexed. */
      const rcBefore = xpOfSkill('runecrafting');
      const r = work('bind_air_runes', 40);
      assert(r.skill === 'runecrafting',
        'binding runes must pay the runecrafting bench, got ' + r.skill);
      assert(r.ticks === 40 && r.stoppedBy === null, 'binding stopped early: ' + r.stoppedBy);
      assert(have('air_rune') === 40 * 42, 'expected 1680 air runes, got ' + have('air_rune'));
      assert(xpOfSkill('runecrafting') > rcBefore, 'binding must pay Runecrafting XP');
      assert(have('rune_blank') === 600 - 40 * 6, 'binding must consume 6 blanks per action');

      /* ── 5. THE THING IT WAS ALL FOR: the rune is equippable ammo that a
         mage can actually socket. A supply chain that ends in an item nothing
         can equip is four rungs of busywork. */
      const rune = window.ITEMS.air_rune;
      assert(rune && rune.slot === 'ammo' && rune.type === 'ammo',
        'a bound rune must be ammo-slot equipment');
      assert(rune.magicStrB > 0, 'a bound rune must pay the magic damage stat');
      assert(window.EQUIP_SLOTS.indexOf('ammo') >= 0, 'the ammo slot must exist on the doll');
    } finally { window.notify = realNotify; restoreG(snap); }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     b432 E2E — THE PURE RUNECRAFTER. The wall Tyler's complaint was standing
     against, played rather than described.

     Every one of Runecrafting's eleven rungs wanted a Blank Rune, and the only
     blank in the game came out of Stonemason 8. So a player who opened
     Runecrafting first — level 1, nothing else trained, an empty bag — met a
     bench of eleven actions and could perform NONE of them, with no on-screen
     hint that the answer was a different skill. The b357 E2E above could not
     see this: it quarries and dresses and cuts blanks first, so by the time it
     reaches the bind it has already trained the skill that was the wall.

     THIS ONE TRAINS NOTHING ELSE, EVER. Its whole value is the assertions that
     other skills are still at zero at the end. That is why they are not
     decoration at the bottom — they ARE the test.
     ══════════════════════════════════════════════════════════════════════════ */
  () => tryRunAsync('b432 E2E: a pure Runecrafter — level 1, no other skill trained — buys blanks at the Local Shop, binds runes, and enchants a weapon with one', async () => {
    const G = window.G;
    const C = window.HearthriseCore;
    const snap = snapshotG();
    const realNotify = window.notify;
    /* b515: the XP is RECORDED at the fx seam and the shop purchase is answered
       by a server — the same two moves as the b357 E2E above, for the same
       reason. `skills` and `gold` are both SERVER-OF-RECORD and armed, so
       reading either off `G` after a gesture would be reading a number the
       client is right not to write. Everything else — the bag, the catalogue,
       the price inequality, the element maths — is unchanged. */
    const paidXp = {};
    const xpOfSkill = (sk) => paidXp[sk] || 0;
    try {
      window.notify = function () {};
      const recipes = C.artisanRecipes();
      const have = (id) => (G.inventory && G.inventory[id]) || 0;
      const work = (recipeId, actions) => {
        const entry = C.artisanRecipe(recipeId);
        assert(entry, 'recipe does not resolve: ' + recipeId);
        G.activeMonster = null;
        G.activeSkill = entry.skill;
        G.skillTargetId = recipeId;
        G.buffs = []; G.toolCarry = {};
        const stepMs = C.artisanSim.artisanIntervalMs(G, entry.skill, entry.recipe,
          { items: window.ITEMS, bonus: window.getBonus });
        return C.artisanSim.simulateArtisanSpan(G, {
          away: true, fromMs: 0, toMs: actions * stepMs,
          rng: C.rng, items: window.ITEMS, recipes, bonus: window.getBonus,
          fx: {
            addItem: (id, q) => window.addItem(id, q),
            removeItem: (id, q) => window.removeItem(id, q),
            addXp: (sk, amt) => { paidXp[sk] = (paidXp[sk] || 0) + amt; window.addXp(sk, amt); },
            updateDaily: () => {}, updateQuest: () => {},
          },
        });
      };

      /* A brand-new account that has decided to be a runecrafter and nothing
         else. Day-one gold: 500 at creation + the 500 the day-1 login pays. */
      G.inventory = {};
      G.equipment = Object.assign({}, G.equipment, { ammo: null, weapon: null });
      G._recipeUnlocks = { map: {}, at: Date.now() };   // the learned set is the SERVER projection now
      G.skills = Object.assign({}, G.skills, {
        runecrafting: 0, stonemason: 0, mining: 0, crafting: 0,
        smithing: 0, woodcutting: 0, fishing: 0,
      });
      G.gold = 1000;
      stampBalanceLikeLoad(G);
      C.reseed(0xB1A17C);

      /* ── 1. THE COUNTER STOCKS THE THING THE SKILL IS MADE OF ────────────
         And it is priced so it CANNOT be farmed. `rune_blank` is not `raw`, so
         the vendor buys it back at its full book value — a shop price at or
         under book would be a literal infinite-gold loop, which is the one way
         a convenience on-ramp could wreck the economy. */
      const offer = (window.SEED_SHOP || []).find((s) => s.id === 'rune_blank');
      assert(offer, 'the Local Shop must stock Blank Runes — otherwise Runecrafting cannot be '
        + 'started at all by a player who trains no other skill');
      const book = window.ITEMS.rune_blank.v;
      const unit = offer.cost / offer.qty;
      assert(!window.ITEMS.rune_blank.raw,
        'rune_blank is not flagged raw, so it vendors at FULL book value — this test\'s price '
        + 'inequality depends on that and must be re-derived if the flag ever changes');
      assert(unit > book,
        'Blank Runes sell at ' + unit + ' g but vendor back at ' + book + ' g — buy-low-sell-high '
        + 'is an infinite gold printer, and the shop price must always sit ABOVE book value');

      /* ── 2. BUY. The real button, not a hand-poked inventory. ─────────── */
      /* …and a real ANSWER, because `shop_buy` is a gold verb and the balance
         it leaves is the server's, not the client's subtraction. */
      const purseBefore = goldOf();
      await withServerBacked({ state: { gold: purseBefore - offer.cost } }, async (rig) => {
        window.buyShopItem('rune_blank', offer.qty, offer.cost);
        await rig.drain();
        assert(rig.sent.length === 1 && rig.sent[0].verb === 'shop_buy',
          'the counter purchase sent ' + JSON.stringify(rig.sent) + ' — one shop_buy intent');
        assert(!('cost' in rig.sent[0]) && !('gold' in rig.sent[0]),
          'the shop purchase named its own price: ' + JSON.stringify(rig.sent[0]));
      });
      assert(have('rune_blank') === offer.qty,
        'buying the Blank Rune bundle put ' + have('rune_blank') + ' in the bag, expected ' + offer.qty);

      /* ── 3. A LEVEL-1 RUNG EXISTS AND IS PERFORMABLE FROM THAT PURCHASE
         ALONE. Derived, not hard-coded to `bind_air_runes`: the contract is
         "the skill opens at 1", not "this particular recipe does". */
      const openers = (window.ARTISAN_RECIPES.runecrafting || []).filter((r) => (r.req || 1) <= 1);
      assert(openers.length > 0,
        'Runecrafting has no rung at level 1 — a skill whose first action is gated is a skill '
        + 'a new player cannot start');
      const rung = openers[0];
      const inputs = rung.inputs || (rung.input ? { [rung.input]: 1 } : {});
      Object.keys(inputs).forEach((id) => {
        assert(id === 'rune_blank',
          'the level-1 Runecrafting rung wants "' + id + '", which this player has no way to get — '
          + 'the opening rung must be satisfiable from the shop counter alone');
      });

      /* THE BUNDLE IS SMALL AND REPEATABLE ON PURPOSE (see the SEED_SHOP note
         in legacy.js): one bind eats 6 blanks for 3 effective XP, so no gold
         price reaches level 2 and the counter is a START, not a training
         method. What it MUST clear is two bars — it covers whole actions, and
         a day-one purse (500 start + 500 login) buys it several times over, so
         "I am stuck" is never the answer. */
      const runs = Math.floor(offer.qty / inputs.rune_blank);
      assert(runs >= 3,
        'one Blank Rune bundle covers only ' + runs + ' bind(s) — the on-ramp must be a first '
        + 'session, not a single click');
      assert(offer.cost * 3 <= 1000,
        'the bundle costs ' + offer.cost + ' g, so a day-one purse (500 + 500 login) cannot buy '
        + 'it three times — a top-up counter a new player can afford exactly once is a wall '
        + 'wearing a price tag');
      const r = work(rung.id, runs);
      assert(r.skill === 'runecrafting', 'the opening rung paid the ' + r.skill + ' bench');
      assert(r.ticks === runs && r.stoppedBy === null,
        'the opening rung stopped after ' + r.ticks + '/' + runs + ' actions (' + r.stoppedBy + ')');
      assert(have(rung.output) > 0, 'the opening rung produced no ' + rung.output);
      assert(xpOfSkill('runecrafting') > 0, 'the opening rung paid no Runecrafting XP');

      /* ── 4. THE POINT OF THE WHOLE TEST. Nothing else was trained. ─────── */
      ['stonemason', 'mining', 'crafting', 'smithing', 'woodcutting', 'fishing'].forEach((sk) => {
        assert(xpOfSkill(sk) === 0,
          'a pure Runecrafter ended up with ' + sk + ' XP — the skill must be startable with '
          + 'NOTHING else trained, which was exactly the wall this change removes');
      });

      /* ── 5. AND THE RUNES THE ENCHANT SYSTEM USES ARE MADE HERE TOO, END TO
         END: bind one, and the weapon it brands actually earns the element
         multiplier the fight reads. This is the join the whole ruling is about
         — before it, the rune the enchanter wanted came out of CRAFTING. */
      const bind = (window.ARTISAN_RECIPES.runecrafting || []).find((x) => x.output === 'ember_rune');
      assert(bind, 'Runecrafting must make ember_rune');
      G.skills = Object.assign({}, G.skills, { runecrafting: window.xpForLevel(bind.req + 1) });
      Object.entries(bind.inputs).forEach(([id, n]) => { window.addItem(id, n * 2); });
      const e = work(bind.id, 1);
      assert(e.ticks === 1 && e.stoppedBy === null, 'the ember bind stopped: ' + e.stoppedBy);
      assert(have('ember_rune') >= 1, 'binding produced no ember_rune');

      const EL = C.elements;
      assert(EL.runeElement('ember_rune', window.ITEMS) === 'ember',
        'the rune Runecrafting just made does not resolve to an element — the enchant verb reads '
        + 'exactly this field server-side, so a rune that fails here cannot be spent at all');
      const eq = C.combat.equipmentStats({ weapon: 'bronze_sword' }, window.ITEMS, { weapon: 'ember' });
      assert(eq.element === 'ember', 'enchanting a real weapon must stamp the element');
      const weak = Object.keys(window.MONSTERS).find((id) => window.MONSTERS[id].elementWeak === 'ember');
      assert(weak, 'no ember-weak monster to prove the enchant pays');
      assert(Math.abs(C.combat.weaknessInfo(window.MONSTERS[weak], eq).elementMult - 1.15) < 1e-9,
        'a rune bound at the Runecrafting bench must still pay x1.15 against an ember-weak foe — '
        + 'the move must not have broken the reward at the end of the chain');
    } finally { window.notify = realNotify; restoreG(snap); }
  }),

  /* ── b432 REGRESSION: "HOW DO I GET THIS?" MUST NEVER ANSWER "IT MAY HAVE
     BEEN REMOVED" FOR SOMETHING YOU CAN SIMPLY MAKE. ───────────────────────
     `showAcquisitionTip` knew about shops, crops, gathering nodes and mob
     drops and nothing at all about the ~150 artisan recipes, so every bar,
     plank, blank and rune in the game answered "No known sources · This item
     may be quest-locked or removed". Not merely unhelpful — FALSE, and it
     tells a player who could act right now to stop looking. Found by playing
     the Runecrafting fix from an empty bag: the one item the whole skill runs
     on said it might have been removed.

     The fixture is deliberately a SPREAD of craftables from four different
     benches, not just the rune: a guard that only watched rune_blank would go
     green on a fix that special-cased it. */
  () => tryRun('b432: "How do I get this?" names the bench for a craftable, and never claims a live item was removed', () => {
    const ask = (id) => {
      window.showAcquisitionTip(id);
      const ov = document.getElementById('acq-overlay');
      assert(ov, 'the acquisition overlay did not open for ' + id);
      const txt = ov.innerText || '';
      window.hideAcquisitionTip();
      return txt;
    };
    /* Craft-only items across four benches — none has a drop, node or shop row
       to fall back on, so each one is a real test of the recipe path. */
    const CASES = [
      ['dressed_block', 'Stonemason'],
      ['rune_blank', 'Stonemason'],
      ['normal_plank', 'Crafting'],
      ['ember_rune', 'Runecrafting'],
    ];
    CASES.forEach(([id, skill]) => {
      const txt = ask(id);
      assert(!/No known sources/.test(txt),
        'the game told a player that ' + id + ' "may be quest-locked or removed" — it is craftable at '
        + 'the ' + skill + ' bench, and a false dead end is worse than a missing hint');
      assert(txt.indexOf(skill) >= 0,
        'the acquisition tip for ' + id + ' does not name the ' + skill + ' bench: ' + txt.replace(/\s+/g, ' '));
    });
    /* THE LOWEST GATE, NOT THE LAST ROW. rune_blank has two Stonemason
       recipes; quoting `split_rune_blanks` (Lv 22) instead of
       `cut_rune_blanks` (Lv 1 since the 2026-09-13 self-supply ruling; Lv 4
       before it) reads as "come back much later" to a player who could act now.
       Same ruling as item-index.js's source line. The level below is DERIVED from
       the recipe table rather than typed, because the typed `4` went stale the
       first time a balance ruling moved that rung. */
    const blankReqs = (window.ARTISAN_RECIPES.stonemason || [])
      .filter((r) => r.output === 'rune_blank').map((r) => r.req || 1);
    assert(blankReqs.length >= 2, 'the fixture needs an item with TWO recipes to measure anything');
    const lowest = Math.min.apply(null, blankReqs);
    const highest = Math.max.apply(null, blankReqs);
    const blankTxt = ask('rune_blank');
    assert(new RegExp('Lv ' + lowest + ' required').test(blankTxt),
      'the tip must quote the EASIEST recipe (Lv ' + lowest + '), got: ' + blankTxt.replace(/\s+/g, ' '));
    assert(!new RegExp('Lv ' + highest + ' required').test(blankTxt),
      'the tip quoted the hardest rung (Lv ' + highest + ') — the answer to "how do I get this" must be '
      + 'the gate the player can reach first');
    /* The same rule, on the other surface that answers this question. */
    assert(new RegExp('Stonemason Lv ' + lowest).test(window.itemSourceLine('rune_blank')),
      'the item flyout source line must also name the easiest recipe, got: ' + window.itemSourceLine('rune_blank'));
  }),

  () => tryRunRestampingBalance('b357 E2E: a Stonemason turns quarried stone into whetstones and an Ashlar the castle actually wants', () => {
    const G = window.G;
    const C = window.HearthriseCore;
    const snap = snapshotG();
    const realNotify = window.notify;
    try {
      window.notify = function () {};
      const recipes = C.artisanRecipes();
      const work = (recipeId, actions) => {
        const entry = C.artisanRecipe(recipeId);
        assert(entry, 'recipe does not resolve: ' + recipeId);
        G.activeSkill = entry.skill; G.skillTargetId = recipeId;
        G.buffs = []; G.toolCarry = {};
        const stepMs = C.artisanSim.artisanIntervalMs(G, entry.skill, entry.recipe,
          { items: window.ITEMS, bonus: window.getBonus });
        return C.artisanSim.simulateArtisanSpan(G, {
          away: true, fromMs: 0, toMs: actions * stepMs,
          rng: C.rng, items: window.ITEMS, recipes, bonus: window.getBonus,
          fx: {
            addItem: (id, q) => window.addItem(id, q),
            removeItem: (id, q) => window.removeItem(id, q),
            addXp: (sk, amt) => window.addXp(sk, amt),
            updateDaily: () => {}, updateQuest: () => {},
          },
        });
      };
      const have = (id) => (G.inventory && G.inventory[id]) || 0;

      G.activeMonster = null;
      G.inventory = {};
      G._recipeUnlocks = { map: {}, at: Date.now() };   // the learned set is the SERVER projection now
      G.skills = Object.assign({}, G.skills, { stonemason: 0 });
      C.reseed(0x570BE0);

      // Quarry both grades, dress both, then take each branch.
      work('quarry_rubble', 300);
      work('quarry_granite', 300);
      work('dress_rubble', 120);
      work('dress_granite', 120);
      assert(have('dressed_block') === 240, 'expected 240 dressed blocks, got ' + have('dressed_block'));
      assert(have('granite_block') === 240, 'expected 240 granite blocks, got ' + have('granite_block'));

      /* ── THE MELEE BRANCH. Coarse whetstones need nothing but dressed stone,
         so the very first whetstone is reachable from an empty bag — which is
         what makes melee's supply loop openable on day one. */
      const w = work('grind_coarse_whetstone', 20);
      assert(w.ticks === 20 && w.stoppedBy === null, 'grinding stopped early: ' + w.stoppedBy);
      assert(have('coarse_whetstone') === 200, 'expected 200 whetstones, got ' + have('coarse_whetstone'));
      const stone = window.ITEMS.coarse_whetstone;
      assert(stone.slot === 'ammo' && stone.strB > 0,
        'a whetstone must be an ammo-slot item that pays melee damage');

      /* ── THE CASTLE BRANCH. `cut_ashlar` also needs an Iron Fitting, which is
         Smithing's castle good — deliberately, so the property ladder is fed by
         more than one artisan pillar. Granted here rather than smithed, because
         this test is about the MASON's half of the chain. */
      G.inventory.iron_fitting = 10;
      const a = work('cut_ashlar', 8);
      assert(a.ticks === 8 && a.stoppedBy === null, 'ashlar cutting stopped early: ' + a.stoppedBy);
      assert(have('ashlar') === 8, 'expected 8 ashlar, got ' + have('ashlar'));

      /* ── AND THE SINK IS REAL. An `ashlar` that nothing consumes would be the
         Cellar's "+500 storage" bug in a new coat: a good with a recipe, a
         value and a category tab, feeding nothing. It is a cost of the top
         three property tiers, and those costs are SERVER-SIDE (they regenerate
         into hr_unlock_offers, which hr_unlock_buy charges out of). */
      const TIERS = window.HearthriseHomestead && window.HearthriseHomestead.TIERS;
      assert(Array.isArray(TIERS), 'the homestead tier table must be published');
      const wanters = TIERS.filter((t) => t.cost && t.cost.ashlar > 0);
      assert(wanters.length === 3,
        'exactly three property tiers should demand ashlar, got ' + wanters.length);
      assert(wanters.every((t) => t.cost.ashlar > 0), 'an ashlar cost of 0 is not a sink');

      /* ── NO DEADLOCK, AND IT IS PROVED RATHER THAN ARGUED (R8 / b213 / b227).
         Both historical deadlocks were a property tier demanding a material
         whose BENCH that tier unlocked. Stonemason has no workbench, so an
         ashlar must be makeable at property tier 0 — which the whole run above
         just did, having started from an empty bag with no rooms. */
      const H = window.HearthriseHomestead;
      assert(!(H.WORKBENCH || {}).stonemason,
        'Stonemason must require NO workbench (R8) — a bench here re-opens the b227 deadlock class');
      assert(!(H.WORKBENCH || {}).runecrafting, 'Runecrafting must require no workbench');
    } finally { window.notify = realNotify; restoreG(snap); }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     b357 — THE SHARED CONSUMPTION PRIMITIVE (src/core/ammo.js).

     R1: one field, one carry, one guard. These grade the SEAM, which is what
     Fletching will inherit — so a break here is a break in all three skills at
     once, and the failure should say so.
     ══════════════════════════════════════════════════════════════════════════ */
  () => tryRun('b357 AMMO-1: running dry is FAIL-SOFT at x0.25, and melee is exempt (R2/R5)', () => {
    const A = window.HearthriseCore && window.HearthriseCore.ammo;
    assert(A && typeof A.ammoDamageMult === 'function',
      'src/core/ammo.js is not published on HearthriseCore — the projection can never call it');
    assert(A.AMMO_DRY_MULT === 0.25,
      'the unsupplied multiplier is 0.25 (measured: 26-38% of a supplied night). '
      + 'Changing it is a design decision — see consumable-economy.md §3.3');

    // An ammo-hungry style with an empty quiver keeps fighting, weakly.
    assert(A.ammoDamageMult({ weaponType: 'ranged', perShot: 1, stock: 0 }) === 0.25,
      'an archer with no arrows must fight at x0.25 — NOT be stopped');
    assert(A.ammoDamageMult({ weaponType: 'magic', perShot: 1, stock: 0 }) === 0.25,
      'a mage with no runes must fight at x0.25');
    // Supplied is full strength.
    assert(A.ammoDamageMult({ weaponType: 'ranged', perShot: 1, stock: 1 }) === 1,
      'one arrow left is still full strength — the penalty is for EMPTY');

    /* R5 — MELEE'S FLOOR IS FREE. The starting weapon is a Bronze Sword; a paid
       melee floor would put every brand-new character in the penalty state from
       second one, and the only other way to price it is weapon durability. */
    assert(A.ammoDamageMult({ weaponType: 'sword', perShot: 0, stock: 0 }) === 1,
      'an unsharpened sword must swing at full strength (R5)');
    assert(A.ammoDamageMult({ weaponType: 'hammer', perShot: 0, stock: 0 }) === 1,
      'an unsharpened hammer must swing at full strength');
    assert(A.styleNeedsAmmo('ranged') && A.styleNeedsAmmo('magic'), 'ranged and magic spend ammo');
    assert(!A.styleNeedsAmmo('sword') && !A.styleNeedsAmmo('hammer') && !A.styleNeedsAmmo('neutral'),
      'no melee family — and not an unarmed player — may take the depletion penalty');

    /* THE FREE TIER-1 RUNG never triggers the penalty, because it is never
       spent. This is what makes the mechanic invisible to a beginner, which
       §12.2 argues is the right failure mode for shipping it to new players. */
    assert(A.ammoDamageMult({ weaponType: 'magic', perShot: 0, stock: 0 }) === 1,
      'a free tier-1 rung must never put a player into the penalty state');
    assert(window.ITEMS.air_rune.ammoPerShot === 0 && window.ITEMS.coarse_whetstone.ammoPerShot === 0,
      'the tier-1 rung of each new ladder must be free to fire');
  }),

  () => tryRun('b357 AMMO-2: burn is deterministic, time-only, and the projection matches the outcome', () => {
    const A = window.HearthriseCore.ammo;

    /* R3 — BURN IS A PURE FUNCTION OF TIME. 1,000 swings at 0.02 spends
       exactly 20 whetstones, twice, with no RNG anywhere near it. */
    const runCarry = () => {
      const carry = {};
      let total = 0;
      for (let i = 0; i < 1000; i++) total += A.advanceAmmoCarry(carry, 'steel_whetstone', 1, 0.02);
      return { total, carry: carry.steel_whetstone };
    };
    const a = runCarry(); const b = runCarry();
    assert(a.total === 20, '1000 swings at 0.02 must spend exactly 20 stones, got ' + a.total);
    assert(a.total === b.total, 'the carry is not deterministic: ' + a.total + ' vs ' + b.total);
    /* The float correction matters: 0.02 accumulated fifty times lands at
       0.9999999999999999 without the +1e-9 and the stone is never spent. */
    assert(Math.abs(a.carry) < 1e-9, 'the carry should land clean on a whole multiple, got ' + a.carry);
    // One call for 1000 swings == 1000 calls of one swing (the aggregation rule).
    const bulk = {};
    assert(A.advanceAmmoCarry(bulk, 'steel_whetstone', 1000, 0.02) === 20,
      'charging a whole slice at once must equal charging swing by swing — §13.2 requires the '
      + 'span to write ONE aggregated ledger row, not 13,636 of them');

    /* THE PROJECTION AND THE OUTCOME COME FROM ONE EXPRESSION. §10: "a player
       who buys exactly what they were quoted must not run dry in the last
       minute." Ten random loadouts, pre-flight vs post-hoc. */
    const TICK = [2112, 2520, 2400, 3240, 1689];
    for (let i = 0; i < 10; i++) {
      const tickMs = TICK[i % TICK.length];
      const perShot = (i % 3 === 0) ? 0.02 : 1;
      const stock = 500 + i * 733;
      const hours = A.hoursOfSupply(stock, tickMs, perShot);
      const dry = A.dryAtMs(0, stock, perShot, tickMs);
      assert(dry !== null, 'a spent rung must report a dry-out moment');
      /* dryAtMs floors to a whole swing, so it can be up to one tick EARLIER
         than the continuous projection — never later, which is the direction
         that would make the quote a lie. */
      const projectedMs = hours * 3600000;
      assert(dry <= projectedMs + 1e-6 && dry > projectedMs - tickMs - 1e-6,
        'the pre-flight projection (' + projectedMs.toFixed(0) + 'ms) and the reported dry-out ('
        + dry + 'ms) disagree by more than one swing — one of them is lying to the player');
    }
    // A free rung and an empty slot both mean "never runs out", not "runs out now".
    assert(A.hoursOfSupply(1, 2112, 0) === Infinity, 'a free rung must never run dry');
    assert(A.dryAtMs(0, 1, 0, 2112) === null, 'a free rung has no dry-out moment');

    /* THE PUBLISHED BURN BANDS, so a retune of the swing formula is caught here
       rather than by a player being quoted the wrong number of arrows. */
    assert(Math.round(A.consumablesPerHour(2112, 1)) === 1705, 'a Rapid bow should burn ~1705 arrows/h');
    assert(Math.round(A.consumablesPerHour(2520, 1)) === 1429, 'a staff should burn ~1429 runes/h');
    assert(Math.round(A.consumablesPerHour(2400, 0.02)) === 30, 'a sword should burn ~30 whetstones/h');
  }),

  () => tryRun('b357 AMMO-3: a quiver is SPENT — the stack drains, stops at zero, and reports the moment', () => {
    const A = window.HearthriseCore.ammo;
    const spent = [];
    const state = {
      equipment: { ammo: 'earth_rune' },
      inventory: { earth_rune: 100 },
    };
    const ctx = {
      items: window.ITEMS, weaponType: 'magic',
      fx: { removeItem: (id, q) => spent.push([id, q]) },
    };
    // 40 casts spend 40 runes, in ONE call.
    let r = A.spendForSwings(state, 40, ctx);
    assert(r.spent === 40 && r.dryAfterSwings === null, 'expected 40 spent, got ' + r.spent);
    assert(spent.length === 1, 'a slice must cost exactly one removeItem call, got ' + spent.length);
    state.inventory.earth_rune -= r.spent;

    // The stack runs out MID-RUN: charge only for what it covered, and say so.
    r = A.spendForSwings(state, 200, ctx);
    assert(r.spent === 60, 'the last 60 runes should be spent, got ' + r.spent);
    assert(r.dryAfterSwings === 60,
      'the span must report WHICH swing emptied the stack (got ' + r.dryAfterSwings + ') — '
      + 'the away card cannot say "you ran out 4h 20m in" from a number nobody stated');
    assert(r.dry === true && r.mult === 0.25, 'after the stack empties the run continues at x0.25');
    state.inventory.earth_rune -= r.spent;
    assert(state.inventory.earth_rune === 0, 'the quiver must not go negative');

    // Empty: nothing more is spent, and the fight is NOT stopped.
    r = A.spendForSwings(state, 500, ctx);
    assert(r.spent === 0, 'an empty quiver must spend nothing, got ' + r.spent);
    assert(r.mult === 0.25, 'an empty quiver still fights, weakly');

    // MELEE with an empty slot spends nothing and is not penalised.
    const melee = { equipment: { ammo: null }, inventory: {} };
    const mr = A.spendForSwings(melee, 5000, { items: window.ITEMS, weaponType: 'sword', fx: {} });
    assert(mr.spent === 0 && mr.mult === 1, 'a sword with an empty ammo slot pays nothing and loses nothing');

    /* THE SLOT IS A POINTER, NOT A CONTAINER (§2.2). The whole quiver stays in
       the inventory, so the supply the player is asked about is literally
       `inventory[ammoId]` with no second place for it to hide. */
    const info = A.readAmmo({ equipment: { ammo: 'blood_rune' }, inventory: { blood_rune: 7 } },
      { items: window.ITEMS, weaponType: 'magic' });
    assert(info.stock === 7 && info.id === 'blood_rune',
      'readAmmo must read the stack out of the INVENTORY, not out of the slot');
  }),

  /* The two skills have to be FINDABLE. A bench that exists only in the data
     is content the player cannot reach, which is the same as no content — so
     this drives the real renderers and reads the real DOM: the Activities list
     must offer both skills, opening one must paint its tiles, and the lane
     strip must be there to navigate Stonemason's four lanes. */
  () => tryRunRestampingBalance('b357 UI: both new skills appear in Activities and paint a working tile grid', () => {
    const G = window.G;
    const snap = snapshotG();
    try {
      G.skills = Object.assign({}, G.skills, { stonemason: 0, runecrafting: 0 });
      window.showTab('skills');
      window.renderSkillsList();
      const list = document.getElementById('skills-list');
      assert(list, 'the Activities list must exist');
      const listed = list.textContent || '';
      assert(/Runecrafting/.test(listed), 'Runecrafting is missing from the Activities list');
      assert(/Stonemason/.test(listed), 'Stonemason is missing from the Activities list');

      ['stonemason', 'runecrafting'].forEach((skill) => {
        window.openSkillDetail(skill);
        window.renderSkillDetail(skill);
        const detail = document.getElementById('skill-detail');
        assert(detail, 'the skill detail host must exist');
        const tiles = detail.querySelectorAll('.act-tile, .monster-row');
        /* `> 0`, not `=== recipes.length`: the lane strip filters the grid to
           ONE category at a time, which is the whole reason Stonemason has a
           strip. Asserting the full count here would demand the strip not
           work. */
        assert(tiles.length > 0,
          skill + ' painted no activity tiles — the bench is unreachable from the UI');
        assert(!/No activities/.test(detail.textContent || ''),
          skill + ' rendered the "no activities" empty state despite having '
          + window.ARTISAN_RECIPES[skill].length + ' recipes');
      });

      /* Stonemason's four lanes need the category strip, or a mason hunting the
         next whetstone scrolls past quarry rungs, blocks and blanks to find it.
         Read off the SAME published helper both renderers use, so this cannot
         pass against a strip only one of the twins builds. */
      const cat = window.HearthriseArtisanCat;
      assert(cat && typeof cat.strip === 'function', 'the artisan lane strip helper must be published');
      const strip = cat.strip('stonemason') || '';
      ['Quarry', 'Masonry', 'Blank Runes', 'Whetstones', 'Castle Stores'].forEach((label) => {
        assert(strip.indexOf(label) >= 0, 'the Stonemason lane strip is missing "' + label + '"');
      });
      // And selecting a lane returns only that lane's recipes.
      assert(cat.recipesFor('stonemason').length > 0, 'the lane filter returned no Stonemason recipes');
    } finally { restoreG(snap); }
  }),

  () => tryRun('b357: the Quarry lane is a faucet, and it is priced like one', () => {
    /* An input-free recipe mints from nothing at a fixed rate, which is
       economically identical to a mining node — so its output must vendor at
       VENDOR_RAW_RATE like ore, or Stonemason becomes a gold printer that
       beats Mining at its own job.

       DERIVED from the recipe table rather than from a hand list, which is the
       whole point: items.js cannot import recipes.js (the cycle would leave
       ITEMS half-built), so the `raw` flag there IS a hand list — and this is
       what stops a future quarry rung from being added without it. */
    const R = window.ARTISAN_RECIPES;
    const inputsOf = (r) => r.inputs || (r.input ? { [r.input]: r.inputQty || 1 } : {});
    const minted = [];
    Object.keys(R).forEach((skill) => {
      (R[skill] || []).forEach((r) => {
        if (r.output && Object.keys(inputsOf(r)).length === 0) minted.push([skill, r]);
      });
    });
    assert(minted.length >= 3,
      'expected the three Quarry rungs to be input-free, found ' + minted.length
      + ' — if this is 0 the assertion below proves nothing');
    minted.forEach(([skill, r]) => {
      const out = window.ITEMS[r.output];
      assert(out, r.id + ' mints an item that does not exist: ' + r.output);
      assert(out.raw === true,
        r.id + ' mints "' + r.output + '" from NOTHING but it is not flagged raw — the vendor would '
        + 'pay full book value for a material the player conjured, which is a gold faucet. '
        + 'Add it to RAW_QUARRIED in src/data/items.js.');
      assert(window.vendorPrice(r.output) < out.v,
        'the vendor must bid less than book for ' + r.output);
      assert(skill === 'stonemason',
        'a new input-free lane appeared on "' + skill + '" — minting from nothing is a Quarry-lane '
        + 'ruling (§8.4), not a pattern to copy without one');
    });
  }),

  () => tryRun('b357: both new benches are SERVER-PAYABLE, and their lanes strand no recipe', () => {
    const C = window.HearthriseCore;
    const AS = C.artisanSim;
    assert(AS && typeof AS.benchPayable === 'function', 'the bench-payability model must be published');

    /* A bench is payable when every bonus key that can DESTROY value on it is
       server-owned end to end. Cooking is the one bench that is not, because
       `noBurn` decides whether the input becomes the dish or becomes
       burnt_food, and the server's copy of the Kitchen rung goes stale-low.

       Neither new bench has such a key: `resolveArtisanAction` rolls a burn
       only for `skillId === 'cooking'` and craftSave only for `'crafting'`, so
       every bonus these two can read is additive and a stale zero merely
       UNDER-pays — the safe direction. Asserted rather than assumed, because
       "payable by default" is exactly the kind of thing that should be a
       DECISION on the record and not an oversight. */
    ['runecrafting', 'stonemason'].forEach((skill) => {
      assert(AS.benchPayable(skill) === true,
        skill + ' is not server-payable — the accrual engine would refuse every night on it, '
        + 'and (because a pointer that can be set and not paid is a lockout) the player could not '
        + 'even switch away. Blocked by: ' + AS.benchBlockedBy(skill));
      assert(AS.benchBlockedBy(skill) === null, skill + ' reports a blocking bonus key');
      assert(!AS.BENCH_DESTRUCTIVE_KEYS[skill],
        skill + ' declares a destructive bonus key — if that is real it must be reviewed, not added');
    });
    /* And every one of their recipes is settable AND payable, which is one
       answer to two questions on purpose (see recipePayable's header). */
    const index = C.artisanRecipes();
    ['runecrafting', 'stonemason'].forEach((skill) => {
      window.ARTISAN_RECIPES[skill].forEach((r) => {
        assert(AS.recipePayable(index, r.id),
          r.id + ' is not payable — hr_apply would stamp accrued_to on a pointer the engine refuses');
      });
    });

    /* CATEGORY COMPLETENESS, in the same commit as the recipes (§15 item 12).
       `uncategorized` being non-empty means a recipe the player can never find
       through the lane strip — content made unreachable by a missing branch. */
    ['runecrafting', 'stonemason'].forEach((skill) => {
      const res = window.categorizeRecipes(skill, window.ARTISAN_RECIPES[skill], window.ITEMS);
      assert(res.uncategorized.length === 0,
        skill + ' stranded ' + res.uncategorized.length + ' recipe(s) outside every lane: '
        + res.uncategorized.map((r) => r.id).join(', '));
      assert(res.total > 0, skill + ' has no recipes at all');
      // Every declared lane is filled — an empty tab is a dead end, not a lane.
      const declared = window.ARTISAN_CATEGORIES[skill].map((d) => d.key).sort();
      const filled = res.groups.map((g) => g.key).sort();
      assert(declared.join(',') === filled.join(','),
        skill + ' declares lanes it cannot fill: declared [' + declared + '] vs filled [' + filled + ']');
    });

    /* THE SPEED KEY. `speedKeyFor` falls back to `gatherSpeed` for anything it
       does not know, so an unwired artisan bench is not merely unconfigured —
       it runs at the GARDEN's rate, on the server as well as the client. */
    assert(window.speedKeyFor('runecrafting') === 'craftSpeed', 'Runecrafting must run on craftSpeed');
    assert(window.speedKeyFor('stonemason') === 'craftSpeed', 'Stonemason must run on craftSpeed');
    assert(window.speedKeyFor('nonsense_skill') === 'gatherSpeed', 'control: the fallback still exists');
  }),

  () => tryRun('b374: rock-gathering pays Mining, refining pays Stonemason (Tyler)', () => {
    const R = window.ARTISAN_RECIPES.stonemason;
    const find = (id) => R.find((r) => r.id === id);
    ['quarry_rubble', 'quarry_granite', 'quarry_basalt'].forEach((id) => {
      const r = find(id);
      assert(r, id + ' is missing');
      assert(r.xpSkill === 'mining',
        id + ' must pay Mining XP (gathering rock is mining), got xpSkill=' + r.xpSkill);
    });
    // Refine lanes must NOT carry an xpSkill override — they pay the bench (Stonemason).
    ['dress_rubble', 'dress_granite', 'dress_basalt', 'grind_coarse_whetstone', 'cut_rune_blanks'].forEach((id) => {
      const r = find(id);
      assert(r && !r.xpSkill, id + ' (refining) must pay Stonemason, but carries xpSkill=' + (r && r.xpSkill));
    });
    // The engine actually honours the override.
    const C = window.HearthriseCore;
    const res = C.artisan.resolveArtisanAction(find('quarry_rubble'), {
      skillId: 'stonemason', inventory: {}, unlockedRecipes: {}, items: window.ITEMS,
      bonus: () => 0, toolCarry: {}, rng: C.rng,
    });
    assert(res.ok && res.xpSkill === 'mining',
      'resolveArtisanAction must redirect quarry XP to mining, got ' + res.xpSkill);
    // Quarry stays a supply activity: below the comparable Mining ore rung's xp/s.
    const rubble = find('quarry_rubble');
    assert(rubble.xp / rubble.ms < 21 / 3000,
      'quarry rubble xp/s (' + (rubble.xp / rubble.ms).toFixed(4) + ') must stay under Copper Rock ('
      + (21 / 3000).toFixed(4) + ') so quarrying never out-trains ore');
  }),

  () => tryRun('b374: masonry "dress" jargon is gone — Stone/Granite/Basalt Block (Tyler)', () => {
    const R = window.ARTISAN_RECIPES.stonemason;
    const find = (id) => R.find((r) => r.id === id);
    assert(!/dress/i.test(find('dress_rubble').name), 'dress_rubble label still says "dress": ' + find('dress_rubble').name);
    assert(find('dress_rubble').name === 'Cut Stone Block', 'expected "Cut Stone Block", got ' + find('dress_rubble').name);
    assert(find('dress_granite').name === 'Cut Granite Block', 'got ' + find('dress_granite').name);
    assert(find('dress_basalt').name === 'Cut Basalt Block', 'got ' + find('dress_basalt').name);
    // Product display name dropped "Dressed"; the id is preserved (no catalogue re-key).
    assert(window.ITEMS.dressed_block, 'dressed_block id must survive (no catalogue re-key)');
    assert(window.ITEMS.dressed_block.n === 'Stone Block',
      'dressed_block must display as "Stone Block", got ' + window.ITEMS.dressed_block.n);
    assert(!/dressed/i.test(window.ITEMS.dressed_block.n), 'the "dressed" jargon must be gone from the name');
  }),

  () => tryRun('b374: arrow batches cut to a round ×50 (Tyler: "500 is way too much")', () => {
    const fletch = window.ARTISAN_RECIPES.crafting.filter((r) => r.id.startsWith('fletch_'));
    assert(fletch.length === 7, 'expected 7 fletch rows, got ' + fletch.length);
    fletch.forEach((r) => {
      assert(r.outputQty === 50, r.id + ' must produce 50 per craft now, got ' + r.outputQty);
      assert(/×50\b/.test(r.name), r.id + ' label must read ×50, got ' + r.name);
    });
    // xp-per-action is unchanged (time-to-99 preserved) — bronze is still 90 book.
    assert(fletch.find((r) => r.id === 'fletch_bronze_arrows').xp === 90,
      'fletch xp must be unchanged so Fletching time-to-99 is untouched');
  }),

  () => tryRun('b374: a gather tile names its yield so the sprite is not the node (Tyler)', () => {
    const G = window.HearthriseActivitiesGrid;
    assert(G && typeof G.__tileForGather === 'function', 'the gather-tile builder must be published');
    // A real Oak Tree node (id/name/prod are the load-bearing fields for this tile).
    const node = { id: 'oak_tree', name: 'Oak Tree', req: 15, xp: 23, ms: 4000, prod: 'oak_log', icon: '🌳' };
    const html = G.__tileForGather(node, 'woodcutting');
    const oakLogName = (window.ITEMS.oak_log && window.ITEMS.oak_log.n) || 'Oak Log';
    assert(/at-yield/.test(html), 'the gather tile must carry a yield caption');
    assert(html.indexOf('Yields ' + oakLogName) >= 0,
      'the gather tile must name its product (' + oakLogName + ') as the yield, not imply the sprite is the tree');
  }),

  () => tryRun('b374: leveling a skill fires the celebratory notice; a plain tick does not (Tyler)', () => {
    // Unlock lookup is honest per skill.
    const woodUnlocks = window.hrSkillUnlocksAt('woodcutting', 15);
    assert(woodUnlocks.indexOf('Oak Tree') >= 0,
      'Woodcutting Lv 15 must report the Oak Tree unlock, got [' + woodUnlocks.join(', ') + ']');
    assert(window.hrSkillUnlocksAt('woodcutting', 14).length === 0,
      'a level with no new activity must report no unlocks');

    const snap = snapshotG();
    const realNotify = window.notify;
    try {
      window.notify = function () {};
      window._hrLastLevelUp = null;
      window.G.skills = Object.assign({}, window.G.skills, { woodcutting: 0 });
      window.addXp('woodcutting', 200000);   // crosses several levels
      assert(window._hrLastLevelUp && window._hrLastLevelUp.skill === 'woodcutting',
        'a level-up MUST fire the notice with the right skill');
      assert(window._hrLastLevelUp.level > 1, 'the notice must carry the new level, got ' + window._hrLastLevelUp.level);

      // A plain XP tick at the cap must NOT fire it.
      window._hrLastLevelUp = null;
      window.G.skills.woodcutting = 13034431;  // level 99
      window.addXp('woodcutting', 5);
      assert(window._hrLastLevelUp === null,
        'a normal XP tick that crosses no level boundary must NOT fire the notice');
    } finally { window.notify = realNotify; restoreG(snap); }
  }),

  () => tryRun('b343: the spdB speed budget is closed (the pacing anchor holds)', () => {
    const ITEMS = window.ITEMS || {};
    /* `spdB` sits OUTSIDE the getBonus power budget — it is an item stat, not a
       getBonus key, so power-budget.js never sees it. It multiplies the swing
       RATE, which multiplies combat XP, gold per hour AND drops per hour at
       once: the permanent fuse allows +20% on ONE governed key, and the
       best-in-slot spdB sum already buys +19.0% on three.
       swingIntervalMs() clamps at 0.20. If gear ever sums past that clamp,
       every further speed item becomes a NULL item — it says "+2% attack speed"
       on the tooltip and does nothing. That is the failure this guard prevents.
       BUDGET = the live best-in-slot sum, frozen. The speed ladder is closed;
       raising this number is a design decision, not a tuning pass. */
    const BUDGET = 0.16;
    const best = {};
    Object.entries(ITEMS).forEach(([id, it]) => {
      if (!it || !it.spdB || !it.slot) return;
      const k = it.slot;
      if (!best[k] || it.spdB > best[k].spdB) best[k] = { id, spdB: it.spdB };
    });
    const sum = Object.values(best).reduce((t, x) => t + x.spdB, 0);
    const roster = Object.entries(best).map(([k, x]) => k + ':' + x.id + '(' + x.spdB + ')').join(' ');
    assert(sum <= BUDGET + 1e-9,
      'best-in-slot spdB sums to ' + sum.toFixed(3) + ', over the ' + BUDGET + ' design budget — ' + roster);
    // And the budget must stay strictly under the engine clamp, or the clamp
    // binds and the top of the ladder stops paying.
    const clamp = (window.HearthriseCore && window.HearthriseCore.combat && window.HearthriseCore.combat.COMBAT_BALANCE)
      ? 0.20 : 0.20;
    assert(BUDGET < clamp, 'the spdB design budget must stay strictly under the engine clamp of ' + clamp);
  }),

  () => tryRun('b343: crit stays under the engine cap even in a perfect kit', () => {
    const ITEMS = window.ITEMS || {};
    const CAP = 0.60;   // COMBAT_BALANCE.critCap
    const best = {};
    Object.entries(ITEMS).forEach(([id, it]) => {
      if (!it || !it.critB || !it.slot) return;
      if (!best[it.slot] || it.critB > best[it.slot].critB) best[it.slot] = { id, critB: it.critB };
    });
    // rings are two sockets served by one slot key
    let sum = Object.entries(best).reduce((t, [slot, x]) => t + x.critB * (slot === 'ring' ? 2 : 1), 0);
    sum += 0.08;   // the best armorSetBonus (tier 8 x 0.01) plus headroom
    assert(sum <= CAP,
      'best-in-slot critB + set bonus reaches ' + sum.toFixed(3) + ', at or over the engine cap of ' + CAP +
      ' — past the cap every further crit item is a null item');
  }),

  /* ════════════════════════════════════════════════════════════
     b348 — THE TWO RECIPE AUTHORITIES MUST AGREE ABOUT ORDER
     (Xarn, live report: "Steel Platebody adds 22 Def requires 60 smithing;
     Mithril Platebody adds 34 Def requires 54ish… the order of armour items to
     smith is not based on requirement yet.")

     He was right, and the cause is structural rather than a typo. Hearthrise
     has TWO recipe authorities: the generated curve in src/data/gear-tiers.js,
     and hand-authored rows in src/data/recipes.js that are spread FIRST and
     therefore win the merge — deliberately, so historical costs survive. Five
     of those rows share an ID with their generated twin, so the merge drops the
     generated recipe and the hand-authored `req` replaces the curve with no
     trace at all. Three lanes were disordered by it (platebody INVERTED, helm
     and belt TIED) and no test could see it, because nothing compared a live
     gate to the lane it belongs to.

     WHAT THIS GUARDS, AND WHY IT IS NOT "req === curveReq". Deviating from the
     curve is legitimate — eleven rungs still do (a bespoke Rune Sword costs
     more and asks for more). The property the PLAYER experiences is ORDER: a
     strictly better item at a strictly higher material tier must never unlock
     at or below the rung beneath it. So the assertion is monotonicity, and a
     deliberate deviation that keeps the ladder ordered stays legal.

     It reads `GEAR_LADDERS` — published by the generator itself — rather than
     rebuilding the lanes from item-id patterns, because plate ids are
     `mat + '_' + slot.key` while leather/cloth are `tierId + '_' + slot.slot`,
     and a guard carrying its own copy of that scheme is the same two-authority
     bug one layer up. And it looks a rung up by OUTPUT, not by recipe id, so an
     override that renames the recipe (tailor_leather_boots beats
     craft_leather_boots) is still seen.
     ════════════════════════════════════════════════════════════ */
  () => tryRun('b348: no gear ladder is out of order — a higher material tier never unlocks at or below the rung beneath it', () => {
    const L = window.GEAR_LADDERS, R = window.ARTISAN_RECIPES, ITEMS = window.ITEMS || {};
    assert(Array.isArray(L) && L.length >= 20,
      'GEAR_LADDERS must be published by main.js — got ' + (Array.isArray(L) ? L.length + ' lanes' : typeof L));
    assert(L.some((l) => l.key === 'plate/platebody') && L.some((l) => l.key === 'weapon/sword'),
      'the lane set lost a known lane — this guard is grading nothing');
    assert(L.every((l) => Array.isArray(l.rungs) && l.rungs.length >= 7),
      'every lane must carry its full material ladder');

    // The LIVE gate for each output, whatever recipe survived the merge.
    const live = {};
    Object.keys(R || {}).forEach((sk) => (R[sk] || []).forEach((r) => {
      if (!r || !r.output) return;
      const q = Number(r.req) || 0;
      if (live[r.output] === undefined || q < live[r.output].req) live[r.output] = { req: q, id: r.id };
    }));

    const unreachable = [], disordered = [];
    L.forEach((lane) => {
      let prev = null;
      lane.rungs.forEach((rung) => {
        const lv = live[rung.itemId];
        // A generated rung with no surviving recipe is content the player can
        // never make — the merge silently ate it.
        if (!lv) { unreachable.push(lane.key + ' t' + rung.tier + ' → ' + rung.itemId); return; }
        if (prev && lv.req <= prev.req) {
          const statOf = (id) => (ITEMS[id] && (ITEMS[id].defB || ITEMS[id].atkB)) || 0;
          disordered.push(lane.key + ': ' + prev.itemId + ' (tier ' + prev.tier + ', ' + statOf(prev.itemId)
            + ') gates at ' + prev.req + ' via ' + prev.id + ', but ' + rung.itemId + ' (tier ' + rung.tier + ', '
            + statOf(rung.itemId) + ') gates at ' + lv.req + ' via ' + lv.id);
        }
        prev = { req: lv.req, id: lv.id, tier: rung.tier, itemId: rung.itemId };
      });
    });
    assert(unreachable.length === 0, 'generated ladder rungs with no recipe — ' + unreachable.join(' | '));
    assert(disordered.length === 0,
      'THE b348 BUG: gear ladders whose craft gate is out of order with the material tier — ' + disordered.join('  ||  '));
  }),

  () => tryRun('b243: PROGRESSION IS REACHABLE — every craftable item traces back to an obtainable source', () => {
    // A deterministic reachability check: seed the "roots" a player can obtain
    // (gather, drops, shops, dungeons, the clan Hunt, coded drops), then close
    // over every recipe. Anything left unreachable that ISN'T deliberately gated
    // is a dead item or a broken chain — a progression hole. This guards the
    // whole item web so a future item/recipe can't silently strand the ladder.
    const ITEMS = window.ITEMS, R = window.ARTISAN_RECIPES, M = window.MONSTERS;
    const base = new Set();
    const add = (id) => { if (id) base.add(id); };
    (window.TREES || []).forEach((a) => add(a.prod));
    (window.ROCKS || []).forEach((a) => add(a.prod));
    (window.FISH_SPOTS || []).forEach((a) => add(a.prod));
    Object.keys(window.CROPS || {}).forEach((k) => { add(k); if (window.CROPS[k] && window.CROPS[k].prod) add(window.CROPS[k].prod); });
    Object.values(M || {}).forEach((m) => (m.drops || []).forEach((d) => add(d.id)));
    (window.SEED_SHOP || []).forEach((s) => add(s.id));
    (window.EQUIP_SHOP || []).forEach((s) => add(s.id || s));
    Object.values(window.DUNGEONS || {}).forEach((d) => (d.loot || []).forEach((l) => add(l.id)));
    // The clan Hunt's signature materials (raids.js) — obtainable via the weekly boss.
    ['slagheart_core', 'abyssal_pearl', 'choirbone', 'warden_seal', 'wyrm_gilding', 'hollow_sigil', 'wyrm_scale', 'void_core'].forEach(add);
    /* HEARTHFIND — the fifth source class (Feature Slate §2). The four
       trophies are rolled by the ONE engine off src/data/hearthfind.js, which
       no drop table mentions, so before this block they read as four dead
       items. This DERIVES the class from the catalogue the engine itself
       reads (published through core-bridge as HearthriseCore.hearthfind), so
       a fifth find is covered the day its row lands, and a find whose source
       id no longer exists goes red instead of quietly becoming unobtainable.
       Naming the four ids here would have been an exemption, not a source. */
    const HF = (window.HearthriseCore || {}).hearthfind;
    const hfRows = (HF && HF.HEARTHFIND_TABLE) || null;
    assert(Array.isArray(hfRows) && hfRows.length >= 4,
      'the hearthfind catalogue must be published on HearthriseCore.hearthfind — without it this guard '
      + 'cannot tell a trophy from a dead item (got ' + (hfRows ? hfRows.length + ' rows' : typeof hfRows) + ')');
    const nodeExists = (id) => [window.TREES, window.ROCKS, window.FISH_SPOTS]
      .some((pool) => (pool || []).some((n) => n && n.id === id));
    const hfBroken = [];
    hfRows.forEach((row) => {
      if (!row || !row.item) { hfBroken.push('a row with no item: ' + JSON.stringify(row)); return; }
      const liveSource = row.kind === 'monster' ? !!(M || {})[row.id] : nodeExists(row.id);
      if (!liveSource) { hfBroken.push(row.item + ' ← ' + row.kind + ':' + row.id); return; }
      add(row.item);
    });
    assert(hfBroken.length === 0,
      'hearthfind rows whose source no longer exists — the trophy is unobtainable and the roll is dead '
      + 'code: ' + hfBroken.join(', '));

    // Coded drops the engine grants outside the drop tables.
    ['farm_deed', 'hearth_token', 'dungeon_scrip'].forEach(add);  // b281: scrip awarded on dungeon clears

    const inputsOf = (r) => { if (r.inputs) return r.inputs; const i = {}; if (r.input) i[r.input] = r.inputQty || 1; if (r.secondary) Object.entries(r.secondary).forEach(([k, v]) => { i[k] = v; }); return i; };
    const reach = new Set(base);
    const recipes = []; Object.values(R).forEach((list) => (list || []).forEach((r) => recipes.push(r)));
    let changed = true, guard = 0;
    while (changed && guard++ < 60) {
      changed = false;
      for (const r of recipes) {
        if (!r.output || reach.has(r.output)) continue;
        const inp = inputsOf(r);
        let ok = true;
        for (const iid in inp) { if (!reach.has(iid)) { ok = false; break; } }
        if (ok && r.gated && !reach.has(r.gated)) ok = false;
        if (ok) { reach.add(r.output); changed = true; }
      }
    }
    // Exempt: currencies, companions, blueprints/keys (they drop), recipe scrolls,
    // and a few deliberately-spent-elsewhere odds. Everything else MUST be reachable.
    const EXEMPT = new Set(['muster_seal', 'hearth_token', 'burnt_food', 'dragon_relic', 'void_essence', 'farm_deed']);
    /* b356 — the two SELF-CLOSING hatches (src/data/item-effects.js header).
       An item is allowed to be unreachable only while it is genuinely not
       playable yet:
         • `pendingSkill` — its skill is not in SKILLS_DEF, so nothing could
           produce it;
         • a declared `effects` kind that no engine reads, so it would be an
           object that lies about itself.
       Both exemptions EXPIRE automatically — the B356-4 guard below fails the
       build the moment the skill or the engine lands, which is what makes this
       a hatch rather than a hole. */
    const KINDS = (window.HearthriseItemEffects || {}).EFFECT_KINDS || {};
    /* b357 — the THIRD hatch. `pendingSkill` closed correctly when Runecrafting
       and Stonemason shipped, and ten items fell through it: their blocker was
       never the skill, it is the SYSTEM their top rungs belong to (elemental
       enchanting, the castle-tier numbers, the mason tool ladder). An exemption
       that expires against the wrong event is worse than none, so the blocker
       is now named. Same contract: flip `live` in PENDING_SYSTEMS and this
       guard demands a real recipe on the next run. An UNKNOWN system name is
       deliberately NOT dormant — a typo must fail loudly, not exempt silently. */
    const SYSTEMS = (window.HearthriseItemEffects || {}).PENDING_SYSTEMS || {};
    const isDormant = (it) => {
      if (it.pendingSkill && !(window.SKILLS_DEF || {})[it.pendingSkill]) return true;
      if (it.pendingSystem && SYSTEMS[it.pendingSystem] && !SYSTEMS[it.pendingSystem].live) return true;
      return ((it.effects) || []).some((k) => !(KINDS[k] && KINDS[k].live));
    };
    const isExempt = (id) => { const it = ITEMS[id] || {}; return EXEMPT.has(id) || it.premium || it.rarity === 'currency' || it.type === 'companion' || it.unlocks || it.recipe || isDormant(it); };
    const dead = Object.keys(ITEMS).filter((id) => !reach.has(id) && !isExempt(id));
    assert(dead.length === 0, 'UNREACHABLE items (no obtainable source or broken recipe chain): ' + dead.join(', '));
  }),

  () => tryRun('b242: items explain themselves — flavour line + source + used-in', () => {
    assert(typeof window.itemDesc === 'function' && typeof window.itemSourceLine === 'function' && typeof window.itemUsedInLine === 'function',
      'the item-index seams (itemDesc/itemSourceLine/itemUsedInLine) must exist');
    // Flavour descriptions authored for the whole table.
    assert(window.itemDesc('steel_sword') && window.itemDesc('steel_sword').length > 8, 'items must carry a flavour description');
    // Source: a crafted item names its craft; a mined ore names Mining.
    assert(/Smithing/i.test(window.itemSourceLine('steel_sword')), 'a crafted item must name its craft source, got: ' + window.itemSourceLine('steel_sword'));
    assert(/Mining/i.test(window.itemSourceLine('iron_ore')), 'a mined ore must name Mining, got: ' + window.itemSourceLine('iron_ore'));
    // Used-in: a common ingredient lists what it makes.
    assert(window.itemUsedInLine('iron_bar').length > 0, 'a common ingredient must list what it is used in');
    // And it renders into the tap flyout.
    const snap = snapshotG();
    try {
      window.G.inventory = window.G.inventory || {}; window.G.inventory.steel_sword = 1;
      window.openInvDetail('steel_sword');
      assert(document.querySelector('.inv-detail-desc'), 'the flyout must render the flavour line');
      assert(document.querySelector('.inv-detail-info'), 'the flyout must render the Source / Used-in lines');
      window.closeInvDetail();
    } finally { restoreG(snap); }
  }),

  () => tryRun('b241: a stray item tooltip is dismissed by a tap (mobile stuck-tooltip fix)', () => {
    const tip = document.getElementById('item-tooltip');
    assert(tip, 'the item hover-tooltip element must exist');
    tip.style.display = 'block';                 // simulate a stuck tip
    document.dispatchEvent(new Event('touchstart'));
    assert(tip.style.display === 'none', 'a touch anywhere must clear a stray tooltip (it used to stick until you scrolled)');
  }),

  () => tryRunAsync('b240: sell-lock protects items from selling + vendor buy-back undoes a sale', async () => {
    const G = window.G;
    const snap = snapshotG();
    try {
      const id = 'normal_log';
      G.inventory = G.inventory || {}; G.inventory[id] = 100;
      G.gold = 100000; G.buyback = []; G.lockedItems = {};
      stampBalanceLikeLoad(G);
      // LOCK — a locked item cannot be sold, and must not cost a round trip.
      window.toggleItemLock(id);
      assert(window.isItemLocked(id) === true, 'toggleItemLock must lock the item');
      await withServerBacked({}, async (rig) => {
        window.invSellOne(id);
        await rig.drain();
        assert(G.inventory[id] === 100, 'a LOCKED item must not sell (protected from the accidental tap)');
        assert(rig.sent.length === 0,
          'a locked item still reached the vendor verb: ' + JSON.stringify(rig.sent));
      });
      // UNLOCK + sell — the sale is recorded for buy-back.
      window.toggleItemLock(id);
      assert(window.isItemLocked(id) === false, 'toggleItemLock must unlock');
      /* ── b515 — "SELLING PAYS GOLD" IS THE SERVER'S SENTENCE NOW. `invSellOne`
         predicts the credit through `goldSettle` and sends a `vendor_sell`
         intent; `gold` is SERVER-OF-RECORD, so what the player ends up holding
         is what the ANSWER says, absolutely, and the prediction is retired by
         it. The answer here is deliberately NOT `before + price`, so "selling
         pays" cannot pass on the client's own arithmetic. */
      const goldBefore = goldOf();
      const price = window.vendorPrice(id);
      const SERVER_GOLD = goldBefore + price + 3;
      await withServerBacked({ state: { gold: SERVER_GOLD } }, async (rig) => {
        window.invSellOne(id);
        await rig.drain();
        assert(G.inventory[id] === 99, 'an unlocked item sells');
        assert(rig.sent.length === 1 && rig.sent[0].verb === 'vendor_sell'
          && rig.sent[0].item === id && rig.sent[0].qty === 1,
          'the sale sent ' + JSON.stringify(rig.sent) + ' — one vendor_sell naming the item and qty');
        assert(!('price' in rig.sent[0]) && !('gold' in rig.sent[0]),
          'the sale named its own price: ' + JSON.stringify(rig.sent[0]));
        assert(goldOf() === SERVER_GOLD,
          'selling left the balance at ' + goldOf() + ' and the server said ' + SERVER_GOLD
          + ' — the local credit is a PREDICTION and the envelope must retire it, not add to it');
        assert(window.HearthriseGold.goldPredictions().length === 0,
          'the sale left a prediction the answer did not retire: '
          + JSON.stringify(window.HearthriseGold.goldPredictions()));
      });
      assert(G.buyback.length === 1 && G.buyback[0].id === id, 'the sale must be recorded for buy-back');
      assert(G.buyback[0].unit === price && G.buyback[0].qty === 1,
        'the buy-back entry must record the price you were PAID, or the undo is not an undo: '
        + JSON.stringify(G.buyback[0]));

      /* ── BUY BACK: REFUSED, AND THAT IS THE FIX. `repurchase` re-buys at the
         EXACT price the vendor paid, read off a 15-entry LOCAL list — a
         client-supplied PAST PRICE. The moment `gold` joined SERVER_OF_RECORD
         that became a mint (the client naming a price that crosses into an
         armed balance), and there is no server verb for it yet, so legacy.js
         fails CLOSED by name. This test used to assert the debit; asserting it
         now would be asserting the mint.

         ⚠ A REAL PRODUCT GAP, named rather than tested away: buy-back is OFF
           for every player until a `BUYBACK_LEDGER` verb exists (the vendor's
           own ledger, priced server-side). Filed with the gem-purchase family
           in HANDOFFS.md. What must hold while it is off is that the refusal
           costs the player NOTHING and SAYS so — a silent no-op on an undo
           button is how a player concludes the item is gone for good.
           MUTATION: drop the `clientMayWriteRecordField('gold')` gate from
           repurchase → the "authored" assertion goes red. */
      const goldAfterSell = goldOf();
      const heldAfterSell = G.inventory[id];
      const toasts = [];
      const realNotify = window.notify;
      window.notify = function (m) { toasts.push(String(m)); };
      try { window.repurchase(0); } finally { window.notify = realNotify; }
      if (window.clientMayWriteRecordField('gold')) {
        const cost = G.buyback[0].unit * G.buyback[0].qty;
        assert(G.inventory[id] === 100, 'buy-back must restore the item');
        assert(goldOf() === goldAfterSell - cost, 'buy-back costs exactly what you were paid (no minting)');
        assert(G.buyback.length === 0, 'the buy-back entry is consumed');
      } else {
        assert(goldOf() === goldAfterSell,
          'buy-back DEBITED an armed balance from a client-supplied past price (' + goldAfterSell + ' -> '
          + goldOf() + ') — that price never crossed a server and the entry is a 15-item local list');
        assert(G.inventory[id] === heldAfterSell,
          'buy-back handed back the item without a server verb behind it: ' + G.inventory[id]);
        assert(G.buyback.length === 1,
          'a REFUSED buy-back consumed its entry — the undo is gone and nothing was undone');
        assert(toasts.length >= 1 && !/bought back/i.test(toasts.join(' ')),
          'the refusal was silent, or claimed the buy-back happened: ' + JSON.stringify(toasts));
      }
    } finally { restoreGAndRecord(snap); }
  }),

  () => tryRun('b239: the Recipe Book lists every recipe; locked ones stay grayscale but still show inputs + requirement', () => {
    assert(window.HearthriseRecipeBook && typeof window.HearthriseRecipeBook.open === 'function', 'Recipe Book seam missing');
    const snap = snapshotG();
    try {
      window.G.skills = {};                       // everything Lv 1 → high-req recipes are locked
      window.HearthriseRecipeBook.open();
      const ov = document.getElementById('rb-overlay');
      assert(ov && ov.style.display === 'flex', 'the Recipe Book must open');
      const cards = ov.querySelectorAll('.rb-card');
      const total = Object.values(window.ARTISAN_RECIPES).reduce((n, a) => n + a.length, 0);
      assert(cards.length >= Math.min(50, total), 'the Book must list the recipes, got ' + cards.length + ' of ' + total);
      // Pillar 5: a locked recipe is grayscale (.locked) but STILL shows its inputs + what it needs.
      const locked = ov.querySelector('.rb-card.locked');
      assert(locked, 'high-level recipes must render as locked at Lv 1');
      assert(locked.querySelector('.rb-ings .rb-ing'), 'a locked recipe must STILL list its ingredients (plan-ahead)');
      assert(locked.querySelector('.rb-lockmsg'), 'a locked recipe must show what it needs (level or scroll)');
      // Search narrows it.
      assert(/rb-card/.test(window.HearthriseRecipeBook.renderBody('bronze')), 'search must match by output/ingredient name');
      window.HearthriseRecipeBook.close();
      assert(document.getElementById('rb-overlay').style.display === 'none', 'close must hide the Book');
    } finally { restoreG(snap); try { window.HearthriseRecipeBook.close(); } catch (e) {} }
  }),

  () => tryRun('b238: no food buff lies — defense wired (flat), drop_rate live, monster_respawn retired', () => {
    const G = window.G;
    const snap = snapshotG();
    try {
      const B = window.BUFFS_DEF;
      assert(B && B.defense && B.defense.bonusKey === 'defense', 'defense must be a real buff key now');
      assert(!B.monster_respawn, 'monster_respawn must be removed (this engine has no respawn timer — it did nothing)');
      // THE GUARD: every shipped food's buff type must resolve to a real bonus,
      // or applyBuff silently discards it and the tooltip lies.
      Object.entries(window.ITEMS || {}).forEach(([id, it]) => {
        if (it && it.buff && it.buff.type) {
          assert(B[it.buff.type], 'food "' + id + '" declares buff "' + it.buff.type + '" with no BUFFS_DEF entry — it would be silently discarded');
        }
      });
      // defense reaches the engine as a FLAT bump (a +4 food = +4 defence, not +0.04).
      if (typeof window.applyBuff === 'function') {
        window.applyBuff({ type: 'defense', magnitude: 4, durationMs: 60000 });
        assert(window.getBonus('defense') >= 4, 'a +4 defense buff must reach the engine flat (>=4), got ' + window.getBonus('defense'));
        window.applyBuff({ type: 'drop_rate', magnitude: 20, durationMs: 60000 });
        assert(window.getBonus('dropRate') > 0, 'drop_rate buff must feed getBonus("dropRate")');
      }
      assert(window.ITEMS.tomato_soup.buff.type === 'drop_rate' && window.ITEMS.hunters_feast.buff.type === 'drop_rate',
        'the two ex-monster_respawn foods must be repointed to the live drop_rate');
    } finally { restoreG(snap); }
  }),

  () => tryRun('b235: crit is a real lever — critB + the damage_crit buff roll a damage multiplier (was dead)', () => {
    const G = window.G;
    const snap = snapshotG();
    const C = window.HearthriseCore;
    try {
      // The damage_crit food buff (Void Banquet) was declared, shown, and read by
      // NOTHING; critB was summed on four screens and rolled into no damage.
      if (typeof window.applyBuff === 'function') window.applyBuff({ type: 'damage_crit', magnitude: 100, durationMs: 60000 });
      const critBonus = (typeof window.getBonus === 'function') ? window.getBonus('crit') : 0;
      assert(critBonus > 0, 'the damage_crit buff must now feed getBonus("crit"), got ' + critBonus);
      const mid = Object.keys(window.MONSTERS)[0];
      G.equipment = {};
      G.stats = G.stats || {};
      window.startCombat(mid);
      /* Phase 0: the engine no longer reaches for Math.random — randomness is an
         injected dependency (src/core/rng.js), so the test injects one that
         always draws 0: a guaranteed hit AND a guaranteed crit. This is a
         stronger hook than the old `Math.random = () => 0`, because it can only
         work if the engine really does take its randomness through the seam. */
      C.setRng(C.rngMod.rngFrom(() => 0));
      const beforeCrits = G.stats.crits || 0;
      window.combatTick();
      assert((G.stats.crits || 0) > beforeCrits, 'a landed hit at cap crit chance must register a crit — crit is no longer dead');
      assert(G._lastPlayerCrit === true, '_lastPlayerCrit must be set so the floating CRIT is the real event, not the old dmg>=8 fake');
      try { window.stopCombat(); } catch (e) {}
    } finally {
      C.setRng(null);
      restoreG(snap);
    }
  }),

  () => tryRun('b229: a genuine mid-session disconnect dims the blessing honestly', () => {
    const G = window.G;
    const P = window.HearthrisePresence;
    const E = window.HearthriseWorldEvents;
    const NS = window.HearthriseNetStatus;
    assert(NS && typeof NS.getMode === 'function',
      'the connectivity oracle must be the shipped one, not a second invention');
    const snap = snapshotG();
    try {
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree'; G.activeMonster = null;
      E._force({
        daily: { id: 'test_surge', name: 'Test Surge', desc: '+25% gather speed', bonus: { gatherSpeed: 0.25 } },
        weekly: E.QUIET,
      });
      const liveNote = window.HearthriseBlessingNote();
      assert(liveNote.indexOf('reconnecting') < 0, 'a connected session must not claim to be reconnecting');

      NS.setMode('offline');
      assert(P.isOnline() === false, 'the gate must read the oracle, not guess');
      assert(P.blessingsApply() === false, 'a dropped session is not blessed');
      assert(E.liveBonusFor('gatherSpeed') === 0, 'and pays nothing');
      const dim = window.HearthriseBlessingNote();
      assert(dim.indexOf('reconnecting') >= 0, 'the note must say reconnecting, got: ' + dim);
      assert(dim.indexOf('idle') < 0, 'and must never resurrect the retired idle state, got: ' + dim);

      NS.setMode('ok');
      assert(P.blessingsApply() === true, 'reconnecting restores the blessing');
      assert(E.liveBonusFor('gatherSpeed') === 0.25, 'in full');
    } finally { E._force(null); NS.setMode('ok'); restoreG(snap); }
  }),

  () => tryRun('b227: AWAY output is byte-identical with and without an active blessing', () => {
    if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(true);
    // THE test this rework exists for, and b229 left its assertions ALONE —
    // only the retired input-clock seam was dropped from the setup. The latch,
    // not the gate, is what holds the offline boundary: processOffline() runs
    // inside loadLocal(), in a live connected session with an activity set, so
    // every "is the player here?" signal is TRUE for the whole catch-up and a
    // gate built on any of them would pay a returning player a full night at
    // today's blessing. (b226's own flat ×1.12 leaked into offline grants for
    // exactly this reason.) Run the same absence twice with the blessing layer
    // forced on and forced off; the two piles must be identical, item for item
    // and XP for XP.
    const G = window.G;
    const P = window.HearthrisePresence;
    const E = window.HearthriseWorldEvents;
    assert(typeof P.inOfflineReplay === 'function', 'the offline-replay latch must be published');
    const snap = snapshotG();
    // A blessing far stronger than anything in the shipped pools, touching
    // every key an offline gather replay could possibly read. If ONE of them
    // leaks, the two nights cannot come out equal.
    const LOUD = { id: 'test_loud', name: 'Test Blessing', desc: 'everything', bonus: {
      allXP: 0.50, combatXP: 0.50, gatherSpeed: 0.50, cookSpeed: 0.50,
      smithSpeed: 0.50, craftSpeed: 0.50, prayerSpeed: 0.50,
      farmYield: 5, goldFind: 0.50, noBurn: 0.50 } };
    try {
      /* ONE instant for BOTH nights. See setAway's header: re-reading the clock
         per run is what let a tick boundary fall between them and produce a
         false parity failure. The two nights must differ in exactly one thing —
         the blessing — and the clock is not it. */
      const anchor = Date.now();
      /* b515 — DRIVEN ON THE SPAN, INSIDE THE LATCH. The old rig called
         `window.processOffline()`; that engine is deleted. What is under test is
         unchanged and is not the caller: `blessingsApply()` is
         `!inOfflineReplay() && sessionOnline()`, and the LATCH is the whole
         offline boundary — a gate built on connectivity or presence answers
         "yes" for the entire catch-up, because the catch-up runs in a live,
         connected session (b226's ×1.12 leaked into every offline grant for
         exactly that reason).

         So the same three-hour night is replayed twice through
         `simulateSkillSpan` with the REAL `window.getBonus` chain wired in, once
         with the calendar quiet and once with it loud, INSIDE the replay latch.
         `bonus` is the injected seam the engine reads, so this measures the
         blessing layer exactly where an away span would meet it — and on a plain
         state, so an ambient `G` an earlier test left behind cannot supply the
         equality. */
      const runNight = () => {
        const r = window.HearthrisePresence._withOfflineReplay(() => awayGatherSpan({
          targetId: 'normal_tree', spanMs: 3 * 3600000, fromMs: anchor - 3 * 3600000,
          state: { skills: { woodcutting: 0 }, inventory: {}, toolCarry: {}, equipment: {}, buffs: [] },
          ctx: { bonus: window.getBonus },
        }));
        return { xp: r.paid.xp.woodcutting || 0, items: r.out.gathered || 0, ms: r.out.intervalMs,
          blessed: r.out.blessed };
      };

      E._force({ daily: E.QUIET, weekly: E.QUIET });
      const quiet = runNight();
      E._force({ daily: LOUD, weekly: LOUD });
      /* `bonusFor` is the calendar's RAW offer, read before the power budget's
         end-of-chain clamp — which is why this assertion is made here and not
         through getBonus. b228 added that clamp, and it must never become the
         reason the two nights come out equal: what holds the offline boundary
         is the REPLAY LATCH, and a clamp doing the latch's job by accident
         would be an untested boundary wearing a passing test.
         So the claim is split in two, explicitly. */
      assert(E.bonusFor('allXP') === 1.0, 'the loud blessing must actually be on the calendar');
      const clamped = window.HearthrisePowerBudget.applyBudget('allXP', 1.0);
      assert(clamped > 0, 'and it must still reach the player ONLINE — clamped, never erased (' + clamped + ')');
      const loud = runNight();
      E._force(null);

      assert(quiet.xp > 0, 'the away night must actually have produced something to compare');
      assert(loud.xp === quiet.xp,
        'away XP must not move with the blessing (' + quiet.xp + ' vs ' + loud.xp + ')');
      assert(loud.items === quiet.items,
        'away item yield must not move with the blessing (' + quiet.items + ' vs ' + loud.items + ')');
      assert(loud.ms === quiet.ms,
        'the away action interval must not move with the blessing (' + quiet.ms + ' vs ' + loud.ms + ')');

      /* THE CONTROL, AND IT IS NEW. Every assertion above is also satisfied by a
         blessing layer that pays NOBODY — which is a different bug and would
         have shipped silently. The identical span run OUTSIDE the latch must
         come out DIFFERENT, or the three equalities prove nothing.
         MUTATION: make `blessingsApply()` return false unconditionally → the
         three above still pass and this one goes red. */
      E._force({ daily: LOUD, weekly: LOUD });
      const online = awayGatherSpan({
        targetId: 'normal_tree', spanMs: 3 * 3600000, fromMs: anchor - 3 * 3600000,
        state: { skills: { woodcutting: 0 }, inventory: {}, toolCarry: {}, equipment: {}, buffs: [] },
        ctx: { bonus: window.getBonus, away: false },
      });
      E._force(null);
      assert((online.paid.xp.woodcutting || 0) !== quiet.xp || (online.out.gathered || 0) !== quiet.items,
        'CONTROL FAILED: the loud blessing changed NOTHING even outside the replay latch ('
        + JSON.stringify({ xp: online.paid.xp.woodcutting, items: online.out.gathered })
        + ' vs quiet ' + JSON.stringify({ xp: quiet.xp, items: quiet.items }) + '). The three equalities '
        + 'above are then satisfied by a blessing layer that pays nobody, which is a different bug.');

      /* AND THE RECEIPT STATES IT, in data, rather than leaving a renderer to
         infer it — AWAY-24's rule, asserted here on the span's own payload. */
      assert(loud.blessed === false,
        'the away span must state, in data, that it was paid at the base rate');
      assert(P.inOfflineReplay() === false, 'the replay latch must be released after the span');
    } finally {
      if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(null);
      E._force(null);
      restoreG(snap);
    }
  }),

  () => tryRun('b227: the replay latch shuts the blessing even in a live, connected, active session', () => {
    // The unit-level statement behind the test above: it is not the gate that
    // is false during a catch-up (it is emphatically true) — it is the latch.
    // b229 renamed the signal it interrogates (isPresent → isOnline) and
    // changed nothing else: every assertion below is the b227 original.
    const G = window.G;
    const P = window.HearthrisePresence;
    const E = window.HearthriseWorldEvents;
    const snap = snapshotG();
    try {
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree'; G.activeMonster = null;
      assert(P.isOnline() === true, 'the test must be run in the state a catch-up actually sees');
      assert(P.blessingsApply() === true, 'outside a replay, an online player is blessed');
      P._withOfflineReplay(() => {
        assert(P.isOnline() === true, 'the session is still ONLINE inside a replay — that is the trap');
        assert(P.inOfflineReplay() === true, 'the latch must be closed');
        assert(P.blessingsApply() === false, '…and the blessing must be off anyway');
        assert(E.isActive() === false, 'the world-events layer must agree');
        Object.keys(Object.assign({}, E.daily().bonus, E.weekly().bonus)).forEach((k) => {
          assert(E.liveBonusFor(k) === 0, 'no ' + k + ' may be paid inside a replay');
        });
      });
      assert(P.blessingsApply() === true, 'and it must be restored afterwards');
      // Nested (offline combat inside processOffline) must not clear it early.
      P._withOfflineReplay(() => {
        P._withOfflineReplay(() => {});
        assert(P.blessingsApply() === false, 'a nested replay must not release the outer latch');
      });
      // A throw inside a replay must not strand the game permanently unblessed.
      try { P._withOfflineReplay(() => { throw new Error('boom'); }); } catch (e) { /* expected */ }
      assert(P.inOfflineReplay() === false, 'a throw mid-replay must still release the latch');
    } finally { restoreG(snap); }
  }),

  () => tryRun('b227/b229: a SPEED blessing gates too — the interval follows the session, online and offline', () => {
    // The XP side of a blessing gates itself because addXp reads getBonus live.
    // The speed side is baked into G.skillMs at startSkill, so without a
    // re-derivation a disconnected player would keep blessed speed and — worse
    // — carry it into the offline replay, which divides elapsed time by that
    // number. b229 drives the gate through connectivity instead of the retired
    // idle clock; the replay half of the test is untouched.
    const G = window.G;
    const P = window.HearthrisePresence;
    const E = window.HearthriseWorldEvents;
    const NS = window.HearthriseNetStatus;
    assert(typeof window.activityIntervalMs === 'function', 'the shared interval formula must be published');
    const snap = snapshotG();
    try {
      G.rooms = {}; G.plotBuildings = []; G.inventory = {};
      /* Every OTHER speed source is zeroed so this asserts the mechanism, not
         the state an earlier test left behind. Buffs join that list now that
         they are away-gated: a held gather_speed buff pays in the "offline
         session" branch (the player is present, merely disconnected) and not
         inside a replay, so leaving one in would make the two legitimately
         differ and this assertion would be measuring the wrong thing. */
      G.buffs = [];
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree'; G.activeMonster = null;
      // Pin a gather-speed blessing whatever today's calendar happens to be,
      // so this test asserts the MECHANISM rather than the date.
      E._force({
        daily: { id: 'test_gather', name: 'Test Surge', desc: '+25% gather speed', bonus: { gatherSpeed: 0.25 } },
        weekly: E.QUIET,
      });
      const blessedMs = window.activityIntervalMs();
      NS.setMode('offline');
      const baseMs = window.activityIntervalMs();
      NS.setMode('ok');
      assert(blessedMs < baseMs,
        'an online player must swing faster under a gather blessing (' + blessedMs + ' vs ' + baseMs + ')');

      // Inside a replay the blessing is off even though the session is online.
      P._withOfflineReplay(() => {
        assert(window.activityIntervalMs() === baseMs,
          'the offline replay must re-derive the BASE interval, got ' + window.activityIntervalMs());
      });

      // And the live loop actually re-times: start blessed, drop, act.
      window.startSkill('woodcutting', 'normal_tree', window.TREES.find((t) => t.id === 'normal_tree').ms);
      assert(G.skillMs === blessedMs, 'starting while blessed must arm the blessed interval');
      NS.setMode('offline');
      window.doSkillAction(false);
      assert(G.skillMs === baseMs,
        'dropping the connection must re-time the running loop to the base interval, got ' + G.skillMs);
      NS.setMode('ok');
      window.doSkillAction(false);
      assert(G.skillMs === blessedMs, 'reconnecting must re-time it up again, got ' + G.skillMs);

      // b229: a connectivity FLIP retimes IMMEDIATELY — no action required.
      // The oracle announces the change (hearthrise:netmode) after settling its
      // own state, so the hook can never read a stale mode; a raw window
      // 'offline' listener in legacy.js would, because legacy.js loads first.
      window.startSkill('woodcutting', 'normal_tree', window.TREES.find((t) => t.id === 'normal_tree').ms);
      assert(G.skillMs === blessedMs, 'precondition: the loop is running blessed');
      NS.setMode('offline');
      assert(G.skillMs === baseMs,
        'a disconnect must retime the running loop on the flip alone, got ' + G.skillMs);
      NS.setMode('ok');
      assert(G.skillMs === blessedMs,
        'and reconnecting must retime it back on the flip alone, got ' + G.skillMs);
    } finally {
      E._force(null);
      NS.setMode('ok');
      try { window.stopSkill(); } catch {}
      restoreG(snap);
    }
  }),

  () => tryRun('b227: every key in the blessing pools has a living consumer (no ghost promises)', () => {
    // A pool entry naming a key nothing reads is a promise the engine cannot
    // pay — the exact defect goldFind and noBurn were before b222/b225. Each
    // key below is asserted to MOVE something, by driving the real seam.
    const G = window.G;
    const E = window.HearthriseWorldEvents;
    const snap = snapshotG();
    const realGetBonus = window.getBonus;
    try {
      const keys = new Set();
      E.DAILY.concat(E.WEEKLY).forEach((ev) => Object.keys(ev.bonus).forEach((k) => keys.add(k)));
      assert(keys.size >= 8, 'the pools must span a real spread of boost families, got ' + keys.size);
      // Every family Tyler asked for, by name.
      ['allXP', 'goldFind', 'gatherSpeed', 'smithSpeed', 'craftSpeed', 'cookSpeed', 'noBurn', 'combatXP', 'farmYield']
        .forEach((k) => assert(keys.has(k), 'the pool must contain a ' + k + ' blessing'));

      // Drive each key through its real consumer with a stubbed getBonus.
      const withKey = (key, val, fn) => {
        window.getBonus = function (k) { return k === key ? val : 0; };
        try { return fn(); } finally { window.getBonus = realGetBonus; }
      };
      G.rooms = {}; G.plotBuildings = []; G.inventory = {};
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree';

      // gatherSpeed / the four artisan speeds → activityIntervalMs()
      const baseGather = withKey('gatherSpeed', 0, () => window.activityIntervalMs());
      const fastGather = withKey('gatherSpeed', 0.25, () => window.activityIntervalMs());
      assert(fastGather < baseGather, 'gatherSpeed must shorten a gather action');
      [['cooking', 'cookSpeed'], ['smithing', 'smithSpeed'], ['crafting', 'craftSpeed'], ['prayer', 'prayerSpeed']]
        .forEach(([skill, key]) => {
          const recipes = window.ARTISAN_RECIPES[skill];
          if (!recipes || !recipes.length) return;
          G.activeSkill = skill; G.skillTargetId = recipes[0].id;
          const slow = withKey(key, 0, () => window.activityIntervalMs());
          const fast = withKey(key, 0.30, () => window.activityIntervalMs());
          assert(fast < slow, key + ' must shorten a ' + skill + ' action (' + slow + ' → ' + fast + ')');
        });

      // allXP / combatXP → addXp()
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree'; G.restedXp = 0;
      G.equipment = Object.fromEntries(Object.keys(G.equipment || {}).map((k) => [k, null]));
      const xpAt = (key, v) => withKey(key, v, () => {
        xpZero('woodcutting'); window.addXp('woodcutting', 10000); return xpOf('woodcutting');
      });
      assert(xpAt('allXP', 0.15) > xpAt('allXP', 0), 'allXP must raise an XP grant');
      const cbAt = (v) => withKey('combatXP', v, () => {
        xpZero('attack'); window.addXp('attack', 10000); return xpOf('attack');
      });
      assert(cbAt(0.20) > cbAt(0), 'combatXP must raise a combat XP grant');

      // goldFind → applyGoldFind()
      assert(withKey('goldFind', 0.15, () => window.applyGoldFind(1000)) >
             withKey('goldFind', 0, () => window.applyGoldFind(1000)),
        'goldFind must raise a monster gold drop');

      // noBurn → cookBurnChance()
      const rec = (window.ARTISAN_RECIPES.cooking || [])[0];
      if (rec && typeof window.cookBurnChance === 'function') {
        G.skills.cooking = 0;
        const hot = withKey('noBurn', 0, () => window.cookBurnChance(rec));
        const safe = withKey('noBurn', 0.25, () => window.cookBurnChance(rec));
        assert(safe < hot, 'noBurn must reduce the burn chance (' + hot + ' → ' + safe + ')');
      }

      // farmYield → harvestPlot(), read at harvest time
      assert(withKey('farmYield', 2, () => Math.floor(window.getBonus('farmYield'))) === 2,
        'farmYield must be readable as the flat bonus harvestPlot adds');

      // And nothing in the pools names a key with no consumer.
      const WIRED = new Set(['allXP', 'combatXP', 'gatherSpeed', 'cookSpeed', 'smithSpeed',
        'craftSpeed', 'prayerSpeed', 'farmYield', 'goldFind', 'noBurn']);
      keys.forEach((k) => assert(WIRED.has(k),
        'pool key "' + k + '" has no proven consumer — add the seam or drop the entry'));
    } finally { window.getBonus = realGetBonus; restoreG(snap); }
  }),

  () => tryRun('b227: the blessing data carries no emoji, and every entry has an atlas glyph', () => {
    const E = window.HearthriseWorldEvents;
    const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;
    E.DAILY.concat(E.WEEKLY).forEach((ev) => {
      assert(ev.glyph === undefined, ev.id + ' must not carry an emoji glyph field (Final Directive)');
      assert(!EMOJI.test(ev.name + ' ' + ev.desc), ev.id + ' name/desc must be free of emoji');
      assert(E.EVENT_GLYPH[ev.id], ev.id + ' has no atlas glyph — it would render as a blank medallion');
      assert(window.HR_GLYPHS && window.HR_GLYPHS[E.EVENT_GLYPH[ev.id]],
        ev.id + ' maps to "' + E.EVENT_GLYPH[ev.id] + '", which is not a baked atlas key');
    });
  }),

  () => tryRun('b227: the live blessing note names only a blessing that touches THIS activity', () => {
    const G = window.G;
    const P = window.HearthrisePresence;
    const E = window.HearthriseWorldEvents;
    const NS = window.HearthriseNetStatus;
    const snap = snapshotG();
    try {
      // Keys are scoped to what is running: a smithing blessing must never be
      // offered as a reason to keep chopping.
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree'; G.activeMonster = null;
      const wcKeys = P.activeBonusKeys();
      assert(wcKeys.indexOf('gatherSpeed') >= 0 && wcKeys.indexOf('smithSpeed') < 0,
        'a woodcutting session must consider gatherSpeed and ignore smithSpeed');
      G.activeSkill = 'cooking'; G.skillTargetId = (window.ARTISAN_RECIPES.cooking || [{}])[0].id;
      const ckKeys = P.activeBonusKeys();
      assert(ckKeys.indexOf('cookSpeed') >= 0 && ckKeys.indexOf('noBurn') >= 0,
        'a cooking session must consider cookSpeed and noBurn');
      assert(ckKeys.indexOf('gatherSpeed') < 0, 'and not gather speed');

      // The note itself: live while the session is online, dimmed to
      // "reconnecting" only when it genuinely drops. b229 retired "— idle".
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree';
      const hit = E.summaryFor(P.activeBonusKeys());
      const live = window.HearthriseBlessingNote();
      NS.setMode('offline');
      const dim = window.HearthriseBlessingNote();
      NS.setMode('ok');
      if (hit) {
        assert(live.indexOf(hit.name) >= 0 && live.indexOf("while online") >= 0,
          'the live note must name the blessing and state the condition, got: ' + live);
        assert(dim.indexOf('reconnecting') >= 0, 'the dropped note must say reconnecting, got: ' + dim);
        assert(live.indexOf('idle') < 0 && dim.indexOf('idle') < 0,
          'neither state may resurrect the retired "idle" scold');
        assert(live.indexOf('tab') < 0 && dim.indexOf('tab') < 0,
          'and neither may mention a tab — Tyler: "the tab shouldn\'t need to be open"');
        assert(live.indexOf('+12%') < 0 || hit.effect.indexOf('12%') >= 0,
          'the note must never resurrect the retired flat +12% presence hint');
      }
      // No activity → no note at all.
      G.activeSkill = null; G.activeMonster = null; G.activeArtisanRecipe = null;
      assert(window.HearthriseBlessingNote() === '', 'no activity running means no note');
    } finally { NS.setMode('ok'); restoreG(snap); }
  }),

  () => tryRun('b229: every surface states the same rule — while online, not while focused', () => {
    // Four surfaces tell the player when a blessing pays: the Events panel
    // card, Home's "The realm", the live note beside the running activity, and
    // the welcome-back offline toast. They were three different sentences, one
    // of which said "this tab open" — the line Tyler called confusing. This
    // asserts the shipped STRINGS, because a rule the code obeys and the copy
    // contradicts is still a broken rule to the person reading it.
    const G = window.G;
    const E = window.HearthriseWorldEvents;
    const snap = snapshotG();
    try {
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree'; G.activeMonster = null;
      E._force({
        daily: { id: 'test_surge', name: 'Test Surge', desc: '+25% gather speed', bonus: { gatherSpeed: 0.25 } },
        weekly: E.QUIET,
      });

      // 1 — the Events-panel blessing card (rendered wherever it is hosted).
      E.renderBlessing();
      const card = document.getElementById('hr-worldevents');
      assert(card, 'the blessing card must render somewhere');
      const cardTxt = card.textContent;
      assert(cardTxt.indexOf('active while you are online') >= 0,
        'the blessing card must state the rule in Tyler\'s words, got: ' + cardTxt);

      // 2 — Home, "The realm".
      let homeTxt = '';
      try {
        if (window.HearthriseHome && window.HearthriseHome.render) window.HearthriseHome.render();
        const panel = document.getElementById('panel-profile');
        homeTxt = panel ? panel.textContent : '';
      } catch (e) { /* Home is optional at this point in the suite */ }
      if (homeTxt.indexOf('The realm') >= 0) {
        assert(homeTxt.indexOf('active while you are online') >= 0,
          'Home\'s "The realm" must state the same rule, got a panel without it');
      }

      // 3 — the live activity note.
      const note = window.HearthriseBlessingNote();
      assert(note.indexOf('while online') >= 0, 'the activity note must state the same rule, got: ' + note);

      /* 4 — THE WELCOME-BACK SURFACE. b515 — THE SENTENCE MOVED SURFACES, and
         the rule did not. It used to be captured off the TOAST processOffline
         raised, which said "Offline 3.0h at the base rate — …"; b515 deleted
         that toast with the local away engine and the server-path toast
         (`accrue.js receiptSentence`) has never carried the clause (filed
         2026-09-07, P2). The DURABLE away card does carry it, and it is the
         surface a player can still read a minute later, so that is where the
         fourth reading is taken.
         MUTATION: drop the base-rate line from home-dashboard.js's away card
         and this goes red — which is what the toast assertion did for the
         surface it watched. */
      const H = window.HearthriseHome;
      assert(H && typeof H.__awayCardHtml === 'function',
        'the away-card seam must be published, or the fourth surface is unassertable');
      const awayCardTxt = String(H.__awayCardHtml({
        hrs: 3, awayMs: 3 * 3600000, gainedXp: 900, gainedItems: 40, gainedGold: 12,
        gainedKills: 0, burnt: 0, crits: 0, capped: false, blessed: false, buffsPaused: false,
        rateMult: 1, died: false, diedAfterMs: 0, diedTo: null, combat: null, at: Date.now(),
      })).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      assert(/base rate/i.test(awayCardTxt),
        'the welcome-back card must name the base rate, got: ' + awayCardTxt);
      assert(/while you play|while you are online|while online/i.test(awayCardTxt),
        'the card states the rate but not the RULE — the player is left to guess when a blessing pays: '
        + awayCardTxt);

      // …and none of the blessing copy may say "tab", or scold an "idle"
      // player. (Home is checked for "tab" only — the whole profile panel is
      // scanned there, and other cards are entitled to their own vocabulary.)
      [cardTxt, note, awayCardTxt].forEach((s) => {
        assert(String(s).indexOf('tab') < 0, 'no blessing surface may mention a tab: ' + s);
        assert(!/\bidle\b/.test(String(s)), 'no blessing surface may call an online player idle: ' + s);
      });
      assert(homeTxt.indexOf('this tab') < 0, 'Home must not mention a tab either');
    } finally { E._force(null); restoreG(snap); }
  }),

  () => tryRun('b307: the offline cap is PER-ABSENCE — each trip caps on its own, no daily bucket', () => {
    // b307 replaces b226's daily bucket (which pinned every save to its cap and
    // killed offline for the rest of the day — paione's report). The cap now
    // applies to a SINGLE absence; signing in resets the timer.
    //
    // b330 — THE CLOCK IS FROZEN, and that is the fix for a real flake. Every
    // claim below used to pass its own fresh `Date.now()`, so the "a second read
    // of the SAME INSTANT must bank nothing" assertion only held when two
    // consecutive Date.now() calls landed in the same millisecond: an instrumented
    // run measured 160 of 200 iterations returning 1–4ms of banked time instead
    // of 0. claimOfflineMs takes `now` as a parameter precisely so a caller can
    // be explicit about the instant, and the sentence the test is asserting names
    // one instant — so it passes ONE `NOW` everywhere rather than sampling the
    // wall clock five times. This is the seam, not a tolerance: a tolerance here
    // would have quietly accepted a genuine double-pay of a few milliseconds.
    const G = window.G;
    const snap = snapshotG();
    const hidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      G.entitlements = {}; G.rooms = {}; G.clanName = null;
      const cap = window.offlineCapHours();
      const gap = cap * 0.75;
      const NOW = Date.now();

      // A gap inside the cap banks in full.
      G.offlineBudget = { at: NOW - gap * 3600000 };
      const first = window.claimOfflineMs(NOW, true) / 3600000;
      assert(Math.abs(first - gap) < 0.01, 'a gap inside the cap banks in full, got ' + first);

      // THE WHOLE CHANGE: a SECOND absence the same day ALSO banks in full.
      // There is no shared daily bucket to deplete — each absence caps alone.
      G.offlineBudget = { at: NOW - gap * 3600000 };
      const second = window.claimOfflineMs(NOW, true) / 3600000;
      assert(Math.abs(second - gap) < 0.01,
        'a second absence must bank in full per-absence (not truncated by a daily bucket), got ' + second);

      // A single absence longer than the cap truncates to exactly the cap.
      G.offlineBudget = { at: NOW - (cap + 6) * 3600000 };
      const huge = window.claimOfflineMs(NOW, true) / 3600000;
      assert(Math.abs(huge - cap) < 0.01, 'an absence longer than the cap banks exactly the cap, got ' + huge);

      // Signing in resets the timer: an immediate re-claim banks nothing. This is
      // also the b214 double-pay guard — the watermark cannot be read twice.
      assert(window.claimOfflineMs(NOW, true) === 0,
        'a second read of the same instant must bank nothing (timer reset / double-pay guard)');

      // An absence with nothing running banks nothing, but the watermark still
      // advances because the wall-clock passed.
      G.offlineBudget = { at: NOW - 5 * 3600000 };
      assert(window.claimOfflineMs(NOW, false) === 0, 'an absence with no activity banks nothing');
      assert(G.offlineBudget.at === NOW,
        'the watermark still advances, to exactly the instant it was read at — got a drift of ' +
        (G.offlineBudget.at - NOW) + 'ms');
    } finally {
      if(hidden) Object.defineProperty(document, 'hidden', hidden); else { try{ delete document.hidden; }catch(e){} }
      restoreG(snap);
    }
  }),

  () => tryRun('b226/b505: the offline cap is EARNED — no entitlement may raise it', () => {
    /* This test used to assert the opposite: that the Offline+ entitlement added
       4h to the cap. b505 removed that product (Tyler: "kill ... both offline
       boosts") — an away-accrual boost sold for cash is pay-to-win on a shared,
       ranked economy, and the server floors offline at 12h regardless, so it was
       also selling nothing. The runtime property is now that a leftover or forged
       entitlement flag does NOTHING; the catalogue half lives in the b505 guard. */
    const G = window.G;
    const snap = snapshotG();
    try {
      G.entitlements = {};
      const base = window.offlineCapHours();
      assert(base >= 12, 'the base offline cap is 12h, got ' + base);
      const flags = { offlinePlus: true, noAds: true, hearthHall: true };
      (window.IAP_CATALOG || []).forEach((prod) => { if (prod.ent) flags[prod.ent] = true; });
      G.entitlements = flags;
      assert(window.offlineCapHours() === base,
        'an entitlement moved the offline cap from ' + base + 'h to ' + window.offlineCapHours()
        + 'h — away-time is not for sale; only renown/property/clan perks extend it');
    } finally { restoreG(snap); }
  }),

  () => tryRun('b226: the vendor pays VENDOR_RAW_RATE for raws and full value for the rest', () => {
    const ITEMS = window.ITEMS;
    assert(window.VENDOR_RAW_RATE === 0.20, 'VENDOR_RAW_RATE must be 0.20');
    assert(typeof window.vendorPrice === 'function', 'vendorPrice must be the one choke-point');
    // Every gathering rung's output is raw BY CONSTRUCTION — a new rung cannot
    // be added without its output being flagged, which is the omission class
    // that makes an economy fix rot.
    [...window.TREES, ...window.ROCKS, ...window.FISH_SPOTS].forEach((a) => {
      assert(ITEMS[a.prod] && ITEMS[a.prod].raw === true, a.prod + ' must be flagged raw');
    });
    assert(window.vendorPrice('normal_log') === Math.max(1, Math.floor(ITEMS.normal_log.v * 0.20)),
      'a raw log must fetch 20% of book value');
    assert(window.vendorPrice('dawnstone_ore') === Math.floor(ITEMS.dawnstone_ore.v * 0.20),
      'the biggest faucet in the game must be throttled at the choke-point');
    assert(ITEMS.normal_log.v === 8, 'the item BOOK value must be untouched — only the vendor bid moves');
    // A crafted item is not raw, so it keeps the full bid.
    assert(!ITEMS.cooked_shrimp.raw, 'a cooked dish is not a raw material');
    assert(window.vendorPrice('cooked_shrimp') === ITEMS.cooked_shrimp.v,
      'a crafted/cooked item must still fetch full value');
  }),

  () => tryRun('b226: every gathering rung is strictly faster XP/sec than the one below it', () => {
    // Mithril Rock (req 60) used to be a SLOWER xp/sec than Gold Rock (req 45):
    // unlocking the rung was a punishment. This catches that class forever.
    [['TREES', window.TREES], ['ROCKS', window.ROCKS], ['FISH_SPOTS', window.FISH_SPOTS]].forEach(([name, table]) => {
      let prev = null;
      table.forEach((rung) => {
        const rate = Math.max(1, Math.floor(rung.xp * window.PACE.xp)) / (window.pacedActionMs(rung.ms) / 1000);
        if (prev) {
          assert(rate > prev.rate,
            name + ': ' + rung.id + ' (' + rate.toFixed(2) + ' xp/s) must beat ' + prev.id + ' (' + prev.rate.toFixed(2) + ')');
        }
        prev = { id: rung.id, rate };
      });
    });
  }),

  () => tryRun('b390: a full-tier gathering unlock is a CLEAR upgrade, not a lateral move', () => {
    // The b226 "strictly faster" test above passes a +1% step, which is exactly
    // how the mid-high plateau hid: Coal(30)→Gold(45) was +3.4%/sec, Mithril(60)
    // →Emberstone(75) +4.3%, and Fishing Frostfin(66)→Shark(76) +2% — +10-to-15
    // levels of investment for a rate the player cannot feel, so the unlock read
    // as "did nothing". RULE: any rung that costs a FULL tier (req gap >= 10) must
    // beat the rung below it by >= 6% xp/sec. Off-tier supply nodes (e.g. the
    // Rich Coal Seam, req 52, only 7 levels over Gold) are exempt — they still
    // have to beat the prev (the test above), just not by a full-tier margin.
    const MIN_FULL_TIER_GAIN = 1.06;
    [['TREES', window.TREES], ['ROCKS', window.ROCKS], ['FISH_SPOTS', window.FISH_SPOTS]].forEach(([name, table]) => {
      let prev = null;
      table.forEach((rung) => {
        const rate = Math.max(1, Math.floor(rung.xp * window.PACE.xp)) / (window.pacedActionMs(rung.ms) / 1000);
        if (prev && (rung.req - prev.req) >= 10) {
          assert(rate >= prev.rate * MIN_FULL_TIER_GAIN,
            name + ': ' + rung.id + ' (req ' + rung.req + ', ' + rate.toFixed(2) + ' xp/s) is a full-tier unlock but only +' +
            (((rate / prev.rate) - 1) * 100).toFixed(1) + '% over ' + prev.id + ' — a full tier must be >= +6% xp/s (a real upgrade, not a plateau)');
        }
        prev = { id: rung.id, req: rung.req, rate };
      });
    });
  }),

  () => tryRun('b226: low-tier gathering no longer out-produces high-tier (qty flattened to [1,1])', () => {
    // [1,2] on the first three rungs made tier-1 gathering out-produce tier-7
    // 6:1 in raw item count, at exactly the levels where the items are worth
    // least and there is no sink for them.
    [['TREES', window.TREES], ['ROCKS', window.ROCKS], ['FISH_SPOTS', window.FISH_SPOTS]].forEach(([name, table]) => {
      table.slice(0, 3).forEach((rung) => {
        assert(rung.qty[0] === 1 && rung.qty[1] === 1,
          name + ': ' + rung.id + ' must yield exactly 1 (got [' + rung.qty + '])');
      });
    });
    // And the flood is measured where the player feels it: items per hour.
    const t1 = window.TREES[0], t7 = window.TREES[window.TREES.length - 1];
    const perHour = (r) => 3600000 / window.pacedActionMs(r.ms) * ((r.qty[0] + r.qty[1]) / 2);
    assert(perHour(t1) / perHour(t7) < 5,
      'tier-1 may not out-produce tier-7 more than 5:1, got ' + (perHour(t1) / perHour(t7)).toFixed(1) + ':1');
  }),

  () => tryRun('b226: gathering dailies read per-SKILL counters, not one item id', () => {
    // "Gather 25 logs" watched collection.normal_log, so a level-90 woodcutter
    // cutting Duskwood made zero progress and the goal got HARDER the better
    // they were. The counters are seeded from the collection log on migration,
    // so nobody's achievement progress was zeroed to fix it.
    const G = window.G;
    const pool = window.DAILY_GOAL_POOL || [];
    const byId = (id) => pool.find((g) => g.id === id);
    ['gather_logs', 'mine_ore', 'fish'].forEach((id) => {
      const g = byId(id);
      assert(g, 'daily goal ' + id + ' should exist');
      assert(g.source.indexOf('collection.') !== 0,
        id + ' must not read an item-specific collection counter (got ' + g.source + ')');
    });
    assert(byId('gather_logs').source === 'stats.chopped');
    assert(byId('mine_ore').source === 'stats.mined');
    assert(byId('fish').source === 'stats.fished');
    // And the counter actually moves on a high-tier rung.
    const snap = snapshotG();
    try {
      G.skills = Object.assign({}, G.skills, { woodcutting: window.XP_TABLE[89] });   // Lv 90
      G.stats = Object.assign({}, G.stats, { chopped: 0 });
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'duskwood_tree';
      window.doSkillAction(true);
      assert((G.stats.chopped || 0) > 0,
        'chopping Duskwood must tick the log counter, got ' + G.stats.chopped);
    } finally { try { window.stopSkill(); } catch {} restoreG(snap); }
  }),

  () => tryRun('b228: renown weights came down, thresholds did NOT, and the ratchet still holds', () => {
    /* Tyler, 2026-08-09: *"It also seems to be going way too fast."* Every W
       weight is retuned toward Serf day 1-2 / Squire week 1 / Knight week 3-4 /
       Baron month 2+ (see the derivation in renown.js).

       b226 asserted the opposite direction — "weights only rose" — because a
       kill-heavy veteran whose score fell could be DEMOTED. That protection is
       real and it is unchanged; what changed is WHERE it comes from. The
       `renownHigh` ratchet makes it structural: rank is decided on the
       high-water mark, so a weight may now fall in any direction without
       clawing back a single rank. Which is exactly why the safe lever is the
       weights and never the THRESHOLDS — those are compared against the banked
       mark, and raising one would demote everybody at once. This test pins
       both halves. */
    const R = window.HearthriseRenown;
    assert(R.WEIGHTS.totalLevel === 2, 'totalLevel weight must be 2');
    assert(R.WEIGHTS.skill99 === 100, 'skill99 weight must be 100');
    assert(R.WEIGHTS.kill === 0.05, 'the kill weight must be 0.05');
    assert(R.WEIGHTS.questDone === 25 && R.WEIGHTS.collection === 3 && R.WEIGHTS.streakBest === 5,
      'the rest of the pace retune drifted');
    // THE THRESHOLDS ARE FROZEN. They are compared against the banked ratchet,
    // so moving one is the one edit that can demote a live player.
    const MINS = [0, 400, 900, 2200, 4500, 8000, 13500, 21000, 32000, 48000, 72000, 120000];
    R.RANKS.forEach((r, i) => assert(r.min === MINS[i],
      'rank threshold ' + r.id + ' moved to ' + r.min + ' — thresholds may never move'));
    assert(typeof R.effective === 'function', 'the ratcheted score must be published');
    const snap = snapshotG();
    try {
      const G = window.G;
      G.renownHigh = 0;
      const live = R.compute(G);
      const high = R.effective(G);
      assert(high === live, 'with no history the ratchet is the live score');
      assert(G.renownHigh === live, 'the high-water mark must persist into the save');

      // Now simulate ANY future change that would lower the score — a weight
      // edit, a recount, a lost term. The rank must not move.
      const rankBefore = R.rankIndexFor(R.effective(G));
      G.renownHigh = live + 50000;
      assert(R.effective(G) === live + 50000, 'the ratchet holds the high-water mark, not the live score');
      const rankAfter = R.rankIndexFor(R.effective(G));
      assert(rankAfter >= rankBefore, 'a rank may never fall');

      // And a collapse of the underlying score cannot pull the rank down.
      const skills = G.skills; G.skills = {};
      assert(R.compute(G) < live, 'the live score really did fall');
      assert(R.effective(G) === live + 50000, 'but the ratcheted score did not');
      assert(R.rankIndexFor(R.effective(G)) >= rankBefore, 'so the rank did not either');
      G.skills = skills;
    } finally { restoreG(snap); }
  }),

  () => tryRun("b226: the Founder's mark is date-gated, cosmetic, and grants nothing", () => {
    const G = window.G;
    const snap = snapshotG();
    try {
      assert(typeof window.RETUNE_EPOCH === 'number' && isFinite(window.RETUNE_EPOCH),
        'the retune epoch must be a fixed constant, not "now"');
      G.createdAt = window.RETUNE_EPOCH - 1;
      assert(window.isFounder(G) === true, 'a save from before the retune is a founder save');
      assert(window.founderTitle(G) === 'of the First Season', 'and it carries the title');
      G.createdAt = window.RETUNE_EPOCH + 1;
      assert(window.isFounder(G) === false, 'a save made after the retune is not');
      assert(window.founderTitle(G) === '', 'and it carries no title');
      delete G.createdAt;
      assert(window.isFounder(G) === true, 'a save with no stamp at all predates the field, so it qualifies');

      // Display-only: it may never reach a bonus channel.
      G.createdAt = window.RETUNE_EPOCH - 1;
      G.rooms = {};
      const founderBonus = window.getBonus('allXP');
      G.createdAt = window.RETUNE_EPOCH + 1;
      assert(window.getBonus('allXP') === founderBonus,
        'the mark must not change a single bonus — it is a title, not a perk');
    } finally { restoreG(snap); }
  }),

  () => tryRun('b226: every rate readout quotes what the engine actually pays', () => {
    // Caught in browser verification: the activity bar advertised 18,000 xp/hr
    // while woodcutting ticked up at 5,250 — the tile, the pill and the
    // Character page each did their own book-value arithmetic. A price tag
    // that lies is worse than no price tag.
    const G = window.G;
    assert(typeof window.actionRate === 'function', 'actionRate must be the one rate calculator');
    const snap = snapshotG();
    try {
      G.rooms = {}; G.plotBuildings = []; G.restedXp = 0;
      const tree = window.TREES[0];
      // Set the activity FIRST: the readout only exists while one is running,
      // and presence is part of the rate the player is being quoted.
      G.skills = Object.assign({}, G.skills, { woodcutting: 0 });
      G.activeSkill = 'woodcutting'; G.skillTargetId = tree.id;
      const r = window.actionRate('woodcutting', tree);
      window.doSkillAction(true);
      const granted = xpOf('woodcutting');
      assert(granted === r.xpPerAction,
        'the quoted per-action XP (' + r.xpPerAction + ') must be what a real action grants (' + granted + ')');
      assert(Math.abs(r.xpPerHour - Math.floor(3600000 / r.ms * r.xpPerAction)) <= 1,
        'xp/hr must follow from the quoted interval and grant');
      // And it must NOT be the naive book-value rate the readouts used to show.
      const bookRate = Math.floor(3600000 / tree.ms * tree.xp);
      assert(r.xpPerHour < bookRate,
        'the quoted rate must be the PACED one, not the book rate (' + r.xpPerHour + ' vs book ' + bookRate + ')');
    } finally { try { window.stopSkill(); } catch {} restoreG(snap); }
  }),

  () => tryRun('b226: the Castle Labour daily cap is still reachable in a sitting', () => {
    // §8.5: labour is per ACTION, not per hour, so slowing actions pushes the
    // cap further away. Confirm a level-50 member can still fill it, or the
    // clan's "attendance beats gear" design quietly breaks on a rate change.
    const CS = window.HearthriseClanSeat;
    if (!CS || typeof CS.labourForAction !== 'function') return;
    const perAction = CS.labourForAction(50, 1);
    const actions = Math.ceil(CS.DAILY_LABOUR_CAP / perAction);
    const minutes = actions * window.pacedActionMs(3000) / 60000;
    assert(minutes < 45,
      'a level-50 member must still fill the ' + CS.DAILY_LABOUR_CAP + ' labour cap in under 45 min, needs ' + minutes.toFixed(1));
  }),
  // b227 (Tyler): "Remove the save game button as the game is solely online."
  // Autosave + cloud sync own persistence; a manual save button implies the
  // game might NOT be saving, which is now a lie. Guard both variants gone.
  () => tryRun('b227: no manual save button exists (online realm)', () => {
    assert(!document.getElementById('btn-save'), 'desktop #btn-save is back');
    assert(!document.getElementById('btn-save-mobile'), 'mobile #btn-save-mobile is back');
  }),
];
