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
//   (5) the first-contract bracket (b487).
//   (6) BOUNTY_DIFFICULTY_COUNT ⟷ hr_bounty_count_mult, AND — the part that
//       matters — the full SCALED RANGE for every (tier × difficulty) pair and
//       for the first-contract bracket. Binding four multipliers is not enough:
//       a multiplier that matches while the ROUNDING does not is exactly the
//       drift a constant-only guard cannot see, and it is the drift that makes
//       the board offer 72 kills while the turn-in demands 73.
// The monster→tier catalogue (src/data/monsters.js ⟷ the generated SQL) is
// bound by the generator's own --check, invoked separately from run-smoke.
//
// Run standalone:  node tests/bounty-drift.mjs
//                  node tests/bounty-drift.mjs --list      the mutation catalogue
//                  node tests/bounty-drift.mjs --selftest  every mutation must be caught
// A guard that cannot demonstrate it sees failure is treated as broken, not as
// a pass — this repo has shipped twelve guards that asserted nothing.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BOUNTY_BASE_REWARDS, BOUNTY_DIFFICULTY_MULT, BOUNTY_DIFFICULTY_COUNT, BOUNTY_KILL_COUNTS,
  BOUNTY_FIRST_CONTRACT_COUNT, BOUNTY_FIRST_CONTRACT_GRACE,
  BOUNTY_FIRST_CONTRACT_MAX_LEVEL, BOUNTY_FIRST_CONTRACT_TIER,
  bountyRewards, bountyCountRange, bountyCountMult,
  unlockedTier, unlockedTypes, isFirstContract,
} from '../src/core/bounty.js';
import { XP_TABLE, levelFromXp } from '../src/core/xp.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = join(ROOT, 'supabase', 'migrations', '2026-08-23-bounty.sql');
const SQL_FIRST = join(ROOT, 'supabase', 'migrations', '2026-08-29-bounty-first-contract.sql');
const SQL_COUNT = join(ROOT, 'supabase', 'migrations', '2026-09-04-bounty-difficulty-count.sql');

/* THE MUTATION CATALOGUE. Each entry plants a REAL defect in the REAL migration
   text (never in a copy) and must be caught by at least one assertion below.
   `file` names which of the three migrations is edited. */
const MUTATIONS = {
  easy_mult_drift: {
    file: SQL_COUNT,
    why: 'the SQL easy multiplier drifts from the ruling, so the board draws 72 kills and the '
       + 'server clamps the contract up to 76 — a player shown one contract and made to fill another',
    find: "when 'easy'   then 0.90", repl: "when 'easy'   then 0.95",
  },
  elite_mult_drift: {
    file: SQL_COUNT,
    why: 'the elite arm drifts. Unreachable through the accept TODAY (elite is refused), which is '
       + 'exactly why it needs a guard: the day elite becomes server-owned nobody re-derives it',
    find: "when 'elite'  then 1.50", repl: "when 'elite'  then 1.40",
  },
  mult_defaults_open: {
    file: SQL_COUNT,
    why: 'an unknown difficulty stops being NULL, so a forged difficulty string is silently served '
       + 'the NORMAL range instead of being refused — the fail-closed half is gone',
    find: "           when 'elite'  then 1.50\n         end::numeric;",
    repl: "           when 'elite'  then 1.50\n           else 1.00\n         end::numeric;",
  },
  range_restated_not_composed: {
    file: SQL_COUNT,
    why: 'the scaled range stops COMPOSING hr_bounty_kill_range(p_tier) and grows its own copy of '
       + 'the tier table — a second source for the same numbers, which is how the pair drifts',
    find: 'from public.hr_bounty_kill_range(p_tier) r',
    repl: 'from (select 80::bigint kmin, 120::bigint kmax) r',
  },
  no_kill_floor: {
    file: SQL_COUNT,
    why: 'the greatest(1, …) floor is dropped, so a future multiplier can author a zero-kill '
       + 'contract that is COMPLETE ON ACCEPTANCE',
    find: '  select greatest(1, round(r.kmin * m.dm))::bigint,\n         greatest(1, round(r.kmax * m.dm))::bigint\n    from public.hr_bounty_kill_range(p_tier) r',
    repl: '  select round(r.kmin * m.dm)::bigint,\n         round(r.kmax * m.dm)::bigint\n    from public.hr_bounty_kill_range(p_tier) r',
  },
  first_contract_unscaled: {
    file: SQL_COUNT,
    why: 'the first-contract floor stops scaling, so a new hunter\'s honest 14-kill easy contract '
       + 'is silently raised to 15 — the b487 bracket and the b497 ruling disagreeing',
    find: '    select kmin into v_kmin from public.hr_bounty_first_contract_range(p_difficulty);',
    repl: '    select kmin into v_kmin from public.hr_bounty_first_contract_range();',
  },
  accept_keeps_tier_only_range: {
    file: SQL_COUNT,
    why: 'the accept patch stops using the difficulty-scaled range, so the whole ruling installs '
       + 'three functions NOTHING CALLS and reads as shipped',
    find: "    || '    from public.hr_bounty_kill_range(v_tier, p_difficulty);' || chr(10)",
    repl: "    || '    from public.hr_bounty_kill_range(v_tier);' || chr(10)",
  },
  elite_refusal_check_removed: {
    file: SQL_COUNT,
    why: 'the migration stops asserting that the accept still REFUSES elite — the 2026-08-23 '
       + 'security ruling could then be relaxed by a later file with nothing noticing',
    find: "  if position('p_difficulty not in (''easy'',''normal'',''hard'')' in v_src) = 0 then",
    repl: "  if false then",
  },
};

// `when <a> then <b>` with any run of whitespace around the tokens.
function whenThen(a, b) {
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`when\\s+${esc(a)}\\s+then\\s+${esc(b)}(?![0-9])`);
}

export async function bountyDriftGuard(mutation) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };
  const mut = mutation ? MUTATIONS[mutation] : null;
  if (mutation && !mut) throw new Error(`unknown mutation "${mutation}"`);
  const load = async (path) => {
    let text = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
    if (mut && mut.file === path) {
      if (!text.includes(mut.find)) {
        throw new Error(`mutation "${mutation}" no longer applies — its anchor is gone from ${path}. `
          + 'A mutation that cannot be planted proves nothing; re-author it.');
      }
      text = text.replace(mut.find, mut.repl);
    }
    return text;
  };
  const sql = await load(SQL);

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
  const sqlFirst = await load(SQL_FIRST);
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

  // ── (6) THE DIFFICULTY COUNT SCALE (designer ruling b497) ───────────────
  // src/core/bounty.js DRAWS the kill count; hr_accept_bounty CLAMPS it into a
  // server-computed range. The two must agree on the SET of legal counts, not
  // merely on a table of multipliers — so this binds the computed RANGE for
  // every (tier × difficulty) pair, plus the first-contract bracket.
  const sqlCount = await load(SQL_COUNT);
  {
    // (6a) the ruling table, arm by arm. `when 'easy'   then 0.90` — the SQL
    // writes two decimal places so 1 is written 1.00.
    for (const [d, m] of Object.entries(BOUNTY_DIFFICULTY_COUNT)) {
      const wanted = m.toFixed(2);
      ok(new RegExp(`when\\s+'${d}'\\s+then\\s+${wanted.replace('.', '\\.')}(?![0-9])`).test(sqlCount),
        `SQL hr_bounty_count_mult missing the arm 'when '${d}' then ${wanted}' — the ruled count `
        + `multiplier for ${d} is ${m}`);
      ok(bountyCountMult(d) === m,
        `CONTROL: bountyCountMult('${d}') is ${bountyCountMult(d)}, not the table's ${m}`);
    }
    ok(Object.keys(BOUNTY_DIFFICULTY_COUNT).length === Object.keys(BOUNTY_DIFFICULTY_MULT).length,
      'the count table and the reward table cover different difficulty sets — one of them will be '
      + 'asked about a difficulty it has no answer for, and the answer will be silent.');

    // (6b) FAIL CLOSED. An unknown difficulty must produce NO multiplier in SQL
    // (→ no row → `bad_difficulty`), and `normal` on the client. The asymmetry
    // is deliberate and is asserted in BOTH directions, because the day someone
    // "tidies" the SQL with an `else 1.00` a forged difficulty starts being
    // served the normal range instead of refused.
    ok(!/end::numeric;/.test(sqlCount) || !/else\s+[0-9]/.test(
      sqlCount.slice(sqlCount.indexOf('hr_bounty_count_mult'), sqlCount.indexOf('end::numeric;'))),
    'SQL hr_bounty_count_mult has an ELSE arm — an unknown difficulty would be served the default '
    + 'range instead of refused, and the accept\'s bad_difficulty guard would never fire.');
    ok(bountyCountMult('nonsense') === 1 && bountyCountMult(undefined) === 1,
      'CONTROL: an absent/unknown difficulty must be the IDENTITY on the client, so every call '
      + 'site written before this ruling keeps today\'s numbers exactly.');

    // (6c) THE COMPOSITION. If the scaled range ever restates the tier table
    // instead of calling hr_bounty_kill_range(p_tier), assertion (2) above stops
    // covering the numbers the accept actually uses.
    ok(/from\s+public\.hr_bounty_kill_range\(p_tier\)\s+r/.test(sqlCount),
      'SQL hr_bounty_kill_range(int,text) no longer COMPOSES the tier table — it has grown a '
      + 'second copy of the six tier ranges, which is the drift this whole file exists to prevent.');
    ok(/from\s+public\.hr_bounty_first_contract_range\(\)\s+r/.test(sqlCount),
      'SQL hr_bounty_first_contract_range(text) no longer composes the unscaled bracket.');
    ok((sqlCount.match(/greatest\(1, round\(r\.k(min|max) \* m\.dm\)\)::bigint/g) || []).length === 4,
      'SQL: the greatest(1, …) kill floor is missing from one of the four scaled bounds. A zero-kill '
      + 'contract is COMPLETE ON ACCEPTANCE.');

    // (6d) THE FULL VALUE BIND — every (tier × difficulty) pair. The SQL side is
    // re-derived from the SQL's OWN constants (the tier table asserted in (2),
    // the multiplier asserted in (6a)) with the SQL's OWN arithmetic, so this
    // catches a rounding difference as well as a table difference.
    //   Postgres `round(numeric)` rounds half AWAY FROM ZERO; JS `Math.round`
    //   rounds half UP. Every value here is positive, so they agree — and this
    //   loop is what proves it rather than the comment.
    for (let t = 1; t <= 6; t++) {
      for (const d of Object.keys(BOUNTY_DIFFICULTY_COUNT)) {
        const [blo, bhi] = BOUNTY_KILL_COUNTS.cull[t];
        const m = BOUNTY_DIFFICULTY_COUNT[d];
        const sqlLo = Math.max(1, Math.round(blo * m));
        const sqlHi = Math.max(1, Math.round(bhi * m));
        // bountyLevel 2 = past the first-contract bracket, i.e. the tier table.
        const [lo, hi] = bountyCountRange('cull', t, 2, d);
        ok(lo === sqlLo && hi === sqlHi,
          `count drift (tier ${t} ${d}): bounty.js draws ${lo}-${hi}, the SQL clamp allows `
          + `${sqlLo}-${sqlHi}. The board would offer one contract and the turn-in demand another.`);
        ok(lo <= hi, `tier ${t} ${d}: the scaled range is inverted (${lo}-${hi}) — rng.int consumes `
          + 'NO draw on a collapsed range, which shifts the seeded stream and breaks board replay.');
      }
    }

    // (6e) THE FIRST-CONTRACT BRACKET SCALES TOO. The board's first slot is
    // always EASY, so an unscaled server floor silently raises the honest draw.
    for (const d of Object.keys(BOUNTY_DIFFICULTY_COUNT)) {
      const m = BOUNTY_DIFFICULTY_COUNT[d];
      const [lo, hi] = bountyCountRange('cull', BOUNTY_FIRST_CONTRACT_TIER,
        BOUNTY_FIRST_CONTRACT_MAX_LEVEL, d);
      ok(lo === Math.max(1, Math.round(BOUNTY_FIRST_CONTRACT_COUNT[0] * m))
         && hi === Math.max(1, Math.round(BOUNTY_FIRST_CONTRACT_COUNT[1] * m)),
      `first-contract drift (${d}): bounty.js draws ${lo}-${hi} from the b487 bracket.`);
    }
    /* Matched inside the PATCH CONSTRUCTION (`|| '…'`), not anywhere in the
       file: §5's own read-back check contains the same literal, so a loose
       regex would keep passing while the replacement text reverted — measured,
       by planting exactly that mutation. */
    ok(/\|\| '    select kmin into v_kmin from public\.hr_bounty_first_contract_range\(p_difficulty\);'/
      .test(sqlCount),
    'SQL: the accept still takes its first-contract floor from the UNSCALED bracket, so a new '
      + `hunter's honest ${Math.round(BOUNTY_FIRST_CONTRACT_COUNT[0] * BOUNTY_DIFFICULTY_COUNT.easy)}`
      + `-kill easy contract is raised to ${BOUNTY_FIRST_CONTRACT_COUNT[0]}.`);

    // (6f) THE PROPERTY THE RULING ACTUALLY BUYS, re-derived on the JS side the
    // way the migration's §5(d) re-derives it on the SQL side. Two independent
    // derivations of one ruling; a retune that re-inverts the ladder fails both.
    for (let t = 1; t <= 6; t++) {
      let prev = null;
      for (const d of ['easy', 'normal', 'hard', 'elite']) {
        const [lo, hi] = bountyCountRange('cull', t, 2, d);
        const gpk = bountyRewards(t, 'cull', d).gold / ((lo + hi) / 2);
        ok(prev === null || gpk > prev,
          `gold-per-kill is NOT monotonic at tier ${t}: ${d} pays ${gpk.toFixed(3)} and the easier `
          + `difficulty paid ${(prev || 0).toFixed(3)} — "Easy is the best contract on the board" `
          + '(the b489 inversion) is back.');
        prev = gpk;
      }
    }
    // The published tier-1 figures, so the ruling's own numbers are pinned by
    // value and not only by shape.
    const t1 = ['easy', 'normal', 'hard', 'elite'].map((d) => {
      const [lo, hi] = bountyCountRange('cull', 1, 2, d);
      return Number((bountyRewards(1, 'cull', d).gold / ((lo + hi) / 2)).toFixed(2));
    });
    ok(t1[0] === 3 && t1[1] === 3.2 && t1[2] === 3.5 && t1[3] === 3.73,
      `the ruled tier-1 gold-per-kill ladder is 3.00/3.20/3.50/3.73; it now reads ${t1.join('/')}`);

    // (6g) THE ACCEPT ACTUALLY USES IT. Three functions nobody calls would pass
    // every assertion above and change nothing at all.
    ok(/\|\| '    from public\.hr_bounty_kill_range\(v_tier, p_difficulty\);' \|\| chr\(10\)/.test(sqlCount),
      'SQL: the hr_accept_bounty__ungated patch does not clamp on the difficulty-scaled range — '
      + 'the ruling would install three functions NOTHING CALLS and read as shipped.');
    ok(/ANCHOR DRIFT/.test(sqlCount),
      'SQL: the call-site patch is no longer anchored + fail-closed. A template restatement of '
      + 'hr_accept_bounty__ungated silently reverts whichever of its five authors ran last.');
    ok(/bad_difficulty/.test(sqlCount),
      'SQL: the null-bound refusal is gone — an unknown tier/difficulty falls through least/greatest '
      + 'into a NOT NULL violation, i.e. a 500 indistinguishable from the server being down.');
    // The 2026-08-23 security ruling this file is not allowed to relax.
    ok(/p_difficulty not in \(''easy'',''normal'',''hard''\)/.test(sqlCount),
      'SQL: the migration no longer asserts that the accept REFUSES elite. elite is never '
      + 'board-generated and is gated only by the client-owned Bounty-Hunter level, so every elite '
      + 'reaching the server is forged — and it scales tradeable gold 1.75x.');
    for (const fn of ['hr_bounty_count_mult(text)', 'hr_bounty_kill_range(integer, text)',
      'hr_bounty_first_contract_range(text)']) {
      ok(sqlCount.includes(`revoke execute on function public.${fn} from public;`)
         && sqlCount.includes(`revoke execute on function public.${fn} from anon, authenticated, service_role;`),
      `SQL: public.${fn} is not revoked from PUBLIC + the three Supabase roles. Postgres grants `
        + 'EXECUTE to PUBLIC on every new function; a privileged range oracle left client-callable '
        + 'is the whole point of the grant-hygiene rule.');
    }
  }

  return problems;
}

if (process.argv[1]?.endsWith('bounty-drift.mjs')) {
  const argv = process.argv.slice(2);
  const mutateArg = argv.find((a) => a.startsWith('--mutate='));
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${m.why}\n`);
    process.exit(0);
  } else if (argv.includes('--selftest')) {
    /* FALSIFIABILITY. Each planted defect must be CAUGHT. A mutation nothing
       sees is reported as SLIPPED and exits 1 — a guard that cannot demonstrate
       it sees failure is treated as broken, not as a pass. */
    const clean = await bountyDriftGuard();
    if (clean.length) {
      console.log('bounty-drift --selftest: the UNMUTATED run is already failing:');
      for (const x of clean) console.log(`  ✗ ${x}`);
      process.exit(1);
    }
    let slipped = 0;
    for (const id of Object.keys(MUTATIONS)) {
      const p = await bountyDriftGuard(id);
      if (p.length) console.log(`  ✓ ${id} — caught (${p.length} assertion${p.length === 1 ? '' : 's'})`);
      else { console.log(`  ✗ ${id} — SLIPPED: ${MUTATIONS[id].why}`); slipped++; }
    }
    console.log(slipped
      ? `bounty-drift --selftest: ${slipped} mutation(s) SLIPPED`
      : `bounty-drift --selftest: all ${Object.keys(MUTATIONS).length} mutations caught.`);
    process.exit(slipped ? 1 : 0);
  } else {
    const p = await bountyDriftGuard(mutateArg ? mutateArg.slice(9) : undefined);
    if (p.length) { console.log('bounty-drift — FAILED:'); for (const x of p) console.log(`  ✗ ${x}`); process.exit(1); }
    console.log('bounty-drift — bounty.js reward/range/tier/difficulty tables and the migration SQL agree.');
  }
}
