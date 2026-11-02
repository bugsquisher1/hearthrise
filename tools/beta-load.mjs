#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/beta-load.mjs — THE BETA'S WORST HOUR, REPLAYED: real chain, real engine, real concurrency, PostgreSQL 17.
//   (lane/r-beta-load, reliability-engineer, 2026-11-01.) Load-test only; nothing imports it; never touches production.
//
//   node tools/beta-load.mjs --accounts=20 [--heroes=4] [--minutes=5] [--party=0.4] [--town=0.25] [--workers=2] [--idle-accounts=80] [--warm=240]
//                            [--drill=tick-stop|edge-5xx|retry] [--json=out.json]
//   node tools/beta-load.mjs --selftest     the conservation audit, proved to bite on planted double pay and lost time
//
// WHY THIS AND NOT tools/load-probe.mjs. load-probe's model multiplies ONE measured settle; settle-cost measures one
// instance in series. This runs the whole population at once on a real server: hr_tick_cron_run's real roster and leases,
// the shipped tick.js and hunt-settle.js against a connection pool the size of production's, each viewed hero's hello on
// the client's cadence, unviewed reads, social, chat and market reads, and the cron jobs on their production schedules.
//
// THE SERVER. A scratch cluster shaped like Small, started by the caller (shared_buffers 512MB, 90 connections,
// pg_stat_statements loaded, full_page_writes on so the WAL volume is honest; fsync off, because a DROP DATABASE's forced
// checkpoint took 4+ min on this PC's disk and a commit's fsync here says nothing about gp3), reached through
// tools/pg-replay.mjs's HR_PG_PORT / HR_PG_DATA / HR_PG_BIN. Its CPU is NOT Small's, and not by one factor: a hash statement
// ran 1.5x slower on production than on the Windows bench, a jsonb one 7x FASTER (11-02). So the bench gives the COUNTS,
// the concurrency and the bytes; Small's CPU is those counts x production's own pg_stat_statements means.
//
// WHAT IT CANNOT SEE: Deno isolate limits and cold starts, the pooler's own latency, Realtime's fan-out (realtime.send is
// a recording stub; the bytes are real), and network RTT. Those are modeled and named in the report.
//
// A run ends with THE AUDIT: every session's journalled window ms == its clock's move (nothing lost or paid twice), every
// tally == its ledger, no intent id twice. A drill passes only if the audit is clean and the lag came back.
// Exit: 0 audit clean · 1 audit red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import postgres from 'postgres';

const PORT = Number(process.env.HR_PG_PORT || 55417);
const DATA = process.env.HR_PG_DATA || '';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };

/* tools/pg-replay.mjs's value parsing, so the shipped edge reads the values it reads there. */
const TYPES = {
  json: { to: 114, from: [114, 3802], serialize: (x) => (typeof x === 'string' ? x : JSON.stringify(x)), parse: (x) => JSON.parse(x) },
  int8: { to: 20, from: [20], serialize: (x) => String(x),
    parse: (x) => { const b = BigInt(x); return b < BigInt(Number.MIN_SAFE_INTEGER) || b > BigInt(Number.MAX_SAFE_INTEGER) ? b : Number(b); } },
};
const connect = (database, max) => postgres({ host: '127.0.0.1', port: PORT, user: 'postgres', database, max, prepare: false,
  onnotice: () => {}, types: TYPES, idle_timeout: 0, connection: { application_name: 'hr-beta-load', TimeZone: 'UTC' } });

/* THE CLIENT'S CADENCES, from the code that sends them (src/session/config.js, src/data/chat-channels.js,
   src/data/town-presence.js, src/shell/market-watch.js). */
const C = {
  huntPollMs: 16000,      // a viewed hunt's landed settle
  earlyAsksPerPoll: 0.6,  // live-view start-point asks; the pacer's cap is 6 asks a minute a character (6 x 16/60 = 1.6)
  unviewedPollMs: 60000,  // hr_load for each hunting hero not on screen
  socialPollMs: 30000,    // hr_social_poll
  townPollMs: 2000,       // hr_town_view while a town is drawn (TOWN_PRESENCE.pollMs; 6 s at rest)
  townMoveMs: 8000,       // hr_town_move, a walker who walks about half the time
  marketReadMs: 60000,    // a market browse + market_mine a minute (ASSUMED: market open on every page)
  chatLineMs: 120000,     // a chat line every two minutes an account (ASSUMED: a lively beta)
};

/* ── THE WORKER: one or more "edges and browsers", each owning some accounts ─────────────────────────────────────────── */
async function workerMain() {
  const { dbName, enginePool, restPool, accounts, root } = workerData;
  const u = (p) => new URL(`file:///${join(root, p).replace(/\\/g, '/')}`).href;
  const TK = await import(u('supabase/functions/hr-accrue/tick.js'));
  const HS = await import(u('supabase/functions/hr-accrue/hunt-settle.js'));
  const engine = connect(dbName, enginePool);
  const rest = connect(dbName, restPool);
  const stats = new Map();
  const stat = (k) => { let s = stats.get(k); if (!s) { s = { n: 0, wall: [], queue: 0, db: 0, bytes: 0, errors: 0, engine: 0 }; stats.set(k, s); } return s; };
  const mode = { edge: 'ok', retry: 0 };
  let live = false;
  const log = (s, wall, bytes) => { s.n++; if (s.wall.length < 20000) s.wall.push(wall); s.bytes += bytes || 0; };
  const JSONLEN = (x) => { try { return JSON.stringify(x).length; } catch { return 0; } };

  /* index.ts's exec: one transaction a statement, on the pool, role hr_engine, the frame-self marker if a player asked. */
  const execOf = (s, marker) => async (text, params) => {
    const t0 = performance.now(); let t1 = t0;
    const rows = await engine.begin(async (tx) => {
      t1 = performance.now(); s.queue += t1 - t0;
      await tx.unsafe('set local role hr_engine');
      if (marker) await tx.unsafe(`select set_config('hr.frame_self', '${marker}', true)`);
      return tx.unsafe(text, params || []);
    });
    s.db += performance.now() - t1;
    return Array.from(rows);
  };
  /* A PostgREST call: its pre-request (role, claims, hr_access_check), then the RPC. */
  const rpc = async (kind, uid, text, params) => {
    const s = stat(kind); const t0 = performance.now();
    try {
      const rows = await rest.begin(async (tx) => {
        const t1 = performance.now(); s.queue += t1 - t0;
        await tx.unsafe(`select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true)`, [uid]);
        await tx.unsafe('select public.hr_access_check()');
        const r = await tx.unsafe(text, params || []);
        s.db += performance.now() - t1;
        return r;
      });
      log(s, performance.now() - t0, JSONLEN(rows[0]));
      return rows[0];
    } catch (e) { s.errors++; s.last = String(e.message).slice(0, 160); return null; }
  };

  /* ONE EDGE INVOCATION with the drill's faults. 'fail': the function never ran. 'lost': it ran and the answer was lost
     (the caller sees a 5xx, the commit stands). retry: delivered 1 + n times at once. */
  const invoke = async (kind, fn) => {
    const s = stat(kind); const t0 = performance.now();
    if (mode.edge === 'fail') { s.errors++; s.n5xx = (s.n5xx || 0) + 1; return null; }
    if (mode.edge === 'mixed' && Math.random() < 0.5) { s.errors++; s.n5xx = (s.n5xx || 0) + 1; return null; }
    const lost = mode.edge === 'mixed' && Math.random() < 0.5;
    try {
      const runs = [fn(s)];
      for (let i = 0; i < mode.retry; i++) runs.push(fn(stat(kind + ':retry')));
      const [out] = await Promise.all(runs);
      log(s, performance.now() - t0, JSONLEN(out));
      if (lost) { s.lost = (s.lost || 0) + 1; return null; }
      return out;
    } catch (e) { s.errors++; s.last = String(e.message).slice(0, 200); return null; }
  };

  /* A BROWSER'S HELLO: index.ts's accrue read, statement for statement (tools/settle-cost.mjs restates it; SB-0 pins it),
     the seed read, then the settle. minWindowMs: an early ask, answered below the floor. */
  const hello = (a, early) => invoke(early ? 'hello_early' : 'hello', async (s) => {
    const marker = `${a.uid.toLowerCase()}:${a.viewed}`;
    const x = execOf(s, marker);
    await x(`select public.hr_rate_gate($1::uuid, $2::int, 'accrue:' || $2::text) as allowed`, [a.uid, a.viewed]);
    await x('select public.hr_accrue_read($1::uuid, $2::int) as state, public.hr_accrue_cap_ms($1::uuid, $2::int) as cap_ms, now() as now', [a.uid, a.viewed]);
    await x('select monster_id, kills from public.hr_bestiary_of($1::uuid, $2::int)', [a.uid, a.viewed]);
    await x('select monster_id, stage from public.hr_trophy_of($1::uuid, $2::int)', [a.uid, a.viewed]);
    await x('select public.hr_hunt_open_of($1::uuid, $2::int) as session', [a.uid, a.viewed]);
    await x('select count(*)::int as n from public.hr_collection_of($1::uuid, $2::int)', [a.uid, a.viewed]);
    await x(`select (public.hr_seed($1::uuid, $2::int, $3) & 4294967295)::bigint as seed,
             public.hr_seed($1::uuid, $2::int, $4)::text as salt, public.hr_perks_of($1::uuid, $2::int) as perks`, [a.uid, a.viewed, 'accrue:x', 'intent:accrue:x']);
    const t = performance.now();
    const v = await HS.settleHunt({ exec: x, user: a.uid, slot: a.viewed, mode: 'settle', bucket: null, project: true, live: true,
      ...(early ? { minWindowMs: 1e15 } : {}) });
    s.settle = (s.settle || 0) + performance.now() - t;
    s.outcomes = s.outcomes || {}; s.outcomes[v.outcome + (v.reason ? ':' + v.reason : '')] = (s.outcomes[v.outcome + (v.reason ? ':' + v.reason : '')] || 0) + 1;
    return v.body;
  });

  const market = (a) => invoke('market', async (s) => {
    const x = execOf(s, null);
    const [b] = await x(`select public.hr_market_browse($1::uuid, $2::int, $3::text::text[], $4::text, $5::int) as res`, [a.uid, a.viewed, null, null, 50]);
    const [m] = await x('select public.hr_market_mine($1::uuid, $2::int) as res', [a.uid, a.viewed]);
    return [b, m];
  });

  const timers = [];
  const every = (ms, fn) => {
    const start = Math.random() * ms;
    timers.push(setTimeout(() => {
      if (!live) return;
      fn();
      timers.push(setInterval(() => { if (live) fn(); }, ms));
    }, start));
  };
  function startBrowsers() {
    live = true;
    for (const a of accounts) {
      if (!a.online) continue;
      if (a.kind === 'town') {
        let cursor = null;
        every(C.townPollMs, async () => {
          const r = await rpc('town_view', a.uid, 'select public.hr_town_view(p_slot => $1::int, p_map => $2::text, p_cx => 0, p_cy => 0, p_cursor => $3::bigint, p_pcx => 0, p_pcy => 0) as r', [a.viewed, a.map, cursor]);
          if (r && r.r && Number.isSafeInteger(r.r.cursor)) cursor = r.r.cursor;
        });
        every(C.townMoveMs, () => rpc('town_move', a.uid, `select public.hr_town_move(p_slot => $1::int, p_map => $2::text, p_x => 10, p_y => 10, p_gx => 12, p_gy => 12, p_dir => 'e') as r`, [a.viewed, a.map]));
      } else {
        every(C.huntPollMs, () => hello(a, false));
        every(C.huntPollMs / C.earlyAsksPerPoll, () => hello(a, true));
      }
      for (const slot of a.slots) {
        if (slot === a.viewed) continue;
        every(C.unviewedPollMs, () => rpc('hr_load', a.uid, 'select public.hr_load(p_slot => $1::int) as r', [slot]));
      }
      every(C.socialPollMs, () => rpc('social_poll', a.uid, 'select public.hr_social_poll(p_slot => $1::int, p_slots => $2::int[]) as r', [a.viewed, a.slots]));
      every(C.marketReadMs, () => market(a));
      every(C.chatLineMs, () => rpc('chat_send', a.uid, `select public.hr_chat_send(p_slot => $1::int, p_kind => 'global', p_body => $2::text) as r`, [a.viewed, 'hello from the replay']));
    }
  }
  const body = (b) => invoke('tick_body', async (s) => {
    const t0 = performance.now();
    const r = (await TK.runTick({ exec: execOf(s, null), body: b })).body;
    s.walls = s.walls || []; s.walls.push(performance.now() - t0);
    if (r && r.hunts) {
      const h = r.hunts;
      s.settled = (s.settled || 0) + (h.settled || 0); s.nothing = (s.nothing || 0) + (h.nothing || 0);
      s.refused = (s.refused || 0) + (h.refused || 0); s.ended = (s.ended || 0) + (h.ended || 0); s.deferred = (s.deferred || 0) + (h.deferred || 0);
      s.engine += h.engine_ms || 0; s.engineMax = Math.max(s.engineMax || 0, h.engine_ms || 0); s.engineRunMax = Math.max(s.engineRunMax || 0, h.engine_max_ms || 0);
      for (const [k, v] of Object.entries(h.reasons || {})) { s.reasons = s.reasons || {}; s.reasons[k] = (s.reasons[k] || 0) + v; }
    }
    return { summary: r && r.hunts };
  });

  parentPort.on('message', async (m) => {
    if (m.t === 'start') startBrowsers();
    else if (m.t === 'body') { await body(m.body); parentPort.postMessage({ t: 'done', id: m.id }); }
    else if (m.t === 'mode') Object.assign(mode, m.mode);
    else if (m.t === 'reset') stats.clear();
    else if (m.t === 'stop') {
      live = false; for (const x of timers) { clearTimeout(x); clearInterval(x); }
      await new Promise((r) => setTimeout(r, 3000));
      parentPort.postMessage({ t: 'stats', cpu: process.cpuUsage(), stats: Array.from(stats.entries()) });
      await Promise.all([engine.end({ timeout: 5 }), rest.end({ timeout: 5 })]);
      process.exit(0);
    }
  });
  parentPort.postMessage({ t: 'ready' });
}

/* ── THE AUDIT: nothing lost, nothing paid twice ──────────────────────────────────────────────────────────────────────── */
const PURSE = 5000000;
const purseBase = async (sql) => new Map((await sql.unsafe(`select w.user_id, w.gold::bigint as gold,
    (select coalesce(sum(l.gold), 0) from public.player_ledger l where l.user_id = w.user_id and l.intent is distinct from 'beta_load_fill')::bigint as moved
  from public.account_wallet w where w.user_id in (select user_id from public.hunt_sessions)`)).map((p) => [p.user_id, { gold: Number(p.gold), moved: Number(p.moved) }]));
async function auditSessions(sql, fromBySession, base) {
  const rows = await sql.unsafe(`
    select h.id, h.instance_id, floor(extract(epoch from h.settled_to) * 1000)::bigint as to_ms,
      floor(extract(epoch from h.hunt_from) * 1000)::bigint as from_ms,
      (select coalesce(sum((l.meta->>'ms')::bigint), 0) from public.player_ledger l where l.session_id = h.id and l.kind = 'combat' and l.intent = 'accrue') as ms,
      (select count(*) from public.player_ledger l where l.session_id = h.id and l.kind = 'combat' and l.intent = 'accrue') as windows,
      (select coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::int else 0 end), 0) from public.player_ledger l where l.session_id = h.id) as lkills,
      (select coalesce(sum(case when l.kind <> 'hunt' then l.gold else 0 end), 0) from public.player_ledger l where l.session_id = h.id) as lcoins,
      t.kills as tkills, t.coins as tcoins
    from public.hunt_sessions h left join public.hunt_session_tally t on t.session_id = h.id`);
  const red = [];
  let windows = 0;
  for (const r of rows) {
    windows += Number(r.windows);
    const from = fromBySession && fromBySession.get(r.id) !== undefined ? fromBySession.get(r.id) : Number(r.from_ms);
    if (Number(r.ms) !== Number(r.to_ms) - from) red.push(`session ${String(r.id).slice(-6)}: journalled ${r.ms} ms for a clock that moved ${Number(r.to_ms) - from} ms`);
    if (Number(r.tkills ?? 0) !== Number(r.lkills) || Number(r.tcoins ?? 0) !== Number(r.lcoins)) red.push(`session ${String(r.id).slice(-6)}: tally ${r.tkills}/${r.tcoins} != ledger ${r.lkills}/${r.lcoins}`);
  }
  /* THE PURSE: every coin the account's wallet moved since the baseline is a ledger row. */
  const purse = await purseBase(sql);
  if (base) for (const [u, p] of purse) {
    const b = base.get(u);
    if (!b) continue;
    if (p.gold - b.gold !== p.moved - b.moved) red.push(`purse ${String(u).slice(-6)}: ${p.gold - b.gold} moved, the ledger says ${p.moved - b.moved}`);
  }
  return { red, sessions: rows.length, windows, purses: purse.size };
}

/* ── THE MAIN: the world, the crons, the clock ─────────────────────────────────────────────────────────────────────────── */
const nowMs = () => performance.now();
const pct = (a, q) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]; };
const uidOf = (i) => `00000000-0000-4000-8000-${(0xbe7a0000 + i).toString(16).padStart(12, '0')}`;

async function buildWorld(db, { accounts, heroes, partyShare, townShare, online, idleAccounts }) {
  const H = (await import('../tests/hunt-sessions-settle.mjs')).HARNESS;
  const M = await H.loadEdge(H.ROOT);
  const { SHIM_CRYPTO, SHIM_VAULT, SHIM_NET } = await import('../tests/world-tick-token-shims.mjs');
  const one = async (t, p) => { const r = (await db.query(t, p)).rows[0]; return r ? Object.values(r)[0] : undefined; };
  await db.exec(SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
  await db.exec(`create schema if not exists realtime;
    create table if not exists realtime.bench_frames (n bigserial primary key, topic text, event text, payload jsonb, at timestamptz default now());
    create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
      language sql as $f$ insert into realtime.bench_frames (topic, event, payload) values (topic, event, payload) $f$;`);
  await db.query(`update public.hr_hunt_config set enabled = true where id`);
  await db.query(`update public.hr_tick_config set enabled = true, flush_seconds = 90, cadence_seconds = 10, batch_limit = 200, lease_ms = 30000,
    shards = 1, fold_windows = 1, catchup_windows = 1, hunt_body_max = 4, hunt_bodies_max = 32, frame_push = true,
    edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue' where id`);
  const kit = { inv: { cooked_shrimp: 400 }, bag: [{ item: 'cooked_shrimp', qty: 300 }] };
  const stacks = (await db.query(`select item_id from public.hr_items order by item_id limit 60`)).rows.map((r) => r.item_id);
  const grounds = (await db.query('select hunt_id from public.hr_hunt_grounds')).rows.map((r) => r.hunt_id);
  const partyGround = grounds.includes('millrace_sewer') ? 'millrace_sewer' : grounds[0];
  const soloGround = grounds.includes('meadowbrook_thicket') ? 'meadowbrook_thicket' : (grounds.find((g) => /thicket/.test(g)) || grounds[0]);
  const out = [];
  const townMap = (await db.query('select map_id from public.hr_town_maps order by map_id limit 1')).rows[0]?.map_id || 'town';
  const asUser = (uid) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  const levelXp = M.XP.charXpForLevel(20);
  const skillXp = Object.fromEntries(['melee', 'ranged', 'magic', 'defense'].map((k) => [k, M.XP.skillXpForLevel(k, 20)]));
  const nameOf = (i, s) => 'Bench' + String(i).split('').map((d) => 'abcdefghij'[Number(d)]).join('') + 'wxyz'[s];
  const refused = {};
  /* Extra slots are bought with gold in play: on this scratch clone they are starters while the fixture builds; an existing
     character then owns its slot (hr_hero_slots_of's grandfather clause). */
  const starters = (await db.query('select slot_id from public.hr_hero_slots where starter')).rows.map((r) => r.slot_id);
  await db.query('update public.hr_hero_slots set starter = true');
  const idle = Number(idleAccounts || 0);
  for (let i = 0; i < accounts + idle; i++) {
    const uid = uidOf(i);
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
    await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'beta-load') on conflict (user_id) do nothing`, [uid]);
    await db.query(`insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do nothing`, [uid, 'Bench' + i]).catch(() => {});
    await asUser(uid);
    const slots = [];
    for (let s = 0; s < heroes; s++) {
      const c = await one('select public.hr_create_character($1::int)', [s]);
      if (!c || !(c.created === true || c.ok === true)) {
        /* Extra slots are bought with gold in play; the fixture opens them on the replay only. */
        refused[JSON.stringify(c).slice(0, 80)] = (refused[JSON.stringify(c).slice(0, 80)] || 0) + 1;
        break;
      }
      slots.push(s);
      await db.query(`update public.player_state set active_kind = 'idle', active_id = null, level_xp = $3 where user_id = $1 and slot = $2`, [uid, s, levelXp]);
      for (const [skill, xp] of Object.entries(skillXp)) {
        await db.query(`insert into public.player_skills (user_id, slot, skill, xp) values ($1, $2, $3, $4) on conflict (user_id, slot, skill) do update set xp = excluded.xp`, [uid, s, skill, xp]).catch(() => {});
      }
      await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) select $1, $2, x, 1 from unnest($3::text[]) x on conflict do nothing`, [uid, s, stacks]).catch(() => {});
      await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, $2, 'cooked_shrimp', 400) on conflict (user_id, slot, item_id) do update set qty = excluded.qty`, [uid, s]);
      await one(`select public.hr_character_name_set($1::int, $2, $3::uuid)`, [s, nameOf(i, s), randomUUID()]);
    }
    await db.query(`insert into public.account_wallet (user_id, gold) values ($1, ${PURSE}) on conflict (user_id) do update set gold = excluded.gold`, [uid]);
    if (i >= accounts) continue;   // the population the tables must hold, standing in town
    const kind = i / accounts < partyShare ? 'party' : (i / accounts < partyShare + townShare ? 'town' : 'solo');
    const bag = JSON.stringify(kit.bag);
    const enter = async (s, g) => {
      await asUser(uid);
      const e = await one(`select public.hr_hunt_enter($1::int, $2, $3::jsonb, 0, null, $4::uuid)`, [s, g, bag, randomUUID()]);
      if (!e || e.ok !== true) { const k = JSON.stringify(e).slice(0, 80); refused[k] = (refused[k] || 0) + 1; return false; }
      return true;
    };
    if (kind === 'party' && slots.length > 1) {
      await asUser('');
      const pid = await one('select public.hr_party_open($1::uuid, 0)', [uid]);
      for (const s of slots.slice(1)) await db.query('select public.hr_party_seat_into($1::uuid, $2::uuid, $3::int)', [pid, uid, s]);
      await db.query('update public.hunt_parties set hunt_id = $2 where id = $1', [pid, partyGround]);
      for (const s of slots) await enter(s, partyGround);
    } else {
      for (const s of slots) if (!(kind === 'town' && s === 0)) await enter(s, soloGround);
    }
    out.push({ uid, slots, viewed: 0, kind, online: i / accounts < online, map: townMap });
  }
  await asUser('');
  await db.query('update public.hr_hero_slots set starter = (slot_id = any ($1::int[]))', [starters]);
  /* Staggered clocks over one flush: a population, not a stampede. The hunt's own start stays the audit's zero. */
  await db.query(`update public.hunt_instances i set settled_to = date_trunc('second', now() - make_interval(secs => s.lag)), next_swing_at = date_trunc('second', now() - make_interval(secs => s.lag))
      from (select id, (random() * 90)::int + 1 as lag from public.hunt_instances where id in (select instance_id from public.hunt_sessions where ended_at is null)) s where i.id = s.id`);
  await db.query(`update public.hunt_sessions h set hunt_from = i.settled_to, settled_to = i.settled_to, next_swing_at = i.settled_to, entered_at = i.settled_to - interval '1 minute'
      from public.hunt_instances i where i.id = h.instance_id and h.ended_at is null`);
  /* The journal, at the size retention keeps: the 2,000 rows a hero production carries today, as index depth for the writes. */
  const heroCount = (accounts + idle) * heroes;
  await db.query(`insert into public.player_ledger (user_id, slot, kind, intent, at)
    select $1::uuid, 0, 'admin', 'beta_load_fill', now() - interval '30 days' from generate_series(1, $2::int)`, [uidOf(0), Math.min(heroCount * 2000, 1000000)]).catch((e) => { refused['ledger fill: ' + String(e.message).slice(0, 60)] = 1; });
  await db.exec('analyze');
  return { accounts: out, refused, partyGround, soloGround };
}

async function cpuOf(pid) {
  const ps = `$p=${pid}; $x=Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq $p -or $_.ParentProcessId -eq $p }; ($x | Measure-Object -Property UserModeTime -Sum).Sum + ($x | Measure-Object -Property KernelModeTime -Sum).Sum`;
  try { return Number(execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 30000 }).trim()) / 1e7; } catch { return NaN; }
}

const CRONS = [
  { name: 'hr_tick_enrol', ms: 60000, sql: 'select public.hr_tick_enrol(200)' },
  { name: 'hr_hunt_party_sweep', ms: 60000, sql: 'select public.hr_hunt_party_sweep(200)' },
  { name: 'hr_town_refresh', ms: 25000, sql: 'select public.hr_town_refresh()' },
  { name: 'hr_leaderboard_refresh', ms: 300000, sql: 'select public.hr_leaderboard_refresh(true)' },
  { name: 'hr_market_expire', ms: 300000, sql: 'select public.hr_market_expire(200)' },
  { name: 'hr_slot_health_alert', ms: 300000, sql: 'select public.hr_slot_health_alert()' },
  { name: 'hr_party_reap_stale', ms: 600000, sql: 'select public.hr_party_reap_stale(200)' },
];

async function main() {
  const accounts = Number(arg('accounts', 20)); const heroes = Number(arg('heroes', 4)); const minutes = Number(arg('minutes', 5));
  const partyShare = Number(arg('party', 0.4)); const townShare = Number(arg('town', 0.25)); const online = Number(arg('online', 1));
  const W = Number(arg('workers', accounts > 40 ? 3 : 2)); const drill = arg('drill', ''); const jsonOut = arg('json', '');
  const report = { args: { accounts, heroes, minutes, partyShare, townShare, online, drill }, at: new Date().toISOString() };
  const log = (s) => process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${s}\n`);

  const { bootPg } = await import('./pg-replay.mjs');
  log('booting the chain on PG17');
  const { db, name } = await bootPg({ log });
  await db.exec('create extension if not exists pg_stat_statements');
  const t0 = Date.now();
  const world = await buildWorld(db, { accounts, heroes, partyShare, townShare, online, idleAccounts: Number(arg('idle-accounts', 0)) });
  log(`world built in ${((Date.now() - t0) / 1000).toFixed(0)} s: refused ${JSON.stringify(world.refused)}; party ${world.partyGround}, solo ${world.soloGround}`);
  const admin = connect(name, 4);
  const openN = (await admin.unsafe('select count(*)::int s, count(distinct instance_id)::int i from public.hunt_sessions where ended_at is null'))[0];
  log(`${openN.s} open sessions on ${openN.i} instances`);
  report.world = { sessions: openN.s, instances: openN.i, refused: world.refused };
  const fromBySession = new Map((await admin.unsafe(`select id, floor(extract(epoch from hunt_from) * 1000)::bigint as f from public.hunt_sessions`)).map((r) => [r.id, Number(r.f)]));

  const purse0 = await purseBase(admin);

  /* Production's pool: 15 server connections to hr_engine through the pooler (Small's default_pool_size, ASSUMED; the
     role's own limit is 20), PostgREST's own pool on Small (ASSUMED 15). Split across the workers. */
  const engineTotal = Number(arg('engine-pool', 15)); const restTotal = Number(arg('rest-pool', 15));
  const workers = [];
  for (let i = 0; i < W; i++) {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { hrBetaLoad: true, dbName: name, root: join(fileURLToPath(new URL('..', import.meta.url))),
      enginePool: Math.max(1, Math.floor(engineTotal / W)), restPool: Math.max(1, Math.floor(restTotal / W)),
      accounts: world.accounts.filter((_, k) => k % W === i) } });
    await new Promise((res, rej) => { w.once('message', res); w.once('error', rej); });
    w.setMaxListeners(0);
    w.on('error', (e) => log('worker error: ' + e.message));
    workers.push(w);
  }
  const say = (m) => workers.forEach((w) => w.postMessage(m));

  /* THE TICK: the real fire, the real roster and leases; each hunt body is its own concurrent edge invocation. */
  let rr = 0, bodyId = 0, fires = 0, bodiesPosted = 0, firing = true;
  const fireWalls = []; const bodiesPerFire = []; const busy = new Set();
  const fire = async () => {
    if (!firing) return;
    const a = nowMs();
    try {
      await admin.unsafe('delete from net.http_request_queue');
      await admin.unsafe('select public.hr_tick_cron_run()');
      const q = await admin.unsafe(`select convert_from(body, 'UTF8') as b from net.http_request_queue order by id`);
      fireWalls.push(nowMs() - a); fires++;
      const bodies = q.map((r) => JSON.parse(r.b)).filter((b) => (Array.isArray(b.hunts) && b.hunts.length) || (Array.isArray(b.roster) && b.roster.length));
      bodiesPerFire.push(bodies.length); bodiesPosted += bodies.length;
      for (const b of bodies) {
        const id = ++bodyId; const w = workers[rr++ % W];
        const done = new Promise((res) => { const on = (m) => { if (m.t === 'done' && m.id === id) { w.off('message', on); res(); } }; w.on('message', on); });
        busy.add(done); done.then(() => busy.delete(done));
        w.postMessage({ t: 'body', id, body: b });
      }
    } catch (e) { log('fire failed: ' + e.message); }
  };
  /* THE LAG: what hunt-health sees, sampled every 10 s. */
  const lagSeries = [];
  const sampleLag = async () => {
    const [r] = await admin.unsafe(`select count(*)::int n, coalesce(max(extract(epoch from now() - i.settled_to)), 0)::float8 mx,
        coalesce(percentile_cont(0.95) within group (order by extract(epoch from now() - i.settled_to)), 0)::float8 p95,
        count(*) filter (where extract(epoch from now() - i.settled_to) > 125)::int stalled
      from public.hunt_instances i where i.id in (select instance_id from public.hunt_sessions where ended_at is null)`);
    lagSeries.push({ t: Date.now(), ...r });
  };

  const pmPid = DATA ? Number(readFileSync(join(DATA, 'postmaster.pid'), 'utf8').split('\n')[0]) : 0;
  const statSql = `select coalesce(sum(xact_commit), 0)::bigint c, coalesce(sum(xact_rollback), 0)::bigint r, coalesce(sum(blks_read), 0)::bigint rd, coalesce(sum(blks_hit), 0)::bigint hit,
      coalesce(sum(deadlocks), 0)::bigint dl, coalesce(sum(tup_inserted), 0)::bigint ins, coalesce(sum(tup_updated), 0)::bigint upd from pg_stat_database where datname = current_database()`;
  const walSql = `select wal_bytes::bigint b, wal_fpi::bigint f, wal_records::bigint r from pg_stat_wal`;
  /* Named tables only: a stat of every relation took 35 s on this PC, where one file open costs 17 ms (measured 11-02). */
  const tableSql = `select t as relname, pg_total_relation_size(t::regclass)::bigint b from unnest(array['player_ledger', 'player_state', 'player_inventory', 'player_skills', 'player_progress', 'player_intents',
      'hunt_sessions', 'hunt_instances', 'hunt_session_tally', 'hunt_session_events', 'hunt_bag', 'hr_rate_counters', 'hr_rejections', 'chat_messages', 'hunt_tick_lease', 'hr_town_stands', 'character_presence']) t
      union all select 'realtime.bench_frames', pg_total_relation_size('realtime.bench_frames'::regclass)`;

  const fireTimer = setInterval(fire, 10000);
  const lagTimer = setInterval(sampleLag, 10000);
  const cronWalls = {};
  const cronTimers = CRONS.map((c) => setInterval(async () => {
    const a = nowMs();
    try { await admin.unsafe(c.sql); (cronWalls[c.name] = cronWalls[c.name] || []).push(nowMs() - a); }
    catch (e) { (cronWalls[c.name + ':error'] = cronWalls[c.name + ':error'] || []).push(String(e.message).slice(0, 80)); }
  }, c.ms));
  await fire();
  say({ t: 'start' });
  const warmS = Number(arg('warm', 240));
  log(`warming ${warmS} s (every pooled backend past its first touches: a cold backend opens hundreds of files at 17 ms each here)`);
  await new Promise((r) => setTimeout(r, warmS * 1000));

  /* THE MEASURED WINDOW. */
  say({ t: 'reset' });
  await admin.unsafe('select extensions.pg_stat_statements_reset()').catch(() => admin.unsafe('select pg_stat_statements_reset()'));
  fires = 0; bodiesPosted = 0; fireWalls.length = 0; bodiesPerFire.length = 0; lagSeries.length = 0;
  const cpu0 = pmPid ? await cpuOf(pmPid) : NaN;
  const [s0] = await admin.unsafe(statSql); const [w0] = await admin.unsafe(walSql);
  const tables0 = new Map((await admin.unsafe(tableSql)).map((r) => [r.relname, Number(r.b)]));
  const fr0 = (await admin.unsafe('select count(*)::bigint n, coalesce(sum(length(payload::text)), 0)::bigint b from realtime.bench_frames'))[0];
  const led0 = Number((await admin.unsafe(`select count(*)::bigint n from public.player_ledger where intent <> 'beta_load_fill'`))[0].n);
  const tMeasure = Date.now();
  const proc0 = process.cpuUsage();

  const drillLog = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (drill) {
    const mark = (s) => { drillLog.push({ at: Date.now() - tMeasure, s }); log('drill: ' + s); };
    await sleep(60000);
    if (drill === 'tick-stop') {
      firing = false; mark('the tick stops');
      await sleep(600000);
      firing = true; mark('the tick returns'); await fire();
    } else if (drill === 'edge-5xx') {
      say({ t: 'mode', mode: { edge: 'mixed' } }); mark('edge answers 5xx for 5 minutes: half never ran, a quarter ran with the answer lost');
      await sleep(300000);
      say({ t: 'mode', mode: { edge: 'ok' } }); mark('edge back');
    } else if (drill === 'retry') {
      say({ t: 'mode', mode: { retry: 2 } }); mark('every settle delivered 3 times at once, for 3 minutes');
      await sleep(180000);
      say({ t: 'mode', mode: { retry: 0 } }); mark('single delivery');
    }
    await sleep(Math.max(0, minutes * 60000));
  } else {
    await sleep(minutes * 60000);
  }
  const elapsedS = (Date.now() - tMeasure) / 1000;
  const proc1 = process.cpuUsage(proc0);
  const cpu1 = pmPid ? await cpuOf(pmPid) : NaN;
  /* the workload's statements only: the bench's own reads are not the server's load */
  const pss = await admin.unsafe(`select r.rolname, s.calls::bigint calls, s.total_exec_time::float8 ms, s.mean_exec_time::float8 mean, s.max_exec_time::float8 mx, s.wal_bytes::bigint wal,
      regexp_replace(s.query, '\\s+', ' ', 'g') q from pg_stat_statements s join pg_roles r on r.oid = s.userid
      where s.query not like '%pg_stat%' and s.query not like '%pg_total_relation_size%' and s.query not like '%bench_frames%' and s.query not like '%net.http_request_queue%'
        and s.query not like '%hunt_instances i where i.id in%' and s.query not like '%beta_load_fill%' order by s.total_exec_time desc limit 80`).catch(() => []);
  const totals = { ms: pss.reduce((a, r) => a + r.ms, 0), calls: pss.reduce((a, r) => a + Number(r.calls), 0) };
  const [s1] = await admin.unsafe(statSql); const [w1] = await admin.unsafe(walSql);
  const tables1 = (await admin.unsafe(tableSql)).map((r) => ({ t: r.relname, grew: Number(r.b) - (tables0.get(r.relname) || 0), b: Number(r.b) })).filter((r) => r.grew > 0).sort((a, b) => b.grew - a.grew);
  const fr1 = (await admin.unsafe('select count(*)::bigint n, coalesce(sum(length(payload::text)), 0)::bigint b from realtime.bench_frames'))[0];
  const led1 = Number((await admin.unsafe(`select count(*)::bigint n from public.player_ledger where intent <> 'beta_load_fill'`))[0].n);
  const ledBytes = Number((await admin.unsafe(`select coalesce(avg(pg_column_size(l.*)), 0)::float8 a from public.player_ledger l where intent <> 'beta_load_fill'`))[0].a);
  const conns = (await admin.unsafe(`select count(*)::int n from pg_stat_activity where datname = current_database()`))[0].n;
  /* Stop the driver and gather its numbers. */
  clearInterval(fireTimer); clearInterval(lagTimer); cronTimers.forEach(clearInterval);
  firing = false;
  const gathered = await new Promise((resolve) => {
    const got = [];
    for (const w of workers) { w.on('message', (m) => { if (m.t === 'stats') { got.push(m); if (got.length === W) resolve(got); } }); w.postMessage({ t: 'stop' }); }
  });
  const merged = new Map();
  for (const g of gathered) for (const [k, s] of g.stats) {
    const m = merged.get(k) || { n: 0, wall: [], queue: 0, db: 0, bytes: 0, errors: 0, engine: 0 };
    for (const [f, v] of Object.entries(s)) {
      if (f === 'wall' || f === 'walls') m[f] = (m[f] || []).concat(v);
      else if (f === 'outcomes' || f === 'reasons') { m[f] = m[f] || {}; for (const [x, y] of Object.entries(v)) m[f][x] = (m[f][x] || 0) + y; }
      else if (f === 'last') m.last = v;
      else if (f === 'engineMax' || f === 'engineRunMax') m[f] = Math.max(m[f] || 0, v);
      else m[f] = (m[f] || 0) + v;
    }
    merged.set(k, m);
  }
  const perMin = (n) => (60 * n) / elapsedS;
  const rows = {};
  for (const [k, s] of merged) {
    rows[k] = { n: s.n, perMin: Math.round(perMin(s.n) * 10) / 10, p50: Math.round(pct(s.wall, 0.5)), p95: Math.round(pct(s.wall, 0.95)), max: Math.round(pct(s.wall, 1)),
      queueMean: s.n ? Math.round(s.queue / s.n) : 0, dbMean: s.n ? Math.round(s.db / s.n) : 0, kbMean: s.n ? Math.round(s.bytes / s.n / 102.4) / 10 : 0, errors: s.errors, n5xx: s.n5xx, lost: s.lost,
      settled: s.settled, nothing: s.nothing, refused: s.refused, ended: s.ended, deferred: s.deferred, engineMs: s.engine ? Math.round(s.engine) : undefined, engineMax: s.engineMax, engineRunMax: s.engineRunMax,
      outcomes: s.outcomes, reasons: s.reasons, last: s.last };
  }
  const lagMax = lagSeries.reduce((m, r) => Math.max(m, r.mx), 0);
  report.measured = {
    seconds: Math.round(elapsedS),
    db_cpu_cores_local: Number.isFinite(cpu1 - cpu0) ? (cpu1 - cpu0) / elapsedS : null,
    db_exec_ms_per_s: totals.ms / elapsedS, statements_per_s: Number(totals.calls) / elapsedS,
    js_cpu_cores_local: (proc1.user + proc1.system) / 1e6 / elapsedS,
    commits_per_s: Number(s1.c - s0.c) / elapsedS, rollbacks: Number(s1.r - s0.r), deadlocks: Number(s1.dl - s0.dl),
    blocks_read_per_s: Number(s1.rd - s0.rd) / elapsedS, hit_ratio: Number(s1.hit - s0.hit) / Math.max(1, Number(s1.hit - s0.hit) + Number(s1.rd - s0.rd)),
    wal_mb_per_s: Number(w1.b - w0.b) / 1e6 / elapsedS, connections: conns,
    frames_per_s: Number(fr1.n - fr0.n) / elapsedS, frame_kb_mean: Number(fr1.n - fr0.n) ? Number(fr1.b - fr0.b) / Number(fr1.n - fr0.n) / 1024 : 0, frame_kb_per_s: Number(fr1.b - fr0.b) / 1024 / elapsedS,
    ledger_rows_per_hero_hour: (led1 - led0) / openN.s / (elapsedS / 3600), ledger_bytes_mean: ledBytes,
    fires, bodies_posted: bodiesPosted, bodies_per_fire_p95: pct(bodiesPerFire, 0.95), bodies_per_fire_max: pct(bodiesPerFire, 1), fire_ms_p50: Math.round(pct(fireWalls, 0.5)), fire_ms_max: Math.round(pct(fireWalls, 1)),
    edge_invocations_per_min: perMin((merged.get('hello')?.n || 0) + (merged.get('hello_early')?.n || 0) + (merged.get('market')?.n || 0) + bodiesPosted),
    lag: { max_s: lagMax, p95_of_p95_s: pct(lagSeries.map((r) => r.p95), 0.95), stalled_samples: lagSeries.filter((r) => r.stalled > 0).length, samples: lagSeries.length, last: lagSeries[lagSeries.length - 1] },
    rows, crons: Object.fromEntries(Object.entries(cronWalls).map(([k, v]) => [k, typeof v[0] === 'string' ? v[0] : { n: v.length, mean: Math.round(v.reduce((a, b) => a + b, 0) / v.length), max: Math.round(Math.max(...v)) }])),
    tables_grew: tables1.slice(0, 12),
    top_statements: pss.map((r) => ({ role: r.rolname, calls: Number(r.calls), ms: Math.round(r.ms), mean: Math.round(r.mean * 10) / 10, max: Math.round(r.mx), wal_kb: Math.round(Number(r.wal) / 1024), q: r.q.slice(0, 160) })),
  };
  if (drillLog.length) report.drill = { log: drillLog, lag: lagSeries.map((r) => ({ s: Math.round((r.t - tMeasure) / 1000), mx: Math.round(r.mx), p95: Math.round(r.p95), stalled: r.stalled })) };

  /* Let every body and every in-flight settle land, then audit. */
  await Promise.race([Promise.all(Array.from(busy)), sleep(30000)]);
  await sleep(2000);
  const audit = await auditSessions(admin, fromBySession, purse0);
  report.audit = { ...audit, red: audit.red.slice(0, 10), red_total: audit.red.length };
  const ended = await admin.unsafe(`select end_reason, count(*)::int n from public.hunt_sessions group by 1 order by 2 desc`).catch(() => []);
  report.end_reasons = ended;

  const m = report.measured;
  log(`DB CPU ${m.db_cpu_cores_local?.toFixed(2)} local cores · exec ${m.db_exec_ms_per_s.toFixed(0)} ms/s · ${m.statements_per_s.toFixed(0)} stmts/s · WAL ${m.wal_mb_per_s.toFixed(2)} MB/s · frames ${m.frames_per_s.toFixed(2)}/s (${m.frame_kb_mean.toFixed(0)} KB) · edge ${m.edge_invocations_per_min.toFixed(0)}/min`);
  log(`lag max ${m.lag.max_s.toFixed(0)} s, stalled samples ${m.lag.stalled_samples}/${m.lag.samples}; audit: ${audit.sessions} sessions, ${audit.windows} windows, ${audit.red.length} red`);
  for (const r of audit.red.slice(0, 5)) log('  RED ' + r);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 1));
  else process.stdout.write(JSON.stringify(report, null, 1) + '\n');
  await admin.end({ timeout: 5 });
  await db.close().catch(() => {});
  process.exit(audit.red.length ? 1 : 0);
}

/* --selftest: the audit must go red on a planted double payment and on planted lost time, on a real replayed chain. */
async function selftest() {
  const { bootPg } = await import('./pg-replay.mjs');
  const { db, name } = await bootPg({});
  const world = await buildWorld(db, { accounts: 1, heroes: 1, partyShare: 0, townShare: 0, online: 1 });
  const admin = connect(name, 2);
  const H = (await import('../tests/hunt-sessions-settle.mjs')).HARNESS;
  const M = await H.loadEdge(H.ROOT);
  const uid = world.accounts[0].uid;
  const exec = async (text, params) => admin.begin(async (tx) => { await tx.unsafe('set local role hr_engine'); return Array.from(await tx.unsafe(text, params || [])); });
  const fromBy = new Map((await admin.unsafe(`select id, floor(extract(epoch from hunt_from) * 1000)::bigint as f from public.hunt_sessions`)).map((r) => [r.id, Number(r.f)]));
  await admin.unsafe(`update public.hunt_instances set settled_to = settled_to - interval '200 seconds', next_swing_at = next_swing_at - interval '200 seconds'`);
  await admin.unsafe(`update public.hunt_sessions set entered_at = entered_at - interval '200 seconds', hunt_from = hunt_from - interval '200 seconds', settled_to = settled_to - interval '200 seconds', next_swing_at = next_swing_at - interval '200 seconds'`);
  for (const k of fromBy.keys()) fromBy.set(k, fromBy.get(k) - 200000);
  const base = await purseBase(admin);
  const v = await M.HS.settleHunt({ exec, user: uid, slot: 0, mode: 'settle', bucket: null, project: true, live: true });
  const problems = [];
  if (v.outcome !== 'paid') problems.push('CONTROL: the settle did not pay: ' + JSON.stringify({ o: v.outcome, r: v.reason }));
  const clean = await auditSessions(admin, fromBy, base);
  if (clean.red.length || clean.windows < 1) problems.push('CONTROL: a clean settle reads red or empty: ' + JSON.stringify(clean));
  /* A4: gold moved with no ledger row. */
  await admin.unsafe(`update public.account_wallet set gold = gold + 7`);
  const a4 = await auditSessions(admin, fromBy, base);
  if (!a4.red.some((r) => /purse/.test(r))) problems.push('A4: gold moved without a ledger row went unseen');
  await admin.unsafe(`update public.account_wallet set gold = gold - 7`);
  /* A2: time lost (the clock moved with no window). */
  await admin.unsafe(`update public.hunt_sessions set settled_to = settled_to + interval '90 seconds'`);
  const a2 = await auditSessions(admin, fromBy, base);
  if (!a2.red.some((r) => /clock that moved/.test(r))) problems.push('A2: lost time went unseen');
  await admin.unsafe(`update public.hunt_sessions set settled_to = settled_to - interval '90 seconds'`);
  /* A3: a tally that disagrees with its ledger. */
  await admin.unsafe(`update public.hunt_session_tally set coins = coins + 1`);
  const a3 = await auditSessions(admin, fromBy, base);
  if (!a3.red.some((r) => /tally/.test(r))) problems.push('A3: a tally off its ledger went unseen');
  /* last: the journal refuses a delete inside its retention window, so this plant stays */
  /* A1: a window journalled twice (double pay). */
  await admin.begin(async (tx) => {
    await tx.unsafe(`set local session_replication_role = replica`);   // the journal's own fences refuse this write; the plant is the point
    await tx.unsafe(`insert into public.player_ledger (user_id, slot, kind, intent, gold, purse, gold_kind, session_id, meta)
      select user_id, slot, kind, intent, gold, purse, gold_kind, session_id, meta from public.player_ledger where kind = 'combat' and intent = 'accrue' limit 1`);
  }).catch((e) => problems.push('plant failed: ' + e.message));
  const a1 = await auditSessions(admin, fromBy, base);
  if (!a1.red.some((r) => /journalled/.test(r))) problems.push('A1: a window paid twice went unseen');
  await admin.end({ timeout: 5 }); await db.close().catch(() => {});
  for (const p of problems) console.log('RED ' + p);
  console.log(problems.length ? `beta-load --selftest: ${problems.length} red` : 'beta-load --selftest: 4/4 planted defects caught, control clean');
  process.exit(problems.length ? 1 : 0);
}

if (!isMainThread && workerData && workerData.hrBetaLoad) {
  workerMain().catch((e) => { console.error(e); process.exit(2); });
} else if (isMainThread) {
  (process.argv.includes('--selftest') ? selftest() : main()).catch((e) => { console.error(e && e.stack || e); process.exit(2); });
}
