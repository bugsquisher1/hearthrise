#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/tally-window.mjs — TAMSIN'S TALLY ON SCREEN, IN A REAL CHROMIUM (lane c-tally-tasks).
//
//   node tests/tally-window.mjs            the rules
//   node tests/tally-window.mjs --mutate   every planted defect must turn a rule RED
//   node tests/tally-window.mjs --shots <dir>   also write TW-11's screenshots (moved, folded; desktop and phone)
//
// mutant-anchors: src/shell/windows/tally.js src/session/tally-sections.js src/session/tally-intents.js src/shell/windows/hunts.js src/shell/shell.js src/shell/widgets/tally-hud.js src/shell/widget-move.js src/shell/hud-room.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs);
// the character is tests/fixtures/alpha-envelope.json plus a `tally` section
// (2026-12-23-tally-tasks.sql): Gray Wolves 112/200 held, Giant Rats done (120/120),
// light armour, 1 paid today of 3. Her board is hr_tally_view's answer.
//   TW-1  Q opens her window with zero console errors; it draws the SERVER's tallies as her
//         ledger entries (Gray Wolves 112 / 200, five of ten marks cut, the piece in its pocket,
//         "You'll get 480 gp and …", the done one lifted and saying what happens next), her
//         day count with its reset, and her board of the tasks you don't hold (two lines a row,
//         the ground a take-me-there link, the pay piece, a real Take)
//   TW-14 HER LINE PER STATE (mocks 2026-11-11): first visit, just taken, counting while hunting
//         (and "counting here" on that ground), done while hunting, done in town, just paid (an
//         older pay is not), the day's pay used up; her pick folded to one line, Change opens the
//         weights and her slot chips, a chip sends ONE hr_tally_set with that slot first
//   TW-15 SHE GIVES IT ONCE: a piece on two rows says so on both (the 11-11 bug: sharedPieces read
//         pick.pick while tally-intents.js hands over pick.kind, so the note never showed); the
//         pure helpers (sharedPieces, cutMarks, resetWords, keeperSay)
//   TW-16 TAKE ME THERE: an entry's ground link opens the Hunts window on that ground
//   TW-2  IN TOWN a done task due today is handed in by ONE hr_tally_collect naming
//         only the slot and a key, then the character is re-read
//   TW-3  Take sends ONE hr_tally_accept with catalogue ids only (no count, no price)
//         and every control is off until the server answers
//   TW-4  a refusal reads in plain words (tally_full)
//   TW-5  WHILE HUNTING her board says it is on the Common, Take is off and nothing
//         is handed in (the settle that brings the hero home pays)
//   TW-6  the HUD's tally and the hunt list read the server's count ("Gray Wolves 112/200")
//   TW-7  FAIL SAFE: with no tally section nothing is drawn and nothing can be taken
//   TW-10 A NEW HERO (board 2026-10-25 #13): never met Tamsin (no weight, nothing held or paid) = no Tally box in town; met = her line
//   TW-9  HER WORDS in plain English: the greeting says what happens (Tyler 2026-10-24), and no line
//         a player reads from her keeps the old riddles ("your half of the stick", "a piece for your back")
//   TW-8  THE HUD'S PLACE (v0.2.37 run 40020854780): hunting with three tasks held, the tally
//         overlaps no World panel at 1440x900, 1100x800 or 1024x700 (it stacks under the
//         analyzer), nor on the phone (922x423) when the player shows it there (under the
//         hunt bar); with nothing to show it takes no room (its empty box sat on the analyzer
//         and pushed the town camera off the hero, window-camera WC-3)
//   TW-11 MOVE AND FOLD (Tyler 2026-10-25: "need to be able to move and minimize hunt analyzer and Tally"),
//         hunting with three tasks held at 1440x900: the analyzer's dash folds it to its title and the Tally
//         under it rises (clear of it); a reload keeps the fold. Its title drags it to the bottom-left, the
//         unmoved Tally rises to its own top, and a reload puts the analyzer back on the same px; a smaller
//         desktop keeps it bottom-left and on screen. The Tally drags by its title without opening her window
//         (a plain press still does) and, moved, sits where it was dropped, stacked under nothing; Put back
//         (HUD layout) returns the analyzer. The phone (844x390) folds and keeps the fold, and never drags.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { scopedMutants } from '../tools/lib/mutant-scope.mjs';
import { pinFonts } from './_test-fonts.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
/* TW-10's phone: the hunt screen's own fixture, whose action bar keeps HS-22's 100 px (alpha's runs 104 px at 844x390). */
const HUNT_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const ORDER = ['helmet', 'body', 'pants', 'boots', 'gloves', 'belt'];
const TALLY = {
  held: [
    { place: 1, task: 'thicket_gray_wolves', hunt: 'meadowbrook_thicket', monster: 'gray_wolf', kills: 112, target: 200, keep: false, done: false, done_at: null, wait: null },
    { place: 2, task: 'cellar_giant_rats', hunt: 'mill_cellar', monster: 'rat', kills: 120, target: 120, keep: true, done: true, done_at: '2026-10-23T10:00:00.000Z', wait: null }],
  /* the fixture's server clock is its hunt_server_now_ms, 2025-10-17T12:00Z (its `now` string says 2026), so the day resets in 6 h */
  paid_today: 1, per_day: 3, held_max: 3, weight: 'light', order: ORDER, recent: [], day_ends_at: '2025-10-17T18:00:00.000Z',
};
/* TW-8: her three tasks held at once (held_max), so the HUD's tally is as tall as it gets. */
const TALLY3 = Object.assign(clone(TALLY), { held: TALLY.held.concat([
  { place: 3, task: 'glade_poachers', hunt: 'mosslight_glade', monster: 'glade_poacher', kills: 20, target: 60, keep: false, done: false, done_at: null, wait: null }]) });
const BOARD = { ok: true, hunting: false, tally: TALLY, board: [
  { task: 'cellar_giant_rats', hunt: 'mill_cellar', monster: 'rat', target: 120, gold: 100, party: false, band_min: 1, held: true, pick: { pick: 'material', item: 'slime_gel', qty: 4 } },
  { task: 'thicket_gray_wolves', hunt: 'meadowbrook_thicket', monster: 'gray_wolf', target: 200, gold: 480, party: false, band_min: 5, held: true, pick: { pick: 'piece', item: 'apprentice_body', qty: 1 } },
  { task: 'glade_poachers', hunt: 'mosslight_glade', monster: 'glade_poacher', target: 60, gold: 920, party: false, band_min: 16, held: false, pick: { pick: 'piece', item: 'adept_helmet', qty: 1 } },
  /* the same piece on two rows (she gives it once): TW-15 */
  { task: 'wickstead_turncoats', hunt: 'wickstead', monster: 'turncoat', target: 50, gold: 780, party: false, band_min: 8, held: false, pick: { pick: 'piece', item: 'adept_helmet', qty: 1 } }] };
const TOWN = { hunt: null, state: Object.assign(clone(BASE_ENV.state), { active_kind: 'idle', active_id: null }), tally: TALLY };
const RPCS = ['hr_tally_accept', 'hr_tally_drop', 'hr_tally_set', 'hr_tally_collect'];
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign(clone(s.env), { version: ++s.version, ok: true }));
    if (name === 'hr_tally_view') return json(s.board);
    /* the server keeps what hr_put_client_state sends and hands it back in every envelope (as hr_state_of does) */
    if (name === 'hr_put_client_state') { s.env.client_state = Object.assign({}, s.env.client_state, body.p_patch); return json({ ok: true }); }
    if (RPCS.includes(name)) {
      await new Promise((ok) => setTimeout(ok, 400));
      return json(s.answers[name] || (name === 'hr_tally_collect' ? { ok: true, paid: [{ claim: 'c1', task: 'cellar_giant_rats', gold: 100, item: 'slime_gel', qty: 4, pick: 'material' }], wait: null } : { ok: true }));
    }
    return json({ ok: true });
  });
}

/* A reload keeps the signed-in session: the sign-in form, the character list or the World, whichever comes; then
   `ready` (default: the three held tallies). */
async function backIn(page, ready = () => document.querySelectorAll('[data-hs-widget="tally"] .hs-tally-row').length === 3) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"], [data-app="play"][data-slot="0"], .hs-launchers'));
  if (await page.$('form[data-auth="sign-in"]')) {
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
    await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"], .hs-launchers'));
  }
  if (await page.$('[data-app="play"][data-slot="0"]')) await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, ready);
}

/* TW-10: a widget's box on the screen, and whether it is folded or moved. */
const box = (page, id) => page.evaluate((w) => { const e = document.querySelector('[data-hs-hud="world"] [data-hs-widget="' + w + '"]');
  if (!e) return null; const r = e.getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height),
    folded: e.classList.contains('is-folded'), moved: e.classList.contains('is-moved') }; }, id);
const crosses = (a, b) => !!a && !!b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
/* a widget's box once layout has settled (two reads 100 ms apart agree, or 3 s): a drag aims from where it IS */
async function steadyBox(page, id) {
  let a = await box(page, id);
  for (const end = Date.now() + 3000; Date.now() < end;) {
    await page.waitForTimeout(100);
    const b = await box(page, id);
    if (a && b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height) return b;
    a = b;
  }
  return a;
}
/* a press on `sel`'s middle dragged by (dx, dy) in small steps, as a hand moves a mouse */
async function dragBy(page, sel, dx, dy) {
  const r = await page.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
  if (!r) return false;
  await page.mouse.move(r.x, r.y);
  await page.mouse.down();
  await page.mouse.move(r.x + dx / 2, r.y + dy / 2, { steps: 6 });
  await page.mouse.move(r.x + dx, r.y + dy, { steps: 6 });
  await page.mouse.up();
  return true;
}
/* the HUD layout puts the stub has seen since call `from`, once `want(layout)` holds for one of them (or 3 s) */
async function putsOf(s, from, want) {
  const got = () => s.calls.slice(from).filter((c) => c.name === 'hr_put_client_state' && c.body.p_patch && c.body.p_patch.hudLayout).map((c) => c.body.p_patch.hudLayout);
  for (const end = Date.now() + 3000; !got().some(want) && Date.now() < end;) await new Promise((ok) => setTimeout(ok, 50));
  return got();
}
/* until `fn(state)` holds for the widget boxes, or 4 s; the last state either way */
async function settle(page, fn) {
  let st;
  for (const end = Date.now() + 4000; ;) {
    st = { an: await box(page, 'analyzer'), tally: await box(page, 'tally') };
    if (fn(st) || Date.now() > end) return st;
    await page.waitForTimeout(80);
  }
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

/* TW-9 THE WORDS (Tyler 2026-10-24: "this is weird dialogue"; 2026-11-11: Tamsin in the first person, one line per state,
   src/data/text/tally.js): her first-visit line is her story, and no line a player reads from her (data, window, HUD,
   refusals, alerts, the log) keeps the riddles it replaced. */
const FIRST_LINE = 'I kept the mill\'s rats down myself for thirty years. Then they got a king, so now I pay people to do it. Take one off my board.';
const OLD_WORDS = /half of the stick|piece for your back|tally-keeper|picks for|her pick for you|tallies a day|you hold no tally|loads from the server|Tamsin has work/i;
const COPY_FILES = ['src/data/tally-tasks.js', 'src/data/text/tally.js', 'src/shell/windows/tally.js', 'src/session/tally-sections.js', 'src/shell/widgets/tally-hud.js',
  'src/data/refusal-words.js', 'src/data/alerts.js', 'src/shell/alerts.js', 'src/hunt-view/combat-log.js'];
/* TW-14: what she says and shows in one state, read off her window. */
const STATE = () => { const w = document.querySelector('[data-hs-win="tally"]'); const e = w.querySelector('.ht-entry');
  return { voice: w.querySelector('.ht-voice').textContent, day: w.querySelector('.ht-day-paid').textContent, full: w.querySelector('.ht-day').classList.contains('is-full'),
    entries: w.querySelectorAll('.ht-entry').length, rows: w.querySelectorAll('.ht-row').length, why: w.querySelector('.ht-board-why').classList.contains('is-on') ? w.querySelector('.ht-board-why span').textContent : '',
    first: e && { task: e.getAttribute('data-task'), cut: e.querySelectorAll('.ht-five i.is-cut').length, done: e.classList.contains('is-done'), get: e.querySelector('.ht-get').textContent, where: e.querySelector('.ht-where').textContent },
    takes: Array.from(w.querySelectorAll('.ht-take')).map((b) => b.disabled) }; };

async function checks(overrides, shots) {
  const fails = [];
  for (const f of COPY_FILES) {
    const src = overrides && overrides[f] !== undefined ? overrides[f] : await readFile(join(ROOT, f), 'utf8');
    /* the strings only: a comment may tell her lore (the split stick she notches) */
    const strings = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').match(/'(?:[^'\\\n]|\\.)*'/g) || [];
    const hit = strings.find((s) => OLD_WORDS.test(s));
    if (hit) fails.push('TW-9 ' + f + ' still says ' + hit);
  }
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const W = '[data-hs-win="tally"] ';
  const open = async (sections, answers, board) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    page.setDefaultNavigationTimeout(60000);   // a load on a busy machine is no rule of this test
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = { env: Object.assign(clone(BASE_ENV), sections), version: 1, calls: [], answers: answers || {}, board: board || clone(BOARD) };
    await stub(page, s);
    const up = await signInAndPlay(page, 'http://127.0.0.1:' + port);
    return { ctx, page, errors, s, up };
  };
  const show = async (page) => { await page.keyboard.press('q'); return wait(page, () => document.querySelector('[data-hs-win="tally"] .hw-tally'), null, 4000); };
  const sent = (s, n) => s.calls.filter((c) => c.name === n);
  const press = async (page, sel, rule) => { try { await page.click(sel, { timeout: 1500 }); return true; } catch { fails.push(rule + ' could not press ' + sel); return false; } };
  const tap = async (page, sel, rule) => { try { await page.tap(sel, { timeout: 1500 }); return true; } catch { fails.push(rule + ' could not tap ' + sel); return false; } };
  const txt = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); return e ? e.textContent : null; }, sel);
  const idle = (page) => wait(page, () => !document.querySelector('[data-hs-win="tally"] .hw-tally.is-pending'), null, 4000);
  const off = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); return !e || e.disabled; }, sel);
  try {
    { // TW-1, TW-2, TW-3, TW-6
      const { ctx, page, errors, s, up } = await open(clone(TOWN));
      const opened = up && await show(page);
      if (!opened) fails.push('TW-1 her window did not open from Q');
      else {
        /* the two held tasks leave her board: of the four rows she answered, the two not held are listed */
        await wait(page, () => document.querySelectorAll('[data-hs-win="tally"] .ht-row').length === 2, null, 4000);
        if (errors.length) fails.push('TW-1 console errors: ' + errors.join(' | ').slice(0, 300));
        const entries = await page.evaluate((cut) => [...document.querySelectorAll('[data-hs-win="tally"] .ht-entry')].map((li) => ({
          task: li.getAttribute('data-task'), name: li.querySelector('.ht-entry-top > b').textContent, count: li.querySelector('.ht-count b').textContent + ' ' + li.querySelector('.ht-count small').textContent,
          get: li.querySelector('.ht-get').textContent, done: li.classList.contains('is-done'), cut: li.querySelectorAll('.ht-five i.is-cut').length, icon: !!li.querySelector('.ht-pocket .hh-icon'),
          where: li.querySelector('.ht-where').textContent, go: li.querySelector('.ht-where .hs-goto')?.getAttribute('data-hs-goto') || null })));
        const wolves = entries[0], rats = entries[1];
        if (entries.length !== 2 || wolves.task !== 'thicket_gray_wolves' || wolves.name !== 'Gray Wolves' || wolves.count !== '112 / 200' || wolves.cut !== 5 || wolves.done
          || wolves.get !== 'You\'ll get 480 gp and an Apprentice Robe Top.' || !wolves.icon || wolves.where !== 'Meadowbrook Thicket' || wolves.go !== 'hunts|meadowbrook_thicket|') fails.push('TW-1 the wolves\' entry reads ' + JSON.stringify(wolves));
        if (!rats || rats.count !== '120 / 120' || rats.cut !== 10 || !rats.done || !/^Done\. I'll pay you now\. You'll get 100 gp and 4 Slime Gel\.$/.test(rats.get)) fails.push('TW-1 the done entry reads ' + JSON.stringify(rats));
        const head = await page.evaluate(() => ({ day: document.querySelector('[data-hs-win="tally"] .ht-day-paid').textContent, reset: document.querySelector('[data-hs-win="tally"] .ht-day-new').textContent,
          who: document.querySelector('[data-hs-win="tally"] .ht-who').textContent, mine: document.querySelector('[data-hs-win="tally"] .ht-mine-head small').textContent, voice: document.querySelector('[data-hs-win="tally"] .ht-voice').textContent }));
        if (head.who !== 'Tamsin Reeve' || head.day !== 'Paid today 1 of 3' || head.reset !== 'resets in 6 h' || head.mine !== '2 of 3') fails.push('TW-1 her line\'s head reads ' + JSON.stringify(head));
        if (head.voice !== 'That\'s all 120. Let me get your pay.') fails.push('TW-14 with a done task in town she says ' + JSON.stringify(head.voice));
        /* TW-9 no line on screen keeps the riddles (Tyler 2026-10-24: "this is weird dialogue") */
        const all = await page.evaluate(() => (document.querySelector('[data-hs-win="tally"]') || {}).textContent + ' ' + (document.querySelector('.hs-tally') || {}).textContent);
        if (OLD_WORDS.test(all)) fails.push('TW-9 her window still says "' + OLD_WORDS.exec(all)[0] + '"');
        const row = await page.evaluate(() => { const li = document.querySelector('[data-hs-win="tally"] .ht-row[data-task="glade_poachers"]'); return li && { name: li.querySelector('.ht-row-name b').textContent,
          go: li.querySelector('.ht-row-go .hs-goto')?.getAttribute('data-hs-goto'), ground: li.querySelector('.ht-row-go').textContent, lvl: li.querySelector('.ht-row-lvl').textContent,
          gold: li.querySelector('.ht-pay b').textContent, piece: li.querySelector('.ht-pay-name').textContent, once: li.querySelector('.ht-once').textContent, icon: !!li.querySelector('.ht-pocket .hh-icon'), take: li.querySelector('.ht-take').textContent }; });
        if (!row || row.name !== '60 Glade Poachers' || row.go !== 'hunts|mosslight_glade|' || row.ground !== 'Mosslight Glade' || row.lvl !== 'Level 16' || row.gold !== '920 gp' || row.piece !== 'Adept Hat' || !row.icon || row.take !== 'Take') fails.push('TW-1 the board row reads ' + JSON.stringify(row));
        /* TW-15 SHE GIVES IT ONCE (the mock lane 2026-11-11): the Adept Hat is on two rows, so both say so. sharedPieces read `pick.pick` while
           tally-intents.js hands it over as `pick.kind`, so the note never showed. */
        const once = await page.evaluate(() => [...document.querySelectorAll('[data-hs-win="tally"] .ht-row')].map((li) => li.getAttribute('data-task') + '|' + li.querySelector('.ht-once').textContent));
        if (once.join(';') !== 'glade_poachers|She gives it once, to the first of these she pays.;wickstead_turncoats|She gives it once, to the first of these she pays.') fails.push('TW-15 the once note reads ' + JSON.stringify(once));
        // TW-2: the visit hands the done task in, once
        await idle(page);
        const cl = sent(s, 'hr_tally_collect');
        if (cl.length !== 1 || Object.keys(cl[0].body).sort().join() !== 'p_idem,p_slot' || cl[0].body.p_slot !== 0) fails.push('TW-2 the visit sent ' + JSON.stringify(cl.map((c) => c.body)));
        if ((await txt(page, W + '.hh-intent-msg')) !== 'Tamsin paid you for 1 task.') fails.push('TW-2 after the visit the line reads ' + JSON.stringify(await txt(page, W + '.hh-intent-msg')));
        // TW-3: Take
        await press(page, W + '.ht-row[data-task="glade_poachers"] .ht-take', 'TW-3');
        await page.waitForTimeout(60);
        if (!(await off(page, W + '[data-hs-act="weight"]'))) fails.push('TW-3 a control stayed on while the take was in flight');
        await idle(page);
        const tk = sent(s, 'hr_tally_accept');
        if (tk.length !== 1 || tk[0].body.p_task !== 'glade_poachers' || tk[0].body.p_slot !== 0 || tk[0].body.p_weight !== null
          || Object.keys(tk[0].body).sort().join() !== 'p_idem,p_slot,p_task,p_weight') fails.push('TW-3 Take sent ' + JSON.stringify(tk.map((c) => c.body)));
        // TW-6: the HUD and the hunt list
        const hud = await page.evaluate(() => [...document.querySelectorAll('.hs-tally-row span:first-child')].map((e) => e.textContent));
        if (!hud.includes('Gray Wolves 112/200')) fails.push('TW-6 the HUD tally reads ' + JSON.stringify(hud));
        /* a done task says how it is paid, under its line (lane/b-first-hour: "· Done" never said to come home); one
           still counting says nothing more */
        const rowsSaid = await page.evaluate(() => [...document.querySelectorAll('.hs-tally-row')].map((li) => [li.querySelector('span').textContent, (li.querySelector('.hs-tally-wait') || {}).textContent || '']));
        const doneRow = rowsSaid.find(([l]) => / · Done$/.test(l));
        if (!doneRow || !/Tamsin|bag/.test(doneRow[1]) || /^Done/.test(doneRow[1])) fails.push('TW-6 the HUD\'s done task says how it is paid: ' + JSON.stringify(rowsSaid));
        if (rowsSaid.some(([l, w]) => !/ · Done$/.test(l) && w)) fails.push('TW-6 a task still counting has a pay line: ' + JSON.stringify(rowsSaid));
        await page.keyboard.press('h');
        await wait(page, () => document.querySelector('[data-hs-win="hunts"] .hw-hunt[data-hunt="meadowbrook_thicket"]'), null, 4000);
        const card = await txt(page, '[data-hs-win="hunts"] .hw-hunt[data-hunt="meadowbrook_thicket"] .hw-hunt-tally');
        if (card !== 'Gray Wolves 112/200') fails.push('TW-6 the Thicket\'s hunt line reads ' + JSON.stringify(card));
      }
      await ctx.close();
    }
    { // TW-4
      const { ctx, page, up } = await open(clone(TOWN), { hr_tally_accept: { ok: false, error: 'tally_full', held_max: 3 } });
      if (!(up && await show(page))) fails.push('TW-4 her window did not open');
      else {
        await wait(page, () => document.querySelectorAll('[data-hs-win="tally"] .ht-row').length === 2, null, 4000);
        await idle(page);
        await press(page, W + '.ht-row[data-task="glade_poachers"] .ht-take', 'TW-4');
        await idle(page);
        const line = await txt(page, W + '.hh-intent-msg');
        if (!/as many of her tasks as she gives at once/.test(line || '')) fails.push('TW-4 a refused take reads ' + JSON.stringify(line));
      }
      await ctx.close();
    }
    { // TW-5: hunting (the fixture's own hunt)
      const { ctx, page, s, up } = await open({ tally: clone(TALLY) }, null, Object.assign(clone(BOARD), { hunting: true }));
      if (!(up && await show(page))) fails.push('TW-5 her window did not open while hunting');
      else {
        await wait(page, () => document.querySelectorAll('[data-hs-win="tally"] .ht-row').length === 2, null, 4000);
        await page.waitForTimeout(500);
        if (!(await off(page, W + '.ht-row[data-task="glade_poachers"] .ht-take'))) fails.push('TW-5 Take is on while hunting');
        if (sent(s, 'hr_tally_collect').length) fails.push('TW-5 a done task was handed in mid-hunt');
        const hunting = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="tally"]'); const why = w.querySelector('.ht-board-why');
          return { why: why.classList.contains('is-on') ? why.querySelector('span').textContent : '', voice: w.querySelector('.ht-voice').textContent,
            done: w.querySelector('.ht-entry[data-task="cellar_giant_rats"] .ht-get').textContent, where: w.querySelector('.ht-entry[data-task="thicket_gray_wolves"] .ht-where').textContent }; });
        if (hunting.why !== 'You can take more when you\'re back in town.') fails.push('TW-5 hunting, her board reads ' + JSON.stringify(hunting.why));
        if (hunting.voice !== 'That\'s all 120. Come back to town and I\'ll pay you.') fails.push('TW-14 done while hunting she says ' + JSON.stringify(hunting.voice));
        if (!/^Done\. I'll pay you when you're back in town\. You'll get/.test(hunting.done)) fails.push('TW-5 the done entry reads ' + JSON.stringify(hunting.done));
        /* hunting the Cellar, the wolves' entry says its ground is not this one */
        if (hunting.where !== 'Meadowbrook Thicket · Not here') fails.push('TW-5 the wolves\' entry reads ' + JSON.stringify(hunting.where));
      }
      await ctx.close();
    }
    { // TW-8 (v0.2.37 run 40020854780): with three tasks held, hunting, the HUD's tally sits on no World panel
      const over = () => page8.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[data-hs-hud="world"] [data-hs-widget]')).map((e) => [e.getAttribute('data-hs-widget'), e.getBoundingClientRect()]);
        const out = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
          const [a, p] = els[i], [b, q] = els[j];
          if (p.width && q.width && p.left < q.right - 1 && p.right > q.left + 1 && p.top < q.bottom - 1 && p.bottom > q.top + 1) out.push(a + ' x ' + b);
        }
        return out;
      });
      const { ctx, page: page8, up } = await open({ tally: clone(TALLY3) });
      /* AT A LAPTOP'S 1366x768 the lines themselves show, under the analyzer: the panel's box alone said nothing (a 32 px head and no row) */
      const rowsSeen = () => page8.evaluate(() => { const l = document.querySelector('[data-hs-widget="tally"] .hs-tally-list'); if (!l) return null; const b = l.getBoundingClientRect(); return Array.from(l.querySelectorAll('.hs-tally-row')).filter((r) => { const q = r.getBoundingClientRect(); return q.height > 0 && q.top >= b.top - 1 && q.bottom <= b.bottom + 1; }).length; });
      const shown = up && await wait(page8, () => document.querySelectorAll('[data-hs-widget="tally"] .hs-tally-row').length === 3
        && !!document.querySelector('[data-hs-hud="world"] [data-hs-widget="analyzer"]'));
      if (!shown) fails.push('TW-8 the three held tallies and the analyzer never showed while hunting');
      else {
        await page8.setViewportSize({ width: 1366, height: 768 });
        await page8.waitForTimeout(600);
        const seen = await rowsSeen();
        if (seen !== 3) fails.push('TW-8 at 1366x768 the Tally shows ' + seen + ' of its 3 lines');
        for (const vp of [{ width: 1440, height: 900 }, { width: 1100, height: 800 }, { width: 1024, height: 700 }]) {
          await page8.setViewportSize(vp);
          await page8.waitForTimeout(500);
          let o = await over();
          for (const end = Date.now() + 3000; o.length && Date.now() < end; o = await over()) await page8.waitForTimeout(100);
          if (o.length) fails.push('TW-8 the HUD panels overlap at ' + vp.width + 'x' + vp.height + ': ' + o.join(', '));
        }
      }
      await ctx.close();
    }
    { // TW-8 on the phone (922x423, landscape): a player who shows the tally there (HUD layout) gets it under the hunt bar
      const phoneLayout = { client_state: { hudLayout: { phone: { tally: { visible: true } } } } };
      const ctx = await browser.newContext({ viewport: { width: 922, height: 423 }, hasTouch: true, isMobile: false });
      const page = await ctx.newPage();
      page.setDefaultTimeout(6000); page.setDefaultNavigationTimeout(60000);
      const s = { env: Object.assign(clone(BASE_ENV), { tally: clone(TALLY3) }, phoneLayout), version: 1, calls: [], answers: {}, board: clone(BOARD) };
      await stub(page, s);
      const up = await signInAndPlay(page, 'http://127.0.0.1:' + port);
      const shown = up && await wait(page, () => document.querySelectorAll('[data-hs-widget="tally"] .hs-tally-row').length === 3
        && !!document.querySelector('[data-hs-hud="world"] [data-hs-widget="hunt-topbar"]'));
      if (!shown) fails.push('TW-8 the phone never showed the tally the player asked for');
      else {
        await page.waitForTimeout(500);
        const o = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('[data-hs-hud="world"] [data-hs-widget]')).map((e) => [e.getAttribute('data-hs-widget'), e.getBoundingClientRect()]);
          const out = [];
          for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const [a, p] = els[i], [b, q] = els[j];
            if (p.width && q.width && p.left < q.right - 1 && p.right > q.left + 1 && p.top < q.bottom - 1 && p.bottom > q.top + 1) out.push(a + ' x ' + b);
          }
          const t = document.querySelector('[data-hs-widget="tally"]').getBoundingClientRect();
          if (t.bottom > innerHeight || t.right > innerWidth) out.push('tally off the screen');
          return out;
        });
        if (o.length) fails.push('TW-8 the phone HUD panels overlap: ' + o.join(', '));
      }
      await ctx.close();
    }
    { // TW-8: with nothing to show (no section) the tally takes NO room: its empty box sat on the analyzer and moved the camera
      const { ctx, page, up } = await open({});
      if (!up || !(await wait(page, () => !!document.querySelector('[data-hs-hud="world"] [data-hs-widget="analyzer"]')))) fails.push('TW-8 the hunt HUD did not mount without a tally');
      else {
        await page.waitForTimeout(400);
        const box = await page.evaluate(() => { const t = document.querySelector('[data-hs-widget="tally"]'); return t ? [t.offsetWidth, t.offsetHeight] : [0, 0]; });
        if (box[0] || box[1]) fails.push('TW-8 the tally holds a ' + box.join('x') + ' box with nothing to show');
      }
      await ctx.close();
    }
    { // TW-13 HER BOARD FIRST (newcomer panel 2026-11-01): the board stands over the weight picker. With no weight a first Take asks for the one that suits (blind panel 11-03: every Take grey
      // until a paragraph was read): the weight the hero wears most (the fixture's Leather Boots), said over the board with a press to the picker, sent as ONE accept naming it.
      const fresh = Object.assign(clone(TALLY), { held: [], recent: [], weight: null, paid_today: 0 });
      const { ctx, page, s, up } = await open(Object.assign(clone(TOWN), { tally: fresh }));
      if (!(up && await show(page))) fails.push('TW-13 her window did not open');
      else {
        await wait(page, () => document.querySelector('[data-hs-win="tally"] .ht-row'), null, 4000);
        const seen = await page.evaluate(() => {
          const w = document.querySelector('[data-hs-win="tally"]'), why = w.querySelector('.ht-board-why');
          return { first: !!(w.querySelector('.ht-list').compareDocumentPosition(w.querySelector('.ht-weights')) & Node.DOCUMENT_POSITION_FOLLOWING),
            why: why.classList.contains('is-on') ? why.querySelector('span').textContent : '', off: Array.from(w.querySelectorAll('[data-hs-act="take"]')).every((b) => b.disabled), toPicker: !w.querySelector('[data-hs-act="to-weight"]').hidden,
            voice: w.querySelector('.ht-voice').textContent, mine: w.querySelector('.ht-mine-head').getClientRects().length > 0, folded: w.querySelector('.ht-pick-open').hidden, pick: w.querySelector('.ht-pick-line').textContent };
        });
        if (!seen.first) fails.push('TW-13 the weight picker stands over her board');
        if (seen.off || seen.why !== 'Your first Take asks her for medium armor, the weight you wear most. Change it below any time.' || !seen.toPicker) fails.push('TW-13 with no weight her board reads ' + JSON.stringify(seen));
        /* TW-14 FIRST VISIT: her story, no Your tallies section, the picker folded to one line */
        if (seen.voice !== FIRST_LINE) fails.push('TW-14 on a first visit she says ' + JSON.stringify(seen.voice));
        if (seen.mine || !seen.folded || seen.pick !== 'Your first Take picks the armor weight for you, or pick it here.') fails.push('TW-14 a first visit shows ' + JSON.stringify({ mine: seen.mine, folded: seen.folded, pick: seen.pick }));
        if (seen.toPicker) { // no press to make when it is hidden: that is already a named fail above, never a page.click timeout that kills the run
          await page.click('[data-hs-win="tally"] [data-hs-act="to-weight"]');
          await page.waitForTimeout(200);
          const inView = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="tally"] .hs-win-body').getBoundingClientRect(), p = document.querySelector('[data-hs-win="tally"] .ht-weights').getBoundingClientRect(); return p.height > 0 && p.top >= w.top && p.bottom <= w.bottom; });
          if (!inView) fails.push('TW-13 Change did not open the picker and bring it into view');
        }
        if (sent(s, 'hr_tally_accept').length) fails.push('TW-13 a task was taken before a press');
        const task = await page.evaluate(() => document.querySelector('[data-hs-win="tally"] [data-hs-act="take"]:not([disabled])')?.getAttribute('data-task') || 'none open');
        await page.click('[data-hs-win="tally"] [data-hs-act="take"][data-task="' + task + '"]', { timeout: 3000 }).catch(() => fails.push('TW-13 the first Take is not pressable'));
        await page.waitForTimeout(200);
        const tk = sent(s, 'hr_tally_accept');
        if (tk.length !== 1 || tk[0].body.p_weight !== 'medium' || tk[0].body.p_task !== task) fails.push('TW-13 a first Take on ' + task + ' sent ' + JSON.stringify(tk.map((c) => c.body)));
      }
      await ctx.close();
    }
    { // TW-13 with nothing to go on (nothing worn, the server has not said the role): the old way stands, grey Takes and the line that says why; never a guess
      const fresh = Object.assign(clone(TALLY), { held: [], recent: [], weight: null, paid_today: 0 });
      const env = Object.assign(clone(TOWN), { tally: fresh, equipment: { weapon: 'iron_sword' } });
      const { ctx, page, s, up } = await open(env);
      if (!(up && await show(page))) fails.push('TW-13 her window did not open with nothing worn');
      else {
        await wait(page, () => document.querySelector('[data-hs-win="tally"] .ht-row'), null, 4000);
        const seen = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="tally"]'), why = w.querySelector('.ht-board-why');
          return { why: why.querySelector('span').textContent, off: Array.from(w.querySelectorAll('[data-hs-act="take"]')).every((b) => b.disabled), role: !!w }; });
        if (!seen.off || !/^Pick the armor weight she pays you in first/.test(seen.why)) fails.push('TW-13 with no worn weight and no role her board reads ' + JSON.stringify(seen));
      }
      await ctx.close();
    }
    { // TW-10 a new hero who has not met Tamsin (no weight asked, nothing held or paid): no Tally box in town; once met, her line
      const fresh = Object.assign(clone(TALLY), { held: [], recent: [], weight: null, paid_today: 0 });
      const { ctx, page, up } = await open(Object.assign(clone(TOWN), { tally: fresh }));
      const quiet =() => page.evaluate(() => { const w = document.querySelector('[data-hs-widget="tally"]'); return !w || w.classList.contains('is-quiet') || !w.getClientRects().length; });
      if (!up) fails.push('TW-10 the town did not mount');
      else {
        await page.waitForTimeout(500);
        if (!(await quiet())) fails.push('TW-10 a hero who never met Tamsin sees her Tally box beside the coach (board 2026-10-25 #13)');
      }
      await ctx.close();
      const met = await open(Object.assign(clone(TOWN), { tally: Object.assign(clone(fresh), { weight: 'light' }) }));
      if (met.up) {
        await met.page.waitForTimeout(500);
        const line = await met.page.evaluate(() => (document.querySelector('[data-hs-widget="tally"] .hs-tally-none') || {}).textContent || '');
        if (!/Tamsin has kill tasks/.test(line)) fails.push('TW-10 once met (a weight asked), the empty Tally box reads ' + JSON.stringify(line));
      }
      await met.ctx.close();
    }
    { // TW-11 move and fold, desktop (Tyler 2026-10-25)
      const { ctx, page, errors, s, up } = await open({ tally: clone(TALLY3) });
      const shown = up && await wait(page, () => document.querySelectorAll('[data-hs-widget="tally"] .hs-tally-row').length === 3
        && !!document.querySelector('[data-hs-hud="world"] [data-hs-widget="analyzer"] .ha-stats dd'));
      if (!shown) fails.push('TW-11 the analyzer and the three tallies never showed while hunting');
      else {
        const shot = async (name) => { if (shots) await page.screenshot({ path: join(shots, name + '.png') }); };
        const under = (st) => st.an && st.tally && st.tally.top >= st.an.bottom + 11 && !crosses(st.an, st.tally);
        let st = await settle(page, under);
        const before = st;
        if (!under(st)) fails.push('TW-11 CONTROL: the tally does not stack under the analyzer: ' + JSON.stringify(st));
        /* ...and on the screen, above the action bar (v0.2.46: the 170 px bar pushed it off under a full analyzer): the
           analyzer makes room for it (hud.js stackRoom) */
        const barTop = await page.evaluate(() => { const e = document.querySelector('[data-hs-hud="world"] [data-hs-widget="action-bar"]'); return e ? Math.round(e.getBoundingClientRect().top) : null; });
        st = await settle(page, (x) => under(x) && barTop !== null && x.tally.bottom <= barTop);
        if (!(barTop !== null && st.tally && st.tally.bottom <= barTop && st.tally.top >= 0)) fails.push('TW-11 the stacked tally is not on screen above the action bar (top ' + barTop + '): ' + JSON.stringify(st));
        await shot('desktop-1440x900-default');
        /* FOLD: the dash folds the analyzer to its title; the stacked tally rises under it; one press, one put at once */
        const putsAtFold = s.calls.length;
        await press(page, '[data-hs-widget="analyzer"] [data-hs-wfold]', 'TW-11');
        st = await settle(page, (x) => x.an && x.an.height < 80 && under(x) && x.tally.top < before.tally.top);
        if (!(st.an && st.an.folded && st.an.height < 80)) fails.push('TW-11 the analyzer did not fold to its title: ' + JSON.stringify(st.an));
        else if (!(under(st) && st.tally.top < before.tally.top)) fails.push('TW-11 the tally did not rise under the folded analyzer: ' + JSON.stringify(st));
        const label = await page.evaluate(() => { const b = document.querySelector('[data-hs-widget="analyzer"] [data-hs-wfold]'); return b && b.getAttribute('aria-expanded') + '|' + b.getAttribute('aria-label'); });
        if (label !== 'false|Show Hunt analyzer') fails.push('TW-11 the folded analyzer\'s button reads ' + JSON.stringify(label));
        await shot('desktop-1440x900-analyzer-folded');
        const foldPuts = await putsOf(s, putsAtFold, (l) => !!(l.desktop && l.desktop.analyzer && l.desktop.analyzer.folded === true));
        if (!foldPuts.some((l) => l.desktop && l.desktop.analyzer && l.desktop.analyzer.folded === true)) fails.push('TW-11 the fold was never put: ' + JSON.stringify(foldPuts));
        if (!(await backIn(page))) fails.push('TW-11 the hunt did not come back after a reload');
        st = await settle(page, (x) => x.an && x.an.folded && under(x));
        if (!(st.an && st.an.folded && st.an.height < 80)) fails.push('TW-11 a reload opened the folded analyzer again: ' + JSON.stringify(st.an));
        await press(page, '[data-hs-widget="analyzer"] [data-hs-wfold]', 'TW-11');
        st = await settle(page, (x) => x.an && !x.an.folded && x.an.height > 120 && under(x));
        if (!(st.an && !st.an.folded && st.an.height > 120)) fails.push('TW-11 the plus did not open the analyzer again: ' + JSON.stringify(st.an));
        /* MOVE: its title drags it to the bottom-left; the unmoved tally rises to its own top */
        const puts = s.calls.length;
        st.an = await steadyBox(page, 'analyzer');
        await dragBy(page, '[data-hs-widget="analyzer"] .hh-panel-title', 260 - st.an.left - st.an.width / 2, 860 - st.an.bottom - 40);
        st = await settle(page, (x) => x.an && x.an.moved && x.tally && x.tally.top < 120);
        const dropped = st.an;
        if (!(dropped && dropped.moved && dropped.left < 200 && dropped.bottom > 600 && dropped.bottom <= barTop)) fails.push('TW-11 the analyzer did not move to the bottom-left by its title: ' + JSON.stringify(dropped));
        else if (!(st.tally && st.tally.top < 120)) fails.push('TW-11 the unmoved tally still stacks where the analyzer was: ' + JSON.stringify(st.tally));
        const sent = await putsOf(s, puts, (l) => !!(l.desktop && l.desktop.analyzer && l.desktop.analyzer.anchor === 'bl'));
        if (sent.length !== 1 || !(sent[0].desktop && sent[0].desktop.analyzer && sent[0].desktop.analyzer.anchor === 'bl')) fails.push('TW-11 the drop was not put once, bottom-left: ' + JSON.stringify(sent));
        await shot('desktop-1440x900-analyzer-moved');
        if (!(await backIn(page))) fails.push('TW-11 the hunt did not come back after the second reload');
        st = await settle(page, (x) => x.an && x.an.moved);
        if (!(st.an && dropped && Math.abs(st.an.left - dropped.left) <= 1 && Math.abs(st.an.bottom - dropped.bottom) <= 1)) fails.push('TW-11 a reload did not put the moved analyzer back where it was dropped: ' + JSON.stringify([dropped, st.an]));
        await page.setViewportSize({ width: 1024, height: 700 });
        st = await settle(page, (x) => x.an && x.an.bottom <= 700 && x.an.top >= 0);
        if (!(st.an && st.an.left === (dropped && dropped.left) && st.an.top >= 0 && st.an.bottom <= 700 && st.an.right <= 1024)) fails.push('TW-11 at 1024x700 the moved analyzer left its corner or the screen: ' + JSON.stringify(st.an));
        await page.setViewportSize({ width: 1440, height: 900 });
        st = await settle(page, (x) => x.an && x.an.bottom > 600);
        /* The Tally drags by its title without opening her window, and sits where it was dropped */
        const t0 = await steadyBox(page, 'tally');
        await dragBy(page, '[data-hs-widget="tally"] .hs-tally-open', 1100 - t0.left, 150 - t0.top);   // clear of the right edge's clamp at any font's width (" · Not here" reads 259 px on Linux)
        st = await settle(page, (x) => x.tally && x.tally.moved);
        const tallyAt = st.tally;
        if (!(tallyAt && tallyAt.moved && Math.abs(tallyAt.left - 1100) <= 2 && Math.abs(tallyAt.top - 150) <= 2)) fails.push('TW-11 the tally did not move where its title was dropped: ' + JSON.stringify(tallyAt));
        await page.waitForTimeout(300);
        if (await page.$('[data-hs-win="tally"]')) fails.push('TW-11 dragging the tally by its title opened her window');
        /* Put back (HUD layout) returns the analyzer to the top-right, across the moved tally's column: the tally, moved,
           stacks under nothing and keeps the place it was dropped on */
        await page.keyboard.press('u');
        await wait(page, () => document.querySelector('[data-hs-win="hud"] [data-hs-act="put-back"][data-wid="analyzer"]'), null, 3000);
        await press(page, '[data-hs-win="hud"] [data-hs-act="put-back"][data-wid="analyzer"]', 'TW-11');
        if (!(await wait(page, () => !document.querySelector('[data-hs-win="hud"] [data-hs-act="put-back"][data-wid="analyzer"]'), null, 3000))) fails.push('TW-11 the HUD layout still offers Put back for the analyzer');
        await shot('desktop-1440x900-hud-layout');
        await page.keyboard.press('Escape');
        await wait(page, () => !document.querySelector('[data-hs-win="hud"]'), null, 3000);
        st = await settle(page, (x) => x.an && !x.an.moved && x.an.top < 120 && x.an.right > 1300);
        if (!(st.an && !st.an.moved && st.an.right > 1300 && st.an.top < 120)) fails.push('TW-11 Put back did not return the analyzer to the top-right: ' + JSON.stringify(st.an));
        if (!(st.tally && tallyAt && st.tally.left === tallyAt.left && st.tally.top === tallyAt.top)) fails.push('TW-11 the moved tally was stacked under the analyzer: ' + JSON.stringify([tallyAt, st.tally]));
        /* moved again, under the Party panel on the left, it folds to its title like the analyzer */
        const party = await page.evaluate(() => { const e = document.querySelector('[data-hs-hud="world"] [data-hs-widget="party"]'); const r = e ? e.getBoundingClientRect() : { left: 21, bottom: 351 }; return { left: Math.round(r.left), bottom: Math.round(r.bottom) }; });
        st.tally = await steadyBox(page, 'tally');
        await dragBy(page, '[data-hs-widget="tally"] .hs-tally-open', party.left - st.tally.left, party.bottom + 12 - st.tally.top);
        st = await settle(page, (x) => x.tally && x.tally.left === party.left);
        if (!(st.tally && st.tally.left === party.left && st.tally.top >= party.bottom)) fails.push('TW-11 the tally did not move under the Party panel: ' + JSON.stringify([party, st.tally]));
        await shot('desktop-1440x900-tally-moved');
        await press(page, '[data-hs-widget="tally"] [data-hs-wfold]', 'TW-11');
        st = await settle(page, (x) => x.tally && x.tally.folded && x.tally.height < 60);
        if (!(st.tally && st.tally.folded && st.tally.height < 60 && st.tally.left === party.left)) fails.push('TW-11 the moved tally did not fold to its title in place: ' + JSON.stringify(st.tally));
        await shot('desktop-1440x900-tally-folded');
        await press(page, '[data-hs-widget="tally"] [data-hs-wfold]', 'TW-11');
        await settle(page, (x) => x.tally && !x.tally.folded);
        await press(page, '[data-hs-widget="tally"] .hs-tally-open', 'TW-11');
        if (!(await wait(page, () => document.querySelector('[data-hs-win="tally"]'), null, 3000))) fails.push('TW-11 a plain press on the moved tally\'s title did not open her window');
        if (errors.length) fails.push('TW-11 console errors: ' + errors.join(' | ').slice(0, 300));
      }
      await ctx.close();
    }
    for (const vp of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) { // TW-11 on the phone: the analyzer shown (HUD layout) folds, a reload keeps it, nothing drags
      const tag = vp.width + 'x' + vp.height;
      const phoneLayout = { client_state: { hudLayout: { phone: { analyzer: { visible: true } } } } };
      const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: false });
      const page = await ctx.newPage();
      page.setDefaultTimeout(6000); page.setDefaultNavigationTimeout(60000);
      const s = { env: Object.assign(clone(HUNT_ENV), phoneLayout), version: 1, calls: [], answers: {}, board: clone(BOARD) };
      await stub(page, s);
      const ready = () => !!document.querySelector('[data-hs-hud="world"] [data-hs-widget="analyzer"] .ha-tab');
      const up = await signInAndPlay(page, 'http://127.0.0.1:' + port);
      if (!(up && await wait(page, ready))) fails.push('TW-11 [' + tag + '] the phone never showed the analyzer the player asked for');
      else {
        let st = await settle(page, (x) => x.an && x.an.bottom <= vp.height);
        if (!(st.an && st.an.bottom <= vp.height)) fails.push('TW-11 [' + tag + '] CONTROL: the open analyzer is not on screen: ' + JSON.stringify(st.an));
        if (shots) await page.screenshot({ path: join(shots, 'phone-' + tag + '-analyzer-open.png') });
        const putsAtFold = s.calls.length;
        await tap(page, '[data-hs-widget="analyzer"] [data-hs-wfold]', 'TW-11 [' + tag + ']');
        st = await settle(page, (x) => x.an && x.an.folded && x.an.height <= 60);
        if (!(st.an && st.an.folded && st.an.height <= 60)) fails.push('TW-11 [' + tag + '] the phone analyzer did not fold to one row: ' + JSON.stringify(st.an));
        const title = await page.evaluate(() => { const t = document.querySelector('[data-hs-widget="analyzer"] .hh-panel-title'); return t && t.getClientRects().length ? t.textContent : null; });
        if (title !== 'Hunt analyzer') fails.push('TW-11 [' + tag + '] the folded phone analyzer does not say what it is: ' + JSON.stringify(title));
        const fold = await page.evaluate(() => { const e = document.querySelector('[data-hs-widget="analyzer"] [data-hs-wfold]'); const b = e ? e.getBoundingClientRect() : { width: 0, height: 0 }; return [Math.round(b.width), Math.round(b.height)]; });
        if (fold[0] < 40 || fold[1] < 40) fails.push('TW-11 [' + tag + '] the phone fold is not thumb-sized: ' + fold.join('x'));
        if (shots) await page.screenshot({ path: join(shots, 'phone-' + tag + '-analyzer-folded.png') });
        const foldPuts = await putsOf(s, putsAtFold, (l) => !!(l.phone && l.phone.analyzer && l.phone.analyzer.folded === true));
        if (!foldPuts.some((l) => l.phone && l.phone.analyzer && l.phone.analyzer.folded === true && l.phone.analyzer.visible === true)) fails.push('TW-11 [' + tag + '] the phone fold was never put: ' + JSON.stringify(foldPuts));
        if (!(await backIn(page, ready))) fails.push('TW-11 [' + tag + '] the phone hunt did not come back after a reload');
        st = await settle(page, (x) => x.an && x.an.folded);
        if (!(st.an && st.an.folded)) fails.push('TW-11 [' + tag + '] a phone reload opened the folded analyzer again');
        const a0 = await steadyBox(page, 'analyzer');
        await dragBy(page, '[data-hs-widget="analyzer"] .hh-panel-title', -300, 120);
        await page.waitForTimeout(400);
        const a1 = await box(page, 'analyzer');
        if (!a0 || !a1 || a1.moved || Math.abs(a1.left - a0.left) > 1 || Math.abs(a1.top - a0.top) > 1) fails.push('TW-11 [' + tag + '] the phone dragged the analyzer: ' + JSON.stringify([a0, a1]));
        await tap(page, '[data-hs-widget="analyzer"] [data-hs-wfold]', 'TW-11 [' + tag + ']');
        st = await settle(page, (x) => x.an && !x.an.folded && x.an.height > 100);
        if (!(st.an && !st.an.folded)) fails.push('TW-11 [' + tag + '] the plus did not open the phone analyzer');
      }
      await ctx.close();
    }
    { // TW-14 HER LINE PER STATE (mocks 2026-11-11, Tyler: "plain / confusing / boring"): just taken, counting while hunting, just paid, the day's pay used up
      const held = (kills, target, task, hunt, monster, done = false) => ({ place: 1, task, hunt, monster, kills, target, keep: false, done, done_at: done ? '2025-10-17T11:00:00.000Z' : null, wait: null });
      const wolves = (kills, done) => held(kills, 200, 'thicket_gray_wolves', 'meadowbrook_thicket', 'gray_wolf', done);
      const boardHeld = (...tasks) => Object.assign(clone(BOARD), { board: BOARD.board.map((r) => Object.assign({}, r, { held: tasks.includes(r.task) })) });
      const cases = [
        ['taken', clone(TOWN), { held: [wolves(0)], paid_today: 0 }, boardHeld('thicket_gray_wolves'), (st) => st.voice === '200 Gray Wolves in Meadowbrook Thicket. Every kill counts, even while you\'re away, so off you go.'
          && st.entries === 1 && st.first.cut === 0 && st.rows === 3 && st.takes.every((d) => !d) && st.why === ''],
        ['hunting', { tally: null }, { held: [wolves(112)], paid_today: 0 }, Object.assign(boardHeld('thicket_gray_wolves'), { hunting: true }), (st) => st.voice === '112 down, 88 to go. Every one counts, even while you\'re away.'
          && st.first.cut === 5 && st.first.where === 'Meadowbrook Thicket · Not here' && st.why === 'You can take more when you\'re back in town.' && st.takes.every((d) => d)],
        /* hunting the Cellar with the rats held: the entry says it counts here */
        ['here', { tally: null }, { held: [held(9, 25, 'cellar_giant_rats', 'mill_cellar', 'rat')], paid_today: 0 }, Object.assign(boardHeld('cellar_giant_rats'), { hunting: true }),
          (st) => st.voice === '9 down, 16 to go. Every one counts, even while you\'re away.' && st.first.cut === 3 && st.first.where === 'Counting here in Mill Cellar.'],
        ['paid', clone(TOWN), { held: [], paid_today: 1, recent: [{ claim: 'c9', at: '2025-10-17T11:40:00.000Z', task: 'cellar_giant_rats', gold: 100, item: 'slime_gel', qty: 4, pick: 'material' }] }, boardHeld(),
          (st) => st.voice === 'There you go, 100 gold and 4 Slime Gel. Want another?' && st.entries === 0 && st.rows === 4],
        /* a pay from an older day is not "just paid": her board line */
        ['none', clone(TOWN), { held: [], paid_today: 0, recent: [{ claim: 'c8', at: '2025-10-16T11:40:00.000Z', task: 'cellar_giant_rats', gold: 100, item: 'slime_gel', qty: 4, pick: 'material' }] }, boardHeld(),
          (st) => st.voice === 'Board\'s full of work. Take one and go hunt, and I\'ll pay you when you\'re back.' && st.rows === 4],
        ['capped', clone(TOWN), { held: [held(50, 50, 'wickstead_turncoats', 'wickstead', 'turncoat', true), wolves(140)], paid_today: 3 }, boardHeld('wickstead_turncoats', 'thicket_gray_wolves'),
          (st) => st.voice === 'That\'s three today, and three\'s all I pay for. Bring the Turncoats back tomorrow.' && st.day === 'Paid today 3 of 3' && st.full && st.first.done
            && st.first.get === 'Done. I\'ll pay you for this one tomorrow. You\'ll get 780 gp and an Adept Hat.' && st.first.cut === 10],
      ];
      for (const [name, env, tally, board, want] of cases) {
        const { ctx, page, s, up } = await open(Object.assign(env, { tally: Object.assign(clone(TALLY), tally) }), null, board);
        if (!(up && await show(page))) { fails.push('TW-14 [' + name + '] her window did not open'); await ctx.close(); continue; }
        await wait(page, () => document.querySelector('[data-hs-win="tally"] .ht-row'), null, 4000);
        await page.waitForTimeout(300);
        const st = await page.evaluate(STATE);
        if (!want(st)) fails.push('TW-14 [' + name + '] her window reads ' + JSON.stringify(st));
        if (name === 'capped' && sent(s, 'hr_tally_collect').length) fails.push('TW-14 [capped] a done task was handed in over the day\'s cap');
        await ctx.close();
      }
    }
    { // TW-14 HER PICK behind Change: the weights, the chosen weight's sentence, her slot order as chips; a chip sends ONE hr_tally_set with that slot first
      const { ctx, page, s, up } = await open(clone(TOWN));
      if (!(up && await show(page))) fails.push('TW-14 [pick] her window did not open');
      else {
        await wait(page, () => document.querySelector('[data-hs-win="tally"] .ht-row'), null, 4000);
        await idle(page);
        const line = await txt(page, W + '.ht-pick-line');
        if (line !== 'She pays you in light armor, head first, then body and legs.') fails.push('TW-14 [pick] her pick line reads ' + JSON.stringify(line));
        await press(page, W + '[data-hs-act="pick-toggle"]', 'TW-14 [pick]');
        await page.waitForTimeout(100);
        const open = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="tally"]');
          return { shown: !w.querySelector('.ht-pick-open').hidden, toggle: w.querySelector('[data-hs-act="pick-toggle"]').textContent, on: w.querySelector('.ht-weights [aria-pressed="true"]')?.getAttribute('data-weight'),
            words: w.querySelector('.ht-weight-words').textContent, chips: Array.from(w.querySelectorAll('.ht-slots button')).map((b) => b.textContent + (b.disabled ? '*' : '')) }; });
        if (!open.shown || open.toggle !== 'Close' || open.on !== 'light' || !/^Light armor /.test(open.words) || open.chips.join(',') !== '1Head*,2Body,3Legs,4Feet,5Hands,6Waist') fails.push('TW-14 [pick] Change opened ' + JSON.stringify(open));
        await press(page, W + '.ht-slots [data-slot-name="pants"]', 'TW-14 [pick]');
        await idle(page);
        const set = sent(s, 'hr_tally_set');
        if (set.length !== 1 || JSON.stringify(set[0].body.p_order) !== JSON.stringify(['pants', 'helmet', 'body', 'boots', 'gloves', 'belt']) || set[0].body.p_weight !== null || set[0].body.p_task !== null) fails.push('TW-14 [pick] the chip sent ' + JSON.stringify(set.map((c) => c.body)));
        /* TW-16 TAKE ME THERE: the ground on an entry is a link that opens the Hunts window on that ground */
        await press(page, W + '.ht-entry[data-task="thicket_gray_wolves"] .ht-where .hs-goto', 'TW-16');
        const picked = await wait(page, () => document.querySelector('[data-hs-win="hunts"] .hw-hunt[data-hunt="meadowbrook_thicket"].is-picked'), null, 4000);
        if (!picked) fails.push('TW-16 the ground link did not open the Hunts window on Meadowbrook Thicket');
      }
      await ctx.close();
    }
    { // TW-15 the pure half of the once note: her answer's rows carry pick.kind (tally-intents.js boardRow), and sharedPieces reads that
      const { sharedPieces, cutMarks, resetWords, keeperSay } = await import(pathToFileURL(join(ROOT, 'src/shell/windows/tally.js')).href);
      const both = sharedPieces([{ pick: { kind: 'piece', item: 'adept_helmet', qty: 1 } }, { pick: { kind: 'piece', item: 'adept_helmet', qty: 1 } }, { pick: { kind: 'material', item: 'slime_gel', qty: 4 } }, { pick: { kind: 'material', item: 'slime_gel', qty: 4 } }]);
      if (both.size !== 1 || !both.has('adept_helmet')) fails.push('TW-15 sharedPieces over kind rows gives ' + JSON.stringify([...both]));
      if ([cutMarks(112, 200, false), cutMarks(0, 25, false), cutMarks(24, 25, false), cutMarks(24, 25, true), cutMarks(9, 25, false)].join() !== '5,0,9,10,3') fails.push('TW-15 the marks cut ' + [cutMarks(112, 200, false), cutMarks(24, 25, false), cutMarks(24, 25, true)].join());
      const now = Date.parse('2026-10-17T12:00:00Z');
      if ([resetWords('2026-10-17T18:00:00Z', now), resetWords('2026-10-17T12:20:00Z', now), resetWords('2026-10-17T11:00:00Z', now), resetWords(null, now)].join('|') !== '6 h|20 m||') fails.push('TW-15 the reset reads ' + resetWords('2026-10-17T12:20:00Z', now));
      if (keeperSay(null, false, false) !== '') fails.push('TW-15 with no tally she speaks');
    }
    { // TW-7
      const { ctx, page, s, up } = await open({ hunt: null }, null, { ok: true, hunting: false, tally: null, board: BOARD.board });
      if (!(up && await show(page))) fails.push('TW-7 her window did not open without the section');
      else {
        await page.waitForTimeout(600);
        if (await page.evaluate(() => document.querySelectorAll('[data-hs-win="tally"] .ht-entry').length) !== 0) fails.push('TW-7 tallies were invented');
        if (!(await off(page, W + '.ht-row[data-task="glade_poachers"] .ht-take'))) fails.push('TW-7 Take is on with no tally from the server');
        if (!(await off(page, W + '[data-hs-act="weight"]'))) fails.push('TW-7 a weight can be chosen with no tally from the server');
        if (await txt(page, W + '.ht-voice')) fails.push('TW-7 she speaks with no tally from the server: ' + JSON.stringify(await txt(page, W + '.ht-voice')));
        const today = await txt(page, W + '.ht-day-paid');
        if (today) fails.push('TW-7 the day\'s count reads ' + JSON.stringify(today) + ' with no tally from the server');
        if (sent(s, 'hr_tally_collect').length) fails.push('TW-7 a visit was sent with no tally from the server');
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  ['Take stays on while hunting', 'src/shell/windows/tally.js', "prop(btn, 'disabled', r.held || full || st.sc.pending || st.hunting || !tally || (!tally.weight && !st.suggest));", "prop(btn, 'disabled', r.held || full || st.sc.pending || !tally || !tally.weight);"],
  ['a done task is handed in mid-hunt', 'src/shell/windows/tally.js', "const due = tally && !hunting && tally.paidToday < tally.perDay", 'const due = tally && tally.paidToday < tally.perDay'],
  /* TW-14, TW-15, TW-16: her ledger (mocks 2026-11-11) */
  ['her line counts one kill more than the server', 'src/shell/windows/tally.js', "{ down: whole(open.kills), left: whole(open.target - open.kills) }", "{ down: whole(open.kills + 1), left: whole(open.target - open.kills - 1) }"],
  ['her line is the same in every state', 'src/shell/windows/tally.js', "  const capped = tally.paidToday >= tally.perDay;\n  const done = tally.held.find((h) => h.done);", "  return t('tally.say_none');\n  const capped = tally.paidToday >= tally.perDay;\n  const done = tally.held.find((h) => h.done);"],
  ['a pay from yesterday reads as just paid', 'src/shell/windows/tally.js', "const justPaid = sc.paidNow || !!(paid && paid.at && nowMs - Date.parse(paid.at) < PAID_FRESH_MS);", "const justPaid = sc.paidNow || !!paid;"],
  ['the marks cut a stroke ahead of the count', 'src/shell/windows/tally.js', "Math.floor((kills / target) * MARKS)", "Math.ceil((kills / target) * MARKS)"],
  ['sharedPieces reads pick.pick again (the 11-11 bug)', 'src/shell/windows/tally.js', "if (!r.pick || r.pick.kind !== 'piece') continue;", "if (!r.pick || r.pick.pick !== 'piece') continue;"],
  ['the once note never shows on her board', 'src/shell/windows/tally.js', "  text(li.querySelector('.ht-once'), onceWords(r, st));", "  text(li.querySelector('.ht-once'), '');"],
  ['the ground link goes nowhere', 'src/shell/windows/tally.js', "const groundLink = (hunt) => ({ words: huntName(hunt), target: targetOf({ kind: 'hunt', hunt }) });", "const groundLink = (hunt) => ({ words: huntName(hunt), target: null });"],
  ['a slot chip sends the old order', 'src/shell/windows/tally.js', "    order.splice(i, 1);\n    order.unshift(s);", "    order.splice(i, 1);\n    order.push(s);"],
  ['the day count hides its reset', 'src/shell/windows/tally.js', "text(root.querySelector('.ht-day-new'), left ? t('tally.day_resets', { left }) : '');", "text(root.querySelector('.ht-day-new'), '');"],
  ['held tasks stay on her board', 'src/shell/windows/tally.js', "rows(root.querySelector('.ht-list'), board.filter((r) => !r.held),", "rows(root.querySelector('.ht-list'), board,"],
  ['a done entry is not lifted', 'src/shell/windows/tally.js', "  cls(li, 'is-done', h.done);", "  cls(li, 'is-done', false);"],
  ['an entry says its ground counts here while hunting elsewhere', 'src/shell/windows/tally.js', "const here = st.hunting && st.huntId === h.hunt;", "const here = st.hunting;"],
  ['the visit is sent on every repaint', 'src/shell/windows/tally.js', '  if (due.length && sc.collected !== key && !sc.pending && ctx.account) {', '  if (due.length && !sc.pending && ctx.account) {'],
  ['the reader invents a tally', 'src/session/tally-sections.js', "  if (!isObj(raw)) return null;\n  const had", "  if (!isObj(raw)) raw = { held: [], paid_today: 0, per_day: 3, held_max: 3, order: [] };\n  const had"],
  ['take carries a count', 'src/session/tally-intents.js', "{ p_slot: cs.slot, p_task: task, p_weight: weight == null ? null : weight, p_idem: newIdem() }", "{ p_slot: cs.slot, p_task: task, p_weight: weight == null ? null : weight, p_count: 1, p_idem: newIdem() }"],
  ['the HUD shows one more kill than the server', 'src/session/tally-sections.js', "return label + ' ' + h.kills + '/' + h.target;", "return label + ' ' + (h.kills + 1) + '/' + h.target;"],
  ['a refusal reads as a generic line', 'src/shell/windows/tally.js', "  const run = (send, busy, done) => runIntent(sc, repaint, send, busy, (r) => { sc.stale = true; return done(r); }, cs);", "  const run = (send, busy, done) => runIntent(sc, repaint, async () => { const r = await send(); if (!r.ok) r.error = 'refused'; return r; }, busy, (r) => { sc.stale = true; return done(r); }, cs);"],
  ['the hunt list drops the tally line', 'src/shell/windows/hunts.js', "text(li.querySelector('.hw-hunt-tally'), heldOn(tally, r.hunt).map(tallyLine).join(' · '));", "text(li.querySelector('.hw-hunt-tally'), '');"],
  ['the Tally is held at its capped height', 'src/shell/hud-room.js', 'phone ? rel(el) : Object.assign(rel(el), { height: wholeHeight(el) })', 'rel(el)'],
  ['her board says nothing of a missing weight', 'src/shell/windows/tally.js', "const why = !sc.board ? '' : hunting ? t('tally.board_hunting') : takeWhyOf(tally, hunting, suggest);", "const why = !sc.board ? '' : hunting ? t('tally.board_hunting') : '';"],
  ['every Take stays grey until a weight is picked', 'src/shell/windows/tally.js', "st.hunting || !tally || (!tally.weight && !st.suggest));", "st.hunting || !tally || !tally.weight);"],
  ['a first Take names no weight', 'src/shell/windows/tally.js', "takeTask(ctx.account, cs, task, first ? first.weight : null)", "takeTask(ctx.account, cs, task, null)"],
  ['a first Take guesses with nothing to go on', 'src/shell/windows/tally.js', "const weight = wears || WEIGHT_FOR_ROLE[role] || null;", "const weight = wears || WEIGHT_FOR_ROLE[role] || 'heavy';"],
  ['the weight picker stands over her board again', 'src/shell/windows/tally.js', "    + '<h3 class=\"hw-ledger-head is-on ht-head ht-board-head\"><span></span></h3>'", "    + '<div class=\"ht-weights\"></div><h3 class=\"hw-ledger-head is-on ht-head ht-board-head\"><span></span></h3>'"],
  ['the tally sits at its anchor, over the analyzer', 'src/shell/shell.js', '      const top = stackBelow(at, above, DOCK_EDGE);', '      const top = Math.round(at.top);'],
  ['her first line is the riddle again', 'src/data/text/tally.js', "say_first: 'I kept the mill\\'s rats down myself for thirty years. Then they got a king, so now I pay people to do it. Take one off my board.',",
    "say_first: 'Bring me your half of the stick when the count is done, and I pay. Coin, and a piece for your back.',"],
  ['a tally with nothing to show keeps its box', 'src/shell/widgets/tally-hud.js', "  cls(el, 'is-quiet', !tl || (!held.length && (hunting || !met)));", "  cls(el.querySelector('.hs-tally'), 'is-quiet', !tl || (!held.length && (hunting || !met)));"],
  ['a new hero\'s first screen carries Tamsin\'s line beside the coach', 'src/shell/widgets/tally-hud.js', '  const met = !!tl && (!!tl.weight || tl.recent.length > 0);', '  const met = !!tl;'],
  /* TW-11: move and fold (Tyler 2026-10-25) */
  ['a folded analyzer keeps its full minimum height', 'src/shell/shell.js', "      el.style.minHeight = L.folded ? '' : row.min[1] + 'px';", "      el.style.minHeight = row.min[1] + 'px';"],
  ['the fold press does nothing', 'src/shell/widget-move.js', '    hud.setFolded(id, !hud.layoutOf(id).folded);', ''],
  ['a moved tally still stacks under the analyzer', 'src/shell/shell.js', '      if (!row.below || hud.isMoved(row.id)) continue;', '      if (!row.below) continue;'],
  ['the drop is never kept', 'src/shell/widget-move.js', '      hud.setPlace(id, hud.layoutOf(id), true);', '      hud.setPlace(id, hud.layoutOf(id), false);'],
  ['dragging the tally opens her window', 'src/shell/widget-move.js', '    if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); return; }', ''],
  ['the phone drags a widget', 'src/shell/widget-move.js', "    if (e.button !== 0 || o.isPhone()) return;", "    if (e.button !== 0) return;"],
  ['the analyzer makes no room for the tally above the bar', 'src/shell/hud-room.js', 'take(a, r === null && crosses ? DOCK_CAP_MIN_PX : r);', ''],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'tally-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'tally-window: ' + fails.length + ' rule(s) RED'
      : 'tally-window: opens on Q; the server\'s tallies and her board; a due tally handed in once in town; Take sends ids only, controls off in flight; refusals in words; nothing taken or handed in mid-hunt; HUD and hunt list read the server; fails safe; the analyzer and the tally move and fold; her line per state, the marks, the once note, the ground link, a chip puts a slot first');
    process.exit(fails.length ? 1 : 0);
  }
  /* A gated push proves only the mutants its diff touches (tools/lib/mutant-scope.mjs); the nightly proves them all. */
  const MINE = scopedMutants('tests/tally-window.mjs', MUTANTS);
  if (!MINE.length) process.exit(0);
  const clean = await checks(null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  let bad = 0;
  const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
  const list = MINE.filter((m) => !pick || m[0].includes(pick));
  for (const [name, file, from, to] of list) {
    const text = (await readFile(join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
    const fails = await checks({ [file]: text.replace(from, () => to) });
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'tally-window --mutate: ' + bad + ' escaped' : 'tally-window --mutate: ' + list.length + '/' + list.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
