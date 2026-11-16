#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/tower-window.mjs — THE BURNING TOWER ON SCREEN, IN A REAL CHROMIUM (lane/b-tower-window).
//
//   node tests/tower-window.mjs            the rules
//   node tests/tower-window.mjs --mutate   every planted defect must turn a rule RED
//   node tests/tower-window.mjs --shots <dir>   also write the desktop (1440x900) and phone (922x423) screenshots
//
// mutant-anchors: src/shell/windows/tower.js src/shell/windows/tower-chest.js src/session/tower-sections.js src/session/tower-intents.js src/shell/windows/havora/index.js src/shell/death-popup.js src/shell/widgets/tower-bar.js src/hunt-view/summary-recorder.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs); the hero is tests/fixtures/alpha-envelope.json
// ("Tyler", slot 0), with a `tower` section in the shape of 2027-04-28-tower-section.sql hr_tower_section (its `chest`: 2027-04-27-
// tower-chest.sql hr_chest_section). The server half on the real chain is that file's §3, tests/tower-climb.mjs, tests/tower-chest.mjs and
// tests/envelope-contract.mjs; the whole loop on the real engine is tests/tower-world.mjs.
//   TW-1  SWITCH OFF: no `tower` section, so the Havora window's Hearth tab has no Tower door, no Tower window opens, the Hearth's tap row
//         falls back to the bag (shell-windows.js orElse), and no Tower verb is ever sent
//   TW-2  THE CLIMB: the six plain lines, what a kill gives (the mode's own permille), the floors the server lists as the only picks (the
//         highest picked), the week's keys and limits; Enter sends ONE hr_tower_start naming only the slot, the picked floor and a key
//   TW-3  FORGED AND STALE: a start list that isn't the server's shape draws no pick and Enter stays off; a floor picked then dropped by the
//         next envelope is never sent (the press takes the server's list again); a hunt running holds Enter off with why; a bad_floor
//         refusal says so in words and re-reads the character
//   TW-4  THE CHEST: the key held, where it is, its chance, the warmth, the saved stokes and their Cinders, "Your chance" = the server's
//         chance_ppm; a stoke press saves the default (ONE hr_chest_stoke_default); Use sends ONE hr_chest_open with p_stokes null (the saved
//         default, never a number of the page's); Use all the server's own count; the answer's weapon drawn; Use off while out hunting, for a
//         key whose weapons aren't built, and at the day's cap
//   TW-5  THE PHONE (922x423): the Tower window is a sheet inside the screen, nothing overflows sideways, no text under 12 px, Enter reachable
//   TW-6  A CLIMB RUNNING: the hunt bar says the floor (a landing says Keeper); a climb's end card says spat out with the floors and the key,
//         never "died", Hunt again is off, and the death popup never opens for the Tower; its "What happened" (and Just now) says a fall in
//         the Tower's own words ("was spat out", "The last blow") while a hunt's still says "died"
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const TOWN = { hunt: null, state: Object.assign(clone(BASE_ENV.state), { active_kind: 'idle', active_id: null }) };
const DAY = 86400000;
const SID = '0a0a0a0a-0000-4000-8000-00000000c1b0';
const KEYS = [['bronze', 'tower_key_bronze', 'Bronze Key', 10, 160, 50, 'temper_salts', 15, 'cooked_shrimp', 20, 1],
  ['silver', 'tower_key_silver', 'Silver Key', 40, 80, 150, 'fine_temper_salts', 25, 'cooked_lobster', 15, 2]];
/* The section as hr_tower_section answers it. */
function section(o = {}) {
  const held = o.held || {};
  return {
    hunt: 'the_burning_tower',
    rules: { room_size: 5, landing_every: 10, floor_limit_ms: 180000, landing_limit_ms: 600000, week_back: 60, floor_top: 300 },
    pays: { xp_pm: 375, coin: false, drops: false, bestiary: false, death_loss_pm: 0, blessings: false, stamina: true },
    best_floor: 27, best_landing: 20, week: '2026-11-16', week_ends_at: new Date(Date.now() + 3 * DAY).toISOString(), base: 0,
    starts: o.starts || [1, 11, 21], landings: [{ landing: 10, key: 'bronze' }, { landing: 20, key: 'bronze' }], open: [], next_landing: 30,
    run: o.run || null, last: o.last || null,
    chest: { on: true, dry: o.dry ?? 5, opens: 12, today: o.today ?? 0, max_day: 50, per_call: 20, own_pm: 500, own_family: 'bow', warmth_pm: o.warmth ?? 1200,
      cinders: { bag: 300, storage: 100 },
      keys: KEYS.map(([key, item, name, from, pm, cin, salts, sq, food, fq, plus]) => ({ key, item, name, from, skill_plus: plus,
        held: held[key] || { bag: 0, storage: 0 }, base_pm: pm, chance_ppm: key === 'bronze' ? (o.chance ?? 326400) : 96000, stokes_default: key === 'bronze' ? (o.stokes ?? 1) : 0,
        stokes: [{ n: 1, pm: 1700, cost: 3 * cin }, { n: 2, pm: 2500, cost: 7 * cin }, { n: 3, pm: 3300, cost: 12 * cin }],
        inside: { tower_cinders: cin, [salts]: sq, [food]: fq }, ready: o.notReady ? false : true })) },
  };
}
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') {
      const env = Object.assign(clone(s.env), { version: ++s.version, ok: true, hunt_server_now_ms: Date.now(), client_state: clone(s.residue) });
      if (s.tower) env.tower = clone(s.tower); else delete env.tower;
      return json(env);
    }
    if (name === 'hr_put_client_state') { Object.assign(s.residue, body.p_patch || {}); return json({ ok: true }); }
    if (/^hr_(tower|chest)_/.test(name)) return json(s.answer ? s.answer(name, body) : { ok: true });
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
async function replay(page) {
  await page.reload({ waitUntil: 'load' });
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'), null, 4000) && await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

const verbs = (s) => s.calls.filter((c) => /^hr_(tower|chest)_/.test(c.name));
const loads = (s) => s.calls.filter((c) => c.name === 'hr_load').length;
/* The Havora window's Hearth tab, and its door into the Tower (null: none drawn). */
async function havoraDoor(page) {
  if (!(await page.evaluate(() => !!document.querySelector('[data-hs-win="havora"]')))) await page.keyboard.press('x');
  await wait(page, () => document.querySelector('[data-hs-win="havora"] .hv-pane.is-on'));
  await page.waitForTimeout(200);
  return page.evaluate(() => { const p = document.querySelector('[data-hs-win="havora"] .hv-tower'); return p ? { hidden: p.hidden, shown: !!p.getClientRects().length } : null; });
}
async function openTower(page, tab) {
  const door = await havoraDoor(page);
  if (!door || door.hidden) return false;
  await page.click('[data-hs-win="havora"] [data-hs-act="tower"]');
  const up = await wait(page, () => document.querySelector('[data-hs-win="tower"] .tt-pane.is-on'));
  if (up && tab) { await page.click('[data-hs-win="tower"] .hw-tab[data-tab="' + tab + '"]'); await wait(page, (x) => document.querySelector('[data-hs-win="tower"] [data-pane="' + x + '"].is-on'), tab); }
  return up;
}
const climbView = (page) => page.evaluate(() => {
  const w = document.querySelector('[data-hs-win="tower"]');
  if (!w) return null;
  const go = w.querySelector('.tt-go');
  return { sum: Array.from(w.querySelectorAll('.tt-sum li')).filter((l) => !l.hidden).map((l) => l.textContent),
    xp: w.querySelector('.tt-xp').textContent, starts: Array.from(w.querySelectorAll('.tt-start')).map((b) => b.textContent + (b.getAttribute('aria-checked') === 'true' ? '*' : '')),
    best: w.querySelector('.tt-best').textContent, week: w.querySelector('.tt-week').textContent, next: w.querySelector('.tt-next').textContent,
    limits: w.querySelector('.tt-limits').textContent, startOn: w.querySelector('.tt-start-on').textContent, go: go.disabled ? 'off' : 'on', why: w.querySelector('.tt-off-why').textContent,
    msg: w.querySelector('.hh-intent-msg').textContent };
});
const chestView = (page) => page.evaluate(() => {
  const w = document.querySelector('[data-hs-win="tower"] [data-pane="chest"]');
  const tx = (q) => (w.querySelector(q) ? w.querySelector(q).textContent : null);
  const st = (q) => { const b = w.querySelector(q); return !b || b.hidden ? 'none' : b.disabled ? 'off' : 'on'; };
  return { cinders: tx('.tc-cinders'), picks: Array.from(w.querySelectorAll('.tc-pick')).map((b) => b.textContent), have: tx('.tc-have'), where: tx('.tc-where'),
    base: tx('.tc-base'), warm: tx('.tc-warm'), stokes: Array.from(w.querySelectorAll('.tc-stoke')).map((b) => b.textContent + (b.getAttribute('aria-checked') === 'true' ? '*' : '')),
    stoked: tx('.tc-stoked'), chance: tx('.tc-chance'), own: tx('.tc-own'), inside: tx('.tc-inside'), result: tx('.tt-result'),
    use: st('.tc-use'), all: st('.tc-use-all'), why: tx('.tc-off-why') };
});

async function checks(overrides, shots) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const open = async (viewport, s0, touch) => {
    const ctx = await browser.newContext({ viewport, hasTouch: !!touch, isMobile: false });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = Object.assign({ env: Object.assign(clone(BASE_ENV), clone(TOWN)), version: 1, calls: [], residue: {}, tower: null, answer: null }, s0);
    await stub(page, s);
    const up = await signInAndPlay(page, 'http://127.0.0.1:' + port);
    return { ctx, page, errors, s, up };
  };
  try {
    { // TW-1
      const { ctx, page, errors, s, up } = await open({ width: 1440, height: 900 }, {});
      if (!up) fails.push('TW-1 the World never came up');
      const door = await havoraDoor(page);
      if (!door || !door.hidden || door.shown) fails.push('TW-1 with the switch off the Havora Tower door is ' + JSON.stringify(door));
      const fall = await page.evaluate(async () => {
        const v = document.querySelector('script[type=module][src*="?v="]')?.src.split('?v=')[1] || '';
        const sw = await import('/src/data/shell-windows.js?v=' + v), st = await import('/src/data/world/stations.js?v=' + v);
        const row = sw.SHELL_WINDOWS.find((r) => r.id === 'tower');
        return { tap: st.TAP_OPENS.great_hearth.window, section: row && row.section, orElse: row && row.orElse, key: row && row.key, launcher: row && row.launcher };
      });
      if (fall.tap !== 'tower' || fall.section !== 'tower' || fall.orElse !== 'inventory' || fall.key !== null || fall.launcher !== false) fails.push('TW-1 the Hearth tap row is ' + JSON.stringify(fall));
      if (await page.evaluate(() => !!document.querySelector('[data-hs-win="tower"]'))) fails.push('TW-1 with the switch off a Tower window is open');
      if (verbs(s).length) fails.push('TW-1 with the switch off the page sent ' + verbs(s).map((c) => c.name));
      if (errors.length) fails.push('TW-1 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // TW-2
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, { tower: section() });
      s.answer = (name) => (name === 'hr_tower_start' ? { ok: true, session_id: SID, floor: 11 } : { ok: true });
      if (!(await openTower(page))) fails.push('TW-2 the Havora door opened no Tower window');
      else {
        const v = await climbView(page);
        if (!v || v.sum.length !== 6 || !/^The Tower is a climb/.test(v.sum[0]) || !/lose no XP/.test(v.sum[2]) || !/Every 10th floor gives you a key\. Each of your heroes can earn 6 keys a week/.test(v.sum[3]))
          fails.push('TW-2 the six plain lines read ' + JSON.stringify(v && v.sum));
        if (!v || v.xp !== 'Each kill gives 37.5% of its usual XP.') fails.push('TW-2 the XP line reads ' + JSON.stringify(v && v.xp));
        if (!v || v.starts.join() !== '1,11,21*') fails.push('TW-2 the start picks read ' + JSON.stringify(v && v.starts));
        if (!v || v.best !== 'Your best is floor 27.' || v.week !== 'You took 2 keys this week.' || v.next !== 'Your next new landing is floor 30. It gives a Bronze Key.'
          || v.limits !== 'You get 3 minutes on a floor and 10 on a landing. If you don\'t clear it in time, the climb ends.') fails.push('TW-2 the week reads ' + JSON.stringify(v));
        if (!v || v.go !== 'on' || v.why || v.startOn !== 'You start on floor 21.') fails.push('TW-2 Enter in town with a listed floor is ' + JSON.stringify(v && [v.go, v.why, v.startOn]));
        if (shots) { await page.waitForTimeout(700); await page.screenshot({ path: join(shots, 'tower-climb-desktop-1440x900.png') }); }
        await page.click('[data-hs-win="tower"] .tt-start[data-floor="11"]');
        await page.click('[data-hs-win="tower"] .tt-go');
        await wait(page, () => /went into the Tower/.test(document.querySelector('[data-hs-win="tower"] .hh-intent-msg')?.textContent || ''));
        const sent = verbs(s);
        if (sent.length !== 1 || sent[0].name !== 'hr_tower_start' || Object.keys(sent[0].body).sort().join() !== 'p_floor,p_idem,p_slot' || sent[0].body.p_floor !== 11 || sent[0].body.p_slot !== 0)
          fails.push('TW-2 Enter sent ' + JSON.stringify(sent));
        await page.click('[data-hs-win="tower"] [data-hs-act="story"]');
        const story = await page.evaluate(() => { const st = document.querySelector('[data-hs-win="tower"] .tt-story'); return !st.hidden && st.querySelectorAll('p').length; });
        if (story !== 5) fails.push('TW-2 the Story link shows ' + story + ' paragraphs');
      }
      if (errors.length) fails.push('TW-2 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // TW-3
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, { tower: section({ starts: [1, 'x', 11] }) });
      await openTower(page);
      let v = await climbView(page);
      if (!v || v.starts.length !== 0 || v.go !== 'off' || v.why !== 'Pick a floor to start on.') fails.push('TW-3 a forged start list reads ' + JSON.stringify(v));
      await page.click('[data-hs-win="tower"] .tt-go', { force: true }).catch(() => {});
      await page.waitForTimeout(300);
      if (verbs(s).length) fails.push('TW-3 an Enter that was off sent ' + verbs(s).map((c) => c.name));
      /* a floor picked, then dropped by the server (another device took the week's turn): the page sends what it saw once, the refusal
         re-reads, and the next press takes the server's list again, never the stale pick */
      s.tower = section({ starts: [1, 11, 21] });
      await replay(page); await openTower(page);
      await page.click('[data-hs-win="tower"] .tt-start[data-floor="21"]');
      s.tower = section({ starts: [1, 11] });
      s.answer = (name) => (name === 'hr_tower_start' ? { ok: false, error: 'bad_floor', starts: [1, 11] } : { ok: true });
      const before = loads(s);
      await page.click('[data-hs-win="tower"] .tt-go');
      const said = await wait(page, () => /can't start on that floor this week/.test(document.querySelector('[data-hs-win="tower"] .hh-intent-msg')?.textContent || ''));
      if (!said) fails.push('TW-3 bad_floor reads ' + JSON.stringify((await climbView(page)).msg));
      if (loads(s) <= before) fails.push('TW-3 a bad_floor refusal did not re-read the character');
      await wait(page, () => document.querySelectorAll('[data-hs-win="tower"] .tt-start').length === 2);
      v = await climbView(page);
      if (!v || v.starts.join() !== '1,11*') fails.push('TW-3 after the server dropped 21 the picks read ' + JSON.stringify(v && v.starts));
      if (!(await page.click('[data-hs-win="tower"] .tt-go', { timeout: 2000 }).then(() => true, () => false))) fails.push('TW-3 after the drop Enter is off: ' + JSON.stringify(v && v.why));
      await page.waitForTimeout(500);
      const sent = verbs(s);
      if (sent.length !== 2 || sent[0].body.p_floor !== 21 || sent[1].body.p_floor !== 11) fails.push('TW-3 the presses around the drop sent ' + JSON.stringify(sent.map((x) => x.body.p_floor)));
      /* a hunt running */
      s.env.hunt = clone(BASE_ENV.hunt);
      await replay(page); await openTower(page);
      v = await climbView(page);
      if (!v || v.go !== 'off' || !/is out hunting\. Come back to town to climb\./.test(v.why)) fails.push('TW-3 out hunting Enter reads ' + JSON.stringify(v && [v.go, v.why]));
      if (errors.length) fails.push('TW-3 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // TW-4
      const st = { tower: section({ held: { bronze: { bag: 2, storage: 1 } } }) };
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, st);
      s.answer = (name, body) => {
        if (name === 'hr_chest_stoke_default') { s.tower = section({ held: { bronze: { bag: 2, storage: 1 } }, stokes: body.p_stokes, chance: 480000 }); return { ok: true, key: body.p_key, stokes: body.p_stokes }; }
        if (name === 'hr_chest_open') return { ok: true, count: body.p_count, opens: [{ n: 13, stokes: 1, chance_ppm: 326400, weapon: 'palisade_sword', family: 'sword' }],
          haul: { palisade_sword: 1, tower_cinders: 50, temper_salts: 15, cooked_shrimp: 20 }, cinders_spent: 150 };
        return { ok: true };
      };
      await openTower(page, 'chest');
      let c = await chestView(page);
      if (c.cinders !== 'You have 400 Tower Cinders.' || c.picks.join() !== 'Bronze Key 3' || c.have !== 'Bronze Key. You have 3.' || c.where !== 'You have 2 in your bag and 1 in Storage.')
        fails.push('TW-4 the key reads ' + JSON.stringify(c));
      if (c.base !== '16% to find a tower weapon.' || c.warm !== 'The Hearth is warm from your last 5 keys, so your chance is 1.2 times the usual.'
        || c.stokes.join() !== 'None,Once*,Twice,3 times' || !/^Stoking once makes it x1\.7 and burns 150 of your 400 Cinders\./.test(c.stoked) || c.chance !== 'Your chance is 33%.')
        fails.push('TW-4 the odds read ' + JSON.stringify(c));
      if (c.own !== 'Half the time it\'s the type you have equipped. Right now that\'s a bow.' || c.inside !== 'You always get 50 Tower Cinders, 15 Tempering Salts and 20 Cooked Shrimp.')
        fails.push('TW-4 the inside reads ' + JSON.stringify([c.own, c.inside]));
      if (c.use !== 'on' || c.all !== 'on') fails.push('TW-4 Use/Use all with keys in town read ' + JSON.stringify([c.use, c.all]));
      if (shots) { await page.waitForTimeout(700); await page.screenshot({ path: join(shots, 'tower-chest-desktop-1440x900.png') }); }
      await page.click('[data-hs-win="tower"] .tc-stoke[data-stokes="2"]');
      const saved = await wait(page, () => /Your chance is 48%/.test(document.querySelector('[data-hs-win="tower"] .tc-chance')?.textContent || ''));
      let sent = verbs(s);
      if (sent.length !== 1 || sent[0].name !== 'hr_chest_stoke_default' || Object.keys(sent[0].body).sort().join() !== 'p_idem,p_key,p_slot,p_stokes' || sent[0].body.p_stokes !== 2)
        fails.push('TW-4 a stoke press sent ' + JSON.stringify(sent));
      if (!saved) fails.push('TW-4 the chance after the save is not the server\'s re-read: ' + JSON.stringify((await chestView(page)).chance));
      await page.click('[data-hs-win="tower"] .tc-use');
      const drawn = await wait(page, () => /The chest gave you a Palisade Sword\./.test(document.querySelector('[data-hs-win="tower"] .tt-result')?.textContent || ''));
      sent = verbs(s).slice(1);
      if (sent.length !== 1 || sent[0].name !== 'hr_chest_open' || Object.keys(sent[0].body).sort().join() !== 'p_chest,p_count,p_idem,p_key,p_slot,p_stokes'
        || sent[0].body.p_stokes !== null || sent[0].body.p_count !== 1 || sent[0].body.p_key !== 'bronze' || sent[0].body.p_chest !== 'great_hearth') fails.push('TW-4 Use sent ' + JSON.stringify(sent));
      if (!drawn) fails.push('TW-4 the answer reads ' + JSON.stringify((await chestView(page)).result));
      /* THE REVEAL: the opened key's own strip, the weapon the server named rising in its column; a repaint never replays it */
      const reveal = () => page.evaluate(() => {
        const r = document.querySelector('[data-hs-win="tower"] .tt-result .tc-reveal');
        const chest = r && r.querySelector('.tc-reveal-chest');
        return r ? { key: r.getAttribute('data-key'), weapon: r.classList.contains('has-weapon'), item: r.querySelector('.tc-reveal-item')?.getAttribute('src') || null,
          art: chest ? getComputedStyle(chest).backgroundImage : null, el: (window.__tcReveal = window.__tcReveal || r) === r } : null;
      });
      const rv = await reveal();
      if (shots) { await page.waitForTimeout(1600); await page.screenshot({ path: join(shots, 'tower-chest-reveal-1440x900.png') }); }
      for (const tab of ['climb', 'chest']) { await page.click('[data-hs-win="tower"] .hw-tab[data-tab="' + tab + '"]'); await page.waitForTimeout(150); }
      const rv2 = await reveal();
      if (!rv || rv.key !== 'bronze' || !rv.weapon || rv.item !== 'assets/icons-bundle/pixel/items/palisade_sword.png' || !/chest-open-bronze\.png/.test(rv.art || '') || !rv2 || !rv2.el)
        fails.push('TW-4 the reveal reads ' + JSON.stringify({ rv, rv2 }));
      await page.click('[data-hs-win="tower"] .tc-use-all');
      await page.waitForTimeout(600);
      sent = verbs(s).slice(2);
      if (sent.length !== 1 || sent[0].body.p_count !== 3 || sent[0].body.p_stokes !== null) fails.push('TW-4 Use all sent ' + JSON.stringify(sent));
      /* one key left of the day: Use on, Use all off (it would spend past the server's day) */
      s.tower = section({ held: { bronze: { bag: 2, storage: 1 } }, today: 49 });
      await replay(page); await openTower(page, 'chest');
      c = await chestView(page);
      if (c.use !== 'on' || c.all !== 'off') fails.push('TW-4 with one key left of the day Use/Use all read ' + JSON.stringify([c.use, c.all]));
      /* off: the day's cap, a key not built, out hunting */
      for (const [o, env, want] of [[{ today: 50 }, null, /You used 50 keys today/], [{ notReady: true }, null, /weapons aren't in the chest yet/], [{}, 'hunt', /out on a hunt/]]) {
        s.tower = section(Object.assign({ held: { bronze: { bag: 2, storage: 1 } } }, o));
        if (env) s.env.hunt = clone(BASE_ENV.hunt);
        const n = verbs(s).length;
        await replay(page); await openTower(page, 'chest');
        c = await chestView(page);
        if (c.use !== 'off' || !want.test(c.why)) fails.push('TW-4 Use with ' + JSON.stringify(o) + (env ? ' hunting' : '') + ' reads ' + JSON.stringify([c.use, c.why]));
        await page.click('[data-hs-win="tower"] .tc-use', { force: true }).catch(() => {});
        await page.waitForTimeout(250);
        if (verbs(s).length !== n) fails.push('TW-4 an off Use sent ' + verbs(s).slice(n).map((x) => x.name));
      }
      if (errors.length) fails.push('TW-4 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // TW-5
      const { ctx, page, errors } = await open({ width: 922, height: 423 }, { tower: section({ held: { bronze: { bag: 2, storage: 1 } } }) }, true);
      const measure = () => page.evaluate(() => {
        const w = document.querySelector('[data-hs-win="tower"]');
        if (!w) return null;
        const body = w.querySelector('[data-hs-body]') || w;
        let small = null;
        for (const e of w.querySelectorAll('*')) {
          if (!e.childNodes.length || ![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
          const fs = parseFloat(getComputedStyle(e).fontSize);
          if (e.getClientRects().length && fs < 12 && (!small || fs < small.fs)) small = { fs, text: e.textContent.trim().slice(0, 30) };
        }
        const r = w.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), over: body.scrollWidth - body.clientWidth, small, vw: innerWidth };
      });
      if (!(await openTower(page))) fails.push('TW-5 the phone opened no Tower window');
      else {
        await page.waitForTimeout(600);
        for (const tab of ['climb', 'chest']) {
          await page.click('[data-hs-win="tower"] .hw-tab[data-tab="' + tab + '"]');
          await page.waitForTimeout(300);
          const m = await measure();
          if (!m || m.left < 0 || m.right > m.vw || m.over > 1) fails.push('TW-5 the phone ' + tab + ' tab is ' + JSON.stringify(m));
          if (m && m.small) fails.push('TW-5 text under 12 px on the phone ' + tab + ' tab: ' + JSON.stringify(m.small));
          const b = page.locator('[data-hs-win="tower"] ' + (tab === 'climb' ? '.tt-go' : '.tc-use'));
          await b.scrollIntoViewIfNeeded().catch(() => {});
          const box = await b.boundingBox();
          if (!box || box.y < 0 || box.y + box.height > 423 || box.height < 36) fails.push('TW-5 the phone ' + tab + ' press is ' + JSON.stringify(box));
          if (shots) await page.screenshot({ path: join(shots, 'tower-' + tab + '-phone-922x423.png') });
        }
      }
      if (errors.length) fails.push('TW-5 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // TW-6
      const hunt = Object.assign(clone(BASE_ENV.hunt), { hunt_id: 'the_burning_tower' });
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, { env: Object.assign(clone(BASE_ENV), { hunt }),
        tower: section({ run: { session: SID, start: 21, top: 29, floors: 9, floor: 30 } }) });
      const bar = await wait(page, () => document.querySelector('.ht-tower:not([hidden]) .ht-floor')?.textContent === 'Floor 30, Keeper');
      if (!bar) fails.push('TW-6 the hunt bar on a landing reads ' + JSON.stringify(await page.evaluate(() => { const e = document.querySelector('.ht-tower'); return e && [e.hidden, e.textContent]; })));
      /* the climb ends: the Hearth spat the hero out on 30 with a Bronze Key from 20 */
      const ended = Object.assign(clone(hunt), { ended: true, session_id: SID, session: Object.assign({}, hunt.session || {}, { end_reason: 'died', ended_at: new Date().toISOString() }) });
      s.env = Object.assign(clone(BASE_ENV), { hunt: ended, death_log: [{ id: 1, at: new Date().toISOString(), hunt: 'the_burning_tower', session: SID, monster: 'rat', xp: 0, xp_lost: 0, saved: 0 }] });
      s.tower = section({ last: { session: SID, start: 21, top: 29, floors: 9, end_reason: 'died', ended_at: new Date().toISOString(), keys: [{ landing: 20, key: 'bronze' }] } });
      await replay(page);
      await page.keyboard.press('l');
      const card = await wait(page, () => /spat you out/.test(document.querySelector('.hsum-reason')?.textContent || ''), null, 8000);
      const got = await page.evaluate(() => ({ reason: document.querySelector('.hsum-reason')?.textContent || '', again: (() => { const b = document.querySelector('[data-hs-win="hunt-summary"] [data-hs-act="again"]'); return !b ? null : b.hidden ? 'hidden' : b.disabled ? 'off' : 'on'; })(),
        tower: (() => { const b = document.querySelector('[data-hs-win="hunt-summary"] [data-hs-act="tower"]'); return b && !b.hidden ? b.textContent : null; })(),
        death: !!document.querySelector('[data-hs-win="death"]') }));
      if (!card || !/^The Hearth spat you out on floor 30\. You lost no XP\. You climbed from floor 21 to floor 29\. You got a Bronze Key\./.test(got.reason) || /died/i.test(got.reason))
        fails.push('TW-6 the end card reads ' + JSON.stringify(got.reason));
      if (got.again !== 'hidden' || got.tower !== 'Open chest') fails.push('TW-6 the card\'s presses read ' + JSON.stringify(got));
      if (got.death) fails.push('TW-6 the death popup opened for the Tower');
      if (got.tower) {
        await page.evaluate(() => document.querySelector('[data-hs-win="hunt-summary"] [data-hs-act="tower"]').click());
        if (!(await wait(page, () => document.querySelector('[data-hs-win="tower"] [data-pane="chest"].is-on')))) fails.push('TW-6 Open chest opened no Chest tab');
      }
      /* "What happened": the page's own recorder words a fall in the Tower its own way, and a hunt's as ever (death-explain.js) */
      const falls = await page.evaluate(async () => {
        const src = Array.from(document.querySelectorAll('script[type="module"]')).map((e) => e.src).find((u) => u.includes('?v=')) || '';
        const v = src ? '?v=' + src.split('?v=')[1] : '';
        const R = await import(new URL('src/hunt-view/summary-recorder.js' + v, document.baseURI).href);
        const D = await import(new URL('src/hunt-view/death-explain.js' + v, document.baseURI).href);
        const evs = [{ id: 1, type: 'dmg', atMs: 9000, an: 'Gray Wolf', t: 7, amount: 42 }, { id: 2, type: 'death', atMs: 10000, u: 7, an: 'Ashby' }];
        const say = (hunt) => D.explainDeaths(evs, { whoOf: R.whoOf, words: R.fallWordsOf(hunt) }).deaths.map((d) => d.lines.join(' ')).join(' ');
        return { v, tower: say('the_burning_tower'), hunt: say('mill_cellar') };
      }).catch((e) => ({ error: String(e && e.message || e) }));
      if (!/^Ashby was spat out: 1 Gray Wolf hit \(42\)/.test(falls.tower || '') || /died|killing/i.test(falls.tower || '') || !/^Ashby died: /.test(falls.hunt || ''))
        fails.push('TW-6 a fall in What happened reads ' + JSON.stringify(falls));
      if (shots) await page.screenshot({ path: join(shots, 'tower-end-card-desktop-1440x900.png') });
      if (errors.length) fails.push('TW-6 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
  } finally {
    server.close();
  }
  /* the pure half (the tree's own parser, not a mutant's): what isn't the server's shape is dropped, never mended */
  const P = await import(pathToFileURL(join(ROOT, 'src/session/tower-sections.js')).href);
  const read = (sec) => P.towerOf({ read: (k) => (k === 'tower' ? sec : undefined) });
  if (read(null) !== null || read({ hunt: 'the_burning_tower' }) !== null) fails.push('TW-3 the parser invents a Tower from nothing');
  if (read(Object.assign(section(), { starts: [11, 1] })).starts.length !== 0) fails.push('TW-3 the parser takes an unsorted start list');
  return fails;
}

/* Each plants one defect the rules above exist for. [name, file, from, to] */
const MUTANTS = [
  ['the Havora door shows with the switch off', 'src/shell/windows/havora/index.js', "  prop(root.querySelector('.hv-tower'), 'hidden', !towerOf(cs));", "  prop(root.querySelector('.hv-tower'), 'hidden', false);"],
  ['the parser keeps a forged floor', 'src/session/tower-sections.js', '  const out = v.slice(0, max).map(pos);', '  const out = v.slice(0, max).map((f) => f);'],
  ['a dropped floor is still sent', 'src/shell/windows/tower.js', '  return sc.floor !== null && tw.starts.includes(sc.floor) ? sc.floor : tw.starts[tw.starts.length - 1];', '  return sc.floor !== null ? sc.floor : tw.starts[tw.starts.length - 1];'],
  ['Enter is on while hunting', 'src/shell/windows/tower.js', "  if (h && !h.ended) return t(h.huntId === tw.hunt ? 'tower.off_climbing' : 'tower.off_hunting', { name });", '  if (false) return \'\';'],
  ['a refusal is not re-read', 'src/session/tower-intents.js', "const RE_READS = Object.freeze(['bad_floor', ", "const RE_READS = Object.freeze(['nope', "],
  ['Use sends a stoke count of its own', 'src/session/tower-intents.js', 'p_count: count, p_stokes: null, p_idem: newIdem()', 'p_count: count, p_stokes: 1, p_idem: newIdem()'],
  ['the chance is the page\'s own', 'src/shell/windows/tower-chest.js', "t('tower.chance', { pct: ppmWords(k.chancePpm) })", "t('tower.chance', { pct: ppmWords(k.basePm * 1000) })"],
  ['Use is on while hunting', 'src/shell/windows/tower-chest.js', "  if (h && !h.ended) return t('tower.off_out', { name: nameOf(cs) || t('training.your_hero') });", '  if (false) return \'\';'],
  ['a key with no weapons opens', 'src/shell/windows/tower-chest.js', "  if (!k.ready) return t('tower.not_ready');", '  if (false) return \'\';'],
  ['Use all ignores the day', 'src/shell/windows/tower-chest.js', '  return Math.max(0, Math.min(k.heldAll, c.perCall, c.maxDay - c.today));', '  return Math.max(0, Math.min(k.heldAll, c.perCall));'],
  ['the death popup opens in the Tower', 'src/shell/death-popup.js', '  if (h.huntId === TOWER_RULES.hunt) return null;', '  if (false) return null;'],
  ['a Tower fall says died', 'src/hunt-view/summary-recorder.js', "  return hunt === TOWER_RULES.hunt ? { fell: (name) => t('tower.fell', { name }), blow: t('tower.fell_blow') } : undefined;", '  return undefined;'],
  ['the reveal is not the opened key\'s', 'src/shell/windows/tower-chest.js', "if (r.ok) sc.result = Object.assign({}, r, { key: k.key });", "if (r.ok) sc.result = Object.assign({}, r, { key: 'gold' });"],
  ['a repaint replays the reveal', 'src/shell/windows/tower-chest.js', '  if (SHOWN.get(host) === r) return;\n', '\n'],
  ['the bar never says Keeper', 'src/shell/widgets/tower-bar.js', "t(c.keeper ? 'tower.bar_keeper' : 'tower.bar_floor', { floor: c.floor })", "t('tower.bar_floor', { floor: c.floor })"],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'tower-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'tower-window: ' + fails.length + ' rule(s) RED'
      : 'tower-window: hidden with the switch off; the server\'s floors are the only picks and one start sends one floor; forged and stale floors never sent; the chest\'s odds are the server\'s and Use sends the saved stokes; off with why; a sheet on the phone; the climb\'s bar and end card in the Tower\'s words');
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
  console.log(bad ? 'tower-window --mutate: ' + bad + ' escaped' : 'tower-window --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
