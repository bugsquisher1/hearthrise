#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/four-hero-slots.mjs — FOUR HEROES AN ACCOUNT (Tyler 2026-11-07: "lets get rid
// of the 5th character slot"), server to screen.
//
// Ships with: supabase/migrations/2027-03-22-four-slots.sql and its two generated
// siblings (2027-03-22-catalogue-cuts-unlocks / -unlock-offers.generated.sql, one pair shared with lane/c-dead-plot-deed).
//
// ONE replay of the chain up to the file before them; an OLD account is made the
// production way first (it buys slot 4 at the old ladder and makes a hero there, the
// shape one abandoned production account holds), then the three files apply, twice.
//   FS-0  the three files apply over that account, and a second apply moves nothing
//   FS-1  the catalogue: 1 starter / 25,000 / 75,000; four heroes, the play cap; the
//         shop, the unlock ids and the unlock offers carry no slot 4
//   FS-2  a NEW account through the real wrapper: slot 4 is slot_cap {max 4} before
//         and after the ladder, never offered, never creatable; the ladder costs exactly
//         its two prices
//   FS-3  the CHARACTERS SCREEN (AccountSession.roster + src/app/slot-offer.js) on the
//         replay's own hr_load answers: at three heroes it offers the fourth at the
//         server's price and says four in all; at four it offers nothing
//   FS-4  the OLD account: its slot-4 hero is untouched, loads and is listed; it is
//         offered nothing, and slot 4 is slot_cap
//
//   node tests/four-hero-slots.mjs            the guard
//   node tests/four-hero-slots.mjs --mutate   every planted defect must turn it red
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import { setGold, goldOf } from './_gold.mjs';
import { isMain } from './_is-main.mjs';

const BEFORE = '2027-03-21-sewer-deadly-xp.generated.sql';
const MIG = '2027-03-22-four-slots.sql';
const FILES = [MIG, '2027-03-22-catalogue-cuts-unlocks.generated.sql', '2027-03-22-catalogue-cuts-unlock-offers.generated.sql'];
const SELF_CHECK = '-- ── §2 SELF-CHECK';
const COLORS = '{"head": 13, "body": 5, "legs": 3, "feet": 0}';

/* Each mutant edits MIG's text and drops its §2 (so it is this guard, not the file's own check, that must see it). */
const MUTATIONS = {
  slot_still_sold: { why: 'the fifth slot stays in the catalogue: it is offered at 250,000 and sold',
    find: 'delete from public.hr_hero_slots where slot_id = 4 and not starter;', repl: 'select 1;' },
  wrong_slot_cut: { why: 'the delete takes the fourth hero\'s slot instead: a three-hero ladder',
    find: 'delete from public.hr_hero_slots where slot_id = 4 and not starter;', repl: 'delete from public.hr_hero_slots where slot_id >= 3 and not starter;' },
  old_hero_evicted: { why: 'the file "tidies" the abandoned slot-4 hero away: an admin write to a real character (CLAUDE.md §2)',
    find: 'delete from public.hr_hero_slots where slot_id = 4 and not starter;',
    repl: 'delete from public.hr_hero_slots where slot_id = 4 and not starter;\ndelete from public.player_state where slot = 4;' },
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
  const o = {};

  // ── THE OLD ACCOUNT, MADE THE PRODUCTION WAY BEFORE THE FILES: five heroes, slot 4 bought ──
  const old = await account('Oldhand');
  o.oldMade = [await hero(old, 0), await hero(old, 1)];
  const ladder = (await q('select slot_id, cost_gold::text c from public.hr_hero_slots where not starter order by slot_id')).map((r) => [r.slot_id, Number(r.c)]);
  await setGold(q, old.uid, 0, ladder.reduce((s, [, c]) => s + c, 0));
  o.oldBought = [];
  for (const [id] of ladder) { o.oldBought.push(await buy(old, id)); o.oldMade.push(await hero(old, id)); }
  o.oldBefore = (await q('select slot, md5(to_jsonb(ps)::text) h from public.player_state ps where user_id = $1 order by slot', [old.uid]));

  // ── FS-0: THE THREE FILES, AS THE APPLY TOOL RUNS THEM, THEN A SECOND TIME ──
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
    await q('select offer_id from public.hr_unlock_offers order by 1')]);
  o.applyErr = null;
  for (const f of FILES) { try { await db.exec(await textOf(f)); } catch (e) { o.applyErr = f + ': ' + String(e.message).split('\n')[0]; break; } }
  if (!o.applyErr) {
    const first = await state();
    for (const f of FILES) { try { await db.exec(await textOf(f)); } catch (e) { o.reapplyErr = f + ': ' + String(e.message).split('\n')[0]; break; } }
    o.reapplySame = first === await state();
  }

  // ── FS-1: THE CATALOGUES ──
  o.catalogue = (await q('select slot_id, cost_gold::text c, starter from public.hr_hero_slots order by slot_id'))
    .map((r) => `${r.slot_id}:${r.c}:${r.starter}`).join(',');
  o.playCap = Number((await q("select public.hr_hunt_limit('max_concurrent')::text v"))[0].v);
  o.unlock4 = (await q("select count(*)::int n from public.hr_unlocks where unlock_id = 'character_slot:4'"))[0].n;
  o.offer4 = (await q("select count(*)::int n from public.hr_unlock_offers where offer_id = 'character_slot.4'"))[0].n;
  const shops = await import(u('src/data/shops.js'));
  o.shopSlots = shops.SHOP_OFFERS.filter((x) => x.table === 'character_slot').map((x) => x.id).join(',');
  const { SESSION_CONFIG } = await import(u('src/session/config.js'));
  o.maxConcurrent = SESSION_CONFIG.maxConcurrentCharacters;

  // ── FS-2: A NEW ACCOUNT, THROUGH THE REAL WRAPPER ──
  const neu = await account('Newcome');
  o.newMade = [await hero(neu, 0), await hero(neu, 1)];
  await setGold(q, neu.uid, 0, 25000 + 75000 + 11);
  o.acc0 = (await load(neu, 0))?.account;
  o.gold4First = await goldOf(q, neu.uid, 0);
  o.buy4First = await buy(neu, 4);
  o.gold4First = [o.gold4First, await goldOf(q, neu.uid, 0)];
  o.buy2 = await buy(neu, 2);
  o.newMade.push(await hero(neu, 2));

  // ── FS-3: THE CHARACTERS SCREEN, ON THE REPLAY'S OWN ANSWERS ──
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
    return { rows: rows.map((r) => `${r.slot}:${r.exists ? r.name : '-'}`).join(','), offer: acc.slotOffer,
      html: SO.slotOfferHtml(acc.slotOffer, rows, {}), line: SO.playLineOf(acc.statedLimit(), acc.limit(), rows.length, acc.slotOffer, rows) };
  };
  o.at3 = await screen(neu);
  o.buy3 = await buy(neu, 3);
  o.newMade.push(await hero(neu, 3));
  o.at4 = await screen(neu);
  o.gold4Last = await goldOf(q, neu.uid, 0);
  o.buy4Last = await buy(neu, 4);
  o.create4 = await as(neu.uid, 'select public.hr_create_character(4) as r');
  o.gold4Last = [o.gold4Last, await goldOf(q, neu.uid, 0)];
  o.newLedger = (await q("select gold::text g from public.player_ledger where user_id = $1 and kind = 'hero_slot' order by at", [neu.uid])).map((r) => Number(r.g));

  // ── FS-4: THE OLD ACCOUNT AFTER THE FILES ──
  o.oldAfter = (await q('select slot, md5(to_jsonb(ps)::text) h from public.player_state ps where user_id = $1 order by slot', [old.uid]));
  o.oldLoad4 = await load(old, 4);
  o.oldScreen = await screen(old);
  o.oldBuy4 = await buy(old, 4);
  await db.close?.();
  return o;
}

function grade(o) {
  const js = (v) => JSON.stringify(v);
  ok(o.oldMade.every((h) => h?.ok === true) && o.oldBought.length === 3 && o.oldBought.every((b) => b?.ok === true),
    `FIXTURE: the old account could not be made the production way: ${js([o.oldMade, o.oldBought])}`);
  ok(!o.applyErr, `FS-0: the files refused over an account holding a slot-4 hero: ${o.applyErr}`);
  ok(!o.reapplyErr && o.reapplySame === true, `FS-0: a second apply ${o.reapplyErr ? 'raised ' + o.reapplyErr : 'moved a table, a row, a body or a grant'}`);

  ok(o.catalogue === '1:0:true,2:25000:false,3:75000:false', `FS-1: hr_hero_slots reads ${o.catalogue}, not 1 starter / 25,000 / 75,000`);
  ok(o.playCap === 4 && o.maxConcurrent === 4, `FS-1: the play cap is ${o.playCap} (server) / ${o.maxConcurrent} (client), not 4`);
  ok(o.unlock4 === 0 && o.offer4 === 0, `FS-1: the generated catalogues still name slot 4 (hr_unlocks ${o.unlock4}, hr_unlock_offers ${o.offer4})`);
  /* The shop's ladder moved on since (2027-03-25-hero-slots-one.sql sells slot 1 too, tests/hero-slots-one.mjs); this file's
     property is that it never sells a fifth hero. */
  ok(o.shopSlots && !o.shopSlots.split(',').includes('character_slot.4'), `FS-1: src/data/shops.js sells hero slots ${o.shopSlots}`);

  ok(o.newMade.every((h) => h?.ok === true), `FIXTURE: the new account's heroes: ${js(o.newMade)}`);
  ok(o.acc0?.hero_slots_max === 4 && o.acc0?.hero_slot_offer?.slot_id === 2 && o.acc0?.hero_slot_offer?.cost_gold === 25000,
    `FS-2: a new account's envelope reads ${js(o.acc0)} (expected four in all, the third hero at 25,000)`);
  ok(o.buy4First?.error === 'slot_cap' && Number(o.buy4First?.max) === 4, `FS-2: slot 4 before the ladder answered ${js(o.buy4First)}`);
  ok(o.buy2?.ok === true && o.buy2?.hero_slot_offer?.slot_id === 3 && o.buy2?.hero_slots_max === 4, `FS-2: slot 2 answered ${js(o.buy2)}`);
  ok(o.buy3?.ok === true && o.buy3?.hero_slot_offer === null && o.buy3?.hero_slots_max === 4,
    `FS-2: the fourth hero's slot answered ${js(o.buy3)} (expected ok, nothing more for sale, four in all)`);
  ok(o.buy4Last?.error === 'slot_cap' && Number(o.buy4Last?.max) === 4, `FS-2: slot 4 at the top of the ladder answered ${js(o.buy4Last)}`);
  ok(o.create4?.error === 'slot_not_owned', `FS-2: a hero in slot 4 answered ${js(o.create4)}`);
  ok(js(o.newLedger) === js([-25000, -75000]) && o.gold4First[0] === o.gold4First[1] && o.gold4Last[0] === o.gold4Last[1],
    `FS-2: the ladder journalled ${js(o.newLedger)} (expected -25,000 then -75,000), and a slot-4 refusal moved gold ${js([o.gold4First, o.gold4Last])}`);

  ok(o.at3.rows === '0:' + o.newMade[0]?.name + ',1:' + o.newMade[1]?.name + ',2:' + o.newMade[2]?.name,
    `FS-3: at three heroes the roster lists ${o.at3.rows}`);
  ok(js(o.at3.offer) === '{"slotId":3,"cost":75000,"max":4}', `FS-3: at three heroes the offer is ${js(o.at3.offer)}`);
  ok(o.at3.html.includes('A fourth hero slot costs 75,000 gold. An account holds up to 4 heroes.')
     && o.at3.html.includes('Buy a hero slot for 75,000 gold') && !/\b5 heroes|fifth/.test(o.at3.html),
    `FS-3: at three heroes the offer reads ${js(o.at3.html)}`);
  ok(o.at3.line === 'You own 3 hero slots. Up to 4 heroes can play at once, and more slots cost gold.',
    `FS-3: at three heroes the line over the roster reads ${js(o.at3.line)}`);
  ok(o.at4.rows.split(',').length === 4 && o.at4.offer === null && o.at4.html === '' && o.at4.line === 'Up to 4 can play at once.',
    `FS-3: at four heroes the screen reads ${js(o.at4)} (expected four rows, no offer, "Up to 4 can play at once.")`);

  ok(js(o.oldAfter) === js(o.oldBefore) && o.oldAfter.length === 5, `FS-4: the old account's heroes moved: ${js(o.oldBefore)} -> ${js(o.oldAfter)}`);
  ok(o.oldLoad4?.ok === true && o.oldLoad4?.name === o.oldMade[4]?.name && o.oldLoad4?.account?.hero_slot_offer === null
     && o.oldLoad4?.account?.hero_slots_max === 4,
    `FS-4: the old slot-4 hero loads as ${js({ ok: o.oldLoad4?.ok, name: o.oldLoad4?.name, error: o.oldLoad4?.error, account: o.oldLoad4?.account })}`);
  ok(o.oldScreen.rows.split(',').length === 5 && o.oldScreen.rows.startsWith('0:') && o.oldScreen.rows.includes('4:' + o.oldMade[4]?.name)
     && o.oldScreen.offer === null && o.oldScreen.html === '' && o.oldScreen.line === 'Up to 4 can play at once.',
    `FS-4: the old account's screen reads ${js(o.oldScreen)} (expected its five heroes listed, no offer)`);
  ok(o.oldBuy4?.error === 'slot_cap', `FS-4: the old account buying slot 4 answered ${js(o.oldBuy4)}`);
}

export async function fourHeroSlotsGuard() {
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
      console.log(`${caught ? 'CAUGHT' : 'MISSED'}  ${id}${caught ? '  (' + (problems[0] || 'the run threw').slice(0, 120) + ')' : '  ' + MUTATIONS[id].why}`);
      if (!caught) missed++;
    }
    console.log(missed ? `\n${missed} mutation(s) NOT caught` : `\nall ${Object.keys(MUTATIONS).length} mutations caught`);
    process.exit(missed ? 1 : 0);
  }
  const p = await fourHeroSlotsGuard();
  if (p.length) { console.error(`four-hero-slots: ${p.length} problem(s)`); for (const x of p) console.error('  ✗ ' + x); process.exit(1); }
  console.log('four-hero-slots: green - four heroes an account, the play cap; slot 4 is never offered, sold or made; '
    + 'three heroes are offered the fourth at the server\'s price, four are offered nothing; the old slot-4 hero is kept and listed; '
    + 'the files apply over it and re-apply byte for byte.');
}
