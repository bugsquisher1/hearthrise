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
    pool.sort((a, b) => ((b[1].weaponWeak === 'neutral') - (a[1].weaponWeak === 'neutral'))
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

export function bountyCount(type, tier, rng) {
  if (type === 'weapon') return Math.round(bountyCount('cull', tier, rng) * 0.85);
  const table = BOUNTY_KILL_COUNTS[type] || BOUNTY_KILL_COUNTS.cull;
  const r = table[tier] || table[1];
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
  if (type === 'proof') {
    b.proofItem = pickProofItem(monsterId, c.monsters, c.items);
    if (!b.proofItem) b.type = 'cull';
    b.required = bountyCount('proof', tier, c.rng);
  } else if (type === 'weapon') {
    b.required = bountyCount('weapon', tier, c.rng);
    b.requiredWeaponType = (m && m.weaponWeak === 'neutral') ? 'neutral' : (m && m.weaponWeak);
  } else if (type === 'streak') {
    b.required = bountyCount('streak', tier, c.rng);
    b.streak = 0;
    b.failOnDeath = true;
  } else {
    b.required = bountyCount('cull', tier, c.rng);
  }
  return b;
}

/**
 * Three offers: a safe cull, a mid-tier task, and one "interesting" slot
 * that escalates as the Bounty Hunter ladder unlocks.
 *
 * @param ctx { monsters, items, combatLevel, bountyLevel, ownedTypes, rng, now }
 * @returns { board, tier, generatedAt } — the caller stores generatedAt;
 *          core does not know about G.
 */
export function generateBountyBoard(ctx) {
  const c = ctx || {};
  const tier = unlockedTier(c.combatLevel);
  const types = unlockedTypes(c.bountyLevel);
  const owned = c.ownedTypes || new Set(['sword']);
  const used = [];
  const board = [];

  const m1 = pickBountyMonster(tier, 'safe', used, c.monsters, c.rng);
  used.push(m1);
  board.push(makeBounty('cull', m1, 'easy', c));

  const secondType = types.indexOf('proof') >= 0 ? 'proof' : 'cull';
  const m2 = pickBountyMonster(tier, 'normal', used, c.monsters, c.rng);
  used.push(m2);
  board.push(makeBounty(secondType, m2, 'normal', c));

  let thirdType = types.indexOf('streak') >= 0
    ? (c.rng.chance(0.5) ? 'streak' : (types.indexOf('weapon') >= 0 ? 'weapon' : 'cull'))
    : (types.indexOf('weapon') >= 0 ? 'weapon' : 'cull');
  const m3 = pickBountyMonster(tier, 'interesting', used, c.monsters, c.rng);
  used.push(m3);
  if (thirdType === 'weapon') {
    /* Never offer "kill 60 of these with a mace" to someone who owns no mace. */
    const weak = (c.monsters || {})[m3] && (c.monsters || {})[m3].weaponWeak;
    if (weak !== 'neutral' && !owned.has(weak)) thirdType = 'cull';
  }
  board.push(makeBounty(thirdType, m3, types.indexOf('streak') >= 0 ? 'hard' : 'normal', c));

  return { board, tier, generatedAt: c.now || 0 };
}
