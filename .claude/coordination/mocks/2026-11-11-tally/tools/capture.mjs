import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
const ROOT = 'R:/the game/the game/.claude/worktrees/agent-ae4c2c53866129ee3';
const OUT = ROOT + '/.claude/coordination/mocks/2026-11-11-tally/before';
mkdirSync(OUT + '/dom', { recursive: true });
const { openWorld } = await import(pathToFileURL(ROOT + '/tools/qa/local-world.mjs').href);
const world = await openWorld({ tickMs: false });
const sizes = [['d', { width: 1440, height: 900 }, false], ['m', { width: 922, height: 423 }, true]];
const ps = [];
for (const [tag, viewport, touch] of sizes) {
  const p = await world.play({ account: 'tally' + tag, viewport, touch });
  await p.createHero(tag === 'd' ? 'Marlow' : 'Wren');
  ps.push([tag, p]);
}
const settle = (p) => p.page.waitForTimeout(2500);
async function openTally(p) {
  const on = await p.page.$('.hw-tally');
  if (!on) await p.page.click('[data-hs-open="tally"]');
  await p.page.waitForSelector('.hw-tally');
  await p.page.waitForFunction(() => !document.querySelector('.ht-wait.is-on') || /Hearth/.test(document.querySelector('.ht-wait').textContent), null, { timeout: 30000 }).catch(() => {});
  await settle(p);
}
async function closeTally(p) {
  const b = await p.page.$('[data-hs-open="tally"][aria-pressed="true"]');
  if (b) { await b.click().catch(() => {}); await settle(p); }
  if (await p.page.$('.hw-tally')) { await p.page.keyboard.press('q').catch(() => {}); await settle(p); }
}
const scrollWin = (p, top) => p.page.evaluate((top) => {
  const el = document.querySelector('.hw-tally'); let s = el;
  while (s && s.scrollHeight <= s.clientHeight + 2) s = s.parentElement;
  if (s) s.scrollTop = top ? 0 : s.scrollHeight;
}, top);
async function shot(p, tag, name) {
  await p.page.screenshot({ path: OUT + '/' + tag + '-' + name + '.png' });
  const win = await p.page.$('.hw-tally');
  if (win) {
    writeFileSync(OUT + '/dom/' + tag + '-' + name + '.txt', await win.evaluate((el) => el.innerText));
    const box = await win.evaluate((el) => { let f = el; while (f.parentElement && !/hs-win|hw-window|sheet/.test(f.className)) f = f.parentElement; const r = (f.parentElement ? f : el).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, cls: f.className }; });
    writeFileSync(OUT + '/dom/' + tag + '-' + name + '.box.json', JSON.stringify(box));
  }
  writeFileSync(OUT + '/dom/' + tag + '-' + name + '.html', await p.page.evaluate(() => { const d = document.documentElement.cloneNode(true); d.querySelectorAll('script').forEach((s) => s.remove()); return d.outerHTML; }));
  console.log('shot', tag, name);
}
try {
  for (const [tag, p] of ps) { await openTally(p); await shot(p, tag, '01-fresh'); await scrollWin(p, false); await settle(p); await shot(p, tag, '02-fresh-foot'); await scrollWin(p, true); }
  for (const [tag, p] of ps) {
    await p.page.click('[data-hs-act="take"][data-task="cellar_giant_rats"]');
    await p.page.waitForSelector('.ht-held .ht-tally');
    await settle(p); await shot(p, tag, '03-took-rats');
  }
  for (const [, p] of ps) { await closeTally(p); await p.enterHunt('mill_cellar'); }
  await world.skip(2);
  for (const [tag, p] of ps) { await p.page.waitForTimeout(4000); await p.page.screenshot({ path: OUT + '/' + tag + '-04-hunting-hud.png' }); await openTally(p); await shot(p, tag, '05-hunting'); await closeTally(p); }
  await world.skip(8);
  for (const [tag, p] of ps) {
    await p.page.waitForTimeout(3000);
    await p.page.screenshot({ path: OUT + '/' + tag + '-06-hunting-done-hud.png' });
    await p.page.click('[data-hs-act="leave"]');
    await p.page.waitForFunction(() => /Mill Cellar/.test(document.querySelector('.hsum-card .hsum-title')?.textContent || ''), null, { timeout: 90000 }).catch(() => console.log('no summary'));
    await p.page.waitForTimeout(3000);
    await p.page.screenshot({ path: OUT + '/' + tag + '-07-back-in-town.png' });
    await openTally(p); await p.page.waitForTimeout(4000); await shot(p, tag, '08-paid');
  }
  for (const [tag, p] of ps) {
    for (const id of ['thicket_gray_wolves', 'wickstead_turncoats', 'glade_poachers']) {
      const b = await p.page.$('[data-hs-act="take"][data-task="' + id + '"]:not([disabled])');
      if (b) { await b.click(); await p.page.waitForTimeout(3000); }
    }
    await settle(p); await shot(p, tag, '09-three-held'); await scrollWin(p, false); await settle(p); await shot(p, tag, '10-three-held-foot');
  }
  for (const [tag, p] of ps) console.log(tag, 'errors', p.errors.length, JSON.stringify(p.errors.slice(0, 3)));
} catch (e) { console.error('FAIL', e); for (const [tag, p] of ps) await p.page.screenshot({ path: OUT + '/' + tag + '-zz-fail.png' }).catch(() => {}); }
await world.close();
process.exit(0);
