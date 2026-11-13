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
// A VALUE SWITCH (a slider: the effect opacities, src/data/fx-alpha.js) is the same with a number,
// { field, min, max, step, initial }, its pick { v, at }; a value read back is snapped to its range and step.
//
//   switchOn(heroes, sw, reduced)       the newest pick's answer, else the default
//   setSwitch(heroes, sw, on, now)      the press: one pick, newer than any held, into every hero
//   switchValue(heroes, sw)             a value switch's newest pick, else its initial value
//   setSwitchValue(heroes, sw, v, now)  a value switch's press (a slider dragged), the same way
// ════════════════════════════════════════════════════════════════════════

const isOn = (p) => typeof p.on === 'boolean';
const isValue = (p) => Number.isFinite(p.v);
const pickOf = (cs, field, kind) => {
  const p = cs && cs.record && cs.record.residue ? cs.record.residue[field] : null;
  return p && typeof p === 'object' && kind(p) && Number.isSafeInteger(p.at) ? p : null;
};

/* The newest pick of `kind` any of these heroes holds, or null. */
function newestPick(heroes, field, kind) {
  let best = null;
  for (const cs of heroes || []) {
    const p = pickOf(cs, field, kind);
    if (p && (!best || p.at > best.at)) best = p;
  }
  return best;
}

/* The press: `body` stamped after any pick held (`now`: the server's clock, ms), into every open hero. True when one hero kept it. */
function press(heroes, field, kind, body, now) {
  const open = (heroes || []).filter(Boolean);
  const was = newestPick(open, field, kind);
  const stamp = { at: Math.max(Number.isFinite(now) ? Math.floor(now) : 0, was ? was.at + 1 : 0) };
  const pick = Object.assign(body, stamp);
  let kept = false;
  for (const cs of open) if (typeof cs.setResidue === 'function' && cs.setResidue(field, pick)) kept = true;
  return kept;
}

/** On or off: the newest pick any hero holds, else the switch's default (`reduced`: the device asks for reduced motion). */
export function switchOn(heroes, sw, reduced) {
  const p = newestPick(heroes, sw.field, isOn);
  if (p) return p.on;
  return reduced === true && typeof sw.reducedOn === 'boolean' ? sw.reducedOn : sw.defaultOn === true;
}

/** The press: one pick into every open hero, stamped after any pick held (`now`: the server's clock, ms). True when one hero kept it. */
export function setSwitch(heroes, sw, on, now) {
  return press(heroes, sw.field, isOn, { on: on === true }, now);
}

/** `v` inside value switch `sw`'s range, on its step (its initial value when `v` is no number). */
export function snapValue(sw, v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return sw.initial;
  return Math.max(sw.min, Math.min(sw.max, sw.min + Math.round((n - sw.min) / sw.step) * sw.step));
}

/** A value switch's value: the newest pick any hero holds, else its initial value. */
export function switchValue(heroes, sw) {
  const p = newestPick(heroes, sw.field, isValue);
  return p ? snapValue(sw, p.v) : sw.initial;
}

/** A value switch's press (a slider dragged): one pick { v, at } into every open hero, the same way as setSwitch. */
export function setSwitchValue(heroes, sw, v, now) {
  return press(heroes, sw.field, isValue, { v: snapValue(sw, v) }, now);
}
