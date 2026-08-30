#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/modal-goal-claim.mjs — THE QUEST MODAL'S SERVER CREDIT PATH,
//                              GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/modal-goal-claim.mjs             # the guard
//   node tests/modal-goal-claim.mjs --list      # the mutation catalogue
//   node tests/modal-goal-claim.mjs --selftest  # every mutation must be CAUGHT
//   node tests/modal-goal-claim.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-08-23-modal-goal-claims.sql and
//             supabase/functions/hr-accrue/goal-period.js.
//
// ── THE DEFECT THIS EXISTS FOR (b461) ───────────────────────────────────
// Hearthrise has THREE goal systems. b414 gave two of them a server credit
// path; the quest MODAL's Daily/Weekly tabs (legacy.js DAILY_GOAL_POOL /
// DAILY_REWARDS / WEEKLY_GOAL_POOL) never got one, so under the live gold arm
// `claimQuestReward` returns on its first line and EVERY Claim button in that
// modal is silently dead in production.
//
// ── WHAT THIS FILE DRIVES ───────────────────────────────────────────────
// The REAL migration chain from tests/schema-apply-order.json, applied verbatim
// into PGlite (real PostgreSQL, in process), then a real player through the
// REAL rate-gated RPC as `authenticated` with a JWT subject set. It also binds
// the three sides that must never disagree:
//   (A) legacy.js's authored pools      — what the player SEES
//   (B) hr_goal_rewards                 — what the server CREDITS
//   (C) goal-period.js / core goals.js  — what the engine STAMPS
// A goal whose counter nothing writes, or a counter no goal reads, fails the
// build BY NAME rather than becoming a bar that never moves.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend, so the `for update` on
//     player_state is asserted PRESENT and exercised serially. Two simultaneous
//     claims are not reachable in this harness; the once-guard's ON CONFLICT is
//     what makes the race safe and is exercised as a replay.
//   · The pooler, PostgREST and the JWT itself.
//   · Production's ACL — §9(c) of the migration asserts it at apply time.
//   · That the EDGE really calls modalGoalOps on a live settle: the ops are
//     unit-checked here, and tests/goal-counters.mjs owns the settle path.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bootReplay } from './schema-replay.mjs';
import { modalGoalOps, MODAL_GOAL_COUNTERS, modalGoalKey } from
  '../supabase/functions/hr-accrue/goal-period.js';
/* b487 — the two catalogues a reward SPENDS. Imported, never re-listed: the
   whole point of the payout bind is that no side of it is a hand copy. */
import { SKILLS_DEF } from '../src/data/skills.js';
import { ITEMS } from '../src/data/items.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = '2026-08-23-modal-goal-claims.sql';
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────
   Each is a defect somebody could plausibly write, and each must turn this
   guard RED. A guard that cannot demonstrate it sees failure is broken, not
   passing. */
const MUTATIONS = {
  no_once_guard: {
    why: 'THE MONEY DEFECT: the once-guard row_count check is deleted, so a replay credits the '
       + 'reward again — an unbounded gold/gem/XP printer behind one button',
    find: `  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'outcome', 'already_claimed', 'error', 'already_claimed',
      'goal', p_goal_id, 'period', v_period);
  end if;`,
    repl: '  get diagnostics v_rows = row_count;',
  },
  trust_the_client: {
    why: 'completion stops being read from the server counter and the claim is paid on arrival — '
       + 'the client-authored grant this whole migration exists to remove',
    find: '  if v_have < v_cat.target then',
    repl: '  if false then',
  },
  week_is_thursday: {
    why: 'the weekly period reverts to hr_utc_week_key, which rolls over on a THURSDAY. The panel '
       + 'promises Monday and legacy.js rotates on Monday, so a re-offered goal would answer '
       + 'already_claimed for three days',
    find: `  v_period := case when v_cat.weekly then public.hr_iso_week_key(now())
                   else public.hr_utc_day_key(now()) end;`,
    repl: `  v_period := case when v_cat.weekly then public.hr_utc_week_key(now())
                   else public.hr_utc_day_key(now()) end;`,
  },
  weekly_reads_today: {
    why: 'a weekly goal reads only TODAY\'s counter instead of summing the ISO week, so "Cut 250 '
       + 'logs in a week" silently becomes "cut 250 logs today"',
    find: `    select coalesce(sum(value), 0) into v_have
      from public.player_progress
     where user_id = v_uid and slot = v_slot
       and kind = 'daily' and key = v_cat.counter_key
       and period_key = any (v_days);`,
    repl: `    select coalesce(value, 0) into v_have
      from public.player_progress
     where user_id = v_uid and slot = v_slot
       and kind = 'daily' and key = v_cat.counter_key
       and period_key = public.hr_utc_day_key(now());`,
  },
  xp_left_to_the_client: {
    why: 'the XP half of the reward stops being written to player_skills. Under the live skills '
       + 'arm the client\'s addXp is only a display prediction, so the XP would evaporate at the '
       + 'next settle — the exact failure class this migration closes',
    find: `  for v_k, v_v in select key, value from jsonb_each_text(v_xp_ok) loop
    insert into public.player_skills as sk (user_id, slot, skill_id, xp)
      values (v_uid, v_slot, v_k, v_v::bigint)
      on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;
  end loop;`,
    repl: '  -- xp left to the client',
  },
  empty_reward_burns_the_claim: {
    why: 'a reward with nothing mintable consumes the once-guard anyway, so the player spends '
       + 'their one daily claim on nothing and can never get it back',
    find: `  if v_cat.gold = 0 and v_cat.gems = 0 and v_xp_ok = '{}'::jsonb and v_it_ok = '{}'::jsonb then`,
    repl: '  if false then',
  },
  no_idem_default: {
    why: 'p_idem loses its DEFAULT, so the three-argument call form src/net/goal-claim.js posts '
       + 'stops resolving. PostgREST answers PGRST202 — a 404 indistinguishable from "never '
       + 'applied" — and every Claim button stays dead through a green deploy',
    find: '  p_goal_id text, p_weekly boolean, p_slot int, p_idem uuid default null)',
    repl: '  p_goal_id text, p_weekly boolean, p_slot int, p_idem uuid)',
  },
  plant_never_stamped: {
    why: 'the hr_farm_plant patch is skipped, so the "Plant 5 crops" daily can never complete and '
       + 'its Claim button is dead again — the very defect this migration exists for',
    find: "    values (v_uid, p_slot, ''daily'', ''ev:planted'', 1, public.hr_utc_day_key(now()), ''active'')",
    repl: "    values (v_uid, p_slot, ''daily'', ''ev:notplanted'', 1, public.hr_utc_day_key(now()), ''active'')",
  },
  /* ── b492: THE PHANTOM XP SKILL, FROM BOTH DIRECTIONS ──────────────────
     The defect that motivated this pair lived for four builds and cost every
     player the XP half of every kill goal, because it was caught by a
     `raise notice` — a line in an apply log nobody reads. So it is now checked
     twice, and both checks are mutated: one proves the DATABASE refuses to
     apply it, the other proves the REPO refuses to build it even if someone
     softens the database gate again (which is precisely how it survived). */
  /* ── b497: THE RETUNE FAMILY. A balance ruling is only real if BOTH sides
     move; a half-applied one shows the player one bar and grades them against
     another, which is the exact BIND defect this file was extended for in b487.
     Two mutations, one per direction, because the two are caught by DIFFERENT
     assertions and a single one would leave half the bind unproven. */
  goal_retune_target_reverted: {
    why: 'b497: the CATALOGUE keeps the pre-retune target/gold for gather_logs while legacy.js '
       + 'carries the ruled 60 @ 300 g. The modal would show "Gather 60 logs" and the server would '
       + 'pay at 25 — BIND (target) and BIND-PAY (gold) and C3 must all read RED',
    find: `  ('gather_logs', false, 'daily',       'ev:chopped',   60,   300, 0, '{"woodcutting":100}','{}'),`,
    repl: `  ('gather_logs', false, 'daily',       'ev:chopped',   25,   250, 0, '{"woodcutting":100}','{}'),`,
  },
  goal_retune_plant_wrong_way: {
    why: 'b497: `plant` was ruled DOWN (5 -> 3 crops, 200 -> 150 g) because the starting camp has '
       + 'two plots; this puts the target back up while the client shows 3. A retune that moves in '
       + 'the wrong direction is indistinguishable from a typo, and only the bind can tell',
    find: `  ('plant',       false, 'daily',       'ev:planted',      3,   150, 0, '{"farming":80}',     '{}'),`,
    repl: `  ('plant',       false, 'daily',       'ev:planted',      5,   200, 0, '{"farming":80}',     '{}'),`,
  },
  phantom_xp_skill_at_apply: {
    why: 'a kill goal goes back to pricing its XP as the phantom skill `combat`, which is not an '
       + 'hr_skills row — hr_claim_goal would drop the grant into skipped_xp and the player would '
       + 'be quoted a reward the game never pays. §GATE(b) must REFUSE THE APPLY',
    find: `  ('kill_any',    false, 'daily',       'ev:kill_any',  10,   200, 0, '{"hitpoints":100}',  '{}'),`,
    repl: `  ('kill_any',    false, 'daily',       'ev:kill_any',  10,   200, 0, '{"combat":50}',  '{}'),`,
  },
  phantom_xp_skill_past_the_gate: {
    why: 'the same phantom, WITH §GATE(b) softened back to a notice — the exact configuration the '
       + 'defect survived four builds in. C14b (graded against the rebuilt hr_skills) and BIND-PAY '
       + 'must catch it in the repo with no help from the database gate',
    pairs: [
      [`  ('kill_any',    false, 'daily',       'ev:kill_any',  10,   200, 0, '{"hitpoints":100}',  '{}'),`,
       `  ('kill_any',    false, 'daily',       'ev:kill_any',  10,   200, 0, '{"combat":50}',  '{}'),`],
      [`    raise exception 'GATE(b): reward XP names a NON-SKILL — %. hr_claim_goal drops it into '
                    'skipped_xp and pays the rest, so the modal quotes a price the game does not '
                    'keep. Name a real hr_skills id. NOTE a PERIOD reward must name a CONSTANT '
                    'skill: no combat style exists at claim time and the server may neither invent '
                    'one nor trust a client-supplied one.', v_txt;`,
       `    raise notice 'GATE(b) softened: %', v_txt;`],
    ],
  },
};

const UUID = () => crypto.randomUUID();

/** One end-to-end run against a freshly replayed database. */
async function run(mutate) {
  /* A mutation is normally ONE anchored replacement; `pairs` lets one state
     several at once, which some defects genuinely need (b492's second phantom
     mutation has to soften the apply-time gate as well as re-author the row,
     because otherwise the migration refuses to apply and the repo-side check
     never gets its turn to fail). */
  const patches = mutate
    ? new Map([[MIG, MUTATIONS[mutate].pairs
        || [[MUTATIONS[mutate].find, MUTATIONS[mutate].repl]]]])
    : undefined;
  const { db } = await bootReplay({ patches, upTo: MIG });

  const q = async (sql, p) => (await db.query(sql, p)).rows;
  /* SESSION-SCOPED (`is_local = false`), not `set local`: PGlite runs each query
     in its own implicit transaction, so a transaction-local GUC is gone by the
     next statement and auth.uid() would read NULL. */
  const asUser = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  const gate = () => q('delete from public.hr_rate_counters');

  // ── FIXTURE: one real player, created the server's own way ────────────
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q('insert into auth.users (id, instance_id, aud, role, email) '
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid, 'mgc@probe.invalid']);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await gate();
  await asUser(uid, 'select public.claim_display_name($1) as r', ['MgcProbe']);
  await gate();
  const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
  ok(cr?.ok === true, `FIXTURE: hr_create_character refused: ${JSON.stringify(cr)}`);

  const dayKey = (await q('select public.hr_utc_day_key(now()) as r'))[0].r;
  const weekKey = (await q('select public.hr_iso_week_key(now()) as r'))[0].r;
  const weekDays = (await q('select public.hr_goal_week_days(now()) as r'))[0].r;

  /* The counter is seeded the way the ENGINE writes it: kind='daily',
     key='ev:<counter>', period_key=<utc day key>, additive, state 'active' —
     the exact op shape goal-period.js emits and hr_apply applies. */
  const stamp = (key, n, period) => q(
    `insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
     values ($1, 0, 'daily', $2, $3, $4, 'active')
     on conflict (user_id, slot, kind, key, period_key)
       do update set value = public.player_progress.value + excluded.value`,
    [uid, key, n, period]);

  const goldOf = async () => Number((await q(
    'select gold::text g from player_state where user_id=$1 and slot=0', [uid]))[0].g);
  const gemsOf = async () => Number((await q(
    'select gems::text g from player_state where user_id=$1 and slot=0', [uid]))[0].g);
  const xpOf = async (skill) => Number((await q(
    'select xp::text x from player_skills where user_id=$1 and slot=0 and skill_id=$2',
    [uid, skill]))[0]?.x ?? 0);
  const claimRows = async () => Number((await q(
    "select count(*)::text c from player_progress where user_id=$1 and kind='quest' and key like 'goal:%'",
    [uid]))[0].c);
  const ledgerRows = async () => Number((await q(
    "select count(*)::text c from player_ledger where user_id=$1 and intent like 'goal_claim:%'",
    [uid]))[0].c);

  const claim = async (goal, weekly, idem = null) => {
    await gate();
    return asUser(uid, 'select public.hr_claim_goal($1,$2,0,$3) as r', [goal, weekly, idem]);
  };

  const obs = { dayKey, weekKey, weekDays };

  // ── C1. AN UNKNOWN GOAL IS REFUSED, NOT PAID ──────────────────────────
  obs.c1 = await claim('no_such_goal', false);
  // wk_bury is authored in legacy.js but deliberately UNCATALOGUED (no server
  // path to bury bones). It must refuse honestly rather than pay blind.
  obs.c1_bury = await claim('wk_bury', true);

  // ── C2. AN INCOMPLETE GOAL IS REFUSED ─────────────────────────────────
  obs.c2 = await claim('gather_logs', false);
  obs.c2_gold = await goldOf();

  // ── C3. A COMPLETE DAILY CREDITS EVERY HALF OF ITS REWARD, ONCE ───────
  // b497 retune: gather_logs is 60 logs -> 300 gold + 100 woodcutting XP.
  await stamp('ev:chopped', 60, dayKey);
  const g0 = await goldOf(); const x0 = await xpOf('woodcutting');
  obs.c3 = await claim('gather_logs', false);
  obs.c3_gold = (await goldOf()) - g0;
  obs.c3_xp = (await xpOf('woodcutting')) - x0;

  // ── C4. A REPLAY IS REFUSED AND CHANGES NOTHING ───────────────────────
  const g1 = await goldOf(); const x1 = await xpOf('woodcutting');
  obs.c4 = await claim('gather_logs', false);
  obs.c4_gold = (await goldOf()) - g1;
  obs.c4_xp = (await xpOf('woodcutting')) - x1;

  // ── C5. THE IDEMPOTENCY KEY REPLAYS THE ORIGINAL ENVELOPE ─────────────
  await stamp('ev:levelups', 1, dayKey);
  const idem = UUID();
  const g2 = await goldOf(); const m2 = await gemsOf();
  obs.c5a = await claim('level_up', false, idem);
  obs.c5b = await claim('level_up', false, idem);
  obs.c5_gold = (await goldOf()) - g2;
  obs.c5_gems = (await gemsOf()) - m2;

  // ── C6. A WEEKLY SUMS THE ISO WEEK'S DAYS, AND IS ITS OWN CLAIM ───────
  // gather_logs (25 today) is already claimed; the weekly reads the SAME
  // counter over the whole week and must still be claimable on its own.
  await stamp('ev:chopped', 120, weekDays[0]);
  await stamp('ev:chopped', 105, weekDays[1]);
  const g3 = await goldOf();
  obs.c6 = await claim('wk_logs', true);
  obs.c6_gold = (await goldOf()) - g3;

  // ── C7. ANOTHER WEEK'S COUNTER DOES NOT LEAK IN ───────────────────────
  const otherDay = (await q(
    "select public.hr_utc_day_key(now() - interval '14 days') as r"))[0].r;
  await stamp('ev:mined', 999, otherDay);
  obs.c7 = await claim('wk_gather', true);

  // ── C8. A WEEKLY FLAG THAT DISAGREES WITH THE CATALOGUE IS REFUSED ────
  obs.c8 = await claim('kill_any', true);

  // ── C9. AN ENTIRELY UNMINTABLE REWARD REFUSES *BEFORE* THE CONSUME ────
  // gold_500 pays 0 gold and 5x an item id that exists nowhere in the game.
  await q(`insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
           values ($1, 0, 'trade', 'mgc_probe_gold', 900, '{}'::jsonb)`, [uid]);
  obs.c9 = await claim('gold_500', false);
  obs.c9_burned = Number((await q(
    "select count(*)::text c from player_progress where user_id=$1 and kind='quest' and key='goal:gold_500'",
    [uid]))[0].c);

  // ── C10. A LEDGER-DERIVED GOLD GOAL READS REAL LEDGER GOLD ────────────
  // 900 is under the daily 500? no — over it. wk_gold needs 50,000; top it up.
  await q(`insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
           values ($1, 0, 'trade', 'mgc_probe_gold2', 60000, '{}'::jsonb)`, [uid]);
  const g4 = await goldOf();
  obs.c10 = await claim('wk_gold', true);
  obs.c10_gold = (await goldOf()) - g4;

  // ── C11. THE READ PROJECTION IS SERVER TRUTH ──────────────────────────
  await gate();
  obs.c11 = await asUser(uid, 'select public.hr_goal_state(0) as r');

  // ── C12. THE PLANT COUNTER IS STAMPED BY THE FARM RPC ITSELF ──────────
  // Not by this file: a fixture INSERT would make the assertion a statement
  // about a row the test wrote. Give the character a turnip seed the server's
  // own way, then plant through the real RPC.
  const version = Number((await q(
    'select version::text v from player_state where user_id=$1 and slot=0', [uid]))[0].v);
  await db.exec('set role hr_engine');
  try {
    await db.query('select hr_apply($1,0,$2,$3,$4::jsonb) r', [uid, version, UUID(),
      JSON.stringify({ items: { turnip_seed: 2 },
        journal: { kind: 'admin', intent: 'mgc_probe_seed' } })]);
  } finally { await db.exec('reset role'); }
  await gate();
  obs.c12_plant = await asUser(uid, 'select public.hr_farm_plant(0,0,$1,$2) as r',
    ['turnip', UUID()]);
  obs.c12_counter = Number((await q(
    "select value::text v from player_progress where user_id=$1 and slot=0 and kind='daily' "
    + "and key='ev:planted' and period_key=$2", [uid, dayKey]))[0]?.v ?? 0);

  // ── C12b. THE THREE-ARGUMENT CALL FORM RESOLVES ───────────────────────
  // src/net/goal-claim.js posts {p_goal_id, p_weekly, p_slot}; PostgREST
  // resolves an RPC by its NAMED ARGUMENTS, so a p_idem with no DEFAULT answers
  // PGRST202 — a 404 indistinguishable from "the migration was never applied",
  // and every Claim button stays dead through a green deploy.
  await gate();
  try {
    obs.c12b = await asUser(uid, 'select public.hr_claim_goal($1,$2,0) as r', ['no_such_goal', false]);
    obs.c12b_error = null;
  } catch (e) { obs.c12b = null; obs.c12b_error = String(e.message || e).split('\n')[0]; }

  // ── C13. ONE JOURNAL ROW PER CREDITED CLAIM, NEVER MORE ───────────────
  obs.claims = await claimRows();
  obs.ledger = await ledgerRows();

  // ── C14. THE CATALOGUE ITSELF ─────────────────────────────────────────
  obs.catalogue = await q('select goal_id, weekly, counter_kind, counter_key, target::text target, '
    + 'gold::text gold, gems::text gems, xp, items from public.hr_goal_rewards order by goal_id');
  obs.gateBuckets = (await q(
    "select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) as r"))[0].r;
  /* b492 — THE SERVER'S OWN SKILL CATALOGUE, read from the rebuilt database
     rather than from src/data/skills.js. hr_claim_goal's XP filter is
     `exists (select 1 from hr_skills …)`, so hr_skills is the table that decides
     whether a reward's XP is PAID or silently dropped into `skipped_xp`. Grading
     the catalogue against the client's SKILLS_DEF only proves the two client-side
     copies agree; this is the side that actually spends it. */
  obs.serverSkills = (await q('select skill_id from public.hr_skills order by 1')).map((r) => r.skill_id);

  await db.close?.();
  return obs;
}

/** Grade one run. Every assertion names the property, not the line. */
function grade(o) {
  ok(o.c1?.error === 'unknown_goal', `C1: an unknown goal was not refused: ${JSON.stringify(o.c1)}`);
  ok(o.c1_bury?.error === 'unknown_goal',
    `C1: wk_bury is catalogued — burying has NO server path, so it would pay on a client-only `
    + `counter: ${JSON.stringify(o.c1_bury)}`);

  ok(o.c2?.error === 'not_complete', `C2: an incomplete goal was not refused: ${JSON.stringify(o.c2)}`);

  ok(o.c3?.ok === true && o.c3?.outcome === 'applied',
    `C3: a complete daily did not credit: ${JSON.stringify(o.c3)}`);
  ok(o.c3_gold === 300, `C3: gather_logs credited ${o.c3_gold} gold, expected 300`);
  ok(o.c3_xp === 100, `C3: gather_logs credited ${o.c3_xp} woodcutting XP, expected 100 — the XP `
    + 'half of the reward is not server-applied, so it would evaporate at the next settle');

  ok(o.c4?.error === 'already_claimed', `C4: a replay was not refused: ${JSON.stringify(o.c4)}`);
  ok(o.c4_gold === 0 && o.c4_xp === 0,
    `C4: the replay RE-CREDITED (+${o.c4_gold} gold, +${o.c4_xp} xp)`);

  ok(o.c5a?.ok === true, `C5: level_up did not credit: ${JSON.stringify(o.c5a)}`);
  ok(o.c5b?.ok === true && o.c5b?.outcome === 'applied',
    `C5: an idempotent retry did not replay the original envelope: ${JSON.stringify(o.c5b)}`);
  ok(o.c5_gold === 500 && o.c5_gems === 1,
    `C5: the idempotent retry moved the balance (+${o.c5_gold} gold, +${o.c5_gems} gems) — `
    + 'expected +500/+1 exactly once');

  ok(o.c6?.ok === true, `C6: the weekly total did not sum the week's days: ${JSON.stringify(o.c6)}`);
  ok(o.c6?.period === o.weekKey,
    `C6: the weekly claim was filed under '${o.c6?.period}', expected '${o.weekKey}'`);
  ok(o.c6_gold === 2000, `C6: wk_logs credited ${o.c6_gold} gold, expected 2000`);

  ok(o.c7?.error === 'not_complete' && Number(o.c7?.have) === 0,
    `C7: a counter from ANOTHER week leaked into this week's total: ${JSON.stringify(o.c7)}`);

  ok(o.c8?.error === 'wrong_period',
    `C8: a mismatched weekly flag was not refused: ${JSON.stringify(o.c8)}`);

  ok(o.c9?.error === 'reward_unavailable',
    `C9: gold_500 (0 gold + a phantom item id) did not answer reward_unavailable: `
    + JSON.stringify(o.c9));
  ok(o.c9_burned === 0, 'C9: reward_unavailable BURNED the once-per-day claim — it must stay claimable');

  ok(o.c10?.ok === true, `C10: the ledger-derived gold goal did not credit: ${JSON.stringify(o.c10)}`);
  ok(o.c10_gold === 2500, `C10: wk_gold credited ${o.c10_gold} gold, expected 2500`);

  ok(o.c11?.ok === true && Array.isArray(o.c11?.goals) && o.c11.goals.length === 19,
    `C11: hr_goal_state did not project all 19 goals: ${JSON.stringify(o.c11).slice(0, 300)}`);
  const gl = (o.c11?.goals || []).find((g) => g.goal_id === 'gather_logs');
  ok(gl && gl.claimed === true && Number(gl.target) === 60,
    `C11: hr_goal_state does not report a claimed daily as claimed (or its target is not the b497 `
    + `ruled 60): ${JSON.stringify(gl)}`);
  const wl = (o.c11?.goals || []).find((g) => g.goal_id === 'wk_logs');
  ok(wl && wl.period === o.weekKey,
    `C11: a weekly goal is projected under the wrong period: ${JSON.stringify(wl)}`);

  ok(o.c12_plant?.ok === true, `C12: hr_farm_plant refused the probe plant: ${JSON.stringify(o.c12_plant)}`);
  ok(o.c12_counter === 1,
    `C12: hr_farm_plant stamped ${o.c12_counter} ev:planted, expected 1 — the "Plant 5 crops" daily `
    + 'can never complete without it');

  ok(o.c12b?.error === 'unknown_goal',
    `C12b: the THREE-argument call form did not resolve (${o.c12b_error || JSON.stringify(o.c12b)}). `
    + 'src/net/goal-claim.js posts {p_goal_id, p_weekly, p_slot}; without a DEFAULT on p_idem '
    + 'PostgREST answers PGRST202 and the whole feature deploys green and dead.');

  ok(o.ledger === o.claims,
    `C13: ${o.claims} claim rows but ${o.ledger} ledger rows — every credited claim must journal `
    + 'exactly once');
  ok(o.claims === 4, `C13: expected 4 consumed claims (gather_logs, level_up, wk_logs, wk_gold), `
    + `found ${o.claims}`);

  // ── C14. THE CATALOGUE, AND ITS BINDINGS ──────────────────────────────
  const cat = new Map((o.catalogue || []).map((r) => [r.goal_id, r]));
  ok(cat.size === 19, `C14: the catalogue holds ${cat.size} goals, expected 19`);
  for (const r of cat.values()) {
    if (r.counter_kind !== 'daily') continue;
    ok(r.counter_key.startsWith('ev:'),
      `C14: '${r.goal_id}' reads '${r.counter_key}', which is outside the ev: goal namespace`);
  }
  /* ── C14b (b492). NO CATALOGUED XP KEY MAY BE OUTSIDE hr_skills. ────────
     THE DEFECT: kill_any / kill_more / wk_kills priced their XP as skill id
     'combat'. That is not an hr_skills row — "combat level" is DERIVED from
     attack/strength/defense/hitpoints — so hr_claim_goal's
     `exists (select 1 from hr_skills …)` filter dropped every one of those
     grants into `skipped_xp`. The XP half of every kill goal in the game was
     never paid, for the whole life of the RPC, while the modal printed it as
     part of the price. It survived four builds as a `raise notice` in the
     migration's own §8 gate — an apply-time log line nobody reads.
     This is the hard version, graded against the SERVER's catalogue as rebuilt
     from the repo, and §8 now raises rather than notices. Both must hold: the
     migration refuses to APPLY, and this refuses to BUILD. */
  const serverSkills = new Set(o.serverSkills || []);
  ok(serverSkills.size > 10,
    `C14b: hr_skills holds ${serverSkills.size} rows — this check would be vacuous`);
  for (const r of cat.values()) {
    for (const k of Object.keys(r.xp || {})) {
      ok(serverSkills.has(k),
        `C14b: hr_goal_rewards.'${r.goal_id}' promises XP in '${k}', which is NOT an hr_skills row. `
        + 'hr_claim_goal drops it into skipped_xp and pays the rest, so the modal quotes a price the '
        + 'game does not keep — invisibly, because the player is never told. There is no exemption '
        + 'list for this: name a real skill. A PERIOD reward names a CONSTANT skill id (no combat '
        + 'style exists at claim time, and the server may neither invent one nor trust a '
        + 'client-supplied one).');
    }
  }
  ok(/'hr_claim_goal'/.test(o.gateBuckets) && /'hr_goal_state'/.test(o.gateBuckets),
    'C14: hr_rpc_gate does not carry the two new buckets — an ungated client RPC is a free DoS');
  // The gate patch must be ADDITIVE: a bucket another migration installed has to
  // survive it. hr_claim_daily is b414's; farm_plant is the farm slice's.
  for (const b of ['hr_claim_daily', 'hr_claim_quest', 'farm_plant', 'bank_move', 'client_state_put']) {
    ok(new RegExp(`'${b}'`).test(o.gateBuckets),
      `C14: the hr_rpc_gate patch DELETED the '${b}' bucket — the programmatic patch is not additive`);
  }
  return cat;
}

/* ── (A)↔(B)↔(C): the three-way bind, with no database ─────────────────── */
async function bindGuard(cat) {
  const legacy = await readFile(join(ROOT, 'src', 'legacy.js'), 'utf8');
  const mig = await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8');

  /* (A) the authored pools. Parsed out of legacy.js rather than duplicated:
     a second copy of game data is the failure this repo has been burned by
     (src/main.js unifyObject). */
  const arrayAfter = (needle) => {
    const at = legacy.indexOf(needle);
    if (at < 0) return null;
    const open = legacy.indexOf('[', at);
    let depth = 0;
    for (let i = open; i < legacy.length; i++) {
      if (legacy[i] === '[') depth++;
      else if (legacy[i] === ']' && --depth === 0) return legacy.slice(open, i + 1);
    }
    return null;
  };
  const daily = arrayAfter('var DAILY_GOAL_POOL =');
  const weekly = arrayAfter('window.WEEKLY_GOAL_POOL = window.WEEKLY_GOAL_POOL ||');
  ok(!!daily, 'BIND: DAILY_GOAL_POOL could not be located in legacy.js — the authored side is unreadable');
  ok(!!weekly, 'BIND: WEEKLY_GOAL_POOL could not be located in legacy.js');
  if (!daily || !weekly) return;

  const rowsOf = (body) => [...body.matchAll(/\{id:\s*'([a-z0-9_]+)'[\s\S]*?target:\s*(\d+)/g)]
    .map((m) => ({ id: m[1], target: Number(m[2]) }));
  const dailyRows = rowsOf(daily);
  const weeklyRows = rowsOf(weekly);
  ok(dailyRows.length === 9, `BIND: DAILY_GOAL_POOL yielded ${dailyRows.length} rows, expected 9`);
  ok(weeklyRows.length === 11, `BIND: WEEKLY_GOAL_POOL yielded ${weeklyRows.length} rows, expected 11`);

  /* Goals the server deliberately cannot verify. Being on this list is a
     DECISION with a reason; being on neither side is a build failure. */
  const UNCATALOGUED = new Map([
    ['wk_bury', 'legacy.js buryBones() is a pure client function (removeItem + addXp + '
      + 'G.stats.buried). No intent, no RPC, no settle — and BENCH_COUNTERS has no `prayer` row, '
      + 'so the bury_bones artisan recipe stamps nothing either. There is no server number to '
      + 'verify it against.'],
  ]);

  for (const r of [...dailyRows, ...weeklyRows]) {
    const c = cat.get(r.id);
    if (UNCATALOGUED.has(r.id)) {
      ok(!c, `BIND: '${r.id}' is documented as unverifiable but IS catalogued — it would pay `
        + `against a counter nothing writes. Reason on file: ${UNCATALOGUED.get(r.id)}`);
      continue;
    }
    ok(!!c, `BIND: authored goal '${r.id}' is ABSENT from hr_goal_rewards, so its Claim button is `
      + 'dead. Catalogue it, or add it to UNCATALOGUED with the reason it cannot be verified.');
    if (c) {
      ok(Number(c.target) === r.target,
        `BIND: '${r.id}' target ${r.target} in legacy.js != ${c.target} in the catalogue — the `
        + 'player would be shown one bar and graded against another');
    }
  }
  for (const id of cat.keys()) {
    ok([...dailyRows, ...weeklyRows].some((r) => r.id === id),
      `BIND: hr_goal_rewards carries '${id}', which no authored pool offers — the server would `
      + 'credit a goal the player can never see');
  }

  /* ════════════════════════════════════════════════════════════════════════
     (A)↔(B) THE PAYOUT, NOT JUST THE TARGET  (b487, live: "we also have a
     problem with claiming the quests reward")

     Until now this file bound the goal IDS and the TARGETS and stopped there.
     The REWARD — the line the modal prints under "Reward", and the numbers
     hr_claim_goal actually credits — was two independent copies that nothing
     compared. Both halves of that gap were live:

       · `gold_500` was authored `{gems:1, items:{bones:5}}` in legacy.js while
         hr_goal_rewards still carries `{gems:0, items:{small_bones:5}}` — a
         phantom id, so the whole reward is unmintable and the RPC answers
         `reward_unavailable`. b464 fixed the CLIENT and hand-patched the
         PRODUCTION row; the migration in this repo was never updated, so a
         rebuild or a re-apply silently re-breaks the goal.
       · `kill_any` / `kill_more` / `wk_kills` promised `xp:{combat:N}` on BOTH
         sides — and `combat` is not a skill_id (it is a DERIVED level), so
         hr_claim_goal's `exists (select 1 from hr_skills …)` filter skipped it
         and the player was paid gold and gems but never the XP the modal
         advertised. Agreement between two copies is not correctness when both
         copies name something that does not exist. CLOSED in b492: the reward
         names HITPOINTS (100 / 300 / 1000, the Designer's retune), and the
         no-exemption check below plus C14b keep it closed.

     So this block binds the payout in BOTH directions and additionally checks
     each side against the CATALOGUES it spends (hr_skills / ITEMS). Every known
     divergence is declared BY NAME with its reason and its owner — a new one
     fails the build, and clearing a declared one is a one-line deletion here. */
  {
    /* The authored payouts, EVALUATED out of the source literal rather than
       re-typed. They are pure data (no calls, no identifiers), so this cannot
       execute game code; and reading them means this guard can never bind a
       stale hand-copy of the very numbers it is checking. */
    const literalAfter = (needle, open, close) => {
      const at = legacy.indexOf(needle);
      if (at < 0) return null;
      const start = legacy.indexOf(open, at);
      let depth = 0;
      for (let i = start; i < legacy.length; i++) {
        if (legacy[i] === open) depth++;
        else if (legacy[i] === close && --depth === 0) return legacy.slice(start, i + 1);
      }
      return null;
    };
    const evalLiteral = (text, what) => {
      try { return new Function(`return (${text});`)(); }
      catch (e) { ok(false, `BIND-PAY: could not read ${what} out of legacy.js — ${e.message}`); return null; }
    };
    const dailyRewards = evalLiteral(literalAfter('var DAILY_REWARDS =', '{', '}'), 'DAILY_REWARDS');
    const weeklyPool = evalLiteral(weekly, 'WEEKLY_GOAL_POOL');
    ok(dailyRewards && Object.keys(dailyRewards).length === 9,
      `BIND-PAY: DAILY_REWARDS yielded ${dailyRewards && Object.keys(dailyRewards).length} rows, expected 9`);
    ok(Array.isArray(weeklyPool) && weeklyPool.length === 11,
      `BIND-PAY: WEEKLY_GOAL_POOL yielded ${weeklyPool && weeklyPool.length} rows, expected 11`);
    if (!dailyRewards || !weeklyPool) return;

    /* THE DECLARED DIVERGENCES. Being here is a DECISION with an owner; being
       on neither side is a build failure. Delete a row the day it is closed. */
    const KNOWN_PAYOUT_DRIFT = new Map([
      ['gold_500', 'REPO⟷PROD DRIFT (b464, open). legacy.js pays {gems:1, items:{bones:5}}; this '
        + 'migration still carries {gems:0, items:{small_bones:5}}. Production was hand-patched to '
        + 'match the client, so players are unaffected TODAY — but a rebuild or a re-apply of this '
        + 'file restores the phantom id and the goal goes back to reward_unavailable. Closing it '
        + 'needs a small migration that (1) fixes the row and (2) re-points §GATE(e) and C9 — which '
        + 'use this very row as their empty-reward FIXTURE — at a synthetic goal instead. '
        + 'OWNER: Systems + Coordinator (migration apply).'],
    ]);
    /* ⚠ PHANTOM_XP_SKILL IS GONE, AND MUST NOT COME BACK (b492). It held one
       entry — 'combat' on kill_any / kill_more / wk_kills — for four builds,
       and the thing an exemption buys you is exactly what it cost here: the XP
       half of every kill goal in the game went unpaid for the RPC's whole life
       while the modal printed it as part of the price, and the build stayed
       green because the defect was DECLARED.
       Designer ruling (2026-08-31): kill-goal XP is HITPOINTS — 100 / 300 /
       1000 — a real hr_skills row and a server-accrued skill, so the credit
       lands in the record the envelope reconciles instead of evaporating.
       An unpayable XP key is now a build failure with NO exemption list, both
       here and in C14b (graded against the rebuilt hr_skills table), and the
       migration's §GATE(b) raises rather than notices so it cannot be applied
       either. If a future reward genuinely needs a skill the server does not
       have, ADD THE SKILL — do not add a map. */

    const norm = (o) => JSON.stringify(Object.fromEntries(
      Object.entries(o || {}).map(([k, v]) => [k, Number(v) || 0]).filter(([, v]) => v > 0).sort()));
    const clientReward = (id, isWeekly) => (isWeekly
      ? (weeklyPool.find((r) => r.id === id) || {}).reward
      : dailyRewards[id]) || {};

    for (const r of [...dailyRows.map((x) => ({ ...x, weekly: false })),
                     ...weeklyRows.map((x) => ({ ...x, weekly: true }))]) {
      const c = cat.get(r.id);
      if (!c) continue;                                    // absence is BIND's job, above
      const shown = clientReward(r.id, r.weekly);
      const mismatch = [];
      if ((Number(shown.gold) || 0) !== Number(c.gold)) mismatch.push(`gold ${shown.gold || 0}≠${c.gold}`);
      if ((Number(shown.gems) || 0) !== Number(c.gems)) mismatch.push(`gems ${shown.gems || 0}≠${c.gems}`);
      if (norm(shown.xp) !== norm(c.xp)) mismatch.push(`xp ${norm(shown.xp)}≠${norm(c.xp)}`);
      if (norm(shown.items) !== norm(c.items)) mismatch.push(`items ${norm(shown.items)}≠${norm(c.items)}`);
      if (KNOWN_PAYOUT_DRIFT.has(r.id)) {
        ok(mismatch.length > 0,
          `BIND-PAY: '${r.id}' is recorded as a KNOWN payout divergence but the two sides now AGREE. `
          + 'Delete its KNOWN_PAYOUT_DRIFT row — a stale exemption hides the next real one.');
        continue;
      }
      ok(mismatch.length === 0,
        `BIND-PAY: '${r.id}' — the modal SHOWS a different reward from the one hr_claim_goal PAYS `
        + `(${mismatch.join(', ')}). The player is quoted one price and paid another. Fix the side `
        + 'that is wrong, or declare it in KNOWN_PAYOUT_DRIFT with the reason and the owner.');
    }

    /* EVERY XP KEY MUST BE A REAL SKILL, and every item id a real item — on the
       side that SPENDS them. hr_claim_goal filters silently (`skipped_xp` /
       `skipped_items` in the receipt), so an unpayable component is invisible
       to the player: they claim, they are paid less than the line promised, and
       nothing anywhere says so. */
    const skillIds = new Set(Object.keys(SKILLS_DEF));
    const itemIds = new Set(Object.keys(ITEMS));
    ok(skillIds.size > 10 && itemIds.size > 100,
      `BIND-PAY: the catalogues look empty (${skillIds.size} skills, ${itemIds.size} items) — this `
      + 'check would be vacuous');
    for (const c of cat.values()) {
      for (const k of Object.keys(c.xp || {})) {
        /* NO EXEMPTION LIST — b492. See the note where PHANTOM_XP_SKILL used to
           be. C14b runs the same claim against the SERVER's hr_skills table; this
           one runs it against the CLIENT's SKILLS_DEF, so a skill that exists on
           only one side is caught by the other's check. */
        ok(skillIds.has(k),
          `BIND-PAY: '${c.goal_id}' promises XP in '${k}', which is not a skill. hr_claim_goal drops `
          + 'it into skipped_xp and pays the rest, so the reward line is a promise the game does not '
          + 'keep. Name a real skill — there is no exemption for this any more.');
      }
      for (const k of Object.keys(c.items || {})) {
        ok(itemIds.has(k) || KNOWN_PAYOUT_DRIFT.has(c.goal_id),
          `BIND-PAY: '${c.goal_id}' promises item '${k}', which is in no ITEMS row — hr_claim_goal `
          + 'cannot mint it, and a reward with nothing left to pay refuses reward_unavailable.');
      }
    }

    /* ── A DEALABLE GOAL MUST BE A CLAIMABLE GOAL (b487, the wk_bury defect) ──
       `wk_bury` sat in WEEKLY_GOAL_POOL and NOT in hr_goal_rewards, and this
       file's own UNCATALOGUED map said so — while the picker went on dealing it
       in 13 of any 52 weeks, and the modal went on rendering a Claim button for
       it off the LOCAL count (isComplete falls through when the server has no
       row). Every press answered `unknown_goal`. Documenting that a goal cannot
       pay is not the same as not offering it — this is the assertion that makes
       the two agree, and it is the Designer's own standing rule: a quest that
       cannot pay must not be dealt. */
    for (const [id, why] of UNCATALOGUED) {
      const row = weeklyPool.find((r) => r.id === id) || null;
      ok(!row || !!row.blocked,
        `BIND-PAY: '${id}' is UNCATALOGUED (${why.slice(0, 80)}…) but is still DEALABLE — the picker `
        + 'offers it and the modal renders a Claim button the server refuses unknown_goal. Mark the '
        + 'authored row `blocked:` so it keeps its pool index and is never dealt.');
    }
    for (const row of weeklyPool) {
      if (!row.blocked) continue;
      ok(!cat.has(row.id),
        `BIND-PAY: '${row.id}' is marked blocked in WEEKLY_GOAL_POOL but the server CAN pay it — `
        + 'delete the marker so players are offered a quest that works.');
    }
    ok(weeklyPool.filter((r) => !r.blocked).length >= 3,
      'BIND-PAY: fewer than 3 dealable weekly goals remain — the picker cannot fill a slate');
  }

  /* (B)↔(C): every period counter the catalogue reads must be a key SOMETHING
     stamps — goal-period.js's own list, or src/core/goals.js's GOAL_EVENTS, or
     the farm RPC's ev:planted (asserted live by C12). */
  const CORE_EVENT_KEYS = ['ev:kill_any', 'ev:gather', 'ev:harvest', 'ev:cooked',
    'ev:smithed', 'ev:crafted'];
  const stamped = new Set([
    ...CORE_EVENT_KEYS,
    ...MODAL_GOAL_COUNTERS.map(modalGoalKey),
    'ev:planted',
  ]);
  for (const r of cat.values()) {
    if (r.counter_kind !== 'daily') continue;
    ok(stamped.has(r.counter_key),
      `BIND: '${r.goal_id}' is graded on '${r.counter_key}', which NOTHING stamps — its bar can `
      + 'never move. Either stamp it or drop the goal.');
  }
  for (const c of MODAL_GOAL_COUNTERS) {
    ok([...cat.values()].some((r) => r.counter_key === modalGoalKey(c)),
      `BIND: goal-period.js stamps '${modalGoalKey(c)}' but no catalogued goal reads it — a `
      + 'counter that ticks into the void costs rows and buys nothing');
  }

  /* The engine really emits those ops, in hr_apply's shape. */
  const ev = [];
  const ops = modalGoalOps(Date.UTC(2026, 7, 24, 9), Object.fromEntries(
    MODAL_GOAL_COUNTERS.map((c) => [c, 3])), ev);
  ok(ops.length === MODAL_GOAL_COUNTERS.length,
    `BIND: modalGoalOps emitted ${ops.length} ops for ${MODAL_GOAL_COUNTERS.length} counters`);
  ok(ops.every((op) => op.kind === 'daily' && op.state === 'active' && op.add === 3
      && op.period === '2026-8-24'),
    `BIND: an emitted op is not in hr_apply's daily shape: ${JSON.stringify(ops[0])}`);
  ok(ev.length === 0, `BIND: a known counter produced a receipt: ${JSON.stringify(ev)}`);

  /* The three accrual builders each carry the emit. A stamp that exists but is
     never called is the silent-gap shape src/core/goals.js was written after. */
  const accrual = await readFile(
    join(ROOT, 'supabase', 'functions', 'hr-accrue', 'accrual.js'), 'utf8');
  const calls = (accrual.match(/modalGoalOps\(/g) || []).length;
  ok(calls === 3, `BIND: accrual.js CALLS modalGoalOps ${calls} times, expected 3 — one per accrual `
    + 'builder (combat, gather, artisan). A builder that does not emit is a counter that only '
    + 'moves on some activities, which is the silent half-gap src/core/goals.js was written after.');

  /* (A)↔(B): the ISO week's BOUNDARIES must equal legacy.js thisWeekKey()'s, or
     a goal re-offered on Monday answers already_claimed until the server's week
     rolls. The KEYS differ by design (a string vs an integer); the INSTANTS
     they change at must not. */
  ok(/Math\.floor\(\(ms \/ 86400000 \+ 3\) \/ 7\)/.test(legacy),
    'BIND: legacy.js thisWeekKey() no longer buckets on (days+3)/7 — re-derive the server week');
  ok(/hr_iso_week_key/.test(mig) && /IYYY-"W"IW/.test(mig),
    'BIND: the migration no longer defines an ISO (Monday) week key');
  const clientWeek = (ms) => Math.floor((ms / 86400000 + 3) / 7);
  let boundaryMismatch = 0;
  for (let i = 1; i < 800; i++) {
    const prev = Date.UTC(2026, 0, 1) + (i - 1) * 86400000;
    const cur = Date.UTC(2026, 0, 1) + i * 86400000;
    const clientChanged = clientWeek(cur) !== clientWeek(prev);
    const isoChanged = new Date(cur).getUTCDay() === 1;   // ISO week starts Monday
    if (clientChanged !== isoChanged) boundaryMismatch++;
  }
  ok(boundaryMismatch === 0,
    `BIND: the client week and the ISO week change on different days (${boundaryMismatch} of 799)`);
}

/**
 * The guard, as a function, so tests/run-smoke.mjs can call it the way it calls
 * clanDepositOwnershipGuard(). Returns the problem list; empty is green.
 */
export async function modalGoalClaimGuard() {
  problems.length = 0;
  const catalogue = grade(await run());
  await bindGuard(catalogue);
  return [...problems];
}

// ── main (only when run directly; run-smoke imports the guard above) ─────
const argv = process.argv.slice(2);
const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/modal-goal-claim.mjs');
if (RUN_DIRECTLY) {
if (argv.includes('--list')) {
  for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(28)} ${m.why}`);
  process.exit(0);
}

const mutateArg = argv.find((a) => a.startsWith('--mutate='));
const selftest = argv.includes('--selftest');

if (selftest) {
  let bad = 0;
  for (const id of Object.keys(MUTATIONS)) {
    problems.length = 0;
    let caught = false;
    try {
      const cat = grade(await run(id));
      await bindGuard(cat);
      caught = problems.length > 0;
    } catch (e) {
      caught = true;   // a mutation that makes the run throw is also caught
    }
    console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${id}`);
    if (!caught) { bad++; console.log(`         ${MUTATIONS[id].why}`); }
  }
  console.log(bad ? `\n${bad} mutation(s) NOT caught — the guard is blind to them.`
    : `\nall ${Object.keys(MUTATIONS).length} mutations caught.`);
  process.exit(bad ? 1 : 0);
}

const cat = grade(await run(mutateArg ? mutateArg.split('=')[1] : undefined));
await bindGuard(cat);

if (problems.length) {
  console.error(`modal-goal-claim: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(mutateArg ? 0 : 1);
}
console.log('modal-goal-claim: green — server-verified claim, once-guarded, idempotent, '
  + 'weekly derived from the ISO week, whole reward credited, catalogue bound to legacy.js.');
if (mutateArg) { console.error('the mutation was NOT caught'); process.exit(1); }
}
