#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/tp-im-server.mjs — TEMPER AND IMBUEMENTS ON STEPS, THE SERVER HALF (lane/tp-server-1, 2026-11-26; 1071-tp-im-server.sql and
//   1069-gear-phase-b-flame-temper-catalogue.generated.sql; docs/design/redesign/21-flame-temper-imbue-loot.md section 7, D-14, D-15).
//
// ci-step: db-replay | Temper and imbuements on steps, the server half - the old rungs gone, the kit a band from the bag then Storage, the band lock, both doors (1071)
// ci-run: node tests/tp-im-server.mjs
// ci-run: node tools/mutant-gate.mjs node tests/tp-im-server.mjs --mutate
//
//   node tests/tp-im-server.mjs            the guard (every arm)
//   node tests/tp-im-server.mjs --mutate   the proof: each mutant, planted in a live body or in 1071's text, must turn its arm red
//
// mutant-anchors: none — every mutant is planted in a live function body read from the replayed chain (pg_get_functiondef) or in
//   1071-tp-im-server.sql's text held in memory, inside the arm's rolled-back transaction; no tracked file is patched
//
// THE MEASURE: the replayed chain (PGlite), the real engine (tests/hunt-sessions-settle.mjs HARNESS) and the real data and pure core the
// server's twins are generated from (src/data/temper.js, src/core/temper-steps.js, src/core/trades.js, src/core/imbue.js).
//   TP-RETIRED  THE OLD RUNGS LEAVE (D-15), on production's shape: a ladder, its offer and a hero's rung written as the 2027 Tempering files
//               wrote them, with a room rung beside them; re-applying 1071 deletes exactly the Tempering rows (the room rung stays),
//               the envelope carries no `temper`, hr_perks_of answers no `temper` key, and hr_unlock_buy answers unknown_offer for a rung
//   TP-KIT      THE KIT A BAND AND THE BAND LOCK ARE THE JS ONES: hr_temper_kits is TEMPER_KITS (each named band, nothing else);
//               hr_temper_kit_at is temperKitAt at every item Level 0..260; hr_imbue_wearable is imbueStepsAt > 0 over a band x Level grid
//   TP-RANK     21 section 7.5's step 5, town: a Level 40 hero on Steel buys weapon rank 1 at rankQuote's fee and kits, in Fine Tempering
//               Salts (temperKitAt(40)), one from the bag and the rest from Storage: one shop row naming the kit and the split, the section
//               and the envelope read rank 1. A stale price is quote_changed, the key pressed again moves nothing, anon is refused. An Iron
//               piece with only Fine salts held is insufficient_item for Tempering Salts (a cheap band's kit never pays a dear band's rank,
//               nor the other way); Bronze and Dawnsteel are kits_owed (no row; no item yet); nothing moves on any refusal
//   TP-BOTH     BOTH PATHS (CLAUDE.md §4): a Level 40 hunter tempers its weapon mid-hunt from Storage; the next settle's perk read carries
//               temperSteps { weapon: 1 } on the tick door (browser closed) and on the player door (hunt viewed) alike, and {} before
//   IM-LOCK     THE BAND LOCK (item 3a): Brute Edge (band 70) on a Level 59 hero is band_locked and moves nothing, and the section says it
//               is not wearable; at Level 60 it applies from Storage alone at applyFee's price, 20 hunted hours, and the section agrees
// Exit: 0 green · 1 a red arm or a missed mutant · 2 a harness problem.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
// TRUE CONCURRENCY: PGlite is one backend. Two presses on one key that race on the hero's lock are the shape tests/key-under-lock.mjs
// holds every keyed definer verb to (the key read again under hr_hunt_lock). The engine's use of wornImbues waits for the settle's
// projection (lane/t1-traits-drop holds hr_hunt_instance_read; HANDOFFS 2026-11-26 lane/tp-server-1 carries its contract).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { isMain } from './_is-main.mjs';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { goldOf } from './_gold.mjs';

const MUTATE = process.argv.includes('--mutate');
const MIN = 60000;
const FILE = '1071-tp-im-server.sql';
const mod = (f) => import(pathToFileURL(join(ROOT, f)).href);
const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
const { TEMPER_KITS } = await mod('src/data/temper.js');
const { rankQuote } = await mod('src/core/temper-steps.js');
const { temperKitAt } = await mod('src/core/trades.js');
const { imbueStepsAt, applyFee, lifeMs } = await mod('src/core/imbue.js');
const { IMBUE_RULES, imbueBandOf } = await mod('src/data/imbue-rules.js');
const { ITEMS } = await mod('src/data/items.js');
const UID = H.UIDS[0];
const idem = () => crypto.randomUUID();
const { one, q } = H;
/* 1071's text, as the replay applies it (LF); a file mutant replaces this for its arm only */
let FILE_SQL = readFileSync(join(ROOT, 'supabase', 'migrations', FILE), 'utf8').replace(/\r\n/g, '\n');

/* As PostgREST calls it: the JWT subject set, `set role authenticated` (or `anon`), inside a savepoint so a refusal by the database
   (a permission, a raise) leaves the arm's transaction usable. */
async function as(db, uid, sql, params, role = 'authenticated') {
  await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [uid, JSON.stringify({ sub: uid, role })]);
  await db.query('savepoint tp_as');
  await db.exec('set role ' + role);
  try { const r = (await db.query(sql, params)).rows[0]; await db.exec('reset role'); await db.query('release savepoint tp_as'); return r ? Object.values(r)[0] : undefined; }
  catch (e) { await db.query('rollback to savepoint tp_as'); await db.exec('reset role'); return { thrown: String(e.message).split('\n')[0] }; }
  finally { await db.query("select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true)"); }
}
const temper = async (db, equip, price, key = idem(), role = 'authenticated') => {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);
  return as(db, UID, 'select public.hr_temper_rank(0, $1, $2::bigint, $3::uuid) as r', [equip, price, key], role);
};
const imbue = async (db, equip, id, price, key = idem()) => {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);
  return as(db, UID, 'select public.hr_imbue_apply(0, $1, $2, $3::bigint, $4::uuid) as r', [equip, id, price, key]);
};
const purse = (db) => goldOf((sql, p) => db.query(sql, p).then((r) => r.rows), UID, 0);
const lit = (db) => db.query("update public.hr_flags set enabled = true where key in ('temper_steps', 'imbuements')");
const wear = (db, equip, item) => db.query(`insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, $2, $3)
  on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id`, [UID, equip, item]);
const hold = async (db, item, bag, storage) => {
  await db.query('delete from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2', [UID, item]);
  await db.query('delete from public.account_bank where user_id = $1 and item_id = $2', [UID, item]);
  if (bag) await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3)', [UID, item, bag]);
  if (storage) await db.query('insert into public.account_bank (user_id, item_id, qty) values ($1, $2, $3)', [UID, item, storage]);
};
const held = async (db, item) => ({
  bag: Number(await one(db, 'select coalesce(sum(qty), 0)::text from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2', [UID, item])),
  storage: Number(await one(db, 'select coalesce(sum(qty), 0)::text from public.account_bank where user_id = $1 and item_id = $2', [UID, item])),
});
const ledgerCount = async (db) => Number(await one(db, 'select count(*)::text from public.player_ledger where user_id = $1', [UID]));
const setLevel = (db, L) => db.query('update public.player_state set level_xp = public.hr_char_xp_for_level($2) where user_id = $1 and slot = 0', [UID, L]);
const ilOf = async (db, item) => Number(await one(db, 'select item_level from public.hr_item_levels where item_id = $1', [item]));
/* a worn-slot piece of band b (the first by item Level and id), for slot `equip` */
const pieceOf = async (db, equip, band) => (await q(db, `select l.item_id, l.item_level from public.hr_item_levels l
  join public.hr_item_slots s on s.item_id = l.item_id and s.equip_slot = $1 where l.item_level / 20 = $2 order by l.item_level, l.item_id limit 1`, [equip, band]))[0];

/* ONE settle of the hunt to `toMs` on a door, every statement through `exec` (the perk read is caught as it passes). `fire`: the server's
   tick (hunt-settle.js's three pieces, browser closed); `viewed`: the player door (hunt viewed). */
async function settleOn(db, M, door, toMs, exec) {
  for (let i = 0; i < 400; i++) {
    await db.query('delete from public.hr_rate_counters');
    if (door === 'fire') {
      const plan = await M.HS.readHuntSettle({ exec, user: UID, slot: 0, grounds: H.groundsOf(M), atMs: toMs }, 'tick');
      if (plan.answer) return;
      const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
      if (!p.out.accrued) return;
      const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
      if (!res || res.ok !== true) throw new Error('the tick settle refused: ' + JSON.stringify(res).slice(0, 300));
    } else {
      const v = await M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'settle', bucket: null, project: false, grounds: H.groundsOf(M), atMs: toMs, minWindowMs: 0 });
      if (v && v.body && v.body.error === 'no_hunt') return;
      if (!v || v.status !== 200 || !v.body || v.body.ok !== true) throw new Error('the player-door settle answered ' + JSON.stringify(v && v.body).slice(0, 300));
    }
    const s = (await q(db, 'select ended_at, floor(extract(epoch from settled_to) * 1000)::bigint::text as to_ms from public.hunt_sessions where user_id = $1 and slot = 0 order by entered_at desc limit 1', [UID]))[0];
    if (!s || s.ended_at !== null || Number(s.to_ms) >= toMs) return;
  }
  throw new Error('harness: the ' + door + ' door never reached ' + new Date(toMs).toISOString());
}

const ARMS = {
  'TP-RETIRED': async (db, M) => {
    const p = [];
    await H.character(db, M, UID, { level: 40, gold: 1000000 });
    /* production's shape: one ladder as 2027-02-27-tempering-catalogue.generated.sql wrote it, its rung-1 offer, a hero's rung 3, and a
       room rung (the House, kind unlock) that is NOT Tempering's */
    await db.query(`insert into public.hr_unlocks (unlock_id, namespace, merge, progress_kind, max_value, rungs)
      values ('temper:blows:2', 'temper', 'max', 'unlock', 5, array[1,2,3,4,5]::int[]) on conflict (unlock_id) do nothing`);
    await db.query(`insert into public.hr_unlock_offers (offer_id, table_name, name, unlock_id, value, gold, items, req_property_tier, req_item, refusal, source)
      values ('temper.blows.2.1', 'temper', 'Temper blows, tier 2, rung 1', 'temper:blows:2', 1, 2000, '{}'::jsonb, 0, null, null, 'gen-temper')`);
    await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value) values ($1, 0, 'unlock', 'temper:blows:2', '', 3)`, [UID]);
    const room = (await q(db, "select unlock_id, rungs[1] as r from public.hr_unlocks where namespace = 'room' order by unlock_id limit 1"))[0];
    if (!room) return ['harness: no room ladder to stand beside the rung'];
    await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value) values ($1, 0, 'unlock', $2, '', $3)`, [UID, room.unlock_id, room.r]);
    try { await db.exec(FILE_SQL); } catch (e) { return ['re-applying ' + FILE + ' on a database holding a rung raised: ' + String(e.message).split('\n')[0].slice(0, 240)]; }
    const left = (await q(db, `select (select count(*) from public.hr_unlock_offers where source = 'gen-temper')::int as offers,
        (select count(*) from public.hr_unlocks where namespace = 'temper')::int as ladders,
        (select count(*) from public.player_progress where kind = 'unlock' and key like 'temper:%')::int as rungs,
        (select count(*) from public.player_progress where user_id = $1 and key = $2)::int as room,
        (select count(*) from public.hr_state_sections where key = 'temper')::int as section,
        to_regprocedure('public.hr_temper_view(uuid,integer)') is not null as view_fn`, [UID, room.unlock_id]))[0];
    if (left.offers || left.ladders || left.rungs || left.section || left.view_fn || left.room !== 1) {
      p.push('after 1071 the database holds ' + JSON.stringify(left) + ': want no Tempering offer, ladder, rung, section or view, and the room rung kept');
    }
    const env = await one(db, 'select public.hr_state_of($1, 0)', [UID]);
    if (!env || env.ok !== true || 'temper' in env) p.push('the envelope still carries `temper`: ' + JSON.stringify(env && env.temper).slice(0, 160));
    const perks = await one(db, 'select public.hr_perks_of($1, 0)', [UID]);
    if (!perks || perks.ok !== true || 'temper' in perks || 'temper' in (perks.sources || {}) || !('temperSteps' in perks)) {
      p.push('hr_perks_of answers keys ' + JSON.stringify(perks && Object.keys(perks)) + ' (sources ' + JSON.stringify(perks && Object.keys(perks.sources || {})) + '): want temperSteps and no temper');
    }
    /* as the edge's unlock-buy verb calls it: the engine role, naming the hero it verified */
    await db.query('savepoint tp_buy');
    let buy;
    const ver = await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [UID]);
    try {
      await db.exec('set role hr_engine');
      buy = (await db.query("select public.hr_unlock_buy($1, 0, $2::bigint, $3::uuid, 'temper.blows.2.1') as r", [UID, ver, idem()])).rows[0].r;
      await db.exec('reset role');
      await db.query('release savepoint tp_buy');
    } catch (e) { await db.query('rollback to savepoint tp_buy'); await db.exec('reset role'); buy = { thrown: String(e.message).split('\n')[0] }; }
    if (!buy || buy.error !== 'unknown_offer') p.push('a retired rung bought through hr_unlock_buy answered ' + JSON.stringify(buy).slice(0, 160) + ', want unknown_offer');
    const body = String(await one(db, "select prosrc from pg_proc where oid = to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)')"));
    if (body.includes("'temper'") || !body.includes("v_cat.namespace in ('room', 'property'));")) p.push('hr_unlock_buy still reads Storage for the temper namespace, or no longer for the house');
    return p;
  },

  'TP-KIT': async (db) => {
    const p = [];
    const rows = await q(db, 'select band, item_id from public.hr_temper_kits order by band');
    const want = TEMPER_KITS.map((k, b) => [b, k]).filter(([, k]) => k !== null);
    if (JSON.stringify(rows.map((r) => [r.band, r.item_id])) !== JSON.stringify(want)) p.push('hr_temper_kits holds ' + JSON.stringify(rows) + ', TEMPER_KITS names ' + JSON.stringify(want));
    let bad = 0;
    for (const r of await q(db, 'select il, public.hr_temper_kit_at(il) as k from generate_series(0, 260) il order by il')) {
      if (r.k !== temperKitAt(r.il) && bad++ < 4) p.push('a rank on item Level ' + r.il + ' takes ' + r.k + ' on the server, ' + temperKitAt(r.il) + ' in src/core/trades.js');
    }
    for (const r of await q(db, `select b, l, public.hr_imbue_wearable(b, l) as w from generate_series(0, 220, 7) b cross join generate_series(0, 230, 3) l`)) {
      if (r.w !== imbueStepsAt(r.b, r.l) > 0 && bad++ < 8) p.push('band ' + r.b + ' on a Level ' + r.l + ' hero is wearable ' + r.w + ' on the server, ' + (imbueStepsAt(r.b, r.l) > 0) + ' in src/core/imbue.js');
    }
    return p;
  },

  'TP-RANK': async (db, M) => {
    const p = [];
    await H.character(db, M, UID, { level: 40, gold: 10000000 });
    await lit(db);
    const steel = 'steel_sword', il = await ilOf(db, steel);
    await wear(db, 'weapon', steel);
    const kit = temperKitAt(il), Q = rankQuote('weapon', 1, il);
    if (kit !== 'fine_temper_salts' || il !== 40 || !Q || Q.kits < 2) return ['harness: Steel is item Level ' + il + ' with kit ' + kit + ' and quote ' + JSON.stringify(Q) + ' (want 40, Fine salts, two kits or more)'];
    for (const k of TEMPER_KITS) if (k) await hold(db, k, 0, 0);
    await hold(db, kit, 1, 5);
    const sec = (await one(db, 'select public.hr_temper_steps_view($1, 0)', [UID])).weapon;
    if (!sec || !sec.quote || sec.quote.fee !== Q.fee || sec.quote.kits !== Q.kits || sec.quote.kit !== kit || sec.quote.kits_owed !== false || sec.quote.rank !== 1) {
      p.push('the section quotes ' + JSON.stringify(sec) + ', want rank 1 at ' + JSON.stringify(Q) + ' in ' + kit);
    }
    const g0 = await purse(db), n0 = await ledgerCount(db);
    const stale = await temper(db, 'weapon', Q.fee + 1);
    if (!stale || stale.error !== 'quote_changed' || await purse(db) !== g0 || JSON.stringify(await held(db, kit)) !== JSON.stringify({ bag: 1, storage: 5 })) {
      p.push('a stale price answered ' + JSON.stringify(stale).slice(0, 160) + ' or moved something');
    }
    const anon = await temper(db, 'weapon', Q.fee, idem(), 'anon');
    if (!anon || !anon.thrown || !/permission denied/.test(anon.thrown)) p.push('anon reached hr_temper_rank: ' + JSON.stringify(anon).slice(0, 160));
    const key = idem();
    const r = await temper(db, 'weapon', Q.fee, key);
    const h1 = await held(db, kit);
    if (!r || r.ok !== true || r.kit !== kit || r.kits !== Q.kits || await purse(db) !== g0 - Q.fee || h1.bag !== 0 || h1.storage !== 5 - (Q.kits - 1)) {
      p.push('rank 1 answered ' + JSON.stringify(r && { ...r, envelope: undefined }).slice(0, 200) + ' (purse ' + (g0 - (await purse(db))) + ' paid, held ' + JSON.stringify(h1) + '), want '
        + Q.fee + ' gold and ' + Q.kits + ' ' + kit + ', one from the bag');
      return p;
    }
    const rows = await q(db, "select intent, gold::text as gold, meta from public.player_ledger where user_id = $1 and kind = 'shop' and intent like 'temper:%'", [UID]);
    const m = rows[0] && rows[0].meta;
    if (rows.length !== 1 || rows[0].intent !== 'temper:weapon:' + Q.fee || Number(rows[0].gold) !== -Q.fee || !m || m.kit !== kit || m.kits !== Q.kits || m.band !== 2
        || m.rank_after !== 1 || (m.took && m.took.bag && m.took.bag[kit]) !== 1 || (m.took && m.took.storage && m.took.storage[kit]) !== Q.kits - 1) {
      p.push('the journal reads ' + JSON.stringify(rows));
    }
    if (!r.envelope || !r.envelope.temper_steps || r.envelope.temper_steps.weapon.rank !== 1 || r.envelope.temper_steps.weapon.seated !== true) {
      p.push('the answer\'s envelope reads ' + JSON.stringify(r.envelope && r.envelope.temper_steps && r.envelope.temper_steps.weapon) + ', want rank 1 seated (rule 11)');
    }
    const again = await temper(db, 'weapon', Q.fee, key);
    if (!again || again.thrown || await ledgerCount(db) !== n0 + 1 || await purse(db) !== g0 - Q.fee || (await held(db, kit)).storage !== h1.storage) {
      p.push('the key pressed again answered ' + JSON.stringify(again).slice(0, 160) + ' and moved something');
    }
    /* another band's kit never pays: Iron's rank, only the Fine salts held */
    const iron = 'iron_sword', ilIron = await ilOf(db, iron), kIron = temperKitAt(ilIron);
    await wear(db, 'weapon', iron);
    const g1 = await purse(db), n1 = await ledgerCount(db);
    await db.query("delete from public.hero_temper where user_id = $1 and slot = 0 and equip_slot = 'weapon'", [UID]);
    const short = await temper(db, 'weapon', rankQuote('weapon', 1, ilIron).fee);
    if (!short || short.error !== 'insufficient_item' || short.item_id !== kIron || kIron === kit || await purse(db) !== g1 || await ledgerCount(db) !== n1
        || (await held(db, kit)).storage !== h1.storage) {
      p.push('an Iron rank with only ' + kit + ' held answered ' + JSON.stringify(short).slice(0, 200) + ', want insufficient_item for ' + kIron + ' and nothing moved');
    }
    /* Bronze has no row, Dawnsteel's salts are no item yet: kits_owed, whatever is held */
    for (const [band, label] of [[0, 'Bronze'], [6, 'Dawnsteel']]) {
      const pc = await pieceOf(db, 'weapon', band);
      const k = temperKitAt(pc.item_level);
      const want = k === null || !Object.prototype.hasOwnProperty.call(ITEMS, k) ? 'kits_owed' : 'insufficient_item';
      await wear(db, 'weapon', pc.item_id);
      const owed = await temper(db, 'weapon', rankQuote('weapon', 1, pc.item_level).fee);
      if (!owed || owed.error !== want || (want === 'kits_owed' && owed.band !== band) || await purse(db) !== g1 || await ledgerCount(db) !== n1) {
        p.push(label + ' (' + pc.item_id + ', kit ' + k + ') answered ' + JSON.stringify(owed).slice(0, 160) + ', want ' + want);
      }
      const s = (await one(db, 'select public.hr_temper_steps_view($1, 0)', [UID])).weapon;
      if (!s || !s.quote || s.quote.kits_owed !== (want === 'kits_owed') || s.quote.kit !== k) p.push(label + '\'s section quotes ' + JSON.stringify(s && s.quote));
    }
    return p;
  },

  'TP-BOTH': async (db, M) => {
    const p = [];
    const got = {};
    for (const door of ['fire', 'viewed']) {
      await db.query('savepoint tp_door');
      const seen = [];
      const exec = async (text, params) => {
        const rows = await H.makeExec(db)(text, params);
        if (rows && rows[0] && Object.prototype.hasOwnProperty.call(rows[0], 'perks')) seen.push(rows[0].perks);
        return rows;
      };
      const h = await H.hunter(db, M, { ...H.STRONG, level: 40, minutesAgo: 50, gold: 10000000, beforeEnter: () => wear(db, 'weapon', 'steel_sword') });
      await lit(db);
      const il = await ilOf(db, 'steel_sword'), Q = rankQuote('weapon', 1, il), kit = temperKitAt(il);
      await hold(db, kit, 0, Q.kits);
      await settleOn(db, M, door, h.from + 20 * MIN, exec);
      const before = seen.length ? seen[seen.length - 1][UID + ':0'] : null;
      const r = await temper(db, 'weapon', Q.fee);
      seen.length = 0;
      await settleOn(db, M, door, h.from + 40 * MIN, exec);
      const after = seen.length ? seen[seen.length - 1][UID + ':0'] : null;
      const open = await one(db, 'select count(*)::int from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is null', [UID]);
      got[door] = JSON.stringify({ before: before && before.temperSteps, after: after && after.temperSteps });
      if (!r || r.ok !== true || (await held(db, kit)).storage !== 0) p.push(door + ': the rank mid-hunt answered ' + JSON.stringify(r && { ...r, envelope: undefined }).slice(0, 200));
      if (!before || JSON.stringify(before.temperSteps) !== '{}' || !after || !after.temperSteps || after.temperSteps.weapon !== 1 || open !== 1) {
        p.push(door + ': the settle read temperSteps ' + got[door] + ' with ' + open + ' hunt open, want {} then { weapon: 1 } on a hunt still running');
      }
      await db.query('rollback to savepoint tp_door');
    }
    if (got.fire !== got.viewed) p.push('the two doors read differently: closed ' + got.fire + ', viewed ' + got.viewed);
    return p;
  },

  'IM-LOCK': async (db, M) => {
    const p = [];
    const id = 'brute_edge', band = imbueBandOf(id), slot = 'weapon';
    if (!IMBUE_RULES[id] || band !== Number(await one(db, 'select band from public.hr_imbue_rules where imbue_id = $1', [id]))) return ['harness: ' + id + ' has band ' + band + ' in the data and another on the server'];
    let lock = 1;
    while (imbueStepsAt(band, lock) === 0 && lock < 1000) lock++;
    await H.character(db, M, UID, { level: lock - 1, gold: 10000000 });
    await lit(db);
    await wear(db, slot, 'steel_sword');
    const il = await ilOf(db, 'steel_sword');
    /* the bench's item stands in as a real one (rolled back with the arm): a Remains good, held in Storage only */
    const stand = await one(db, 'select item_id from public.hr_flame_fuel order by item_id limit 1');
    await db.query('update public.hr_imbue_rules set item_id = $2 where imbue_id = $1', [id, stand]);
    await hold(db, stand, 0, 2);
    const g0 = await purse(db), n0 = await ledgerCount(db);
    const sec0 = await one(db, 'select public.hr_imbues_view($1, 0)', [UID]);
    if (!sec0 || !sec0.wearable || sec0.wearable[id] !== false) p.push('at Level ' + (lock - 1) + ' the section reads wearable ' + JSON.stringify(sec0 && sec0.wearable));
    const locked = await imbue(db, slot, id, applyFee(il, lock - 1));
    if (!locked || locked.error !== 'band_locked' || locked.band !== band || await purse(db) !== g0 || await ledgerCount(db) !== n0 || (await held(db, stand)).storage !== 2) {
      p.push('band ' + band + ' on a Level ' + (lock - 1) + ' hero answered ' + JSON.stringify(locked).slice(0, 160) + ', want band_locked and nothing moved');
    }
    await setLevel(db, lock);
    const sec1 = await one(db, 'select public.hr_imbues_view($1, 0)', [UID]);
    if (!sec1 || !sec1.wearable || sec1.wearable[id] !== true || Number(sec1.fees[id]) !== applyFee(il, lock)) p.push('at Level ' + lock + ' the section reads ' + JSON.stringify(sec1 && { wearable: sec1.wearable, fees: sec1.fees }));
    const ok = await imbue(db, slot, id, applyFee(il, lock));
    const w = (await q(db, 'select imbue_id, band, quality, ms_left::text as ms from public.hero_worn_imbue where user_id = $1 and slot = 0 and equip_slot = $2', [UID, slot]))[0];
    if (!ok || ok.ok !== true || await purse(db) !== g0 - applyFee(il, lock) || (await held(db, stand)).storage !== 1 || !w || w.imbue_id !== id || w.band !== band
        || Number(w.ms) !== lifeMs('plain')) {
      p.push('at Level ' + lock + ' the apply answered ' + JSON.stringify(ok && { ...ok, envelope: undefined }).slice(0, 200) + ' wearing ' + JSON.stringify(w) + ', want '
        + applyFee(il, lock) + ' gold, one from Storage, ' + lifeMs('plain') + ' ms');
    }
    return p;
  },
};

async function runArms(db, M, only) {
  const out = {};
  for (const name of Object.keys(ARMS)) {
    if (only && !only.includes(name)) continue;
    try { out[name] = await H.inTx(db, () => ARMS[name](db, M)); } catch (e) { out[name] = ['threw: ' + String(e && e.message).slice(0, 400)]; }
  }
  return out;
}

/* THE MUTANTS. `fn`: planted in that live body (its anchor found exactly once). `file`: planted in 1071's text for an arm that re-applies it. */
const MUTANTS = [
  { arm: 'TP-RANK', name: 'every rank takes Iron\'s kit (a cheap band pays a dear one)', fn: 'public.hr_temper_rank(integer,text,bigint,uuid)',
    find: 'v_kit := public.hr_temper_kit_at(v_il);', repl: 'v_kit := public.hr_temper_kit_at(20);' },
  { arm: 'TP-RANK', name: 'the kits from the bag only (Storage never read)', fn: 'public.hr_temper_rank(integer,text,bigint,uuid)',
    find: 'jsonb_build_object(v_kit, v_kits), true);', repl: 'jsonb_build_object(v_kit, v_kits), false);' },
  { arm: 'TP-RANK', name: 'a rank sold for gold alone (the take skipped)', fn: 'public.hr_temper_rank(integer,text,bigint,uuid)',
    find: 'v_take := public.hr_materials_take(v_uid, p_slot, jsonb_build_object(v_kit, v_kits), true);', repl: 'v_take := \'{"ok": true, "from": {}}\'::jsonb;' },
  { arm: 'TP-RANK', name: 'no kits_owed (a band with no kit reaches the take)', fn: 'public.hr_temper_rank(integer,text,bigint,uuid)',
    find: 'if v_kit is null or not exists (select 1 from public.hr_items where item_id = v_kit) then', repl: 'if false then' },
  { arm: 'TP-RANK', name: 'the price check dropped (the client\'s number is charged)', fn: 'public.hr_temper_rank(integer,text,bigint,uuid)',
    find: 'if v_fee <> p_price then', repl: 'if false then' },
  { arm: 'TP-RANK', name: 'the section names no kit', fn: 'public.hr_temper_steps_view(uuid,integer)',
    find: "'kit', v_kit,", repl: "'kit', null::text," },
  { arm: 'TP-KIT', name: 'the kit twin reads the band off by a step', fn: 'public.hr_temper_kit_at(integer)',
    find: 'greatest(0, coalesce(p_item_level, 0)) / r.tier_steps', repl: 'greatest(0, coalesce(p_item_level, 0) + 1) / r.tier_steps' },
  { arm: 'TP-KIT', name: 'the band lock a Level loose', fn: 'public.hr_imbue_wearable(integer,integer)',
    find: 'p_band <= p_level + ', repl: 'p_band <= p_level + 1 + ' },
  { arm: 'IM-LOCK', name: 'no band lock on the apply', fn: 'public.hr_imbue_apply(integer,text,text,bigint,uuid)',
    find: 'if not public.hr_imbue_wearable(i.band, v_lv) then', repl: 'if false then' },
  { arm: 'IM-LOCK', name: 'the imbuement from the bag only', fn: 'public.hr_imbue_apply(integer,text,text,bigint,uuid)',
    find: 'jsonb_build_object(i.item_id, 1), true);', repl: 'jsonb_build_object(i.item_id, 1), false);' },
  { arm: 'IM-LOCK', name: 'the section calls every imbuement wearable', fn: 'public.hr_imbues_view(uuid,integer)',
    find: 'public.hr_imbue_wearable(i.band, v_lv)', repl: 'true' },
  { arm: 'TP-BOTH', name: 'the perk read loses temperSteps', fn: 'public.hr_perks_of(uuid,integer)',
    find: "'temperSteps', public.hr_temper_steps_of(p_user, p_slot),", repl: "'temperSteps', '{}'::jsonb," },
  { arm: 'TP-RETIRED', name: 'the heroes\' rungs kept', file: true,
    find: "delete from public.player_progress p\n where p.kind = 'unlock' and p.period_key = ''\n   and p.key in", repl: "delete from public.player_progress p\n where false and p.kind = 'unlock' and p.period_key = ''\n   and p.key in" },
  { arm: 'TP-RETIRED', name: 'the gen-temper offers kept', file: true,
    find: "delete from public.hr_unlock_offers where source = 'gen-temper';", repl: "delete from public.hr_unlock_offers where false;" },
  { arm: 'TP-RETIRED', name: 'the perk read keeps `temper`', file: true,
    find: "    'renownAllXp', 0,\n", repl: "    'renownAllXp', 0,\n    'temper', '{}'::jsonb,\n" },
];

async function main() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(2); }
  await H.pinDice(db);
  const M = await H.loadEdge(H.ROOT);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  if (MUTATE) {
    let bad = 0;
    const clean = await runArms(db, M);
    for (const [name, pr] of Object.entries(clean)) if (pr.length) { console.error('✗ harness: ' + name + ' is red on the clean chain: ' + pr[0]); bad++; }
    if (bad) process.exit(1);
    const PLAIN = FILE_SQL;
    for (const m of MUTANTS) {
      let undo = null;
      if (m.file) {
        if (PLAIN.split(m.find).length !== 2) { console.error('✗ mutant "' + m.name + '": its anchor is not found exactly once in ' + FILE); bad++; continue; }
        FILE_SQL = PLAIN.replace(m.find, () => m.repl);
        undo = async () => { FILE_SQL = PLAIN; };
      } else {
        const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).replace(/\r/g, '');
        if (def.split(m.find).length !== 2) { console.error('✗ mutant "' + m.name + '": its anchor is not found exactly once in ' + m.fn); bad++; continue; }
        await db.exec(def.replace(m.find, () => m.repl));
        undo = () => db.exec(def);
      }
      try {
        const first = ((await runArms(db, M, [m.arm]))[m.arm] || [])[0];
        if (!first) { console.error('✗ ' + m.arm + ' stayed GREEN on: ' + m.name); bad++; }
        else if (/^threw|^harness/.test(first)) { console.error('✗ harness: ' + m.arm + ' broke on: ' + m.name + ' (' + first.slice(0, 200) + ')'); bad++; }
        else console.log('✓ ' + m.arm + ' goes red on: ' + m.name + '  (' + first.slice(0, 110) + ')');
      } finally { await undo(); }
    }
    console.log(bad ? 'tp-im-server --mutate: ' + bad + ' failure(s)' : 'tp-im-server --mutate: all ' + MUTANTS.length + ' mutants killed');
    process.exit(bad ? 1 : 0);
  }
  const res = await runArms(db, M);
  let red = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems.length) { red++; for (const pr of problems) console.error('✗ ' + name + ': ' + pr); }
    else console.log('✓ ' + name);
  }
  console.log(red ? 'tp-im-server: ' + red + ' arm(s) red' : 'tp-im-server: all ' + Object.keys(res).length + ' arms green');
  process.exit(red ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
