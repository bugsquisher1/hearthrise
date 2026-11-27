// ════════════════════════════════════════════════════════════════════════
// src/data/signatures.js — THE SIGNATURES: THE SAMPLE OF 5 AND BATCH 2, THE MOVE SIGNATURES (systems, lane/signatures-sample and
// lane/signatures-batch-2, 2026-11-26; the designer's ruling docs/design/redesign/15-signature-candidates.md "Decision: count and size", the
// rows' words there, their size 19-power-ledger.md row 6, the size bar 15 "Decision: how a Signature stays inside the gear slice").
//
// A Signature is a NAMED PIECE WITH ONE FIXED RULE nothing else gives: no roll, no ranks, one home. A hero plays ONE: the first it equipped
// (the server's projection hands that one; a second worn Signature does nothing). Its size is 10 steps (half a gear tier) on the cell that
// suits it best, inside the hero's gear slice with Traits (conditionalStepsMax 20), measured on the dominance check (29 section 3.8), never
// typed as steps: a Signature's rule is a mechanic (a shield, a cooldown, a mark moved, a reset, a timed boon), and the Lab reads what it buys.
//
// A RULE IS REACTION ROWS, the engine pieces the Roads, Signatures and Traits share (src/core/hunt/reactions.js; the vocabulary is
// src/data/talents.js REACT_ON / REACT_DO / REACT_FIELDS, one list for all three), never code of its own:
//   on        the moment: hit, kill, death (any monster's, whoever's blow), heal (a cast heal landing on a hero), hp_below (the wearer's own
//             health under `belowPm` after a blow), taunt, shield_break (a shell the wearer cast), cast (the wearer's own cast landed:
//             the HP its hits took, the monsters its status landed on), absorb (a monster's blow a shell the wearer cast took), ...
//   filters   of (the moment's move), has (the moment's monster carries that status as the moment happens), belowPm (the line; a heal's
//             read at the health it started from), marked (the moment's monster carries a live Mark), clockMs
//   do        shield (pm of max health on the wearer, x a moment's count, at most capPm), reset (ms off `move`, at most capMs a cycle),
//             ready (`move` ready now), pass (what the fallen carried moves on), boon (`status` on the moment's hero, `ms` long, `pw` its
//             strength), status (on the moment's monsters, `r` tiles round the wearer, `pm` a fixed tick of the moment's damage, a ground
//             status a patch), cast (`again`: no cooldown, no supply), burst (pm of the fallen's max health round it), reflect, ...
// Never x ramp (19 section 2: no ramp on what a hero finds). A reaction never sets off another (react-queue.js), so a reset, a free cast or
// an explosion from a Signature can't chain (15 "Proposed rules").
//
// THE SAMPLE (15 "Sample 5": one a seat, two homes on the scale, each a different engine piece later batches reuse):
//   #36 Cairn Belt              tank      a low-health gear shield           hp_below -> shield, its own clock
//   #6  Barrow Knight's Blade   sword     a shield from a crowd move         hit (of Turning Cut) -> shield 6% (the designer, 2026-11-26:
//                                         a reset per kill pays as the pull thins and read near zero; the shield pays while it is full)
//   #14 The Wood Book           mage      a reset from another move          hit (of Frost Lance) -> ready Hoarfrost (the chill filter
//                                         dropped 2026-11-26: +5.5 with it, +9.9 without, 12 seeds)
//   #18 Brewer's Apron          healer    a timed party damage buff          heal (of Circle of Renewal) -> boon Emboldened, 4 s
// BATCH 2 (15 "Batch 2": the rest of the move Signatures, #1 to #23 less the sample and #8, which waits on Stagger's branch rows; the
// readings are 15 "Batch 2, measured", each row's number the one that read inside the size bar or the doc's starting value):
//   #1  Bannerman's Pavise      tank      taunt -> Blunted on each monster taken (its next blow at half)
//   #2  Ossuary Helm            tank      cast (of Frost Slam) -> shield 2% x each monster it Chills, at most 10% (CUT from 3% and 15%: +15.8 read over the band)
//   #3  Grave Guard's Mail      tank      RESHAPED (a readied Challenge read -1.9: the reference tank casts it 9 times an hour): shield_break
//                                         (a shell the wearer cast: the shield discipline casts only Shelter's) -> Guarded at three times
//                                         its row (-30% taken, the key's cap) 8 s on that shell's hero
//   #4  Charred Sabre           sword     RESHAPED (a free Flame Strike on a kill +1.5, on every hit +2.6: a sword's damage buys no held
//                                         depth): cast (of Flame Strike) -> Blunted on its target (its next blow at half)
//   #5  Pikeman's Gauntlets     sword     hit (of Flame Strike) -> Power Strike ready
//   #7  Floodwater Hatchets     axes      cast (of Rend) -> Poison, 20% of the cast's damage over 6 s
//   #9  Lurcher's Collar        ranger    REWRITTEN for a long fight (15 "The sample, re-read": the moved Mark read 0): hit on a marked
//                                         monster -> a Bleed stack, once every 4 s (the stacks build over a fight, so a boss or a brute)
//   #10 Coal Runner's Bow       ranger    RESHAPED (the Roads' Burning Volley lays burning ground): kill (of Flame Volley) -> Volley ready, 10 s
//   #11 Provost's Longbow       ranger    hit (of Precision Shot) -> 1 s off Flame Volley and off Raking Shot
//   #12 Wyvern Barb Crossbow    ranger    RESHAPED (the Roads' Bleeding Rake lays the Bleed): hit (of Raking Shot) -> Poison, 20% of the hit
//   #13 Hall Fire Wand          mage      kill (of Fireball) -> burst, 30% of the fallen's max health on every monster next to it
//   #15 Catacomb Shroud         mage      hit (of Hoarfrost) -> Silenced 3 s
//   #16 Lamplighter's Robe      mage      shield_break (its own Arcane Barrier) -> Kindled (its next Fireball or Frost Lance +30%)
//   #17 Bargeman's Pole         healer    heal (of Greater Mend) on a target under half (RESHAPED from 30%: Steady falls back at 25%) -> Guarded at twice its row (-20% taken) 4 s
//   #21 Drover's Hat            healer    absorb (a shell the wearer cast: a healer's is Protective Ward) -> reflect 50% on the attacker
//   #23 Ferry Pennies           any       RESHAPED (Mend under 20% read +0.3: Steady falls back at 25%; a Chill under 40% +2.0): heal (of
//                                         Mend) under 45% -> Blunted (the next blow at half) on every monster next to the wearer
// NOT BUILT here: #19 Passing Bell and #20 Greened Bracers (mana: 15 "Batch 2 writes no mana Signature without a cell where mana binds",
// none read so; 15 "Batch 2, measured"), #8 (Stagger's), #22 (an Alone Signature, batch 3).
//
// `home` is where it drops, as 24-content-pipeline.md section 4's contract reads it (tests/content-coherence.mjs CC-6): { kind, id } with
// kind 'monster' (MONSTERS), 'ground' (HUNT_GROUNDS: the Flooded Wing) or 'chest' (a Hearth Chest key: the Tower's Bronze lock); `move` the
// move a move Signature belongs to (every live move gets one, CC-5). `best` is the seat (src/data/hunt-roles.js HUNT_ROLES) and the ground it
// is sized on; a home off the Danger scale, or one whose reference four sits at its top (the tank's on Hask's Ford, Pyre Field and the Bone
// Wing), is sized on a scale ground its seat meets with room over the plain four (the doc says which). `slot` the equip slot its piece
// fills; `weapon` the weapon kind a weapon Signature is (src/data/items.js weaponType: its piece is that weapon).
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
    tip: 'Turning Cut hits: gain a shield for 6% of max health',
    reacts: [{ on: 'hit', of: 'turning_cut', do: 'shield', pm: 60 }] }),
  lurchers_collar: sig({ id: 'lurchers_collar', n: 9, name: 'Lurcher\'s Collar', slot: 'necklace', move: 'hunters_mark',
    home: { kind: 'monster', id: 'lurcher' }, best: { seat: 'ranger', ground: 'muster_barrows' },
    tip: 'Hunter\'s Mark: your hits on the marked target add a Bleed stack (once every 4 s)',
    reacts: [{ on: 'hit', marked: true, do: 'status', status: 'bleed', clockMs: 4000 }] }),
  the_wood_book: sig({ id: 'the_wood_book', n: 14, name: 'The Wood Book', slot: 'shield', move: 'frost_lance',
    home: { kind: 'monster', id: 'keeper_dunn' }, best: { seat: 'mage', ground: 'muster_barrows' },
    tip: 'Frost Lance hits: Hoarfrost is ready again',
    reacts: [{ on: 'hit', of: 'frost_lance', do: 'ready', move: 'hoarfrost' }] }),
  brewers_apron: sig({ id: 'brewers_apron', n: 18, name: 'Brewer\'s Apron', slot: 'body', move: 'circle_of_renewal',
    home: { kind: 'monster', id: 'troll_brewer' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'Circle of Renewal: each hero it heals deals 10% more damage for 4 s (once per cast)',
    reacts: [{ on: 'heal', of: 'circle_of_renewal', do: 'boon', status: 'emboldened', ms: 4000 }] }),

  /* ── BATCH 2 (lane/signatures-batch-2) ── */
  bannermans_pavise: sig({ id: 'bannermans_pavise', n: 1, name: 'Bannerman\'s Pavise', slot: 'shield', move: 'challenge',
    home: { kind: 'monster', id: 'bannerman' }, best: { seat: 'tank', ground: 'muster_barrows' },
    tip: 'Challenge: the first blow from each monster you taunt lands at half damage',
    reacts: [{ on: 'taunt', do: 'status', status: 'blunted' }] }),
  ossuary_helm: sig({ id: 'ossuary_helm', n: 2, name: 'Ossuary Helm', slot: 'helmet', move: 'frost_slam',
    home: { kind: 'monster', id: 'bone_wall' }, best: { seat: 'tank', ground: 'krells_hold' },
    tip: 'Frost Slam: gain a shield of 2% of max health for each monster it Chills (up to 10%)',
    reacts: [{ on: 'cast', of: 'frost_slam', do: 'shield', pm: 20, capPm: 100 }] }),
  grave_guards_mail: sig({ id: 'grave_guards_mail', n: 3, name: 'Grave Guard\'s Mail', slot: 'body', move: 'shelter',
    home: { kind: 'monster', id: 'grave_guard' }, best: { seat: 'tank', ground: 'muster_barrows' },
    tip: 'Shelter: when a hero\'s shield breaks, that hero takes 30% less damage for 8 s',
    reacts: [{ on: 'shield_break', do: 'boon', status: 'guarded', pw: 3000, ms: 8000 }] }),
  charred_sabre: sig({ id: 'charred_sabre', n: 4, name: 'Charred Sabre', slot: 'weapon', weapon: 'sword', move: 'flame_strike',
    home: { kind: 'monster', id: 'charred_pikeman' }, best: { seat: 'melee_dps', ground: 'pyre_field' },
    tip: 'Flame Strike: its target\'s next blow lands at half damage',
    reacts: [{ on: 'cast', of: 'flame_strike', do: 'status', status: 'blunted' }] }),
  pikemans_gauntlets: sig({ id: 'pikemans_gauntlets', n: 5, name: 'Pikeman\'s Gauntlets', slot: 'gloves', move: 'flame_strike',
    home: { kind: 'monster', id: 'barrow_pikeman' }, best: { seat: 'melee_dps', ground: 'muster_barrows' },
    tip: 'Flame Strike: Power Strike is ready again',
    reacts: [{ on: 'hit', of: 'flame_strike', do: 'ready', move: 'power_strike' }] }),
  floodwater_hatchets: sig({ id: 'floodwater_hatchets', n: 7, name: 'Floodwater Hatchets', slot: 'weapon', weapon: 'axe', move: 'rend',
    home: { kind: 'ground', id: 'catacomb_flooded_wing' }, best: { seat: 'melee_dps', ground: 'catacomb_flooded_wing' },
    tip: 'Rend: also applies Poison (20% of Rend\'s damage over 6 s)',
    reacts: [{ on: 'cast', of: 'rend', do: 'status', status: 'poison', pm: 200 }] }),
  coal_runners_bow: sig({ id: 'coal_runners_bow', n: 10, name: 'Coal Runner\'s Bow', slot: 'weapon', weapon: 'ranged', move: 'flame_volley',
    home: { kind: 'monster', id: 'coal_runner' }, best: { seat: 'ranger', ground: 'ox_road' },
    tip: 'Flame Volley kills: Flame Volley is ready again (10 s cooldown)',
    reacts: [{ on: 'kill', of: 'flame_volley', do: 'ready', move: 'flame_volley', clockMs: 10000 }] }),
  provosts_longbow: sig({ id: 'provosts_longbow', n: 11, name: 'Provost\'s Longbow', slot: 'weapon', weapon: 'ranged', move: 'precision_shot',
    home: { kind: 'monster', id: 'provost' }, best: { seat: 'ranger', ground: 'pyre_field' },
    tip: 'Precision Shot: takes 1 s off Flame Volley\'s and Raking Shot\'s cooldowns',
    reacts: [{ on: 'hit', of: 'precision_shot', do: 'reset', move: 'flame_volley', ms: 1000, capMs: 4000 },
      { on: 'hit', of: 'precision_shot', do: 'reset', move: 'raking_shot', ms: 1000, capMs: 4000 }] }),
  wyvern_barb_crossbow: sig({ id: 'wyvern_barb_crossbow', n: 12, name: 'Wyvern Barb Crossbow', slot: 'weapon', weapon: 'ranged', move: 'raking_shot',
    home: { kind: 'monster', id: 'crag_wyvern' }, best: { seat: 'ranger', ground: 'wyvern_roost' },
    tip: 'Raking Shot: also Poisons every monster hit (20% of its damage over 6 s)',
    reacts: [{ on: 'hit', of: 'raking_shot', do: 'status', status: 'poison', pm: 200 }] }),
  hall_fire_wand: sig({ id: 'hall_fire_wand', n: 13, name: 'Hall Fire Wand', slot: 'weapon', weapon: 'magic', move: 'fireball',
    home: { kind: 'monster', id: 'lord_krell' }, best: { seat: 'mage', ground: 'krells_hold' },
    tip: 'Fireball on a kill: the monster explodes for 30% of its max health to every monster next to it',
    reacts: [{ on: 'kill', of: 'fireball', do: 'burst', pm: 300, r: 1 }] }),
  catacomb_shroud: sig({ id: 'catacomb_shroud', n: 15, name: 'Catacomb Shroud', slot: 'body', move: 'hoarfrost',
    home: { kind: 'monster', id: 'shrouded_pauper' }, best: { seat: 'mage', ground: 'catacomb_bone_wing' },
    tip: 'Hoarfrost: monsters it Chills are Silenced for 3 s',
    reacts: [{ on: 'hit', of: 'hoarfrost', do: 'status', status: 'silenced', ms: 3000 }] }),
  lamplighters_robe: sig({ id: 'lamplighters_robe', n: 16, name: 'Lamplighter\'s Robe', slot: 'body', move: 'arcane_barrier',
    home: { kind: 'chest', id: 'bronze' }, best: { seat: 'mage', ground: 'pyre_field' },
    tip: 'When your Arcane Barrier breaks: your next Fireball or Frost Lance deals 30% more damage',
    reacts: [{ on: 'shield_break', do: 'boon', status: 'kindled' }] }),
  bargemans_pole: sig({ id: 'bargemans_pole', n: 17, name: 'Bargeman\'s Pole', slot: 'weapon', weapon: 'magic', move: 'greater_mend',
    home: { kind: 'monster', id: 'bargeman' }, best: { seat: 'healer', ground: 'the_slake' },
    tip: 'Greater Mend on a target below half health: also gives 20% damage reduction for 4 s',
    reacts: [{ on: 'heal', of: 'greater_mend', belowPm: 500, do: 'boon', status: 'guarded', pw: 2000, ms: 4000 }] }),
  drovers_hat: sig({ id: 'drovers_hat', n: 21, name: 'Drover\'s Hat', slot: 'helmet', move: 'protective_ward',
    home: { kind: 'monster', id: 'drover' }, best: { seat: 'healer', ground: 'ox_road' },
    tip: 'Protective Ward: returns 50% of the damage it absorbs to the attacker',
    reacts: [{ on: 'absorb', do: 'reflect', pm: 500 }] }),
  ferry_pennies: sig({ id: 'ferry_pennies', n: 23, name: 'Ferry Pennies', slot: 'earrings', move: 'mend',
    home: { kind: 'monster', id: 'fordsunk' }, best: { seat: 'tank', ground: 'muster_barrows' },
    tip: 'Mend below 45% health: the next blow of every monster next to you lands at half',
    reacts: [{ on: 'heal', of: 'mend', belowPm: 450, do: 'status', status: 'blunted', r: 1 }] }),
});

/* THE RULES (15 "Proposed rules"): one Signature a hero plays (the first equipped); the switch that hands one, off until wave 4 */
export const SIGNATURE_RULES = Object.freeze({
  perHero: 1,
  live: false,
});
