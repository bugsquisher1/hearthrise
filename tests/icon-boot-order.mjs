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
// Exported as runAll(browser, url) -> string[] of problems, like the other
// guards in this folder.
// ============================================================

/* Ids that legitimately land after first paint, each with an owner. Keep this
   list SHORT and justified — every entry is a surface that can still flicker.
     • muster_seal — src/features/muster.js writes its own path from its own
       boot (features/muster.js ~1745). It is one world-event currency icon on
       one screen, and moving it would mean moving muster's whole boot. */
const LATE_PATH_ALLOWLIST = new Set(['muster_seal']);

export async function runAll(browser, url) {
  const problems = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__HR_TEST_HARNESS__ = true;
    /* Capture the icon map AS IT WAS at the engine's first paint. Hooking
       showTab the moment it is defined is the only way to observe first paint
       from outside; polling cannot, because the whole race is sub-frame. */
    const install = () => {
      if (typeof window.showTab === 'function' && !window.__firstPaintHooked) {
        window.__firstPaintHooked = true;
        const orig = window.showTab;
        window.showTab = function () {
          if (!window.__firstPaintPaths) {
            window.__firstPaintPaths = Object.keys(window._itemPath || {});
            window.__firstPaintBooted = !!window.__hrBooted;
            window.__firstPaintIconsReady = !!window.__hrIconsReadyAt;
          }
          return orig.apply(this, arguments);
        };
        return;
      }
      if (performance.now() < 30000) setTimeout(install, 5);
    };
    install();
  });

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => typeof window.showTab === 'function', { timeout: 60_000 });
    // Well past the retired 1500 ms timer, so a late writer has every chance.
    await page.waitForTimeout(4_000);

    // ── A. first paint is complete ─────────────────────────────────────────
    const a = await page.evaluate(() => ({
      first: window.__firstPaintPaths || null,
      final: Object.keys(window._itemPath || {}),
      readyAt: window.__hrIconsReadyAt || 0,
      readyBeforePaint: !!window.__firstPaintIconsReady,
      repainted: !!window.__hrIconRepaint,
      hasEdge: typeof window.__hrIconsReady === 'function',
      hasRepaint: typeof window.__hrRepaintActive === 'function',
      secondCall: typeof window.__hrIconsReady === 'function' ? window.__hrIconsReady() : null,
    }));

    if (!a.hasEdge) problems.push('window.__hrIconsReady is missing — the readiness edge legacy.js exposes and main.js drives.');
    if (!a.hasRepaint) problems.push('window.__hrRepaintActive is missing — the repaint half of the edge.');
    if (!a.readyAt) problems.push('__hrIconsReadyAt never set: main.js never called __hrIconsReady(), so the icon map completed with nobody listening.');
    if (a.secondCall !== false) problems.push(`__hrIconsReady() is not one-shot: a second call returned ${a.secondCall} instead of false.`);
    if (!a.first) {
      problems.push('never observed the engine\'s first showTab() — cannot judge first paint.');
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
