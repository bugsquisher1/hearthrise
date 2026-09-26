// ============================================================
// src/core/party-split.js — THE PARTY SPLIT, AND IT IS ARITHMETIC
//
// M8 slice S3 (docs/planning/WORLD_TICK_DESIGN.md §18.5), built against
// §18.1 "The split rule", §18.2.1a (where attribution lives), §18.2.6's three
// parity properties, §18.4 T-2/T-3b/T-4/T-5/T-8/T-11, and Security's rulings in
// §18-SEC.1 (S-5, S-6, S-10), §18-SEC.3's S3 line and §18-SEC-2.3's S3 brief.
//
// ── WHAT THIS FILE IS ───────────────────────────────────────────────────────
// One pure function of the window's per-member contributions, returning the two
// share vectors a party settle pays from. §18's one-sentence design: *a party is
// a ROSTER UNIT, not a new engine* — so this is "the split is arithmetic the
// settle does under the row locks it already holds", and nothing else. It holds
// no state, reads no clock, rolls no dice and writes nothing. It is the same
// code in the live tick and in the away replay because there is only one copy of
// it (`AWAY-12`), and it is dual-runtime for the same reason src/core/combat-sim
// .js is: `hr_party_tick_settle`'s edge half imports these exact bytes.
//
// ── THE TWO VECTORS, AND WHY THERE ARE TWO (S-5) ────────────────────────────
// §18.1: *"Contribution-weighted by damage dealt. Gold and the item-assignment
// lottery follow that weight EXACTLY. XP — and XP alone — carries a 50%-of-
// equal-share floor, and the floor itself applies only to a member above a
// 25%-of-equal-share participation threshold."*
//
//   dmg_bp  — raw damage share. GOLD and the drop LOTTERY WEIGHT. No floor, no
//             threshold, no adjustment of any kind, at any level of
//             participation. This is what makes §18.4 T-4 hold literally: a
//             party cannot be a gold pipe to a fresh account, because a member
//             who did not fight is paid what they fought for and no more.
//   xp_bp   — the floored vector. XP only, the one quantity that cannot be
//             sold, ranked against another player's wallet or carried to
//             another account.
//
// The previous design floored BOTH, and Security measured what that was: three
// alts each clearing the threshold collected 37.5% of the party's GOLD for ~19%
// of its damage — a 2× subsidy, funded by scaling the real fighters down, which
// is a directed transfer with a fairness argument stapled to it. So the whole of
// S-5 is that `xpFloor` never touches `dmg_bp`, and the whole of the mutation
// proof is that applying it to gold or to the lottery weights goes RED
// (tests/party-split.mjs --mutate, arms M3 and M4).
//
// ── THE REMAINDER RULE, AND THE CLAUSE THAT IS NOT IMPLEMENTED (S-6) ────────
// §18.1: *"The integer remainder goes to the LOWEST `(user_id, slot)` among the
// tied-largest shares."* This file sends it to the lowest `(user_id, slot)` in
// the party, UNCONDITIONALLY — the "among the tied-largest shares" clause is
// deliberately NOT implemented as a filter, and that is a reading this lane owes
// Security rather than a liberty it took.
//
// The reason is §18.4 T-3b's own sentence, which is the finding the rule exists
// to answer: *"the member choosing the boundaries can no longer position
// themselves to collect every remainder."* A member cannot choose their user id
// or their slot, but they CAN choose their damage — and filtering the candidate
// set to the tied-largest shares hands every remainder to the biggest hitter,
// who is in ordinary play the same member who chooses the settle boundaries.
// That is the lever S-6 priced at eight boundaries a day, restored at the one
// place S-6 closed it. Filtering first and tie-breaking second is therefore the
// OLD rule wearing the new rule's tie-break, and reading the sentence that way
// makes the correction it announces a no-op.
//
// Nothing is minted or lost either way (§18.1), so the whole content of the rule
// is *who cannot position themselves for it*, and unconditional-lowest is the
// only reading under which the answer is "nobody".
//
// ── VIGOUR-DRY: A PAY MULTIPLIER, NOT A SHARE (S-10, and (P-c)) ─────────────
// §18.1: *"A Vigour-dry member takes `VIGOUR_DRY_MULT = 0.25` on their OWN
// share, and on nobody else's."* So the reduction is applied AFTER the split,
// to that member's own payout, and the freed value is **not redistributed** —
// §18.2.6 (P-c) is explicit that the sum over members is then strictly LESS
// than the party total, and calls that out as the reason the conservation
// property is a safe-direction inequality rather than an equality:
//
//     paid ≤ produced + fellowship   (always, on every quantity)
//     Σ pre-multiplier member share = produced   (exactly)
//
// Both statements are computable from this file: `splitParty` returns the
// PRE-multiplier vectors (which is why each sums to exactly 10,000 bp, (P-b)),
// and `partyPayout` applies the multiplier and names every term — `preGold`,
// `preXp`, `fellowship`, `dryLost` — so the inequality and the equality
// underneath it are both one line in a guard instead of an argument.
//
// `VIGOUR_DRY_MULT` is imported, never retyped: src/core/hunt.js derives it from
// `AMMO_DRY_MULT` precisely so "dry means a quarter" is learned once and true
// twice, and Tyler may set it to 0.00 in one edit (hunt.js §4.6). A literal 0.25
// here would be the drift that derivation exists to prevent.
//
// ── THE JOURNAL OBJECT IS SEVEN KEYS, FROZEN (S-1, S-2, B-A5) ──────────────
// Attribution is JOURNAL, never DELTA: `2026-09-14-hr-apply-restatement.sql`
// declares `c_delta_keys` and refuses every top-level key outside it by name, so
// three attribution keys on the delta means a party that never pays anybody.
// The delta a party settle hands `hr_apply` is key-for-key a solo combat
// settle's, and the party rides inside `journal.meta` as ONE nested key
// (§18.2.1a — the `att` precedent).
//
// `PARTY_JOURNAL_KEYS` is that object's key set AS AN EQUALITY, which is B-A5:
// `metaProblems()` bounds TOP-LEVEL keys only, so nesting buys the count and
// does not buy a bound. Exactly these seven, no more and no fewer:
//
//     { id, hunt, dmg_bp, xp_bp, floor, fellow_bp, roll }
//
// `floor` is the SIGNED bp the XP floor moved this member relative to the damage
// vector — `xp_bp - dmg_bp`. That reading is chosen over a boolean or a repeated
// constant because it is the only one that carries per-member information AND
// makes the subsidy auditable from the ledger: Σ floor over the party is exactly
// 0, so every basis point a floored member gained is a basis point named against
// the member it came from. A boolean says a floor happened; this says what it
// did, which is what (P-c) has to be able to read.
//
// The member's dry multiplier is deliberately NOT an eighth key. It does not
// need to be: `dmg_bp` plus the delta summary `hr_apply` already writes
// (`meta.delta.g`, `meta.delta.x`) determine it, because any non-dry member's
// row gives the party's produced total and each dry member's reduction is then
// that total times their own bp minus what they were paid. Adding a key to carry
// a derivable number would widen the nested allowlist for nothing, and B-A5's
// whole point is that the nested set is a bound rather than a budget.
//
// ── DETERMINISM ─────────────────────────────────────────────────────────────
// No `Date.now`, no `Math.random`, no floats in any output. The item lottery's
// `roll` is an INPUT — the seed seam belongs to the caller, exactly as it does
// in src/core/combat-sim.js — so the same window replays to the same assignment
// from the ledger, which is what makes §18.4 T-1's *"the whole distribution is
// replayable"* true rather than hoped for. Internally the vectors are computed
// in BigInt over exact common denominators; there is no fixed-point scaling and
// therefore no precision to argue about.
// ============================================================

import { VIGOUR_DRY_MULT } from './hunt.js?v=554';

/** Basis points. Every share in this file is an integer out of this. */
export const BP = 10000;

/** §18.1: a party is two to four characters. ONE is accepted by the split and
    only by the split — §18.2.6 (P-a) degenerate parity compares a one-member
    party's delta against the solo path byte-for-byte, and §18.5's S5 pre-arm bar
    requires a real one-member party in the 48 h shadow run. Membership itself is
    S1's `size_cap check (size_cap between 2 and 4)` and is not re-litigated
    here: a roster this function never sees is a roster it cannot police. */
export const PARTY_MAX = 4;

/** The nested key set of `journal.meta.party`, frozen (§18.2.1a, B-A5). This is
    an EQUALITY, not a minimum: `partyJournal` emits exactly these and the guard
    asserts the set both ways. Order is the order §18.2.1a writes it in. */
export const PARTY_JOURNAL_KEYS = Object.freeze(
  ['id', 'hunt', 'dmg_bp', 'xp_bp', 'floor', 'fellow_bp', 'roll']);

/** The fellowship bonus, in bp of a member's XP: +5% per member beyond the
    first, capped at +15% (§18.1 "Why party at all"). `n` is the count of members
    ABOVE the participation threshold — a parked member neither grants the bonus
    nor receives it, which is what keeps four boxed alts strictly worse than four
    solo hunts (§18.4 T-8). */
export const FELLOWSHIP_STEP_BP = 500;
export const FELLOWSHIP_MAX_BP = 1500;

/**
 * The participation threshold: 25% of an equal share (§18.1). In a four-party
 * that is 6.25%, which is the number §18.1 states. Returned as bp for display
 * and for the journal; the ELIGIBILITY TEST ITSELF never uses this rounded
 * value — see `isEligible`, which compares raw damage counts exactly, because a
 * member should not become parked by a rounding step.
 */
export function participationThresholdBp(n) {
  return Math.floor((BP / 4) / n);
}

/**
 * The XP floor: 50% of an equal share (§18.1). 12.5% in a four-party. Same note
 * as above — this is the reported line, not the arithmetic; the vector is built
 * from exact integer weights in `xpWeights`.
 */
export function xpFloorBp(n) {
  return Math.floor((BP / 2) / n);
}

/** The fellowship line for a party with `eligible` members above the threshold. */
export function fellowshipBp(eligible) {
  const beyondFirst = Math.max(0, Math.floor(eligible) - 1);
  return Math.min(FELLOWSHIP_MAX_BP, FELLOWSHIP_STEP_BP * beyondFirst);
}

/** `VIGOUR_DRY_MULT` as integer bp, so no output of this file is a float. It is
    DERIVED from src/core/hunt.js (which derives it from `AMMO_DRY_MULT`) and is
    never a literal here — see the header. */
export function dryMultBp() {
  return Math.round(VIGOUR_DRY_MULT * BP);
}

/**
 * ELIGIBILITY, ON RAW COUNTS, EXACTLY. A member is above the participation
 * threshold when their damage share is at least 25% of an equal share:
 *
 *     d_i / D  ≥  (1/4) · (1/n)     ⟺     4 · n · d_i  ≥  D
 *
 * The right-hand form is integer arithmetic on the numbers the engine actually
 * counted, so the boundary case is decided by the fight rather than by the order
 * in which the vector was rounded. A member exactly ON the threshold is INSIDE
 * it (`≥`), matching §18.1's *"a member holding ≥ 6.25% … is paid max(raw, 12.5%)"*.
 */
function isEligible(damage, total, n) {
  if (total <= 0n) return true;              // a window with no damage parks nobody
  return 4n * BigInt(n) * damage >= total;
}

/**
 * APPORTION AN INTEGER TOTAL BY INTEGER WEIGHTS, CONSERVING EXACTLY.
 *
 * Every integer vector in this file goes through here — the two bp vectors and
 * the two payout vectors — so the remainder rule is written ONCE and a mutation
 * of it is a mutation of all four (which is what makes --mutate arm M5 a real
 * proof rather than a proof about one call site).
 *
 * Each member gets `floor(total · w_i / Σw)`; the shortfall, which is strictly
 * less than the member count, goes WHOLE to `lowest` — the index of the lowest
 * `(user_id, slot)` in the party. See the header for why that is unconditional.
 *
 * Σw = 0 (no damage anywhere, or a degenerate weight set) splits equally and
 * still conserves, because "the vector sums to the total" is a structural
 * property of this function and not a property of its inputs.
 */
function apportion(total, weights, lowest) {
  const t = BigInt(total);
  const sum = weights.reduce((a, b) => a + b, 0n);
  const n = weights.length;
  let out;
  if (sum <= 0n) {
    const each = t / BigInt(n);
    out = weights.map(() => each);
  } else {
    out = weights.map((w) => (t * w) / sum);
  }
  const rem = t - out.reduce((a, b) => a + b, 0n);
  out[lowest] += rem;
  return out.map((x) => Number(x));
}

/**
 * THE XP WEIGHTS, AS EXACT INTEGERS.
 *
 * §18.1: a member above the threshold is paid `max(raw_share, 50% of equal)`;
 * a member below it is paid `raw_share`; and the vector is *"renormalised to
 * exactly 10,000 bp … after the floor by scaling the above-floor members down
 * proportionally."*
 *
 * Written over a common denominator Q = 2·n·D, so every quantity below is an
 * integer and there is no rounding until `apportion` converts to bp:
 *
 *     raw_i = 2·n·d_i          (i.e. d_i/D, in units of 1/Q)
 *     F     = D                (i.e. 1/(2n), the floor, in the same units)
 *
 * Three disjoint sets, exactly §18.1's three sentences:
 *
 *     P (parked)   raw_i below the threshold → paid raw, never lifted, never
 *                  scaled. A parked member "is paid his raw share in everything
 *                  and grants no fellowship bonus".
 *     L (lifted)   eligible and raw_i < F → paid exactly F.
 *     A (above)    raw_i ≥ F → scaled down proportionally to fund L.
 *
 * `need` is what L costs; `poolA` is what A holds. Multiplying every weight by
 * `poolA` clears the only division, so the returned weights are exact integers
 * summing to Q·poolA — which is why the bp vector this produces is the
 * renormalised one and not an approximation of it.
 *
 * ⚠ `poolA > need` ALWAYS, and the clamp below is therefore unreachable. Proof:
 *   eligibility gives raw_i ≥ F/2 for every i ∈ L, so need ≤ |L|·F/2; every
 *   i ∈ A has raw_i ≥ F and Σ over all members is Q = 2n·F, so
 *   poolA > 2n·F − |L|·F − |P|·F/2, and with |L| + |P| ≤ n the inequality
 *   2n ≥ 1.5·|L| + 0.5·|P| holds with margin for every n. A is never empty
 *   either: the largest damage share has raw ≥ 2D > F. The `max(0, …)` stands
 *   anyway so that "each vector sums to 10,000" is STRUCTURAL rather than
 *   argued — a guard should not depend on a proof in a comment.
 */
function xpWeights(dmg, total, n, eligible) {
  if (total <= 0n) return dmg.map(() => 1n);
  const N = BigInt(n);
  const raw = dmg.map((d) => 2n * N * d);
  const F = total;
  const lifted = raw.map((r, i) => eligible[i] && r < F);
  const above = raw.map((r) => r >= F);
  let need = 0n;
  let poolA = 0n;
  for (let i = 0; i < n; i++) {
    if (lifted[i]) need += F - raw[i];
    if (above[i]) poolA += raw[i];
  }
  const scaled = poolA > need ? poolA - need : 0n;
  return raw.map((r, i) => {
    if (above[i]) return r * scaled;
    if (lifted[i]) return F * poolA;
    return r * poolA;                       // parked: raw, untouched
  });
}

/** The index of the lowest `(user_id, slot)`. User ids are compared as the
    canonical lowercase hex Postgres renders them, so this ordering is the same
    one `order by user_id, slot` gives the settle — the tie-break must not depend
    on which side of the seam it is computed on. */
function lowestIndex(members) {
  let best = 0;
  for (let i = 1; i < members.length; i++) {
    const a = members[i];
    const b = members[best];
    const au = String(a.user).toLowerCase();
    const bu = String(b.user).toLowerCase();
    if (au < bu || (au === bu && Number(a.slot) < Number(b.slot))) best = i;
  }
  return best;
}

/**
 * THE SPLIT.
 *
 * @param {object} o
 * @param {string} o.partyId          `party.id`, journalled as `id`
 * @param {string} o.huntId           `party_hunt.id`, journalled as `hunt`
 * @param {Array}  o.members          1..4 of
 *        `{ user, slot, damage, knockedOut?, vigourDry? }`
 *        · `damage` — the member's own damage in THIS window, as the engine
 *          counted it. A non-negative integer; the settle reads it from the
 *          simulation, never from a client, which is the whole of §18.4 T-5.
 *        · `knockedOut` — recorded, never priced. §18.1: a member who falls
 *          "watches their own weighted share fall while the others keep
 *          fighting — the honest consequence, needing no extra rule", and their
 *          XP is still floored if their damage across the WHOLE window leaves
 *          them above the threshold. So this flag changes no number here; it is
 *          carried so the Analyzer and the Vigour charge (which is priced on
 *          `fight_ms`, not on this) can read one object.
 *        · `vigourDry` — the member's own pay multiplier, applied by
 *          `partyPayout` and by nothing else.
 * @param {number} o.roll             the window's lottery roll. An INPUT.
 * @returns {object} the split, pre-multiplier.
 *
 * There is no `attended` input and there must never be one: §18.2.3 invariant 9
 * rules that attended kill credit is NOT ACCEPTED for a character in a live
 * party hunt, so §16.6's attended bucket is empty for every party member and the
 * emptiness is itself the assertion that the fence is live (§18-SEC.2, 8c). An
 * attended term here would be a second way to be paid for a party window — the
 * thing invariant 8 closed four doors to stop.
 */
export function splitParty(o) {
  const src = Array.isArray(o?.members) ? o.members : [];
  const n = src.length;
  if (n < 1 || n > PARTY_MAX) {
    throw new RangeError(`party-split: ${n} members, expected 1..${PARTY_MAX}`);
  }
  const dmg = src.map((m) => {
    /* Garbage in is ZERO, never a throw and never a share. `Number.isFinite`
       is load-bearing: `BigInt(Infinity)` RAISES, and a raise here aborts the
       whole party settle for all four members down a path §18.2.5a does not
       name — an unhandled exception is not one of its three refusals, so the
       window would neither pay nor refuse. NaN, a string and a negative all
       already floor to 0; a non-finite number was the one hole. */
    const d = Math.floor(Number(m?.damage) || 0);
    return BigInt(Number.isFinite(d) && d > 0 ? d : 0);
  });
  const total = dmg.reduce((a, b) => a + b, 0n);
  const lowest = lowestIndex(src);

  const eligible = dmg.map((d) => isEligible(d, total, n));
  const eligibleCount = eligible.filter(Boolean).length;
  const fellowBp = fellowshipBp(eligibleCount);
  const dryBp = dryMultBp();

  /* GOLD AND THE LOTTERY: the raw damage vector, and nothing else touches it. */
  const dmgBp = apportion(BP, total > 0n ? dmg : dmg.map(() => 1n), lowest);
  /* XP: the floored vector, renormalised. */
  const xpBp = apportion(BP, xpWeights(dmg, total, n, eligible), lowest);

  const members = src.map((m, i) => {
    const parked = !eligible[i];
    const dry = m?.vigourDry === true;
    const member = {
      user: m.user,
      slot: Number(m.slot),
      damage: Number(dmg[i]),
      dmg_bp: dmgBp[i],
      xp_bp: xpBp[i],
      /* The signed bp the floor moved this member. Σ over the party is 0. */
      floor: xpBp[i] - dmgBp[i],
      /* Paid only to members above the threshold (§18.1). */
      fellow_bp: parked ? 0 : fellowBp,
      /* The lottery weight IS the damage vector — §18.1, "no floor, no
         threshold, no adjustment". It is a separate field only so that a
         mutation which floors it is a mutation this file can be red about. */
      lottery_bp: dmgBp[i],
      parked,
      knockedOut: m?.knockedOut === true,
      vigourDry: dry,
      /* The pay multiplier, in bp. NOT a journal key — see the header. */
      dry_bp: dry ? dryBp : BP,
    };
    return member;
  });

  return {
    partyId: o?.partyId ?? null,
    huntId: o?.huntId ?? null,
    n,
    totalDamage: Number(total),
    thresholdBp: participationThresholdBp(n),
    floorBp: xpFloorBp(n),
    fellowBp,
    eligibleCount,
    lowest,
    roll: Math.floor(Number(o?.roll) || 0),
    members,
  };
}

/**
 * `journal.meta.party` for ONE member — exactly `PARTY_JOURNAL_KEYS`, in order.
 *
 * This is the whole of the party's presence in the delta `hr_apply` receives
 * (§18.2.1a). The delta is otherwise key-for-key a solo combat settle's, which
 * is what makes §18.2.6 (P-a) statable as a byte comparison after deleting
 * `{journal,meta,party}` — and what keeps `c_delta_keys` from refusing the first
 * member of every party in the game.
 */
export function partyJournal(split, index) {
  const m = split.members[index];
  return {
    id: split.partyId,
    hunt: split.huntId,
    dmg_bp: m.dmg_bp,
    xp_bp: m.xp_bp,
    floor: m.floor,
    fellow_bp: m.fellow_bp,
    roll: split.roll,
  };
}

/**
 * THE ITEM LOTTERY. §18.1: drops roll ONCE PER KILL, never once per member, and
 * each roll is assigned to one member by a lottery weighted with the DAMAGE
 * vector and seeded from the window seed — so expected item value tracks damage
 * dealt and a one-quantity sword lands in exactly one bag.
 *
 * `roll` is an input and is reduced mod 10,000 into the cumulative weight line.
 * A per-member roll is the mutation this refuses (arm M8): rolling once per
 * member multiplies the party's drops by its size, which is the faucet §18.1's
 * *"per member a party is never better than solo on gold or loot"* forbids.
 *
 * @returns {number} the index of the member the drop is assigned to.
 */
export function assignDrop(o) {
  const weights = Array.isArray(o?.weights) ? o.weights.map((w) => Math.max(0, Math.floor(Number(w) || 0))) : [];
  if (!weights.length) return -1;
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  let r = Math.floor(Number(o?.roll) || 0) % sum;
  if (r < 0) r += sum;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (r < acc) return i;
  }
  return weights.length - 1;
}

/**
 * THE PAYOUT, WITH EVERY TERM OF (P-c) NAMED.
 *
 * `produced` is what the simulation produced for the WINDOW — the party's, not
 * a member's. Both integer.
 *
 * The order is fixed and each step is one of §18.2.6's terms:
 *
 *   1. pre-multiplier shares, apportioned so `Σ = produced` EXACTLY (the
 *      equality underneath the inequality);
 *   2. the fellowship bonus, XP only, paid only above the threshold — the ONE
 *      declared place a party pays out more than it produced (§18.4);
 *   3. the Vigour-dry multiplier, on the member's own payout and nobody else's
 *      — the ONE declared place it pays out less, and the reason (P-c) is an
 *      inequality rather than a strict equality (S-10c).
 *
 * The dry multiplier applies to the fellowship bonus too, because it is a
 * multiplier on what the member is PAID for the window and the bonus is part of
 * that. Nothing in §18 carves the bonus out, and carving it out would make a dry
 * member's XP depend on which half of their pay it came from.
 *
 * @returns {{members: Array, produced: object, preMultiplier: object,
 *            fellowship: object, dryLost: object, paid: object}}
 */
export function partyPayout(o) {
  const split = o.split;
  const gold = Math.max(0, Math.floor(Number(o?.produced?.gold) || 0));
  const xp = Math.max(0, Math.floor(Number(o?.produced?.xp) || 0));
  const lowest = split.lowest;

  const preGold = apportion(gold, split.members.map((m) => BigInt(m.dmg_bp)), lowest);
  const preXp = apportion(xp, split.members.map((m) => BigInt(m.xp_bp)), lowest);

  let fellowXpTotal = 0;
  let dryGold = 0;
  let dryXp = 0;
  const members = split.members.map((m, i) => {
    const fellowXp = Math.floor((preXp[i] * m.fellow_bp) / BP);
    const grossXp = preXp[i] + fellowXp;
    const paidGold = Math.floor((preGold[i] * m.dry_bp) / BP);
    const paidXp = Math.floor((grossXp * m.dry_bp) / BP);
    fellowXpTotal += fellowXp;
    dryGold += preGold[i] - paidGold;
    dryXp += grossXp - paidXp;
    return {
      user: m.user,
      slot: m.slot,
      preGold: preGold[i],
      preXp: preXp[i],
      fellowXp,
      gold: paidGold,
      xp: paidXp,
    };
  });

  return {
    produced: { gold, xp },
    preMultiplier: {
      gold: members.reduce((a, m) => a + m.preGold, 0),
      xp: members.reduce((a, m) => a + m.preXp, 0),
    },
    fellowship: { xp: fellowXpTotal },
    dryLost: { gold: dryGold, xp: dryXp },
    paid: {
      gold: members.reduce((a, m) => a + m.gold, 0),
      xp: members.reduce((a, m) => a + m.xp, 0),
    },
    members,
  };
}
