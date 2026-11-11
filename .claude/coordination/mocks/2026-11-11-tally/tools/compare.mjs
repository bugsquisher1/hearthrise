import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const ROOT = 'R:/the game/the game/.claude/worktrees/agent-ae4c2c53866129ee3';
const DIR = ROOT + '/.claude/coordination/mocks/2026-11-11-tally';
const { chromium } = await import(pathToFileURL(ROOT + '/node_modules/playwright/index.mjs').href);
const { launchOptions } = await import(pathToFileURL(ROOT + '/tests/_chrome.mjs').href);
const pairs = {
  desktop: [['before/d-01-fresh.png', 'after/d-01-fresh-win.png', 'First visit, nothing taken'],
    ['before/d-05-hunting.png', 'after/d-03-hunting-win.png', 'Hunting, 9-10 of 25 rats'],
    ['before/d-09-three-held.png', 'after/d-06-capped-full-win.png', 'Three held, the day\'s pay used up']],
  phone: [['before/m-01-fresh.png', 'after/m-01-fresh.png', 'First visit, nothing taken'],
    ['before/m-05-hunting.png', 'after/m-03-hunting.png', 'Hunting'],
    ['before/m-09-three-held.png', 'after/m-06-capped-full.png', 'Three held, the day\'s pay used up']],
};
const browser = await chromium.launch(launchOptions());
for (const [name, list] of Object.entries(pairs)) {
  const crop = name === 'desktop';
  const html = '<html><body style="margin:0;padding:16px;background:#0a0b0e;color:#d6e0f0;font:16px system-ui">'
    + list.map(([b, a, t]) => '<h3 style="margin:10px 0 6px;color:#e8c547">' + t + '</h3><div style="display:flex;gap:16px;align-items:flex-start">'
      + '<figure style="margin:0"><figcaption>Today</figcaption>' + (crop ? '<div style="width:460px;height:590px;overflow:hidden;position:relative"><img src="' + b + '" style="position:absolute;left:-960px;top:-' + (b.includes('d-05') ? 76 : 120) + 'px"></div>' : '<img src="' + b + '">') + '</figure>'
      + '<figure style="margin:0"><figcaption>Mock</figcaption><img src="' + a + '"></figure></div>').join('') + '</body></html>';
  writeFileSync(DIR + '/compare-' + name + '.html', html);
  const page = await browser.newPage({ viewport: { width: crop ? 980 : 1900, height: 800 } });
  await page.goto(pathToFileURL(DIR + '/compare-' + name + '.html').href);
  await page.waitForTimeout(500);
  await page.screenshot({ path: DIR + '/compare-' + name + '.png', fullPage: true });
}
await browser.close();
