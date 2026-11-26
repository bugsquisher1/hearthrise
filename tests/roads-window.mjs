#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/roads-window.mjs — THE ROADS SCREEN: THE TALENTS MAP, PLAYED IN A REAL CHROMIUM (src/shell/windows/talents/, lane/r-ui-roads).
//
//   node tests/roads-window.mjs            the rules
//   node tests/roads-window.mjs --mutate   every planted defect must turn a NAMED rule red
//
// ci-step: in-page-23 | Roads window - the Talents map zooms Country Road Node, previews a route with its cost and spends only from the server's state
// ci-run: node tests/roads-window.mjs
// ci-run: node tools/mutant-gate.mjs node tests/roads-window.mjs --mutate
//
// mutant-anchors: src/shell/windows/talents/index.js src/shell/windows/talents/card.js src/shell/windows/talents/map.js src/shell/windows/talents/camera.js
//
// docs/design/redesign/20-v030-the-roads.md section 4 (R-UI), 18-roads-review-ux.md sections 3 to 6. The pure half reads the layout,
// the route and the camera in node; the page half is play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs),
// the server's `talents` section in the envelope.
//   RW-1  THE LAYOUT (src/render/roads-layout.js): every node has a place; no two stones nearer than the gap; every country's density
//         inside a 1.5x band (18 P3), so Restoration, the most nodes, has the most room (at least 1.4x the median country's)
//   RW-2  THE ROUTE (src/core/talent-route.js): states owned / open / locked from a build; the route to a far stone is the cheapest
//         path from what is owned, its cost the stones on it, its Level from the points left; a hybrid adds a crossroads in each country
//         it lacks; a vow waits for Level 30
//   RW-3  THE CAMERA (camera.js): the tier of a scale, a wheel crossing into the next tier lands on that tier's own scale (one at a time),
//         a zoom keeps the point under the pointer
//   RW-4  NOT OFFERED while the server sends no `talents` section (the switch off): no icon
//   RW-5  OPENS WHERE YOU ARE: Road view, the next stone of the hero's suggested road at the stage's middle; the owned stones owned, the
//         frontier open, the rest locked, all from the server's section
//   RW-6  THREE TIERS: Country (the countries named, no rank stones), Node (the signposts), Road; a wheel over the map zooms and
//         lands on the next tier's own scale
//   RW-7  ROUTE PREVIEW: a press on a far stone draws its route (exactly the route's stones turn On route), the badge and the card
//         say its cost and Level; nothing is sent
//   RW-8  ONE SPEND FROM THE SERVER'S STATE: Next step picks the route's first stone; its Take sends ONE hr_talent_spend naming that node
//         and no pick; while the answer is out the press is off and the stone is NOT owned (no prediction); the answer's envelope owns it
//   RW-9  OFF WITH NO POINT: a server section with no point left keeps Take off with its words, and a press sends nothing
//   RW-10 PHONE (922x423, touch): the sheet is the screen's width, a tap opens the card over the map, Country view lists the countries
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';
import { judgePlanted, report, exitOf, cleanControl, harnessFail } from './_mutant-verdict.mjs';
import { roadsLayout, D } from '../src/render/roads-layout.js';
import { nodeStates, routeTo, nextSuggested } from '../src/core/talent-route.js';
import { spend, pointsAt } from '../src/core/talents.js';
import { tierOf, stepScale, zoomAbout, toMap, TIER_SCALE } from '../src/shell/windows/talents/camera.js';
import { TALENT_NODES } from '../src/data/talents.js';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

/* THE SERVER'S SECTION (hr_talents_view): a sword hero at Level 7 (the fixture's), 6 points, 2 spent on Power Strike's road */
const LEVEL = 7;
const OWNED = { 'power_strike.r1': true, 'power_strike.r2': true };
const SECTION = (nodes = OWNED, level = LEVEL, points = pointsAt(level)) => ({ live: true, level, points, spent: Object.keys(nodes).length, nodes, borrowed: [], vow_slots: 0 });

// ── the pure half ─────────────────────────────────────────────────────────
function pure() {
  const fails = [];
  const L = roadsLayout();
  /* RW-1 */
  const missing = TALENT_NODES.filter((n) => !L.pos[n.id]).map((n) => n.id);
  if (missing.length) fails.push('RW-1 nodes with no place: ' + missing.slice(0, 5).join(', '));
  let near = null;
  const ids = Object.keys(L.pos);
  for (let i = 0; i < ids.length && !near; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = L.pos[ids[i]], b = L.pos[ids[j]];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.62 * D) { near = ids[i] + ' / ' + ids[j]; break; }
  }
  if (near) fails.push('RW-1 two stones on top of each other: ' + near);
  const area = (c) => { let a = 0; const p = c.poly; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
  /* a country's nodes per 10,000 square map units (18 P3) */
  const dens = L.countries.map((c) => (c.total / area(c)) * 10000);
  if (Math.max(...dens) / Math.min(...dens) > 1.5) fails.push('RW-1 the countries\' densities spread past 1.5x: ' + dens.map((d) => d.toFixed(2)).join(', '));
  const areas = L.countries.map(area).sort((a, b) => a - b), median = areas[Math.floor(areas.length / 2)];
  const rest = area(L.countries.find((c) => c.id === 'restoration'));
  if (!(rest >= 1.4 * median)) fails.push('RW-1 Restoration has ' + (rest / median).toFixed(2) + 'x the median country\'s room (wants 1.4x or more)');
  if (L.edges.some((e) => !L.pos[e.from] || !L.pos[e.to])) fails.push('RW-1 a road ends at a stone with no place');
  /* RW-2 */
  const st = nodeStates(OWNED, LEVEL);
  if (st.hearth !== 'owned' || st['power_strike.r2'] !== 'owned') fails.push('RW-2 the owned stones are not owned');
  if (st['power_strike.r3'] !== 'open' || st['challenge.r1'] !== 'open') fails.push('RW-2 the frontier is not open: ' + st['power_strike.r3'] + ' ' + st['challenge.r1']);
  if (st['power_strike.r4'] !== 'locked' || st['vow.single_combat'] !== 'locked') fails.push('RW-2 a far stone is not locked');
  const r = routeTo(OWNED, LEVEL, 'power_strike.x2', 4);
  if (!r || r.cost !== 5 || r.path.join() !== 'power_strike.r3,power_strike.x1,power_strike.r4,power_strike.r5,power_strike.x2' || r.reachAt !== LEVEL + 1 || r.ranks !== 3 || r.picks !== 1) {
    fails.push('RW-2 the route to Power Strike crossroads II: ' + JSON.stringify(r));
  }
  const h = routeTo(OWNED, LEVEL, 'border.sword_shield.x', 4);
  if (!h || !h.needs.some((x) => x.country === 'shield' && !x.owned) || !h.path.includes('challenge.x1') || h.path[h.path.length - 1] !== 'border.sword_shield.x') {
    fails.push('RW-2 a hybrid\'s route lacks the other country\'s crossroads: ' + JSON.stringify(h));
  }
  const v = routeTo(OWNED, LEVEL, 'vow.single_combat', 40);
  if (!v || v.reachAt !== 30) fails.push('RW-2 a vow is reached before Level 30: ' + JSON.stringify(v));
  if (nextSuggested(OWNED, 'sword', 'party') !== 'power_strike.r3') fails.push('RW-2 the next suggested stone is ' + nextSuggested(OWNED, 'sword', 'party'));
  /* RW-3 */
  if (tierOf(0.3) !== 'country' || tierOf(1) !== 'road' || tierOf(2.5) !== 'node') fails.push('RW-3 the tiers read wrong');
  if (stepScale(1, 1.1, 0.3, false) !== 1.1) fails.push('RW-3 a zoom inside Road is not free');
  if (stepScale(1.7, 1.2, 0.3, false) !== TIER_SCALE.node) fails.push('RW-3 a wheel into Node does not land on its scale: ' + stepScale(1.7, 1.2, 0.3, false));
  if (stepScale(0.75, 0.5, 0.3, false) !== 0.3) fails.push('RW-3 a wheel into Country does not land on the fit');
  if (stepScale(0.3, 100, 0.3, false) !== TIER_SCALE.road) fails.push('RW-3 a fast wheel skipped a tier');
  const cam = { cx: 10, cy: -20, s: 1 }, z = zoomAbout(cam, 800, 600, 200, 150, 2.5);
  const p0 = toMap(cam, 800, 600, 200, 150), p1 = toMap(z, 800, 600, 200, 150);
  if (Math.hypot(p0.x - p1.x, p0.y - p1.y) > 1e-6) fails.push('RW-3 a zoom moved the point under the pointer');
  return fails;
}

// ── the page half ─────────────────────────────────────────────────────────
async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign(clone(s.env), { version: ++s.version, ok: true }));
    if (name === 'hr_talent_spend') {
      await new Promise((res) => setTimeout(res, s.delay || 0));
      const t = s.env.talents;
      const nodes = spend(t.nodes, body.p_node, body.p_pick);
      s.env.talents = SECTION(nodes, t.level, t.points);
      return json({ ok: true, spent: 1, envelope: Object.assign(clone(s.env), { version: ++s.version, ok: true }) });
    }
    return json({ ok: true });
  });
}

async function signInAndPlay(page, base) {
  await page.goto(base + '/play.html', { waitUntil: 'load', timeout: 60000 });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

const W = '[data-hs-win="talents"]';
/* what the page shows: a stone's state, its place on screen, the stage's middle, the tier, the scale the map is drawn at */
const look = (page) => page.evaluate(({ W }) => {
  const win = document.querySelector(W);
  if (!win) return null;
  const st = {};
  for (const g of win.querySelectorAll('[data-rd-node]')) st[g.getAttribute('data-rd-node')] = ['owned', 'route', 'open', 'locked'].find((k) => g.classList.contains('is-' + k));
  const stage = win.querySelector('[data-rd-stage]').getBoundingClientRect();
  const at = (id) => { const r = win.querySelector('[data-rd-node="' + id + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  const hearth = win.querySelector('[data-rd-node="hearth"]').getAttribute('transform'), r1 = win.querySelector('[data-rd-node="power_strike.r1"]').getAttribute('transform');
  const badge = win.querySelector('.rdm-badge');
  return { st, stage: { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2, w: stage.width, h: stage.height }, at: { r3: at('power_strike.r3') },
    tier: win.querySelector('svg.rdm').getAttribute('data-tier'), hearth, r1,
    badge: badge && !badge.hasAttribute('hidden') ? badge.textContent : null, card: win.querySelector('.rdw-card').innerText.replace(/\s+/g, ' '),
    width: win.getBoundingClientRect().width, room: win.offsetParent ? win.offsetParent.getBoundingClientRect().width : 0,
    countries: [...win.querySelectorAll('[data-rd-label^="c:"]:not([hidden])')].length,
    rankShown: getComputedStyle(win.querySelector('.rdm-n.is-rank')).display !== 'none',
    postShown: getComputedStyle(win.querySelector('.rdm-post')).display !== 'none' };
}, { W });
const scaleOfLook = (L, lk) => { const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(lk.r1), p = L.pos['power_strike.r1']; return Math.hypot(Number(m[1]), Number(m[2])) / Math.hypot(p.x, p.y); };

async function checks(overrides, opts = {}) {
  const fails = opts.stopAtFirst ? opts.stopAtFirst([]) : [];
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const L = roadsLayout();
  const open = async (section, viewport = { width: 1440, height: 900 }, touch = false) => {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/400|404/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const env = Object.assign(clone(BASE_ENV), { hunt: null, party: null, hunt_track: null, hunt_events: null, hunt_analyzer: null }, section ? { talents: section } : {});
    env.state = Object.assign({}, env.state, { active_kind: 'idle', active_id: null });
    const s = { env, version: 1, calls: [], delay: 0 };
    await stub(page, s);
    await signInAndPlay(page, 'http://127.0.0.1:' + port);
    return { ctx, page, errors, s };
  };
  const openMap = async (page) => {
    await page.evaluate(() => { const b = document.querySelector('.hs-launchers [data-hs-open="talents"]') || document.querySelector('[data-hs-open="talents"]'); if (b) b.click(); });
    return wait(page, ({ W }) => document.querySelector(W + ' [data-rd-node="hearth"][transform]'), { W });
  };
  const sent = (s) => s.calls.filter((c) => c.name === 'hr_talent_spend');
  try {
    /* RW-4: the switch off, no section, no icon */
    {
      const { ctx, page } = await open(null);
      const icon = await page.evaluate(() => { const b = document.querySelector('.hs-launchers [data-hs-open="talents"]'); return !!b && b.offsetParent !== null; });
      if (icon) fails.push('RW-4 the Talents icon shows with no `talents` section from the server');
      await ctx.close();
    }
    /* RW-5 .. RW-8 on a desktop */
    {
      const { ctx, page, errors, s } = await open(SECTION());
      if (!await openMap(page)) fails.push('RW-5 fixture: the map never drew');
      await page.waitForTimeout(400);
      let lk = await look(page);
      if (!lk) throw new Error('no window');
      if (lk.tier !== 'road') fails.push('RW-5 it opens at ' + lk.tier + ' view, not Road');
      if (Math.abs(lk.at.r3.x - lk.stage.x) > 4 || Math.abs(lk.at.r3.y - lk.stage.y) > 4) fails.push('RW-5 it does not open on the next stone of the suggested road: ' + JSON.stringify([lk.at.r3, lk.stage]));
      if (lk.st['power_strike.r1'] !== 'owned' || lk.st['power_strike.r2'] !== 'owned' || lk.st.hearth !== 'owned') fails.push('RW-5 the server\'s owned stones are not owned');
      if (lk.st['power_strike.r3'] !== 'open' || lk.st['power_strike.x1'] !== 'locked') fails.push('RW-5 the states are not the server\'s: ' + lk.st['power_strike.r3'] + ' ' + lk.st['power_strike.x1']);
      if (Object.values(lk.st).filter((v) => v === 'owned').length !== 3) fails.push('RW-5 more stones owned than the server holds');

      /* RW-6 */
      await page.click(W + ' [data-hs-act="rd-tier"][data-tier="country"]');
      await page.waitForTimeout(300);
      lk = await look(page);
      if (lk.tier !== 'country' || lk.countries !== L.countries.length || lk.rankShown) fails.push('RW-6 Country view: ' + JSON.stringify({ tier: lk.tier, names: lk.countries, ranks: lk.rankShown }));
      await page.click(W + ' [data-hs-act="rd-tier"][data-tier="node"]');
      await page.waitForTimeout(300);
      lk = await look(page);
      if (lk.tier !== 'node' || !lk.postShown || Math.abs(scaleOfLook(L, lk) - TIER_SCALE.node) > 0.01) fails.push('RW-6 Node view: ' + JSON.stringify({ tier: lk.tier, posts: lk.postShown, s: scaleOfLook(L, lk) }));
      await page.click(W + ' [data-hs-act="rd-tier"][data-tier="road"]');
      await page.waitForTimeout(300);
      lk = await look(page);
      await page.mouse.move(lk.stage.x, lk.stage.y);
      /* one notch at a time until the tier turns: it lands on Node's own scale, never past it */
      for (let i = 0; i < 12 && (await look(page)).tier === 'road'; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
      await page.waitForTimeout(200);
      lk = await look(page);
      if (lk.tier !== 'node' || Math.abs(scaleOfLook(L, lk) - TIER_SCALE.node) > 0.01) fails.push('RW-6 the wheel did not land on Node\'s own scale: ' + lk.tier + ' ' + scaleOfLook(L, lk).toFixed(3));
      await page.click(W + ' [data-hs-act="rd-home"]');
      await page.click(W + ' [data-hs-act="rd-tier"][data-tier="road"]');
      await page.waitForTimeout(300);

      /* RW-7: a far stone */
      const box = await page.evaluate(({ W }) => { const r = document.querySelector(W + ' [data-rd-node="power_strike.x2"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, { W });
      await page.mouse.click(box.x, box.y);
      await page.waitForTimeout(300);
      lk = await look(page);
      const route = Object.entries(lk.st).filter(([, v]) => v === 'route').map(([k]) => k).sort();
      const want = routeTo(OWNED, LEVEL, 'power_strike.x2', 4);
      if (route.join() !== [...want.path].sort().join()) fails.push('RW-7 the route drawn is not the route: ' + route.join());
      if (lk.badge !== String(want.cost)) fails.push('RW-7 the badge reads ' + JSON.stringify(lk.badge) + ', not ' + want.cost);
      if (!/Cost 5 points/.test(lk.card) || !/Reach at Level 8/.test(lk.card) || !/You have 4 points/.test(lk.card)) fails.push('RW-7 the card reads ' + lk.card.slice(0, 260));
      const takeFar = await page.evaluate(({ W }) => [...document.querySelectorAll(W + ' [data-hs-act="rd-take"]')].some((b) => !b.hidden && !b.disabled && b.offsetParent !== null), { W });
      if (takeFar) fails.push('RW-7 a stone 5 points away offers a Take');
      if (sent(s).length) fails.push('RW-7 a preview sent a spend');

      /* RW-8: Next step, then ONE spend, owned only by the answer */
      await page.click(W + ' .rdw-step');
      await page.waitForTimeout(300);
      const takeOn = await page.evaluate(({ W }) => { const b = document.querySelector(W + ' .rdw-take'); return !!b && !b.hidden && !b.disabled; }, { W });
      if (!takeOn) fails.push('RW-8 the next stone\'s Take is off: ' + (await look(page)).card.slice(0, 200));
      else {
        s.delay = 900;
        await page.click(W + ' .rdw-take');
        await page.waitForTimeout(250);
        const mid = await look(page);
        const midOff = await page.evaluate(({ W }) => document.querySelector(W + ' .rdw-take').disabled, { W });
        if (mid.st['power_strike.r3'] === 'owned') fails.push('RW-8 the stone is owned before the server answered (a prediction)');
        if (!midOff) fails.push('RW-8 Take stays on while the spend is out');
        await wait(page, ({ W }) => document.querySelector(W + ' [data-rd-node="power_strike.r3"]').classList.contains('is-owned'), { W }, 5000);
        const after = await look(page);
        const calls = sent(s);
        if (calls.length !== 1 || calls[0].body.p_node !== 'power_strike.r3' || calls[0].body.p_pick !== null) fails.push('RW-8 the press sent ' + JSON.stringify(calls.map((c) => c.body)));
        if (after.st['power_strike.r3'] !== 'owned') fails.push('RW-8 the answer\'s envelope did not own the stone');
        if (!/Points\s*3\b/.test(await page.evaluate(({ W }) => document.querySelector(W + ' .rdw-band').innerText.replace(/\s+/g, ' '), { W }))) fails.push('RW-8 the points are not the server\'s after the answer');
      }
      if (errors.length) fails.push('RW-5 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    /* RW-9: no point left on the server */
    {
      const { ctx, page, s } = await open(SECTION(OWNED, LEVEL, 2));
      await openMap(page);
      await page.waitForTimeout(400);
      await page.click(W + ' .rdw-none-show');
      await page.waitForTimeout(300);
      const t = await page.evaluate(({ W }) => { const b = document.querySelector(W + ' .rdw-take'); return { off: !b || b.hidden || b.disabled, why: document.querySelector(W + ' .rdw-why').textContent }; }, { W });
      if (!t.off || t.why !== 'No points') fails.push('RW-9 with no point left Take reads ' + JSON.stringify(t));
      await page.evaluate(({ W }) => document.querySelector(W + ' .rdw-take').click(), { W });
      await page.waitForTimeout(300);
      if (sent(s).length) fails.push('RW-9 a press with no point sent a spend');
      await ctx.close();
    }
    /* RW-10: the phone */
    {
      const { ctx, page, errors } = await open(SECTION(), { width: 922, height: 423 }, true);
      await openMap(page);
      await page.waitForTimeout(400);
      let lk = await look(page);
      if (!(lk.room > 800) || Math.abs(lk.width - lk.room) > 2) fails.push('RW-10 the phone sheet is ' + lk.width + ' px of the World\'s ' + lk.room);
      await page.touchscreen.tap(lk.at.r3.x, lk.at.r3.y);
      await page.waitForTimeout(400);
      const card = await page.evaluate(({ W }) => { const r = document.querySelector(W + ' .rdw-card').getBoundingClientRect(); return { left: r.left, right: r.right }; }, { W });
      if (!(card.right <= 923 && card.left < 922 - 200)) fails.push('RW-10 the card did not slide in over the map: ' + JSON.stringify(card));
      await page.click(W + ' [data-hs-act="rd-tier"][data-tier="country"]');
      await page.waitForTimeout(400);
      const list = await page.evaluate(({ W }) => [...document.querySelectorAll(W + ' .rdw-countries .rdw-country')].filter((b) => b.offsetParent !== null).length, { W });
      if (list !== L.countries.length) fails.push('RW-10 Country view lists ' + list + ' countries on the phone');
      if (errors.length) fails.push('RW-10 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
  } catch (e) {
    if (!opts.stopAtFirst || !String(e && e.message).includes('first red')) fails.push(harnessFail('the page run', e));
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

/* each planted defect and the rule that must go red */
const MUTANTS = [
  { name: 'Take on whatever the server holds', file: 'src/shell/windows/talents/card.js', from: "prop(take, 'disabled', !can || v.pending);", to: "prop(take, 'disabled', v.pending);", want: /RW-[79]/ },
  { name: 'the route not drawn', file: 'src/shell/windows/talents/map.js', from: "const st = onRoute.has(id) ? 'route' : (v.states[id] || 'locked');", to: "const st = v.states[id] || 'locked';", want: /RW-7/ },
  { name: 'it opens on Havora, not where the hero is', file: 'src/shell/windows/talents/index.js', from: 'const p = L.pos[homeOf(cs, tl)] || L.pos.hearth;', to: 'const p = L.pos.hearth;', want: /RW-5/ },
  { name: 'the wheel zooms past the tier\'s own scale', file: 'src/shell/windows/talents/camera.js', from: 'return scaleOf(TIERS[i + Math.sign(j - i)], fit, phone);', to: 'return want;', want: /RW-6/ },
  { name: 'the stone is owned before the answer', file: 'src/shell/windows/talents/index.js', from: "runIntent(sc, repaint, () => spendTalent(ctx.account, cs, node, pick || null),",
    to: "if (sc.memo) { sc.memo.states[node] = 'owned'; sc.memo.routes.set(node, null); } runIntent(sc, repaint, () => spendTalent(ctx.account, cs, node, pick || null),", want: /RW-8/ },
  { name: 'Take stays on while the spend is out', file: 'src/shell/windows/talents/card.js', from: "prop(take, 'disabled', !can || v.pending);", to: "prop(take, 'disabled', !can);", want: /RW-8/ },
  { name: 'Country view keeps the rank stones', file: 'src/shell/windows/talents/map.js', from: "attr(M.svg, 'data-tier', tier);", to: "attr(M.svg, 'data-tier', tier === 'country' ? 'road' : tier);", want: /RW-6/ },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    const control = await cleanControl(async () => [...pure(), ...await checks()]);
    console.log(control.line);
    if (control.code) process.exit(control.code);
    const counts = { caught: 0, escaped: 0, harness: 0 };
    for (const m of MUTANTS) {
      const src = await readFile(join(ROOT, m.file), 'utf8');
      if (src.split(m.from).length !== 2) { console.log('  ✗ ' + m.name + ' — HARNESS, not a catch: its anchor is not in ' + m.file + ' exactly once'); counts.harness++; continue; }
      const planted = { [m.file]: src.replace(m.from, () => m.to) };
      const v = await judgePlanted(planted, () => checks(planted));
      if (v.kind === 'caught' && !m.want.test(v.rule)) { counts.escaped++; console.log('  ✗ ' + m.name + ' — caught by ' + v.rule + ', not ' + m.want); continue; }
      console.log(report(m.name, v, counts));
    }
    console.log('roads-window --mutate: ' + counts.caught + '/' + MUTANTS.length + ' caught');
    process.exit(exitOf(counts));
  }
  const fails = [...pure(), ...await checks()];
  for (const f of fails) console.log('FAIL  ' + f);
  console.log(fails.length ? 'roads-window: ' + fails.length + ' FAILED' : 'roads-window: green (the layout, the route, the camera, the tiers, the route preview, one spend from the server\'s state, the phone)');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
