#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/qa/market-play.mjs — PLAY THE WEIGHHOUSE: TWO ACCOUNTS, THE REAL WINDOW, THE REAL SERVER.
//
//   node tools/qa/market-play.mjs [--shots DIR]     exit 0 green, 1 red, 2 harness
//
// tools/qa/local-world.mjs behind it: the replayed chain, the real hr-accrue, the real play.html.
// 2027-02-14-market-on.sql is applied to this process's memory only, which also runs its §2.
// Two fresh accounts sign up and hunt for what they trade. Nothing is seeded: the goods are
// what the hunt dropped. Every step reads the window a player reads and the tables the
// server wrote:
//   a fresh account is locked and told why, and the empty market reads as an invitation
//   list from the bag -> browse from the other account -> buy into Storage -> seller paid
//   no seller or buyer name anywhere in the buyer's window or its answers
//   a buy whose answer is lost: the next press resends the SAME key and buys once (review change 4)
//   a price under the shop's bid is off with its reason; the one-press chips are not market-steerable
//   cancel: back in Storage. Expiry: back in Storage, and said. A reload brings every number back
//   the sale notice on return ("While you were away...")
// Screens are shot at desktop and at 922x423 (--shots). A manual tool, as local-world is: a
// machine's first run replays the whole chain. mutant-anchors: none - it plays, and plants nothing
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openWorld } from './local-world.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const shots = arg('--shots');
const fails = [];
const t0 = Date.now();
const step = (name, ok, got) => { console.log((ok ? '  ok   ' : '  RED  ') + name + (ok ? '' : ' -- ' + String(got).slice(0, 400)) + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)'); if (!ok) fails.push(name); };

const WIN = '[data-hs-win="market"]';
const openMarket = async (p) => {
  if (!(await p.page.$(WIN))) await p.page.click('[data-hs-open="market"]');
  await p.page.waitForSelector(WIN + ' .hw-mk');
};
const tab = async (p, id) => { await p.page.click(WIN + ' .hw-tab[data-tab="' + id + '"]'); };
const winText = (p) => p.page.evaluate((w) => document.querySelector(w)?.innerText || '', WIN);
const waitWin = (p, re, timeout = 60000) => p.page.waitForFunction(([w, s]) => new RegExp(s).test(document.querySelector(w)?.innerText || ''), [WIN, re.source], { timeout }).then(() => true, () => false);

/* A real hunt: walk in, wait, walk out with what dropped. */
async function hunt(world, p, minutes) {
  await p.enterHunt('mill_cellar');
  await world.skip(minutes);
  await p.page.click('[data-hs-act="leave"]');
  await p.page.waitForFunction(() => !!document.querySelector('.hsum-card .hsum-title'), null, { timeout: 90000 });
  const close = await p.page.$('[data-hs-close="hunt-summary"]');
  if (close) await close.click();
}

/* The stacks the Sell tab offers, with the server's word on each. */
const sellRows = (p) => p.page.evaluate((w) => Array.from(document.querySelectorAll(w + ' .hw-mk-sell .hw-mk-row')).map((li) => ({ id: li.getAttribute('data-item'), line: li.querySelector('small').textContent })), WIN);

async function main() {
  const world = await openWorld({ tickMs: false });
  const q = async (sql, args) => (await world.db.query(sql, args)).rows;
  const one = async (sql, args) => (await q(sql, args))[0];
  try {
    const on = (await readFile(join(ROOT, 'supabase/migrations/2027-02-14-market-on.sql'), 'utf8')).replace(/\r\n/g, '\n');
    await world.db.exec('begin;\n' + on + '\ncommit;');
    step('2027-02-14-market-on.sql applied here, its self-check ran', (await one('select enabled from public.hr_market_config')).enabled === true);
    const min = (await one('select min_level from public.hr_market_config')).min_level;
    step('the rule ships at Level 10', min === 10, min);

    const seller = await world.play({ account: 'seller', viewport: { width: 1440, height: 900 }, shots: shots && join(shots, 'desktop') });
    await seller.createHero('Marlow');
    await openMarket(seller);
    step('a fresh account is told why it can\'t trade', await waitWin(seller, /heroes of Level 10 or higher/), await winText(seller));
    step('the empty market reads as an invitation', await waitWin(seller, /Nothing is for sale yet/), await winText(seller));
    await seller.shot('empty-and-locked');

    /* The Level is a config number: this world sets it low so a short hunt reaches it; the rule itself is proved in market-v2. */
    await q('update public.hr_market_config set min_level = 2 where only_row');
    await seller.page.click(WIN + ' [data-hs-close="market"]').catch(() => {});
    await hunt(world, seller, 15);
    await openMarket(seller);
    await tab(seller, 'sell');
    await seller.page.waitForFunction((w) => /The shop pays|shop does not/.test(document.querySelector(w + ' .hw-mk-sell')?.innerText || ''), WIN, { timeout: 60000 });
    await seller.page.waitForFunction((w) => !/Reading the market/.test(document.querySelector(w + ' .hw-mk-sell .hw-mk-list')?.innerText || ''), WIN, { timeout: 60000 });
    const rows = await sellRows(seller);
    const stock = [];
    for (const r of rows) {
      const n = Number((/×([\d,]+)/.exec(r.line) || [])[1]?.replace(/,/g, ''));
      if (n > 0) stock.push({ id: r.id, n });
    }
    stock.sort((a, b) => b.n - a.n);
    step('the hunt dropped something the market will take', stock.length > 0 && stock[0].n >= 3, JSON.stringify(rows.slice(0, 6)));
    const item = stock[0].id;
    const kit = await one('select count(*)::int n from public.hr_start_inventory where item_id = $1', [item]);
    step('the kit is not offered for sale', kit.n === 0, item);

    await seller.page.click(WIN + ' .hw-mk-sell .hw-mk-row[data-item="' + item + '"]');
    await seller.page.waitForFunction((w) => /Listing fee/.test(document.querySelector(w + ' .hw-mk-terms')?.textContent || ''), WIN, { timeout: 60000 });
    const facts = await seller.page.evaluate((w) => document.querySelector(w + ' .hw-mk-sell').innerText, WIN);
    step('the fee and the cut stand before the press', /Listing fee: [\d,]+ gold now .*the Weighhouse keeps 4%: you get [\d,]+ each\. Listed for 7 days/s.test(facts), facts);
    step('the shop price and the market price stand beside it', /The shop pays/.test(facts) && /Lowest now/.test(facts), facts);
    await seller.shot('sell-sheet');
    const floor = Number((await one('select floor_each::text f from public.hr_market_items where item_id = $1', [item])).f);
    const chips = await seller.page.evaluate((w) => Array.from(document.querySelectorAll(w + ' .hw-mk-sell .hw-mk-chips .hh-seg')).map((b) => b.textContent), WIN);
    step('no one-press chip reads market history (review change 5)', !chips.some((c) => /Lowest|Last sold/.test(c)), chips.join('|'));
    if (floor > 1) {
      await seller.page.fill(WIN + ' [data-hs-act="ms-ask"]', '1');
      step('under the shop\'s bid the press is off and says why', await waitWin(seller, /The shop pays [\d,]+ for one\. Ask at least that/), await winText(seller));
      step('the press is off', await seller.page.$eval(WIN + ' [data-hs-act="ms-list"]', (b) => b.disabled), 'on');
    }
    /* Three lots of one each: one to sell (through a lost answer), one to cancel, one to expire. */
    const ask = Math.max(floor, Number(await seller.page.$eval(WIN + ' [data-chip="suggested"]', (b) => (/[\d,]+/.exec(b.textContent) || ['0'])[0].replace(/,/g, ''))));
    const listOne = async (price) => {
      await seller.page.click(WIN + ' .hw-tab[data-tab="sell"]');
      await seller.page.click(WIN + ' .hw-mk-sell .hw-mk-row[data-item="' + item + '"]');
      await seller.page.waitForSelector(WIN + ' .hw-mk-sheet.is-on');
      await seller.page.fill(WIN + ' [data-hs-act="ms-qty"]', '1');
      await seller.page.fill(WIN + ' [data-hs-act="ms-ask"]', String(price));
      await seller.page.waitForFunction((w) => { const b = document.querySelector(w + ' [data-hs-act="ms-list"]'); return b && !b.disabled; }, WIN, { timeout: 60000 });
      await seller.page.click(WIN + ' [data-hs-act="ms-list"]');
      return waitWin(seller, /Listed 1 /);
    };
    const sellerId = (await one('select user_id from public.player_state limit 1')).user_id;
    const bag0 = Number((await one('select qty::text q from public.player_inventory where item_id = $1 and slot = 0 and user_id = $2', [item, sellerId]))?.q || 0);
    step('list one from the bag', await listOne(ask), await winText(seller));
    await seller.page.waitForFunction((w) => !document.querySelector(w + ' .hw-mk.is-pending'), WIN);
    step('list a second', await listOne(ask + 1), await winText(seller));
    await seller.page.waitForFunction((w) => !document.querySelector(w + ' .hw-mk.is-pending'), WIN);
    step('list a third', await listOne(ask + 2), await winText(seller));
    await seller.page.waitForFunction((w) => !document.querySelector(w + ' .hw-mk.is-pending'), WIN);
    const lst = await q('select id, user_id, qty::int qty, ask_each::int ask from public.market_listings order by ask_each');
    step('the server holds three listings', lst.length === 3 && lst.every((l) => l.qty === 1), JSON.stringify(lst));
    const bagNow = Number((await one('select qty::text q from public.player_inventory where item_id = $1 and slot = 0 and user_id = $2', [item, sellerId]))?.q || 0);
    step('the units left the bag', bagNow === bag0 - 3, JSON.stringify({ bag0, bagNow }));

    await seller.reload();
    await openMarket(seller);
    await tab(seller, 'mine');
    step('reload: My listings comes back from the server', await waitWin(seller, /1 of 1 left · [\d,]+ each · \d+ days left/), await winText(seller));
    await seller.shot('my-listings');

    const buyer = await world.play({ account: 'buyer', viewport: { width: 1440, height: 900 }, shots: shots && join(shots, 'buyer') });
    await buyer.createHero('Tessaly');
    await hunt(world, buyer, 10);
    await openMarket(buyer);
    const row = WIN + ' .hw-mk-browse .hw-mk-row[data-item="' + item + '"]';
    await buyer.page.waitForSelector(row);
    const line = await buyer.page.$eval(row, (li) => li.innerText);
    step('browse: one row for the item, lowest ask, how many', new RegExp('from ' + ask.toLocaleString('en-US') + ' each · 3 for sale').test(line), line);
    /* A search covers what is not listed too, and says so; a category shows what is for sale. */
    await buyer.page.fill(WIN + ' .hw-mk-browse .hw-q', 'coal');
    const coal = WIN + ' .hw-mk-browse .hw-mk-row[data-item="coal"]';
    await buyer.page.waitForSelector(coal, { timeout: 60000 });
    const coalLine = await buyer.page.$eval(coal, (li) => li.innerText);
    step('search: an item nobody lists reads honestly', /No one is selling this/.test(coalLine), coalLine);
    await buyer.page.fill(WIN + ' .hw-mk-browse .hw-q', '');
    await buyer.page.click(WIN + ' .hw-mk-browse .hw-cat[data-cat="gear"]');
    await buyer.page.waitForFunction((r) => !document.querySelector(r), row, { timeout: 30000 });
    step('a category hides what is not of its kind', true);
    await buyer.page.click(WIN + ' .hw-mk-browse .hw-cat[data-cat="all"]');
    await buyer.page.waitForSelector(row);
    await buyer.page.click(row);
    await buyer.page.waitForFunction((w) => /Buy 1 for/.test(document.querySelector(w + ' [data-hs-act="mk-buy"]')?.textContent || ''), WIN, { timeout: 60000 });
    const page = await winText(buyer);
    step('the item page groups the asks by price', /For sale/.test(page) && new RegExp(ask.toLocaleString('en-US') + ' each').test(page), page);
    step('the buy says what it leaves and where it goes', /You'll have [\d,]+ gold left/.test(page) && /Goes to:/.test(page), page);
    await buyer.shot('item-page');
    step('anonymous: the seller\'s hero is nowhere in the window', !/Marlow/.test(page), page);

    /* THE LOST ANSWER: the server does the work, the browser never hears. The press after that must buy nothing new. */
    const purse = async (u) => Number((await one('select gold::text g from public.account_wallet where user_id = $1', [u])).g);
    const buyerId = (await one('select user_id from public.player_state where user_id <> $1', [sellerId])).user_id;
    const [pb0, ps0] = [await purse(buyerId), await purse(sellerId)];
    const keys = [];
    let lost = 0;
    await buyer.page.route('**/functions/v1/hr-accrue**', async (route) => {
      const body = route.request().postDataJSON();
      if (!body || body.verb !== 'market_buy') return route.continue();
      keys.push(body.intentId);
      if (lost++ === 0) { await route.fetch().catch(() => {}); return route.abort('connectionreset'); }
      return route.continue();
    });
    await buyer.page.click(WIN + ' [data-hs-act="mk-buy"]');
    step('a lost answer says so and offers the same press', await waitWin(buyer, /No answer from the Weighhouse\. Press again: it won't buy twice/), await winText(buyer));
    const once = await one('select count(*)::int n from public.market_sales');
    step('the server did the work', once.n === 1, once.n);
    await buyer.page.waitForFunction((w) => { const b = document.querySelector(w + ' [data-hs-act="mk-buy"]'); return b && !b.disabled && /Try again/.test(b.textContent); }, WIN);
    await buyer.page.click(WIN + ' [data-hs-act="mk-buy"]');
    step('the second press answers', await waitWin(buyer, /Bought 1 /), await winText(buyer));
    step('both presses sent ONE key', keys.length >= 2 && new Set(keys).size === 1, JSON.stringify(keys));
    const sales = await q('select qty::int qty, gold_gross::int gross, tax::int tax, gold_net::int net from public.market_sales');
    step('one sale, not two', sales.length === 1 && sales[0].qty === 1 && sales[0].gross === ask, JSON.stringify(sales));
    step('the buyer paid once', (await purse(buyerId)) === pb0 - ask, JSON.stringify({ pb0, now: await purse(buyerId), ask }));
    step('the seller was paid at the sale, less the cut', (await purse(sellerId)) === ps0 + sales[0].net && sales[0].net === ask - Math.ceil(ask * 400 / 10000), JSON.stringify({ ps0, now: await purse(sellerId), sale: sales[0] }));
    const stored = await one('select qty::int q from public.account_bank where user_id = $1 and item_id = $2', [buyerId, item]);
    step('the goods are in the buyer\'s Storage', stored && stored.q === 1, JSON.stringify(stored));
    await buyer.page.unroute('**/functions/v1/hr-accrue**');
    await buyer.shot('bought');
    await tab(buyer, 'history');
    step('history: the buyer\'s purchase, no name', await waitWin(buyer, /Bought 1 .* for [\d,]+ gold/) && !/Marlow/.test(await winText(buyer)), await winText(buyer));
    await buyer.shot('history');

    /* The seller comes back: the notice, then the book. */
    await seller.reload();
    const told = await seller.page.waitForFunction(() => /While you were away the Weighhouse sold 1 lot for [\d,]+ gold/.test(document.body.innerText), null, { timeout: 60000 }).then(() => true, () => false);
    step('the seller hears on return', told, (await seller.text()).slice(0, 400));
    await seller.shot('notice');
    await openMarket(seller);
    await tab(seller, 'history');
    step('history: sold, what was received', await waitWin(seller, /Sold 1 .* for [\d,]+ gold\. You received [\d,]+ gold\./), await winText(seller));
    step('anonymous: the buyer\'s hero is nowhere in the seller\'s book', !/Tessaly/.test(await winText(seller)), await winText(seller));
    await tab(seller, 'mine');
    await seller.page.waitForSelector(WIN + ' .hw-mk-mine [data-hs-act="mk-cancel"]');

    const bank0 = Number((await one('select coalesce(sum(qty), 0)::text q from public.account_bank where user_id = $1 and item_id = $2', [sellerId, item])).q);
    await seller.page.click(WIN + ' .hw-mk-mine [data-hs-act="mk-cancel"]');
    step('cancel says where it went', await waitWin(seller, /Canceled\. 1 .* is back in your storage/), await winText(seller));
    const bank1 = Number((await one('select coalesce(sum(qty), 0)::text q from public.account_bank where user_id = $1 and item_id = $2', [sellerId, item])).q);
    step('cancel: the unit is in the seller\'s Storage', bank1 === bank0 + 1, JSON.stringify({ bank0, bank1 }));

    /* Expiry: the last listing's clock is moved in this world's memory, then the real sweep runs. */
    await q(`update public.market_listings set expires_at = now() - interval '1 minute'`);
    const swept = await one('select public.hr_market_expire(200) n');
    const bank2 = Number((await one('select coalesce(sum(qty), 0)::text q from public.account_bank where user_id = $1 and item_id = $2', [sellerId, item])).q);
    step('expiry: back in Storage', Number(swept.n) === 1 && bank2 === bank1 + 1 && (await one('select count(*)::int n from public.market_listings')).n === 0, JSON.stringify({ swept, bank1, bank2 }));
    await seller.reload();
    const back = await seller.page.waitForFunction(() => /didn't sell and is back in your storage/.test(document.body.innerText), null, { timeout: 60000 }).then(() => true, () => false);
    step('the seller hears the return', back, (await seller.text()).slice(0, 400));
    await openMarket(seller);
    await tab(seller, 'history');
    step('history: the return, with List again', await waitWin(seller, /didn't sell and went back to your storage/) && !!(await seller.page.$(WIN + ' [data-hs-act="mk-list-again"]')), await winText(seller));
    await seller.shot('history-seller');
    await seller.page.click(WIN + ' [data-hs-act="mk-list-again"]');
    await seller.page.waitForSelector(WIN + ' .hw-mk-sheet.is-on');
    const again = await seller.page.$eval(WIN + ' .hw-mk-sell', (el) => el.innerText);
    step('List again opens the sheet on Storage', /in your storage/.test(again), again);
    await seller.page.waitForFunction((w) => { const b = document.querySelector(w + ' [data-hs-act="ms-list"]'); return b && !b.disabled; }, WIN, { timeout: 60000 });
    await seller.page.click(WIN + ' [data-hs-act="ms-list"]');
    step('list from Storage', await waitWin(seller, /Listed 1 /), await winText(seller));

    /* The phone: the same component as a sheet, 922x423. */
    await seller.page.click(WIN + ' .hw-tab[data-tab="browse"]').catch(() => {});
    const phone = await world.play({ account: 'buyer', viewport: { width: 922, height: 423 }, touch: true, shots: shots && join(shots, 'phone') });
    await phone.page.waitForSelector('.hs-launchers').catch(() => {});
    if (await phone.page.$('[data-app="play"]')) await phone.page.click('[data-app="play"]').catch(() => {});
    await phone.page.waitForSelector('[data-hs-open="market"]');
    await openMarket(phone);
    const phoneRow = WIN + ' .hw-mk-browse .hw-mk-row[data-item="' + item + '"]';
    await phone.page.waitForSelector(phoneRow);
    await phone.page.waitForTimeout(400);   // the sheet's slide-in ends
    /* Nothing runs past the sheet's edge on any pane: GitHub's fonts are wider than this machine's. */
    const past = async (where) => {
      const bad = await phone.page.evaluate((w) => {
        const edge = document.querySelector(w).getBoundingClientRect().right;
        /* A row that scrolls sideways on purpose (the phone's category chips) is not running past anything. */
        const scrolls = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return true; } return false; };
        return Array.from(document.querySelectorAll(w + ' *')).filter((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > edge + 1 && !scrolls(e)).map((e) => e.className || e.tagName).slice(0, 6);
      }, WIN);
      step('on the phone nothing runs past the sheet: ' + where, bad.length === 0, bad.join(' | '));
    };
    await past('Browse');
    await phone.shot('browse');
    await phone.page.click(phoneRow);
    await phone.page.waitForFunction((w) => /Buy \d/.test(document.querySelector(w + ' [data-hs-act="mk-buy"]')?.textContent || ''), WIN, { timeout: 60000 });
    await past('the item page');
    await phone.shot('item-page');
    const reach = await phone.page.$eval(WIN + ' [data-hs-act="mk-buy"]', (b) => { const r = b.getBoundingClientRect(); return r.bottom <= window.innerHeight && r.top >= 0; });
    step('on the phone the press is on screen without scrolling', reach, 'off screen');
    await phone.page.click(WIN + ' [data-hs-act="mk-back"]');
    await tab(phone, 'sell');
    await phone.page.waitForSelector(WIN + ' .hw-mk-sell .hw-mk-row', { timeout: 60000 }).catch(() => {});
    await phone.shot('sell-list');
    const first = await phone.page.$(WIN + ' .hw-mk-sell .hw-mk-row');
    if (first) {
      await first.click();
      await phone.page.waitForSelector(WIN + ' .hw-mk-sheet.is-on');
      await past('the sell sheet');
      await phone.shot('sell-sheet');
      const reachList = await phone.page.$eval(WIN + ' [data-hs-act="ms-list"]', (b) => { const r = b.getBoundingClientRect(); return r.bottom <= window.innerHeight && r.top >= 0; });
      step('on the phone List is on screen without scrolling', reachList, 'off screen');
      const box = await phone.page.$eval(WIN, (w) => { const r = w.getBoundingClientRect(); return { w: r.width, h: r.height, over: w.scrollWidth > w.clientWidth + 1 }; });
      step('the phone sheet does not overflow sideways', box.over === false, JSON.stringify(box));
      await phone.page.click(WIN + ' .hw-mk-sell [data-hs-act="ms-back"]');
    }
    await past('Sell');
    await tab(phone, 'mine');
    await past('My listings');
    await phone.shot('mine');
    await tab(phone, 'history');
    await past('History');
    await phone.shot('history');
    const tiny = await phone.page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('[data-hs-win="market"] *')) {
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const f = parseFloat(getComputedStyle(el).fontSize);
        if (f < 12) bad.push(el.className + ':' + f);
      }
      return bad;
    });
    step('no market text under 12 px on the phone', tiny.length === 0, tiny.join(' '));

    for (const [who, p] of [['seller', seller], ['buyer', buyer], ['phone', phone]]) {
      const noisy = p.errors.filter((e) => !/ERR_FAILED|ERR_CONNECTION|Failed to load resource|net::/.test(e));
      step(who + ': no console errors', noisy.length === 0, noisy.join(' | '));
    }
  } finally {
    await world.close();
  }
  console.log(fails.length ? `market-play: ${fails.length} RED: ${fails.join('; ')}` : 'market-play: green');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('market-play: harness: ' + (e && e.stack || e)); process.exit(2); });
