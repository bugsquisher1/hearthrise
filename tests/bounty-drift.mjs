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
  BOUNTY_FIRST_CONTRACT_COUNT, BOUNTY_FIRST_CONTRACT_GRACE,
  BOUNTY_FIRST_CONTRACT_MAX_LEVEL, BOUNTY_FIRST_CONTRACT_TIER,
  bountyRewards, bountyCountRange, unlockedTier, unlockedTypes, isFirstContract,
} from '../src/core/bounty.js';
import { XP_TABLE, levelFromXp } from '../src/core/xp.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = join(ROOT, 'supabase', 'migrations', '2026-08-23-bounty.sql');
const SQL_FIRST = join(ROOT, 'supabase', 'migrations', '2026-08-29-bounty-first-contract.sql');

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

  // ── (5) THE FIRST-CONTRACT BRACKET (designer ruling 2026-08-23) ─────────
  // src/core/bounty.js draws the count; 2026-08-29-bounty-first-contract.sql
  // clamps it. A drift means the board offers "kill 18" and the turn-in demands
  // 80 — the client and the server disagreeing about one contract, which is the
  // failure the whole server-authority program exists to prevent.
  const sqlFirst = (await readFile(SQL_FIRST, 'utf8')).replace(/\r\n/g, '\n');
  const [flo, fhi] = BOUNTY_FIRST_CONTRACT_COUNT;
  ok(new RegExp(`select\\s+${flo}::bigint,\\s*${fhi}::bigint`).test(sqlFirst),
    `SQL hr_bounty_first_contract_range does not return (${flo},${fhi}) — the client would draw a `
    + 'count the server clamps away.');
  ok(new RegExp(`limit\\s+${BOUNTY_FIRST_CONTRACT_GRACE}\\)\\s*t\\)\\s*<\\s*${BOUNTY_FIRST_CONTRACT_GRACE}`)
    .test(sqlFirst.replace(/\s+/g, ' ').replace(/ \)/g, ')')),
    `SQL hr_bounty_first_contract does not use the grace ${BOUNTY_FIRST_CONTRACT_GRACE} on both the `
    + 'LIMIT and the comparison — a mismatch makes the probe answer a different question than the clamp asks.');

  // The FLOOR moves and the CEILING does not. Asserted as a property of the SQL,
  // because "only the floor" is the whole reason an honest 80-kill contract from
  // a level-2 client survives a server that still thinks the character is new.
  ok(/select\s+kmin\s+into\s+v_kmin\s+from\s+public\.hr_bounty_first_contract_range\(\)/.test(sqlFirst),
    'SQL: the first-contract swap must take kmin ONLY. Taking kmax too would rewrite a legitimate '
    + '80-kill contract down to 25 whenever the server under-knows the Bounty-Hunter level.');
  ok(!/into\s+v_kmin,\s*v_kmax\s+from\s+public\.hr_bounty_first_contract_range/.test(sqlFirst),
    'SQL: hr_bounty_first_contract_range must not overwrite v_kmax — see above.');

  // The GRACE is DERIVED, not chosen: the cheapest tier-1 cull XP against the
  // level-2 rung decides how many turn-ins a character can hold level 1 for.
  {
    const cheapest = Math.min(...Object.keys(BOUNTY_DIFFICULTY_MULT)
      .map((d) => bountyRewards(BOUNTY_FIRST_CONTRACT_TIER, 'cull', d).xp));
    let xp = 0; let n = 0;
    while (levelFromXp(xp) <= BOUNTY_FIRST_CONTRACT_MAX_LEVEL && n < 50) { n++; xp += cheapest; }
    ok(n === BOUNTY_FIRST_CONTRACT_GRACE,
      `BOUNTY_FIRST_CONTRACT_GRACE=${BOUNTY_FIRST_CONTRACT_GRACE} but the reward table now allows `
      + `${n} turn-in(s) at Bounty-Hunter level <= ${BOUNTY_FIRST_CONTRACT_MAX_LEVEL} `
      + `(cheapest tier-${BOUNTY_FIRST_CONTRACT_TIER} cull xp ${cheapest}, level-2 rung ${XP_TABLE[1]}). `
      + 'The server grace must stay a SUPERSET of the client bracket, or a legitimate contract is '
      + 'silently raised to the tier floor.');
  }

  // The bracket applies where the ruling says and NOWHERE else.
  ok(bountyCountRange('cull', 1, 1)[0] === flo && bountyCountRange('cull', 1, 1)[1] === fhi,
    'bountyCountRange(cull, tier 1, BH level 1) is not the first-contract bracket.');
  ok(bountyCountRange('cull', 1, 2)[0] === BOUNTY_KILL_COUNTS.cull[1][0],
    'bountyCountRange(cull, tier 1, BH level 2) must be the tier table — the ruling scales up from level 2.');
  for (let t = 2; t <= 6; t++) {
    ok(bountyCountRange('cull', t, 1)[0] === BOUNTY_KILL_COUNTS.cull[t][0],
      `tier ${t} must keep its own floor at BH level 1 — a tier-6 cull for 15 kills pays `
      + `${BOUNTY_BASE_REWARDS[6].gold} gold and is a mint, not a ramp.`);
  }
  ok(!isFirstContract('cull', 1, undefined) && !isFirstContract('cull', 1, null)
     && !isFirstContract('cull', 1, NaN),
    'A caller that supplies NO Bounty-Hunter level must get the tier table, not the generous bracket '
    + '— `undefined|0 === 0` would silently make every legacy call site a first contract.');
  ok(unlockedTypes(BOUNTY_FIRST_CONTRACT_MAX_LEVEL).length === 1
     && unlockedTypes(BOUNTY_FIRST_CONTRACT_MAX_LEVEL)[0] === 'cull',
    'CONTROL: cull is no longer the only type unlocked at the first-contract level, so restricting '
    + 'the bracket to cull no longer covers what a new hunter is offered.');

  return problems;
}

if (process.argv[1]?.endsWith('bounty-drift.mjs')) {
  bountyDriftGuard().then((p) => {
    if (p.length) { console.log('bounty-drift — FAILED:'); for (const x of p) console.log(`  ✗ ${x}`); process.exit(1); }
    console.log('bounty-drift — bounty.js reward/range/tier tables and the migration SQL agree.');
  });
}
