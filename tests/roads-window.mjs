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
// mutant-anchors: src/shell/windows/talents/index.js src/shell/windows/talents/card.js src/shell/windows/talents/map.js src/shell/windows/talents/camera.js src/session/talent-sections.js src/shell/windows/talents/road-plan.js src/shell/windows/talents/find.js src/core/talent-route.js src/styles/roads.css src/session/company-sections.js
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
//   RW-4  NOT OFFERED while the server sends no `talents` section (the switch off): the Character window has no Talents tab and nothing
//         opens the map; with the section, the tab's Open map opens it (the window has no icon: the top bar holds 8)
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
//   RW-11 THE SECTION'S SHAPE (src/session/talent-sections.js talentsSectionOf, lane/r-ui-roads-2): `borrowed` is the server's objects
//         { move, opens_at, open } (1069 hr_talents_view), read as { move, opensAt, open }; `auto` the plan word or null; `builds` the
//         saved builds per ground, a bad ground id dropped
//   RW-12 SPEND AS SUGGESTED, THE STANDING RULE: the band's toggle is pressed exactly while the server's `auto` says so; a press sends
//         ONE hr_talent_auto_set (on: the plan word, off: null), stays as it was and off while the answer is out, and turns only from
//         the answer's envelope
//   RW-13 PLAN ROUTE (src/core/talent-route.js planRoute, ./road-plan.js): a far stone's Plan route sends ONE hr_talent_build_save for the
//         hero's planned hunt naming the route over the build (each choice at its suggested option); nothing shows planned before the
//         answer; the planned hunt is the SERVER's word (the section's plan_hunt, 1073), not the company section's older one. Spend on
//         plan is ONE hr_talent_spend_plan naming that hunt (no hr_talent_spend): off while its answer is out and no stone owned
//         before it; the answer's envelope owns the plan's steps in the map's order (the server's walk, nextPlanStep its twin), each
//         choice at its planned option, and with no point left the press is off and says so
//   RW-14 FIND TALENT AND THE FILTERS: typing an option's name finds its stone and Enter picks it and brings it on screen; a filter
//         keeps its kind bright and dims the rest, and Vows shows every vow in Country view
//   RW-15 THE KEYS: an arrow picks the next stone that way (the suggested one first), Enter is the card's own Take (ONE spend), Escape
//         lets go
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
import { nodeStates, routeTo, nextSuggested, planRoute, planLeft, plannedOf, nextPlanStep } from '../src/core/talent-route.js';
import { spend, pointsAt, buildProblems, suggestedPick } from '../src/core/talents.js';
import { tierOf, stepScale, zoomAbout, toMap, TIER_SCALE } from '../src/shell/windows/talents/camera.js';
import { findTalents, stoneToward } from '../src/shell/windows/talents/find.js';
import { talentsSectionOf } from '../src/session/talent-sections.js';
import { TALENT_NODES, NODE_INDEX } from '../src/data/talents.js';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

/* THE SERVER'S SECTION (hr_talents_view): a sword hero at Level 7 (the fixture's), 6 points, 2 spent on Power Strike's road */
const LEVEL = 7;
const OWNED = { 'power_strike.r1': true, 'power_strike.r2': true };
/* the hunt the hero's plan is for, as the server names it (the section's plan_hunt, 1073: src/session/company-sections.js planGroundOf) */
const GROUND = 'millrace_sewer';
const SECTION = (nodes = OWNED, level = LEVEL, points = pointsAt(level), extra = {}) => ({ live: true, level, points, spent: Object.keys(nodes).length, nodes,
  auto: null, plan_hunt: GROUND, borrowed: [], vow_slots: 0, builds: {}, ...extra });
/* a far plain stone, four points out: Power Strike's road past its first crossroads */
const FAR = 'power_strike.r5';

/* RW-11: the section exactly as 1069's hr_talents_view builds it, read by a talentsSectionOf (node's, and the page's own module, which a
   mutant plants into): RW11_IN are its inputs, RW11_READ the readings, sectionFails the verdict */
const RW11_IN = Object.freeze([
  { live: true, level: 90, points: 89, spent: 2, nodes: OWNED, auto: 'solo', vow_slots: 2,
    borrowed: [{ move: 'greater_mend', opens_at: 80, open: true }, { move: 'turning_cut', opens_at: null, open: false }],
    builds: { [GROUND]: { ...OWNED, 'power_strike.r3': true, 'no.such.node': true }, 'Bad Ground!': OWNED }, reset: { price: 0 } },
  { live: true, level: 7, nodes: {}, auto: 'always' },
]);
const RW11_READ = (read) => RW11_IN.map((x) => read(x));
function sectionFails([sec, noWord]) {
  const fails = [];
  const lent = sec && sec.borrowed;
  if (JSON.stringify(lent) !== JSON.stringify([{ move: 'greater_mend', opensAt: 80, open: true }, { move: 'turning_cut', opensAt: null, open: false }])) {
    fails.push('RW-11 the server\'s borrowed rows read as ' + JSON.stringify(lent));
  }
  if (!sec || sec.auto !== 'solo') fails.push('RW-11 the standing rule\'s plan reads as ' + JSON.stringify(sec && sec.auto));
  if (!sec || Object.keys(sec.builds).join() !== GROUND || Object.keys(sec.builds[GROUND]).length !== 3) fails.push('RW-11 the saved builds read as ' + JSON.stringify(sec && sec.builds));
  if (!noWord || noWord.auto !== null || noWord.borrowed.length !== 0) fails.push('RW-11 a word off the list is not off: ' + JSON.stringify(noWord));
  return fails;
}

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
  fails.push(...sectionFails(RW11_READ(talentsSectionOf)));
  /* RW-13 (pure): the plan over the build, its points and its steps */
  const plan = planRoute(OWNED, null, FAR, null, 'party');
  const x1 = suggestedPick(NODE_INDEX['power_strike.x1'], 'party');
  const wantPlan = { ...OWNED, 'power_strike.r3': true, 'power_strike.x1': x1, 'power_strike.r4': true, [FAR]: true };
  if (JSON.stringify(plan) !== JSON.stringify(wantPlan) || buildProblems(plan).length) fails.push('RW-13 the plan to ' + FAR + ' is ' + JSON.stringify(plan));
  if (planLeft(OWNED, plan) !== 4 || plannedOf(OWNED, plan).size !== 4) fails.push('RW-13 the plan needs ' + planLeft(OWNED, plan) + ' points, not 4');
  const step = nextPlanStep(OWNED, plan, LEVEL);
  if (!step || step.id !== 'power_strike.r3' || step.pick !== null) fails.push('RW-13 the plan\'s first step is ' + JSON.stringify(step));
  const onX = nextPlanStep({ ...OWNED, 'power_strike.r3': true }, plan, LEVEL);
  if (!onX || onX.id !== 'power_strike.x1' || onX.pick !== x1) fails.push('RW-13 the plan\'s choice is paid as ' + JSON.stringify(onX));
  const more = planRoute(OWNED, plan, 'power_strike.w2', null, 'party');
  if (!more || !more['power_strike.x2'] || more['power_strike.x1'] !== x1 || planLeft(OWNED, more) !== 6) fails.push('RW-13 a second Plan route does not go on from the plan: ' + JSON.stringify(more));
  if (planRoute(OWNED, plan, FAR, null, 'party') !== null) fails.push('RW-13 planning a planned stone again changes the plan');
  /* RW-14 (pure): an option's name finds its stone; a road its first stone */
  const found = findTalents('long hold');
  if (!found.length || found[0].id !== 'challenge.x1') fails.push('RW-14 Find talent for "long hold" gives ' + JSON.stringify(found.slice(0, 2)));
  if ((findTalents('greater mend')[0] || {}).id !== 'greater_mend.r1') fails.push('RW-14 Find talent for a move does not give its road first');
  /* RW-15 (pure): the arrow's stone */
  /* the way toward each road neighbour (read off the layout, so a new layout moves the ways, not the rule) lands on that neighbour */
  const toward = (a, b) => { const p = L.pos[a], q = L.pos[b], d = Math.hypot(q.x - p.x, q.y - p.y); return stoneToward(L.pos, a, (q.x - p.x) / d, (q.y - p.y) / d); };
  if (toward('power_strike.r3', 'power_strike.x1') !== 'power_strike.x1' || toward('power_strike.r3', 'power_strike.r2') !== 'power_strike.r2') {
    fails.push('RW-15 the ways from Power Strike stone 3 go to ' + toward('power_strike.r3', 'power_strike.x1') + ' / ' + toward('power_strike.r3', 'power_strike.r2'));
  }
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
      if (!(t.points - t.spent > 0)) return json({ ok: false, error: 'no_points' });
      const nodes = spend(t.nodes, body.p_node, body.p_pick);
      s.env.talents = SECTION(nodes, t.level, t.points, { auto: t.auto, builds: t.builds, plan_hunt: t.plan_hunt });
      return json({ ok: true, spent: 1, envelope: Object.assign(clone(s.env), { version: ++s.version, ok: true }) });
    }
    /* 1073 hr_talent_spend_plan: the server's walk (each point to the first planned node in map order its check takes; nextPlanStep is
       the twin), refused plan_changed for a ground that is not the section's */
    if (name === 'hr_talent_spend_plan') {
      await new Promise((res) => setTimeout(res, s.delay || 0));
      const t = s.env.talents;
      if (body.p_hunt !== t.plan_hunt) return json({ ok: false, error: 'plan_changed' });
      const draft = t.builds[body.p_hunt];
      if (!draft) return json({ ok: false, error: 'no_plan' });
      let nodes = t.nodes, n = 0;
      for (let step; n < t.points - t.spent && (step = nextPlanStep(nodes, draft, t.level)); n++) nodes = spend(nodes, step.id, step.pick);
      if (!n) return json({ ok: false, error: t.points - t.spent > 0 ? 'plan_done' : 'no_points' });
      s.env.talents = SECTION(nodes, t.level, t.points, { auto: t.auto, builds: t.builds, plan_hunt: t.plan_hunt });
      return json({ ok: true, spent: n, envelope: Object.assign(clone(s.env), { version: ++s.version, ok: true }) });
    }
    /* 1069 hr_talent_auto_set: the setting, then the section says it (this stub spends nothing on turning it on) */
    if (name === 'hr_talent_auto_set') {
      await new Promise((res) => setTimeout(res, s.delay || 0));
      s.env.talents = { ...s.env.talents, auto: body.p_plan };
      return json({ ok: true, auto: body.p_plan, spent: 0, envelope: Object.assign(clone(s.env), { version: ++s.version, ok: true }) });
    }
    /* 1064 hr_talent_build_save: the saved build for the ground, or none */
    if (name === 'hr_talent_build_save') {
      await new Promise((res) => setTimeout(res, s.delay || 0));
      const builds = { ...s.env.talents.builds };
      if (body.p_nodes) builds[body.p_hunt] = body.p_nodes; else delete builds[body.p_hunt];
      s.env.talents = { ...s.env.talents, builds };
      return json({ ok: true, envelope: Object.assign(clone(s.env), { version: ++s.version, ok: true }) });
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
  const open = async (section, viewport = { width: 1440, height: 900 }, touch = false, more = {}) => {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/400|404/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const env = Object.assign(clone(BASE_ENV), { hunt: null, party: null, hunt_track: null, hunt_events: null, hunt_analyzer: null }, section ? { talents: section } : {}, more);
    env.state = Object.assign({}, env.state, { active_kind: 'idle', active_id: null });
    const s = { env, version: 1, calls: [], delay: 0 };
    await stub(page, s);
    await signInAndPlay(page, 'http://127.0.0.1:' + port);
    return { ctx, page, errors, s };
  };
  /* the player's way in: Character, its Talents tab, Open map */
  const tabShown = (page) => page.evaluate(() => { const b = document.querySelector('[data-hs-win="character"] .hw-tab[data-tab="talents"]'); return !!b && !b.hidden && b.offsetParent !== null; });
  const openCharacter = async (page) => {
    await page.evaluate(() => document.querySelector('.hs-launchers [data-hs-open="character"]').click());
    return wait(page, () => document.querySelector('[data-hs-win="character"] .hw-tab[data-tab="talents"]'));
  };
  const openMap = async (page) => {
    await openCharacter(page);
    await wait(page, () => { const b = document.querySelector('[data-hs-win="character"] .hw-tab[data-tab="talents"]'); return b && !b.hidden; });
    await page.evaluate(() => document.querySelector('[data-hs-win="character"] .hw-tab[data-tab="talents"]').click());
    await wait(page, () => { const b = document.querySelector('[data-hs-win="character"] .hw-tl-map'); return b && b.offsetParent !== null; });
    await page.evaluate(() => document.querySelector('[data-hs-win="character"] .hw-tl-map').click());
    return wait(page, ({ W }) => document.querySelector(W + ' [data-rd-node="hearth"][transform]'), { W });
  };
  const sent = (s) => s.calls.filter((c) => c.name === 'hr_talent_spend');
  try {
    /* RW-4: the switch off, no section: no tab, nothing to open the map */
    {
      const { ctx, page } = await open(null);
      await openCharacter(page);
      await page.waitForTimeout(300);
      const way = await page.evaluate(() => [...document.querySelectorAll('[data-hs-open="talents"]')].some((b) => b.offsetParent !== null));
      if (await tabShown(page) || way) fails.push('RW-4 the map is offered with no `talents` section from the server: ' + JSON.stringify({ tab: await tabShown(page), way }));
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
    const band = (page) => page.evaluate(({ W }) => { const b = document.querySelector(W + ' [data-hs-act="rd-auto"]'); return b ? { pressed: b.getAttribute('aria-pressed'), off: b.disabled } : null; }, { W });
    const calls = (s, name) => s.calls.filter((c) => c.name === name);
    const COMPANY = { company: { wear_upgrades: true, if_one_falls: 'hunt_on', plan_hunt: GROUND, heroes: 1 } };
    /* RW-12, RW-14, RW-15 on a desktop */
    {
      const { ctx, page, errors, s } = await open(SECTION(), undefined, false, COMPANY);
      await openMap(page);
      await page.waitForTimeout(400);
      /* RW-11 in the page: the section reader the page itself serves */
      const read = await page.evaluate(async (ins) => { const m = await import('/src/session/talent-sections.js'); return ins.map((x) => m.talentsSectionOf(x)); }, RW11_IN);
      fails.push(...sectionFails(read).map((f) => f + ' (the page\'s reader)'));
      /* RW-12: the standing rule, drawn from the server's `auto` only */
      let b = await band(page);
      if (!b || b.pressed !== 'false') fails.push('RW-12 with the server\'s auto off the toggle reads ' + JSON.stringify(b));
      s.delay = 900;
      await page.click(W + ' [data-hs-act="rd-auto"]');
      await page.waitForTimeout(250);
      b = await band(page);
      if (b.pressed !== 'false') fails.push('RW-12 the toggle turned on before the server answered');
      if (!b.off) fails.push('RW-12 the toggle stays on while its press is out');
      await wait(page, ({ W }) => document.querySelector(W + ' [data-hs-act="rd-auto"]').getAttribute('aria-pressed') === 'true', { W }, 5000);
      let a = calls(s, 'hr_talent_auto_set');
      if (a.length !== 1 || a[0].body.p_plan !== 'party' || (await band(page)).pressed !== 'true') fails.push('RW-12 turning it on sent ' + JSON.stringify(a.map((c) => c.body.p_plan)) + ' and reads ' + (await band(page)).pressed);
      s.delay = 0;
      await page.click(W + ' [data-hs-act="rd-auto"]');
      await wait(page, ({ W }) => document.querySelector(W + ' [data-hs-act="rd-auto"]').getAttribute('aria-pressed') === 'false', { W }, 5000);
      a = calls(s, 'hr_talent_auto_set');
      if (a.length !== 2 || a[1].body.p_plan !== null) fails.push('RW-12 turning it off sent ' + JSON.stringify(a.map((c) => c.body.p_plan)));

      /* RW-14: Find talent, by an option's name */
      await page.click(W + ' .rdw-find');
      await page.keyboard.type('long hold');
      await page.waitForTimeout(200);
      const hits = await page.evaluate(({ W }) => [...document.querySelectorAll(W + ' .rdw-found [data-node]')].map((x) => x.getAttribute('data-node')), { W });
      if (hits[0] !== 'challenge.x1') fails.push('RW-14 Find talent lists ' + JSON.stringify(hits));
      /* the tools stand on one plate (no label shows between the presses), and the found list hangs under it, never stretching it */
      const plate = await page.evaluate(({ W }) => {
        const tools = document.querySelector(W + ' .rdw-tools'), r = tools.getBoundingClientRect(), list = document.querySelector(W + ' .rdw-found').getBoundingClientRect();
        const f = document.querySelector(W + ' .rdw-filter').getBoundingClientRect();
        const field = document.querySelector(W + ' .rdw-find').getBoundingClientRect();
        return { bg: getComputedStyle(tools).backgroundColor, tall: Math.round(r.height - f.height), under: list.top >= field.bottom && list.height > 0 };
      }, { W });
      if (/rgba\(0, 0, 0, 0\)|transparent/.test(plate.bg) || plate.tall > 16 || !plate.under) fails.push('RW-14 the tools are not one plate over the map: ' + JSON.stringify(plate));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      const picked = await page.evaluate(({ W }) => {
        const g = document.querySelector(W + ' [data-rd-node="challenge.x1"]'), r = g.getBoundingClientRect(), st = document.querySelector(W + ' [data-rd-stage]').getBoundingClientRect();
        return { sel: g.classList.contains('is-sel'), inside: r.x > st.x && r.right < st.right && r.y > st.y && r.bottom < st.bottom,
          list: document.querySelectorAll(W + ' .rdw-found li').length, value: document.querySelector(W + ' .rdw-find').value };
      }, { W });
      if (!picked.sel || !picked.inside || picked.list || picked.value) fails.push('RW-14 Enter on a find did not pick it on screen: ' + JSON.stringify(picked));
      /* RW-14: the filters */
      await page.click(W + ' [data-hs-act="rd-filter"][data-filter="vow"]');
      await page.waitForTimeout(200);
      const dim = await page.evaluate(({ W }) => {
        const op = (sel) => Number(getComputedStyle(document.querySelector(W + ' ' + sel)).opacity);
        return { pressed: document.querySelector(W + ' [data-filter="vow"]').getAttribute('aria-pressed'), vow: op('.rdm-n.is-vow'), rank: op('.rdm-n.is-rank') };
      }, { W });
      if (dim.pressed !== 'true' || dim.vow !== 1 || !(dim.rank < 0.5)) fails.push('RW-14 the Vows filter: ' + JSON.stringify(dim));
      await page.click(W + ' [data-hs-act="rd-tier"][data-tier="country"]');
      await page.waitForTimeout(300);
      const vowShown = await page.evaluate(({ W }) => getComputedStyle(document.querySelector(W + ' .rdm-n.is-vow:not(.is-owned)')).display !== 'none', { W });
      if (!vowShown) fails.push('RW-14 the Vows filter does not show the vows in Country view');
      await page.click(W + ' [data-hs-act="rd-filter"][data-filter="vow"]');
      await page.click(W + ' [data-hs-act="rd-tier"][data-tier="road"]');
      await page.waitForTimeout(300);

      /* RW-15: the keys */
      await page.click(W + ' [data-hs-act="rd-clear"]');
      await page.focus(W + ' [data-rd-stage]');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      const selOf = () => page.evaluate(({ W }) => { const g = document.querySelector(W + ' .rdm-n.is-sel'); return g ? g.getAttribute('data-rd-node') : null; }, { W });
      let k = await selOf();
      if (k !== 'power_strike.r3') fails.push('RW-15 the first arrow picks ' + k + ', not the next suggested stone');
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(300);
      k = await selOf();
      const wantLeft = stoneToward(L.pos, 'power_strike.r3', -1, 0);
      if (k !== wantLeft) fails.push('RW-15 the left arrow picks ' + k + ', not ' + wantLeft);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      if ((k = await selOf()) !== stoneToward(L.pos, wantLeft, 1, 0)) fails.push('RW-15 the right arrow picks ' + k);
      const before = sent(s).length;
      await page.keyboard.press('Enter');
      await wait(page, ({ W }) => document.querySelector(W + ' [data-rd-node="power_strike.r3"]').classList.contains('is-owned'), { W }, 5000);
      const took = sent(s).slice(before);
      if (took.length !== 1 || took[0].body.p_node !== 'power_strike.r3') fails.push('RW-15 Enter sent ' + JSON.stringify(took.map((c) => c.body)));
      await page.focus(W + ' [data-rd-stage]');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      if (await selOf()) fails.push('RW-15 Escape did not let go of the stone');
      if (!await page.evaluate(({ W }) => !!document.querySelector(W), { W })) fails.push('RW-15 Escape on a picked stone closed the window');
      if (errors.length) fails.push('RW-12 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    /* RW-13: Plan route, then Spend on plan, at Level 6: 3 points left for a plan of 4. The company section still names an older plan
       ground; the server's word (the section's plan_hunt) is the one the plan is saved and paid for */
    {
      const STALE = { company: { ...COMPANY.company, plan_hunt: 'muster_barrows' } };
      const { ctx, page, errors, s } = await open(SECTION(OWNED, 6), undefined, false, STALE);
      await openMap(page);
      await page.waitForTimeout(400);
      /* a far choice: each of its options is planned on its own row */
      const fork = await page.evaluate(({ W }) => { const r = document.querySelector(W + ' [data-rd-node="power_strike.x2"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, { W });
      await page.mouse.click(fork.x, fork.y);
      await page.waitForTimeout(300);
      const rowsPlan = await page.evaluate(({ W }) => [...document.querySelectorAll(W + ' .rdw-opt')].map((li) => { const b = li.querySelector('[data-hs-act="rd-plan"]'); return b && !b.hidden ? b.textContent : null; }), { W });
      if (rowsPlan.length !== 3 || rowsPlan.some((x) => x !== 'Plan')) fails.push('RW-13 a far choice\'s rows offer ' + JSON.stringify(rowsPlan) + ', not a Plan each');
      await page.click(W + ' [data-hs-act="rd-clear"]');
      await page.waitForTimeout(200);
      const box = await page.evaluate(({ W, FAR }) => { const r = document.querySelector(W + ' [data-rd-node="' + FAR + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, { W, FAR });
      await page.mouse.click(box.x, box.y);
      await page.waitForTimeout(300);
      const go = await page.evaluate(({ W }) => { const b = document.querySelector(W + ' [data-hs-act="rd-plan"].rdw-plan-go'); return !!b && !b.hidden && !b.disabled; }, { W });
      if (!go) fails.push('RW-13 a far stone offers no Plan route: ' + (await look(page)).card.slice(0, 240));
      else {
        s.delay = 900;
        await page.click(W + ' .rdw-plan-go');
        await page.waitForTimeout(250);
        const mid = await page.evaluate(({ W }) => document.querySelector(W + ' .rdw-planned').textContent, { W });
        if (mid) fails.push('RW-13 the stone shows Planned before the server answered');
        await wait(page, ({ W }) => document.querySelector(W + ' .rdw-planned').textContent !== '', { W }, 5000);
        const saved = calls(s, 'hr_talent_build_save');
        const want = planRoute(OWNED, null, FAR, null, 'party');
        if (saved.length !== 1 || saved[0].body.p_hunt !== GROUND || JSON.stringify(saved[0].body.p_nodes) !== JSON.stringify(want)) fails.push('RW-13 Plan route sent ' + JSON.stringify(saved.map((c) => c.body)));
        s.delay = 0;
        await page.click(W + ' [data-hs-act="rd-clear"]');
        await page.mouse.move(2, 2);
        await page.waitForTimeout(300);
        const marks = await page.evaluate(({ W }) => [...document.querySelectorAll(W + ' .rdm-n.is-plan')].map((g) => g.getAttribute('data-rd-node')).sort(), { W });
        if (marks.join() !== [...plannedOf(OWNED, want)].sort().join()) fails.push('RW-13 the map marks ' + JSON.stringify(marks) + ' planned');
        const pay = await page.evaluate(({ W }) => { const b = document.querySelector(W + ' [data-hs-act="rd-plan-pay"]'); return !!b && !b.hidden && !b.disabled; }, { W });
        if (!pay) fails.push('RW-13 Spend on plan is off: ' + (await look(page)).card.slice(0, 240));
        else {
          s.delay = 900;
          await page.click(W + ' [data-hs-act="rd-plan-pay"]');
          await page.waitForTimeout(250);
          /* while the one answer is out: the press is off and the server has not owned a stone yet, so the map owns none */
          const out = await page.evaluate(({ W }) => ({ pay: document.querySelector(W + ' [data-hs-act="rd-plan-pay"]').disabled,
            r3: document.querySelector(W + ' [data-rd-node="power_strike.r3"]').classList.contains('is-owned') }), { W });
          if (!out.pay || out.r3) fails.push('RW-13 while Spend on plan\'s answer is out: ' + JSON.stringify(out));
          await wait(page, ({ W }) => document.querySelector(W + ' [data-rd-node="power_strike.r4"]').classList.contains('is-owned'), { W }, 8000);
          s.delay = 0;
          await page.waitForTimeout(600);
          const one = calls(s, 'hr_talent_spend_plan').map((c) => c.body.p_hunt);
          if (JSON.stringify(one) !== JSON.stringify([GROUND]) || sent(s).length) fails.push('RW-13 Spend on plan sent ' + JSON.stringify({ plan: one, spends: sent(s).length }));
          const held = s.env.talents.nodes;
          const order = { ...OWNED, 'power_strike.r3': true, 'power_strike.x1': want['power_strike.x1'], 'power_strike.r4': true };
          if (JSON.stringify(held) !== JSON.stringify(order)) fails.push('RW-13 Spend on plan with 3 points left the build ' + JSON.stringify(held));
          const after = await page.evaluate(({ W }) => ({ marks: [...document.querySelectorAll(W + ' .rdm-n.is-plan')].map((g) => g.getAttribute('data-rd-node')),
            pay: document.querySelector(W + ' [data-hs-act="rd-plan-pay"]').disabled, why: document.querySelector(W + ' .rdw-plan-why').textContent,
            card: document.querySelector(W + ' .rdw-plan').innerText.replace(/\s+/g, ' ') }), { W });
          if (after.marks.join() !== FAR || !after.pay || after.why !== 'No points' || !/To go 1 point/.test(after.card)) fails.push('RW-13 after the points ran out: ' + JSON.stringify(after));
        }
      }
      if (errors.length) fails.push('RW-13 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    /* RW-10: the phone */
    {
      const { ctx, page, errors } = await open(SECTION(OWNED, LEVEL, pointsAt(LEVEL), { builds: { [GROUND]: planRoute(OWNED, null, FAR, null, 'party') } }), { width: 922, height: 423 }, true, COMPANY);
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
      /* the band's Plan works in Country view too (visual read 2026-11-26: it lit and showed nothing there) */
      await page.click(W + ' [data-hs-act="rd-sheet"]');
      await page.waitForTimeout(400);
      const countrySheet = await page.evaluate(({ W }) => document.querySelector(W + ' .rdw-card').getBoundingClientRect().left, { W });
      if (!(countrySheet < 922 - 200)) fails.push('RW-10 the band\'s Plan opens nothing in Country view: the card stands at ' + countrySheet);
      await page.click(W + ' [data-hs-act="rd-sheet"]');
      await page.waitForTimeout(300);
      /* the band's Plan opens the sheet with nothing picked: the plan's rows and Spend on plan, on the screen */
      await page.click(W + ' [data-hs-act="rd-tier"][data-tier="road"]');
      await page.waitForTimeout(300);
      await page.click(W + ' [data-hs-act="rd-sheet"]');
      await page.waitForTimeout(400);
      const sheet = await page.evaluate(({ W }) => { const r = document.querySelector(W + ' .rdw-card').getBoundingClientRect(), b = document.querySelector(W + ' [data-hs-act="rd-plan-pay"]').getBoundingClientRect();
        return { left: r.left, pay: b.width > 0 && b.left >= r.left && b.right <= 923 }; }, { W });
      if (!(sheet.left < 922 - 200) || !sheet.pay) fails.push('RW-10 the band\'s Plan does not open the sheet with the plan on it: ' + JSON.stringify(sheet));
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
  { name: 'Take on whatever the server holds', file: 'src/shell/windows/talents/card.js', from: "prop(take, 'disabled', !can || pending);", to: "prop(take, 'disabled', pending);", want: /RW-[79]/ },
  { name: 'the route not drawn', file: 'src/shell/windows/talents/map.js', from: "const st = onRoute.has(id) ? 'route' : (v.states[id] || 'locked');", to: "const st = v.states[id] || 'locked';", want: /RW-7/ },
  { name: 'it opens on Havora, not where the hero is', file: 'src/shell/windows/talents/index.js', from: 'const p = L.pos[homeOf(cs, tl)] || L.pos.hearth;', to: 'const p = L.pos.hearth;', want: /RW-5/ },
  { name: 'the wheel zooms past the tier\'s own scale', file: 'src/shell/windows/talents/camera.js', from: 'return scaleOf(TIERS[i + Math.sign(j - i)], fit, phone);', to: 'return want;', want: /RW-6/ },
  { name: 'the stone is owned before the answer', file: 'src/shell/windows/talents/index.js', from: "runIntent(sc, repaint, () => spendTalent(ctx.account, cs, node, pick || null),",
    to: "if (sc.memo) { sc.memo.states[node] = 'owned'; sc.memo.routes.set(node, null); } runIntent(sc, repaint, () => spendTalent(ctx.account, cs, node, pick || null),", want: /RW-8/ },
  { name: 'Take stays on while the spend is out', file: 'src/shell/windows/talents/card.js', from: "prop(take, 'disabled', !can || pending);", to: "prop(take, 'disabled', !can);", want: /RW-8/ },
  { name: 'Country view keeps the rank stones', file: 'src/shell/windows/talents/map.js', from: "attr(M.svg, 'data-tier', tier);", to: "attr(M.svg, 'data-tier', tier === 'country' ? 'road' : tier);", want: /RW-6/ },
  /* lane/r-ui-roads-2 */
  { name: 'borrowed read as names (the old reading of the section)', file: 'src/session/talent-sections.js', from: "sec.borrowed.filter((b) => isObj(b) && typeof b.move === 'string')",
    to: "sec.borrowed.filter((b) => typeof b === 'string')", want: /RW-11/ },
  { name: 'the standing rule shown turned before the answer', file: 'src/shell/windows/talents/index.js', from: "attr(go, 'aria-pressed', String(!!(tl && tl.auto)));",
    to: "attr(go, 'aria-pressed', String(sc.pending ? !(tl && tl.auto) : !!(tl && tl.auto)));", want: /RW-12/ },
  { name: 'the toggle only ever turns the rule on', file: 'src/shell/windows/talents/index.js', from: 'setTalentAuto(ctx.account, cs, on ? PLAN : null)', to: 'setTalentAuto(ctx.account, cs, PLAN)', want: /RW-12/ },
  { name: 'the plan shown before the server saved it', file: 'src/shell/windows/talents/road-plan.js', from: 'runIntent(sc, repaint, () => saveBuild(ctx.account, cs, plan.ground, p.nodes)',
    to: 'tl.builds[plan.ground] = p.nodes; MEMO.delete(tl); repaint(); runIntent(sc, repaint, () => saveBuild(ctx.account, cs, plan.ground, p.nodes)', want: /RW-13/ },
  { name: 'Plan route written over a choice\'s first Plan', file: 'src/shell/windows/talents/road-plan.js', from: "root.querySelector('.rdw-plan-go')", to: "root.querySelector('[data-hs-act=\"rd-plan\"]')", want: /RW-13/ },
  /* lane/talents-plan-server: Spend on plan is one press the server walks (the planned choice's pick is the server's now: its mutant is
     tests/recruit-company.mjs "the plan pays a choice with no pick", planted in hr_talent_plan_steps) */
  { name: 'the plan saved for the company section\'s older ground, not the server\'s', file: 'src/session/company-sections.js',
    from: "if (isObj(tl) && tl.live === true && Object.prototype.hasOwnProperty.call(tl, 'plan_hunt')) {", to: 'if (false) {', want: /RW-13/ },
  { name: 'Spend on plan stays on while its answer is out', file: 'src/shell/windows/talents/road-plan.js', from: "prop(pay, 'disabled', !!off || pending);", to: "prop(pay, 'disabled', !!off);", want: /RW-13/ },
  { name: 'the plan\'s next stone owned before the answer', file: 'src/shell/windows/talents/road-plan.js', from: 'runIntent(sc, repaint, () => spendPlan(ctx.account, cs, plan.ground),',
    to: '{ const tl = tlOf(); if (tl && plan.step) { tl.nodes[plan.step.id] = plan.step.pick || true; sc.memo = null; } } runIntent(sc, repaint, () => spendPlan(ctx.account, cs, plan.ground),', want: /RW-13/ },
  { name: 'Spend on plan on with no point left', file: 'src/shell/windows/talents/road-plan.js', from: "const off = !tl || !(tl.left > 0) ? words('no_points') : !plan.step ? t('talents.plan_waiting') : '';",
    to: "const off = !tl ? words('no_points') : !plan.step ? t('talents.plan_waiting') : '';", want: /RW-13/ },
  { name: 'Find talent ignores the options\' names', file: 'src/shell/windows/talents/find.js', from: "if (PICK_KINDS.includes(n.kind) && n.kind !== 'crossing') for (const o of optionsOf(n))", to: 'if (false) for (const o of optionsOf(n))', want: /RW-14/ },
  { name: 'a filter dims nothing', file: 'src/shell/windows/talents/map.js', from: "cls(M.svg, 'is-filtered', filters.size > 0);", to: "cls(M.svg, 'is-filtered', false);", want: /RW-14/ },
  /* visual read 2026-11-26 */
  { name: 'the tools float over the map with no plate', file: 'src/styles/roads.css', from: 'padding: 6px; background: var(--bg-1);', to: 'padding: 6px;', want: /RW-14/ },
  { name: 'the found list stretches the plate', file: 'src/styles/roads.css', from: '.rdw-found { position: absolute; left: 0; top: calc(100% + 2px); z-index: 1; ', to: '.rdw-found { ', want: /RW-14/ },
  { name: 'Plan opens nothing in Country view', file: 'src/styles/roads.css', from: '.rdw.is-sheet .rdw-card { transform: none; }', to: '.rdw.is-sheet:not([data-tier="country"]) .rdw-card { transform: none; }', want: /RW-10/ },
  { name: 'an arrow key picks nothing', file: 'src/shell/windows/talents/index.js', from: 'if (next) pickStone(body, ctx, sc, next);', to: 'if (next) patchBody(body, ctx);', want: /RW-15/ },
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
  console.log(fails.length ? 'roads-window: ' + fails.length + ' FAILED' : 'roads-window: green (the layout, the route, the camera, the tiers, the route preview, one spend from the server\'s state, the phone, the section\'s shape, the standing rule, the plan, find and filters, the keys)');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
