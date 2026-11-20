#!/usr/bin/env node
// tools/balance-program/items/play-items.mjs: THE ITEM LOOP AS A NEW ACCOUNT MEETS IT (balance program dive 23, "play what a player can reach").
// A private headless world (tools/qa/local-world.mjs openWorld: the real play.html and engine on the replayed chain, no production, no
// secrets). A fresh account hunts the Mill Cellar and the Thicket, comes back to town and opens every window; the text of each screen is
// written to --out so the dive reads what a player reads. It asserts nothing: a playing tool, not a guard.
//
//   node tools/balance-program/items/play-items.mjs --out <dir> [--minutes 90]
// Exit 0 when it played to the end, 2 on a harness error.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openWorld } from '../../qa/local-world.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const out = arg('out');
if (!out) { console.error('give --out <dir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
let n = 0;
const save = (name, text) => { const f = join(out, String(++n).padStart(2, '0') + '-' + name + '.txt'); writeFileSync(f, text); console.log('wrote ' + f + ' (' + text.length + ' chars)'); };
const quiet = (p) => p.catch((e) => { console.log('  (skipped: ' + String(e.message).split('\n')[0].slice(0, 140) + ')'); return null; });

const world = await openWorld({ tickMs: false });
try {
  const p = await world.play({ account: 'itemsdive', viewport: { width: 1440, height: 900 }, shots: join(out, 'shots') });
  const page = p.page;
  page.setDefaultTimeout(15000);
  await p.createHero('Brannoch');
  save('town-first', await p.text());
  const launchers = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-open]')).map((b) => b.getAttribute('data-hs-open')));
  console.log('launchers: ' + [...new Set(launchers)].join(', '));

  await p.enterHunt('mill_cellar');
  await world.skip(45);
  await page.waitForTimeout(4000);
  save('cellar-after-45', await p.text());
  await p.shot('cellar-end');
  /* the end card's Next ground, as a player presses it; else the Hunts window */
  const next = await page.$('[data-hs-win="hunt-summary"] [data-hs-act="next-ground"]');
  if (next) { await quiet(next.click()); await quiet(page.click('.hw-hunt-enter')); }
  else { await quiet(page.click('[data-hs-act="leave"]')); await quiet(p.enterHunt('meadowbrook_thicket')); }
  await quiet(page.waitForSelector('[data-hs-act="leave"]'));
  await world.skip(Number(arg('minutes', '90')));
  await page.waitForTimeout(4000);
  save('thicket-during', await p.text());
  await quiet(page.click('[data-hs-act="leave"]'));
  await page.waitForTimeout(3000);
  save('thicket-summary', await p.text());
  await p.shot('thicket-summary');
  /* close whatever is open, then open every launcher in turn and keep its words */
  const closeAll = async () => { for (let i = 0; i < 4; i++) { const x = await page.$('[data-hs-win] [data-hs-act="close"], .hs-win-close'); if (!x) break; await quiet(x.click()); await page.waitForTimeout(200); } };
  await closeAll();
  for (const id of [...new Set(launchers)]) {
    await quiet(page.click('[data-hs-open="' + id + '"]'));
    await page.waitForTimeout(1500);
    const text = await page.evaluate((wid) => { const w = document.querySelector('[data-hs-win="' + wid + '"]') || Array.from(document.querySelectorAll('[data-hs-win]')).pop(); return w ? w.innerText : '(no window)'; }, id);
    save('win-' + id, text);
    await p.shot('win-' + id);
    await closeAll();
  }
  /* back in town for certain, then the loot's own road: the bag, one piece's menu, Dispatch, and a bench */
  await quiet(page.waitForFunction(() => !document.querySelector('[data-hs-act="leave"]'), null, { timeout: 60000 }));
  await closeAll();
  const winText = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win], .hs-menu, [role="menu"], [role="dialog"]')).map((w) => w.innerText).join(' ----- '));
  await quiet(page.click('[data-hs-open="inventory"]'));
  await page.waitForTimeout(1200);
  save('town-bag', await winText());
  const gear = await page.$('.hw-pocket[data-item*="bronze"], .hw-pocket[data-item]');
  if (gear) { await quiet(gear.click({ button: 'right' })); await page.waitForTimeout(800); save('town-bag-item-menu', await p.text()); await p.shot('item-menu'); await quiet(page.keyboard.press('Escape')); }
  const disp = await page.evaluateHandle(() => Array.from(document.querySelectorAll('button')).find((b) => /Dispatch loot/.test(b.innerText)));
  if (disp && disp.asElement()) { await quiet(disp.asElement().click()); await page.waitForTimeout(2500); save('town-dispatch', await p.text()); await p.shot('dispatch'); }
  await closeAll();
  await quiet(page.click('[data-hs-open="skills-trade"]'));
  await page.waitForTimeout(800);
  for (const skill of ['Cooking', 'Smithing', 'Fishing']) {
    const b = await page.evaluateHandle((name) => Array.from(document.querySelectorAll('[data-hs-win] button, [data-hs-win] [role="button"], [data-hs-win] li, [data-hs-win] [data-skill]')).find((x) => x.innerText && x.innerText.trim().startsWith(name)), skill);
    if (b && b.asElement()) { await quiet(b.asElement().click()); await page.waitForTimeout(2000); save('skill-' + skill, await p.text()); await p.shot('skill-' + skill); await closeAll(); await quiet(page.click('[data-hs-open="skills-trade"]')); await page.waitForTimeout(600); }
  }
  save('errors', JSON.stringify({ errors: p.errors, offsite: p.offsite }, null, 1));
} catch (e) { console.error('HARNESS ' + (e && e.stack || e)); process.exitCode = 2; } finally { await world.close(); }
