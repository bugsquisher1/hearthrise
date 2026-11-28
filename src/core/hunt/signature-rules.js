// ============================================================
// src/core/hunt/signature-rules.js — A WORN SIGNATURE IN THE FIGHT: its one fixed rule, played as REACTIONS (systems, lane/signatures-sample,
// 2026-11-26; docs/design/redesign/15-signature-candidates.md "How Signatures work" and "Decision: count and size"; the rows are
// src/data/signatures.js).
//
// DARK (SIGNATURE_RULES.live false): the engine plays the Signature a hero WEARS (`wornSignature` on its hero: the id of the first Signature
// it equipped, the server's projection, wave 4 with its Security review), and no server or client file hands one while the switch is off
// (tests/hunt-core/signature-rules.mjs dark). The Lab and the tests hand it. With none, the boundary writes nothing: every hunt plays as before.
//
// A SIGNATURE IS REACTION ROWS (src/core/hunt/reactions.js, the engine pieces the Roads, Signatures and Traits share): at every boundary
// (combat-sim.js syncUnit, after the Roads' own) its rows join the hero's `reacts`, never persisted, each named by the Signature's id, so
// its clock ('~r:<id>' on the cooldowns) is persisted with them and a settle cut anywhere resumes the same fight. A Signature never ramps
// with Level (19 section 2: what a hero finds is whole from the start), and a reaction never sets off another (react-queue.js).
// ONE A HERO (15 "Proposed rules"): a projection that lists several plays the first known one only.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { SIGNATURES, SIGNATURE_RULES } from '../../data/signatures.js';

const own = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/** THE SIGNATURE A HERO PLAYS from the server's projection: an id, or ids in the order they were equipped (the first known one plays; an
    unknown id is dropped; SIGNATURE_RULES.perHero, one). The id, or null. */
export function wornSignatureOf(x) {
  const ids = (Array.isArray(x) ? x : [x]).filter((id) => own(SIGNATURES, id)).slice(0, SIGNATURE_RULES.perHero);
  return ids.length ? ids[0] : null;
}

/* THE REACTION ROWS ONE SIGNATURE PLAYS (cached: one frozen list a Signature): each row named by the Signature (its clock's key), `sig` set */
const ROWS = new Map();
export function signatureReacts(id) {
  let rows = ROWS.get(id);
  if (rows) return rows;
  rows = Object.freeze(SIGNATURES[id].reacts.map((r) => Object.freeze({ kind: 'react', id, ...r, sig: true })));
  ROWS.set(id, rows);
  return rows;
}

/** WRITE HERO `hero`'s WORN SIGNATURE ON UNIT `u` (combat-sim.js syncUnit, every boundary, after the Roads write `reacts`): its rows join
    `reacts` (any a past boundary put there first taken off), and `signature` names it; or none of either. */
export function syncSignature(u, hero) {
  const id = wornSignatureOf(hero && hero.wornSignature);
  const rest = Array.isArray(u.reacts) ? u.reacts.filter((r) => r.sig !== true) : null;
  if (id) {
    u.signature = id;
    u.reacts = rest && rest.length ? rest.concat(signatureReacts(id)) : signatureReacts(id);
    /* (a Signature whose rule is no reaction, a rune it saves or a stack cap it raises: abilities.js, status.js read `signature`) */
    if (!u.reacts.length) delete u.reacts;
    return;
  }
  if (u.signature !== undefined) delete u.signature;
  if (rest && rest.length !== u.reacts.length) { if (rest.length) u.reacts = rest; else delete u.reacts; }
}
