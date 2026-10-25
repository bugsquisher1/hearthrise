#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/market-edge.mjs — THE WEIGHHOUSE THROUGH THE EDGE (market lane 2), END TO END.
//
//   node tests/market-edge.mjs              the guard
//   node tests/market-edge.mjs --list       the mutation catalogue
//   node tests/market-edge.mjs --selftest   every mutation must turn it RED
//
// THE CLAIM UNDER TEST: a client can say to the market only what MARKET_FIELDS
// names (the seller's ask the ONE price), every other shape is refused BY NAME
// before any database statement, and through the real request.js -> market.js ->
// hr_market_* path (the whole migration chain in PGlite, run as `hr_engine`):
// list -> browse -> buy -> mine -> cancel moves exactly the goods and gold the
// trade says, once; a replay moves nothing; the switch OFF answers market_closed;
// a bag verb settles the hero first and a Storage verb never does; and a sale
// between two accounts on one stored network is flagged and left out of every
// price history (2027-01-21-market-same-network.sql, threat model #8).
//
//   E0  the wire contract, no database (parser, registry, client builder agree)
//   E1  the switch OFF: market_closed, bare, the gate spent first; mine still answers
//   E2  the happy path through the CLIENT plumbing (src/session/market-intents.js):
//       list from the bag -> browse -> item page -> buy into Storage -> mine -> cancel
//   E3  idempotent: a replayed list / buy moves nothing; a reused key is intent_mismatch
//   E4  the same-network sale: flagged in market_sales, absent from every history read
//   E5  settle first on the bag path only (an unsettled town worker); the RPC alone refuses
//   E6  the counters each verb really spends (the registry describes the code)
//   E7  a shape refusal costs ZERO statements; a stale-view refusal carries a fresh envelope
//   E8  every state-carrying code is answered by lane 1 only AFTER its rate counter
//   E9  index.ts dispatches each verb with a literal argument list (no spread of the intent)
//   E10 a second apply of the migration is byte-identical
//
// WHAT IT CANNOT EXERCISE: true concurrency (PGlite is one backend) — the threat
// model's race legs (#2 four parallel lists at 49 open; #3 a party settle and a buy
// into one bag) need a multi-connection database; the Deno shell and the JWT.
// mutant-anchors: supabase/functions/hr-accrue/market.js supabase/functions/hr-accrue/request.js supabase/functions/hr-accrue/intents.js src/session/edge-intents.js supabase/migrations/2027-01-21-market-same-network.sql
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile, mkdtemp, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { bootReplay, LAST_PATCHED, ROOT, inventory } from './schema-replay.mjs';
import { runMutationProof } from './mutation-proof.mjs';

const MIG = '2027-01-21-market-same-network.sql';
const MIG_PATH = 'supabase/migrations/2027-01-21-market-same-network.sql';
const LANE1 = 'supabase/migrations/2027-01-12-market-account.sql';
const FN = (f) => join(ROOT, 'supabase', 'functions', 'hr-accrue', f);

/* ── THE MUTATION CATALOGUE: each plants a real defect, in the edge bytes (a temp
   copy) or in the migration's text (the replay). ─────────────────────────── */
const MUTATIONS = {
  buy_forwards_ask: {
    why: 'THE ONE THAT MATTERS: market_buy forwards a caller-supplied price where the buyer\'s ceiling goes, so a '
       + 'hostile body sets what it agrees to pay from a field the buyer never declared',
    patches: [['supabase/functions/hr-accrue/market.js',
      'args: (version) => [user, slot, version, intentId, m.listing, m.qty, m.max_each, m.deliver],',
      'args: (version) => [user, slot, version, intentId, m.listing, m.qty, m.ask_each || m.max_each, m.deliver],']],
  },
  parser_reads_price_strings: {
    why: 'readMarket accepts a numeric STRING for the ask, so "1e9" lists at a billion gold instead of bad_price',
    patches: [['supabase/functions/hr-accrue/request.js',
      'function readWhole(v, max) {\n  return typeof v === \'number\' && Number.isSafeInteger(v) && v >= 1 && v <= max ? v : null;',
      'function readWhole(v, max) {\n  const n = Number(v); return Number.isSafeInteger(n) && n >= 1 && n <= max ? n : null;']],
  },
  parser_forwards_unknown_keys: {
    why: 'readMarket copies the whole `market` object, so a `seller`, `gold` or `price` key reaches the verb',
    patches: [['supabase/functions/hr-accrue/request.js',
      '  const out = Object.create(null);\n  if (own(\'source\'))',
      '  const out = Object.assign(Object.create(null), m);\n  if (own(\'source\'))']],
  },
  storage_path_settles: {
    why: 'threat model P5: a Storage-only list settles the hero first, so an unsettled town worker pays a settle '
       + '(and a state read) for a verb that touches no engine input',
    patches: [['supabase/functions/hr-accrue/market.js',
      "exec, user, slot, verb: LIST_VERB, touchesBag: m.source === 'bag', sql: LIST_SQL, field: 'listed',",
      "exec, user, slot, verb: LIST_VERB, touchesBag: true, sql: LIST_SQL, field: 'listed',"]],
  },
  bag_list_no_settle: {
    why: 'the registry stops settling a list (collectsFirst false), so a list from the bag of an unsettled town '
       + 'worker is refused settle_first instead of being settled first',
    patches: [['supabase/functions/hr-accrue/intents.js',
      "  market_list: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: true }),",
      "  market_list: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),"]],
  },
  write_skips_gate: {
    why: 'a Storage write skips the edge gate: market writes are no longer bounded by the shop budget',
    patches: [['supabase/functions/hr-accrue/market.js',
      '  const [row] = await exec(GATE_SQL, [user, slot, rateBucketFor(verb)]);\n  if (!row || row.allowed !== true) {',
      '  const row = { allowed: true };\n  if (!row || row.allowed !== true) {']],
  },
  receipt_on_replay: {
    why: 'a REPLAYED buy reports a receipt for a trade this invocation did not make',
    patches: [['supabase/functions/hr-accrue/market.js',
      "      receipt: (res.replayed === true || !res[field]) ? null : res[field],",
      "      receipt: res[field] || null,"]],
  },
  every_refusal_reads_state: {
    why: 'every market refusal reads a fresh envelope, so a closed market (refused BEFORE the RPC\'s counter) buys '
       + 'a free hr_state_of read per call',
    patches: [['supabase/functions/hr-accrue/market.js',
      '    if (!MARKET_STATE_CODES.includes(refusal.error)) {', '    if (false) {']],
  },
  shape_after_the_gate: {
    why: 'the buy\'s shape checks move behind the gate: a malformed client loops on garbage and spends statements',
    patches: [['supabase/functions/hr-accrue/market.js',
      "  if (!m || !m.listing) return shape(BUY_VERB, INTENT_ERRORS.BAD_REQUEST, { field: 'listing' });\n  if (!m.qty) return shape(BUY_VERB, INTENT_ERRORS.BAD_QTY);",
      "  await exec(GATE_SQL, [user, slot, rateBucketFor(BUY_VERB)]);\n  if (!m || !m.listing) return shape(BUY_VERB, INTENT_ERRORS.BAD_REQUEST, { field: 'listing' });\n  if (!m.qty) return shape(BUY_VERB, INTENT_ERRORS.BAD_QTY);"]],
  },
  client_sends_buyer_ask: {
    why: 'the client builder lets market_buy carry an `ask_each`: a price field on the buyer\'s wire',
    patches: [['src/session/edge-intents.js',
      "  market_buy: Object.freeze(['listing', 'qty', 'max_each', 'deliver']),",
      "  market_buy: Object.freeze(['listing', 'qty', 'max_each', 'deliver', 'ask_each']),"]],
  },
  flag_never_set: {
    why: 'threat model #8: the trigger never stamps the flag, so a same-network sale is a normal one',
    patches: [[MIG_PATH,
      '  new.same_network := public.hr_market_same_network(new.seller_user_id, new.buyer_user_id);',
      '  new.same_network := false;']],
  },
  history_keeps_flagged: {
    why: 'the flagged sale stays in market_item_daily: a wash pair prints the 30-day line and the 7-day typical',
    patches: [[MIG_PATH, '  if new.same_network then\n    v_day', '  if false then\n    v_day']],
  },
  rebuild_counts_flagged: {
    why: 'the rebuild re-counts EARLIER flagged sales of the day, so a second wash puts the first one back in',
    patches: [[MIG_PATH, "       where s.item_id = new.item_id and s.at >= v_t0 and s.at < v_t0 + interval '1 day' and not s.same_network",
      "       where s.item_id = new.item_id and s.at >= v_t0 and s.at < v_t0 + interval '1 day'"]],
  },
  recent_keeps_flagged: {
    why: 'the item page\'s last ten sales still show a flagged sale (the "last sold" chip a wash pair steers)',
    patches: [[MIG_PATH, "           where x.item_id = p_item_id and not x.same_network order by x.at desc limit 10) s;",
      "           where x.item_id = p_item_id order by x.at desc limit 10) s;"]],
  },
};

/* A SQL mutant must be caught by a LEG here, not only by the migration's own §6 refusing to install
   it: every SQL arm boots with §6 turned into an uncalled function. */
const SELF_CHECK_SILENCE = [[MIG_PATH,
  '-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back by a sentinel ──\ndo $$\n',
  '-- ── §6 SELF-CHECK — SILENCED by tests/market-edge.mjs for a SQL mutant ──\n'
  + 'create or replace function pg_temp.hr_market_net_selfcheck_off() returns void language plpgsql as $$\n']];

let failures = 0;
const problems = [];
const ok = (cond, msg) => { if (!cond) { failures++; problems.push(msg); } };
const brief = (o) => JSON.stringify(o === undefined ? null : o).slice(0, 260);
const uuid = () => crypto.randomUUID();
const has = (a) => process.argv.includes(`--${a}`);
/** Does this body carry the hr_state_of envelope (the server's state, its clock and the bag)? */
const isEnv = (b) => !!b && typeof b === 'object' && typeof b.now === 'string' && !!b.inventory && typeof b.inventory === 'object'
  && Object.prototype.hasOwnProperty.call(b, 'version');

/** The modules: the repo's own bytes, or a patched temp copy (edge + src at the same depth). */
async function loadModules(edgePatches) {
  let base = ROOT;
  if (edgePatches.length) {
    base = await mkdtemp(join(tmpdir(), 'hr-mkt-edge-'));
    await cp(join(ROOT, 'supabase', 'functions'), join(base, 'supabase', 'functions'), { recursive: true });
    await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
    const byFile = new Map();
    for (const [file, find, repl] of edgePatches) {
      const src = byFile.get(file) ?? (await readFile(join(base, file), 'utf8')).replace(/\r\n/g, '\n');
      const n = src.split(find).length - 1;
      if (n !== 1) { const e = new Error(`mutation anchor matched ${n} times in ${file}: ${find.slice(0, 80)}`); e.harness = true; throw e; }
      byFile.set(file, src.replace(find, () => repl));
    }
    for (const [file, text] of byFile) await writeFile(join(base, file), text, 'utf8');
  }
  const bust = `?t=${Date.now()}${Math.random()}`;
  const imp = (f) => import(pathToFileURL(join(base, f)).href + bust);
  return {
    base,
    req: await imp('supabase/functions/hr-accrue/request.js'),
    it: await imp('supabase/functions/hr-accrue/intents.js'),
    mk: await imp('supabase/functions/hr-accrue/market.js'),
    ei: await imp('src/session/edge-intents.js'),
    mi: await imp('src/session/market-intents.js'),
  };
}

/** The one-statement seam index.ts hands every verb, run as hr_engine, COUNTING statements. */
function makeExec(db, counter) {
  return async (text, params) => {
    counter.n++;
    await db.exec('set role hr_engine');
    try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
  };
}

// ════════════════════════════════════════════════════════════════════════
async function run(mutation) {
  failures = 0; problems.length = 0;
  const m = mutation ? MUTATIONS[mutation] : null;
  const all = m ? m.patches : [];
  const edgePatches = all.filter(([f]) => f !== MIG_PATH);
  const sqlMut = all.filter(([f]) => f === MIG_PATH).map(([, a, b]) => [a, b]);
  const sqlPairs = sqlMut.length ? [...sqlMut, ...SELF_CHECK_SILENCE.map(([, a, b]) => [a, b])] : [];
  const mods = await loadModules(edgePatches);
  const { req, it, mk, ei, mi } = mods;

  // ══ E0 · THE WIRE CONTRACT, no database ═══════════════════════════════
  const VERBS = ['market_list', 'market_cancel', 'market_buy', 'market_browse', 'market_item', 'market_mine'];
  for (const v of VERBS) {
    ok(req.VERBS.includes(v) && it.isKnownVerb(v), `E0: ${v} is not a verb the edge parses and the registry describes`);
    ok(Object.prototype.hasOwnProperty.call(ei.EDGE_INTENTS, v), `E0: ${v} is not on the client's EDGE_INTENTS`);
  }
  const reg = (v) => JSON.stringify(it.INTENT_REGISTRY[v]);
  ok(reg('market_list') === JSON.stringify({ bucket: 'shop', needsKey: true, collectsFirst: true })
     && reg('market_buy') === JSON.stringify({ bucket: 'shop', needsKey: true, collectsFirst: true })
     && reg('market_cancel') === JSON.stringify({ bucket: 'shop', needsKey: true, collectsFirst: false }),
    `E0: the write rows are ${reg('market_list')} ${reg('market_buy')} ${reg('market_cancel')}`);
  for (const v of ['market_browse', 'market_item', 'market_mine']) {
    ok(reg(v) === JSON.stringify({ bucket: 'market_read', needsKey: false, collectsFirst: false }), `E0: ${v} row is ${reg(v)}`);
  }
  ok(req.INTENT_KEYS.includes('market'), 'E0: `market` is not in INTENT_KEYS');
  /* the client can name only what the edge reads, inside the edge's bounds */
  for (const [v, fields] of Object.entries(ei.MARKET_FIELDS)) {
    for (const f of fields) ok(req.MARKET_KEYS.includes(f), `E0: the client sends ${v}.${f}, which readMarket never reads`);
  }
  ok(ei.EDGE_LIMITS.marketQty === req.MAX_MARKET_QTY && ei.EDGE_LIMITS.marketPrice === req.MAX_MARKET_PRICE
     && ei.EDGE_LIMITS.marketItems === req.MAX_MARKET_ITEMS, 'E0: the client\'s market bounds are not the edge\'s');
  const lane1 = (await readFile(join(ROOT, LANE1), 'utf8')).replace(/\r\n/g, '\n');
  ok(/max_qty <= 100000000/.test(await readFile(join(ROOT, 'supabase/migrations/2026-08-17-market-v2.sql'), 'utf8'))
     && req.MAX_MARKET_QTY === 100000000, 'E0: MAX_MARKET_QTY is not hr_market_config\'s max_qty ceiling');
  ok(/ask_each\s+bigint not null check \(ask_each > 0 and ask_each <= 1000000000\)/.test(lane1) && req.MAX_MARKET_PRICE === 1e9,
    'E0: MAX_MARKET_PRICE is not market_listings.ask_each\'s CHECK');
  /* the buyer's wire carries no ask; the ONE price field is the seller's */
  ok(!ei.MARKET_FIELDS.market_buy.some((f) => /ask|price|gold|cost|total|amount/i.test(f)),
    `E0: market_buy carries a price-like field: ${ei.MARKET_FIELDS.market_buy}`);
  /* hostile bodies at the parser */
  const P = (market) => req.parseIntent({ verb: 'market_list', intentId: uuid(), market }).market;
  const h = P({ source: 'bag', item: 'normal_log', qty: 3, ask_each: 10, price: 1, gold: 9, seller: 'x', name: 'y', __proto__: { qty: 9 } });
  ok(h && Object.keys(h).sort().join(',') === 'ask_each,item,qty,source', `E0: readMarket kept ${h && Object.keys(h)}`);
  ok(P({ ask_each: '1e9' }).ask_each === null && P({ qty: '5' }).qty === null && P({ qty: 1.5 }).qty === null
     && P({ qty: 0 }).qty === null && P({ qty: req.MAX_MARKET_QTY + 1 }).qty === null && P({ ask_each: 1e9 + 1 }).ask_each === null,
    'E0: readMarket admitted a string, a fraction, zero or an out-of-range number');
  ok(P({ listing: '{' + uuid() + '}' }).listing === null && P({ listing: uuid().replace(/-/g, '') }).listing === null
     && P({ listing: uuid().toUpperCase() }).listing !== null, 'E0: readMarket\'s listing is not a canonical uuid');
  ok(P({ items: Array.from({ length: 51 }, (_, i) => `x${i}`) }).items === null && P({ items: ['ok_id', 'Bad Id'] }).items === null
     && P({ source: 'hunt' }).source === null && P({ deliver: 'mail' }).deliver === null, 'E0: readMarket admitted a bad page / selector');
  ok(req.parseIntent({ verb: 'shop_buy', market: { qty: 5000 } }).qty === null,
    'E0: a market count leaked into the shop verbs\' qty (MAX_QTY bounds the NPC gold math)');
  /* the client builder: names only, its own subfields only, every one required (browse optional) */
  const cb = (verb, fields) => ei.edgeBody(0, verb, fields, uuid());
  ok(cb('market_list', { market: { source: 'bag', item: 'normal_log', qty: 2, ask_each: 9 } }) !== null, 'E0: a good list body was refused');
  ok(cb('market_list', { market: { source: 'bag', item: 'normal_log', qty: 2 } }) === null, 'E0: a list without its ask was built');
  ok(cb('market_buy', { market: { listing: uuid(), qty: 1, max_each: 9, deliver: 'storage', ask_each: 1 } }) === null,
    'E0: the builder put an ask on a buy');
  ok(cb('market_browse', { market: {} }) !== null && cb('market_mine', {}) !== null, 'E0: an empty browse / mine was refused');
  ok(cb('market_item', { market: { item: 'normal_log', price: 3 } }) === null, 'E0: the builder forwarded an unknown subfield');

  // ══ THE DATABASE ═════════════════════════════════════════════════════
  let db;
  try {
    db = (await bootReplay(sqlPairs.length ? { patches: new Map([[MIG, sqlPairs]]), upTo: LAST_PATCHED } : {})).db;
  } catch (e) {
    if (e.harness) throw e;
    ok(false, `the migration chain refused: ${String(e.message).split('\n')[0]}`);
    return;
  }
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const counter = { n: 0 };
  const exec = makeExec(db, counter);
  const A = uuid(); const B = uuid(); const C = uuid();
  for (const u of [A, B, C]) {
    await q('insert into auth.users (id) values ($1) on conflict (id) do nothing', [u]);
    await q("select set_config('request.jwt.claim.sub', $1, false)", [u]);
    const r = (await one('select public.hr_create_character(0) r')).r;
    if (!r || r.ok !== true) { const e = new Error(`fixture: hr_create_character refused ${brief(r)}`); e.harness = true; throw e; }
    await q('update public.account_wallet set gold = 1000000 where user_id = $1', [u]);
  }
  await q("select set_config('request.jwt.claim.sub', '', false)");
  const goods = await q(`select item_id, floor_each::text f from public.hr_market_items
                          where listable and floor_each > 1 and ceiling_each < 1000000000
                            and item_id not in (select item_id from public.hr_item_slots) order by item_id limit 1`);
  if (!goods.length) { const e = new Error('fixture: no listable stackable good'); e.harness = true; throw e; }
  const ITEM = goods[0].item_id; const FLOOR = Number(goods[0].f);
  const gate = () => q('delete from public.hr_rate_counters');
  const cfg = (on) => q('update public.hr_market_config set enabled = $1 where only_row', [on]);
  const bag = async (u) => Number((await one('select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)::text q', [u, ITEM])).q);
  const store = async (u) => Number((await one('select coalesce((select qty from public.account_bank where user_id = $1 and item_id = $2), 0)::text q', [u, ITEM])).q);
  const purse = async (u) => Number((await one('select coalesce((select gold from public.account_wallet where user_id = $1), 0)::text g', [u])).g);
  const escrow = async () => Number((await one('select coalesce(sum(qty), 0)::text q from public.market_listings where item_id = $1', [ITEM])).q);
  const sinks = async () => Number((await one(`select (coalesce((select sum(tax) from public.market_sales), 0)
     + coalesce((select sum(-gold) from public.player_ledger where kind = 'trade' and intent like 'market\\_list:%'), 0))::text s`)).s);
  const goldAll = async () => (await purse(A)) + (await purse(B)) + (await purse(C)) + (await sinks());
  const itemsAll = async () => (await bag(A)) + (await bag(B)) + (await bag(C)) + (await store(A)) + (await store(B)) + (await store(C)) + (await escrow());

  /* index.ts's dispatch, field by field (E9 grades the real one against this). */
  const route = {
    market_list: (o, i) => mk.runMarketList({ ...o, intentId: i.intentId, market: i.market }),
    market_cancel: (o, i) => mk.runMarketCancel({ ...o, intentId: i.intentId, market: i.market }),
    market_buy: (o, i) => mk.runMarketBuy({ ...o, intentId: i.intentId, market: i.market }),
    market_browse: (o, i) => mk.runMarketBrowse({ ...o, market: i.market }),
    market_item: (o, i) => mk.runMarketItem({ ...o, market: i.market }),
    market_mine: (o) => mk.runMarketMine(o),
  };
  const call = async (user, body) => {
    const i = req.parseIntent(JSON.parse(JSON.stringify(body)));
    return route[i.verb]({ exec, user, slot: i.slot }, i);
  };
  /* A CharacterSession as far as market-intents.js sees one: edgeBody -> the edge -> the answer. */
  const session = (user) => ({
    slot: 0, status: 'ready',
    async edgeIntent(verb, fields, read) {
      const body = ei.edgeBody(0, verb, fields, uuid());
      if (!body) return { ok: false, error: 'bad_intent' };
      const out = await call(user, body);
      const ans = { ok: out.status === 200, status: out.status, body: out.body };
      if (read === true) return ei.edgeRead(ans);
      return ans.ok && out.body.ok === true ? { ok: true, body: out.body } : { ok: false, error: out.body.error, body: out.body };
    },
  });
  const sA = session(A); const sB = session(B); const sC = session(C);
  const account = { characters: () => [] };
  const leg = async (fn) => { await gate(); try { await fn(); } catch (e) { if (e.harness) throw e; ok(false, `leg threw: ${String(e.message).split('\n')[0]}`); } };
  await q('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 20) on conflict (user_id, slot, item_id) do update set qty = 20', [A, ITEM]);

  // ══ E1 · THE SWITCH OFF ═══════════════════════════════════════════════
  await leg(async () => {
    ok((await one('select enabled from public.hr_market_config')).enabled === false, 'E1: the chain does not ship the market OFF');
    counter.n = 0;
    const l = await call(A, { verb: 'market_list', intentId: uuid(), market: { source: 'storage', item: ITEM, qty: 1, ask_each: FLOOR } });
    ok(l.status === 409 && l.body.error === 'market_closed' && !isEnv(l.body), `E1: a closed Storage list answered ${l.status} ${brief(l.body)}`);
    ok(counter.n === 2, `E1: a closed Storage list cost ${counter.n} statements (want the gate + the RPC)`);
    const lb = await call(A, { verb: 'market_list', intentId: uuid(), market: { source: 'bag', item: ITEM, qty: 1, ask_each: FLOOR } });
    ok(lb.body.error === 'market_closed', `E1: a closed bag list answered ${brief(lb.body)}`);
    const b = await call(B, { verb: 'market_buy', intentId: uuid(), market: { listing: uuid(), qty: 1, max_each: FLOOR, deliver: 'storage' } });
    ok(b.body.error === 'market_closed', `E1: a closed buy answered ${brief(b.body)}`);
    const br = await mi.marketBrowse(sB, {});
    ok(br.ok === false && br.error === 'market_closed', `E1: a closed browse answered ${brief(br)}`);
    const mine = await mi.marketMine(sA);
    ok(mine.ok === true && Array.isArray(mine.body.listings) && mine.body.rules && mine.body.rules.enabled === false,
      `E1: mine must answer with the switch off (an owner can always see and cancel): ${brief(mine)}`);
    const c = await mi.marketCancel(account, sA, uuid());
    ok(c.ok === false && c.error === 'gone', `E1: a cancel with the switch off answered ${brief(c)}`);
    ok((await bag(A)) === 20, 'E1: a closed market moved the bag');
  });

  await cfg(true);
  let listing = null;
  // ══ E2 · THE HAPPY PATH THROUGH THE CLIENT PLUMBING ═══════════════════
  await leg(async () => {
    const g0 = await goldAll(); const i0 = await itemsAll(); const pa0 = await purse(A); const pb0 = await purse(B);
    const l = await mi.marketList(account, sA, { source: 'bag', item: ITEM, qty: 5, askEach: FLOOR });
    ok(l.ok === true && l.body.receipt && l.body.receipt.item_id === ITEM && l.body.receipt.qty === 5,
      `E2: the list refused or carried no receipt ${brief(l)}`);
    listing = l.body && l.body.receipt ? l.body.receipt.listing_id : null;
    ok(isEnv(l.body), 'E2: the list answered no envelope');
    ok((await bag(A)) === 15 && (await escrow()) === 5, 'E2: the escrow is not a debit of the bag');
    const fee = pa0 - (await purse(A));
    ok(fee === Number(l.body.receipt.fee) && fee >= 1, `E2: the fee burned ${fee}, the receipt says ${l.body.receipt && l.body.receipt.fee}`);
    const br = await mi.marketBrowse(sB, {});
    ok(br.ok === true && br.body.items.some((x) => x.item_id === ITEM && x.for_sale === 5 && x.lowest === FLOOR),
      `E2: browse does not show the listing ${brief(br.body && br.body.items)}`);
    const named = await mi.marketBrowse(sB, { items: [ITEM] });
    ok(named.ok === true && named.body.items.length === 1 && named.body.items[0].item_id === ITEM, `E2: a named browse answered ${brief(named)}`);
    const page = await mi.marketItem(sB, ITEM);
    ok(page.ok === true && page.body.asks.length === 1 && page.body.asks[0].listings[0].id === listing && page.body.asks[0].listings[0].mine === false,
      `E2: the item page does not show B one foreign ask ${brief(page.body && page.body.asks)}`);
    ok(!JSON.stringify(page.body).includes(A), 'E2: the item page names the seller account');
    const b = await mi.marketBuy(account, sB, { listing, qty: 2, maxEach: FLOOR });
    ok(b.ok === true && b.body.receipt && b.body.receipt.qty === 2 && b.body.receipt.each === FLOOR && b.body.receipt.deliver === 'storage',
      `E2: the buy refused or its receipt is wrong ${brief(b)}`);
    ok((await store(B)) === 2 && (await escrow()) === 3, 'E2: the goods did not reach the buyer\'s Storage');
    ok((await purse(B)) === pb0 - 2 * FLOOR, `E2: the buyer paid ${pb0 - (await purse(B))}, not ${2 * FLOOR}`);
    const mine = await mi.marketMine(sA);
    const row = mine.ok ? mine.body.listings.find((x) => x.id === listing) : null;
    ok(row && row.qty === 3 && row.qty_listed === 5 && Number(row.received) > 0, `E2: mine does not show the part-sold listing ${brief(row)}`);
    ok(mine.ok && mine.body.history.some((h) => h.what === 'sold') && mine.body.history.some((h) => h.what === 'listed'),
      'E2: mine\'s history lacks the list and the sale');
    const c = await mi.marketCancel(account, sA, listing);
    ok(c.ok === true && c.body.receipt && c.body.receipt.qty === 3 && c.body.receipt.to === 'storage', `E2: the cancel answered ${brief(c)}`);
    ok((await escrow()) === 0 && (await store(A)) === 3, 'E2: the cancel did not return the units to Storage');
    ok((await goldAll()) === g0 && (await itemsAll()) === i0, 'E2 CONSERVATION: gold (purses + cut + fees) or items moved');
  });

  // ══ E3 · IDEMPOTENCY ════════════════════════════════════════════════════
  await leg(async () => {
    const key = uuid();
    const body = { verb: 'market_list', intentId: key, market: { source: 'storage', item: ITEM, qty: 2, ask_each: FLOOR } };
    const first = await call(A, body);
    ok(first.status === 200 && first.body.receipt, `E3-CONTROL: the list refused ${brief(first.body)}`);
    const s0 = await store(A); const p0 = await purse(A);
    const again = await call(A, body);
    ok(again.status === 200 && again.body.replayed === true && again.body.receipt === null && isEnv(again.body),
      `E3: a replayed list answered ${again.status} ${brief(again.body)}`);
    ok((await store(A)) === s0 && (await purse(A)) === p0 && (await escrow()) === 2, 'E3: a replayed list moved goods or gold');
    const other = await call(A, { ...body, market: { ...body.market, qty: 1 } });
    ok(other.body.error === 'intent_mismatch' && !isEnv(other.body), `E3: the same key for a different list answered ${brief(other.body)}`);
    const lid = first.body.receipt.listing_id;
    const bkey = uuid();
    const bb = { verb: 'market_buy', intentId: bkey, market: { listing: lid, qty: 2, max_each: FLOOR, deliver: 'storage' } };
    const b1 = await call(B, bb);
    const pb = await purse(B);
    const b2 = await call(B, bb);
    ok(b1.status === 200 && b2.status === 200 && b2.body.replayed === true && b2.body.receipt === null && (await purse(B)) === pb,
      `E3: a replayed buy that took the whole listing answered ${brief(b2.body)} (or moved gold)`);
  });

  // ══ E4 · THE SAME-NETWORK SALE (threat model #8) ══════════════════════
  await leg(async () => {
    await q(`insert into public.account_play_net (user_id, net, seen_at) values ($1, sha256('\\x0a'::bytea), now()),
             ($2, sha256('\\x0a'::bytea), now()), ($3, sha256('\\x0b'::bytea), now())
             on conflict (user_id) do update set net = excluded.net`, [A, C, B]);
    await q('delete from public.market_item_daily where item_id = $1', [ITEM]);
    await q('delete from public.market_sales where item_id = $1', [ITEM]);
    const l = await call(A, { verb: 'market_list', intentId: uuid(), market: { source: 'bag', item: ITEM, qty: 4, ask_each: FLOOR } });
    ok(l.status === 200, `E4-CONTROL: the list refused ${brief(l.body)}`);
    const lid = l.body.receipt && l.body.receipt.listing_id;
    const wash = await call(C, { verb: 'market_buy', intentId: uuid(), market: { listing: lid, qty: 1, max_each: FLOOR, deliver: 'storage' } });
    ok(wash.status === 200, `E4-CONTROL: the same-network buy refused ${brief(wash.body)}`);
    const flagged = await one('select same_network from public.market_sales where listing_id = $1 and buyer_user_id = $2', [lid, C]);
    ok(flagged && flagged.same_network === true, 'E4: a sale between two accounts on one network is not flagged');
    const page0 = await mi.marketItem(sB, ITEM);
    ok(page0.ok && page0.body.recent.length === 0 && page0.body.history.length === 0 && page0.body.item.last_each === null
       && Number(page0.body.item.volume_7d) === 0, `E4: a flagged sale is in the price history ${brief(page0.body && page0.body.item)}`);
    const fair = await call(B, { verb: 'market_buy', intentId: uuid(), market: { listing: lid, qty: 1, max_each: FLOOR, deliver: 'storage' } });
    ok(fair.status === 200, `E4-CONTROL: the other-network buy refused ${brief(fair.body)}`);
    const unflagged = await one('select same_network from public.market_sales where listing_id = $1 and buyer_user_id = $2', [lid, B]);
    ok(unflagged && unflagged.same_network === false, 'E4: a sale between two networks is flagged');
    await call(C, { verb: 'market_buy', intentId: uuid(), market: { listing: lid, qty: 1, max_each: FLOOR, deliver: 'storage' } });
    const page = await mi.marketItem(sB, ITEM);
    ok(page.ok && page.body.recent.length === 1 && page.body.history.length === 1 && page.body.history[0].trades === 1
       && Number(page.body.item.volume_7d) === 1 && page.body.item.last_each === FLOOR,
      `E4: the history is not exactly the one unflagged sale ${brief(page.body && [page.body.history, page.body.recent, page.body.item])}`);
    const day = await one('select trades, qty::text q from public.market_item_daily where item_id = $1', [ITEM]);
    ok(day && day.trades === 1 && day.q === '1', `E4: market_item_daily holds ${brief(day)}, not the one unflagged sale`);
    ok(!JSON.stringify(page.body).includes('same_network'), 'E4: a read tells a client a sale was flagged');
    await call(A, { verb: 'market_cancel', intentId: uuid(), market: { listing: lid } });
    await q('delete from public.account_play_net where user_id = any($1::uuid[])', [[A, B, C]]);
  });

  // ══ E5 · SETTLE FIRST ON THE BAG PATH ONLY ═════════════════════════════
  await leg(async () => {
    const stale = () => q(`update public.player_state set active_kind = 'gather', active_id = 'normal_tree',
                             accrued_to = now() - interval '10 minutes', active_since = now() - interval '10 minutes'
                            where user_id = $1 and slot = 0`, [A]);
    const acc = async () => (await one('select accrued_to::text t from public.player_state where user_id = $1 and slot = 0', [A])).t;
    await stale();
    const ver = (await one('select version::text v from public.player_state where user_id = $1 and slot = 0', [A])).v;
    await db.exec('set role hr_engine');
    let raw;
    try {
      raw = (await db.query('select public.hr_market_list($1::uuid, 0, $2::bigint, $3::uuid, $4, $5, 1, $6::bigint) r',
        [A, ver, uuid(), 'bag', ITEM, FLOOR])).rows[0].r;
    } finally { await db.exec('reset role'); }
    ok(raw && raw.error === 'settle_first', `E5-CONTROL: the RPC alone did not refuse an unsettled town worker: ${brief(raw)}`);
    await gate();
    const t0 = await acc();
    const s = await call(A, { verb: 'market_list', intentId: uuid(), market: { source: 'storage', item: ITEM, qty: 1, ask_each: FLOOR } });
    ok(s.status === 200 && (await acc()) === t0 && s.body.collected === null,
      `E5: a Storage list touched the hero's window (${t0} -> ${await acc()}) or refused ${brief(s.body)}`);
    const b = await call(A, { verb: 'market_list', intentId: uuid(), market: { source: 'bag', item: ITEM, qty: 1, ask_each: FLOOR } });
    ok(b.status === 200 && b.body.receipt, `E5: a bag list of an unsettled town worker was not settled first: ${b.status} ${brief(b.body)}`);
    ok((await acc()) !== t0, 'E5: the bag list did not settle the open window first');
    await q(`update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = 0`, [A]);
    for (const r of await q('select id::text id from public.market_listings where user_id = $1', [A])) {
      await call(A, { verb: 'market_cancel', intentId: uuid(), market: { listing: r.id } });
    }
  });

  // ══ E6 · THE COUNTERS EACH VERB REALLY SPENDS ═══════════════════════════
  await leg(async () => {
    const spent = async (u) => (await q('select bucket, n from public.hr_rate_counters where user_id = $1 order by bucket', [u]))
      .map((r) => `${r.bucket}:${r.n}`).join(',');
    await call(A, { verb: 'market_list', intentId: uuid(), market: { source: 'storage', item: ITEM, qty: 1, ask_each: FLOOR } });
    ok((await spent(A)) === `market:1,${it.rateBucketFor('market_list')}:1`.split(',').sort().join(','),
      `E6: a Storage list spent [${await spent(A)}], want one '${it.rateBucketFor('market_list')}' at the edge and one 'market' in SQL`);
    await gate();
    await mi.marketMine(sA);
    ok((await spent(A)) === `${it.rateBucketFor('market_mine')}:1`, `E6: a read spent [${await spent(A)}], want one '${it.rateBucketFor('market_mine')}'`);
    for (const r of await q('select id::text id from public.market_listings where user_id = $1', [A])) {
      await call(A, { verb: 'market_cancel', intentId: uuid(), market: { listing: r.id } });
    }
  });

  // ══ E7 · SHAPE COSTS NOTHING; A STALE VIEW GETS A FRESH ENVELOPE ════════
  await leg(async () => {
    const bad = [
      { verb: 'market_list', intentId: uuid(), market: { source: 'hunt', item: ITEM, qty: 1, ask_each: FLOOR } },
      { verb: 'market_list', intentId: uuid(), market: { source: 'bag', item: ITEM, qty: '5', ask_each: FLOOR } },
      { verb: 'market_list', intentId: uuid(), market: { source: 'bag', item: ITEM, qty: 1, ask_each: '1e9' } },
      { verb: 'market_list', market: { source: 'bag', item: ITEM, qty: 1, ask_each: FLOOR } },
      { verb: 'market_buy', intentId: uuid(), market: { listing: 'not-a-uuid', qty: 1, max_each: 1, deliver: 'storage' } },
      { verb: 'market_buy', intentId: uuid(), market: { listing: uuid(), qty: 1, max_each: 1, deliver: 'mail' } },
      { verb: 'market_cancel', intentId: uuid(), market: {} },
      { verb: 'market_item', market: { item: 'Not An Id' } },
      { verb: 'market_browse', market: { limit: 51 } },
    ];
    const want = ['bad_source', 'bad_qty', 'bad_price', 'missing_intent_id', 'bad_request', 'bad_deliver', 'bad_request', 'bad_request', 'bad_request'];
    for (const [i, body] of bad.entries()) {
      counter.n = 0;
      const r = await call(A, body);
      ok(r.status === 400 && r.body.error === want[i] && counter.n === 0,
        `E7: shape case ${i} answered ${r.status} ${r.body.error} after ${counter.n} statement(s) (want 400 ${want[i]}, 0)`);
    }
    /* the buyer's wire has no price: an `ask_each` riding on a buy is never forwarded, so a ceiling under
       the ask still refuses (price_above_max) and nothing moves */
    await q(`insert into public.account_bank as b (user_id, item_id, qty, updated_at) values ($1, $2, 3, now())
             on conflict (user_id, item_id) do update set qty = b.qty + 3`, [A, ITEM]);
    const open = await call(A, { verb: 'market_list', intentId: uuid(), market: { source: 'storage', item: ITEM, qty: 1, ask_each: FLOOR } });
    ok(open.status === 200, `E7-CONTROL: the list refused ${brief(open.body)}`);
    const pb = await purse(B);
    const sneak = await call(B, { verb: 'market_buy', intentId: uuid(),
      market: { listing: open.body.receipt && open.body.receipt.listing_id, qty: 1, max_each: FLOOR - 1, deliver: 'storage', ask_each: FLOOR } });
    ok(sneak.status === 409 && sneak.body.error === 'price_above_max' && (await purse(B)) === pb,
      `E7: a buy carrying an ask above its own ceiling answered ${sneak.status} ${brief(sneak.body)} (the ask reached the RPC)`);
    if (open.body.receipt) await call(A, { verb: 'market_cancel', intentId: uuid(), market: { listing: open.body.receipt.listing_id } });
    const short = await call(A, { verb: 'market_list', intentId: uuid(), market: { source: 'storage', item: ITEM, qty: 999, ask_each: FLOOR } });
    ok(short.status === 409 && short.body.error === 'insufficient_item' && isEnv(short.body)
       && short.body.ok === false, `E7: a short Storage list carried no fresh envelope ${brief(short.body)}`);
  });

  // ══ E8 · EVERY STATE-CARRYING CODE IS ANSWERED AFTER LANE 1's COUNTER ═══
  {
    const bodies = [...lane1.matchAll(/create or replace function public\.(hr_market_(?:list|buy|cancel))\(([\s\S]*?)\nend \$\$;/g)];
    ok(bodies.length === 3, `E8-HARNESS: read ${bodies.length} of lane 1's three write bodies`);
    for (const [, name, text] of bodies) {
      const gateAt = text.indexOf("public.hr_rate_ok(v_uid, 'market'");
      ok(gateAt > 0, `E8-HARNESS: ${name} has no market counter`);
      for (const code of mk.MARKET_STATE_CODES) {
        const at = text.indexOf(`'${code}'`);
        ok(at < 0 || at > gateAt, `E8: ${name} answers ${code} BEFORE its rate counter: carrying an envelope for it buys a free read`);
      }
    }
  }

  // ══ E9 · index.ts DISPATCHES EACH VERB WITH A LITERAL ARGUMENT LIST ══════
  {
    const ts = (await readFile(join(mods.base, 'supabase/functions/hr-accrue/index.ts'), 'utf8')).replace(/\r\n/g, '\n');
    const wantArgs = {
      market_list: 'runMarketList({ exec, user, slot, intentId: intent.intentId, market: intent.market })',
      market_cancel: 'runMarketCancel({ exec, user, slot, intentId: intent.intentId, market: intent.market })',
      market_buy: 'runMarketBuy({ exec, user, slot, intentId: intent.intentId, market: intent.market })',
      market_browse: 'runMarketBrowse({ exec, user, slot, market: intent.market })',
      market_item: 'runMarketItem({ exec, user, slot, market: intent.market })',
      market_mine: 'runMarketMine({ exec, user, slot })',
    };
    for (const [v, call0] of Object.entries(wantArgs)) {
      ok(ts.includes(`if (intent.verb === '${v}') {\n      const out = await ${call0};`), `E9: index.ts does not dispatch ${v} as ${call0}`);
    }
    ok(!/runMarket\w+\(\{[^}]*\.\.\./.test(ts), 'E9: index.ts spreads something into a market verb');
  }

  // ══ E10 · A SECOND APPLY IS BYTE-IDENTICAL ═════════════════════════════
  await leg(async () => {
    const bodies = () => q(`select p.oid::regprocedure::text f, md5(p.prosrc) h, coalesce(p.proacl::text, '') acl from pg_proc p
                             where p.pronamespace = 'public'::regnamespace and p.proname like 'hr\\_market%' order by 1`);
    const before = JSON.stringify([await inventory(db), await bodies()]);
    let sql = (await readFile(join(ROOT, MIG_PATH), 'utf8')).replace(/\r\n/g, '\n');
    for (const [a, b] of sqlPairs) sql = sql.replace(a, () => b);
    let err = null;
    try { await db.exec(`begin;\n${sql}\ncommit;`); } catch (e) { err = e; await db.exec('rollback').catch(() => {}); }
    ok(!err, `E10: a second apply raised: ${err && String(err.message).split('\n')[0]}`);
    ok(JSON.stringify([await inventory(db), await bodies()]) === before, 'E10: a second apply changed the schema, a body or an ACL');
  });
  await db.close?.();
}

// ════════════════════════════════════════════════════════════════════════
async function main() {
  if (has('list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${m.why}`);
    return;
  }
  if (has('selftest') || has('mutate')) {
    await runMutationProof({
      label: 'market-edge',
      cases: Object.entries(MUTATIONS).map(([id, m]) => ({ id, why: m.why })),
      baseline: () => run(null),
      arm: (id) => run(id),
      failures: () => failures,
      reset: () => { failures = 0; problems.length = 0; },
    });
    return;
  }
  await run(null);
  if (failures) {
    console.error('MARKET-EDGE RED:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log('market-edge: green (E0-E10): the wire, the switch, list -> browse -> buy -> mine -> cancel, replay, '
    + 'the same-network flag, settle-first on the bag path, the counters, shape cost, dispatch, re-apply');
}

await main();
