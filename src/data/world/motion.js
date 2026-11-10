// ════════════════════════════════════════════════════════════════════════
// src/data/world/motion.js — THE IDLE ANIMATIONS SWITCH, AS DATA.
//
// Heroes, townsfolk and monsters breathe while they stand still (their `idle`
// clips). Tyler 2026-11-07: "Would it be easy to have a toggle to turn that off
// for people who don't like it?" Settings > Interface > "Idle animations" is a
// player switch (src/session/player-switch.js): one pick for every hero, kept in
// the residue, read by the World (src/world/idle-motion.js). Off, every idle clip
// holds its first frame, the still the art shipped with; walking, swings, hits
// and deaths still play. Display only: it gates and spends nothing.
//
//   field      the residue field that holds the pick: { on, at }
//   defaultOn  a player who never pressed it sees them breathe
//   reducedOn  a device that asks for reduced motion starts with them still
//   label      the Settings row's words
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
export const IDLE_MOTION = Object.freeze({
  field: 'idleMotion',
  defaultOn: true,
  reducedOn: false,
  label: 'Idle animations',
});
