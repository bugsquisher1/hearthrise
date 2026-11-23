#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/level-costs.mjs — PER-HERO COSTS BY LEVEL: THE DEATH IN HOURS, THE ONE BLESSING AT THE WAGE, THE TALENT RESET (DARK)
//   (lane/level-costs, backend-architect, 2026-11-22; Tyler 2026-11-22: "per-hero costs read the wage at the hero's LEVEL";
//   1063-level-costs-catalogue.generated.sql, 1063-level-costs.sql; CLAUDE.md §1, §4 both paths).
//
//   node tests/level-costs.mjs            the guard (every arm)
//   node tests/level-costs.mjs --mutate   the proof: each SQL mutant planted in the live body must turn its arm red
//
// mutant-anchors: none — every mutant is planted in a live function body read from the replayed chain (pg_get_functiondef), inside the
//   arm's rolled-back transaction; no tracked file is patched
//
// THE MEASURE: the replayed chain (PGlite), the real engine (tests/hunt-sessions-settle.mjs HARNESS), the real verbs as `authenticated`.
//   LC-RULE     THE DEATH'S RULE (src/core/action-rules.js levelDeathLoss): the lesser of DEATH_XP_LOSS of the total Level XP and DEATH_HOURS
//               of the hours table's Level XP an hour at the hero's Level; the share binds below the CROSSOVER and the hours from it on (read off
//               the data, below: Level 64 since the formula overhaul's hours table, 62 before it) (a death at
//               Level 200 costs 7.5 hours, not the share's 62); never more than the hero holds; never less for more XP at any Level to
//               the last step; a mode's share of 0 takes nothing. The Blessing (src/core/wage.js blessingPrice): free under its Level,
//               then hoursPm of an hour of the wage at the Level. A reset (resetPrice): hoursPm of the wage, x growth a paid reset, null
//               at the day's cap
//   LC-TWINS    THE SERVER IS THE JS: hr_blessing_price at every Level 1 to 400 and the last step, hr_talent_reset_price at sampled
//               Levels for every reset of the day and the first past it, and the settle's death bound hr_death_xp_mode_max never under the
//               engine's price and never a whole XP over it at every Level 1 to 1,000 (the hours rounded up)
//   LC-DEATH    BOTH PATHS, PAST THE CROSSOVER: a Level 200 hero dies with the browser closed (the tick's windows) and with the hunt
//               viewed (the player door at a player's irregular instants); each door debits exactly the engine's price, which is the
//               hours rule and under the share, and the two doors agree
//   LC-BLESSED  THE SAME DEATH, BLESSED: each door keeps floor(loss x the cut / 1000) of it, the death log names the one Blessing and
//               what it kept, the Blessing is used up, and the doors agree
//   LC-BLESS    THE PURCHASE, AS THE CLIENT MAKES IT: a new hero's section is one Blessing at 0 gold and buys it free; a Level 40 hero's
//               section quotes the JS price, a wrong price is quote_changed and moves nothing, the right one moves exactly it (one shop
//               row), a replayed key charges nothing, a second is already_blessed, a tier 2 is unknown_tier, anon cannot buy
//   LC-RESET    THE RESET, DARK: neither the signed-in client nor anon may run hr_talent_reset or its quote; on the server's own path
//               the first is free, the next is the JS price at the hero's Level, a wrong price is quote_changed, the one after costs
//               the JS x growth, Premium's first of the day is free and not counted (the next still at one paid), a replay charges nothing
// Exit: 0 green · 1 a red arm or a missed mutant · 2 a harness problem.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
// TRUE CONCURRENCY: PGlite is one backend; two presses on one key racing on the hero's lock are the house pattern tests/key-under-lock.mjs
// proves on the time blocks (the Blessing and the reset read the key before and under the same lock). A new UTC day is not waited for:
// the day's count reads the ledger's `at`, which the append-only journal will not let a test move.
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { isMain } from './_is-main.mjs';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { goldOf } from './_gold.mjs';

const MUTATE = process.argv.includes('--mutate');
const mod = (f) => import(pathToFileURL(join(ROOT, f)).href);
const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
const AR = await mod('src/core/action-rules.js');
const XP = await mod('src/core/xp.js');
const WG = await mod('src/core/wage.js');
const { DEATH_XP_LOSS, DEATH_HOURS } = await mod('src/data/hunt-sessions.js');
const { BLESSING } = await mod('src/data/blessings.js');
const { TALENT_RESET } = await mod('src/data/talent-reset.js');
const { DANGER } = await mod('src/data/danger.js');
const UID = H.UIDS[0];
const SPAN_MS = 20 * 60000;
const idem = () => crypto.randomUUID();
const { one, q } = H;
const C = XP.charXpForLevel;
const hoursXp = (L) => Math.floor(DEATH_HOURS * AR.levelHourXp(L));
/* THE CROSSOVER: the first Level whose hours undercut the share, READ OFF THE DATA (the hours table and the curve move it: 62 when the
   lane wrote this, 64 after the formula overhaul). LC-RULE holds the rule on both sides of it; it is never typed. */
const CROSSOVER = (() => { for (let L = 2; L <= 4000; L++) { const x = C(L) + 7; if (hoursXp(L) < Math.floor(x * DEATH_XP_LOSS)) return L; } return null; })();

/* As PostgREST calls it: the JWT subject set, `set role authenticated` (or `anon`), inside a savepoint so a refusal by the database
   (a permission) leaves the arm's transaction usable. */
async function as(db, uid, sql, params, role = 'authenticated') {
  await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [uid, JSON.stringify({ sub: uid, role })]);
  await db.query('savepoint lc_as');
  await db.exec('set role ' + role);
  try { const r = (await db.query(sql, params)).rows[0]; await db.exec('reset role'); await db.query('release savepoint lc_as'); return r ? Object.values(r)[0] : undefined; }
  catch (e) { await db.query('rollback to savepoint lc_as'); await db.exec('reset role'); return { thrown: String(e.message).split('\n')[0] }; }
  finally { await db.query("select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true)"); }
}
/* The server's own path (the owner, the JWT subject set): how the Talents lane's opened verb will be reached, and how §4 reaches it. */
async function asOwner(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
  try { return await one(db, sql, params); } finally { await db.query("select set_config('request.jwt.claim.sub', '', true)"); }
}
const purse = (db) => goldOf((sql, p) => db.query(sql, p).then((r) => r.rows), UID, 0);
const setLevel = (db, L) => db.query('update public.player_state set level_xp = $2 where user_id = $1 and slot = 0', [UID, C(L)]);

/* The doomed fixture hero (Level-5 skills, 20 HP, unfed) standing at Level 200, where the hours bind: its Level XP is set after it
   enters, as every fixture sets Level XP (the settle is the only other writer). A Level 200 hero's HP (2,140) regenerates faster than the
   fixture's ghouls hit, so every spawn of the fixture ground is a vault leech (a max hit of 444): it dies in its first fight, on every door. */
const DYING_LEVEL = 200;
const LEECH_ROW = () => {
  const g = H.mixedRow();
  return { ...g, pockets: g.pockets.map((p) => ({ ...p, spawns: p.spawns.map((s) => ({ ...s, monster: 'vault_leech' })) })) };
};
/* Settle the hunt on one door: `closed` the server's tick windows, `viewed` the player door at a player's irregular instants. */
async function door(db, M, kind, from) {
  if (kind === 'closed') return H.run(db, M, from, H.ticksOf(90000, SPAN_MS));
  const cuts = [7001, 33333, 61111, 149999, 300001, 451234, 600000, 777777, 901234, 1033333, 1200000].map((d) => from + d);
  for (const t of cuts) {
    await db.query('delete from public.hr_rate_counters');
    const v = await M.HS.settleHunt({ exec: H.makeExec(db), user: UID, slot: 0, mode: 'settle', bucket: null, project: false, grounds: H.groundsOf(M), atMs: t, minWindowMs: 0 });
    if (v && v.body && v.body.error === 'no_hunt') return v;
    if (!v || v.status !== 200 || !v.body || v.body.ok !== true) throw new Error('the player-door settle answered ' + JSON.stringify(v && v.body).slice(0, 300));
  }
  return null;
}
/* One death on both doors (rolled back between), each read as the settle wrote it. */
async function deathOnBothDoors(db, M, blessed) {
  const h = await H.hunter(db, M, { ...H.DOOMED, row: LEECH_ROW });
  await db.query('update public.player_state set level_xp = $2 where user_id = $1 and slot = 0', [UID, C(DYING_LEVEL) + 800]);
  if (blessed) await db.query("insert into public.player_blessings (user_id, slot, tier, paid, bought_at) values ($1, 0, 1, 0, now() - interval '2 days')", [UID]);
  const read = async () => {
    const s = await H.snapshot(db, h.sid, UID);
    s.death_log = await one(db, 'select public.hr_death_log_view($1::uuid, 0)', [UID]);
    s.held = Number(await one(db, 'select count(*) from public.player_blessings where user_id = $1 and slot = 0', [UID]));
    return s;
  };
  await db.query('savepoint lc_doors');
  await door(db, M, 'closed', h.from);
  const a = await read();
  await db.query('rollback to savepoint lc_doors');
  await door(db, M, 'viewed', h.from);
  const b = await read();
  return { a, b };
}
function deathReading(name, s, blessed, p) {
  const death = (s.events || []).filter((e) => e[0] === 'death');
  if (death.length !== 1) { p.push(`CONTROL (${name}): the hero died ${death.length} time(s) (ended ${s.session && s.session.end_reason})`); return null; }
  const paid = Number((s.death_xp || {}).level || 0);
  const kept = Number((((s.death_log || [])[0] || {}).saved || {}).level || 0);
  const before = Number(s.level_xp) + paid;
  const loss = paid + kept;
  const L = XP.charLevelFromXp(before);
  if (!CROSSOVER || L < CROSSOVER) p.push(`CONTROL (${name}): the hero died at Level ${L}, under the crossover (${CROSSOVER})`);
  if (loss !== AR.levelDeathLoss(before)) p.push(`${name}: the death took ${loss} Level XP of ${before}, the engine's rule says ${AR.levelDeathLoss(before)}`);
  if (loss !== hoursXp(L) || !(loss < Math.floor(before * DEATH_XP_LOSS))) {
    p.push(`${name}: the death took ${loss}, not DEATH_HOURS of Level ${L} (${hoursXp(L)}) under the share (${Math.floor(before * DEATH_XP_LOSS)})`); }
  if (blessed) {
    if (kept !== Math.floor(loss * BLESSING.cutPm / 1000)) p.push(`${name}: the Blessing kept ${kept} of ${loss}, not floor(${loss} x ${BLESSING.cutPm} / 1000)`);
    if (((s.death_log || [])[0] || {}).blessings !== 1) p.push(`${name}: the death log names ${((s.death_log || [])[0] || {}).blessings} Blessing(s) used, one was held`);
    if (s.held !== 0) p.push(`${name}: the Blessing is still held after the death`);
  } else if (kept !== 0) p.push(`${name}: an unblessed death kept ${kept}`);
  return { paid, before };
}

const ARMS = {
  'LC-RULE': async () => {
    const p = [];
    const lv = AR.levelDeathLoss;
    if (!(CROSSOVER > 31 && CROSSOVER < 200)) { p.push(`CONTROL: the crossover is Level ${CROSSOVER}, not between 31 and 200 (LC-DEATH dies at 200, past it)`); return p; }
    for (const L of [10, 30, CROSSOVER - 2, CROSSOVER - 1]) {
      const x = C(L) + 7;
      if (lv(x) !== Math.floor(x * DEATH_XP_LOSS)) p.push(`a Level ${L} death costs ${lv(x)}, not the share ${Math.floor(x * DEATH_XP_LOSS)}`);
    }
    for (const L of [CROSSOVER, CROSSOVER + 8, 200, 1000, 4000]) {
      const x = C(L) + 7;
      if (lv(x) !== hoursXp(L)) p.push(`a Level ${L} death costs ${lv(x)}, not DEATH_HOURS of its Level (${hoursXp(L)})`);
      if (!(hoursXp(L) < Math.floor(x * DEATH_XP_LOSS))) p.push(`CONTROL: at Level ${L} the hours (${hoursXp(L)}) do not undercut the share`);
    }
    for (const x of [0, 1, 50, C(2), C(5) + 3]) if (lv(x) > x || lv(x) < 0) p.push(`a death takes ${lv(x)} of ${x} XP`);
    if (lv(C(200), 0) !== 0 || Object.keys(AR.deathXpLoss({ levelXp: C(200), skills: {} }, 0)).length) p.push('a mode that prices nothing takes something');
    let falls = 0;
    for (let L = 2; L <= DANGER.stepMax && falls < 3; L++) { const x = C(L); if (Number.isSafeInteger(x) && lv(x) < lv(x - 1)) { falls++; p.push(`a death costs less at Level ${L}'s first XP than one XP short of it`); } }
    for (const L of [1, 29]) if (WG.blessingPrice(L) !== 0) p.push(`the Blessing costs ${WG.blessingPrice(L)} at Level ${L}, under its free Level`);
    for (const L of [30, 60, 400]) {
      const want = Math.ceil((BLESSING.hoursPm / 1000) * WG.wage(L) - 1e-9);
      if (WG.blessingPrice(L) !== want) p.push(`the Blessing costs ${WG.blessingPrice(L)} at Level ${L}, not ${BLESSING.hoursPm / 1000} h of the wage (${want})`);
    }
    if (!(WG.blessingPrice(400) > WG.blessingPrice(60))) p.push('the Blessing does not grow with Level');
    const r0 = WG.resetPrice(60, 0), r1 = WG.resetPrice(60, 1);
    if (r0 !== Math.ceil((TALENT_RESET.hoursPm / 1000) * WG.wage(60) - 1e-9)) p.push(`the first paid reset at Level 60 costs ${r0}, not ${TALENT_RESET.hoursPm / 1000} h of the wage`);
    if (Math.abs(r1 - (r0 * TALENT_RESET.growthNum) / TALENT_RESET.growthDen) > 1) p.push(`the second paid reset costs ${r1}, not x${TALENT_RESET.growthNum / TALENT_RESET.growthDen} of ${r0}`);
    if (WG.resetPrice(60, TALENT_RESET.perDay) !== null || WG.resetPrice(60, TALENT_RESET.perDay - 1) === null) p.push('the reset\'s day cap is not where TALENT_RESET.perDay says');
    return p;
  },
  'LC-TWINS': async (db) => {
    const p = [];
    const bless = await q(db, 'select l, public.hr_blessing_price(1, l)::text as v from generate_series(1, 400) l union all select $1::int, public.hr_blessing_price(1, $1)::text', [DANGER.stepMax]);
    let bad = 0;
    for (const r of bless) if (Number(r.v) !== WG.blessingPrice(r.l) && bad++ < 3) p.push(`the Blessing at Level ${r.l} costs ${r.v} on the server, ${WG.blessingPrice(r.l)} in src/core/wage.js`);
    if (await one(db, 'select public.hr_blessing_price(2, 60)') !== null) p.push('the server prices a second Blessing tier');
    for (const L of [1, 30, 60, 200, 1000, DANGER.stepMax]) for (let n = 0; n <= TALENT_RESET.perDay; n++) {
      const s = await one(db, 'select public.hr_talent_reset_price($1, $2)::text', [L, n]);
      const js = WG.resetPrice(L, n);
      if ((s === null ? null : Number(s)) !== js && bad++ < 6) p.push(`paid reset ${n + 1} at Level ${L} costs ${s} on the server, ${js} in src/core/wage.js`);
    }
    const bounds = await q(db, `select l, public.hr_death_xp_mode_max('level', public.hr_char_xp_for_level(l) + 3, 1000)::text as v
                                  from generate_series(1, 1000) l`);
    for (const r of bounds) {
      const js = AR.levelDeathLoss(C(r.l) + 3);
      if ((Number(r.v) < js || Number(r.v) > js + 1) && bad++ < 9) p.push(`the settle's bound on a Level ${r.l} death is ${r.v}, the engine prices ${js}`);
    }
    /* FAIL CLOSED: with no catalogue row the hours cannot be priced; the bound is 0 (the settle refuses every death XP), never null */
    await db.query('savepoint lc_closed');
    await db.query('delete from public.hr_level_costs');
    const closed = await one(db, "select public.hr_death_xp_mode_max('level', public.hr_char_xp_for_level(200), 1000)::text");
    await db.query('rollback to savepoint lc_closed');
    if (closed !== '0') p.push(`with no hr_level_costs row the bound on a Level 200 death is ${closed}, not 0 (it must fail closed)`);
    return p;
  },
  'LC-DEATH': async (db, M) => {
    const p = [];
    const { a, b } = await deathOnBothDoors(db, M, false);
    const ra = deathReading('the browser closed', a, false, p), rb = deathReading('the hunt viewed', b, false, p);
    if (ra && rb && JSON.stringify([a.level_xp, a.death_xp]) !== JSON.stringify([b.level_xp, b.death_xp])) {
      p.push(`the two doors disagree: ${JSON.stringify([a.level_xp, a.death_xp])} closed, ${JSON.stringify([b.level_xp, b.death_xp])} viewed`); }
    return p;
  },
  'LC-BLESSED': async (db, M) => {
    const p = [];
    const { a, b } = await deathOnBothDoors(db, M, true);
    const ra = deathReading('the browser closed', a, true, p), rb = deathReading('the hunt viewed', b, true, p);
    if (ra && rb && JSON.stringify([a.level_xp, a.death_xp]) !== JSON.stringify([b.level_xp, b.death_xp])) {
      p.push(`the two doors disagree: ${JSON.stringify([a.level_xp, a.death_xp])} closed, ${JSON.stringify([b.level_xp, b.death_xp])} viewed`); }
    return p;
  },
  'LC-BLESS': async (db, M) => {
    const p = [];
    await H.character(db, M, UID, { level: 1, gold: 0, inv: {} });
    const buy = async (tier, price, key = idem()) => {
      await db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);
      return as(db, UID, 'select public.hr_blessing_buy(0, $1, $2::bigint, $3::uuid) as r', [tier, price, key]);
    };
    const sec = await one(db, 'select public.hr_state_of($1, 0)', [UID]).then((e) => e && e.blessings);
    if (!sec || sec.price !== 0 || sec.cut !== BLESSING.cutPm || !Array.isArray(sec.tiers) || sec.tiers.length !== 1 || sec.tiers[0].held) p.push('a new hero\'s Blessing section reads ' + JSON.stringify(sec));
    let r = await buy(1, 0);
    if (!r || r.ok !== true) p.push('a free Blessing was refused: ' + JSON.stringify(r));
    r = await buy(1, 0);
    if (!r || r.error !== 'already_blessed') p.push('a second Blessing answered ' + JSON.stringify(r));
    await db.query('delete from public.player_blessings where user_id = $1', [UID]);
    await setLevel(db, 40);
    const price = WG.blessingPrice(40);
    const env = await one(db, 'select public.hr_state_of($1, 0)', [UID]);
    if (!env || !env.blessings || env.blessings.price !== price || env.blessings.tiers[0].price !== price) p.push(`a Level 40 hero's section quotes ${JSON.stringify(env && env.blessings)}, the JS ${price}`);
    await db.query('update public.account_wallet set gold = $2 where user_id = $1', [UID, price + 11]);
    r = await buy(1, price - 1);
    if (!r || r.error !== 'quote_changed' || await purse(db) !== price + 11) p.push('a wrong price answered ' + JSON.stringify(r));
    r = await buy(2, price);
    if (!r || r.error !== 'unknown_tier') p.push('a second tier answered ' + JSON.stringify(r));
    const key = idem();
    r = await buy(1, price, key);
    if (!r || r.ok !== true || await purse(db) !== 11) p.push(`the Blessing at ${price} answered ${JSON.stringify(r)} and left ${await purse(db)}`);
    r = await buy(1, price, key);
    const rows = Number(await one(db, "select count(*) from public.player_ledger where user_id = $1 and kind = 'shop' and intent = 'blessing_buy:1' and gold = $2", [UID, -price]));
    if (await purse(db) !== 11 || rows !== 1) p.push(`a replayed key left ${await purse(db)} gold and ${rows} shop rows`);
    const anon = await as(db, UID, 'select public.hr_blessing_buy(0, 1, 0::bigint, $1::uuid) as r', [idem()], 'anon');
    if (!anon || !anon.thrown || !/permission denied/.test(anon.thrown)) p.push('anon reached hr_blessing_buy: ' + JSON.stringify(anon).slice(0, 160));
    return p;
  },
  'LC-RESET': async (db, M) => {
    const p = [];
    await H.character(db, M, UID, { level: 60, gold: 0, inv: {} });
    await setLevel(db, 60);
    await db.query("update public.hr_flags set enabled = false where key = 'beta_premium'");
    await db.query('update public.player_state set premium_until = null where user_id = $1 and slot = 0', [UID]);
    for (const role of ['authenticated', 'anon']) {
      const r = await as(db, UID, 'select public.hr_talent_reset(0, 0::bigint, $1::uuid) as r', [idem()], role);
      if (!r || !r.thrown || !/permission denied/.test(r.thrown)) p.push(`${role} reached the dark hr_talent_reset: ${JSON.stringify(r).slice(0, 160)}`);
      const qr = await as(db, UID, 'select public.hr_talent_reset_quote($1::uuid, 0) as r', [UID], role);
      if (!qr || !qr.thrown || !/permission denied/.test(qr.thrown)) p.push(`${role} reached the reset's quote: ${JSON.stringify(qr).slice(0, 160)}`);
    }
    const reset = async (price, key = idem()) => {
      await db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);
      return asOwner(db, UID, 'select public.hr_talent_reset(0, $1::bigint, $2::uuid)', [price, key]);
    };
    let r = await reset(0);
    if (!r || r.ok !== true || r.free !== 'first') p.push('the first reset answered ' + JSON.stringify(r));
    const r0 = WG.resetPrice(60, 0), r1 = WG.resetPrice(60, 1);
    if (!r || !r.talent_reset || r.talent_reset.price !== r0) p.push(`after the free first the quote is ${JSON.stringify(r && r.talent_reset)}, the JS ${r0}`);
    r = await reset(r0 + 1);
    if (!r || r.error !== 'quote_changed') p.push('a wrong price answered ' + JSON.stringify(r));
    await db.query('update public.account_wallet set gold = $2 where user_id = $1', [UID, r0 + r1]);
    const key = idem();
    r = await reset(r0, key);
    if (!r || r.ok !== true || await purse(db) !== r1) p.push(`the paid reset answered ${JSON.stringify(r)} and left ${await purse(db)}`);
    r = await reset(r0, key);
    if (await purse(db) !== r1) p.push('a replayed paid reset charged again');
    await db.query("update public.hr_flags set enabled = true where key = 'beta_premium'");
    r = await reset(0);
    if (!r || r.ok !== true || r.free !== 'premium') p.push('Premium\'s first of the day answered ' + JSON.stringify(r));
    if (!r || !r.talent_reset || r.talent_reset.price !== r1 || r.talent_reset.paid_today !== 1) p.push(`after Premium's free one the quote is ${JSON.stringify(r && r.talent_reset)}, the JS ${r1} at one paid`);
    r = await reset(r1);
    if (!r || r.ok !== true || await purse(db) !== 0) p.push(`the second paid reset answered ${JSON.stringify(r)} and left ${await purse(db)}`);
    const n = Number(await one(db, 'select resets from public.player_talent_resets where user_id = $1 and slot = 0', [UID]));
    if (n !== 4) p.push(`the hero's reset count reads ${n}, four were made`);
    await db.query("update public.hr_flags set enabled = false where key = 'beta_premium'");
    return p;
  },
};

async function runArms(db, M, only) {
  const out = {};
  for (const name of Object.keys(ARMS)) {
    if (only && !only.includes(name)) continue;
    /* the pinned uuid sequence (H.pinDice) is not rolled back with an arm: rewind it, so every arm's hunt rolls the same dice */
    await db.query("select setval('public.hr_test_uuid_seq', 1000, false)");
    try { out[name] = await H.inTx(db, () => ARMS[name](db, M)); } catch (e) { out[name] = ['threw: ' + String(e && e.message).slice(0, 400)]; }
  }
  return out;
}

/* SQL MUTANTS, planted in the live body (each anchor found exactly once), and the arm that must go red. */
const MUTANTS = [
  { arm: 'LC-TWINS', name: 'the settle\'s bound drops the hours (a Level 200 death may take the whole share)', fn: 'public.hr_death_xp_mode_max(text,bigint,integer)',
    find: 'return least(floor(v_x::numeric * v_rate * p_mode_pm / 1000000)::bigint, v_h);', repl: 'return floor(v_x::numeric * v_rate * p_mode_pm / 1000000)::bigint;' },
  { arm: 'LC-TWINS', name: 'the hours read at Level 1, not the hero\'s', fn: 'public.hr_death_xp_mode_max(text,bigint,integer)',
    find: 'v_h := public.hr_death_hours_xp(public.hr_char_level(v_x), p_mode_pm);', repl: 'v_h := public.hr_death_hours_xp(1, p_mode_pm);' },
  { arm: 'LC-TWINS', name: 'the bound fails open with no catalogue row (null never refuses)', fn: 'public.hr_death_xp_mode_max(text,bigint,integer)',
    find: 'if v_h is null then return 0; end if;', repl: 'if v_h is null then return null; end if;' },
  { arm: 'LC-TWINS', name: 'the Blessing priced at the Level 1 wage', fn: 'public.hr_blessing_price(integer,integer)',
    find: 'public.hr_wage(v_l)', repl: 'public.hr_wage(1)' },
  { arm: 'LC-TWINS', name: 'every paid reset of the day at the first one\'s price', fn: 'public.hr_talent_reset_price(integer,integer)',
    find: '* power(c.reset_growth_num::numeric, p_paid);', repl: ';' },
  { arm: 'LC-BLESSED', name: 'the take cuts a quarter, not the row\'s cut', fn: 'public.hr_blessing_take(uuid,integer,uuid,jsonb,timestamp with time zone)',
    find: 'select c.bless_cut_pm into v_pm from public.hr_level_costs c where c.id;', repl: 'v_pm := 250;' },
  { arm: 'LC-BLESSED', name: 'the Blessing is never used up', fn: 'public.hr_blessing_take(uuid,integer,uuid,jsonb,timestamp with time zone)',
    find: 'delete from public.player_blessings where user_id = p_user and slot = p_slot and tier = any (v_tiers);', repl: 'perform 1;' },
  { arm: 'LC-BLESS', name: 'the price check dropped (the client\'s number is charged)', fn: 'public.hr_blessing_buy(integer,integer,bigint,uuid)',
    find: 'if v_price is distinct from p_price then', repl: 'if false then' },
  { arm: 'LC-BLESS', name: 'a second Blessing on top of the first', fn: 'public.hr_blessing_buy(integer,integer,bigint,uuid)',
    find: "if exists (select 1 from public.player_blessings b where b.user_id = v_uid and b.slot = p_slot) then", repl: 'if false then' },
  { arm: 'LC-RESET', name: 'no first free reset', fn: 'public.hr_talent_reset_quote(uuid,integer)',
    find: "v_free := case when v_ever = 0 then 'first'", repl: "v_free := case when false then 'first'" },
  { arm: 'LC-RESET', name: 'Premium\'s free reset every time (not once a day)', fn: 'public.hr_talent_reset_quote(uuid,integer)',
    find: 'and not v_prem_used then', repl: 'then' },
  { arm: 'LC-RESET', name: 'a press at a stale price is charged the server\'s new one (no quote_changed)', fn: 'public.hr_talent_reset(integer,bigint,uuid)',
    find: 'if v_price <> p_price then', repl: 'if false then' },
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
    for (const m of MUTANTS) {
      const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).replace(/\r/g, '');
      if (def.split(m.find).length !== 2) { console.error('✗ mutant "' + m.name + '": its anchor is not found exactly once in ' + m.fn); bad++; continue; }
      await db.exec(def.replace(m.find, () => m.repl));
      try {
        const first = ((await runArms(db, M, [m.arm]))[m.arm] || [])[0];
        if (!first) { console.error('✗ ' + m.arm + ' stayed GREEN on: ' + m.name); bad++; }
        else if (/^threw|^harness/.test(first)) { console.error('✗ harness: ' + m.arm + ' broke on: ' + m.name + ' (' + first.slice(0, 200) + ')'); bad++; }
        else console.log('✓ ' + m.arm + ' goes red on: ' + m.name + '  (' + first.slice(0, 110) + ')');
      } finally { await db.exec(def); }
    }
    console.log(bad ? 'level-costs --mutate: ' + bad + ' failure(s)' : 'level-costs --mutate: all ' + MUTANTS.length + ' mutants killed');
    process.exit(bad ? 1 : 0);
  }
  /* --arms=LC-DEATH,LC-BLESSED: a subset while editing (the guard's run is every arm) */
  const only = (process.argv.find((a) => a.startsWith('--arms=')) || '').slice(7).split(',').filter(Boolean);
  const res = await runArms(db, M, only.length ? only : undefined);
  let red = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems.length) { red++; for (const pr of problems) console.error('✗ ' + name + ': ' + pr); }
    else console.log('✓ ' + name);
  }
  console.log(red ? 'level-costs: ' + red + ' arm(s) red' : 'level-costs: all ' + Object.keys(res).length + ' arms green');
  process.exit(red ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
