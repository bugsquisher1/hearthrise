#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bounty-accept-bh-clamp.mjs — SA-048, BEHAVIOURALLY.
//
//   node tests/bounty-accept-bh-clamp.mjs             # the guard
//   node tests/bounty-accept-bh-clamp.mjs --list      # the mutation catalogue
//   node tests/bounty-accept-bh-clamp.mjs --selftest  # every mutation CAUGHT
//   node tests/bounty-accept-bh-clamp.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-09-12-bounty-accept-bh-clamp.sql
//             src/core/bounty.js  (unlockedTypes)
//
// ── THE DEFECT THIS EXISTS FOR (SA-048) ─────────────────────────────────
// b504 armed Bounty-Hunter XP: hr_claim_bounty credits player_skills
// (skill_id='bountyHunter'), so the board is a RANKED surface (hr_lb_skills +
// hr_total_level). hr_accept_bounty__ungated gates the target's TIER by SERVER
// COMBAT level ONLY. The board a player can SEE also has a DIFFICULTY ladder in
// src/core/bounty.js generateBountyBoard: slot 1 is always 'easy', slot 2
// 'normal', and slot 3 is 'hard' ONLY once 'streak' unlocks at BH>=15; 'elite'
// is never board-generated. So a BH-1 caller calling the RPC directly with
// difficulty='hard' buys the hard/normal = 1.3x XP multiplier on the ranked
// bountyHunter skill without the board ever offering it — measured on prod
// hr_bounty_reward 2026-09-05: tier-1 cull easy 38 / normal 45 / hard 59 / elite
// 79, the 0.85/1.0/1.3/1.75 ladder. 1.3x, and it is the WHOLE forgeable ranked
// gain.
//
// ── WHY THERE IS NO BOARD-TIER CLAMP (the redirect, 2026-09-05) ──────────
// The first draft ALSO clamped the target TIER to a Bounty-Hunter board-tier
// ladder, on the premise that "the board posts min(combat tier, board tier)".
// Security PROVED that premise FALSE by execution: generateBountyBoard computes
// `tier = unlockedTier(combatLevel)` — combat level only — and
// boardTierForBountyLevel is reachable only via window.getUnlockedBountyTier,
// which has ZERO call sites (dead code). Board depth does NOT move with the BH
// level (CL70/BH1 and CL70/BH20 both post maxTier 6). The pre-existing combat
// gate already blocks a tier above the combat level, so a board-tier clamp would
// close no gap — it would only refuse an honest CL70/BH1 player the tier-6
// contracts their own board legitimately shows (a dead bounty). AC-4 below is the
// explicit anti-lockout proof, and the migration installs NO board-tier lookup.
//
// ── WHAT THIS DRIVES ────────────────────────────────────────────────────
// A REAL character on a FULLY REPLAYED PGlite chain (real PostgreSQL, in
// process — no Docker, no credentials, production untouched), through the REAL
// rate-gated hr_accept_bounty as `authenticated`:
//   AC-2  a BH-1 caller is REFUSED a 'hard' contract (difficulty_locked).
//   AC-4  ANTI-LOCKOUT: an honest combat-99 / BH-1 caller is ALLOWED a tier-6
//         'normal' contract (NOT tier_locked) — the exact case the removed
//         board-tier clamp would have broken. And an honest tier-1 'normal' is
//         ALLOWED with the exact required/tier/rewards it always had.
//   AC-5  the difficulty threshold: 'hard' is REFUSED at BH-14 and ALLOWED at
//         BH-15 — bound to the 'streak' unlock in unlockedTypes.
//   AC-6  hr_bounty_difficulty_unlocked mirrors src/core/bounty.js: 'hard' opens
//         at exactly the 'streak' unlock level (re-derived from unlockedTypes so
//         a future move of that ladder fails HERE), easy/normal always legal,
//         elite/unknown/null never. Two languages, one answer.
//   AC-7  the new difficulty lookup is not executable by anon / authenticated /
//         service_role.
//   AC-8  HONEST PLAY IS UNCHANGED: the chain is replayed a SECOND time stopping
//         BEFORE this migration (upTo 2026-09-11-bounty-hunter-xp.sql), the same
//         honest accept is driven, and the two envelopes are byte-identical.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend.
//   · The PostgREST / JWT path. RPCs are called as SQL with
//     request.jwt.claim.sub set, which is how PostgREST sets it.
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from './schema-replay.mjs';
import { unlockedTypes } from '../src/core/bounty.js';

const MIG = '2026-09-12-bounty-accept-bh-clamp.sql';
/* The migration BEFORE this one in the apply order — the pre-patch state used to
   prove honest play is unchanged (AC-8). It does not touch the accept body. */
const PRE = '2026-09-11-bounty-hunter-xp.sql';

const COMBAT = ['attack', 'strength', 'defense', 'hitpoints', 'prayer', 'ranged', 'magic'];
const MAXED_XP = 13034431;   // level 99 for every combat skill -> unlockedTier 6

/* Short-circuits the MIGRATION's own §3 self-verify so ONLY this guard's
   assertions can see a planted defect. §3 is the strongest catch there is — it
   refuses to install broken — but it runs only at APPLY time, and the regression
   this must still catch in a year is a LATER migration restating the accept body
   from a stale template and never running §3 at all (the b484–b487 class).
   `return` exits the do-block, leaving §2's splice installed and every check
   after it unrun. */
const GATE_BLIND = [
  '  -- (a) the difficulty helper returned the ruling values.',
  '  if true then return; end if;   -- selftest: §3 short-circuited\n'
  + '  -- (a) the difficulty helper returned the ruling values.',
];

const BODY = {
  difficulty_gate_removed: {
    why: "the hard rung of hr_bounty_difficulty_unlocked becomes constant-true, so a BH-1 caller "
       + "accepts a 'hard' contract and buys the 1.3x XP multiplier on the ranked skill",
    find: "    when 'hard'   then coalesce(p_bh_level, 0) >= 15",
    repl: "    when 'hard'   then true",
  },
  difficulty_gate_not_called: {
    why: 'the difficulty_locked branch is spliced out of the accept, so the gate function exists but '
       + 'the RPC never consults it — hard at BH<15 is accepted',
    find: "    || '  if not public.hr_bounty_difficulty_unlocked(p_difficulty, v_bh_lvl) then' || chr(10)\n"
        + "    || '    return jsonb_build_object(''ok'', false, ''error'', ''difficulty_locked'',' || chr(10)\n"
        + "    || '      ''difficulty'', p_difficulty, ''bounty_level'', v_bh_lvl);' || chr(10)\n"
        + "    || '  end if;' || chr(10)",
    repl: "    || '  -- SA-048 difficulty gate removed by mutation' || chr(10)",
  },
  ladder_off_by_one: {
    why: "the 'hard' difficulty threshold opens at BH-20 instead of BH-15, so it no longer matches the "
       + "'streak' unlock in src/core/bounty.js unlockedTypes and would refuse an honest hard the board "
       + 'legitimately posts at BH-15',
    find: '    when \'hard\'   then coalesce(p_bh_level, 0) >= 15',
    repl: '    when \'hard\'   then coalesce(p_bh_level, 0) >= 20',
  },
  difficulty_client_callable: {
    why: 'the difficulty lookup becomes client-executable — a privileged internal left reachable is '
       + 'how the grant-hygiene rule erodes one function at a time',
    find: 'revoke execute on function public.hr_bounty_difficulty_unlocked(text, integer) from anon, authenticated, service_role;',
    repl: 'grant execute on function public.hr_bounty_difficulty_unlocked(text, integer) to authenticated;',
  },
};

const MUTATIONS = { ...BODY };
/* Every body/ACL defect above, repeated with the migration's own §3 short-
   circuited so ONLY this guard's assertions can see it. Without these twins the
   selftest would only prove the MIGRATION refuses to install broken — true, and
   irrelevant the day a later migration restates the body from a stale template. */
for (const id of Object.keys(BODY)) {
  MUTATIONS[id + '_gate_blind'] = {
    why: BODY[id].why + " — with the migration's own §3 short-circuited, so ONLY this guard can see it",
    find: BODY[id].find,
    repl: BODY[id].repl,
    also: [GATE_BLIND],
  };
}

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/** Boot the chain (optionally patched / stopped early) and return a driver. */
async function boot({ mutate, upTo } = {}) {
  let patches;
  if (mutate) {
    const m = MUTATIONS[mutate];
    patches = new Map([[MIG, [[m.find, m.repl], ...(m.also || [])]]]);
  }
  const { db } = await bootReplay({ patches, upTo });
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const asUser = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; } finally { await db.query('reset role').catch(() => {}); }
  };
  const gate = () => q('delete from public.hr_rate_counters');
  const xpForLevel = async (lv) => Number((await q('select xp::text x from public.hr_xp_table where level = $1', [lv]))[0].x);

  // A real character (all seeding via the real creator), combat maxed so the
  // COMBAT gate never refuses a tier — which is exactly what makes the
  // anti-lockout tier-6 accept meaningful and isolates the difficulty gate.
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q("insert into auth.users (id, instance_id, aud, role, email) "
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid, `sa048-${uid}@probe.invalid`]);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await gate();
  const created = await asUser(uid, 'select public.hr_create_character(0) as r');
  await q(`update public.player_skills set xp = $2
             where user_id = $1 and slot = 0 and skill_id = any($3)`, [uid, MAXED_XP, COMBAT]);

  const setBH = async (lv) => {
    const xp = await xpForLevel(lv);
    await q(`insert into public.player_skills (user_id, slot, skill_id, xp)
             values ($1, 0, 'bountyHunter', $2)
             on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [uid, xp]);
  };
  // Burn the first-contract grace (3 journalled cull turn-ins) so honest accepts
  // draw from the TIER table, not the new-hunter bracket — the same technique the
  // difficulty-count guard uses. Written directly to keep this guard uncoupled
  // from the claim path.
  const burnGrace = async () => q(`insert into public.player_ledger (user_id, slot, kind, intent, meta)
           select $1, 0, 'bounty', 'bounty_turnin:burn', '{}'::jsonb from generate_series(1,6)`, [uid]);

  const accept = async (target, type, diff, required) => {
    await gate();
    return asUser(uid, 'select public.hr_accept_bounty(0,$1,$2,$3,$4,$5) as r',
      [`b_${target}_${diff}_${required}`, target, type, diff, required]);
  };
  const monster = async (tier) => (await q(
    'select monster_id from public.hr_bounty_monsters where tier = $1 order by monster_id limit 1', [tier]))[0]?.monster_id;

  return { db, q, uid, created, setBH, burnGrace, accept, monster };
}

/** The main behavioural run against a freshly replayed database. */
async function run(mutate) {
  const A = await boot({ mutate });
  const t1 = await A.monster(1);
  const t6 = await A.monster(6);

  // AC-6: bind the difficulty ladder to src/core/bounty.js BY VALUE. Re-derive
  // the streak unlock from unlockedTypes so a future move of that ladder fails.
  let streakUnlock = null;
  for (let lv = 1; lv <= 99 && streakUnlock === null; lv++) if (unlockedTypes(lv).includes('streak')) streakUnlock = lv;
  const hardAt = async (lv) => (await A.q('select public.hr_bounty_difficulty_unlocked($1,$2) b', ['hard', lv]))[0].b;
  const diffHardBelow = await hardAt(streakUnlock - 1);
  const diffHardAt = await hardAt(streakUnlock);
  const diffEasy1 = (await A.q("select public.hr_bounty_difficulty_unlocked('easy',1) b"))[0].b;
  const diffNormal1 = (await A.q("select public.hr_bounty_difficulty_unlocked('normal',1) b"))[0].b;
  const diffElite = (await A.q("select public.hr_bounty_difficulty_unlocked('elite',99) b"))[0].b;
  const diffNull = (await A.q("select public.hr_bounty_difficulty_unlocked('hard',null) b"))[0].b;

  // AC-7: nobody may call the new lookup.
  const acl = await A.q(`select r as role_name,
      has_function_privilege(r, 'public.hr_bounty_difficulty_unlocked(text,integer)', 'execute') b
    from unnest(array['anon','authenticated','service_role']) r`);

  // AC-2 : the forged difficulty, at BH-1.
  await A.setBH(1);
  const hardAtBH1 = await A.accept(t1, 'cull', 'hard', 100);

  // AC-4 : ANTI-LOCKOUT — an honest combat-99 / BH-1 caller may still take a
  // tier-6 'normal' contract. This is the exact case the removed board-tier
  // clamp would have refused; it MUST be allowed.
  const tier6NormalAtBH1 = await A.accept(t6, 'cull', 'normal', 100);

  // AC-5 : the difficulty threshold, right at the streak unlock.
  await A.setBH(streakUnlock - 1);
  const hardBelowUnlock = await A.accept(t1, 'cull', 'hard', 100);
  await A.setBH(streakUnlock);
  const hardAtUnlock = await A.accept(t1, 'cull', 'hard', 100);

  // AC-4 / AC-8 : honest play, and honest play UNCHANGED. Grace burned so the
  // contract draws from the tier table on BOTH boots.
  await A.setBH(1);
  await A.burnGrace();
  const honestA = await A.accept(t1, 'cull', 'normal', 100);

  let honestB = null;
  if (!mutate) {
    const B = await boot({ upTo: PRE });
    const bt1 = await B.monster(1);
    await B.setBH(1);
    await B.burnGrace();
    honestB = await B.accept(bt1, 'cull', 'normal', 100);
  }

  return {
    created: A.created, t1, t6, streakUnlock,
    diffHardBelow, diffHardAt, diffEasy1, diffNormal1, diffElite, diffNull, acl,
    hardAtBH1, tier6NormalAtBH1, hardBelowUnlock, hardAtUnlock,
    honestA, honestB, skippedHonestB: !!mutate,
  };
}

function grade(o) {
  ok(o.created?.ok === true, `FIXTURE: hr_create_character refused: ${JSON.stringify(o.created)}`);
  ok(o.t1 && o.t6, `FIXTURE: missing a tier-1/6 monster (${o.t1}/${o.t6})`);
  ok(o.streakUnlock === 15,
    `FIXTURE: 'streak' unlocks at BH ${o.streakUnlock} in src/core/bounty.js unlockedTypes, expected 15 — `
    + 'the difficulty ladder the SQL mirrors has moved; re-derive the hard threshold before shipping.');

  // AC-6 : the difficulty ladder agrees with src/core/bounty.js.
  ok(o.diffHardBelow === false && o.diffHardAt === true,
    `AC-6 hard threshold: hr_bounty_difficulty_unlocked('hard', ${o.streakUnlock - 1}) = ${o.diffHardBelow} and `
    + `('hard', ${o.streakUnlock}) = ${o.diffHardAt}; the SQL must open 'hard' at exactly the streak unlock `
    + '(re-derived from unlockedTypes) — a mismatch would refuse an honest hard the board posts.');
  ok(o.diffEasy1 === true && o.diffNormal1 === true,
    `AC-6: easy/normal must be board-legal at BH 1 (easy=${o.diffEasy1}, normal=${o.diffNormal1}) — a narrower `
    + 'gate would refuse an honest new hunter their own board.');
  ok(o.diffElite === false, "AC-6: 'elite' must never be board-legal (it is never board-generated).");
  ok(o.diffNull === false, "AC-6: hr_bounty_difficulty_unlocked('hard', null) must FAIL CLOSED to false.");

  // AC-7 : the new lookup is not client-callable.
  for (const r of o.acl) {
    ok(r.b === false,
      `AC-7: role ${r.role_name} can execute the new SA-048 difficulty lookup (execute=${r.b}). `
      + 'It is an internal of a SECURITY DEFINER body and needs no grant.');
  }

  // AC-2 : hard at BH-1 refused.
  ok(o.hardAtBH1?.ok === false && o.hardAtBH1?.error === 'difficulty_locked',
    `AC-2: a BH-1 caller must be REFUSED a 'hard' contract (difficulty_locked). Got ${JSON.stringify(o.hardAtBH1)}`);

  // AC-4 : ANTI-LOCKOUT — honest tier-6 normal at BH-1 ALLOWED (never tier_locked).
  ok(o.tier6NormalAtBH1?.ok === true && Number(o.tier6NormalAtBH1?.tier) === 6,
    `AC-4 ANTI-LOCKOUT: an honest combat-99 / BH-1 caller must be ALLOWED a tier-6 'normal' contract `
    + `(tier 6, ok true) — NOT tier_locked. This is the exact case the removed board-tier clamp would `
    + `have broken. Got ${JSON.stringify(o.tier6NormalAtBH1)}`);

  // AC-5 : the difficulty threshold through the real RPC.
  ok(o.hardBelowUnlock?.ok === false && o.hardBelowUnlock?.error === 'difficulty_locked',
    `AC-5: 'hard' must be REFUSED one level below the streak unlock. Got ${JSON.stringify(o.hardBelowUnlock)}`);
  ok(o.hardAtUnlock?.ok === true,
    `AC-5: 'hard' must be ALLOWED at the streak unlock (BH ${o.streakUnlock}). Got ${JSON.stringify(o.hardAtUnlock)}`);

  // AC-4 : honest tier-1 normal still works, every run.
  ok(o.honestA?.ok === true && Number(o.honestA?.tier) === 1 && Number(o.honestA?.required) === 100,
    `AC-4: an honest combat-appropriate tier-1 normal contract must be ALLOWED unchanged (tier 1, `
    + `required 100). Got ${JSON.stringify(o.honestA)}`);

  // AC-8 : honest play PROVABLY unchanged vs the pre-migration body.
  if (!o.skippedHonestB) {
    const canon = (e) => JSON.stringify(Object.fromEntries(Object.entries(e || {}).sort()));
    ok(o.honestB && canon(o.honestA) === canon(o.honestB),
      `AC-8: the honest accept envelope changed across the migration.\n      with SA-048: ${canon(o.honestA)}\n`
      + `      without:    ${canon(o.honestB)}\n      The SUCCESS path must be byte-for-byte unchanged.`);
  }
}

export async function bountyAcceptBhClampGuard() {
  problems.length = 0;
  grade(await run());
  return [...problems];
}

const argv = process.argv.slice(2);
const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/bounty-accept-bh-clamp.mjs');
if (RUN_DIRECTLY) {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(34)} ${m.why}`);
    process.exit(0);
  }
  const mutateArg = argv.find((a) => a.startsWith('--mutate='));
  if (argv.includes('--selftest')) {
    let bad = 0;
    for (const id of Object.keys(MUTATIONS)) {
      problems.length = 0;
      let caught = false;
      try { grade(await run(id)); caught = problems.length > 0; } catch (e) { caught = true; }
      console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${id}`);
      if (!caught) { bad++; console.log(`         ${MUTATIONS[id].why}`); }
    }
    console.log(bad ? `\n${bad} mutation(s) NOT caught — the guard is blind to them.`
      : `\nall ${Object.keys(MUTATIONS).length} mutations caught.`);
    process.exit(bad ? 1 : 0);
  }
  grade(await run(mutateArg ? mutateArg.split('=')[1] : undefined));
  if (problems.length) {
    console.error(`bounty-accept-bh-clamp: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(mutateArg ? 0 : 1);
  }
  console.log('bounty-accept-bh-clamp: green — the accept gates difficulty by Bounty-Hunter level '
    + '(hard refused at BH-1, allowed at BH-15, bound to src/core/bounty.js), leaves the tier gate '
    + 'combat-only so an honest tier-6 accept at BH-1 is NOT locked out, keeps the difficulty lookup '
    + 'un-client-callable, and leaves an honest accept byte-identical to the pre-migration body.');
  if (mutateArg) { console.error('the mutation was NOT caught'); process.exit(1); }
}
