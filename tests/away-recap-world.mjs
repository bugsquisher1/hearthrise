#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/away-recap-world.mjs — "WHILE YOU WERE AWAY", PLAYED: REAL ABSENCES, THE REAL GAME, NO PRODUCTION.
//
//   node tests/away-recap-world.mjs [--shots DIR]     exit 0 green, 1 red, 2 harness
//
// tools/qa/local-world.mjs: the real play.html and engine on the replayed chain, a real closed tab (with its goodbye), and
// world.wait(n, { away: true }) for the absence. Needs Node 23.6+ and, on a machine's first run, about 6 min to replay the chain;
// so it is a manual tool (tests/guards-unregistered.json). The rules are mutation-proven in CI by tests/shell-core.mjs R3 and
// tests/hud-reachable.mjs HR-7, HR-9. The crafter's and the friends' panels, 2026-11-01:
//   AR-1  a hero who has only ever gathered, away 8 h at a rock: the ore gained, Mining from and to, still mining. No hunt named.
//   AR-2  the hunt ended before the player left, then a gathering job: the line is the job's and never names the hunt
//   AR-3  a bench run that runs out while away: what it made, the level gained, when and why it stopped, no "still"
//   AR-4  a hunt that ended before the player left, then nothing: no line at all
//   AR-5  a job stopped in view, then away: no line at all
//   AR-6  a hunt still running: only what the absence earned, not the whole hunt (the goodbye stamps the numbers on the way out)
//   AR-7  a page left open is not an absence: no line through a long skip
//   AR-8  nothing left the machine, and no console error but the harness's
// mutant-anchors: none — a manual walk of the real game; the rules are mutation-proven in shell-core.mjs and hud-reachable.mjs
// ════════════════════════════════════════════════════════════════════════
import { resolve as resolvePath } from 'node:path';
import { openWorld } from '../tools/qa/local-world.mjs';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? resolvePath(args[args.indexOf('--shots') + 1]) : null;
const fails = [];
const t0 = Date.now();
const step = (name, ok, got) => {
  console.log((ok ? '  ok   ' : '  RED  ') + name + (ok ? '' : ' -- ' + String(got).slice(0, 500)) + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  if (!ok) fails.push(name);
};
const VIEW = { width: 1440, height: 900 };

const world = await openWorld({ tickMs: false });
const errors = [];
const offsite = [];
const open = async (account) => {
  const p = await world.play({ account, viewport: VIEW, shots });
  p.page.on('pageerror', (e) => errors.push(account + ': ' + e.message));
  return p;
};
const enter = async (account) => {
  const p = await open(account);
  await p.page.click('[data-app="play"][data-slot="0"]');
  await p.page.waitForSelector('.hs-launchers');
  return p;
};
/* The player's two presses: the Work window on this skill, this row's Start. */
const startWork = async (p, skill, row) => {
  if (!(await p.page.$('[data-hs-win="skills-trade"]'))) await p.page.click('[data-hs-open="skills-trade"]');
  await p.page.waitForSelector('[data-hs-win="skills-trade"]');
  const back = await p.page.$('[data-hs-act="work-back"]');
  if (back && await back.isVisible()) await back.click();
  await p.page.click('[data-hs-win="skills-trade"] [data-hs-act="open-skill"][data-skill="' + skill + '"]');
  await p.page.click('[data-hs-act="work-go"][data-id="' + row + '"]');
  await p.page.waitForFunction((id) => document.querySelector('[data-hs-act="work-stop"][data-id="' + id + '"]'), row);
  await p.page.click('[data-hs-open="skills-trade"]');
  await p.page.waitForFunction(() => !document.querySelector('[data-hs-win="skills-trade"]'));
};
/* A real goodbye: the tab closes, the stamp and the debounce go on the way out. A minute after the last stamp, as a real close is. */
const leave = async (p, stampKey) => {
  await p.page.waitForTimeout(2500);
  await p.page.close({ runBeforeUnload: true });
  await new Promise((ok) => setTimeout(ok, 800));
  if (stampKey) {
    const r = await world.db.query(`select count(*)::int as n from public.player_state where client_state->'awaySeen'->>'s' like $1`, [stampKey]);
    step('CONTROL the stamp ' + stampKey + ' landed on the server', r.rows[0].n > 0, JSON.stringify(r.rows));
  }
};
const cardOf = async (p, ms = 15000) => {
  try { await p.page.waitForFunction(() => /While you were away/.test(document.querySelector('.hw-alerts')?.textContent || ''), null, { timeout: ms }); } catch { return null; }
  return p.page.evaluate(() => Array.from(document.querySelectorAll('.hw-alert-text')).map((e) => e.textContent).find((t) => /While you were away/.test(t)) || null);
};
const noCard = async (p) => { await p.page.waitForTimeout(6000); return cardOf(p, 500); };

try {
  { // AR-1 a hero who has only ever gathered
    const p = await open('gatherer');
    await p.createHero('Tessel');
    await startWork(p, 'mining', 'copper_rock');
    await leave(p, 'town:gather:copper_rock');
    await world.wait(480, { away: true });
    const q = await enter('gatherer');
    const line = await cardOf(q, 30000);
    await q.shot('ar1-gathered');
    step('AR-1 eight hours at a rock are told', !!line && /While you were away \(8 h \d+ min\), Tessel mined the Copper Rock: \+[\d,]+ Copper Ore, Mining 1 to \d+\. Still mining\./.test(line), line);
    await q.close();
  }

  { // AR-2 a hunt that ended before the player left, then a job
    const p = await open('mixer');
    await p.createHero('Mixer');
    await p.enterHunt('mill_cellar');
    await world.skip(12);
    await p.page.click('[data-hs-act="leave"]');
    await p.page.waitForSelector('[data-hs-win="hunt-summary"]', { timeout: 120000 });
    await p.page.keyboard.press('Escape');
    await startWork(p, 'mining', 'copper_rock');
    await leave(p, 'town:gather:copper_rock');
    await world.wait(180, { away: true });
    const q = await enter('mixer');
    const line = await cardOf(q, 30000);
    step('AR-2 the line is the job\'s and names no hunt', !!line && /mined the Copper Rock/.test(line) && !/hunted|Mill Cellar|hunt has ended/.test(line), line);
    await q.close();
  }

  { // AR-3 a bench run that runs out while away
    const p = await open('benchhand');
    await p.createHero('Benchy');
    await startWork(p, 'woodcutting', 'normal_tree');
    await world.wait(30);
    await p.page.waitForTimeout(1000);
    await startWork(p, 'crafting', 'saw_normal');
    await leave(p, 'town:artisan:saw_normal');
    await world.wait(480, { away: true });
    const q = await enter('benchhand');
    const line = await cardOf(q, 30000);
    await q.shot('ar3-bench');
    step('AR-3 the bench run is told, with when and why it stopped', !!line && /Benchy made Normal Plank: \+[\d,]+ Normal Plank, Crafting \d+ to \d+\. It stopped about .+ in: out of Normal Log\./.test(line), line);
    await q.close();
  }

  { // AR-4 a hunt over before the player left, then nothing
    const p = await open('homebody');
    await p.createHero('Homer');
    await p.enterHunt('mill_cellar');
    await world.skip(12);
    await p.page.click('[data-hs-act="leave"]');
    await p.page.waitForSelector('[data-hs-win="hunt-summary"]', { timeout: 120000 });
    await p.page.waitForTimeout(1000);
    await leave(p);
    await world.wait(120, { away: true });
    const q = await enter('homebody');
    const line = await noCard(q);
    step('AR-4 a hunt that ended before the absence raises no line', line === null, line);
    await q.close();
  }

  { // AR-5 a job stopped in view, then away
    const p = await open('stopper');
    await p.createHero('Stopper');
    await startWork(p, 'mining', 'copper_rock');
    await p.page.click('[data-hs-open="skills-trade"]');
    await p.page.waitForSelector('[data-hs-act="work-stop"]');
    await p.page.click('[data-hs-act="work-stop"]');
    await p.page.waitForFunction(() => !document.querySelector('[data-hs-act="work-stop"]')?.offsetWidth);
    await leave(p, 'idle');
    await world.wait(120, { away: true });
    const q = await enter('stopper');
    const line = await noCard(q);
    step('AR-5 a job stopped before the absence raises no line', line === null, line);
    await q.close();
  }

  { // AR-6 a hunt still running: only the absence's earnings
    const xpOf = (page) => page.evaluate(() => { const t = document.querySelector('.ha-analyzer'); return t ? Number(((t.innerText.match(/Level XP\s+([\d,]+)/) || [])[1] || '').replace(/,/g, '')) : null; });
    const p = await open('hunter');
    await p.createHero('Hunter');
    await p.enterHunt('mill_cellar');
    await p.page.waitForSelector('.ha-stats dd[data-stat="kills"]');
    await world.skip(30);
    await p.page.waitForTimeout(3000);
    /* the goodbye writes at most one stamp a minute: leave after that minute, as any real hunt is left */
    await p.page.waitForTimeout(62000);
    const before = await xpOf(p.page);
    await leave(p, '%-%-%-%-%');
    await world.wait(62, { away: true });
    const q = await enter('hunter');
    const line = await cardOf(q, 30000);
    const gained = Number(((line || '').match(/\+([\d,]+) Level XP/) || [])[1]?.replace(/,/g, ''));
    const after = await xpOf(q.page);
    step('AR-6 the line reports the absence, not the whole hunt', !!line && before > 0 && gained > 0 && gained <= after - before + 200 && gained < after, JSON.stringify({ line, before, after, gained }));
    await q.close();
  }

  { // AR-7 a page left open is not an absence
    const p = await open('watcher');
    await p.createHero('Watcher');
    await p.enterHunt('mill_cellar');
    await p.page.waitForSelector('.ha-stats dd[data-stat="kills"]');
    await p.page.waitForTimeout(1500);
    await world.wait(30, { away: true });
    const line = await noCard(p);
    step('AR-7 a page left open raises no line', line === null, line);
    await p.close();
  }
  step('AR-8 no page error', errors.length === 0, errors.join(' | '));
} catch (e) {
  console.error(e);
  await world.close().catch(() => {});
  process.exit(2);
}
await world.close();
console.log(fails.length ? 'away-recap-world: ' + fails.length + ' RED' : 'away-recap-world: the return tells what the absence did, gathering, bench or hunt, and nothing else');
process.exit(fails.length ? 1 : 0);
