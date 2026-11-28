// ════════════════════════════════════════════════════════════════════════
// src/data/signatures.js — THE SIGNATURES: THE SAMPLE OF 5 AND BATCH 2, THE MOVE SIGNATURES (systems, lane/signatures-sample and
// lane/signatures-batch-2, 2026-11-26; the designer's ruling docs/design/redesign/15-signature-candidates.md "Decision: count and size", the
// rows' words there, their size 19-power-ledger.md row 6, the size bar 15 "Decision: how a Signature stays inside the gear slice", read in
// PACE STEPS since lane/designer-sig-metric, 2026-11-27: 15 "Decision: the scale a Signature is sized on", "Batch 2, re-read on pace steps").
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
//             strength), status (on the moment's monsters, `r` tiles round the wearer, `pm` a fixed tick of the moment's damage),
//             burst (pm of the fallen's max health round it), reflect, ...
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
//   #1  Bannerman's Pavise      tank      DROPPED (15 "Batch 2, measured"): its moment, a taunt, is about 9 Challenges and 13 monsters an
//                                         hour for the reference tank, which holds its pulls without one (-0.2, se 2.9; +0.5 pinned on its home);
//                                         its status, Blunted, is laid by #4 and #23
//   #2  Ossuary Helm            tank      cast (of Frost Slam) -> shield 2% x each monster it Chills, at most 10% (CUT from 3% and 15%: +15.8 read over the band;
//                                         sized on Muster Barrows, where it was read: the tank four never settles on Krell's Hold)
//   #3  Grave Guard's Mail      tank      RESHAPED (a readied Challenge read -1.9: the reference tank casts it 9 times an hour): shield_break
//                                         (a shell the wearer cast, whichever move laid it: the designer accepted the wider reading and the
//                                         words say "a shield you cast", 15 "Batch 2's design calls") -> Guarded at three times its row
//                                         (-30% taken, the key's cap) 8 s on that shell's hero
//   #4  Charred Saber           sword     RESHAPED (a free Flame Strike on a kill +1.5, on every hit +2.6: a sword's damage buys no held
//                                         depth): cast (of Flame Strike) -> Blunted on its target (its next blow at half)
//   #5  Pikeman's Gauntlets     sword     hit (of Flame Strike) -> Power Strike ready
//   #7  Floodwater Hatchets     axes      cast (of Rend) -> Poison, 20% of the cast's damage over 6 s
//   #9  Lurcher's Collar        ranger    REWRITTEN for a long fight (15 "The sample, re-read": the moved Mark read 0): hit on a marked
//                                         monster -> a Bleed stack, once every 2 s (the stacks build over a fight, so a boss or a brute; the
//                                         clock from 4 s, lane/designer-sig-metric: 4.2 pace steps at 4 s, 9.3 at 2 s)
//   #10 Coal Runner's Bow       ranger    RESHAPED (the Roads' Burning Volley lays burning ground): kill (of Flame Volley) -> Volley ready, 10 s
//   #11 Provost's Longbow       ranger    hit (of Precision Shot) -> 1 s off Flame Volley and off Raking Shot
//   #12 Wyvern Barb Crossbow    ranger    RESHAPED (the Roads' Bleeding Rake lays the Bleed): hit (of Raking Shot) -> Poison, 20% of the hit
//                                         (under at 20% and 35%: dark, reshaped before it turns on; Poison stays #7's, 15 "Batch 2's design calls")
//   #13 Hall Fire Wand          mage      kill (of Fireball) -> burst, 30% of the fallen's max health on every monster next to it
//   #15 Catacomb Shroud         mage      hit (of Hoarfrost) -> Silenced 3 s (sized on Krell's Hold, where its Silence stops the Pyre Priests)
//   #16 Lamplighter's Robe      mage      shield_break (its own Arcane Barrier) -> Kindled (its next Fireball or Frost Lance +30%)
//   #17 Bargeman's Pole         healer    heal (of Greater Mend) on a target under half (RESHAPED from 30%: Steady falls back at 25%; -20% under half read +14.6, cut) -> Guarded at 1.5 times its row (-15% taken) 4 s
//   #21 Drover's Hat            healer    absorb (a shell the wearer cast: a healer's is Protective Ward) -> reflect 25% on the attacker (CUT
//                                         from 50%, lane/designer-sig-metric: 19.6 pace steps on Ox Road, over the band; 25% read 9.2)
//   #23 Ferry Pennies           any       RESHAPED (Mend under 20% read +0.3: Steady falls back at 25%; a Chill under 40% +2.0): heal (of
//                                         Mend) under 45% -> Blunted (the next blow at half) on every monster next to the wearer
// NOT BUILT in batch 2: #19 and #20 (their mana rules CUT, 15 "Batch 2's design calls": drinks are always sold, so mana is a coin cost and
// never binds a hunt; batch 3 wrote each a new rule), #8 (Stagger's).
// BATCH 3 (15 "Decision: count and size" batch 3, lane/signatures-batch-3, 2026-11-27: the runes, procs, low health, utility and alone rows,
// #19 and #20's new rules, the Challenge's; the readings are 15 "Batch 3, measured"). Every rule a reaction row on the pieces above or a new
// general one (a `pull` moment, the moment's monsters `list`, the filters `family` `single` `boss` `alone`, `every` moments, the doers'
// `to`), except two that are no reaction and read `signature` where they act: `saves` (abilities.js fire) and `stackPlus` (status.js):
//   #1  Bannerman's Pavise      tank      taunt -> Armor Break on each monster the Challenge took (#1's Blunted read 0: a new rule, its home kept)
//   #19 Lock-Keeper's Chain     healer    near_fall (a hero crossing its near-fall line) -> Spring Tide ready, once a 30 s clock (the name new:
//                                         the Tower's Gold lock already holds the Passing-Bell Hammer)
//   #20 Greened Bracers         healer    cast (of Green Sickness) -> Steeped on the wearer: its next Greater Mend +30%
//   #22 Slake Waders            any       kill, alone (no other hero of its side in the world) -> heal 4% of its max health
//   #24 Stoker's Ring           mage      hit (a Fire rune spell, on a chilled monster) -> echo 20% of the hit a sub-step later
//   #25 The Cold Candle         mage      saves: every third Ice rune spell buys or spends no rune (a coin piece: the market's, 13-security-list N-14)
//   #26 Thrower's Ring          healer    shield_break (a shell the wearer cast) -> that shell's hero heals 6% of its max health
//   #27 Riverstone Earrings     healer    heal (a Water rune heal) -> the hero healed gets mana of 10% of the HP it landed (a coin piece)
//   #28 Vault Leech Ring        healer    death (a monster carrying the wearer's Sickness) -> pass the Sickness on
//   #29 Fledgling Claw          axes      stackPlus: the wearer's Bleed lands a sixth stack on a monster at five
//   #31 The Cellar Key          healer    death, every fifth -> heal each hero of the party 3% of its max health ("a 20% chance" drawn by no dice)
//   #33 Teamster's Mitts        tank      kill -> 2% of the wearer's max mana (a coin piece)
//   #38 Drowned Signet          ranger    hit (a boss, left under 25%) -> Emboldened at 1.5 times its row, 10 s, on each hero of the party, once a boss
//   #42 Night Carter's Boots    tank      pull -> Chill 3 s on every monster of the pull's pack
//   #43 Bull's Tooth            ranger    kill (a single-target blow) -> carry its overkill to the nearest monster
// LEFT FOR BATCH 4 (their pieces are no reaction): the auras #34 and #35 and the pair #45 and #46 (a standing effect, by distance or by a
// partner in the party), the mana-cost rows #32, #37 and #44 (a cast that costs no mana or costs health), #40 (the drop roller's remains,
// lane/drop-formula's roller) and #41 (an arrow returned: the reference ranger shoots store arrows bought a shot, so a returned arrow is a
// refund or a minted item, a money call). #30 and #8 wait on their moves; #36 and #39 are the sample's and cut.
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
  ...(row.saves ? { saves: Object.freeze({ ...row.saves }) } : {}), ...(row.stackPlus ? { stackPlus: Object.freeze({ ...row.stackPlus }) } : {}),
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
    tip: 'Hunter\'s Mark: your hits on the marked target add a Bleed stack (once every 2 s)',
    reacts: [{ on: 'hit', marked: true, do: 'status', status: 'bleed', clockMs: 2000 }] }),
  the_wood_book: sig({ id: 'the_wood_book', n: 14, name: 'The Wood Book', slot: 'shield', move: 'frost_lance',
    home: { kind: 'monster', id: 'keeper_dunn' }, best: { seat: 'mage', ground: 'muster_barrows' },
    tip: 'Frost Lance hits: Hoarfrost is ready again',
    reacts: [{ on: 'hit', of: 'frost_lance', do: 'ready', move: 'hoarfrost' }] }),
  brewers_apron: sig({ id: 'brewers_apron', n: 18, name: 'Brewer\'s Apron', slot: 'body', move: 'circle_of_renewal',
    home: { kind: 'monster', id: 'troll_brewer' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'Circle of Renewal: each hero it heals deals 10% more damage for 4 s (once per cast)',
    reacts: [{ on: 'heal', of: 'circle_of_renewal', do: 'boon', status: 'emboldened', ms: 4000 }] }),

  /* ── BATCH 2 (lane/signatures-batch-2) ── */
  ossuary_helm: sig({ id: 'ossuary_helm', n: 2, name: 'Ossuary Helm', slot: 'helmet', move: 'frost_slam',
    home: { kind: 'monster', id: 'bone_wall' }, best: { seat: 'tank', ground: 'muster_barrows' },
    tip: 'Frost Slam: gain a shield of 2% of max health for each monster it Chills (up to 10%)',
    reacts: [{ on: 'cast', of: 'frost_slam', do: 'shield', pm: 20, capPm: 100 }] }),
  grave_guards_mail: sig({ id: 'grave_guards_mail', n: 3, name: 'Grave Guard\'s Mail', slot: 'body', move: 'shelter',
    home: { kind: 'monster', id: 'grave_guard' }, best: { seat: 'tank', ground: 'muster_barrows' },
    tip: 'When a shield you cast breaks, that hero takes 30% less damage for 8 s',
    reacts: [{ on: 'shield_break', do: 'boon', status: 'guarded', pw: 3000, ms: 8000 }] }),
  charred_sabre: sig({ id: 'charred_sabre', n: 4, name: 'Charred Saber', slot: 'weapon', weapon: 'sword', move: 'flame_strike',
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
    home: { kind: 'monster', id: 'shrouded_pauper' }, best: { seat: 'mage', ground: 'krells_hold' },
    tip: 'Hoarfrost: monsters it Chills are Silenced for 3 s',
    reacts: [{ on: 'hit', of: 'hoarfrost', do: 'status', status: 'silenced', ms: 3000 }] }),
  lamplighters_robe: sig({ id: 'lamplighters_robe', n: 16, name: 'Lamplighter\'s Robe', slot: 'body', move: 'arcane_barrier',
    home: { kind: 'chest', id: 'bronze' }, best: { seat: 'mage', ground: 'pyre_field' },
    tip: 'When your Arcane Barrier breaks: your next Fireball or Frost Lance deals 30% more damage',
    reacts: [{ on: 'shield_break', do: 'boon', status: 'kindled' }] }),
  bargemans_pole: sig({ id: 'bargemans_pole', n: 17, name: 'Bargeman\'s Pole', slot: 'weapon', weapon: 'magic', move: 'greater_mend',
    home: { kind: 'monster', id: 'bargeman' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'Greater Mend on a target below half health: also gives 15% damage reduction for 4 s',
    reacts: [{ on: 'heal', of: 'greater_mend', belowPm: 500, do: 'boon', status: 'guarded', pw: 1500, ms: 4000 }] }),
  drovers_hat: sig({ id: 'drovers_hat', n: 21, name: 'Drover\'s Hat', slot: 'helmet', move: 'protective_ward',
    home: { kind: 'monster', id: 'drover' }, best: { seat: 'healer', ground: 'ox_road' },
    tip: 'Shields you cast return 25% of the damage they absorb to the attacker',
    reacts: [{ on: 'absorb', do: 'reflect', pm: 250 }] }),
  ferry_pennies: sig({ id: 'ferry_pennies', n: 23, name: 'Ferry Pennies', slot: 'earrings', move: 'mend',
    home: { kind: 'monster', id: 'fordsunk' }, best: { seat: 'tank', ground: 'muster_barrows' },
    tip: 'Mend below 45% health: the next blow of every monster next to you lands at half',
    reacts: [{ on: 'heal', of: 'mend', belowPm: 450, do: 'status', status: 'blunted', r: 1 }] }),

  /* ── BATCH 3 (lane/signatures-batch-3) ── */
  bannermans_pavise: sig({ id: 'bannermans_pavise', n: 1, name: 'Bannerman\'s Pavise', slot: 'shield', move: 'challenge',
    home: { kind: 'monster', id: 'bannerman' }, best: { seat: 'tank', ground: 'muster_barrows' },
    tip: 'Challenge: monsters it taunts lose a quarter of their armor for 6 s',
    reacts: [{ on: 'taunt', do: 'status', status: 'armor_break' }] }),
  lock_keepers_chain: sig({ id: 'lock_keepers_chain', n: 19, name: 'Lock-Keeper\'s Chain', slot: 'necklace', move: 'spring_tide',
    home: { kind: 'chest', id: 'gold' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'A hero near fall-back: Spring Tide is ready again (once every 30 s)',
    reacts: [{ on: 'near_fall', do: 'ready', move: 'spring_tide', clockMs: 30000 }] }),
  greened_bracers: sig({ id: 'greened_bracers', n: 20, name: 'Greened Bracers', slot: 'gloves', move: 'green_sickness',
    home: { kind: 'monster', id: 'greened_pikeman' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'Green Sickness: your next Greater Mend heals 30% more',
    reacts: [{ on: 'cast', of: 'green_sickness', do: 'boon', to: 'self', status: 'steeped' }] }),
  slake_waders: sig({ id: 'slake_waders', n: 22, name: 'Slake Waders', slot: 'boots',
    home: { kind: 'monster', id: 'mudlark' }, best: { seat: 'melee_dps', ground: 'the_slake' },
    tip: 'While you hunt alone: each kill heals you for 4% of max health',
    reacts: [{ on: 'kill', alone: true, do: 'heal', to: 'self', pm: 40 }] }),
  stokers_ring: sig({ id: 'stokers_ring', n: 24, name: 'Stoker\'s Ring', slot: 'ring', family: 'fire',
    home: { kind: 'monster', id: 'stoker' }, best: { seat: 'mage', ground: 'muster_barrows' },
    tip: 'Fire rune spells vs a chilled target: +20% damage',
    reacts: [{ on: 'hit', family: 'fire', has: 'chill', do: 'echo', pm: 200, ms: 100 }] }),
  throwers_ring: sig({ id: 'throwers_ring', n: 26, name: 'Thrower\'s Ring', slot: 'ring', family: 'earth',
    home: { kind: 'monster', id: 'slate_thrower' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'When a shield you cast breaks, its wearer heals 6% of max health',
    reacts: [{ on: 'shield_break', do: 'heal', to: 'target', pm: 60 }] }),
  the_cold_candle: sig({ id: 'the_cold_candle', n: 25, name: 'The Cold Candle', slot: 'necklace', family: 'ice',
    home: { kind: 'monster', id: 'keeper_dunn' }, best: { seat: 'mage', ground: 'muster_barrows' },
    tip: 'Ice rune spells: every third one uses no rune',
    saves: { family: 'ice', every: 3 }, reacts: [] }),
  fledgling_claw: sig({ id: 'fledgling_claw', n: 29, name: 'Fledgling Claw', slot: 'necklace', family: 'rupture',
    home: { kind: 'monster', id: 'wyvern_fledgling' }, best: { seat: 'melee_dps', ground: 'muster_barrows' },
    tip: 'Rupture rune spells: Bleed on the target can stack to 6 instead of 5',
    stackPlus: { status: 'bleed', n: 1 }, reacts: [] }),
  riverstone_earrings: sig({ id: 'riverstone_earrings', n: 27, name: 'Riverstone Earrings', slot: 'earrings', family: 'water',
    home: { kind: 'monster', id: 'banded_pikeman' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'Water rune heals: the hero healed gets mana equal to 10% of the healing',
    reacts: [{ on: 'heal', family: 'water', do: 'mana', to: 'target', pm: 100 }] }),
  vault_leech_ring: sig({ id: 'vault_leech_ring', n: 28, name: 'Vault Leech Ring', slot: 'ring', family: 'poison',
    home: { kind: 'monster', id: 'vault_leech' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'When a monster with your Sickness dies, the Sickness moves to the nearest monster',
    reacts: [{ on: 'death', do: 'pass', what: 'sickness' }] }),
  the_cellar_key: sig({ id: 'the_cellar_key', n: 31, name: 'The Cellar Key', slot: 'necklace',
    home: { kind: 'monster', id: 'the_landlord' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'Every fifth monster that dies heals your party for 3% of max health',
    reacts: [{ on: 'death', every: 5, do: 'heal', to: 'party', pm: 30 }] }),
  teamsters_mitts: sig({ id: 'teamsters_mitts', n: 33, name: 'Teamster\'s Mitts', slot: 'gloves',
    home: { kind: 'monster', id: 'dead_teamster' }, best: { seat: 'tank', ground: 'muster_barrows' },
    tip: 'On kill: restore 2% of your max mana',
    reacts: [{ on: 'kill', do: 'mana', pm: 20 }] }),
  drowned_signet: sig({ id: 'drowned_signet', n: 38, name: 'Drowned Signet', slot: 'ring',
    home: { kind: 'monster', id: 'captain_hask' }, best: { seat: 'ranger', ground: 'muster_barrows' },
    tip: 'Your target boss below 25% health: you and your party deal 15% more damage for 10 s (once per boss)',
    reacts: [{ on: 'hit', boss: true, belowPm: 250, do: 'boon', to: 'party', status: 'emboldened', pw: 1500, ms: 10000, clockMs: 600000, per: 'target' }] }),
  night_carters_boots: sig({ id: 'night_carters_boots', n: 42, name: 'Night Carter\'s Boots', slot: 'boots',
    home: { kind: 'monster', id: 'night_carter' }, best: { seat: 'tank', ground: 'muster_barrows' },
    tip: 'Pull start: every monster in the pull is Chilled for 3 s',
    reacts: [{ on: 'pull', do: 'status', status: 'chill', ms: 3000 }] }),
  bulls_tooth: sig({ id: 'bulls_tooth', n: 43, name: 'Bull\'s Tooth', slot: 'earrings',
    home: { kind: 'monster', id: 'bull_wyvern' }, best: { seat: 'ranger', ground: 'muster_barrows' },
    tip: 'Single-target hits: overkill damage carries over to the nearest monster',
    reacts: [{ on: 'kill', single: true, do: 'carry', pm: 1000, capPm: 1000, r: 8 }] }),
});

/* THE RULES (15 "Proposed rules"): one Signature a hero plays (the first equipped); the switch that hands one, off until wave 4 */
export const SIGNATURE_RULES = Object.freeze({
  perHero: 1,
  live: false,
});
