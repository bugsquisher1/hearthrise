#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/town-works-world.mjs — THE TOWN WORKS, PLAYED: A FRESH ACCOUNT, THE REAL RENDERER, THE REAL MAP, NO PRODUCTION.
//
//   node tests/town-works-world.mjs [--shots DIR]     exit 0 green, 1 red, 2 harness
//
// tools/qa/local-world.mjs: the real play.html and engine on the replayed chain, a brand-new account from the sign-in screen. Totals and purses are set in this process's in-memory
// database only, so the walk reaches each stage without 40 days of gifts; nothing here touches production. A manual walk (tests/guards-unregistered.json); the rules are
// mutation-proven in CI by tests/town-works.mjs.
//
//   WW-1  every stage at 1366x768 on the real map with real lighting, drawn from the town read alone: the hero stands on the high street in front of the lot
//   WW-2  a tap on the plaque opens Havora on Works, on the server's numbers
//   WW-3  a press gives: the purse drops from the envelope, one journal row, the total rises, the plaque names the hero, the field remembers the gift after a reload
//   WW-4  a press over today's cap says why and charges nothing
//   WW-5  a gift across a stage: the map swaps for this viewer and the System tab says the town's line, once
//   WW-6  a hero walks to row 54 behind stage 4 and to row 61 in front of it (the order itself is TW-MAP's, on this map's real compose; these are the shots to read)
//   WW-7  finished: the works_done line, the building stands, a tap on it opens the Market, the plaque stays
//   WW-8  no console errors, nothing left the machine
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
  console.log((ok ? '  ok   ' : '  RED  ') + name + (ok ? '' : ' -- ' + String(got).slice(0, 700)) + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  if (!ok) fails.push(name);
};

const world = await openWorld({ tickMs: false });
step('world up: chain replayed and opened, engine loaded', true);
let code = 0;
try {
  const sql = async (q, a) => (await world.db.query(q, a)).rows;
  const p = await world.play({ account: 'marlowworks', viewport: { width: 1366, height: 768 }, shots });
  await p.createHero('Marlow');
  const page = p.page;
  /* THE WORLD'S OWN HANDLE, for this walk only and with nothing shipped: the file is rewritten as it's served to this one browser, so a tap lands where the World says a tile is. */
  await page.evaluate(async () => { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((r) => r.unregister())); });
  await page.route('**/src/world/world-boot.js*', async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace(/return \{\s*sync,/, 'return window.__worldForTest = {\n    walkTo: (to) => { if (walk) walk.goTo(to, performance.now()); },\n    sync,');
    await route.fulfill({ response: res, body });
  });
  const uid = (await sql("select user_id from public.character_names where name = 'Marlow'"))[0].user_id;
  const purse = async () => Number((await sql('select gold from public.account_wallet where user_id = $1', [uid]))[0].gold);
  const textOf = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
  const waitText = (sel, re, ms = 30000) => page.waitForFunction(([s, r]) => { const e = document.querySelector(s); return !!e && new RegExp(r).test(e.textContent || ''); }, [sel, re.source], { timeout: ms }).then(() => true, () => false);
  const closeWindow = async (id) => { const b = await page.$(`[data-hs-win="${id}"] [data-hs-close]`); if (b) await b.click(); };
  const setTotal = (n) => sql("insert into public.town_works_totals (project_id, total) values ('weighhouse', $1) on conflict (project_id) do update set total = excluded.total", [n]);
  const WIN = '[data-hs-win="havora"]';
  /* a real tap on tile (x, y), as the player's finger lands, through the World's own screen mapping */
  const tapTile = async (x, y) => {
    const pt = await page.evaluate(([tx, ty]) => (window.__worldForTest ? window.__worldForTest.screenOf(tx, ty) : null), [x, y]);
    if (!pt) throw new Error('no world probe for a tap');
    await page.mouse.click(pt.x, pt.y);
  };
  /* where the World draws things this frame */
  const walkOf = () => page.evaluate(() => (window.__worldForTest ? window.__worldForTest.stats().walk : null));
  /* until the World draws this art on the lot (the next town read carries it) */
  const worksArt = (art, ms = 30000) => page.waitForFunction((a) => {
    const s = window.__worldForTest && window.__worldForTest.stats();
    return !!s && !!s.walk && (a === null ? s.walk.works === null : !!s.walk.works && s.walk.works.havora_weighhouse_staked === a);
  }, art, { timeout: ms }).then(() => true, () => false);

  await sql('update public.account_wallet set gold = 2000000 where user_id = $1', [uid]);
  await sql('update public.player_state set level_xp = public.hr_char_xp_for_level(17) where user_id = $1', [uid]);
  await p.reload();
  await page.waitForSelector('[data-hs-open="havora"]', { timeout: 30000 });

  // ── WW-1 ── every stage, from the town read alone. The hero is set down on the high street, in front of the plaque (plan 103, 54 = map 127, 54).
  const stageArt = [[0, null, 'staked'], [100000, 'havora_weighhouse_footings', 'footings'], [300000, 'havora_weighhouse_framed', 'framed'], [600000, 'havora_weighhouse_walled', 'walled'], [1000000, 'havora_weighhouse_finished', 'finished']];
  const here = await walkOf();
  step('WW-1 the World reports its frame', !!here, JSON.stringify(here));
  const canWalk = !!here;
  if (canWalk) {
    await page.evaluate(() => window.__worldForTest.walkTo([120, 53]));
    await page.waitForFunction(() => { const c = window.__worldForTest.stats().walk.cell; return c && c[0] === 120 && c[1] === 53; }, null, { timeout: 60000 }).catch(() => {});
  }
  for (const [t, art, name] of stageArt) {
    await setTotal(t);
    const drawn = await worksArt(art);
    step(`WW-1 ${name} draws from the town read (${t} gp)`, drawn, JSON.stringify((await walkOf() || {}).works));
    await page.waitForTimeout(400);
    await p.shot('stage-' + name);
  }
  await setTotal(99000);
  await worksArt(null);

  // ── WW-2 ──
  const plaqueOpens = await (async () => {
    await page.evaluate(() => window.__worldForTest.walkTo([128, 55]));
    await page.waitForTimeout(3500);
    await tapTile(127, 53);
    return waitText(WIN + ' .hv-works-stage', /Staked out: 99,000 of 1,000,000 gp/);
  })();
  step('WW-2 a tap on the plaque opens Works on the server\'s numbers', plaqueOpens, await textOf(WIN));
  await page.waitForTimeout(500);
  await p.shot('works-window');

  // ── WW-3 ──
  const before = await purse();
  await page.click(WIN + ' [data-amount="1000"]');
  const gave = await waitText(WIN + ' .hv-works-msg', /Gave 1,000 gp/);
  const footings = await worksArt('havora_weighhouse_footings');
  step('WW-3 a press gives 1,000 gp', gave && (await purse()) === before - 1000, JSON.stringify({ msg: await textOf(WIN + ' .hv-works-msg'), purse: await purse(), before }));
  step('WW-5 a gift across a stage swaps the map for this viewer', footings, JSON.stringify((await walkOf() || {}).works));
  const shown = await waitText(WIN + ' .hv-gold', /1,999,000 gp/);
  step('WW-3 the purse drops from the envelope', shown, await textOf(WIN + ' .hv-gold'));
  const ledger = await sql("select intent, slot from public.player_ledger where user_id = $1 and kind = 'shop' order by at", [uid]);
  step('WW-3 one journal row, kind shop', ledger.length === 1 && ledger[0].intent === 'town_works:weighhouse:1000', JSON.stringify(ledger));
  const onPlaque = await waitText(WIN + ' .hv-works-plaque', /Marlow.*1,000 gp/);
  const placed = await waitText(WIN + ' .hv-works-me', /You're 1st, with 1,000 gp given\./);
  step('WW-3 the plaque names the hero, the window its place', onPlaque && placed, JSON.stringify({ plaque: await textOf(WIN + ' .hv-works-plaque'), me: await textOf(WIN + ' .hv-works-me') }));
  await page.waitForTimeout(300);
  await p.shot('works-gave');
  await page.fill(WIN + ' .hv-works-amount', '700');
  await page.click(WIN + ' [data-hs-act="works-typed"]');
  await waitText(WIN + ' .hv-works-msg', /Gave 700 gp/);
  await p.reload();
  await page.waitForSelector('[data-hs-open="havora"]', { timeout: 30000 });
  await page.click('[data-hs-open="havora"]');
  await page.click(WIN + ' [data-tab="works"]');
  await waitText(WIN + ' .hv-works-stage', /Footings/);
  const remembered = await page.waitForFunction((s) => { const e = document.querySelector(s); return !!e && e.value === '700'; }, WIN + ' .hv-works-amount', { timeout: 15000 }).then(() => true, () => false);
  step('WW-3 after a reload the field opens on the last gift', remembered, await page.evaluate((s) => document.querySelector(s).value, WIN + ' .hv-works-amount'));

  // ── WW-4 ──
  const purse4 = await purse();
  await page.fill(WIN + ' .hv-works-amount', '24000');
  await page.click(WIN + ' [data-hs-act="works-typed"]');
  const overWords = await waitText(WIN + ' .hv-works-msg', /You can give 23,300 gp more today\./);
  step('WW-4 over today\'s cap says why and charges nothing', overWords && (await purse()) === purse4, JSON.stringify({ msg: await textOf(WIN + ' .hv-works-msg'), purse: await purse(), was: purse4 }));
  await page.waitForTimeout(300);
  await p.shot('works-over');
  const maxWords = await waitText(WIN + ' .hv-works-max', /Give the 23,300 gp left today/);
  step('WW-4 the last button names what\'s left today', maxWords, await textOf(WIN + ' .hv-works-max'));

  // ── WW-5 ──
  await closeWindow('havora');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-hs-win="chat"] .hc-field', { timeout: 15000 });
  await page.click('[data-hs-win="chat"] [data-tab="system"]');
  const heard = await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-hs-win="chat"] .hc-line.is-system')).filter((l) => /The Weighhouse has its footings\./.test(l.textContent)).length === 1, null, { timeout: 15000 }).then(() => true, () => false);
  step('WW-5 the System tab says the town\'s line, once, naming no hero', heard, await textOf('[data-hs-win="chat"]'));
  await page.waitForTimeout(300);
  await p.shot('system-line');
  await closeWindow('chat');

  // ── WW-6 ── a hero on rows 53-54 stands behind stage 4; a hero south of the lot in front of it
  await setTotal(1000000);
  await worksArt('havora_weighhouse_finished');
  await page.evaluate(() => window.__worldForTest.walkTo([122, 54]));
  await page.waitForFunction(() => { const c = window.__worldForTest.stats().walk.cell; return c && c[0] === 122 && c[1] === 54; }, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(600);
  const north = await walkOf();
  step('WW-6 a hero reaches row 54, behind stage 4', north && north.cell[1] === 54, JSON.stringify(north && north.cell));
  await p.shot('hero-behind-finished');
  await page.evaluate(() => window.__worldForTest.walkTo([122, 61]));
  await page.waitForFunction(() => { const c = window.__worldForTest.stats().walk.cell; return c && c[0] === 122 && c[1] === 61; }, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(600);
  const south = await walkOf();
  step('WW-6 a hero reaches row 61, in front of stage 4', south && south.cell[1] === 61, JSON.stringify(south && south.cell));
  await p.shot('hero-front-finished');

  // ── WW-7 ──
  const purse7 = await purse();
  await tapTile(122, 58);
  const market = await page.waitForSelector('[data-hs-win="market"]', { timeout: 15000 }).then(() => true, () => false);
  step('WW-7 a tap on the finished Weighhouse opens the Market', market, await textOf('body').then((t) => String(t).slice(0, 200)));
  await page.waitForTimeout(500);
  await p.shot('finished-market');
  await closeWindow('market');
  await page.click('[data-hs-open="havora"]');
  await page.click(WIN + ' [data-tab="works"]');
  const doneWords = await waitText(WIN + ' .hv-works-next', /The Weighhouse is finished\. Nothing else is being built right now\./);
  const stays = await waitText(WIN + ' .hv-works-plaque', /Marlow/);
  step('WW-7 the window says it\'s finished, the plaque stays', doneWords && stays, await textOf(WIN));
  await page.waitForTimeout(300);
  await p.shot('works-finished');
  const gaveLate = await page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden; }, WIN + ' .hv-works-give');
  step('WW-7 nothing more can be given', !gaveLate && (await purse()) === purse7, JSON.stringify({ gaveLate, purse: await purse(), was: purse7 }));

  // ── WW-8 ──
  step('WW-8 no console errors', p.errors.length === 0, p.errors.slice(0, 5).join(' | '));
  step('WW-8 nothing left the machine', p.offsite.length === 0 && world.offsite.length === 0, [...p.offsite, ...world.offsite].slice(0, 5).join(' | '));
} catch (e) {
  console.error('town-works-world: HARNESS ' + (e && e.stack || e));
  code = 2;
} finally {
  await world.close();
}
if (code) process.exit(code);
console.log(fails.length ? `\ntown-works-world: RED (${fails.length})` : '\ntown-works-world: green');
process.exit(fails.length ? 1 : 0);
