// ============================================================
// tests/reachability.mjs — THE PRIMARY-CTA REACHABILITY GUARD (b371)
//
// WHY THIS EXISTS, and it is the second occurrence that earned it:
//
//   b366 — Eat and Stop pushed off the bottom of a 423px landscape phone by a
//          second row of style buttons. No test saw it; a screenshot did.
//   b370 — FIGHT, the primary call to action of the primary screen, sitting at
//          y=776..813 on a 1366x768 laptop with NOTHING that scrolls. No test
//          saw it either. The cure for b366 had been written six months
//          earlier and fenced inside `@media (max-height: 560px)`, so it
//          protected the viewport where the accident had already happened and
//          no other.
//
// CLAUDE.md: "When something breaks for the second time, that's a sign there's
// no test guarding it. Add the test before fixing again." This is that test.
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────
// For each declared (screen, CTA) pair at each declared viewport:
//   1. the control EXISTS and is laid out (non-zero box),
//   2. after scrolling every USER-SCROLLABLE ancestor as far as it will go
//      toward the control, its box lies inside the viewport,
//   3. `document.elementFromPoint` at its centre returns the control or a
//      descendant of it — i.e. a real click at that point lands on it.
//
// ── THE ONE SUBTLETY THAT DECIDES WHETHER THIS GUARD WORKS AT ALL ───────────
// `Element.scrollIntoView()` scrolls `overflow: hidden` containers. The
// browser will happily reveal a control inside a box the player can never
// scroll — which is EXACTLY the b370 defect (the clipping `.combat-arena`) —
// and a guard written the obvious way reports it reachable. This one therefore
// walks the ancestor chain itself and only moves boxes whose computed
// `overflow-y` is `auto` or `scroll`, plus the document. An early draft of this
// file used scrollIntoView and passed against the unfixed build; that draft is
// the reason for this paragraph.
//
// ── SCOPE ───────────────────────────────────────────────────────────────────
// Deliberately a DECLARED LIST, not a sweep. A sweep over "every button"
// produces hundreds of findings about controls inside collapsed accordions and
// off-screen carousels and teaches everyone to ignore it. This list is the
// controls a player must be able to press to play: extend `CTAS` with a row,
// no code.
//
//   node tests/reachability.mjs               → run standalone
//   node tests/reachability.mjs --mutate      → mutation check (see bottom)
// ============================================================

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

/* The viewports. 1366x768 and 1280x800 are the two most common laptop panels
   in the world and are where b370 lived; 1440x900 is the size every previous
   verification pass in this repo used, and is here so a fix aimed at short
   screens cannot quietly break the one everybody looks at; 922x423 is paione's
   Ulefone in landscape, the project's mobile target (CLAUDE.md § Mobile). */
export const VIEWPORTS = [
  { w: 1366, h: 768 },
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
  { w: 922, h: 423 },
];

/* THE DECLARED CTAs.
     id      — what fails in the output
     open    — steps to reach the screen, run in the page before measuring
     sel     — the control; the FIRST laid-out match is measured
     skipIf  — optional predicate (in page) for a viewport that legitimately
               does not render the control (the rail is display:none on a
               phone, so "the last rail item" has no subject there)
   Everything here is a control a player MUST be able to press. */
export const CTAS = [
  {
    id: 'combat/FIGHT',
    why: 'starts the fight — the primary action of the primary screen (b370)',
    open: ['tab:combat', 'monster'],
    sel: '.fs-fight',
  },
  {
    id: 'combat/EAT',
    why: 'heals mid-fight; pushed off a 423px screen in b366',
    open: ['tab:combat', 'monster', 'fight'],
    sel: '#panel-combat .fs-actionbar .arena-act, #panel-combat #arena-act-player',
  },
  {
    id: 'combat/STOP',
    why: 'ends the fight; the only way out of a losing one',
    open: ['tab:combat', 'monster', 'fight'],
    sel: '#panel-combat .fs-stop',
  },
  {
    id: 'combat/BACK-TO-TABLE',
    why: 'the only route off the Fight screen back to the War Table',
    open: ['tab:combat', 'monster'],
    sel: '#panel-combat .fs-back',
  },
  {
    id: 'nav/RAIL-LAST-ITEM',
    why: 'the last nav destination; Social + Settings sat below the fold at 1366x768 (b370)',
    open: [],
    sel: '__rail-last__',
    skipIf: '__no-rail__',
    /* THE ONE ENTRY HELD TO THE STRICTER STANDARD, and the distinction is the
       most useful thing this file learned. `.sidebar` has been
       `overflow-y:auto` since b225, so Settings at y=821 on a 768px screen was
       always REACHABLE — a wheel got you there, and a guard that only asks
       "can it be reached" was green on it and was right to be.
       It is still a defect. A persistent nav rail is not a document: it shows
       no scrollbar until touched, its last visible row looks exactly like the
       end of the list, and the entire premise of the pattern is that the
       destinations are VISIBLE. So this row asserts fit-without-scrolling.
       Applying that standard to a market table or a bounty board would be
       nonsense — lists scroll, that is what lists do — which is why it is a
       per-row flag and not the guard's default. */
    noScroll: true,
  },
  {
    id: 'character/LAST-SKILL-ROW',
    why: 'the bottom of the skills list; unreachable at 922x423 (b370)',
    open: ['tab:character'],
    sel: '#char-skills > *:last-child',
  },
  {
    id: 'bounty/LAST-ACCEPT',
    why: 'the bottom notice on the board; a board whose last bounty cannot be accepted is half a board',
    open: ['tab:bounty'],
    sel: '#panel-bounty .bb-foot .btn',
    last: true,   // the BOTTOM one — the first is never the one that falls off
  },
  {
    id: 'market/LIST',
    why: 'the only way to put an item on the market — the economy surface\'s primary control',
    open: ['tab:market'],
    sel: '#mk-list-btn',
  },
  /* The SHOP rather than the market for the "bottom of a long list" case: with
     no cloud session the market table is legitimately empty, and a guard that
     depends on a network fixture to have a subject is a guard that goes quiet
     the day the fixture changes. The shop is authored from local data, is
     always full, and is the same layout question. */
  {
    id: 'shop/LAST-BUY',
    why: 'the bottom row of a long priced list — the densest scrolling surface in the game',
    open: ['tab:shop'],
    sel: '#panel-shop .btn',
    last: true,
  },
  {
    id: 'home/CLAIM',
    why: 'the daily claim — the first thing a returning player presses',
    open: ['tab:profile'],
    sel: '#panel-profile .hd-cta',
  },
];

// ── the page-side probe ─────────────────────────────────────────────────────
// Serialised into the browser. Kept self-contained (no closures over Node).
function PROBE(spec) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const laidOut = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  const pick = (sel, last) => {
    if (sel === '__rail-last__') {
      const sb = document.querySelector('.sidebar');
      if (!sb || !laidOut(sb)) return null;
      const items = [...sb.querySelectorAll('[data-tab], button')].filter(laidOut);
      return items[items.length - 1] || null;
    }
    const all = [...document.querySelectorAll(sel)].filter(laidOut);
    return (last ? all[all.length - 1] : all[0]) || null;
  };

  const name = (el) => !el ? 'null'
    : (el.id ? '#' + el.id : '') + el.tagName.toLowerCase()
      + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '');

  /* SCROLL ONLY WHAT A PLAYER CAN SCROLL. This is the whole point of the file:
     `scrollIntoView` moves `overflow:hidden` boxes too, so using it here would
     have declared the b370 defect reachable. We walk the chain, and we touch a
     box only if its computed overflow-y is auto/scroll AND it actually has
     travel. The document itself counts (it is scrollable by definition when
     scrollingElement has travel). */
  const userScroll = (el) => {
    let moved = 0;
    const chain = [];
    for (let p = el.parentElement; p; p = p.parentElement) chain.push(p);
    const doc = document.scrollingElement || document.documentElement;
    if (doc && !chain.includes(doc)) chain.push(doc);
    // outermost first, so an inner container's final position is measured last
    for (const p of chain.reverse()) {
      const cs = getComputedStyle(p);
      const scrollable = /auto|scroll/.test(cs.overflowY)
        || p === document.scrollingElement || p === document.documentElement;
      if (!scrollable) continue;
      if (p.scrollHeight <= p.clientHeight + 2) continue;
      const pr = (p === doc) ? { top: 0, bottom: innerHeight } : p.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      let delta = 0;
      if (r.bottom > pr.bottom) delta = r.bottom - pr.bottom;
      else if (r.top < pr.top) delta = r.top - pr.top;
      if (!delta) continue;
      const before = p.scrollTop;
      p.scrollTop = before + delta;
      moved += Math.abs(p.scrollTop - before);
    }
    return moved;
  };

  return (async () => {
    // ── open the screen ──────────────────────────────────────────────
    for (const step of spec.open) {
      if (step.startsWith('tab:')) {
        const t = step.slice(4);
        try { if (typeof window.showTab === 'function') window.showTab(t); } catch (e) {}
        await sleep(450);
      } else if (step === 'monster') {
        const c = [...document.querySelectorAll('[data-monster]')].find(laidOut);
        if (c) c.click();
        await sleep(900);
      } else if (step === 'fight') {
        const f = [...document.querySelectorAll('.fs-fight')].find(laidOut);
        if (f) f.click();
        await sleep(900);
      }
    }
    await sleep(200);

    if (spec.skipIf === '__no-rail__') {
      const sb = document.querySelector('.sidebar');
      if (!sb || !laidOut(sb)) return { skipped: 'the nav rail is not rendered at this viewport' };
    }

    const el = pick(spec.sel, spec.last);
    if (!el) return { missing: true };

    const fits = () => {
      const b = el.getBoundingClientRect();
      return b.top >= -1 && b.bottom <= innerHeight + 1 && b.left >= -1 && b.right <= innerWidth + 1;
    };
    const fitsUnscrolled = fits();
    const moved = spec.noScroll ? 0 : userScroll(el);
    const r = el.getBoundingClientRect();
    const inView = spec.noScroll ? fitsUnscrolled : fits();

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // A centre outside the viewport cannot be hit-tested at all — say so
    // rather than reporting whatever elementFromPoint returns for a clamped
    // point, which is how "11px visible" reads as a pass.
    const inside = cx >= 0 && cx < innerWidth && cy >= 0 && cy < innerHeight;
    const hit = inside ? document.elementFromPoint(cx, cy) : null;
    /* AN ANCESTOR COUNTS AS A HIT ONLY IF IT IS A NEAR ONE, and this is not
       pedantry — it is the difference between a live assertion and a dead one.
       elementFromPoint returning a CHILD is always fine (a click on the label
       inside a button presses the button). Returning a near ancestor is fine
       too (the point fell on the button's own padding). But when a fixed
       overlay is painted by a PSEUDO-element, elementFromPoint returns its
       ORIGINATING element — `body` — and a naive `hit.contains(el)` reads a
       screen-covering scrim as a successful hit. The first draft of this file
       did exactly that and let a planted 140px bar over the action bar through
       (mutation M4). Two hops is the whole legitimate range. */
    let hops = -1;
    for (let p = el, i = 0; p && i <= 2; p = p.parentElement, i++) { if (p === hit) { hops = i; break; } }
    const hittable = !!(hit && (hit === el || el.contains(hit) || hops >= 0));

    return {
      el: name(el), scrolled: Math.round(moved), noScroll: !!spec.noScroll,
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      left: Math.round(r.left), right: Math.round(r.right),
      vh: innerHeight, vw: innerWidth,
      inView, hittable, blocker: hittable ? null : name(hit),
    };
  })();
}

// ── the runner ──────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json' };

function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const p = decodeURIComponent((req.url || '/').split('?')[0]);
        let f = normalize(join(ROOT, p === '/' ? '/index.html' : p));
        if (!f.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
        const info = await stat(f).catch(() => null);
        if (info?.isDirectory()) f = join(f, 'index.html');
        const body = await readFile(f);
        res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store' }).end(body);
      } catch { res.writeHead(404).end('not found'); }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* A representative save. An empty account renders empty states, and an empty
   state never overflows — the whole defect class lives in FULL screens. */
const SEED = () => {
  const G = window.G; if (!G) return;
  try {
    Object.keys(window.SKILLS_DEF || {}).forEach((s) => { G.skills[s] = 200000; });
    const ids = Object.keys(window.ITEMS || {});
    ids.slice(0, 80).forEach((id, i) => { G.inventory[id] = (i % 9) + 1; });
    G.gold = 12345678; G.gems = 137;
    if (typeof window.refreshAll === 'function') window.refreshAll();
  } catch (e) {}
};

/* Overlays are dismissed rather than tolerated: the daily-reward scrim is a
   full-viewport fixed layer, so with it up EVERY control on EVERY screen fails
   the hit test and the guard says nothing useful about layout. */
const KILL_OVERLAYS = () => {
  try { if (window.G) { window.G.ftueDone = true; window.G.ftueStep = 99; } } catch (e) {}
  const kill = () => {
    /* The desktop-mode banner is a HARNESS ARTIFACT here and dismissing it is
       not sweeping a defect under the rug. Headless Chromium reports
       `navigator.maxTouchPoints = 10`, and Playwright sets `screen` equal to
       the viewport — so at 922x423 the detector sees "touch device, 423px
       short edge, non-mobile UA" and correctly concludes desktop-mode. On the
       real device that clause cannot fire (a phone UA with DPR 2.75 fails
       `!uaMobile || lowDpr`). The banner is `position:fixed; top:0`, so
       leaving it up makes every top-of-screen control report COVERED and the
       guard stops saying anything about layout. The detector's own thresholds
       are asserted directly by the b371 test in smoke-test.js, which is the
       right place for them. */
    const dm = document.getElementById('hr-desktopmode-banner');
    if (dm) dm.remove();
    /* TOASTS ARE HIDDEN, and this is a scope decision rather than a blind eye.
       `.notifs` is a transient stack with a 4-9 second lifetime that lands
       wherever the last combat burst left it, so asserting around it makes
       this guard flaky in both directions — and it WAS covering the bounty
       board's bottom controls on two of four runs, which is a real finding and
       a real one to fix in the toast module's own obstacle registry (b371 did
       exactly that for the Fight action bar), not by making a layout guard
       intermittently red. What this guard is for is geometry that is true for
       as long as the screen is open. */
    document.querySelectorAll('.notifs').forEach((e) => e.style.setProperty('display', 'none', 'important'));
    document.querySelectorAll('#hr-dl-modal,.ftue-root,.ftue-overlay,#ftue-overlay,.modal.open,'
      + '.qm-overlay,.dr-overlay,#daily-reward-overlay,.welcome-overlay,#welcome-modal,.inv-detail.show')
      .forEach((e) => e.style.setProperty('display', 'none', 'important'));
    document.querySelectorAll('body > *').forEach((e) => {
      const c = getComputedStyle(e);
      if (c.position !== 'fixed' || c.pointerEvents === 'none') return;
      const r = e.getBoundingClientRect();
      if (r.width > innerWidth * 0.6 && r.height > innerHeight * 0.5) e.style.setProperty('display', 'none', 'important');
    });
  };
  kill();
  window.__hrKillOverlays = kill;
};

/**
 * @param {import('playwright').Browser} browser
 * @param {string} url
 * @param {{viewports?: typeof VIEWPORTS, injectCss?: string, only?: string[]}} [opts]
 *        — all three exist for the mutation harness; production callers pass
 *        nothing.
 * @returns {Promise<string[]>} problems (empty === green)
 */
export async function reachabilityGuard(browser, url, opts = {}) {
  const problems = [];
  const viewports = opts.viewports || VIEWPORTS;

  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
      await page.waitForFunction(() => typeof window.G !== 'undefined', { timeout: 60_000 });
      await page.waitForTimeout(3_500);
      await page.evaluate(SEED);
      await page.waitForTimeout(400);
      await page.evaluate(KILL_OVERLAYS);
      /* The mutation sheet goes in LAST and with `!important`, so it outranks
         the real stylesheets it is undoing. It is appended to <head> rather
         than written to disk: a harness that edits production CSS can leave
         the repo dirty when it crashes, which this project has been bitten by
         before (see tests/mutation-safety.mjs). */
      if (opts.injectCss) {
        await page.evaluate((css) => {
          const s = document.createElement('style');
          s.id = '__hr-mutation__'; s.textContent = css;
          document.head.appendChild(s);
        }, opts.injectCss);
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(200);

      for (const spec of CTAS) {
        if (opts.only && !opts.only.includes(spec.id)) continue;
        // Re-kill: opening a screen can raise a new modal (level-up, tour step).
        await page.evaluate(() => { try { window.__hrKillOverlays && window.__hrKillOverlays(); } catch (e) {} });
        const r = await page.evaluate(PROBE, spec).catch((e) => ({ threw: String(e && e.message || e).slice(0, 120) }));
        const at = `${vp.w}x${vp.h} ${spec.id}`;
        if (r.threw) { problems.push(`${at}: probe threw — ${r.threw}`); continue; }
        if (r.skipped) continue;
        if (r.missing) { problems.push(`${at}: the control does not exist or is not laid out (${spec.sel})`); continue; }
        if (!r.inView) {
          problems.push(`${at}: ` + (r.noScroll
            ? `BELOW THE FOLD — this control must be visible WITHOUT scrolling`
            : `OFF SCREEN after scrolling everything a player can scroll (${r.scrolled}px of travel used)`)
            + ` — ${r.el} at y ${r.top}..${r.bottom} in a ${r.vh}px viewport, `
            + `x ${r.left}..${r.right} in ${r.vw}. ${spec.why}`);
          continue;
        }
        if (!r.hittable) {
          problems.push(`${at}: COVERED — a click at the centre of ${r.el} (y ${r.top}..${r.bottom}) `
            + `lands on ${r.blocker}. ${spec.why}`);
        }
      }
    } catch (err) {
      problems.push(`${vp.w}x${vp.h}: harness failure — ${err.message}`);
    } finally {
      await ctx.close().catch(() => {});
    }
  }
  return problems;
}

// ── standalone / mutation ───────────────────────────────────────────────────
/* THE MUTATION CHECK — and the first version of it was wrong in a way worth
   recording. It shrank the viewport to 1366x360 and demanded failure. The
   guard stayed GREEN, and the guard was right: with b371's scroll net in place
   every declared CTA IS reachable at 360px tall. "Make the screen silly" does
   not test a layout guard; it tests whether the layout survives, which is the
   product's job, not the harness's.

   So each mutation below RESTORES A REAL DEFECT — the exact stylesheet state
   that shipped before this build — and names the CTA that must catch it. That
   is the only formulation that proves the guard sees the bug it was written
   for, and it doubles as an executable record of what each fix was. Every
   mutation must produce at least one problem or the run is red. */
const MUTATIONS = [
  {
    name: 'M1 — re-clip the arena (the b370 defect verbatim: the scroll net back inside @media max-height:560)',
    css: '#panel-combat[data-combat-view="fight"] .combat-arena{overflow:hidden !important}'
       + '#panel-combat[data-combat-view="fight"] .fs-view{overflow-y:visible !important}'
       + '#panel-combat .arena-vs.fs-stage .arena-side.foe .arena-portrait{'
       + 'width:min(42vh,340px) !important;height:min(42vh,340px) !important}',
    viewports: [{ w: 1366, h: 768 }],
    expect: ['combat/FIGHT'],
  },
  {
    /* DENSITY ONLY — the rail keeps its `overflow-y:auto`. That is deliberate
       and it is what makes this mutation meaningful: with the scroll intact
       the last item is still REACHABLE, so this proves the fit-without-
       scrolling clause is doing real work rather than riding on the
       reachability one. An earlier draft mutated the overflow as well and
       "caught" the defect for the wrong reason. */
    name: 'M2 — re-inflate the nav rail to its pre-b371 rhythm (Social + Settings below the fold at 768)',
    css: '.sidebar{gap:4px !important}.nav-btn{min-height:44px !important;padding:8px 10px !important}'
       + '.nav-group-label{padding:9px 12px 3px !important;margin-top:3px !important;padding-top:8px !important}'
       + '.brand{padding:8px 10px 10px !important;margin-bottom:6px !important}',
    viewports: [{ w: 1366, h: 768 }],
    expect: ['nav/RAIL-LAST-ITEM'],
  },
  /* NO M3 FOR #char-shell, AND THE ABSENCE IS THE HONEST ANSWER.
     The audit reported the Character screen's skill rows as unreachable at
     922x423 (Bounty Hunter at y=527 on a 423px screen). MEASURED: they are
     not. `#panel-character` is `overflow-y:auto` with 479px of travel and the
     deepest row bottoms at 865, so a scroll lands it at 386 — below the fold,
     which is what the audit saw, but reachable, which it did not check. Same
     methodology as the sidebar finding.
     What IS real there is smaller and structural: `min-height:0` let the shell
     be shorter than its own pane, and the pane's `overflow:visible` spill does
     not count toward any ancestor's scrollHeight, so the panel under-reported
     its scroll extent by 14px. b371 fixes that. A 14px shortfall cannot be
     caught by a viewport guard without a fixture tuned to within 14px of the
     boundary, which is a test that breaks every time a row is added — so the
     contract is asserted directly instead, in smoke-test.js
     ('b371: the Character panel can scroll to the bottom of its own content'),
     where it is exact and mutation-proven. Claiming it here would be claiming
     coverage this file does not have. */
  {
    name: 'M3 — drop a fixed bar over the bottom of the screen (proves the HIT TEST is live, not just the box maths)',
    css: 'body::after{content:"";position:fixed;left:0;right:0;bottom:0;height:140px;'
       + 'background:rgba(0,0,0,.5);z-index:2147483000;pointer-events:auto}',
    viewports: [{ w: 1440, h: 900 }],
    expect: ['combat/FIGHT'],
  },
];
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`
    || process.argv[1]?.endsWith('reachability.mjs')) {
  const { chromium } = await import('playwright');
  const mutate = process.argv.includes('--mutate');
  const { server, port } = await serve();
  const browser = await chromium.launch();
  const url = `http://127.0.0.1:${port}/index.html`;
  if (mutate) {
    let escaped = 0;
    for (const m of MUTATIONS) {
      const problems = await reachabilityGuard(browser, url,
        { viewports: m.viewports, injectCss: m.css, only: m.expect });
      if (!problems.length) {
        console.log(`  ✗ ESCAPED — ${m.name}`);
        console.log('      the guard stayed green with the defect planted; it is not asserting this.');
        escaped++;
      } else {
        console.log(`  ✓ caught — ${m.name}`);
        problems.slice(0, 2).forEach((p) => console.log('        ' + p));
      }
    }
    if (escaped) {
      console.log(`\n${escaped} of ${MUTATIONS.length} planted defects ESCAPED the reachability guard.`);
      process.exitCode = 1;
    } else {
      console.log(`\nMutation check green — all ${MUTATIONS.length} planted defects were caught.`);
    }
  } else {
    const problems = await reachabilityGuard(browser, url);
    if (problems.length) {
      console.log(`Reachability guard — ${problems.length} FAILURE(S):`);
      problems.forEach((p) => console.log('  ✗ ' + p));
      process.exitCode = 1;
    } else {
      console.log(`Reachability guard — every declared CTA is on screen and hit-testable at `
        + VIEWPORTS.map((v) => `${v.w}x${v.h}`).join(', ') + '.');
    }
  }
  await browser.close();
  server.close();
}
