#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/training-window.mjs — COMBAT TRAINING'S CLIENT HALF, IN A REAL CHROMIUM (lane/b-combat-training-client).
//
//   node tests/training-window.mjs                the rules
//   node tests/training-window.mjs --shots <dir>  also write the desktop and phone screenshots
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs); the hero is
// tests/fixtures/alpha-envelope.json ("Tyler", slot 0, 5,200 gold) moved to town. The `training` section and the two verbs
// answer in the shape src/session/training-sections.js reads (the designer's 2026-11-13 spec; the server half is
// lane/c-combat-training).
//   TR-1  NO SECTION, NOTHING SHOWS: no `training` section, no Training icon
//   TR-2  START (the happy path): the icon opens the window on the server's quote (fee, XP an hour, hours to the next level);
//         ONE hr_training_start names the slot, the skill, the place, the fee SEEN and a key, nothing else; the run then
//         shows from the re-read section, and Stop is the hunt's own Leave (hr_hunt_leave)
//   TR-3  SAY WHY BEFORE THE PRESS: out hunting, in a party, a purse under the first hour, the dummy in use: Start is off
//         with the words above it
//   TR-4  THE HOUSE DUMMY: the House shows the four skills, held and locked, and the server's next price; short of it,
//         Unlock is off with the words; with the gold, Unlock asks first, then ONE hr_house_dummy_unlock at the price seen
//   TR-5  SIZES: no text under 12 px, nothing off the screen, desktop 1440x900 and the 922x423 sheet
//   TR-6  THE RATE AND THE ITEMS (2027-04-23-training-gear.sql, Tyler 2026-11-14), labels with the server's numbers: the quote reads the
//         server's XP/h (200% while the item time runs), the item box the hours left, the sealed one held and the Arms Master's rows;
//         Buy sends ONE hr_training_gear_buy naming the slot, the item, the price SEEN and a key; the switch ONE
//         hr_training_gear_switch; Open's refusal (hours still left) reads in words; under Level 10, Start is off with the Level; the
//         items closed, no press shows and the note says so
//   TR-7  LABELS (Tyler 2026-11-14; lane/c-training-gear-arm before the items opened): the quote, the run, the stop and the item box
//         show no line that says "you" or ends in a period; the refusals read as labels with the server's numbers (TR-0)
//   TR-10 A SESSION RUNNING ON A PHONE (v0.2.141 gate, 922x423, the sheet held above the action bar): the status box whole above Stop, Stop in view
//   TR-9  A STOP PENDING SAYS SO (post-140 audit C10): with the yard session in the hunt section and its Leave pending to the server's
//         leave_at, Stop is off and the window says the hunt bar's words ("Leaving in Ns"), until the server ends the run
//   TR-8  BUY ASKS FIRST: one click on Buy sends nothing and shows "Training Sword (12 h): 250,000 gold"; Cancel sends nothing; Buy in
//         the confirm sends the one hr_training_gear_buy at the price shown
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';
import { pressBar, menuLines, groupOf } from './_bar.mjs';

const ARGS = process.argv.slice(2);
const SHOTS = ARGS.includes('--shots') ? ARGS[ARGS.indexOf('--shots') + 1] : null;
const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const iso = (ms) => new Date(ms).toISOString();
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

const QUOTES = [
  { skill: 'melee', level: 20, fee_h: 272, xp_h: 8100, hours_to_next: 5 },
  { skill: 'ranged', level: 5, fee_h: 80, xp_h: 900, hours_to_next: 1 },
  { skill: 'magic', level: 1, fee_h: 56, xp_h: 300, hours_to_next: 1 },
  { skill: 'defense', level: 19, fee_h: 164, xp_h: 4200, hours_to_next: 3 },
];
const DUMMY = (o) => Object.assign({ needs: 'homestead', has_home: true, owned: ['defense'], ladder: [150000, 250000, 400000, 600000], next_price: 250000, busy: null }, o);
const SECTION = (o) => Object.assign({ skills: ['melee', 'ranged', 'magic', 'defense'], max_hours: 12, quotes: QUOTES, run: null, last_stop: null, dummy: DUMMY({}) }, o);
/* THE ITEMS' KEYS (2027-04-23-training-gear.sql hr_training_section): the rate, the hero's items a skill each, the Arms Master's rows, the day. */
const WORD = { melee: 'sword', ranged: 'bow', magic: 'wand', defense: 'shield' };
const GEAR = (o) => Object.assign({
  rate: { xp_h: 30000, xp_h_item: 60000, boost_pm: 2000, min_level: 10, level: 20 },
  quotes: QUOTES.map((q) => Object.assign({}, q, { xp_h: q.skill === 'melee' ? 60000 : 30000 })),
  gear: ['melee', 'ranged', 'magic', 'defense'].map((k) => (k === 'melee'
    ? { skill: k, banked_ms: 34200000, on: true, bag: [{ item: 'training_sword_12h_bound', hours: 12, bound: true, qty: 1 }], stored: [] }
    : { skill: k, banked_ms: 0, on: true, bag: [], stored: [] })),
  offers: ['melee', 'ranged', 'magic', 'defense'].flatMap((k) => [[12, 250000], [24, 450000]].map(([h, p]) => ({ item: 'training_' + WORD[k] + '_' + h + 'h', skill: k, hours: h, price: p }))),
  shop: { on: true, today: 0, max: 10 } }, o);

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') return json(envOf(s));
    if (name === 'hr_training_start') {
      /* 65.5 min, off the minute's edge: at exactly 65 a server clock a few ms behind this one floored to "1 hour 4 minutes" (TR-2 flake, 2026-11-16) */
      s.training = SECTION({ run: { skill: body.p_skill, where: body.p_where, since: iso(Date.now() - 65 * 60000 - 30000), fee_h: body.p_fee_seen, paid: body.p_fee_seen * 2 } });
      return json({ ok: true });
    }
    /* TR-9: a yard session in the hunt section, its Leave PENDING to the server's leave_at (2027-05-20-yard-stop.sql: at the press, here a few seconds on) */
    if (name === 'hr_hunt_leave' && s.hunt && s.leaveInMs) {
      const at = iso(Date.now() + s.leaveInMs);
      s.hunt = Object.assign({}, s.hunt, { session: Object.assign({}, s.hunt.session, { leave_at: at }) });
      return json({ ok: true, pending: true, session: { id: s.hunt.session_id, leave_at: at } });
    }
    if (name === 'hr_hunt_leave') { s.training = SECTION({ last_stop: { reason: 'left', skill: 'melee', at: iso(Date.now()) } }); return json({ ok: true, pending: false }); }
    if (name === 'hr_house_dummy_unlock') { s.training = SECTION({ dummy: DUMMY({ owned: ['defense', body.p_skill], next_price: 400000 }) }); return json({ ok: true }); }
    if (name === 'hr_training_gear_buy') { s.gold -= 250000; s.training = SECTION(GEAR({ shop: { on: true, today: 1, max: 10 } })); return json({ ok: true, item: body.p_item }); }
    if (name === 'hr_training_gear_switch') { const g = GEAR({}); g.gear[0].on = body.p_on; s.training = SECTION(g); return json({ ok: true, skill: body.p_skill, on: body.p_on }); }
    if (name === 'hr_training_gear_open') return json({ ok: false, error: 'still_open', skill: 'melee', banked_ms: 34200000 });
    return json({ ok: true });
  });
}

function envOf(s) {
  const env = Object.assign(clone(BASE_ENV), { hunt: s.hunt || null, party: s.party || null, hunt_track: null, hunt_events: null, hunt_analyzer: null,
    now: iso(Date.now()), version: ++s.version, ok: true });
  env.state = Object.assign({}, env.state, { active_kind: s.hunt ? 'combat' : 'idle', active_id: s.hunt ? 'mill_cellar' : null, gold: s.gold });
  if (s.training) env.training = s.training;
  else delete env.training;
  return env;
}

const world = (o) => Object.assign({ calls: [], version: 1, gold: 5200, hunt: null, party: null, training: SECTION({}) }, o);

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

async function checks() {
  const fails = [];
  const { server, port } = await serve();
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  const open = async (s, viewport) => {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/400|404/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await stub(page, s);
    if (!await signInAndPlay(page, base)) fails.push('harness: the page never reached the World');
    await page.waitForTimeout(300);
    return { ctx, page, errors };
  };
  const q = (page, sel) => page.evaluate((x) => { const e = document.querySelector('[data-hs-win="training"] ' + x); return e ? e.textContent : null; }, sel);
  const openTraining = async (page, phone) => {
    if (phone) {
      await page.keyboard.press('o');
      if (!await wait(page, () => { const b = document.querySelector('[data-hs-win="characters"] .hw-icon-names [data-hs-open="training"]'); return !!b && b.offsetParent !== null; }, null, 4000)) return false;
      await page.click('[data-hs-win="characters"] .hw-icon-names [data-hs-open="training"]');
    } else {
      try { await pressBar(page, 'training', { timeout: 2000 }); } catch { return false; }
    }
    return wait(page, () => !!document.querySelector('[data-hs-win="training"] .tw-train'), null, 4000);
  };
  /* TR-7 LABELS, NOT SENTENCES (Tyler 2026-11-14): every line the window shows outside an item's flavour reads as the genre's label, so
     none says "you" and none ends in a period. */
  const sentences = (page) => page.evaluate(() => ((document.querySelector('[data-hs-win="training"]') || {}).innerText || '')
    .split('\n').map((l) => l.trim()).filter((l) => /\byou(r)?\b/i.test(l) || /\.$/.test(l)));
  const labelsOnly = async (page, when) => { const bad = await sentences(page); if (bad.length) fails.push('TR-7 ' + when + ': ' + JSON.stringify(bad)); };
  const offWhy = (page) => page.evaluate(() => { const b = document.querySelector('[data-hs-act="train-start"]'); return { off: !!b && b.disabled, why: (document.querySelector('[data-hs-win="training"] .tw-off-why') || {}).textContent || '' }; });

  try {
    /* TR-0: the server's refusal codes (2027-04-16-combat-training.sql) read with its numbers */
    {
      const { trainingRefusal } = await import('../src/shell/training-words.js');
      const want = [
        [{ verb: 'training_start', error: 'insufficient_gold', fee: 272, purse: 100 }, /^Not enough gold \(need 272, have 100\)$/],
        [{ verb: 'house_dummy', error: 'insufficient_gold', price: 250000, purse: 5200 }, /^Next unlock: 250,000 gold\. Gold: 5,200 gp$/],
        [{ verb: 'training_start', error: 'hunt_open' }, /^Not available while hunting$/],
        [{ verb: 'training_gear_buy', error: 'insufficient_gold', price: 250000, purse: 1200 }, /^Not enough gold \(need 250,000, have 1,200\)$/],
        [{ verb: 'training_gear_buy', error: 'buy_limit', max: 10 }, /^Daily limit reached \(10\/10\)$/],
        [{ verb: 'training_gear_open', error: 'still_open' }, /^Training item already active$/],
        [{ verb: 'house_dummy', error: 'dummy_max' }, /Every skill is unlocked/],
      ];
      for (const [r, re] of want) { const w = trainingRefusal(r, 'Tyler'); if (!re.test(w || '')) fails.push('TR-0 ' + r.error + ' reads ' + JSON.stringify(w)); }
    }
    /* TR-1 */
    {
      const s = world({ training: null });
      const { ctx, page } = await open(s);
      /* its line in the bar's Town menu (tests/_bar.mjs), and anything else in the page that would open it */
      if ((await menuLines(page, groupOf('training'))).includes('training') || await page.evaluate(() => !!document.querySelector('[data-hs-open="training"]'))) fails.push('TR-1 a Training line shows with no `training` section');
      await ctx.close();
    }
    /* TR-2 */
    {
      const s = world({});
      const { ctx, page, errors } = await open(s);
      if (!await openTraining(page)) fails.push('TR-2 the icon did not open the Training window');
      else {
        const fee = await q(page, '.tw-fee'), xp = await q(page, '.tw-xp'), lvl = await q(page, '.tw-to-level');
        if (fee !== '272 gold/h') fails.push('TR-2 the fee is not the server\'s quote: ' + JSON.stringify(fee));
        await labelsOnly(page, 'the quote');
        if (!/8,100 Melee XP/.test(xp || '')) fails.push('TR-2 the XP an hour is not the server\'s: ' + JSON.stringify(xp));
        if (!/5 hours to Melee 21/.test(lvl || '')) fails.push('TR-2 the hours to the next level are not the server\'s: ' + JSON.stringify(lvl));
        await page.click('[data-hs-act="train-start"]');
        await wait(page, () => { const r = document.querySelector('[data-hs-win="training"] .tw-run'); return !!r && !r.hidden; }, null, 4000);
        const starts = s.calls.filter((c) => c.name === 'hr_training_start');
        if (starts.length !== 1) fails.push('TR-2 hr_training_start sent ' + starts.length + ' times');
        else {
          const keys = Object.keys(starts[0].body).sort().join(',');
          if (keys !== 'p_fee_seen,p_idem,p_skill,p_slot,p_where') fails.push('TR-2 the start names more or less than slot, skill, place, fee seen and key: ' + keys);
          if (starts[0].body.p_skill !== 'melee' || starts[0].body.p_where !== 'yard' || starts[0].body.p_fee_seen !== 272) fails.push('TR-2 the start body: ' + JSON.stringify(starts[0].body));
        }
        const now = await q(page, '.tw-now'), clock = await q(page, '.tw-run-clock'), paid = await q(page, '.tw-run-paid');
        if (now !== 'Training Melee') fails.push('TR-2 the run does not show: ' + JSON.stringify(now));
        if (!/1 hour 5 minutes/.test(clock || '')) fails.push('TR-2 the clock is not the server\'s since: ' + JSON.stringify(clock));
        if (!/544 gold/.test(paid || '')) fails.push('TR-2 the paid line is not the server\'s: ' + JSON.stringify(paid));
        await labelsOnly(page, 'the run');
        if (SHOTS) await page.screenshot({ path: join(SHOTS, 'training-desktop-run.png') });
        await page.click('[data-hs-act="train-stop"]');
        await wait(page, () => { const r = document.querySelector('[data-hs-win="training"] .tw-ended'); return !!r && !r.hidden; }, null, 4000);
        if (!s.calls.some((c) => c.name === 'hr_hunt_leave')) fails.push('TR-2 Stop did not send the hunt\'s Leave');
        if (!/^Training stopped$/.test(await q(page, '.tw-ended') || '')) fails.push('TR-2 the window does not say why it ended: ' + JSON.stringify(await q(page, '.tw-ended')));
        await labelsOnly(page, 'after Stop');
      }
      if (errors.length) fails.push('TR-2 console: ' + errors.slice(0, 2).join(' | '));
      await ctx.close();
    }
    /* TR-10 A SESSION RUNNING ON A PHONE (v0.2.141 gate, 922x423: the sheet stands above the action bar while the yard runs, 275 px, and the sticky
       foot, Stop and its answer, covered the status box's last lines): the box is whole above Stop, and Stop is whole in the sheet's view */
    {
      const yard = Object.assign(clone(BASE_ENV.hunt), { session_id: '00000000-0000-4000-a000-0000000000b0', hunt_id: 'training_yard_melee', ended: false });
      yard.session = { id: yard.session_id, hunt: 'training_yard_melee', phase: 'hunting' };
      const s = world({ hunt: yard, training: SECTION({ run: { skill: 'melee', where: 'yard', since: iso(Date.now() - 20 * 60000), fee_h: 272, paid: 272 } }) });
      const { ctx, page, errors } = await open(s, { width: 922, height: 423 });
      if (!await openTraining(page, true)) fails.push('TR-10 the Training window did not open on a running yard session on a phone');
      else {
        await page.waitForTimeout(400);
        const v = await page.evaluate(() => {
          const w = document.querySelector('[data-hs-win="training"]'), body = w.querySelector('[data-hs-body]'), b = body.getBoundingClientRect();
          const k = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
          return { win: Math.round(w.getBoundingClientRect().height), body: [Math.round(b.top), Math.round(Math.min(b.bottom, innerHeight))], run: k(w.querySelector('.tw-run')),
            foot: k(w.querySelector('.tw-foot')), stop: k(w.querySelector('.tw-stop')), shown: !w.querySelector('.tw-run').hidden,
            footPos: getComputedStyle(w.querySelector('.tw-foot')).position, lead: !!w.querySelector('.tw-lead').getClientRects().length };
        });
        if (!v.shown) fails.push('TR-10 CONTROL: the status box is not shown');
        else if (v.win > 330) fails.push('TR-10 CONTROL: the sheet is not held above the bar (' + v.win + ' px), so this proves nothing');
        else if (v.run[1] > v.foot[0] + 1 || v.stop[0] < v.body[0] - 1 || v.stop[1] > v.body[1] + 1) fails.push('TR-10 on a phone the status box runs under Stop or Stop is off the sheet: ' + JSON.stringify(v));
        /* ...and Stop stands in the flow right under the box, never in a sticky foot that grows with its answer over the box (the gate's state, just
           after Start: the answer in the foot and the lead line above the box), and the lead line steps aside while a session runs */
        else if (v.footPos === 'sticky' || v.stop[0] - v.run[1] > 24 || v.lead) fails.push('TR-10 on a phone a running session keeps the sticky foot or the lead line: ' + JSON.stringify(v));
        if (SHOTS) await page.screenshot({ path: join(SHOTS, 'training-running-phone.png') });
      }
      if (errors.length) fails.push('TR-10 console: ' + errors.slice(0, 2).join(' | '));
      await ctx.close();
    }
    /* TR-9 A STOP PENDING SAYS SO (post-140 audit C10: the window stood unchanged for 16 s after Stop). The yard session is the hunt section;
       Stop's Leave is pending to the server's leave_at, so Stop goes off and the window says what the hunt bar says ("Leaving in Ns"),
       counted to that instant on the server's clock, until the server's run is over; then the window says why it ended. */
    {
      const yard = Object.assign(clone(BASE_ENV.hunt), { session_id: '00000000-0000-4000-a000-0000000000a9', hunt_id: 'training_yard_melee', ended: false });
      yard.session = { id: yard.session_id, hunt: 'training_yard_melee', phase: 'hunting' };
      const s = world({ hunt: yard, leaveInMs: 6000, training: SECTION({ run: { skill: 'melee', where: 'yard', since: iso(Date.now() - 20 * 60000), fee_h: 272, paid: 272 } }) });
      const { ctx, page, errors } = await open(s);
      if (!await openTraining(page)) fails.push('TR-9 the Training window did not open on a running yard session');
      else {
        const before = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="training"]'); const b = w.querySelector('[data-hs-act="train-stop"]');
          const line = w.querySelector('.tw-stop-why'); return { off: b.disabled, hidden: b.hidden, why: line.hidden ? '' : line.textContent }; });
        if (before.hidden || before.off || before.why) fails.push('TR-9 before the press Stop reads ' + JSON.stringify(before));
        await page.click('[data-hs-act="train-stop"]');
        /* the line beside Stop says it, shown (say-why: a control off for a rule shows why), and the press carries it too */
        const said = await wait(page, () => { const e = document.querySelector('[data-hs-win="training"] .tw-stop-why'); return !!e && !e.hidden && /^Leaving in \ds$/.test(e.textContent); }, null, 4000);
        const during = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="training"]'); const b = w.querySelector('[data-hs-act="train-stop"]');
          return { off: b.disabled, why: w.querySelector('.tw-stop-why').textContent, offWhy: b.getAttribute('data-off-why'), bar: (document.querySelector('.ht-leaving') || {}).textContent || '' }; });
        if (!said || !during.off || during.offWhy !== during.why || (during.bar && during.bar !== during.why)) fails.push('TR-9 while the Stop pends the window reads ' + JSON.stringify(during));
        /* the server closes it: the hunt section ends and the yard's end card takes the screen (the summary's Training Yard card), no Stop left pending */
        s.hunt = Object.assign({}, s.hunt, { ended: true });
        s.training = SECTION({ last_stop: { reason: 'left', skill: 'melee', at: iso(Date.now()) } });
        const ended = await wait(page, () => /Training Yard/.test((document.querySelector('[data-hs-win="hunt-summary"] .hsum-title') || {}).textContent || ''), null, 12000);
        const after = await page.evaluate(() => ({ stop: !!document.querySelector('[data-hs-win="training"] [data-hs-act="train-stop"]:not([hidden])'), bar: (document.querySelector('.ht-leaving:not([hidden])') || {}).textContent || '' }));
        if (!ended || after.stop || after.bar) fails.push('TR-9 after the close the screen reads ' + JSON.stringify({ ended, after }));
        if (s.calls.filter((c) => c.name === 'hr_hunt_leave').length !== 1) fails.push('TR-9 Stop sent ' + s.calls.filter((c) => c.name === 'hr_hunt_leave').length + ' Leaves');
      }
      if (errors.length) fails.push('TR-9 console: ' + errors.slice(0, 2).join(' | '));
      await ctx.close();
    }
    /* TR-3 */
    for (const [label, o, want, pick] of [
      ['hunting', { hunt: clone(BASE_ENV.hunt) }, /^Not available while hunting$/, null],
      ['party', { party: clone(BASE_ENV.party) || { leader: 0, self: 0, members: [{ slot: 0, name: 'Tyler' }, { slot: 1, name: 'Mira' }] } }, /^Not available in a party$/, null],
      ['short', { gold: 100 }, /^Not enough gold \(need 272, have 100\)$/, null],
      ['busy', { training: SECTION({ dummy: DUMMY({ busy: 'Mira' }) }) }, /^Dummy in use by Mira$/, 'defense'],
    ]) {
      const s = world(o);
      const { ctx, page } = await open(s);
      if (!await openTraining(page)) { fails.push('TR-3 ' + label + ': no window'); await ctx.close(); continue; }
      if (pick) { await page.click('[data-hs-act="skill"][data-skill="' + pick + '"]'); await page.click('[data-hs-act="where"][data-where="house"]'); await page.waitForTimeout(150); }
      const r = await offWhy(page);
      if (!r.off || !want.test(r.why)) fails.push('TR-3 ' + label + ': Start ' + (r.off ? 'off' : 'ON') + ' with ' + JSON.stringify(r.why));
      if (label === 'short' && SHOTS) await page.screenshot({ path: join(SHOTS, 'training-desktop-short.png') });
      await ctx.close();
    }
    /* TR-4 */
    {
      const s = world({ gold: 5200 });
      const { ctx, page } = await open(s);
      await page.keyboard.press('e');
      await wait(page, () => { const d = document.querySelector('[data-hs-win="house"] .hd-dummy'); return !!d && !d.hidden; }, null, 4000);
      const r = await page.evaluate(() => ({ held: [...document.querySelectorAll('.hd-skill.is-held b')].map((b) => b.textContent),
        offAll: [...document.querySelectorAll('[data-hs-act="dummy-ask"]')].filter((b) => !b.hidden).every((b) => b.disabled),
        why: (document.querySelector('.hd-why') || {}).textContent || '', next: (document.querySelector('.hd-next') || {}).textContent || '' }));
      if (r.held.join() !== 'Defense') fails.push('TR-4 the held skills are not the server\'s: ' + r.held.join());
      if (!/250,000/.test(r.next)) fails.push('TR-4 the next price is not the server\'s: ' + r.next);
      if (!r.offAll || !/^Next unlock: 250,000 gold\. Gold: 5,200 gp$/.test(r.why)) fails.push('TR-4 short of the price, Unlock is not off with why: ' + JSON.stringify(r));
      await ctx.close();
      const s2 = world({ gold: 300000 });
      const o2 = await open(s2);
      await o2.page.keyboard.press('e');
      await wait(o2.page, () => { const d = document.querySelector('[data-hs-win="house"] .hd-dummy'); return !!d && !d.hidden; }, null, 4000);
      await o2.page.click('[data-hs-act="dummy-ask"][data-skill="melee"]');
      await wait(o2.page, () => { const c = document.querySelector('.hd-confirm'); return !!c && !c.hidden; }, null, 3000);
      if (s2.calls.some((c) => c.name === 'hr_house_dummy_unlock')) fails.push('TR-4 Unlock bought without asking first');
      await o2.page.locator('.hd-dummy').scrollIntoViewIfNeeded();
      if (SHOTS) await o2.page.screenshot({ path: join(SHOTS, 'house-dummy-desktop.png') });
      await o2.page.click('[data-hs-act="dummy-yes"]');
      await wait(o2.page, () => [...document.querySelectorAll('.hd-skill.is-held')].length === 2, null, 4000);
      const buys = s2.calls.filter((c) => c.name === 'hr_house_dummy_unlock');
      if (buys.length !== 1 || buys[0].body.p_skill !== 'melee' || buys[0].body.p_price !== 250000) fails.push('TR-4 the unlock: ' + JSON.stringify(buys.map((b) => b.body)));
      await o2.ctx.close();
    }
    /* TR-6 */
    {
      const s = world({ gold: 300000, training: SECTION(GEAR({})) });
      const { ctx, page, errors } = await open(s);
      if (!await openTraining(page)) fails.push('TR-6 the icon did not open the Training window');
      else {
        const xp = await q(page, '.tw-xp'), left = await q(page, '.tw-gear-left');
        if (xp !== '60,000 Melee XP/h at 200%') fails.push('TR-6 the rate is not the server\'s, with its 200%: ' + JSON.stringify(xp));
        if (left !== 'Training Sword at 200%, 9 hours 30 minutes left') fails.push('TR-6 the hours left are not the server\'s: ' + JSON.stringify(left));
        const rowsOf = (sel) => page.evaluate((x) => [...document.querySelectorAll('[data-hs-win="training"] ' + x + ' .tw-gear-row')]
          .map((r) => r.querySelector('.tw-gear-name').textContent + ' | ' + r.querySelector('.tw-gear-fig').textContent), sel);
        const held = await rowsOf('.tw-gear-held'), shop = await rowsOf('.tw-gear-shop');
        if (held.join() !== 'Training Sword (12 h), bound | 1 in bag') fails.push('TR-6 the sealed ones held: ' + JSON.stringify(held));
        if (shop.join() !== 'Training Sword (12 h) | 250,000 gold,Training Sword (24 h) | 450,000 gold') fails.push('TR-6 the Arms Master\'s rows: ' + JSON.stringify(shop));
        if (SHOTS) { await page.locator('[data-hs-win="training"] .tw-gear').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(SHOTS, 'training-desktop-items.png') }); }
        /* TR-8 BUY ASKS FIRST (the House dummy's pattern; the Coordinator 2026-11-16: 250,000 gold went on one click): Buy alone sends
           nothing and shows the item, its size and the server's price; Cancel sends nothing; Buy in the confirm sends the one purchase */
        const buyPress = '[data-hs-win="training"] .tw-gear-shop .tw-gear-row:first-child [data-hs-act="gear-buy"]';
        const confirmOf = () => page.evaluate(() => { const c = document.querySelector('[data-hs-win="training"] .tw-gear-confirm');
          return { shown: !!c && !c.hidden, q: (c && c.querySelector('.tw-gear-confirm-q') || {}).textContent || '' }; });
        await page.click(buyPress);
        await page.waitForTimeout(300);
        let cf = await confirmOf();
        if (s.calls.some((c) => c.name === 'hr_training_gear_buy')) fails.push('TR-8 one click on Buy bought');
        if (!cf.shown || cf.q !== 'Training Sword (12 h): 250,000 gold') fails.push('TR-8 Buy did not ask first: ' + JSON.stringify(cf));
        await labelsOnly(page, 'the confirm');
        if (cf.shown) {   /* a Buy that bought at once has no confirm to press: its red is above, the rest still runs */
          await page.click('[data-hs-win="training"] [data-hs-act="gear-no"]');
          await page.waitForTimeout(300);
          cf = await confirmOf();
          if (cf.shown || s.calls.some((c) => c.name === 'hr_training_gear_buy')) fails.push('TR-8 Cancel left the confirm or bought: ' + JSON.stringify(cf));
          await page.click(buyPress);
          await wait(page, () => { const c = document.querySelector('[data-hs-win="training"] .tw-gear-confirm'); return !!c && !c.hidden; }, null, 3000);
          if (SHOTS) await page.screenshot({ path: join(SHOTS, 'training-desktop-confirm.png') });
          await page.click('[data-hs-win="training"] [data-hs-act="gear-yes"]');
        }
        /* the day's count names what it counts (audit 2026-11-18 A14: "Daily limit: 0/10") */
        const dayLine = await wait(page, () => ((document.querySelector('[data-hs-win="training"] .tw-gear-day') || {}).textContent || '') === 'Bought today: 1 / 10', null, 4000);
        if (!dayLine) fails.push('TR-6 the day\'s line reads ' + JSON.stringify(await page.evaluate(() => (document.querySelector('[data-hs-win="training"] .tw-gear-day') || {}).textContent)));
        const buys = s.calls.filter((c) => c.name === 'hr_training_gear_buy');
        if (buys.length !== 1) fails.push('TR-6 hr_training_gear_buy sent ' + buys.length + ' times');
        else {
          const keys = Object.keys(buys[0].body).sort().join(',');
          if (keys !== 'p_idem,p_item,p_price_seen,p_slot' || buys[0].body.p_item !== 'training_sword_12h' || buys[0].body.p_price_seen !== 250000) fails.push('TR-6 the buy body: ' + JSON.stringify(buys[0].body));
        }
        await page.click('[data-hs-win="training"] .tw-gear-on');
        await wait(page, () => /switched off/.test((document.querySelector('[data-hs-win="training"] .tw-gear-left') || {}).textContent || ''), null, 4000);
        const flips = s.calls.filter((c) => c.name === 'hr_training_gear_switch');
        if (flips.length !== 1 || flips[0].body.p_skill !== 'melee' || flips[0].body.p_on !== false) fails.push('TR-6 the switch: ' + JSON.stringify(flips.map((c) => c.body)));
        await page.click('[data-hs-win="training"] .tw-gear-held [data-hs-act="gear-open"]');
        await wait(page, () => /already active/.test((document.querySelector('[data-hs-win="training"] .hh-intent-msg') || {}).textContent || ''), null, 4000);
        const said = await q(page, '.hh-intent-msg');
        if (said !== 'Training item already active' || s.calls.filter((c) => c.name === 'hr_training_gear_open').length !== 1) fails.push('TR-6 Open\'s refusal reads ' + JSON.stringify(said));
        await labelsOnly(page, 'the items, after a buy, a switch and a refused open');
      }
      if (errors.length) fails.push('TR-6 console: ' + errors.slice(0, 2).join(' | '));
      await ctx.close();
      for (const [label, sec, check] of [
        ['under Level 10', SECTION(GEAR({ rate: { xp_h: 30000, xp_h_item: 60000, boost_pm: 2000, min_level: 10, level: 5 } })), async (page) => {
          const r = await offWhy(page);
          return r.off && r.why === 'Requires Level 10' ? null : 'Start ' + (r.off ? 'off' : 'ON') + ' with ' + JSON.stringify(r.why);
        }],
        ['closed', SECTION(GEAR({ shop: { on: false, today: 0, max: 10 } })), async (page) => {
          const r = await page.evaluate(() => ({ presses: document.querySelectorAll('[data-hs-win="training"] .tw-gear-press').length,
            note: (document.querySelector('[data-hs-win="training"] .tw-gear-note') || {}).textContent || '' }));
          return r.presses === 0 && r.note === 'Not for sale yet' ? null : JSON.stringify(r);
        }],
      ]) {
        const s2 = world({ training: sec });
        const o2 = await open(s2);
        if (!await openTraining(o2.page)) fails.push('TR-6 ' + label + ': no window');
        else { const bad = await check(o2.page); if (bad) fails.push('TR-6 ' + label + ': ' + bad); }
        await o2.ctx.close();
      }
    }
    /* TR-5 */
    for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 922, height: 423 }]]) {
      const s = world({ training: SECTION(GEAR({})) });
      const { ctx, page } = await open(s, viewport);
      if (!await openTraining(page, label === 'phone')) { fails.push('TR-5 ' + label + ': no way to the Training window'); await ctx.close(); continue; }
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const win = document.querySelector('[data-hs-win="training"]');
        const small = [];
        for (const el of win.querySelectorAll('*')) {
          if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          if (el.offsetParent === null) continue;
          if (parseFloat(getComputedStyle(el).fontSize) < 12) small.push(el.className);
        }
        const r = win.getBoundingClientRect();
        return { small, right: r.right, left: r.left, vw: innerWidth };
      });
      if (m.small.length) fails.push('TR-5 ' + label + ': text under 12 px: ' + m.small.slice(0, 4).join(', '));
      if (m.left < -1 || m.right > m.vw + 1) fails.push('TR-5 ' + label + ': the window runs off the screen');
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'training-' + label + '.png') });
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

async function main() {
  if (SHOTS) await mkdir(SHOTS, { recursive: true });
  const fails = await checks();
  for (const f of fails) console.log('FAIL  ' + f);
  console.log(fails.length ? 'training-window: ' + fails.length + ' FAILED' : 'training-window: green (nothing without the section, start, run, stop, say why, the house dummy, the rate and the items, sizes)');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
