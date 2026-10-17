#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/goal-catalogue-drift.mjs — THE THREE-WAY GOAL CATALOGUE BIND.
//
// The server credits the QUEST gold payouts from a catalogue of goals +
// rewards that lives in THREE places that must never disagree:
//   (1) src/data/goal-catalogue.js       — the single source
//   (2) src/legacy.js QUEST_DEFS          — what the player SEES
//   (3) the server's CASE catalogue, read at the CHAIN END: the LAST file in
//       tests/schema-apply-order.json `order` that creates
//       hr_claim_quest__ungated (2026-09-28-journeymans-road.sql today). Until
//       2026-09-26 it was read from 2026-08-20 only, and a reviewer changed
//       farmhand's gold 500 -> 5000 in the body production actually runs
//       (2026-09-06) in a scratch copy: this guard stayed GREEN. --selftest
//       now plants exactly that and requires RED.
//
// A drift between (2) and (3) means a player is shown "500g" and credited a
// different number. This guard fails the build on it.
//
// It also enforces the "no gold quest silently loses its payout under arm"
// invariant: EVERY gold-bearing QUEST_DEFS row MUST be in the catalogue.
//
// The DAILY-TASK half (pool order, eligibility, the shared shuffle and the
// daily CASE arms) was deleted with daily quests in the 2026-10-14 demolition.
//
// Run standalone:  node tests/goal-catalogue-drift.mjs
//      prove RED:   node tests/goal-catalogue-drift.mjs --selftest
// Also invoked as a guard by tests/run-smoke.mjs.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { QUEST_REWARDS } from '../src/data/goal-catalogue.js';
/* The depth-aware QUEST_DEFS row splitter. One implementation, imported rather
   than copied — see the note at the QUEST_DEFS loop for what the copy cost. */
import { splitTopLevelObjects, stripComments, chainEndMigration } from './quest-reward-parity.mjs';

/* The quest body's chain end — see the header. */
export const QUEST_BODY_RE = /create\s+or\s+replace\s+function\s+public\.hr_claim_quest__ungated\b/i;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* `over` exists for --selftest only: {legacy, questSql} replace the file text
   the guard reads, so a mutation is planted in memory, never on disk. */
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
      } else {
        /* A no-gold quest is in the catalogue only if the server credits
           something else for it (hundred_kills: XP, 2026-10-10-quest-xp-absence-pay.sql),
           and then its catalogue gold must be 0 and its goal must match. A
           no-gold, no-xp, no-item row is a claim that pays nothing. */
        const cat = QUEST_REWARDS[id];
        if (cat) {
          const pays = Object.keys(cat.xp || {}).length > 0 || Object.keys(cat.items || {}).length > 0;
          ok(pays, `QUEST_DEFS '${id}' has no gold reward and its QUEST_REWARDS row pays no XP or items — `
            + 'a claim that pays nothing; remove it from the catalogue.');
          ok(cat.gold === 0, `QUEST_DEFS '${id}' shows no gold but the catalogue pays ${cat.gold}`);
          const goalM = row.match(/goal:\s*(\d+)/);
          if (goalM) ok(cat.goal === Number(goalM[1]), `QUEST_DEFS '${id}' goal=${goalM[1]} != catalogue ${cat.goal}`);
        }
      }
    }
  }

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
  { name: 'chain-end hundred_kills goal drift (100 -> 10: the XP pays at a tenth of the work)',
    apply: (b) => ({ questSql: b.questSql.replace(
      "when 'hundred_kills' then v_key := 'ev:kill_any'; v_goal := 100; v_gold := 0;",
      "when 'hundred_kills' then v_key := 'ev:kill_any'; v_goal := 10; v_gold := 0;") }) },
  { name: 'legacy hundred_kills shows gold the catalogue does not pay',
    apply: (b) => ({ legacy: b.legacy.replace("reward:{xp:{hitpoints:1500}},", "reward:{gold:50,xp:{hitpoints:1500}},") }) },
  { name: 'chain-end pays a quest the catalogue does not know',
    apply: (b) => ({ questSql: b.questSql.replace(
      "    when 'road_hunt' then",
      "    when 'road_extra' then v_key := 'ev:gather'; v_goal := 1; v_gold := 9999;\n    when 'road_hunt' then") }) },
];

async function selftest() {
  const end = await chainEndMigration(QUEST_BODY_RE);
  if (!end) { console.log('  x CONTROL: no chain-end quest body.'); return 2; }
  console.log(`  chain-end quest body: ${end.file}`);
  const base = { legacy: await readFile(join(ROOT, 'src', 'legacy.js'), 'utf8'), questSql: end.sql };
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
    if (over.legacy === base.legacy && over.questSql === base.questSql) {
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
