// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-hud.js — THE HUNT SCREEN'S OWN DISPLAY ROWS.
//
// Display data only; nothing here is a game number.
//   ROLE_GLYPH   the role icon a party portrait wears (window.HR_GLYPHS key).
//                Role comes from the equipped WEAPON (src/data/hunt-roles.js
//                roleForWeapon), never the outfit (parity PP-02).
//   HOTKEYS      the Settings window's hotkeys list beyond the window keys
//                (parity SH-10), display only. Hunts are idle, so no key casts.
//   WEAPON_WORDS each weapon TYPE (hunt-roles.js WEAPON_ROLES keys) in words,
//                for the party board and the party finder's filter
//   BAR_SLOTS    the bottom bar's tablets: rows x columns (parity BB-02, the
//                action set's 20 slots, rule-subjects ACTION_SET_LIMITS).
// ════════════════════════════════════════════════════════════════════════

export const ROLE_GLYPH = Object.freeze({
  tank: 'uiShield',
  melee_dps: 'uiAxe',
  ranger: 'uiBow',
  mage: 'uiStaff',
  healer: 'uiHeart',
});

/* Keys that are not a window's own (each window row's `key` is listed from
   src/data/shell-windows.js, so a window's key is never typed twice). */
export const HOTKEYS = Object.freeze([
  Object.freeze({ key: 'Esc', does: 'Close the top window; with none open, open Settings' }),
]);

export const WEAPON_WORDS = Object.freeze({
  shield: 'Shield',
  dual_axe: 'Two axes',
  club: 'Club',
  bow: 'Bow',
  crossbow: 'Crossbow',
  staff: 'Staff',
  wand: 'Wand',
  sword: 'Sword',
  hammer: 'Hammer',
  neutral: 'Bare hands',
  ranged: 'Bow or crossbow',
});

export const BAR_SLOTS = Object.freeze({ rows: 2, cols: 10 });
