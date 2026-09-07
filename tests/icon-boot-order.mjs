// ============================================================
// tests/icon-boot-order.mjs — b371, the ICON-READINESS EDGE guard.
//
// THE BUG THIS PINS (Tyler: "strange flickering of old assets";
// .claude/coordination/LIVE-AUDIT-2026-08-17.md F13 / F13-addendum / F15):
// legacy.js is a classic script and paints screens the instant it boots;
// src/main.js is a MODULE, therefore deferred, and it is what merges
// src/data/* and applies the Hearthfire item-art manifest. Anything painted
// in between renders against a 109-entry `_itemPath` instead of the ~490 the
// game ships, shows `hr-blank-icon` for the rest, and was NEVER repainted —
// the icons only appeared when some unrelated action happened to re-render
// that surface ("Plant all" on the Farm, in Tyler's repro).
//
// The old mitigation was `setTimeout(__mapGeneratedGearIcons, 1500)`: a
// guessed delay that ALSO forced a visible full inventory repaint at ~1.7 s
// on every single boot. It is gone. main.js now calls `__hrIconsReady()` at
// the exact instant the icon picture is complete.
//
// Two things must hold, and this guard drives the real boot for both:
//
//   A. FIRST PAINT IS COMPLETE — no icon path may arrive after the engine's
//      first `showTab()`. This is the contract that makes flicker impossible
//      in the normal ordering, and it is what the retired 1500 ms timer used
//      to violate by five ids on every boot.
//
//   B. THE LATE BRANCH STILL WORKS — if the edge does land after first paint
//      (slow module fetch, a future surface that paints earlier), it repaints
//      the active screen. Driven for real by re-arming the edge, so deleting
//      the repaint turns this guard red.
//
// ────────────────────────────────────────────────────────────────────────────
// b517 — WHY THIS GUARD NO LONGER RACES THE ENGINE (the flake that blocked CI).
//
// Until b517 the guard learned "what did the icon map look like at first
// paint?" by wrapping `window.showTab` from a Playwright init script. It could
// not wrap it at document-start (the property does not exist yet) and it could
// not use an accessor (`function showTab` in a classic script is
// configurable:false but writable — see src/utils/showtab-registry.js), so it
// POLLED every 5 ms waiting for the function to appear:
//
//     if (performance.now() < 30000) setTimeout(install, 5);      // the race
//
// The window it had to land in is from legacy.js's parse (where `showTab` is
// hoisted) to boot()'s `showTab('profile')` on DOMContentLoaded — sub-frame on
// an idle machine, and on a loaded one a 5 ms timer is simply delayed past the
// whole boot. The hook then never installed, `__firstPaintPaths` stayed null,
// and the guard reported:
//
//     ✗ never observed the engine's first showTab() — cannot judge first paint.
//
// which run-smoke.mjs counts as this guard FAILING. It is the guard's own
// PRECONDITION failing, not the property — and it only ever showed up inside a
// full busy suite run, passing green in isolation seconds later. One such flake
// makes the GitHub `smoke` gate unreachable for every later build (CLAUDE.md
// §4: "a red in-page test is a P1, never cosmetic").
//
// THE FIX IS AT SOURCE, NOT A LONGER TIMEOUT: the engine now states the fact
// itself. `showTab()` (src/legacy.js, first statement) writes a one-shot
// `window.__hrFirstPaint = { at, tab, booted, iconsReady, paths }` before it
// does any work. The observation is therefore synchronous with the event being
// observed — there is no hook, no ordering and no timer to lose, at any machine
// load. "Could not observe" is impossible by construction: if the marker is
// missing after the boot wait, the ENGINE did not paint or the marker was
// deleted from showTab, which is a genuine hard failure and is reported as one
// (there is no HARNESS exit convention in run-smoke.mjs — it treats a non-empty
// problem list as red, full stop, so inventing a soft class here would mean
// inventing it in the runner too).
//
// Proven, not asserted:
//   node tests/icon-boot-order.mjs              real boot, expect green
//   node tests/icon-boot-order.mjs --load       same, under artificial CPU load
//                                               (4 busy workers + main-thread
//                                               jank) — the exact condition the
//                                               5 ms poll used to lose in.
//                                               MUST still be green.
//   node tests/icon-boot-order.mjs --selftest   plants three defects, each of
//                                               which must be CAUGHT:
//         late-icon   an icon path written after first paint      → property A
//         no-repaint  __hrRepaintActive neutered                  → property B
//         no-marker   __hrFirstPaint made unwritable              → the
//                     "cannot observe" branch, proving it still bites and is
//                     reachable ONLY by breaking the engine, never by load.
//
// Exported as runAll(browser, url) -> string[] of problems, like the other
// guards in this folder.
// ============================================================

/* Ids that legitimately land after first paint, each with an owner. Keep this
   list SHORT and justified — every entry is a surface that can still flicker.
     • muster_seal — src/features/muster.js writes its own path from its own
       boot (features/muster.js ~1745). It is one world-event currency icon on
       one screen, and moving it would mean moving muster's whole boot. */
const LATE_PATH_ALLOWLIST = new Set(['muster_seal']);

/* How long the engine gets to paint / complete its icon map. Generous on
   purpose: these are waits on FACTS the engine publishes, not on a sampling
   window, so a slow machine costs seconds and never a verdict. */
const BOOT_TIMEOUT_MS = 60_000;
/* Settle time AFTER the readiness edge, so any late writer (muster, a future
   feature module) has landed and is seen by property A. Comfortably past the
   retired 1500 ms timer, which is armed from legacy.js's parse. */
const LATE_WRITER_SETTLE_MS = 4_000;

/* The artificial-load control (--load, and used by --selftest's clean run).
   Four workers saturate cores while a main-thread hog burns 30 ms out of every
   40 ms for the first 10 s — timer delivery under this is exactly what the old
   5 ms poll lost in. Injected at document-start so it covers boot itself. */
function loadScript() {
  try {
    const src = 'let x=0; setInterval(()=>{const t=Date.now(); while(Date.now()-t<45) x+=Math.sqrt(t+x);},1);';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    window.__hrLoadWorkers = [];
    for (let i = 0; i < 4; i++) window.__hrLoadWorkers.push(new Worker(url));
  } catch (e) { /* workers unavailable — the main-thread hog below still bites */ }
  const stopAt = Date.now() + 10_000;
  const hog = setInterval(() => {
    if (Date.now() > stopAt) {
      clearInterval(hog);
      try { (window.__hrLoadWorkers || []).forEach((w) => w.terminate()); } catch (e) {}
      return;
    }
    const t = Date.now();
    let y = 0;
    while (Date.now() - t < 30) y += Math.sqrt(t + y);
    window.__hrLoadBurn = y;
  }, 40);
}

/**
 * @param {import('playwright').Browser} browser
 * @param {string} url
 * @param {{load?:boolean, plant?:'late-icon'|'no-repaint'|'no-marker'}} [opts]
 * @returns {Promise<string[]>} problems; empty === green
 */
export async function runAll(browser, url, opts = {}) {
  const problems = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
  if (opts.load) await page.addInitScript(loadScript);

  /* ── planted defects (--selftest only) ─────────────────────────────────── */
  if (opts.plant === 'late-icon') {
    /* Write an icon path strictly AFTER the engine's first paint, by watching
       the engine's own marker. This is the F13 defect in miniature. */
    await page.addInitScript(() => {
      const t = setInterval(() => {
        if (!window.__hrFirstPaint) return;
        clearInterval(t);
        window._itemPath = window._itemPath || {};
        window._itemPath.__hr_selftest_late_icon = 'assets/icons-bundle/selftest.png';
      }, 5);
    });
  }
  if (opts.plant === 'no-marker') {
    /* Make the marker unwritable, i.e. simulate someone deleting it from
       showTab(). The guard must say so as a HARD failure — this is the only
       way the "cannot observe" branch is now reachable. */
    await page.addInitScript(() => {
      Object.defineProperty(window, '__hrFirstPaint', {
        configurable: true, get() { return undefined; }, set() {}
      });
    });
  }

  try {
    await page.goto(url, { waitUntil: 'load', timeout: BOOT_TIMEOUT_MS });

    /* Wait on FACTS the engine publishes, never on a sampling window. Both are
       one-shot latches, so there is nothing to miss however late they arrive. */
    /* "the engine has painted" is `__hrFirstPaint || __hrBooted`: boot() sets
       __hrBooted immediately after its showTab('profile'), so a missing marker
       on a booted page is known at once instead of costing a 60 s timeout. */
    let bootSeen = true;
    try {
      await page.waitForFunction(() => !!window.__hrFirstPaint || !!window.__hrBooted,
        { timeout: BOOT_TIMEOUT_MS });
    } catch (e) { bootSeen = false; }
    try {
      await page.waitForFunction(() => !!window.__hrIconsReadyAt, { timeout: BOOT_TIMEOUT_MS });
    } catch (e) { /* reported below by the readyAt check, with diagnostics */ }
    await page.waitForTimeout(LATE_WRITER_SETTLE_MS);

    // ── A. first paint is complete ─────────────────────────────────────────
    const a = await page.evaluate(() => {
      const fp = window.__hrFirstPaint || null;
      return {
        first: fp ? fp.paths : null,
        firstTab: fp ? fp.tab : null,
        final: Object.keys(window._itemPath || {}),
        readyAt: window.__hrIconsReadyAt || 0,
        readyBeforePaint: !!(fp && fp.iconsReady),
        repainted: !!window.__hrIconRepaint,
        hasEdge: typeof window.__hrIconsReady === 'function',
        hasRepaint: typeof window.__hrRepaintActive === 'function',
        secondCall: typeof window.__hrIconsReady === 'function' ? window.__hrIconsReady() : null,
        /* diagnostics that make a missing marker self-explaining */
        hasShowTab: typeof window.showTab === 'function',
        booted: !!window.__hrBooted,
      };
    });

    if (!a.hasEdge) problems.push('window.__hrIconsReady is missing — the readiness edge legacy.js exposes and main.js drives.');
    if (!a.hasRepaint) problems.push('window.__hrRepaintActive is missing — the repaint half of the edge.');
    if (!a.readyAt) problems.push('__hrIconsReadyAt never set: main.js never called __hrIconsReady(), so the icon map completed with nobody listening.');
    if (a.secondCall !== false) problems.push(`__hrIconsReady() is not one-shot: a second call returned ${a.secondCall} instead of false.`);
    if (!a.first) {
      /* NOT a flake and no longer a sampling failure: the marker is written
         synchronously by showTab() itself (src/legacy.js). Missing means the
         engine never painted, or the marker was removed from showTab. */
      problems.push('window.__hrFirstPaint is missing after a full boot wait — the engine either never '
        + `painted or the first-paint marker was removed from showTab() in src/legacy.js. `
        + `(showTab defined: ${a.hasShowTab}; __hrBooted: ${a.booted}; __hrIconsReadyAt: ${a.readyAt}; `
        + `boot observed during the wait: ${bootSeen})`);
    } else {
      if (!a.readyBeforePaint) {
        problems.push('the icon-readiness edge fired AFTER the engine\'s first paint. Expected main.js '
          + '(deferred module) to complete the icon map before legacy\'s DOMContentLoaded boot.');
      }
      const late = a.final.filter((k) => !a.first.includes(k) && !LATE_PATH_ALLOWLIST.has(k));
      if (late.length) {
        problems.push(`${late.length} icon path(s) arrived AFTER first paint — every one is a tile that `
          + `renders blank and pops in later: ${late.slice(0, 10).join(', ')}`
          + (late.length > 10 ? ` (+${late.length - 10} more)` : ''));
      }
    }
    if (a.repainted) {
      problems.push('the edge forced a full repaint on a normal boot. That is the retired 1500 ms '
        + 'behaviour: it should only happen when the map genuinely completed after first paint.');
    }

    // ── B. the late branch actually repaints ───────────────────────────────
    // Drive it for real: strip the crop art back out, paint the Farm against
    // the short map (reproducing F13 exactly), then re-arm and fire the edge.
    if (opts.plant === 'no-repaint') {
      // Neuter the repaint half — property B must catch this.
      await page.evaluate(() => { window.__hrRepaintActive = function () { return true; }; });
    }
    const b = await page.evaluate(() => {
      const CROPS = window.CROPS || {};
      const prods = Object.values(CROPS).map((c) => c.prod).filter(Boolean);
      const saved = {};
      prods.forEach((id) => { saved[id] = window._itemPath[id]; delete window._itemPath[id]; });
      window.showTab('farming');
      /* `.hr-item-art` is the <img> itemArt() emits when it HAS a path. With
         the paths gone it falls through to itemFallbackIcon(), which draws a
         glyph silhouette (or `hr-blank-icon` when even the glyph atlas has no
         key) — either way, no painting. Counting the painted art is therefore
         the exact question: is this screen showing the real icons or not. */
      const cg = () => document.getElementById('crops-guide');
      const art = () => cg().querySelectorAll('img.hr-item-art').length;
      const stale = { imgs: art() };

      // the map completes late…
      Object.keys(saved).forEach((id) => { if (saved[id]) window._itemPath[id] = saved[id]; });
      // …and the edge fires after the engine has already painted.
      delete window.__hrIconsReadyAt;
      window.__hrIconRepaint = false;
      const fired = window.__hrIconsReady();

      const after = { imgs: art() };
      return { prods: prods.length, stale, after, fired, repainted: !!window.__hrIconRepaint, booted: !!window.__hrBooted };
    });

    if (!b.booted) {
      problems.push('window.__hrBooted was never set by boot(), so the edge can never tell "already painted" from "not yet".');
    }
    if (b.fired !== true) problems.push('re-armed __hrIconsReady() did not fire.');
    if (b.stale.imgs !== 0) {
      problems.push(`the stale-Farm setup did not reproduce: the Crops guide still showed ${b.stale.imgs} painted icon(s) with every crop path removed.`);
    }
    if (!b.repainted) {
      problems.push('the edge landed after first paint and did NOT repaint — this is the F13 flicker: the screen keeps its blank tiles until some unrelated action re-renders it.');
    }
    if (b.after.imgs < b.prods) {
      problems.push(`the Farm was not restored by the readiness repaint: ${b.after.imgs} painted crop `
        + `icon(s) after the edge, expected >= ${b.prods}.`);
    }
  } catch (e) {
    problems.push(`harness error: ${e.message}`);
  } finally {
    await ctx.close();
  }
  return problems;
}

export default runAll;

/* Standalone runner, so the race fix and the mutation proofs can be exercised
   without a full suite run. It serves the repo itself; a guard against a stale
   deploy is worthless.
     node tests/icon-boot-order.mjs
     node tests/icon-boot-order.mjs --load
     node tests/icon-boot-order.mjs --selftest
*/
if (process.argv[1]?.replace(/\\/g, '/').endsWith('tests/icon-boot-order.mjs')) {
  const { chromium } = await import('playwright');
  const { createServer } = await import('node:http');
  const { readFile, stat } = await import('node:fs/promises');
  const { extname, join, normalize } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json' };
  const { server, port } = await new Promise((resolve) => {
    const s = createServer(async (req, res) => {
      try {
        const p = decodeURIComponent((req.url || '/').split('?')[0]);
        let f = normalize(join(ROOT, p === '/' ? '/index.html' : p));
        if (!f.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
        const i = await stat(f).catch(() => null);
        if (i?.isDirectory()) f = join(f, 'index.html');
        res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store' }).end(await readFile(f));
      } catch { res.writeHead(404).end('not found'); }
    });
    s.listen(0, '127.0.0.1', () => resolve({ server: s, port: s.address().port }));
  });
  const url = `http://127.0.0.1:${port}/index.html`;
  const load = process.argv.includes('--load');
  const browser = await chromium.launch();
  let exit = 0;

  if (process.argv.includes('--selftest')) {
    /* Every control must be CAUGHT. A guard that has never been red is not a
       guard (CLAUDE.md §4: mutate the caller). */
    const CONTROLS = [
      ['late-icon', /arrived AFTER first paint/],
      ['no-repaint', /was not restored by the readiness repaint/],
      ['no-marker', /__hrFirstPaint is missing after a full boot wait/],
    ];
    for (const [plant, expect] of CONTROLS) {
      const ps = await runAll(browser, url, { plant });
      const caught = ps.some((p) => expect.test(p));
      console.log(`  ${caught ? '✓' : '✗'} control "${plant}" — ${caught ? 'CAUGHT' : `NOT caught (got: ${ps.join(' | ') || 'green'})`}`);
      if (!caught) exit = 1;
    }
    const clean = await runAll(browser, url, { load: true });
    console.log(`  ${clean.length ? '✗' : '✓'} control "clean under load" — ${clean.length ? clean.join(' | ') : 'green'}`);
    if (clean.length) exit = 1;
    console.log(exit ? 'Icon boot-order guard --selftest: FAILED.' : 'Icon boot-order guard --selftest: every control behaved.');
  } else {
    const problems = await runAll(browser, url, { load });
    if (problems.length) {
      console.log(`Icon boot-order guard${load ? ' (UNDER LOAD)' : ''} — FAILED:`);
      for (const p of problems) console.log('  ✗ ' + p);
      exit = 1;
    } else {
      console.log(`Icon boot-order guard${load ? ' (UNDER LOAD)' : ''} — the icon map is complete before the `
        + 'engine\'s first paint, and a late map still repaints the active screen.');
    }
  }
  await browser.close();
  server.close();
  process.exit(exit);
}
