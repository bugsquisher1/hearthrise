#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/tally-window.mjs — TAMSIN'S TALLY ON SCREEN, IN A REAL CHROMIUM (lane c-tally-tasks).
//
//   node tests/tally-window.mjs            the rules
//   node tests/tally-window.mjs --mutate   every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/windows/tally.js src/session/tally-sections.js src/session/tally-intents.js src/shell/windows/hunts.js src/shell/shell.js src/shell/widgets/tally-hud.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs);
// the character is tests/fixtures/alpha-envelope.json plus a `tally` section
// (2026-12-23-tally-tasks.sql): Gray Wolves 112/200 held, Giant Rats done (120/120),
// light armour, 1 paid today of 3. Her board is hr_tally_view's answer.
//   TW-1  Q opens her window with zero console errors; it draws the SERVER's tallies
//         ("Gray Wolves 112/200", the done one saying how she pays) and her board
//   TW-2  IN TOWN a done task due today is handed in by ONE hr_tally_collect naming
//         only the slot and a key, then the character is re-read
//   TW-3  Take sends ONE hr_tally_accept with catalogue ids only (no count, no price)
//         and every control is off until the server answers
//   TW-4  a refusal reads in plain words (tally_full)
//   TW-5  WHILE HUNTING her board says it is on the Common, Take is off and nothing
//         is handed in (the settle that brings the hero home pays)
//   TW-6  the HUD's tally and the hunt list read the server's count ("Gray Wolves 112/200")
//   TW-7  FAIL SAFE: with no tally section nothing is drawn and nothing can be taken
//   TW-8  THE HUD'S PLACE (v0.2.37 run 40020854780): hunting with three tasks held, the tally
//         overlaps no World panel at 1440x900, 1100x800 or 1024x700 (it stacks under the
//         analyzer), nor on the phone (922x423) when the player shows it there (under the
//         hunt bar); with nothing to show it takes no room (its empty box sat on the analyzer
//         and pushed the town camera off the hero, window-camera WC-3)
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const ORDER = ['helmet', 'body', 'pants', 'boots', 'gloves', 'belt'];
const TALLY = {
  held: [
    { place: 1, task: 'thicket_gray_wolves', hunt: 'meadowbrook_thicket', monster: 'gray_wolf', kills: 112, target: 200, keep: false, done: false, done_at: null, wait: null },
    { place: 2, task: 'cellar_giant_rats', hunt: 'mill_cellar', monster: 'rat', kills: 120, target: 120, keep: true, done: true, done_at: '2026-10-23T10:00:00.000Z', wait: null }],
  paid_today: 1, per_day: 3, held_max: 3, weight: 'light', order: ORDER, recent: [], day_ends_at: '2026-10-24T00:00:00.000Z',
};
/* TW-8: her three tasks held at once (held_max), so the HUD's tally is as tall as it gets. */
const TALLY3 = Object.assign(clone(TALLY), { held: TALLY.held.concat([
  { place: 3, task: 'glade_poachers', hunt: 'mosslight_glade', monster: 'glade_poacher', kills: 20, target: 60, keep: false, done: false, done_at: null, wait: null }]) });
const BOARD = { ok: true, hunting: false, tally: TALLY, board: [
  { task: 'cellar_giant_rats', hunt: 'mill_cellar', monster: 'rat', target: 120, gold: 100, party: false, band_min: 1, held: true, pick: { pick: 'material', item: 'slime_gel', qty: 4 } },
  { task: 'thicket_gray_wolves', hunt: 'meadowbrook_thicket', monster: 'gray_wolf', target: 200, gold: 480, party: false, band_min: 5, held: true, pick: { pick: 'piece', item: 'apprentice_body', qty: 1 } },
  { task: 'glade_poachers', hunt: 'mosslight_glade', monster: 'glade_poacher', target: 60, gold: 920, party: false, band_min: 16, held: false, pick: { pick: 'piece', item: 'adept_helmet', qty: 1 } }] };
const TOWN = { hunt: null, state: Object.assign(clone(BASE_ENV.state), { active_kind: 'idle', active_id: null }), tally: TALLY };
const RPCS = ['hr_tally_accept', 'hr_tally_drop', 'hr_tally_set', 'hr_tally_collect'];
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign(clone(s.env), { version: ++s.version, ok: true }));
    if (name === 'hr_tally_view') return json(s.board);
    if (RPCS.includes(name)) {
      await new Promise((ok) => setTimeout(ok, 400));
      return json(s.answers[name] || (name === 'hr_tally_collect' ? { ok: true, paid: [{ claim: 'c1', task: 'cellar_giant_rats', gold: 100, item: 'slime_gel', qty: 4, pick: 'material' }], wait: null } : { ok: true }));
    }
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

async function checks(overrides) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const W = '[data-hs-win="tally"] ';
  const open = async (sections, answers, board) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
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
  const txt = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); return e ? e.textContent : null; }, sel);
  const idle = (page) => wait(page, () => !document.querySelector('[data-hs-win="tally"] .hw-tally.is-pending'), null, 4000);
  const off = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); return !e || e.disabled; }, sel);
  try {
    { // TW-1, TW-2, TW-3, TW-6
      const { ctx, page, errors, s, up } = await open(clone(TOWN));
      const opened = up && await show(page);
      if (!opened) fails.push('TW-1 her window did not open from Q');
      else {
        await wait(page, () => document.querySelectorAll('[data-hs-win="tally"] .ht-offer').length === 3, null, 4000);
        if (errors.length) fails.push('TW-1 console errors: ' + errors.join(' | ').slice(0, 300));
        const lines = await page.evaluate(() => [...document.querySelectorAll('[data-hs-win="tally"] .ht-tally')].map((li) => li.querySelector('b').textContent + '|' + li.querySelector('small').textContent));
        if (lines.length !== 2 || lines[0] !== 'Gray Wolves 112/200|Counts in Meadowbrook Thicket, even while you are away.' || !/^Giant Rats 120\/120\|Done\./.test(lines[1])) fails.push('TW-1 her tallies read ' + JSON.stringify(lines));
        const offer = await txt(page, W + '.ht-offer[data-task="glade_poachers"] small');
        if (!/^Mosslight Glade \(Level 16 ground\) · 920 gp \+ an Adept /.test(offer || '')) fails.push('TW-1 the board line reads ' + JSON.stringify(offer));
        // TW-2: the visit hands the done task in, once
        await idle(page);
        const cl = sent(s, 'hr_tally_collect');
        if (cl.length !== 1 || Object.keys(cl[0].body).sort().join() !== 'p_idem,p_slot' || cl[0].body.p_slot !== 0) fails.push('TW-2 the visit sent ' + JSON.stringify(cl.map((c) => c.body)));
        // TW-3: Take
        await press(page, W + '.ht-offer[data-task="glade_poachers"] button', 'TW-3');
        await page.waitForTimeout(60);
        if (!(await off(page, W + '[data-hs-act="weight"]'))) fails.push('TW-3 a control stayed on while the take was in flight');
        await idle(page);
        const tk = sent(s, 'hr_tally_accept');
        if (tk.length !== 1 || tk[0].body.p_task !== 'glade_poachers' || tk[0].body.p_slot !== 0 || tk[0].body.p_weight !== null
          || Object.keys(tk[0].body).sort().join() !== 'p_idem,p_slot,p_task,p_weight') fails.push('TW-3 Take sent ' + JSON.stringify(tk.map((c) => c.body)));
        // TW-6: the HUD and the hunt list
        const hud = await page.evaluate(() => [...document.querySelectorAll('.hs-tally-row span:first-child')].map((e) => e.textContent));
        if (!hud.includes('Gray Wolves 112/200')) fails.push('TW-6 the HUD tally reads ' + JSON.stringify(hud));
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
        await wait(page, () => document.querySelectorAll('[data-hs-win="tally"] .ht-offer').length === 3, null, 4000);
        await idle(page);
        await press(page, W + '.ht-offer[data-task="glade_poachers"] button', 'TW-4');
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
        await wait(page, () => document.querySelectorAll('[data-hs-win="tally"] .ht-offer').length === 3, null, 4000);
        await page.waitForTimeout(500);
        if (!(await off(page, W + '.ht-offer[data-task="glade_poachers"] button'))) fails.push('TW-5 Take is on while hunting');
        if (sent(s, 'hr_tally_collect').length) fails.push('TW-5 a done task was handed in mid-hunt');
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
      const shown = up && await wait(page8, () => document.querySelectorAll('[data-hs-widget="tally"] .hs-tally-row').length === 3
        && !!document.querySelector('[data-hs-hud="world"] [data-hs-widget="analyzer"]'));
      if (!shown) fails.push('TW-8 the three held tallies and the analyzer never showed while hunting');
      else {
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
      page.setDefaultTimeout(6000);
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
    { // TW-7
      const { ctx, page, s, up } = await open({ hunt: null }, null, { ok: true, hunting: false, tally: null, board: BOARD.board });
      if (!(up && await show(page))) fails.push('TW-7 her window did not open without the section');
      else {
        await page.waitForTimeout(600);
        if (await page.evaluate(() => document.querySelectorAll('[data-hs-win="tally"] .ht-tally').length) !== 0) fails.push('TW-7 tallies were invented');
        if (!(await off(page, W + '.ht-offer[data-task="glade_poachers"] button'))) fails.push('TW-7 Take is on with no tally from the server');
        if (!(await off(page, W + '[data-hs-act="weight"]'))) fails.push('TW-7 a weight can be chosen with no tally from the server');
        const today = await txt(page, W + '.ht-today');
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
  ['Take stays on while hunting', 'src/shell/windows/tally.js', "prop(btn, 'disabled', !!why || st.sc.pending || st.hunting || !st.t || !st.t.weight);", "prop(btn, 'disabled', !!why || st.sc.pending || !st.t || !st.t.weight);"],
  ['a done task is handed in mid-hunt', 'src/shell/windows/tally.js', "const due = t && !st.hunting && t.paidToday < t.perDay", 'const due = t && t.paidToday < t.perDay'],
  ['the visit is sent on every repaint', 'src/shell/windows/tally.js', '  if (due.length && sc.collected !== key && !sc.pending && ctx.account) {', '  if (due.length && !sc.pending && ctx.account) {'],
  ['the reader invents a tally', 'src/session/tally-sections.js', "  if (!isObj(raw)) return null;\n  const had", "  if (!isObj(raw)) raw = { held: [], paid_today: 0, per_day: 3, held_max: 3, order: [] };\n  const had"],
  ['take carries a count', 'src/session/tally-intents.js', "{ p_slot: cs.slot, p_task: task, p_weight: weight == null ? null : weight, p_idem: newIdem() }", "{ p_slot: cs.slot, p_task: task, p_weight: weight == null ? null : weight, p_count: 1, p_idem: newIdem() }"],
  ['the HUD shows one more kill than the server', 'src/session/tally-sections.js', "return label + ' ' + h.kills + '/' + h.target;", "return label + ' ' + (h.kills + 1) + '/' + h.target;"],
  ['a refusal reads as a generic line', 'src/shell/windows/tally.js', "  const run = (send, busy, done) => runIntent(sc, repaint, send, busy, (r) => { sc.stale = true; return done(r); }, cs);", "  const run = (send, busy, done) => runIntent(sc, repaint, async () => { const r = await send(); if (!r.ok) r.error = 'refused'; return r; }, busy, (r) => { sc.stale = true; return done(r); }, cs);"],
  ['the hunt list drops the tally line', 'src/shell/windows/hunts.js', "text(li.querySelector('.hw-hunt-tally'), heldOn(tally, r.hunt).map(tallyLine).join(' · '));", "text(li.querySelector('.hw-hunt-tally'), '');"],
  ['the tally sits at its anchor, over the analyzer', 'src/shell/shell.js', '      const top = stackBelow(at, above, DOCK_EDGE);', '      const top = Math.round(at.top);'],
  ['a tally with nothing to show keeps its box', 'src/shell/widgets/tally-hud.js', "  cls(el, 'is-quiet', !t || (!held.length && hunting));", "  cls(el.querySelector('.hs-tally'), 'is-quiet', !t || (!held.length && hunting));"],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'tally-window: ' + fails.length + ' rule(s) RED'
      : 'tally-window: opens on Q; the server\'s tallies and her board; a due tally handed in once in town; Take sends ids only, controls off in flight; refusals in words; nothing taken or handed in mid-hunt; HUD and hunt list read the server; fails safe');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await checks(null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  let bad = 0;
  const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
  const list = MUTANTS.filter((m) => !pick || m[0].includes(pick));
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
