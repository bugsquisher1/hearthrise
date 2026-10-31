#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/market-window.mjs — WHAT THE WEIGHHOUSE SHOWS BEFORE A PRESS, IN NODE.
//
//   node tests/market-window.mjs             the tests, on the real modules
//   node tests/market-window.mjs --selftest  every planted defect must turn a test red
//
// The pure half of the market window: src/shell/market-model.js, market-words.js, the
// refusal numbers (src/session/refusal.js), the gesture's key (market-intents.js, catch-up.js)
// and the two residue fields. The window itself is played against the real server by
// tools/qa/market-play.mjs, and the server half is tests/market-v2.mjs and market-edge.mjs.
//   W1  the buy plan fills cheapest first, never from your own listings, and never above the price shown
//   W2  the fee and the cut match the server's rounding (rounded up, the fee at least its minimum)
//   W3  Most I can afford stops where the purse stops, cheapest first
//   W4  a search covers tradeable items, listed or not, and never the premium bond
//   W5  the refusal table says the server's own numbers, in the design's words
//   W6  a lost answer is told apart from a refusal; the catch-up retry keeps a market gesture's key
//   W7  the notices: only sold and returned rows newer than the last told; one line for the batch
//   W8  a price from history carries its sample (market review change 5); the Sell sheet's chips cannot read it
//   W9  no name crosses: a read's stray name field never reaches a row
//   W10 the residue fields are on the allowlist, and bounded
//
// The selftest copies src/ to a temp tree, plants one defect per arm and requires the
// named test to fail. No ?v= on imports here (tests/**).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = 'src/shell/market-model.js';
const WORDS = 'src/shell/market-words.js';
const INTENTS = 'src/session/market-intents.js';
const GESTURE = 'src/session/market-gesture.js';
const CATCH = 'src/session/catch-up.js';
const REFUSAL = 'src/session/refusal.js';
const SELL = 'src/shell/windows/market/sell.js';

async function load(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  await import(u(WORDS));   // parsed even when intent-words.js is the only caller
  return { M: await import(u(MODEL)), I: await import(u(INTENTS)), G: await import(u(GESTURE)), C: await import(u(CATCH)),
    F: await import(u(REFUSAL)), R: await import(u('src/session/residue.js')), T: await import(u('src/shell/intent-words.js')), base };
}

const ASKS = [
  { each: 10, qty: 5, listings: [{ id: 'mine', qty: 3, mine: true }, { id: 'a', qty: 2, mine: false }] },
  { each: 12, qty: 4, listings: [{ id: 'b', qty: 4, mine: false }] },
  { each: 20, qty: 10, listings: [{ id: 'c', qty: 10, mine: false }] },
];
const RULES = { feeBp: 100, feeMin: 1, cutBp: 400, ttlH: 168 };

async function runTests({ M, I, G, C, F, R, T, base }) {
  const fails = [];
  const ok = (test, cond, msg) => { if (!cond) fails.push(test + ' ' + msg); };

  /* W1 the plan */
  const p = M.planBuy(ASKS, 3);
  ok('W1', JSON.stringify(p.lines) === JSON.stringify([{ listing: 'a', qty: 2, each: 10 }, { listing: 'b', qty: 1, each: 12 }]), 'cheapest first, skipping your own: ' + JSON.stringify(p.lines));
  ok('W1', p.qty === 3 && p.total === 32, 'the total is what the lines add to: ' + p.total);
  ok('W1', M.planBuy(ASKS, 999).available === 16 && M.planBuy(ASKS, 999).qty === 16, 'all of it never counts your own listing');
  ok('W1', M.planBuy(ASKS, 0).lines.length === 0, 'nothing wanted plans nothing');

  /* W2 fee and cut */
  ok('W2', M.feeOf(RULES, 3, 240) === 8, '1% of 720 rounds up to 8, the design\'s own example: ' + M.feeOf(RULES, 3, 240));
  ok('W2', M.feeOf(RULES, 1, 5) === 1, 'the fee is never under its minimum');
  ok('W2', M.netEachOf(RULES, 240) === 230, 'a 240 sale pays 230 after a 4% cut rounded up: ' + M.netEachOf(RULES, 240));
  ok('W2', M.netEachOf(RULES, 13) === 12, 'the cut rounds UP, as the server rounds it: ' + M.netEachOf(RULES, 13));

  /* W3 what the purse covers */
  ok('W3', M.mostAffordable(ASKS, 44) === 4, 'two at 10 and two at 12 for 44 gold: ' + M.mostAffordable(ASKS, 44));
  ok('W3', M.mostAffordable(ASKS, 9) === 0, 'too poor for the cheapest buys none');
  ok('W3', M.mostAffordable(ASKS, 1e9) === 16, 'a deep purse buys everything but your own');

  /* W4 search */
  ok('W4', M.searchIds('coal', 50).includes('coal'), 'a search finds an item that may not be listed');
  ok('W4', M.searchIds('hearth token', 50).length === 0, 'the premium bond is not searchable');
  ok('W4', M.searchIds('c', 50).length === 0, 'one letter is not a search');
  ok('W4', M.searchIds('a', 50).length === 0 && M.searchIds('ore', 5).length <= 5, 'a search is bounded');

  /* W5 the refusal table */
  const say = (error, figures, verb = 'market_list') => T.refusalText({ ok: false, error, verb, figures });
  ok('W5', /The shop pays 142 for one\. Ask at least that/.test(say('price_below_shop', { floor: 142 })), 'floor: ' + say('price_below_shop', { floor: 142 }));
  ok('W5', /The most is 28,500 each/.test(say('price_above_cap', { ceiling: 28500 })), 'ceiling: ' + say('price_above_cap', { ceiling: 28500 }));
  ok('W5', /You have 50 listings up/.test(say('too_many_listings', { limit: 50 })), 'listings cap');
  ok('W5', /The listing fee is 8 gold/.test(say('insufficient_gold', { need: 8, have: 2 })), 'a list short of its fee');
  ok('W5', /You need 1,560 gold\. You have 1,200/.test(say('insufficient_gold', { need: 1560, have: 1200 }, 'market_buy')), 'a buy short of gold');
  ok('W5', /Only 2 are left at that price/.test(say('not_enough', { available: 2 }, 'market_buy')), 'not enough left');
  ok('W5', /heroes of Level 10 or higher/.test(say('market_locked', { min_level: 10 })), 'the Level rule says its number');
  ok('W5', /can't be sold to other players/.test(say('not_tradeable', null)), 'the listable rule');
  ok('W5', /That's your own listing/.test(say('own_listing', null, 'market_buy')), 'own listing');
  const r = F.refusalOf({ body: { ok: false, verb: 'market_list', error: 'price_below_shop', detail: { floor: 142 } } });
  ok('W5', r.figures && r.figures.floor === 142, 'the floor sits in `detail` on the wire and must reach the words: ' + JSON.stringify(r.figures));
  const top = F.refusalOf({ body: { ok: false, verb: 'market_list', error: 'too_many_listings', limit: 50 } });
  ok('W5', top.figures && top.figures.limit === 50, 'a cap sits on the answer itself: ' + JSON.stringify(top.figures));

  /* W6 lost answers and keys */
  ok('W6', G.answerLost({ ok: false, error: 'network' }) && G.answerLost({ ok: false, error: 'http_502' }), 'no answer is a lost answer');
  ok('W6', !G.answerLost({ ok: false, error: 'gone' }) && !G.answerLost({ ok: false, error: 'http_404' }) && !G.answerLost({ ok: true }), 'an answer is not lost');
  const sent = [];
  const answers = [{ ok: true, body: { ok: false, error: 'settle_first' } }, { ok: true, body: { ok: true } }];
  const link = C.catchUpLink({ rpc: async () => ({}), accrue: async (b) => { sent.push(b.intentId); return answers.shift(); } }, { hunting: () => true, catchUp: async () => {} });
  await link.accrue({ verb: 'market_buy', intentId: 'k1', market: {} });
  ok('W6', sent.length === 2 && sent[0] === 'k1' && sent[1] === 'k1', 'the catch-up retry changed a market gesture\'s key: ' + JSON.stringify(sent));
  const sent2 = [];
  const a2 = [{ ok: true, body: { ok: false, error: 'settle_first' } }, { ok: true, body: { ok: true } }];
  const link2 = C.catchUpLink({ rpc: async () => ({}), accrue: async (b) => { sent2.push(b.intentId); return a2.shift(); } }, { hunting: () => true, catchUp: async () => {} });
  await link2.accrue({ verb: 'shop_buy', intentId: 'k1' });
  ok('W6', sent2.length === 2 && sent2[1] !== 'k1', 'other verbs keep their rule: a new key on the retry');
  let calls = 0;
  const q = await I.marketCancel({ characters: () => [] }, { status: 'ready', edgeIntent: async (v, f, rd, k) => { calls++; ok('W6', k === 'kk', 'the caller\'s key is the one sent'); return calls < 2 ? { ok: false, error: 'version_conflict' } : { ok: true }; } }, 'id', 'kk');
  ok('W6', q.ok === true && calls === 2, 'version_conflict is retried quietly under the same key');

  /* W7 notices */
  const T0 = Date.parse('2026-10-31T10:00:00Z');
  const at = (m) => new Date(T0 + m * 60000).toISOString();
  const hist = [
    { what: 'sold', item_id: 'coal', qty: 2, gold: 24, each: 13, at: at(3) },
    { what: 'listed', item_id: 'coal', qty: -5, gold: -1, each: 13, at: at(2) },
    { what: 'sold', item_id: 'coal', qty: 1, gold: 12, each: 13, at: at(1) },
    { what: 'returned', item_id: 'coal', qty: 2, gold: 0, at: at(4) },
    { what: 'sold', item_id: 'coal', qty: 1, gold: 12, each: 13, at: at(-5) },
  ];
  const n = M.noticesSince(hist, T0);
  ok('W7', n.rows.length === 3 && n.newest === T0 + 4 * 60000, 'only sold and returned, newer than the last told: ' + n.rows.length);
  ok('W7', M.noticesSince(hist, T0 + 4 * 60000).rows.length === 0, 'nothing is told twice');
  const away = M.noticeLines(n.rows, true);
  ok('W7', /^While you were away the Weighhouse sold 2 lots for 39 gold\.$/.test(away[0].text), 'the away line: ' + away[0].text);
  ok('W7', /2 Coal didn't sell and are back in your storage\./.test(away[1].text), 'the return: ' + away[1].text);
  const one = M.noticeLines(n.rows.filter((x) => x.qty === 2 && x.what === 'sold'), false);
  ok('W7', /^The Weighhouse sold 2 Coal for 26 gold\. You received 24 gold\.$/.test(one[0].text), 'one sale online: ' + one[0].text);

  /* W8 the sample, and no one-press chip from market history */
  const s = M.priceSample({ at: T0, history: [{ day: '2026-10-30', trades: 2 }, { day: '2026-10-01', trades: 9 }] });
  ok('W8', s.sales7d === 2 && s.line === '2 sales this week', 'the week\'s sales only: ' + JSON.stringify(s));
  ok('W8', M.priceSample({ at: T0, history: [{ day: '2026-10-30', trades: 1 }] }).line === '1 sale this week', 'one sale reads as one');
  const sell = readFileSync(join(base, SELL), 'utf8');
  const chips = sell.match(/data-hs-act="ms-chip" data-chip="[a-z]+"/g) || [];
  ok('W8', chips.length === 2 && chips.every((c) => /suggested|last/.test(c)), 'the sheet\'s one-press chips are Suggested and Your last price only: ' + chips.join(' '));
  ok('W8', /lastAsk\(sc, f\.pick\) : suggested\(f\.pick, s\)/.test(sell), 'a chip reads the player\'s own price or the catalogue, never the market');

  /* W9 no name crosses */
  const row = M.summaryOf({ item_id: 'coal', seller_name: 'Marlow', seller_user_id: 'u', listable: true, lowest: 3, for_sale: 1 });
  ok('W9', !JSON.stringify(row).includes('Marlow') && !('seller_user_id' in row), 'a stray name would reach the row');
  const ml = M.listingOf({ id: 'x', item_id: 'coal', buyer_name: 'Tessaly', qty: 1, qty_listed: 1, ask_each: 3, fee: 1 });
  ok('W9', !JSON.stringify(ml).includes('Tessaly'), 'a stray name would reach My listings');

  /* W10 the residue */
  ok('W10', R.RESIDUE_FIELDS.includes('marketView') && R.RESIDUE_FIELDS.includes('marketSeen'), 'the two fields are not on the allowlist');
  const v = R.sanitizeResidueField('marketView', { cat: 'gear', sort: 'most', deliver: 'bag', source: 'storage', gold: 500, price: 3 });
  ok('W10', JSON.stringify(v) === JSON.stringify({ cat: 'gear', sort: 'most', deliver: 'bag', source: 'storage' }), 'marketView keeps only its own four: ' + JSON.stringify(v));
  ok('W10', Object.keys(R.sanitizeResidueField('marketView', { deliver: 'seller' })).length === 0, 'a junk delivery is dropped');
  ok('W10', R.sanitizeResidueField('marketSeen', 'soon') === 0 && R.sanitizeResidueField('marketSeen', 12) === 12, 'marketSeen is a whole time or nothing');
  return fails;
}

const MUTANTS = [
  { test: 'W1', file: MODEL, from: '      if (l.mine) continue;\n      available += l.qty;', to: '      available += l.qty;', why: 'the plan buys your own listing' },
  { test: 'W1', file: MODEL, from: 'total += take * a.each;', to: 'total += take * ASK_LAST;', why: 'the shown total is not the plan\'s' , extra: ['  let left = Math.max(0, Math.floor(want) || 0), qty = 0, total = 0, available = 0;', '  const ASK_LAST = asks.length ? asks[asks.length - 1].each : 0;\n  let left = Math.max(0, Math.floor(want) || 0), qty = 0, total = 0, available = 0;'] },
  { test: 'W2', file: MODEL, from: 'return ask - Math.ceil(ask * rules.cutBp / 10000);', to: 'return ask - Math.floor(ask * rules.cutBp / 10000);', why: 'the cut rounds down, so the sheet promises more than the server pays' },
  { test: 'W2', file: MODEL, from: 'return Math.max(rules.feeMin, Math.ceil(qty * ask * rules.feeBp / 10000));', to: 'return Math.floor(qty * ask * rules.feeBp / 10000);', why: 'the sheet shows a smaller fee than the server takes' },
  { test: 'W3', file: MODEL, from: '    left -= take * a.each;\n', to: '', why: 'Most I can afford never spends the purse it counts' },
  { test: 'W4', file: MODEL, from: ' && !ITEMS[id].premium);', to: ');', why: 'the bond is offered in a search' },
  { test: 'W5', file: WORDS, from: "'The shop pays ' + whole(f.floor)", to: "'The shop pays ' + whole(f.ceiling)", why: 'the refusal names the wrong number' },
  { test: 'W5', file: REFUSAL, from: 'const v = n(b[k]) !== null ? b[k] : d[k];', to: 'const v = b[k];', why: 'a number one level down never reaches the words' },
  { test: 'W6', file: GESTURE, from: "r.error === 'network' || ", to: '', why: 'a dropped connection reads as a refusal, so the next press is a NEW gesture and buys twice' },
  { test: 'W6', file: CATCH, from: "if (/^market_/.test(String(body.verb))) return server.accrue(body); ", to: '', why: 'the catch-up retry takes a key the window never saw' },
  { test: 'W7', file: MODEL, from: 'h.at > seenAt && ', to: '', why: 'every old sale is told again' },
  { test: 'W8', file: SELL, from: "t.getAttribute('data-chip') === 'last' ? lastAsk(sc, f.pick) : suggested(f.pick, s)", to: "t.getAttribute('data-chip') === 'last' ? s.lastEach : suggested(f.pick, s)", why: 'one press prices a good from a number a wash pair can print' },
  { test: 'W9', file: MODEL, from: "return { id: raw.item_id, listable: raw.listable === true,", to: "return { ...raw, id: raw.item_id, listable: raw.listable === true,", why: 'the row keeps whatever the read carried' },
  { test: 'W10', file: 'src/session/residue.js', from: "  if (v.deliver === 'storage' || v.deliver === 'bag') out.deliver = v.deliver;", to: '  if (v.deliver) out.deliver = v.deliver;', why: 'a junk delivery survives' },
];

async function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), 'market-window-'));
  let caught = 0;
  try {
    for (const m of MUTANTS) {
      const base = join(tmp, String(caught) + '-' + m.test);
      const skip = new Set(['styles', 'vendor'].map((d) => join(ROOT, 'src', d)));
      mkdirSync(join(base, 'src'), { recursive: true });
      cpSync(join(ROOT, 'src'), join(base, 'src'), { recursive: true, filter: (s) => !skip.has(s) });
      const p = join(base, m.file);
      let src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
      if (!src.includes(m.from)) throw new Error('selftest: anchor for ' + m.test + ' not found in ' + m.file);
      src = src.replace(m.from, () => m.to);
      if (m.extra) src = src.replace(m.extra[0], () => m.extra[1]);
      writeFileSync(p, src);
      const fails = await runTests(await load(base));
      if (!fails.some((f) => f.startsWith(m.test + ' '))) { console.error('  MISSED: ' + m.test + ' stayed green: ' + m.why); process.exit(1); }
      caught++;
      console.log('  caught  ' + m.test + '  ' + m.why);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log('market-window selftest: ' + caught + '/' + MUTANTS.length + ' planted defects caught');
}

if (process.argv.includes('--selftest')) {
  const clean = await runTests(await load(ROOT));
  if (clean.length) { console.error('market-window selftest: the CLEAN arm is red\n  ' + clean.join('\n  ')); process.exit(1); }
  await selftest();
} else {
  const fails = await runTests(await load(ROOT));
  if (fails.length) { console.error('market-window: ' + fails.length + ' failing\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('market-window: the plan, the fee and cut, the refusal words, the gesture\'s key, the notices and the price sample hold');
}
