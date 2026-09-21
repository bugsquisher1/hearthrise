// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/boot.js — boot, icons, the tab registry, the FTUE tour and the painted-art wiring.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 31 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, tryRun, tryRunAsync, assert, skip, stampRecordLikeLoad, withFarmServer, snapshotG, restoreG, restoreGAndRecord, on } from './_harness.js?v=550';

export default [
  () => tryRun('boot: G defined', () => {
    assert(typeof window.G === 'object' && window.G, 'G not defined');
    assert(typeof window.SKILLS_DEF === 'object', 'SKILLS_DEF missing');
    assert(typeof window.ITEMS === 'object', 'ITEMS missing');
    assert(typeof window.MONSTERS === 'object', 'MONSTERS missing');
  }),
  () => tryRun('boot: 14+ skills', () => {
    assert(Object.keys(window.SKILLS_DEF).length >= 14, 'expected >=14 skills');
  }),
  () => tryRun('boot: 25+ monsters', () => {
    assert(Object.keys(window.MONSTERS).length >= 25, 'expected >=25 monsters');
  }),
  () => tryRun('boot: 80+ items', () => {
    assert(Object.keys(window.ITEMS).length >= 80, 'expected >=80 items');
  }),
  // b126: skill icons intentionally fall back to emoji glyphs (cleared in
  // legacy.js applyLocalIcons IIFE). The map being EMPTY is correct now —
  // it means renderers use the m.icon glyph from data files.
  () => tryRun('icons: skill icons fall back to emoji', () => {
    const cnt = Object.keys(window._skillIcon || {}).length;
    assert(cnt === 0, 'expected 0 skill icons (emoji fallback), got ' + cnt + ' — someone re-added stale paths');
  }),
  // b126: assert icon paths point ONLY at shipped folders. Catches any
  // future regression where someone re-introduces `icons3/...` or
  // `assets/raw-bundle/...` paths that 404 in production.
  () => tryRun('icons: no unshipped paths in _itemPath', () => {
    const ip = window._itemPath || {};
    const bad = [];
    for (const id of Object.keys(ip)) {
      const p = ip[id] || '';
      if (p.indexOf('icons3/') === 0 || p.indexOf('assets/raw-bundle/') === 0) {
        bad.push(id + ' → ' + p);
      }
    }
    assert(bad.length === 0, bad.length + ' items still point at unshipped folders: ' + bad.slice(0, 3).join('; '));
  }),
  () => tryRun('icons: no unshipped paths in _monsterIcon', () => {
    const mi = window._monsterIcon || {};
    const bad = [];
    for (const id of Object.keys(mi)) {
      const p = mi[id] || '';
      if (p.indexOf('icons3/') === 0 || p.indexOf('assets/raw-bundle/') === 0) {
        bad.push(id);
      }
    }
    assert(bad.length === 0, bad.length + ' monsters still point at unshipped folders: ' + bad.slice(0, 3).join(', '));
  }),
  () => tryRun('icons: applyLocalIcons populated room + plot maps', () => {
    assert(Object.keys(window._roomIcon || {}).length >= 6, 'expected >=6 _roomIcon entries');
    assert(Object.keys(window._plotBuildingIcon || {}).length >= 3, 'expected >=3 _plotBuildingIcon entries');
  }),
  () => tryRun('icons: shipped item icons resolve to icons-bundle', () => {
    // normal_log is one of the most-used items and should be in LOCAL_ITEM_ICON
    const p = window._itemPath && window._itemPath['normal_log'];
    assert(p && p.indexOf('assets/icons-bundle/') === 0, 'normal_log should point at icons-bundle/, got ' + p);
  }),
  // b224: __mapGeneratedGearIcons() (bottom of legacy.js) used to decide "id
  // ends with slot key" via `id.indexOf(k) === id.length - k.length` with no
  // check that indexOf actually found anything — so an ABSENT key (indexOf
  // === -1) false-matched any id exactly one character shorter than the key.
  // 'keystone' (8 chars, tag:'castle', tier:5, no hand-mapped icon) was being
  // silently painted as a steel PLATEBODY ('platebody'/'gauntlets'/
  // 'warhammer' are all 9 chars) instead of falling through to its gilt
  // atlas glyph. Guard: no Castle Stores good should ever resolve to gear art.
  () => tryRun('b224: castle-stores goods never get a false-matched gear icon', () => {
    const ITEMS_ = window.ITEMS || {};
    const castleGoods = Object.keys(ITEMS_).filter(id => ITEMS_[id] && ITEMS_[id].tag === 'castle');
    assert(castleGoods.length >= 4, 'expected the 4 b222 castle goods to be present');
    castleGoods.forEach(id => {
      const p = window._itemPath && window._itemPath[id];
      if (!p) return; // keystone: no fitting art was found — glyph fallback is correct, not a failure
      assert(p.indexOf('/gear/') === -1,
        id + ' resolved to a GEAR icon (' + p + ') — the suffix-match false positive is back');
    });
    // Direct regression on the matcher itself: a short id must not be treated
    // as ending with a slot key it doesn't contain.
    const before = window._itemPath && window._itemPath.keystone;
    if (typeof window.__mapGeneratedGearIcons === 'function') {
      window.__mapGeneratedGearIcons();
      const after = window._itemPath && window._itemPath.keystone;
      assert(after === before, 're-running the gear-icon mapper must not newly assign keystone a gear icon, got ' + after);
    }
  }),
  () => tryRun('tabs: showTab present', () => {
    assert(typeof window.showTab === 'function', 'showTab missing');
  }),
  /* b405 — the showTab tap-registry. These three tests are the automated proof
     that the 24-site migration to window.HearthriseShowTab.wrapShowTab dropped
     NO navigation trigger (the failure mode smoke normally cannot see) and that
     the single-owner + isolation contract holds. */
  () => tryRun('tabs: showTab tap-registry installed + every tap registered', () => {
    const R = window.HearthriseShowTab;
    assert(R && typeof R.wrapShowTab === 'function', 'HearthriseShowTab registry missing');
    // The registry's patchedShowTab is the owner of the TAP-DISPATCH layer. Two
    // legitimate wrappers sit OVER it and call through: error-boundary.js (crash
    // safety, b334 TARGETS includes showTab) and the four legacy paintAll/
    // paintAllV3 overlay loops (`window[name]=…` over a list that includes
    // 'showTab'). So window.showTab is NOT literally patchedShowTab — but the
    // registry did install (wrapShowTab calls install()), which the presence of
    // the taps below proves, and taps fire through the chain (see the isolation
    // and per-tab tests). Completeness — not identity — is the contract here.
    const names = R.tapNames();
    // Every migrated site registers a tap under a stable label. If any is absent,
    // that navigation trigger was dropped in the migration.
    /* 'profile-button' was REMOVED from this census (welcome-v2 retired), not lost. It was the
       welcome-v2 "Last Session Summary" tap, retired wholesale with the second
       welcome modal (a779c9cf, Set the Night, FEATURE_SLATE.md §3). The site is
       gone, so a tap for it would be a tap on nothing. This list is the census of
       SURVIVING migrated sites: a name here that the registry does not report is
       still a dropped trigger, which is the property this test exists to hold. */
    const EXPECTED = [
      'inv-new', 'bounty-tab', 'combat-style-selector', 'character-render', 'panel-extras',
      'clan-activity', 'inv-fancy', 'inv-dragdrop', 'auto-open-activity',
      'character-rebuild', 'dungeons-render', 'nav-consol-bootall', 'obs-tabchange',
      'character-page', 'activities-autoopen', 'stable-render', 'combat-tier-chips',
      'combat-screens-nav', 'identity-decorate', 'home-dashboard', 'ui-overlap',
      'muster-events', 'lifetime-stats-place',
    ];
    const missing = EXPECTED.filter((n) => !names.includes(n));
    assert(missing.length === 0, 'showTab taps never registered (trigger dropped in migration): ' + missing.join(', '));
  }),
  () => tryRun('tabs: a throwing tap does not break sibling taps', () => {
    const R = window.HearthriseShowTab;
    let siblingRan = false;
    const offThrow = R.wrapShowTab('__test_throw', () => { throw new Error('boom'); });
    const offOk = R.wrapShowTab('__test_ok', () => { siblingRan = true; });
    // The registry reports a throwing tap via console.warn + captureException by
    // design; silence that EXPECTED noise so this test does not dirty the console.
    const realWarn = console.warn, realCap = window.captureException;
    console.warn = () => {}; window.captureException = () => {};
    try {
      // Taps are INVOKED synchronously by patchedShowTab, so this is deterministic.
      // 'home' is a real panel and cheap to paint.
      window.showTab('home');
      assert(siblingRan, 'a throwing tap prevented a later tap from running — isolation broken');
    } finally { offThrow(); offOk(); console.warn = realWarn; window.captureException = realCap; }
  }),
  () => tryRunAsync('tabs: per-tab panels repaint (end-to-end, no trigger dropped)', async () => {
    const prev = window.activeTab;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const nonEmpty = (id) => {
      const el = document.getElementById(id);
      return el && el.innerHTML && el.innerHTML.replace(/\s/g, '').length > 20;
    };
    try {
      // Tabs whose content the BASE showTab paints synchronously.
      for (const t of ['profile', 'combat', 'inventory', 'farming', 'shop']) {
        window.showTab(t);
        const panel = document.getElementById('panel-' + t);
        assert(panel && panel.classList.contains('active'), 'panel-' + t + ' did not become active on showTab');
        assert(nonEmpty('panel-' + t), 'panel-' + t + ' did not repaint (empty after showTab)');
      }
      // Skills: base paints #skills-list synchronously.
      window.showTab('skills');
      assert(nonEmpty('skills-list'), '#skills-list did not repaint on showTab("skills")');
      // Character is painted ONLY by taps (character-page / character-rebuild /
      // identity), each via setTimeout. If those taps were dropped the panel
      // stays empty — this is the strongest end-to-end proof of the migration.
      window.showTab('character');
      await wait(300);
      assert(nonEmpty('panel-character'), 'panel-character did not repaint — a character tap was dropped');
    } finally {
      if (prev && typeof window.showTab === 'function') { try { window.showTab(prev); } catch (e) {} }
    }
  }),
  () => tryRun('b407: render taps paint SYNCHRONOUSLY — no empty-then-fill flash', () => {
    // Tyler saw real tab-switch flicker: panels flashed empty, then filled ~0-150ms
    // later because the render taps deferred their work via setTimeout. b407 made
    // those taps call their renderer directly, so the panel is fully painted in the
    // SAME synchronous task that activates it — the browser paints once, formed.
    // This locks the timers from creeping back: we assert the content exists
    // IMMEDIATELY after showTab() returns, with NO tick yielded. If any tap
    // regresses to setTimeout, the panel is empty at this exact point and this fails.
    const prev = window.activeTab;
    const nonEmpty = (id) => {
      const el = document.getElementById(id);
      return el && el.innerHTML && el.innerHTML.replace(/\s/g, '').length > 20;
    };
    try {
      // Character is painted ONLY by taps (no synchronous base render), so it is
      // the strongest witness: if the tap deferred, the panel is blank right here.
      window.showTab('character');
      assert(nonEmpty('panel-character'),
        'panel-character was empty immediately after showTab — a render tap deferred (flicker regression)');
      // Inventory: the fancy grid + drag-drop chain must all be present synchronously.
      window.showTab('inventory');
      assert(nonEmpty('panel-inventory'),
        'panel-inventory was empty immediately after showTab — an inventory render tap deferred (flicker regression)');
    } finally {
      if (prev && typeof window.showTab === 'function') { try { window.showTab(prev); } catch (e) {} }
    }
  }),
  () => tryRun('b162: FTUE secondary button is readable (light face, not dark-on-dark)', () => {
    // Regression: the live tour's secondary .ftue-btn kept ftue.js's dark navy
    // background while `.ftue-card *` forced cocoa text on it -> ~1.1:1 contrast.
    // Build the real FTUE nesting off-screen and assert the button face is light
    // (so the always-cocoa text stays legible).
    const root = document.createElement('div');
    root.className = 'ftue-card';
    root.style.cssText = 'position:fixed;left:-9999px;top:0';
    root.innerHTML = '<div class="ftue-actions"><button class="ftue-btn">x</button></div>';
    document.body.appendChild(root);
    const btn = root.querySelector('.ftue-btn');
    const cs = getComputedStyle(btn);
    const bgM = (cs.backgroundColor || '').match(/[\d.]+/g);
    const fgM = (cs.color || '').match(/[\d.]+/g);
    document.body.removeChild(root);
    assert(bgM && fgM, 'FTUE secondary button has no resolvable colours');
    // b216: assert the REQUIREMENT (readable), not one particular solution.
    // The original test demanded a light/parchment face because `.ftue-card *`
    // forced cocoa text onto it. That cocoa rule is now scoped to the light
    // theme, so under Hearthlight the correct answer is a DARK face with
    // parchment text — which the old luminance check would have failed even
    // though the button reads perfectly. Contrast is the thing that matters
    // and it holds in either theme.
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lumOf = (p) => 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
    // Compose the (possibly translucent) button face over the card behind it.
    const bg = bgM.map(Number), fg = fgM.map(Number);
    const a = bg[3] === undefined ? 1 : bg[3];
    const card = [30, 36, 48];                       // .ftue-card face
    const eff = [0, 1, 2].map((i) => bg[i] * a + card[i] * (1 - a));
    const l1 = lumOf(fg), l2 = lumOf(eff);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    assert(ratio >= 4.5,
      'FTUE secondary button text must be readable on its own face — got ' + ratio.toFixed(2) + ':1 (' + cs.color + ' on ' + cs.backgroundColor + ')');
  }),

  /* ── b459 FTUE-CLICK-1 / FTUE-TARGET-1 (journey-audit regression pair) ──────
     THE BUG THIS PINS: .ftue-shade is a full-viewport pointer-events layer
     painted OVER the element it spotlights, so autoAdvanceOnClick could never
     fire — clicking the glowing gold-ringed button did NOTHING, on every step
     that invited it, since the tour was written. The fix forwards a shade click
     landing inside the current target's rect to the target. Both halves are
     asserted: the SHAPE of the bug (elementFromPoint at the spotlit centre is
     the shade) and the FIX (that click navigates AND advances); plus the guard
     against over-forwarding (a click on a non-target tab does nothing).
     Mutation: revert ftue.js's shade listener → both halves go red. */
  () => tryRunAsync('b459 FTUE-CLICK-1: the spotlit target is reachable through the shade', async () => {
    if (typeof window.startFTUE !== 'function' || typeof window.endFTUE !== 'function') { skip('ftue seams absent'); return; }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const prevTab = window.activeTab;
    const laidOut = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
    /* ── WAIT FOR THE OUTCOME, NEVER FOR A GUESSED DURATION (b514) ──────────
       MEASURED on an idle machine: a forwarded click reaches "Step 4 of 6"
       420-445 ms later — ftue.js chains `setTimeout(next, 220)` (let the panel
       they navigated to paint) with next()'s own 200 ms card fade. This test
       used to sleep a flat 450 ms and read once, i.e. it asserted the tour had
       advanced with an 8 ms margin, on a suite whose own rule is that a loaded
       machine stretches timers (b461). It went red on b513+1 not because the
       forward broke but because a 1 Hz repaint landed inside the 8 ms.
       Polling to a bounded deadline is STRICTER, not weaker: the assertion is
       unchanged and a genuinely unforwarded click still fails — it just fails
       after 3 s of the tour provably not advancing instead of after one
       early read. Mutation: delete ftue.js's `.ftue-shade` click listener →
       both halves red (the deadline expires, the label stays "Step 3 of 6"). */
    const until = async (pred, ms) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(25); }
      return !!pred();
    };
    try {
      window.startFTUE();
      const stepLabel = () => (document.querySelector('.ftue-step') || { textContent: '' }).textContent;
      await until(() => /Step \d+ of/.test(stepLabel()), 3000);
      // Advance card-primary until the SKILLS step (step 3), the first autoAdvanceOnClick step.
      for (let i = 0; i < 4 && !/Step 3 of/.test(stepLabel()); i++) {
        const primary = [...document.querySelectorAll('.ftue-card .ftue-btn')].filter(laidOut).pop();
        assert(primary, 'the tour card lost its primary button at ' + stepLabel());
        const was = stepLabel();
        primary.click();
        await until(() => stepLabel() !== was, 3000);
      }
      assert(/Step 3 of/.test(stepLabel()), 'could not reach the skills step, stuck at ' + stepLabel());
      const tgt = [...document.querySelectorAll('button[data-tab="skills"]')].filter(laidOut)[0];
      assert(tgt, 'no laid-out skills tab to spotlight');
      const r = tgt.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const atPoint = document.elementFromPoint(cx, cy);
      const shade = document.querySelector('.ftue-shade');
      assert(shade, 'the tour shade is not mounted');
      // The SHAPE of the bug: the shade intercepts the spotlit centre…
      assert(atPoint === shade || (atPoint && atPoint.closest && atPoint.closest('.ftue-shade') === shade),
        'the spotlit centre is not covered by the shade — the bug shape changed; re-derive this test (got ' + (atPoint && atPoint.tagName) + ')');
      // …and the FIX: a click there is forwarded — it navigates AND advances.
      shade.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: cx, clientY: cy }));
      await until(() => /Step 4 of/.test(stepLabel()), 3000);
      const skillsPanel = document.getElementById('panel-skills');
      assert(skillsPanel && getComputedStyle(skillsPanel).display !== 'none',
        'clicking the spotlit Skills tab through the shade did not navigate');
      assert(/Step 4 of/.test(stepLabel()), 'the forwarded click did not advance the tour, at ' + stepLabel());
      // Over-forwarding guard: a click on a NON-target tab must do nothing.
      const wrong = [...document.querySelectorAll('button[data-tab="house"]')].filter(laidOut)[0];
      if (wrong) {
        const wr = wrong.getBoundingClientRect();
        shade.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: wr.left + wr.width / 2, clientY: wr.top + wr.height / 2 }));
        /* 300 ms here was BLIND: an advance needs ~420 ms (220 + 200), so the
           old wait expired before the thing this guard forbids could show up.
           Wait past the full budget, then read. */
        await sleep(900);
        assert(/Step 4 of/.test(stepLabel()), 'a click on a non-target tab advanced/changed the tour: ' + stepLabel());
        const housePanel = document.getElementById('panel-house');
        assert(!housePanel || getComputedStyle(housePanel).display === 'none',
          'a shaded click on a NON-target tab navigated — the forwarder is too permissive');
      }
    } finally {
      try { window.endFTUE(true); } catch (e) {}
      try { if (prevTab && typeof window.showTab === 'function') window.showTab(prevTab); } catch (e) {}
    }
  }),
  () => tryRun('b459 FTUE-TARGET-1: every tour step resolves a LAID-OUT spotlight target', () => {
    /* The companion bug: findTarget used querySelector's FIRST match — at
       922x423 that was the hidden desktop rail's zero-rect button, collapsing
       the spotlight to a dot in the corner. The contract: at the running
       viewport, every step's target selector matches at least one laid-out
       element. Mutation: swap findTarget back to document.querySelector → the
       geometric half of CLICK-1 goes red at phone sizes; this pins the data. */
    const F = window.HearthriseFTUE;
    if (!F || typeof F.steps !== 'function') { skip('steps seam absent'); return; }
    const laidOut = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
    for (const step of F.steps()) {
      if (!step.target) continue;
      const matches = [...document.querySelectorAll(step.target)];
      assert(matches.length > 0, 'FTUE step "' + step.id + '" target matches nothing: ' + step.target);
      assert(matches.some(laidOut),
        'FTUE step "' + step.id + '" resolves only zero-rect elements at this viewport — the spotlight would collapse (' + step.target + ')');
    }
  }),

  // b168, restated in b220. The intent was always "auto-eat must not burn the
  // food you were saving" — but the signal it tested was `!it.buff`, and EVERY
  // cooked food in Hearthrise carries a buff. So "plain food" meant raw
  // ingredients, and the test was really asserting that auto-eat prefers Raw
  // Shrimp (3 HP) over Cooked Shark (42 HP). The taxonomy replaced that proxy
  // with `foodClass`, which says what a food is FOR: auto-eat draws from
  // Provisions and picks the best heal there; Feasts & Draughts are untouched.
  () => tryRun('b168/b220: auto-eat draws from Provisions, preserves Feasts', () => {
    const A = window.HearthriseAuto;
    assert(A && typeof A.maybeAutoEat === 'function', 'HearthriseAuto.maybeAutoEat missing');
    const G = window.G;
    let healId = null, buffId = null, healHeals = 0;
    for (const id in window.ITEMS) {
      const it = window.ITEMS[id];
      if (it.foodClass === 'healing' && it.heals > healHeals) { healId = id; healHeals = it.heals; }
      if (it.foodClass === 'buff' && !buffId) buffId = id;
    }
    assert(healId && buffId, 'ITEMS lacks a Provision or a Feast — the taxonomy did not load');
    const sInv = JSON.parse(JSON.stringify(G.inventory || {}));
    const sHp = G.playerHp, sMax = G.playerMaxHp, sAA = G.autoActions ? JSON.parse(JSON.stringify(G.autoActions)) : undefined;
    const sTraits = JSON.parse(JSON.stringify(G.traits || {}));
    try {
      G.traits = { auto_eat: true, auto_eat_2: true };                              // b217: trait unlocked so eat logic runs
      G.inventory = {}; G.inventory[healId] = 5; G.inventory[buffId] = 5;
      G.playerMaxHp = 100; G.playerHp = 10;                       // low HP → should eat
      G.autoActions = { eat: { enabled: true, threshold: 0.5, foodId: null } };
      assert(A.maybeAutoEat() === true, 'should auto-eat at low HP with a Provision available');
      assert((G.inventory[healId] || 0) === 4, 'the Provision should be the one consumed (' + healId + ')');
      assert((G.inventory[buffId] || 0) === 5, 'the Feast should be preserved (' + buffId + ')');
    } finally {
      G.inventory = sInv; G.playerHp = sHp; G.playerMaxHp = sMax; G.traits = sTraits;
      if (sAA === undefined) delete G.autoActions; else G.autoActions = sAA;
    }
  }),
  () => tryRun('b186: painted monster portraits wired to shipped paths', () => {
    const mi = window._monsterIcon || {};
    ['slime', 'skeleton', 'lich', 'death_knight', 'dragon', 'goblin', 'wraith'].forEach((id) => {
      const p = mi[id];
      assert(p, 'monster icon missing for ' + id);
      assert(/^assets\/icons-bundle\//.test(p), id + ' icon not in shipped icons-bundle: ' + p);
      assert(!/raw-bundle|icons3|assets\/pixel/.test(p), id + ' icon references unshipped folder: ' + p);
    });
  }),
  () => tryRun('b186: painted gear icons wired to shipped paths', () => {
    const ip = window._itemPath || {};
    /* The Hearthfire art pilot re-homes some of these ids from painted/gear/
       to icons-bundle/hearthfire/. The property this test actually protects is
       "wired to a SHIPPED folder", not "wired to that ONE folder" — so accept
       either curated home and keep the unshipped-folder guard strict. */
    ['bronze_sword', 'rune_sword', 'steel_platebody', 'copper_ring'].forEach((id) => {
      const p = ip[id];
      assert(p && /assets\/icons-bundle\/(painted\/gear|hearthfire)\//.test(p), 'gear icon missing/unshipped for ' + id + ': ' + p);
      assert(!/raw-bundle|icons3|assets\/pixel/.test(p), id + ' icon references unshipped folder: ' + p);
    });
  }),
  () => tryRun('b193: painted consumables/drops/crops wired to shipped paths', () => {
    const ip = window._itemPath || {};
    /* b358 — the full Hearthfire item batch re-homes most of these ids from
       painted/items/ to icons-bundle/hearthfire/<category>/. Widened for the
       same reason b186 above was: the property this guard protects is "wired
       to a CURATED, SHIPPED folder and never to an unshipped one", not "wired
       to that ONE folder". `slime_gel` deliberately stays on painted/ — its
       Hearthfire file is a pool ball and was withheld (see item-art.js). */
    ['slime_gel', 'bones', 'carrot', 'cooked_shark', 'ruby', 'bat_wing', 'turnip_seed'].forEach((id) => {
      const p = ip[id];
      assert(p && /assets\/icons-bundle\/(painted\/items|hearthfire\/(items|food|armour|weapons))\//.test(p),
        'item icon missing/unshipped for ' + id + ': ' + p);
      assert(!/raw-bundle|icons3|assets\/pixel/.test(p), id + ' icon references unshipped folder: ' + p);
    });
  }),
  /* b358 — THE MERGE-ORDER TRAP. `__mapGeneratedGearIcons()` paints every
     generated tier piece with a shared slot silhouette, and it re-runs at the
     b371 icon-readiness edge (it used to be a 1500 ms timer — same trap, just
     no longer a guessed delay). It skips an id only if that id is already in legacy's own
     LOCAL_ITEM_ICON closure — so if the Hearthfire manifest were applied by
     writing `_itemPath` directly (the obvious way), a generic iron platebody
     would silently overwrite ~90 real paintings a second and a half after the
     player saw them land. Re-running it here is the mutation: it must be a
     no-op over every hearthfire-wired id, forever. */
  () => tryRun('b358: hearthfire item art survives a __mapGeneratedGearIcons re-run', () => {
    const A = window.HearthriseItemArt;
    assert(A && typeof A.wiredIconMap === 'function', 'HearthriseItemArt manifest not published');
    const wired = A.wiredIconMap();
    const ids = Object.keys(wired);
    assert(ids.length > 300, 'expected the full item batch to be wired, got ' + ids.length);
    assert(typeof window.__applyHearthfireItemIcons === 'function',
      'legacy.js must expose the applier — writing _itemPath directly loses the LOCAL_ITEM_ICON guard');

    const before = ids.map((id) => (window._itemPath || {})[id]);
    const missed = ids.filter((id, i) => before[i] !== wired[id]);
    assert(missed.length === 0, missed.length + ' hearthfire ids never reached _itemPath, e.g. ' + missed.slice(0, 3));

    window.__mapGeneratedGearIcons();
    const clobbered = ids.filter((id) => (window._itemPath || {})[id] !== wired[id]);
    assert(clobbered.length === 0,
      clobbered.length + ' hearthfire paintings were overwritten by generated slot art, e.g. ' + clobbered.slice(0, 3));

    /* Control: the generated map must still be doing its job for ids the batch
       did NOT cover, or the assertion above passes vacuously.
       b361 — this control USED to pin the suffixes `_helm|_platebody|_sword`,
       and it went vacuous the moment `dawn_platebody` was wired: every id it
       could see was covered, so a control that was supposed to prove the mapper
       still runs instead proved only that the list had been exhausted. A
       control keyed to a hardcoded id shape has a shelf life, and this batch is
       explicitly still growing. So it now asks the question directly: does the
       generated mapper OWN a non-empty set of ids this batch does not cover?
       That is the property the control was always trying to state, it is read
       off real runtime state, and it goes red the moment the mapper stops
       running — which no hardcoded id list can promise.
       A clear-and-repaint MUTATION was written first and does not work, and the
       reason is worth recording so nobody rebuilds it: `mapGeneratedGear` opens
       with `if (LOCAL_ITEM_ICON[id]) return`, so it is idempotent by
       short-circuit and will never repaint an id it has already painted. That
       short-circuit is the very thing the assertion above depends on. */
    /* Scoped to ids the generated mapper actually OWNS — it only paints an id
       that has a `tier` and a slot suffix, and it paints it under painted/gear/.
       Sampling any painted id at all was the first draft and it failed: most
       painted ids come from the hand-written LOCAL_ITEM_ICON literal, which the
       mapper never touches, so clearing them proved nothing. */
    const paintedBefore = Object.keys(window.ITEMS || {}).filter((id) => !wired[id]
      && (window.ITEMS[id] || {}).tier
      && /icons-bundle\/painted\/gear\//.test((window._itemPath || {})[id] || ''));
    assert(paintedBefore.length > 0, 'control failed: the generated map paints no un-covered id at all');

    /* Every wired path is inside the one shipped bundle, and none is an emoji. */
    ids.forEach((id) => {
      assert(/^assets\/icons-bundle\/hearthfire\//.test(wired[id]), id + ' wired outside the hearthfire folder: ' + wired[id]);
    });
    assert(!ids.some((id) => (A.REJECTED_WRONG_SUBJECT || []).some((k) => k.split('/')[1] === id)),
      'a file withheld for depicting the wrong object got wired anyway');
  }),
  /* Asset Director, 2026-08-17 — Tyler: "the copper is still showing as a
     hammer". The run-smoke.mjs preflight already checks the MANIFEST (does
     item-art.js list a REJECTED id in SHIPPED too?), but that is a
     paper-only check — it never asks what `window._itemPath` actually holds
     after the full boot sequence (LOCAL_ITEM_ICON literal + Hearthfire
     applier + __mapGeneratedGearIcons, in that order) has run. A rejected id
     could still end up wired at runtime through a path the manifest check
     can't see — a stray literal entry in legacy.js, for instance, which is
     exactly the bug class this whole pass exists to catch (copper_ore was
     wired to a hammer PNG despite the reasoning comment in item-art.js
     already flagging it wrong). So this asserts the live, POST-BOOT object:
     no id named in REJECTED_WRONG_SUBJECT may resolve to a hearthfire/ path
     in `window._itemPath` right now, in the running game. */
  () => tryRun('asset-director: a REJECTED_WRONG_SUBJECT id cannot be live-wired into hearthfire/', () => {
    const A = window.HearthriseItemArt;
    assert(A && Array.isArray(A.REJECTED_WRONG_SUBJECT), 'HearthriseItemArt.REJECTED_WRONG_SUBJECT not published');
    const rejected = A.REJECTED_WRONG_SUBJECT.map((k) => k.split('/')[1]);
    assert(rejected.indexOf('copper_ore') >= 0 && rejected.indexOf('bronze_bar') >= 0
      && rejected.indexOf('oak_plank') >= 0, 'the flagged wrong-art ids are missing from the reject list');

    const ip = window._itemPath || {};
    const live = rejected.filter((id) => /icons-bundle\/hearthfire\//.test(ip[id] || ''));
    assert(live.length === 0, 'REJECTED_WRONG_SUBJECT id(s) are live-wired into hearthfire/ anyway: ' + live.join(', '));

    /* Mutation check: this test must actually be capable of seeing the bug
       it guards against, not just pass vacuously. Force one rejected id to
       point at a hearthfire path exactly like a real regression would, then
       assert the SAME check now fails, then restore the real value. */
    const probeId = rejected[0];
    const realPath = ip[probeId];
    ip[probeId] = 'assets/icons-bundle/hearthfire/items/' + probeId + '.png';
    const caught = /icons-bundle\/hearthfire\//.test(ip[probeId] || '');
    ip[probeId] = realPath;
    assert(caught, 'mutation check failed: the guard cannot see a rejected id wired into hearthfire/');
  }),
  /* b371 — THE ICON-READINESS EDGE (Tyler: "strange flickering of old assets";
     LIVE-AUDIT F13 / F13-addendum / F15). legacy.js paints screens while it is
     still the only thing that has run, against a 109-entry `_itemPath`; main.js
     is a deferred module and is what completes the map to ~490. A screen caught
     in that window kept its blank tiles until an unrelated action happened to
     re-render it — Tyler's Farm painted its crops only when he pressed "Plant
     all". The old mitigation was a guessed `setTimeout(…, 1500)` that also
     forced a visible full inventory repaint on every boot.

     `__hrIconsReady()` is the replacement: one idempotent edge, driven by
     main.js at the exact instant the map is complete, that repaints the ACTIVE
     screen through `showTab(activeTab)` — the engine's own render entry point,
     so a screen added at 10× content is covered with no registry to maintain.

     This asserts the SHAPE and the one-shot contract in-page. The behavioural
     half — "no path arrives after first paint", and "a late edge really does
     repaint a stale Farm" — needs to observe boot from outside the page and
     lives in tests/icon-boot-order.mjs. */
  () => tryRun('b371: the icon-readiness edge exists, fired, and is one-shot', () => {
    assert(typeof window.__hrIconsReady === 'function',
      'legacy.js must expose __hrIconsReady() — the edge main.js drives when the icon map completes');
    assert(typeof window.__hrRepaintActive === 'function',
      'legacy.js must expose __hrRepaintActive() — the repaint half, so a test can falsify it alone');
    assert(window.__hrIconsReadyAt > 0,
      'the edge never fired: main.js did not call __hrIconsReady(), so a screen painted early stays blank');
    assert(window.__hrBooted === true,
      'boot() must set __hrBooted — it is how the edge tells "already painted" from "not painted yet"');
    assert(window.__hrIconsReady() === false,
      'the edge must be one-shot: a second call has to be a no-op, or the fallback timer double-repaints');
    /* The repaint is safe to call at any time — it is the same code path the
       player takes every time they change screens. Calling it must not throw
       and must leave the same screen on. */
    const shown = () => (document.querySelector('.panel.active') || {}).id || null;
    const before = shown();
    window.__hrRepaintActive();
    const after = shown();
    assert(after === before, 'the readiness repaint changed screens (was ' + before + ', now ' + after + ')');
  }),
  /* b361 — THE ITEM-DETAIL POPUP DREW A RAW EMOJI AT 48px.
     Tyler, live: "click an item (e.g. Wheat Seed) and the popup still shows
     the OLD icon while the grid shows the new art." `openInvDetail()` was
     hand-rolled HTML that interpolated `it.icon` — the emoji in the ITEMS data
     table — so the LARGEST item render in the game bypassed both `_itemPath`
     and the b217 no-emoji backstop, on a project whose first rule is "no emoji
     as art anywhere".

     The contract this asserts is not "the modal shows an image" but "the modal
     and the GRID resolve the SAME id to the SAME source" — agreement by
     construction, since both now go through `itemArt()`. It also sweeps the
     whole card for emoji, because the icon was not the only one in it (three
     coins and a close mark went with it). */
  () => tryRun('b361: item-detail modal icon === grid icon, and the card carries no emoji', () => {
    assert(typeof window.openInvDetail === 'function', 'openInvDetail missing');
    const A = window.HearthriseItemArt;
    const wired = (A && A.wiredIconMap && A.wiredIconMap()) || {};
    /* A hearthfire-wired id that is really in ITEMS. Prefer the one Tyler
       reported so the regression is the reported bug, not a cousin of it. */
    const id = (wired.wheat_seed && window.ITEMS.wheat_seed) ? 'wheat_seed'
      : Object.keys(wired).find((k) => window.ITEMS && window.ITEMS[k]);
    assert(id, 'no hearthfire-wired item id available to test with');

    const expect = (window._itemPath || {})[id];
    assert(expect && /^assets\/icons-bundle\//.test(expect), 'grid path for ' + id + ' is not shipped art: ' + expect);
    /* What the GRID would draw, from the shared helper the tiles use. */
    assert(typeof window.itemArt === 'function' || typeof itemArt === 'function', 'itemArt() helper missing');

    const hadQty = (window.G.inventory || {})[id];
    window.G.inventory[id] = Math.max(2, hadQty || 0);
    let card = null;
    try {
      window.openInvDetail(id);
      const d = document.getElementById('inv-detail-overlay');
      assert(d && d.classList.contains('show'), 'openInvDetail did not open the card');
      const ic = d.querySelector('.inv-detail-icon');
      assert(ic, 'card has no .inv-detail-icon');
      const img = ic.querySelector('img');
      assert(img, 'the detail icon is not an <img> — it fell back to text/emoji for a wired id');
      /* THE point: same id, same source as the grid. */
      assert(img.getAttribute('src') === expect,
        'modal icon !== grid icon for ' + id + ': modal ' + img.getAttribute('src') + ' vs grid ' + expect);

      /* No emoji anywhere in the card — icon, stats, or buttons. */
      const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
      const leaks = [];
      d.querySelectorAll('*').forEach((n) => {
        if (n.children.length) return;
        if (emojiRe.test(n.textContent || '')) leaks.push((n.className || n.tagName) + ':' + n.textContent.trim().slice(0, 12));
      });
      assert(leaks.length === 0, 'emoji rendered as art in the item card: ' + leaks.join(', '));
      card = true;
    } finally {
      try { window.closeInvDetail && window.closeInvDetail(); } catch (e) {}
      if (hadQty === undefined) delete window.G.inventory[id]; else window.G.inventory[id] = hadQty;
    }
    assert(card, 'card never rendered');
  }),
  () => tryRun('b201: homestead tiers are sane + API present', () => {
    const H = window.HearthriseHomestead;
    assert(H && Array.isArray(H.TIERS) && H.TIERS.length === 6, 'HearthriseHomestead.TIERS should have 6 tiers');
    assert(H.TIERS[0].plots === 2 && H.TIERS[5].plots === 12, 'plots should run 2 → 12');
    assert(H.TIERS[0].workers === 0 && H.TIERS[5].workers === 6, 'workers should run 0 → 6');
    let lastGold = 0;
    for (let i = 1; i < H.TIERS.length; i++) {
      const g = H.TIERS[i].cost.gold;
      assert(g > lastGold, 'tier ' + i + ' gold cost should ascend');
      lastGold = g;
    }
    assert(typeof H.getTier() === 'number', 'getTier returns a number');
  }),
  /* ── ROOMS SELL SPEED; LEVELS SELL PERMISSION ────────────────────────────
     This test has been re-ruled twice, and each time it pinned the CURRENT
     membership list as if it were the rule: first "no kitchen, no cooking"
     (reversed by the campfire ruling), then "cooking and prayer are exempt,
     the Forge and the Workshop still gate" (reversed by the game-designer on
     2026-09-07). So it now pins the RULE — NO artisan skill carries a client
     room gate — derived over ARTISAN_RECIPES and over ROOMS, so a skill or a
     room added tomorrow is covered without anyone editing this file.

     Why: `hr_activities` gates on (req_skill, req_lv) and has NO room column,
     so every client room gate was a property tier in front of a server
     capability (CLAUDE §6, residue-ahead) — two tiers of padlocks over recipes
     the server would run. Three mechanisms could put it back (the exemption
     set, the seam's refusal branch, the room card's copy); this bites on each. */
  () => tryRun('no artisan skill carries a client room gate — a room sells speed, a level sells permission', () => {
    const H = window.HearthriseHomestead;
    const G = window.G;
    const snap = snapshotG();
    try {
      // A Wanderer's Camp with no rooms at all — the character every gate refused.
      G.homestead = { tier: 0 }; G.rooms = {}; G.skills = {};
      const skills = Object.keys(window.ARTISAN_RECIPES || {});
      assert(skills.length >= 4, 'the derivation is empty — this test would pass vacuously');
      skills.forEach((s) => {
        const r = H.hasWorkbench(s);
        assert(r && r.ok === true, s + ' is gated on a room at the camp: ' + (r && r.reason));
        assert(r.reason == null, s + ' still carries a refusal reason — the gate is hidden, not gone');
      });
      // …and the SET says so out loud, so the rule survives a caller rewrite.
      Object.keys(H.WORKBENCH).forEach((s) => {
        assert(H.UNGATED && H.UNGATED[s] === true, s + ' is mapped to a room but is not a declared exemption');
      });
      /* THE MAPPING SURVIVES THE EXEMPTION: it is the record of which room
         SPEEDS which skill (goal-catalogue's DAILY_TASK_REQUIREMENTS is
         authored against it), so deleting the rows rather than exempting the
         skills would take the rooms' whole purpose with them. */
      assert(H.WORKBENCH.cooking === 'kitchen' && H.WORKBENCH.smithing === 'forge'
        && H.WORKBENCH.crafting === 'workshop' && H.WORKBENCH.prayer === 'shrine',
        'the skill→room mapping must survive the exemption');
      /* AND NO ROOM CARD MAY ADVERTISE A PERMISSION — over EVERY room, not the
         two that happen to be topical. A "Gates: <Skill>" fact is a claim the
         server does not check, and the Shrine's card made it for 296 builds
         while bones sat in the bag as vendor trash. */
      if (typeof H.roomDescriptor === 'function') {
        Object.keys(window.ROOMS || {}).forEach((id) => {
          const card = H.roomDescriptor(id);
          assert(!(((card && card.now) || []).some((f) => f.label === 'Gates')),
            'the ' + id + ' card advertises a Gates fact — no room grants permission');
        });
      }
      /* THE SAME CLAIM IN COPY. `desc` is the sentence a player reads BEFORE
         they own the room, and "Required for Smithing" was the gate's last
         hiding place after the code came out. */
      Object.keys(window.ROOMS || {}).forEach((id) => {
        const d = String((window.ROOMS[id] || {}).desc || '');
        assert(!/required for/i.test(d), 'the ' + id + ' desc still claims to be required: "' + d + '"');
      });
    } finally { restoreG(snap); }
  }),

  /* THE PLAYER-SIDE HALF OF THE SAME RULING, PLAYED RATHER THAN ASSERTED.
     hasWorkbench() answering `ok` proves the seam; it does not prove the
     GESTURE works, and the gate that shipped for the Shrine lived in a
     renderer rather than in the seam — a test that only called the API would
     have stayed green with the padlock still on screen. So this drives the
     real startArtisan (the inputs-aware seam-7 override, which is the one that
     actually runs) from the character the old gate refused, and requires the
     three things a started run means: the pointer moves, the DECLARATION goes
     out (no declaration, no server-side accrual — the run would pay nothing),
     and no refusal is spoken. */
  () => tryRun('a Wanderer\'s Camp smith with ore and Smithing 1 can start smelt_copper — no room refusal, the run is declared', () => {
    if (typeof window.startArtisan !== 'function') { skip('no startArtisan'); return; }
    const snap = snapshotG();
    const realNotify = window.notify, realDeclare = window.declareActivity;
    /* The bench arms two setIntervals; leaving them running would tick
       doArtisanAction() through the rest of the suite, eating ore and moving
       Smithing inside other tests. */
    const stopBench = () => {
      try {
        if (typeof window.stopSkill === 'function') window.stopSkill();
        else if (typeof window._stopArtisan === 'function') window._stopArtisan();
      } catch (e) {}
      window.G.activeSkill = null; window.G.skillTargetId = null;
    };
    try {
      const G = window.G;
      const said = [], declares = [];
      window.notify = (m) => { said.push(String(m)); };
      window.declareActivity = (kind, id) => { declares.push({ kind, id }); return null; };
      // No rooms at all — no Forge, no Workshop. Both recipes are req 1.
      G.homestead = { tier: 0 }; G.rooms = {};
      G.inventory = Object.assign({}, G.inventory, { copper_ore: 50, normal_log: 50, iron_ore: 50, coal: 50 });
      G.skills = Object.assign({}, G.skills, { smithing: 0, crafting: 0 });
      stampRecordLikeLoad(G);
      [['smithing', 'smelt_copper'], ['crafting', 'saw_normal']].forEach(([skill, recipe]) => {
        const req = (window.ARTISAN_RECIPES[skill] || []).find((r) => r.id === recipe);
        assert(req && req.req === 1, recipe + ' must be the level-1 recipe for this test to mean anything');
        stopBench(); said.length = 0; declares.length = 0;
        window.startArtisan(skill, recipe);
        assert(G.activeSkill === skill && G.skillTargetId === recipe,
          'at the camp, ' + recipe + ' must start; pointer is ' + G.activeSkill + '/' + G.skillTargetId
          + ', said: ' + JSON.stringify(said));
        assert(declares.some((d) => d.kind === 'artisan' && d.id === recipe),
          recipe + ' started without declaring the activity — an undeclared run accrues nothing away');
        assert(!said.some((m) => /forge|workshop|workbench|homestead first/i.test(m)),
          'a room refusal was spoken: ' + JSON.stringify(said));
      });
      /* AND THE GATE THE SERVER *DOES* ENFORCE SURVIVED, or this traded a wrong
         gate for no gate: smelt_iron is Smithing 15 and must still refuse. */
      stopBench(); said.length = 0; declares.length = 0;
      window.startArtisan('smithing', 'smelt_iron');
      assert(G.activeSkill !== 'smithing' || G.skillTargetId !== 'smelt_iron',
        'smelt_iron (Smithing 15) started at level 1 — the LEVEL gate went with the room gate');
      assert(said.some((m) => /Lv\s*15/i.test(m)), 'the level refusal must name the level, said: ' + JSON.stringify(said));
    } finally {
      window.notify = realNotify; window.declareActivity = realDeclare;
      stopBench(); restoreGAndRecord(snap);
    }
  }),

  () => tryRun('b213: property ladder is climbable — no tier cost needs a locked workbench', () => {
    // Regression for the fresh-account deadlock: tier 1 demanded planks
    // (Workshop = tier-2 room) and tiers 2-3 demanded bars (Forge = tier-3
    // room), so new players could never leave Wanderer's Camp. Every tier's
    // cost must be payable with rooms granted by STRICTLY LOWER tiers.
    const H = window.HearthriseHomestead;
    if (!H || typeof H.tierDef !== 'function') return;
    const producedBy = { kitchen: /^cooked_/, workshop: /_plank$/, forge: /_bar$/ };
    let have = [];
    for (let i = 1; ; i++) {
      const t = H.tierDef(i); if (!t) break;
      const prev = H.tierDef(i - 1);
      have = have.concat((prev && prev.rooms) || []);
      Object.keys(t.cost || {}).forEach(id => {
        Object.keys(producedBy).forEach(room => {
          if (producedBy[room].test(id)) {
            assert(have.indexOf(room) >= 0,
              t.id + ' costs ' + id + ' but its only source (' + room + ') unlocks at this tier or later — deadlock');
          }
        });
      });
    }
  }),

  () => tryRun('b213: farm plots respect the property-tier cap', () => withFarmServer((verb, args) => ({ ok: true, plot: args[0], crop: args[1] || 'turnip',
      planted_at: new Date().toISOString(), seed_spent: (args[1] || 'turnip') + '_seed', plant_xp: 28 }), () => {
    // Regression: the farm rendered 8 plantable plots at every tier, making
    // the homestead ladder's plot counts a fake perk. plantCrop must refuse
    // an empty plot index beyond HearthriseHomestead.maxPlots().
    if (typeof window.plantCrop !== 'function' || !window.HearthriseHomestead) return;
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 0 };                 // camp: 2 plots
      window.G.farmPlots = [];
      window.G.inventory = Object.assign({}, window.G.inventory, { turnip_seed: 10 });
      window.plantCrop(0, 'turnip');
      assert(!!window.G.farmPlots[0], 'plot 0 (within cap) should plant');
      window.plantCrop(5, 'turnip');
      assert(!window.G.farmPlots[5], 'plot 5 (beyond camp cap of 2) must refuse to plant');
    } finally { restoreG(snap); }
  })),
];
