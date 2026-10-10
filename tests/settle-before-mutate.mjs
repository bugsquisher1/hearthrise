#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/settle-before-mutate.mjs — THE ABSENCE IS PRICED AT THE STATE THAT
//                                  EXISTED DURING IT (Security F2, 2026-09-28).
//
//   node tests/settle-before-mutate.mjs                    the guard
//   node tests/settle-before-mutate.mjs --mutate=<id>      plant ONE defect (must go RED)
//   node tests/settle-before-mutate.mjs --selftest         clean green, every mutation RED
//   node tests/settle-before-mutate.mjs --only=R5          R5 alone (gradable on a base checkout)
//
// Spec: docs/planning/SEC_ABSENCE_PRICED_AT_RETURN_2026-09-28.md §4.1.
// Ships with: supabase/migrations/2026-09-28-settle-before-mutate.sql and
//             supabase/migrations/2026-09-28-buff-segment-from.sql.
//
// ── WHAT IT PROVES ─────────────────────────────────────────────────────────
//  R5  A CLIENT-DIRECT RPC ON A STALE ROW IS REFUSED AND WRITES NOTHING. The
//      production shape: a miner whose accrued_to is 7.25 h old claims
//      road_forge (it grants the iron pickaxe) as `authenticated`. The answer is
//      settle_first and the character — bag, gold, version, accrued_to, progress,
//      ledger, intents — is byte-identical afterwards; the same holds for
//      hr_set_auto_eat, hr_credit_kills and hr_claim_daily, and for hr_apply (as
//      hr_engine) with a non-stamping items:+1 or a buff_apply. Once the row is
//      settled the SAME claim pays, so the refusal is not vacuous.
//      `--mutate=staleMs12h` raises the threshold to 12 h (§4 blinded) → RED.
//  R6  A LIVE PARTY HUNT IS NOT AN EXEMPTION (Security F2/F3 review). While the
//      party channel is SHADOW the member's own settle pays the whole hunt after
//      the stop, so a stale partied row is refused party_hunt_running by a
//      client-direct claim and by hr_apply, writes nothing, and falls back to
//      settle_first once the hunt stops. `--mutate=partyExempt` restores the
//      exemption (return null for a partied row) → RED.
//  R4  A MID-ABSENCE SWAP COUNTS (the world-tick contract, verdict §3). In the
//      tests/world-tick-parity.mjs harness a real version bump grants the pickaxe
//      at t = 3 h: every window before it runs at 12.80 s and every window after
//      it at 11.52 s, and the fold differs from the no-swap fold by the modelled
//      delta (+15.6 % ore × 4.25/7.25, +11.1 % actions × 4.25/7.25) within ±0.5 %.
//      (XP is reported, not modelled: the tool's xpB is floored per action.)
//      The accrue settle, split at the swap as settle-before-mutate forces it,
//      agrees with the tick fold within ±0.5 % (verdict P5); the pre-fix
//      ordering (claim first, one settle over the whole night) does NOT.
//      `--mutate=noReseed` carries the pre-bump session across the version move
//      (the tick-contract.js:376 staleness gate skipped) → RED.
//  S1  A SECOND APPLY IS A NO-OP — both files re-apply at chain end and every
//      body they touch is byte-identical.
//  S2  ONE THRESHOLD, ONE PAYABLE SET — the SQL's c_settle_first_ms equals
//      COMBAT_XP_SETTLE_FIRST_MS and its c_payable equals accrual.js PAYABLE_KINDS.
//
// NO CREDENTIALS. NO NETWORK. NO `?v=` on the imports (tests/**, b332).
// Exit: 0 green · 1 a violation · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, LAST_PATCHED, ROOT } from './schema-replay.mjs';
import { COMBAT_XP_SETTLE_FIRST_MS } from '../src/core/combat-xp-cap.js';
import { computeAccrual, PAYABLE_KINDS, CALLER_AUTHORITY }
  from '../supabase/functions/hr-accrue/accrual.js';
import { settleGatherSession, intentValue, atSpan, GATHER_CATALOGUES }
  from '../services/world-tick/gather.js';
import { seedFor } from '../services/world-tick/shadow.js';

const MIG_SBM = '2026-09-28-settle-before-mutate.sql';
const MIG_FROM = '2026-09-28-buff-segment-from.sql';
const UID = '00000000-0000-4000-8000-00000000f25b';
const TOOL = 'iron_pickaxe';
const STALE = '7 hours 15 minutes';

const harness = (m) => { const e = new Error(m); e.harness = true; return e; };
let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed += 1; console.error(`  FAIL  ${msg}`); } };

/* ── THE MUTATIONS ───────────────────────────────────────────────────────── */
const SBM_S4_BLIND = [
  '  -- (e) hr_assert_grant_hygiene is unchanged, and still passes strict.',
  '  return;  -- §4 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/settle-before-mutate.mjs)\n'
  + '  -- (e) hr_assert_grant_hygiene is unchanged, and still passes strict.'];
const MUTATIONS = {
  staleMs12h: {
    why: 'the settle-first threshold is 12 h instead of 180 s, so a 7.25 h absence is "settled" and a '
       + 'claim prices the whole night at the tool it grants',
    patches: new Map([[MIG_SBM, [
      ['  c_settle_first_ms constant bigint := 180000;', '  c_settle_first_ms constant bigint := 43200000;'],
      SBM_S4_BLIND]]]),
  },
  partyExempt: {
    why: 'a stale row in a live SHADOW party hunt is admitted, so a claim mid-hunt lands before the '
       + 'member\'s own settle prices the whole hunt at it (F1\'s party mint, client-direct)',
    patches: new Map([[MIG_SBM, [
      ['    if c_party_channel_pays then return null; end if;\n',
       '    return null;  -- MUTANT partyExempt\n'],
      SBM_S4_BLIND]]]),
  },
  noReseed: {
    why: 'the tick carries its pre-bump session across a version move (the staleness gate skipped), so '
       + 'a tool granted mid-absence never reaches the windows after it',
    r4: 'noReseed',
  },
};

// ── R5 ──────────────────────────────────────────────────────────────────────
async function asRole(db, role, sql, params) {
  await db.exec(`set role ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
}
async function snapshot(db) {
  const q = async (sql) => JSON.stringify((await db.query(sql, [UID])).rows);
  return {
    state: await q(`select gold::text, version::text, accrued_to::text, auto_eat_enabled, active_kind
                      from player_state where user_id = $1 and slot = 0`),
    inv: await q('select item_id, qty::text from player_inventory where user_id = $1 order by item_id'),
    progress: await q(`select kind, key, value::text from player_progress where user_id = $1
                        order by kind, key, period_key`),
    ledger: await q('select count(*)::int n from player_ledger where user_id = $1'),
    intents: await q('select count(*)::int n from player_intents where user_id = $1'),
  };
}

async function r5(db) {
  await db.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [UID]);
  await db.query(`insert into player_state (user_id, slot, gold, gems, hp, max_hp, version,
                    accrued_to, active_kind, active_id, active_since)
                  values ($1, 0, 1000, 0, 10, 10, 1, now() - interval '${STALE}',
                          'combat', 'r5_probe_target', now() - interval '8 hours')`, [UID]);
  await db.query(`insert into player_progress (user_id, slot, kind, key, value, period_key, updated_at)
                  values ($1, 0, 'stat', 'ev:smithed', 60, '', now())`, [UID]);
  const food = (await db.query('select item_id from hr_item_buffs order by item_id limit 1')).rows[0].item_id;
  await db.query('insert into player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 5)', [UID, food]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [UID]);

  const before = await snapshot(db);
  const client = async (sql, params) => (await asRole(db, 'authenticated', sql, params))[0].r;

  const claim = await client("select public.hr_claim_quest('road_forge', 0) r");
  ok(claim && claim.ok === false && claim.error === 'settle_first',
    `R5 a 7.25 h-stale hr_claim_quest(road_forge) was not refused settle_first — got ${JSON.stringify(claim)}. `
    + 'The claim lands the iron pickaxe first and the settle then prices the whole night at it.');
  const others = [
    ['hr_set_auto_eat', 'select public.hr_set_auto_eat(0, true, null, null, false) r'],
    ['hr_credit_kills', `select public.hr_credit_kills(0, 'slime', 1, '${crypto.randomUUID()}') r`],
    ['hr_claim_daily', "select public.hr_claim_daily('daily_kill', 0) r"],
  ];
  for (const [fn, sql] of others) {
    const r = await client(sql);
    ok(r && r.error === 'settle_first', `R5 ${fn} on the stale row answered ${JSON.stringify(r)}, not settle_first`);
  }
  const version = Number((await db.query('select version::text v from player_state where user_id=$1 and slot=0',
    [UID])).rows[0].v);
  const J = { kind: 'admin', intent: 'r5_probe' };
  for (const [what, delta] of [
    ['items:+1', { items: { [TOOL]: 1 }, journal: J }],
    ['buff_apply', { buff_apply: { item: food }, items: { [food]: -1 }, journal: J }],
  ]) {
    const [row] = await asRole(db, 'hr_engine', 'select public.hr_apply($1,0,$2,$3,$4::text::jsonb) r',
      [UID, version, crypto.randomUUID(), JSON.stringify(delta)]);
    ok(row.r && row.r.error === 'settle_first',
      `R5 hr_apply with a non-stamping ${what} on the stale row answered ${JSON.stringify(row.r).slice(0, 160)}`);
  }
  const noted = Number((await db.query(
    "select coalesce(sum(n), 0)::int n from hr_rejections where user_id = $1 and code = 'settle_first'",
    [UID])).rows[0].n);
  /* Journalled exactly once each: the client-direct refusals through
     hr_settle_first_noted, the two hr_apply refusals by hr_apply's own recorder. */
  ok(noted === 1 + others.length + 2,
    `R5 hr_rejections holds ${noted} settle_first refusal(s) for the ${1 + others.length + 2} refused calls — `
    + 'a refusal nobody records is one the vitals cannot see (CLAUDE.md §3.4), one recorded twice inflates them');
  const after = await snapshot(db);
  for (const k of Object.keys(before)) {
    ok(before[k] === after[k], `R5 a refused call WROTE the character (${k}): ${before[k]} -> ${after[k]}`);
  }

  /* NOT VACUOUS: the same claim on the same character, once its window is paid. */
  await db.query("update player_state set accrued_to = now() - interval '60 seconds' where user_id = $1", [UID]);
  const paid = await client("select public.hr_claim_quest('road_forge', 0) r");
  ok(paid && paid.ok === true && paid.items && paid.items[TOOL] === 1,
    `R5 the same claim on a settled row was not paid — got ${JSON.stringify(paid)}; the refusal above proves nothing`);
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
}

// ── R6 ──────────────────────────────────────────────────────────────────────
async function r6(db) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [UID]);
  await db.query(`update player_state set accrued_to = now() - interval '${STALE}', active_kind = 'combat',
                    active_id = 'r5_probe_target' where user_id = $1 and slot = 0`, [UID]);
  const pid = (await db.query('insert into party (leader_user, leader_slot) values ($1, 0) returning id::text',
    [UID])).rows[0].id;
  await db.query("insert into party_member (party_id, user_id, slot, role) values ($1, $2, 0, 'leader')", [pid, UID]);
  await db.query(`insert into party_hunt (party_id, active_id, accrued_to)
                  values ($1, 'r5_probe_target', now() - interval '${STALE}')`, [pid]);
  const before = await snapshot(db);
  const client = async (sql) => (await asRole(db, 'authenticated', sql))[0].r;
  for (const [fn, sql] of [
    ['hr_set_auto_eat', 'select public.hr_set_auto_eat(0, false, null, null, false) r'],
    ['hr_claim_daily', "select public.hr_claim_daily('daily_kill', 0) r"],
  ]) {
    const r = await client(sql);
    ok(r && r.ok === false && r.error === 'party_hunt_running',
      `R6 ${fn} on a stale row in a live SHADOW party hunt answered ${JSON.stringify(r)}, not party_hunt_running. `
      + 'The member\'s own settle prices the whole hunt after the stop, so an admitted claim is F1\'s mint.');
  }
  const version = Number((await db.query('select version::text v from player_state where user_id=$1 and slot=0',
    [UID])).rows[0].v);
  const [row] = await asRole(db, 'hr_engine', 'select public.hr_apply($1,0,$2,$3,$4::text::jsonb) r',
    [UID, version, crypto.randomUUID(), JSON.stringify({ items: { [TOOL]: 1 }, journal: { kind: 'admin', intent: 'r6' } })]);
  ok(row.r && row.r.error === 'party_hunt_running',
    `R6 hr_apply items:+1 on a partied stale row answered ${JSON.stringify(row.r).slice(0, 160)}`);
  const after = await snapshot(db);
  for (const k of Object.keys(before)) {
    ok(before[k] === after[k], `R6 a refused partied call WROTE the character (${k}): ${before[k]} -> ${after[k]}`);
  }
  await db.query("update party_hunt set ended_at = now(), stopped_by = 'leader' where party_id = $1", [pid]);
  const stopped = await client('select public.hr_set_auto_eat(0, false, null, null, false) r');
  ok(stopped && stopped.error === 'settle_first',
    `R6 once the hunt stops the stale row must answer settle_first (the settle clears it) — got ${JSON.stringify(stopped)}`);
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
}

// ── S1 / S2 ─────────────────────────────────────────────────────────────────
const TOUCHED = [
  'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'public.hr_state_of(uuid,int)',
  'public.hr_settle_first_of(uuid,int)', 'public.hr_require_settled(uuid,int)',
  'public.hr_settle_first_noted(text,uuid,int)',
  /* hr_claim_goal(text,boolean,int,uuid) was wired here too and left with the
     goals board (2026-10-16-goal-board-retire.sql); S1 re-applies on a replay
     that stops before that file, so the second apply still meets it. */
  'public.hr_claim_quest(text,int)', 'public.hr_claim_goal(text,boolean,int,uuid)',
  'public.hr_claim_daily(text,int)', 'public.hr_claim_milestone(text,int)', 'public.hr_claim_rank(text,int)',
  'public.hr_credit_kills(int,text,bigint,text)', 'public.hr_trait_buy(text,int,uuid)',
  'public.raid_claim(text,uuid,text,int)', 'public.world_event_claim(text,int)',
  'public.hr_set_auto_eat(int,boolean,text,int,boolean)', 'public.hr_bank_move(int,text,bigint,text,uuid)',
  'public.hr_farm_harvest(int,int,uuid)', 'public.hr_unlock_buy(uuid,int,bigint,uuid,text)',
  'public.hr_market_buy(uuid,int,bigint,uuid,uuid,bigint)', 'public.hr_market_cancel(uuid,int,bigint,uuid,uuid)',
  'public.hr_quartermaster_buy(uuid,int,bigint,uuid,text)',
  'public.hr_dungeon_settle(uuid,int,bigint,uuid,text,text,numeric)'];

async function s1(db) {
  const defs = async () => {
    const out = {};
    for (const sig of TOUCHED) {
      out[sig] = (await db.query('select pg_get_functiondef($1::regprocedure) d', [sig])).rows[0].d;
    }
    return out;
  };
  const before = await defs();
  for (const f of [MIG_SBM, MIG_FROM]) {
    const sql = (await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8')).replace(/\r\n/g, '\n');
    let err = null;
    try { await db.exec(`begin;\n${sql}\ncommit;`); } catch (e) { err = e; await db.exec('rollback').catch(() => {}); }
    ok(!err, `S1 a second apply of ${f} did not run clean — ${err && String(err.message).split('\n')[0]}`);
  }
  const after = await defs();
  for (const sig of TOUCHED) {
    ok(before[sig] === after[sig], `S1 ${sig} CHANGED on a second apply — the patch is not idempotent`);
  }
}

async function s2() {
  const sql = await readFile(join(ROOT, 'supabase', 'migrations', MIG_SBM), 'utf8');
  const t = sql.match(/c_settle_first_ms constant bigint := (\d+);/);
  ok(!!t && Number(t[1]) === COMBAT_XP_SETTLE_FIRST_MS,
    `S2 c_settle_first_ms ${t && t[1]} != COMBAT_XP_SETTLE_FIRST_MS ${COMBAT_XP_SETTLE_FIRST_MS}`);
  const p = sql.match(/c_payable constant text\[\] := array\[([^\]]*)\]/);
  const kinds = p ? p[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).sort() : null;
  ok(!!kinds && JSON.stringify(kinds) === JSON.stringify([...PAYABLE_KINDS].sort()),
    `S2 c_payable ${JSON.stringify(kinds)} != accrual.js PAYABLE_KINDS ${JSON.stringify(PAYABLE_KINDS)}`);
}

// ── R4 ──────────────────────────────────────────────────────────────────────
/* The production row: mithril (12.80 s bare, 11.52 s with the iron pickaxe),
   17:45 -> 01:00 (7.25 h), the tool arriving mid-absence — here at t = 3 h. */
const R4_FROM = Date.UTC(2026, 8, 26, 17, 45, 0);
const R4_SWAP = R4_FROM + 3 * 3600000;
const R4_END = R4_FROM + 7.25 * 3600000;
const R4_SESSION = {
  name: 'R4 miner, pickaxe granted at t = 3 h', userId: '00000000-0000-4000-8000-0000000000f4',
  slot: 0, shard: 0, version: 2047, activeId: 'mithril_rock', activeSinceOffsetMs: 0,
  capMs: 43200000, seed: 20260927, hp: 50, maxHp: 50, gold: 0,
  skills: { mining: 5000000, hitpoints: 200000 }, inventory: {}, equipment: {}, toolCarry: {},
};
const BAND = 0.005;

function r4(mut) {
  const s = atSpan(R4_SESSION, R4_FROM);
  const noSwap = settleGatherSession(s, R4_FROM, R4_END, {});
  const before = settleGatherSession(s, R4_FROM, R4_SWAP, {});
  const last = before.intents[before.intents.length - 1];
  /* THE VERSION BUMP. A real write (the claim) moved player_state.version, so the
     tick drops what it carried and re-seeds from TRUTH: the bag now holds the
     pickaxe and the watermark / tool_carry are the server's after the last flush. */
  const truth = {
    ...s, version: s.version + 1, inventory: { ...s.inventory, [TOOL]: 1 },
    accruedToMs: before.watermarkMs,
    toolCarry: (last && last.args.p_delta.tool_carry) || s.toolCarry,
  };
  const resumed = mut === 'noReseed' ? { ...truth, version: s.version, inventory: { ...s.inventory } } : truth;
  const after = settleGatherSession(resumed, before.watermarkMs, R4_END, {});

  const intervals = (run) => [...new Set(run.results.filter((r) => r.res.accrued)
    .map((r) => r.res.summary.intervalMs))];
  ok(JSON.stringify(intervals(before)) === '[12800]',
    `R4 windows BEFORE the swap ran at ${JSON.stringify(intervals(before))} ms, want [12800]`);
  ok(JSON.stringify(intervals(after)) === '[11520]',
    `R4 windows AFTER the swap ran at ${JSON.stringify(intervals(after))} ms, want [11520] — the tool granted `
    + 'by the version bump never reached the tick');

  const fold = intentValue([...before.intents, ...after.intents]);
  const base = intentValue(noSwap.intents);
  const post = (R4_END - R4_SWAP) / (R4_END - R4_FROM);
  const oreModel = 1 + (1.04 * 12800 / 11520 - 1) * post;
  const tickModel = 1 + (12800 / 11520 - 1) * post;
  const ore = fold.items.mithril_ore / base.items.mithril_ore;
  const ticks = fold.ticks / base.ticks;
  const xp = fold.xp.mining / base.xp.mining;
  ok(Math.abs(ore / oreModel - 1) <= BAND,
    `R4 the swap fold pays ${ore.toFixed(4)}x the no-swap ore, model ${oreModel.toFixed(4)}x (±${BAND * 100}%)`);
  ok(Math.abs(ticks / tickModel - 1) <= BAND,
    `R4 the swap fold runs ${ticks.toFixed(4)}x the no-swap actions, model ${tickModel.toFixed(4)}x (±${BAND * 100}%)`);
  ok(xp > 1, `R4 the swap fold paid no more XP than the no-swap fold (x${xp.toFixed(4)})`);

  /* P5: the accrue settle agrees — when it is split at the swap, which is what
     settle-before-mutate forces (the claim is refused until the window is paid). */
  const accrue = (sess, fromMs, toMs) => computeAccrual({
    userId: sess.userId, slot: sess.slot, nowMs: toMs, accruedToMs: fromMs,
    activeSinceMs: R4_FROM, activeKind: 'gather', activeId: sess.activeId, capMs: sess.capMs,
    seed: seedFor(sess.userId, sess.slot, fromMs), hp: sess.hp, maxHp: sess.maxHp, gold: sess.gold,
    skills: sess.skills, inventory: sess.inventory, equipment: sess.equipment, toolCarry: sess.toolCarry,
    items: GATHER_CATALOGUES.items, monsters: {}, nodes: GATHER_CATALOGUES.nodes,
    caller: 'accrue', callerAuthority: CALLER_AUTHORITY,
  });
  const a1 = accrue(s, R4_FROM, R4_SWAP);
  const settledTo = Date.parse(a1.delta.accrued_to);
  const a2 = accrue({ ...truth, toolCarry: a1.delta.tool_carry || {} }, settledTo, R4_END);
  const split = (a1.delta.items.mithril_ore || 0) + (a2.delta.items.mithril_ore || 0);
  ok(Math.abs(split / fold.items.mithril_ore - 1) <= BAND,
    `R4/P5 the split accrue settle pays ${split} ore, the tick fold ${fold.items.mithril_ore} (±${BAND * 100}%)`);
  /* …and the ordering the verdict found in production does not: claim first, then
     ONE settle over the whole night at the new state. Asserted so this arm keeps
     saying what the fix is for. */
  const wrong = accrue(truth.inventory && { ...s, inventory: truth.inventory }, R4_FROM, R4_END);
  const wrongOre = wrong.delta.items.mithril_ore;
  ok(wrongOre / fold.items.mithril_ore - 1 > 0.05,
    `R4 the claim-first single settle (${wrongOre} ore) is within 5% of the per-window fold `
    + `(${fold.items.mithril_ore}) — the fixture no longer shows the defect it pins`);
  return { ore, oreModel, ticks, tickModel, xp, split, fold: fold.items.mithril_ore, wrongOre };
}

// ── THE RUN ────────────────────────────────────────────────────────────────
async function run(mutate, { only } = {}) {
  const m = mutate ? MUTATIONS[mutate] : null;
  if (mutate && !m) throw harness(`unknown mutation '${mutate}'`);
  if (!only || only === 'R4') {
    const r = r4(m && m.r4);
    if (!only) console.log(`  R4 ore x${r.ore.toFixed(4)} (model x${r.oreModel.toFixed(4)}), actions `
      + `x${r.ticks.toFixed(4)} (model x${r.tickModel.toFixed(4)}), xp x${r.xp.toFixed(4)}; split settle `
      + `${r.split} vs tick ${r.fold} ore; claim-first single settle ${r.wrongOre}`);
  }
  if (only === 'R4' || (m && m.r4)) return failed;
  let db;
  try { ({ db } = await bootReplay({ patches: m && m.patches, upTo: LAST_PATCHED })); } catch (e) {
    if (e.harness) throw e;
    throw harness(`the migration chain would not apply — ${String(e.message).split('\n').slice(0, 3).join(' | ')}`);
  }
  await r5(db);
  await r6(db);
  await db.close?.();
  if (!only && !mutate) {
    /* The second apply runs on the chain AS OF these two files: a later file
       (2026-10-16-goal-board-retire.sql) drops hr_claim_goal, which the first
       file wires, so re-applying it at the chain end would test that drop, not
       this file's idempotency. */
    const { db: db1 } = await bootReplay({ upTo: MIG_FROM });
    await s1(db1);
    await db1.close?.();
    await s2();
  }
  return failed;
}

// ── CLI ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/settle-before-mutate.mjs');
const argOf = (name) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1];
};

/** Registered surface for run-ci-local. */
export async function settleBeforeMutateGuard() { failed = 0; await run(); return failed; }

if (RUN_DIRECTLY) {
  try {
    if (argv.includes('--selftest')) {
      failed = 0;
      await run();
      if (failed) { console.error(`settle-before-mutate --selftest: the CLEAN run is RED (${failed})`); process.exit(1); }
      let slipped = 0;
      for (const [id, mm] of Object.entries(MUTATIONS)) {
        failed = 0;
        const n = await run(id);
        console.log(`${n ? 'caught  ' : 'SLIPPED '} ${id.padEnd(12)} ${mm.why}`);
        if (!n) slipped += 1;
      }
      if (slipped) { console.error(`settle-before-mutate --selftest: ${slipped} mutation(s) stayed green`); process.exit(1); }
      console.log(`settle-before-mutate --selftest: clean green, all ${Object.keys(MUTATIONS).length} mutations RED`);
      process.exit(0);
    }
    const mutate = argOf('mutate');
    const only = argOf('only');
    const n = await run(mutate, { only });
    if (mutate) {
      if (n) { console.log(`settle-before-mutate --mutate=${mutate}: RED (${n}) — caught`); process.exit(0); }
      console.error(`x --mutate=${mutate}: STAYED GREEN`); process.exit(1);
    }
    if (n) { console.error(`settle-before-mutate: ${n} violation(s)`); process.exit(1); }
    console.log(`settle-before-mutate${only ? ` (${only} only)` : ''}: a client-direct RPC or a non-stamping `
      + 'hr_apply on a 7.25 h-stale row is refused settle_first and writes nothing, and the same claim pays '
      + 'once the window is settled (R5); a mid-absence tool swap prices each window at its own state and '
      + 'the split settle agrees with the tick fold (R4); both files re-apply byte-identically (S1); one '
      + 'threshold and one payable set (S2).');
    process.exit(0);
  } catch (e) {
    if (e && e.harness) { console.error(`settle-before-mutate: HARNESS — ${e.message}`); process.exit(2); }
    throw e;
  }
}
