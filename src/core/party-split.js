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
//   ITEMS  each dropped unit goes ROUND-ROBIN from a seeded start: unit k of a
//          kill goes to heroes[(offset + k) mod n], `offset` one draw on the
//          instance's `r` stream (src/core/hunt-rewards.js), so over a hunt every
//          hero takes every n-th unit and no seat is favoured.
//   XP     not split here: src/core/hunt/xp-share.js (base share = monster XP /
//          heroes alive at the kill, times each hero's own multiplier).
//
// PURE ESM, dual-runtime. No clock, no dice of its own, no Math.random.
// ============================================================

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
