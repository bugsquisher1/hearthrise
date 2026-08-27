#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/combat-xp-cap-drift.mjs — THE BIND for the attended COMBAT-XP credit cap.
//
// hr_combat_xp_cap (2026-08-31-combat-xp-credit.sql) reproduces
// src/core/combat-xp-cap.js in SQL so hr_credit_combat_xp can clamp a client's
// submitted per-skill XP to the physical maximum. The two runtimes MUST agree
// bit-for-bit — a coefficient that drifts means an honest XP gain the client
// counts is one the server refuses (a level that keeps reverting) or a forger's
// XP the server wrongly accepts (a leaderboard the cap should have bounded).
//
// This guard binds the SOURCE so the two cannot silently diverge between builds:
//   (1) COMBAT_XP_CAP_SQL_CONSTANTS ⟷ the integer literals in hr_combat_xp_cap.
//   (2) the shared MAX-HIT model ⟷ the kill-time.js coefficients the cap reuses.
//   (3) the migration's GATE(c) anchors ⟷ combatXpCap() in JS.
//
// Run standalone:  node tests/combat-xp-cap-drift.mjs
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { COMBAT_XP_CAP_SQL_CONSTANTS, combatXpCap } from '../src/core/combat-xp-cap.js';
import { KILL_TIME_SQL_CONSTANTS } from '../src/core/kill-time.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = join(ROOT, 'supabase', 'migrations', '2026-08-31-combat-xp-credit.sql');

export async function combatXpCapDriftGuard() {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };
  const sql = (await readFile(SQL, 'utf8')).replace(/\r\n/g, '\n');
  const c = COMBAT_XP_CAP_SQL_CONSTANTS;
  const kt = KILL_TIME_SQL_CONSTANTS;

  // ── (1) the vendored XP-multiplier literals appear in the cap function ─────
  // xp_cap = floor(HEADROOM_NUM * el * max_hit * INNER_NUM / (HEADROOM_DEN * INNER_DEN))
  ok(new RegExp(`${c.headroom_num}\\s*\\*\\s*el`).test(sql),
    `SQL hr_combat_xp_cap missing headroom numerator '${c.headroom_num} * el'`);
  ok(new RegExp(`\\*\\s*${c.inner_num}\\b`).test(sql),
    `SQL hr_combat_xp_cap missing INNER_NUM '* ${c.inner_num}'`);
  ok(new RegExp(`${c.headroom_den}\\s*\\*\\s*${c.inner_den}\\b`).test(sql),
    `SQL hr_combat_xp_cap missing denominator '${c.headroom_den} * ${c.inner_den}'`);

  // ── (2) the SHARED max-hit model — same coefficients as hr_bounty_kill_cap ─
  ok(new RegExp(`lvl\\s*\\*\\s*${kt.lvl_num}\\s*\\+\\s*${kt.base_offset}`).test(sql),
    `SQL hr_combat_xp_cap missing shared base term 'lvl*${kt.lvl_num} + ${kt.base_offset}'`);
  ok(new RegExp(`\\*\\s*${kt.mult_num}\\)\\s*/\\s*${kt.mult_den}`).test(sql),
    `SQL hr_combat_xp_cap missing shared multiplier '* ${kt.mult_num}) / ${kt.mult_den}'`);

  // ── (3) the GATE(c) anchors match JS exactly ──────────────────────────────
  const anchors = [
    [99, 60000, 497640],
    [10, 60000, 296400],
    [99, 0, 0],
  ];
  for (const [lvl, el, expect] of anchors) {
    const js = combatXpCap(lvl, el);
    ok(js === expect,
      `JS combatXpCap(${lvl},${el})=${js}, migration GATE(c) asserts ${expect} — they disagree`);
    ok(new RegExp(`hr_combat_xp_cap\\(${lvl},\\s*${el}\\)\\s*<>\\s*${expect}`).test(sql) || el === 0,
      `migration GATE(c) is missing the anchor cap(${lvl},${el})=${expect}`);
  }

  // ── (4) internal sanity: monotone in level, zero at zero elapsed ──────────
  ok(combatXpCap(1, 60000) < combatXpCap(99, 60000), 'combatXpCap is not monotone in level');
  ok(combatXpCap(50, 0) === 0, 'zero elapsed must cap zero');

  if (problems.length) {
    const e = new Error('combat-xp-cap drift:\n  - ' + problems.join('\n  - '));
    e.problems = problems;
    throw e;
  }
  return { ok: true, checks: 'combat-xp cap SQL⟷core bind green' };
}

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')
    || process.argv[1] === fileURLToPath(import.meta.url)) {
  combatXpCapDriftGuard().then((r) => { console.log(r.checks); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
