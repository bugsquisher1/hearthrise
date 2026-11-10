#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hero-slots-one.mjs — ONE HERO SLOT TO START, THE SECOND ABOUT A WEEK AWAY (Tyler 2026-11-09: "like a week to afford
// the first alt"; the designer's ladder 300,000 / 750,000 / 1,500,000), server to screen.
//
// Ships with: supabase/migrations/2027-03-25-hero-slots-one.sql and its two generated siblings
// (2027-03-25-hero-slots-one-unlocks / -unlock-offers.generated.sql), src/data/shops.js, src/app/slot-offer.js.
//
// ONE replay of the chain up to the file before them. Two LIVE accounts are made the production way first (no wipe is
// planned, Tyler 2026-11-09): one with heroes in slots 0 and 1 and a bought slot 2, one with a hero in slot 0 and its free
// slot 1 empty. Then the three files apply, twice.
//   HS-0  the files (the death pair, 2027-03-25-death-share*.sql, then the slot trio) apply over the live accounts, and a
//         second apply of all five moves nothing (every function body, table, catalogue row and hero)
//   HS-1  the catalogue: no starter, 300,000 / 750,000 / 1,500,000, four heroes = the play cap; src/data/shops.js and the
//         generated unlock ids and offers name slots 1-3 at the same prices
//   HS-2  a NEW account through the real wrapper: owns slot 0 alone, is offered the second hero at 300,000, cannot make a
//         hero in slot 1 unpaid; the ladder in order (slot 2 before 1 refused), one gold short refused and nothing moves,
//         then 1-2-3 at exactly their prices, slot 4 slot_cap
//   HS-3  the CHARACTERS SCREEN (AccountSession.roster + src/app/slot-offer.js) on the replay's own hr_load answers: one
//         hero reads "You own 1 hero slot. Up to 4 heroes..." and the 300,000 offer with the one-hero note; two heroes no note
//   HS-4  the LIVE account with heroes in 0 and 1 and a bought 2: every hero byte for byte, owns 0-2, offered slot 3 at
//         1,500,000 (no claw-back)
//   HS-5  the LIVE account whose free slot 1 was EMPTY: its hero untouched; it owns slot 0 alone and is offered slot 1 at
//         300,000 (Tyler 2026-11-09: "if it messes with peoples characters who cares, just tell them in the changelog")
//
//   node tests/hero-slots-one.mjs            the guard
//   node tests/hero-slots-one.mjs --mutate   every planted defect must turn it red
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import { setGold, goldOf } from './_gold.mjs';
import { isMain } from './_is-main.mjs';

const BEFORE = '2027-03-24-rune-supply.sql';
const MIG = '2027-03-25-hero-slots-one.sql';
/* The whole 2027-03-25 lane in apply order (the death pair first), so HS-0 proves every one of them re-applies byte for byte. */
const FILES = ['2027-03-25-death-share.sql', '2027-03-25-death-share-hunt-sessions-catalogue.generated.sql',
  MIG, '2027-03-25-hero-slots-one-unlocks.generated.sql', '2027-03-25-hero-slots-one-unlock-offers.generated.sql'];
const SELF_CHECK = '-- ── §2 SELF-CHECK';
const COLORS = '{"head": 13, "body": 5, "legs": 3, "feet": 0}';
/* The ruled ladder (Tyler 2026-11-09, the designer's table E): slot id -> gold. */
const LADDER = Object.freeze({ 1: 300000, 2: 750000, 3: 1500000 });

/* Each mutant edits MIG's text and drops its §2 (so it is this guard, not the file's own check, that must see it). */
const MUTATIONS = {
  slot_one_still_free: { why: 'slot 1 stays a starter: every new account owns two slots and the 300,000 sink is never paid',
    find: '     set starter = false, cost_gold = l.cost', repl: '     set starter = h.starter, cost_gold = l.cost' },
  second_slot_cheap: { why: 'a typo prices the second hero at 30,000: a day of play, not a week',
    find: '(values (1, 300000::bigint),', repl: '(values (1, 30000::bigint),' },
  live_hero_evicted: { why: 'the file "tidies" heroes standing in the old free slot: an admin write to a live character (CLAUDE.md §2)',
    find: "   where h.slot_id = l.slot_id and (h.starter or h.cost_gold is distinct from l.cost);",
    repl: "   where h.slot_id = l.slot_id and (h.starter or h.cost_gold is distinct from l.cost);\n  delete from public.player_state where slot = 1;" },
};

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const u = (p) => new URL('../' + p, import.meta.url).href;

async function run(mutate) {
  const m = mutate ? MUTATIONS[mutate] : null;
  const { db } = await bootReplay({ upTo: BEFORE });
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const as = async (uid, sql, p) => {
    await q('delete from public.hr_rate_counters');
    await q("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
      [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await db.exec('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    catch (e) { return { thrown: String(e.message).split('\n')[0] }; }
    finally { await db.exec('reset role'); await q("select set_config('request.jwt.claim.sub', '', false)"); }
  };
  let seq = 0;
  const account = async (tag) => {
    const uid = (await q('select gen_random_uuid() as i'))[0].i;
    await q('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
    await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
    return { uid, tag };
  };
  const hero = (a, slot) => { const n = a.tag + 'abcde'[slot] + 'qrstuvwxyz'[seq++ % 10];
    return as(a.uid, 'select public.hr_create_hero($1, $2, $3::jsonb, $4::uuid) as r', [slot, n, COLORS, crypto.randomUUID()]); };
  const buy = (a, slotId) => as(a.uid, 'select public.hr_buy_hero_slot($1, $2, $3) as r', [slotId, 0, crypto.randomUUID()]);
  const load = (a, slot) => as(a.uid, 'select public.hr_load($1) as r', [slot]);
  const owned = async (a) => (await q('select public.hr_hero_slots_of($1) as r', [a.uid]))[0]?.r;
  const heroesOf = async (a) => q('select slot, md5(to_jsonb(ps)::text) h from public.player_state ps where user_id = $1 order by slot', [a.uid]);
  const o = {};

  // ── THE LIVE ACCOUNTS, MADE THE PRODUCTION WAY BEFORE THE FILES ──
  const full = await account('Holdfast');
  o.fullMade = [await hero(full, 0), await hero(full, 1)];
  const old2 = Number((await q('select cost_gold::text c from public.hr_hero_slots where slot_id = 2'))[0].c);
  await setGold(q, full.uid, 0, old2);
  o.fullBought = await buy(full, 2);
  o.fullMade.push(await hero(full, 2));
  o.fullBefore = await heroesOf(full);
  const lone = await account('Lonely');
  o.loneMade = await hero(lone, 0);
  o.loneOwnedBefore = await owned(lone);
  o.loneBefore = await heroesOf(lone);

  // ── HS-0: THE THREE FILES, AS THE APPLY TOOL RUNS THEM, THEN A SECOND TIME ──
  const textOf = async (f) => {
    let t = (await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8')).replace(/\r\n/g, '\n');
    if (m && f === MIG) {
      if (t.split(m.find).length !== 2) throw Object.assign(new Error(`mutant ${mutate}: anchor not found once in ${MIG}`), { harness: true });
      t = t.replace(m.find, () => m.repl);
      t = t.slice(0, t.indexOf(SELF_CHECK));
    }
    return t;
  };
  const state = async () => JSON.stringify([await inventory(db),
    await q(`select p.oid::regprocedure::text f, md5(p.prosrc) h, coalesce(p.proacl::text, '') a from pg_proc p
              where p.pronamespace = 'public'::regnamespace order by 1`),
    await q('select * from public.hr_hero_slots order by slot_id'),
    await q('select unlock_id from public.hr_unlocks order by 1'),
    await q('select offer_id from public.hr_unlock_offers order by 1'),
    await q('select user_id, slot, md5(to_jsonb(ps)::text) from public.player_state ps order by 1, 2')]);
  o.applyErr = null;
  for (const f of FILES) { try { await db.exec(await textOf(f)); } catch (e) { o.applyErr = f + ': ' + String(e.message).split('\n')[0]; break; } }
  if (!o.applyErr) {
    const first = await state();
    for (const f of FILES) { try { await db.exec(await textOf(f)); } catch (e) { o.reapplyErr = f + ': ' + String(e.message).split('\n')[0]; break; } }
    o.reapplySame = first === await state();
  }

  // ── HS-1: THE CATALOGUES ──
  o.catalogue = (await q('select slot_id, cost_gold::text c, starter from public.hr_hero_slots order by slot_id'))
    .map((r) => `${r.slot_id}:${r.c}:${r.starter}`).join(',');
  o.playCap = Number((await q("select public.hr_hunt_limit('max_concurrent')::text v"))[0].v);
  o.unlocks = (await q("select unlock_id from public.hr_unlocks where unlock_id like 'character\\_slot:%' order by 1")).map((r) => r.unlock_id).join(',');
  o.offers = (await q("select offer_id from public.hr_unlock_offers where offer_id like 'character\\_slot.%' order by 1")).map((r) => r.offer_id).join(',');
  const shops = await import(u('src/data/shops.js'));
  o.shop = shops.SHOP_OFFERS.filter((x) => x.table === 'character_slot')
    .map((x) => x.id + '=' + ((x.cost || []).find((l) => l.kind === 'currency' && l.id === 'gold') || {}).amount).join(',');

  // ── HS-2: A NEW ACCOUNT, THROUGH THE REAL WRAPPER ──
  const neu = await account('Newcome');
  o.newOwned0 = await owned(neu);
  o.newMade = [await hero(neu, 0)];
  o.acc0 = (await load(neu, 0))?.account;
  o.create1Unpaid = await as(neu.uid, 'select public.hr_create_character(1) as r');
  await setGold(q, neu.uid, 0, LADDER[1] - 1);
  o.buy2First = await buy(neu, 2);
  o.buy1Short = await buy(neu, 1);
  o.goldShort = await goldOf(q, neu.uid, 0);

  // ── HS-3: THE CHARACTERS SCREEN, ON THE REPLAY'S OWN ANSWERS ──
  const { AccountSession } = await import(u('src/session/account-session.js'));
  const SO = await import(u('src/app/slot-offer.js'));
  const screen = async (a) => {
    const server = { rpc: async (name, args) => {
      if (name !== 'hr_load') return { ok: true, status: 200, body: { ok: false, error: 'unknown' }, closed: false };
      return { ok: true, status: 200, body: await load(a, args.p_slot), closed: false };
    } };
    const auth = { userId: () => a.uid, token: () => 'jwt', signOut: async () => {} };
    const tab = { get: () => null, set: () => true, remove: () => {}, keys: () => [] };
    const acc = new AccountSession({ auth, server, tab, channel: () => () => {} });
    const rows = await acc.roster();
    return { offer: acc.slotOffer, html: SO.slotOfferHtml(acc.slotOffer, rows, {}),
      line: SO.playLineOf(acc.statedLimit(), acc.limit(), rows.length, acc.slotOffer, rows) };
  };
  o.at1 = await screen(neu);
  await setGold(q, neu.uid, 0, LADDER[1] + LADDER[2] + LADDER[3] + 9);
  o.buy1 = await buy(neu, 1);
  o.newMade.push(await hero(neu, 1));
  o.at2 = await screen(neu);
  o.buy2 = await buy(neu, 2);
  o.buy3 = await buy(neu, 3);
  o.buy4 = await buy(neu, 4);
  o.newOwnedEnd = await owned(neu);
  o.newLedger = (await q("select gold::text g from public.player_ledger where user_id = $1 and kind = 'hero_slot' order by id", [neu.uid])).map((r) => Number(r.g));

  // ── HS-4 / HS-5: THE LIVE ACCOUNTS AFTER THE FILES ──
  o.fullAfter = await heroesOf(full);
  o.fullOwned = await owned(full);
  o.fullOffer = (await load(full, 0))?.account?.hero_slot_offer;
  o.loneAfter = await heroesOf(lone);
  o.loneOwned = await owned(lone);
  o.loneOffer = (await load(lone, 0))?.account?.hero_slot_offer;
  await db.close?.();
  return o;
}

function grade(o) {
  const js = (v) => JSON.stringify(v);
  ok(o.fullMade.every((h) => h?.ok === true) && o.fullBought?.ok === true && o.loneMade?.ok === true && js(o.loneOwnedBefore) === '[0,1]',
    `FIXTURE: the live accounts could not be made the production way: ${js([o.fullMade, o.fullBought, o.loneMade, o.loneOwnedBefore])}`);
  ok(!o.applyErr, `HS-0: the files refused over live accounts: ${o.applyErr}`);
  ok(!o.reapplyErr && o.reapplySame === true, `HS-0: a second apply ${o.reapplyErr ? 'raised ' + o.reapplyErr : 'moved a table, a row, a body, a grant or a hero'}`);

  ok(o.catalogue === Object.entries(LADDER).map(([s, c]) => `${s}:${c}:false`).join(','),
    `HS-1: hr_hero_slots reads ${o.catalogue}, not the ruled ladder with no starter`);
  ok(o.playCap === 4, `HS-1: the play cap is ${o.playCap}, not 4`);
  ok(o.shop === Object.entries(LADDER).map(([s, c]) => `character_slot.${s}=${c}`).join(','), `HS-1: src/data/shops.js sells ${o.shop}`);
  ok(o.unlocks === 'character_slot:1,character_slot:2,character_slot:3', `HS-1: hr_unlocks names hero slots ${o.unlocks}`);
  ok(o.offers === 'character_slot.1,character_slot.2,character_slot.3', `HS-1: hr_unlock_offers names hero slots ${o.offers}`);

  ok(js(o.newOwned0) === '[0]', `HS-2: a new account owns ${js(o.newOwned0)}, expected slot 0 alone`);
  ok(o.newMade[0]?.ok === true, `FIXTURE: the new account's first hero: ${js(o.newMade[0])}`);
  ok(o.acc0?.hero_slots_max === 4 && o.acc0?.hero_slot_offer?.slot_id === 1 && o.acc0?.hero_slot_offer?.cost_gold === LADDER[1],
    `HS-2: a new account's envelope reads ${js(o.acc0)} (expected four in all, the second hero at ${LADDER[1]})`);
  ok(o.create1Unpaid?.error === 'slot_not_owned', `HS-2: a hero in the unbought slot 1 answered ${js(o.create1Unpaid)}`);
  ok(o.buy2First?.error === 'requires_previous_slot', `HS-2: slot 2 before slot 1 answered ${js(o.buy2First)}`);
  ok(o.buy1Short?.error === 'insufficient_gold' && o.goldShort === LADDER[1] - 1, `HS-2: one gold short answered ${js(o.buy1Short)} (purse ${o.goldShort})`);
  ok(o.buy1?.ok === true && o.buy1?.hero_slot_offer?.slot_id === 2 && o.buy1?.hero_slot_offer?.cost_gold === LADDER[2], `HS-2: slot 1 answered ${js(o.buy1)}`);
  ok(o.newMade[1]?.ok === true, `HS-2: a hero in the bought slot 1 answered ${js(o.newMade[1])}`);
  ok(o.buy2?.ok === true && o.buy3?.ok === true && o.buy3?.hero_slot_offer === null && o.buy3?.hero_slots_max === 4,
    `HS-2: climbing the ladder answered ${js([o.buy2, o.buy3])}`);
  ok(o.buy4?.error === 'slot_cap', `HS-2: a fifth slot answered ${js(o.buy4)}`);
  ok(js(o.newOwnedEnd) === '[0,1,2,3]' && js(o.newLedger) === js([-LADDER[1], -LADDER[2], -LADDER[3]]),
    `HS-2: the ladder left the account owning ${js(o.newOwnedEnd)} and journalled ${js(o.newLedger)}`);

  ok(js(o.at1.offer) === js({ slotId: 1, cost: LADDER[1], max: 4 }), `HS-3: at one hero the offer is ${js(o.at1.offer)}`);
  ok(o.at1.html.includes('A second hero slot costs 300,000 gold. An account holds up to 4 heroes.')
     && o.at1.html.includes('Most players can buy a second hero after about a week. Until then, use Find a party in the Party window to hunt with other players.')
     && o.at1.html.includes('Buy a hero slot for 300,000 gold'),
    `HS-3: at one hero the offer reads ${js(o.at1.html)}`);
  ok(o.at1.line === 'You own 1 hero slot. Up to 4 heroes can play at once, and more slots cost gold.', `HS-3: at one hero the line reads ${js(o.at1.line)}`);
  ok(o.at2.html.includes('A third hero slot costs 750,000 gold.') && !o.at2.html.includes('Most players can buy a second hero'),
    `HS-3: at two heroes the offer reads ${js(o.at2.html)} (the third at 750,000, no one-hero note)`);

  ok(js(o.fullAfter) === js(o.fullBefore) && o.fullAfter.length === 3, `HS-4: the live account's heroes moved: ${js(o.fullBefore)} -> ${js(o.fullAfter)}`);
  ok(js(o.fullOwned) === '[0,1,2]' && o.fullOffer?.slot_id === 3 && o.fullOffer?.cost_gold === LADDER[3],
    `HS-4: the live account owns ${js(o.fullOwned)} and is offered ${js(o.fullOffer)} (expected 0-2 kept and slot 3 at ${LADDER[3]})`);
  ok(js(o.loneAfter) === js(o.loneBefore), `HS-5: the one-hero account's hero moved: ${js(o.loneBefore)} -> ${js(o.loneAfter)}`);
  ok(js(o.loneOwned) === '[0]' && o.loneOffer?.slot_id === 1 && o.loneOffer?.cost_gold === LADDER[1],
    `HS-5: the account whose free slot 1 was empty owns ${js(o.loneOwned)} and is offered ${js(o.loneOffer)}`);
}

export async function heroSlotsOneGuard() {
  problems.length = 0;
  grade(await run());
  return [...problems];
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) {
    let missed = 0;
    for (const id of Object.keys(MUTATIONS)) {
      problems.length = 0;
      let caught;
      try { grade(await run(id)); caught = problems.length > 0; }
      catch (e) { if (e.harness) throw e; caught = true; }
      console.log(`${caught ? 'CAUGHT' : 'MISSED'}  ${id}${caught ? '  (' + (problems[0] || 'the run threw').slice(0, 140) + ')' : '  ' + MUTATIONS[id].why}`);
      if (!caught) missed++;
    }
    console.log(missed ? `\n${missed} mutation(s) NOT caught` : `\nall ${Object.keys(MUTATIONS).length} mutations caught`);
    process.exit(missed ? 1 : 0);
  }
  const p = await heroSlotsOneGuard();
  if (p.length) { console.error(`hero-slots-one: ${p.length} problem(s)`); for (const x of p) console.error('  ✗ ' + x); process.exit(1); }
  console.log('hero-slots-one: green - one hero slot to start, 300,000 / 750,000 / 1,500,000 in order at exactly their prices, '
    + 'the characters screen says so with the one-hero note; live heroes and held slots untouched, an empty free slot 1 no longer owned; '
    + 'the files apply over live accounts and re-apply byte for byte.');
}
