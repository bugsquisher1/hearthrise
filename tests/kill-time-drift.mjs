#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/kill-time-drift.mjs — THE BIND for the bounty KILL-CREDIT plausibility
// cap.
//
// hr_bounty_kill_cap (2026-08-30-bounty-kill-credit.sql) reproduces
// src/core/kill-time.js in SQL so hr_credit_kills can clamp a client's claimed
// kills to the physical maximum. The two runtimes MUST agree bit-for-bit — a
// coefficient that drifts means an honest kill the client counts is one the
// server refuses (a bounty that never completes) or a forger's kill the server
// wrongly accepts (a gold+Marks turn-in it should have blocked). This guard
// fails the build on any divergence between:
//
//   (1) KILL_TIME_SQL_CONSTANTS (derived from COMBAT_BALANCE / elements / perks /
//       styles / items) ⟷ the integer literals vendored into hr_bounty_kill_cap.
//   (2) the migration's GATE(c) anchor assertions ⟷ plausibleKillCap() in JS.
//
// The full SQL⟷JS numerical equivalence over a wide matrix is verified against a
// live Postgres on a Supabase branch at apply time (see the PR change contract);
// this guard binds the SOURCE so the two cannot silently diverge between builds.
//
// Run standalone:  node tests/kill-time-drift.mjs
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  KILL_TIME_SQL_CONSTANTS, plausibleKillCap, maxHitCeil, minTimeToKillMs,
} from '../src/core/kill-time.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = join(ROOT, 'supabase', 'migrations', '2026-08-30-bounty-kill-credit.sql');

export async function killTimeDriftGuard() {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };
  const sql = (await readFile(SQL, 'utf8')).replace(/\r\n/g, '\n');
  const c = KILL_TIME_SQL_CONSTANTS;

  // ── (1) the vendored integer literals appear in the cap function ──────────
  // base = floor((lvl*LVL_NUM + BASE_OFFSET) / 100)
  ok(new RegExp(`lvl\\s*\\*\\s*${c.lvl_num}\\s*\\+\\s*${c.base_offset}`).test(sql),
    `SQL hr_bounty_kill_cap missing base term 'lvl*${c.lvl_num} + ${c.base_offset}'`);
  // max_hit = ... * MULT_NUM) / MULT_DEN
  ok(new RegExp(`\\*\\s*${c.mult_num}\\)\\s*/\\s*${c.mult_den}`).test(sql),
    `SQL hr_bounty_kill_cap missing multiplier '* ${c.mult_num}) / ${c.mult_den}'`);
  // min_kill_ms floor + per-swing = MIN_TICK_MS
  ok(new RegExp(`greatest\\(${c.min_tick_ms}::bigint`).test(sql),
    `SQL hr_bounty_kill_cap missing minTickMs floor '${c.min_tick_ms}'`);
  ok(new RegExp(`\\*\\s*${c.min_tick_ms}\\b`).test(sql),
    `SQL hr_bounty_kill_cap missing per-swing '* ${c.min_tick_ms}'`);
  // cap = floor(HEADROOM_NUM*el / (HEADROOM_DEN*min_kill_ms))
  ok(new RegExp(`${c.headroom_num}\\s*\\*\\s*el`).test(sql),
    `SQL hr_bounty_kill_cap missing headroom numerator '${c.headroom_num} * el'`);
  ok(new RegExp(`${c.headroom_den}\\s*\\*\\s*min_kill_ms`).test(sql),
    `SQL hr_bounty_kill_cap missing headroom denominator '${c.headroom_den} * min_kill_ms'`);

  // ── (2) the GATE(c) anchors match JS exactly ─────────────────────────────
  const anchors = [
    [15, 10, 60000, 130],
    [520, 99, 60000, 65],
    [15, 99, 0, 0],
  ];
  for (const [hp, lvl, el, expect] of anchors) {
    const js = plausibleKillCap(hp, lvl, el);
    ok(js === expect,
      `JS plausibleKillCap(${hp},${lvl},${el})=${js}, migration GATE(c) asserts ${expect} — they disagree`);
    ok(new RegExp(`hr_bounty_kill_cap\\(${hp},\\s*${lvl},\\s*${el}\\)\\s*<>\\s*${expect}`).test(sql)
       || el === 0, // the zero-elapsed anchor is written as a separate <> 0 check
      `migration GATE(c) is missing the anchor cap(${hp},${lvl},${el})=${expect}`);
  }

  // ── (3) internal sanity: the model is monotone + never throttles the floor ─
  ok(maxHitCeil(1) < maxHitCeil(99), 'maxHitCeil is not monotone in level');
  ok(minTimeToKillMs(1, 99) === c.min_tick_ms, 'a 1-HP kill should floor at one swing');
  ok(plausibleKillCap(15, 50, 0) === 0, 'zero elapsed must credit zero');

  if (problems.length) {
    const e = new Error('kill-time drift:\n  - ' + problems.join('\n  - '));
    e.problems = problems;
    throw e;
  }
  return { ok: true, checks: 'kill-time cap SQL⟷core bind green' };
}

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')
    || process.argv[1] === fileURLToPath(import.meta.url)) {
  killTimeDriftGuard().then((r) => { console.log(r.checks); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
