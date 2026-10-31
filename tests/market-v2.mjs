#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/market-v2.mjs — THE ACCOUNT MARKET, END TO END, EVERY SIDE MEASURED.
//
// THE CLAIM UNDER TEST (2027-01-12-market-account.sql, the threat model's lane 1):
//   an ACCOUNT that lists goods (from a hero's bag or from Storage) and an ACCOUNT
//   that buys them end up with exactly the gold and exactly the items the trade
//   says, once; the fee and the cut are burned and journalled; unsold goods come
//   back to Storage, whose room was kept for them; and no client, receipt, read or
//   ledger row can learn who the other account is.
//
// Everything runs for real: PGlite with THE WHOLE MIGRATION CHAIN applied verbatim
// (tests/schema-apply-order.json), so the migration's own §0 pins and §9 self-check
// EXECUTE on every run, and the verbs are driven as `hr_engine` — the role with zero
// table privileges — exactly as the edge (lane 2) will drive them.
//
// ── THE IDENTITIES ──────────────────────────────────────────────────────
//   gold:  Σ purses + Σ cut (market_sales.tax) + Σ fees (market_list ledger rows)   constant
//   items: Σ bags + Σ Storage + Σ escrow (market_listings.qty)                       constant
// Each leg states its expectation as a difference of two snapshot() reads, never as
// a number typed into the test (a typed number is a second copy of the arithmetic).
//
// ── THE THREAT MODEL'S PROOFS, AS REGRESSIONS ───────────────────────────
//   P1 anonymity ........ M2 (no client read; no account id or name in any ledger
//                          row, receipt or read; the counterparty only in market_sales)
//   P2 same-account buy . M9 (any hero of the seller's account: own_listing)
//   P3 listable ......... M5 (kit, premium, the bond, value-0, untradeable; drift vs src/data)
//   #9 eligibility ...... M5b (a fresh account lists and buys nothing; cancel and reads stay open)
//   P4 town work ........ M29 (a craft delta after the listing: insufficient_item)
//   P5 settle-first ..... M28 (bag verbs only; a hunting hero is not stalled)
//   P6 packed supplies .. M30 (a hunt's bag is unreachable from list and Storage)
//   P7 per-account caps . M18 (open + new-a-day across heroes) and M14 (gold a day)
//   #3 lock order ....... M27 (source order on every body; the §9 copy refuses too)
//
// ── WHAT THIS FILE DOES NOT PROVE ───────────────────────────────────────
//   TRUE CONCURRENCY: PGlite is one backend. The locks are taken and contended by
//   nothing; the order is asserted on the source (M27 + the migration's §9) and the
//   race legs (4 parallel lists at 49 open; a party settle and a buy into one bag)
//   are lane 2's, on a multi-connection database. The edge transport is lane 2's.
//
// ── MUTATION ────────────────────────────────────────────────────────────
//   node tests/market-v2.mjs --list | --selftest | --mutate=<id>
// A mutant the migration's own §9 refuses to install counts as CAUGHT (a broken
// market that cannot be installed is the strongest outcome); every other mutant must
// be caught by a leg here. A mutation nothing catches is SLIPPED and exits 1.
// mutant-anchors: supabase/migrations/2027-01-12-market-account.sql supabase/migrations/2027-02-13-market-premium-bond.sql supabase/migrations/2027-02-13-market-eligibility.sql
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, LAST_PATCHED, ROOT, inventory } from './schema-replay.mjs';
import { START_INVENTORY, START_EQUIPMENT } from '../src/data/start-kit.js';
import { PREMIUM_LOGIN_REWARD } from '../src/data/premium.js';
import { ITEMS } from '../src/data/items.js';

const MIG = '2027-01-12-market-account.sql';
const BOND = '2027-02-13-market-premium-bond.sql';
const ELIGIBLE = '2027-02-13-market-eligibility.sql';

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   Each plants a real defect in the migration's text. `pairs` when a rule is stated
   twice (defence in depth): disarming one half alone would prove nothing. */
const MUTATIONS = {
  list_no_escrow: {
    why: 'list from the bag posts the listing without debiting the bag: the goods exist twice',
    pairs: [['      if v_have = p_qty then\n        delete from public.player_inventory where user_id = v_uid and slot = v_slot and item_id = p_item_id;\n'
      + '      else\n        update public.player_inventory set qty = v_have - p_qty\n         where user_id = v_uid and slot = v_slot and item_id = p_item_id;\n      end if;',
      '      null;']],
  },
  cancel_no_return: {
    why: 'cancel deletes the listing and never returns the units to Storage: the stack ceases to exist',
    pairs: [['    insert into public.account_bank as b (user_id, item_id, qty, updated_at)\n      values (v_uid, v_row.item_id, v_row.qty, now())\n'
      + '      on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();',
      '    null;']],
  },
  buy_no_debit: {
    why: 'buy pays the seller and delivers without debiting the buyer: gold is minted',
    pairs: [['    v_bpurse := public.hr_purse_move(v_uid, -v_gross, 0);', '    v_bpurse := public.hr_purse_move(v_uid, 0, 0);']],
  },
  buy_leaks_gold: {
    why: 'the seller is credited one gold less than net with no row for it: a leak, not a sink',
    pairs: [['    v_spurse := public.hr_purse_move(v_row.user_id, v_net, 0);',
      '    v_spurse := public.hr_purse_move(v_row.user_id, greatest(0, v_net - 1), 0);']],
  },
  price_from_routing_read: {
    why: 'the charge is computed from the UNLOCKED routing read, not the locked row',
    pairs: [['    v_gross_n := p_qty::numeric * v_row.ask_each::numeric;', '    v_gross_n := p_qty::numeric * v_route_ask::numeric;']],
  },
  same_account_by_hero: {
    why: 'threat model #5: the self-trade guard compares heroes, so another hero of the same account buys (a wash)',
    pairs: [
      ['  if v_route_user = v_uid then\n', '  if v_route_user = v_uid and false then\n'],
      ['  if v_row.user_id <> v_route_user or v_row.user_id = v_uid then', '  if v_row.user_id <> v_route_user then'],
    ],
  },
  listable_takes_the_bond: {
    file: BOND,
    why: 'the market review\'s change 1: the listable rule forgets the premium bond, so an IAP item trades for gold with no cap',
    pairs: [['          and not exists (select 1 from public.hr_market_premium_items b where b.item_id = i.item_id)) as listable,',
      '          ) as listable,']],
  },
  fresh_account_lists: {
    file: ELIGIBLE,
    why: 'threat model #9: the listing gate is not attached, so a scripted alt lists junk for its main to buy',
    pairs: [['create trigger trg_market_listing_gate\n  before insert on public.market_listings\n  for each row execute function public.hr_market_listing_gate();',
      '-- MUTATED: no listing gate']],
  },
  fresh_account_buys: {
    file: ELIGIBLE,
    why: 'threat model #9: the sale gate is not attached, so a scripted alt pays its 500 gold to a main for junk at the ceiling',
    pairs: [['create trigger trg_market_sale_gate\n  before insert on public.market_sales\n  for each row execute function public.hr_market_sale_gate();',
      '-- MUTATED: no sale gate']],
  },
  listable_takes_kit: {
    why: 'threat model #4: the listable rule forgets the start kit, so a new hero\'s kit becomes market gold',
    pairs: [['          and not exists (select 1 from public.hr_start_inventory k where k.item_id = i.item_id)\n'
      + '          and not exists (select 1 from public.hr_start_equipment e where e.item_id = i.item_id)\n', '']],
  },
  switch_ignored_on_list: {
    why: 'threat model #13: the switch is not read by list, so an edge route opens the market',
    pairs: [["  if not v_cfg.enabled then return jsonb_build_object('ok', false, 'error', 'market_closed'); end if;\n"
      + "  if not public.hr_admitted(v_uid) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;\n  if p_source = 'bag' then",
      "  if not public.hr_admitted(v_uid) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;\n  if p_source = 'bag' then"]],
  },
  switch_ignored_on_buy: {
    why: 'threat model #13: the switch is not read by buy',
    pairs: [["  if not v_cfg.enabled then return jsonb_build_object('ok', false, 'error', 'market_closed'); end if;\n"
      + "  if not public.hr_admitted(v_uid) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;\n  if p_deliver = 'bag' then",
      "  if not public.hr_admitted(v_uid) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;\n  if p_deliver = 'bag' then"]],
  },
  max_each_ignored: {
    why: 'threat model #14: buy ignores max_each, so a buyer pays above the price they confirmed',
    pairs: [
      ['  if v_route_ask > p_max_each then', '  if false then'],
      ['    if v_row.ask_each > p_max_each then', '    if false then'],
    ],
  },
  room_ignores_listed: {
    why: 'Storage room stops counting listed kinds: deposits fill the room a listing\'s return needs',
    pairs: [
      ['    union\n    select l.item_id from public.market_listings l where l.user_id = p_user) k', '    ) k'],
      ['      or exists (select 1 from public.market_listings l where l.user_id = p_user and l.item_id = p_item)\n', ''],
    ],
  },
  open_cap_per_hero: {
    why: 'threat model #2: the open-listing cap is counted per hero, so four heroes hold 4x the account cap',
    pairs: [['      select 1 from public.market_listings where user_id = v_uid limit v_cfg.max_listings) s;',
      '      select 1 from public.market_listings where user_id = v_uid and slot = v_slot limit v_cfg.max_listings) s;']],
  },
  day_cap_per_hero: {
    why: 'threat model #2: the new-listings-a-day cap is counted per hero',
    pairs: [["     where user_id = v_uid and gold <> 0 and at >= public.hr_utc_day_start(now())\n       and kind = 'trade' and intent like 'market\\_list:%';",
      "     where user_id = v_uid and slot = v_slot and gold <> 0 and at >= public.hr_utc_day_start(now())\n       and kind = 'trade' and intent like 'market\\_list:%';"]],
  },
  spend_cap_per_hero: {
    why: 'threat model #2: the gold-spent-a-day cap is counted per hero',
    pairs: [["     where user_id = v_uid and gold <> 0 and at >= v_day0 and kind = 'trade' and intent like 'market\\_buy:%';",
      "     where user_id = v_uid and slot = v_slot and gold <> 0 and at >= v_day0 and kind = 'trade' and intent like 'market\\_buy:%';"]],
  },
  proceeds_cap_off: {
    why: 'the seller-side daily proceeds cap is gone',
    pairs: [['    if v_recv + v_net > v_cfg.max_proceeds_per_day then', '    if false then']],
  },
  cut_trunc: {
    why: 'the cut rounds down, so a split into 1-gold sales pays no cut',
    pairs: [['    v_cut   := ceil(v_gross_n * v_cfg.house_tax_bp::numeric / 10000)::bigint;',
      '    v_cut   := trunc(v_gross_n * v_cfg.house_tax_bp::numeric / 10000)::bigint;']],
  },
  settle_first_on_storage: {
    why: 'threat model P5: settle-first runs on a Storage verb, so an unsettled town worker cannot list from Storage',
    pairs: [["  if p_source = 'bag' then\n    declare v_settle jsonb", "  if true then\n    declare v_settle jsonb"]],
  },
  settle_first_off_bag: {
    why: 'settle-before-mutate is skipped on the bag delivery, so a buy lands in an unsettled bag',
    pairs: [["  if p_deliver = 'bag' then\n    declare v_settle jsonb", "  if false then\n    declare v_settle jsonb"]],
  },
  version_check_off: {
    why: 'a stale caller lands a bag listing computed against a bag that has since moved',
    pairs: [["    if p_source = 'bag' and (p_version is null or p_version <> v_ver) then", '    if false then']],
  },
  replay_reapplies: {
    why: 'both replay lookups and the claim of hr_market_buy stop short-circuiting: a retried purchase buys twice',
    pairs: [
      ["p_deliver;\n  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot\n    from public.player_intents where user_id = v_uid and intent_id = p_intent_id;\n  if found then",
        "p_deliver;\n  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot\n    from public.player_intents where user_id = v_uid and intent_id = p_intent_id;\n  if false then"],
      ['  -- (2) THE CLAIM, under the locks.\n  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot\n    from public.player_intents where user_id = v_uid and intent_id = p_intent_id;\n  if found then',
        '  -- (2) THE CLAIM, under the locks.\n  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot\n    from public.player_intents where user_id = v_uid and intent_id = p_intent_id;\n  if false then'],
      ["  on conflict (user_id, intent_id) do nothing;\n  if not found then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;\n  v_claimed := true;\n\n  begin\n    -- (3) THE VERSION",
        '  on conflict (user_id, intent_id) do nothing;\n  v_claimed := true;\n\n  begin\n    -- (3) THE VERSION'],
    ],
  },
  counterparty_in_ledger: {
    why: 'threat model #1: the buyer\'s client-readable ledger row names the seller\'s account again',
    pairs: [["       jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each, 'qty', p_qty, 'deliver', p_deliver, 'transfer', true));",
      "       jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each, 'qty', p_qty, 'deliver', p_deliver, 'transfer', true, 'seller', v_row.user_id));"]],
  },
  client_reads_listings: {
    why: 'threat model #1: a client role can read market_listings again',
    pairs: [['revoke all on public.market_listings   from public, anon, authenticated, service_role, hr_engine;',
      'revoke all on public.market_listings   from public, anon, authenticated, service_role, hr_engine;\ngrant select on public.market_listings to authenticated;']],
  },
  read_names_owner: {
    why: 'threat model #1: the item page hands out each listing\'s account id',
    pairs: [["jsonb_agg(jsonb_build_object('id', c.id, 'qty', c.qty, 'mine', c.user_id = v_uid) order by c.posted_at)",
      "jsonb_agg(jsonb_build_object('id', c.id, 'qty', c.qty, 'mine', c.user_id = v_uid, 'owner', c.user_id) order by c.posted_at)"]],
  },
  purse_before_listing: {
    why: 'threat model #3: the purses lock before the listing row (purses are no longer last)',
    pairs: [
      ['    perform public.hr_purse_lock(least(v_uid, v_row.user_id));\n    perform public.hr_purse_lock(greatest(v_uid, v_row.user_id));\n', ''],
      ['  select * into v_row from public.market_listings where id = p_listing_id for update;',
        '  perform public.hr_purse_lock(least(v_uid, v_route_user));\n  perform public.hr_purse_lock(greatest(v_uid, v_route_user));\n'
        + '  select * into v_row from public.market_listings where id = p_listing_id for update;'],
    ],
  },
  seller_hero_locked: {
    why: 'threat model #3: the buy takes the seller\'s hero lock again (a buy can wait on a seller\'s hunt settle)',
    pairs: [['  select * into v_row from public.market_listings where id = p_listing_id for update;\n  if v_row.id is null then',
      '  select * into v_row from public.market_listings where id = p_listing_id for update;\n  perform public.hr_hunt_lock(v_row.user_id, v_row.slot);\n  if v_row.id is null then']],
  },
  expire_no_arbiter: {
    why: 'the sweep reads then deletes instead of letting the DELETE arbitrate: an expiry racing a cancel returns twice',
    pairs: [['      delete from public.market_listings where id = v_c.id returning * into v_row;\n      if not found then continue; end if;',
      '      select * into v_row from public.market_listings where id = v_c.id;\n      delete from public.market_listings where id = v_c.id;']],
  },
  immutable_trigger_off: {
    why: 'the listing immutability trigger is not attached: ask, owner and fee become mutable',
    pairs: [['create trigger trg_market_listing_immutable\n  before update on public.market_listings\n  for each row execute function public.hr_market_listing_immutable();',
      '-- MUTATED: no immutability trigger']],
  },
};

// ── args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h === undefined ? d : h.slice(n.length + 3); };
const has = (n) => argv.includes(`--${n}`);

const A = '00000000-0000-4000-ba55-0000000000a1';   // the selling account: heroes 0, 1
const B = '00000000-0000-4000-ba55-0000000000b1';   // a buying account: heroes 0, 1
const C = '00000000-0000-4000-ba55-0000000000c1';   // a third account: hero 0
const ACCOUNTS = [A, B, C];
const HEROES = [[A, 0], [A, 1], [B, 0], [B, 1], [C, 0]];
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

class Red extends Error {}
const fails = [];
function ok(cond, msg) { if (!cond) { fails.push(msg); throw new Red(msg); } }
const uuid = () => crypto.randomUUID();
/* A refusal or a receipt, never a whole envelope, in a failure message. */
const brief = (r) => {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return JSON.stringify(r);
  const o = {};
  for (const k of ['ok', 'error', 'detail', 'replayed', 'listed', 'bought', 'cancelled', 'items', 'asks', 'listings', 'today']) if (k in r) o[k] = r[k];
  return JSON.stringify(Object.keys(o).length ? o : r).slice(0, 600);
};

/* --no-selfcheck (diagnostic): the migration's §9 is turned into a function nobody calls, so a
   mutant must be caught by a LEG of this file, not by the migration refusing to install. */
const SELF_CHECK_OFF = ['-- ── §9 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back by a sentinel ──\ndo $$\n',
  '-- ── §9 SELF-CHECK — DISARMED by tests/market-v2.mjs --no-selfcheck ──\ncreate or replace function pg_temp.hr_market_selfcheck_off() returns void language plpgsql as $$\n'];
async function boot(mutate) {
  let patches;
  if (mutate || has('no-selfcheck')) {
    const m = mutate ? MUTATIONS[mutate] : { pairs: [] };
    if (!m) { const e = new Error(`unknown mutation "${mutate}"`); e.harness = true; throw e; }
    patches = new Map(m.file ? [[m.file, m.pairs]] : [[MIG, has('no-selfcheck') ? [...m.pairs, SELF_CHECK_OFF] : m.pairs]]);
  }
  try {
    return (await bootReplay(patches ? { patches, upTo: LAST_PATCHED } : {})).db;
  } catch (e) {
    if (e.harness) throw e;
    /* The migration's own §9 refused the planted defect: the market cannot be installed broken. */
    throw new Red(`migration chain refused: ${String(e.message).split('\n').slice(0, 2).join(' ')}`);
  }
}

// ════════════════════════════════════════════════════════════════════════
async function run(mutate) {
  fails.length = 0;
  const db = await boot(mutate);
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const engine = async (sql, p) => {
    await db.exec('set role hr_engine');
    try { const r = (await db.query(sql, p)).rows[0]; return r ? r.r : null; } finally { await db.exec('reset role'); }
  };
  const client = async (uid, sql, p) => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    await db.exec('set role authenticated');
    try { const r = (await db.query(sql, p)).rows[0]; return r ? r.r : null; }
    finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
  };
  const gate = () => q('delete from public.hr_rate_counters');
  const ver = async (u, s) => (await one('select version::text v from public.player_state where user_id = $1 and slot = $2', [u, s])).v;
  const cfg = async (set) => q(`update public.hr_market_config set ${set} where only_row`);

  const list = async (o) => engine('select public.hr_market_list($1::uuid,$2::int,$3::bigint,$4::uuid,$5::text,$6::text,$7::bigint,$8::bigint) r',
    [o.user, o.slot ?? 0, o.version === undefined ? await ver(o.user, o.slot ?? 0) : o.version, o.key || uuid(),
      o.source || 'bag', o.item, String(o.qty), String(o.ask)]);
  const cancel = async (o) => engine('select public.hr_market_cancel($1::uuid,$2::int,$3::uuid,$4::uuid) r',
    [o.user, o.slot ?? 0, o.key || uuid(), o.listing]);
  const buy = async (o) => engine('select public.hr_market_buy($1::uuid,$2::int,$3::bigint,$4::uuid,$5::uuid,$6::bigint,$7::bigint,$8::text) r',
    [o.user, o.slot ?? 0, o.version === undefined ? await ver(o.user, o.slot ?? 0) : o.version, o.key || uuid(),
      o.listing, String(o.qty), String(o.max ?? 1000000000), o.deliver || 'storage']);
  const browse = (u, items, after, lim) => engine('select public.hr_market_browse($1::uuid,0,$2::text[],$3::text,$4::int) r', [u, items ?? null, after ?? null, lim ?? null]);
  const itemPage = (u, item) => engine('select public.hr_market_item($1::uuid,0,$2::text) r', [u, item]);
  const mine = (u) => engine('select public.hr_market_mine($1::uuid,0) r', [u]);
  const expire = (only) => one('select public.hr_market_expire(200, $1::uuid) n', [only ?? null]).then((r) => Number(r.n));

  // ── the fixture: three accounts, five heroes, the market switched on ──
  await q(`insert into auth.users (id) values ('${A}'), ('${B}'), ('${C}') on conflict (id) do nothing`);
  for (const [u, s] of HEROES) {
    await q("select set_config('request.jwt.claim.sub', $1, false)", [u]);
    if (s > 0) {
      await q(`insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
               values ($1, 0, 'flag', $2, 1, '', null, now()) on conflict (user_id, slot, kind, key, period_key) do nothing`, [u, `character_slot:${s}`]);
    }
    const r = (await one('select public.hr_create_character($1) r', [s])).r;
    if (!r || r.ok !== true) { const e = new Error(`fixture: hr_create_character(${s}) for ${u} refused ${brief(r)}`); e.harness = true; throw e; }
  }
  await q("select set_config('request.jwt.claim.sub', '', false)");
  const enabledDefault = (await one('select enabled from public.hr_market_config')).enabled;
  /* The fixture's heroes are fresh, and the Level rule is M5b's: everything else trades at Level 1. */
  await cfg('enabled = true, min_level = 1');

  /* THE GOODS, chosen by property from the server's own generated catalogue, never by name. */
  const goods = await q(`select item_id, floor_each::text f, ceiling_each::text c from public.hr_market_items
                          where listable and floor_each > 1 and ceiling_each < 1000000000
                            and item_id not in (select item_id from public.hr_item_slots) order by item_id limit 3`);
  if (goods.length < 3) { const e = new Error('fixture: fewer than three listable stackable goods'); e.harness = true; throw e; }
  const [ITEM, ITEM2, ITEM3] = goods.map((g) => g.item_id);
  const FLOOR = BigInt(goods[0].f); const CEIL = BigInt(goods[0].c);
  const ASK = FLOOR;
  const rules = await one('select list_fee_bp::text f, list_fee_min::text m, house_tax_bp::text t from public.hr_market_config');
  const FEE_BP = BigInt(rules.f), FEE_MIN = BigInt(rules.m), CUT_BP = BigInt(rules.t);
  const feeOf = (qty, ask) => { const g = BigInt(qty) * BigInt(ask); const f = (g * FEE_BP + 9999n) / 10000n; return f > FEE_MIN ? f : FEE_MIN; };
  const cutOf = (gross) => (BigInt(gross) * CUT_BP + 9999n) / 10000n;

  const stock = async () => {
    await gate();
    await q('delete from public.market_listings where user_id = any($1::uuid[])', [ACCOUNTS]);
    for (const u of ACCOUNTS) {
      await q(`insert into public.account_wallet as w (user_id, gold) values ($1, 1000000)
               on conflict (user_id) do update set gold = 1000000, version = w.version + 1`, [u]);
      await q('delete from public.account_bank where user_id = $1 and item_id = any($2::text[])', [u, [ITEM, ITEM2, ITEM3]]);
    }
    for (const [u, s] of HEROES) {
      await q('delete from public.player_inventory where user_id = $1 and slot = $2 and item_id = any($3::text[])', [u, s, [ITEM, ITEM2, ITEM3]]);
    }
    await q(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $3, 100), ($1, 1, $3, 50), ($2, 0, $3, 20)`, [A, B, ITEM]);
  };

  /* THE MEASUREMENT: every purse, bag, Storage stack and the escrow, plus both sinks. */
  const snap = async (item = ITEM) => {
    const s = { purse: {}, bag: {}, store: {}, version: {} };
    for (const u of ACCOUNTS) {
      s.purse[u] = BigInt((await one('select coalesce((select gold from public.account_wallet where user_id = $1), 0)::text g', [u])).g);
      s.store[u] = BigInt((await one('select coalesce((select qty from public.account_bank where user_id = $1 and item_id = $2), 0)::text q', [u, item])).q);
    }
    for (const [u, s2] of HEROES) {
      s.bag[`${u}:${s2}`] = BigInt((await one('select coalesce((select qty from public.player_inventory where user_id = $1 and slot = $2 and item_id = $3), 0)::text q', [u, s2, item])).q);
      s.version[`${u}:${s2}`] = BigInt(await ver(u, s2));
    }
    s.escrow = BigInt((await one('select coalesce(sum(qty), 0)::text q from public.market_listings where item_id = $1', [item])).q);
    s.cut = BigInt((await one('select coalesce(sum(tax), 0)::text t from public.market_sales')).t);
    s.fees = BigInt((await one(`select coalesce(sum(-gold), 0)::text f from public.player_ledger where kind = 'trade' and intent like 'market\\_list:%'`)).f);
    s.sales = Number((await one('select count(*)::int n from public.market_sales')).n);
    return s;
  };
  const goldTotal = (s) => Object.values(s.purse).reduce((a, b) => a + b, 0n) + s.cut + s.fees;
  const itemTotal = (s) => Object.values(s.bag).reduce((a, b) => a + b, 0n) + Object.values(s.store).reduce((a, b) => a + b, 0n) + s.escrow;
  const conserved = (a, b, leg) => {
    ok(goldTotal(a) === goldTotal(b), `${leg} CONSERVATION: Σpurses+Σcut+Σfees moved ${goldTotal(a)} -> ${goldTotal(b)}`);
    ok(itemTotal(a) === itemTotal(b), `${leg} CONSERVATION: Σbags+ΣStorage+Σescrow moved ${itemTotal(a)} -> ${itemTotal(b)}`);
  };
  const leg = async (fn) => { try { await gate(); await fn(); } catch (e) { if (!(e instanceof Red)) throw e; } };

  // ══ M0 · A SECOND APPLY IS BYTE-IDENTICAL (schema, bodies, config row) ════
  await leg(async () => {
    /* AT THIS FILE'S OWN CHAIN POSITION (lane/c-settle-cost-2, 2026-10-30). "Is this file idempotent" is asked where
       the file is the chain end: re-applied over the WHOLE chain it restores its detector (link 21 of
       HR_GRANT_HYGIENE_CHAIN) over a later link's, and its own self-check then reads every later engine grant as
       outside the allowlist (link 22, 2027-02-10-settle-reads.sql's hr_accrue_read: the raise this leg first hit).
       A mutated replay already stops at this file (LAST_PATCHED); the plain one boots a second database up to it, so
       every later leg still runs on the true chain end. tests/buff-queue.mjs [14b]/[14c] made the same move. */
    const own = (mutate || has('no-selfcheck')) ? db : (await bootReplay({ upTo: MIG })).db;
    const q = async (sql, p) => (await own.query(sql, p)).rows;
    /* A body a LATER file restates (2027-01-21-market-same-network.sql: the two reads that look at
       market_sales) is that file's to keep byte-identical (tests/market-edge.mjs E10); re-applying this
       older file over it restores this file's image by design. Derived from the apply order, never typed. */
    const order = JSON.parse(await readFile(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
    const later = new Set();
    for (const f of order.slice(order.indexOf(MIG) + 1)) {
      const t = await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8');
      for (const m2 of t.matchAll(/create or replace function public\.(hr_market_\w+|hr_storage_room_\w+|hr_bank_move|hr_depot_view|hr_name_restamp|hr_assert_grant_hygiene)\(/g)) later.add(m2[1]);
    }
    const bodies = async () => (await q(`select p.proname n, p.oid::regprocedure::text f, md5(p.prosrc) h, coalesce(p.proacl::text, '') acl from pg_proc p
                             where p.pronamespace = 'public'::regnamespace
                               and (p.proname like 'hr\\_market%' or p.proname like 'hr\\_storage\\_room%'
                                 or p.proname in ('hr_bank_move', 'hr_depot_view', 'hr_name_restamp', 'hr_assert_grant_hygiene'))
                             order by 2`)).filter((r) => !later.has(r.n));
    const before = JSON.stringify([await inventory(own), await bodies(), await q('select * from public.hr_market_config')]);
    /* The SAME text the chain applied — a mutant's too — or this leg would restore the clean bodies
       under every later leg and grade a mutant by "the body changed" instead of by behaviour. */
    let sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
    for (const [find, repl] of [...(mutate ? MUTATIONS[mutate].pairs : []), ...(has('no-selfcheck') ? [SELF_CHECK_OFF] : [])]) {
      sql = sql.replace(find, () => repl);
    }
    let err = null;
    try { await own.exec(`begin;\n${sql}\ncommit;`); } catch (e) { err = e; await own.exec('rollback').catch(() => {}); }
    ok(!err, `M0: a second apply raised: ${err && String(err.message).split('\n')[0]}`);
    ok(JSON.stringify([await inventory(own), await bodies(), await q('select * from public.hr_market_config')]) === before,
      'M0: a second apply changed the schema, a body, an ACL or the config row (an operator\'s tuning must survive a re-apply)');
    ok(enabledDefault === false, 'M0: the market switch is not OFF after the chain (it must ship OFF)');
  });

  // ══ M1 · LIST FROM THE BAG, BUY INTO STORAGE, EVERY SIDE MEASURED ════════
  await leg(async () => {
    await stock();
    const s0 = await snap();
    const l = await list({ user: A, item: ITEM, qty: 5, ask: ASK });
    ok(l && l.ok === true, `M1: list refused ${brief(l)}`);
    const s1 = await snap();
    const fee = feeOf(5, ASK);
    ok(s1.bag[`${A}:0`] === s0.bag[`${A}:0`] - 5n && s1.escrow === s0.escrow + 5n, 'M1: the escrow is not a debit of the bag');
    ok(s1.purse[A] === s0.purse[A] - fee && BigInt(l.listed.fee) === fee, `M1: the fee is not ${fee}, burned from the account purse`);
    ok(s1.version[`${A}:0`] === s0.version[`${A}:0`] + 1n, 'M1: the listing hero\'s version did not move');
    ok(l.state && l.inventory && BigInt(l.state.gold) === s1.purse[A], 'M1: the list answers no current envelope');
    conserved(s0, s1, 'M1 list');
    const b = await buy({ user: B, listing: l.listed.listing_id, qty: 5, max: ASK });
    ok(b && b.ok === true, `M1: buy refused ${brief(b)}`);
    const s2 = await snap();
    const gross = 5n * ASK; const cut = cutOf(gross);
    ok(s2.purse[B] === s1.purse[B] - gross, `M1 BUYER: purse moved ${s2.purse[B] - s1.purse[B]}, not -${gross}`);
    ok(s2.store[B] === s1.store[B] + 5n, 'M1 BUYER: the goods are not in the buying account\'s Storage');
    ok(s2.purse[A] === s1.purse[A] + gross - cut, `M1 SELLER: purse moved ${s2.purse[A] - s1.purse[A]}, not +${gross - cut}`);
    ok(s2.escrow === s1.escrow - 5n && s2.cut === s1.cut + cut && s2.sales === s1.sales + 1, 'M1: escrow / cut / receipt row wrong');
    ok(BigInt(b.bought.gold_gross) === gross && BigInt(b.bought.cut) === cut && BigInt(b.bought.each) === ASK && b.bought.item_id === ITEM,
      `M1: the receipt does not describe the charge ${brief(b.bought)}`);
    conserved(s1, s2, 'M1 buy');
  });

  // ══ M2 · ANONYMITY (P1): no client read; no account id or name anywhere a client sees ══
  await leg(async () => {
    for (const rel of ['market_listings', 'market_sales', 'market_item_daily', 'hr_market_config', 'hr_market_items']) {
      for (const role of ['anon', 'authenticated']) {
        const r = await one(`select has_table_privilege($1, $2, 'select') x`, [role, `public.${rel}`]);
        ok(r.x === false, `M2: ${role} can SELECT ${rel}`);
      }
      const p = await one('select count(*)::int n from pg_policies where schemaname = $1 and tablename = $2', ['public', rel]);
      ok(p.n === 0, `M2: ${rel} carries a policy`);
    }
    const gone = await one("select to_regclass('public.market_buy_offers') a, to_regclass('public.market_price_history') b");
    ok(gone.a === null && gone.b === null, 'M2: the buy-offer table or the public price view still exists');
    const nameCols = await one(`select count(*)::int n from information_schema.columns where table_schema = 'public'
                                 and table_name in ('market_listings','market_item_daily') and column_name ~ 'name'`);
    ok(nameCols.n === 0, 'M2: a market relation still carries a name column');
    await stock();
    const l = await list({ user: A, item: ITEM, qty: 3, ask: ASK });
    const b = await buy({ user: B, listing: l.listed.listing_id, qty: 1, max: ASK, deliver: 'bag' });
    const c = await cancel({ user: A, slot: 1, listing: l.listed.listing_id });
    ok(l.ok && b.ok && c.ok, `M2: setup refused ${brief([l.error, b.error, c.error])}`);
    const lid = l.listed.listing_id;
    const leaks = (o) => (JSON.stringify(o).match(UUID_RE) || []).filter((x) => x !== lid);
    for (const [name, o] of [['listed', l.listed], ['bought', b.bought], ['cancelled', c.cancelled]]) {
      ok(leaks(o).length === 0, `M2: the ${name} receipt carries a uuid that is not its listing: ${leaks(o)}`);
      ok(!/name/i.test(JSON.stringify(o)), `M2: the ${name} receipt carries a name`);
    }
    const rows = await q(`select user_id::text u, meta::text m from public.player_ledger where user_id = any($1::uuid[]) and intent like 'market\\_%'`, [ACCOUNTS]);
    ok(rows.length >= 3, 'M2 CONTROL: the market wrote no ledger rows to read');
    for (const r of rows) {
      const ids = (r.m.match(UUID_RE) || []).filter((x) => !ACCOUNTS.includes(x.toLowerCase()) ? false : true);
      ok(ids.length === 0 && !/counterparty|seller|buyer/.test(r.m), `M2: a client-readable ledger row names an account: ${r.m}`);
    }
    /* the reads, with listings OPEN (an empty page leaks nothing and proves nothing) */
    const open = await list({ user: A, slot: 1, item: ITEM, qty: 2, ask: ASK });
    await buy({ user: C, listing: open.listed.listing_id, qty: 1, max: ASK });
    for (const [name, o] of [['browse', await browse(B, [ITEM])], ['browse page', await browse(B)], ['item', await itemPage(B, ITEM)],
      ['item (owner)', await itemPage(A, ITEM)], ['mine', await mine(A)]]) {
      ok(o && o.ok === true, `M2: read ${name} refused ${brief(o)}`);
      ok(JSON.stringify(o).includes(open.listed.listing_id) || name.startsWith('browse'), `M2 CONTROL: read ${name} does not show the open listing`);
      const s = JSON.stringify(o);
      ok(!ACCOUNTS.some((u) => s.includes(u)), `M2: read ${name} carries an account id`);
      ok(!/display_name|seller_name|"name"/.test(s), `M2: read ${name} carries a name`);
    }
    const sale = await one('select count(*)::int n from public.market_sales where listing_id = $1 and seller_user_id = $2 and buyer_user_id = $3', [lid, A, B]);
    ok(sale.n === 1, 'M2: the counterparty is not recorded in market_sales (Security must be able to follow the value)');
  });

  // ══ M3 · THE EXECUTE SURFACE: client roles reach nothing; the engine reaches the six ══
  await leg(async () => {
    const sigs = ['hr_market_list(uuid,integer,bigint,uuid,text,text,bigint,bigint)', 'hr_market_cancel(uuid,integer,uuid,uuid)',
      'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint,bigint,text)', 'hr_market_browse(uuid,integer,text[],text,integer)',
      'hr_market_item(uuid,integer,text)', 'hr_market_mine(uuid,integer)'];
    for (const sig of [...sigs, 'hr_market_expire(integer,uuid)']) {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const r = await one('select has_function_privilege($1, $2, \'execute\') x', [role, `public.${sig}`]);
        ok(r.x === false, `M3: ${role} can execute ${sig}`);
      }
    }
    for (const sig of sigs) ok((await one('select has_function_privilege(\'hr_engine\', $1, \'execute\') x', [`public.${sig}`])).x === true, `M3: the engine cannot execute ${sig}`);
    ok((await one("select has_function_privilege('hr_engine', 'public.hr_market_expire(integer,uuid)', 'execute') x")).x === false,
      'M3: the engine can execute the sweep (a cron job, not an engine capability)');
    const old = await one(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace
                            and oid::regprocedure::text in ('hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
                              'hr_market_cancel(uuid,integer,bigint,uuid,uuid)', 'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)', 'hr_market_expire(integer)')`);
    ok(old.n === 0, 'M3: a per-hero v2 overload survived');
  });

  // ══ M4 · A CALLER THAT IS NOT THE ENGINE CANNOT ACT FOR ANYONE ELSE ══════
  await leg(async () => {
    await q("select set_config('request.jwt.claim.sub', $1, false)", [B]);
    const r = (await one("select public.hr_market_list($1::uuid,0,0::bigint,$2::uuid,'bag',$3::text,1::bigint,$4::bigint) r", [A, uuid(), ITEM, String(ASK)])).r;
    await q("select set_config('request.jwt.claim.sub', '', false)");
    ok(r && r.error === 'forbidden_impersonation', `M4: a non-engine caller listed for another user: ${brief(r)}`);
  });

  // ══ M5 · THE ONE LISTABLE RULE (P3): kit, premium, value-0, untradeable; drift vs src/data ══
  await leg(async () => {
    await stock();
    const kit = [...Object.keys(START_INVENTORY), ...Object.values(START_EQUIPMENT)];
    const bond = Object.keys(ITEMS).filter((id) => ITEMS[id].premium === true);
    const banned = [...kit, ...bond, ...(PREMIUM_LOGIN_REWARD.item ? [PREMIUM_LOGIN_REWARD.item] : [])];
    const zero = (await one('select item_id from public.hr_items where tradeable and value <= 0 order by item_id limit 1')).item_id;
    const untrade = (await one('select item_id from public.hr_items where not tradeable order by item_id limit 1')).item_id;
    for (const id of [...banned, zero, untrade]) {
      await q(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 5)
               on conflict (user_id, slot, item_id) do update set qty = 5`, [A, id]);
      const r = await list({ user: A, item: id, qty: 1, ask: 1000 });
      ok(r && r.ok === false && r.error === 'not_tradeable', `M5: ${id} was not refused not_tradeable: ${brief(r)}`);
    }
    /* DRIFT: the server's rule against src/data's start kit and premium reward — every one of them
       unlistable, and every listable item is tradeable, valued and bid on by the shop. */
    const view = await q('select item_id, listable, why from public.hr_market_items');
    const byId = new Map(view.map((r) => [r.item_id, r]));
    for (const id of banned) ok(byId.has(id) && byId.get(id).listable === false, `M5 DRIFT: src/data names ${id} in the kit/premium and the server lists it`);
    /* THE BOND'S OWN LIST IS THE DATA'S: a new premium:true row with no row here goes red, and so does a stale row. */
    ok(bond.length > 0, 'M5: no premium item in src/data: the bond leg is vacuous');
    const listed = (await q('select item_id from public.hr_market_premium_items order by item_id')).map((r) => r.item_id);
    ok(JSON.stringify(listed) === JSON.stringify(bond.slice().sort()), `M5 DRIFT: hr_market_premium_items ${JSON.stringify(listed)} is not src/data's premium:true rows ${JSON.stringify(bond)}`);
    for (const id of bond) ok(byId.get(id).why === 'premium', `M5: ${id} is unlistable for the wrong reason: ${byId.get(id).why}`);
    const bad = await one(`select count(*)::int n from public.hr_market_items m join public.hr_items i using (item_id)
                            left join public.hr_hunt_vendor_value v using (item_id)
                           where m.listable and (not i.tradeable or i.value <= 0 or v.item_id is null)`);
    ok(bad.n === 0, `M5: ${bad.n} listable item(s) are untradeable, worthless or have no shop bid`);
    ok(view.filter((r) => r.listable).length > 0 && view.filter((r) => !r.listable).length > 0, 'M5: the rule is vacuous or total');
  });

  // ══ M5b · THE LEVEL RULE (threat model #9): list AND buy; a fresh account's own goods are never held ══
  await leg(async () => {
    await stock();
    const open = await list({ user: A, item: ITEM, qty: 2, ask: ASK });
    ok(open && open.ok === true, `M5b-CONTROL: the fixture listing refused ${brief(open)}`);
    const id = open.listed.listing_id;
    await cfg('min_level = 10');
    try {
      const s0 = await snap();
      const l = await list({ user: C, item: ITEM, qty: 1, ask: ASK });
      ok(l && l.error === 'market_locked' && l.min_level === 10, `M5b: a fresh account listed: ${brief(l)}`);
      const b = await buy({ user: C, listing: id, qty: 1, max: ASK });
      ok(b && b.error === 'market_locked' && b.min_level === 10, `M5b: a fresh account bought: ${brief(b)}`);
      ok(JSON.stringify(await snap()) === JSON.stringify(s0), 'M5b: a refused list or buy moved gold or goods');
      const m = await mine(C);
      ok(m && m.ok === true && m.locked === true && m.rules.min_level === 10, `M5b: mine does not tell the window: ${brief(m)}`);
      const page = await itemPage(C, ITEM);
      ok(page && page.ok === true, `M5b: the reads must stay open below the rule: ${brief(page)}`);
      ok((await cancel({ user: A, listing: id })).ok === true, 'M5b: the rule held the owner\'s own cancel');
      /* Any one hero at the Level opens the account, not just the acting one. */
      await q(`update public.player_state set level_xp = public.hr_char_xp_for_level(10) where user_id = $1 and slot = 1`, [A]);
      const grown = await list({ user: A, item: ITEM, qty: 1, ask: ASK });
      ok(grown && grown.ok === true, `M5b: an account with a hero at the Level was refused: ${brief(grown)}`);
      ok((await mine(A)).locked === false, 'M5b: mine says locked for an account at the Level');
      await cancel({ user: A, listing: grown.listed.listing_id });
    } finally {
      await cfg('min_level = 1');
      await q('update public.player_state set level_xp = 0 where user_id = $1 and slot = 1', [A]);
    }
  });

  // ══ M6 · EXACTLY ONCE UNDER REPLAY ═══════════════════════════════════════
  await leg(async () => {
    await stock();
    const l = await list({ user: A, item: ITEM, qty: 5, ask: ASK });
    const key = uuid(); const v = await ver(B, 0);
    const s0 = await snap();
    const a = await buy({ user: B, listing: l.listed.listing_id, qty: 1, max: ASK, key, version: v });
    ok(a && a.ok === true, `M6: the first buy refused ${brief(a)}`);
    const s1 = await snap();
    const r = await buy({ user: B, listing: l.listed.listing_id, qty: 1, max: ASK, key, version: v });
    ok(r && r.replayed === true, `M6: the repeated key was not a replay: ${brief(r).slice(0, 200)}`);
    const s2 = await snap();
    ok(s2.purse[B] === s1.purse[B] && s2.store[B] === s1.store[B] && s2.sales === s1.sales && s2.escrow === s1.escrow,
      'M6: THE REPLAY MOVED VALUE (a retried purchase bought twice)');
    ok(r.state && BigInt(r.state.gold) === s2.purse[B], 'M6: the replay carries no current envelope');
    conserved(s0, s2, 'M6');
  });

  // ══ M7 · ONE KEY, ONE MEANING ════════════════════════════════════════════
  await leg(async () => {
    await stock();
    const key = uuid();
    const a = await list({ user: A, item: ITEM, qty: 1, ask: ASK, key });
    const b = await list({ user: A, item: ITEM, qty: 2, ask: ASK, key });
    ok(a.ok === true && b.error === 'intent_mismatch', `M7: one key listed two different things: ${brief(b)}`);
  });

  // ══ M8 · A STALE VERSION IS REFUSED ON THE BAG VERBS, AND THE KEY RELEASED ══
  await leg(async () => {
    await stock();
    const v = BigInt(await ver(A, 0)); const key = uuid();
    const stale = await list({ user: A, item: ITEM, qty: 1, ask: ASK, key, version: String(v - 1n) });
    ok(stale && stale.error === 'version_conflict', `M8: a stale bag list was accepted: ${brief(stale)}`);
    ok((await one('select count(*)::int n from public.player_intents where user_id = $1 and intent_id = $2', [A, key])).n === 0,
      'M8: the key was not released after version_conflict');
    const good = await list({ user: A, item: ITEM, qty: 1, ask: ASK, key });
    ok(good && good.ok === true, `M8: the released key could not be reused: ${brief(good)}`);
    /* A Storage verb reads no bag, so the version is not its business. */
    await q('insert into public.account_bank (user_id, item_id, qty) values ($1, $2, 4) on conflict (user_id, item_id) do update set qty = 4', [A, ITEM]);
    const fromStore = await list({ user: A, item: ITEM, qty: 2, ask: ASK, source: 'storage', version: '0' });
    ok(fromStore && fromStore.ok === true, `M8: a Storage list was refused on a bag version: ${brief(fromStore)}`);
  });

  // ══ M9 · THE SAME ACCOUNT, ANY HERO, CANNOT BUY (P2) ══════════════════════
  await leg(async () => {
    await stock();
    const l = await list({ user: A, item: ITEM, qty: 2, ask: ASK });
    const s0 = await snap();
    for (const slot of [0, 1]) {
      const r = await buy({ user: A, slot, listing: l.listed.listing_id, qty: 1, max: ASK });
      ok(r && r.error === 'own_listing', `M9: hero ${slot} of the seller's account bought its listing: ${brief(r)}`);
    }
    const s1 = await snap();
    ok(s1.sales === s0.sales && s1.purse[A] === s0.purse[A] && s1.escrow === s0.escrow, 'M9: a refused self-buy moved value');
    ok((await one("select coalesce(sum(n), 0)::int n from public.hr_rejections where user_id = $1 and code = 'own_listing'", [A])).n >= 2,
      'M9: the wash signature was refused silently (no journalled rejection)');
  });

  // ══ M10 · CANCEL: ANY HERO OF THE ACCOUNT, TO STORAGE, ONCE; THE FEE IS KEPT ══
  await leg(async () => {
    await stock();
    const l = await list({ user: A, item: ITEM, qty: 6, ask: ASK });
    const s0 = await snap();
    const c = await cancel({ user: A, slot: 1, listing: l.listed.listing_id });
    ok(c && c.ok === true && c.cancelled.to === 'storage', `M10: another hero of the account could not cancel: ${brief(c)}`);
    const s1 = await snap();
    ok(s1.store[A] === s0.store[A] + 6n && s1.escrow === s0.escrow - 6n && s1.bag[`${A}:0`] === s0.bag[`${A}:0`],
      'M10: the cancel did not return the units to Storage (and only there)');
    ok(s1.purse[A] === s0.purse[A], 'M10: the cancel refunded (or charged) gold: the fee is kept on cancel');
    const again = await cancel({ user: A, listing: l.listed.listing_id });
    ok(again && again.error === 'gone', `M10: a second cancel answered ${brief(again)}`);
    const s2 = await snap();
    ok(s2.store[A] === s1.store[A], 'M10: THE ESCROW WAS RETURNED TWICE');
    conserved(s0, s2, 'M10');
  });

  // ══ M11 · THE SWEEP: expired and unlistable listings go to Storage, once ══
  await leg(async () => {
    await stock();
    const l = await list({ user: A, item: ITEM, qty: 4, ask: ASK });
    const s0 = await snap();
    await q("update public.market_listings set expires_at = now() - interval '1 minute' where id = $1", [l.listed.listing_id]);
    const c = await cancel({ user: A, listing: l.listed.listing_id });
    ok(c.ok === true, 'M11: the cancel of an aged listing refused');
    const n = await expire(A);
    const s1 = await snap();
    ok(s1.store[A] === s0.store[A] + 4n, `M11: the sweep returned an already-cancelled escrow (sweep said ${n})`);
    const l2 = await list({ user: A, item: ITEM, qty: 3, ask: ASK });
    await q("update public.market_listings set expires_at = now() - interval '1 minute' where id = $1", [l2.listed.listing_id]);
    const pre = await snap();
    ok(await expire(A) === 1, 'M11 CONTROL: the sweep returned nothing');
    const post = await snap();
    ok(post.store[A] === pre.store[A] + 3n && post.escrow === pre.escrow - 3n, 'M11: the expiry did not return the units to Storage');
    const bought = await buy({ user: B, listing: l2.listed.listing_id, qty: 1, max: ASK });
    ok(bought && bought.error === 'gone', `M11: an expired listing was bought: ${brief(bought)}`);
    /* THE CATALOGUE MOVES: an item made unlistable is returned early and cannot be bought. */
    const l3 = await list({ user: A, item: ITEM, qty: 2, ask: ASK });
    ok(l3.ok === true, `M11: setup list refused ${brief(l3)}`);
    await q('insert into public.hr_start_inventory (item_id, qty) values ($1, 1)', [ITEM]);
    try {
      const blocked = await buy({ user: B, listing: l3.listed.listing_id, qty: 1, max: ASK });
      ok(blocked && blocked.error === 'not_tradeable', `M11: a listing whose item became unlistable was sold: ${brief(blocked)}`);
      const pre2 = await snap();
      ok(await expire(A) === 1, 'M11: the sweep did not return the unlistable listing early');
      const post2 = await snap();
      ok(post2.store[A] === pre2.store[A] + 2n, 'M11: the unlistable listing did not come back to Storage');
      conserved(pre, post2, 'M11');
    } finally { await q('delete from public.hr_start_inventory where item_id = $1', [ITEM]); }
  });

  // ══ M12 · NO COLLECT STEP; THE RECEIPTS ARE NOBODY'S TO PATCH ══════════
  await leg(async () => {
    const col = await one(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='market_sales' and column_name='collected'`);
    ok(col.n === 0, 'M12: market_sales.collected is back');
    for (const role of ['anon', 'authenticated', 'service_role']) {
      ok((await one(`select has_table_privilege($1, 'public.market_sales', 'select,update,delete') x`, [role])).x === false, `M12: ${role} reaches market_sales`);
    }
  });

  // ══ M13 · A SALE MINTS NOTHING: gold_in 0 on both sides, stamped a transfer ══
  await leg(async () => {
    await stock();
    const l = await list({ user: A, item: ITEM, qty: 2, ask: ASK });
    const g0 = await one(`select coalesce(sum(gold_in), 0)::text g from public.player_ledger where user_id = $1`, [A]);
    const r = await buy({ user: B, listing: l.listed.listing_id, qty: 2, max: ASK });
    ok(r.ok === true, `M13: buy refused ${brief(r)}`);
    const g1 = await one(`select coalesce(sum(gold_in), 0)::text g from public.player_ledger where user_id = $1`, [A]);
    ok(g0.g === g1.g, 'M13: the sale was stamped as the seller\'s progression inflow');
    const m = await one(`select meta, slot from public.player_ledger where user_id = $1 and intent like 'market\\_sold:%' order by at desc, id desc limit 1`, [A]);
    ok(m && m.meta.transfer === true && m.slot === 0, 'M13: the seller row is not a transfer filed under the listing hero');
  });

  // ══ M15 · A REFUSED TRADE MOVES NOTHING ═══════════════════════════════════
  await leg(async () => {
    await stock();
    const l = await list({ user: A, item: ITEM, qty: 5, ask: ASK });
    await q('update public.account_wallet set gold = 1 where user_id = $1', [B]);
    const s0 = await snap();
    const r = await buy({ user: B, listing: l.listed.listing_id, qty: 5, max: ASK });
    ok(r && r.error === 'insufficient_gold', `M15: a broke buyer bought: ${brief(r)}`);
    const s1 = await snap();
    ok(s1.purse[A] === s0.purse[A] && s1.purse[B] === s0.purse[B] && s1.store[B] === s0.store[B]
       && s1.escrow === s0.escrow && s1.sales === s0.sales,
      'M15: the refused buy left a partial effect (the delivery or a credit survived)');
    const over = await list({ user: A, item: ITEM, qty: 100000, ask: ASK });
    ok(over && (over.error === 'insufficient_item' || over.error === 'listing_too_large'), `M15: listed goods the bag does not hold: ${brief(over)}`);
    const sto = await list({ user: A, item: ITEM, qty: 1, ask: ASK, source: 'storage', version: '0' });
    ok(sto && sto.error === 'insufficient_item', `M15: listed from an empty Storage: ${brief(sto)}`);
  });

  // ══ M16 · A LISTING IS NOT ANOTHER ACCOUNT'S TO CANCEL ════════════════════
  await leg(async () => {
    await stock();
    const l = await list({ user: A, item: ITEM, qty: 2, ask: ASK });
    const s0 = await snap();
    const r = await cancel({ user: B, listing: l.listed.listing_id });
    ok(r && r.error === 'not_yours', `M16: a stranger cancelled: ${brief(r)}`);
    const s1 = await snap();
    ok(s1.escrow === s0.escrow && s1.store[B] === s0.store[B], 'M16: the goods moved on a refused cancel');
  });

  // ══ M19 · THE LISTING IS IMMUTABLE BUT FOR qty (down) AND expires_at (earlier) ══
  await leg(async () => {
    await stock();
    const l = await list({ user: A, item: ITEM, qty: 3, ask: ASK });
    const id = l.listed.listing_id;
    for (const [what, set] of [['ask_each', 'ask_each = ask_each + 1'], ['owner', `user_id = '${B}'`], ['fee', 'fee = fee + 1'],
      ['qty up', 'qty = qty + 1'], ['expiry later', "expires_at = expires_at + interval '1 day'"]]) {
      let threw = false;
      try { await q(`update public.market_listings set ${set} where id = $1`, [id]); } catch { threw = true; }
      ok(threw, `M19: a direct UPDATE of ${what} was ALLOWED`);
    }
    let ctl = true;
    try { await q('update public.market_listings set qty = qty - 1 where id = $1', [id]); } catch { ctl = false; }
    ok(ctl, 'M19 CONTROL: a qty-down update was refused (a partial buy could never consume a listing)');
  });

  // ══ M21 · A SILENT REFUSAL LEAVES A TRACE (sampled `gone`) ═══════════════
  await leg(async () => {
    await gate();
    const b0 = (await one("select coalesce(sum(n), 0)::int c from public.hr_rejections where user_id = $1 and code = 'gone'", [B])).c;
    const r = await buy({ user: B, listing: uuid(), qty: 1 });
    ok(r && r.error === 'gone', `M21: buying a nonexistent listing answered ${brief(r)}`);
    const b1 = (await one("select coalesce(sum(n), 0)::int c from public.hr_rejections where user_id = $1 and code = 'gone'", [B])).c;
    ok(b1 > b0, 'M21: a `gone` refusal recorded no rejection');
  });

  // ══ M22 · THE FEE AND THE CUT ROUND UP; THE FEE IS NEVER UNDER ITS MINIMUM ══
  await leg(async () => {
    await stock();
    /* An ask whose cut and fee are NOT whole: rounding down and rounding up disagree there. */
    let odd = FLOOR;
    while (odd < CEIL && ((odd * CUT_BP) % 10000n === 0n || (odd * FEE_BP) % 10000n === 0n)) odd += 1n;
    ok((odd * CUT_BP) % 10000n !== 0n, 'M22: harness found no ask with a fractional cut');
    const l = await list({ user: A, item: ITEM, qty: 1, ask: odd });
    ok(BigInt(l.listed.fee) === feeOf(1, odd) && BigInt(l.listed.fee) >= FEE_MIN, `M22: a 1-unit listing at ${odd} paid fee ${l.listed.fee}`);
    const r = await buy({ user: B, listing: l.listed.listing_id, qty: 1, max: odd });
    ok(r && r.ok === true && BigInt(r.bought.cut) === cutOf(odd) && BigInt(r.bought.cut) >= 1n,
      `M22: a ${odd}-gold sale paid cut ${r && r.bought && r.bought.cut}, not ceil(${odd} x ${CUT_BP} / 10000)`);
  });

  // ══ M23 · FLOOR (the shop's bid) AND CEILING ═════════════════════════════
  await leg(async () => {
    await stock();
    const lo = await list({ user: A, item: ITEM, qty: 1, ask: FLOOR - 1n });
    ok(lo && lo.error === 'price_below_shop' && BigInt(lo.detail.floor) === FLOOR, `M23: below the shop bid answered ${brief(lo)}`);
    const hi = await list({ user: A, item: ITEM, qty: 1, ask: CEIL + 1n });
    ok(hi && hi.error === 'price_above_cap', `M23: above the ceiling answered ${brief(hi)}`);
    const top = await list({ user: A, item: ITEM, qty: 1, ask: CEIL });
    ok(top && top.ok === true, `M23 CONTROL: the ceiling itself was refused ${brief(top)}`);
  });

  // ══ M24 · THE SWITCH: off refuses list, buy, browse, the item page; cancel and mine run ══
  await leg(async () => {
    await stock();
    const l = await list({ user: A, item: ITEM, qty: 2, ask: ASK });
    await cfg('enabled = false');
    try {
      const a = await list({ user: A, item: ITEM, qty: 1, ask: ASK });
      const b = await buy({ user: B, listing: l.listed.listing_id, qty: 1, max: ASK });
      const r1 = await browse(B, [ITEM]); const r2 = await itemPage(B, ITEM);
      ok(a.error === 'market_closed' && b.error === 'market_closed' && r1.error === 'market_closed' && r2.error === 'market_closed',
        `M24: a closed market answered ${brief([a.error, b.error, r1.error, r2.error])}`);
      const m = await mine(A);
      ok(m && m.ok === true && m.listings.length === 1, `M24: an owner cannot see their listing with the market off: ${brief(m).slice(0, 200)}`);
      const c = await cancel({ user: A, listing: l.listed.listing_id });
      ok(c && c.ok === true, `M24: an owner cannot take their goods back with the market off: ${brief(c)}`);
    } finally { await cfg('enabled = true'); }
  });

  // ══ M25 · max_each: a buyer never pays above the price they confirmed ════
  await leg(async () => {
    await stock();
    const l = await list({ user: A, item: ITEM, qty: 2, ask: ASK + 1n });
    const s0 = await snap();
    const r = await buy({ user: B, listing: l.listed.listing_id, qty: 1, max: ASK });
    ok(r && r.error === 'price_above_max', `M25: an ask above max_each answered ${brief(r)}`);
    const s1 = await snap();
    ok(s1.purse[B] === s0.purse[B] && s1.sales === s0.sales, 'M25: the refused buy moved gold');
  });

  // ══ M26 · STORAGE ROOM COUNTS LISTED KINDS; RETURNS ALWAYS FIT ═══════════
  await leg(async () => {
    await stock();
    const cap = Number((await one('select public.hr_storage_room_cap($1) c', [A])).c);
    const fill = async (u, keep) => q(`insert into public.account_bank (user_id, item_id, qty)
        select $1, i.item_id, 1 from public.hr_items i
         where i.item_id <> all($2::text[]) and not exists (select 1 from public.account_bank b where b.user_id = $1 and b.item_id = i.item_id)
         order by i.item_id limit greatest(0, $3::int - public.hr_storage_room_used($1))`, [u, [ITEM, ITEM2, ITEM3], keep]);
    await q('delete from public.account_bank where user_id = $1', [A]);
    await fill(A, cap - 1);
    ok(Number((await one('select public.hr_storage_room_used($1) n', [A])).n) === cap - 1, 'M26: harness could not fill the room');
    await q(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 5) on conflict (user_id, slot, item_id) do update set qty = 5`, [A, ITEM2]);
    const l = await list({ user: A, item: ITEM, qty: 3, ask: ASK });   // the last kind, held by the listing
    ok(l && l.ok === true, `M26: the listing that takes the last kind refused ${brief(l)}`);
    const dep = await client(A, 'select public.hr_bank_move(0, $1, 1, \'deposit\', $2::uuid) r', [ITEM2, uuid()]);
    ok(dep && dep.error === 'bank_full', `M26: a deposit into the room a listing holds answered ${brief(dep)}`);
    const l2 = await list({ user: A, item: ITEM2, qty: 1, ask: (await one('select floor_each::text f from public.hr_market_items where item_id = $1', [ITEM2])).f });
    ok(l2 && l2.error === 'storage_no_room', `M26: a listing of a new kind into a full room answered ${brief(l2)}`);
    const depot = (await one('select public.hr_state_of($1, 0)->\'depot\' d', [A])).d;
    ok(depot && depot.reserved === 1 && depot.room_used === cap, `M26: the depot section does not show the kept kind: ${brief(depot)}`);
    const c = await cancel({ user: A, listing: l.listed.listing_id });
    ok(c && c.ok === true && Number((await one('select public.hr_storage_room_used($1) n', [A])).n) === cap,
      `M26: the return did not fit the room it kept: ${brief(c)}`);
    /* the buyer's side: Storage full of other kinds refuses a delivery there, the bag still takes it */
    await q('delete from public.account_bank where user_id = $1', [B]);
    await fill(B, Number((await one('select public.hr_storage_room_cap($1) c', [B])).c));
    const l3 = await list({ user: A, slot: 1, item: ITEM, qty: 2, ask: ASK });
    const full = await buy({ user: B, listing: l3.listed.listing_id, qty: 1, max: ASK });
    ok(full && full.error === 'storage_full', `M26: a delivery into a full Storage answered ${brief(full)}`);
    const bag = await buy({ user: B, listing: l3.listed.listing_id, qty: 1, max: ASK, deliver: 'bag' });
    ok(bag && bag.ok === true, `M26: the bag delivery was refused ${brief(bag)}`);
    await q('delete from public.account_bank where user_id = any($1::uuid[]) and item_id <> all($2::text[])', [[A, B], [ITEM, ITEM2, ITEM3]]);
  });

  // ══ M27 · THE LOCK ORDER, ON EVERY BODY (#3) ═════════════════════════════
  await leg(async () => {
    const src = async (sig) => (await one('select prosrc from pg_proc where oid = $1::regprocedure', [sig])).prosrc;
    const at = (s, t) => s.indexOf(t);
    const b = await src('public.hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint,bigint,text)');
    const order = ['perform public.hr_hunt_lock(v_uid, v_slot);', "hashtextextended('hr:depot:' || v_uid::text, 0)",
      'from public.market_listings where id = p_listing_id for update;', 'insert into public.market_item_daily',
      'perform public.hr_purse_lock(least(v_uid, v_row.user_id));', "intent like 'market\\_sold:%'", 'public.hr_purse_move(v_uid, -v_gross, 0)'];
    const pos = order.map((t) => at(b, t));
    ok(pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1])), `M27: hr_market_buy's order is ${brief(pos)} (hero, Storage, listing, daily, purses, caps, move)`);
    ok(b.split('hr_hunt_lock(').length === 2, 'M27: hr_market_buy takes a second hero lock (the seller\'s)');
    const l = await src('public.hr_market_list(uuid,integer,bigint,uuid,text,text,bigint,bigint)');
    const lp = ['perform public.hr_hunt_lock(v_uid, v_slot);', "hashtextextended('hr:depot:' || v_uid::text, 0)", 'limit v_cfg.max_listings',
      "intent like 'market\\_list:%'", 'public.hr_storage_room_fits(v_uid, p_item_id)', 'public.hr_purse_move(v_uid, -v_fee, 0)'].map((t) => at(l, t));
    ok(lp.every((p, i) => p > 0 && (i === 0 || p > lp[i - 1])), `M27: hr_market_list's order is ${brief(lp)}`);
    const x = await src('public.hr_market_expire(integer,uuid)');
    ok(/pg_try_advisory_xact_lock/.test(x) && !/[^_]pg_advisory_xact_lock\(/.test(x) && /for update skip locked/.test(x),
      'M27: the sweep waits on a lock instead of trying it');
    /* Two properties only a race could break, stated on the source (one backend cannot race):
       the charge comes off the LOCKED row, and the sweep's DELETE is its arbiter. */
    ok(b.includes('v_gross_n := p_qty::numeric * v_row.ask_each::numeric;'), 'M27: hr_market_buy does not price from the locked listing row');
    ok(x.includes('delete from public.market_listings where id = v_c.id returning * into v_row;')
       && !/select \* into v_row from public\.market_listings where id = v_c\.id/.test(x),
      'M27: the sweep reads then deletes instead of letting the DELETE arbitrate');
  });

  // ══ M28 · SETTLE-FIRST ON THE BAG VERBS ONLY (P5) ═════════════════════════
  await leg(async () => {
    await stock();
    await q('insert into public.account_bank (user_id, item_id, qty) values ($1, $2, 5) on conflict (user_id, item_id) do update set qty = 5', [A, ITEM]);
    await q('insert into public.account_bank (user_id, item_id, qty) values ($1, $2, 1) on conflict (user_id, item_id) do update set qty = 1', [B, ITEM]);
    const prior = await q('select user_id::text u, active_kind, active_id, accrued_to from public.player_state where user_id = any($1::uuid[]) and slot = 0', [[A, B]]);
    await q("update public.player_state set active_kind = 'gather', active_id = 'm28_probe_target', accrued_to = now() - interval '2 hours' where user_id = any($1::uuid[]) and slot = 0", [[A, B]]);
    try {
      const bagList = await list({ user: A, item: ITEM, qty: 1, ask: ASK });
      ok(bagList && bagList.error === 'settle_first', `M28: a bag list over an unsettled window answered ${brief(bagList)}`);
      const stoList = await list({ user: A, item: ITEM, qty: 2, ask: ASK, source: 'storage' });
      ok(stoList && stoList.ok === true, `M28: a Storage list was stalled by town work: ${brief(stoList)}`);
      const toStore = await buy({ user: B, listing: stoList.listed.listing_id, qty: 1, max: ASK });
      ok(toStore && toStore.ok === true, `M28: a buy into Storage was stalled by town work: ${brief(toStore)}`);
      const toBag = await buy({ user: B, listing: stoList.listed.listing_id, qty: 1, max: ASK, deliver: 'bag' });
      ok(toBag && toBag.error === 'settle_first', `M28: a buy into an unsettled bag answered ${brief(toBag)}`);
      const c = await cancel({ user: A, listing: stoList.listed.listing_id });
      ok(c && c.ok === true, `M28: a cancel was stalled by town work: ${brief(c)}`);
    } finally {
      for (const p of prior) {
        await q('update public.player_state set active_kind = $2, active_id = $3, accrued_to = $4 where user_id = $1 and slot = 0', [p.u, p.active_kind, p.active_id, p.accrued_to]);
      }
    }
  });

  // ══ M29 · TOWN WORK CANNOT CONSUME A LISTED INPUT (P4) ════════════════════
  await leg(async () => {
    await stock();
    await q('update public.player_inventory set qty = 3 where user_id = $1 and slot = 0 and item_id = $2', [A, ITEM]);
    const l = await list({ user: A, item: ITEM, qty: 3, ask: ASK });
    ok(l.ok === true, `M29: setup list refused ${brief(l)}`);
    const s0 = await snap();
    const craft = await engine('select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid, $4::jsonb) r',
      [A, await ver(A, 0), uuid(), JSON.stringify({ items: { [ITEM]: -1 }, journal: { kind: 'craft', intent: 'craft' } })]);
    ok(craft && craft.ok === false && /insufficient|negative|item/.test(String(craft.error)), `M29: a craft consumed a listed input: ${brief(craft).slice(0, 200)}`);
    const s1 = await snap();
    ok(s1.escrow === s0.escrow, 'M29: the escrow moved under a refused craft');
  });

  // ══ M30 · PACKED HUNT SUPPLIES ARE UNREACHABLE (P6); A HUNTING HERO IS NOT STALLED (P5) ══
  await leg(async () => {
    await stock();
    const sup = await one(`select s.item_id, m.floor_each::text f from public.hr_hunt_supplies s join public.hr_market_items m using (item_id)
                            where m.listable and s.kind = 'heal' order by s.item_id limit 1`);
    ok(!!sup, 'M30: harness found no listable heal supply');
    await q(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 10) on conflict (user_id, slot, item_id) do update set qty = 10`, [A, sup.item_id]);
    const e = await client(A, "select public.hr_hunt_enter(0, 'mill_cellar', $1::jsonb, 0, null, $2::uuid) r", [JSON.stringify([{ item: sup.item_id, qty: 8 }]), uuid()]);
    ok(e && e.ok === true, `M30: harness could not enter a hunt ${brief(e).slice(0, 300)}`);
    const packed = async () => Number((await one('select coalesce(sum(qty_left), 0)::int n from public.hunt_bag where user_id = $1 and slot = 0 and item_id = $2', [A, sup.item_id])).n);
    const bagged = async () => Number((await one('select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)::int n', [A, sup.item_id])).n);
    const p0 = await packed(); const b0 = await bagged();
    ok(p0 === 8 && b0 === 2, `M30: the hunt did not pack 8 (packed ${p0}, bag ${b0})`);
    const over = await list({ user: A, item: sup.item_id, qty: b0 + 1, ask: sup.f });
    ok(over && over.error === 'insufficient_item', `M30: a list reached the packed supplies: ${brief(over)}`);
    const dep = await client(A, "select public.hr_bank_move(0, $1, $2, 'deposit', $3::uuid) r", [sup.item_id, b0 + 1, uuid()]);
    ok(dep && dep.error === 'insufficient_item', `M30: a Storage deposit reached the packed supplies: ${brief(dep)}`);
    const okList = await list({ user: A, item: sup.item_id, qty: b0, ask: sup.f });
    ok(okList && okList.ok === true, `M30 (P5): a hunting hero's bag list was refused ${brief(okList)}`);
    ok(await packed() === p0, 'M30: the packed supplies moved');
    await client(A, 'select public.hr_hunt_leave(0, $1::uuid) r', [uuid()]);
  });

  // ══ M31 · A BUY INTO THE BAG: the hero's bag, bag_full at its cap ══════════
  await leg(async () => {
    await stock();
    const l = await list({ user: A, item: ITEM, qty: 3, ask: ASK });
    const s0 = await snap();
    const r = await buy({ user: B, slot: 1, listing: l.listed.listing_id, qty: 2, max: ASK, deliver: 'bag' });
    ok(r && r.ok === true, `M31: buy into the bag refused ${brief(r)}`);
    const s1 = await snap();
    ok(s1.bag[`${B}:1`] === s0.bag[`${B}:1`] + 2n && s1.store[B] === s0.store[B], 'M31: the goods did not land in the buying hero\'s bag (only)');
    ok(s1.version[`${B}:1`] === s0.version[`${B}:1`] + 1n, 'M31: the buying hero\'s version did not move');
    conserved(s0, s1, 'M31');
    /* C's bag filled to its own stack cap with other kinds: a NEW stack does not fit. */
    await q(`insert into public.player_inventory (user_id, slot, item_id, qty)
             select $1, 0, i.item_id, 1 from public.hr_items i
              where i.item_id <> all($2::text[])
                and not exists (select 1 from public.player_inventory p where p.user_id = $1 and p.slot = 0 and p.item_id = i.item_id)
              order by i.item_id
              limit greatest(0, (select bank_cap from public.player_state where user_id = $1 and slot = 0)
                              - (select count(*) from public.player_inventory where user_id = $1 and slot = 0))`, [C, [ITEM, ITEM2, ITEM3]]);
    const full = await buy({ user: C, listing: l.listed.listing_id, qty: 1, max: ASK, deliver: 'bag' });
    ok(full && full.error === 'bag_full', `M31: a delivery into a full bag answered ${brief(full)}`);
    await q('delete from public.player_inventory where user_id = $1 and slot = 0 and qty = 1 and item_id <> all($2::text[])', [C, [ITEM, ITEM2, ITEM3]]);
  });

  // ══ M32 · THE READS: bounded, names-free, the owner's own view ══════════
  await leg(async () => {
    await stock();
    const l = await list({ user: A, item: ITEM, qty: 4, ask: ASK });
    await list({ user: A, slot: 1, item: ITEM, qty: 2, ask: ASK + 1n });
    await buy({ user: B, listing: l.listed.listing_id, qty: 1, max: ASK });
    const page = await browse(B);
    ok(page && page.ok === true && page.items.some((i) => i.item_id === ITEM && BigInt(i.lowest) === ASK && Number(i.for_sale) === 5),
      `M32: browse does not show the open asks ${brief(page).slice(0, 300)}`);
    const named = await browse(B, [ITEM2, ITEM]);
    ok(named.ok === true && named.items.length === 2 && named.items[0].item_id === ITEM2, 'M32: a named browse lost an item or its order');
    const tooMany = await browse(B, Array.from({ length: 51 }, () => ITEM));
    ok(tooMany && tooMany.error === 'bad_request', 'M32: a browse of 51 items was answered');
    const it = await itemPage(A, ITEM);
    ok(it.ok === true && it.asks.length === 2 && it.asks[0].listings[0].mine === true && it.recent.length >= 1,
      `M32: the item page is wrong ${brief(it).slice(0, 300)}`);
    const theirs = await itemPage(B, ITEM);
    ok(theirs.asks.every((g) => g.listings.every((x) => x.mine === false)), 'M32: another account sees "mine" on A\'s listings');
    const m = await mine(A);
    ok(m.ok === true && m.listings.length === 2 && m.history.some((h) => h.what === 'sold') && Number(m.today.open) === 2,
      `M32: mine is wrong ${brief(m).slice(0, 300)}`);
    ok(m.listings.find((x) => x.id === l.listed.listing_id).received > 0, 'M32: mine does not show what a listing has received');
  });

  // ══ M33 · THE MARKET'S OWN BUCKETS, NOT hr_apply's ═══════════════════════
  await leg(async () => {
    await stock();
    await list({ user: A, item: ITEM, qty: 1, ask: ASK });
    await mine(A);
    const rows = await q('select bucket from public.hr_rate_counters where user_id = $1 order by bucket', [A]);
    ok(rows.some((r) => r.bucket === 'market') && rows.some((r) => r.bucket === 'market_read') && !rows.some((r) => r.bucket === 'apply'),
      `M33: the market spent buckets ${brief(rows.map((r) => r.bucket))}`);
    await q("update public.hr_rate_counters set n = 1000 where user_id = $1 and bucket = 'market'", [A]);
    const r = await list({ user: A, item: ITEM, qty: 1, ask: ASK });
    ok(r && r.error === 'rate_limited', `M33: an exhausted market bucket answered ${brief(r)}`);
  });

  // ══ M18 · PER-ACCOUNT LISTING CAPS ACROSS HEROES (P7) ═════════════════════
  await leg(async () => {
    await stock();
    await cfg('max_listings = 3');
    try {
      for (const slot of [0, 0, 1]) {
        const r = await list({ user: A, slot, item: ITEM, qty: 1, ask: ASK });
        ok(r && r.ok === true, `M18: setup list on hero ${slot} refused ${brief(r)}`);
      }
      for (const slot of [0, 1]) {
        const r = await list({ user: A, slot, item: ITEM, qty: 1, ask: ASK });
        ok(r && r.error === 'too_many_listings', `M18: hero ${slot} listed a 4th against an ACCOUNT cap of 3: ${brief(r)}`);
      }
    } finally { await cfg('max_listings = 50'); }
    const used = Number((await one(`select count(*)::int n from public.player_ledger where user_id = $1 and gold <> 0
                                     and at >= public.hr_utc_day_start(now()) and kind = 'trade' and intent like 'market\\_list:%'`, [A])).n);
    await cfg(`max_lists_per_day = ${used + 1}`);
    try {
      const a = await list({ user: A, slot: 1, item: ITEM, qty: 1, ask: ASK });
      ok(a && a.ok === true, `M18: the last listing of the day refused ${brief(a)}`);
      for (const slot of [0, 1]) {
        const r = await list({ user: A, slot, item: ITEM, qty: 1, ask: ASK });
        ok(r && r.error === 'list_daily_cap', `M18: hero ${slot} listed past the ACCOUNT's daily cap: ${brief(r)}`);
      }
    } finally { await cfg('max_lists_per_day = 200'); }
  });

  // ══ M14 · PER-ACCOUNT DAILY GOLD CAPS ACROSS HEROES (P7, the gold half) ══
  await leg(async () => {
    await stock();
    const l = await list({ user: A, item: ITEM, qty: 20, ask: ASK });
    await cfg(`max_spend_per_day = ${ASK * 2n + (BigInt((await one(`select coalesce(sum(-gold), 0)::text s from public.player_ledger where user_id = $1 and gold <> 0
        and at >= public.hr_utc_day_start(now()) and kind = 'trade' and intent like 'market\\_buy:%'`, [B])).s))}`);
    try {
      const a = await buy({ user: B, slot: 0, listing: l.listed.listing_id, qty: 2, max: ASK });
      ok(a && a.ok === true, `M14: the buy up to the cap refused ${brief(a)}`);
      const s0 = await snap();
      const b = await buy({ user: B, slot: 1, listing: l.listed.listing_id, qty: 1, max: ASK });
      ok(b && b.error === 'market_spend_daily_cap', `M14: another hero of the buying account spent past the ACCOUNT cap: ${brief(b)}`);
      const s1 = await snap();
      ok(s1.purse[B] === s0.purse[B] && s1.sales === s0.sales, 'M14: the refused buy moved gold');
    } finally { await cfg('max_spend_per_day = 2000000'); }
    const recv = BigInt((await one(`select coalesce(sum(gold), 0)::text s from public.player_ledger where user_id = $1 and gold <> 0
        and at >= public.hr_utc_day_start(now()) and kind = 'trade' and intent like 'market\\_sold:%'`, [A])).s);
    await cfg(`max_proceeds_per_day = ${recv + (ASK - cutOf(ASK))}`);
    try {
      const l2 = await list({ user: A, slot: 1, item: ITEM, qty: 5, ask: ASK });
      const a = await buy({ user: C, listing: l2.listed.listing_id, qty: 1, max: ASK });
      ok(a && a.ok === true, `M14: the sale up to the proceeds cap refused ${brief(a)}`);
      const b = await buy({ user: C, listing: l.listed.listing_id, qty: 1, max: ASK });
      ok(b && b.error === 'market_proceeds_daily_cap', `M14: the seller account (hero 0's listing, hero 1's sale) was paid past its cap: ${brief(b)}`);
    } finally { await cfg('max_proceeds_per_day = 2000000'); }
  });

  await db.close?.();
  return fails.slice();
}

// ── driver ──────────────────────────────────────────────────────────────
if (has('list')) {
  for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(26)} ${m.why}`);
  process.exit(0);
}
if (has('selftest')) {
  let slipped = 0;
  for (const id of Object.keys(MUTATIONS)) {
    let caught = false; let why = '';
    try { const f = await run(id); caught = f.length > 0; why = f[0] || ''; }
    catch (e) {
      if (e.harness) { console.error(`  HARNESS  ${id}: ${e.message}`); process.exit(2); }
      caught = true; why = e.message;
    }
    if (caught) console.log(`  CAUGHT   ${id}\n             ${String(why).split('\n')[0].slice(0, 220)}`);
    else { slipped++; console.error(`  SLIPPED  ${id} — ${MUTATIONS[id].why}`); }
  }
  console.log(slipped ? `\n${slipped} mutation(s) SLIPPED` : `\nall ${Object.keys(MUTATIONS).length} mutations caught`);
  process.exit(slipped ? 1 : 0);
}
const mutate = argOf('mutate', null);
let out;
try { out = await run(mutate); }
catch (e) {
  if (e.harness) { console.error(`HARNESS: ${e.message}`); process.exit(2); }
  console.error(`market-v2: ${e.message}`);
  process.exit(1);
}
if (out.length) {
  for (const f of out) console.error(`  x ${f}`);
  console.error(`\nmarket-v2: ${out.length} failure(s)`);
  process.exit(1);
}
console.log('market-v2: all checks green — the account market: escrow, Storage returns and room, per-account caps, '
  + 'one listable rule, same-account refusal, max price, the switch, the lock order, anonymity, exactly-once, both sinks');

/** Exported so tests/run-smoke.mjs runs this as one guard. */
export async function marketV2Guard() {
  const f = await run(null);
  return { name: 'market (account-owned, anonymous)', failures: f };
}
