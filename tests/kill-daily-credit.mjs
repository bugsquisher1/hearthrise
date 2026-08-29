#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/kill-daily-credit.mjs — THE KILL → DAILY-GOAL CREDIT PATH,
//                               GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/kill-daily-credit.mjs             # the guard
//   node tests/kill-daily-credit.mjs --list      # the mutation catalogue
//   node tests/kill-daily-credit.mjs --selftest  # every mutation must be CAUGHT
//   node tests/kill-daily-credit.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-09-01-kill-daily-credit.sql
//
// ── THE DEFECT THIS EXISTS FOR (live report #41 residual) ───────────────
// Daily AND weekly kill goals are graded on
//     player_progress(kind='daily', key='ev:kill_any', period_key=<utc day key>)
// The only writer of that row was the away/span-sim, which realizes 60–99%
// fewer kills than an attended player. hr_credit_kills — the verb that exists to
// top the server's kill count up to the attended number — wrote 'ev:kill_any'
// only as kind='stat', period_key='' (the LIFETIME row). Once the hr_rpc_gate
// hotfix restored hr_goal_state, the modal began grading on SERVER counts, so an
// attended kill-30 daily sat at "30/30 · Confirming…" with no Claim.
//
// ── WHAT THIS FILE DRIVES ───────────────────────────────────────────────
// The REAL migration chain from tests/schema-apply-order.json, applied verbatim
// into PGlite (real PostgreSQL, in process), then a real player through the REAL
// rate-gated hr_credit_kills as `authenticated` with a JWT subject set — and
// then through the REAL hr_claim_goal, so the assertion is "the player can now
// claim", not "a row exists".
//
// It also proves the CONTAINMENT that makes the bounty-free branch reviewable:
// a credit with no active bounty moves the DAILY row and NOTHING else — not the
// lifetime 'ev:kill_any' (which hr_claim_quest pays on and hr_renown_of scores at
// 0.05/kill), not 'kills', not the bestiary 'ev:kill_monster:<id>' (5 renown per
// boss kill), not gold, not gems.
//
// ── WHY K10 EXISTS, AND THE MISTAKE THAT PUT IT HERE (Security C1/C2) ────
// The first draft of this change claimed the daily row had TWO paying readers.
// It has THREE. hr_claim_daily__ungated grades kind='daily' 'ev:kill_any' too —
// daily_kill pays 500 g at 25 kills and daily_kill_big pays 900 g at 60, offered
// on ~54% / ~50% of days by the day-seeded hr_daily_task_set.
//
// The reason it was missed is the reusable part: the search was for functions
// containing the LITERAL string 'ev:kill_any', and NOT ONE of the three readers
// contains it. They all build the key by concatenation —
//     hr_claim_daily   key = 'ev:' || v_type
//     hr_goal_state    key = r.counter_key          (from hr_goal_rewards)
//     hr_claim_goal    key = v_cat.counter_key      (from hr_goal_rewards)
// A literal scan finds zero of them and reads as a clean bill of health. So K10
// pins the reader set by scanning for kind='daily' ITSELF, which is the only
// predicate every reader must contain, and fails on any function outside the
// named allowlist. A new reader of this row now fails the build BY NAME.
//
// THE CORRECTED FORGERY BOUND, which K10 keeps true. Every claim consumes a
// once-per-period guard row, and every AMOUNT is read from a catalogue no client
// role may write — so a fabricated kill counter is a GATE, never a MULTIPLIER:
// ten thousand forged kills pay exactly what thirty honest ones pay. Per
// CHARACTER, the reachable payout is
//     per UTC day    2,200 gold + 1 gem + 400 hitpoints XP
//     per ISO week   2,500 gold + 3 gems + 1,000 hitpoints XP
//     (+ 5 bones/day transitively: hr_claim_goal journals its gold payout, which
//      clears gold_500's 500-gold ledger target four times over)
// The currency lines multiply by the account's 6 slots. THE XP LINE DOES NOT
// REACH A RANKING OFF SLOT 0 — leaderboard_ranked reads player_skills where
// slot = 0 (2026-08-18-leaderboard-server-source.sql).
//
// ── b493: THE XP TERM IS NEW, AND IT IS NO LONGER ZERO ──────────────────────
// It used to be, and K10(3) used to assert exactly that. The reason was a
// DEFECT, not a control: every kill goal was priced in the phantom skill
// 'combat', which is not an hr_skills row, so hr_claim_goal routed the grant to
// `skipped_xp` and no player_skills row moved — players had never received the
// XP component of any kill goal while the modal quoted it as part of the price.
// b492 fixed that (2026-09-01-kill-goal-xp-hitpoints.sql) and the Designer
// re-priced the grant into HITPOINTS: 100 / 300 / 1,000. hitpoints IS ranked
// (combat level + the skill:hitpoints board), so the trigger condition the old
// bound named has fired, and the verdict was RE-TAKEN rather than assumed:
//
//   · ACCEPTED. The neighbouring, already-accepted lane hr_credit_combat_xp
//     (2026-08-31) lets a client submit up to 5,000,000 combat XP per
//     character-day into the SAME seven skills, hitpoints included. 400/day is
//     0.008% of that accepted surface and 0.006% of the measured honest ~7.1M
//     XP/character-day the accrual engine pays. A forgery worth ~3 minutes of
//     honest play cannot move a ranking that six figures of legitimate XP
//     already dominates.
//   · THE AMOUNT IS SERVER-AUTHORED. hr_goal_rewards has RLS on, no policy and
//     every client grant revoked; the forgeable number `v_have` appears only in
//     the journal and the receipt, never in an arithmetic that scales a payout.
//   · hitpoints was the SAFE destination, not merely a legal one — it is in the
//     ACCRUED set of src/data/skill-authority.js, so the absolute envelope
//     re-asserts the SERVER's value over the client's, including DOWNWARD.
//   · JOURNALLED BY NAME AND REVERSIBLE: one player_ledger row per claim,
//     intent 'goal_claim:<period>:<goal_id>', meta.xp carrying the exact grant.
//
// RESIDUAL, ACCEPTED AND STATED: this XP is deliberately kept OUT of the shared
// 40M/day inflow budget (gold_in/xp_in are 0 — the muster/raid-chest and b414
// rule for a fixed, once-per-period, server-catalogued reward), so the CATALOGUE
// and the ONCE-GUARD are the only bound on it. That is precisely why K10(3) now
// pins all three terms of that catalogue — SKILL, AMOUNT and CARDINALITY — and
// why a re-tune must re-open this review by name instead of widening the bound
// quietly. tests/modal-goal-claim.mjs BIND-PAY catches a ONE-SIDED drift between
// the client's authored reward and the server's; it cannot catch a COORDINATED
// retune of both, because agreeing is all it asks for. K10(3) is what catches
// that, so do not delete it as duplicate coverage.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend, so the advisory lock and the
//     `for update` are exercised serially; the idempotency PK is what makes the
//     race safe and it is exercised as a replay.
//   · The pooler, PostgREST and the JWT itself.
//   · Production's ACL — §5(a)/(b) of the migration asserts it at apply time,
//     and K8 below asserts it on the replayed database.
//   · The CLIENT cadence (that legacy.js actually flushes bounty-free kills) —
//     that is the in-page smoke suite's job.
// ════════════════════════════════════════════════════════════════════════
import { fileURLToPath } from 'node:url';
import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-09-01-kill-daily-credit.sql';
/* The AUTHORING migration for hr_goal_rewards + hr_claim_goal. The b493 XP
   mutations are planted HERE, not in MIG, because the catalogue and the
   once-guard live there — and because 2026-09-01-kill-goal-xp-hitpoints.sql
   (the production forward-fix, which would fail closed on a drifted row and mask
   the mutation) sorts AFTER MIG in tests/schema-apply-order.json and is
   therefore never applied under this guard's `upTo`. */
const GOAL_MIG = '2026-08-23-modal-goal-claims.sql';

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────
   Each is a defect somebody could plausibly write, and each must turn this
   guard RED. A guard that cannot demonstrate it sees failure is broken, not
   passing. */
const MUTATIONS = {
  daily_never_stamped: {
    why: 'THE BUG ITSELF: the daily upsert is removed, so the credit still moves the LIFETIME '
       + 'row and the kill-30 daily stays at "30/30 · Confirming…" with no Claim',
    find: `      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
        values (v_uid, v_slot, 'daily', 'ev:kill_any', v_day, v_applied, 'active')
        on conflict (user_id, slot, kind, key, period_key)
          do update set value = p.value + v_applied, updated_at = now();`,
    repl: '      -- daily never stamped',
  },
  free_writes_lifetime: {
    why: 'THE CONTAINMENT DEFECT: the LIFETIME ev:kill_any and kills counters escape the '
       + 'active-bounty gate, so a BOUNTY-FREE credit writes them — and hr_claim_quest pays on the '
       + 'first while hr_renown_of scores it at 0.05 renown per kill, turning an ungated 60/min '
       + 'verb into a RANKED-score faucet',
    find: `      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
        values (v_uid, v_slot, 'stat', 'ev:kill_any', '', v_applied, 'active')
        on conflict (user_id, slot, kind, key, period_key)
          do update set value = p.value + v_applied, updated_at = now();
      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
        values (v_uid, v_slot, 'stat', 'kills', '', v_applied, 'active')
        on conflict (user_id, slot, kind, key, period_key)
          do update set value = p.value + v_applied, updated_at = now();
    end if;`,
    repl: `    end if;
    insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_any', '', v_applied, 'active')
      on conflict (user_id, slot, kind, key, period_key)
        do update set value = p.value + v_applied, updated_at = now();
    insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, v_slot, 'stat', 'kills', '', v_applied, 'active')
      on conflict (user_id, slot, kind, key, period_key)
        do update set value = p.value + v_applied, updated_at = now();`,
  },
  no_day_ceiling: {
    why: 'the per-UTC-day bounty-free ceiling is deleted, so the only remaining bound on a '
       + 'bounty-free credit is a physics cap four orders of magnitude looser than the goal it '
       + 'feeds',
    find: `    v_credit := least(v_credit, greatest(0, c_kill_day_budget - v_used_today));`,
    repl: '    v_credit := v_credit;',
  },
  anchor_ignores_settle: {
    why: 'CONDITION 2 is deleted: the bounty-free window stops being floored at '
       + 'player_state.accrued_to, so a credit racing behind a settle re-stamps the same daily row '
       + 'the span-sim just stamped — the double-count this design exists to make structural',
    find: `    v_anchor := greatest(coalesce(v_anchor, v_accrued), v_accrued);`,
    repl: '    v_anchor := coalesce(v_anchor, v_accrued);',
  },
  anchor_never_advances: {
    why: 'the anchor stops reading the last bounty-free credit, so every call in the same second '
       + 'prices the FULL window again and the rate gate\'s 60 calls/min each mint a whole window',
    find: `    select max(created_at) into v_anchor from public.hr_kill_credit_log
      where user_id = v_uid and slot = v_slot and free;`,
    repl: '    v_anchor := null;',
  },
  free_still_refused: {
    why: 'the bounty-free branch is reverted to the old refusal, so a player killing 30 mobs with '
       + 'no bounty gets no daily credit and the goal is dead again',
    find: `  v_free := (v_ab.user_id is null);`,
    repl: `  v_free := (v_ab.user_id is null);
  if v_free then
    return jsonb_build_object('ok', false, 'error', 'no_active_bounty', 'target', p_target, 'slot', v_slot);
  end if;`,
  },
  replay_restamps: {
    why: 'THE MONEY-ADJACENT DEFECT: the idempotency read stops short-circuiting, so a retry of '
       + 'the same key stamps the daily counter a second time — a goal-completion printer behind '
       + 'a network retry',
    find: `  if found then
    return jsonb_build_object('ok', true, 'replay', true, 'target', v_prior.target,`,
    repl: `  if false then
    return jsonb_build_object('ok', true, 'replay', true, 'target', v_prior.target,`,
    /* The idempotency INSERT would raise on the duplicate PK before the guard
       could observe the second stamp, so the replay has to be made survivable.
       ⚠ ANCHORED ON THE `values (…)` LINES ONLY, not on the column list: the
       column list grows every time this verb learns a new fact (it gained `free`
       and then `kills_stat` in this very file), and an anchor that includes it
       silently stops matching — which the harness reports as "matched 0 times",
       i.e. a mutation that was never planted. A mutation that cannot be planted is
       decoration, and this one spent a build in that state before the selftest's
       own anchor check caught it. */
    also: [[
      `    values (v_uid, v_slot, p_idem, p_target, v_claimed, v_credit, v_cap, v_applied, v_free,
            case when v_free then v_kills_mark else null end);`,
      `    values (v_uid, v_slot, p_idem, p_target, v_claimed, v_credit, v_cap, v_applied, v_free,
            case when v_free then v_kills_mark else null end)
    on conflict do nothing;`,
    ]],
  },
  settle_delta_forgiven: {
    why: 'S1 (Security, reproduced): the watermark advances to the CURRENT lifetime value instead '
       + 'of by what the subtraction CONSUMED, so a zero-claim call clears a settle debt it never '
       + 'subtracted. credit(C) -> settle -> credit(0) becomes a "forgive the debt" button and the '
       + 'daily row grows linearly past observed truth — a paying goal completing early',
    find: `    v_kills_mark := coalesce(v_kills_prev, v_kills_now) + v_consumed;`,
    repl: '    v_kills_mark := v_kills_now;',
  },
  settle_delta_stale_mark: {
    why: 'the watermark is read as the NEWEST row\'s value rather than the maximum, so an idem '
       + 'tiebreak on equal timestamps can return a stale mark and the credit OVER-subtracts — '
       + 'the trap GATE(f6) caught on the first draft of the S1 fix (160 credited read as 124)',
    find: `    select max(kills_stat) into v_kills_prev from public.hr_kill_credit_log
      where user_id = v_uid and slot = v_slot and free and kills_stat is not null
        and created_at >= public.hr_utc_day_start(now());`,
    repl: `    select kills_stat into v_kills_prev from public.hr_kill_credit_log
      where user_id = v_uid and slot = v_slot and free and kills_stat is not null
        and created_at >= public.hr_utc_day_start(now())
      order by created_at desc, idem desc limit 1;`,
  },
  no_settle_delta: {
    why: 'the settle-delta subtraction is deleted, so the bounty-free credit becomes purely '
       + 'additive on a row the NEXT settle also writes: one set of kills is counted twice '
       + '(observed + sim) and a PAYING daily goal completes early. The accrued_to floor does not '
       + 'cover this order — it only stops a credit paying for an already-settled window',
    find: `    v_applied := greatest(0, v_credit - v_settle_delta);`,
    repl: '    v_applied := v_credit;',
  },
};

/* ── PROVING THE GUARD ITSELF IS NOT DECORATION ─────────────────────────
   Every mutation above is caught by the MIGRATION's own §5 gate — it refuses to
   install broken, which is the strongest catch available and is why they all
   report "migration/harness rejected it". But §5 only runs at APPLY time. This
   guard has to keep standing on its own, because the regression it must catch a
   year from now is a LATER migration replacing hr_credit_kills from a stale
   template — exactly the class that produced the b484–b487 gate-bucket wave.
   So each of the two most load-bearing defects is repeated with §5's executed
   block short-circuited, leaving ONLY this file's assertions to see it. */
const GATE_BLIND = [
  `  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;`,
  `  begin
    raise exception using errcode = 'HR821', message = 'selftest: §5 executed block skipped';
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;`,
];
MUTATIONS.daily_never_stamped_gate_blind = {
  why: MUTATIONS.daily_never_stamped.why + ' — with the migration\'s own §5 gate short-circuited, '
     + 'so ONLY this guard can see it',
  find: MUTATIONS.daily_never_stamped.find,
  repl: MUTATIONS.daily_never_stamped.repl,
  also: [GATE_BLIND],
};
MUTATIONS.settle_delta_forgiven_gate_blind = {
  why: MUTATIONS.settle_delta_forgiven.why + ' — with the migration\'s own §5 gate short-circuited, '
     + 'so ONLY this guard (K12) can see it',
  find: MUTATIONS.settle_delta_forgiven.find,
  repl: MUTATIONS.settle_delta_forgiven.repl,
  also: [GATE_BLIND],
};
MUTATIONS.no_settle_delta_gate_blind = {
  why: MUTATIONS.no_settle_delta.why + ' — with the migration\'s own §5 gate short-circuited, '
     + 'so ONLY this guard (K11) can see it',
  find: MUTATIONS.no_settle_delta.find,
  repl: MUTATIONS.no_settle_delta.repl,
  also: [GATE_BLIND],
};
/* ── b493 · THE XP-PATH MUTATIONS ───────────────────────────────────────────
   The forged-counter bound is now arithmetic over the hr_goal_rewards catalogue
   and the once-per-period claim guard, so each of those three terms gets a
   planted defect. None of them is caught by any migration gate: §GATE(b) of the
   authoring file only rejects an XP key that is NOT an hr_skills row, and a
   re-price or a re-point to another REAL skill sails straight through it. These
   prove K10(3) is the thing standing there. */
MUTATIONS.goal_xp_repriced = {
  file: GOAL_MIG,
  why: 'THE AMOUNT TERM: the kill_more grant is re-priced 300 -> 300,000 hitpoints XP. Nothing in '
     + 'the migration rejects it (the key is still a real skill), and modal-goal-claim BIND-PAY '
     + 'would not either if the client data moved with it — so a forged kill counter would reach '
     + '1,000x the RANKED XP the security verdict was taken against',
  find: "  ('kill_more',   false, 'daily',       'ev:kill_any',  30,   600, 1, '{\"hitpoints\":300}',  '{}'),",
  repl: "  ('kill_more',   false, 'daily',       'ev:kill_any',  30,   600, 1, '{\"hitpoints\":300000}',  '{}'),",
};
MUTATIONS.goal_xp_repointed = {
  file: GOAL_MIG,
  why: 'THE SKILL TERM: the kill_more grant is re-pointed hitpoints -> prayer. prayer is a real '
     + 'hr_skills row so every existing gate passes it, but it is a DIFFERENT ranked column and a '
     + 'different reconcile posture — the destination is part of the reviewed bound, not an '
     + 'implementation detail',
  find: "  ('kill_more',   false, 'daily',       'ev:kill_any',  30,   600, 1, '{\"hitpoints\":300}',  '{}'),",
  repl: "  ('kill_more',   false, 'daily',       'ev:kill_any',  30,   600, 1, '{\"prayer\":300}',  '{}'),",
};
MUTATIONS.goal_claim_reclaimable = {
  file: GOAL_MIG,
  why: 'THE CARDINALITY TERM: the once-guard upserts instead of DO NOTHING, so row_count is always '
     + '1 and the claim never reports already_claimed. Every per-period ceiling in the bound — gold, '
     + 'gems AND the new hitpoints XP — becomes "per rate-gate call" instead',
  find: `  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'quest', 'goal:' || v_cat.goal_id, 1, v_period, 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;`,
  repl: `  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'quest', 'goal:' || v_cat.goal_id, 1, v_period, 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do update set updated_at = now();`,
};

/* The cardinality mutation above is caught by the authoring migration's own
   GATE(e) at APPLY time — the strongest catch there is. But §GATE only runs on
   apply, and the regression this must still see in a year is a LATER migration
   restating hr_claim_goal from a stale template, so the same defect is repeated
   with that gate short-circuited and ONLY K10(3) left to see it. Same reasoning,
   same shape, as the three _gate_blind mutations above. */
MUTATIONS.goal_claim_reclaimable_gate_blind = {
  file: GOAL_MIG,
  why: MUTATIONS.goal_claim_reclaimable.why + " — with the authoring migration's own GATE(e) "
     + 'short-circuited, so ONLY K10(3) can see it',
  find: MUTATIONS.goal_claim_reclaimable.find,
  repl: MUTATIONS.goal_claim_reclaimable.repl,
  also: [[
    `  -- (e) EXECUTED behaviour, discarded subtransaction → zero residue.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);`,
    `  -- (e) EXECUTED behaviour, discarded subtransaction → zero residue.
  begin
    raise exception using errcode = 'HR819', message = 'selftest: GATE(e) executed block skipped';
    perform set_config('request.jwt.claim.sub', v_uid::text, true);`,
  ]],
};

MUTATIONS.free_writes_lifetime_gate_blind = {
  why: MUTATIONS.free_writes_lifetime.why + ' — with the migration\'s own §5 gate short-circuited, '
     + 'so ONLY this guard can see it',
  find: MUTATIONS.free_writes_lifetime.find,
  repl: MUTATIONS.free_writes_lifetime.repl,
  also: [GATE_BLIND],
};

const UUID = () => crypto.randomUUID();
const N = (v) => Number(v ?? 0);

/** One end-to-end run against a freshly replayed database. */
async function run(mutate) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  let patchList;
  if (mutate) {
    const m = MUTATIONS[mutate];
    /* `file` defaults to MIG so every pre-b493 mutation is unchanged; the b493
       XP mutations name GOAL_MIG. One mutation plants in ONE file — a defect
       that needs two files is two defects. */
    patchList = new Map([[m.file || MIG, [[m.find, m.repl], ...(m.also || [])]]]);
  }
  const { db } = await bootReplay({ patches: patchList, upTo: MIG });

  const q = async (sql, p) => (await db.query(sql, p)).rows;
  /* SESSION-SCOPED (`is_local = false`) like modal-goal-claim.mjs: PGlite runs
     each query in its own implicit transaction, so a transaction-local GUC is
     gone by the next statement and auth.uid() would read NULL. */
  const setSub = (uid) => q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const asUser = async (uid, sql, p) => {
    await setSub(uid);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  /* The __ungated verbs and the fixture writes run as the OWNER, with the JWT
     subject still set so auth.uid() resolves. */
  const asDefiner = async (uid, sql, p) => {
    await setSub(uid);
    return (await db.query(sql, p)).rows[0]?.r;
  };
  const gate = () => q('delete from public.hr_rate_counters');

  // ── FIXTURE: one real player, created the server's own way ────────────
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q('insert into auth.users (id, instance_id, aud, role, email) '
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid, 'kdc@probe.invalid']);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await gate();
  await asUser(uid, 'select public.claim_display_name($1) as r', ['KdcProbe']);
  await gate();
  const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
  ok(cr?.ok === true, `FIXTURE: hr_create_character refused: ${JSON.stringify(cr)}`);

  // Maxed combat skills → the most generous damage level, so the physical cap is
  // never the thing under test except where it is named.
  await q(`insert into public.player_skills (user_id, slot, skill_id, xp)
           select $1, 0, s, 13034431 from unnest(array['attack','strength','defense',
             'hitpoints','prayer','ranged','magic']) s
           on conflict (user_id, slot, skill_id) do update set xp = 13034431`, [uid]);

  const day = (await q('select public.hr_utc_day_key(now()) as r'))[0].r;
  const weekDays = (await q('select public.hr_goal_week_days(now()) as r'))[0].r;
  const mon = await q("select monster_id, hp from public.hr_bounty_monsters where tier = 1 "
    + 'order by monster_id limit 2');
  ok(mon.length >= 2, 'FIXTURE: fewer than two tier-1 bounty monsters in the catalogue');
  const T1 = mon[0]?.monster_id;
  const T2 = mon[1]?.monster_id ?? T1;

  const progress = async (kind, key, period) => N((await q(
    'select value::text v from player_progress where user_id=$1 and slot=0 '
    + 'and kind=$2 and key=$3 and period_key=$4', [uid, kind, key, period]))[0]?.v);
  const dailyKills = () => progress('daily', 'ev:kill_any', day);
  const lifeKills = () => progress('stat', 'ev:kill_any', '');
  const killsStat = () => progress('stat', 'kills', '');
  const bestiary = (t) => progress('stat', `ev:kill_monster:${t}`, '');
  /* PER-SKILL, not a sum. b493: the reviewed property is no longer "no XP moves"
     but "exactly the catalogued XP moves, on exactly the catalogued skill" — and
     a sum cannot tell +300 hitpoints from +300 prayer, nor +400/-100 from 0. */
  const skillMap = async () => Object.fromEntries((await q(
    'select skill_id, xp::text xp from player_skills where user_id=$1 and slot=0', [uid]))
    .map((r) => [r.skill_id, N(r.xp)]));
  const skillDelta = (before, after) => {
    const out = {};
    for (const k of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
      const d = N(after[k]) - N(before[k]);
      if (d !== 0) out[k] = d;
    }
    return out;
  };
  const goldOf = async () => N((await q(
    'select gold::text g from player_state where user_id=$1 and slot=0', [uid]))[0].g);
  const gemsOf = async () => N((await q(
    'select gems::text g from player_state where user_id=$1 and slot=0', [uid]))[0].g);
  const setAccrued = (expr) => q(
    `update player_state set accrued_to = ${expr} where user_id=$1 and slot=0`, [uid]);

  /* The REAL client path: the rate-gated wrapper, as `authenticated`. */
  const credit = async (target, claimed, idem) => {
    await gate();
    return asUser(uid, 'select public.hr_credit_kills(0,$1,$2,$3) as r',
      [target, claimed, idem]);
  };
  const claimGoal = async (goal, weekly) => {
    await gate();
    return asUser(uid, 'select public.hr_claim_goal($1,$2,0,null) as r', [goal, weekly]);
  };

  const obs = { day, T1, T2 };

  // ── K1. A BOUNTY CREDIT ADVANCES THE DAILY ROW BY THE APPLIED DELTA ────
  await setAccrued("now() - interval '30 minutes'");
  await q(`insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
           values ($1, 0, 'stat', $2, 500, '', 'active')
           on conflict (user_id,slot,kind,key,period_key) do update set value = 500`,
  [uid, `ev:kill_monster:${T1}`]);
  await gate();
  obs.accept = await asDefiner(uid,
    "select public.hr_accept_bounty__ungated(0,'kdc',$1,'cull','normal',100) as r", [T1]);
  await q("update active_bounty set accepted_at = now() - interval '10 minutes' "
    + 'where user_id=$1 and slot=0', [uid]);

  const d0 = await dailyKills(); const l0 = await lifeKills();
  obs.k1 = await credit(T1, 100, 'idem-b1');
  obs.k1_daily = (await dailyKills()) - d0;
  obs.k1_life = (await lifeKills()) - l0;

  // ── K2. A REPLAY DOES NOT DOUBLE-STAMP ────────────────────────────────
  const d1 = await dailyKills(); const l1 = await lifeKills();
  obs.k2 = await credit(T1, 100, 'idem-b1');
  obs.k2_daily = (await dailyKills()) - d1;
  obs.k2_life = (await lifeKills()) - l1;

  // ── K3. A BOUNTY-FREE CREDIT WORKS, AND MOVES ONLY THE DAILY ROW ──────
  // T2 has no active bounty. Reopen the window so the anchor is not the K1 row.
  await setAccrued("now() - interval '30 minutes'");
  await q("update hr_kill_credit_log set created_at = now() - interval '20 minutes' "
    + 'where user_id=$1', [uid]);
  const d2 = await dailyKills(); const l2 = await lifeKills();
  const k2s = await killsStat(); const b2 = await bestiary(T2);
  const g2 = await goldOf(); const m2 = await gemsOf();
  obs.k3 = await credit(T2, 25, 'idem-f1');
  obs.k3_daily = (await dailyKills()) - d2;
  obs.k3_life = (await lifeKills()) - l2;
  obs.k3_kills = (await killsStat()) - k2s;
  obs.k3_bestiary = (await bestiary(T2)) - b2;
  obs.k3_gold = (await goldOf()) - g2;
  obs.k3_gems = (await gemsOf()) - m2;

  // ── K4. THE ANCHOR CLOSES THE WINDOW ──────────────────────────────────
  obs.k4 = await credit(T2, 25, 'idem-f2');

  // ── K5. CONDITION 2 — SETTLE-FIRST CREDITS NOTHING ────────────────────
  /* The log anchor is backdated FIRST, on purpose. Without it the anchor alone is
     already ~now (K4 just wrote a row), so this check would pass whether or not
     the accrued_to floor exists — `--mutate=anchor_ignores_settle` proved exactly
     that. With a 20-minute-old anchor, ONLY the floor can produce a zero window. */
  await q("update hr_kill_credit_log set created_at = now() - interval '20 minutes' "
    + 'where user_id=$1', [uid]);
  await setAccrued('now()');
  const d5 = await dailyKills();
  obs.k5 = await credit(T2, 500, 'idem-f3');
  obs.k5_daily = (await dailyKills()) - d5;
  obs.k5_journal = N((await q(
    "select count(*)::text c from player_ledger where user_id=$1 "
    + "and intent like 'kill_credit_throttled:%'", [uid]))[0].c);

  // ── K6. THE PER-UTC-DAY CEILING BINDS (with a proven non-zero cap) ────
  await q(`update hr_kill_credit_log
             set created_at = greatest(public.hr_utc_day_start(now()), now() - interval '5 minutes')
           where user_id=$1`, [uid]);
  await q(`insert into hr_kill_credit_log
             (user_id, slot, idem, target, claimed, credit, cap, applied, free, created_at)
           values ($1, 0, 'idem-fill', $2, 10000, 10000, 10000, 10000, true,
                   greatest(public.hr_utc_day_start(now()), now() - interval '5 minutes'))`,
  [uid, T2]);
  await setAccrued("now() - interval '30 minutes'");
  const d6 = await dailyKills();
  obs.k6 = await credit(T2, 400, 'idem-f4');
  obs.k6_daily = (await dailyKills()) - d6;

  /* ── K11. ⚠ CREDIT + SETTLE IN THE SAME WINDOW DO NOT DOUBLE-ADVANCE ────
     K5 covers settle-THEN-credit (the accrued_to floor). This is the other order,
     and it is the common one live: the player kills, a credit lands, and then the
     ~90 s span-sim settles the SAME window and stamps its own undercounted kills
     onto the SAME daily row. hr_apply has no kill watermark to clamp against
     (unlike combat XP, which bought one plus an edge change), so without the
     settle-delta subtraction the counter reads observed + sim for ONE set of
     kills — a paying counter over-reading by up to ~1.4x on the repo's own
     measured 60-99% undercount. goalProgressOps writes daily 'ev:kill_any' and
     lifetime stat 'ev:kill_any' from ONE counter in ONE delta, which is why the
     lifetime row's growth is an exact reading of what the settle put on the daily
     row. The fixture reproduces that pairing exactly. */
  await q('delete from hr_kill_credit_log where user_id=$1', [uid]);
  await q("delete from player_progress where user_id=$1 and kind='daily' and key='ev:kill_any'", [uid]);
  await q("delete from player_progress where user_id=$1 and kind='stat' and key='ev:kill_any'", [uid]);
  await setAccrued("now() - interval '10 minutes'");
  obs.k11a = await credit(T2, 40, 'idem-k11a');
  obs.k11a_daily = await dailyKills();
  // THE SETTLE lands on the same window: +12 on BOTH rows, from one counter.
  for (const [kind, per] of [['daily', day], ['stat', '']]) {
    await q(`insert into player_progress (user_id, slot, kind, key, value, period_key, state)
             values ($1, 0, $2, 'ev:kill_any', 12, $3, 'active')
             on conflict (user_id, slot, kind, key, period_key)
               do update set value = player_progress.value + 12`, [uid, kind, per]);
  }
  await q("update hr_kill_credit_log set created_at = now() - interval '5 minutes' "
    + 'where user_id=$1', [uid]);
  // The player kept fighting: 15 more observed, of which the settle covered 12.
  obs.k11b = await credit(T2, 15, 'idem-k11b');
  obs.k11_daily = await dailyKills();

  /* ── K12. ⚠ S1 — A ZERO-CLAIM CALL MUST NOT FORGIVE THE SUBTRACTION ─────
     Security's repro (scratchpad/exploit-settle-forgive.mjs), kept as a durable
     guard. The first draft of the settle-delta fix advanced the watermark to the
     CURRENT lifetime value unconditionally. When `credit - settle_delta` floors at
     0 the surplus is never subtracted from anything, so marking it spent
     permanently FORGAVE it: credit(C) → settle → credit(0) made a zero-claim call
     a "clear the debt" button, and the daily row grew linearly past observed truth
     (measured 156 against 120 over three rounds; 196 against 160 in this fixture).
     The watermark must advance by least(delta, credit) — what the flooring
     actually consumed — so a call that credits nothing clears nothing.
     A closing credit absorbs the trailing settle, which lets the row be compared
     to the sum of the credits EXACTLY rather than "within one settle". */
  await q('delete from hr_kill_credit_log where user_id=$1', [uid]);
  await q("delete from player_progress where user_id=$1 and kind='daily' and key='ev:kill_any'", [uid]);
  await q("delete from player_progress where user_id=$1 and kind='stat' and key='ev:kill_any'", [uid]);
  let k12sum = 0;
  for (let r = 1; r <= 3; r += 1) {
    await setAccrued("now() - interval '10 minutes'");
    await q("update hr_kill_credit_log set created_at = now() - interval '5 minutes' where user_id=$1", [uid]);
    await credit(T2, 40, `idem-k12c${r}`); k12sum += 40;
    for (const [kind, per] of [['daily', day], ['stat', '']]) {
      await q(`insert into player_progress (user_id, slot, kind, key, value, period_key, state)
               values ($1, 0, $2, 'ev:kill_any', 12, $3, 'active')
               on conflict (user_id, slot, kind, key, period_key)
                 do update set value = player_progress.value + 12`, [uid, kind, per]);
    }
    await setAccrued("now() - interval '10 minutes'");
    await q("update hr_kill_credit_log set created_at = now() - interval '5 minutes' where user_id=$1", [uid]);
    // THE ATTACK: a zero-claim call whose only purpose is to advance the watermark.
    const z = await credit(T2, 0, `idem-k12z${r}`);
    if (r === 1) obs.k12_zero = z;
  }
  await setAccrued("now() - interval '10 minutes'");
  await q("update hr_kill_credit_log set created_at = now() - interval '5 minutes' where user_id=$1", [uid]);
  await credit(T2, 40, 'idem-k12end'); k12sum += 40;
  obs.k12_sum = k12sum;
  obs.k12_daily = await dailyKills();
  obs.k12_absorbed = N((await q(
    "select count(*)::text c from player_ledger where user_id=$1 "
    + "and intent = 'daily_kill_settle_absorbed'", [uid]))[0].c);

  // ── K7. THE PLAYER CAN NOW ACTUALLY CLAIM ─────────────────────────────
  // Reset the day's counter to exactly the kill_more target and claim for real.
  await q(`delete from player_progress where user_id=$1 and kind='daily' and key='ev:kill_any'`, [uid]);
  await q(`insert into player_progress (user_id, slot, kind, key, value, period_key, state)
           values ($1, 0, 'daily', 'ev:kill_any', 30, $2, 'active')`, [uid, day]);
  const g7 = await goldOf(); const m7 = await gemsOf();
  /* K10(3) — THE XP PATH (b493; was "the F3 coupling"). The catalogue is read
     BEFORE the claim, the per-skill movement ACROSS it, and the once-guard
     AFTER it, because the bound is arithmetic over exactly those three terms.
     `combatIsSkill` is kept: the phantom-skill defect must not come back under
     a new spelling either. */
  obs.k10_3_catalogue = await q(
    "select goal_id, xp::text xp from public.hr_goal_rewards where counter_key='ev:kill_any' "
    + 'order by goal_id');
  obs.k10_3_nonSkillXpKeys = (await q(
    `select g.goal_id || '.' || e.key as k
       from public.hr_goal_rewards g, lateral jsonb_each_text(g.xp) e
      where g.counter_key = 'ev:kill_any'
        and not exists (select 1 from public.hr_skills s where s.skill_id = e.key)`))
    .map((r) => r.k);
  obs.k10_3_combatIsSkill = N((await q(
    "select count(*)::text c from public.hr_skills where skill_id='combat'"))[0].c);
  const sk7 = await skillMap();
  obs.k7 = await claimGoal('kill_more', false);
  obs.k10_3_move = skillDelta(sk7, await skillMap());
  obs.k10_3_skipped = obs.k7 && obs.k7.skipped_xp;
  obs.k7_gold = (await goldOf()) - g7;
  obs.k7_gems = (await gemsOf()) - m7;
  /* THE CARDINALITY TERM, measured in the XP dimension. The counter is still
     over target, so only the once-per-period guard row can refuse this — and
     since the XP is deliberately outside the 40M/day inflow budget, that guard
     is the ONLY thing bounding the ranked column. */
  const sk7b = await skillMap();
  const g7b = await goldOf(); const m7b = await gemsOf();
  obs.k10_3_replay = await claimGoal('kill_more', false);
  obs.k10_3_replayMove = skillDelta(sk7b, await skillMap());
  obs.k10_3_replayGold = (await goldOf()) - g7b;
  obs.k10_3_replayGems = (await gemsOf()) - m7b;

  // ── K7b. THE WEEKLY IS A SUM OF THE SAME DAILY ROWS (no weekly twin) ──
  for (const d of weekDays) {
    await q(`insert into player_progress (user_id, slot, kind, key, value, period_key, state)
             values ($1, 0, 'daily', 'ev:kill_any', 20, $2, 'active')
             on conflict (user_id,slot,kind,key,period_key)
               do update set value = player_progress.value + 20`, [uid, d]);
  }
  obs.k7b = await claimGoal('wk_kills', true);
  obs.weeklyRows = N((await q(
    "select count(*)::text c from player_progress where user_id=$1 and kind='weekly'", [uid]))[0].c);

  // ── K8. NO CLIENT WRITE SURFACE, NO CLIENT-EXECUTABLE PRIVILEGED VERB ─
  obs.acl = (await q(`select
      has_function_privilege('authenticated','public.hr_credit_kills(int,text,bigint,text)','execute') as wrapper,
      has_function_privilege('anon','public.hr_credit_kills(int,text,bigint,text)','execute') as wrapper_anon,
      has_function_privilege('authenticated','public.hr_credit_kills__ungated(int,text,bigint,text)','execute') as inner_exec,
      has_function_privilege('authenticated','public.hr_kill_credit_prune(interval)','execute') as prune_exec,
      has_function_privilege('authenticated','public.hr_bounty_kill_cap(int,int,bigint)','execute') as cap_exec`))[0];
  obs.writeGrants = (await q(
    `select table_name, privilege_type from information_schema.role_table_grants
      where table_schema='public' and table_name in ('player_progress','hr_kill_credit_log')
        and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
        and privilege_type <> 'SELECT'`)).map((r) => `${r.table_name}:${r.privilege_type}`);

  // ── K9. THE CATALOGUE PROPERTY BEHIND "NO WEEKLY TWIN" ────────────────
  obs.kindCheck = (await q(
    `select pg_get_constraintdef(oid) d from pg_constraint
      where conrelid='public.player_progress'::regclass and conname='player_progress_kind_check'`))[0].d;
  obs.killGoals = await q(
    "select goal_id, weekly, counter_kind, counter_key, target::text target "
    + "from public.hr_goal_rewards where counter_key='ev:kill_any' order by goal_id");

  /* ── K10(1). PIN THE READER SET, BY kind='daily' AND NOT BY THE KEY LITERAL.
     Every function that can reach this row must name kind='daily' somewhere in
     its body; NONE of them contains the literal 'ev:kill_any' (they concatenate
     or read the catalogue), which is exactly how the third paying reader was
     missed. So the scan is on the predicate, not the key, and ANY function
     outside the allowlist fails by name. Privileges come along in the same row so
     "who may call it" cannot drift silently either. */
  obs.dailyTouchers = await q(
    `select p.oid::regprocedure::text as sig,
            has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
            has_function_privilege('anon',          p.oid, 'execute') as anon_exec,
            has_function_privilege('hr_engine',     p.oid, 'execute') as engine_exec
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'
        and pg_get_functiondef(p.oid) ~ $q$'daily'$q$
      order by 1`);

  /* ── K10(2). PIN hr_claim_daily's KILL-TASK CATALOGUE. A re-tune of either
     value changes the forgery bound the review was taken against, so it must
     re-open the review BY NAME rather than silently move the number. */
  obs.claimDailyDef = (await q(
    "select pg_get_functiondef('public.hr_claim_daily__ungated(text,int)'::regprocedure) as r"))[0].r
    .replace(/\r/g, '');
  /* And EXECUTE it when today's day-seeded set happens to offer daily_kill (~54%
     of days) — a pin plus, when available, a real payment. `k10_2_executed`
     records which of the two this run got, so a green result is never mistaken
     for more coverage than it had. */
  const offered = (await q('select public.hr_daily_task_set(public.hr_utc_day_key(now())) as r'))[0].r || [];
  obs.k10_2_offered = offered;
  obs.k10_2_executed = offered.indexOf('daily_kill') >= 0;
  if (obs.k10_2_executed) {
    await q(`insert into player_progress (user_id, slot, kind, key, value, period_key, state)
             values ($1, 0, 'daily', 'ev:kill_any', 25, $2, 'active')
             on conflict (user_id,slot,kind,key,period_key) do update set value = 25`, [uid, day]);
    const gd = await goldOf();
    await gate();
    obs.k10_2 = await asUser(uid, 'select public.hr_claim_daily($1,0) as r', ['daily_kill']);
    obs.k10_2_gold = (await goldOf()) - gd;
  }

  await db.close?.();
  return { obs, problems };
}

/** Grade one run. Every assertion names the property, not the line. */
function grade(o, problems) {
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  ok(o.accept?.ok === true, `FIXTURE: hr_accept_bounty refused: ${JSON.stringify(o.accept)}`);

  // K1
  ok(o.k1?.ok === true, `K1: the bounty credit failed: ${JSON.stringify(o.k1)}`);
  ok(o.k1?.bounty === true,
    `K1: a credit WITH an active bounty did not take the bounty branch: ${JSON.stringify(o.k1)}`);
  ok(o.k1_daily > 0,
    'K1: THE BUG — a bounty kill credit did not move the DAILY ev:kill_any row, so the kill-30 '
    + `daily still cannot be claimed (moved ${o.k1_daily})`);
  ok(o.k1_daily === N(o.k1?.credited),
    `K1: the daily row moved ${o.k1_daily} but the credit applied ${o.k1?.credited} — the daily `
    + 'stamp is not the same delta as the lifetime aggregate');
  ok(o.k1_life === N(o.k1?.credited),
    `K1: the reviewed LIFETIME aggregate changed behaviour (moved ${o.k1_life}, applied ${o.k1?.credited})`);

  // K2
  ok(o.k2?.replay === true, `K2: a replay was not flagged: ${JSON.stringify(o.k2)}`);
  ok(o.k2_daily === 0,
    `K2: a REPLAY of the same idempotency key re-stamped the daily row (+${o.k2_daily})`);
  ok(o.k2_life === 0, `K2: a replay re-stamped the lifetime row (+${o.k2_life})`);

  // K3
  ok(o.k3?.ok === true,
    `K3: a BOUNTY-FREE credit was refused — a player killing with no bounty still gets no daily `
    + `credit: ${JSON.stringify(o.k3)}`);
  ok(o.k3?.bounty === false,
    `K3: a credit with NO active bounty did not take the bounty-free branch: ${JSON.stringify(o.k3)}`);
  ok(o.k3_daily === 25,
    `K3: the bounty-free credit moved the daily row by ${o.k3_daily}, expected 25`);
  ok(o.k3?.progress === undefined && o.k3?.required === undefined,
    `K3: the bounty-free receipt carries progress/required — the client would bind its bounty bar `
    + `to a bounty that does not exist: ${JSON.stringify(o.k3)}`);
  ok(o.k3_life === 0,
    `K3: CONTAINMENT — the bounty-free credit moved the LIFETIME ev:kill_any counter (+${o.k3_life}); `
    + 'hr_renown_of scores it at 0.05 renown/kill and hr_claim_quest pays on it');
  ok(o.k3_kills === 0, `K3: CONTAINMENT — it moved the lifetime kills stat (+${o.k3_kills})`);
  ok(o.k3_bestiary === 0,
    `K3: CONTAINMENT — it wrote the BESTIARY key (+${o.k3_bestiary}); hr_renown_of scores a boss `
    + 'kill at 5 renown');
  ok(o.k3_gold === 0 && o.k3_gems === 0,
    `K3: the credit minted currency (+${o.k3_gold} gold, +${o.k3_gems} gems) — it must mint none`);

  // K4
  ok(N(o.k4?.credited) <= 2,
    `K4: a second bounty-free credit in the same second applied ${o.k4?.credited} — the anchor `
    + 'does not advance, so the rate gate\'s 60 calls/min each mint a whole window');

  // K5
  ok(N(o.k5?.credited) === 0,
    `K5: CONDITION 2 — settle-first (accrued_to = now) still credited ${o.k5?.credited} kills, so `
    + 'the daily row is double-stamped with the span-sim');
  ok(o.k5_daily === 0, `K5: the daily row moved after a settle-first credit (+${o.k5_daily})`);
  ok(o.k5?.throttled === true, `K5: a 500-claim at ~0 elapsed was not throttled: ${JSON.stringify(o.k5)}`);
  ok(o.k5_journal >= 1, 'K5: a throttled claim was not journalled as a forgery signal');

  // K6
  ok(N(o.k6?.cap) > 0,
    `K6: FIXTURE DEGENERATE — cap is ${o.k6?.cap}, so the day ceiling was not the binding control`);
  ok(N(o.k6?.credited) === 0,
    `K6: the per-UTC-day bounty-free ceiling did not bind (cap ${o.k6?.cap}, credited ${o.k6?.credited})`);
  ok(o.k6_daily === 0, `K6: the daily row moved past the day ceiling (+${o.k6_daily})`);

  // K11 — credit + settle in the SAME window must not double-advance.
  ok(N(o.k11a?.credited) === 40,
    `K11: FIXTURE — the first bounty-free credit applied ${o.k11a?.credited}, expected 40`);
  ok(o.k11a_daily === 40, `K11: FIXTURE — the daily row is ${o.k11a_daily} after 40, expected 40`);
  ok(N(o.k11b?.settle_delta) === 12,
    `K11: the settle delta read ${o.k11b?.settle_delta}, expected 12 — the credit is blind to the `
    + 'settle that landed on the same window, so the two double-advance the daily row');
  ok(N(o.k11b?.credited) === 3,
    `K11: the credit applied ${o.k11b?.credited} on top of a settle that already covered 12 of the `
    + '15 observed kills — CREDIT + SETTLE DOUBLE-ADVANCE a paying daily counter');
  ok(o.k11_daily === 55,
    `K11: the daily row reads ${o.k11_daily} after 55 observed kills and a 12-kill settle — it must `
    + 'be exactly 55 (never 67). A counter that over-reads completes a paying goal early.');

  // K12 — S1: a zero-claim call must forgive nothing.
  ok(N(o.k12_zero?.credited) === 0,
    `K12: a ZERO-claim call credited ${o.k12_zero?.credited} — it must credit nothing`);
  ok(N(o.k12_zero?.consumed) === 0,
    `K12: a ZERO-claim call consumed ${o.k12_zero?.consumed} of the settle debt — a call that `
    + 'subtracts nothing must clear nothing, or it is a "forgive the debt" button');
  ok(o.k12_daily === o.k12_sum,
    `K12: S1 — after credit->settle->credit(0) x3 the daily row reads ${o.k12_daily} against `
    + `${o.k12_sum} credited. A zero-claim call FORGAVE the settle subtraction, so the counter `
    + 'over-reads by one settle per round (linear in rounds) and a paying goal completes early.');
  ok(o.k12_absorbed === 1,
    `K12: the absorbed/zero-claim case produced ${o.k12_absorbed} journal rows, expected exactly 1 `
    + 'per character per UTC day — S1 abuse must leave a named, greppable trace, and a row per '
    + 'call at the 60 s client cadence would be the game_events mistake');

  // K7
  ok(o.k7?.ok === true,
    `K7: kill_more is NOT claimable off the daily row this migration stamps — the whole fix is `
    + `inert: ${JSON.stringify(o.k7)}`);
  ok(o.k7_gold === 600 && o.k7_gems === 1,
    `K7: kill_more paid +${o.k7_gold} gold / +${o.k7_gems} gems, expected +600/+1`);
  ok(o.k7b?.ok === true,
    `K7b: wk_kills is NOT claimable by SUMMING the week's daily rows — a weekly twin would be `
    + `needed after all: ${JSON.stringify(o.k7b)}`);
  ok(o.weeklyRows === 0,
    `K7b: ${o.weeklyRows} player_progress rows carry kind='weekly' — nothing reads that kind`);

  // K8
  ok(o.acl?.wrapper === true, 'K8: hr_credit_kills is not callable by authenticated — the feature is dead');
  ok(o.acl?.wrapper_anon === false, 'K8: hr_credit_kills is anon-executable');
  ok(o.acl?.inner_exec === false,
    'K8: hr_credit_kills__ungated is client-executable — the rate gate is decoration');
  ok(o.acl?.prune_exec === false,
    'K8: hr_kill_credit_prune is client-executable — a client could delete its own day-ceiling rows');
  ok(o.acl?.cap_exec === false, 'K8: hr_bounty_kill_cap is client-executable');
  ok((o.writeGrants || []).length === 0,
    `K8: client write grants exist on the credit tables: ${(o.writeGrants || []).join(', ')}`);

  // K9
  ok(!/weekly/.test(o.kindCheck || ''),
    'K9: player_progress now admits a weekly kind — re-open the "no weekly twin" ruling rather '
    + 'than leaving a stamp nothing reads');
  ok((o.killGoals || []).length >= 2,
    `K9: only ${(o.killGoals || []).length} catalogued goal(s) read ev:kill_any — the fixture no `
    + 'longer covers the daily+weekly pair');
  for (const g of o.killGoals || []) {
    ok(g.counter_kind === 'daily',
      `K9: goal ${g.goal_id} grades ev:kill_any on counter_kind='${g.counter_kind}', not 'daily' — `
      + 'the stamp this migration adds would be unread');
  }
  ok((o.killGoals || []).some((g) => g.weekly),
    'K9: no WEEKLY kill goal is catalogued, so K7b proves nothing about the weekly derivation');

  // ── K10(1). THE READER SET IS EXACTLY WHAT THE REVIEW WAS TAKEN AGAINST ──
  /* Allowlist keyed on the bare function name, with WHY each one is allowed to
     touch kind='daily'. A function outside this list fails BY NAME — which is the
     property that would have caught the missed third reader. */
  const DAILY_TOUCHERS = {
    hr_goal_state__ungated: 'READS ev:kill_any — display only',
    hr_claim_goal__ungated: 'READS ev:kill_any — PAYS kill_any/kill_more/wk_kills',
    hr_claim_daily__ungated: 'READS ev:kill_any — PAYS daily_kill/daily_kill_big',
    hr_credit_kills__ungated: 'WRITES ev:kill_any (this migration)',
    hr_apply: 'WRITES the daily counters from the away/span-sim — hr_engine only',
    hr_farm_plant: "WRITES 'ev:planted' — a different key",
    hr_farm_harvest: "WRITES 'ev:harvest' — a different key",
  };
  const seen = new Set();
  for (const r of o.dailyTouchers || []) {
    const name = String(r.sig).split('(')[0];
    seen.add(name);
    ok(Object.prototype.hasOwnProperty.call(DAILY_TOUCHERS, name),
      `K10: a NEW function touches kind='daily' — ${r.sig}. The forgery bound this change was `
      + 'reviewed against is a statement about the COMPLETE set of readers/writers of that row. '
      + 'Classify it (payer? display? writer?) and re-open the review, or add it to '
      + 'DAILY_TOUCHERS with the reason.');
    ok(r.anon_exec === false, `K10: ${r.sig} is anon-executable`);
    if (name === 'hr_apply') {
      ok(r.engine_exec === true && r.auth_exec === false,
        `K10: hr_apply must be hr_engine-only (engine=${r.engine_exec}, authenticated=${r.auth_exec}) — `
        + 'a client-executable writer of the daily counter would make every bound above meaningless');
    } else if (name.endsWith('__ungated')) {
      ok(r.auth_exec === false,
        `K10: ${r.sig} is client-executable — its rate gate is decoration`);
    }
  }
  for (const name of Object.keys(DAILY_TOUCHERS)) {
    ok(seen.has(name),
      `K10: ${name} no longer touches kind='daily' (${DAILY_TOUCHERS[name]}). Either a payer stopped `
      + 'grading this row — which changes the bound — or the scan predicate has drifted and this '
      + 'guard is now blind.');
  }

  // ── K10(2). hr_claim_daily's KILL-TASK PRICES ARE PINNED ────────────────
  const def = o.claimDailyDef || '';
  ok(/when 'daily_kill'\s+then v_type := 'kill_any'; v_goal := 25;\s+v_gold := 500;/.test(def),
    "K10: hr_claim_daily's daily_kill is no longer 25 kills -> 500 gold. The reviewed forgery "
    + 'bound (<= 2,200 gold/UTC day) is arithmetic over these numbers — re-open the review.');
  ok(/when 'daily_kill_big'\s+then v_type := 'kill_any'; v_goal := 60;\s+v_gold := 900;/.test(def),
    "K10: hr_claim_daily's daily_kill_big is no longer 60 kills -> 900 gold. The reviewed forgery "
    + 'bound is arithmetic over these numbers — re-open the review.');
  if (o.k10_2_executed) {
    ok(o.k10_2 && o.k10_2.ok === true,
      `K10: daily_kill was offered today but did not pay off the stamped daily row: ${JSON.stringify(o.k10_2)}`);
    ok(o.k10_2_gold === 500,
      `K10: daily_kill paid +${o.k10_2_gold} gold, expected +500 — the third paying reader of this row`);
  }

  /* ── K10(3). A KILL-GOAL CLAIM MOVES EXACTLY THE CATALOGUED XP, ONCE ──────
     b493, and it REPLACES "a kill-goal claim mints no XP". That older assertion
     was true only because of a DEFECT — kill goals were priced in the phantom
     skill 'combat', which is not an hr_skills row, so the grant went to
     `skipped_xp` and no player_skills row moved. b492 fixed it and the Designer
     re-priced the grant into hitpoints (100/300/1000), which IS ranked. The
     verdict was re-taken, not assumed; the header carries it in full.

     What makes the new world safe is a structural property, so that is what is
     asserted here: a forged kill counter is a GATE, never a MULTIPLIER.
     hr_claim_goal pays v_cat.gold / v_cat.gems / v_cat.xp straight from
     hr_goal_rewards — RLS on, no policy, every client grant revoked — and the
     forgeable number `v_have` appears only in the journal and the receipt, never
     in an arithmetic that scales a payout. So the reachable amount is arithmetic
     over three catalogue terms, and all three are pinned below:

        SKILL        hitpoints, and nothing else moves
        AMOUNT       100 / 300 / 1,000
        CARDINALITY  once per period, guard row consumed before any credit

     Move any of the three and this guard fails BY NAME, which is the point: the
     bound is 400 hitpoints XP/character-day + 1,000/ISO-week against a
     neighbouring accepted surface of 5,000,000 combat XP/character-day, and that
     ratio — not the fact that some XP moves — is what the GO rests on. */
  const CAT_XP = { kill_any: { hitpoints: 100 }, kill_more: { hitpoints: 300 },
    wk_kills: { hitpoints: 1000 } };
  const canon = (v) => JSON.stringify(Object.fromEntries(
    Object.entries(v || {}).sort(([a], [b]) => (a < b ? -1 : 1))));
  const cat = {};
  for (const r of o.k10_3_catalogue || []) {
    try { cat[r.goal_id] = JSON.parse(r.xp); } catch { cat[r.goal_id] = null; }
  }
  ok(Object.keys(cat).length === Object.keys(CAT_XP).length,
    `K10: ${Object.keys(cat).length} goal(s) grade ev:kill_any, expected `
    + `${Object.keys(CAT_XP).length} — the forgery bound is a sum over this exact set`);
  for (const [g, want] of Object.entries(CAT_XP)) {
    ok(canon(cat[g]) === canon(want),
      `K10: goal ${g} is priced ${JSON.stringify(cat[g])}, reviewed as ${JSON.stringify(want)}. `
      + 'A forged kill counter is a GATE on this payout, so the CATALOGUE is the bound — re-pricing '
      + 'it or re-pointing it at another skill changes how much RANKED XP forgery reaches and must '
      + 're-open the security verdict by name, not move the number quietly.');
  }
  ok(o.k10_3_combatIsSkill === 0,
    "K10: 'combat' is now a row in hr_skills. It is the DERIVED combat level, not a trainable "
    + 'skill; a row by that name means some path is minting into a column the leaderboard derives.');
  ok((o.k10_3_nonSkillXpKeys || []).length === 0,
    `K10: kill-goal XP names a NON-SKILL — ${(o.k10_3_nonSkillXpKeys || []).join(', ')}. `
    + 'hr_claim_goal drops it into skipped_xp, so the modal quotes a price the game does not pay — '
    + 'the exact b492 defect, coming back.');
  ok(canon(o.k10_3_move) === canon({ hitpoints: 300 }),
    `K10: a kill_more claim moved player_skills by ${JSON.stringify(o.k10_3_move)}, expected `
    + 'exactly {"hitpoints":300} — the catalogued grant, on the catalogued skill, and NOTHING else. '
    + 'hitpoints is ranked (combat level + the skill board) and this credit sits OUTSIDE the shared '
    + '40M/day inflow budget, so the catalogue amount is the whole bound.');
  ok(canon(o.k10_3_skipped) === '{}',
    `K10: the kill-goal claim skipped part of its XP: ${JSON.stringify(o.k10_3_skipped)}. Since b492 `
    + 'every kill-goal XP key must be payable — a silent skip is the defect, not the control.');
  ok(o.k10_3_replay?.outcome === 'already_claimed',
    `K10: a SECOND kill_more claim in the same period was not refused: ${JSON.stringify(o.k10_3_replay)}. `
    + 'The once-per-period guard row is the only cardinality bound on a forged counter — without it '
    + 'every ceiling in the reviewed bound becomes per-call.');
  ok(canon(o.k10_3_replayMove) === '{}' && o.k10_3_replayGold === 0 && o.k10_3_replayGems === 0,
    `K10: the refused second claim still paid ${JSON.stringify(o.k10_3_replayMove)} XP / `
    + `${o.k10_3_replayGold} gold / ${o.k10_3_replayGems} gems — 'already_claimed' must be free of `
    + 'every credit, or the refusal is cosmetic.');
}

export async function killDailyCreditGuard() {
  const { obs, problems } = await run(null);
  grade(obs, problems);
  /* Coverage, reported rather than assumed: K10(2)'s EXECUTED half only runs on a
     day whose seeded task set offers daily_kill (~54% of days). A green run must
     say which half it got, or it silently claims coverage it did not have. */
  problems.coverage = `K10: ${(obs.dailyTouchers || []).length} kind='daily' toucher(s) pinned; `
    + `hr_claim_daily prices pinned${obs.k10_2_executed ? ' AND executed (+500 g proven)'
      : ' (daily_kill not offered today — pin only)'}; `
    + `kill-goal XP pinned + EXECUTED — moved ${JSON.stringify(obs.k10_3_move)}, `
    + `second claim in period refused (${obs.k10_3_replay?.outcome})`;
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
      // A mutation that makes the migration itself raise (its own §5 gate fired)
      // is CAUGHT — that is the migration refusing to install broken.
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
    const problems = await killDailyCreditGuard();
    if (problems.length) {
      console.error('kill-daily-credit guard — FAILED:');
      for (const p of problems) console.error(`  ✗ ${p}`);
      process.exit(1);
    }
    console.log('kill-daily-credit guard — the daily ev:kill_any row is stamped by both branches, '
      + 'the bounty-free branch writes that row and nothing else, the anchor + day ceiling bind, '
      + 'a replay does not double-stamp, and hr_claim_goal pays kill_more/wk_kills off it.');
  })().catch((e) => {
    console.error(String(e.message || e));
    process.exit(e && e.harness ? 2 : 1);
  });
}
