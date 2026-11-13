// ════════════════════════════════════════════════════════════════════════
// src/data/fx-alpha.js — HOW STRONGLY EACH KIND OF HUNT EFFECT SHOWS (Tyler 2026-11-08: "make sure we are
// including settings/opacity sliders for on screen effects"; design: docs/planning/PRIORITY_BOARD.md
// "2026-11-08 Area spells" §5).
//
// Four sliders in Settings > Effects, each a player switch holding a value (src/session/player-switch.js
// switchValue: one pick { v, at } for every open hero, the newest wins), kept in its own allowlisted residue
// field (src/session/residue.js). The hunt scene (src/hunt-view/scene.js) multiplies each effect's opacity by
// its OWNER's slider: the viewed hero, any other hero (your own other heroes too), or a monster. A reward (a
// Level, a rare drop's sparkle) is no one's spell and always shows whole.
//
// THE WARNING RULE: a danger mark (the ground a monster's spell is about to land on, src/hunt-view/spell-marks.js)
// is its own row, and its floor is half: its outline is always solid and its fill never drops under 50%, so
// "Monster spell effects" at 0 still draws every mark and nobody can hide a warning.
//
// A row: { id, field, label, help, min, max, step, initial } (whole percents, like panel-alpha.js).
// Display only: nothing reads these to gate or spend (CLAUDE.md §6).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

const row = (r) => Object.freeze(Object.assign({ min: 0, max: 100, step: 10, initial: 100 }, r));

export const FX_ALPHA = Object.freeze([
  row({ id: 'self', field: 'fxSelf', label: 'Your spell effects',
    help: 'How strong your hero’s attacks, spells and heals look. Lower lets you see the fight through them.' }),
  row({ id: 'peer', field: 'fxPeer', label: 'Other heroes’ spell effects',
    help: 'The same for everyone else in the hunt, your other heroes too.' }),
  row({ id: 'monster', field: 'fxMonster', label: 'Monster spell effects',
    help: 'How strong a monster’s hits and spells look when they land.' }),
  row({ id: 'marks', field: 'fxMarks', label: 'Danger marks', min: 50,
    help: 'The marks on the ground where a monster’s spell is about to land. They never go below half, so you can always see them coming.' }),
]);

/** The row of `id` ('self' | 'peer' | 'monster' | 'marks'). */
export const FX_ALPHA_ROW = Object.freeze(Object.fromEntries(FX_ALPHA.map((r) => [r.id, r])));
