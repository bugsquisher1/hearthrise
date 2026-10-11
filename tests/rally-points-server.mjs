#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/rally-points-server.mjs — RALLY POINTS ARE DERIVED BY THE SERVER FROM
//   THE CHARACTER'S JOURNALLED ACTIVITY IN THE WINDOW, PAID BY TIME, BANDED ON
//   FIXED THRESHOLDS — GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/rally-points-server.mjs             # the guard
//   node tests/rally-points-server.mjs --list      # the mutation catalogue
//   node tests/rally-points-server.mjs --selftest  # every mutation must be CAUGHT
//   node tests/rally-points-server.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-10-10-rally-points-server.sql
//             supabase/migrations/2026-10-10-rally-action-times.generated.sql
//             tools/gen-rally-action-times.mjs
//             supabase/functions/hr-accrue/accrual.js + tick-combat.js (`mon`)
//             src/features/muster.js (no client scoring; renders tally + bands)
//
// ── THE DEFECT (Security, accepted residual now closed) ─────────────────
// world_event_contribute(p_event_key, p_points) took the points from the
// browser. Rev.2 (Security GO-WITH-CHANGES + game-designer ruling 2026-10-10):
// crafts by action not output (C1), worker/dungeon/xp_credit/death rows score 0
// (C2), fail closed on spanless accrue rows (#3), TIME scoring, FIXED bands,
// and a server-granted +300 join bonus in place of the browser's Rally roll.
//
// ── WHAT THIS DRIVES ────────────────────────────────────────────────────
// The REAL chain replayed into PGlite, real characters (hr_create_character),
// ledger rows in the shapes hr_apply journals, and the REAL rate-gated
// wrappers called AS `authenticated`:
//   RPS-1  ATTENDED: the tally EQUALS the in-window kills x 25 x tier; rows
//          before the join, after the window, on another character, of another
//          kind/verb (worker, dungeon, xp_credit, death) or with no valid span
//          score 0; a row without `mon` scores tier 1.
//   RPS-2  AWAY: an away span straddling the window, a world-tick folded row,
//          a span straddling the window END — overlap-prorated exactly.
//   RPS-3  the claim re-derives before the band and journals the tally.
//   RPS-4  FORGED: the two-argument call does not exist; a stored 6,000 is
//          CORRECTED; no activity -> no_contribution; below Answered refused.
//   RPS-5  THE REAL JOIN records the character and grants +300 ONCE per day,
//          journalled; a caller with no character is refused.
//   RPS-6  a pre-column join (char_slot null) names its character on refresh.
//   RPS-7  grants and surface.
//   RPS-8  a weight smuggled in a request header changes nothing.
//   RPS-9  DRIFT: hr_rally_point_rules sources/bands/cap == muster.js;
//          hr_rally_action_s == tools/gen-rally-action-times.mjs rows().
//   RPS-10 PACE: a fighter, a gatherer, a crafter on split_rune_blanks (20 per
//          action) and a stonemason, each 45 min of focused play, score within
//          ±20% of 2,700, and quantity never moves the score.
//   RPS-11 BANDS are fixed and reachable: answered, silver (with two other
//          participants at 3,000 — a median-relative rule would say answered),
//          gold.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY (PGlite is one backend).
//   · The browser half: in-page "b568: rally points are the server tally".
// ════════════════════════════════════════════════════════════════════════
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { rows as actionRows } from '../tools/gen-rally-action-times.mjs';
import { TREES } from '../src/data/gathering.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { PACE } from '../src/core/pacing.js';

const MIG = '2026-10-10-rally-points-server.sql';

const GATE_BLIND = [
  '  -- (a) GRANTS + SURFACE.\n',
  '  if true then return; end if;   -- selftest: §8 short-circuited\n  -- (a) GRANTS + SURFACE.\n',
];

const TICKS_BURNT = "greatest(0::numeric, (case when r.meta->>'ticks' ~ c_int then (r.meta->>'ticks')::numeric else 0 end)\n"
  + "                                       - (case when r.meta->>'burnt' ~ c_int then (r.meta->>'burnt')::numeric else 0 end))";

const CRAFTED_HEAD = "'crafted',  coalesce(sum(case when r.kind = 'craft' and r.verb = 'accrue'\n"
  + "                  and v_rules->'bench'->>(r.meta->>'skill') = 'crafted' then w.ov\n                  * ";

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
      + "  update public.world_event_joins set points = least(points + p_points, 3000)\n"
      + "   where user_id = auth.uid() and event_key = p_event_key returning jsonb_build_object('ok', true, 'points', points)\n"
      + "$x$;\n"
      + "grant execute on function public.world_event_contribute(text, int) to authenticated;\n",
  },
  weight_from_client: {
    why: 'a weight is read from the client (a request header PostgREST forwards)',
    find: "  v_w     := v_rules->'weights';\n",
    repl: "  v_w     := v_rules->'weights';\n"
      + "  v_w := coalesce((nullif(current_setting('request.headers', true), '')::jsonb->>'x-rally-weights')::jsonb, v_w);\n",
  },
  raise_only: {
    why: 'the refresh only RAISES: a client-asserted stored tally survives',
    find: "  v_new := least(greatest(coalesce((v_d->>'points')::bigint, 0), 0) + v_join.bonus, v_cap);\n",
    repl: "  v_new := least(greatest(greatest(coalesce((v_d->>'points')::bigint, 0), 0) + v_join.bonus, v_join.points), v_cap);\n",
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
  at_fallback: {
    why: '#3 reopened: an accrue row with no valid span scores by its own `at` (fail open)',
    find: '        else 0::numeric end) as ov,\n',
    repl: '        when r.at <= p_to then 1::numeric\n        else 0::numeric end) as ov,\n',
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
  by_output: {
    why: 'C1 reopened: crafts score by OUTPUT (meta.made), so a 20-per-action recipe pays 20x',
    find: CRAFTED_HEAD + TICKS_BURNT,
    repl: CRAFTED_HEAD + "(case when r.meta->>'made' ~ c_int then (r.meta->>'made')::numeric else 0 end)",
  },
  worker_counts: {
    why: 'C2 (Security\'s mutant): worker rows count as gathering',
    find: "             and l.kind in ('combat', 'gather', 'craft', 'farm')) r\n",
    repl: "             and l.kind in ('combat', 'gather', 'craft', 'farm', 'worker')) r\n",
    more: [["case when r.kind = 'gather' and r.verb = 'accrue' then", "case when r.kind in ('gather', 'worker') and r.verb = 'accrue' then"],
      ["(r.kind = 'gather' and a.kind = 'gather'", "(r.kind in ('gather', 'worker') and a.kind = 'gather'"]],
  },
  verb_ignored: {
    why: 'C2: every combat row counts its `kills` (xp_credit, death)',
    find: "case when r.kind = 'combat' and r.verb = 'accrue' then",
    repl: "case when r.kind = 'combat' then",
  },
  join_no_character: {
    why: 'the join does not record the server-derived character',
    find: '  values (w.day_key, auth.uid(), w.event_key, w.slot, w.ends_at, v_char, v_bonus, v_bonus)\n  on conflict',
    repl: '  values (w.day_key, auth.uid(), w.event_key, w.slot, w.ends_at, null, v_bonus, v_bonus)\n  on conflict',
  },
  bonus_twice: {
    why: 'the +300 is granted again by a repeated join',
    find: '  if v_rows = 0 then\n    select * into v_existing from public.world_event_joins\n',
    repl: '  if v_rows = 0 then\n'
      + '    update public.world_event_joins set bonus = bonus + v_bonus, points = points + v_bonus\n'
      + '     where day_key = w.day_key and user_id = auth.uid();\n'
      + "    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)\n"
      + "      values (auth.uid(), v_char, 'rally', 'rally_join_bonus:' || w.day_key, 0, 0, 0, 0, 0, '{}'::jsonb);\n"
      + '    select * into v_existing from public.world_event_joins\n',
  },
  median_band: {
    why: 'the band goes back to median-relative',
    find: "  if v_join.points >= (v_bands->>'silver')::bigint then\n",
    repl: "  if v_join.points >= (select percentile_cont(0.5) within group (order by j.points)\n"
      + "                         from public.world_event_joins j where j.event_key = v_join.event_key) * 0.60 then\n",
  },
  inner_client_executable: {
    why: 'hr_rally_refresh is granted to authenticated: any caller can re-derive (and move the bar for) any user',
    find: "revoke execute on function public.hr_rally_refresh(uuid, text) from anon, authenticated, service_role;\n",
    repl: "revoke execute on function public.hr_rally_refresh(uuid, text) from anon, service_role;\n"
        + "grant execute on function public.hr_rally_refresh(uuid, text) to authenticated;\n",
  },
  rules_drift: {
    why: 'the weights table drifts from the ruling (26 per tier)',
    find: '"kill_per_tier":25',
    repl: '"kill_per_tier":26',
  },
};
for (const id of Object.keys(MUTATIONS)) {
  MUTATIONS[id + '_gate_blind'] = { ...MUTATIONS[id], why: MUTATIONS[id].why + ' — §8 blinded', blind: true };
}

const N = (v) => Number(v ?? 0);
const paced = (ms) => Math.max(1, Math.round((ms * PACE.actionMs) / 1000));

/* Load src/features/muster.js (a classic-script IIFE) in a sandbox and read the
   display mirrors it exports. Nothing boots: the stubbed timers never fire. */
function musterCatalogue() {
  const src = readFileSync(`${ROOT}/src/features/muster.js`, 'utf8');
  const window = {};
  const document = { readyState: 'complete', addEventListener() {}, querySelector() { return null; },
    getElementById() { return null; }, createElement() { return {}; }, head: { appendChild() {} } };
  vm.runInNewContext(src, { window, document, setTimeout: () => 0, setInterval: () => 0, console });
  const M = window.HearthriseMuster;
  if (!M || !M.BANDS || !Array.isArray(M.EVENTS)) throw Object.assign(new Error('muster.js exports no BANDS/EVENTS'), { harness: true });
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
  const asUser = async (uid, sql, p) => {
    await q('delete from public.hr_rate_counters');
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  let nUsers = 0;
  const mkUser = async () => {
    const id = (await q('select gen_random_uuid() as i'))[0].i;
    await q('insert into auth.users (id, instance_id, aud, role, email) '
      + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)", [id, `rps${++nUsers}@probe.invalid`]);
    await q('insert into public.profiles (id) values ($1) on conflict do nothing', [id]);
    return id;
  };
  const mkPlayer = async () => {
    const id = await mkUser();
    const cr = await asUser(id, 'select public.hr_create_character(0) as r');
    ok(cr?.ok === true || cr?.created === true, `FIXTURE: hr_create_character refused: ${JSON.stringify(cr)}`);
    await q('update public.player_state set last_seen_at = now() where user_id=$1 and slot=0', [id]);
    return id;
  };

  const T0 = new Date((await q('select now() as t'))[0].t).getTime();
  const at = (minutes) => new Date(T0 + minutes * 60000).toISOString();
  const span = (fromMin, toMin) => ({ from: at(fromMin), to: at(toMin) });
  const today = (await q('select public.hr_utc_day_key() as k'))[0].k;
  const keyFor = async (eventId) => (await q(`
    with d as (select generate_series((now() at time zone 'utc')::date - 400, (now() at time zone 'utc')::date,
                                      interval '1 day')::date as d)
    select k from (select public.hr_utc_day_key((d + interval '12 hours') at time zone 'utc') || '#' || h as k
                     from d cross join (values (1), (13)) h(h)) x
     where public.hr_rally_event_for_key(k) = $1 limit 1`, [eventId]))[0]?.k;
  const EK = { combat: await keyFor('ashen_horde'), seam: await keyFor('deep_seam'),
    forge: await keyFor('forge_levy'), kitchen: await keyFor('keep_kitchens') };
  ok(Object.values(EK).every(Boolean), `FIXTURE: event keys ${JSON.stringify(EK)}`);
  const tier = async (t) => (await q('select monster_id from public.hr_bounty_monsters where tier=$1 order by monster_id limit 1', [t]))[0]?.monster_id;
  const MON3 = await tier(3); const MON6 = await tier(6);
  ok(MON3 && MON6, 'FIXTURE: no tier-3 / tier-6 monster in hr_bounty_monsters');
  const psOf = async (kind, id) => N((await q('select paced_s from public.hr_rally_action_s where kind=$1 and activity_id=$2', [kind, id]))[0]?.paced_s);
  const PS_OAK = await psOf('gather', 'oak_tree');
  ok(PS_OAK > 0, 'FIXTURE: oak_tree has no paced time');

  const led = (uid, slot, kind, intent, meta, atIso = null) => q(
    `insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta, at)
     values ($1, $2, $3, $4, 0, 0, 0, 0, 0, $5::jsonb, coalesce($6::timestamptz, now()))`,
    [uid, slot, kind, intent, JSON.stringify(meta), atIso]);
  const join = async (uid, ek, from, to, { points = 0, charSlot = 0, bonus = 0 } = {}) => {
    await q('delete from public.world_event_joins where user_id=$1', [uid]);
    await q(`insert into public.world_event_totals (event_key, participants, goal, progress)
             values ($1, 1, 6000, 0) on conflict (event_key) do nothing`, [ek]);
    await q(`insert into public.world_event_joins (day_key, user_id, event_key, slot, joined_at, window_end, points, char_slot, bonus)
             values ($1, $2, $3, 13, $4, $5, $6, $7, $8)`, [today, uid, ek, at(from), at(to), points, charSlot, bonus]);
  };
  const joinRow = async (uid) => (await q('select points::text p, char_slot, claimed, bonus from public.world_event_joins where user_id=$1', [uid]))[0] || {};
  const progress = async (ek) => N((await q('select progress::text p from public.world_event_totals where event_key=$1', [ek]))[0]?.p);
  const contribute = (uid, ek) => asUser(uid, 'select public.world_event_contribute($1) as r', [ek]);
  const claim = (uid) => asUser(uid, 'select public.world_event_claim($1, 0) as r', [today]);

  // ── RPS-1 ATTENDED (ashen_horde: kills). Window [-30m, -1m]. ──────────────
  const A = await mkPlayer();
  {
    await q('insert into public.player_state (user_id, slot, gold, gems, version) values ($1, 1, 0, 0, 1)', [A]);
    await q("update public.player_state set last_seen_at = now() - interval '1 hour' where user_id=$1 and slot=1", [A]);
    await join(A, EK.combat, -30, -1);
    await led(A, 0, 'combat', 'accrue', { kills: 4, mon: MON3, att: { claimed: 6, cap: 9, sim: 4, top: 2 }, ...span(-20, -18.5) }); // 6 x 25 x 3 = 450
    await led(A, 0, 'combat', 'accrue', { kills: 1, mon: MON6, ...span(-15, -13.5) });                                            // 1 x 25 x 6 = 150
    await led(A, 0, 'combat', 'accrue', { kills: 3, ...span(-12, -10.5) });                                                       // no mon: 75
    // everything below scores NOTHING
    await led(A, 0, 'combat', 'accrue', { kills: 50, mon: MON6, ...span(-45, -35) });                       // before the join
    await led(A, 0, 'combat', 'accrue', { kills: 50, mon: MON6, ...span(-0.9, -0.1) });                     // after the window
    await led(A, 1, 'combat', 'accrue', { kills: 99, mon: MON6, ...span(-20, -18) });                       // the decoy character
    await led(A, 0, 'combat', 'accrue', { kills: 40, mon: MON6 }, at(-10));                                 // no span (fail closed)
    await led(A, 0, 'combat', 'accrue', { kills: 40, mon: MON6, from: 'yesterday', to: 'today' }, at(-9));  // garbage span
    await led(A, 0, 'combat', 'xp_credit', { kills: 60, credit: 26, ...span(-9, -8) });                     // C2: xp_credit
    await led(A, 0, 'combat', 'death', { kills: 70, monster: MON6, ...span(-8, -7) });                      // C2: death
    await led(A, 0, 'worker', 'accrue', { kills: 80, qty: 400, ticks: 400, node: 'oak_tree', ...span(-7, -6) }); // C2: worker
    await led(A, 0, 'dungeon', 'dungeon_settle', { kills: 90, item_qty: 9, ...span(-6, -5) });             // C2: dungeon
    await led(A, 0, 'craft', 'accrue', { ticks: 10, made: 10, skill: 'smithing', recipe: 'smelt_copper', ...span(-5, -4) }); // not an ashen source
    const p0 = await progress(EK.combat);
    const r = await contribute(A, EK.combat);
    obs.rps1 = r;
    ok(r?.ok === true && N(r?.points) === 675,
      `RPS-1 ATTENDED: the tally is ${r?.points}; the in-window kills are 675 (450 tier-3 + top-up, 150 tier-6, 75 no-mon): ${JSON.stringify(r)}`);
    ok(N((await joinRow(A)).p) === 675, `RPS-1: the join row holds ${(await joinRow(A)).p}, not 675`);
    ok(await progress(EK.combat) - p0 === 675, `RPS-1: the bar moved ${await progress(EK.combat) - p0}, not 675`);
    const again = await contribute(A, EK.combat);
    ok(N(again?.added) === 0 && N(again?.points) === 675, `RPS-1: a replayed refresh moved something: ${JSON.stringify(again)}`);
    // ── RPS-8 a weight in a request header (what PostgREST forwards) is ignored
    await q("select set_config('request.headers', $1, false)",
      [JSON.stringify({ 'x-rally-weights': JSON.stringify({ per_paced_second: 100, kill_per_tier: 2500 }) })]);
    const h = await contribute(A, EK.combat);
    await q("select set_config('request.headers', '', false)");
    ok(N(h?.points) === 675, `RPS-8: a header-borne weight moved the tally to ${h?.points}`);
  }

  // ── RPS-2 AWAY (deep_seam: gathering by TIME). Window [-40m, -1m]. ────────
  //    an away span [-260,-20] of 1,200 actions (20 of 240 min inside: 100), a
  //    tick-folded row (30), a span straddling the END [-3, 0] (20 of 30).
  const B = await mkPlayer();
  {
    await join(B, EK.seam, -40, -1);
    await led(B, 0, 'gather', 'accrue', { ticks: 1200, qty: 2400, node: 'oak_tree', skill: 'woodcutting', ...span(-260, -20) });
    await led(B, 0, 'gather', 'accrue', { ticks: 30, qty: 90, node: 'oak_tree', skill: 'woodcutting', src: 'tick', ...span(-20, -8) });
    await led(B, 0, 'gather', 'accrue', { ticks: 30, qty: 30, node: 'oak_tree', skill: 'woodcutting', ...span(-3, 0) });
    await led(B, 0, 'gather', 'accrue', { ticks: 500, qty: 500, node: 'oak_tree' }, at(-10));          // no span: 0
    await led(B, 0, 'gather', 'accrue', { ticks: 500, qty: 500, node: 'not_a_node', ...span(-30, -29) }); // unknown node: 0
    await led(B, 0, 'worker', 'accrue', { ticks: 400, qty: 400, node: 'oak_tree', ...span(-30, -25) });   // C2: a worker's haul: 0
    const want = 150 * PS_OAK;
    const r = await contribute(B, EK.seam);
    obs.rps2 = r;
    ok(r?.ok === true && N(r?.points) === want,
      `RPS-2 AWAY: the tally is ${r?.points}; the overlap-prorated time is ${want} (150 actions x ${PS_OAK} s): ${JSON.stringify(r)}`);

    // ── RPS-3 + RPS-4c: the claim re-derives from a forged stored value.
    await q('update public.world_event_joins set points = 6000 where user_id=$1', [B]);
    const g0 = N((await q('select gold::text g from public.player_state where user_id=$1 and slot=0', [B]))[0].g);
    const c = await claim(B);
    obs.rps3 = c;
    const band = want >= 2500 ? 'gold' : want >= 1500 ? 'silver' : 'answered';
    ok(c?.ok === true && N(c?.points) === want && c?.band === band,
      `RPS-3/4c: the claim priced ${c?.points} / ${c?.band}; the server's tally is ${want} -> ${band}: ${JSON.stringify(c)}`);
    ok(!('median' in (c || {})), 'RPS-3: the claim still answers a median');
    const last = (await q("select meta from public.player_ledger where user_id=$1 and kind='rally' order by id desc limit 1", [B]))[0]?.meta;
    ok(N(last?.points) === want && last?.char_slot === 0, `RPS-3: the rally ledger row journals ${JSON.stringify(last && { points: last.points, char_slot: last.char_slot })}`);
    const g1 = N((await q('select gold::text g from public.player_state where user_id=$1 and slot=0', [B]))[0].g);
    ok(g1 - g0 === N(c?.gold), `RPS-3: gold moved ${g1 - g0}, the claim says ${c?.gold}`);
  }

  // ── RPS-4 FORGED ───────────────────────────────────────────────────────────
  const C = await mkPlayer();
  {
    await join(C, EK.kitchen, -10, -1);
    let threw = null, res = null;
    try { res = await asUser(C, 'select public.world_event_contribute($1, $2) as r', [EK.kitchen, 400]); }
    catch (e) { threw = e; }
    ok(threw !== null && /does not exist|function/i.test(String(threw?.message)),
      `RPS-4a: a points-taking world_event_contribute answered ${JSON.stringify(res)} — the client number is back`);
    ok(N((await joinRow(C)).p) === 0, `RPS-4a: the forged call moved the tally to ${(await joinRow(C)).p}`);
    await join(C, EK.kitchen, -10, -1, { points: 3000 });
    await q('update public.world_event_totals set progress = 3000 where event_key=$1', [EK.kitchen]);
    const r = await contribute(C, EK.kitchen);
    ok(r?.ok === true && N(r?.points) === 0 && N(r?.added) === -3000 && await progress(EK.kitchen) === 0,
      `RPS-4b: a forged stored 3000 was not corrected to 0 (bar ${await progress(EK.kitchen)}): ${JSON.stringify(r)}`);
    const nRally = async () => N((await q("select count(*)::text n from public.player_ledger where user_id=$1 and kind='rally'", [C]))[0].n);
    await q('update public.world_event_joins set points = 3000 where user_id=$1', [C]);
    const l0 = await nRally();
    const c = await claim(C);
    ok(c?.error === 'no_contribution' && (await joinRow(C)).claimed === false && await nRally() === l0,
      `RPS-4b: a forged tally with no activity was not refused cleanly: ${JSON.stringify(c)}`);
    // below Answered: the bonus alone (100) is not a chest, and nothing is spent
    await join(C, EK.kitchen, -10, -1, { points: 3000, bonus: 100 });
    const c2 = await claim(C);
    ok(c2?.error === 'below_answered' && N(c2?.points) === 100 && N(c2?.need) === 600
       && (await joinRow(C)).claimed === false && await nRally() === l0,
      `RPS-4d: a tally below Answered was not refused cleanly: ${JSON.stringify(c2)}`);
  }

  // ── RPS-5 THE REAL JOIN (a test-only shim opens a window around now) ──────
  {
    await q('alter function public.hr_muster_window(timestamptz) rename to hr_muster_window__rps');
    await q(`create function public.hr_muster_window(p_at timestamptz default now())
             returns table (day_key text, slot int, event_key text, started_at timestamptz, ends_at timestamptz)
             language sql stable as $f$
               select public.hr_utc_day_key(p_at), 13, public.hr_utc_day_key(p_at) || '#13',
                      p_at - interval '5 minutes', p_at + interval '40 minutes'
             $f$`);
    const G = await mkPlayer();
    const bonusRows = async () => N((await q(
      "select count(*)::text n from public.player_ledger where user_id=$1 and kind='rally' and intent like 'rally_join_bonus:%'", [G]))[0].n);
    const r = await asUser(G, 'select public.world_event_join($1) as r', [today + '#13']);
    const row = await joinRow(G);
    obs.rps5 = { r, row };
    ok(r?.ok === true && row.char_slot === 0 && r?.char_slot === 0,
      `RPS-5: the real join recorded char_slot ${row.char_slot} (response ${JSON.stringify(r)}) — expected 0, the character in play`);
    ok(N(r?.bonus) === 300 && row.bonus === 300 && N(row.p) === 300 && await bonusRows() === 1,
      `RPS-5: the join bonus is not +300 once and journalled (row ${JSON.stringify(row)}, ledger ${await bonusRows()})`);
    const r2 = await asUser(G, 'select public.world_event_join($1) as r', [today + '#13']);
    const ref = await contribute(G, today + '#13');
    const row2 = await joinRow(G);
    ok(r2?.error === 'already_joined' && row2.bonus === 300 && N(ref?.points) === 300 && await bonusRows() === 1,
      `RPS-5: a second join granted the bonus again (row ${JSON.stringify(row2)}, tally ${ref?.points}, ledger ${await bonusRows()})`);
    const nobody = await mkUser();
    const r3 = await asUser(nobody, 'select public.world_event_join($1) as r', [today + '#13']);
    ok(r3?.error === 'no_character', `RPS-5: a caller with no character joined: ${JSON.stringify(r3)}`);
    await q('drop function public.hr_muster_window(timestamptz)');
    await q('alter function public.hr_muster_window__rps(timestamptz) rename to hr_muster_window');
  }

  // ── RPS-6 a pre-column join (char_slot null) names its character on refresh.
  {
    await join(A, EK.combat, -30, -1, { charSlot: null });
    const r = await contribute(A, EK.combat);
    ok(r?.ok === true && (await joinRow(A)).char_slot === 0 && N(r?.points) === 675,
      `RPS-6: a null-character join refreshed to ${JSON.stringify(r)} (row char ${(await joinRow(A)).char_slot})`);
  }

  // ── RPS-10 PACE: 45 minutes of focused play each, within ±20% of 2,700 ────
  const FORTY_FIVE = 45 * 60000;
  const actions = (ms) => Math.floor(FORTY_FIVE / (ms * PACE.actionMs));
  const recipe = (id) => Object.values(ARTISAN_RECIPES).flat().find((x) => x.id === id);
  const OAK = TREES.find((t) => t.id === 'oak_tree');
  const SPLIT = recipe('split_rune_blanks'); const QUARRY = recipe('quarry_rubble');
  ok(OAK && SPLIT && QUARRY && SPLIT.outputQty > 1, 'FIXTURE: oak_tree / split_rune_blanks (multi-yield) / quarry_rubble missing');
  const pace = {};
  {
    const fighter = await mkPlayer();
    await join(fighter, EK.combat, -46, -1);
    await led(fighter, 0, 'combat', 'accrue', { kills: 36, mon: MON3, ...span(-46, -1) });   // a tier-3 kill every 75 s
    pace.fighter = N((await contribute(fighter, EK.combat))?.points);
    const fc = await claim(fighter);
    ok(fc?.ok === true && fc?.band === 'gold', `RPS-11: 45 focused minutes of combat did not reach Gold: ${JSON.stringify(fc)}`);

    const gatherer = await mkPlayer();
    await join(gatherer, EK.seam, -46, -1);
    await led(gatherer, 0, 'gather', 'accrue', { ticks: actions(OAK.ms), qty: actions(OAK.ms) * 2, node: 'oak_tree', skill: 'woodcutting', ...span(-46, -1) });
    pace.gatherer = N((await contribute(gatherer, EK.seam))?.points);
    ok(pace.gatherer === actions(OAK.ms) * paced(OAK.ms), `RPS-10: the gatherer scored ${pace.gatherer}, the formula says ${actions(OAK.ms) * paced(OAK.ms)}`);

    const crafter = await mkPlayer();
    await join(crafter, EK.forge, -46, -1);
    const n = actions(SPLIT.ms);
    await led(crafter, 0, 'craft', 'accrue', { ticks: n, burnt: 0, made: n * SPLIT.outputQty, skill: 'stonemason', recipe: 'split_rune_blanks', ...span(-46, -1) });
    pace.crafter = N((await contribute(crafter, EK.forge))?.points);
    ok(pace.crafter === n * paced(SPLIT.ms),
      `RPS-10 (C1): split_rune_blanks (${SPLIT.outputQty} per action) scored ${pace.crafter}; by ACTION it is ${n * paced(SPLIT.ms)} — quantity moved the score`);

    const mason = await mkPlayer();
    await join(mason, EK.forge, -46, -1);
    await led(mason, 0, 'craft', 'accrue', { ticks: actions(QUARRY.ms), burnt: 0, made: actions(QUARRY.ms) * QUARRY.outputQty, skill: 'stonemason', recipe: 'quarry_rubble', ...span(-46, -1) });
    pace.stonemason = N((await contribute(mason, EK.forge))?.points);
    for (const [who, pts] of Object.entries(pace)) {
      ok(pts >= 2160 && pts <= 3240, `RPS-10: the ${who} scored ${pts} in 45 focused minutes — outside 2,700 ±20%`);
    }
    obs.pace = pace;
  }

  // ── RPS-11 FIXED BANDS: silver at 1,600 while two others sit at 3,000 ─────
  {
    const H = await mkPlayer();
    const nQ = Math.ceil(1600 / paced(QUARRY.ms));
    await join(H, EK.forge, -30, -1);
    await led(H, 0, 'craft', 'accrue', { ticks: nQ, burnt: 0, made: nQ * QUARRY.outputQty, skill: 'stonemason', recipe: 'quarry_rubble', ...span(-29, -2) });
    for (let i = 0; i < 2; i++) {
      const o = await mkUser();
      await q(`insert into public.world_event_joins (day_key, user_id, event_key, slot, joined_at, window_end, points, char_slot)
               values ($1, $2, $3, 13, $4, $5, 3000, 0)`, [today, o, EK.forge, at(-30), at(-1)]);
    }
    const c = await claim(H);
    obs.rps11 = c;
    ok(c?.ok === true && N(c?.points) >= 1500 && N(c?.points) < 2500 && c?.band === 'silver',
      `RPS-11: ${c?.points} points banded ${c?.band}; the fixed ladder says silver whoever else turned up: ${JSON.stringify(c)}`);
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
    const w = (await q(`select has_function_privilege('authenticated', 'public.world_event_contribute(text)', 'execute') a,
                               has_table_privilege('authenticated', 'public.hr_rally_action_s', 'select') t`))[0];
    ok(w.a, 'RPS-7: world_event_contribute(text) is not callable by authenticated — the feature is dead');
    ok(!w.t, 'RPS-7: hr_rally_action_s is client-readable');
    const n = (await q("select count(*)::int n from pg_proc where proname in ('world_event_contribute','world_event_contribute__ungated') and pronargs <> 1"))[0].n;
    ok(n === 0, `RPS-7: ${n} points-taking world_event_contribute overload(s) exist`);
    const b = await q("select identity_args from public.hr_client_rpc_baseline where proname='world_event_contribute'");
    ok(b.length === 1 && b[0].identity_args === 'p_event_key text', `RPS-7: the baseline holds ${JSON.stringify(b)}`);
  }

  // ── RPS-9 DRIFT ───────────────────────────────────────────────────────────
  {
    const M = musterCatalogue();
    const sorted = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, o[k]]));
    for (const ev of M.EVENTS) {
      const rules = (await q('select public.hr_rally_point_rules($1) as r', [ev.id]))[0].r;
      ok(sorted(rules.sources) === sorted(ev.sources),
        `RPS-9: ${ev.id} sources drifted — server ${JSON.stringify(rules.sources)}, muster.js ${JSON.stringify(ev.sources)}`);
      ok(sorted(rules.bands) === sorted(M.BANDS), `RPS-9: bands drifted — server ${JSON.stringify(rules.bands)}, muster.js ${JSON.stringify(M.BANDS)}`);
      ok(N(rules.cap) === M.TOTAL_CAP, `RPS-9: cap ${rules.cap} vs muster.js TOTAL_CAP ${M.TOTAL_CAP}`);
    }
    const pool = (await q('select public.hr_rally_pool() as p'))[0].p;
    ok(JSON.stringify(pool) === JSON.stringify(M.EVENTS.map((e) => e.id)), `RPS-9: the rally pool drifted ${JSON.stringify(pool)}`);
    const dbRows = (await q('select kind, activity_id, paced_s from public.hr_rally_action_s order by kind, activity_id'))
      .map((r) => `${r.kind}:${r.activity_id}:${r.paced_s}`);
    const genRows = actionRows().map(([k, id, s]) => `${k}:${id}:${s}`).sort();
    ok(JSON.stringify(dbRows.slice().sort()) === JSON.stringify(genRows),
      `RPS-9: hr_rally_action_s (${dbRows.length}) differs from the generator (${genRows.length})`);
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
