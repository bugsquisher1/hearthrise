// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/monsters-inventory-and-brand.js — the monster roster, elemental enchants, the inventory flip, live settlement and the brand guards.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 183 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, withCookingArmed, stampBalanceLikeLoad, stampRecordLikeLoad, withRoomServer, applyAwayEnvelope, armEquipFlipForTest, tryRunRestampingBalance, findToast, xpMap, predZero, snapshotG, armActivityTransport, drain, restoreAccrualSwitch, cameFromArc, restoreG, restoreGAndRecord, combatScreen, on, snapshot } from './_harness.js?v=550';

export default [

  /* ══════════════════════════════════════════════════════════════════════
     b354 — THE BUILD BUTTON IS ABOVE THE FOLD, IN BOTH PILLARS.

     Reported by Tyler: on a building-upgrade panel you have to scroll to
     reach Build. The cause is structural rather than cosmetic — `actions` was
     the LAST section of a descriptor whose earlier sections are a flavour
     note, a bonus list and a five-rung ladder, all inside `.hr-room-body`,
     which is the element that scrolls. So the fix is structural too: the
     pinned control renders as a SIBLING of the scroll container.

     This is asserted as DOM ORDER + containment rather than by measuring
     pixels: a test that checked `getBoundingClientRect().top` would pass on a
     tall desktop viewport while the phone stayed broken, which is exactly the
     bug it is meant to catch.
     ══════════════════════════════════════════════════════════════════════ */
  // gold-arm: the room Build click deducts gold via a clientMayWriteRecordField-
  // gated path (switch-OFF position); the stamps make the affordability reads known.
  () => tryRunAsync('b354: the Build button renders above the scrollable details (homestead room + castle wing)', async () => {
    const RM = window.HearthriseRoomModal, H = window.HearthriseHomestead;
    if (!RM || !H || typeof H.openRoom !== 'function') { skip('seam absent'); return; }

    /* The pin pass itself, driven directly — it is the rule, and the two
       renders below are the proof it reaches the screen. */
    const probe = RM._hoistPin([
      { kind: 'note', html: 'x' },
      { kind: 'actions', buttons: [{ label: 'Build', action: 'build', pin: true },
                                   { label: 'Go', action: 'go' }] }
    ]);
    assert(probe.pin && probe.pin.action === 'build', 'hoistPin did not lift the pinned button');
    assert(probe.sections[1].buttons.length === 1 && probe.sections[1].buttons[0].action === 'go',
      'the pinned button must be REMOVED from the body — two buttons for one action is worse than one '
      + 'in the wrong place');
    const none = RM._hoistPin([{ kind: 'actions', buttons: [{ label: 'Go', action: 'go' }] }]);
    assert(!none.pin && none.sections.length === 1,
      'a descriptor with nothing pinned must be rendered exactly as before');

    const above = (what) => {
      const wrap = document.querySelector('.hr-room-wrap');
      const bar = wrap && wrap.querySelector(':scope > .hr-room-build');
      const body = wrap && wrap.querySelector(':scope > .hr-room-body');
      assert(bar, what + ': no build bar was rendered');
      assert(body, what + ': the modal has no body');
      assert(!bar.closest('.hr-room-body'),
        what + ': the build bar is INSIDE the scroll container, which is the whole bug');
      assert(bar.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
        what + ': the details are not after the build button in the DOM');
      assert(getComputedStyle(body).overflowY === 'auto',
        what + ': .hr-room-body is not the scroll container, so "outside it" proves nothing');
      const btn = bar.querySelector('button');
      assert(btn, what + ': the build bar has no button');
      assert(body.querySelectorAll('[data-cs="build"],[data-cs="post"],[data-cs="tier-up"]').length === 0,
        what + ': the build control is ALSO still in the scrolling body');
      return { bar: bar, btn: btn, body: body };
    };

    const snap = snapshotG();
    try {
      // ── PILLAR 1: a homestead room ────────────────────────────────────
      window.G.homestead = { tier: 3 };
      window.G.rooms = {};
      window.G.gold = 500000;
      stampBalanceLikeLoad(window.G);   // armed: the Build bar's affordability reads gold
      window.G.inventory = Object.assign({}, window.G.inventory, { normal_log: 999, normal_plank: 999 });
      H.openRoom('kitchen');
      let seen = above('homestead kitchen');
      assert(/Build/.test(seen.btn.textContent), 'an unbuilt room offers Build, got "' + seen.btn.textContent + '"');
      assert(!seen.btn.disabled, 'an affordable rung must be buildable from the bar');
      assert(/Gold/i.test(seen.bar.textContent) && /\d+\s*\/\s*\d+/.test(seen.bar.textContent),
        'the cost must travel WITH the button — a price on the other side of a scroll is the same bug: "'
        + seen.bar.textContent.replace(/\s+/g, ' ') + '"');
      /* It really ACTS from up there. b515: the rung is the server's — the click
         sends `room.kitchen.1` and advances nothing locally — so the press is
         answered before it is read. What this pillar owns is the BUTTON (it is
         pinned, priced, and its click reaches the gesture); the rung landing is
         b227's subject and is asserted here only so "the click did nothing" and
         "the click worked" stay distinguishable. */
      await withRoomServer({ kitchen: 1 }, window.G.gold - 1, async (rig) => {
        seen.btn.click();
        await rig.drain();
        assert(rig.sent.length === 1 && rig.sent[0].offer === 'room.kitchen.1',
          'clicking Build in the bar sent ' + JSON.stringify(rig.sent) + ' — the pinned button is not '
          + 'wired to the gesture, which is the bug wearing a different hat');
        assert((window.G.rooms || {}).kitchen === 1, 'clicking Build in the bar did not build the room');
      });

      // Unaffordable: still pinned, still priced, and it NAMES what is short.
      predZero(); window.G.gold = 0; stampBalanceLikeLoad(window.G); window.G.inventory = {};
      RM.refresh();
      seen = above('homestead kitchen, unaffordable');
      assert(seen.btn.disabled, 'an unaffordable rung must be disabled');
      assert(/Missing/.test(seen.bar.textContent),
        'a disabled build must say what is short, in the bar: "' + seen.bar.textContent.replace(/\s+/g, ' ') + '"');
      RM.close();

      // ── PILLAR 2: a clan castle wing ──────────────────────────────────
      const UI = window.HearthriseClanSeatUI;
      if (UI && typeof UI.roomDescriptor === 'function') {
        try {
          UI._reset();
          UI._setClan({ id: 'clan-1', name: 'Probe Hold', level: 1, treasury: 0, join_policy: 'open', myRole: 'leader' });
          UI._setSeat({ castle_tier: 1, standing: 0, upgrades: {}, my_role: 'leader', members: 2,
                        member_cap: 10, stores: {}, orders: [], upkeep_state: 'active' }, 'clan-1');
          const d = UI.roomDescriptor('treasury');
          const lad = d.sections.filter((s) => s.kind === 'ladder')[0];
          assert(lad && lad.rows[0] && lad.rows[0].action && lad.rows[0].action.pin,
            'the castle wing\'s next rung must pin its Commission button');
          RM.open(function () { return UI.roomDescriptor('treasury'); });
          const cs = above('clan castle treasury');
          assert(/Commission/.test(cs.btn.textContent),
            'the castle bar must carry the wing\'s own verb, got "' + cs.btn.textContent + '"');
          assert(/\d+\s*\/\s*\d+/.test(cs.bar.textContent),
            'the wing\'s bundle must be shown with the button: "' + cs.bar.textContent.replace(/\s+/g, ' ') + '"');
          assert(cs.bar.querySelector('[data-b="treasury"]'),
            'the pinned button must carry its action data, or pressing it does nothing');
        } finally { UI._reset(); }
      }
    } finally { restoreGAndRecord(snap); RM.close(); }
  }),

  // ══════════════════════════════════════════════════════════════════════
  // b356 regression suite — THE MONSTER ROSTER WAVE
  //
  // Three things this wave could break silently, so each gets a test that
  // fails without the fix rather than a comment claiming it is fine:
  //   1. a monster id rename vaporising Renown / bounties / the chronicle
  //   2. a content drop that does not fit the measured progression curve
  //   3. a portrait mapped to a file that does not exist (404) or to the
  //      wrong monster (the boar-named-bear class of defect)
  // ══════════════════════════════════════════════════════════════════════

  () => tryRun('MON-ALIAS-1: the monster alias seam exists and is applied on load', () => {
    assert(typeof window.remapMonsterIds === 'function', 'remapMonsterIds must exist');
    assert(window.MONSTER_ALIAS && typeof window.MONSTER_ALIAS === 'object',
      'MONSTER_ALIAS must exist — it is the prerequisite for ever renaming a monster');
    assert(typeof window.remapMonsterFamilies === 'function', 'remapMonsterFamilies must exist');
  }),

  () => tryRun('MON-ALIAS-2: a rename folds every save surface (bestiary, dropLog, bounty, chronicle, resume)', () => {
    const G = window.G;
    const snap = {
      bestiary: G.bestiary, dropLog: G.dropLog, bountyHunter: G.bountyHunter,
      chronicle: G.chronicle, lastActivity: G.lastActivity, activeMonster: G.activeMonster,
    };
    const alias = window.MONSTER_ALIAS;
    try {
      /* Alias a REAL live id onto another REAL live id. `dragon` is the id the
         b342 audit measured 200 Renown against. */
      window.MONSTER_ALIAS = { old_wyrm_id: 'dragon' };
      G.bestiary = { old_wyrm_id: { kills: 40, first: 5 }, dragon: { kills: 2, first: 9 } };
      G.dropLog = { old_wyrm_id: { kills: 40, drops: { dragon_bones: 12 } } };
      G.bountyHunter = {
        board: [{ id: 'cull_old_wyrm_id_1700_42', target: 'old_wyrm_id', type: 'cull' }],
        active: { id: 'cull_old_wyrm_id_1700_42', target: 'old_wyrm_id', type: 'cull' },
      };
      G.chronicle = { entries: [{ id: 'boss:old_wyrm_id', kind: 'boss', text: 'First kill — Green Dragon' }] };
      G.lastActivity = { kind: 'monster', id: 'old_wyrm_id' };
      G.activeMonster = 'old_wyrm_id';

      window.remapMonsterIds(G);

      assert(!G.bestiary.old_wyrm_id, 'the old bestiary key must be gone');
      assert(G.bestiary.dragon && G.bestiary.dragon.kills === 42,
        'bestiary kills must MERGE (40+2), not overwrite — got ' + JSON.stringify(G.bestiary.dragon));
      assert(G.bestiary.dragon.first === 5, 'the earlier first-kill timestamp must win');
      assert(G.dropLog.dragon && G.dropLog.dragon.drops.dragon_bones === 12, 'dropLog must fold');
      assert(G.bountyHunter.board[0].target === 'dragon', 'the bounty target must fold');
      assert(G.bountyHunter.board[0].id === 'cull_dragon_1700_42',
        'the id STRING embeds the monster id — an accepted bounty can never complete otherwise; got '
        + G.bountyHunter.board[0].id);
      assert(G.bountyHunter.active.target === 'dragon', 'the active bounty must fold too');
      assert(G.chronicle.entries[0].id === 'boss:dragon',
        'the chronicle idempotency key embeds the id — a re-kill writes a SECOND "First kill" row otherwise');
      assert(G.lastActivity && G.lastActivity.id === 'dragon', 'Resume must fold, not be dropped');
      assert(G.activeMonster === 'dragon', 'the in-flight fight must fold');
    } finally {
      window.MONSTER_ALIAS = alias;
      Object.assign(G, snap);
    }
  }),

  () => tryRun('MON-ALIAS-3: a RETIRED id (aliased to null) is dropped, never left dangling', () => {
    const G = window.G;
    const snap = { bestiary: G.bestiary, bountyHunter: G.bountyHunter, activeMonster: G.activeMonster };
    const alias = window.MONSTER_ALIAS;
    try {
      window.MONSTER_ALIAS = { cut_monster: null };
      G.bestiary = { cut_monster: { kills: 9 }, slime: { kills: 1 } };
      G.bountyHunter = { board: [{ id: 'cull_cut_monster_1_2', target: 'cut_monster' }], active: null };
      G.activeMonster = 'cut_monster';
      window.remapMonsterIds(G);
      assert(!G.bestiary.cut_monster, 'a retired id must not survive in the bestiary');
      assert(G.bestiary.slime, 'unrelated entries must be untouched');
      assert(G.bountyHunter.board.length === 0, 'a bounty for a retired monster must be removed from the board');
      assert(G.activeMonster === null, 'the fight against a retired monster must stop, not crash the loop');
    } finally { window.MONSTER_ALIAS = alias; Object.assign(G, snap); }
  }),

  () => tryRun('MON-ALIAS-4: killsByFamily folds the taxonomy renames instead of stranding them', () => {
    const G = window.G;
    const snap = G.stats.killsByFamily;
    try {
      G.stats.killsByFamily = { Beast: 100, Goblinoid: 50, Mammal: 5, Vermin: 7 };
      window.remapMonsterFamilies(G);
      assert(!G.stats.killsByFamily.Beast, 'the retired "Beast" label must not linger beside "Mammal"');
      assert(G.stats.killsByFamily.Mammal === 105, 'Beast must fold INTO Mammal (100+5), got '
        + G.stats.killsByFamily.Mammal);
      assert(G.stats.killsByFamily.Humanoid === 50, 'Goblinoid must fold into Humanoid');
      assert(G.stats.killsByFamily.Vermin === 7, 'an unchanged family must be untouched');
    } finally { G.stats.killsByFamily = snap; }
  }),

  () => tryRun('MON-ALIAS-5: remapItemIds also folds dropLog[monster].drops[item] (the b244 gap)', () => {
    const G = window.G;
    const snap = { dropLog: G.dropLog };
    const alias = window.ITEM_ALIAS;
    try {
      window.ITEM_ALIAS = { old_pelt_id: 'wolf_pelt' };
      G.dropLog = { wolf: { kills: 3, drops: { old_pelt_id: 4, wolf_pelt: 1 } } };
      window.remapItemIds(G);
      assert(!G.dropLog.wolf.drops.old_pelt_id, 'the renamed item must not stay in the drop log');
      assert(G.dropLog.wolf.drops.wolf_pelt === 5,
        'per-monster drop counts must MERGE (4+1), got ' + G.dropLog.wolf.drops.wolf_pelt);
    } finally { window.ITEM_ALIAS = alias; Object.assign(G, snap); }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b362 — THE FOLD AUDIT and THE TWO SCREENS
     (docs/design/combat-screen-rework.md, cards COMBAT-UI-01…16, FOLD-01…33)

     The fold and the split ship together, so they are guarded together. Each
     test below names the thing that would silently rot without it — a merged
     monster's kill counts, a fight with no visible exit, a hub that shows three
     items on a 1900px screen.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRun('FOLD-MERGE-1: the three merges are live, and a veteran keeps every kill', () => {
    /* The merge is only free because MONSTER_ALIAS makes it free. If a future
       edit deletes a row without its alias line, the counters key on an id that
       is no longer a monster and `foldById` DROPS them — a silent, permanent
       loss of the one number the War Table card exists to show. */
    const A = window.MONSTER_ALIAS;
    const MERGES = { barn_rat: 'rat', jackal: 'wolf', cultist: 'dark_wizard' };
    Object.keys(MERGES).forEach((old) => {
      assert(!window.MONSTERS[old], 'the merged monster "' + old + '" is still in the roster');
      assert(A[old] === MERGES[old],
        'MONSTER_ALIAS is missing the ' + old + ' -> ' + MERGES[old] + ' line — every counter keyed on '
        + old + ' would be dropped on the next load');
      assert(window.MONSTERS[MERGES[old]], 'the fold TARGET ' + MERGES[old] + ' must be a live monster');
    });

    const G = window.G;
    const snap = { bestiary: G.bestiary, dropLog: G.dropLog, bountyHunter: G.bountyHunter,
      activeMonster: G.activeMonster, lastActivity: G.lastActivity };
    try {
      G.bestiary = { barn_rat: { kills: 204, first: 5 }, rat: { kills: 12, first: 9 },
        jackal: { kills: 30 }, cultist: { kills: 7 } };
      G.dropLog = { barn_rat: { kills: 204, drops: { rat_tail: 88 } } };
      G.bountyHunter = { board: [], active: { id: 'cull_barn_rat_1700_42', target: 'barn_rat', type: 'cull' } };
      G.activeMonster = 'jackal';
      G.lastActivity = { kind: 'monster', id: 'cultist' };

      window.remapMonsterIds(G);

      assert(!G.bestiary.barn_rat && !G.bestiary.jackal && !G.bestiary.cultist,
        'a merged id survived in the bestiary');
      assert(G.bestiary.rat && G.bestiary.rat.kills === 216,
        'the merged kills must ADD (204+12), got ' + JSON.stringify(G.bestiary.rat));
      assert(G.bestiary.rat.first === 5, 'the earlier first-kill timestamp must win the merge');
      assert(G.bestiary.wolf && G.bestiary.wolf.kills === 30, 'jackal kills must land on wolf');
      assert(G.bestiary.dark_wizard && G.bestiary.dark_wizard.kills === 7, 'cultist kills must land on dark_wizard');
      assert(G.dropLog.rat && G.dropLog.rat.drops.rat_tail === 88, 'the drop history must fold too');
      assert(G.bountyHunter.active.target === 'rat' && G.bountyHunter.active.id === 'cull_rat_1700_42',
        'an accepted bounty for a merged monster must fold, or it can never be completed: '
        + JSON.stringify(G.bountyHunter.active));
      assert(G.activeMonster === 'wolf', 'a fight in flight against a merged monster must fold, not stop');
      assert(G.lastActivity.id === 'dark_wizard', 'Resume must fold to the surviving id');
    } finally { Object.assign(G, snap); }
  }),

  () => tryRun('FOLD-RENAME-1: the four renames are display-only — every id is untouched', () => {
    /* A rename that reaches an ID is the defect MONSTER_ALIAS exists to absorb;
       a rename that stops at the NAME costs nothing at all. These four stopped
       at the name, and this is what proves it stayed that way. */
    const want = { rat: 'Giant Rat', small_wolf: 'Wolf Cub', weak_skeleton: 'Brittle Skeleton',
      lesser_demon: 'Horned Demon' };
    Object.keys(want).forEach((id) => {
      assert(window.MONSTERS[id], 'the renamed monster lost its id: ' + id);
      assert(window.MONSTERS[id].name === want[id],
        id + ' should read "' + want[id] + '", got "' + window.MONSTERS[id].name + '"');
    });
    ['Small Wolf', 'Weak Skeleton', 'Lesser Demon', 'Field Rat'].forEach((dead) => {
      const still = Object.keys(window.MONSTERS).filter((id) => window.MONSTERS[id].name === dead);
      assert(still.length === 0, 'the retired display name "' + dead + '" is back on ' + still.join(', '));
    });
  }),

  () => tryRun('FOLD-15: zombie and ghoul are opposite fights, and both stay inside the tier band', () => {
    /* The pair shared a tier, a class and a role, which is exactly the "why are
       all the old monsters still there" complaint. Differentiating them by
       pushing them to opposite CORNERS of the same band is the cheap fix; doing
       it by leaving the band would be a balance change wearing a UI hat. */
    const z = window.MONSTERS.zombie, g = window.MONSTERS.ghoul;
    assert(z && g, 'both halves of the pair must exist');
    assert(z.tier === g.tier && z.cls === g.cls, 'the test only means something while they share a tier and class');
    assert(z.hp > g.hp * 1.4, 'the zombie must read as the punching bag: ' + z.hp + ' vs ' + g.hp);
    assert(g.atk > z.atk * 1.4, 'the ghoul must read as the race: ' + g.atk + ' vs ' + z.atk);
    assert(z.def > g.def, 'the armour axis must agree with the identity');
    /* The band check is done against the BAND, not by re-auditing a two-monster
       roster — `audit()` also grades tier coverage (MIN_CLASSES_PER_TIER), which
       a two-row fixture can never satisfy and which has nothing to do with this
       pair. The full-roster audit is MON-TAX-1's job and it covers these rows. */
    const T = window.HearthriseMonsterClasses;
    if (T && T.TIER_BANDS && T.TIER_BANDS[z.tier]) {
      const b = T.TIER_BANDS[z.tier];
      [['hp', z], ['atk', z], ['def', z], ['hp', g], ['atk', g], ['def', g]].forEach(([k, m]) => {
        assert(m[k] >= b[k][0] && m[k] <= b[k][1],
          'the differentiation left the measured tier band on ' + k + ' (' + m[k]
          + ' outside ' + b[k].join('–') + ') — that is a balance change, not a UI one');
      });
    }
  }),

  () => tryRun('COMBAT-UI-01: Combat opens the LIVE FIGHT if one is running, else the War Table', () => {
    /* The idle-game rule: a player taps Combat to CHECK ON something far more
       often than to start something new. One tap back to the hub is cheap; one
       tap into a menu when you wanted your fight is a wrong-screen every
       session. MUTATION PROVEN: make openFromNav() always route to 'table' and
       the second half fails. */
    const { CS, G, restore } = combatScreen();
    try {
      const panel = document.getElementById('panel-combat');
      try { window.stopCombat(); } catch (e) {}
      G.activeMonster = null;
      window.showTab('profile');
      window.showTab('combat');
      assert(panel.dataset.combatView === 'table',
        'with no fight running, Combat must open the War Table, got ' + panel.dataset.combatView);

      window.startCombat('slime');
      assert(G.activeMonster === 'slime', 'the fixture needs a live fight');
      assert(panel.dataset.combatView === 'fight',
        'starting a fight must take the camera to the stage, got ' + panel.dataset.combatView);

      // Back to the hub — and the fight is STILL RUNNING. That is the contract.
      panel.querySelector('.fs-back').click();
      assert(panel.dataset.combatView === 'table', 'Back did not reach the War Table');
      assert(G.activeMonster === 'slime',
        'THE CONTRACT: leaving The Fight stopped the fight. A screen is a camera, not a pointer');

      window.showTab('profile');
      window.showTab('combat');
      assert(panel.dataset.combatView === 'fight',
        'with a fight live, the Combat nav must open the fight, got ' + panel.dataset.combatView);
    } finally { restore(); }
  }),

  () => tryRun('COMBAT-UI-02: the War Table carries a return ribbon while a fight is live', () => {
    const { CS, G, restore } = combatScreen();
    try {
      window.showTab('combat');
      try { window.stopCombat(); } catch (e) {}
      G.activeMonster = null;
      CS.setView('table'); CS.render();
      const ribbon = document.getElementById('wt-ribbon');
      assert(ribbon, 'the ribbon element is missing entirely');
      assert(ribbon.hidden, 'the ribbon must not be on screen when nothing is running');

      window.startCombat('slime');
      G.playerHp = 7; G.playerMaxHp = 10; G.monsterHp = 3; G.monsterMaxHp = 8;
      G.combatKillsThisFoe = 4;
      CS.setView('table'); CS.render();
      assert(!ribbon.hidden, 'a live fight must put the return ribbon on the hub');
      const txt = ribbon.textContent.replace(/\s+/g, ' ');
      assert(/Slime/.test(txt), 'the ribbon must name the foe: ' + txt);
      assert(/3 \/ 8/.test(txt) && /7 \/ 10/.test(txt),
        'the ribbon must carry BOTH health bars with numerals: ' + txt);
      assert(/4/.test(txt), 'the ribbon must carry the kill count for this fight: ' + txt);
      const go = ribbon.querySelector('[data-cs-act="return"]');
      assert(go, 'the ribbon has no way back to the fight');
      go.click();
      assert(document.getElementById('panel-combat').dataset.combatView === 'fight',
        'Return to the fight did not return to the fight');
    } finally { restore(); }
  }),

  () => tryRun('COMBAT-UI-03: the War Table shows a WHOLE TIER at once — the hub is not a sliver', () => {
    /* Tyler: "the monsters list is cramped". The measured answer is that the
       list IS the screen now. A menu that shows three items on a 1900px screen
       is a failure, so this asserts every monster in the tier is PAINTED and
       that the grid is a multi-column layout rather than a 280px column. */
    const { CS, G, restore } = combatScreen();
    try {
      window.showTab('combat');
      try { window.stopCombat(); } catch (e) {}
      G.activeMonster = null;
      G.currentCombatTier = 4;                       // the largest tier
      CS.setView('table'); CS.render();
      const grid = document.getElementById('wt-grid');
      assert(grid, 'no War Table grid');
      const expect = Object.keys(window.MONSTERS).filter((id) => window.MONSTERS[id].tier === 4);
      const cards = grid.querySelectorAll('.wt-card');
      assert(cards.length === expect.length,
        'the grid shows ' + cards.length + ' of tier 4\'s ' + expect.length + ' monsters');
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
      assert(cols >= 6, 'the grid is ' + cols + ' columns wide — that is the old 280px sliver, not a hub');
      /* Locked monsters stay VISIBLE: a menu that hides its own future has no
         pull. And each card carries its decision inputs. */
      const first = cards[0];
      assert(first.querySelector('.wtc-name') && first.querySelector('.wtc-stats')
        && first.querySelector('.wtc-kills'),
        'a card is missing name / weakness+HP / kill-count — those are the decision inputs');
      assert(/NEW|×\d|Lv \d/.test(first.querySelector('.wtc-kills').textContent),
        'the card must say NEW, a kill count or its unlock level: ' + first.querySelector('.wtc-kills').textContent);
    } finally { restore(); }
  }),

  () => tryRun('COMBAT-UI-15: the preview state is the fight screen with the fight not started', () => {
    const { CS, G, restore } = combatScreen();
    try {
      window.showTab('combat');
      try { window.stopCombat(); } catch (e) {}
      G.activeMonster = null;
      assert(CS.preview('goblin'), 'preview() refused a live monster id');
      const panel = document.getElementById('panel-combat');
      assert(panel.dataset.combatView === 'fight' && panel.dataset.fightState === 'preview',
        'preview did not land on the fight screen in its preview state');
      assert(G.activeMonster === null, 'opening a preview STARTED THE FIGHT — the honest screen was skipped');

      // The stage is painted: the foe, its plate, both stat rows, and the bars full.
      assert(/Goblin/i.test(document.getElementById('fs-title').textContent), 'the preview does not name the foe');
      assert(document.getElementById('arena-foe-portrait').innerHTML.trim().length > 0,
        'the foe plate is empty — the point of the preview is seeing the arena you are committing to');
      assert(document.getElementById('arena-foe-hp').style.width === '100%',
        'a preview foe must be at full health');
      assert(/\d/.test(document.getElementById('fs-player-tiles').textContent)
        && /\d/.test(document.getElementById('fs-foe-tiles').textContent),
        'both stat tile rows must be filled with the projection');

      // The primary control is FIGHT, not Eat. Pressing it starts the fight on
      // a screen that has not moved a pixel.
      const fight = panel.querySelector('.fs-fight');
      assert(fight && getComputedStyle(fight).display !== 'none', 'the preview has no Fight button');
      assert(getComputedStyle(document.getElementById('arena-act-player')).display === 'none',
        'the Eat slot is showing on a fight that has not started');
      fight.click();
      assert(G.activeMonster === 'goblin', 'the Fight button did not start the fight');
      assert(panel.dataset.fightState === 'live', 'the stage did not come alive');
      /* AND THE VOID IS GONE. */
      assert(!document.querySelector('#panel-combat .ce-standby'),
        'AWAITING A FOE is back — the largest element on the screen is a placeholder again');
    } finally { restore(); }
  }),

  () => tryRun('COMBAT-UI-12b: the Fight screen carries a PERSISTENT loadout / food / drops rail', () => {
    /* b366 (Tyler): "I think you forgot some buttons? Loot? Eat food? How is
       someone supposed to manage their loadouts/armor/weapon?" — and, of the
       preview: show the foe's DROP TABLE and the gear I am actually wearing.
       b362's answer was six unclickable 34px chips in the title bar, and the
       loot rail only existed while a fight was live. This asserts the whole
       rail is on screen BEFORE the fight, wearing real data.
       MUTATION PROVEN: delete `renderManage(m)` from renderFight and the doll,
       food and drop assertions all fail. */
    const { CS, G, restore } = combatScreen();
    try {
      window.showTab('combat');
      try { window.stopCombat(); } catch (e) {}
      G.activeMonster = null;
      G.inventory = Object.assign({}, G.inventory, { cooked_shrimp: 9, bronze_sword: 1 });
      G.playerMaxHp = 100; G.playerHp = 40;
      window.equipItem('bronze_sword');
      assert(CS.preview('goblin'), 'preview() refused a live monster id');

      // 1 · THE EQUIPMENT PANEL — present, populated, and CLICKABLE.
      const doll = document.getElementById('fsm-doll');
      assert(doll, 'there is no loadout panel on the Fight screen');
      const slots = doll.querySelectorAll('.fsm-slot');
      assert(slots.length >= 10, 'the loadout panel shows ' + slots.length + ' slots — that is a chip strip, not a panel');
      const weapon = doll.querySelector('.fsm-slot[data-slot="weapon"]');
      assert(weapon, 'no weapon slot');
      assert(!weapon.classList.contains('is-empty'), 'the weapon slot reads empty while a Bronze Sword is worn');
      /* THE SHOWCASE HALF: a worn item shows its own art, not a slot glyph. */
      assert(weapon.querySelector('.fsm-slot-art'),
        'the worn weapon is drawn as an empty-slot mark — the point is seeing what you are wearing');
      assert(/Bronze Sword/i.test(weapon.getAttribute('title') || ''),
        'the worn weapon does not name itself: ' + weapon.getAttribute('title'));
      const r = weapon.getBoundingClientRect();
      assert(r.width > 0 && r.height > 0, 'the loadout panel has no box on screen');
      assert(/\+\d+ atk/.test(document.getElementById('fsm-totals').textContent),
        'the rail does not carry the equipment totals: ' + document.getElementById('fsm-totals').textContent);

      // 2 · THE FOOD SLOT — pre-fight, naming the food and the count.
      const food = document.getElementById('fsm-food');
      assert(food, 'there is no food slot on the Fight screen');
      const ftxt = food.textContent.replace(/\s+/g, ' ');
      assert(/Cooked Shrimp/i.test(ftxt), 'the food slot does not name what you will eat: ' + ftxt);
      assert(/9/.test(ftxt), 'the food slot does not say how many you hold: ' + ftxt);
      assert(/\+\d+ HP/.test(ftxt), 'the food slot does not carry the heal: ' + ftxt);

      // 3 · THE DROPS CONTAINER — pre-fight it is the FOE'S TABLE, with chances.
      const drops = document.getElementById('fsm-drops');
      assert(drops, 'there is no drops container on the Fight screen');
      const rows = drops.querySelectorAll('.fsm-drop');
      const table = window.MONSTERS.goblin.drops || [];
      assert(rows.length >= table.length,
        'the preview shows ' + rows.length + ' drop rows for a foe with ' + table.length + ' drops');
      const dtxt = drops.textContent.replace(/\s+/g, ' ');
      assert(/Goblin Ear/i.test(dtxt), 'the drop table does not name the foe\'s drops: ' + dtxt);
      assert(/%|always/.test(dtxt), 'the drop table carries no chances — that is a list, not a decision: ' + dtxt);
      assert(/Gold/.test(dtxt), 'the drop table omits coin, which every foe pays');
      assert(/what it drops/i.test(document.getElementById('fsm-drops-head').textContent),
        'the drops block is not labelled as the foe\'s table before the fight');
    } finally { restore(); }
  }),

  () => tryRun('COMBAT-UI-12c: a loadout slot swaps gear WITHOUT leaving the fight', () => {
    /* Showing twelve slots you cannot change is what b362 shipped. The picker
       equips through legacy's own `equipItem`, so the wield gate and the
       inventory bookkeeping cannot diverge from the Inventory screen's. */
    const { CS, G, restore } = combatScreen();
    try {
      window.showTab('combat');
      try { window.stopCombat(); } catch (e) {}
      G.activeMonster = null;
      G.inventory = Object.assign({}, G.inventory, { bronze_sword: 1 });
      G.equipment = Object.assign({}, G.equipment, { weapon: null });
      CS.preview('goblin');
      assert(CS.openSlotPicker('weapon'), 'the slot picker did not open');
      const scrim = document.querySelector('.hr-room-scrim');
      assert(scrim, 'the picker opened no modal');
      const btn = scrim.querySelector('[data-cs="equip"][data-item="bronze_sword"]');
      assert(btn, 'the picker does not offer a weapon that is in the bag');
      btn.click();
      assert(G.equipment.weapon === 'bronze_sword',
        'equipping from the fight screen did nothing — the panel is read-only again');
      assert(document.getElementById('panel-combat').dataset.combatView === 'fight',
        'swapping gear threw the player off the fight screen');
    } finally {
      try { if (window.HearthriseRoomModal) window.HearthriseRoomModal.close(); } catch (e) {}
      restore();
    }
  }),

  () => tryRun('COMBAT-UI-19b: the swing bar is ANIMATED, not repainted every tick', () => {
    /* Tyler, on b365: "the bar for attack swing not being smooth is giving me a
       headache, but I love the addition." The fill's width was written from a
       200ms poll, so a 2.4s swing moved in twelve steps. It now runs one linear
       scaleX animation whose duration IS the swing — one clock, no per-tick
       geometry. MUTATION PROVEN: restore the `i.style.width` writes and the
       inline-width assertion fails. */
    const { CS, G, restore } = combatScreen();
    try {
      window.showTab('combat');
      window.startCombat('slime');
      CS.renderFight();
      const bar = document.getElementById('fs-player-swing');
      assert(bar, 'the player has no swing bar');
      const fill = bar.querySelector('i');
      const cs = getComputedStyle(fill);
      if (CS._swing && CS._swing._reduced && CS._swing._reduced()) return;   // reduced motion keeps the stepped render
      assert(bar.dataset.swing === 'run', 'a live fight must have the swing animation running, got ' + bar.dataset.swing);
      assert(/hr-fs-swing/.test(cs.animationName),
        'the swing fill carries no animation — it is being repainted: ' + cs.animationName);
      assert(cs.animationTimingFunction === 'linear',
        'a swing clock that eases is a swing clock that lies: ' + cs.animationTimingFunction);
      const want = (window.combatTickMs ? window.combatTickMs() : 2400) / 1000;
      const got = parseFloat(cs.animationDuration);
      assert(Math.abs(got - want) < 0.05,
        'the animation runs at ' + got + 's while the engine swings every ' + want + 's — that is a SECOND clock');
      assert(!fill.style.width,
        'the fill still carries an inline width — the per-tick repaint is back');
      /* And it stops when the fight does. */
      window.stopCombat();
      CS.setView('table');
      G.activeMonster = null;
      CS.preview('slime');
      assert(document.getElementById('fs-player-swing').dataset.swing !== 'run',
        'the swing bar is still running on a fight that has not started');
      /* b368 — AND ITS LABEL IS NEVER HIDDEN AT ANY BREAKPOINT. b366 hid
         `.fs-swing span` on short screens ("the weapon is named on the strip
         above") and, eleven rules later, hid `.csb-swing` on the style buttons
         ("the swing time is printed on the swing bar above"). Each rule deferred
         to the other, so on a landscape phone the swing time was printed
         NOWHERE — Tyler: "you also removed the attack swing timer". A viewport
         assertion cannot catch this from one window size, so the RULE is the
         subject. MUTATION PROVEN: re-add `.fs-swing span { display: none }`
         under the max-height query → red. */
      let hides = 0;
      for (const sheet of Array.from(document.styleSheets)) {
        let rules = null;
        try { rules = sheet.cssRules; } catch (e) { continue; }   // cross-origin
        const walk = (list) => {
          for (const r of Array.from(list || [])) {
            if (r.cssRules) { walk(r.cssRules); continue; }
            if (!r.selectorText || !r.style) continue;
            if (!/\.fs-swing\s+span/.test(r.selectorText)) continue;
            if (r.style.display === 'none' || r.style.visibility === 'hidden') hides++;
          }
        };
        walk(rules);
      }
      assert(hides === 0,
        hides + ' rule(s) hide the swing bar\'s label — the swing timer disappears at that breakpoint');
    } finally { restore(); }
  }),

  () => tryRun('COMBAT-UI-22 (b368): the champion plate SHOWS THE CHOSEN AVATAR and follows a change', () => {
    /* Tyler: "the avatar seems to be bugging back to the original even after
       being changed on the combat screen."

       Both painters of `#arena-player-portrait` wrote it as
       `if (!pp.querySelector('img')) pp.innerHTML = …`. The guard is real (b186:
       floating damage numbers and the DEFEATED stamp are CHILDREN of that node,
       and a 200ms innerHTML rewrite erases them mid-swing) but it made the plate
       WRITE-ONCE — it captured whatever `window._playerAvatar` was at first
       paint and could never be corrected. Change your portrait and the topbar
       and Character page update while the arena keeps the old face for the life
       of the document. Now only the `src` ATTRIBUTE is diffed.

       THIS TEST EXISTS ON THE b368 SIGNED-IN HARNESS SEAM. Everything before it
       plays signed out, with no portrait to get wrong — which is precisely why
       this shipped. See identity.js `installHarnessIdentity`.
       MUTATION PROVEN, in-browser at both viewports: restore the innerHTML
       write-once and the post-change assertion fails while the first two pass. */
    const CS = window.HearthriseCombatScreens;
    const I = window.HearthriseIdentity;
    assert(CS && I, 'combat screens or identity did not boot');
    assert(typeof I._installHarnessIdentity === 'function', 'the signed-in harness seam is missing');
    assert(I._harnessAllowed() === true,
      'the harness seam refused to arm under the smoke harness — no signed-in surface can be tested');
    const { G, restore } = combatScreen();
    const A = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#e100b4"/></svg>');
    const B = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#00d9ff"/></svg>');
    const priorAvatar = window._playerAvatar;
    try {
      /* FAIL-CLOSED FIRST. A test-only identity seam that can arm without the
         explicit harness global is not a seam, it is a backdoor — so prove it
         refuses before proving it works. (The origin half of the rule is
         b224's, and this delegates to that same predicate rather than keeping a
         second copy of it.) */
      window.__HR_TEST_HARNESS__ = undefined;
      assert(I._harnessAllowed() === false, 'the identity seam arms WITHOUT the harness global');
      assert(I._installHarnessIdentity({ name: 'Nope', avatar: A }) === null,
        'the identity seam installed a fake identity with the harness global unset');
      window.__HR_TEST_HARNESS__ = true;
      /* The ORIGIN half of the rule is deliberately NOT re-asserted here: this
         seam delegates to `HearthriseGate.isHarnessContext`, b224 already proves
         that predicate refuses a player origin, and calling it again with
         'hearthrise.net' fires the gate's intentional production-only
         console.error — which the suite's console gate then reports as a real
         error. One assertion, in the module that owns the rule. */

      const inst = I._installHarnessIdentity({ name: 'Harness Knight', avatar: A });
      assert(inst && inst.userId, 'the simulated identity did not install');
      assert(window._playerAvatar === A,
        'applyAvatar() did not publish the chosen portrait to the _playerAvatar seam');

      window.showTab('combat');
      try { window.stopCombat(); } catch (e) {}
      G.activeMonster = null;
      CS.preview('rat');
      let img = document.querySelector('#arena-player-portrait img');
      assert(img, 'the champion plate has no portrait at all');
      assert(img.getAttribute('src') === A,
        'the preview plate shows "' + String(img.getAttribute('src')).slice(0, 48) + '", not the chosen portrait');

      /* And mid-fight, which is the state the report was made from. */
      window.startCombat('slime');
      CS.renderFight();
      img = document.querySelector('#arena-player-portrait img');
      assert(img && img.getAttribute('src') === A, 'the live plate lost the chosen portrait');

      /* THE DEFECT: change it, and the plate must follow. */
      const stamp = document.createElement('b');
      stamp.className = 'hr-test-dmg';
      document.getElementById('arena-player-portrait').appendChild(stamp);
      I._installHarnessIdentity({ name: 'Harness Knight', avatar: B });
      CS._champion();
      img = document.querySelector('#arena-player-portrait img');
      assert(img, 'the plate lost its <img> on an avatar change');
      assert(img.getAttribute('src') === B,
        'THE b368 DEFECT: after changing portrait the plate still shows the old one ('
        + String(img.getAttribute('src')).slice(0, 48) + ')');
      /* …without wiping the children the b186 write-once guard was protecting. */
      assert(document.querySelector('#arena-player-portrait .hr-test-dmg'),
        'updating the portrait erased the damage-number children — that is what the old guard existed to prevent');
      assert(document.querySelectorAll('#arena-player-portrait img').length === 1,
        'the plate accumulated more than one portrait');
    } finally {
      try { window.stopCombat(); } catch (e) {}
      try { const s = document.querySelector('#arena-player-portrait .hr-test-dmg'); if (s) s.remove(); } catch (e) {}
      try { I._clearHarnessIdentity(); } catch (e) {}
      window._playerAvatar = priorAvatar;
      try { CS._champion(); } catch (e) {}
      restore();
    }
  }),

  () => tryRun('COMBAT-UI-15b (b368): the Fight preview is COMPLETE with nothing equipped, and says Unarmed', () => {
    /* Tyler's live report was an EMPTY stage on a landscape phone — backdrop art
       and nothing else — while wearing no weapon at all. The empty loadout turned
       out not to be the cause (that is COMBAT-UI-19c's legacy-stage race), but a
       naked player is a state exactly one person in the beta is in and no test
       covered, so it gets one now: every row of the stage renders, and the swing
       row names the hands rather than the engine's weapon CLASS.
       MUTATION PROVEN: restore `|| weaponLabel(eq.weaponType) || 'Unarmed'` →
       the label reads "Neutral · 2.40s" and the last assertion fails. */
    const { CS, G, restore } = combatScreen();
    try {
      window.showTab('combat');
      try { window.stopCombat(); } catch (e) {}
      G.activeMonster = null;
      G.equipment = {};
      assert(CS.preview('rat'), 'preview() refused a live monster id while unarmed');
      const need = ['arena-player-name', 'arena-foe-name', 'fs-player-lv', 'fs-foe-lv',
        'fs-player-swing', 'fs-foe-swing', 'fs-player-tiles', 'fs-foe-tiles', 'fs-style', 'fs-weak'];
      for (const id of need) {
        const el = document.getElementById(id);
        assert(el, 'an unarmed preview is missing #' + id + ' — the stage did not finish rendering');
        assert((el.textContent || '').trim() !== '' || el.children.length,
          '#' + id + ' rendered empty while unarmed');
      }
      assert(document.querySelector('#panel-combat .fs-fight'), 'the unarmed preview offers no Fight button');
      const tiles = (document.getElementById('fs-player-tiles').textContent || '');
      assert(/hit/i.test(tiles) && !/NaN|undefined/.test(tiles),
        'the unarmed forecast is not a number: ' + tiles);
      const lbl = (document.querySelector('#fs-player-swing span').textContent || '');
      assert(/unarmed/i.test(lbl), 'empty hands are labelled "' + lbl + '" — a player is not swinging a damage class');
      assert(/\d\.\d\ds/.test(lbl), 'the unarmed swing row quotes no swing time: ' + lbl);
    } finally { restore(); }
  }),

  () => tryRun('COMBAT-UI-19c (b368): a legacy .arena-vs is RECLAIMED — the swing bar cannot be lost on resume', () => {
    /* THE DEFECT TYLER REPORTED, and it was never an animation bug.
       `setupArenaVs()` in legacy.js builds a pre-b365 `.arena-vs` (portrait /
       name / HP / action slot — no level, no swing bar, no forecast tiles, no
       style row) from a 200ms interval. On a COLD LOAD INTO A RUNNING FIGHT it
       wins the race against combat-screens' setup, and `buildStage` used to bail
       on any `.arena-vs` at all — so the entire Fight screen silently degraded
       to the legacy stage for the rest of the session, taking the swing bar with
       it. Every fresh-start probe showed the bar animating perfectly, because a
       fresh start never runs the race.

       This reproduces the race directly: put a legacy-shaped stage in the arena,
       render, and demand the b365/b366 stage back.
       MUTATION PROVEN: restore `if (arena.querySelector(':scope > .arena-vs')) return;`
       in buildStage → every assertion below fails. */
    const { CS, G, restore } = combatScreen();
    try {
      window.showTab('combat');
      window.startCombat('slime');
      const arena = document.querySelector('#panel-combat .combat-arena');
      assert(arena, 'no arena to stage');
      const mine = arena.querySelector(':scope > .arena-vs.fs-stage');
      assert(mine, 'the fight stage is not there to begin with');
      const legacy = document.createElement('div');
      legacy.className = 'arena-vs';
      legacy.style.display = 'none';
      legacy.innerHTML =
        '<div class="arena-side player"><div class="arena-portrait" id="arena-player-portrait"></div>'
        + '<div class="arena-name" id="arena-player-name">You</div>'
        + '<div class="arena-hp-bar"><i id="arena-player-hp"></i></div></div>'
        + '<div class="arena-side foe"><div class="arena-portrait" id="arena-foe-portrait"></div>'
        + '<div class="arena-name" id="arena-foe-name">-</div>'
        + '<div class="arena-hp-bar"><i id="arena-foe-hp"></i></div></div>';
      mine.replaceWith(legacy);
      assert(!document.getElementById('fs-player-swing'),
        'the setup for this test did not actually remove the swing bar');

      CS.renderFight();

      const bar = document.getElementById('fs-player-swing');
      assert(bar, 'THE b368 DEFECT: the swing bar did not come back — the legacy stage kept the screen');
      assert(document.getElementById('fs-player-tiles') && document.getElementById('fs-style'),
        'the stage came back without its forecast tiles / style row — it is still the legacy stage');
      const stages = document.querySelectorAll('#panel-combat .combat-arena > .arena-vs');
      assert(stages.length === 1,
        'there are now ' + stages.length + ' stages in the arena — the ids are duplicated and every write is ambiguous');
      assert(stages[0].classList.contains('fs-stage'), 'the surviving stage is the legacy one');
      /* And the reclaimed bar is a running clock, not just markup. */
      if (!(CS._swing && CS._swing._reduced && CS._swing._reduced())) {
        assert(bar.dataset.swing === 'run',
          'the reclaimed swing bar is not running during a live fight, got ' + bar.dataset.swing);
        assert(/hr-fs-swing/.test(getComputedStyle(bar.querySelector('i')).animationName),
          'the reclaimed swing bar carries no animation');
      }
      /* The log row survived the reclaim — #combat-area must not be orphaned or
         double-wrapped, or renderCombat writes into a node nobody lays out. */
      const area = document.getElementById('combat-area');
      assert(area && area.parentNode && area.parentNode.classList.contains('fs-logrow'),
        'the combat log lost its row wrapper during the reclaim');
      assert(document.querySelectorAll('#panel-combat .fs-logrow').length === 1,
        'the reclaim double-wrapped the combat log');
    } finally { restore(); }
  }),

  () => tryRun('COMBAT-UI-13: the action bar carries Eat with its real food, and a reachable Stop', () => {
    /* Two claims, both measured on the live DOM:
       (1) Eat names the food the player actually holds and the heal it actually
           gives — the control carries live data, which is the Melvor lesson.
       (2) STOP IS REACHABLE. The old sheet hid `#combat-stop` and every
           `.btn-danger` in the arena with `display:none !important` because the
           card header was hidden, so a fight could be started with no visible
           way out. That hack is deleted; this is what stops it coming back. */
    const { G, restore } = combatScreen();
    try {
      window.showTab('combat');
      G.inventory = Object.assign({}, G.inventory, { cooked_shrimp: 12 });
      G.playerMaxHp = 100; G.playerHp = 30;
      window.startCombat('slime');
      const bar = document.getElementById('fs-actionbar');
      assert(bar, 'the fight screen has no action bar');

      const eat = bar.querySelector('#arena-act-player .arena-eat');
      assert(eat, 'no Eat control in the action bar');
      const eatTxt = eat.textContent.replace(/\s+/g, ' ');
      const heals = window.ITEMS.cooked_shrimp.heals;
      assert(/Cooked Shrimp/i.test(eatTxt), 'Eat does not name the food it will spend: ' + eatTxt);
      assert(eatTxt.indexOf('+' + heals) >= 0, 'Eat does not carry the real heal amount (+' + heals + '): ' + eatTxt);
      assert(/12/.test(eatTxt), 'Eat does not carry how many are left: ' + eatTxt);
      const r = eat.getBoundingClientRect();
      assert(r.width > 0 && r.height > 0, 'the Eat control has no box');

      const stop = bar.querySelector('[data-cs-act="stop"]');
      assert(stop, 'THE HIDDEN-FLEE BUG: the fight has no Stop control at all');
      const sr = stop.getBoundingClientRect();
      assert(getComputedStyle(stop).display !== 'none' && sr.width > 0 && sr.height > 0,
        'THE HIDDEN-FLEE BUG IS BACK: the only way out of a fight computes to display:none');
      assert(!document.getElementById('combat-area').contains(stop),
        'Stop is inside the scrolling box — that is how it got 470px below the fold last time');

      // Drops and Loot history are on the bar too, and they are reference, not moves.
      assert(bar.querySelector('[data-arena-act="loot"]'), 'no Drops control on the action bar');
      assert(bar.querySelector('[data-cs-act="history"]'), 'no Loot history control on the action bar');

      // And Stop actually ends the fight and returns the camera to the hub.
      stop.click();
      assert(G.activeMonster === null, 'Stop did not end the fight');
      assert(document.getElementById('panel-combat').dataset.combatView === 'table',
        'after a fight ends the camera must land somewhere real, not on an empty stage');
    } finally { restore(); }
  }),

  () => tryRun('COMBAT-UI-21: the metrics strip refuses to quote a rate it has not measured', () => {
    /* THE HARD GATE (spec §6, raised in CONFLICTS.md): design will not
       advertise a number the server pays as zero. A long fight — one whose
       first kill has not landed — pays nothing yet, and the strip must SAY so
       rather than extrapolate a DPS figure into an XP/min promise.
       MUTATION PROVEN: derive the strip from forecast().xpHr instead of the
       ledger and the second assertion fails, because a Green Dragon at level 3
       has a beautiful theoretical rate and pays nothing for twenty minutes. */
    const CS = window.HearthriseCombatScreens;
    assert(CS && CS._ledger, 'the ledger seam is not published');
    const { G, restore } = combatScreen();
    try {
      window.showTab('combat');
      window.startCombat('slime');
      CS.renderFight();
      const strip = document.getElementById('fs-metrics');
      assert(strip, 'no metrics strip on the stage');
      const early = strip.textContent.replace(/\s+/g, ' ');
      assert(/measuring/i.test(early),
        'a fight one second old already quotes a rate — that rate is fiction: ' + early);
      assert(!/\/min/.test(early), 'a per-minute rate was quoted before a single credit landed: ' + early);
      /* The one thing it may always say is the SURVIVAL span, because that
         comes from the shared estimator rather than from a promise about pay. */
      assert(/last/i.test(early), 'the strip dropped the survival clause: ' + early);
    } finally { restore(); }
  }),

  () => tryRun('COMBAT-UI-23: the session tally is its own row, one line, and never lands on a control', () => {
    /* THE DEFECT THIS EXISTS TO STOP (live on b491, 1568x558, screenshot-proven).
       `#fs-session` carries BOTH `fs-metrics` and `fs-session`, so it inherited
       `#panel-combat .fs-metrics { grid-row: 9 }` from the per-fight strip and
       the two readouts were assigned THE SAME CELL of the stage grid. They
       printed character-over-character — the live capture reads
       "S6s:XPvo:KP/h2-kHbrfirrGift" — and at 922x423 the tally wrapped to two
       lines and pushed through the strip above it into the action bar.

       Four claims, all measured on the live DOM rather than read off the sheet,
       because the whole bug was two rules that each looked correct alone:
        (1) the two strips occupy DIFFERENT grid rows;
        (2) their boxes do not intersect — and neither does the tally's box
            intersect the action bar or the Eat button (the b221 bounding-box
            idiom; a grid-row assertion alone would pass a layout that overlaps
            for some other reason);
        (3) the tally is ONE LINE. Its height is bounded by construction
            (`nowrap` flex row), which is what makes it unable to grow into the
            controls at any viewport — a measurement, not a breakpoint;
        (4) the ink ladder is LIVE. theme-cozy.css paints
            `#panel-combat *` with `color: var(--ink) !important`, which is why
            the b487 handoff reported these spans "rendering identical to body
            text": they were being overpainted. If that blanket ever wins again,
            rubric == figure and this fails.
       MUTATION PROVEN: delete `.fs-metrics.fs-session { grid-row: 10 }` and (1)
       and (2) fail together; drop the `!important` colour reclaim and (4) fails. */
    const CS = window.HearthriseCombatScreens;
    assert(CS && CS._session, 'the session-tally seam is not published');
    const { G, restore } = combatScreen();
    const panel = document.getElementById('panel-combat');
    const prevView = panel ? panel.dataset.combatView : null;
    try {
      window.showTab('combat');
      window.startCombat('slime');
      /* THE LONGEST HONEST STRING, OR THIS MEASURES NOTHING. Two seeds, and
         the second one is the half a first draft of this guard forgot: without
         a BESTIARY delta `perMonster` is empty, `.fs-sess-foes` never renders,
         and the widest clause on the strip — the one the whole overflow design
         is about — is absent from the layout being asserted. Proven: the
         "wrap" assertion below could not be made to fail until the foe roll
         was seeded. */
      /* ORDER MATTERS AND IT IS NOT OBVIOUS: the accumulator snapshots its
         per-monster BASELINE on its first poll, so a bestiary seeded before
         that poll is baselined away and the delta is zero. Poll once to fix
         the baseline, THEN seed, THEN poll again. */
      CS._session.poll();
      G.bestiary = G.bestiary || {};
      Object.keys(window.MONSTERS || {}).slice(0, 4).forEach((id, i) => {
        G.bestiary[id] = G.bestiary[id] || { kills: 0 };
        G.bestiary[id].kills = (G.bestiary[id].kills || 0) + (40 - i * 7);
      });
      /* Fold ONE settled receipt so the strip renders live rates. The version
         is unique so the accumulator's dedupe cannot swallow it. */
      G.lastOfflineSummary = {
        serverAuthoritative: true, version: Date.now(), at: Date.now(),
        awayMs: 1800000, gainedGold: 30115, gainedXp: 96550,
        gainedKills: 141, gainedItems: 44, levelUps: [],
      };
      CS._session.poll();
      CS.setView('fight');

      const sess = document.getElementById('fs-session');
      const mtr = document.getElementById('fs-metrics');
      const bar = document.getElementById('fs-actionbar');
      assert(sess && mtr && bar, 'the fight stage lost one of its bottom rows');
      assert(sess.classList.contains('fs-session'), 'the tally lost its own class');

      // (1) different rows
      const rowS = getComputedStyle(sess).gridRowStart;
      const rowM = getComputedStyle(mtr).gridRowStart;
      assert(rowS !== rowM,
        'THE OVERPRINT IS BACK: the session tally and the metrics strip share grid row ' + rowS);

      // (2) no box intersects another
      const hits = (a, b) => {
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return x > 0.5 && y > 0.5;
      };
      const rs = sess.getBoundingClientRect();
      assert(rs.width > 0 && rs.height > 0, 'the session tally has no box');
      assert(!hits(rs, mtr.getBoundingClientRect()),
        'the session tally is drawn on top of the per-fight metrics strip');
      assert(!hits(rs, bar.getBoundingClientRect()),
        'the session tally overlaps the action bar');
      const eat = document.querySelector('#arena-act-player .arena-eat');
      if (eat) {
        assert(!hits(rs, eat.getBoundingClientRect()),
          'the session tally is drawn over the Eat control');
      }

      /* (3) exactly one line — asserted BOTH ways on purpose. The measurement
         only catches a wrap the CURRENT viewport happens to produce (at
         1568x558 the string fits even as a block, so a height check alone
         passes a broken rule); the mechanism check holds at every size. */
      const cs = getComputedStyle(sess);
      assert(cs.display === 'flex' && cs.flexWrap === 'nowrap' && cs.whiteSpace === 'nowrap',
        'the tally lost its one-line bound (display ' + cs.display + ', wrap ' + cs.flexWrap
        + ', white-space ' + cs.whiteSpace + ') — it can grow into the action bar again');
      const lh = parseFloat(cs.lineHeight) || 16;
      assert(rs.height <= lh * 1.6,
        'the session tally wrapped to a second line (' + Math.round(rs.height) + 'px on a '
        + Math.round(lh) + 'px line) — it must stay one line so it cannot grow into the controls');

      // (4) the ink ladder survived the theme blanket
      const head = sess.querySelector('.fs-sess-head');
      const figure = sess.querySelector('.fs-sess-stat b');
      assert(head && figure, 'the tally lost its rubric or its figures');
      const cHead = getComputedStyle(head).color;
      const cFig = getComputedStyle(figure).color;
      assert(cHead !== cFig,
        'THE STRIP IS FLAT AGAIN: rubric and figure both compute to ' + cHead
        + ' — a theme blanket is overpainting the tally\'s colour roles');

      /* The separators are drawn by CSS, so the DOM must still carry real word
         boundaries or the accessible text reads "Session180,065 XP/h". */
      assert(/Session\s/.test(sess.textContent),
        'the clauses have no whitespace between them: ' + sess.textContent.slice(0, 60));
    } finally {
      /* Put the CAMERA back too. `setView('fight')` writes an attribute that
         the 200ms tick only corrects on its next pass, so without this the
         next synchronous test inherits a fight stage that is laid out but has
         no fight — cheap to restore, and cross-test contamination through a
         dataset attribute is invisible when it bites. */
      if (panel) {
        if (prevView) panel.dataset.combatView = prevView;
        else delete panel.dataset.combatView;
      }
      restore();
    }
  }),

  () => tryRun('COMBAT-UI-22: only real combat drops reach "Drops this fight"', () => {
    /* Tyler, b370, twice. First: "we can see the stuff your workers are
       collecting as well... We should remove that." Then, after the worker
       filter shipped: "when you are in combat and buying items from the shop
       (seeds or equipment) it is also mentioned under 'drops this fight'.
       Maybe it would also be the same for items bought in the market."

       Both are the same bug. The rail measured loot as a positive inventory
       delta, so EVERY credit landing mid-fight was claimed as a drop. The fix
       is an ALLOWLIST — the one combat-drop credit in the game declares itself
       and nothing else does — which is why this test exercises three unrelated
       non-combat sources and expects no code to exist for any of them.

       MUTATION PROVEN: drop the `Math.min(run.declared[id]...)` intersection in
       loot() and every non-combat assertion below fails at once; drop the
       declaration in COMBAT_FX.addItem and the real-drop assertion fails. */
    const CS = window.HearthriseCombatScreens;
    assert(CS && CS._ledger, 'the ledger seam is not published');
    const { restore } = combatScreen();
    try {
      window.showTab('combat');
      window.startCombat('slime');
      window.__hrCombatCredits = {};
      CS._ledger.sample(true);                        // establish the baseline

      /* Three non-combat credits, each the way its own system pays: a worker
         haul, a shop purchase, a market collect. None of them declares — that
         is the entire point of an allowlist. */
      window.addItem('normal_log', 7);                // worker
      window.addItem('potato_seed', 4);               // shop purchase
      window.addItem('copper_ore', 9);                // market buy

      /* ...and one REAL drop, credited the way the combat loop credits it. */
      window.HearthriseCombatSim.fx.addItem('slime_gel', 3);
      CS._ledger.sample(true);

      const rows = CS._ledger.loot();
      const seen = (id) => rows.filter((r) => r.id === id)[0];
      assert(!seen('normal_log'), 'a worker haul is claimed as combat loot: ' + JSON.stringify(rows));
      assert(!seen('potato_seed'), 'a SHOP PURCHASE is claimed as combat loot: ' + JSON.stringify(rows));
      assert(!seen('copper_ore'), 'a MARKET BUY is claimed as combat loot: ' + JSON.stringify(rows));
      assert(seen('slime_gel') && seen('slime_gel').qty === 3,
        'the real drop was lost by the attribution filter: ' + JSON.stringify(rows));

      /* A non-combat credit of the SAME item as a live drop must not inflate
         the count — the rail shows the drop, not the shipment. */
      window.addItem('slime_gel', 50);                // bought 50 on the market
      CS._ledger.sample(true);
      assert(seen('slime_gel') && CS._ledger.loot().filter((r) => r.id === 'slime_gel')[0].qty === 3,
        'a market buy inflated a real drop count: ' + JSON.stringify(CS._ledger.loot()));

      /* And a drop declared BETWEEN fights must not be attributed to the next
         one — the stale-bucket bug. */
      window.stopCombat();
      window.HearthriseCombatSim.fx.addItem('slime_gel', 5, { away: false });
      CS._ledger.sample(true);                        // no fight: drains, keeps nothing
      window.startCombat('slime');
      CS._ledger.sample(true);
      assert(CS._ledger.loot().length === 0,
        'a drop declared between fights leaked into the next fight: '
        + JSON.stringify(CS._ledger.loot()));
    } finally {
      try { window.stopCombat(); } catch (e) {}
      try { delete window.__hrCombatCredits; } catch (e) {}
      restore();
    }
  }),

  () => tryRun('COMBAT-UI-24: a real AWAY replay declares nothing to the live rail', () => {
    /* The away replay runs the SAME resolveKill through the SAME effect object
       as live play, so the declaration that makes the rail work is exactly the
       thing that would let a night's accrual be dumped into whatever fight the
       player starts on return. simulateAwayCombat overrides the binding with a
       silent one; this drives the real away path and proves it.
       MUTATION PROVEN: delete the `addItem` override in simulateAwayCombat's
       ctx.fx and this goes red with a night's drops declared. */
    assert(typeof window.simulateAwayCombat === 'function', 'the away combat seam is missing');
    const snap = snapshotG();
    try {
      /* b492 — STATE THE FIGHTER, do not inherit one. The vacuity check below
         ("the away replay did no work") used to lean on the ambient boot state
         happening to carry the fresh-G literal's starter sword and 1154 hitpoint
         xp. That accident is gone — under the blob-retire capstone `loadLocal()`
         now forgets every server-of-record field, so an un-hydrated harness
         character is unarmed and level 1, and six hours of away combat against
         it can legitimately produce nothing. A vacuity check that depends on
         luck is the thing it was written to prevent. */
      window.G.skills = Object.assign({}, window.G.skills,
        { attack: 300000, strength: 300000, defense: 300000, hitpoints: 300000 });
      window.G.equipment = Object.assign({}, window.G.equipment, { weapon: 'bronze_sword' });
      window.G.playerMaxHp = window.levelFromXp(300000);
      window.G.playerHp = window.G.playerMaxHp;
      window.G.activeMonster = 'slime';
      window.G.monsterHp = window.MONSTERS.slime.hp;
      window.__hrCombatCredits = {};
      const out = window.simulateAwayCombat(6, false, Date.now());
      assert(out && out.kills > 0,
        'the away replay did no work — the test proves nothing (kills=' + (out && out.kills) + ')');
      assert(Object.keys(window.__hrCombatCredits).length === 0,
        'an away replay declared drops to the live fight rail: '
        + JSON.stringify(window.__hrCombatCredits));
    } finally {
      try { delete window.__hrCombatCredits; } catch (e) {}
      restoreG(snap);
    }
  }),

  () => tryRun('COMBAT-UI-23: a REAL kill declares its drops end to end', () => {
    /* COMBAT-UI-22 drives the effect binding directly, which proves the filter
       but not the WIRING. This one runs a real kill through the real loop —
       resolveKill -> call(fx,'addItem',...) -> COMBAT_FX.addItem -> the rail —
       on a monster whose drop table is guaranteed, so the declaration either
       arrives by the genuine route or this test goes red. Without it, someone
       could delete the `ctx` argument in combat-sim.js and every drop would
       silently stop reaching the rail with COMBAT-UI-22 still green. */
    const CS = window.HearthriseCombatScreens;
    assert(CS && CS._ledger, 'the ledger seam is not published');
    const { restore } = combatScreen();
    const prevMon = window.MONSTERS.slime;
    try {
      /* A foe that always pays, so the assertion is about wiring, not luck. */
      window.MONSTERS.slime = Object.assign({}, prevMon, {
        hp: 1, gp: [0, 0], drops: [{ id: 'slime_gel', ch: 1 }],
      });
      window.showTab('combat');
      window.startCombat('slime');
      window.__hrCombatCredits = {};
      CS._ledger.sample(true);
      const before = (window.G.inventory || {}).slime_gel || 0;

      window.killMonster(window.MONSTERS.slime);
      CS._ledger.sample(true);

      const gained = ((window.G.inventory || {}).slime_gel || 0) - before;
      assert(gained > 0, 'the kill credited no drop at all — the test foe is wrong, not the rail');
      const row = CS._ledger.loot().filter((r) => r.id === 'slime_gel')[0];
      assert(row && row.qty === gained,
        'a real kill\'s drop did not reach the rail through the live path — the declaration is unwired: '
        + JSON.stringify(CS._ledger.loot()));
    } finally {
      window.MONSTERS.slime = prevMon;
      try { window.stopCombat(); } catch (e) {}
      try { delete window.__hrCombatCredits; } catch (e) {}
      restore();
    }
  }),

  // gold-arm: W.hire()'s debit is gated by clientMayWriteRecordField (switch-OFF
  // position); the stamp makes the affordability read known.
  () => tryRunRestampingBalance('WORKER-LEDGER-1: worker hauls are tallied per worker and surfaced on the crew list', () => {
    /* The other half of the same ruling: the data leaves the fight rail, so it
       needs a home. It is a per-worker lifetime tally on the worker record —
       which rides G.workers into the save by default — plus one derived
       summary line under the crew. No new screen.
       MUTATION PROVEN: drop the recordCollect() call in accrueWorker and both
       the tally and the rendered line go to zero. */
    const W = window.HearthriseWorkers, H = window.HearthriseHomestead;
    assert(W && H && typeof W.ledger === 'function', 'the worker ledger seam is not published');
    const G = window.G;
    const IA = window.HearthriseItemAuthority;
    const saved = {
      homestead: G.homestead, workers: G.workers, gold: G.gold,
      inv: JSON.parse(JSON.stringify(G.inventory || {})), skills: G.skills,
    };
    /* The client-side lifetime ledger is a display tally fed by accrueWorker, which
       is a no-op once the crew is server-owned. This guards the flag-OFF (revert)
       path where the client still banks + tallies locally. */
    const flagBefore = IA && IA.WORKER_PRODUCTION_SERVER_BACKED;
    try {
      if (IA) IA.WORKER_PRODUCTION_SERVER_BACKED = false;
      G.homestead = { tier: 1 };
      G.workers = { hired: [] }; G.gold = 10000;
      stampBalanceLikeLoad(G);   // armed: W.hire() reads gold via canAfford
      G.skills = Object.assign({}, G.skills, { woodcutting: 100000 });
      const w = W.hire();
      assert(w, 'hire should succeed');
      assert(W.assign(w.uid, 'woodcutting', 'normal_tree') === true, 'assign should succeed');
      assert(W.ledger().total === 0, 'a worker who has banked nothing must tally nothing');

      w.lastCollect = Date.now() - 3600000;
      W.accrueAll(false);

      const L = W.ledger();
      /* b497 — the ledger must record THE WHOLE HAUL, so the expectation is the
         haul, computed from the PLAYER's side of the ratio (an active perkless
         hour at this node x the worker's efficiency). A hand-tuned floor was
         what this line used to be, and it had to be edited every time the rate
         moved — which is precisely how a rate that had silently moved 1.60x
         went unnoticed for four builds. */
      const _node = (window.TREES || []).find((t) => t.id === 'normal_tree');
      const _ticks = Math.floor(3600000 / (window.pacedActionMs(_node.ms) / W.eff({ xp: 0 })));
      const _expected = Math.floor(_ticks * (_node.qty[0] + _node.qty[1]) / 2);
      assert(L.total === _expected,
        'the crew ledger did not record the whole haul: ' + L.total + ' (expected ' + _expected + ')');
      assert(L.byItem.normal_log === L.total, 'the ledger lost the item breakdown: ' + JSON.stringify(L.byItem));
      assert(L.workers.length === 1 && L.workers[0].total === L.total,
        'the per-worker tally disagrees with the crew total');
      /* `>=`, not `===`: the session figure is crew-wide and survives a worker
         being dismissed (or, here, an earlier test's throwaway crew), which is
         the honest reading of "what have my workers brought in today". */
      assert(L.session.total >= L.total, 'the session tally must count this sitting\'s haul: '
        + L.session.total + ' < ' + L.total);
      /* Persistence: it lives on the worker record, so it is inside the save
         blob by default. Nothing here may be added to NO_SYNC. */
      assert((w.collected && w.collected.normal_log) > 0, 'the tally must live on the worker record');
      assert((window.NO_SYNC || []).indexOf('workers') < 0, 'G.workers must never be denylisted from the snapshot');

      /* And it must be VISIBLE — a ledger nobody can read is not a ledger. */
      const host = document.createElement('div');
      document.body.appendChild(host);
      try {
        W.renderInto(host);
        const txt = host.textContent.replace(/\s+/g, ' ');
        assert(/gathered by your workers/i.test(txt), 'no crew summary line rendered: ' + txt);
        assert(/gathered/.test(txt) && new RegExp(L.total.toLocaleString()).test(txt),
          'the summary line does not show the lifetime total: ' + txt);
      } finally { host.remove(); }
    } finally {
      if (IA) IA.WORKER_PRODUCTION_SERVER_BACKED = flagBefore;
      G.homestead = saved.homestead; G.workers = saved.workers; G.gold = saved.gold;
      G.inventory = saved.inv; G.skills = saved.skills;
    }
  }),

  () => tryRun('MON-TAX-1: every monster has a valid class and a resolvable weakness profile', () => {
    const T = window.HearthriseMonsterClasses;
    assert(T && typeof T.audit === 'function', 'the taxonomy must be published on window');
    const problems = T.audit(window.MONSTERS);
    assert(problems.length === 0, problems.length + ' taxonomy problems: ' + problems.slice(0, 5).join(' | '));
  }),

  () => tryRun('MON-TAX-2: `neutral` is retired — no monster opts out of the weapon triangle', () => {
    const bad = Object.keys(window.MONSTERS)
      .filter((id) => !window.MONSTERS[id].weaponWeak || window.MONSTERS[id].weaponWeak === 'neutral');
    assert(bad.length === 0, 'monsters still without a real weapon weakness: ' + bad.join(', '));
    /* And every one of the four weapon styles must have somewhere to go, or a
       whole build is the wrong build. */
    const axes = ['sword', 'hammer', 'ranged', 'magic'];
    axes.forEach((w) => {
      const n = Object.keys(window.MONSTERS).filter((id) => window.MONSTERS[id].weaponWeak === w).length;
      assert(n >= 5, 'only ' + n + ' monsters answer ' + w + ' — that style has nowhere to go');
    });
  }),

  () => tryRun('MON-TAX-3: no monster overrides more than ONE axis', () => {
    const T = window.HearthriseMonsterClasses;
    const bad = Object.keys(window.MONSTERS)
      .filter((id) => (window.MONSTERS[id].overrideAxes || []).length > 1);
    assert(bad.length === 0, 'two-override monsters (rejected in review): ' + bad.join(', '));
    /* And the overrides must be REAL — a taxonomy where nothing ever diverges
       teaches eleven sentences and no exceptions, which is the boring failure. */
    const n = Object.keys(window.MONSTERS).filter((id) => (window.MONSTERS[id].overrideAxes || []).length).length;
    assert(n >= 10, 'only ' + n + ' monsters teach an exception to their class rule');
    assert(typeof T.profileOf === 'function', 'the profile resolver must be published');
  }),

  () => tryRun('MON-TAX-4: every tier band is populated from at least 8 classes', () => {
    for (let t = 1; t <= 6; t++) {
      const ids = Object.keys(window.MONSTERS).filter((id) => window.MONSTERS[id].tier === t);
      assert(ids.length >= 8, 'tier ' + t + ' has only ' + ids.length + ' monsters');
      const classes = new Set(ids.map((id) => window.MONSTERS[id].cls));
      assert(classes.size >= 8, 'tier ' + t + ' draws from only ' + classes.size
        + ' classes — a build can run out of somewhere to go');
    }
  }),

  () => tryRun('MON-DROP-1: every drop references an item that exists', () => {
    const bad = [];
    Object.keys(window.MONSTERS).forEach((id) => {
      (window.MONSTERS[id].drops || []).forEach((d) => {
        if (!window.ITEMS[d.id]) bad.push(id + ' -> ' + d.id);
        if (!(d.ch > 0 && d.ch <= 1)) bad.push(id + ' -> ' + d.id + ' chance ' + d.ch);
      });
    });
    assert(bad.length === 0, 'broken drops: ' + bad.slice(0, 6).join(', '));
    /* The currency guard, restated for the new rows: PvE must never mint the
       IAP-only bond. */
    const mints = Object.keys(window.MONSTERS).filter((id) =>
      (window.MONSTERS[id].drops || []).some((d) => d.id === 'hearth_token' || d.id === 'muster_seal'));
    assert(mints.length === 0, 'monsters minting a protected currency: ' + mints.join(', '));
  }),

  () => tryRun('MON-NEUT-1: the retired `neutral` drop bonus was re-homed, not deleted', () => {
    const C = window.HearthriseCore && window.HearthriseCore.combat;
    assert(C && typeof C.weaknessInfo === 'function', 'core combat must expose weaknessInfo');
    /* The 7 monsters that used to be `neutral` must still pay x1.15, or this
       change is a silent 13% drop nerf to the game's capstone. */
    const GRANDFATHERED = ['slime', 'small_wolf', 'dark_wizard', 'warlock', 'archmage', 'lesser_demon', 'dragon'];
    GRANDFATHERED.forEach((id) => {
      const m = window.MONSTERS[id];
      assert(m, id + ' must still exist');
      const info = C.weaknessInfo(m, { weaponType: 'sword' });
      assert(Math.abs(info.dropMult - 1.15) < 1e-9,
        id + ' lost its drop bonus (got ' + info.dropMult + ') — that is a 13% nerf nobody asked for');
    });
    /* And a monster that never had it must not gain it. */
    const plain = C.weaknessInfo(window.MONSTERS.goblin, { weaponType: 'magic' });
    assert(plain.dropMult === 1, 'goblin must not have acquired a drop bonus');
    /* Matching the weakness still pays damage + accuracy. */
    const matched = C.weaknessInfo(window.MONSTERS.goblin, { weaponType: 'sword' });
    assert(matched.matched === true && matched.damageMult > 1,
      'matching a weapon weakness must still pay');
  }),

  /* ── BANE-1 (b358 QA). WRITTEN BECAUSE THE GATE DID NOT NOTICE.
     Mutation-proved: with `baneMult` hard-wired to 1 in weaknessInfo — i.e.
     bane gear deleted from the game outright — the suite passed 761/761. With
     `baneMultFor`'s MAX_BANE_MULT ceiling removed — i.e. the fuse gone — it
     passed 761/761 again. The whole b357 bane primitive, and the half of the
     hand-merged `weaknessInfo` that carries it, shipped with ZERO coverage.

     Four claims, each of which one of those mutations breaks:
       (a) bane PAYS against the class it names;
       (b) it pays NOTHING against every other class (the scope is the fuse);
       (c) an oversized `mult` is clamped by the FORMULA, not by the item table
           (src/core/bane.js's stated invariant — a magnitude in a data row is a
           magnitude an author gets wrong);
       (d) weapon-weakness x bane is clamped to MAX_COMBINED_DAMAGE_MULT, so a
           third factor cannot quietly stack past the stated ceiling.
     Read through `equipmentStats` + `weaknessInfo`, which is the ONE expression
     the live tick and the Edge accrual both call — so this guards away nights
     as well as awake ones. */
  () => tryRun('BANE-1: bane gear pays its class, only its class, and never past the ceiling', () => {
    const C = window.HearthriseCore && window.HearthriseCore.combat;
    const B = window.HearthriseCore && window.HearthriseCore.bane;
    assert(C && B, 'core must expose combat + bane');
    const ITEMS = window.ITEMS; const MONSTERS = window.MONSTERS;

    const baneIds = Object.keys(ITEMS).filter((id) => ITEMS[id].bane);
    assert(baneIds.length >= 5, 'expected the approved bane weapons in the catalogue, got ' + baneIds.length);

    const classOf = (m) => B.normalizeClass(m.class) || B.normalizeClass(m.family);

    baneIds.forEach((id) => {
      const named = B.normalizeClass((Array.isArray(ITEMS[id].bane) ? ITEMS[id].bane[0] : ITEMS[id].bane).class);
      assert(named, id + ' names a class outside the eleven-class taxonomy');
      const eq = C.equipmentStats({ weapon: id }, ITEMS);

      const inClass = Object.keys(MONSTERS).filter((mid) => classOf(MONSTERS[mid]) === named);
      assert(inClass.length > 0, id + ' names ' + named + ', which no monster belongs to');

      // (a) it pays inside its class...
      inClass.forEach((mid) => {
        const info = C.weaknessInfo(MONSTERS[mid], eq);
        assert(info.baneMult > 1, id + ' paid no bane against ' + mid + ' (' + named + ')');
        assert(info.baneClass === named, id + ' vs ' + mid + ' reported baneClass ' + info.baneClass);
      });

      // (b) ...and nowhere else.
      Object.keys(MONSTERS).forEach((mid) => {
        if (classOf(MONSTERS[mid]) === named) return;
        const info = C.weaknessInfo(MONSTERS[mid], eq);
        assert(info.baneMult === 1 && info.baneClass === null,
          id + ' leaked bane onto ' + mid + ' (' + classOf(MONSTERS[mid]) + '): ' + info.baneMult);
      });
    });

    // (c) the ceiling is the FORMULA's, not the table's.
    assert(B.baneMultFor('undead', { undead: 1e9 }) === B.MAX_BANE_MULT,
      'a forged bane mult was not clamped to MAX_BANE_MULT');
    // ...and five pieces naming one class are indexed, not multiplied.
    const stacked = C.equipmentStats(
      { weapon: baneIds[0], helmet: baneIds[0], body: baneIds[0], gloves: baneIds[0], boots: baneIds[0] }, ITEMS);
    const oneClass = B.normalizeClass((Array.isArray(ITEMS[baneIds[0]].bane)
      ? ITEMS[baneIds[0]].bane[0] : ITEMS[baneIds[0]].bane).class);
    assert(B.baneMultFor(oneClass, stacked.bane) <= B.MAX_BANE_MULT,
      'five bane pieces of one class compounded instead of taking the best');

    // (d) weapon-weakness x bane is clamped to the combined ceiling, and the
    //     intended best case (1.20 x 1.40) actually reaches it.
    const forged = Object.assign({}, ITEMS);
    forged.__qa_bane__ = { n: 'QA', weaponType: 'hammer', bane: [{ class: 'undead', mult: 1e9 }] };
    const feq = C.equipmentStats({ weapon: '__qa_bane__' }, forged);
    const undeadHammer = Object.keys(MONSTERS).find((mid) =>
      classOf(MONSTERS[mid]) === 'undead' && MONSTERS[mid].weaponWeak === 'hammer');
    assert(undeadHammer, 'expected at least one hammer-weak Undead to test the combined clamp');
    const combo = C.weaknessInfo(MONSTERS[undeadHammer], feq);
    assert(Math.abs(combo.damageMult - B.MAX_COMBINED_DAMAGE_MULT) < 1e-9,
      'weapon-weakness x bane must clamp to MAX_COMBINED_DAMAGE_MULT, got ' + combo.damageMult);
    // and an unarmed loadout is inert either way
    const bare = C.weaknessInfo(MONSTERS[undeadHammer], C.equipmentStats({}, ITEMS));
    assert(bare.baneMult === 1 && bare.damageMult === 1,
      'an unarmed loadout must earn neither weakness nor bane');
  }),

  /* ══ ELEMENTS v1 — elemental weapon enchants (bane.js's twin) ══════════════
     Eight claims, each mutation-provable. Read through the ONE expression the
     live tick and the Edge accrual both call (equipmentStats → weaknessInfo),
     so away nights are guarded with awake ones. */
  /* ── b432 REGRESSION: RUNECRAFTING OWNS EVERY RUNE IN THE GAME ────────────
     Tyler: "it doesn't look like you ever fixed runecrafting to make more
     sense." The centre of that was this: Elements v1 shipped the three runes
     the game ACTUALLY uses as CRAFTING recipes at level 25, in a Crafting lane
     labelled "Runes", while the skill named Runecrafting made a different set
     of runes entirely — so the word "rune" pointed at two skills and a player
     could not tell which one to open.

     This test used to encode that arrangement ("bind_ember_rune must exist at
     Crafting 25"), which is why it went red on the fix — it was the contract,
     and the contract was wrong. It now asserts the ruling, and the ownership
     half is written as a SEARCH ACROSS EVERY SKILL rather than a lookup in one:
     asserting the recipe is in Runecrafting would still pass if a copy were
     also left in Crafting, and a duplicate recipe is precisely the failure this
     whole change exists to remove. */
  () => tryRun('ELEM-1/b432: Runecrafting owns every rune — the three binds live there at 25, nowhere else, and lane into Weapon Enchants', () => {
    const ITEMS = window.ITEMS;
    const EL = window.HearthriseCore && window.HearthriseCore.elements;
    assert(EL && typeof EL.runeElement === 'function', 'core must expose the elements module');
    ['ember', 'frost', 'poison'].forEach((e) => {
      const ess = ITEMS[e + '_essence']; const rune = ITEMS[e + '_rune'];
      assert(ess && ess.tag === 'reagent', e + '_essence must exist as a reagent');
      assert(rune && rune.tag === 'rune' && rune.element === e, e + '_rune must carry element:"' + e + '"');
      assert(!rune.bop && !ess.bop, 'essences and runes must be tradeable (no bop)');
      /* runeElement reads the element off the rune, and null for a non-rune. */
      assert(EL.runeElement(e + '_rune', ITEMS) === e, 'runeElement(' + e + '_rune) must be ' + e);
      assert(EL.runeElement('bronze_sword', ITEMS) === null, 'runeElement of a non-rune must be null');
    });
    const R = window.HearthriseRecipes || window;
    const ALL = window.ARTISAN_RECIPES || {};
    ['ember', 'frost', 'poison'].forEach((e) => {
      /* WHICH SKILLS MAKE THIS RUNE? Exactly one, and it is Runecrafting. */
      const makers = Object.keys(ALL).filter((s) => (ALL[s] || []).some((r) => r.output === e + '_rune'));
      assert(makers.length === 1 && makers[0] === 'runecrafting',
        e + '_rune must be made by RUNECRAFTING and by nothing else — made by: '
        + (makers.join(', ') || '(nothing)'));
      const rec = ALL.runecrafting.find((r) => r.output === e + '_rune');
      assert(rec && rec.req === 25, 'bind_' + e + '_rune must sit at Runecrafting 25 (the Crafting 25 gate, moved not raised)');
      /* The essence inputs are UNCHANGED by the move — nobody's supply chain
         shifted — and the blank is the new common grammar of the bench. */
      assert(rec.inputs && rec.inputs[e + '_essence'] === 4 && rec.inputs.magic_essence === 1,
        'bind_' + e + '_rune must keep its {' + e + '_essence:4, magic_essence:1} cost across the move');
      assert(rec.inputs.rune_blank > 0,
        'bind_' + e + '_rune must be bound onto a rune_blank — every rune on this bench starts as a blank');
      if (typeof R.recipeCategory === 'function') {
        assert(R.recipeCategory('runecrafting', rec, ITEMS) === 'enchant',
          'bind_' + e + '_rune must lane into Weapon Enchants, got ' + R.recipeCategory('runecrafting', rec, ITEMS));
      }
    });
    /* THE TWO LANES BOTH FILL, and nothing is stranded in either skill. An
       empty declared lane is a dead tab; an uncategorized recipe is invisible. */
    if (typeof R.categorizeRecipes === 'function') {
      const rc = R.categorizeRecipes('runecrafting');
      assert(rc.uncategorized.length === 0,
        'a Runecrafting recipe landed in no lane: ' + rc.uncategorized.map((r) => r.id).join(', '));
      const laneOf = (k) => (rc.groups.find((g) => g.key === k) || { recipes: [] }).recipes;
      assert(laneOf('enchant').length === 3, 'Weapon Enchants must hold exactly the three element runes, got ' + laneOf('enchant').length);
      assert(laneOf('staff').length >= 11, 'Staff Runes must still hold the whole air→blood ladder, got ' + laneOf('staff').length);
      /* BOTH lanes must actually RENDER — `groups` drops an empty key, so two
         groups is the proof that the strip is a real choice and not a label. */
      assert(rc.groups.length === 2,
        'the Runecrafting strip must show both lanes, got: ' + rc.groups.map((g) => g.label).join(' | '));
      assert(R.categorizeRecipes('crafting').uncategorized.length === 0,
        'moving the runes out must not strand a crafting recipe uncategorized');
    }
    /* And Crafting no longer declares the lane it no longer fills. */
    assert(!(window.ARTISAN_CATEGORIES.crafting || []).some((d) => d.key === 'runes'),
      'crafting still declares a Runes tab it can never fill — an empty tab is a dead end');
  }),

  () => tryRun('ELEM-2: a matched enchant pays x1.15 through weaknessInfo; immune/neutral pay x1.00 (mutation-proved by flipping elementWeak)', () => {
    const C = window.HearthriseCore.combat;
    const EL = window.HearthriseCore.elements;
    const ITEMS = window.ITEMS; const MONSTERS = window.MONSTERS;
    /* An ember-weak foe and an ember-immune foe. imp is a Demon (ember-immune);
       plague_swarm/plant/mammal carry ember weakness — use one from the table. */
    const emberWeak = Object.keys(MONSTERS).find((id) => MONSTERS[id].elementWeak === 'ember');
    const emberImmune = Object.keys(MONSTERS).find((id) => (MONSTERS[id].elementImmune || []).indexOf('ember') >= 0);
    assert(emberWeak && emberImmune, 'need an ember-weak and an ember-immune monster to test');
    /* A weapon-slot enchant is stamped ONLY when the weapon slot holds a weapon. */
    const eqOn = C.equipmentStats({ weapon: 'bronze_sword' }, ITEMS, { weapon: 'ember' });
    assert(eqOn.element === 'ember', 'equipmentStats must stamp eq.element from the enchant on a real weapon');
    const eqBare = C.equipmentStats({}, ITEMS, { weapon: 'ember' });
    assert(eqBare.element === null, 'an enchant on an empty weapon slot must NOT stamp an element');

    const infoWeak = C.weaknessInfo(MONSTERS[emberWeak], eqOn);
    assert(Math.abs(infoWeak.elementMult - 1.15) < 1e-9 && infoWeak.elementMatched === true,
      'ember enchant vs ember-weak must pay x1.15, got ' + infoWeak.elementMult);
    const infoImmune = C.weaknessInfo(MONSTERS[emberImmune], eqOn);
    assert(infoImmune.elementMult === 1 && infoImmune.elementMatched === false,
      'ember enchant vs ember-immune must pay x1.00 (pure upside), got ' + infoImmune.elementMult);
    /* MUTATION PROOF: elementMultFor keys on elementWeak. A monster with NO
       enchant earns nothing regardless of its weakness. */
    const infoNoEnchant = C.weaknessInfo(MONSTERS[emberWeak], C.equipmentStats({ weapon: 'bronze_sword' }, ITEMS));
    assert(infoNoEnchant.elementMult === 1, 'no enchant must never pay an element bonus');
    assert(EL.elementMultFor(MONSTERS[emberWeak], 'frost') === 1,
      'the WRONG element must pay nothing even against an element-weak foe');
  }),

  () => tryRun('ELEM-3: weapon-weakness x bane x element clamps to MAX_TOTAL_DAMAGE_MULT (1.90)', () => {
    const C = window.HearthriseCore.combat;
    const EL = window.HearthriseCore.elements;
    const B = window.HearthriseCore.bane;
    const MONSTERS = window.MONSTERS;
    assert(EL.MAX_TOTAL_DAMAGE_MULT === 1.90, 'the stated ceiling is 1.90');
    const classOf = (m) => B.normalizeClass(m.class) || B.normalizeClass(m.family);
    /* A hammer-weak Undead that is ALSO ember-weak, with a forged oversized bane
       + an ember enchant: 1.20 (weapon) x 1.40 (bane, clamped) x 1.15 (element)
       = 1.932, and the formula must clamp it to 1.90 — the ceiling is the
       expression's, not any table's. */
    const target = Object.keys(MONSTERS).find((id) =>
      classOf(MONSTERS[id]) === 'undead' && MONSTERS[id].weaponWeak === 'hammer' && MONSTERS[id].elementWeak === 'ember');
    assert(target, 'need a hammer-weak, ember-weak Undead to test the triple ceiling');
    const forged = Object.assign({}, window.ITEMS);
    forged.__qa_el__ = { n: 'QA', type: 'weapon', weaponType: 'hammer', bane: [{ class: 'undead', mult: 1e9 }] };
    const eq = C.equipmentStats({ weapon: '__qa_el__' }, forged, { weapon: 'ember' });
    const info = C.weaknessInfo(MONSTERS[target], eq);
    assert(Math.abs(info.damageMult - 1.90) < 1e-9,
      'weapon x bane x element must clamp to 1.90, got ' + info.damageMult);
  }),

  () => tryRunAsync('ELEM-4: the enchant intent sends only slot+rune names, applies its envelope, and reuses its key when unanswered', () => {
    const E = window.HearthriseEnchant;
    assert(E && typeof E.sendEnchant === 'function', 'the enchant transport must be published');
    /* (a) THE BYTES ON THE WIRE — a slot number, an intent id, and {slot:'weapon',rune}. Nothing else. */
    const req = E.buildEnchantRequest({ url: 'https://x.co', token: 't', apiKey: 'k', slot: 0, intentId: 'id', rune: 'ember_rune' });
    const body = JSON.parse(req.init.body);
    assert(body.verb === 'enchant' && body.enchant.slot === 'weapon' && body.enchant.rune === 'ember_rune',
      'the wire body must carry verb enchant + {slot:weapon, rune}');
    assert(!('element' in body.enchant) && !('mult' in body.enchant) && !('ok' in body.enchant),
      'the client must NEVER send an element, a magnitude or a success bit');
    /* (b) HAPPY PATH — a 200 envelope carrying state.enchant is applied. */
    const realFetch = window.fetch;
    E.resetEnchant();
    E.configureEnchant({ url: 'https://x.co/functions/v1/hr-accrue', apiKey: 'k', authToken: 't' });
    let applied = null;
    E.setEnchantHooks({ onEnvelope: (res) => { applied = res && res.state && res.state.enchant; return true; } });
    return (async () => {
      try {
        window.fetch = () => Promise.resolve(new Response(
          JSON.stringify({ ok: true, verb: 'enchant', version: 2, state: { enchant: { weapon: 'ember' } }, inventory: {}, equipment: {}, skills: {} }),
          { status: 200 }));
        const v = await E.sendEnchant('ember_rune', {});
        assert(v.outcome === 'enchanted', 'a 200 ok:true must classify as enchanted, got ' + v.outcome);
        assert(applied && applied.weapon === 'ember', 'the envelope hook must receive the server-authored enchant');
        /* (c) IDEMPOTENCY — an unreachable answer returns the SAME key so a retry
           cannot debit the rune twice. */
        window.fetch = () => Promise.reject(new Error('offline'));
        const v2 = await E.sendEnchant('ember_rune', { key: v.key });
        assert(v2.outcome === 'unreachable' && v2.key === v.key, 'an unanswered retry must reuse the key');
      } finally {
        window.fetch = realFetch; E.resetEnchant();
      }
    })();
  }),

  /* ── REGRESSION (2026-09-14) — THE ENCHANT IS A TOP-LEVEL ENVELOPE KEY ─────
     hr_state_of builds `'enchant', coalesce(v_st.enchant,'{}')` as a SIBLING of
     `'state'` (executed against the replayed chain, not read off a comment), and
     hr_apply returns hr_state_of's envelope verbatim. applyEnvelopeState read
     `res.state.enchant`, which is `undefined` on every envelope the game has ever
     applied — so the block never ran, and since `G.enchant` is not on
     RESIDUE_FIELDS the enchant the player paid for vanished from the browser on
     the next reload while the server kept computing away combat with it.
     This fails without the fix: `top` is the shape the realm actually sends. */
  () => tryRun('ELEM-5b: the envelope\'s TOP-LEVEL enchant is adopted (regression: state.enchant was never there)', () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.applyEnvelopeState === 'function', 'the envelope seam is missing');
    const G = window.G; const snap = snapshotG();
    try {
      G.enchant = {};
      A.applyEnvelopeState(G, { ok: true, version: 2, enchant: { weapon: 'frost' }, state: { slot: 0 } });
      assert(G.enchant && G.enchant.weapon === 'frost',
        'a top-level `enchant` on the envelope must be adopted, got ' + JSON.stringify(G.enchant));
      /* The server clearing it (an equip changed the weapon) must clear the client. */
      A.applyEnvelopeState(G, { ok: true, version: 3, enchant: {}, state: { slot: 0 } });
      assert(!(G.enchant && G.enchant.weapon), 'an empty server enchant must clear the client copy, got ' + JSON.stringify(G.enchant));
      /* ABSENCE IS NOT A CLAIM — an envelope with no enchant key leaves it alone. */
      G.enchant = { weapon: 'ember' };
      A.applyEnvelopeState(G, { ok: true, version: 4, state: { slot: 0 } });
      assert(G.enchant.weapon === 'ember', 'an envelope carrying no enchant key must not clear it');
    } finally { restoreG(snap); }
  }),

  () => tryRun('ELEM-5: changing the weapon clears the enchant (client reflect of the cross-verb coupling)', () => {
    const G = window.G; const snap = snapshotG();
    try {
      G.enchant = { weapon: 'ember' };
      G.skills = Object.assign({}, G.skills, { attack: 4000000, strength: 4000000, defense: 4000000 });
      G.equipment = Object.assign({}, G.equipment, { weapon: 'bronze_sword' });
      G.inventory = Object.assign({}, G.inventory, { iron_sword: 1 });
      // The levels above meet the wield gate; the client-only key is gone.
      window.equipItem('iron_sword');   // a real weapon swap
      assert(!G.enchant.weapon, 'equipping a different weapon must clear the enchant, still had ' + JSON.stringify(G.enchant));
      /* Re-equipping the SAME weapon does not clear an enchant. */
      G.enchant = { weapon: 'frost' };
      window.clearEnchantOnWeaponChange('weapon', 'iron_sword', 'iron_sword');
      assert(G.enchant.weapon === 'frost', 'a no-op re-equip must NOT clear the enchant');
      /* A non-weapon slot change never touches it. */
      window.clearEnchantOnWeaponChange('helmet', null, 'steel_helm');
      assert(G.enchant.weapon === 'frost', 'a non-weapon slot change must never clear the enchant');
    } finally { restoreG(snap); }
  }),

  () => tryRun('ELEM-6: the enchant persists (in the snapshot, absent from NO_SYNC) and the applier authors it', () => {
    const Ev = window.HearthriseEvents; const A = window.HearthriseAccrual;
    const G = window.G; const snap = snapshotG();
    try {
      G.enchant = { weapon: 'poison' };
      const s = Ev.snapshot(G);
      assert(s.enchant && s.enchant.weapon === 'poison', 'the enchant MUST be in the cloud snapshot (it is progress)');
      const rt = JSON.parse(JSON.stringify(s));
      assert(rt.enchant.weapon === 'poison', 'the enchant must round-trip through JSON');
      /* The server is the author: an envelope sets it, a bogus element clears it,
         and an omitted enchant is left alone. */
      A.applyEnvelopeState(G, { state: { enchant: { weapon: 'frost' } } });
      assert(G.enchant.weapon === 'frost', 'the applier must author a valid server enchant');
      A.applyEnvelopeState(G, { state: { enchant: { weapon: 'not_an_element' } } });
      assert(!G.enchant.weapon, 'the applier must clear an invalid element');
      G.enchant = { weapon: 'ember' };
      A.applyEnvelopeState(G, { state: { gold: 5 } });
      assert(G.enchant.weapon === 'ember', 'an envelope that omits enchant must leave it alone (absence is not a claim)');
    } finally { restoreG(snap); }
  }),

  () => tryRun('ELEM-7: essences and runes each have a faucet and a use, and mint no protected currency', () => {
    const ITEMS = window.ITEMS; const MONSTERS = window.MONSTERS;
    /* b432: scans EVERY artisan lane, not just Crafting. The faucet/use
       question is about the item web, and pinning it to one skill made the
       guard go red on a recipe MOVE — which is a relocation, not a hole. */
    const recipes = Object.values(window.ARTISAN_RECIPES || {}).reduce((a, l) => a.concat(l || []), []);
    ['ember', 'frost', 'poison'].forEach((e) => {
      const ess = e + '_essence'; const rune = e + '_rune';
      /* FAUCET: at least one monster drops the essence. */
      const drops = Object.keys(MONSTERS).some((id) => (MONSTERS[id].drops || []).some((d) => d.id === ess));
      assert(drops, ess + ' has no faucet — no monster drops it');
      /* USE: the essence is consumed by its bind recipe. */
      const used = recipes.some((r) => r.inputs && r.inputs[ess]);
      assert(used, ess + ' has no use — no recipe consumes it');
      /* FAUCET for the rune: its bind recipe. USE: the enchant intent consumes
         it (it is the only thing tagged 'rune', which openEnchantPicker offers). */
      assert(recipes.some((r) => r.output === rune), rune + ' has no faucet — no recipe makes it');
      assert(ITEMS[rune].tag === 'rune', rune + ' must be tagged rune so the enchant picker offers it');
    });
    /* No essence/rune drop mints the IAP-only currencies. */
    const bad = Object.keys(MONSTERS).filter((id) => (MONSTERS[id].drops || [])
      .some((d) => (d.id === 'hearth_token' || d.id === 'muster_seal')));
    assert(bad.length === 0, 'a monster mints a protected currency: ' + bad.join(', '));
  }),

  () => tryRun('ELEM-DISC-1 (b385): renderLoadout shows an enchant call-to-action with a weapon, and the "equip a weapon first" prompt without one (no silent-empty gap)', () => {
    const G = window.G; const snap = snapshotG();
    const panel = document.getElementById('loadout-panel');
    assert(panel, 'no #loadout-panel to render into — the affordance cannot be verified');
    try {
      /* Weapon on, no enchant → a real CTA. */
      G.equipment = Object.assign({}, G.equipment, { weapon: 'bronze_sword' });
      stampRecordLikeLoad(G);   // b456: the worn weapon reaches renderLoadout via equipmentMap
      G.enchant = { weapon: null };
      window.renderLoadout();
      let html = panel.innerHTML;
      assert(/Enchant weapon/.test(html), 'a weapon with no enchant must render the "Enchant weapon" call-to-action, got: ' + html.slice(0, 400));
      /* No weapon → the discoverable prompt, NEVER nothing (the bug being fixed). */
      G.equipment = Object.assign({}, G.equipment, { weapon: null });
      stampRecordLikeLoad(G);
      window.renderLoadout();
      html = panel.innerHTML;
      assert(/equip a weapon first/.test(html), 'with no weapon the loadout must still teach the mechanic with "equip a weapon first", got: ' + html.slice(0, 400));
    } finally { restoreG(snap); window.renderLoadout(); }
  }),

  () => tryRun('ELEM-DISC-2 (b385): the ember_rune item detail offers "Enchant a weapon with this" (the recipe index is blind to enchanting)', () => {
    const G = window.G; const snap = snapshotG();
    try {
      window.openInvDetail('ember_rune');
      const ov = document.getElementById('inv-detail-overlay');
      assert(ov, 'the item-detail overlay did not open');
      assert(/Enchant a weapon with this/.test(ov.innerHTML), 'a rune popup must offer the explicit enchant action, got: ' + ov.innerHTML.slice(0, 500));
      if (typeof closeInvDetail === 'function') closeInvDetail();
    } finally { restoreG(snap); }
  }),

  () => tryRun('ELEM-DISC-3 (b385): the enchant picker empty-state names Crafting 25 when the player holds essences but no rune', () => {
    const G = window.G; const snap = snapshotG();
    try {
      G.equipment = Object.assign({}, G.equipment, { weapon: 'bronze_sword' });
      stampRecordLikeLoad(G);   // b456: openEnchantPicker needs a KNOWN worn weapon
      G.inventory = { ember_essence: 3 };   // essences, and crucially NO rune
      window.openEnchantPicker();
      const ov = document.getElementById('enchant-overlay');
      assert(ov, 'the enchant picker did not open');
      const html = ov.innerHTML;
      assert(/Crafting 25/.test(html), 'the empty-state must point at Crafting 25, got: ' + html.slice(0, 500));
      assert(/Ember Essence/.test(html), 'the enriched empty-state must name the specific essence held, got: ' + html.slice(0, 500));
      if (typeof closeEnchantPicker === 'function') closeEnchantPicker();
    } finally { restoreG(snap); }
  }),

  () => tryRun('ELEM-DISC-4 (b392): the Inventory gear surface mounts the enchant affordance (Tyler "I don\'t see an enchant option" — it was Combat-only, absent where the loadout note sends players)', () => {
    const G = window.G; const snap = snapshotG();
    assert(typeof window.enchantAffordanceHtml === 'function', 'the shared enchant affordance helper must be published so every gear surface renders one entry point');
    const host = document.getElementById('invc-doll-host');
    assert(host, 'no #invc-doll-host — the Inventory gear surface cannot be verified');
    try {
      /* Weapon on, no enchant → the Inventory paper-doll must carry the CTA. */
      /* b456: a CLEAN worn set, then stamped. `decodeEquipment` condemns the whole
         map on a single cell it cannot parse, so inheriting whatever the ~800 tests
         before this one left in `G.equipment` risks a set that reads UNKNOWN (i.e.
         naked) for a reason that has nothing to do with the enchant affordance. */
      G.equipment = { weapon: 'bronze_sword' };
      stampRecordLikeLoad(G);   // the Inventory doll reads the worn set off the record
      assert(window.equippedItemG('weapon') === 'bronze_sword',
        'FIXTURE: the worn weapon did not survive the stamp (equippedItemG=' + window.equippedItemG('weapon')
        + ', known=' + (window.HearthriseEquipRead && window.HearthriseEquipRead.equipmentOf(G).known)
        + ') — everything below would assert the "equip a weapon first" branch for the wrong reason');
      G.enchant = { weapon: null };
      window.renderInvFancy();
      /* ⚠ b456 — RE-QUERY THE HOST AFTER THE RENDER. `renderInvFancy` REPLACES
         `#panel-inventory`'s innerHTML, so the `host` captured at the top of this
         test is a DETACHED node carrying the mount from whatever the PREVIOUS
         render saw. That was invisible for as long as the ambient worn set
         happened to contain a weapon; under the equipment arm the ambient set is
         UNKNOWN, the stale node reads "equip a weapon first", and the test failed
         while the live DOM was correct. MEASURED: equippedItemG='bronze_sword',
         known=true, mounts=1 — on a node no longer in the document. */
      const liveHost = document.getElementById('invc-doll-host');
      assert(liveHost, 'the Inventory gear surface lost its doll host on re-render');
      const mount = liveHost.querySelector('.invc-enchant-mount');
      assert(mount, 'the Inventory doll host must mount an enchant affordance under the paper-doll, found none');
      assert(liveHost.querySelectorAll('.invc-enchant-mount').length === 1,
        'the enchant affordance is mounted ' + liveHost.querySelectorAll('.invc-enchant-mount').length
        + ' times — a re-render is appending rather than replacing, so the player sees a stale duplicate');
      assert(/Enchant weapon/.test(mount.innerHTML), 'the Inventory enchant mount must show the "Enchant weapon" call-to-action, got: '
        + mount.innerHTML.slice(0, 300)
        + ' [diag: equippedItemG=' + window.equippedItemG('weapon')
        + ' known=' + (window.HearthriseEquipRead && window.HearthriseEquipRead.equipmentOf(G).known) + ']');
      assert(/openEnchantPicker/.test(mount.innerHTML), 'the Inventory enchant CTA must open the picker');
    } finally { restoreG(snap); if (typeof window.renderInvFancy === 'function') window.renderInvFancy(); }
  }),

  () => tryRun('ELEM-DISC-5 (b392): the no-rune picker teaches the whole path (essences → Crafting 25 → bind), never a dead empty picker, even with an empty bag', () => {
    const G = window.G; const snap = snapshotG();
    try {
      G.equipment = Object.assign({}, G.equipment, { weapon: 'bronze_sword' });
      stampRecordLikeLoad(G);   // b456: openEnchantPicker needs a KNOWN worn weapon
      G.enchant = { weapon: null };
      G.inventory = {};   // NO rune AND no essence — the coldest first-timer
      window.openEnchantPicker();
      const ov = document.getElementById('enchant-overlay');
      assert(ov, 'the enchant picker did not open');
      const html = ov.innerHTML;
      assert(/no runes/i.test(html), 'the no-rune state must say plainly the player has no runes, got: ' + html.slice(0, 500));
      assert(/<ol/.test(html), 'the no-rune state must teach the path as explicit steps, got: ' + html.slice(0, 500));
      assert(/essence/i.test(html) && /Crafting 25/.test(html), 'the steps must name essences AND Crafting 25 so the path is followable without a wiki, got: ' + html.slice(0, 500));
      /* b393: the teaching copy must use the game's ELEMENT vocabulary — the
         element is "ember" everywhere (Ember Essence → Ember Rune, monster
         weaknesses read `ember`), never "fire". A player told to hunt "fire"
         will never see that word in-game. Guard the copy against regressing. */
      assert(/ember/i.test(html), 'the element example must name "ember" (the in-game element), got: ' + html.slice(0, 500));
      assert(!/\bfire\b/i.test(html), 'the enchant teaching copy must NOT say "fire" — the element is "ember"; got: ' + html.slice(0, 500));
      assert(/tradeable|Market/i.test(html), 'the no-rune state must mention runes are tradeable (a second acquisition path), got: ' + html.slice(0, 500));
      if (typeof closeEnchantPicker === 'function') closeEnchantPicker();
    } finally { restoreG(snap); }
  }),

  () => tryRun('ELEM-AWAY: a seeded fight with an enchanted weapon pays identically live vs away, and the enchant is engaged', () => {
    const G = window.G; const C = window.HearthriseCore; const P = window.HearthrisePresence;
    const snap = snapshotG(); const origBonus = window.getBonus;
    try {
      window.getBonus = () => 0; G.buffs = [];
      /* goblin is Humanoid → element-weak to poison. A poison enchant must be
         ENGAGED (proving the seam is live) and must pay identically both ways. */
      const engaged = C.combat.weaknessInfo(window.MONSTERS.goblin,
        C.combat.equipmentStats({ weapon: 'bronze_sword' }, window.ITEMS, { weapon: 'poison' }));
      assert(engaged.elementMatched === true, 'the test rig must actually engage the enchant, or it proves nothing');
      const run = (away) => {
        G.enchant = { weapon: 'poison' };
        G.equipment = Object.assign({}, G.equipment, { weapon: 'bronze_sword' });
        G.skills = Object.assign({}, G.skills, { attack: 40000, strength: 40000, hitpoints: 15000, defense: 15000 });
        G.activeMonster = 'goblin';
        const m = window.MONSTERS.goblin; G.monsterHp = m.hp; G.monsterMaxHp = m.hp;
        G.playerMaxHp = 60; G.playerHp = 60; G.gold = 0; G.inventory = {};
        G.stats = Object.assign({}, G.stats, { kills: 0, crits: 0, deaths: 0, rareDrops: 0 }); G.quests = [];
        predZero();
        const before = xpMap();
        C.reseed(0xC0FFEE);
        const body = () => { const ctx = window.HearthriseCombatSim.ctx(); for (let i = 0; i < 240; i++) { if (!G.activeMonster) break; C.combatSim.simulateTick(G, ctx); } };
        if (away) P._withOfflineReplay(body); else body();
        const nowMap = xpMap();
        const xp = {}; Object.keys(nowMap).forEach((k) => { const d = (nowMap[k] || 0) - (before[k] || 0); if (d) xp[k] = d; });
        return { gold: G.gold, kills: G.stats.kills, xp, inv: Object.assign({}, G.inventory) };
      };
      const live = run(false); const away = run(true);
      assert(live.kills > 0, 'the enchanted rig produced no kills — the parity assertion would be vacuous');
      assert(JSON.stringify(live.xp) === JSON.stringify(away.xp), 'enchanted XP diverged live vs away');
      assert(live.gold === away.gold && live.kills === away.kills, 'enchanted gold/kills diverged live vs away');
      assert(JSON.stringify(live.inv) === JSON.stringify(away.inv), 'enchanted drops diverged live vs away');
    } finally { window.getBonus = origBonus; C.randomSeed(); restoreG(snap); }
  }),

  () => tryRun('MON-ART-1: every wired portrait points at a real monster in a shipped folder', () => {
    const mi = window._monsterIcon || {};
    const ids = Object.keys(mi);
    assert(ids.length >= 30, 'expected at least the 30 legacy portraits wired, got ' + ids.length);
    const bad = [];
    ids.forEach((id) => {
      if (!window.MONSTERS[id]) bad.push(id + ' is not a monster');
      if (mi[id].indexOf('assets/icons-bundle/') !== 0) bad.push(id + ' -> unshipped ' + mi[id]);
      /* The filename must BE the id. This is the boar-named-bear guard. */
      const file = mi[id].split('/').pop();
      if (file !== id + '.png') bad.push(id + ' is wired to ' + file + ', not ' + id + '.png');
    });
    assert(bad.length === 0, bad.slice(0, 5).join('; '));
  }),

  () => tryRun('MON-ART-2: a monster awaiting art has NO icon entry (glyph fallback, not a 404)', () => {
    const A = window.HearthriseMonsterArt;
    assert(A && A.expected, 'the art manifest must be published');
    assert(Object.keys(A.expected).length === Object.keys(window.MONSTERS).length,
      'the manifest must name every monster, so the art batch has one worklist');
    const mi = window._monsterIcon || {};
    const pending = A.pending();
    assert(pending.length > 0, 'this test is inert once every portrait ships — replace it then');
    pending.forEach((p) => {
      assert(!mi[p.id], p.id + ' has no portrait yet but is wired to ' + mi[p.id] + ' — that is a 404');
    });
    /* The three PILOT PREVIEW parks are unparked: each of those portraits is
       bound to the monster it actually depicts, not to a borrowed id. */
    [['hellhound', 'lesser_demon'], ['grim_reaper', 'wraith'], ['elk_king', 'bear']].forEach(([real, parked]) => {
      assert(window.MONSTERS[real], real + ' must exist for the pilot art to be unparked onto');
      assert(A.expected[real].indexOf('/' + real + '.png') > 0,
        real + ' must expect its own file, not stay parked on ' + parked);
      assert(A.expected[parked].indexOf('/' + parked + '.png') > 0,
        parked + ' must have its own portrait back');
    });
  }),

  () => tryRun('MON-ONECOPY-1: legacy.js declares no second roster', () => {
    assert(window.__LEGACY_INLINE_MONSTER_COUNT === 0,
      'legacy.js re-declared ' + window.__LEGACY_INLINE_MONSTER_COUNT + ' monsters. '
      + 'A second copy silently drifts — b342 measured 14 of 31 entries diverging, '
      + 'two of which deleted a live drop at runtime.');
    assert(Object.keys(window.MONSTERS).length >= 100,
      'the merged roster must still be the full one, got ' + Object.keys(window.MONSTERS).length);
  }),

  () => tryRun('MON-CONSUMER-1: the boss-of-the-day pools resolve, and were APPENDED not reordered', () => {
    const B = window.HearthriseCore && window.HearthriseCore.botd;
    if (!B || !B.DAILY_POOL) return;   // core not bridged in this harness
    /* Order is load-bearing: the historical prefix must be byte-identical or
       every player's Boss-of-the-Day history re-rolls. */
    const HISTORIC_DAILY = ['dark_wizard', 'venom_spider', 'goblin_brute', 'zombie', 'warlock',
      'plague_swarm', 'goblin_warlord', 'bear', 'wraith', 'lesser_demon', 'mountain_troll',
      'shadow_creeper', 'warband_captain', 'panther', 'death_knight', 'archmage',
      'void_parasite', 'war_king', 'ancient_bear', 'lich', 'dragon'];
    HISTORIC_DAILY.forEach((id, i) => {
      assert(B.DAILY_POOL[i] === id,
        'DAILY_POOL index ' + i + ' changed (' + B.DAILY_POOL[i] + ' != ' + id
        + ') — that re-rolls every player\'s boss history');
    });
    const dead = B.DAILY_POOL.concat(B.WEEKLY_POOL).filter((id) => !window.MONSTERS[id]);
    assert(dead.length === 0, 'pool ids with no monster: ' + dead.join(', '));
    /* The 5 historical non-bosses cannot be REMOVED (append-only), so the
       assertion is that they are the only ones and that real bosses now
       outnumber them — before this wave the game had 2 bosses in MONSTERS and
       the weekly slot was mostly not a boss fight at all. */
    const nonBoss = B.WEEKLY_POOL.filter((id) => window.MONSTERS[id] && !window.MONSTERS[id].boss);
    const HISTORIC_NONBOSS = ['death_knight', 'archmage', 'war_king', 'ancient_bear', 'void_parasite'];
    nonBoss.forEach((id) => assert(HISTORIC_NONBOSS.indexOf(id) >= 0,
      'a NEW non-boss was added to the weekly slot: ' + id));
    const bosses = B.WEEKLY_POOL.filter((id) => window.MONSTERS[id] && window.MONSTERS[id].boss);
    assert(bosses.length > nonBoss.length,
      'the weekly slot must now be mostly real bosses: ' + bosses.length + ' vs ' + nonBoss.length);
  }),

  () => tryRun('MON-CONSUMER-2: dungeon keys, bounties and muster all still resolve on the new roster', () => {
    /* KEY_DROPS binds 16 monster ids to dungeon keys, and `dragonsbane_key`
       has EXACTLY ONE source. If any of those ids stopped existing, a dungeon
       becomes permanently unreachable. No id was renamed in this wave — this
       asserts that stays true. */
    ['weak_skeleton', 'skeleton', 'zombie', 'goblin', 'hobgoblin', 'goblin_brute', 'goblin_warlord',
      'dark_wizard', 'warlock', 'archmage', 'death_knight', 'warband_captain',
      'plague_swarm', 'void_parasite', 'dragon'].forEach((id) => {
      assert(window.MONSTERS[id], 'KEY_DROPS source "' + id + '" vanished — a dungeon is now unreachable');
    });
    /* Muster contribution is 10 x tier, so a re-tier changes clan rates. */
    Object.keys(window.MONSTERS).forEach((id) => {
      const t = window.MONSTERS[id].tier;
      assert(t >= 1 && t <= 6, id + ' has tier ' + t + ' — muster pays 10 x tier and would mis-price it');
    });
    /* Bounty generation must produce a real, completable weapon requirement
       for every monster it can pick — `neutral` no longer exists to fall back on. */
    const B = window.HearthriseCore && window.HearthriseCore.bounty;
    if (B && B.makeBounty) {
      const rng = { int: (a) => a, chance: () => false };
      const b = B.makeBounty('weapon', 'goblin', 'normal', { monsters: window.MONSTERS, items: window.ITEMS, rng, now: 0 });
      assert(b.requiredWeaponType === 'sword',
        'a weapon bounty must name a real weapon type, got ' + b.requiredWeaponType);
    }
  }),

  /* B359-1 — THE ENVELOPE MAY NOT DELETE WHAT IT DOES NOT MENTION.
     The live P0 of 2026-08-17, reported by a player: `applyEnvelopeState`
     REPLACED G.skills and G.inventory wholesale, so every server round trip
     erased anything the server had not been told about. He farmed 14 Dragon
     Scales and watched them decay 14 -> 2 -> 1, and Stonemason — shipped hours
     earlier, so absent server-side by construction — reset to level 1 each time.
     Live drops and XP are still client-authored, so "absent from the envelope"
     means UNKNOWN, not zero.
     This test fails against the replace in either direction: it proves omitted
     keys SURVIVE, and it proves named keys still WIN, including downward, so a
     future "fix" that simply stops trusting the server also goes red.

     ⏳ RETIREMENT (live-settlement.md §8, §5.4). THIS TEST INVERTS AT PHASE 2 —
     it is the one place the spec asks a test to reverse its assertion, and that
     is legitimate only because the CONTRACT inverts with it. At the flip,
     "omission leaves a key alone" becomes "omission DELETES the key", because
     the envelope will name every key it owns and absence stops being ambiguous.
     It must invert in the SAME COMMIT that puts `skills`/`inventory` on
     SERVER_OF_RECORD, never before, and that commit must state §5.3's measured
     gate (`describeReplacement().destructive === false` across a full day of
     live beta play). Phase 1 does NOT touch it: SETTLE-2 below closes only the
     consumption hole, and re-asserts this test's protections while doing so. */
  () => tryRun('B359-1: an envelope overwrites the keys it names and preserves the ones it omits', () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.applyEnvelopeState === 'function', 'applyEnvelopeState must be published');
    const G = {
      gold: 5,
      skills: { attack: 1000, stonemason: 4321 },      // stonemason: server has never heard of it
      inventory: { dragon_scale: 14, ember_bar: 3, rune_bar: 7 },
    };
    A.applyEnvelopeState(G, {
      state: { gold: 9 },
      skills: { attack: { xp: 1500 } },                 // names attack, omits stonemason
      inventory: { dragon_scale: 2, rune_bar: 9 },      // NAMES dragon_scale, LOWER; omits ember_bar
    });
    // Omitted -> preserved. Stonemason is the exact reported symptom.
    assert(G.skills.stonemason === 4321,
      'a skill the envelope omits must survive — got ' + G.skills.stonemason);
    assert(G.inventory.ember_bar === 3,
      'an item the envelope omits must survive — got ' + G.inventory.ember_bar);
    /* NAMED BUT LOWER -> the client keeps its own. This is the clause that
       actually saved the reporting player: dragon_scale WAS named, the server
       held 2 from away accrual, and he had farmed 14 live. A "named wins"
       rule would still have taken 12 of them. */
    assert(G.inventory.dragon_scale === 14,
      'a named item must NOT pull a live-earned stack down — got ' + G.inventory.dragon_scale);
    // Named and higher -> the server's number wins, so away accrual still pays.
    assert(G.skills.attack === 1500, 'a named skill that is HIGHER must take the server value');
    assert(G.inventory.rune_bar === 9, 'a named item that is HIGHER must take the server value');
    assert(G.gold === 9, 'gold remains absolutely authoritative — its writer HAS moved');
  }),

  /* B385-CLIENTSKILL — A CLIENT-ONLY SKILL IS NEVER DRAGGED DOWN BY THE ABSOLUTE
     RECONCILE. Two player reports, ONE bug: "Farming stuck at level 66" and
     "cooking XP resets on reload".

     ROOT CAUSE. With equip authority armed (the prod state), the skills reconcile
     is ABSOLUTE: `skills[k] = absolute ? xp : Math.max(have, xp)` — the server's
     xp is ASSIGNED, including DOWNWARD, which is the anti-forgery property. But
     FARMING (no gather node, not a declarable activity — XP granted client-side
     in harvestPlot) and COOKING (the un-modeled artisan lane, downgraded to idle)
     have NO server accrual path, so the server's xp for them is FROZEN at its
     last value and every 90s settle + every reload re-asserts it downward.

     THE FIX. `serverAccruedSkill(k)` (src/data/skill-authority.js), derived from
     the SAME sources the engine reads (combat styles ∪ GATHER_SKILLS ∪ payable
     artisan lanes), gates the downward assign: a client-only skill follows
     Math.max and can only rise. A future server-accrued skill is not carved out;
     a new client-only skill is protected automatically; an unknown skill is
     protected fail-closed.

     This test asserts BOTH halves in ONE armed run: client-only skills survive a
     lower server value (assertions 1-2), the CONTROL server-accrued skill (attack)
     still reconciles absolutely DOWNWARD so anti-forgery is intact (assertion 3),
     and an OMITTED skill is still preserved (assertion 4).

     MUTATION: delete `&& serverAccruedSkill(k)` in applyEnvelopeState → farming
     and cooking get assigned downward and assertions 1-2 go RED. */
  /* COOKING REAL-FIX — cooking crossed BACK to the SERVER-ACCRUED side: the
     settlement arm is on (both twins), so the accrual engine legitimately settles
     cooking and the absolute envelope reducing it is the anti-forgery property
     working, not the resets bug. Cooking joins attack/stonemason on the CONTROL
     side; FARMING stays the sole client-only probe (its XP is granted in
     harvestPlot, not accrual-settled). */
  () => tryRun('B385-CLIENTSKILL: client-only skills (farming) are not reduced by the absolute envelope; server-accrued skills (cooking/attack) still are', () => {
    const A = window.HearthriseAccrual;
    const SA = window.HearthriseSkillAuthority;
    assert(A && typeof A.applyEnvelopeState === 'function', 'applyEnvelopeState must be published');
    assert(A && typeof A.markEquipAuthorityLive === 'function', 'markEquipAuthorityLive must be published');
    assert(SA && typeof SA.serverAccruedSkill === 'function', 'serverAccruedSkill must be published');

    /* The derived partition is the source of truth, not two hardcoded strings.
       Confirm farming is client-only and the accrued controls (cooking/attack). */
    assert(SA.serverAccruedSkill('farming') === false, 'farming must be client-only (no server accrual path)');
    assert(SA.serverAccruedSkill('cooking') === true, 'cooking must be server-accrued (the real fix armed both settlement twins)');
    assert(SA.serverAccruedSkill('attack') === true, 'attack must be server-accrued (combat)');
    assert(SA.serverAccruedSkill('woodcutting') === true, 'woodcutting must be server-accrued (gather)');
    assert(SA.serverAccruedSkill('smithing') === true, 'smithing must be server-accrued (payable artisan)');
    /* Completeness: every SKILLS_DEF id lands accrued-or-client-only, no limbo. */
    assert(SA.unclassifiedSkills().length === 0,
      'every authored skill must classify — unclassified: ' + SA.unclassifiedSkills().join(', '));

    const wasAbsolute = A.isEnvelopeAbsolute();
    A.markEquipAuthorityLive(true);
    try {
      assert(A.isEnvelopeAbsolute() === true, 'the envelope must be ABSOLUTE with equip authority armed (test precondition)');

      /* level-70-ish farming/cooking xp, and a level-1000 attack. The envelope
         then NAMES all three at a LOWER value — the frozen-server-xp shape. */
      /* Cooking is now server-accrued (armed), so it joins attack/stonemason on
         the CONTROL side and reconciles absolutely, including downward — the
         anti-forgery property. FARMING stays the client-only probe. */
      const G = { skills: { farming: 900000, cooking: 5000, attack: 5000, stonemason: 4321 } };
      A.applyEnvelopeState(G, {
        state: {},
        skills: {
          farming: { xp: 500000 },   // lower — must NOT reduce (client-only)
          cooking: { xp: 3000 },     // lower — MUST reduce (server-accrued now)
          attack:  { xp: 3000 },     // lower — MUST reduce (server-accrued, anti-forgery)
          // stonemason omitted
        },
        inventory: {},
      });

      // 1 — the client-only skill is NOT pulled down.
      assert(G.skills.farming === 900000,
        'FARMING STUCK-AT-66 BUG: a client-only skill must not be reduced by the absolute envelope — got ' + G.skills.farming);
      // 2 — cooking (server-accrued) reconciles absolutely, including downward.
      assert(G.skills.cooking === 3000,
        'cooking must reconcile absolutely now that both settlement twins are armed — got ' + G.skills.cooking);
      // 3 — CONTROL: the anti-forgery property is intact for a server-accrued skill.
      assert(G.skills.attack === 3000,
        'a SERVER-ACCRUED skill must still reconcile absolutely, including downward (anti-forgery) — got ' + G.skills.attack);
      // 4 — the omitted-skill protection still holds under absolute.
      assert(G.skills.stonemason === 4321,
        'a skill the envelope omits must still survive even under absolute — got ' + G.skills.stonemason);

      /* And a client-only skill still goes UP when the server is higher — the
         carve-out is a FLOOR, not a freeze. */
      A.applyEnvelopeState(G, { state: {}, skills: { farming: { xp: 950000 } }, inventory: {} });
      assert(G.skills.farming === 950000, 'a client-only skill must still RISE to a higher server value — got ' + G.skills.farming);
    } finally {
      A.markEquipAuthorityLive(wasAbsolute ? true : false);
    }
  }),

  /* ── REGRESSION (Paione, live, reported repeatedly 08-23 → 08-27), RETARGETED
     TO THE LAYER THAT ACTUALLY PROTECTS (b495).

     THE PLAYER-FACING PROPERTY IS UNCHANGED and is the whole point: "when im in
     combat i am getting sync +1 item and my HP goes up and reverts my exp." A
     settle that lands while attended combat XP is still awaiting credit (RTT,
     throttle, rate gate, in-flight race) must not shrink the number the player
     watched go up.

     WHAT MOVED IS WHERE THAT IS ENFORCED. b487 enforced it by folding
     `G._combatXpPending` back on top of the absolute assign inside
     applyEnvelopeState — and this test asserted that fold, on a bare object,
     with applyEnvelopeState called alone. PRODUCTION NEVER RUNS IT ALONE:
     legacy.js:2124 calls it and legacy.js:2144 hands the SAME envelope to
     record.js applyRecord, which replaces `G.skills` wholesale and re-stamps it
     microseconds later. So the old test passed against a function whose output
     production overwrites — green, and guarding nothing. Worse, on the one path
     where the fold DID survive (a stale envelope, where applyRecord fills only
     the fields the record cannot vouch for) the folded map no longer matched
     `_record.stamp`, `recordValue` answered `client-overwrote`, and
     skillXpForDisplay fell to the `local` rung — which ADDS the prediction on
     top of a number that already contained it. The b491 double-count, recreated.

     The fold-back is therefore GONE (src/net/accrue.js), and this test now
     drives the PRODUCTION PAIR in the production order —
     applyEnvelopeState → applyRecord — and asserts the property at the layer
     that survives it: the prediction bag.

     MUTATION: reinstate the fold-back in applyEnvelopeState → the STALE-envelope
     section reads RED (rung falls off `server`, display double-counts). Delete
     the `credit`-tagged prediction seam → the credit-lag section reads RED. */
  () => tryRunAsync('XP-FOLDBACK (b495): a settle landing while attended XP is still pending cannot shrink the display, at the layer production actually uses (envelope → record); a lower server number still wins; no pending = absolute anti-forgery unchanged', async () => {
    const R = window.HearthriseRecord;
    const P = window.HearthrisePredict;
    const S = window.HearthriseSkillRecord;
    const A = window.HearthriseAccrual;
    const C = window.HearthriseCore;
    assert(R && P && S && A && C, 'record/predict/skill-record/accrual/core must all be published');
    assert(typeof A.applyEnvelopeState === 'function', 'applyEnvelopeState must be published');
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const origCtx = C.xpGrantCtx;
    const wasA = A.isServerAccrualEnabled();
    const wasAbsolute = A.isEnvelopeAbsolute();
    try {
      if (!wasA) A.setServerAccrualEnabled(true);
      A.markEquipAuthorityLive(true);
      R.__setSkillsRecordArm(true);
      assert(R.isServerOfRecord('skills') === true, 'skills must be ARMED for this test (precondition)');
      assert(A.isEnvelopeAbsolute() === true, 'the envelope must be ABSOLUTE for this test (precondition)');
      window.clientMayWriteRecordField = function (f) { return f !== 'skills'; };
      window.HearthriseGoalClaim = { isSignedIn: () => false, creditCombatXp: () => Promise.resolve({ ok: true }) };
      C.xpGrantCtx = function (opts) {
        return { bonus: () => 0, xpB: 0, restedQuantum: 0, authored: !!(opts && opts.authored) };
      };

      const G = window.G;
      const BASE = 200000;               // high enough that eight grants cannot cross a level
      /* ── VERSIONS: ABOVE THE AMBIENT RECORD, AND NEVER INTO THE FUTURE ─────
         `applyRecord` is monotonic on `version`, so an envelope numbered below
         whatever the previous test left is silently gap-filled instead of
         applied and this test's own setup reads 0. And the suite's shared
         `stampRecordLikeLoad` stamps at `max(prev + 1, Date.now())` — a RATCHET
         that carries a future version forward — so a test that ends with a
         version above `Date.now()` makes the NEXT test's honest `Date.now()`
         envelope look stale. MEASURED, and it is a millisecond race: this test
         ran in ~2 ms, left the record at `NOW + 3`, and took XP-CREDIT-RETIRE
         down with "setup: the record did not land (got 0)" — a failure with
         nothing whatsoever to do with what that test asserts.
         Both halves are handled: start ABOVE the ambient version, and hand the
         record back at a version that is not in the future (see the finally). */
      const NOW = Math.max(Date.now(), (Number(G._record && G._record.version) || 0) + 1);
      const env = (i, xp) => ({
        ok: true, version: NOW + i,
        now: new Date(NOW + i * 1000).toISOString(),
        state: { accrued_to: new Date(NOW + i * 1000).toISOString() },
        skills: { defense: { xp }, hitpoints: { xp: 1300 } },
      });
      /* THE PRODUCTION PAIR, in the production order. Calling either one alone is
         what made the previous version of this test vacuous. */
      const settle = (e) => { A.applyEnvelopeState(G, e); R.applyRecord(G, e); };
      const shown = () => S.skillXpForDisplay(G, 'defense').value;
      const rung = () => S.skillXpForDisplay(G, 'defense').rung;

      P.resetPredictions(G); G._combatXpPending = {};
      settle(env(0, BASE));
      assert(shown() === BASE, 'setup: the record did not land (got ' + shown() + ')');
      assert(rung() === 'server', 'setup: the display is not on the server rung (got ' + rung() + ')');

      for (let i = 0; i < 8; i++) window.addXp('defense', 12);
      const gained = Number(G._combatXpPending.defense) || 0;
      assert(gained > 0, 'the armed grant buffered no attended combat XP at all — fixture is degenerate');
      assert(shown() === BASE + gained,
        'the display did not move by the watched gain (got ' + shown() + ', want ' + (BASE + gained) + ')');

      /* 1 — THE CREDIT-LAG SETTLE. The envelope restates the server's number,
         which does NOT yet include the attended XP (the credit has not landed).
         The display must not move: this is the exact frame the player reported. */
      settle(env(1, BASE));
      assert(shown() === BASE + gained,
        'THE REVERT: a settle that landed while the credit was still pending took '
        + ((BASE + gained) - shown()) + ' watched XP off the screen.');
      assert(rung() === 'server',
        'the display fell off the `server` rung to `' + rung() + '` — something wrote G.skills '
        + 'without the record stamping it, which is the fold-back defect.');

      /* 2 — THE STALE ENVELOPE: the ONE path where a client write to G.skills
         survives applyRecord (it fills only the fields the record cannot vouch
         for). If a fold-back is ever reintroduced, THIS is where it lands — and
         it lands as a double-count on the `local` rung. */
      settle(env(-5, BASE));
      assert(rung() === 'server',
        'A STALE ENVELOPE LEFT G.skills DISAGREEING WITH THE RECORD (rung `' + rung() + '`). '
        + 'applyEnvelopeState wrote a value applyRecord did not stamp — the b487 fold-back, back.');
      assert(shown() === BASE + gained,
        'the stale envelope changed the display to ' + shown() + ' (want ' + (BASE + gained)
        + '). On the `local` rung the prediction is added to a number that already contains it.');

      /* 3 — A LOWER SERVER NUMBER STILL WINS. Pending is headroom ON TOP of
         server truth, never a floor under it: the server wins every contest,
         including downward, and that direction IS the anti-forgery property. */
      settle(env(2, BASE - 500));
      assert(shown() === BASE - 500 + gained,
        'a LOWER server number must still win, with the pending headroom on top — got ' + shown()
        + ', want ' + (BASE - 500 + gained));

      /* 4 — WITH NOTHING PENDING the record owns the number outright. */
      P.resetPredictions(G); G._combatXpPending = {};
      settle(env(3, 4000));
      assert(shown() === 4000,
        'with nothing pending the server value must own the display absolutely — got ' + shown());
      assert(rung() === 'server', 'and it must still be on the server rung — got ' + rung());
    } finally {
      C.xpGrantCtx = origCtx;
      window.clientMayWriteRecordField = origMay;
      window.HearthriseGoalClaim = origClaim;
      try { R.__setSkillsRecordArm(null); } catch (e) {}
      A.markEquipAuthorityLive(wasAbsolute ? true : false);
      if (!wasA) { try { A.setServerAccrualEnabled(false); } catch (e) {} }
      /* ⚠ DROP THE VERSION BEFORE THE RESTORE. `restoreGAndRecord` re-stamps
         through `stampRecordLikeLoad`, whose version is `max(prev + 1,
         Date.now())` — so handing it a `prev` at or above the clock ratchets the
         record into the FUTURE and every later test's honest envelope reads as
         stale. Zeroing first makes that `max` resolve to `Date.now()`, which is
         what "the record as of now" is supposed to mean. See the version note
         above for the measured failure this prevents. */
      try {
        if (window.G && window.G._record) {
          window.G._record = { ...window.G._record, version: 0 };
        }
      } catch (e) {}
      restoreGAndRecord(snap);
    }
  }),

  /* ── REGRESSION (QA "test", slot 0, live b491, 2026-08-29 ~16:01 UTC —
     reproduced from `player_ledger` + `hr_combat_xp_credit_log`, twice):
     WATCHED COMBAT XP APPEARS AND THEN SNAPS AWAY AT THE SETTLE.

         display defense 348 → 375 (fighting) → 403 → 377   (a visible −26)
         server  defense 348 → 349 → 376 → 377              (never lost a point)

     ROOT. Attended combat XP does not reach the server through the accrual
     settle — it reaches it through hr_credit_combat_xp on the client's own ~60 s
     flush cadence, which never moves `accrued_to` (and the combat settle then
     pays ZERO xp for the credited window: the live ledger's `delta.k` carries no
     `skills`). So the RECORD advanced on the CREDIT clock while predict.js
     retired on the ACCRUAL clock, and for one settle-lag the same 27 XP was
     shown twice — once inside the record the credit had already moved, once as a
     live prediction. The next envelope with a fresh watermark took the duplicate
     away, and a 26-XP correction reads as theft.

     Three properties, because the live evidence falsified one hypothesis and
     confirmed another and both are worth pinning:
       1. the CLAIM carries the multiplier (predicted === buffered, always) —
          the client was NEVER under-claiming, and a change that made it do so
          would look exactly like this bug;
       2. the flush drains only what the SERVER said it APPLIED;
       3. a settle can never shrink watched combat XP.
     Fails on b491: (3) reads 403 where 376 is the truth, then 377. */
  () => tryRunAsync('XP-CREDIT-RETIRE (b492): the claim carries the multiplier, the flush drains only what the SERVER applied, and no envelope shrinks watched combat XP', async () => {
    const R = window.HearthriseRecord;
    const P = window.HearthrisePredict;
    const S = window.HearthriseSkillRecord;
    const A = window.HearthriseAccrual;
    const C = window.HearthriseCore;
    assert(R && P && S && A && C, 'record/predict/skill-record/accrual/core must all be published');
    assert(typeof window.hrCreditCombatXpFlush === 'function', 'the combat-XP credit transport must exist');
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const origCtx = C.xpGrantCtx;
    const wasA = A.isServerAccrualEnabled();
    const origLatch = !!(A.awaySettleDone && A.awaySettleDone());
    try {
      if (!wasA) A.setServerAccrualEnabled(true);
      /* Settle-first (2026-09-09): the attended credit is suppressed until the
         session's away window has been paid. This test is the ATTENDED path. */
      A.__resetAwaySettleLatch(true);
      R.__setSkillsRecordArm(true);
      assert(R.isServerOfRecord('skills') === true, 'skills must be ARMED for this test (precondition)');
      window.clientMayWriteRecordField = function (f) { return f !== 'skills'; };
      window.HearthriseGoalClaim = { isSignedIn: () => false, creditCombatXp: () => Promise.resolve({ ok: true }) };

      const G = window.G;
      /* The ONE seam that installs a deterministic XP multiplier: addXp reads
         `window.HearthriseCore.xpGrantCtx` fresh on every grant, so replacing the
         property replaces the bonus the real grant maths sees. */
      const armMult = (mult) => {
        C.xpGrantCtx = function (opts) {
          return { bonus: (k) => (k === 'allXP' ? mult : 0), xpB: 0, restedQuantum: 0,
            authored: !!(opts && opts.authored) };
        };
      };
      const swing = () => window.addXp('defense', 12);

      /* ══ 1. THE CLAIM CARRIES THE MULTIPLIER ═════════════════════════════ */
      P.resetPredictions(G); G._combatXpPending = {};
      armMult(0);
      for (let i = 0; i < 10; i++) swing();
      const plain = Number(G._combatXpPending.defense) || 0;
      assert(plain > 0, 'the armed grant buffered no combat XP at all');
      assert(P.predictedXp(G, 'defense') === plain,
        'PREDICTED and CLAIMED disagree with no multiplier (' + P.predictedXp(G, 'defense') + ' vs ' + plain
        + '). They are the same number by construction; any drift is XP the player is shown and never credited.');

      P.resetPredictions(G); G._combatXpPending = {};
      armMult(0.5);
      for (let i = 0; i < 10; i++) swing();
      const boosted = Number(G._combatXpPending.defense) || 0;
      assert(boosted > plain,
        'a +50% allXP bonus did not raise the grant (' + boosted + ' vs ' + plain + ') — the multiplier seam is not wired');
      assert(P.predictedXp(G, 'defense') === boosted,
        'THE MULTIPLIER SHARE IS PREDICTED BUT NOT CLAIMED: display shows ' + P.predictedXp(G, 'defense')
        + ' and the server is only ever told ' + boosted + '. The claim must be the WHOLE granted gain — '
        + 'the server cap is the anti-cheat, not the client under-claiming.');

      /* ══ 2. THE LIVE SHAPE — 348 → 375 → (403) → 377, and it must not drop ═
         The base is deliberately high so eight grants cannot cross a level and
         drag the level-up path (and a refreshAll per swing) into this test. */
      const BASE = 200000;
      const NOW = Date.now();
      const env = (i, defenseXp, lagMs) => ({
        ok: true, version: NOW + i,
        now: new Date(NOW + i * 1000).toISOString(),
        state: { accrued_to: new Date(NOW + i * 1000 - lagMs).toISOString() },
        skills: { defense: { xp: defenseXp }, hitpoints: { xp: 1300 } },
      });
      P.resetPredictions(G); G._combatXpPending = {};
      R.applyRecord(G, env(0, BASE, 110000));
      const shown = () => S.skillXpForDisplay(G, 'defense').value;
      assert(shown() === BASE, 'setup: the record did not land (got ' + shown() + ')');

      armMult(0);
      for (let i = 0; i < 8; i++) swing();
      const gained = Number(G._combatXpPending.defense) || 0;
      assert(gained > 0 && shown() === BASE + gained,
        'the display did not move by the predicted gain (got ' + shown() + ', want ' + (BASE + gained) + ')');
      const _b = P.predictionBag(G, false);
      const tagged = !!(_b && _b.xp && _b.xp.defense && _b.xp.defense.credit);
      // The forced pre-settle flush credits all of it; the server advances by exactly that.
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => Promise.resolve({ ok: true, credited: m, credit: gained, throttled: false }),
      };
      await window.hrCreditCombatXpFlush(true);
      assert((Number(G._combatXpPending.defense) || 0) === 0, 'the credit did not drain the buffer');
      assert(shown() === BASE + gained,
        'the CREDIT itself moved the display (' + shown() + '). A credit is not an envelope — the record has '
        + 'not restated anything yet, so retiring here would blank the number for a whole settle window.');

      // THE ENVELOPE that carries the credit, with a STALE watermark (the live eat verb).
      R.applyRecord(G, env(1, BASE + gained, 110000));
      assert(shown() === BASE + gained,
        'THE DOUBLE-COUNT: the credited XP is shown twice — ' + shown() + ' where ' + (BASE + gained)
        + ' is the truth. This is the live 403 the player saw for twenty seconds.');
      assert(P.predictedXp(G, 'defense') === 0, 'the prediction the record now contains was not retired');
      /* …and the MECHANISM that made it right, read BEFORE the retire emptied
         the bucket and asserted here so the player-visible property above is the
         first thing a regression reports. */
      assert(tagged === true,
        'addXp did not TAG the combat-XP prediction as credit-settled. Untagged, record.js retires it by the '
        + 'accrual watermark — which is the whole b491 defect.');

      // THE SETTLE — fresh watermark, nothing further credited. It must move NOTHING.
      R.applyRecord(G, env(2, BASE + gained, 0));
      assert(shown() === BASE + gained,
        'THE SNAP-BACK: a settle that owed nothing still took ' + ((BASE + gained) - shown())
        + ' watched XP away. A fresh watermark is not a payment.');

      // …and XP earned AFTER that settle survives it, uncredited (the other direction).
      for (let i = 0; i < 4; i++) swing();
      const held = shown();
      R.applyRecord(G, env(3, BASE + gained, 0));
      assert(shown() === held,
        'an envelope that restated the SAME xp retired un-credited attended XP anyway (' + held + ' → ' + shown() + ')');

      /* ══ 3. THE FLUSH DRAINS ONLY WHAT THE SERVER APPLIED ════════════════
         Dormant on live today (the physical-max cap is a deliberate
         over-estimate and every honest row journals `throttled:false`), which is
         exactly why it needs a test: the first time the cap DOES bite, the
         client must not be the thing that deletes the difference. */
      P.resetPredictions(G); G._combatXpPending = { defense: 100, hitpoints: 40 };
      let sent = null;
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => {
          sent = JSON.parse(JSON.stringify(m));
          // The server CLAMPED: 60 of the 100 defense, none of the hitpoints.
          return Promise.resolve({ ok: true, credited: { defense: 60 }, credit: 60, claimed: 140, throttled: true });
        },
      };
      await window.hrCreditCombatXpFlush(true);
      assert(sent && sent.defense === 100 && sent.hitpoints === 40, 'the flush must submit the whole buffer');
      assert((Number(G._combatXpPending.defense) || 0) === 40,
        'A THROTTLED CREDIT ATE THE PLAYER\'S XP: the client drained the full claim (100) when the server '
        + 'applied 60. The uncredited 40 is the only copy there is and it must stay pending for the next '
        + 'flush; got ' + G._combatXpPending.defense);
      assert((Number(G._combatXpPending.hitpoints) || 0) === 40,
        'a skill the server did not credit at all must keep every point of its pending XP; got ' + G._combatXpPending.hitpoints);
    } finally {
      C.xpGrantCtx = origCtx;
      window.clientMayWriteRecordField = origMay;
      window.HearthriseGoalClaim = origClaim;
      try { R.__setSkillsRecordArm(null); } catch (e) {}
      try { A.__resetAwaySettleLatch(origLatch); } catch (e) {}
      if (!wasA) { try { A.setServerAccrualEnabled(false); } catch (e) {} }
      restoreGAndRecord(snap);
    }
  }),

  /* B372-SCRIP-1 — A PURCHASE REVERTS WHOLE, OR NOT AT ALL.
     The live P0 of 2026-08-18, reported by Xarnathos: "when you buy e.g. a
     blueprint, you will get the dungeon scrip back after a short amount of
     time. You can buy every blueprint with minimum 160 scrip."

     `dungeon_scrip` is an INVENTORY ITEM, not a currency field, and so is the
     blueprint. The Quartermaster moves both purely client-side — there is no
     server verb — and the settle envelope then reverts the two legs by
     DIFFERENT rules: it NAMES scrip (so the b359 merge's `Math.max` refunds it)
     and OMITS the blueprint (so "absent means unknown" keeps it). Half a
     revert, every 90 seconds, forever.

     The fix does NOT try to make the purchase stick. It makes the trade ATOMIC:
     if the envelope hands the scrip back, the blueprint goes back with it. The
     player loses nothing real by that, because `hr_unlock_buy` re-validates the
     blueprint against `hr_unlock_offers` under the per-character lock — a
     blueprint the server never received could never have bought its homestead
     rung, so it was decorative, and the 160 scrip is the honest outcome.

     This test pins the PROPERTY rather than the mechanism — both legs move
     together — so it stays meaningful when the real `quartermaster_buy` intent
     replaces the ledger.

     MUTATION: delete either `itemLedger.reconcile` call in applyEnvelopeState
     → RED (the merge branch on assertion 2, the absolute branch on the last). */
  () => tryRun('B372-SCRIP-1: a Quartermaster purchase is not half-reverted by the settle envelope', () => {
    const A = window.HearthriseAccrual;
    const L = window.__itemLedger;
    assert(A && typeof A.applyEnvelopeState === 'function', 'applyEnvelopeState must be published');
    assert(L && typeof L.record === 'function', 'the item ledger must be published (src/net/dungeon-purchase.js)');

    /* The player had 200 scrip and bought a tier-3 blueprint for 160. The bag
       below is what the client looks like AFTER the gesture. */
    const G = { inventory: { dungeon_scrip: 40, kitchen_blueprint_t3: 1 } };
    L.record(G, { dungeon_scrip: 160 }, { kitchen_blueprint_t3: 1 }, 'quartermaster');

    /* The envelope the server produces: it still holds the PRE-purchase 200
       scrip and has never heard of the blueprint. This is the exact shape that
       produced the report. */
    A.applyEnvelopeState(G, { state: {}, skills: {}, inventory: { dungeon_scrip: 200 } });

    /* THE BUG, NAMED: scrip back AND blueprint kept. Either leg alone is fine;
       the pair is the exploit. */
    const refunded = (G.inventory.dungeon_scrip || 0) >= 200;
    const kept = (G.inventory.kitchen_blueprint_t3 || 0) >= 1;
    assert(!(refunded && kept),
      'FREE BLUEPRINT: the envelope refunded the scrip (' + G.inventory.dungeon_scrip
      + ') AND left the blueprint (' + G.inventory.kitchen_blueprint_t3 + ')');
    assert(!kept,
      'the scrip came back, so the blueprint must go back too — got '
      + G.inventory.kitchen_blueprint_t3);
    assert((G.pendingItemSpends || []).length === 0, 'the resolved trade must retire from the ledger');

    /* AND IT MUST NOT DRIFT ON REPEAT. The settle runs ~320 times a day, so a
       correction that re-applied itself would march a stack to zero or mint one
       per envelope. The ledger is empty by now, but assert the property. */
    const before = JSON.stringify(G.inventory);
    A.applyEnvelopeState(G, { state: {}, skills: {}, inventory: { dungeon_scrip: 200 } });
    A.applyEnvelopeState(G, { state: {}, skills: {}, inventory: { dungeon_scrip: 200 } });
    assert(JSON.stringify(G.inventory) === before,
      'repeat settles must be idempotent — bag drifted to ' + JSON.stringify(G.inventory));

    /* THE TRADE THE SERVER CONFIRMS IS LEFT ALONE. This is the clause that
       drains the whole mechanism the day a real `quartermaster_buy` verb ships:
       the server names the goods, so the ledger stops caring. */
    const G3 = { inventory: { dungeon_scrip: 40, kitchen_blueprint_t3: 1 } };
    L.record(G3, { dungeon_scrip: 160 }, { kitchen_blueprint_t3: 1 }, 'quartermaster');
    A.applyEnvelopeState(G3, {
      state: {}, skills: {}, inventory: { dungeon_scrip: 40, kitchen_blueprint_t3: 1 },
    });
    assert(G3.inventory.kitchen_blueprint_t3 === 1,
      'a trade the server CONFIRMS must survive untouched — got ' + G3.inventory.kitchen_blueprint_t3);
    assert((G3.pendingItemSpends || []).length === 0, 'a confirmed trade must retire too');

    /* THE OTHER BRANCH — absolute (b366) replaces the bag wholesale. It must
       reach the SAME end state, or the two branches are two behaviours. */
    const G2 = { inventory: { dungeon_scrip: 40, forge_blueprint_t3: 1 } };
    L.record(G2, { dungeon_scrip: 160 }, { forge_blueprint_t3: 1 }, 'quartermaster');
    A.applyEnvelopeState(G2, { state: {}, skills: {}, inventory: { dungeon_scrip: 200 } });
    assert(!(G2.inventory.forge_blueprint_t3 >= 1 && G2.inventory.dungeon_scrip >= 200),
      'the absolute branch must not leave a free blueprint either');
    assert((G2.pendingItemSpends || []).length === 0, 'absolute branch must resolve the trade too');
  }),

  /* B362-DUPE-1 — EQUIPPING A WEAPON MUST NOT MINT A SECOND ONE.
     The live P0 of 2026-08-18, reported by a T6 player who swaps weapons per
     monster weakness: "every time I am using the corresponding weapon type it
     gets duplicated when I equip it." Weapons are tradeable on the server
     market, so this is an economy bug, one dupe per equip round trip.

     THE MODEL, proved from the migrations, not assumed: BOTH sides hold gear
     disjointly from the bag (hr_apply's equip op is a transfer; the bootstrap
     asserts no starting item is in both), and NOTHING tells the server about a
     client equip — there is no equip verb in src/net/*. So the server's
     inventory figure still counts the worn copy, the client correctly counts
     zero, and b359's max hands the stale figure back into the bag beside the
     copy in the slot.

     Fails in both directions: it proves the worn copy is not resurrected, AND
     that the deduction is not applied twice when the server AGREES the item is
     worn — a fix that blindly subtracted the local equipment would go red on
     the second block, and reverting the fix goes red on the first. */
  () => tryRun('B362-DUPE-1: an envelope may not resurrect a bag copy that is now equipped', () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.applyEnvelopeState === 'function', 'applyEnvelopeState must be published');

    /* 1. THE EXACT REPORTED SEQUENCE. One sword owned; the player equips it
       (bag debited, slot filled); an envelope built before the equip arrives
       still naming the sword at 1. Total owned must stay ONE. */
    const G = { gold: 0, skills: {}, inventory: { iron_sword: 1 }, equipment: {} };
    delete G.inventory.iron_sword; G.equipment.weapon = 'iron_sword';   // equipItem()
    A.applyEnvelopeState(G, {
      state: {}, skills: {}, inventory: { iron_sword: 1 }, equipment: {},
    });
    assert(!(Number(G.inventory.iron_sword) > 0),
      'the worn copy must not come back to the bag — got ' + G.inventory.iron_sword + ' in the bag AND one equipped');
    assert(G.equipment.weapon === 'iron_sword', 'the equipped copy must be untouched');

    /* 2. NO DOUBLE DEDUCTION. When the envelope agrees the item is worn, its
       inventory figure already excludes that copy, so a genuine spare in the
       server's bag must still arrive. */
    const G2 = { gold: 0, skills: {}, inventory: {}, equipment: { weapon: 'iron_sword' } };
    A.applyEnvelopeState(G2, {
      state: {}, skills: {}, inventory: { iron_sword: 2 },
      equipment: { weapon: 'iron_sword' },
    });
    assert(G2.inventory.iron_sword === 2,
      'a spare the server holds must survive when both sides agree the item is worn — got ' + G2.inventory.iron_sword);

    /* 3. TWO SLOTS, ONE ITEM ID (rings). Counted by id, never by slot name,
       because the client and server slot vocabularies are not the same list. */
    const G3 = { gold: 0, skills: {}, inventory: { gold_ring: 1 },
                 equipment: { ring1: 'gold_ring', ring2: 'gold_ring' } };
    A.applyEnvelopeState(G3, { state: {}, skills: {}, inventory: { gold_ring: 3 }, equipment: {} });
    assert(G3.inventory.gold_ring === 1,
      'two worn rings must both be discounted from the server figure — got ' + G3.inventory.gold_ring);

    /* 4. B359 IS NOT WEAKENED. Nothing equipped -> the max is untouched. */
    const G4 = { gold: 0, skills: {}, inventory: { dragon_scale: 14 }, equipment: {} };
    A.applyEnvelopeState(G4, { state: {}, skills: {}, inventory: { dragon_scale: 2 } });
    assert(G4.inventory.dragon_scale === 14, 'b359: a named LOWER key must not pull a live stack down');
  }),

  /* ══════════════════════════════════════════════════════════════════════
     PHASE 2 (b366) — THE EQUIP INTENT AND THE FLIP TO ABSOLUTE.
     docs/design/live-settlement.md §5.3, §8, §10 PHASE 2.
     ══════════════════════════════════════════════════════════════════════
     The SERVER half is graded by tests/equip-intent.mjs against real
     PostgreSQL (the verb, the transfer, the dupe refusal, the release class).
     THESE are the client half: the transport's bytes, and the one behavioural
     change that matters — the envelope stops being merged and starts being
     believed.

     ⚠ WHY B359-1 AND B362-DUPE-1 ABOVE ARE UNCHANGED RATHER THAN INVERTED.
       §5.4 says B359-1 "inverts at Phase 2". It does — but only for a client
       whose equip gesture is WIRED, and that is not a date, it is a
       registration (`markEquipAuthorityLive`). The suite runs with the flip
       DISARMED, exactly as a browser does until the gesture is routed, so both
       tests keep asserting the merge semantics that are still live. The
       inversion is asserted HERE instead, with the flip armed explicitly, so
       the suite grades BOTH contracts and the transition leaves neither one
       unguarded. When the gesture lands and the merge is deleted, B359-1 and
       B362-DUPE-1 go with it — not before. */

  /* ═══ b369 — THE ARMING CONDITION, REBUILT ════════════════════════════════
     2026-08-17: a real player's unequip on live b367 produced ZERO equip
     intents in player_intents while the armed absolute envelope deleted the
     unequipped copy from their bag view. The arming condition proved the
     routing function EXISTS, not that the transport DELIVERS. b368 held the
     flip with a constant; b369 replaces the condition instead — the flip arms
     ONLY after the server has acknowledged an equip in this session.

     ⚠ `armEquipFlipForTest` (defined beside tryRunAsync) IS THE ONLY WAY THE
       SUITE MAY ARM THE FLIP, and that is the point. There is no
       `__armForTest()` seam, because a seam that arms without a round trip is
       the b367 hole with a test-shaped name. Arming costs a real `sendEquip`
       through a stubbed `fetch` — the same bytes the browser runs, answered
       the way the server answers. */

  () => tryRun('B369-ARM-1: the gesture existing is NOT the arming condition', () => {
    const AU = window.HearthriseAuth;
    assert(AU && typeof AU.equipGestureWired === 'function', 'equipGestureWired must be published');
    assert(!('EQUIP_FLIP_HELD' in AU),
      'EQUIP_FLIP_HELD is the b368 emergency constant. It is deleted in b369 because the arming '
      + 'condition was replaced rather than re-trusted — a boolean somebody has to remember to flip '
      + 'back is the same class of instruction as the bug it was holding.');
    const fakeWin = { routeEquipGesture: function () {} };
    assert(AU.equipGestureWired(fakeWin) === true,
      'a published routeEquipGesture is still the NECESSARY condition — it says the tap routes here');
    assert(AU.equipGestureWired({}) === false, 'no routing function must answer false');
  }),

  () => tryRunAsync('B369-ARM-2: a configured, wired transport does NOT arm the flip until the server answers', async () => {
    const A = window.HearthriseAccrual;
    const E = window.HearthriseEquip;
    assert(E && typeof E.isEquipTransportProven === 'function', 'isEquipTransportProven must be published');
    const prev = E.getEquipConfig();
    try {
      E.resetEquip();
      E.configureEquip({ url: 'https://example.test', apiKey: 'k', token: 't', slot: 0, gestureWired: true });
      /* ⚠ THE b367 STATE, ASSERTED UNREACHABLE. Endpoint present, token
         present, gesture wired, flip DISARMED — because not one equip has
         landed. This exact combination was armed on live b367. */
      assert(A.isEnvelopeAbsolute() === false,
        'a configured + wired transport must NOT arm the flip on its own — that is precisely the '
        + 'live b367 state, in which the server never received a single equip');
      assert(E.isEquipTransportProven() === false, 'nothing has been delivered, so nothing is proven');

      /* A REFUSAL IS NOT A PROOF. The server answered, and what it said was no. */
      const realFetch = window.fetch;
      window.fetch = () => Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'wrong_slot' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }));
      try { await E.sendEquip({ weapon: 'iron_sword' }, {}); } finally { window.fetch = realFetch; }
      assert(A.isEnvelopeAbsolute() === false, 'a 409 refusal must never arm the flip');

      /* AN UNANSWERED CALL IS NOT A PROOF EITHER — this is the CORS/dead-network
         shape, the one that looks most like success from the client's side. */
      const realFetch2 = window.fetch;
      window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
      let v = null;
      try { v = await E.sendEquip({ weapon: 'iron_sword' }, {}); } finally { window.fetch = realFetch2; }
      assert(v.outcome === 'unreachable', 'a rejected fetch is unreachable — got ' + v.outcome);
      assert(A.isEnvelopeAbsolute() === false, 'an unreachable server must never arm the flip');

      /* NOW the round trip lands. */
      const ok = await armEquipFlipForTest(E);
      assert(ok.outcome === 'equipped', 'the stubbed 200 must classify as equipped — got ' + ok.outcome);
      assert(E.isEquipTransportProven() === true, 'a server-acknowledged equip is the proof');
      assert(A.isEnvelopeAbsolute() === true, 'the flip arms on the acknowledged round trip and on nothing else');
    } finally {
      E.resetEquip();
      if (prev) E.configureEquip(prev);
    }
    assert(A.isEnvelopeAbsolute() === false, 'tearing the transport down must retire the session proof');
  }),

  /* ═══ B369-DROP — EVERY WAY THE TRANSPORT CAN DELIVER NOTHING IS COUNTED ═══
     THE INCIDENT, RESTATED AS A TEST. On live b367 an equip gesture delivered
     nothing and left no trace: no counter, no console line, no server row. It
     was not knowable from inside a running client WHICH path had dropped it,
     or even THAT one had. Each branch below is driven into its drop and its
     own counter is asserted to move — which is the mutation check too: delete
     any `noteDrop` call and exactly one of these goes red, by name. */
  () => tryRunAsync('B369-DROP-1: every silent no-op in sendEquip is counted and named', async () => {
    const E = window.HearthriseEquip;
    const A = window.HearthriseAccrual;
    assert(E && E.stats && E.stats.drops, 'HearthriseEquip.stats.drops must be published — it is the '
      + 'whole diagnosis in one paste, and its absence is the b367 blindness returning');
    const prevCfg = E.getEquipConfig();
    const realFetch = window.fetch;
    const before = { ...E.stats.drops };
    const moved = (r) => (E.stats.drops[r] || 0) - (before[r] || 0);
    const OPS = { weapon: 'iron_sword' };
    try {
      /* 1. THE KILL SWITCH IS OFF — RETIRED (b515). `switch-off` was the first
            and loudest of the six drops; the switch is gone and nothing
            produces that outcome any more. The NAME survives in the vocabulary
            on purpose (a stored outcome from an old session must still read),
            which is exactly why it is worth saying here that it is now
            unreachable rather than quietly deleting the step. The five below
            are untouched, and they are the ones an incident actually meets. */

      // 2. NO ENDPOINT. The state a client is in before auth wires it.
      E.resetEquip();
      let v = await E.sendEquip(OPS, {});
      assert(v.outcome === 'unconfigured' && v.dropReason === 'unconfigured',
        'an unconfigured transport must name itself — got ' + JSON.stringify(v));
      assert(moved('unconfigured') === 1, 'the unconfigured drop must be counted');

      /* 3. AN ENDPOINT BUT NO SESSION — a DIFFERENT incident with a different
            fix, which b367 could not distinguish because both said the same
            word. The wire outcome stays `unconfigured` (equipVerdictOutcome
            must keep leaving the prediction standing); only the diagnosis
            sharpens. */
      E.configureEquip({ url: 'https://drop.test', apiKey: 'k', authToken: () => null, slot: 0, gestureWired: true });
      v = await E.sendEquip(OPS, {});
      assert(v.outcome === 'unconfigured' && v.dropReason === 'no-token',
        'a tokenless transport must be distinguishable from an unconfigured one — got ' + JSON.stringify(v));
      assert(moved('no-token') === 1, 'the no-token drop must be counted');

      // 4. THE TOKEN ACCESSOR THREW.
      E.configureEquip({ url: 'https://drop.test', apiKey: 'k',
        authToken: () => { throw new Error('boom'); }, slot: 0, gestureWired: true });
      v = await E.sendEquip(OPS, {});
      assert(v.dropReason === 'token-threw', 'a throwing token accessor must be named — got ' + JSON.stringify(v));
      assert(moved('token-threw') === 1, 'the token-threw drop must be counted');

      // 5. OUR OWN VALIDATOR REFUSED THE MAP — whole-map refusal, still counted.
      E.configureEquip({ url: 'https://drop.test', apiKey: 'k', token: 't', slot: 0, gestureWired: true });
      v = await E.sendEquip({ weapon: 'NOT VALID' }, {});
      assert(v.outcome === 'undeliverable', 'a bad map must be undeliverable — got ' + v.outcome);
      assert(moved('undeliverable') === 1, 'the undeliverable drop must be counted');

      /* 6. THE ONE THAT LOOKS LIKE NOTHING HAPPENED. A CORS refusal, a DNS
            failure and a dead network are indistinguishable by design of the
            fetch spec — this is the branch an incident most needs to see, and
            the leading candidate for what b367 actually hit. */
      window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
      v = await E.sendEquip(OPS, {});
      assert(v.outcome === 'unreachable', 'a rejected fetch is unreachable — got ' + v.outcome);
      assert(moved('unreachable') === 1, 'the unreachable drop must be counted');

      // NONE OF THESE MAY ARM THE FLIP. Not one of them proves a swap landed.
      assert(E.isEquipTransportProven() === false,
        'six ways of delivering nothing must leave the transport UNPROVEN — this is the b367 state and '
        + 'it must never be an armed one');
      assert(A.isEnvelopeAbsolute() === false, 'and therefore the envelope must still be merged');
    } finally {
      window.fetch = realFetch;
      E.resetEquip();
      if (prevCfg) E.configureEquip(prevCfg);
    }
  }),

  () => tryRun('B369-DROP-2: the legacy gesture path counts its own dead ends too', () => {
    const E = window.HearthriseEquip;
    assert(typeof window.routeEquipGesture === 'function', 'legacy.js must publish routeEquipGesture');
    assert(typeof window.__noteEquipGestureDrop === 'function',
      'legacy.js must publish its drop counter seam — the gesture had three bare `return null`s and one '
      + 'of them may be what live b367 hit');
    const before = { ...E.stats.drops };
    const moved = (r) => (E.stats.drops[r] || 0) - (before[r] || 0);

    /* THE S4 SKIP, DRIVEN THROUGH THE REAL FUNCTION. A snapshot identical to
       the current state moved nothing, so nothing is sent — benign, but still
       a gesture that produced no intent, so it is counted (and NOT warned:
       warning on it would drown the console the incident needs). */
    const snap = window.equipStateSnapshot();
    const r = window.routeEquipGesture(snap);
    assert(r === null, 'a gesture that moved nothing must return null — got ' + r);
    assert(moved('no-ops') === 1, 'the no-ops skip must be counted — got ' + moved('no-ops'));

    /* THE TRANSPORT-MISSING BRANCH. Driven directly (removing the published
       module mid-suite would break every test after this one), so what is
       graded is that the counter exists and moves under the reason name the
       gesture uses. */
    window.__noteEquipGestureDrop('no-transport', 'driven by B369-DROP-2');
    assert(moved('no-transport') === 1, 'the no-transport drop must be counted');
    window.__noteEquipGestureDrop('no-send', 'driven by B369-DROP-2');
    assert(moved('no-send') === 1, 'the no-send drop must be counted');
    window.__noteEquipGestureDrop('gesture-threw', 'driven by B369-DROP-2');
    assert(moved('gesture-threw') === 1, 'the gesture-threw drop must be counted');
  }),

  () => tryRunAsync('EQUIP-FLIP-1: equip authority arms the flip; skills+gold go absolute, but the BAG stays MERGE (P1 mitigation)', async () => {
    const A = window.HearthriseAccrual;
    const E = window.HearthriseEquip;
    assert(A && typeof A.isEnvelopeAbsolute === 'function', 'isEnvelopeAbsolute must be published');
    assert(A && typeof A.isInventoryAbsolute === 'function', 'isInventoryAbsolute must be published');
    assert(E && typeof E.configureEquip === 'function', 'HearthriseEquip must be published');
    assert(A.isEnvelopeAbsolute() === false,
      'the flip must be DISARMED until an equip has actually landed on the server — arming it early '
      + "assigns the server's stale bag figure and reopens the b362 dupe at settle cadence");
    const prev = E.getEquipConfig();
    try {
      await armEquipFlipForTest(E);
      assert(A.isEnvelopeAbsolute() === true, 'an acknowledged equip round trip must arm the equip/skills flip');
      /* ⚠ P1 MITIGATION (2026-08-17): equip authority arming the flip must NOT
         make the general inventory BAG absolute. The bag has its own authority
         flag, which is OFF (no inventory-baseline signal exists), so the bag is
         merge even while the equip flip is armed. This is the decoupling that
         converts the irreversible crafted-item DELETION into a tolerable dupe. */
      assert(A.isInventoryAbsolute() === false,
        'inventory must stay MERGE while equip authority is live — the bag is not server-owned yet');

      const G = {
        gold: 5,
        skills: { attack: 1000, stonemason: 4321 },
        inventory: { dragon_scale: 14, ember_bar: 3, rune_bar: 7 },
        equipment: { weapon: 'iron_sword' },
      };
      A.applyEnvelopeState(G, {
        state: { gold: 9 },
        skills: { attack: { xp: 1500 } },
        inventory: { dragon_scale: 2, rune_bar: 9 },
        equipment: {},
      });
      /* SKILLS + GOLD REMAIN ABSOLUTE — equip authority is intact. */
      assert(G.skills.attack === 1500, 'a named skill must take the server value (absolute)');
      assert(G.gold === 9, 'gold remains absolutely authoritative');
      /* THE ASYMMETRY, ASSERTED. An omitted SKILL survives, because hr_skills
         is a generated catalogue that can lag a deploy by one apply — the b361
         Stonemason incident by name. */
      assert(G.skills.stonemason === 4321,
        'an omitted SKILL must survive even under absolute — a skill missing from hr_skills is a '
        + 'catalogue gap, not a zero (b361 Stonemason). Got ' + G.skills.stonemason);
      /* ── THE BAG IS MERGE (the mitigation). ─────────────────────────────────
         An OMITTED stack SURVIVES: "absent" from a server whose craft baseline
         is out-of-order/incomplete means "unknown", not zero. This is the exact
         property that keeps a freshly-crafted signet the server cannot yet
         reproduce from being DELETED. */
      assert(G.inventory.ember_bar === 3,
        'an omitted item must SURVIVE under merge (P1 mitigation) — got ' + G.inventory.ember_bar);
      /* A named LOWER stack does NOT pull a live stack down — the max ratchet. */
      assert(G.inventory.dragon_scale === 14,
        'a named LOWER stack must not pull a live stack down under merge — got ' + G.inventory.dragon_scale);
      /* A named HIGHER stack is credited (max). rune_bar is not worn, so the
         b363 discount does not touch it. */
      assert(G.inventory.rune_bar === 9,
        'a named HIGHER stack is credited under merge — got ' + G.inventory.rune_bar);
    } finally {
      E.resetEquip();
      if (prev) E.configureEquip(prev);
    }
    assert(A.isEnvelopeAbsolute() === false, 'the flip must disarm when the transport is torn down');
  }),

  /* ── CRAFT-VANISH-1 — A CRAFTED ITEM SURVIVES A STALE-BASELINE SETTLE ──────
     THE P1 THIS MITIGATION CLOSES (2026-08-17). The server settles craft chains
     out of order against an INCOMPLETE `player_inventory`: a signet crafted from
     rune-bars the server has not yet settled is a stack the server's stale
     baseline cannot produce, so it OMITS it from the envelope. Under the old
     absolute-inventory branch — armed the instant EQUIP authority went live —
     an omitted key is a real zero, so the freshly crafted signet was DELETED.
     That deletion is irreversible.

     THE FIX: the inventory bag is decoupled from equip authority. Even with the
     equip flip ARMED (isEnvelopeAbsolute() === true), the bag stays MERGE
     (isInventoryAbsolute() === false) because no inventory-baseline signal
     exists, so an omitted crafted stack SURVIVES. The residual is a dupe, which
     is tolerable pre-wipe; the deletion was not.

     MUTATION THAT MUST GO RED: route the bag back through the absolute-delete
     branch — e.g. make applyEnvelopeState read `isEnvelopeAbsolute()` for the
     bag instead of `isInventoryAbsolute()`, or make `isInventoryAbsolute` return
     `isEnvelopeAbsolute()`. Then the omitted signet is deleted and this fails. */
  () => tryRunAsync('CRAFT-VANISH-1: an armed client keeps a crafted item the server\'s stale baseline omits', async () => {
    const A = window.HearthriseAccrual;
    const E = window.HearthriseEquip;
    assert(A && typeof A.isEnvelopeAbsolute === 'function', 'isEnvelopeAbsolute must be published');
    assert(A && typeof A.isInventoryAbsolute === 'function', 'isInventoryAbsolute must be published');
    const prev = E.getEquipConfig();
    try {
      await armEquipFlipForTest(E);
      /* Equip authority IS live — this is precisely the state in which the old
         code deleted. The decoupling is the whole test. */
      assert(A.isEnvelopeAbsolute() === true, 'equip authority must be armed for this test to mean anything');
      assert(A.isInventoryAbsolute() === false,
        'the BAG must stay merge while equip authority is live — otherwise a crafted item is deleted');

      /* The player crafted a signet locally; the server settled a DIFFERENT
         chain first and its baseline knows nothing of the signet, so its
         envelope omits it (and spent the rune_bars it DID know about). */
      const G = {
        gold: 0, skills: {},
        inventory: { arcane_signet: 1, rune_bar: 5 },
        equipment: {},
      };
      A.applyEnvelopeState(G, {
        state: {}, skills: {},
        inventory: { rune_bar: 5 },   // signet OMITTED — the stale baseline can't produce it
        equipment: {},
      });
      assert(G.inventory.arcane_signet === 1,
        'the crafted signet must SURVIVE an envelope whose stale baseline omits it — got '
        + G.inventory.arcane_signet + ' (absolute-branch regression: it was deleted)');
      assert(G.inventory.rune_bar === 5, 'a named stack the server does know about is unchanged');
    } finally {
      E.resetEquip();
      if (prev) E.configureEquip(prev);
    }
    assert(A.isEnvelopeAbsolute() === false, 'the flip must disarm when the transport is torn down');
  }),

  () => tryRunAsync('EQUIP-FLIP-2: the flip fails CLOSED — kill switch, malformed envelope, bad quantity', async () => {
    const A = window.HearthriseAccrual;
    const E = window.HearthriseEquip;
    const prev = E.getEquipConfig();
    let hadKey = null;
    try { hadKey = localStorage.getItem(A.ENVELOPE_MERGE_KEY); } catch (e) { hadKey = null; }
    try {
      await armEquipFlipForTest(E);

      /* 1. THE INCIDENT LEVER. One device, no deploy, back to b359 semantics.
         An opt-BACK-IN rather than an opt-out, because that is the shape that
         works at 3am: the thing you type restores the SAFE behaviour. */
      try { localStorage.setItem(A.ENVELOPE_MERGE_KEY, 'on'); } catch (e) {}
      assert(A.isEnvelopeAbsolute() === false, 'hr:envelopeMerge=on must restore merge semantics');
      const G = { gold: 0, skills: {}, inventory: { ember_bar: 3 }, equipment: {} };
      A.applyEnvelopeState(G, { state: {}, skills: {}, inventory: { rune_bar: 1 } });
      assert(G.inventory.ember_bar === 3,
        'under the kill switch an omitted key must survive — got ' + G.inventory.ember_bar);
      try { localStorage.removeItem(A.ENVELOPE_MERGE_KEY); } catch (e) {}
      assert(A.isEnvelopeAbsolute() === true, 'removing the switch must re-arm the flip');

      /* 2. A MALFORMED ENVELOPE MUST NOT WIPE THE BAG. An envelope with no
         readable inventory object is an answer this code could not read — NOT a
         claim that the player owns nothing. Wiping on one is the single most
         expensive mistake available here, so the absolute branch is entered
         only when an inventory object actually arrived. */
      const MALFORMED = [undefined, null, 'nope', 42, ['ember_bar']];
      for (let i = 0; i < MALFORMED.length; i++) {
        const G2 = { gold: 0, skills: {}, inventory: { ember_bar: 3 }, equipment: {} };
        A.applyEnvelopeState(G2, { state: {}, skills: {}, inventory: MALFORMED[i] });
        assert(G2.inventory.ember_bar === 3,
          'a malformed inventory (' + JSON.stringify(MALFORMED[i]) + ') must leave the bag alone — got '
          + G2.inventory.ember_bar);
      }

      /* 3. AN UNREADABLE QUANTITY IS SKIPPED, NOT ZEROED, and a zero stack does
         not exist — the client's own convention (removeItem deletes at <= 0)
         and the server's (hr_apply DELETEs the row at zero). */
      const G3 = { gold: 0, skills: {}, inventory: {}, equipment: {} };
      A.applyEnvelopeState(G3, { state: {}, skills: {},
        inventory: { good: 4, nan: 'x', zero: 0, neg: -2 } });
      assert(G3.inventory.good === 4, 'a readable stack must arrive');
      assert(!('nan' in G3.inventory) && !('zero' in G3.inventory) && !('neg' in G3.inventory),
        'unreadable / zero / negative stacks must not be written — got '
        + JSON.stringify(G3.inventory));
    } finally {
      try {
        if (hadKey === null) localStorage.removeItem(A.ENVELOPE_MERGE_KEY);
        else localStorage.setItem(A.ENVELOPE_MERGE_KEY, hadKey);
      } catch (e) {}
      E.resetEquip();
      if (prev) E.configureEquip(prev);
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     SERVER-OWNED — THE INVENTORY-FLIP CARVE-OUT (server-authority Step 2).

     These prove the machinery that makes ARMING the absolute-inventory flip SAFE
     before it is ever armed. The runtime flag stays OFF (isInventoryAbsolute()
     false in prod); the tests arm the BAG directly with markInventoryAuthorityLive
     so the absolute branch actually runs, then restore it.

     The property, in one line: the absolute replace OWNS only the ids the accrual
     engine settles (src/data/item-authority.js `serverOwnedItem`) and LEAVES the
     client's copy of everything else — so a cooked food, a crop, a dungeon reward
     or a companion-proc bonus is never DELETED, while a forged copy of a
     server-owned item IS scrubbed. */
  () => tryRunAsync('SERVER-OWNED-1: an armed absolute envelope PRESERVES every un-modeled id it omits', async () => {
    const A = window.HearthriseAccrual;
    const E = window.HearthriseEquip;
    assert(A && typeof A.markInventoryAuthorityLive === 'function', 'markInventoryAuthorityLive must be published');
    assert(A && typeof A.serverOwnedItem === 'function', 'serverOwnedItem must be published');
    const IA = window.HearthriseItemAuthority;
    /* DORMANT-WORKER GUARD: while hired-worker production is un-backed (shipped
       dormant until the wipe), the arm gate refuses before the bag can go absolute,
       so the armed-envelope scenario below is unreachable. Assert the refusal; the
       full armed path runs once workers are backed (post-wipe, flag=true). */
    if (IA && IA.flipArmBlockers && IA.flipArmBlockers().length) {
      let refused = false;
      try { A.markInventoryAuthorityLive(true); } catch (e) { refused = true; }
      assert(refused === true, 'arming must refuse while an un-backed OWNABLE mint lane remains');
      assert(A.isInventoryAbsolute() === false, 'a refused arm leaves the bag on merge');
      return;
    }
    const prev = E.getEquipConfig();
    try {
      await armEquipFlipForTest(E);
      assert(A.isEnvelopeAbsolute() === true, 'the equip flip must be armed for the bag to be able to go absolute');
      /* ARM THE BAG for the test only — this is the flag nothing calls in prod.
         The arm gate now requires the server's baseline-complete signal to have
         been observed (guard b, so an empty-{} envelope can't mean "incomplete"
         while armed); seed it, exactly as the real merge-mode client would after
         the server starts stamping inventory_complete. */
      A.noteBaselineComplete({ inventory_complete: true });
      A.markInventoryAuthorityLive(true);
      assert(A.isInventoryAbsolute() === true, 'the bag must be absolute once inventory authority is armed');

      /* Precondition: these four ids are exactly the four UN-MODELED categories
         from the Step-1 audit, and each must read as NOT server-owned. */
      const UNMODELED = {
        cooked_shrimp: 'cooked food (ARTISAN_RECIPES.cooking output)',
        potato:        'crop product (CROPS.potato.prod)',
        warboss_standard: 'dungeon reward (BOSSES signature)',
        carrot:        'companion-proc bonus (doubleYield mints a crop)',
      };
      for (const id of Object.keys(UNMODELED)) {
        assert(A.serverOwnedItem(id) === false,
          id + ' must NOT be server-owned — it is ' + UNMODELED[id] + ', written by a live un-modeled path');
      }

      /* The client holds all four; the server's envelope names NONE of them (it
         has never heard of them) but DOES name a modeled bar it settles. */
      const G = {
        gold: 0, skills: {}, equipment: {},
        inventory: { cooked_shrimp: 9, potato: 40, warboss_standard: 1, carrot: 12, ember_bar: 3 },
      };
      A.applyEnvelopeState(G, {
        state: {}, skills: {}, equipment: {}, inventory_complete: true,
        inventory: { ember_bar: 5 },   // every un-modeled id OMITTED
      });

      /* AMENDED b511 (phantom-food P0). A COOKED DISH IS NO LONGER AN
         "un-modeled id the server never heard of" — the server EATS it
         (auto-eat, hr_rest) and, with COOKING_SETTLEMENT_ARM_ENABLED, cooks it.
         Leaving it on the never-lower rule meant a provision the server ate to
         zero could never be contradicted: measured live 2026-09-06 with the
         server bag empty and the client showing 20 Cooked Shrimp. Under a
         SERVER-CERTIFIED COMPLETE baseline (`inventory_complete` — the SQL's
         "no settle window is open", so no cook is in flight) an omitted
         provision is now a real zero. The guard KEEPS ITS TEETH on the three
         categories that are still genuinely un-modeled below, and the
         completeness gate is proved fail-closed by PHANTOM-FOOD-1. */
      assert(!G.inventory.cooked_shrimp,
        'a provision the server has eaten to zero must not survive a COMPLETE envelope — got '
        + G.inventory.cooked_shrimp + ' (the phantom-food P0)');
      assert(G.inventory.potato === 40, 'a crop the envelope omits must SURVIVE — got ' + G.inventory.potato);
      assert(G.inventory.warboss_standard === 1, 'a dungeon reward the envelope omits must SURVIVE — got ' + G.inventory.warboss_standard);
      assert(G.inventory.carrot === 12, 'a companion-proc crop the envelope omits must SURVIVE — got ' + G.inventory.carrot);
      /* And the modeled bar IS owned absolutely — the server RAISED it. */
      assert(G.inventory.ember_bar === 5, 'a named server-owned stack is absolute — got ' + G.inventory.ember_bar);
    } finally {
      A.markInventoryAuthorityLive(false);
      E.resetEquip();
      if (prev) E.configureEquip(prev);
    }
    assert(A.isInventoryAbsolute() === false, 'the bag must return to MERGE (unarmed) after the test');
  }),

  () => tryRunAsync('SERVER-OWNED-2: an armed absolute envelope OWNS a modeled id — a forged copy it omits is removed', async () => {
    const A = window.HearthriseAccrual;
    const E = window.HearthriseEquip;
    const IA = window.HearthriseItemAuthority;
    /* DORMANT-WORKER GUARD (see SERVER-OWNED-1): arm refuses while workers are an
       un-backed OWNABLE mint lane; the armed path runs once backed (post-wipe). */
    if (IA && IA.flipArmBlockers && IA.flipArmBlockers().length) {
      let refused = false;
      try { A.markInventoryAuthorityLive(true); } catch (e) { refused = true; }
      assert(refused === true, 'arming must refuse while an un-backed OWNABLE mint lane remains');
      assert(A.isInventoryAbsolute() === false, 'a refused arm leaves the bag on merge');
      return;
    }
    const prev = E.getEquipConfig();
    try {
      await armEquipFlipForTest(E);
      A.noteBaselineComplete({ inventory_complete: true });   // the arm gate's guard (b)
      A.markInventoryAuthorityLive(true);
      assert(A.isInventoryAbsolute() === true, 'the bag must be absolute for this test to mean anything');

      /* `ember_bar` (smithing output) and `bones` (combat drop) are modeled →
         server-owned. A client-forged extra the envelope omits must be SCRUBBED,
         and a named LOWER figure must win DOWNWARD — the anti-forgery property. */
      assert(A.serverOwnedItem('ember_bar') === true, 'ember_bar (payable artisan output) must be server-owned');
      assert(A.serverOwnedItem('bones') === true, 'bones (combat drop) must be server-owned');

      const G = {
        gold: 0, skills: {}, equipment: {},
        inventory: { ember_bar: 999, bones: 500, rune_bar: 2 },  // all forged high
      };
      A.applyEnvelopeState(G, {
        state: {}, skills: {}, equipment: {}, inventory_complete: true,
        inventory: { ember_bar: 4 },   // bones + rune_bar OMITTED; ember_bar corrected DOWN
      });
      assert(G.inventory.ember_bar === 4, 'a server-owned id takes the server figure, even downward — got ' + G.inventory.ember_bar);
      assert(!('bones' in G.inventory), 'a server-owned id the envelope OMITS is a real zero (removed) — got ' + G.inventory.bones);
      assert(!('rune_bar' in G.inventory), 'a forged server-owned id the envelope omits is scrubbed — got ' + G.inventory.rune_bar);
    } finally {
      A.markInventoryAuthorityLive(false);
      E.resetEquip();
      if (prev) E.configureEquip(prev);
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     INV-STAGE-* — THE STAGED ARM OF THE ABSOLUTE-INVENTORY FLIP
     ══════════════════════════════════════════════════════════════════════════
     MEASURED 2026-09-13: every named blocker was already gone — enable flag true,
     `flipArmBlockers()` empty, `window.DUNGEONS` loaded, and a read-only census of
     the live DB returned `{complete: 10, incomplete: 29, missing: 0}` over
     `select hr_state_of(user_id, slot) from player_state`, so the server's
     `inventory_complete` signal exists and asserts for real players. The only
     thing left deciding a bag's semantics was
     `isEnvelopeAbsolute()`, i.e. whether the server had ACKNOWLEDGED an EQUIP in
     THAT session: on for an equipping session, off otherwise, per player, per
     reload. INV-STAGE-1 proves that at runtime. THE FIX is INVENTORY_ARM_STAGE
     (src/data/item-authority.js), read once at boot, as guard (3b) of
     `maybeAutoArm` — 'off' ⇒ merge for EVERY player; 'on' ⇒ the six original
     guards decide. One constant: stageable, soakable, revertible.

     ── THE SOAK, BEFORE THE CONSTANT MOVES ───────────────────────────────────
     This is the one client change that can DELETE a player's item. Stage it on a
     host (INVENTORY_ARM_STAGE_HOSTS) and watch 24 h:
       1. `inventoryFlipReadiness()`: `destructiveOwnedOmissions` MUST stay 0 over
          hundreds of `envelopesApplied`; non-zero names the id in `lastLoss` and
          is the blueprint-loss shape — a STOP, not a statistic.
       2. `player_ledger`: no new item-DEBIT shape on the staged slots (the flip
          writes nothing server-side, so the ledger must look like a normal day).
       3. `hr_rejections` per (slot, code): an over-eager flip SPIKES the
          insufficient/missing-item refusals. Compare `tools/vitals.mjs --refusals`.
       4. `select item_id, count(*), sum(qty) from player_inventory group by 1`:
          totals move only where play explains.
       5. Play the seed loop (plant all → auto-replant → reload): seeds are OWNED
          as of the C2 classification, so this is the id class most exposed.
     Clean for a full day ⇒ `INVENTORY_ARM_STAGE = 'on'` lands ALONE.
     THREE WAYS BACK, fastest first: `update public.hr_flags set enabled = false
     where key = 'inventory_absolute'` (no deploy, every session that reads it);
     `localStorage['hr:envelopeMerge'] = 'on'` (per device, offline, pre-existing);
     revert the constant (a deploy). The soak query is game_events:
     `select payload->>'armed', count(*) filter (where (payload->>
     'destructiveOwnedOmissions')::int > 0) from game_events where
     event_type = 'inv_flip_drift' group by 1`. */

  () => tryRunAsync('INV-STAGE-1: the flip is gated on the STAGED position — and on nothing else (prod flags)', async () => {
    const A = window.HearthriseAccrual;
    const E = window.HearthriseEquip;
    const IA = window.HearthriseItemAuthority;
    assert(A && typeof A.maybeAutoArm === 'function' && typeof A.inventoryArmStage === 'function',
      'maybeAutoArm / inventoryArmStage must be published — the staged arm has no seam to prove');
    assert(IA && typeof IA.inventoryArmStaged === 'function' && typeof IA.INVENTORY_ARM_STAGE === 'string',
      'INVENTORY_ARM_STAGE / inventoryArmStaged must be published from src/data/item-authority.js');
    const prev = E.getEquipConfig();
    try {
      A.markInventoryAuthorityLive(false);   // start un-armed…
      A.__resetAutoArm();                    // …and clear the disarm latch + re-read the BUILD flags
      await armEquipFlipForTest(E);
      /* EVERY OTHER PRECONDITION, ASSERTED — so the conclusion is that the stage
         is the ONLY remaining gate, not merely that nothing armed. */
      assert(A.isEnvelopeAbsolute() === true, 'guard: the equip flip must be armed (the per-session fact this lane removed)');
      assert(IA.INVENTORY_ARM_ENABLED === true, 'guard: INVENTORY_ARM_ENABLED must be true for this test to mean anything');
      assert(IA.flipArmBlockers().length === 0, 'guard: flipArmBlockers() must be empty — got ' + JSON.stringify(IA.flipArmBlockers()));
      assert(!!(window.DUNGEONS && typeof window.DUNGEONS === 'object'), 'guard: window.DUNGEONS must be loaded');
      A.noteBaselineComplete({ inventory_complete: true });
      assert(A.isBaselineCompleteSeen() === true, 'guard: the baseline-complete signal must read as observed');
      A.noteServerArmPermission(true);   // arming needs an OBSERVED server grant (INV-STAGE-9)
      assert(A.inventoryArmStage().stagedAtBoot === IA.inventoryArmStaged(),
        'accrue.js read a different staged position at boot than item-authority.js reports now — the boot read drifted');

      /* BOTH POSITIONS DRIVEN, so this keeps biting after the constant flips.
         MUTATION: delete guard (3b) from maybeAutoArm ⇒ the OFF branch arms, red.
         (Proven: that deletion fails this test on the first assert below.) */
      A.__setInventoryArmStageForTest(false);
      assert(A.maybeAutoArm() === false,
        'the staged position is OFF and the flip armed anyway — every other guard passes, so the stage is the '
        + 'only thing standing between a live player and an absolute bag');
      assert(A.isInventoryAbsolute() === false, 'a refused auto-arm must leave the bag on MERGE');
      A.__setInventoryArmStageForTest(true);
      assert(A.maybeAutoArm() === true,
        'with the stage ON and every other guard satisfied the flip must arm — if it refuses, an unnamed '
        + 'precondition is still failing and the rollout switch is a lie');
      assert(A.isInventoryAbsolute() === true, 'an armed auto-arm must make the bag ABSOLUTE');
    } finally {
      A.markInventoryAuthorityLive(false);
      A.__setInventoryArmStageForTest(undefined);
      A.__resetAutoArm();
      A.__resetServerArmPermission();
      E.resetEquip();
      if (prev) E.configureEquip(prev);
    }
  }),

  () => tryRun('INV-STAGE-2: armed + COMPLETE — a phantom server-owned stack leaves the bag', () => {
    /* THE POINT OF THE PROGRAM. `shrimp` is a FISH_SPOTS product, so OWNABLE, and
       was one of the four ids the deleted factory literal seeded. A client copy a
       COMPLETE projection does not name is a phantom. MUTATION: Math.max ⇒ red. */
    const A = window.HearthriseAccrual;
    assert(A && typeof A.reconcileInventory === 'function', 'reconcileInventory must be published');
    assert(A.serverOwnedItem('shrimp') === true, 'precondition: shrimp must be server-owned');
    const G = { inventory: { shrimp: 10, copper_ore: 4 } };
    A.reconcileInventory(G, { inventory: { copper_ore: 4 }, inventory_complete: true }, true, true);
    assert(G.inventory.shrimp === undefined,
      'the phantom shrimp survived an ARMED, COMPLETE envelope that omits it — got ' + JSON.stringify(G.inventory));
    assert(G.inventory.copper_ore === 4, 'a named owned figure must be assigned — got ' + JSON.stringify(G.inventory));
  }),

  () => tryRun('INV-STAGE-3: armed + INCOMPLETE — the merge ratchet is kept (fail-SAFE)', () => {
    /* `inventory_complete` is a PER-ENVELOPE server assertion. An armed client
       meeting an uncertified envelope must fall back to the ratchet, or a
       mid-fight / mid-cook baseline deletes a legit stack — the pre-wipe incident
       that cost a live character ~40k items. MUTATION: drop `baselineComplete`
       from the absolute branch, or make the flag read truthy-tolerant ⇒ red. */
    const A = window.HearthriseAccrual;
    const G = { inventory: { shrimp: 10, copper_ore: 4 } };
    A.reconcileInventory(G, { inventory: { copper_ore: 4 } }, true, false);
    assert(G.inventory.shrimp === 10,
      'an ARMED client deleted an owned stack on an UNCERTIFIED envelope — got ' + JSON.stringify(G.inventory));
    const G2 = { inventory: { shrimp: 10 } };   // and an ABSENT flag is not a false one
    A.reconcileInventory(G2, { inventory: {} }, true, undefined);
    assert(G2.inventory.shrimp === 10,
      'an envelope with NO inventory_complete key was treated as complete — the rule must be fail-closed');
  }),

  () => tryRun('INV-STAGE-4: the measured carve-out ids survive an armed, complete envelope', () => {
    /* THE LIVE CENSUS BEHIND THIS LIST (read-only, 2026-09-13):
         select item_id, count(*), sum(qty) from public.player_inventory group by 1
       returned 101 distinct ids — 80 OWNABLE, 16 EXCLUDED, and FIVE that are
       neither. Unclassified ⇒ `serverOwnedItem` false ⇒ the absolute branch KEEPS
       them. That is the carve-out, pinned here rather than left an accident.

       The census also proved the projection is an UNFILTERED
       `jsonb_object_agg(item_id, qty)` over player_inventory: the envelope omits
       an id if and ONLY IF the row does not exist, so no structurally omitted id
       class exists for a flip to delete. FOLLOW-UP: seeds SHOULD become
       server-owned once the farm RPC is their only writer — "kept forever" is
       exactly the phantom-seed bug. MUTATION: own any of these five ⇒ red. */
    const A = window.HearthriseAccrual;
    /* RULED, not left in limbo. The four SEEDS are now OWNED — hr_farm_plant
       debits them and deletes the row at zero, so only ownership lets an omission
       mean zero. `burnt_food` stays carved out: an attended client mint of the
       same class as a dish. */
    const CARVE_OUT = ['burnt_food'];
    for (const id of CARVE_OUT) {
      assert(A.serverOwnedItem(id) === false,
        id + ' is now server-OWNED; live players hold it and the projection can omit it, so an armed '
        + 'absolute envelope would DELETE it. Give it a server writer before owning it.');
    }
    for (const id of ['carrot_seed', 'tomato_seed', 'turnip_seed', 'wheat_seed']) {
      assert(A.serverOwnedItem(id) === true,
        id + ' fell back out of the ownable set — an unclassified seed can never be lowered or removed, '
        + 'which is the phantom-seed bug this classification closed');
    }
    const G = { inventory: Object.fromEntries(CARVE_OUT.map((id) => [id, 7])) };
    A.reconcileInventory(G, { inventory: { copper_ore: 1 }, inventory_complete: true }, true, true);
    for (const id of CARVE_OUT) {
      assert(G.inventory[id] === 7,
        'an armed, COMPLETE envelope deleted the carve-out id ' + id + ' — got ' + JSON.stringify(G.inventory));
    }
  }),

  () => tryRun('INV-STAGE-5: an id the PROJECTION omits is not deleted (the blueprint-loss shape)', () => {
    /* THE INCIDENT, BY SHAPE: flipping the bag absolute deleted Quartermaster
       blueprints, because the projection cannot produce an id no server path has
       written. It generalises to dungeon loot and crops.
       MUTATION: remove the `serverOwnedItem` test from the absolute branch (own
       everything) ⇒ every id below goes red. */
    const A = window.HearthriseAccrual;
    const OMITTED = {
      kitchen_blueprint_t2: 'a Quartermaster blueprint (the original loss)',
      warboss_standard: 'a dungeon boss signature',
      turnip: 'a crop product (the harvest RPC writes it; the accrual engine does not)',
    };
    for (const id of Object.keys(OMITTED)) {
      assert(A.serverOwnedItem(id) === false, id + ' must NOT be server-owned — it is ' + OMITTED[id]);
    }
    const G = { inventory: Object.assign({ copper_ore: 2 },
      Object.fromEntries(Object.keys(OMITTED).map((id) => [id, 3]))) };
    A.reconcileInventory(G, { inventory: { copper_ore: 9 }, inventory_complete: true }, true, true);
    for (const id of Object.keys(OMITTED)) {
      assert(G.inventory[id] === 3, 'the flip deleted ' + id + ' (' + OMITTED[id] + ') — the blueprint loss, reopened');
    }
    assert(G.inventory.copper_ore === 9, 'the owned id must still take the server figure');

    /* THE ONE DELIBERATE HOLE, stated so it is not mistaken for that bug: a dish
       is EXCLUDED from ownership and STILL removed on a complete envelope that
       omits it, because the SERVER eats it (auto-eat / hr_rest). The marker is
       `heals > 0`, with CROPS carved back out — which is why `turnip` survives
       above and `turnip_mash` does not. MUTATION: drop that crop subtraction ⇒
       turnip is deleted and the shape half goes red. */
    const IA = window.HearthriseItemAuthority;
    assert(IA.serverConsumedItem('turnip_mash') === true, 'turnip_mash heals, so it must read as server-CONSUMED');
    assert(IA.serverConsumedItem('turnip') === false, 'a CROP must not read as server-consumed — the engine does not eat the farm');
    const GF = { inventory: { turnip_mash: 4 } };
    A.reconcileInventory(GF, { inventory: {}, inventory_complete: true }, true, true);
    assert(GF.inventory.turnip_mash === undefined,
      'a provision the server has eaten to zero must leave the bag on a COMPLETE envelope');
  }),

  /* ── THE SECURITY GO-WITH-CHANGES CONDITIONS (C1-C4) — four properties the
     flip may not be staged 'on' without; each names the mutation that reddens it. */

  () => tryRun('INV-STAGE-6: the soak signal reaches the channel that actually lands (C1)', () => {
    /* MEASURED 2026-09-13: game_events over 14 days held boot_probe 115,
       questClaim 28, companionEquip 5, companionUnlock 2 — and ZERO
       inv_flip_drift, though the reporter had been booted for weeks. It emitted
       through `window.trackEvent`, a localStorage buffer against a NULL endpoint;
       the path to game_events is the bus plus sync.js's allowlist. So the arm's
       own precondition was unmeasurable across the playerbase.
       MUTATION: trackEvent alone ⇒ (a) red. Drop the allowlist entry ⇒ (b) red.
       Stop journalling the transition ⇒ (c) red. */
    const A = window.HearthriseAccrual;
    const S = window.HearthriseSync;
    assert(A && typeof A.reportFlipDrift === 'function' && typeof A.noteArmTransition === 'function',
      'reportFlipDrift / noteArmTransition must be published');
    assert(S && typeof S.isEventAllowed === 'function', 'HearthriseSync.isEventAllowed must be published');

    // (b) the type is on the NETWORK allowlist, or the bus emit dies in enqueue().
    assert(S.isEventAllowed('inv_flip_drift') === true,
      'inv_flip_drift is not on sync.js EVENT_ALLOWLIST — the summary would be dropped before the network, '
      + 'which is exactly the zero-rows state this closes');

    // (a) a default emit reaches the BUS (the path that becomes a game_events row).
    const seen = [];
    const E = window.HearthriseEvents;
    assert(E && typeof E.on === 'function', 'the in-process bus must be present');
    const off = E.on('inv_flip_drift', (p) => seen.push(p));
    try {
      A.__resetFlipDriftReport();
      const s = A.reportFlipDrift();          // no injected sink — the REAL default path
      assert(s && typeof s === 'object', 'the first report must emit a summary');
      assert(seen.length === 1, 'the drift summary never reached the bus (got ' + seen.length + ' emits) — '
        + 'window.trackEvent alone is a localStorage buffer with a null endpoint');
      assert(typeof seen[0].armed === 'boolean' && typeof seen[0].staged === 'boolean',
        'the summary must carry BOTH the armed state and the staged position, or a soak cannot separate '
        + 'staged-on sessions from merge ones: ' + JSON.stringify(seen[0]));
      /* AND WHICH BUILD SAID SO: a +24 h soak window spans a release, and a
         destructive omission is only interpretable against the code that made it.
         MUTATION: drop `build` from flipDriftSummary ⇒ red. */
      assert(seen[0].build === window.HearthriseBuild.cache,
        'the summary must stamp the build it came from — got ' + JSON.stringify(seen[0].build));

      // (c) the ARM TRANSITION is journalled immediately, both directions.
      A.noteArmTransition(true);
      assert(seen.length === 2 && seen[1].transition === 'arm',
        'an arm must be journalled the moment authority moves: ' + JSON.stringify(seen.slice(1)));
      A.noteArmTransition(false);
      assert(seen.length === 3 && seen[2].transition === 'disarm',
        'a DISARM is the incident signal and must be journalled too: ' + JSON.stringify(seen.slice(2)));
    } finally {
      try { off && off(); } catch (e) {}
      A.__resetFlipDriftReport();
    }
  }),

  () => tryRun('INV-STAGE-7: a NAMED LOWER figure is believed for a non-owned id; silence still is not (C2)', () => {
    /* THE PHANTOM CLASS THE CARVE-OUT RE-OPENED. The server DEBITS excluded ids
       on its own behalf (a plant takes a seed, a sale takes the goods) and the old
       branch took Math.max, so once the two numbers parted nothing could bring the
       client down and the grid painted goods every gesture was refused for. A
       stated figure is now believed both ways; an OMISSION is still "unknown".
       MUTATION: put the Math.max back ⇒ (a) red. Believe an omission ⇒ (b) red. */
    const A = window.HearthriseAccrual;
    assert(A.serverOwnedItem('kitchen_blueprint_t2') === false, 'precondition: the blueprint is not owned');
    // (a) NAMED LOWER → believed.
    const G = { inventory: { kitchen_blueprint_t2: 9, turnip: 40 } };
    A.reconcileInventory(G, { inventory: { kitchen_blueprint_t2: 2, turnip: 11 }, inventory_complete: true }, true, true);
    assert(G.inventory.kitchen_blueprint_t2 === 2 && G.inventory.turnip === 11,
      'a NAMED lower figure must be believed for a non-owned id — got ' + JSON.stringify(G.inventory));
    // (b) OMISSION → still kept.
    A.reconcileInventory(G, { inventory: {}, inventory_complete: true }, true, true);
    assert(G.inventory.kitchen_blueprint_t2 === 2 && G.inventory.turnip === 11,
      'an OMISSION must stay "unknown" for a non-owned id — this is the blueprint loss: '
      + JSON.stringify(G.inventory));
  }),

  () => tryRunAsync('INV-STAGE-8: the bag write-gate can say NO, and every grant source is ruled (C3)', async () => {
    /* `inventory` is not a SERVER_OF_RECORD field, so `clientMayWrite('inventory')`
       answered a flat TRUE and the four gates that ask it before minting an item
       were open by construction. A predicate that cannot say no is not a gate.
       MUTATION: delete the `field === 'inventory'` case ⇒ (a) red. (b) asserts the
       widened grant sources are WALKED as well as empty, so narrowing the universe
       back to the four engine sources cannot pass silently. */
    const A = window.HearthriseAccrual;
    const R = window.HearthriseRecord;
    const IA = window.HearthriseItemAuthority;
    assert(R && typeof R.clientMayWrite === 'function', 'HearthriseRecord.clientMayWrite must be published');

    // (a) NOT CONSTANT: it tracks the bag's authority in both positions.
    const armedWas = A.isInventoryAbsolute();
    assert(armedWas === false, 'this build must ship with the bag on merge for the control below to mean anything');
    assert(R.clientMayWrite('inventory') === true, 'on MERGE a client prediction is allowed');
    /* The BAG can only be absolute on top of the equip flip (isEnvelopeAbsolute),
       so arm that the same way SERVER-OWNED-1 does before arming the bag. */
    const E = window.HearthriseEquip, prevEq = E.getEquipConfig();
    await armEquipFlipForTest(E);
    A.noteBaselineComplete({ inventory_complete: true });
    A.markInventoryAuthorityLive(true);
    try {
      assert(A.isInventoryAbsolute() === true, 'guard: the bag must be absolute for this half');
      assert(R.clientMayWrite('inventory') === false,
        'clientMayWrite(\'inventory\') is still TRUE while the bag is ABSOLUTE — the four mint gates that read '
        + 'it are open, and every item they mint is one the next complete envelope deletes');
    } finally {
      A.markInventoryAuthorityLive(false);
      A.__resetAutoArm();
      E.resetEquip();
      if (prevEq) E.configureEquip(prevEq);
    }

    // (b) EVERY grant source is ruled ownable-or-excluded, including the
    //     non-engine ones the universe used to miss.
    for (const fn of ['shopGrantIds', 'qmStockIds', 'goalRewardIds', 'raidRewardIds', 'seedIds']) {
      assert(typeof IA[fn] === 'function' && IA[fn]().size > 0,
        fn + ' must be published and non-empty, or the completeness check is walking an empty set');
    }
    const limbo = IA.unclassifiedGrantIds({ dungeons: window.DUNGEONS });
    assert(limbo.length === 0,
      'these granted ids are in limbo — neither ownable nor excluded, so nobody has ruled what the flip may '
      + 'do with them: ' + JSON.stringify(limbo));
    // …and the two classifications the live census forced.
    assert(IA.serverOwnedItem('turnip_seed') === true,
      'a seed must be OWNED: hr_farm_plant debits it and deletes the row at zero, so only ownership lets the '
      + 'omission mean zero — leaving it unclassified is what kept the phantom seed on the grid');
    assert(IA.serverOwnedItem('burnt_food') === false,
      'burnt_food is what src/core/artisan.js produces when a cook fails — an attended client mint, the same '
      + 'class as a dish, and excluded for the same reason');
  }),

  () => tryRunAsync('INV-STAGE-9: the SERVER can disarm the flip without a deploy (C4)', async () => {
    /* Every other position on this authority is a client constant, so a rollback
       meant a redeploy, a cache-buster and every open tab reloading — on the one
       change that can delete a player's item. The permission is one row in
       public.hr_flags (staged: 2026-09-14-inventory-absolute-flag.sql), read at
       configure time. MUTATION: see (a2). */
    const A = window.HearthriseAccrual;
    assert(typeof A.noteServerArmPermission === 'function' && typeof A.isServerArmPermitted === 'function',
      'the server-side disarm seam must be published');
    const permWas = A.isServerArmPermitted();
    const E = window.HearthriseEquip, prevEq = E.getEquipConfig();
    try {
      await armEquipFlipForTest(E);   // the bag is absolute only on top of the equip flip
      // (a) a NO disarms an armed session outright.
      A.noteServerArmPermission(true);
      A.noteBaselineComplete({ inventory_complete: true });
      A.markInventoryAuthorityLive(true);
      assert(A.isInventoryAbsolute() === true, 'guard: armed and permitted must be absolute');
      A.noteServerArmPermission(false);
      assert(A.isInventoryAbsolute() === false && A.isInventoryAuthorityLive() === false,
        'the server said NO and the bag stayed absolute — the kill switch does not kill');

      /* (a2) THE CONJUNCT ITSELF, ISOLATED — (a) cannot prove it, because the
         withdrawal also disarms. Arm DIRECTLY with permission withheld (a session
         that armed before the flag was read) and the bag must still be merge.
         MUTATION: delete the serverArmPermitted conjunct ⇒ this goes red. */
      A.__resetAutoArm();
      A.noteServerArmPermission(false);
      A.markInventoryAuthorityLive(true);
      assert(A.isInventoryAbsolute() === false,
        'the bag went ABSOLUTE while the server had withdrawn permission — isInventoryAbsolute does not '
        + 'read the kill switch, so an operator flipping the row would change nothing for an armed session');
      A.markInventoryAuthorityLive(false);

      // (b) and it refuses a fresh auto-arm, so `armed` in the telemetry cannot lie.
      A.__resetAutoArm();
      A.__setInventoryArmStageForTest(true);
      assert(A.maybeAutoArm() === false, 'the auto-arm must refuse while the server withholds permission');

      /* (c) ONLY A LITERAL `false` IS A DECISION. An absent row (the migration
         not yet applied), an unknown value or a failed read must NOT move the
         position: the primary gate is the build constant, and a delete authority
         that changes semantics on a flaky boot is worse than one that does not
         move. The offline-capable third position is ENVELOPE_MERGE_KEY. */
      A.__resetServerArmPermission();
      for (const v of [undefined, null, 1, 'false', {}]) {
        assert(A.noteServerArmPermission(v) === true,
          'a non-boolean permission (' + JSON.stringify(v) + ') moved the position — only a literal false may');
      }
      assert(A.noteServerArmPermission(false) === false, 'a literal false must withdraw the permission');
      assert(A.noteServerArmPermission(true) === true, 'and a literal true must restore it');

      /* (d) A FAILED READ IS NOT AN ANSWER — the real transport, driven. */
      A.__resetServerArmPermission();
      const dead = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
      const p = await A.fetchServerArmPermission(dead);
      assert(p === true, 'a 404 on hr_flags withdrew the permission — an older database is not a decision');

      /* (e) TRI-STATE, and the asymmetry is the whole design. SILENCE answers NO
         to "may this session arm?" and YES to "has the permission been taken
         away?" — so a client that never reaches the flag never arms, and one that
         did observe a grant is never disarmed by a later failed read.
         MUTATION: collapse it to a boolean either way ⇒ one half goes red. */
      assert(A.serverArmPermissionState() === 'unknown', 'the boot state must be UNKNOWN, not a decision');
      assert(A.isServerArmObserved() === false, 'silence is not an observed grant');
      assert(A.isServerArmPermitted() === true, 'silence is not a disarm either');
      A.__resetAutoArm();
      A.__setInventoryArmStageForTest(true);
      assert(A.maybeAutoArm() === false,
        'the flip armed on an UNKNOWN permission — arming must require an observed enabled === true, or a '
        + 'client that never reached hr_flags arms anyway and the switch is decorative');
      A.noteServerArmPermission(true);
      assert(A.isServerArmObserved() === true, 'an observed true must read as granted');
      A.markInventoryAuthorityLive(true);
      await A.fetchServerArmPermission(dead);   // a later read fails…
      assert(A.isInventoryAbsolute() === true,
        '…and disarmed an armed session: a failed read is not a withdrawal');
      A.markInventoryAuthorityLive(false);

      /* (f) THE RE-READ RIDES THE SETTLE, THROTTLED. A flag read once at sign-in
         is a kill switch with an unbounded reaction time — an idle tab would hold
         an absolute bag for hours after an operator flipped the row.
         MUTATION: delete the maybeRereadArmFlag() call in applyEnvelopeState, or
         drop the throttle ⇒ one of the two below goes red. */
      assert(typeof A.maybeRereadArmFlag === 'function' && A.ARM_FLAG_REREAD_MS >= 60000,
        'the re-read seam must exist with a sane cadence — got ' + A.ARM_FLAG_REREAD_MS);
      A.__resetArmFlagReadClock();
      assert(A.maybeRereadArmFlag(1000) === true, 'the first settle after a load must ask');
      assert(A.maybeRereadArmFlag(1000 + A.ARM_FLAG_REREAD_MS - 1) === false,
        'a second settle inside the window must NOT ask — one GET per envelope is what journal rule 6 bans');
      assert(A.maybeRereadArmFlag(1000 + A.ARM_FLAG_REREAD_MS) === true, 'and it must ask again after the window');
      A.__resetArmFlagReadClock();
    } finally {
      A.markInventoryAuthorityLive(false);
      A.__setInventoryArmStageForTest(undefined);
      A.__resetAutoArm();
      A.__resetServerArmPermission();
      if (permWas === false) A.noteServerArmPermission(false);
      E.resetEquip();
      if (prevEq) E.configureEquip(prevEq);
    }
  }),

  () => tryRun('INV-STAGE-10: the start-kit hint discard cannot delete a non-owned id (C-8)', () => {
    /* The hint discard runs on the MERGE path — the NEVER-DELETE path — and
       `cooked_shrimp` is an EXCLUDED id, so before the `serverOwnedItem` guard it
       removed a dish on an omission: exactly the loss the exclusion exists for. It
       is also no longer needed for a non-owned id, because the fresh-G factory bag
       is gone and an exact-hint figure can now only have come from the server or
       from real play. MUTATION: delete the `if (!serverOwnedItem(id)) continue`
       line in reconcileInventory's START_INVENTORY block ⇒ (a) red. */
    const A = window.HearthriseAccrual;
    assert(A.serverOwnedItem('cooked_shrimp') === false, 'precondition: a dish is EXCLUDED, never owned');
    assert(A.serverOwnedItem('turnip_seed') === true, 'precondition: a seed IS owned');
    /* MEASURED ON THE RECEIPT, NOT ON THE BAG, and that distinction is the test.
       A dish DOES leave the bag on a complete envelope that omits it — but by the
       phantom-food rule (the server eats it), which is a different, deliberate
       rule. The question here is whether the START-KIT block CLAIMED it, and
       `written.startKitHintDropped` is that block's own counter. */
    const dish = A.reconcileInventory({ inventory: { cooked_shrimp: 20 } },
      { inventory: { maple_log: 3 }, inventory_complete: true }, false, true);
    assert(!(dish.startKitHintDropped > 0),
      '(a) the start-kit hint discard claimed a NON-OWNED id (' + dish.startKitHintDropped + ') — it runs on '
      + 'the merge path, which may never delete, and an excluded id has no business in it');
    const G = { inventory: { turnip_seed: 5 } };
    const seed = A.reconcileInventory(G, { inventory: { maple_log: 3 }, inventory_complete: true }, false, true);
    assert(seed.startKitHintDropped === 1 && !G.inventory.turnip_seed,
      '(b) …and it must still discard the OWNED half, or the phantom-seed bug it was written for is back: '
      + JSON.stringify({ dropped: seed.startKitHintDropped, bag: G.inventory }));
  }),

  () => tryRun('SERVER-OWNED-3: the drift detector does NOT count an excluded omission as destructive', () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.describeReplacement === 'function', 'describeReplacement must be published');

    /* The client holds un-modeled stacks the server omits. describeReplacement
       must NOT read that as a loss — else the b366 first-contact consent modal
       fires every settle for anyone who has cooked a meal. */
    const excludedOnly = A.describeReplacement(
      { gold: 5, skills: {}, inventory: { cooked_shrimp: 9, potato: 40, warboss_standard: 1 } },
      { state: { gold: 5 }, skills: {}, inventory: {} },
    );
    assert(excludedOnly.destructive === false,
      'omitting only un-modeled ids must not be destructive — got ' + JSON.stringify(excludedOnly));
    assert(excludedOnly.items === 0, 'no un-modeled id may be counted as a lost item — got ' + excludedOnly.items);

    /* A modeled id the server lowers/omits IS a real loss — the detector must
       still see that, or it would be blind to the very drift it exists for. */
    const modeledLoss = A.describeReplacement(
      { gold: 5, skills: {}, inventory: { ember_bar: 10 } },
      { state: { gold: 5 }, skills: {}, inventory: { ember_bar: 2 } },
    );
    assert(modeledLoss.destructive === true && modeledLoss.items === 8,
      'a server-owned id the envelope lowers must still count as loss — got ' + JSON.stringify(modeledLoss));
  }),

  () => tryRun('SERVER-OWNED-4: every granted id is classified ownable-or-excluded (fail-closed on a new item/lane)', () => {
    const IA = window.HearthriseItemAuthority;
    assert(IA && typeof IA.serverOwnedItem === 'function', 'HearthriseItemAuthority must be published');
    /* Rebuild so the runtime window.DUNGEONS loot tables are folded into the
       excluded set (the module may have cached before the legacy IIFE loaded). */
    IA.rebuildItemAuthority();

    /* (d) COMPLETENESS — nothing the data grants is in limbo, and no artisan lane
       is unruled. A non-empty return of either is a NEW grant source / lane that
       must be consciously classified before the flip can be trusted. */
    const limbo = IA.unclassifiedGrantIds();
    assert(limbo.length === 0,
      'every granted item-id must be ownable-or-excluded; unclassified: ' + JSON.stringify(limbo.slice(0, 12)));
    const lanes = IA.unclassifiedArtisanLanes();
    assert(lanes.length === 0,
      'every artisan lane must be ruled payable-or-unmodeled in ARTISAN_SETTLEMENT; unruled: ' + JSON.stringify(lanes));

    /* The predicate and the classifier are one truth. */
    assert(IA.serverOwnedItem('ember_bar') === true && IA.classifyItem('ember_bar') === 'ownable',
      'a payable artisan output must classify ownable');
    assert(IA.serverOwnedItem('cooked_shrimp') === false && IA.classifyItem('cooked_shrimp') === 'excluded',
      'a cooking output must classify excluded and never be owned');

    /* OVERLAP SAFETY — an id granted by BOTH a modeled and an un-modeled path is
       EXCLUDED (the never-delete direction). `wheat` is a crop AND a rat drop;
       `magic_essence` is a monster drop AND dungeon loot. */
    assert(IA.classifyItem('wheat') === 'excluded' && IA.serverOwnedItem('wheat') === false,
      'wheat is a crop AND a drop — it must be EXCLUDED so a harvested copy is never deleted');
    assert(IA.classifyItem('magic_essence') === 'excluded' && IA.serverOwnedItem('magic_essence') === false,
      'magic_essence is a drop AND dungeon loot — it must be EXCLUDED (never-delete on overlap)');
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     SERVER-OWNED-5: THE UNBACKED-OWNABLE-MINT ARM-GATE BACKSTOP (Finding #2).

     The completeness backstop for the WHOLE flip. The absolute replace treats
     every OWNABLE id as a complete server statement — so any OWNABLE id that a
     CLIENT path still mints without a server write would be DELETED on the flip.
     This guard fails LOUD if such a lane exists and is not registered, so no
     future `window.addItem` of a gather/craft/drop id can silently re-open the
     landmine before the flip arms.

     TODAY it documents exactly one such lane: hired-worker production
     (workers.js accrueWorker -> window.addItem of a gather product). Every id a
     worker can mint is a gather product, and every gather product is OWNABLE, so
     the flip WOULD delete a worker haul the server never settled. That is the
     landmine the worker server-authority slice defuses; until it ships, the flip
     MUST NOT arm, and this test is the proof it is still blocked. */
  () => tryRun('SERVER-OWNED-5: worker production is an unbacked OWNABLE mint — the flip is arm-BLOCKED until it is server-settled', () => {
    const IA = window.HearthriseItemAuthority;
    assert(IA && typeof IA.pendingUnbackedOwnableMints === 'function', 'pendingUnbackedOwnableMints must be published');
    assert(typeof IA.flipArmBlockers === 'function' && typeof IA.workerProductIds === 'function',
      'flipArmBlockers + workerProductIds must be published');
    IA.rebuildItemAuthority();

    /* (a) THE RISK IS REAL: every id a worker can mint is OWNABLE, so an armed
       absolute replace would delete an un-settled worker haul. If this ever
       stops being true (a worker product is excluded), the fix's shape changes
       and this guard must be revisited — so assert it rather than assume it. */
    const workerIds = [...IA.workerProductIds()];
    assert(workerIds.length > 0, 'worker product id set must be non-empty (workers gather TREES/ROCKS/FISH_SPOTS prod)');
    for (const id of workerIds) {
      assert(IA.serverOwnedItem(id) === true,
        'worker product ' + id + ' must classify OWNABLE — it is a gather prod the flip would delete if un-settled');
    }

    /* (b) WHILE worker production is not server-backed, it IS in the pending set
       and IS an arm-blocker. This is the honest current state: the flip cannot
       arm. When the server-settlement slice lands (WORKER_PRODUCTION_SERVER_BACKED
       -> true, client stops the local addItem), this set empties and the blocker
       clears — flip the constant WITH that change, never before. */
    const pending = IA.pendingUnbackedOwnableMints();
    if (IA.WORKER_PRODUCTION_SERVER_BACKED === false) {
      assert(pending.size > 0, 'worker production is not server-backed yet, so it MUST appear as a pending unbacked ownable mint');
      assert(pending.has(workerIds[0]),
        'the pending set must contain worker products while unbacked — got ' + JSON.stringify([...pending].slice(0, 6)));
      const blockers = IA.flipArmBlockers();
      assert(blockers.length > 0 && /un-backed OWNABLE mint/.test(blockers[0]),
        'the arm gate must report worker production as a blocker while it is unbacked — got ' + JSON.stringify(blockers));
    } else {
      /* Server-backed: no worker id may remain in the unbacked pending set. */
      for (const id of workerIds) {
        assert(!pending.has(id),
          'worker production is marked server-backed, so ' + id + ' must NOT be a pending unbacked mint');
      }
    }

    /* (c) COMPLETENESS — every id in a registered unbacked lane is genuinely
       OWNABLE. A lane registered for an id that is actually EXCLUDED is a
       mistake (excluded ids survive the flip untouched, so they are not
       blockers); catching it keeps the registry honest as content grows. */
    for (const lane of IA.unbackedOwnableMintLanes()) {
      /* An `assumeOwnable` lane grants OWNABLE ids whose set cannot be enumerated
         from the pure data layer (e.g. the raid chest catalogue lives in
         src/features/raids.js BOSSES, not src/data). It is a blocker BY DECLARATION
         — fail-closed — so it is exempt from the id-enumeration check but MUST be
         reflected in flipArmBlockers(). */
      if (lane.assumeOwnable) {
        assert(IA.flipArmBlockers().some((b) => b.indexOf(lane.source) !== -1),
          'assumeOwnable lane "' + lane.source + '" must appear in flipArmBlockers() (fail-closed)');
        continue;
      }
      let ownedInLane = 0;
      for (const id of lane.ids) if (IA.serverOwnedItem(id)) ownedInLane++;
      assert(ownedInLane > 0,
        'registered unbacked lane "' + lane.source + '" grants NO ownable id — it is not an arm-blocker and must not be registered');
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     INVENTORY-BASELINE — THE COMPLETENESS GATE + ARM-SITE GUARDS (Step 3).

     These close the security review's remaining ARM conditions. The flip stays
     UNARMED in prod (isInventoryAbsolute() false); the tests drive the machinery
     directly. The property: an armed absolute envelope may DELETE an owned stack
     ONLY when the server has certified the baseline COMPLETE (inventory_complete
     === true). An incomplete/uncertified envelope is detectable and routes to the
     safe merge branch — armed or not — so a freshly-crafted owned item the
     server's out-of-order baseline cannot yet reproduce is never dropped. */
  () => tryRunAsync('INVENTORY-BASELINE-1: an incomplete (uncertified) envelope NEVER deletes a just-crafted owned item, even armed', async () => {
    const A = window.HearthriseAccrual;
    const E = window.HearthriseEquip;
    assert(A && typeof A.envelopeBaselineComplete === 'function', 'envelopeBaselineComplete must be published');
    const IA = window.HearthriseItemAuthority;
    /* DORMANT-WORKER GUARD (see SERVER-OWNED-1): arm refuses while workers are an
       un-backed OWNABLE mint lane; the armed path runs once backed (post-wipe). */
    if (IA && IA.flipArmBlockers && IA.flipArmBlockers().length) {
      let refused = false;
      try { A.markInventoryAuthorityLive(true); } catch (e) { refused = true; }
      assert(refused === true, 'arming must refuse while an un-backed OWNABLE mint lane remains');
      assert(A.isInventoryAbsolute() === false, 'a refused arm leaves the bag on merge');
      return;
    }
    const prev = E.getEquipConfig();
    try {
      await armEquipFlipForTest(E);
      A.noteBaselineComplete({ inventory_complete: true });   // let the arm gate pass
      A.markInventoryAuthorityLive(true);
      assert(A.isInventoryAbsolute() === true, 'the bag must be armed for this test to mean anything');

      /* `ember_bar` is a SERVER-OWNED (payable smithing) id. The player just
         crafted 5 at the keyboard; the server settled a DIFFERENT chain first, so
         its baseline cannot yet produce them and it does NOT certify the envelope
         complete (no inventory_complete flag). Under the completeness gate this
         routes to MERGE, so the crafted stack SURVIVES rather than being deleted. */
      assert(A.serverOwnedItem('ember_bar') === true, 'ember_bar must be a server-owned id for this test');
      const incomplete = { state: {}, skills: {}, equipment: {}, inventory: { bones: 2 } };
      assert(A.envelopeBaselineComplete(incomplete) === false, 'an envelope with no inventory_complete flag must read INCOMPLETE');
      const G = { gold: 0, skills: {}, equipment: {}, inventory: { ember_bar: 5 } };
      A.applyEnvelopeState(G, incomplete);   // ember_bar OMITTED, but baseline uncertified
      assert(G.inventory.ember_bar === 5,
        'a just-crafted OWNED item must SURVIVE an uncertified/incomplete envelope that omits it — got ' + G.inventory.ember_bar);
    } finally {
      A.markInventoryAuthorityLive(false);
      E.resetEquip();
      if (prev) E.configureEquip(prev);
    }
    assert(A.isInventoryAbsolute() === false, 'the bag must return to merge (unarmed) after the test');
  }),

  () => tryRunAsync('INVENTORY-BASELINE-2: a COMPLETE baseline reproduces the just-crafted item, so an absolute envelope keeps it', async () => {
    const A = window.HearthriseAccrual;
    const E = window.HearthriseEquip;
    const IA = window.HearthriseItemAuthority;
    /* DORMANT-WORKER GUARD (see SERVER-OWNED-1): arm refuses while workers are an
       un-backed OWNABLE mint lane; the armed path runs once backed (post-wipe). */
    if (IA && IA.flipArmBlockers && IA.flipArmBlockers().length) {
      let refused = false;
      try { A.markInventoryAuthorityLive(true); } catch (e) { refused = true; }
      assert(refused === true, 'arming must refuse while an un-backed OWNABLE mint lane remains');
      assert(A.isInventoryAbsolute() === false, 'a refused arm leaves the bag on merge');
      return;
    }
    const prev = E.getEquipConfig();
    try {
      await armEquipFlipForTest(E);
      A.noteBaselineComplete({ inventory_complete: true });
      A.markInventoryAuthorityLive(true);

      /* When the server certifies the baseline complete, it NAMES every owned
         stack it reproduces — including the just-crafted one. The absolute branch
         runs and the item survives because it is present, not because it is
         omitted. This is the positive half of condition #1. */
      const G = { gold: 0, skills: {}, equipment: {}, inventory: { ember_bar: 5, bones: 9 } };
      A.applyEnvelopeState(G, {
        state: {}, skills: {}, equipment: {}, inventory_complete: true,
        inventory: { ember_bar: 5 },   // complete baseline reproduces the crafted stack; bones spent → real zero
      });
      assert(G.inventory.ember_bar === 5,
        'a complete baseline that NAMES the crafted stack keeps it under absolute — got ' + G.inventory.ember_bar);
      assert(!('bones' in G.inventory),
        'under a CERTIFIED-complete envelope an omitted owned id is a real zero (removed) — got ' + G.inventory.bones);
    } finally {
      A.markInventoryAuthorityLive(false);
      E.resetEquip();
      if (prev) E.configureEquip(prev);
    }
  }),

  () => tryRunAsync('INVENTORY-BASELINE-3: an empty-{} envelope while armed but UNCERTIFIED cannot wipe the bag', async () => {
    const A = window.HearthriseAccrual;
    const E = window.HearthriseEquip;
    const IA = window.HearthriseItemAuthority;
    /* While an OWNABLE mint lane is still un-backed (hired-worker production is
       shipped DORMANT until the wipe — WORKER_PRODUCTION_SERVER_BACKED=false), the
       arm gate correctly REFUSES before any downstream guard. The armed empty-{}
       scenario is unreachable until the wipe backs workers, so assert the refusal
       here; the armed path below runs once backed (post-wipe, flag=true). Same
       dual-branch honesty as SERVER-OWNED-5. */
    if (IA && IA.flipArmBlockers && IA.flipArmBlockers().length) {
      let refused = false;
      try { A.markInventoryAuthorityLive(true); } catch (e) { refused = true; }
      assert(refused === true, 'arming must refuse while an un-backed OWNABLE mint lane remains');
      assert(A.isInventoryAbsolute() === false, 'a refused arm leaves the bag on merge');
      return;
    }
    const prev = E.getEquipConfig();
    try {
      await armEquipFlipForTest(E);
      A.noteBaselineComplete({ inventory_complete: true });
      A.markInventoryAuthorityLive(true);

      /* The most expensive mistake: an empty inventory object read as "you own
         nothing". Without the server's completeness certification it must route
         to merge and leave the bag intact. */
      const G = { gold: 0, skills: {}, equipment: {}, inventory: { ember_bar: 5, cooked_shrimp: 3 } };
      A.applyEnvelopeState(G, { state: {}, skills: {}, equipment: {}, inventory: {} });  // empty, uncertified
      assert(G.inventory.ember_bar === 5, 'an empty UNCERTIFIED envelope must not delete an owned stack — got ' + G.inventory.ember_bar);
      assert(G.inventory.cooked_shrimp === 3, 'an empty UNCERTIFIED envelope must not delete an un-modeled stack either — got ' + G.inventory.cooked_shrimp);
    } finally {
      A.markInventoryAuthorityLive(false);
      E.resetEquip();
      if (prev) E.configureEquip(prev);
    }
  }),

  () => tryRun('INVENTORY-BASELINE-4: the arm gate refuses on a missing DUNGEONS (a) OR an unobserved baseline signal (b)', () => {
    const A = window.HearthriseAccrual;
    const IA = window.HearthriseItemAuthority;
    assert(A && typeof A.isBaselineCompleteSeen === 'function', 'isBaselineCompleteSeen must be published');
    assert(A && typeof A.__resetBaselineComplete === 'function', '__resetBaselineComplete must be published');
    /* The un-backed-OWNABLE-mint blocker (worker production, dormant until the wipe)
       is checked FIRST in the arm gate, before the DUNGEONS (a) / baseline-signal (b)
       guards. So while it is present the arm always refuses on it and (a)/(b)/success
       are unreachable — assert the refusal and defer the guard-reason checks to the
       backed (post-wipe) state. Mirrors SERVER-OWNED-5's dual branch. */
    if (IA && IA.flipArmBlockers && IA.flipArmBlockers().length) {
      A.noteBaselineComplete({ inventory_complete: true });
      let refused = false;
      try { A.markInventoryAuthorityLive(true); } catch (e) { refused = true; }
      assert(refused === true, 'arming must refuse while an un-backed OWNABLE mint lane remains (checked before a/b)');
      assert(A.isInventoryAuthorityLive() === false, 'a refused arm leaves the flag OFF');
      return;
    }
    const savedDungeons = globalThis.DUNGEONS;
    try {
      /* GUARD (a): DUNGEONS absent. Overlap ids classify OWNABLE before boot, so
         an absolute envelope could delete a legit dungeon copy — arming must throw. */
      A.noteBaselineComplete({ inventory_complete: true });   // satisfy (b) so (a) is what fails
      globalThis.DUNGEONS = undefined;
      let threwA = false;
      try { A.markInventoryAuthorityLive(true); } catch (e) { threwA = true; }
      assert(threwA === true, 'arming with window.DUNGEONS absent must THROW (guard a)');
      assert(A.isInventoryAuthorityLive() === false, 'a refused arm must leave the flag OFF');

      /* GUARD (b): the baseline-complete signal has NOT been observed. An empty-{}
         envelope would then be indistinguishable from a complete-but-empty
         baseline, so arming must throw even with DUNGEONS present. */
      globalThis.DUNGEONS = savedDungeons;
      A.__resetBaselineComplete();
      assert(A.isBaselineCompleteSeen() === false, 'the signal must read UNOBSERVED after reset');
      let threwB = false;
      try { A.markInventoryAuthorityLive(true); } catch (e) { threwB = true; }
      assert(threwB === true, 'arming with no observed baseline-complete signal must THROW (guard b)');
      assert(A.isInventoryAuthorityLive() === false, 'a refused arm must leave the flag OFF');

      /* Both preconditions met → arming SUCCEEDS. */
      A.noteBaselineComplete({ inventory_complete: true });
      A.markInventoryAuthorityLive(true);
      assert(A.isInventoryAuthorityLive() === true, 'with DUNGEONS loaded and the signal observed, arming must succeed');

      /* Disarming must NEVER throw — the incident direction is always available. */
      let disarmThrew = false;
      try { A.markInventoryAuthorityLive(false); } catch (e) { disarmThrew = true; }
      assert(disarmThrew === false, 'disarming must never throw');
    } finally {
      globalThis.DUNGEONS = savedDungeons;
      A.markInventoryAuthorityLive(false);
    }
    assert(A.isInventoryAbsolute() === false, 'the bag must be merge (unarmed) after the test');
  }),

  () => tryRun('INVENTORY-BASELINE-5: the drift-soak readout exposes destructive OWNED omissions for the arm decision', () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.inventoryFlipReadiness === 'function', 'inventoryFlipReadiness must be published');
    assert(A && typeof A.resetEnvelopeDrift === 'function', 'resetEnvelopeDrift must be published');

    A.resetEnvelopeDrift();
    let r = A.inventoryFlipReadiness();
    assert(r.destructiveOwnedOmissions === 0, 'a fresh soak window starts at zero destructive omissions — got ' + r.destructiveOwnedOmissions);
    assert(typeof r.dungeonsLoaded === 'boolean' && typeof r.baselineCompleteSeen === 'boolean',
      'the readout must expose the arm preconditions');

    /* A non-destructive envelope (server ahead) must NOT bump the destructive
       counter; a destructive OWNED omission MUST. describeReplacement only counts
       the OWNED set, so an un-modeled loss is invisible here — as it should be. */
    A.noteEnvelopeDrift(A.describeReplacement(
      { gold: 0, skills: {}, inventory: { ember_bar: 2 } },
      { state: {}, skills: {}, inventory: { ember_bar: 5 } }));   // server higher → not destructive
    assert(A.inventoryFlipReadiness().destructiveOwnedOmissions === 0, 'a non-destructive envelope must not bump the counter');

    A.noteEnvelopeDrift(A.describeReplacement(
      { gold: 0, skills: {}, inventory: { ember_bar: 10 } },
      { state: {}, skills: {}, inventory: { ember_bar: 2 } }));   // OWNED loss → destructive
    r = A.inventoryFlipReadiness();
    assert(r.destructiveOwnedOmissions === 1, 'a destructive OWNED omission must be counted for the soak — got ' + r.destructiveOwnedOmissions);
    assert(r.envelopesApplied === 2, 'the readout tracks total envelopes applied over the window — got ' + r.envelopesApplied);

    /* An un-modeled loss must NOT register as destructive (else the soak never
       clears for anyone who cooked a meal). */
    A.noteEnvelopeDrift(A.describeReplacement(
      { gold: 0, skills: {}, inventory: { cooked_shrimp: 9 } },
      { state: {}, skills: {}, inventory: {} }));
    assert(A.inventoryFlipReadiness().destructiveOwnedOmissions === 1,
      'an un-modeled omission must NOT count as a destructive owned omission');
    A.resetEnvelopeDrift();   // leave the counter clean for any later observer
  }),

  () => tryRun('INVENTORY-BASELINE-6: the drift telemetry reporter emits a bounded aggregate summary and does NOT spam', () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.flipDriftSummary === 'function', 'flipDriftSummary must be published');
    assert(typeof A.reportFlipDrift === 'function', 'reportFlipDrift must be published');
    assert(typeof A.__resetFlipDriftReport === 'function', '__resetFlipDriftReport must be published');

    A.resetEnvelopeDrift();
    A.__resetFlipDriftReport();

    /* SHAPE: a small FLAT object of scalars — no arrays, no per-envelope detail.
       This is what makes it safe to emit as ONE analytics row (journal rule 6). */
    const s = A.flipDriftSummary();
    const expectedKeys = ['destructiveOwnedOmissions', 'envelopesApplied', 'completeEnvelopes',
      'lastLossMag', 'soakMinutes', 'ready', 'armed', 'dungeonsLoaded', 'baselineCompleteSeen'];
    for (const k of expectedKeys) assert(k in s, 'summary must expose ' + k);
    for (const k of Object.keys(s)) {
      const t = typeof s[k];
      assert(t === 'number' || t === 'boolean', 'every summary field must be a scalar — ' + k + ' is ' + t);
    }
    assert(!Array.isArray(s.skills) && s.lastLoss === undefined, 'summary must not carry the raw loss object or arrays');

    /* EMIT via an injected sink so we do not depend on the analytics buffer. */
    const emitted = [];
    const sink = (name, props) => emitted.push({ name, props });

    const first = A.reportFlipDrift(sink);
    assert(first !== null, 'first report must emit');
    assert(emitted.length === 1, 'exactly one event on first report — got ' + emitted.length);
    assert(emitted[0].name === 'inv_flip_drift', 'event name must be inv_flip_drift — got ' + emitted[0].name);
    assert(emitted[0].props && emitted[0].props.destructiveOwnedOmissions === 0, 'clean soak reports zero omissions');

    /* NO SPAM: an UNCHANGED drift picture must be suppressed — the steady state
       stays one row per session, not one per cadence tick. */
    const dup = A.reportFlipDrift(sink);
    assert(dup === null, 'an unchanged summary must be suppressed (dedupe)');
    assert(emitted.length === 1, 'no second event when nothing changed — got ' + emitted.length);

    /* A CHANGED picture (a destructive owned omission appears) re-emits, and the
       magnitude is a bounded scalar. */
    A.noteEnvelopeDrift(A.describeReplacement(
      { gold: 0, skills: {}, inventory: { ember_bar: 10 } },
      { state: {}, skills: {}, inventory: { ember_bar: 2 } }));
    const chg = A.reportFlipDrift(sink);
    assert(chg !== null && emitted.length === 2, 'a changed drift picture must emit a new event');
    assert(emitted[1].props.destructiveOwnedOmissions === 1, 'the new event carries the bumped omission count');
    assert(typeof emitted[1].props.lastLossMag === 'number' && emitted[1].props.lastLossMag >= 8,
      'lastLossMag is a bounded scalar reflecting the omission — got ' + emitted[1].props.lastLossMag);

    A.resetEnvelopeDrift();
    A.__resetFlipDriftReport();
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     AUTO-ARM — THE BOOT LIVE-ARM WIRING (inventory-flip LIVE-ARM step, 2026-08-20).

     maybeAutoArm() is the only thing in prod that ever calls
     markInventoryAuthorityLive(true). It runs on every envelope and must be a
     silent no-op until the build-level enable flag (INVENTORY_ARM_ENABLED) is
     flipped AND every arm precondition holds. These tests pin the two properties
     the flip going live depends on: it CANNOT arm while disabled, and when enabled
     with guards met it arms EXACTLY ONCE, never re-arming — and it never throws
     into the envelope apply regardless of state. `__setInventoryArmEnabledForTest`
     overlays the build flag so both positions are exercised without editing the
     const; the const stays the sole gate in prod. */
  () => tryRunAsync('AUTO-ARM-1: with INVENTORY_ARM_ENABLED false, an observed complete envelope NEVER auto-arms', async () => {
    const A = window.HearthriseAccrual;
    const IA = window.HearthriseItemAuthority;
    assert(A && typeof A.maybeAutoArm === 'function', 'maybeAutoArm must be published');
    assert(typeof A.__resetAutoArm === 'function' && typeof A.__setInventoryArmEnabledForTest === 'function',
      'the auto-arm test seams must be published');
    try {
      A.markInventoryAuthorityLive(false);
      A.__resetAutoArm();                        // pristine, not disarmed
      A.__setInventoryArmEnabledForTest(false);  // BUILD GATE CLOSED — the prod default
      IA.rebuildItemAuthority();
      A.noteBaselineComplete({ inventory_complete: true });   // guard (b) satisfied

      /* Drive a full COMPLETE envelope through the real apply path — the actual
         call site of maybeAutoArm. It must stay dormant. */
      const G = { gold: 0, skills: {}, equipment: {}, inventory: { ember_bar: 3 } };
      A.applyEnvelopeState(G, { state: {}, skills: {}, equipment: {}, inventory_complete: true, inventory: { ember_bar: 3 } });
      assert(A.isInventoryAuthorityLive() === false, 'the flip must NOT arm while the enable flag is false');
      assert(A.isInventoryAbsolute() === false, 'the bag must stay on merge while disabled');

      /* A direct call is equally inert. */
      assert(A.maybeAutoArm() === false, 'maybeAutoArm must be a no-op while disabled');
      assert(A.isInventoryAuthorityLive() === false, 'still unarmed after a direct maybeAutoArm');
    } finally {
      A.__setInventoryArmEnabledForTest(undefined);   // restore the build-flag value
      A.markInventoryAuthorityLive(false);
      A.__resetAutoArm();
    }
  }),

  () => tryRunAsync('AUTO-ARM-2: enabled + guards met, the boot auto-arm arms EXACTLY ONCE and never re-arms', async () => {
    const A = window.HearthriseAccrual;
    const IA = window.HearthriseItemAuthority;
    IA.rebuildItemAuthority();
    try {
      A.markInventoryAuthorityLive(false);       // start unarmed…
      A.__resetAutoArm();                        // …and clear the disarm latch that set
      A.__setInventoryArmEnabledForTest(true);   // BUILD GATE OPEN — simulates the rollout commit
      /* Two rollout positions now: without the staged one open, this measures nothing. */
      A.__setInventoryArmStageForTest(true);
      A.noteServerArmPermission(true);   // …and the OBSERVED grant the tri-state arm needs
      A.noteBaselineComplete({ inventory_complete: true });   // guard (b)

      /* DORMANT-WORKER BRANCH (today's reality — see SERVER-OWNED-5): while worker
         production is an un-backed OWNABLE mint, flipArmBlockers() is non-empty, so
         the auto-arm MUST refuse — silently, never throwing. The backed (post-wipe)
         branch below is what arms; mirrors the dual-branch honesty of the sibling
         SERVER-OWNED / INVENTORY-BASELINE tests. */
      if (IA.flipArmBlockers().length) {
        assert(A.maybeAutoArm() === false, 'auto-arm must refuse while an un-backed OWNABLE mint lane remains');
        assert(A.isInventoryAuthorityLive() === false, 'a refused auto-arm leaves the flag OFF');
        /* And a full envelope through the live path must not arm or throw either. */
        const G = { gold: 0, skills: {}, equipment: {}, inventory: {} };
        A.applyEnvelopeState(G, { state: {}, skills: {}, equipment: {}, inventory_complete: true, inventory: {} });
        assert(A.isInventoryAuthorityLive() === false, 'the envelope path must not arm while blocked');
        return;
      }

      /* WORKERS-BACKED BRANCH (post-wipe): every guard holds → arms exactly once. */
      assert(A.maybeAutoArm() === true, 'guards met → the auto-arm must arm');
      assert(A.isInventoryAuthorityLive() === true, 'the flag must read armed');
      assert(A.maybeAutoArm() === false, 'a second call must be a no-op — idempotent, arms at most once');
      assert(A.isInventoryAuthorityLive() === true, 'still armed after the idempotent second call');

      /* A subsequent envelope must not re-arm and must not throw. */
      const G = { gold: 0, skills: {}, equipment: {}, inventory: { ember_bar: 2 } };
      A.applyEnvelopeState(G, { state: {}, skills: {}, equipment: {}, inventory_complete: true, inventory: { ember_bar: 2 } });
      assert(A.isInventoryAuthorityLive() === true, 'armed once, not re-armed on the next envelope');

      /* A DELIBERATE DISARM LATCHES — the auto-arm must not silently re-arm after it. */
      A.markInventoryAuthorityLive(false);
      assert(A.maybeAutoArm() === false, 'after a deliberate disarm, auto-arm must NOT re-arm this session');
      assert(A.isInventoryAuthorityLive() === false, 'stays disarmed for the session');
    } finally {
      A.__setInventoryArmEnabledForTest(undefined);
      A.__setInventoryArmStageForTest(undefined);
      A.__resetServerArmPermission();
      A.markInventoryAuthorityLive(false);
      A.__resetAutoArm();
    }
  }),

  () => tryRun('AUTO-ARM-3: enabled but a guard unmet (no baseline signal / no DUNGEONS) never arms and never throws', () => {
    const A = window.HearthriseAccrual;
    const IA = window.HearthriseItemAuthority;
    IA.rebuildItemAuthority();
    const savedDungeons = globalThis.DUNGEONS;
    try {
      A.markInventoryAuthorityLive(false);
      A.__resetAutoArm();
      A.__setInventoryArmEnabledForTest(true);   // enabled, so the GUARDS are what must hold the line
      A.__setInventoryArmStageForTest(true);      // …and STAGED on, or the stage masks the guard under test
      A.noteServerArmPermission(true);   // …and the OBSERVED grant the tri-state arm needs

      /* GUARD (b) unmet: no baseline-complete signal observed. */
      A.__resetBaselineComplete();
      let threw = false, armed = null;
      try { armed = A.maybeAutoArm(); } catch (e) { threw = true; }
      assert(threw === false, 'maybeAutoArm must never throw with an unobserved baseline signal');
      assert(armed === false && A.isInventoryAuthorityLive() === false, 'no baseline signal → no arm');

      /* GUARD (a) unmet: DUNGEONS absent (overlap-id safety). */
      A.noteBaselineComplete({ inventory_complete: true });
      globalThis.DUNGEONS = undefined;
      try { armed = A.maybeAutoArm(); } catch (e) { threw = true; }
      assert(threw === false, 'maybeAutoArm must never throw with DUNGEONS absent');
      assert(armed === false && A.isInventoryAuthorityLive() === false, 'no DUNGEONS → no arm');

      /* And an envelope arriving in that guard-unmet state must not arm or throw. */
      const G = { gold: 0, skills: {}, equipment: {}, inventory: {} };
      A.applyEnvelopeState(G, { state: {}, skills: {}, equipment: {}, inventory: {} });
      assert(A.isInventoryAuthorityLive() === false, 'an envelope in a guard-unmet state must not arm');
    } finally {
      globalThis.DUNGEONS = savedDungeons;
      A.__setInventoryArmEnabledForTest(undefined);
      A.__setInventoryArmStageForTest(undefined);
      A.__resetServerArmPermission();
      A.markInventoryAuthorityLive(false);
      A.__resetAutoArm();
      A.noteBaselineComplete({ inventory_complete: true });   // leave the signal observed for later tests
    }
  }),

  () => tryRun('EQUIP-WIRE-1: the equip request carries NAMES only, and refuses a bad map WHOLE', () => {
    const E = window.HearthriseEquip;
    assert(E && typeof E.buildEquipRequest === 'function', 'HearthriseEquip must be published');

    const built = E.buildEquipRequest({
      url: 'https://x.supabase.co', apiKey: 'k', token: 'tok', slot: 0,
      intentId: '11111111-1111-4111-a111-111111111111',
      equip: { weapon: 'iron_sword', shield: null },
    });
    assert(/\/functions\/v1\/hr-accrue$/.test(built.url),
      'the endpoint must be hr-accrue, got ' + built.url);
    assert(built.init.headers['Authorization'] === 'Bearer tok',
      'the equip intent must authenticate with a BEARER — the function reads identity from that '
      + 'header and nowhere else, which is also why sendBeacon can never carry one');
    const body = JSON.parse(built.init.body);
    assert(body.verb === 'equip', 'the verb must be `equip`, got ' + body.verb);
    assert(body.equip.weapon === 'iron_sword' && body.equip.shield === null,
      "a string means WEAR and null means TAKE OFF — hr_apply's own vocabulary, not a mode flag "
      + 'invented at the wire');
    /* ⚠ NO NUMBER MAY CROSS THIS BOUNDARY. An equip moves exactly one unit and
       the server decides where it came from. Every extra field is a number the
       server would have to disbelieve — and one day might not. */
    const FORBIDDEN = ['qty', 'price', 'stats', 'bonus', 'power', 'cost', 'from'];
    for (let i = 0; i < FORBIDDEN.length; i++) {
      const bad = FORBIDDEN[i];
      assert(!(bad in body) && !(bad in body.equip),
        'the equip request carries a `' + bad + '` field — gear would be forgeable from devtools');
    }

    /* WHOLE-MAP REFUSAL. Half-sending a loadout because one slot name was wrong
       is a partial write, and a client that trimmed the bad pair would be
       inventing an instruction the player never gave. */
    const HOSTILE = [
      ['a numeric item', { weapon: 5 }], ['an uppercase id', { weapon: 'Iron_Sword' }],
      ['a bad slot name', { 'wea pon': 'iron_sword' }],
      ['one bad pair among good ones', { weapon: 'iron_sword', shield: 'BAD!' }], ['an empty map', {}],
      ['an array', ['weapon']],
    ];
    for (let i = 0; i < HOSTILE.length; i++) {
      assert(E.validateEquipOps(HOSTILE[i][1]).ok === false,
        'validateEquipOps ACCEPTED ' + HOSTILE[i][0]);
    }
    assert(E.validateEquipOps({ weapon: 'iron_sword' }).ok === true,
      'validateEquipOps refused an HONEST map — every refusal above would then pass for the wrong '
      + 'reason, which is the assertion-that-asserts-nothing family');

    /* RULE 1: WE WERE NOT ANSWERED => REUSE THE KEY. A fresh key on an
       unanswered call is how one swap applies twice; a CORS failure, a DNS
       failure and a dead network are indistinguishable by design of the fetch
       spec and all three land here. */
    assert(E.isAnswered('unreachable') === false && E.isAnswered('timeout') === false,
      'an unanswered outcome must not mint a new key');
    assert(E.isAnswered('refused') === true && E.isAnswered('rate-limited') === true,
      'an ANSWERED refusal must mint a new key — a reused one replays the stored rejection');
  }),

  /* ── EQUIP-GESTURE / EQUIP-BATCH (b366) ───────────────────────────────────
     EQUIP-WIRE-1 above proves the TRANSPORT's bytes. These prove the thing that
     actually arms the flip: that a PLAYER'S GESTURE reaches it. The distinction
     is the whole reason `gestureWired` is a separate assertion from a
     configured endpoint — a client that believes the server's bag while still
     equipping locally is the b362 dupe at settle cadence.

     Driven through `window.equipItem` / `window.applyLoadout` — the real
     functions the buttons call — with only `fetch` replaced, so nothing here
     can pass against a routing that exists only in a helper. */
  () => tryRunAsync('EQUIP-GESTURE: a player equip goes to the SERVER, reconciles, and rolls back on a refusal', async () => {
    const E = window.HearthriseEquip;
    const A = window.HearthriseAccrual;
    assert(E && typeof E.configureEquip === 'function', 'HearthriseEquip must be published');
    assert(typeof window.routeEquipGesture === 'function',
      'legacy.js must publish routeEquipGesture — it is what auth.js looks for to decide whether the '
      + 'flip may arm, so its absence is the flip silently disarming');

    const S = window.HearthriseSync;
    const prevCfg = E.getEquipConfig();
    const realFetch = window.fetch;
    const wasAck = A.isReplacementAcknowledged();
    const wasHeld = S.isSnapshotHeld();
    const savedInv = { ...G.inventory }, savedEq = { ...G.equipment }, savedGold = G.gold;
    const notified = [];
    const realNotify = window.notify;
    let sent = [];
    const drain = () => new Promise((r) => setTimeout(r, 60));
    try {
      A.acknowledgeReplacement(true);
      /* The handoff deferral is a REAL branch on this path now (b366): with the
         reconcile unresolved a destructive-looking envelope writes nothing, and
         a live harness may legitimately be holding. Release it so this test
         measures the gesture rather than the gate — the gate has its own three. */
      S.releaseSnapshots();
      window.notify = function (msg) { notified.push(String(msg)); };
      await armEquipFlipForTest(E,
        { url: 'https://equip.test', apiKey: 'k', authToken: () => 'tok', slot: 0, gestureWired: true });
      assert(A.isEnvelopeAbsolute() === true,
        'an acknowledged equip round trip must arm the flip (b369 — a wired gesture alone no longer does)');

      let reply = null;
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        sent.push(JSON.parse(init.body));
        return Promise.resolve(new Response(JSON.stringify(reply.body), { status: reply.status }));
      };

      // ── 1. THE HAPPY PATH ────────────────────────────────────────────────
      G.gold = 0; G.equipment.weapon = null; G.inventory = { bronze_sword: 1, oak_log: 4 };
      reply = { status: 200, body: {
        ok: true, verb: 'equip', version: 2, now: '2026-08-18T00:00:00Z',
        state: { slot: 0, gold: 7, hp: 10, max_hp: 10 },
        skills: {}, inventory: { oak_log: 4 },
        equipment: { weapon: 'bronze_sword' }, collected: null,
      } };
      window.equipItem('bronze_sword');
      await drain();
      assert(sent.length === 1, 'one equip gesture must produce exactly ONE request — got ' + sent.length);
      assert(sent[0].verb === 'equip' && sent[0].equip.weapon === 'bronze_sword',
        'the gesture must send the swap it performed — got ' + JSON.stringify(sent[0]));
      assert(E.isIntentKey(sent[0].intentId), 'every equip must carry a canonical idempotency key');
      /* RECONCILED, not merely sent: the envelope is the truth and it was
         applied through the same applier the away card uses. */
      assert(G.gold === 7, 'the equip envelope must be applied — gold is ' + G.gold);
      assert(G.equipment.weapon === 'bronze_sword', 'the server\'s worn set must land');
      assert(!(Number(G.inventory.bronze_sword) > 0),
        'the equipped copy must not sit in the bag as well — got ' + G.inventory.bronze_sword);

      // ── 2. S4: A GESTURE THAT CHANGES NOTHING SENDS NOTHING ──────────────
      /* hr_apply stamps accrued_to on ANY delta carrying `equip`, and a collect
         under the 60 s floor answers below_min_span while the stamp still
         lands — so a no-op gesture is a confiscated window. */
      sent = [];
      window.equipItem('bronze_sword');            // already worn
      await drain();
      assert(sent.length === 0,
        'a swap that changes nothing must not be sent — it would stamp accrued_to and confiscate the '
        + 'unpaid window for no gain (S4). Got ' + sent.length + ' request(s)');

      // ── 3. A REFUSAL ROLLS THE PREDICTION BACK AND SAYS WHY ──────────────
      sent = []; notified.length = 0;
      G.equipment.weapon = null; G.inventory = { bronze_sword: 1 };
      reply = { status: 409, body: { ok: false, verb: 'equip', error: 'requirement_not_met' } };
      window.equipItem('bronze_sword');
      await drain();
      assert(sent.length === 1, 'the refused gesture must still have been sent');
      assert(G.equipment.weapon === null && G.inventory.bronze_sword === 1,
        'a refused equip must roll the local prediction back — the player is left wearing something the '
        + 'server says they are not. Got equipment=' + JSON.stringify(G.equipment)
        + ' inventory=' + JSON.stringify(G.inventory));
      assert(notified.some((m) => /requirement/i.test(m)),
        'the server\'s reason must reach the player through the toast path — got ' + JSON.stringify(notified));
      /* THE REASON IS KEYED ON THE CODE ONLY, which is what makes the client
         independent of 2026-08-18-equip-release-codes.sql being applied: that
         migration changes which intent keys a refusal RELEASES and renames
         nothing. And no refusal is auto-retried on the same key, so an
         unpatched database cannot replay a stored rejection at us. */
      assert(E.equipRefusalMessage('requirement_not_met') !== E.equipRefusalMessage('wrong_slot'),
        'each released code must say something specific');
      assert(/hr_unknown_code/.test(E.equipRefusalMessage('hr_unknown_code')),
        'a code this build has never heard of must still be quotable in a bug report — got '
        + E.equipRefusalMessage('hr_unknown_code'));
    } finally {
      window.fetch = realFetch;
      window.notify = realNotify;
      E.resetEquip();
      if (prevCfg) E.configureEquip(prevCfg);
      A.acknowledgeReplacement(wasAck);
      if (wasHeld) S.holdSnapshots(); else S.releaseSnapshots();
      G.inventory = savedInv; G.equipment = savedEq; G.gold = savedGold;
    }
    assert(A.isEnvelopeAbsolute() === false, 'the flip must disarm when the transport is torn down');
  }),

  () => tryRunAsync('EQUIP-ASSERT-1: a character the server never learnt about states its worn set ONCE', async () => {
    /* ⚠ THE CONDITION THAT MAKES ARMING THE FLIP SAFE. Every character created
       before b366 has an EMPTY `player_equipment` and its worn copies still
       counted in `player_inventory`. Under absolute, that bag figure is
       assigned outright — so the worn copy comes back into the bag while the
       player is still wearing it, and it is a copy the SERVER believes in, so
       it is sellable on the real market. b362 with the sign flipped.
       MUTATION: delete the assertEquipDeclaration() call from
       applyServerEnvelope → the first block goes red. */
    const E = window.HearthriseEquip;
    const A = window.HearthriseAccrual;
    const S = window.HearthriseSync;
    const prevCfg = E.getEquipConfig();
    const realFetch = window.fetch;
    const realNotify = window.notify;
    const wasAck = A.isReplacementAcknowledged();
    const wasHeld = S.isSnapshotHeld();
    const savedInv = { ...G.inventory }, savedEq = { ...G.equipment }, savedGold = G.gold;
    let sent = [];
    const drain = () => new Promise((r) => setTimeout(r, 60));
    /* ⚠ THE VERSION MOVES PER CALL (M5). This fixture is applied FIVE times to
       ONE character, and on a real server five accepted writes are five
       versions — hr_apply bumps it under the per-character lock every time.
       Pinning it at 5 made the second and later applies duplicates, which the
       frame gate correctly drops (WORLD_TICK_DESIGN.md §7.1), and the self-heal
       under test would then never see an envelope at all. */
    let awayVersion = 5;
    const awayEnvelope = (equipment) => ({
      ok: true, accrued: true, version: awayVersion++, now: '2026-08-18T00:00:00Z',
      state: { slot: 0, gold: 3, hp: 10, max_hp: 10 },
      skills: {}, inventory: { iron_sword: 1 }, equipment,
      away: { grantMs: 0, gold: 0, xp: {}, items: {} },
    });
    try {
      window.__resetEquipAssertion();
      A.acknowledgeReplacement(true);
      S.releaseSnapshots();
      window.notify = function () {};
      /* b369: the self-heal only runs under the ABSOLUTE envelope, and absolute
         is now earned by an acknowledged round trip rather than asserted by
         configuration. Arm it the only way the suite may. */
      await armEquipFlipForTest(E,
        { url: 'https://equip.test', apiKey: 'k', authToken: () => 'tok', slot: 0, gestureWired: true });
      window.__resetEquipAssertion();
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        sent.push(JSON.parse(init.body));
        return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'insufficient_item' }), { status: 409 }));
      };

      /* ══════════════════════════════════════════════════════════════════════
         b456 — UNDER THE EQUIPMENT ARM THE DISAGREEMENT CANNOT SURVIVE THE APPLY,
         AND THAT IS A STRONGER GUARANTEE THAN THE SELF-HEAL.

         The self-heal exists because a b366-era character wore items the server
         had never been told about, so the server kept counting the worn copy in
         `player_inventory` and absolute handed it back. `equipment` is now a
         RECORD field: applyServerEnvelope calls applyRecord FIRST, which replaces
         `G.equipment` with the server's set outright, so by the time the self-heal
         is reached there is nothing left to disagree about — by construction, not
         by timing. The two halves are asserted separately:
           ARMED   → the worn set after the apply IS the server's, and no assertion
                     intent is sent (there is nothing to assert).
           DORMANT → the client owns G.equipment, the disagreement is real, and the
                     self-heal fires exactly once, states only what is WORN, latches,
                     and stays silent on agreement and under the merge.
         ══════════════════════════════════════════════════════════════════════ */
      const R = window.HearthriseRecord;
      const equipArmed = !!(R && typeof R.isEquipmentRecordArmed === 'function' && R.isEquipmentRecordArmed());
      if (equipArmed) {
        G.gold = 0; G.inventory = {}; G.equipment = { weapon: 'iron_sword' };
        sent = [];
        window.applyServerEnvelope(awayEnvelope({}), {});
        await drain();
        assert(!(G.equipment && G.equipment.weapon),
          'ARMED: applyRecord did not replace the worn set with the server\'s — a client-authored slot survived '
          + 'an absolute envelope, which is the two-sources bug the record exists to end: ' + JSON.stringify(G.equipment));
        assert(sent.length === 0,
          'ARMED: an equip-assertion intent was sent even though the record had already replaced the worn set — '
          + 'that is one intent and one rate spend healing a disagreement that no longer exists. Got ' + sent.length);
      }

      /* ── THE SELF-HEAL ITSELF, in the position where a disagreement is possible. */
      try {
        if (R && typeof R.__setEquipmentRecordArm === 'function') R.__setEquipmentRecordArm(false);
        window.__resetEquipAssertion();
        sent = [];
        /* THE LEGACY CHARACTER: wearing a sword the server counts in the BAG. */
        G.gold = 0; G.inventory = {}; G.equipment = { weapon: 'iron_sword' };
        window.applyServerEnvelope(awayEnvelope({}), {});
        await drain();
        assert(sent.length === 1,
          'an envelope whose equipment disagrees must assert the worn set exactly once — got ' + sent.length
          + ' request(s). Without it the server keeps counting the worn copy in the bag, and under absolute '
          + 'that copy is handed back to a player who is still wearing it.');
        assert(sent[0].verb === 'equip' && sent[0].equip.weapon === 'iron_sword',
          'the assertion must state what is WORN — got ' + JSON.stringify(sent[0].equip));
        const takesOff = Object.keys(sent[0].equip).filter((k) => sent[0].equip[k] === null);
        assert(takesOff.length === 0,
          'the self-heal must never ask the server to take something OFF — "the server thinks I wear nothing" '
          + 'and "I want to unequip" are different sentences. Got ' + JSON.stringify(sent[0].equip));

        /* LATCHED. The refusal above is the realistic one (a client-only item the
           server never granted); one intent, not one per envelope forever. */
        sent = [];
        G.equipment = { weapon: 'iron_sword' };
        window.applyServerEnvelope(awayEnvelope({}), {});
        await drain();
        assert(sent.length === 0,
          'the assertion must be latched on the map it sent — got ' + sent.length + ' repeat(s), i.e. one '
          + 'intent and one rate spend on every envelope for the rest of the session');

        /* AGREEMENT IS SILENT. Nothing to heal, nothing sent. */
        window.__resetEquipAssertion();
        sent = [];
        G.equipment = { weapon: 'iron_sword' };
        window.applyServerEnvelope(awayEnvelope({ weapon: 'iron_sword' }), {});
        await drain();
        assert(sent.length === 0,
          'a server that already agrees must not be told again — got ' + sent.length + ' request(s)');

        /* AND UNDER THE MERGE IT IS INERT: nothing is being assigned absolutely,
           so there is nothing to heal and the b363 discount still does that job. */
        window.__resetEquipAssertion();
        E.resetEquip();
        assert(A.isEnvelopeAbsolute() === false, 'the control: the flip must be disarmed here');
        sent = [];
        G.equipment = { weapon: 'iron_sword' };
        window.applyServerEnvelope(awayEnvelope({}), {});
        await drain();
        assert(sent.length === 0,
          'the self-heal must not fire while the envelope is still MERGED — got ' + sent.length);
      } finally {
        if (R && typeof R.__setEquipmentRecordArm === 'function') R.__setEquipmentRecordArm(null);
      }
    } finally {
      window.fetch = realFetch;
      window.notify = realNotify;
      window.__resetEquipAssertion();
      E.resetEquip();
      if (prevCfg) E.configureEquip(prevCfg);
      A.acknowledgeReplacement(wasAck);
      if (wasHeld) S.holdSnapshots(); else S.releaseSnapshots();
      G.inventory = savedInv; G.equipment = savedEq; G.gold = savedGold;
    }
  }),

  () => tryRunAsync('EQUIP-BATCH: applying a loadout is ONE request carrying the whole map', async () => {
    /* The accrue bucket is 30/min and is SHARED with settling. Fifteen calls
       for one tap would spend half of it, run fifteen collects, and stamp
       fourteen sub-minute windows (S4, once per slot). The wire takes a map
       precisely so a loadout is one gesture. */
    const E = window.HearthriseEquip;
    const A = window.HearthriseAccrual;
    const S = window.HearthriseSync;
    const prevCfg = E.getEquipConfig();
    const realFetch = window.fetch;
    const realNotify = window.notify;
    const wasAck = A.isReplacementAcknowledged();
    const wasHeld = S.isSnapshotHeld();
    const savedInv = { ...G.inventory }, savedEq = { ...G.equipment }, savedGold = G.gold;
    const savedLoadouts = G.loadouts;
    let sent = [];
    const drain = () => new Promise((r) => setTimeout(r, 60));
    try {
      A.acknowledgeReplacement(true);
      S.releaseSnapshots();
      window.notify = function () {};
      await armEquipFlipForTest(E,
        { url: 'https://equip.test', apiKey: 'k', authToken: () => 'tok', slot: 0, gestureWired: true });
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        sent.push(JSON.parse(init.body));
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, verb: 'equip', version: 3, now: '2026-08-18T00:00:00Z',
          state: { slot: 0, gold: 0, hp: 10, max_hp: 10 }, skills: {},
          inventory: {}, equipment: { weapon: 'bronze_sword', helmet: 'bronze_helm' },
          collected: null,
        }), { status: 200 }));
      };

      G.gold = 0;
      G.equipment = { weapon: null, helmet: null, body: null };
      G.inventory = { bronze_sword: 1, bronze_helm: 1 };
      G.loadouts = [{ name: 'Test kit', set: true,
        equipment: { weapon: 'bronze_sword', helmet: 'bronze_helm' }, tools: {}, foodSlot: null }];
      // Bronze is tier 1, so the kit passes the wield gate on its own merits.

      window.applyLoadout(0);
      await drain();
      assert(sent.length === 1,
        'applying a loadout must be ONE request, not one per slot — got ' + sent.length
        + ' (the accrue bucket is 30/min and shared with settling)');
      const ops = sent[0].equip;
      assert(ops.weapon === 'bronze_sword' && ops.helmet === 'bronze_helm',
        'the batch must carry every slot that MOVED — got ' + JSON.stringify(ops));
      assert(!('body' in ops),
        'a slot that did not move must not be in the map — an unchanged slot is not an instruction the '
        + 'player gave. Got ' + JSON.stringify(ops));
      assert(Object.keys(ops).length <= E.MAX_EQUIP_OPS,
        'a loadout must never exceed the server\'s MAX_EQUIP_OPS');

      /* S4 AGAIN, AT BATCH SCALE: re-tapping the kit you already wear diffs to
         nothing, so it cannot stamp a second window. */
      sent = [];
      window.applyLoadout(0);
      await drain();
      assert(sent.length === 0,
        're-applying the loadout already worn must send nothing — got ' + sent.length + ' request(s)');
    } finally {
      window.fetch = realFetch;
      window.notify = realNotify;
      E.resetEquip();
      if (prevCfg) E.configureEquip(prevCfg);
      A.acknowledgeReplacement(wasAck);
      if (wasHeld) S.holdSnapshots(); else S.releaseSnapshots();
      G.inventory = savedInv; G.equipment = savedEq; G.gold = savedGold; G.loadouts = savedLoadouts;
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     PHASE 1 — LIVE SETTLEMENT. docs/design/live-settlement.md §3, §5.2, §7.
     ══════════════════════════════════════════════════════════════════════
     Phase 0 (the in-fight carry) is live and is graded by tests/live-settlement
     .mjs against the real engine and real PostgreSQL. THESE tests are the
     CLIENT half: the trigger, the cadence, and the consumption fix.

     Every one of them is driven through an injected clock, timer and transport
     (`setSettleEnv`), because a test that actually waited ninety seconds is a
     test nobody runs — and the reason `decideSettle` is a pure function taking
     the whole world as an argument is so the §3.1 table is assertable without
     a document, a timer or a server. */

  () => tryRun('SETTLE-2: a settle that DEBITS an item reduces the client copy; a credit still merges', () => {
    /* §5.2 — the consumption hole in the b359 max, and the reason Phase 1 has
       to close it now rather than at Phase 2. The max is a one-way ratchet: it
       can only raise the client's number. Away, "the server ate three shrimp
       and the client kept them" fired on the rare night that auto-ate. At a
       90 s cadence it fires ~320 times a day, which is a faucet.

       MUTATION PROOF: revert the debit branch to the plain `Math.max` and
       blocks 1, 2 and 3 all go red. Block 4 is the other direction — a fix that
       simply started trusting the envelope absolutely would take the reporting
       player's 14 dragon scales back, so B359-1's protection is re-asserted
       here against a change made in THIS block. */
    const A = window.HearthriseAccrual;
    assert(typeof A.consumedKeysOf === 'function', 'consumedKeysOf must be published');

    /* 1. THE CRAFT NIGHT. The server consumed 3 of 10 shrimp auto-eating; the
       client's own prediction had not caught up and still shows 10. The server
       figure is authoritative for a key it says it SPENT, because the client
       cannot have spent it on the server's behalf. */
    const G = { gold: 0, skills: {}, inventory: { shrimp: 10, dragon_scale: 14 }, equipment: {} };
    A.applyEnvelopeState(G, {
      state: {}, skills: {}, inventory: { shrimp: 7 }, equipment: {},
      away: { items: { shrimp: -3 } },
    });
    assert(G.inventory.shrimp === 7,
      'a DEBITED item must take the server figure even though the client held MORE — got ' + G.inventory.shrimp);
    assert(G.inventory.dragon_scale === 14,
      'b359 must survive: an omitted key is still unknown, not zero — got ' + G.inventory.dragon_scale);

    /* 2. THE CASE THAT MATTERS MOST, AND THAT A NAIVE FIX MISSES ENTIRELY.
       hr_apply DELETEs the `player_inventory` row at qty 0 (2026-08-11-apply-
       engine.sql) and `hr_state_of` aggregates the surviving rows — so "ate the
       LAST three shrimp" arrives as `away.items:{shrimp:-3}` with NO
       `inventory.shrimp` at all. A fix that only walked the envelope's own keys
       would close nothing here. The debit list is a POSITIVE statement, which is
       what makes reading its omission as zero legitimate. */
    const G2 = { gold: 0, skills: {}, inventory: { shrimp: 3, ember_bar: 5 }, equipment: {} };
    A.applyEnvelopeState(G2, {
      state: {}, skills: {}, inventory: {}, equipment: {},
      away: { items: { shrimp: -3 } },
    });
    assert(!('shrimp' in G2.inventory),
      'a FULLY consumed item is omitted by the envelope and must go to zero — got ' + G2.inventory.shrimp);
    assert(G2.inventory.ember_bar === 5,
      'an ordinary omitted key must still survive — omission only speaks for a key the receipt DEBITED');

    /* 3. PRECEDENCE WITH THE b362 EQUIP DISCOUNT — both apply, discount first.
       An artisan input that is also worn (a torch, a tool) must not ride an
       equip dupe in on a span that happened to spend some. */
    const G3 = { gold: 0, skills: {}, inventory: {}, equipment: { tool: 'iron_pick' } };
    A.applyEnvelopeState(G3, {
      state: {}, skills: {}, inventory: { iron_pick: 1 }, equipment: {},
      away: { items: { iron_pick: -1 } },
    });
    assert(!(Number(G3.inventory.iron_pick) > 0),
      'the equip discount must still apply to a debited key — got ' + G3.inventory.iron_pick + ' in the bag AND one worn');

    /* 4. B359 AND B362 ARE NOT WEAKENED BY THE NEW BRANCH. A CREDIT still
       merges by max, so a live-earned stack the server has never seen survives
       an envelope that also debits something else. */
    const G4 = { gold: 0, skills: {}, inventory: { dragon_scale: 14, shrimp: 4 }, equipment: {} };
    A.applyEnvelopeState(G4, {
      state: {}, skills: {}, inventory: { dragon_scale: 2, shrimp: 3, rune_bar: 9 }, equipment: {},
      away: { items: { shrimp: -1, rune_bar: 9 } },
    });
    assert(G4.inventory.dragon_scale === 14, 'a CREDITED/untouched key must keep b359\'s max');
    assert(G4.inventory.shrimp === 3, 'the debited key must take the server figure');
    assert(G4.inventory.rune_bar === 9, 'a positive receipt entry is a CREDIT and must arrive');

    /* 5. NO RECEIPT AT ALL (an activity-switch envelope carries no `away`) must
       behave exactly as b359/b362 did. The fix may not change the shape of a
       call it was not written for. */
    const G5 = { gold: 0, skills: {}, inventory: { shrimp: 10 }, equipment: {} };
    A.applyEnvelopeState(G5, { state: {}, skills: {}, inventory: { shrimp: 7 } });
    assert(G5.inventory.shrimp === 10,
      'with no away receipt there is no debit statement, so the max must stand — got ' + G5.inventory.shrimp);
    assert(A.consumedKeysOf({}).size === 0 && A.consumedKeysOf(null).size === 0,
      'consumedKeysOf must fail closed to an EMPTY set, never null');
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     EAT-RESTOCK — THE LIVE P0, REPORTED FOUR TIMES (b467 → b479).

       "Food eaten while in combat gets restocked."
       "have 2 moonblood and everytime i use 1 it returns back in my inventory."

     ROOT CAUSE, and it is arithmetic rather than a race condition on its own:
     every branch of `reconcileInventory` takes the LARGER of the client's copy
     and the server's figure (or, for an OWNED id under absolute, the server's
     figure outright). A locally-eaten unit makes the client's copy SMALLER, so
     an envelope that still names the pre-eat count HANDS THE UNIT BACK BY
     CONSTRUCTION. And it does not heal: `have` is itself the ratcheted value, so
     the eat's own — correct — response then loses the max and the client stays
     permanently one ahead of the server. A dupe as well as a bug.

     Two defects produced the one report and both are covered here:
       · the reconcile restocking a unit the server has not settled yet
         (EAT-RESTOCK-1..4, the pending-consumption fold), and
       · AUTO-eat never telling the server anything at all, so the server kept
         every auto-eaten Provision and handed it back on the next envelope AND
         after a reload (EAT-RESTOCK-5).

     MUTATION PROOF: delete the `foldPendingConsume` call in reconcileInventory
     and 1, 2 and 4 go red; delete the `noteItemConsumed` call in
     auto-actions.js `maybeAutoEat` and 5 goes red. */

  () => tryRun('EAT-RESTOCK-1: an envelope naming the PRE-EAT count must not restock the food (merge branch)', () => {
    const A = window.HearthriseAccrual;
    assert(typeof A.noteConsumed === 'function' && typeof A.foldPendingConsume === 'function'
      && typeof A.pendingConsumeFor === 'function',
      'the pending-consumption ledger must be published on HearthriseAccrual');
    assert(window.HearthrisePendingConsume && typeof window.HearthrisePendingConsume.noteConsumed === 'function',
      'the ledger module must publish itself for legacy.js (a classic script cannot import)');

    /* Pin MERGE for the whole block, deterministically, rather than depending on
       whether an earlier test left equip/inventory authority armed. */
    let hadKey = null;
    try { hadKey = localStorage.getItem(A.ENVELOPE_MERGE_KEY); } catch (e) { hadKey = null; }
    try {
      try { localStorage.setItem(A.ENVELOPE_MERGE_KEY, 'on'); } catch (e) {}
      assert(A.isInventoryAbsolute() === false, 'this block asserts the MERGE branch');

      /* THE LITERAL REPORT. `moonbloom` (the player's "moonblood") is a CROP
         product, so it is EXCLUDED from the ownable set and takes the max path
         in BOTH branches — which is why it was the one they noticed. */
      const G = { gold: 0, skills: {}, equipment: {}, inventory: { moonbloom: 2 } };
      G.inventory.moonbloom = 1;                  // the eat: the client debits…
      A.noteConsumed(G, 'moonbloom', 1);          // …and records the unit as unsettled
      assert(A.pendingConsumeFor(G, 'moonbloom') === 1, 'the eaten unit must be held');

      /* An envelope built BEFORE the eat landed — the ordinary case, because the
         settle loop and the eat intent are independent round trips. */
      A.applyEnvelopeState(G, { state: {}, skills: {}, equipment: {}, inventory: { moonbloom: 2 } });
      assert(G.inventory.moonbloom === 1,
        'the eaten Moonbloom must NOT come back — got ' + G.inventory.moonbloom);

      /* AND IT MUST STAY GONE. A second stale envelope was the part players
         actually felt: without the hold the first one ratchets 2 back in and
         nothing can ever bring it down again. */
      A.applyEnvelopeState(G, { state: {}, skills: {}, equipment: {}, inventory: { moonbloom: 2 } });
      assert(G.inventory.moonbloom === 1,
        'a SECOND stale envelope must not restock it either — got ' + G.inventory.moonbloom);

      /* THE SERVER CATCHES UP. Its figure comes down, the hold drains on that
         evidence, and no further envelope may subtract again — otherwise the fix
         would eat a second Moonbloom the player still owns. */
      A.applyEnvelopeState(G, { state: {}, skills: {}, equipment: {}, inventory: { moonbloom: 1 } });
      assert(G.inventory.moonbloom === 1, 'the settled figure is believed — got ' + G.inventory.moonbloom);
      assert(A.pendingConsumeFor(G, 'moonbloom') === 0, 'the hold must drain on the server\'s own movement');
      A.applyEnvelopeState(G, { state: {}, skills: {}, equipment: {}, inventory: { moonbloom: 4 } });
      assert(G.inventory.moonbloom === 4,
        'once drained, a real credit must arrive in full — no lingering subtraction; got ' + G.inventory.moonbloom);
    } finally {
      try {
        if (hadKey === null) localStorage.removeItem(A.ENVELOPE_MERGE_KEY);
        else localStorage.setItem(A.ENVELOPE_MERGE_KEY, hadKey);
      } catch (e) {}
    }
  }),

  () => tryRun('EAT-RESTOCK-2: the hold cannot MINT, cannot be forged into a deletion, and expires', () => {
    const A = window.HearthriseAccrual;
    const P = window.HearthrisePendingConsume;
    let hadKey = null;
    try { hadKey = localStorage.getItem(A.ENVELOPE_MERGE_KEY); } catch (e) { hadKey = null; }
    try {
      try { localStorage.setItem(A.ENVELOPE_MERGE_KEY, 'on'); } catch (e) {}

      /* 1. THE ANTI-FORGERY DIRECTION. A hand-written hold may never subtract
         more than what actually went through `noteConsumed` this session — the
         `seen` clamp — and in the merge branch it can never take an item out of
         the bag at all, because the reconcile still ends at Math.max(have, …). */
      const G = { gold: 0, skills: {}, equipment: {}, inventory: { rune_bar: 9 } };
      A.noteConsumed(G, 'rune_bar', 1);
      G._pendingConsume.rune_bar.qty = 50;                 // forged, structurally sane
      const eff = A.foldPendingConsume(G, { rune_bar: 10 }, {});
      assert(eff.rune_bar === 9,
        'a forged qty must be clamped at what was actually observed eaten — got ' + eff.rune_bar);

      const G2 = { gold: 0, skills: {}, equipment: {}, inventory: { rune_bar: 9 } };
      A.noteConsumed(G2, 'rune_bar', 1);
      G2._pendingConsume.rune_bar.qty = 9e9;               // beyond the structural cap
      const eff2 = A.foldPendingConsume(G2, { rune_bar: 10 }, {});
      assert(eff2.rune_bar === 10, 'a structurally impossible hold is DROPPED, not honoured — got ' + eff2.rune_bar);

      /* 2. IT CANNOT MINT, IN ANY DIRECTION. The fold only ever LOWERS, never
         adds a key, and never mutates the caller's object. That single property
         is what makes it safe to run on all ~320 envelopes a day. */
      const G3 = { gold: 0, skills: {}, equipment: {}, inventory: {} };
      A.noteConsumed(G3, 'coal', 5);
      const src = { coal: 3, iron_ore: 4 };
      const out = A.foldPendingConsume(G3, src, {});
      assert(out.coal <= 3 && out.iron_ore === 4, 'the fold may never RAISE a figure');
      assert(src.coal === 3 && Object.keys(src).length === 2, 'the envelope object must not be mutated');
      assert(!('moonbloom' in out), 'the fold must never ADD a key the envelope omitted');

      /* 3. THE SAFETY VALVE. An unacknowledged hold must not suppress a real
         stack for a whole session — after the TTL the server is believed again,
         which is honest, because at that point it really does still hold it. */
      const G4 = { gold: 0, skills: {}, equipment: {}, inventory: { turnip: 1 } };
      A.noteConsumed(G4, 'turnip', 1, { nowMs: 0 });
      const late = A.foldPendingConsume(G4, { turnip: 2 }, { nowMs: P.ENTRY_TTL_MS + 1 });
      assert(late.turnip === 2, 'after the TTL the server figure wins again — got ' + late.turnip);
      assert(A.pendingConsumeFor(G4, 'turnip', P.ENTRY_TTL_MS + 1) === 0, 'the expired hold is gone');

      /* 4. BOUNDED AT 10x CONTENT SCALE — a mis-wired caller cannot grow G. */
      const G5 = { gold: 0, skills: {}, equipment: {}, inventory: {} };
      for (let i = 0; i < P.MAX_IDS * 3; i++) A.noteConsumed(G5, 'probe_' + i, 1, { nowMs: 1000 + i });
      assert(Object.keys(G5._pendingConsume).length === P.MAX_IDS,
        'the ledger must be bounded at MAX_IDS — got ' + Object.keys(G5._pendingConsume).length);

      /* 5. ZERO COST WHEN NOTHING IS HELD — the hot path is untouched. */
      const G6 = { gold: 0, skills: {}, equipment: {}, inventory: {} };
      const same = { coal: 3 };
      assert(A.foldPendingConsume(G6, same, {}) === same,
        'with an empty ledger the fold must return the SAME object (no allocation, no behaviour change)');
    } finally {
      try {
        if (hadKey === null) localStorage.removeItem(A.ENVELOPE_MERGE_KEY);
        else localStorage.setItem(A.ENVELOPE_MERGE_KEY, hadKey);
      } catch (e) {}
    }
  }),

  () => tryRunAsync('EAT-RESTOCK-3: the ABSOLUTE branch must not restock an eaten OWNED food either', async () => {
    const A = window.HearthriseAccrual;
    const E = window.HearthriseEquip;
    const IA = window.HearthriseItemAuthority;
    /* Same dual-branch honesty as the INVENTORY-BASELINE tests: while an
       un-backed OWNABLE mint lane remains, arming correctly refuses and the
       absolute scenario is unreachable. */
    if (IA && IA.flipArmBlockers && IA.flipArmBlockers().length) {
      let refused = false;
      try { A.markInventoryAuthorityLive(true); } catch (e) { refused = true; }
      assert(refused === true, 'arming must refuse while an un-backed OWNABLE mint lane remains');
      return;
    }
    const prev = E.getEquipConfig();
    try {
      await armEquipFlipForTest(E);
      A.noteBaselineComplete({ inventory_complete: true });
      A.markInventoryAuthorityLive(true);
      assert(A.isInventoryAbsolute() === true, 'this block asserts the ABSOLUTE branch');

      /* `shrimp` is a gather product — OWNABLE — so the absolute branch ASSIGNS
         the server figure outright. That is strictly worse than the max: it does
         not merely restock the eaten unit, it overwrites the client with a count
         the server has not caught up to. */
      const G = { gold: 0, skills: {}, equipment: {}, inventory: { shrimp: 3 } };
      G.inventory.shrimp = 2;
      A.noteConsumed(G, 'shrimp', 1);
      A.applyEnvelopeState(G, {
        state: {}, skills: {}, equipment: {}, inventory_complete: true, inventory: { shrimp: 3 },
      });
      assert(G.inventory.shrimp === 2,
        'the eaten shrimp must not be re-asserted by the absolute assign — got ' + G.inventory.shrimp);

      /* THE LAST ONE. hr_apply DELETEs the row at zero and hr_state_of omits it,
         so a complete envelope that OMITS an owned id is a real zero — which is
         also the server agreeing the eat landed, and must drain the hold rather
         than leave it to subtract from a future re-acquisition. */
      const G2 = { gold: 0, skills: {}, equipment: {}, inventory: { shrimp: 1 } };
      G2.inventory.shrimp = 0; delete G2.inventory.shrimp;
      A.noteConsumed(G2, 'shrimp', 1, { before: 1 });
      A.applyEnvelopeState(G2, {
        state: {}, skills: {}, equipment: {}, inventory_complete: true, inventory: {},
      });
      assert(!('shrimp' in G2.inventory), 'a fully-eaten owned stack stays gone');
      assert(A.pendingConsumeFor(G2, 'shrimp') === 0,
        'a COMPLETE envelope omitting the id is the server agreeing — the hold must drain');
      A.applyEnvelopeState(G2, {
        state: {}, skills: {}, equipment: {}, inventory_complete: true, inventory: { shrimp: 6 },
      });
      assert(G2.inventory.shrimp === 6,
        'a later re-acquisition must arrive in full, not one short — got ' + G2.inventory.shrimp);
    } finally {
      A.markInventoryAuthorityLive(false);
      E.resetEquip();
      if (prev) E.configureEquip(prev);
    }
  }),

  () => tryRun('EAT-RESTOCK-4: the away receipt still wins, and nothing double-subtracts', () => {
    const A = window.HearthriseAccrual;
    let hadKey = null;
    try { hadKey = localStorage.getItem(A.ENVELOPE_MERGE_KEY); } catch (e) { hadKey = null; }
    try {
      try { localStorage.setItem(A.ENVELOPE_MERGE_KEY, 'on'); } catch (e) {}

      /* AWAY IS THE SERVER'S. When the server states a debit in `away.items` it
         has already spent the unit, so a client hold on the same id must DRAIN
         against that movement rather than subtract a second time — otherwise the
         fix would delete food the player still owns, which is the one direction
         that is worse than the bug. */
      const G = { gold: 0, skills: {}, equipment: {}, inventory: { shrimp: 9 } };
      G.inventory.shrimp = 8;
      A.noteConsumed(G, 'shrimp', 1);                       // one eaten live, unsettled
      A.applyEnvelopeState(G, {
        state: {}, skills: {}, equipment: {},
        inventory: { shrimp: 6 },                           // server: 9 → 6
        away: { items: { shrimp: -3 } },                    // …and says so
      });
      assert(G.inventory.shrimp === 6,
        'a stated server debit is authoritative and must not be subtracted twice — got ' + G.inventory.shrimp);
      assert(A.pendingConsumeFor(G, 'shrimp') === 0,
        'the server figure moved past the hold, so the hold is settled');

      /* SETTLE-2's properties are untouched by the fold: a credited/omitted key
         still keeps b359's max, and a debited key still takes the server's
         figure, with no hold in play at all. */
      const G2 = { gold: 0, skills: {}, equipment: {}, inventory: { dragon_scale: 14, shrimp: 4 } };
      A.applyEnvelopeState(G2, {
        state: {}, skills: {}, equipment: {},
        inventory: { dragon_scale: 2, shrimp: 3, rune_bar: 9 },
        away: { items: { shrimp: -1, rune_bar: 9 } },
      });
      assert(G2.inventory.dragon_scale === 14, 'b359\'s max must survive the fold');
      assert(G2.inventory.shrimp === 3, 'a debited key still takes the server figure');
      assert(G2.inventory.rune_bar === 9, 'a credit still arrives');
    } finally {
      try {
        if (hadKey === null) localStorage.removeItem(A.ENVELOPE_MERGE_KEY);
        else localStorage.setItem(A.ENVELOPE_MERGE_KEY, hadKey);
      } catch (e) {}
    }
  }),

  () => tryRun('EAT-RESTOCK-5: AUTO-eat must tell the server, and must stay silent during an away replay', () => {
    /* The deterministic half of the report. `window.eatFood` has sent the `eat`
       intent since the Paione P0; `HearthriseAuto.maybeAutoEat()` — the path that
       actually fires during a fight, through COMBAT_FX.autoEat — only healed and
       decremented locally. The server therefore still held every auto-eaten
       Provision, which is why it came back on the next envelope AND after a
       reload. Nothing here talks to a server: it asserts that the consumption
       reaches the ONE seam, which is what owns the hold and the intent. */
    const Auto = window.HearthriseAuto;
    if (!Auto || typeof Auto.maybeAutoEat !== 'function') return;
    if (!window.ITEMS || !window.ITEMS.cooked_shrimp || !window.ITEMS.cooked_shrimp.heals) return;
    assert(typeof window.noteItemConsumed === 'function',
      'legacy.js must publish the consumption seam window.noteItemConsumed');

    const snap = snapshotG();
    const eatBefore = Auto.getEat();
    const traitsBefore = JSON.parse(JSON.stringify(window.G.traits || {}));
    const realNote = window.noteItemConsumed;
    const realReplay = window.inOfflineReplay;
    const seen = [];
    try {
      window.noteItemConsumed = function (id, qty, opts) { seen.push({ id, qty, opts }); return true; };
      window.G.traits = { auto_eat: true, auto_eat_2: true };
      window.G.playerMaxHp = 10;
      window.G.playerHp = 3;
      window.G.inventory = window.G.inventory || {};
      window.G.inventory.cooked_shrimp = 5;
      window.G.combatLog = window.G.combatLog || [];
      Auto.setEat({ enabled: true, threshold: 0.5, foodId: 'cooked_shrimp' });

      assert(Auto.maybeAutoEat() === true, 'the fixture must actually auto-eat');
      assert(seen.length === 1, 'an auto-eat must reach the consumption seam exactly once — got ' + seen.length);
      assert(seen[0].id === 'cooked_shrimp', 'the seam must be told WHICH food — got ' + seen[0].id);
      assert(seen[0].qty === 1, 'one unit per auto-eat — got ' + seen[0].qty);
      assert(seen[0].opts && seen[0].opts.auto === true,
        'the auto path must be marked so its intents are paced against the shared rate bucket');

      /* AND THE AWAY GATE, on the REAL seam: during an offline replay the SERVER
         ate the food and states the debit in `away.items`, so a second intent
         would debit it twice and a hold would double-subtract. Driven with a
         probe id no other test or content row uses, against the live G, because
         legacy.js closes over its own `G` binding and cannot be handed another. */
      window.noteItemConsumed = realNote;
      window.inOfflineReplay = function () { return true; };
      assert(window.noteItemConsumed('probe_away_food', 1, { auto: true }) === false,
        'the seam must be a no-op during an away replay');
      assert(!(window.G._pendingConsume && window.G._pendingConsume.probe_away_food),
        'an away replay must record no hold — the server already stated the debit');

      /* …and OUT of the replay it does hold (so the gate is the away flag, not a
         dead call). `send:false` keeps the assertion off the network entirely. */
      window.inOfflineReplay = function () { return false; };
      assert(window.noteItemConsumed('probe_away_food', 1, { send: false }) === true,
        'outside an away replay the seam must record the consumption');
      assert(window.HearthrisePendingConsume.pendingFor(window.G, 'probe_away_food') === 1,
        'the unit must be held once recorded');
    } finally {
      window.noteItemConsumed = realNote;
      window.inOfflineReplay = realReplay;
      Auto.setEat(eatBefore);
      window.G.traits = traitsBefore;
      try { if (window.G._pendingConsume) delete window.G._pendingConsume.probe_away_food; } catch (e) {}
      restoreG(snap);
    }
  }),

  () => tryRun('EAT-RESTOCK-6: the client sends an auto-eat intent ONLY when the SERVER is not eating', () => {
    /* THE DIRECTION THAT WOULD BE WORSE THAN THE BUG. The accrual engine eats
       for the character when `player_state.auto_eat_enabled` is true and states
       the debit in `away.items`; a client `eat` intent for the same auto-eat
       would then debit the food TWICE — item LOSS, not a restock. So the send is
       gated on the SERVER'S OWN answer, observed off `state.auto_eat_enabled`
       (hr_state_of projects it on every envelope), and it fails CLOSED.

       Measured premise, not an assumption: 2026-08-29-auto-eat-tiers.sql records
       "0 rows on production (no character has auto_eat_enabled)", and
       hr_set_auto_eat is that column's only writer — which is why the server
       kept every auto-eaten Provision, and why the client had to send.
       ⚠ b497 FLIPS THAT PREMISE, and the gate is correct on the other side of it
       too: 2026-09-04-auto-eat-at-creation.sql sets `auto_eat_enabled = true` at
       character creation, so the LIVE answer becomes block 2, not block 3, and
       the client send retires itself with no flag to flip.

       ⚠⚠ "THE SERVER EATS" IS ABOUT THE CHARACTER, NOT ABOUT BEING AWAY. Block 2
       runs with `inOfflineReplay()` FALSE — i.e. an ATTENDED auto-eat — on
       purpose: `computeAccrual` has no away input and no presence input, prices
       whatever elapsed since `accrued_to`, and gates `fx.autoEat()` on
       `autoEatEnabled` alone, while this client settles on a ~90 s cadence with
       the tab visible. Measured server-side by tests/accrual-engine.mjs
       `attendedSettleAutoEatGuard` (a fresh 10-HP goblin fight eats 2 meals over
       60 s, 3 over 90 s, each with the matching negative item delta).
       So the proposal to re-shape the gate as "attended ⇒ always send, away
       excluded by inOfflineReplay()" — 2026-09-04-auto-eat-at-creation.sql's
       header claims "the server's sim only eats during AWAY accrual" — is a
       DOUBLE DEBIT on every attended meal. Block 2 is where it goes red.

       MUTATION: drop the `opts.auto && !_clientOwnsAutoEatDebit()` guard in
       legacy.js noteItemConsumed → block 3 goes red.
       MUTATION: replace it with `opts.auto && inOfflineReplay()` → block 2 goes
       red. Return BEFORE `P.noteConsumed` → block 2b goes red. */
    const A = window.HearthriseAccrual;
    assert(typeof A.serverAutoEats === 'function' && typeof A.clientOwnsAutoEatDebit === 'function'
      && typeof A.__resetServerAutoEat === 'function', 'the auto-eat ownership observation must be published');
    assert(typeof window.__eatQueueState === 'function' && typeof window.__eatQueueReset === 'function',
      'the eat-queue seams must be published for this test');

    const realActive = window.serverAccrualActive;
    const realReplay = window.inOfflineReplay;
    const M = window.HearthriseEat;
    const realSend = M.sendEat;
    let sent = 0;
    /* Count RAISED INTENTS, not queue depth: an intent may go straight out or
       wait out the pacing gap, and the property under test is "was the server
       told", not "how fast". */
    const raised = () => sent + window.__eatQueueState().queued.length;
    const reset = () => { window.__eatQueueReset(); sent = 0; };
    try {
      window.serverAccrualActive = function () { return true; };
      window.inOfflineReplay = function () { return false; };
      M.sendEat = function () { sent++; return Promise.resolve({ outcome: 'eaten' }); };

      /* 1. NEVER OBSERVED ⇒ FAIL CLOSED. Unknown must mean "leave it to the
         server", because the unknown-and-wrong case destroys an item. */
      A.__resetServerAutoEat();
      assert(A.serverAutoEats() === null, 'a fresh device has observed nothing');
      assert(A.clientOwnsAutoEatDebit() === false, 'unknown must fail CLOSED — the client does not send');
      reset();
      window.noteItemConsumed('cooked_shrimp', 1, { auto: true });
      assert(raised() === 0, 'with the server unknown, an auto-eat must NOT be sent — got ' + raised());

      /* 2. THE SERVER SAYS IT EATS ⇒ STILL NO SEND. This is the double-debit
         guard, and it must survive whichever path observed the flag: the boot
         hr_load settle reaches it through reconcileInventory, exactly like the
         live envelope does. */
      A.reconcileInventory({ inventory: {} }, { state: { auto_eat_enabled: true }, inventory: {} }, false, false);
      assert(A.serverAutoEats() === true, 'the observation must take the server\'s word');
      assert(A.clientOwnsAutoEatDebit() === false, 'when the server eats, the client must not');
      reset();
      window.noteItemConsumed('cooked_shrimp', 1, { auto: true });
      assert(raised() === 0, 'THE DOUBLE-DEBIT GUARD: no client intent while the server eats the same food');

      /* 2b. …AND THE HOLD IS STILL RECORDED. "The server owns the debit" is a
         statement about the INTENT, never about the hold, and the difference is
         the whole restock bug: the client has ALREADY decremented G.inventory,
         and the settle that will state the same debit is up to ~90 s away. For
         those 90 s every envelope names the pre-eat count, and without a hold
         `reconcileInventory` ratchets it straight back — the b467→b479 P0, with
         auto-eat now on for every new character (b497) instead of nobody.
         The hold DRAINS on evidence: when the settle's figure comes down, the
         entry's `drop` covers it and the entry is deleted. So this is not a
         second debit — it is the seam that keeps the display honest until the
         one real debit lands.
         MUTATION: return from noteItemConsumed before `P.noteConsumed` when the
         server owns the debit → this goes red and block 2 stays green. */
      const PC = window.HearthrisePendingConsume;
      assert(PC && typeof PC.pendingFor === 'function' && typeof PC.releaseConsumed === 'function',
        'the pending-consumption seam must be published for this test');
      PC.releaseConsumed(window.G, 'cooked_shrimp');          // start from a known zero
      assert(PC.pendingFor(window.G, 'cooked_shrimp') === 0, 'the fixture must start with no hold');
      reset();
      assert(window.noteItemConsumed('cooked_shrimp', 1, { auto: true }) === true,
        'an attended auto-eat must be RECORDED even when the server owns the debit');
      assert(raised() === 0, 'still no intent — block 2b must not weaken the double-debit guard');
      assert(PC.pendingFor(window.G, 'cooked_shrimp') === 1,
        'THE RESTOCK GUARD: the locally-eaten unit must be HELD until the settle states the debit, '
        + 'or the next envelope ratchets it back — got ' + PC.pendingFor(window.G, 'cooked_shrimp'));

      /* 3. THE SERVER SAYS IT DOES NOT ⇒ THE CLIENT OWNS THE DEBIT. Today's live
         answer, and the half of the P0 that makes auto-eaten food stay eaten. */
      A.reconcileInventory({ inventory: {} }, { state: { auto_eat_enabled: false }, inventory: {} }, false, false);
      assert(A.serverAutoEats() === false, 'a definite no must be recorded');
      assert(A.clientOwnsAutoEatDebit() === true, 'a definite no hands the debit to the client');
      reset();
      window.noteItemConsumed('cooked_shrimp', 1, { auto: true });
      assert(raised() === 1,
        'THE BUG: with the server not eating, the client MUST send the debit — got ' + raised());

      /* 4. A MANUAL eat is never gated by any of this — the server has never
         eaten one, and eatFood has sent that intent since the Paione P0. */
      A.reconcileInventory({ inventory: {} }, { state: { auto_eat_enabled: true }, inventory: {} }, false, false);
      reset();
      window.noteItemConsumed('cooked_shrimp', 1);   // manual
      assert(sent === 1, 'a manual eat must always send, whatever the server does about auto-eat');

      /* 5. AN ENVELOPE THAT DOES NOT CARRY THE FIELD MUST NOT CHANGE THE ANSWER
         — absence is not a claim, the same rule the bag follows. */
      A.reconcileInventory({ inventory: {} }, { state: {}, inventory: {} }, false, false);
      assert(A.serverAutoEats() === true, 'an envelope omitting the field leaves the last answer alone');
    } finally {
      window.__eatQueueReset();
      M.sendEat = realSend;
      window.serverAccrualActive = realActive;
      window.inOfflineReplay = realReplay;
      A.__resetServerAutoEat();
      try { if (window.G && window.G._pendingConsume) delete window.G._pendingConsume.cooked_shrimp; } catch (e) {}
    }
  }),

  () => tryRun('SETTLE-3: `below_min_span` is a NON-EVENT — no sheet, no receipt reset, no halt', () => {
    /* §3.4. Today `accrued:false` is outcome `nothing`; under live settlement it
       becomes the MODAL answer — every settle that races an activity switch,
       every retry, every visibility flap. If it counted as a failure the player
       would meet the halted sheet within five minutes of ordinary play. */
    const A = window.HearthriseAccrual;
    const v = A.classifyAccrueResponse(200, { ok: true, accrued: false, reason: 'below_min_span' });
    assert(v.outcome === 'nothing', 'below_min_span must classify as `nothing`, got ' + v.outcome);
    assert(v.reason === 'below_min_span', 'the reason must survive for the log, got ' + v.reason);
    assert(A.isAccrualFailure('nothing') === false,
      'below_min_span counted as a failure — at a 90s cadence that halts the player mid-session');
    /* It resets the gate exactly as a paid settle does, so a refusal cannot
       accumulate toward the halt across a session. */
    const st = A.accrualGateStep({ streak: 2, firstAt: 1, halted: false, blockedUntil: 9e9 }, 'nothing', 1000, 'below_min_span');
    assert(st.streak === 0 && st.halted === false && st.blockedUntil === 0,
      'a below_min_span answer must clear the breaker, not feed it');
    /* And it can never be applied: no envelope, so nothing overwrites the save
       and `lastOfflineSummary` is left exactly as it was. */
    assert(A.isEnvelopeApplicable({ ok: true, accrued: false, reason: 'below_min_span' }) === false,
      'a below_min_span answer must never be applicable — it would blank the receipt');
    const G = { inventory: { x: 1 }, skills: {}, lastOfflineSummary: { hrs: 8, gainedGold: 500 } };
    assert(A.applyEnvelope(G, { ok: true, accrued: false, reason: 'below_min_span' }) === null,
      'applyEnvelope must refuse a below_min_span answer');
    assert(G.lastOfflineSummary.gainedGold === 500,
      'a refused settle CLEARED the away receipt — the player loses the record of their night');
  }),

  () => tryRunAsync('SETTLE-4: the unload settle is a keepalive FETCH with a bearer — `sendBeacon` cannot authenticate', async () => {
    /* §3.3, and it is a hard fact rather than a preference: `navigator
       .sendBeacon` CANNOT set an `Authorization` header, and hr-accrue's only
       identity is the bearer JWT (`verifyJwt(bearerOf(...))`) with no query or
       body token path. A beacon therefore arrives `not_signed_in`, 401 — a
       settle that looks like it works and never pays anything.

       Asserted on the LITERAL BYTES, per this file's own rule: twelve times
       this repo has shipped an assertion that asserted nothing, and a network
       test that cannot observe a request is the thirteenth. */
    const A = window.HearthriseAccrual;
    const req = A.buildKeepaliveRequest({ url: 'https://proj.supabase.co/', apiKey: 'anon-key', token: 'jwt-token', slot: 2 });
    assert(req.url === 'https://proj.supabase.co/functions/v1/hr-accrue', 'wrong endpoint: ' + req.url);
    assert(req.init.keepalive === true, 'the unload settle must set keepalive:true or the document unload kills it');
    assert(req.init.method === 'POST', 'must be a POST');
    assert(req.init.headers.Authorization === 'Bearer jwt-token',
      'no bearer — this is exactly what makes sendBeacon unusable and it must not be lost here');
    assert(req.init.headers.apikey === 'anon-key', 'the gateway wants an apikey');
    assert(req.init.body === '{"slot":2}', 'the body must be the contract body and nothing else, got ' + req.init.body);
    assert(req.init.body.length < 64 * 1024, 'keepalive caps the body at 64KB');

    /* THE BUILD GUARD. A `sendBeacon` call site anywhere in the accrual module
       would be a silently-401ing settle, and the failure is invisible at
       runtime — the request goes out, the player sees nothing wrong, and the
       span is never paid. Read the shipped source and refuse it. */
    const raw = await (await fetch('src/net/accrue.js?v=550')).text();
    assert(raw.length > 1000, 'could not read the accrual module source to guard it');
    /* COMMENTS STRIPPED FIRST. This file EXPLAINS at length why sendBeacon is
       unusable, and a guard that cannot tell a warning from a call site would
       fail on its own documentation — which teaches the next author to delete
       the explanation rather than the call. Guard the CODE. */
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    assert(!/navigator\s*\.\s*sendBeacon|\bsendBeacon\s*\(/.test(src),
      'a sendBeacon CALL SITE exists in src/net/accrue.js — it cannot carry an Authorization header, '
      + 'so every unload settle it makes arrives 401 not_signed_in and pays nothing');
    assert(/keepalive:\s*true/.test(src), 'the keepalive flag is no longer in the shipped source');
  }),

  () => tryRun('SETTLE-5: the 90s loop fires only when VISIBLE and an activity is set', () => {
    /* §3.1. The four conditions, each falsified independently against the pure
       decider, then the cadence itself driven on a fake clock. A loop that ran
       hidden would settle a span the offline budget watermark has already
       stopped advancing for; a loop that ran idle would spend a rate budget to
       be told `idle` forever. */
    const A = window.HearthriseAccrual;
    const base = { enabled: true, configured: true, visible: true, kind: 'combat', lastSettleAt: 0, eventAt: 0 };
    const at = (over, now) => A.decideSettle(Object.assign({}, base, over), now);
    const T = A.SETTLE_INTERVAL_MS;

    assert(at({ lastSettleAt: 1000 }, 1000 + T).settle === true, 'a due, visible, active settle must fire');
    assert(at({ lastSettleAt: 1000, visible: false }, 1000 + T).settle === false, 'a HIDDEN tab must not settle');
    assert(at({ lastSettleAt: 1000, kind: 'idle' }, 1000 + T).settle === false, 'an IDLE player must not settle');
    assert(at({ lastSettleAt: 1000, enabled: false }, 1000 + T).settle === false,
      'the kill switch must stop the loop dead — it is the incident lever');
    assert(at({ lastSettleAt: 1000, configured: false }, 1000 + T).settle === false,
      'a signed-out device must not settle');
    // Every non-combat payable kind settles too — this is not a combat feature.
    ['gather', 'artisan'].forEach((k) => {
      assert(at({ lastSettleAt: 1000, kind: k }, 1000 + T).settle === true, k + ' must settle like any other activity');
    });
    // The boundary, both sides.
    assert(at({ lastSettleAt: 1000 }, 1000 + T - 1).settle === false, 'one ms early must not fire');
    assert(at({ lastSettleAt: 1000 }, 1000 + T - 1).waitMs === 1, 'the re-arm must be the exact remainder');
    /* A garbage or FUTURE watermark must not park the loop forever — the same
       posture rule 5 takes with `offlineBudget.at`. */
    assert(at({ lastSettleAt: 9e15 }, 1000).settle === true, 'a FUTURE watermark must not freeze the loop');

    /* THE LOOP ITSELF, on a fake clock and a fake timer. */
    const before = A.getSettleState();
    let clock = 0; let armed = null; const fired = [];
    let kind = 'combat'; let visible = true;
    try {
      A.resetSettleLoop();
      A.setSettleEnv({
        now: () => clock,
        setTimer: (fn, ms) => { armed = { fn, at: clock + ms }; return 1; },
        clearTimer: () => { armed = null; },
        visible: () => visible,
        enabled: () => true,
        configured: () => true,
        pointer: () => ({ kind, id: 'x' }),
        request: (o) => { fired.push(Object.assign({ at: clock }, o)); return Promise.resolve({ outcome: 'nothing' }); },
      });
      const run = (to) => { while (armed && armed.at <= to) { clock = armed.at; const f = armed.fn; armed = null; f(); } clock = to; };
      A.startSettleLoop();
      assert(fired.length === 0, 'starting the loop must not settle immediately — the cold-load accrual just ran');
      run(10 * T);
      assert(fired.length === 10, 'ten intervals must produce ten settles, got ' + fired.length);
      assert(fired.every((f) => f.reason === 'interval'), 'the interval settles must be labelled `interval`');
      /* 45x HEADROOM, asserted rather than asserted-about. */
      const perMin = 60000 / T;
      assert(perMin < A.ACCRUE_RATE_PER_MIN,
        'the cadence spends ' + perMin + '/min against a ' + A.ACCRUE_RATE_PER_MIN + '/min gate');

      // HIDDEN: the loop keeps ticking (so it resumes instantly) and pays nothing.
      const n = fired.length;
      visible = false; run(20 * T);
      assert(fired.length === n, 'the loop settled ' + (fired.length - n) + ' times while the tab was HIDDEN');
      visible = true; run(21 * T);
      assert(fired.length > n, 'the loop did not resume when the tab came back');

      // IDLE: same again. Nothing to pay, nothing spent.
      const n2 = fired.length;
      kind = 'idle'; run(30 * T);
      assert(fired.length === n2, 'the loop settled ' + (fired.length - n2) + ' times with NO activity set');

      // STOPPED means stopped — no orphan timer left running after a teardown.
      kind = 'combat'; A.stopSettleLoop();
      assert(armed === null, 'stopSettleLoop left a timer armed');
    } finally {
      A.setSettleEnv(null);
      A.resetSettleLoop();
      if (before.running) A.startSettleLoop();
    }
  }),

  () => tryRun('SETTLE-6: a rare drop settles at the 60s FLOOR, not at the 90s interval — and neither number moved', () => {
    /* §3.6, Tyler 2026-08-17: "if a person loots a rare item from a boss and
       then disconnects 3 seconds after, they won't lose the item?" The
       undegraded answer settles IMMEDIATELY, which needs `ACCRUE_MIN_MS`
       lowered — a change Security has NOT cleared. So the DEGRADED form ships:
       settle at the next LEGAL instant, which still beats the interval by up to
       half a minute, and firing any earlier would only earn a `below_min_span`.

       SECURITY'S PRIOR RULINGS, ASSERTED. Both are honoured by construction
       here rather than by intention, so a future author who "optimises" the
       cadence goes red instead of silently re-opening a reviewed decision. */
    const A = window.HearthriseAccrual;
    assert(A.ACCRUE_MIN_SPAN_MS === 60000,
      'the server floor mirror moved to ' + A.ACCRUE_MIN_SPAN_MS + ' — ACCRUE_MIN_MS is 60000 and lowering it '
      + 'is a reviewed change Security has not cleared (live-settlement.md §3.6)');
    assert(A.SETTLE_INTERVAL_MS === 90000, 'the cadence must be 90s (§3.2), got ' + A.SETTLE_INTERVAL_MS);
    assert(A.SETTLE_INTERVAL_MS > A.ACCRUE_MIN_SPAN_MS,
      'the cadence must CLEAR the floor or every settle is a wasted invocation');
    assert(A.ACCRUE_RATE_PER_MIN === 30, 'the mirrored rate gate must stay at the reviewed 30/min');
    /* The worst legal burst: an event settle at the floor, forever. Still under
       the gate — this is the arithmetic §10\'s "light" security gate asks for. */
    assert(60000 / A.ACCRUE_MIN_SPAN_MS < A.ACCRUE_RATE_PER_MIN,
      'even settling at the floor on every event must stay inside the rate gate');

    const before = A.getSettleState();
    let clock = 0; let armed = null; const fired = [];
    try {
      A.resetSettleLoop();
      A.setSettleEnv({
        now: () => clock,
        setTimer: (fn, ms) => { armed = { fn, at: clock + ms }; return 1; },
        clearTimer: () => { armed = null; },
        visible: () => true,
        enabled: () => true,
        configured: () => true,
        pointer: () => ({ kind: 'combat', id: 'dragon' }),
        request: (o) => { fired.push(Object.assign({ at: clock }, o)); return Promise.resolve({ outcome: 'nothing' }); },
      });
      const run = (to) => { while (armed && armed.at <= to) { clock = armed.at; const f = armed.fn; armed = null; f(); } clock = to; };
      A.startSettleLoop();                       // lastSettleAt = 0

      // A rare drops 10s into the window. It must NOT go out at 10s.
      clock = 10000; A.noteSettleEvent('rare-drop');
      run(59999);
      assert(fired.length === 0,
        'the event settled BELOW the 60s floor — that call is refused `below_min_span` and burns a rate spend');
      run(60000);
      assert(fired.length === 1, 'the event did not settle at the floor, got ' + fired.length + ' settles');
      assert(fired[0].reason === 'event', 'the settle must be labelled `event`, got ' + fired[0].reason);
      assert(fired[0].at === 60000, 'the event must settle at the EXACT floor, got ' + fired[0].at);
      // ...and that is 30s earlier than the interval would have been.
      assert(fired[0].at < A.SETTLE_INTERVAL_MS, 'the event trigger bought nothing over the plain interval');

      // The event is CONSUMED: three rares in one span are one settle, because
      // the SPAN is what gets paid, not the drop.
      A.noteSettleEvent('rare-drop'); A.noteSettleEvent('boss-kill'); A.noteSettleEvent('rare-drop');
      run(60000 + 59999);
      assert(fired.length === 1, 'a burst of events must coalesce into ONE settle at the next legal instant');
      run(60000 + 60000);
      assert(fired.length === 2, 'the coalesced event did not settle at its floor');
      assert(fired[1].reason === 'event', 'the coalesced settle must still be an event settle');
      // With no event pending, the cadence returns to 90s.
      run(120000 + A.SETTLE_INTERVAL_MS);
      assert(fired.length === 3 && fired[2].reason === 'interval',
        'the loop did not return to the plain 90s interval after the event cleared');
    } finally {
      A.setSettleEnv(null);
      A.resetSettleLoop();
      if (before.running) A.startSettleLoop();
    }
  }),

  () => tryRun('SETTLE-7: settling every 90s must NOT toast the player every 90s', () => {
    /* The b361 classifier already owns this sentence; what Phase 1 changes is
       that the zero-value settle stops being hypothetical and becomes the
       overwhelmingly common case. 320 settles a day means 320 toasts a day if
       the silence rule ever regresses, so it is asserted AT THE CADENCE. */
    const A = window.HearthriseAccrual;
    let spoke = 0;
    for (let i = 0; i < 40; i++) {
      const zero = { awayMs: A.SETTLE_INTERVAL_MS, hrs: 0, gainedItems: 0, gainedXp: 0, gainedGold: 0, gainedKills: 0 };
      if (A.receiptSentence(zero) !== null) spoke++;
    }
    assert(spoke === 0, 'a zero-value settle toasted ' + spoke + '/40 times — that is an hour of spam per hour played');
    // A settle that DID move something speaks, quietly, and never claims an absence.
    const quiet = A.receiptSentence({ awayMs: A.SETTLE_INTERVAL_MS, hrs: 0, gainedItems: 2, gainedXp: 40, gainedGold: 0 });
    assert(quiet === 'Synced — +2 items, +40 XP', 'the quiet sync sentence changed: ' + quiet);
    assert(A.classifyReceipt({ awayMs: A.SETTLE_INTERVAL_MS }) === 'sync',
      'the settle cadence must classify as a SYNC — the whole point of SYNC_MAX_MS is that it is a cadence ceiling');
    assert(A.SETTLE_INTERVAL_MS < A.SYNC_MAX_MS,
      'the cadence has outgrown the sync threshold, so live settles would start claiming absences');
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b361 regression suite — "AWAY 0h" DURING LIVE PLAY (Tyler, screenshot)
     ══════════════════════════════════════════════════════════════════════
     Reported: "⏳ Away 0h — the server credited +13 items, +104 XP, +0 gold"
     fired while he was at the keyboard watching the fight. Since b356–b360 a
     span settled WHILE ONLINE goes through the same envelope, the same
     applier and the same receipt as a real absence (by design — one payment
     path, live-settlement.md §0), and the only thing telling the two apart
     was `source === 'switch'`, which an accrue-triggered settle never sets.

     These fail without the classifier and NONE of them touches what is
     credited — every one of them is a pure function of a receipt that has
     already been applied. */

  () => tryRun('SYNC-1: a short credited span is a SYNC, a long one is an AWAY — both sides of the line', () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.classifyReceipt === 'function', 'classifyReceipt must be published');
    const T = A.SYNC_MAX_MS;
    assert(T === 10 * 60000, 'the threshold must be 10 minutes, got ' + T);
    const rc = (ms, extra) => Object.assign({ awayMs: ms, gainedItems: 13, gainedXp: 104, gainedGold: 0 }, extra || {});
    // THE REPORTED CASE: a 90s live settle must not claim an absence.
    assert(A.classifyReceipt(rc(90 * 1000)) === 'sync',
      'a 90s settle claimed an absence — this is the reported "Away 0h" bug');
    // Boundary, both sides. Exactly the threshold is an ABSENCE (`< T` is sync).
    assert(A.classifyReceipt(rc(T - 1)) === 'sync', 'one ms under the threshold must be a sync');
    assert(A.classifyReceipt(rc(T)) === 'away', 'exactly the threshold must be an absence');
    assert(A.classifyReceipt(rc(T + 1)) === 'away', 'one ms over the threshold must be an absence');
    // A real absence still gets the away treatment, untouched.
    assert(A.classifyReceipt(rc(8 * 3600000)) === 'away', 'an eight-hour night must still be an absence');
    // A switch keeps its own sentence whatever the span.
    assert(A.classifyReceipt(rc(30 * 1000, { source: 'switch' })) === 'switch',
      'an activity switch must keep its own sentence');
    assert(A.classifyReceipt(rc(9 * 3600000, { source: 'switch' })) === 'switch',
      'a switch is a switch however wide the collected window');
  }),

  () => tryRun('SYNC-2: a zero-value sync says NOTHING; a death always speaks', () => {
    const A = window.HearthriseAccrual;
    const zero = { awayMs: 90000, gainedItems: 0, gainedXp: 0, gainedGold: 0, gainedKills: 0 };
    const n0 = A.receiptNotice(zero);
    assert(n0.kind === 'sync' && n0.announce === false,
      'a zero-value live settle must be silent — at a 90s cadence this is the common case');
    // One moved channel is enough to speak.
    ['gainedItems', 'gainedXp', 'gainedGold', 'gainedKills'].forEach((k) => {
      const one = Object.assign({}, zero); one[k] = 1;
      assert(A.receiptNotice(one).announce === true, k + ' moved but the toast stayed silent');
    });
    // A level-up is news even when nothing else is.
    assert(A.receiptNotice(Object.assign({}, zero, { levelUps: [{ skill: 'mining', to: 12 }] })).announce === true,
      'a level-up must not be swallowed by the zero-value gate');
    /* DEATH OVERRIDES BOTH: it is an absence whatever the span (b343's ruling,
       reused rather than re-decided) and it announces on a zero receipt. */
    const dead = Object.assign({}, zero, { combat: { kills: 0, died: true } });
    assert(A.classifyReceipt(dead) === 'away', 'a death must be an absence however short the span');
    assert(A.receiptNotice(dead).announce === true, 'a death must always be announced');
  }),

  () => tryRun('SYNC-4: the literal reported sentence — "Away 0h" can never be said of a live settle', () => {
    /* THE REGRESSION, quoted. Tyler's screenshot: "⏳ Away 0h — the server
       credited +13 items, +104 XP, +0 gold" while he was at the keyboard.
       `receiptSentence` exists as a pure function precisely so this string is
       readable by a test — inline in `applyServerEnvelope` it needed a live
       envelope, a live session and a live server to reach, which is why the
       sentence shipped wrong in the first place. */
    const A = window.HearthriseAccrual;
    assert(typeof A.receiptSentence === 'function', 'receiptSentence must be published');
    const reported = { awayMs: 90000, hrs: 0, gainedItems: 13, gainedXp: 104, gainedGold: 0, gainedKills: 0 };
    const said = A.receiptSentence(reported);
    assert(said === 'Synced — +13 items, +104 XP', 'got ' + JSON.stringify(said));
    assert(said.indexOf('Away') === -1, 'a live settle must never say "Away"');
    assert(said.indexOf('+0 gold') === -1, 'a live settle must not name a channel that did not move');
    // Zero-value settle: NOTHING is said at all.
    assert(A.receiptSentence({ awayMs: 90000, gainedItems: 0, gainedXp: 0, gainedGold: 0 }) === null,
      'a zero-value live settle must produce no toast at all');
    // A genuine absence keeps its full receipt, verbatim, "+0 gold" included.
    const night = { awayMs: 8 * 3600000, hrs: 8, gainedItems: 13, gainedXp: 104, gainedGold: 0 };
    assert(A.receiptSentence(night) === '⏰ Away 8h — the server credited +13 items, +104 XP, +0 gold',
      'a real absence must still get the full away receipt, got ' + A.receiptSentence(night));
    // The market line rides on whichever sentence is chosen.
    assert(A.receiptSentence(reported, { saleLine: '2 listings sold · +340 gold' })
      === 'Synced — +13 items, +104 XP · 2 listings sold · +340 gold',
      'the sales line must ride the sync toast');
    assert(A.receiptSentence(night, { saleLine: '2 listings sold · +340 gold' }).indexOf('2 listings sold') > 0,
      'the sales line must ride the away toast too');
    // A switch still speaks as a switch, through the injected span formatter.
    const sw = { source: 'switch', awayMs: 90000, gainedItems: 1, gainedXp: 2, gainedGold: 3 };
    assert(A.receiptSentence(sw, { spanLabel: () => '1m' }) === 'Collected 1m — +3 gold, +2 XP, +1 items',
      'a switch must keep its own sentence, got ' + A.receiptSentence(sw, { spanLabel: () => '1m' }));
  }),

  () => tryRun('SYNC-5: an away receipt says WHY it stopped and that you got back up', () => {
    /* THE REGRESSION. b515 deleted the local `processOffline`, and with it the
       b345 stop toast and the Recovery rev. 2 fall toast; `receiptSentence`,
       the only sentence source since, never had either clause. b518 put the
       fields on the away payload, so a supply-exhausted night with two falls in
       it arrived carrying every fact it needed and toasted as "⏰ Away 8h — the
       server credited …" and nothing else: eight hours of honest, uninterrupted
       pay over a run that earned for thirty-one seconds and fell twice.

       The clauses belong to the AWAY branch alone (b510: an attended live
       settle narrates nothing) and a terminal death keeps b343's own sentence,
       so all three readings are pinned here together. */
    const A = window.HearthriseAccrual;
    const label = { spanLabel: (ms) => (ms < 60000 ? Math.max(1, Math.round(ms / 1000)) + 's'
                                                   : Math.round(ms / 60000) + 'm'),
                    itemLabel: (id) => (id === 'raw_shrimp' ? 'Raw Shrimp' : null),
                    skillLabel: (k) => (k === 'cooking' ? 'Cooking' : null),
                    foeLabel: (id) => (id === 'goblin' ? 'Goblin' : null) };
    const night = { awayMs: 8 * 3600000, hrs: 8, gainedItems: 11, gainedXp: 80, gainedGold: 0,
      paidMs: 30700, stoppedBy: 'supplies', stoppedById: 'raw_shrimp', stoppedSkill: 'cooking',
      stoppedPerHour: 940, deaths: 2, recoverMs: 240000, diedTo: 'goblin' };
    const said = A.receiptSentence(night, label);
    assert(/You fell 2 times to the Goblin — knocked out for 4m in total; your run picked up each time/.test(said),
      'the away receipt states two falls and 4m of recovery and said nothing about either: ' + said);
    assert(/Cooking ran out of Raw Shrimp 31s in — nothing was earned after/.test(said),
      'the away receipt states a supply stop 31s into an 8h night and said nothing about it: ' + said);
    /* THE CREDIT IS STILL QUOTED, unchanged: these clauses explain the numbers,
       they do not replace them. */
    assert(said.indexOf('⏰ Away 8h — the server credited +11 items, +80 XP, +0 gold') === 0,
      'the away sentence lost its own receipt: ' + said);
    /* STATED, NOT INFERRED — the same rule the card and the modal follow. A
       receipt with no stop and no death count says neither thing. */
    const plain = { awayMs: 8 * 3600000, hrs: 8, gainedItems: 11, gainedXp: 80, gainedGold: 0 };
    assert(A.receiptSentence(plain, label) === '⏰ Away 8h — the server credited +11 items, +80 XP, +0 gold',
      'an ordinary night grew a stop or a fall clause out of nothing: ' + A.receiptSentence(plain, label));
    /* A REASON THIS SENTENCE CANNOT HONESTLY DESCRIBE IS SILENT. `stoppedBy`
       also carries 'idle', 'gate', 'level' and 'budget', none of which mean
       "you ran out of something"; inventing a cause is the failure this clause
       exists to prevent, pointed the other way. */
    const gated = Object.assign({}, night, { stoppedBy: 'gate', deaths: 0 });
    assert(A.receiptSentence(gated, label).indexOf('ran out') === -1,
      'a locked-recipe stop was reported as running out of materials: ' + A.receiptSentence(gated, label));
    /* THE ATTENDED LIVE SETTLE NARRATES NOTHING (b510). The same two fields on
       a 90-second sync must not put an absence's story on the player's screen
       while they are watching it happen. */
    const sync = { awayMs: 90000, hrs: 0, gainedItems: 13, gainedXp: 104, gainedGold: 0,
      paidMs: 30700, stoppedBy: 'supplies', stoppedById: 'raw_shrimp', stoppedSkill: 'cooking',
      deaths: 2, recoverMs: 240000 };
    const syncLine = A.receiptSentence(sync, label);
    assert(syncLine === 'Synced — +13 items, +104 XP',
      'a live settle narrated the away story: ' + syncLine);
    /* A TERMINAL DEATH STILL TAKES b343's BRANCH, word for word: the run really
       did stop, so "nothing was earned after" is true and must not be traded
       for a recovery line that claims the night carried on. */
    const died = { awayMs: 8 * 3600000, hrs: 8, gainedItems: 0, gainedXp: 0, gainedGold: 0,
      died: true, diedTo: 'goblin', diedAfterMs: 60000, stoppedBy: 'death', deaths: 1 };
    const deathLine = A.receiptSentence(died, label);
    assert(deathLine === 'You died to Goblin — nothing was earned after',
      'a terminal death left the b343 branch: ' + deathLine);
  }),

  () => tryRun('SYNC-3: a sync never draws an away card, never re-labels one, and never evicts a fresh one', () => {
    /* -- WHAT THIS TEST IS FOR --------------------------------------------
       An earlier guard pinned half a property: the Home card and the toast read ONE
       classifier, so a 90-second settle cannot be narrated as an absence.
       That half stayed true and the OTHER half was never stated, so it broke
       in silence: `applyEnvelope` overwrote `G.lastOfflineSummary` on every
       settle, the card read only that field, and the eight-hour night the
       player opened the game to read VANISHED about ninety seconds into play.
       Nothing was red. The card was simply gone by the time they looked.

       DESIGN RULING (game-designer, 2026-09-07, binding): a fresh
       classified-away card stays on Home for its thirty minutes while live
       settles continue. A sync receipt must never CREATE or RE-LABEL an away
       card - and does not EVICT a fresh one either.

       Driven through the REAL path both times (`applyAwayEnvelope` ->
       applyServerEnvelope -> accrue.applyEnvelope), because the bug lived in
       the caller, not in the classifier: a test that hand-assigned
       `G.lastOfflineSummary` graded the render gate and could never have seen
       the overwrite that actually shipped.

       MUTATION PROOF: delete the `lastAwayReceipt` write in accrue.js (or
       point the card back at `G.lastOfflineSummary` alone) and part (3) goes
       red on "the night's card was evicted by a 90-second sync". */
    const A = window.HearthriseAccrual;
    const H = window.HearthriseHome;
    assert(H && typeof H.__awayCardHtml === 'function', 'the away card test seam must exist');
    assert(typeof A.getLastAwayReceipt === 'function' && typeof A.__resetAwayReceipt === 'function',
      'the away-receipt holder seam must be published - the card has no source of truth without it');
    const G = window.G;
    const snap = snapshotG();
    const prevSummary = G.lastOfflineSummary;
    const prevTab = window.activeTab;
    const bandText = () => {
      H.render();
      const b = document.querySelector('#hd-root .hd-awayband');
      return b ? b.textContent.replace(/\s+/g, ' ').trim() : null;
    };
    try {
      A.__resetAwayReceipt();
      G.lastOfflineSummary = null;
      window.showTab('profile');

      /* (1) A SYNC ARRIVING WITH NO PRIOR ABSENCE DRAWS NOTHING. */
      const sync = () => applyAwayEnvelope({
        grantMs: 90000, awayMs: 90000, paidMs: 90000,
        kills: 2, crits: 0, gold: 0, xp: {}, items: {},
        died: false, capped: false, blessed: false,
      });
      A.__resetAwayReceipt();
      const s1 = sync();
      assert(A.classifyReceipt(s1.rec) === 'sync', 'a 90s settle must classify as a sync, got '
        + A.classifyReceipt(s1.rec));
      assert(A.getLastAwayReceipt() === null,
        'a SYNC wrote itself into the away holder - the next Home render will invent an absence '
        + 'that never happened: ' + JSON.stringify(A.getLastAwayReceipt()));
      assert(bandText() === null,
        'a 90s live settle drew the "While you were away" card - the card and the toast disagree');

      /* (2) AND IT IS NEVER RE-LABELLED. The sync receipt keeps a sync's
         sentence; nothing anywhere turns those numbers into a night. */
      assert(String(A.receiptSentence(s1.rec) || '').indexOf('Away') === -1,
        'a live settle was narrated as an absence: ' + A.receiptSentence(s1.rec));

      /* (3) THE HALF THAT WAS MISSING, AND THE BUG. A fresh eight-hour night
         is on screen; ninety seconds of play land a sync; the night is STILL
         on screen, unchanged, still stating the night's numbers. */
      const night = applyAwayEnvelope({
        grantMs: 8 * 3600000, awayMs: 8 * 3600000, paidMs: 8 * 3600000,
        kills: 41, crits: 0, gold: 6750, xp: { attack: 14208 }, items: { shrimp: 13 },
        died: false, capped: false, blessed: false,
      });
      assert(A.classifyReceipt(night.rec) === 'away', 'an 8h absence must classify as away');
      assert(A.getLastAwayReceipt() === night.rec,
        'the night was not held apart from the latest receipt, so the next settle overwrites it');
      const before = bandText();
      assert(before && before.indexOf('While you were away') >= 0,
        'a real absence must draw the full away card');
      assert(/41/.test(before), 'the card must state what the night paid: ' + before);

      const s2 = sync();                       // ~90 seconds of ordinary play
      assert(A.classifyReceipt(s2.rec) === 'sync', 'the second settle must still be a sync');
      assert(G.lastOfflineSummary === s2.rec,
        'the LATEST receipt must still be the latest - the toast and the bug report read it');
      const after = bandText();
      assert(after !== null,
        'THE BUG: the night\'s card was evicted by a 90-second sync - the player opened the game to '
        + 'read what happened overnight and it disappeared under them ninety seconds in');
      assert(after === before,
        'the away card CHANGED when a sync landed - a settle must not re-state the night:\n  before: '
        + before + '\n  after:  ' + after);

      /* (4) A LATER ABSENCE IS THE NEWS. Two absences inside one 30-minute box
         means the SECOND one is what the card is about - the holder is "the
         last absence", not "the first one that got there". */
      const second = applyAwayEnvelope({
        grantMs: 3600000, awayMs: 3600000, paidMs: 3600000,
        kills: 7, crits: 0, gold: 11, xp: {}, items: {},
        died: false, capped: false, blessed: false,
      });
      assert(A.getLastAwayReceipt() === second.rec, 'a later absence must replace the earlier one');
      const latest = bandText();
      assert(latest && latest !== after, 'the newer absence is not the one on screen: ' + latest);

      /* (5) THE CARD EXPIRES WITH THE BOX, NOT LATER. Freshness is still
         thirty minutes off `at` and is still the only thing that ends a card;
         holding the receipt longer must not make it live longer. */
      second.rec.at = Date.now() - 31 * 60000;
      assert(bandText() === null, 'a 31-minute-old absence is not news any more and must not lead the '
        + 'dashboard; the 30-minute box is what retires the card');
    } finally {
      A.__resetAwayReceipt();
      G.lastOfflineSummary = prevSummary;
      restoreG(snap);
      try { H.render(); } catch (e) {}
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  () => tryRun('SYNC-5: an ATTENDED live settle says nothing; an absence and a death still speak', () => {
    /* THE REPORT (Paione, 2026-09-06): "the constant syncing in the game while
       playing actively." At a 90 s settle cadence the sync toast fired every
       minute and a half at a player who was watching those exact drops land in
       the combat log. Ruling: an attended live settle narrates nothing.
       ATTENDANCE MUST BE PROVEN — every unprovable case still speaks, which is
       what the second half of this test pins. */
    const A = window.HearthriseAccrual;
    assert(typeof A.receiptAttended === 'function' && typeof A.visibleSince === 'function',
      'the attendance seam must be published');
    const now = 1700000000000;
    const span = A.SETTLE_INTERVAL_MS;                    // the real 90 s cadence
    const settle = { at: now, awayMs: span, hrs: 0, gainedItems: 3, gainedXp: 40, gainedGold: 0, gainedKills: 2 };
    const watching = now - span - 60000;                  // visible a minute before the window opened

    // 1. THE BUG: watched the whole span → no toast.
    assert(A.receiptAttended(settle, watching) === true, 'a fully-watched span must count as attended');
    const n = A.receiptNotice(settle, { visibleSince: watching });
    assert(n.kind === 'sync' && n.attended === true && n.announce === false,
      'an attended live settle must not announce');
    assert(A.receiptSentence(settle, { visibleSince: watching }) === null,
      'an attended 90s sync produced a toast: ' + A.receiptSentence(settle, { visibleSince: watching }));

    // 2. UNPROVABLE ATTENDANCE ALWAYS SPEAKS — this is the safe direction.
    [['hidden now', 0], ['never observed', undefined], ['garbage', NaN], ['negative', -5],
     ['arrived mid-window', now - (span / 2)], ['arrived at the boot after a tab-close', now]
    ].forEach(([why, vs]) => {
      assert(A.receiptAttended(settle, vs) === false, why + ' must not count as attended');
      assert(A.receiptSentence(settle, { visibleSince: vs }) === 'Synced — +3 items, +40 XP',
        why + ' must still get its receipt');
    });
    // The old one-argument callers are untouched.
    assert(A.receiptSentence(settle) === 'Synced — +3 items, +40 XP',
      'a caller that states no attendance must keep the speaking behaviour');

    // 3. A REAL ABSENCE KEEPS ITS RECEIPT even if this document never hid —
    //    the classifier, not the visibility flag, decides what a receipt IS.
    const night = { at: now, awayMs: 8 * 3600000, hrs: 8, gainedItems: 13, gainedXp: 104, gainedGold: 0 };
    assert(A.receiptSentence(night, { visibleSince: now - 9 * 3600000 })
      === '⏰ Away 8h — the server credited +13 items, +104 XP, +0 gold',
      'a 10-min+ absence must still get its full receipt whatever visibility says');
    const tenMin = { at: now, awayMs: A.SYNC_MAX_MS, hrs: 0.2, gainedItems: 1, gainedXp: 1, gainedGold: 0 };
    assert(A.receiptNotice(tenMin, { visibleSince: now - 3 * A.SYNC_MAX_MS }).announce === true,
      'the 10-minute threshold, not attendance, is what makes a span an absence');

    // 4. A DEATH IS NEVER A QUIET TOAST (b343), attended or not.
    const dead = { at: now, awayMs: span, hrs: 0, gainedItems: 0, gainedXp: 0, gainedGold: 0,
      died: true, diedTo: 'dragon' };
    assert(A.receiptNotice(dead, { visibleSince: watching }).announce === true,
      'a death must announce even when the player watched it happen');
    const dline = A.receiptSentence(dead, { visibleSince: watching, foeLabel: () => 'Dragon' });
    assert(dline && dline.indexOf('You died to Dragon') === 0, 'the death sentence changed: ' + dline);

    // 5. A SWITCH keeps its own sentence — "Collected" is untouched.
    const sw = { at: now, source: 'switch', awayMs: span, gainedItems: 1, gainedXp: 2, gainedGold: 3 };
    assert(A.receiptSentence(sw, { visibleSince: watching, spanLabel: () => '1m' })
      === 'Collected 1m — +3 gold, +2 XP, +1 items', 'a switch must still speak while attended');

    // 6. THE SALE LINE SURVIVES THE SILENCE, alone. A listing selling is the
    //    one thing on a sync receipt the player was not looking at.
    assert(A.receiptSentence(settle, { visibleSince: watching, saleLine: '2 listings sold · +340 gold' })
      === '2 listings sold · +340 gold',
      'a sale during an attended settle must still be reported, without the "Synced" noise');

    // 7. The live tracker exists and moves in both directions.
    const was = A.visibleSince();
    try {
      assert(A.noteVisibility(true, now) === now, 'noteVisibility must record the visible instant');
      assert(A.visibleSince() === now, 'visibleSince must read the recorded instant');
      A.noteVisibility(false);
      assert(A.visibleSince() === 0, 'going hidden must clear the attendance proof');
    } finally { A.noteVisibility(was > 0, was); }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b361 regression suite — THE TRADE LEDGER
     Since market-v2 a listing sells server-side and the gold just arrives.
     These cover the pure half end to end from a fixture: normalisation,
     the away-window summary, and the panel's own render.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRun('LEDGER-1: market_sales rows normalise into signed, role-tagged entries', () => {
    const MH = window.HearthriseMarketHistory;
    assert(MH && typeof MH.normalizeSales === 'function', 'the market history module must be published');
    const me = 'user-me';
    const rows = [
      { id: 1, listing_id: 'L1', seller_user_id: me, buyer_user_id: 'other', item_id: 'oak_log',
        qty: 10, gold_gross: 200, tax: 10, gold_net: 190, at: '2026-08-17T10:00:00Z' },
      { id: 2, listing_id: 'L2', seller_user_id: 'other', buyer_user_id: me, item_id: 'copper_ore',
        qty: 4, gold_gross: 80, tax: 4, gold_net: 76, at: '2026-08-17T12:00:00Z' },
      { id: 3, listing_id: 'L3', seller_user_id: 'a', buyer_user_id: 'b', item_id: 'coal',
        qty: 1, gold_gross: 5, tax: 0, gold_net: 5, at: '2026-08-17T13:00:00Z' },
    ];
    const out = MH.normalizeSales(rows, me);
    assert(out.length === 2, 'a row belonging to neither side must be dropped, got ' + out.length);
    // NEWEST FIRST.
    assert(out[0].id === '2' && out[1].id === '1', 'entries must be newest-first');
    const sale = out[1];
    assert(sale.role === 'sale' && sale.goldDelta === 190,
      'a sale credits the NET (tax already taken), got ' + sale.goldDelta);
    const buy = out[0];
    assert(buy.role === 'purchase' && buy.goldDelta === -80,
      'a purchase costs the GROSS, got ' + buy.goldDelta);
    assert(sale.at > 0 && buy.at > sale.at, 'timestamps must parse to real, ordered ms');
  }),

  () => tryRun('LEDGER-2: the away summary gains a sales line only when sales fall inside the window', () => {
    const MH = window.HearthriseMarketHistory;
    const me = 'user-me';
    const T = Date.parse('2026-08-17T12:00:00Z');
    const entries = MH.normalizeSales([
      // inside the window
      { id: 1, seller_user_id: me, buyer_user_id: 'x', item_id: 'oak_log', qty: 10,
        gold_gross: 210, tax: 10, gold_net: 200, at: new Date(T - 3600000).toISOString() },
      { id: 2, seller_user_id: me, buyer_user_id: 'y', item_id: 'coal', qty: 5,
        gold_gross: 150, tax: 10, gold_net: 140, at: new Date(T - 1800000).toISOString() },
      // BEFORE the window — already reported on a previous return
      { id: 3, seller_user_id: me, buyer_user_id: 'z', item_id: 'coal', qty: 5,
        gold_gross: 999, tax: 0, gold_net: 999, at: new Date(T - 99 * 3600000).toISOString() },
      // a PURCHASE inside the window: the player's own action, never news
      { id: 4, seller_user_id: 'q', buyer_user_id: me, item_id: 'iron_ore', qty: 2,
        gold_gross: 500, tax: 0, gold_net: 500, at: new Date(T - 600000).toISOString() },
    ], me);
    const receipt = { at: T, awayMs: 8 * 3600000, windowFrom: T - 8 * 3600000, windowTo: T };
    const line = MH.salesLineForReceipt(receipt, entries);
    assert(line === '2 listings sold · +340 gold',
      'expected "2 listings sold · +340 gold", got ' + JSON.stringify(line));
    // Singular reads as English, not as "1 listings".
    const one = MH.salesLineForReceipt(receipt, entries.filter((e) => e.itemId === 'oak_log'));
    assert(one === '1 listing sold · +200 gold', 'singular must not say "1 listings", got ' + one);
    // NOTHING in the window -> NO LINE AT ALL (never "0 sold").
    const quiet = { at: T, awayMs: 60000, windowFrom: T - 60000, windowTo: T };
    assert(MH.salesLineForReceipt(quiet, entries) === null,
      'a window with no sales must produce no line');
    // A receipt that names no usable window must not have one guessed for it.
    assert(MH.salesLineForReceipt({}, entries) === null, 'a windowless receipt must produce no line');
    /* The server-stated window WINS over the derived one: same receipt, but
       windowFrom pushed past both sales, so the fallback (at - awayMs) would
       still find them and the stated window must not. */
    const stated = { at: T, awayMs: 8 * 3600000, windowFrom: T - 60000, windowTo: T };
    assert(MH.salesLineForReceipt(stated, entries) === null,
      'the server-stated window must win over the duration fallback');
    // ...and with no stated window, the fallback reconstructs it from the span.
    assert(MH.salesLineForReceipt({ at: T, awayMs: 8 * 3600000 }, entries) === '2 listings sold · +340 gold',
      'the fallback window must reconstruct from at - awayMs');
  }),

  () => tryRun('LEDGER-3: the market panel renders history rows, an empty state, and never invents one', () => {
    const MH = window.HearthriseMarketHistory;
    const before = MH.getHistory();
    const me = 'user-me';
    try {
      /* UNKNOWN — never read. Must NOT claim "no trades": that is the client
         asserting something it cannot know, the same absence-is-not-a-claim
         rule applyEnvelopeState follows. */
      MH.__setHistoryCache({ status: 'unknown', entries: [] });
      window.showTab('market');
      window.renderMarket();
      let root = document.getElementById('market-root');
      assert(root, 'the market root must exist');
      assert(root.innerHTML.indexOf('Your trade history') >= 0, 'the ledger block must render');
      assert(root.innerHTML.indexOf('No trades yet') === -1,
        'an unread ledger must not claim the player has never traded');

      // EMPTY — read, and genuinely nothing.
      MH.__setHistoryCache({ status: 'ok', entries: [], userId: me, at: Date.now() });
      window.renderMarket();
      root = document.getElementById('market-root');
      assert(root.innerHTML.indexOf('No trades yet') >= 0, 'an empty ledger must say so plainly');

      // POPULATED — rows from a fixture, both roles.
      MH.__setHistoryCache({
        status: 'ok', userId: me, at: Date.now(),
        entries: MH.normalizeSales([
          { id: 7, seller_user_id: me, buyer_user_id: 'x', item_id: 'oak_log', qty: 10,
            gold_gross: 210, tax: 10, gold_net: 200, at: new Date(Date.now() - 3600000).toISOString() },
          { id: 8, seller_user_id: 'y', buyer_user_id: me, item_id: 'coal', qty: 3,
            gold_gross: 90, tax: 0, gold_net: 90, at: new Date(Date.now() - 7200000).toISOString() },
        ], me),
      });
      window.renderMarket();
      root = document.getElementById('market-root');
      const html = root.innerHTML;
      assert(html.indexOf('No trades yet') === -1, 'a populated ledger must not render the empty state');
      assert(html.indexOf('1 sold') >= 0 && html.indexOf('1 bought') >= 0,
        'the ledger header must total both sides');
      assert(html.indexOf('+200g') >= 0, 'a sale must show the NET it actually paid');
      assert(html.indexOf('21g each') >= 0, 'a sale must show the per-unit price it traded at');
      assert(html.indexOf('10g house tax') >= 0, 'a sale must name the house tax it lost');
      assert(html.indexOf('mk-ledger-tab') >= 0, 'the All/Sold/Bought filter must render');
      /* NO COUNTERPARTY IDENTITY. market-v2 exposes no name on this table and
         publishing the auth UUID is the exact hole S17 closed — so the render
         must not leak one even though the row carries it. */
      assert(html.indexOf('user-me') === -1, 'the ledger leaked an auth user id into the DOM');
    } finally { MH.__setHistoryCache(before); }
  }),

  // ════════════════════════════════════════════════════════════
  // b360 — PREFAB AVATAR PICKER (backlog #26)
  // ════════════════════════════════════════════════════════════
  // (a) The ten prefab portraits all ship and are in the ONE manifest. The
  // image-load half is real: it decodes every webp off the deploy, so a
  // manifest row pointing at a missing/renamed file fails here, not in front of
  // a player who opened the picker to an empty tile.
  () => tryRunAsync('b360: the ten prefab portraits all ship and are in the manifest', async () => {
    const I = window.HearthriseIdentity;
    const P = I.PREFABS;
    assert(Array.isArray(P) && P.length === 10,
      'there must be exactly ten prefab portraits, got ' + (P && P.length));
    assert(new Set(P.map((p) => p.id)).size === 10, 'prefab ids must be unique');
    P.forEach((p) => {
      assert(p.id && p.name && p.src, 'each prefab needs id/name/src: ' + JSON.stringify(p));
      assert(/^assets\/avatars\/[a-z]+\.webp$/.test(p.src),
        'a prefab src must be a shipped avatars webp, got ' + p.src);
      assert(!/raw-bundle|icons3/.test(p.src), 'a prefab must be a shipped asset, got ' + p.src);
      assert(!/painted\/npc\/player\.png/.test(p.src), 'a prefab must not be the retired default face');
      assert(I.prefabById(p.id) === p, 'prefabById must resolve every manifest id');
    });
    // Every file actually decodes off the deploy — no dead manifest rows.
    const results = await Promise.all(P.map((p) => new Promise((res) => {
      const im = new Image();
      im.onload = () => res({ id: p.id, ok: im.naturalWidth > 0 });
      im.onerror = () => res({ id: p.id, ok: false });
      im.src = p.src + '?smoke=' + Date.now();
    })));
    const dead = results.filter((r) => !r.ok).map((r) => r.id);
    assert(dead.length === 0, 'these prefab portraits failed to load off the deploy: ' + dead.join(', '));
  }),

  // (b) Selecting a prefab must flow through the SAME process+persist pipeline
  // as an upload — proving it is a portrait, not a local-only preset id, which
  // is what earns it cross-device sync. We assert the stored avatar is a
  // freshly RE-ENCODED dataURL (only processImage produces that), not the bare
  // bundled path, and that the render seam every surface reads now tracks it.
  () => tryRunAsync('b360: choosing a prefab routes through process+persist and updates the seam', async () => {
    const I = window.HearthriseIdentity;
    const rec = I._record();
    const saved = JSON.parse(JSON.stringify(rec.avatar));
    try {
      I.clearAvatar();
      assert(I.avatarUrl() === I.DEFAULT_AVATAR, 'a cleared avatar must resolve to the default placeholder');
      const res = await I.setAvatarFromPrefab('knight');
      assert(res && ['local', 'synced', 'partial'].indexOf(res.action) >= 0,
        'a prefab pick must complete through the upload pipeline, got ' + JSON.stringify(res));
      const r2 = I._record();
      assert(r2.avatar && typeof r2.avatar.data === 'string' &&
        /^data:image\/(webp|jpeg|png)/.test(r2.avatar.data),
        'the prefab must be re-encoded by processImage into a stored dataURL — proof it used the real pipeline, not a bare path');
      assert(r2.avatar.data.indexOf('assets/avatars/') === -1,
        'the stored portrait must be pixels, never the bundled prefab path (a preset id would not sync)');
      I.applyAvatar();
      assert(window._playerAvatar === r2.avatar.data, '_playerAvatar must track the chosen prefab through the seam');
      assert(window._playerAvatar !== I.DEFAULT_AVATAR, 'a chosen prefab must replace the default face');
      assert(!/painted\/npc\/player\.png/.test(window._playerAvatar),
        'player.png must never be the shown portrait after a choice');
    } finally {
      rec.avatar = saved;
      I._persist();
      I.applyAvatar();
    }
  }),

  // (c) player.png is retired as the default face — the picker exists so nobody
  // shares one default portrait, and the render seam must never resolve to it.
  () => tryRun('b360: player.png is retired as the default face', () => {
    const I = window.HearthriseIdentity;
    assert(I.DEFAULT_AVATAR === 'assets/avatars/placeholder-portrait.webp',
      'the default face must be the neutral placeholder, got ' + I.DEFAULT_AVATAR);
    assert(!/painted\/npc\/player\.png/.test(I.DEFAULT_AVATAR),
      'player.png must no longer be the default portrait');
    assert(!/raw-bundle|icons3/.test(I.DEFAULT_AVATAR), 'the default must be a shipped asset');
    const rec = I._record();
    const saved = JSON.parse(JSON.stringify(rec.avatar));
    try {
      rec.avatar = { data: null, remote: null, status: null, at: 0 };
      assert(I.avatarUrl() === I.DEFAULT_AVATAR, 'with no upload the portrait must be the placeholder default');
    } finally { rec.avatar = saved; I.applyAvatar(); }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     b371 — ONE PORTRAIT SOURCE OF TRUTH (live audit F22).
     Reported as "the header caches one reload behind". Measured in the real
     client: change the portrait and the Home hearth banner keeps the PREVIOUS
     face until the next boot, because it bakes its <img> into an innerHTML
     string and only rebuilds on its own schedule. Same defect class on the
     arena plates, which are painted once and never again. The reported surface
     and the measured surface differ; the cause and the fix do not.

     These three assert the CONTRACT, not the symptom:
       (a) a portrait change reaches every registered surface with NO
           re-render — that is what "in one frame" means here.
       (b) the registry is not empty and every render site is enrolled — a
           surface that quietly stops carrying the attribute must fail HERE,
           not one reload later on a player's screen.
       (c) a reboot-equivalent re-boot paints the CURRENT portrait, so first
           paint is never the previous choice or the placeholder.
     ═════════════════════════════════════════════════════════════════════ */

  // (a) THE REGRESSION. Surfaces are stamped with a wrong portrait by hand and
  // must all be corrected by ONE seam call, with nothing re-rendered in between.
  // Mutation: restore the old refreshUi (header-only, by selector) → the two
  // non-header surfaces keep the stale src and this goes red.
  () => tryRun('b371: a portrait change repaints EVERY registered surface, with no re-render', () => {
    const I = window.HearthriseIdentity;
    assert(typeof I.paintAvatars === 'function', 'the seam must expose paintAvatars()');
    assert(I.AVATAR_ATTR === 'data-hr-avatar', 'the registry attribute must be data-hr-avatar');
    const STALE = 'assets/avatars/knight.webp';
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-9999px;top:0';
    // Three stand-ins for the three shapes that exist in the game: a static
    // markup img with the one-shot onerror latch already tripped, a plain
    // render-time img, and one that a failed load had hidden outright.
    host.innerHTML =
      '<img id="hr-t-static" data-hr-avatar src="' + STALE + '">' +
      '<img id="hr-t-render" data-hr-avatar src="' + STALE + '">' +
      '<img id="hr-t-hidden" data-hr-avatar src="' + STALE + '" style="display:none">';
    document.body.appendChild(host);
    host.querySelector('#hr-t-static').dataset.fellBack = '1';
    try {
      const want = window._playerAvatar || I.DEFAULT_AVATAR;
      // Through applyAvatar(), i.e. the path a real portrait change takes —
      // asserting paintAvatars() directly would pass against an applyAvatar()
      // that never calls it, which is precisely the regression.
      I.applyAvatar();
      ['hr-t-static', 'hr-t-render', 'hr-t-hidden'].forEach((id) => {
        const el = document.getElementById(id);
        assert(el.getAttribute('src') === want,
          id + ' must hold the current portrait after one seam call, got ' + el.getAttribute('src'));
      });
      assert(!document.getElementById('hr-t-static').dataset.fellBack,
        'the one-shot fallback latch must be cleared, or a portrait that failed once can never be replaced');
      assert(document.getElementById('hr-t-hidden').style.display !== 'none',
        'a surface hidden by a previous failed load must be shown again');
      assert(I.paintAvatars() >= 3, 'paintAvatars must see the registered surfaces');
    } finally { host.remove(); }
  }),

  // (b) THE REGISTRY IS POPULATED. A source-shaped claim deliberately: the
  // failure this catches is a render site being added (or reverted) WITHOUT the
  // attribute, which no runtime assertion on the current DOM can see because
  // that panel may not be mounted.
  () => tryRunAsync('b371: every portrait render site is enrolled in the registry', async () => {
    const SITES = [
      ['index.html', /class="player-avatar"[\s\S]{0,200}?data-hr-avatar/],
      ['src/features/home-dashboard.js', /hd-ava[\s\S]{0,400}?data-hr-avatar/],
      ['src/features/character-page.js', /cr-hero-portrait[\s\S]{0,120}?data-hr-avatar/],
      ['src/features/character-page.js', /csk-hero-portrait[\s\S]{0,120}?data-hr-avatar/],
      ['src/features/combat-screens.js', /arena-player-portrait[\s\S]{0,600}?data-hr-avatar/],
      ['src/legacy.js', /char-avatar[^\n]{0,120}data-hr-avatar/],
      ['src/legacy.js', /cr-hero-portrait[^\n]{0,120}data-hr-avatar/],
      ['src/legacy.js', /ce-champ[^\n]{0,120}data-hr-avatar/],
    ];
    // COMMENTS ARE STRIPPED FIRST, and that is not fussiness. The first run of
    // this guard passed against a home-dashboard.js whose <img> had LOST the
    // attribute, because the explanatory comment two lines above still said the
    // words "data-hr-avatar". A source guard a comment can satisfy is not a
    // guard — it is a spell-check.
    const strip = (t) => t
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^[ 	]*\/\/.*$/gm, ' ');
    const cache = {};
    for (const [file, re] of SITES) {
      if (!cache[file]) cache[file] = strip(await (await fetch(file + '?cache=' + Date.now())).text());
      assert(re.test(cache[file]),
        file + ' has a portrait render site with no data-hr-avatar — it will lag a portrait change');
    }
    // And the live document must actually carry some, or the attribute is a
    // convention nobody follows.
    assert(document.querySelectorAll('img[data-hr-avatar]').length >= 1,
      'no registered portrait surface in the live document');
  }),

  // (c) FIRST PAINT. The seam must publish from STORAGE at script time, not
  // from the deferred boot() — otherwise every render in the first ~1.2s bakes
  // the default face into its markup and the header shows the placeholder.
  // Simulated by resetting the in-memory mirror to what a cold document holds
  // and re-running the same publish the script tail runs.
  () => tryRunAsync('b371: a reboot publishes the CURRENT portrait, not the previous one', async () => {
    const I = window.HearthriseIdentity;
    const rec = I._record();
    const saved = JSON.parse(JSON.stringify(rec.avatar));
    const savedSeam = window._playerAvatar;
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-9999px;top:0';
    host.innerHTML = '<img id="hr-t-boot" data-hr-avatar src="' + I.DEFAULT_AVATAR + '">';
    document.body.appendChild(host);
    try {
      await I.setAvatarFromPrefab('rogue');
      const chosen = I._record().avatar.data;
      assert(typeof chosen === 'string' && chosen.indexOf('data:') === 0, 'the pick must have persisted');
      // A cold document: markup default in the DOM, legacy's boot assignment in
      // the mirror, nothing else. This is exactly the state identity.js's
      // script tail runs in.
      host.querySelector('#hr-t-boot').src = I.DEFAULT_AVATAR;
      window._playerAvatar = 'assets/icons-bundle/painted/npc/player.png';
      I.applyAvatar();                                   // == the script-time publish
      assert(window._playerAvatar === chosen,
        'the seam must resolve the STORED portrait at boot, got ' + String(window._playerAvatar).slice(0, 40));
      assert(document.getElementById('hr-t-boot').getAttribute('src') === chosen,
        'first paint must show the current portrait, not the placeholder or the previous choice');
    } finally {
      host.remove();
      rec.avatar = saved; I._persist();
      window._playerAvatar = savedSeam;
      I.applyAvatar();
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     b361 — THE BRAND. Three guards, and each one exists because the failure it
     names is INVISIBLE in source.

     The b218 lockup it replaces was hand-drawn CSS + type, so "is the brand
     right" was answerable by reading a file. It is not any more: the mark is
     two derived asset files, produced by tools/brand-process.mjs from Tyler's
     approved exports. A brand can now break in ways no code review can see —
     a 404 leaves an empty <img> box where the game's name should be, a
     re-export that forgets the chroma-key pastes a brown rectangle onto the
     sidebar, and a re-run of the pipeline that loses its geometry rule quietly
     puts the redundant sun glyph back above the lettering.

     So these assert the PIXELS AND THE ARTBOARD, not the markup: the files are
     fetched and decoded, the crest's corner alpha is read out of a canvas, and
     the wordmark's viewBox is checked to prove the sun cannot be inside it.
     ══════════════════════════════════════════════════════════════════════ */

  // #1 The sidebar block: the approved lockup, and the tagline is gone.
  () => tryRun('b361: the sidebar brand is the crest + wordmark lockup, with no "Idle Homestead" anywhere', () => {
    const brand = document.querySelector('.sidebar .brand');
    assert(brand, 'the sidebar brand block is missing');
    assert(brand.getAttribute('aria-label') === 'Hearthrise',
      'the brand block must announce itself as "Hearthrise": ' + brand.getAttribute('aria-label'));
    const emblem = brand.querySelector('img.brand-emblem');
    const word = brand.querySelector('img.brand-word');
    assert(emblem && /assets\/brand\/hearthrise-crest\.png/.test(emblem.getAttribute('src') || ''),
      'the crest image is missing from the sidebar lockup');
    assert(word && /assets\/brand\/hearthrise-wordmark\.svg/.test(word.getAttribute('src') || ''),
      'the wordmark image is missing from the sidebar lockup');
    /* The retired strapline. Checked over the whole block AND the document
       title/manifest below, because it lived in three places and a rename that
       only clears one of them is the drift this repo keeps shipping. */
    assert(!/idle\s*homestead/i.test(brand.textContent + ' ' + brand.innerHTML),
      'the "Idle Homestead" tagline is back in the brand block');
    assert(!/idle\s*homestead/i.test(document.title),
      'the document title still says "Idle Homestead": ' + document.title);
    // Project rule: zero emoji as art, anywhere.
    assert(!brand.textContent.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu),
      'the brand block renders emoji');
    // It is a horizontal lockup — the emblem and the wordmark share a row.
    const eb = emblem.getBoundingClientRect(), wb = word.getBoundingClientRect();
    if (eb.width > 0 && wb.width > 0) {          // .brand-word is hidden in the 64px icon rail
      assert(wb.left >= eb.right - 1, 'the wordmark must sit BESIDE the crest, not under it');
      assert(eb.width > 12 && eb.height > 12, 'the crest collapsed: ' + eb.width + 'x' + eb.height);
      assert(wb.width > 40, 'the wordmark collapsed to ' + wb.width + 'px wide');
    }
  }),

  // #2 The assets themselves: they exist, they decode, and they are the
  // PROCESSED ones — keyed matte on the crest, no sun on the wordmark.
  () => tryRunAsync('b361: the brand assets resolve, the crest has a real cut-out, the wordmark has no sun glyph', async () => {
    /* Bare paths on purpose: this asserts the FILES are on the deploy. The
       cache-buster is a separate contract and bump-version.sh owns it — but a
       reference that lost its ?v= would serve a stale brand for ~10 minutes
       after a deploy, so check that too, on the reference the app really uses. */
    const liveSrc = (document.querySelector('img.brand-emblem') || {}).getAttribute
      ? document.querySelector('img.brand-emblem').getAttribute('src') : '';
    assert(/\?v=\d+$/.test(liveSrc), 'the sidebar crest carries no cache-buster: ' + liveSrc);
    const files = ['hearthrise-crest.png', 'hearthrise-mark.png', 'hearthrise-wordmark.svg', 'hearthrise-splash.jpg'];
    const bodies = {};
    for (const f of files) {
      const res = await fetch('assets/brand/' + f, { cache: 'no-store' });
      assert(res.ok, 'assets/brand/' + f + ' did not load (' + res.status + ') — the brand would render as an empty box');
      const buf = await res.arrayBuffer();
      assert(buf.byteLength > 1024, 'assets/brand/' + f + ' is ' + buf.byteLength + ' bytes — that is not the asset');
      bodies[f] = buf;
    }

    /* The crest must carry a real alpha channel with its export matte keyed
       OUT. Read the corner, not the header: a PNG can be colour-type 6 and
       still be fully opaque, which is exactly the state this asset arrived
       in. An opaque corner here means a dark-brown rectangle on the rail. */
    const img = new Image();
    img.src = 'assets/brand/hearthrise-crest.png';
    await img.decode();
    assert(img.naturalWidth > 200 && img.naturalHeight > 200,
      'the crest decoded at ' + img.naturalWidth + 'x' + img.naturalHeight);
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const corner = cx.getImageData(0, 0, 1, 1).data;
    assert(corner[3] === 0,
      'the crest corner is opaque (alpha ' + corner[3] + ') — its export matte was never keyed out');
    // ...and it is not blank: something in the middle must actually be painted.
    const mid = cx.getImageData((cv.width / 2) | 0, (cv.height * 0.42) | 0, 1, 1).data;
    assert(mid[3] > 0, 'the crest is transparent in the middle — the key ate the drawing');

    const svg = new TextDecoder().decode(bodies['hearthrise-wordmark.svg']);
    const vb = (svg.match(/viewBox="([-\d.\s]+)"/) || [])[1];
    assert(vb, 'the wordmark has no viewBox — it cannot be sized by width alone');
    const [, vy, vw, vh] = vb.trim().split(/\s+/).map(Number);
    /* The sun glyph occupies y 370.9–472.2 in the source's 1024 artboard and
       the lettering starts at y 490.8. An artboard that begins below 480 is
       therefore PROOF the sun is not in the file — a much harder thing to
       regress than "the string <path> appears N times". */
    assert(vy >= 480, 'the wordmark artboard starts at y=' + vy + ' — the redundant sun glyph is back');
    assert(vw / vh > 5 && vw / vh < 7, 'the wordmark aspect is ' + (vw / vh).toFixed(2) + ':1, expected ~5.98:1');
    assert(!/<metadata/.test(svg), 'the wordmark still carries its generator metadata blob');
    assert(!/d="M0 0L1024 0L1024 1024L0 1024L0 0Z"/.test(svg),
      'the wordmark still carries its full-canvas background plate — it will paint a dark box on parchment');
    /* The four letterform counters are painted in the plate colour, so once
       the plate is gone they MUST be a mask or they become black blobs on any
       light surface. Caught by rendering, not by reading; guarded here. */
    assert(/<mask[^>]+id="hr-wordmark-counters"/.test(svg) && /mask="url\(#hr-wordmark-counters\)"/.test(svg),
      'the wordmark counters are not masked — they will render as dark blobs off a dark background');
  }),

  // #3 The name. Three surfaces carried "Idle Homestead"; all three must agree.
  () => tryRunAsync('b361: title, favicon and PWA manifest all name the game "Hearthrise"', async () => {
    assert(document.title === 'Hearthrise', 'the document title is "' + document.title + '"');
    const icon = document.querySelector('link[rel="icon"]');
    assert(icon && /assets\/brand\/hearthrise-mark\.png/.test(icon.getAttribute('href') || ''),
      'the favicon is not the brand mark: ' + (icon && icon.getAttribute('href')));
    assert(!document.querySelector('link[href*="hearthrise-logo.svg"]'),
      'the retired hearthrise-logo.svg is still referenced');
    /* installPwa() serialises the manifest into a blob: URL, which is exactly
       what an installing browser reads — so fetch THAT, not the source string.
       Reading the literal in legacy.js would pass against a manifest that
       never got installed, which is the failure that actually costs a player
       a home-screen icon. */
    const man = document.querySelector('link[rel="manifest"]');
    assert(man, 'the PWA manifest was never installed');
    const j = await (await fetch(man.href)).json();
    assert(j.name === 'Hearthrise', 'the installed app is named "' + j.name + '"');
    assert(j.short_name === 'Hearthrise', 'the short name is "' + j.short_name + '"');
    assert(Array.isArray(j.icons) && j.icons.length > 0, 'the manifest ships no icons');
    j.icons.forEach((ic) => {
      assert(/assets\/brand\/hearthrise-mark\.png/.test(ic.src),
        'a manifest icon still points at a retired asset: ' + ic.src);
    });
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b372 — THE TWO LIVE-PLAY DEFECTS FROM THE 2026-08-17 AUDIT.

     F7  AUTO-EAT NEVER FIRES.  Settings said "Auto-eat HP threshold 50%";
         the character sat at 3/10 for dozens of swings with edible food in
         the bag and died twice. Nothing downstream was broken — the engine
         gate is `enabled && owned` and BOTH were false. The SCREEN was the
         defect: it painted a live, draggable, persisted control for a trait
         the character did not own, and for an `enabled` switch that had no
         UI anywhere in the game.
     F18 FIGHT RESUME BROKEN.  A mid-fight reload showed a Resume chip that
         did not resume — `startCombat` is a TOGGLE and the chip's guard was
         evaluated at PAINT time, so pressing it once the fight had re-armed
         STOPPED it. And the server's Phase-0 fight carry
         (`player_state.fight`) had no client reader at all, so any reconcile
         that moved the pointer restarted the foe at full health.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRun('F7-1: Settings must not offer an operative auto-eat threshold without the trait', () => {
    const realHasTrait = window.hasTrait;
    const snap = snapshotG();
    try {
      /* UNOWNED. The screen may describe auto-eat; it may not offer a control
         for it. A range input here is the bug verbatim — a persisted setting
         that governs nothing, on a paid feature the player has not bought. */
      window.hasTrait = function (id) { return id === 'auto_eat' ? false : realHasTrait.apply(this, arguments); };
      window.openSettings();
      const body = document.getElementById('settings-body');
      assert(body, 'the settings modal did not render');
      const lockedHtml = body.innerHTML;
      const lockedTxt = body.textContent.replace(/\s+/g, ' ');
      assert(!/data-set="autoEatPct"/.test(lockedHtml),
        'THE F7 BUG: the auto-eat threshold slider is live for a character without the trait');
      assert(!/data-autoeat=/.test(lockedHtml),
        'an auto-eat ON/OFF switch is offered for a trait the character does not own');
      assert(/ss-locked-tag/.test(lockedHtml), 'the auto-eat row is not marked locked');
      /* Dimmed alone is a bug report. It must say WHERE to get it and WHAT to
         do meanwhile — the same sentence renderCombat() already prints. */
      assert(/Bounty Marks|gold/.test(lockedTxt) && /Store/.test(lockedTxt),
        'the locked row never names the price or the shop: ' + lockedTxt.slice(0, 400));
      assert(/manual|by hand|press .?Eat/i.test(lockedTxt),
        'the locked row never tells the player how to heal instead: ' + lockedTxt.slice(0, 400));

      /* OWNED. Both controls appear, and the switch is a real one.
         b459: the tiered settings row derives the tier from G.traits itself
         (autoEatTier), not through hasTrait — so ownership must be REAL state,
         not just the mocked predicate. */
      window.hasTrait = function (id) { return id === 'auto_eat' ? true : realHasTrait.apply(this, arguments); };
      window.G.traits = Object.assign({}, window.G.traits, { auto_eat: true });
      window.openSettings();
      const owned = document.getElementById('settings-body');
      assert(/data-set="autoEatPct"/.test(owned.innerHTML),
        'the threshold slider is missing for a character who OWNS auto-eat');
      const sw = owned.querySelector('[data-autoeat="enabled"]');
      assert(sw, 'the auto-eat ON/OFF switch is missing — `enabled` is unreachable from the UI again');
      assert(!/ss-locked-tag/.test(owned.innerHTML), 'auto-eat still reads as locked for an owner');
    } finally {
      window.hasTrait = realHasTrait;
      try { document.getElementById('settings-modal').classList.remove('show'); } catch (e) {}
      restoreG(snap);
    }
  }),

  () => tryRun('F7-2: the Settings switch drives the ENGINE, and the whole eat chain fires', () => {
    const A = window.HearthriseAuto;
    assert(A && typeof A.maybeAutoEat === 'function', 'HearthriseAuto is not published');
    const snap = snapshotG();
    const eatBefore = A.getEat();
    const traitsBefore = JSON.parse(JSON.stringify(window.G.traits || {}));
    const realHasTrait = window.hasTrait;
    try {
      window.G.traits = { auto_eat: true, auto_eat_2: true };  // b459: tier II = the pre-tier threshold behaviour
      window.hasTrait = function (id) { return id === 'auto_eat' ? true : realHasTrait.apply(this, arguments); };
      /* Start from the state the audit found: the trait owned, the switch OFF.
         Before b372 this state was unreachable from the UI — which is why a
         grandfathered save could sit in it forever. */
      A.setEat({ enabled: false, threshold: 0.5, foodId: null });
      window.G.playerMaxHp = 10; window.G.playerHp = 3;
      window.G.inventory = window.G.inventory || {};
      window.G.inventory.cooked_shrimp = 4;
      window.G.combatLog = [];
      assert(A.maybeAutoEat() === false, 'auto-eat fired while switched off');

      /* Now flip it THROUGH THE SCREEN — the click path, not the API. */
      window.openSettings();
      const sw = document.getElementById('settings-body').querySelector('[data-autoeat="enabled"]');
      assert(sw, 'the switch is not on the Gameplay panel');
      sw.checked = true;
      sw.dispatchEvent(new Event('change', { bubbles: true }));
      assert(A.getEat().enabled === true,
        'the Settings switch did not reach the engine — `autoActions.eat.enabled` is still '
        + A.getEat().enabled);

      /* THRESHOLD CROSSED → FOOD CONSUMED → HP UP. The whole chain, in one go. */
      const preHp = window.G.playerHp, preQty = window.G.inventory.cooked_shrimp;
      assert(A.maybeAutoEat() === true, 'auto-eat still did not fire with the trait owned and the switch on');
      assert(window.G.playerHp > preHp, 'HP did not rise: ' + preHp + ' -> ' + window.G.playerHp);
      assert(window.G.inventory.cooked_shrimp === preQty - 1, 'no food was consumed');

      /* And the trait gate is still unbypassable — the switch is not a way in. */
      window.G.playerHp = 3;
      window.G.traits = {};
      assert(A.maybeAutoEat() === false,
        'auto-eat fired WITHOUT the purchased trait — the 100-mark gate is gone');
    } finally {
      window.hasTrait = realHasTrait;
      try { document.getElementById('settings-modal').classList.remove('show'); } catch (e) {}
      A.setEat(eatBefore);
      window.G.traits = traitsBefore;
      restoreG(snap);
    }
  }),

  () => tryRun('F7-3: the v5→v6 grandfather must switch auto-eat ON, not just grant the trait', () => {
    assert(typeof window.applyMigrations === 'function', 'applyMigrations is not published');
    /* The `foodSlot` arm of the migration matches saves whose
       `autoActions.eat.enabled` is FALSE. Granting the trait alone left those
       players with a 100-mark feature and an off switch that had no UI — the
       exact state F7 was reported from. */
    const legacy = window.applyMigrations({
      v: 5, foodSlot: 'cooked_shrimp',
      autoActions: { eat: { enabled: false, threshold: 0.3, foodId: null, pctSynced: true } },
    });
    assert(legacy.traits && legacy.traits.auto_eat === true, 'the trait was not grandfathered');
    assert(legacy.autoActions.eat.enabled === true,
      'THE F7-3 BUG: the trait was granted but auto-eat stayed switched off');
    assert(legacy.autoActions.eat.foodId === 'cooked_shrimp',
      'the legacy foodSlot choice was dropped: ' + legacy.autoActions.eat.foodId);
    assert(legacy.autoActions.eat.threshold === 0.3,
      'the migration overwrote a threshold the player had already chosen');
    /* And it must stay a MIGRATION: a fresh save never enters this branch, so
       a new player still has to buy the trait. */
    const fresh = window.applyMigrations({ v: 5, autoActions: { eat: { enabled: false, threshold: 0.5, foodId: null } } });
    assert(!(fresh.traits && fresh.traits.auto_eat),
      'a save with no auto-eat history was handed the trait for free');
    assert(!(fresh.autoActions && fresh.autoActions.eat && fresh.autoActions.eat.enabled),
      'a save with no auto-eat history was switched on');
  }),

  () => tryRun('F18-1: fightOf() reads the server carry, and refuses everything it is unsure of', () => {
    const M = window.HearthriseActivity;
    assert(M && typeof M.fightOf === 'function',
      'THE F18 BUG: nothing on the client reads `state.fight` — the server carries the fight and '
      + 'the client throws it away');
    const ok = M.fightOf({ state: { fight: { monster: 'slime', hp: 3, kills: 7 } } });
    assert(ok && ok.monster === 'slime' && ok.hp === 3 && ok.kills === 7,
      'a well-formed carry was not read: ' + JSON.stringify(ok));
    /* The migration's own encoding: null = no column, {} = no fight. Both mean
       "do not resume", and neither may become a phantom foe. */
    assert(M.fightOf({ state: { fight: null } }) === null, 'a null carry became a fight');
    assert(M.fightOf({ state: { fight: {} } }) === null, 'an empty carry became a fight');
    assert(M.fightOf({ state: {} }) === null, 'an absent carry became a fight');
    assert(M.fightOf(null) === null, 'a missing body became a fight');
    /* hp 0 is a DEAD foe. Resuming one is how you get a monster that cannot be
       killed, so it is refused rather than repaired. */
    assert(M.fightOf({ state: { fight: { monster: 'slime', hp: 0, kills: 1 } } }) === null,
      'a zero-hp carry was accepted');
    assert(M.fightOf({ state: { fight: { monster: 'slime', hp: 'lots' } } }) === null,
      'a non-numeric hp was accepted');
    assert(M.fightOf({ state: { fight: { monster: '', hp: 5 } } }) === null,
      'a nameless monster was accepted');
    /* A missing kill count is 0, not NaN — it feeds G.combatKillsThisFoe. */
    const k = M.fightOf({ state: { fight: { monster: 'slime', hp: 2 } } });
    assert(k && k.kills === 0, 'a missing kill count did not default to 0: ' + JSON.stringify(k));
  }),

  () => tryRun('F18-2: a reconcile RESUMES the carried fight instead of restarting the foe', () => {
    assert(typeof window.reconcileActivityPointer === 'function', 'the reconcile seam is gone');
    const snap = snapshotG();
    const killsBefore = window.G.combatKillsThisFoe;
    /* `_hpLocalAt` is NOT on the snapshotG allowlist (and could not be: the
       snapshot round-trips through JSON, which drops an `undefined`), so the
       stamp below would otherwise outlive this test on the live G and tell
       every later `startCombat` that the client owns the bar. Captured by hand
       and put back — including back to ABSENT, which is the ordinary state. */
    const hadLocalAt = Object.prototype.hasOwnProperty.call(window.G, '_hpLocalAt');
    const localAtBefore = window.G._hpLocalAt;
    try {
      window.stopCombat();
      /* A 520-hp boss and an unkillable champion, so the one live swing
         `startCombat()` fires can end neither side. Without that this test
         would be a coin flip on whatever gear the suite left equipped, and a
         flaky guard is worse than no guard. It is also the case that MATTERS:
         a foe whose time-to-kill exceeds one settle window is precisely what
         the fight-carry column exists for. */
      window.G.playerMaxHp = 1e6; window.G.playerHp = 1e6;
      /* AND KEEP IT. b511's startCombat seeds the bar from the server's last
         stated hp whenever that statement is NEWER than the last moment the
         client owned the bar (`_hpLocalAt`), and it takes the MIN — so an
         earlier test that left a serverHp observation behind silently clamps
         this fixture's 1e6 back to a killable number, the "unkillable" premise
         breaks and the fight can end from a knockout mid-test (CI b511: F18-2
         red on the full run, green in isolation). Stamping `_hpLocalAt` is the
         engine's own way of saying "the client owns this number now" — it
         changes no engine behaviour, only the fixture's. */
      window.G._hpLocalAt = Date.now();
      const max = window.MONSTERS.dragon.hp;
      /* The server says: you are on the dragon, and it is nearly dead. Before
         b372 this landed on startCombat() alone and the player got a brand-new
         dragon at full health — the entire fight, thrown away, every settle. */
      window.reconcileActivityPointer({ kind: 'combat', id: 'dragon' },
        { monster: 'dragon', hp: 5, kills: 4 });
      assert(window.G.activeMonster === 'dragon', 'the reconcile did not enter the fight');
      assert(window.G.monsterMaxHp === max, 'the max HP is not the catalogue value');
      assert(window.G.monsterHp <= 5, 'THE F18 BUG: the carried fight was discarded — the dragon is on '
        + window.G.monsterHp + '/' + max + ' instead of 5');
      assert(window.G.combatKillsThisFoe >= 4, 'the carried kill count was dropped: '
        + window.G.combatKillsThisFoe);

      /* STALE CARRY, FAIL CLOSED. A carry naming a different monster must never
         pour its HP into the current foe — that is a free half-killed boss.
         Mirrors the Edge engine's `fight.monster === activeId` guard. */
      window.stopCombat();
      window.reconcileActivityPointer({ kind: 'combat', id: 'dragon' },
        { monster: 'goblin', hp: 5, kills: 99 });
      assert(window.G.monsterHp > 5, 'a carry for ANOTHER monster was applied to this one');
      assert(window.G.combatKillsThisFoe < 99, 'a stale carry moved the kill count');

      /* And a carry above the catalogue ceiling is clamped, not trusted — a
         monster with more HP than it has cannot be killed. */
      window.stopCombat();
      window.reconcileActivityPointer({ kind: 'combat', id: 'dragon' },
        { monster: 'dragon', hp: 1e9, kills: 0 });
      assert(window.G.monsterHp <= max, 'an over-ceiling carry was not clamped: ' + window.G.monsterHp);
    } finally {
      try { window.stopCombat(); } catch (e) {}
      if (hadLocalAt) window.G._hpLocalAt = localAtBefore; else delete window.G._hpLocalAt;
      window.G.combatKillsThisFoe = killsBefore;
      restoreG(snap);
    }
  }),

  () => tryRun('F18-3: a reconcile for the fight already running must not revert live damage', () => {
    const snap = snapshotG();
    try {
      window.G.playerMaxHp = 1e6; window.G.playerHp = 1e6;
      window.startCombat('dragon');
      /* AND AGAIN AFTER THE TAP. `startCombat` SEEDS the bar from the server's
         last stated hp (b511, "the server owns the HP bar") and then takes one
         swing itself — so a low server reading left by an earlier battery puts
         this fixture in front of a dragon on single-figure health and it dies
         inside the setup, raising the real death sheet over the rest of the run.
         The subject here is the pointer reconcile; dying in the fixture is noise
         with a full-screen overlay attached. */
      window.G.playerMaxHp = 1e6; window.G.playerHp = 1e6;
      window.G.monsterHp = 5;                       // the player has nearly won
      /* The carry is a CHECKPOINT from the last settle, so it is always older
         than a fight this client is watching. Writing it over a running fight
         would hand the monster its health back mid-swing. */
      window.reconcileActivityPointer({ kind: 'combat', id: 'dragon' },
        { monster: 'dragon', hp: window.MONSTERS.dragon.hp, kills: 0 });
      assert(window.G.monsterHp <= 5,
        'a stale checkpoint reverted a live fight: the dragon went back to ' + window.G.monsterHp);
    } finally {
      try { window.stopCombat(); } catch (e) {}
      /* A fight in a fixture can still end in a death (the opening swing lands
         before the line above runs), and a death raises a full-screen sheet. */
      try { window.HearthriseDeathSheet.__resetForTest(); } catch (e) {}
      restoreG(snap);
    }
  }),

  () => tryRun('F18-4: the Resume chip must never STOP the fight it offers to resume', () => {
    const LP = window.HearthriseLaunchpad;
    assert(LP && typeof LP.getResumePayload === 'function', 'the launchpad is not published');
    const snap = snapshotG();
    const realShowTab = window.showTab;
    try {
      window.showTab = () => {};
      window.G.playerMaxHp = 1e6; window.G.playerHp = 1e6;
      /* Paint the card in the state that produces it: idle, with a fight in the
         recent past. */
      window.stopCombat();
      window.G.lastActivity = { kind: 'monster', id: 'dragon', stoppedAt: Date.now() };
      const p = LP.getResumePayload();
      assert(p && p.kind === 'monster' && p.id === 'dragon', 'no Resume payload for a recent fight');

      /* THE RACE, REPRODUCED. Between the paint and the press, the boot's
         loadLocal() re-arms the saved fight (or a server reconcile does). The
         card is still on screen. `startCombat` is a toggle, so the old action
         stopped the very fight it advertised — "a Resume chip appeared but did
         not resume", verbatim. */
      window.startCombat('dragon');
      window.G.monsterHp = 9;
      p.action();
      assert(window.G.activeMonster === 'dragon',
        'THE F18-4 BUG: pressing Resume STOPPED the fight (activeMonster is now '
        + window.G.activeMonster + ')');
      assert(window.G.monsterHp <= 9,
        'Resume restarted the foe it was already fighting: ' + window.G.monsterHp);

      /* A DIFFERENT foe running is a real switch and must still work. */
      window.startCombat('goblin');
      p.action();
      assert(window.G.activeMonster === 'dragon', 'Resume no longer switches away from another foe');
    } finally {
      window.showTab = realShowTab;
      try { window.stopCombat(); } catch (e) {}
      try { window.HearthriseDeathSheet.__resetForTest(); } catch (e) {}
      restoreG(snap);
    }
  }),

  // ══════════════════════════════════════════════════════════════════════════
  // b371 regression suite — the live-audit polish batch (F16/F19/F20/F21/F23/
  // F24/F25 + the quest badge + the leaderboard availability flag).
  //
  // These are UI defects, and the suite cannot see layout — so each test
  // asserts the STRUCTURAL fact the defect was made of, chosen so that
  // reverting the fix fails it. Where the fact is geometric (the toast column)
  // the assertion is on the pure placement function, not on a viewport, because
  // one window size can never see a breakpoint it is not in (b368).
  // ══════════════════════════════════════════════════════════════════════════

  /* F21 — the toast column parked itself 406px off the right edge whenever the
     renderer stalled, because the entrance animated from translateX(110%) and
     `both` holds the from-state for the whole (throttled) duration. Measured
     live at 1745x950. The guard is on the KEYFRAME, since that is the fact:
     an entrance transform must stay inside the element's own footprint. */
  () => tryRun('b371 (F21): the toast entrance never leaves the element footprint', () => {
    let from = null;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of Array.from(rules || [])) {
        if (r.type === CSSRule.KEYFRAMES_RULE && r.name === 'notif-in') {
          for (const kf of Array.from(r.cssRules || [])) {
            if (/(^|,)\s*(0%|from)\s*$/.test(kf.keyText)) from = kf.style.transform;
          }
        }
      }
    }
    assert(from != null, 'the notif-in keyframe has no from-state — cannot verify the entrance');
    assert(!/%/.test(from),
      'notif-in starts at "' + from + '" — a PERCENTAGE translate is a full-column '
      + 'displacement, so a stalled frame leaves the toast off-screen');
  }),

  () => tryRun('b371 (F21): a long unbroken token cannot push a toast out of its box', () => {
    if (!window.HearthriseToasts) throw new Error('HearthriseToasts missing');
    window.HearthriseToasts.clear();
    try {
      window.notify('ToastProbeWrap ' + 'x'.repeat(90), 'info');
      const el = findToast('ToastProbeWrap');
      assert(el, 'notify() produced no toast element');
      const t = el.querySelector('.notif-text');
      assert(t, 'the toast has no .notif-text cell');
      assert(t.scrollWidth <= t.clientWidth + 1,
        'the toast text overflows its cell (' + t.scrollWidth + ' in ' + t.clientWidth + ') — '
        + 'an id or a display name will run off the right edge');
    } finally { window.HearthriseToasts.clear(); }
  }),

  () => tryRun('b371 (F21): the toast column is clamped inside the viewport', () => {
    const T = window.HearthriseToasts;
    if (!T || typeof T.computeOffsets !== 'function') throw new Error('computeOffsets missing');
    // A full-width bottom bar, a corner pill, a tall panel, and an absurd
    // obstacle far off-screen — the last one is the case a future edit to the
    // branch logic could turn into a negative left edge.
    const cases = [
      { vw: 1440, vh: 900, obs: [{ left: 0, right: 1440, top: 840 }] },
      { vw: 922,  vh: 423, obs: [{ left: 0, right: 922,  top: 360 }] },
      { vw: 1745, vh: 950, obs: [{ left: 1600, right: 1740, top: 880 }] },
      { vw: 1024, vh: 768, obs: [{ left: 400,  right: 1024, top: 40  }] },
      { vw: 360,  vh: 640, obs: [{ left: -500, right: 1200, top: 100 }] },
      { vw: 1280, vh: 800, obs: [] },
    ];
    cases.forEach((c) => {
      const o = T.computeOffsets(c.vw, c.vh, c.obs);
      assert(o.right >= 0, c.vw + 'x' + c.vh + ': right offset is ' + o.right);
      assert(o.bottom >= 0, c.vw + 'x' + c.vh + ': bottom offset is ' + o.bottom);
      const colW = Math.min((c.vh <= 560 ? 280 : 380), c.vw - 24);
      assert(o.right + colW <= c.vw,
        c.vw + 'x' + c.vh + ': the column (right ' + o.right + ' + width ' + colW
        + ') hangs off the left edge of a ' + c.vw + 'px viewport');
      assert(o.bottom < c.vh, c.vw + 'x' + c.vh + ': the column is above the viewport');
    });
  }),

  /* F16 — the count was rendered and unreadable: `.hh-req` ran the full width
     of the card with `flex:1` on the name, so on a wide screen the number sat
     ~1,600px from its own label. The fact is the chip container + a non-growing
     name; without both, the number floats away again. */
  () => tryRun('b371 (F16): house upgrade requirements render name and count as one chip', () => {
    if (!window.HearthriseHomestead) throw new Error('HearthriseHomestead missing');
    showTab('house');
    const host = document.getElementById('hh-property-card');
    assert(host, 'the property card was not injected into the House panel');
    const wrap = host.querySelector('.hh-reqs');
    const req = host.querySelector('.hh-req');
    if (!req) return;   // top tier: no next upgrade, nothing to require
    assert(wrap, 'the requirements are not inside a .hh-reqs wrap — they will run the card width');
    assert(getComputedStyle(wrap).flexWrap === 'wrap', '.hh-reqs does not wrap');
    const b = req.querySelector('b');
    assert(b && /\d|—/.test(b.textContent), 'a requirement chip carries no count: ' + req.textContent);
    const nameEl = req.querySelector('.hh-req-name');
    assert(nameEl, 'a requirement chip has no name cell');
    assert(parseFloat(getComputedStyle(nameEl).flexGrow) === 0,
      'the requirement name still grows — it will push the count to the far edge of the card');
    // The whole point: the number is beside its label, not across the screen.
    const gap = b.getBoundingClientRect().left - nameEl.getBoundingClientRect().right;
    assert(gap >= 0 && gap < 60,
      'the count sits ' + Math.round(gap) + 'px from its own label');
  }),

  /* F20 — the Stable printed raw ids at the player ("Locked · shop:8000:
     cooking25"). Every source kind must resolve to a sentence, and no rendered
     hint may still contain a colon-delimited id. */
  () => tryRun('b371 (F20): companion lock hints are copy, never raw ids', () => {
    const L = window.HearthriseCompanions && window.HearthriseCompanions.sourceLabel;
    assert(typeof L === 'function', 'companionSourceLabel is not published');
    const cases = {
      'starter': /start/i, 'drop:small_wolf': /^Rare drop from Wolf Cub$/, 'shop:5000': /^Stable shop · 5,000 gold$/,
      'shop:8000:cooking25': /^Stable shop · 8,000 gold · needs Cooking 25$/, 'quest:harvest100': /100 crops/,
      'hatch:dragon_egg': /^Hatched from a Dragon Egg$/, 'skill:fishing:2500': /^1 in 2,500 Fishing actions$/,
      'boss:dragon:200': /1 in 200 .* kills/,
    };
    Object.keys(cases).forEach((src) => {
      const out = L(src);
      assert(cases[src].test(out), src + ' renders as "' + out + '"');
      assert(!/[a-z]+:[a-z0-9_]+/i.test(out), src + ' still leaks an id: "' + out + '"');
      assert(!/_/.test(out), src + ' still leaks a snake_case id: "' + out + '"');
    });
    // Every source actually authored in the data must resolve.
    const C = window.COMPANIONS || {};
    Object.keys(C).forEach((id) => {
      const out = L(C[id].source);
      assert(!/^Locked · /.test(out), id + '\'s source "' + C[id].source + '" has no human copy');
    });
  }),

  /* F19 — twenty of twenty-two companions rendered the same paw. The medallion
     must differ BY ROLE, and it must never fall back to the emoji in the data. */
  () => tryRun('b371 (F19): companion medallions distinguish the four roles', () => {
    assert(typeof window.companionIconHtml === 'function', 'companionIconHtml missing');
    const C = window.COMPANIONS || {};
    const byRole = {};
    Object.keys(C).forEach((id) => {
      const html = window.companionIconHtml(id, 44);
      assert(html && html.length, id + ' renders no companion art at all');
      assert(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), id + ' renders an emoji as art');
      if (/<img/.test(html)) return;                    // painted portrait wins
      const m = /<path fill="[^"]*" d="([^"]{12})/.exec(html);
      assert(m, id + ' medallion carries no glyph path');
      byRole[C[id].role] = byRole[C[id].role] || m[1];
      assert(byRole[C[id].role] === m[1], id + ' does not share its role\'s silhouette');
    });
    const shapes = Object.keys(byRole).map((r) => byRole[r]);
    assert(new Set(shapes).size === shapes.length,
      'two roles share one silhouette — the Stable is a wall of identical discs again');
    assert(shapes.length >= 3, 'only ' + shapes.length + ' role silhouettes exist');
  }),

  /* F25 — the Dungeon destination offered a lit "Enter ▸" while the list it led
     to gated at Combat Lv 25. The two boss cards beside it already used the
     `locked` field; the dungeon card is the one that did not. */
  () => tryRun('b371 (F25): the dungeon destination reflects its own combat gate', () => {
    const CS = window.HearthriseCombatScreens;
    assert(CS && typeof CS._destinations === 'function', 'combat-screens _destinations is not published');
    const d = CS._destinations().filter((x) => x.kick === 'Dungeon')[0];
    assert(d, 'there is no Dungeon destination');
    const gated = /unlocks at Combat Lv/.test(d.meta || '');
    if (gated) {
      assert(d.locked, 'the dungeon card says "' + d.meta + '" and STILL offers a live Enter button');
      assert(/Combat Lv \d+/.test(d.locked), 'the locked chip does not name the level: ' + d.locked);
    } else {
      assert(!d.locked, 'a runnable dungeon is showing a locked chip: ' + d.locked);
    }
  }),

  /* The topbar quest badge derived its count with /(\d+)\s*active/ over the
     quest strip's TEXT — a sentence renderStrip() stopped writing builds ago,
     so it returned 0 for every player forever. The badge must read the game. */
  () => tryRun('b371: the quest badge counts real quests, not a regex on another UI', () => {
    assert(typeof window.questBadgeState === 'function',
      'window.questBadgeState is missing — the badge is back to scraping the strip');
    const st = window.questBadgeState();
    assert(st && typeof st.active === 'number' && typeof st.claimable === 'number',
      'questBadgeState returned ' + JSON.stringify(st));
    const daily = (typeof window.getGoalsForToday === 'function' && window.getGoalsForToday()) || [];
    assert(st.active <= daily.length + 12, 'the active count (' + st.active + ') exceeds the goal pool');
    assert(st.claimable <= st.active, 'more quests are claimable than are active');
    const btn = document.getElementById('hr-quests-btn');
    assert(btn, 'the topbar quest button is missing');
    const shown = parseInt((btn.querySelector('.hr-q-count') || {}).textContent, 10);
    assert(isFinite(shown), 'the badge shows a non-number');
    // The reported defect exactly: a claimable reward with a 0 on the badge.
    assert(!(st.claimable > 0 && shown === 0),
      st.claimable + ' quest rewards are claimable and the badge reads 0');
  }),

  /* F23 — filed as "Replay tutorial does nothing"; NOT REPRODUCED at HEAD (the
     tour mounts and is topmost). What was true is that the row had no failure
     state, so a dead handler and a working one looked identical. Guard the
     wiring itself, which is the thing the report was really about. */
  () => tryRun('b371 (F23): the Replay tutorial row is wired to the FTUE tour', () => {
    assert(typeof window.startFTUE === 'function', 'window.startFTUE is missing — the row cannot work');
    assert(typeof window.resetFTUE === 'function', 'window.resetFTUE is missing');
    assert(typeof window.openSettings === 'function', 'openSettings is missing');
    window.openSettings();
    try {
      const btn = document.getElementById('set-replay-tutorial');
      assert(btn, 'the Replay tutorial button is not in the Settings page');
      let started = 0;
      const real = window.startFTUE;
      window.startFTUE = function () { started++; };
      try { btn.click(); } finally { window.startFTUE = real; }
      assert(started === 1, 'clicking Replay tutorial called startFTUE ' + started + ' times');
    } finally {
      const m = document.getElementById('settings-modal');
      if (m) m.classList.remove('show');
      document.querySelectorAll('.ftue-root').forEach((el) => el.remove());
    }
  }),

  /* F24 — the store's Buy button and product cards carried literal hexes (a
     periwinkle #5f6fc4 and a retired cyan #7dd3fc), and a theme blanket painted
     --bg-2 slabs behind every product icon. Both are structural. */
  () => tryRun('b371 (F24): the premium store is token-driven and its icons are unslabbed', () => {
    showTab('premium');
    const card = document.querySelector('#iap-panel .iap-card');
    assert(card, 'the premium store rendered no product cards');
    const icon = card.querySelector('.iap-icon');
    assert(icon, 'a product card has no icon slot');
    const r = icon.getBoundingClientRect();
    assert(Math.abs(r.width - r.height) <= 2,
      'the product mark is ' + Math.round(r.width) + 'x' + Math.round(r.height)
      + ' — it is a full-width slab again, not a struck medallion');
    /* The slab was an OPAQUE `--bg-2` painted by a theme blanket whose
       `:not(.iap-card)` excluded the card but not its children. A recess is a
       translucent black well; an opaque fill means the blanket is back. */
    const iconBg = getComputedStyle(icon).backgroundColor;
    const alpha = /rgba?\(([^)]+)\)/.exec(iconBg);
    const parts = alpha ? alpha[1].split(',').map((x) => parseFloat(x)) : [];
    assert(parts.length === 4 && parts[3] < 0.95,
      'the product mark sits on an opaque plate (' + iconBg + ') — the theme '
      + 'blanket is painting inside .iap-card again');
    const btn = card.querySelector('.btn-gem');
    assert(btn, 'the product card has no gem-priced action');
    const bg = getComputedStyle(btn).backgroundImage;
    assert(/gradient/.test(bg), 'the Buy button lost its face: ' + bg);
    // The tokens must resolve — a var() that resolves to nothing is how the
    // "no hardcoded colours" rule turns into an invisible button.
    ['--gem-face-0', '--gem-face-1', '--gem-face-2', '--gem-rim', '--gem-face-ink'].forEach((t) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(t).trim();
      assert(v, 'the premium token ' + t + ' does not resolve');
    });
    // And the literals are gone from the sheets that owned them.
    assert(!/#5f6fc4|#7dd3fc|#38bdf8/i.test(
      Array.from(document.styleSheets).map((s) => {
        try { return Array.from(s.cssRules).map((x) => x.cssText).join(''); } catch (e) { return ''; }
      }).join('')),
      'a retired blue literal is still authored in a stylesheet');
  }),

  /* The leaderboard rebuild ships boards with no server source as
     {ok:true, available:false, top:[]}. Flattened into an ordinary accepted
     board that rendered "No one has ranked on this board yet. Be first." —
     an invitation to grind for a board nothing writes to. */
  () => tryRun('b371: a leaderboard with available:false withdraws its chip', () => {
    const LB = window.HearthriseLeaderboards;
    assert(LB && typeof LB._reduceBoard === 'function', 'leaderboards reducers are not published');
    const off = LB._reduceBoard(200, { ok: true, board: 'renown', available: false, top: [], total: 0 });
    assert(off.action === 'accept', 'an unavailable board should still be an accepted answer');
    assert(off.available === false, 'reduceBoard dropped available:false');
    const on = LB._reduceBoard(200, { ok: true, board: 'overall', top: [], total: 0 });
    assert(on.available === true, 'a board with no `available` field must default to available');

    /* ⚠ PIN THE AVAILABILITY MAP (b499) — see the note in the b222 picker test.
       This test DRIVES _markAvailability itself, so it needs a known starting
       point; without one the very first assertion below is measuring whether a
       real render happened to have answered `available:false` for renown
       earlier in the run, which production currently does. */
    const _avail = LB._availabilitySnapshot();
    LB._restoreAvailability(null);

    // The picker is data-driven off the same flag.
    assert(LB._boardsIn('throne', 'full').indexOf('renown') >= 0, 'renown is not in the throne category');
    try {
      LB._markAvailability('renown', false);
      assert(LB._available('renown', 'full') === false, 'available() ignores the unavailable flag');
      assert(LB._boardsIn('throne', 'full').indexOf('renown') < 0,
        'the renown chip is still offered after the server said it has no source');
      // A normal board is untouched by another board's state.
      assert(LB._available('overall', 'full') === true, 'marking renown unavailable disabled overall too');
    } finally {
      LB._markAvailability('renown', true);
    }
    assert(LB._boardsIn('throne', 'full').indexOf('renown') >= 0,
      'renown did not come back when the server said it was available again');
    LB._restoreAvailability(_avail);
  }),

  // ════════════════════════════════════════════════════════════════════════
  // b373 regression suite — THE DEATH MOMENT + THE IDENTITY SCOPING RULING
  // (LIVE-AUDIT-2026-08-17 "FTUE run 2", findings 2, 3 and 5.)
  //
  // Two designer rulings, and every test below asserts the RULE rather than a
  // sentence: tip selection by `tipKey`, respawn by arithmetic, scope by which
  // module owns the value. Copy stays free to be reworded.
  // ════════════════════════════════════════════════════════════════════════

  () => tryRun('b373: death sheet — held-but-uneaten food picks the teaching tip', () => {
    const D = window.HearthriseDeathSheet;
    assert(D && typeof D.describeDeath === 'function', 'the death sheet model is not published');
    /* THE AUDITED MOMENT, exactly: 8 raw shrimp in the bag, none eaten, first
       slime, Auto-Eat not owned. This is the branch that has to name the food
       and the Eat button, or the whole feature teaches nothing. */
    const m = D.describeDeath({
      monsterName: 'Slime', killsThisFoe: 0, foodQty: 8, foodName: 'Raw Shrimp',
      ateThisFight: 0, autoEatOwned: false, maxHp: 10, deaths: 1,
    });
    assert(m.tipKey === 'food-unused', 'held-and-uneaten food did not select the food-unused tip: ' + m.tipKey);
    assert(/8 x Raw Shrimp/.test(m.tip), 'the tip does not name what the player was carrying: ' + m.tip);
    assert(/\bEat\b/.test(m.tip), 'the tip never says the word Eat: ' + m.tip);
    assert(/Auto-Eat/.test(m.tip) && /Bounty Shop/.test(m.tip),
      'a player who does not own Auto-Eat was not told where to get it: ' + m.tip);
    assert(m.shopLink === true, 'the Bounty Shop door is missing on the one branch that needs it');
    /* Pluralisation: item names are singular nouns of every shape, so the
       quantity marker is the rule. "8 Raw Shrimps" shipped in the first draft. */
    assert(!/Shrimps/.test(m.tip), 'the tip pluralised an item name: ' + m.tip);
  }),

  () => tryRun('b373: death sheet — every food state gets its own tip, and only one', () => {
    const D = window.HearthriseDeathSheet;
    const base = { monsterName: 'Slime', killsThisFoe: 2, maxHp: 40, deaths: 4, foodName: 'Trout' };
    /* b497 — THE ACTIVE BRANCH KEYS ON THE SWITCH, NOT THE ENTITLEMENT.
       Auto-Eat I is granted to every character at creation (designer ruling;
       supabase/migrations/2026-09-04-auto-eat-at-creation.sql), so `autoEatOwned`
       is now universal and stopped being a proxy for "auto-eat is running".
       Keyed on ownership, an empty-bag death would tell a player who has never
       touched the toggle that "Auto-Eat is watching your health" — the exact
       class of lie the F7/b432 audit built this sheet to remove. Row 3 is the
       case the ruling creates, and it is the one that fails without the split. */
    const cases = [
      [{ foodQty: 3, ateThisFight: 0, autoEatOwned: false, autoEatOn: false }, 'food-unused'],
      [{ foodQty: 0, ateThisFight: 0, autoEatOwned: true,  autoEatOn: true },  'auto-eat-idle'],
      [{ foodQty: 0, ateThisFight: 0, autoEatOwned: true,  autoEatOn: false }, 'no-food'],
      [{ foodQty: 0, ateThisFight: 0, autoEatOwned: false, autoEatOn: false }, 'no-food'],
      [{ foodQty: 0, ateThisFight: 5, autoEatOwned: true,  autoEatOn: true },  'outmatched'],
      [{ foodQty: 2, ateThisFight: 4, autoEatOwned: true,  autoEatOn: true },  'outmatched'],
    ];
    for (const [d, want] of cases) {
      const m = D.describeDeath(Object.assign({}, base, d));
      assert(m.tipKey === want,
        'food=' + d.foodQty + ' ate=' + d.ateThisFight + ' owned=' + d.autoEatOwned
        + ' on=' + d.autoEatOn + ' selected ' + m.tipKey + ', expected ' + want);
      assert(typeof m.tip === 'string' && m.tip.length > 20, 'tip ' + want + ' has no copy');
      /* Never offer to sell a player something they already own. */
      if (d.autoEatOwned) assert(m.shopLink === false, want + ' offered the shop to an owner');
    }
    assert(D._TIP_KEYS.length === 4, 'the tip branch list drifted from the four states');
  }),

  () => tryRun('b526: an empty bag can be answered with gold — the counter sells a meal', () => {
    /* THE PLAYED MOMENT (live, QA account, 2026-09-09 01:30 UTC): Combat
       14, 10,290 gold, empty food bag, knocked out 45 minutes. Recovery
       refuses every payable kind, so fishing and the fire were both shut; the
       Market was empty and the Premium Store sells no food. The player's only
       legal move was to wait. Two halves close it and both are asserted here:
       the Supplies counter STOCKS a meal at a price that is not a gold loop,
       and the sheet that names the empty bag now carries the door to it. */
    const seed = window.SEED_SHOP;
    assert(Array.isArray(seed), 'SEED_SHOP is not published');
    const shrimp = seed.find(r => r.id === 'cooked_shrimp');
    const trout  = seed.find(r => r.id === 'cooked_trout');
    assert(shrimp && trout, 'the Supplies counter stocks no cooked food');

    /* NO GOLD LOOP, IN EITHER DIRECTION. Cooked food is not `raw`, so the
       vendor pays the FULL `v` — the buyback is the number this price has to
       beat, and beating it by a hair is not enough to survive a rounding
       change. Asserted as a RULE (price > buyback), not as 150 and 450. */
    for (const row of [shrimp, trout]) {
      const buyback = (window.ITEMS[row.id] || {}).v * row.qty;
      assert(row.cost > buyback,
        row.id + ' sells back for ' + buyback + ' and costs ' + row.cost
        + ' — that is an infinite gold faucet, not a shop row');
    }

    /* The server prices it, or the button is decoration. `resolvePurchase` is
       the same resolver the live gesture runs; a row the catalogue cannot
       name comes back `no_offer` and the purchase is never sent. */
    const Gold = window.HearthriseGold;
    assert(Gold && typeof Gold.resolvePurchase === 'function',
      'the gold module does not publish the offer resolver');
    const r = Gold.resolvePurchase('cooked_shrimp', shrimp.qty, shrimp.cost);
    assert(!r.error && r.offer === 'seed.cooked_shrimp' && r.count === 1,
      'the server cannot price the shop row a player is about to tap: ' + JSON.stringify(r));
    /* And it still refuses a price the shop did not show. */
    const bad = Gold.resolvePurchase('cooked_shrimp', shrimp.qty, 1);
    assert(bad.error === 'price_mismatch', 'a forged price resolved: ' + JSON.stringify(bad));
  }),

  () => tryRun('b526: the empty-bag death sheet carries the door to the counter', () => {
    /* THE DOOR. Both empty-bag tips carry it; the two tips that are NOT about
       an empty bag must not, or the affordance stops meaning anything. */
    const D = window.HearthriseDeathSheet;
    const base = { monsterName: 'Goblin', killsThisFoe: 1, maxHp: 14, deaths: 2, foodName: 'Cooked Shrimp' };
    const cases = [
      [{ foodQty: 0, ateThisFight: 0, autoEatOwned: true,  autoEatOn: true  }, 'auto-eat-idle', true],
      [{ foodQty: 0, ateThisFight: 0, autoEatOwned: false, autoEatOn: false }, 'no-food',       true],
      [{ foodQty: 3, ateThisFight: 0, autoEatOwned: false, autoEatOn: false }, 'food-unused',   false],
      [{ foodQty: 0, ateThisFight: 5, autoEatOwned: true,  autoEatOn: true  }, 'outmatched',    false],
    ];
    for (const [d, wantTip, wantDoor] of cases) {
      const m = D.describeDeath(Object.assign({}, base, d));
      assert(m.tipKey === wantTip, 'tip drifted: ' + m.tipKey + ' expected ' + wantTip);
      assert(m.foodShopLink === wantDoor,
        wantTip + ' had foodShopLink=' + m.foodShopLink + ', expected ' + wantDoor);
      /* One affordance slot, never two things in it. */
      assert(!(m.foodShopLink && m.shopLink), wantTip + ' offered two shop doors at once');
    }
    /* The empty-bag copy has to NAME the counter, or the button is the only
       hint and a player who dismissed the sheet never learns the shop sells
       food at all. */
    const empty = D.describeDeath(Object.assign({}, base,
      { foodQty: 0, ateThisFight: 0, autoEatOwned: false, autoEatOn: false }));
    assert(/Local Shop/.test(empty.tip), 'the empty-bag tip never names where to buy: ' + empty.tip);
  }),

  () => tryRun('b525: a level-1 smith can reach bronze armour without a level-30 mining grind', () => {
    /* THE PLAYED MOMENT (live, QA account, 2026-09-09 03:00 UTC): Combat 14 with
       no armour, following the game's own teaching order — mine copper, smelt,
       forge bronze. Bronze Bar wanted 1 coal, and the ONLY gatherable coal in the
       game is Coal Rock at MINING 30. The starter tier was unreachable, and Iron
       (Mining 15) sat BELOW Bronze on the real ladder. The ruling made coal a
       tier-3 reagent whose first sink is Steel (Smithing 35, beside Coal Rock's
       Mining 30) and dropped Bronze to req 1.
       This test PLAYS the ruled path as a level-1 character: it closes over the
       set of things a Mining-1 / Smithing-1 / Woodcutting-1 player can actually
       obtain, and walks the chain forward. It fails on the pre-ruling data
       because bronze_bar's coal input has no producer in that reachable set. */
    const R = window.ARTISAN_RECIPES, ROCKS = window.ROCKS, TREES = window.TREES;
    assert(R && R.smithing && Array.isArray(ROCKS) && Array.isArray(TREES), 'the recipe/gather tables are not published');
    /* Every cost shape, one reader — the same fold src/core/artisan.js does. */
    const costOf = (r) => Object.assign({}, r.input ? { [r.input]: r.inputQty || 1 } : {}, r.inputs || {}, r.secondary || {});

    /* WHAT A LEVEL-1 CHARACTER HAS: no shop, no drop, no bank — if the chain
       needs it, a req-1 node produces it. Then smelt forward to a fixpoint. */
    const bag = new Set(ROCKS.concat(TREES).filter((n) => n.req <= 1).map((n) => n.prod));
    assert(bag.has('copper_ore'), 'no Mining-1 node produces copper ore any more');
    for (let pass = 0, grew = true; grew && pass < 8; pass++) {
      grew = R.smithing.filter((r) => r.req <= 1 && !bag.has(r.output)
        && Object.keys(costOf(r)).every((k) => bag.has(k))).map((r) => bag.add(r.output)).length > 0;
    }
    assert(bag.has('bronze_bar'), 'a Smithing-1 character cannot make a bronze bar from Mining-1 ore — the tier-1 chain is walled: '
      + JSON.stringify(costOf(R.smithing.find((r) => r.output === 'bronze_bar') || {})));

    /* FORGE. The armour is the POINT of the bar: reachable at its own level. */
    for (const out of ['bronze_helm', 'bronze_platebody', 'bronze_platelegs']) {
      const r = R.smithing.find((x) => x.output === out);
      assert(r && r.req <= 15, out + ' is missing or forged outside the starter band: ' + (r && r.req));
      const missing = Object.keys(costOf(r)).filter((k) => !bag.has(k) && k !== out);
      assert(!missing.length, out + ' needs ' + missing + ', which a starter cannot obtain on the ruled path');
    }

    /* THE RULING AS A RULE, not a number: nothing reachable before coal is
       minable may demand coal — every skill, so a low bar cannot regrow one. */
    const coalNode = ROCKS.filter((n) => n.prod === 'coal').sort((a, b) => a.req - b.req)[0];
    assert(coalNode, 'nothing mines coal at all');
    for (const skill of Object.keys(R)) for (const r of R[skill]) {
      assert(!costOf(r).coal || r.req >= coalNode.req, skill + '/' + r.id + ' demands coal at level ' + r.req
        + ' but the first coal node (' + coalNode.id + ') is Mining ' + coalNode.req);
    }

    /* AND STILL A CHOICE: bronze beats copper on xp/sec AND costs more ore. */
    const rate = (r) => r.xp / (r.ms / 1000), ore = (r) => costOf(r).copper_ore || 0;
    const cu = R.smithing.find((r) => r.id === 'smelt_copper'), br = R.smithing.find((r) => r.id === 'smelt_bronze');
    assert(rate(br) > rate(cu), 'bronze bar is not faster xp than copper bar');
    assert(ore(br) > ore(cu), 'bronze bar is strictly better than copper bar in every way — copper is dead');
  }),

  () => tryRun('b497: death sheet — the free entry trait changed what the tip may claim', () => {
    const D = window.HearthriseDeathSheet;
    const base = { monsterName: 'Goblin', killsThisFoe: 1, maxHp: 10, deaths: 1,
      foodQty: 4, foodName: 'Cooked Shrimp', ateThisFight: 0, autoEatCost: 15 };

    /* OWNED BUT SWITCHED OFF — a player who turned it off, or whose food slot
       is cleared. NOT the new default: a fresh character is `owned + ON`
       (ensureShape flips eat.enabled the moment G.foodSlot is set, and the
       fresh-G literal carries foodSlot:'cooked_shrimp' since b495). This label
       said "THE NEW DEFAULT" until 2026-08-30 and was wrong; the case is still
       worth asserting, just for the opposite population. The tip must SAY they
       already have it — a player who is never told cannot act on it — and must
       not try to sell back a trait they hold. */
    const owned = D.describeDeath(Object.assign({}, base, { autoEatOwned: true, autoEatOn: false }));
    assert(owned.tipKey === 'food-unused', 'the granted-but-off death lost the food-unused tip');
    assert(/already have Auto-Eat/i.test(owned.tip),
      'a player who was granted Auto-Eat is not told they have it: ' + owned.tip);
    assert(/Settings/i.test(owned.tip), 'the tip does not say where the switch is: ' + owned.tip);
    /* ⚠ THIS LINE IS A COPY PIN AND IT CAUGHT A REAL REWRITE (2026-08-31).
       Ruling 2b condition 3 asked the sentence to lead with the STATE ("Auto-Eat
       is switched off"), and the first draft dropped "already have Auto-Eat" —
       the fact this test exists for — while keeping everything else green. The
       rule is BOTH: they own it, AND it is off, AND that is one tap away. The
       assertions are kept separate so a future rewording is told which of the
       three it lost. */
    assert(!/Bounty Shop/.test(owned.tip) && !/15/.test(owned.tip),
      'the tip still quotes the Marks price of a trait the player already owns: ' + owned.tip);
    assert(owned.shopLink === false, 'the Bounty Shop door opened for an owner');
    /* ⚠ 2026-08-31 — Designer ruling 2b, condition 3: *"a player who owns a
       tier and has it switched off gets 'Auto-Eat is switched off' with a
       ONE-TAP RE-ENABLE, not a Store price."* The price half was already right
       (asserted above, since b497); the tap was missing — the sheet named a
       switch three screens away at the one moment the player has proof they
       need it. Verified as a VERDICT, not assumed: the copy was correct and the
       action was not. */
    assert(/switched off/i.test(owned.tip),
      'the tip does not state the switch is off in the ruling\'s own words: ' + owned.tip);
    assert(owned.enableAutoEat === true,
      'an owner with Auto-Eat switched off is offered no one-tap re-enable — that is condition 3 of '
      + 'the arm, and without it the sheet is still sending them looking for a setting');

    /* THE ACTUAL NEW DEFAULT — `owned + ON` — AND STILL DEAD. "Turn it on"
       would be false here, so the honest fact is the tier-I threshold, and the
       answer to it is the PAID upgrade: the sink the ruling deliberately kept.
       This is the branch a brand-new player reaches. */
    const on = D.describeDeath(Object.assign({}, base, { autoEatOwned: true, autoEatOn: true }));
    assert(on.tipKey === 'food-unused', 'the switched-on death lost the food-unused tip');
    assert(!/switch it on/i.test(on.tip),
      'the tip told a player whose Auto-Eat is already ON to switch it on: ' + on.tip);
    assert(/quarter health/i.test(on.tip) && /Auto-Eat II/.test(on.tip),
      'the tip does not explain the tier-I threshold or name the upgrade that raises it: ' + on.tip);
    assert(on.enableAutoEat === false,
      'a player whose Auto-Eat is already ON was offered a button to turn it on');

    /* THE RESIDUAL PATH is unchanged and still literally true: the Bounty Shop
       sells Auto-Eat I at this price to anyone without it. */
    const unowned = D.describeDeath(Object.assign({}, base, { autoEatOwned: false, autoEatOn: false }));
    assert(/Bounty Shop/.test(unowned.tip) && /15/.test(unowned.tip),
      'the unowned branch stopped naming the shop and the price: ' + unowned.tip);
    assert(unowned.shopLink === true, 'the shop door closed on the one branch that needs it');
    assert(unowned.enableAutoEat === false,
      'a non-owner was offered a switch they do not have — the two buttons are complements, not '
      + 'alternatives, and both appearing (or the wrong one) is the sale the ruling forbids');
  }),

  () => tryRun('b373/rev.2: death sheet — no loss, back up at 40%, and the run picks up again', () => {
    /* ══ SUPERSEDES "no-loss, FULL HEAL and the STOPPED run" ═══════════════
       Two of that sentence's three clauses were replaced by the Recovery Rule
       (rev. 2, Game Designer 2026-09-06), and the replacements are the whole
       point of the ruling, so they are asserted here rather than left to the
       ladder's own battery:
         · a death used to end in a FULL heal, which made dying the cheapest
           top-up in the game. The character now stands up on 40% (away.js
           `resumeHpFor`), STATED by the sim and rendered, never recomputed
           here — the sheet and the server must not round differently;
         · a death used to STOP the run. It does not: the pointer survives and
           the same activity resumes, and this sheet saying so is the only
           reason a player who just watched a twelve-hour night break at minute
           four does not go and re-point it by hand.
       The no-loss clause is UNCHANGED and stays exactly as strict — if a death
       penalty is ever added, that row is the contract that has to change. */
    const D = window.HearthriseDeathSheet;
    const m = D.describeDeath({
      monsterName: 'Brittle Skeleton', killsThisFoe: 3, foodQty: 0, ateThisFight: 2,
      autoEatOwned: true, maxHp: 47, streakBroken: true, deaths: 2,
      /* THE LADDER, AS THE SERVER COUNTED IT. `deaths` is the LIFETIME tally and
         is not what the sheet's copy keys off — `deathsToday` is `n`, and the
         two diverge every day of a character's life after the first. */
      deathsToday: 2, recoveryMs: 120000, nextRecoveryMs: 240000,
      resumeHp: 19, missingHp: 28, recoveringUntilMs: 0,
    });
    const keys = m.rows.map((r) => r.k);
    for (const k of ['killed-by', 'kept', 'healed', 'run-stopped', 'resume', 'escalating', 'streak']) {
      assert(keys.indexOf(k) >= 0, 'the death receipt is missing the "' + k + '" row: ' + keys.join(','));
    }
    const kept = m.rows.find((r) => r.k === 'kept');
    assert(/kept everything/i.test(kept.t) && kept.v === 'no loss',
      'the no-loss row changed without a death penalty to justify it: ' + JSON.stringify(kept));
    const healed = m.rows.find((r) => r.k === 'healed');
    assert(/40% health/.test(healed.t),
      'the receipt does not say the character is up on a fraction of their health: ' + healed.t);
    assert(healed.v === '19 / 47',
      'the receipt did not state the health the sim STOOD THE CHARACTER UP ON — a re-derived '
      + 'figure is a second estimator of one number: ' + healed.v);
    /* THE RUN CONTINUES. Asserted on the sentence AND on the target, because
       "you can start again" and "it already started" are different promises. */
    const resume = m.rows.find((r) => r.k === 'resume');
    assert(/picks up against the Brittle Skeleton/.test(resume.t) && resume.v === 'automatic',
      'the sheet does not say the run picks itself back up: ' + JSON.stringify(resume));
    const stopped = m.rows.find((r) => r.k === 'run-stopped');
    assert(/Knocked out for 2m/.test(stopped.t),
      'the second fall of the day was not priced at the rung the server charged: ' + stopped.t);
    const esc = m.rows.find((r) => r.k === 'escalating');
    assert(/4m if you fall again/.test(esc.t),
      'the doubling warning does not quote the NEXT rung, so it promises a number nobody charges: ' + esc.t);
    assert(/Brittle Skeleton/.test(m.title), 'the title does not name what killed you: ' + m.title);
    /* Streak reset is real and must only appear when it happened. */
    const noStreak = D.describeDeath({ monsterName: 'Slime', maxHp: 10, foodQty: 1, ateThisFight: 0 });
    assert(noStreak.rows.every((r) => r.k !== 'streak'), 'a streak row appeared on a death that broke no streak');
    /* THE DAY'S FREE FALL keeps the reassuring lead AND says the delay is
       nothing — the rung is 0 and a sheet that stayed silent about it would
       leave the player waiting for a timer that is not running. */
    const first = D.describeDeath({ maxHp: 10, deaths: 1, deathsToday: 1, recoveryMs: 0 });
    assert(/first fall/i.test(first.lead), 'the first death lost its lead');
    const firstStop = first.rows.find((r) => r.k === 'run-stopped');
    assert(/back on your feet at once/i.test(firstStop.t) && firstStop.v === 'no delay',
      'the day\'s free fall is not stated as free: ' + JSON.stringify(firstStop));
    assert(first.rows.every((r) => r.k !== 'escalating'),
      'the doubling was announced on a fall that cost nothing — a lecture, not a warning');
    assert(!/first fall/i.test(m.lead), 'the second death still claims to be the first');
    /* KNOCKED OUT: while the timer runs, the headline is the character's STATE
       and the lead is the countdown — "The Skeleton got you" describes a thing
       that finished and says nothing about the only fact governing the next tap. */
    const down = D.describeDeath({ monsterName: 'Brittle Skeleton', maxHp: 47, resumeHp: 19,
      deathsToday: 2, recoveryMs: 120000, recoveringUntilMs: 1000000 + 107000, nowMs: 1000000 });
    assert(down.title === 'Knocked out' && /Back on your feet in 1:47\./.test(down.lead),
      'the sheet does not lead with the countdown while the character is down: '
      + down.title + ' / ' + down.lead);
  }),

  () => tryRun('b373: an AWAY death never opens the sheet (the welcome-back receipt owns it)', () => {
    const D = window.HearthriseDeathSheet;
    assert(D.show({ away: true }, { died: true }) === null,
      'the death sheet opened for an away death — the player was asleep and the welcome modal already reports it');
  }),

  () => tryRun('b373: death sheet — an unknown killer still produces a usable sheet', () => {
    const D = window.HearthriseDeathSheet;
    const m = D.describeDeath({ maxHp: 10, foodQty: 0, ateThisFight: 0 });
    assert(typeof m.title === 'string' && m.title.length > 0, 'no title without a monster name');
    assert(m.actions.length === 2 && m.actions[0].primary, 'the two doors are not both present');
    assert(!/undefined|NaN|null/.test(JSON.stringify(m)), 'the sheet leaked a placeholder value: ' + JSON.stringify(m));
  }),

  () => tryRun('b373/rev.2: RESPAWN COSTS NO PROGRESS — the sim stands you up at 40% and names its killer', () => {
    const C = window.HearthriseCore;
    assert(C && C.combatSim && typeof C.combatSim.resolveDeath === 'function', 'combat-sim is not published');
    /* ══ SUPERSEDES "RESPAWN IS A FULL HEAL" ══════════════════════════════
       b373's audited symptom was a fresh player respawning at 2/10 and dying
       again immediately, and the fix was a full heal. The Recovery Rule (rev. 2)
       replaces the mechanism and KEEPS THE PROPERTY: a death still costs no
       progress — no gold, no items, no XP, no levels — but it no longer hands
       back a free full health bar, because that made dying the cheapest top-up
       in the game. The character stands up on 40% (`resumeHpFor`), which sits
       deliberately just above Auto-Eat I's 25% trigger: a fed character is
       topped up by their own provisions on the next swing, a foodless one is
       not. Food is the way off the floor; the timer only stops the bleeding.
       ⚠ 40% IS NOT RESTATED AS A LITERAL HERE. It is read from `resumeHpFor`,
         the one definition both runtimes import — a hardcoded 4 would pass on
         the day somebody retunes the fraction and the server disagrees. */
    const A = C.away;
    assert(A && typeof A.resumeHpFor === 'function', 'away.js does not publish resumeHpFor');
    const state = { playerHp: 0, playerMaxHp: 10, monsterHp: 4, activeMonster: 'slime',
      inventory: { cooked_shrimp: 3 }, gold: 500, skills: { attack: 1234 }, stats: {} };
    let sawMonster = null;
    const info = C.combatSim.resolveDeath(state, {
      away: true,
      /* THE CONTRACT THE DEATH SHEET DEPENDS ON: onDeath fires while the fight
         is still standing, so a handler can still read what killed the player.
         Move `state.activeMonster = null` above the fx call and the sheet
         silently loses its first line — this is what notices. */
      fx: { onDeath: () => { sawMonster = state.activeMonster; } },
    });
    const want = A.resumeHpFor(10);
    assert(want > 0 && want < 10, 'resumeHpFor no longer returns a FRACTION of max: ' + want);
    assert(state.playerHp === want,
      'the sim did not stand the character up on the ruled fraction: '
      + state.playerHp + '/10, expected ' + want);
    /* AND NOTHING ELSE WAS TAKEN. The half of b373 that rev. 2 did not touch,
       asserted explicitly now that the health half has moved — otherwise the
       next author reads "40%" and concludes a death is allowed to cost things. */
    assert(state.gold === 500 && state.inventory.cooked_shrimp === 3 && state.skills.attack === 1234,
      'a death took progression with it: ' + JSON.stringify({ gold: state.gold,
        inv: state.inventory, skills: state.skills }));
    assert(state.stats.deaths === 1, 'the deaths stat did not increment');
    /* THE FALL, AS DATA. The death sheet renders every one of these without
       re-deriving a number, so the sim stating them IS the contract. The day's
       first fall is free and the next one is the ladder's first rung. */
    assert(info.recoverMs === 0, 'the first fall of the day was charged: ' + info.recoverMs);
    assert(info.nextRecoverMs > 0, 'the sim cannot say what the next fall costs: ' + info.nextRecoverMs);
    assert(info.deathsToday === 1 && info.deathsLifetime === 1,
      'the fall was not counted on either ladder: ' + JSON.stringify(info));
    assert(info.resumeHp === want,
      'the payload disagrees with the state the sim just wrote: ' + info.resumeHp + ' vs ' + state.playerHp);
    assert(sawMonster === 'slime',
      'onDeath fired after the target was cleared, so nothing can say what killed you: ' + sawMonster);
  }),

  () => tryRunAsync('b373/b511: an IDLE player takes the server\'s hp, and only a live fight is client-owned', async () => {
    /* b373 ASSERTED THE OPPOSITE HERE, AND b511 SUPERSEDED IT. b373's rule was
       "an idle player cannot be wounded by an envelope": the client full-healed
       on death and a late envelope for the pre-death window wrote 2/10 over the
       respawn. Death, the recovery window and the resume-at-fraction are now
       SERVER state (Recovery rev.2), so out of combat the server's hp is the
       answer, not a stale reading — and raise-only had inverted into the live
       b510 bug (server 6/13 after a 40% resume, client kept a full 13/13 and
       fought a Dark Wizard the server settled from 6 straight into death #8).
       The rest of this test is UNCHANGED: away still owns hp mid-fight, and a
       heal still applies. */
    const A = await import('../../net/accrue.js?v=550');
    const G1 = { playerHp: 10, playerMaxHp: 10, activeMonster: null };
    A.applyEnvelopeState(G1, { state: { hp: 2, max_hp: 10 } });
    assert(G1.playerHp === 2, 'an IDLE client refused the server\'s hp (kept ' + G1.playerHp
      + '/10) — the b373 raise-only floor is back and a recovery resume is being overwritten');

    // AWAY combat: the envelope carries an `away` receipt, so the server genuinely
    // computed hp and keeps full authority — away accrual depends on it.
    const G2 = { playerHp: 10, playerMaxHp: 10, activeMonster: 'slime' };
    A.applyEnvelopeState(G2, { state: { hp: 2, max_hp: 10 }, away: { grantMs: 60000, kills: 3 } });
    assert(G2.playerHp === 2, 'an AWAY envelope did not apply server hp during combat: ' + G2.playerHp);

    // Healing always applies out of combat, fight or no fight.
    const G3 = { playerHp: 3, playerMaxHp: 10, activeMonster: null };
    A.applyEnvelopeState(G3, { state: { hp: 9, max_hp: 10 } });
    assert(G3.playerHp === 9, 'the guard blocked a HEAL: ' + G3.playerHp);
  }),

  () => tryRunAsync('paione-P0: a LIVE-sync envelope cannot snap combat hp back to stale-full', async () => {
    /* THE ROOT CAUSE OF "syncs every few seconds and my HP goes to full". During
       a live client-predicted fight the server pointer is idle and its hp is
       stale-FULL; the periodic sync/settle envelope carries NO away block. b373
       raised hp freely (next >= cur), so the live fight snapped to full and the
       player never took damage. A non-away envelope during a live fight must
       PRESERVE the client's combat hp; an away-return envelope still applies. */
    const A = await import('../../net/accrue.js?v=550');

    // Live sync: activeMonster set, NO away block, server hp full, client hp low.
    const G = { playerHp: 4, playerMaxHp: 10, activeMonster: 'goblin' };
    const w = A.applyEnvelopeState(G, { state: { hp: 10, max_hp: 10 } });
    assert(G.playerHp === 4, 'a live-sync envelope raised combat hp to stale-full: ' + G.playerHp);
    assert(w && w.hpRefused === 10, 'the refusal was not recorded for the drift counter: ' + (w && w.hpRefused));

    // A live-sync envelope must not LOWER live combat hp to a stale reading either.
    const Glow = { playerHp: 7, playerMaxHp: 10, activeMonster: 'goblin' };
    A.applyEnvelopeState(Glow, { state: { hp: 2, max_hp: 10 } });
    assert(Glow.playerHp === 7, 'a live-sync envelope lowered combat hp to a stale value: ' + Glow.playerHp);

    // The away-return path is UNTOUCHED: an away receipt still owns hp mid-fight.
    const Gaway = { playerHp: 9, playerMaxHp: 10, activeMonster: 'goblin' };
    A.applyEnvelopeState(Gaway, { state: { hp: 3, max_hp: 10 }, away: { grantMs: 30000, kills: 1, died: false } });
    assert(Gaway.playerHp === 3, 'an away-return envelope failed to apply server-owned hp: ' + Gaway.playerHp);
  }),

  () => tryRunAsync('b374: a hitpoints level gained via a server envelope raises maxHp + the heal cap live (no reload)', async () => {
    /* THE BUG (Tyler backlog): "HP went from 10 to 11 but I had to refresh the
       game for it to take effect." maxHp is DERIVED from the hitpoints level
       (ensureSave: levelFromXp(skills.hitpoints)); the settle envelope raised
       the xp but only set playerMaxHp from an explicit st.max_hp it does not
       reliably carry, so the cap lagged until a reload re-derived it. */
    assert(typeof window.xpForLevel === 'function' && typeof window.levelFromXp === 'function',
      'xp helpers unavailable');
    const A = await import('../../net/accrue.js?v=550');

    // Server envelope grants enough hitpoints xp for level 11; client sits at 10.
    const xp11 = window.xpForLevel(11);
    const G = { playerHp: 10, playerMaxHp: 10, activeMonster: null,
      skills: { hitpoints: window.xpForLevel(10) }, inventory: {}, equipment: {} };
    A.applyEnvelopeState(G, { state: {}, skills: { hitpoints: { xp: xp11 } }, inventory: {} });

    const expect = window.levelFromXp(xp11);
    assert(expect > 10, 'test premise broken: level did not advance past 10');
    // Same tick, no reload: the DERIVED max — which IS the heal/auto-eat cap —
    // followed the freshly-applied xp.
    assert(G.playerMaxHp === expect,
      'maxHp did not follow the hitpoints level in the same settle: ' + G.playerMaxHp + ' vs ' + expect);
    // A resting player keeps their current hp under the new, higher cap (they
    // heal INTO it — the point is the ceiling rose, not that hp auto-jumps).
    assert(G.playerHp === 10 && G.playerMaxHp > G.playerHp,
      'a resting bar was mishandled: ' + G.playerHp + '/' + G.playerMaxHp);

    // A downed player (0 hp) is topped up to the new max rather than left stuck
    // one under it — the heal cap genuinely follows.
    const Gd = { playerHp: 0, playerMaxHp: 10, activeMonster: null,
      skills: { hitpoints: window.xpForLevel(10) }, inventory: {}, equipment: {} };
    A.applyEnvelopeState(Gd, { state: {}, skills: { hitpoints: { xp: xp11 } }, inventory: {} });
    assert(Gd.playerHp === expect && Gd.playerMaxHp === expect,
      'a downed player was not healed into the new max: ' + Gd.playerHp + '/' + Gd.playerMaxHp);

    /* RAISE-ONLY: never fights the b373 HP floor. A stale/low max_hp on the
       envelope must not shrink a cap the hitpoints level supports — the derive
       recovers it upward. maxHp == the hitpoints LEVEL, so level 20 -> max 20. */
    const lvl20 = window.levelFromXp(window.xpForLevel(20));
    const G2 = { playerHp: lvl20, playerMaxHp: lvl20, activeMonster: null,
      skills: { hitpoints: window.xpForLevel(20) }, inventory: {}, equipment: {} };
    A.applyEnvelopeState(G2, { state: { max_hp: 10 }, skills: {}, inventory: {} });
    assert(G2.playerMaxHp === lvl20, 'a lower envelope max_hp clobbered the level-derived cap: ' + G2.playerMaxHp);

    /* MUTATION: revert the b374 recompute in accrue.js (the levelFromXp block
       after `G.skills = skills`) and the first two asserts go RED — maxHp stays
       10 until a reload runs ensureSave. */
  }),

  () => tryRun('b373: identity is ACCOUNT-scoped — a hero is addressed by its slot', () => {
    const P = window.HearthriseProfile;
    assert(P && typeof P.heroLabel === 'function', 'heroLabel is not published');
    assert(P.heroLabel(0) === 'Hero 1' && P.heroLabel(2) === 'Hero 3', 'heroLabel drifted: ' + P.heroLabel(0));
    /* THE BUG: refreshActiveMeta used to copy G.playerName — which identity.js
       sets to the ACCOUNT's server-claimed display name — into every slot
       record, so a player's hero list slowly became "Tyler / Tyler / Tyler". */
    const rows = P.slotRows().filter((r) => r.kind === 'char');
    assert(rows.length > 0, 'no character rows to check');
    const name = (window.G && window.G.playerName) || '';
    for (const r of rows) {
      assert(r.name === P.heroLabel(r.id), 'slot ' + r.id + ' is labelled "' + r.name + '", not by its slot');
      if (name) assert(r.name !== name, 'a hero row is wearing the ACCOUNT name: ' + r.name);
    }
    /* And the write side: a save tick must not stamp the name back on. */
    const before = JSON.stringify((P.profile.slots || []).map((s) => s.name));
    if (window.G) { const keep = window.G.playerName; window.G.playerName = 'ScopeBleedProbe';
      try { window.saveLocal(); } finally { window.G.playerName = keep; } }
    assert(!/ScopeBleedProbe/.test(JSON.stringify((P.profile.slots || []).map((s) => s.name))),
      'saving stamped the account name onto a slot record (was ' + before + ')');
  }),

  () => tryRun('b373 (FTUE finding 5): the Characters modal renders portraits, not an emoji', () => {
    assert(typeof window.openCharacterSelect === 'function', 'the character drawer is not wired');
    window.openCharacterSelect();
    const modal = document.getElementById('cs-modal');
    assert(modal, 'the characters modal did not open');
    const imgs = modal.querySelectorAll('.cs-slot-portrait img[data-hr-avatar]');
    assert(imgs.length > 0, 'no portrait <img> on any hero row — the 🧙 emoji is back');
    for (const img of imgs) {
      assert((img.getAttribute('src') || '').length > 0, 'a hero portrait has no source');
      /* b361 class of break: an unsized image in an unsized slot. */
      const r = img.getBoundingClientRect();
      assert(r.width > 0 && r.width <= 64 && r.height > 0 && r.height <= 64,
        'a hero portrait escaped its 48px frame: ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    /* No emoji anywhere on the modal (Final Directive). */
    assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(modal.textContent || ''),
      'the characters modal still renders emoji as art: ' + (modal.textContent || '').slice(0, 120));
    /* And the copy states the scope split in BOTH directions, so nothing on
       screen implies a per-character name or face. */
    const sub = (modal.querySelector('.cs-sub') || {}).textContent || '';
    assert(/account/i.test(sub) && /portrait/i.test(sub),
      'the modal does not say that name and portrait are account-level: ' + sub);
    assert(/separate/i.test(sub), 'the modal does not say what IS per-hero: ' + sub);
    try { window.closeCharacterSelect(); } catch (e) {}
  }),

  /* ── regression suite — THE DRAWER'S ACTIVE ROW IS THE LIVE HERO ──────────
     Seen live: the character drawer said "Hero 3 active · Cmb Lv 1 ·
     Tot Lv 1 · now" while the topbar beside it said 24 CL / 280 TL. Two causes,
     both in src/multi-character.js: slotRows() printed the STORED per-slot
     summary for the active row, and the only writer of that summary
     (refreshActiveMeta) looked the slot up by ARRAY POSITION on a list addressed
     by ID and gave up silently when the active slot had no record at all — the
     normal state for a slot that arrived from the server entitlement. */
  () => tryRun('b543: the character drawer\'s active row reads the LIVE hero, not a stale summary', () => {
    const P = window.HearthriseProfile;
    if (!P || !P.profile || typeof window.openCharacterSelect !== 'function') return;  // signed out
    const keepSlots = JSON.parse(JSON.stringify(P.profile.slots || []));
    const cl = window.getCombatLevel, tl = window.getTotalLevel;
    try {
      window.getCombatLevel = () => 24; window.getTotalLevel = () => 280;
      const active = P.activeSlot();
      // The live shape of the bug: no metadata record for the slot being played.
      P.profile.slots = keepSlots.filter((s) => s && s.id !== active);
      const row = P.slotRows().filter((r) => r.kind === 'char').find((r) => r.active);
      assert(row, 'slotRows() must still list the character being played');
      assert(row.combatLv === 24 && row.totalLv === 280,
        'the drawer\'s active row says Cmb Lv ' + row.combatLv + ' for a CL 24 hero (Tot Lv ' + row.totalLv + ' vs 280)');
      window.openCharacterSelect();
      const stats = (document.querySelector('#cs-modal .cs-slot.active .cs-slot-stats') || {}).textContent || '';
      assert(/24/.test(stats) && /280/.test(stats), 'the rendered active row reads "' + stats + '"');
      // The write side: a save tick CREATES and refreshes the outgoing summary.
      window.saveLocal();
      const rec = (P.profile.slots || []).find((s) => s && s.id === active);
      assert(rec, 'a save tick left the active hero with no stored summary at all');
      assert(rec.combatLv === 24 && rec.totalLv === 280,
        'a save tick left the stored summary at Cmb Lv ' + rec.combatLv + ' / Tot Lv ' + rec.totalLv);
      assert(rec.lastSeen > Date.now() - 60000, 'the stored summary\'s lastSeen was not refreshed');
    } finally {
      window.getCombatLevel = cl; window.getTotalLevel = tl;
      P.profile.slots = keepSlots;
      try { window.saveLocal(); } catch (e) {}
      try { window.closeCharacterSelect(); } catch (e) {}
    }
  }),

  () => tryRun('b373: renaming opens the real account-name flow, never a native prompt', () => {
    /* Audit finding 1: Home's rename pencil called window.prompt() — a BLOCKING
       native dialog that froze the renderer hard in a backgrounded tab — and it
       wrote G.playerName, a PER-CHARACTER save field, for what is an
       account-level, server-claimed, unique display name.

       Asserted by BEHAVIOUR, not by reading the source: the pencil is clicked
       with prompt() booby-trapped and openNameModal() spied, so this test fails
       for a native dialog reintroduced by any route, including a new one. */
    const ID = window.HearthriseIdentity;
    assert(ID && typeof ID.openNameModal === 'function',
      'the identity name modal is not available for the rename affordance to use');
    window.showTab('profile');
    const pencil = document.querySelector('[data-hd="rename"]');
    assert(pencil, 'the Home rename affordance is gone');
    assert(/account/i.test(pencil.getAttribute('title') || ''),
      'the rename affordance does not say it renames the ACCOUNT: ' + pencil.getAttribute('title'));

    const realPrompt = window.prompt;
    const realOpen = ID.openNameModal;
    let native = false, opened = false;
    window.prompt = function () { native = true; return null; };
    ID.openNameModal = function () { opened = true; };
    try {
      pencil.click();
    } finally {
      window.prompt = realPrompt;
      ID.openNameModal = realOpen;
      document.querySelectorAll('.hr-id-scrim').forEach((e) => e.remove());
    }
    assert(!native, 'the rename pencil raised a BLOCKING native prompt() — the b372 renderer freeze is back');
    assert(opened, 'the rename pencil did not open the account-name modal');
    /* And it must not have written the per-character field behind our back. */
    assert(!window.G || window.G.playerName !== null, 'rename wrote a bare value onto G.playerName');
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     THE SUPPLY-CHAIN GUARDS (2026-08-23, open-beta security audit)

     THE FINDING these exist to keep closed: src/net/auth.js did

         await import('https://cdn.skypack.dev/@supabase/supabase-js')

     — the module that receives the player's EMAIL AND PASSWORD and holds the
     session token, fetched UNPINNED from a third party, with no integrity
     check (a dynamic import() cannot carry one) and fanning out to five more
     fetches from the same origin. Measured that day, two requests to that URL
     seconds apart resolved to two DIFFERENT library versions (x-import-url
     2.103.0; the pin redirect 2.101.1). Whoever controls that origin controlled
     every Hearthrise account, and nothing in the repo would have noticed.

     It was in the bundle for months and the suite was GREEN throughout — in
     fact tests/run-smoke.mjs stubs cdn.skypack.dev, so CI never even fetched
     the real thing. That is the specific blindness these three tests remove.
     ══════════════════════════════════════════════════════════════════════════ */

  () => tryRunAsync('SEC-CDN-1: no credential-handling module loads from a third-party CDN', async () => {
    /* Guard the SHIPPED BYTES, not the intent. Read every file that touches
       auth, chat transport or the bug reporter and refuse a remote import.
       Comments are stripped first: this repo documents the hole it closed at
       length, and a guard that cannot tell an explanation from a call site
       teaches the next author to delete the explanation. */
    const FILES = ['src/net/auth.js', 'src/net/supabase-chat-backend.js', 'src/bug-report.js'];
    for (const f of FILES) {
      const raw = await (await fetch(f + '?v=550')).text();
      assert(raw.length > 1000, 'could not read ' + f + ' to guard it — the guard is checking nothing');
      const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
      /* Any remote fetch of EXECUTABLE code: a dynamic import, or a <script>
         src assigned a remote URL. Not "skypack" by name — naming one vendor
         is how the next one gets in. */
      const remoteImport = src.match(/\bimport\s*\(\s*['"`]https?:\/\/[^'"`]+/);
      assert(!remoteImport, f + ' imports executable code from a remote origin ('
        + (remoteImport ? remoteImport[0].slice(0, 90) : '') + '). A dynamic import() cannot carry an '
        + 'integrity hash, so there is no way to verify what arrives — vendor it under src/vendor/ instead.');
      const remoteScriptSrc = src.match(/\.src\s*=\s*['"`]https?:\/\/[^'"`]+/);
      assert(!remoteScriptSrc, f + ' assigns a remote URL to a script src ('
        + (remoteScriptSrc ? remoteScriptSrc[0].slice(0, 90) : '') + ') — same hole, longer spelling.');
    }
  }),

  () => tryRunAsync('SEC-CDN-2: the vendored Supabase SDK is present, pinned and actually in use', async () => {
    /* Half of SEC-CDN-1's property is "the CDN is gone". The other half is
       "and the thing that replaced it works" — without this, deleting the
       import and shipping a dead auth path passes the guard above. */
    assert(window.supabase && typeof window.supabase.createClient === 'function',
      'window.supabase.createClient is missing — the vendored bundle in index.html did not load, so '
      + 'setupAuth() silently returns and NOBODY CAN SIGN IN. Check the '
      + '<script src="src/vendor/supabase-js-*.umd.js"> tag.');

    /* The bundle is served from OUR origin, not merely referenced. */
    const tag = Array.from(document.querySelectorAll('script[src]'))
      .find((s) => /src\/vendor\/supabase-js-[\d.]+\.umd\.js/.test(s.getAttribute('src') || ''));
    assert(tag, 'no local <script> tag for the vendored supabase-js bundle in index.html');
    assert(!/^https?:/i.test(tag.getAttribute('src')),
      'the vendored bundle tag points at an absolute URL (' + tag.getAttribute('src') + ') — that is a CDN again');
    /* PINNED: the filename carries the version, so a silent upgrade is a diff. */
    assert(/supabase-js-\d+\.\d+\.\d+\.umd\.js/.test(tag.getAttribute('src')),
      'the vendored bundle filename does not carry an exact version — an unpinned dependency is the whole finding');

    /* And it is SELF-CONTAINED: if the vendored file itself reaches out to a
       CDN at load time, self-hosting bought nothing. */
    const bundle = await (await fetch(tag.getAttribute('src'))).text();
    assert(bundle.length > 100000, 'the vendored bundle is suspiciously small (' + bundle.length + ' bytes)');
    assert(!/\bimport\s*\(\s*['"`]https?:/.test(bundle) && !/\bfrom\s*['"`]https?:/.test(bundle),
      'the vendored supabase-js bundle itself loads code from a remote origin — it is a CDN shim, not a bundle');
  }),

  () => tryRunAsync('SEC-SRI-1: the one remaining third-party script carries an integrity hash', async () => {
    /* Sentry is still loaded from browser.sentry-cdn.com — a deliberate,
       version-pinned exception, because it is a <script> tag and CAN carry SRI.
       "Can" is not "does": crossOrigin='anonymous' was already set and is a
       PREREQUISITE for integrity, not a substitute, so the code looked careful
       while verifying nothing. A compromise there is arbitrary JS in every
       player's page beside their session token. */
    const raw = await (await fetch('src/observability.js?v=550')).text();
    assert(raw.length > 1000, 'could not read src/observability.js to guard it');
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

    const cdnUrls = src.match(/['"`]https?:\/\/[^'"`\s]+\.js['"`]/g) || [];
    for (const u of cdnUrls) {
      assert(/\/\d+\.\d+\.\d+\//.test(u), 'the third-party script URL ' + u + ' is not version-pinned — '
        + 'an unpinned URL cannot have a stable integrity hash, so SRI is impossible by construction');
    }
    assert(/sentryCdnIntegrity\s*:\s*['"`]sha(256|384|512)-[A-Za-z0-9+/=]{40,}/.test(src),
      'no pinned SRI hash for the Sentry bundle in src/observability.js');
    assert(/\.integrity\s*=/.test(src),
      'the SRI hash is declared but never assigned to the script element — a hash nothing reads is decoration');
    assert(/\.crossOrigin\s*=\s*['"`]anonymous/.test(src),
      'crossOrigin is missing — SRI on a cross-origin script is IGNORED without it, so the check would be silently off');
  }),

  () => tryRun('SEC-CSP-1: the Content-Security-Policy meta is present and load-bearing', () => {
    /* GitHub Pages cannot set headers, so the policy is a <meta>. Two things
       are asserted: that it exists, and that the directives which actually do
       work in a meta policy are present. `script-src` here still needs
       'unsafe-inline' (hundreds of innerHTML-rendered onclick handlers), so
       the honest value is connect-src + base-uri + object-src + form-action —
       and those are what this test refuses to lose. */
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    assert(meta, 'no CSP meta tag — an injected script can exfiltrate the session token to any origin');
    const csp = (meta.getAttribute('content') || '').replace(/\s+/g, ' ').trim();

    /* connect-src is the payoff-step block: XSS that cannot phone home is a
       defaced page, not a stolen account. It must NOT contain a bare wildcard. */
    const connect = (csp.match(/connect-src ([^;]+)/) || [])[1] || '';
    assert(connect, 'CSP has no connect-src — exfiltration to any origin is permitted');
    assert(!/(^|\s)\*(\s|$)/.test(connect), 'connect-src contains a bare * — that is not a policy: ' + connect);
    assert(/supabase\.co/.test(connect), 'connect-src does not allow Supabase — the game cannot reach its own server');
    /* The project is named EXACTLY, not as https://*.supabase.co — anybody can
       create a free Supabase project, so a wildcard there is an exfiltration
       destination an attacker can provision in ninety seconds. The cost of
       naming it exactly is that a project change silently breaks every network
       call, so the policy is pinned to the URL the client actually uses rather
       than to a second copy of it. */
    assert(!/\*\.supabase\.co/.test(connect),
      'connect-src uses a supabase.co WILDCARD — anyone can create a free Supabase project, so that is an '
      + 'attacker-provisionable exfiltration destination. Name the project ref exactly.');
    const live = (window.HearthriseSupabase && window.HearthriseSupabase.getConfig
      && window.HearthriseSupabase.getConfig()) || null;
    if (live && live.url) {
      const host = new URL(live.url).host;
      assert(connect.indexOf(host) !== -1,
        'the CSP allows ' + connect.match(/[\w.-]*supabase\.co/) + ' but the client actually talks to ' + host
        + ' — every request would be blocked. Update the connect-src in index.html.');
      assert(connect.indexOf('wss://' + host) !== -1,
        'the CSP has no wss:// entry for ' + host + ' — Supabase Realtime (chat, clan presence) is blocked');
    }

    assert(/object-src 'none'/.test(csp), "CSP is missing object-src 'none' (the <object>/<embed> vector)");
    assert(/base-uri 'self'/.test(csp), "CSP is missing base-uri 'self' — an injected <base href> silently "
      + 're-points every relative script URL on the page');
    assert(/form-action 'self'/.test(csp), "CSP is missing form-action 'self'");
    assert(!/unsafe-eval/.test(csp), "CSP permits 'unsafe-eval'");

    /* The meta must sit ABOVE everything it governs: a policy declared after a
       <script> or <link> does not apply to it. Cheap to get wrong, invisible
       when wrong. */
    const firstGoverned = document.head.querySelector('link[rel="stylesheet"], script[src]');
    if (firstGoverned) {
      assert(meta.compareDocumentPosition(firstGoverned) & Node.DOCUMENT_POSITION_FOLLOWING,
        'the CSP meta appears AFTER a governed <script>/<link> — everything above it is unprotected');
    }
  }),

  /* ══ EMOJI-AS-ICON: THE RENDERED-DOM CENSUS ══════════════════════════════
     2026-08-23, Art Director. Tyler: "people are gonna call out AI slop really
     quickly," and the loudest tell is an emoji standing where an icon belongs.

     WHY THIS IS A DOM COUNT AND NOT A REPO GREP, which is the interesting part.
     A grep over `src/**` reports ~1,800 emoji and always will: they sit in DATA
     rows (`ITEMS[].icon`, `MONSTERS[].icon`) that no renderer reads any more,
     inside comments that explain why an emoji was removed, and in the CHANGELOG
     prose that is allowed to keep them. A grep therefore cannot distinguish the
     violation from its own fix note, so it can only ever be ignored. What a
     player sees is the DOM, so the DOM is what is counted.

     WHAT COUNTS AS A VIOLATION — "STRUCTURAL": the emoji is the ENTIRE text
     content of its element, i.e. the element exists to hold a picture and the
     picture is a pictograph. A pictograph inside a sentence is prose and is not
     counted here (there is none left on these surfaces either, but the line has
     to be drawn somewhere defensible, and "is this element an icon slot?" is
     the line the eye actually uses).

     THE PIN IS ZERO, and zero is a number this can only stay at or fail on.
     If a future build needs to raise it, that is a decision someone has to make
     out loud in this file rather than by editing a threshold quietly. */
  () => tryRunAsync('art: ZERO emoji-as-icon in the rendered DOM of the main screens', async () => {
    const EMO = /\p{Extended_Pictographic}/u;
    /* b493 — THE DECLARED-PENDING CARVE-OUT, DERIVED NOT HARDCODED. The BotD
       rotation paints the daily boss's icon into #panel-combat; six monsters
       are still awaiting the painted batch (art spend frozen) and their
       MONSTERS[].icon is an emoji by design — MON-ART-2 explicitly BLESSES the
       glyph fallback for exactly this set, so on a day the rotation lands on
       one (cyclops, 2026-08-30 was the first) this pin contradicted MON-ART-2
       and went red date-dependently. Exempt ONLY the icon strings of monsters
       pendingArt() names TODAY: the set is read live from monster-art.js, so
       the moment the batch ships and SHIPPED grows, the exemption evaporates
       and a leftover emoji fails again on its own — staleness by construction. */
    const _art = await import('../../data/monster-art.js?v=550');
    const _pendingIcons = new Set(
      _art.pendingArt().map((p) => ((window.MONSTERS || {})[p.id] || {}).icon).filter(Boolean)
        .map((s) => String(s).trim()));
    /* Curated: the screens a player actually looks at, plus the two densest
       (Combat + Inventory) that the release visual gate names. Deliberately a
       LIST — a blanket `document.body` sweep would also police the dev smoke
       panel and any harness furniture, and would fail for reasons that are not
       about the game. */
    const SURFACES = ('topbar=.topbar nav=#sidebar quests-strip=#global-quests-strip '
      + 'activity-bar=.activity-bar home=#panel-profile character=#panel-character '
      + 'inventory=#panel-inventory combat=#panel-combat skills=#panel-skills '
      + 'farm=#panel-farming house=#panel-house shop=#panel-shop market=#panel-market '
      + 'stable=#panel-stable clan=#panel-clan social=#panel-social'
    ).split(' ').map((s) => s.split('='));
    const TABS = ['profile', 'character', 'inventory', 'combat', 'skills',
      'farming', 'house', 'shops', 'stable', 'clan', 'social'];

    const offenders = [];
    const seen = new Set();
    const sweep = (label, root) => {
      if (!root) return;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let t;
      while ((t = w.nextNode())) {
        const raw = t.nodeValue || '';
        if (!EMO.test(raw)) continue;
        const el = t.parentElement;
        if (!el || el.closest('#smoke-test-panel, #smoke-test-btn')) continue;
        // STRUCTURAL = stripping the pictographs leaves nothing behind.
        const stripped = raw.replace(/\p{Extended_Pictographic}️?/gu, '').trim();
        if (stripped) continue;
        // Declared-pending monster icons (see the carve-out header above).
        if (_pendingIcons.has(raw.trim())) continue;
        const sig = label + '|' + raw.trim() + '|' + (el.className || el.tagName);
        if (seen.has(sig)) continue;
        seen.add(sig);
        offenders.push(label + ' ' + (el.className || el.tagName) + ' → "' + raw.trim() + '"');
      }
    };

    const prevTab = window.activeTab;
    try {
      TABS.forEach((tab) => {
        try { window.showTab(tab); } catch (e) { /* a tab that will not open is another test's problem */ }
        SURFACES.forEach(([label, sel]) => sweep(label, document.querySelector(sel)));
      });
      /* The Quests modal is the site the sweep was commissioned for — its rows
         carried 🩸 / 📈 / ⛏️ in 48px icon plates. It is a modal, so no tab
         switch reaches it. */
      if (typeof window.openQuestsModal === 'function') {
        window.openQuestsModal();
        sweep('quests-modal', document.getElementById('quests-modal-overlay'));
        if (typeof window.closeQuestsModal === 'function') window.closeQuestsModal();
        else { const o = document.getElementById('quests-modal-overlay'); if (o) o.remove(); }
      }
    } finally {
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }

    assert(offenders.length === 0,
      offenders.length + ' emoji-as-icon site(s) rendered (the pin is 0): '
        + offenders.slice(0, 8).join(' | '));
  }),

  /* The other half of the same job: the placeholder-icon stragglers. An emoji
     is not the only way to look generated — so is ONE glyph repeated down the
     bag because the fallback could not tell a fang from a blueprint. A live
     boot before this pass put FORTY-NINE unmapped ids on `uiChest`; the widened
     `itemGlyphKey` puts almost none there. This pins that, in both directions:
     the fallback must stay CATEGORY-AWARE (it cannot collapse back to one
     glyph) and it must never return a character. */
  () => tryRun('art: the item-art fallback is category-aware and never a pictograph', () => {
    const EMO = /\p{Extended_Pictographic}/u;
    assert(typeof window.itemGlyphKey === 'function', 'itemGlyphKey is not exported — the no-emoji backstop is unreachable from other modules');
    assert(typeof window.itemFallbackIcon === 'function', 'itemFallbackIcon is not exported');
    assert(typeof window.monsterFallbackIcon === 'function', 'monsterFallbackIcon is not exported');
    assert(typeof window.skillIconHTML === 'function', 'skillIconHTML is not exported');

    const ITEMS = window.ITEMS || {};
    const path = window._itemPath || {};
    const unmapped = Object.keys(ITEMS).filter((id) => !path[id]);
    assert(unmapped.length > 0, 'no unmapped items at all — this guard has nothing to measure (suspicious)');

    const keys = {};
    unmapped.forEach((id) => {
      const k = window.itemGlyphKey(id);
      keys[k] = (keys[k] || 0) + 1;
      assert(!EMO.test(String(k)), 'itemGlyphKey returned a pictograph for ' + id + ': ' + k);
      assert(!EMO.test(window.itemFallbackIcon(id, 20)), 'itemFallbackIcon rendered a pictograph for ' + id);
    });
    const chest = keys.uiChest || 0;
    const distinct = Object.keys(keys).length;
    assert(distinct >= 8,
      'the item fallback collapsed to ' + distinct + ' distinct glyph(s) — a bag of identical icons reads as an unfinished asset pipeline');
    assert(chest <= Math.ceil(unmapped.length * 0.15),
      chest + ' of ' + unmapped.length + ' unmapped items fall back to the generic chest (cap is 15%) — widen itemGlyphKey rather than shipping a wall of chests');

    /* The two glyphs this pass hand-authored, because the atlas had no row and
       `stripChromeEmoji()` was leaving an EMPTY medallion in the skills rail. */
    ['runecrafting', 'stonemason'].forEach((k) => {
      assert(window.HR && window.HR.has(k), 'the hand-authored ' + k + ' glyph is missing from HR_GLYPHS (src/data/glyphs-extra.js did not load)');
      const html = window.HR.medallion(k, 34);
      assert(html && /<path fill=/.test(html), k + ' resolves but draws no path');
    });

    /* The two empty-slot glyphs the paper-doll rebuild filed for redraw. The
       ammo mark used to be a bare diagonal arrow (a UI resize handle) and the
       cape a rectangle bisected by a line (a blank panel). Assert the SHAPES
       changed rather than merely that they exist: a redraw that did not happen
       still passes an existence check. */
    assert(typeof window.slotGlyphSVG === 'function', 'slotGlyphSVG is not exported');
    const ammo = window.slotGlyphSVG('ammo');
    assert(!/M5 19L18 6/.test(ammo), 'the ammo slot glyph is still the diagonal resize arrow');
    assert((ammo.match(/<path/g) || []).length >= 3, 'the ammo slot glyph lost its quiver detail');
    const cape = window.slotGlyphSVG('cape');
    assert(!/M8 4l4 3 4-3 1 16H7z/.test(cape), 'the cape slot glyph is still the bisected blank panel');
    assert((cape.match(/<path/g) || []).length >= 3, 'the cape slot glyph lost its collar/hem detail');
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b487 — THE LIVE BUG BATCH (bug_reports #32/#33/#42)
     ══════════════════════════════════════════════════════════════════════ */

  /* #33, live: "had a steel pickaxe speed boost of 15%. Sold the pickaxe, the
     boost still applied."

     The BONUS itself was never cached — HearthriseTools.bestTool() rescans the
     bag on every call, so `bestToolSpeed` is 0 the instant the tool leaves.
     What survived the sale was `G.skillMs`, the interval the RUNNING gather
     timer is armed at, because (a) nothing on any sell path called
     retimeActivity() and (b) `invSellAll` bypassed removeItem() entirely with a
     raw `delete G.inventory[id]`, so even a consequence hung off the bag seam
     would not have fired. Sell All is the natural gesture for a single tool.

     This drives the REAL gesture — invSellAll, the button in the item detail —
     and asserts the stored interval equals the freshly-derived one. It is RED
     on clean HEAD (4080ms stored vs 4800ms derived, measured). The mirror is
     asserted too: gaining a BETTER tool must speed the run you are already in,
     which is the papercut the same seam fixes. */
  () => tryRun('b487 (#33): selling a tool drops its speed boost from the RUNNING activity, not just from the next one', () => {
    const G = window.G; const T = window.HearthriseTools;
    if (!T || typeof window.startSkill !== 'function' || typeof window.invSellAll !== 'function') {
      assert(false, 'the tool/gather seams are missing — the boost could silently outlive the tool');
      return;
    }
    const snap = snapshotG();
    try {
      G.inventory = { steel_pickaxe: 1 };
      window.startSkill('mining', 'copper_rock', 3000);
      const boosted = G.skillMs;
      assert(T.bestToolSpeed('mining') > 0, 'precondition: the steel pickaxe must grant a mining speed bonus');
      assert(boosted === window.activityIntervalMs(),
        'precondition: startSkill must arm the interval it derives, got ' + boosted + ' vs ' + window.activityIntervalMs());

      window.invSellAll('steel_pickaxe');

      assert(!(G.inventory.steel_pickaxe > 0), 'Sell All must empty the stack');
      assert(T.bestToolSpeed('mining') === 0,
        'the tool bonus is derived from the bag and must be 0 once the tool is gone, got ' + T.bestToolSpeed('mining'));
      const derived = window.activityIntervalMs();
      assert(derived > boosted,
        'precondition: losing a +15% tool must SLOW the derived interval (' + boosted + ' -> ' + derived + ')');
      assert(G.skillMs === derived,
        'THE BUG: the running activity is still armed at ' + G.skillMs + 'ms after the tool was sold; '
        + 'the honest interval is ' + derived + 'ms. The boost outlived the pickaxe.');

      /* The mirror — a better tool must apply to the run in progress. */
      window.addItem('rune_pickaxe', 1);
      const faster = window.activityIntervalMs();
      assert(faster < derived, 'precondition: a Rune Pickaxe must beat bare hands');
      assert(G.skillMs === faster,
        'buying a better tool mid-run left the timer at ' + G.skillMs + 'ms; the tool says ' + faster + 'ms');
    } finally {
      try { window.stopSkill(); } catch (e) {}
      restoreG(snap);
    }
  }),

  /* #33 (the seam, not the symptom). Every path that can lose an item must go
     through removeItem(), which is where a tool's consequences hang. Two vendor
     gestures used to write the bag directly; a third (sellJunk) already routed
     correctly and is the shape the other two now match. A source scan is the
     right instrument here precisely because the defect is "a writer that skipped
     the seam" — a behavioural test can only ever catch the paths it thought to
     drive. */
  () => tryRun('b487 (#33): the vendor gestures write the bag through removeItem(), never a raw delete', () => {
    assert(typeof window.invSellAll === 'function' && typeof window.invSellSelected === 'function',
      'the vendor sell gestures are missing');
    /* ⚠ STRIP FIRST, SCAN SECOND. The comment INSIDE invSellAll names the raw
       delete it replaced, so a scan of the raw source fails on the very
       documentation that explains the fix — the false-positive class
       tests/combat-style.mjs already pays for ("it taxes exactly the
       documentation this codebase depends on"). Over-stripping can only remove
       comment text, never a statement, so it cannot hide a real occurrence. */
    const stripJs = (js) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    [['invSellAll', window.invSellAll], ['invSellSelected', window.invSellSelected]].forEach(([name, fn]) => {
      const src = stripJs(String(fn));
      assert(/delete\s+G\.inventory\s*\[/.test('delete G.inventory[x];'),
        'the raw-delete scan is BLIND — it does not match a known positive');
      assert(!/delete\s+G\.inventory\s*\[/.test(src),
        name + '() deletes a bag entry directly. removeItem() is the ONE bag writer — a raw delete '
        + 'skips every consequence hung off it (today: the tool retime; tomorrow: whatever is added next).');
      assert(/removeItem\s*\(/.test(src), name + '() no longer calls removeItem()');
    });
  }),

  /* #41 follow-up, live: "we also have a problem with claiming the quests
     reward."

     `wk_bury` ("Bury 150 bones", 1,800g) is authored in WEEKLY_GOAL_POOL and
     DELIBERATELY absent from the server catalogue — burying is a pure client
     function with no intent, no RPC and no settle, and the migration's own
     §GATE(b) RAISES if anyone catalogues it. But the picker went on dealing it
     in 13 of any 52 weeks, and the modal rendered a Claim button off the LOCAL
     count (isComplete falls through when the server has no row for a goal), so
     every press answered `unknown_goal`. A dead button on a 1,800-gold quest.

     The fix marks the row `blocked` and skips it at the DEAL, keeping its pool
     index so a week that never offered it is byte-identical. This asserts all
     three halves: not dealt, index-stable, and a mid-week slate that already
     holds it HEALS without re-baselining the goals the player kept. */
  () => tryRun('b487 (#41): a quest the server cannot pay is never dealt (wk_bury), and a slate holding one heals', () => {
    const G = window.G;
    const POOL = window.WEEKLY_GOAL_POOL;
    assert(Array.isArray(POOL) && POOL.length === 11,
      'WEEKLY_GOAL_POOL must still be 11 rows — the weekly picker indexes into it, so a DELETION '
      + 're-deals every player\'s mid-week slate. Block a row, never remove it. Got ' + (POOL && POOL.length));
    const bury = POOL.find((g) => g.id === 'wk_bury');
    assert(bury && bury.blocked,
      'wk_bury must carry a `blocked` reason — it is uncatalogued server-side, so its Claim button '
      + 'can only ever answer unknown_goal');
    assert(POOL.indexOf(bury) === 4, 'wk_bury moved out of pool index 4 — the shuffle is index-keyed');
    assert(typeof window.__hrPickWeeklyIds === 'function' && typeof window.getWeeklyGoals === 'function',
      'the weekly picker seams are missing');

    /* 1. NEVER DEALT — over a full year of week keys, not one slate may carry a
          blocked goal, and every slate must still be a full three. */
    const dealable = new Set(POOL.filter((g) => !g.blocked).map((g) => g.id));
    let sawBuryWeek = 0;
    const base = window.__thisWeekKey ? window.__thisWeekKey() : Math.floor((Date.now() / 86400000 + 3) / 7);
    for (let w = 0; w < 60; w++) {
      const ids = window.__hrPickWeeklyIds(base + w);
      assert(ids.length === 3, 'week ' + (base + w) + ' was dealt ' + ids.length + ' goals, expected 3');
      assert(new Set(ids).size === 3, 'week ' + (base + w) + ' dealt a duplicate: ' + JSON.stringify(ids));
      ids.forEach((id) => assert(dealable.has(id),
        'week ' + (base + w) + ' dealt the un-payable goal "' + id + '"'));
      /* The CONTROL: the unfiltered algorithm must still want wk_bury on some
         weeks, or this test is proving nothing. */
      let seed = base + w; const raw = []; const used = {};
      for (let i = 0; i < 3; i++) {
        seed = (seed * 9301 + 49297) % 233280;
        let idx = Math.floor((seed / 233280) * POOL.length);
        while (used[idx]) idx = (idx + 1) % POOL.length;
        used[idx] = true; raw.push(POOL[idx].id);
      }
      if (raw.indexOf('wk_bury') >= 0) sawBuryWeek++;
      else assert(JSON.stringify(raw) === JSON.stringify(ids),
        'week ' + (base + w) + ' offered NO blocked goal, so the filter must be a no-op: '
        + JSON.stringify(raw) + ' -> ' + JSON.stringify(ids));
    }
    assert(sawBuryWeek > 0,
      'CONTROL: the unfiltered picker never wanted wk_bury in 60 weeks — this test cannot see the bug');

    /* 2. A MID-WEEK SLATE THAT ALREADY HOLDS IT HEALS, and the goals the player
          keeps are NOT re-baselined (that would silently reset their progress). */
    const snap = snapshotG();
    try {
      const key = window.__thisWeekKey();
      G.weeklyGoals = { weekKey: key, picks: ['wk_bury', 'wk_kills', 'wk_smith'],
        startValues: { wk_bury: 0, wk_kills: 7, wk_smith: 3 }, claimed: { wk_smith: true }, sv: 1 };
      const dealt = window.getWeeklyGoals();
      assert(dealt.length === 3, 'the healed slate is ' + dealt.length + ' goals, expected 3');
      assert(!dealt.some((g) => g.id === 'wk_bury'), 'the healed slate still holds wk_bury');
      assert(G.weeklyGoals.picks.indexOf('wk_bury') < 0, 'the stored picks still name wk_bury');
      if (G.weeklyGoals.picks.indexOf('wk_kills') >= 0) {
        assert(G.weeklyGoals.startValues.wk_kills === 7,
          'the heal re-baselined a kept goal (wk_kills ' + G.weeklyGoals.startValues.wk_kills
          + ' != 7) — the player would lose the week\'s progress');
      }
      assert(G.weeklyGoals.claimed && G.weeklyGoals.claimed.wk_smith === true,
        'the heal dropped an already-claimed flag — the reward could be re-offered');
    } finally { restoreG(snap); }
  }),

  /* #32, live: "inventory is missing the tool tab. only place to find the tools
     is the all tab." Fixed in b479 by adding a Tools row to both filter strips —
     but that fix shipped WITHOUT a test, so nothing stopped it regressing. This
     is that test, and it drives the strip players actually see (renderInvFancy)
     rather than reading the table: the chip has to RENDER, carry a live count,
     and filtering to it has to leave the pickaxe on screen and the log off it. */
  () => tryRun('b487 (#32): the inventory has a Tools tab, and a pickaxe is in it', () => {
    const G = window.G;
    const render = window._renderInvFancy || window.renderInvFancy;
    const panel = document.getElementById('panel-inventory');
    assert(typeof render === 'function' && panel, 'the live bag renderer / #panel-inventory is missing');
    assert(typeof window._invSetCat === 'function', 'the category setter seam is missing');
    assert(window.ITEMS.steel_pickaxe && window.ITEMS.steel_pickaxe.type === 'tool',
      'a pickaxe must still be type:"tool" — the filter is written against that field');
    const snap = snapshotG();
    const prevCat = (window._invFilter && window._invFilter.category) || 'all';
    try {
      G.inventory = { steel_pickaxe: 1, normal_log: 5 };
      window._invSetCat('all');
      render();
      const chips = Array.from(panel.querySelectorAll('.invc-cat-btn')).map((b) => b.title || '');
      assert(chips.some((t) => /^Tools\b/.test(t)),
        'no Tools chip in the inventory filter strip — axes, pickaxes and rods are only findable under "All". '
        + 'Chips present: ' + JSON.stringify(chips));
      assert(chips.some((t) => t === 'Tools (1)'),
        'the Tools chip does not count the pickaxe in the bag; chips: ' + JSON.stringify(chips));

      window._invSetCat('tools');
      render();
      const tiles = Array.from(panel.querySelectorAll('.invc-tile')).map((t) => t.title || '');
      assert(tiles.some((t) => /Steel Pickaxe/.test(t)),
        'the Tools tab does not show the pickaxe in the bag; tiles: ' + JSON.stringify(tiles));
      assert(!tiles.some((t) => /Normal Log/i.test(t)),
        'the Tools tab is showing a non-tool (Normal Log) — the filter is not filtering');
    } finally {
      try { window._invSetCat(prevCat); } catch (e) {}
      restoreG(snap);
      try { render(); } catch (e) {}
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     b492 — THE PROPERTY TIER IS DERIVED FROM THE SERVER RUNG, NOT ONLY RESIDUE.

     TWO live reports, ONE root (Paione 2026-08-29: "hire a worker and it
     disappears" + "the problem with the planting in farm"). Measured on the live
     server for QA 0a47ba77 slot 0: player_progress held
     kind='unlock' key='property:homestead' value=1 AND key='worker_hire' value=1,
     with a real player_workers row — while the client rendered
     G.homestead={tier:0}: Wanderer's Camp, worker cap 0 beside a hired worker
     ("Workers 1/0"), and 2 farm plots instead of 4, so plots 3-4 were
     unplantable. `G.homestead.tier` is RESIDUE, and residue is a self-only cache
     with no authority behind it; when a residue save was lost NOTHING re-derived
     the tier from the rung the player had paid for.

     These four tests are written against the SHAPE OF THE LIVE FAILURE (rung
     present, residue 0) rather than against the implementation, and every one
     fails on clean HEAD because clean HEAD has no reader for the rung at all. */

  () => tryRun('b492-1: server rung 1 + residue tier 0 heals — House, worker cap, plot cap and the crew all agree', () => {
    const P = window.HearthriseProperty;
    const H = window.HearthriseHomestead;
    const W = window.HearthriseWorkers;
    assert(P && typeof P.notePropertyUnlocks === 'function' && typeof P.healPropertyTier === 'function',
      'window.HearthriseProperty is missing — the property rung has no reader (src/net/property-record.js)');
    assert(H && typeof H.getTier === 'function' && typeof H.maxPlots === 'function' && typeof H.workerSlots === 'function',
      'the homestead API is missing');
    const prev = P.__resetPropertyRecord();
    const snap = snapshotG();
    try {
      /* THE LIVE STATE, verbatim: the server says Homestead + one paid worker,
         the residue says camp, and a real crew row exists. */
      window.G.homestead = { tier: 0 };
      window.G.workers = { hired: [{ uid: 'w1', name: 'Aldric', skill: null, targetId: null, xp: 0, lastCollect: Date.now() }] };
      const env = { ok: true, progress: [
        { kind: 'unlock', key: 'property:homestead', value: 1, period: '' },
        { kind: 'unlock', key: 'worker_hire', value: 1, period: '' },
        { kind: 'stat', key: 'ev:kill_monster:goblin', value: 40, period: '' },   // a counter — must be ignored
      ] };
      assert(P.pickPropertyTier(env) === 1, 'pickPropertyTier did not read the property:homestead rung: ' + P.pickPropertyTier(env));
      assert(P.pickWorkerRung(env) === 1, 'pickWorkerRung did not read the worker_hire rung: ' + P.pickWorkerRung(env));
      P.notePropertyUnlocks(env);

      assert(H.getTier() === 1, 'THE BUG: the tier stayed ' + H.getTier() + ' with a server rung of 1 — the player is still at the camp');
      assert(H.TIERS[H.getTier()].id === 'homestead', 'the House card would still name the Wanderer\'s Camp');
      assert(H.maxPlots() === 4, 'THE FARM HALF: plot cap is ' + H.maxPlots() + ', expected 4 — plots 3 and 4 stay unplantable');
      assert(typeof window.farmPlotCap !== 'function' || window.farmPlotCap() === 4,
        'the farm renderer\'s own cap disagrees with maxPlots()');
      assert(H.workerSlots() === 1, 'THE WORKER HALF: worker cap is ' + H.workerSlots() + ' beside a hired worker — the "Workers 1/0" contradiction');
      assert(!W || W.slots() === 1, 'workers.js still reads a cap of ' + (W && W.slots()) + ', so hire() would refuse a worker the server owns');
      // The heal is WRITTEN, so the ~15 direct G.homestead.tier readers agree too.
      assert(window.G.homestead.tier === 1, 'the heal was derived but not written back into G.homestead.tier');
    } finally {
      // Put a LIVE signed-in session back exactly as found — never drop a rung a
      // real envelope had already delivered just because a test ran.
      P.__resetPropertyRecord(prev.tier, prev.workers);
      restoreG(snap);
    }
  }),

  () => tryRun('b492-2 (re-ruled b502): absence is not a claim, a TRUNCATED answer may only raise — but a COMPLETE one is truth in both directions', () => {
    const P = window.HearthriseProperty;
    const H = window.HearthriseHomestead;
    const prev = P.__resetPropertyRecord();
    const snap = snapshotG();
    try {
      /* (a) ABSENCE IS NOT A CLAIM. `progress` missing entirely = UNKNOWN. A
             server build predating the projection, or a malformed/lean envelope,
             must never demote a castle owner to a bedroll. UNCHANGED by b502. */
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 4 };
      assert(P.pickPropertyTier({ ok: true }) === null, 'a body with no progress array did not signal UNKNOWN');
      assert(P.pickPropertyTier({ ok: true, progress: 'nope' }) === null, 'a non-array progress did not signal UNKNOWN');
      P.notePropertyUnlocks({ ok: true });
      assert(H.getTier() === 4, 'an UNKNOWN rung changed the tier to ' + H.getTier() + ' — absence was read as a claim');
      assert(P.propertyTierKnown() === false, 'an absent statement must leave the record UNKNOWN');

      /* ── (b) RE-RULED (b502). This asserted the OPPOSITE: "a rung of 0 must
             NOT lower a residue tier of 3". That raise-only policy is the live
             P1 (paione, 2026-09-04): residue 2 against a server rung of 1, so
             the Forge card looked buildable, "Upgrade Property" offered the rung
             ABOVE the one he was missing, and `room.forge.1` bounced off
             `prereq_property_tier {have:1,need:2}` ten times in nine minutes.
             A residue rung AHEAD of the server is not a player's progress to
             protect — it is an unplayable account, and the beta is wiped at
             cutover so there is no pre-cutover client progression to grandfather.
             hr_state_of reads permanent rows (`period_key=''`) UNFILTERED, so a
             COMPLETE `progress:[]` is a real, trustworthy "owns no rung". */
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 3 };
      assert(P.pickPropertyTier({ ok: true, progress: [] }) === 0, 'an empty progress array is not a known 0');
      P.notePropertyUnlocks({ ok: true, progress: [], progress_truncated: false });
      assert(H.getTier() === 0, 'a COMPLETE statement of "no rung" must set the tier to 0; got ' + H.getTier()
        + ' — the residue is out-ranking the server again (the b502 class)');
      assert(window.G.homestead.tier === 0,
        'the conform was derived but not WRITTEN back, so the stored residue keeps the lie across the reload');

      /* ── (c) RE-RULED (b502): a LOWER complete rung WINS. This is paione's row
             verbatim — residue 2, server 1 — and the assertion that used to say
             "3" is the one that made his account unrecoverable from the client. */
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 2 };
      P.notePropertyUnlocks({ ok: true, progress_truncated: false,
        progress: [{ kind: 'unlock', key: 'property:homestead', value: 1, period: '' }] });
      assert(H.getTier() === 1, 'PAIONE\'S ROW: residue 2 + server rung 1 must resolve to 1; got ' + H.getTier());
      assert(H.nextTier() && H.nextTier().id === 'farmstead',
        'the upgrade offered must be the rung he is MISSING (farmstead), not the one above the forged tier; got '
        + (H.nextTier() && H.nextTier().id));

      /* (c2) THE TRUNCATION CARVE-OUT — the reason server-only was refused in
             b492, now handled by reading the flag the server already sends.
             hr_state_of caps `progress` at 1000 rows and sets
             `progress_truncated`; in THAT answer a present row is real but an
             absent one proves nothing, so it may only RAISE. */
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 4 };
      P.notePropertyUnlocks({ ok: true, progress: [], progress_truncated: true });
      assert(H.getTier() === 4, 'a TRUNCATED envelope demoted a manor owner to ' + H.getTier()
        + ' — an incomplete statement was read as a complete one');
      P.notePropertyUnlocks({ ok: true, progress: [{ kind: 'unlock', key: 'property:keep', value: 4, period: '' }],
        progress_truncated: true });
      assert(P.serverPropertyTier() === 4, 'a truncated envelope must still be able to RAISE; got ' + P.serverPropertyTier());

      /* (d) THE MAX IS OVER THE WHOLE NAMESPACE — hr_unlock_buy's own rule. A
             player who bought every rung holds a row for each; the highest wins. */
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 0 };
      P.notePropertyUnlocks({ ok: true, progress_truncated: false, progress: [
        { kind: 'unlock', key: 'property:homestead', value: 1, period: '' },
        { kind: 'unlock', key: 'property:manor', value: 3, period: '' },
        { kind: 'unlock', key: 'property:farmstead', value: 2, period: '' },
      ] });
      assert(H.getTier() === 3, 'the tier is ' + H.getTier() + ', expected the MAX of the property namespace (3)');

      /* ── (e) RE-RULED (b502). This asserted "a later, leaner envelope cannot
             take a rung back". Under b502 a COMPLETE later statement is truth —
             but an UNKNOWN one (no array at all) still cannot move it, which is
             the property that actually protects a player from a lean/pre-
             projection answer. Both halves are asserted now, in that order. */
      P.notePropertyUnlocks({ ok: true });                 // UNKNOWN — must not move it
      assert(P.serverPropertyTier() === 3, 'an envelope with NO progress array lowered the observed rung to '
        + P.serverPropertyTier() + ' — absence was read as a claim');
      P.notePropertyUnlocks({ ok: true, progress: [], progress_truncated: true });   // incomplete — must not lower
      assert(P.serverPropertyTier() === 3, 'a TRUNCATED envelope lowered the observed rung to ' + P.serverPropertyTier());
      P.notePropertyUnlocks({ ok: true, progress: [], progress_truncated: false });   // COMPLETE — a statement
      assert(P.serverPropertyTier() === 0, 'a COMPLETE "no rung" statement did not update the record; got '
        + P.serverPropertyTier());

      /* (f) NEVER PAST THE TABLE. A sixth rung from a server ahead of this
             client (or a garbage residue) must not index TIERS out of range —
             `TIERS[6].plots` is a TypeError that takes the House AND the farm down. */
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 0 };
      P.notePropertyUnlocks({ ok: true, progress_truncated: false,
        progress: [{ kind: 'unlock', key: 'property:spire', value: 99, period: '' }] });
      assert(H.getTier() === H.TIERS.length - 1, 'an over-range rung was not clamped to the table: ' + H.getTier());
      assert(typeof H.maxPlots() === 'number' && H.maxPlots() > 0, 'an over-range rung crashed the plot cap');
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 99 };           // a garbage residue tier, no rung at all
      assert(H.getTier() === H.TIERS.length - 1, 'an over-range RESIDUE tier was not clamped: ' + H.getTier());
      window.G.homestead = { tier: NaN };          // typeof NaN === 'number', so ensureState waves it through
      assert(H.getTier() === 0 && typeof H.maxPlots() === 'number',
        'a NaN residue tier was not coerced to a usable index (it would index TIERS[NaN] and throw)');

      /* (g) A DATED row is not a rung. Period rows are dailies and are pruned at
             31 days; reading a tier out of one would be a tier that expires. */
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 0 };
      P.notePropertyUnlocks({ ok: true, progress_truncated: false,
        progress: [{ kind: 'unlock', key: 'property:castle', value: 5, period: '2026-08-29' }] });
      assert(H.getTier() === 0, 'a PERIOD-keyed row was read as a permanent property rung');
    } finally {
      // Put a LIVE signed-in session back exactly as found — never drop a rung a
      // real envelope had already delivered just because a test ran.
      P.__resetPropertyRecord(prev.tier, prev.workers);
      restoreG(snap);
    }
  }),

  () => tryRun('b492-3: the heal survives a reload — it is observed on the BOOT hr_load and re-saved into residue', () => {
    const P = window.HearthriseProperty;
    const H = window.HearthriseHomestead;
    const CS = window.HearthriseClientState;
    const CAP = window.HearthriseCapstone;
    assert(CS && typeof CS.applyClientState === 'function', 'applyClientState is not published');
    assert(CAP && typeof CAP.buildResiduePatch === 'function', 'buildResiduePatch is not published');
    const prev = P.__resetPropertyRecord();
    const snap = snapshotG();
    try {
      /* THE IDLE-BOOT CLASS (the one that stranded inventory in b46x and the crew
         in b477): hr-accrue answers {accrued:false} on an idle boot, so
         applyEnvelopeState NEVER runs and anything hydrated only there is lost.
         record.js's settle() calls applyClientState with the always-full hr_load
         body, so the rung must be observed from THERE too. */
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 0 };
      const bootBody = { ok: true, version: 3, now: Date.now(), state: {}, progress: [
        { kind: 'unlock', key: 'property:farmstead', value: 2, period: '' },
      ] };
      CS.applyClientState(bootBody, window.G);
      assert(P.serverPropertyTier() === 2,
        'THE IDLE-BOOT BUG: the boot hr_load body did not feed the rung observer (got ' + P.serverPropertyTier() + ') — '
        + 'a player who reloads while idle stays demoted for the whole session');
      assert(H.getTier() === 2, 'the boot observation did not heal the tier: ' + H.getTier());

      /* AND IT PERSISTS: `homestead` is a residue field, so the healed value is
         what the next residue upload carries. Without this the heal would be
         re-done every session and would silently un-do itself the moment the
         rung projection ever went missing. */
      const patch = CAP.buildResiduePatch(window.G);
      assert(patch.homestead && patch.homestead.tier === 2,
        'the residue patch still uploads the stale tier ' + JSON.stringify(patch.homestead) + ' — the heal would not survive a reload');
    } finally {
      // Put a LIVE signed-in session back exactly as found — never drop a rung a
      // real envelope had already delivered just because a test ran.
      P.__resetPropertyRecord(prev.tier, prev.workers);
      restoreG(snap);
    }
  }),

  () => tryRun('b492-4: the crew cap is floored by the paid worker_hire rung independently of the property row', () => {
    const P = window.HearthriseProperty;
    const H = window.HearthriseHomestead;
    const prev = P.__resetPropertyRecord();
    const snap = snapshotG();
    try {
      /* hr_state_of caps `progress` at 1000 rows (progress_truncated), so ONE of
         the two rows can arrive without the other. Either one alone must heal the
         crew, because the "Workers 1/0" contradiction is what makes hire() refuse
         a worker the server has already sold. */
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 0 };
      P.notePropertyUnlocks({ ok: true, progress_truncated: false,
        progress: [{ kind: 'unlock', key: 'worker_hire', value: 2, period: '' }] });
      assert(H.getTier() === 0, 'the worker rung must not move the PROPERTY tier — that would invent a purchase');
      assert(H.workerSlots() === 2, 'the crew cap ignored the paid worker_hire rung: ' + H.workerSlots());
      assert(H.maxPlots() === H.TIERS[0].plots, 'the worker rung leaked into the plot cap');
      /* The tier's own figure still wins when it is the larger of the two.
         b502: the property rung is stated ALONGSIDE the worker rung here, because
         a complete `progress` array without a `property:` row is now a real
         statement of "no rung" and would (correctly) put this castle owner back
         at the camp. Stating both is what a real castle owner's envelope carries. */
      P.__resetPropertyRecord();
      window.G.homestead = { tier: 5 };            // castle: 6 workers
      P.notePropertyUnlocks({ ok: true, progress_truncated: false, progress: [
        { kind: 'unlock', key: 'property:castle', value: 5, period: '' },
        { kind: 'unlock', key: 'worker_hire', value: 1, period: '' },
      ] });
      assert(H.getTier() === 5, 'the castle rung did not survive its own envelope; got ' + H.getTier());
      assert(H.workerSlots() === H.TIERS[5].workers,
        'a lower worker rung capped a castle crew at ' + H.workerSlots());
    } finally {
      // Put a LIVE signed-in session back exactly as found — never drop a rung a
      // real envelope had already delivered just because a test ran.
      P.__resetPropertyRecord(prev.tier, prev.workers);
      restoreG(snap);
    }
  }),

  /* ── 2026-09-06 regression — THE REALTIME SUBSCRIPTION THAT COULD NEVER FIRE ─
     Reliability audit, measured on production over a 20.25-day window: the
     Realtime WAL poller is the #1 statement in the database (2,706,517 calls /
     15,669 s / max 9.8 s, ~36x the #2), and `pg_publication_tables` returned
     exactly {chat_messages, market_buy_offers}. The market backend nevertheless
     opened a websocket channel subscribing to postgres_changes on
     `market_listings` — a table that has NEVER been in the publication (its
     `drop table ... cascade` + recreate in 2026-08-17-market-v2.sql silently
     removed it), through a subscribe(onChange) with no caller anywhere.
     It was removed with supabase/migrations/2026-09-06-realtime-publication-trim.sql.

     The repo-side equality (publication == subscriptions) is asserted by
     tests/realtime-cost.mjs. What THIS test adds is the half that guard cannot
     see: the LOADED, RUNNING client. It fails if the subscription is put back
     on a live backend object, which is how it would actually return. */
  () => tryRun('2026-09-06: the market backend opens no Realtime channel', () => {
    const M = window.HearthriseSupabaseMarket;
    /* THE VACUITY PROBE. It must name a method the BACKEND actually has:
       `buyAggregated` is a HearthriseMarket facade verb, not a backend one, and
       naming it turned this guard permanently red (CI b511) on a backend that
       was loaded and correct. `buyListing` is the backend's own buy path and is
       the method the trim would have to be revisited for. */
    assert(M && typeof M.buyListing === 'function',
      'the Supabase market backend is not published — this test would pass vacuously');
    assert(typeof M.subscribe !== 'function',
      'the market backend grew a subscribe() again: a postgres_changes handler on an '
      + 'UNPUBLISHED table can never fire, and it still costs a websocket channel per '
      + 'player plus WAL decode if anyone publishes the table to "fix" it. '
      + 'Reinstating it requires publishing the table in the SAME change.');
    assert(!M._sub, 'the market backend is holding a live Realtime channel: ' + String(M._sub));

    /* CONTROL 1. Every assertion above is satisfied by DELETING the market
       backend's read path too — which would also stop the panel refreshing.
       Removing realtime is only correct because the fetch cadence already does
       the work; assert the cadence still exists. */
    assert(typeof M.fetchListings === 'function' || typeof M.listings === 'function'
        || typeof M.load === 'function' || typeof M.collectSales === 'function',
      'the market backend has no remaining read path — realtime was removed on the basis '
      + 'that polling already refreshes the panel, and that basis is now false');

    /* CONTROL 2. The subscription that must SURVIVE. window.Chat is the only
       peer-message delivery surface in the game and its Supabase backend's
       postgres_changes handler is the only thing that fills it — chat.js
       subscribes at :993 and nothing polls chat_messages as a fallback. If the
       chat dock ever disappears, the publication trim must be revisited in the
       same change rather than left paying for an unread table. */
    assert(window.Chat && typeof window.Chat.setBackend === 'function',
      'window.Chat is gone — chat_messages is the ONE table this trim keeps published, '
      + 'and it is now published for nobody');
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     2026-09-07 regression suite — FIRST LIGHT (FEATURE_SLATE §1 + fixes 1–3)

     The whole battery is prefixed FIRST-LIGHT- so one lane runs with
     `__smokeTest({only:'FIRST-LIGHT'})`. The happy path is FIRST-LIGHT-1, up in
     "player actions"; these four are the regressions that hold it honest.
     ══════════════════════════════════════════════════════════════════════════ */

  /* ── FIRST-LIGHT-2 — the card LEAVES ────────────────────────────────────
     A pinned card that never unpins is a permanent tutorial. The chain is the
     first day; on day two it must be gone, and "Next up" (which is written for
     a player with history) is what stands there instead. */
  () => tryRun('FIRST-LIGHT-2: a completed chain removes the card entirely — it is the first DAY, not a permanent rail', () => {
    const snap = snapshotG();
    try {
      const H = window.HearthriseHome;
      assert(H && typeof H.__firstDayModel === 'function', 'the First Light seam is not published');

      // CONTROL: with one row open the card draws. Without this the assertion
      // below is satisfied by a card that never draws at all.
      window.G.stats = { kills: 0, gathered: 0, harvested: 0, cropsHarvested: 0, rareDrops: 0 };
      window.G.quests = [];
      window.ensureRetentionState();
      assert(H.__firstDayModel(), 'CONTROL: an open chain must draw, or this test proves nothing');

      // Every step finished and paid — a veteran.
      window.G.quests.forEach((q) => { q.done = true; q.claimed = true; q.progress = q.goal; });
      assert(H.__firstDayModel() === null,
        'a finished chain must yield no model — the card would be pinned above "Next up" forever');
      assert(H.__firstDayHtml(H.__firstDayModel()) === '',
        'a null model must render NOTHING, not an empty shell with a heading');

      /* A last step whose reward is still in flight is still FINISHED. The card
         goes; the recovery sweep is what pays it, and the sweep needs no card. */
      window.G.quests.forEach((q) => { q.claimed = false; });
      assert(H.__firstDayModel() === null,
        'an unclaimed-but-finished chain still has nothing left for the player to DO — the card goes');

      /* A row the player does not hold is never invented. `G.quests` is the
         projected state; drawing a def with no row would be residue-ahead one
         surface over (CLAUDE §6). */
      window.G.quests = [];
      assert(H.__firstDayModel() === null,
        'with no quest rows the card must draw nothing rather than invent 0/15 progress');
    } finally { restoreG(snap); }
  }),

  /* ── FIRST-LIGHT-2b — the card and "Next up" may not say the same thing ──
     FOUND BY LOOKING AT THE ASSEMBLED SCREEN, not by reading either change:
     the launchpad ruling makes an open chain quest the leading milestone, and
     the card draws that same quest four rows above, so day-one Home printed
     "Cook 5 dishes · 0/5 · [Go cook]" twice within ten pixels. Each half was
     individually correct, which is the classic shape and the reason the visual
     gate exists. This asserts the ASSEMBLED result. */
  () => tryRun('FIRST-LIGHT-2b: Home draws the leading chain quest ONCE — the card and "Next up" never duplicate', () => {
    const snap = snapshotG();
    const panel = document.getElementById('panel-profile');
    const hadActive = !!(panel && panel.classList.contains('active'));
    try {
      assert(panel, 'CONTROL: there is no #panel-profile to render into');
      window.G.stats = { kills: 0, gathered: 0, harvested: 0, cropsHarvested: 0, rareDrops: 0 };
      window.G.quests = [];
      window.G.daily = { lastReset: window.hrGoalDayKey(), tasks: [] };
      window.ensureRetentionState();
      const lead = window.G.quests.find((q) => !q.done);
      assert(lead, 'CONTROL: the fixture must leave a chain quest open');

      panel.classList.add('active');
      window.HearthriseHome.render();
      const root = document.getElementById('hd-root');
      assert(root, 'the dashboard did not render at all');
      assert(root.querySelector('.hd-firstlight'),
        'CONTROL: the First Light card must be on screen, or a duplicate is impossible and this passes vacuously');

      const titles = Array.from(root.querySelectorAll('.hd-qtitle, .hd-mile-title'))
        .map((e) => (e.textContent || '').trim());
      const drawn = titles.filter((t) => t === lead.label).length;
      assert(drawn === 1,
        '"' + lead.label + '" is drawn ' + drawn + ' times on Home — the pinned card and "Next up" are '
        + 'duplicating the same quest. Titles: ' + JSON.stringify(titles));

      /* And with no dailies behind it, the emptied section is REMOVED rather
         than left as a heading over a line about a different quest system.
         CONDITIONAL ON ITS OWN PRECONDITION: this only applies when the leading
         milestone really is a chain quest (i.e. when suppressing it empties the
         section). Asserting it unconditionally made this test go red for
         FIRST-LIGHT-3's defect as well, and a test that fails for two different
         reasons names neither. */
      const lead2 = window.HearthriseLaunchpad.getNextMilestone();
      const leadIsChain = !!(lead2 && lead2.kind === 'quest' && lead2.goal
        && window.G.quests.some((q) => q.id === lead2.goal.id));
      if (leadIsChain) {
        assert(!/Next up/.test(root.textContent || ''),
          'the "Next up" heading survived with nothing left to put under it');
      }

      /* ── THE SAME CLASS, ONE SYSTEM OVER ────────────────────────────────
         The milestone picks the closest OPEN GOAL, and daily tasks are in that
         pool AND rendered underneath it — so with the chain finished, "Next up"
         restated a daily task it was about to list ("Kill 60 monsters" over
         "Kill 60 monsters"). Same defect, different source; both are suppressed
         by the same rule, so this half is asserted here rather than filed. */
      window.G.quests.forEach((q) => { q.done = true; q.claimed = true; q.progress = q.goal; });
      window.generateDailyTasks(false);
      window.HearthriseHome.render();
      const root2 = document.getElementById('hd-root');
      const open = (window.G.daily.tasks || []).filter((t) => !t.done).slice(0, 3);
      if (open.length) {
        const t2 = Array.from(root2.querySelectorAll('.hd-qtitle, .hd-mile-title'))
          .map((e) => (e.textContent || '').trim());
        open.forEach((t) => {
          const n = t2.filter((x) => x === t.label).length;
          assert(n <= 1,
            'daily task "' + t.label + '" is drawn ' + n + ' times — the milestone hero row is restating '
            + 'a row directly below it. Titles: ' + JSON.stringify(t2));
        });
      }
    } finally {
      if (panel && !hadActive) panel.classList.remove('active');
      restoreG(snap);
      try { window.HearthriseHome.render(); } catch (e) {}
    }
  }),

  /* ── FIRST-LIGHT-3 — the 0%-vs-0% tie ───────────────────────────────────
     FEATURE_SLATE fix #1, Designer ruling 2026-09-07. This is the defect that
     made the whole feature invisible: skills were evaluated first with a strict
     `>`, so on a fresh account "Next up" said *Attack Lv 1 → 2* while five
     finishable quests sat open underneath it.

     Both halves are asserted, because the ruling is narrow: an UNSTARTED skill
     loses to an open quest, and a STARTED one still wins on closeness. Half of
     this test is the veteran the slate's "must not re-order Next up" protects. */
  () => tryRun('FIRST-LIGHT-3: an open chain quest outranks a 0%-progress skill milestone — and never a started one', () => {
    const snap = snapshotG();
    const origSR = window.HearthriseSkillRecord;
    try {
      const LP = window.HearthriseLaunchpad;
      assert(LP && typeof LP.getNextMilestone === 'function', 'the launchpad milestone API must be published');
      assert(typeof window.xpForLevel === 'function' && typeof window.levelFromXp === 'function',
        'CONTROL: the level maths must be loaded or every skill candidate is skipped and this passes vacuously');

      /* The XP a milestone is measured from is read through the display seam
         (src/net/skill-record.js), not off G.skills — under the skills record
         arm a G.skills fixture measures nothing. Stub the READ, restore it. */
      const stubXp = (fn) => { window.HearthriseSkillRecord = { skillXpForDisplayOr: fn }; };

      window.G.stats = { kills: 0, gathered: 0, harvested: 0, cropsHarvested: 0, rareDrops: 0 };
      window.G.quests = [];
      window.G.daily = { lastReset: window.hrGoalDayKey(), tasks: [] };
      window.ensureRetentionState();
      const first = window.G.quests.find((q) => !q.done);
      assert(first, 'CONTROL: the fixture must leave a chain quest open');
      assert((first.progress | 0) === 0, 'CONTROL: the tie under test is 0% vs 0%, got ' + first.progress);

      // ── every skill unstarted: the quest leads ──
      stubXp(() => 0);
      const tie = LP.getNextMilestone();
      assert(tie && tie.kind === 'quest',
        'a 0% skill must not beat an open quest — got a ' + (tie && tie.kind) + ' milestone: '
        + (tie && tie.label));
      assert(tie.label === first.label,
        'the leading row must be the FIRST open chain quest (the same row the card lights), got ' + tie.label);
      assert(tie._cmp === undefined && tie._tier === undefined,
        'the ranking keys must not leak onto the returned milestone');

      // ── one skill half-way to its next level: the SKILL leads again ──
      const half = Math.floor((window.xpForLevel(2) - window.xpForLevel(1)) / 2) + window.xpForLevel(1);
      stubXp((G, id) => (id === 'attack' ? half : 0));
      const started = LP.getNextMilestone();
      assert(started && started.kind === 'skill',
        'a STARTED skill must still win on closeness — the ruling is about unstarted levels only; got '
        + (started && started.kind));

      // ── a nearly-finished quest beats a barely-started skill, as before ──
      stubXp((G, id) => (id === 'attack' ? window.xpForLevel(1) + 1 : 0));
      first.progress = first.goal - 1;
      const close = LP.getNextMilestone();
      assert(close && close.kind === 'quest',
        'closeness must still decide above zero — a 93% quest lost to a 1% skill');
    } finally {
      window.HearthriseSkillRecord = origSR;
      restoreG(snap);
    }
  }),

  /* ── FIRST-LIGHT-4 — the tour may not teach a rule the engine dropped ────
     FEATURE_SLATE fix #2. Two sentences in the tour described a game that
     stopped existing at Recovery Rule rev.2 and at the Auto-Eat tier table, and
     the tour is the FIRST place a player hears either rule. This guard pins the
     retired sentences out and binds the replacement to the constants it quotes,
     so the copy cannot drift away from the engine again in silence. */
  () => tryRun('FIRST-LIGHT-4: the FTUE teaches the LIVE death and auto-eat rules, and names the Bounty Board', () => {
    const F = window.HearthriseFTUE;
    assert(F && typeof F.steps === 'function', 'the FTUE step table is not published — this would pass vacuously');
    const steps = F.steps();
    assert(steps.length > 0, 'CONTROL: no tour steps were read');
    const all = steps.map((s) => String(s.body || '')).join(' • ');

    // THE TWO DEAD RULES.
    assert(!/nobody does it for you/i.test(all),
      'the tour still says nobody feeds you: Auto-Eat exists (src/core/auto-eat.js AUTO_EAT_TIERS) and is buyable today');
    assert(!/fight ends when you fall/i.test(all),
      'the tour still says a fall ENDS the fight — Recovery Rule rev.2 knocks you out and RESUMES the same run');
    assert(!/only until you fall/i.test(all),
      'the tour still gates away combat on the first fall — src/core/away.js resumes it after recoveryFor()');

    // WHAT MUST BE THERE INSTEAD, each clause bound to the constant behind it.
    const combat = steps.find((s) => s.id === 'combat');
    assert(combat, 'CONTROL: the tour has no combat step to check');
    const body = String(combat.body || '');
    assert(/Bounty Board/.test(body),
      'the combat step names Auto-Eat and must name where it is sold — the Bounty Board (index.html data-tab="bounty")');
    const AE = window.HearthriseCore && window.HearthriseCore.autoEat;
    if (AE && AE.AUTO_EAT_TIERS) {
      const marks = AE.AUTO_EAT_TIERS[1].marks;
      assert(new RegExp('\\b' + marks + ' Marks\\b').test(body),
        'the tour quotes an Auto-Eat I price the tier table does not charge; the table says ' + marks);
    }
    assert(/knocked out/i.test(body) && /carry on with the same fight/i.test(body),
      'the combat step must state the LIVE rule: knocked out, then the same run resumes: ' + body);
    const AW = window.HearthriseCore && window.HearthriseCore.away;
    if (AW && typeof AW.recoveryFor === 'function') {
      assert(AW.recoveryFor({ deathsTodayBefore: 0, deathsLifetimeBefore: 0 }) === 0,
        'the tour promises the day\'s first fall costs no time — recoveryFor() disagrees, so the copy is now a lie');
    }
    // And the tour must point at the surface this build gave it.
    const wrap = steps.find((s) => s.id === 'wrap');
    assert(wrap && /Your first day/.test(String(wrap.body || '')),
      'the closing step must point at the pinned chain card it now ships beside');
  }),

  /* ── FIRST-LIGHT-5 — the away card and the cooking arm, bound ────────────
     FEATURE_SLATE fix #3. The empty-night note said "fighting, gathering and crafting bank"
     while cooking was unpayable, and left a note saying to restore cooking when
     it paid. The arm landed; nobody came back. That is a copy/flag pair with no
     test between them, which is exactly how it survived a hundred builds — so
     the pair, not the sentence, is what this asserts. */
  () => tryRun('FIRST-LIGHT-5: the empty-night note names every channel that actually banks — bound to the cooking arm', () => {
    const H = window.HearthriseHome;
    const AS = window.HearthriseCore && window.HearthriseCore.artisanSim;
    assert(H && typeof H.__awayCardHtml === 'function', 'the away-card seam is not published');
    assert(AS && typeof AS.benchPayable === 'function',
      'CONTROL: the artisan-sim bridge must be up or the binding below is vacuous');

    const html = H.__awayCardHtml({
      at: Date.now(), awayMs: 8 * 3600000, idle: true,
      gainedXp: 0, gainedItems: 0, gainedGold: 0, gainedKills: 0,
    });
    assert(/Nothing was running that pays/.test(html),
      'CONTROL: this fixture must reach the quiet-night branch: ' + html.slice(0, 200));

    /* THE BINDING. Whether the sentence may name cooking is not a style
       question — it is `benchPayable('cooking')`, the same predicate the
       accrual engine reads. Both directions are asserted, so flipping the arm
       back without following it here goes red instead of shipping a new lie. */
    const pays = AS.benchPayable('cooking');
    if (pays) {
      assert(/cooking/i.test(html),
        'cooking is payable away (serverOwnedBonusKeys includes noBurn) and the card still omits it: ' + html);
    } else {
      assert(!/cooking/i.test(html),
        'cooking is NOT payable away right now and the card promises it — that is the b388 defect inverted');
    }
    assert(/Fighting/.test(html) && /gathering/.test(html) && /crafting/.test(html),
      'the note must still list the channels that always banked: ' + html);
  }),


  /* ── THE COLLECTION LOG "DISCOVERS" WHAT YOU ALREADY OWN ──────────────
     paione, with a screenshot: a Stonemason holding 14,800 granite was told
     "New discovery: Granite Stone (80/623)", and until that toast the log drew
     his 14.8K stack as an undiscovered "???". `G.collection` has ONE writer
     (trackCollection, reached only from the client-side addItem), while
     everything earned AWAY lands through src/net/accrue.js reconcileInventory,
     which assigns G.inventory wholesale and has never heard of the log. So the
     log is blind to away progress and the first attended tick that re-credits a
     long-held id announces it as new. The fix levels the log against the bag the
     realm STATES. Three assertions and a CONTROL, because "no toast fired" is
     satisfiable by a dead hook. */
  () => tryRun('COLLECT-HELD-1: an item the realm says you already HOLD is never a "New discovery" — the collection log reconciles against the bag', () => {
    const C = window.HearthriseCollection;
    assert(C && typeof C.reconcileHeld === 'function',
      'HearthriseCollection.reconcileHeld is missing — the log has no way to level itself '
      + 'with the bag the realm states, so every long-held away-earned item is still a "discovery"');

    const snap = snapshotG();
    const G = window.G;
    const colBefore = G.collection ? JSON.parse(JSON.stringify(G.collection)) : undefined;
    const origNotify = window.notify;
    const said = [];
    try {
      window.notify = function (m, k) { said.push(String(m)); };
      // A REAL id from the report; bag and log are restored in the finally.
      const HELD = 'granite';                 // ITEMS.granite === 'Granite Stone'
      const UNSEEN = 'bones';                 // held by nobody here, logged by nobody here
      assert(window.ITEMS && window.ITEMS[HELD] && window.ITEMS[UNSEEN],
        'setup: this build does not know ' + HELD + ' / ' + UNSEEN + ' — the test would pass vacuously');

      // THE BAG ARRIVES AS THE REPORTED ONE DID — the reconcile named above.
      G.inventory = {};
      window.HearthriseAccrual.reconcileInventory(G, { inventory: { [HELD]: 14800 } }, false, false);
      assert((G.inventory[HELD] || 0) === 14800,
        'setup: the envelope did not state the bag (' + G.inventory[HELD] + ')');
      G.collection = {};                             // …and a log that has never heard of it

      // (1) THE RECONCILE ITSELF. Holding it IS the proof you obtained it.
      assert(C.getStats(G).item.found === 0, 'setup: the log should start empty for this fixture');
      C.reconcileHeld(G);
      assert(G.collection[HELD] >= 14800,
        'the log still does not count an item the realm says the player is holding 14,800 of');
      assert(C.getStats(G).item.found === 1,
        'the completion counter still under-reports a held item — this is the "80/623 climbing from 79" the player saw');

      // (2) THE TOAST. A credit of a long-held id is a backfill, not a discovery.
      G.collection = {};                             // back to the reported state: log blind, bag full
      C.__setRealmStated(true);                      // realm picture landed; debounce zeroed
      said.length = 0;
      window.addItem(HELD, 1);
      const cried = said.filter((m) => /New discovery/i.test(m));
      assert(cried.length === 0,
        'the game announced "' + (cried[0] || '') + '" for an item the player has held for days');
      assert(G.collection[HELD] > 0,
        'the credit was silenced but not recorded — the log must still learn the item, just without the fanfare');

      // (3) THE CONTROL. A genuinely new id MUST still be celebrated.
      C.__setRealmStated(true);                      // re-zero the 700 ms debounce
      said.length = 0;
      delete G.collection[UNSEEN];
      const ok = window.addItem(UNSEEN, 1);
      assert(ok !== false, 'setup: the control pickup was refused (bank full?) — the control cannot report');
      assert(said.some((m) => /New discovery/i.test(m)),
        'a genuinely NEW item no longer announces itself — the discovery moment was fixed into silence');
    } finally {
      try { C.__setRealmStated(null); } catch (e) {}
      window.notify = origNotify;
      if (colBefore === undefined) delete G.collection; else G.collection = colBefore;
      restoreG(snap);
    }
  }),

  /* THE PLAYER IS NOT THE RETRY LOOP (Paione, 2026-09-11, on live). «when I am in combat and I stop combat it reloads me back to the
     previous combat match» and «I equip a staff and I need to press like 4–8 times for it to equip» are ONE class: `version_conflict`,
     which is the SERVER's own read losing a race (nobody sends a version; the client's attended-combat cadences bump
     `player_state.version` with no intent behind them) and whose documented recovery is "re-read and try again". The client made the
     PLAYER do that: the equip was rolled back and toasted with no retry, and the stop retried once but reconciled the pointer to the
     old activity — with the carried fight — on the losing attempt first. BOTH paths, or a fix to either leaves the other reachable. */
  () => tryRunAsync('B534-1: a version_conflict is the CLIENT\'s retry, not the player\'s — one tap equips, and one tap stops a fight without snapping back into it', async () => {
    const E = window.HearthriseEquip, M = window.HearthriseActivity, A = window.HearthriseAccrual, G = window.G;
    const conflict = (v) => ({ outcome: 'refused', error: 'version_conflict', body: (v === undefined ? { ok: false } : { ok: false, version: v }) });
    assert(typeof E.shouldRetryEquip === 'function' && E.shouldRetryEquip(conflict(931), 1, 2) === true && E.shouldRetryEquip(conflict(931), 2, 2) === false, 'equip.js must publish a BOUNDED version_conflict retry — one, never a loop. Without it every tap that races a combat cadence is a wasted tap the player has to repeat');
    assert(E.shouldRetryEquip(conflict(), 1, 2) === false && E.shouldRetryEquip({ outcome: 'refused', error: 'insufficient_item', body: { ok: false, version: 9 } }, 1, 2) === false, 'only a conflict carrying the server\'s RE-READ version may be retried: a degraded refresh means nothing was re-read, and a refusal about the DELTA would be refused for ever');

    const mid = (window.MONSTERS && window.MONSTERS.slime) ? 'slime' : Object.keys(window.MONSTERS || {})[0];
    const STAFF = Object.keys(window.ITEMS || {}).find((k) => /staff/.test(k) && window.ITEMS[k].slot === 'weapon') || Object.keys(window.ITEMS || {}).find((k) => window.ITEMS[k] && window.ITEMS[k].slot === 'weapon');
    assert(mid && STAFF, 'the fixture needs a monster and a wearable weapon');
    const snap = snapshotG(), realFetch = window.fetch, origNotify = window.notify, prevCfg = E.getEquipConfig(), wasOn = A.isServerAccrualEnabled();
    const said = [], probe = [], base = Number((G._record && G._record.version) || 0);
    let seen = [], plan = [];
    const env = (version, st) => ({ version, now: null, state: Object.assign({ slot: 0, gold: G.gold, gems: G.gems || 0, hp: G.playerHp, max_hp: G.playerMaxHp, accrued_to: '2026-09-11T19:00:00Z' }, st || {}), skills: Object.keys(G.skills || {}).reduce((o, k) => { o[k] = { xp: G.skills[k] }; return o; }, {}), inventory: Object.assign({}, G.inventory) });
    try {
      window.notify = function (t) { said.push(String(t)); };
      /* A step is consumed only by the VERB it was written for, so an ambient accrue cannot eat the answer the arm under test waits
         for. `probe` samples the player's own screen AT each request: the snap-back is invisible in the END state (a successful retry
         puts the pointer right either way), so the one moment it can be asked about is when the SECOND declaration goes out. */
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        let b = null; try { b = JSON.parse(init && init.body); } catch (e) {}
        const verb = (b && b.verb) || 'accrue';
        seen.push(b); probe.push({ verb, activeMonster: G.activeMonster });
        if (!plan.length || plan[0].verb !== verb) return Promise.resolve(new Response('{"ok":false,"error":"rate_limited"}', { status: 429 }));
        const step = plan.shift();
        return Promise.resolve(new Response(JSON.stringify(step.body), { status: step.status }));
      };

      // ── PATH 1: THE EQUIP. One tap, one conflict, and the player is never told about it.
      E.configureEquip({ url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => 'jwt', slot: 0, gestureWired: true }); window.wireServerEquip();
      plan = [{ verb: 'equip', status: 409, body: Object.assign({ ok: false, verb: 'equip', error: 'version_conflict', stage: 'equip', equipment: Object.assign({}, G.equipment) }, env(base + 1)) },
        { verb: 'equip', status: 200, body: Object.assign({ ok: true, verb: 'equip', equipment: Object.assign({}, G.equipment, { weapon: STAFF }) }, env(base + 2)) }];
      G.equipment = Object.assign({}, G.equipment, { weapon: null });   // the slot starts empty, or the gesture moves nothing and this arm proves nothing
      const before = window.equipStateSnapshot();
      G.equipment = Object.assign({}, G.equipment, { weapon: STAFF });  // the tap, applied locally
      await window.routeEquipGesture(before); await drain();
      const equips = seen.filter((b) => b && b.verb === 'equip');
      assert(equips.length === 2, 'ONE tap sent ' + equips.length + ' equip(s) — a version_conflict must be retried by the client, once, before the player is told anything. This is Paione\'s "press like 4–8 times"');
      assert(equips[0].intentId !== equips[1].intentId, 'the retry reused the rejected key (' + equips[0].intentId + ') — hr_apply stores the DECISION under the key outside the protected block, so a reused key is handed the same conflict back for up to 25 h and could never have succeeded');
      assert((G.equipment && G.equipment.weapon) === STAFF, 'after ONE tap the player is not wearing ' + STAFF + ' (the slot holds ' + (G.equipment && G.equipment.weapon) + ') — the refusal rolled the swap back and the retry never happened');
      assert(!said.some((m) => /gear changed somewhere else/i.test(m)), 'the player was told "' + (said.find((m) => /gear changed/i.test(m)) || '') + '" for a conflict the client resolved by itself — a toast nobody can act on is noise');
      assert(Number(G._record && G._record.version) === base + 2, 'the client still holds version ' + (G._record && G._record.version) + ' after the server stated ' + (base + 2) + ' — every envelope, refusal included, goes through applyRecord');

      // CONTROL: a conflict the server could not attach state to is NOT retried, and THAT player is told.
      seen = []; said.length = 0; plan = [{ verb: 'equip', status: 409, body: { ok: false, verb: 'equip', error: 'version_conflict', stage: 'equip' } }];
      const before2 = window.equipStateSnapshot();
      G.equipment = Object.assign({}, G.equipment, { weapon: null });
      await window.routeEquipGesture(before2); await drain();
      assert(seen.filter((b) => b && b.verb === 'equip').length === 1, 'a conflict carrying NO state was retried — nothing was re-read, so that is the first attempt sent a second time');
      assert(said.some((m) => /gear changed somewhere else/i.test(m)), 'CONTROL: a refusal the client cannot resolve must still reach the player — got ' + JSON.stringify(said));

      // ── PATH 2: THE STOP. One tap, one conflict, and no detour back through the fight.
      armActivityTransport();
      const fighting = Object.assign({ activity: { kind: 'combat', id: mid } }, env(base + 3, { active_kind: 'combat', active_id: mid }));
      const refuseStop = { verb: 'set_activity', status: 409, body: Object.assign({ ok: false, error: 'version_conflict', stage: 'switch' }, fighting) };
      seen = []; probe.length = 0;
      plan = [refuseStop, { verb: 'set_activity', status: 200, body: Object.assign({ ok: true, activity: { kind: 'idle', id: null } }, env(base + 4, { active_kind: 'idle', active_id: null })) }];
      G.activeMonster = null;                          // the player's Stop, applied locally
      await window.declareActivity('idle', null); await drain();
      const second = probe.filter((x) => x.verb === 'set_activity')[1];
      assert(seen.filter((b) => b && b.verb === 'set_activity').length === 2, 'the stop was not retried');
      assert(second && second.activeMonster === null, 'the client put the player back into the fight (' + (second && second.activeMonster) + ') BETWEEN the refused attempt and the retry that succeeded — that is "it reloads me back to the previous combat match". The reconcile is HELD until the gesture has finished asking');
      assert(!G.activeMonster, 'the stop landed and the player is still fighting ' + G.activeMonster);

      // CONTROL: a hold is not a skip — two conflicts still land the server's truth, which also proves this fixture CAN snap back, so the assertion above measures the fix rather than a dead reconcile path.
      seen = []; probe.length = 0; plan = [refuseStop, refuseStop]; G.activeMonster = null;
      await window.declareActivity('idle', null); await drain();
      assert(G.activeMonster === mid, 'CONTROL: two conflicts in a row must still converge to the SERVER (' + G.activeMonster + ') — the reconcile is held, never dropped, and keeping its own guess is the one thing a client may never do');
    } finally {
      window.fetch = realFetch; window.notify = origNotify;
      restoreAccrualSwitch(wasOn);
      M.resetActivity(); M.configureActivity(null);
      E.resetEquip(); if (prevCfg) E.configureEquip(prevCfg);
      try { window.__resetEquipAssertion(); } catch (e) {}
      restoreGAndRecord(snap);
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  /* GATHER HALF of the arc above (see `cameFromArc`): chop Willow → fight →
     tap Willow again. Prefixed B533- to run alone with `__smokeTest({only:…})`. */
  () => tryRunAsync('B533-1: after a fight, tapping the node you came FROM sends the switch — a stale paint cannot swallow the gesture', async () => {
    const tree = (window.TREES || []).find((t) => t.id === 'willow_tree') || (window.TREES || [])[1]; const mid = (window.MONSTERS || {}).slime ? 'slime' : Object.keys(window.MONSTERS || {})[0];
    assert(!!tree && !!mid && !!window.HearthriseActivity && typeof window.openSkillDetail === 'function', 'setup: no tree/monster/activity-seam fixture — the reported gesture cannot be driven');
    await cameFromArc({ skillId: 'woodcutting', targetId: tree.id, prod: tree.prod, mid, seed: (G) => { G.skills = Object.assign({}, G.skills, { woodcutting: 14000000 }); }, start: () => window.startSkill('woodcutting', tree.id, tree.ms) },
      async ({ G, M, sent, settle, tile, stalePaint }) => {
        tile.click(); await settle();
        const sw = sent.filter((b) => b.activity && b.activity.kind === 'gather' && b.activity.id === tree.id);
        assert(sw.length >= 1, 'tapping the node the player came FROM declared NOTHING (' + sent.length + ' declaration(s): ' + JSON.stringify(sent.map((b) => b.activity)) + '; painted while active: ' + stalePaint + ') — the tile baked its stop handler at paint time, the cross-stop cleared the pointer without rebuilding the panel, and the stop returned in silence. The player cannot get back to their own node with one tap');
        assert(M.isIntentKey(sw[sw.length - 1].intentId), 'the switch carried no canonical uuid key: ' + sw[sw.length - 1].intentId);
        assert(G.activeSkill === 'woodcutting' && G.skillTargetId === tree.id && !G.activeMonster, 'the tap did not land: pointer ' + G.activeSkill + '/' + G.skillTargetId + ', monster ' + G.activeMonster + ' — the header would still read as a fight');
      });
  }),

  /* ARTISAN HALF of the same arc: cook shrimp → fight → tap Cook Shrimp again.
     Its last two taps (stop, then start again on a panel a stop never rebuilds)
     are what licenses deleting the old stopSkill re-render wrapper. */
  () => tryRunAsync('B539-1: after a fight, tapping the artisan recipe you came FROM sends the switch — a stale paint cannot swallow the gesture', async () => {
    const rec = ((window.ARTISAN_RECIPES || {}).cooking || []).find((r) => r.id === 'cook_shrimp'); const mid = (window.MONSTERS || {}).slime ? 'slime' : Object.keys(window.MONSTERS || {})[0];
    assert(!!rec && !!mid && !!window.HearthriseActivity && typeof window.startArtisan === 'function', 'setup: no cook_shrimp recipe / monster / activity seam — the reported gesture cannot be driven');
    await withCookingArmed(() => cameFromArc({ skillId: 'cooking', targetId: rec.id, prod: rec.output, mid, start: () => window.startArtisan('cooking', rec.id),   /* the bench pause is not this test's subject */
      seed: (G) => { const inp = rec.inputs || { [rec.input]: rec.inputQty || 1 }; Object.keys(inp).forEach((id) => { G.inventory[id] = (G.inventory[id] || 0) + 200; }); } },
      async ({ G, sent, settle, tileOf, tile, stalePaint }) => {
        tile.click(); await settle();
        const sw = sent.filter((b) => b.activity && b.activity.kind === 'artisan' && b.activity.id === rec.id);
        assert(sw.length >= 1, 'tapping the recipe the player came FROM declared NOTHING (' + sent.length + ' declaration(s): ' + JSON.stringify(sent.map((b) => b.activity)) + '; painted while active: ' + stalePaint + ') — the tile baked its stop handler at paint time and the stop returned in silence. The player cannot get back to their own bench with one tap');
        assert(G.activeSkill === 'cooking' && G.skillTargetId === rec.id && !G.activeMonster, 'the tap did not land: pointer ' + G.activeSkill + '/' + G.skillTargetId + ', monster ' + G.activeMonster);
        const back = tileOf(); back.click(); await settle(); assert(!G.activeSkill && !G.skillTargetId, 'a second tap on the RUNNING recipe did not stop it (' + G.activeSkill + '/' + G.skillTargetId + ')');
        const third = tileOf(); third.click(); await settle(); assert(G.activeSkill === 'cooking' && G.skillTargetId === rec.id, 'the tap AFTER a stop did not restart the recipe (' + G.activeSkill + '/' + G.skillTargetId + ') — a stop strips .active in place and rebuilds nothing');
      }));
  }),

  /* regression suite — THE BENCH BANNER ASKED FOR A GESTURE THE GAME NO LONGER
     NEEDS (live play gate, 2026-09-12). Training Cooking, open Woodcutting:
     «Click "Stop" on that skill first to start a new activity» — and the very
     next tap, on Normal Tree, switched with no Stop anywhere: the click-time
     router declares the switch for BOTH kinds, and its only refusal (recovery
     → away.recoveryRefuses) refuses COMBAT kinds. COPY IS A CONTRACT WITH THE
     ROUTER, so both halves are measured, sentence and wiring — a renderer that
     baked the paint-time toggle back in would re-lie without editing a word. */
  () => tryRunAsync('B540-1: the bench of a skill you are NOT training names the one you are and invites the tap — it never asks for a Stop first', async () => {
    const G = window.G, tree = (window.TREES || [])[0];
    assert(!!tree && typeof window.openSkillDetail === 'function' && !!window.SKILLS_DEF, 'setup: no tree / skill-detail seam — the reported screen cannot be rendered');
    const snap = snapshotG();
    try {
      G.activeSkill = 'cooking'; G.skillTargetId = 'cook_shrimp';    // the player is training Cooking…
      window.openSkillDetail('woodcutting');                         // …and opens the Woodcutting bench
      await new Promise((r) => setTimeout(r, 80));                   // the banner lands on openSkillDetail's own 30 ms tail
      const banner = document.querySelector('#skill-detail .skill-viewing-banner');
      assert(!!banner, 'no .skill-viewing-banner on a bench opened while another skill trains — this arm cannot read the copy it exists to hold');
      const txt = (banner.textContent || '').replace(/\s+/g, ' ').trim();
      assert(!/\bstop\b/i.test(txt), 'the banner still tells the player to Stop first: "' + txt + '" — untrue since the click-time router landed: a tap on any unlocked tile of THIS bench switches the activity on its own, so the instruction is a round trip to another screen for nothing');
      assert(/cooking/i.test(txt), 'the banner must name the activity that is actually running (Cooking), dynamically: "' + txt + '"');
      assert(/\btap\b|\bswitch\b/i.test(txt), 'the banner must say what the tap DOES, or the player still has no idea how to start here: "' + txt + '"');
      const tile = document.querySelector('#skill-detail .act-tile:not(.locked)');
      assert(!!tile && /hrActivityTileClick/.test(tile.getAttribute('onclick') || ''), 'the tiles on this bench do not route through the click-time router (' + (tile && tile.getAttribute('onclick')) + ') — the banner would be promising a switch a paint-time toggle cannot make');
    } finally {
      document.querySelectorAll('#skill-detail .skill-viewing-banner').forEach((b) => b.remove());
      restoreG(snap);
    }
  }),
];
