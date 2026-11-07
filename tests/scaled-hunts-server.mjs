#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/scaled-hunts-server.mjs — THE SERVER HALF OF SCALED HUNTS (lane/c-scaled-hunts; Tyler 2026-11-07 "an option to 'scale' early
// game hunts up with gold", "party would scale to the leader", "make it a per hour slider", "up to 24 hours", "the time only ticks
// down while in the spawn"; supabase/migrations/2027-03-21-scaled-hunts*.sql, src/core/combat-sim.js huntPlayOf,
// supabase/functions/hr-accrue/hunt-settle.js scalePlanOf). The designer's own guard (what a scaled ground pays) is tests/scaled-hunts.mjs;
// the browser's prediction of a scaled hunt is tests/hunt-live.mjs LV-SCALE.
//
//   node tests/scaled-hunts-server.mjs            the guard
//   node tests/scaled-hunts-server.mjs --mutate   every planted defect must turn its arm red
//
// ARMS (no database)
//   SH-PLAY    huntPlayOf: no scale, a Level the ground's band still holds, past the top Level, or an unscalable ground plays the
//              catalogue; a scale plays scaledMonsters' rows (the rest of the catalogue untouched), scaledTierRow's tiers, and a pick
//              the scaled ground doesn't offer (Deadly) plays Normal with its pull
//   SH-PLAN    scalePlanOf: the window plays the read's Level only if this engine's data plays it; it stops where the banked swings end;
//              a stored world of another Level restarts; a read with no scale (a database before the file) is unscaled
// ARMS (the real replayed chain, PGlite, as hr_engine; the real Mill Cellar)
//   SH-CAT     the server's three catalogues are tools/gen-scaled-hunts.mjs catalogueOf(the data), row for row
//   SH-BUY     a purchase is the server's price (40 x the scaled Level x hours) from the account purse with ONE shop ledger row, the
//              bank holds it and the switch is on; a replay charges nothing; a wrong price, hours outside 1-24, a ground that never
//              scales, a ground the hero still fits, past the bank (24 h), past the day (48 h, every ground) and a short purse are refused
//              with nothing moved
//   SH-CLOSED  BROWSER CLOSED: a Level 20 hero with hours banked hunts the Cellar six minutes on the tick's slices: every window
//              commits, the instance records Level 20, the bank loses exactly the world swings x the swing, and a kill pays well over
//              what the unscaled Cellar pays (the hero with the switch off, same dice)
//   SH-VIEWED  HUNT VIEWED: the same hunt settled at the player door's 16 s cadence lands the same bank, Level XP, gold and world
//   SH-OUT     the hours run out mid-hunt: the window stops where the bank ends (spent to 0, never past), the next settle restarts the
//              world on the ground's own rows, and the hunt goes on to the end of the span
//   SH-SWITCH  the switch off mid-hunt: the next window plays unscaled and spends nothing
//   SH-PARTY   a party scales to its LEADER: the leader's bank pays one hour per hour whatever the party's size, the member's isn't
//              touched; when the leader changes to a hero with no hours, the next window is the ground's own
//   SH-FORGE   the commit re-proves the claim (a Level 50 leader): another Level (scale_moved), a claim with the switch off (scale_moved),
//              more swings than the bank holds (scale_over); a scaled window that claims nothing is refused by the ground's own value bound
//              (value_over), and the honest window lands only because its bound reads the scaled roster's
// ════════════════════════════════════════════════════════════════════════
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
const S = await import(u('src/data/scaled-hunts.js') + V);
const CS = await import(u('src/core/combat-sim.js') + V);
const T = await import(u('src/data/hunt-tiers.js') + V);
const { MONSTERS } = await import(u('src/data/monsters.js') + V);
const GEN = await import(u('tools/gen-scaled-hunts.mjs'));
const HOUR = 3600000, SWING = 2000;
const ARMS = ['SH-PLAY', 'SH-PLAN', 'SH-CAT', 'SH-BUY', 'SH-CLOSED', 'SH-VIEWED', 'SH-OUT', 'SH-SWITCH', 'SH-PARTY', 'SH-FORGE'];

// ═══════════════════════════════════════════════════════════════════════
// ENGINE ARMS
// ═══════════════════════════════════════════════════════════════════════
function shPlay(CSx) {
  const bad = [];
  const plain = CSx.huntPlayOf('mill_cellar', null);
  if (plain.level !== null || plain.monsters !== null || plain.tierOf('normal') !== T.tierRowOf('mill_cellar', 'normal')) bad.push('no scale does not play the catalogue');
  for (const [g, L, why] of [['mill_cellar', 8, 'a Level the band still holds'], ['mill_cellar', 60, 'past the top Level'], ['coppercap_warrens', 50, 'the top ground']]) {
    if (CSx.huntPlayOf(g, { level: L }).level !== null) bad.push(g + ' at ' + L + ' plays scaled (' + why + ')');
  }
  const p = CSx.huntPlayOf('mill_cellar', { level: 20 });
  const want = S.scaledMonsters(MONSTERS, 'mill_cellar', 20);
  if (p.level !== 20 || !p.monsters) bad.push('the Cellar at 20 does not play scaled');
  else {
    for (const [id, r] of Object.entries(want)) if (JSON.stringify(p.monsters[id]) !== JSON.stringify(r)) bad.push(id + ' is not scaledRow\'s at 20');
    for (const id of ['grayjaw', 'drain_rat', 'goblin_sluicer']) if (p.monsters[id] !== MONSTERS[id]) bad.push(id + ' (not on the Cellar\'s roster) moved');
    if (Object.keys(p.monsters).length !== Object.keys(MONSTERS).length) bad.push('the scaled table lost or gained a monster');
  }
  const g = CSx.huntPlayOf('mosslight_glade', { level: 41 });
  if (JSON.stringify(g.tierOf('dangerous')) !== JSON.stringify(S.scaledTierRow('mosslight_glade', 'dangerous', 41)) || g.normalOf('dangerous')) bad.push('a scaled Dangerous is not the sheet\'s at the scaled floor');
  if (!g.normalOf('deadly') || JSON.stringify(g.tierOf('deadly')) !== JSON.stringify(T.tierRowOf('mosslight_glade', 'normal'))) bad.push('a scaled Deadly does not play Normal');
  if (g.normalOf('normal')) bad.push('Normal is played as a pick the ground lacks');
  return bad;
}

function shPlan(HS) {
  const bad = [];
  const where = { ground: { id: 'mill_cellar' } };
  const inst = (o) => ({ settled_to_ms: 1e12, next_swing_at_ms: 1e12, world: '{"w":1}', scale_level: null, ...o });
  const a = HS.scalePlanOf(inst({ scale: { level: 20, banked_ms: 10 * SWING + 1500 } }), where);
  if (a.level !== 20 || a.capMs !== 1e12 + 10 * SWING || a.restart !== true) bad.push('a scaled read plans ' + JSON.stringify(a) + ' (want Level 20, ten swings, a restart from an unscaled world)');
  const b = HS.scalePlanOf(inst({ scale: { level: 20, banked_ms: 3 * HOUR }, scale_level: 20 }), where);
  if (b.level !== 20 || b.restart !== false) bad.push('a world built at the same Level restarts: ' + JSON.stringify(b));
  const c = HS.scalePlanOf(inst({ scale_level: 20 }), where);
  if (c.level !== null || c.restart !== true || c.capMs !== Infinity) bad.push('the end of the hours plans ' + JSON.stringify(c) + ' (want the ground\'s own, restarted, uncapped)');
  const d = HS.scalePlanOf(inst({}), where);
  if (d.level !== null || d.restart !== false || d.capMs !== Infinity) bad.push('a read with no scale (a database before the file) plans ' + JSON.stringify(d));
  const e = HS.scalePlanOf(inst({ scale: { level: 20, banked_ms: 1999 } }), where);
  if (e.level !== null) bad.push('less than one swing banked plays scaled');
  const f = HS.scalePlanOf(inst({ scale: { level: 60, banked_ms: HOUR } }), where);
  if (f.level !== null) bad.push('a Level this engine\'s data can\'t play (60) plays scaled');
  return bad;
}

// ═══════════════════════════════════════════════════════════════════════
// DATABASE ARMS
// ═══════════════════════════════════════════════════════════════════════
const { one, q, inTx, makeExec, UIDS } = H;
const UID = UIDS[0];
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
const key = () => crypto.randomUUID();
const priceOf = async (db, uid, hunt) => Number((await one(db, 'select public.hr_scaled_hunts_view($1::uuid, 0) as v', [uid])).grounds[hunt].price);
async function buy(db, uid, hunt, hours, o = {}) {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  await asUser(db, uid);
  const price = o.price != null ? o.price : (await priceOf(db, uid, hunt)) * hours;
  const r = await one(db, 'select public.hr_scaled_hunt_buy(0, $1, $2, $3, $4::uuid) as r', [hunt, hours, price, o.key || key()]);
  await asUser(db, '');
  return r;
}
async function switchOf(db, uid, hunt, on) {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  await asUser(db, uid);
  const r = await one(db, 'select public.hr_scaled_hunt_switch(0, $1, $2, $3::uuid) as r', [hunt, on, key()]);
  await asUser(db, '');
  return r;
}
const bankOf = async (db, uid, hunt = 'mill_cellar') => Number(await one(db,
  'select coalesce((select banked_ms from public.player_scaled_hours where user_id = $1 and slot = 0 and hunt_id = $2), 0)::text', [uid, hunt]));
const purseOf = async (db, uid) => Number(await one(db, 'select public.hr_purse_of($1::uuid)::text', [uid]));
const instOf = async (db, inst) => (await q(db, 'select scale_level, world_swing::int as sw, world, settled_to from public.hunt_instances where id = $1', [inst]))[0];
const statOf = async (db, uid) => (await q(db, `select ps.level_xp::text as lx,
    coalesce((select sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::int else 0 end) from public.player_ledger l
               where l.user_id = $1 and l.slot = 0 and l.kind = 'combat'), 0)::int as kills
    from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [uid]))[0];

/* A Level 20 hero on the real Cellar, `minutesAgo` back, with `hours` banked there (bought through the verb, before it enters). */
const HERO = { level: 20, inv: { cooked_shrimp: 60 }, bag: [{ item: 'cooked_shrimp', qty: 50 }], gold: 1000000, realGround: true };
async function scaledHunter(db, M, o = {}) {
  return H.hunter(db, M, { ...HERO, level: o.level || HERO.level, minutesAgo: o.minutesAgo || 8, ...(o.party ? { party: o.party.map((p) => ({ ...HERO, ...p })) } : {}),
    beforeEnter: async () => {
      for (const [uid, hunt, hours] of o.buys || []) {
        const r = await buy(db, uid, hunt, hours);
        if (!r || r.ok !== true) throw new Error('harness: the purchase refused: ' + JSON.stringify(r));
      }
      if (o.off) for (const uid of o.off) { const r = await switchOf(db, uid, 'mill_cellar', false); if (!r || r.ok !== true) throw new Error('harness: switch ' + JSON.stringify(r)); }
    } });
}
/* Settle the instance at each cut, the tick's door (2-min slices past a cut's backlog). Answers each landed commit's scale claim. */
async function cutsTo(db, M, cuts, o = {}) {
  const claims = [];
  for (const t of cuts) {
    const r = await H.settleTo(db, M, t, { user: o.user || UID });
    if (r && r.commit) claims.push(r.commit.settle.scale ? r.commit.settle.scale.level : null);
    if (r && r.skipped === 'no_hunt') break;
  }
  return claims;
}
const every = (from, step, span) => Array.from({ length: Math.ceil(span / step) }, (_, i) => Math.min(from + (i + 1) * step, from + span));

const DB_ARMS = {
  'SH-CAT': async (db, M) => {
    const bad = [];
    /* the generator and the data of the tree under test (a mutant's copy, or the real one) */
    const at = (p) => import(pathToFileURL(join(M.root, p)).href);
    const D = { S: await at('src/data/scaled-hunts.js'), MONSTERS: (await at('src/data/monsters.js')).MONSTERS,
      OPEN_GROUNDS: (await at('src/data/hunt-grounds.js')).OPEN_GROUNDS, HUNT_INDEX: (await at('src/data/hunts.js')).HUNT_INDEX,
      ROSTER: (await at('src/data/balance-sheet.js')).GROUND_ROSTER, COMBAT_XP: (await at('src/data/core-model.js')).COMBAT_XP,
      headroom: (await at('src/data/hunt-sessions.js')).VALUE_HEADROOM };
    const c = (await at('tools/gen-scaled-hunts.mjs')).catalogueOf(D);
    const r = (await q(db, 'select * from public.hr_scaled_hunt_rule'))[0];
    if (!r || r.min_hours !== c.rule.min || r.max_hours !== c.rule.max || r.bank_max_hours !== c.rule.bank || r.day_max_hours !== c.rule.day
        || r.top_level !== c.rule.top || r.price_per_level !== c.rule.perLevel) bad.push('the rule row is ' + JSON.stringify(r));
    const gs = await q(db, 'select hunt_id, floor, top from public.hr_scaled_grounds order by hunt_id');
    if (JSON.stringify(gs.map((g) => [g.hunt_id, g.floor, g.top])) !== JSON.stringify(c.grounds.map((g) => [g.hunt, g.floor, g.top]))) bad.push('the grounds are ' + JSON.stringify(gs));
    const bs = await q(db, 'select hunt_id, level, gold_max::int g, xp_max::int x, level_max l from public.hr_scaled_kill_bounds order by hunt_id, level');
    const want = c.bounds.map((b) => [b.hunt, b.level, b.gold, b.xp, b.levelMax].join(',')), have = bs.map((b) => [b.hunt_id, b.level, b.g, b.x, b.l].join(','));
    if (want.join(';') !== have.join(';')) bad.push('the kill bounds differ from the data at ' + (want.findIndex((w, i) => w !== have[i])) + ' (' + bs.length + ' rows, want ' + want.length + ')');
    return bad;
  },

  'SH-BUY': async (db, M) => {
    const bad = [];
    await H.character(db, M, UID, { level: 20, gold: 1000000, inv: {} });
    const price = await priceOf(db, UID, 'mill_cellar');
    if (price !== 40 * 20) bad.push('an hour of the Cellar at Level 20 costs ' + price + ', want 800');
    const g0 = await purseOf(db, UID);
    const k = key();
    const r = await buy(db, UID, 'mill_cellar', 6, { key: k });
    const led = await q(db, `select gold::text g, meta from public.player_ledger where user_id = $1 and kind = 'shop' and intent like 'scaled\\_hunt\\_buy:%'`, [UID]);
    if (!r || r.ok !== true || await purseOf(db, UID) !== g0 - 4800 || led.length !== 1 || Number(led[0].g) !== -4800 || led[0].meta.hours !== 6 || led[0].meta.level !== 20)
      bad.push('six hours answered ' + JSON.stringify(r) + ' with ledger ' + JSON.stringify(led) + ' and purse ' + (await purseOf(db, UID)));
    if (await bankOf(db, UID) !== 6 * HOUR) bad.push('the bank holds ' + (await bankOf(db, UID)) + ' ms after six hours');
    const again = await buy(db, UID, 'mill_cellar', 6, { key: k });
    if (await purseOf(db, UID) !== g0 - 4800 || await bankOf(db, UID) !== 6 * HOUR) bad.push('a replay of the key charged again: ' + JSON.stringify(again));
    const refusals = [
      [['mill_cellar', 6, { price: 4801 }], 'quote_changed'], [['mill_cellar', 25, { price: 800 * 25 }], 'bad_hours'],
      [['mill_cellar', 0, { price: 800 }], 'bad_hours'], [['coppercap_warrens', 1, { price: 800 }], 'not_scalable'],
      [['millrace_sewer', 1, { price: 1040 }], 'scale_level'], [['mill_cellar', 19, {}], 'scaled_bank_full'],
    ];
    for (const [[hunt, hours, o], want] of refusals) {
      const x = await buy(db, UID, hunt, hours, o);
      if (!x || x.error !== want) bad.push(hunt + ' x' + hours + ' answered ' + JSON.stringify(x) + ', want ' + want);
    }
    for (const [hunt, hours] of [['mill_cellar', 18], ['meadowbrook_thicket', 24]]) {
      const x = await buy(db, UID, hunt, hours);
      if (!x || x.ok !== true) bad.push(hunt + ' x' + hours + ' (inside the day) answered ' + JSON.stringify(x));
    }
    const day = await buy(db, UID, 'wickstead', 1);
    if (!day || day.error !== 'scaled_day_limit') bad.push('a 49th hour in a day answered ' + JSON.stringify(day));
    await H.character(db, M, UIDS[1], { level: 20, gold: 10, inv: {} });
    const poor = await buy(db, UIDS[1], 'mill_cellar', 1);
    if (!poor || poor.error !== 'insufficient_gold' || await bankOf(db, UIDS[1]) !== 0) bad.push('a short purse answered ' + JSON.stringify(poor));
    const moved = await q(db, `select count(*)::int n from public.player_ledger where kind = 'shop' and intent like 'scaled\\_hunt\\_buy:%'`);
    if (moved[0].n !== 3) bad.push(moved[0].n + ' purchase rows, want 3 (every refusal moved nothing)');
    return bad;
  },

  'SH-CLOSED': async (db, M) => {
    const bad = [];
    const h = await scaledHunter(db, M, { buys: [[UID, 'mill_cellar', 1]] });
    const b0 = await bankOf(db, UID), s0 = await instOf(db, h.inst);
    const claims = await cutsTo(db, M, [h.from + 6 * 60000]);
    const i1 = await instOf(db, h.inst), st = await statOf(db, UID), spent = b0 - await bankOf(db, UID);
    if (claims[claims.length - 1] !== 20) bad.push('the last window claimed ' + JSON.stringify(claims) + ', want Level 20');
    if (i1.scale_level !== 20) bad.push('the instance records Level ' + i1.scale_level);
    if (spent !== (i1.sw - s0.sw) * SWING || !(spent > 0)) bad.push('the bank lost ' + spent + ' ms for ' + (i1.sw - s0.sw) + ' world swings (every window scaled spends its swings)');
    if (Date.parse(i1.settled_to) < h.from + 6 * 60000) bad.push('the span did not settle to its end (a window refused?)');
    if (!(st.kills > 5)) bad.push('the scaled hunt killed ' + st.kills);
    return bad;
  },

  'SH-VIEWED': async (db, M) => {
    const bad = [];
    const h = await scaledHunter(db, M, { buys: [[UID, 'mill_cellar', 1]] });
    const b0 = await bankOf(db, UID);
    const snap = async () => { const i = await instOf(db, h.inst), st = await statOf(db, UID);
      return { spent: b0 - await bankOf(db, UID), lx: st.lx, kills: st.kills, gold: await purseOf(db, UID), sw: i.sw, world: i.world, level: i.scale_level }; };
    await db.query('savepoint sh_paths');
    /* BROWSER CLOSED: the tick's 2-min slices. HUNT VIEWED: the player door's 16 s settles. One instance, one set of dice. */
    await cutsTo(db, M, [h.from + 6 * 60000]);
    const closed = await snap();
    await db.query('rollback to savepoint sh_paths');
    await cutsTo(db, M, every(h.from, 16000, 6 * 60000));
    const viewed = await snap();
    for (const k of Object.keys(viewed)) if (viewed[k] !== closed[k]) bad.push('viewed ' + k + ' ' + String(viewed[k]).slice(0, 40) + ', closed ' + String(closed[k]).slice(0, 40));
    /* THE CONTROL: the same instance and dice with the switch off: a kill pays the Cellar's own, and nothing is spent */
    await db.query('rollback to savepoint sh_paths');
    await switchOf(db, UID, 'mill_cellar', false);
    await cutsTo(db, M, [h.from + 6 * 60000]);
    const own = await snap();
    const lx0 = BigInt(await one(db, 'select public.hr_char_xp_for_level(20)::text'));
    const per = (x) => Number(BigInt(x.lx) - lx0) / Math.max(1, x.kills);
    if (!(per(closed) >= 2 * per(own))) bad.push('a scaled kill paid ' + per(closed).toFixed(1) + ' Level XP, the Cellar\'s own ' + per(own).toFixed(1) + ' (want 2x or more)');
    if (own.spent !== 0 || own.level !== null) bad.push('the switch off spent ' + own.spent + ' ms at Level ' + own.level);
    console.log('  SH-VIEWED Cellar at Level 20, 6 min: ' + closed.kills + ' kills, ' + per(closed).toFixed(1) + ' Level XP a kill scaled vs ' + per(own).toFixed(1)
      + ' own (' + own.kills + ' kills); ' + closed.spent / 1000 + ' s spent; closed and viewed ' + (bad.length ? 'DIFFER' : 'identical'));
    return bad;
  },

  'SH-OUT': async (db, M) => {
    const bad = [];
    const h = await scaledHunter(db, M, { buys: [[UID, 'mill_cellar', 1]] });
    /* a fixture bank of 40 s (20 swings), its books kept */
    await db.query('update public.player_scaled_hours set banked_ms = 40000, spent_ms = bought_ms - 40000 where user_id = $1', [UID]);
    const s0 = await instOf(db, h.inst);
    await cutsTo(db, M, [h.from + 3 * 60000]);
    const i1 = await instOf(db, h.inst), open = await one(db, 'select count(*)::int from public.hunt_sessions where id = $1 and ended_at is null', [h.sid]);
    const row = (await q(db, 'select banked_ms::int b, spent_ms::text s, bought_ms::text t from public.player_scaled_hours where user_id = $1', [UID]))[0];
    if (row.b !== 0 || BigInt(row.t) - BigInt(row.s) !== 0n) bad.push('the bank holds ' + row.b + ' ms after its hours ran out (books ' + row.t + ' - ' + row.s + ')');
    if (i1.scale_level !== null) bad.push('the instance still records Level ' + i1.scale_level + ' after the hours ran out');
    if (open !== 1) bad.push('the hunt ended when its hours did');
    if (!(i1.sw - s0.sw >= 80)) bad.push('the hunt walked ' + (i1.sw - s0.sw) + ' world swings in 3 minutes: it stopped with the hours');
    if (Date.parse(i1.settled_to) < h.from + 3 * 60000) bad.push('the span did not settle to its end');
    return bad;
  },

  'SH-SWITCH': async (db, M) => {
    const bad = [];
    const h = await scaledHunter(db, M, { buys: [[UID, 'mill_cellar', 1]] });
    await cutsTo(db, M, [h.from + 60000]);
    if ((await instOf(db, h.inst)).scale_level !== 20) bad.push('CONTROL: the first minute was not scaled');
    const r = await switchOf(db, UID, 'mill_cellar', false);
    const b1 = await bankOf(db, UID);
    const claims = await cutsTo(db, M, [h.from + 3 * 60000]);
    if (!r || r.ok !== true || r.scaled_hunts.grounds.mill_cellar.on !== false) bad.push('the switch answered ' + JSON.stringify(r));
    if (claims.some((c) => c !== null) || (await instOf(db, h.inst)).scale_level !== null) bad.push('after the switch the windows claimed ' + JSON.stringify(claims));
    if (await bankOf(db, UID) !== b1) bad.push('the switch off still spent ' + (b1 - await bankOf(db, UID)) + ' ms');
    return bad;
  },

  'SH-PARTY': async (db, M) => {
    const bad = [];
    const [A, B] = UIDS;
    const h = await scaledHunter(db, M, { party: [{}, {}], buys: [[A, 'mill_cellar', 1], [B, 'mill_cellar', 2]] });
    const lead = await one(db, 'select leader_user::text from public.hunt_parties where id = $1', [h.party]);
    if (lead !== A) return ['CONTROL: the party\'s leader is ' + lead];
    const step = async (until) => { const a = await bankOf(db, A), b = await bankOf(db, B), s = await instOf(db, h.inst);
      const claims = await cutsTo(db, M, [until]); const i = await instOf(db, h.inst);
      return { a: a - await bankOf(db, A), b: b - await bankOf(db, B), sw: (i.sw - s.sw) * SWING, claims, level: i.scale_level }; };
    const one1 = await step(h.from + 2 * 60000);
    if (one1.level !== 20 || one1.a !== one1.sw || !(one1.a > 0) || one1.b !== 0) bad.push('led by A: ' + JSON.stringify(one1) + ' (want A to spend one swing a world swing, B nothing)');
    /* THE CROWN PASSES to B (a fixture write: hunt_parties.leader_*): the next window spends B's hours, never A's */
    await db.query('update public.hunt_parties set leader_user = $2, leader_slot = 0 where id = $1', [h.party, B]);
    const two = await step(h.from + 4 * 60000);
    if (two.level !== 20 || two.b !== two.sw || !(two.b > 0) || two.a !== 0) bad.push('led by B: ' + JSON.stringify(two) + ' (want B to spend, A nothing)');
    /* ...and a leader with no hours left plays the ground's own */
    await db.query('update public.player_scaled_hours set banked_ms = 0, spent_ms = bought_ms where user_id = $1', [B]);
    const three = await step(h.from + 6 * 60000);
    if (three.level !== null || three.claims.some((c) => c !== null) || three.a !== 0) bad.push('led by B with no hours: ' + JSON.stringify(three));
    return bad;
  },

  'SH-FORGE': async (db, M) => {
    const bad = [];
    /* Level 50: a scaled kill pays several times what the Cellar's own value bound allows (K x its best kill), so the bound bites */
    const h = await scaledHunter(db, M, { buys: [[UID, 'mill_cellar', 1]], level: 50 });
    const exec = makeExec(db);
    const attempt = async (toMs, edit) => {
      const plan = await M.HS.readHuntSettle({ exec, user: UID, slot: 0, atMs: toMs }, 'tick');
      if (plan.answer) return { skipped: plan.answer.reason };
      const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
      if (edit) await edit(p.commit);
      return M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
    };
    await db.query('savepoint sh_forge');
    const cases = [
      ['a claim of another Level', async (c) => { c.settle.scale = { level: 49 }; }, 'scale_moved'],
      ['a claim with the switch off', async () => { await db.query('update public.player_scaled_hours set use_on = false where user_id = $1', [UID]); }, 'scale_moved'],
      ['more swings than the bank holds', async () => { await db.query('update public.player_scaled_hours set banked_ms = 2000, spent_ms = bought_ms - 2000 where user_id = $1', [UID]); }, 'scale_over'],
      ['a scaled window that claims nothing', async (c) => { delete c.settle.scale; }, 'value_over'],
    ];
    for (const [what, edit, want] of cases) {
      const r = await attempt(h.from + 60000, edit);
      if (!r || r.ok === true || r.error !== want) bad.push(what + ' answered ' + JSON.stringify(r).slice(0, 200) + ', want ' + want);
      await db.query('rollback to savepoint sh_forge');
    }
    const honest = await attempt(h.from + 60000, null);
    if (!honest || honest.ok !== true) bad.push('CONTROL: the honest window answered ' + JSON.stringify(honest).slice(0, 200));
    return bad;
  },
};

async function runArms(db, M, only) {
  const out = {};
  const ctx = {};
  for (const name of ARMS) {
    if (only && !only.includes(name)) continue;
    if (name === 'SH-PLAY') { out[name] = shPlay(M.CS); continue; }
    if (name === 'SH-PLAN') { out[name] = shPlan(M.HS); continue; }
    try {
      out[name] = await inTx(db, async () => {
        await db.query('savepoint sh_arm');
        return DB_ARMS[name](db, M, ctx);
      });
    } catch (e) { out[name] = ['threw: ' + String(e && e.message).slice(0, 400)]; }
  }
  return out;
}

/* DB mutants: one anchored edit of a live body, the arm that must go red. Engine mutants: one anchored edit of a temp copy. */
const DB_MUTANTS = [
  { arm: 'SH-FORGE', name: 'a scaled window is bounded by the ground\'s own kills (honest scaled XP refused)', fn: 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)',
    find: 'select greatest(v_vb_gold, coalesce(max(b.gold_max), 0)), greatest(v_vb_xp, coalesce(max(b.xp_max), 0)) into v_vb_gold, v_vb_xp', replace: 'select v_vb_gold, v_vb_xp into v_vb_gold, v_vb_xp' },
  { arm: 'SH-CLOSED', name: 'the settle never spends the hours', fn: 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
    find: 'set banked_ms = h.banked_ms - v_sms, spent_ms = h.spent_ms + v_sms', replace: 'set banked_ms = h.banked_ms, spent_ms = h.spent_ms' },
  { arm: 'SH-CLOSED', name: 'the settle spends one hour a hero, not one a party (x2)', fn: 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
    find: "v_sms := (v_wsw - v_i.world_swing) * v_tick;", replace: "v_sms := (v_wsw - v_i.world_swing) * v_tick * 2;" },
  { arm: 'SH-FORGE', name: 'the commit takes any Level the edge claims', fn: 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
    find: "if v_sc is null or (v_sc->>'level')::int <> (p_settle->'scale'->>'level')::int then", replace: "if v_sc is null then" },
  { arm: 'SH-FORGE', name: 'the commit spends past the bank', fn: 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
    find: "      if v_sms > (v_sc->>'banked_ms')::bigint then\n", replace: "      if false then\n" },
  { arm: 'SH-SWITCH', name: 'the switch is never read', fn: 'public.hr_scaled_hunt_of(uuid)', find: 'or not v_h.use_on ', replace: '' },
  { arm: 'SH-PARTY', name: 'every member\'s own bank scales the party (the first hunter\'s, not the leader\'s)', fn: 'public.hr_scaled_hunt_of(uuid)',
    find: "  if exists (select 1 from public.hunt_parties p where p.id = p_instance) then", replace: "  if false then" },
  { arm: 'SH-BUY', name: 'the purchase trusts the client\'s price', fn: 'public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)', find: '  if v_price <> p_price then', replace: '  v_price := p_price;\n  if false then' },
  { arm: 'SH-BUY', name: 'no day clamp', fn: 'public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)', find: '  if v_today + p_hours > r.day_max_hours then', replace: '  if false then' },
  { arm: 'SH-BUY', name: 'no bank cap', fn: 'public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)', find: '  if v_bank + p_hours * c_hour > r.bank_max_hours::bigint * c_hour then', replace: '  if false then' },
  { arm: 'SH-BUY', name: 'the price reads the ground\'s floor, not the hero\'s Level', fn: 'public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)',
    find: '  v_price := r.price_per_level::bigint * v_to * p_hours;', replace: '  v_price := r.price_per_level::bigint * (v_top + 1) * p_hours;' },
  { arm: 'SH-CAT', name: 'a kill bound typed by hand', fn: null, sql: "update public.hr_scaled_kill_bounds set xp_max = xp_max + 1 where hunt_id = 'mill_cellar' and level = 20" },
];
const JS_MUTANTS = [
  { arm: 'SH-PLAY', name: 'a Deadly pick plays Deadly while scaled', file: 'src/core/combat-sim.js', from: "normalOf: (id) => id !== DEFAULT_TIER && own(id) === null };", to: 'normalOf: () => false };' },
  { arm: 'SH-PLAY', name: 'a scaled ground keeps its own tier rows', file: 'src/core/combat-sim.js', from: 'tierOf: (id) => own(id) || tierRowOf(groundId, DEFAULT_TIER),', to: 'tierOf: (id) => tierRowOf(groundId, id),' },
  { arm: 'SH-PLAY', name: 'a Level the data can\'t play is played anyway', file: 'src/core/combat-sim.js', from: 'const level = asked !== null && scaleLevelFor(groundId, asked) === asked ? asked : null;', to: 'const level = asked !== null && scaleLevelFor(groundId, asked) !== null ? asked : null;' },
  { arm: 'SH-PLAN', name: 'the window runs past the banked hours', file: 'supabase/functions/hr-accrue/hunt-settle.js', from: '  return { level, restart: typeof (inst && inst.world) === \'string\' && stored !== level, capMs: level === null ? Infinity : capMs };',
    to: '  return { level, restart: typeof (inst && inst.world) === \'string\' && stored !== level, capMs: Infinity };' },
  { arm: 'SH-PLAN', name: 'a world built at another Level plays on', file: 'supabase/functions/hr-accrue/hunt-settle.js', from: "restart: typeof (inst && inst.world) === 'string' && stored !== level,", to: 'restart: false,' },
  { arm: 'SH-OUT', name: 'the settle never stops at the end of the hours', file: 'supabase/functions/hr-accrue/hunt-settle.js', from: '  const toMs = Math.min(endMs, fromMs + HUNT_SETTLE_SPAN_MS, inst.play.capMs);', to: '  const toMs = Math.min(endMs, fromMs + HUNT_SETTLE_SPAN_MS);' },
];

async function main() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const { mkdtempSync, cpSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(1); }
  await H.pinDice(db);
  const load = async (root) => ({ ...(await H.loadEdge(root)), CS: await import(pathToFileURL(join(root, 'src/core/combat-sim.js')).href + V) });
  if (MUTATE) {
    let bad = 0;
    const M = await load(ROOT);
    const need = (m, res) => (res[m.arm] && res[m.arm].length ? (console.log('✓ ' + m.arm + ' goes red on: ' + m.name), 0) : (console.error('✗ ' + m.arm + ' stayed GREEN on: ' + m.name), 1));
    for (const m of DB_MUTANTS) {
      if (!m.fn) {
        const res = await runArms(db, { ...M, _plant: m.sql }, [m.arm]).catch((e) => ({ [m.arm]: ['threw ' + e.message] }));
        await db.exec('begin'); await db.exec(m.sql);
        const r2 = await runArms(db, M, [m.arm]).catch((e) => ({ [m.arm]: ['threw ' + e.message] }));
        await db.exec('rollback');
        void res; bad += need(m, r2); continue;
      }
      const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).split(String.fromCharCode(13)).join('');
      if (def.split(m.find).length !== 2) { console.error('✗ db mutant "' + m.name + '": anchor not found exactly once'); bad++; continue; }
      await db.exec(def.replace(m.find, () => m.replace));
      try { bad += need(m, await runArms(db, M, [m.arm])); } finally { await db.exec(def); }
    }
    for (const m of JS_MUTANTS) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-sh-'));
      try {
        for (const d of ['src', 'supabase/functions/hr-accrue', 'tools']) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
        const p = join(dir, m.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(m.from).length !== 2) { console.error('✗ mutant "' + m.name + '": marker not found exactly once in ' + m.file); bad++; continue; }
        writeFileSync(p, src.replace(m.from, () => m.to));
        const Mx = await load(dir);
        bad += need(m, await runArms(db, Mx, [m.arm]));
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    const total = DB_MUTANTS.length + JS_MUTANTS.length;
    console.log(bad ? 'scaled-hunts-server --mutate: ' + bad + ' mutant(s) survived' : 'scaled-hunts-server --mutate: all ' + total + ' mutants killed');
    process.exit(bad ? 1 : 0);
  }
  const M = await load(ROOT);
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const res = await runArms(db, M, onlyArg ? onlyArg.slice(7).split(',') : undefined);
  let red = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems && problems.length) { red++; for (const p of problems) console.error('✗ ' + name + ': ' + p); }
    else console.log('✓ ' + name);
  }
  console.log(red ? 'scaled-hunts-server: ' + red + ' arm(s) red' : 'scaled-hunts-server: all ' + Object.keys(res).length + ' arms green');
  process.exit(red ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
