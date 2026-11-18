#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/wiki-window.mjs — THE WIKI IS WRITTEN BY THE GAME, AND ITS FORMULAS ARE THE ENGINE'S (work ledger item 9).
//
//   node tests/wiki-window.mjs                  the rules
//   node tests/wiki-window.mjs --mutate         every planted defect must turn a rule RED
//   node tests/wiki-window.mjs --shots <dir>    also write the desktop and phone screenshots
//
// mutant-anchors: src/data/text/chronicle.js src/data/settings.js src/core/combat.js src/core/action-rules.js src/core/xp.js src/shell/wiki-model.js src/shell/windows/wiki.js src/shell/chronicle-model.js src/session/hunt-sections.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs); the hero is
// tests/fixtures/alpha-envelope.json in town. Since the top bar's groups (2026-11-16) the wiki is the Book: the Chronicle first, then
// the wiki's three sections.
//   WK-1  (no browser) every skill row, every open ground and the seven formulas have a page, and each formula's worked
//         example equals the arithmetic of the terms it states, done HERE by hand (never through the engine); the two XP
//         pages are TABLES (Tyler 2026-11-17: "This is very confusing", of the bracket formula they replace) whose rows are
//         the ruled Levels, each's XP to the next Level and Total XP worked HERE from the curves' data rows; the viewed
//         hero's Level is the marked row, put in its place when it is not one of them
//   WK-2  the slash opens the Book on the Chronicle with zero console errors; the search finds a skill (Melee), a ground (the first
//         open one) and a formula (Your max hit) and hides what does not match; nonsense finds nothing and says so; a tab shows its section
//   WK-3  THE GUARD, in the page: every Formulas example the player reads carries its stated terms and the engine's answer
//         (computed in the page by the engine's own function), and the answer equals the stated terms' arithmetic and is the
//         number the sentence says. A constant changed in the engine but not in the words (or the reverse) is red. The XP
//         tables read Level (Skill Level) | XP to next Level | Total XP, no bracket terms and no worked example, every cell
//         the by-hand curve's; the combat skill page says the combat skills have no max Level and gathering and crafting
//         stop at the cap; the death page never says "Never below" (Tyler: "This is pointless"); the gold row is the
//         hero's Level (7, a row) and MOVES with an envelope (13: a new row between 10 and 15, 7 no longer gold)
//   WK-4  the phone (922x423): Settings, Help opens it (a door on every screen, beside the row's Book icon), the Book is a sheet,
//         nothing overflows sideways and no text is under 12 px, on the Chronicle and on the Formulas (the XP tables)
//   WK-5  (no browser) THE CHRONICLE IS THE SERVER'S (Tyler 2026-11-16 "Yeah build the chronicle"; CLAUDE.md §6): every page has its
//         words, only open grounds have pages, and a page opens only on the server's word: with nothing said only the start is
//         open; a personal best on a ground or the latest hunt there opens its page; a title's kill count of one opens the Rat
//         King's, and zero keeps it shut; nothing else opens one
//   WK-6  THE CHRONICLE FOLLOWS THE SERVER, IN THE PAGE (1440x900): the pages an envelope opens are the ones shown, a shut page says
//         what opens it and its ground's name opens that ground in Hunts; an envelope that adds a ground opens its page while
//         the Book is open; a RELOAD on the same envelope shows the same pages (nothing kept by the browser)
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';

const src = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { SKILLS_DEF } = await src('src/data/skills.js');
const { OPEN_GROUNDS } = await src('src/data/hunt-grounds.js');
const { HUNT_INDEX } = await src('src/data/hunts.js');
const { whole } = await src('src/render/format.js');
const { LEVEL_CURVE, SKILL_CURVE } = await src('src/data/core-model.js');
const { MAX_LEVEL } = await src('src/core/xp.js');

const FORMULAS = ['hit', 'max', 'mon_hit', 'mon_max', 'level_curve', 'skill_xp', 'death'];
const EXAMPLES = ['hit', 'max', 'mon_hit', 'mon_max', 'death'];
const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* THE XP TABLES, BY HAND from the curves' data rows (src/data/core-model.js), never through src/core/xp.js. The Level curve:
   the step across Level n is first + rise k + bend k^2, k Levels into n's bracket, each bracket's `first` being where the one
   before would have stepped next. A combat skill: the step across s is floor(base s^2 r^(s-1)), r = (1000 + growth)/1000. */
function levelTotalByHand(L) {
  const bs = LEVEL_CURVE.brackets;
  let total = 0, first = LEVEL_CURVE.first, at = 0;
  for (let n = 1; n < L; n++) {
    while (at + 1 < bs.length && bs[at + 1].from <= n) { const m = bs[at + 1].from - bs[at].from; first += bs[at].rise * m + bs[at].bend * m * m; at++; }
    const k = n - bs[at].from;
    total += first + bs[at].rise * k + bs[at].bend * k * k;
  }
  return total;
}
function skillTotalByHand(L) {
  let total = 0n;
  for (let s = 1n; s < BigInt(L); s++) total += (BigInt(SKILL_CURVE.base) * s * s * BigInt(1000 + SKILL_CURVE.growthPermille) ** (s - 1n)) / 1000n ** (s - 1n);
  return Number(total);
}
/* The Levels each table lists (the ruling of 2026-11-17), and the hero's own Level put in its place. */
const FIRST_TEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TABLE_LEVELS = { level_curve: [...FIRST_TEN, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 200, 250, 300],
  skill_xp: [...FIRST_TEN, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100] };
const BY_HAND = { level_curve: levelTotalByHand, skill_xp: skillTotalByHand };
const HEADS = { level_curve: ['Level', 'XP to next Level', 'Total XP'], skill_xp: ['Skill Level', 'XP to next Level', 'Total XP'] };
const withHero = (levels, me) => (me === null || levels.includes(me) ? levels : [...levels, me].sort((a, b) => a - b));

/** One XP table's check, `rows` as [{ level, next, total, me }]: [] when it lists the ruled Levels (the hero's put in its place
    and marked, and only it) and every number is the by-hand curve's. */
function checkTable(rule, id, rows, me = null) {
  const out = [];
  const want = withHero(TABLE_LEVELS[id], id === 'level_curve' ? me : null);
  const got = rows.map((r) => r.level);
  if (got.join() !== want.join()) out.push(rule + ' the ' + id + ' table lists Levels ' + got.join(',') + ', want ' + want.join(','));
  for (const r of rows) {
    const total = BY_HAND[id](r.level), next = BY_HAND[id](r.level + 1) - total;
    if (r.total !== total || r.next !== next) out.push(rule + ' ' + id + ' Level ' + r.level + ' reads ' + r.next + ' to next, ' + r.total + ' total; its curve makes ' + next + ', ' + total);
  }
  const marked = rows.filter((r) => r.me).map((r) => r.level);
  const wantMarked = id === 'level_curve' && me !== null ? [me] : [];
  if (marked.join() !== wantMarked.join()) out.push(rule + ' the ' + id + ' table marks Levels ' + JSON.stringify(marked) + ' as the hero\'s, want ' + JSON.stringify(wantMarked));
  return out;
}

/* THE ARITHMETIC OF EACH RULE, from the terms the page states, typed here so the engine is never asked. Returns the
   numbers the example must show: { result, blessed? }. */
function byHand(id, T, I) {
  switch (id) {
    case 'hit': {
      const defScore = I.def * (T.defMul[I.tier] || 1);
      let a = T.base + ((I.level + I.accuracy) - defScore) * T.per;
      if (I.weak) a *= T.weak;
      return { result: clampTo(a, T.min, T.max) };
    }
    case 'max': {
      let m = Math.floor(I.level * T.lvl + I.strength * T.str + T.flat);
      m = Math.max(1, m - Math.floor(I.defScore * T.cut));
      return { result: Math.max(1, Math.floor(m * (I.weak ? T.weak : 1))) };
    }
    case 'mon_hit': return { result: clampTo((I.baseAcc === null ? T.base : I.baseAcc) + (I.atk - I.defense) * T.per, T.min, T.max) };
    case 'mon_max': return { result: Math.max(1, Math.floor(I.atk * (T.byTier[I.tier] || T.scale))) };
    case 'death': return { result: Math.floor(I.xp * T.share), blessed: Math.floor(I.xp * (T.share * (1000 - I.cut) / 1000)) };
    default: return null;
  }
}
/* The number the sentence must say: a share in percent to one decimal, else a whole number as the game writes it. */
const said = (id, v) => (id === 'hit' || id === 'mon_hit' ? Math.round(v * 1000) / 10 + '%' : whole(v));
const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9;

/** WK-1/WK-3's check of one example: [] when it agrees. */
export function checkExample(rule, c, words) {
  const want = byHand(c.id, c.terms, c.inputs);
  if (!want) return [rule + ' ' + c.id + ' is a formula the guard does not know'];
  const out = [];
  if (!near(c.result, want.result)) out.push(rule + ' ' + c.id + ': the engine says ' + c.result + ', its stated terms make ' + want.result);
  if ('blessed' in want && !near(c.blessed, want.blessed)) out.push(rule + ' ' + c.id + ' with a Blessing: the engine says ' + c.blessed + ', its stated terms make ' + want.blessed);
  if (words !== undefined && !words.includes(said(c.id, c.result))) out.push(rule + ' ' + c.id + '\'s example does not say ' + said(c.id, c.result) + ': ' + JSON.stringify(words));
  return out;
}

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const TOWN = { hunt: null, state: Object.assign(clone(BASE_ENV.state), { active_kind: 'idle', active_id: null }) };
const wait = (page, fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const W = '.hs-win[data-hs-win="wiki"]';

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign(clone(s.env), { version: ++s.version, ok: true }));
    return json({ ok: true });
  });
}

async function signInAndPlay(page, base) {
  await page.goto(base + '/play.html', { waitUntil: 'load', timeout: 45000 });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

/* The pages showing now, as "section:id". */
/* Its two doors: the slash, and Settings' Help row (the phone's way in: the top bar has no room for an icon). */
async function openWiki(page, how) {
  if (how === 'key') await page.keyboard.press('/');
  else {
    await page.keyboard.press('Escape');
    await wait(page, () => document.querySelector('.st-tab[data-cat="help"]'), null, 8000);
    await page.click('.st-tab[data-cat="help"]');
    await page.click('[data-row="help.wiki"] [data-hs-act="run"]');
  }
  return wait(page, (w) => document.querySelector(w + ' .wk-page'), W, 8000);
}
const shownPages = (page) => page.evaluate((w) => Array.from(document.querySelectorAll(w + ' .wk-page')).filter((p) => p.getClientRects().length > 0)
  .map((p) => p.getAttribute('data-wk-sec') + ':' + p.getAttribute('data-wk-id')), W);
/* The sheet as the phone shows it (run in the page): its right edge, how far its body scrolls sideways, and the smallest
   text showing, if any is under 12 px. */
function measure(w) {
  const el = document.querySelector(w), body = el.querySelector('[data-hs-body]');
  let small = null;
  for (const e of el.querySelectorAll('*')) {
    if (!e.childNodes.length || ![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (e.getClientRects().length && fs < 12 && (!small || fs < small.fs)) small = { fs, text: e.textContent.trim().slice(0, 30) };
  }
  return { right: Math.round(el.getBoundingClientRect().right), over: body.scrollWidth - body.clientWidth, small, vw: innerWidth };
}
/* The XP tables as the page draws them: { <page id>: { heads, rows: [{ level, next, total, me }], examples, text } }. */
const readTables = (page) => page.evaluate((w) => Object.fromEntries(Array.from(document.querySelectorAll(w + ' table[data-wk-xp]')).map((tb) => {
  const pg = tb.closest('.wk-page');
  return [pg.getAttribute('data-wk-id'), { heads: Array.from(tb.querySelectorAll('thead th')).map((th) => th.textContent.trim()),
    rows: Array.from(tb.tBodies[0].rows).map((tr) => { const c = Array.from(tr.cells).map((td) => Number(td.textContent.replace(/,/g, '')));
      return { level: c[0], next: c[1], total: c[2], me: tr.classList.contains('is-viewed') }; }),
    examples: pg.querySelectorAll('.wk-example').length, text: pg.textContent }];
})), W);
async function search(page, q) {
  await page.fill(W + ' .hw-q', q);
  await page.waitForTimeout(150);
  return shownPages(page);
}

/* ── THE CHRONICLE (WK-5, WK-6) ── A hero's sections as the server sends them: a personal best on `grounds`, the latest hunt on
   `latest` (ended), and `kills` for the titles (title id -> the server's count). */
const BEST = { solo: { xp_h: 1000, balance_h: 100 }, party: null };
function chronicleEnv(e, o) {
  e.hunt_bests = { min_ms: 600000, grounds: Object.fromEntries((o.grounds || []).map((g) => [g, BEST])) };
  if (o.latest) e.hunt = Object.assign({}, e.hunt || {}, { session_id: 'cccccccc-0000-4000-8000-000000000001', hunt_id: o.latest, ended: true });
  else delete e.hunt;
  e.titles = { rows: Object.entries(o.kills || {}).map(([id, have]) => ({ id, words: 'the Crownbreaker', price: 0, kills: 250, have, held: false, worn: false })) };
  return e;
}
const fakeHero = (o) => { const e = chronicleEnv({}, o); return { read: (k) => e[k] }; };
const openOf = (c) => c.pages.filter((p) => p.open).map((p) => p.id).join(',');

async function chronicleRules() {
  const fails = [];
  const { CHRONICLE } = await src('src/data/chronicle.js');
  const { CHRONICLE_TEXT } = await src('src/data/text/chronicle.js');
  const { chronicleOf } = await src('src/shell/chronicle-model.js');
  const open = new Set(Object.values(OPEN_GROUNDS).map((g) => g.hunt));
  for (const p of CHRONICLE) {
    for (const k of ['title_', 'teaser_', 'page_']) if (!CHRONICLE_TEXT[k + p.id]) fails.push('WK-5 the page ' + p.id + ' has no ' + k.slice(0, -1) + ' words');
    if (p.open.kind === 'ground' && !open.has(p.open.hunt)) fails.push('WK-5 the page ' + p.id + ' opens on ' + p.open.hunt + ', which is no open ground');
    if (p.open.kind === 'kills' && !CHRONICLE_TEXT['opens_' + p.id]) fails.push('WK-5 the page ' + p.id + ' never says which fight opens it');
    if (!['start', 'ground', 'kills'].includes(p.open.kind)) fails.push('WK-5 the page ' + p.id + ' opens on ' + p.open.kind);
  }
  const start =CHRONICLE.filter((p) => p.open.kind === 'start').map((p) => p.id).join(',');
  const order = (ids) => CHRONICLE.map((p) => p.id).filter((id) => ids.includes(id)).join(',');
  const cases = [
    ['nothing said', fakeHero({}), start],
    ['no hero at all', null, start],
    ['a best in Wickstead', fakeHero({ grounds: ['wickstead'] }), order([start, 'wickstead'])],
    ['the latest hunt in the Sewer', fakeHero({ latest: 'millrace_sewer' }), order([start, 'sewer'])],
    ['one Rat King kill', fakeHero({ kills: { knotcutter: 1 } }), order([start, 'rat_king'])],
    ['one win in his Hall', fakeHero({ kills: { grate_thief: 1 } }), order([start, 'rat_king'])],
    ['Rat King kills at zero, a wolf title at 500', fakeHero({ kills: { knotcutter: 0, wolfer: 500 } }), start],
  ];
  for (const [what, cs, want] of cases) {
    const got = openOf(chronicleOf(cs));
    if (got !== want) fails.push('WK-5 with ' + what + ' the Chronicle opens ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));
  }
  return fails;
}
const CK = '[data-hs-win="wiki"] .ck-page';
const ckOpen = (page) => page.evaluate((q) => Array.from(document.querySelectorAll(q + ':not(.is-shut)')).map((e) => e.getAttribute('data-wk-id')).join(','), CK);

/* ITS FACTS ARE THE CANON (chronicle.js's header; audit 2026-11-18 A14: the Chronicle called Grayjaw "he" while the Ruff, the whisker and the
   Thicket's den call Old Grayjaw the den mother): the Thicket's page says "she" of Grayjaw, never "he". Read from the file's text (a planted
   copy when a mutant names it; the table imports nothing), so the rule sees what a mutant plants. */
const CHRONICLE_FILE = 'src/data/text/chronicle.js';
async function canonRules(overrides) {
  const text = (overrides && overrides[CHRONICLE_FILE]) || await readFile(join(ROOT, CHRONICLE_FILE), 'utf8');
  const { CHRONICLE_TEXT } = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(text));
  const grayjaw = (CHRONICLE_TEXT.page_thicket || '').split(/(?<=[.!?])\s+/).filter((s) => /Grayjaw|\b(?:He|he|his|She|she|her)\b/.test(s)).join(' ');
  return /\b(?:He|he|his)\b/.test(grayjaw) || !/\b(?:She|she)\b/.test(grayjaw) ? ['WK-5 the Thicket page says of Grayjaw: ' + JSON.stringify(grayjaw.slice(0, 160))] : [];
}

async function checks(overrides, shots) {
  const fails = [...await canonRules(overrides)];
  /* a planted copy of the Chronicle's words is judged by the rule above alone: the pages below draw the shipped table */
  if (overrides && overrides[CHRONICLE_FILE]) return fails;
  if (!overrides) { // WK-1
    const { skillPages, groundPages, formulaPages } = await src('src/shell/wiki-model.js');
    const skills = skillPages().map((s) => s.id), grounds = groundPages().map((g) => g.id), formulas = formulaPages();
    for (const id of ['level', ...Object.keys(SKILLS_DEF)]) if (!skills.includes(id)) fails.push('WK-1 the skill ' + id + ' has no page');
    for (const g of Object.values(OPEN_GROUNDS)) if (!grounds.includes(g.hunt)) fails.push('WK-1 the open ground ' + g.hunt + ' has no page');
    if (formulas.map((f) => f.id).join() !== FORMULAS.join()) fails.push('WK-1 the formulas are ' + formulas.map((f) => f.id).join() + ', not ' + FORMULAS.join());
    for (const f of formulas) {
      if (f.rows) fails.push(...checkTable('WK-1', f.id, f.rows));
      else fails.push(...checkExample('WK-1', Object.assign({ id: f.id, terms: f.terms, inputs: f.example.inputs, result: f.example.result, blessed: f.example.blessed })));
    }
    /* the hero's own Level: a row already (7), one put in its place (13), one past the table's last (400), none at all */
    const { levelXpRows } = await src('src/shell/wiki-model.js');
    if (typeof levelXpRows !== 'function') fails.push('WK-1 the model has no Level XP table (levelXpRows)');
    else for (const me of [7, 13, 400, null]) fails.push(...checkTable('WK-1 (hero ' + me + ')', 'level_curve', levelXpRows(me), me));
    if ((formulas.find((f) => f.id === 'skill_xp') || {}).cap !== MAX_LEVEL) fails.push('WK-1 the combat skill page names no cap for gathering and crafting');
    /* No ground is gated by Level ("Enter anyway"), so no line may say one "opens" at a Level (audit 2026-11-13): the wiki's Level
       page, the coach's keep-hunting card and the tutorial's brook card say the Level a ground is suited to instead. */
    const GATE_WORDS = /\bground opens at\b|\bopens new grounds\b|\bit opens \{next\}|\bLevel ' \+ [^;]{0,60}' opens ' \+ HUNT_INDEX/;
    for (const p of ['src/data/text/wiki.js', 'src/data/text/coach.js', 'src/data/hunt-tutorial.js']) {
      const m = (await readFile(join(ROOT, p), 'utf8')).match(GATE_WORDS);
      if (m) fails.push('WK-1 ' + p + ' says a ground opens at a Level, but none is gated: "' + m[0] + '"');
    }
    fails.push(...await chronicleRules());
  }
  const firstGround = Object.values(OPEN_GROUNDS).map((g) => HUNT_INDEX[g.hunt]).sort((a, b) => a.band[0] - b.band[0])[0];
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const open = async (viewport, touch, prep) => {
    const ctx = await browser.newContext({ viewport, hasTouch: !!touch, isMobile: false });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = { env: Object.assign(clone(BASE_ENV), clone(TOWN)), version: 1 };
    if (prep) prep(s.env);
    await stub(page, s);
    const up = await signInAndPlay(page, 'http://127.0.0.1:' + port);
    return { ctx, page, errors, up, s };
  };
  try {
    { // WK-2, WK-3
      const { ctx, page, errors, up, s } = await open({ width: 1440, height: 900 });
      if (!up) fails.push('WK-2 the World never came up');
      else if (!(await openWiki(page, 'key'))) fails.push('WK-2 the slash did not open the Book');
      else {
        const first = await shownPages(page);
        if (!first.length || !first.every((p) => p.startsWith('chronicle:'))) fails.push('WK-2 the Book opens on ' + JSON.stringify(first.slice(0, 3)) + ', not the Chronicle');
        await page.click(W + ' .hw-tab[data-tab="skills"]');
        await page.waitForTimeout(150);
        const skills = await shownPages(page);
        if (!skills.length || !skills.every((p) => p.startsWith('skills:'))) fails.push('WK-2 the Skills tab shows ' + JSON.stringify(skills.slice(0, 3)));
        if (shots) { await page.waitForTimeout(300); await page.screenshot({ path: join(shots, 'wiki-desktop-1440x900.png') }); }
        const melee = await search(page, 'melee');
        if (!melee.includes('skills:melee') || melee.includes('skills:fishing')) fails.push('WK-2 searching "melee" shows ' + JSON.stringify(melee));
        const ground = await search(page, firstGround.name);
        if (!ground.includes('grounds:' + firstGround.id)) fails.push('WK-2 searching "' + firstGround.name + '" shows ' + JSON.stringify(ground));
        const max = await search(page, 'max hit');
        if (!max.includes('formulas:max') || max.some((p) => p.startsWith('skills:'))) fails.push('WK-2 searching "max hit" shows ' + JSON.stringify(max));
        if (shots) { await page.waitForTimeout(200); await page.screenshot({ path: join(shots, 'wiki-desktop-search-1440x900.png') }); }
        const nothing = await search(page, 'zzqx');
        const none = await page.evaluate((w) => { const n = document.querySelector(w + ' .wk-none'); return n && !n.hidden ? n.textContent : ''; }, W);
        if (nothing.length || !none.includes('zzqx')) fails.push('WK-2 a search for nonsense shows ' + JSON.stringify(nothing) + ' and says ' + JSON.stringify(none));
        await search(page, '');
        await page.click(W + ' .hw-tab[data-tab="formulas"]');
        await page.waitForTimeout(150);
        const forms = await shownPages(page);
        if (forms.join() !== FORMULAS.map((f) => 'formulas:' + f).join()) fails.push('WK-2 the Formulas tab shows ' + JSON.stringify(forms));
        if (shots) { await page.waitForTimeout(200); await page.screenshot({ path: join(shots, 'wiki-desktop-formulas-1440x900.png') }); }
        // WK-3
        const examples = await page.evaluate((w) => Array.from(document.querySelectorAll(w + ' [data-wk-formula]'))
          .map((e) => Object.assign({ id: e.getAttribute('data-wk-formula'), words: e.textContent }, JSON.parse(e.getAttribute('data-wk-check')))), W);
        if (examples.map((e) => e.id).join() !== EXAMPLES.join()) fails.push('WK-3 the page works the examples ' + JSON.stringify(examples.map((e) => e.id)));
        for (const e of examples) fails.push(...checkExample('WK-3', e, e.words));
        const hero = BASE_ENV.level.level;
        const tables = await readTables(page);
        for (const id of ['level_curve', 'skill_xp']) {
          const tb = tables[id];
          if (!tb) { fails.push('WK-3 the ' + id + ' page has no XP table'); continue; }
          if (tb.heads.join('|') !== HEADS[id].join('|')) fails.push('WK-3 the ' + id + ' table\'s columns are ' + JSON.stringify(tb.heads) + ', want ' + JSON.stringify(HEADS[id]));
          if (tb.examples) fails.push('WK-3 the ' + id + ' page still works an example');
          fails.push(...checkTable('WK-3', id, tb.rows, hero));
        }
        const skillWords = tables.skill_xp ? tables.skill_xp.text : '';
        for (const want of ['Combat skills: no max Level', 'Gathering and crafting: max Level ' + MAX_LEVEL]) if (!skillWords.includes(want)) fails.push('WK-3 the combat skill page does not say "' + want + '"');
        const death = await page.evaluate((w) => (document.querySelector(w + ' .wk-page[data-wk-id="death"]') || {}).textContent || '', W);
        if (!death || /Never below/i.test(death)) fails.push('WK-3 the death page reads ' + JSON.stringify(death.slice(0, 160)));
        /* the server moves the hero to a Level no row lists: its row comes in, in order, and is the only gold one */
        const moved = 13;
        const env = Object.assign(clone(s.env), { version: ++s.version, ok: true,
          level: { xp: levelTotalByHand(moved) + 5, level: moved, into: 5, need: levelTotalByHand(moved + 1) - levelTotalByHand(moved) } });
        await page.evaluate(([uid, e]) => window.__hub.send('hr:' + uid + ':0', { t: 'state', frame: e.version, env: e }), [UID, env]);
        await wait(page, ([w, n]) => { const r = document.querySelector(w + ' table[data-wk-xp="level"] tr.is-viewed'); return !!r && r.cells[0].textContent === String(n); }, [W, moved], 4000);
        const after = await readTables(page);
        fails.push(...checkTable('WK-3 after an envelope', 'level_curve', after.level_curve ? after.level_curve.rows : [], moved));
        if (shots) {
          await page.evaluate((w) => document.querySelector(w + ' .wk-page[data-wk-id="level_curve"]').scrollIntoView({ block: 'start' }), W);
          await page.waitForTimeout(150);
          await page.screenshot({ path: join(shots, 'wiki-desktop-level-xp-1440x900.png') });
          await page.evaluate((w) => document.querySelector(w + ' .wk-page[data-wk-id="skill_xp"]').scrollIntoView({ block: 'start' }), W);
          await page.waitForTimeout(150);
          await page.screenshot({ path: join(shots, 'wiki-desktop-skill-xp-1440x900.png') });
          await page.evaluate((w) => document.querySelector(w + ' .wk-page[data-wk-id="death"]').scrollIntoView({ block: 'start' }), W);
          await page.waitForTimeout(150);
          await page.screenshot({ path: join(shots, 'wiki-desktop-death-1440x900.png') });
        }
      }
      if (errors.length) fails.push('WK-2 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // WK-4
      const { ctx, page, errors, up } = await open({ width: 922, height: 423 }, true);
      if (!up || !(await openWiki(page, 'help'))) fails.push('WK-4 Settings, Help did not open the Wiki on the phone');
      else {
        await page.waitForTimeout(600);
        const m = await page.evaluate(measure, W);
        if (m.right > m.vw || m.over > 1) fails.push('WK-4 the phone sheet is ' + JSON.stringify(m));
        if (m.small) fails.push('WK-4 text under 12 px on the phone: ' + JSON.stringify(m.small));
        if (shots) await page.screenshot({ path: join(shots, 'wiki-phone-922x423.png') });
        await page.click(W + ' .hw-tab[data-tab="formulas"]');
        await page.waitForTimeout(200);
        const f = await page.evaluate(measure, W);
        if (f.over > 1) fails.push('WK-4 the Formulas overflow the phone sheet by ' + f.over + ' px');
        if (f.small) fails.push('WK-4 text under 12 px in the Formulas on the phone: ' + JSON.stringify(f.small));
        if (shots) {
          await page.screenshot({ path: join(shots, 'wiki-phone-formulas-922x423.png') });
          for (const id of ['level_curve', 'skill_xp']) {
            await page.evaluate(([w, p]) => document.querySelector(w + ' .wk-page[data-wk-id="' + p + '"]').scrollIntoView({ block: 'start' }), [W, id]);
            await page.waitForTimeout(150);
            await page.screenshot({ path: join(shots, 'wiki-phone-' + id.replace('_', '-') + '-922x423.png') });
          }
        }
      }
      if (errors.length) fails.push('WK-4 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // WK-6
      /* a best in the Cellar, the latest hunt at Wickstead (ended), the Rat King at zero kills and another title at 40 */
      const said = { grounds: ['mill_cellar'], latest: 'wickstead', kills: { knotcutter: 0, ratcatcher: 40 } };
      const { ctx, page, errors, up, s } = await open({ width: 1440, height: 900 }, false, (e) => chronicleEnv(e, said));
      const want = 'havora,cellar,wickstead';
      if (!up || !(await openWiki(page, 'key'))) fails.push('WK-6 the Book did not open');
      else {
        await page.waitForTimeout(300);
        const got = await ckOpen(page);
        if (got !== want) fails.push('WK-6 the envelope opens ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));
        if (shots) {
          await page.screenshot({ path: join(shots, 'chronicle-desktop-1440x900.png') });
          /* the first shut page in view: its title, its line and where it opens */
          await page.evaluate((q) => { const p = document.querySelector(q + '.is-shut'); if (p) p.scrollIntoView({ block: 'start' }); }, CK);
          await page.waitForTimeout(150);
          await page.screenshot({ path: join(shots, 'chronicle-shut-desktop-1440x900.png') });
          await page.evaluate((q) => { const p = document.querySelector(q); if (p) p.scrollIntoView({ block: 'start' }); }, CK);
        }
        /* a shut page says what opens it; its ground's name opens that ground's page in Hunts */
        const how = await page.evaluate((q) => { const p = document.querySelector(q + '[data-wk-id="sewer"]'); return p ? { shut: p.classList.contains('is-shut'), how: (p.querySelector('.ck-how') || {}).textContent || '',
          link: !!p.querySelector('.ck-how [data-hs-goto]') } : null; }, CK);
        if (!how || !how.shut || !/The Sewer/.test(how.how) || !how.link) fails.push('WK-6 the shut Sewer page reads ' + JSON.stringify(how));
        const king = await page.evaluate((q) => { const p = document.querySelector(q + '[data-wk-id="rat_king"]'); return p ? (p.querySelector('.ck-how') || {}).textContent : null; }, CK);
        if (!king || !/Rat King/.test(king)) fails.push('WK-6 the shut Rat King page says ' + JSON.stringify(king));
        /* the server adds the Sewer and a Rat King kill: both pages open while the Book is open, nothing pressed */
        s.env = chronicleEnv(s.env, { grounds: ['mill_cellar', 'millrace_sewer'], latest: 'wickstead', kills: { knotcutter: 1 } });
        const env = Object.assign(clone(s.env), { version: ++s.version, ok: true });
        await page.evaluate(([uid, e]) => window.__hub.send('hr:' + uid + ':0', { t: 'state', frame: e.version, env: e }), [UID, env]);
        const live = 'havora,cellar,sewer,rat_king,wickstead';
        if (!(await wait(page, ([q, w]) => Array.from(document.querySelectorAll(q + ':not(.is-shut)')).map((e) => e.getAttribute('data-wk-id')).join(',') === w, [CK, live], 4000)))
          fails.push('WK-6 a new envelope left the open Book at ' + JSON.stringify(await ckOpen(page)) + ', want ' + JSON.stringify(live));
        /* a reload on the same envelope: the same pages, nothing kept by the browser */
        await page.reload({ waitUntil: 'load' });
        await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"], .hs-launchers .hs-launch'));
        if (await page.$('[data-app="play"][data-slot="0"]')) await page.click('[data-app="play"][data-slot="0"]');
        await wait(page, () => document.querySelector('.hs-launchers .hs-launch'));
        if (!(await openWiki(page, 'key'))) fails.push('WK-6 after a reload the slash did not open the Book');
        else {
          await page.waitForTimeout(300);
          const again = await ckOpen(page);
          if (again !== live) fails.push('WK-6 after a reload the Chronicle opens ' + JSON.stringify(again) + ', want ' + JSON.stringify(live));
          /* the shut Slake page's ground opens Hunts on the Slake */
          /* a link the page hides is a red rule, never a thrown run */
          const pressed = await page.click(CK + '[data-wk-id="slake"] .ck-how [data-hs-goto]', { timeout: 3000 }).then(() => true, () => false);
          const picked = pressed && await wait(page, () => !!document.querySelector('[data-hs-win="hunts"] .hw-hunt-enter[data-hunt="the_slake"]'), null, 4000);
          if (!picked) fails.push('WK-6 the Slake\'s name on its shut page did not open the Slake in Hunts' + (pressed ? '' : ' (no visible link to press)'));
        }
      }
      if (errors.length) fails.push('WK-6 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
  } finally {
    server.close();
  }
  return fails;
}

/* Each plants one defect the rules above exist for. [name, file, from, to] */
const MUTANTS = [
  ['WK-5 the Chronicle calls Grayjaw "he" again (audit A14)', 'src/data/text/chronicle.js', "She\\'s slower than the young ones, but she got old", "He\\'s slower than the young ones, but he got old"],
  ['the engine\'s base chance to hit moves and the words do not', 'src/core/combat.js', '  let accuracy = 0.55 + (', '  let accuracy = 0.6 + ('],
  ['the engine\'s max hit per Level moves and the words do not', 'src/core/combat.js', '(dmgLvl * 0.35)', '(dmgLvl * 0.4)'],
  ['a monster\'s chance to hit grows faster than the words say', 'src/core/combat.js', ' - playerDefense) * b.monsterAccuracyPerPoint),', ' - playerDefense) * b.monsterAccuracyPerPoint * 1.5),'],
  ['a monster\'s max hit gains a point the words never mention', 'src/core/combat.js', '  return Math.max(1, Math.floor(((monster && monster.atk) || 1) * scale));', '  return Math.max(1, Math.floor(((monster && monster.atk) || 1) * scale) + 1);'],
  ['a death takes more than its stated share', 'src/core/action-rules.js', '  return Math.max(0, Math.min(Math.floor(x * f), x));', '  return Math.max(0, Math.min(Math.floor(x * f * 1.1), x));'],
  ['the Level curve\'s step grows faster than its data rows say', 'src/core/xp.js', '+ r.rise * sumK(m) + r.bend * sumK2(m);', '+ r.rise * sumK(m) + r.bend * sumK2(m + 1);'],
  ['a combat skill Level costs a point more than its data rows say', 'src/core/xp.js', '    const step = Number((base * sl * sl * powNum) / powDen);', '    const step = Number((base * sl * sl * powNum) / powDen) + 1;'],
  ['an XP table\'s Total is the next Level\'s', 'src/shell/wiki-model.js', 'const total = xpAt(level), next = xpAt(level + 1) - total;', 'const total = xpAt(level + 1), next = xpAt(level + 1) - xpAt(level);'],
  ['the hero\'s Level is never put among the rows', 'src/shell/wiki-model.js', 'const levels = me === null || LEVEL_TABLE.includes(me) ? LEVEL_TABLE : [...LEVEL_TABLE, me].sort((a, b) => a - b);', 'const levels = LEVEL_TABLE;'],
  ['the gold row is drawn once and never follows the server', 'src/shell/windows/wiki.js', "if (!table || table.getAttribute('data-wk-me') === meKey(level)) return;", "if (!table || table.hasAttribute('data-wk-me')) return;"],
  ['the XP tables head a column with a bracket term', 'src/data/text/wiki.js', "xp_total: 'Total XP',", "xp_total: 'Curve',"],
  ['the combat skill page names no cap for gathering and crafting', 'src/shell/wiki-model.js', 'cap: Object.keys(SKILLS_DEF).some(isCapped) ? MAX_LEVEL : null }', 'cap: null }'],
  ['the death page says "Never below Level 1" again', 'src/data/text/wiki.js', "combat skill progress\\nBlessings: {cuts}',", "combat skill progress\\nNever below Level 1\\nBlessings: {cuts}',"],
  ['the wiki states a base chance the engine does not use', 'src/shell/wiki-model.js', 'terms: { base: B.playerBaseAccuracy,', 'terms: { base: B.playerBaseAccuracy + 0.05,'],
  ['Settings, Help has no door to the Wiki', 'src/data/settings.js', "  type: 'action', open: 'wiki',", "  type: 'action', open: 'report',"],
  ['the search never finds a page', 'src/shell/windows/wiki.js', 'const on = q ? findText(p).includes(q) :', 'const on = q ? false :'],
  ['the Book opens on the Skills, not the story', 'src/shell/windows/wiki.js', "s = { tab: 'chronicle', query: '' }", "s = { tab: 'skills', query: '' }"],
  ['a title with no kills opens its page', 'src/shell/chronicle-model.js', '(kills.get(id) || 0) >= 1', '(kills.get(id) || 0) >= 0'],
  ['any title\'s kills open the Rat King\'s page', 'src/shell/chronicle-model.js', "if (o.kind === 'kills') return o.titles.some((id) => (kills.get(id) || 0) >= 1);", "if (o.kind === 'kills') return Array.from(kills.values()).some((n) => n >= 1);"],
  ['the latest hunt opens nothing', 'src/session/hunt-sections.js', '  if (h && h.huntId) seen.add(h.huntId);\n  return seen;', '  return seen;'],
  ['the Chronicle is drawn once and never follows the server', 'src/shell/windows/wiki.js', "if (sec.getAttribute('data-ck') === c.key) return;", "if (sec.hasAttribute('data-ck')) return;"],
  ['a shut page\'s ground is no link', 'src/shell/windows/wiki.js', "linkHtml(h.ground, targetOf({ kind: 'hunt', hunt: h.hunt }))", 'esc(h.ground)'],
  ['an example\'s sentence drops its answer', 'src/shell/windows/wiki.js', "example: t('wiki.max_example', { level: I.level, monster: I.monster, result: r }) };", "example: t('wiki.max_example', { level: I.level, monster: I.monster, result: '?' }) };"],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'wiki-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'wiki-window: ' + fails.length + ' rule(s) RED'
      : 'wiki-window: every skill, open ground and formula has a page; the slash opens the Book on the Chronicle, whose pages open only on the server\'s word and follow every envelope and a reload; the search finds a skill, a ground and a formula; every worked example is the engine\'s answer and equals its stated terms; the XP tables are their curves\' rows, the hero\'s Level the gold row as the server moves it; a sheet on the phone');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await checks(null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  let bad = 0;
  for (const [name, file, from, to] of MUTANTS) {
    const text = (await readFile(join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');
    if (text.split(from).length !== 2) { console.log('  ✗ ' + name + ' — anchor not found once in ' + file); bad++; continue; }
    const fails = await checks({ [file]: text.replace(from, () => to) });
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'wiki-window --mutate: ' + bad + ' escaped' : 'wiki-window --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
