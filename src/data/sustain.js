// ════════════════════════════════════════════════════════════════════════
// src/data/sustain.js — SUSTAIN ON THE REFERENCE: WHAT COVERS THE DAMAGE A COMPANY TAKES (lane/foundations-block, 2026-11-23).
//
// docs/design/redesign/04-math-strategy.md section 3, 26-architecture-pass.md section 3 rank 3. "Sustain is a budget the player can read":
// three sources, three prices. Regeneration is paid in time, a healer's spells in mana (time or drinks), supplies in gold. Each covers a
// designed share of THE REFERENCE COMPANY's incoming damage on Steady (04 section 1: four heroes at the ground's refLevel, MID kits, a
// front, a healer and two damage dealers, the default bar), so a heal's size, the regeneration rates and a kit's food are set against
// these shares, never against today's heals. Each lever is a share (permille) or a time, its starting value read on the real engine and
// its band the room the Lab may move it in. "In band is enough" (Tyler 2026-11-21).
//
//   freePm      REGENERATION'S SHARE (04 sustainFree; candidates SUST-1/2: it never carries a hunt alone): the HP the company regains with no
//               event, in a fight (core-model.js VITALS.inFightRegenPermillePerS) and between pulls (hunt-tuning.js oocRegenPermillePerS,
//               04's restRate), over the damage it takes
//   healerPm    THE HEALER'S SHARE (04 sustainHealer): HP back from heal spells (the healer's on its allies, any hero's on itself) over the
//               damage taken. The heal rows (abilities.js healPm, Greater Mend's 2540) are sized to land it at the reference
//   supplyPm    POTION USE, the supplies' share (04: "the rest from supplies"): HP back from food over the damage taken. A healer's mana
//               drinks are the gold half of healerPm and read as the store bill's kit share (tests/econ-levers.mjs EL-KIT)
//   manaSeconds THE MANA ECONOMY (04 manaSeconds): the reference healer's pool, in seconds of casting its main heal back to back, at the
//               reference Level. Its regeneration a minute is ABILITY_RULES.manaRegenPctPerMin (04 manaRegen, its one home)
// The reader: tools/balance-program/redesign/v1-climb.mjs (each cell's `sustain`: the company's taken, regeneration, spells and food, from
// tools/balance-sim/cell.mjs), and tools/new-ground.mjs checks every new ground's reference company against these bands.
//
// MEASURED (lane/foundations-block, tools/balance-program/redesign/foundations, the Steady mixed four from step 0, 6 seeds x 10 h, read from
// hour 4): Muster Barrows at Level 60 regeneration 132, spells 851, food 17 (taken 14.4 permille of max HP a hero-second); Hask's Ford at
// Level 52 190 / 780 / 29 (11.9); the Bone Wing at Level 175 in tools/balance-program/redesign/foundations/wing-ref.txt. The fresh four
// (LOW kits at the entry Level) reads 196 / 769 / 35 on Muster: a tier of kit behind moves food, not a cliff.
//
// WHAT IS STILL A STAND-IN (stage 3, the amount pipeline): the shares are READ, not yet the engine's input. A heal is still a share of the
// caster's biggest hit and a move's mana a flat number, so off the reference Level the shares drift (manaSeconds: Greater Mend's flat 25 a
// cast against a pool of 100 + 10 a Level). When a heal is a share of reference health through the step contest these become the inputs.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

const lever = (at, band) => Object.freeze({ at, band: Object.freeze(band) });
export const SUSTAIN = Object.freeze({
  freePm: lever(150, [100, 250]),
  healerPm: lever(830, [700, 900]),
  supplyPm: lever(20, [0, 100]),
  manaSeconds: lever(75, [60, 90]),
});
