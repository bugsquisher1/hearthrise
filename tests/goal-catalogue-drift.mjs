#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/goal-catalogue-drift.mjs — THE THREE-WAY GOAL CATALOGUE BIND.
//
// The server credits QUEST gold payouts and deals THE DAILY BOARD from data that
// lives in THREE places that must never disagree:
//   (1) src/data/goal-catalogue.js       — the single source
//   (2) src/legacy.js QUEST_DEFS / DAILY_GOAL_POOL / WEEKLY_GOAL_POOL — what the
//       player SEES
//   (3) the migration SQL — the QUEST CASE at the CHAIN END (the LAST file in
//       tests/schema-apply-order.json `order` that creates
//       hr_claim_quest__ungated; a reviewer once moved farmhand 500 -> 5000 in a
//       scratch copy of the body production runs and an older reader stayed
//       GREEN — --selftest plants exactly that), and hr_goal_board's pools and
//       pinned vectors at the chain end of 2026-10-11-daily-board.sql.
//
// A drift between (2) and (3) means a player is shown "500g" and credited a
// different number, or is shown a board goal the server refuses not_offered.
// Daily Tasks are RETIRED (lane daily-board): the guard also holds that no
// DAILY_TASK_POOL, task claim or hr_claim_daily grant comes back.
//
// Run standalone:  node tests/goal-catalogue-drift.mjs
//      prove RED:   node tests/goal-catalogue-drift.mjs --selftest
// Also invoked as a guard by tests/run-smoke.mjs.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  QUEST_REWARDS, BOARD_UNDEALT, DAILY_BOARD_POOL, WEEKLY_BOARD_POOL, boardAt, pickBoard,
} from '../src/data/goal-catalogue.js';
/* The depth-aware QUEST_DEFS row splitter. One implementation, imported rather
   than copied — see the note at the QUEST_DEFS loop for what the copy cost. */
import { splitTopLevelObjects, stripComments, chainEndMigration } from './quest-reward-parity.mjs';

/* The quest body's chain end — see the header. */
export const QUEST_BODY_RE = /create\s+or\s+replace\s+function\s+public\.hr_claim_quest__ungated\b/i;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The chain-end file that creates hr_goal_board. */
export const BOARD_BODY_RE = /create\s+or\s+replace\s+function\s+public\.hr_goal_board\b/i;

/* The ids (and `blocked` ids) of a legacy pool literal, in authored order. */
function poolIds(legacy, decl) {
  const at = legacy.indexOf(decl);
  if (at < 0) return null;
  const open = legacy.indexOf('[', at);
  let depth = 0;
  for (let i = open; i < legacy.length; i++) {
    if (legacy[i] === '[') depth++;
    else if (legacy[i] === ']' && --depth === 0) {
      const rows = legacy.slice(open, i + 1).split(/(?=\{id:')/).slice(1);
      const idOf = (r) => (r.match(/^\{id:'([a-z0-9_]+)'/) || [])[1];
      return { ids: rows.map(idOf), blocked: rows.filter((r) => /\bblocked:/.test(r)).map(idOf) };
    }
  }
  return null;
}

/* `over` exists for --selftest only: {legacy, questSql, boardSql} replace the
   file text the guard reads, so a mutation is planted in memory, never on disk. */
export async function goalCatalogueDriftGuard(over = {}) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  // ── (2) legacy.js authored rows ────────────────────────────────────────
  const legacy = over.legacy ?? await readFile(join(ROOT, 'src', 'legacy.js'), 'utf8');
  const block = (name) => {
    const at = legacy.indexOf(`const ${name}=`);
    if (at < 0) return null;
    const open = legacy.indexOf('[', at);
    let depth = 0;
    for (let i = open; i < legacy.length; i++) {
      if (legacy[i] === '[') depth++;
      else if (legacy[i] === ']' && --depth === 0) return legacy.slice(open, i + 1);
    }
    return null;
  };

  // QUEST_DEFS: every row with a gold reward must be in QUEST_REWARDS (goal+gold).
  const questBody = block('QUEST_DEFS');
  ok(!!questBody, 'CONTROL: QUEST_DEFS could not be located in legacy.js — the authored side is unreadable.');
  if (questBody) {
    /* ⚠ THIS LOOP WAS INERT UNTIL 2026-09-06. It split rows on `\{[^{}]*\}`,
       which cannot match a quest row because every row CONTAINS a nested
       `reward:{…}` — so it returned the six REWARD objects instead, none of
       which carries an `id:`, and `continue`d on all six. Not one quest was
       ever checked; the `rows.length >= 5` control passed on the reward objects
       and hid it. Found by tests/quest-reward-parity.mjs, which had to parse the
       same block and could not reproduce the row count. The depth-aware splitter
       lives there (one implementation, imported) and strips comments first,
       because QUEST_DEFS' prose contains braces of its own. */
    const rows = splitTopLevelObjects(stripComments(questBody));
    ok(rows.length >= 5, `CONTROL: QUEST_DEFS yielded ${rows.length} rows, expected >= 5`);
    for (const row of rows) {
      const id = (row.match(/id:\s*'([a-z_]+)'/) || [])[1];
      const goldM = row.match(/reward:\s*\{[^}]*\bgold:\s*(\d+)/);
      const gold = goldM ? Number(goldM[1]) : 0;
      if (!id) continue;
      if (gold > 0) {
        const cat = QUEST_REWARDS[id];
        ok(!!cat, `QUEST_DEFS row '${id}' has a gold reward (${gold}) but is ABSENT from `
          + 'goal-catalogue.js QUEST_REWARDS — the server cannot credit it, so it would sit deferred '
          + 'forever once gold is armed. Add it here AND to the SQL CASE, or make it non-gold.');
        if (cat) ok(cat.gold === gold, `QUEST_DEFS '${id}' gold=${gold} != catalogue ${cat.gold}`);
        const goalM = row.match(/goal:\s*(\d+)/);
        if (cat && goalM) ok(cat.goal === Number(goalM[1]),
          `QUEST_DEFS '${id}' goal=${goalM[1]} != catalogue ${cat.goal}`);
      } else if (/reward:\s*\{[^}]*\bcombatXp:\s*\d+/.test(row)) {
        /* 2026-10-10-quest-combat-xp.sql: a combat-XP quest (hundred_kills) is
           SERVER-paid. It must be catalogued with the same goal and XP, or the
           client would fall back to its own addXp — a client-reported XP mint. */
        const cat = QUEST_REWARDS[id];
        const xp = Number(row.match(/\bcombatXp:\s*(\d+)/)[1]);
        ok(!!cat && cat.combatXp === xp && cat.gold === 0,
          `QUEST_DEFS '${id}' pays ${xp} combat XP but QUEST_REWARDS does not carry {gold:0, combatXp:${xp}} `
          + '— the server cannot pay it, so the client would author the XP.');
        const goalM = row.match(/goal:\s*(\d+)/);
        if (cat && goalM) ok(cat.goal === Number(goalM[1]), `QUEST_DEFS '${id}' goal=${goalM[1]} != catalogue ${cat.goal}`);
      } else {
        // A quest the server pays nothing for must NOT be in the catalogue.
        ok(!QUEST_REWARDS[id], `QUEST_DEFS '${id}' has no gold or combat-XP reward but IS in QUEST_REWARDS — `
          + 'a quest with nothing to pay never fires a claim; remove it from the catalogue.');
      }
    }
  }

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
      /* The combat-XP literal is bound too, both ways: an arm that pays XP the
         catalogue does not name is a server mint nobody shows. */
      const xm = questBodySql.match(new RegExp(`when\\s+'${id}'\\s+then[^\\n]*?v_cxp\\s*:=\\s*(\\d+);`));
      ok((xm ? Number(xm[1]) : 0) === (cat.combatXp || 0),
        `chain-end SQL quest '${id}' combat XP ${xm ? xm[1] : 0} != catalogue ${cat.combatXp || 0}`);
    }
  }
  for (const m of questBodySql.matchAll(/when\s+'([a-z0-9_]+)'\s+then\s+v_key/g)) {
    ok(!!QUEST_REWARDS[m[1]], `chain-end SQL (${questFile}) pays quest '${m[1]}', which goal-catalogue.js `
      + 'QUEST_REWARDS does not know — gold for a quest the client never offers.');
  }

  // ── (3') THE FORWARD MIGRATION'S farmhand arm (b497) ─────────────────────
  {
    const fwd = await readFile(join(ROOT, 'supabase', 'migrations', '2026-09-04-goal-gold-retune.sql'), 'utf8');
    const fq = QUEST_REWARDS.farmhand;
    ok(new RegExp(`'when ''farmhand'' then v_key := ''${fq.checkKey}''; v_goal := ${fq.goal}; v_gold := ${fq.gold};'`).test(fwd),
      `2026-09-04-goal-gold-retune.sql's ruled farmhand arm is not ${fq.checkKey}/${fq.goal}/${fq.gold} `
      + '— production would grade the onboarding quest against a different goal than the client shows.');
  }

  // ── (4) THE DAILY BOARD — legacy pools ⟷ catalogue ⟷ SQL ────────────────
  {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const daily = poolIds(legacy, 'var DAILY_GOAL_POOL = [');
    const weekly = poolIds(legacy, 'window.WEEKLY_GOAL_POOL = window.WEEKLY_GOAL_POOL || [');
    ok(!!daily && !!weekly, 'CONTROL: DAILY_GOAL_POOL / WEEKLY_GOAL_POOL could not be located in legacy.js.');
    if (daily) ok(same(daily.ids, [...DAILY_BOARD_POOL]), `legacy DAILY_GOAL_POOL order [${daily.ids}] != `
      + `DAILY_BOARD_POOL [${DAILY_BOARD_POOL}] — the board would index a different goal than the row shown.`);
    if (weekly) {
      ok(same(weekly.ids, [...WEEKLY_BOARD_POOL]), `legacy WEEKLY_GOAL_POOL order [${weekly.ids}] != WEEKLY_BOARD_POOL.`);
      ok(same([...weekly.blocked].sort(), [...BOARD_UNDEALT].sort()), `legacy blocked rows [${weekly.blocked}] != `
        + `BOARD_UNDEALT [${BOARD_UNDEALT}] — a row the client marks undealt must be undealt on the board too.`);
    }
    ok(/GC\.pickBoard\(GC\.boardDayKey\(now\), GC\.DAILY_BOARD_POOL\)/.test(legacy)
       && /GC\.pickBoard\(GC\.boardWeekKey\(now\), GC\.WEEKLY_BOARD_POOL\)/.test(legacy),
      'legacy.js goalBoardIds does not deal through goalCatalogue.pickBoard — a second picker would drift.');
    ok(!/9301/.test(legacy), 'legacy.js still carries its own 9301/49297 LCG — the board must have one picker.');

    let boardSql = over.boardSql;
    let boardFile = '(override)';
    if (boardSql == null) {
      const end = await chainEndMigration(BOARD_BODY_RE);
      ok(!!end, 'CONTROL: no file in schema-apply-order.json `order` creates hr_goal_board.');
      boardSql = end ? end.sql : '';
      boardFile = end ? end.file : '(none)';
    }
    const arr = (name) => {
      const m = boardSql.match(new RegExp(`${name}\\s+constant\\s+text\\[\\]\\s*:=\\s*array\\[([^\\]]+)\\]`));
      return m ? [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]) : null;
    };
    ok(same(arr('c_daily'), [...DAILY_BOARD_POOL]), `${boardFile} hr_goal_board c_daily != DAILY_BOARD_POOL.`);
    ok(same(arr('c_weekly'), [...WEEKLY_BOARD_POOL]), `${boardFile} hr_goal_board c_weekly != WEEKLY_BOARD_POOL.`);
    const pins = [...boardSql.matchAll(/hr_goal_board\((true|false),\s*timestamptz '([^']+)'\) is distinct from array\[([^\]]+)\]/g)];
    ok(pins.length >= 6, `CONTROL: ${boardFile} pins ${pins.length} board vectors, expected >= 6.`);
    for (const m of pins) {
      const want = [...m[3].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
      const got = boardAt(Date.parse(m[2].replace(' ', 'T').replace('+00', 'Z')))[m[1] === 'true' ? 'weekly' : 'daily'];
      ok(same(got, want), `${boardFile} pins the ${m[1] === 'true' ? 'weekly' : 'daily'} board at ${m[2]} as [${want}] `
        + `but goal-catalogue.js boardAt deals [${got}] — the server would refuse the goals the client shows.`);
    }
    const seed = (await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-23-modal-goal-claims.sql'), 'utf8'))
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
    const at = seed.indexOf('insert into public.hr_goal_rewards');
    const rows = [...seed.slice(at, seed.indexOf(';', at)).matchAll(/\('([a-z0-9_]+)',\s+(true|false),/g)];
    const cd = rows.filter((r) => r[2] === 'false').map((r) => r[1]).sort();
    const cw = rows.filter((r) => r[2] === 'true').map((r) => r[1]).sort();
    ok(same(cd, [...DAILY_BOARD_POOL].sort()), `hr_goal_rewards daily rows [${cd}] != DAILY_BOARD_POOL.`);
    ok(same(cw, WEEKLY_BOARD_POOL.filter((id) => !BOARD_UNDEALT.includes(id)).sort()),
      `hr_goal_rewards weekly rows [${cw}] != WEEKLY_BOARD_POOL minus BOARD_UNDEALT.`);
    let drift = 0;
    for (const n of [DAILY_BOARD_POOL.length, WEEKLY_BOARD_POOL.length]) {
      for (let sd = 0; sd < 233280; sd++) if (Math.floor((sd / 233280) * n) !== Math.floor(sd * n / 233280)) drift++;
    }
    ok(drift === 0, `${drift} seeds index differently in the integer picker — the server board would not be the live client's.`);
    ok(pickBoard(20261011, DAILY_BOARD_POOL).length === 3, 'CONTROL: pickBoard did not deal three.');
  }

  // ── (5) DAILY TASKS STAY RETIRED ──────────────────────────────────────────
  {
    ok(!/DAILY_TASK_POOL\s*=/.test(legacy) && !/claimDaily\(/.test(legacy),
      'legacy.js authors a daily-task slate or claims one again — the board is the one daily.');
    const retire = await readFile(join(ROOT, 'supabase', 'migrations', '2026-10-12-retire-daily-tasks.sql'), 'utf8');
    ok(/revoke execute on function public\.hr_claim_daily\(text, int\) from public, anon, authenticated, service_role;/.test(retire),
      '2026-10-12-retire-daily-tasks.sql no longer revokes hr_claim_daily from authenticated.');
  }

  return problems;
}

/* ── --selftest ───────────────────────────────────────────────────────────
   Each mutation plants ONE defect in an in-memory copy of legacy.js or the
   chain-end quest SQL; each must turn the guard RED. The base run must be clean
   first, and a mutation whose anchor matched nothing is itself a failure. */
const MUTATIONS = [
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
  { name: 'legacy gold drift (road_gather shows 1200, the server pays 1000)',
    apply: (b) => ({ legacy: b.legacy.replace("reward:{gold:1000},", "reward:{gold:1200},") }) },
  { name: 'chain-end farmhand gold 500 -> 5000 (the reviewer\'s scratch-copy finding; GREEN before 2026-09-26)',
    apply: (b) => ({ questSql: b.questSql.replace(
      "    when 'farmhand'    then v_key := 'ev:harvest';  v_goal := 6;  v_gold := 500;\n    -- Journeyman",
      "    when 'farmhand'    then v_key := 'ev:harvest';  v_goal := 6;  v_gold := 5000;\n    -- Journeyman") }) },
  { name: 'chain-end pays a quest the catalogue does not know',
    apply: (b) => ({ questSql: b.questSql.replace(
      "    when 'road_hunt' then",
      "    when 'road_extra' then v_key := 'ev:gather'; v_goal := 1; v_gold := 9999;\n    when 'road_hunt' then") }) },
];

MUTATIONS.push(
  { name: 'legacy daily pool reordered (a renamed row)',
    apply: (b) => ({ legacy: b.legacy.replace("{id:'mine_ore',", "{id:'mine_orf',") }) },
  { name: 'SQL c_daily reordered',
    apply: (b) => ({ boardSql: b.boardSql.replace("array['kill_any','kill_more',", "array['kill_more','kill_any',") }) },
  { name: 'a pinned vector the JS picker does not deal',
    apply: (b) => ({ boardSql: b.boardSql.replace("is distinct from array['gold_500','kill_any','level_up']", "is distinct from array['gold_500','kill_any','plant']") }) },
  { name: 'Daily Tasks come back (a claimDaily call in legacy.js)',
    apply: (b) => ({ legacy: b.legacy.replace('function updateDaily(type,amt=1){}', 'function updateDaily(type,amt=1){ window.HearthriseGoalClaim.claimDaily(type); }') }) },
);

async function selftest() {
  const end = await chainEndMigration(QUEST_BODY_RE);
  if (!end) { console.log('  x CONTROL: no chain-end quest body.'); return 2; }
  console.log(`  chain-end quest body: ${end.file}`);
  const bend = await chainEndMigration(BOARD_BODY_RE);
  const base = { legacy: await readFile(join(ROOT, 'src', 'legacy.js'), 'utf8'), questSql: end.sql, boardSql: bend ? bend.sql : '' };
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
    if (over.legacy === base.legacy && over.questSql === base.questSql && over.boardSql === base.boardSql) {
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
      console.log('goal-catalogue-drift — catalogue, legacy.js authored rows, and migration SQL all agree.');
    });
  }
}
