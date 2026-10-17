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
// The spec's hunt widgets (vitals, actionbar, target, ground, analyzer, log, chat)
// land with their renderers in B1 and the cutover.
// ════════════════════════════════════════════════════════════════════════

export const HUD_WIDGETS = Object.freeze([
  Object.freeze({
    id: 'launchers', label: 'Menu icons', layer: 'screen', anchor: 'tr', dx: 0, dy: 0,
    min: Object.freeze([320, 40]), opacity: 1, visible: true, removable: false, when: 'always',
    phone: Object.freeze({}),
  }),
]);
