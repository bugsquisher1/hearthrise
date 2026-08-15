#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/market-v2.mjs — THE FIRST CROSS-PLAYER VALUE TRANSFER, END TO END,
// WITH BOTH PLAYERS MEASURED.
//
// THE CLAIM UNDER TEST, in one line:
//   a SELLER who lists goods and a BUYER who buys them end up with exactly the
//   gold and exactly the items the trade says, once — and no replay, no forged
//   caller, no stale read, no racing expiry and no second collect can move a
//   coin or an item twice, in either direction.
//
// Everything runs for real: a real PostgreSQL (PGlite/WASM, in process) with
// THE WHOLE MIGRATION CHAIN applied verbatim from tests/schema-apply-order.json
// — so 2026-08-17-market-v2.sql's own self-verifying blocks (§0 refuse-to-
// install with both scan controls, §11(a)-(k) structural + source + cron +
// immutability, and hr_assert_grant_hygiene(true)) EXECUTE on every run of this
// file — and the three RPCs are driven as `hr_engine`, the role that holds ZERO
// table privileges, exactly as the Edge Function drives them.
//
// ── WHY BOTH SIDES ARE MEASURED, ALWAYS ─────────────────────────────────
// Every previous economy guard in this repo measures ONE character, because
// every previous verb touched one. The whole reason market v2 needed its own
// review is that `hr_market_buy` is the first function that writes a row
// belonging to somebody who is not the caller. A test that checked only the
// buyer would pass on a build that paid the seller twice, and a test that
// checked only totals would pass on a build that paid the WRONG seller. So
// `snapshot()` below reads BOTH characters' gold, BOTH inventories, the escrow
// and the tax sink, and the assertions are stated as a conservation identity:
//
//     Σ gold + Σ tax  is CONSTANT across a trade
//     Σ inventory + Σ escrow  is CONSTANT across list / buy / cancel / expire
//
// ── WHAT THIS FILE DOES NOT PROVE ───────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend; the advisory locks are taken and
//     contended by nothing. The properties a race would surface are driven
//     DIRECTLY instead — the version check (M8), the intent replay (M6), the
//     delete-as-arbiter (M10/M11) — which is the same substitution
//     tests/unlock-buy.mjs makes and the same limitation.
//   · The PostgREST/Deno request path.
//   · That the market is REACHABLE. The client swap and the Edge verb are not
//     in this commit; this file grades the authority layer, which is what a
//     Security review of a value transfer has to grade first.
//
// ── MUTATION ────────────────────────────────────────────────────────────
//   node tests/market-v2.mjs --list        the mutation catalogue
//   node tests/market-v2.mjs --selftest    every mutation must be CAUGHT
//   node tests/market-v2.mjs --mutate=<id>
// A mutation nothing catches is reported as SLIPPED and exits 1: a guard that
// cannot demonstrate it sees failure is treated as broken, not as a pass.
// ════════════════════════════════════════════════════════════════════════

import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-08-17-market-v2.sql';

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   Each entry plants a REAL defect this suite claims to catch. Several of them
   are the exact defects the 2026-08-11 review found in the superseded file, so
   the catalogue doubles as proof that the re-derivation did not lose them. */
const MUTATIONS = {
  // ── CONSERVATION: the escrow ───────────────────────────────────────────
  list_no_escrow: {
    why: 'market_list posts the listing without debiting the seller — the goods exist twice, once '
       + 'in the bag and once in the escrow. BOTH branches, because the debit has a whole-stack '
       + 'form and a partial-stack form and a mutation that disarmed only one would be caught by '
       + 'whichever leg happened to take the other',
    pairs: [
      ['    if v_have = p_qty then\n      delete from public.player_inventory\n'
       + '       where user_id = v_uid and slot = v_slot and item_id = p_item_id;\n    else\n'
       + '      update public.player_inventory set qty = v_have - p_qty\n'
       + '       where user_id = v_uid and slot = v_slot and item_id = p_item_id;\n    end if;',
       '    if false then\n      delete from public.player_inventory\n'
       + '       where user_id = v_uid and slot = v_slot and item_id = p_item_id;\n    end if;'],
    ],
  },
  cancel_no_return: {
    why: 'market_cancel deletes the listing but never returns the escrow — the stack ceases to '
       + 'exist, which is the one direction a player cannot recover from',
    find: '    insert into public.player_inventory as pi (user_id, slot, item_id, qty)\n'
        + '      values (v_uid, v_slot, v_row.item_id, v_row.qty)',
    repl: '    insert into public.player_inventory as pi (user_id, slot, item_id, qty)\n'
        + '      values (v_uid, v_slot, v_row.item_id, 0)',
  },
  // ── CONSERVATION: the gold ─────────────────────────────────────────────
  buy_no_debit: {
    why: 'market_buy pays the seller and delivers the goods without debiting the buyer — gold is '
       + 'minted by trading with yourself through a second account',
    find: '    update public.player_state set gold = gold - v_gross, version = version + 1, updated_at = now()\n'
        + '     where user_id = v_uid and slot = v_slot;',
    repl: '    update public.player_state set gold = gold, version = version + 1, updated_at = now()\n'
        + '     where user_id = v_uid and slot = v_slot;',
  },
  buy_no_credit: {
    why: 'S11 — the seller is not credited. The buyer pays, the goods move, and the gold '
       + 'evaporates. Money must not evaporate any more than it may be minted',
    find: '    update public.player_state set gold = gold + v_net, version = version + 1, updated_at = now()\n'
        + '     where user_id = v_row.seller_user_id and slot = v_row.seller_slot;',
    repl: '    update public.player_state set gold = gold, version = version + 1, updated_at = now()\n'
        + '     where user_id = v_row.seller_user_id and slot = v_row.seller_slot;',
  },
  buy_leaks_gold: {
    why: 'one extra gold per trade is destroyed that no tax row accounts for — a LEAK, not a sink. '
       + 'A sink is auditable; a leak is a slow drain nobody can name',
    find: '    v_net   := v_gross - v_tax;',
    repl: '    v_net   := v_gross - v_tax - 1;',
  },
  seller_rowcount_ignored: {
    why: 'S11 exactly — the credit\'s row_count stops being checked, so a sale to a seller with no '
       + 'state row silently destroys the buyer\'s gold',
    find: '    if v_rows <> 1 then',
    repl: '    if false then',
  },
  // ── AUTHORITY ──────────────────────────────────────────────────────────
  price_from_routing_read: {
    why: 'the charge is computed from the UNLOCKED routing read instead of the row locked in step '
       + '(2). Every decision in this file is supposed to be made under the lock; this is the one '
       + 'that moves money',
    find: '    v_gross_n := p_qty::numeric * v_row.ask_each::numeric;',
    repl: '    v_gross_n := p_qty::numeric * v_route.ask_each::numeric;',
  },
  self_trade_allowed: {
    why: 'buying your own listing stops being refused — the house tax becomes a price the player '
       + 'pays themselves to establish an arbitrary public price history (wash trading)',
    find: '  if v_route.seller_user_id = v_uid and v_route.seller_slot = v_slot then',
    repl: '  if false then',
  },
  cancel_any_listing: {
    why: 'the ownership check on cancel is disarmed — any player can dissolve any listing and the '
       + 'goods land in THEIR bag. TWO anchors: the routing-read check and the ownership predicate '
       + 'on the DELETE are independent statements of one rule (defence in depth), and disarming '
       + 'either alone still refuses, so a one-anchor mutation would prove nothing about either',
    pairs: [
      ['  if v_route.seller_user_id <> v_uid then\n'
       + "    return jsonb_build_object('ok', false, 'error', 'not_yours');\n  end if;",
       '  if false then\n'
       + "    return jsonb_build_object('ok', false, 'error', 'not_yours');\n  end if;"],
      ['    delete from public.market_listings\n'
       + '     where id = p_listing_id and seller_user_id = v_uid and seller_slot = v_slot\n'
       + '    returning * into v_row;',
       '    delete from public.market_listings\n'
       + '     where id = p_listing_id\n'
       + '    returning * into v_row;'],
    ],
  },
  bop_listable: {
    why: 'S3 — the tradeable allowlist is disarmed and every bind-on-pickup item becomes market '
       + 'goods',
    find: '  if p_item_id is null or not exists (select 1 from public.hr_items\n'
        + '                                       where item_id = p_item_id and tradeable) then',
    repl: '  if p_item_id is null or not exists (select 1 from public.hr_items\n'
        + '                                       where item_id = p_item_id) then',
  },
  // ── IDEMPOTENCY + CONCURRENCY ──────────────────────────────────────────
  replay_reapplies: {
    why: 'BOTH idempotency lookups in hr_market_buy stop short-circuiting, so a retried purchase — '
       + 'a double-tap, a client retry, a duplicated delivery — buys twice. Two anchors, because '
       + 'either one alone still answers correctly: that is defence in depth, and a mutation that '
       + 'disarmed only one would prove nothing about the other',
    pairs: [
      // the (R) pre-check
      ['  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot\n'
       + '    from public.player_intents\n'
       + '   where user_id = v_uid and intent_id = p_intent_id;\n  if found then\n'
       + '    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then\n'
       + "      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',\n"
       + "        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent,\n"
       + "                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));\n"
       + "      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');\n    end if;\n"
       + '    if v_prev is null then\n'
       + "      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');\n    end if;\n"
       + "    if coalesce(v_prev->>'ok', 'false') = 'true' then\n"
       + "      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);\n"
       + '    end if;\n'
       + "    return v_prev || jsonb_build_object('replayed', true);\n  end if;\n\n"
       + '  -- ROUTING READ, UNLOCKED (§4c) — it exists only to learn WHOSE advisory lock',
       '  -- ROUTING READ, UNLOCKED (§4c) — it exists only to learn WHOSE advisory lock'],
      // …and the locked claim
      ['  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot\n'
       + '    from public.player_intents\n'
       + '   where user_id = v_uid and intent_id = p_intent_id;\n  if found then\n'
       + '    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then\n'
       + "      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',\n"
       + "        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent,\n"
       + "                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));\n"
       + "      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');\n    end if;\n"
       + '    if v_prev is null then\n'
       + "      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');\n    end if;\n"
       + "    if coalesce(v_prev->>'ok', 'false') = 'true' then\n"
       + "      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);\n"
       + '    end if;\n'
       + "    return v_prev || jsonb_build_object('replayed', true);\n  end if;\n"
       + '  insert into public.player_intents (user_id, intent_id, slot, intent)\n'
       + '    values (v_uid, p_intent_id, v_slot, v_intent)\n'
       + '  on conflict (user_id, intent_id) do nothing;\n  if not found then\n'
       + "    return jsonb_build_object('ok', false, 'error', 'intent_in_flight');\n  end if;\n"
       + '  v_claimed := true;\n\n  begin\n'
       + '    -- (4) BOTH player_state ROWS',
       '  v_claimed := true;\n\n  begin\n    -- (4) BOTH player_state ROWS'],
    ],
  },
  /* ⚠ THIS MUTATION EXISTS BECAUSE THE BUG WAS REAL, AND WAS SHIPPED IN THE
     FIRST DRAFT OF THIS MIGRATION. M6 caught it on the first run of this file:
     the (R) replay pre-check sat BELOW the unlocked routing read, so a retry of
     a purchase that consumed the whole listing found no listing and answered
     `gone` — the client asking "did my payment land?" and being told "somebody
     else bought it". Nothing was applied twice, so every conservation identity
     in this file stayed green; only the ANSWER was wrong. That is the half of
     exactly-once a value check cannot see, and it is now a named mutation
     rather than a fixed bug nobody can re-break. */
  replay_answers_gone: {
    why: 'the replay pre-check moves back BELOW the routing read, so a retry of a purchase that '
       + 'consumed the whole listing answers `gone` instead of `replayed` — indistinguishable, to '
       + 'the client, from "somebody outbid you", and it leaves a prediction that can never be '
       + 'settled',
    find: '  v_intent := \'market_buy:\' || p_listing_id::text || \':\' || p_qty::text;\n'
        + '  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot\n'
        + '    from public.player_intents\n'
        + '   where user_id = v_uid and intent_id = p_intent_id;\n  if found then',
    repl: '  v_intent := \'market_buy:\' || p_listing_id::text || \':\' || p_qty::text;\n'
        + '  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot\n'
        + '    from public.player_intents\n'
        + '   where user_id = v_uid and intent_id = p_intent_id;\n  if false then',
  },
  version_check_off: {
    why: 'a caller whose read is stale can land a purchase computed against a balance that has '
       + 'since moved — the property a race would surface, driven directly because PGlite cannot '
       + 'race it',
    find: '    if p_version is null or p_version <> v_st.version then\n'
        + "      perform public.hr_reject('version_conflict', jsonb_build_object('version', v_st.version));\n"
        + '    end if;\n\n    -- (5) THE ARITHMETIC',
    repl: '    if false then\n'
        + "      perform public.hr_reject('version_conflict', jsonb_build_object('version', v_st.version));\n"
        + '    end if;\n\n    -- (5) THE ARITHMETIC',
  },
  expire_double_returns: {
    why: 'hr_market_expire reads the listing and then deletes it, instead of letting the DELETE be '
       + 'the arbiter — so an expiry racing a cancel returns one escrow to the bag twice',
    find: '    delete from public.market_listings where id = v_id returning * into v_row;\n'
        + '    if not found then continue; end if;   -- a cancel or a buy took it first',
    repl: '    select * into v_row from public.market_listings where id = v_id;\n'
        + '    delete from public.market_listings where id = v_id;',
  },
  // ── THE PER-DAY FUSES ──────────────────────────────────────────────────
  spend_cap_off: {
    why: 'the buyer-side per-day transfer clamp is gone, so a compromised engine can move unbounded '
       + 'gold between accounts inside the rate limit',
    find: '    if v_spent + v_gross > c_max_spend_per_day then',
    repl: '    if false then',
  },
  proceeds_cap_off: {
    why: 'the seller-side per-day transfer clamp is gone — the other half of the same fuse, and the '
       + 'half a buyer-side-only test would never see',
    find: '    if v_recv + v_net > c_max_proceeds_per_day then',
    repl: '    if false then',
  },
  // ── THE BUDGET SEPARATION (the griefing vector) ────────────────────────
  proceeds_charged_to_budget: {
    why: "market_buy stamps the seller's credit as progression INFLOW. Market gold is conserved, "
       + 'not minted, so charging it to the daily mint ceiling lets a stranger buy a seller\'s '
       + 'cheap listings and lock them out of their own accrual for the rest of the day',
    find: "       v_row.item_id, -p_qty, v_net, 0, 0, 0, 0,",
    repl: "       v_row.item_id, -p_qty, v_net, v_net, 0, 0, 0,",
  },
};

// ── args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit === undefined ? d : hit.slice(n.length + 3);
};
const has = (n) => argv.includes(`--${n}`);

const SELLER = '00000000-0000-4000-ba55-000000000001';
const BUYER  = '00000000-0000-4000-ba55-000000000002';

class Red extends Error {}
const fails = [];
function ok(cond, msg) { if (!cond) { fails.push(msg); throw new Red(msg); } }
function note(cond, msg) { if (!cond) fails.push(msg); }

const uuid = () => crypto.randomUUID();

async function boot(mutate) {
  let patches;
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) { const e = new Error(`unknown mutation "${mutate}"`); e.harness = true; throw e; }
    /* `pairs` for a mutation that has to disarm TWO sites at once — a defence
       in depth whose halves each answer correctly alone, so a one-anchor
       mutation would prove nothing about either. bootReplay still demands each
       anchor match EXACTLY ONCE, so a stale one aborts the run as a harness
       failure rather than silently no-opping. */
    patches = new Map([[MIG, m.pairs || [[m.find, m.repl]]]]);
  }
  let db;
  try {
    ({ db } = await bootReplay(patches ? { patches } : {}));
  } catch (e) {
    if (e.harness) throw e;
    /* A mutation that makes the migration REFUSE TO INSTALL is the guard
       working: §11's source scans are a commit gate, and refusing to install a
       broken market is strictly better than catching it at runtime. */
    throw new Red(`migration chain refused: ${e.message}`);
  }
  await db.exec(`
    insert into auth.users (id) values ('${SELLER}'), ('${BUYER}') on conflict (id) do nothing;
    do $$ begin
      perform set_config('request.jwt.claim.sub', '${SELLER}', true);
      perform public.hr_create_character(0);
      perform set_config('request.jwt.claim.sub', '${BUYER}', true);
      perform public.hr_create_character(0);
      perform set_config('request.jwt.claim.sub', '', true);
    end $$;`);
  return db;
}

/** THE SEAM. One statement, run as `hr_engine` — the role that holds ZERO table
    privileges, so a function that tried to touch a table outside its own
    SECURITY DEFINER body would be refused here exactly as in production. */
function makeExec(db) {
  return async (text, params) => {
    await db.exec('set role hr_engine');
    try { return (await db.query(text, params)).rows; }
    finally { await db.exec('reset role'); }
  };
}

/* ── THE MEASUREMENT ───────────────────────────────────────────────────────
   BOTH characters, the escrow and the sink, in one read. Everything this file
   asserts is stated against two of these and a difference — never against a
   number typed into an expectation, because a hard-coded expectation is a
   second copy of the arithmetic under test. */
async function snapshot(db, itemId) {
  const one = async (uid) => {
    const st = (await db.query(
      'select gold::text gold, version::text version from public.player_state '
      + 'where user_id=$1 and slot=0', [uid])).rows[0];
    const inv = (await db.query(
      'select coalesce(qty,0)::text q from public.player_inventory '
      + 'where user_id=$1 and slot=0 and item_id=$2', [uid, itemId])).rows[0];
    /* A MISSING state row reads as zeros rather than throwing. M17 deletes one
       on purpose — it is the only way to execute the S11 branch — and a
       snapshot that crashed there would report the harness breaking instead of
       the invariant holding. `present` is carried so a leg can tell "this
       character has no gold" from "this character has no row". */
    return {
      present: !!st,
      gold: BigInt(st ? st.gold : '0'),
      version: BigInt(st ? st.version : '0'),
      item: BigInt(inv ? inv.q : '0'),
    };
  };
  const esc = (await db.query(
    'select coalesce(sum(qty),0)::text q, count(*)::text n from public.market_listings '
    + 'where item_id=$1', [itemId])).rows[0];
  const sink = (await db.query(
    'select coalesce(sum(tax),0)::text t, coalesce(sum(gold_gross),0)::text g, '
    + 'coalesce(sum(gold_net),0)::text n, count(*)::text c from public.market_sales')).rows[0];
  return {
    seller: await one(SELLER),
    buyer: await one(BUYER),
    escrow: BigInt(esc.q), listings: Number(esc.n),
    tax: BigInt(sink.t), gross: BigInt(sink.g), net: BigInt(sink.n), sales: Number(sink.c),
  };
}
const goldTotal = (s) => s.seller.gold + s.buyer.gold + s.tax;
const itemTotal = (s) => s.seller.item + s.buyer.item + s.escrow;

// ════════════════════════════════════════════════════════════════════════
async function run(mutate) {
  fails.length = 0;
  const db = await boot(mutate);
  const exec = makeExec(db);

  const call = async (sql, params) => {
    const rows = await exec(sql, params);
    return (rows[0] && rows[0].r) || null;
  };
  const versionOf = async (uid) => (await db.query(
    'select version::text v from public.player_state where user_id=$1 and slot=0', [uid]
  )).rows[0].v;

  const list = async (o) => call(
    'select public.hr_market_list($1::uuid,$2::int,$3::bigint,$4::uuid,$5::text,$6::bigint,$7::bigint) r',
    [o.user, 0, o.version ?? await versionOf(o.user), o.key || uuid(), o.item, o.qty, o.ask]);
  const cancel = async (o) => call(
    'select public.hr_market_cancel($1::uuid,$2::int,$3::bigint,$4::uuid,$5::uuid) r',
    [o.user, o.slot ?? 0, o.version ?? await versionOf(o.user), o.key || uuid(), o.listing]);
  const buy = async (o) => call(
    'select public.hr_market_buy($1::uuid,$2::int,$3::bigint,$4::uuid,$5::uuid,$6::bigint) r',
    [o.user, 0, o.version ?? await versionOf(o.user), o.key || uuid(), o.listing, o.qty]);

  /* THE GOODS, chosen from the SERVER's own generated catalogue by the property
     that matters (tradeable, stackable), never by name — a hard-coded item id
     is a second copy of src/data/items.js. */
  const ITEM = (await db.query(
    `select item_id from public.hr_items
      where tradeable and item_id not in (select item_id from public.hr_item_slots)
      order by item_id limit 1`)).rows[0].item_id;
  const BOP = (await db.query(
    'select item_id from public.hr_items where not tradeable order by item_id limit 1')).rows[0].item_id;

  const ASK = 1000n;
  const QTY = 5n;
  const stock = async () => {
    await db.query('update public.player_state set gold = 1000000 where user_id = $1', [SELLER]);
    await db.query('update public.player_state set gold = 1000000 where user_id = $1', [BUYER]);
    await db.query(
      `insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,0,$2,100)
       on conflict (user_id, slot, item_id) do update set qty = 100`, [SELLER, ITEM]);
  };
  await stock();

  const TAX_BP = BigInt((await db.query('select house_tax_bp from public.hr_market_config')).rows[0].house_tax_bp);

  // ══ M1 · THE HAPPY PATH: list → buy → both sides measured ═════════════
  let listingId;
  try {
    const before = await snapshot(db, ITEM);

    const l = await list({ user: SELLER, item: ITEM, qty: QTY, ask: ASK });
    ok(l && l.ok === true, `M1: market_list refused: ${JSON.stringify(l)}`);
    listingId = l.listed.listing_id;
    ok(!!listingId, 'M1: market_list returned no listing id');

    const afterList = await snapshot(db, ITEM);
    ok(afterList.seller.item === before.seller.item - QTY,
      `M1: the seller's bag moved by ${afterList.seller.item - before.seller.item}, not -${QTY} — `
      + 'the escrow is supposed to be a real DELETE from player_inventory');
    ok(afterList.escrow === before.escrow + QTY,
      'M1: the escrow did not gain the listed goods');
    ok(itemTotal(afterList) === itemTotal(before),
      `M1: listing changed the total item count (${itemTotal(before)} -> ${itemTotal(afterList)}). `
      + 'Escrow is a MOVE; a listing that mints or destroys goods is the defect this identity exists for');
    ok(afterList.seller.version === before.seller.version + 1n,
      'M1: listing did not bump the seller version (S15) — a client holding the old version could '
      + 'land a delta computed against inventory that no longer exists');
    /* THE ENVELOPE. The client cannot retire a prediction without one. */
    ok(afterList.seller.gold === BigInt(l.state.gold) && l.version !== undefined && l.inventory,
      'M1: market_list did not return an hr_state_of envelope carrying the post-write state');

    const r = await buy({ user: BUYER, listing: listingId, qty: QTY });
    ok(r && r.ok === true, `M1: market_buy refused: ${JSON.stringify(r)}`);

    const after = await snapshot(db, ITEM);
    const gross = QTY * ASK;
    const tax = (gross * TAX_BP) / 10000n;
    const net = gross - tax;

    ok(after.buyer.gold === before.buyer.gold - gross,
      `M1 BUYER: gold moved by ${after.buyer.gold - before.buyer.gold}, expected -${gross}`);
    ok(after.buyer.item === before.buyer.item + QTY,
      `M1 BUYER: received ${after.buyer.item - before.buyer.item} items, expected ${QTY}`);
    ok(after.seller.gold === before.seller.gold + net,
      `M1 SELLER: gold moved by ${after.seller.gold - before.seller.gold}, expected +${net} `
      + `(gross ${gross} - tax ${tax}). The seller is paid AT SALE TIME, online or not`);
    ok(after.seller.item === before.seller.item - QTY,
      'M1 SELLER: the escrowed goods came back as well as being delivered');
    ok(after.escrow === before.escrow, 'M1: the escrow was not consumed by the sale');
    ok(goldTotal(after) === goldTotal(before),
      `M1 CONSERVATION: Σgold+Σtax moved from ${goldTotal(before)} to ${goldTotal(after)}. Gold may `
      + 'be BURNED by the house tax (which the sink accounts for) and must never be minted or leaked');
    ok(itemTotal(after) === itemTotal(before),
      'M1 CONSERVATION: the trade changed the total item count');
    ok(after.sales === before.sales + 1 && after.tax === before.tax + tax,
      'M1: no receipt row, or the tax was not recorded');

    /* THE RECEIPT IS THE SERVER'S. Every field comes out of the locked listing
       row and the arithmetic that actually charged — the Edge Function renders
       it and must never build one from its own numbers. */
    ok(BigInt(r.bought.gold_gross) === gross && BigInt(r.bought.tax) === tax
       && BigInt(r.bought.each) === ASK && r.bought.item_id === ITEM,
      `M1: the server receipt does not describe the charge: ${JSON.stringify(r.bought)}`);
    ok(typeof r.bought.seller_name === 'string' && r.bought.seller_name.length > 0,
      'M1: the receipt carries no server-derived seller name');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M2 · THE SELLER'S NAME IS DERIVED, NOT SUPPLIED ═══════════════════
  try {
    const row = (await db.query(
      'select seller_name from public.market_listings limit 1')).rows[0];
    const prof = (await db.query(
      'select display_name from public.profiles where id = $1', [SELLER])).rows[0];
    if (row) {
      ok(row.seller_name === (prof ? prof.display_name : 'Adventurer'),
        'M2: seller_name does not match profiles.display_name — the impersonation hole is back');
    }
    /* And nothing about a listing is caller-supplied except item/qty/ask: the
       function signature has no name, no timestamp and no seller field at all.
       Asserted against the CATALOGUE rather than by reading the source. */
    const args = (await db.query(
      `select pg_get_function_arguments(p.oid) a from pg_proc p
         join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='hr_market_list'`)).rows[0].a;
    ok(!/name|posted|expires|seller_name/i.test(args),
      `M2: hr_market_list accepts a field it must derive: ${args}`);
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M3 · A CLIENT ROLE CANNOT REACH ANY OF IT ═════════════════════════
  try {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const r = (await db.query(
        `select has_function_privilege($1,
           'public.hr_market_buy(uuid,int,bigint,uuid,uuid,bigint)','execute') x`, [role])).rows[0].x;
      ok(r === false, `M3: ${role} can execute hr_market_buy — the browser could settle a trade`);
      const w = (await db.query(
        `select count(*)::int n from information_schema.role_table_grants
          where table_schema='public' and table_name in ('market_listings','market_sales')
            and grantee=$1 and privilege_type <> 'SELECT'`, [role])).rows[0].n;
      ok(w === 0, `M3: ${role} holds a write grant on a market table`);
    }
    const eng = (await db.query(
      `select has_table_privilege('hr_engine','public.market_listings','select') x`)).rows[0].x;
    ok(eng === false,
      'M3: hr_engine can read market_listings directly — it must reach these tables only through '
      + 'the three SECURITY DEFINER functions');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M4 · FORGED CALLER: a non-engine role cannot act for anyone else ══
  try {
    await db.exec(`select set_config('request.jwt.claim.sub','${BUYER}',false)`);
    const r = (await db.query(
      'select public.hr_market_list($1::uuid,0,0::bigint,$2::uuid,$3::text,1::bigint,1::bigint) r',
      [SELLER, uuid(), ITEM])).rows[0].r;
    ok(r && r.ok === false && r.error === 'forbidden_impersonation',
      `M4: a caller who is not the engine listed goods as another user: ${JSON.stringify(r)}`);
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M5 · A BIND-ON-PICKUP ITEM IS NOT MARKET GOODS (S3) ═══════════════
  try {
    await db.query(
      `insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,0,$2,10)
       on conflict (user_id, slot, item_id) do update set qty = 10`, [SELLER, BOP]);
    const r = await list({ user: SELLER, item: BOP, qty: 1n, ask: 1n });
    ok(r && r.ok === false && r.error === 'not_tradeable',
      `M5: a bind-on-pickup item (${BOP}) was listed: ${JSON.stringify(r)}`);
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M6 · EXACTLY ONCE UNDER REPLAY — the whole point of the key ═══════
  try {
    await stock();
    const l = await list({ user: SELLER, item: ITEM, qty: QTY, ask: ASK });
    ok(l.ok === true, 'M6: setup listing refused');
    const before = await snapshot(db, ITEM);
    const key = uuid();
    const v = await versionOf(BUYER);

    const a = await buy({ user: BUYER, listing: l.listed.listing_id, qty: QTY, key, version: v });
    ok(a.ok === true, `M6: first buy refused: ${JSON.stringify(a)}`);
    const mid = await snapshot(db, ITEM);

    /* THE REPLAY, with the ORIGINAL version — i.e. the honest shape of a retry
       whose first answer was lost. It must be answered, not re-applied. */
    const b = await buy({ user: BUYER, listing: l.listed.listing_id, qty: QTY, key, version: v });
    ok(b.replayed === true, `M6: a repeated intent id was not reported as a replay: ${JSON.stringify(b)}`);
    const after = await snapshot(db, ITEM);
    ok(after.buyer.gold === mid.buyer.gold && after.seller.gold === mid.seller.gold
       && after.buyer.item === mid.buyer.item,
      `M6: THE REPLAY MOVED VALUE. buyer ${mid.buyer.gold}->${after.buyer.gold}, `
      + `seller ${mid.seller.gold}->${after.seller.gold}, items ${mid.buyer.item}->${after.buyer.item}`);
    ok(after.sales === mid.sales, 'M6: the replay wrote a second receipt row');
    ok(goldTotal(after) === goldTotal(before) && itemTotal(after) === itemTotal(before),
      'M6: conservation broke across the replay');
    /* …and the replay still carries the envelope, because the client has to be
       able to settle its prediction from a replayed answer too. */
    ok(b.state && BigInt(b.state.gold) === after.buyer.gold,
      'M6: the replayed answer carries no current envelope — a client that retried would be left '
      + 'holding an unsettleable prediction, which is how a local offset becomes permanent');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M7 · ONE KEY, ONE MEANING (intent_mismatch) ═══════════════════════
  try {
    await stock();
    const key = uuid();
    const a = await list({ user: SELLER, item: ITEM, qty: 1n, ask: ASK, key });
    ok(a.ok === true, 'M7: setup listing refused');
    const b = await list({ user: SELLER, item: ITEM, qty: 2n, ask: ASK, key });
    ok(b.ok === false && b.error === 'intent_mismatch',
      `M7: the same key bought a DIFFERENT listing: ${JSON.stringify(b)} — hr_apply shares this key `
      + 'namespace, so a second set of rules in it is a key that means two things');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M8 · A STALE VERSION IS REFUSED, AND THE KEY IS RELEASED ══════════
  try {
    await stock();
    const l = await list({ user: SELLER, item: ITEM, qty: 1n, ask: ASK });
    const v = BigInt(await versionOf(BUYER));
    const key = uuid();
    const stale = await buy({ user: BUYER, listing: l.listed.listing_id, qty: 1n, key, version: v - 1n });
    ok(stale.ok === false && stale.error === 'version_conflict',
      `M8: a stale version was accepted: ${JSON.stringify(stale)}`);
    const held = (await db.query(
      'select count(*)::int n from public.player_intents where user_id=$1 and intent_id=$2',
      [BUYER, key])).rows[0].n;
    ok(held === 0,
      'M8: the key was NOT released after a version conflict (b346) — an ordinary concurrency '
      + 'outcome becomes a 25-hour lockout for that key, and the client is told to retry with a '
      + 'key the server will refuse');
    /* …and the retry with the CURRENT version, on the SAME key, now works. */
    const good = await buy({ user: BUYER, listing: l.listed.listing_id, qty: 1n, key });
    ok(good.ok === true, `M8: the released key could not be reused: ${JSON.stringify(good)}`);
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M9 · YOU CANNOT BUY YOUR OWN LISTING, AND IT IS JOURNALLED ════════
  try {
    await stock();
    const l = await list({ user: SELLER, item: ITEM, qty: 1n, ask: ASK });
    const r = await buy({ user: SELLER, listing: l.listed.listing_id, qty: 1n });
    ok(r.ok === false && r.error === 'own_listing', `M9: self-trade allowed: ${JSON.stringify(r)}`);
    const n = (await db.query(
      "select count(*)::int n from public.hr_rejections where code = 'own_listing'")).rows[0].n;
    ok(n > 0, 'M9: the wash-trading signature was refused SILENTLY — a refusal that leaves no trace '
      + 'is a refusal nobody can investigate');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M10 · THE ESCROW CANNOT BE COLLECTED TWICE — cancel then cancel ═══
  try {
    await stock();
    const l = await list({ user: SELLER, item: ITEM, qty: QTY, ask: ASK });
    const before = await snapshot(db, ITEM);
    const a = await cancel({ user: SELLER, listing: l.listed.listing_id });
    ok(a.ok === true, `M10: cancel refused: ${JSON.stringify(a)}`);
    const mid = await snapshot(db, ITEM);
    ok(mid.seller.item === before.seller.item + QTY, 'M10: cancel did not return the escrow');

    /* A SECOND cancel with a FRESH key — i.e. not the idempotency path, but two
       genuinely different intents both trying to collect one escrow. This is
       the property "cannot be double-collected" actually reduces to. */
    const b = await cancel({ user: SELLER, listing: l.listed.listing_id });
    ok(b.ok === false && b.error === 'gone',
      `M10: a second cancel of the same listing was accepted: ${JSON.stringify(b)}`);
    const after = await snapshot(db, ITEM);
    ok(after.seller.item === mid.seller.item,
      `M10: THE ESCROW WAS RETURNED TWICE (${mid.seller.item} -> ${after.seller.item})`);
    ok(itemTotal(after) === itemTotal(before), 'M10: conservation broke across the double cancel');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M11 · …AND ACROSS THE CANCEL/EXPIRE RACE ══════════════════════════
  try {
    await stock();
    const l = await list({ user: SELLER, item: ITEM, qty: QTY, ask: ASK });
    const before = await snapshot(db, ITEM);
    /* Age the listing so the expiry sweep will pick it up, THEN cancel it, THEN
       run the sweep. In production these interleave; here they are sequenced,
       which is the strictly harder case for a "read then delete" implementation
       because the row is already gone when the sweep looks. */
    await db.query(
      "update public.market_listings set expires_at = now() - interval '1 minute' where id = $1",
      [l.listed.listing_id]);
    const c = await cancel({ user: SELLER, listing: l.listed.listing_id });
    ok(c.ok === true, `M11: cancel refused: ${JSON.stringify(c)}`);
    const mid = await snapshot(db, ITEM);
    const n = (await db.query('select public.hr_market_expire(200) n')).rows[0].n;
    const after = await snapshot(db, ITEM);
    ok(after.seller.item === mid.seller.item,
      `M11: THE EXPIRY SWEEP RETURNED AN ALREADY-CANCELLED ESCROW (${mid.seller.item} -> `
      + `${after.seller.item}, sweep reported ${n}). The DELETE must be the arbiter, not a read `
      + 'followed by a delete');
    ok(itemTotal(after) === itemTotal(before), 'M11: conservation broke across cancel-then-expire');

    /* And the sweep on its own DOES return an escrow — otherwise the check
       above passes on a sweep that has stopped working entirely. */
    const l2 = await list({ user: SELLER, item: ITEM, qty: 3n, ask: ASK });
    const pre = await snapshot(db, ITEM);
    await db.query(
      "update public.market_listings set expires_at = now() - interval '1 minute' where id = $1",
      [l2.listed.listing_id]);
    await db.query('select public.hr_market_expire(200)');
    const post = await snapshot(db, ITEM);
    ok(post.seller.item === pre.seller.item + 3n,
      'M11 CONTROL: the expiry sweep returned nothing at all, so the double-return check above '
      + 'was asserting about a sweep that does not run');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M12 · THERE IS NO COLLECT STEP TO EXPLOIT ═════════════════════════
  try {
    const col = (await db.query(
      `select count(*)::int n from information_schema.columns
        where table_schema='public' and table_name='market_sales' and column_name='collected'`)).rows[0].n;
    ok(col === 0, 'M12: market_sales.collected is back — the collect-and-PATCH model, and with it '
      + 'the double-collect surface, has returned');
    const pol = (await db.query(
      `select count(*)::int n from pg_policies where schemaname='public'
        and tablename='market_sales' and cmd in ('UPDATE','ALL')`)).rows[0].n;
    ok(pol === 0, 'M12: market_sales has an UPDATE policy — the seller could PATCH a receipt');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M13 · A SALE DOES NOT CONSUME THE SELLER'S DAILY MINT BUDGET ══════
  try {
    await stock();
    const l = await list({ user: SELLER, item: ITEM, qty: QTY, ask: ASK });
    const b4 = (await db.query(
      `select coalesce(sum(gold_in),0)::text g from public.player_ledger
        where user_id=$1 and slot=0`, [SELLER])).rows[0].g;
    const r = await buy({ user: BUYER, listing: l.listed.listing_id, qty: QTY });
    ok(r.ok === true, `M13: buy refused: ${JSON.stringify(r)}`);
    const af = (await db.query(
      `select coalesce(sum(gold_in),0)::text g from public.player_ledger
        where user_id=$1 and slot=0`, [SELLER])).rows[0].g;
    ok(af === b4,
      `M13: the sale stamped ${BigInt(af) - BigInt(b4)} gold as the SELLER'S progression inflow. `
      + 'Market gold is conserved, not minted; charging it to the daily mint ceiling lets a '
      + 'stranger buy a seller\'s cheap listings and lock them out of their own accrual for the day');
    const meta = (await db.query(
      `select meta from public.player_ledger where user_id=$1 and slot=0
        and intent like 'market\\_sold:%' order by at desc limit 1`, [SELLER])).rows[0];
    ok(meta && meta.meta && meta.meta.transfer === true,
      'M13: the seller-side journal row is not stamped `transfer` — the audit cannot tell conserved '
      + 'gold from minted gold without it');
    ok(meta && meta.meta && meta.meta.counterparty === BUYER,
      'M13: the seller-side journal row does not name the counterparty, so an abuse investigation '
      + 'cannot follow the value');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M15 · INSUFFICIENT FUNDS AND INSUFFICIENT GOODS BOTH ROLL BACK ════
  try {
    await stock();
    const l = await list({ user: SELLER, item: ITEM, qty: QTY, ask: ASK });
    await db.query('update public.player_state set gold = 1 where user_id = $1', [BUYER]);
    const before = await snapshot(db, ITEM);
    const r = await buy({ user: BUYER, listing: l.listed.listing_id, qty: QTY });
    ok(r.ok === false && r.error === 'insufficient_gold',
      `M15: a broke buyer completed a trade: ${JSON.stringify(r)}`);
    const after = await snapshot(db, ITEM);
    ok(goldTotal(after) === goldTotal(before) && itemTotal(after) === itemTotal(before)
       && after.escrow === before.escrow,
      'M15: the refused purchase left partial effects — the listing, the delivery or the credit '
      + 'survived a rejection that is supposed to roll back in full');

    await stock();
    const over = await list({ user: SELLER, item: ITEM, qty: 100000n, ask: ASK });
    ok(over.ok === false && (over.error === 'insufficient_item' || over.error === 'listing_too_large'),
      `M15: a seller listed goods they do not have: ${JSON.stringify(over)}`);
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M16 · A LISTING IS NOT YOURS TO DISSOLVE ═════════════════════════
  try {
    await stock();
    const l = await list({ user: SELLER, item: ITEM, qty: QTY, ask: ASK });
    const before = await snapshot(db, ITEM);
    const r = await cancel({ user: BUYER, listing: l.listed.listing_id });
    ok(r.ok === false && (r.error === 'not_yours' || r.error === 'gone'),
      `M16: another player cancelled a listing that is not theirs: ${JSON.stringify(r)}`);
    const after = await snapshot(db, ITEM);
    ok(after.buyer.item === before.buyer.item,
      `M16: THE GOODS LANDED IN THE WRONG BAG (${before.buyer.item} -> ${after.buyer.item})`);
    ok(after.escrow === before.escrow, 'M16: the escrow was dissolved by a stranger');
    ok(itemTotal(after) === itemTotal(before), 'M16: conservation broke across a refused cancel');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M17 · S11 — A SELLER WITH NO STATE ROW REFUSES, IT DOES NOT ═══════
  //          DESTROY THE BUYER'S GOLD
  try {
    await stock();
    const l = await list({ user: SELLER, item: ITEM, qty: QTY, ask: ASK });
    /* The seller's character disappears between listing and sale. Contrived to
       reach, and the whole point: the superseded revision 1 debited the buyer,
       delivered the goods and credited NOBODY — gold destroyed, silently, with
       an ok:true answer. Money must not evaporate any more than it may be
       minted, and there is no other way to execute that branch. */
    await db.query('delete from public.player_state where user_id = $1 and slot = 0', [SELLER]);
    const before = await snapshot(db, ITEM);
    const r = await buy({ user: BUYER, listing: l.listed.listing_id, qty: QTY });
    ok(r.ok === false && r.error === 'seller_unavailable',
      `M17: a sale to a seller with no state row was accepted: ${JSON.stringify(r)}`);
    const after = await snapshot(db, ITEM);
    ok(after.buyer.gold === before.buyer.gold,
      `M17: THE BUYER'S GOLD WAS DESTROYED (${before.buyer.gold} -> ${after.buyer.gold}) paying a `
      + 'seller who does not exist');
    ok(after.buyer.item === before.buyer.item && after.escrow === before.escrow,
      'M17: the refused trade still delivered the goods');
    /* …and put the seller back, so a later leg is not measuring this hole. */
    await db.exec(`do $$ begin
      perform set_config('request.jwt.claim.sub', '${SELLER}', true);
      perform public.hr_create_character(0);
      perform set_config('request.jwt.claim.sub', '', true);
    end $$;`);
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M14 · THE PER-DAY TRANSFER FUSES BITE ═════════════════════════════
  try {
    /* Driven by moving the CEILING down to what this run can reach, rather than
       by executing a billion gold of trades. The clamp is read from a constant
       in the function, so the fuse is exercised by making the day's ledger
       exceed it — which is the same code path a real breach takes. */
    const cap = (await db.query(
      `select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='hr_market_buy'`)).rows[0].prosrc;
    const m = /c_max_spend_per_day\s+constant\s+bigint\s*:=\s*(\d+)/.exec(cap);
    ok(!!m, 'M14: the per-day spend clamp is not a named constant any more — a fuse nobody can '
      + 'find is a fuse nobody can audit');
    const limit = BigInt(m[1]);
    /* Plant a day's worth of spend in the append-only ledger, which is where the
       clamp reads from. Not a counter this function keeps — a counter is a
       second source of truth with a reset button. */
    await db.query(
      `insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in)
       values ($1, 0, 'trade', 'market_buy:planted:1', $2, 0, 0, 0, 0)`,
      [BUYER, (-limit).toString()]);
    await stock();
    const l = await list({ user: SELLER, item: ITEM, qty: 1n, ask: ASK });
    const before = await snapshot(db, ITEM);
    const r = await buy({ user: BUYER, listing: l.listed.listing_id, qty: 1n });
    ok(r.ok === false && r.error === 'market_spend_daily_cap',
      `M14: the per-day transfer fuse did not bite: ${JSON.stringify(r)}`);
    const after = await snapshot(db, ITEM);
    ok(goldTotal(after) === goldTotal(before) && itemTotal(after) === itemTotal(before),
      'M14: the refused trade still moved value — the protected block did not roll back in full');

    /* THE OTHER HALF OF THE FUSE — the SELLER side, which a buyer-side-only
       test can never see, and which is refused to the BUYER because the buyer
       is the caller. Named distinctly so a support ticket can tell "you have
       spent enough today" from "this seller has been paid enough today". */
    const mp = /c_max_proceeds_per_day\s+constant\s+bigint\s*:=\s*(\d+)/.exec(cap);
    ok(!!mp, 'M14: the per-day PROCEEDS clamp is not a named constant any more');
    await db.query(
      `insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in)
       values ($1, 0, 'trade', 'market_sold:planted:1', $2, 0, 0, 0, 0)`,
      [SELLER, mp[1]]);
    const l2 = await list({ user: SELLER, item: ITEM, qty: 1n, ask: ASK });
    const b2 = await snapshot(db, ITEM);
    /* A DIFFERENT buyer, because BUYER is now over the spend cap and would be
       refused for the wrong reason — which would read as a pass. */
    const THIRD = '00000000-0000-4000-ba55-000000000003';
    await db.exec(`
      insert into auth.users (id) values ('${THIRD}') on conflict (id) do nothing;
      do $$ begin
        perform set_config('request.jwt.claim.sub', '${THIRD}', true);
        perform public.hr_create_character(0);
        perform set_config('request.jwt.claim.sub', '', true);
      end $$;
      update public.player_state set gold = 1000000 where user_id = '${THIRD}';`);
    const r2 = await buy({ user: THIRD, listing: l2.listed.listing_id, qty: 1n });
    ok(r2.ok === false && r2.error === 'market_proceeds_daily_cap',
      `M14 SELLER SIDE: the per-day proceeds fuse did not bite: ${JSON.stringify(r2)}`);
    const a2 = await snapshot(db, ITEM);
    ok(a2.seller.gold === b2.seller.gold,
      'M14 SELLER SIDE: the refused trade still credited the seller');
    /* NOT cleaned up: player_ledger refuses a DELETE inside the retention
       window, which is the immutability trigger working. So this block runs
       LAST — a planted day's spend would otherwise make every later purchase
       by this buyer hit the same fuse and read as a different bug. */
  } catch (e) { if (!(e instanceof Red)) throw e; }

  await db.close?.();
  return fails;
}

// ── driver ──────────────────────────────────────────────────────────────
if (has('list')) {
  for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(28)} ${m.why}`);
  process.exit(0);
}

if (has('selftest')) {
  let slipped = 0;
  for (const id of Object.keys(MUTATIONS)) {
    let caught = false; let why = '';
    try {
      const f = await run(id);
      caught = f.length > 0;
      why = f[0] || '';
    } catch (e) {
      if (e.harness) { console.error(`  HARNESS  ${id}: ${e.message}`); process.exit(2); }
      caught = true; why = e.message;
    }
    if (caught) console.log(`  CAUGHT   ${id}\n             ${String(why).split('\n')[0]}`);
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
console.log('market-v2: 15 checks green — two players, both sides measured, conservation held');

/** Exported so tests/run-smoke.mjs runs this as one guard. */
export async function marketV2Guard() {
  const f = await run(null);
  return { name: 'market v2 (two-player transfer)', failures: f };
}
