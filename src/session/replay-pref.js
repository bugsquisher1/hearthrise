// ════════════════════════════════════════════════════════════════════════
// src/session/replay-pref.js — WHETHER THIS PLAYER'S SCREEN MAY BE RECORDED.
//
// The Settings switch "Share session recordings to help fix bugs" is a display
// preference in the residue (field `shareReplay`, { on, at }), never a gate on
// anything the game does. It is a player switch (src/session/player-switch.js):
// a press goes to EVERY open hero and what counts is the newest pick any open
// hero holds, so a hero that was closed for a press cannot put its older pick back.
//
//   replayWanted(heroes)   true / false from the newest pick, else the default;
//                          null while no hero's record has been read (nothing is
//                          known, so nothing records: src/net/observability.js)
// ════════════════════════════════════════════════════════════════════════
import { REPLAY } from '../data/privacy.js?v=0.2.126';
import { switchOn } from './player-switch.js?v=0.2.126';

/** Whether recordings are wanted: the newest pick, else REPLAY.defaultOn; null before any hero has been read. */
export function replayWanted(heroes) {
  const read = (heroes || []).filter((cs) => cs && cs.record);
  return read.length ? switchOn(read, REPLAY, false) : null;
}
