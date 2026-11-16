#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/tower-window.mjs — THE BURNING TOWER ON SCREEN, IN A REAL CHROMIUM (lane/b-tower-window).
//
//   node tests/tower-window.mjs            the rules
//   node tests/tower-window.mjs --mutate   every planted defect must turn a rule RED
//   node tests/tower-window.mjs --shots <dir>   also write the desktop (1440x900) and phone (922x423) screenshots
//
// mutant-anchors: src/shell/windows/tower.js src/shell/windows/tower-chest.js src/session/tower-sections.js src/session/tower-intents.js src/shell/windows/havora/index.js src/shell/death-popup.js src/shell/widgets/tower-bar.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs); the hero is tests/fixtures/alpha-envelope.json
// ("Tyler", slot 0), with a `tower` section in the shape of 2027-04-28-tower-section.sql hr_tower_section (its `chest`: 2027-04-27-
// tower-chest.sql hr_chest_section, lane/c-key-ring's contract: families[], week_ends, held { bag, storage, ring }). The server half on the real chain is that file's §3, tests/tower-climb.mjs, tests/tower-chest.mjs and
// tests/envelope-contract.mjs; the whole loop on the real engine is tests/tower-world.mjs.
//   TW-1  SWITCH OFF: no `tower` section, so the Havora window's Hearth tab has no Tower door, no Tower window opens, the Hearth's tap row
//         falls back to the bag (shell-windows.js orElse), and no Tower verb is ever sent
//   TW-2  THE CLIMB: what the Tower is as label rows (the mode's own pay: kill XP, loot, death, stamina; the key drop), the Start Floor picker as ONE control (a select) whose
//         options are only the checkpoints the server lists, each said as the floor the climb starts on (the highest, the hero's best,
//         picked; Tyler 2026-11-16 CHECKPOINTS, and no "week starts under your best" words anywhere), the limits; Enter sends ONE
//         hr_tower_start naming only the slot, the picked checkpoint (p_landing) and a key
//   TW-3  FORGED AND STALE: a checkpoint list that isn't the server's shape draws no pick and Enter stays off; a checkpoint picked then
//         dropped by the next envelope is never sent (the press takes the server's list again); a hunt running holds Enter off with why; a
//         party seat that does not lead holds it off (the leader's press starts every seat); a bad_landing refusal says so and re-reads
//   TW-4  THE CHEST: the key held, where it is, its chance, the warmth, the saved stokes and their Cinders, "Chance" = the server's
//         chance_ppm; a stoke press saves the default (ONE hr_chest_stoke_default); Use sends ONE hr_chest_open with p_stokes null (the saved
//         default, never a number of the page's); Use all the server's own count; the answer's weapon drawn; Use off while out hunting, for a
//         key whose weapons aren't built; a key held on the Key Ring counts where it is
//   TW-8  LABELS, NOT SENTENCES (Tyler 2026-11-14 widened; 2026-11-16 "weird AI text"): every visible line of the Climb and Chest tabs and
//         the climb's end card is a label (no line ends in a period, none says "you"); a chest press that finds no weapon shows the loot
//         list only ("Hearth Cinders x50"), never "No weapon"
//   TW-7  KEY FAMILIES (Tyler 2026-11-16): "Opened this week: N / 6", "Keys held: N / 30" and the week's reset are the server's family row and
//         week_ends (hr_chest_section); the week's cap holds Use off and clamps Use all; a family's cap is its own (a full catacomb week never
//         holds a Tower key), named by the server; with no family row the pane draws no cap line and gates nothing on it
//   TW-5  THE PHONE (922x423): the Tower window is a sheet inside the screen, nothing overflows sideways, no text under 12 px, Enter reachable
//   TW-6  A CLIMB RUNNING: the hunt bar says the floor (a landing says Keeper); a climb's end card says spat out with the floors and the key,
//         never "died", Hunt again is off, and the death popup never opens for the Tower
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
/* The key families' rows as hr_chest_section answers them: Tower's week by default, none when null. */
const FAM_NAME = { tower: 'Tower', catacomb: 'Catacomb' };
const fam = (family, opened, held = 3) => ({ family, name: FAM_NAME[family], max: 6, held_max: 30, opened, held });
function section(o = {}) {
  const held = o.held || {};
  return {
    hunt: 'the_burning_tower',
    rules: { room_size: 5, landing_every: 10, floor_limit_ms: 180000, landing_limit_ms: 600000, floor_top: 300 },
    pays: { xp_pm: 375, coin: false, drops: false, bestiary: false, death_loss_pm: 0, blessings: false, stamina: true },
    best_floor: 27, record: 27, checkpoints: o.checkpoints || [0, 10, 20],
    run: o.run || null, last: o.last || null,
    chest: { on: true, dry: o.dry ?? 5, opens: 12, per_call: 20, own_pm: 500, own_family: 'bow', warmth_pm: o.warmth ?? 1200,
      week_ends: new Date(Date.now() + 3 * DAY).toISOString(), cinders: { bag: 300, storage: 100, ring: 0 },
      ...(o.families === null ? {} : { families: o.families || [fam('tower', o.opened ?? 2)] }),
      keys: KEYS.map(([key, item, name, from, pm, cin, salts, sq, food, fq, plus]) => ({ key, item, name, from, family: 'tower', skill_plus: plus,
        held: held[key] || { bag: 0, storage: 0, ring: 0 }, base_pm: pm, chance_ppm: key === 'bronze' ? (o.chance ?? 326400) : 96000, stokes_default: key === 'bronze' ? (o.stokes ?? 1) : 0,
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
    xp: w.querySelector('.tt-xp').textContent, starts: Array.from(w.querySelectorAll('.tt-start-pick option')).map((o) => o.value + (o.selected ? '*' : '')),
    pickers: w.querySelectorAll('[data-pane="climb"] select, [data-pane="climb"] [role="radiogroup"]').length, optionText: Array.from(w.querySelectorAll('.tt-start-pick option')).map((o) => o.textContent),
    note: w.querySelector('.tt-start-note').textContent, pane: w.querySelector('[data-pane="climb"]').textContent,
    best: w.querySelector('.tt-best').textContent,
    limits: w.querySelector('.tt-limits').textContent, startOn: (() => { const sel = w.querySelector('.tt-foot .tt-start-pick'); return sel ? sel.options[sel.selectedIndex]?.textContent || '' : null; })(), go: go.disabled ? 'off' : 'on', why: w.querySelector('.tt-off-why').textContent,
    msg: w.querySelector('.hh-intent-msg').textContent };
});
/* Every visible line of a pane (a leaf element with its own text): the label rule reads them all. */
const paneLines = (page, pane) => page.evaluate((p) => {
  const w = document.querySelector('[data-hs-win="tower"] [data-pane="' + p + '"]');
  if (!w) return null;
  return Array.from(w.querySelectorAll('*')).filter((e) => e.getClientRects().length && [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
    .map((e) => e.textContent.trim());
}, pane);
const notLabels = (lines) => (lines || []).filter((l) => /\.$/.test(l) || /\byour?\b/i.test(l) || /\. [A-Z]/.test(l));
const chestView = (page) => page.evaluate(() => {
  const w = document.querySelector('[data-hs-win="tower"] [data-pane="chest"]');
  const tx = (q) => (w.querySelector(q) ? w.querySelector(q).textContent : null);
  const st = (q) => { const b = w.querySelector(q); return !b || b.hidden ? 'none' : b.disabled ? 'off' : 'on'; };
  return { cinders: tx('.tc-cinders'), picks: Array.from(w.querySelectorAll('.tc-pick')).map((b) => b.textContent), have: tx('.tc-have'), where: tx('.tc-where'),
    base: tx('.tc-base'), warm: tx('.tc-warm'), stokes: Array.from(w.querySelectorAll('.tc-stoke')).map((b) => b.textContent + (b.getAttribute('aria-checked') === 'true' ? '*' : '')),
    stoked: tx('.tc-stoked'), saved: tx('.tc-stoke-saved'), chance: tx('.tc-chance'),
    resets: tx('.tc-resets'), fams: Array.from(w.querySelectorAll('.tc-fam')).map((d) => Array.from(d.querySelectorAll('h4, p')).filter((e) => !e.hidden && e.textContent).map((e) => e.textContent).join(' | ')), own: tx('.tc-own'), inside: tx('.tc-inside'), result: tx('.tt-result'),
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
      s.answer = (name) => (name === 'hr_tower_start' ? { ok: true, session_id: SID, landing: 10, floor: 11, checkpoints: [0, 10, 20] } : { ok: true });
      if (!(await openTower(page))) fails.push('TW-2 the Havora door opened no Tower window');
      else {
        const v = await climbView(page);
        /* no weekly EARN cap is said (Tyler 2026-11-16: the cap is chests opened per key family, the Chest tab's line) */
        if (!v || v.sum.join(' | ') !== 'Floors: one room each, harder each floor | Party: solo or party | Kill XP: 37.5% | Gold and loot: none | Death penalty: none | Uses: stamina and supplies | Key drop: every 10th floor | Keys open: the Hearth Chest')
          fails.push('TW-2 the summary rows read ' + JSON.stringify(v && v.sum));
        if (!v || v.xp !== 'Kill XP: 37.5%') fails.push('TW-2 the XP line reads ' + JSON.stringify(v && v.xp));
        if (!v || v.starts.join() !== '0,10,20*' || v.pickers !== 1 || v.optionText.join() !== 'Floor 1,Floor 11,Floor 21') fails.push('TW-2 the Start Floor picker reads ' + JSON.stringify(v && [v.starts, v.pickers, v.optionText]));
        if (!v || v.note !== 'Checkpoints: every 10th floor, up to Best Floor' || /under your best|cleared this week|60 floors/i.test(v.pane))
          fails.push('TW-2 the start words read ' + JSON.stringify(v && v.note));
        if (!v || v.best !== 'Best Floor: 27' || v.limits !== 'Time limit: 3 min per floor, 10 min per landing' || /this week|Keys to claim|Next landing/.test(v.pane)) fails.push('TW-2 the week reads ' + JSON.stringify(v));
        if (!v || v.go !== 'on' || v.why || v.startOn !== 'Floor 21') fails.push('TW-2 Enter in town with a listed floor is ' + JSON.stringify(v && [v.go, v.why, v.startOn]));
        const bad = notLabels(await paneLines(page, 'climb'));
        if (bad.length) fails.push('TW-8 the Climb tab says sentences: ' + JSON.stringify(bad));
        if (shots) { await page.waitForTimeout(700); await page.screenshot({ path: join(shots, 'tower-climb-desktop-1440x900.png') }); }
        await page.selectOption('[data-hs-win="tower"] .tt-start-pick', '10');
        await page.click('[data-hs-win="tower"] .tt-go');
        await wait(page, () => /^Climb started: /.test(document.querySelector('[data-hs-win="tower"] .hh-intent-msg')?.textContent || ''));
        const sent = verbs(s);
        if (sent.length !== 1 || sent[0].name !== 'hr_tower_start' || Object.keys(sent[0].body).sort().join() !== 'p_idem,p_landing,p_slot' || sent[0].body.p_landing !== 10 || sent[0].body.p_slot !== 0)
          fails.push('TW-2 Enter sent ' + JSON.stringify(sent));
        await page.click('[data-hs-win="tower"] [data-hs-act="story"]');
        const story = await page.evaluate(() => { const st = document.querySelector('[data-hs-win="tower"] .tt-story'); return !st.hidden && st.querySelectorAll('p').length; });
        if (story !== 5) fails.push('TW-2 the Story link shows ' + story + ' paragraphs');
      }
      if (errors.length) fails.push('TW-2 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // TW-3
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, { tower: section({ checkpoints: [0, 'x', 10] }) });
      await openTower(page);
      let v = await climbView(page);
      if (!v || v.starts.length !== 0 || v.go !== 'off' || v.why !== 'No start floor available') fails.push('TW-3 a forged start list reads ' + JSON.stringify(v));
      await page.click('[data-hs-win="tower"] .tt-go', { force: true }).catch(() => {});
      await page.waitForTimeout(300);
      if (verbs(s).length) fails.push('TW-3 an Enter that was off sent ' + verbs(s).map((c) => c.name));
      /* a floor picked, then dropped by the server (another device took the week's turn): the page sends what it saw once, the refusal
         re-reads, and the next press takes the server's list again, never the stale pick */
      s.tower = section({ checkpoints: [0, 10, 20] });
      await replay(page); await openTower(page);
      await page.selectOption('[data-hs-win="tower"] .tt-start-pick', '20');
      s.tower = section({ checkpoints: [0, 10] });
      s.answer = (name) => (name === 'hr_tower_start' ? { ok: false, error: 'bad_landing', checkpoints: [0, 10] } : { ok: true });
      const before = loads(s);
      await page.click('[data-hs-win="tower"] .tt-go');
      const said = await wait(page, () => /^Floor not available$/.test(document.querySelector('[data-hs-win="tower"] .hh-intent-msg')?.textContent || ''));
      if (!said) fails.push('TW-3 bad_floor reads ' + JSON.stringify((await climbView(page)).msg));
      if (loads(s) <= before) fails.push('TW-3 a bad_floor refusal did not re-read the character');
      await wait(page, () => document.querySelectorAll('[data-hs-win="tower"] .tt-start-pick option').length === 2);
      v = await climbView(page);
      if (!v || v.starts.join() !== '0,10*') fails.push('TW-3 after the server dropped 20 the picks read ' + JSON.stringify(v && v.starts));
      if (!(await page.click('[data-hs-win="tower"] .tt-go', { timeout: 2000 }).then(() => true, () => false))) fails.push('TW-3 after the drop Enter is off: ' + JSON.stringify(v && v.why));
      await page.waitForTimeout(500);
      const sent = verbs(s);
      if (sent.length !== 2 || sent[0].body.p_landing !== 20 || sent[1].body.p_landing !== 10) fails.push('TW-3 the presses around the drop sent ' + JSON.stringify(sent.map((x) => x.body.p_landing)));
      /* a party seat that does not lead: Enter off with why (the leader's press starts every seat); the leader's is on */
      const party = (selfSeat) => ({ id: '0a0a0a0a-0000-4000-8000-0000000a7a17', members: [{ seat: 0, name: 'Lead' }, { seat: 1, name: 'Tyler' }],
        self_seat: selfSeat, leader_seat: 0, max: 4 });
      s.env.party = party(1);
      await replay(page); await openTower(page);
      v = await climbView(page);
      if (!v || v.go !== 'off' || v.why !== 'Party leader only' || !/party's lowest Best Floor/.test(v.note)) fails.push('TW-3 a seat that does not lead reads ' + JSON.stringify(v && [v.go, v.why, v.note]));
      s.env.party = party(0);
      await replay(page); await openTower(page);
      v = await climbView(page);
      if (!v || v.go !== 'on') fails.push('TW-3 the party leader\'s Enter reads ' + JSON.stringify(v && [v.go, v.why]));
      delete s.env.party;
      /* a hunt running */
      s.env.hunt = clone(BASE_ENV.hunt);
      await replay(page); await openTower(page);
      v = await climbView(page);
      if (!v || v.go !== 'off' || v.why !== 'Not available while hunting') fails.push('TW-3 out hunting Enter reads ' + JSON.stringify(v && [v.go, v.why]));
      if (errors.length) fails.push('TW-3 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // TW-4
      const st = { tower: section({ held: { bronze: { bag: 2, storage: 1, ring: 0 } } }) };
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, st);
      s.answer = (name, body) => {
        if (name === 'hr_chest_stoke_default') { s.tower = section({ held: { bronze: { bag: 2, storage: 1, ring: 0 } }, stokes: body.p_stokes, chance: 480000 }); return { ok: true, key: body.p_key, stokes: body.p_stokes }; }
        /* one key finds the Palisade Sword; Use all's three find no weapon (the result is the loot list only) */
        if (name === 'hr_chest_open' && body.p_count === 1) return { ok: true, count: 1, opens: [{ n: 13, stokes: 1, chance_ppm: 326400, weapon: 'palisade_sword', family: 'sword' }],
          haul: { palisade_sword: 1, tower_cinders: 50, temper_salts: 15, cooked_shrimp: 20 }, cinders_spent: 150 };
        if (name === 'hr_chest_open') return { ok: true, count: body.p_count, opens: Array.from({ length: body.p_count }, (_, i) => ({ n: 14 + i, stokes: 1, chance_ppm: 326400, weapon: null })),
          haul: { tower_cinders: 50 * body.p_count, temper_salts: 15 * body.p_count, cooked_shrimp: 20 * body.p_count }, cinders_spent: 450 };
        return { ok: true };
      };
      await openTower(page, 'chest');
      let c = await chestView(page);
      if (c.cinders !== 'Hearth Cinders: 400' || c.picks.join() !== 'Bronze Key 3' || c.have !== 'Bronze Key: 3' || c.where !== 'Bag: 2, Storage: 1')
        fails.push('TW-4 the key reads ' + JSON.stringify(c));
      if (c.base !== 'Weapon chance: 16%' || c.warm !== 'Hearth\'s Warmth: x1.2'
        || c.stokes.join() !== 'None,Once*,Twice,3 times' || c.stoked !== 'Stoke cost: 150 Cinders (x1.7)' || c.saved !== 'Default for Bronze Key'
        || c.chance !== 'Chance: 33%')
        fails.push('TW-4 the odds read ' + JSON.stringify(c));
      if (c.own !== 'Equipped type (Bow): 50%' || c.inside !== 'Contents: Hearth Cinders x50, Tempering Salts x15, Cooked Shrimp x20')
        fails.push('TW-4 the inside reads ' + JSON.stringify([c.own, c.inside]));
      if (c.use !== 'on' || c.all !== 'on') fails.push('TW-4 Use/Use all with keys in town read ' + JSON.stringify([c.use, c.all]));
      if (shots) { await page.waitForTimeout(700); await page.screenshot({ path: join(shots, 'tower-chest-desktop-1440x900.png') }); }
      await page.click('[data-hs-win="tower"] .tc-stoke[data-stokes="2"]');
      const saved = await wait(page, () => /^Chance: 48%$/.test(document.querySelector('[data-hs-win="tower"] .tc-chance')?.textContent || ''));
      let sent = verbs(s);
      if (sent.length !== 1 || sent[0].name !== 'hr_chest_stoke_default' || Object.keys(sent[0].body).sort().join() !== 'p_idem,p_key,p_slot,p_stokes' || sent[0].body.p_stokes !== 2)
        fails.push('TW-4 a stoke press sent ' + JSON.stringify(sent));
      if (!saved) fails.push('TW-4 the chance after the save is not the server\'s re-read: ' + JSON.stringify((await chestView(page)).chance));
      await page.click('[data-hs-win="tower"] .tc-use');
      const drawn = await wait(page, () => document.querySelector('[data-hs-win="tower"] .tt-result .tt-found')?.textContent === 'Palisade Sword');
      sent = verbs(s).slice(1);
      if (sent.length !== 1 || sent[0].name !== 'hr_chest_open' || Object.keys(sent[0].body).sort().join() !== 'p_chest,p_count,p_idem,p_key,p_slot,p_stokes'
        || sent[0].body.p_stokes !== null || sent[0].body.p_count !== 1 || sent[0].body.p_key !== 'bronze' || sent[0].body.p_chest !== 'great_hearth') fails.push('TW-4 Use sent ' + JSON.stringify(sent));
      if (!drawn) fails.push('TW-4 the answer reads ' + JSON.stringify((await chestView(page)).result));
      await page.click('[data-hs-win="tower"] .tc-use-all');
      await page.waitForTimeout(600);
      sent = verbs(s).slice(2);
      if (sent.length !== 1 || sent[0].body.p_count !== 3 || sent[0].body.p_stokes !== null) fails.push('TW-4 Use all sent ' + JSON.stringify(sent));
      /* three keys, no weapon: the loot list only (TW-8), never "No weapon" */
      await wait(page, () => /Keys used: 3/.test(document.querySelector('[data-hs-win="tower"] .tt-result')?.textContent || ''));
      const loot = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="tower"] .tt-result > *')).map((e) => e.textContent));
      if (loot.join(' | ') !== 'Loot | Keys used: 3 | Hearth Cinders x150 | Tempering Salts x45 | Cooked Shrimp x60') fails.push('TW-8 a press with no weapon reads ' + JSON.stringify(loot));
      const badChest = notLabels(await paneLines(page, 'chest'));
      if (badChest.length) fails.push('TW-8 the Chest tab says sentences: ' + JSON.stringify(badChest));
      /* a key on the Key Ring counts where it is (lane/c-key-ring): the bag, Storage and the ring each said */
      s.tower = section({ held: { bronze: { bag: 1, storage: 0, ring: 2 } } });
      await replay(page); await openTower(page, 'chest');
      c = await chestView(page);
      if (c.picks.join() !== 'Bronze Key 3' || c.where !== 'Bag: 1, Key Ring: 2' || c.use !== 'on') fails.push('TW-4 a key on the ring reads ' + JSON.stringify([c.picks, c.where, c.use]));
      /* off: a key not built, out hunting */
      for (const [o, env, want] of [[{ notReady: true }, null, /^Not available yet$/], [{}, 'hunt', /^Not available while hunting$/]]) {
        s.tower = section(Object.assign({ held: { bronze: { bag: 2, storage: 1, ring: 0 } } }, o));
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
    { // TW-7
      const st = { tower: section({ held: { bronze: { bag: 2, storage: 1, ring: 0 } } }) };
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, st);
      s.answer = (name, body) => (name === 'hr_chest_open' ? { ok: true, count: body.p_count, opens: [], haul: {}, cinders_spent: 0 } : { ok: true });
      await openTower(page, 'chest');
      let c = await chestView(page);
      /* one family: its two lines, no family name (the window's only family) */
      if (c.fams.join(' || ') !== 'Opened this week: 2 / 6 | Keys held: 3 / 30' || !/^Week resets: /.test(c.resets || '')) fails.push('TW-7 the Tower family reads ' + JSON.stringify([c.fams, c.resets]));
      if (c.use !== 'on' || c.all !== 'on') fails.push('TW-7 Use/Use all with 4 chests left read ' + JSON.stringify([c.use, c.all]));
      /* one chest left of the week: Use on, Use all off (it would open past the server's week) */
      s.tower = section({ held: { bronze: { bag: 2, storage: 1, ring: 0 } }, opened: 5 });
      await replay(page); await openTower(page, 'chest');
      c = await chestView(page);
      if (c.use !== 'on' || c.all !== 'off') fails.push('TW-7 with one chest left of the week Use/Use all read ' + JSON.stringify([c.use, c.all, c.fams]));
      /* the week used: Use off, why said, and an off press sends nothing */
      s.tower = section({ held: { bronze: { bag: 2, storage: 1, ring: 0 } }, opened: 6 });
      await replay(page); await openTower(page, 'chest');
      c = await chestView(page);
      if (c.use !== 'off' || c.why !== 'Weekly limit reached (6)' || c.fams[0] !== 'Opened this week: 6 / 6 | Keys held: 3 / 30') fails.push('TW-7 at the week\'s cap reads ' + JSON.stringify([c.use, c.why, c.fams]));
      const n = verbs(s).length;
      await page.click('[data-hs-win="tower"] .tc-use', { force: true }).catch(() => {});
      await page.waitForTimeout(250);
      if (verbs(s).length !== n) fails.push('TW-7 an off Use at the week\'s cap sent ' + verbs(s).slice(n).map((x) => x.name));
      /* two families, each its own week: a full catacomb week (listed first) never holds a Tower key, and each row says its name */
      s.tower = section({ held: { bronze: { bag: 2, storage: 1, ring: 0 } }, families: [fam('catacomb', 6, 12), fam('tower', 1)] });
      await replay(page); await openTower(page, 'chest');
      c = await chestView(page);
      if (c.fams.join(' || ') !== 'Catacomb Keys | Opened this week: 6 / 6 | Keys held: 12 / 30 || Tower Keys | Opened this week: 1 / 6 | Keys held: 3 / 30')
        fails.push('TW-7 two families read ' + JSON.stringify(c.fams));
      if (c.use !== 'on' || c.all !== 'on') fails.push('TW-7 a full catacomb week holds the Tower key: ' + JSON.stringify([c.use, c.all, c.why]));
      /* no family row from the server (the chest lane's projection not landed): no cap line, nothing gated on a guessed 6 */
      s.tower = section({ held: { bronze: { bag: 2, storage: 1, ring: 0 } }, families: null });
      await replay(page); await openTower(page, 'chest');
      c = await chestView(page);
      if (c.fams.length || c.resets || c.use !== 'on' || c.all !== 'on') fails.push('TW-7 with no family row the pane reads ' + JSON.stringify([c.fams, c.resets, c.use, c.all]));
      if (errors.length) fails.push('TW-7 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // TW-5
      const { ctx, page, errors } = await open({ width: 922, height: 423 }, { tower: section({ held: { bronze: { bag: 2, storage: 1, ring: 0 } } }) }, true);
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
      s.tower = section({ last: { session: SID, start: 21, top: 29, floors: 9, end_reason: 'died', ended_at: new Date().toISOString(), keys: [{ landing: 20, key: 'bronze' }], withheld: 1 } });
      await replay(page);
      await page.keyboard.press('l');
      const card = await wait(page, () => /^Spat out/.test(document.querySelector('.hsum-reason')?.textContent || ''), null, 8000);
      const got = await page.evaluate(() => ({ reason: document.querySelector('.hsum-reason')?.textContent || '', again: (() => { const b = document.querySelector('[data-hs-win="hunt-summary"] [data-hs-act="again"]'); return !b ? null : b.hidden ? 'hidden' : b.disabled ? 'off' : 'on'; })(),
        tower: (() => { const b = document.querySelector('[data-hs-win="hunt-summary"] [data-hs-act="tower"]'); return b && !b.hidden ? b.textContent : null; })(),
        death: !!document.querySelector('[data-hs-win="death"]') }));
      if (!card || !got.reason.startsWith('Spat out: floor 30\nXP lost: none\nFloors cleared: 21 to 29\nKeys: Bronze Key\nKey limit reached: 1 not dropped') || /died|\byou\b/i.test(got.reason))
        fails.push('TW-6 the end card reads ' + JSON.stringify(got.reason));
      if (got.again !== 'hidden' || got.tower !== 'Open chest') fails.push('TW-6 the card\'s presses read ' + JSON.stringify(got));
      if (got.death) fails.push('TW-6 the death popup opened for the Tower');
      if (got.tower) {
        await page.evaluate(() => document.querySelector('[data-hs-win="hunt-summary"] [data-hs-act="tower"]').click());
        if (!(await wait(page, () => document.querySelector('[data-hs-win="tower"] [data-pane="chest"].is-on')))) fails.push('TW-6 Open chest opened no Chest tab');
      }
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
  if (read(Object.assign(section(), { checkpoints: [10, 0] })).checkpoints.length !== 0) fails.push('TW-3 the parser takes an unsorted checkpoint list');
  const fams = (list) => read(section({ families: list })).chest.families;
  if (fams([{ family: 'tower', opened: 2 }, { family: 'Tower!', opened: 1, max: 6 }]).length !== 0) fails.push('TW-7 the parser keeps a family row with no cap or a forged id');
  if (fams([fam('tower', 2), fam('tower', 0)]).map((x) => x.openedWeek).join() !== '2') fails.push('TW-7 the parser keeps a repeated family');
  const half = fams([{ family: 'tower', opened: 2, max: 6, held: 3 }])[0];
  if (!half || half.held !== null || half.maxHeld !== null) fails.push('TW-7 the parser draws keys held with no limit from the server: ' + JSON.stringify(half));
  return fails;
}

/* Each plants one defect the rules above exist for. [name, file, from, to] */
const MUTANTS = [
  ['the Havora door shows with the switch off', 'src/shell/windows/havora/index.js', "  prop(root.querySelector('.hv-tower'), 'hidden', !towerOf(cs));", "  prop(root.querySelector('.hv-tower'), 'hidden', false);"],
  ['the parser keeps a forged checkpoint', 'src/session/tower-sections.js', '  const out = v.slice(0, max).map((x) => (Number.isSafeInteger(x) && x >= 0 ? x : null));', '  const out = v.slice(0, max);'],
  ['a dropped checkpoint is still sent', 'src/shell/windows/tower.js', '  return sc.landing !== null && tw.checkpoints.includes(sc.landing) ? sc.landing : tw.checkpoints[tw.checkpoints.length - 1];', '  return sc.landing !== null ? sc.landing : tw.checkpoints[tw.checkpoints.length - 1];'],
  ['the Start Floor picker defaults below the best', 'src/shell/windows/tower.js', '  return sc.landing !== null && tw.checkpoints.includes(sc.landing) ? sc.landing : tw.checkpoints[tw.checkpoints.length - 1];', '  return sc.landing !== null && tw.checkpoints.includes(sc.landing) ? sc.landing : tw.checkpoints[0];'],
  ['a party seat that does not lead may press Enter', 'src/shell/windows/tower.js', "  if (party && !party.isLeader) return t('tower.off_leader');", '  if (false) return \'\';'],
  ['Enter is on while hunting', 'src/shell/windows/tower.js', "  if (h && !h.ended) return t(h.huntId === tw.hunt ? 'tower.off_climbing' : 'tower.off_hunting');", '  if (false) return \'\';'],
  ['a refusal is not re-read', 'src/session/tower-intents.js', "const RE_READS = Object.freeze(['bad_landing', ", "const RE_READS = Object.freeze(['nope', "],
  ['Use sends a stoke count of its own', 'src/session/tower-intents.js', 'p_count: count, p_stokes: null, p_idem: newIdem()', 'p_count: count, p_stokes: 1, p_idem: newIdem()'],
  ['the chance is the page\'s own', 'src/shell/windows/tower-chest.js', "t('tower.chance', { pct: ppmWords(k.chancePpm) })", "t('tower.chance', { pct: ppmWords(k.basePm * 1000) })"],
  ['Use is on while hunting', 'src/shell/windows/tower-chest.js', "  if (h && !h.ended) return t('tower.off_hunting');", '  if (false) return \'\';'],
  ['a key with no weapons opens', 'src/shell/windows/tower-chest.js', "  if (!k.ready) return t('tower.not_ready');", '  if (false) return \'\';'],
  ['Use all ignores the family\'s week', 'src/shell/windows/tower-chest.js', '  if (f) n = Math.min(n, f.maxWeek - f.openedWeek);', '  if (false) n = 0;'],
  ['Use is on at the family\'s weekly cap', 'src/shell/windows/tower-chest.js', "  if (f && f.openedWeek >= f.maxWeek) return t('tower.off_week', { max: f.maxWeek });", '  if (false) return \'\';'],
  ['one family\'s week holds another\'s keys', 'src/session/tower-sections.js', 'tw.chest.families.find((f) => f.family === k.family)', 'tw.chest.families.find(() => true)'],
  ['a cap line drawn with no family from the server', 'src/session/tower-sections.js', '(Array.isArray(c.families) ? c.families : [])', "(Array.isArray(c.families) ? c.families : [{ family: 'tower', opened: 0, max: 6 }])"],
  ['the death popup opens in the Tower', 'src/shell/death-popup.js', '  if (h.huntId === TOWER_RULES.hunt) return null;', '  if (false) return null;'],
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
