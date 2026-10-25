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
//   below      (optional) widget ids this one stacks under when it would overlap them (hud.js stackBelow)
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
    /* On a phone the stack docks above the bottom bar on the RIGHT (at most 96 px tall, tests/hunt-screen.mjs
       HS-22): that strip is clear world (the Party panel holds the left), and it grows upward, never over the
       bar or its drop menu. While a window is open it hides (hunt.css): a phone window is the whole sheet. */
    phone: Object.freeze({ anchor: 'br', dx: 4, dy: 104 }),
  }),
  /* Tracker r16: how many players are online, as the server counts (src/social/players-online.js).
     One short line at the bottom left, standing just above the action bar (its 8 px offset + its 170 px desktop
     height + 8: from 1280 px the bar spans that corner, hunt.css), clear of the bar, the party and the alerts.
     Off by default on a phone, where the action bar spans that corner (HUD layout can show it). */
  Object.freeze({
    id: 'online', label: 'Players online', layer: 'screen', anchor: 'bl', dx: 12, dy: 186,
    min: Object.freeze([96, 22]), opacity: 0.85, visible: true, removable: true, when: 'always',
    phone: Object.freeze({ visible: false, dx: 4, dy: 4 }),
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
  /* On a phone it shares the top-right corner with the hunt bar, so it STACKS under it (`below`): open, it never
     covers Hunt details, Summary or Leave hunt (QA phone playtest 10-24: one press on Hunt details hid all three). */
  Object.freeze({
    id: 'analyzer', label: 'Hunt analyzer', layer: 'world', anchor: 'tr', dx: 12, dy: 12,
    min: Object.freeze([260, 120]), opacity: 0.9, visible: true, removable: true, when: 'hunt',
    below: Object.freeze(['hunt-topbar']),
    phone: Object.freeze({ visible: false, dx: 4, dy: 4 }),
  }),
  /* Tamsin's tally (2026-12-23-tally-tasks.sql): each held kill task's server count, in town and hunting. It
     STACKS under the analyzer on the right edge (`below`, src/shell/hud.js stackBelow): the analyzer grows with
     the hunt, so a fixed right-middle spot ran under it (v0.2.37 run 40020854780, HS-13). In town it is the top
     right corner. With nothing to show it takes no room (widgets/tally-hud.js), so it never moves the camera.
     Off by default on a phone, where it stacks under the hunt bar (HUD layout shows it). */
  Object.freeze({
    id: 'tally', label: 'Tally (kill tasks)', layer: 'world', anchor: 'tr', dx: 12, dy: 12,
    min: Object.freeze([180, 32]), opacity: 0.9, visible: true, removable: true, when: 'always',
    below: Object.freeze(['analyzer', 'hunt-topbar']),
    phone: Object.freeze({ visible: false, dx: 4, dy: 4 }),
  }),
  Object.freeze({
    /* Shown in town too, so the bar is set up before leaving (its vitals show only in a hunt). */
    id: 'action-bar', label: 'Action bar (bottom)', layer: 'world', anchor: 'bc', dx: 0, dy: 8,
    min: Object.freeze([320, 64]), opacity: 1, visible: true, removable: true, when: 'always',
    phone: Object.freeze({ dy: 2 }),
  }),
]);
