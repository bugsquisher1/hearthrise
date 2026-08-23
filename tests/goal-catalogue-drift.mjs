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
  DAILY_TASK_REQUIREMENTS, dailySeed, dailyTaskIndexes, dailyTaskSet, dailyTaskEligible,
} from '../src/data/goal-catalogue.js';
import { utcDayKey } from '../src/core/goals.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The day keys the sweeps below run over — two years of real UTC keys, built the
   way src/core/goals.js does. */
function daySweep(n) {
  const out = [];
  for (let d = 0; d < n; d++) out.push(utcDayKey(Date.UTC(2026, 0, 1) + d * 86400000));
  return out;
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

    // (iv) THE CLIENT REALLY USES IT. A shared selection nothing calls is a
    //      second implementation with extra steps.
    ok(/HearthriseCore\.goalCatalogue/.test(legacy) && /dailyTaskSetIndexes\(today,\s*dailyTaskCaps\(\)/.test(legacy),
      'legacy.js generateDailyTasks does not call goalCatalogue.dailyTaskSetIndexes — the client '
      + 'would still deal the unfiltered shuffle while the server filtered.');
    ok(/import \* as goalCatalogue from '\.\/data\/goal-catalogue\.js\?v=\d+'/.test(
      await readFile(join(ROOT, 'src', 'core-bridge.js'), 'utf8')),
      'src/core-bridge.js does not publish goal-catalogue — legacy.js is a classic script and '
      + 'cannot import it, so the bridge is the only seam.');
  }

  // ── (3c) legacy.js\'s OWN shuffle ⟷ the module\'s, EXECUTED ─────────────
  // The pool ORDER was bound textually; the SHUFFLE never was. Two ports of an
  // FNV-1a + LCG Fisher-Yates that agree in every constant can still disagree
  // (Math.imul vs `*`, `>>>0` placement, loop bound), and a divergence puts the
  // client and the server on different daily sets. So run legacy's actual source.
  {
    const seedAt = legacy.indexOf('function dailySeed(');
    const idxAt = legacy.indexOf('function dailyTaskIndexes(');
    const idxEnd = legacy.indexOf('\n}', idxAt);
    ok(seedAt >= 0 && idxAt >= 0 && idxEnd > idxAt,
      'CONTROL: legacy.js dailySeed/dailyTaskIndexes could not be located.');
    if (seedAt >= 0 && idxAt >= 0 && idxEnd > idxAt) {
      const src = legacy.slice(seedAt, legacy.indexOf('\n}', seedAt) + 2)
        + '\n' + legacy.slice(idxAt, idxEnd + 2)
        + '\nreturn dailyTaskIndexes;';
      // eslint-disable-next-line no-new-func
      const legacyIndexes = new Function('DAILY_TASK_POOL', src)(DAILY_TASK_POOL_ORDER);
      let drift = 0;
      for (const k of daySweep(730)) {
        if (JSON.stringify(legacyIndexes(k)) !== JSON.stringify(dailyTaskIndexes(k))) drift++;
      }
      ok(drift === 0, `legacy.js dailyTaskIndexes and goal-catalogue.js dailyTaskIndexes disagree on `
        + `${drift} of 730 day keys — the client and the server would offer different daily tasks.`);
      ok(legacyIndexes('2026-8-23').slice(0, 3).map((i) => DAILY_TASK_POOL_ORDER[i]).join(',')
         === 'daily_gather,daily_craft,daily_smith',
        'CONTROL: the 2026-08-23 incident draw changed, so the fixture the eligibility fix was '
        + 'derived from no longer reproduces. Re-derive the pins in the migration\'s GATE(a).');
    }
  }

  // ── (3d) The eligibility CONTRACT, swept ───────────────────────────────
  {
    const FRESH = { rooms: {}, skillXp: {} };
    const FULL = { rooms: { workshop: 1, forge: 1 }, skillXp: {} };
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
