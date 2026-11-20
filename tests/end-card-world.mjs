#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/end-card-world.mjs — THE END CARD SELLS AND NAMES THE NEXT BUY, PLAYED: THE REAL GAME, NO PRODUCTION.
//
//   node tests/end-card-world.mjs [--shots DIR]     exit 0 green, 1 red, 2 harness
//
// Balance program L03 (docs/design/balance-program/30-plan.md; economy dive change 1: hunt one paid 130 gold in coin and left 501 unsold, and
// one real new player sold nothing in 12 hours). tools/qa/local-world.mjs: the real play.html and hr-accrue engine on the replayed chain, a
// brand-new account from the sign-in screen. Needs Node 23.6+ and, on a machine's first run, minutes to replay the chain, so it is a manual
// tool (tests/guards-unregistered.json); the rules are mutation-proven in CI by tests/hunt-summary.mjs T7, T8, T9 and T1.
//   EC-1  a fresh hero's Mill Cellar ends itself at Level 5; its end card's Back in town holds "Sell junk for N gp", N the server's own
//         answer: the card is what the server's projection (hr_state_of) gives the same module, and the press is ONE vendor_sell_many
//   EC-2  the press pays N and only N: the account wallet moves by N, the junk leaves the server's bag, and the purse and bag the page
//         shows are the server's (the Inventory's Gold line and pockets against account_wallet and player_inventory)
//   EC-3  "Always sell these" then sets the existing per-item plan Sell on every junk stack just sold (player_item_rules), and the row is Done
//   EC-4  Next buy is the server projection's answer, a price the purse covers or a "Need N more" equal to the price less the purse
//   EC-5  RELOAD: the purse, the bag and the plans come back from the server (the residue holds none of them)
//   EC-6  the next hunt (Meadowbrook Thicket, the card's Next ground), left with the page open: its junk the plan holds reads "Marked Sell"
//   EC-7  no console error, nothing left the machine
// mutant-anchors: none — a manual walk of the real game; the rules are mutation-proven in tests/hunt-summary.mjs
// ════════════════════════════════════════════════════════════════════════
import { resolve as resolvePath, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openWorld } from '../tools/qa/local-world.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const shots = args.includes('--shots') ? resolvePath(args[args.indexOf('--shots') + 1]) : null;
const fails = [];
const t0 = Date.now();
const step = (name, ok, got) => {
  console.log((ok ? '  ok   ' : '  RED  ') + name + (ok ? '' : ' -- ' + String(got).slice(0, 600)) + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  if (!ok) fails.push(name);
};
const VIEW = { width: 1440, height: 900 };
const num = (s) => Number(String(s || '').replace(/[^\d]/g, '')) || 0;

/* The modules the card is built from, read over the SERVER's own projection: what the page should say, from the server's state alone. */
const TN = await import(pathToFileURL(join(ROOT, 'src/shell/back-in-town.js')).href);
const projected = (s) => ({ read: (k) => s[k], slot: 0 });

const world = await openWorld({ tickMs: false });
try {
  const sql = async (q, a) => (await world.db.query(q, a || [])).rows;
  const p = await world.play({ account: 'seller', viewport: VIEW, shots });
  await p.createHero('Sella');
  const uid = (await sql('select id from auth.users where email = $1', [p.email]))[0].id;
  const state = async () => (await sql('select public.hr_state_of($1, 0) as s', [uid]))[0].s;
  const wallet = async () => Number((await sql('select gold from public.account_wallet where user_id = $1', [uid]))[0].gold);
  const serverBag = async () => Object.fromEntries((await sql('select item_id, qty from public.player_inventory where user_id = $1 and slot = 0 and qty > 0 order by item_id', [uid])).map((r) => [r.item_id, Number(r.qty)]));
  const plans = async () => Object.fromEntries((await sql("select item_id, loot_rule from public.player_item_rules where user_id = $1 and slot = 0 and loot_rule <> 'keep' order by item_id", [uid])).map((r) => [r.item_id, r.loot_rule]));

  /* THE CELLAR TO ITS OWN END AT LEVEL 5 (src/data/hunt-grounds.js endsAtLevel), the page open */
  await p.enterHunt('mill_cellar');
  await world.skip(5);
  await world.skip(10);
  const last = 'select end_reason, ended_at from public.hunt_sessions where user_id = $1 order by entered_at desc limit 1';
  let closed = (await sql(last, [uid]))[0];
  for (let i = 0; i < 8 && !closed.ended_at; i++) { await world.skip(5); closed = (await sql(last, [uid]))[0]; }
  step('CONTROL the Cellar ended itself (outgrown)', closed.end_reason === 'outgrown', JSON.stringify(closed));
  await p.page.waitForSelector('[data-hs-win="hunt-summary"] .hsum-step[data-step="sell"]', { timeout: 60000 });
  await p.page.waitForTimeout(800);
  const rowOf = (id) => p.page.evaluate((sid) => {
    const li = document.querySelector('[data-hs-win="hunt-summary"] .hsum-step[data-step="' + sid + '"]');
    if (!li) return null;
    const b = li.querySelector('button');
    return { title: li.querySelector('b').textContent, words: li.querySelector('small').textContent, done: li.classList.contains('is-done'),
      gold: !!b && b.classList.contains('is-primary') && !b.hidden, press: !!b && !b.hidden && !b.disabled, verb: b ? b.textContent : '' };
  }, id);
  /* The window's one gold press: after a ground outgrown it is the foot's Go to (audit 2026-11-19 L2), every chore keeping its own press */
  const goldOf = () => p.page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="hunt-summary"] button.is-primary'))
    .filter((b) => !b.hidden && b.getClientRects().length).map((b) => b.getAttribute('data-hs-act') + ':' + (b.getAttribute('data-step') || '')));
  /* the Back in town rows into view in the window, as a player scrolls to them, for the shot */
  const toTown = () => p.page.evaluate(() => { const el = document.querySelector('[data-hs-win="hunt-summary"] .hsum-town'); if (el) el.scrollIntoView({ block: 'start' }); });
  await toTown();
  await p.shot('end-card');

  // EC-1 the card's sale is the server's answer
  const s0 = await state();
  const want = TN.townStepsOf(projected(s0), new Map(), []);
  const sale = want.steps.find((x) => x.id === 'sell');
  const card = await rowOf('sell');
  step('EC-1 the end card reads "Sell junk for N gp", one press', !!card && /^Sell junk for [\d,]+ gp$/.test(card.title) && card.press && card.verb === 'Sell', JSON.stringify(card));
  step('EC-1 ...the outgrown card\'s gold press stays the next ground (the Sell row its own press)', JSON.stringify(await goldOf()) === '["next-ground:"]' && want.primary === 'ground', JSON.stringify({ gold: await goldOf(), primary: want.primary }));
  step('EC-1 ...N and the stacks are what the server\'s own projection gives the card', !!sale && !!card && card.title === sale.title && card.words === sale.words,
    JSON.stringify({ card, server: sale && [sale.title, sale.words, sale.lines] }));

  // EC-2 the press pays N and only N, and the page then shows the server's purse and bag
  const before = await wallet();
  const bagBefore = await serverBag();
  const n = num(card && card.title.replace(/^Sell junk for /, ''));
  await p.page.click('[data-hs-win="hunt-summary"] [data-hs-act="town"][data-step="sell"]');
  await p.page.waitForSelector('[data-hs-win="hunt-summary"] .hsum-step[data-step="sell"].is-done', { timeout: 30000 });
  await p.page.waitForTimeout(600);
  const after = await wallet();
  const bagAfter = await serverBag();
  step('EC-2 the sale paid N into the account wallet, no more and no less', after - before === n && n > 0, JSON.stringify({ before, after, n }));
  const sold = sale ? sale.lines.map((l) => l.item) : [];
  step('EC-2 the junk left the server\'s bag, and nothing else moved', sold.length > 0 && sold.every((id) => !bagAfter[id])
    && Object.keys(bagBefore).filter((id) => !sold.includes(id)).every((id) => bagAfter[id] === bagBefore[id]), JSON.stringify({ sold, bagBefore, bagAfter }));

  // EC-3 Always sell these: the plan Sell on each, then Done
  const always = await rowOf('always');
  step('EC-3 "Always sell these" is offered for what was just sold', !!always && always.title === 'Always sell these' && always.press && always.verb === 'Always sell'
    && always.words === 'Set Sell on ' + (sale ? sale.words : ''), JSON.stringify(always));
  await toTown();
  await p.shot('end-card-sold');
  await p.page.click('[data-hs-win="hunt-summary"] [data-hs-act="town"][data-step="always"]');
  await p.page.waitForSelector('[data-hs-win="hunt-summary"] .hsum-step[data-step="always"].is-done', { timeout: 30000 });
  const planned = await plans();
  step('EC-3 the server holds the plan Sell on every junk stack just sold', sold.every((id) => planned[id] === 'sell'), JSON.stringify({ sold, planned }));
  await p.page.waitForTimeout(600);
  /* the rest of the list: the Next ground and the Next buy rows, under the chores */
  await p.page.evaluate(() => { const el = document.querySelector('[data-hs-win="hunt-summary"] .hsum-step[data-step="buy"]'); if (el) el.scrollIntoView({ block: 'center' }); });
  await p.shot('end-card-always');

  // EC-4 Next buy is the server's projection's answer: affordable, or the nearest with what it needs
  const s1 = await state();
  const buyWant = TN.townStepsOf(projected(s1), new Map(), []).steps.find((x) => x.id === 'buy');
  const buyCard = await rowOf('buy');
  const purse = await wallet();
  const price = buyCard ? num((buyCard.title.match(/\(([\d,]+) gp\)$/) || [])[1]) : 0;
  const need = buyCard ? num((buyCard.words.match(/Need ([\d,]+) gp more/) || [])[1]) : 0;
  step('EC-4 Next buy is the line the server\'s projection gives', !!buyWant && !!buyCard && buyCard.title === buyWant.title && buyCard.words === buyWant.words && !buyCard.gold,
    JSON.stringify({ buyCard, server: buyWant && [buyWant.title, buyWant.words] }));
  step('EC-4 ...a price the purse covers, or "Need N more" of exactly the price less the purse', price > 0 && (price <= purse ? need === 0 : need === price - purse), JSON.stringify({ price, purse, need }));
  console.log('       next buy: ' + JSON.stringify(buyCard));

  // EC-5 RELOAD: the purse, the bag and the plans are the server's
  await p.reload();
  if (await p.page.$('[data-app="play"]')) await p.page.click('[data-app="play"]');
  await p.page.waitForSelector('.hs-launchers');
  await p.page.click('[data-hs-open="inventory"]');
  await p.page.waitForSelector('.hw-pocket[data-item]');
  await p.page.waitForTimeout(500);
  const shown = await p.page.evaluate(() => ({
    gold: (document.querySelector('[data-hs-win="inventory"]').innerText.match(/Gold:?\s*([\d,]+)/) || [])[1] || null,
    items: Array.from(document.querySelectorAll('[data-hs-win="inventory"] .hw-pocket[data-item]')).map((li) => li.getAttribute('data-item')).sort(),
  }));
  const s5 = await state();
  const inv5 = Object.keys(s5.inventory || {}).filter((id) => Number(s5.inventory[id]) > 0).sort();
  step('EC-5 after a reload the Inventory\'s gold is the account wallet', num(shown.gold) === await wallet(), JSON.stringify({ shown: shown.gold, wallet: await wallet() }));
  step('EC-5 ...and its pockets are the server\'s bag', JSON.stringify(shown.items) === JSON.stringify(inv5), JSON.stringify({ shown: shown.items, server: inv5 }));
  const reread = s5.bag_rules || {};
  step('EC-5 ...and the plans are the server\'s', sold.every((id) => (reread.loot || {})[id] === 'sell'), JSON.stringify(reread.loot));
  await p.shot('after-reload');
  await p.page.click('[data-hs-open="inventory"]');

  // EC-6 the next hunt: the Thicket, left with the page open; its junk the plan holds is the plan's
  await p.enterHunt('meadowbrook_thicket');
  await world.skip(20);
  await p.page.click('[data-hs-act="leave"]');
  await p.page.waitForFunction(() => /Meadowbrook Thicket/.test(document.querySelector('.hsum-card .hsum-title')?.textContent || ''), null, { timeout: 60000 });
  await p.page.waitForTimeout(800);
  const s2 = await state();
  const second = TN.townStepsOf(projected(s2), new Map(), []).steps.find((x) => x.id === 'sell') || null;
  const card2 = await rowOf('sell');
  step('EC-6 the second card\'s sale is the server projection\'s', (second === null && card2 === null) || (!!second && !!card2 && card2.title === second.title && card2.words === second.words),
    JSON.stringify({ card2, server: second && [second.title, second.words] }));
  /* a card that did not end outgrown: the sale (the first chore, nothing to equip) is the window's one gold press */
  const gold2 = await goldOf();
  step('EC-6 ...and there the Sell row is the gold press', !card2 || (card2.gold && JSON.stringify(gold2) === '["town:sell"]') || JSON.stringify(gold2) === '["town:equip"]', JSON.stringify({ gold2, card2 }));
  await toTown();
  const held = second ? second.lines.map((l) => l.item).filter((id) => sold.includes(id)) : [];
  step('EC-6 ...and any of its junk the plan holds reads as the plan\'s', !held.length || !second.fresh.some((id) => held.includes(id)), JSON.stringify({ held, fresh: second && second.fresh }));
  await p.shot('second-card');

  // EC-7
  step('EC-7 no console errors', p.errors.length === 0, p.errors.slice(0, 5).join(' | '));
  step('EC-7 nothing left the machine', p.offsite.length === 0 && world.offsite.length === 0, [...p.offsite, ...world.offsite].slice(0, 5).join(' | '));
  await p.close();
} catch (e) {
  step('the walk finished', false, e && e.stack || e);
} finally {
  await world.close();
}
console.log(fails.length ? 'end-card-world: RED (' + fails.length + ') in ' + Math.round((Date.now() - t0) / 1000) + ' s' : 'end-card-world: green in ' + Math.round((Date.now() - t0) / 1000) + ' s');
process.exit(fails.length ? 1 : 0);
