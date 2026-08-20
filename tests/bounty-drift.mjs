#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bounty-drift.mjs — THE BIND for the server-owned BOUNTY economy.
//
// The bounty turn-in RPC (2026-08-23-bounty.sql) OWNS the reward, the required-
// kill range, the tier-unlock ladder and the monster→tier map. Each is a copy of
// a number that lives in src/core/bounty.js or src/data/monsters.js, and a copy
// that drifts means a player is shown one gold/marks number and credited another.
// This guard fails the build on any divergence:
//
//   (1) BOUNTY_BASE_REWARDS / BOUNTY_DIFFICULTY_MULT ⟷ hr_bounty_reward CASE
//       constants, AND the full bountyRewards() for every (tier,'cull',diff).
//   (2) BOUNTY_KILL_COUNTS.cull ⟷ hr_bounty_kill_range.
//   (3) unlockedTier ⟷ hr_bounty_unlocked_tier.
//   (4) the accept/claim RPCs + the non-cull refusal are present.
// The monster→tier catalogue (src/data/monsters.js ⟷ the generated SQL) is
// bound by the generator's own --check, invoked separately from run-smoke.
//
// Run standalone:  node tests/bounty-drift.mjs
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BOUNTY_BASE_REWARDS, BOUNTY_DIFFICULTY_MULT, BOUNTY_KILL_COUNTS,
  bountyRewards, unlockedTier,
} from '../src/core/bounty.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = join(ROOT, 'supabase', 'migrations', '2026-08-23-bounty.sql');

// `when <a> then <b>` with any run of whitespace around the tokens.
function whenThen(a, b) {
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`when\\s+${esc(a)}\\s+then\\s+${esc(b)}(?![0-9])`);
}

export async function bountyDriftGuard() {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };
  const sql = (await readFile(SQL, 'utf8')).replace(/\r\n/g, '\n');

  // ── (1a) base reward CASE constants ─────────────────────────────────────
  for (let t = 1; t <= 6; t++) {
    const b = BOUNTY_BASE_REWARDS[t];
    ok(whenThen(t, b.gold).test(sql), `SQL hr_bounty_reward missing base gold 'when ${t} then ${b.gold}'`);
    ok(whenThen(t, b.marks).test(sql), `SQL hr_bounty_reward missing base marks 'when ${t} then ${b.marks}'`);
    ok(whenThen(t, b.xp).test(sql), `SQL hr_bounty_reward missing base xp 'when ${t} then ${b.xp}'`);
  }

  // ── (1b) difficulty multipliers (SQL writes 1.0 for JS 1) ───────────────
  for (const [d, m] of Object.entries(BOUNTY_DIFFICULTY_MULT)) {
    ok(whenThen(`'${d}'`, m === 1 ? '1.0' : m).test(sql),
      `SQL hr_bounty_reward missing difficulty arm 'when '${d}' then ${m}'`);
  }

  // ── (1c) FULL formula bind: bounty.js bountyRewards ⟷ the SQL arithmetic ─
  for (let t = 1; t <= 6; t++) {
    for (const d of Object.keys(BOUNTY_DIFFICULTY_MULT)) {
      const src = bountyRewards(t, 'cull', d);
      const b = BOUNTY_BASE_REWARDS[t];
      const dm = BOUNTY_DIFFICULTY_MULT[d];
      const sqlGold = Math.round((b.gold * dm) / 10) * 10;
      const sqlMarks = Math.max(1, Math.round(b.marks * dm));
      const sqlXp = Math.round(b.xp * dm);
      ok(src.gold === sqlGold,
        `reward drift (tier ${t} ${d}): bounty.js gold ${src.gold} != SQL formula ${sqlGold} `
        + '— the cull type multiplier is no longer identity, so the SQL omitting it is WRONG.');
      ok(src.marks === sqlMarks, `reward drift (tier ${t} ${d}): marks ${src.marks} != SQL ${sqlMarks}`);
      ok(src.xp === sqlXp, `reward drift (tier ${t} ${d}): xp ${src.xp} != SQL ${sqlXp}`);
    }
  }

  // ── (2) kill-count range (cull) ─────────────────────────────────────────
  for (let t = 1; t <= 6; t++) {
    const [lo, hi] = BOUNTY_KILL_COUNTS.cull[t];
    ok(whenThen(t, lo).test(sql), `SQL hr_bounty_kill_range missing min 'when ${t} then ${lo}'`);
    ok(whenThen(t, hi).test(sql), `SQL hr_bounty_kill_range missing max 'when ${t} then ${hi}'`);
  }

  // ── (3) unlockedTier ladder ─────────────────────────────────────────────
  for (const [cl, tier] of [[70, 6], [55, 5], [40, 4], [25, 3], [12, 2]]) {
    ok(unlockedTier(cl) === tier && unlockedTier(cl - 1) === tier - 1,
      `CONTROL: bounty.js unlockedTier breakpoint ${cl}->${tier} moved.`);
    ok(new RegExp(`>=\\s*${cl}\\s+then\\s+${tier}\\b`).test(sql),
      `SQL hr_bounty_unlocked_tier missing ladder arm '>= ${cl} then ${tier}'`);
  }

  // ── (4) the RPCs + the non-cull refusal are wired ───────────────────────
  ok(/hr_accept_bounty__ungated/.test(sql) && /hr_claim_bounty__ungated/.test(sql),
    'CONTROL: the accept/claim RPCs are missing from the migration.');
  ok(/'type_not_server_verifiable'/.test(sql),
    'CONTROL: the non-cull refusal is missing — proof/weapon/streak would be accepted.');

  return problems;
}

if (process.argv[1]?.endsWith('bounty-drift.mjs')) {
  bountyDriftGuard().then((p) => {
    if (p.length) { console.log('bounty-drift — FAILED:'); for (const x of p) console.log(`  ✗ ${x}`); process.exit(1); }
    console.log('bounty-drift — bounty.js reward/range/tier tables and the migration SQL agree.');
  });
}
