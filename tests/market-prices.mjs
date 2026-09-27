#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/market-prices.mjs — the tooltip's market line counts SERVER rows only
//
//   node tests/market-prices.mjs           the pure half of src/net/market-prices.js
//   node tests/market-prices.mjs --mutate  re-runs this file with a listingFacts
//                                          that counts local 'L…' rows; the mutant
//                                          must exit 1, and then --mutate exits 0
//
// CLAUDE.md §6: unknown renders as the pending mark (marketLine → null), never
// as "None listed"; a local in-flight row is never market data; and the facts
// follow the LATEST read (a listing that sold while the player was away is
// simply absent from the second read).
// ════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as MP from '../src/net/market-prices.js';

if (process.argv.includes('--mutate')) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, HR_MP_MUTANT: '1' }, encoding: 'utf8' });
  process.stdout.write(r.stdout); process.stderr.write(r.stderr);
  if (r.status === 1) { console.log('✓ market-prices --mutate: the L-rows-counted mutant exits 1 — CAUGHT'); process.exit(0); }
  console.error(`✗ market-prices --mutate: the mutant exited ${r.status} — the test is vacuous`);
  process.exit(1);
}
const MUTATE = process.env.HR_MP_MUTANT === '1';
const U1 = '11111111-2222-4333-8444-555555555555';
const U2 = '22222222-3333-4444-8555-666666666666';
const U3 = '33333333-4444-4555-8666-777777777777';
const row = (id, itemId, askEach, sellerId, qty = 1) => ({ id, itemId, askEach, sellerId, qty });

/* The mutant: the same function with the uuid rule dropped, i.e. every row counts. */
const facts = MUTATE
  ? (l, item) => MP.listingFacts(l, item, () => true)
  : (l, item) => MP.listingFacts(l, item);

let failed = 0, n = 0;
const eq = (name, got, want) => {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.error(`  ✗ ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

const read1 = [
  row(U1, 'normal_log', 9, 'someone-else'),
  row(U2, 'normal_log', 12, 'me:slot-0'),             // own server row: it IS on the market
  row('L1700000000000-1', 'normal_log', 3, 'me:slot-0'), // own in-flight row: not market data
  row('L-seed-1-0', 'normal_log', 2, 'npc-0'),         // a stale seed copy: not market data
  row(U3, 'iron_ore', 30, 'someone-else'),
];
eq('local L rows excluded; other + own uuid rows counted; lowest ask', facts(read1, 'normal_log'), { listed: 2, lowestAsk: 9 });
eq('other items do not leak in', facts(read1, 'iron_ore'), { listed: 1, lowestAsk: 30 });
eq('nothing listed', facts(read1, 'oak_log'), { listed: 0, lowestAsk: null });
eq('garbage input', facts(null, 'normal_log'), { listed: 0, lowestAsk: null });

const ok = { status: 'ok', at: 1, truncated: false };
eq('unknown → pending (null)', MP.marketLine({ status: 'unknown' }, { listed: 2, lowestAsk: 9 }), null);
eq('error → pending (null)', MP.marketLine({ status: 'error' }, { listed: 2, lowestAsk: 9 }), null);
eq('truncated → pending (null)', MP.marketLine({ status: 'ok', truncated: true }, { listed: 2, lowestAsk: 9 }), null);
eq('ok + 0 → None listed', MP.marketLine(ok, { listed: 0, lowestAsk: null }), 'None listed');
eq('ok + n → from Ng · n listed', MP.marketLine(ok, facts(read1, 'normal_log')), 'from 9g · 2 listed');

/* AWAY-style: the 9g listing sold while the player was away. The second read
   no longer carries it, and the line follows the second read — nothing is
   remembered from the first. */
const read2 = read1.filter((l) => l.id !== U1);
eq('after the away sale the facts follow the second read', facts(read2, 'normal_log'), { listed: 1, lowestAsk: 12 });
eq('after the away sale the line follows the second read', MP.marketLine(ok, facts(read2, 'normal_log')), 'from 12g · 1 listed');

/* The cache: a read reports ok/error; a full page reads as truncated. */
MP.__setListingsState({ status: 'unknown' });
eq('initial unknown is stale', MP.isListingsStale(), true);
MP.noteListingsRead('ok', 3, 500);
eq('ok read', [MP.getListingsState().status, MP.getListingsState().truncated, MP.isListingsStale()], ['ok', false, false]);
MP.noteListingsRead('ok', 500, 500);
eq('a full page is truncated', MP.getListingsState().truncated, true);
MP.noteListingsRead('error');
eq('a failed read is not ok', MP.getListingsState().status, 'error');
eq('a TTL-old ok read is stale', (MP.noteListingsRead('ok', 1, 500), MP.isListingsStale(Date.now() + MP.LISTINGS_TTL_MS)), true);

if (failed) {
  console.error(`✗ market-prices: ${failed}/${n} case(s) failed${MUTATE ? ' — the mutant (L rows counted) was CAUGHT' : ''}`);
  process.exit(1);
}
if (MUTATE) process.exit(2);   // the mutant survived: --mutate reports it
console.log(`✓ market-prices: ${n} cases — server rows only, unknown is pending, facts follow the latest read`);
