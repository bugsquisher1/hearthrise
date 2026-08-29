#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/renown-kill-faucet.mjs — THE CLIENT-CREDITED-KILL RENOWN DISCOUNT,
//                                GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/renown-kill-faucet.mjs             # the guard
//   node tests/renown-kill-faucet.mjs --list      # the mutation catalogue
//   node tests/renown-kill-faucet.mjs --selftest  # every mutation must be CAUGHT
//   node tests/renown-kill-faucet.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-09-02-renown-kill-faucet.sql
//
// ── THE DEFECT (Security R5) — PRE-EXISTING AND LIVE ────────────────────
// hr_credit_kills (bounty branch) writes stat/ev:kill_any and
// stat/ev:kill_monster:<id>, and hr_renown_of SCORES both — 0.05/kill, and
// 5/kill for is_boss ids. The structural root is that hr_bounty_kills reads
// stat/ev:kill_monster:<target>, i.e. the SAME row the bestiary displays and
// renown scores, so moving renown is a side effect of making a bounty
// completable. Measured: 65 boss kills/min behind ONE held bounty = 19,500
// renown/hour, ~8.5x honest, with no gear, no risk and no combat.
//
// Renown gates hr_claim_rank (1,603,000 gold + 925 gems per character across the
// ladder; gold feeds the LIVE `wealth` board) and the renownAllXp perk (+0.04
// all-skill XP, feeding the LIVE total_level / combat_level boards).
//
// ── WHY THE HONEST CONTROL IS CHECK #1 AND NOT AN AFTERTHOUGHT ──────────
// Every "the faucet is closed" assertion in this file is an assertion that a
// number did NOT move. All of them pass trivially if renown is broken to always
// return 0 — which is exactly the kind of fix that looks green and silently
// deletes a progression system. So R1 runs FIRST and requires a server-simulated
// settle to move renown by the exact expected amount; only then do R2..R5 mean
// anything. `--mutate=renown_always_zero` proves R1 is the thing catching it.
//
// ── WHAT THIS FILE DRIVES ───────────────────────────────────────────────
// The REAL migration chain from tests/schema-apply-order.json, applied verbatim
// into PGlite (real PostgreSQL, in process), then a real player through the REAL
// hr_accept_bounty / hr_credit_kills / hr_claim_bounty against a REAL is_boss
// monster — and hr_renown_of read as the engine reads it.
//
// Exit: 0 green · 1 a real problem · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-09-02-renown-kill-faucet.sql';

/* Each mutation is a REAL defect a future edit could reintroduce, planted into
   the migration TEXT before it is applied. `find` must match exactly once (the
   harness enforces it), so a mutation that stops matching is reported rather
   than silently skipped — a mutation that cannot be planted is decoration. */
const MUTATIONS = {
  no_discount_kill_any: {
    why: 'the kill term stops subtracting ev:kill_credited_any, so every client-credited kill scores '
       + '0.05 renown again — the aggregate half of the faucet is re-opened',
    find: `    + greatest(0::bigint,
        coalesce((select value from public.player_progress
                   where user_id = p_user and slot = coalesce(p_slot, 0)
                     and kind = 'stat' and period_key = '' and key = 'ev:kill_any'), 0)
      - coalesce((select value from public.player_progress
                   where user_id = p_user and slot = coalesce(p_slot, 0)
                     and kind = 'stat' and period_key = '' and key = 'ev:kill_credited_any'), 0)
      )::float8`,
    repl: `    + coalesce((select value from public.player_progress
                 where user_id = p_user and slot = coalesce(p_slot, 0)
                   and kind = 'stat' and period_key = '' and key = 'ev:kill_any'), 0)::float8`,
  },
  no_discount_boss: {
    why: 'THE BIG HALF: the boss term stops subtracting the per-monster credited count, so a client '
       + 'kill credit scores 5 renown per boss kill again — 19,500 renown/hour behind one held '
       + 'bounty, against a ladder worth 1.6M gold + 925 gems per character',
    find: `    + coalesce((select sum(greatest(0::bigint, pp.value - coalesce(cr.value, 0)))`,
    repl: `    + coalesce((select sum(pp.value)`,
  },
  discount_is_aggregate: {
    why: 'the boss term subtracts the GLOBAL credited total instead of the per-monster one, so a '
       + 'credit against a NON-boss target silently erases honest boss renown (and a player who '
       + 'legitimately killed bosses loses the score for it)',
    find: `                   and cr.key = 'ev:kill_credited:' || substring(pp.key from 17)`,
    repl: "                   and cr.key = 'ev:kill_credited_any'",
  },
  credit_records_nothing: {
    why: 'hr_credit_kills stops recording the credited counters, so hr_renown_of has nothing to '
       + 'subtract and the discount silently becomes a no-op — the faucet is open again with the '
       + 'score-side code still looking correct',
    find: `    '        values (v_uid, v_slot, ''stat'', ''ev:kill_credited_any'', '''', v_applied, ''active'')' || chr(10) ||`,
    repl: `    '        values (v_uid, v_slot, ''stat'', ''ev:kill_credited_any__disabled'', '''', 0, ''active'')' || chr(10) ||`,
  },
  credited_exceeds_bestiary: {
    /* ⚠ THE `do update` LINE IS PART OF THE ANCHOR, and that is the whole
       mutation. The first draft changed only the VALUES list — which is the
       INSERT path, taken exactly once per monster per character. Every credit
       after the first hits ON CONFLICT and used the untouched
       `p.value + v_applied`, so the planted defect fired once on a row nobody
       compared and then vanished. The selftest reported NOT CAUGHT rather than
       giving a false pass, which is the mutation harness doing its job on the
       mutation itself: a defect that only manifests on a path the fixture takes
       once is not a defect the guard can be said to cover. */
    why: 'the per-monster credited counter records the RAW CLAIM instead of the applied delta on '
       + 'EVERY write, so it over-runs the bestiary row it discounts. greatest(0, best - credited) '
       + 'then over-subtracts and the discount starts EATING renown the player earned honestly '
       + 'through the settle — a silent progression regression that every "the faucet did not open" '
       + 'assertion passes straight over',
    find: `    '        values (v_uid, v_slot, ''stat'', ''ev:kill_credited:'' || p_target, '''', v_applied, ''active'')' || chr(10) ||
    '        on conflict (user_id, slot, kind, key, period_key)' || chr(10) ||
    '          do update set value = p.value + v_applied, updated_at = now();' || chr(10) ||
    '      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)' || chr(10) ||`,
    repl: `    '        values (v_uid, v_slot, ''stat'', ''ev:kill_credited:'' || p_target, '''', v_claimed, ''active'')' || chr(10) ||
    '        on conflict (user_id, slot, kind, key, period_key)' || chr(10) ||
    '          do update set value = p.value + v_claimed, updated_at = now();' || chr(10) ||
    '      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)' || chr(10) ||`,
  },
  credited_is_periodic: {
    why: 'the credited rows are filed with a PERIOD key instead of the permanent one, so '
       + 'hr_progress_prune sweeps them at 31 days while ev:kill_any and the bestiary row survive '
       + 'forever. The discount then fails OPEN — the faucet re-opens on a timer, with nothing '
       + 'looking broken at the moment it happens',
    find: `    '        values (v_uid, v_slot, ''stat'', ''ev:kill_credited_any'', '''', v_applied, ''active'')' || chr(10) ||`,
    repl: `    '        values (v_uid, v_slot, ''stat'', ''ev:kill_credited_any'', public.hr_utc_day_key(now()), v_applied, ''active'')' || chr(10) ||`,
  },
  renown_always_zero: {
    why: 'THE DEGENERATE "FIX": renown is broken to always return 0. Every "the faucet is closed" '
       + 'assertion passes trivially, so R1 (the honest control) is the only thing standing between '
       + 'this file and a green build that deleted a progression system',
    find: `  )::bigint
$body$;`,
    repl: `  ) * 0::float8)::bigint
$body$;`,
    also: [['  select floor(\n', '  select floor((\n']],
  },
};

/* ── PROVING THE GUARD ITSELF IS NOT DECORATION ─────────────────────────
   Every mutation above is also caught by the MIGRATION's own §3 gate — it
   refuses to install broken, which is the strongest catch available. But §3 only
   runs at APPLY time, and the regression this guard must catch a year from now
   is a LATER migration restating hr_renown_of from a stale copy. So the two most
   load-bearing defects are repeated with §3's executed block short-circuited,
   leaving ONLY this file's assertions to see them. */
const GATE_BLIND = [
  `  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;`,
  `  begin
    raise exception using errcode = 'HR822', message = 'selftest: §3 executed block skipped';
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;`,
];
MUTATIONS.no_discount_boss_gate_blind = {
  why: MUTATIONS.no_discount_boss.why + ' — with the migration\'s own §3 gate short-circuited, so '
     + 'ONLY this guard (R2/R3) can see it',
  find: MUTATIONS.no_discount_boss.find,
  repl: MUTATIONS.no_discount_boss.repl,
  also: [GATE_BLIND],
};
MUTATIONS.credited_exceeds_bestiary_gate_blind = {
  why: MUTATIONS.credited_exceeds_bestiary.why + ' — with the migration\'s own §3 gate '
     + 'short-circuited, so ONLY this guard (R8\'s signed equality) can see it',
  find: MUTATIONS.credited_exceeds_bestiary.find,
  repl: MUTATIONS.credited_exceeds_bestiary.repl,
  also: [GATE_BLIND],
};
MUTATIONS.renown_always_zero_gate_blind = {
  why: MUTATIONS.renown_always_zero.why + ' — with the migration\'s own §3 gate short-circuited, so '
     + 'ONLY this guard\'s honest control (R1) can see it',
  find: MUTATIONS.renown_always_zero.find,
  repl: MUTATIONS.renown_always_zero.repl,
  also: [...(MUTATIONS.renown_always_zero.also || []), GATE_BLIND],
};

const N = (v) => Number(v ?? 0);

/** One end-to-end run against a freshly replayed database. */
async function run(mutate) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  let patchList;
  if (mutate) {
    const m = MUTATIONS[mutate];
    patchList = new Map([[MIG, [[m.find, m.repl], ...(m.also || [])]]]);
  }
  const { db } = await bootReplay({ patches: patchList, upTo: MIG });

  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const setSub = (uid) => q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const asUser = async (uid, sql, p) => {
    await setSub(uid);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  const asDefiner = async (uid, sql, p) => {
    await setSub(uid);
    return (await db.query(sql, p)).rows[0]?.r;
  };
  const gate = () => q('delete from public.hr_rate_counters');

  // ── FIXTURE: one real player, created the server's own way ────────────
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q('insert into auth.users (id, instance_id, aud, role, email) '
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid, 'r5@probe.invalid']);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await gate();
  await asUser(uid, 'select public.claim_display_name($1) as r', ['R5Probe']);
  await gate();
  const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
  ok(cr?.ok === true, `FIXTURE: hr_create_character refused: ${JSON.stringify(cr)}`);
  // Maxed combat: the tier-6 gate must open and the physical cap must not be the
  // thing under test.
  await q(`insert into public.player_skills (user_id, slot, skill_id, xp)
           select $1, 0, s, 13034431 from unnest(array['attack','strength','defense',
             'hitpoints','prayer','ranged','magic']) s
           on conflict (user_id, slot, skill_id) do update set xp = 13034431`, [uid]);

  /* A REAL bounty-eligible is_boss monster — the boss term only scores ids that
     hr_activities flags, so a non-boss fixture would prove nothing. And a REAL
     non-boss one, for the per-monster-discount check (R6). */
  const boss = (await q(`select m.monster_id from public.hr_bounty_monsters m
                           join public.hr_activities a
                             on a.kind='combat' and a.is_boss and a.activity_id = m.monster_id
                          order by m.monster_id limit 1`))[0]?.monster_id;
  const plain = (await q(`select m.monster_id from public.hr_bounty_monsters m
                           where m.tier = 1
                             and not exists (select 1 from public.hr_activities a
                                              where a.kind='combat' and a.is_boss
                                                and a.activity_id = m.monster_id)
                          order by m.monster_id limit 1`))[0]?.monster_id;
  if (!boss || !plain) {
    const e = new Error('FIXTURE: no bounty-eligible is_boss (or non-boss tier-1) monster exists — '
      + 'the boss term cannot be exercised and a pass would mean nothing');
    e.harness = true; throw e;
  }

  const renown = async () => N((await q('select public.hr_renown_of($1,0)::text as r', [uid]))[0].r);
  const prog = async (key) => N((await q(
    "select coalesce(max(value),0)::text v from player_progress where user_id=$1 and slot=0 "
    + "and kind='stat' and period_key='' and key=$2", [uid, key]))[0].v);
  /* Exactly what a SETTLE emits: goalProgressOps + bestiaryProgressOps write the
     bestiary row AND the lifetime aggregate, through hr_apply, touching NO
     credited counter. */
  const settle = async (id, n) => {
    for (const k of [`ev:kill_monster:${id}`, 'ev:kill_any']) {
      await q(`insert into player_progress (user_id, slot, kind, key, value, period_key, state)
               values ($1,0,'stat',$2,$3,'','active')
               on conflict (user_id,slot,kind,key,period_key)
                 do update set value = player_progress.value + $3`, [uid, k, n]);
    }
  };
  const accept = async (target) => {
    await gate();
    return asDefiner(uid, 'select public.hr_accept_bounty__ungated(0,$1,$2,$3,$4,$5) as r',
      ['r5', target, 'cull', 'normal', 100]);
  };
  const backdate = async () => {
    await q("update active_bounty set accepted_at = now() - interval '60 minutes' where user_id=$1", [uid]);
    await q("update hr_kill_credit_log set created_at = now() - interval '30 minutes' where user_id=$1", [uid]);
  };
  const credit = async (target, claimed, idem) => {
    await gate();
    return asDefiner(uid, 'select public.hr_credit_kills__ungated(0,$1,$2,$3) as r',
      [target, claimed, idem]);
  };

  const obs = { boss, plain };

  // ── R1. THE HONEST CONTROL, FIRST. A settle MUST score in full. ───────
  const r0 = await renown();
  await settle(boss, 100);
  obs.r1_delta = (await renown()) - r0;

  // ── R2. THE FAUCET IS CLOSED. A real credit must move renown by ZERO. ─
  const rBefore = await renown();
  const acc = await accept(boss);
  obs.r2_accept_ok = acc?.ok === true;
  await backdate();
  const bestBefore = await prog(`ev:kill_monster:${boss}`);
  obs.r2_credit = await credit(boss, 400, 'r5-g-1');
  obs.r2_renown_delta = (await renown()) - rBefore;
  obs.r2_bestiary_moved = (await prog(`ev:kill_monster:${boss}`)) - bestBefore;
  obs.r2_credited_row = await prog(`ev:kill_credited:${boss}`);
  obs.r2_credited_any = await prog('ev:kill_credited_any');

  // ── R3. SUSTAINED SPAM STAYS AT ZERO (rate-limited != closed). ────────
  for (let i = 1; i <= 5; i += 1) {
    await backdate();
    await credit(boss, 400, `r5-spam-${i}`);
  }
  obs.r3_renown_delta = (await renown()) - rBefore;

  // ── R4. THE DISCOUNT SUBTRACTS, IT DOES NOT LATCH. A settle after any
  //        amount of credit must still score in full.
  const rAfterSpam = await renown();
  await settle(boss, 10);
  obs.r4_delta = (await renown()) - rAfterSpam;

  // ── R5. THE BOUNTY IS UNTOUCHED — the counter still completes a turn-in.
  await gate();
  obs.r5_claim = await asDefiner(uid, 'select public.hr_claim_bounty__ungated(0) as r');

  // ── R6. THE DISCOUNT IS PER MONSTER. Credits against a NON-boss target
  //        must not erase honest boss renown (an aggregate discount would).
  const rBeforePlain = await renown();
  await accept(plain);
  await backdate();
  obs.r6_credit = await credit(plain, 400, 'r5-plain-1');
  obs.r6_renown_delta = (await renown()) - rBeforePlain;

  /* ── R8 FIXTURE: a THROTTLED credit, which is the only shape that can break
     the ordering invariant. With a generous window v_applied == v_claimed and
     recording the wrong one is indistinguishable — the first draft of this guard
     measured exactly that and `credited_exceeds_bestiary` sailed through. A
     30-second window against a 400-kill claim makes the cap bite (v_applied is a
     few dozen, v_claimed stays 400), so a counter that records the CLAIM instead
     of the APPLIED delta immediately overshoots the bestiary row. */
  await accept(boss);
  await q("update active_bounty set accepted_at = now() - interval '30 seconds' where user_id=$1", [uid]);
  await q("update hr_kill_credit_log set created_at = now() - interval '30 minutes' where user_id=$1", [uid]);
  const rBeforeThrottle = await renown();
  obs.r8_throttled = await credit(boss, 400, 'r5-throttle-1');
  obs.r8_renown_delta = (await renown()) - rBeforeThrottle;

  /* ── R8. THE ORDERING INVARIANT: credited <= bestiary, per monster. ────
     The bestiary row is written ABSOLUTELY (greatest(p.value, baseline+credit))
     and the credited row ADDITIVELY (+= v_applied) — two merge disciplines on
     numbers that must stay ordered. An inversion makes greatest(0, best -
     credited) UNDER-discount, which re-opens the faucet PARTIALLY and silently:
     renown moves LESS than before, so every "faucet closed" check above still
     passes. Only this comparison sees it. */
  obs.r8_inversions = N((await q(
    `select count(*)::text c
       from player_progress c
       left join player_progress b
         on b.user_id=c.user_id and b.slot=c.slot and b.kind='stat' and b.period_key=''
        and b.key = 'ev:kill_monster:' || substring(c.key from 18)
      where c.user_id=$1 and c.slot=0 and c.kind='stat' and c.period_key=''
        and c.key like 'ev:kill_credited:%'
        and c.value > coalesce(b.value, 0)`, [uid]))[0].c);
  obs.r8_rows = N((await q(
    "select count(*)::text c from player_progress where user_id=$1 and slot=0 and kind='stat' "
    + "and period_key='' and key like 'ev:kill_credited:%'", [uid]))[0].c);

  /* ── R9. THE DISCOUNT IS NOT PRUNABLE. hr_renown_of is only honest if the
     credited rows outlive the rows they discount. They carry period_key = ''
     (the permanent population) and hr_progress_prune deletes only
     period_key <> '' — proven by RUNNING the prune at its most aggressive
     rather than by reading its WHERE clause. If a credited row could be swept
     while ev:kill_any survives, the discount fails OPEN and nothing looks
     broken, which is the worst failure mode available here. */
  await q("select public.hr_progress_prune(interval '0 seconds')");
  obs.r9_credited_any = N((await q(
    "select count(*)::text c from player_progress where user_id=$1 and slot=0 and kind='stat' "
    + "and period_key='' and key='ev:kill_credited_any'", [uid]))[0].c);
  obs.r9_credited_per = N((await q(
    "select count(*)::text c from player_progress where user_id=$1 and slot=0 and kind='stat' "
    + "and period_key='' and key like 'ev:kill_credited:%'", [uid]))[0].c);
  obs.r9_kill_any = N((await q(
    "select count(*)::text c from player_progress where user_id=$1 and slot=0 and kind='stat' "
    + "and period_key='' and key='ev:kill_any'", [uid]))[0].c);

  /* ── R7. READ COST. hr_renown_of sits on hr_perks_of's path, which the
     accrual engine calls on EVERY settle, so the discount must not turn a hot
     read into a scan. Seed the FULL monster catalogue as bestiary AND credited
     rows — the worst case a character can reach — and time it. Both added
     lookups supply player_progress' complete PRIMARY KEY, so the cost should
     stay flat; a sequential scan per bestiary row would show up as orders of
     magnitude, which is what the deliberately generous ceiling catches. The
     measurement is REPORTED either way, so a creeping regression is visible even
     on a pass. */
  await q(`insert into player_progress (user_id, slot, kind, key, value, period_key, state)
           select $1, 0, 'stat', 'ev:kill_monster:' || monster_id, 500, '', 'active'
             from public.hr_bounty_monsters
           on conflict (user_id,slot,kind,key,period_key) do update set value = 500`, [uid]);
  await q(`insert into player_progress (user_id, slot, kind, key, value, period_key, state)
           select $1, 0, 'stat', 'ev:kill_credited:' || monster_id, 100, '', 'active'
             from public.hr_bounty_monsters
           on conflict (user_id,slot,kind,key,period_key) do update set value = 100`, [uid]);
  obs.r7_bestiary_rows = N((await q(
    "select count(*)::text c from player_progress where user_id=$1 and slot=0 and kind='stat' "
    + "and period_key='' and key like 'ev:kill_monster:%'", [uid]))[0].c);
  const REPS = 40;
  const t0 = Date.now();
  for (let i = 0; i < REPS; i += 1) await renown();
  obs.r7_ms_per_call = (Date.now() - t0) / REPS;

  await db.close?.();
  return { obs, problems };
}

function grade(o, problems) {
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  // R1 — 100 boss kills x 5 + 100 kills x 0.05 = 505.
  ok(o.r1_delta === 505,
    `R1: THE HONEST CONTROL FAILED — a 100-kill SETTLE moved renown by ${o.r1_delta}, expected `
    + 'exactly 505 (100x5 boss + 100x0.05 kill). The discount must not touch server-simulated '
    + 'kills; if it does, every "faucet closed" check below passes for the wrong reason and this '
    + 'change has deleted a progression system instead of fixing a faucet.');

  // R2 — the credit must have actually applied, or "renown did not move" is vacuous.
  ok(o.r2_accept_ok === true, `R2: FIXTURE — hr_accept_bounty refused: ${JSON.stringify(o.r2_credit)}`);
  ok(N(o.r2_credit?.credited) > 0,
    `R2: FIXTURE DEGENERATE — the credit applied ${o.r2_credit?.credited}, so "renown did not move" `
    + 'would prove nothing');
  ok(o.r2_renown_delta === 0,
    `R2: THE FAUCET IS OPEN — a client kill credit of ${o.r2_credit?.credited} on an is_boss target `
    + `moved renown by ${o.r2_renown_delta} (must be 0). That score gates hr_claim_rank `
    + '(1,603,000 gold + 925 gems across the ladder) and the renownAllXp perk on the live boards.');
  // …and it is closed by DISCOUNTING, not by breaking the counter everything reads.
  ok(o.r2_bestiary_moved > 0,
    `R2: the credit no longer moves the bestiary row (moved ${o.r2_bestiary_moved}) — the bounty `
    + 'turn-in and the bestiary display both read it, so this closed the faucet by breaking them');
  ok(o.r2_credited_row === N(o.r2_credit?.credited),
    `R2: the per-monster credited counter is ${o.r2_credited_row} but the credit applied `
    + `${o.r2_credit?.credited} — the discount is not the same number the credit added`);
  ok(o.r2_credited_any === N(o.r2_credit?.credited),
    `R2: the aggregate credited counter is ${o.r2_credited_any} but the credit applied `
    + `${o.r2_credit?.credited}`);

  // R3 — sustained.
  ok(o.r3_renown_delta === 0,
    `R3: sustained credit spam across five re-opened windows moved renown by ${o.r3_renown_delta} `
    + '(must be 0) — the faucet is rate-limited, not closed');

  // R4 — subtract, do not latch.
  ok(o.r4_delta === 50,
    `R4: a 10-kill SETTLE arriving after the credits moved renown by ${o.r4_delta}, expected 50 — `
    + 'the discount latched instead of subtracting, so honest play stops scoring once a player has '
    + 'ever used a bounty');

  // R5 — the bounty still works.
  ok(o.r5_claim?.ok === true && o.r5_claim?.credited === true,
    `R5: the bounty turn-in broke: ${JSON.stringify(o.r5_claim)}`);

  // R6 — per-monster.
  ok(N(o.r6_credit?.credited) > 0,
    `R6: FIXTURE DEGENERATE — the non-boss credit applied ${o.r6_credit?.credited}`);
  ok(o.r6_renown_delta === 0,
    `R6: a credit against the NON-boss target '${o.plain}' moved renown by ${o.r6_renown_delta} `
    + '(must be 0). Negative means the discount is a GLOBAL subtraction and is erasing honest boss '
    + `renown; positive means the '${o.plain}' credit is still scoring.`);

  // R8 — the ordering invariant the discount rests on.
  ok(o.r8_rows > 0,
    'R8: FIXTURE — no per-monster credited rows exist, so the invariant is untested');
  ok(N(o.r8_throttled?.throttled) === 1 || o.r8_throttled?.throttled === true,
    `R8: FIXTURE — the 30-second-window credit was NOT throttled (${JSON.stringify(o.r8_throttled)}); `
    + 'with applied == claimed the invariant cannot be violated and this check proves nothing');
  ok(N(o.r8_throttled?.credited) > 0,
    `R8: FIXTURE — the throttled credit applied ${o.r8_throttled?.credited}; it must apply SOME `
    + 'kills or there is no credited row to compare');
  /* The SIGNED equality, and it is stronger than the invariant below: the
     discount must equal the credit in BOTH directions. Record too little and the
     faucet stays open (renown rises); record too much — the raw claim instead of
     the applied delta — and the discount EATS renown the player earned by
     settling (renown falls). Every "did not rise" check passes in that second
     case, which is what makes it the sneakier failure. */
  ok(o.r8_renown_delta === 0,
    `R8: a THROTTLED credit moved renown by ${o.r8_renown_delta} (must be 0). Above 0 = the faucet `
    + 'is open for throttled credits; BELOW 0 = the discount over-subtracts and is destroying '
    + 'renown the player earned honestly through the settle.');
  ok(o.r8_inversions === 0,
    `R8: INVARIANT BROKEN — ${o.r8_inversions} credited counter(s) EXCEED their bestiary row. The `
    + 'bestiary is written absolutely (greatest) and the credited row additively, so an inversion '
    + 'makes greatest(0, best - credited) UNDER-discount: the faucet re-opens partially and '
    + 'SILENTLY, because renown still moves less than it used to and every check above still passes.');

  // R9 — the discount must outlive what it discounts.
  ok(o.r9_kill_any === 1,
    'R9: FIXTURE — hr_progress_prune removed ev:kill_any itself, so the comparison proves nothing');
  ok(o.r9_credited_any === 1,
    'R9: hr_progress_prune DELETED ev:kill_credited_any while ev:kill_any survived — the discount '
    + 'is prunable and therefore fails OPEN, silently re-opening the aggregate half of the faucet');
  ok(o.r9_credited_per > 0,
    'R9: hr_progress_prune DELETED the per-monster credited rows — the boss half of the discount '
    + 'is prunable and fails OPEN');

  // R7 — read cost on the accrual engine's hot path.
  ok(o.r7_bestiary_rows >= 100,
    `R7: FIXTURE — only ${o.r7_bestiary_rows} bestiary rows seeded; the worst case was not measured`);
  ok(o.r7_ms_per_call < 60,
    `R7: hr_renown_of costs ${o.r7_ms_per_call.toFixed(1)} ms/call against a full ${o.r7_bestiary_rows}-row `
    + 'bestiary. It is on hr_perks_of\'s path, which the accrual engine calls on EVERY settle. Both '
    + 'lookups this change adds supply the complete player_progress PRIMARY KEY, so a number this '
    + 'high means the plan degraded to a scan per bestiary row.');
}

export async function renownKillFaucetGuard() {
  const { obs, problems } = await run(null);
  grade(obs, problems);
  /* Reported on the way out, pass or fail: hr_renown_of is on the accrual
     engine's per-settle path, so the cost of the discount is a number a reader
     should SEE rather than a threshold that quietly holds. */
  renownKillFaucetGuard.readCost =
    `${obs.r7_ms_per_call.toFixed(1)} ms/call over a ${obs.r7_bestiary_rows}-row bestiary`;
  return problems;
}

/** Every planted defect must be CAUGHT. A mutation that passes is a blind guard. */
async function selftest() {
  let bad = 0;
  for (const id of Object.keys(MUTATIONS)) {
    let caught = [];
    try {
      const { obs, problems } = await run(id);
      grade(obs, problems);
      caught = problems;
    } catch (e) {
      caught = [`migration/harness rejected it: ${String(e.message || e).split('\n')[0]}`];
    }
    if (caught.length) {
      console.log(`  ✓ ${id} — CAUGHT (${caught.length}): ${caught[0]}`);
    } else {
      console.log(`  ✗ ${id} — NOT CAUGHT. ${MUTATIONS[id].why}`);
      bad += 1;
    }
  }
  return bad;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2] || '';
  (async () => {
    if (arg === '--list') {
      for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${m.why}\n`);
      return;
    }
    if (arg === '--selftest') {
      const bad = await selftest();
      if (bad) { console.error(`${bad} mutation(s) NOT CAUGHT`); process.exit(1); }
      console.log('all mutations caught');
      return;
    }
    if (arg.startsWith('--mutate=')) {
      const id = arg.slice(9);
      if (!MUTATIONS[id]) { console.error(`unknown mutation: ${id}`); process.exit(2); }
      const { obs, problems } = await run(id);
      grade(obs, problems);
      console.log(problems.length ? problems.map((p) => `  ✗ ${p}`).join('\n') : '  (not caught)');
      return;
    }
    const problems = await renownKillFaucetGuard();
    if (problems.length) {
      console.error('renown-kill-faucet guard — FAILED:');
      for (const p of problems) console.error(`  ✗ ${p}`);
      process.exit(1);
    }
    console.log('renown-kill-faucet guard — a client kill credit scores ZERO renown (sustained spam '
      + 'and throttled credits included) while a server settle still scores in full, the discount '
      + 'is per-monster and unprunable, the bestiary row still moves and the bounty turn-in still '
      + `pays. hr_renown_of read cost: ${renownKillFaucetGuard.readCost}.`);
  })().catch((e) => {
    console.error(String(e.message || e));
    process.exit(e && e.harness ? 2 : 1);
  });
}
