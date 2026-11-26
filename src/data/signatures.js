// ════════════════════════════════════════════════════════════════════════
// src/data/signatures.js — THE SIGNATURES, THE FIRST SAMPLE OF 5 (systems, lane/signatures-sample, 2026-11-26; the designer's ruling
// docs/design/redesign/15-signature-candidates.md "Decision: count and size", the rows' words there, their size 19-power-ledger.md row 6).
//
// A Signature is a NAMED PIECE WITH ONE FIXED RULE nothing else gives: no roll, no ranks, one home. A hero plays ONE: the first it equipped
// (the server's projection hands that one; a second worn Signature does nothing). Its size is 10 steps (half a gear tier) on the cell that
// suits it best, inside the hero's gear slice with Traits (conditionalStepsMax 20), measured on the dominance check (29 section 3.8), never
// typed as steps: a Signature's rule is a mechanic (a shield, a cooldown, a mark moved, a reset, a timed boon), and the Lab reads what it buys.
//
// A RULE IS REACTION ROWS, the engine pieces the Roads, Signatures and Traits share (src/core/hunt/reactions.js; the vocabulary is
// src/data/talents.js REACT_ON / REACT_DO / REACT_FIELDS, one list for all three), never code of its own:
//   on        the moment: hit, kill, death (any monster's, whoever's blow), heal (a cast heal landing on a hero), hp_below (the wearer's own
//             health under `belowPm` after a blow), ...
//   filters   of (the moment's move), has (the moment's monster carries that status as the moment happens), belowPm (the line), clockMs
//   do        shield (pm of max health on the wearer), reset (ms off `move`, at most capMs a cycle), ready (`move` ready now), pass (what
//             the fallen carried, `what` 'mark' or a status id of the wearer's, moves to the nearest engaged monster with its time left),
//             boon (`status` on the moment's hero, lasting ms), ...
// Never x ramp (19 section 2: no ramp on what a hero finds). A reaction never sets off another (react-queue.js), so a reset, a free cast or
// an explosion from a Signature can't chain (15 "Proposed rules").
//
// THE FIVE (15 "Sample 5": one a seat, two homes on the scale, each a different engine piece later batches reuse):
//   #36 Cairn Belt              tank      a low-health gear shield           hp_below -> shield, its own clock
//   #6  Barrow Knight's Blade   sword     a reset per kill                   kill (of Turning Cut) -> reset Turning Cut, capped a cast
//   #9  Lurcher's Collar        ranger    a status that moves on a death     death (a marked monster) -> pass the Mark
//   #14 The Wood Book           mage      a reset from another move          hit (of Frost Lance, on a chilled target) -> ready Hoarfrost
//   #18 Brewer's Apron          healer    a timed party damage buff          heal (of Circle of Renewal) -> boon Emboldened, 4 s
// Every number is the candidates doc's starting value (15: "a starting value for the Lab"); the Lab sizes them (the doc's reading).
//
// `home` is where it drops, as 24-content-pipeline.md section 4's contract reads it (tests/content-coherence.mjs CC-6): { kind: 'monster', id }
// (the Cairn Wight on Muster Barrows, the Barrow Knight, the Lurcher on Pyre Field, Keeper Dunn in the Catacombs, the Troll Brewer on
// Carter's Rest); `move` the move a move Signature belongs to (every live move gets one, CC-5). `best` is the seat (src/data/hunt-roles.js
// HUNT_ROLES) and the ground it is sized on; a home off the Danger scale is sized on a scale ground its seat meets (the doc says which).
// `slot` the equip slot its piece fills; `weapon` the weapon kind a weapon Signature is (its piece is that weapon).
//
// DARK (SIGNATURE_RULES.live false): nothing drops one, no screen shows one, and no server or client file hands a hero `wornSignature`
// (tests/hunt-core/signature-rules.mjs dark); the engine plays one only on a hero handed it (src/core/hunt/signature-rules.js), which only
// the Lab and the tests do. Wave 4 hands it with the piece table and its Security review.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

const sig = (row) => Object.freeze({ ...row, home: Object.freeze(row.home), best: Object.freeze(row.best),
  reacts: Object.freeze(row.reacts.map((r) => Object.freeze({ ...r }))) });

export const SIGNATURES = Object.freeze({
  cairn_belt: sig({ id: 'cairn_belt', n: 36, name: 'Cairn Belt', slot: 'belt',
    home: { kind: 'monster', id: 'cairn_wight' }, best: { seat: 'tank', ground: 'muster_barrows' },
    tip: 'Below 30% health: gain a shield for 25% of max health (60 s cooldown)',
    reacts: [{ on: 'hp_below', belowPm: 300, do: 'shield', pm: 250, clockMs: 60000 }] }),
  barrow_knights_blade: sig({ id: 'barrow_knights_blade', n: 6, name: 'Barrow Knight\'s Blade', slot: 'weapon', weapon: 'sword', move: 'turning_cut',
    home: { kind: 'monster', id: 'barrow_knight' }, best: { seat: 'melee_dps', ground: 'muster_barrows' },
    tip: 'Turning Cut: each kill takes 1 s off its cooldown (up to 4 s a cast)',
    reacts: [{ on: 'kill', of: 'turning_cut', do: 'reset', move: 'turning_cut', ms: 1000, capMs: 4000 }] }),
  lurchers_collar: sig({ id: 'lurchers_collar', n: 9, name: 'Lurcher\'s Collar', slot: 'necklace', move: 'hunters_mark',
    home: { kind: 'monster', id: 'lurcher' }, best: { seat: 'ranger', ground: 'pyre_field' },
    tip: 'Hunter\'s Mark: when the target dies, the mark moves to the nearest monster with its time left',
    reacts: [{ on: 'death', do: 'pass', what: 'mark' }] }),
  the_wood_book: sig({ id: 'the_wood_book', n: 14, name: 'The Wood Book', slot: 'shield', move: 'frost_lance',
    home: { kind: 'monster', id: 'keeper_dunn' }, best: { seat: 'mage', ground: 'muster_barrows' },
    tip: 'Frost Lance vs a chilled target: Hoarfrost is ready again',
    reacts: [{ on: 'hit', of: 'frost_lance', has: 'chill', do: 'ready', move: 'hoarfrost' }] }),
  brewers_apron: sig({ id: 'brewers_apron', n: 18, name: 'Brewer\'s Apron', slot: 'body', move: 'circle_of_renewal',
    home: { kind: 'monster', id: 'troll_brewer' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'Circle of Renewal: each hero it heals deals 10% more damage for 4 s (once per cast)',
    reacts: [{ on: 'heal', of: 'circle_of_renewal', do: 'boon', status: 'emboldened', ms: 4000 }] }),
});

/* THE RULES (15 "Proposed rules"): one Signature a hero plays (the first equipped); the switch that hands one, off until wave 4 */
export const SIGNATURE_RULES = Object.freeze({
  perHero: 1,
  live: false,
});
