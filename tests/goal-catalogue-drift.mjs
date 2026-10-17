#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/goal-catalogue-drift.mjs — THE GOAL CATALOGUE BIND (data <-> SQL).
//
// The server credits the DAILY-TASK and QUEST gold payouts from a catalogue of
// goals + rewards that lives in TWO places that must never disagree:
//   (1) src/data/goal-catalogue.js       — the single source
//   (2) [retired 2026-10-17: the old client's QUEST_DEFS / DAILY_TASK_POOL in
//       src/legacy.js, deleted with that client]
//   (3) supabase/migrations/2026-08-20-goal-reward-rpc-credit.sql — what the
//       server CREDITS (the embedded CASE catalogue + the pool-order array).
//       THE QUEST CASE is read at the CHAIN END instead: the LAST file in
//       tests/schema-apply-order.json `order` that creates
//       hr_claim_quest__ungated (2026-09-28-journeymans-road.sql today). Until
//       2026-09-26 it was read from 2026-08-20 only, and a reviewer changed
//       farmhand's gold 500 -> 5000 in the body production actually runs
//       (2026-09-06) in a scratch copy: this guard stayed GREEN. --selftest
//       now plants exactly that and requires RED.
//
// A drift between (2) and (3) means a player is shown "500g" and credited a
// different number; a drift in the pool ORDER means the server's day-keyed
// selection (hr_daily_task_set) offers a different set than the client shows,
// so a legitimate claim is refused not_offered. This guard fails the build on
// either, so neither can happen in silence.
//
// It also enforces the "no gold quest silently loses its payout under arm"
// invariant: EVERY gold-bearing QUEST_DEFS row and EVERY non-harvest
// DAILY_TASK_POOL row MUST be in the catalogue — an authored gold reward the
// server cannot credit would sit deferred forever once gold is armed.
//
// Run standalone:  node tests/goal-catalogue-drift.mjs
//      prove RED:   node tests/goal-catalogue-drift.mjs --selftest
// Also invoked as a guard by tests/run-smoke.mjs.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  QUEST_REWARDS, DAILY_TASK_REWARDS, DAILY_TASK_POOL_ORDER, DAILY_TASK_BASE_COUNT,
  DAILY_TASK_REQUIREMENTS, dailySeed, dailyTaskIndexes, dailyTaskSet, dailyTaskEligible,
} from '../src/data/goal-catalogue.js';
import { utcDayKey } from '../src/core/goals.js';
import { chainEndMigration } from './quest-reward-parity.mjs';

/* The quest body's chain end — see the header. */
export const QUEST_BODY_RE = /create\s+or\s+replace\s+function\s+public\.hr_claim_quest__ungated\b/i;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The day keys the sweeps below run over — two years of real UTC keys, built the
   way src/core/goals.js does. */
function daySweep(n) {
  const out = [];
  for (let d = 0; d < n; d++) out.push(utcDayKey(Date.UTC(2026, 0, 1) + d * 86400000));
  return out;
}

/* `over` exists for --selftest only: {questSql, dailySql} replace the file text
   the guard reads, so a mutation is planted in memory, never on disk. */
export async function goalCatalogueDriftGuard(over = {}) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  // ── (3) the migration SQL — embedded catalogue + pool order ────────────
  const sql = await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-20-goal-reward-rpc-credit.sql'), 'utf8');

  /* Quest CASE arms, read at the CHAIN END (see the header):
     when '<id>' then v_key := '<checkKey>'; v_goal := N; v_gold := M;
     Bound in BOTH directions: every catalogue row has its arm, and every arm
     in the body is a catalogue row (an arm nobody shows is gold the server
     pays for a quest the client never offers). */
  let questSql = over.questSql;
  let questFile = '(override)';
  if (questSql == null) {
    const end = await chainEndMigration(QUEST_BODY_RE);
    ok(!!end, 'CONTROL: no file in schema-apply-order.json `order` creates hr_claim_quest__ungated.');
    questSql = end ? end.sql : '';
    questFile = end ? end.file : '(none)';
  }
  const bodyAt = questSql.search(QUEST_BODY_RE);
  const questBodySql = bodyAt >= 0 ? questSql.slice(bodyAt, questSql.indexOf('end $$;', bodyAt) + 1 || undefined) : '';
  ok(!!questBodySql, `CONTROL: ${questFile} has no hr_claim_quest__ungated body to read.`);
  for (const [id, cat] of Object.entries(QUEST_REWARDS)) {
    const re = new RegExp(`when\\s+'${id}'\\s+then\\s+v_key\\s*:=\\s*'([a-z_:]+)';\\s*v_goal\\s*:=\\s*(\\d+);\\s*v_gold\\s*:=\\s*(\\d+);`);
    const m = questBodySql.match(re);
    ok(!!m, `chain-end SQL (${questFile}) hr_claim_quest is missing/misshapen CASE arm for quest '${id}'.`);
    if (m) {
      ok(m[1] === cat.checkKey, `chain-end SQL quest '${id}' checkKey '${m[1]}' != catalogue '${cat.checkKey}'`);
      ok(Number(m[2]) === cat.goal, `chain-end SQL quest '${id}' goal ${m[2]} != catalogue ${cat.goal}`);
      ok(Number(m[3]) === cat.gold, `chain-end SQL quest '${id}' gold ${m[3]} != catalogue ${cat.gold}`);
    }
  }
  for (const m of questBodySql.matchAll(/when\s+'([a-z0-9_]+)'\s+then\s+v_key/g)) {
    ok(!!QUEST_REWARDS[m[1]], `chain-end SQL (${questFile}) pays quest '${m[1]}', which goal-catalogue.js `
      + 'QUEST_REWARDS does not know — gold for a quest the client never offers.');
  }

  /* Daily CASE arms: when '<id>' then v_type := '<type>'; v_goal := N; v_gold := M;
     read at the CHAIN END — the last file in the apply order that creates
     hr_claim_daily__ungated (2026-10-16-daily-harvest-credit.sql today, which
     made daily_harvest a fixed row) — and bound in BOTH directions, as the
     quest CASE above is. */
  const dailyEnd = over.dailySql != null ? { sql: over.dailySql, file: '(override)' }
    : await chainEndMigration(/create\s+or\s+replace\s+function\s+public\.hr_claim_daily__ungated\b/i);
  ok(!!dailyEnd, 'CONTROL: no file in schema-apply-order.json `order` creates hr_claim_daily__ungated.');
  const dailySql = dailyEnd ? dailyEnd.sql : '';
  for (const m of dailySql.matchAll(/when\s+'([a-z0-9_]+)'\s+then\s+v_type/g)) {
    ok(!!DAILY_TASK_REWARDS[m[1]], `chain-end SQL (${dailyEnd.file}) pays daily '${m[1]}', which `
      + 'DAILY_TASK_REWARDS does not know.');
  }
  for (const [id, cat] of Object.entries(DAILY_TASK_REWARDS)) {
    const re = new RegExp(`when\\s+'${id}'\\s+then\\s+v_type\\s*:=\\s*'([a-z_]+)';\\s*v_goal\\s*:=\\s*(\\d+);\\s*v_gold\\s*:=\\s*(\\d+);`);
    const m = dailySql.match(re);
    ok(!!m, `SQL hr_claim_daily is missing/misshapen CASE arm for task '${id}'.`);
    if (m) {
      ok(m[1] === cat.type, `SQL daily '${id}' type '${m[1]}' != catalogue '${cat.type}'`);
      ok(Number(m[2]) === cat.goal, `SQL daily '${id}' goal ${m[2]} != catalogue ${cat.goal}`);
      ok(Number(m[3]) === cat.gold, `SQL daily '${id}' gold ${m[3]} != catalogue ${cat.gold}`);
    }
  }

  /* ── (3-BIS) THE SECOND COPY OF THE CASE CATALOGUE (b497) ────────────────
     hr_claim_daily__ungated is RESTATED in 2026-08-29-daily-task-eligibility.sql
     §4, and that restatement — not the 2026-08-20 original — is the body a
     rebuild installs, because it runs LATER in the apply order. Until b497 this
     guard read only the ORIGINAL, so the two SQL copies could disagree and the
     one that actually runs was the unchecked one. That is the same
     two-copies-nothing-compares shape the whole file exists to prevent, one
     layer down. Both are bound now, to the same catalogue. */
  {
    const elig4 = await readFile(
      join(ROOT, 'supabase', 'migrations', '2026-08-29-daily-task-eligibility.sql'), 'utf8');
    for (const [id, cat] of Object.entries(DAILY_TASK_REWARDS)) {
      if (id === 'daily_harvest') continue;   // fixed only since 2026-10-16: graded at the chain end above
      const re = new RegExp(`when\\s+'${id}'\\s+then\\s+v_type\\s*:=\\s*'([a-z_]+)';\\s*v_goal\\s*:=\\s*(\\d+);\\s*v_gold\\s*:=\\s*(\\d+);`);
      const m = elig4.match(re);
      ok(!!m, `2026-08-29-daily-task-eligibility.sql RESTATES hr_claim_daily__ungated but has no `
        + `CASE arm for task '${id}'. That restatement is what a REBUILD installs (it runs later), `
        + 'so a missing arm there is a task the rebuilt server refuses.');
      if (m) {
        ok(m[1] === cat.type, `eligibility-SQL daily '${id}' type '${m[1]}' != catalogue '${cat.type}'`);
        ok(Number(m[2]) === cat.goal, `eligibility-SQL daily '${id}' goal ${m[2]} != catalogue ${cat.goal} `
          + '— the RESTATED body is the one a rebuild installs, so this is the number that would run.');
        ok(Number(m[3]) === cat.gold, `eligibility-SQL daily '${id}' gold ${m[3]} != catalogue ${cat.gold} `
          + '— the RESTATED body is the one a rebuild installs, so this is the number that would pay.');
      }
    }
  }

  /* ── (3-TER) THE PRODUCTION FORWARD MIGRATION (b497) ─────────────────────
     Editing an authoring file makes a REBUILD correct; it does nothing to a
     database that already has the old body installed. The forward migration is
     the only thing that moves PRODUCTION, so it has to name the same numbers —
     otherwise the repo, the rebuild and the live server hold three answers and
     the two that are checked are the two that do not matter. */
  {
    const fwd = await readFile(
      join(ROOT, 'supabase', 'migrations', '2026-09-04-goal-gold-retune.sql'), 'utf8');
    for (const [id, cat] of Object.entries(DAILY_TASK_REWARDS)) {
      // Only the RETUNED arms appear in the forward file; an untouched task
      // legitimately has no line there.
      if (!new RegExp(`when ''${id}''`).test(fwd)) continue;
      const re = new RegExp(`'when ''${id}'' then v_type := ''${cat.type}''; v_goal := ${cat.goal}; v_gold := ${cat.gold};'`);
      ok(re.test(fwd), `2026-09-04-goal-gold-retune.sql patches daily task '${id}' but its ruled `
        + `replacement is not "${cat.type}/${cat.goal}/${cat.gold}" — the number applied to `
        + 'PRODUCTION would differ from the one the client shows and a rebuild installs.');
    }
    const fq = QUEST_REWARDS.farmhand;
    ok(new RegExp(`'when ''farmhand'' then v_key := ''${fq.checkKey}''; v_goal := ${fq.goal}; v_gold := ${fq.gold};'`).test(fwd),
      `2026-09-04-goal-gold-retune.sql's ruled farmhand arm is not ${fq.checkKey}/${fq.goal}/${fq.gold} `
      + '— production would grade the onboarding quest against a different goal than the client shows.');
  }

  // The SQL pool array must equal DAILY_TASK_POOL_ORDER (the shuffle index space).
  const poolM = sql.match(/c_pool\s+constant\s+text\[\]\s*:=\s*array\[([^\]]+)\]/);
  ok(!!poolM, 'SQL hr_daily_task_set c_pool array not found.');
  if (poolM) {
    const sqlPool = [...poolM[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    ok(sqlPool.length === DAILY_TASK_POOL_ORDER.length && sqlPool.every((id, i) => id === DAILY_TASK_POOL_ORDER[i]),
      `SQL c_pool [${sqlPool.join(',')}] != DAILY_TASK_POOL_ORDER [${DAILY_TASK_POOL_ORDER.join(',')}].`);
  }
  // The FNV/LCG constants must be the JS ones (guards a silent re-tuning of the port).
  ok(/2166136261/.test(sql) && /16777619/.test(sql) && /4294967295/.test(sql),
    'SQL hr_goal_daily_seed is missing an FNV-1a constant (0x811c9dc5=2166136261, 0x01000193=16777619, mask=4294967295).');
  ok(/1664525/.test(sql) && /1013904223/.test(sql), 'SQL hr_daily_task_set is missing an LCG constant.');

  // ── (3b) DAILY-TASK ELIGIBILITY (P0, 2026-08-23) ────────────────────────
  // The shuffle is now filtered by what the player can actually DO, on both
  // sides, from ONE authored rule. Four binds, each guarding a different way the
  // two could part company.
  {
    const elig = await readFile(
      join(ROOT, 'supabase', 'migrations', '2026-08-29-daily-task-eligibility.sql'), 'utf8');

    // (i) The requirement TABLE ⟷ the SQL predicate's CASE arms.
    for (const [id, req] of Object.entries(DAILY_TASK_REQUIREMENTS)) {
      const arm = new RegExp(
        `when\\s+'${id}'\\s+then\\s+\\(coalesce\\(p_(\\w+),\\s*0\\)\\s*>\\s*0\\s+or\\s+coalesce\\(p_(\\w+)_xp,\\s*0\\)\\s*>\\s*0\\)`);
      const m = elig.match(arm);
      ok(!!m, `SQL hr_daily_task_eligible has no CASE arm for '${id}' — the client would filter it `
        + 'and the server would not, so a back-filled task is claimable but a bench task is offered.');
      if (m) {
        ok(m[1] === req.room, `SQL '${id}' gates on room p_${m[1]} but the catalogue says '${req.room}'`);
        ok(m[2] === req.skill, `SQL '${id}' gates on skill p_${m[2]}_xp but the catalogue says '${req.skill}'`);
      }
      ok(DAILY_TASK_POOL_ORDER.includes(id),
        `DAILY_TASK_REQUIREMENTS names '${id}', which is not in the pool — a requirement on a task `
        + 'nobody is offered is dead code that will be trusted by the next reader.');
    }
    // …and NOTHING gated in SQL that the catalogue does not know about.
    for (const m of elig.matchAll(/when\s+'(daily_[a-z_]+)'\s+then\s+\(coalesce/g)) {
      ok(!!DAILY_TASK_REQUIREMENTS[m[1]],
        `SQL gates '${m[1]}' but src/data/goal-catalogue.js DAILY_TASK_REQUIREMENTS does not — the `
        + 'server would offer a smaller set than the client, refusing legitimate claims.');
    }

    // (ii) The SQL pool array (a SECOND copy of the index space) still matches.
    const poolM = elig.match(/c_pool\s+constant\s+text\[\]\s*:=\s*array\[([^\]]+)\]/);
    ok(!!poolM, 'SQL hr_daily_task_set_caps c_pool array not found.');
    if (poolM) {
      const p = [...poolM[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
      ok(p.length === DAILY_TASK_POOL_ORDER.length && p.every((id, i) => id === DAILY_TASK_POOL_ORDER[i]),
        `eligibility SQL c_pool [${p.join(',')}] != DAILY_TASK_POOL_ORDER.`);
    }

    // (ii-b) THE INSTALLED SHUFFLE is the 6-arg form (2026-10-16-daily-harvest-
    //        eligibility.sql): its pool is the same index space, the harvest gate
    //        stands in BOTH passes, the offered set reads it, and the JS twin
    //        gates the same row. tests/daily-harvest-eligibility.mjs runs both.
    {
      const hv = await readFile(
        join(ROOT, 'supabase', 'migrations', '2026-10-16-daily-harvest-eligibility.sql'), 'utf8');
      const p6 = hv.match(/c_pool\s+constant\s+text\[\]\s*:=\s*array\[([^\]]+)\]/);
      const ids = p6 ? [...p6[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
      ok(ids.length === DAILY_TASK_POOL_ORDER.length && ids.every((id, i) => id === DAILY_TASK_POOL_ORDER[i]),
        `harvest-eligibility SQL c_pool [${ids.join(',')}] != DAILY_TASK_POOL_ORDER.`);
      ok((hv.match(/v_id <> 'daily_harvest' or coalesce\(p_harvest, false\)/g) || []).length === 2,
        'the 6-arg hr_daily_task_set_caps must skip daily_harvest in pass 1 AND the back-fill.');
      ok(/public\.hr_daily_harvest_ready\(p_day_key, p_user, p_slot\)\);/.test(hv),
        'hr_daily_task_set_for must pass hr_daily_harvest_ready — the offer would ignore the gate.');
      ok(/drop function if exists public\.hr_daily_task_set_caps\(text, bigint, bigint, bigint, bigint\);/.test(hv),
        'the ungated 5-arg shuffle must be dropped.');
      ok(!dailyTaskEligible('daily_harvest', { rooms: {}, skillXp: {} })
         && dailyTaskEligible('daily_harvest', { farm: { plots: 2, plantable: true } }),
        'goal-catalogue dailyTaskEligible must gate daily_harvest on caps.farm (no seeds -> out, seeds + plot -> in).');
    }

    // (iii) The CLAIM GATE is the UNION. Narrowing it to the eligible set would
    //       refuse a legitimate claim from a client whose room ownership the
    //       server cannot yet see (rooms record is dormant; production holds ZERO
    //       room unlock rows). Guarded here because it is the one property a
    //       future "tidy-up" is most likely to remove as redundant.
    ok(/v_set\s*:=\s*public\.hr_daily_task_set\(v_day\)/.test(elig)
       && /v_elig\s*:=\s*public\.hr_daily_task_set_for\(v_day/.test(elig)
       && /not \(p_task_id = any \(v_set\)\) and not \(p_task_id = any \(v_elig\)\)/.test(elig),
      'The restated hr_claim_daily__ungated must accept the UNION of the raw base set and the '
      + 'eligible set. See the migration header.');

  }

  // ── (3c) the 2026-08-23 incident draw, pinned on the module's shuffle ──
  ok(dailyTaskIndexes('2026-8-23').slice(0, 3).map((i) => DAILY_TASK_POOL_ORDER[i]).join(',')
     === 'daily_gather,daily_craft,daily_smith',
    'CONTROL: the 2026-08-23 incident draw changed, so the fixture the eligibility fix was '
    + 'derived from no longer reproduces. Re-derive the pins in the migration\'s GATE(a).');

  // ── (3d) The eligibility CONTRACT, swept ───────────────────────────────
  {
    const FRESH = { rooms: {}, skillXp: {} };
    const FULL = { rooms: { workshop: 1, forge: 1 }, skillXp: {},
      farm: { plots: 2, plantable: true, growing: 0, today: 0 } };
    let shortSlate = 0; let bench = 0; let notIdentity = 0;
    for (const k of daySweep(730)) {
      const fresh = dailyTaskSet(k, FRESH);
      if (fresh.length !== DAILY_TASK_BASE_COUNT) shortSlate++;
      if (fresh.includes('daily_craft') || fresh.includes('daily_smith')) bench++;
      const full = dailyTaskSet(k, FULL).join(',');
      const raw = dailyTaskIndexes(k).slice(0, DAILY_TASK_BASE_COUNT)
        .map((i) => DAILY_TASK_POOL_ORDER[i]).join(',');
      if (full !== raw) notIdentity++;
    }
    ok(shortSlate === 0, `${shortSlate} of 730 days hand a fresh account a SHORT slate — the `
      + 'back-fill is not filling.');
    ok(bench === 0, `${bench} of 730 days still deal a level-1 account a bench task — the P0 is open.`);
    ok(notIdentity === 0, `${notIdentity} of 730 days change what a FULLY UNLOCKED account is `
      + 'offered. The filter must be the identity there, or it is a balance change, not a fix.');
    ok(dailyTaskEligible('daily_craft', { rooms: {}, skillXp: { crafting: 1 } }),
      'The skill-XP arm of the predicate does not fire — a player who has used the bench would be '
      + 'locked out server-side, where the room ladder is not yet known.');
    ok(!dailyTaskEligible('daily_craft', null) && !dailyTaskEligible('daily_smith', undefined),
      'A MISSING caps object must mean "nothing unlocked" (fail closed) — the cost of the other '
      + 'direction is the padlock this fix exists to remove.');
    ok(dailySeed('2026-8-23') === dailySeed('2026-8-23') && typeof dailySeed('x') === 'number',
      'CONTROL: goal-catalogue dailySeed is not deterministic.');
  }

  // ── (1) the day key: goals.js utcDayKey is the no-zero-pad UTC key public.hr_utc_day_key builds ──
  // Parity sample: goals.js utcDayKey over a sweep is the string dailySeed feeds.
  for (const ms of [Date.UTC(2026, 7, 20, 3), Date.UTC(2026, 0, 1, 23), Date.UTC(2025, 11, 31, 12)]) {
    const k = utcDayKey(ms);
    ok(/^\d{4}-\d{1,2}-\d{1,2}$/.test(k) && !/-0\d/.test(k), `goals.js utcDayKey produced a padded/odd key: ${k}`);
    ok(typeof dailySeed(k) === 'number', `dailySeed('${k}') did not produce a number`);
  }

  return problems;
}

/* ── --selftest ───────────────────────────────────────────────────────────
   Each mutation plants ONE defect in an in-memory copy of the
   chain-end quest SQL; each must turn the guard RED. The base run must be clean
   first, and a mutation whose anchor matched nothing is itself a failure. */
const MUTATIONS = [
  { name: "chain-end DAILY gold drift (daily_harvest 300 -> 3000)",
    apply: (b) => ({ dailySql: b.dailySql.replace(
      "v_type := 'harvest';  v_goal := 6;   v_gold := 300;", "v_type := 'harvest';  v_goal := 6;   v_gold := 3000;") }) },
  { name: 'chain-end gold drift (road_hunt 1500 -> 1501)',
    apply: (b) => ({ questSql: b.questSql.replace(
      "when 'road_hunt' then v_key := 'ev:kill_any'; v_goal := 500; v_gold := 1500;",
      "when 'road_hunt' then v_key := 'ev:kill_any'; v_goal := 500; v_gold := 1501;") }) },
  { name: 'chain-end arm missing (road_cook deleted from the CASE)',
    apply: (b) => ({ questSql: b.questSql.replace(
      "    when 'road_cook' then v_key := 'ev:cooked'; v_goal := 60; v_gold := 600;\n", '') }) },
  { name: 'chain-end checkKey drift (road_forge grades ev:crafted)',
    apply: (b) => ({ questSql: b.questSql.replace(
      "when 'road_forge' then v_key := 'ev:smithed';", "when 'road_forge' then v_key := 'ev:crafted';") }) },
  { name: 'chain-end farmhand gold 500 -> 5000 (the reviewer\'s scratch-copy finding; GREEN before 2026-09-26)',
    apply: (b) => ({ questSql: b.questSql.replace(
      "    when 'farmhand'    then v_key := 'ev:harvest';  v_goal := 6;  v_gold := 500;\n    -- Journeyman",
      "    when 'farmhand'    then v_key := 'ev:harvest';  v_goal := 6;  v_gold := 5000;\n    -- Journeyman") }) },
  { name: 'chain-end hundred_kills goal drift (100 -> 10: the XP pays at a tenth of the work)',
    apply: (b) => ({ questSql: b.questSql.replace(
      "when 'hundred_kills' then v_key := 'ev:kill_any'; v_goal := 100; v_gold := 0;",
      "when 'hundred_kills' then v_key := 'ev:kill_any'; v_goal := 10; v_gold := 0;") }) },
  { name: 'chain-end pays a quest the catalogue does not know',
    apply: (b) => ({ questSql: b.questSql.replace(
      "    when 'road_hunt' then",
      "    when 'road_extra' then v_key := 'ev:gather'; v_goal := 1; v_gold := 9999;\n    when 'road_hunt' then") }) },
];

async function selftest() {
  const end = await chainEndMigration(QUEST_BODY_RE);
  if (!end) { console.log('  x CONTROL: no chain-end quest body.'); return 2; }
  console.log(`  chain-end quest body: ${end.file}`);
  const dEnd = await chainEndMigration(/create\s+or\s+replace\s+function\s+public\.hr_claim_daily__ungated\b/i);
  const base = { questSql: end.sql, dailySql: dEnd ? dEnd.sql : '' };
  const clean = await goalCatalogueDriftGuard(base);
  if (clean.length) {
    for (const x of clean) console.log(`  x ${x}`);
    console.log('\nBASE RUN IS RED — a mutation proof on a red tree proves nothing.');
    return 1;
  }
  console.log('  ok  base run is clean');
  let missed = 0;
  for (const m of MUTATIONS) {
    const over = { ...base, ...m.apply(base) };
    if (over.questSql === base.questSql && over.dailySql === base.dailySql) {
      console.log(`  x "${m.name}" changed NOTHING — its anchor moved, it proves nothing.`); missed++; continue;
    }
    const found = await goalCatalogueDriftGuard(over);
    if (found.length) console.log(`  ok  RED: ${m.name}\n        -> ${found[0].slice(0, 150)}`);
    else { console.log(`  x MISSED (stayed GREEN): ${m.name}`); missed++; }
  }
  console.log(missed ? `\n${missed} mutation(s) uncaught.` : `\nall ${MUTATIONS.length} mutations RED.`);
  return missed ? 1 : 0;
}

// Standalone
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('goal-catalogue-drift.mjs')) {
  if (process.argv.includes('--selftest') || process.argv.includes('--mutate')) {
    selftest().then((code) => process.exit(code));
  } else {
    goalCatalogueDriftGuard().then((p) => {
      if (p.length) { console.log('goal-catalogue-drift — FAILED:'); for (const x of p) console.log(`  ✗ ${x}`); process.exit(1); }
      console.log('goal-catalogue-drift — the catalogue and the migration SQL agree.');
    });
  }
}
