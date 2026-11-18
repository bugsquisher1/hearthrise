#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/catacombs-window.mjs — THE UNMARKED CATACOMBS ON SCREEN, IN A REAL CHROMIUM (lane/b-catacombs-client).
//
//   node tests/catacombs-window.mjs            the rules
//   node tests/catacombs-window.mjs --mutate   every planted defect must turn a named rule RED, each run in only its arm (`CT-2 …`)
//   node tests/catacombs-window.mjs --shots <dir>   also write the desktop (1440x900) and phone (922x423) screenshots
//
// mutant-anchors: src/shell/windows/tower.js src/shell/windows/tower-catacombs.js src/shell/windows/tower-chest.js src/shell/tower-words.js src/shell/death-popup.js src/hunt-view/summary-recorder.js src/hunt-view/summary-model.js src/session/catacomb-sections.js src/shell/windows/hunt-summary.js src/world/hunt-maps.js src/shell/widgets/tower-bar.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs); the hero is tests/fixtures/alpha-envelope.json ("Tyler",
// slot 0), with a `tower` section (tests/tower-window.mjs's shape) and a `catacomb` section in the shape of 2027-05-08-catacombs.sql
// hr_catacomb_section (its `chest`: hr_chest_section with both key families on). The server half on the real chain is tests/catacombs.mjs
// and tests/envelope-contract.mjs (the reader on the real section).
//   CT-1  SWITCH OFF: no `catacomb` section, so the Tower window draws no Catacombs tab, a forged tab press shows nothing, and no
//         hr_catacomb_start is ever sent; the section arriving shows it, and going away again takes it (the window falls back to Climb)
//   CT-2  THE TAB: the two wings the server lists (name, Deepest Room), the wing that ran last picked; the vault doors of the picked wing
//         top to bottom (the entrance, then a door every 10 rooms with the key the server's rows give in THAT wing, two past the deepest),
//         the start its last descent used picked (the server's last_start), only the wing's checkpoints are presses; the Start Room select
//         is the same pick; Deepest Room, Rank and Party Rank are the server's boards; the keys box says each family's week and the
//         Catacomb keys held; the last descent and the party as label rows; Enter sends ONE hr_catacomb_start naming only the slot, the
//         picked wing, the picked door and a key; a wing pressed moves the doors and the pick to that wing's own
//   CT-3  OFF WITH WHY: the section's gate under the Level holds Enter off ("Requires Level 10") and names the seat under it; no gate
//         from the server reads "Checking…"; a hunt running holds it off; a checkpoint list out of the server's shape is no start; a
//         catacomb_party_level refusal says the seat's numbers and re-reads the character
//   CT-4  THE CHEST: a Catacomb key pressed opens the Chest tab on it, the key family picked; its slot says "Armor chance", a key whose armor
//         is not in the chest says "Armor coming soon" (on the slot and on Use, which stays off and sends nothing); Use sends ONE
//         hr_chest_open for that key; an armor answer draws the piece with its slot and weight, the reveal in its metal
//   CT-5  A DESCENT ON THE HUNT BAR AND ITS END: the bar says the room ("Room 10, Keeper" on a vault door); a fall costs nothing: a descent that ended `died` opens no death popup, its card says "Carried up, no XP lost" and offers no Hunt
//         again (its start is the Catacombs tab), and "What happened" says "was carried up" (the Tower's "spat out" stays the Tower's)
//   CT-6  THE PHONE (922x423): the Tower window a sheet inside the screen, the Catacombs tab's wings, doors and Enter inside it, nothing
//         overflowing sideways, no text under 12 px
//   CT-7  THE WINGS' ROOMS: a descent watched routes to the Catacombs' own map (src/world/hunt-maps.js RUN_MAPS, the vault lane/a-catacomb-art
//         painted), while the staged 165-185 hunting ground on that map and its monsters route nowhere and every shipped map stays first
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { judge, report, exitOf, cleanControl } from './_mutant-verdict.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const TOWN = { hunt: null, state: Object.assign(clone(BASE_ENV.state), { active_kind: 'idle', active_id: null }) };
const DAY = 86400000;
const SID = '0a0a0a0a-0000-4000-8000-00000000cc01';
const FLOODED = 'unmarked_flooded_wing', BONE = 'unmarked_bone_wing';

/* THE CHEST as hr_chest_section answers it with both families on: the Tower's Bronze, then each wing's Bronze, Silver and Gold (Gold's
   armor not in the chest yet: ready false, the server's chest_not_ready). */
const fam = (family, name, opened, held) => ({ family, name, max: 6, held_max: family === 'tower' ? 30 : 120, per_hero: 30, opened, held, dry: 0, warmth_pm: 1000 });
const KEY = (key, family, item, name, from, ground, gear, helmet, ready) => ({ key, family, item, name, from, skill_plus: gear === 'weapon' ? 1 : 0, gear, ground,
  helmet_pm: helmet, base_pm: 160, chance_ppm: 160000, stokes_default: 0, stokes: [{ n: 1, pm: 1700, cost: 150 }],
  inside: { tower_cinders: 50 }, ready, outfits: [],
  armor: gear === 'armor' ? [{ slot: 'helmet', weight: 'heavy', item: 'tinkers_kettle' }] : null });
function chest(o = {}) {
  const held = o.held || {};
  const keys = [KEY('bronze', 'tower', 'tower_key_bronze', 'Bronze Key', 10, 'the_burning_tower', 'weapon', null, true),
    KEY('waterlogged_bronze', 'catacomb', 'waterlogged_key_bronze', 'Bronze Waterlogged Key', 10, FLOODED, 'armor', 300, true),
    KEY('waterlogged_silver', 'catacomb', 'waterlogged_key_silver', 'Silver Waterlogged Key', 40, FLOODED, 'armor', 300, true),
    KEY('bone_bronze', 'catacomb', 'bone_key_bronze', 'Bronze Bone Key', 10, BONE, 'armor', 700, true),
    KEY('bone_silver', 'catacomb', 'bone_key_silver', 'Silver Bone Key', 40, BONE, 'armor', 700, true),
    KEY('bone_gold', 'catacomb', 'bone_key_gold', 'Gold Bone Key', 70, BONE, 'armor', 700, false)]
    .map((k) => Object.assign(k, { held: held[k.key] || { bag: 0, storage: 0, ring: 0 } }));
  return { on: true, dry: 0, opens: 3, per_call: 20, own_pm: 500, own_family: 'bow', warmth_pm: 1000, week_ends: new Date(Date.now() + 3 * DAY).toISOString(),
    cinders: { bag: 400, storage: 0, ring: 0 }, families: [fam('catacomb', 'Catacomb', 2, 5), fam('tower', 'Tower', 1, 0)], keys };
}
/* The Tower's section (the window needs it: the Tower window is the Catacombs' home). */
const towerSection = (o = {}) => ({ hunt: 'the_burning_tower', rules: { room_size: 5, landing_every: 10, floor_limit_ms: 180000, landing_limit_ms: 600000, floor_top: 300 },
  pays: { xp_pm: 375, coin: false, drops: false, bestiary: false, death_loss_pm: 0, blessings: false, stamina: true },
  best_floor: 12, record: 12, checkpoints: [0, 10], run: null, last: null, party: [], chest: chest(o) });
/* The section as hr_catacomb_section answers it: the Bone Wing ran last (from door 10), deepest 23; the Flooded Wing deepest 41. */
function catSection(o = {}) {
  return {
    wings: o.wings || [{ wing: 'bone', hunt: BONE, name: 'Bone Wing', best: 23, record: 23, checkpoints: [0, 10, 20], last_start: 10 },
      { wing: 'flooded', hunt: FLOODED, name: 'Flooded Wing', best: 41, record: 41, checkpoints: [0, 10, 20, 30, 40], last_start: null }],
    last_wing: 'bone',
    rules: { room_size: 5, door_every: 10, room_limit_ms: 180000, door_limit_ms: 600000, room_top: 300 },
    gate: o.gate === null ? undefined : o.gate || { need: 10, level: 25, ok: true, short: [] },
    pays: { xp_pm: 375, coin: false, drops: false, bestiary: false, death_loss_pm: 0, blessings: false, stamina: true },
    run: null,
    last: { session: SID, wing: 'bone', start: 11, top: 23, floors: 13, end_reason: 'died', ended_at: new Date().toISOString(),
      keys: [{ door: 20, key: 'bone_bronze' }], withheld: 1, board: { rank: 7, passed: 2, name: 'Bram' } },
    party: o.party || [],
    field: { solo: { rank: 7, above: [], below: [] }, party: { over: 1000, above: [], below: [] } },
    chest: chest(o),
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
      env.tower = clone(s.tower);
      if (s.catacomb) env.catacomb = clone(s.catacomb); else delete env.catacomb;
      env.entry_gates = { tower: { need: 10, level: 25, ok: true, short: [] }, calls: {} };
      return json(env);
    }
    if (name === 'hr_put_client_state') { Object.assign(s.residue, body.p_patch || {}); return json({ ok: true }); }
    if (/^hr_(tower|chest|catacomb)_/.test(name)) return json(s.answer ? s.answer(name, body) : { ok: true });
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
const verbs = (s) => s.calls.filter((c) => /^hr_(tower|chest|catacomb)_/.test(c.name));
const loads = (s) => s.calls.filter((c) => c.name === 'hr_load').length;
/* The Tower window through the Havora window's Hearth door, then a tab (true when it is up). */
async function openTower(page, tab) {
  if (!(await page.evaluate(() => !!document.querySelector('[data-hs-win="havora"]')))) await page.keyboard.press('x');
  await wait(page, () => document.querySelector('[data-hs-win="havora"] .hv-tower:not([hidden])'));
  await page.click('[data-hs-win="havora"] [data-hs-act="tower"]');
  const up = await wait(page, () => document.querySelector('[data-hs-win="tower"] .tt-pane.is-on'));
  if (up && tab) {
    const shown = await page.evaluate((x) => { const b = document.querySelector('[data-hs-win="tower"] .hw-tab[data-tab="' + x + '"]'); return !!b && !b.hidden; }, tab);
    if (!shown) return false;
    await page.click('[data-hs-win="tower"] .hw-tab[data-tab="' + tab + '"]');
    return wait(page, (x) => document.querySelector('[data-hs-win="tower"] [data-pane="' + x + '"].is-on'), tab);
  }
  return up;
}
const tabView = (page) => page.evaluate(() => {
  const w = document.querySelector('[data-hs-win="tower"] [data-pane="catacomb"]');
  if (!w) return null;
  const words = (e) => Array.from(e.children).map((c) => c.textContent.trim()).filter(Boolean).join(' ');
  const rowsOf = (q) => Array.from(w.querySelectorAll(q + ' .tt-row')).filter((r) => !r.hidden && r.getClientRects().length).map((r) => r.querySelector('.tt-k').textContent + ': ' + r.querySelector('.tt-v').textContent);
  const go = w.querySelector('.tk-go'), sel = w.querySelector('.tk-start-pick');
  return {
    tab: (() => { const b = document.querySelector('[data-hs-win="tower"] .hw-tab[data-tab="catacomb"]'); return b ? (b.hidden ? 'hidden' : b.textContent) : null; })(),
    on: w.classList.contains('is-on'),
    wings: Array.from(w.querySelectorAll('.tk-wing')).map((b) => words(b.querySelector('.tk-wing-words')) + (b.getAttribute('aria-checked') === 'true' ? '*' : '')),
    doors: Array.from(w.querySelectorAll('.tk-door')).map((b) => [b.getAttribute('data-landing'), [b.querySelector('.tk-door-room').textContent, b.querySelector('.tk-door-key').textContent].filter(Boolean).join(' '),
      b.querySelector('.tk-door-tag').hidden ? '' : b.querySelector('.tk-door-tag').textContent, b.disabled ? 'off' : 'on',
      (b.querySelector('.tk-door-ico').hidden ? '' : b.querySelector('.tk-door-ico').getAttribute('src').split('/').pop())].join('|')),
    best: w.querySelector('.tk-big').textContent,
    ranks: Array.from(w.querySelectorAll('.tk-rank')).filter((r) => !r.hidden).map((r) => words(r)),
    fams: Array.from(w.querySelectorAll('.tk-fam')).map((d) => Array.from(d.children).filter((c) => !c.hidden).map((c) => (c.children.length ? words(c) : c.textContent)).join(' | ')),
    keys: Array.from(w.querySelectorAll('.tk-key')).map((b) => [b.querySelector('.tk-key-name'), b.querySelector('.tk-key-sub'), b.querySelector('.tk-key-open')].map((e) => e.textContent.trim()).filter(Boolean).join(' ')),
    noKeys: w.querySelector('.tk-no-keys').hidden ? '' : w.querySelector('.tk-no-keys').textContent,
    last: rowsOf('.tk-last-box'), party: rowsOf('.tk-party-box'), rules: rowsOf('.tk-rules-box'),
    starts: Array.from(sel.options).map((o) => o.textContent + (o.selected ? '*' : '')),
    go: go.disabled ? 'off' : 'on', why: w.querySelector('.tk-off-why').textContent, gate: Array.from(w.querySelectorAll('.tk-gate li')).map((li) => li.textContent),
    now: w.querySelector('.tk-now').hidden ? '' : w.querySelector('.tk-now').textContent,
    story: (() => { const b = document.querySelector('[data-hs-win="tower"] .tt-story-link'); return !!b && !b.hidden; })(),
    msg: document.querySelector('[data-hs-win="tower"] .hh-intent-msg').textContent,
  };
});
/* Every visible line of the tab (a leaf with its own text): labels, never sentences (tests/tower-window.mjs TW-8's rule). */
const notLabels = (page) => page.evaluate(() => {
  const w = document.querySelector('[data-hs-win="tower"] [data-pane="catacomb"]');
  return Array.from(w.querySelectorAll('*')).filter((e) => e.getClientRects().length && [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
    .map((e) => e.textContent.trim()).filter((l) => /\.$/.test(l) || /\byour?\b/i.test(l) || /\. [A-Z]/.test(l));
});

const ARMS = ['CT-1', 'CT-2', 'CT-3', 'CT-4', 'CT-5', 'CT-6', 'CT-7'];
const armOf = (name) => ARMS.find((a) => name.startsWith(a + ' ')) || null;
const STOP = Symbol('first red');

async function checks(overrides, shots, { arm = null } = {}) {
  const fails = [];
  if (arm) fails.push = function (...a) { Array.prototype.push.apply(this, a); throw STOP; };
  const runs = (id) => !arm || arm === id;
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const open = async (viewport, s0) => {
    const ctx = await browser.newContext({ viewport, hasTouch: false, isMobile: false });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = Object.assign({ env: Object.assign(clone(BASE_ENV), clone(TOWN)), version: 1, calls: [], residue: {}, tower: towerSection(), catacomb: null, answer: null }, s0);
    await stub(page, s);
    const up = await signInAndPlay(page, 'http://127.0.0.1:' + port);
    return { ctx, page, errors, s, up };
  };
  try {
    if (runs('CT-1')) { // CT-1
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, {});
      if (!(await openTower(page))) fails.push('CT-1 the Tower window never opened');
      let v = await tabView(page);
      if (!v || v.tab !== 'hidden' || v.on) fails.push('CT-1 with the switch off the Catacombs tab reads ' + JSON.stringify(v && [v.tab, v.on]));
      /* a forged press on the hidden tab shows nothing and sends nothing */
      await page.evaluate(() => document.querySelector('[data-hs-win="tower"] .hw-tab[data-tab="catacomb"]').click());
      await page.evaluate(() => { const b = document.querySelector('[data-hs-win="tower"] .tk-go'); b.disabled = false; b.click(); });
      await page.waitForTimeout(250);
      v = await tabView(page);
      if (!v || v.on || verbs(s).length) fails.push('CT-1 a forged press with the switch off shows ' + JSON.stringify(v && v.on) + ' and sent ' + verbs(s).map((c) => c.name));
      /* the section arrives: the tab shows; it goes away again: the tab is gone and the window is on Climb */
      s.catacomb = catSection();
      await replay(page);
      if (!(await openTower(page, 'catacomb'))) fails.push('CT-1 with the section the Catacombs tab never opened');
      v = await tabView(page);
      if (!v || v.tab !== 'Catacombs' || !v.on) fails.push('CT-1 with the section the tab reads ' + JSON.stringify(v && [v.tab, v.on]));
      s.catacomb = null;
      await replay(page);
      await openTower(page);
      v = await tabView(page);
      const climb = await page.evaluate(() => !!document.querySelector('[data-hs-win="tower"] [data-pane="climb"].is-on'));
      if (!v || v.tab !== 'hidden' || v.on || !climb) fails.push('CT-1 the switch going off leaves the tab ' + JSON.stringify(v && [v.tab, v.on, climb]));
      if (errors.length) fails.push('CT-1 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    if (runs('CT-2')) { // CT-2
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 },
        { catacomb: catSection({ held: { bone_bronze: { bag: 2, storage: 1, ring: 0 }, bone_gold: { bag: 1, storage: 0, ring: 0 } }, party: [{ seat: 1, name: 'Bram', best: { bone: 19, flooded: 0 }, outfit: null }] }) });
      s.answer = (name) => (name === 'hr_catacomb_start' ? { ok: true, session_id: SID, wing: 'bone', landing: 20, floor: 21, checkpoints: [0, 10, 20] } : { ok: true });
      if (!(await openTower(page, 'catacomb'))) fails.push('CT-2 the Catacombs tab never opened');
      let v = await tabView(page);
      /* the wings: the server's two, the one that ran last picked */
      if (!v || v.wings.join(' || ') !== 'Bone Wing Deepest Room: 23* || Flooded Wing Deepest Room: 41') fails.push('CT-2 the wings read ' + JSON.stringify(v && v.wings));
      /* the Bone Wing's doors: the entrance, then 10, 20, 30, 40 (two past the deepest 23), each with the BONE key its rows give, the last
         descent's start (door 10) picked, the first door past the deepest the next key, only the wing's checkpoints pressable */
      const DOORS = ['0|Room 1 Entrance||on|', '10|Room 10 Bronze Bone Key|Start 11|on|bone_key_bronze.png', '20|Room 20 Bronze Bone Key||on|bone_key_bronze.png',
        '30|Room 30 Bronze Bone Key|Next key|off|bone_key_bronze.png', '40|Room 40 Silver Bone Key||off|bone_key_silver.png'];
      if (!v || v.doors.join(' / ') !== DOORS.join(' / ')) fails.push('CT-2 the Bone Wing\'s doors read ' + JSON.stringify(v && v.doors));
      if (!v || v.starts.join() !== 'Room 1,Room 11*,Room 21' || v.go !== 'on' || v.why) fails.push('CT-2 the Start Room and Enter read ' + JSON.stringify(v && [v.starts, v.go, v.why]));
      /* the column: the boards, each family's week, the keys held, the last descent, the party, the rules */
      if (!v || v.best !== '23' || v.ranks.join() !== 'Rank #7,Party Rank #1,000+') fails.push('CT-2 Deepest Room and the boards read ' + JSON.stringify(v && [v.best, v.ranks]));
      if (!v || v.fams.join(' || ') !== 'Catacomb Keys | Opens left 4 / 6 | Keys held 5 / 120 || Tower Keys | Opens left 5 / 6 | Keys held 0 / 30')
        fails.push('CT-2 the key families read ' + JSON.stringify(v && v.fams));
      if (!v || v.keys.join(' || ') !== 'Bronze Bone Key x3 Open chest || Gold Bone Key x1 Armor coming soon Open chest') fails.push('CT-2 the keys held read ' + JSON.stringify(v && v.keys));
      if (!v || v.last.join(' | ') !== 'Wing: Bone Wing | Rooms cleared: 11 to 23 | Keys: Bronze Bone Key x1 | Key limit reached: 1 not dropped | Rank: #7')
        fails.push('CT-2 the last descent reads ' + JSON.stringify(v && v.last));
      if (!v || v.party.join() !== 'Bram: Room 19') fails.push('CT-2 the party reads ' + JSON.stringify(v && v.party));
      if (!v || v.rules.join(' | ') !== 'Kill XP: 37.5% of hunting | Death penalty: None | Uses: Stamina, supplies | Time limit: 3 min per room | Vault door time limit: 10 min')
        fails.push('CT-2 the rules read ' + JSON.stringify(v && v.rules));
      if (!v || v.story) fails.push('CT-2 the Tower\'s Story link shows on the Catacombs tab');
      const bad = await notLabels(page);
      if (bad.length) fails.push('CT-2 the tab says sentences: ' + JSON.stringify(bad));
      if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: join(shots, 'catacombs-tab-desktop-1440x900.png') }); }
      /* a door pressed picks it (the select follows); a door past the record forged into a press picks nothing */
      await page.click('[data-hs-win="tower"] .tk-door[data-landing="20"]');
      await wait(page, () => document.querySelector('[data-hs-win="tower"] .tk-start-pick')?.value === '20');
      await page.evaluate(() => { const b = document.querySelector('[data-hs-win="tower"] .tk-door[data-landing="30"]'); b.disabled = false; b.click(); });
      await page.waitForTimeout(200);
      v = await tabView(page);
      if (!v || v.starts.join() !== 'Room 1,Room 11,Room 21*') fails.push('CT-2 a door pressed picks ' + JSON.stringify(v && v.starts));
      /* the other wing: its own doors (its Waterlogged keys), its own deepest, its own checkpoints (no last start: the deepest door) */
      await page.click('[data-hs-win="tower"] .tk-wing[data-wing="flooded"]');
      await wait(page, () => document.querySelector('[data-hs-win="tower"] .tk-wing[data-wing="flooded"]')?.getAttribute('aria-checked') === 'true');
      v = await tabView(page);
      if (!v || v.best !== '41' || v.starts.join() !== 'Room 1,Room 11,Room 21,Room 31,Room 41*' || !v.doors.some((d) => d === '40|Room 40 Silver Waterlogged Key|Start 41|on|waterlogged_key_silver.png')
        || v.party.join() !== 'Bram: None') fails.push('CT-2 the Flooded Wing reads ' + JSON.stringify(v && [v.best, v.starts, v.doors, v.party]));
      /* back on the Bone Wing its own pick is kept; Enter sends ONE hr_catacomb_start: the slot, the wing, the door, a key */
      await page.click('[data-hs-win="tower"] .tk-wing[data-wing="bone"]');
      await wait(page, () => document.querySelector('[data-hs-win="tower"] .tk-start-pick')?.value === '20');
      await page.click('[data-hs-win="tower"] .tk-go');
      await wait(page, () => /^Descent started: /.test(document.querySelector('[data-hs-win="tower"] .hh-intent-msg')?.textContent || ''));
      const sent = verbs(s);
      if (sent.length !== 1 || sent[0].name !== 'hr_catacomb_start' || Object.keys(sent[0].body).sort().join() !== 'p_idem,p_landing,p_slot,p_wing'
        || sent[0].body.p_wing !== 'bone' || sent[0].body.p_landing !== 20 || sent[0].body.p_slot !== 0 || !/^[0-9a-f-]{36}$/.test(sent[0].body.p_idem))
        fails.push('CT-2 Enter sent ' + JSON.stringify(sent));
      if (errors.length) fails.push('CT-2 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    if (runs('CT-3')) { // CT-3
      const short = { need: 10, level: 25, ok: false, short: [{ seat: 1, name: 'Bram', level: 8 }] };
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, { catacomb: catSection({ gate: short }) });
      await openTower(page, 'catacomb');
      let v = await tabView(page);
      if (!v || v.go !== 'off' || v.why !== 'Requires Level 10' || v.gate.join() !== 'Bram: Level 8') fails.push('CT-3 a seat under the Level reads ' + JSON.stringify(v && [v.go, v.why, v.gate]));
      const n0 = verbs(s).length;
      await page.click('[data-hs-win="tower"] .tk-go', { force: true }).catch(() => {});
      await page.waitForTimeout(200);
      if (verbs(s).length !== n0) fails.push('CT-3 an off Enter sent ' + verbs(s).slice(n0).map((c) => c.name));
      /* no gate from the server: locked, never guessed open */
      s.catacomb = catSection({ gate: null });
      await replay(page); await openTower(page, 'catacomb');
      v = await tabView(page);
      if (!v || v.go !== 'off' || v.why !== 'Checking…') fails.push('CT-3 no gate reads ' + JSON.stringify(v && [v.go, v.why]));
      /* a checkpoint list out of the server's shape: no start, Enter off */
      s.catacomb = catSection({ wings: [{ wing: 'bone', hunt: BONE, name: 'Bone Wing', best: 23, record: 23, checkpoints: [20, 10], last_start: 10 }] });
      await replay(page); await openTower(page, 'catacomb');
      v = await tabView(page);
      if (!v || v.starts.length || v.go !== 'off' || v.why !== 'No start room available') fails.push('CT-3 a forged checkpoint list reads ' + JSON.stringify(v && [v.starts, v.go, v.why]));
      /* a hunt running holds it off */
      s.catacomb = catSection();
      s.env = Object.assign(clone(BASE_ENV), {});
      await replay(page); await openTower(page, 'catacomb');
      v = await tabView(page);
      if (!v || v.go !== 'off' || v.why !== 'Not available while hunting') fails.push('CT-3 a hunt running reads ' + JSON.stringify(v && [v.go, v.why]));
      /* the server refuses a seat's Level: its numbers said, the character re-read */
      s.env = Object.assign(clone(BASE_ENV), clone(TOWN));
      s.answer = (name) => (name === 'hr_catacomb_start' ? { ok: false, error: 'catacomb_party_level', who: 'Bram', need: 10, have: 8 } : { ok: true });
      await replay(page); await openTower(page, 'catacomb');
      const l0 = loads(s);
      await page.click('[data-hs-win="tower"] .tk-go');
      const said = await wait(page, () => (document.querySelector('[data-hs-win="tower"] .hh-intent-msg')?.textContent || '').includes('Bram: Level 8, requires 10'));
      if (!said || loads(s) <= l0) fails.push('CT-3 a catacomb_party_level refusal reads ' + JSON.stringify(await page.evaluate(() => document.querySelector('[data-hs-win="tower"] .hh-intent-msg')?.textContent)) + ' after ' + (loads(s) - l0) + ' re-reads');
      if (errors.length) fails.push('CT-3 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    if (runs('CT-4')) { // CT-4
      const held = { bone_bronze: { bag: 2, storage: 0, ring: 0 }, bone_gold: { bag: 1, storage: 0, ring: 0 } };
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, { catacomb: catSection({ held }), tower: towerSection({ held }) });
      s.answer = (name, body) => (name === 'hr_chest_open' ? { ok: true, opens: [{ n: 1, stokes: 0, chance_ppm: 160000, weapon: null, family: null, armor: 'tinkers_kettle', slot: 'helmet', weight: 'heavy', outfit: null, bundle: null }],
        haul: { tinkers_kettle: 1, tower_cinders: 50 }, cinders_spent: 0 } : { ok: true });
      await openTower(page, 'catacomb');
      await page.click('[data-hs-win="tower"] .tk-key[data-key="bone_gold"]');
      const onChest = await wait(page, () => document.querySelector('[data-hs-win="tower"] [data-pane="chest"].is-on'));
      const chestView = () => page.evaluate(() => {
        const w = document.querySelector('[data-hs-win="tower"] [data-pane="chest"]');
        const st = (q) => { const b = w.querySelector(q); return !b || b.hidden ? 'none' : b.disabled ? 'off' : 'on'; };
        return { fams: Array.from(w.querySelectorAll('.tc-fam-pick')).map((b) => b.textContent + (b.getAttribute('aria-checked') === 'true' ? '*' : '')),
          picks: Array.from(w.querySelectorAll('.tc-pick')).map((b) => b.querySelector('.tc-pick-name').textContent + ' ' + b.querySelector('.tc-pick-pct').textContent + (b.getAttribute('aria-checked') === 'true' ? '*' : '')),
          use: st('.tc-use'), why: w.querySelector('.tc-off-why').textContent, tip: (w.querySelector('.tc-pick[aria-checked="true"]') || {}).title || '',
          result: w.querySelector('.tt-result').hidden ? null : Array.from(w.querySelectorAll('.tt-result .tc-loot-item')).map((e) => e.querySelector('span').textContent).join(' | '),
          reveal: (w.querySelector('.tc-reveal') || { getAttribute: () => null }).getAttribute('data-key') };
      });
      let c = onChest ? await chestView() : null;
      /* the Catacomb family picked, its keys only, the Gold key picked: armor coming soon, on its slot and on Use */
      if (!c || c.fams.join() !== 'Catacomb Keys*,Tower Keys' || c.picks.join(' | ') !== 'Bronze Waterlogged Key Armor chance: 16% | Silver Waterlogged Key Armor chance: 16% | Bronze Bone Key Armor chance: 16% | Silver Bone Key Armor chance: 16% | Gold Bone Key Armor coming soon*')
        fails.push('CT-4 the chest on a Catacomb key reads ' + JSON.stringify(c && [c.fams, c.picks]));
      if (!c || c.use !== 'off' || c.why !== 'Armor coming soon') fails.push('CT-4 Use on a key with no armor yet reads ' + JSON.stringify(c && [c.use, c.why]));
      const n0 = verbs(s).length;
      await page.click('[data-hs-win="tower"] .tc-use', { force: true }).catch(() => {});
      await page.waitForTimeout(200);
      if (verbs(s).length !== n0) fails.push('CT-4 an off Use sent ' + verbs(s).slice(n0).map((c) => c.name));
      /* the Bronze Bone Key: its armor chance, its lean on the tip; Use sends ONE hr_chest_open for that key; the piece drawn with its slot and weight */
      await page.click('[data-hs-win="tower"] .tc-pick[data-key="bone_bronze"]');
      await wait(page, () => document.querySelector('[data-hs-win="tower"] .tc-pick[data-key="bone_bronze"]')?.getAttribute('aria-checked') === 'true');
      c = await chestView();
      if (!c || c.use !== 'on' || !/^Helmets: 70%/.test(c.tip) || /Equipped type/.test(c.tip)) fails.push('CT-4 the Bronze Bone Key reads ' + JSON.stringify(c && [c.use, c.tip]));
      await page.click('[data-hs-win="tower"] .tc-use');
      await wait(page, () => !document.querySelector('[data-hs-win="tower"] .tt-result').hidden);
      const sent = verbs(s).slice(n0);
      if (sent.length !== 1 || sent[0].name !== 'hr_chest_open' || sent[0].body.p_key !== 'bone_bronze' || sent[0].body.p_count !== 1 || sent[0].body.p_stokes !== null)
        fails.push('CT-4 Use sent ' + JSON.stringify(sent));
      c = await chestView();
      if (!c || !/^Tinker's Kettle ?Helmet, Heavy/.test(c.result || '') || c.reveal !== 'bronze') fails.push('CT-4 the armor answer reads ' + JSON.stringify(c && [c.result, c.reveal]));
      if (shots) { await page.waitForTimeout(1500); await page.screenshot({ path: join(shots, 'catacombs-chest-armor-desktop-1440x900.png') }); }
      if (errors.length) fails.push('CT-4 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    if (runs('CT-5')) { // CT-5
      const hunt = Object.assign(clone(BASE_ENV.hunt), { hunt_id: BONE });
      /* the session kept its setup (preset 1): a hunt's card would offer Hunt again with it, a descent's never does */
      const ended = Object.assign(clone(hunt), { ended: true, session_id: SID, session: Object.assign({}, hunt.session || {}, { end_reason: 'died', ended_at: new Date().toISOString(), preset: 1 }) });
      /* a descent running: the hunt bar says the room, a vault door's Keeper (the section's run.room: no prediction runs in this stub) */
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, { env: Object.assign(clone(BASE_ENV), { hunt }),
        catacomb: Object.assign(catSection(), { run: { session: SID, wing: 'bone', start: 1, top: 9, floors: 9, room: 10 } }) });
      const bar = await wait(page, () => document.querySelector('.ht-tower:not([hidden]) .ht-floor')?.textContent === 'Room 10, Keeper');
      if (!bar) fails.push('CT-5 the hunt bar on a vault door reads ' + JSON.stringify(await page.evaluate(() => { const e = document.querySelector('.ht-tower'); return e && [e.hidden, e.textContent]; })));
      s.catacomb = catSection();
      s.env = Object.assign(clone(BASE_ENV), { hunt: ended, death_log: [{ id: 1, at: new Date().toISOString(), hunt: BONE, session: SID, monster: 'keeper_dunn', xp: 0, xp_lost: 0, saved: 0 }] });
      await replay(page);
      await page.keyboard.press('l');
      await wait(page, () => !!document.querySelector('[data-hs-win="hunt-summary"] .hsum-card.is-on'), null, 8000);
      const card = await page.evaluate(() => {
        const w = document.querySelector('[data-hs-win="hunt-summary"]');
        const again = w && w.querySelector('[data-hs-act="again"]');
        return { death: !!document.querySelector('[data-hs-win="death"]'), reason: w && !w.querySelector('.hsum-reason').hidden ? w.querySelector('.hsum-reason').textContent : '',
          again: again ? (again.disabled ? 'off' : 'on') + ':' + (again.getAttribute('title') || '') : null };
      });
      if (card.death) fails.push('CT-5 the death popup opened for a descent');
      if (!/^Carried up, no XP lost/.test(card.reason) || /died/i.test(card.reason)) fails.push('CT-5 the card\'s reason reads ' + JSON.stringify(card.reason));
      if (card.again !== 'off:Start: Catacombs tab, Great Hearth') fails.push('CT-5 Hunt again on a descent reads ' + JSON.stringify(card.again));
      const falls = await page.evaluate(async () => {
        const src = Array.from(document.querySelectorAll('script[type="module"]')).map((e) => e.src).find((u) => u.includes('?v=')) || '';
        const v = src ? '?v=' + src.split('?v=')[1] : '';
        const R = await import(new URL('src/hunt-view/summary-recorder.js' + v, document.baseURI).href);
        const D = await import(new URL('src/hunt-view/death-explain.js' + v, document.baseURI).href);
        const evs = [{ id: 1, type: 'dmg', atMs: 9000, an: 'Keeper Dunn', t: 7, amount: 42 }, { id: 2, type: 'death', atMs: 10000, u: 7, an: 'Ashby' }];
        const say = (hunt) => D.explainDeaths(evs, { whoOf: R.whoOf, words: R.fallWordsOf(hunt) }).deaths.map((d) => d.lines.join(' ')).join(' ');
        return { bone: say('unmarked_bone_wing'), tower: say('the_burning_tower') };
      }).catch((e) => ({ error: String(e && e.message || e) }));
      if (!/^Ashby was carried up: /.test(falls.bone || '') || !/^Ashby was spat out: /.test(falls.tower || '')) fails.push('CT-5 a fall in What happened reads ' + JSON.stringify(falls));
      if (errors.length) fails.push('CT-5 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    if (runs('CT-6')) { // CT-6
      const { ctx, page, errors } = await open({ width: 922, height: 423 }, { catacomb: catSection({ held: { bone_bronze: { bag: 2, storage: 0, ring: 0 } } }) });
      if (!(await openTower(page, 'catacomb'))) fails.push('CT-6 the Catacombs tab never opened on the phone');
      await page.waitForTimeout(400);
      const fit = await page.evaluate(() => {
        const win = document.querySelector('[data-hs-win="tower"]'), pane = win.querySelector('[data-pane="catacomb"]');
        const r = win.getBoundingClientRect();
        const small = Array.from(pane.querySelectorAll('*')).filter((e) => e.getClientRects().length && [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
          .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.textContent.trim());
        const wide = Array.from(pane.querySelectorAll('.tk-wing, .tk-door, .tk-go, .tk-start-pick')).filter((e) => e.getClientRects().length)
          .filter((e) => { const b = e.getBoundingClientRect(); return b.left < r.left - 1 || b.right > r.right + 1; }).map((e) => e.className);
        const body = win.querySelector('.hs-win-body') || pane;
        /* what sticks out sideways, when anything does (the red names it) */
        const br = body.getBoundingClientRect();
        const over = body.scrollWidth > body.clientWidth + 1 ? Array.from(pane.querySelectorAll('*')).filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > br.right + 1)
          .map((e) => e.className || e.tagName).slice(0, 6) : [];
        return { inside: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1, wings: pane.querySelectorAll('.tk-wing').length,
          sideways: body.scrollWidth > body.clientWidth + 1, small, wide, over };
      });
      if (!fit.inside || fit.wings !== 2 || fit.sideways || fit.small.length || fit.wide.length) fails.push('CT-6 the phone sheet reads ' + JSON.stringify(fit));
      if (shots) await page.screenshot({ path: join(shots, 'catacombs-tab-phone-922x423.png') });
      /* Enter is reachable: scrolled into the sheet, it is on screen and pressable */
      const reach = await page.evaluate(() => { const b = document.querySelector('[data-hs-win="tower"] .tk-go'); b.scrollIntoView({ block: 'nearest' });
        const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && !b.disabled; });
      if (!reach) fails.push('CT-6 Enter cannot be reached on the phone');
      if (shots) await page.screenshot({ path: join(shots, 'catacombs-tab-phone-922x423-enter.png') });
      if (errors.length) fails.push('CT-6 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    /* THE WINGS' ROOMS (src/world/hunt-maps.js RUN_MAPS), read as the page loads them: a descent watched draws the Catacombs' own map, its
       painted vault; the staged 165-185 hunting ground on that map and its monsters route nowhere (the pack is not served), and no
       shipped map moves */
    if (runs('CT-7')) { // CT-7
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'load' });
      const r = await page.evaluate(async (w) => {
        const src = Array.from(document.querySelectorAll('script[type="module"]')).map((e) => e.src).find((x) => x.includes('?v=')) || '';
        const v = src ? '?v=' + src.split('?v=')[1] : '';
        const HM = await import(new URL('src/world/hunt-maps.js' + v, document.baseURI).href);
        const MAPS = await import(new URL('src/data/world/maps/index.js' + v, document.baseURI).href);
        const got = Object.fromEntries(Object.keys(w).map((h) => [h, HM.HUNT_MAP_INDEX[h] || null]));
        const leak = ['unmarked_catacombs', 'shrouded_pauper', 'vault_leech', 'bone_wall', 'night_carter', 'keeper_dunn'].filter((id) => id in HM.HUNT_MAP_INDEX);
        const shipped = MAPS.WORLD_MAPS.map((m) => m.id), drawn = HM.DRAWN_MAPS.map((m) => m.id);
        return { got, leak, head: drawn.slice(0, shipped.length).join() === shipped.join(), extra: drawn.filter((id) => !shipped.includes(id)).join() };
      }, { [FLOODED]: 'unmarked_catacombs', [BONE]: 'unmarked_catacombs', the_burning_tower: 'burning_tower', mill_cellar: 'mill_cellar' });
      if (Object.values(r.got).join() !== 'unmarked_catacombs,unmarked_catacombs,burning_tower,mill_cellar') fails.push('CT-7 a fight routes to ' + JSON.stringify(r.got));
      if (r.leak.length) fails.push('CT-7 the staged hunting ground leaks into the World: ' + r.leak.join(', '));
      if (!r.head || r.extra !== 'unmarked_catacombs') fails.push('CT-7 the World draws ' + JSON.stringify(r));
      await ctx.close();
    }
  } catch (e) {
    if (e !== STOP) fails.push('a page step threw: ' + String(e && e.message || e).split('\n')[0]);
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
  /* THE READER, pure (src/session/catacomb-sections.js): no section is no tab; a wing out of shape is dropped, never mended */
  if (!arm || arm === 'CT-1') {
    const C = await import(new URL('../src/session/catacomb-sections.js', import.meta.url).href);
    const cs = (sec) => ({ read: (k) => (k === 'catacomb' ? sec : undefined) });
    if (C.catacombOf(cs(undefined)) !== null || C.catacombOf(cs(null)) !== null) fails.push('CT-1 the reader reads a tab out of no section');
    const one = C.catacombOf(cs(Object.assign(catSection(), { wings: [{ wing: 'Bone!', hunt: BONE, name: 'Bone Wing', best: 1, checkpoints: [0] }, catSection().wings[1]] })));
    if (!one || one.wings.map((w) => w.wing).join() !== 'flooded' || one.lastWing !== null) fails.push('CT-1 the reader keeps a forged wing: ' + JSON.stringify(one && one.wings));
  }
  return fails;
}

/* Each plants one defect the rules above exist for. [name, file, from, to] */
const MUTANTS = [
  ['CT-1 the tab shows with the switch off', 'src/shell/windows/tower.js', "prop(root.querySelector('.hw-tab[data-tab=\"catacomb\"]'), 'hidden', !cat);", "prop(root.querySelector('.hw-tab[data-tab=\"catacomb\"]'), 'hidden', false);"],
  ['CT-1 a forged tab press shows the tab with no section', 'src/shell/windows/tower.js', "const offered = (cs, id) => TABS.includes(id) && (id !== 'catacomb' || !!catacombOf(cs));", 'const offered = (cs, id) => TABS.includes(id);'],
  ['CT-2 Enter sends the entrance, not the pick', 'src/shell/windows/tower-catacombs.js', 'startDescent(ctx.account, cs, w.wing, door)', 'startDescent(ctx.account, cs, w.wing, 0)'],
  ['CT-2 the start the last descent used is forgotten', 'src/shell/windows/tower-catacombs.js', '  if (w.lastStart !== null && w.checkpoints.includes(w.lastStart)) return w.lastStart;', '  if (false) return 0;'],
  ['CT-2 a door past the record is a press', 'src/shell/windows/tower-catacombs.js', "      prop(b, 'disabled', pending || !listed);", "      prop(b, 'disabled', pending);"],
  ['CT-2 a door names another wing\'s key', 'src/session/catacomb-sections.js', '  return cat.chest.keys.filter((k) => k.ground === w.hunt)', '  return cat.chest.keys.filter((k) => k.family === \'catacomb\')'],
  ['CT-2 the wing that ran last is not picked', 'src/shell/windows/tower-catacombs.js', ' || wingRow(cat, cat.lastWing) || cat.wings[0];', ' || cat.wings[cat.wings.length - 1];'],
  ['CT-3 Enter ignores the door\'s Level', 'src/shell/windows/tower-catacombs.js', "  if (!cat.gate.ok) return t('tower.off_level', { level: cat.gate.need });", "  if (false) return '';"],
  ['CT-3 a gate not read yet opens Enter', 'src/shell/windows/tower-catacombs.js', "  if (!cat.gate) return t('tower.off_checking');", "  if (!cat.gate) return '';"],
  ['CT-3 a seat\'s Level refusal says no numbers', 'src/shell/tower-words.js', "    if (r.error === 'catacomb_party_level' && r.who && num(r.need) && num(r.have))", "    if (false)"],
  ['CT-4 an armor key reads as a weapon chance', 'src/shell/windows/tower-chest.js', ": k.gear === 'armor' ? t('catacomb.armor_chance', { pct }) :", ': false ? \'\' :'],
  ['CT-4 a key with no armor yet says nothing on its slot', 'src/shell/windows/tower-chest.js', "  const soon = k.gear === 'armor' && !k.ready;", '      const soon = false;'],
  ['CT-4 the armor piece is not drawn', 'src/shell/windows/tower-chest.js', '    + armor.map((o) => well(o.armor, itemName(o.armor), armorWords(o.slot, o.weight), true)).join(\'\')', "    + ''"],
  ['CT-4 a key pressed opens the chest on another family', 'src/shell/windows/tower-catacombs.js', "sc.tab = 'chest'; sc.fam = k.family; sc.key = k.key;", "sc.tab = 'chest'; sc.fam = 'tower'; sc.key = k.key;"],
  ['CT-5 the death popup opens in the Catacombs', 'src/shell/death-popup.js', '  if (runRulesOf(h.huntId)) return null;', "  if (h.huntId === 'the_burning_tower') return null;"],
  ['CT-5 a Catacombs fall said as the Tower\'s', 'src/hunt-view/summary-recorder.js', "run.family === 'catacomb' ? t('catacomb.fell', { name }) : t('tower.fell', { name })", "t('tower.fell', { name })"],
  ['CT-5 a descent\'s card says spat out', 'src/hunt-view/summary-model.js', "sessionModeOfHunt(hunt).id === 'catacomb' ? t('catacomb.end_carried') : t('summary.end_spat')", "t('summary.end_spat')"],
  ['CT-5 the hunt bar says nothing in the Catacombs', 'src/shell/widgets/tower-bar.js', '  if (!w) return null;', '  return null;'],
  ['CT-7 a descent watched draws the town','src/world/hunt-maps.js', 'export const HUNT_MAP_INDEX = huntMapIndex(DRAWN_MAPS, HUNT_INDEX);', 'export const HUNT_MAP_INDEX = huntMapIndex(WORLD_MAPS, HUNT_INDEX);'],
  ['CT-7 the staged hunting ground routes to its map', 'src/world/hunt-maps.js', '{ hunts: Object.freeze(m.hunts.filter((h) => runRulesOf(h))) }', '{ hunts: m.hunts }'],
  ['CT-5 Hunt again offered on a descent','src/shell/windows/hunt-summary.js', '    const again = runRulesOf(cur.hunt) ? null : huntAgainOf(cur);', '    const again = cur.hunt === TOWER_RULES.hunt ? null : huntAgainOf(cur);'],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'catacombs-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'catacombs-window: ' + fails.length + ' rule(s) RED'
      : 'catacombs-window: no tab with the switch off; the server\'s wings, doors and checkpoints are the only picks and one Enter sends one wing and one door; off with why; the chest opens a Catacomb key on its own family and draws its armor; a fall costs nothing and says so; a sheet on the phone');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await cleanControl(() => checks(null));
  console.log(clean.line);
  if (clean.code) process.exit(clean.code);
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
  console.log(exitOf(counts) ? 'catacombs-window --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)'
    : 'catacombs-window --mutate: ' + list.length + '/' + list.length + ' mutants caught, each by a named rule in its own arm');
  process.exit(exitOf(counts));
}

main();
