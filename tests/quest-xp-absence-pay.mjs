#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/quest-xp-absence-pay.mjs — QUEST XP IS SERVER-CREDITED, AND THE
//   ABSENCE CHEST PAYS ITS GOLD AND GEMS — GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/quest-xp-absence-pay.mjs             # the guard
//   node tests/quest-xp-absence-pay.mjs --list      # the mutation catalogue
//   node tests/quest-xp-absence-pay.mjs --selftest  # every mutation must be CAUGHT
//   node tests/quest-xp-absence-pay.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-10-10-quest-xp-absence-pay.sql
//             src/legacy.js completeQuest (addXp removed; hundred_kills claims)
//             tests/no-client-xp-mint.mjs (the (c) debt register falls to 0)
//
// ── THE DEFECTS ─────────────────────────────────────────────────────────
//   1. hundred_kills paid 1,500 combat XP from the browser (addXp ->
//      _combatXpPending -> hr_credit_combat_xp): hr_claim_quest wrote no XP.
//   2. world_event_absence_claim priced the half-honours gold/gems and never
//      credited player_state; gold and gems are armed, so the client's local
//      credit no-ops and the player was paid nothing.
//
// ── WHAT THIS DRIVES ────────────────────────────────────────────────────
// The REAL chain replayed into PGlite, real characters from
// hr_create_character, the REAL rate-gated wrappers called AS `authenticated`:
//   QXA-1  hundred_kills below goal: refused incomplete, nothing moves, the
//          quest is NOT consumed.
//   QXA-2  at goal: the caller's player_skills delta EQUALS the receipt
//          ({hitpoints: 1500}), gold does not move, the version does.
//   QXA-3  WRONG USER: a second player's skills/gold do not move.
//   QXA-4  ONE quest ledger row: xp_in = 1500, meta.xp = the receipt.
//   QXA-5  DOUBLE CLAIM: the replay is refused already_claimed, nothing moves.
//   QXA-6  over the XP day budget: refused daily_budget BEFORE the consume.
//   QXA-7  a gold quest (gatherer) credits no XP (the catalogue read is per-quest).
//   QXA-8  ABSENCE (away) on a combat and a non-combat theme: gold/gems deltas
//          EQUAL the receipt, both > 0, within the band, journalled (ledger gold,
//          meta.gems), version moves, the bystander does not move.
//   QXA-9  ATTENDED (world_event_claim) on the same themes: the same equality —
//          the two paths credit by the same rule.
//   QXA-10 the absence replay is refused already_settled and pays nothing.
//   QXA-11 no client role can execute the inners; the wrappers stay callable.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY (PGlite is one backend) — the once-guards are exercised
//     as replays, the shape a retry takes.
//   · The browser half — the in-page "regression (b567)" QUEST-100 tests in
//     src/features/smoke/market-night-and-prices.js (attended completion and
//     the away recovery sweep).
// ════════════════════════════════════════════════════════════════════════
import { fileURLToPath } from 'node:url';
import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-10-10-quest-xp-absence-pay.sql';

const GATE_BLIND = [
  '  -- (a) GRANTS. Inners: no client role. Wrappers: authenticated, not anon.\n',
  '  if true then return; end if;   -- selftest: §4 short-circuited\n'
  + '  -- (a) GRANTS. Inners: no client role. Wrappers: authenticated, not anon.\n',
];

const Q_XP_INSERT = '    insert into public.player_skills as ps (user_id, slot, skill_id, xp)\n'
  + '      values (auth.uid(), v_slot, v_k, v_v::bigint)\n';
const A_GOLD = '  update public.player_state\n'
  + '     set gold = coalesce(gold, 0) + v_gold_out,\n'
  + '         gems = coalesce(gems, 0) + v_gems_out,\n'
  + '         version = version + 1,\n'
  + '         updated_at = now()\n'
  + '   where user_id = auth.uid() and slot = v_p.slot;\n';
const OTHER_USER = '(select o.user_id from public.player_state o where o.user_id <> auth.uid() order by o.user_id limit 1)';

const MUTATIONS = {
  quest_no_credit: {
    why: 'THE BUG restored: hr_claim_quest returns the XP receipt and writes no player_skills',
    p: [[Q_XP_INSERT + '      on conflict (user_id, slot, skill_id) do update set xp = ps.xp + excluded.xp;\n',
      '    perform v_k, v_v;   -- no credit\n']],
  },
  quest_wrong_user: {
    why: 'the quest XP lands on ANOTHER player\'s row',
    p: [[Q_XP_INSERT, '    insert into public.player_skills as ps (user_id, slot, skill_id, xp)\n'
      + `      values (${OTHER_USER}, v_slot, v_k, v_v::bigint)\n`]],
  },
  quest_double_claim: {
    why: 'the once-guard no longer refuses: a replay credits the XP again',
    p: [["  values (auth.uid(), v_slot, 'quest', p_quest_id, 1, '', 'claimed', now())\n"
      + '  on conflict (user_id, slot, kind, key, period_key) do nothing;\n',
    "  values (auth.uid(), v_slot, 'quest', p_quest_id, 1, '', 'claimed', now())\n"
      + '  on conflict (user_id, slot, kind, key, period_key) do update set value = public.player_progress.value + 1;\n']],
  },
  quest_xp_in_zero: {
    why: 'the quest XP is not journalled (xp_in 0) — invisible to the day budget',
    p: [['     v_gold, 0, v_xp_total, 0, 0,\n', '     v_gold, 0, 0, 0, 0,\n']],
  },
  quest_no_budget: {
    why: 'the day-budget check is removed: a character at its XP ceiling still mints',
    p: [['    v_bud := public.hr_day_budget_check(auth.uid(), v_slot, 0, v_xp_total, 0, 0);\n', '    v_bud := null;\n']],
  },
  quest_wrong_skill: {
    why: 'the catalogue is ignored: the XP is routed to attack (a client-style guess)',
    p: [[Q_XP_INSERT, '    insert into public.player_skills as ps (user_id, slot, skill_id, xp)\n'
      + "      values (auth.uid(), v_slot, 'attack', v_v::bigint)\n"]],
  },
  absence_no_credit: {
    why: 'THE BUG restored: the absence claim returns gold/gems and credits nothing',
    p: [[A_GOLD, '  update public.player_state set version = version + 1, updated_at = now()\n'
      + '   where user_id = auth.uid() and slot = v_p.slot;\n']],
  },
  absence_wrong_user: {
    why: 'the absence gold/gems land on ANOTHER player\'s row',
    p: [[A_GOLD, A_GOLD.replace('where user_id = auth.uid() and slot = v_p.slot',
      `where user_id = ${OTHER_USER} and slot = v_p.slot`)]],
  },
  absence_double_claim: {
    why: 'the settle guard is gone: a replay pays the gold/gems again',
    p: [["  if v_p.settled then\n    return jsonb_build_object('ok', false, 'error', 'already_settled');\n  end if;\n", ''],
      ["     set settled = true, settled_at = now(), outcome = 'absent', gold = c_gold, gems = c_gems\n"
        + '   where day_key = v_day_key and user_id = auth.uid() and settled = false;\n',
      "     set settled = true, settled_at = now(), outcome = 'absent', gold = c_gold, gems = c_gems\n"
        + '   where day_key = v_day_key and user_id = auth.uid();\n']],
  },
  absence_band_not_credited: {
    why: 'the receipt says the chest gold but the band (750) is credited — delta != receipt',
    p: [[A_GOLD, A_GOLD.replace('+ v_gold_out', '+ c_gold')]],
  },
  inner_client_executable: {
    why: 'the quest inner is granted to authenticated — the rate gate becomes decoration',
    p: [['revoke execute on function public.hr_claim_quest__ungated(text, int) from public, anon, authenticated, service_role;\n',
      'revoke execute on function public.hr_claim_quest__ungated(text, int) from public, anon, service_role;\n'
      + 'grant execute on function public.hr_claim_quest__ungated(text, int) to authenticated;\n']],
  },
};
/* Every defect again with §4 blinded, so it is THIS guard that catches it. */
for (const id of Object.keys(MUTATIONS)) {
  MUTATIONS[id + '_gate_blind'] = { ...MUTATIONS[id], why: MUTATIONS[id].why + ' — §4 blinded', blind: true };
}

const N = (v) => Number(v ?? 0);

export async function run(mutate) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };
  const obs = {};

  let patches;
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) { const e = new Error('unknown mutation ' + mutate); e.harness = true; throw e; }
    patches = new Map([[MIG, [...m.p, ...(m.blind ? [GATE_BLIND] : [])]]]);
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

  // ── FIXTURE: two real characters, made the server's own way. The bystander
  //    is created FIRST so a "wrong user" mutant has a row to hit.
  const mk = async (email) => {
    const uid = (await q('select gen_random_uuid() as i'))[0].i;
    await q('insert into auth.users (id, instance_id, aud, role, email) '
      + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)", [uid, email]);
    await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
    const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
    ok(cr?.ok === true || cr?.created === true, `FIXTURE: hr_create_character refused: ${JSON.stringify(cr)}`);
    return uid;
  };
  const bys = await mk('qxa-bystander@probe.invalid');
  const uid = await mk('qxa@probe.invalid');

  const skills = async (u) => Object.fromEntries((await q(
    'select skill_id, xp::text xp from public.player_skills where user_id=$1 and slot=0', [u]))
    .map((r) => [r.skill_id, N(r.xp)]));
  const state = async (u) => {
    const r = (await q('select gold::text g, gems::text m, version::text v from public.player_state where user_id=$1 and slot=0', [u]))[0];
    return { gold: N(r.g), gems: N(r.m), version: N(r.v) };
  };
  const setStat = (u, key, v) => q(`insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values ($1, 0, 'stat', $2, $3, '', 'active')
      on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value`, [u, key, v]);
  const claimQuest = (u, id) => asUser(u, 'select public.hr_claim_quest($1, 0) as r', [id]);
  const delta = (a, b) => {
    const d = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const x = N(b[k]) - N(a[k]); if (x) d[k] = x; }
    return d;
  };
  const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

  // ── QXA-1 below goal ─────────────────────────────────────────────────────
  await setStat(uid, 'ev:kill_any', 99);
  {
    const s0 = await skills(uid);
    const r = await claimQuest(uid, 'hundred_kills');
    obs.qxa1 = r;
    ok(r?.ok === false && r?.error === 'incomplete', `QXA-1: at 99 kills hundred_kills answered ${JSON.stringify(r)}`);
    ok(same(await skills(uid), s0), 'QXA-1: a refused incomplete claim moved player_skills');
    const consumed = (await q("select 1 from public.player_progress where user_id=$1 and kind='quest' and key='hundred_kills'", [uid])).length;
    ok(consumed === 0, 'QXA-1: the refused claim CONSUMED the quest — it could never pay');
  }

  // ── QXA-2..5 at goal, once ───────────────────────────────────────────────
  await setStat(uid, 'ev:kill_any', 100);
  {
    const s0 = await skills(uid); const st0 = await state(uid);
    const b0 = await skills(bys); const bst0 = await state(bys);
    const r = await claimQuest(uid, 'hundred_kills');
    obs.qxa2 = r;
    ok(r?.ok === true && r?.credited === true, `QXA-2: at 100 kills the claim did not pay: ${JSON.stringify(r)}`);
    const receipt = r?.xp && typeof r.xp === 'object' ? r.xp : {};
    ok(N(receipt.hitpoints) === 1500 && Object.keys(receipt).length === 1 && N(r?.xp_total) === 1500,
      `QXA-2 CONTROL: the receipt is not exactly {hitpoints: 1500}: ${JSON.stringify(r)}`);
    const s1 = await skills(uid); const st1 = await state(uid);
    ok(same(delta(s0, s1), receipt), `QXA-2: player_skills moved ${JSON.stringify(delta(s0, s1))}, the receipt says ${JSON.stringify(receipt)}`);
    ok(st1.gold === st0.gold, `QXA-2: hundred_kills moved gold ${st0.gold} -> ${st1.gold}`);
    ok(st1.version > st0.version, `QXA-2: the version did not move (${st0.version} -> ${st1.version})`);
    // QXA-3
    ok(same(await skills(bys), b0), 'QXA-3: the claim moved ANOTHER player\'s skills');
    ok(JSON.stringify(await state(bys)) === JSON.stringify(bst0), 'QXA-3: the claim moved ANOTHER player\'s state');
    // QXA-4
    const led = await q("select xp_in::text xp_in, meta from public.player_ledger where user_id=$1 and kind='quest' and intent='quest_claim:hundred_kills'", [uid]);
    ok(led.length === 1, `QXA-4: expected one quest ledger row, have ${led.length}`);
    ok(N(led[0]?.xp_in) === 1500, `QXA-4: ledger xp_in ${led[0]?.xp_in}, credited 1500`);
    ok(same(led[0]?.meta?.xp || {}, receipt), `QXA-4: meta.xp ${JSON.stringify(led[0]?.meta?.xp)} is not the receipt`);
    // QXA-5
    const again = await claimQuest(uid, 'hundred_kills');
    obs.qxa5 = again;
    ok(again?.ok === false && again?.error === 'already_claimed', `QXA-5: the replay was not refused: ${JSON.stringify(again)}`);
    ok(same(await skills(uid), s1), 'QXA-5: a refused replay moved player_skills');
    const n2 = (await q("select count(*)::int n from public.player_ledger where user_id=$1 and intent='quest_claim:hundred_kills'", [uid]))[0].n;
    ok(n2 === 1, `QXA-5: a refused replay journalled (${n2} rows)`);
  }

  // ── QXA-7 a gold quest pays no XP ────────────────────────────────────────
  await setStat(uid, 'ev:gather', 15);
  {
    const s0 = await skills(uid);
    const r = await claimQuest(uid, 'gatherer');
    ok(r?.ok === true && N(r?.xp_total) === 0 && same(await skills(uid), s0),
      `QXA-7: gatherer credited XP or failed: ${JSON.stringify(r)}`);
  }

  // ── QXA-6 the day budget (the bystander, at its ceiling) ─────────────────
  await setStat(bys, 'ev:kill_any', 100);
  await q(`insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
           values ($1, 0, 'admin', 'qxa-budget-probe', 0, 0, (public.hr_day_budget_limits()->>'xp')::bigint, 0, 0, '{}')`, [bys]);
  {
    const s0 = await skills(bys);
    const r = await claimQuest(bys, 'hundred_kills');
    obs.qxa6 = r;
    ok(r?.ok === false && r?.error === 'daily_budget', `QXA-6: over the XP budget the claim answered ${JSON.stringify(r)}`);
    ok(same(await skills(bys), s0), 'QXA-6: the budget refusal moved player_skills');
    const consumed = (await q("select 1 from public.player_progress where user_id=$1 and kind='quest' and key='hundred_kills'", [bys])).length;
    ok(consumed === 0, 'QXA-6: the budget refusal SPENT the quest');
  }

  // ── QXA-8..10 the rally gold/gems, AWAY and ATTENDED ─────────────────────
  const keys = (await q(`
    with d as (select generate_series((now() at time zone 'utc')::date - 400, (now() at time zone 'utc')::date,
                                      interval '1 day')::date as d),
         k as (select public.hr_utc_day_key((d + interval '12 hours') at time zone 'utc') || '#' || h as k
                 from d cross join (values (1), (13)) h(h))
    select (select k from k where public.hr_rally_event_for_key(k) = 'ashen_horde' limit 1) as combat,
           (select k from k where public.hr_rally_event_for_key(k) = 'forge_levy'  limit 1) as craft`))[0];
  ok(keys.combat && keys.craft, `FIXTURE: no event keys found ${JSON.stringify(keys)}`);
  const today = (await q('select public.hr_utc_day_key() as k'))[0].k;
  const pday = (await q("select to_char((now() at time zone 'utc')::date - 1, 'YYYY-MM-DD') as d"))[0].d;
  const pdk = (await q("select public.hr_utc_day_key(((public.hr_rally_day($1)) + interval '12 hours') at time zone 'utc') as k", [pday]))[0].k;
  const rallyRows = async () => q("select gold::text gold, meta from public.player_ledger where user_id=$1 and kind='rally' order by id", [uid]);

  for (const [tag, path, ek] of [['QXA-8', 'away', keys.combat], ['QXA-8', 'away', keys.craft],
    ['QXA-9', 'attended', keys.combat], ['QXA-9', 'attended', keys.craft]]) {
    await q('delete from public.world_event_joins where user_id=$1', [uid]);
    await q('delete from public.world_event_pledges where user_id=$1', [uid]);
    let call;
    if (path === 'attended') {
      await q(`insert into public.world_event_totals (event_key, participants, goal, progress, met_at)
               values ($1, 1, 6000, 6000, now()) on conflict (event_key) do update set met_at = now()`, [ek]);
      await q(`insert into public.world_event_joins (day_key, user_id, event_key, slot, window_end, points)
               values ($1, $2, $3, 0, now() - interval '1 minute', 500)`, [today, uid, ek]);
      call = () => asUser(uid, 'select public.world_event_claim($1, 0) as r', [today]);
    } else {
      await q(`insert into public.world_event_pledges (day_key, user_id, event_key, slot, settled)
               values ($1, $2, $3, 0, false)`, [pdk, uid, ek]);
      call = () => asUser(uid, 'select public.world_event_absence_claim($1) as r', [pday]);
    }
    const st0 = await state(uid); const b0 = await state(bys); const l0 = (await rallyRows()).length;
    const r = await call();
    const st1 = await state(uid); const led = await rallyRows();
    obs[`${tag}-${path}-${ek}`] = { gold: r?.gold, gems: r?.gems, band_gold: r?.band_gold };
    ok(r?.ok === true, `${tag} ${path}/${ek}: the claim did not pay: ${JSON.stringify(r)}`);
    ok(N(r?.gold) > 0 && N(r?.gems) > 0, `${tag} ${path}/${ek} CONTROL: the receipt pays no gold/gems: ${JSON.stringify(r)}`);
    if (path === 'away') {
      ok(N(r?.gold) <= 750 && N(r?.gems) <= 1, `${tag}: the absence receipt exceeds the band: ${JSON.stringify(r)}`);
    }
    ok(st1.gold - st0.gold === N(r?.gold), `${tag} ${path}/${ek}: gold moved +${st1.gold - st0.gold}, the receipt says ${r?.gold}`);
    ok(st1.gems - st0.gems === N(r?.gems), `${tag} ${path}/${ek}: gems moved +${st1.gems - st0.gems}, the receipt says ${r?.gems}`);
    ok(st1.version > st0.version, `${tag} ${path}/${ek}: the version did not move`);
    ok(JSON.stringify(await state(bys)) === JSON.stringify(b0), `${tag} ${path}/${ek}: ANOTHER player's gold/gems moved`);
    const last = led[led.length - 1] || {};
    ok(led.length === l0 + 1, `${tag} ${path}/${ek}: expected one new rally ledger row, have ${l0} -> ${led.length}`);
    ok(N(last.gold) === N(r?.gold) && N(last.meta?.gems) === N(r?.gems),
      `${tag} ${path}/${ek}: the journal does not carry the credit (gold ${last.gold}, meta.gems ${last.meta?.gems})`);
    // QXA-10 replay
    const again = await call();
    ok(again?.ok === false && /already_(claimed|settled)/.test(again?.error || ''),
      `QXA-10 ${path}/${ek}: the replay was not refused: ${JSON.stringify(again)}`);
    ok(JSON.stringify(await state(uid)) === JSON.stringify(st1), `QXA-10 ${path}/${ek}: a refused replay paid`);
    ok((await rallyRows()).length === l0 + 1, `QXA-10 ${path}/${ek}: a refused replay journalled`);
  }

  // ── QXA-11 grants ────────────────────────────────────────────────────────
  for (const sig of ['public.hr_claim_quest__ungated(text,integer)', 'public.world_event_absence_claim__ungated(text)']) {
    const r = (await q(`select has_function_privilege('authenticated', $1, 'execute') a,
                               has_function_privilege('anon', $1, 'execute') b`, [sig]))[0];
    ok(!r.a && !r.b, `QXA-11: ${sig} is client-executable`);
  }
  for (const sig of ['public.hr_claim_quest(text,integer)', 'public.world_event_absence_claim(text)']) {
    const r = (await q("select has_function_privilege('authenticated', $1, 'execute') a", [sig]))[0];
    ok(r.a, `QXA-11: ${sig} is not callable by authenticated — the feature is dead`);
  }

  await db.close().catch(() => {});
  return { problems: problems.map((p) => 'quest-xp-absence-pay: ' + p), obs };
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
    console.log('quest-xp-absence-pay: the run THREW — ' + String(e && e.message).split('\n')[0]);
    if (e && e.query) console.log('  query: ' + String(e.query).slice(0, 300));
    process.exit(1);
  }
  console.log(JSON.stringify(obs, null, 1));
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log(' ✖ ' + p);
    process.exit(1);
  }
  console.log(`\nquest-xp-absence-pay: green in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
