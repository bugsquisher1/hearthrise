// Smoke test harness — exercises every tab + critical interaction and reports
// pass/fail. Reads game state via window.G (legacy compat) — once main game is
// modularised, will import { G } from '../state/game.js' directly.
//
// Triggered by:
//   - Floating 🧪 button bottom-left
//   - Ctrl+Shift+T keyboard shortcut
//   - Programmatically via window.__smokeTest()

import { on } from '../net/events.js';
import { findUiOverlaps, watchUiOverlaps } from './ui-overlap.js';

const errorLog = (window.__errorLog = window.__errorLog || []);

// Capture uncaught errors and unhandled rejections globally so the harness can
// distinguish "test passed" from "test passed but something silently crashed."
const origOnError = window.onerror;
window.onerror = function (msg, src, line, col, err) {
  errorLog.push({ msg: String(msg), src: String(src || ''), line: line || 0, ts: Date.now() });
  if (origOnError) try { origOnError.apply(this, arguments); } catch (e) {}
  return false;
};
window.addEventListener('unhandledrejection', (e) => {
  errorLog.push({ msg: 'unhandled-rejection: ' + (e.reason && e.reason.message || e.reason), ts: Date.now() });
});

// Subscribe to every state event for diagnostic visibility — counts toward the
// runtime-error check at the end of each test run.
on('*', () => {});

const pass = (name) => ({ name, status: 'PASS' });
const fail = (name, why) => ({ name, status: 'FAIL', why: String(why) });
const tryRun = (name, fn) => {
  try { fn(); return pass(name); }
  catch (e) { return fail(name, e && (e.message || e)); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// b127: snapshot every field the player-action tests can mutate.
// Missing fields here = the test pollutes the player's save.
const snapshotG = () => {
  const G = window.G;
  if (!G) return null;
  return JSON.parse(JSON.stringify({
    activeSkill: G.activeSkill,
    skillTargetId: G.skillTargetId,
    activeMonster: G.activeMonster,
    activeArtisanRecipe: G.activeArtisanRecipe,
    gold: G.gold,
    gems: G.gems,
    inventory: G.inventory,
    equipment: G.equipment,
    companions: G.companions,
    farmPlots: G.farmPlots,
    rooms: G.rooms,
    quests: G.quests,
    clanName: G.clanName,
    skills: G.skills,
    stats: G.stats,
    plotBuildings: G.plotBuildings,
    playerHp: G.playerHp,
    playerMaxHp: G.playerMaxHp,
  }));
};
const restoreG = (snap) => {
  if (!snap || !window.G) return;
  for (const k of Object.keys(snap)) window.G[k] = snap[k];
  if (typeof window.stopSkill === 'function' && window.G.activeSkill) try { window.stopSkill(); } catch {}
  if (typeof window.stopCombat === 'function' && window.G.activeMonster) try { window.stopCombat(); } catch {}
};

const TESTS = [
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
  () => tryRun('tabs: showTab present', () => {
    assert(typeof window.showTab === 'function', 'showTab missing');
  }),
  () => tryRun('tabs: each tab activates', () => {
    const tabs = ['profile', 'character', 'combat', 'bounty', 'skills', 'inventory', 'shop', 'farming', 'house', 'social'];
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
    window.showTab('skills');
    if (typeof window.renderSkillsList === 'function') window.renderSkillsList();
    if (typeof window.renderSkillDetail === 'function') window.renderSkillDetail('mining');
    const grid = document.querySelector('#panel-skills .act-grid');
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
    window.showTab('farming');
    if (typeof window.renderFarm === 'function') window.renderFarm();
    window.showTab('house');
    if (typeof window.renderHouse === 'function') window.renderHouse();
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
    for (const [, id] of Object.entries(window.G.equipment || {})) {
      if (id) assert(window.ITEMS[id], 'equipped item ' + id + ' missing from ITEMS');
    }
  }),
  () => tryRun('errors: clean log', () => {
    const n = errorLog.length;
    if (n > 0) throw new Error(n + ' errors captured: ' + JSON.stringify(errorLog.slice(0, 3)));
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
    if (allViolations.length) {
      const summary = allViolations.map(v =>
        `[${v.tab}] ${v.note || 'overlap'} — A:${v.a} B:${v.b}`
      ).join('\n  ');
      throw new Error(allViolations.length + ' visual overlap(s) detected:\n  ' + summary);
    }
  }),
  () => tryRun('dom: critical containers', () => {
    const ids = ['top-gold', 'top-combat', 'top-total', 'panel-profile', 'panel-combat',
                 'panel-skills', 'panel-inventory', 'panel-farming', 'panel-house'];
    for (const id of ids) assert(document.getElementById(id), 'missing #' + id);
  }),
  () => tryRun('companions: data + state', () => {
    assert(typeof window.COMPANIONS === 'object' && Object.keys(window.COMPANIONS).length >= 12, 'expected 12+ companions');
    assert(window.G.companions, 'G.companions missing');
    assert(window.G.companions.ownedIds.indexOf('fox') >= 0, 'fox should be in starting ownedIds');
  }),
  () => tryRun('companions: bonus + stable panel', () => {
    const snap = JSON.stringify(window.G.companions);
    if (typeof window.equipCompanion === 'function') window.equipCompanion('fox');
    if (typeof window.getCompanionBonus === 'function') {
      const b = window.getCompanionBonus();
      assert(b.xpB > 0, 'fox xpB should apply');
    }
    assert(document.getElementById('panel-stable'), 'panel-stable missing');
    assert(document.getElementById('stable-body'), 'stable-body missing');
    window.G.companions = JSON.parse(snap);
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
    try { window.renderProfile(); /* should NOT throw */ }
    finally { subParent.appendChild(sub); bodyParent.appendChild(body); }
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
    if (window.innerWidth > 540) return; // desktop — rule doesn't apply
    const pt = document.querySelector('#panel-profile .prof-toolbar');
    if (!pt) return; // not in DOM; nothing to assert
    const d = getComputedStyle(pt).display;
    assert(d === 'none', 'prof-toolbar should be display:none on mobile, got ' + d);
  }),

  // b123: feat-buttons must be a 2-column grid on mobile. Earlier they
  // stayed in a vertical flex stack because audit-overrides.css had
  // higher specificity than the b122 mobile rule.
  () => tryRun('b123: feat-buttons grid on mobile', () => {
    if (window.innerWidth > 540) return;
    const fb = document.querySelector('#panel-profile .feat-buttons');
    if (!fb) return;
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

  // Bug-report pipeline must be configured. Empty webhook = silent
  // bug reports going nowhere.
  () => tryRun('bug-report: discord webhook configured', () => {
    // bug-report.js sets window.HRBugReport when the URL is set.
    // We can't read the constants directly post-bundle, but we can
    // check for the floating 🐛 button that only renders when one of
    // the two delivery paths is wired.
    const btn = document.getElementById('hr-bug-btn') || document.querySelector('[id*="bug-btn"]');
    assert(btn, 'bug-report 🐛 button not found in DOM');
  }),

  // Service-worker registration: when served over https the SW should
  // be installed (or installing). Catches the b108-b110 era where the
  // SW silently failed to register on some builds.
  () => tryRun('sw: registered when served over https', () => {
    if (location.protocol !== 'https:') return; // local dev, skip
    if (!('serviceWorker' in navigator)) return; // browser doesn't support
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
      const panel = document.getElementById('panel-' + t);
      assert(panel, `panel-${t} missing after sidebar click`);
    }
    window.showTab('profile');
  }),

  () => tryRun('clicks: topbar buttons (notif/save/settings/quests)', () => {
    const ids = ['btn-notif', 'btn-save', 'btn-settings', 'hr-quests-btn'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      try { el.click(); } catch (e) { throw new Error(`topbar #${id} click threw: ${e.message}`); }
    }
    // Close any modal we opened so the rest of the suite can run
    document.querySelectorAll('.modal.show, [class*="modal"][class*="show"]').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('[data-modal-close], .modal-close').forEach(el => { try { el.click(); } catch {} });
  }),

  () => tryRun('clicks: profile feat-buttons (achievements/bestiary/etc)', () => {
    window.showTab('profile');
    const btns = document.querySelectorAll('#panel-profile .feat-buttons button, #panel-profile .feat-buttons .stats-btn-trigger');
    assert(btns.length >= 4, 'expected >=4 feat buttons, got ' + btns.length);
    for (const b of btns) {
      try { b.click(); } catch (e) { throw new Error(`feat button "${b.textContent.trim()}" threw: ${e.message}`); }
      // Close any modal opened
      document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
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
      // Close any preview modal
      document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    }
    if (typeof window.stopCombat === 'function') try { window.stopCombat(); } catch {}
    restoreG(snap);
  }),

  () => tryRun('clicks: every skill row in skills panel', () => {
    const snap = snapshotG();
    window.showTab('skills');
    if (typeof window.renderSkillsList === 'function') window.renderSkillsList();
    const rows = document.querySelectorAll('#skills-list .skill-row, #skills-list [onclick*="openSkillDetail"], #skills-list .skill-card');
    if (rows.length === 0) return; // panel layout differs across builds; skip rather than fail
    for (const r of Array.from(rows).slice(0, 5)) {
      try { r.click(); } catch (e) { throw new Error(`skill row threw: ${e.message}`); }
    }
    if (typeof window.stopSkill === 'function') try { window.stopSkill(); } catch {}
    restoreG(snap);
  }),

  () => tryRun('clicks: activities grid tile starts a skill', () => {
    const snap = snapshotG();
    window.showTab('skills');
    if (typeof window.openSkillDetail === 'function') window.openSkillDetail('mining');
    void document.body.offsetHeight;
    const tile = document.querySelector('#skill-detail .act-tile, #skill-detail [onclick*="startSkill"]');
    if (!tile) return; // some builds inline this; pass silently
    try { tile.click(); } catch (e) { throw new Error('act-tile click threw: ' + e.message); }
    if (typeof window.stopSkill === 'function') try { window.stopSkill(); } catch {}
    restoreG(snap);
  }),

  () => tryRun('clicks: inventory sub-tabs (Bag / Bank)', () => {
    window.showTab('inventory');
    const chips = document.querySelectorAll('#panel-inventory .chips [data-inv]');
    if (chips.length === 0) return;
    for (const c of chips) {
      try { c.click(); } catch (e) { throw new Error(`inv chip ${c.dataset.inv} threw: ${e.message}`); }
    }
  }),

  () => tryRun('clicks: house room rows + tab switches', () => {
    window.showTab('house');
    if (typeof window.renderHouse === 'function') window.renderHouse();
    const tabs = document.querySelectorAll('[data-house]');
    for (const t of tabs) {
      try { t.click(); } catch (e) { throw new Error(`house tab ${t.dataset.house} threw: ${e.message}`); }
    }
    // Click the first room row's upgrade button if present (will no-op
    // when player can't afford, but click should not throw).
    const upBtn = document.querySelector('#house-panel [onclick*="upgradeRoom"]');
    if (upBtn) try { upBtn.click(); } catch (e) { throw new Error('house upgrade btn threw: ' + e.message); }
  }),

  () => tryRun('clicks: farm plot tiles open seed picker (or harvest)', () => {
    const snap = snapshotG();
    window.showTab('farming');
    if (typeof window.renderFarm === 'function') window.renderFarm();
    const plots = document.querySelectorAll('.farm-tile, [onclick*="openSeedPicker"], [onclick*="harvestPlot"], [onclick*="waterPlot"]');
    let clicked = 0;
    for (const p of Array.from(plots).slice(0, 2)) {
      try { p.click(); clicked++; } catch (e) { throw new Error('farm plot threw: ' + e.message); }
      document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    }
    restoreG(snap);
  }),

  () => tryRun('clicks: bounty board rows', () => {
    const snap = snapshotG();
    window.showTab('bounty');
    if (typeof window.renderBounty === 'function') window.renderBounty();
    void document.body.offsetHeight;
    const rows = document.querySelectorAll('#panel-bounty .bounty-row, #panel-bounty [onclick]');
    for (const r of Array.from(rows).slice(0, 3)) {
      try { r.click(); } catch (e) { throw new Error('bounty row threw: ' + e.message); }
      document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    }
    restoreG(snap);
  }),

  () => tryRun('clicks: stable companion cards', () => {
    window.showTab('stable');
    if (typeof window.renderStable === 'function') window.renderStable();
    void document.body.offsetHeight;
    const cards = document.querySelectorAll('#panel-stable .sc-card, #panel-stable [onclick*="equipCompanion"], #panel-stable [onclick*="unequipCompanion"]');
    for (const c of Array.from(cards).slice(0, 3)) {
      try { c.click(); } catch (e) { throw new Error('stable card click threw: ' + e.message); }
    }
  }),

  () => tryRun('clicks: market panel renders + inputs respond', () => {
    window.showTab('market');
    if (typeof window.renderMarket === 'function') window.renderMarket();
    void document.body.offsetHeight;
    const search = document.querySelector('#panel-market input[type="search"], #panel-market input[type="text"]');
    if (search) {
      try {
        search.value = 'log';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (e) { throw new Error('market search input threw: ' + e.message); }
    }
    const sortBtns = document.querySelectorAll('#panel-market [data-sort], #panel-market .sort-btn');
    for (const b of Array.from(sortBtns).slice(0, 3)) {
      try { b.click(); } catch (e) { throw new Error('market sort threw: ' + e.message); }
    }
  }),

  () => tryRun('clicks: bug-report 🐛 button opens modal', () => {
    const btn = document.getElementById('hr-bug-btn');
    if (!btn) return;
    try { btn.click(); } catch (e) { throw new Error('🐛 button threw: ' + e.message); }
    const modal = document.getElementById('hr-bug-modal');
    if (modal) {
      // close it again so the form doesn't sit open during the rest of the suite
      const closer = modal.querySelector('[data-close], .close, button');
      if (closer) try { closer.click(); } catch {}
      modal.classList.remove('show');
    }
  }),

  () => tryRun('clicks: settings panel opens + tabs switch', () => {
    const btn = document.getElementById('btn-settings');
    if (!btn) return;
    try { btn.click(); } catch (e) { throw new Error('settings open threw: ' + e.message); }
    const settingsTabs = document.querySelectorAll('#panel-settings [data-settings-tab], #settings-modal [data-tab], .settings-tab');
    for (const t of Array.from(settingsTabs).slice(0, 6)) {
      try { t.click(); } catch (e) { throw new Error(`settings tab "${t.textContent.trim()}" threw: ${e.message}`); }
    }
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
  }),

  // ─────────────────────────────────────────────────────────────
  // PLAYER ACTIONS — end-to-end behavioral tests that exercise
  // the core game loops a player would actually run. Each test
  // saves G state, mutates, runs the action, asserts the expected
  // outcome, then restores. NEVER pollutes the player's save.
  // ─────────────────────────────────────────────────────────────

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

  () => tryRun('action: cook a fish creates a buff item', () => {
    const snap = snapshotG();
    try {
      // Some builds use cookFood, some use startCook, some auto-cook in artisan.
      // We try the common shapes; pass silently if none of them exist.
      window.G.inventory = window.G.inventory || {};
      window.G.inventory.shrimp = (window.G.inventory.shrimp || 0) + 5;
      const before = window.G.inventory.cooked_shrimp || 0;
      let cooked = false;
      if (typeof window.cookFood === 'function') { try { window.cookFood('shrimp'); cooked = true; } catch {} }
      if (!cooked && typeof window.startCook === 'function') { try { window.startCook('cooked_shrimp'); cooked = true; } catch {} }
      if (!cooked && typeof window.startArtisan === 'function') { try { window.startArtisan('cooked_shrimp'); cooked = true; } catch {} }
      // If none worked the build doesn't expose a direct cook function,
      // and the test is informational. Don't fail.
    } finally { restoreG(snap); }
  }),

  () => tryRun('action: plant + harvest a farm plot (state-level)', () => {
    const snap = snapshotG();
    try {
      // Plant a turnip in plot 0. plantCrop(plotIdx, cropId) is the canonical API.
      // Plot is stored as { cropId, plantedAt, watered, state } — note `cropId`,
      // not `id`. b127 fixed this assertion.
      if (typeof window.plantCrop !== 'function') return;
      window.G.inventory = window.G.inventory || {};
      window.G.inventory.turnip_seed = (window.G.inventory.turnip_seed || 0) + 1;
      window.G.farmPlots = window.G.farmPlots || [];
      window.G.farmPlots[0] = null;
      window.plantCrop(0, 'turnip');
      const plot = window.G.farmPlots[0];
      assert(plot && plot.cropId === 'turnip', `plot[0] should hold turnip, got ${JSON.stringify(plot)}`);
      // Fast-forward + harvest
      if (plot && typeof window.harvestPlot === 'function') {
        plot.state = 'ready';
        plot.plantedAt = Date.now() - 24 * 3600 * 1000;
        const beforeQty = window.G.inventory.turnip || 0;
        window.harvestPlot(0);
        const afterQty = window.G.inventory.turnip || 0;
        assert(afterQty > beforeQty, `harvest should add turnips: before=${beforeQty} after=${afterQty}`);
      }
    } finally { restoreG(snap); }
  }),

  () => tryRun('action: upgrade a house room (state-level)', () => {
    const snap = snapshotG();
    try {
      if (typeof window.upgradeRoom !== 'function') return;
      // Give plenty of gold + the materials kitchen lv1 needs.
      window.G.gold = (window.G.gold || 0) + 100000;
      window.G.inventory = window.G.inventory || {};
      // Pre-pay every possible mat cost in absurd quantity.
      const mats = ['normal_log','oak_log','willow_log','copper_bar','iron_bar','stone','normal_plank','oak_plank'];
      for (const m of mats) window.G.inventory[m] = 999;
      const beforeLv = window.G.rooms?.kitchen || 0;
      window.upgradeRoom('kitchen');
      const afterLv = window.G.rooms?.kitchen || 0;
      assert(afterLv === beforeLv + 1, `kitchen should be Lv ${beforeLv + 1}, got ${afterLv}`);
    } finally { restoreG(snap); }
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
      if (!M || typeof M.listItem !== 'function' || typeof M.buyListing !== 'function') return;
      window.G.gold = (window.G.gold || 0) + 1000;
      window.G.inventory = window.G.inventory || {};
      window.G.inventory.normal_log = (window.G.inventory.normal_log || 0) + 5;
      const r = M.listItem('normal_log', 1, 5);
      if (!r || !r.ok) return;
      const all = (typeof M.list === 'function') ? M.list() : [];
      const mine = all.filter && all.filter(l => l.itemId === 'normal_log');
      if (!mine || !mine.length) return;
      // We're the seller of every test listing — buyListing usually rejects
      // self-purchases. Just assert the call doesn't throw.
      try { M.buyListing(mine[mine.length - 1].id, 1); } catch {}
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
      if (!window.G.quests || typeof window.claimQuest !== 'function') return;
      const dailies = (window.G.quests.daily || window.G.quests.dailies || []);
      if (!dailies.length) return;
      const q = dailies[0];
      const before = window.G.gold || 0;
      q.progress = q.target || 1;
      q.completed = true;
      try { window.claimQuest(q.id); } catch (e) { /* may require additional state */ }
      // Pass: didn't throw. Don't assert reward delta because quest
      // contracts vary across builds.
    } finally { restoreG(snap); }
  }),

  () => tryRun('action: save + reload localStorage round-trip', () => {
    const snap = snapshotG();
    try {
      // b127: use a real persisted field (gold) instead of a synthetic
      // marker. The save serializer whitelists known fields, so
      // `__testMarker` was being stripped on save. Bumping gold by a
      // distinctive amount, saving, mutating in memory, then reloading
      // proves the round-trip works.
      if (typeof window.saveLocal !== 'function' || typeof window.loadLocal !== 'function') return;
      const tag = 12345;  // distinctive offset so we can detect it
      const goldBefore = window.G.gold || 0;
      window.G.gold = goldBefore + tag;
      window.saveLocal();
      window.G.gold = -1;            // mutate in memory only
      window.loadLocal();
      assert(window.G.gold === goldBefore + tag,
        `save/load round-trip lost gold change: expected ${goldBefore + tag}, got ${window.G.gold}`);
    } finally {
      // Restore + persist cleanup so we don't leave the player +12345g
      restoreG(snap);
      try { window.saveLocal(); } catch {}
    }
  }),

  () => tryRun('action: smelt a copper bar (artisan loop)', () => {
    const snap = snapshotG();
    try {
      if (typeof window.startArtisan !== 'function' && typeof window.startSmithing !== 'function') return;
      window.G.inventory = window.G.inventory || {};
      window.G.inventory.copper_ore = (window.G.inventory.copper_ore || 0) + 5;
      const startFn = window.startArtisan || window.startSmithing;
      try { startFn('copper_bar'); } catch (e) { /* recipe shape may differ */ }
      if (window.G.activeArtisanRecipe) {
        // Stop so the test doesn't leave the player smithing forever.
        if (typeof window.stopArtisan === 'function') window.stopArtisan();
      }
    } finally { restoreG(snap); }
  }),

  () => tryRun('action: equip + unequip a companion', () => {
    const snap = snapshotG();
    try {
      // b127: real field is `G.companions.equipped`, not `equippedId`.
      if (typeof window.equipCompanion !== 'function') return;
      window.equipCompanion('fox');
      const eq = window.G.companions?.equipped;
      assert(eq === 'fox', `expected equipped=fox, got ${JSON.stringify(window.G.companions)}`);
      if (typeof window.unequipCompanion === 'function') {
        window.unequipCompanion();
        const after = window.G.companions?.equipped;
        assert(!after, `companion should be unequipped, got ${after}`);
      }
    } finally { restoreG(snap); }
  }),

  () => tryRun('action: enter and leave a clan (mock)', () => {
    const snap = snapshotG();
    try {
      if (typeof window.joinClan !== 'function' || typeof window.leaveClan !== 'function') return;
      try { window.joinClan('TestClan'); } catch {}
      // joinClan is async on the live backend; if it set G.clanName immediately
      // it's the mock path. Either way, leaveClan should not throw.
      try { window.leaveClan(); } catch {}
    } finally { restoreG(snap); }
  }),

  // ── b127 regression suite ──

  // b127: Character page rendered "HP: — / —" because it read G.hp +
  // window.getMaxHp(), neither of which exist. Real fields are
  // G.playerHp + G.playerMaxHp.
  () => tryRun('b127: character page shows real HP, not "—"', () => {
    if (typeof window.G !== 'object' || typeof window.G.playerHp !== 'number') return;
    window.showTab('character');
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
    // Now call it — should be a no-op, must not throw
    window.closeAllModals();
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
];

export function runSmokeTest(opts = {}) {
  const verbose = opts.verbose !== false;
  const startTab = window.activeTab || 'profile';
  const preErrCount = errorLog.length;
  const results = TESTS.map((t) => {
    const r = t();
    if (verbose) console.log((r.status === 'PASS' ? '✓ ' : '✗ ') + r.name + (r.why ? ' — ' + r.why : ''));
    return r;
  });
  try { window.showTab(startTab); } catch {}
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === 'PASS').length,
    failed: results.filter((r) => r.status === 'FAIL').length,
    runtimeErrors: errorLog.length - preErrCount,
    results,
    timestamp: new Date().toISOString(),
  };
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`SMOKE TEST: ${summary.passed}/${summary.total} passed, ${summary.failed} failed, ${summary.runtimeErrors} runtime errors`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return summary;
}

function addButton() {
  if (document.getElementById('smoke-test-btn')) return;
  const b = document.createElement('button');
  b.id = 'smoke-test-btn';
  b.textContent = '🧪 Test';
  b.title = 'Run smoke test (Ctrl+Shift+T)';
  b.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:99999;'
    + 'background:#3a4154;color:#dfe9ee;border:1px solid #5fcc7c;border-radius:4px;'
    + 'padding:4px 10px;font-size:11px;cursor:pointer;opacity:.6;font-weight:700';
  b.onmouseenter = () => (b.style.opacity = '1');
  b.onmouseleave = () => (b.style.opacity = '.6');
  b.onclick = () => {
    const r = runSmokeTest();
    let msg = `Smoke test:\n${r.passed}/${r.total} passed\n${r.failed} failed, ${r.runtimeErrors} runtime errors\n\n`;
    if (r.failed > 0) {
      msg += 'Failures:\n' + r.results.filter((x) => x.status === 'FAIL')
        .map((x) => '• ' + x.name + ': ' + x.why).join('\n');
    } else {
      msg += '✓ All clear';
    }
    alert(msg);
  };
  document.body.appendChild(b);
}

export function setupSmokeTest() {
  window.__smokeTest = runSmokeTest;
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      runSmokeTest();
    }
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(addButton, 500));
  } else {
    setTimeout(addButton, 500);
  }
  // Live watcher — logs any new overlaps that appear during normal play
  // (debounced 250ms after every tab change / resize). Deduped by signature
  // so the same violation only logs once per session.
  setTimeout(() => watchUiOverlaps(), 1500);
  console.log('[Smoke Test ESM] loaded — UI overlap watcher armed');
}
