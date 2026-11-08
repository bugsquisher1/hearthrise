// ════════════════════════════════════════════════════════════════════════
// src/session/player-switch.js — A SWITCH THE PLAYER HOLDS FOR EVERY HERO.
//
// A Settings toggle that is the player's, not one hero's (the session-recording
// switch, src/data/privacy.js; idle animations, src/data/world/motion.js). The
// residue is per character, so a press goes to EVERY open hero as one pick
// { on, at } in the switch's residue field, and what counts is the newest pick
// any open hero holds (the town zoom's rule, src/world/town-zoom.js; Andy's report
// #75: a viewer pick kept by one hero alone showed only on that hero). A hero that
// was closed for a press cannot put its older pick back. Display preferences:
// nothing reads a switch to gate or spend (CLAUDE.md §6).
//
// A switch is data: { field, defaultOn, reducedOn? }
//   field      the residue field holding the pick (an allowlisted one, src/session/residue.js)
//   defaultOn  what a player who never pressed it gets
//   reducedOn  optional: what they get instead when the device asks for reduced motion
//              (prefers-reduced-motion: reduce). A press always wins over both.
//
//   switchOn(heroes, sw, reduced)    the newest pick's answer, else the default
//   setSwitch(heroes, sw, on, now)   the press: one pick, newer than any held, into every hero
// ════════════════════════════════════════════════════════════════════════

const pickOf = (cs, field) => {
  const p = cs && cs.record && cs.record.residue ? cs.record.residue[field] : null;
  return p && typeof p.on === 'boolean' && Number.isSafeInteger(p.at) ? p : null;
};

/* The newest pick any of these heroes holds, or null. */
function newestPick(heroes, field) {
  let best = null;
  for (const cs of heroes || []) {
    const p = pickOf(cs, field);
    if (p && (!best || p.at > best.at)) best = p;
  }
  return best;
}

/** On or off: the newest pick any hero holds, else the switch's default (`reduced`: the device asks for reduced motion). */
export function switchOn(heroes, sw, reduced) {
  const p = newestPick(heroes, sw.field);
  if (p) return p.on;
  return reduced === true && typeof sw.reducedOn === 'boolean' ? sw.reducedOn : sw.defaultOn === true;
}

/** The press: one pick into every open hero, stamped after any pick held (`now`: the server's clock, ms). True when one hero kept it. */
export function setSwitch(heroes, sw, on, now) {
  const open = (heroes || []).filter(Boolean);
  const was = newestPick(open, sw.field);
  const pick = { on: on === true, at: Math.max(Number.isFinite(now) ? Math.floor(now) : 0, was ? was.at + 1 : 0) };
  let kept = false;
  for (const cs of open) if (typeof cs.setResidue === 'function' && cs.setResidue(sw.field, pick)) kept = true;
  return kept;
}
