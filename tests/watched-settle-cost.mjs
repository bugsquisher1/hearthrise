#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/watched-settle-cost.mjs — A WATCHED HUNT'S SETTLE COSTS LESS, AND NOTHING A PLAYER EARNS MOVES
// (lane/c-watched-settle-cost, 2026-11-10; supabase/migrations/2027-03-31-watched-settle-cost.sql and the settle
// floor's answer in supabase/functions/hr-accrue/hunt-settle.js).
//
//   node tests/watched-settle-cost.mjs            the arms, on the replayed chain through the shipped edge
//   node tests/watched-settle-cost.mjs --mutate   every planted defect turns its own arm red
//   (--pg: the same on PostgreSQL 17, tools/pg-replay.mjs, for a developer; CI replays on PGlite)
//
// THE PARTY: one account's two heroes (A0 on screen and asking, A1 off screen) and a stranger (B0), in ONE instance on a
// real ground, every hero open in a client, frames recorded by a stand-in for realtime.send. Windows are 18 s (the
// watched cadence), started 5 s past a 30 s mark of the server clock, so which windows cross a mark is known.
//
//   CAP     the dial's ceiling leaves a held frame time to arrive before the client's own 60 s re-read of an unviewed hero
//   DIAL-0  the shipped value: every commit frames every other member (A1 and B0), never the asker
//   DIAL-30 the same six windows from the same state with the dial at 30: B0 still every commit, A1 only in the windows
//           that cross a mark; the asker's six answers and EVERY ROW the commits wrote are identical to DIAL-0's
//   OTHER   B0 asks: both of A's heroes are another account's, framed every commit
//   TICK    the browser closed (the world tick's fire, no asker): every open member framed, nothing held
//   END     A1 runs out of stamina in a window that crosses no mark: its frame goes in THAT commit, its hunt ended
//   LEVEL   A1's Level rises in a window that crosses no mark: its frame goes in that commit
//   ONCE    one push an end (2027-04-10-own-hunt-nudge-once.sql): all three hunts end in one commit. The asker's own settle:
//           A1 and B0 hear it once, as the state frame; A0 once, as a nudge (the self-echo rule spares its frame, its other
//           clients hold nothing). The world tick's settle: each once, as the frame. Never a frame and a nudge for one end.
//   FLOOR   the floor's answer: no `have` or any other version is the whole character; exactly the held version is
//           the start point alone (no hr_state_of statement); after a tick settle the old `have` is whole again
//   PERKS   the perk read prices no renown, and the engine's stack is the same from the old answer and the new
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HARNESS as H } from './hunt-sessions-settle.mjs';
import { ownHeroSlots } from './_slots.mjs';

const MUTATE = process.argv.includes('--mutate');
const PG = process.argv.includes('--pg');
const OWN = '2027-03-31-watched-settle-cost.sql';
const HUNT = 'millrace_sewer';
const WIN = 18000;
const [A, B] = H.UIDS;
const HELD = 'public.hr_frame_own_held(jsonb,uuid,integer,timestamp with time zone,timestamp with time zone)';
const INST = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)';
const NUDGE = 'public.hr_hunt_nudge_trg()';
const idem = () => crypto.randomUUID();
const q = (db, sql, p) => H.q(db, sql, p);
const one = (db, sql, p) => H.one(db, sql, p);
const asUser = (db, u) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [u]);
const okOf = (r, what) => { if (!r || (r.ok !== true && r.created !== true)) throw new Error(what + ' refused: ' + JSON.stringify(r)); return r; };

/* The engine's statements as hr_engine, under the requester's frame-self marker (index.ts), inside the arm's transaction. */
const execAs = (db, who, seen) => async (text, params) => {
  await db.query(`select set_config('hr.frame_self', $1, true)`, [who ? String(who[0]).toLowerCase() + ':' + who[1] : '']);
  await db.exec('set local role hr_engine');
  if (seen) seen.push(text);
  try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
};

async function fixture(db, M) {
  await db.exec(`create schema if not exists realtime;
    create table if not exists realtime.bench_frames (n bigserial primary key, topic text, event text, payload jsonb);
    create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
      language sql as $f$ insert into realtime.bench_frames (topic, event, payload) values (topic, event, payload) $f$;
    update public.hr_tick_config set frame_push = true, enabled = true where id;
    update public.hr_hunt_config set enabled = true where id;`);
  await db.query('begin');
  const kit = { level: 20, inv: { cooked_shrimp: 400 }, gold: 200000 };
  const bag = JSON.stringify([{ item: 'cooked_shrimp', qty: 300 }]);
  for (const u of [A, B]) await H.character(db, M, u, kit);
  /* A's second hero: the slot owned as a buyer owns it (tests/_slots.mjs), the first hero's Level, skills and bag row for row. */
  await asUser(db, A);
  await ownHeroSlots((s, p) => db.query(s, p), A, 1);
  okOf(await one(db, 'select public.hr_create_character(1)'), 'the second hero');
  await db.query(`update public.player_state t set active_kind = 'idle', active_id = null, level_xp = s.level_xp
                    from public.player_state s where s.user_id = $1 and s.slot = 0 and t.user_id = $1 and t.slot = 1`, [A]);
  await db.query('delete from public.player_inventory where user_id = $1 and slot = 1', [A]);
  await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) select user_id, 1, item_id, qty from public.player_inventory where user_id = $1 and slot = 0', [A]);
  await db.query(`insert into public.player_skills (user_id, slot, skill_id, xp) select user_id, 1, skill_id, xp from public.player_skills where user_id = $1 and slot = 0
                    on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [A]);
  await asUser(db, B);
  okOf(await one(db, 'select public.hr_character_name_set(0, $1, $2::uuid)', ['Wsc Other', idem()]), 'the name');
  await asUser(db, A);
  okOf(await one(db, 'select public.hr_hunt_party_invite_own(0, 1, $1::uuid)', [idem()]), 'the own invite');
  const party = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [A]);
  await db.query('update public.hunt_parties set hunt_id = $2 where id = $1', [party, HUNT]);
  okOf(await one(db, 'select public.hr_hunt_party_list(0, true, $1::uuid)', [idem()]), 'the listing');
  await asUser(db, B);
  okOf(await one(db, 'select public.hr_hunt_party_join(0, $1::uuid, $2::uuid)', [party, idem()]), 'the join');
  const sids = [];
  for (const [u, s] of [[A, 0], [A, 1], [B, 0]]) {
    await asUser(db, u);
    sids.push(okOf(await one(db, 'select public.hr_hunt_enter($1, $2, $3::jsonb, 0, null, $4::uuid)', [s, HUNT, bag, idem()]), 'the enter').session.id);
  }
  await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  /* THE START: 5 s past a 30 s mark of the server clock, ten minutes ago (every window is in the past). */
  const t0 = Number(await one(db, `select (floor(extract(epoch from now() - interval '10 minutes') / 30) * 30 + 5)::bigint`));
  await db.query(`update public.hunt_sessions set entered_at = to_timestamp($2) - interval '1 minute', hunt_from = to_timestamp($2), settled_to = to_timestamp($2),
                    next_swing_at = to_timestamp($2) where id = any($1::uuid[])`, [sids, t0]);
  const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sids[0]]);
  if ((await q(db, 'select 1 from public.hunt_sessions where instance_id = $1 and ended_at is null', [inst])).length !== 3) throw new Error('the party is not one instance of three');
  await db.query('update public.hunt_instances set settled_to = to_timestamp($2), next_swing_at = to_timestamp($2) where id = $1', [inst, t0]);
  await db.query('commit');
  const topic = async (u, s) => one(db, 'select public.hr_frame_topic($1::uuid, $2::int)', [u, s]);
  return { inst, sids, fromMs: t0 * 1000, topics: { a0: await topic(A, 0), a1: await topic(A, 1), b0: await topic(B, 0) } };
}

/* Does window k (1-based, 18 s each, from the start) cross a multiple of `n` seconds? */
const crosses = (F, k, n) => Math.floor((F.fromMs + (k - 1) * WIN) / 1000 / n) !== Math.floor((F.fromMs + k * WIN) / 1000 / n);

async function frames(db, F) {
  const r = await q(db, 'select topic, count(*)::int as n from realtime.bench_frames group by 1');
  const of = (t) => (r.find((x) => x.topic === t) || { n: 0 }).n;
  return { a0: of(F.topics.a0), a1: of(F.topics.a1), b0: of(F.topics.b0) };
}

/* `windows` windows at the dial: the asker's own settle each (the hunt viewed), or the world tick's fire (asker null). */
async function run(db, M, F, o) {
  await db.query('update public.hr_tick_config set frame_own_s = $1 where id', [o.dial]);
  await db.query(`insert into public.character_presence (user_id, slot, seen_at) values ($1, 0, now()), ($1, 1, now()), ($2, 0, now())
                    on conflict (user_id, slot) do update set seen_at = excluded.seen_at`, [A, B]);
  const out = { sent: [], answers: [] };
  const win = o.win || WIN;
  for (let w = 1; w <= o.windows; w++) {
    const n0 = await frames(db, F);
    if (o.asker) {
      const v = await M.HS.settleHunt({ exec: execAs(db, o.asker), user: o.asker[0], slot: o.asker[1], mode: 'settle', bucket: null, project: true, live: true, atMs: F.fromMs + w * win });
      if (v.outcome !== 'paid' || !v.body || !v.body.state) throw new Error(`window ${w}: the asker's settle answered ${v.outcome} / ${v.reason}`);
      out.answers.push(JSON.stringify(v.body));
    } else {
      const open = await q(db, 'select id, user_id, slot from public.hunt_sessions where instance_id = $1 and ended_at is null order by user_id, slot', [F.inst]);
      const r = (await M.TK.runTick({ exec: execAs(db, null), atMs: F.fromMs + w * win,
        body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: win, hunts: open.map((s) => ({ user_id: s.user_id, slot: s.slot, session_id: s.id })) } })).body;
      if (!r.hunts || r.hunts.settled < 1) throw new Error(`window ${w}: the fire settled nothing: ${JSON.stringify(r.hunts || r)}`);
    }
    const n1 = await frames(db, F);
    out.sent.push({ a0: n1.a0 - n0.a0, a1: n1.a1 - n0.a1, b0: n1.b0 - n0.b0 });
  }
  return out;
}

/* Every row of every table that names a player, and the instance: what the commits wrote. */
async function rowsOf(db, F) {
  const tables = (await q(db, `select c.table_name as t from information_schema.columns c join information_schema.tables b
      on b.table_schema = c.table_schema and b.table_name = c.table_name and b.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'user_id' order by 1`)).map((r) => r.t);
  const out = {};
  for (const t of tables) {
    out[t] = (await q(db, `select to_jsonb(x)::text as r from public."${t}" x where x.user_id in ($1::uuid, $2::uuid) order by 1`, [A, B])).map((r) => r.r);
  }
  out.hunt_instances = (await q(db, 'select to_jsonb(x)::text as r from public.hunt_instances x where id = $1', [F.inst])).map((r) => r.r);
  out['realtime.bench_frames (the stranger\'s)'] = (await q(db, 'select payload::text as r from realtime.bench_frames where topic = $1 order by n', [F.topics.b0])).map((r) => r.r);
  return out;
}
const seqState = (db) => q(db, `select schemaname as s, sequencename as n, last_value::text as v from pg_sequences where schemaname in ('public', 'realtime')`);
async function seqRestore(db, st) {
  for (const r of st) {
    const start = await one(db, 'select start_value::text from pg_sequences where schemaname = $1 and sequencename = $2', [r.s, r.n]);
    await db.query(`select setval('"${r.s}"."${r.n}"', $1::bigint, $2::boolean)`, [r.v === null ? start : r.v, r.v !== null]);
  }
}

/* One arm in its own transaction, the server clock held (pinDice's hr.test_now), rolled back. */
async function arm(db, fn) {
  await db.query('begin');
  try {
    await db.query(`select set_config('hr.test_now', transaction_timestamp()::text, true)`);
    return await fn();
  } finally { await db.query('rollback'); }
}

const pattern = (sent, k) => sent.map((s) => s[k]).join('');

const ARMS = {
  async 'DIAL-0'(db, M, F) {
    const p = [];
    const r = await arm(db, () => run(db, M, F, { dial: 0, asker: [A, 0], windows: 6 }));
    if (pattern(r.sent, 'a1') !== '111111') p.push(`at the shipped dial (0) the asker's own off-screen hero got ${pattern(r.sent, 'a1')} frame(s) over six commits, not one each`);
    if (pattern(r.sent, 'b0') !== '111111') p.push(`at the shipped dial the stranger got ${pattern(r.sent, 'b0')}, not one each`);
    if (pattern(r.sent, 'a0') !== '000000') p.push(`the asker's own echo was sent: ${pattern(r.sent, 'a0')}`);
    return p;
  },
  async 'DIAL-30'(db, M, F) {
    const p = [];
    const want = [1, 2, 3, 4, 5, 6].map((k) => (crosses(F, k, 30) ? 1 : 0)).join('');
    if (want !== '010110') return ['CONTROL: the windows do not cross the marks this arm was written for: ' + want];
    const two = await arm(db, async () => {
      const seq = await seqState(db);
      await db.query('savepoint wsc');
      const a = await run(db, M, F, { dial: 0, asker: [A, 0], windows: 6 });
      const ra = await rowsOf(db, F);
      await db.query('rollback to savepoint wsc');
      await seqRestore(db, seq);
      const b = await run(db, M, F, { dial: 30, asker: [A, 0], windows: 6 });
      return { a, b, ra, rb: await rowsOf(db, F) };
    });
    if (pattern(two.b.sent, 'a1') !== want) p.push(`with the dial at 30 the asker's own off-screen hero got ${pattern(two.b.sent, 'a1')} over six 18 s commits; the marks are crossed in ${want}`);
    if (pattern(two.b.sent, 'b0') !== '111111') p.push(`with the dial at 30 the stranger got ${pattern(two.b.sent, 'b0')}: another account's member was held`);
    if (pattern(two.b.sent, 'a0') !== '000000') p.push('the asker was framed');
    for (let i = 0; i < 6; i++) if (two.a.answers[i] !== two.b.answers[i]) { p.push(`the asker's answer to commit ${i + 1} differs between dial 0 and dial 30`); break; }
    let kills = 0;
    for (const t of Object.keys(two.ra)) {
      if (t === 'hr_rate_counters') continue;
      if (JSON.stringify(two.ra[t]) !== JSON.stringify(two.rb[t])) {
        const i = two.ra[t].findIndex((x, j) => x !== two.rb[t][j]);
        p.push(`${t}: the rows six commits left differ between dial 0 and dial 30 (${two.ra[t].length} vs ${two.rb[t].length} rows; first: ${String(two.ra[t][i]).slice(0, 160)} | ${String(two.rb[t][i]).slice(0, 160)})`);
      }
    }
    for (const r of two.ra.player_ledger || []) { const j = JSON.parse(r); if (j.kind === 'combat') kills += Number((j.meta && j.meta.kills) || 0); }
    if (!(kills > 0) || !(two.ra.player_ledger || []).length) p.push('CONTROL: six windows journalled no kill, so "identical rows" compared nothing');
    return p;
  },
  async OTHER(db, M, F) {
    const r = await arm(db, () => run(db, M, F, { dial: 30, asker: [B, 0], windows: 3 }));
    const p = [];
    if (pattern(r.sent, 'a0') !== '111' || pattern(r.sent, 'a1') !== '111') p.push(`a stranger's settle framed A's heroes ${pattern(r.sent, 'a0')} and ${pattern(r.sent, 'a1')}, not every commit: the hold reached another account's ask`);
    if (pattern(r.sent, 'b0') !== '000') p.push('the asking stranger was framed');
    return p;
  },
  async TICK(db, M, F) {
    const r = await arm(db, () => run(db, M, F, { dial: 30, asker: null, windows: 2, win: 90000 }));
    return ['a0', 'a1', 'b0'].filter((k) => pattern(r.sent, k) !== '11').map((k) => `the world tick's settle framed ${k} ${pattern(r.sent, k)} over two fires, not once each`);
  },
  async END(db, M, F) {
    /* 45 s of stamina from the start: the hunt ends inside window 3 (36 to 54 s in, between the marks at 25 and 55). */
    if (crosses(F, 3, 30) || crosses(F, 1, 30)) return ['CONTROL: window 3 crosses a mark'];
    return arm(db, async () => {
      await db.query('update public.player_state set stamina_ms = 45000, stamina_at = to_timestamp($2) where user_id = $1 and slot = 1', [A, F.fromMs / 1000]);
      const r = await run(db, M, F, { dial: 30, asker: [A, 0], windows: 3 });
      const s = (await q(db, `select end_reason, floor(extract(epoch from ended_at) * 1000)::bigint as at from public.hunt_sessions where id = $1`, [F.sids[1]]))[0];
      const p = [];
      if (!s || s.end_reason !== 'stamina' || !(Number(s.at) > F.fromMs + 2 * WIN && Number(s.at) <= F.fromMs + 3 * WIN)) return [`CONTROL: the off-screen hero's hunt did not end on stamina inside window 3: ${JSON.stringify(s)}`];
      /* 45 s of stamina is already low: the window that says so is news too (the strip's alert), and goes at once */
      const low = await q(db, `select floor(extract(epoch from at) * 1000)::bigint as at from public.hunt_session_events where session_id = $1 and type = 'stamina_low'`, [F.sids[1]]);
      const lowIn = low.length ? Math.ceil((Number(low[0].at) - F.fromMs) / WIN) : 0;
      if (lowIn >= 1 && lowIn <= 3 && r.sent[lowIn - 1].a1 !== 1) p.push(`the commit that wrote the off-screen hero's low stamina (window ${lowIn}) sent it ${r.sent[lowIn - 1].a1} frame(s)`);
      if (lowIn !== 1 && r.sent[0].a1 !== 0) p.push('CONTROL: window 1 (no mark, no news) was not held');
      if (r.sent[2].a1 !== 1) p.push(`the commit in which the off-screen hero's hunt ended sent it ${r.sent[2].a1} frame(s): its end waited for a mark`);
      const f = (await q(db, 'select payload from realtime.bench_frames where topic = $1 order by n desc limit 1', [F.topics.a1]))[0];
      const h = f && f.payload && f.payload.env && f.payload.env.hunt;
      if (r.sent[2].a1 === 1 && h && h.ended !== true && typeof h.session_id === 'string') p.push('the frame sent at the end still shows the hunt open: ' + JSON.stringify(h).slice(0, 160));
      if (r.sent[2].a1 === 1 && !(f && f.payload && f.payload.t === 'state')) p.push('the one push at the end was not the state frame: ' + JSON.stringify(f && f.payload).slice(0, 120));
      return p;
    });
  },
  async LEVEL(db, M, F) {
    if (crosses(F, 1, 30)) return ['CONTROL: window 1 crosses a mark'];
    return arm(db, async () => {
      await db.query('update public.player_state set level_xp = $2 where user_id = $1 and slot = 1', [A, M.XP.charXpForLevel(21) - 1]);
      const r = await run(db, M, F, { dial: 30, asker: [A, 0], windows: 1 });
      const ev = await q(db, `select 1 from public.hunt_session_events where session_id = $1 and type = 'level_up' and data->>'skill' = 'level'`, [F.sids[1]]);
      if (!ev.length) return ['CONTROL: one kill short of Level 21, the off-screen hero did not rise in window 1'];
      return r.sent[0].a1 === 1 ? [] : [`the commit in which the off-screen hero's Level rose sent it ${r.sent[0].a1} frame(s): its Level waited for a mark`];
    });
  },
  async ONCE(db, M, F) {
    const p = [];
    for (const [who, asker, win, windows, nudged] of [["the asker's own settle", [A, 0], WIN, 3, 'a0'], ["the world tick's settle", null, 90000, 1, null]]) {
      /* 45 s of stamina each from the start: every hunt ends in the last window (the asker's third, the tick's first). */
      const r = await arm(db, async () => {
        for (const [u, s] of [[A, 0], [A, 1], [B, 0]]) {
          await db.query('update public.player_state set stamina_ms = 45000, stamina_at = to_timestamp($3) where user_id = $1 and slot = $2', [u, s, F.fromMs / 1000]);
        }
        const out = await run(db, M, F, { dial: 0, asker, windows, win });
        const ended = await q(db, 'select end_reason, floor(extract(epoch from ended_at) * 1000)::bigint as at from public.hunt_sessions where id = any($1::uuid[])', [F.sids]);
        const msgs = await q(db, 'select topic, payload from realtime.bench_frames order by n');
        return { out, ended, msgs };
      });
      const last = (windows - 1) * win;
      if (r.ended.length !== 3 || r.ended.some((e) => e.end_reason !== 'stamina' || !(Number(e.at) > F.fromMs + last && Number(e.at) <= F.fromMs + windows * win))) {
        p.push(`CONTROL: ${who}: the three hunts did not all end on stamina in the last window: ${JSON.stringify(r.ended)}`); continue;
      }
      const end = r.out.sent[windows - 1];
      for (const k of ['a0', 'a1', 'b0']) {
        const mine = r.msgs.filter((m) => m.topic === F.topics[k]);
        const nudges = mine.filter((m) => m.payload && m.payload.t === 'nudge').length;
        const lastMsg = mine[mine.length - 1];
        if (end[k] !== 1) p.push(`${who}: the commit that ended ${k}'s hunt sent it ${end[k]} push(es), want exactly 1`);
        else if (k === nudged ? nudges !== 1 || lastMsg.payload.t !== 'nudge' : nudges !== 0 || lastMsg.payload.t !== 'state') {
          p.push(`${who}: ${k}'s one push at its end was ${JSON.stringify(lastMsg.payload).slice(0, 60)} (${nudges} nudge(s) in all), want ${k === nudged ? 'a nudge (the self-echo rule spares its frame)' : 'the state frame and no nudge'}`);
        }
      }
    }
    return p;
  },
  async FLOOR(db, M, F) {
    return arm(db, async () => {
      const p = [];
      await db.query(`insert into public.character_presence (user_id, slot, seen_at) values ($1, 0, now()) on conflict (user_id, slot) do update set seen_at = excluded.seen_at`, [A]);
      const ver = async () => Number(await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [A]));
      const ask = async (have) => {
        const seen = [];
        const v = await M.HS.settleHunt({ exec: execAs(db, [A, 0], seen), user: A, slot: 0, mode: 'settle', bucket: null, project: true, live: true, minWindowMs: 1e15, ...(have === undefined ? {} : { have }) });
        if (v.reason !== 'below_min_span' || !v.body || !v.body.hunt_live) throw new Error('the floor did not answer a start point: ' + JSON.stringify({ o: v.outcome, r: v.reason }));
        return { body: v.body, state: seen.filter((s) => /hr_state_of\(/.test(s)).length };
      };
      const v0 = await ver();
      const full = await ask(undefined);
      if (!full.body.state || full.body.version !== v0 || full.state !== 1 || full.body.hunt_slim) p.push('CONTROL: an ask that names no version did not get the whole character');
      const slim = await ask(v0);
      if (slim.body.state || slim.body.hunt_slim !== true || slim.body.version !== v0 || slim.state !== 0) p.push(`an ask holding the row's own version (${v0}) still got the character (state ${!!slim.body.state}, ${slim.state} hr_state_of statement(s))`);
      if (JSON.stringify(slim.body.hunt_live) !== JSON.stringify(full.body.hunt_live)) p.push('the slim answer\'s start point is not the full answer\'s');
      if (typeof slim.body.now !== 'string' || !Number.isFinite(Date.parse(slim.body.now))) p.push('the slim answer carries no server clock');
      for (const [have, why] of [[v0 - 1, 'behind'], [v0 + 1, 'ahead'], ['' + v0, 'a string'], [v0 + 0.5, 'a fraction'], [null, 'null']]) {
        const a = await ask(have);
        if (!a.body.state || a.body.version !== v0 || a.body.hunt_slim) p.push(`an ask holding a version ${why} (${JSON.stringify(have)}) did not get the whole character`);
      }
      /* THE BROWSER WAS CLOSED: the tick settles, the row moves; the client comes back holding the old version. */
      await run(db, M, F, { dial: 0, asker: null, windows: 1, win: 90000 });
      const v1 = await ver();
      const back = await ask(v0);
      if (!(v1 > v0)) p.push('CONTROL: the tick\'s settle did not move the version');
      if (!back.body.state || back.body.version !== v1) p.push(`after a settle the client never heard, an ask holding ${v0} was answered ${back.body.state ? 'version ' + back.body.version : 'no character'}: the client is left behind`);
      const now = await ask(v1);
      if (now.body.state || now.body.version !== v1) p.push('holding the new version, the answer was not slim');
      return p;
    });
  },
  async PERKS(db, M) {
    return arm(db, async () => {
      const p = [];
      await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value) values ($1, 0, 'stat', 'ev:kill_any', '', 40000)
                        on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value`, [A]);
      const renown = Number(await one(db, 'select public.hr_renown_of($1::uuid, 0)', [A]));
      const perks = await one(db, 'select public.hr_perks_of($1::uuid, 0)', [A]);
      if (!(renown >= 900)) return ['CONTROL: the probe hero scores ' + renown + ' renown (the old read priced nothing there either)'];
      if (!perks || perks.ok !== true || perks.renownAllXp !== 0) p.push('the perk read still prices renown: ' + JSON.stringify(perks && perks.renownAllXp));
      const PK = await import(pathToFileURL(join(M.root, 'src', 'core', 'perks.js')).href);
      const was = { ...perks, renownAllXp: 0.01 };
      if (JSON.stringify(PK.normalisePerkState(was)) !== JSON.stringify(PK.normalisePerkState(perks))) p.push('the engine prices a different stack from the old answer (renownAllXp 0.01) and the new (0)');
      return p;
    });
  },
};

function capArm() {
  const sql = readFileSync(join(H.ROOT, 'supabase', 'migrations', OWN), 'utf8');
  const m = /check \(frame_own_s between 0 and (\d+)\)/.exec(sql);
  const cfg = readFileSync(join(H.ROOT, 'src', 'session', 'config.js'), 'utf8');
  const poll = Number((/huntPollMs:\s*(\d+)/.exec(cfg) || [])[1]), unviewed = Number((/unviewedPollMs:\s*(\d+)/.exec(cfg) || [])[1]);
  if (!m || !poll || !unviewed) return ['CONTROL: the ceiling or the client\'s poll settings could not be read'];
  /* a held frame arrives within the ceiling plus one watched window (the poll and a 3 s answer) of the last one */
  return Number(m[1]) * 1000 + poll + 3000 < unviewed ? []
    : [`the dial may be set to ${m[1]} s: a held frame can arrive ${Number(m[1]) * 1000 + poll + 3000} ms after the last, past the client's ${unviewed} ms re-read of an unviewed hero (each would be an hr_load)`];
}

/* THE PLANTED DEFECTS: [name, the arm that must go red, the function, [find, replace] pairs], planted in the body that runs. */
const MUTANTS = [
  ['the hold ignores the dial (held at 0)', 'DIAL-0', HELD, [['  if coalesce(v_n, 0) <= 0 then return false; end if;\n', '  v_n := 30;\n']]],
  ['the hold ignores the marks (always held)', 'DIAL-30', HELD, [['\n     or floor(extract(epoch from p_from) / v_n) <> floor(extract(epoch from p_to) / v_n) then return false; end if;', ' then return false; end if;']]],
  ['the commit point never asks the hold', 'DIAL-30', INST, [['      continue when public.hr_frame_own_held(v_m, p_project_user, p_project_slot, v_i.settled_to, v_to);\n', '']]],
  ['the hold reaches another account\'s ask', 'OTHER', HELD, [['\n     or v_user <> p_project_user or v_slot = p_project_slot then return false; end if;', ' then return false; end if;']]],
  ['a hunt\'s end waits for a mark', 'END', HELD, [[' and h.ended_at is null) then', ') then'], ["e.type in ('rare_drop', 'death', 'ended', 'slot_dry', 'stamina_low')", "e.type in ('rare_drop')"]]],
  ['a Level waits for a mark', 'LEVEL', HELD, [[" or (e.type = 'level_up' and e.data->>'skill' = 'level')", '']]],
  /* 2027-04-10-own-hunt-nudge-once.sql: the settle guard on the open/close nudge. */
  ['an end inside a settle is nudged on top of its frame (two pushes)', 'ONCE', NUDGE,
    [["    if coalesce(current_setting('hr.frame_defer', true), '') <> '' and public.hr_frame_wanted(new.user_id, new.slot) then\n      return null;\n    end if;\n", '    null;\n']]],
  ['an end inside a settle is never nudged (the asker\'s other clients miss it)', 'ONCE', NUDGE,
    [[' and public.hr_frame_wanted(new.user_id, new.slot) then', ' then']]],
];
const EDGE_MUTANTS = [
  ['the floor answers slim at any version', 'FLOOR', 'hunt-settle.js', 'const held = Number.isSafeInteger(o.have) && o.have === Number(mine.state.version);', 'const held = Number.isSafeInteger(o.have);'],
  ['the floor never answers slim', 'FLOOR', 'hunt-settle.js', 'const held = Number.isSafeInteger(o.have) && o.have === Number(mine.state.version);', 'const held = false;'],
];

async function main() {
  const boot = PG ? await (await import('../tools/pg-replay.mjs')).bootPg() : await (await import('./schema-replay.mjs')).bootReplay();
  const db = boot.db;
  await H.pinDice(db);
  const M = await H.loadEdge(H.ROOT);
  const F = await fixture(db, M);
  await keep(db);
  let red = 0;
  const cap = capArm();
  for (const x of cap) { red++; console.error('  ✗ CAP: ' + x); }
  for (const [name, fn] of Object.entries(ARMS)) {
    const p = await fn(db, M, F);
    for (const x of p) { red++; console.error(`  ✗ ${name}: ${x}`); }
    if (!p.length) console.log('  ok ' + name);
  }
  if (red) { console.error(`watched-settle-cost: ${red} problem(s)`); process.exit(1); }
  if (MUTATE) {
    let missed = 0;
    for (const [name, armName, fn, pairs] of MUTANTS) {
      await db.query('begin');
      let caught = false, why = '';
      try {
        let def = (await one(db, `select pg_get_functiondef('${fn}'::regprocedure)`)).replace(/\r/g, '');
        for (const [a, b] of pairs) { if (def.split(a).length !== 2) throw new Error('HARNESS: the plant\'s anchor matched ' + (def.split(a).length - 1) + ' times'); def = def.replace(a, () => b); }
        await db.exec(def);
        await db.query('commit');
        const p = await ARMS[armName](db, M, F);
        caught = p.length > 0 && !p.every((x) => x.startsWith('CONTROL')); why = p[0] || '';
      } catch (e) { await db.query('rollback').catch(() => {}); if (/HARNESS/.test(String(e.message))) { console.error('  ! ' + name + ': ' + e.message); process.exit(2); } caught = false; why = 'threw: ' + String(e.message).split('\n')[0]; }
      /* the body back as the chain left it */
      await restore(db, fn);
      console.log(`  ${caught ? '✓ caught' : '✗ MISSED'} [${armName}] ${name}${caught ? '' : ' (' + why + ')'}`);
      if (!caught) missed++;
    }
    for (const [name, armName, file, a, b] of EDGE_MUTANTS) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-wsc-'));
      for (const d of [['supabase', 'functions', 'hr-accrue'], ['src', 'core'], ['src', 'data']]) cpSync(join(H.ROOT, ...d), join(dir, ...d), { recursive: true });
      cpSync(join(H.ROOT, 'src', 'build-info.js'), join(dir, 'src', 'build-info.js'));
      const f = join(dir, 'supabase', 'functions', 'hr-accrue', file);
      const src = readFileSync(f, 'utf8');
      if (src.split(a).length !== 2) { console.error('  ! ' + name + ': the plant\'s anchor matched ' + (src.split(a).length - 1) + ' times'); process.exit(2); }
      writeFileSync(f, src.replace(a, () => b));
      const p = await ARMS[armName](db, await H.loadEdge(dir), F);
      const caught = p.length > 0 && !p.every((x) => x.startsWith('CONTROL'));
      console.log(`  ${caught ? '✓ caught' : '✗ MISSED'} [${armName}] ${name}`);
      if (!caught) missed++;
    }
    if (missed) { console.error(`watched-settle-cost --mutate: ${missed} planted defect(s) not caught`); process.exit(1); }
  }
  console.log('watched-settle-cost: OK — at the shipped dial every frame goes as before; at 30 only the asker\'s own off-screen hero waits for a mark, its end and its Level never; '
    + 'the rows and the asker\'s answers are identical; an end is one push (the frame, or a nudge where the frame spares the asker); the floor answers slim only at the held version' + (MUTATE ? `; ${MUTANTS.length + EDGE_MUTANTS.length} planted defects caught.` : '.'));
  process.exit(0);
}

/* The two bodies as the chain left them, kept at boot and put back after each plant. */
const KEPT = new Map();
async function restore(db, fn) { await db.exec(KEPT.get(fn)); }
async function keep(db) { for (const fn of [HELD, INST, NUDGE]) KEPT.set(fn, (await one(db, `select pg_get_functiondef('${fn}'::regprocedure)`)).replace(/\r/g, '')); }

main().catch((e) => { console.error('harness: ' + ((e && e.stack) || e)); process.exit(2); });
