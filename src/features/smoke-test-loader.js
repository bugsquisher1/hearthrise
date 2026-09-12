// ════════════════════════════════════════════════════════════════════════
// src/features/smoke-test-loader.js — THE SUITE IS NOT PART OF THE GAME (b535)
//
// THE BUG THIS FIXES. Paione, 2026-09-11: "it takes long to start." src/main.js
// imported `./features/smoke-test.js` STATICALLY, so the 1,232-test suite —
// 3.75 MB of the 10.28 MB of JavaScript a cold boot delivers, the single
// largest file in the tree, three times the size of the monolith it tests —
// was downloaded, parsed and evaluated by every player on every cold boot,
// before the account gate they are waiting on was usable. Nothing in it runs
// for a player. It is developer weight, and the player was carrying it.
//
// WHAT THIS MODULE IS. The suite's three entry points, and nothing else, in
// ~2 KB that can afford to be static:
//
//   • the harness      — `window.__HR_TEST_HARNESS__` is set by every headless
//                        runner's addInitScript BEFORE the first script runs,
//                        so the import is kicked at module evaluation: the same
//                        tick the static import used to be evaluated in. The
//                        runners see no change in timing they can measure.
//   • Ctrl+Shift+T     — imported on the keystroke, then run.
//   • the 🧪 button    — admin-gated exactly as b141 required; the import is
//                        paid on the CLICK, not on the boot.
//
// WHY THE BUTTON AND THE KEY LIVE HERE AND NOT IN THE SUITE. They are the
// things that must exist BEFORE the suite does — a control that only works
// once the thing it loads is already loaded is not a control. `addButton` moved
// with them, whole: it is still the one real implementation of the b141 admin
// gate, and it is still the function the suite's b141 test drives through
// `window.__hrAddSmokeButton` (published here, under the harness flag only, for
// the same reason as before — on a live admin run the hook is absent and the
// test declares an honest skip rather than a fake pass).
//
// THE GUARD. tests/boot-budget.mjs boots a real Chromium twice and asserts both
// halves: a PLAYER boot never requests smoke-test.js (BOOT-1), and a HARNESS
// boot does and publishes `window.__smokeTestSource = 'esm'` (BOOT-2) — because
// the cheapest way to pass BOOT-1 alone is to stop loading the suite at all,
// after which every headless runner silently falls through to legacy.js block
// 29's ~40-test v1 `window.__smokeTest` and reports a green that means nothing.
// ════════════════════════════════════════════════════════════════════════

/* One import, one module instance, however many times it is asked for. A second
   `import()` of the same specifier returns the same module from the registry,
   but it would call setupSmokeTest() twice — a second keydown listener, a second
   overlap watcher — so the promise is what is memoised, not the module. */
let pending = null;

/**
 * Fetch, evaluate and wire the suite. Idempotent; safe to call from anywhere.
 * @returns {Promise<object|null>} the suite module, or null if it failed to load.
 */
export function loadSmokeTest() {
  if (!pending) {
    pending = import('./smoke-test.js?v=543')
      .then((m) => { m.setupSmokeTest(); return m; })
      .catch((e) => {
        /* Do not cache a failure: a dropped request on a flaky connection must
           not make the 🧪 button permanently dead for the rest of the session. */
        pending = null;
        console.error('[smoke-test] suite failed to load', e);
        return null;
      });
  }
  return pending;
}

async function runAndReport() {
  const m = await loadSmokeTest();
  if (!m) return;
  const r = await m.runSmokeTest();
  let msg = `Smoke test:\n${r.passed}/${r.total} passed\n${r.failed} failed, ${r.skipped} skipped, ${r.runtimeErrors} runtime errors\n\n`;
  if (r.failed > 0) {
    msg += 'Failures:\n' + r.results.filter((x) => x.status === 'FAIL')
      .map((x) => '• ' + x.name + ': ' + x.why).join('\n');
  } else {
    msg += '✓ All clear';
  }
  /* b373: the shared non-blocking modal, like every other question the game
     asks. A native alert blocks the renderer while the report is open. */
  if (window.HearthriseDialog) window.HearthriseDialog.alert({ title: 'Smoke test', body: msg });
  else if (typeof window.notify === 'function') window.notify(msg, 'info');
}

function addButton() {
  if (document.getElementById('smoke-test-btn')) return;
  // b141 — Beta launch prep: hide the floating 🧪 button from non-admin
  // players. Admin opt-in is already managed by src/admin.js (URL ?admin=1
  // is sticky in localStorage). Ctrl+Shift+T still works for everyone, so
  // testers can still kick off the suite if asked. Keeps the regular UI
  // clean of dev affordances during beta.
  const isAdmin = (() => {
    try { return localStorage.getItem('hearthrise:admin') === '1'; }
    catch (e) { return false; }
  })();
  if (!isAdmin) return;
  const b = document.createElement('button');
  b.id = 'smoke-test-btn';
  b.textContent = '🧪 Test';
  b.title = 'Run smoke test (Ctrl+Shift+T)';
  /* CLAUDE.md §7 — no hardcoded colours. The three hex literals this control
     carried since b141 (#3a4154 / #dfe9ee / #5fcc7c) were a slate-blue that
     belonged to no theme; moving the button here was the moment to convert it,
     and tests/css-literal-ratchet.mjs is what refused the copy-paste. */
  b.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:99999;'
    + 'background:var(--bg-2);color:var(--ink);border:1px solid var(--green);border-radius:4px;'
    + 'padding:4px 10px;font-size:11px;cursor:pointer;opacity:.6;font-weight:700';
  b.onmouseenter = () => (b.style.opacity = '1');
  b.onmouseleave = () => (b.style.opacity = '.6');
  /* b535: the click is where the 3.75 MB is paid, and it is not instant on a
     slow connection. Say so, and refuse a second concurrent run. */
  b.onclick = async () => {
    if (b.disabled) return;
    b.disabled = true;
    const label = b.textContent;
    b.textContent = '🧪 …';
    try { await runAndReport(); }
    finally { b.textContent = label; b.disabled = false; }
  };
  document.body.appendChild(b);
}

export function setupSmokeTestLoader() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      runAndReport();
    }
  });
  /* SA-013 (increment 2): expose the admin-gated dev-button builder to the suite
     ONLY under the test harness, so the b141 admin-gate test can drive the REAL
     addButton() with teeth instead of a soft self-check. */
  try { if (window.__HR_TEST_HARNESS__) window.__hrAddSmokeButton = addButton; } catch (e) {}
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(addButton, 500));
  } else {
    setTimeout(addButton, 500);
  }
}

/* THE HARNESS KICK, AT MODULE EVALUATION — deliberately not inside
   setupSmokeTestLoader(). main.js calls the setups only once window.G and
   window.showTab exist (a poll that can take several hundred ms on a slow
   device); the static import this replaces was EVALUATED when main.js was
   parsed. Kicking here keeps the runners' boot timing where it was, and — the
   part that matters — gets the suite's global error-log wrapper installed as
   early as it used to be, so a boot-time throw still lands in __errorLog and
   still counts as a runtime error. */
try { if (window.__HR_TEST_HARNESS__) loadSmokeTest(); } catch (e) {}
