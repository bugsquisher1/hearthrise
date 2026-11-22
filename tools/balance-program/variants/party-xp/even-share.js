// balance-variant: party-xp/even-share
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/variants/party-xp/even-share.js — NO PARTY TABLE, AN EVEN SHARE: a formula family for the rule slot `party-xp`
// (tools/balance-program/slots.json). A scratch copy plays it in place of src/data/party-class-xp.js, with the shipped module beside it as
// party-class-xp.shipped.js lending every export this family does not change (the classes, the Party window's measured lines, validate).
// Never in a bundle: tools/pack-edge.mjs refuses it.
//
// THE FAMILY (docs/design/redesign/04-math-strategy.md section 7, "No party table"): the party shares a kill evenly and nothing else.
// No factor by size or class mix and no lone-hero boost: a good four earns more a head because it holds deeper, never because a table
// says "group up". One lever, PARTY_PAY, at 1000 permille (04's `partyPay` at 1.0), kept in case a four does not hold deep enough to pay
// for itself. The class reading (`classes`) is the shipped module's: a family changes the pay, never which classes a party holds.
//
// Shelf entry: added 2026-11-21, expires 2027-02-21 (slots.json). The winner of a comparison moves into the tree; the loser is deleted.
// ════════════════════════════════════════════════════════════════════════
import { partyClassXp as shippedReading } from './party-class-xp.shipped.js';

export * from './party-class-xp.shipped.js';

const PARTY_PAY = 1000;

/** THE ONE READER, this family's: { permille: PARTY_PAY for any party, classes: the shipped reading's }. */
export function partyClassXp(roles) {
  return { permille: PARTY_PAY, classes: shippedReading(roles).classes };
}
