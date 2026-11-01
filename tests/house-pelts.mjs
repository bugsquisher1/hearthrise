#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/house-pelts.mjs — A HERO EARNS THE KEEP'S BEAR PELTS AND BUYS THE KEEP (Andy's report, 2026-10-31: "don't forget
// about getting bear pelts into the game or changing the house level 5 requirements").
//
//   node tests/house-pelts.mjs             the guard
//   node tests/house-pelts.mjs --selftest  every planted defect must turn its arm red
//
// Real RPCs and the REAL hunt settle (hunt-settle.js over the replayed chain, the tests/hunt-sessions-settle.mjs harness),
// on the real Glade and the real tables, production untouched:
//   HP-1 CLOSED  browser closed (the world tick): a Level 24 hero at Mosslight Glade with a pull of 3 kills Brook Bears and is
//                credited 5 Bear Pelts by the settle, never refused (the 10-29 raw_bear_meat refusal: bound 0, value_over).
//   HP-2 VIEWED  hunt viewed (the player's settle): the same hunt on the other door credits a pelt the same way.
//   HP-3 THE BUY the pelts THE SETTLE PAID (only the rest of the price is seeded) buy the ladder to the Keep through
//                hr_unlock_buy, then the Trophy Room to its top visible rung.
//   HP-4 HELD    the Castle and the rung 5s are refused by name and hr_home_view shows no sellable path past the top:
//                the window's tiers stop at the Keep, a room reads four rungs.
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';

const GLADE = 'mosslight_glade';
const NEEDED = 5;
const STEP_MS = 10 * 60000;          // one settle's reach (the harness slices a longer backlog anyway)
const MAX_HOURS = 6;                 // far past the 1 h the pace promises (drop-tables big-pull): a miss here is a wall
const idem = () => crypto.randomUUID();

async function q(db, sql, p) { return (await db.query(sql, p)).rows; }
async function one(db, sql, p) { const r = await q(db, sql, p); return r[0] ? Object.values(r[0])[0] : undefined; }
const asUser = (db, uid) => db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
const calm = (db) => db.query('delete from public.hr_rate_counters');
const bagOf = async (db, uid, item) => Number(await one(db, 'select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)::text', [uid, item]));

/* A hero on the real Glade `hours` ago, its pull at 3 (the smallest that brings the bear). */
async function gladeHunter(db, H, M, uid, hours) {
  await H.character(db, M, uid, { level: 24, gold: 5000000, inv: {} });
  await db.query('update public.hr_hunt_config set enabled = true where id');
  await asUser(db, uid);
  await calm(db);
  const d = await one(db, 'select public.hr_hunt_density_set(0, $1, 3, $2::uuid)', [GLADE, idem()]);
  if (!d || d.ok !== true) throw new Error('density refused: ' + JSON.stringify(d));
  const e = await one(db, "select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)", [GLADE, idem()]);
  if (!e || e.ok !== true) throw new Error('enter refused: ' + JSON.stringify(e));
  await asUser(db, '');
  const sid = e.session.id;
  const t = `date_trunc('second', now() - make_interval(hours => ${hours}))`;
  await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = $1`, [sid]);
  const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sid]);
  await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [inst]);
  await db.query('update public.player_state set stamina_ms = 43200000, stamina_at = now() where user_id = $1 and slot = 0', [uid]);
  const from = Number(await one(db, 'select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1', [inst]));
  return { sid, from };
}

/** Settle on one door until the bag holds `want` pelts. Answers { pelts, hours, problems }. */
async function hunt(db, H, M, uid, h, door, want) {
  const exec = H.makeExec(db);
  const problems = [];
  let t = h.from;
  const end = h.from + MAX_HOURS * 3600000;
  let pelts = 0;
  while (t < end && pelts < want) {
    t += STEP_MS;
    const args = door === 'closed'
      ? { exec, user: uid, slot: 0, mode: 'tick', session: h.sid, grounds: {}, atMs: t }
      : { exec, user: uid, slot: 0, mode: 'settle', bucket: null, project: true, live: true, grounds: {}, atMs: t, minWindowMs: 0 };
    const r = await M.HS.settleHunt(args);
    if (!r || (r.outcome !== 'paid' && r.outcome !== 'skipped')) { problems.push(`${door}: the settle to +${(t - h.from) / 60000} min answered ${r && r.outcome}/${r && r.reason}`); break; }
    if (r.ended) { problems.push(`${door}: the hunt ended at +${(t - h.from) / 60000} min: ${JSON.stringify(r.ended).slice(0, 120)}`); break; }
    pelts = await bagOf(db, uid, 'bear_pelt');
  }
  return { pelts, hours: (t - h.from) / 3600000, problems };
}

/** One purchase as the edge makes it: the engine names the offer. */
async function buy(db, uid, offer) {
  await asUser(db, uid);
  await calm(db);
  const ver = Number(await one(db, 'select version::text from public.player_state where user_id = $1 and slot = 0', [uid]));
  await db.exec('set role hr_engine');
  try { return await one(db, 'select public.hr_unlock_buy($1, 0, $2, gen_random_uuid(), $3) v', [uid, ver, offer]); }
  finally { await db.exec('reset role'); }
}
/* A hero's materials for a purchase, seeded EXCEPT `keep` (the items the settle must have paid). */
async function seedPrice(db, uid, offer, keep = []) {
  const items = await one(db, 'select items from public.hr_unlock_offers where offer_id = $1', [offer]);
  if (!items) throw new Error(offer + ' has no price');
  for (const [item, qty] of Object.entries(items)) {
    if (keep.includes(item)) continue;
    await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3)
                    on conflict (user_id, slot, item_id) do update set qty = public.player_inventory.qty + excluded.qty`, [uid, item, qty]);
  }
}

const ARMS = {
  'HP-1': async (db, H, M) => {
    const U = H.UIDS[0];
    const h = await gladeHunter(db, H, M, U, MAX_HOURS + 1);
    const r = await hunt(db, H, M, U, h, 'closed', NEEDED);
    const problems = [...r.problems];
    if (r.pelts < NEEDED) problems.push(`closed: ${r.pelts} Bear Pelts after ${r.hours} h at the Glade, the Keep asks for ${NEEDED}`);
    const paid = await q(db, "select count(*)::int n from public.player_ledger where user_id = $1 and session_id = $2 and item_id = 'bear_pelt'", [U, h.sid]);
    if (!(paid[0].n > 0)) problems.push('closed: no ledger row journals a Bear Pelt');
    if (!problems.length) console.log(`  closed: ${r.pelts} pelts in ${r.hours.toFixed(2)} h`);
    return problems;
  },
  'HP-2': async (db, H, M) => {
    const U = H.UIDS[0];
    const h = await gladeHunter(db, H, M, U, MAX_HOURS + 1);
    const r = await hunt(db, H, M, U, h, 'viewed', 1);
    const problems = [...r.problems];
    if (r.pelts < 1) problems.push(`viewed: no Bear Pelt after ${r.hours} h at the Glade`);
    if (!problems.length) console.log(`  viewed: ${r.pelts} pelt(s) in ${r.hours.toFixed(2)} h`);
    return problems;
  },
  'HP-3': async (db, H, M) => {
    const U = H.UIDS[0];
    const problems = [];
    const h = await gladeHunter(db, H, M, U, MAX_HOURS + 1);
    const r = await hunt(db, H, M, U, h, 'closed', NEEDED);
    problems.push(...r.problems);
    await asUser(db, U);
    await calm(db);
    const lv = await one(db, 'select public.hr_hunt_leave(0, $1::uuid)', [idem()]);
    await asUser(db, '');
    if (!lv || lv.ok !== true) problems.push('the leave was refused: ' + JSON.stringify(lv));
    await db.query("update public.hunt_sessions set ended_at = now(), end_reason = 'left' where id = $1", [h.sid]);
    await db.query("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = 0", [U]);
    const earned = await bagOf(db, U, 'bear_pelt');
    for (const offer of ['property.homestead', 'property.farmstead', 'property.manor']) {
      await seedPrice(db, U, offer);
      const v = await buy(db, U, offer);
      if (!v || v.ok !== true) problems.push(`${offer} refused: ${JSON.stringify(v).slice(0, 200)}`);
    }
    await seedPrice(db, U, 'property.keep', ['bear_pelt']);
    const keep = await buy(db, U, 'property.keep');
    if (!keep || keep.ok !== true) problems.push(`the Keep refused with ${earned} earned pelts: ${JSON.stringify(keep).slice(0, 240)}`);
    const tier = await one(db, 'select public.hr_account_property_tier($1)', [U]);
    if (tier !== 4) problems.push(`the account's home is tier ${tier} after the Keep, want 4`);
    if (await bagOf(db, U, 'bear_pelt') !== earned - NEEDED) problems.push(`the Keep took ${earned - await bagOf(db, U, 'bear_pelt')} pelts, want ${NEEDED}`);
    /* The Trophy Room, the other house line that asks for pelts: every visible rung sells at the Keep. */
    for (let n = 1; n <= 4; n++) {
      const offer = 'room.trophy.' + n;
      await seedPrice(db, U, offer);
      const v = await buy(db, U, offer);
      if (!v || v.ok !== true) problems.push(`${offer} refused at the Keep: ${JSON.stringify(v).slice(0, 200)}`);
    }
    return problems;
  },
  'HP-4': async (db, H, M) => {
    const U = H.UIDS[0];
    const problems = [];
    await H.character(db, M, U, { level: 24, gold: 5000000, inv: {} });
    for (const offer of ['property.castle', 'room.kitchen.5', 'room.trophy.5']) {
      const v = await buy(db, U, offer);
      if (!v || v.error !== 'offer_unsupported') problems.push(`${offer} answered ${JSON.stringify(v).slice(0, 200)}, want offer_unsupported`);
    }
    const home = await one(db, 'select public.hr_home_view($1, 0)', [U]);
    const names = home.tiers.map((t) => t.offer);
    if (names.includes('property.castle')) problems.push('the House window lists the Castle');
    if (!names.includes('property.keep')) problems.push('the House window does not list the Keep');
    const tall = home.rooms.filter((r) => r.rungs !== 4);
    if (tall.length) problems.push(`rooms not at four visible rungs: ${tall.map((r) => r.room + '=' + r.rungs).join(', ')}`);
    /* The class, as the server holds it: no price in the window names an item the catalogue cannot reach. */
    const { reachableSources } = await import('../src/data/catalogue-coherence.js');
    const reach = reachableSources();
    const rows = await q(db, `select o.offer_id, k as item from public.hr_unlock_offers o, jsonb_object_keys(coalesce(o.items, '{}'::jsonb)) k where o.refusal is null`);
    const dead = rows.filter((r) => !reach.has(r.item));
    if (dead.length) problems.push('sellable rows cost unreachable items: ' + dead.map((r) => r.offer_id + ':' + r.item).join(', '));
    return problems;
  },
};

/* THE PLANTED DEFECTS: each runs inside its arm's transaction, before the arm. `js` plants on the edge's own data. */
const MUTANTS = {
  bear_has_no_pelt: { arm: 'HP-1', why: 'the bug Andy hit: the bear drops no pelt, so nothing can pay the Keep',
    js: (M) => { const was = M.MONSTERS.brook_bear.drops; M.MONSTERS.brook_bear.drops = was.filter((d) => d.id !== 'bear_pelt'); return () => { M.MONSTERS.brook_bear.drops = was; }; } },
  bound_forgets_pelt: { arm: 'HP-1', why: 'the 10-29 class: the kill bound omits the drop, every window refused value_over',
    ddl: "update public.hr_hunt_kill_bounds set drops = drops - 'bear_pelt'" },
  viewed_bound_forgets_pelt: { arm: 'HP-2', why: 'the same bound on the viewed door',
    ddl: "update public.hr_hunt_kill_bounds set drops = drops - 'bear_pelt'" },
  keep_asks_more: { arm: 'HP-3', why: 'the Keep\'s price drifts past what the hero earned',
    ddl: `update public.hr_unlock_offers set items = items || '{"bear_pelt": 500}'::jsonb where offer_id = 'property.keep'` },
  rung_needs_dead_item: { arm: 'HP-3', why: 'a Trophy rung costs an item nobody can hold',
    ddl: `update public.hr_unlock_offers set items = items || '{"dragon_gem": 1}'::jsonb where offer_id = 'room.trophy.3'` },
  castle_sold: { arm: 'HP-4', why: 'the Castle is sold though its scales have no source',
    ddl: `update public.hr_unlock_offers set refusal = null, gold = 150000, items = '{"dragon_scale": 4}'::jsonb, req_property_tier = 4 where offer_id = 'property.castle'` },
};

async function runArm(db, H, M, id, mutant) {
  await db.query('begin');
  let undo = null;
  try {
    if (mutant && mutant.js) undo = mutant.js(M);
    if (mutant && mutant.ddl) await db.query(mutant.ddl);
    return await ARMS[id](db, H, M);
  } finally {
    if (undo) undo();
    await db.query('rollback');
  }
}

async function main() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(1); }
  await H.pinDice(db);
  const M = await H.loadEdge(H.ROOT);
  if (process.argv.includes('--selftest')) {
    let missed = 0;
    for (const [id, m] of Object.entries(MUTANTS)) {
      let p;
      try { p = await runArm(db, H, M, m.arm, m); } catch (e) { p = ['threw: ' + String(e && e.message).slice(0, 200)]; }
      console.log(`  ${p.length ? 'CAUGHT' : 'MISSED'} ${id} [${m.arm}]: ${m.why}${p.length ? ' (' + p[0].slice(0, 110) + ')' : ''}`);
      if (!p.length) missed++;
    }
    console.log(`house-pelts --selftest: ${Object.keys(MUTANTS).length} mutants, ${missed} missed`);
    process.exit(missed ? 1 : 0);
  }
  let bad = 0;
  for (const id of Object.keys(ARMS)) {
    let p;
    try { p = await runArm(db, H, M, id, null); } catch (e) { p = ['threw: ' + String(e && e.stack || e).slice(0, 500)]; }
    if (p.length) { bad++; for (const m of p) console.error(`✗ ${id}: ${m}`); } else console.log(`✓ ${id}`);
  }
  console.log(bad ? `house-pelts: ${bad} arm(s) red` : `house-pelts: all ${Object.keys(ARMS).length} arms green`);
  process.exit(bad ? 1 : 0);
}

if (isMain(import.meta.url)) main();
