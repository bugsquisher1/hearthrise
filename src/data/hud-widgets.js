// ════════════════════════════════════════════════════════════════════════
// src/data/hud-widgets.js — THE HUD WIDGET CONTRACT, ONE ROW PER WIDGET.
//
// docs/design/WORLD_SHELL.md §2. A widget is this row plus a renderer of the same
// id in src/shell/renderers.js (tests/shell-renderers.mjs pairs them). The fields:
//
//   id         stable id; the renderer key and the [data-hs-widget] attribute
//   label      the name in Settings -> HUD layout
//   layer      'world'  inside the World, shifted clear of the docked windows
//              'screen' anywhere on screen, the strip included
//   anchor     t|m|b + l|c|r
//   dx, dy     px from that anchor's edges (a centred axis offsets from centre)
//   min        [w, h] CSS px
//   opacity    0.4 .. 1 (hover always shows 1)
//   visible    the default
//   removable  false: the widget can never be hidden
//   when       'always' | 'hunt'
//   phone      overrides of anchor/dx/dy/opacity/visible on the phone size class
//
// The player's layout is a DISPLAY preference (residue `hudLayout`, CLAUDE.md §6).
// The hunt widgets show only while the character's envelope carries a hunt.
// ════════════════════════════════════════════════════════════════════════

export const HUD_WIDGETS = Object.freeze([
  Object.freeze({
    id: 'launchers', label: 'Menu icons', layer: 'screen', anchor: 'tr', dx: 0, dy: 0,
    min: Object.freeze([320, 40]), opacity: 1, visible: true, removable: false, when: 'always',
    phone: Object.freeze({}),
  }),
  /* QoL 7: what happened to which character, with the next action (src/shell/alerts.js). The left
     middle is the one edge no hunt panel holds; a screen widget, so it never moves the camera. */
  Object.freeze({
    id: 'alerts', label: 'Alerts', layer: 'screen', anchor: 'ml', dx: 12, dy: 0,
    min: Object.freeze([240, 8]), opacity: 1, visible: true, removable: true, when: 'always',
    phone: Object.freeze({ dx: 4 }),
  }),
  /* The hunt screen (HUNT_SCREEN_SPEC §1.4): built once, patched in place. */
  Object.freeze({
    id: 'hunt-topbar', label: 'Hunt bar (top)', layer: 'world', anchor: 'tc', dx: 0, dy: 8,
    min: Object.freeze([300, 40]), opacity: 1, visible: true, removable: true, when: 'hunt',
    phone: Object.freeze({ anchor: 'tr', dx: 4, dy: 4 }),
  }),
  Object.freeze({
    id: 'party', label: 'Party', layer: 'world', anchor: 'tl', dx: 12, dy: 12,
    min: Object.freeze([240, 80]), opacity: 0.9, visible: true, removable: true, when: 'hunt',
    phone: Object.freeze({ dx: 4, dy: 4 }),
  }),
  Object.freeze({
    id: 'analyzer', label: 'Hunt analyzer', layer: 'world', anchor: 'tr', dx: 12, dy: 12,
    min: Object.freeze([260, 120]), opacity: 0.9, visible: true, removable: true, when: 'hunt',
    phone: Object.freeze({ visible: false, dx: 4, dy: 4 }),
  }),
  Object.freeze({
    id: 'action-bar', label: 'Hunt bar (bottom)', layer: 'world', anchor: 'bc', dx: 0, dy: 8,
    min: Object.freeze([320, 64]), opacity: 1, visible: true, removable: true, when: 'hunt',
    phone: Object.freeze({ dy: 2 }),
  }),
]);
