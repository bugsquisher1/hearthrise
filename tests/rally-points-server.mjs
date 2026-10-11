#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/rally-points-server.mjs — RALLY POINTS ARE DERIVED BY THE SERVER FROM
//   THE CHARACTER'S JOURNALLED ACTIVITY IN THE WINDOW, GRADED AGAINST REAL
//   POSTGRESQL.
//
//   node tests/rally-points-server.mjs             # the guard
//   node tests/rally-points-server.mjs --list      # the mutation catalogue
//   node tests/rally-points-server.mjs --selftest  # every mutation must be CAUGHT
//   node tests/rally-points-server.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-10-10-rally-points-server.sql
//             supabase/functions/hr-accrue/accrual.js + tick-combat.js (`mon`)
//             src/features/muster.js (no client scoring; renders the tally)
//
// ── THE DEFECT (Security, accepted residual now closed) ─────────────────
// world_event_contribute(p_event_key, p_points) took the points from the
// browser (<= 400/call, <= 6,000/rally). The band — so the chest's gold and its
// up to 3,000 XP — and, through the median, everyone else's band, rode a
// client number.
//
// ── WHAT THIS DRIVES ────────────────────────────────────────────────────
// The REAL chain replayed into PGlite, a real character (hr_create_character),
// ledger rows in the exact shapes hr_apply journals, and the REAL rate-gated
// wrappers called AS `authenticated`:
//   RPS-1  ATTENDED (short attended-cadence spans, `att` top-up, `mon` tier):
//          the tally EQUALS the hand-computed sum of in-window activity; rows
//          before the join, after the window and on another character score 0;
//          a row without `mon` scores tier 1.
//   RPS-2  AWAY (an 8 h away span straddling the window, a world-tick folded
//          row, a span straddling the window END): overlap-prorated exactly.
//   RPS-3  the claim re-derives before the band and journals the tally.
//   RPS-4  FORGED: the two-argument (points-taking) call does not exist; a
//          stored client-asserted 6,000 is CORRECTED by refresh and by the
//          claim (band from the derived number); with no activity the claim is
//          refused no_contribution and nothing moves.
//   RPS-5  THE REAL JOIN records the character in play (char_slot), never the
//          window; a caller with no character is refused.
//   RPS-6  a pre-column join (char_slot null) names its character on refresh.
//   RPS-7  grants: no client role reaches the internals; the wrapper is
//          callable; hr_client_rpc_baseline holds exactly the one-arg call.
//   RPS-8  replay: a second refresh moves nothing.
//   RPS-9  DRIFT: hr_rally_point_rules == src/features/muster.js POINTS +
//          EVENTS[].sources and src/core/artisan.js BENCH_COUNTERS.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY (PGlite is one backend): the FOR UPDATE on the join row
//     is exercised as a replay.
//   · The browser half: the in-page regression "b568: rally points are the
//     server tally" in src/features/smoke/muster-nav-and-identity.js.
// ════════════════════════════════════════════════════════════════════════
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { BENCH_COUNTERS } from '../src/core/artisan.js';

const MIG = '2026-10-10-rally-points-server.sql';

const GATE_BLIND = [
  '  -- (a) GRANTS + SURFACE.\n',
  '  if true then return; end if;   -- selftest: §8 short-circuited\n  -- (a) GRANTS + SURFACE.\n',
];

const MUTATIONS = {
  client_points_trusted: {
    why: 'THE DEFECT at the claim: the band is priced from the STORED number (no re-derivation)',
    find: '  v_ref := public.hr_rally_refresh(auth.uid(), p_day_key);\n',
    repl: "  v_ref := '{}'::jsonb;\n",
  },
  points_param_restored: {
    why: 'THE DEFECT at the call: a points-taking overload that trusts the client is back',
    find: "revoke execute on function public.world_event_contribute(text) from public, anon, service_role;\n",
    repl: "revoke execute on function public.world_event_contribute(text) from public, anon, service_role;\n"
      + "create function public.world_event_contribute(p_event_key text, p_points int) returns jsonb\n"
      + "language sql security definer set search_path = public as $x$\n"
      + "  update public.world_event_joins set points = least(points + p_points, 6000)\n"
      + "   where user_id = auth.uid() and event_key = p_event_key returning jsonb_build_object('ok', true, 'points', points)\n"
      + "$x$;\n"
      + "grant execute on function public.world_event_contribute(text, int) to authenticated;\n",
  },
  raise_only: {
    why: 'the refresh only RAISES: a client-asserted stored tally survives',
    find: '  v_new := least(greatest(coalesce((v_d->>\'points\')::bigint, 0), 0), c_cap);\n',
    repl: '  v_new := least(greatest(coalesce((v_d->>\'points\')::bigint, 0), v_join.points), c_cap);\n',
  },
  window_ignored: {
    why: 'the window bounds are ignored: every scanned row counts in full',
    find: '        else 0::numeric end) as ov,\n',
    repl: '        else 0::numeric end) as ov0, 1::numeric as ov,\n',
    more: [['        else 1::numeric end) as sp) w\n', '        else 1::numeric end) as sp0, 1::numeric as sp) w\n']],
  },
  window_end_ignored: {
    why: 'the window END is ignored: activity after the rally closed still scores',
    find: 'least(r.t, p_to) - greatest(r.f, p_from)',
    repl: 'r.t - greatest(r.f, p_from)',
  },
  other_character: {
    why: 'every character of the account scores (slot filter dropped)',
    find: '           where l.user_id = p_user and l.slot = p_slot\n',
    repl: '           where l.user_id = p_user\n',
  },
  tier_ignored: {
    why: 'kills are not weighted by the monster tier (`mon`)',
    find: 'coalesce(m.tier, 1)',
    repl: '1',
  },
  join_no_character: {
    why: 'the join does not record the server-derived character',
    find: '  values (w.day_key, auth.uid(), w.event_key, w.slot, w.ends_at, v_char)\n',
    repl: '  values (w.day_key, auth.uid(), w.event_key, w.slot, w.ends_at, null)\n',
  },
  inner_client_executable: {
    why: 'hr_rally_refresh is granted to authenticated: any caller can re-derive (and move the bar for) any user',
    find: "revoke execute on function public.hr_rally_refresh(uuid, text) from anon, authenticated, service_role;\n",
    repl: "revoke execute on function public.hr_rally_refresh(uuid, text) from anon, service_role;\n"
        + "grant execute on function public.hr_rally_refresh(uuid, text) to authenticated;\n",
  },
  rules_drift: {
    why: 'the server scoring table drifts from muster.js (gather worth 5)',
    find: '\'{"kill_tier":10,"gather":4,',
    repl: '\'{"kill_tier":10,"gather":5,',
  },
};
for (const id of Object.keys(MUTATIONS)) {
  MUTATIONS[id + '_gate_blind'] = { ...MUTATIONS[id], why: MUTATIONS[id].why + ' — §8 blinded', blind: true };
}

const N = (v) => Number(v ?? 0);

/* Load src/features/muster.js (a classic-script IIFE) in a sandbox and read the
   scoring catalogue it exports. Nothing boots: the stubbed timers never fire. */
function musterCatalogue() {
  const src = readFileSync(`${ROOT}/src/features/muster.js`, 'utf8');
  const window = {};
  const document = { readyState: 'complete', addEventListener() {}, querySelector() { return null; },
    getElementById() { return null; }, createElement() { return {}; }, head: { appendChild() {} } };
  vm.runInNewContext(src, { window, document, setTimeout: () => 0, setInterval: () => 0, console });
  const M = window.HearthriseMuster;
  if (!M || !M.POINTS || !Array.isArray(M.EVENTS)) throw Object.assign(new Error('muster.js exports no POINTS/EVENTS'), { harness: true });
  return M;
}

export async function run(mutate) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };
  const obs = {};

  let patches;
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) { const e = new Error('unknown mutation ' + mutate); e.harness = true; throw e; }
    patches = new Map([[MIG, [[m.find, m.repl], ...(m.more || []), ...(m.blind ? [GATE_BLIND] : [])]]]);
  }
  const { db } = await bootReplay({ patches, upTo: MIG });
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const setSub = (uid) => q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const asUser = async (uid, sql, p) => {
    await q('delete from public.hr_rate_counters');
    await setSub(uid);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  const mkUser = async (email) => {
    const id = (await q('select gen_random_uuid() as i'))[0].i;
    await q('insert into auth.users (id, instance_id, aud, role, email) '
      + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)", [id, email]);
    await q('insert into public.profiles (id) values ($1) on conflict do nothing', [id]);
    return id;
  };

  // ── FIXTURE: a real character in slot 0 (in play) and a decoy in slot 1.
  const uid = await mkUser('rps@probe.invalid');
  const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
  ok(cr?.ok === true || cr?.created === true, `FIXTURE: hr_create_character refused: ${JSON.stringify(cr)}`);
  await q('insert into public.player_state (user_id, slot, gold, gems, version) values ($1, 1, 0, 0, 1)', [uid]);
  await q("update public.player_state set last_seen_at = now() - interval '1 hour' where user_id=$1 and slot=1", [uid]);
  await q('update public.player_state set last_seen_at = now() where user_id=$1 and slot=0', [uid]);

  const T0 = new Date((await q('select now() as t'))[0].t).getTime();
  const at = (minutes) => new Date(T0 + minutes * 60000).toISOString();
  const today = (await q('select public.hr_utc_day_key() as k'))[0].k;
  const keyFor = async (eventId) => (await q(`
    with d as (select generate_series((now() at time zone 'utc')::date - 400, (now() at time zone 'utc')::date,
                                      interval '1 day')::date as d)
    select k from (select public.hr_utc_day_key((d + interval '12 hours') at time zone 'utc') || '#' || h as k
                     from d cross join (values (1), (13)) h(h)) x
     where public.hr_rally_event_for_key(k) = $1 limit 1`, [eventId]))[0]?.k;
  const EK = { combat: await keyFor('ashen_horde'), seam: await keyFor('deep_seam'), kitchen: await keyFor('keep_kitchens') };
  ok(EK.combat && EK.seam && EK.kitchen, `FIXTURE: event keys ${JSON.stringify(EK)}`);
  const tier = async (t) => (await q('select monster_id from public.hr_bounty_monsters where tier=$1 order by monster_id limit 1', [t]))[0]?.monster_id;
  const MON3 = await tier(3); const MON6 = await tier(6);
  ok(MON3 && MON6, 'FIXTURE: no tier-3 / tier-6 monster in hr_bounty_monsters');

  const led = (slot, kind, intent, qty, meta, atIso = null) => q(
    `insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta, at)
     values ($1, $2, $3, $4, 0, 0, 0, $5, 0, $6::jsonb, coalesce($7::timestamptz, now()))`,
    [uid, slot, kind, intent, qty, JSON.stringify(meta), atIso]);
  const span = (fromMin, toMin) => ({ from: at(fromMin), to: at(toMin) });
  const join = async (ek, from, to, points = 0, charSlot = 0, who = uid) => {
    await q('delete from public.world_event_joins where user_id=$1', [who]);
    await q(`insert into public.world_event_totals (event_key, participants, goal, progress)
             values ($1, 1, 6000, 0) on conflict (event_key) do nothing`, [ek]);
    await q(`insert into public.world_event_joins (day_key, user_id, event_key, slot, joined_at, window_end, points, char_slot)
             values ($1, $2, $3, 13, $4, $5, $6, $7)`, [today, who, ek, at(from), at(to), points, charSlot]);
  };
  const joinRow = async (who = uid) => (await q('select points::text p, char_slot, claimed from public.world_event_joins where user_id=$1', [who]))[0] || {};
  const progress = async (ek) => N((await q('select progress::text p from public.world_event_totals where event_key=$1', [ek]))[0]?.p);
  const contribute = (ek) => asUser(uid, 'select public.world_event_contribute($1) as r', [ek]);

  // ── RPS-1 ATTENDED (ashen_horde: kills only). Window [-30m, -1m]. ─────────
  {
    await join(EK.combat, -30, -1);
    // attended cadence rows, inside
    await led(0, 'combat', 'accrue', 0, { kills: 4, mon: MON3, att: { claimed: 6, cap: 9, sim: 4, top: 2 }, ...span(-20, -18.5) }); // 6 x 10 x 3 = 180
    await led(0, 'combat', 'accrue', 0, { kills: 1, mon: MON6, ...span(-15, -13.5) });                                            // 1 x 10 x 6 = 60
    await led(0, 'combat', 'accrue', 0, { kills: 3, ...span(-12, -10.5) });                                                       // no mon: 3 x 10 x 1 = 30
    // outside the window / not this character / not this rally's source
    await led(0, 'combat', 'accrue', 0, { kills: 50, mon: MON6, ...span(-45, -35) });                                             // before the join
    await led(0, 'combat', 'accrue', 0, { kills: 50, mon: MON6, ...span(-0.9, -0.1) });                                           // after the window
    await led(1, 'combat', 'accrue', 0, { kills: 99, mon: MON6, ...span(-20, -18) });                                             // the decoy character
    await led(0, 'craft', 'accrue', 0, { made: 10, skill: 'smithing', ...span(-9, -8) });                                         // not an ashen_horde source
    const p0 = await progress(EK.combat);
    const r = await contribute(EK.combat);
    obs.rps1 = r;
    ok(r?.ok === true && N(r?.points) === 270,
      `RPS-1 ATTENDED: the tally is ${r?.points}, the in-window activity is 270 (180 tier-3 + top-up, 60 tier-6, 30 no-mon): ${JSON.stringify(r)}`);
    ok(N((await joinRow()).p) === 270, `RPS-1: the join row holds ${(await joinRow()).p}, not the derived 270`);
    ok(await progress(EK.combat) - p0 === 270, `RPS-1: the bar moved ${await progress(EK.combat) - p0}, not 270`);
    // RPS-8 replay
    const again = await contribute(EK.combat);
    ok(N(again?.added) === 0 && N(again?.points) === 270 && await progress(EK.combat) - p0 === 270,
      `RPS-8: a replayed refresh moved something: ${JSON.stringify(again)}`);
  }

  // ── RPS-2 AWAY (deep_seam: gathering). Window [-40m, -1m]. ────────────────
  //    An 8-hour-ish away span ending at -20m (240 min, 20 inside: 1/12 of 1200
  //    = 100 -> 400), a tick-folded row inside (30 -> 120), and a span that
  //    straddles the window END (-3m..0, 2 of 3 min: 20 of 30 -> 80).
  {
    await join(EK.seam, -40, -1);
    await led(0, 'gather', 'accrue', 1200, { qty: 1200, node: 'oak', skill: 'woodcutting', ...span(-260, -20) });
    await led(0, 'gather', 'accrue', 30, { qty: 30, node: 'oak', skill: 'woodcutting', src: 'tick', ...span(-20, -8) });
    await led(0, 'gather', 'accrue', 30, { qty: 30, node: 'oak', skill: 'woodcutting', ...span(-3, 0) });
    // a span with no valid timestamps falls back to its own `at` (now: after the window)
    await led(0, 'gather', 'accrue', 500, { qty: 500, from: 'yesterday', to: 'today' });
    const r = await contribute(EK.seam);
    obs.rps2 = r;
    ok(r?.ok === true && N(r?.points) === 600,
      `RPS-2 AWAY: the tally is ${r?.points}, the overlap-prorated activity is 600 (400 away + 120 tick + 80 end-straddle): ${JSON.stringify(r)}`);

    // ── RPS-3 + RPS-4c: the claim re-derives, even from a forged stored value,
    //    and prices the band from it. A second participant at 600 makes the
    //    band honest: (600, 600) median 600 -> silver; a trusted 6000 would be
    //    (6000, 600) median 3300 -> gold.
    const other = await mkUser('rps-other@probe.invalid');
    await join(EK.seam, -40, -1, 600, 0, other);
    await q('update public.world_event_joins set points = 6000 where user_id=$1', [uid]);
    const g0 = N((await q('select gold::text g from public.player_state where user_id=$1 and slot=0', [uid]))[0].g);
    const c = await asUser(uid, 'select public.world_event_claim($1, 0) as r', [today]);
    obs.rps3 = c;
    ok(c?.ok === true && N(c?.points) === 600 && c?.band === 'silver',
      `RPS-3/4c: the claim priced ${c?.points} points / band ${c?.band}; the server's activity is 600 -> silver: ${JSON.stringify(c)}`);
    const last = (await q("select meta from public.player_ledger where user_id=$1 and kind='rally' order by id desc limit 1", [uid]))[0]?.meta;
    ok(N(last?.points) === 600 && last?.char_slot === 0, `RPS-3: the rally ledger row journals ${JSON.stringify(last && { points: last.points, char_slot: last.char_slot })}`);
    const g1 = N((await q('select gold::text g from public.player_state where user_id=$1 and slot=0', [uid]))[0].g);
    ok(g1 - g0 === N(c?.gold), `RPS-3: gold moved ${g1 - g0}, the claim says ${c?.gold}`);
    await q('delete from public.world_event_joins where user_id=$1', [other]);
  }

  // ── RPS-4 FORGED ───────────────────────────────────────────────────────────
  {
    // (a) the points-taking call does not exist for a client
    await join(EK.kitchen, -10, -1, 0);
    let threw = null, res = null;
    try { res = await asUser(uid, 'select public.world_event_contribute($1, $2) as r', [EK.kitchen, 400]); }
    catch (e) { threw = e; }
    ok(threw !== null && /does not exist|function/i.test(String(threw?.message)),
      `RPS-4a: a points-taking world_event_contribute answered ${JSON.stringify(res)} — the client number is back`);
    ok(N((await joinRow()).p) === 0, `RPS-4a: the forged call moved the tally to ${(await joinRow()).p}`);
    // (b) a stored forged 6000, no activity in the window: refresh corrects it;
    //     the claim is refused no_contribution and nothing moves.
    await join(EK.kitchen, -10, -1, 6000);
    await q('update public.world_event_totals set progress = 6000 where event_key=$1', [EK.kitchen]);
    const r = await contribute(EK.kitchen);
    ok(r?.ok === true && N(r?.points) === 0 && N(r?.added) === -6000 && await progress(EK.kitchen) === 0,
      `RPS-4b: a forged stored 6000 was not corrected to 0 (bar ${await progress(EK.kitchen)}): ${JSON.stringify(r)}`);
    await q('update public.world_event_joins set points = 6000 where user_id=$1', [uid]);
    const l0 = N((await q("select count(*)::text n from public.player_ledger where user_id=$1 and kind='rally'", [uid]))[0].n);
    const c = await asUser(uid, 'select public.world_event_claim($1, 0) as r', [today]);
    const l1 = N((await q("select count(*)::text n from public.player_ledger where user_id=$1 and kind='rally'", [uid]))[0].n);
    ok(c?.error === 'no_contribution' && (await joinRow()).claimed === false && l1 === l0,
      `RPS-4b: a forged tally with no activity was not refused cleanly: ${JSON.stringify(c)}`);
  }

  // ── RPS-5 THE REAL JOIN. hr_muster_window reads now(); a test-only shim
  //    opens a window around now so world_event_join can be driven for real.
  {
    await q('alter function public.hr_muster_window(timestamptz) rename to hr_muster_window__rps');
    await q(`create function public.hr_muster_window(p_at timestamptz default now())
             returns table (day_key text, slot int, event_key text, started_at timestamptz, ends_at timestamptz)
             language sql stable as $f$
               select public.hr_utc_day_key(p_at), 13, public.hr_utc_day_key(p_at) || '#13',
                      p_at - interval '5 minutes', p_at + interval '40 minutes'
             $f$`);
    await q('delete from public.world_event_joins where user_id=$1', [uid]);
    const r = await asUser(uid, 'select public.world_event_join($1) as r', [today + '#13']);
    const row = await joinRow();
    obs.rps5 = { r, row };
    ok(r?.ok === true && row.char_slot === 0 && r?.char_slot === 0,
      `RPS-5: the real join recorded char_slot ${row.char_slot} (response ${JSON.stringify(r)}) — expected 0, the character in play`);
    const nobody = await mkUser('rps-nochar@probe.invalid');
    const r2 = await asUser(nobody, 'select public.world_event_join($1) as r', [today + '#13']);
    ok(r2?.error === 'no_character', `RPS-5: a caller with no character joined: ${JSON.stringify(r2)}`);
    await q('drop function public.hr_muster_window(timestamptz)');
    await q('alter function public.hr_muster_window__rps(timestamptz) rename to hr_muster_window');
  }

  // ── RPS-6 a pre-column join (char_slot null) names its character on refresh.
  {
    await join(EK.combat, -30, -1, 0, null);
    const r = await contribute(EK.combat);
    ok(r?.ok === true && (await joinRow()).char_slot === 0 && N(r?.points) === 270,
      `RPS-6: a null-character join refreshed to ${JSON.stringify(r)} (row char ${(await joinRow()).char_slot})`);
  }

  // ── RPS-7 grants and surface ─────────────────────────────────────────────
  for (const sig of ['public.hr_rally_point_rules(text)',
    'public.hr_rally_points_of(uuid,integer,text,timestamp with time zone,timestamp with time zone)',
    'public.hr_rally_refresh(uuid,text)', 'public.world_event_contribute__ungated(text)',
    'public.world_event_join__ungated(text)', 'public.world_event_claim__ungated(text,integer)']) {
    const r = (await q(`select has_function_privilege('authenticated', $1, 'execute') a,
                               has_function_privilege('anon', $1, 'execute') b`, [sig]))[0];
    ok(!r.a && !r.b, `RPS-7: ${sig} is client-executable`);
  }
  {
    const w = (await q(`select has_function_privilege('authenticated', 'public.world_event_contribute(text)', 'execute') a`))[0];
    ok(w.a, 'RPS-7: world_event_contribute(text) is not callable by authenticated — the feature is dead');
    const n = (await q("select count(*)::int n from pg_proc where proname in ('world_event_contribute','world_event_contribute__ungated') and pronargs <> 1"))[0].n;
    ok(n === 0, `RPS-7: ${n} points-taking world_event_contribute overload(s) exist`);
    const b = await q("select identity_args from public.hr_client_rpc_baseline where proname='world_event_contribute'");
    ok(b.length === 1 && b[0].identity_args === 'p_event_key text', `RPS-7: the baseline holds ${JSON.stringify(b)}`);
  }

  // ── RPS-9 DRIFT ───────────────────────────────────────────────────────────
  {
    const M = musterCatalogue();
    const base = { kill_tier: 10, gather: M.POINTS.gather, harvest: M.POINTS.harvest,
      cooked: M.POINTS.cooked, smithed: M.POINTS.smithed, crafted: M.POINTS.crafted };
    ok(M.POINTS.kill_any === null, 'RPS-9: muster.js POINTS.kill_any is no longer "10 x tier" (null) — re-derive kill_tier');
    const bench = {};
    for (const [skill, row] of Object.entries(BENCH_COUNTERS)) {
      const key = (row.progress || []).find((k) => ['cooked', 'smithed', 'crafted'].includes(k));
      if (key) bench[skill] = key;
    }
    const sorted = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, Number(o[k]) === o[k] ? o[k] : o[k]]));
    for (const ev of M.EVENTS) {
      const rules = (await q('select public.hr_rally_point_rules($1) as r', [ev.id]))[0].r;
      ok(sorted(rules.sources) === sorted(ev.sources),
        `RPS-9: ${ev.id} sources drifted — server ${JSON.stringify(rules.sources)}, muster.js ${JSON.stringify(ev.sources)}`);
      ok(sorted(rules.base) === sorted(base), `RPS-9: per-unit points drifted — server ${JSON.stringify(rules.base)}, muster.js ${JSON.stringify(base)}`);
      ok(sorted(rules.bench) === sorted(bench), `RPS-9: bench routing drifted — server ${JSON.stringify(rules.bench)}, artisan.js ${JSON.stringify(bench)}`);
      ok(N(rules.cap) === M.TOTAL_CAP, `RPS-9: cap ${rules.cap} vs muster.js TOTAL_CAP ${M.TOTAL_CAP}`);
    }
    const pool = (await q('select public.hr_rally_pool() as p'))[0].p;
    ok(JSON.stringify(pool) === JSON.stringify(M.EVENTS.map((e) => e.id)), `RPS-9: the rally pool drifted ${JSON.stringify(pool)}`);
  }

  await db.close().catch(() => {});
  return { problems: problems.map((p) => 'rally-points-server: ' + p), obs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv.slice(2);
  const one = (arg.find((a) => a.startsWith('--mutate=')) || '').split('=')[1];
  if (arg.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${m.why}\n`);
    process.exit(0);
  }
  if (arg.includes('--selftest')) {
    let bad = 0;
    for (const id of Object.keys(MUTATIONS)) {
      let caught = null;
      try {
        const { problems } = await run(id);
        caught = problems.length ? problems : null;
      } catch (e) {
        if (e && e.harness) { console.log(`✖ ${id}: HARNESS — ${e.message}`); bad++; continue; }
        caught = ['migration/harness rejected it: ' + String(e.message).split('\n')[0].slice(0, 200)];
      }
      if (caught) console.log(`✔ ${id} CAUGHT — ${caught[0].slice(0, 180)}`);
      else { console.log(`✖ ${id} NOT CAUGHT — the guard cannot see this defect`); bad++; }
    }
    console.log(bad ? `\n${bad} mutation(s) not caught` : '\nevery mutation caught');
    process.exit(bad ? 1 : 0);
  }
  const t0 = Date.now();
  let problems, obs;
  try { ({ problems, obs } = await run(one || null)); }
  catch (e) {
    console.log('rally-points-server: the run THREW — ' + String(e && e.message).split('\n')[0]);
    if (e && e.query) console.log('  query: ' + String(e.query).slice(0, 300));
    process.exit(1);
  }
  console.log(JSON.stringify(obs, null, 1));
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log(' ✖ ' + p);
    process.exit(1);
  }
  console.log(`\nrally-points-server: green (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
