#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/js-ab-icon-diff.mjs — PROVE A JS MOVE CHANGED NO ICON
//
//   node tools/js-ab-icon-diff.mjs --ref <sha>     work tree vs a reference
//   node tools/js-ab-icon-diff.mjs --control       A/A: measure the noise floor
//   node tools/js-ab-icon-diff.mjs --mutate        plant a defect, prove it bites
//
// ── WHY THIS EXISTS, AND WHY css-ab-pixel-diff.mjs COULD NOT DO IT ──────────
// tools/css-ab-pixel-diff.mjs proves a CSS change moved no pixel, and it does
// that by loading ONE page and swapping the <link href> of every stylesheet
// between two trees. That method is exactly right for CSS and structurally
// useless for JavaScript: a script cannot be swapped inside a live page, so for
// a JS-only change the tool compares the working tree against itself and returns
// zero no matter what the change did. Running it on the icon extraction reported
// "0 differing px across 8 screens" before this file existed — a true statement
// about stylesheets and no evidence at all about icons.
//
// So this measures the thing a JS move can actually break, and it does it
// EXACTLY rather than by sampling pixels:
//
//   A. THE HELPER DIFFERENTIAL. Every icon helper is a pure id -> HTML string
//      function. Call all of them over the WHOLE catalogue — every ITEMS id,
//      every MONSTERS id, every SKILLS_DEF id, every equipment slot — in both
//      trees and compare the output strings. ~4,500 calls per tree; one changed
//      character in one branch of one helper is a named, printed difference.
//      This is stronger than any screenshot: it covers ids no screen shows.
//
//   B. THE MAP CENSUS. The installer's entire product is seven window maps
//      (_itemPath, _itemSVG, _skillIcon, _monsterIcon, _roomIcon,
//      _plotBuildingIcon, _playerAvatar). Dump them whole and diff key by key,
//      so a path that moved, vanished or arrived is reported by id.
//
//   C. THE RENDERED ICON CENSUS. For each screen at each viewport, list every
//      <img> src and every glyph/blank marker actually in the DOM, in document
//      order. This catches the half a pure helper cannot: the post-render DOM
//      walkers, the readiness repaint, and anything that stopped being CALLED.
//
// Two page loads are unavoidable (the JS differs), so C is normalised: the DOM
// is frozen the way css-ab freezes it (timers and rAF stubbed, overlays hidden),
// blob:/data: URLs are collapsed, and the census records icon identity only —
// never geometry, never text, never a number that ticks. --control runs the same
// comparison work-vs-work; if the floor is not zero, no run means anything.
//
// Exit: 0 identical · 1 a difference was found · 2 harness failure.
// ════════════════════════════════════════════════════════════════════════

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const argv = process.argv.slice(2);
const argOf = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const REF = argOf('--ref', 'HEAD');
const CONTROL = argv.includes('--control');
const MUTATE = argv.includes('--mutate');
const SCREENS = argOf('--screens', 'profile,combat,inventory,farming,skills,house').split(',').map((s) => s.trim()).filter(Boolean);
const VIEWPORTS = [{ key: 'desktop', width: 1440, height: 900 }, { key: 'landscape', width: 922, height: 423 }];
/* Skills whose detail panel is opened and censused: this is where actIconHtml()
   paints, and the only place its output can be compared across a tree in which
   it was a closure-local. */
const SKILL_DETAILS = ['mining', 'woodcutting', 'fishing', 'cooking', 'smithing', 'crafting', 'farming'];

/* ── which files does the reference disagree with? Those, and only those, are
      served from git in "ref" mode; everything else (assets, styles, the other
      200 modules) is byte-identical and served from disk. ─────────────────── */
function changedPaths() {
  const out = execFileSync('git', ['diff', '--name-only', REF], { cwd: ROOT, encoding: 'utf8' });
  const tracked = out.split('\n').map((s) => s.trim()).filter(Boolean);
  /* Untracked files the browser can load count too: they exist in the working
     tree and not in the reference, so "ref" must 404 them exactly as the
     reference deploy would. */
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter((s) => s && /\.(js|mjs|css|html)$/.test(s));
  return new Set([...tracked, ...untracked].filter((p) => /\.(js|mjs|css|html)$/.test(p)));
}
const CHANGED = changedPaths();

function fromRef(relPath) {
  try { return execFileSync('git', ['show', `${REF}:${relPath}`], { cwd: ROOT, maxBuffer: 1 << 28 }); }
  catch { return null; }                       // absent in the reference
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

function serve(modeRef, mutateNow) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const p = decodeURIComponent((req.url || '/').split('?')[0]);
        const rel = (p === '/' ? '/index.html' : p).replace(/^\/+/, '');
        let f = normalize(join(ROOT, rel));
        if (!f.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
        if (modeRef() && CHANGED.has(rel)) {
          const buf = fromRef(rel);
          if (buf === null) { res.writeHead(404).end('not in ref'); return; }
          res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(buf);
          return;
        }
        const info = await stat(f).catch(() => null);
        if (info?.isDirectory()) f = join(f, 'index.html');
        let body = await readFile(f);
        /* --mutate: serve a DEFECTIVE icons.js on the B run ONLY (both runs are
           the work tree, so the planted defect is the only difference between
           them). A tool that has never been red is not a tool. */
        if (MUTATE && mutateNow() && rel === 'src/render/icons.js') {
          body = Buffer.from(String(body).replace("return 'uiChest';", "return 'uiSword';"), 'utf8');
        }
        res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
      } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* Same mid-game seed css-ab uses, so the two tools describe the same player. */
const MID_GAME = () => {
  const G = window.G; if (!G) return;
  if (!G.skills || typeof G.skills !== 'object') G.skills = {};
  if (!G.inventory || typeof G.inventory !== 'object') G.inventory = {};
  G.gold = 250000; G.gems = 40;
  ['attack', 'strength', 'defense', 'hitpoints', 'mining', 'woodcutting', 'fishing', 'cooking', 'smithing', 'crafting', 'farming', 'ranged', 'magic'].forEach((s) => { G.skills[s] = 300000; });
  Object.assign(G.inventory, { copper_ore: 500, iron_ore: 400, coal: 300, normal_log: 400, oak_log: 200, shrimp: 200, cooked_shrimp: 120, iron_bar: 150, bronze_bar: 120, turnip: 60, dungeon_scrip: 250, bone_key: 3, rune_axe: 1, steel_hammer: 1, dawn_sword: 1, dawn_platebody: 1, farm_deed: 4 });
};

/* ── A: every icon helper over the whole catalogue ──────────────────────── */
const HELPER_DIFFERENTIAL = () => {
  const out = {};
  const call = (label, fn, arg) => {
    let v;
    try { v = fn(); } catch (e) { v = 'THREW: ' + e.message; }
    out[label] = typeof v === 'string' ? v : JSON.stringify(v);
  };
  const ITEMS = window.ITEMS || {}, MONSTERS = window.MONSTERS || {}, SKILLS = window.SKILLS_DEF || {};
  const slots = window.EQUIP_SLOTS || [];
  const W = window;
  Object.keys(ITEMS).sort().forEach((id) => {
    call(`itemArt:${id}`, () => W.itemArt && W.itemArt(id, 26));
    call(`itemFallbackIcon:${id}`, () => W.itemFallbackIcon && W.itemFallbackIcon(id, 26));
    call(`itemGlyphKey:${id}`, () => W.itemGlyphKey && W.itemGlyphKey(id));
    call(`itemTintClass:${id}`, () => W.itemTintClass && W.itemTintClass(id));
    /* `UNREACHABLE` is a first-class answer, not a failure: before the icon
       extraction actIconHtml was a closure-local of legacy.js with no route in
       from outside, and an extraction that makes a private helper callable is
       expected to widen reachability. The diff separates that from a CHANGED
       OUTPUT, which never is. */
    call(`actIconHtml:${id}`, () => (W.HearthriseIcons && W.HearthriseIcons.actIconHtml)
      ? W.HearthriseIcons.actIconHtml(id, 'mining')
      : (typeof W.actIconHtml === 'function' ? W.actIconHtml(id, 'mining') : 'UNREACHABLE'));
  });
  Object.keys(MONSTERS).sort().forEach((id) => {
    call(`monsterArt:${id}`, () => W.monsterArt && W.monsterArt(id, 34));
    call(`monsterFallbackIcon:${id}`, () => W.monsterFallbackIcon && W.monsterFallbackIcon(id, 34));
  });
  Object.keys(SKILLS).sort().forEach((id) => {
    call(`skillIconHTML:${id}`, () => W.skillIconHTML && W.skillIconHTML(id, 34));
  });
  slots.forEach((s) => call(`slotIconHTML:${s}`, () => W.slotIconHTML && W.slotIconHTML(s)));
  /* unknown ids: the fallback ladders are where a moved closure would show */
  ['__no_such_item__', 'keystone', 'burnt_shrimp', 'rune_of_fire'].forEach((id) => {
    call(`itemGlyphKey:UNKNOWN:${id}`, () => W.itemGlyphKey && W.itemGlyphKey(id));
    call(`itemFallbackIcon:UNKNOWN:${id}`, () => W.itemFallbackIcon && W.itemFallbackIcon(id, 26));
  });
  /* the activity-bar composer writes into a node rather than returning HTML */
  ['navCombat', 'uiIdle', 'uiAnvil', 'mining'].forEach((k) => {
    call(`setActivityIcon:${k}`, () => {
      const el = document.createElement('span');
      const f = (W.HearthriseIcons && W.HearthriseIcons.setActivityIcon) || W.setActivityIcon;
      if (!f) return 'ABSENT';
      f(el, k, 'var(--gold-2)');
      return el.innerHTML;
    });
  });
  return out;
};

/* ── B: the installer's whole product ───────────────────────────────────── */
const MAP_CENSUS = () => {
  const dump = {};
  for (const name of ['_itemPath', '_itemSVG', '_skillIcon', '_monsterIcon', '_roomIcon', '_plotBuildingIcon']) {
    const m = window[name] || {};
    Object.keys(m).sort().forEach((k) => { dump[`${name}.${k}`] = String(m[k]); });
  }
  dump['_playerAvatar'] = String(window._playerAvatar);
  for (const fn of ['__applyHearthfireItemIcons', '__mapGeneratedGearIcons', '__hrIconsReady', '__hrRepaintActive',
    'itemArt', 'itemFallbackIcon', 'itemGlyphKey', 'monsterArt', 'monsterFallbackIcon', 'skillIconHTML',
    'slotIconHTML', 'itemTintClass']) {
    dump[`typeof window.${fn}`] = typeof window[fn];
  }
  return dump;
};

/* ── C: what is actually painted on a screen ────────────────────────────── */
const SCREEN_ICON_CENSUS = () => {
  const norm = (s) => String(s || '').replace(/^blob:.*$/, 'BLOB').replace(/\?v=\d+/, '?v=N').replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
  const root = document.querySelector('.panel.active') || document.body;
  const items = [];
  root.querySelectorAll('img').forEach((n) => items.push('img|' + norm(n.getAttribute('src')) + '|' + (n.getAttribute('class') || '')));
  root.querySelectorAll('svg').forEach((n) => items.push('svg|' + (n.getAttribute('class') || '') + '|' + (n.querySelector('use')?.getAttribute('href') || n.innerHTML.length)));
  root.querySelectorAll('.hr-blank-icon').forEach(() => items.push('blank'));
  /* the activity bar lives outside the panel and is repainted on every screen */
  const ab = document.querySelector('#ab-icon, .ab-icon, #activity-bar .ab-icon');
  items.push('activitybar|' + (ab ? norm(ab.innerHTML.slice(0, 400)) : 'ABSENT'));
  return items;
};

const FREEZE = () => {
  try { if (window.G) { window.G.ftueDone = true; window.G.ftueStep = 99; if (window.G.flags) window.G.flags.ftue = 'done'; } } catch (e) {}
  document.querySelectorAll('.ftue-root,.ftue-overlay,#ftue-overlay,.modal.open,.qm-overlay,.scv-overlay,.mon-detail.show,.dr-overlay,#daily-reward-overlay,.welcome-overlay,#welcome-modal,.toast,.toast-wrap,#toast-host')
    .forEach((e) => e.style.setProperty('display', 'none', 'important'));
};
const STOP_CLOCKS = () => {
  const hi = setTimeout(() => {}, 0);
  for (let i = 0; i <= hi; i++) { clearTimeout(i); clearInterval(i); }
  window.setTimeout = () => 0; window.setInterval = () => 0; window.requestAnimationFrame = () => 0;
};

async function capture(browser, url) {
  const shot = { helpers: null, maps: null, screens: {} };
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => typeof window.G !== 'undefined', { timeout: 60_000 });
    await page.evaluate(() => { try { if (window.HearthriseGate) window.HearthriseGate.isOpen = () => true; } catch (e) {} });
    await page.evaluate(MID_GAME);
    await page.waitForTimeout(3000);
    await page.evaluate(FREEZE);
    if (vp.key === 'desktop') {
      shot.helpers = await page.evaluate(HELPER_DIFFERENTIAL);
      shot.maps = await page.evaluate(MAP_CENSUS);
      shot.errors = errors.slice();
    }
    for (const scr of SCREENS) {
      await page.evaluate((t) => { try { if (typeof window.showTab === 'function') window.showTab(t); } catch (e) {} }, scr);
      await page.waitForTimeout(1200);
      await page.evaluate(FREEZE);
      await page.evaluate(STOP_CLOCKS);
      await page.waitForTimeout(150);
      shot.screens[`${vp.key}-${scr}`] = await page.evaluate(SCREEN_ICON_CENSUS);
    }
    /* actIconHtml paints the `.at-icon` of every action row on a skill's detail
       panel. It is a closure-local of legacy.js in older trees, so the ONLY way
       to compare its output across an extraction is in situ — open each skill
       and census what it drew. This is the evidence behind the reachability
       note the summary prints. */
    for (const sk of SKILL_DETAILS) {
      const cens = await page.evaluate((s) => {
        try {
          if (typeof window.showTab === 'function') window.showTab('skills');
          if (typeof window.openSkillDetail === 'function') window.openSkillDetail(s);
        } catch (e) { return ['THREW']; }
        const out = [];
        document.querySelectorAll('.at-icon, .at-emoji').forEach((n) => out.push(n.innerHTML.replace(/\?v=\d+/g, '?v=N')));
        return out;
      }, sk);
      shot.screens[`${vp.key}-skilldetail-${sk}`] = cens;
    }
    await page.close();
  }
  return shot;
}

/** Differences split two ways. A CHANGED OUTPUT (both sides reachable, the HTML
 *  differs) is a regression and fails the run. A REACHABILITY change (exactly one
 *  side is UNREACHABLE) is what an extraction does on purpose when a helper that
 *  was a closure-local becomes callable; it is reported, counted and never
 *  silently folded into "identical", but it does not fail. */
function diffMap(a, b, label, problems, reach, limit = 12) {
  const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].sort();
  let n = 0;
  for (const k of keys) {
    if (a[k] === b[k]) continue;
    const wasUnreachable = a[k] === 'UNREACHABLE', isUnreachable = b[k] === 'UNREACHABLE';
    if (wasUnreachable !== isUnreachable) {
      const helper = k.split(':')[0];
      reach.set(helper, (reach.get(helper) || 0) + 1);
      continue;
    }
    n++;
    if (n <= limit) problems.push(`  ${label} ${k}\n      ref : ${String(a[k]).slice(0, 160)}\n      work: ${String(b[k]).slice(0, 160)}`);
  }
  if (n > limit) problems.push(`  ${label} … and ${n - limit} more`);
  return n;
}

async function main() {
  let refMode = false;
  let mutateNow = false;
  const { server, port } = await serve(() => refMode, () => mutateNow);
  const url = `http://127.0.0.1:${port}/index.html`;
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
  let code = 0;
  try {
    refMode = !CONTROL && !MUTATE;             // --control / --mutate compare work vs work
    console.log(`  capturing A (${CONTROL || MUTATE ? 'work tree, unmodified' : REF}) …`);
    const A = await capture(browser, url);
    refMode = false;
    mutateNow = MUTATE;                        // the planted defect exists only in B
    console.log(`  capturing B (working tree${MUTATE ? ' + planted defect' : ''}) …`);
    const B = await capture(browser, url);

    const problems = [];
    const reach = new Map();
    const nH = diffMap(A.helpers, B.helpers, 'HELPER', problems, reach);
    const nM = diffMap(A.maps, B.maps, 'MAP', problems, reach);
    let nS = 0;
    for (const key of [...new Set([...Object.keys(A.screens), ...Object.keys(B.screens)])].sort()) {
      const a = A.screens[key] || [], b = B.screens[key] || [];
      const sa = JSON.stringify(a), sb = JSON.stringify(b);
      if (sa === sb) { console.log(`  ${key.padEnd(22)} icons ${String(a.length).padStart(5)}   identical`); continue; }
      nS++;
      const first = a.findIndex((v, i) => v !== b[i]);
      problems.push(`  SCREEN ${key}: ${a.length} icon(s) in A vs ${b.length} in B; first difference at #${first}\n      ref : ${a[first]}\n      work: ${b[first]}`);
      console.log(`  ${key.padEnd(22)} icons ${String(a.length).padStart(5)} vs ${b.length}  DIFFERS`);
    }
    console.log(`\n  helper calls compared: ${Object.keys(B.helpers || {}).length}   map keys compared: ${Object.keys(B.maps || {}).length}`);
    if (reach.size) {
      console.log('  reachability changed (a private helper became callable, or stopped being) —');
      for (const [h, n] of [...reach].sort()) console.log(`    · ${h}: ${n} id(s); output not comparable in the reference, in-situ census below is the evidence`);
    }
    if (B.errors?.length) { console.log('  page errors in the WORKING tree:'); B.errors.slice(0, 10).forEach((e) => console.log('    ! ' + e)); }
    if (A.errors?.length) { console.log('  page errors in A:'); A.errors.slice(0, 10).forEach((e) => console.log('    ! ' + e)); }

    const total = nH + nM + nS;
    const label = CONTROL ? 'CONTROL (A/A, same tree twice)'
      : MUTATE ? 'MUTATION PROOF (planted defect)'
        : 'working tree vs ' + REF;
    console.log(`\n  ${label}: ${total} difference(s) — helpers ${nH}, maps ${nM}, screens ${nS}`);
    if (total) problems.forEach((p) => console.log(p));
    if (MUTATE) {
      if (total) { console.log(`✓ --mutate: the planted itemGlyphKey defect was seen (${total} difference(s)) — the harness bites`); }
      else { console.log('  ✗ --mutate: a planted defect produced NO difference. The harness is blind; every zero it has reported is worthless.'); code = 2; }
    } else if (CONTROL) {
      if (total) { console.log('  ✗ the A/A floor is NOT zero. Fix the harness before trusting any run.'); code = 2; }
      else console.log('✓ control: the floor is zero — a zero from a real run means something');
    } else if (total) { code = 1; }
    else console.log('✓ js-ab-icon: every icon helper, every icon map key and every painted icon is identical');
  } catch (e) {
    console.error('  ✗ harness: ' + e.message); code = 2;
  } finally { await browser.close(); server.close(); }
  return code;
}

if (!existsSync(join(ROOT, 'index.html'))) { console.error('js-ab-icon: run from the repo'); process.exit(2); }
process.exit(await main());
