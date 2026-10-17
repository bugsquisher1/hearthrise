// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/bounty-and-artisan.js — bounty pay and rerolls, the equipment lane, runecrafting, ammo and recipe order.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 64 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, stampBalanceLikeLoad, stampRecordLikeLoad, withServerBacked, awayGatherSpan, tryRunRestampingBalance, xpOf, xpZero, goldOf, snapshotG, setAway, restoreG, restoreGAndRecord, withCap, on, stubSignedIn, serverBagFixture } from './_harness.js?v=589';

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

  /* The Wave 3 RECIPES (and the orphan-drop routing they did) left with crafted
     gear in the 2026-10-14 demolition. The 14 items stay in the catalogue until
     the roster (catalogue-coherence AWAITING_ROSTER), so what is still true of
     them is checked: a real slot, a wield gate, a flavour line. */
  () => tryRun('b247: Wave 3 uniques — the 14 curated items are well-formed catalogue rows', () => {
    const ITEMS = window.ITEMS;
    const VALID_SLOTS = new Set(['helmet','necklace','earrings','cape','weapon','ammo','ring','body','gloves','belt','pants','boots','companion']);
    const WAVE3 = ['dragonrend_greatblade','crown_of_the_fallen_king','emberfang_blade','demoncaller_staff',
      'panthers_eye_pendant','wraithsilk_shroud','widows_fang','plaguewarden_greaves','hollow_sigil_ring',
      'fangdart_recurve','alphaheart_longbow','nightstalker_pelt','warband_bulwark','chitinweave_cloak'];
    WAVE3.forEach((id) => {
      const it = ITEMS[id];
      assert(it, 'Wave 3 item must exist: ' + id);
      assert(VALID_SLOTS.has(it.slot), id + ' must sit in a real equip slot, got ' + it.slot);
      // Endgame gear carries a real wield gate.
      const req = window.gearWieldReq(it);
      assert(req && req.lv > 0, id + ' must be level-gated to wield');
      // Flavour line surfaces in the tooltip index.
      assert(typeof window.itemDesc === 'function' && window.itemDesc(id), id + ' must have a description');
    });
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
      // Designer ruling: tier 1 is never spent, books at 0; every higher rung is priced.
      if (it.tier === 1) {
        assert(it.v === 0 && it.ammoPerShot === 0, 'tier-1 ammo "' + id + '" must book at 0 and never burn (v ' + it.v + ', perShot ' + it.ammoPerShot + ')');
      } else {
        assert(it.v > 0, 'ammo "' + id + '" needs a gold value — the server owns prices');
      }
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
  () => tryRun('b432: "How do I get this?" names the bench for a craftable, and never claims a live item was removed', () => {
    const ask = (id) => {
      window.showAcquisitionTip(id);
      const ov = document.getElementById('acq-overlay');
      assert(ov, 'the acquisition overlay did not open for ' + id);
      const txt = ov.innerText || '';
      window.hideAcquisitionTip();
      return txt;
    };
    /* Craft-only items — none has a drop, node or shop row to fall back on, so
       each one is a real test of the recipe path. (dressed_block and ember_rune
       left with the Stonemason and the enchant runes, 2026-10-14.) */
    const CASES = [
      ['rune_blank', 'Runecrafting'],   // W0: the base blank cuts moved to Runecrafting
      ['normal_plank', 'Crafting'],
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
    /* W0: both base blank cuts live on the RUNECRAFTING bench now. */
    const blankReqs = (window.ARTISAN_RECIPES.runecrafting || [])
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
    assert(new RegExp('Runecrafting Lv ' + lowest).test(window.itemSourceLine('rune_blank')),
      'the item flyout source line must also name the easiest recipe, got: ' + window.itemSourceLine('rune_blank'));
  }),

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

    /* W0 (coherence audit Top-10 #7): an EMPTY slot on a bow or a staff is run
       dry. Before W0 it fought at full strength — 3.4x a dry quiver — so the
       smart play was to equip nothing and Fletching/Runecrafting had no buyer. */
    assert(A.AMMO_EMPTY_SLOT_IS_DRY === true, 'W0: the empty-slot-is-dry flag is off');
    assert(A.ammoDamageMult({ weaponType: 'ranged', perShot: 0, stock: 0, equipped: false }) === 0.25,
      'W0: a bow with NOTHING in the ammo slot must fight as run dry (x0.25)');
    assert(A.ammoDamageMult({ weaponType: 'magic', perShot: 0, stock: 0, equipped: false }) === 0.25,
      'W0: a staff with nothing in the ammo slot must fight as run dry (x0.25)');
    assert(A.ammoDamageMult({ weaponType: 'sword', perShot: 0, stock: 0, equipped: false }) === 1,
      'W0: melee with an empty slot is still not penalised (R5)');
    const rd = A.readAmmo({ equipment: { weapon: 'shortbow' }, inventory: {} }, { items: window.ITEMS });
    assert(rd.dry === true, 'W0: readAmmo must call an empty bow slot dry, or the combat rail never shows why');
    /* …and nobody is put there by default: the free tier-1 rung of every
       ladder is on the counter (and in the server-built starter kit). */
    ['bronze_arrows', 'air_rune', 'coarse_whetstone'].forEach((id) => {
      const o = (window.SEED_SHOP || []).find((s) => s.id === id);
      assert(o && o.qty > 0, 'W0: the Local Shop does not stock the free rung ' + id);
      assert(o.cost > o.qty * window.ITEMS[id].v, 'W0: ' + id + ' sells at or below book value — a vendor loop');
      assert(window.ITEMS[id].ammoPerShot === 0, 'W0: ' + id + ' must be the free (never-spent) rung');
    });
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

  /* W0 (coherence audit Top-10 #8): PRAYER WARDS. Prayer used to do nothing in
     a fight. Each Prayer tier now turns a share of monster blows aside, priced
     inside `monsterCombatRolls` — the ONE function the live tick (this page's
     getMonsterCombatRolls), the away accrual and the world tick all call — so
     the attended surface must apply exactly the core ward to the skills it
     displays. tests/w0e-ammo-runecraft-prayer.mjs proves away and tick. */
  () => tryRun('W0 PRAYER: the live monster roll carries the Prayer ward the engine applies away', () => {
    const C = window.HearthriseCore;
    const m = window.MONSTERS.goblin;
    const S = window.hrDisplaySkills();
    const eq = window.getEquipmentStats();
    const ward = C.combat.prayerWardPct(S);
    const bare = C.combat.monsterCombatRolls(m, { eq, skills: Object.assign({}, S, { prayer: 0 }), bonus: C.bonus });
    const live = window.getMonsterCombatRolls(m, eq);
    assert(Math.abs(live.accuracy - bare.accuracy * (1 - ward / 100)) < 1e-12,
      'the live tick prices a goblin swing at ' + live.accuracy + ', but the core ward (' + ward
      + '%) on the displayed skills says ' + bare.accuracy * (1 - ward / 100));
    const hi = C.combat.monsterCombatRolls(m, { eq, skills: Object.assign({}, S, { prayer: window.xpForLevel(99) }), bonus: C.bonus });
    assert(C.combat.prayerWardPct({ prayer: window.xpForLevel(99) }) > 0 && hi.accuracy < bare.accuracy,
      'Prayer 99 turns no blow aside — Prayer is a combat-level padder again');
    assert(hi.maxHit === bare.maxHit, 'the ward must not touch max hit (it is a share of blows)');
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
    const realMark = window.showLevelupCelebration;
    try {
      window.notify = function () {};
      window._hrLastLevelUp = null;
      let marks = 0;
      window.showLevelupCelebration = function () { marks += 1; return null; };
      window.G.skills = Object.assign({}, window.G.skills, { woodcutting: 0 });
      window.addXp('woodcutting', 200000);   // crosses several levels
      window.showLevelupCelebration = realMark;
      assert(marks === 0, 'the client xp path must not raise the Mark banner (it fires on the server level), got ' + marks);
      assert(window._hrLastLevelUp && window._hrLastLevelUp.skill === 'woodcutting',
        'a level-up MUST fire the notice with the right skill');
      assert(window._hrLastLevelUp.level > 1, 'the notice must carry the new level, got ' + window._hrLastLevelUp.level);

      // A plain XP tick at the cap must NOT fire it.
      window._hrLastLevelUp = null;
      window.G.skills.woodcutting = 13034431;  // level 99
      window.addXp('woodcutting', 5);
      assert(window._hrLastLevelUp === null,
        'a normal XP tick that crosses no level boundary must NOT fire the notice');
    } finally { window.notify = realNotify; window.showLevelupCelebration = realMark; restoreG(snap); }
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

    // Coded grants the engine makes outside the drop tables.
    ['hearth_token'].forEach(add);

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
    const EXEMPT = new Set(['hearth_token', 'burnt_food']);
    /* DEMOLITION (2026-10-14): crafted gear, the dungeons and the clan Hunt left;
       their outputs stay in the catalogue, sourceless, until the roster — the ONE
       shrink-only list of them is catalogue-coherence AWAITING_ROSTER. */
    const AWAITING = new Set(((window.HearthriseCatalogue || {}).AWAITING_ROSTER) || []);
    assert(AWAITING.size > 0, 'HearthriseCatalogue.AWAITING_ROSTER must be published — without it this guard cannot tell a held row from a dead one');
    /* W0 (2026-10-10): the self-closing 'dormant' hatches (pendingSystem, non-live
       effect kinds) are GONE with the 40 rows they exempted — nothing in the
       catalogue may be unobtainable any more. tests/catalogue-coherence.mjs is the
       standing source-and-use guard for the whole catalogue in Node. */
    const isExempt = (id) => { const it = ITEMS[id] || {}; return EXEMPT.has(id) || AWAITING.has(id) || it.premium || it.rarity === 'currency' || it.type === 'companion' || it.unlocks || it.recipe; };
    const dead = Object.keys(ITEMS).filter((id) => !reach.has(id) && !isExempt(id));
    assert(dead.length === 0, 'UNREACHABLE items (no obtainable source or broken recipe chain): ' + dead.join(', '));
  }),

  () => tryRun('b242: items explain themselves — flavour line + source + used-in', () => {
    assert(typeof window.itemDesc === 'function' && typeof window.itemSourceLine === 'function' && typeof window.itemUsedInLine === 'function',
      'the item-index seams (itemDesc/itemSourceLine/itemUsedInLine) must exist');
    // Flavour descriptions authored for the whole table.
    assert(window.itemDesc('steel_sword') && window.itemDesc('steel_sword').length > 8, 'items must carry a flavour description');
    // Source: a crafted item names its craft; a mined ore names Mining. (The gear
    // recipes left in the 2026-10-14 demolition, so the crafted fixture is the
    // first live smithing output rather than the steel sword.)
    const smithed = window.ARTISAN_RECIPES.smithing[0].output;
    assert(/Smithing/i.test(window.itemSourceLine(smithed)), 'a crafted item must name its craft source, got: ' + window.itemSourceLine(smithed));
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

  () => tryRun('item flavour coverage — Hearthfinds and boss uniques explain themselves too', () => {
    for (const id of ['emberheart', 'voidmaw_scepter']) {   // dungeon_scrip left with the dungeons
      assert(typeof window.itemDesc(id) === 'string' && window.itemDesc(id).length > 0, `"${id}" must carry a flavour line`);
    }
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
    const snap = snapshotG(), bag = serverBagFixture();
    try {
      const id = 'normal_log';
      G.inventory = G.inventory || {}; G.inventory[id] = 100;
      bag.agree();   // the sell counts the SERVER's bag (sellableCount)
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
    } finally { restoreGAndRecord(snap); bag.restore(); }
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

  /* -- regression suite -- BLESSING-HONESTY (CONFLICTS.md 2026-09-28): hr-accrue's bonusFor
     has no blessing layer, so the calendar may not move getBonus and Home / the Events card may
     print no rate, yield or gold-find promise. Red on the b227 layer and its "+3% gold find" copy. */










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
    // A crafted item the shop does not stock is not raw, so it keeps the full bid.
    assert(!ITEMS.cooked_herring.raw, 'a cooked dish is not a raw material');
    assert(!(window.SHOP_UNIT_PRICE && 'cooked_herring' in window.SHOP_UNIT_PRICE),
      'cooked_herring is now shop-sold — pick another unstocked dish for this control');
    assert(window.vendorPrice('cooked_herring') === ITEMS.cooked_herring.v,
      'a crafted/cooked item must still fetch full value');
  }),

  () => tryRun('b226: every gathering rung is strictly faster XP/sec than the one below it', () => {
    // Mithril Rock (req 60) used to be a SLOWER xp/sec than Gold Rock (req 45):
    // unlocking the rung was a punishment. This catches that class forever.
    [['TREES', window.TREES], ['ROCKS', window.ROCKS], ['FISH_SPOTS', window.FISH_SPOTS]].forEach(([name, table]) => {
      let prev = null;
      table.forEach((rung) => {
        // The Essence Rock is a side node beside copper (Designer ruling), not a ladder rung.
        if (rung.id === 'essence_rock') return;
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

  // b227 (Tyler): "Remove the save game button as the game is solely online."
  // Autosave + cloud sync own persistence; a manual save button implies the
  // game might NOT be saving, which is now a lie. Guard both variants gone.
  () => tryRun('b227: no manual save button exists (online realm)', () => {
    assert(!document.getElementById('btn-save'), 'desktop #btn-save is back');
    assert(!document.getElementById('btn-save-mobile'), 'mobile #btn-save-mobile is back');
  }),

  /* SIGNPOST-1: a dead end names its cause and its door, from the server bag. */
  () => tryRun('SIGNPOST-1: a stalled bench and an empty bag say why and where next', () => {
    const SP = window.HearthriseSignposts;
    assert(SP, 'window.HearthriseSignposts is not published');
    const out = SP.stallLine('cooking', { reason: 'inputs', missing: 'shrimp' });
    assert(/Out of Raw Shrimp/.test(out) && /Cooking stopped/.test(out) && /Fishing/.test(out), 'stall line: ' + out);
    assert(/recipe scroll/.test(SP.stallLine('cooking', { reason: 'gate' })), 'a gate stall must name the unread scroll');
    assert(SP.bagEmptyKey({ catId: 'weapons', heldInCat: 2 }) === 'bag.hidden', 'a filtered bag must not claim the items are gone');
    assert(SP.bagEmptyKey({ catId: 'weapons', heldInCat: 0 }) === 'bag.weapons', 'an empty class must use its own line');
    assert(SP.door('bag.seeds').tab === 'shops', 'the seeds door must open Shops');
    assert(/No food/.test(SP.fill('bag.food')) && !/Auto-Eat/.test(SP.fill('bag.food')), 'the food line must say the bag is empty, and never name the demolished Auto-Eat');
  }),

  () => tryRunAsync('EVEN-CARDS-1: every card in a recipe grid row has one width, one height, one art box and one pinned status line — and padded sprite art fills the box', async () => {
    const T = window.HearthriseActivitiesGrid;
    const R = window.ARTISAN_RECIPES && window.ARTISAN_RECIPES.smithing;
    assert(T && typeof T.__tileForArtisan === 'function' && R, 'the artisan tile seam and the smithing recipes must be published');
    const pick = (id) => { const r = R.find((x) => x.id === id); assert(r, 'smithing recipe ' + id + ' is gone — re-pick the fixture'); return r; };
    const row = ['smelt_copper', 'smelt_bronze', 'smelt_iron', 'smelt_gold', 'smelt_dawn', 'smelt_rune'].map(pick);
    assert(Object.keys(row[4].inputs || {}).length >= 3, 'the long-input fixture must have three inputs');
    /* The wear-line card (an armour output) left with the gear recipes on
       2026-10-14; smelt_dawn and smelt_rune carry three inputs, which is the
       genuinely taller card the grid must stretch the others to. */
    const G = window.G; const snap = snapshotG(); const realGate = window.hrGateLevel;
    const host = document.createElement('div');
    try {
      G.inventory = Object.assign({}, G.inventory, { copper_ore: 500, bronze_bar: 12 });
      window.hrGateLevel = (sk) => (sk === 'smithing' ? 10 : realGate(sk));
      /* On screen (lazy art only loads in the viewport), invisible, inert. */
      host.style.cssText = 'position:fixed;left:0;top:0;width:1400px;opacity:0;pointer-events:none;z-index:-1';
      host.innerHTML = '<div class="act-grid">' + row.map((r) => T.__tileForArtisan(r, 'smithing')).join('') + '</div>';
      document.body.appendChild(host);
      const tiles = [...host.querySelectorAll('.act-tile')];
      assert(tiles.length === row.length, 'painted ' + tiles.length + ' tiles for ' + row.length + ' recipes');
      assert(tiles.filter((t) => t.classList.contains('locked')).length >= 3 && tiles.filter((t) => !t.classList.contains('locked')).length >= 2,
        'the fixture must hold open AND locked cards in one row');
      const imgs = [...host.querySelectorAll('.at-icon img')];
      await Promise.all(imgs.map((i) => new Promise((res) => {
        if (i.complete && i.naturalWidth) { res(); return; }
        i.addEventListener('load', res, { once: true }); i.addEventListener('error', res, { once: true }); setTimeout(res, 4000);
      })));
      await new Promise((r) => setTimeout(r, 60));   // the capture-phase fit runs on the same load event
      const px = (v) => Math.round(v * 10) / 10;
      const rect = (el) => el.getBoundingClientRect();
      const tops = new Set(tiles.map((t) => Math.round(rect(t).top)));
      assert(tops.size === 1, 'the fixture must lay out as ONE row at 1400px, got ' + tops.size + ' rows');
      const sizes = tiles.map((t) => px(rect(t).width) + 'x' + px(rect(t).height));
      assert(new Set(sizes).size === 1, 'cards in one row differ in size: ' + sizes.join(' | '));
      const boxes = tiles.map((t) => { const b = t.querySelector('.at-icon'); return b ? px(rect(b).width) + 'x' + px(rect(b).height) : 'none'; });
      assert(new Set(boxes).size === 1 && !boxes.includes('none'), 'art boxes differ: ' + boxes.join(' | '));
      const status = tiles.map((t) => t.querySelectorAll('.at-status').length);
      assert(status.every((n) => n === 1), 'every card must end on exactly one status line, got ' + status.join(','));
      const feet = tiles.map((t) => px(rect(t).bottom - rect(t.querySelector('.at-status')).bottom));
      assert(new Set(feet).size === 1, 'the status line is not pinned to one foot across the row: ' + feet.join(','));
      const inputs = tiles.map((t) => px(rect(t.querySelector('.at-inputs')).height));
      assert(new Set(inputs).size === 1, 'the inputs slot is not one fixed two-line slot: ' + inputs.join(','));
      assert(tiles[4].getAttribute('title').indexOf((window.ITEMS.dawnstone_ore || {}).n || 'dawnstone_ore') >= 0,
        'the clamped inputs must be readable in full in the card title: ' + tiles[4].getAttribute('title'));
      /* The art: a padded sprite is cropped to its paint and sized along its
         long axis, so it fills the box with no letterbox (a letterboxed view
         box still paints the cropped-away corner mark). */
      if (CSS.supports('object-view-box', 'inset(0%)')) {
        const art = (i) => { const im = tiles[i].querySelector('.at-icon img'); const b = rect(tiles[i].querySelector('.at-icon')); const r = rect(im);
          return { im, box: b.width, w: r.width, h: r.height, view: im.style.getPropertyValue('object-view-box') }; };
        const cu = art(0), fe = art(2);
        assert(cu.view && /inset\(/.test(cu.view), 'the copper sprite (art on ~70% of its canvas) was not cropped to its paint: style="' + cu.im.getAttribute('style') + '"');
        assert(Math.abs(Math.max(cu.w, cu.h) - cu.box) <= 1 && Math.abs(cu.w - cu.h) > 4,
          'cropped copper art must fill the box on its long axis without a letterbox: ' + px(cu.w) + 'x' + px(cu.h) + ' in ' + px(cu.box));
        const fit = window.HearthriseIcons.artFitBox(fe.im);
        const bottom = fit && parseFloat(fit.box.split(' ')[2]);
        assert(bottom > 15, 'the iron sprite\'s corner mark must be dropped as debris (bottom inset ' + bottom + '%)');
        assert(Math.abs(Math.max(fe.w, fe.h) - fe.box) <= 1, 'cropped iron art must fill the box: ' + px(fe.w) + 'x' + px(fe.h) + ' in ' + px(fe.box));
      }
    } finally {
      host.remove();
      window.hrGateLevel = realGate;
      restoreG(snap);
    }
  }),

  () => tryRun('EVEN-CARDS-2: the lane strip\'s badge means one thing on every chip — the recipe count, never a level', () => {
    const S = window.HearthriseArtisanCat; const R = window.ARTISAN_RECIPES && window.ARTISAN_RECIPES.smithing;
    assert(S && typeof S.groups === 'function' && R, 'the artisan category strip must be published');
    const realLevel = window.getLevel;
    const host = document.createElement('div');
    try {
      window.getLevel = (sk) => (sk === 'smithing' ? 1 : realLevel(sk));   // most lanes shut
      host.innerHTML = S.strip('smithing');
      const gs = S.groups('smithing');
      const chips = [...host.querySelectorAll('.chip')];
      assert(chips.length === gs.length && chips.length >= 2, 'the strip must draw one chip per lane');
      chips.forEach((c, i) => {
        const n = c.querySelector('.act-cat-n');
        assert(n && n.textContent.trim() === String(gs[i].recipes.length), 'chip "' + c.textContent.trim() + '" badge must be its recipe count ' + gs[i].recipes.length);
        assert(!/Lv\s*\d/.test(c.textContent), 'chip "' + c.textContent.trim() + '" mixes a level into the count');
      });
      assert(chips.some((c) => c.classList.contains('act-cat-shut') && c.querySelector('.act-cat-n svg')), 'a shut lane must carry the padlock');
    } finally { window.getLevel = realLevel; }
  }),
];
