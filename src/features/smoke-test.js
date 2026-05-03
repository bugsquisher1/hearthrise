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

const snapshotG = () => {
  const G = window.G;
  if (!G) return null;
  return JSON.parse(JSON.stringify({
    activeSkill: G.activeSkill,
    skillTargetId: G.skillTargetId,
    activeMonster: G.activeMonster,
    activeArtisanRecipe: G.activeArtisanRecipe,
    gold: G.gold,
    inventory: G.inventory,
    equipment: G.equipment,
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
  () => tryRun('icons: skill icons mapped', () => {
    assert(Object.keys(window._skillIcon || {}).length >= 14, 'expected >=14 skill icons');
  }),
  () => tryRun('icons: bundle paths in use', () => {
    const p = window._itemPath && window._itemPath['bronze_sword'];
    assert(p && p.indexOf('assets/raw-bundle') === 0, 'bronze_sword should point at bundle, got ' + p);
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
