#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunting-blocks.mjs — THE HUNTING DAY IS 10 H, AND TWO 2 H BLOCKS A DAY ARE BOUGHT ON TOP (Tyler 2026-11-22;
//   1058-hunting-blocks.sql, 1058-hunting-blocks-hunt-sessions-catalogue.generated.sql, src/data/time-blocks.js; CLAUDE.md §1, §4 both paths).
//
//   node tests/hunting-blocks.mjs            the guard (every arm)
//   node tests/hunting-blocks.mjs --mutate   the proof: each SQL mutant planted in the live body must turn its arm red
//
// mutant-anchors: none — every mutant is planted in a live function body read from the replayed chain (pg_get_functiondef), inside the
//   arm's rolled-back transaction; no tracked file is patched
//
// THE MEASURE: the replayed chain (PGlite), the real engine (tests/hunt-sessions-settle.mjs HARNESS), a free hero (the beta Premium
// switch off) at Level 25 on the settle fixture's ground, and a real CharacterSession for the press.
//   HB-WAGE     THE WAGE (lane/w-wage; src/core/wage.js): the server's hr_wage is the JS wage at every step from 1 to past the last,
//               never falling and held at DANGER.stepMax; hr_time_block_price is the JS block price at every Level for every block of
//               the day and the first past it; the work hook prices 04's town-work row at 1.0 / 1.5 / 2.25 / 3.375 hours of wage
//   HB-DAY      THE DONE LINE, BROWSER CLOSED: a rested free hero holds 10 h and the server's tick hunts it to the `stamina` end at
//               exactly 10 h; back in town the viewed client reads the `time_blocks` quote (04's price: 2 h x 2.0 hours of the hero's
//               wage, 0 of 2, the server's wage the JS one), buys a block
//               through CharacterSession.buyTime, then the second at x1.5; the third is quoted block_limit and a forged press of it is
//               refused block_limit: two shop rows, the purse down by exactly the two prices, the pool up by exactly 4 h
//   HB-BOTH     BOTH PATHS: the same hero buys two blocks an hour into its hunt (the pool written at the session's settled_to) and the
//               hunt runs on the server to the `stamina` end at exactly 14 h, on the tick door (browser closed) and on the player door
//               (hunt viewed) alike, each paying the same two prices
//   HB-PREMIUM  THE PREMIUM DAY: with the switch on the pool rests to 12 h and two blocks bank it to 16 h, the ceiling; a third is
//               block_limit; on a day with none bought, a pool inside a block of the ceiling is stamina_full
//   HB-KEY      THE KEY AND THE PRICE: a replayed key answers and moves nothing; the first block's price pressed again (a new key, the
//               second is dearer) is quote_changed carrying the new quote; a kind with no row is bad_kind; anon cannot buy; no
//               request role reaches the retired refill, and the envelope carries no `stamina_refill` section
// Exit: 0 green · 1 a red arm or a missed mutant · 2 a harness problem.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
// TRUE CONCURRENCY: PGlite is one backend. Two presses on one key that race on the hero's lock are tests/key-under-lock.mjs KL-TIME
// (the second press played as what it runs after the lock). The UTC day's turn is read from the ledger's `at`, which the append-only
// journal will not let a test move: a new day is proven by 1058's own §4 (no block bought) and not by waiting for midnight.
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { isMain } from './_is-main.mjs';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { goldOf } from './_gold.mjs';

const MUTATE = process.argv.includes('--mutate');
const HOUR = 3600000;
const BLOCK = 2 * HOUR;
const mod = (f) => import(pathToFileURL(join(ROOT, f)).href);
const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
const { CharacterSession } = await mod('src/session/character-session.js');
const { huntBlockOf } = await mod('src/session/item-sections.js');
const { TIME_BLOCKS } = await mod('src/data/time-blocks.js');
const { wage, blockPrice, blockPriceOf } = await mod('src/core/wage.js');
const { WAGE } = await mod('src/data/wage.js');
const { DANGER } = await mod('src/data/danger.js');
const { STAMINA_MAX_MS } = await mod('src/data/hunt-sessions.js');
const UID = H.UIDS[0];
const LEVEL = 25;
const idem = () => crypto.randomUUID();
const { one, q } = H;

/* As PostgREST calls it: the JWT subject set, `set role authenticated` (or `anon`), inside a savepoint so a refusal by the database
   (a permission) leaves the arm's transaction usable. */
async function as(db, uid, sql, params, role = 'authenticated') {
  await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [uid, JSON.stringify({ sub: uid, role })]);
  await db.query('savepoint hb_as');
  await db.exec('set role ' + role);
  try { const r = (await db.query(sql, params)).rows[0]; await db.exec('reset role'); await db.query('release savepoint hb_as'); return r ? Object.values(r)[0] : undefined; }
  catch (e) { await db.query('rollback to savepoint hb_as'); await db.exec('reset role'); return { thrown: String(e.message).split('\n')[0] }; }
  finally { await db.query("select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true)"); }
}
const press = async (db, price, key = idem(), kind = 'hunt') => {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);
  return as(db, UID, 'select public.hr_time_buy($1, 0, $2::bigint, $3::uuid) as r', [kind, price, key]);
};
const purse = (db) => goldOf((sql, p) => db.query(sql, p).then((r) => r.rows), UID, 0);
const poolRow = async (db) => (await q(db, 'select stamina_ms::text as ms, stamina_at from public.player_state where user_id = $1 and slot = 0', [UID]))[0];
const blockRows = async (db) => q(db, "select intent, gold::text as gold, meta from public.player_ledger where user_id = $1 and kind = 'shop' and intent like 'time\\_buy:%' order by id", [UID]);
const quote = (db) => one(db, "select public.hr_time_quote($1, 0, 'hunt')", [UID]);
const session = async (db, sid) => (await q(db, `select end_reason, floor(extract(epoch from ended_at) * 1000)::bigint::text as ended,
    floor(extract(epoch from hunt_from) * 1000)::bigint::text as from_ms from public.hunt_sessions where id = $1`, [sid]))[0];

/* A free hero hunting on the fixture ground, entered `minutesAgo` ago, its pool rested full at the hunt's start (stamina_ms 0 rested
   11 h, so the pool is whatever the cap is: the day the catalogue rules, not a number this test types). */
async function freeHunter(db, M, minutesAgo, premium = false) {
  await db.query("update public.hr_flags set enabled = $1 where key = 'beta_premium'", [premium]);
  const h = await H.hunter(db, M, { ...H.STRONG, level: LEVEL, minutesAgo, inv: { cooked_shrimp: 400 }, bag: [{ item: 'cooked_shrimp', qty: 300 }], gold: 1000000 });
  await db.query(`update public.player_state set stamina_ms = 0, stamina_at = (select hunt_from - interval '11 hours' from public.hunt_sessions where id = $2)
                   where user_id = $1 and slot = 0`, [UID, h.sid]);
  return h;
}

/* Settle the hunt to `toMs` on one door: `fire` the server's tick (browser closed), `viewed` the player door (hunt viewed). Hours of
   hunt settle here in seconds of wall time, so the settle's own per-minute rate counters are cleared between calls (a real day spaces
   the same windows ten seconds apart). */
async function settleOn(db, M, door, toMs) {
  await db.query('delete from public.hr_rate_counters');
  if (door === 'fire') return H.settleTo(db, M, toMs);
  for (let i = 0; i < 2000; i++) {
    await db.query('delete from public.hr_rate_counters');
    const v = await M.HS.settleHunt({ exec: H.makeExec(db), user: UID, slot: 0, mode: 'settle', bucket: null, project: false, grounds: H.groundsOf(M), atMs: toMs, minWindowMs: 0 });
    /* the hunt is over (the arm reads when and why it ended) */
    if (v && v.body && v.body.error === 'no_hunt') return v;
    if (!v || v.status !== 200 || !v.body || v.body.ok !== true) throw new Error('the player-door settle answered ' + JSON.stringify(v && v.body).slice(0, 300));
    const s = (await q(db, 'select ended_at, floor(extract(epoch from settled_to) * 1000)::bigint::text as to_ms from public.hunt_sessions where user_id = $1 and slot = 0 order by entered_at desc limit 1', [UID]))[0];
    if (!s || s.ended_at !== null || Number(s.to_ms) >= toMs) return v;
  }
  throw new Error('harness: the player door never reached ' + new Date(toMs).toISOString());
}
async function huntTo(db, M, door, from, toMs, stepMs = 10 * 60000) {
  for (let t = from + stepMs; ; t = Math.min(toMs, t + stepMs)) { await settleOn(db, M, door, t); if (t >= toMs) break; }
}

/* A real viewed CharacterSession on this hero: every rpc is the real verb as `authenticated`. */
function viewedClient(db) {
  const server = {
    rpc: async (name, args) => {
      if (name === 'hr_time_buy') await db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);
      const keys = Object.keys(args);
      const body = await as(db, UID, `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`,
        keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
      return { ok: true, status: 200, body, closed: false };
    },
    accrue: async () => ({ ok: false, status: 0, error: 'network' }),
  };
  return new CharacterSession({ slot: 0, uid: UID, server, viewed: true, setTimer: () => 0, clearTimer: () => {}, now: () => Date.now() });
}

/* 04's starting row for bought town work (src/core/wage.js, the R12 hook): 2 h at 0.5 hours of wage an hour, x1.5, four a day */
const WORK_ROW = Object.freeze({ blockMin: 120, priceHourPm: 500, growthNum: 3, growthDen: 2, perDay: 4 });

const ARMS = {
  'HB-WAGE': async (db) => {
    const p = [];
    /* the server's wage is the JS wage at EVERY step to past the last (one query), never falling, flat past DANGER.stepMax */
    const top = DANGER.stepMax + 5;
    const rows = await q(db, 'select s, public.hr_wage(s)::text as w from generate_series(1, $1::int) s order by s', [top]);
    let prev = 0, bad = 0;
    for (const r of rows) {
      const js = wage(r.s);
      if (Number(r.w) !== js && bad++ < 3) p.push('the wage at step ' + r.s + ' is ' + r.w + ' on the server, ' + js + ' in src/core/wage.js');
      if (js < prev && bad++ < 3) p.push('the wage falls at step ' + r.s);
      prev = js;
    }
    if (rows.length !== top) p.push('the server answered ' + rows.length + ' steps of ' + top);
    if (wage(DANGER.stepMax + 1) !== wage(DANGER.stepMax) || wage(0) !== wage(1) || wage(1) !== Math.floor(WAGE.wageBase * (1 + WAGE.payStepCoin))) {
      p.push('the wage is not held to [1, ' + DANGER.stepMax + ']');
    }
    /* the block price's twin is the JS price at every Level, every block of the day and the first past it */
    const prices = await q(db, `select l, n, public.hr_time_block_price('hunt', l, n)::text as g
      from generate_series(1, $1::int) l cross join generate_series(1, $2::int) n order by l, n`, [top, TIME_BLOCKS.hunt.perDay + 1]);
    for (const r of prices) {
      const js = blockPrice({ kind: 'hunt', level: r.l, n: r.n });
      if ((r.g === null ? null : Number(r.g)) !== js && bad++ < 6) p.push('hunt block ' + r.n + ' at Level ' + r.l + ' costs ' + r.g + ' on the server, ' + js + ' in src/core/wage.js');
    }
    /* THE WORK HOOK prices 04's town-work row: 1.0, 1.5, 2.25 and 3.375 hours of wage, refused at the fifth */
    for (const L of [1, 20, 60, 400]) {
      const w = wage(L), got = [1, 2, 3, 4, 5].map((n) => blockPriceOf(WORK_ROW, L, n)), want = [1, 1.5, 2.25, 3.375].map((h) => Math.ceil(h * w));
      if (JSON.stringify(got) !== JSON.stringify([...want, null])) p.push('the work hook at Level ' + L + ' prices ' + JSON.stringify(got) + ', want ' + JSON.stringify([...want, null]));
    }
    return p;
  },

  'HB-DAY': async (db, M) => {
    const p = [];
    const h = await freeHunter(db, M, 10 * 60 + 20);
    const cap = Number(await one(db, 'select public.hr_stamina_cap($1, 0, now())', [UID]));
    if (cap !== STAMINA_MAX_MS.free || cap !== 10 * HOUR) p.push('the free day is ' + cap + ' ms, want 10 h (STAMINA_MAX_MS.free ' + STAMINA_MAX_MS.free + ')');
    await huntTo(db, M, 'fire', h.from, h.from + 10 * HOUR + 10 * 60000);
    const s = await session(db, h.sid);
    if (!s || s.end_reason !== 'stamina' || Number(s.ended) !== Number(s.from_ms) + 10 * HOUR) {
      p.push('the closed hunt ended ' + JSON.stringify(s) + ', want `stamina` at exactly 10 h');
      return p;
    }
    /* Back in town: the viewed client buys through the section's quote (a hero loads once it has a name). */
    const named = await as(db, UID, 'select public.hr_character_name_set(0, $1, $2::uuid) as r', ['Blockbuyer', idem()]);
    if (!named || named.ok !== true) return ['harness: naming refused: ' + JSON.stringify(named)];
    const cs = viewedClient(db);
    await cs.load();
    if (cs.status !== 'ready') return ['harness: the viewed hero did not load: ' + cs.status];
    const q1 = huntBlockOf(cs);
    const want1 = blockPrice({ kind: 'hunt', level: LEVEL, n: 1 }), want2 = blockPrice({ kind: 'hunt', level: LEVEL, n: 2 });
    /* THE 04 FORMULA (04 section 11): block hours x price an hour (in hours of wage) x wage(L), then x1.5. At the starting row (2 h at 2.0)
       the day's first is 4 hours of the hero's wage and its second 6; the server's wage is the JS wage at this Level */
    const R = TIME_BLOCKS.hunt, hours1 = (R.blockMin / 60) * (R.priceHourPm / 1000);
    const w = wage(LEVEL), sw = Number(await one(db, 'select public.hr_wage($1)', [LEVEL]));
    if (want1 !== Math.ceil(hours1 * w) || want2 !== Math.ceil(hours1 * 1.5 * w) || sw !== w) {
      p.push('at Level ' + LEVEL + ' the blocks price ' + want1 + ' and ' + want2 + ' on a wage of ' + w + ' (the server\'s ' + sw + '), want '
        + hours1 + ' and ' + hours1 * 1.5 + ' hours of it');
      return p;
    }
    if (!q1 || !q1.available || q1.price !== want1 || q1.blockMs !== TIME_BLOCKS.hunt.blockMin * 60000 || q1.boughtToday !== 0 || q1.perDay !== 2) {
      p.push('the first quote reads ' + JSON.stringify(q1) + ', want ' + want1 + ' gold for 2 h, 0 of 2');
      return p;
    }
    const g0 = await purse(db), ms0 = Number((await quote(db)).ms);
    const r1 = await cs.buyTime('hunt', q1.price);
    const q2 = huntBlockOf(cs);
    if (!r1 || r1.ok !== true || !q2 || q2.price !== want2 || q2.boughtToday !== 1 || want2 !== Math.ceil(want1 * 1.5)) {
      p.push('the first block answered ' + JSON.stringify(r1).slice(0, 200) + ' and the next quote reads ' + JSON.stringify(q2) + ', want ' + want2 + ' (x1.5)');
      return p;
    }
    const r2 = await cs.buyTime('hunt', q2.price);
    const q3 = huntBlockOf(cs);
    if (!r2 || r2.ok !== true) p.push('the second block answered ' + JSON.stringify(r2).slice(0, 200));
    if (!q3 || q3.available !== false || q3.why !== 'block_limit' || q3.boughtToday !== 2) p.push('after two blocks the quote reads ' + JSON.stringify(q3) + ', want block_limit');
    const g2 = await purse(db), pool2 = await poolRow(db);
    const forged = await press(db, want2);
    if (!forged || forged.error !== 'block_limit') p.push('a third block pressed anyway answered ' + JSON.stringify(forged).slice(0, 200) + ', want block_limit');
    const rows = await blockRows(db);
    if (g2 !== g0 - want1 - want2 || await purse(db) !== g2) p.push('the purse moved ' + g0 + ' -> ' + g2 + ' -> ' + (await purse(db)) + ', want exactly -' + want1 + ' and -' + want2 + ', then nothing');
    if (Number(pool2.ms) < ms0 + 2 * BLOCK || Number(pool2.ms) > ms0 + 2 * BLOCK + 5 * 60000 || JSON.stringify(await poolRow(db)) !== JSON.stringify(pool2)) {
      p.push('the pool went ' + ms0 + ' -> ' + pool2.ms + ', want +4 h (and nothing on the refused third)');
    }
    if (rows.length !== 2 || rows[0].intent !== 'time_buy:hunt:' + want1 || rows[1].intent !== 'time_buy:hunt:' + want2 || Number(rows[0].gold) !== -want1
        || rows[1].meta.n !== 2 || rows[1].meta.block_ms !== BLOCK) p.push('the journal reads ' + JSON.stringify(rows));
    return p;
  },

  'HB-BOTH': async (db, M) => {
    const p = [];
    const ends = {};
    for (const door of ['fire', 'viewed']) {
      await db.query('savepoint hb_door');
      const h = await freeHunter(db, M, 14 * 60 + 30);
      await huntTo(db, M, door, h.from, h.from + HOUR);
      const q1 = await quote(db);
      const at = await one(db, "select floor(extract(epoch from settled_to) * 1000)::bigint::text from public.hunt_sessions where id = $1", [h.sid]);
      if (!q1 || q1.available !== true || Number(q1.ms) !== 9 * HOUR || Date.parse(q1.at) !== Number(at)) {
        p.push(door + ': an hour in, the quote reads ' + JSON.stringify(q1) + ', want 9 h at the session\'s settled_to');
        await db.query('rollback to savepoint hb_door');
        continue;
      }
      const a = await press(db, Number(q1.price));
      const q2 = await quote(db);
      const b = await press(db, Number(q2.price));
      if (!a || a.ok !== true || !b || b.ok !== true) p.push(door + ': the blocks mid-hunt answered ' + JSON.stringify([a, b]).slice(0, 240));
      const pool = await poolRow(db);
      if (Number(pool.ms) !== 13 * HOUR || Date.parse(pool.stamina_at) !== Number(at)) p.push(door + ': the pool was written ' + JSON.stringify(pool) + ', want 13 h at the session\'s settled_to');
      await huntTo(db, M, door, h.from + HOUR, h.from + 14 * HOUR + 10 * 60000);
      const s = await session(db, h.sid);
      /* what the blocks cost, from the journal (the purse also moves with the hunt's own coin and store food, which the doors cut differently) */
      const paid = (await blockRows(db)).map((r) => [r.intent, Number(r.gold)]);
      ends[door] = s && JSON.stringify({ reason: s.end_reason, after: Number(s.ended) - Number(s.from_ms), paid });
      const want = [1, 2].map((n) => blockPrice({ kind: 'hunt', level: LEVEL, n }));
      if (JSON.stringify(paid) !== JSON.stringify(want.map((g) => ['time_buy:hunt:' + g, -g]))) p.push(door + ': the journal reads ' + JSON.stringify(paid) + ', want the two blocks at ' + want.join(' and '));
      if (!s || s.end_reason !== 'stamina' || Number(s.ended) !== Number(s.from_ms) + 14 * HOUR) p.push(door + ': the hunt ended ' + JSON.stringify(s) + ', want `stamina` at exactly 14 h');
      await db.query('rollback to savepoint hb_door');
    }
    if (ends.fire && ends.viewed && ends.fire !== ends.viewed) p.push('the two doors differ: closed ' + ends.fire + ', viewed ' + ends.viewed);
    return p;
  },

  'HB-PREMIUM': async (db, M) => {
    const p = [];
    await freeHunter(db, M, 30, true);
    const sid = await one(db, 'select id from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is null', [UID]);
    await db.query("select public.hr_hunt_close($1, 'left', now(), true)", [sid]);
    await db.query("update public.player_state set stamina_ms = 0, stamina_at = now() - interval '13 hours' where user_id = $1 and slot = 0", [UID]);
    const q0 = await quote(db);
    if (!q0 || Number(q0.ms) !== STAMINA_MAX_MS.premium || Number(q0.max_ms) !== 12 * HOUR || Number(q0.ceiling_ms) !== 16 * HOUR || q0.available !== true) {
      p.push('a rested Premium hero quotes ' + JSON.stringify(q0) + ', want 12 h of a 12 h day, ceiling 16 h');
      return p;
    }
    /* stamina_full first, on a day with none bought: a pool a minute inside a block of the ceiling */
    await db.query('update public.player_state set stamina_ms = $2, stamina_at = now() where user_id = $1 and slot = 0', [UID, 16 * HOUR - BLOCK + 60000]);
    const full = await quote(db);
    if (!full || full.why !== 'stamina_full') p.push('a pool inside a block of the ceiling quotes ' + JSON.stringify(full));
    const refused = await press(db, blockPrice({ kind: 'hunt', level: LEVEL, n: 1 }));
    if (!refused || refused.error !== 'stamina_full') p.push('a block past the ceiling answered ' + JSON.stringify(refused).slice(0, 200));
    await db.query('update public.player_state set stamina_ms = $2, stamina_at = now() where user_id = $1 and slot = 0', [UID, 12 * HOUR]);
    const a = await press(db, Number((await quote(db)).price));
    const b = await press(db, Number((await quote(db)).price));
    const c = await quote(db);
    if (!a || a.ok !== true || !b || b.ok !== true || Number((await poolRow(db)).ms) !== 16 * HOUR) p.push('two blocks on a full Premium day answered ' + JSON.stringify([a, b]).slice(0, 240) + ' to ' + (await poolRow(db)).ms);
    if (!c || c.why !== 'block_limit') p.push('the third on a Premium day quotes ' + JSON.stringify(c));
    return p;
  },

  'HB-KEY': async (db, M) => {
    const p = [];
    await freeHunter(db, M, 30);
    const sid = await one(db, 'select id from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is null', [UID]);
    await db.query("select public.hr_hunt_close($1, 'left', now(), true)", [sid]);
    await db.query('update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = $1 and slot = 0', [UID]);
    const q1 = await quote(db);
    const k = idem();
    const a = await press(db, Number(q1.price), k);
    const snap = async () => JSON.stringify({ purse: await purse(db), pool: (await poolRow(db)).ms, rows: (await blockRows(db)).length });
    const s1 = await snap();
    const again = await press(db, Number(q1.price), k);
    if (!a || a.ok !== true || (await snap()) !== s1 || !again || again.thrown) p.push('a replayed key answered ' + JSON.stringify(again).slice(0, 160) + ' and moved ' + s1 + ' to ' + (await snap()));
    const stale = await press(db, Number(q1.price));
    const want2 = blockPrice({ kind: 'hunt', level: LEVEL, n: 2 });
    if (!stale || stale.error !== 'quote_changed' || !stale.time_blocks || stale.time_blocks.hunt.price !== want2 || (await snap()) !== s1) {
      p.push('the first price pressed again answered ' + JSON.stringify(stale).slice(0, 240) + ', want quote_changed carrying ' + want2);
    }
    const kind = await press(db, want2, idem(), 'work');
    if (!kind || kind.error !== 'bad_kind') p.push('a kind with no row answered ' + JSON.stringify(kind).slice(0, 160));
    const anon = await as(db, UID, 'select public.hr_time_buy($1, 0, $2::bigint, $3::uuid) as r', ['hunt', want2, idem()], 'anon');
    if (!anon || !anon.thrown || !/permission denied/.test(anon.thrown)) p.push('anon reached hr_time_buy: ' + JSON.stringify(anon).slice(0, 160));
    const refill = await as(db, UID, 'select public.hr_stamina_refill(0, 1000::bigint, $1::uuid) as r', [idem()]);
    if (!refill || !refill.thrown || !/permission denied|does not exist/.test(refill.thrown)) p.push('the signed-in client still reaches the stamina refill: ' + JSON.stringify(refill).slice(0, 160));
    const env = await one(db, 'select public.hr_state_of($1, 0)', [UID]);
    if (!env || 'stamina_refill' in env || !env.time_blocks || !env.time_blocks.hunt) p.push('the envelope carries ' + JSON.stringify(env && { stamina_refill: env.stamina_refill, time_blocks: env.time_blocks }).slice(0, 240));
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

/* SQL MUTANTS, planted in the live body (each anchor found exactly once), and the arm that must go red. */
const MUTANTS = [
  { arm: 'HB-DAY', name: 'the day\'s cap off by one (a third block sold)', fn: 'public.hr_time_quote(uuid,integer,text)',
    find: "when v_bought >= r.per_day then 'block_limit'", repl: "when v_bought > r.per_day then 'block_limit'" },
  { arm: 'HB-DAY', name: 'every block of the day at the first one\'s price (no x1.5)', fn: 'public.hr_time_block_price(text,integer,integer)',
    find: '* public.hr_wage(p_level) * power(r.growth_num::numeric, p_n - 1);', repl: '* public.hr_wage(p_level);' },
  { arm: 'HB-DAY', name: 'the block priced at the Level 1 wage, not the hero\'s', fn: 'public.hr_time_block_price(text,integer,integer)',
    find: 'public.hr_wage(p_level)', repl: 'public.hr_wage(1)' },
  { arm: 'HB-WAGE', name: 'the server\'s wage drifts off the JS by a hair a squaring', fn: 'public.hr_wage(integer)',
    find: 'v_b := v_b * v_b;', repl: 'v_b := v_b * v_b * 1.000001::float8;' },
  { arm: 'HB-WAGE', name: 'the server\'s wage never held at the last step', fn: 'public.hr_wage(integer)',
    find: 'least(' + DANGER.stepMax + ', greatest(1, coalesce(p_step, 1)))', repl: 'greatest(1, coalesce(p_step, 1))' },
  { arm: 'HB-BOTH', name: 'the block charges and never writes the pool', fn: 'public.hr_time_buy(text,integer,bigint,uuid)',
    find: "   where user_id = v_uid and slot = p_slot;\n  return jsonb_build_object('ok', true, 'version', v_a->'version', 'kind', p_kind,",
    repl: "   where false;\n  return jsonb_build_object('ok', true, 'version', v_a->'version', 'kind', p_kind," },
  { arm: 'HB-BOTH', name: 'the pool written at the wall clock, not the hunt\'s instant', fn: 'public.hr_time_quote(uuid,integer,text)',
    find: 'v_at := coalesce(v_s.settled_to, now());', repl: 'v_at := now();' },
  { arm: 'HB-PREMIUM', name: 'the ceiling forgets the day\'s blocks (no block above the cap)', fn: 'public.hr_time_quote(uuid,integer,text)',
    find: 'v_ceil := v_cap + r.per_day::bigint * v_block;', repl: 'v_ceil := v_cap;' },
  { arm: 'HB-PREMIUM', name: 'no ceiling at all (bought time banks without end)', fn: 'public.hr_time_quote(uuid,integer,text)',
    find: "when v_cur + v_block > v_ceil then 'stamina_full'", repl: "when false then 'stamina_full'" },
  { arm: 'HB-KEY', name: 'the price check dropped (the client\'s number is charged)', fn: 'public.hr_time_buy(text,integer,bigint,uuid)',
    find: "if (v_q->>'price')::bigint <> p_price then", repl: 'if false then' },
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
    console.log(bad ? 'hunting-blocks --mutate: ' + bad + ' failure(s)' : 'hunting-blocks --mutate: all ' + MUTANTS.length + ' mutants killed');
    process.exit(bad ? 1 : 0);
  }
  const res = await runArms(db, M);
  let red = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems.length) { red++; for (const pr of problems) console.error('✗ ' + name + ': ' + pr); }
    else console.log('✓ ' + name);
  }
  console.log(red ? 'hunting-blocks: ' + red + ' arm(s) red' : 'hunting-blocks: all ' + Object.keys(res).length + ' arms green');
  process.exit(red ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
