// ============================================================
// src/core/hunt/fall-save.js — A FALL-BACK SAVE: a worn Signature that turns a hero's death into its fall back (systems,
// lane/signatures-batch-4, 2026-11-28; docs/design/redesign/15-signature-candidates.md "Batch 4: what is left, and the pieces it needs" P7;
// the row is src/data/signatures.js `save`: #40 Hearth Mason's Cloak, "once an hour, a hero of your party who would die falls back instead").
//
// A blow that would kill a hero (damage.js landHit: its HP taken to 0) is SAVED when a living hero of its side, itself included, wears a
// Signature with `save` whose clock is ready ('~r:<id>' on the wearer's cooldowns, `save.clockMs` long, persisted with them so a settle
// cut across it keeps it; the first such wearer by id): the hero is left at 1 HP, the blow's `dmg` event names the wearer (`saved`), and
// on the Danger scale, in a fight, the pull breaks off at once (fallBackNow below, pull-cycle.js breakOff: the fall back a hero under its stance's line
// makes, which Bold never makes on its own: "Bold only can die", CLAUDE.md section 6). The step falls as a fall back's does (danger.js
// pullEnds reads the hero's 1 HP as the pull's low, never a death: noteHurt holds a living hero over 0). Off the scale there is no fall
// back: the hero stands at 1 HP. A viewed and a closed hunt play the same blow at the same sub-step, so both save the same hero.
// What it moves: Level XP and skill progress a death would have cost (13 N-14, the XP row), never money.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { SIGNATURES } from '../../data/signatures.js';
import { isHero, isAlly } from './sides.js';
import { breakOff, PHASE } from './pull-cycle.js';
import { dangerOn } from './danger.js';

const NONE = Object.freeze([]);
const own = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const readyAt = (o, k) => (o && typeof o === 'object' && Number.isInteger(o[k]) ? o[k] : 0);

/** The heroes of instance `inst` wearing a Signature with a `save`, in id order, read once an instance (a boundary writes `signature`). */
export function saversOf(inst) {
  if (inst.sigSavers) return inst.sigSavers;
  const out = inst.world.units.filter((u) => isHero(u) && own(SIGNATURES, u.signature) && !!SIGNATURES[u.signature].save).sort((a, b) => a.id - b.id);
  inst.sigSavers = out.length ? out : NONE;
  return inst.sigSavers;
}

/**
 * SAVE HERO `t` FROM THE BLOW `r` THAT TOOK IT TO 0 (damage.js landHit, right after the blow lands): with a ready save on its side, `t` is
 * left at 1 HP, `r` becomes a blow that took all but that 1 (`dmg`, `killed` false, `saved` the wearer's id) and the wearer's clock
 * starts. Answers the wearer, or null (no save ready: the blow kills as it was).
 */
export function saveFall(inst, sc, t, r) {
  if (!isHero(t) || !r || !r.killed) return null;
  for (const w of saversOf(inst)) {
    if (w.alive !== true || (w !== t && !isAlly(w, t))) continue;
    const s = SIGNATURES[w.signature], key = '~r:' + s.id;
    if (readyAt(w.cds, key) > sc.atMs) continue;
    t.hp = 1;
    r.dmg = Math.max(0, r.dmg - 1);
    r.killed = false;
    r.saved = w.id;
    w.cds = Object.assign({}, w.cds || {}, { [key]: sc.atMs + s.save.clockMs });
    return w;
  }
  return null;
}

/** A FALL BACK A SAVE STARTS (damage.js landHit, after the saved blow): on the Danger scale, in a fight, the pull breaks off now
    (pull-cycle.js breakOff), as a hero under its stance's line breaks it, on any stance (Bold too, which never breaks off on its own).
    Nothing off the scale or outside a fight. Here, not in pull-cycle.js, so it loads on need. */
export function fallBackNow(inst, sc) {
  if (dangerOn(inst.world) && inst.world.phase === PHASE.FIGHT) breakOff(inst, sc);
}
