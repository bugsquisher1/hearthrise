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
// BATCH 3'S UNDER ROWS, RULED (game designer, lane/designer-sig-batch4, 2026-11-28; 15 "Batch 3's under rows, ruled"; each row's reading there):
//   #1  Bannerman's Pavise      taunt -> Guarded at 1.25 times its row (-12.5% taken) 3 s on each hero of the party (the Challenge's Signature)
//   #42 Night Carter's Boots    ally_hit under 45% -> Blunted on the striker (in band, fails the spread: batch 4 adds a stalker filter)
//   #24 Stoker's Ring           cast (an Ice rune spell) -> Stoked on the wearer: its next Fire rune spell +45% (statuses.js stoked)
//   #25 The Cold Candle         saves every Ice rune spell (`every: 1`; a coin piece on the coin bar)
//   #27 Riverstone Earrings     heal (a Water rune heal) -> 0.5% of the wearer's own max mana (a coin piece)
//   #31 The Cellar Key          ally_hit under 30% -> heal that ally 2% of its max, once every 30 s an ally (sized on Carter's Rest, its home)
//   #43 Bull's Tooth            hit (single-target) leaving a monster under 30% -> echo of all of it (in band, fails the spread: a brute filter)
// RULED OUT, their rows as batch 3 built them until batch 4 rewrites each on its piece (HANDOFFS 2026-11-28 designer-sig-batch4): #26
// Thrower's Ring (a broken shell's breaker Blunted), #28 Vault Leech Ring (Sickness on the monster attacking the lowest ally), #33 Teamster's
// Mitts (Power Strike's Signature: a one-monster taunt). #38 waits on the boss cell, #29 on Gash.
// LEFT FOR BATCH 4 (their pieces are no reaction): the auras #34 and #35 and the pair #45 and #46 (a standing effect, by distance or by a
// partner in the party), the mana-cost rows #32, #37 and #44 (a cast that costs no mana or costs health), #40 (the drop roller's remains,
// lane/drop-formula's roller) and #41 (an arrow returned: the reference ranger shoots store arrows bought a shot, so a returned arrow is a
// refund or a minted item, a money call). #30 and #8 wait on their moves; #36 and #39 are the sample's and cut.
//
// BATCH 4 (lane/signatures-batch-4, 2026-11-28; HANDOFFS 2026-11-28 designer-sig-batch4, 15 "Batch 4: what is left, and the pieces it
// needs"), 14 rows on the engine pieces P1 to P9, each built once for all its rows:
//   #26 Thrower's Ring          P5 shield_break carries its breaker (`src`) -> Blunted on the monster that broke the shell
//   #28 Vault Leech Ring        P6 cast (a Poison rune spell) -> Sickness on the monster attacking the lowest hero of the party (`at`)
//   #33 Teamster's Mitts        P4 hit (of Power Strike) -> taunt: a monster on an ally turns on the wearer, held 4 s (Power Strike's)
//   #42 Night Carter's Boots, #43 Bull's Tooth   P9 a monster role (`role`): a stalker's blow, a brute hit
//   #32 Ledger Ring, #37 Lychgate Leggings, #44 Pyre Priest's Hood   P2 `costs`: what a cast of its kind pays instead of its mana
//                               (src/core/hunt/signature-costs.js)
//   #41 Brood Bracers           P3 `saves: { ammo }`: an arrow taken from nowhere after five landed shots, never minted (13 N-14)
//   #34 Sergeant's Sash, #35 Gatekeeper's Plate, #45 Convoy Bell, #46 Lead Rein   P1 `aura`: a standing effect round the wearer or on
//                               its partner (`with`), on a line (`belowPm`) (src/core/hunt/signature-auras.js)
//   #40 Hearth Mason's Cloak    P7 `save`: a would-be death of the party left at 1 HP, once an hour; the pull falls back
//                               (src/core/hunt/fall-save.js)
// P8 (the boss cell, tools) is not built: CONFLICTS 2026-11-28 signatures-batch-4.
//
// BATCH 5'S RULINGS (lane/designer-sig-batch5, 2026-11-28): the rows set and cut, each reading in 15 "Batch 4's calls and the out-of-band
// rows, ruled"; the cut rows stay as batch 4 built them until batch 5 rewrites each (HANDOFFS 2026-11-28 designer-sig-batch5).
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
  ...(row.costs ? { costs: Object.freeze({ ...row.costs }) } : {}), ...(row.aura ? { aura: Object.freeze({ ...row.aura }) } : {}), ...(row.save ? { save: Object.freeze({ ...row.save }) } : {}),
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
    tip: 'Challenge: your party takes 12.5% less damage for 3 s',
    reacts: [{ on: 'taunt', do: 'boon', to: 'party', status: 'guarded', pw: 1250, ms: 3000 }] }),
  lock_keepers_chain: sig({ id: 'lock_keepers_chain', n: 19, name: 'Lock-Keeper\'s Chain', slot: 'necklace', move: 'spring_tide',
    home: { kind: 'chest', id: 'gold' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'A hero near fall-back: Spring Tide is ready again (once a minute)',
    reacts: [{ on: 'near_fall', do: 'ready', move: 'spring_tide', clockMs: 60000 }] }),
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
    tip: 'Ice rune spells: your next Fire rune spell deals 45% more damage',
    reacts: [{ on: 'cast', family: 'ice', do: 'boon', to: 'self', status: 'stoked' }] }),
  throwers_ring: sig({ id: 'throwers_ring', n: 26, name: 'Thrower\'s Ring', slot: 'ring', family: 'earth',
    home: { kind: 'monster', id: 'slate_thrower' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'When a shield you cast breaks, the monster that broke it has its next blow at half',
    reacts: [{ on: 'shield_break', do: 'status', status: 'blunted' }] }),
  the_cold_candle: sig({ id: 'the_cold_candle', n: 25, name: 'The Cold Candle', slot: 'necklace', family: 'ice',
    home: { kind: 'monster', id: 'keeper_dunn' }, best: { seat: 'mage', ground: 'muster_barrows' },
    tip: 'Your Ice rune spells use no runes',
    saves: { family: 'ice', every: 1 }, reacts: [] }),
  fledgling_claw: sig({ id: 'fledgling_claw', n: 29, name: 'Fledgling Claw', slot: 'necklace', family: 'rupture',
    home: { kind: 'monster', id: 'wyvern_fledgling' }, best: { seat: 'melee_dps', ground: 'muster_barrows' },
    tip: 'Rupture rune spells: Bleed on the target can stack to 6 instead of 5',
    stackPlus: { status: 'bleed', n: 1 }, reacts: [] }),
  riverstone_earrings: sig({ id: 'riverstone_earrings', n: 27, name: 'Riverstone Earrings', slot: 'earrings', family: 'water',
    home: { kind: 'monster', id: 'banded_pikeman' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'Water rune heals: you get back 0.5% of your max mana',
    reacts: [{ on: 'heal', family: 'water', do: 'mana', pm: 5 }] }),
  vault_leech_ring: sig({ id: 'vault_leech_ring', n: 28, name: 'Vault Leech Ring', slot: 'ring', family: 'poison',
    home: { kind: 'monster', id: 'vault_leech' }, best: { seat: 'healer', ground: 'carters_rest' },
    tip: 'Poison rune spells: the hurt ally lowest on health heals for 60% of the damage they deal',
    reacts: [{ on: 'cast', family: 'poison', do: 'heal', to: 'lowest', pm: 600 }] }),
  the_cellar_key: sig({ id: 'the_cellar_key', n: 31, name: 'The Cellar Key', slot: 'necklace',
    home: { kind: 'monster', id: 'the_landlord' }, best: { seat: 'healer', ground: 'carters_rest' },
    tip: 'When a monster hits an ally below 30% health, that ally heals 3% of max health (once every 20 s for each ally)',
    reacts: [{ on: 'ally_hit', belowPm: 300, do: 'heal', to: 'target', pm: 30, clockMs: 20000, per: 'target' }] }),
  teamsters_mitts: sig({ id: 'teamsters_mitts', n: 33, name: 'Teamster\'s Mitts', slot: 'gloves', move: 'power_strike',
    home: { kind: 'monster', id: 'dead_teamster' }, best: { seat: 'melee_dps', ground: 'muster_barrows' },
    tip: 'Power Strike on a monster attacking an ally: it turns on you for 4 s',
    reacts: [{ on: 'hit', of: 'power_strike', do: 'taunt', ms: 4000 }] }),
  drowned_signet: sig({ id: 'drowned_signet', n: 38, name: 'Drowned Signet', slot: 'ring',
    home: { kind: 'monster', id: 'captain_hask' }, best: { seat: 'ranger', ground: 'muster_barrows' },
    tip: 'Your target boss below 25% health: you and your party deal 15% more damage for 10 s (once per boss)',
    reacts: [{ on: 'hit', boss: true, belowPm: 250, do: 'boon', to: 'party', status: 'emboldened', pw: 1500, ms: 10000, clockMs: 600000, per: 'target' }] }),
  night_carters_boots: sig({ id: 'night_carters_boots', n: 42, name: 'Night Carter\'s Boots', slot: 'boots',
    home: { kind: 'monster', id: 'night_carter' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'When a stalker hits an ally below 45% health, its next blow lands at half',
    reacts: [{ on: 'ally_hit', belowPm: 450, role: 'stalker', do: 'status', status: 'blunted' }] }),
  bulls_tooth: sig({ id: 'bulls_tooth', n: 43, name: 'Bull\'s Tooth', slot: 'earrings',
    home: { kind: 'monster', id: 'bull_wyvern' }, best: { seat: 'ranger', ground: 'muster_barrows' },
    tip: 'Single-target hits on a brute below half health deal double damage',
    reacts: [{ on: 'hit', single: true, belowPm: 500, role: 'brute', do: 'echo', pm: 1000, ms: 100 }] }),

  /* ── BATCH 4 (lane/signatures-batch-4): the auras, the pair, the cast costs, the saved shot, the fall-back save ── */
  ledger_ring: sig({ id: 'ledger_ring', n: 32, name: 'Ledger Ring', slot: 'ring',
    home: { kind: 'monster', id: 'ledger_wight' }, best: { seat: 'mage', ground: 'muster_barrows' },
    tip: 'Every fourth spell you cast costs no mana',
    costs: { of: 'spell', pay: 'none', every: 4 }, reacts: [] }),
  sergeants_sash: sig({ id: 'sergeants_sash', n: 34, name: 'Sergeant\'s Sash', slot: 'cape',
    home: { kind: 'monster', id: 'color_sergeant' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'Party aura: +20% mana regeneration within 8 tiles',
    aura: { regenPm: 200, r: 8 }, reacts: [] }),
  gatekeepers_plate: sig({ id: 'gatekeepers_plate', n: 35, name: 'Gatekeeper\'s Plate', slot: 'body',
    home: { kind: 'monster', id: 'gatekeeper' }, best: { seat: 'tank', ground: 'muster_barrows' },
    /* (CUT from 8%: 22.0 pace steps on the tank four, over the band; 4% read 8.5, 2.5% 2.3: 15 "Batch 4, measured") */
    tip: 'Aura: you and allies within 2 tiles take 4% less damage',
    aura: { takenPm: -40, r: 2 }, reacts: [] }),
  lychgate_leggings: sig({ id: 'lychgate_leggings', n: 37, name: 'Lychgate Leggings', slot: 'pants',
    home: { kind: 'chest', id: 'gold' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'Below half mana: your heals cost no mana for 5 s (40 s cooldown)',
    costs: { of: 'heal', pay: 'none', belowManaPm: 500, ms: 5000, clockMs: 40000 }, reacts: [] }),
  hearth_masons_cloak: sig({ id: 'hearth_masons_cloak', n: 40, name: 'Hearth Mason\'s Cloak', slot: 'cape',
    home: { kind: 'chest', id: 'platinum' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'Once every 75 minutes, a hero of your party who would die falls back instead',
    save: { clockMs: 4500000 }, reacts: [] }),
  brood_bracers: sig({ id: 'brood_bracers', n: 41, name: 'Brood Bracers', slot: 'gloves',
    home: { kind: 'monster', id: 'brood_wyvern' }, best: { seat: 'ranger', ground: 'muster_barrows' },
    tip: 'Every third arrow that hits: your next shot costs no arrow',
    saves: { ammo: true, every: 3, hit: true }, reacts: [] }),
  pyre_priests_hood: sig({ id: 'pyre_priests_hood', n: 44, name: 'Pyre Priest\'s Hood', slot: 'helmet',
    home: { kind: 'monster', id: 'pyre_priest' }, best: { seat: 'mage', ground: 'muster_barrows' },
    tip: 'Above 70% health: your spells cost health instead of mana (1 health per mana)',
    costs: { of: 'spell', pay: 'hp', aboveHpPm: 700 }, reacts: [] }),
  convoy_bell: sig({ id: 'convoy_bell', n: 45, name: 'Convoy Bell', slot: 'necklace',
    home: { kind: 'monster', id: 'wagonmaster' }, best: { seat: 'healer', ground: 'muster_barrows' },
    tip: 'With Lead Rein in your party: your heals on its wearer heal 30% more while it is below half health',
    aura: { healPm: 300, to: 'with', with: 'lead_rein', belowPm: 500 }, reacts: [] }),
  lead_rein: sig({ id: 'lead_rein', n: 46, name: 'Lead Rein', slot: 'belt',
    home: { kind: 'monster', id: 'wagonmaster' }, best: { seat: 'tank', ground: 'muster_barrows' },
    /* (CUT from 15%: the Rein's own half read 19.0 pace steps, over the band; 7.5% read 10.0, the Bell's half at 30% 9.1: each piece of
       the pair sized as one Signature, 15 "Batch 4, measured") */
    tip: 'With Convoy Bell in your party: below half health, you take 7.5% less damage',
    aura: { takenPm: -75, with: 'convoy_bell', belowPm: 500 }, reacts: [] }),
});

/* THE RULES (15 "Proposed rules"): one Signature a hero plays (the first equipped); the switch that hands one, off until wave 4 */
export const SIGNATURE_RULES = Object.freeze({
  perHero: 1,
  live: false,
});
