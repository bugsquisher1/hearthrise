#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/town-shows-world.mjs — WHAT GOLD BUYS IN HAVORA, PLAYED: A FRESH ACCOUNT, THE REAL GAME, NO PRODUCTION.
//
//   node tests/town-shows-world.mjs [--shots DIR]     exit 0 green, 1 red, 2 harness
//
// tools/qa/local-world.mjs: the real play.html and engine on the replayed chain, a brand-new account from the sign-in screen. A hero is given a Level and a purse in this
// process's in-memory database only, so the walk starts at the stage the design names (Level 10, 15.7k at hour 10); nothing here touches production. A manual walk
// (tests/guards-unregistered.json); the rules are mutation-proven in CI by tests/town-shows.mjs and tests/town-crier.mjs.
//
//   SW-1  the Havora icon opens the window on the server's quote: Throw Cinnabar: 2,000 gp
//   SW-2  a press pays the first price, the purse drops from the envelope, the hero walks to the Hearth, the fire swaps to the powder's art, the line is in Local
//   SW-3  the window re-reads and quotes the next price; after a reload it opens on the color thrown last
//   SW-4  the Round tab stands a round: fireworks over Hearth Square, a line in System
//   SW-5  the Crier: a web address is refused in words and charges nothing; a clean line pays, reaches Global with its gold bar
//   SW-6  a price gone stale while the window stood open says so, charges nothing, and the window shows the new one
//   SW-7  Leaderboards, group Town: the account is on Gold Given, its lead hero's name, the sum of what it gave
//   SW-8  no console errors, nothing left the machine
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
  console.log((ok ? '  ok   ' : '  RED  ') + name + (ok ? '' : ' -- ' + String(got).slice(0, 500)) + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  if (!ok) fails.push(name);
};

const world = await openWorld({ tickMs: false });
step('world up: chain replayed and opened, engine loaded', true);
let code = 0;
try {
  const sql = async (q, a) => (await world.db.query(q, a)).rows;
  const p = await world.play({ account: 'marlowshow', viewport: { width: 1440, height: 900 }, shots });
  await p.createHero('Marlow');
  const page = p.page;
  const uid = (await sql("select user_id from public.character_names where name = 'Marlow'"))[0].user_id;
  const purse = async () => Number((await sql('select gold from public.account_wallet where user_id = $1', [uid]))[0].gold);
  const textOf = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
  const waitText = (sel, re, ms = 30000) => page.waitForFunction(([s, r]) => { const e = document.querySelector(s); return !!e && new RegExp(r).test(e.textContent || ''); }, [sel, re.source], { timeout: ms }).then(() => true, () => false);
  const closeWindow = async (id) => { const b = await page.$(`[data-hs-win="${id}"] [data-hs-close]`); if (b) await b.click(); };
  /* THE STAGE THE DESIGN NAMES: Level 10 and a purse, in this process's database */
  await sql('update public.account_wallet set gold = 100000 where user_id = $1', [uid]);
  await sql('update public.player_state set level_xp = public.hr_char_xp_for_level(10) where user_id = $1', [uid]);
  await p.reload();

  // ── SW-1 ──
  await page.waitForSelector('[data-hs-open="havora"]', { timeout: 30000 });
  await page.click('[data-hs-open="havora"]');
  const quoted = await waitText('[data-hs-win="havora"] [data-hs-act="powder"]', /Throw Cinnabar: 2,000 gp/);
  step('SW-1 the Havora icon opens the window on the server\'s quote', quoted, await textOf('[data-hs-win="havora"]'));
  await page.waitForTimeout(500);   // the window's own fade
  await p.shot('havora-hearth');

  // ── SW-2 ──
  const before = await purse();
  await page.click('[data-hs-win="havora"] [data-hs-act="powder"]');
  const paid = await waitText('[data-hs-win="havora"] .hh-intent-msg', /Paid 2,000 gp/);
  step('SW-2 a press pays the first price', paid && (await purse()) === before - 2000, JSON.stringify({ msg: await textOf('[data-hs-win="havora"] .hh-intent-msg'), purse: await purse() }));
  const shown = await waitText('[data-hs-win="havora"] .hv-gold', /98,000 gp/);
  step('SW-2 the purse drops from the envelope', shown, await textOf('[data-hs-win="havora"] .hv-gold'));
  const ledger = await sql("select intent, gold::bigint g from public.player_ledger where user_id = $1 and kind = 'shop' order by at", [uid]);
  step('SW-2 one journal row, kind shop', ledger.length === 1 && ledger[0].intent === 'town_show:cinnabar:2000', JSON.stringify(ledger));
  const flame = await sql("select public.hr_hearth_flame_of('town_common') f");
  step('SW-2 the square burns the powder, its buyer named', flame[0].f && flame[0].f.flame === 'cinnabar' && flame[0].f.by === 'Marlow', JSON.stringify(flame[0].f));

  // ── SW-3 ──
  const next = await waitText('[data-hs-win="havora"] [data-hs-act="powder"]', /Throw Cinnabar: 4,000 gp/);
  step('SW-3 the window re-reads and quotes the next price', next, await textOf('[data-hs-win="havora"] [data-hs-act="powder"]'));
  await page.click('[data-hs-win="havora"] [data-show="borax"]');
  const pick = await waitText('[data-hs-win="havora"] [data-hs-act="powder"]', /Throw Borax: 4,000 gp/, 5000);
  step('SW-3 a pick moves the button', pick, await textOf('[data-hs-win="havora"] [data-hs-act="powder"]'));
  await page.click('[data-hs-win="havora"] [data-hs-act="powder"]');
  await waitText('[data-hs-win="havora"] .hh-intent-msg', /Paid 4,000 gp/);
  await p.reload();
  await page.waitForSelector('[data-hs-open="havora"]', { timeout: 30000 });
  await page.click('[data-hs-open="havora"]');
  const remembered = await waitText('[data-hs-win="havora"] [data-hs-act="powder"]', /Throw Borax: 6,000 gp/);
  step('SW-3 after a reload it opens on the color thrown last, at the next price', remembered, await textOf('[data-hs-win="havora"] [data-hs-act="powder"]'));

  // ── SW-6 ── (the price moves under an open window: another hero of the account bought)
  await sql("insert into public.player_ledger (user_id, slot, kind, intent, gold, meta) values ($1, 0, 'shop', 'town_show:borax:6000', -6000, '{\"probe\":true}'::jsonb)", [uid]);
  const purse6 = await purse();
  await page.click('[data-hs-win="havora"] [data-hs-act="powder"]');
  const moved = await waitText('[data-hs-win="havora"] .hh-intent-msg', /The price moved to 8,000 gp\. You weren't charged\. Press again to pay it\./);
  step('SW-6 a stale price says so and charges nothing', moved && (await purse()) === purse6, JSON.stringify({ msg: await textOf('[data-hs-win="havora"] .hh-intent-msg'), purse: await purse(), was: purse6 }));
  const reread = await waitText('[data-hs-win="havora"] [data-hs-act="powder"]', /Throw Borax: 8,000 gp/);
  step('SW-6 the window shows the new price', reread, await textOf('[data-hs-win="havora"] [data-hs-act="powder"]'));
  await page.waitForTimeout(300);
  await p.shot('havora-hearth-stale');

  // ── SW-4 ──
  await page.click('[data-hs-win="havora"] [data-tab="round"]');
  const roundWords = await waitText('[data-hs-win="havora"] [data-hs-act="round"]', /Stand a round: 5,000 gp/);
  await p.shot('havora-round');
  await page.click('[data-hs-win="havora"] [data-hs-act="round"]');
  const roundPaid = await waitText('[data-hs-win="havora"] .hh-intent-msg', /Paid 5,000 gp/);
  step('SW-4 the Round tab stands a round', roundWords && roundPaid, await textOf('[data-hs-win="havora"]'));
  const round = await sql("select public.hr_town_shows_of('town_common') s");
  step('SW-4 the town read carries the round', round[0].s && round[0].s.round && round[0].s.round.by === 'Marlow', JSON.stringify(round[0].s));
  await page.waitForTimeout(300);
  await p.shot('havora-round-paid');
  await closeWindow('havora');
  await page.waitForTimeout(3200);   // the next town read carries it: fireworks over Hearth Square, the powder's color in the fire
  await p.shot('round-fireworks');
  await page.waitForTimeout(350);
  await p.shot('round-fireworks-2');

  // ── SW-5 ──
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-hs-win="chat"] .hc-field', { timeout: 15000 });
  await page.click('[data-hs-win="chat"] [data-tab="global"]');
  await page.click('[data-hs-win="chat"] [data-hs-act="crier"]');
  const cryWords = await waitText('[data-hs-win="chat"] .hc-cry', /Cry it: 1,000 gp/);
  step('SW-5 the Town Crier\'s button reads the server\'s price', cryWords, await textOf('[data-hs-win="chat"] .hc-crier'));
  const purse0 = await purse();
  await page.fill('[data-hs-win="chat"] .hc-field', 'see www.example.test for rat tails');
  await page.click('[data-hs-win="chat"] .hc-cry');
  const said = await waitText('[data-hs-win="chat"] .hc-crier-msg', /won't shout web addresses/);
  step('SW-5 a web address is refused in words, charging nothing', said && (await purse()) === purse0, await textOf('[data-hs-win="chat"] .hc-crier-msg'));
  await page.fill('[data-hs-win="chat"] .hc-field', 'selling rat tails, ask Marlow');
  await page.click('[data-hs-win="chat"] .hc-cry');
  const gone = await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-hs-win="chat"] .hc-line.is-crier')).some((l) => /selling rat tails/.test(l.textContent)), null, { timeout: 15000 }).then(() => true, () => false);
  step('SW-5 a clean line pays and reaches Global with its gold bar', gone && (await purse()) === purse0 - 1000, JSON.stringify({ purse: await purse(), was: purse0, msg: await textOf('[data-hs-win="chat"] .hc-crier-msg') }));
  const nextCry = await waitText('[data-hs-win="chat"] .hc-cry', /Cry it: 2,000 gp/);
  step('SW-5 the Crier\'s next price is the server\'s', nextCry, await textOf('[data-hs-win="chat"] .hc-cry'));
  await page.waitForTimeout(300);
  await p.shot('crier-line');

  // ── SW-7 ──
  await sql('select public.hr_leaderboard_refresh(true)');
  await page.click('[data-hs-open="honor"]');
  await page.waitForSelector('[data-hs-win="honor"] select[data-hs-act="board"]', { timeout: 15000 });
  await page.selectOption('[data-hs-win="honor"] select[data-hs-act="board"]', 'gold_given');
  const onBoard = await waitText('[data-hs-win="honor"] .hr-roll', /Marlow/);
  await page.waitForTimeout(500);
  const value = await textOf('[data-hs-win="honor"] .hr-roll .hr-val b');
  step('SW-7 the account is on Gold Given, under its lead hero, the sum of its gifts', onBoard && value === '12,000 gp', JSON.stringify({ value, roll: await textOf('[data-hs-win="honor"] .hr-roll'), you: await textOf('[data-hs-win="honor"] .hr-you-line') }));
  await p.shot('gold-given-board');

  // ── SW-8 ──
  step('SW-8 no console errors', p.errors.length === 0, p.errors.slice(0, 5).join(' | '));
  step('SW-8 nothing left the machine', p.offsite.length === 0 && world.offsite.length === 0, [...p.offsite, ...world.offsite].slice(0, 5).join(' | '));
} catch (e) {
  console.error('town-shows-world: HARNESS ' + (e && e.stack || e));
  code = 2;
} finally {
  await world.close();
}
if (code) process.exit(code);
console.log(fails.length ? `\ntown-shows-world: RED (${fails.length})` : '\ntown-shows-world: green');
process.exit(fails.length ? 1 : 0);
