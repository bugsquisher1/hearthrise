#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/throne-room.mjs — THE CASTLE'S RECURRING GOLD SINK, driven through the
// REAL spend RPC on a replayed chain (PGlite, no credentials).
//
//   node tests/throne-room.mjs             # the guard
//   node tests/throne-room.mjs --selftest  # every mutation must be CAUGHT
//   node tests/throne-room.mjs --list
//
// Ships with: src/data/throne-room.js · tools/gen-throne-room.mjs ·
//             supabase/migrations/2026-10-08-throne-room.sql ·
//             supabase/functions/hr-accrue/gold-ladder-catalogue.js
//
// WHY (lane econ-crew-and-sink, 2026-10-08): tools/econ-sim.mjs measured a
// maxed player owning every gold sink by day 15-17 and banking ~2.6M/day with
// nothing left to buy. The Throne Room is thirty castle-gated, gold-only
// furnishings sold by the existing hr_unlock_buy. What must hold:
//   T1  THE DATA. Thirty rungs, prices on the curve and strictly rising, gold
//       only, castle-gated, offer ids disjoint from every other ladder, the hall
//       named at 10/20/30.
//   T2  THE EDGE FORWARDS EXACTLY THE THIRTY. isGoldLadderOffer() says yes to
//       throne_room.1..30 and no to .0/.31/a near-miss — the Edge can name an
//       offer, never a price.
//   T3  THE SERVER SELLS IT AS DESIGNED. On the replayed chain, as hr_engine
//       (the only caller): refused below the castle; the whole room bought rung
//       by rung at EXACTLY the data's price; one ledger row per piece; rung 31
//       does not exist; NOTHING but gold and the rung moves (xp, items, gems).
//   T4  RE-APPLY IS A NO-OP. Applying the migration a second time leaves both
//       catalogues byte-identical.
//
// WHAT IT CANNOT PROVE: concurrency (PGlite is one backend), the PostgREST /
// Deno path, or anything about production rows.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { bootReplay, LAST_PATCHED, ROOT } from './schema-replay.mjs';
import {
  THRONE_ROOM_PIECES, THRONE_ROOM_OFFERS, THRONE_ROOM_RUNGS, THRONE_ROOM_REQ_TIER,
  THRONE_ROOM_UNLOCK, throneRoomRungPrice, throneRoomHallName,
} from '../src/data/throne-room.js';
import { GOLD_LADDER_OFFER_IDS } from '../src/data/gold-ladders.js';
import { COMPANION_OFFER_IDS } from '../src/data/companion-unlocks.js';
import { isGoldLadderOffer } from '../supabase/functions/hr-accrue/gold-ladder-catalogue.js';

const MIG = '2026-10-08-throne-room.sql';

/* The migration's own §3/§4 self-checks, short-circuited, so a mutant that they
   would ALSO catch is caught here by THIS guard and not by them. */
const GATE_BLIND = [
  ['declare v_n int; v_bad text; v_p oid; v_prices bigint[];\nbegin\n',
    'declare v_n int; v_bad text; v_p oid; v_prices bigint[];\nbegin\n  if true then return; end if;   -- selftest: §3 short-circuited\n'],
  ['  v_led  int; v_prog0 int; v_prog1 int;\nbegin\n',
    '  v_led  int; v_prog0 int; v_prog1 int;\nbegin\n  if true then return; end if;   -- selftest: §4 short-circuited\n'],
];

const MUTATIONS = {
  castle_gate_dropped: {
    why: 'the first piece sold at property tier 0 — the castle\'s sink open to a level-1 camp, and '
       + 'the gate the whole ladder is priced against gone',
    find: "'throne_room', 1, 500000, '{}'::jsonb, 5, null,",
    repl: "'throne_room', 1, 500000, '{}'::jsonb, 0, null,",
  },
  cheap_first_piece: {
    why: 'the first piece priced at 5 gold: the server charges a number the screen never showed',
    find: "'throne_room', 1, 500000,",
    repl: "'throne_room', 1, 5,",
  },
  ladder_ceiling_short: {
    why: 'the merge catalogue stops at 29: the thirtieth piece — The Throne — can never be recorded, '
       + 'so the player who saved 37M for it is refused at the end of the spine',
    find: "'throne_room', 'max', 'unlock', 30, array[",
    repl: "'throne_room', 'max', 'unlock', 29, array[",
  },
  item_line_on_a_piece: {
    why: 'a piece quietly grows an item cost the data does not show, so the buy is refused '
       + 'insufficient_item on a screen that only asked for gold',
    find: "'throne_room', 3, 673000, '{}'::jsonb,",
    repl: "'throne_room', 3, 673000, '{\"gold_bar\":1}'::jsonb,",
  },
};
for (const id of Object.keys(MUTATIONS)) {
  if (id.endsWith('_blind')) continue;
  MUTATIONS[`${id}_gate_blind`] = { ...MUTATIONS[id], why: `${MUTATIONS[id].why} — with the migration's own §3/§4 short-circuited`, blind: true };
}

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

function patchesFor(mutate) {
  if (!mutate) return undefined;
  const m = MUTATIONS[mutate];
  if (!m) { const e = new Error(`unknown mutation: ${mutate}`); e.harness = true; throw e; }
  return new Map([[MIG, [[m.find, m.repl], ...(m.blind ? GATE_BLIND : [])]]]);
}

// ── T1 / T2 — pure data and the Edge forward set ────────────────────────────
function dataArms() {
  ok(THRONE_ROOM_PIECES.length === 30 && THRONE_ROOM_RUNGS === 30, `T1: ${THRONE_ROOM_PIECES.length} pieces, expected 30`);
  let prev = 0; let total = 0;
  for (const o of THRONE_ROOM_OFFERS) {
    ok(o.gold === throneRoomRungPrice(o.value), `T1: ${o.offer_id} price ${o.gold} is off the curve`);
    ok(o.gold > prev, `T1: ${o.offer_id} (${o.gold}) does not rise above the previous piece (${prev})`);
    ok(Object.keys(o.items).length === 0, `T1: ${o.offer_id} carries an item cost — the Throne Room is gold-only`);
    ok(o.req_property_tier === THRONE_ROOM_REQ_TIER && THRONE_ROOM_REQ_TIER === 5, `T1: ${o.offer_id} is not castle-gated`);
    prev = o.gold; total += o.gold;
  }
  ok(THRONE_ROOM_OFFERS[0].gold <= 600000, `T1: the first piece costs ${THRONE_ROOM_OFFERS[0].gold} — a new castle owner must reach it`);
  ok(total >= 200e6, `T1: the whole room is ${total} — under 200M a maxed player finishes it before day 90 (econ-sim)`);
  ok(new Set(THRONE_ROOM_PIECES.map((p) => p.name)).size === 30, 'T1: two pieces share a name');
  ok(THRONE_ROOM_PIECES[29].name === 'The Throne', 'T1: the last piece is not The Throne');
  ok(throneRoomHallName(9) === '' && throneRoomHallName(10) && throneRoomHallName(30) === 'A Throne Room',
    'T1: the hall is not named at 10 / 30 pieces');
  ok(JSON.stringify([...THRONE_ROOM_UNLOCK.rungs]) === JSON.stringify(Array.from({ length: 30 }, (_, i) => i + 1)),
    'T1: the merge ladder is not 1..30');
  const other = new Set([...GOLD_LADDER_OFFER_IDS, ...COMPANION_OFFER_IDS]);
  ok(THRONE_ROOM_OFFERS.every((o) => !other.has(o.offer_id)), 'T1: a throne-room offer id collides with another ladder');

  for (const o of THRONE_ROOM_OFFERS) ok(isGoldLadderOffer(o.offer_id), `T2: the Edge does not forward ${o.offer_id}`);
  for (const bad of ['throne_room.0', 'throne_room.31', 'throne_room', 'throne_room.1 ', 'throne_room.01', 'constructor']) {
    ok(!isGoldLadderOffer(bad), `T2: the Edge forwards '${bad}'`);
  }
}

// ── T3 / T4 — the real RPC on the replayed chain ────────────────────────────
async function dbArms(mutate) {
  const { db } = await bootReplay({ patches: patchesFor(mutate), upTo: mutate ? LAST_PATCHED : MIG });
  try {
    const q = async (sql, p) => (await db.query(sql, p)).rows;
    const asEngine = async (sql, p) => {
      await db.exec('set role hr_engine');
      try { return (await db.query(sql, p)).rows; } finally { await db.exec('reset role'); }
    };
    const gate = () => q('delete from public.hr_rate_counters');
    const uid = (await q('select gen_random_uuid() as i'))[0].i;
    await q('insert into auth.users (id) values ($1) on conflict do nothing', [uid]);
    await gate();
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('select public.hr_create_character(0)');
    const START = 1_000_000_000;
    await q('update public.player_state set gold = $2 where user_id = $1 and slot = 0', [uid, START]);
    const verOf = async () => Number((await q('select version::text v from public.player_state where user_id=$1 and slot=0', [uid]))[0].v);
    const goldOf = async () => Number((await q('select gold::text g from public.player_state where user_id=$1 and slot=0', [uid]))[0].g);
    const buy = async (offer) => {
      await gate();
      return (await asEngine('select public.hr_unlock_buy($1::uuid, 0, $2::bigint, gen_random_uuid(), $3::text) as r',
        [uid, await verOf(), offer]))[0].r;
    };
    const measure = async () => JSON.stringify([
      await q('select coalesce(sum(xp),0)::text x from public.player_skills where user_id=$1 and slot=0', [uid]),
      await q('select coalesce(sum(qty),0)::text n from public.player_inventory where user_id=$1 and slot=0', [uid]),
      await q('select gems::text from public.player_state where user_id=$1 and slot=0', [uid]),
    ]);

    // (a) refused below the castle — the camp, then the keep.
    let r = await buy('throne_room.1');
    ok(r && r.error === 'prereq_property_tier', `T3: throne_room.1 at the camp answered ${JSON.stringify(r)}`);
    await q("insert into public.player_progress (user_id, slot, kind, key, period_key, value) values ($1,0,'unlock','property:keep','',4)", [uid]);
    r = await buy('throne_room.1');
    ok(r && r.error === 'prereq_property_tier', `T3: throne_room.1 at the keep answered ${JSON.stringify(r)}`);
    ok(await goldOf() === START, 'T3: a refused piece moved gold');

    // (b) the castle: the whole room, rung by rung, at exactly the data's price.
    await q("insert into public.player_progress (user_id, slot, kind, key, period_key, value) values ($1,0,'unlock','property:castle','',5)", [uid]);
    const before = await measure();
    let spent = 0;
    for (const o of THRONE_ROOM_OFFERS) {
      const g0 = await goldOf();
      r = await buy(o.offer_id);
      if (!(r && r.ok === true)) { ok(false, `T3: ${o.offer_id} refused at the castle: ${JSON.stringify(r && (r.error || r))}`); break; }
      const charged = g0 - await goldOf();
      ok(charged === o.gold, `T3: ${o.offer_id} charged ${charged}, the data says ${o.gold}`);
      ok(Number(r.charged && r.charged.gold) === o.gold, `T3: ${o.offer_id} receipt states ${JSON.stringify(r.charged)}`);
      spent += charged;
    }
    const total = THRONE_ROOM_OFFERS.reduce((s, o) => s + o.gold, 0);
    ok(spent === total, `T3: the whole room cost ${spent}, the data says ${total}`);
    const rung = await q("select value from public.player_progress where user_id=$1 and slot=0 and kind='unlock' and key='throne_room' and period_key=''", [uid]);
    ok(rung.length === 1 && Number(rung[0].value) === 30, `T3: the recorded rung is ${JSON.stringify(rung)}, expected 30`);
    const led = (await q(`select count(*)::int n, coalesce(sum(gold),0)::text g from public.player_ledger
                           where user_id=$1 and slot=0 and kind='shop' and intent like 'unlock\\_buy:throne\\_room.%'`, [uid]))[0];
    ok(led.n === 30 && Number(led.g) === -total, `T3: ledger has ${led.n} throne-room rows summing ${led.g}, expected 30 / -${total}`);
    ok(await measure() === before, 'T3: a furnishing moved xp, items or gems');

    // (c) there is no thirty-first piece.
    r = await buy('throne_room.31');
    ok(r && r.error === 'unknown_offer', `T3: throne_room.31 answered ${JSON.stringify(r)}`);

    // (d) T4 — the second apply is a byte-identical no-op (skipped for mutants).
    if (!mutate) {
      const snap = async () => JSON.stringify(await q("select * from public.hr_unlock_offers where source='gen-throne-room' order by offer_id"))
        + JSON.stringify(await q("select * from public.hr_unlocks where unlock_id='throne_room'"));
      const s0 = await snap();
      const sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
      await db.exec(sql);
      ok(await snap() === s0, 'T4: re-applying the migration changed the catalogues');
    }
  } finally {
    await db.close?.();
  }
}

export async function throneRoomGuard({ mutate } = {}) {
  problems.length = 0;
  if (!mutate) dataArms();
  try { await dbArms(mutate); }
  catch (e) {
    if (e && e.harness) throw e;
    problems.push(`apply/drive threw: ${String(e && e.message || e).split('\n')[0]}`);
  }
  return [...problems];
}

const argv = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(34)} ${m.why}`);
    process.exit(0);
  }
  if (argv.includes('--selftest')) {
    let bad = 0;
    const clean = await throneRoomGuard();
    if (clean.length) { console.log('CLEAN CONTROL RED — every catch below would be an artefact:\n  ' + clean.join('\n  ')); process.exit(1); }
    console.log('clean control green');
    for (const id of Object.keys(MUTATIONS)) {
      const p = await throneRoomGuard({ mutate: id });
      const caught = p.length > 0;
      console.log(`  ${caught ? 'ok    ' : 'MISSED'} ${id}${caught ? ` — caught (${p[0].slice(0, 110)})` : ''}`);
      if (!caught) { bad += 1; console.log(`         ${MUTATIONS[id].why}`); }
    }
    console.log(bad ? `\nthrone-room --selftest FAILED — ${bad} mutation(s) missed.` : `\nthrone-room --selftest PASSED — clean control green, all ${Object.keys(MUTATIONS).length} mutations caught.`);
    process.exit(bad ? 1 : 0);
  }
  const p = await throneRoomGuard();
  if (p.length) { console.error('throne-room RED:\n  ' + p.join('\n  ')); process.exit(1); }
  console.log('throne-room green: 30 castle-gated gold-only pieces, sold at the data\'s price through the real '
    + 'hr_unlock_buy, journalled once each, nothing else moves, re-apply is a no-op, the Edge forwards exactly the 30.');
}
