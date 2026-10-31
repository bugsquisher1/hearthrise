#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/honor-window.mjs — THE ROLL OF HONOR ON SCREEN, IN A REAL CHROMIUM (lane/b-leaderboards).
//
//   node tests/honor-window.mjs            the rules
//   node tests/honor-window.mjs --mutate   every planted defect must turn a rule RED
//   node tests/honor-window.mjs --shots <dir>   also write the desktop and phone screenshots
//
// mutant-anchors: src/shell/windows/honor.js src/session/honor-roll.js src/data/honor-roll.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs); the hero is
// tests/fixtures/alpha-envelope.json ("Tyler", slot 0) in town. hr_leaderboard answers in the shape of
// 2027-02-12-leaderboard-heroes.sql (the server half is guarded by tests/leaderboard-server-source.mjs;
// the whole loop on the real chain is tests/honor-roll-world.mjs).
//   HP-1  Z opens the window with zero console errors on the Level board: the server's rows, by name, in
//         the server's order, each "Level N" with its XP; a tie shows ONE place twice (the server's place,
//         never the row's index); the viewed hero reads "Your hero", the account's other hero "Also yours";
//         the count and "Updated N minutes ago" are the server's
//   HP-2  that took ONE hr_leaderboard read naming only the board, a row count and a span: no value crosses
//   HP-3  OFF THE TOP: the viewed hero 27th of 40 is still found: "Tyler stands 27th of 40.", the rows either
//         side of it, and how far ahead the next hero up is
//   HP-4  picking an empty board (Fishing) asks for it once and says so honestly, with how to get on
//   HP-5  a refusal reads in plain words and is asked again later, not on every tick
//   HP-6  a row that is not the server's shape is not drawn
//   HP-7  the boards offered are the server's sourced ones (Level, Total level, the 13 catalogue skills):
//         never wealth, clan power, renown, bosses or a skill no hero can have
//   HP-8  the phone (922x423): the window is a sheet no wider than 400 px, nothing overflows sideways,
//         and no text in it is under 12 px
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const TOWN = { hunt: null, state: Object.assign(clone(BASE_ENV.state), { active_kind: 'idle', active_id: null }) };
const AT = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
const row = (rank, place, name, level, score, slot) => Object.assign({ rank, place, name, level, score }, slot === undefined ? {} : { mine: true, slot });
/* The Level board: a tie for 2nd; the viewed hero (slot 0) is 4th, the account's other hero (slot 1) 1st. */
const LEVEL = { ok: true, board: 'level', available: true, refreshed_at: AT(3), total: 4,
  top: [row(1, 1, 'Wennet', 12, 90210, 1), row(2, 2, 'Osric', 9, 40000), row(3, 2, 'Maela', 9, 40000), row(4, 4, 'Tyler', 6, 9001, 0),
    { rank: 5, place: 5, name: 'Broken row', level: 'nine', score: 1 }],
  mine: [row(4, 4, 'Tyler', 6, 9001, 0), row(1, 1, 'Wennet', 12, 90210, 1)].map((m, i) => Object.assign(m, {
    near: i === 0 ? [row(3, 2, 'Maela', 9, 40000), row(4, 4, 'Tyler', 6, 9001, 0)] : [row(1, 1, 'Wennet', 12, 90210, 1), row(2, 2, 'Osric', 9, 40000)] })) };
/* Total level with the viewed hero far off the top 25. */
const TOP25 = Array.from({ length: 25 }, (_, i) => row(i + 1, i + 1, 'Hero' + String.fromCharCode(65 + i), 200 - i, 200 - i));
const TOTAL = { ok: true, board: 'total_level', available: true, refreshed_at: AT(0), total: 40, top: TOP25,
  mine: [Object.assign(row(27, 27, 'Tyler', 170, 170, 0), { near: [row(26, 26, 'Corwin', 174, 174), row(27, 27, 'Tyler', 170, 170, 0), row(28, 28, 'Dunstan', 168, 168)] })] };
const FISHING = { ok: true, board: 'skill:fishing', available: true, refreshed_at: AT(1), total: 0, top: [], mine: [] };
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body, at: Date.now() });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign(clone(s.env), { version: ++s.version, ok: true }));
    if (name === 'hr_leaderboard') return json(s.refuse ? { ok: false, error: 'rate_limited' } : s.boards[body.p_board] || { ok: false, error: 'unknown_board' });
    return json({ ok: true });
  });
}

async function signInAndPlay(page, base) {
  await page.goto(base + '/play.html', { waitUntil: 'load' });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

const readRoll = (page) => page.evaluate(() => {
  const w = document.querySelector('[data-hs-win="honor"]');
  if (!w) return null;
  const line = (li) => ({ place: li.querySelector('.hr-place').textContent, name: li.querySelector('.hr-name b').textContent,
    tag: li.querySelector('.hr-name small').textContent, value: li.querySelector('.hr-val b').textContent,
    xp: li.querySelector('.hr-val small').textContent, viewed: li.classList.contains('is-viewed') });
  return { title: w.querySelector('.hr-title').textContent,
    lines: Array.from(w.querySelectorAll('.hr-roll:not(.hr-near) > .hr-line')).map(line),
    near: Array.from(w.querySelectorAll('.hr-near > .hr-line')).map(line),
    count: w.querySelector('.hr-count').textContent, fresh: w.querySelector('.hr-fresh').textContent,
    empty: w.querySelector('.hr-empty.is-on') ? w.querySelector('.hr-empty').textContent : '',
    you: w.querySelector('.hr-you.is-on') ? w.querySelector('.hr-you-line').textContent : '',
    next: w.querySelector('.hr-you-next').textContent };
});

async function checks(overrides, shots) {
  const fails = [];
  // ── HP-7 (no browser): the boards offered ──
  const dataSrc = overrides ? overrides['src/data/honor-roll.js'] : undefined;
  const data = dataSrc === undefined ? await import(pathToFileURL(join(ROOT, 'src/data/honor-roll.js')).href)
    : await import('data:text/javascript,' + encodeURIComponent(dataSrc.replace(/from '\.\//g, "from '" + pathToFileURL(join(ROOT, 'src/data')).href + '/')));
  const { SKILLS_DEF } = await import(pathToFileURL(join(ROOT, 'src/data/skills.js')).href);
  const sourced = new Set(['level', 'total_level', ...Object.keys(SKILLS_DEF).map((k) => 'skill:' + k)]);
  const ids = data.HONOR_BOARDS.map((b) => b.id);
  const stray = ids.filter((id) => !sourced.has(id));
  if (stray.length) fails.push('HP-7 the window offers boards no hero can be ranked on: ' + stray.join(', '));
  if (ids.length !== sourced.size || new Set(ids).size !== ids.length) fails.push('HP-7 the boards are not the ' + sourced.size + ' sourced ones, once each: ' + ids.join(', '));

  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const open = async (viewport, touch) => {
    const ctx = await browser.newContext({ viewport, hasTouch: !!touch, isMobile: false });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = { env: Object.assign(clone(BASE_ENV), clone(TOWN)), version: 1, calls: [], refuse: false,
      boards: { level: clone(LEVEL), total_level: clone(TOTAL), 'skill:fishing': clone(FISHING) } };
    await stub(page, s);
    const up = await signInAndPlay(page, 'http://127.0.0.1:' + port);
    return { ctx, page, errors, s, up };
  };
  const reads = (s) => s.calls.filter((c) => c.name === 'hr_leaderboard');
  const pick = async (page, board) => {
    await page.selectOption('[data-hs-win="honor"] select[data-hs-act="board"]', board);
    return wait(page, (b) => { const w = document.querySelector('[data-hs-win="honor"]');
      return w && w.querySelector('select').value === b && !/Reading the roll/.test(w.querySelector('.hr-empty').textContent || '')
        && (w.querySelector('.hr-roll:not(.hr-near) > .hr-line') || w.querySelector('.hr-empty.is-on')); }, board);
  };
  try {
    { // HP-1, HP-2, HP-3, HP-4, HP-6
      const { ctx, page, errors, s, up } = await open({ width: 1440, height: 900 });
      if (!up) fails.push('HP-1 the World never came up');
      await page.keyboard.press('z');
      const drawn = await wait(page, () => document.querySelectorAll('[data-hs-win="honor"] .hr-roll:not(.hr-near) > .hr-line').length >= 4);
      const r = await readRoll(page);
      if (!drawn || !r) fails.push('HP-1 Z did not open the Roll of Honor with the server\'s rows');
      else {
        const got = r.lines.map((l) => [l.place, l.name, l.value, l.xp].join(' ')).join(' | ');
        const want = '1st Wennet Level 12 90,210 XP | 2nd Osric Level 9 40,000 XP | 2nd Maela Level 9 40,000 XP | 4th Tyler Level 6 9,001 XP';
        if (got !== want) fails.push('HP-1/HP-6 the roll reads "' + got + '", the server said "' + want + '"');
        const tags = r.lines.map((l) => l.name + ':' + (l.tag || '-') + (l.viewed ? '*' : '')).join(' ');
        if (tags !== 'Wennet:Also yours Osric:- Maela:- Tyler:Your hero*') fails.push('HP-1 the marks read ' + tags);
        if (r.title !== 'Level' || r.count !== '4 heroes on this roll' || r.fresh !== 'Updated 3 minutes ago') fails.push('HP-1 the heading reads ' + JSON.stringify([r.title, r.count, r.fresh]));
        if (r.you !== 'Tyler stands 4th of 4.' || r.next !== 'Maela, the next hero up, is 30,999 XP ahead.') fails.push('HP-1 the standing reads ' + JSON.stringify([r.you, r.next]));
        if (r.near.length) fails.push('HP-1 a hero on the top list is drawn twice (the rows around it)');
      }
      if (shots) await page.screenshot({ path: join(shots, 'honor-desktop.png') });
      const first = reads(s);
      const keys = first.length ? Object.keys(first[0].body).sort().join(',') : '';
      if (first.length !== 1 || keys !== 'p_board,p_limit,p_span' || first[0].body.p_board !== 'level')
        fails.push('HP-2 opening sent ' + first.length + ' read(s) with ' + JSON.stringify(first.map((c) => c.body)));
      if (!(await pick(page, 'total_level'))) fails.push('HP-3 Total level never drew');
      const t = await readRoll(page);
      if (t.lines.length !== 25 || t.lines.some((l) => l.viewed)) fails.push('HP-3 the top 25 is ' + t.lines.length + ' rows (viewed marked: ' + t.lines.some((l) => l.viewed) + ')');
      if (t.you !== 'Tyler stands 27th of 40.' || t.next !== 'Corwin, the next hero up, is 4 levels ahead.') fails.push('HP-3 off the top the standing reads ' + JSON.stringify([t.you, t.next]));
      if (t.near.map((l) => l.place + ' ' + l.name + (l.viewed ? '*' : '')).join(', ') !== '26th Corwin, 27th Tyler*, 28th Dunstan') fails.push('HP-3 the rows around the hero read ' + JSON.stringify(t.near));
      if (t.fresh !== 'Updated just now') fails.push('HP-3 the stamp reads ' + t.fresh);
      const n0 = reads(s).length;
      if (!(await pick(page, 'skill:fishing'))) fails.push('HP-4 Fishing never drew');
      const f = await readRoll(page);
      if (reads(s).length !== n0 + 1 || reads(s).at(-1).body.p_board !== 'skill:fishing') fails.push('HP-4 picking Fishing sent ' + (reads(s).length - n0) + ' reads');
      if (f.lines.length || f.empty !== 'No hero has trained Fishing yet. The first to do it takes first place.'
        || f.you !== 'Tyler is not on this roll yet. Train Fishing to earn a place: fish at a fishing spot.') fails.push('HP-4 the empty board reads ' + JSON.stringify(f));
      await page.waitForTimeout(1200);
      if (reads(s).length !== n0 + 1) fails.push('HP-2 the window kept asking while open (' + (reads(s).length - n0) + ' reads in 1.2 s)');
      if (errors.length) fails.push('HP-1 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // HP-5
      const { ctx, page, s } = await open({ width: 1440, height: 900 });
      s.refuse = true;
      await page.keyboard.press('z');
      const said = await wait(page, () => { const e = document.querySelector('[data-hs-win="honor"] .hr-empty.is-on');
        return e && e.textContent && !/Reading the roll/.test(e.textContent); });
      const words = await page.evaluate(() => document.querySelector('[data-hs-win="honor"] .hr-empty')?.textContent || '');
      await page.waitForTimeout(1500);
      const n = reads(s).length;
      if (!said || /rate_limited|error|undefined/i.test(words)) fails.push('HP-5 a refusal reads ' + JSON.stringify(words));
      if (n > 1) fails.push('HP-5 a refused read was asked again ' + (n - 1) + ' times in 1.5 s');
      await ctx.close();
    }
    { // HP-8
      const { ctx, page, errors } = await open({ width: 922, height: 423 }, true);
      await page.keyboard.press('z');
      const drawn = await wait(page, () => document.querySelectorAll('[data-hs-win="honor"] .hr-roll:not(.hr-near) > .hr-line').length >= 4);
      await page.waitForTimeout(600);   // the 120 ms slide-in ends and the World makes room for the sheet
      const m = await page.evaluate(() => {
        const w = document.querySelector('[data-hs-win="honor"]');
        const body = w.querySelector('[data-hs-body]');
        let small = null;
        for (const e of w.querySelectorAll('*')) {
          if (!e.childNodes.length || ![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
          const fs = parseFloat(getComputedStyle(e).fontSize);
          if (e.getClientRects().length && fs < 12 && (!small || fs < small.fs)) small = { fs, text: e.textContent.trim().slice(0, 30) };
        }
        return { width: Math.round(w.getBoundingClientRect().width), right: Math.round(w.getBoundingClientRect().right),
          over: body.scrollWidth - body.clientWidth, small, vw: innerWidth };
      });
      if (!drawn) fails.push('HP-8 the phone never drew the roll');
      if (m.width > 400 || m.right > m.vw || m.over > 1) fails.push('HP-8 the phone sheet is ' + JSON.stringify(m));
      if (m.small) fails.push('HP-8 text under 12 px on the phone: ' + JSON.stringify(m.small));
      if (errors.length) fails.push('HP-8 console errors: ' + errors.slice(0, 3).join(' | '));
      if (shots) await page.screenshot({ path: join(shots, 'honor-phone-922x423.png') });
      await ctx.close();
    }
  } finally {
    server.close();
  }
  return fails;
}

/* Each plants one defect the rules above exist for. [name, file, from, to] */
const MUTANTS = [
  ['every own hero reads as the viewed one', 'src/shell/windows/honor.js', '  const viewed = r.mine && r.slot === st.slot;', '  const viewed = r.mine;'],
  ['the place is the row\'s position, not the server\'s (a tie reads 2nd, 3rd)', 'src/shell/windows/honor.js',
    "  text(li.querySelector('.hr-place'), ordinal(r.place));", "  text(li.querySelector('.hr-place'), ordinal(r.rank));"],
  ['the window asks on every tick', 'src/shell/windows/honor.js', '  const due = sc.stale || ctx.now() - sc.askedAt >= REASK_MS;', '  const due = true;'],
  ['a refused read is asked again at once', 'src/shell/windows/honor.js', '        sc.askedAt = ctx.now() - REASK_MS + RETRY_MS;', '        sc.askedAt = -Infinity;'],
  ['off the top list the hero\'s neighbours are not drawn', 'src/shell/windows/honor.js', '  return { line, next, near: inTop ? [] : me.near };', '  return { line, next, near: [] };'],
  ['an empty board shows nothing at all', 'src/shell/windows/honor.js', "  cls(empty, 'is-on', !roll || !roll.top.length);", "  cls(empty, 'is-on', !roll);"],
  ['the read sends a value', 'src/session/honor-roll.js', '{ p_board: board, p_limit: HONOR_TOP, p_span: 1 }', '{ p_board: board, p_limit: HONOR_TOP, p_span: 1, p_score: 0 }'],
  ['a row that is not the server\'s shape is drawn', 'src/session/honor-roll.js',
    "  if (!rank || !place || level === null || score === null || typeof r.name !== 'string' || !r.name) return null;",
    "  if (!rank || typeof r.name !== 'string' || !r.name) return null;"],
  ['the cut wealth board is offered again', 'src/data/honor-roll.js', "  skill('melee', 'Fighting'),",
    "  Object.freeze({ id: 'wealth', group: 'Hunting', label: 'Wealth', reads: 'total', glyph: 'uiCoinStack', why: 'Gold.', empty: 'None.', join: 'Earn gold.' }),\n  skill('melee', 'Fighting'),"],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'honor-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'honor-window: ' + fails.length + ' rule(s) RED'
      : 'honor-window: opens on Z; the server\'s rows, places and marks; one read naming a board only; the hero found off the top; empty boards honest; refusals in words, not hammered; only sourced boards; a sheet on the phone');
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
  console.log(bad ? 'honor-window --mutate: ' + bad + ' escaped' : 'honor-window --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
