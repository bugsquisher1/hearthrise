#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bag-expand-world.mjs — EXPAND THE BAG, PLAYED: A FRESH ACCOUNT, THE REAL GAME, NO PRODUCTION.
//
//   node tests/bag-expand-world.mjs [--shots DIR] [--viewport 1440x900]     exit 0 green, 1 red, 2 harness
//
// tools/qa/local-world.mjs: the real play.html and engine on the replayed chain (with 2027-04-15-bag-expand-view.sql). Only this
// process's in-memory database moves (a local purse, to reach the price). A manual walk (tests/guards-unregistered.json); the section's
// numbers are pinned in CI by tests/envelope-contract.mjs `bag_expand` and the migration's §4.
//
//   BE-1  the Storage header reads "Bag N / 100" and Expand shows the SERVER's price (hr_bag_expand_view = hr_unlock_offers bank.0)
//   BE-2  with no gold, Expand is off and says why in words
//   BE-3  with the gold, one press sends unlock_buy; the header reads "/ 120" and the button the server's bank.1 price
//   BE-4  a reload keeps the 120 (the server's cap, player_state.bank_cap), the purse moved by exactly the price
//   BE-5  no console errors, nothing left the machine
// mutant-anchors: none — a manual walk of the real game
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { openWorld } from '../tools/qa/local-world.mjs';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? resolvePath(args[args.indexOf('--shots') + 1]) : null;
const vp = args.includes('--viewport') ? args[args.indexOf('--viewport') + 1].split('x').map(Number) : [1440, 900];
if (shots) mkdirSync(shots, { recursive: true });
const fails = [];
const step = (name, ok, got) => {
  console.log((ok ? '✓ ' : '✗ ') + name + (ok ? '' : ' :: ' + String(got === undefined ? '' : got).slice(0, 400)));
  if (!ok) fails.push(name);
};
const fmt = (n) => n.toLocaleString('en-US') + ' gp';

const world = await openWorld({ tickMs: false });
let code = 0;
try {
  const sql = async (s, p) => (await world.db.query(s, p)).rows;
  const a = await world.play({ account: 'packer', viewport: { width: vp[0], height: vp[1] }, shots });
  const page = a.page;
  await a.createHero('Packer');
  await page.waitForSelector('.hs-launchers');
  const uid = (await sql(`select user_id from public.character_names where name = 'Packer'`))[0].user_id;
  const price = async (id) => Number((await sql('select gold from public.hr_unlock_offers where offer_id = $1', [id]))[0].gold);
  const p0 = await price('bank.0'), p1 = await price('bank.1');
  const openStore = async () => {
    if (!(await page.$('.hw-store'))) await page.keyboard.press('t');
    await page.waitForSelector('.hw-store [data-hs-act="expand"]');
    await page.waitForTimeout(1500);   // the sheet's open transition finishes before any shot
  };
  const read = () => page.evaluate(() => ({
    head: document.querySelector('.hw-store [data-n="bag"]').textContent,
    btn: document.querySelector('.hw-store [data-hs-act="expand"]').textContent,
    off: document.querySelector('.hw-store [data-hs-act="expand"]').disabled,
    why: document.querySelector('.hw-store .hw-store-grow .hw-why').textContent }));

  /* ── BE-1, BE-2 ── a new hero's purse is short of 3,000 */
  await sql('update public.account_wallet set gold = 10 where user_id = $1', [uid]);
  await a.reload(); await page.waitForSelector('.hs-launchers'); await openStore();
  await page.waitForFunction(() => /\/ 100$/.test(document.querySelector('.hw-store [data-n="bag"]').textContent));
  let r = await read();
  step('BE-1 the header reads Bag N / 100', /^Bag \d+ \/ 100$/.test(r.head), r.head);
  step('BE-1 Expand shows the server\'s price', r.btn === 'Expand (+20) · ' + fmt(p0), r.btn + ' vs ' + p0);
  step('BE-2 short of gold: off, and says why', r.off && r.why === 'You need ' + fmt(p0 - 10) + ' more to expand your bag.', JSON.stringify(r));
  if (shots) await a.shot('storage-short');

  /* ── BE-3 ── */
  await sql('update public.account_wallet set gold = $2 where user_id = $1', [uid, p0 + 7]);
  await a.reload(); await page.waitForSelector('.hs-launchers'); await openStore();
  await page.waitForFunction(() => !document.querySelector('.hw-store [data-hs-act="expand"]').disabled);
  if (shots) await a.shot('storage-ready');
  await page.click('.hw-store [data-hs-act="expand"]');
  await page.waitForFunction(() => /\/ 120$/.test(document.querySelector('.hw-store [data-n="bag"]').textContent), null, { timeout: 20000 }).catch(() => {});
  r = await read();
  step('BE-3 the cap goes 100 -> 120', /\/ 120$/.test(r.head), r.head);
  step('BE-3 the next price is the server\'s bank.1', r.btn === 'Expand (+20) · ' + fmt(p1), r.btn + ' vs ' + p1);
  if (shots) await a.shot('storage-bought');

  /* ── BE-4 ── */
  await a.reload(); await page.waitForSelector('.hs-launchers'); await openStore();
  await page.waitForFunction(() => /\/ \d+$/.test(document.querySelector('.hw-store [data-n="bag"]').textContent));
  r = await read();
  const cap = (await sql('select bank_cap from public.player_state where user_id = $1 and slot = 0', [uid]))[0].bank_cap;
  const purse = Number((await sql('select gold from public.account_wallet where user_id = $1', [uid]))[0].gold);
  step('BE-4 a reload keeps 120, the server\'s cap', /\/ 120$/.test(r.head) && cap === 120, r.head + ' cap ' + cap);
  step('BE-4 the purse moved by exactly the price', purse === 7, purse);

  /* ── BE-5 ── */
  step('BE-5 no console errors', a.errors.length === 0, a.errors.join(' | '));
  step('BE-5 nothing left the machine', a.offsite.length === 0, a.offsite.join(' '));
} catch (e) {
  console.error('bag-expand-world: harness', e && e.stack || e);
  code = 2;
} finally {
  await world.close();
}
if (!code) code = fails.length ? 1 : 0;
console.log(code === 0 ? 'bag-expand-world: green' : 'bag-expand-world: RED (' + fails.length + ')');
process.exit(code);
