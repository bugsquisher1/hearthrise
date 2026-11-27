// ════════════════════════════════════════════════════════════════════════
// src/data/party.js — A HUNTING PARTY (HUNT_SCREEN_SPEC §3.9; contract §1.10)
//
//   maxSize     heroes in one party (Tyler 2026-10-16: up to 4, "maybe 5
//               later"). The server reads it as the generated limits row
//               `party_max`; hr_party_join refuses `party_full` past it.
//   lootSplit   'even_value' (week plan item 9): a kill's gold is split evenly
//               between the heroes in the instance, the remainder to the
//               lowest (user_id, slot); items go round-robin from a seeded
//               start on the instance's `r` stream (src/core/party-split.js,
//               the one split). A solo hunt is a party of one.
// Any role mix is allowed (Tyler 2026-10-16: four tanks is a party).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const PARTY = Object.freeze({
  maxSize: 4,
  lootSplit: 'even_value',
  /* THE RARE ROLL (Tyler L8 2026-10-14): each eligible hero rolls 1..sides for a rare or a
     relic, the highest wins, ties re-roll (at most maxRounds rounds), a winner waits until
     everyone has won (src/core/party-split.js rareRoll). */
  rareRoll: Object.freeze({ sides: 100, maxRounds: 64 }),
});

/* PERSONAL LOOT (systems, lane/flame-temper-build, 2026-11-22; docs/design/redesign/21-flame-temper-imbue-loot.md section 4). Each hero at a
   kill rolls each drop row itself at ch / n (n the heroes alive at the kill), so a party drops what its heroes would apart; its Rare rolls
   read its own company's flame (src/core/inner-flame.js luckPm) and its own pity. Coin stays the even split above. It REPLACES lootSplit's
   item half and the rare roll on an instance whose hunt began with the hr_flags switch `personal_loot` on (hunt_instances.personal_loot,
   frozen by 1076-personal-loot.sql; lane/p1-personal-loot): every hero that took part in a kill (src/core/hunt/took-part.js) rolls the
   kill's table at ch / n on its own stream (src/core/hunt-rewards.js payPersonal). The switch is off: until it lights, every hunt rolls
   the party split above.
   THE PITY (04 guard 5; src/core/personal-loot.js): a hero's chance after missed rolls is p0 x (1 + growPm / 1000 x x), x the sum of p0 over
   its misses since its last find, p0 = p x basePm / 1000. In x the hours to a find do not depend on the row's rate, so one pair of levers
   serves every row: at growPm 4000 the 90th percentile of rolls to a find is 1.94x the mean (21 section 4.2 asks under 2x; growth alone
   can never go under about 1.71x), and basePm 438 is the share of the row's chance that keeps the long-run rate the stated one
   (the mean of the survival exp(-x - grow x^2 / 2), computed; tests/personal-loot.mjs re-derives both). Lab run L2 moves them.
   THE ONE PITY (designer, lane/designer-pity, 2026-11-26; 12-targets 8.6): the Trait roller (src/core/trait-roll.js) reads this pity and no
   other. It counts the finds a hero was owed, never the kills it missed, so a miss in a party of four, at depth 1 or on a slow ground
   weighs what it was worth and none can be banked where a kill's chance is small and spent where it is big. x is held in PITY_UNIT parts
   (hero_pity.misses, below). */
export const PERSONAL_LOOT = Object.freeze({
  pityGrowPm: 4000,
  pityBasePm: 438,
  rarities: Object.freeze(['rare', 'very_rare']),
});
/* THE PITY'S UNIT (a unit, not a lever): hero_pity holds x in billionths of a find, so a Very Rare miss in a party of four at depth 1 (p0
   about 1e-6) never rounds away. tools/gen-flame-temper.mjs refuses one under 1e9 and writes it into the SQL twins */
export const PITY_UNIT = 1000000000;

/* LEAVE TOGETHER (Tyler 2026-10-22): every hero's own box, default on, kept per hero on the server
   (player_state.party_leave_together). When any other member's party hunt ends, a ticked hero is paid up to
   that moment and goes home too (party_member_left / party_member_died); the party stays together. The words
   on the party panel's own row (src/shell/widgets/party-leave.js). */
export const PARTY_COPY = Object.freeze({
  leaveTogether: 'Leave if anyone leaves the hunt or dies',
  leaveTogetherTip: 'Rewards so far are kept',
});

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  if (!Number.isInteger(PARTY.maxSize) || PARTY.maxSize < 1 || PARTY.maxSize > 5) out.push('PARTY.maxSize must be a whole 1..5');
  if (PARTY.lootSplit !== 'even_value') out.push('PARTY.lootSplit must be even_value (the only split party-split.js implements)');
  const rr = PARTY.rareRoll;
  if (!rr || !Number.isInteger(rr.sides) || rr.sides < 2 || !Number.isInteger(rr.maxRounds) || rr.maxRounds < 1) out.push('PARTY.rareRoll needs whole sides >= 2 and maxRounds >= 1');
  return out;
}
