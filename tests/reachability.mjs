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

/* THE DESKTOP-MODE BANNER PASS (b553), and it is a SECOND pass on purpose.
   Until this lane the banner reached this guard only by ACCIDENT, and on one
   machine. Playwright leaves `screen` equal to the viewport, so at 922x423
   `screen.height` is 423 — under the detector's PHONE_MAX_SHORT_EDGE of 500 —
   and on a Windows PC with a touch digitizer `navigator.maxTouchPoints` is 10
   with a desktop UA, so `looksLikeDesktopMode()` came back TRUE and the banner
   mounted inside the probe unasked. KILL_OVERLAYS then removed it, which is
   why the four ordinary passes above say nothing about it either way. GitHub's
   runner has no digitizer, the predicate is false there, and the banner was
   never on screen for any of it. That is exactly how b553 shipped in b550: the
   shortened shell left `.main` on `height:100vh`, `.app{overflow:hidden}` cut
   the bottom 88px off every screen, and FIGHT/EAT/STOP, the last Buy and the
   last Accept were unreachable for the very cohort the banner exists for.
   So the banner is now MOUNTED DELIBERATELY, by the detector's own exported
   `__hrDesktopModeShowBanner()`, at the one viewport a phone in 'Desktop site'
   mode actually presents — and the environment above is pinned so it can never
   mount by accident again. Same CTAs, same PROBE, findings labelled
   `922x423+banner`. */
export const BANNER_PASSES = [
  { w: 922, h: 423, banner: true },
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
  const scrollChain = (el) => {
    const chain = [];
    for (let p = el.parentElement; p; p = p.parentElement) chain.push(p);
    const doc = document.scrollingElement || document.documentElement;
    if (doc && !chain.includes(doc)) chain.push(doc);
    return chain.reverse();   // outermost first
  };

  const onePass = (el) => {
    let moved = 0;
    const doc = document.scrollingElement || document.documentElement;
    for (const p of scrollChain(el)) {
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

  /* ONE PASS IS NOT WHAT A PLAYER DOES, and the CI red of 2026-09-23 is the
     receipt: `character/LAST-SKILL-ROW (506px used, still off)`. A single
     outermost-to-innermost sweep lands the box where the geometry AT THAT
     MOMENT said it should go; moving an outer container changes where the
     inner one has to sit, and a list still filling in grows under the scroll
     we just made. A player keeps scrolling until the thing stops moving, so
     this does too — up to 6 passes, stopping the moment a pass achieves
     nothing. It cannot turn a genuinely unreachable control green: with no
     scrollable ancestor (the b370 defect, mutation M1/M4) every pass moves
     0px and the verdict is unchanged. */
  const userScroll = (el) => {
    let moved = 0;
    for (let i = 0; i < 6; i++) {
      const step = onePass(el);
      moved += step;
      if (step < 1) break;
    }
    return moved;
  };

  return (async () => {
    // ── open the screen ──────────────────────────────────────────────
    /* EACH STEP WAITS FOR ITS OWN EFFECT, up to a ceiling, instead of sleeping
       a number that was long enough on the machine it was written on. The
       2026-09-23 CI red reported combat/EAT and combat/STOP off screen with
       0-1px of travel, which is what measuring the PRE-fight screen looks like:
       if the click that opens the fight view has not taken effect after 900ms,
       the sleep expires anyway and the probe measures whatever is up. The
       ceilings below are far past any real transition, and they are ceilings —
       a screen that opens in 80ms costs 80ms. */
    const until = async (ok, ms) => {
      const end = Date.now() + ms;
      while (Date.now() < end) { try { if (ok()) return true; } catch (e) {} await sleep(60); }
      return false;
    };

    for (const step of spec.open) {
      if (step.startsWith('tab:')) {
        const t = step.slice(4);
        try { if (typeof window.showTab === 'function') window.showTab(t); } catch (e) {}
        await until(() => laidOut(document.getElementById('panel-' + t)), 3_000);
        await sleep(250);
      } else if (step === 'monster') {
        const c = [...document.querySelectorAll('[data-monster]')].find(laidOut);
        if (c) c.click();
        await until(() => !![...document.querySelectorAll('.fs-fight')].find(laidOut), 3_000);
        await sleep(250);
      } else if (step === 'fight') {
        const f = [...document.querySelectorAll('.fs-fight')].find(laidOut);
        if (f) f.click();
        await until(() => !!document.querySelector('#panel-combat[data-combat-view="fight"]'), 3_000);
        await sleep(250);
      }
    }
    await sleep(200);

    if (spec.skipIf === '__no-rail__') {
      const sb = document.querySelector('.sidebar');
      if (!sb || !laidOut(sb)) return { skipped: 'the nav rail is not rendered at this viewport' };
    }

    /* WAIT FOR THE SUBJECT, THEN FOR THE GEOMETRY TO STOP MOVING — and this is
       the fix for the 2026-09-23 CI red, where six CTAs failed at 922x423 on a
       commit that touched no src/** and no CSS, and passed standalone on the
       same SHA an hour later. The steps above are fixed sleeps (450ms for a
       tab, 900ms for a click). On a loaded two-core runner they are not enough:
       the screen is measured while it is still laying out, so a flex pane has
       not resolved its scroll extent yet (`0px of travel used` on a panel that
       scrolls perfectly well once it has) and a list is still appending rows
       under the scroll we just made (`506px used, still off`). Both readings
       are artefacts of WHEN we looked, not of the layout.
       So: wait for the control to exist and be laid out, then hold still until
       two consecutive animation frames report the same box AND the same scroll
       extents on every ancestor. This cannot make a real defect green — a
       control with no scrollable ancestor settles immediately and is still off
       screen (mutations M1/M4), and a covered one settles under its cover
       (M3). What it removes is the half-rendered reading. */
    /* rAF NEVER FIRES IN A PAGE CHROMIUM CONSIDERS HIDDEN, and this guard runs
       on a browser that already has another page open. Racing it against a
       timer means a throttled page settles on the clock instead of hanging
       here until page.evaluate gives up. */
    const raf = () => Promise.race([
      new Promise((r) => requestAnimationFrame(() => r())),
      sleep(120),
    ]);

    const geomKey = (node) => {
      /* CONNECTIVITY IS PART OF THE GEOMETRY, and leaving it out is what the
         2026-09-24 red was made of. A node the page has replaced reports a
         0x0 box forever, so it "settles" on the first frame and every later
         reading is taken on a corpse: `y 0..0`, every ancestor
         `client:0 scroll:0`, and `overflow-y` the EMPTY STRING that
         getComputedStyle returns for an unrendered element. That reads as
         COVERED. Keying on isConnected makes the settle loop see the swap. */
      if (!node.isConnected) return 'DETACHED';
      const b = node.getBoundingClientRect();
      const parts = [Math.round(b.top), Math.round(b.bottom), Math.round(b.left), Math.round(b.right),
        innerWidth, innerHeight];
      let n = 0;
      for (let p = node.parentElement; p && n < 12; p = p.parentElement, n++) {
        parts.push(p.clientHeight, p.scrollHeight, p.scrollTop);
      }
      return parts.join(',');
    };

    const settle = async (node) => {
      let prev = null;
      for (let i = 0; i < 40; i++) {
        const key = geomKey(node);
        if (key === prev) return { frames: i, stable: true };
        prev = key;
        await raf();
        await sleep(50);
      }
      return { frames: 40, stable: false };
    };

    /* The subject may still be rendering. Waiting for it is not leniency: a
       control that never arrives is still reported missing, just 5s later. */
    let el = null;
    for (let i = 0; i < 50; i++) {
      el = pick(spec.sel, spec.last);
      if (el) break;
      await sleep(100);
    }
    if (!el) return { missing: true };

    const fits = () => {
      const b = el.getBoundingClientRect();
      return b.top >= -1 && b.bottom <= innerHeight + 1 && b.left >= -1 && b.right <= innerWidth + 1;
    };

    /* MEASURE A NODE THE PAGE STILL OWNS, and re-pick when it does not — the
       root cause of the 2026-09-24 red and the only thing in this file that
       was ever wrong about it. A live surface re-renders under the probe: the
       Profile header is rebuilt by the 200ms combat tick, the activity bar by
       its own, a list by a late fixture. `pick()` returns the node that was
       there THEN; by the time the box is read the panel has been replaced and
       the handle is an orphan. Measuring an orphan is not a lenient reading of
       the layout, it is a reading of no layout at all, and it reports the
       control COVERED at y 0..0 on a screen where a player can press it.
       So: settle, and if the subject was swapped, pick the fresh one and start
       the measurement over. Bounded at 4 attempts — a surface that never stops
       swapping its own CTA is itself the finding, and says so below rather
       than looping. This cannot make a real defect green: the re-picked node
       is the SAME selector on the SAME screen and every geometric assertion
       runs on it unchanged (mutations M1–M4 all stay caught). */
    let settled = null;
    let fitsUnscrolled = false;
    let moved = 0;
    let attempts = 0;
    let measured = false;
    while (attempts < 4) {
      attempts++;
      settled = await settle(el);
      if (!el.isConnected) {
        const fresh = pick(spec.sel, spec.last);
        if (!fresh) break;
        el = fresh; continue;
      }
      fitsUnscrolled = fits();
      moved = 0;
      if (!spec.noScroll) {
        /* Scroll, let the consequences of scrolling finish, scroll again if the
           geometry moved under us. Three rounds of (scroll → settle) is past the
           point any real surface keeps changing. */
        for (let round = 0; round < 3; round++) {
          const step = userScroll(el);
          moved += step;
          const afterScroll = geomKey(el);
          settled = await settle(el);
          if (step < 1 && geomKey(el) === afterScroll) break;
        }
      }
      /* A READING ONLY COUNTS IF THE PAGE STILL OWNS THE NODE IT WAS TAKEN FROM.
         The subject can be swapped DURING the scroll rounds as easily as before
         them, and the first draft of this loop tested connectivity only after
         re-picking — which meant the freshly picked node was trivially connected
         and the churn verdict below could never fire. Mutation M5 escaped on
         exactly that, which is what mutations are for. */
      if (el.isConnected) { measured = true; break; }
      const fresh = pick(spec.sel, spec.last);
      if (!fresh) break;
      el = fresh;
    }
    if (!measured) {
      return { churning: true, el: name(el), attempts };
    }
    const r = el.getBoundingClientRect();

    /* HIT-TEST THE POINT A PLAYER CAN ACTUALLY CLICK, which is not always the
       geometric centre — and the banner pass is what proved it. At 922x423
       with the desktop-mode banner up, `#panel-character`'s window is 157px
       while `#csk-account` is a 336px BLOCK: scrolled to the bottom of its own
       list it runs y 65..401 inside a window of 258..415, so its centre at
       y=233 is a hundred pixels above the window and elementFromPoint there
       returns the quest strip. The guard called that COVERED. It is not: every
       cell of that block is readable and clickable, one scroll position apart,
       which is what a container twice the height of its window means. The
       geometric centre of a subject bigger than its own scroll window is a
       point no scroll position can expose, so asserting on it is asserting on
       an artefact — CLAUDE.md §2, a guard that is wrong is fixed, not
       tolerated and not loosened.
       So the point is the centre of the VISIBLE rect: the box intersected with
       every clipping ancestor and the viewport. This is strictly MORE
       assertive than what it replaces, because an intersection that comes back
       EMPTY is now a failure in its own right — a control clipped entirely out
       of existence by an `overflow:hidden` ancestor used to pass `fits()` on
       the strength of a box that was inside the viewport but painted nowhere,
       which is b553's exact shape (`.app{overflow:hidden}` slicing the bottom
       88px off every screen). It cannot make a covered control green: the hit
       test still runs, on a point inside the subject, and a scrim over the
       visible area still blocks it (mutation M3). */
    const clipOf = (node) => {
      let top = 0, left = 0, right = innerWidth, bottom = innerHeight;
      for (let p = node.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const b = p.getBoundingClientRect();
        top = Math.max(top, b.top); left = Math.max(left, b.left);
        right = Math.min(right, b.right); bottom = Math.min(bottom, b.bottom);
      }
      return { top, left, right, bottom };
    };
    const clip = clipOf(el);
    const vTop = Math.max(r.top, clip.top), vBottom = Math.min(r.bottom, clip.bottom);
    const vLeft = Math.max(r.left, clip.left), vRight = Math.min(r.right, clip.right);
    const clippedAway = !(vRight - vLeft > 1 && vBottom - vTop > 1);
    const inView = spec.noScroll ? fitsUnscrolled : (fits() && !clippedAway);

    const cx = (vLeft + vRight) / 2;
    const cy = (vTop + vBottom) / 2;
    // A centre outside the viewport cannot be hit-tested at all — say so
    // rather than reporting whatever elementFromPoint returns for a clamped
    // point, which is how "11px visible" reads as a pass.
    const inside = !clippedAway && cx >= 0 && cx < innerWidth && cy >= 0 && cy < innerHeight;
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

    /* WHAT THE PAGE LOOKED LIKE WHEN IT FAILED. A red that reads "OFF SCREEN
       after scrolling everything a player can scroll (0px of travel used)" and
       stops there cannot be told apart from a red caused by a modal nobody
       closed, a body scroll lock, a screen-covering scrim or a half-settled
       layout — which is exactly the hour the 2026-09-23 CI red cost, because
       the run that produced it could not be read after the fact. Gathered only
       on a failure (it walks the DOM), and printed with the finding. */
    const snapshot = () => {
      const dialogs = [...document.querySelectorAll(
        '[role=dialog]:not([hidden]),dialog[open],.modal.open,.ftue-root,.ftue-overlay,'
        + '.qm-overlay,.dr-overlay,#hr-dl-modal,.inv-detail.show')]
        .filter(laidOut).map(name);
      const covers = [];
      const all = document.querySelectorAll('body *');
      for (let i = 0; i < all.length && covers.length < 4; i++) {
        const e = all[i];
        const cs = getComputedStyle(e);
        if (cs.position !== 'fixed' || cs.pointerEvents === 'none') continue;
        if (!laidOut(e)) continue;
        const b = e.getBoundingClientRect();
        if (b.width < innerWidth * 0.5 || b.height < innerHeight * 0.3) continue;
        covers.push(`${name(e)} ${Math.round(b.width)}x${Math.round(b.height)}@y${Math.round(b.top)}`);
      }
      const chain = [];
      let n = 0;
      for (let p = el.parentElement; p && n < 6; p = p.parentElement, n++) {
        const cs = getComputedStyle(p);
        chain.push(`${name(p)}{oy:${cs.overflowY} client:${p.clientHeight} scroll:${p.scrollHeight}`
          + ` top:${p.scrollTop}}`);
      }
      const ov = (sel) => {
        const e = typeof sel === 'string' ? document.querySelector(sel) : sel;
        if (!e) return `${sel}:absent`;
        const cs = getComputedStyle(e);
        return `${typeof sel === 'string' ? sel : name(e)}:${cs.overflowY}/${cs.position}`;
      };
      return {
        settled: settled.stable, settleFrames: settled.frames,
        ready: document.readyState,
        booted: window.__hrBooted === true, iconsAt: !!window.__hrIconsReadyAt,
        bodyClass: (document.body.className || '(none)').slice(0, 160),
        htmlClass: (document.documentElement.className || '(none)').slice(0, 120),
        locks: [ov(document.documentElement), ov(document.body), ov('.main'), ov('.app')].join(' '),
        vp: `${innerWidth}x${innerHeight} visual:${Math.round(visualViewport?.width || 0)}`
          + `x${Math.round(visualViewport?.height || 0)}@${(visualViewport?.scale ?? 1)}`,
        dialogs, covers, chain,
      };
    };

    return {
      el: name(el), scrolled: Math.round(moved), noScroll: !!spec.noScroll,
      clippedAway,
      clip: `${Math.round(clip.top)}..${Math.round(clip.bottom)}`,
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      left: Math.round(r.left), right: Math.round(r.right),
      vh: innerHeight, vw: innerWidth,
      inView, hittable, blocker: hittable ? null : name(hit),
      state: (inView && hittable) ? null : snapshot(),
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
const KILL_OVERLAYS = (keepBanner) => {
  try { if (window.G) { window.G.ftueDone = true; window.G.ftueStep = 99; } } catch (e) {}
  window.__hrKeepDesktopBanner = !!keepBanner;
  const kill = () => {
    /* On the ORDINARY passes the desktop-mode banner is a HARNESS ARTIFACT and
       removing it is not sweeping a defect under the rug — it is removing a
       variable the machine, not the product, supplies. Chromium on a PC with a
       touch digitizer reports `navigator.maxTouchPoints = 10`, and Playwright
       leaves `screen` equal to the viewport, so at 922x423 the detector saw
       "touch device, 423px short edge, non-mobile UA" and mounted the banner —
       on THAT machine and not on GitHub's runner, which has no digitizer. A
       guard whose subject depends on the host's hardware asserts nothing, in
       either direction, which is why the context below now pins `screen` and
       `hasTouch` and the predicate is false by construction everywhere.
       The banner is still tested, deliberately, by BANNER_PASSES: that pass
       sets `keepBanner` and mounts it through the detector's own entry point,
       so this sweep must leave it alone there. The detector's own thresholds
       are asserted directly by the b371 test in smoke-test.js, which is the
       right place for them. */
    if (!window.__hrKeepDesktopBanner) {
      const dm = document.getElementById('hr-desktopmode-banner');
      if (dm) dm.remove();
    }
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

/* PUT THE FIGHT DOWN BEFORE MEASURING THE NEXT SCREEN.
   `combat/EAT` and `combat/STOP` open a REAL fight, and nothing used to end
   it, so every CTA declared after them — character, bounty, market, shop and
   the daily claim — was measured on a page where a 200ms combat tick was
   rebuilding surfaces underneath the probe. On a quiet runner the rebuild
   happens to miss the window between picking the control and reading its box;
   on a loaded one it does not, and the guard reports the control COVERED at
   `y 0..0` with `oy:` blank — the signature of a node the page has replaced.
   That is the whole of the 2026-09-23/24 order-dependent red: six CTAs at
   922x423 on a Windows runner, `home/CLAIM` here, green on CI, on one SHA.
   Measured A/B on 2026-09-24: with a fight live the Profile header's `.hd-cta`
   is detached inside 750ms; with no fight it is still the same node after 2.5s.

   Ended through the CONTROL A PLAYER PRESSES — `.fs-stop`, which this file
   declares as a CTA in its own right — so the app unwinds the fight itself.
   `window.stopCombat()` is the fallback for the case where Stop is not on the
   screen; the class is never stripped by hand, which would leave every combat
   module believing the fight is still running. */
const QUIESCE = async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fighting = () => !!(window.G && window.G.activeMonster);
  if (!fighting()) return;
  const stop = [...document.querySelectorAll('#panel-combat .fs-stop')]
    .find((e) => e.getBoundingClientRect().height > 1);
  try { if (stop) stop.click(); else if (typeof window.stopCombat === 'function') window.stopCombat(); } catch (e) {}
  for (let i = 0; i < 40 && fighting(); i++) await sleep(50);
  /* A Stop the app refused (a confirm sheet, a mutex) still has to leave the
     page quiet or the next screen is measured under a live tick. */
  if (fighting()) { try { window.stopCombat && window.stopCombat(); } catch (e) {} }
  for (let i = 0; i < 20 && fighting(); i++) await sleep(50);
};

/**
 * @param {import('playwright').Browser} browser
 * @param {string} url
 * @param {{viewports?: typeof VIEWPORTS, injectCss?: string, injectJs?: string,
 *           only?: string[], verify?: string}} [opts]
 *        — all four exist for the mutation harness; production callers pass
 *        nothing. `verify` is a mutation's assertion about ITSELF: a function
 *        body evaluated in the page after the CTA loop, on the mutation's own
 *        screen, returning a string when the PLANT failed to take. It exists
 *        because M4's plant went inert (a `!important` padding at higher
 *        specificity cancelled it) while the mutation still reported `caught`
 *        on Linux off unrelated font metrics — a mutation that is caught by
 *        accident proves nothing, and nothing in this file could tell the
 *        difference. Its findings are tagged PLANT_FAILED and read separately
 *        by the runner, so they can never be mistaken for the defect.
 * @returns {Promise<string[]>} problems (empty === green)
 */
/* Renders the page-state capture onto a finding. Kept out of PROBE so the
   in-page half stays serialisable and cheap. */
function describe(st) {
  if (!st) return '';
  const L = [];
  L.push(`      page: ${st.vp}, readyState=${st.ready}, __hrBooted=${st.booted}, `
    + `iconsReady=${st.iconsAt}, layout ${st.settled ? `settled after ${st.settleFrames} frame(s)`
      : 'NEVER SETTLED (still moving after 40 frames)'}`);
  L.push(`      locks: ${st.locks}`);
  L.push(`      body.class=${st.bodyClass}  html.class=${st.htmlClass}`);
  L.push(`      open dialogs: ${st.dialogs.length ? st.dialogs.join(', ') : 'none'}`);
  L.push(`      viewport-covering fixed layers: ${st.covers.length ? st.covers.join(', ') : 'none'}`);
  L.push(`      scroll chain: ${st.chain.join(' < ')}`);
  return '\n' + L.join('\n');
}

/* Tag for a `verify` finding. Kept distinct from every real problem string so
   the mutation runner can never count "the plant did not apply" as "the guard
   caught the defect" — the exact confusion that let M4 rot. */
export const PLANT_FAILED = 'PLANT_FAILED';

export async function reachabilityGuard(browser, url, opts = {}) {
  const problems = [];
  const viewports = opts.viewports || [...VIEWPORTS, ...BANNER_PASSES];

  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 1,
      /* PIN THE DEVICE, because this guard was reading the host's hardware
         (2026-09-24). Playwright defaults `screen` to the viewport, so at
         922x423 `screen.height` was 423 — under the detector's
         PHONE_MAX_SHORT_EDGE of 500 — and on a PC with a touch digitizer
         `navigator.maxTouchPoints` is 10 against a desktop UA. Every clause of
         `looksLikeDesktopMode()` passed and the desktop-mode banner mounted
         inside the probe by accident; GitHub's runner has no digitizer, so the
         same guard on the same SHA had a different page in front of it. That
         is how b553 (`.main` still 100vh under the shortened shell) shipped in
         b550 unseen by a guard that was, by luck, looking straight at it.
         A physically large screen and no touch make the predicate FALSE by
         construction on every machine, so the passes below measure the layout
         a desktop player gets and nothing else. The banner is not dropped: it
         is mounted on purpose by BANNER_PASSES, through the detector's own
         `__hrDesktopModeShowBanner()`. */
      screen: { width: 1920, height: 1080 },
      hasTouch: false,
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
      await page.waitForFunction(() => typeof window.G !== 'undefined', { timeout: 60_000 });
      await page.waitForTimeout(3_500);
      await page.evaluate(SEED);
      await page.waitForTimeout(400);
      await page.evaluate(KILL_OVERLAYS, !!vp.banner);
      /* MOUNT THE BANNER THROUGH THE PRODUCT'S OWN PATH. `build()` is what the
         detector calls when it fires for real, so the banner that appears here
         is the shipped one — same inline styles, same ResizeObserver, same
         `reserve()` publishing `--hr-dm-banner-h` and flagging the body. No
         part of the reservation is faked, which is the point: the CTAs below
         are then measured against art-direction.css's real release of it.
         Waiting for BOTH the attribute and a non-zero measured height is what
         makes the pass honest — a banner that mounted but never published its
         height would leave the shell full-size and the pass would be green on
         a page the release never touched. A timeout here is reported as a
         harness failure by the catch below, which is the correct verdict: the
         pass could not be set up, so it has asserted nothing. */
      if (vp.banner) {
        await page.evaluate(() => {
          try { window.__hrDesktopModeShowBanner && window.__hrDesktopModeShowBanner(); } catch (e) {}
        });
        await page.waitForFunction(() => {
          const bar = document.getElementById('hr-desktopmode-banner');
          if (!bar || !bar.isConnected) return false;
          if (document.body.getAttribute('data-hr-desktop-mode') !== '1') return false;
          const h = parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--hr-dm-banner-h')) || 0;
          return h > 0;
        }, { timeout: 20_000 });
        await page.waitForTimeout(400);
      }
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
      /* JS mutations exist for ONE mutation and would not otherwise be here:
         the churn defect cannot be planted in a stylesheet. A stylesheet
         cannot detach a node, and detaching the subject under the probe is
         precisely the failure this build learned to see. Same discipline as
         injectCss — evaluated into the page, never written to disk. */
      if (opts.injectJs) {
        await page.evaluate((js) => { try { (new Function(js))(); } catch (e) {} }, opts.injectJs);
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(200);

      for (const spec of CTAS) {
        if (opts.only && !opts.only.includes(spec.id)) continue;
        /* End any fight a previous spec started BEFORE opening the next screen,
           so this spec's screen is not measured under a live combat tick. */
        if (!spec.open.includes('fight')) await page.evaluate(QUIESCE).catch(() => {});
        // Re-kill: opening a screen can raise a new modal (level-up, tour step).
        /* And on a banner pass, re-assert the banner the same way. The detector
           re-evaluates on every `resize`/`orientationchange`, and with the
           device pinned its verdict is false — so any stray resize would tear
           the banner down mid-pass and the rest of the CTAs would be measured
           on a full-height shell without saying so. `build()` is idempotent
           (it returns null when the banner is already mounted), so on the
           ordinary path this costs one no-op call. */
        await page.evaluate((keepBanner) => {
          try { window.__hrKillOverlays && window.__hrKillOverlays(); } catch (e) {}
          if (keepBanner) {
            try { window.__hrDesktopModeShowBanner && window.__hrDesktopModeShowBanner(); } catch (e) {}
          }
        }, !!vp.banner);
        const r = await page.evaluate(PROBE, spec).catch((e) => ({ threw: String(e && e.message || e).slice(0, 120) }));
        const at = `${vp.w}x${vp.h}${vp.banner ? '+banner' : ''} ${spec.id}`;
        if (r.threw) { problems.push(`${at}: probe threw — ${r.threw}`); continue; }
        if (r.skipped) continue;
        if (r.missing) { problems.push(`${at}: the control does not exist or is not laid out (${spec.sel})`); continue; }
        /* NOT a lenient skip: the screen replaced its own primary control four
           times while the probe tried to hold it still, which is a finding
           about the screen and is reported as one. */
        if (r.churning) {
          problems.push(`${at}: the screen REPLACES this control faster than it can be measured — `
            + `${r.el} was detached on all ${r.attempts} attempts. Something is re-rendering this `
            + `surface on a tick; a player cannot press a button that is rebuilt under the cursor. `
            + `${spec.why}`);
          continue;
        }
        if (!r.inView) {
          problems.push(`${at}: ` + (r.noScroll
            ? `BELOW THE FOLD — this control must be visible WITHOUT scrolling`
            : r.clippedAway
              ? `CLIPPED AWAY — no part of this control is painted: its box survives inside the `
                + `viewport but every pixel of it falls outside the clipping ancestors (visible band `
                + `y ${r.clip}), so it is on screen only in the arithmetic`
              : `OFF SCREEN after scrolling everything a player can scroll (${r.scrolled}px of travel used)`)
            + ` — ${r.el} at y ${r.top}..${r.bottom} in a ${r.vh}px viewport, `
            + `x ${r.left}..${r.right} in ${r.vw}. ${spec.why}` + describe(r.state));
          continue;
        }
        if (!r.hittable) {
          problems.push(`${at}: COVERED — a click at the centre of ${r.el} (y ${r.top}..${r.bottom}) `
            + `lands on ${r.blocker}. ${spec.why}` + describe(r.state));
        }
      }
      /* LAST, so the mutation's own screen is still the one on show and the
         computed values read here are the ones the CTAs above were measured
         against. A mutation only gets to claim a defect it actually planted. */
      if (opts.verify) {
        const v = await page.evaluate((src) => {
          try { return (new Function(src))() || null; }
          catch (e) { return 'verify threw — ' + String(e && e.message || e).slice(0, 120); }
        }, opts.verify).catch((e) => 'verify threw — ' + String(e && e.message || e).slice(0, 120));
        if (v) problems.push(`${vp.w}x${vp.h}${vp.banner ? '+banner' : ''}: ${PLANT_FAILED} — ${v}`);
      }
    } catch (err) {
      problems.push(`${vp.w}x${vp.h}${vp.banner ? '+banner' : ''}: harness failure — ${err.message}`);
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
    /* RE-MEASURED 2026-09-24, AND THE OLD FORM OF THIS MUTATION HAD GONE INERT
       — which is worth more than the mutation it replaces, because a mutation
       nobody re-measures is a green line that asserts nothing. `--mutate` was
       already red for `M1 ESCAPED` on set/b553 before this lane touched the
       file (verified against the unmodified guard at HEAD), so this is a repair,
       not a regression.
       As written it reverted b370's two clip clauses and sized the foe portrait
       at `min(42vh,340px)`. With all three planted, FIGHT measured y 648..685 in
       a 768px viewport — on screen, so the guard was RIGHT to stay green.
       Measured at 42vh, 52vh, 58vh and 64vh: FIGHT does not move one pixel. The
       portrait clause is inert, and b513 says why in this very file — the stage
       is `flex: 1 0 auto; max-height: 100%` with row 1 on `minmax(0, cap)`, so
       the plate is whatever the card has left and a bigger REQUEST buys nothing.
       The clamp, not the portrait, is what closed b370.
       So the plant reverts THE CLAMP, which is the pre-b513 state the defect
       actually shipped in: `max-height: none` puts the stage back to a no-shrink
       flex item that can outgrow its clipping card, and a 340px plate then pays
       for nothing. Measured: FIGHT lands at y 785..822 in a 768px viewport with
       not one auto/scroll box in its chain — b370's own reading was y 776..813.
       Keep the two net clauses: without them `.fs-view` scrolls and the control
       is reachable, which is the §3.9 net doing its job. */
    name: 'M1 — revert b513\'s stage clamp and b371\'s scroll net (b370 verbatim: FIGHT at y 785..822 in a 768px viewport, nothing in the chain a player can scroll)',
    css: '#panel-combat[data-combat-view="fight"] .combat-arena{overflow:hidden !important}'
       + '#panel-combat[data-combat-view="fight"] .fs-view{overflow-y:visible !important}'
       + '#panel-combat .arena-vs.fs-stage{max-height:none !important}'
       + '#panel-combat .arena-vs.fs-stage .arena-side .arena-portrait{'
       + 'width:340px !important;height:340px !important}',
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
    /* THE GUARD-FIX OF 2026-09-23 HAS ITS OWN MUTATION, and it needs one.
       That change made the probe wait for the subject and hold still until the
       geometry stops moving, and made the scroll multi-pass, because six CTAs
       went red at 922x423 on a commit that touched no src/** and no CSS. Every
       one of those cures makes the guard MORE patient, and a more patient
       guard is one edit away from a guard that waits until the problem goes
       away. M1 and M3 prove the desktop verdicts survived it; this proves the
       MOBILE one did, at the exact viewport the red was reported on.
       Synthetic rather than a shipped defect — 922x423 has no b-number of its
       own for this — but the shape is b370's verbatim: content below the fold
       with nothing in the chain that a player can scroll.

       THE PLANT WAS INERT UNTIL 2026-09-24, AND IT WAS STILL REPORTED `caught`.
       It pushed on `#panel-combat` (1,0,0); combat-screens.css:1218
       `@media (max-height:560px) #panel-combat.active { padding: 6px !important }`
       is (1,1,0), and between two importants the higher specificity wins — so
       the computed padding-top under the mutation was 6px and the push never
       happened. MEASURED at 922x423 with the old plant: FIGHT at y 318..347 on
       a 423px screen — on screen, and the mutation's own `caught` line came
       from `COVERED` (a click landing on `button.csb-btn`), which is not the
       defect this mutation names. On Windows it ESCAPED outright. Both verdicts
       were accidents of platform font metrics, and §4 is explicit that a guard
       which has never been red for its stated reason is not a guard.
       The universal half leaked too, and by more than specificity arithmetic
       suggests: `#panel-combat *` is also (1,0,0) and lost to
       combat-screens.css:1012 `#panel-combat[data-combat-view="fight"]
       .combat-arena { overflow: visible !important }` at (1,2,0) — which is the
       `.card` in the fight stage, the node carrying `class="card combat-arena"`.
       So both halves now DOUBLE THE ID (`#panel-combat#panel-combat…`, (2,…)):
       an id count of two outranks every single-id rule in the product whatever
       its class tail, so no future rule can quietly cancel the plant the way
       1218 and 1012 did. The transform is the belt to that brace — a
       `translateY` is not a padding and no padding rule can cancel it at any
       specificity — and it is what makes the displacement the same on every
       platform instead of a few pixels of font metrics.
       MEASURED with this plant: padding-top computes 360px, every box in
       FIGHT's chain is `overflow:hidden`, and FIGHT lands at y 977..1005 on a
       423px screen — `CLIPPED AWAY`, for exactly the reason the name claims.
       `verify` below is the standing half of the repair: the mutation now
       asserts its OWN preconditions, so the next rule that outranks the plant
       makes this red as INERT PLANT rather than passing on an accident. */
    name: 'M4 — push FIGHT below the fold at the mobile target with nothing that scrolls (the settle/multi-pass cure must not swallow it)',
    css: '#panel-combat#panel-combat.active{padding-top:360px !important}'
       + '#panel-combat#panel-combat,#panel-combat#panel-combat *{overflow:hidden !important}'
       + '#panel-combat#panel-combat .fs-body{transform:translateY(360px) !important}',
    verify: 'var p=document.getElementById("panel-combat");'
      + 'if(!p)return "#panel-combat is not in the page";'
      + 'var bad=[];'
      + 'var pt=parseFloat(getComputedStyle(p).paddingTop)||0;'
      + 'if(pt<360)bad.push("#panel-combat padding-top computed "+pt+"px, not 360px \u2014 a rule '
      + 'of higher specificity cancelled the push");'
      + 'var b=document.querySelector("#panel-combat .fs-body");'
      + 'if(!b)bad.push("#panel-combat .fs-body is not in the page");'
      + 'else if(getComputedStyle(b).transform==="none")'
      + 'bad.push(".fs-body transform computed none \u2014 the 360px shift did not apply");'
      + 'var leak=[],n=document.querySelector("#panel-combat .fs-fight");'
      + 'while(n&&n!==document.documentElement){var c=getComputedStyle(n);'
      + 'if(/auto|scroll/.test(c.overflowY+" "+c.overflowX))'
      + 'leak.push((n.id?"#"+n.id:n.tagName.toLowerCase())+"."+String(n.className||"").split(" ")[0]);'
      + 'n=n.parentElement;}'
      + 'if(leak.length)bad.push("FIGHT can still be scrolled to, so the nothing-scrolls half '
      + 'did not take: "+leak.join(", "));'
      + 'return bad.length?bad.join("; "):null;',
    viewports: [{ w: 922, h: 423 }],
    expect: ['combat/FIGHT'],
  },
  {
    /* THE 2026-09-24 CURE HAS ITS OWN MUTATION, because the cure added a new
       verdict and a verdict with no mutation behind it is not an assertion.
       That red was a node the Profile header had REPLACED while the probe held
       it — a detached handle reads 0x0 forever, settles on frame one, and
       reports COVERED. The probe now re-picks a swapped subject, which is the
       right answer for a surface that rebuilds once; a surface that rebuilds
       its primary CTA on every tick is a real defect and must still be red.
       This plants exactly that: the daily claim re-created four times a second.
       If the re-pick loop ever grows into "wait until it stops", this escapes. */
    name: 'M5 — rebuild the daily-claim button on every animation frame (the re-pick cure must not swallow a CTA the screen churns)',
    /* EVERY FRAME, NOT every 250ms, and the difference is the assertion.
       Measured: at 250ms the probe re-picks the fresh node, measures it and is
       green — correctly, because a button rebuilt four times a second IS
       pressable; whatever node is under the cursor takes the click. A button
       rebuilt every frame is not: it never survives long enough to be held,
       hit-tested or focused, and the probe is right to say so rather than
       re-picking forever. This is the rate that separates the cure from a
       guard that waits until the problem goes away. */
    js: 'var ch=function(){'
      + 'var b=document.querySelector("#panel-profile .hd-cta");'
      + 'if(b&&b.parentNode){var c=b.cloneNode(true); b.parentNode.replaceChild(c,b);}'
      + 'requestAnimationFrame(ch);}; requestAnimationFrame(ch);',
    viewports: [{ w: 1366, h: 768 }],
    expect: ['home/CLAIM'],
  },
  {
    /* b553 VERBATIM, and the one mutation in this file that could not be
       written before the banner pass existed. b550 shortened `.app` by the
       banner's measured height and released the sidebar and stopped there, so
       `.main` kept `height:100vh` from legacy.css:174. `.app` is a grid whose
       single row is `auto`, so a 100vh item stretched the row back to full
       height: at 922x423 with the banner up, `.app` ran 110..423 while `.main`
       ran 110..533 and `.app{overflow:hidden}` sliced the bottom 110px off
       EVERY screen — the band FIGHT, EAT and STOP, the last Buy and the last
       Accept live in. The cohort the banner exists for could read the advice
       and then not play.
       This plants the one declaration b553 removed, on top of the real banner,
       which is the only state the defect ever existed in: that is why the
       viewport carries `banner: true` and why an ordinary 922x423 pass cannot
       host this mutation at all — with no banner the body attribute is absent
       and the rule below does not match anything. */
    name: 'M6 — put `.main` back on 100vh under the shortened shell (b553 verbatim: the bottom band of every screen sliced off behind the desktop-mode banner)',
    css: 'body[data-hr-desktop-mode] .main{height:100vh !important}',
    viewports: [{ w: 922, h: 423, banner: true }],
    expect: ['combat/FIGHT'],
  },
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
      const all = await reachabilityGuard(browser, url,
        { viewports: m.viewports, injectCss: m.css, injectJs: m.js, only: m.expect,
          verify: m.verify });
      const inert = all.filter((p) => p.includes(PLANT_FAILED));
      const problems = all.filter((p) => !p.includes(PLANT_FAILED));
      if (inert.length) {
        console.log(`  ✗ INERT PLANT — ${m.name}`);
        console.log('      the mutation did not reach the page, so whatever the guard said it said '
          + 'about the UNMUTATED layout. Any "caught" here would be an accident.');
        inert.forEach((p) => console.log('        ' + p));
        escaped++;
      } else if (!problems.length) {
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
        + VIEWPORTS.map((v) => `${v.w}x${v.h}`).join(', ')
        + ', and at ' + BANNER_PASSES.map((v) => `${v.w}x${v.h}+banner`).join(', ')
        + ' with the desktop-mode banner up.');
    }
  }
  await browser.close();
  server.close();
}
