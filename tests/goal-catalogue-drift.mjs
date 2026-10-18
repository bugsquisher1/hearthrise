#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/goal-catalogue-drift.mjs — THE THREE-WAY GOAL CATALOGUE BIND.
//
// The server credits the QUEST gold payouts from a catalogue of goals +
// rewards that lives in TWO places that must never disagree:
//   (1) src/data/goal-catalogue.js       — the single source
//   (2) [retired 2026-10-17: the old client's QUEST_DEFS in src/legacy.js,
//       deleted with that client]
//   (3) the server's CASE catalogue, read at the CHAIN END: the LAST file in
//       tests/schema-apply-order.json `order` that creates
//       hr_claim_quest__ungated (2026-09-28-journeymans-road.sql today). Until
//       2026-09-26 it was read from 2026-08-20 only, and a reviewer changed
//       farmhand's gold 500 -> 5000 in the body production actually runs
//       (2026-09-06) in a scratch copy: this guard stayed GREEN. --selftest
//       now plants exactly that and requires RED.
//
// A drift between (1) and (3) means the catalogue says one number and the
// server credits another. This guard fails the build on it, both directions.
//
// The DAILY-TASK half (pool order, eligibility, the shared shuffle and the
// daily CASE arms) was deleted with daily quests in the 2026-10-14 demolition.
//
// Run standalone:  node tests/goal-catalogue-drift.mjs
//      prove RED:   node tests/goal-catalogue-drift.mjs --selftest
// Also invoked as a guard by tests/run-smoke.mjs.
// ════════════════════════════════════════════════════════════════════════

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { QUEST_REWARDS } from '../src/data/goal-catalogue.js';
import { chainEndMigration } from './quest-reward-parity.mjs';
import { isMain } from './_is-main.mjs';

/* The quest body's chain end — see the header. */
export const QUEST_BODY_RE = /create\s+or\s+replace\s+function\s+public\.hr_claim_quest__ungated\b/i;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* `over` exists for --selftest only: {questSql} replaces the file text
   the guard reads, so a mutation is planted in memory, never on disk. */
export async function goalCatalogueDriftGuard(over = {}) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  // ── (3) the migration SQL ─────────────────────────────────────────────

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

  return problems;
}

/* ── --selftest ───────────────────────────────────────────────────────────
   Each mutation plants ONE defect in an in-memory copy of the chain-end
   quest SQL; each must turn the guard RED. The base run must be clean
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
  const base = { questSql: end.sql };
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
    if (over.questSql === base.questSql) {
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
if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest') || process.argv.includes('--mutate')) {
    selftest().then((code) => process.exit(code));
  } else {
    goalCatalogueDriftGuard().then((p) => {
      if (p.length) { console.log('goal-catalogue-drift — FAILED:'); for (const x of p) console.log(`  ✗ ${x}`); process.exit(1); }
      console.log('goal-catalogue-drift — catalogue and chain-end migration SQL agree.');
    });
  }
}
