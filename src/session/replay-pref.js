// ════════════════════════════════════════════════════════════════════════
// src/session/replay-pref.js — WHETHER THIS PLAYER'S SCREEN MAY BE RECORDED.
//
// The Settings switch "Share session recordings to help fix bugs" is a display
// preference in the residue (field `shareReplay`, { on, at }), never a gate on
// anything the game does. The residue is per character, the switch is the
// player's, so a press goes to EVERY open hero and what counts is the newest pick
// any open hero holds (the same rule as the town zoom, src/world/town-zoom.js): a
// hero that was closed for a press cannot put its older pick back.
//
//   replayWanted(heroes)             true / false from the newest pick, else the default;
//                                    null while no hero's record has been read (nothing is
//                                    known, so nothing records: src/net/observability.js)
//   setReplayWanted(heroes, on, now) the press: one pick, newer than any held, into every hero
// ════════════════════════════════════════════════════════════════════════
import { REPLAY } from '../data/privacy.js?v=0.2.101';

const pickOf = (cs) => {
  const p = cs && cs.record && cs.record.residue ? cs.record.residue[REPLAY.field] : null;
  return p && typeof p.on === 'boolean' && Number.isSafeInteger(p.at) ? p : null;
};

/* The newest pick any of these heroes holds, or null. */
function newestPick(heroes) {
  let best = null;
  for (const cs of heroes) {
    const p = pickOf(cs);
    if (p && (!best || p.at > best.at)) best = p;
  }
  return best;
}

/** Whether recordings are wanted: the newest pick, else REPLAY.defaultOn; null before any hero has been read. */
export function replayWanted(heroes) {
  const read = (heroes || []).filter((cs) => cs && cs.record);
  if (!read.length) return null;
  const p = newestPick(read);
  return p ? p.on : REPLAY.defaultOn;
}

/** The press: one pick into every open hero, stamped after any pick held (`now`: the server's clock, ms). True when one hero kept it. */
export function setReplayWanted(heroes, on, now) {
  const open = (heroes || []).filter(Boolean);
  const was = newestPick(open);
  const pick = { on: on === true, at: Math.max(Number.isFinite(now) ? Math.floor(now) : 0, was ? was.at + 1 : 0) };
  let kept = false;
  for (const cs of open) if (typeof cs.setResidue === 'function' && cs.setResidue(REPLAY.field, pick)) kept = true;
  return kept;
}
