// ════════════════════════════════════════════════════════════════════════
// src/data/privacy.js — THE SESSION-RECORDING SWITCH, AS DATA.
//
// Settings > Help > "Share session recordings to help fix bugs" turns PostHog's
// screen recording (src/net/observability.js) on or off. The choice is a display
// preference kept in the residue (src/session/residue.js `shareReplay`), one pick
// for every hero (src/session/replay-pref.js), and it gates and spends nothing in
// the game.
//
//   field       the residue field that holds the pick: { on, at }
//   defaultOn   what a player who has never pressed the switch gets: ON (Tyler 2026-11-04,
//               recording stays on for invitees). legal/PRIVACY_POLICY.md says "on by
//               default": change this and that page together (tests/settings-registry.mjs
//               reads both).
//   label       the Settings row's words, which the Privacy Policy names exactly
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
export const REPLAY = Object.freeze({
  field: 'shareReplay',
  defaultOn: true,
  label: 'Share session recordings to help fix bugs',
});
