# Signature candidates (46)

Every number is a starting value for the Lab. The count is decided below.

## Decision: count and size (game designer, 2026-11-23)

Tyler: "more variety is better, but I'll go with designers judgement."

| Call | Ruling |
|---|---|
| Size | 10 steps, half a gear tier. Inside the gear slice of 20 with Traits (`19`, kept by `29` section 3.8) |
| Count | The whole pool. 45 here plus the support's 8 (`22` section 7.1, one a move plus Pyre-Cloth Wraps) = **53**. Parry and Gash add one each when written (wave 3) = 55 |
| Cut | **#39 Tollman's Gloves.** A second boss drop roll is a second luck system beside the Inner Flame, and every party would wear one |
| Waiting on a move | #8 (Stagger), #30 (Brand). Built with their move, never before |
| Order | A sample of 5, played on the dominance check (`29` section 3.8), then batches of 20 or fewer, each audited for repetition |
| Sample 5 | #36 Cairn Belt (tank, Muster Barrows) · #6 Barrow Knight's Blade (sword, Muster Barrows) · #9 Lurcher's Collar (bow, Pyre Field) · #14 The Wood Book (mage, Keeper Dunn) · #18 Brewer's Apron (healer, Carter's Rest) |
| Batch 2 | The rest of the move Signatures (#1 to #23 less the sample and #8) |
| Batch 3 | Runes, procs, auras, low health, utility, alone, pair (#24 to #46 less #30, #36, #39) |
| Batch 4 | The support's 8, then #8, #30, Parry, Gash with their moves |
| Market and drop rows | #25, #40, #41 go through Security with batch 3 |

**Why the whole pool.**

- One worn Signature a hero and a fixed gear slice. More Signatures add choices, never power
- One home each, 3 to 5 a ground. Every ground carries a chase
- A short list makes every build wear the same few. A long one makes the pick a build
- Most need shared engine pieces (cooldown resets, gear shields, triggers, auras). The cost is per piece, not per Signature

**Why this sample.** One per seat. Two homes on the scale. Each needs a different engine piece (a low-health gear shield, a reset per kill, a status that moves on a death, a reset from another move, a timed party damage buff), so the sample builds the pieces later batches reuse.

## The sample, measured (systems, lane/signatures-sample, 2026-11-26)

**How it plays:** the five work in the fight engine when a hero wears one. Players still see none of them: nothing drops or hands a Signature until wave 4 (`SIGNATURE_RULES.live` false). Each is one rule on the engine pieces the Talent tree already uses (`src/data/signatures.js`, `src/core/hunt/signature-rules.js`, `reactions.js`), so a later batch adds rows, not code:

| Piece | What it is | First used by | Later batches that reuse it |
|---|---|---|---|
| Low-health shield | on the wearer's health falling under a line, a shield of a share of max health, on its own clock | #36 | #23, #37 (the low-health trigger) |
| Reset per kill | a kill by a move takes time off a cooldown, capped a cast (the Talent tree's own reset) | the Roads (Ready Mark); #6 until 2026-11-26 | #11 |
| A status moves on a death | when a monster dies (anyone's blow), its Mark or a status the wearer laid moves to the nearest monster with its time left | #9 | #28, Spread |
| A reset from another move | a move's hit on a target carrying a status makes another move ready | #14 | #3, #5 |
| A timed boon on a heal | a heal move landing on a hero gives it a status for a time (Emboldened, +10% dealt) | #18 | #16, #17, #38 |

MEASURED on `set/v0.2.144` 5d2434803 (`tools/balance-program/redesign/signature-depth/run.sh`, `sum.mjs`: each Signature on its seat's reference company, MID kits at the ground's reference Level, Steady, 6 seeds x 8 h, held from hour 4; the same four with none on the same dice). The strong four is not the cell here: it sits at Muster's top (698 of 700), where nothing can show.

| Signature | Ground | Plain held | With it | Held delta (se) | Level XP/h | Verdict on the size (10 +- 3) |
|---|---|---|---|---|---|---|
| Cairn Belt (tank four) | Muster Barrows | 678.8 | 688.5 | +9.7 (3.1) | +3.3% | **In band.** The tank's fall-backs halve (1.4 to 0.7 an hour) |
| Barrow Knight's Blade (sword four) | Muster Barrows | 628.1 | 616.6 | -11.5 (5.5) | -2.9% | **Fails.** The sword's damage is flat (16.3 a second both ways) and its fall-backs double (0.5 to 1.0 an hour). Likely cause (not proven): the extra Turning Cuts spend the mana its Mend needs |
| Lurcher's Collar (bow) | Pyre Field | 77.2 | 77.2 | +0.0 (2.8) | +0.4% | **Fails.** The Mark lasts 8 s on a 12 s cooldown and the bow re-casts it as soon as it is ready, so a moved Mark buys a few seconds of +20% on one monster |
| The Wood Book (mage) | Muster Barrows | 618.5 | 623.6 | +5.2 (5.1) | +2.9% | Under the band, inside one se of it. Needs more seeds |
| Brewer's Apron (healer) | Muster Barrows | 618.5 | 624.9 | +6.5 (4.9) | +3.8% | Under the band, inside one se of it. Every seat's damage rises 1 to 2% |

- **The dominance check, as far as a sample of 5 can go.** One Signature a hero and one candidate a seat, so no Signature competes with another for a slot here. Step 1 (the size) is read above. Step 2 (a Signature's average over every scale ground at most half its best) needs each one on a second ground. Steps 3 to 5 need the kit sampler (19 V10). Owed with batch 2.
- **Homes off the scale.** Keeper Dunn (the Unmarked Catacombs) and Carter's Rest are not on the Danger scale on this set, so The Wood Book and Brewer's Apron were measured on Muster Barrows, a scale ground both seats hunt. Re-read each on its home once the home is on the scale.
- **The gear slice cap does not clamp a Signature.** The cap counts steps on one blow. A shield, a reset or a moved Mark has no steps, and Emboldened is its own held step. "Inside the gear slice" holds by the measured size only (CONFLICTS 2026-11-26).
- **What the words do in the engine.** "Each hero it heals" is each hero a cast lands on, even one already at full health. A Signature's reset can't set off another (the reaction queue never chains). "Below 30% health" and "vs a chilled target" are read as the blow lands.
- **Designer's calls (nothing nerfed or raised here):** the Blade and the Collar fail their size as written. The Wood Book and the Apron want a 12-seed re-read before any number moves.

## The sample, re-read and reshaped (game designer, 2026-11-26, lane/designer-sig-1126)

MEASURED on `set/v0.2.144` aa36ac9f9, the lane's harness cell (`signature-depth/run.sh`: MID kits at the ground's reference Level, Steady, 8 h, held from hour 4), variant rows played as temporary ids and taken out before commit. Paired against the same four with none on the same seeds.

| Signature | Shape read | Seeds | Held delta (se) | Level XP/h | Reading |
|---|---|---|---|---|---|
| The Wood Book | as built | 12 | +5.5 (2.8) | +2.3% | Under the band |
| The Wood Book | + 6% mana on the same hit | 12 | +5.5 (2.8) | +2.3% | Identical hunt: the mage's mana is full when Frost Lance lands |
| The Wood Book | **any Frost Lance hit readies Hoarfrost** (no chill filter) | 12 | **+9.9 (2.9)** | +4.3% | **In band. Built** |
| Brewer's Apron | as built (Emboldened 4 s) | 12 | +5.3 (2.5) | +2.9% | Under the band |
| Brewer's Apron | Emboldened 6 s | 12 | +3.6 (3.2) | +3.2% | No gain: the boon's length is not its lever |
| Barrow Knight's Blade | as built (reset per kill) | 6 | -11.5 (5.5) | -2.9% | Fails |
| Barrow Knight's Blade | + 4% mana a Turning Cut kill | 6 | -11.5 (5.5) | -2.9% | Identical hunt: **mana is not the cause**, the sword's mana is full at its kills |
| Barrow Knight's Blade | 5% mana a kill, no reset | 6 | 0.0 (0.0) | 0.0% | Identical hunt to none (the refund never lands) |
| Barrow Knight's Blade | a shield of 4 / 8 / 12% a Turning Cut kill, no reset | 6 | -4.3 (4.2) / -3.2 (3.4) / -7.7 (4.2) | -0.5 / -1.6 / -1.7% | No gain |
| Barrow Knight's Blade | a shield of 10% a Turning Cut hit (one shell, never added up) | 12 | +16.8 (3.1) | +6.0% | Over the band |
| Barrow Knight's Blade | **a shield of 6% a Turning Cut hit** | 12 | **+11.0 (2.6)** | +4.0% | **In band. Built** ("Turning Cut hits: gain a shield for 6% of max health") |
| Lurcher's Collar | as built (the Mark moves) | 6 | +0.0 (2.8) | +0.4% | Fails |
| Lurcher's Collar | Mark ready on any death | 6 | +0.3 (2.8) | +0.2% | No gain, and repeats the Ready Mark branch |
| Lurcher's Collar | moves + ready | 6 | -0.8 (1.2) | +0.7% | No gain |
| Lurcher's Collar | Precision Shot ready on any death | 6 | +2.0 (2.7) | +2.6% | Small |
| Lurcher's Collar | Raking Shot ready on any death | 6 | -0.8 (1.4) | +1.9% | No gain |

**What the readings say.**

- **The Blade's cause is the kill, not mana.** Every rule hung on a Turning Cut kill reads -3 to -12 against one plain 6-seed run, so that plain run sits high and a kill rule's true size on the sword four is near zero. A kill lands when the pull is already thinning, and the sword's depth is its health while the pull is full. A rule that pays on the kill pays at the wrong moment.
- **The Collar's cause is the Mark.** A Mark kept up nearly all the time (ready on any death) buys nothing: the Mark is one conditional step on blows at one monster, held to the conditional ceiling (`amount.js` markPm through `held`), and Pyre's four kills a marked monster fast enough that more Mark time adds little. No rule that only keeps the Mark up can reach 10.
- **The rulings.** The Blade becomes a shield from its crowd move: it pays while the pull is full, which is when the sword is in danger, and it plays the low-health shield's piece, so it adds no engine code. Its note "Clears big pulls fast" becomes "Holds big pulls". The Wood Book drops its chill filter: Hoarfrost chills, so the filter mostly held anyway, and without it the rule is the plain link a player reads ("Frost Lance hits: Hoarfrost is ready again"). **The Apron is kept as built** at +5.3 (2.5): one se from the band, and its length is not its lever (6 s read lower), its Circle's cast rate is. It is re-read on its home, Carter's Rest, once that ground is on the scale, where spread damage casts the Circle more; no number is moved on a ground that is not its home. **The Collar does not ship in the sample.** Five shapes read -0.8 to +2.0 on Pyre Field. The Mark is a single-target move and Pyre's packs die before it matters, so the Mark's Signature is re-written in batch 2 for a long fight (a boss or a brute-heavy ground), with its best cell named there. It stays dark and unchanged here
- **The regression:** `tests/hunt-core/signature-rules.mjs` reset-per-kill holds the Blade's shield (one 6% shell from five hits, another move's hit nothing) and keeps the reset piece on a planted row; reset-from-move holds any Frost Lance hit and keeps the `has` filter on a planted row
- **Mana is not a lever in the reference company.** Both mana refunds played the identical hunt. A Signature that gives mana reads zero until a cell runs dry. Batch 2 writes no mana Signature without a cell where mana binds.

## Decision: how a Signature stays inside the gear slice (game designer, 2026-11-26, lane/designer-sig-1126)

**How it plays:** a lucky hero with a full Trait kit and a Signature is never more than the gear slice (20 steps) ahead of an unlucky one. The cap can't see a shield, a reset or a moved Mark, so each Signature earns its place by what it measures, before it ships.

| Call | Ruling |
|---|---|
| The rule | **Measured size, one rule for every Signature.** No Signature is routed through the gear slice ledger, the offense boons (#16, #18, #38) included |
| The size bar | Held delta on its best cell **10 +- 3**, read paired on 12 seeds x 8 h (`tools/balance-program/redesign/signature-depth/`), its se at most 3. Over 13 is cut in its number, under 7 is raised or reshaped |
| The spread bar | Its average over the scale grounds its seat hunts is at most half its best cell (`29` section 3.8 step 2). A Signature that is big everywhere is a stat, and is reshaped |
| The ceiling | The kit sampler (`19` V10) reads Traits at the cap plus each Signature on its best cell. The lucky kit stays inside the luck ceiling (`19` line "Luck ceiling", gear slice 20). A Signature that breaks it is cut in its number |
| When | Every batch (2, 3, 4) lands with its rows' readings in this doc. No row turns on (`SIGNATURE_RULES.live`) without them |

**Why measured size, not a ledger row for the boons.**

- Most Signatures are mechanics. A shield, a reset, a ready, a moved status have no steps, so a ledger row would cap three of 53 and leave the rest on size anyway. Two rules where one does the job is a second path to keep right.
- The cap clamps one blow. The luck ceiling is about the whole hunt. Held depth is what the ceiling protects, so held depth is what we read.
- Emboldened is +10% dealt for 4 s, already capped at 20 by its own step. A short timed boon is small next to a Trait that holds all hunt, and its size reads in the held delta like any other.
- `19-power-ledger.md` row 6 now reads "by measured size (15)" instead of "through the gear slice cap".

## Batch 2, measured (systems, lane/signatures-batch-2, 2026-11-26)

**How it plays:** the batch's Signatures work in the fight engine for a hero that wears one. Players still see none (`SIGNATURE_RULES.live` false). Each is reaction rows on the pieces the sample built, plus these, each general (`src/core/hunt/reactions.js`, `react-queue.js`, `src/data/statuses.js`):

| Piece | What it is | First used by | Later rows that can reuse it |
|---|---|---|---|
| A cast's own moment | a hero's cast landed: the HP its hits took and the monsters its status landed on | #2 (a shield for each monster Chilled), #7 (Poison of the whole cast) | any rule read once a cast, not once a hit |
| A shell's blow | a monster's blow a shell the hero cast took: what it took and from whom | #21 (half back on the attacker) | |
| A status's reach, a fixed tick, a patch | a status on every monster within `r` of the hero, on each monster a taunt took, a tick of `pm` of the moment's damage, or a ground patch at the moment's target | #23 (Chill round the wearer), #7 and #12 (Poison), #1 (Blunted on each taunted) | #42 (Chill on the pull, with a pull-start moment) |
| Cast again | a reaction's free cast that waits on no cooldown and spends no supply | #4 (Flame Strike again on a kill) | |
| A burst | pm of the fallen's max health on every monster within `r` of it, exact, never chaining | #13 | |
| A boon's strength | a boon at `pw` permille of its row (Guarded at -20%, its row -10%) | #17 | #38 |
| Blunted, Kindled | a monster's next blow cut (spent on it); a hero's next cast of named moves raised (spent on it) | #1, #16 | |

**Done, verified and assumed, kept apart:** every row's rule is proven in `tests/hunt-core/signature-rules.mjs` (one case a row, each with a mutant: 25 cases, 47 mutants caught) and on the real settle (both paths: 10-minute and 100-second windows play one hunt). The sizes below are MEASURED. The luck ceiling (the V10 kit sampler) is COMPUTED only.

READINGS_PENDING

## How Signatures work

- **What it is:** a named piece with one fixed rule nothing else gives. No roll, no ranks. Every move and every rune family has one. 16 more are procs, auras, low-health effects, loot hooks, utility, unique stats and one pair.
- **How rare:** rarer than any Very Rare. Target: one given Signature in about 30 to 60 hunted hours of farming its home.
- **Where it drops:** each has one home. A boss, a named monster on a deep ground, or the Tower's Hearth Chest. The bestiary shows it once you've filled enough of that monster's page.
- **Trading:** yes. It's sold as a single piece and keeps its rule. Every Signature sale is announced in town (`13-market.md`).

**Proposed rules:**

- One Signature per hero. A second one can be worn, but only the first one equipped works.
- A Signature doesn't stack with itself. Two party members wearing the same aura count once.
- The pair (#45 and #46) works across two heroes in one party, so it never breaks the one-per-hero rule.
- A move Signature never repeats one of that move's branches, and never removes something a branch needs (`16-talent-branches.md`). It adds a proc, a link to another move, or an effect none of that move's branches have.
- A Signature works with every branch of its move. It can be best with one, but it's never worth wearing with only one.
- Size: half a gear tier (10 steps) on the grounds that suit it, the size of a rank 3 Trait. It sits inside the hero's gear slice with Traits (20 steps, 10 until Level 100), so a lucky kit is never more than one tier over an unlucky one (`19-power-ledger.md`, 2026-11-22; was "one gear tier", which counted it twice). The suggested path reads the worn Signature, so a Signature never widens the 5 to 10% build ceiling.
- A free cast, a reset or an explosion from a Signature can't set off another one.
- Everything here follows the stacking keys at the end of this doc.

---

# Move Signatures

## Shield

**1. Bannerman's Pavise** · Shield · Drops from: Hask's Ford, Bannerman
Challenge: the first blow from each monster you taunt lands at half damage
Best for: Tank
Note: Takes the edge off a pull while the tank sits near its 20% line. Works with every Challenge branch. Measure in batch 2 on the line as built.

**2. Ossuary Helm** · Helmet · Drops from: Unmarked Catacombs, Bone Wall
Frost Slam: you gain a shield of 2% of your max health for each monster it Chills (up to 10%)
Best for: Tank
Note: Party only, like Frost Slam. Weaker with Pinning Frost, which hits one monster. If Frost Slam is merged into the Challenge (Cold Challenge, `23` section 4), this moves with it. (Cut 2026-11-26, batch 2: 3% each up to 15% read +15.8 on Muster, over the band.)

**3. Grave Guard's Mail** · Body · Drops from: Krell's Hold, Grave Guard
Shelter: when a hero's shield breaks, that hero takes 30% less damage for 8 s
Best for: Tank
Note: Works with every Shelter branch. (Reshaped 2026-11-26, batch 2: a readied Challenge read -1.9, since the reference tank casts its Challenge about 9 times an hour.)

## Sword

**4. Charred Sabre** · Weapon (sword) · Drops from: Pyre Field, Charred Pikeman
Flame Strike: its target's next blow lands at half damage
Best for: Melee, sword. Also Tank.
Note: The burned monster flinches. (Reshaped 2026-11-26, batch 2: a free Flame Strike on a kill read +1.5 and on every hit +2.6 on Pyre Field. A sword's damage buys no held depth.)

**5. Pikeman's Gauntlets** · Gloves · Drops from: Muster Barrows, Barrow Pikeman
Flame Strike: Power Strike is ready again
Best for: Melee, sword. Also Tank.
Note: Works with every Power Strike branch. Quarry Blow is now Stagger, so this is Flame Strike only.

**6. Barrow Knight's Blade** · Weapon (sword) · Drops from: Muster Barrows, Barrow Knight
Turning Cut hits: gain a shield for 6% of max health
Best for: Melee, sword
Note: Holds big pulls. One shell, never added up. Does little vs a lone boss. (Reshaped 2026-11-26: the reset per kill read near zero.)

## Dual axe

**7. Floodwater Hatchets** · Weapon (axes) · Drops from: Unmarked Catacombs, Flooded Wing
Rend: also applies Poison (20% of Rend's damage over 6s)
Best for: Melee, axes
Note: Bleed and Poison tick at the same time. Needs a Poison status (new).

## Club

**8. Stable Troll's Maul** · Weapon (hammer) · Drops from: Carter's Rest, Stable Troll
Stagger: you gain a shield of 10% of your max health for each wind-up it ends
Best for: Melee, hammer
Note: Earth rune shield, so #26 works with it. Stagger replaces Quarry Blow in wave 3. Does nothing where monsters don't wind up.

## Ranged

**9. Lurcher's Collar** · Necklace · Drops from: Pyre Field, Lurcher
Hunter's Mark: your hits on the marked target add a Bleed stack (once every 4 s)
Best for: Ranger
Note: Built for a long fight. The stacks build while the Mark's target lives, so a boss or a brute bleeds and a fast pack barely does. Shares the 5-stack Bleed cap with an axe user. (Re-written 2026-11-26, batch 2: the moved Mark read 0 on five shapes.)

**10. Coal Runner's Bow** · Weapon (bow) · Drops from: Ox Road, Coal Runner
Flame Volley kills: Flame Volley is ready again (10 s cooldown)
Best for: Ranger
Note: Best on big pulls of weak monsters. (Reshaped 2026-11-26, batch 2: the burning ground is now the Roads' Burning Volley option, so the Signature repeated a branch.)

**11. Provost's Longbow** · Weapon (bow) · Drops from: Pyre Field, Provost
Precision Shot: takes 1s off Flame Volley's and Raking Shot's cooldowns
Best for: Ranger
Note: More area shots in a long pull.

**12. Wyvern Barb Crossbow** · Weapon (crossbow) · Drops from: Wyvern Roost, Crag Wyvern
Raking Shot: also Poisons every monster hit (20% of its damage over 6 s)
Best for: Ranger
Note: A poison build for the crossbow. (Reshaped 2026-11-26, batch 2: a Bleed stack on every monster hit is now the Roads' Bleeding Rake option.)

## Destruction

**13. Hall Fire Wand** · Weapon (wand) · Drops from: Lord Krell
Fireball on a kill: the monster explodes for 30% of its max health to every monster next to it
Best for: Mage
Note: Only Fireball's own kills explode. An explosion can't set off another.

**14. The Wood Book** · Spellbook · Drops from: Keeper Dunn
Frost Lance hits: Hoarfrost is ready again
Best for: Mage
Note: Frost Lance, then Hoarfrost, again and again. Makes a frost build. (Chill filter dropped 2026-11-26.)

**15. Catacomb Shroud** · Body · Drops from: Unmarked Catacombs, Shrouded Pauper
Hoarfrost: monsters it Chills are Silenced for 3s
Best for: Mage
Note: Shuts down casters. A wind-up already started still lands. Turns off the "while an enemy is casting" Traits for the party. Silenced is the support's Cold Palm status, one key for both.

**16. Lamplighter's Robe** · Body · Drops from: The Tower, Hearth Chest (Bronze lock)
When your Arcane Barrier breaks: your next Fireball or Frost Lance deals 30% more damage
Best for: Mage
Note: The opposite of Charged Barrier, which wants the shield to hold.

## Restoration

**17. Bargeman's Pole** · Weapon (staff) · Drops from: The Slake, Bargeman
Greater Mend on a target below half health: also gives 20% damage reduction for 4s
Best for: Healer
Note: For saves, not top-ups. Best with Deep Mending, still useful with the others. (Reshaped 2026-11-26, batch 2: Steady falls back at 25%, so a target under 30% seldom met the heal, and on Bold the Slake's four sits at its top.)

**18. Brewer's Apron** · Body · Drops from: Carter's Rest, Troll Brewer
Circle of Renewal: each hero it heals deals 10% more damage for 4s (once per cast)
Best for: Healer
Note: A healer that adds damage. With Lasting Circle it starts on the first tick.

**19. Passing Bell** · Necklace · Drops from: The Tower, Hearth Chest (Gold lock)
Spring Tide: also restores 20% mana to every hero it heals (once a minute)
Best for: Healer
Note: Refills the casters. Ebb Tide casts more often but doesn't refill more.

**20. Greened Bracers** · Gloves · Drops from: The Slake, Greened Pikeman
Green Sickness: restores 2 mana to you for each monster it hits
Best for: Healer
Note: Offense that pays for heals. Weaker with Single Dose, which hits one monster.

**21. Drover's Hat** · Helmet · Drops from: Ox Road, Drover
Protective Ward: returns 50% of the damage it absorbs to the attacker
Best for: Healer
Note: Puts the ward on the tank and it hits back.

(#22 moved to Other Signatures, below. Undertow is cut.)

## Every weapon

**23. Ferry Pennies** · Earrings · Drops from: Hask's Ford, Fordsunk
Mend below 45% health: the next blow of every monster next to you lands at half
Best for: Any
Note: A late escape for any hero. Best with Second Wind. (Reshaped 2026-11-26, batch 2: Chill under 20% read +0.3 (0.7), its Mend under the line about once an hour since Steady falls back at 25%, and Chill under 40% +2.0.)

## Runes

**24. Stoker's Ring** · Ring · Drops from: Pyre Field, Stoker
Fire rune spells vs a chilled target: +20% damage
Best for: Mage, Ranger, Melee (sword)
Note: Ice then fire. Makes a party want both.

**25. The Cold Candle** · Necklace · Drops from: Keeper Dunn
Ice rune spells: 30% chance to use no rune
Best for: Mage, Tank
Note: Fewer runes to buy for a frost build. Sized with the market.

**26. Thrower's Ring** · Ring · Drops from: Carter's Rest, Slate Thrower
Earth rune shields: when one breaks, its wearer is healed for 30% of the shield
Best for: Tank, Healer, Mage
Note: Works on Shelter, Protective Ward, Arcane Barrier and #2 and #8.

**27. Riverstone Earrings** · Earrings · Drops from: Hask's Ford, Banded Pikeman
Water rune heals: also restore mana to the target equal to 10% of the healing
Best for: Healer
Note: Keeps the Mage and the healer going on long hunts.

**28. Vault Leech Ring** · Ring · Drops from: Unmarked Catacombs, Vault Leech
Poison rune spells: when a monster with their Sickness dies, the Sickness moves to the nearest monster
Best for: Healer
Note: Green Sickness is the only Poison rune spell that gives Sickness. The support's Lye spends one too, but it gives Weakened. Best with Single Dose.

**29. Fledgling Claw** · Necklace · Drops from: Wyvern Roost, Wyvern Fledgling
Rupture rune spells: Bleed on the target can stack to 6 instead of 5
Best for: Melee, axes
Note: Rend spends a Rupture rune, and Gash will too (wave 3). The cap counts for both.

**30. Raft Builder's Earrings** · Earrings · Drops from: The Tower, Hearth Chest (Silver lock)
Storm rune spells: the mana they return also goes to the party member lowest on mana
Best for: Melee (sword)
Note: Updraft is cut, so Brand (4 mana back on a kill, Sword only when live) is its one Storm spell. Waits until Brand goes live. Re-home it if Brand is cut too.

---

# Other Signatures

## Procs

**31. The Cellar Key** · Necklace · Drops from: Carter's Rest, The Landlord
On kill: 20% chance to heal the party for 3% health
Best for: Healer, any
Note: Best on grounds with big pulls.

**32. Ledger Ring** · Ring · Drops from: Hask's Ford, Ledger Wight
On crit: your next spell costs no mana (10s cooldown)
Best for: Mage
Note: Wants crit on the rest of the kit. Only weapon hits crit today.

**33. Teamster's Mitts** · Gloves · Drops from: Ox Road, Dead Teamster
On kill: restore 4 mana
Best for: Melee
Note: Fewer drinks on big pulls.

## Auras

**34. Sergeant's Sash** · Cape · Drops from: The Slake, Color Sergeant
Party aura: +20% mana regeneration within 8 tiles
Best for: Healer, Mage
Note: Fewer drinks for the whole party.

**35. Gatekeeper's Plate** · Body · Drops from: Krell's Hold, Gatekeeper
Aura: monsters within 2 tiles of you deal 8% less damage
Best for: Tank
Note: Melee standing next to the tank are covered too.

## Low health and low mana

**36. Cairn Belt** · Belt · Drops from: Muster Barrows, Cairn Wight
Below 30% health: gain a shield for 25% of max health (60s cooldown)
Best for: Tank, Melee
Note: One free mistake a minute. Good on Bold.

**37. Lychgate Leggings** · Legs · Drops from: The Tower, Hearth Chest (Gold lock)
Below 30% mana: your heals cost no mana for 5s (90s cooldown)
Best for: Healer
Note: Lets a healer run low on purpose.

**38. Drowned Signet** · Ring · Drops from: Captain Hask
Target boss below 25% health: +15% damage for you and your party for 10s (once per boss)
Best for: Melee, Ranger
Note: Hask hits harder below a quarter. This ends him first.

## Loot and economy

**39. Tollman's Gloves** · Gloves · Drops from: Lord Krell
Vs bosses: 10% chance of a second drop roll
Best for: Any
Note: Not on hall prizes or chests. One per party counts. Systems and Security size it before it's built.

**40. Hearth Mason's Cloak** · Cape · Drops from: The Tower, Hearth Chest (Platinum lock)
+10% remains from your kills
Best for: Any
Note: More fuel for the flame, or more to sell. Sized with the market.

**41. Brood Bracers** · Gloves · Drops from: Wyvern Roost, Brood Wyvern
Arrows that hit: 25% chance to return to your quiver
Best for: Ranger
Note: Cuts the arrow bill on long hunts.

## Utility and unique stats

**42. Night Carter's Boots** · Boots · Drops from: Unmarked Catacombs, Night Carter
Pull start: every monster in the pull is Chilled for 3s
Best for: Tank, any
Note: The tank gets set up before the first swing. It lands before Frost Slam or Hoarfrost can, the one moment no other Chill covers.

**43. Bull's Tooth** · Earrings · Drops from: Wyvern Roost, Bull Wyvern
Single-target hits: overkill damage carries over to the nearest monster
Best for: Ranger, Mage
Note: Big hits stop wasting damage on weak monsters. Area hits don't carry.

**44. Pyre Priest's Hood** · Helmet · Drops from: Krell's Hold, Pyre Priest
Above 70% health: spells cost health instead of mana (1 health per mana)
Best for: Mage
Note: Risky. Needs a healer or Mend. Keeps Full Wick nearly always on, so the Lab checks the pair.

## Alone

**22. Slake Waders** · Boots · Drops from: The Slake, Mudlark
While you hunt alone: each kill heals you for 4% of your max health
Best for: Any hero hunting alone
Note: Was Undertow's. Undertow is cut and its job is now the alone rule on every weapon's strikes (`23` section 4), so this goes with the rule, not one move. A party never sees it.

## Pair

**45. Convoy Bell** · Necklace · Drops from: Ox Road, Wagonmaster
With Lead Rein in your party: +25% healing on its wearer
Best for: Healer

**46. Lead Rein** · Belt · Drops from: Ox Road, Wagonmaster
With Convoy Bell in your party: 10% less damage taken
Best for: Tank
Note: A healer and a tank who hunt together. Each piece also trades alone.

---

## Coverage

| Way or seat | Move and rune Signatures | Other Signatures |
|---|---|---|
| Tank (sword and shield) | 1, 2, 3, 4, 5, 25, 26 | 35, 36, 42, 46 |
| Sword alone | 4, 5, 6, 24, 30 | 33, 38 |
| Axes | 7, 29 | 33 |
| Hammer | 8 | 33, 36 |
| Bow or crossbow | 9, 10, 11, 12 | 41, 43 |
| Wand (Mage) | 13, 14, 15, 16, 24, 25 | 32, 34, 44 |
| Staff (Healer) | 17, 18, 19, 20, 21, 27, 28 | 31, 37, 45 |
| Support (wraps) | One per move, in `22-fists-support.md` section 7.1 | |
| Any | 23 | 22 (alone), 39, 40 |

Parry (sword) and Gash (axes) get one each when they're written as rows in wave 3 (R-X1). Stagger takes #8.

## Drops by place

- **Captain Hask:** 38
- **Lord Krell:** 13, 39
- **Keeper Dunn:** 14, 25
- **Muster Barrows:** 5, 6, 36
- **Krell's Hold:** 3, 35, 44
- **Pyre Field:** 4, 9, 11, 24
- **Hask's Ford:** 1, 23, 27, 32
- **The Slake:** 17, 20, 22, 34
- **Carter's Rest:** 8, 18, 26, 31
- **Ox Road:** 10, 21, 33, 45, 46
- **Wyvern Roost:** 12, 29, 41, 43
- **Unmarked Catacombs:** 2, 7, 15, 28, 42
- **The Tower, Hearth Chest:** 16 (Bronze), 30 (Silver), 19 and 37 (Gold), 40 (Platinum)

## Stacking keys

One table for Traits (`14-trait-candidates.md`), Signatures (this doc) and Talent branches (`16-talent-branches.md`).

| Key | What's in it | Rule |
|---|---|---|
| Monster deals less damage | Hard Challenge and its rank 15, Long Hold's rank 15, Crippling Mark, Shaken (Stagger), Weakened (the support's Lye), #35 | Doesn't stack. The largest on a monster counts |
| Monster takes more damage | Sickness (Green Sickness, Single Dose) | One Sickness on a monster. The stronger one replaces the weaker |
| Hunter's Mark | All Hunter's Mark branches | Its own key. Adds to Sickness, as today. One Mark per monster |
| Fire damage taken | Burning Volley | Its own key. Fire damage only |
| Chill | Frost Slam, Hoarfrost, Chilling Lance, the support's Cold Palm, #42 | One Chill on a monster. A new one restarts the time and keeps the stronger slow |
| Silenced (can't start a spell) | #15, the support's Cold Palm | One at a time. Restarts the time |
| Ends a wind-up | Stagger (wave 3) | Its own key. A wind-up ends once |
| Bleed | Rend, Gash (wave 3), the Roads' Bleeding Rake, #9 | One count of stacks per monster, from every source. Cap 5, or 6 on a target hit by #29's wearer |
| Poisoned | Poison (#7, #12) and Sickness | What Traits #30 and #40 read. One Poison a monster, a new one restarts it |
| Blunted (a monster's next blow) | #23 | Its own key: one blow, spent on it, added to Weakened, never replacing it |
| Damage taken by a hero | Traits that lower damage taken, Guard Strike, Guarding Challenge's rank 15, #3, #17, #46 | Different sources add, held to 30% (Guarded's key, hero_takes_less). The Lab sets one cap for the total. The same party Trait counts once |
| Shields | Shelter, Protective Ward, Arcane Barrier, High Tide, the support's Warm Stone, #2, #8, #36 | One shield per hero. A new one replaces it only if bigger |
| Hero deals more damage | Charged Barrier, #16, #18, #38, damage Traits | Different sources add. The same Signature or party Trait counts once in a party |
| Healing done | Healing Traits, #45, healing branches | Add |
| Mana back | #19, #20, #27, #33, #34, Lasting Ward, Arcane Barrier's refund | Add |
| Free casts and cooldown resets | #4, #5, #10, #11, #14, #32 | A free cast or reset can't set off another one |

## New engine pieces needed

Each listed once, for this doc and `16-talent-branches.md` together.

- New statuses: Poison (#7), burning ground (#10), Silenced (#15, shared with the support's Cold Palm), fire damage taken (Burning Volley), monster deals less damage (Hard Challenge, Crippling Mark, Shaken, #35), hero takes less damage for a few seconds (Guard Strike, #17), hero deals more damage for a few seconds (#16, #18, #38).
- Status strength set by a branch: a stronger Chill (Pinning Frost, Hard Freeze), a stronger Sickness (Single Dose), a longer Chill or Sickness (Long Frost, Deep Hoarfrost, Lingering Sickness), a Bleed cap above 5 on one target (#29), Chill that slows attacks and wind-ups by different amounts (Slowing Frost).
- Heals over time (Lasting Circle, Steady Mend), healing past full health kept as a shield (High Tide), a second hit a few seconds later (Slow Burn).
- Moves that cast on their own when something happens (Guarding Challenge), a Mark on more than one monster (Pack Mark), a heal that also lands on a second hero (Split Mending, Shared Mend, Draining Sickness).
- Cooldown resets and reductions from another move (#3, #5, #6, #11, #14), a free recast (#4), an explosion on a kill (#13), overkill carry (#43), a status moving on a death (Spread, #28).
- Shields from gear and from wind-ups ended (#2, #8, #36), a heal when a shield breaks (#26), damage returned to the attacker (#21), a first blow at half (#1), a heal on a kill while alone (#22).
- Mana back from gear: on kill (#33), on hit (#20), on heal (#19, #27), when a spell crits (#32), and heals that cost no mana for a time (#37).
- Auras (#34, #35), the pair check (#45, #46), health as a spell cost (#44), triggers on low health, low mana, boss health and pull start (#23, #36, #37, #38, #42), a party heal on a kill (#31).
- A chance to use no rune (#25), arrow return (#41), a second drop roll (#39) and extra remains (#40).
- Bleed on a bow (#12) only needs the existing status on a new move. #8 needs Stagger and blow wind-ups (wave 3).
- #25, #39, #40 and #41 touch drops, supplies and the market, so they go through Security before they're built.
- Summons are left out. The hunt engine has no hero summons.
- Build in batches (CLAUDE.md section 10): a sample of 5 first, played, then the rest in batches of 20 or fewer.

## Checked against the data

Every move, rune family, status, monster and place above was looked up in `src/data` on 2026-11-22: the 23 live moves in `abilities.js` (Brand, Reave, Updraft and Blight are switched off, so they have none), the families in `runes.js`, the statuses in `statuses.js` (Bleed, Chill, Sickness), the monsters in `src/data/grounds/*/pack.js`, and the Tower's locks in `tower-weapons.js`. Every item name was checked against existing items and Traits so nothing repeats.

## Changes from the cross-check

Checked 2026-11-22 against `14-trait-candidates.md`, `16-talent-branches.md`, `02-architecture.md` (1b and 2), `abilities.js` and `statuses.js`.

- Rules: a move Signature never repeats or empties a branch, works with every branch, is sized to one gear tier, and can't chain. Stacking keys added.
- #1 Bannerman's Pavise: note that Frost Slam's Chill already covers it.
- #2 Ossuary Helm: was "chilled monsters deal 10% less damage", the same as Trait #25 Numbed. Now a shield for each monster Frost Slam Chills.
- #3 Grave Guard's Mail: was "taunt the monster that broke a shield", the same job as Guarding Challenge. Now makes Challenge ready again.
- #4 Charred Sabre: the free cast can't chain.
- #5 Pikeman's Gauntlets: was "always crits vs full health", the same as Opening Strike and needing spell crits. Now Flame Strike or Quarry Blow makes Power Strike ready again.
- #6 Barrow Knight's Blade: was a full reset on any kill, which loops on weak packs. Now 1s per kill, up to 4s.
- #7 Floodwater Hatchets: Poison 40% down to 20% of Rend's damage.
- #8 Stable Troll's Maul: was Sickness on Quarry Blow, the same as Breaking Blow. Now a shield from the damage it deals.
- #10 Coal Runner's Bow: burning ground 20% down to 10% a second.
- #11 Provost's Longbow: was "always crits vs a Marked target", the same as Aimed Shot. Now cuts Flame Volley's and Raking Shot's cooldowns.
- #12 Wyvern Barb Crossbow: 1 stack a hit, shares the Bleed cap. #33 link removed.
- #13 Hall Fire Wand: explosions can't chain.
- #14 The Wood Book: was a splash on chilled targets, an area change that belongs to branches (Piercing Lance). Now makes Hoarfrost ready again.
- #15 Pauper's Shroud renamed Catacomb Shroud (clashed with Trait #17 Pauper's Share). Reads "monsters it Chills" so it works with Hard Freeze. Notes the casting Traits and Wind-up Shot it turns off.
- #16 Lamplighter's Robe: was "while the barrier holds", the same condition as Charged Barrier. Now pays off when the barrier breaks.
- #17 Bargeman's Pole: noted as best with Deep Mending.
- #18 Brewer's Apron: once per cast, so Lasting Circle's ticks don't keep it up.
- #19 Passing Bell: once a minute, so Ebb Tide doesn't double it.
- #20 Greened Bracers: was "Sickness monsters deal 10% less", the same as Trait #40 Sour Vault. Now mana back for each monster hit.
- #22 Slake Waders: was 100% of Undertow's damage as healing, the same as Drowning Pull (130% together). Now +40% vs targets with Sickness.
- #24 Stoker's Ring: no longer ends Chill, which emptied Shatter, Cold Stone, Frost Slam, #14 and Traits #5 and #25. +30% down to +20%.
- #25 Dunn's Last Candle renamed The Cold Candle (clashed with Trait #31 Dunn's Warning). Was "Chill lasts 2s longer", the same as Long Frost and Deep Hoarfrost. Now a chance to use no rune.
- #26 Slate Ring renamed Thrower's Ring (clashed with Trait #22 Slate Hand). Covers #2 and #8.
- #28 Vault Leech Ring: noted as best with Single Dose.
- #29 Fledgling Claw: Bleed cap 8 down to 6.
- #32 Ledger Ring: notes that spells don't crit.
- #33 Teamster's Mitts: was "Bleed moves on a kill", the same as Rend's Spread. Now 4 mana on a kill, for any melee.
- #38 Hask's Price renamed Drowned Signet (clashed with Trait #37 Hask's Bargain).
- #43 Bull's Tooth: single-target hits only.
- #44 Pyre Priest's Hood: flagged with Trait #16 Full Wick for the Lab.
- Wording: "told in town" and "far enough along" rewritten.

## Changes from the spell audit

2026-11-22, from `23-spell-audit.md` section 8. Still 46 here. The support's per-move Signatures live in `22-fists-support.md` section 7.1.

- #1 Bannerman's Pavise: was a Chill on taunt, a fifth Chill source that Frost Slam already covers. Now the first blow from each taunted monster lands at half.
- #2 Ossuary Helm: moves with Frost Slam if it's merged into the Challenge.
- #3 Grave Guard's Mail: re-measured once the holder line lands.
- #5 Pikeman's Gauntlets: Flame Strike only. Quarry Blow is now Stagger. Hammer comes off its best-for.
- #8 Stable Troll's Maul: was a shield from Quarry Blow's damage. Now Stagger: a shield of 10% of max health for each wind-up it ends.
- #9 Lurcher's Collar: note on the Mark now sitting on the bow's own target.
- #15 Catacomb Shroud: its no-cast status is Silenced, the same key as Cold Palm. Wind-up Shot is renamed, so it's no longer named here.
- #17 Bargeman's Pole: re-measured after Greater Mend's re-size.
- #22 Slake Waders: was Undertow vs a Sick target. Undertow is cut. Now an Alone Signature: each kill heals you for 4% while you hunt alone.
- #28 Vault Leech Ring, #29 Fledgling Claw: rune notes updated (Lye spends Poison but gives Weakened, Gash spends Rupture).
- #30 Raft Builder's Earrings: Updraft is cut, so it waits on Brand alone. Sword only.
- #42 Night Carter's Boots: kept. It's the one Chill that lands before any move can.
- Coverage: hammer has #8 only, Slake Waders moves to Any, Support row points to 22. Parry and Gash get theirs in R-X1.
- Stacking keys: Breaking Blow, Bleeding Turn and Heavy Undertow out. Wide Challenge's rank 15 becomes Long Hold's. Cold Palm, Gash, Warm Stone, Shaken and Weakened in. Can't cast becomes Silenced. New key: ends a wind-up.
- Engine list: matching changes.
