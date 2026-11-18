#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/tower-window.mjs — THE BURNING TOWER ON SCREEN, IN A REAL CHROMIUM (lane/b-tower-window).
//
//   node tests/tower-window.mjs            the rules
//   node tests/tower-window.mjs --mutate   every planted defect must turn a named rule RED, each run in only its arm (`TW-4 …`)
//   node tests/tower-window.mjs --shots <dir>   also write the desktop (1440x900) and phone (922x423) screenshots
//
// mutant-anchors: src/shell/windows/tower.js src/shell/windows/tower-chest.js src/shell/tower-stage.js src/shell/tower-words.js src/shell/tower-end-card.js src/shell/windows/hunt-summary.js src/session/tower-sections.js src/session/tower-intents.js src/shell/windows/havora/index.js src/shell/death-popup.js src/shell/widgets/tower-bar.js src/hunt-view/summary-recorder.js src/data/shell-windows.js src/shell/back-in-town.js src/shell/windows/inventory/state.js src/shell/windows/inventory/actions.js src/shell/item-lore.js
//
// THE QA GATE (2026-11-17): the Town menu's Burning Tower line (only with the section) and one re-read each opening (TW-1, TW-2); the Story
// folds on a tab press and greets with Keeper Rowe (TW-2); the chest's "Weapon chance: 16%" (TW-4); a free fall upsells no Blessing and no
// "Defeated", a party member leaving is a label row, the floor clock never past its limit (TW-6); TW-9 THE KEY WARDEN IN THE BAG: Use on the
// strip, its tip's "Used for", the menu's two presses in one open menu, Sell and a "Super Rare" confirmation once owned.
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs); the hero is tests/fixtures/alpha-envelope.json
// ("Tyler", slot 0), with a `tower` section in the shape of 2027-04-28-tower-section.sql hr_tower_section (its `chest`: 2027-04-27-
// tower-chest.sql hr_chest_section, lane/c-key-ring's contract: families[], week_ends, held { bag, storage, ring }). The server half on the real chain is that file's §3, tests/tower-climb.mjs, tests/tower-chest.mjs and
// tests/envelope-contract.mjs; the whole loop on the real engine is tests/tower-world.mjs.
//   TW-1  SWITCH OFF: no `tower` section, so the Havora window's Hearth tab has no Tower door, no Tower window opens, the Hearth's tap row
//         falls back to the bag (shell-windows.js orElse), and no Tower verb is ever sent
//   TW-2  THE CLIMB (direction A "The Chimney", Tyler 2026-11-16): the tower drawn, a landing every 10th floor in its key's metal (the
//         server's key row), the dark above the best and only there, gold ticks to the next landing, you at your best and your party's
//         seats at theirs (the section's party), no rank and no rival with no field (a rank and rivals when it sends one; "#1,000+" and
//         the rivals when its place is past the board's depth, 2027-04-30-tower-board.sql `over`); the column
//         as label rows (Best Floor, Next Key = the server's key for the next landing, Kill XP, Death penalty, Uses, Time limit). A start
//         is picked by tapping a landing or in the Start Floor select, one pick, only the checkpoints the server lists (each said as the
//         floor the climb starts on; the highest picked; a landing over the record is no press); Enter sends ONE hr_tower_start naming
//         only the slot, the picked checkpoint (p_landing) and a key
//   TW-3  FORGED AND STALE: a checkpoint list that isn't the server's shape draws no pick and Enter stays off; a checkpoint picked then
//         dropped by the next envelope is never sent (the press takes the server's list again); a hunt running holds Enter off with why; a
//         party seat that does not lead holds it off (the leader's press starts every seat); a bad_landing refusal says so and re-reads
//   TW-4  THE CHEST: the firebox with THE CHEST ON THE LEDGE BESIDE THE FIRE, never over it (Tyler 2026-11-16 on mock A); a slot a key
//         row in its metal with the count held and its weapon chance (one not held is no press); the saved stokes as presses with their
//         Cinders, "Chance" = the server's chance_ppm; a stoke press saves the default (ONE hr_chest_stoke_default); Use sends ONE
//         hr_chest_open with p_stokes null (the saved default, never a number of the page's); Use all the server's own count; the answer's
//         reveal plays WHERE THE CHEST SITS and its weapon is drawn in the loot; Use off while out hunting, for a key whose weapons aren't
//         built; a key held on the Key Ring counts where it is
//   TW-8  LABELS, NOT SENTENCES (Tyler 2026-11-14 widened; 2026-11-16 "weird AI text"): every visible line of the Climb and Chest tabs and
//         the climb's end card is a label (no line ends in a period, none says "you"); a chest press that finds no weapon shows the loot
//         list only ("Hearth Cinders x50"), never "No weapon"
//   TW-7  KEY FAMILIES (Tyler 2026-11-16): "Opens left" (an ember a chest left), "Keys held: N / 30" and the week's reset are the server's family row and
//         week_ends (hr_chest_section); the week's cap holds Use off and clamps Use all; a family's cap is its own (a full catacomb week never
//         holds a Tower key), named by the server; with no family row the pane draws no cap line and gates nothing on it
//   TW-5  THE PHONE (922x423): the Tower window is a sheet inside the screen, the tower and its column side by side, nothing overflows
//         sideways, no text under 12 px, the chest still beside the fire in the phone's view of the scene, Enter and Use reachable
//   TW-6  A CLIMB RUNNING: the hunt bar says the floor (a landing says Keeper); a climb's end card draws the run on the tower (start to
//         top) and says spat out with the floors and the key as label rows, New Best +N only when the server's best_before says the climb
//         set the record, and then the board's Rank #N (+ heroes passed) and Passed <name> (last.board), never on a climb that set
//         none, never "died"; Open chest and Climb again open the Tower's tabs, Hunt again is off, and the death popup never opens for the Tower; its "What happened" (and Just now) says a fall in
//         the Tower's own words ("was spat out", "The last blow") while a hunt's still says "died"
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { judge, report, exitOf, cleanControl } from './_mutant-verdict.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';
import { menuLines, pressBar } from './_bar.mjs';
import { TOWER_ART, SCALE } from '../src/data/tower-art.js';
/* the reveal's frame lays the chest's frame centred on its foot (tools/world-art/tower-art.mjs): CSS px from the reveal's left to the chest's */
const REVEAL_IN = (TOWER_ART.CHEST_AT.x - TOWER_ART.REVEAL_AT.x) * SCALE;

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const TOWN = { hunt: null, state: Object.assign(clone(BASE_ENV.state), { active_kind: 'idle', active_id: null }) };
const DAY = 86400000;
const SID = '0a0a0a0a-0000-4000-8000-00000000c1b0';
const KEYS = [['bronze', 'tower_key_bronze', 'Bronze Key', 10, 160, 50, 'temper_salts', 15, 'cooked_shrimp', 20, 1],
  ['silver', 'tower_key_silver', 'Silver Key', 40, 80, 150, 'mithril_temper_salts', 25, 'cooked_lobster', 15, 2]];
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
    best_floor: o.best ?? 27, record: o.best ?? 27, checkpoints: o.checkpoints || [0, 10, 20],
    run: o.run || null, last: o.last || null, party: o.party || [],
    ...(o.field ? { field: o.field } : {}),
    chest: { on: true, dry: o.dry ?? 5, opens: 12, per_call: 20, own_pm: 500, own_family: 'bow', warmth_pm: o.warmth ?? 1200,
      week_ends: new Date(Date.now() + 3 * DAY).toISOString(), cinders: { bag: 300, storage: 100, ring: 0 },
      ...(o.families === null ? {} : { families: o.families || [fam('tower', o.opened ?? 2)] }),
      keys: KEYS.map(([key, item, name, from, pm, cin, salts, sq, food, fq, plus]) => ({ key, item, name, from, family: 'tower', skill_plus: plus,
        held: held[key] || { bag: 0, storage: 0, ring: 0 }, base_pm: pm, chance_ppm: key === 'bronze' ? (o.chance ?? 326400) : 96000, stokes_default: key === 'bronze' ? (o.stokes ?? 1) : 0,
        stokes: [{ n: 1, pm: 1700, cost: 3 * cin }, { n: 2, pm: 2500, cost: 7 * cin }, { n: 3, pm: 3300, cost: 12 * cin }],
        inside: { tower_cinders: cin, [salts]: sq, [food]: fq }, ready: o.notReady ? false : true,
        /* the super-rare outfit on every key (2027-04-27-tower-chest.sql hr_chest_outfits): the Key Warden, 0.2% Bronze, 0.3% Silver */
        outfits: [{ outfit: 'sweeps_coat', item: 'sweeps_coat_bundle', pm: key === 'bronze' ? 2 : 3 }] })) },
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
  const px = (el) => parseFloat(el.style.top);
  const stage = w.querySelector('.tt-climb-stage');
  /* the tower drawn: each landing's floor, its art row, its dark step; each label's words, tag, press; each marker; the dark bands */
  const lands = Array.from(stage.querySelectorAll('.tt-land')).map((l) => ({ floor: +l.getAttribute('data-key'), row: +l.style.getPropertyValue('--tr-row'), dark: l.getAttribute('data-dark') }));
  const labels = Array.from(stage.querySelectorAll('.tt-lbl')).map((b) => ({ floor: +b.getAttribute('data-landing'), y: px(b),
    words: Array.from(b.querySelector('.tt-l1').children).map((c) => c.textContent).filter(Boolean).join(' '), tag: b.querySelector('.tt-tag').hidden ? '' : b.querySelector('.tt-tag').textContent,
    press: b.tagName === 'BUTTON' && !b.disabled }));
  const marks = Array.from(stage.querySelectorAll('.tt-mk')).map((m) => m.getAttribute('data-who') + ':' + m.querySelector('b').textContent + ':' + m.querySelector('.tt-mk-who span').textContent);
  const darks = Array.from(stage.querySelectorAll('.tt-dark')).map((d) => ({ step: d.getAttribute('data-dark'), top: px(d), bottom: px(d) + parseFloat(d.style.height) }));
  const ticks = Array.from(stage.querySelectorAll('.tt-tick')).map((k) => (k.classList.contains('is-lit') ? 'lit' : 'dark'));
  const rows = Array.from(w.querySelectorAll('.tt-rules-box .tt-row')).filter((r) => !r.hidden).map((r) => r.querySelector('.tt-k').textContent + ': ' + r.querySelector('.tt-v').textContent);
  const next = w.querySelector('.tt-next');
  return { rows, starts: Array.from(w.querySelectorAll('.tt-start-pick option')).map((o) => o.value + (o.selected ? '*' : '')),
    optionText: Array.from(w.querySelectorAll('.tt-start-pick option')).map((o) => o.textContent), pane: w.querySelector('[data-pane="climb"]').textContent,
    best: w.querySelector('.tt-big').textContent, rank: w.querySelector('.tt-rank').hidden ? null : w.querySelector('.tt-rank').textContent,
    next: next.hidden ? null : next.querySelector('.tt-next-name').textContent + ' | ' + next.querySelector('.tt-next-floor').textContent + ' | ' + next.querySelector('.tt-key-ico').getAttribute('src'),
    pips: Array.from(w.querySelectorAll('.tt-pip')).map((p) => (p.classList.contains('is-on') ? 1 : 0)).join(''),
    lands, labels, marks, darks, ticks,
    startOn: (() => { const sel = w.querySelector('.tt-foot .tt-start-pick'); return sel ? sel.options[sel.selectedIndex]?.textContent || '' : null; })(), go: go.disabled ? 'off' : 'on', why: w.querySelector('.tt-off-why').textContent,
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
/* THE CHEST BESIDE THE FIRE, never over it, on whichever side the town map seats it (lane/fix137-hearth-chest-art moved it right of the
   firebox, where the town's chest stands), and both inside the scene's frame */
const besideFire = (sc) => !!sc.chest && !!sc.fire && !!sc.frame && (sc.chest.r <= sc.fire.l || sc.chest.l >= sc.fire.r)
  && [sc.chest, sc.fire].every((b) => b.l >= sc.frame.l && b.r <= sc.frame.r) && sc.chest.b <= sc.frame.b;
const chestView = (page) => page.evaluate(() => {
  const w = document.querySelector('[data-hs-win="tower"] [data-pane="chest"]');
  const tx = (q) => (w.querySelector(q) ? w.querySelector(q).textContent : null);
  const st = (q) => { const b = w.querySelector(q); return !b || b.hidden ? 'none' : b.disabled ? 'off' : 'on'; };
  const box = (q) => { const e = w.querySelector(q); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  /* the words of an element's own parts, one space between (a label and its value are two elements) */
  const words = (e) => Array.from(e.children).map((c) => c.textContent.trim()).filter(Boolean).join(' ');
  /* a slot a key row: its metal's word, the count held, the weapon chance, pressable, picked */
  const picks = Array.from(w.querySelectorAll('.tc-pick')).map((b) => b.querySelector('.tc-pick-name').textContent + ' ' + b.querySelector('.tc-pick-n').textContent
    + ' ' + b.querySelector('.tc-pick-pct').textContent + (b.disabled ? ' off' : '') + (b.getAttribute('aria-checked') === 'true' ? '*' : ''));
  const embers = (e) => Array.from(e.querySelectorAll('.tc-ember')).map((x) => (x.classList.contains('is-lit') ? 1 : 0)).join('');
  return { cinders: words(w.querySelector('.tc-cinders')), picks, icons: Array.from(w.querySelectorAll('.tc-pick-ico')).map((i) => i.getAttribute('src').split('/').pop()),
    tip: (w.querySelector('.tc-pick[aria-checked="true"]') || {}).title || '', warm: tx('.tc-warm .tt-v'),
    stokes: Array.from(w.querySelectorAll('.tc-stoke')).map((b) => words(b) + (b.getAttribute('aria-checked') === 'true' ? '*' : '')),
    stokeHead: tx('.tc-stoke-box .tt-hd'), chance: 'Chance: ' + tx('.tc-chance-v'),
    resets: tx('.tc-resets'), fams: Array.from(w.querySelectorAll('.tc-fam')).map((d) => [d.querySelector('.tc-fam-name')].concat(Array.from(d.querySelectorAll('.tc-fam-week, .tc-fam-held')))
      .filter((e) => !e.hidden && e.textContent).map((e) => (e.tagName === 'H4' ? e.textContent : words(e)) + (e.querySelector('.tc-embers') ? ' [' + embers(e) + ']' : '')).join(' | ')),
    result: w.querySelector('.tt-result').hidden ? null : Array.from(w.querySelectorAll('.tt-result .tc-used:not([hidden]), .tt-result .tc-loot-item')).map((e) => (e.tagName === 'P' ? e.textContent : words(e.querySelector('span')))).join(' | '),
    keysShown: !!w.querySelector('.tc-keys').getClientRects().length, hand: w.querySelector('.tc-hand').getClientRects().length ? tx('.tc-hand') : null,
    scene: { chest: box('.tc-chest'), fire: box('.tc-fire'), reveal: box('.tc-reveal'), frame: box('.tc-scene') },
    use: st('.tc-use'), all: st('.tc-use-all'), why: tx('.tc-off-why') };
});

/* THE ARMS (lane/fix135-ci-budget, release/v0.2.135 run 44118906758): the page half is eight arms, each its own context and sign-in
   on the one served tree, sharing nothing else. Every mutant ran all eight and the parser tail, ~107 s on a runner, so the 53 took
   ~95 min and in-page-25 was cancelled at its 47. A mutant runs only the arm its name starts with (`TW-4 …`): that arm's red is the
   red a whole run prints, since no arm reads another's state. It stops at its first red (hunt-screen's stopAtFirst), so the waits
   its defect leaves hanging cost nothing: the 53 took 6.1 min after the clean control (1.8), at the runner's pace. The plain run and
   the clean control run every arm, every rule and the tail. */
const ARMS = ['TW-1', 'TW-2', 'TW-3', 'TW-4', 'TW-7', 'TW-5', 'TW-6', 'TW-9'];
const armOf = (name) => ARMS.find((a) => name.startsWith(a + ' ')) || null;
const STOP = Symbol('first red');

async function checks(overrides, shots, { arm = null } = {}) {
  const fails = [];
  if (arm) fails.push = function (...a) { Array.prototype.push.apply(this, a); throw STOP; };
  const runs = (id) => !arm || arm === id;
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
    if (runs('TW-1')) { // TW-1
      const { ctx, page, errors, s, up } = await open({ width: 1440, height: 900 }, {});
      if (!up) fails.push('TW-1 the World never came up');
      const door = await havoraDoor(page);
      if (!door || !door.hidden || door.shown) fails.push('TW-1 with the switch off the Havora Tower door is ' + JSON.stringify(door));
      const fall = await page.evaluate(async () => {
        const v = document.querySelector('script[type=module][src*="?v="]')?.src.split('?v=')[1] || '';
        const sw = await import('/src/data/shell-windows.js?v=' + v), st = await import('/src/data/world/stations.js?v=' + v);
        const row = sw.SHELL_WINDOWS.find((r) => r.id === 'tower');
        return { tap: st.TAP_OPENS.great_hearth.window, section: row && row.section, orElse: row && row.orElse, key: row && row.key, launcher: row && row.launcher,
          group: row && row.group, label: row && row.label };
      });
      if (fall.tap !== 'tower' || fall.section !== 'tower' || fall.orElse !== 'inventory' || fall.key !== null || fall.launcher === false || fall.group !== 'town' || fall.label !== 'Burning Tower')
        fails.push('TW-1 the Hearth tap row is ' + JSON.stringify(fall));
      /* the Town menu offers the Tower only while the server sends its section */
      const town = await menuLines(page, 'town');
      if (!town.length || town.includes('tower')) fails.push('TW-1 with the switch off the Town menu reads ' + JSON.stringify(town));
      if (await page.evaluate(() => !!document.querySelector('[data-hs-win="tower"]'))) fails.push('TW-1 with the switch off a Tower window is open');
      if (verbs(s).length) fails.push('TW-1 with the switch off the page sent ' + verbs(s).map((c) => c.name));
      if (errors.length) fails.push('TW-1 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    if (runs('TW-2')) { // TW-2
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, { tower: section() });
      s.answer = (name) => (name === 'hr_tower_start' ? { ok: true, session_id: SID, landing: 10, floor: 11, checkpoints: [0, 10, 20] } : { ok: true });
      if (!(await openTower(page))) fails.push('TW-2 the Havora door opened no Tower window');
      else {
        let v = await climbView(page);
        /* the column: only what a player acts on, label and value (the mode's own pay, the rules), Best Floor, Next Key (the server's key
           row for the next landing) and a tick a floor toward it; no rank with no field */
        if (!v || v.rows.join(' | ') !== 'Kill XP: 37.5% | Death penalty: None | Uses: Stamina, supplies | Time limit: 3 min per floor'
          || /Floors: one room|Party: solo|Keys open|this week|60 floors|under your best/i.test(v.pane))
          fails.push('TW-2 the column rows read ' + JSON.stringify(v && v.rows));
        if (!v || v.best !== '27' || v.rank !== null || v.next !== 'Bronze Key | Floor 30 | assets/icons-bundle/pixel/items/tower_key_bronze.png' || v.pips !== '1111111000')
          fails.push('TW-2 Best Floor / Next Key read ' + JSON.stringify(v && [v.best, v.rank, v.next, v.pips]));
        if (!v || v.starts.join() !== '0,10,20*' || v.optionText.join() !== 'Floor 1,Floor 11,Floor 21') fails.push('TW-2 the Start Floor select reads ' + JSON.stringify(v && [v.starts, v.optionText]));
        if (!v || v.go !== 'on' || v.why || v.startOn !== 'Floor 21') fails.push('TW-2 Enter in town with a listed floor is ' + JSON.stringify(v && [v.go, v.why, v.startOn]));
        /* THE TOWER: a landing every 10th floor to a little past the best, each in its key's metal (Bronze from 10, Silver from 40, the
           foot plain), the dark over every landing above the best and none at or under it, the first band ending at the best's floor */
        const land = (f) => v.lands.find((l) => l.floor === f) || {};
        const lbl = (f) => v.labels.find((l) => l.floor === f) || {};
        if (!v || v.lands.map((l) => l.floor).join() !== '0,10,20,30,40,50,60' || land(0).row !== 4 || land(10).row !== 0 || land(30).row !== 0 || land(40).row !== 1)
          fails.push('TW-2 the landings read ' + JSON.stringify(v && v.lands));
        if (!v || v.lands.some((l) => (l.floor <= 27) === !!l.dark)) fails.push('TW-2 the dark is not exactly the floors over the best: ' + JSON.stringify(v && v.lands));
        if (!v || !v.darks.length || v.darks.find((d) => d.step === '1').bottom !== lbl(20).y - 7 * 8) fails.push('TW-2 the dark starts off the best: ' + JSON.stringify(v && [v.darks, lbl(20)]));
        if (!v || v.ticks.join() !== 'lit,lit,lit,lit,lit,lit,lit,dark,dark') fails.push('TW-2 the ticks to the next key read ' + JSON.stringify(v && v.ticks));
        /* each landing's words: its floor and metal, the picked start's tag, the next key's; only the server's checkpoints are presses */
        if (!v || lbl(10).words !== '10 Bronze' || lbl(40).words !== '40 Silver' || lbl(0).words !== '1' || lbl(20).tag !== 'Start 21' || lbl(30).tag !== 'Next key'
          || v.labels.filter((l) => l.press).map((l) => l.floor).sort((a, b) => a - b).join() !== '0,10,20')
          fails.push('TW-2 the landing words and presses read ' + JSON.stringify(v && v.labels));
        if (!v || v.marks.join() !== 'you:Tyler:27') fails.push('TW-2 the heroes on the tower read ' + JSON.stringify(v && v.marks));
        const bad = notLabels(await paneLines(page, 'climb'));
        if (bad.length) fails.push('TW-8 the Climb tab says sentences: ' + JSON.stringify(bad));
        if (shots) { await page.waitForTimeout(700); await page.screenshot({ path: join(shots, 'tower-climb-desktop-1440x900.png') }); }
        /* a start picked by tapping its landing: the select shows it, its tag moves; a landing over the record forged into a press picks nothing */
        await page.click('[data-hs-win="tower"] [data-hs-act="floor-pick"][data-landing="10"]');
        await wait(page, () => document.querySelector('[data-hs-win="tower"] .tt-start-pick')?.value === '10');
        await page.evaluate(() => { const b = document.querySelector('[data-hs-win="tower"] .tt-lbl[data-landing="30"]'); b.setAttribute('data-hs-act', 'floor-pick'); b.click(); });
        await page.waitForTimeout(200);
        v = await climbView(page);
        if (!v || v.startOn !== 'Floor 11' || lbl(10).tag !== 'Start 11' || lbl(20).tag !== '') fails.push('TW-2 a landing tapped picks ' + JSON.stringify(v && [v.startOn, lbl(10), lbl(20)]));
        await page.click('[data-hs-win="tower"] .tt-go');
        await wait(page, () => /^Climb started: /.test(document.querySelector('[data-hs-win="tower"] .hh-intent-msg')?.textContent || ''));
        const sent = verbs(s);
        if (sent.length !== 1 || sent[0].name !== 'hr_tower_start' || Object.keys(sent[0].body).sort().join() !== 'p_idem,p_landing,p_slot' || sent[0].body.p_landing !== 10 || sent[0].body.p_slot !== 0)
          fails.push('TW-2 Enter sent ' + JSON.stringify(sent));
        await page.click('[data-hs-win="tower"] [data-hs-act="story"]');
        const story = await page.evaluate(() => { const st = document.querySelector('[data-hs-win="tower"] .tt-story'); return !st.hidden && st.querySelectorAll('p').length; });
        if (story !== 5) fails.push('TW-2 the Story link shows ' + story + ' paragraphs');
        /* the Story is Keeper Rowe's ledge (Tyler 2026-11-16: Holly leads a faction); a tab press shows that tab, the Story folded away
           (QA gate 2026-11-17: it stayed drawn over Climb and Chest) */
        const words = await page.evaluate(() => document.querySelector('[data-hs-win="tower"] .tt-story').textContent);
        if (/Holly/.test(words) || !/Keeper Rowe tells you to mind the ash pile/.test(words)) fails.push('TW-2 the Story still greets with Holly');
        await page.click('[data-hs-win="tower"] .hw-tab[data-tab="chest"]');
        const folded = await wait(page, () => document.querySelector('[data-hs-win="tower"] .tt-story').hidden
          && document.querySelector('[data-hs-win="tower"] [data-pane="chest"].is-on'), null, 3000);
        if (!folded) fails.push('TW-2 the Story stays drawn after a tab press');
      }
      /* YOUR PARTY on the tower at the server's bests; the field (rank, rivals) only when the server sends one */
      s.tower = section({ party: [{ seat: 1, name: 'Mira', floor: 21, outfit: 'ranger' }] });
      await replay(page); await openTower(page);
      let v = await climbView(page);
      if (!v || v.marks.join() !== 'you:Tyler:27,party:Mira:21' || v.rank !== null) fails.push('TW-2 a party with no field reads ' + JSON.stringify(v && [v.marks, v.rank]));
      s.tower = section({ party: [{ seat: 1, name: 'Mira', floor: 21, outfit: 'ranger' }], field: { rank: 14, above: [{ name: 'Bram', floor: 63, outfit: 'berserker' }], below: [{ name: 'Ode', floor: 25 }] } });
      await replay(page); await openTower(page);
      v = await climbView(page);
      if (!v || v.marks.join() !== 'rival:Bram:63,you:Tyler:27,rival:Ode:25,party:Mira:21' || !/#14$/.test(v.rank || '')) fails.push('TW-2 the field reads ' + JSON.stringify(v && [v.marks, v.rank]));
      /* PAST THE BOARD'S DEPTH (2027-04-30-tower-board.sql: more heroes ahead than it counts to): the server's `over`, "#1,000+", rivals still drawn */
      s.tower = section({ field: { over: 1000, above: [{ name: 'Bram', floor: 29, at: '2026-11-15' }, { name: 'Ode', floor: 28 }], below: [{ name: 'Wren', floor: 27 }] } });
      await replay(page); await openTower(page);
      v = await climbView(page);
      if (!v || v.marks.join() !== 'rival:Bram:29,rival:Ode:28,you:Tyler:27,rival:Wren:27' || !/#1,000\+$/.test(v.rank || '')) fails.push('TW-2 a place past the depth reads ' + JSON.stringify(v && [v.marks, v.rank]));
      /* THE BEST ON A LANDING: the landing at the best is lit and only those over it dark (a best of 27 puts no landing at or just
         under it, so a dark begun a few floors low escaped every rule: lane/fix135-ci-budget) */
      s.tower = section({ best: 30, checkpoints: [0, 10, 20, 30] });
      await replay(page); await openTower(page);
      v = await climbView(page);
      if (!v || !v.lands.some((l) => l.floor === 30) || v.lands.some((l) => (l.floor <= 30) === !!l.dark)) fails.push('TW-2 with the best on a landing the dark reads ' + JSON.stringify(v && v.lands));
      /* THE TOWN MENU's line opens it (QA gate 2026-11-17: the Hearth click was its only door), and every opening re-reads the hero once:
         another player's climb moves the rank and rivals, which only the hero's own envelope states */
      await replay(page);
      const town = await menuLines(page, 'town');
      if (!town.includes('tower')) fails.push('TW-2 the Town menu has no Burning Tower line: ' + JSON.stringify(town));
      await page.waitForTimeout(400);
      const before = loads(s);
      await pressBar(page, 'tower').catch(() => {});
      if (!(await wait(page, () => document.querySelector('[data-hs-win="tower"] .tt-pane.is-on'), null, 4000))) fails.push('TW-2 the Town menu line opened no Tower window');
      for (let i = 0; i < 40 && loads(s) <= before; i++) await page.waitForTimeout(50);
      if (loads(s) <= before) fails.push('TW-2 opening the Tower window re-read nothing (' + before + ' -> ' + loads(s) + ')');
      if (errors.length) fails.push('TW-2 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    if (runs('TW-3')) { // TW-3
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
      await page.waitForTimeout(400);   // the opening's own re-read has landed: the count below is the refusal's
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
      if (!v || v.go !== 'off' || v.why !== 'Party leader only') fails.push('TW-3 a seat that does not lead reads ' + JSON.stringify(v && [v.go, v.why]));
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
    if (runs('TW-4')) { // TW-4
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
      /* the window still sliding in moves the scene (a --shots run measured the chest 16 px off the reveal): read it once it stands still */
      await page.waitForFunction(() => { const e = document.querySelector('[data-hs-win="tower"] .tc-chest'); if (!e) return false;
        const x = Math.round(e.getBoundingClientRect().left); const still = window.__tcX === x; window.__tcX = x; return still; }, null, { polling: 120, timeout: 3000 }).catch(() => {});
      let c = await chestView(page);
      /* THE SCENE: the chest on the ledge BESIDE the fire, never over it (Tyler 2026-11-16), both inside the scene */
      const sc0 = c.scene;
      if (!besideFire(sc0)) fails.push('TW-4 the chest is not on the ledge beside the fire: ' + JSON.stringify(sc0));
      /* a slot a key row the server lists, in its metal: held count and weapon chance; one not held is no press; the picked the one Use opens */
      if (c.picks.join() !== 'Bronze x3 Weapon chance: 16%*,Silver x0 Weapon chance: 8% off' || c.icons.join() !== 'tower_key_bronze.png,tower_key_silver.png' || c.cinders !== 'Hearth Cinders 400')
        fails.push('TW-4 the keys read ' + JSON.stringify([c.picks, c.icons, c.cinders]));
      if (c.warm !== 'x1.2' || c.stokes.join() !== 'None,x1 150*,x2 350,x3 600' || c.stokeHead !== 'Stoke' || c.chance !== 'Chance: 33%')
        fails.push('TW-4 the odds read ' + JSON.stringify([c.warm, c.stokes, c.stokeHead, c.chance]));
      if (c.tip !== 'Equipped type (Bow): 50%\nContents: Hearth Cinders x50, Tempering Salts x15, Cooked Shrimp x20\nWeapon bonus: +1 combat skill\nKey Warden: 0.2%')
        fails.push('TW-4 the key\'s inside reads ' + JSON.stringify(c.tip));
      if (c.use !== 'on' || c.all !== 'on') fails.push('TW-4 Use/Use all with keys in town read ' + JSON.stringify([c.use, c.all]));
      if (shots) { await page.waitForTimeout(700); await page.screenshot({ path: join(shots, 'tower-chest-desktop-1440x900.png') }); }
      await page.click('[data-hs-win="tower"] .tc-stoke[data-n="2"]');
      const saved = await wait(page, () => document.querySelector('[data-hs-win="tower"] .tc-chance-v')?.textContent === '48%');
      let sent = verbs(s);
      if (sent.length !== 1 || sent[0].name !== 'hr_chest_stoke_default' || Object.keys(sent[0].body).sort().join() !== 'p_idem,p_key,p_slot,p_stokes' || sent[0].body.p_stokes !== 2)
        fails.push('TW-4 a stoke press sent ' + JSON.stringify(sent));
      if (!saved) fails.push('TW-4 the chance after the save is not the server\'s re-read: ' + JSON.stringify((await chestView(page)).chance));
      await page.click('[data-hs-win="tower"] .tc-use');
      const drawn = await wait(page, () => document.querySelector('[data-hs-win="tower"] .tt-result .tt-found')?.textContent === 'Palisade Sword');
      sent = verbs(s).slice(1);
      if (sent.length !== 1 || sent[0].name !== 'hr_chest_open' || Object.keys(sent[0].body).sort().join() !== 'p_chest,p_count,p_idem,p_key,p_slot,p_stokes'
        || sent[0].body.p_stokes !== null || sent[0].body.p_count !== 1 || sent[0].body.p_key !== 'bronze' || sent[0].body.p_chest !== 'great_hearth') fails.push('TW-4 Use sent ' + JSON.stringify(sent));
      c = await chestView(page);
      if (!drawn || c.result !== 'Palisade Sword Sword +1 | Hearth Cinders x50 | Tempering Salts x15 | Cooked Shrimp x20' || c.keysShown || c.hand !== 'Bronze Key x3')
        fails.push('TW-4 the answer reads ' + JSON.stringify([c.result, c.keysShown, c.hand]));
      /* THE REVEAL, WHERE THE CHEST SITS: the opened key's own strip, its box over the shut chest's place (2 CSS px an art px), the weapon the
         server named rising in its column; a repaint never replays it */
      const reveal = () => page.evaluate(() => {
        const r = document.querySelector('[data-hs-win="tower"] .tc-scene .tc-reveal');
        const chest = r && r.querySelector('.tc-reveal-chest');
        return r ? { key: r.getAttribute('data-key'), weapon: r.classList.contains('has-weapon'), item: r.querySelector('.tc-reveal-item')?.getAttribute('src') || null,
          art: chest ? getComputedStyle(chest).backgroundImage : null, el: (window.__tcReveal = window.__tcReveal || r) === r } : null;
      });
      const rv = await reveal();
      const at = c.scene;
      if (!at.reveal || at.reveal.l + REVEAL_IN !== sc0.chest.l || at.reveal.b - 2 !== sc0.chest.b) fails.push('TW-4 the reveal does not play where the chest sits: ' + JSON.stringify([at.reveal, sc0.chest]));
      if (shots) { await page.waitForTimeout(1600); await page.screenshot({ path: join(shots, 'tower-chest-reveal-1440x900.png') }); }
      for (const tab of ['climb', 'chest']) { await page.click('[data-hs-win="tower"] .hw-tab[data-tab="' + tab + '"]'); await page.waitForTimeout(150); }
      const rv2 = await reveal();
      if (!rv || rv.key !== 'bronze' || !rv.weapon || rv.item !== 'assets/icons-bundle/pixel/items/palisade_sword.png' || !/chest-open-bronze\.png/.test(rv.art || '') || !rv2 || !rv2.el)
        fails.push('TW-4 the reveal reads ' + JSON.stringify({ rv, rv2 }));
      await page.click('[data-hs-win="tower"] .tc-use-all');
      await page.waitForTimeout(600);
      sent = verbs(s).slice(2);
      if (sent.length !== 1 || sent[0].body.p_count !== 3 || sent[0].body.p_stokes !== null) fails.push('TW-4 Use all sent ' + JSON.stringify(sent));
      /* three keys, no weapon: the loot list only (TW-8), never "No weapon" */
      await wait(page, () => /Keys used: 3/.test(document.querySelector('[data-hs-win="tower"] .tt-result')?.textContent || ''));
      c = await chestView(page);
      if (c.result !== 'Keys used: 3 | Hearth Cinders x150 | Tempering Salts x45 | Cooked Shrimp x60') fails.push('TW-8 a press with no weapon reads ' + JSON.stringify(c.result));
      /* TW-4c THE SUPER-RARE (the Key Warden, lane/c-sweeps-coat-drop): a key that finds the coat leads the loot with it, labelled Super
         Rare, and the reveal raises its bundle (has-outfit), all from the server's answer (opens[].outfit, its bundle in the haul) */
      await page.click('[data-hs-win="tower"] .tc-keys-back');
      s.answer = (name, body) => (name === 'hr_chest_open' ? { ok: true, count: 1, opens: [{ n: 17, stokes: 1, chance_ppm: 326400, weapon: null, outfit: 'sweeps_coat', bundle: 'sweeps_coat_bundle' }],
        haul: { sweeps_coat_bundle: 1, tower_cinders: 50, temper_salts: 15, cooked_shrimp: 20 }, cinders_spent: 150 } : { ok: true });
      await page.click('[data-hs-win="tower"] .tc-use');
      const coat = await wait(page, () => document.querySelector('[data-hs-win="tower"] .tt-result .tt-found')?.textContent === 'Key Warden');
      c = await chestView(page);
      const rvCoat = await page.evaluate(() => { const r = document.querySelector('[data-hs-win="tower"] .tc-scene .tc-reveal'); return r ? { outfit: r.classList.contains('has-outfit'), item: r.querySelector('.tc-reveal-item')?.getAttribute('src') || null } : null; });
      if (!coat || c.result !== 'Key Warden Super Rare | Hearth Cinders x50 | Tempering Salts x15 | Cooked Shrimp x20'
        || !rvCoat || !rvCoat.outfit || rvCoat.item !== 'assets/icons-bundle/pixel/items/sweeps_coat_bundle.png') fails.push('TW-4c a key that finds the coat reads ' + JSON.stringify([c.result, rvCoat]));
      const badChest = notLabels(await paneLines(page, 'chest'));
      if (badChest.length) fails.push('TW-8 the Chest tab says sentences: ' + JSON.stringify(badChest));
      /* Keys: back to the slots and the stokes, the answer gone */
      await page.click('[data-hs-win="tower"] .tc-keys-back');
      c = await chestView(page);
      if (c.result !== null || !c.keysShown || c.scene.reveal) fails.push('TW-4 Keys after an answer reads ' + JSON.stringify([c.result, c.keysShown, c.scene.reveal]));
      /* a key on the Key Ring counts where it is (lane/c-key-ring) */
      s.tower = section({ held: { bronze: { bag: 1, storage: 0, ring: 2 } } });
      await replay(page); await openTower(page, 'chest');
      c = await chestView(page);
      if (c.picks[0] !== 'Bronze x3 Weapon chance: 16%*' || c.use !== 'on') fails.push('TW-4 a key on the ring reads ' + JSON.stringify([c.picks, c.use]));
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
    if (runs('TW-7')) { // TW-7
      const st = { tower: section({ held: { bronze: { bag: 2, storage: 1, ring: 0 } } }) };
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, st);
      s.answer = (name, body) => (name === 'hr_chest_open' ? { ok: true, count: body.p_count, opens: [], haul: {}, cinders_spent: 0 } : { ok: true });
      await openTower(page, 'chest');
      let c = await chestView(page);
      /* one family: an ember a chest left this week, the count, keys held; no family name (the window's only family) */
      if (c.fams.join(' || ') !== 'Opens left 4 / 6 [111100] | Keys held 3 / 30' || !/^Week resets: /.test(c.resets || '')) fails.push('TW-7 the Tower family reads ' + JSON.stringify([c.fams, c.resets]));
      if (c.use !== 'on' || c.all !== 'on') fails.push('TW-7 Use/Use all with 4 chests left read ' + JSON.stringify([c.use, c.all]));
      /* one chest left of the week: Use on, Use all off (it would open past the server's week) */
      s.tower = section({ held: { bronze: { bag: 2, storage: 1, ring: 0 } }, opened: 5 });
      await replay(page); await openTower(page, 'chest');
      c = await chestView(page);
      if (c.use !== 'on' || c.all !== 'off' || c.fams[0] !== 'Opens left 1 / 6 [100000] | Keys held 3 / 30') fails.push('TW-7 with one chest left of the week Use/Use all read ' + JSON.stringify([c.use, c.all, c.fams]));
      /* the week used: Use off, why said, and an off press sends nothing */
      s.tower = section({ held: { bronze: { bag: 2, storage: 1, ring: 0 } }, opened: 6 });
      await replay(page); await openTower(page, 'chest');
      c = await chestView(page);
      if (c.use !== 'off' || c.why !== 'Weekly limit reached (6)' || c.fams[0] !== 'Opens left 0 / 6 [000000] | Keys held 3 / 30') fails.push('TW-7 at the week\'s cap reads ' + JSON.stringify([c.use, c.why, c.fams]));
      const n = verbs(s).length;
      await page.click('[data-hs-win="tower"] .tc-use', { force: true }).catch(() => {});
      await page.waitForTimeout(250);
      if (verbs(s).length !== n) fails.push('TW-7 an off Use at the week\'s cap sent ' + verbs(s).slice(n).map((x) => x.name));
      /* two families, each its own week: a full catacomb week (listed first) never holds a Tower key, and each row says its name */
      s.tower = section({ held: { bronze: { bag: 2, storage: 1, ring: 0 } }, families: [fam('catacomb', 6, 12), fam('tower', 1)] });
      await replay(page); await openTower(page, 'chest');
      c = await chestView(page);
      if (c.fams.join(' || ') !== 'Catacomb Keys | Opens left 0 / 6 [000000] | Keys held 12 / 30 || Tower Keys | Opens left 5 / 6 [111110] | Keys held 3 / 30')
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
    if (runs('TW-5')) { // TW-5
      const { ctx, page, errors } = await open({ width: 922, height: 423 }, { tower: section({ held: { bronze: { bag: 2, storage: 1, ring: 0 } } }) }, true);
      const measure = () => page.evaluate(() => {
        const w = document.querySelector('[data-hs-win="tower"]');
        if (!w) return null;
        const body = w.querySelector('[data-hs-body]') || w;
        let small = null, out = null;
        for (const e of w.querySelectorAll('*')) {
          const r = e.getBoundingClientRect();
          /* nothing drawn past the sheet's right edge or its tower's (a landing's words clipped on the phone) */
          const st = e.closest('.tt-stage');
          if (e.getClientRects().length && r.width && !e.closest('.tc-scene-art') && (r.right > innerWidth + 0.5 || (st && st !== e && r.right > st.getBoundingClientRect().right + 0.5)))
            out = out || { cls: String(e.className), text: e.textContent.trim().slice(0, 20), right: Math.round(r.right) };
          if (!e.childNodes.length || ![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
          const fs = parseFloat(getComputedStyle(e).fontSize);
          if (e.getClientRects().length && fs < 12 && (!small || fs < small.fs)) small = { fs, text: e.textContent.trim().slice(0, 30) };
        }
        const r = w.getBoundingClientRect();
        const stage = w.querySelector('.tt-climb-stage');
        return { left: Math.round(r.left), right: Math.round(r.right), over: body.scrollWidth - body.clientWidth, small, out, vw: innerWidth,
          stage: stage && stage.getClientRects().length ? Math.round(stage.getBoundingClientRect().width) : null };
      });
      if (!(await openTower(page))) fails.push('TW-5 the phone opened no Tower window');
      else {
        await page.waitForTimeout(600);
        for (const tab of ['climb', 'chest']) {
          await page.click('[data-hs-win="tower"] .hw-tab[data-tab="' + tab + '"]');
          await page.waitForTimeout(300);
          const m = await measure();
          if (!m || m.left < 0 || m.right > m.vw || m.over > 1 || m.out) fails.push('TW-5 the phone ' + tab + ' tab is ' + JSON.stringify(m));
          if (m && m.small) fails.push('TW-5 text under 12 px on the phone ' + tab + ' tab: ' + JSON.stringify(m.small));
          if (tab === 'climb' && (!m || !(m.stage >= 240))) fails.push('TW-5 the phone draws no tower beside its column: ' + JSON.stringify(m && m.stage));
          if (tab === 'chest') {
            const sc = (await chestView(page)).scene;
            if (!besideFire(sc)) fails.push('TW-5 the phone\'s scene loses the chest or the fire: ' + JSON.stringify(sc));
          }
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
    if (runs('TW-6')) { // TW-6
      const hunt = Object.assign(clone(BASE_ENV.hunt), { hunt_id: 'the_burning_tower' });
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, { env: Object.assign(clone(BASE_ENV), { hunt }),
        tower: section({ run: { session: SID, start: 21, top: 29, floors: 9, floor: 30 } }) });
      const bar = await wait(page, () => document.querySelector('.ht-tower:not([hidden]) .ht-floor')?.textContent === 'Floor 30, Keeper');
      if (!bar) fails.push('TW-6 the hunt bar on a landing reads ' + JSON.stringify(await page.evaluate(() => { const e = document.querySelector('.ht-tower'); return e && [e.hidden, e.textContent]; })));
      /* the climb ends: the Hearth spat the hero out on 33, past the old best (27), with a Bronze Key from landing 30 */
      const ended = Object.assign(clone(hunt), { ended: true, session_id: SID, session: Object.assign({}, hunt.session || {}, { end_reason: 'died', ended_at: new Date().toISOString() }) });
      /* no Blessing held, all three free at this Level: a hunt's card would offer Bless I, II and III and the death coach */
      const BLESS = { held: [], permille: 0, free_until: 30, tiers: [1, 2, 3].map((tier) => ({ tier, permille: 250 * tier, price: 0, held: false })) };
      s.env = Object.assign(clone(BASE_ENV), { hunt: ended, blessings: BLESS, death_log: [{ id: 1, at: new Date().toISOString(), hunt: 'the_burning_tower', session: SID, monster: 'rat', xp: 0, xp_lost: 0, saved: 0 }] });
      /* the climb's place on the board when it ended (2027-04-30-tower-board.sql last.board): #12, three heroes passed, the best of them Bram */
      const BOARD = { rank: 12, passed: 3, name: 'Bram' };
      const last = (bestBefore) => ({ session: SID, start: 21, top: 32, floors: 12, end_reason: 'died', ended_at: new Date().toISOString(), keys: [{ landing: 30, key: 'bronze' }], withheld: 1, best_before: bestBefore, board: BOARD });
      s.tower = section({ best: 32, checkpoints: [0, 10, 20, 30], last: last(27) });
      await replay(page);
      await page.keyboard.press('l');
      const cardOf = () => page.evaluate(() => {
        const w = document.querySelector('[data-hs-win="hunt-summary"]'), c = w && w.querySelector('.hsum-climb');
        if (!c || c.hidden) return null;
        const st = c.querySelector('.te-stage'), run = st.querySelector('.tt-run');
        const press = (a) => { const b = w.querySelector('[data-hs-act="' + a + '"]'); return !b ? null : b.hidden ? 'hidden' : (b.disabled ? 'off' : 'on') + (b.classList.contains('is-primary') ? '*' : '') + ':' + b.textContent; };
        return { rows: Array.from(c.querySelectorAll('.te-rows .tt-row')).map((r) => r.querySelector('.tt-k').textContent + ': ' + r.querySelector('.tt-v').textContent),
          keys: Array.from(c.querySelectorAll('.te-key')).map((k) => k.querySelector('.tt-next-name').textContent + ' | ' + k.querySelector('.tt-next-floor').textContent),
          labels: Array.from(st.querySelectorAll('.tt-lbl')).map((l) => (Array.from(l.querySelector('.tt-l1').children).map((c) => c.textContent).filter(Boolean).join(' ') + ' ' + (l.querySelector('.tt-tag').hidden ? '' : l.querySelector('.tt-tag').textContent)).trim()),
          marks: Array.from(st.querySelectorAll('.tt-mk')).map((m) => m.getAttribute('data-who') + ':' + m.querySelector('.tt-mk-who span').textContent),
          run: run.hidden ? null : Math.round(parseFloat(run.style.height)), text: c.textContent, reason: w.querySelector('.hsum-reason').hidden ? '' : w.querySelector('.hsum-reason').textContent,
          again: press('again'), tower: press('tower'), climb: press('tower-climb'), death: !!document.querySelector('[data-hs-win="death"]'),
          steps: Array.from(w.querySelectorAll('[data-hs-act="town"][data-step]')).map((b) => b.getAttribute('data-step')),
          next: (() => { const b = w.querySelector('[data-hs-act="coach-next"]'); return b && !b.hidden ? b.textContent : ''; })() };
      });
      const card = await wait(page, () => !!document.querySelector('[data-hs-win="hunt-summary"] .hsum-climb:not([hidden]) .te-rows .tt-row'), null, 8000);
      let got = await cardOf();
      /* the run drawn: 21 to 32 up the stack (12 floors at 8 CSS px), the hero at the top, New Best over the old best, the key's landing */
      if (!card || !got || got.rows.join(' | ') !== 'Best Floor: 32 (+5) | Rank: #12 (+3) | Passed: Bram | Floors cleared: 21 to 32 | Spat out: Floor 33 | XP lost: None | Key limit reached: 1 not dropped'
        || /died|\byou\b/i.test(got.text + got.reason)) fails.push('TW-6 the end card reads ' + JSON.stringify(got));
      if (!got || got.keys.join() !== 'Bronze Key x1 | Floor 30' || got.run !== 12 * 8 || got.marks.join() !== 'you:32'
        || got.labels.join(' | ') !== 'New Best | 30 Bronze | 27 Old best | 21 Start') fails.push('TW-6 the run on the tower reads ' + JSON.stringify(got && [got.keys, got.run, got.marks, got.labels]));
      if (!got || got.again !== 'hidden' || got.tower !== 'on:Open chest' || got.climb !== 'on:Climb again') fails.push('TW-6 the card\'s presses read ' + JSON.stringify(got));
      if (got && got.death) fails.push('TW-6 the death popup opened for the Tower');
      /* a fall that cost nothing (QA gate 2026-11-17): no Bless step and no "Defeated" coach, no hunt advice on the top line */
      if (!got || got.steps.includes('bless') || /Defeated/.test(got.next) || /gathering/i.test(got.reason)) fails.push('TW-6 a free fall upsells: ' + JSON.stringify(got && [got.steps, got.next, got.reason]));
      if (shots) { await page.evaluate(() => { const b = document.querySelector('[data-hs-win="hunt-summary"] .hs-win-body'); if (b) b.scrollTop = 0; }); await page.screenshot({ path: join(shots, 'tower-end-card-desktop-1440x900.png') }); }
      /* a climb that set no record (the server's best_before null): no New Best, no old best, no Rank or Passed (its board place is no news); with no key, Climb again is the press */
      s.tower = section({ best: 40, checkpoints: [0, 10, 20, 30, 40], last: Object.assign(last(null), { keys: [], withheld: 0 }) });
      await replay(page);
      await page.keyboard.press('l');
      await wait(page, () => !!document.querySelector('[data-hs-win="hunt-summary"] .hsum-climb:not([hidden]) .te-rows .tt-row'), null, 8000);
      got = await cardOf();
      if (!got || got.rows.join(' | ') !== 'Floors cleared: 21 to 32 | Spat out: Floor 33 | XP lost: None' || got.labels.join(' | ') !== '21 Start'
        || got.tower !== 'hidden' || got.climb !== 'on:Climb again') fails.push('TW-6 a climb that set no record reads ' + JSON.stringify(got));
      if (got && got.climb) {
        await page.evaluate(() => document.querySelector('[data-hs-win="hunt-summary"] [data-hs-act="tower-climb"]').click());
        if (!(await wait(page, () => document.querySelector('[data-hs-win="tower"] [data-pane="climb"].is-on')))) fails.push('TW-6 Climb again opened no Climb tab');
      }
      s.tower = section({ best: 32, checkpoints: [0, 10, 20, 30], last: last(27) });
      await replay(page);
      await page.keyboard.press('l');
      await wait(page, () => !!document.querySelector('[data-hs-win="hunt-summary"] [data-hs-act="tower"]:not([hidden])'), null, 8000);
      await page.evaluate(() => document.querySelector('[data-hs-win="hunt-summary"] [data-hs-act="tower"]').click());
      if (!(await wait(page, () => document.querySelector('[data-hs-win="tower"] [data-pane="chest"].is-on')))) fails.push('TW-6 Open chest opened no Chest tab');
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
      /* THE FLOOR CLOCK never reads past the floor's own limit, a floor's or a landing's (QA gate 2026-11-17: "3:03 left" on a three-minute
         floor, the prediction's next room standing a stair ahead of the clock it is read against): the page's own module, on the section */
      const clock = await page.evaluate(async (sec) => {
        const src = Array.from(document.querySelectorAll('script[type="module"]')).map((e) => e.src).find((u) => u.includes('?v=')) || '';
        const TB = await import(new URL('src/shell/widgets/tower-bar.js' + (src ? '?v=' + src.split('?v=')[1] : ''), document.baseURI).href);
        const NOW = 1000000;
        const at = (floor, ends) => TB.climbOf({ read: (k) => (k === 'tower' ? Object.assign({}, sec, { run: { session: sec.last.session, start: 21, top: floor - 1, floors: floor - 21, floor } }) : undefined),
          live: { tower: () => ({ floor, endsAtMs: ends }) }, timeline: { serverNowAt: () => NOW }, now: () => 0 }, { ended: false, huntId: 'the_burning_tower' });
        return [at(23, NOW + 183000), at(30, NOW + 604000), at(23, NOW + 61000)].map((c) => c && c.leftMs);
      }, s.tower).catch((e) => [String(e && e.message || e)]);
      if (clock.join() !== '180000,600000,61000') fails.push('TW-6 the floor clock reads ' + JSON.stringify(clock) + ' ms left (a floor 3 min, a landing 10)');
      /* A PARTY MEMBER LEFT (QA gate 2026-11-17: no reason at all, and "Start a gathering job" on top): a label row, no hunt advice */
      const SID2 = '0a0a0a0a-0000-4000-8000-00000000c1b1';
      const left = Object.assign(clone(ended), { session_id: SID2, session: Object.assign({}, ended.session, { end_reason: 'party_member_left' }) });
      s.env = Object.assign(clone(s.env), { hunt: left, death_log: [] });
      s.tower = section({ best: 40, checkpoints: [0, 10, 20, 30, 40], last: Object.assign(last(null), { session: SID2, end_reason: 'party_member_left', keys: [], withheld: 0 }) });
      await replay(page);
      await page.keyboard.press('l');
      await wait(page, () => /Party member left/.test(document.querySelector('[data-hs-win="hunt-summary"] .hsum-climb:not([hidden]) .te-rows')?.textContent || ''), null, 8000);
      const gone = await cardOf();
      if (!gone || gone.rows.join(' | ') !== 'Floors cleared: 21 to 32 | Ended: Party member left' || /gathering/i.test(gone.reason) || gone.steps.includes('bless'))
        fails.push('TW-6 a climb a party member left reads ' + JSON.stringify(gone && [gone.rows, gone.reason, gone.steps]));
      if (errors.length) fails.push('TW-6 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    if (runs('TW-9')) { // TW-9
      /* THE KEY WARDEN IN THE BAG (QA gate 2026-11-17: its strip offered only Sell, its tip "Used for: Sell it at the shop", and the menu's
         two-press Use shut between the presses): Use is the strip's press, the tip says what it unlocks, the menu's first Use asks again in
         place and the second sends ONE hr_outfit_bundle_use; once the server says the outfit is owned, Sell is the press and its
         confirmation names the Super Rare */
      const env = Object.assign(clone(BASE_ENV), clone(TOWN));
      env.inventory = Object.assign({}, env.inventory, { sweeps_coat_bundle: 1 });
      env.shop = clone(env.shop);
      env.shop.bids.sweeps_coat_bundle = 20000;
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, { env, tower: section() });
      const POCKET = '[data-hs-win="inventory"] .hw-pocket[data-item="sweeps_coat_bundle"]';
      const strip = () => page.evaluate(() => { const b = document.querySelector('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]'); return b && b.classList.contains('is-on') ? b.textContent : null; });
      await page.keyboard.press('b');
      if (!(await wait(page, (q) => document.querySelector(q), POCKET))) fails.push('TW-9 the bag shows no Key Warden bundle');
      else {
        await page.click(POCKET);
        await page.waitForTimeout(200);
        if ((await strip()) !== 'Use') fails.push('TW-9 the bundle\'s strip offers ' + JSON.stringify(await strip()));
        await page.hover(POCKET);
        await wait(page, () => /Used for/.test(document.querySelector('.hw-tip.is-on')?.textContent || ''), null, 3000);
        const used = await page.evaluate(() => Array.from(document.querySelectorAll('.hw-tip.is-on .hw-tip-line')).map((p) => p.textContent).find((x) => x.startsWith('Used for')) || '');
        if (used !== 'Used forUnlocks the Key Warden outfit for this hero') fails.push('TW-9 the bundle\'s tip reads ' + JSON.stringify(used));
        /* the menu: the first Use asks again on its own line and the menu stays; the second sends the one intent */
        await page.click(POCKET, { button: 'right' });
        await wait(page, () => document.querySelector('.hw-menu.is-on [data-hs-act="m-use"]'), null, 3000);
        await page.click('.hw-menu.is-on [data-hs-act="m-use"]');
        await page.waitForTimeout(250);
        const armed = await page.evaluate(() => { const b = document.querySelector('.hw-menu.is-on [data-hs-act="m-use"]'); return b ? b.textContent : null; });
        const usesBefore = s.calls.filter((c) => c.name === 'hr_outfit_bundle_use').length;
        if (armed !== 'Press again to unlock for good' || usesBefore !== 0) fails.push('TW-9 the menu\'s first Use reads ' + JSON.stringify([armed, usesBefore]));
        if (armed) await page.click('.hw-menu.is-on [data-hs-act="m-use"]');
        for (let i = 0; i < 40 && !s.calls.some((c) => c.name === 'hr_outfit_bundle_use'); i++) await page.waitForTimeout(50);
        const sent = s.calls.filter((c) => c.name === 'hr_outfit_bundle_use');
        if (sent.length !== 1 || Object.keys(sent[0].body).sort().join() !== 'p_idem,p_item,p_slot' || sent[0].body.p_item !== 'sweeps_coat_bundle')
          fails.push('TW-9 the menu\'s second Use sent ' + JSON.stringify(sent));
      }
      /* owned (the server's outfit section): Sell is the press, and the sale's confirmation names the Super Rare */
      s.env = Object.assign(clone(env), { outfit: { worn: null, owned: ['sweeps_coat'] } });
      await replay(page);
      if (!(await page.evaluate(() => !!document.querySelector('[data-hs-win="inventory"]')))) await page.keyboard.press('b');
      if (await wait(page, (q) => document.querySelector(q), POCKET)) {
        await page.click(POCKET);
        await page.waitForTimeout(200);
        const owned = await strip();
        if (owned !== 'Sell') fails.push('TW-9 an owned outfit\'s bundle offers ' + JSON.stringify(owned));
        else {
          await page.click('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]');
          await wait(page, () => document.querySelector('[data-hs-win="inventory"] .hw-confirm.is-on'), null, 3000);
          const note = await page.evaluate(() => document.querySelector('[data-hs-win="inventory"] .hw-confirm .hw-confirm-note')?.textContent || '');
          if (!/Super Rare: 1/.test(note)) fails.push('TW-9 the bundle\'s sale confirmation reads ' + JSON.stringify(note));
          if (s.calls.some((c) => c.name === 'hr-accrue' && /vendor_sell/.test(JSON.stringify(c.body)))) fails.push('TW-9 the bundle sold on one press');
        }
      } else fails.push('TW-9 after the reload the bag shows no bundle');
      if (errors.length) fails.push('TW-9 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
  } catch (e) {
    if (e !== STOP) throw e;
  } finally {
    server.close();
    await browser.close();
  }
  if (arm) return fails;
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
  /* the drawn climb's rows: a seat or rival with no name or floor is dropped; a field with no rank is no field; best_before kept as sent */
  const p = read(section({ party: [{ seat: 1, name: 'Mira', floor: 21 }, { seat: 2, floor: 9 }, { seat: 3, name: 'X', floor: -1 }], field: { above: [{ name: 'Bram', floor: 63 }] } }));
  if (p.party.map((x) => x.name + x.floor).join() !== 'Mira21' || p.field !== null) fails.push('TW-2 the parser keeps a hero or a field the server did not state: ' + JSON.stringify([p.party, p.field]));
  const lb = (bb) => read(section({ last: { session: SID, start: 21, top: 32, floors: 12, keys: [], best_before: bb } })).last.bestBefore;
  /* the board's place: an exact rank or a depth (over), never both and never neither; a climb's board needs its passed count, and names nobody when it passed nobody */
  const fld = (f) => read(section({ field: f })).field;
  if (fld({ rank: 3, over: 1000, above: [] }) !== null || fld({ over: 1000 })?.over !== 1000 || fld({ over: 1000 })?.rank !== null || fld({ rank: 0 }) !== null)
    fails.push('TW-2 the parser reads a board place as ' + JSON.stringify([fld({ rank: 3, over: 1000 }), fld({ over: 1000 }), fld({ rank: 0 })]));
  const bd = (b) => read(section({ last: { session: SID, start: 21, top: 32, floors: 12, keys: [], best_before: 27, board: b } })).last.board;
  if (bd({ rank: 4 }) !== null || bd({ rank: 4, passed: 0, name: 'Bram' })?.passedName !== null || bd({ over: 1000, passed: 2, name: 'Bram' })?.passedName !== 'Bram' || bd(null) !== null)
    fails.push('TW-6 the parser reads the last climb board as ' +JSON.stringify([bd({ rank: 4 }), bd({ rank: 4, passed: 0, name: 'Bram' }), bd({ over: 1000, passed: 2, name: 'Bram' })]));
  if (lb(27) !== 27 || lb(null) !== null || lb('27') !== null) fails.push('TW-6 the parser reads best_before as ' + JSON.stringify([lb(27), lb(null), lb('27')]));
  return fails;
}

/* Each plants one defect the rules above exist for. [name, file, from, to] */
const MUTANTS = [
  /* TW-4c, the Key Warden (lane/c-sweeps-coat-drop) */
  ['TW-4 a super-rare find is drawn as plain loot', 'src/shell/windows/tower-chest.js', '  const finds = r.opens.filter((o) => o.bundle);', '  const finds = [];'],
  ['TW-4 the reveal ignores the outfit', 'src/shell/windows/tower-chest.js', '  const bundle = r.opens.map((o) => o.bundle).find(Boolean) || null;', '  const bundle = null;'],
  ['TW-4 the open\'s answer drops the outfit', 'src/session/tower-intents.js', '    outfit: id(o.outfit), bundle: id(o.outfit) ? id(o.bundle) : null }));', '    outfit: null, bundle: null }));'],
  ['TW-4 the key tip hides the outfit\'s chance', 'src/session/tower-sections.js', '    outfits: Object.freeze(outfits),', '    outfits: Object.freeze([]),'],
  ['TW-1 the Havora door shows with the switch off', 'src/shell/windows/havora/index.js', "  prop(root.querySelector('.hv-tower'), 'hidden', !towerOf(cs));", "  prop(root.querySelector('.hv-tower'), 'hidden', false);"],
  ['TW-3 the parser keeps a forged checkpoint', 'src/session/tower-sections.js', '  const out = v.slice(0, max).map((x) => (Number.isSafeInteger(x) && x >= 0 ? x : null));', '  const out = v.slice(0, max);'],
  ['TW-3 a dropped checkpoint is still sent', 'src/shell/windows/tower.js', '  return sc.landing !== null && tw.checkpoints.includes(sc.landing) ? sc.landing : tw.checkpoints[tw.checkpoints.length - 1];', '  return sc.landing !== null ? sc.landing : tw.checkpoints[tw.checkpoints.length - 1];'],
  ['TW-2 the Start Floor picker defaults below the best', 'src/shell/windows/tower.js', '  return sc.landing !== null && tw.checkpoints.includes(sc.landing) ? sc.landing : tw.checkpoints[tw.checkpoints.length - 1];', '  return sc.landing !== null && tw.checkpoints.includes(sc.landing) ? sc.landing : tw.checkpoints[0];'],
  ['TW-3 a party seat that does not lead may press Enter', 'src/shell/windows/tower.js', "  if (party && !party.isLeader) return t('tower.off_leader');", '  if (false) return \'\';'],
  ['TW-3 Enter is on while hunting', 'src/shell/windows/tower.js', "  if (h && !h.ended) return t(h.huntId === tw.hunt ? 'tower.off_climbing' : 'tower.off_hunting');", '  if (false) return \'\';'],
  ['TW-3 a refusal is not re-read', 'src/session/tower-intents.js', "const RE_READS = Object.freeze(['bad_landing', ", "const RE_READS = Object.freeze(['nope', "],
  ['TW-4 Use sends a stoke count of its own', 'src/session/tower-intents.js', 'p_count: count, p_stokes: null, p_idem: newIdem()', 'p_count: count, p_stokes: 1, p_idem: newIdem()'],
  ['TW-4 the chance is the page\'s own', 'src/shell/windows/tower-chest.js', "k.chancePpm !== null ? ppmWords(k.chancePpm) : ''", "k.chancePpm !== null ? ppmWords(k.basePm * 1000) : ''"],
  ['TW-4 Use is on while hunting', 'src/shell/windows/tower-chest.js', "  if (h && !h.ended) return t('tower.off_hunting');", '  if (false) return \'\';'],
  ['TW-4 a key with no weapons opens', 'src/shell/windows/tower-chest.js', "  if (!k.ready) return t('tower.not_ready');", '  if (false) return \'\';'],
  ['TW-7 Use all ignores the family\'s week', 'src/shell/windows/tower-chest.js', '  if (f) n = Math.min(n, f.maxWeek - f.openedWeek);', '  if (false) n = 0;'],
  ['TW-7 Use is on at the family\'s weekly cap', 'src/shell/windows/tower-chest.js', "  if (f && f.openedWeek >= f.maxWeek) return t('tower.off_week', { max: f.maxWeek });", '  if (false) return \'\';'],
  ['TW-7 one family\'s week holds another\'s keys', 'src/session/tower-sections.js', 'tw.chest.families.find((f) => f.family === k.family)', 'tw.chest.families.find(() => true)'],
  ['TW-7 a cap line drawn with no family from the server', 'src/session/tower-sections.js', '(Array.isArray(c.families) ? c.families : [])', "(Array.isArray(c.families) ? c.families : [{ family: 'tower', opened: 0, max: 6 }])"],
  ['TW-6 the death popup opens in the Tower', 'src/shell/death-popup.js', '  if (h.huntId === TOWER_RULES.hunt) return null;', '  if (false) return null;'],
  ['TW-6 a Tower fall says died', 'src/hunt-view/summary-recorder.js', "  return hunt === TOWER_RULES.hunt ? { fell: (name) => t('tower.fell', { name }), blow: t('tower.fell_blow') } : undefined;", '  return undefined;'],
  ['TW-4 the reveal is not the opened key\'s', 'src/shell/windows/tower-chest.js', "if (r.ok) sc.result = Object.assign({}, r, { key: k.key });", "if (r.ok) sc.result = Object.assign({}, r, { key: 'gold' });"],
  ['TW-4 a repaint replays the reveal', 'src/shell/windows/tower-chest.js', '  if (SHOWN.get(host) === r) return;\n', '\n'],
  /* direction A (Tyler 2026-11-16): the tower drawn, the chest beside the fire, the reveal at the chest, the end card's run */
  ['TW-2 a landing over the record is a press', 'src/shell/tower-stage.js', '  const press = (l) => pressable && !!l.pickable;', '  const press = (l) => pressable;'],
  ['TW-2 a tapped landing the server did not list is picked', 'src/shell/windows/tower.js', '  if (!Number.isSafeInteger(l) || !tw.checkpoints.includes(l)) return false;', '  if (!Number.isSafeInteger(l)) return false;'],
  ['TW-2 the dark starts under the best', 'src/shell/tower-stage.js', '  let from = best;', '  let from = best - 2;'],
  ['TW-2 a landing at or under the best is drawn dark', 'src/shell/tower-stage.js', '(above <= 0 ? 0 : DARK.find', '(above < -5 ? 0 : DARK.find'],
  ['TW-2 a landing wears the wrong key\'s metal', 'src/shell/tower-stage.js', 'row: L === 0 ? PLAIN : landingRow(keyForLanding(tw, L))', 'row: L === 0 ? PLAIN : landingRow(keyForLanding(tw, L + 10))'],
  ['TW-2 the next key is the page\'s guess', 'src/shell/windows/tower.js', '  const k = next <= tw.rules.floorTop ? keyForLanding(tw, next) : null;', '  const k = next <= tw.rules.floorTop ? keyForLanding(tw, next + every) : null;'],
  ['TW-2 the party is not on the tower', 'src/shell/windows/tower.js', '  const seats = tw.party.map(', '  const seats = [].map('],
  ['TW-2 a rank is said with no field', 'src/shell/windows/tower.js', "  prop(rank, 'hidden', !tw.field);", "  prop(rank, 'hidden', false);"],
  ['TW-4 the chest sits over the fire', 'src/shell/windows/tower-chest.js', '`--tr-cx:${px(C.x)}`', '`--tr-cx:${px(F.x)}`'],
  ['TW-4 the reveal plays away from the chest', 'src/shell/windows/tower-chest.js', '`--tr-rx:${px(R.x)}`', '`--tr-rx:${px(R.x + 40)}`'],
  ['TW-5 the phone\'s view left on the west ledge, the chest cut off', 'src/shell/windows/tower-chest.js', '`--tr-pvx:${px(P.x)}`', '`--tr-pvx:${px(P.x - 100)}`'],
  ['TW-4 a stoke press sends the page\'s count', 'src/shell/windows/tower-chest.js', "    const n = Number(el.getAttribute('data-n'));", '    const n = 3;'],
  ['TW-6 New Best is said for a climb that set no record', 'src/shell/tower-words.js', '  const newBest = !!run && run.top !== null && run.bestBefore !== null && run.top > run.bestBefore;', '  const newBest = !!run && run.top !== null;'],
  ['TW-6 the end card draws no run', 'src/shell/tower-end-card.js', ' run: [r.start, top], lo:', ' run: null, lo:'],
  /* lane/c-tower-board: the board's place on the Climb tab and the end card */
  ['TW-2 a place past the depth reads as a rank', 'src/shell/tower-words.js', "p.rank !== null ? t('tower.rank_n', { rank: whole(p.rank) }) : t('tower.rank_over', { rank: whole(p.over) })", "t('tower.rank_n', { rank: whole(p.rank ?? p.over) })"],
  ['TW-6 the end card ranks a climb that set no record', 'src/shell/tower-words.js', '  const place = newBest ? run.board : null;', '  const place = run ? run.board : null;'],
  ['TW-6 the end card names nobody it passed', 'src/shell/tower-words.js', '  if (place && place.passedName) rows.push(', '  if (false) rows.push('],
  ['TW-6 the end card drops how many it passed', 'src/shell/tower-words.js', "v: place.passed > 0 ? t('tower.end_rank_up', { rank: rankWords(place), plus: whole(place.passed) }) : rankWords(place) });", 'v: rankWords(place) });'],
  ['TW-6 Open chest shows for a climb with no key', 'src/shell/windows/hunt-summary.js', "    prop(toTower, 'hidden', !climb || !tw || !climb.keys.length);", "    prop(toTower, 'hidden', !climb || !tw);"],
  /* the QA gate's polish (2026-11-17) */
  ['TW-6 QA: the floor clock runs past the floor\'s limit', 'src/shell/widgets/tower-bar.js', 'Math.min(limit, Math.max(0, live.endsAtMs - shown))', 'Math.max(0, live.endsAtMs - shown)'],
  ['TW-1 QA: the Tower has no Town menu line', 'src/data/shell-windows.js', "key: null, noShortcut: true, group: 'town', section: 'tower'", "key: null, noShortcut: true, launcher: false, section: 'tower'"],
  ['TW-2 QA: an opening reads nothing', 'src/shell/windows/tower.js', "if (!(h && !h.ended) && typeof cs.load === 'function') cs.load();", 'void h;'],
  ['TW-2 QA: the Story stays over a tab', 'src/shell/windows/tower.js', "sc.msg = ''; sc.story = false; sc.scrolled = false;", "sc.msg = ''; sc.scrolled = false;"],
  ['TW-4 QA: the chest\'s chance is a bare number', 'src/shell/windows/tower-chest.js', "t('tower.weapon_chance', { pct: ppmWords(k.basePm * 1000) })", 'ppmWords(k.basePm * 1000)'],
  ['TW-6 QA: a party member leaving says nothing', 'src/shell/tower-words.js', "Object.hasOwn(END_WORDS, card.reason)) rows.push(", 'false) rows.push('],
  ['TW-6 QA: a climb upsells the Blessings', 'src/shell/back-in-town.js', 'const free = !!h && h.ended && sessionModeOfHunt(h.huntId).deathLossPm === 0;', 'const free = false;'],
  ['TW-9 QA: the bundle\'s strip offers Sell', 'src/shell/windows/inventory/state.js', "  if (bundleOutfitOf(id) && !bundleUseBlock(st.cs, id)) return ['use', t('controls.use')];\n", ''],
  ['TW-9 QA: the bundle\'s tip says sell it', 'src/shell/item-lore.js', "out.push(t('item.outfit_unlocks', { outfit: OUTFIT_ROWS[it.outfit].label }));", 'void 0;'],
  ['TW-9 QA: the menu\'s first Use shuts the menu', 'src/shell/windows/inventory/actions.js', "if (btn) { text(btn, t('bag.bundle_confirm')); attr(btn, 'data-armed', 'true'); return; }", 'void btn;'],
  ['TW-9 QA: a super-rare sale is not named', 'src/shell/windows/inventory/state.js', "supers ? t('bag.confirm_super_rares', { count: supers }) : ''", "''"],
  ['TW-6 the bar never says Keeper', 'src/shell/widgets/tower-bar.js', "t(c.keeper ? 'tower.bar_keeper' : 'tower.bar_floor', { floor: c.floor })", "t('tower.bar_floor', { floor: c.floor })"],
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
  const clean = await cleanControl(() => checks(null));
  console.log(clean.line);
  if (clean.code) process.exit(clean.code);
  /* --mutant=<part of a name>: those alone (a lane proves its own) */
  const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
  const list = MUTANTS.filter(([name]) => !pick || name.includes(pick));
  const counts = { caught: 0, harness: 0, escaped: 0 };
  for (const [name, file, from, to] of list) {
    const arm = armOf(name);
    if (!arm) { console.log('  ✗ ' + name + ' — HARNESS: its name starts with no arm (' + ARMS.join(', ') + ')'); counts.harness++; continue; }
    const text = (await readFile(join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');
    if (text.split(from).length !== 2) { console.log('  ✗ ' + name + ' — HARNESS: anchor not found once in ' + file); counts.harness++; continue; }
    console.log(report(name, await judge(() => checks({ [file]: text.replace(from, () => to) }, null, { arm })), counts));
  }
  console.log(exitOf(counts) ? 'tower-window --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)'
    : 'tower-window --mutate: ' + list.length + '/' + list.length + ' mutants caught, each by a named rule in its own arm');
  process.exit(exitOf(counts));
}

main();
