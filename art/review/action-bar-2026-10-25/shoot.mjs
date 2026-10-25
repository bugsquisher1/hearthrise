#!/usr/bin/env node
// art/review/action-bar-2026-10-25/shoot.mjs — action bar SAMPLES on the REAL client, headless. Mock only:
// nothing in src/ changes. play.html on the stubbed server the window tests use (tests/_client-harness.mjs);
// nothing reaches the live server.
//   node art/review/action-bar-2026-10-25/shoot.mjs [current|a|b|c|configure ...]   default: all
// The hero: a Level 29 Healer (staff, restoration) mid-hunt in the Mill Cellar with a Level 28 Ranger: real
// spells (Greater Mend, Protective Ward, Circle of Renewal, Green Sickness, Mend), real runes in the bag, own
// and store food and drink, one own food run out (struck), the rest of the 20 slots empty.
// Per variant: <v>-1440.png (1440x900), <v>-1440-bar.png (the bar alone at 2x device px), <v>-844.png
// (844x390); current also <v>-667.png (667x375, the overflow). A sample gets samples.css as a same-origin
// <link> and samples.js run in the page (it rebuilds the bar's interior from the real bar's own DOM).
// configure: the Configure action window today and the sample with Ammo on its own tab (a Ranger's view).
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from '../../../tests/_client-harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REL = '/art/review/action-bar-2026-10-25/';
const { charXpForLevel } = await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href);
const { maxHpFor, maxManaFor } = await import(pathToFileURL(join(ROOT, 'src/core/vitals.js')).href);
const { SESSION_CONFIG } = await import(pathToFileURL(join(ROOT, 'src/session/config.js')).href);
const BASE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
BASE.hunt_server_now_ms += SESSION_CONFIG.huntPlaybackDelayMs;

const cond = (metric, op, value, subject) => [Object.assign({ metric, op, value }, subject ? { subject } : {})];
const ab = (id, c, mana) => ({ action: { type: 'ability', id }, conditions: c || [], join: 'and', usable: true, mana });
const eat = (id, c, count, usable) => ({ action: { type: 'consume', id }, conditions: c, join: 'and', usable: usable !== false, count });

/* The Healer: Level 29, six light pieces (vitals.js: HP 430, mana 513), 41% into the level. */
function healer() {
  const e = JSON.parse(JSON.stringify(BASE));
  const L = 29, hpMax = maxHpFor(L, 0), mpMax = maxManaFor(L, 6);
  e.name = 'Tyler';
  e.state.level_xp = Math.round(charXpForLevel(L) + 0.41 * (charXpForLevel(L + 1) - charXpForLevel(L)));
  Object.assign(e.hunt.hero, { level: L, hp: 312, hp_max: hpMax, mana: 247, mana_max: mpMax, hp_regen: 3, mana_regen: 4, xp_pct: 0.41 });
  Object.assign(e.party.members[0], { level: L, weapon: 'staff', hp: 312, hp_max: hpMax, mana: 247, mana_max: mpMax, dealt: 610, healed: 4120, dps: 3, hps: 21, aggro: false });
  Object.assign(e.party.members[1], { level: 28, aggro: true });
  e.equipment = { weapon: 'oak_staff' };
  e.inventory = { cooked_trout: 23, carrot_juice: 11, chalked_water_rune: 86, chalked_earth_rune: 41, chalked_poison_rune: 18, bones: 12, rat_tail: 31 };
  Object.assign(e.hunt_settings, {
    role: 'healer', discipline: 'restoration', presets: [{ preset: 0, name: 'Preset1' }, { preset: 1, name: 'Mana train' }],
    slots: [
      ab('greater_mend', cond('ally_hp_pct', 'lte', 70, 'lowest'), 25),
      ab('protective_ward', cond('ally_hp_pct', 'lte', 80, 'tank'), 25),
      ab('circle_of_renewal', cond('allies_below', 'gte', 2, 'under_60'), 50),
      ab('mend', cond('self_hp_pct', 'lte', 50), 15),
      ab('green_sickness', cond('self_mana_pct', 'gte', 60), 20),
      eat('cooked_trout', cond('self_hp_pct', 'lte', 55), 23),
      eat('salted_trout', cond('self_hp_pct', 'lte', 55), null),
      eat('carrot_juice', cond('self_mana_pct', 'lte', 40), 11),
      eat('thin_carrot_juice', cond('self_mana_pct', 'lte', 30), null),
      eat('cooked_lobster', cond('self_hp_pct', 'lte', 35), 0, false),
    ].concat(Array(10).fill(null)),
  });
  return e;
}
/* The Ranger (the Configure action sample): Level 28, bow, arrows in the bag. */
function ranger() {
  const e = healer();
  Object.assign(e.hunt.hero, { level: 28, hp: 380, hp_max: maxHpFor(28, 0), mana: 210, mana_max: maxManaFor(28, 0) });
  Object.assign(e.party.members[0], { level: 28, weapon: 'bow' });
  e.equipment = { weapon: 'shortbow' };
  e.inventory = { cooked_trout: 23, carrot_juice: 11, iron_arrows: 340, barbed_arrows: 120, steel_arrows: 0, chalked_fire_rune: 30 };
  Object.assign(e.hunt_settings, { role: 'ranger', discipline: 'ranged' });
  e.hunt_settings.slots[0] = ab('precision_shot', [], 6);
  e.hunt_settings.slots[1] = ab('flame_volley', cond('enemies_in_aoe', 'gte', 3), 15);
  e.hunt_settings.slots[2] = ab('hunters_mark', cond('effect_missing', 'eq', 'marked', 'target'), 8);
  e.hunt_settings.slots[3] = { action: { type: 'attack_with_item', id: 'iron_arrows' }, conditions: cond('item_qty', 'gt', 0, 'item'), join: 'and', usable: true, count: 340 };
  e.hunt_settings.slots[4] = ab('mend', cond('self_hp_pct', 'lte', 50), 15);
  return e;
}

const all = ['current', 'a', 'b', 'c', 'configure'];
const want = process.argv.slice(2).length ? process.argv.slice(2) : all;
const SAMPLE_JS = await readFile(join(HERE, 'samples.js'), 'utf8').catch(() => '');

const { server, port } = await serve();
const browser = await chromium.launch({ headless: true });
let version = 1;

async function open(env, w, h, dsf) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', (r) => {
    const fn = r.request().url().split('?')[0].split('/').pop();
    const body0 = Object.assign(JSON.parse(JSON.stringify(env)), { version: ++version });
    const body = fn === 'hr_load' ? body0 : fn === 'hr-accrue' ? Object.assign({ accrued: true }, body0) : { ok: true };
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('form[data-auth="sign-in"]', { timeout: 20000 });
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await page.click('[data-app="play"][data-slot="0"]');
  await page.waitForSelector('.hb-bar .hb-hub', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('.hp-m').length === 2, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);
  return { ctx, page, errors };
}

async function sample(page, v) {
  await page.evaluate((href) => new Promise((ok) => { const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href }); l.onload = ok; l.onerror = ok; document.head.appendChild(l); }), REL + 'samples.css?' + Date.now());
  const said = await page.evaluate('(' + SAMPLE_JS + ')(' + JSON.stringify(v) + ')');
  await page.waitForTimeout(500);
  return said;
}

async function barShot(page, file, w, h) {
  const r = await page.evaluate(() => { const b = document.querySelector('.hs-widget.is-action-bar').getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
  const pad = 16, top = Math.max(0, r.y - 44);
  await page.screenshot({ path: join(HERE, file), clip: { x: Math.max(0, r.x - pad), y: top, width: Math.min(w - Math.max(0, r.x - pad), r.width + 2 * pad), height: Math.min(h - top, r.y - top + r.height + pad) } });
}

for (const v of want) {
  if (v === 'configure') {
    for (const [w, h] of [[1440, 900], [844, 390]]) {
      for (const tab of ['current', 'food', 'ammo']) {
        const { ctx, page, errors } = await open(ranger(), w, h, 1);
        await page.click('.hb-slot[data-slot="' + (tab === 'ammo' ? 3 : 5) + '"]');
        await page.waitForSelector('.ca .ca-runs .ca-row', { state: 'attached', timeout: 20000 });
        await page.waitForTimeout(600);
        let said = 'today';
        if (tab === 'current') { await page.click('.ca-tab[data-tab="items"]'); await page.waitForTimeout(400); }
        else said = await sample(page, 'configure-' + tab);
        await page.mouse.move(2, 2);
        await page.waitForTimeout(300);
        const name = (tab === 'current' ? 'configure-current-' : 'configure-sample-' + tab + '-') + w + '.png';
        await page.screenshot({ path: join(HERE, name) });
        console.log(name + ': ' + said + (errors.length ? ' | page errors: ' + errors.slice(0, 2).join(' | ') : ''));
        await ctx.close();
      }
    }
    continue;
  }
  const shots = [[1440, 900, 1, ''], [1440, 900, 2, 'bar'], [844, 390, 1, '']].concat(v === 'current' ? [[667, 375, 1, ''], [844, 390, 2, 'bar']] : [[844, 390, 2, 'bar'], [667, 375, 1, '']]);
  for (const [w, h, dsf, part] of shots) {
    const { ctx, page, errors } = await open(healer(), w, h, dsf);
    const said = v === 'current' ? 'today' : await sample(page, v);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(300);
    const name = (v === 'current' ? 'current' : 'sample-' + v) + '-' + w + (part ? '-' + part : '') + '.png';
    if (part === 'bar') await barShot(page, name, w, h);
    else await page.screenshot({ path: join(HERE, name) });
    const m = await page.evaluate(() => { const b = document.querySelector('.hs-widget.is-action-bar').getBoundingClientRect(); const tools = Array.from(document.querySelectorAll('.sb-setup .hh-tool, .hb-plaque > .hb-pl-row .hh-tool')).filter((x) => x.getClientRects().length);
      const right = Math.max(...tools.map((x) => x.getBoundingClientRect().right));
      return Math.round(b.left) + '..' + Math.round(b.right) + ' x ' + Math.round(b.top) + '..' + Math.round(b.bottom) + ' of ' + innerWidth + 'x' + innerHeight + ', setup tools end at ' + Math.round(right) + (right > innerWidth - 4 ? ' (CUT)' : ' (in view)'); });
    console.log(name + ': ' + said + ' | bar ' + m + (errors.length ? ' | page errors: ' + errors.slice(0, 2).join(' | ') : ''));
    await ctx.close();
  }
}
await browser.close();
server.close();
