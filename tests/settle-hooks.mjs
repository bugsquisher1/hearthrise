#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/settle-hooks.mjs — S1's SETTLE WITH ALL OF S2's HOOKS, IN ORDER, ON ONE
// REPLAYED CHAIN (the S2 architecture check, item 3).
//
//   node tests/settle-hooks.mjs            the guard
//   node tests/settle-hooks.mjs --mutate   every planted defect must be CAUGHT by its arm
//
// 2026-10-25-settle-hooks.sql restates hr_hunt_apply_member / hr_hunt_member_read
// whole with three named hooks: the lock (hr_item_locked), the loot filter
// (hr_hunt_loot_rules, through hr_apply) and the blessing (hr_blessing_take).
// Each hook has its own arm in tests/alpha-server.mjs; this guard runs them
// TOGETHER in one real settle (the edge's propose + commit, tick mode), so an
// ordering or interaction defect between them cannot hide:
//   H-ALL          one 20-minute window with pickups and the hunt's one death
//                  (the core rebuild). Tiers 1-2 bought before the window, tier 3
//                  bought during it; three picked-up items ruled sell / ignore /
//                  sell-but-LOCKED. Then: the death keeps loss − floor(loss x
//                  tier-2 permille), tiers 1-2 are used up and tier 3 is
//                  kept; the sold item is gone for units x the bid (one
//                  loot_sell row, gold_in stamped), the ignored one is gone,
//                  the locked one is kept; the pickups (tally loot) equal an
//                  identical window with no rules; and every coin is journalled
//                  (Σ ledger gold = the purse's move).
//   H-COVER        sell-to-cover with the purse short: unlocked, the cover item
//                  IS sold to pay the store (the control); locked, it is never
//                  offered, never sold, and the settle still lands.
//   H-COVER-FORGED a settle proposal that names a locked item in its cover is
//                  refused item_locked by the database (defence in depth).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootReplay, LAST_PATCHED, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';

const MUTATE = process.argv.includes('--mutate');
const HOOKS = '2026-10-25-settle-hooks.sql';
const WINDOW_MS = 20 * 60000;
const idem = () => crypto.randomUUID();

async function asAuth(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  finally { await db.exec('reset role'); }
}

/* The settle harness's mixed ground: the rats and wolf of pockets 0-1 pay the pickups, the ghouls of pocket 2
   kill a Level-5 hero part-way into its Level and skills (so the death has a price), all inside one window. */
const FALLER = { minutesAgo: 25, inv: {}, bag: [], gold: 0, hp: 20, options: { on_empty: 'end', food_below_pct: 99 },
  level: 5, levelXpOver: 800, skillsXp: { melee: 400, defense: 400 } };
/* Measured: buys store food from a 100 g purse until it runs short, and sell-to-cover then
   sells its bones (bones flagged a cover item by the arm, at 1 g). Dice rewound per arm (runArms). */
/* Its bar buys the store's Salted Shrimp under 99% HP (a slot names ONE item; the eat-at is the slot's condition). */
const COVERER = { minutesAgo: 25, inv: {}, bag: [], gold: 100, level: 3,
  options: { supply_source: 'store', on_empty: 'end', gold_floor: 0,
    slots: [{ action: { type: 'consume', id: 'salted_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 99 }], join: 'and' }] } };

async function snap(H, db, uid, sid) {
  return {
    gold: Number(await H.one(db, 'select gold from public.player_state where user_id = $1 and slot = 0', [uid])),
    inv: (await H.one(db, "select coalesce(jsonb_object_agg(item_id, qty), '{}') from public.player_inventory where user_id = $1 and slot = 0", [uid])) || {},
    loot: (await H.one(db, 'select loot from public.hunt_session_tally where session_id = $1', [sid])) || {},
  };
}

const ARMS = {
  'H-ALL': async (db, { H, M }) => {
    const p = [];
    const uid = H.UIDS[0];
    const h = await H.hunter(db, M, { ...FALLER, row: H.mixedRow });
    const start = await snap(H, db, uid, h.sid);
    const lid = Number(await H.one(db, 'select coalesce(max(id), 0) from public.player_ledger'));
    const once = async (capture) => {
      const r = await H.settleTo(db, M, h.from + WINDOW_MS, { tamper: (c) => { capture.push(JSON.parse(JSON.stringify(c.members[0].hunt.death_xp || []))); } });
      if (r.skipped || !r.res || r.res.ok !== true) throw new Error('the window was not settled: ' + JSON.stringify(r.skipped || r.res).slice(0, 300));
    };
    /* A: the same window with no rule and no blessing (pinned dice: the same fight). */
    await db.query('savepoint s2_hooks');
    await once([]);
    const A = await snap(H, db, uid, h.sid);
    await db.query('rollback to savepoint s2_hooks');
    const picked = [];
    for (const k of Object.keys(A.loot).sort()) {
      if (Number(A.loot[k]) >= 1 && await H.one(db, 'select unit from public.hr_hunt_vendor_value where item_id = $1', [k]) != null) picked.push(k);
    }
    if (picked.length < 3) return [`CONTROL: the window picked up ${picked.length} priced item kinds (need 3): ${JSON.stringify(A.loot)}`];
    const [sellIt, ignoreIt, lockIt] = picked;
    /* B: the rules, the lock and the blessings (tiers 1-2 before the window, tier 3 during it). */
    await db.query('delete from public.hr_rate_counters');
    const say = async (sql, params) => { const r = await asAuth(db, uid, sql, params); if (!r || r.ok !== true) throw new Error(sql.slice(14, 40) + ' refused ' + JSON.stringify(r)); };
    await say("select public.hr_loot_rule_set(0, $1, 'sell', $2::uuid)", [sellIt, idem()]);
    await say("select public.hr_loot_rule_set(0, $1, 'ignore', $2::uuid)", [ignoreIt, idem()]);
    await say("select public.hr_loot_rule_set(0, $1, 'sell', $2::uuid)", [lockIt, idem()]);
    await say('select public.hr_item_lock(0, $1, true, $2::uuid)', [lockIt, idem()]);
    await db.query(`insert into public.player_blessings (user_id, slot, tier, paid, bought_at)
      select $1, 0, t.tier, 0, case when t.tier < 3 then now() - interval '2 days' else now() end from public.hr_blessing_tiers t`, [uid]);
    const pm2 = Number(await H.one(db, 'select permille from public.hr_blessing_tiers where tier = 2'));
    const raws = [];
    await once(raws);
    const B = await snap(H, db, uid, h.sid);
    const rows = await H.q(db, 'select intent, gold, gold_in, meta from public.player_ledger where user_id = $1 and id > $2 order by id', [uid, lid]);
    const dx = raws[0] || [];
    if (dx.length !== 1) return [`CONTROL: the window held ${dx.length} deaths (need the hunt's one)`];
    /* The fight is the window's own: the pickups do not depend on the hooks. */
    if (JSON.stringify(B.loot) !== JSON.stringify(A.loot)) p.push('the pickups moved with the hooks: ' + JSON.stringify({ A: A.loot, B: B.loot }));
    /* LOOT + LOCK. */
    const sold = rows.filter((r) => r.intent === 'loot_sell');
    const unit = Number(await H.one(db, 'select unit from public.hr_hunt_vendor_value where item_id = $1', [sellIt]));
    if (sold.length !== 1 || Number(sold[0].meta.items[sellIt].qty) !== Number(A.loot[sellIt]) || Number(sold[0].gold) !== Number(A.loot[sellIt]) * unit
        || Number(sold[0].gold_in) !== Number(sold[0].gold) || sold[0].meta.items[lockIt]) {
      p.push(`loot_sell rows ${JSON.stringify(sold)} (want one: ${A.loot[sellIt]} x ${sellIt} at ${unit}, nothing of the locked ${lockIt})`);
    }
    if (Number(B.inv[sellIt] || 0) !== 0) p.push(`${sellIt}: ${B.inv[sellIt]} left in the bag after its sale`);
    if (Number(B.inv[ignoreIt] || 0) !== 0 || !rows.some((r) => r.intent === 'loot_ignore' && Number(r.meta.items[ignoreIt]) === Number(A.loot[ignoreIt]))) {
      p.push(`${ignoreIt}: the ignore rule left ${B.inv[ignoreIt]} in the bag`);
    }
    if (Number(B.inv[lockIt] || 0) !== Number(A.inv[lockIt] || 0)) p.push(`${lockIt}: the LOCKED item went ${A.inv[lockIt]} -> ${B.inv[lockIt]}`);
    /* EVERY COIN JOURNALLED. */
    const sum = rows.reduce((a, r) => a + Number(r.gold || 0), 0);
    if (sum !== B.gold - start.gold) p.push(`the purse moved ${B.gold - start.gold}, the ledger journals ${sum}`);
    /* BLESSINGS: tier 2's protection on the death; 1-2 used up, 3 kept. */
    const want = {};
    for (const [k, n] of Object.entries(dx[0])) if (Number(n) > 0) want[k] = Number(n) - Math.floor(Number(n) * pm2 / 1000);
    const debit = rows.filter((r) => r.intent === 'death_xp');
    const got = debit.length === 1 ? debit[0].meta.xp : null;
    for (const [k, v] of Object.entries(want)) if (!got || Number(got[k] || 0) !== v) p.push(`death_xp ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    const held = (await H.q(db, 'select tier from public.player_blessings where user_id = $1 order by tier', [uid])).map((r) => r.tier);
    if (JSON.stringify(held) !== '[3]') p.push(`held tiers after the death ${JSON.stringify(held)} (want [3]: bought during the window)`);
    if (rows.filter((r) => r.intent === 'blessing_used').length !== 1) p.push('want ONE blessing_used row');
    return [...new Set(p)];
  },

  'H-COVER': async (db, ctx) => coverArm(db, ctx, false),
  'H-COVER-FORGED': async (db, ctx) => coverArm(db, ctx, true),
};

/* SELL-TO-COVER with the purse short, on a drop the test flags as cover-sellable. */
async function coverArm(db, { H, M }, forged) {
  const p = [];
  const uid = H.UIDS[0];
  const h = await H.hunter(db, M, COVERER);
  const item = 'bones';
  /* 50 g a bone: one pickup covers a store heal, so EVERY seed reaches the cover case (at 1 g a
     bone only ~1 seed in 6 picked up enough before gold_out ended the hunt — the H-COVER flake). */
  await db.query('insert into public.hr_hunt_cover_items (item_id, unit) values ($1, 50) on conflict (item_id) do update set unit = 50', [item]);
  if (forged) {
    await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 5) on conflict (user_id, slot, item_id) do update set qty = 5', [uid, item]);
    const go = async () => (await H.settleTo(db, M, h.from + 90000, { tamper: (c) => { c.members[0].hunt.cover = { [item]: 1 }; } })).res;
    await db.query('savepoint s2_forged');
    const open = await go();
    await db.query('rollback to savepoint s2_forged');
    if (open && open.error === 'item_locked') return ['CONTROL: an unlocked cover line was refused item_locked'];
    await db.query('delete from public.hr_rate_counters');
    await asAuth(db, uid, 'select public.hr_item_lock(0, $1, true, $2::uuid)', [item, idem()]);
    const r = await go();
    if (!r || r.ok !== false || r.error !== 'item_locked') p.push(`a forged cover of the locked ${item} answered ${JSON.stringify(r).slice(0, 200)}`);
    return p;
  }
  const run = async () => {
    for (const t of H.ticksOf(90000, 12 * 60000)(h.from)) {
      const r = await H.settleTo(db, M, t, { raw: true });
      if (r.skipped) break;
      if (!r.res || r.res.ok !== true) return { refused: r.res };
    }
    const covered = await H.q(db, "select meta from public.player_ledger where user_id = $1 and intent = 'vendor_cover'", [uid]);
    return { soldQ: covered.reduce((a, r) => a + Number(((r.meta.items || {})[item] || {}).qty || 0), 0),
      inv: Number(await H.one(db, 'select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)', [uid, item])),
      loot: Number((await H.one(db, 'select loot from public.hunt_session_tally where session_id = $1', [h.sid]) || {})[item] || 0) };
  };
  await db.query('savepoint s2_cover');
  const A = await run();
  await db.query('rollback to savepoint s2_cover');
  if (A.refused || !(A.soldQ > 0)) return [`CONTROL: unlocked, sell-to-cover never sold ${item}: ${JSON.stringify(A)}`];
  await db.query('delete from public.hr_rate_counters');
  await asAuth(db, uid, 'select public.hr_item_lock(0, $1, true, $2::uuid)', [item, idem()]);
  const B = await run();
  if (B.refused) p.push(`with ${item} locked a settle was refused: ${JSON.stringify(B.refused).slice(0, 200)}`);
  else {
    if (B.soldQ !== 0) p.push(`sell-to-cover SOLD ${B.soldQ} of the locked ${item}`);
    if (B.inv !== B.loot) p.push(`the locked ${item}: bag ${B.inv}, picked up ${B.loot}`);
  }
  return p;
}

/* Each mutant: file, [find, replace], the arm that must go red (the file's self-check is turned off).
   hr_hunt_apply_member and hr_hunt_member_read are RESTATED by the core rebuild (2026-10-27-core-bodies.sql):
   their hooks are planted in the bodies that run. */
const BODIES = '2026-10-27-core-bodies.sql';
const MUTANTS = [
  { arm: 'H-ALL', file: BODIES, why: 'the settle skips the loot filter',
    find: "  v_loot := public.hr_hunt_loot_rules(p_user, p_slot, p_session, p_intent, p_delta->'items', v_to);", repl: '  v_loot := null;' },
  { arm: 'H-ALL', file: BODIES, why: 'the settle skips the blessing',
    find: '    v_bless := public.hr_blessing_take(p_user, p_slot, p_session, v_dx, v_s.settled_to);', repl: '    v_bless := null;' },
  { arm: 'H-ALL', file: '2026-10-25-blessings.sql', why: 'a tier bought during the window covers it',
    find: '   where b.user_id = p_user and b.slot = p_slot and b.bought_at <= p_from', repl: '   where b.user_id = p_user and b.slot = p_slot' },
  { arm: 'H-ALL', file: '2026-10-25-bag-rules.sql', why: 'the loot filter sells a locked item',
    find: "       and r.loot_rule in ('sell', 'ignore') and not r.locked", repl: "       and r.loot_rule in ('sell', 'ignore')" },
  { arm: 'H-COVER', file: BODIES, why: 'the read offers a locked item to sell-to-cover',
    find: '                where not public.hr_item_locked(p_s.user_id, p_s.slot, c.item_id)), \'{}\'::jsonb))', repl: "                where true), '{}'::jsonb))" },
  { arm: 'H-COVER-FORGED', file: BODIES, why: 'the member settle takes a cover line naming a locked item',
    find: "      if public.hr_item_locked(p_user, p_slot, v_k) then perform public.hr_reject('item_locked', jsonb_build_object('item', v_k)); end if;", repl: '' },
];

function selfCheckOff(file) {
  const src = readFileSync(join(ROOT, 'supabase', 'migrations', file), 'utf8').replace(/\r\n/g, '\n');
  const m = src.match(/\n(-- (?:── )?§\d+ SELF-CHECK[^\n]*(?:\n--[^\n]*)*)\n(do \$(\w*)\$)/);
  if (!m) throw new Error('no self-check heading in ' + file);
  return [m[1] + '\n' + m[2], m[1] + '\ncreate or replace function pg_temp.s2_selfcheck_off() returns void language plpgsql as $' + m[3] + '$'];
}

/* A fight's dice depend on the wall clock as well as the seed (the arrival is stamped from
   now()), so a window that did not set up the case (too few falls or pickups) is re-dealt
   from a fresh seed, up to ATTEMPTS times; only a CONTROL that holds every time is reported.
   A real problem is never retried away: the first attempt that sets the case up is judged. */
const ATTEMPTS = 6;
async function runArms(db, ctx, only) {
  const out = [];
  for (const [name, fn] of Object.entries(ARMS)) {
    if (only && !only.includes(name)) continue;
    let problems;
    for (let a = 0; a < ATTEMPTS; a++) {
      await db.query('begin');
      await db.query('select setval($1, $2, false)', ['public.hr_test_uuid_seq', 1000 + a * 997]);
      try { problems = await fn(db, ctx); } catch (e) { problems = ['HARNESS: ' + String(e.message).slice(0, 400)]; }
      finally { await db.query('rollback'); }
      if (!(problems.length === 1 && problems[0].startsWith('CONTROL'))) break;
    }
    out.push({ name, problems });
  }
  return out;
}

async function main() {
  const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
  const ctx = { H, M: await H.loadEdge(ROOT) };
  if (!MUTATE) {
    let db;
    try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 400)); process.exit(1); }
    await H.pinDice(db);
    const res = await runArms(db, ctx);
    let bad = 0;
    for (const r of res) {
      if (r.problems.length) { bad++; for (const x of r.problems) console.error(`✗ ${r.name}: ${x}`); } else console.log(`✓ ${r.name}`);
    }
    console.log(bad ? `settle-hooks: ${bad} of ${res.length} arms red` : `settle-hooks: green — ${res.length} arms`);
    process.exit(bad ? 1 : 0);
  }
  let missed = 0;
  for (const mu of MUTANTS) {
    let db;
    const pairs = [selfCheckOff(mu.file), [mu.find, mu.repl]];
    try { ({ db } = await bootReplay({ patches: new Map([[mu.file, pairs]]), upTo: mu.file === HOOKS ? LAST_PATCHED : undefined,
      fullChain: mu.file === HOOKS ? undefined : 'the hook lives in its feature file and is called only by 2026-10-25-settle-hooks.sql, which must run after it for the settle to reach the defect' })); }
    catch (e) { console.error(`✗ HARNESS ${mu.arm} (${mu.why}): ${String(e.message).split('\n').slice(0, 2).join(' ')}`); missed++; continue; }
    await H.pinDice(db);
    const [r] = await runArms(db, ctx, [mu.arm]);
    const real = r.problems.filter((x) => !x.startsWith('HARNESS') && !x.startsWith('CONTROL'));
    if (real.length) console.log(`✓ ${mu.arm} catches: ${mu.why} — ${real[0].slice(0, 140)}`);
    else { console.error(`✗ ${mu.arm} MISSED: ${mu.why}${r.problems.length ? ' (' + r.problems[0].slice(0, 200) + ')' : ''}`); missed++; }
    await db.close().catch(() => {});
  }
  console.log(missed ? `settle-hooks --mutate: ${missed} of ${MUTANTS.length} MISSED` : `settle-hooks --mutate: all ${MUTANTS.length} mutants caught`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) main();
