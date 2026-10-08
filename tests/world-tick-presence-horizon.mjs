// ============================================================================
// tests/world-tick-presence-horizon.mjs — NO ABSENCE IS PAID TWICE, NONE PAST
// ITS CAP: THE PRESENCE HORIZON, AWAY (TICK) AND ATTENDED (RETURN)
//
//   node tests/world-tick-presence-horizon.mjs            the guard
//   node tests/world-tick-presence-horizon.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-10-world-tick-presence-horizon.sql (Game Designer
// ruling on B1, 2026-10-08): the armed tick pays nothing past (last REAL
// return + hr_offline_cap_ms), and the return's accrue pays
// max(0, min(absence, cap) - tick-paid). Measured on the PGlite chain replay,
// as hr_engine (the edge's role) for settles and the cap read; the "tick
// already paid this" prefix is an hr_apply in a transaction carrying the
// tick's own marker, exactly as hr_tick_settle sets it.
//
//   P-IDEM  the file re-applies byte-identically
//   H1  ★ AWAY, 20 h, cap 12 h: tick writes never move the anchor; the window
//           ending AT the horizon pays; the next is refused past_horizon and
//           journalled ONCE; refusals move nothing
//   H2  ★ RETURN after it: the spent absence is forfeited (intent
//           horizon_forfeit), the anchor moves to the return, the read is the
//           full cap for the NEXT absence. Paid for the 20 h: tick 12 h +
//           accrue 0 = 12 h
//   H3  ★ PARTIAL: tick paid 5 h, then stopped; the return reads exactly the
//           7 h remainder (no double pay), nothing forfeited
//   H4  ★ NEVER TICKED: the same 20 h absence reads the full cap — the two
//           paths pay the same total
//   H5  ★ ATTENDED: an online (non-tick) settle carries the anchor; the read is
//           the full cap and the next armed window pays
//   H6  ★ ONE CAP SOURCE: a clan-level-7 character (cap 15 h) is paid to
//           R + 15 h by the tick and reads the 15 h-based remainder on return
//   H7  no anchor -> refused no_return_anchor; a partied spent character is
//           neither forfeited nor capped by the solo horizon
//   H8  hr_accrue_cap_ms: hr_engine only (hr_tick refused); the stamp: no
//           role; both tables: no privilege, RLS forced, no policy
//   E1  ★ THE EDGE reads hr_accrue_cap_ms at all four accrue-cap sites
//           (index.ts, set-activity.js, claim-reward.js, spend.js), never
//           hr_offline_cap_ms there
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const MIG = '2026-10-10-world-tick-presence-horizon.sql';
const MIG_SQL = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
const EDGE_FILES = ['index.ts', 'set-activity.js', 'claim-reward.js', 'spend.js'];
const EDGE = Object.fromEntries(await Promise.all(EDGE_FILES.map(async (f) =>
  [f, (await readFile(join(ROOT, 'supabase', 'functions', 'hr-accrue', f), 'utf8')).replace(/\r\n/g, '\n')])));

function fnSource(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const as = sql.indexOf('\nas $$', start);
  const end = sql.indexOf('$$;', as + 6);
  if (start < 0 || as < 0 || end < 0) throw Object.assign(new Error(`${name} not found`), { harness: true });
  return sql.slice(start, end + 3);
}

const H = 3600000;
let RUN = 0;
let SEQ = 0;
const uid = () => { SEQ += 1; return `00000000-0000-4000-8000-${(0xa000 + RUN).toString(16)}${SEQ.toString(16).padStart(8, '0')}`; };
const HOLDER = 'guard:presence-horizon';

/** E1: the edge's accrue-cap reads. `edge` is the (possibly mutated) source map. */
function edgeReads(edge) {
  const bad = [];
  for (const f of EDGE_FILES) {
    const s = edge[f];
    if (!/public\.hr_accrue_cap_ms\(/.test(s)) bad.push(`${f}: no hr_accrue_cap_ms read`);
    if (/public\.hr_offline_cap_ms\([^)]*\)\s*(end\s+)?as cap_ms/.test(s)) bad.push(`${f}: reads hr_offline_cap_ms as the accrue cap`);
  }
  return bad;
}

async function arms(db, { log = true, edge = EDGE } = {}) {
  RUN += 1;
  const red = [];
  const ok = (id, cond, okMsg, badMsg) => {
    if (cond) { if (log) console.log(`  ✓ ${id} — ${okMsg}`); } else { red.push(id); if (log) console.log(`  ✗ ${id} — ${badMsg}`); }
  };
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const gact = (await one("select activity_id from public.hr_activities where kind = 'gather' order by activity_id limit 1"))?.activity_id;
  const cact = (await one("select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 1"))?.activity_id;
  if (!gact || !cact) throw Object.assign(new Error('hr_activities lacks a gather or combat row'), { harness: true });
  await db.exec("update public.hr_tick_config set enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['gather'] where id;");
  const nowMs = new Date((await one("select date_trunc('second', now()) as t")).t).getTime();
  const iso = (ms) => new Date(ms).toISOString();
  const R0 = nowMs - 20 * H;

  const char = async (markMs = R0) => {
    const u = uid();
    await q('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
    await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to, active_kind, active_id, active_since)
             values ($1, 0, 0, 0, 10, 10, 1, $2, 'gather', $3, '2000-01-01 00:00:00+00')`, [u, iso(markMs), gact]);
    await q(`insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
             values ($1, 0, 'gather', true, $2, now() + interval '5 minutes')`, [u, HOLDER]);
    return u;
  };
  const st = (u) => one('select accrued_to, version from public.player_state where user_id = $1 and slot = 0', [u]);
  const anchor = async (u) => (await one('select real_return_at from public.hr_return_anchor where user_id = $1 and slot = 0', [u]))?.real_return_at ?? null;
  const ms = (t) => new Date(t).getTime();
  const capOf = async (u) => Number((await one('select public.hr_offline_cap_ms($1::uuid, 0) as c', [u])).c);
  /** A transaction marked as the world tick paying [mark, toMs] (what the tick did in real time). */
  const tickPaid = async (u, toMs) => {
    const s = await st(u);
    await db.exec("begin; select set_config('hr.frame_origin', 'tick', true); set local role hr_engine;");
    try {
      return (await one('select public.hr_apply($1::uuid, 0, $2::bigint, gen_random_uuid(), $3::text::jsonb) as r',
        [u, s.version, JSON.stringify({ accrued_to: iso(toMs), journal: { kind: 'gather', intent: 'accrue', meta: { src: 'tick', ticks: 1 } } })])).r;
    } finally { await db.exec('commit;'); }
  };
  /** The real fence, one armed window [fromMs, toMs]. */
  const settle = async (u, fromMs, toMs) => {
    const s = await st(u);
    await db.exec('begin; set local role hr_engine;');
    try {
      return (await one(`select public.hr_tick_settle($1, $2::uuid, 0, 'gather', $3::bigint, $4::timestamptz, $5::timestamptz,
                           gen_random_uuid(), $6::text::jsonb) as r`,
        [HOLDER, u, s.version, iso(fromMs), iso(toMs),
          JSON.stringify({ accrued_to: iso(toMs), journal: { kind: 'gather', intent: 'accrue', meta: { src: 'tick', ticks: 1 } } })])).r;
    } catch (e) { return { threw: e.message }; } finally { try { await db.exec('commit;'); } catch { await db.exec('rollback;'); } }
  };
  const capRead = async (u) => {
    await db.exec('begin; set local role hr_engine;');
    try { return Number((await one('select public.hr_accrue_cap_ms($1::uuid, 0) as c', [u])).c); }
    catch (e) { return `threw: ${e.message}`; } finally { try { await db.exec('commit;'); } catch { await db.exec('rollback;'); } }
  };
  const ledger = async (u) => Number((await one('select count(*)::int as n from public.player_ledger where user_id = $1', [u])).n);
  const parkRows = (u) => q('select anchor_at, horizon_at, cap_ms, mark from public.hr_tick_horizon_log where user_id = $1', [u]);

  // ── H1 / H2 ─────────────────────────────────────────────────────────────
  {
    const G = await char();
    const cap = await capOf(G);
    const Hz = R0 + cap;
    const pre = await tickPaid(G, Hz - 90000);
    const anchorAfterTick = await anchor(G);
    const paid = await settle(G, Hz - 90000, Hz);
    const l0 = await ledger(G);
    const r1 = await settle(G, Hz, Hz + 90000);
    const r2 = await settle(G, Hz, Hz + 90000);
    const park = await parkRows(G);
    const s1 = await st(G);
    ok('H1', pre?.ok === true && ms(anchorAfterTick) === R0 && paid?.ok === true
      && r1?.error === 'past_horizon' && r2?.error === 'past_horizon' && Number(r1.cap_ms) === cap
      && park.length === 1 && ms(park[0].anchor_at) === R0 && ms(park[0].horizon_at) === Hz && Number(park[0].cap_ms) === cap
      && (await ledger(G)) === l0 && ms(s1.accrued_to) === Hz,
      'tick writes leave the anchor at the last real return; the window ending AT R + cap pays; past it is refused '
      + 'past_horizon and journalled once; refusals move nothing',
      JSON.stringify({ anchorAfterTick, paid, r1, park, s1 }));
    const c = await capRead(G);
    const s2 = await st(G);
    const now2 = ms((await one('select now() as t')).t);
    const forfeit = await q(`select meta from public.player_ledger where user_id = $1 and intent = 'horizon_forfeit'`, [G]);
    ok('H2', c === cap && forfeit.length === 1 && ms(forfeit[0].meta.anchor) === R0
      && Math.abs(ms(s2.accrued_to) - now2) < 5000 && Math.abs(ms(await anchor(G)) - ms(s2.accrued_to)) === 0
      && Hz - R0 === cap,
      `the return forfeits the spent absence and reads the full cap for the next; the 20 h absence was paid ${cap / H} h `
      + '(tick) + 0 (accrue)',
      JSON.stringify({ c, cap, forfeit, s2 }));
  }

  // ── H3 / H4 ─────────────────────────────────────────────────────────────
  {
    const P = await char();
    const N = await char();
    const cap = await capOf(P);
    await tickPaid(P, R0 + 5 * H);
    const v0 = (await st(P)).version;
    const cp = await capRead(P);
    const cn = await capRead(N);
    ok('H3', cp === cap - 5 * H && (await st(P)).version === v0,
      `tick paid 5 h of a 20 h absence; the return reads exactly the ${(cap - 5 * H) / H} h remainder, nothing forfeited`,
      JSON.stringify({ cp, want: cap - 5 * H }));
    ok('H4', cn === cap && Number((await st(N)).version) === 1,
      'a never-ticked 20 h absence reads the full cap: both paths pay the same total', JSON.stringify({ cn, cap }));
  }

  // ── H5 ATTENDED ─────────────────────────────────────────────────────────
  {
    const O = await char();
    const cap = await capOf(O);
    await db.exec('begin; set local role hr_engine;');
    const att = (await one(`select public.hr_apply($1::uuid, 0, 1, gen_random_uuid(), $2::text::jsonb) as r`,
      [O, JSON.stringify({ accrued_to: iso(nowMs - 90000), journal: { kind: 'gather', intent: 'accrue', meta: { ticks: 1 } } })])).r;
    await db.exec('commit;');
    const a = await anchor(O);
    const c = await capRead(O);
    const w = await settle(O, nowMs - 90000, nowMs);
    ok('H5', att?.ok === true && ms(a) === nowMs - 90000 && c === cap && w?.ok === true,
      'an attended settle carries the anchor; the read is the full cap; the next armed window pays',
      JSON.stringify({ att, a, c, w }));
  }

  // ── H6 ONE CAP SOURCE (clan level 7: 15 h) ──────────────────────────────
  {
    const C = await char();
    const clan = (await one(`insert into public.clans (name, created_by, level) values ($1, $2, 7) returning id`,
      [`hz${RUN}x${SEQ}`, C])).id;
    await q('insert into public.clan_members (clan_id, user_id, role) values ($1, $2, $3)', [clan, C, 'leader']);
    const cap = await capOf(C);
    const Hz = R0 + cap;
    await tickPaid(C, Hz - 90000);
    const paid = await settle(C, Hz - 90000, Hz);
    const past = await settle(C, Hz, Hz + 90000);
    // A second clan character, ticked 5 h: its remainder is cap - 5 h.
    const C2 = await char();
    await q('insert into public.clan_members (clan_id, user_id, role) values ($1, $2, $3)', [clan, C2, 'member']);
    await tickPaid(C2, R0 + 5 * H);
    const c2 = await capRead(C2);
    ok('H6', cap === 15 * H && paid?.ok === true && past?.error === 'past_horizon' && c2 === cap - 5 * H,
      'a 15 h clan cap: the tick pays to R + 15 h and stops there; the return reads the 15 h-based remainder',
      JSON.stringify({ cap, paid, past, c2 }));
  }

  // ── H7 no anchor; partied ───────────────────────────────────────────────
  {
    const X = await char(nowMs - 2 * H);
    await q('delete from public.hr_return_anchor where user_id = $1', [X]);
    const r = await settle(X, nowMs - 2 * H, nowMs - 2 * H + 90000);
    const Qp = await char();
    const pid = (await one('insert into public.party (leader_user, leader_slot) values ($1, 0) returning id', [Qp])).id;
    await q(`insert into public.party_member (party_id, user_id, slot, role, joined_at) values ($1, $2, 0, 'leader', now())`, [pid, Qp]);
    await q('insert into public.party_hunt (party_id, active_id, accrued_to) values ($1, $2, now())', [pid, cact]);
    await q(`update public.hr_return_anchor set real_return_at = $2 where user_id = $1`, [Qp, iso(R0 - 10 * H)]);
    const cap = await capOf(Qp);
    const c = await capRead(Qp);
    ok('H7', r?.error === 'no_return_anchor' && c === cap && Number((await st(Qp)).version) === 1,
      'no anchor pays nothing (no_return_anchor); a partied spent character is not forfeited or solo-capped',
      JSON.stringify({ r, c }));
  }

  // ── H8 grants ───────────────────────────────────────────────────────────
  {
    const has = async (role, fn) => (await one(`select has_function_privilege($1, $2, 'execute') as x`, [role, fn])).x;
    const bad = [];
    if (!(await has('hr_engine', 'public.hr_accrue_cap_ms(uuid,integer)'))) bad.push('hr_engine cannot read the cap');
    for (const role of ['anon', 'authenticated', 'service_role', 'hr_tick']) {
      if (await has(role, 'public.hr_accrue_cap_ms(uuid,integer)')) bad.push(`${role}:cap`);
    }
    for (const role of ['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick']) {
      if (await has(role, 'public.hr_return_anchor_stamp()')) bad.push(`${role}:stamp`);
      for (const t of ['public.hr_return_anchor', 'public.hr_tick_horizon_log']) {
        if ((await one(`select has_table_privilege($1, $2, 'select,insert,update,delete,truncate') as x`, [role, t])).x) bad.push(`${role}:${t}`);
      }
    }
    let refused = false;
    await db.exec('begin; set local role hr_tick;');
    try { await q("select public.hr_accrue_cap_ms('00000000-0000-4000-8000-000000000001'::uuid, 0)"); }
    catch (e) { refused = /permission denied|not callable/.test(e.message); }
    try { await db.exec('rollback;'); } catch { /* */ }
    ok('H8', bad.length === 0 && refused, 'the cap read is hr_engine only; the stamp and both tables reach no role',
      JSON.stringify({ bad, refused }));
  }

  // ── E1 the edge half ────────────────────────────────────────────────────
  {
    const bad = edgeReads(edge);
    ok('E1', bad.length === 0, 'the edge reads hr_accrue_cap_ms at all four accrue-cap sites', JSON.stringify(bad));
  }
  await db.exec("update public.hr_tick_config set armed_channels = '{}' where id;");
  return red;
}

const bodies = async (db) => (await db.query(
  `select p.proname || ':' || md5(pg_get_functiondef(p.oid)) as h from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('hr_tick_settle', 'hr_accrue_cap_ms', 'hr_return_anchor_stamp', 'hr_assert_grant_hygiene')
    order by 1`)).rows.map((r) => r.h).join(',');

async function boot() { return (await bootReplay({ upTo: MIG })).db; }

if (!MUTATE) {
  console.log('\nworld-tick-presence-horizon: no absence is paid twice and none past its cap (away tick + attended return)');
  let db;
  try { db = await boot(); } catch (e) { console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2); }
  const inv0 = JSON.stringify(await inventory(db));
  const b0 = await bodies(db);
  const a0 = Number((await db.query('select count(*)::int as n from public.hr_return_anchor')).rows[0].n);
  let err = null;
  try { await db.exec(MIG_SQL); } catch (e) { err = String(e.message).split('\n')[0]; }
  const idem = !err && JSON.stringify(await inventory(db)) === inv0 && (await bodies(db)) === b0 && b0.split(',').length === 4
    && Number((await db.query('select count(*)::int as n from public.hr_return_anchor')).rows[0].n) === a0;
  console.log(idem ? `  ✓ P-IDEM — ${MIG} re-applied byte-identically (§0 accepted, §8 passed twice)`
    : `  ✗ P-IDEM — ${err || 'the re-apply moved the schema, a body or the anchors'}`);
  let red;
  try { red = await arms(db); } catch (e) {
    if (e.harness) { console.error(`harness: ${e.message}`); process.exit(2); }
    throw e;
  }
  if (!idem) red.push('P-IDEM');
  console.log(red.length ? `\nRED: ${red.join(', ')}`
    : '\nGREEN: a ticked absence is paid exactly to its horizon and never again on return; one cap source; the edge reads it');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate ────────────────────────────────────────────────────────────────
const SRC = {
  settle: fnSource(MIG_SQL, 'hr_tick_settle'),
  cap: fnSource(MIG_SQL, 'hr_accrue_cap_ms'),
  stamp: fnSource(MIG_SQL, 'hr_return_anchor_stamp'),
};
const RESTORE = `${SRC.settle}\n${SRC.cap}\n${SRC.stamp}\n`
  + 'revoke execute on function public.hr_accrue_cap_ms(uuid, integer) from public;\n'
  + 'revoke execute on function public.hr_accrue_cap_ms(uuid, integer) from anon, authenticated, service_role, hr_tick;\n'
  + 'grant execute on function public.hr_accrue_cap_ms(uuid, integer) to hr_engine;\n'
  + 'revoke execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb) from public;\n'
  + 'revoke execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb) from anon, authenticated, service_role, hr_tick;\n'
  + 'grant execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb) to hr_engine;\n'
  + 'revoke execute on function public.hr_return_anchor_stamp() from public;\n'
  + 'revoke execute on function public.hr_return_anchor_stamp() from anon, authenticated, service_role, hr_engine, hr_tick;';
const MUTANTS = [
  { name: 'noHorizon', fn: 'settle', why: 'the tick pays past last real return + cap', expect: /H1|H6/,
    find: '  if p_window_to > v_horizon then\n', repl: '  if false then\n' },
  { name: 'anchorFromLastTick', fn: 'stamp', why: 'the horizon is measured from the last TICK, not the last real return', expect: /H1/,
    find: "  if coalesce(current_setting('hr.frame_origin', true), '') = 'tick' then\n    return null;\n  end if;\n", repl: '' },
  { name: 'noOffsetOnReturn', fn: 'cap', why: 'the return pays the full cap again after the tick paid part of it (double pay)', expect: /H3|H6/,
    find: '  if v_left >= c_min_ms then\n    return least(v_cap, v_left);\n  end if;\n', repl: '  if v_left >= c_min_ms then\n    return v_cap;\n  end if;\n' },
  { name: 'fenceCapNotAccrues', fn: 'settle', why: "the tick's horizon uses a cap other than accrue's (a 12 h literal)", expect: /H6/,
    find: "  v_horizon := v_anchor + v_cap_ms * interval '1 millisecond';", repl: "  v_horizon := v_anchor + 43200000 * interval '1 millisecond';" },
  { name: 'returnCapNotAccrues', fn: 'cap', why: "the return's cap is not hr_offline_cap_ms (a 12 h literal)", expect: /H6/,
    find: '  v_cap := coalesce(public.hr_offline_cap_ms(p_user, p_slot), 0);', repl: '  v_cap := 43200000;' },
  { name: 'noForfeit', fn: 'cap', why: 'a spent absence is never closed (the player is stuck below the floor for ever)', expect: /H2/,
    find: '  if now() <= v_anchor + v_cap * interval \'1 millisecond\' then\n', repl: '  if true then\n' },
  { name: 'noAnchorPays', fn: 'settle', why: 'a character with no anchor is paid', expect: /H7/,
    find: "  if v_anchor is null then\n    return jsonb_build_object('ok', false, 'error', 'no_return_anchor', 'mode', 'armed',",
    repl: "  if false then\n    return jsonb_build_object('ok', false, 'error', 'no_return_anchor', 'mode', 'armed'," },
  { name: 'forfeitsPartied', fn: 'cap', why: 'a partied character is forfeited (breaks invariant 8)', expect: /H7/,
    find: '  if public.hr_partied(p_user, p_slot) then return v_cap; end if;\n', repl: '' },
  { name: 'grantTick', fn: 'cap', why: 'hr_tick is granted the cap read', expect: /H8/,
    find: null, repl: '\ngrant execute on function public.hr_accrue_cap_ms(uuid, integer) to hr_tick;' },
  { name: 'edgeReadsRawCap', fn: 'edge', why: "the edge's accrue read keeps hr_offline_cap_ms (the return pays the tick-paid time again)", expect: /E1/,
    file: 'index.ts', find: 'public.hr_accrue_cap_ms(${user}::uuid, ${slot}::int)  as cap_ms,', repl: 'public.hr_offline_cap_ms(${user}::uuid, ${slot}::int) as cap_ms,' },
  { name: 'edgeSwitchRawCap', fn: 'edge', why: "the switch's collect keeps hr_offline_cap_ms", expect: /E1/,
    file: 'set-activity.js', find: 'case when g.allowed then public.hr_accrue_cap_ms($1::uuid, $2::int) end as cap_ms,',
    repl: 'case when g.allowed then public.hr_offline_cap_ms($1::uuid, $2::int) end as cap_ms,' },
];

const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
console.log('\nworld-tick-presence-horizon --mutate: every mutant must go RED on its named arm');
let db;
try { db = await boot(); } catch (e) { console.error(`harness: ${e.message}`); process.exit(2); }
const control = await arms(db, { log: false });
if (control.length) { console.error(`harness: the unmutated control is red (${control.join(', ')})`); process.exit(2); }
console.log(`[mutants] ${MUTANTS.length}`);
let survived = 0;
for (const m of MUTANTS) {
  let edge = EDGE;
  if (m.fn === 'edge') {
    const s = EDGE[m.file];
    if (s.split(m.find).length !== 2) { console.error(`harness: ${m.name}: anchor matched ${s.split(m.find).length - 1}x`); process.exit(2); }
    if (!CONTROL) edge = { ...EDGE, [m.file]: s.replace(m.find, () => m.repl) };
  } else {
    const base = SRC[m.fn];
    let src;
    if (m.find === null) src = base + m.repl;
    else {
      if (base.split(m.find).length !== 2) { console.error(`harness: ${m.name}: anchor matched ${base.split(m.find).length - 1}x`); process.exit(2); }
      src = base.replace(m.find, () => m.repl);
    }
    if (!CONTROL) {
      try { await db.exec(src); } catch (e) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); }
    }
  }
  let red;
  try { red = await arms(db, { log: false, edge }); } catch (e) { red = [`threw: ${e.message}`]; }
  try { await db.exec('rollback;'); } catch { /* not in a transaction */ }
  await db.exec(RESTORE);
  const hit = red.some((id) => m.expect.test(id));
  console.log(`[mutant] ${m.name} ${hit ? 'caught' : 'survived'}`);
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${red.join(', ')}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${red.length ? `red only via ${red.join(', ')}` : 'SURVIVED'}`); }
}
const after = await arms(db, { log: false });
if (after.length) { console.error(`harness: the restored bodies are red (${after.join(', ')})`); process.exit(2); }
await db.close();
if (CONTROL) {
  console.log(`\nHR_MUTANT_CONTROL: nothing planted; ${MUTANTS.length - survived} arm(s) read caught`);
  process.exit(survived === MUTANTS.length ? 0 : 1);
}
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
