#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════
// tests/temper-buy.mjs — THE SALE OF A RUNG, GOLD AND MATERIAL, ON THE REPLAYED CHAIN WITH THE SHIPPED EDGE (src/data/temper.js,
//   supabase/migrations/2027-02-27-tempering.sql, 2027-02-28-temper-craft.sql; the fight's half is tests/hunt-core/temper*.mjs).
//
//   node tests/temper-buy.mjs            the guard
//   node tests/temper-buy.mjs --mutate   every planted defect must turn an arm red or fail a file's §4
//
// mutant-anchors: supabase/migrations/2027-02-27-tempering.sql, supabase/migrations/2027-02-28-temper-craft.sql, supabase/functions/hr-accrue/gold-ladder-catalogue.js
//
//   TB-FORWARD  the Edge forwards every rung by name and nothing else: an off-ladder, tier 1 or prototype id is not a rung
//   TB-CHAIN    what the server sold is what the engine fights by: hr_perks_of's map, through member.js, is the rung's permille
//   TB-PRICE    the envelope's gold and material are the data's, rung by rung, and the charge is the envelope's: no number crosses from a client
//   TB-HERO     a rung is one hero's, never the account's; the purse and the Storage it drew on are the account's, so one smith supplies another hero
//   TB-HUNT     a hunting hero's packed bag is neither source: a material can't be packed, and a rung bought mid-hunt leaves the bag's rows as they stood
//   TB-MARKET   the salts are on the Weighhouse at the shop's bid and up, and the public bench takes its share of a mix
//   TB-IDEM     a second apply of the newest files moves nothing, and keeps every other catalogue row
//   TB-MATERIAL the data's rules: a Smithing recipe at or under its tier's level, climbing rungs, a shop bid under what goes in,
//               NO COAL anywhere in the chain (Andy's slog; board 2026-11-05), and a whole tier inside the hours a resting hero has
//
// Exit: 0 green · 1 red · 2 harness.
// ═════════════════════════════════════════════════════════════════
import { bootReplay, ROOT, LAST_PATCHED } from './schema-replay.mjs';
import { readFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEMPER_OFFERS, TEMPER_OFFER_IDS, TEMPER_UNLOCKS, TEMPER_MATERIALS, temperOfferId } from '../src/data/temper.js';
import { ITEMS } from '../src/data/items.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { ROCKS } from '../src/data/gathering.js';
import { MATERIAL_TIERS } from '../src/data/gear-tiers.js';
import { BENCH_TAX } from '../src/data/bench-tax.js';
import { recipeInputs } from '../src/core/artisan.js';
import { pacedActionMs } from '../src/core/pacing.js';
import { blowsPmOf, armorPmOf } from '../src/core/temper.js';
import { resolveUnlockOffer } from '../supabase/functions/hr-accrue/unlock-buy.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const GOLD_MIG = '2027-02-27-tempering.sql';
const MIG = '2027-02-28-temper-craft.sql';
const CAT = '2027-02-28-temper-craft-catalogue.generated.sql';
const USER = '00000000-0000-4000-c000-7e3b3e700002';
const IRON = { weapon: 'iron_sword', helmet: 'iron_helm', body: 'iron_platebody', pants: 'iron_platelegs', boots: 'iron_boots' };
const SALTS = TEMPER_MATERIALS[2].item, FINE = TEMPER_MATERIALS[3].item;

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

async function play(db) {
  const q = async (s, a) => (await db.query(s, a)).rows;
  const one = async (s, a) => (await q(s, a))[0];
  const J = (x) => JSON.stringify(x).replace(/'/g, "''");
  await db.exec(`insert into auth.users (id) values ('${USER}') on conflict do nothing;
    insert into public.hr_access_allowlist (user_id, note) values ('${USER}', 'temper-buy') on conflict do nothing;
    select set_config('request.jwt.claim.sub', '${USER}', false);`);
  const made = (await one(`select public.hr_create_character(0) r`)).r;
  ok(made && made.ok === true, 'TB: no character: ' + J(made));
  await db.exec(`update public.account_wallet set gold = 1000000 where user_id = '${USER}';
    insert into public.account_bank (user_id, item_id, qty) values ('${USER}', '${SALTS}', 1000), ('${USER}', '${FINE}', 3);`);
  const version = async (slot = 0) => (await one(`select version from public.player_state where user_id = '${USER}' and slot = ${slot}`)).version;
  let n = 0;
  const buy = async (offer, slot = 0) => (await one(`select public.hr_unlock_buy('${USER}', ${slot}, ${await version(slot)}, '00000000-0000-4000-c000-7e3b3e7${String(10000 + ++n).padStart(5, '0')}'::uuid, '${offer}') r`)).r;
  const purse = async () => Number((await one(`select gold from public.account_wallet where user_id = '${USER}'`)).gold);
  const stored = async (id) => { const r = await one(`select qty from public.account_bank where user_id = '${USER}' and item_id = '${id}'`); return r ? Number(r.qty) : 0; };

  /* TB-PRICE: every rung of one ladder: what the envelope shows is the data's, and the charge is exactly that, gold and material. */
  for (const row of TEMPER_OFFERS.filter((r) => r.unlock_id === 'temper:armor:2')) {
    const view = (await one(`select public.hr_temper_view('${USER}', 0) v`)).v;
    const ladder = view.find((l) => l.track === 'armor' && l.tier === 2);
    ok(ladder && ladder.offer === row.offer_id && Number(ladder.gold) === row.gold && JSON.stringify(ladder.items) === JSON.stringify(row.items), `TB-PRICE: rung ${row.value} shows ${J(ladder)}, the data says ${row.gold} and ${JSON.stringify(row.items)}`);
    const goldWas = await purse(), saltsWas = await stored(SALTS), r = await buy(row.offer_id);
    ok(r && r.ok === true && goldWas - (await purse()) === row.gold && saltsWas - (await stored(SALTS)) === row.items[SALTS], `TB-PRICE: ${row.offer_id} answered ${J(r)}, charged ${goldWas - (await purse())} g and ${saltsWas - (await stored(SALTS))} salts, the price is ${row.gold} and ${row.items[SALTS]}`);
    const c = r && r.charged;
    ok(c && c.gold === row.gold && c.items[SALTS] === row.items[SALTS] && c.from && c.from.storage[SALTS] === row.items[SALTS], 'TB-PRICE: the receipt reads ' + J(c));
  }
  const blowsOne = await buy(temperOfferId('blows', 2, 1)), blowsTwo = await buy(temperOfferId('blows', 2, 2));
  ok(blowsOne.ok === true && blowsTwo.ok === true, 'TB-PRICE: Blows rungs refused: ' + J(blowsOne));

  /* Steel's ladder takes its own material: Tempering Salts don't pay for it, and the refusal names what it wants. */
  const fineShort = await buy(temperOfferId('blows', 3, 1));
  ok(fineShort.error === 'insufficient_item' && fineShort.item_id === FINE && fineShort.have === 3, 'TB-PRICE: a Steel rung on Iron\'s salts answered ' + J(fineShort));

  /* TB-CHAIN: the map the settle reads, through the engine's own functions, is the rung's permille. */
  const perks = (await one(`select public.hr_perks_of('${USER}', 0) p`)).p;
  ok(perks.ok === true && perks.temper && perks.temper['temper:armor:2'] === 5 && perks.temper['temper:blows:2'] === 2, 'TB-CHAIN: the perks read ' + J(perks && perks.temper));
  ok(blowsPmOf(IRON, ITEMS, perks.temper) === 20 && armorPmOf(IRON, ITEMS, perks.temper) === 50, `TB-CHAIN: the engine reads ${blowsPmOf(IRON, ITEMS, perks.temper)} and ${armorPmOf(IRON, ITEMS, perks.temper)} pm`);
  ok(Object.keys(perks.temper).sort().join() === 'temper:armor:2,temper:blows:2', 'TB-CHAIN: the map holds more than the hero bought: ' + J(perks.temper));

  /* TB-HERO: a second hero holds no rung, spends from the one purse and the one Storage, and climbs its own ladder from the first rung. */
  await db.exec(`insert into public.player_state (user_id, slot) values ('${USER}', 1) on conflict do nothing`);
  const other = (await one(`select public.hr_perks_of('${USER}', 1) p`)).p;
  ok(other.ok === true && JSON.stringify(other.temper) === '{}', 'TB-HERO: the second hero reads ' + J(other.temper));
  const skipped = await buy(temperOfferId('blows', 2, 3), 1);
  ok(skipped.error === 'rung_skipped', 'TB-HERO: the second hero skipped to rung 3: ' + J(skipped));
  const was = await purse(), saltsThen = await stored(SALTS), first = await buy(temperOfferId('blows', 2, 1), 1);
  const row1 = TEMPER_OFFERS.find((r) => r.offer_id === temperOfferId('blows', 2, 1));
  ok(first.ok === true && was - (await purse()) === row1.gold && saltsThen - (await stored(SALTS)) === row1.items[SALTS], 'TB-HERO: the second hero\'s first rung answered ' + J(first));
  ok((await one(`select public.hr_perks_of('${USER}', 0) p`)).p.temper['temper:blows:2'] === 2, 'TB-HERO: the second hero\'s rung moved the first hero\'s');

  /* TB-HUNT: the salts can't be packed, and a rung bought while the hero hunts takes them from the bag or Storage and leaves the hunt's bag as it stood. */
  await db.exec(`delete from public.account_bank where user_id = '${USER}';
    insert into public.player_inventory (user_id, slot, item_id, qty) values ('${USER}', 0, '${SALTS}', 45)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;`);
  const pack = (await one(`select public.hr_hunt_enter_for('${USER}', 0, 'mill_cellar', '[{"item":"${SALTS}","qty":5}]'::jsonb, 0, null) r`)).r;
  ok(pack && pack.error === 'unknown_supply', 'TB-HUNT: packing the salts answered ' + J(pack));
  const went = (await one(`select public.hr_hunt_enter_for('${USER}', 0, 'mill_cellar', '[]'::jsonb, 0, null) r`)).r;
  ok(went && went.ok === true, 'TB-HUNT: the hunt did not open: ' + J(went));
  const huntBag = async () => JSON.stringify((await q(`select b.item_id, b.qty_loaded, b.qty_left from public.hunt_bag b join public.hunt_sessions s on s.id = b.session_id where s.user_id = '${USER}' and s.slot = 0 and s.ended_at is null order by b.item_id`)));
  const bagWas = await huntBag();
  const mid = await buy(temperOfferId('blows', 2, 3));
  ok(mid.ok === true && mid.charged.from.bag[SALTS] === TEMPER_MATERIALS[2].qty[2], 'TB-HUNT: a rung bought mid-hunt answered ' + J(mid && mid.error ? mid : mid.charged));
  ok((await huntBag()) === bagWas && !bagWas.includes('temper'), 'TB-HUNT: the hunt\'s bag moved: ' + bagWas + ' -> ' + (await huntBag()));
  const bare = await buy(temperOfferId('blows', 2, 4));
  ok(bare.error === 'insufficient_item' && bare.item_id === SALTS && bare.have === 5, 'TB-HUNT: a rung short of it answered ' + J(bare));

  /* The ledger holds every sale, and the rows sum to what the purse lost. */
  const sold = await one(`select count(*)::int n, coalesce(sum(-gold), 0)::bigint g from public.player_ledger where user_id = '${USER}' and kind = 'shop' and intent like 'unlock\\_buy:temper.%'`);
  ok(sold.n === 9 && Number(sold.g) === 1000000 - (await purse()), `TB-PRICE: the ledger holds ${sold.n} sales of ${sold.g} gold, the purse lost ${1000000 - (await purse())}`);
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);

  /* TB-MARKET: tradeable, floored at the shop's bid, and the public bench takes its share of the output's bid. */
  for (const id of [SALTS, FINE]) {
    const m = await one(`select listable, why, floor_each, ceiling_each, book from public.hr_market_items where item_id = '${id}'`);
    const bid = vendorPriceOf(ITEMS, id);
    ok(m && m.listable === true && Number(m.floor_each) === bid && Number(m.book) === ITEMS[id].v && Number(m.ceiling_each) >= ITEMS[id].v, 'TB-MARKET: ' + id + ' reads ' + J(m) + ', bid ' + bid);
    const recipe = ARTISAN_RECIPES.smithing.find((r) => r.output === id);
    const fee = await one(`select public.hr_bench_tax_mg('${recipe.id}') mg`);
    ok(Number(fee.mg) === BENCH_TAX.smithing * bid, `TB-MARKET: the bench takes ${fee.mg} mg of ${recipe.id}, ${BENCH_TAX.smithing * bid} at its rate`);
  }
}

async function idem(db) {
  const q = async (s) => (await db.query(s)).rows;
  const census = async () => JSON.stringify(await q(`select
    (select md5(string_agg(o::text, '|' order by offer_id)) from public.hr_unlock_offers o) a,
    (select md5(string_agg(u::text, '|' order by unlock_id)) from public.hr_unlocks u) b,
    (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)')) c,
    (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.hr_temper_view(uuid,integer)')) d,
    (select count(*) from public.hr_state_sections) e,
    (select count(*) from public.hr_unlock_offers where source <> 'gen-temper') f`));
  const before = await census();
  for (const f of [CAT, MIG]) await db.exec(readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'));
  ok((await census()) === before, 'TB-IDEM: a second apply moved something: ' + before + ' -> ' + (await census()));
  ok(TEMPER_UNLOCKS.length === Number((await q(`select count(*) n from public.hr_unlocks where namespace = 'temper'`))[0].n), 'TB-IDEM: the ladders do not match the data');
}

function forward(resolve) {
  for (const id of TEMPER_OFFER_IDS) {
    const r = resolve(id);
    ok(r.ok === true && r.offer && r.offer.id === id && Object.keys(r.offer).join() === 'id', `TB-FORWARD: ${id} answered ${JSON.stringify(r)}`);
  }
  for (const id of ['temper.blows.2.6', 'temper.blows.1.1', 'temper.blows.2.0', 'temper:blows:2', 'temper.gold.2.1', 'constructor']) {
    const r = resolve(id);
    ok(r.ok !== true, `TB-FORWARD: the Edge forwards ${id}`);
  }
}

/* The hours one hero's work takes for one unit of a stock item, from the rock, and whether coal is anywhere in it. Hunted inputs cost no hours here: they come home with the gold. */
function chainOf(id, recipes, rocks) {
  const rock = rocks.filter((r) => r.prod === id).sort((a, b) => a.req - b.req)[0];
  if (rock) return { s: pacedActionMs(rock.ms) / 1000 / ((rock.qty[0] + rock.qty[1]) / 2), coal: id === 'coal' ? 1 : 0 };
  const made = recipes.smithing.find((r) => r.output === id);
  if (!made) return { s: 0, coal: 0 };
  let s = pacedActionMs(made.ms) / 1000, coal = 0;
  for (const [k, n] of Object.entries(recipeInputs(made))) { const c = chainOf(k, recipes, rocks); s += c.s * n; coal += c.coal * n; }
  const q = made.outputQty || 1;
  return { s: s / q, coal: coal / q };
}

/** TB-MATERIAL: the data's rules, as sentences. Exported shape: plants below hand it a changed table. */
function materialProblems({ materials, recipes, rocks, items, bid }) {
  const out = [];
  const TIERS = Object.keys(materials).map(Number);
  if (TIERS.join() !== '2,3') out.push('TB-MATERIAL: the ladders with a material are tiers ' + TIERS.join());
  for (const tier of TIERS) {
    const m = materials[tier];
    const r = recipes.smithing.find((x) => x.output === m.item);
    if (!r) { out.push(`TB-MATERIAL: no Smithing recipe makes ${m.item}`); continue; }
    if (m.qty.length !== 5 || m.qty.some((n, i) => i > 0 && !(n > m.qty[i - 1]))) out.push(`TB-MATERIAL: ${m.item}'s rungs ${m.qty} do not climb`);
    const level = MATERIAL_TIERS[tier - 1].level;
    if (r.req > level) out.push(`TB-MATERIAL: ${r.id} asks Smithing ${r.req} of gear worn at Level ${level}`);
    const inputs = recipeInputs(r);
    const inBid = Object.entries(inputs).reduce((s, [k, n]) => s + bid(k) * n, 0);
    if (!(bid(m.item) * (r.outputQty || 1) < inBid)) out.push(`TB-MATERIAL: ${m.item} sells to the shop for ${bid(m.item)}, what goes in for ${inBid}: a craft that profits at the shop`);
    if (!items[m.item] || items[m.item].bop || !(items[m.item].v > 0)) out.push(`TB-MATERIAL: ${m.item} cannot trade`);
    const c = chainOf(m.item, recipes, rocks);
    if (c.coal > 0) out.push(`TB-MATERIAL: ${m.item} takes ${c.coal} coal a piece, and a full ladder ${c.coal * 620}: Andy's slog, doubled`);
    const hours = (m.qty.reduce((s, n) => s + n, 0) * 2 * c.s) / 3600;
    if (hours > 6) out.push(`TB-MATERIAL: both tracks of tier ${tier} take ${hours.toFixed(1)} h of one hero`);
  }
  return out;
}
const SHIPPED = { materials: TEMPER_MATERIALS, recipes: ARTISAN_RECIPES, rocks: ROCKS, items: ITEMS, bid: (id) => vendorPriceOf(ITEMS, id) };

const withRecipe = (id, change) => ({ ...SHIPPED, recipes: { ...ARTISAN_RECIPES, smithing: ARTISAN_RECIPES.smithing.map((r) => (r.output === id ? { ...r, ...change } : r)) } });
const PLANTS = [
  ['the Steel tier mixes Steel Bars, coal and all', withRecipe(FINE, { inputs: { steel_bar: 1, big_bones: 1 } })],
  ['the salts sell to the shop above what goes in', { ...SHIPPED, bid: (id) => (id === SALTS ? 99 : vendorPriceOf(ITEMS, id)) }],
  ['the rungs ask a flat count', { ...SHIPPED, materials: { ...TEMPER_MATERIALS, 2: { item: SALTS, qty: [40, 40, 40, 40, 40] } } }],
  ['a rung takes a day of one hero', { ...SHIPPED, materials: { ...TEMPER_MATERIALS, 3: { item: FINE, qty: [100, 200, 400, 800, 1600] } } }],
  ['the recipe is out of reach of its tier', withRecipe(SALTS, { req: 45 })],
  ['no recipe makes the salts', withRecipe(SALTS, { output: 'iron_bar' })],
];

const SQL_MUTANTS = [
  [GOLD_MIG, 'hr_perks_of reads the rungs but never answers them', [["    'temper', coalesce(v_temper, '{}'::jsonb),\n", '']]],
  [GOLD_MIG, 'the rungs\' read forgets which hero', [["   where pp.user_id = p_user\n     and pp.slot    = p_slot\n     and pp.period_key = ''\n     and pp.value  > 0;\n\n  -- THE RENOWN CHANNEL", "   where pp.user_id = p_user\n     and pp.period_key = ''\n     and pp.value  > 0;\n\n  -- THE RENOWN CHANNEL"]]],
  [GOLD_MIG, 'the section is never in the envelope', [["  ('temper', 'hr_temper_view',", "  ('temper_off', 'hr_temper_view',"]]],
  [MIG, 'the window shows the rung you hold, not the next one', [['and o.value = coalesce(pp.value, 0) + 1 and o.refusal is null', 'and o.value = coalesce(pp.value, 0) and o.refusal is null']]],
  [MIG, 'the window\'s rung reads any hero of the account', [['on pp.user_id = p_user and pp.slot = p_slot and pp.kind = u.progress_kind', 'on pp.user_id = p_user and pp.kind = u.progress_kind']]],
  [MIG, 'the window never states the material', [["           'gold', o.gold,\n           'items', o.items) order by", "           'gold', o.gold) order by"]]],
  [MIG, 'a rung reads the bag alone, so one smith can\'t supply another hero', [["v_cat.namespace in (''room'', ''property'', ''temper''));';", "v_cat.namespace in (''room'', ''property''));';"]]],
  [MIG, 'the §4 no longer proves a refusal spends nothing', [["    if v->>'error' is distinct from 'insufficient_item' or v->>'item_id' is distinct from v_item or (v->>'need')::bigint <> v_need or (v->>'have')::bigint <> 0\n", "    update public.account_wallet set gold = gold - 1 where user_id = v_u;\n    if v->>'error' is distinct from 'insufficient_item' or v->>'item_id' is distinct from v_item or (v->>'need')::bigint <> v_need or (v->>'have')::bigint <> 0\n"]]],
  [CAT, 'a rung sold off its ladder', [["('temper.blows.2.1', 'temper', 'Temper blows, tier 2, rung 1', 'temper:blows:2', 1, 2000,", "('temper.blows.2.1', 'temper', 'Temper blows, tier 2, rung 1', 'temper:blows:2', 9, 2000,"]]],
  [CAT, 'a rung for no gold', [["('temper.armor.3.5', 'temper', 'Temper armor, tier 3, rung 5', 'temper:armor:3', 5, 112000,", "('temper.armor.3.5', 'temper', 'Temper armor, tier 3, rung 5', 'temper:armor:3', 5, 0,"]]],
  [CAT, 'the first rung takes no material', [["'temper:blows:2', 1, 2000, '{\"temper_salts\":10}'::jsonb", "'temper:blows:2', 1, 2000, '{}'::jsonb"]]],
];

async function main() {
  if (!MUTATE) {
    let db;
    try { ({ db } = await bootReplay()); } catch (e) { console.error('temper-buy: HARNESS - ' + String(e.message).slice(0, 900)); process.exit(2); }
    forward(resolveUnlockOffer);
    for (const p of materialProblems(SHIPPED)) ok(false, p);
    await play(db);
    await idem(db);
    if (fails.length) { for (const f of fails) console.log('FAIL  ' + f); console.log(`temper-buy: ${fails.length} RED`); process.exit(1); }
    console.log('temper-buy: green');
    process.exit(0);
  }
  let escaped = 0;
  for (const [file, name, edits] of SQL_MUTANTS) {
    fails.length = 0;
    let caught = false, why = '';
    try {
      const { db } = await bootReplay(CONTROL ? {} : { patches: new Map([[file, edits]]), upTo: LAST_PATCHED });
      await play(db);
      await idem(db);
      caught = fails.length > 0; why = fails[0] || '';
    } catch (e) {
      if (e.harness && !e.message.includes(file)) { console.error('temper-buy: HARNESS - ' + String(e.message).slice(0, 600)); process.exit(2); }
      caught = true; why = String(e.message).split('\n').slice(0, 2).join(' ');
    }
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'} ${name}${caught ? ' -> ' + why.slice(0, 140) : ''}`);
    if (!caught) escaped++;
  }
  for (const [name, plant] of PLANTS) {
    const got = materialProblems(plant);
    console.log(`  ${got.length ? 'caught ' : 'ESCAPED'} ${name}${got.length ? ' -> ' + got[0].slice(0, 120) : ''}`);
    if (!got.length) escaped++;
  }
  /* The Edge's half: a forward list without the rungs, on a planted copy. */
  const tmp = mkdtempSync(join(tmpdir(), 'temper-buy-'));
  try {
    for (const d of ['src/data', 'src/core', 'supabase/functions/hr-accrue']) cpSync(join(ROOT, d), join(tmp, d), { recursive: true, filter: (f) => !/\.(png|webp)$/i.test(f) });
    cpSync(join(ROOT, 'src/build-info.js'), join(tmp, 'src/build-info.js'));
    const p = join(tmp, 'supabase/functions/hr-accrue/gold-ladder-catalogue.js');
    const src = readFileSync(p, 'utf8');
    const from = 'new Set([...GOLD_LADDER_OFFER_IDS, ...TEMPER_OFFER_IDS])';
    if (src.split(from).length !== 2) throw new Error('forward anchor');
    writeFileSync(p, src.replace(from, 'new Set(GOLD_LADDER_OFFER_IDS)'));
    const U = await import(pathToFileURL(join(tmp, 'supabase/functions/hr-accrue/unlock-buy.js')).href);
    fails.length = 0;
    forward(U.resolveUnlockOffer);
    const caught = fails.length > 0;
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'} the Edge never forwards a rung`);
    if (!caught) escaped++;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  if (CONTROL) { console.log('temper-buy --mutate: control ran the clean tree'); process.exit(0); }
  console.log(escaped ? `temper-buy --mutate: ${escaped} ESCAPED` : 'temper-buy --mutate: every mutant caught');
  process.exit(escaped ? 1 : 0);
}

await main();
