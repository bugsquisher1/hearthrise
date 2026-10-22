#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/alpha-server.mjs — LANE S2'S SERVER HALF, PROVEN ON THE REAL CHAIN.
//
//   node tests/alpha-server.mjs            the guard (every arm)
//   node tests/alpha-server.mjs --mutate   every planted defect must be CAUGHT by its arm
//
// Ships with the eight 2026-10-25 S2 migrations (alpha catalogue, bag rules,
// shop supplies, hunt presets, account items + names, stamina refill,
// blessings, party invites). Each file's own §-self-check runs once, at apply;
// this adds what a self-check structurally cannot:
//   A-IDEM    every S2 file RE-APPLIES at chain end byte-identically (schema
//             inventory + every public body + the section and baseline rows);
//   A-DATA    one price, two readers: the edge's shop_buy catalogue
//             (src/data/shops.js -> catalogue.js GOLD_OFFERS: the tools) and
//             its supply price list (SUPPLY_PRICE_LIST, never sold) agree with
//             the SQL hr_shop_supply_offers row for row; the vendor never bids
//             more than half of one (buy-then-sell loses); the
//             SQL stamina and blessing prices equal the data's own functions
//             (stamina-refill.js refillPrice, blessings.js blessingPrice);
//   A-LOCK    the REAL edge verb vendor_sell_many refuses a locked item
//             (`item_locked`, hr_apply's, under the lock) and sells it unlocked;
//   A-NO-SUPPLY  the Shop sells no supplies (Tyler 2026-10-20,
//             2026-11-02-shop-no-supplies.sql): the `shop` section offers the
//             tools only and no refill; the refill and restock verbs are gone
//             for `authenticated`; the REAL edge shop_buy refuses a supply offer
//             (supplies_not_sold) and moves no gold, and sells the Bronze Axe at
//             its price. (The per-use store charge from the bar is
//             tests/hunt-sessions-settle.mjs STORE, unchanged.)
//   A-OUTFITTER  the Shop's gear (designer 2026-10-22, 2026-11-20-shop-outfitter.sql):
//             the section lists every gear row at its price, the REAL edge
//             shop_buy sells one (and two rings in one buy) with a `shop` ledger
//             row naming the unit, and the vendor pays at most half back.
//   A-LOOT-AWAY / A-LOOT-ATTENDED  the loot filter in the REAL settle (tick and
//             player door): sell = picked-up units x the vendor bid, as gold,
//             the pickups still tallied; ignore leaves them; a locked item is kept;
//   A-BLESS-AWAY / A-BLESS-ATTENDED  a blessed death in the REAL settle: the
//             death (one a hunt since the core rebuild) keeps loss − floor(loss x
//             permille / 1000) of its Level and skill price, the tiers are used up,
//             the saving journalled;
//   A-STAMINA a refill bought DURING a hunt (attended) raises the pool at the
//             session's settled_to, and the next settles run past the old end;
//   A-PARTY   invite by name -> accept -> the leader's one start enters both
//             members with their OWN bags, and the instance settles them; a kicked
//             hunter is ended `left` at its leave and the instance settles on
//             without it (Security reopen #2, 2026-10-29-party-security.sql).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, inventory, LAST_PATCHED, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';

const MUTATE = process.argv.includes('--mutate');
const FN = join('supabase', 'functions', 'hr-accrue');
const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);
export const S2_FILES = Object.freeze(['2026-10-25-drinks-catalogue.generated.sql', '2026-10-25-hunt-sessions-catalogue.generated.sql',
  '2026-10-25-alpha-catalogue.generated.sql', '2026-10-25-bag-rules.sql', '2026-10-25-shop-supplies.sql',
  '2026-10-25-hunt-presets.sql', '2026-10-25-account-items.sql', '2026-10-25-stamina-refill.sql', '2026-10-25-blessings.sql',
  '2026-10-25-party-invites.sql', '2026-10-25-settle-hooks.sql']);
const idem = () => crypto.randomUUID();

async function harness() {
  const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
  const u = (p) => pathToFileURL(join(ROOT, p)).href;
  const M = await H.loadEdge(ROOT);
  const X = {
    VS: await import(u(join(FN, 'vendor-sell.js'))), SB: await import(u(join(FN, 'shop-buy.js'))),
    CAT: await import(u(join(FN, 'catalogue.js'))), SR: await import(u('src/data/stamina-refill.js')),
    BL: await import(u('src/data/blessings.js')), SUP: await import(u('src/data/supply-basics.js')), SHOPS: await import(u('src/data/shops.js')),
    GEN: await import(u('tools/gen-alpha-catalogue.mjs')),
  };
  return { H, M, X };
}

/* As PostgREST calls it: the JWT subject set, `set role authenticated`. */
async function asAuth(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  finally { await db.exec('reset role'); }
}
const gold = async (H, db, uid) => Number(await H.one(db, 'select gold from public.player_state where user_id = $1 and slot = 0', [uid]));
const qty = async (H, db, uid, item) => Number(await H.one(db, 'select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)', [uid, item]));

// ═══════════════════════════════════════════════════════════════════════
const ARMS = {
  'A-IDEM': async (db0) => {
    /* At the S2 files' OWN position (a boot up to the last of them): the core rebuild later drops columns
       the S2 catalogues name (hr_start_kit.max_hp), so a chain-end re-apply is refused for that reason. */
    const { db } = await bootReplay({ upTo: S2_FILES[S2_FILES.length - 1] });
    try {
    const bodies = async () => JSON.stringify((await db.query(`select p.oid::regprocedure::text as f, md5(p.prosrc) as h, coalesce(p.proacl::text, '') as acl
      from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`)).rows);
    const rows = async () => JSON.stringify([(await db.query('select key, fn, note from public.hr_state_sections order by key')).rows,
      (await db.query('select proname, identity_args, grantee, note from public.hr_client_rpc_baseline order by 1, 2, 3')).rows]);
    const before = JSON.stringify([await inventory(db), await bodies(), await rows()]);
    for (const f of S2_FILES) {
      try { await db.exec(readFileSync(MIG(f), 'utf8').replace(/\r\n/g, '\n')); }
      catch (e) { return [`the second apply of ${f} RAISED: ${String(e.message).split('\n')[0]}`]; }
    }
    const after = JSON.stringify([await inventory(db), await bodies(), await rows()]);
    return before === after ? [] : ['a second apply of the S2 files moved the schema, a body, a section row or a baseline row'];
    } finally { await db.close().catch(() => {}); }
  },

  'A-DATA': async (db, { H, M, X }) => {
    const p = [];
    try { X.GEN.supplyRows(); } catch (e) { p.push('the shipped supply rows are refused: ' + e.message); }
    const sql = await H.q(db, 'select offer_id, item_id, kind, price from public.hr_shop_supply_offers order by offer_id');
    if (sql.length !== X.SUP.SUPPLY_SHOP_OFFERS.length) p.push(`hr_shop_supply_offers has ${sql.length} rows, the data ${X.SUP.SUPPLY_SHOP_OFFERS.length}`);
    const listed = Object.fromEntries(X.SHOPS.SUPPLY_PRICE_LIST.map((o) => [o.id, o]));
    for (const r of sql) {
      /* A tool or a gear piece is a shop_buy offer; a supply is only a price (the vendor's cap), refused by name. */
      const sold = X.SUP.SHOP_SOLD_KINDS.includes(r.kind);
      const edge = sold ? X.CAT.GOLD_OFFERS[r.offer_id] : listed[r.offer_id] && { gold: listed[r.offer_id].cost[0].amount, grant: listed[r.offer_id].grant };
      if (!edge || edge.gold !== Number(r.price) || edge.grant.length !== 1 || edge.grant[0].id !== r.item_id || edge.grant[0].amount !== 1) {
        p.push(`${r.offer_id}: SQL ${r.price} g vs edge ${JSON.stringify(edge)}`);
      }
      if (!sold && (X.CAT.GOLD_OFFERS[r.offer_id] || X.CAT.OFFER_REFUSALS[r.offer_id] !== 'supplies_not_sold')) p.push(`${r.offer_id}: a supply is sold by shop_buy`);
      /* One item, one price: no other authored offer sells a tool or gear piece (the legacy equip.* rows it replaced are gone). */
      if (sold) for (const o of X.SHOPS.SHOP_OFFERS) if (o.id !== r.offer_id && (o.grant || []).some((g) => g.kind === 'item' && g.id === r.item_id)) p.push(`${r.item_id}: also sold by ${o.id}`);
      const bid = X.CAT.vendorPriceOf(M.ITEMS, r.item_id);
      if (bid * 2 > Number(r.price)) p.push(`${r.item_id}: the vendor bids ${bid}, more than half its shop price ${r.price}`);
      const sqlBid = await H.one(db, 'select unit from public.hr_hunt_vendor_value where item_id = $1', [r.item_id]);
      if (sqlBid != null && Number(sqlBid) !== bid) p.push(`${r.item_id}: SQL vendor bid ${sqlBid} vs edge ${bid}`);
    }
    // The SQL formulas are the data's own functions (each judged where its file is in the chain).
    const has = async (fn) => (await H.one(db, 'select to_regprocedure($1) is not null', [fn])) === true;
    if (await has('public.hr_blessing_price(integer,integer)')) for (const lv of [1, 29, 30, 31, 60, 120]) for (const t of [1, 2, 3]) {
      const s = Number(await H.one(db, 'select public.hr_blessing_price($1, $2)', [t, lv]));
      if (s !== X.BL.blessingPrice(t, lv)) p.push(`blessing tier ${t} at level ${lv}: SQL ${s} vs data ${X.BL.blessingPrice(t, lv)}`);
    }
    if (!(await has('public.hr_stamina_refill_quote(uuid,integer)'))) return p;
    const uid = H.UIDS[3];
    await H.character(db, M, uid, { inv: {} });
    /* In rising order of purchases made today: the ledger is append-only, so each case adds rows. */
    let made = 0;
    for (const [lv, cur, bought, prem] of [[1, 0, 0, false], [3, 479, 0, false], [10, 360, 1, false], [50, 300, 2, true], [3, 400, 5, false]]) {
      /* The refill is priced on the character's LEVEL (Level XP, kills only — the core rebuild). */
      await db.query('update public.player_state set level_xp = $2 where user_id = $1 and slot = 0', [uid, M.XP.charXpForLevel(lv)]);
      await db.query(`update public.player_state set premium_until = case when $3 then now() + interval '1 day' end, stamina_ms = $2::bigint * 60000, stamina_at = now()
                       where user_id = $1 and slot = 0`, [uid, cur, prem]);
      for (; made < bought; made++) await db.query("insert into public.player_ledger (user_id, slot, kind, intent, gold, meta) values ($1, 0, 'shop', 'stamina_refill:1', -1, '{}')", [uid]);
      const q = await H.one(db, 'select public.hr_stamina_refill_quote($1, 0)', [uid]);
      const cap = Number(q.max_ms) / 60000;
      const want = X.SR.refillPrice({ level: q.level, currentMin: cur, capMin: cap, boughtToday: bought });
      if ((want === null) !== (q.available === false) || (want && (want.price !== Number(q.price) || want.restoredMin * 60000 !== Number(q.restore_ms) || want.n !== q.n))) {
        p.push(`stamina refill (level ${lv}, ${cur} min, bought ${bought}, premium ${prem}): SQL ${JSON.stringify(q)} vs data ${JSON.stringify(want)}`);
      }
    }
    return p;
  },

  'A-LOCK': async (db, { H, M, X }) => {
    const p = [];
    const uid = H.UIDS[0];
    const item = String(await H.one(db, "select item_id from public.hr_hunt_vendor_value where item_id like 'rat%' or item_id = 'bones' order by unit desc limit 1"));
    await H.character(db, M, uid, { inv: { [item]: 5 } });
    if ((await asAuth(db, uid, 'select public.hr_item_lock(0, $1, true, $2::uuid)', [item, idem()])).ok !== true) return ['CONTROL: the lock was refused'];
    const exec = H.makeExec(db);
    const sell = () => X.VS.runVendorSellMany({ exec, user: uid, slot: 0, intentId: idem(), lines: [{ item, qty: 2 }] });
    const g0 = await gold(H, db, uid);
    const r1 = await sell();
    if (!r1.body || r1.body.error !== 'item_locked') p.push('vendor_sell_many of a locked item answered ' + JSON.stringify(r1.body && { ok: r1.body.ok, error: r1.body.error }));
    const r0 = await X.VS.runVendorSell({ exec, user: uid, slot: 0, intentId: idem(), item, qty: 1 });
    if (!r0.body || r0.body.error !== 'item_locked') p.push('vendor_sell of a locked item answered ' + JSON.stringify(r0.body && { ok: r0.body.ok, error: r0.body.error }));
    if (await qty(H, db, uid, item) !== 5 || await gold(H, db, uid) !== g0) p.push('a refused locked sale moved the bag or the purse');
    await asAuth(db, uid, 'select public.hr_item_lock(0, $1, false, $2::uuid)', [item, idem()]);
    const r2 = await sell();
    if (!r2.body || r2.body.ok !== true || await qty(H, db, uid, item) !== 3 || await gold(H, db, uid) !== g0 + 2 * X.CAT.vendorPriceOf(M.ITEMS, item)) {
      p.push('the unlocked sale answered ' + JSON.stringify(r2.body && { ok: r2.body.ok, error: r2.body.error }));
    }
    return p;
  },

  'A-NO-SUPPLY': async (db, { H, M, X }) => {
    const p = [];
    const uid = H.UIDS[0];
    const food = X.SUP.SUPPLY_SHOP_OFFERS.find((o) => o.kind === 'food');
    const axe = X.SUP.SUPPLY_SHOP_OFFERS.find((o) => o.item === 'bronze_axe');
    await H.character(db, M, uid, { inv: {}, gold: 100000 });
    const shop = await H.one(db, "select public.hr_state_of($1, 0)->'shop'", [uid]);
    const kinds = new Set((shop && shop.offers || []).map((o) => o.kind));
    /* Tools and the outfitter's gear (2026-11-20-shop-outfitter.sql), nothing else. */
    if (!shop || 'refill' in shop || kinds.size !== 2 || !kinds.has('tool') || !kinds.has('gear')) p.push('the shop section reads ' + JSON.stringify(shop).slice(0, 200));
    /* The doors are gone, not merely broken: no function a client could reach (a call that fails inside is still a door). */
    for (const fn of ['public.hr_shop_refill(integer,bigint,uuid)', 'public.hr_shop_refill_quote(uuid,integer)', 'public.hr_restock_set(integer,jsonb,uuid)']) {
      if (await H.one(db, 'select to_regprocedure($1) is not null', [fn])) p.push(fn + ' still exists');
    }
    const exec = H.makeExec(db);
    const g0 = await gold(H, db, uid);
    const r = await X.SB.runShopBuy({ exec, user: uid, slot: 0, intentId: idem(), offer: food.offer, qty: 2 });
    if (!r.body || r.body.ok === true || r.body.reason !== 'supplies_not_sold') p.push('shop_buy of a supply answered ' + JSON.stringify(r.body).slice(0, 200));
    if (await gold(H, db, uid) !== g0 || await qty(H, db, uid, food.item) !== 0) p.push('a refused supply purchase moved the purse or the bag');
    const t = await X.SB.runShopBuy({ exec, user: uid, slot: 0, intentId: idem(), offer: axe.offer, qty: 1 });
    if (!t.body || t.body.ok !== true || await gold(H, db, uid) !== g0 - axe.price || await qty(H, db, uid, 'bronze_axe') !== 1) {
      p.push('CONTROL: the Bronze Axe did not sell at its price: ' + JSON.stringify(t.body && { ok: t.body.ok, error: t.body.error }));
    }
    return p;
  },

  /* THE OUTFITTER (designer 2026-10-22, 2026-11-20-shop-outfitter.sql): the `shop` section lists every gear row at
     its catalogue price; the REAL edge shop_buy sells one at that price (one `shop` ledger row naming the unit), two
     rings in one buy; and selling a piece straight back to the vendor returns at most half: buy-then-sell loses. */
  'A-OUTFITTER': async (db, { H, M, X }) => {
    const p = [];
    const uid = H.UIDS[1];
    const gear = X.SUP.SUPPLY_SHOP_OFFERS.filter((o) => o.kind === 'gear');
    if (gear.length < 6) return ['CONTROL: the data holds ' + gear.length + ' gear rows'];
    await H.character(db, M, uid, { inv: {}, gold: 5000 });
    const shop = await H.one(db, "select public.hr_state_of($1, 0)->'shop'", [uid]);
    const listed = new Map((shop && shop.offers || []).filter((o) => o.kind === 'gear').map((o) => [o.offer, Number(o.price)]));
    for (const g of gear) if (listed.get(g.offer) !== g.price) p.push(`${g.offer}: the shop section lists ${listed.get(g.offer)}, the data ${g.price}`);
    const exec = H.makeExec(db);
    const gloves = gear.find((o) => o.item === 'bronze_gauntlets'), ring = gear.find((o) => o.item === 'copper_ring');
    const g0 = await gold(H, db, uid);
    const b1 = await X.SB.runShopBuy({ exec, user: uid, slot: 0, intentId: idem(), offer: gloves.offer, qty: 1 });
    const b2 = await X.SB.runShopBuy({ exec, user: uid, slot: 0, intentId: idem(), offer: ring.offer, qty: 2 });
    if (!b1.body || b1.body.ok !== true || !b2.body || b2.body.ok !== true) return ['the outfitter did not sell: ' + JSON.stringify([b1.body && b1.body.error, b2.body && b2.body.error])];
    const g1 = await gold(H, db, uid);
    if (g1 !== g0 - gloves.price - 2 * ring.price || await qty(H, db, uid, gloves.item) !== 1 || await qty(H, db, uid, ring.item) !== 2) {
      p.push(`the buys moved gold ${g0} -> ${g1} (want -${gloves.price + 2 * ring.price}) and the bag to ${await qty(H, db, uid, gloves.item)} / ${await qty(H, db, uid, ring.item)}`);
    }
    const led = await H.q(db, "select gold, meta from public.player_ledger where user_id = $1 and slot = 0 and kind = 'shop' order by id", [uid]);
    if (led.length !== 2 || Number(led[0].meta.unit_gold) !== gloves.price || Number(led[1].meta.unit_gold) !== ring.price) p.push('the ledger reads ' + JSON.stringify(led));
    const s = await X.VS.runVendorSell({ exec, user: uid, slot: 0, intentId: idem(), item: gloves.item, qty: 1 });
    const back = (await gold(H, db, uid)) - g1;
    if (!s.body || s.body.ok !== true || back <= 0 || back * 2 > gloves.price) p.push(`selling the ${gloves.item} back paid ${back} for a ${gloves.price} g buy (${JSON.stringify(s.body && s.body.error)})`);
    return p;
  },

  'A-LOOT-AWAY': (db, ctx) => lootArm(db, ctx, false),
  'A-LOOT-ATTENDED': (db, ctx) => lootArm(db, ctx, true),
  'A-BLESS-AWAY': (db, ctx) => blessArm(db, ctx, false),
  'A-BLESS-ATTENDED': (db, ctx) => blessArm(db, ctx, true),

  'A-STAMINA': async (db, { H, M }) => {
    const p = [];
    const uid = H.UIDS[0];
    const h = await H.hunter(db, M, { ...H.STRONG, minutesAgo: 10, stamina: 4 * 60000 });
    const tick = H.ticksOf(30000, 3 * 60000)(h.from);
    for (const t of tick) await H.settleTo(db, M, t);
    const q = await H.one(db, 'select public.hr_stamina_refill_quote($1, 0)', [uid]);
    if (!q || q.available !== true) return ['CONTROL: no refill is quoted mid-hunt: ' + JSON.stringify(q)];
    const at = await H.one(db, 'select settled_to from public.hunt_sessions where id = $1', [h.sid]);
    const g0 = await gold(H, db, uid);
    const r = await asAuth(db, uid, 'select public.hr_stamina_refill(0, $1, $2::uuid)', [Number(q.price), idem()]);
    if (!r || r.ok !== true) return ['the mid-hunt refill answered ' + JSON.stringify(r)];
    const st = (await H.q(db, 'select stamina_ms, stamina_at from public.player_state where user_id = $1 and slot = 0', [uid]))[0];
    if (String(st.stamina_at) !== String(at) || Number(st.stamina_ms) !== Number(q.ms) + Number(q.restore_ms)) {
      p.push(`the pool was written as ${JSON.stringify(st)}, not ${Number(q.ms) + Number(q.restore_ms)} at ${at}`);
    }
    if (await gold(H, db, uid) !== g0 - Number(q.price)) p.push('the refill did not charge its quote');
    /* The next windows settle from the raised pool, past the old 4-minute end. */
    for (const t of H.ticksOf(30000, 5 * 60000)(h.from + 3 * 60000)) await H.settleTo(db, M, t);
    const s = (await H.q(db, 'select ended_at, end_reason from public.hunt_sessions where id = $1', [h.sid]))[0];
    if (s.ended_at !== null) p.push('the hunt ended (' + s.end_reason + ') although the refill raised the pool past the window');
    return p;
  },

  'A-PARTY': async (db, { H, M }) => {
    const p = [];
    const [a, b] = H.UIDS;
    const food = 'cooked_shrimp';
    await H.hunter(db, M, { ...H.STRONG, bag: [] });   // installs the ground and the config; its own session is left
    await db.query("select public.hr_hunt_close(id, 'left', now(), true) from public.hunt_sessions where user_id = $1 and ended_at is null", [a]);
    await H.character(db, M, b, { ...H.STRONG });
    await db.query('update public.player_inventory set qty = 30 where user_id = any ($1::uuid[]) and slot = 0 and item_id = $2', [[a, b], food]);
    await db.query('delete from public.hr_rate_counters');
    const ok = async (uid, sql, params) => { const r = await asAuth(db, uid, sql, params); if (!r || r.ok !== true) throw new Error(sql.slice(7, 40) + ' refused: ' + JSON.stringify(r)); return r; };
    await ok(a, 'select public.hr_character_name_set(0, $1, $2::uuid)', ['Party Leader', idem()]);
    await ok(b, 'select public.hr_character_name_set(0, $1, $2::uuid)', ['Party Member', idem()]);
    /* The first invite makes the party (2026-10-28-party-flow.sql): the inviter leads, the ground is picked at Start. */
    await ok(a, 'select public.hr_hunt_party_invite(0, $1, $2::uuid)', ['party member', idem()]);
    const pid = await H.one(db, 'select public.hr_hunt_party_of($1, 0)', [a]);
    const inv = await H.one(db, "select public.hr_state_of($1, 0)->'party_invites'", [b]);
    if (!Array.isArray(inv) || inv.length !== 1 || inv[0].from !== 'Party Leader') return ['the invitee sees ' + JSON.stringify(inv)];
    await ok(b, 'select public.hr_hunt_party_accept(0, $1::uuid, $2::uuid)', [inv[0].id, idem()]);
    /* Each member packs its OWN supplies, whole stacks (2026-11-02-shop-no-supplies.sql hr_hunt_saved_bag). */
    await db.query('update public.player_inventory set qty = case when user_id = $1 then 12 else 7 end where user_id = any ($2::uuid[]) and slot = 0 and item_id = $3', [a, [a, b], food]);
    const st = await ok(a, "select public.hr_hunt_party_start(0, 'mill_cellar', $1::uuid)", [idem()]);
    if (st.entered !== 2) p.push('the start entered ' + st.entered);
    const bags = await H.q(db, `select h.user_id, b.qty_loaded from public.hunt_sessions h join public.hunt_bag b on b.session_id = h.id
                                 where h.instance_id = $1 and h.ended_at is null and b.item_id = $2`, [pid, food]);
    const bagOf = (u) => Number((bags.find((x) => x.user_id === u) || {}).qty_loaded);
    if (bagOf(a) !== 12 || bagOf(b) !== 7) p.push(`the members' bags are ${JSON.stringify(bags)}, not their own 12 / 7`);
    if (await qty(H, db, a, food) !== 0 || await qty(H, db, b, food) !== 0) p.push('a bag was not taken from its own member');
    /* The instance settles both (client closed): backdate the arrival, tick three minutes. */
    const t = "date_trunc('second', now() - interval '6 minutes')";
    await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t}
                     where instance_id = $1 and ended_at is null`, [pid]);
    await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [pid]);
    const from = Number(await H.one(db, 'select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1', [pid]));
    for (const at of H.ticksOf(30000, 3 * 60000)(from)) await H.settleTo(db, M, at, { user: a });
    const swings = await H.q(db, 'select user_id, swing_index from public.hunt_sessions where instance_id = $1 and ended_at is null', [pid]);
    if (swings.length !== 2 || swings.some((s) => !(Number(s.swing_index) > 0))) p.push('the instance did not settle both members: ' + JSON.stringify(swings));
    /* SECURITY REOPEN #2 (2026-10-29-party-security.sql): the leader kicks the HUNTING member. Minutes behind the
       clock, its session gets leave_at; the next settle ends it `left` there, and the instance settles on with the
       leader alone, so the kicked member is in no later split. */
    await db.query('delete from public.hr_rate_counters');
    const sb = await H.one(db, 'select id from public.hunt_sessions where instance_id = $1 and user_id = $2 and ended_at is null', [pid, b]);
    const seatB = await H.one(db, 'select seat from public.hunt_party_members where party_id = $1 and user_id = $2', [pid, b]);
    const k = await ok(a, 'select public.hr_hunt_party_kick(0, $1, $2::uuid)', [seatB, idem()]);
    if (k.leaving !== true || await H.one(db, 'select public.hr_hunt_party_of($1, 0)', [b])) p.push('the kick did not take the hunter out: ' + JSON.stringify(k));
    /* One transaction has one now(): the kick is put a minute back, so the settles below cross its leave and the
       boundary after it (the engine ends a hunt at the first swing boundary at or past leave_at). */
    await db.query("update public.hunt_sessions set leave_at = leave_at - interval '60 seconds' where id = $1 and leave_at is not null", [sb]);
    const nowMs = Number(await H.one(db, 'select floor(extract(epoch from now()) * 1000)::bigint'));
    const from2 = Number(await H.one(db, 'select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1', [pid]));
    for (const at of [...H.ticksOf(30000, 4 * 60000)(from2).filter((x) => x < nowMs), nowMs]) await H.settleTo(db, M, at, { user: a });
    const end = (await H.q(db, 'select ended_at, end_reason, leave_at, settled_to from public.hunt_sessions where id = $1', [sb]))[0];
    if (!end || end.ended_at === null || end.end_reason !== 'left' || (end.leave_at && new Date(end.settled_to) > new Date(end.leave_at))) {
      p.push('the kicked hunter was not ended at its leave: ' + JSON.stringify(end));
    }
    const open = await H.q(db, 'select user_id from public.hunt_sessions where instance_id = $1 and ended_at is null', [pid]);
    if (open.length !== 1 || open[0].user_id !== a) p.push('after the kick the instance holds ' + JSON.stringify(open) + ', want the leader alone');
    return p;
  },
};

/* THE LOOT FILTER IN THE SETTLE: run A with no rule, read what it picked up; run B with sell / ignore / sell+lock. */
async function lootArm(db, { H, M }, attended) {
  const p = [];
  const uid = H.UIDS[0];
  const h = await H.hunter(db, M, { ...H.STRONG, minutesAgo: 14 });
  const cuts = H.ticksOf(90000, 12 * 60000)(h.from);
  const go = async () => {
    for (const t of cuts) {
      if (attended) {
        const v = await M.HS.settleHunt({ exec: H.makeExec(db), user: uid, slot: 0, mode: 'settle', bucket: null, project: true,
          grounds: H.groundsOf(M), atMs: t, minWindowMs: 0 });
        if (!v || v.status !== 200 || !v.body || v.body.ok !== true) throw new Error('the player-door settle answered ' + JSON.stringify(v && v.body && { ok: v.body.ok, error: v.body.error }));
      } else await H.settleTo(db, M, t);
    }
    return {
      gold: await gold(H, db, uid),
      inv: (await H.one(db, 'select coalesce(jsonb_object_agg(item_id, qty), \'{}\') from public.player_inventory where user_id = $1 and slot = 0', [uid])) || {},
      loot: (await H.one(db, 'select loot from public.hunt_session_tally where session_id = $1', [h.sid])) || {},
      sold: await H.q(db, "select gold, gold_in, meta from public.player_ledger where user_id = $1 and intent = 'loot_sell' order by id", [uid]),
      left: await H.q(db, "select qty, meta from public.player_ledger where user_id = $1 and intent = 'loot_ignore' order by id", [uid]),
    };
  };
  await db.query('savepoint s2_loot');
  const A = await go();
  await db.query('rollback to savepoint s2_loot');
  const drops = Object.keys(A.loot).filter((k) => Number(A.loot[k]) >= 1).sort();
  const priced = [];
  for (const k of drops) if (await H.one(db, 'select unit from public.hr_hunt_vendor_value where item_id = $1', [k]) != null) priced.push(k);
  if (priced.length < 2) return [`CONTROL: the hunt picked up ${drops.length} item kinds (${priced.length} the vendor buys); need 2`];
  const [sellIt, ignoreIt, keepIt] = [priced[0], priced[1], priced[2] || null];
  await db.query('delete from public.hr_rate_counters');
  const set = (sql, params) => asAuth(db, uid, sql, params);
  await set("select public.hr_loot_rule_set(0, $1, 'sell', $2::uuid)", [sellIt, idem()]);
  await set("select public.hr_loot_rule_set(0, $1, 'ignore', $2::uuid)", [ignoreIt, idem()]);
  if (keepIt) {
    await set("select public.hr_loot_rule_set(0, $1, 'sell', $2::uuid)", [keepIt, idem()]);
    await set('select public.hr_item_lock(0, $1, true, $2::uuid)', [keepIt, idem()]);
  }
  const B = await go();
  const unit = Number(await H.one(db, 'select unit from public.hr_hunt_vendor_value where item_id = $1', [sellIt]));
  const soldQ = B.sold.reduce((a, r) => a + Number(((r.meta.items || {})[sellIt] || {}).qty || 0), 0);
  const soldG = B.sold.reduce((a, r) => a + Number(r.gold), 0);
  const leftQ = B.left.reduce((a, r) => a + Number((r.meta.items || {})[ignoreIt] || 0), 0);
  if (JSON.stringify(B.loot) !== JSON.stringify(A.loot)) p.push('the pickups changed with the rules: ' + JSON.stringify({ A: A.loot, B: B.loot }));
  if (soldQ !== Number(A.loot[sellIt])) p.push(`${sellIt}: sold ${soldQ} of ${A.loot[sellIt]} picked up`);
  if (soldG !== soldQ * unit || B.sold.some((r) => Number(r.gold_in) !== Number(r.gold))) p.push(`${sellIt}: ${soldG} g for ${soldQ} at ${unit} (gold_in stamped: ${B.sold.map((r) => r.gold_in)})`);
  if (B.gold - A.gold !== soldG) p.push(`the purse moved ${B.gold - A.gold}, the sales ${soldG}`);
  if (Number(B.inv[sellIt] || 0) !== Number(A.inv[sellIt] || 0) - soldQ) p.push(`${sellIt}: bag ${B.inv[sellIt]} vs ${A.inv[sellIt]} - ${soldQ}`);
  if (leftQ !== Number(A.loot[ignoreIt]) || Number(B.inv[ignoreIt] || 0) !== Number(A.inv[ignoreIt] || 0) - leftQ) p.push(`${ignoreIt}: left ${leftQ} of ${A.loot[ignoreIt]}, bag ${B.inv[ignoreIt]} vs ${A.inv[ignoreIt]}`);
  if (keepIt && Number(B.inv[keepIt] || 0) !== Number(A.inv[keepIt] || 0)) p.push(`${keepIt}: a LOCKED item was taken by its rule`);
  return p;
}

/* A BLESSED DEATH IN THE SETTLE: every tier held since before the hunt; the death (one a hunt, the core
   rebuild) keeps only the unprotected share of its Level and skill price. The doomed hero is the settle
   harness's DOOMED (a Level-5 hero part-way into its Level and skills, on the ghoul ground). */
async function blessArm(db, { H, M }, attended) {
  const p = [];
  const uid = H.UIDS[0];
  const h = await H.hunter(db, M, H.DOOMED);
  await db.query(`insert into public.player_blessings (user_id, slot, tier, paid, bought_at) select $1, 0, t.tier, 0, now() - interval '2 days'
                   from public.hr_blessing_tiers t`, [uid]);
  const pm = Number(await H.one(db, 'select max(permille) from public.hr_blessing_tiers'));
  const raws = [];
  for (const t of H.ticksOf(attended ? 90000 : 20 * 60000, 20 * 60000)(h.from)) {
    if (attended) {
      const v = await M.HS.settleHunt({ exec: H.makeExec(db), user: uid, slot: 0, mode: 'settle', bucket: null, project: true,
        grounds: H.groundsOf(M), atMs: t, minWindowMs: 0 });
      if (!v || v.status !== 200 || !v.body || v.body.ok !== true) break;
    } else {
      const r = await H.settleTo(db, M, t, { tamper: (c) => { raws.push(JSON.parse(JSON.stringify(c.members[0].hunt.death_xp || []))); } });
      if (r.skipped) break;
      if (!r.res || r.res.ok !== true) { p.push('a settle with blessings held was refused: ' + JSON.stringify(r.res).slice(0, 300)); break; }
    }
  }
  const deaths = await H.q(db, "select data from public.hunt_session_events where session_id = $1 and type = 'death' order by id", [h.sid]);
  if (deaths.length !== 1) return [`CONTROL: the doomed hero died ${deaths.length} time(s), want once`];
  const used = await H.q(db, "select meta from public.player_ledger where user_id = $1 and intent = 'blessing_used'", [uid]);
  if (used.length !== 1) p.push(`${used.length} blessing_used rows (want 1: the death uses every tier)`);
  if (Number(await H.one(db, 'select count(*) from public.player_blessings where user_id = $1', [uid])) !== 0) p.push('the blessings were not used up');
  const saved = (used[0] && used[0].meta.saved) || {};
  const kept = deaths[0].data.xp_lost || {};
  for (const [k, n] of Object.entries(kept)) {
    const raw = Number(n) + Number(saved[k] || 0);
    if (Number(saved[k] || 0) !== Math.floor(raw * pm / 1000)) p.push(`${k}: the death saved ${saved[k] || 0} of ${raw}, not floor(${raw} x ${pm}/1000)`);
  }
  if (!Object.values(saved).some((n) => Number(n) > 0)) p.push('the blessing saved no XP: ' + JSON.stringify({ kept, saved }));
  if (!attended) {
    /* The debit journalled is exactly the death's unprotected share. */
    const dx = raws.find((d) => d.length);
    const rows = await H.q(db, "select meta->'xp' as xp from public.player_ledger where session_id = $1 and intent = 'death_xp' order by id", [h.sid]);
    if (!dx) p.push('CONTROL: no settled window carried the death');
    else {
      const want = {};
      for (const [k, n] of Object.entries(dx[0])) if (Number(n) > 0) want[k] = Number(n) - Math.floor(Number(n) * pm / 1000);
      const got = rows[0] ? rows[0].xp : null;
      for (const [k, v] of Object.entries(want)) if (v > 0 && Number((got || {})[k] || 0) !== v) p.push(`${k} debited ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
  }
  return p;
}

// ═══════════════════════════════════════════════════════════════════════
/* Each mutant: the file, its [find, replace], the arm that must go red. The file's own
   self-check is turned into an uncalled function so the defect reaches the arm. */
const MUTANTS = [
  { arm: 'A-LOCK', file: '2026-10-27-core-bodies.sql', why: 'hr_apply no longer refuses a locked sale',
    find: "        if v_n < 0 and coalesce(v_this_intent, '') ~ '^vendor_sell(_many)?(:|$)' and public.hr_item_locked(v_uid, v_slot, k) then",
    repl: "        if false and coalesce(v_this_intent, '') ~ '^vendor_sell(_many)?(:|$)' and public.hr_item_locked(v_uid, v_slot, k) then" },
  /* hr_hunt_apply_member is RESTATED by the core rebuild (2026-10-27-core-bodies.sql):
     their mutants are planted in the bodies that run. */
  { arm: 'A-LOOT-AWAY', file: '2026-10-27-core-bodies.sql', why: 'the settle no longer runs the loot filter',
    find: "  v_loot := public.hr_hunt_loot_rules(p_user, p_slot, p_session, p_intent, p_delta->'items', v_to);", repl: '  v_loot := null;' },
  { arm: 'A-LOOT-ATTENDED', file: '2026-10-25-bag-rules.sql', why: 'a sale pays twice the vendor bid',
    find: '      v_gold := v_gold + v_q * v_r.unit;', repl: '      v_gold := v_gold + 2 * v_q * v_r.unit;' },
  { arm: 'A-LOOT-AWAY', file: '2026-10-25-bag-rules.sql', why: 'the loot filter ignores a lock',
    find: "       and r.loot_rule in ('sell', 'ignore') and not r.locked", repl: "       and r.loot_rule in ('sell', 'ignore')" },
  /* hr_shop_view is RESTATED last by 2026-11-20-shop-outfitter.sql: its mutants are planted in the body that runs. */
  { arm: 'A-NO-SUPPLY', file: '2026-11-20-shop-outfitter.sql', why: 'the shop section lists the supplies again',
    find: "from public.hr_shop_supply_offers o where o.kind in ('tool', 'gear')), '[]'::jsonb),", repl: "from public.hr_shop_supply_offers o), '[]'::jsonb)," },
  { arm: 'A-OUTFITTER', file: '2026-11-20-shop-outfitter.sql', why: 'the shop section hides the outfitter again (tools only)',
    find: "from public.hr_shop_supply_offers o where o.kind in ('tool', 'gear')), '[]'::jsonb),", repl: "from public.hr_shop_supply_offers o where o.kind = 'tool'), '[]'::jsonb)," },
  /* The refill survives WITH its baseline row: the defect grant hygiene cannot see (a door kept but
     unlisted is hygiene's catch — every later self-check that asserts hygiene refuses that chain). */
  { arm: 'A-NO-SUPPLY', file: '2026-11-02-shop-no-supplies.sql', why: 'the refill door stays open (and stays on the baseline)',
    find: "drop function if exists public.hr_shop_refill(integer, bigint, uuid);\ndrop function if exists public.hr_shop_refill_quote(uuid, integer);\ndrop function if exists public.hr_restock_set(integer, jsonb, uuid);\ndelete from public.hr_client_rpc_baseline where proname in ('hr_shop_refill', 'hr_restock_set');",
    repl: "drop function if exists public.hr_shop_refill_quote(uuid, integer);\ndrop function if exists public.hr_restock_set(integer, jsonb, uuid);\ndelete from public.hr_client_rpc_baseline where proname in ('hr_restock_set');" },
  /* Planted in the LAST alpha catalogue (the 11-20 forward file rewrites every offer row the earlier files wrote). */
  { arm: 'A-DATA', file: '2026-11-20-alpha-catalogue.generated.sql', why: 'the SQL catalogue drifts from the edge price',
    find: "  ('supply.cooked_shrimp', 'cooked_shrimp', 'food', 19),", repl: "  ('supply.cooked_shrimp', 'cooked_shrimp', 'food', 18)," },
  /* (A gear row under twice its book value is refused at APPLY, by this catalogue's own §4 and by
     2026-11-20-shop-outfitter.sql §2 (d): measured 2026-10-22, the planted chain does not boot. No arm mutant.) */
  /* hr_stamina_refill_quote is RESTATED by the core rebuild (2026-10-27-core-bodies.sql: priced on Level):
     the mutant is planted in the body that runs. */
  { arm: 'A-DATA', file: '2026-10-27-core-bodies.sql', why: 'the SQL refill skips the escalation',
    find: '* (r.step_den + r.step_num * (v_n - 1)) * v_min)', repl: '* (r.step_den) * v_min)' },
  { arm: 'A-STAMINA', file: '2026-10-25-stamina-refill.sql', why: 'the refill charges and never writes the pool',
    find: "   where user_id = v_uid and slot = p_slot;\n  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -p_price,",
    repl: "   where false;\n  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -p_price," },
  /* hr_hunt_apply_member is RESTATED by the core rebuild: the hook call is planted in the body that runs. */
  { arm: 'A-BLESS-AWAY', file: '2026-10-27-core-bodies.sql', why: 'the death no longer applies blessings',
    find: '    v_bless := public.hr_blessing_take(p_user, p_slot, p_session, v_dx, v_s.settled_to);', repl: '    v_bless := null;' },
  /* ('every fall of the window is protected, not the first' RETIRED with the core rebuild: a hunt holds one death,
     so there is no second death for the mutant to protect.) */
  { arm: 'A-BLESS-ATTENDED', file: '2026-10-25-blessings.sql', why: 'a death does not use the blessings up',
    find: '  delete from public.player_blessings where user_id = p_user and slot = p_slot and tier = any (v_tiers);', repl: '  perform 1;' },
  /* hr_hunt_party_start is RESTATED last by 2026-10-30-town-activity-yields.sql (after party-flow): the mutant is planted in the body that runs. */
  { arm: 'A-PARTY', file: '2026-10-30-town-activity-yields.sql', why: "the shared start loads the leader's bag into every member",
    find: 'public.hr_hunt_saved_bag(v_m.user_id, v_m.slot),', repl: 'public.hr_hunt_saved_bag(v_uid, p_slot),' },
];

/** Each mutant's file must be the chain's LAST author of the function its `find` sits in (mutate the caller). */
export function staleAnchors(mutants) {
  const order = JSON.parse(readFileSync(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
  const text = (f) => { try { return readFileSync(MIG(f), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
  const out = [];
  for (const mu of mutants) {
    const body = text(mu.file);
    const at = body.indexOf(mu.find);
    if (at < 0) { out.push(`${mu.arm}: find not in ${mu.file}`); continue; }
    let fn = null;
    for (const m of body.slice(0, at).matchAll(/create\s+or\s+replace\s+function\s+(?:public\.)?(\w+)\s*\(/gi)) fn = m[1];
    if (!fn) continue;
    const re = new RegExp('create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?' + fn + '\\s*\\(', 'i');
    const later = order.slice(order.indexOf(mu.file) + 1).filter((f) => re.test(text(f)));
    if (later.length) out.push(`${mu.arm}: ${fn} in ${mu.file} is restated last by ${later.at(-1)}; plant it there`);
  }
  return out;
}

function selfCheckOff(file) {
  const src = readFileSync(MIG(file), 'utf8').replace(/\r\n/g, '\n');
  const m = src.match(/\n(-- (?:── )?§\d+ SELF-CHECK[^\n]*(?:\n--[^\n]*)*)\n(do \$(\w*)\$)/);
  if (!m) throw new Error('no self-check heading in ' + file);
  const head = m[1] + '\n' + m[2];
  const tag = '$' + m[3] + '$';
  return [head, m[1] + '\ncreate or replace function pg_temp.s2_selfcheck_off() returns void language plpgsql as ' + tag];
}

async function runArms(db, ctx, only) {
  const out = [];
  for (const [name, fn] of Object.entries(ARMS)) {
    if (only && !only.includes(name)) continue;
    await db.query('begin');
    let problems;
    try { problems = await fn(db, ctx); } catch (e) { problems = ['HARNESS: ' + String(e.message).slice(0, 400)]; }
    finally { await db.query('rollback'); }
    out.push({ name, problems });
  }
  return out;
}

async function main() {
  const ctx = await harness();
  if (!MUTATE) {
    let db;
    try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 400)); process.exit(1); }
    await ctx.H.pinDice(db);
    const res = await runArms(db, ctx);
    let bad = 0;
    for (const r of res) {
      if (r.problems.length) { bad++; for (const x of r.problems) console.error(`✗ ${r.name}: ${x}`); }
      else console.log(`✓ ${r.name}`);
    }
    console.log(bad ? `alpha-server: ${bad} of ${res.length} arms red` : `alpha-server: green — ${res.length} arms`);
    process.exit(bad ? 1 : 0);
  }
  /* A mutant planted in a body a later file restates never runs (A-PARTY/A-LOCK, 2026-10-20): refuse it up front.
     Selftest: the old party-flow anchor must be flagged, or this check is blind. */
  const probe = staleAnchors([{ arm: 'SELFTEST', file: '2026-10-28-party-flow.sql', find: 'public.hr_hunt_saved_bag(v_m.user_id, v_m.slot),' }]);
  if (!probe.length) { console.error('✗ ANCHOR selftest: a superseded party-flow anchor was not flagged'); process.exit(1); }
  const stale = staleAnchors(MUTANTS);
  for (const s of stale) console.error('✗ ANCHOR ' + s);
  let missed = stale.length;
  /* `--arm A,B`: only the mutants of those arms (a lane proving the arms its diff touches; the nightly runs all). */
  const armAt = process.argv.indexOf('--arm');
  const onlyArms = armAt > 0 ? String(process.argv[armAt + 1] || '').split(',') : null;
  for (const mu of MUTANTS) {
    if (onlyArms && !onlyArms.includes(mu.arm)) continue;
    let db;
    try {
      /* A hook in a feature file is reached only through 2026-10-25-settle-hooks.sql (its caller, the
         LAST S2 file), so every mutant replays the whole chain: stopping at the patched file would
         leave the hook uncalled and the arm red for the wrong reason. */
      const last = mu.file === S2_FILES[S2_FILES.length - 1];
      ({ db } = await bootReplay({ patches: new Map([[mu.file, [selfCheckOff(mu.file), [mu.find, mu.repl]]]]),
        upTo: last ? LAST_PATCHED : undefined,
        fullChain: last ? undefined : 'the S2 hooks are called by 2026-10-25-settle-hooks.sql, which must run after the patched file for its arm to see the defect' }));
    } catch (e) { console.error(`✗ HARNESS ${mu.arm} (${mu.why}): the patched chain would not boot: ${String(e.message).split('\n').slice(0, 2).join(' ')}`); missed++; continue; }
    await ctx.H.pinDice(db);
    const [r] = await runArms(db, ctx, [mu.arm]);
    const real = r.problems.filter((x) => !x.startsWith('HARNESS') && !x.startsWith('CONTROL'));
    if (real.length) console.log(`✓ ${mu.arm} catches: ${mu.why} — ${real[0].slice(0, 140)}`);
    else { console.error(`✗ ${mu.arm} MISSED: ${mu.why}${r.problems.length ? ' (' + r.problems[0].slice(0, 200) + ')' : ''}`); missed++; }
    await db.close().catch(() => {});
  }
  console.log(missed ? `alpha-server --mutate: ${missed} of ${MUTANTS.length} MISSED` : `alpha-server --mutate: all ${MUTANTS.length} mutants caught`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) main();
