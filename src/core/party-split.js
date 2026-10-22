// ============================================================
// src/core/party-split.js — THE PARTY LOOT SPLIT (HUNT_SCREEN_SPEC §3.9 #3;
// src/data/party.js lootSplit 'even_value'; lane S1, 2026-10-17)
//
// THE ONE SPLIT (spec §1.1 one-path table: "the party lane adopts it as THE
// split or deletes it; never two split functions"). The M8 contribution-
// weighted arithmetic that lived here (damage-share gold, a floored XP vector,
// the Fellowship bonus) was the retired M8 party engine's and is deleted with
// it; nothing reads it. A solo hunt is a party of one, and every rule below is
// the identity for n = 1.
//
//   GOLD   a kill's gold is split EVENLY between the heroes in the instance
//          at the kill; the integer remainder goes to the first (the lowest
//          (user_id, slot)), so nothing is minted or lost: Σ shares = total.
//   ITEMS  each COMMON unit goes ROUND-ROBIN from a seeded start: common unit k
//          of a kill goes to heroes[(offset + k) mod n], `offset` one draw on the
//          instance's `r` stream (src/core/hunt-rewards.js), so over a hunt every
//          hero takes every n-th unit and no seat is favoured.
//   RARES  a RARE unit (drops.js band 'rare': a row at 5% or less that is not the
//          equipment slot; every rare-carrier and relic row is one) goes to THE
//          RARE ROLL (Tyler L8, 2026-10-14): each ELIGIBLE hero rolls 1..sides
//          (src/data/party.js PARTY.rareRoll) on the same server-only `r` stream
//          (the browser's prediction never holds it), the highest wins, a tie
//          re-rolls among the tied; a winner cannot win again until every hero in
//          the instance has (the rotation, `rareWon` on the world below: a hero who
//          left is dropped from it, one who joined is eligible at once). Solo: the
//          hero wins and no die is drawn.
//   XP     not split here: src/core/hunt/xp-share.js (base share = monster XP /
//          heroes alive at the kill, times each hero's own multiplier).
//
// PURE ESM, dual-runtime. No clock, no dice of its own, no Math.random.
// ============================================================

import { PARTY } from '../data/party.js?v=0.2.28';

/* THE RARE ROLL'S ROTATION, persisted on the instance world (world-state.js composes it):
   the unit ids of the heroes who have won a rare roll since everyone last had one. A settle
   cut anywhere carries it, so N windows and one span hand the same rares to the same heroes. */
export const PERSISTED = Object.freeze({ unit: Object.freeze([]), world: Object.freeze([['rareWon', 'json']]), pack: Object.freeze([]) });

/** `total` split evenly into `n` whole shares, the remainder to share 0. */
export function splitEven(total, n) {
  const t = Math.floor(Number(total));
  const k = Math.floor(Number(n));
  if (!Number.isSafeInteger(t) || t < 0) throw new Error('splitEven: total must be a whole number >= 0, got ' + total);
  if (!Number.isSafeInteger(k) || k < 1) throw new Error('splitEven: n must be a whole number >= 1, got ' + n);
  const each = Math.floor(t / k);
  const out = new Array(k).fill(each);
  out[0] += t - each * k;
  return out;
}

/** Which of `n` heroes takes unit `k` of a kill whose round-robin starts at `offset`. */
export function itemOwner(k, n, offset) {
  const m = Math.floor(Number(n));
  if (!Number.isSafeInteger(m) || m < 1) throw new Error('itemOwner: n must be a whole number >= 1, got ' + n);
  const o = Math.floor(Number(offset)) || 0;
  return (((o + Math.floor(Number(k))) % m) + m) % m;
}

/**
 * THE RARE ROLL of one rare unit among `heroes` (unit ids, in unit-id order) with the rotation
 * `won` (the world's rareWon, or null), drawing on `rng` (the server-only `r` stream).
 * Answers { winner (a unit id), rolls { id: n } (the first round; {} when one hero could win),
 * reroll { id: n } | null (the deciding round after a tie), won (the rotation after this roll) }.
 */
export function rareRoll(heroes, won, rng) {
  const ids = (Array.isArray(heroes) ? heroes : []).filter(Number.isSafeInteger);
  if (!ids.length) throw new Error('rareRoll: no hero to roll for');
  const here = new Set(ids);
  /* A hero who left is dropped; once every hero here has won, the rotation starts over. */
  let had = (Array.isArray(won) ? won : []).filter((id) => here.has(id));
  if (ids.every((id) => had.includes(id))) had = [];
  const open = ids.filter((id) => !had.includes(id));
  const { sides, maxRounds } = PARTY.rareRoll;
  let rolls = {}; let reroll = null; let winner = open[0];
  if (open.length > 1) {
    let tied = open;
    for (let round = 0; ; round++) {
      const r = {};
      for (const id of tied) r[id] = rng.int(1, sides);
      if (round === 0) rolls = r; else reroll = r;
      const top = Math.max(...tied.map((id) => r[id]));
      tied = tied.filter((id) => r[id] === top);
      /* A tie past maxRounds (1 in sides^maxRounds) falls to the lowest unit id: never an unbounded loop. */
      if (tied.length === 1 || round + 1 >= maxRounds) { winner = tied[0]; break; }
    }
  }
  return { winner, rolls, reroll, won: had.concat([winner]) };
}
