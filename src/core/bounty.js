// ============================================================
// src/core/bounty.js — the Bounty Hunter board, generated deterministically.
//
// WHY IT MOVED
// Board generation was already half-seeded (`rand()` routes through the
// core RNG) and half not: `makeBounty` stamped its id with `Date.now()` and
// `Math.random()`, and `generateBountyBoard` picked the third slot's type
// with a bare `Math.random()`. So the same seed produced a different board,
// which means a server that generates the board cannot prove what it
// offered, and a client that predicts one cannot match it.
//
// Everything the generator read off a global — MONSTERS, ITEMS, the
// player's combat level, their Bounty Hunter level, the weapon types they
// own, the clock — is now an argument. Same tables, same numbers, same
// draw order; only the inputs changed shape.
//
// The reward/count TABLES live here because they are the thing the server
// must agree with the client about. legacy.js re-publishes them onto
// `window` through core-bridge so the renderers keep their labels and there
// is one copy, not two.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

export const BOUNTY_KILL_COUNTS = {
  cull: { 1: [80, 120], 2: [75, 110], 3: [70, 100], 4: [60, 90], 5: [55, 80], 6: [50, 70] },
  proof: { 1: [25, 35], 2: [22, 30], 3: [20, 28], 4: [18, 25], 5: [15, 22], 6: [12, 18] },
  streak: { 1: [40, 60], 2: [35, 55], 3: [30, 50], 4: [25, 45], 5: [20, 40], 6: [18, 35] },
};

/* ── THE FIRST-CONTRACT BRACKET (Designer ruling, 2026-08-23) ─────────────
   `cull[1] = [80,120]` is offered as the board's EASY slot to a brand-new
   Bounty Hunter, and 80–120 kills is roughly a hundred fights before the first
   Bounty Mark exists. The death sheet teaches "unlock Auto-Eat", Auto-Eat is
   priced in Marks, and the cheapest route to a Mark was a wall — so the tutorial
   moment pointed at a currency the first session could not reach.

   The ruling: a Bounty Hunter at LEVEL 1 gets a 15–25 kill bracket, and from
   level 2 the tier table applies exactly as before.

   SCOPE, and why it is narrower than "all tiers":
     • TIER 1 ONLY. A player can be Bounty-Hunter level 1 with a level-60 combat
       character (they simply never used the board), and tier 6 pays 13,000 gold
       — handing that for 15 kills is not a first-session ramp, it is a mint.
       Tier 1 is where an actual day-one player stands, and its easy cull pays
       270 gold / 5 Marks, so the blast radius of being wrong here is one
       trivial contract.
     • CULL ONLY. It is the only type unlocked at level 1 (`unlockedTypes`), and
       it is the only type the server can verify (2026-08-23-bounty.sql). The
       `weapon` recursion inherits it arithmetically and is unreachable at
       level 1 by construction.
     • AN EXPLICIT LEVEL IS REQUIRED. A caller that does not pass `bountyLevel`
       gets today's table, not the generous bracket — `undefined|0 === 0` would
       otherwise make every legacy call site a first contract, which is the
       failure mode that turns a UX ruling into an economy change.

   THE SERVER MIRROR is `hr_bounty_first_contract_range` /
   `hr_bounty_accept_grace` in supabase/migrations/2026-08-29-bounty-first-
   contract.sql, bound to these constants by tests/bounty-drift.mjs. The server
   cannot read a Bounty-Hunter LEVEL (BH xp lives in the client blob, not
   player_skills), so it grants the wider floor while the character has fewer
   than FIRST_CONTRACT_GRACE server-journalled turn-ins — a deliberate SUPERSET
   of "level 1", because a range that is wider than the client's only ever lets
   an honest `required` through unchanged, while a narrower one would silently
   raise a 20-kill contract to 80. */
export const BOUNTY_FIRST_CONTRACT_COUNT = [15, 25];
export const BOUNTY_FIRST_CONTRACT_MAX_LEVEL = 1;
export const BOUNTY_FIRST_CONTRACT_TIER = 1;
/* How many server-journalled cull turn-ins the wider floor survives. Derived,
   not chosen: the smallest cull XP a tier-1 contract can pay is
   round(45 × 0.85) = 38 (easy), and level 2 is 83 XP — so a character can hold
   Bounty-Hunter level 1 across at most turn-ins #1, #2 and #3 (0/38/76 xp).
   tests/bounty-drift.mjs re-derives this from XP_TABLE rather than trusting it. */
export const BOUNTY_FIRST_CONTRACT_GRACE = 3;

/** True iff this (type, tier, bountyLevel) draws from the first-contract bracket. */
export function isFirstContract(type, tier, bountyLevel) {
  if (type !== 'cull') return false;
  if ((tier || 0) !== BOUNTY_FIRST_CONTRACT_TIER) return false;
  /* `typeof !== 'number'` FIRST, and it is not defensive padding — it is the
     same trap src/core/auto-eat.js `thresholdFromPct` documents. `Number(null)`
     is 0: finite, in range, and therefore silently "Bounty-Hunter level 0", which
     would hand the generous bracket to every caller that simply forgot to pass a
     level. The absence of a level must mean the tier table. */
  if (typeof bountyLevel !== 'number' || !Number.isFinite(bountyLevel)) return false;
  return bountyLevel <= BOUNTY_FIRST_CONTRACT_MAX_LEVEL;
}

/** The [min,max] the count is drawn from. Pure — the SQL clamp mirrors it. */
export function bountyCountRange(type, tier, bountyLevel) {
  if (isFirstContract(type, tier, bountyLevel)) return BOUNTY_FIRST_CONTRACT_COUNT;
  const table = BOUNTY_KILL_COUNTS[type] || BOUNTY_KILL_COUNTS.cull;
  return table[tier] || table[1];
}

export const BOUNTY_BASE_REWARDS = {
  1: { gold: 320, marks: 6, xp: 45 }, 2: { gold: 800, marks: 11, xp: 95 }, 3: { gold: 1600, marks: 18, xp: 180 },
  4: { gold: 3200, marks: 30, xp: 340 }, 5: { gold: 6500, marks: 48, xp: 620 }, 6: { gold: 13000, marks: 78, xp: 1100 },
};

export const BOUNTY_TYPE_MULT = {
  cull: { gold: 1, marks: 1, xp: 1 }, proof: { gold: 1.2, marks: 1.35, xp: 1.2 }, weapon: { gold: 1, marks: 1.25, xp: 1.45 },
  streak: { gold: 0.9, marks: 1.5, xp: 1.35 }, boss: { gold: 3, marks: 3.5, xp: 3 }, chain: { gold: 4, marks: 4.5, xp: 4 },
};

export const BOUNTY_DIFFICULTY_MULT = { easy: 0.85, normal: 1, hard: 1.3, elite: 1.75 };
export const BOUNTY_TYPE_LABEL = { cull: 'Cull', proof: 'Proof', weapon: 'Weapon', streak: 'Streak', boss: 'Boss', chain: 'Chain' };
export const BOUNTY_DIFFICULTY_LABEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard', elite: 'Elite' };

/* The two unlock ladders. Combat level opens harder TIERS; Bounty Hunter
   level opens richer TYPES. Both are pure lookups on a level the server
   already owns. */
export function unlockedTier(combatLevel) {
  const cl = combatLevel || 0;
  if (cl >= 70) return 6;
  if (cl >= 55) return 5;
  if (cl >= 40) return 4;
  if (cl >= 25) return 3;
  if (cl >= 12) return 2;
  return 1;
}

export function unlockedTypes(bountyLevel) {
  const lv = bountyLevel || 0;
  const t = ['cull'];
  if (lv >= 5) t.push('proof');
  if (lv >= 10) t.push('weapon');
  if (lv >= 15) t.push('streak');
  if (lv >= 30) t.push('boss');
  if (lv >= 40) t.push('chain');
  return t;
}

/* ── WHO SETTLES A TURN-IN — the table the board must not out-run ────────────
   THE BUG THIS ENDS (found by driving the real board, 2026-08-31; Tyler on
   live b486: "there is still a bug with the bounty board").

   Only `cull` has a turn-in. supabase/migrations/2026-08-23-bounty.sql wires
   hr_accept_bounty / hr_claim_bounty for `cull` ONLY and REFUSES every other
   type with `type_not_server_verifiable` — its header says so and says the
   others "keep their existing client behaviour". That sentence stopped being
   true the day gold armed: their existing client behaviour is finalizeBounty(),
   whose gold credit is `if (clientMayWriteRecordField('gold'))`, and under the
   arm that is permanently false. So a proof/weapon/streak contract could be
   ACCEPTED and FILLED and then had nowhere to land — measured: 26/26 on the
   notice, `active` still set, `completed` still 0, no gold, no Marks, no XP, no
   toast, and no reroll button (the rail hides it while a bounty is active). The
   only exit was Abandon, which charges Marks at Bounty-Hunter 10+.

   `unlockedTypes` above is the LADDER and is unchanged (it is what the Unlocks
   strip reads, and tests/core-purity.mjs pins its shape). This table is a
   separate question — not "has the player earned it" but "can the game PAY it"
   — and the board is generated from the intersection.

   'server' = a SECURITY DEFINER RPC verifies and credits it.
   'client' = settled locally by finalizeBounty, so it is offerable only while
              the client still owns gold/Marks (the dormant arm, and the away
              replay's own dormant runs).

   TO RE-ENABLE A TYPE: give it a server verb and move its row to 'server'.
   One word here, and the board posts it again — that is the whole point of it
   being a table. Do NOT re-enable one by deleting the filter in
   generateBountyBoard; that is how it shipped broken the first time. */
export const BOUNTY_TURN_IN = {
  cull: 'server',      // hr_claim_bounty — kills-since-accept, once-guarded
  proof: 'client',     // loot IS counted server-side, but the client CONSUMES the
                       // items on turn-in and inventory is not server-owned yet
  weapon: 'client',    // the sim does not record which weapon was held AT a kill
  streak: 'client',    // the sim tracks no death-streak
  boss: 'client',
  chain: 'client',
};

/** Who settles this type's turn-in: 'server' | 'client'. Unknown → 'client'
    (the conservative answer: an unknown type has no server verb). */
export function bountyTurnIn(type) { return BOUNTY_TURN_IN[type] || 'client'; }

/** May the board POST this type right now?
    @param clientMayPay true while the client still owns gold/Marks. */
export function isOfferableType(type, clientMayPay) {
  return bountyTurnIn(type) === 'server' ? true : !!clientMayPay;
}

/** Weapon types the player can actually satisfy a `weapon` bounty with.
    Sword is always in the set — you are never handed an impossible task
    because you sold your only blade. */
export function ownedWeaponTypes(inventory, equipment, items) {
  const types = new Set(['sword']);
  const inv = inventory || {};
  const eq = equipment || {};
  const equipped = Object.keys(eq).map((k) => eq[k]);
  const cat = items || {};
  Object.keys(cat).forEach((id) => {
    const it = cat[id];
    if (it && it.type === 'weapon' && it.weaponType && ((inv[id] || 0) || equipped.indexOf(id) >= 0)) {
      types.add(it.weaponType);
    }
  });
  return types;
}

export function pickBountyMonster(tier, mode, avoid, monsters, rng) {
  const m = mode || 'normal';
  const tiers = m === 'safe' ? [tier, Math.max(1, tier - 1)]
    : m === 'interesting' ? [tier]
      : [tier, Math.max(1, tier - 1), Math.max(1, tier - 2)];
  const avoidSet = new Set(avoid || []);
  const all = Object.keys(monsters || {}).map((id) => [id, monsters[id]]);
  let pool = all.filter((e) => tiers.indexOf(e[1].tier) >= 0 && !avoidSet.has(e[0]) && !e[1].boss);
  if (m === 'interesting') {
    /* b356: was `weaponWeak === 'neutral'` — the monsters that opted OUT of
       the triangle. `neutral` is retired (DEC-NEUT-01), so that predicate is
       now constant-false and the slot would have degraded to "highest tier".
       The post-taxonomy definition of interesting is the monster that
       DIVERGES from its class — the one whose fight teaches something the
       eleven class sentences do not. `overrideAxes` is written by
       applyClassProfiles, and `.length` on a missing field is guarded so a
       monster from outside the roster still sorts. */
    const teaches = (e) => ((e[1].overrideAxes || []).length ? 1 : 0);
    pool.sort((a, b) => (teaches(b) - teaches(a))
      || ((b[1].tier || 0) - (a[1].tier || 0)));
    pool = pool.slice(0, Math.max(3, pool.length));
  }
  if (!pool.length) pool = all.filter((e) => e[1].tier <= tier && !e[1].boss && !avoidSet.has(e[0]));
  const hit = pool[rng.int(0, pool.length - 1)];
  return (hit && hit[0]) || 'goblin';
}

/** The proof item for a "collect N trophies" bounty: the most common
    non-guaranteed, non-equipment drop the monster has. */
export function pickProofItem(monsterId, monsters, items) {
  const m = (monsters || {})[monsterId];
  if (!m || !m.drops || !m.drops.length) return null;
  const cat = items || {};
  const candidates = m.drops.filter((d) => d.ch < 1 && cat[d.id] && !cat[d.id].type).sort((a, b) => b.ch - a.ch);
  if (candidates[0]) return candidates[0].id;
  const any = m.drops.find((d) => d.ch < 1);
  return (any && any.id) || null;
}

export function bountyCount(type, tier, rng, bountyLevel) {
  if (type === 'weapon') return Math.round(bountyCount('cull', tier, rng, bountyLevel) * 0.85);
  const r = bountyCountRange(type, tier, bountyLevel);
  return rng.int(r[0], r[1]);
}

export function bountyRewards(tier, type, difficulty) {
  const base = BOUNTY_BASE_REWARDS[tier] || BOUNTY_BASE_REWARDS[1];
  const tm = BOUNTY_TYPE_MULT[type] || BOUNTY_TYPE_MULT.cull;
  const dm = BOUNTY_DIFFICULTY_MULT[difficulty] || 1;
  return {
    gold: Math.round((base.gold * tm.gold * dm) / 10) * 10,
    marks: Math.max(1, Math.round(base.marks * tm.marks * dm)),
    xp: Math.round(base.xp * tm.xp * dm),
  };
}

/**
 * @param ctx { monsters, items, rng, now }  — `now` is the caller's clock
 *        (the client's Date.now(), the server's now()); core never reads one.
 *
 * The id keeps its `Date.now()`+random shape so nothing downstream that
 * parses or sorts on it changes, but the random half is now a seeded draw,
 * which is what makes a generated board replayable.
 */
export function makeBounty(type, monsterId, difficulty, ctx) {
  const c = ctx || {};
  const m = (c.monsters || {})[monsterId];
  const tier = (m && m.tier) || 1;
  const diff = difficulty || 'normal';
  const id = type + '_' + monsterId + '_' + (c.now || 0) + '_' + c.rng.int(0, 9998);
  const b = {
    id, type, target: monsterId, difficulty: diff, tier, progress: 0,
    createdAt: c.now || 0, rewards: bountyRewards(tier, type, diff),
  };
  /* `c.bountyLevel` is the FIRST-CONTRACT input and it is threaded through the
     ctx, not re-derived: generateBountyBoard already carries it (it is what
     `unlockedTypes` reads), and a second source for the same level is how the
     board comes to offer a bracket the turn-in does not honour. */
  if (type === 'proof') {
    b.proofItem = pickProofItem(monsterId, c.monsters, c.items);
    if (!b.proofItem) b.type = 'cull';
    /* Deliberately still drawn as 'proof' even when the row degraded to a cull
       above — the REWARD is priced as 'proof' too (see bountyRewards at the top
       of this function), so changing the count here without the reward would be
       a silent nerf. Unchanged from before the first-contract bracket. */
    b.required = bountyCount('proof', tier, c.rng, c.bountyLevel);
  } else if (type === 'weapon') {
    b.required = bountyCount('weapon', tier, c.rng, c.bountyLevel);
    /* b356: `neutral` is retired — every monster answers a real weapon. */
    b.requiredWeaponType = (m && m.weaponWeak) || null;
  } else if (type === 'streak') {
    b.required = bountyCount('streak', tier, c.rng, c.bountyLevel);
    b.streak = 0;
    b.failOnDeath = true;
  } else {
    b.required = bountyCount('cull', tier, c.rng, c.bountyLevel);
  }
  return b;
}

/**
 * Three offers: a safe cull, a mid-tier task, and one "interesting" slot
 * that escalates as the Bounty Hunter ladder unlocks.
 *
 * @param ctx { monsters, items, combatLevel, bountyLevel, ownedTypes, rng, now,
 *              clientMayPay }
 * @returns { board, tier, generatedAt } — the caller stores generatedAt;
 *          core does not know about G.
 *
 * `clientMayPay` gates the BOUNTY_TURN_IN filter above. It defaults to FALSE —
 * fail-closed, so a caller that forgets it posts only server-settled contracts
 * rather than unpayable ones. The legacy adapter passes
 * `clientMayWriteRecordField('gold')`.
 */
export function generateBountyBoard(ctx) {
  const c = ctx || {};
  const tier = unlockedTier(c.combatLevel);
  const types = unlockedTypes(c.bountyLevel);
  const owned = c.ownedTypes || new Set(['sword']);
  const used = [];
  const board = [];
  /* THE SUBSTITUTION IS THE LAST STEP ON PURPOSE. Every type decision below is
     made exactly as before — same predicates, same `rng.chance(0.5)` draw, same
     order — and only the RESULT is mapped to 'cull' when the game cannot settle
     it. Filtering `types` up front would have skipped that chance() draw, which
     shifts the seeded stream and breaks replayability (AWAY-1's contract: the
     same seed must re-run to the same night). Every type costs exactly one
     `rng.int` inside makeBounty, so the substituted board consumes the identical
     number of draws in the identical order. */
  const offer = (t) => (isOfferableType(t, c.clientMayPay) ? t : 'cull');

  const m1 = pickBountyMonster(tier, 'safe', used, c.monsters, c.rng);
  used.push(m1);
  board.push(makeBounty('cull', m1, 'easy', c));

  const secondType = types.indexOf('proof') >= 0 ? 'proof' : 'cull';
  const m2 = pickBountyMonster(tier, 'normal', used, c.monsters, c.rng);
  used.push(m2);
  board.push(makeBounty(offer(secondType), m2, 'normal', c));

  let thirdType = types.indexOf('streak') >= 0
    ? (c.rng.chance(0.5) ? 'streak' : (types.indexOf('weapon') >= 0 ? 'weapon' : 'cull'))
    : (types.indexOf('weapon') >= 0 ? 'weapon' : 'cull');
  const m3 = pickBountyMonster(tier, 'interesting', used, c.monsters, c.rng);
  used.push(m3);
  if (thirdType === 'weapon') {
    /* Never offer "kill 60 of these with a mace" to someone who owns no mace. */
    const weak = (c.monsters || {})[m3] && (c.monsters || {})[m3].weaponWeak;
    if (!weak || !owned.has(weak)) thirdType = 'cull';
  }
  board.push(makeBounty(offer(thirdType), m3, types.indexOf('streak') >= 0 ? 'hard' : 'normal', c));

  return { board, tier, generatedAt: c.now || 0 };
}
