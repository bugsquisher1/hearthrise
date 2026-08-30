#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/goal-gold-retune.mjs — THE b497 BALANCE RETUNE, GRADED AGAINST REAL
//                              POSTGRESQL.
//
//   node tests/goal-gold-retune.mjs             # the guard
//   node tests/goal-gold-retune.mjs --list      # the mutation catalogue
//   node tests/goal-gold-retune.mjs --selftest  # every mutation must be CAUGHT
//   node tests/goal-gold-retune.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-09-04-goal-gold-retune.sql
//
// ── WHY A MIGRATION NEEDS ITS OWN GUARD ─────────────────────────────────
// Editing an AUTHORING migration makes a REBUILD correct and does nothing
// whatever to a database that already has the old rows and the old function
// bodies installed. Production is moved only by the forward migration, and a
// forward migration is a program: it can no-op silently, patch three arms of
// four, or overwrite a row somebody else changed. The repo-side drift guards
// (tests/goal-catalogue-drift.mjs, tests/modal-goal-claim.mjs) read the
// AUTHORED text and are therefore blind to every one of those.
//
// So this file replays the real chain with the authoring files REVERTED to the
// pre-ruling numbers — which is the shape production is actually in — and makes
// the migration do real work, then grades the work by PLAYING it: a real player
// through the real rate-gated RPCs, paid the ruled amounts.
//
// ── THE FOUR PROPERTIES ─────────────────────────────────────────────────
//   T. TRANSITION   the pre-ruling database ends up ruled on all THREE
//                   surfaces (a table, and two CASE catalogues that live inside
//                   function bodies), and the player is really paid the new
//                   numbers — including the two goals that were ruled DOWN.
//   I. IDEMPOTENT   applying it again changes nothing and raises nothing, on
//                   BOTH a transitioned database and a rebuilt one (where the
//                   authoring files already carry the ruled numbers, so the
//                   file must be a GRADED no-op rather than a skipped one).
//   D. DRIFT        a surface a third party has since re-authored REFUSES the
//                   apply instead of being overwritten — proven by drifting
//                   each of the three surfaces IN THE DATABASE, which is the
//                   only place drift ever actually appears.
//   B. BOUND        the numbers the migration installs are the numbers
//                   src/data/goal-catalogue.js authors. A migration that agreed
//                   with itself and not with the client would show one price
//                   and pay another — the b487 defect, one layer down.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY (PGlite is one backend).
//   · PostgREST, the pooler and the JWT.
//   · That PRODUCTION's installed bodies are byte-identical to the chain's.
//     The migration's own anchors fail closed on that, and §4 reads back.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { DAILY_TASK_REWARDS, QUEST_REWARDS } from '../src/data/goal-catalogue.js';

const MIG = '2026-09-04-goal-gold-retune.sql';
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/* ── THE PRE-RULING CHAIN ───────────────────────────────────────────────
   The three AUTHORING files, put back the way production still has them. This
   is not a mutation — it is the fixture, and it is the whole reason the guard
   can see the migration do anything at all. Every anchor must match exactly
   once (bootReplay enforces it), so a reworded authoring file fails loudly here
   instead of quietly leaving the fixture a no-op. */
const PRE_RULING = new Map([
  ['2026-08-23-modal-goal-claims.sql', [
    [`  ('gather_logs', false, 'daily',       'ev:chopped',   60,   300, 0, '{"woodcutting":100}','{}'),
  ('mine_ore',    false, 'daily',       'ev:mined',     60,   300, 0, '{"mining":100}',     '{}'),
  ('cook',        false, 'daily',       'ev:cooked',    25,   250, 0, '{"cooking":80}',     '{}'),
  ('fish',        false, 'daily',       'ev:fished',    50,   300, 0, '{"fishing":100}',    '{}'),`,
     `  ('gather_logs', false, 'daily',       'ev:chopped',   25,   250, 0, '{"woodcutting":100}','{}'),
  ('mine_ore',    false, 'daily',       'ev:mined',     25,   250, 0, '{"mining":100}',     '{}'),
  ('cook',        false, 'daily',       'ev:cooked',     5,   200, 0, '{"cooking":80}',     '{}'),
  ('fish',        false, 'daily',       'ev:fished',    15,   250, 0, '{"fishing":100}',    '{}'),`],
    [`  ('plant',       false, 'daily',       'ev:planted',      3,   150, 0, '{"farming":80}',     '{}'),`,
     `  ('plant',       false, 'daily',       'ev:planted',      5,   200, 0, '{"farming":80}',     '{}'),`],
    // …and its own §9 gate, which asserts the ruled figures by executing them.
    [`      values (v_uid, v_slot, 'daily', 'ev:chopped', 60, v_day, 'active');`,
     `      values (v_uid, v_slot, 'daily', 'ev:chopped', 25, v_day, 'active');`],
    [`    if v_g1 - v_g0 <> 300 then
      raise exception 'GATE(e): gather_logs credited % gold, expected 300', v_g1 - v_g0;`,
     `    if v_g1 - v_g0 <> 250 then
      raise exception 'GATE(e): gather_logs credited % gold, expected 250', v_g1 - v_g0;`],
  ]],
  ['2026-08-20-goal-reward-rpc-credit.sql', [
    [`    when 'farmhand'    then v_key := 'ev:harvest';  v_goal := 6;  v_gold := 500;`,
     `    when 'farmhand'    then v_key := 'ev:harvest';  v_goal := 10; v_gold := 500;`],
    [`    when 'daily_kill'       then v_type := 'kill_any'; v_goal := 25;  v_gold := 600;
    when 'daily_kill_big'   then v_type := 'kill_any'; v_goal := 60;  v_gold := 1400;`,
     `    when 'daily_kill'       then v_type := 'kill_any'; v_goal := 25;  v_gold := 500;
    when 'daily_kill_big'   then v_type := 'kill_any'; v_goal := 60;  v_gold := 900;`],
    [`    when 'daily_smith'      then v_type := 'smithed';  v_goal := 40;  v_gold := 500;
    when 'daily_craft'      then v_type := 'crafted';  v_goal := 40;  v_gold := 500;`,
     `    when 'daily_smith'      then v_type := 'smithed';  v_goal := 8;   v_gold := 450;
    when 'daily_craft'      then v_type := 'crafted';  v_goal := 8;   v_gold := 450;`],
  ]],
  ['2026-08-29-daily-task-eligibility.sql', [
    [`    when 'daily_kill'       then v_type := 'kill_any'; v_goal := 25;  v_gold := 600;
    when 'daily_kill_big'   then v_type := 'kill_any'; v_goal := 60;  v_gold := 1400;`,
     `    when 'daily_kill'       then v_type := 'kill_any'; v_goal := 25;  v_gold := 500;
    when 'daily_kill_big'   then v_type := 'kill_any'; v_goal := 60;  v_gold := 900;`],
    [`    when 'daily_smith'      then v_type := 'smithed';  v_goal := 40;  v_gold := 500;
    when 'daily_craft'      then v_type := 'crafted';  v_goal := 40;  v_gold := 500;`,
     `    when 'daily_smith'      then v_type := 'smithed';  v_goal := 8;   v_gold := 450;
    when 'daily_craft'      then v_type := 'crafted';  v_goal := 8;   v_gold := 450;`],
  ]],
]);

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────
   Each is a defect somebody could plausibly write INTO THE MIGRATION, and each
   must turn this guard RED. A guard that cannot demonstrate it sees failure is
   broken, not passing. One per retune family, plus the two ways a fail-closed
   file stops failing closed. */
const MUTATIONS = {
  daily_task_family_missed: {
    why: 'the daily-task patch loop TOLERATES an arm it cannot match instead of raising, so a '
       + 'production body that has moved is left on the old price while the file reports success '
       + '— the silent half-apply this whole shape exists to prevent',
    find: `      raise exception 'hr_claim_daily__ungated arm for % matches NEITHER the known-live catalogue '
                      'nor the ruled one. The installed body is not what this file was authored '
                      'against — refusing to patch blind. Pull it with pg_get_functiondef and '
                      're-author this file.', r.task;`,
    repl: '      v_done := v_done + 1;',
  },
  daily_task_wrong_price: {
    why: 'daily_kill_big is patched to the PRE-RULING 900 g. The migration would apply green and '
       + 'the player would be shown 1,400 and paid 900',
    find: `       'when ''daily_kill_big'' then v_type := ''kill_any''; v_goal := 60; v_gold := 1400;',
       'when ''daily_kill_big'' then v_type := ''kill_any''; v_goal := 60; v_gold := 1400;'),`,
    repl: `       'when ''daily_kill_big'' then v_type := ''kill_any''; v_goal := 60; v_gold := 900;',
       'when ''daily_kill_big'' then v_type := ''kill_any''; v_goal := 60; v_gold := 900;'),`,
  },
  modal_goal_row_not_moved: {
    why: 'the hr_goal_rewards UPDATE is dropped, so the five modal rows keep the pre-ruling '
       + 'target/gold while the client shows the new ones — one bar shown, another graded',
    find: `    update public.hr_goal_rewards g
       set target = r.new_t, gold = r.new_g
     where g.goal_id = r.goal_id
       and (g.target, g.gold) is distinct from (r.new_t::bigint, r.new_g::bigint);`,
    repl: '    -- update dropped',
  },
  modal_goal_drift_accepted: {
    why: 'the catalogue assert accepts ANY current shape, so a row a third party re-authored is '
       + 'silently overwritten — the b464 gold_500 class, where a live hand-patch was reverted by '
       + 'a re-apply',
    find: `    if not ((v_have.target = r.old_t and v_have.gold = r.old_g)
         or (v_have.target = r.new_t and v_have.gold = r.new_g)) then`,
    repl: '    if false then',
  },
  quest_goal_not_moved: {
    why: 'the farmhand arm is patched to the PRE-RULING goal of 10, so onboarding step 4 keeps its '
       + 'two-grow-cycle wall on the server while the client offers 6',
    find: `    'when ''farmhand'' then v_key := ''ev:harvest''; v_goal := 6; v_gold := 500;';`,
    repl: `    'when ''farmhand'' then v_key := ''ev:harvest''; v_goal := 10; v_gold := 500;';`,
  },
  /* ⚠ THIS ONE IS A PAIR, AND THE FIRST DRAFT OF IT WAS VACUOUS — recorded
     because the mistake is the reusable part. Softening §4's read-back ALONE
     changes nothing observable: §1 still writes, so the rows still land and
     every assertion here passes whether the verify exists or not. A mutation
     that plants no defect proves nothing. The configuration a real defect
     survives in is BOTH halves at once — the write dropped AND the gate that
     would have caught it softened — which is exactly how b492's phantom XP
     skill lived four builds behind a `raise notice`. So the pair drops the
     UPDATE and the read-back together, and this guard has to see it with no
     help from the migration's own verification. */
  verify_is_decoration: {
    why: 'the migration writes NOTHING and its own §4 read-back is softened to a notice — the '
       + 'configuration a defect actually survives in. The guard must catch a green apply that '
       + 'left every one of the five rows at the pre-ruling price',
    pairs: [
      [`    update public.hr_goal_rewards g
       set target = r.new_t, gold = r.new_g
     where g.goal_id = r.goal_id
       and (g.target, g.gold) is distinct from (r.new_t::bigint, r.new_g::bigint);`,
       '    -- update dropped'],
      [`  if v_bad is not null then
    raise exception 'VERIFY: the modal-goal retune did not land — %', v_bad;
  end if;`,
       `  if v_bad is not null then
    raise notice 'VERIFY softened: %', v_bad;
  end if;`],
    ],
  },
};

const UUID = () => crypto.randomUUID();

/** A mutation is normally ONE anchored replacement; `pairs` lets one state
    several at once, which some defects genuinely need — see verify_is_decoration. */
const patchesOf = (id) => MUTATIONS[id].pairs || [[MUTATIONS[id].find, MUTATIONS[id].repl]];

/** The migration's own text, LF-normalised the way bootReplay applies it. */
async function migText(mutate) {
  let sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8'))
    .replace(/\r\n/g, '\n');
  if (mutate) {
    for (const [find, repl] of patchesOf(mutate)) {
      const n = sql.split(find).length - 1;
      if (n !== 1) {
        const e = new Error(`mutation ${mutate} anchor matched ${n} times in ${MIG} (need exactly 1) `
          + '— the migration text has moved; fix the anchor rather than letting the mutation no-op.');
        e.harness = true; throw e;
      }
      sql = sql.replace(find, repl);
    }
  }
  return sql;
}

async function run(mutate) {
  const obs = {};
  const mig = await migText(mutate);

  /* ── BOOT A: the PRE-RULING chain, i.e. the shape production is in. ────
     bootReplay applies the WHOLE chain, MIG included, so the migration runs
     here against the reverted authoring files and has real work to do. A
     mutation that breaks the file surfaces as a replay failure, which is a
     CAUGHT mutation — the migration refusing to apply is exactly the outcome a
     fail-closed file is supposed to have. */
  const patches = new Map(PRE_RULING);
  if (mutate) patches.set(MIG, patchesOf(mutate));
  const { db } = await bootReplay({ patches });

  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const asUser = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  const gate = () => q('delete from public.hr_rate_counters');
  const defOf = async (sig) => (await q(
    `select regexp_replace(replace(pg_get_functiondef('${sig}'::regprocedure), chr(13), ''),
            '[[:space:]]+', ' ', 'g') as r`))[0].r;

  // ── T1. THE THREE SURFACES ARE RULED ──────────────────────────────────
  obs.catalogue = Object.fromEntries((await q(
    'select goal_id, target::text t, gold::text g, gems::text m, xp, items '
    + "from public.hr_goal_rewards where goal_id in ('gather_logs','mine_ore','fish','cook','plant',"
    + "'kill_any','kill_more','gold_500')")).map((r) => [r.goal_id, r]));
  obs.rowCount = Number((await q('select count(*)::text c from public.hr_goal_rewards'))[0].c);
  obs.dailyDef = await defOf('public.hr_claim_daily__ungated(text,integer)');
  obs.questDef = await defOf('public.hr_claim_quest__ungated(text,integer)');

  // ── T2/I1. RE-APPLYING IT ON THE TRANSITIONED DATABASE IS A NO-OP ─────
  try {
    await db.exec(`begin;\n${mig}\ncommit;`);
    obs.reapply = 'ok';
  } catch (e) { await db.exec('rollback').catch(() => {}); obs.reapply = String(e.message || e).split('\n')[0]; }
  obs.dailyDefAfter = await defOf('public.hr_claim_daily__ungated(text,integer)');
  obs.catalogueAfter = Object.fromEntries((await q(
    "select goal_id, target::text t, gold::text g from public.hr_goal_rewards "
    + "where goal_id in ('gather_logs','plant')")).map((r) => [r.goal_id, r]));

  // ── T3. A REAL PLAYER IS PAID THE RULED NUMBERS ───────────────────────
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q('insert into auth.users (id, instance_id, aud, role, email) '
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid, 'ggr@probe.invalid']);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await gate();
  await asUser(uid, 'select public.claim_display_name($1) as r', ['GgrProbe']);
  await gate();
  obs.created = await asUser(uid, 'select public.hr_create_character(0) as r');

  const day = (await q('select public.hr_utc_day_key(now()) as r'))[0].r;
  const goldOf = async () => Number((await q(
    'select gold::text g from player_state where user_id=$1 and slot=0', [uid]))[0].g);
  const stampDay = (key, n) => q(
    `insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
     values ($1, 0, 'daily', $2, $3, $4, 'active')
     on conflict (user_id, slot, kind, key, period_key)
       do update set value = excluded.value`, [uid, key, n, day]);
  const stampLifetime = (key, n) => q(
    `insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
     values ($1, 0, 'stat', $2, $3, '', 'active')
     on conflict (user_id, slot, kind, key, period_key)
       do update set value = excluded.value`, [uid, key, n]);

  /* (a) THE MODAL BOARD, BOTH DIRECTIONS OF THE RULING.
     gather_logs went UP (25 -> 60 @ 250 -> 300): 59 must be REFUSED and 60 must
     pay 300. The refusal is the half that proves the TARGET moved — a gold-only
     check would pass just as happily against a target still sitting at 25. */
  await stampDay('ev:chopped', 59);
  await gate();
  obs.logs59 = await asUser(uid, 'select public.hr_claim_goal($1,$2,0,$3) as r', ['gather_logs', false, null]);
  await stampDay('ev:chopped', 60);
  let g0 = await goldOf();
  await gate();
  obs.logs60 = await asUser(uid, 'select public.hr_claim_goal($1,$2,0,$3) as r', ['gather_logs', false, null]);
  obs.logsGold = (await goldOf()) - g0;

  /* plant went DOWN (5 -> 3 @ 200 -> 150). Exactly 3 must now pay, and pay the
     LOWER number — a retune that only ever loosens is not a retune. */
  await stampDay('ev:planted', 3);
  g0 = await goldOf();
  await gate();
  obs.plant3 = await asUser(uid, 'select public.hr_claim_goal($1,$2,0,$3) as r', ['plant', false, null]);
  obs.plantGold = (await goldOf()) - g0;

  /* (b) THE ONBOARDING QUEST. 5 harvests must be refused, 6 must pay. */
  await stampLifetime('ev:harvest', 5);
  await gate();
  obs.farm5 = await asUser(uid, 'select public.hr_claim_quest($1,0) as r', ['farmhand']);
  await stampLifetime('ev:harvest', 6);
  g0 = await goldOf();
  await gate();
  obs.farm6 = await asUser(uid, 'select public.hr_claim_quest($1,0) as r', ['farmhand']);
  obs.farmGold = (await goldOf()) - g0;

  /* (c) THE DAILY TASKS. Today's seeded slate decides which are claimable, so
     claim EVERY creditable task the server offers and grade each against the
     catalogue src/data/goal-catalogue.js authors. That assertion runs on every
     day of the year; `retunedExecuted` records which of the four RETUNED tasks
     this run actually got, so a green result is never mistaken for more
     coverage than it had (the pins in §4 of the migration and in
     tests/kill-daily-credit.mjs K10 are the deterministic half). */
  const offered = (await q(
    'select public.hr_daily_task_set(public.hr_utc_day_key(now())) as r'))[0].r || [];
  obs.offered = offered;
  obs.dailyPaid = {};
  for (const key of ['ev:kill_any', 'ev:gather', 'ev:cooked', 'ev:smithed', 'ev:crafted']) {
    await stampDay(key, 5000);
  }
  for (const task of offered) {
    if (!DAILY_TASK_REWARDS[task]) continue;         // daily_harvest is not creditable
    const before = await goldOf();
    await gate();
    const r = await asUser(uid, 'select public.hr_claim_daily($1,0) as r', [task]);
    obs.dailyPaid[task] = { ok: r?.ok === true, gold: (await goldOf()) - before, said: Number(r?.gold) };
  }
  obs.retunedExecuted = Object.keys(obs.dailyPaid)
    .filter((t) => ['daily_kill', 'daily_kill_big', 'daily_smith', 'daily_craft'].includes(t));

  await db.close?.();

  /* ── BOOT B: the REBUILT database (authoring files as committed). ──────
     Two questions only this boot can answer: is the file a GRADED no-op when
     the chain already installed the ruled numbers (it must run §4 and pass, not
     skip), and does it REFUSE a surface that has drifted underneath it? Drift is
     planted IN THE DATABASE, because that is the only place it ever appears —
     planting it in an authoring file would test a differently-built chain
     instead of a drifted one. */
  const { db: db2 } = await bootReplay(
    mutate ? { patches: new Map([[MIG, patchesOf(mutate)]]) } : {});
  const q2 = async (sql, p) => (await db2.query(sql, p)).rows;
  const apply = async () => {
    try { await db2.exec(`begin;\n${mig}\ncommit;`); return 'ok'; }
    catch (e) { await db2.exec('rollback').catch(() => {}); return String(e.message || e).split('\n')[0]; }
  };

  obs.rebuildNoop = await apply();
  obs.rebuildRows = Object.fromEntries((await q2(
    "select goal_id, target::text t, gold::text g from public.hr_goal_rewards "
    + "where goal_id in ('gather_logs','plant')")).map((r) => [r.goal_id, r]));

  // D1. A DRIFTED CATALOGUE ROW.
  await q2("update public.hr_goal_rewards set gold = 777 where goal_id = 'gather_logs'");
  obs.driftRow = await apply();
  obs.driftRowIntact = Number((await q2(
    "select gold::text g from public.hr_goal_rewards where goal_id = 'gather_logs'"))[0].g);
  await q2("update public.hr_goal_rewards set gold = 300 where goal_id = 'gather_logs'");

  // D2. A DRIFTED DAILY-TASK ARM, re-authored in the installed body itself.
  await q2(`do $x$
    declare v text;
    begin
      select pg_get_functiondef('public.hr_claim_daily__ungated(text,integer)'::regprocedure) into v;
      v := regexp_replace(replace(v, chr(13), ''),
        'when ''daily_kill''[[:space:]]+then v_type := ''kill_any''; v_goal := 25;[[:space:]]+v_gold := 600;',
        'when ''daily_kill'' then v_type := ''kill_any''; v_goal := 25; v_gold := 777;');
      execute v;
    end $x$;`);
  obs.driftDaily = await apply();
  obs.driftDailyIntact = /v_gold := 777;/.test((await q2(
    "select pg_get_functiondef('public.hr_claim_daily__ungated(text,integer)'::regprocedure) as r"))[0].r);

  // D3. A DRIFTED QUEST ARM.
  await q2(`do $x$
    declare v text;
    begin
      select pg_get_functiondef('public.hr_claim_quest__ungated(text,integer)'::regprocedure) into v;
      v := regexp_replace(replace(v, chr(13), ''),
        'when ''farmhand''[[:space:]]+then v_key := ''ev:harvest'';[[:space:]]+v_goal := 6;[[:space:]]+v_gold := 500;',
        'when ''farmhand'' then v_key := ''ev:harvest''; v_goal := 7; v_gold := 500;');
      execute v;
    end $x$;`);
  obs.driftQuest = await apply();

  await db2.close?.();
  return obs;
}

/** Grade one run. Every assertion names the property, not the line. */
function grade(o) {
  const num = (r, f) => (r ? Number(r[f]) : NaN);

  // ── T1. THE TRANSITION LANDED ON ALL THREE SURFACES ───────────────────
  const RULED = { gather_logs: [60, 300], mine_ore: [60, 300], fish: [50, 300],
    cook: [25, 250], plant: [3, 150] };
  for (const [id, [t, g]] of Object.entries(RULED)) {
    ok(num(o.catalogue[id], 't') === t && num(o.catalogue[id], 'g') === g,
      `T1: hr_goal_rewards.'${id}' is ${num(o.catalogue[id], 't')}/${num(o.catalogue[id], 'g')} after `
      + `the migration, expected the ruled ${t}/${g}. The forward migration did not move a row a `
      + 'production database still has at the pre-ruling value.');
  }
  ok(num(o.catalogue.kill_any, 'g') === 200 && num(o.catalogue.kill_more, 'g') === 600,
    'T1: a KILL goal moved. This migration re-prices the daily TASKS, not the modal kill goals, and '
    + 'the reviewed forgery bound is arithmetic over both.');
  ok(JSON.stringify(o.catalogue.gold_500?.items) === JSON.stringify({ small_bones: 5 }),
    "T1: gold_500's items changed. That row is the KNOWN repo⟷prod divergence AND the empty-reward "
    + 'fixture for GATE(e)/C9 — this file must not touch it.');
  ok(o.rowCount === 19, `T1: hr_goal_rewards holds ${o.rowCount} rows, expected 19`);

  for (const [id, cat] of Object.entries(DAILY_TASK_REWARDS)) {
    ok(o.dailyDef.includes(
      `when '${id}' then v_type := '${cat.type}'; v_goal := ${cat.goal}; v_gold := ${cat.gold};`)
      || o.dailyDef.includes(
        `when '${id}' then v_type := '${cat.type}'; v_goal := ${cat.goal}; v_gold := ${cat.gold};`
          .replace(/ /g, ' ')),
      `T1/B: the installed hr_claim_daily__ungated does not price '${id}' at `
      + `${cat.goal}/${cat.gold} — the number src/data/goal-catalogue.js authors and the modal `
      + 'shows. The client would quote one price and the server pay another.');
  }
  ok(!/v_gold := 900;/.test(o.dailyDef) && !/v_gold := 450;/.test(o.dailyDef),
    'T1: a PRE-RULING daily-task price survives in the installed body — the patch moved some arms '
    + 'and not others, which is the silent half-apply this file exists to catch.');
  ok(o.questDef.includes(
    `when 'farmhand' then v_key := '${QUEST_REWARDS.farmhand.checkKey}'; `
    + `v_goal := ${QUEST_REWARDS.farmhand.goal}; v_gold := ${QUEST_REWARDS.farmhand.gold};`),
  `T1/B: the installed hr_claim_quest__ungated does not grade farmhand at `
    + `${QUEST_REWARDS.farmhand.goal} harvests.`);

  // ── I1. RE-APPLY IS A NO-OP ───────────────────────────────────────────
  ok(o.reapply === 'ok',
    `I1: re-applying the migration to a database it had already transitioned RAISED (${o.reapply}). `
    + 'A forward migration that cannot be replayed cannot be safely retried after a network drop '
    + 'mid-apply, and it breaks the rebuild chain.');
  ok(o.dailyDefAfter === o.dailyDef,
    'I1: the second apply CHANGED hr_claim_daily__ungated. It must be a graded no-op.');
  ok(num(o.catalogueAfter.gather_logs, 'g') === 300 && num(o.catalogueAfter.plant, 't') === 3,
    'I1: the second apply moved a catalogue row.');

  ok(o.rebuildNoop === 'ok',
    `I2: on a REBUILT database — where the authoring files already carry the ruled numbers — the `
    + `migration RAISED (${o.rebuildNoop}). It must be a GRADED no-op there, or every replay of the `
    + 'chain (tests/schema-drift.mjs, tests/intent-mismatch.mjs) fails and disaster recovery with it.');
  ok(num(o.rebuildRows.gather_logs, 't') === 60 && num(o.rebuildRows.plant, 'g') === 150,
    'I2: the rebuilt database does not carry the ruled rows — the AUTHORING file edit is missing, so '
    + 'a rebuild would silently restore the pre-ruling economy.');

  // ── D. DRIFT REFUSAL, ON EACH SURFACE ─────────────────────────────────
  ok(/DRIFTED/.test(o.driftRow),
    `D1: a catalogue row re-authored underneath the migration was NOT refused (${o.driftRow}). `
    + 'Overwriting it is how b464\'s live gold_500 hand-patch would be reverted by a re-apply.');
  ok(o.driftRowIntact === 777,
    `D1: the refused apply still WROTE (gather_logs.gold = ${o.driftRowIntact}) — a fail-closed `
    + 'file must leave the drifted row exactly as it found it.');
  ok(/patch blind/.test(o.driftDaily),
    `D2: a daily-task arm re-authored in the installed body was NOT refused (${o.driftDaily}).`);
  ok(o.driftDailyIntact === true,
    'D2: the refused apply still replaced the function body — the third party\'s change is gone.');
  ok(/patch blind/.test(o.driftQuest),
    `D3: a drifted farmhand arm was NOT refused (${o.driftQuest}).`);

  // ── T3. THE PLAYER IS REALLY PAID THE RULED NUMBERS ───────────────────
  ok(o.created?.ok === true, `FIXTURE: hr_create_character refused: ${JSON.stringify(o.created)}`);
  ok(o.logs59?.error === 'not_complete',
    `T3: 59 logs CLAIMED "Gather 60 logs" (${JSON.stringify(o.logs59)}) — the TARGET did not move, `
    + 'only the gold. A gold-only check would have passed this.');
  ok(o.logs60?.ok === true && o.logsGold === 300,
    `T3: 60 logs paid ${o.logsGold} gold (${JSON.stringify(o.logs60)}), expected the ruled 300.`);
  ok(o.plant3?.ok === true && o.plantGold === 150,
    `T3: "Plant 3 crops" paid ${o.plantGold} gold (${JSON.stringify(o.plant3)}), expected the ruled `
    + '150. This is the goal the ruling moved DOWN — a retune that only ever loosens is not one.');
  ok(o.farm5?.error === 'incomplete',
    `T3: 5 harvests completed the farmhand quest (${JSON.stringify(o.farm5)}) — the goal is below `
    + 'the ruled 6.');
  ok(o.farm6?.ok === true && o.farmGold === 500,
    `T3: 6 harvests did not complete farmhand for 500 gold (${JSON.stringify(o.farm6)}, `
    + `+${o.farmGold} g) — the onboarding wall is still at 10.`);

  const paid = Object.entries(o.dailyPaid || {});
  ok(paid.length >= 1,
    `T3: today's slate (${(o.offered || []).join(',')}) offered no creditable daily task, so the `
    + 'daily half of the retune was not exercised at all.');
  for (const [task, r] of paid) {
    const want = DAILY_TASK_REWARDS[task].gold;
    ok(r.ok === true && r.gold === want && r.said === want,
      `T3: daily task '${task}' paid ${r.gold} gold (receipt said ${r.said}), expected the `
      + `catalogued ${want}. The server is paying a different number from the one the client shows.`);
  }
  return o;
}

export async function goalGoldRetuneGuard() {
  problems.length = 0;
  const o = grade(await run());
  const out = [...problems];
  out.coverage = `retune: 3 surfaces transitioned + re-applied clean; drift refused on all three; `
    + `player paid 60-logs@300, plant-3@150, farmhand@6; daily tasks executed `
    + `[${Object.keys(o.dailyPaid || {}).join(',') || 'none offered'}]`
    + `${o.retunedExecuted?.length ? ` (retuned: ${o.retunedExecuted.join(',')})` : ' (no RETUNED task in today\'s slate — pins carry it)'}`;
  return out;
}

// ── main (only when run directly; run-smoke imports the guard above) ─────
const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/goal-gold-retune.mjs');
if (RUN_DIRECTLY) {
  const argv = process.argv.slice(2);
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(26)} ${m.why}`);
    process.exit(0);
  }
  if (argv.includes('--selftest')) {
    let bad = 0;
    for (const id of Object.keys(MUTATIONS)) {
      problems.length = 0;
      let caught = false;
      try { grade(await run(id)); caught = problems.length > 0; }
      catch { caught = true; }      // a mutation that makes the apply fail is also caught
      console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${id}`);
      if (!caught) { bad++; console.log(`         ${MUTATIONS[id].why}`); }
    }
    console.log(bad ? `\n${bad} mutation(s) NOT caught — the guard is blind to them.`
      : `\nall ${Object.keys(MUTATIONS).length} mutations caught.`);
    process.exit(bad ? 1 : 0);
  }
  const mutateArg = argv.find((a) => a.startsWith('--mutate='));
  grade(await run(mutateArg ? mutateArg.split('=')[1] : undefined));
  if (problems.length) {
    console.error(`goal-gold-retune: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(mutateArg ? 0 : 1);
  }
  console.log('goal-gold-retune: green — the pre-ruling database transitions on all three surfaces, '
    + 're-applies as a no-op, refuses a drifted surface, and pays the ruled amounts to a real player.');
  if (mutateArg) { console.error('the mutation was NOT caught'); process.exit(1); }
}
