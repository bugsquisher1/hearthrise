// ════════════════════════════════════════════════════════════════════════
// src/shell/start-open.js — THE WINDOWS A PLAYER FINDS OPEN, AND THE PICK THAT KEEPS ONE SHUT.
//
// Tyler 2026-10-22: "Chat window: resizable, opens by default at the bottom-left". A catalogue row with
// `startsOpen` (src/data/shell-windows.js: Chat) opens at its home as the shell mounts on desktop
// (window-manager.js openAtStart) while its player switch (src/session/player-switch.js) is on, which it is
// for a player who never closed it. The player's own close turns the switch off and their next open turns it
// on again (window-manager.js keep), one pick { on, at } for every open hero, so a reload or another hero's
// screen keeps it shut. Display state in the residue (CLAUDE.md §6): it gates and spends nothing.
//
//   startShut(ctx, row)        is this startsOpen row shut by the player's pick?
//   keepStart(ctx, row, open)  the player opened or closed it: their pick, written only when it changes
// ════════════════════════════════════════════════════════════════════════
import { switchOn, setSwitch } from '../session/player-switch.js?v=0.2.142';
import { serverNowOf } from '../session/hunt-sections.js?v=0.2.142';
import { peersOf } from './settings-model.js?v=0.2.142';

/* A startsOpen row's switch: its residue field, on until the player closes it. */
const switchOf = (row) => ({ field: row.startsOpen, defaultOn: true });

/** Is this startsOpen row shut by the player's pick (any open hero's newest)? */
export function startShut(ctx, row) {
  return !!row && !!row.startsOpen && !switchOn(peersOf(ctx), switchOf(row));
}

/** The player opened (`open` true) or closed a startsOpen row: one pick into every open hero, only when it changes. True when kept. */
export function keepStart(ctx, row, open) {
  if (!row || !row.startsOpen) return false;
  const heroes = peersOf(ctx), sw = switchOf(row);
  if (switchOn(heroes, sw) === (open === true)) return false;
  return setSwitch(heroes, sw, open === true, serverNowOf(ctx.character));
}
