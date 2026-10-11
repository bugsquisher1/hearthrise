#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/muster-chest-xp-credit.mjs — THE RALLY CHEST'S XP IS SERVER-CREDITED,
//   ON BOTH PATHS, GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/muster-chest-xp-credit.mjs             # the guard
//   node tests/muster-chest-xp-credit.mjs --list      # the mutation catalogue
//   node tests/muster-chest-xp-credit.mjs --selftest  # every mutation must be CAUGHT
//   node tests/muster-chest-xp-credit.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-10-10-muster-chest-xp-credit.sql
//             src/features/muster.js (payChest drops addXp)
//             tests/no-client-xp-mint.mjs (XP-5: a (b) label names its RPC)
//
// ── THE DEFECT (P1, CLAUDE.md §1) ───────────────────────────────────────
// hr_rally_chest prices up to 3,000 XP out of a band's gold; both claim RPCs
// returned that list and NEVER wrote player_skills, and the browser called
// window.addXp for it. Non-combat XP vanished at the next envelope (and the
// gold that bought it was spent); combat XP rode _combatXpPending into
// hr_credit_combat_xp — client-authored, ranked.
//
// ── WHAT THIS DRIVES ────────────────────────────────────────────────────
// The REAL chain (tests/schema-apply-order.json) replayed into PGlite, a real
// character made by hr_create_character, and the REAL rate-gated wrappers called
// AS `authenticated` with a JWT subject:
//   MXC-1  ATTENDED (world_event_claim), COMBAT theme (ashen_horde): the
//          player_skills delta EQUALS the response's xp list, exactly, and only
//          theme skills move.
//   MXC-2  ATTENDED, NON-COMBAT theme (forge_levy): same, and no combat skill moves.
//   MXC-3  AWAY (world_event_absence_claim), combat theme: same.
//   MXC-4  AWAY, non-combat theme: same.
//   MXC-5  each claim journals ONE rally ledger row with xp_in = the credited
//          total and meta.xp = the response list, and moves the version.
//   MXC-6  a REPLAY on each path is refused and moves nothing.
//   MXC-7  over the XP day budget the claim is refused 'daily_budget' BEFORE the
//          consume: the claim stays claimable, nothing moves.
//   MXC-8  no client role can execute the inners or hr_rally_xp_credit.
//   MXC-9  the calculator credits only theme skills that exist, numbers only,
//          each and the total clamped to 3000; an unknown event key pays none.
//   MXC-10 (Security block, rev.2) THE REAL PLEDGE: world_event_pledge records
//          slot = the WINDOW and char_slot = the character in play; the absence
//          claim on it credits that character, never character slot 1. A
//          second character sits in slot 1 throughout and must never move;
//          absence fixtures use the real shape (slot = split_part(ek,'#',2)).
//   MXC-11 a pledge with no char_slot is refused no_character and stays owed.
//   MXC-12 the absence wrapper settles-before-mutate on char_slot.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY (PGlite is one backend) — the once-guard is exercised as
//     a replay, the shape a retry takes.
//   · The browser half (payChest renders, never adds) — the in-page regression
//     "regression (b567)" in src/features/smoke/companions-claims-and-renown.js.
//   · Production's ACL — the migration's §4(a) asserts it at apply time.
// ════════════════════════════════════════════════════════════════════════
import { fileURLToPath } from 'node:url';
import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-10-10-muster-chest-xp-credit.sql';

/* Short-circuits the migration's own §4 so ONLY this file's assertions can see a
   planted defect (the b484-b487 stale-template class: a later restatement never
   runs this file's self-check). */
const GATE_BLIND = [
  '  -- (a) GRANTS. Inners and the calculator: no client role. Wrappers: authenticated.',
  '  if true then return; end if;   -- selftest: §4 short-circuited\n'
  + '  -- (a) GRANTS. Inners and the calculator: no client role. Wrappers: authenticated.',
];

const ONLINE_CREDIT = '    insert into public.player_skills as ps (user_id, slot, skill_id, xp)\n'
  + '      values (auth.uid(), v_slot, v_sk, v_amt)\n';
const AWAY_CREDIT = '    insert into public.player_skills as ps (user_id, slot, skill_id, xp)\n'
  + '      values (auth.uid(), v_cs, v_sk, v_amt)\n';

const MUTATIONS = {
  online_no_credit: {
    why: 'THE BUG, restored on the attended path: the claim returns the XP list and writes nothing',
    find: ONLINE_CREDIT + '      on conflict (user_id, slot, skill_id) do update set xp = ps.xp + excluded.xp;\n',
    repl: '    perform v_sk, v_amt;   -- no credit\n',
  },
  away_no_credit: {
    why: 'THE BUG, restored on the absence path',
    find: AWAY_CREDIT + '      on conflict (user_id, slot, skill_id) do update set xp = ps.xp + excluded.xp;\n',
    repl: '    perform v_sk, v_amt;   -- no credit\n',
  },
  online_xp_in_zero: {
    why: 'the credit is not journalled into the day budget (xp_in 0) — the b422 convention Security overruled',
    find: '     v_gold_out, 0, v_xp_total, 0, 0,',
    repl: '     v_gold_out, 0, 0, 0, 0,',
  },
  away_double_credit: {
    why: 'the absence credit is applied twice (a doubled upsert) — the response understates what moved',
    find: AWAY_CREDIT + '      on conflict (user_id, slot, skill_id) do update set xp = ps.xp + excluded.xp;\n',
    repl: AWAY_CREDIT + '      on conflict (user_id, slot, skill_id) do update set xp = ps.xp + excluded.xp * 2;\n',
  },
  no_budget: {
    why: 'the day-budget check is removed from the attended claim: a character at its ceiling still mints',
    find: "    v_bud := public.hr_day_budget_check(auth.uid(), v_slot, 0, v_xp_total, 0, 0);\n",
    repl: "    v_bud := null;\n",
  },
  budget_after_consume: {
    why: 'the budget refusal SPENDS the claim (the check moved after the consume)',
    find: "      return jsonb_build_object('ok', false, 'error', 'daily_budget', 'detail', v_bud, 'slot', v_slot);\n",
    repl: "      update public.world_event_joins set claimed = true where day_key = p_day_key and user_id = auth.uid();\n"
        + "      return jsonb_build_object('ok', false, 'error', 'daily_budget', 'detail', v_bud, 'slot', v_slot);\n",
  },
  foreign_skill: {
    why: 'the calculator stops checking the theme: any skill the chest list names is credited',
    find: "    if v_sk is null or not (v_sk = any(v_skills))\n",
    repl: "    if v_sk is null\n",
  },
  inner_client_executable: {
    why: 'the absence inner is granted to authenticated — the rate gate becomes decoration',
    find: "revoke execute on function public.world_event_absence_claim__ungated(text) from anon, authenticated, service_role;\n",
    repl: "revoke execute on function public.world_event_absence_claim__ungated(text) from anon, service_role;\n"
        + "grant execute on function public.world_event_absence_claim__ungated(text) to authenticated;\n",
  },
  window_slot: {
    why: 'THE SECURITY BLOCK, restored: the absence claim credits world_event_pledges.slot — the rally '
       + 'WINDOW — so #13 refuses and #1 pays whoever sits in character slot 1',
    find: '  v_cs := v_p.char_slot;\n',
    repl: '  v_cs := v_p.slot;\n',
  },
  slot_13: {
    why: 'the absence claim credits a planted slot 13 (Security\'s mutant)',
    find: '  v_cs := v_p.char_slot;\n',
    repl: '  v_cs := 13;\n',
  },
  pledge_records_window: {
    why: 'the pledge records the WINDOW as the character (char_slot := slot)',
    find: '  values (v_day_key, auth.uid(), p_event_key, v_slot, v_char)\n',
    repl: '  values (v_day_key, auth.uid(), p_event_key, v_slot, v_slot)\n',
  },
  no_settle_first: {
    why: 'the absence wrapper drops settle-before-mutate: XP lands on a character with an unpaid window open',
    find: '      if v_settle is not null then return v_settle; end if;\n',
    repl: '      null;\n',
  },
};
/* Every body defect again with §4 blinded, so it is THIS guard that catches it. */
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
    patches = new Map([[MIG, [[m.find, m.repl], ...(m.blind ? [GATE_BLIND] : [])]]]);
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

  // ── FIXTURE: one real character, made the server's own way. Rally joins and
  //    pledges are inserted as rows (joining needs a live window; that path has
  //    its own guards) — what is under test is the CLAIM.
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q('insert into auth.users (id, instance_id, aud, role, email) '
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid, 'mxc@probe.invalid']);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
  ok(cr?.ok === true || cr?.created === true, `FIXTURE: hr_create_character refused: ${JSON.stringify(cr)}`);
  /* A SECOND character in slot 1 — the slot a '#1' rally WINDOW number names.
     Inserted as a row (a hero slot is a gem purchase with its own guard); it is
     the decoy the Security block found being paid, and it must never move. The
     character in play (latest heartbeat) is slot 0. */
  await q('insert into public.player_state (user_id, slot, gold, gems, version) values ($1, 1, 0, 0, 1)', [uid]);
  await q("update public.player_state set last_seen_at = now() - interval '1 hour' where user_id=$1 and slot=1", [uid]);
  await q('update public.player_state set last_seen_at = now() where user_id=$1 and slot=0', [uid]);

  // One key per WINDOW, so the absence path is driven with a '#1' pledge (the
  // window that names a real character slot) AND a '#13' pledge (one that names none).
  const keys = (await q(`
    with d as (select generate_series((now() at time zone 'utc')::date - 400, (now() at time zone 'utc')::date,
                                      interval '1 day')::date as d),
         k as (select public.hr_utc_day_key((d + interval '12 hours') at time zone 'utc') || '#' || h as k, h
                 from d cross join (values (1), (13)) h(h))
    select (select k from k where h = 1  and public.hr_rally_event_for_key(k) = 'ashen_horde' limit 1) as combat,
           (select k from k where h = 13 and public.hr_rally_event_for_key(k) = 'forge_levy'  limit 1) as craft`))[0];
  ok(keys.combat && keys.craft, `FIXTURE: no event keys found ${JSON.stringify(keys)}`);
  const today = (await q('select public.hr_utc_day_key() as k'))[0].k;
  const pday = (await q("select to_char((now() at time zone 'utc')::date - 1, 'YYYY-MM-DD') as d"))[0].d;
  const pdk = (await q("select public.hr_utc_day_key(((public.hr_rally_day($1)) + interval '12 hours') at time zone 'utc') as k", [pday]))[0].k;

  const skills = async () => Object.fromEntries((await q(
    'select skill_id, xp::text xp from public.player_skills where user_id=$1 and slot=0', [uid]))
    .map((r) => [r.skill_id, N(r.xp)]));
  const version = async () => N((await q('select version::text v from public.player_state where user_id=$1 and slot=0', [uid]))[0].v);
  const rallyRows = async () => (await q(
    "select xp_in::text xp_in, meta from public.player_ledger where user_id=$1 and kind='rally' order by id", [uid]));
  const themeSkills = async (ek) => (await q(
    "select jsonb_array_elements_text(public.hr_rally_theme(public.hr_rally_event_for_key($1))->'skills') s", [ek])).map((r) => r.s);
  const COMBAT = new Set(['attack', 'strength', 'defense', 'hitpoints', 'ranged', 'magic', 'prayer']);

  const claimOnce = async (path, ek) => {
    await q('delete from public.world_event_joins where user_id=$1', [uid]);
    await q('delete from public.world_event_pledges where user_id=$1', [uid]);
    if (path === 'attended') {
      await q(`insert into public.world_event_totals (event_key, participants, goal, progress, met_at)
               values ($1, 1, 6000, 6000, now()) on conflict (event_key) do update set met_at = now()`, [ek]);
      await q(`insert into public.world_event_joins (day_key, user_id, event_key, slot, window_end, points)
               values ($1, $2, $3, 0, now() - interval '1 minute', 500)`, [today, uid, ek]);
      return () => asUser(uid, 'select public.world_event_claim($1, 0) as r', [today]);
    }
    /* THE REAL SHAPE world_event_pledge__ungated writes (Security, rev.2):
       slot = the WINDOW split from the event key, char_slot = the character the
       server derived (the one in play, slot 0). MXC-10 drives the real pledge. */
    await q(`insert into public.world_event_pledges (day_key, user_id, event_key, slot, char_slot, settled)
             values ($1, $2, $3, split_part($3, '#', 2)::int, 0, false)`, [pdk, uid, ek]);
    return () => asUser(uid, 'select public.world_event_absence_claim($1) as r', [pday]);
  };
  const decoySkills = async () => N((await q(
    'select count(*)::text n from public.player_skills where user_id=$1 and slot=1', [uid]))[0].n);

  // ── MXC-1..6 ─────────────────────────────────────────────────────────────
  const cases = [['MXC-1', 'attended', keys.combat], ['MXC-2', 'attended', keys.craft],
    ['MXC-3', 'away', keys.combat], ['MXC-4', 'away', keys.craft]];
  for (const [tag, path, ek] of cases) {
    const call = await claimOnce(path, ek);
    const s0 = await skills(); const v0 = await version(); const l0 = (await rallyRows()).length;
    const r = await call();
    const s1 = await skills(); const v1 = await version(); const led = await rallyRows();
    obs[tag] = { path, ek, xp: r?.xp, xp_total: r?.xp_total };
    ok(r?.ok === true, `${tag} ${path}/${ek}: the claim did not pay: ${JSON.stringify(r)}`);
    ok(await decoySkills() === 0, `${tag} ${path}/${ek}: character slot 1 (the WINDOW number) was credited`);
    const list =Array.isArray(r?.xp) ? r.xp : [];
    ok(list.length > 0 && N(r?.xp_total) > 0, `${tag}: CONTROL — the response credits no XP (${JSON.stringify(r)}); `
      + 'the equality below would be vacuous');
    const want = {}; let sum = 0;
    for (const x of list) { want[x.skill] = (want[x.skill] || 0) + N(x.amount); sum += N(x.amount); }
    const moved = {};
    for (const k of new Set([...Object.keys(s0), ...Object.keys(s1)])) {
      const d = N(s1[k]) - N(s0[k]); if (d) moved[k] = d;
    }
    ok(JSON.stringify(Object.entries(moved).sort()) === JSON.stringify(Object.entries(want).sort()),
      `${tag} ${path}: player_skills moved ${JSON.stringify(moved)}, the response says ${JSON.stringify(want)}`);
    ok(sum === N(r?.xp_total), `${tag}: xp list sums to ${sum}, xp_total is ${r?.xp_total}`);
    const theme = await themeSkills(ek);
    ok(Object.keys(want).every((k) => theme.includes(k)), `${tag}: a non-theme skill was credited ${JSON.stringify(want)}`);
    if (ek === keys.combat) ok(Object.keys(want).some((k) => COMBAT.has(k)), `${tag}: the combat theme credited no combat skill`);
    else ok(!Object.keys(moved).some((k) => COMBAT.has(k)), `${tag}: the non-combat theme moved a combat skill ${JSON.stringify(moved)}`);
    // MXC-5
    ok(led.length === l0 + 1, `MXC-5 ${tag}: expected one new rally ledger row, have ${l0} -> ${led.length}`);
    const last = led[led.length - 1] || {};
    ok(N(last.xp_in) === sum, `MXC-5 ${tag}: ledger xp_in ${last.xp_in}, credited ${sum}`);
    ok(JSON.stringify(last.meta?.xp) === JSON.stringify(list), `MXC-5 ${tag}: meta.xp ${JSON.stringify(last.meta?.xp)} is not the response list`);
    ok(v1 > v0, `MXC-5 ${tag}: the version did not move (${v0} -> ${v1})`);
    // MXC-6
    const again = await call();
    ok(again?.ok === false && /already_(claimed|settled)/.test(again?.error || ''),
      `MXC-6 ${tag}: a replay was not refused: ${JSON.stringify(again)}`);
    ok(JSON.stringify(await skills()) === JSON.stringify(s1), `MXC-6 ${tag}: a refused replay moved player_skills`);
    ok((await rallyRows()).length === l0 + 1, `MXC-6 ${tag}: a refused replay journalled`);
  }

  // ── MXC-9 the calculator refuses what is not the theme's ─────────────────
  //    hr_rally_chest only ever emits theme skills, so the claims cannot show
  //    this; the calculator is driven directly (as its owner) with the refusals
  //    FIRST, while the 3000 total still has room.
  {
    const r = (await q(`select public.hr_rally_xp_credit($1, $2::jsonb) as r`, [keys.craft, JSON.stringify({ xp: [
      { skill: 'attack', amount: 500 }, { skill: 'bogus', amount: 5 }, { skill: 'smithing', amount: '700' },
      { skill: 'smithing', amount: 1e12 }, { skill: 'crafting', amount: 50 }] })]))[0].r;
    obs.mxc9 = r;
    ok(N(r?.total) === 3000 && N(r?.by_skill?.smithing) === 3000 && Object.keys(r?.by_skill || {}).length === 1,
      `MXC-9: the calculator credited ${JSON.stringify(r)} — expected only smithing, clamped to 3000`);
    const none = (await q(`select public.hr_rally_xp_credit('not-a-key', $1::jsonb) as r`,
      [JSON.stringify({ xp: [{ skill: 'attack', amount: 10 }] })]))[0].r;
    ok(N(none?.total) === 0, `MXC-9: an unknown event key credited ${JSON.stringify(none)}`);
  }

  // ── MXC-10 THE REAL PLEDGE -> ABSENCE CLAIM, end to end ──────────────────
  //    world_event_pledge only answers BEFORE a window opens and the absence
  //    claim only AFTER the day closes, so the test drives the rally clock: a
  //    test-only shim over hr_rally_slot shifts every window by `mxc.shift`
  //    (+1 day to pledge today's '#1', -1 day to close it). Nothing else moves.
  {
    await q('alter function public.hr_rally_slot(text,integer) rename to hr_rally_slot__mxc');
    await q(`create function public.hr_rally_slot(p_day_key text, p_slot int)
             returns table (day_key text, slot int, event_key text, started_at timestamptz, ends_at timestamptz)
             language sql stable as $f$
               select r.day_key, r.slot, r.event_key, r.started_at + s.v, r.ends_at + s.v
                 from public.hr_rally_slot__mxc(p_day_key, p_slot) r,
                      (select coalesce(nullif(current_setting('mxc.shift', true), ''), '0 s')::interval v) s
             $f$`);
    await q('delete from public.world_event_joins where user_id=$1', [uid]);
    await q('delete from public.world_event_pledges where user_id=$1', [uid]);
    const ek = today + '#1';
    await q("select set_config('mxc.shift', '1 day', false)");
    const pl = await asUser(uid, 'select public.world_event_pledge($1) as r', [ek]);
    const row = (await q('select slot, char_slot from public.world_event_pledges where user_id=$1', [uid]))[0] || {};
    obs.mxc10 = { pledge: pl, row };
    ok(pl?.ok === true, `MXC-10: the real pledge was refused: ${JSON.stringify(pl)}`);
    ok(N(row.slot) === 1 && row.char_slot === 0,
      `MXC-10: the pledge row is ${JSON.stringify(row)} — expected window slot 1 and char_slot 0 (the character in play)`);
    await q("select set_config('mxc.shift', '-1 day', false)");
    const s0 = await skills();
    const r = await asUser(uid, 'select public.world_event_absence_claim($1) as r', [today]);
    const s1 = await skills();
    obs.mxc10.claim = r;
    const credited = (Array.isArray(r?.xp) ? r.xp : []).reduce((a, x) => a + N(x.amount), 0);
    const moved = Object.keys(s1).reduce((a, k) => a + (N(s1[k]) - N(s0[k])), 0);
    ok(r?.ok === true && credited > 0 && moved === credited,
      `MXC-10: the absence claim on a real '#1' pledge credited slot 0 by ${moved}, response ${JSON.stringify(r)}`);
    ok(await decoySkills() === 0, 'MXC-10: the real pledge paid character slot 1 — the WINDOW number');
    await q("select set_config('mxc.shift', '0 s', false)");
    await q('drop function public.hr_rally_slot(text,integer)');
    await q('alter function public.hr_rally_slot__mxc(text,integer) rename to hr_rally_slot');
  }

  // ── MXC-11 a pledge naming no character stays owed ───────────────────────
  {
    await q('delete from public.world_event_pledges where user_id=$1', [uid]);
    await q(`insert into public.world_event_pledges (day_key, user_id, event_key, slot, settled)
             values ($1, $2, $3, 1, false)`, [pdk, uid, keys.combat]);
    const r = await asUser(uid, 'select public.world_event_absence_claim($1) as r', [pday]);
    const st = (await q('select settled from public.world_event_pledges where user_id=$1', [uid]))[0]?.settled;
    ok(r?.error === 'no_character' && st === false && await decoySkills() === 0,
      `MXC-11: a pledge with no char_slot answered ${JSON.stringify(r)} (settled ${st})`);
  }

  // ── MXC-12 settle-before-mutate on the pledge's character ────────────────
  {
    await q('delete from public.world_event_pledges where user_id=$1', [uid]);
    await q(`insert into public.world_event_pledges (day_key, user_id, event_key, slot, char_slot, settled)
             values ($1, $2, $3, 13, 0, false)`, [pdk, uid, keys.craft]);
    const st0 = (await q('select active_kind, active_id, accrued_to from public.player_state where user_id=$1 and slot=0', [uid]))[0];
    await q("update public.player_state set active_kind='combat', active_id='rat', accrued_to = now() - interval '10 minutes' where user_id=$1 and slot=0", [uid]);
    const s0 = await skills();
    const r = await asUser(uid, 'select public.world_event_absence_claim($1) as r', [pday]);
    const st = (await q('select settled from public.world_event_pledges where user_id=$1', [uid]))[0]?.settled;
    obs.mxc12 = r;
    ok(r?.error === 'settle_first' && st === false && JSON.stringify(await skills()) === JSON.stringify(s0),
      `MXC-12: an unpaid combat window on the pledge's character did not refuse settle_first: ${JSON.stringify(r)} (settled ${st})`);
    await q('update public.player_state set active_kind=$2, active_id=$4, accrued_to=$3 where user_id=$1 and slot=0',
      [uid, st0.active_kind, st0.accrued_to, st0.active_id]);
  }

  // ── MXC-7 the day budget, refused before the consume (LAST: it fills the
  //    day's XP budget for slot 0) ────────────────────────────────────────
  {
    const call = await claimOnce('attended', keys.combat);
    await q(`insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
             values ($1, 0, 'admin', 'mxc-budget-probe', 0, 0, (public.hr_day_budget_limits()->>'xp')::bigint, 0, 0, '{}')`, [uid]);
    const s0 = await skills(); const l0 = (await rallyRows()).length;
    const r = await call();
    obs.mxc7 = r;
    ok(r?.ok === false && r?.error === 'daily_budget', `MXC-7: over the XP budget the claim answered ${JSON.stringify(r)}`);
    const claimed = (await q('select claimed from public.world_event_joins where user_id=$1', [uid]))[0]?.claimed;
    ok(claimed === false, 'MXC-7: the budget refusal SPENT the claim');
    ok(JSON.stringify(await skills()) === JSON.stringify(s0), 'MXC-7: the budget refusal moved player_skills');
    ok((await rallyRows()).length === l0, 'MXC-7: the budget refusal journalled');
  }

  // ── MXC-8 the grants ─────────────────────────────────────────────────────
  for (const sig of ['public.world_event_claim__ungated(text,integer)', 'public.world_event_absence_claim__ungated(text)',
    'public.hr_rally_xp_credit(text,jsonb)', 'public.world_event_pledge__ungated(text)',
    'public.hr_rally_pledge_char(uuid)']) {
    const r = (await q(`select has_function_privilege('authenticated', $1, 'execute') a,
                               has_function_privilege('anon', $1, 'execute') b`, [sig]))[0];
    ok(!r.a && !r.b, `MXC-8: ${sig} is client-executable`);
  }

  await db.close().catch(() => {});
  return { problems: problems.map((p) => 'muster-chest-xp-credit: ' + p), obs };
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
    console.log('muster-chest-xp-credit: the run THREW — ' + String(e && e.message).split('\n')[0]);
    if (e && e.query) console.log('  query: ' + String(e.query).slice(0, 300));
    process.exit(1);
  }
  console.log(JSON.stringify(obs, null, 1));
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log(' ✖ ' + p);
    process.exit(1);
  }
  console.log(`\nmuster-chest-xp-credit: green in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
