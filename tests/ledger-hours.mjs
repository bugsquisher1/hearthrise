#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/ledger-hours.mjs — THE HOURLY JOURNAL ON A PLAYED DAY: EVERY DAY READ IS THE SAME, THE ROWS ARE NOT
//   (supabase/migrations/1047-hourly-journal.sql; lane/c-settle-cost FB-4, build plan 13 section 2.6; 30-plan L13)
//
//   node tests/ledger-hours.mjs            the guard (replays the chain, plays the shipped engine)
//   node tests/ledger-hours.mjs --mutate   each planted defect turns its arm red (1047's own self-check off, so this file catches it)
//
// mutant-anchors: supabase/migrations/1047-hourly-journal.sql
//
// ── WHAT IT PLAYS ──────────────────────────────────────────────────────────
// Four of tests/per-player-cost.mjs's fixtures through their own doors with the SHIPPED edge: a lone hero and the supply-heavy
// four with the browser closed (the world tick's bodies), the heavy four watched (a hello every 16 s), a town bench (the tick's
// roster). Their journal rows are then spread 15 s apart in the order they were written, across a UTC midnight and older than
// detail_minutes (the immutability trigger off for that one update, inside the rolled-back transaction), and folded.
//
// ── THE ARMS ───────────────────────────────────────────────────────────────
//   CONSERVE <fx>   every read of a day is the same before and after the fold, on both days the rows touch: hr_day_budget_used
//                   (gold, xp, qty, gems and rows), the hunt store's day cap (supply_buy items by supply kind, as
//                   hr_hunt_apply_member reads it), the meta sums (kills by monster, items and xp by key, supplies used), the
//                   journal rows counted through `folded`, and the monthly rollup hr_ledger_prune writes (rows, gold, qty and
//                   xp by sign), read by running the prune
//   COVER <fx>      every row of the five settle shapes the shipped engine wrote folded: the model knows each key it journals
//                   (a writer that adds a key turns this red: add the key to hr_ledger_fold_model)
//   KEEP            the rows kept, a hero-hour: at most one an activity, and the reduction printed
//   NEXT-SAVE       after the fold the same hunt saves again, closed and watched (CLAUDE.md §4 both paths), and its session's
//                   tally grows by that save's own kills only (an hour row is never a session's row twice)
//   BOUNDARY        the cron's own fold (the cursor): rows before the release keep their detail, an hour not yet closed past
//                   detail_minutes keeps its detail, the cursor ends at the first hour it may not fold
//   FENCE           a delete without the fold's flag, an update of an hour row, an early delete of an hour row: refused
//   SWITCH          hourly = false: the cron's fold answers off and moves nothing
// ════════════════════════════════════════════════════════════════════════
import { HARNESS } from './hunt-sessions-settle.mjs';
import { bootReplay, LAST_PATCHED } from './schema-replay.mjs';
import { FIXTURES, measure } from './per-player-cost.mjs';
import { isMain } from './_is-main.mjs';

const { loadEdge, pinDice, one, q, makeExec, groundsOf } = HARNESS;
const MIG = '1047-hourly-journal.sql';
const PLAY = Object.freeze(['lone_L10_meadowbrook_thicket', 'supply4_L50_hasks_ford_deadly', 'krell4_L80_deadly_watched', 'town_hour_bench']);
const SPREAD_S = 15;

/* The reads of a day, for every hero of `users`, as JSON text keyed so a diff names what moved. */
const READS = {
  budget: `select coalesce(jsonb_object_agg(h.k, public.hr_day_budget_used(h.u, h.s, h.d + interval '12 hours')), '{}') from (
      select distinct l.user_id || ':' || l.slot || ':' || date_trunc('day', l.at)::date as k, l.user_id as u, l.slot as s,
             date_trunc('day', l.at) as d from public.player_ledger l where l.user_id = any ($1::uuid[])) h`,
  store: `select coalesce(jsonb_object_agg(k, n), '{}') from (
      select l.user_id || ':' || l.slot || ':' || date_trunc('day', l.at)::date || ':' || q.kind as k, sum((x.value ->> 'qty')::bigint) as n
        from public.player_ledger l, jsonb_each(case when jsonb_typeof(l.meta -> 'items') = 'object' then l.meta -> 'items' else '{}'::jsonb end) x
        join public.hr_hunt_basic_supplies q on q.basic_id = x.key
       where l.user_id = any ($1::uuid[]) and l.kind = 'hunt' and l.intent = 'supply_buy' group by 1) a`,
  meta: `select coalesce(jsonb_object_agg(k, n), '{}') from (
      select l.user_id || ':' || l.slot || ':' || date_trunc('day', l.at)::date || ':' || l.kind || ':' || l.intent || ':' || p.path as k,
             sum(p.v) as n
        from public.player_ledger l
        cross join lateral (
          select 'km.' || e.key as path, (e.value #>> '{}')::numeric as v from jsonb_each(coalesce(l.meta -> 'km', '{}')) e
          union all select 'i.' || e.key, (e.value #>> '{}')::numeric from jsonb_each(coalesce(l.meta -> 'delta' -> 'i', '{}')) e
          union all select 'x.' || e.key, (e.value #>> '{}')::numeric from jsonb_each(coalesce(l.meta -> 'delta' -> 'x', '{}')) e
          union all select 'items.' || e.key, case when jsonb_typeof(e.value) = 'object' then (e.value ->> 'qty')::numeric else (e.value #>> '{}')::numeric end
            from jsonb_each(case when jsonb_typeof(l.meta -> 'items') = 'object' then l.meta -> 'items' else '{}'::jsonb end) e
          union all select 'kills', (l.meta ->> 'kills')::numeric where jsonb_typeof(l.meta -> 'kills') = 'number'
          union all select 'ms', (l.meta ->> 'ms')::numeric where jsonb_typeof(l.meta -> 'ms') = 'number'
          union all select 'lx', (l.meta -> 'delta' ->> 'lx')::numeric where jsonb_typeof(l.meta -> 'delta' -> 'lx') = 'number') p
       where l.user_id = any ($1::uuid[]) group by 1) a`,
  rows: `select coalesce(jsonb_object_agg(k, n), '{}') from (
      select l.user_id || ':' || l.slot || ':' || date_trunc('day', l.at)::date || ':' || l.kind || ':' || l.intent as k,
             jsonb_build_array(sum(coalesce(l.folded, 1)), sum(coalesce(l.gold, 0)), sum(coalesce(l.gold_in, 0)), sum(coalesce(l.xp_in, 0)),
                               sum(coalesce(l.qty_in, 0)), sum(coalesce(l.qty, 0))) as n
        from public.player_ledger l where l.user_id = any ($1::uuid[]) group by 1) a`,
};
async function readAll(db, users) {
  const out = {};
  for (const [k, sql] of Object.entries(READS)) out[k] = (await q(db, sql, [users]))[0];
  out.budget = Object.values(out.budget)[0]; out.store = Object.values(out.store)[0];
  out.meta = Object.values(out.meta)[0]; out.rows = Object.values(out.rows)[0];
  out.rollup = await rollupOf(db, users);
  return out;
}
/* THE MONTHLY ROLLUP, AS THE PRUNE WRITES IT: the rows aged past retain_days in a savepoint, hr_ledger_prune run, its rollup read. */
async function rollupOf(db, users) {
  await db.query('savepoint rollup');
  try {
    await db.query('alter table public.player_ledger disable trigger hr_ledger_immutable');
    await db.query(`update public.player_ledger set at = at - interval '120 days' where user_id = any ($1::uuid[])`, [users]);
    await db.query('alter table public.player_ledger enable trigger hr_ledger_immutable');
    await db.query('delete from public.player_ledger_rollup where user_id = any ($1::uuid[])', [users]);
    await one(db, 'select public.hr_ledger_prune(100000)');
    return (await q(db, `select coalesce(jsonb_object_agg(r.user_id || ':' || r.slot || ':' || r.month || ':' || r.kind,
        jsonb_build_array(r.n, r.gold_in, r.gold_out, r.xp_in, r.xp_out, r.qty_in, r.qty_out, r.gems_in)), '{}') as v
      from public.player_ledger_rollup r where r.user_id = any ($1::uuid[])`, [users]))[0].v;
  } finally { await db.query('rollback to savepoint rollup'); }
}
const diff = (a, b) => {
  const out = [];
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (JSON.stringify((a || {})[k]) !== JSON.stringify((b || {})[k])) out.push(`${k}: ${JSON.stringify((a || {})[k])} -> ${JSON.stringify((b || {})[k])}`);
  }
  return out;
};

/* THE FIVE SHAPES THAT FOLD (hr_ledger_fold_model's), as a SQL predicate on `l` */
const FOLDS = `((l.intent = 'accrue' and l.kind in ('gather', 'craft', 'combat')) or (l.kind = 'hunt' and l.intent in ('supply_own', 'supply_buy', 'vendor_cover')))`;

/** Spread the rows a fixture wrote (ids past `id0`) SPREAD_S apart, in write order, ending past yesterday's UTC midnight. */
async function spread(db, users, id0) {
  const n = Number(await one(db, 'select count(*) from public.player_ledger where user_id = any ($1::uuid[]) and id > $2', [users, id0]));
  /* the middle row at yesterday's midnight: the rows straddle it, and all are more than a day old */
  await db.query('alter table public.player_ledger disable trigger hr_ledger_immutable');
  await db.query(`update public.player_ledger l set at = date_trunc('day', now() - interval '1 day') + make_interval(secs => ($3::int) * (r.k - $4::int))
                    from (select id, row_number() over (order by id) as k from public.player_ledger where user_id = any ($1::uuid[]) and id > $2) r
                   where l.id = r.id`, [users, id0, SPREAD_S, Math.floor(n / 2)]);
  await db.query('alter table public.player_ledger enable trigger hr_ledger_immutable');
  return n;
}

/** One fixture: build, play, spread, read, fold, read. Answers the arms' findings (lines; empty = green) and the counts. */
async function playOne(db, M, name, o = {}) {
  const f = FIXTURES[name];
  const id0 = Number(await one(db, 'select coalesce(max(id), 0) from public.player_ledger'));
  const fx = await f.build(db, M);
  await measure(db, M, fx, f.door, null, f.minSettles);
  const users = [...new Set(fx.heroes.map((h) => h[0]))];
  const n = await spread(db, users, id0);
  const days = Number(await one(db, `select count(distinct date_trunc('day', at)) from public.player_ledger where user_id = any ($1::uuid[]) and id > $2`, [users, id0]));
  const before = await readAll(db, users);
  const from = await one(db, `select min(at) from public.player_ledger where user_id = any ($1::uuid[]) and id > $2`, [users, id0]);
  const fold = {};
  for (const u of users) {
    const r = await one(db, 'select public.hr_ledger_hours_fold(500000, $1::uuid, $2::timestamptz, now())', [u, from]);
    for (const [k, v] of Object.entries(r)) if (typeof v === 'number') fold[k] = (fold[k] || 0) + v;
  }
  const after = await readAll(db, users);
  const red = [];
  for (const k of Object.keys(READS).concat('rollup')) for (const d of diff(before[k], after[k])) red.push(`CONSERVE ${name} ${k}: ${d}`);
  if (days < 2) red.push(`CONSERVE ${name}: the spread rows touch ${days} UTC day(s), not both sides of a midnight`);
  const leftover = await q(db, `select l.kind || ':' || l.intent as shape, count(*)::int as n, min(l.meta::text) as meta
      from public.player_ledger l where l.user_id = any ($1::uuid[]) and l.folded is null and ${FOLDS} group by 1`, [users]);
  if (!(fold.rows_in > 0)) red.push(`COVER ${name}: the fold took no row (${JSON.stringify(fold)})`);
  for (const r of leftover) red.push(`COVER ${name}: ${r.n} ${r.shape} row(s) kept their detail (a key the model lacks?) e.g. ${String(r.meta).slice(0, 240)}`);
  const kept = await q(db, `select l.user_id || ':' || l.slot || ':' || l.at as k, count(*)::int as n, count(distinct l.kind || l.intent)::int as acts
      from public.player_ledger l where l.user_id = any ($1::uuid[]) and l.folded is not null group by 1`, [users]);
  for (const r of kept) if (r.n > r.acts * 2) red.push(`KEEP ${name}: hero-hour ${r.k} keeps ${r.n} hour rows for ${r.acts} activities`);
  /* the hero-hours the fixture's folded rows cover, for the reduction line */
  const hours = Number(await one(db, `select count(distinct l.user_id || ':' || l.slot || ':' || date_trunc('hour', l.at)) from public.player_ledger l
      where l.user_id = any ($1::uuid[]) and l.folded is not null`, [users]));
  return { red, n, fold, hours, fx, users };
}

/* NEXT-SAVE: one more save of the fixture's hunt after its rows folded, through its own door; its session's tally grows by that save's kills only. */
async function nextSave(db, M, name, fx) {
  const sid = fx.sids[0]; const [u, s] = fx.heroes[0];
  const t0 = (await q(db, 'select kills, ledger_hwm from public.hunt_session_tally where session_id = $1', [sid]))[0];
  const exec = makeExec(db);
  await db.query(`update public.hunt_tick_lease set lease_until = now() - interval '1 second' where session_id = any ($1::uuid[])`, [fx.sids]);
  const v = FIXTURES[name].door === 'watched'
    ? await M.HS.settleHunt({ exec, user: u, slot: s, mode: 'settle', bucket: null, project: true, live: true, grounds: groundsOf(M) })
    : await M.HS.settleHunt({ exec, user: u, slot: s, mode: 'tick', session: sid, grounds: groundsOf(M) });
  if (v.outcome !== 'paid') return [`NEXT-SAVE ${name}: the save after the fold did not land: ${v.outcome}/${v.reason}`];
  const t1 = (await q(db, 'select kills from public.hunt_session_tally where session_id = $1', [sid]))[0];
  const own = Number(await one(db, `select coalesce(sum((l.meta ->> 'kills')::numeric), 0) from public.player_ledger l
      where l.session_id = $1 and l.id > $2 and jsonb_typeof(l.meta -> 'kills') = 'number'`, [sid, t0.ledger_hwm]));
  return Number(t1.kills) - Number(t0.kills) === own ? []
    : [`NEXT-SAVE ${name}: the tally grew ${Number(t1.kills) - Number(t0.kills)} kills for a save that journalled ${own}`];
}

/* BOUNDARY, FENCE and SWITCH on rows of their own (the fixtures' are gone with their savepoint). */
async function cronArms(db) {
  const red = []; const u = '000000c0-0000-4000-a000-00004a0b1e57';
  await db.query('savepoint cron');
  try {
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [u]);
    const hr = (h, m = 0) => `date_trunc('hour', now()) - interval '${h} hours' + interval '${m} minutes'`;
    const row = (at, xp) => db.query(`insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta, at)
      values ($1, 0, 'combat', 'accrue', 0, 0, $2, 0, '{"ms": 1000}', ${at})`, [u, xp]);
    /* coin in the 6-hour (purse and gold kind stamped), then a save with none (neither): two activities, the coin's keeps its purse */
    await db.query('insert into public.account_wallet (user_id, gold) values ($1, 900) on conflict (user_id) do update set gold = 900', [u]);
    await db.query(`insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gold_kind, meta, at)
      values ($1, 0, 'combat', 'accrue', 5, 5, 0, 0, 'hunt_loot', '{"ms": 1000}', ${hr(6, 1)})`, [u]);
    await row(hr(8, 10), 1);  await row(hr(7, 20), 2);  await row(hr(7, 40), 4);  await row(hr(6, 5), 8);  await row(hr(2, 5), 16);
    /* a row of a folding shape whose meta carries a key the model does not list: it keeps its detail */
    await db.query(`insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta, at)
      values ($1, 0, 'combat', 'accrue', 0, 0, 32, 0, '{"ms": 1000, "zz_unknown": 1}', ${hr(6, 15)})`, [u]);
    /* the release at 7 h 30 ago: the 7-hour's first row stays, its second folds; the 6-hour folds; the 2-hour is inside detail_minutes */
    await db.query(`update public.hr_ledger_hours_state set from_at = ${hr(7, 30)}, hour = date_trunc('hour', ${hr(7, 30)}), after_user = null, after_slot = null`);
    await db.query('update public.hr_ledger_config set hourly = false');
    const off = await one(db, 'select public.hr_ledger_hours_fold(50000)');
    const offRows = Number(await one(db, 'select count(*) from public.player_ledger where user_id = $1 and folded is not null', [u]));
    if (!(off && off.off === true) || offRows !== 0) red.push(`SWITCH: hourly off answered ${JSON.stringify(off)} and wrote ${offRows} hour row(s)`);
    await db.query('update public.hr_ledger_config set hourly = true');
    let r = null;
    await db.query('savepoint run');
    try { r = await one(db, 'select public.hr_ledger_hours_fold(50000)'); await db.query('release savepoint run'); }
    catch (e) { await db.query('rollback to savepoint run'); red.push(`BOUNDARY: the cron's fold raised: ${String(e.message || e).split('\n')[0].slice(0, 200)}`); }
    const left = (await q(db, 'select xp_in::int as x from public.player_ledger where user_id = $1 and folded is null order by 1', [u])).map((x) => x.x);
    const hours = (await q(db, 'select xp_in::int as x, folded, purse::int as purse from public.player_ledger where user_id = $1 and folded is not null order by 1', [u]));
    if (JSON.stringify(left) !== '[1,2,16,32]') red.push(`BOUNDARY: the rows that kept their detail are xp ${JSON.stringify(left)}, want [1,2,16,32] (before the release; inside detail_minutes; an unknown key)`);
    if (r && !(Number(r.left) >= 1)) red.push(`BOUNDARY: the cron's fold did not count the row it could not fold (${JSON.stringify(r)})`);
    if (r && Number(r.errors) !== 0) red.push(`BOUNDARY: the cron's fold failed ${r.errors} hero-hour(s): ${r.error}`);
    if (JSON.stringify(hours) !== '[{"x":0,"folded":1,"purse":900},{"x":4,"folded":1,"purse":null},{"x":8,"folded":1,"purse":null}]') red.push(`BOUNDARY: the hour rows are ${JSON.stringify(hours)} (want the 6-hour's coin row with its purse, the 7-hour's row, the 6-hour's coinless row)`);
    const st = (await q(db, `select hour <= now() - interval '180 minutes' and hour + interval '1 hour' > now() - interval '180 minutes' as at_cut from public.hr_ledger_hours_state`))[0];
    if (!st.at_cut) red.push(`BOUNDARY: the cursor did not stop at the first hour it may not fold (${JSON.stringify(r)})`);
    const refused = async (label, sql, flag = false) => {
      await db.query('savepoint f');
      try {
        if (flag) await db.query(`select set_config('hr.ledger_fold', 'on', true)`);
        await db.query(sql, [u]);
        red.push(`FENCE: ${label} was allowed`);
      } catch { /* refused */ } finally { await db.query('rollback to savepoint f'); }
    };
    await refused('a delete without the fold\'s flag', 'delete from public.player_ledger where user_id = $1 and folded is null and xp_in = 2');
    await refused('an update of an hour row', 'update public.player_ledger set gold = gold + 1 where user_id = $1 and folded is not null');
    await refused('an early delete of an hour row under the flag', 'delete from public.player_ledger where user_id = $1 and folded is not null', true);
  } finally { await db.query('rollback to savepoint cron'); }
  return red;
}

async function runAll(patches) {
  const { db } = await bootReplay(patches ? { patches, upTo: LAST_PATCHED } : {});
  await pinDice(db);
  const M = await loadEdge(HARNESS.ROOT);
  const red = []; const lines = [];
  await db.query('begin');
  try {
    for (const name of PLAY) {
      await db.query('savepoint fx');
      try {
        const r = await playOne(db, M, name);
        red.push(...r.red);
        lines.push(`  ${name.padEnd(30)} ${r.n} rows written; ${r.fold.rows_in || 0} folded into ${r.fold.rows_out || 0} hour rows over ${r.hours} hero-hour(s); ${r.fold.left || 0} kept for an unknown key`);
        if (FIXTURES[name].door !== 'roster' && (name.startsWith('lone') || FIXTURES[name].door === 'watched')) red.push(...await nextSave(db, M, name, r.fx));
      } catch (e) { red.push(`${name}: ${String(e.message || e).split('\n')[0].slice(0, 300)}`); }
      finally { await db.query('rollback to savepoint fx'); }
    }
    red.push(...await cronArms(db));
  } finally { await db.query('rollback'); }
  return { red, lines };
}

/* Each defect, with 1047's own self-check off (so the replay applies it and this file must catch it). */
const SELFCHECK_OFF = ["begin\n  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_ledger' and column_name = 'folded')",
  "begin\n  return;   -- MUTANT: 1047's self-check off\n  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_ledger' and column_name = 'folded')"];
const MUTANTS = [
  { name: 'an hour row drops its gold_in (and the fold\'s proof is gone)', arm: /CONSERVE .* (budget|rows|rollup)/, file: MIG,
    edits: [SELFCHECK_OFF, ['sum(s.gold_in)::bigint as gold_in', '0::bigint as gold_in'],
      ["  if v_in is distinct from (v_out - 'hours') then", "  if false then"]] },
  { name: 'the fold\'s proof alone refuses an hour row that drops its gold_in', arm: /CONSERVE|COVER|do not sum their detail/, file: MIG,
    edits: [SELFCHECK_OFF, ['sum(s.gold_in)::bigint as gold_in', '0::bigint as gold_in']] },
  { name: 'an hour row lands at its hour\'s end (the last hour of a day files under the next)', arm: /CONSERVE .* budget/, file: MIG,
    edits: [SELFCHECK_OFF, ['           p_lo, g.n', '           p_hi, g.n']] },
  { name: 'the fold reaches rows written before the release', arm: /BOUNDARY/, file: MIG,
    edits: [SELFCHECK_OFF, ['     where l.user_id = p_user and l.slot = p_slot and l.at >= greatest(p_lo, p_from) and l.at < least(p_hi, p_cut)\n       and l.folded is null and m.model is not null',
      '     where l.user_id = p_user and l.slot = p_slot and l.at >= p_lo and l.at < least(p_hi, p_cut)\n       and l.folded is null and m.model is not null']] },
  { name: 'an hour row names its session in the column (a session reader counts it again)', arm: /NEXT-SAVE/, file: MIG,
    edits: [SELFCHECK_OFF, ['    insert into public.player_ledger (user_id, slot, kind, intent, gold_kind, gold,', '    insert into public.player_ledger (session_id, user_id, slot, kind, intent, gold_kind, gold,'],
      ['    select g.user_id, g.slot, g.kind, g.intent, g.gold_kind, g.gold,', '    select g.session_id, g.user_id, g.slot, g.kind, g.intent, g.gold_kind, g.gold,'],
      ["  if new.folded is not null then return new; end if;   -- HOURLY-JOURNAL (1047): an hour row names its session in meta only\n", '']] },
  { name: 'a delete without the fold\'s flag passes the fence', arm: /FENCE: a delete without/, file: MIG,
    edits: [SELFCHECK_OFF, ["      if coalesce(current_setting('hr.ledger_fold', true), '') = 'on' and old.folded is null", '      if old.folded is null']] },
  { name: 'the day budget counts hour rows as one row', arm: /CONSERVE .* budget/, file: MIG,
    edits: [SELFCHECK_OFF, ["     $b$           'rows', coalesce(sum(coalesce(folded, 1)), 0),$b$)) t(n, fn, find, repl)", "     $b$           'rows', count(*),$b$)) t(n, fn, find, repl)"]] },
  { name: 'the rollup counts hour rows as one row', arm: /CONSERVE .* rollup/, file: MIG,
    edits: [SELFCHECK_OFF, ['     $b$             sum(coalesce(l.folded, 1)),$b$),', '     $b$             count(*),$b$),']] },
  { name: 'the switch is not read', arm: /SWITCH/, file: MIG,
    edits: [SELFCHECK_OFF, ["  if not coalesce(c.hourly, false) then return jsonb_build_object('off', true); end if;\n", '']] },
  { name: 'an unknown key is folded away (the model plans every meta)', arm: /BOUNDARY|COVER|CONSERVE/, file: MIG,
    edits: [SELFCHECK_OFF, ["    if node is null then return jsonb_build_object('ok', false, 'why', 'key ' || p_path || k); end if;", '    if node is null then continue; end if;']] },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let caught = 0;
    for (const m of MUTANTS) {
      const { red } = await runAll(new Map([[m.file, m.edits]]));
      const hit = red.filter((x) => m.arm.test(x));
      console.log(`  ${hit.length ? 'caught ' : 'ESCAPED'}  ${m.name}${hit.length ? `  <- ${hit[0].slice(0, 160)}` : `  (red: ${red.slice(0, 2).join(' | ') || 'none'})`}`);
      if (hit.length) caught++;
    }
    console.log(`ledger-hours --mutate: ${caught}/${MUTANTS.length} caught`);
    return caught === MUTANTS.length ? 0 : 1;
  }
  const { red, lines } = await runAll(null);
  for (const l of lines) console.log(l);
  if (red.length) {
    for (const r of red) console.error(`  RED  ${r}`);
    console.error(`\nledger-hours: ${red.length} finding(s): the hourly journal moved a day read, kept detail, or let a row by the fence`);
    return 1;
  }
  console.log('ledger-hours: green — every day read is the same after the fold; the fence holds; both doors save on after it');
  return 0;
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c)).catch((e) => { console.error(e.stack || e.message); process.exit(2); });
