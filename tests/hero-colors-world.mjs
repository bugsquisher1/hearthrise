#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hero-colors-world.mjs — A HERO'S COLORS, PLAYED: A FRESH ACCOUNT, THE REAL GAME, NO PRODUCTION.
//
//   node tests/hero-colors-world.mjs [--shots DIR]     exit 0 green, 1 red, 2 harness
//
// tools/qa/local-world.mjs: the real play.html and engine on the replayed chain, brand-new accounts from the sign-in screen. Only this process's in-memory database moves
// (a purse, to reach the price). A manual walk (tests/guards-unregistered.json); the rules are mutation-proven in CI by tests/hero-colors.mjs.
//
//   CW-1  the sign-in and the first screens fetch no mask: first load doesn't grow
//   CW-2  the creation step previews the real hero: a pick repaints the big preview; Legs repaints only the outfit that shows legs; it says what the first outfit changes
//   CW-3  Enter town: the colors are the picks, creation cost nothing, and the hero draws from a baked sheet
//   CW-4  the Outfit tab: the knight's parts by name; the druid offers none and says why; trying on charges nothing and moves nothing on the server
//   CW-5  Save colors shows the server's price, charges exactly it once, and the window comes back from the envelope
//   CW-6  a second account standing in town reads the new colors from the server, in its own sheet, without the hero moving
//   CW-7  a reload keeps them; changing outfit keeps them and charges nothing
//   CW-8  a price gone stale says so and charges nothing; the window shows the new one
//   CW-9  past the day's cap the words say so and nothing is charged
//   CW-10 a hunting hero saves, and the hunt screen draws it
//   CW-11 no console errors, nothing left the machine
// mutant-anchors: none — a manual walk of the real game
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { openWorld } from '../tools/qa/local-world.mjs';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? resolvePath(args[args.indexOf('--shots') + 1]) : null;
if (shots) mkdirSync(shots, { recursive: true });
const fails = [];
const t0 = Date.now();
const step = (name, ok, got) => {
  console.log((ok ? '✓ ' : '✗ ') + name + (ok ? '' : ' :: ' + String(got === undefined ? '' : got).slice(0, 400)));
  if (!ok) fails.push(name);
};

const world = await openWorld({ tickMs: false });
let code = 0;
try {
  const sql = async (s, p) => (await world.db.query(s, p)).rows;
  const a = await world.play({ account: 'marlow', viewport: { width: 1440, height: 900 }, shots });
  const page = a.page;
  const masks = [];
  page.on('request', (r) => { if (/atlas-hunt-masks/.test(r.url())) masks.push(r.url()); });

  /* ── CW-1 ── (the driver's sign-in has already landed on the characters screen) */
  await page.waitForTimeout(800);
  step('CW-1 the first screens fetch no mask', masks.length === 0, masks.join(' '));

  /* ── CW-2 ── */
  await page.click('[data-app="create"][data-slot="0"]');
  await page.waitForSelector('.hero-preview');
  await page.waitForFunction(() => { const c = document.querySelector('.hero-preview'); return c && c.getContext('2d').getImageData(96, 96, 1, 1) && c.toDataURL().length > 2000; }, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const hash = (q) => page.evaluate((s) => document.querySelector(s).toDataURL(), q);
  const big0 = await hash('.hero-preview'), ranger0 = await hash('[data-hero-outfit="ranger"]');
  await page.click('[data-hero-region="head"][data-hero-dye="8"]');
  const big1 = await hash('.hero-preview');
  step('CW-2 a Head pick repaints the big preview', big0 !== big1);
  await page.click('[data-hero-region="body"][data-hero-dye="11"]');
  const big2 = await hash('.hero-preview');
  step('CW-2 a Body pick repaints it too', big1 !== big2);
  const ranger1 = await hash('[data-hero-outfit="ranger"]');
  await page.click('[data-hero-region="legs"][data-hero-dye="14"]');
  const big3 = await hash('.hero-preview'), ranger2 = await hash('[data-hero-outfit="ranger"]');
  step('CW-2 a Legs pick shows on the outfit with legs, and not on the plate', big2 === big3 && ranger1 !== ranger2 && ranger0 !== ranger1, JSON.stringify({ plate: big2 === big3, ranger: ranger1 !== ranger2 }));
  await page.click('[data-hero-region="feet"][data-hero-dye="6"]');
  const note = await page.evaluate(() => document.querySelector('.hero-note').textContent);
  step('CW-2 the step says what the first outfit changes', /plume and waist cloth/.test(note) && /every outfit/.test(note), note);
  if (shots) await a.shot('create-picked');

  /* ── CW-3 ── */
  await page.fill('.hero-name', 'Marlow');
  await page.click('.hero-confirm');
  await page.waitForSelector('#panel-world[data-slot="0"] .world-stage canvas');
  await page.waitForSelector('.hs-launchers');
  const uid = (await sql(`select user_id from public.character_names where name = 'Marlow'`))[0].user_id;
  const row = (await sql('select base_colors from public.player_outfits where user_id = $1 and slot = 0', [uid]))[0];
  step('CW-3 the colors are the picks', JSON.stringify(row.base_colors, ['head', 'body', 'legs', 'feet']) === JSON.stringify({ head: 8, body: 11, legs: 14, feet: 6 }), JSON.stringify(row));
  const spent = (await sql(`select count(*)::int n from public.player_ledger where user_id = $1 and gold < 0`, [uid]))[0].n;
  step('CW-3 creation cost nothing', spent === 0, spent);
  const version = await page.evaluate(() => (document.querySelector('link[href*="src/world/hero-dye.js"]') || { href: '' }).href.split('v=')[1] || '');
  const stats = (p) => p.evaluate(async (v) => { const D = await import(location.origin + '/src/world/hero-dye.js?v=' + v); return D.heroDyeOf({ doc: document, version: v }).stats(); }, version);
  await page.waitForFunction(async (v) => { const D = await import(location.origin + '/src/world/hero-dye.js?v=' + v); return D.heroDyeOf({ doc: document, version: v }).stats().looks >= 1; }, version, { timeout: 15000 }).catch(() => null);
  const st0 = await stats(page);
  step('CW-3 the hero draws from a baked sheet', st0.looks >= 1, JSON.stringify(st0));
  if (shots) await a.shot('town-own');

  /* ── CW-4 ── */
  await sql('update public.account_wallet set gold = 500000 where user_id = $1', [uid]);
  await a.reload();
  await page.waitForSelector('.char-row, .hs-launchers');
  if (await page.$('[data-app="play"][data-slot="0"]')) await page.click('[data-app="play"][data-slot="0"]');
  await page.waitForSelector('.hs-launchers');
  await page.keyboard.press('c');
  await page.waitForSelector('[data-hs-win="character"] [data-hs-built]');
  await page.click('[data-hs-win="character"] .hw-tab[data-tab="outfit"]');
  await page.waitForSelector('.hw-of-dye.is-on', { timeout: 15000 });
  const tabs = () => page.evaluate(() => Array.from(document.querySelectorAll('.hw-of-regions .hw-tab')).map((b) => b.textContent));
  await page.click('[data-hs-act="of-pick"][data-outfit="knight"]');
  await page.waitForTimeout(200);
  step('CW-4 the knight offers its plume and its waist cloth, by name', (await tabs()).join() === 'Plume,Waist cloth', (await tabs()).join());
  const says = () => page.evaluate(() => document.querySelector('.hw-of-shows').textContent);
  step('CW-4 the try-on says exactly what changes', /Plume, Waist cloth/.test(await says()) && /rest stays as drawn/.test(await says()), await says());
  if (shots) await a.shot('outfit-knight');
  await page.click('[data-hs-act="of-pick"][data-outfit="druid"]');
  await page.waitForTimeout(200);
  const druid = await page.evaluate(() => ({ on: document.querySelector('.hw-of-dye').classList.contains('is-on'), save: document.querySelector('[data-hs-act="of-colors"]').classList.contains('is-on') }));
  step('CW-4 the druid offers no colors and says why', !druid.on && !druid.save && /green/.test(await says()) && /every other outfit/.test(await says()), JSON.stringify(druid) + ' ' + await says());
  if (shots) await a.shot('outfit-druid');
  await page.click('[data-hs-act="of-pick"][data-outfit="sorcerer"]');
  await page.waitForTimeout(200);
  const purse = async (u = uid) => Number((await sql('select gold from public.account_wallet where user_id = $1', [u]))[0].gold);
  const preview0 = await hash('.hw-of-preview');
  await page.click('[data-hs-act="of-dye"][data-dye="5"]');
  await page.waitForTimeout(250);
  const preview1 = await hash('.hw-of-preview');
  step('CW-4 a swatch repaints the try-on', preview0 !== preview1);
  const still = (await sql('select base_colors from public.player_outfits where user_id = $1 and slot = 0', [uid]))[0].base_colors;
  step('CW-4 trying on charges nothing and moves nothing', await purse() === 500000 && still.head === 8, JSON.stringify(still));
  if (shots) await a.shot('outfit-tryon');

  /* ── CW-5 ── */
  const level = (await sql('select public.hr_level_of($1::uuid, 0) l', [uid]))[0].l;
  const rule = (await sql(`select price_base, price_per_level, per_day from public.hr_sink_rules where sink_id = 'hero_colors'`))[0];
  const price = Number(rule.price_base) + Number(rule.price_per_level) * level;
  const btn = () => page.evaluate(() => { const b = document.querySelector('[data-hs-act="of-colors"]'); return { on: b.classList.contains('is-on'), off: b.disabled, words: b.textContent }; });
  const b0 = await btn();
  step('CW-5 the button is the server\'s price', b0.on && !b0.off && b0.words === 'Save colors: ' + price.toLocaleString('en-US') + ' gp', JSON.stringify(b0));
  await page.click('[data-hs-act="of-colors"]');
  await page.waitForFunction(() => /Saved/.test(document.querySelector('.hw-cs-outfit .hh-intent-msg').textContent), null, { timeout: 15000 });
  step('CW-5 it charged exactly the price, once', await purse() === 500000 - price, await purse());
  const led = await sql(`select kind, intent from public.player_ledger where user_id = $1 and split_part(intent, ':', 1) = 'hero_colors_set'`, [uid]);
  step('CW-5 one journal row of kind shop', led.length === 1 && led[0].kind === 'shop', JSON.stringify(led));
  await page.waitForTimeout(300);
  step('CW-5 nothing left to pay for', !(await btn()).on, JSON.stringify(await btn()));
  if (shots) await a.shot('outfit-saved');

  /* ── CW-6 ── */
  const b = await world.play({ account: 'tamsel', viewport: { width: 1440, height: 900 }, shots });
  await b.createHero('Tamsel');
  await b.page.waitForFunction(async (v) => { const D = await import(location.origin + '/src/world/hero-dye.js?v=' + v); return D.heroDyeOf({ doc: document, version: v }).stats().looks >= 2; }, version, { timeout: 20000 }).catch(() => null);
  const bSt = await stats(b.page);
  step('CW-6 a second account bakes Marlow\'s look as well as its own', bSt.looks >= 2, JSON.stringify(bSt));
  if (shots) await b.shot('town-second-account');
  await page.click('[data-hs-act="of-pick"][data-outfit="sorcerer"]').catch(() => null);
  await page.click('[data-hs-act="of-dye"][data-dye="9"]');
  await page.waitForTimeout(200);
  const price2 = (await btn()).words;
  await page.click('[data-hs-act="of-colors"]');
  await page.waitForFunction(() => /Saved/.test(document.querySelector('.hw-cs-outfit .hh-intent-msg').textContent), null, { timeout: 15000 });
  const bodyBefore = (await sql('select x, y, station_id, stand_no from public.town_bodies where user_id = $1', [uid]))[0];
  await b.page.waitForFunction(async (v) => { const D = await import(location.origin + '/src/world/hero-dye.js?v=' + v); return D.heroDyeOf({ doc: document, version: v }).stats().looks >= 3; }, version, { timeout: 20000 }).catch(() => null);
  const bSt2 = await stats(b.page);
  step('CW-6 the second account bakes the new look from its next delta, the hero standing still', bSt2.looks >= 3, JSON.stringify(bSt2) + ' ' + price2);
  const bodyAfter = (await sql('select x, y, station_id, stand_no from public.town_bodies where user_id = $1', [uid]))[0];
  step('CW-6 saving a color moved no one', JSON.stringify(bodyBefore) === JSON.stringify(bodyAfter), JSON.stringify([bodyBefore, bodyAfter]));
  if (shots) await b.shot('town-second-account-after');
  await b.close();

  /* ── CW-7 ── */
  const paid = await purse();
  await page.click('[data-hs-act="of-pick"][data-outfit="sorcerer"]').catch(() => null);
  await page.click('[data-hs-act="of-save"]');
  await page.waitForFunction(() => /Saved/.test(document.querySelector('.hw-cs-outfit .hh-intent-msg').textContent), null, { timeout: 15000 });
  await a.reload();
  await page.waitForSelector('.char-row, .hs-launchers');
  if (await page.$('[data-app="play"][data-slot="0"]')) await page.click('[data-app="play"][data-slot="0"]');
  await page.waitForSelector('.hs-launchers');
  await page.keyboard.press('c');
  await page.waitForSelector('[data-hs-win="character"] [data-hs-built]');
  await page.click('[data-hs-win="character"] .hw-tab[data-tab="outfit"]');
  await page.waitForSelector('.hw-of-dye.is-on', { timeout: 15000 });
  await page.waitForTimeout(300);
  const pressed = await page.evaluate(() => { const s = document.querySelector('.hw-of-swatch[aria-pressed="true"]'); return s ? Number(s.getAttribute('data-dye')) : null; });
  step('CW-7 a reload shows the saved color pressed, from the server', pressed === 9, pressed);
  step('CW-7 changing outfit charged nothing', await purse() === paid, await purse());
  const worn = (await sql('select outfit_id, base_colors from public.player_outfits where user_id = $1 and slot = 0', [uid]))[0];
  step('CW-7 the colors followed the hero onto the new outfit', worn.outfit_id === 'sorcerer' && worn.base_colors.head === 9, JSON.stringify(worn));

  /* ── CW-8 ── */
  await sql(`update public.hr_sink_rules set price_base = price_base + 500 where sink_id = 'hero_colors'`);
  await page.click('[data-hs-act="of-dye"][data-dye="3"]');
  await page.waitForTimeout(200);
  const was8 = await purse();
  await page.click('[data-hs-act="of-colors"]');
  await page.waitForFunction(() => /changed/.test(document.querySelector('.hw-cs-outfit .hh-intent-msg').textContent), null, { timeout: 15000 });
  step('CW-8 a stale price says so and charges nothing', await purse() === was8, await purse());
  await page.waitForTimeout(600);
  const b8 = await btn();
  step('CW-8 the button shows the new price', b8.words === 'Save colors: ' + (price + 500).toLocaleString('en-US') + ' gp', JSON.stringify(b8));
  await sql(`update public.hr_sink_rules set price_base = price_base - 500 where sink_id = 'hero_colors'`);
  await page.waitForTimeout(100);

  /* ── CW-9 ── */
  await sql(`update public.hr_sink_rules set per_day = 2 where sink_id = 'hero_colors'`);
  await a.reload();
  await page.waitForSelector('.char-row, .hs-launchers');
  if (await page.$('[data-app="play"][data-slot="0"]')) await page.click('[data-app="play"][data-slot="0"]');
  await page.waitForSelector('.hs-launchers');
  await page.keyboard.press('c');
  await page.waitForSelector('[data-hs-win="character"] [data-hs-built]');
  await page.click('[data-hs-win="character"] .hw-tab[data-tab="outfit"]');
  await page.waitForSelector('.hw-of-dye.is-on', { timeout: 15000 });
  await page.click('[data-hs-act="of-dye"][data-dye="4"]');
  await page.waitForTimeout(200);
  const was9 = await purse();
  await page.click('[data-hs-act="of-colors"]');
  await page.waitForFunction(() => /times a day/.test(document.querySelector('.hw-cs-outfit .hh-intent-msg').textContent), null, { timeout: 15000 }).catch(() => null);
  const said9 = await page.evaluate(() => document.querySelector('.hw-cs-outfit .hh-intent-msg').textContent);
  step('CW-9 past the cap the words say so, with the row\'s number', said9 === 'A hero can change colors 2 times a day. More after midnight UTC.', said9);
  step('CW-9 and nothing is charged', await purse() === was9, await purse());
  if (shots) await a.shot('outfit-limit');
  await sql(`update public.hr_sink_rules set per_day = 100 where sink_id = 'hero_colors'`);

  /* ── CW-10 ── */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await a.enterHunt('mill_cellar');
  await page.keyboard.press('c');
  await page.waitForSelector('[data-hs-win="character"] [data-hs-built]');
  await page.click('[data-hs-win="character"] .hw-tab[data-tab="outfit"]');
  await page.waitForSelector('.hw-of-dye.is-on', { timeout: 15000 });
  await page.click('[data-hs-act="of-dye"][data-dye="12"]');
  await page.waitForTimeout(200);
  const was10 = await purse();
  await page.click('[data-hs-act="of-colors"]');
  await page.waitForFunction(() => /Saved/.test(document.querySelector('.hw-cs-outfit .hh-intent-msg').textContent), null, { timeout: 15000 }).catch(() => null);
  step('CW-10 a hunting hero saves, once', (await purse()) < was10, JSON.stringify([was10, await purse(), await page.evaluate(() => document.querySelector('.hw-cs-outfit .hh-intent-msg').textContent)]));
  const open = (await sql('select count(*)::int n from public.hunt_sessions where user_id = $1 and ended_at is null', [uid]))[0].n;
  step('CW-10 the hunt runs on', open === 1, open);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  const st10 = await stats(page);
  step('CW-10 the hunt screen draws the hero from its sheet', st10.looks >= 1, JSON.stringify(st10));
  if (shots) await a.shot('hunt-dyed');

  /* ── CW-11 ── */
  step('CW-11 no console errors', a.errors.length === 0 && b.errors.length === 0, [...a.errors, ...b.errors].slice(0, 5).join(' | '));
  step('CW-11 nothing left the machine', a.offsite.length === 0 && world.offsite.length === 0, [...a.offsite, ...world.offsite].slice(0, 5).join(' | '));
} catch (e) {
  console.error('hero-colors-world: HARNESS ' + (e && e.stack || e));
  code = 2;
} finally {
  await world.close();
}
if (code) process.exit(code);
console.log(fails.length ? `\nhero-colors-world: RED (${fails.length}) in ${Math.round((Date.now() - t0) / 1000)} s` : `\nhero-colors-world: green in ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(fails.length ? 1 : 0);
