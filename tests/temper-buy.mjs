#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════
// tests/temper-buy.mjs — THE SALE OF A RUNG, ON THE REPLAYED CHAIN WITH THE SHIPPED EDGE (src/data/temper.js,
//   supabase/migrations/2027-02-27-tempering.sql; the fight's half is tests/hunt-core/temper*.mjs).
//
//   node tests/temper-buy.mjs            the guard
//   node tests/temper-buy.mjs --mutate   every planted defect must turn an arm red or fail the file's §4
//
// mutant-anchors: supabase/migrations/2027-02-27-tempering.sql, supabase/functions/hr-accrue/gold-ladder-catalogue.js
//
//   TB-FORWARD  the Edge forwards every rung by name and nothing else: an off-ladder, tier 1 or prototype id is not a rung
//   TB-CHAIN    what the server sold is what the engine fights by: hr_perks_of's map, through member.js, is the rung's permille
//   TB-PRICE    the envelope's price is the data's, rung by rung, and the charge is the envelope's price: no number crosses from a client
//   TB-HERO     a rung is one hero's, never the account's, and the purse it came from is the account's
//   TB-IDEM     a second apply of both files moves nothing, and the first keeps every other catalogue row
//
// Exit: 0 green · 1 red · 2 harness.
// ═════════════════════════════════════════════════════════════════
import { bootReplay, ROOT, LAST_PATCHED } from './schema-replay.mjs';
import { readFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEMPER_OFFERS, TEMPER_OFFER_IDS, TEMPER_UNLOCKS, temperOfferId } from '../src/data/temper.js';
import { ITEMS } from '../src/data/items.js';
import { blowsPmOf, armorPmOf } from '../src/core/temper.js';
import { resolveUnlockOffer } from '../supabase/functions/hr-accrue/unlock-buy.js';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const MIG = '2027-02-27-tempering.sql';
const CAT = '2027-02-27-tempering-catalogue.generated.sql';
const USER = '00000000-0000-4000-c000-7e3b3e700002';
const IRON = { weapon: 'iron_sword', helmet: 'iron_helm', body: 'iron_platebody', pants: 'iron_platelegs', boots: 'iron_boots' };

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
  await db.exec(`update public.account_wallet set gold = 1000000 where user_id = '${USER}'`);
  const version = async (slot = 0) => (await one(`select version from public.player_state where user_id = '${USER}' and slot = ${slot}`)).version;
  let n = 0;
  const buy = async (offer, slot = 0) => (await one(`select public.hr_unlock_buy('${USER}', ${slot}, ${await version(slot)}, '00000000-0000-4000-c000-7e3b3e7${String(10000 + ++n).padStart(5, '0')}'::uuid, '${offer}') r`)).r;
  const purse = async () => Number((await one(`select gold from public.account_wallet where user_id = '${USER}'`)).gold);

  /* TB-PRICE: every rung of one ladder, up the ladder: the price the envelope shows is the data's and the charge is that price. */
  for (const row of TEMPER_OFFERS.filter((r) => r.unlock_id === 'temper:armor:2')) {
    const view = (await one(`select public.hr_temper_view('${USER}', 0) v`)).v;
    const ladder = view.find((l) => l.track === 'armor' && l.tier === 2);
    ok(ladder && ladder.offer === row.offer_id && Number(ladder.gold) === row.gold, `TB-PRICE: rung ${row.value} shows ${J(ladder)}, the data says ${row.gold}`);
    const before = await purse(), r = await buy(row.offer_id);
    ok(r && r.ok === true && before - (await purse()) === row.gold, `TB-PRICE: ${row.offer_id} answered ${J(r)}, charged ${before - (await purse())}, the price is ${row.gold}`);
  }
  const blowsOne = await buy(temperOfferId('blows', 2, 1)), blowsTwo = await buy(temperOfferId('blows', 2, 2));
  ok(blowsOne.ok === true && blowsTwo.ok === true, 'TB-PRICE: Blows rungs refused: ' + J(blowsOne));

  /* TB-CHAIN: the map the settle reads, through the engine's own functions, is the rung's permille. */
  const perks = (await one(`select public.hr_perks_of('${USER}', 0) p`)).p;
  ok(perks.ok === true && perks.temper && perks.temper['temper:armor:2'] === 5 && perks.temper['temper:blows:2'] === 2, 'TB-CHAIN: the perks read ' + J(perks && perks.temper));
  ok(blowsPmOf(IRON, ITEMS, perks.temper) === 20 && armorPmOf(IRON, ITEMS, perks.temper) === 50, `TB-CHAIN: the engine reads ${blowsPmOf(IRON, ITEMS, perks.temper)} and ${armorPmOf(IRON, ITEMS, perks.temper)} pm`);
  ok(Object.keys(perks.temper).sort().join() === 'temper:armor:2,temper:blows:2', 'TB-CHAIN: the map holds more than the hero bought: ' + J(perks.temper));

  /* TB-HERO: a second hero of the account holds no rung, spends from the one purse and climbs its own ladder from the first rung. */
  await db.exec(`insert into public.player_state (user_id, slot) values ('${USER}', 1) on conflict do nothing`);
  const other = (await one(`select public.hr_perks_of('${USER}', 1) p`)).p;
  ok(other.ok === true && JSON.stringify(other.temper) === '{}', 'TB-HERO: the second hero reads ' + J(other.temper));
  const skipped = await buy(temperOfferId('blows', 2, 3), 1);
  ok(skipped.error === 'rung_skipped', 'TB-HERO: the second hero skipped to rung 3: ' + J(skipped));
  const was = await purse(), first = await buy(temperOfferId('blows', 2, 1), 1);
  const price = TEMPER_OFFERS.find((r) => r.offer_id === temperOfferId('blows', 2, 1)).gold;
  ok(first.ok === true && was - (await purse()) === price, 'TB-HERO: the second hero\'s first rung answered ' + J(first));
  ok((await one(`select public.hr_perks_of('${USER}', 0) p`)).p.temper['temper:blows:2'] === 2, 'TB-HERO: the second hero\'s rung moved the first hero\'s');

  /* The ledger holds every sale, and the rows sum to what the purse lost. */
  const sold = await one(`select count(*)::int n, coalesce(sum(-gold), 0)::bigint g from public.player_ledger where user_id = '${USER}' and kind = 'shop' and intent like 'unlock\\_buy:temper.%'`);
  ok(sold.n === 8 && Number(sold.g) === 1000000 - (await purse()), `TB-PRICE: the ledger holds ${sold.n} sales of ${sold.g} gold, the purse lost ${1000000 - (await purse())}`);
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
}

async function idem(db) {
  const q = async (s) => (await db.query(s)).rows;
  const census = async () => JSON.stringify(await q(`select
    (select md5(string_agg(o::text, '|' order by offer_id)) from public.hr_unlock_offers o) a,
    (select md5(string_agg(u::text, '|' order by unlock_id)) from public.hr_unlocks u) b,
    (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.hr_perks_of(uuid,integer)')) c,
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

const SQL_MUTANTS = [
  { name: 'hr_perks_of reads the rungs but never answers them', edits: [["    'temper', coalesce(v_temper, '{}'::jsonb),\n", '']] },
  { name: 'the rungs\' read forgets which hero', edits: [["   where pp.user_id = p_user\n     and pp.slot    = p_slot\n     and pp.period_key = ''\n     and pp.value  > 0;\n\n  -- THE RENOWN CHANNEL", "   where pp.user_id = p_user\n     and pp.period_key = ''\n     and pp.value  > 0;\n\n  -- THE RENOWN CHANNEL"]] },
  { name: 'the window shows the rung you hold, not the next one', edits: [['and o.value = coalesce(pp.value, 0) + 1 and o.refusal is null', 'and o.value = coalesce(pp.value, 0) and o.refusal is null']] },
  { name: 'the window\'s rung reads any hero of the account', edits: [['on pp.user_id = p_user and pp.slot = p_slot and pp.kind = u.progress_kind', 'on pp.user_id = p_user and pp.kind = u.progress_kind']] },
  { name: 'the section is never in the envelope', edits: [["  ('temper', 'hr_temper_view',", "  ('temper_off', 'hr_temper_view',"]] },
  { name: 'a client can read any hero\'s rungs', edits: [['    raise exception \'tempering §4(g): a client role can reach a Tempering door\'; end if;', "    raise exception 'tempering §4(g): a client role can reach a Tempering door'; end if;\n  grant execute on function public.hr_temper_view(uuid, int) to authenticated;\n  if has_function_privilege('authenticated', 'public.hr_temper_view(uuid,integer)', 'execute') then raise exception 'tempering §4(g): planted grant caught'; end if;"]] },
];
const CAT_MUTANTS = [
  { name: 'a rung sold off its ladder', edits: [["('temper.blows.2.1', 'temper', 'Temper blows, tier 2, rung 1', 'temper:blows:2', 1, 2000,", "('temper.blows.2.1', 'temper', 'Temper blows, tier 2, rung 1', 'temper:blows:2', 9, 2000,"]] },
  { name: 'a rung for nothing', edits: [["('temper.armor.3.5', 'temper', 'Temper armor, tier 3, rung 5', 'temper:armor:3', 5, 112000,", "('temper.armor.3.5', 'temper', 'Temper armor, tier 3, rung 5', 'temper:armor:3', 5, 0,"]] },
];

async function main() {
  if (!MUTATE) {
    let db;
    try { ({ db } = await bootReplay()); } catch (e) { console.error('temper-buy: HARNESS - ' + String(e.message).slice(0, 900)); process.exit(2); }
    forward(resolveUnlockOffer);
    await play(db);
    await idem(db);
    if (fails.length) { for (const f of fails) console.log('FAIL  ' + f); console.log(`temper-buy: ${fails.length} RED`); process.exit(1); }
    console.log('temper-buy: green');
    process.exit(0);
  }
  let escaped = 0;
  for (const [file, list] of [[MIG, SQL_MUTANTS], [CAT, CAT_MUTANTS]]) {
    for (const mu of list) {
      fails.length = 0;
      let caught = false, why = '';
      try {
        const { db } = await bootReplay(CONTROL ? {} : { patches: new Map([[file, mu.edits]]), upTo: LAST_PATCHED });
        await play(db);
        await idem(db);
        caught = fails.length > 0; why = fails[0] || '';
      } catch (e) {
        if (e.harness && !e.message.includes(file)) { console.error('temper-buy: HARNESS - ' + String(e.message).slice(0, 600)); process.exit(2); }
        caught = true; why = String(e.message).split('\n')[0];
      }
      console.log(`  ${caught ? 'caught ' : 'ESCAPED'} ${mu.name}${caught ? ' -> ' + why.slice(0, 120) : ''}`);
      if (!caught) escaped++;
    }
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
