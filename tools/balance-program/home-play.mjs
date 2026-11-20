#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/home-play.mjs — THE HOME DOMAIN, PLAYED ON THE LOCAL WORLD (balance program, dive 26).
//
// A brand-new account on tools/qa/local-world.mjs (the real play.html and engine on the replayed chain, no production, no secrets):
// it opens the House, the Farm, Storage and Training exactly as a player does (the launcher and its windows), prints the words
// each screen shows, and counts the presses a farm visit takes. Then, in THIS PROCESS'S IN-MEMORY DATABASE ONLY, it sets the
// throwaway account's purse so the upper rungs' screens can be read (their words, gates and prices as the server sends them);
// that part reads screens, it is not played economy, and the dive says so beside everything it took from it.
//
//   node tools/balance-program/home-play.mjs [--shots DIR]
//
// mutant-anchors: none — a manual play script of the balance program, not a guard
// ════════════════════════════════════════════════════════════════════════
import { openWorld } from '../qa/local-world.mjs';

const shots = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();
const world = await openWorld({ tickMs: false, liveCalendar: true });
const p = await world.play({ account: 'homedive', viewport: { width: 1440, height: 900 }, shots });
const page = p.page;
const say = (h, t) => console.log('\n===== ' + h + ' =====\n' + String(t || '').replace(/\n{2,}/g, '\n').trim());
const win = async (id) => { const el = await page.$('.hs-window[data-hs-window="' + id + '"], [data-hs-win="' + id + '"], .hs-win[data-id="' + id + '"]'); return el ? el.innerText() : null; };
const openWin = async (id) => {
  /* the launcher's own door: an icon, or an item of a group's menu */
  const direct = await page.$('.hs-launchers [data-hs-open="' + id + '"]');
  if (direct) { await direct.click(); } else {
    for (const g of await page.$$('.hs-launchers [data-hs-group]')) {
      await g.click();
      const item = await page.$('[data-hs-act="launch-pick"][data-hs-open="' + id + '"]');
      if (item) { await item.click(); break; }
      await page.keyboard.press('Escape');
    }
  }
  await page.waitForTimeout(900);
};
const windowsText = () => page.evaluate(() => [...document.querySelectorAll('[class*="hs-win"]')].filter((e) => e.offsetParent && /hs-win(dow)?(\s|$)/.test(e.className)).map((e) => e.innerText).join('\n-----\n'));
const closeAll = async () => { for (let i = 0; i < 4; i++) await page.keyboard.press('Escape'); await page.waitForTimeout(200); };

try {
  await p.createHero('Homedive');
  await p.shot('town');
  say('LAUNCHER (what a new hero can open)', await page.evaluate(() => [...document.querySelectorAll('.hs-launchers [data-hs-open], .hs-launchers [data-hs-group]')].map((e) => (e.getAttribute('data-hs-open') || 'group:' + e.getAttribute('data-hs-group')) + ' = ' + (e.getAttribute('aria-label') || e.title || e.innerText)).join('\n')));

  for (const id of ['house', 'farm', 'storage', 'training']) {
    await openWin(id);
    say('LEVEL 1: ' + id.toUpperCase(), await windowsText());
    await p.shot('l1-' + id);
    await closeAll();
  }

  /* THE FARM VISIT, COUNTED: plant both beds, pass the crop's hours, harvest and replant each, water each. */
  await openWin('farm');
  let presses = 0;
  const byText = (t) => page.getByRole('button', { name: t, exact: true });
  const press = async (loc) => { const b = loc.first(); if (!(await b.count()) || !(await b.isVisible()) || !(await b.isEnabled())) return false; await b.click(); presses++; await page.waitForTimeout(1500); return true; };
  await press(byText('Plant'));
  await press(byText('Plant 2 empty plots'));
  say('FARM after planting (presses ' + presses + ')', await windowsText());
  await world.wait(300);
  await p.reload();
  await openWin('farm');
  let visit = 0;
  while (await press(byText('Harvest and replant'))) { visit++; if (visit > 20) break; }
  say('FARM after harvest-and-replant x' + visit, await windowsText());
  let waters = 0;
  while (await press(byText('Water'))) { waters++; if (waters > 20) break; }
  say('FARM after water x' + waters + ' (a 2-bed visit: ' + (visit + waters) + ' presses)', await windowsText());
  await p.shot('farm-visit');
  await closeAll();

  /* READING THE UPPER SCREENS: the purse of this throwaway account, in this process's database only. */
  await world.db.query("update public.account_wallet set gold = 20000000");
  await p.reload();
  await openWin('house');
  say('HOUSE with a full purse, no materials (what the screen asks for)', await windowsText());
  await p.shot('house-rich');
  await closeAll();
  await openWin('training');
  say('TRAINING with a full purse at Level 1', await windowsText());
  await closeAll();
  await openWin('storage');
  say('STORAGE with a full purse', await windowsText());
  await p.shot('storage-rich');
  say('CONSOLE ERRORS', p.errors.join('\n') || 'none');
} catch (e) {
  say('SCRIPT STOPPED', e && e.stack || e);
  try { say('SCREEN', (await p.text()).slice(0, 3000)); } catch { /* the page is gone */ }
} finally {
  await world.close();
  void win;
}
