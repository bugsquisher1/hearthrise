// ============================================================
// tests/visual-qa.mjs — the PLAYER'S-EYE pass (b284)
//
// Why this exists: the studio review was code-only, so it could not see that
// text was chopped in half, that content ran under a fixed bar, or that half a
// panel was empty. The in-app Browser pane can't screenshot here (it isn't
// composited), but the smoke runner already drives a REAL headless Chromium —
// so this reuses that substrate to walk every screen at desktop AND landscape
// phone size, capture a PNG of each, and measure the bug classes a player
// notices instantly:
//
//   clipped text · content under fixed bars · horizontal spill · tiny tap
//   targets · wasted space · duplicated/contradictory/broken copy ·
//   emoji used as artwork · dead (unwired) controls
//
//   node tests/visual-qa.mjs [--url http://localhost:8123]
//   node tests/visual-qa.mjs --selftest    mutation proof for the broken-value
//                                          detector, the font precondition and
//                                          the per-card finding key
//
// WIDTHS ARE ONLY MEASURED ONCE THE THEME'S FACES RENDER (b544). Cinzel and
// Alegreya Sans arrive from the Google Fonts CDN with `display=swap`; measured
// before they land, the page is laid out in the OS fallback, which is a
// different width on Linux than on Windows — 17 phantom P1 clips on the GitHub
// runner against a green local walk. awaitFonts() force-loads every face the
// theme's --f-* tokens name and waits (bounded); if a face never renders the
// sweep emits ERR `fonts-unloaded` and measures NO widths, so an unreachable
// CDN is a red you can read instead of a false verdict.
//
// Writes PNGs + findings.json to docs/reports/visual-qa/ and prints a summary.
// Exit code is always 0 — this is a REPORT, not a gate (run-smoke.mjs gates).
// ============================================================

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'reports', 'visual-qa');
const argv = process.argv.slice(2);
const argOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const EXTERNAL_URL = argOf('--url');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

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
        res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
      } catch { res.writeHead(404).end('not found'); }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const VIEWPORTS = [
  { key: 'desktop', width: 1440, height: 900 },
  { key: 'landscape', width: 852, height: 393 },
];
const SCREENS = ['profile', 'character', 'combat', 'skills', 'farming', 'inventory', 'house', 'events', 'shops', 'clan', 'social', 'bounty'];

/* Injected into the page — runs against a REAL rendered layout.
   ARG is an object, not a bare label: the text-metric detectors are only honest
   when the page is rendering the fonts the design asks for, so the walk hands
   the sweep the font verdict it measured (see awaitFonts). */
function SWEEP({ label, fontsMissing = [], fontStatus = '' }) {
  const vw = innerWidth, out = { screen: label, vw, vh: innerHeight, issues: [], stats: {} };
  const fontsOk = !fontsMissing.length;
  /* CARDS THAT SHARE ONE SELECTOR PATH. The six War Table destinations are
     identical markup, so `.wt-dest>.wtd-body>.wtd-main>b` names all six: the
     gate's key (screen|viewport|kind|el) cannot tell "the Dungeon card clips"
     from "the Boss of the Day card clips". Whichever card clipped on the day the
     baseline was recorded owns the key forever, which both MASKS a new clip on
     its five siblings and turns the daily boss rotation into key churn. Each
     entry pairs a repeated card with the child holding its STABLE label (the
     kicker reads "Boss of the Day" whatever monster is featured today), and the
     name carries it as a trailing annotation: `.wt-dest>…>b {Boss of the Day}`.
     Add a row here for any future repeated card; do not special-case a screen. */
  const KEYED_CARDS = [['.wt-dest', '.wtd-kick']];
  const cardTag = (el) => {
    for (const [card, label] of KEYED_CARDS) {
      const c = el.closest && el.closest(card); if (!c) continue;
      const t = ((c.querySelector(label) || {}).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24);
      if (t) return ` {${t}}`;
    }
    return '';
  };
  // SVG elements have an SVGAnimatedString className -> "[object ..." . Build a
  // real selector so a finding actually tells you WHICH element to fix.
  const nameOf = (el) => { if (!el) return '';
    const cls = (typeof el.className === 'string' ? el.className : (el.getAttribute && el.getAttribute('class')) || '').trim().split(/\s+/)[0];
    const path = [];
    let p = el.parentElement, hops = 0;
    while (p && p !== document.body && hops < 3) { const pc = (typeof p.className === 'string' ? p.className : '').trim().split(/\s+/)[0];
      if (p.id) { path.unshift('#' + p.id); break; } if (pc) path.unshift('.' + pc); p = p.parentElement; hops++; }
    const tag = cardTag(el);
    return (path.join('>') + '>' + (el.id ? '#' + el.id : '') + el.tagName.toLowerCase() + (cls ? '.' + cls : '') + tag).slice(0, 96); };
  const add = (sev, kind, detail, el) => out.issues.push({ sev, kind, detail, el: nameOf(el) });
  const vis = (el) => { const c = getComputedStyle(el); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05) return false;
    // Screen-reader-only text (the standard 1px/clip-path pattern) is deliberately
    // invisible — counting it as "clipped" is a false positive.
    if (c.clipPath === 'inset(50%)' || (c.position === 'absolute' && c.overflow === 'hidden' && el.getBoundingClientRect().width <= 2)) return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const TXT = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const panel = document.querySelector('.panel.active') || document.body;
  // Chrome (nav rail, topbar, activity bar) lives OUTSIDE the active panel — sweeping
  // only the panel is how the sliced "CHARACTER" rail label went unnoticed.
  const chrome = [...document.querySelectorAll('.bottom-nav, .sidebar, .topbar, #activity-bar')];
  const scope = [panel, ...chrome].filter(Boolean);
  const all = scope.flatMap((n) => [...n.querySelectorAll('*')]).filter(vis);
  out.stats = { els: all.length, chars: TXT(panel).length };

  /* THE FONT PRECONDITION (b544). Every width the three detectors below measure
     is a function of the face that actually painted the glyphs. Cinzel and
     Alegreya Sans come from the Google Fonts CDN with `display=swap`, so until
     they arrive the page is laid out in whatever the OS hands back for
     "Georgia, serif" / "Segoe UI, system-ui" — a DIFFERENT width per platform.
     That is why this same walk read 34 findings on Windows and 51 on the Linux
     runner: the runner measured the fallback and every long War Table name
     overflowed by 6-15px. Measuring with the wrong font produces P1s that no
     player will ever see and hides the ones they would, so an unloaded face is
     an ERR the gate fails on WITH A NAME, never a silent re-measure. */
  if (!fontsOk) {
    out.issues.push({ sev: 'ERR', kind: 'fonts-unloaded',
      detail: `text metrics NOT measured — ${fontsMissing.join(', ')} did not render (document.fonts.status=${fontStatus}). `
        + 'Every clipped-text/offscreen width would be the platform fallback\'s, not the design\'s.', el: '' });
  }
  if (fontsOk) all.forEach((el) => {
    if (el.children.length) return;
    const t = TXT(el); if (!t) return;
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible')
      add('P1', 'clipped-text', `"${t.slice(0, 30)}" (${el.scrollWidth}>${el.clientWidth})`, el);
    /* THE WALK STOPS AT A REAL SCROLLER (b550), AND HERE IS THE EVIDENCE.
       This used to climb to the first `overflow:hidden` ancestor and call any
       horizontal escape a clip. On the landscape War Table that produced eight
       P1s — "Clan Raid", "The Hollow Regent", "Events ▸" … "cut by .panel" —
       for text a player reaches by swiping: the chips live in `.wt-dest-rail`,
       which is `overflow-x:auto` and genuinely scrolled (scrollWidth 1120 in a
       776px box at 852x393, measured). `.panel` clips only what the RAIL has
       already scrolled out of view, which is what a scroller is for.

       So: an ancestor that actually scrolls on this axis ENDS the walk. That is
       a reachability verdict, not an exemption — the EXCLUDE list is untouched,
       a hidden non-scrolling parent still bites, and an element outside the
       scroller's own scrollable extent is still reported.

       Reachable is not the same as discoverable, and the eight findings were
       really about the second. So the scroller is held to account IN ITS OWN
       RIGHT: a rail carrying content past its edge with no fade mask and no
       scroll-snap gets `scroller-no-affordance` — one finding on the container
       that owns the fix, instead of six on innocent text nodes. P2, because a
       player can reach the content; the clip severity belonged to text that
       nothing could reach. */
    const r = el.getBoundingClientRect(); let p = el.parentElement;
    while (p && p !== document.body) {
      const pc = getComputedStyle(p);
      const scrollsX = ['auto', 'scroll'].includes(pc.overflowX) && p.scrollWidth > p.clientWidth + 2;
      if (scrollsX) {
        const pr = p.getBoundingClientRect();
        // Inside the scroller's reachable extent? Then this is scrolled-away, not cut.
        const reach = r.left >= pr.left - p.scrollLeft - 2
          && r.right <= pr.left - p.scrollLeft + p.scrollWidth + 2;
        if (reach) break;
      }
      if (pc.overflow === 'hidden' || pc.overflowX === 'hidden') {
        const pr = p.getBoundingClientRect();
        if (r.right > pr.right + 2 || r.left < pr.left - 2) { add('P1', 'clipped-by-parent', `"${t.slice(0, 26)}" cut by .${String(p.className).split(' ')[0]}`, el); break; }
      }
      p = p.parentElement;
    }
  });

  // The other half of the b550 rule: every sideways scroller must SAY it scrolls.
  if (fontsOk) [...new Set(all)].forEach((p) => {
    const pc = getComputedStyle(p);
    if (!['auto', 'scroll'].includes(pc.overflowX)) return;
    if (p.scrollWidth <= p.clientWidth + 2) return;
    const masked = (pc.maskImage || pc.webkitMaskImage || 'none') !== 'none';
    const snaps = (pc.scrollSnapType || 'none') !== 'none';
    if (!masked && !snaps)
      add('P2', 'scroller-no-affordance', `${p.scrollWidth}>${p.clientWidth} with no edge fade and no scroll-snap — the cut-off content reads as damage, not as "more this way"`, p);
  });

  // A "bar" is a real chrome strip (topbar/activity bar/nav) — NOT a decorative
  // full-screen backdrop or a pointer-transparent overlay, which would make every
  // element on the page look "covered".
  const bars = [...document.querySelectorAll('body *')].filter((e) => {
    if (!vis(e)) return false;
    const c = getComputedStyle(e); if (!['fixed', 'sticky'].includes(c.position)) return false;
    if (c.pointerEvents === 'none') return false;
    const r = e.getBoundingClientRect();
    if (r.height <= 14 || r.width <= vw * 0.4) return false;
    if (r.height > innerHeight * 0.35) return false;      // full-screen layer, not a bar
    return true;
  });
  bars.forEach((b) => { const br = b.getBoundingClientRect();
    all.forEach((el) => { if (el.children.length || b.contains(el)) return; const t = TXT(el); if (!t) return;
      const r = el.getBoundingClientRect(); if (r.height < 4) return;
      const ov = Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top);
      if (ov > 3 && r.left < br.right && r.right > br.left)
        add('P1', 'under-fixed-bar', `"${t.slice(0, 24)}" ${ov | 0}px under .${String(b.className).split(' ')[0] || b.id}`, el); }); });

  // Genuine spill only: an element that pokes past the viewport but is CLIPPED by
  // an ancestor (e.g. paths inside a decorative <svg> scene) causes no scrollbar and
  // is not a bug. Report only when nothing clips it.
  const clippedByAncestor = (el) => { let p = el.parentElement;
    while (p && p !== document.documentElement) { const c = getComputedStyle(p);
      if (['hidden', 'clip', 'auto', 'scroll'].includes(c.overflowX) || p.tagName.toLowerCase() === 'svg') {
        if (p.getBoundingClientRect().right <= vw + 2) return true; }
      p = p.parentElement; }
    return false; };
  if (fontsOk) all.forEach((el) => { const r = el.getBoundingClientRect();
    if (r.width > 2 && (r.right > vw + 2 || r.left < -2) && !clippedByAncestor(el))
      add('P1', 'offscreen-x', `${Math.round(r.right - vw)}px past right`, el); });

  const small = [];
  scope.forEach((n) => n.querySelectorAll('button,.btn,.chip,[onclick]').forEach((el) => { if (!vis(el)) return;
    const r = el.getBoundingClientRect(); if (r.height < 44) small.push({ h: Math.round(r.height), n: nameOf(el), t: TXT(el).slice(0, 14) }); }));
  // Honest thresholds: <36px is genuinely too small for a thumb (P1); 36-43px is a
  // deliberate density tradeoff on a short landscape screen (P3), not a defect.
  if (small.length) { small.sort((a, b) => a.h - b.h);
    const worst = small[0].h;
    add(vw <= 900 ? (worst < 36 ? 'P1' : 'P3') : 'P3', 'small-target',
      `${small.length} controls <44px — worst: ` + small.slice(0, 3).map((x) => `${x.h}px "${x.t}" ${x.n}`).join(' | '), panel); }

  const pr = panel.getBoundingClientRect(); let maxRight = 0, maxBottom = 0;
  all.forEach((el) => { const r = el.getBoundingClientRect(); if (r.width > 4 && r.height > 4) { maxRight = Math.max(maxRight, r.right); maxBottom = Math.max(maxBottom, r.bottom); } });
  const unusedR = pr.right - maxRight;
  if (all.length && unusedR > pr.width * 0.25 && pr.width > 500)
    add('P2', 'wasted-space', `${Math.round(unusedR)}px (${Math.round(unusedR / pr.width * 100)}%) of width unused`, panel);

  const txt = TXT(panel);
  const dup = txt.match(/\b(\w{3,})\s+\1\b/i); if (dup) add('P2', 'duplicate-word', `"${dup[0]}"`, panel);
  if (/0%\s*·?\s*watered/i.test(txt)) add('P2', 'contradictory-copy', '"0% · watered"', panel);
  /* BROKEN VALUES — "NaN", "undefined", "[object Object]" rendered into copy.
     Two rules this detector learned on 2026-09-11 (b536), when the daily
     rotation turned the release gate red on a card that read perfectly:

     1. THE MATCH IS CASE-SENSITIVE, because the spellings are literal. Every
        route that puts a bad number on screen — String(NaN), toFixed,
        toLocaleString, Intl.NumberFormat — renders exactly "NaN"; String(
        undefined) is exactly "undefined". The old /i flag bought nothing and
        made "NaN" match the "nan" inside any ordinary word, so the Boss of the
        Day rolling to the REVE-NAN-T was a NEW P1. "maintenance", "tenant" and
        "covenant" are the same landmine at 10x content.

     2. IT SCANS WHAT A PLAYER CAN SEE, ELEMENT BY ELEMENT, not
        `panel.textContent`. textContent includes display:none subtrees — the
        retired #hr-botd-card is `display:none !important` per
        combat-screens.css and still renders every second — and it glues
        adjacent nodes into strings like "22:51:47RevenantUndead" that exist
        nowhere on screen. Per-element own-text cannot manufacture that seam,
        and it names the element to fix instead of blaming the whole panel.
        A broken value on a surface no player can see is not a visual defect;
        `--selftest` plants one on the hidden card and proves it stays silent,
        and plants one on the VISIBLE card and proves it still bites. */
  const BROKEN_RE = /\S*(NaN|undefined|\[object Object\])\S*/;
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3)
    .map((n) => n.data).join(' ').replace(/\s+/g, ' ').trim();
  [...scope, ...all].forEach((el) => {
    const t = ownText(el); if (!t) return;
    const b = t.match(BROKEN_RE);
    if (b) add('P1', 'broken-value', b[0].slice(0, 40), el);
  });

  all.forEach((el) => { if (el.children.length) return; const t = TXT(el);
    if (t.length <= 3 && /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(t)) {
      const fs = parseFloat(getComputedStyle(el).fontSize) || 0;
      if (fs >= 26) add('P1', 'emoji-as-art', `${fs | 0}px "${t}"`, el); } });

  /* FUNCTIONAL — dead controls. This codebase's recurring defect is a control whose
     handler calls a global that was never exported (quest strip, bounty repaint,
     stopSkill and combatXP all shipped broken this way): the button looks perfectly
     fine and silently does nothing. Resolve every function an inline onclick calls. */
  const RESERVED = /^(if|for|while|switch|return|typeof|function|catch|new|do|else|delete|void)$/;
  scope.forEach((n) => n.querySelectorAll('[onclick]').forEach((el) => {
    if (!vis(el)) return;
    const code = el.getAttribute('onclick') || '';
    const calls = [...code.matchAll(/([A-Za-z_$][\w$.]*)\s*\(/g)].map((m) => m[1]);
    calls.forEach((path) => {
      if (RESERVED.test(path)) return;
      const parts = path.replace(/^window\./, '').split('.');
      let ref = window;
      for (const p of parts) { if (ref == null) break; ref = ref[p]; }
      if (typeof ref !== 'function')
        add('P1', 'dead-control', `"${TXT(el).slice(0, 18)}" calls ${path}() -> ${ref === undefined ? 'undefined' : typeof ref}`, el);
    });
  }));

  return out;
}

// A brand-new player: no gold, nothing gathered, nothing unlocked. The path most
// likely to show empty states, broken values and dead ends — and the first thing a
// launch player sees.
const FRESH_GAME = () => {
  const G = window.G; if (!G) return;
  G.gold = 0; G.gems = 0;
  Object.keys(G.skills || {}).forEach((s) => { G.skills[s] = 0; });
  G.inventory = {};
  G.equipment = Object.fromEntries(Object.keys(G.equipment || {}).map((k) => [k, null]));
  G.rooms = {}; G.farmPlots = []; G.companions = { ownedIds: [], xp: {}, equipped: null };
};
const SAVE_STATE = (process.env.HR_SAVE || 'mid');

const MID_GAME = () => {
  const G = window.G; if (!G) return;
  /* b492 — STATE THE PRECONDITIONS. These indexed `G.skills` / `G.inventory`
     bare, assuming the fresh-G factory literal is still in G at boot. Under the
     blob-retire capstone it is not: loadLocal forgets every server-of-record
     field, so `G.skills` is legitimately ABSENT until the server answers, and
     this screenshot tool would throw before painting anything. */
  if (!G.skills || typeof G.skills !== 'object') G.skills = {};
  if (!G.inventory || typeof G.inventory !== 'object') G.inventory = {};
  G.gold = 250000; G.gems = 40;
  ['attack','strength','defense','hitpoints','mining','woodcutting','fishing','cooking','smithing','crafting','farming','ranged','magic']
    .forEach((s) => { G.skills[s] = 300000; });
  Object.assign(G.inventory, { copper_ore:500, iron_ore:400, coal:300, normal_log:400, oak_log:200, shrimp:200,
    cooked_shrimp:120, iron_bar:150, bronze_bar:120, turnip:60, dungeon_scrip:250, bone_key:3, rune_axe:1,
    steel_hammer:1, dawn_sword:1, dawn_platebody:1, farm_deed:4 });
};

/* ── THE FONT PRECONDITION ────────────────────────────────────────────────────
   The families are READ FROM THE THEME, not hardcoded: whichever faces
   `--f-display/--f-ui/--f-label` name on :root today are the ones the walk waits
   for, so swapping the type system does not silently un-gate the measurement.
   Only the FIRST family of each token is required — the rest of each stack is a
   per-platform fallback nobody promises is installed.

   Three things this had to learn the hard way:

   1. `await document.fonts.ready` alone is not enough. Faces declared by a
      stylesheet are lazy: until something needs a weight, it is `unloaded` and
      `ready` resolves anyway. So each required face is force-loaded with
      `document.fonts.load()` first, THEN awaited.
   2. `document.fonts.check('600 16px Cinzel')` is NOT an availability test. Per
      spec an unknown family is assumed to be a system font, so it answers TRUE
      with the CDN blocked and ZERO faces in the set — measured 2026-09-12.
      Likewise `document.fonts.status` is 'loaded' for an EMPTY set. The honest
      test is whether the family CHANGES RENDERED WIDTH against a family that
      certainly does not exist; that works whether the face came from the CDN or
      is installed on the box.
   3. The wait is BOUNDED. A runner that cannot reach fonts.gstatic.com must not
      hang the gate for a minute per page — it gets a named ERR finding instead
      (`fonts-unloaded`), and the sweep declines to measure text widths at all. */
const FONT_TOKENS = ['--f-display', '--f-ui', '--f-label'];
const FONT_BUDGET_MS = 20_000;
/* `--offline-fonts` aborts every request to the Google Fonts CDN, which is the
   only way to reproduce a runner that cannot reach it from a dev box that can.
   It is how the fail-closed path above is proven; it is never how the gate runs. */
const OFFLINE_FONTS = argv.includes('--offline-fonts');

async function awaitFonts(page, budget = FONT_BUDGET_MS) {
  return page.evaluate(async ({ tokens, budget }) => {
    const cs = getComputedStyle(document.documentElement);
    const GENERIC = /^(system-ui|serif|sans-serif|monospace|cursive|fantasy|ui-\w+|-apple-system|inherit|initial)$/i;
    const wanted = [...new Set(tokens.map((t) => (cs.getPropertyValue(t) || '').split(',')[0].trim().replace(/^['"]|['"]$/g, ''))
      .filter((f) => f && !GENERIC.test(f)))];
    const specs = wanted.flatMap((f) => [400, 600, 700].map((w) => `${w} 16px "${f}"`));
    const snap = () => ({ status: document.fonts.status, faces: document.fonts.size,
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').length });

    // Does the family actually paint differently from a family that cannot exist?
    const renders = (fam) => {
      const mk = (ff) => { const s = document.createElement('span');
        s.textContent = 'Crypt of Bones — Today\'s blessing 0123';
        s.style.cssText = `position:absolute;left:-9999px;top:0;white-space:nowrap;font:600 32px ${ff}`;
        document.body.appendChild(s); const w = s.getBoundingClientRect().width; s.remove(); return w; };
      const none = mk('"__hr_no_such_family__", monospace');
      return Math.abs(mk(`"${fam}", "__hr_no_such_family__", monospace`) - none) > 0.5;
    };

    const t0 = Date.now();
    const before = { ...snap(), rendering: Object.fromEntries(wanted.map((f) => [f, renders(f)])) };
    await Promise.race([
      (async () => { await Promise.all(specs.map((s) => document.fonts.load(s).catch(() => {})));
        await document.fonts.ready; })(),
      new Promise((r) => setTimeout(r, budget)),
    ]);
    const after = { ...snap(), rendering: Object.fromEntries(wanted.map((f) => [f, renders(f)])) };
    return { wanted, before, after, waitedMs: Date.now() - t0,
      missing: wanted.filter((f) => !after.rendering[f]) };
  }, { tokens: FONT_TOKENS, budget });
}

/* One booted page at one viewport: harness flag on, invite gate open, save state
   applied, FTUE and overlays dismissed. Extracted so --selftest boots the same
   page the walk does — a mutation proof against a differently-booted page proves
   nothing about the walk. */
async function bootPage(browser, url, vp) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  // FUNCTIONAL: a screen that throws while rendering still "looks" fine in a
  // screenshot — capture runtime errors and console errors per screen.
  const runtimeErrs = [];
  page.on('pageerror', (e) => runtimeErrs.push('pageerror: ' + String(e.message || e).slice(0, 140)));
  page.on('console', (m) => { if (m.type() === 'error') runtimeErrs.push('console: ' + m.text().slice(0, 140)); });
  page.__errs = runtimeErrs;
  await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
  if (OFFLINE_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => typeof window.G !== 'undefined', { timeout: 60_000 });
  await page.evaluate(() => { try { if (window.HearthriseGate) window.HearthriseGate.isOpen = () => true; } catch (e) {} });
  await page.evaluate(SAVE_STATE === 'fresh' ? FRESH_GAME : MID_GAME);
  await page.waitForTimeout(1800);   // let ESM merge + icon mapping settle
  // The webfonts are a PRECONDITION of every width this tool measures. Boot the
  // wait here so --selftest and the walk share one page-boot contract.
  const fonts = await awaitFonts(page);
  console.log(`   fonts [${vp.key}] want=${fonts.wanted.join(', ')} `
    + `before=${fonts.before.status}/${fonts.before.loaded}of${fonts.before.faces} rendering=${JSON.stringify(fonts.before.rendering)} -> `
    + `after=${fonts.after.status}/${fonts.after.loaded}of${fonts.after.faces} rendering=${JSON.stringify(fonts.after.rendering)} `
    + `(${fonts.waitedMs}ms)${fonts.missing.length ? '  MISSING: ' + fonts.missing.join(', ') : ''}`);
  // Dismiss the FTUE tour + any open modal/toast, or every screen gets measured
  // (and screenshotted) from BEHIND the tutorial — the sweep would be worthless.
  await page.evaluate(() => {
    try { if (window.G) { window.G.ftueDone = true; window.G.ftueStep = 99; if (window.G.flags) window.G.flags.ftue = 'done'; } } catch (e) {}
    // Generic: ANY element that is a full-viewport interactive overlay (tutorial,
    // daily reward, welcome, what's-new) is dismissed — otherwise every screen is
    // measured and screenshotted from behind a modal.
    const killOverlays = () => {
      document.querySelectorAll('body > *, .panel.active > *').forEach((e) => {
        const c = getComputedStyle(e); if (c.position !== 'fixed' || c.pointerEvents === 'none') return;
        const r = e.getBoundingClientRect();
        if (r.width > innerWidth * 0.6 && r.height > innerHeight * 0.5) e.style.setProperty('display', 'none', 'important');
      });
      document.querySelectorAll('.ftue-root,.ftue-overlay,#ftue-overlay,.modal.open,.qm-overlay,.scv-overlay,.mon-detail.show,.dr-overlay,#daily-reward-overlay,.welcome-overlay,#welcome-modal')
        .forEach((e) => e.style.setProperty('display', 'none', 'important'));
      document.querySelectorAll('.toast,.toast-wrap,#toast-host').forEach((e) => { e.style.display = 'none'; });
    };
    killOverlays(); window.__killOverlays = killOverlays;
  });
  await page.waitForTimeout(300);
  return { page, runtimeErrs, fonts };
}

async function walk() {
  const { server, port } = EXTERNAL_URL ? { server: null, port: 0 } : await serve();
  const url = EXTERNAL_URL || `http://127.0.0.1:${port}/index.html`;
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const findings = [];

  for (const vp of VIEWPORTS) {
    const { page, runtimeErrs, fonts } = await bootPage(browser, url, vp);

    for (const s of SCREENS) {
      await page.evaluate((t) => { try { if (typeof window.showTab === 'function') window.showTab(t); } catch (e) {} }, s);
      await page.waitForTimeout(500);
      await page.evaluate(() => { try { window.__killOverlays && window.__killOverlays(); } catch (e) {} });
      await page.waitForTimeout(120);
      /* `document.fonts.ready` re-arms whenever loading restarts, so a screen that
         is the first to ask for a weight (an 800 label) is awaited here too rather
         than measured mid-swap. Bounded by the same budget as the boot wait. */
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      const arg = { label: s, fontsMissing: fonts.missing, fontStatus: fonts.after.status };
      const res = await page.evaluate(SWEEP, arg).catch((e) => ({ screen: s, issues: [{ sev: 'ERR', kind: 'sweep-threw', detail: String(e).slice(0, 120) }], stats: {} }));
      res.viewport = vp.key;
      // attribute any runtime/console errors raised while this screen rendered
      if (runtimeErrs.length) {
        [...new Set(runtimeErrs)].slice(0, 4).forEach((e) => res.issues.push({ sev: 'P1', kind: 'runtime-error', detail: e, el: '' }));
        runtimeErrs.length = 0;
      }
      findings.push(res);
      await page.screenshot({ path: join(OUT, `${vp.key}-${s}.png`) }).catch(() => {});
    }
    await page.close();
  }
  await browser.close();
  if (server) server.close();

  await writeFile(join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));
  const bySev = {};
  findings.forEach((f) => f.issues.forEach((i) => { bySev[i.sev] = (bySev[i.sev] || 0) + 1; }));
  console.log('\nVISUAL QA — screens:', findings.length, '| issues by severity:', JSON.stringify(bySev));
  findings.forEach((f) => {
    const hot = f.issues.filter((i) => i.sev === 'P1' || i.sev === 'ERR');
    if (hot.length) { console.log(`\n[${f.viewport}/${f.screen}] els=${f.stats.els} chars=${f.stats.chars}`);
      hot.slice(0, 6).forEach((i) => console.log(`   ${i.sev} ${i.kind}: ${i.detail} ${i.el}`)); }
  });
  console.log('\nPNGs + findings.json →', OUT);
  return 0;
}

/* ── MUTATION PROOF for the broken-value detector ──────────────────────────
   `node tests/visual-qa.mjs --selftest`

   b536: the visual gate went red on `22:56:23RevenantUndead` — no player could
   see it. Two detector defects produced it (see the sweep): a case-insensitive
   "NaN" matching the "nan" in Revenant, and `panel.textContent` reading a
   display:none subtree and gluing sibling nodes together. Narrowing a detector
   is how guards quietly die, so the narrowing is pinned here: the sweep is run
   against the SAME booted combat screen four times, with the Boss of the Day
   FORCED to the Revenant so the exact b536 condition is reproduced on any date.

     control   the real screen, Revenant featured   → no broken-value
     bite A    "NaN" planted on the VISIBLE card    → broken-value naming it
     bite B    "undefined" planted, visible         → broken-value naming it
     hole      "NaN" planted on the HIDDEN card     → silent, ON PURPOSE
     word      "maintenance"/"covenant" visible     → silent (the b536 class)

   If a future edit trades the false positive for a blind spot, bite A/B go
   green-when-they-should-be-red and this exits 1.                            */
async function selftest() {
  const fails = [];
  const { server, port } = EXTERNAL_URL ? { server: null, port: 0 } : await serve();
  const url = EXTERNAL_URL || `http://127.0.0.1:${port}/index.html`;
  const browser = await chromium.launch();
  try {
    const { page, fonts } = await bootPage(browser, url, VIEWPORTS[0]);
    const ARG = { label: 'combat', fontsMissing: fonts.missing, fontStatus: fonts.after.status };
    // Pin the rotation: the Revenant is the boss whose NAME broke the gate.
    await page.evaluate(() => {
      const B = window.HearthriseBossOfDay;
      if (B) { try { Object.defineProperty(B, 'featuredId', { value: () => 'revenant', configurable: true }); } catch (e) {} }
    });
    await page.evaluate(() => { try { window.showTab('combat'); } catch (e) {} });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { try { window.__killOverlays && window.__killOverlays(); } catch (e) {} });
    await page.waitForTimeout(200);

    /* Plant text on a chosen element, sweep, then put the text back. Returns the
       broken-value issues plus what the DOM actually offered, so a miss reports
       "the selector matched nothing" instead of a silent false green. */
    const probe = async (which, text) => {
      const planted = await page.evaluate(({ which, text }) => {
        const pick = () => {
          if (which === 'hidden') return document.querySelector('#hr-botd-card .botd-name');
          const card = [...document.querySelectorAll('.wt-dest')].find((a) =>
            /Boss of the Day/i.test((a.querySelector('.wtd-kick') || {}).textContent || ''));
          return card ? card.querySelector('.wtd-main > b') : null;   // the name the player reads
        };
        const el = pick();
        if (!el) return { ok: false, why: `no ${which} Boss-of-the-Day name element in the DOM` };
        window.__hrProbe = { el, was: el.textContent };
        el.textContent = text;
        const r = el.getBoundingClientRect();
        return { ok: true, visible: r.width > 0 && r.height > 0, display: getComputedStyle(el).display };
      }, { which, text });
      if (!planted.ok) { fails.push('SELFTEST: ' + planted.why); return { issues: [], planted }; }
      const res = await page.evaluate(SWEEP, ARG);
      const survived = await page.evaluate((t) => {
        const p = window.__hrProbe; if (!p || !p.el) return false;
        const still = p.el.textContent === t; p.el.textContent = p.was; return still;
      }, text);
      if (!survived) fails.push(`SELFTEST: a repaint replaced the planted "${text}" before the sweep ran — that case proves nothing`);
      return { issues: (res.issues || []).filter((i) => i.kind === 'broken-value'), planted };
    };

    const control = await page.evaluate(SWEEP, ARG);
    const cbv = (control.issues || []).filter((i) => i.kind === 'broken-value');
    if (cbv.length) fails.push('SELFTEST: control — the untouched combat screen reported broken-value: '
      + JSON.stringify(cbv.map((i) => i.detail + ' ' + i.el)));

    const bite = await probe('visible', 'Gold: NaN');
    if (bite.planted.ok && !bite.planted.visible) fails.push('SELFTEST: the War Table boss name has no box — the bite case proves nothing');
    if (bite.planted.ok && !bite.issues.length) fails.push('SELFTEST: a VISIBLE "NaN" on the Boss-of-the-Day card was NOT flagged — the detector is blind');
    else if (bite.issues.length && !bite.issues.some((i) => /wtd-main/.test(i.el || '')))
      fails.push('SELFTEST: the visible "NaN" was flagged but blamed ' + JSON.stringify(bite.issues.map((i) => i.el)) + ' instead of the element holding it');

    const biteU = await probe('visible', 'Reward undefined');
    if (biteU.planted.ok && !biteU.issues.length) fails.push('SELFTEST: a VISIBLE "undefined" was NOT flagged');

    const hole = await probe('hidden', 'Gold: NaN');
    if (hole.planted.ok && hole.planted.visible) fails.push('SELFTEST: #hr-botd-card .botd-name now has a box — the retired card is no longer hidden, so this case measures the wrong thing');
    if (hole.issues.length) fails.push('SELFTEST: a broken value on a display:none surface was flagged — the sweep is reading text no player can see: '
      + JSON.stringify(hole.issues.map((i) => i.detail)));

    const word = await probe('visible', 'Revenant covenant maintenance');
    if (word.issues.length) fails.push('SELFTEST: an ordinary word containing "nan" was flagged as a broken value (the b536 red): '
      + JSON.stringify(word.issues.map((i) => i.detail)));

    /* ── the two preconditions the metric detectors rest on ──────────────────
       (a) THE FONTS. If the page is not rendering the theme's faces, the sweep
           must say so as an ERR and must NOT emit a width verdict. Proven by
           re-running the sweep with a missing face declared.
       (b) THE CARD KEY. Six identical cards must produce six distinct `el`
           names, each carrying its own kicker, or the gate's key masks five of
           them. Proven from the real DOM, not a fixture. */
    const fontErr = await page.evaluate(SWEEP, { ...ARG, fontsMissing: ['Cinzel'], fontStatus: 'loaded' });
    const errs = (fontErr.issues || []).filter((i) => i.kind === 'fonts-unloaded');
    if (errs.length !== 1 || errs[0].sev !== 'ERR')
      fails.push('SELFTEST: a missing theme face did not produce exactly one ERR fonts-unloaded finding — got '
        + JSON.stringify((fontErr.issues || []).map((i) => i.sev + ' ' + i.kind)).slice(0, 200));
    const metric = new Set(['clipped-text', 'clipped-by-parent', 'offscreen-x']);
    const stillMeasured = (fontErr.issues || []).filter((i) => metric.has(i.kind));
    if (stillMeasured.length) fails.push(`SELFTEST: ${stillMeasured.length} text-width finding(s) were still emitted with a face missing — `
      + 'the walk is measuring the platform fallback and calling it a player-visible clip: '
      + JSON.stringify(stillMeasured.slice(0, 3).map((i) => i.kind + ' ' + i.el)));
    if (fonts.missing.length) fails.push('SELFTEST: the booted page never rendered ' + fonts.missing.join(', ')
      + ' — this run cannot prove the control case (is fonts.gstatic.com reachable?)');

    /* ── b550: THE SCROLLER RULE, MUTATION-PROVED ─────────────────────────────
       The clip walk now stops at an ancestor that genuinely scrolls on the X
       axis. That is exactly the shape of change that quietly deletes a guard, so
       it is proven on three planted fixtures inside the live active panel:

         hidden   an `overflow:hidden` parent with content past its edge
                  → MUST still be `clipped-by-parent`. This is the bite.
         bare     an `overflow-x:auto` parent, scrolled content, no cue
                  → NOT a clip (the player can swipe to it) but MUST raise
                    `scroller-no-affordance`, or the rule is just an exemption.
         cued     the same scroller with an edge fade
                  → silent. This is the state the War Table rail now ships in. */
    const scrollCase = async (mode) => {
      await page.evaluate((mode) => {
        const host = document.querySelector('.panel.active') || document.body;
        document.getElementById('__hr_sc_fx')?.remove();
        const box = document.createElement('div');
        box.id = '__hr_sc_fx';
        box.style.cssText = 'position:relative;width:180px;height:40px;'
          + (mode === 'hidden' ? 'overflow:hidden' : 'overflow-x:auto')
          + (mode === 'cued' ? ';mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 30px),transparent 100%)' : '');
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-wrap:nowrap;width:max-content';
        ['Crypt of Bones', 'The Hollow Regent', 'Elderscale the Wyrm'].forEach((n) => {
          const s = document.createElement('span');
          s.textContent = n;
          s.style.cssText = 'flex:0 0 auto;white-space:nowrap;padding:0 8px';
          row.appendChild(s);
        });
        box.appendChild(row); host.appendChild(box);
      }, mode);
      await page.waitForTimeout(80);
      const res = await page.evaluate(SWEEP, ARG);
      await page.evaluate(() => document.getElementById('__hr_sc_fx')?.remove());
      const mine = (res.issues || []).filter((i) => (i.el || '').includes('__hr_sc_fx'));
      return { clips: mine.filter((i) => i.kind === 'clipped-by-parent'),
        afford: (res.issues || []).filter((i) => i.kind === 'scroller-no-affordance' && (i.el || '').includes('__hr_sc_fx')) };
    };
    const scHidden = await scrollCase('hidden');
    if (!scHidden.clips.length)
      fails.push('SELFTEST: content past the edge of a NON-scrolling overflow:hidden parent was not flagged clipped-by-parent — the b550 scroller rule swallowed the real clip it was meant to keep');
    const scBare = await scrollCase('bare');
    if (scBare.clips.length)
      fails.push('SELFTEST: text a player can swipe to inside an overflow-x:auto rail was still called clipped-by-parent: '
        + JSON.stringify(scBare.clips.map((i) => i.detail)));
    if (!scBare.afford.length)
      fails.push('SELFTEST: a sideways scroller with no edge fade and no scroll-snap raised nothing — the rule became a pure exemption');
    const scCued = await scrollCase('cued');
    if (scCued.clips.length || scCued.afford.length)
      fails.push('SELFTEST: a scroller WITH an edge fade still reported: '
        + JSON.stringify([...scCued.clips, ...scCued.afford].map((i) => i.kind + ' ' + i.detail)));

    const tags = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.wt-dest')];
      return cards.map((c) => ((c.querySelector('.wtd-kick') || {}).textContent || '').trim());
    });
    if (tags.length < 2) fails.push(`SELFTEST: only ${tags.length} .wt-dest card(s) in the DOM — the key case proves nothing`);
    else {
      if (tags.some((t) => !t)) fails.push('SELFTEST: a War Table card has no .wtd-kick text, so its findings key collides with its siblings: ' + JSON.stringify(tags));
      const named = await page.evaluate(SWEEP, ARG);
      const els = (named.issues || []).map((i) => i.el || '').filter((e) => e.includes('wt-dest'));
      if (els.length && !els.every((e) => /\{[^}]+\}$/.test(e)))
        fails.push('SELFTEST: a .wt-dest finding carries no {kicker} tag — the six cards share one key again: ' + JSON.stringify(els.slice(0, 4)));
      if (new Set(tags).size !== tags.length)
        fails.push('SELFTEST: two War Table cards share a kicker, so the tag does not separate them: ' + JSON.stringify(tags));
    }

    await page.close();
  } finally {
    await browser.close();
    if (server) server.close();
  }
  if (fails.length) { for (const f of fails) console.error('  ✗ ' + f); return 1; }
  console.log('✓ visual-qa --selftest: broken-value detector — control clean with the Revenant featured; '
    + 'planted NaN and undefined on the visible Boss-of-the-Day card both flagged and attributed to it; '
    + 'the same NaN on the display:none #hr-botd-card stays silent; "covenant/maintenance" no longer reds the gate. '
    + 'Font precondition: the theme faces rendered on this page, and a missing face yields one ERR fonts-unloaded '
    + 'with ZERO text-width findings. Card key: every .wt-dest finding carries its own {kicker}.');
  return 0;
}

/* exitCode, not process.exit(): the gate spawns this with stdio:'inherit', and an
   immediate exit can truncate the last lines of the report on a pipe. */
process.exitCode = await (argv.includes('--selftest') ? selftest() : walk());
