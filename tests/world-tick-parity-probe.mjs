#!/usr/bin/env node
// ============================================================================
// tests/world-tick-parity-probe.mjs — THE SHADOW PARITY PROBE, ON THE REAL CHAIN.
//
//   node tests/world-tick-parity-probe.mjs            the guard
//   node tests/world-tick-parity-probe.mjs --mutate   every planted defect must go RED, by name
//
// Security ruling 1 (docs/planning/SEC_WORLD_TICK_ARM_2026-10-05.md), "What the
// probe must NOT be allowed to write or do", proved by EXECUTION on a PGlite
// database rebuilt from supabase/migrations in tests/schema-apply-order.json
// order, driving the shipped `runTick` through the same one-statement seam
// index.ts gives it, as `hr_engine`:
//
//   PP-0  the migration re-applies byte-identically (idempotent)
//   PP-1  the surface: client roles cannot execute the pair, hr_engine cannot
//         read the table
//   PP-2  a fleet of real fires opens AND closes a probe per channel; the
//         span tiles real shadow windows exactly; the stored result IS the
//         one-span accrual of the stored input on hr_seed's span-start label;
//         and the stored input IS the session the opening window was settled
//         from (re-settled offline, byte-identical delta) — rule 4
//   PP-3  the chain is byte-identical with and without the probe — rule 2
//   PP-4  an open+close moves ZERO tuples in every user table but
//         hr_tick_probe, named per table — rule 1
//   PP-5  the commit refuses a foreign holder and a non-head window AS hr_engine
//   PP-6  no function body outside the probe trio reads hr_tick_probe — rule 3
//   PP-7  a database without the functions skips the step, never the fire
//
// Writes NOTHING to production; synthetic uuids gen_random_uuid() cannot mint.
// Exit: 0 green · 1 a red arm · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { bootReplay, ROOT, inventory } from './schema-replay.mjs';
import { runTick, planSeedLabels, SEED_LABEL_EXPR, CHANNELS }
  from '../supabase/functions/hr-accrue/tick.js';
import { oneSpan, probeResultOf, decodeProbeInput, probeStep, PROBE_FETCH_SQL, PROBE_COMMIT_SQL }
  from '../supabase/functions/hr-accrue/tick-probe.js';

const ARGS = process.argv.slice(2);
const MUTATE = ARGS.includes('--mutate');
const MIG = '2026-10-06-world-tick-parity-probe.sql';

const U = (n) => `00000000-0000-4000-8000-0000000f${String(n).padStart(4, '0')}`;
const FLUSH_MS = 900000;
const CADENCE_MS = 30000;
const FIRES = 36;                       // 9 h of 15-min windows: two probe boundaries at least
const BACK = "interval '9 hours 30 minutes'";
const USER_TABLES_EXEMPT = new Set(['hr_tick_probe']);

const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
};

/* ── ONE GUARD RUN OVER ONE BOOTED DATABASE ─────────────────────────────────
   Returns the list of red arm ids; `log` prints. The mutation driver calls this
   on a database whose migration was patched. */
async function guard(db, opts) {
  const o = opts || {};
  const reds = [];
  const say = (s) => { if (!o.quiet) console.log(s); };
  const judge = (id, ok, good, bad) => {
    if (ok) say(`  ✓ ${id} — ${good}`);
    else { say(`  ✗ ${id} — ${bad}`); reds.push({ id, why: bad }); }
  };
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const asRole = async (role, sql, p) => {
    await db.exec('begin'); await db.exec(`set local role ${role}`);
    try { return { rows: (await db.query(sql, p)).rows }; }
    catch (e) { return { error: String(e.message), code: e.code }; }
    finally { await db.exec('rollback'); }
  };
  const execSeam = async (text, params) => {
    await db.exec('begin'); await db.exec('set local role hr_engine');
    try { return (await db.query(text, params)).rows; }
    finally { await db.exec('commit'); }
  };

  const holder = (await q("select left('cron:' || coalesce(current_database(), 'db'), 64) as h"))[0].h;
  const ACT = (await q("select activity_id from public.hr_activities where kind = 'gather' order by req_lv, activity_id limit 1"))[0]?.activity_id;
  if (!ACT) throw Object.assign(new Error('no gather activity'), { harness: true });
  const T0 = (await q(`select date_trunc('minute', now() - ${BACK}) as t`))[0].t.toISOString();

  // ── PP-0 IDEMPOTENT RE-APPLY ─────────────────────────────────────────────
  if (!o.skipReapply) {
    const sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
    const bodies = async () => canon(await q(
      `select p.oid::regprocedure::text as f, md5(p.prosrc) as m from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in
          ('hr_tick_probe_fetch','hr_tick_probe_commit','hr_tick_probe_prune','hr_assert_grant_hygiene')
        order by 1`));
    const before = canon(await inventory(db)) + await bodies();
    let err = '';
    try { await db.exec(`begin;\n${o.reapplySql || sql}\ncommit;`); } catch (e) { err = String(e.message).slice(0, 160); await db.exec('rollback').catch(() => {}); }
    const after = canon(await inventory(db)) + await bodies();
    const rows = Number((await q('select count(*)::int as n from public.hr_tick_probe'))[0].n);
    judge('PP-0', !err && before === after && rows === 0,
      'a second apply is byte-identical (schema inventory + the four bodies) and leaves no probe row',
      err ? `the second apply FAILED: ${err}` : `the second apply moved the schema or left ${rows} row(s)`);
  }

  // ── PP-1 THE SURFACE, BY EXECUTION ───────────────────────────────────────
  {
    const fetch = 'select public.hr_tick_probe_fetch($1, $2::uuid, 0, \'gather\') as r';
    const roles = ['anon', 'authenticated', 'service_role', 'hr_tick'];
    const open = [];
    for (const r of roles) {
      const exists = (await q('select 1 from pg_roles where rolname = $1', [r])).length > 0;
      if (!exists) continue;
      const res = await asRole(r, fetch, [holder, U(1)]);
      if (!res.error) open.push(r);
    }
    const eng = await asRole('hr_engine', 'select count(*) from public.hr_tick_probe');
    const engCall = await asRole('hr_engine', fetch, [holder, U(1)]);
    judge('PP-1', open.length === 0 && !!eng.error && !engCall.error,
      'no client role can execute the probe pair; hr_engine can call it and cannot read the table',
      `surface wrong: client roles that executed it: [${open}], hr_engine table read `
      + `${eng.error ? 'refused' : 'ALLOWED'}, hr_engine call ${engCall.error || 'ok'}`);
  }

  // ── THE COHORT: one gatherer, one fighter, chained from T0 ────────────────
  const UG = U(1); const UC = U(2);
  /* Every channel SHADOW: since 2026-10-06-world-tick-channel-arm.sql the mode
     is per channel (armed_channels), and shadow is the empty arm set. */
  await db.exec("update public.hr_tick_config set enabled = true, armed_channels = '{}', "
    + "channels = array['combat','gather']::text[] where id;");
  const seedChar = async (u, kind) => {
    await db.exec(`insert into auth.users (id) values ('${u}') on conflict do nothing;`);
    for (const t of ['player_skills', 'player_inventory', 'player_equipment', 'player_progress']) {
      await db.exec(`delete from public.${t} where user_id = '${u}';`);
    }
    if (kind === 'gather') {
      await db.exec(`
        insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                         active_kind, active_id, active_since)
        values ('${u}', 0, 0, 0, 10, 10, 1, '${T0}', 'gather', '${ACT}', '${T0}'::timestamptz - interval '1 hour')
        on conflict (user_id, slot) do update set version = 1, gold = 0, accrued_to = '${T0}',
          active_kind = 'gather', active_id = '${ACT}', active_since = '${T0}'::timestamptz - interval '1 hour';`);
    } else {
      await db.exec(`
        insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
          active_kind, active_id, active_since, auto_eat_enabled, auto_eat_food, auto_eat_pct,
          consec_falls, tool_carry, recovering_until)
        values ('${u}', 0, 100, 0, 61, 61, 7, '${T0}', 'combat', 'goblin',
          '${T0}'::timestamptz - interval '1 hour', true, 'cooked_trout', 70, 0, '{}'::jsonb,
          '${T0}'::timestamptz - interval '2 hours')
        on conflict (user_id, slot) do update set version = 7, hp = 61, max_hp = 61, gold = 100,
          accrued_to = '${T0}', active_kind = 'combat', active_id = 'goblin';`);
      await db.exec(`
        insert into public.player_skills (user_id, slot, skill_id, xp) values
          ('${u}', 0, 'attack', 302288), ('${u}', 0, 'strength', 302288),
          ('${u}', 0, 'defence', 150000), ('${u}', 0, 'hitpoints', 302288);`);
      await db.exec(`insert into public.player_inventory (user_id, slot, item_id, qty)
                     values ('${u}', 0, 'cooked_trout', 40);`);
      await db.exec(`insert into public.player_equipment (user_id, slot, equip_slot, item_id)
                     values ('${u}', 0, 'weapon', 'mithril_sword');`);
    }
    await db.exec(`delete from public.hr_tick_ownership where user_id = '${u}';`);
    await db.exec(`insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
                   values ('${u}', 0, '${kind}', true, '${holder}', now() + interval '30 minutes');`);
  };
  const resetChain = async () => {
    for (const u of [UG, UC]) {
      await db.exec(`delete from public.hr_tick_shadow where user_id = '${u}';`);
      await db.exec(`delete from public.hr_tick_probe where user_id = '${u}';`);
      await db.exec(`update public.hr_tick_ownership set shadow_accrued_to = null, shadow_state = null,
                       lease_holder = '${holder}', lease_until = now() + interval '30 minutes'
                     where user_id = '${u}';`);
    }
  };
  await seedChar(UG, 'gather');
  await seedChar(UC, 'combat');
  await resetChain();
  const psHash = async () => canon(await q(
    `select user_id, md5(ps::text) as m from public.player_state ps where user_id in ($1::uuid, $2::uuid) order by 1`, [UG, UC]));
  const ps0 = await psHash();

  const runFires = async (probe, fires = FIRES) => {
    const opened = new Map();          // probe id -> { span_from, input } captured while open
    const summaries = [];
    for (let i = 0; i < fires; i++) {
      const fire = (await runTick({
        exec: execSeam, probe,
        body: { op: 'tick', roster: [{ user_id: UG, slot: 0 }, { user_id: UC, slot: 0 }],
          cadence_ms: CADENCE_MS, flush_ms: FLUSH_MS },
      })).body;
      summaries.push(fire);
      for (const r of await q(`select id, user_id, channel, to_jsonb(span_from) #>> '{}' as span_from, input
                                 from public.hr_tick_probe where status = 'open'`)) {
        if (!opened.has(Number(r.id))) opened.set(Number(r.id), r);
      }
    }
    return { opened, summaries };
  };
  const chainState = async () => canon({
    shadow: await q(`select user_id, channel, to_jsonb(window_from) #>> '{}' as f, to_jsonb(window_to) #>> '{}' as t,
                            version, delta from public.hr_tick_shadow
                      where user_id in ($1::uuid, $2::uuid) order by user_id, window_from`, [UG, UC]),
    own: await q(`select user_id, channel, to_jsonb(shadow_accrued_to) #>> '{}' as mark, shadow_state
                    from public.hr_tick_ownership where user_id in ($1::uuid, $2::uuid) order by 1`, [UG, UC]),
  });

  /* `quick` is the mutation driver's mode: the planted defects are WRITES, and
     PP-4/PP-5/PP-6 are the arms that name them, so the 72-fire fleet of
     PP-2/PP-3/PP-8 is skipped there (it runs, unmutated, in the guard proper). */
  if (!o.quick) {
  // ── PP-2 A REAL FLEET OF FIRES OPENS AND CLOSES A PROBE PER CHANNEL ──────
  const withProbe = await runFires(undefined);
  const chainWith = await chainState();
  const errs = withProbe.summaries.flatMap((s) => Object.keys(s.reasons || {}).filter((r) => r.startsWith('error:')));
  const probeOutcomes = {};
  for (const s of withProbe.summaries) for (const [k, v] of Object.entries(s.probes || {})) probeOutcomes[k] = (probeOutcomes[k] || 0) + v;
  const shadowedAll = withProbe.summaries.every((s) => s.shadowed === 2);
  judge('PP-2a', errs.length === 0 && shadowedAll && probeOutcomes.probe_closed >= 2,
    `${FIRES} fires, every one shadowed both characters; probe outcomes ${JSON.stringify(probeOutcomes)}`,
    `the fleet did not run clean: errors [${errs.slice(0, 3)}], shadowed-every-fire ${shadowedAll}, `
    + `probe outcomes ${JSON.stringify(probeOutcomes)} (need ≥ 2 probe_closed — one per channel)`);

  const closed = await q(`select id, user_id, channel, to_jsonb(span_from) #>> '{}' as span_from,
                                 to_jsonb(span_to) #>> '{}' as span_to, base_version, version_close,
                                 payload_open, payload_close, result
                            from public.hr_tick_probe where status = 'closed' order by id`);
  const channelsClosed = new Set(closed.map((r) => r.channel));
  judge('PP-2b', channelsClosed.has('gather') && channelsClosed.has('combat'),
    `closed probes on both channels (${closed.length} rows)`, `closed probes only on [${[...channelsClosed]}]`);

  for (const p of closed) {
    const ws = await q(`select to_jsonb(window_from) #>> '{}' as f, to_jsonb(window_to) #>> '{}' as t, version
                          from public.hr_tick_shadow
                         where user_id = $1 and channel = $2 and window_to > $3::timestamptz
                           and window_from < $4::timestamptz order by window_from`,
      [p.user_id, p.channel, p.span_from, p.span_to]);
    let tiles = ws.length > 0 && ws[0].f === p.span_from && ws[ws.length - 1].t === p.span_to;
    for (let i = 1; i < ws.length; i++) if (ws[i].f !== ws[i - 1].t) tiles = false;
    const versions = new Set(ws.map((w) => Number(w.version)));
    judge(`PP-2c[${p.channel}]`, tiles && versions.size === 1 && versions.has(Number(p.base_version)),
      `${ws.length} shadow windows tile [${p.span_from}, ${p.span_to}] exactly, all at version ${p.base_version}`,
      `the span does not tile real windows: ${ws.length} rows, first ${ws[0]?.f} vs ${p.span_from}, `
      + `last ${ws[ws.length - 1]?.t} vs ${p.span_to}, versions [${[...versions]}]`);

    // rule 4, half 1: the stored result IS oneSpan(stored input, span-start seed)
    const cap = withProbe.opened.get(Number(p.id));
    const [{ seed }] = await q(
      `select (public.hr_seed($1::uuid, 0, ${SEED_LABEL_EXPR}) & 4294967295)::bigint as seed
         from (select $2::text as ts) l`, [p.user_id, p.span_from]);
    let recomputed = null; let why = '';
    try {
      recomputed = probeResultOf(oneSpan(p.channel, decodeProbeInput(cap && cap.input),
        Date.parse(p.span_from), Date.parse(p.span_to), Number(seed)));
    } catch (e) { why = String(e.message).slice(0, 120); }
    judge(`PP-2d[${p.channel}]`, !!cap && recomputed && canon(recomputed) === canon(p.result),
      `the stored result is the one-span accrual of the stored input on hr_seed('accrue:'||span_from) `
      + `(ticks ${p.result.ticks}, kills ${p.result.kills}, qty ${p.result.qty})`,
      `the stored result is NOT reproducible from the stored input + span-start seed ${why}\n`
      + `           stored     ${canon(p.result).slice(0, 200)}\n           recomputed ${canon(recomputed).slice(0, 200)}`);

    // rule 4, half 2: the stored input IS the session the opening window settled from
    const [w0] = await q(`select to_jsonb(window_to) #>> '{}' as t, delta from public.hr_tick_shadow
                           where user_id = $1 and channel = $2 and window_from = $3::timestamptz`,
      [p.user_id, p.channel, p.span_from]);
    let same = false; let detail = '';
    try {
      const driver = CHANNELS[p.channel];
      const sess = decodeProbeInput(cap.input);
      const fromMs = Date.parse(p.span_from);
      const geom = { cadenceMs: CADENCE_MS, flushMs: FLUSH_MS, maxPolls: 64, holder };
      const labels = planSeedLabels(driver.settle, sess, fromMs, fromMs + FLUSH_MS,
        Object.assign({}, geom, { markText: p.span_from }));
      const seeds = new Map();
      for (const r of await q(`select l.ord, (public.hr_seed($1::uuid, 0, ${SEED_LABEL_EXPR}) & 4294967295)::bigint as seed
                                 from unnest($2::text[]) with ordinality l(ts, ord)`, [p.user_id, labels.map((x) => x.ts)])) {
        seeds.set(labels[Number(r.ord) - 1].ms, Number(r.seed));
      }
      const run = driver.settle(decodeProbeInput(cap.input), fromMs, fromMs + FLUSH_MS,
        Object.assign({}, geom, { seedOf: (ms) => (seeds.has(ms) ? seeds.get(ms) : null) }));
      const d = run.intents[0] && run.intents[0].args.p_delta;
      same = !!d && canon(JSON.parse(JSON.stringify(d))) === canon(w0.delta);
      detail = `offline ${canon(d).slice(0, 160)}\n           journal ${canon(w0 && w0.delta).slice(0, 160)}`;
    } catch (e) { detail = String(e.message).slice(0, 160); }
    judge(`PP-2e[${p.channel}]`, same,
      'the stored input re-settles the opening window to a delta byte-identical to the journalled one '
      + '(the snapshot IS the session the window was priced from)',
      `the stored input does NOT reproduce the opening window\n           ${detail}`);
  }

  // ── PP-8 THE EVALUATOR'S QUERY RUNS ON THE REAL SCHEMA AND READS THESE ROWS
  //    tools/world-tick-parity.mjs's own SELECT, executed here, classified by
  //    its own rules: every closed probe of PP-2 is eligible (tiles, one
  //    version, no intent, accrued) and its chain side is the shadow sum.
  {
    const { QUERY, readVerdict, selectOnly } = await import('../tools/world-tick-parity.mjs');
    let rows = []; let err = '';
    try { rows = await q(QUERY(14)); } catch (e) { err = String(e.message).slice(0, 160); }
    const v = err ? null : readVerdict(rows.map((r) => Object.assign({}, r, {
      covered_s: Number(r.covered_s), xp: r.xp, items: r.items })), 'unpacked');
    const eligible = v ? v.records.filter((r) => !r.discard) : [];
    const chainTicks = eligible.reduce((a, r) => a + r.chain.ticks, 0);
    const shadowTicks = Number((await q(
      `select coalesce(sum(s.would_ticks), 0)::bigint as t from public.hr_tick_shadow s
         join public.hr_tick_probe p on p.user_id = s.user_id and p.channel = s.channel
        where p.status = 'closed' and s.window_from >= p.span_from and s.window_to <= p.span_to`))[0].t);
    judge('PP-8', !err && selectOnly(QUERY(14)) && eligible.length === closed.length && closed.length >= 2
        && chainTicks === shadowTicks,
      `the evaluator's SELECT runs on the replayed schema; ${eligible.length}/${closed.length} closed probes `
      + `eligible, chain ticks ${chainTicks} = the shadow windows' own sum `
      + `(${eligible.map((r) => `${r.channel} ticks one ${r.one.ticks} / windows ${r.chain.ticks}`).join(', ')})`,
      err ? `the evaluator's query FAILED on the real schema: ${err}`
        : `evaluator mismatch: ${eligible.length} eligible of ${closed.length} closed `
          + `(${JSON.stringify(v.records.map((r) => r.discard))}), chain ticks ${chainTicks} vs shadow ${shadowTicks}`);
  }

  // ── PP-3 THE CHAIN IS BYTE-IDENTICAL WITH AND WITHOUT THE PROBE ──────────
  await resetChain();
  await runFires(false);
  const chainWithout = await chainState();
  const probesWithout = Number((await q('select count(*)::int as n from public.hr_tick_probe'))[0].n);
  judge('PP-3', chainWith === chainWithout && probesWithout === 0 && (await psHash()) === ps0,
    'every shadow window, the shadow mark and the carrier are byte-identical with and without the probe; '
    + 'player_state never moved',
    `the probe CHANGED the chain (with ${chainWith.length} vs without ${chainWithout.length} bytes; `
    + `probe rows without ${probesWithout}; player_state moved ${(await psHash()) !== ps0})`);

  }

  // ── PP-4 OPEN + CLOSE TOUCH hr_tick_probe AND NOTHING ELSE, BY NAME ──────
  {
    await resetChain();
    await runFires(undefined, o.quick ? 2 : FIRES);
    const [head] = await q(`select to_jsonb(s.window_from) #>> '{}' as f, to_jsonb(s.window_to) #>> '{}' as t
                              from public.hr_tick_shadow s join public.hr_tick_ownership o
                                on o.user_id = s.user_id and o.channel = s.channel and o.shadow_accrued_to = s.window_to
                             where s.user_id = $1`, [UG]);
    const [openRow] = await q(`select id from public.hr_tick_probe where user_id = $1 and status = 'open'`, [UG]);
    await db.exec('begin');
    const snap = async () => new Map((await db.query(
      'select relname, n_tup_ins, n_tup_upd, n_tup_del from pg_stat_xact_user_tables')).rows
      .map((r) => [r.relname, `${r.n_tup_ins}/${r.n_tup_upd}/${r.n_tup_del}`]));
    const before = await snap();
    const own0 = canon(await q(`select md5(o::text) m from public.hr_tick_ownership o where user_id = $1`, [UG]));
    await db.exec('set local role hr_engine');
    let r1; let r2;
    try {
      r1 = (await db.query(PROBE_FETCH_SQL, [holder, UG, 0, 'gather'])).rows[0].r;
      r2 = (await db.query(PROBE_COMMIT_SQL, [holder, UG, 0, 'gather', head.f, head.t, 'unpacked',
        openRow ? Number(openRow.id) : null, '{"ticks":1}', '{"skills":{}}'])).rows[0].r;
    } finally { await db.exec('reset role'); }
    const after = await snap();
    const own1 = canon(await q(`select md5(o::text) m from public.hr_tick_ownership o where user_id = $1`, [UG]));
    await db.exec('rollback');
    const moved = [...after.entries()].filter(([t, v]) => !USER_TABLES_EXEMPT.has(t) && (before.get(t) || '0/0/0') !== v)
      .map(([t, v]) => `${t} ${before.get(t) || '0/0/0'} -> ${v}`);
    const probeMoved = (before.get('hr_tick_probe') || '0/0/0') !== after.get('hr_tick_probe');
    judge('PP-4', r1 && r1.ok === true && r2 && r2.ok === true && probeMoved && moved.length === 0 && own0 === own1,
      'a fetch + close/void + open as hr_engine wrote hr_tick_probe and moved ZERO tuples in every other '
      + 'user table; the hr_tick_ownership row is md5-identical',
      `the probe wrote outside hr_tick_probe: [${moved.join('; ')}]`
      + `${own0 !== own1 ? ' hr_tick_ownership row CHANGED' : ''}`
      + `${probeMoved ? '' : ' (and it did not write hr_tick_probe at all)'} fetch ${canon(r1)} commit ${canon(r2)}`);

    // ── PP-5 THE REFUSALS, AS THE EDGE'S ROLE ─────────────────────────────
    const foreign = await asRole('hr_engine', PROBE_COMMIT_SQL,
      ['someone-else', UG, 0, 'gather', head.f, head.t, 'unpacked', null, null, '{"k":1}']);
    const stale = await asRole('hr_engine', PROBE_COMMIT_SQL,
      [holder, UG, 0, 'gather', T0, new Date(Date.parse(T0) + FLUSH_MS).toISOString(), 'unpacked', null, null, '{"k":1}']);
    const e1 = foreign.rows && foreign.rows[0].r.error; const e2 = stale.rows && stale.rows[0].r.error;
    judge('PP-5', e1 === 'no_lease' && e2 === 'not_chain_head',
      'as hr_engine the commit refuses a foreign holder (no_lease) and a window that is not the chain head (not_chain_head)',
      `refusals wrong: foreign holder -> ${e1 || foreign.error} (want no_lease), `
      + `stale window -> ${e2 || stale.error} (want not_chain_head)`);
  }

  // ── PP-6 NOTHING ELSE READS THE TABLE ────────────────────────────────────
  {
    const rows = await q(`select p.oid::regprocedure::text as f from pg_proc p
                            join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname not in ('pg_catalog', 'information_schema')
                             and p.proname not in ('hr_tick_probe_fetch','hr_tick_probe_commit','hr_tick_probe_prune',
                                                   'hr_assert_grant_hygiene')
                             and p.prosrc ~ '\\mhr_tick_probe\\M'`);
    const views = await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                            where c.relkind in ('v','m') and pg_get_viewdef(c.oid) ~ '\\mhr_tick_probe\\M'`);
    judge('PP-6', rows.length === 0 && views.length === 0,
      'no function or view outside the probe trio names hr_tick_probe — no settle, roster, hr_state_of, '
      + 'stall or 8a/8b/8c read can ever sum a probe row as a window',
      `hr_tick_probe is read by: ${[...rows.map((r) => r.f), ...views.map((v) => v.relname)].join(', ')}`);
  }

  // ── PP-7 A DATABASE WITHOUT THE PAIR SKIPS THE STEP, NOT THE FIRE ─────────
  {
    const absent = async () => { const e = new Error('function does not exist'); e.code = '42883'; throw e; };
    let out = null;
    for (let t = 0; t < 4 * 3600 * 1000 && out === null; t += FLUSH_MS) {
      out = await probeStep(absent, { holder, userId: UG, slot: 0, channel: 'gather', session: {},
        windowFrom: new Date(Date.UTC(2026, 0, 1) + t).toISOString(),
        windowTo: new Date(Date.UTC(2026, 0, 1) + t + FLUSH_MS).toISOString(),
        budget: { left: 1 }, seedLadder: async () => new Map() });
    }
    judge('PP-7', out === 'probe_absent',
      'on 42883 the probe step answers probe_absent and the caller keeps its outcome',
      `on 42883 the probe step answered ${out}`);
  }

  return reds;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE MUTATION PROOF — every planted write must go RED, BY TABLE NAME
// ═══════════════════════════════════════════════════════════════════════════
const RETURN_OK = "  return jsonb_build_object('ok', true, 'closed', v_closed, 'voided', v_voided,";
const MUTANTS = {
  /* "a probe that writes player_state must go red by name" */
  writesPlayerState: { name: 'player_state', apply: 'player_state', patch: [[RETURN_OK,
    "  update public.player_state set version = version where user_id = p_user and slot = p_slot;\n" + RETURN_OK]] },
  /* "a mutation that makes the probe advance shadow_accrued_to going red" */
  advancesShadowMark: { name: 'hr_tick_ownership', apply: 'hr_tick_ownership', patch: [[RETURN_OK,
    "  update public.hr_tick_ownership set shadow_accrued_to = shadow_accrued_to + interval '1 millisecond'\n"
    + '   where user_id = p_user and slot = p_slot and channel = p_channel;\n' + RETURN_OK]] },
  /* A probe row summed as a settled window: written INTO the journal 8a/8b/8c read. */
  writesShadowJournal: { name: 'hr_tick_shadow', apply: 'hr_tick_shadow', patch: [[RETURN_OK,
    '  insert into public.hr_tick_shadow (user_id, slot, channel, holder, window_from, window_to, version, intent_id, delta)\n'
    + "  values (p_user, p_slot, p_channel, p_holder, p_window_from, p_window_to, coalesce(v_ver, 0), gen_random_uuid(), '{}'::jsonb);\n"
    + RETURN_OK]] },
  /* The lease check dropped: any holder may write any character's probe. */
  noLease: { name: 'no_lease', apply: 'p2a:', patch: [[
    "     or v_own.lease_until is null or v_own.lease_until <= now() then\n"
    + "    return jsonb_build_object('ok', false, 'error', 'no_lease');\n  end if;\n\n  -- (5) THE ANCHOR",
    "     or v_own.lease_until is null or v_own.lease_until <= now() then\n"
    + "    null;\n  end if;\n\n  -- (5) THE ANCHOR"]] },
  /* The anchor dropped: a caller names any span it likes. */
  noChainHead: { name: 'not_chain_head', apply: 'p2b:', patch: [[
    "  if v_own.shadow_accrued_to is distinct from p_window_to then\n    return jsonb_build_object('ok', false, 'error', 'not_chain_head',",
    "  if false then\n    return jsonb_build_object('ok', false, 'error', 'not_chain_head',"]] },
};
/* Variant (b): the migration's own self-check is DISARMED — its executed block
   (p2..p8) rolls back before its first arm, and the two catalogue arms that
   read the planted body (p6, p6b) only notice — so the replay applies the
   defect and the GUARD's executed arm must be the one that names it. */
const DISARM = [
  ['  begin\n    -- ── A PROBE CHARACTER WITH A SHADOW CHAIN HEAD',
    "  begin\n    raise exception 'HR1006_ROLLBACK_OK';\n    -- ── A PROBE CHARACTER WITH A SHADOW CHAIN HEAD"],
  ...['p6', 'p6b'].map((id) => [`raise exception '${id}:`, `raise notice '${id}:`]),
];

async function boot(patches) {
  const { db, failures } = await bootReplay(patches ? { patches: new Map([[MIG, patches]]) } : {});
  if (failures.length) throw Object.assign(new Error(JSON.stringify(failures).slice(0, 400)), { harness: true });
  return db;
}

if (MUTATE) {
  console.log('world-tick-parity-probe --mutate: each planted defect must go RED by name, twice');
  let blind = 0;
  for (const [name, m] of Object.entries(MUTANTS)) {
    // (a) the migration's self-check, armed: the APPLY must refuse, naming it.
    let applyRed = false; let applyWhy = '';
    try { await boot(m.patch); } catch (e) {
      applyWhy = String(e.message);
      applyRed = applyWhy.includes(m.apply);
    }
    // (b) self-check disarmed: the GUARD must name it.
    let guardRed = false; let guardWhy = '';
    try {
      const db = await boot([...m.patch, ...DISARM]);
      const reds = await guard(db, { quiet: true, skipReapply: true, quick: true });
      guardWhy = reds.map((r) => `${r.id}: ${r.why}`).join(' | ');
      guardRed = reds.some((r) => r.why.includes(m.name));
    } catch (e) { guardWhy = 'harness: ' + String(e.message).slice(0, 200); }
    const ok = applyRed && guardRed;
    if (!ok) blind++;
    console.log(`  ${ok ? '✓' : '✗'} --${name}: apply ${applyRed ? 'RED' : 'GREEN'} `
      + `(${applyWhy.match(/p\d+[a-z0-9]*: [^"\\]{0,90}/)?.[0] || applyWhy.slice(0, 90)}); `
      + `guard ${guardRed ? 'RED' : 'GREEN'} (${guardWhy.slice(0, 140)})`);
  }
  if (blind) { console.error(`\nworld-tick-parity-probe --mutate: ${blind} mutant(s) not caught by name`); process.exit(1); }
  console.log('\nworld-tick-parity-probe --mutate: every mutant RED by name, at apply AND in the guard.');
  process.exit(0);
}

console.log('world-tick-parity-probe: the probe writes its own rows and nothing else');
let db;
try { db = await boot(null); } catch (e) { console.error(String(e.message)); process.exit(2); }
let reds;
try { reds = await guard(db, {}); } catch (e) {
  console.error('harness:', e.stack || e.message); process.exit(2);
}
if (reds.length) { console.error(`\nworld-tick-parity-probe: ${reds.length} red arm(s)`); process.exit(1); }
console.log('\nworld-tick-parity-probe: green.\n   mutation proof: node tests/world-tick-parity-probe.mjs --mutate');
