#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/goal-catalogue-drift.mjs — THE THREE-WAY GOAL CATALOGUE BIND.
//
// The server credits the DAILY-TASK and QUEST gold payouts from a catalogue of
// goals + rewards that lives in THREE places that must never disagree:
//   (1) src/data/goal-catalogue.js       — the single source
//   (2) src/legacy.js QUEST_DEFS / DAILY_TASK_POOL — what the player SEES
//   (3) supabase/migrations/2026-08-20-goal-reward-rpc-credit.sql — what the
//       server CREDITS (the embedded CASE catalogue + the pool-order array)
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
// Also invoked as a guard by tests/run-smoke.mjs.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  QUEST_REWARDS, DAILY_TASK_REWARDS, DAILY_TASK_POOL_ORDER, DAILY_TASK_BASE_COUNT,
} from '../src/data/goal-catalogue.js';
import { utcDayKey } from '../src/core/goals.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* A JS reimplementation of src/legacy.js dailyTaskIndexes, used ONLY to bind the
   catalogue's pool order to a stable expectation and to sanity-check the SQL
   constants. The executable JS⟷SQL equivalence is asserted on APPLY by the
   migration's §8 (hr_daily_task_set('2026-8-20') = the JS reference). */
function dailySeed(s) {
  let h = 0x811c9dc5; s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export async function goalCatalogueDriftGuard() {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  // ── (2) legacy.js authored rows ────────────────────────────────────────
  const legacy = await readFile(join(ROOT, 'src', 'legacy.js'), 'utf8');
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
    // Split into per-row objects on top-level `{...}` — quests are flat one-liners.
    const rows = [...questBody.matchAll(/\{[^{}]*\}/g)].map((m) => m[0]);
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
        // A no-gold quest (hundred_kills) must NOT be in the catalogue.
        ok(!QUEST_REWARDS[id], `QUEST_DEFS '${id}' has no gold reward but IS in QUEST_REWARDS — `
          + 'a non-gold quest never fires a claim; remove it from the catalogue.');
      }
    }
  }

  // DAILY_TASK_POOL: authored id ORDER must equal DAILY_TASK_POOL_ORDER, and
  // every non-harvest row must be in DAILY_TASK_REWARDS (type+goal+gold where fixed).
  const dailyBody = block('DAILY_TASK_POOL');
  ok(!!dailyBody, 'CONTROL: DAILY_TASK_POOL could not be located in legacy.js.');
  if (dailyBody) {
    const ids = [...dailyBody.matchAll(/id:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    ok(ids.length === DAILY_TASK_POOL_ORDER.length && ids.every((id, i) => id === DAILY_TASK_POOL_ORDER[i]),
      `DAILY_TASK_POOL authored order [${ids.join(',')}] != DAILY_TASK_POOL_ORDER `
      + `[${DAILY_TASK_POOL_ORDER.join(',')}] — the server selection (hr_daily_task_set) would offer a `
      + 'different set than the client shows, refusing legitimate claims. Keep the two in lockstep.');
    for (const id of ids) {
      if (id === 'daily_harvest') { ok(!DAILY_TASK_REWARDS[id],
        'daily_harvest is dynamic (farmPlotCap) and must NOT be in DAILY_TASK_REWARDS.'); continue; }
      ok(!!DAILY_TASK_REWARDS[id], `DAILY_TASK_POOL row '${id}' is ABSENT from DAILY_TASK_REWARDS — `
        + 'a fixed daily whose gold the server cannot credit. Add it here AND to the SQL CASE.');
    }
  }
  ok(DAILY_TASK_BASE_COUNT === 3, `DAILY_TASK_BASE_COUNT=${DAILY_TASK_BASE_COUNT}, expected 3 `
    + '(legacy.js generateDailyTasks base slice). A change here desyncs the offered count from the server.');

  // ── (3) the migration SQL — embedded catalogue + pool order ────────────
  const sql = await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-20-goal-reward-rpc-credit.sql'), 'utf8');

  // Quest CASE arms: when '<id>' then v_key := '<checkKey>'; v_goal := N; v_gold := M;
  for (const [id, cat] of Object.entries(QUEST_REWARDS)) {
    const re = new RegExp(`when\\s+'${id}'\\s+then\\s+v_key\\s*:=\\s*'([a-z_:]+)';\\s*v_goal\\s*:=\\s*(\\d+);\\s*v_gold\\s*:=\\s*(\\d+);`);
    const m = sql.match(re);
    ok(!!m, `SQL hr_claim_quest is missing/misshapen CASE arm for quest '${id}'.`);
    if (m) {
      ok(m[1] === cat.checkKey, `SQL quest '${id}' checkKey '${m[1]}' != catalogue '${cat.checkKey}'`);
      ok(Number(m[2]) === cat.goal, `SQL quest '${id}' goal ${m[2]} != catalogue ${cat.goal}`);
      ok(Number(m[3]) === cat.gold, `SQL quest '${id}' gold ${m[3]} != catalogue ${cat.gold}`);
    }
  }

  // Daily CASE arms: when '<id>' then v_type := '<type>'; v_goal := N; v_gold := M;
  for (const [id, cat] of Object.entries(DAILY_TASK_REWARDS)) {
    const re = new RegExp(`when\\s+'${id}'\\s+then\\s+v_type\\s*:=\\s*'([a-z_]+)';\\s*v_goal\\s*:=\\s*(\\d+);\\s*v_gold\\s*:=\\s*(\\d+);`);
    const m = sql.match(re);
    ok(!!m, `SQL hr_claim_daily is missing/misshapen CASE arm for task '${id}'.`);
    if (m) {
      ok(m[1] === cat.type, `SQL daily '${id}' type '${m[1]}' != catalogue '${cat.type}'`);
      ok(Number(m[2]) === cat.goal, `SQL daily '${id}' goal ${m[2]} != catalogue ${cat.goal}`);
      ok(Number(m[3]) === cat.gold, `SQL daily '${id}' gold ${m[3]} != catalogue ${cat.gold}`);
    }
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

  // ── (1)⟷client day-key: hrGoalDayKey must reproduce goals.js utcDayKey ──
  const dkAt = legacy.indexOf('function hrGoalDayKey(');
  const dayKeyBody = dkAt >= 0 ? legacy.slice(dkAt, dkAt + 220) : '';
  ok(/getUTCFullYear\(\)/.test(dayKeyBody) && /getUTCMonth\(\)\+1/.test(dayKeyBody) && /getUTCDate\(\)/.test(dayKeyBody),
    'legacy.js hrGoalDayKey must build the NO-ZERO-PAD UTC key (getUTCFullYear-getUTCMonth+1-getUTCDate) '
    + 'to match src/core/goals.js utcDayKey and public.hr_utc_day_key — a padded/local key would desync '
    + 'the client selection seed from the server.');
  // Parity sample: goals.js utcDayKey over a sweep is the string dailySeed feeds.
  for (const ms of [Date.UTC(2026, 7, 20, 3), Date.UTC(2026, 0, 1, 23), Date.UTC(2025, 11, 31, 12)]) {
    const k = utcDayKey(ms);
    ok(/^\d{4}-\d{1,2}-\d{1,2}$/.test(k) && !/-0\d/.test(k), `goals.js utcDayKey produced a padded/odd key: ${k}`);
    ok(typeof dailySeed(k) === 'number', `dailySeed('${k}') did not produce a number`);
  }

  return problems;
}

// Standalone
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('goal-catalogue-drift.mjs')) {
  goalCatalogueDriftGuard().then((p) => {
    if (p.length) { console.log('goal-catalogue-drift — FAILED:'); for (const x of p) console.log(`  ✗ ${x}`); process.exit(1); }
    console.log('goal-catalogue-drift — catalogue, legacy.js authored rows, and migration SQL all agree.');
  });
}
