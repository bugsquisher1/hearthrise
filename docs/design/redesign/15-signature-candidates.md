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
| The size bar | **10 +- 3 pace steps** on its best cell, read paired on 12 seeds x 8 h (`tools/balance-program/redesign/signature-depth/`), its se at most 3. Over 13 is cut in its number, under 7 is raised or reshaped. Pace steps, not held depth, since 2026-11-27 ("Decision: the scale a Signature is sized on", below) |
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
| A status's reach, a fixed tick | a status on every monster within `r` of the hero, or a tick of `pm` of the moment's damage | #23 (Blunted round the wearer), #7 and #12 (Poison) | #42 (Chill on the pull, with a pull-start moment) |
| A burst | pm of the fallen's max health on every monster within `r` of it, exact, never chaining | #13 | |
| A boon's strength | a boon at `pw` permille of its row (Guarded at -15% and -30%, its row -10%) | #3, #17 | #38 |
| Blunted, Kindled | a monster's next blow cut (spent on it); a hero's next cast of named moves raised (spent on it) | #4 and #23 (Blunted), #16 (Kindled) | |

**Done, verified and assumed, kept apart:** every row's rule is proven in `tests/hunt-core/signature-rules.mjs` (one case a row, each with a mutant: 25 cases, 47 mutants caught) and on the real settle (both paths: 10-minute and 100-second windows play one hunt). The sizes below are MEASURED. The luck ceiling (the V10 kit sampler) is COMPUTED only.

MEASURED on `lane/signatures-batch-2` snapshots 319850652 to e72bc4412 (the hunt engine of `set/v0.2.144` be079455d plus this lane's pieces; the set merged since moved no hunt file and engine-parity held across both merges with no re-pin, and the three pieces taken out after, cast again, a status patch and a taunt's list, no row played), `tools/balance-program/redesign/signature-depth/batch2.sh` and `sum.mjs --batch 2`: each Signature on its seat's reference company (MID kits at the ground's reference Level, Steady, 12 seeds x 8 h, held from hour 4), paired against the same four with none on the same seeds. A reshaped row's shapes were played as temporary ids on a scratch copy of the tree and taken out (the reports `b2v-*`). A move the played bars never cast (Frost Slam, Shelter) is on the tank's bar in both arms.

| Signature (seat) | The rule now | Best cell | Plain held | Held delta (se), 12 seeds | Level XP/h | Second ground | Its delta (se) | Verdict |
|---|---|---|---|---|---|---|---|---|
| #1 Bannerman's Pavise (tank) | **Dropped** | Muster Barrows | 676.2 | -0.2 (2.9) | +0.1% | Hask's Ford, its home (pinned) | +0.5 (0.4) | No moment: the tank taunts about 13 monsters an hour |
| #2 Ossuary Helm (tank, Frost Slam on the bar) | **Cut:** 2% of max health a monster it Chills, up to 10% | Muster Barrows | 678.7 | +10.8 (1.6) | +3.5% | the tank's others pinned or unsettled | | **In band** (as written +15.8 (2.1)) |
| #3 Grave Guard's Mail (tank, Shelter on the bar) | **Reshaped:** a shell you cast breaks, that hero takes 30% less for 8 s | Muster Barrows | 682.0 | +9.3 (1.6) | +2.9% | the tank's others pinned or unsettled | | **In band** (Challenge ready -1.9 (2.3)) |
| #4 Charred Saber (sword) | **Reshaped:** Flame Strike's target's next blow lands at half | Pyre Field | 73.3 | +7.4 (2.2) | +3.2% | Muster Barrows | +4.0 (3.6) | **In band**, spread within its se (a free recast on a kill +1.5 (2.0)) |
| #5 Pikeman's Gauntlets (sword) | as built | Pyre Field | 73.3 | +0.2 (1.9) | +0.5% | Muster Barrows | -5.2 (3.6) | Under (damage) |
| #7 Floodwater Hatchets (axes) | as built | Flooded Wing | 505.9 | +3.1 (3.1) | +0.5% | | | Under (damage; 60% of the cast -0.6 (2.7)) |
| #9 Lurcher's Collar (bow) | re-written | Muster Barrows | 623.9 | -1.2 (2.3) | +2.5% | | | Under (damage) |
| #10 Coal Runner's Bow (bow) | reshaped off the Roads | Ox Road | 166.7 | -3.8 (1.9) | -0.6% | | | Under (damage) |
| #11 Provost's Longbow (bow) | as built | Pyre Field | 77.0 | -0.1 (2.1) | +1.4% | | | Under (damage) |
| #12 Wyvern Barb Crossbow (crossbow) | reshaped off the Roads | Wyvern Roost | 190.9 | +4.3 (1.8) | +1.0% | Pyre Field | +0.1 (1.4) | Under (damage) |
| #13 Hall Fire Wand (mage) | as built | Krell's Hold | 67.0 | -0.9 (2.1) | +2.1% | Muster Barrows | -0.1 (2.4) | Under (damage) |
| #15 Catacomb Shroud (mage) | as built | Bone Wing | 588.2 | +0.5 (1.8) | +0.5% | Krell's Hold | -4.3 (2.7) | Under |
| #16 Lamplighter's Robe (mage) | as built | Pyre Field (the mage takes 12% of the blows) | 77.0 | -1.7 (2.5) | +0.5% | Muster Barrows (0.1%) | +1.4 (2.7) | Under (damage) |
| #17 Bargeman's Pole (healer) | **Reshaped and cut:** a Greater Mend on a target under half, -15% taken 4 s | Muster Barrows | 623.9 | +10.5 (2.4) | +2.7% | The Slake (at -20%) | +3.0 (2.3) | **In band**, spread holds |
| #21 Drover's Hat (healer) | as built | Ox Road | 166.7 | +0.5 (1.9) | +8.8% | Muster Barrows | -5.3 (1.1) | Under (damage) |
| #23 Ferry Pennies (tank) | **Reshaped:** a Mend under 45%, every monster next to you has its next blow at half | Muster Barrows | 676.2 | +12.3 (2.3) | +3.7% | the tank's others pinned or unsettled | | **In band** (Chill under 20% +0.3 (0.7)) |

Every shape tried on a row that missed (`sum.mjs --batch 2`, the shapes table):

| Shape tried | Held delta (se), 12 seeds | Level XP/h |
|---|---|---|
| #2 Ossuary Helm as written, 3% a monster up to 15% (Muster) | +15.8 (2.1) | +4.5% |
| #2 Ossuary Helm as written (Krell's Hold, where the tank four never falls back) | -6.3 (7.5) | -18.0% |
| #2 Ossuary Helm, 2% a monster up to 10% (Muster) | +10.8 (1.6) | +3.5% |
| #3 Grave Guard's Mail as written, Challenge ready (Muster) | -1.9 (2.3) | -0.8% |
| #3 a shell it cast breaks: that hero Guarded -20% 4 s / -30% 6 s / -30% 8 s (Muster) | +4.3 (1.5) / +7.0 (1.5) / +9.3 (1.6) | +1.2% / +2.3% / +2.9% |
| #3 a shell it cast breaks: Shelter 10 s sooner (Muster) | -1.3 (1.8) | -0.2% |
| #4 Charred Saber as written, a Flame Strike kill: cast again at no cost (Pyre) | +1.5 (2.0) | -0.1% |
| #4 any Flame Strike hit: cast again at no cost (Pyre) | +2.6 (1.7) | +4.1% |
| #4 a Flame Strike cast: Blunted on every monster next to you / on a kill / on its target (Pyre) | +24.3 (2.2) / +0.5 (2.2) / +7.4 (2.2) | +10.1% / +0.5% / +3.2% |
| #7 Floodwater Hatchets, Poison 60% of the cast (Flooded Wing) | -0.6 (2.7) | -0.1% |
| #17 Bargeman's Pole, under half, -20% 4 s (Muster / the Slake) | +14.6 (2.7) / +3.0 (2.3) | +3.9% / +0.7% |
| #17 under half, -15% 4 s / under 40%, -20% 4 s (Muster) | +10.5 (2.4) / +7.3 (2.5) | +2.7% / +2.0% |
| #23 Ferry Pennies as written, under 20%: Chill 3 s / under 40%: Chill 3 s / Chill 6 s within 2 tiles (Muster) | +0.3 (0.7) / +2.0 (2.0) / +5.3 (2.1) | 0.0% / +0.5% / +1.4% |
| #23 under 40%: Blunted next to you / within 2 tiles / Chill and Blunted (Muster) | +6.6 (1.8) / +5.8 (2.6) / +5.5 (1.6) | +1.8% / +1.7% / +1.6% |
| #23 Blunted next to you, under half / under 45% (Muster) | +16.3 (1.4) / +12.3 (2.3) | +5.8% / +3.7% |

**Where a Signature can show at all (read before the 12 seeds, 2 seeds a cell).**

- The tank four sits at the top of Hask's Ford (654.5 of 655 at Level 52, 643.5 at 45), Pyre Field (116.8 of 120) and the Bone Wing (602.9 of 605), and on Krell's Hold it never falls back (it takes 99.7% of the blows, 0 falls an hour, so its held step is a climb still running: the Helm's 12 seeds read -54 to +38). Muster Barrows is the tank's one ground with room over the plain four. A tank Signature buys no held step on the others, so its spread bar holds by construction (COMPUTED from the pin read, not played per row).
- Steady falls back at 25% health. A rule that waits for a hero under 30% or 20% seldom meets one (Ferry Pennies under 20% met its Mend about once an hour: +0.3). On Bold the Slake's four sits at its top (140 of 140), so Bold is no cell either. The low-health lines were raised to where Steady meets them.
- The reference tank holds its pulls without the Challenge: about 9 casts and 13 monsters taunted an hour on Muster. A rule on the taunt has no moment, and one that readies the Challenge gives back a move nobody needed.
- The mage takes 0.1% of the blows on Muster and 12% on Pyre Field, so a rule on its barrier breaking reads only where it is hit.

**What the readings say.**

- **A rule that keeps a hero alive reads; a rule that adds damage does not.** Every shield, Guarded or Blunted read in band or over. Every rule that only adds damage read near 0 or below with Level XP up 1 to 9% (the Hat's reflected blows +0.5 held, XP +8.8%). The held step is the front's health over a pull, and a faster kill of a pull already held buys little of it (the sample's Blade read the same). Held to 10 +- 3, the pool would turn defensive. The damage rows are kept dark as built, their readings here, and the metric is the designer's call (CONFLICTS 2026-11-26, options there). A row was reshaped only where its own move has a defensive form that reads (the Saber's Flame Strike).
- **Mana does not bind on the held step.** The healer on the Slake given 30% of its max mana on every heal it lands (a probe row, 6 seeds, paired against the plain four's first 6 seeds) read -0.7 (se 2.2) held while its four's drink bill fell from 2,587 to 679 coin a hero-hour (`b2p-slake-mana`). Batch 2 writes no mana Signature: #19 Passing Bell and #20 Greened Bracers wait for a cell where mana binds, or for a size bar that reads coin.
- **Two cells sit over the se bar** (the Hatchets' Flooded Wing at 3.1, the Gauntlets' Muster at 3.6): both rows read under on every cell they were played on, so more seeds would not change a verdict. The in-band rows all read at se 2.4 or under. The adopted shapes replay from the tree by their real ids (`batch2.sh`, the `b2v-*` steps).
- **Repetition, audited.** Blunted carries two rows (#4 on a Flame Strike's target, #23 round a Mend under 45%), Guarded two (#3 on a broken shell's hero, #17 on a Greater Mend's low target), Poison two (#7 on Rend, #12 on Raking Shot). Different seats, moves and moments, one status each. The designer judges whether the pool reads as variety.
- **The luck ceiling (V10).** The kit sampler is still owed (04 section 10). COMPUTED bound only: Traits picked for the ground added 12 to 14 own steps (12-targets 8.2, the Muster reading pinned at its top), a Signature at most 13 here, together at most 27 own steps against the gear slice's 20 power steps at about 1.42 own steps a power step (about 28). Inside, but the Trait reading and the Signature readings are on different fours. No row turns on before the sampler reads them together.
- **Rows that changed here** (the designer keeps, re-words or re-shapes each): #2 Ossuary Helm cut to 2% a monster up to 10%; #3 Grave Guard's Mail, #4 Charred Saber, #17 Bargeman's Pole and #23 Ferry Pennies reshaped; #9 Lurcher's Collar re-written; #10 Coal Runner's Bow and #12 Wyvern Barb Crossbow reshaped off the Roads' options before any reading; #1 Bannerman's Pavise dropped.

## Decision: the scale a Signature is sized on (game designer, 2026-11-27, lane/designer-sig-metric)

**How it plays:** a Signature that keeps the front alive lets the party hunt deeper, where every kill pays more. One that adds damage lets it kill faster where it already hunts. Either way the hero levels faster, so that is the one thing measured: Level XP an hour from the held start, the same four on the same seeds with it and without it.

| Call | Ruling |
|---|---|
| The metric | **Pace steps.** The paired change in held pace (Level XP a hunted hero-hour from hour 4 to the four's end, v1-climb's `payX`), divided by the pace one held step buys **on that ground** (since 2026-11-28, "Decision: the pace step, ground by ground": 0.40% on Muster Barrows, 1.06% on Carter's Rest). A shield, a Blunted and a Poison read on one scale |
| The size bar | **10 +- 3 pace steps** on the best cell (on Muster +2.8% to +5.2% held pace), 12 seeds x 8 h, its se at most 3 pace steps. Over 13 is cut in its number, under 7 is raised or reshaped. A reading inside one se of the band with its se over 3 gets more seeds before any number moves |
| The spread bar | Unchanged in kind: the second ground at most half the best, both in pace steps |
| The held delta | Still printed beside it. It says how a row pays (depth or speed), never whether it is in band |
| The conversion | **Ground by ground** since 2026-11-28: `PACE_STEP` in `tools/balance-program/redesign/signature-depth/pace-step.mjs`, measured on every ground with one depth-only lever (below). It replaces the one 0.4335 fit on ten Muster and Pyre rows, which read Carter's Rest at two and a half times its size |
| Coin | Not on the bar. Coin a hero-hour moved with Level XP on every row read (the Hat +8.9% coin, +8.4% pace). A row whose only effect is the supply bill is sized with the market, never on this bar |
| Where batch 3 reads it | Here, and `sum.mjs` (every table prints pace steps and the bars on them). Batch 3's harness copies `batch2.sh` and adds its rows to `sum.mjs` |

**Why pace, not held depth.**

- Held depth is worth what it pays. The Danger scale pays a deeper step more a kill, so a player's reward for depth is pace, the same reward a faster kill gives. The bar now reads the reward, not one of its two roads.
- One scale keeps the pool a choice. On held depth every damage rule read near zero, so the pool would have turned into shields and Blunted, and every build would wear the same few ("Why the whole pool").
- Nothing that read in band moves. Every defensive row reads its held delta within its se on pace (the Helm 10.8 held and 11.7 pace, the Mail 9.3 and 9.4, the Pennies 12.3 and 12.7, the Pole 10.5 and 10.1, the Saber 7.4 and 7.2), since a held step is what the conversion is fit on.
- The luck ceiling is a pace ceiling. A lucky hero is ahead by how much faster it levels. The gear slice's 20 steps is about 8% held pace on Muster Barrows and 21% on Carter's Rest (`19` "Units" says why a held step buys less than the 0.7% a kill pays).

## Batch 2, re-read on pace steps (game designer, 2026-11-27, lane/designer-sig-metric)

MEASURED on `lane/designer-sig-metric` (the hunt engine of `set/v0.2.144` db418d9f0), `signature-depth/batch2.sh` and `sum.mjs --batch 2`, the size bar's cell (12 seeds x 8 h, held from hour 4, Steady, MID kits at the ground's reference Level). The batch-2 reports were re-read from their own files. The current tree replays them exactly (the plain Ox Road four played again: every seed's held step and pace equal), so a new arm pairs with batch 2's plain fours. New steps are `b2m-*`, each the row as it stood when played.

| Signature (seat) | Best cell | Held delta (se) | Pace steps (se) | Second ground | Its pace steps (se) | Verdict | Now |
|---|---|---|---|---|---|---|---|
| #2 Ossuary Helm (tank) | Muster Barrows | +10.8 (1.6) | **+11.7 (2.0)** | the tank's others pinned or unsettled | | In band | Can turn on |
| #3 Grave Guard's Mail (tank) | Muster Barrows | +9.3 (1.6) | **+9.4 (1.6)** | the tank's others pinned or unsettled | | In band | Can turn on |
| #4 Charred Saber (sword) | Pyre Field | +7.4 (2.2) | **+7.2 (2.2)** | Muster Barrows | +3.5 (3.3) | In band, spread holds | Can turn on |
| #5 Pikeman's Gauntlets (sword) | Pyre Field | +0.2 (1.9) | +0.3 (1.9) | Muster Barrows | -4.7 (3.1) | Under | Dark. A reset on a full lane does nothing (`19` section 3: sword lanes run 83% full). Reshaped off resets |
| #7 Floodwater Hatchets (axes) | Flooded Wing | +3.1 (3.1) | +2.7 (3.2) | | | Under (60% read +1.2) | Dark. Reshaped, keeping Poison |
| #9 Lurcher's Collar (bow), **clock 2 s** | Muster Barrows | +0.2 (2.2) | **+9.3 (2.1)** | Pyre Field | +5.8 (1.6) | In band, spread holds within its se | Can turn on. A bow builds Bleed wherever it shoots, so its spread is re-read as more grounds join the scale |
| #10 Coal Runner's Bow (bow) | Ox Road | -3.8 (1.9) | -2.2 (1.6) | | | Under | Dark. Kill-keyed and a reset on a full lane |
| #11 Provost's Longbow (bow) | Pyre Field | -0.1 (2.1) | +1.5 (1.8) | | | Under | Dark. Cooldown cuts on a lane 78% full |
| #12 Wyvern Barb Crossbow (crossbow) | Wyvern Roost | +4.3 (1.8) | +5.8 (1.8) | Pyre Field | +1.4 (1.2) | Under (35% read +2.3 (2.1)) | Dark, at 20%. Reshaped to a crossbow rule of its own |
| #13 Hall Fire Wand (mage) | Krell's Hold | -0.9 (2.1) | +4.1 (2.0) | Muster Barrows | +3.3 (2.1) | Under | Dark. Any raise that reaches the band on Krell's Hold fails the spread: a burst reads alike wherever monsters stand together |
| #15 Catacomb Shroud (mage) | **Krell's Hold** (was the Bone Wing) | -4.3 (2.7) | **+12.7 (2.1)** | Bone Wing | +1.5 (1.7) | In band, spread holds | Can turn on. Its Silence stops Krell's Pyre Priests, kills +6.9%. On held depth it read under |
| #16 Lamplighter's Robe (mage) | Pyre Field | -1.7 (2.5) | -0.3 (2.4) | Muster Barrows | +1.5 (2.5) | Under | Dark. The mage is seldom hit, so its barrier seldom breaks |
| #17 Bargeman's Pole (healer) | Muster Barrows | +10.5 (2.4) | **+10.1 (2.1)** | The Slake (at -20%) | +2.8 (2.2) | In band, spread holds | Can turn on |
| #21 Drover's Hat (healer), **cut to 25%** | Ox Road | -2.3 (1.9) | **+9.2 (2.4)** | Muster Barrows | +4.0 (1.7) | In band, spread holds | Can turn on |
| #23 Ferry Pennies (tank) | Muster Barrows | +12.3 (2.3) | **+12.7 (2.4)** | the tank's others pinned or unsettled | | In band | Can turn on |
| #1 Bannerman's Pavise (tank) | Muster Barrows | -0.2 (2.9) | +0.8 (3.1) | | | Under | Dropped, confirmed |
| #18 Brewer's Apron (healer, the sample), **12 seeds** | Muster Barrows | -1.8 (1.9) | +2.1 (1.9) | | | Under (6 seeds on an older set read +9.9 (3.9)) | Dark. Re-read on Carter's Rest once that ground is on the scale |

Shapes read here:

| Shape | Held delta (se) | Pace steps (se) | Reading |
|---|---|---|---|
| #21 Drover's Hat at 50% (as built), Ox Road | +0.5 (1.9) | +19.6 (1.6) | Over. On held depth it read zero |
| #21 Drover's Hat at 50%, Muster | -5.3 (1.1) | +7.9 (1.2) | |
| #21 Drover's Hat at 25%, Ox Road / Muster | -2.3 (1.9) / -2.5 (1.9) | +9.2 (2.4) / +4.0 (1.7) | In band, spread holds. Built |
| #9 Lurcher's Collar, a Bleed once every 4 s (as built), Muster | -1.2 (2.3) | +4.2 (1.9) | Under |
| #9 Lurcher's Collar, once every 2 s, Muster | +0.2 (2.2) | +9.3 (2.1) | In band. Built |
| #12 Wyvern Barb Crossbow, Poison 35% of the hit, Wyvern Roost | -0.4 (2.1) | +2.3 (2.1) | No gain over 20% (+5.8): Poison is not a number problem |

**The luck ceiling, read on the engine (V10's stand-in).** The kit sampler (`04` section 10: a tool that plays the drops over a hero's hours and returns a kit) does not exist in the harness, so its 10th and 90th percentiles are still owed. In its place, the top of the ceiling on one four: the tank four on Muster with every Trait made for its seat at rank III (`v1-climb --traits lucky`), then those and Ferry Pennies, against the plain four.

| Kit | Held delta (se) | Pace steps (se) | Gear slice (20) |
|---|---|---|---|
| Every tank Trait at rank III | +5.4 (3.0) | +8.2 (3.2) | Inside |
| Those Traits and Ferry Pennies | +16.3 (2.1) | **+18.6 (2.2)** | Inside, one se under 20 |
| Ferry Pennies on top of the Traits | +10.9 (2.1) | +10.3 (2.3) | The Signature keeps its size on a lucky kit |

The lucky four holds 692.7 of Muster's 700, so the ground's top may hold this reading down. It is the luckiest kit there is, past what the 90th percentile asks. No row turns on until the sampler reads the spread, and the first kit it reads is the tank's Pennies or Helm with every Trait, on a ground with room over 700.

## Batch 2's design calls, ruled (game designer, 2026-11-27, lane/designer-sig-metric)

| Call (CONFLICTS 2026-11-26, lane/signatures-batch-2) | Ruling | Why |
|---|---|---|
| #2 Ossuary Helm cut to 2% a monster, up to 10% | **Kept** | 11.7 (2.0) pace steps on Muster, in band. Its `best` now names Muster Barrows, the cell it was read on (the tank four never settles on Krell's Hold) |
| #3 Grave Guard's Mail, a broken shell Guards its hero -30% for 8 s | **Kept, re-worded** "When a shield you cast breaks, that hero takes 30% less damage for 8 s" | 9.4 (1.6). The words now say what the engine reads (below) |
| #4 Charred Saber, Flame Strike's target's next blow at half | **Kept** | 7.2 (2.2) on Pyre Field, Muster 3.5 (3.3), the spread holds. It works with every Flame Strike branch and needs no engine piece. A free Flame Strike on every hit also reads in band on pace (9.5, 1.8), but its piece was taken out of the engine. It is the shape to go back to if two Blunted rows play alike |
| #17 Bargeman's Pole, a Greater Mend under half Guards -15% for 4 s | **Kept** | 10.1 (2.1), the Slake 2.8 (2.2), the spread holds |
| #23 Ferry Pennies, a Mend under 45% Blunts every monster next to you | **Kept** | 12.7 (2.4), in band at its top. Under half read 18.1 (1.3), over |
| #10 Coal Runner's Bow and #12 Wyvern Barb Crossbow off the Roads | **Kept off the Roads** | A move Signature never repeats a branch ("Proposed rules"), and Burning Volley and Bleeding Rake are those branches. Both new rules read under and stay dark (#10 -2.2, #12 5.8) |
| A shell's rows read "a shell the wearer cast", not one move's | **Accepted.** #3 and #21 say "a shield you cast" | The player sees their own shield break, never which move laid it. Shelter and Protective Ward are the only shells today, so nothing changes now. When the Roads add Taunting Guard's and High Tide's shells, they count, as the words promise. A per-move field is a stored world change and an engine re-pin bought for a dark row, with no player gain |
| Blunted on #4 and #23 | **Kept as two** | Different seats, moves and moments: a sword's one target as it strikes, and any hero's neighbors when it is nearly down. One key, one rule a player learns once |
| Guarded on #3 and #17 | **Kept as two** | A tank's broken shell and a healer's save on a low ally. #3 alone fills the key's 30% cap for its 8 s, so a damage-taken Trait worn with it adds nothing then. The cap is doing its job. The luck-ceiling reading wears them together (below) |
| Poison on #7 and #12 | **Changed. Poison stays #7's.** #12 gets a crossbow rule of its own before it turns on. Both stay dark | The same sentence twice with the move swapped is the repetition the audit looks for. Neither reads, at any number: Rend's at 20% 2.7 (3.2) and 60% 1.2 (2.8), Raking Shot's at 20% 5.8 (1.8) and 35% 2.3 (2.1). Poison as an add-on is not a number problem. #7 was written for Poison (the axes' Bleed and Poison tick together), so it keeps the status when it is reshaped. #12's Poison was a stopgap off the Roads |
| A reaction's ticking status reads the hero's top on the scale, as a cast does | **Confirmed** | One status has one size whoever lays it. A Bleed from a Roads option ticking a third of Rend's was a hidden rule nobody could read. The Roads' measuring lane re-reads Barbed Shot, Bleeding Rake, Wide Wounds, Stagger's bleed and Open Wounds |
| #9 Lurcher's Collar re-written for a long fight | **Kept, its clock cut from 4 s to 2 s** | The Mark is single-target, so the Bleed it builds is the long-fight rule batch 2 was asked for. At 4 s it read 4.2 (1.9), at 2 s 9.3 (2.1), a damage rule in band that held depth never saw (+0.2) |
| #21 Drover's Hat, half back on the attacker | **Cut to 25%, re-worded** "Shields you cast return 25% of the damage they absorb to the attacker" | At 50% it read 19.6 (1.6) pace steps on Ox Road, over the band, while held depth read +0.5 and called it under. 25% read 9.2 (2.4) |
| #15 Catacomb Shroud, Hoarfrost Silences 3 s | **Kept, sized on Krell's Hold** | 12.7 (2.1) there, where its Silence stops the Pyre Priests, the Bone Wing 1.5 (1.7). Its home stays the Shrouded Pauper |
| #1 Bannerman's Pavise dropped | **Confirmed** | 0.8 (3.1) pace steps. The Challenge still owes a Signature (CC-5 goes red once Signatures are live). Batch 3 writes it on a moment the tank meets every pull |

**#19 Passing Bell and #20 Greened Bracers: the mana rules are cut, the two move slots stay.**

- **How it plays:** a hero who runs low on mana drinks. Drinks are always in the store, so mana never stops a hunt or slows one down. It costs coin.
- That is why no cell binds. The probe (30% of max mana back on every heal, far past either row) read -0.7 (2.2) held, while the four's drink bill fell from 2,587 to 679 coin a hero-hour. Waiting for a cell where mana binds is waiting forever while drinks are sold.
- A rule whose only effect is the drink bill is a coin piece. Coin pieces are sized with the market (with #25, #40 and #41 in batch 3), never on the size bar. #27, #33, #34 and #37 already carry "fewer drinks", so two more would repeat them.
- Spring Tide and Green Sickness keep a Signature each (CC-5: every live move has one). Batch 3 writes each a new rule that is not mana and not a third Guarded, sized on pace steps. #19 also gets a new name, since the Tower's Gold lock already holds the Passing-Bell Hammer.

**A finding for batch 3: a rule that pays on a kill reads under.** Five kill-keyed shapes were read and none reached the band: the Blade's reset per kill, the Saber's free cast on a kill (2.2) and its Blunted on a kill (1.0), the Coal Runner's Bow (-2.2) and the Hall Fire Wand's burst (4.1). A kill lands as a pull thins. Batch 3's kill-keyed rows (#22, #31, #33) read their moments first (`moments.mjs`), before 12 seeds are spent on them.

## Batch 3, measured (systems, lane/signatures-batch-3, 2026-11-27)

**How it plays:** fifteen more Signatures work in the fight engine for a hero that wears one. Players still see none (`SIGNATURE_RULES.live` false). Each is reaction rows on the shared pieces plus these new general ones, and two rules that are no reaction are read where they act:

| Piece | What it is | First used by | Later rows that can reuse it |
|---|---|---|---|
| A pull begins | a moment when a pack turns on the party (`pull-cycle.js` startPull), the pack its monsters | #42 | any pull-start rule |
| A moment's monsters | a `status` lands on the monsters a moment names (`list`): a pull's pack, the monsters a Challenge took | #42, #1 | |
| A rune family | the moment's move spends a rune of that family (`family`) | #24, #27 | every rune Signature |
| Single target, boss, alone | a swing or a one-enemy move, a boss monster, no other hero of the wearer's side in the world | #43, #38, #22 | |
| Once every N moments | the moments that pass a row's filters, counted on the hero's cooldowns; the row works on each Nth (`every`). A chance with no dice | #31 | any "a 20% chance" row |
| Where it lands | a heal on the moment's hero or the party, mana on the moment's hero as a share of the heal, a boon on the wearer or the party (`to`) | #26, #31, #27, #20, #38 | |
| A rune saved | every Nth cast of a family's spell pays no rune (`saves`, `abilities.js` fire) | #25 | |
| A raised stack cap | the wearer's stacks of a status land past its cap (`stackPlus`, `status.js`) | #29 | |
| Steeped | a status on Kindled's key: the next Greater Mend raised | #20 | |

**The pick: 15 of the 24.** Batch 3 is the reaction rows. The other nine need pieces that are no reaction, so they go to batch 4:

| Left for batch 4 | The piece it needs |
|---|---|
| #34 Sergeant's Sash, #35 Gatekeeper's Plate | a standing aura: monsters within r of the wearer deal less, allies within r regenerate more mana |
| #45 Convoy Bell, #46 Lead Rein | the same standing piece, held while the partner is in the party |
| #32 Ledger Ring, #37 Lychgate Leggings, #44 Pyre Priest's Hood | a cast that costs no mana, or costs health |
| #40 Hearth Mason's Cloak | a remains share on the drop roller (lane/drop-formula's roller, `13` N-9 and N-11) |
| #41 Brood Bracers | a design call first. The reference ranger shoots store arrows bought a shot, so "returns to your quiver" is a refund or a minted arrow (`13` N-14) |

With the support's 8, #8, #30, Parry and Gash, batch 4 is 21, one over a batch. Power Strike has no Signature in the pool, so CC-5 goes red on it once Signatures are live. Undertow is cut in `23` but is still a live move in `abilities.js`.

**Done, verified and assumed, kept apart:** every row's rule is proven in `tests/hunt-core/signature-rules.mjs` (one case a row, each with its mutant: 40 cases, 68 mutants caught) and on the real settle (both paths: the Boots' Chill at a pull's instant, the Tooth's carried overkill, the Ring's echo and the Key's party heal, each settling the same in 10-minute and 100-second windows). The sizes below are MEASURED. The luck ceiling (the V10 kit sampler) is still owed.

MEASURED on `lane/signatures-batch-3` snapshots ff3b87e33 (the plains: the hunt engine of `set/v0.2.144` a70e10fdf) and c2cb4bba2 (the rows), the shapes on a scratch copy of afbf4cb0b with temporary rows (the two shield shapes also with a scratch `shield` doer that lands on the moment's hero or the party; neither shape was kept, so the doer is not in the tree), `tools/balance-program/redesign/signature-depth/batch3.sh` and `sum.mjs --batch 3`: each Signature on its seat's reference company (MID kits at the ground's reference Level, Steady, 12 seeds x 8 h, held from hour 4), paired against the same four with none on the same seeds. The plain fours were played again on this tree first: the re-cut bands moved them (the Muster tank four's first seed held 671 in batch 2 and 672 here, its pace 0.90 and 1.00 of the hours table). engine-parity held with the switch off, before and after merging the set at 669db6867, so the readings stand on the merged tree. Each seed's pace is now read to five places (v1-climb `payX.exact`): batch 2's hundredths moved a paired reading in quanta of about 2.6 pace steps. Shapes tried were temporary ids on a scratch copy, taken out (the `b3v-*` reports).

| Signature (seat) | Best cell | Plain held | Held delta (se) | Pace steps (se) | Coin a hero-hour | Second ground | Its pace steps (se) | Verdict |
|---|---|---|---|---|---|---|---|---|
| #19 Lock-Keeper's Chain (healer) | Muster Barrows | 606.0 | +13.3 (2.7) | **+12.0 (2.7)** | | The Slake | +3.3 (1.7) | **In band, spread holds.** Can turn on |
| #20 Greened Bracers (healer) | Muster Barrows | 606.0 | +8.0 (3.0) | **+7.2 (2.8)** | | The Slake, its home | +5.0 (1.6) | **In band, spread holds within its se.** Can turn on |
| #22 Slake Waders (a lone sword) | The Slake, its home | 52.5 | +5.6 (0.8) | **+7.5 (0.8)** | | Muster Barrows | -0.0 (1.5) | **In band, spread holds.** Can turn on |
| #1 Bannerman's Pavise (tank) | Muster Barrows | 669.3 | -1.8 (2.8) | -1.3 (2.7) | | (the tank's others pinned or unsettled) | | Under. Dark |
| #42 Night Carter's Boots (tank) | Muster Barrows | 669.3 | -1.8 (1.8) | -1.9 (1.8) | | | | Under. Dark |
| #26 Thrower's Ring (healer) | Muster Barrows | 606.0 | +1.4 (2.5) | +1.1 (2.1) | | | | Under (a heal). Dark |
| #31 The Cellar Key (healer) | Muster Barrows | 606.0 | +0.3 (2.0) | +0.0 (1.8) | | | | Under (a heal). Dark |
| #24 Stoker's Ring (mage) | Muster Barrows | 606.0 | +0.2 (2.5) | +0.2 (2.2) | | | | Under (a rare moment). Dark |
| #43 Bull's Tooth (ranger) | Muster Barrows | 606.0 | +0.2 (2.9) | +0.3 (2.5) | | | | Under (a rare moment). Dark |
| #28 Vault Leech Ring (healer) | Muster Barrows | 606.0 | -1.6 (3.7) | -1.3 (3.4) | | | | Under. Dark |
| #38 Drowned Signet (ranger) | Muster Barrows, the Captain's ground | 606.0 | +2.6 (3.5) | +2.6 (3.4) | | | | Under (a boss-fight piece). Dark |
| #29 Fledgling Claw (axes) | Muster Barrows | 608.5 | +0.0 (0.0) | +0.0 (0.0) | | | | No moment: the identical hunt. Dark |
| #25 The Cold Candle (mage), 4 seeds | Muster Barrows | 608.1 | +0.0 (0.0) | +0.0 (0.0) | store -107, all runes | | | A coin piece: the identical fight, the four's store bill 2.3% lower |
| #27 Riverstone Earrings (healer), 4 seeds | Muster Barrows | 608.1 | -3.3 (2.1) | -3.0 (2.1) | store -51 (drink -41) | | | A coin piece: 1.1% off the bill |
| #33 Teamster's Mitts (tank), 4 seeds | Muster Barrows | 673.1 | +0.0 (0.0) | +0.0 (0.0) | 0 | | | No moment: the tank never drinks. Dark |

Shapes tried (each against its row's plain four):

| Shape | Held delta (se) | Pace steps (se) | Reading |
|---|---|---|---|
| #31 every fifth death: a shield of 3% on each hero of the party | +0.5 (2.5) | +0.2 (2.1) | A 3% shell never replaces the healer's bigger Protective Ward |
| #26 a shell you cast breaks: its hero gets a 6% shield | +103.3 (1.8) | **+115.7 (2.6)** | Runs away: the new shell is the wearer's too, so its break sets the rule off again, blow after blow |
| #26 the same, once every 30 s a hero | +1.4 (2.6) | +1.1 (2.2) | Under. The strength was all in the chain |
| #1 a Challenge: the monsters it taunts Weakened (-8%, 8 s) | -0.8 (1.5) | -1.0 (1.5) | Under |
| #42 a pull: its pack Weakened (-8%, 8 s) | -2.3 (1.8) | -2.0 (1.9) | Under. Even the whole pack's blows cut for the pull's first 8 s buys nothing |

**What the readings say.**

- **A save reads, a top-up does not.** The Chain brings Spring Tide back as a hero crosses its near-fall line (12.0). The Bracers raise the next Greater Mend, which the healer casts at the hero under 80% (7.2). The Waders heal a lone hero, which no healer covers (7.5). The Key's party heal (0.0) and the Ring's heal on a broken shell (1.1) land when the healer has the pull covered, so they are overheal. Heal rules behave the way mana did in batch 2: they read where healing binds. Batch 4's #45 inherits this.
- **A shield-on-break rule needs a clock, and the clock is its size.** Unclocked, the Ring's shell renewed itself on every breaking blow (+115.7). At 30 s it read 1.1. "A reaction never sets off another" holds inside one drain, not across blows, so any rule that answers a broken shell with a shell carries a clock.
- **A rare moment reads nothing at any number.** The Stoker's echo is about 0.5% of the mage's damage (its Fire hits seldom find a chilled monster), the Tooth's carried overkill about 1% of the bow's, the Signet's boon about 70 s an hour (Captain Hask dies about 7 times an hour on Muster; the piece is for his own fight, which the harness does not play).
- **No moment, the identical hunt:** the Claw (the axes' Bleed never stands at five on one monster: Rend lays one a cast and a stack lasts 6 s) and the Mitts (the tank's mana never runs low, so it never drinks).
- **The Challenge's room is crowded by its own Roads.** Shield Priest heals on a taunt, Taunting Guard shields on one, Hard Challenge and Braced Call cut what the tank takes. Armor Break on the taunted is damage on monsters already held (-1.3), and Weakened on them read -1.0. A Challenge Signature that reads has to pay at the tank's danger moment, the way Ferry Pennies does (a Mend under 45%, 12.7 in batch 2), and none of the Challenge's own moments is that.
- **The pull's start is not the tank's danger.** A 3 s Chill is spent while the pack walks in (-1.9), and the whole pack Weakened for the pull's first 8 s read -2.0. The tank rows that read in batch 2 pay on a moment of the fight itself (its shell breaking, its Frost Slam landing, its Mend under 45%), never on the pull's start. The Boots stay as written, dark, for the designer. (A Chill of 8 s on the pull and on the taunted were queued and not played: the Weakened readings answered them.)
- **Coin pieces have no bar yet.** The Candle's fight is identical and its four's store bill is 107 coin a hero-hour lower (2.3%), the Riverstone's 51 (1.1%). 15 sizes coin pieces with the market, which has no number yet.
- **Repetition, audited.** Armor Break is new to Signatures (#1). Chill gains a pull-start source (#42). Emboldened carries #18 and #38, "a hero's next cast raised" #16 (Kindled) and #20 (Steeped), the shell's break #3 (Guarded) and #26 (a heal). Different seats, moves and moments, one status a key.
- **The luck ceiling (V10)** is still owed. No batch-3 row turns on before the kit sampler reads it with its seat's Traits.

## Batch 3's under rows, ruled (game designer, 2026-11-28, lane/designer-sig-batch4)

**How it plays:** every Signature a player finds does something they can feel in the hunt they are in. A tank's piece steadies the whole line when it calls the pack, a healer's piece catches an ally who is about to drop, a frost mage's piece makes the next Fireball hit like a truck. A coin piece makes the hunt cheaper, by about as much as a fight piece makes it better.

MEASURED on `lane/designer-sig-batch4` (the hunt engine of `set/v0.2.144` 05b11e0db, unchanged by the merge of 49df7ba29: no hunt file moved), batch 3's cell exactly (`signature-depth/batch4.sh`, `sum.mjs --batch 4`: MID kits at the ground's reference Level, Steady, 12 seeds x 8 h, held from hour 4, paired on the same seeds against batch 3's plain fours, which this tree replays exactly: the Muster mixed and tank fours' first seed held 601 and 672, pace 0.84442 and 1.0005, both equal). Shapes were temporary ids on a scratch copy of the tree (`b4v-*`). One shape needed a filter the engine lacks (`selfBelowPm`, the wearer's own health at any moment), played on the scratch copy only.

### The rules this batch sets

| Call | Ruling | Why (MEASURED) |
|---|---|---|
| **A. How a heal Signature is judged** | On its seat's reference four, like every row, on pace steps. A heal row is written as a **save**: it lands on a hero already in danger (under a line, near fall-back, a shell just broken). A heal that tops up a pull the healer already covers is reshaped, never moved to a cell with no healer to make it read. Only an Alone rule is sized where no healer is (#22) | The Key's party heal read 0.0 and its every-fifth-death shield 0.2. The same piece healing an ally hit under 40% reads 7.7 (1.6). The Ring's heal on a broken shell read 1.1 |
| **B. A shield that answers a broken shield** | Every rule whose moment is a broken shell and whose effect lays a shell (a shield, or a shell move made ready) carries a clock, `clockMs`, one a hero. The clock bounds the chain. It is not the size lever: size it by its strength | Unclocked, the Ring's 6% shell renewed itself on every breaking blow (+115.7). Protective Ward made ready on a break read 5.5 at a 10 s clock and 4.1 at 6 s: the wards break further apart than either clock, so the clock moved nothing |
| **C. The coin bar** | A coin piece (its only effect is the supply bill) is sized in **coin steps**: the store bill it saves its wearer a hunted hour (the four's mean x 4, all of it the wearer's own), over the reference four's net coin a hero-hour (coin and loot at the store's price, less the bill), in 0.43% steps. **Band 20 +- 6** on its seat's reference cell. 4 seeds read it when the fight is the same both arms (a saving draws no dice). No spread bar | A fight Signature in band pays its wearer pace and coin together: the Chain 12.0 pace and 9.9 coin steps, the Hat 9.2 and 16.9. A coin piece pays coin alone, so it needs about both to be a real pick. At 10 it would lose to every fight piece for every player |
| **D. A boss Signature** | Sized on its boss's own fight, the boss call, never on a ground where the boss is one monster in thirty. Dark until the harness plays that fight | Captain Hask dies about 7 times an hour on Muster, so the Signet's boon ran about 70 s an hour there (2.6) |
| **E. A tank Signature** | Pays at the tank's danger: its health low, its shell breaking, or the party under the pack's full weight as the tank calls it. Never at the pull's start | Five pull-start shapes read -2.9 to +0.8 (below). The tank rows in band all pay inside the fight |

### The rows

| # | Signature | The rule now | Best cell | Held delta (se) | Pace or coin steps (se) | Second ground | Its pace steps (se) | Verdict | Now |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Bannerman's Pavise (tank) | **Reshaped:** Challenge: your party takes 12.5% less damage for 3 s | Muster Barrows | +9.5 (3.1) | **+9.3 (3.1)** | (the tank's others pinned) | | In band, its se one tenth over the bar: 24 seeds owed before it turns on | Data set |
| 42 | Night Carter's Boots (any, read on the healer) | **Reshaped:** when a monster hits an ally below 45% health, its next blow lands at half | Muster Barrows | +12.3 (2.6) | **+10.9 (2.5)** | Pyre Field | +12.0 (3.6) | In band, **fails the spread bar** (a save on every ground is a stat) | Data set as read. Batch 4 adds a stalker filter (P9) and re-reads both |
| 26 | Thrower's Ring (healer) | **Cut, replaced:** when a shield you cast breaks, the monster that broke it has its next blow at half | | | | | | Batch 4 (a shell's breaker, below) | Dark, as built |
| 31 | The Cellar Key (healer) | **Reshaped:** when a monster hits an ally below 30% health, that ally heals 2% of max health (once every 30 s for each ally) | **Carter's Rest, its home** | +6.4 (4.0) | **+16.2 (8.3)** | Muster Barrows (at 40% and 8%: 7.7 (1.6)) | | Inside one se of the band, se 8.3: 36 seeds on Carter's Rest owed before it turns on. Carter's read every heal shape at se 7 to 10 | Data set |
| 24 | Stoker's Ring (mage) | **Reshaped:** Ice rune spells make your next Fire rune spell deal 45% more damage (Stoked, Kindled's key) | **Pyre Field, its home** | +2.6 (2.7) | **+12.5 (5.1)** | Muster Barrows | +6.1 (2.4) | In band, the spread holds. Pyre's se 5.1: 24 seeds owed before it turns on | Data set |
| 43 | Bull's Tooth (ranger) | **Reshaped:** single-target hits on a monster below 30% health deal double damage | Wyvern Roost, its home | +1.7 (1.4) | **+9.7 (1.4)** | Muster Barrows | +9.2 (2.3) | In band, **fails the spread bar** (a finisher on every monster is a stat) | Data set as read. Batch 4 adds a brute filter (P9) and re-reads both |
| 28 | Vault Leech Ring (healer) | **Cut, replaced:** Poison rune spells also Sicken the monster attacking the ally lowest on health | | | | | | Batch 4 (P6, a monster picked by its target) | Dark, as built |
| 38 | Drowned Signet (ranger) | Kept as written | Captain Hask's fight | | | | | Rule D: owed the boss cell | Dark |
| 29 | Fledgling Claw (axes) | Kept as written | Muster Barrows | +0.0 (0.0) | +0.0 (0.0) | | | No moment until Gash lays Bleed beside Rend | Dark, re-read with Gash (batch 5) |
| 33 | Teamster's Mitts | **Cut, re-homed as Power Strike's Signature:** Power Strike on a monster attacking an ally: it turns on you for 4 s | | | | | | Batch 4 (a one-monster taunt) | Dark, as built |
| 25 | The Cold Candle (mage, coin) | **Reshaped:** your Ice rune spells use no runes | Muster Barrows, 4 seeds | 0.0 (0.0) | **25.7 coin steps** | | | In band (coin bar) | Data set |
| 27 | Riverstone Earrings (healer, coin) | **Reshaped:** Water rune heals give you back 0.5% of your max mana | Muster Barrows, 4 seeds | -3.3 (2.1) | **23.7 coin steps** | | | In band (coin bar) | Data set |

Every shape read (`sum.mjs --batch 4` prints both tables; a kept row reads from its shape's report, and `REPLAY=1 batch4.sh` plays each kept row's first two seeds by its real id):

| Shape | Held delta (se) | Pace steps (se) | Coin steps | Reading |
|---|---|---|---|---|
| #1 a Challenge: the monsters it taunts Blunted | -0.6 (2.0) | -0.5 (1.9) | | Under. Batch 3's Armor Break (-1.3) and Weakened (-1.0) the same |
| #1 a Challenge: Mend is ready again | +1.0 (1.9) | +0.3 (1.8) | | Under |
| #1 a Challenge below half health: the taunted Chilled 6 s / Blunted (scratch filter) | -2.8 (2.5) / +2.7 (1.8) | -2.9 (2.4) / +2.1 (1.8) | | Under |
| #1 a Challenge: your party takes 10% less for 4 s / 3 s | +5.7 (1.5) / +6.1 (2.9) | +4.8 (1.5) / +5.2 (2.9) | | Under |
| #1 the party 11% less for 4 s | +6.5 (2.2) | +5.9 (2.1) | | Under |
| #1 **the party 12.5% less for 3 s** | +9.5 (3.1) | **+9.3 (3.1)** | | **In band. Set** |
| #1 the party 12.5% less for 4 s / 15% less for 4 s | +14.3 (2.3) / +17.8 (2.7) | +14.2 (2.3) / +17.6 (3.4) | | Over |
| #42 a pull: a shield of 2% for each monster in it (up to 10%) | +0.8 (2.1) | +0.8 (2.0) | | Under |
| #42 a pull: you take 30% less for 6 s | -2.6 (2.0) | -2.9 (2.2) | | Under |
| #42 under 45%: monsters within 2 tiles Chilled 8 s (10 s clock) | +4.6 (1.6) | +3.6 (1.9) | | Under |
| #42 on the bow: a monster next to you that hits you is Chilled 4 s / 8 s | -2.4 (2.8) / -2.0 (2.3) | -2.1 (2.4) / -1.9 (1.8) | | Under |
| #42 on the healer: a monster that hits an ally under half has its next blow at half | +18.6 (3.0) | +17.5 (3.2) | | Over |
| #42 **the same under 45%** | +12.3 (2.6) | **+10.9 (2.5)** | | **In band. Set** |
| #42 the same under 40% / 35% / 30% | +3.5 (3.8) / -0.7 (3.1) / -0.7 (1.5) | +3.1 (3.4) / -0.4 (2.6) / -0.8 (1.3) | | Under: the line is the lever, and Steady falls back at 25% |
| #42 the same under half, once every 5 s an ally | -1.2 (2.7) | -1.0 (2.5) | | Under: the size is in Blunting every blow at a low hero |
| #26 a shell you cast breaks: Protective Ward ready again, 10 s / 6 s clock | +5.8 (3.0) / +5.3 (2.8) | +5.5 (2.8) / +4.1 (2.6) | | Under |
| #31 an ally hit under 35%: it heals 6% (8 s an ally), Muster | +6.0 (3.5) | +5.7 (3.1) | | Under |
| #31 an ally hit under 40%: it heals 8% (8 s an ally), Muster / Carter's Rest | +8.7 (1.8) / +32.3 (2.8) | +7.7 (1.6) / +84.2 (7.1) | | In band on Muster, far over at home |
| #31 under 30%: 4% (10 s) / 3% (15 s), Carter's Rest | +14.7 (3.7) / +13.3 (4.2) | +32.6 (8.7) / +32.8 (9.6) | | Over |
| #31 **under 30%: 2% (30 s an ally)**, Carter's Rest | +6.4 (4.0) | **+16.2 (8.3)** | | **Inside one se of the band. Set, 36 seeds owed.** A 60 s clock for the whole party read the identical hunt |
| #24 Ice rune spells: the next Fire rune spell +30%, Muster | -0.8 (2.9) | +4.3 (2.5) | | Under |
| #24 +60%, Muster / Pyre Field | -0.7 (1.5) / +2.7 (1.8) | +8.6 (1.4) / +15.6 (3.0) | | Over at home |
| #24 **+45%, Pyre Field / Muster** | +2.6 (2.7) / -1.3 (2.6) | **+12.5 (5.1)** / +6.1 (2.4) | | **In band, the spread holds. Set** |
| #43 single-target hits on a monster under 30%: +50%, Muster | +0.4 (2.7) | +5.4 (2.8) | | Under |
| #42 the same under 45%, Pyre Field | +9.3 (2.8) | +12.0 (3.6) | | In band: with Muster's 10.9, **fails the spread bar** |
| #43 **double, Muster / Wyvern Roost** | -1.0 (2.6) / +1.7 (1.4) | **+9.2 (2.3) / +9.7 (1.4)** | | In band on both: **fails the spread bar** |
| #29 Rupture rune spells lay a second Bleed stack | +0.8 (2.4) | +4.4 (2.2) | | Under |
| #25 every other Ice rune spell uses no rune / as built, every third | 0.0 | 0.0 | 12.9 / 8.6 | Under |
| #25 **every Ice rune spell uses no rune** | 0.0 | 0.0 | **25.7** | **In band (coin bar). Set** |
| #27 as built: 10% of the heal as mana to the hero healed | -3.3 (2.1) | -3.0 (2.1) | 4.1 | Under: the mana landed on the tank, who never drinks |
| #27 a Water heal gives you 2% / 4% / 0.3% of your max mana | | | 88.3 / 111.1 / 12.8 | Over, over, under |
| #27 **0.5%** | -3.3 (2.1) | -3.0 (2.1) | **23.7** | **In band (coin bar). Set**. The fight's -3.0 is 4 seeds' noise, the as-built row's to the tenth |
| #33 the Mitts on the hammer / on the mage (4 seeds) | 0.0 | 0.0 | 0.0 / 6.2 | No melee seat drinks. Under on the mage |

**What the readings say.**

- **The danger moment is the size, again.** Every row in band pays when a hero is about to drop or the whole pack is on the party: an ally hit under 45% (the Boots), the line braced each time the tank calls (the Pavise), a monster finished under 30% (the Tooth: the threat dies sooner). Every shape that paid at the pull's start, on a taunt's own monsters, or once a slow clock read under.
- **The line is a cliff.** The Boots read 17.5 under half, 10.9 under 45%, 3.1 under 40% and nothing under 35%. Steady falls back at 25%, so a line close to it meets almost no blow. The Pavise's Guarded read 4.8 at 10% and 14.2 at 12.5% for 4 s. A rule that reads moves fast near its edge, so each one is set on its own measured point, never interpolated.
- **Carter's Rest reads every heal at five times the size and a third of the certainty.** The Key's 8% heal read 7.7 on Muster and 84.2 at home, with se 7 to 10 on every Carter's shape. Its four falls back 1.6 times an hour and a held step there buys about 0.95% pace, twice the 0.43% fit. The Key is set on its home (rule A puts a heal on its seat's best cell) and waits for 36 seeds there. **For the Lab:** `PACE_STEP_PCT` is fit on Muster-like cells, and Carter's narrow band (0 / 60 / 100) pays a held step about twice as much. Re-fit it per ground or read Carter's in held steps before the Apron (#18) is re-read there. (Ruled 2026-11-28, "Decision: the pace step, ground by ground": Carter's Rest 1.056, the Key 5.7 on 36 seeds.)
- **A save is big everywhere.** The Boots read 10.9 on Muster and 12.0 on Pyre Field, the Tooth 9.2 and 9.7. Danger comes on every ground, so a save with no filter is a stat by the spread bar. Each gets a monster-role filter in batch 4 (stalkers for the Boots, brutes for the Tooth), so it is big where its monsters are. The Pavise has no second cell (the tank's others are pinned) and the Key's home is the only cell where it reads.
- **Damage reads on pace when it is big and lands often.** The Stoker's Ring at +45% on the next Fire spell read 12.5 on Pyre Field and 6.1 on Muster with held depth flat: the frost mage kills faster where packs stand together.
- **Mana is coin, and the drink bill is big.** The healer's drinks are about 1,100 coin a hero-hour of the four's 1,773. 2% of max mana a Water heal erased nearly all of it (88.3 coin steps), 0.5% is in band.
- **Repetition, audited.** Blunted carries #4, #23, #42 and #26's new rule: a sword's target as it strikes, a tank's neighbors on a low Mend, the striker of a low ally, a broken shell's breaker. Guarded carries #3, #17 and #1 (the party, as the tank calls). "A hero's next cast raised" carries #16, #20 and #24 (Kindled, Steeped, Stoked: a broken barrier, a Green Sickness, an Ice spell). "An ally hit under a line" carries the Boots and the Key (Blunt the striker, heal the ally): one moment, two effects, a hero wears one. The low-health family (the Belt, the Pennies, the Pole, the Chain, the Key, the Boots) is six rows on six slots. That is what reads in this engine, so the pool keeps it and varies the seat and the effect. The Leech's new rule (#28) was moved off it for that reason.
- **Proposed rules** (below) gain one line: a Signature that answers a broken shield with a shield works once a clock.

### The Challenge, Power Strike and the coverage rule (CC-5)

- **The Challenge's Signature is #1's reshape, and it covers the one #1 owed.** "Challenge: your party takes 12.5% less damage for 3 s" reads 9.3 (3.1). It pays on the tank's own moment, every Challenge, because the call is when the pack's full weight lands. The Challenge's waystone Braced Call is the tank's own -2% for 4 s. The Pavise is the whole party's, six times as big and a second shorter, on the Guarded key (held to 30% with every other cut). A move Signature never repeats a branch, and no Challenge option guards the party.
- **Power Strike's Signature is the Teamster's Mitts.** The Mitts' mana rule had no moment on any melee seat (the tank and the hammer played the identical hunt), so the piece takes the move that had none: "Power Strike on a monster attacking an ally: it turns on you for 4 s". A sword or a club pulls a monster off the back row. No Power Strike branch taunts (Heavy, Cheap and Guard Strike, Driving and Breaking Strike, Rallying Strike), so it repeats none. Home and slot stay (Ox Road, the Dead Teamster, gloves). Measured when batch 4 builds its piece.
- **Undertow** is cut in `23` and still live in `abilities.js`. Its Signature was #22, now the Alone rule. CC-5 should drop Undertow from the moves that owe one, or the move goes dark. That is Systems' (HANDOFFS).

### Batch 4: what is left, and the pieces it needs

**How it plays:** auras you stand in, two pieces that work together, spells that cost health, a shot that saves its arrow, a taunt from a striker, a finisher for big monsters, and one top-chase cloak that keeps a friend alive.

| Row | The rule (as it is built) | Engine piece | Kind and bar | The designer's call |
|---|---|---|---|---|
| #26 Thrower's Ring | When a shield you cast breaks, the monster that broke it has its next blow at half | P5: a broken shell's breaker | Fight, pace | Cut and replaced (the ward made ready read 5.5). The shell's break is the danger moment the Mail reads on (9.4) |
| #28 Vault Leech Ring | Poison rune spells also Sicken the monster attacking the ally lowest on health | P6: a monster picked by its target | Fight, pace | Cut and replaced. The Sickness lands where the danger is, so the party kills the threat first. Off the "ally hit under a line" moment the Boots and the Key share |
| #33 Teamster's Mitts | Power Strike on a monster attacking an ally: it turns on you for 4 s | P4: a one-monster taunt | Fight, pace | Power Strike's Signature (above) |
| #43 Bull's Tooth | Single-target hits on a brute below 30% health deal double damage | P9: a monster-role filter | Fight, pace | Its data row is set without the filter (in band on both cells, the spread fails). The filter makes it a big-monster piece |
| #42 Night Carter's Boots | When a stalker hits an ally below 45% health, its next blow lands at half | P9 | Fight, pace | The same: in band on Muster (10.9) and Pyre Field (12.0), so the spread fails. Stalkers are the monsters that go for the weak, the Night Carter's own kind |
| #34 Sergeant's Sash | Party aura: allies within 8 tiles regenerate 20% more mana | P1: an aura a Signature wears | Coin bar | As written. Fewer drinks for the whole party |
| #35 Gatekeeper's Plate | Aura: you and allies within 2 tiles take 8% less damage | P1 | Fight, pace | Re-worded from "monsters within 2 tiles deal 8% less", the same on the blows that matter, on the aura ledger the support's fires use. A standing cut reads small (Weakened -8% on the pack read -2.0). If it reads under, it becomes "while you're below half health" (P1's `belowPm`) |
| #45 Convoy Bell | With Lead Rein in your party: your heals on its wearer heal 30% more while it is below half health | P1, its partner check | Fight, pace | Reshaped by rule A: "+25% healing on its wearer" is a top-up |
| #46 Lead Rein | With Convoy Bell in your party: below half health, you take 7.5% less damage | P1, its partner check | Fight, pace | Reshaped by rule E: a standing -10% is a cut the healer already covers |
| #32 Ledger Ring | Every fifth spell you cast costs no mana | P2: a cast's cost | Coin bar | Reshaped: spells don't crit, so "on crit" had no moment. A ledger counts |
| #37 Lychgate Leggings | Below 30% mana: your heals cost no mana for 5 s (90 s cooldown) | P2 | Coin bar | As written |
| #44 Pyre Priest's Hood | Above 70% health: your spells cost health instead of mana (1 health a mana) | P2 | Coin bar, and pace (it costs health) | As written. The Lab reads it with Full Wick |
| #41 Brood Bracers | Every fifth arrow that hits costs no arrow | P3: a saved shot | Coin bar | **Ruled: a refund, never a mint.** The shot takes no arrow from the bag and buys none, the Candle's `saves` on ammo. No arrow is ever made. COMPUTED 20.6 coin steps on Muster (the bow's arrows are the four's biggest line, 1,586 coin a hero-hour, and 81% of shots land). It reads like "25% chance to return to your quiver", with no dice and no mint |
| #40 Hearth Mason's Cloak | **Cut, replaced:** once an hour, a hero of your party who would die falls back instead | P7: a fall-back save | Fight, on Bold (pace and deaths) | Cut: +10% remains of the wearer's own kills is 0.6 coin steps (Muster's common band, 281 a hero-hour, COMPUTED). To reach the bar it would mint about 4.5 times its remains, and remains feed the flame, so a remains piece big enough to pick is a luck engine. The Platinum lock's chase is now the one piece that lets a party push Bold |

**Rows: 14, one batch.** The support's 8, #8, #30, Parry, Gash and #29's re-read wait on their moves as **batch 5** (13 rows). Neither batch passes 20.

The pieces (each once, for all its rows; HANDOFFS 2026-11-28 designer-sig-batch4):

| Piece | What it is | Rows |
|---|---|---|
| P1 An aura a Signature wears | A worn Signature with `aura` is worn like a slotted aura move (`src/core/hunt/auras.js`): ledger rows for allies within `r`, one a key a party. `with`: only while a living hero of the party wears that Signature. `belowPm`: only on a hero under that line. A mana-regen channel for #34 | #34, #35, #45, #46 |
| P2 A cast's cost | A Signature `costs` row read where `fire` pays (beside `saves`): none, or health for mana (never under 1 HP, never a kill), on spells or heals, with `aboveHpPm`, `belowManaPm`, `ms`, `clockMs`, `every` | #32, #37, #44 |
| P3 A saved shot | `saves` on ammo: every `every`-th shot that lands takes and buys no arrow, the count on the cooldowns | #41 |
| P4 A one-monster taunt | `do: 'taunt'`: the moment's monster, if it is attacking another hero, turns on the wearer for `ms` | #33 |
| P5 A broken shell's breaker | `shield_break` carries the breaking blow's source, so a `status` lands on it | #26 |
| P6 A monster picked by its target | a `status` doer's `on: 'lowest'`: the monster attacking the living ally with the lowest share of health | #28 |
| P7 A fall-back save | A blow that would kill a hero of the wearer's party leaves it at 1 HP and starts its fall-back instead, once a clock on the wearer | #40 |
| P8 The boss cell (tools) | `v1-climb` plays a boss's own fight, so a boss row reads where it acts | #38 |
| P9 A monster-role filter | `role`: the moment's monster has that role (`monster-roles.js`) | #42, #43 |

### The Security list (`13` N-14)

#25 now saves every Ice rune spell (a bigger discount, nothing minted). #27 gives its wearer mana (no money). #40 leaves the list: it no longer touches drops. #41 is ruled a saved shot, never a minted arrow. #32, #34, #37 and #44 cut the drink bill (no money moves). P7 moves Level XP lost to deaths, not money. N-14 says so.

## Decision: the pace step, ground by ground (game designer, 2026-11-28, lane/pace-step-per-ground)

**How it plays:** a Signature is worth about half a gear tier wherever its home is. A step of depth pays far more Level XP on some grounds than on others (Carter's Rest pays about two and a half times what Muster Barrows does). Read on one ruler, a heal there looked huge and every heal looked like noise. Now each ground has its own ruler, measured the same way on every one.

| Call | Ruling |
|---|---|
| The scale | A Signature's paired pace delta over **its cell's own pace step**: the pace one held step buys on that ground (`tools/balance-program/redesign/signature-depth/pace-step.mjs` `PACE_STEP`, read by `sum.mjs` and `roads/e5/sum.mjs`). The bars (size 10 +- 3, spread at most half, coin 20 +- 6) are unchanged and read in these steps |
| How it is measured | One lever that moves depth and nothing else: every blow at every hero 10 and 20 power steps lower (`pace-step/defense-k10.json`, `defense-k20.json`, a line edit on a scratch copy, so the companies are the tree's). On the ground's reference four (MID kits at its refLevel, Steady, 8 h, held from hour 4), 24 seeds paired on the same dice. The pace moves over the held moves of both sizes, a fit through the origin (`pace-step/run.sh`, then `pace-step.mjs`) |
| The key | One value a ground for a party of four. A lone hero has its own (`<ground>:1`): it can sit far from the band the reference four was cut on |
| A cell paid at the floor | A four held under its band's floor earns the floor pay (`danger.js` `PAY.floor`), so a deeper step there pays nothing and meets a tougher monster: a held step costs pace (a lone sword on Muster Barrows holds 367 under a floor of 520 and reads -0.29%). No Signature is sized on one. As a second ground it reads in its best cell's steps, so the spread bar compares pace itself |
| An unmeasured ground | No Signature cell. `sum.mjs` stops and names it until `pace-step/run.sh` measures it |
| A lever | Re-measure when `PAY`, `powerStep`, `CLIMB` or `RISKS`, or a ground's band moves. `pace-step.mjs --check` holds the table to its reports |

MEASURED on `lane/pace-step-per-ground` (the hunt engine of `set/v0.2.144` d501d3754; the plain fours replay batch 3's `b3-*` reports seed for seed), `pace-step.mjs`:

| Ground | Four the value is fit on | Plain held | Falls/h plain, -10, -20 | Held move (se), both sizes | Pace move (se) | **Pace a held step buys (se)** |
|---|---|---|---|---|---|---|
| Muster Barrows | hammer, bow, mage, healer | 606 | 0.7, 0.6, 0.6 | +15.2 (1.5) | +6.1% (0.6) | **0.398% (0.007)** |
| Muster Barrows, the tank four (a check) | tank, bow, mage, healer | 668 | 1.6, 1.4, 1.2 | +15.8 (1.6) | +6.4% (0.7) | 0.407% (0.009) |
| Muster Barrows, alone | a lone sword | 367 | 0 | +7.6 (0.9) | -2.2% (0.3) | **none: paid at the floor** (-0.288) |
| Hask's Ford | hammer, bow, mage, healer | 600 | 0.1 | +10.5 (1.2) | +4.2% (0.5) | **0.397% (0.005)** |
| The Slake | hammer, bow, mage, healer | 101 | 0.4, 0.4, 0.5 | +11.9 (1.1) | +4.9% (0.4) | **0.415% (0.007)** |
| The Slake, alone | a lone sword | 53 | 0 | +7.9 (0.5) | +3.4% (0.2) | **0.427% (0.007)** |
| Pyre Field | hammer, bow, mage, healer | 51 | 0.8, 0.7, 0.6 | +15.4 (1.5) | +7.5% (0.9) | **0.487% (0.020)** |
| Pyre Field, the sword four (a check) | sword, bow, mage, healer | 45 | 0.7, 0.7, 0.6 | +17.3 (1.4) | +11.0% (1.1) | 0.634% (0.031) |
| Krell's Hold | hammer, bow, mage, healer | 42 | 0.7, 0.6, 0.6 | +13.1 (1.7) | +8.0% (1.2) | **0.610% (0.036)** |
| Carter's Rest | hammer, bow, mage, healer | 66 | 1.7, 1.4, 0.8 | +19.9 (2.1) | +21.0% (2.1) | **1.056% (0.020)** |
| Ox Road | hammer, bow, mage, healer | 96 | 1.0, 0.8, 0.8 | +12.1 (1.0) | +4.2% (0.4) | **0.346% (0.006)** |
| Wyvern Roost | hammer, crossbow, mage, healer | 107 | 1.4, 1.1, 1.1 | +13.0 (0.9) | +5.6% (0.4) | **0.429% (0.004)** |
| The Bone Wing | hammer, bow, mage, healer | 505 | 1.1, 1.3, 1.1 | +9.7 (0.9) | +4.4% (0.5) | **0.453% (0.015)** |
| The Flooded Wing | axes, bow, mage, healer | 476 | 1.8, 1.7, 1.8 | +5.3 (0.8) | +4.7% (0.9) | **0.874% (0.087)** |

**Why ground by ground.**

- **The grounds differ, and nothing cheaper predicts it.** 0.35% to 1.06%. Pyre Field and Krell's Hold share gear tier 4 and read 0.49 and 0.61. The two Catacomb wings share tier 8 and read 0.45 and 0.87. Falls an hour do not predict it either (Muster's tank four falls 1.6 an hour and reads 0.41). A per-band value would carry the very error this removes, so each ground is measured.
- **Not raw pace.** A Signature is half a gear tier of power ("Decision: count and size"). On Carter's Rest every power step buys two and a half times the pace, gear and Traits included. Sized in raw pace, a Carter's Signature would get 40% of the power a Muster one gets.
- **The four barely moves it.** Muster's mixed and tank fours read 0.398 and 0.407, so one value serves every four on a ground. Pyre Field's sword four reads 0.634 to its mixed four's 0.487. Its rows read on the ground's value, the kinder of the two (the Saber reads 6.4 there and 4.9 on its own four), and both are under the band, so the choice changes no verdict.
- **It matches the Signatures themselves.** Each kept row's own pace over its held move (the rows that move depth) sits near its ground's lever: the Pole 0.41 and the Boots 0.38 on Muster's mixed four (0.398), the Key's four shapes and its 36 seeds 0.96 to 1.12 on Carter's Rest (1.056), the Boots 0.55 on Pyre Field (0.487), the Pole 0.40 on the Slake (0.415). Rows that guard one seat scatter more: the tank rows on Muster read 0.39 to 0.48 (0.407), the Saber's two Blunted shapes 0.42 on Pyre's sword four (0.634). That scatter is inside the bar's +- 3.
- **Muster moves too.** Measured the same way it reads 0.398, not the 0.4335 fit on ten rows. Every Muster reading rises 8%. Keeping 0.43 for Muster alone would be two methods on one scale.
- **For the Lab:** the Lab (`tools/balance-lab/`) reads no pace step. Only the sum tools do, so the value lives in tools, beside them. The game never reads it.

### The rows re-read (MEASURED, `sum.mjs --batch 2`, `--batch 3`, `--batch 4`)

The Cellar Key got its 36 seeds at home and Brewer's Apron its first reading there (`batch4.sh` `b4-carters-*36`, by their real ids; the plain four's first 12 seeds replay `b3-carters-mixed` exactly). Every other row is its own report read again on the new steps. Every row whose verdict moved is here.

| # | Signature | Best cell | Was (0.43) | Now (se) | Second ground: was, now | Verdict now |
|---|---|---|---|---|---|---|
| 31 | The Cellar Key (an ally hit under 30% heals 2%, 30 s an ally) | Carter's Rest, **36 seeds** | +16.2 (8.3), 12 seeds | **+5.7 (2.0)** | | **Under.** The old ruler alone read it 2.5 times too big. Dark. On the new steps its shapes read 4% at 10 s 13.3 (3.5) and 3% at 15 s 13.4 (3.9), so its number sits between 2% at 30 s and those |
| 18 | Brewer's Apron (Circle of Renewal, Emboldened 4 s) | Carter's Rest, its first reading, **36 seeds** | | **+2.8 (1.6)** | Muster +2.1 (1.9), now +2.3 (2.0) | **Under at home too.** Dark. It reads under on both cells it was played on, its home included, so its boon is reshaped in the next batch |
| 22 | Slake Waders (a lone sword) | The Slake, alone | +7.5 (0.8) | **+7.5 (0.8)** | Muster -0.0 (1.5), now -0.0 (1.5) in the Slake's steps (Muster's lone sword is paid at the floor) | **In band, the spread holds.** Unchanged |
| 42 | Night Carter's Boots (an ally hit under 45%, its striker Blunted) | Muster Barrows | +10.9 (2.5) | **+11.8 (2.7)** | Pyre +12.0 (3.6), now +10.6 (3.2) | **In band, fails the spread.** Unchanged. P9's stalker filter still owed |
| 43 | Bull's Tooth (single-target hits under 30% land twice) | Wyvern Roost | +9.7 (1.4) | **+9.7 (1.4)** | Muster +9.2 (2.3), now +9.9 (2.5) | **In band, fails the spread.** Unchanged. P9's brute filter still owed |
| 24 | Stoker's Ring (+45%) | Pyre Field | +12.5 (5.1) | **+11.0 (4.5)** | Muster +6.1 (2.4), now +6.6 (2.6) | In band, the spread holds within its se. 24 seeds still owed |
| 4 | Charred Saber (Flame Strike's target's next blow at half) | Pyre Field | +7.2 (2.2) | **+6.4 (1.9)** | Muster +3.5 (3.3), now +3.7 (3.6) | **Under (moved).** Dark. Raise its number |
| 23 | Ferry Pennies (a Mend under 45%, Blunted next to you) | Muster Barrows | +12.7 (2.4) | **+13.7 (2.6)** | | **Over (moved)**, by 0.7. Dark. Cut its line |
| 19 | Lock-Keeper's Chain | Muster Barrows | +12.0 (2.7) | **+13.0 (2.9)** | The Slake +3.3 (1.7), now +3.5 (1.8) | **Over (moved)**, by 0.02: at the edge. Dark |
| 20 | Greened Bracers | Muster Barrows | +7.2 (2.8) | **+7.8 (3.0)** | The Slake +5.0 (1.6), now +5.2 (1.7) | In band, its se at the bar |
| 25 | The Cold Candle (coin: every Ice rune spell uses no rune) | Muster Barrows | 25.7 coin steps | **27.8** | | **Over the coin bar (moved)**, by 1.8. Every other spell reads 13.9, under. Dark |
| 27 | Riverstone Earrings (coin) | Muster Barrows | 23.7 | **25.6** | | In band |
| 15 | Catacomb Shroud | Krell's Hold | +12.7 (2.1) | **+8.9 (1.5)** | Bone Wing +1.5, now +1.4 | In band, the spread holds |
| 21 | Drover's Hat (25%) | Ox Road | +9.2 (2.4) | **+11.4 (3.0)** | Muster +4.0, now +4.3 | In band, the spread holds |
| 1, 2, 3, 9, 17 | the Pavise, Helm, Mail, Collar, Pole (Muster) | Muster Barrows | 9.3, 11.7, 9.4, 9.3, 10.1 | 10.1, 12.7, 10.2, 10.1, 10.9 | | In band, as before (the Pavise's 24 seeds still owed) |

**What it rules.**

- **The Key does not light.** Its 36 seeds read 5.7 at home, under the band. The Apron does not either. Neither was ever the big heal Carter's Rest made it look.
- **Four kept rows left the band, all by the re-measure, none by play:** the Saber under, the Pennies and the Chain just over, the Candle over the coin bar. Each is dark (`SIGNATURE_RULES.live` false), so no player meets a number out of band. Each is set again on its own cell, on these steps, as the next Signature batch's first rows, with the Key and the Apron. A dial is set where it reads, never by moving the ruler.
- **The roads' borrow values** (`roads/e5/sum.mjs`, Muster) rise 8% on pace and none changes its verdict. The held step is the larger on every row but the second healer's, whose value moves from 7.5 to 7.7, under its 10.

## Batch 4, measured (systems, lane/signatures-batch-4, 2026-11-28)

**How it plays:** fourteen more Signatures work in the fight engine for a hero that wears one, and players still see none (`SIGNATURE_RULES.live` false). A tank's plate that shields the melee beside it and a healer and tank pair read in band once cut, two coin pieces read in band as written, and the rest read under or need a call before their number moves.

The pieces, each built once for all its rows (HANDOFFS 2026-11-28 designer-sig-batch4):

| Piece | What it is, as built | Rows |
|---|---|---|
| P1 An aura | `aura` on the Signature row (`src/core/hunt/signature-auras.js`): a standing effect on the wearer and the heroes of its side within `r`, or only on its partner (`to: 'with'`), while a living hero of the side wears `with`, on a hero under `belowPm`. `takenPm` counts in Guarded's key under its 30% cap (status-effects.js `effectPm`'s `standing`), `regenPm` beside Still Mind, `healPm` on the wearer's cast heals. One a Signature. **Not a ledger row** (CONFLICTS 2026-11-28) | #34, #35, #45, #46 |
| P2 A cast's cost | `costs` (`src/core/hunt/signature-costs.js`, read in abilities.js gateOf, tryCast and fire): `of` 'spell' (a cast that spends a rune) or 'heal', `pay` 'none' or 'hp' (straight off HP, never under 1 HP, on the cast event as `paidHp`), `every`, `aboveHpPm`, a window `belowManaPm` + `ms` + `clockMs`. Counts, windows and clocks ride `cds` | #32, #37, #44 |
| P3 A saved shot | `saves: { ammo: true, every, hit: true }`: five landed basic shots hold a credit, and the next basic shot that would take an arrow takes none and buys none. Nothing refunded, nothing put in a bag | #41 |
| P4 A one-monster taunt | `do: 'taunt'` (reactions.js `tauntOne`, on need with the engine): the moment's monster, on another hero of the side and held by no Challenge, turns on the wearer, held `ms` | #33 |
| P5 A broken shell's breaker | `shield_break` carries `src`, so a `status` lands on it | #26 |
| P6 A monster picked by its target | a status's `at: 'lowest'`: the nearest monster on the living hero of the side lowest on health | #28 |
| P7 A fall-back save | `save` (`src/core/hunt/fall-save.js`): a blow that would kill a hero of the side leaves it at 1 HP, once a `clockMs` on the wearer, and on the scale in a fight the pull breaks off at once (fall-save.js `fallBackNow`), a fall back, never a death | #40 |
| P8 The boss cell | **Not built** (CONFLICTS 2026-11-28): Captain Hask has no called fight, and a called room is off the Danger scale | #38 |
| P9 A monster role | `role` (reactions.js): the moment's monster plays it, its striker for a blow at a hero | #42, #43 |

**Done, verified and assumed, kept apart:** every row's rule is proven in `tests/hunt-core/signature-rules.mjs` (one case a row, a mutant on each piece: 53 cases, 114 mutants caught), on the real settle (both paths: batch 4's sets each settle the same in 10-minute and 100-second windows, and a Bold four's save breaks its pull off at the save and settles the same in one window and in 20-second ones), and on both server doors (`tests/hunt-sessions-settle.mjs` BOTH-PATH-SAVE: the doomed hero wearing the Cloak through the server's read dies later than the plain one, and the tick's windows and a player's instants write the same rows). engine-parity holds with every row dark, no re-pin. The sizes below are MEASURED. The luck ceiling (V10) is still owed.

MEASURED on `lane/signatures-batch-4` snapshots dbd5f3138 (the rows; the plain fours replay batch 3's `b3-*` reports seed for seed: the Muster mixed four's first two seeds held 601 and 619, pace 0.84442 and 0.9077, both equal) a scratch copy of c3e809be2 for the shapes (`b4w-*`, temporary ids) and a89c6d78f for the pair as set (`b4s-muster-pair2`, by its real ids), `signature-depth/batch4.sh` (`b4s-*`) and `sum.mjs --batch 4`: each Signature on its seat's reference company (MID kits at the ground's reference Level, Steady unless named, 12 seeds x 8 h, held from hour 4), paired on the same seeds against the same four with none, in each ground's own pace step (`pace-step.mjs`: Muster 0.398, Pyre Field 0.487, Wyvern Roost 0.429). Coin rows read 4 seeds against batch 3's 4-seed plain four (rule C).

| # | Signature (seat) | Rule | Best cell | Held delta (se) | Pace or coin steps (se) | Second ground | Its pace steps (se) | Verdict |
|---|---|---|---|---|---|---|---|---|
| 35 | Gatekeeper's Plate (tank) | **CUT to 4%:** you and allies within 2 tiles take 4% less | Muster Barrows | +8.3 (2.2) | **+8.5 (2.6)** | (the tank's others pinned) | | **In band.** As written (8%) it read 22.0 (2.9). Set at 4% (`b4w-muster-plate4`; REPLAY=1 plays its first two seeds by its real id, equal) |
| 45, 46 | Convoy Bell + Lead Rein (healer + tank), the pair | **The Rein CUT to 7.5%:** each with the other in the party, +30% heals on the Rein's wearer under half, and it takes 7.5% less under half | Muster Barrows | +22.1 (2.4) | **+23.7 (3.0)**, the pair; each half alone **+9.1 (2.7)** (the Bell) and **+10.0 (1.7)** (the Rein) | | | **Each piece in band on its own half.** As written the pair read 32.5 and the Rein's half alone 19.0. Two heroes spend a Signature each on it, so the pair reads about two |
| 34 | Sergeant's Sash (healer, coin) | Allies within 8 tiles regenerate 20% more mana | Muster Barrows, 4 seeds | -0.3 (0.9) | **17.6 coin steps** | | | **In band (coin bar)** |
| 44 | Pyre Priest's Hood (mage, coin and fight) | Over 70% health, spells cost health, 1 a mana | Muster Barrows, 12 seeds | +1.2 (2.3) | **19.8 coin steps**, fight +0.8 (2.0) | | | **In band (coin bar)**, the fight flat. The mage drinks nothing and the healer drinks more (the probe: 98 to 128 an hour), the four's bill lower |
| 32 | Ledger Ring (mage, coin) | Every fifth spell costs no mana | Muster Barrows, 4 seeds | -0.5 (6.1) | **13.7 coin steps** | | | **Under the coin bar by 0.3** |
| 41 | Brood Bracers (ranger, coin) | Every fifth arrow that hits costs no arrow | Muster Barrows, 4 seeds | 0.0 (0.0) | **12.5 coin steps** | | | **Under the coin bar.** The fight is identical. COMPUTED 20.6 before it was built |
| 37 | Lychgate Leggings (healer, coin) | Under 30% mana, heals cost no mana for 5 s, 90 s clock | Muster Barrows, 4 seeds | -1.3 (1.1) | **3.0 coin steps** | | | **Under.** The healer is seldom under 30% mana: it drinks first |
| 26 | Thrower's Ring (healer) | A shield you cast breaks: its breaker's next blow at half | Muster Barrows | +3.0 (2.7) | **+2.9 (2.8)** | | | **Under** |
| 28 | Vault Leech Ring (healer) | Poison rune spells Sicken the monster on the ally lowest on health | Muster Barrows | +2.6 (3.0) | **+3.2 (2.9)** | | | **Under** |
| 33 | Teamster's Mitts (sword) | Power Strike on a monster attacking an ally: it turns on you for 4 s | Muster Barrows, the sword four (played here) | -3.3 (2.3) | **-3.6 (2.4)** | | | **Under.** Pulling a monster off the back row onto the sword costs more than it saves |
| 42 | Night Carter's Boots (healer) | A **stalker** hits an ally under 45%: its next blow at half | Muster Barrows | -1.5 (1.5) | **-1.2 (1.5)** | Pyre Field | +1.1 (2.7) | **Under** (was +11.8 on every monster). The Cairn Wight is one of Muster's four kinds |
| 43 | Bull's Tooth (ranger) | Single-target hits on a **brute** under 30% deal double | Wyvern Roost, its home | +0.3 (1.2) | **+2.2 (1.2)** | Muster Barrows | +5.2 (2.1) | **Under** (was +9.7 on every monster) |
| 40 | Hearth Mason's Cloak (healer), **Bold** | Once an hour, a hero of your party who would die falls back instead | Muster Barrows, Bold (the plain Bold four played here) | -2.4 (1.0), 5 seeds paired | **no held pace to pair**: the plain four's first death ends its four before hour 4 on 7 of 12 seeds | | | **The bar cannot read it.** Deaths 11 to 4 in 12 seeds x 8 h, seeds with a death 11 to 4, Level XP a hero-hour +11.1% (whole hunts, unpaired), kills +6.4% |

Shapes tried (each against its row's plain four, temporary ids on the scratch copy):

| Shape | Held delta (se) | Pace steps (se) | Reading |
|---|---|---|---|
| #35 the Plate as written, 8% (the tank four) | +20.8 (2.4) | +22.0 (2.9) | Over |
| #35 **4%** | +8.3 (2.2) | **+8.5 (2.6)** | **In band. Set** |
| #35 2.5% | +2.8 (1.9) | +2.3 (2.2) | Under |
| #45 + #46 as written: +30% heals, -15% taken | +30.4 (2.0) | +32.5 (2.2) | Over |
| #45 the Bell's half alone, +30% (the Rein worn inert) | +9.3 (2.4) | +9.1 (2.7) | In band. Kept |
| #46 the Rein's half alone, -15% (the Bell worn inert) | +17.9 (2.6) | +19.0 (3.0) | Over |
| #46 the Rein's half alone, **-7.5%** | +9.3 (1.6) | **+10.0 (1.7)** | **In band. Set** |
| #45 + #46 at half size: +15% heals, -7.5% taken | +14.2 (2.4) | +15.3 (2.7) | The pair at half size; the Bell at half reads under its own band |

**What the readings say.**

- **A standing cut is big, not small.** 15 expected the Plate to read small (Weakened -8% on the pack read -2.0). It reads 22.0. A cut that holds every second on the tank and the melee beside it pays at the tank's danger every time, which is rule E's danger moment held all hunt. At 8% it read 22.0, at 4% 8.5, at 2.5% 2.3: the line is a cliff, as the Boots' was. Set at 4%.
- **The pair pays as two Signatures, so each half is sized as one.** As written the pair read 32.5. Apart (its partner worn but inert), the Bell's half read 9.1 and the Rein's 19.0, so the Rein is cut to 7.5% (10.0 alone). As set the pair reads 23.7 (3.0), about two Signatures, which is what two heroes spend on it. Whether a pair is barred piece by piece is the designer's (CONFLICTS 2026-11-28).
- **The role filters take #42 and #43 out of the band.** A save or a finisher keyed to one role fires on that role's share of the blows: Muster's Cairn Wight is one of its four kinds, its Knight and Captain Hask two of them, the Roost's Bull and Brood Wyverns two of its five. Big where its monsters are needs a ground whose mix is mostly that role, and no ground has been read for one.
- **Mana and arrows are coin, and only the big lines read.** The Hood (the mage's whole drink bill, 19.8) and the Sash (20% more regen for the party, 17.6) reach the coin bar. The Ledger's fifth spell (13.7) and the Bracers' fifth arrow (12.5) sit just under it. The Leggings' window opens on a healer that drinks before it runs low (3.0).
- **The Cloak is a Bold piece the pace bar cannot see.** Its worth is in the deaths it turns away: four in twelve days where the plain four had eleven, and a four that lives to the end. Pace from the held start reads only seeds whose four was still whole at hour 4 (5 of 12 plain, 10 of 12 with the Cloak), so the two arms cannot be paired. A Bold Signature needs its own measure (deaths avoided and Level XP kept, or the whole hunt's Level XP a hero-hour), a call for the designer.
- **Repetition, audited.** Blunted carries #4, #23, #26 and #42 (a sword's target, a tank's neighbors, a broken shell's breaker, a stalker on a low ally). Guarded's key carries #1, #3, #17, #35 and #46. The taunt is new to Signatures (#33), the lowest-hero pick is new (#28), and the auras, the pair, the cast costs, the saved shot and the save are each one piece.

## Batch 4's calls and the out-of-band rows, ruled (game designer, 2026-11-28, lane/designer-sig-batch5)

**How it plays:** a Signature never makes a hero train slower, a coin piece saves about a seat's whole supply line, and a piece that turns away deaths is worth what it adds over the safest play without it. A healer's ring keeps the weakest ally standing, a ranger's earrings finish the big ones, and a party that wants to push Bold has a cloak that buys it about a Signature's worth of extra Level XP, never a free pass.

### The calls (CONFLICTS 2026-11-28, batch 4)

| Call | Ruling | Why |
|---|---|---|
| P1, auras as standing effects, not ledger rows | **Confirmed** | One rule for every Signature is its measured size ("Decision: how a Signature stays inside the gear slice"). Through the ledger the gear slice cap would hold #45's +30% and #46's cut to about 7% on their wearers, a second hidden cut no tooltip shows. The cuts still sit in Guarded's key under its 30% cap, so a stack of them stays bounded |
| A free or health-paid cast pays no Magic XP | **Changed. Magic XP is paid on the cast's written mana**, the mana the same cast pays with no Signature. A Signature changes what a cast costs, never what it trains | As built, a mage wearing the Hood trains almost no Magic above 70% health, and every coin piece quietly trades Magic for coin. Casts are bound by cooldowns, not mana (drinks are always sold), so the wearer casts what a plain hero casts and earns the same Magic XP an hour, no more. A refund that is a move's own design (a shell's refund, a Storm spell's mana back) keeps paying on the net, as now. An engine line (HANDOFFS item 1) |
| #44's health straight off HP, never through a shell | **Confirmed** | A standing shield paying the spell would make the Hood free on any shielded mage |
| #41 a credit after N landed basic shots, basic shots only | **Confirmed.** Re-worded to what it does: "Every third arrow that hits: your next shot costs no arrow" | A move's arrows are that move's cost. Drawing the hit before the arrow would move every ranger's dice |
| P4 never takes a monster a Challenge holds | **Confirmed** | The Challenge's hold is the tank's decision. A striker's Signature never undoes it |
| P7 breaks the pull off on any stance, only on the scale | **Confirmed** | "Falls back instead" is a fall back's step, never a death's. Off the scale there is no pull to break |
| The two cuts, #35 Gatekeeper's Plate 8% to 4%, #46 Lead Rein 15% to 7.5% | **Confirmed**, and **a pair is barred piece by piece** | Each piece costs its wearer the one Signature it plays, so each half is sized as one Signature (the Bell 9.1, the Rein 10.0). The pair as set reads 23.7 (3.0), two Signatures for two heroes |
| #40 Hearth Mason's Cloak: how a death-save Signature is judged | **Rule F, below** | The held start cannot pair a Bold four: its first death ends the four before hour 4 on 7 of 12 seeds |
| P8, the boss cell, and #38 | **Rule D is replaced: no Signature waits on a boss alone.** #38 Drowned Signet keeps its home and gets a rule that pays on its ground | Captain Hask is about 9 kills an hour of Muster's 460, and a called room is off the Danger scale, so a boss rule pays about 70 s an hour on its ground and has no ruler in its room. A boss's chase is what it drops. A second ruler for one row is a second path to keep right |

### Rule F: a Signature that turns away deaths

| Call | Ruling |
|---|---|
| The cell | Its stance's own cell: the seat's reference four on Bold, the only stance that can die (CLAUDE.md section 6) |
| The metric | **Level XP kept**: each seed's whole hunt, the Level XP its heroes earned less what their deaths took, a hero over the hunt's wall hours (`v1-climb --raw`, `sum.mjs --batch 5` BOLD5), paired by seed against **the plain four's better stance**, Bold or Steady by its mean, in the ground's pace step |
| The bar | 10 +- 3, as every fight row, on 36 seeds. A death moves a seed's Level XP kept by about a fifth, so 12 seeds read se 22 and 36 read se 12. Its number is set between a clock that reads over and one that reads under, never on one reading's mean, and the Lab reads it again on more seeds before it turns on |

**Why against the better stance.** A party with no Cloak does not push Bold where Bold dies. On Muster Barrows the plain four keeps 159,000 Level XP a hero-hour on Bold and 221,000 on Steady (a death takes about 1.95 million Level XP, a whole day of one hero's gains), so its best play is Steady. The Cloak is worth what Bold with it adds over that, which is the decision it changes.

### Rule D, replaced

A Signature never keys on a boss alone. A boss is one monster in thirty on its ground, and its called fight is off the Danger scale, so a boss rule reads on no ruler the pool shares. A boss's own chase is its drops, its Signature among them. #38 Drowned Signet is rewritten for its seat on its ground (below), and its home stays Captain Hask.

### The rows

MEASURED on `lane/designer-sig-batch5` (the hunt engine of `set/v0.2.144` 40a8fa815: the plain mixed four on Steady replays `b3-muster-mixed` seed for seed, pace and held equal on all 12), `signature-depth/batch5.sh` and `sum.mjs --batch 5`, batch 4's cell, each ground's own pace step. Shapes were temporary ids on a scratch copy (`b5v-*`), three with a scratch engine line named in the table. REPLAY=1 plays each kept row's first two seeds by its real id.

| # | Signature | The rule now | Best cell | Held delta (se) | Pace, coin or Bold steps (se) | Second ground (pace steps) | Verdict | Now |
|---|---|---|---|---|---|---|---|---|
| 19 | Lock-Keeper's Chain | A hero near fall-back: Spring Tide is ready again (**once a minute**) | Muster Barrows | +8.4 (2.8) | **+8.5 (2.9)** | the Slake +3.5 (batch 3, 30 s) | In band. At 30 s 13.0 and 40 s 13.7: Spring Tide's own minute was the clock that bound | Data set |
| 23 | Ferry Pennies | **Unchanged**: Mend below 45%, Blunted next to you | Muster Barrows, the tank four | +11.0 (2.3) | **+10.2 (2.4)** | (the tank's others pinned) | In band on this tree. The 13.7 was batch 2's reports, an older tree's plain four. Under 40% read 0.5: the line is a cliff | Kept |
| 4 | Charred Saber | **Unchanged**: Flame Strike's target Blunted | Pyre Field, the sword four, **24 seeds** | +9.0 (1.9) | **+13.6 (3.4)** | Muster +3.7 (batch 2) | Over by 0.6, se 3.4 over the bar: **36 seeds owed** before any number moves. 12 seeds read 14.6 (5.1). The 6.4 was batch 2's tree | Kept, dark |
| 43 | Bull's Tooth | Single-target hits on a brute **below half health** deal double damage | Muster Barrows | +0.2 (2.8) | **+10.5 (2.9)** | Wyvern Roost, its home, +4.9 (1.2) | In band, the spread holds. Under 30% read 2.2 at home, 5.2 on Muster | Data set, `best` Muster |
| 31 | The Cellar Key | An ally hit below 30% heals **3%** of max health (once every **20 s** an ally) | Carter's Rest, its home, 36 seeds | +10.5 (2.6) | **+10.0 (2.4)** | | In band. 2% at 30 s read 5.7 | Data set |
| 28 | Vault Leech Ring | **Reshaped:** Poison rune spells: the hurt ally lowest on health heals for 60% of the damage they deal | Carter's Rest, 36 seeds | +11.8 (2.4) | **+11.8 (2.1)** | Muster +4.7 (2.7) at 50%, +5.0 at 100% | In band, the spread holds. 50% read 6.9 and 70% 16.6 there. A save on the weakest ally, rule A, on Green Sickness's 10 s clock. The batch 4 Sickness read 3.2 | Data set, `best` Carter's Rest |
| 32 | Ledger Ring | **Every fourth** spell costs no mana | Muster Barrows, 4 seeds | -0.3 (6.1) | **17.0 coin** | | In band (coin bar). Every fifth 13.7 | Data set |
| 41 | Brood Bracers | **Every third** arrow that hits: your next shot costs no arrow | Muster Barrows, 4 seeds | 0.0 (0.0) | **20.9 coin** | | In band. After five 12.5 | Data set |
| 37 | Lychgate Leggings | **Below half mana**: heals cost no mana for 5 s (**40 s** cooldown) | Muster Barrows, 4 seeds | -2.3 (2.4) pace | **23.1 coin** | | In band. Under 30% the healer drinks first (3.0, and 7.1 at 10 s a 30 s clock). Under half the line is crossed every few casts, so the clock is the lever (5 s a 30 s clock 28.0, 10 s 43.0) | Data set |
| 25 | The Cold Candle | **Reshaped:** Frost Lance uses no runes | Muster Barrows, 4 seeds | 0.0 (0.0) | **19.6 coin** (scratch `saves.of`) | | In band. Every Ice spell 27.8, every other 13.9: no count lands between. Frost Lance is 70% of the mage's Ice casts | Specced (HANDOFFS item 2). The data row stays every Ice spell, dark, until `saves.of` lands |
| 40 | Hearth Mason's Cloak | **Once every 75 minutes**, a hero of your party who would die falls back instead | Muster Barrows, Bold, 36 seeds | | **+7.8 (12.4)** Bold steps against plain Steady | | In band by rule F, set between the hour (+21.3, over) and 90 minutes (+5.3), two hours -1.9, once a hunt -15.7. Deaths: 17 in 36 seeds with it, 11 in 12 plain | Data set. The Lab reads it on more seeds before it turns on |
| 33 | Teamster's Mitts | **Cut, replaced (spec):** Power Strike: the next blow you take lands at half | | | | | Every shape read under: the taunt -3.6 (sword four) and -1.6 (tank four), Blunted on a monster attacking an ally -3.6 and -0.8, a heal of 8% under half -0.5 and +5.4, its target Sickened +1.3 | Batch 5 (a hero-side Blunted) |
| 26 | Thrower's Ring | **Cut, replaced (spec):** Earth rune shields you cast are 30% stronger | | | | | Every shape read under: the breaker Blunted 2.9, monsters hitting the shell Blunted 4.9, Weakened 3.9, Sapped 0.6, Protective Ward ready 5.5. A healer's shell is seldom the defense that binds, so a rule hung on its moments pays little | Batch 5 (a Signature's raise on a family's shells) |
| 42 | Night Carter's Boots | **Cut, replaced (spec):** When a monster winds up a blow at an ally below half health, that blow lands at half | | | | | The stalker filter read -1.2 and +1.1, a caster filter -1.8 (the Bone Wing), -0.6 (the Flooded Wing), +1.5 (Pyre). Blunted spends on the striker's next blow, and a caster's comes a spell later. The wind-up is the blow itself, and only grounds with wind-ups have it, so the spread holds by construction | Batch 5 (a `windup` moment) |
| 18 | Brewer's Apron | **Cut, replaced (spec):** Circle of Renewal: the hurt ally lowest on health is healed a second time | | | | | Every Circle shape read under at home: Emboldened 2.8, +4% on a hero under half 0.9, Guarded 15% for 4 s -0.9. Circle tops up a party already covered. The one heal that reads at home lands on the lowest ally (#28) | Batch 5 (a heal on the lowest from a heal) |
| 38 | Drowned Signet | **To be rewritten (rule D)** for its seat on its ground | Muster Barrows, the sword four | -3.0 (2.6) | -2.4 (2.4) (the first shape: below half health, +25% damage for 4 s, once every 20 s) | | Under. The sword four on Muster read near zero on every rule this batch tried on it (#33's four shapes too) | Batch 5, its moments read first |

Every shape read (`sum.mjs --batch 5` prints the four tables):

| Shape or re-read | Kind | Held delta (se, seeds) | Pace steps (se) | Bar | Kills/h |
|---|---|---|---|---|---|
| #23 Ferry Pennies as it stands, under 45% (Muster, the tank four, this tree) | pace | +11.0 (2.3, 12) | +10.2 (2.4) | in band | -2.0% |
| #23 under 40% (Muster) | pace | +0.3 (1.9, 12) | +0.5 (2.1) | UNDER (raise or reshape) | 0.0% |
| #4 Charred Saber as it stands, Blunted on its target (Pyre, the sword four, this tree) | pace | +9.2 (2.8, 12) | +14.6 (5.1) | over, se 5.1: more seeds | 1.1% |
| #26 monsters that hit a shield you cast: Weakened 8 s (Muster) | pace | +3.4 (3.3, 12) | +3.9 (3.3) | under, se 3.3: more seeds | -0.6% |
| #26 the same, Sapped 6 s (Muster) | pace | +0.7 (2.7, 12) | +0.6 (2.7) | UNDER (raise or reshape) | -0.4% |
| #28 Poison rune spells heal the lowest ally 50% of their damage (Muster) | pace | +4.7 (2.7, 12) | +4.7 (2.7) | UNDER (raise or reshape) | -0.9% |
| #28 the same, 100% (Muster) | pace | +5.4 (2.3, 12) | +5.0 (2.4) | UNDER (raise or reshape) | -1.3% |
| #42 a caster hits an ally under 45% (the Bone Wing) | pace | -1.3 (1.4, 12) | -1.8 (1.5) | UNDER (raise or reshape) | 0.0% |
| #42 the same (the Flooded Wing, the axes four) | pace | +0.1 (1.6, 12) | -0.6 (2.3) | UNDER (raise or reshape) | -0.7% |
| #42 the same (Pyre Field) | pace | +1.4 (2.6, 12) | +1.5 (3.5) | UNDER (raise or reshape) | 0.2% |
| #43 a brute under half (Muster) | pace | +0.2 (2.8, 12) | +10.5 (2.9) | in band | 3.2% |
| #43 the same (Wyvern Roost) | pace | +1.2 (1.3, 12) | +4.9 (1.2) | UNDER (raise or reshape) | 1.3% |
| #33 the Mitts on the tank four (Muster) | pace | -1.1 (2.0, 12) | -1.6 (1.8) | UNDER (raise or reshape) | 0.0% |
| #33 Power Strike on a monster attacking an ally: its next blow at half (Muster, the sword four, scratch `onAlly`) | pace | -3.9 (3.6, 12) | -3.6 (3.5) | UNDER (raise or reshape) | 0.9% |
| #33 the same (Muster, the tank four) | pace | -1.3 (1.5, 12) | -0.8 (1.4) | UNDER (raise or reshape) | 0.3% |
| #19 Lock-Keeper's Chain as it stands, once every 30 s (Muster, batch 3) | pace | +13.3 (2.7, 12) | +13.0 (2.9) | OVER (cut its number) | -2.2% |
| #19 once every 40 s (Muster) | pace | +14.2 (2.2, 12) | +13.7 (2.1) | OVER (cut its number) | -2.2% |
| #19 once every 60 s (Muster) | pace | +8.4 (2.8, 12) | +8.5 (2.9) | in band | -1.3% |
| #19 once every 90 s (Muster) | pace | +7.5 (3.7, 12) | +7.7 (3.5) | in band, se 3.5: more seeds | -1.1% |
| #4 Charred Saber as it stands, 24 seeds (Pyre, the sword four) | pace | +9.0 (1.9, 24) | +13.6 (3.4) | over, se 3.4: more seeds | 0.6% |
| #33 Power Strike while you are under half health: heal 8% of your max (Muster, the sword four, scratch `selfBelowPm`) | pace | -0.8 (3.4, 12) | -0.5 (3.5) | UNDER (raise or reshape) | 0.2% |
| #33 the same (Muster, the tank four) | pace | +5.3 (2.2, 12) | +5.4 (2.6) | UNDER (raise or reshape) | -0.6% |
| #33 Power Strike: its target Sickened (takes 10% more, 6 s) (Muster, the sword four) | pace | -0.6 (2.8, 12) | +1.3 (2.7) | UNDER (raise or reshape) | 0.9% |
| #26 monsters that hit a shield you cast: their next blow at half (Muster) | pace | +5.1 (2.1, 12) | +4.9 (2.1) | UNDER (raise or reshape) | -1.1% |
| #18 Brewer's Apron, Circle of Renewal on a hero under half: +4% of its max health (Carter's Rest, 36 seeds) | pace | +0.1 (2.0, 36) | +0.9 (1.6) | UNDER (raise or reshape) | 0.0% |
| #31 The Cellar Key, 3% once every 20 s (Carter's Rest, 36 seeds) | pace | +10.5 (2.6, 36) | +10.0 (2.4) | in band | 1.2% |
| #28 Vault Leech Ring, 100% to the lowest ally (Carter's Rest, 36 seeds) | pace | +21.3 (2.2, 36) | +21.4 (2.2) | OVER (cut its number) | 3.4% |
| #28 the same at 50% (Carter's Rest, 36 seeds) | pace | +6.8 (2.4, 36) | +6.9 (2.1) | UNDER (raise or reshape) | 0.9% |
| #28 the same at 60% (Carter's Rest, 36 seeds) | pace | +11.8 (2.4, 36) | +11.8 (2.1) | in band | 1.5% |
| #28 the same at 70% (Carter's Rest, 36 seeds) | pace | +16.4 (2.7, 36) | +16.6 (2.6) | OVER (cut its number) | 2.4% |
| #18 Brewer's Apron, Circle of Renewal: each hero it heals takes 15% less for 4 s (Carter's Rest, 36 seeds) | pace | -3.0 (2.1, 36) | -0.9 (1.7) | UNDER (raise or reshape) | 0.2% |
| #18 the same (Muster) | pace | +6.3 (1.9, 12) | +6.0 (2.0) | UNDER (raise or reshape) | -1.3% |
| #38 Drowned Signet: under half health, you deal 25% more for 4 s, once every 20 s (Muster, the sword four) | pace | -3.0 (2.6, 12) | -2.4 (2.4) | UNDER (raise or reshape) | 0.7% |

| Coin shape | Coin steps | Fight, pace steps (se) | Bar |
|---|---|---|---|
| #32 Ledger Ring, every fourth spell (Muster) | +17.0 | -0.3 (5.6) | in band |
| #41 Brood Bracers, a credit after three landed (Muster) | +20.9 | +0.0 (0.0) | in band |
| #37 Lychgate Leggings under 30% mana, 10 s, 30 s clock (Muster) | +7.1 | -3.3 (2.7) | UNDER (raise or reshape) |
| #37 under half mana, 10 s, 30 s clock (Muster) | +43.0 | +1.8 (5.4) | OVER (cut its number) |
| #37 under half mana, 15 s, 30 s clock (Muster) | +63.3 | -3.7 (2.0) | OVER (cut its number) |
| #37 under half mana, 5 s, 30 s clock (Muster) | +28.0 | -2.2 (2.4) | OVER (cut its number) |
| #37 under 40% mana, 10 s, 30 s clock (Muster) | +45.5 | -2.8 (2.3) | OVER (cut its number) |
| #37 under half mana, 5 s, 40 s clock (Muster) | +23.1 | -2.3 (2.4) | in band |
| #37 under half mana, 5 s, 45 s clock (Muster) | +21.7 | -2.3 (2.4) | in band |
| #25 The Cold Candle, Frost Lance only (Muster, scratch `saves.of`) | +19.6 | +0.0 (0.0) | in band |

| Bold shape | Kept a hero-hour: plain Bold, plain Steady, worn | Against | Bold steps (se, seeds) | Deaths on Bold, plain to worn (12 seeds x 8 h) | Bar |
|---|---|---|---|---|---|
| #40 the Cloak as built, once an hour (Muster, Bold) | 159367, 220952, 243138 | plain Steady | +25.9 (21.6, 12) | 11 in 12 seeds to 4 in 12 | over, se 21.6: more seeds |
| #40 once a hunt (a 10 h clock) (Muster, Bold) | 159367, 220952, 216634 | plain Steady | -4.0 (22.0, 12) | 11 in 12 seeds to 7 in 12 | under, se 22.0: more seeds |
| #40 once an hour, 36 seeds (Muster, Bold) | 159367, 220588, 238640 | plain Steady | +21.3 (11.8, 36) | 11 in 12 seeds to 14 in 36 | over, se 11.8: more seeds |
| #40 once every 75 minutes, 36 seeds (Muster, Bold) | 159367, 220588, 226870 | plain Steady | +7.8 (12.4, 36) | 11 in 12 seeds to 17 in 36 | in band, se 12.4: more seeds |
| #40 once every 90 minutes, 36 seeds (Muster, Bold) | 159367, 220588, 224612 | plain Steady | +5.3 (12.3, 36) | 11 in 12 seeds to 18 in 36 | under, se 12.3: more seeds |
| #40 once every 2 hours, 36 seeds (Muster, Bold) | 159367, 220588, 218327 | plain Steady | -1.9 (12.2, 36) | 11 in 12 seeds to 20 in 36 | under, se 12.2: more seeds |
| #40 once every 3 hours, 36 seeds (Muster, Bold) | 159367, 220588, 217232 | plain Steady | -3.1 (12.3, 36) | 11 in 12 seeds to 20 in 36 | under, se 12.3: more seeds |
| #40 once a hunt, 36 seeds (Muster, Bold) | 159367, 220588, 206119 | plain Steady | -15.7 (11.7, 36) | 11 in 12 seeds to 24 in 36 | UNDER (raise or reshape) |

**What the readings say.**

- **The re-read moved rows by their tree, not their ruler.** Batch 2's readings sit on batch 2's plain fours. Played again on this tree, Ferry Pennies reads 10.2 (it read 13.7 on the old reports in the new steps) and the Charred Saber 13.6 on 24 seeds (6.4). Every batch 2 row is re-read on this tree before it turns on (HANDOFFS item 7).
- **A clock that never binds is no lever.** The Chain read 13.0 at 30 s and 13.7 at 40 s, then 8.5 at a minute: a near fall-back comes less often than every 40 s, and Spring Tide's own cooldown is a minute.
- **Heals read where healing binds, and on the lowest ally.** The Leech's heal on the lowest ally read 4.7 and 5.0 on Muster (50% and 100%: the lowest ally there is seldom low) and 6.9, 11.8, 16.6 and 21.4 at 50%, 60%, 70% and 100% on Carter's Rest. Circle of Renewal's every shape read nothing there. The Key reads 10.0 on 3% a 20 s clock.
- **The sword four on Muster Barrows reads almost nothing.** Five rules on it read -3.6 to +1.3 (the Mitts' four, the Signet's one), while the Mitts' shapes on the tank four read up to 5.4. It is no cell for a melee row: batch 5 reads a melee row's moments first, on the tank four and on Pyre Field's sword four.
- **A coin piece reads in coin steps and its line is a cliff.** The Leggings read 3.0 and 7.1 under 30% mana and 28 to 63 under half, since a healer that drinks at 30% sits between the two. A clock on the half line sets it (23.1 at 40 s).
- **The Bold four keeps less than the Steady one on Muster.** 159,000 to 221,000 Level XP a hero-hour: a death costs a hero about a day of Level XP. With the Cloak once an hour Bold keeps 238,600 (36 seeds), past Steady by 21.3 (11.8) steps, and once every 75 minutes 226,900, past it by 7.8. So the Cloak is what makes Bold worth choosing on Muster, by about a Signature. That Bold never pays there without it is the death package's balance, a reading for the Lab (HANDOFFS item 7).
- **Repetition, audited.** The cuts take Blunted off #26 and #42 and the taunt off #33, and the replacements are new pieces: a hero-side Blunted (#33, the mirror of #4's), a raise on a family's shells (#26), a wind-up moment (#42), a heal on the lowest ally from a heal (#18, beside #28's from a spell). Blunted keeps #4 and #23. Guarded keeps #1, #3, #17, #35 and #46.

### Batch 5: the rows and their moves (spec)

**How it plays:** the club's Stagger, the sword's Parry and the axes' Gash each get the piece their move was missing, the support's eight arrive with the support, and the rows this batch cut come back on the pieces they need.

Nothing below is built. Each row reads its moments first (`moments.mjs`), then 12 seeds on its cell (36 on Carter's Rest), on rules A to F. A row that needs a piece names it, and each piece is built once for every row that uses it.

| # | Signature | Move | Home · slot | The rule (to build) | Piece | Cell | Notes |
|---|---|---|---|---|---|---|---|
| 8 | Stable Troll's Maul | Stagger | Carter's Rest, Stable Troll · weapon (hammer) | Stagger ends a wind-up: gain a shield of 10% of your max health for each wind-up it ends | an `interrupt` moment (the wind-ups a hero's move ended, `n` its count) | the mixed four's hammer on Carter's Rest (36 seeds), Krell's Hold | Wide Stagger ends more than one, so the count is the branch's, never the Signature's. Repeats no branch (Long Stagger, Shaken, Wide Stagger) |
| new | Ledgehide Breeches | Parry | Wyvern Roost, Ledge Wyvern · pants | Parry also guards an ally: it can answer a monster next to you winding up a blow at another hero | Parry's aim reads a wind-up on any hero within 1 tile of the wearer | the sword four on Wyvern Roost (the Crag Wyvern casts), Pyre Field | Riposte, Answering, Long, Disarming, Quick and Calm Parry are the branches. A bodyguard's Parry repeats none |
| new | Troll Picker's Hooks | Gash | Carter's Rest, Troll Picker · weapon (axes) | Gash hits 3 or more: your next Rend deals 40% more damage | a count floor on a cast moment (`min`), a Kindled-key status on Rend (`whetted`) | the axes four on Muster Barrows and the Flooded Wing | A crowd move fuels the single-target one. Deep, Wide, Crippling, Red, Feeding and Carrying Gash are the branches. Carter's Rest then holds five (8, 18, 26, 31 and this) |
| 29 | Fledgling Claw | Rupture | Wyvern Roost · necklace | Re-read as built with Gash on the axes bar | none | the axes four on Muster and the Flooded Wing | Its moment (five Bleed stacks on one monster) is read first. A second Bleed stack on each Rend read 4.4 |
| 30 | Raft Builder's Earrings | Brand (Storm) | the Tower, Silver lock · earrings | Waits | | | Brand is held (`23`). Built when Brand goes live, sword only. Re-homed if Brand is cut. Not counted in the batch |
| 33 | Teamster's Mitts | Power Strike | Ox Road, Dead Teamster · gloves | Power Strike: the next blow you take lands at half | a hero-side Blunted (`braced`, on the `once` path a monster's Blunted takes) | the sword four and the tank four on Muster | Guard Strike (-4% for 3 s) is the branch. One whole blow halved every 6 s is the front's danger moment, rule E |
| 26 | Thrower's Ring | Earth rune | Carter's Rest, Slate Thrower · ring | Earth rune shields you cast are 30% stronger | a Signature's standing raise on a family's casts (`raise: { family, pm }`) | the mixed four's healer on Muster, the tank four's tank | Shelter, Arcane Barrier, Protective Ward and Warm Stone are the Earth shells. Read on the healer and on the tank, both cast one |
| 42 | Night Carter's Boots | any | Unmarked Catacombs, Night Carter · boots | When a monster winds up a blow at an ally below half health, that blow lands at half | a `windup` moment (a monster's wind-up marked on a hero: `t` that hero, `src` the monster) | the mixed four on the Bone Wing and the Flooded Wing, Pyre Field | Muster has no wind-ups, so the spread holds by construction |
| 18 | Brewer's Apron | Circle of Renewal | Carter's Rest, Troll Brewer · body | Circle of Renewal: the hurt ally lowest on health is healed a second time | a heal to the lowest ally that reads its own heal's amount, once a cast | the healer on Carter's Rest (36 seeds) | #28's heal on the lowest ally read 21.4 there at 100%. Lasting Circle and Wide Circle are the branches |
| 38 | Drowned Signet | any | Captain Hask · ring | Rewritten on a moment its seat meets on Muster Barrows, read first with `moments.mjs` | | the ranger or the sword on Muster, Hask's Ford | Rule D. The first shape (below half health, +25% damage for 4 s) read -2.4 on the sword four |
| support | Ash-Pit Mitts, Firebrick Belt, Farmhand's Gloves, Lye Pouch, Watchfire Cloak, Smoored Locket, Bedstone Boots, Pyre-Cloth Wraps | the support's 7 moves and its fires | as `22` section 7.1 | as `22` section 7.1, with the corrections beside | a status-ended moment (Ash-Pit), `min` (Firebrick), a shield to the party (Farmhand's), mana to the party (Lye Pouch), a fire filter (Watchfire, Smoored), `ready` on the moment's hero (Bedstone), two fires (Pyre-Cloth) | the support four on its best grounds (`22` section 2.2) | Built with L13, never before. Corrections from batches 2 to 4: Firebrick Belt's ready lands on a lane 95% full and reads nothing, so it is reshaped before it is built. Watchfire Cloak and Lye Pouch are kill-keyed and read under in every batch so far, so each reads its moments first. Lye Pouch and Smoored Locket are coin pieces on the coin bar. Smoored Locket's 20% line is under where an ally drinks (30%) |

**Count:** 8, Parry's, Gash's, 29, 33, 26, 42, 18 and 38 (9 rows on 8 new pieces) plus the support's 8 with L13: 17 rows, 20 or fewer. #30 waits on Brand.

## Batch 5, built and measured (systems, lane/signatures-batch-5, 2026-11-28)

**How it plays:** the hammer's Stagger, the sword's Parry and the axes' Gash each have a Signature in the fight engine, the four cut rows came back on their new pieces, and a Signature that changes what a cast costs no longer changes what it trains. Players still see none (`SIGNATURE_RULES.live` false). Five rows read in band (one of them raised); the rest read under on the spec's number and on every shape tried, so their rules go back to the designer.

The pieces, each built once for all its rows (HANDOFFS 2026-11-28 designer-sig-batch5):

| Piece | What it is, as built | Rows |
|---|---|---|
| Magic XP on the written mana | a cast a worn Signature paid another way carries `xpMana` on its cast event: its written mana less the plain cast's own refunds (a shell's, a ward's, a Storm spell's mana back), which the settle's reward credits (`hunt-rewards.js`). `mana` stays what was spent. Never more than the same cast with no Signature | every `costs` row (#32, #37, #44) |
| `interrupt` | a moment on the hero whose cast ended wind-ups (`abilities.js` answer), `n` how many | #8 |
| `windup` | a moment on every other hero of the side as a monster begins a wind-up at a hero (`monster-spells.js` begin): `t` that hero, `src` the monster. A mend aims at a packmate and is none | #42, #47 |
| `within`, a cast at the moment's monster | `within` the moment's hero that near the wearer; a `cast` of a one-target strike takes the moment's monster (`castNow` `foe`) or casts nothing, from the move's bar slot, at its own cooldown and mana, no lane waited on | #47 |
| `min`, Whetted | a count floor on a moment that counts (`n`: a cast's monsters, the wind-ups it ended, a taunt's, a pull's); Whetted, Kindled's key, the next Rend +40%, spent on it | #48 |
| Braced | Blunted's mirror on a hero, its own key: the next blow at it at half, spent once that blow lands (a shell's or not, never a tick), `once` on the taken side (`status.js spendOnce`, `damage.js landHit`) | #33 |
| `raise` | a standing raise on a family's casts (`signature-casts.js castRaiseOf`), pm more on the cast's output as Kindled lands, never spent; `of: 'shell'` only casts that lay a shield | #26 |
| a heal `to: 'again'` | on a cast's own moment, of the heroes it healed the one lowest on health, healed again by its own heal's amount through the heal door, once a cast | #18 |
| `saves.of` | a rune save read on one move, its count on that move's casts | #25 |

**Done, verified and assumed, kept apart:** every row's rule is proven in `tests/hunt-core/signature-rules.mjs` (one case a row, a mutant on each piece: 62 cases, 147 mutants caught), on the real settle (both paths: batch 5's rows on Carter's Rest, whose monsters wind up, each set settles the same in 10-minute and 100-second windows; the Ledger's free casts on Muster train on their written mana), and engine-parity holds with every row dark, no re-pin. The sizes below are MEASURED.

MEASURED on `lane/signatures-batch-5` (the hunt engine of `set/v0.2.144` 1786d8b1c6 with this lane's pieces; the plain fours replay batch 3's, 4's and 5's reports seed for seed: the Muster mixed four's first two seeds 0.8444 and 0.9077, Carter's 1.024 and 0.9981, Pyre's sword four 0.969 and 1.0117), `signature-depth/batch5.sh` (`b5s-*` by real ids, `b5w-*` shapes on a scratch copy) and `sum.mjs --batch 5`: each Signature on its seat's reference company (MID kits at the ground's reference Level, Steady, 12 seeds x 8 h, 36 on Carter's Rest, 4 for a coin row, held from hour 4), paired on the same seeds against the same four with none and the same bar, in each ground's own pace step. Stagger, Parry and Gash are on no recorded bar, so each is added to its seat in both arms on the move's own new-slot trigger (`--add-moves move@t`: "my target is winding up", "when it would hit at least 2"); the move alone moves a four a lot (Parry took the Pyre sword four from 48.8 to 64.5 held), so its Signature reads only against the same bar.

| # | Signature (seat) | The rule as built | Best cell | Held delta (se) | Pace or coin steps (se) | Second ground (pace steps) | Verdict |
|---|---|---|---|---|---|---|---|
| 29 | Fledgling Claw (axes) | As built: the wearer's Bleed stacks to 6, Gash on the bar | Muster Barrows | +5.3 (2.3) | **+7.8 (2.5)** | the Flooded Wing +0.7 (3.2) | **In band, the spread holds.** With Gash laying a Bleed on every monster beside the axes, the sixth stack finally has a moment |
| 33 | Teamster's Mitts (sword) | Power Strike: the next blow you take lands at half | Muster Barrows, the sword four, **24 seeds** | +6.9 (2.6) | **+7.0 (2.6)** | the tank four +6.8 (3.8) | **In band**, at the band's foot (12 seeds read 7.4 (3.2); the 24-seed plain replays the 12-seed one seed for seed) |
| 42 | Night Carter's Boots (healer) | When a monster winds up a blow at an ally below half health, that blow lands at half | **Pyre Field** (`best` moved) | +7.1 (1.4) | **+8.8 (2.3)** | the Flooded Wing +5.1 (2.5), the Bone Wing -2.1 (1.3) | **In band, the spread holds within its se** |
| 25 | The Cold Candle (mage, coin) | Frost Lance uses no runes (`saves.of`) | Muster Barrows, 4 seeds | 0.0 (0.0) | **19.6 coin** | | **In band (coin bar)**, by its real id: your scratch line's reading exactly |
| 8 | Stable Troll's Maul (hammer) | Stagger ends a wind-up: a shield of 10% of max health for each one it ends | Carter's Rest, 36 seeds | +3.8 (2.2) | **+3.8 (1.8)** | Krell's Hold +1.4 (2.0) | **Under.** 25% read 0.8 (1.8) and 40% 1.4 (1.9): no size moves it. The shield lands on the hammer as it ends the blow it feared, a moment past the danger |
| 47 | Ledgehide Breeches (sword) | Parry also guards an ally: a monster beside you winding up at another hero within 1 tile is Parried | Wyvern Roost | 0.0 (0.0) | **0.0 (0.0)** | Pyre Field +0.1 (2.8) | **Under: it never fires on its cell.** On the sword four no ally stands within a tile of the sword (the crossbow at 4, the healer at 3, the mage at 6). With no reach to the ally (a monster beside you winding up at any other hero, the tip's own words) it fires and reads 1.7 (0.9) on the Roost and 1.0 (2.7) on Pyre Field |
| 48 | Troll Picker's Hooks (axes) | Gash hits 3 or more: your next Rend deals 40% more damage | Muster Barrows | -1.5 (2.6) | **+0.0 (2.7)** | the Flooded Wing +1.7 (2.6) | **Under.** At 2 or more 3.7 (2.9); the next Rend doubled 4.3 (2.7) |
| 26 | Thrower's Ring (healer) | **RAISED:** Earth rune shields you cast are twice as strong | Muster Barrows, the healer | +7.7 (3.4) | **+7.7 (3.3)** | (at 30%: the tank four's tank, + Shelter, -2.1 (2.3)) | **In band at twice as strong**, se 3.3: 24 seeds owed. As specced, 30%, it read -3.9 (3.1): a healer's shell seldom binds, so only a big one moves the hunt. Data set, dark |
| 18 | Brewer's Apron (healer) | Circle of Renewal: the hurt ally lowest on health is healed a second time | Carter's Rest, 36 seeds | -0.2 (2.7) | **+0.7 (2.2)** | | **Under.** After a Circle the lowest ally is seldom in danger: the Circle tops up a party already covered, and its second heal does too |
| 38 | Drowned Signet (ranger) | **Not rewritten in data** (its row is still the boss rule, dark) | Muster Barrows, the ranger | | | | **Under on both ground shapes:** a monster that hits an ally under 45% Sickened (+10% taken, 6 s) -0.3 (1.5), or its armor a quarter less (6 s) +0.7 (2.8). Its rule is yours |

**What the readings say.**

- **A save reads where the danger is the blow itself.** The Boots halve the wind-up that would drop a low ally, and read 8.8 on Pyre Field, where the Stoker's Burning Ash lands on the whole party; on the Bone Wing -2.1. The Mitts halve the next blow at a sword that has just struck, and read 7.4. A shield after the danger (the Maul) read nothing at any size, and more shell on a shell that seldom binds (the Ring) read only when it doubled.
- **A guard needs someone to guard.** The Breeches read 0.0 to the bit on the Roost: the sword is the sword four's only front, so no ally ever stands within a tile of it when a monster beside it winds up. Opened to any hero the monster aims at, it fires and still reads under (1.7 and 1.0); its Parry shares the 10 s cooldown with the sword's own Parry slot. A guard rule reads on a four with two heroes in front, a cell the size bar has no reference four for.
- **A damage raise on one strike is small on these cells.** Rend +40% after a big Gash read 0.0 and 1.7; at Gash's own two monsters 3.7. The axes' Rend is a share of their damage, the axes a share of the four's.
- **Repetition, audited.** Blunted keeps #4, #23 and #42's new rule (the wind-up's caster). Braced is new (a hero's next blow taken). Kindled's key carries #16, #20, #24 and the Hooks' Whetted. The `windup` moment carries #42 and #47, one moment and two effects.


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
- A Signature that answers a broken shield with a shield works once a clock (2026-11-28).
- Everything here follows the stacking keys at the end of this doc.

---

# Move Signatures

## Shield

**1. Bannerman's Pavise** · Shield · Drops from: Hask's Ford, Bannerman
Challenge: your party takes 12.5% less damage for 3 s
Best for: Tank
Note: The tank's call steadies the whole line as the pack hits. Works with every Challenge branch (none of them touches armor). (Batch 3, 2026-11-27: a new rule on the same piece and home. The first-blow rule was dropped in batch 2 at 0.8 pace steps. On this set the played tank casts its Challenge about 270 times an hour, so the taunt is a moment it meets every pull. The Shield Priest vow already heals on a taunt and Taunting Guard shields on one, so this rule takes neither. -1.3 (2.7) pace steps on Muster, and Weakened on the taunted -1.0 (1.5). Dark.) (Batch 4 ruling, 2026-11-28, "Batch 3's under rows, ruled": reshaped. Every rule on the taunted monsters read under. The party's Guarded on each Challenge read 9.3 (3.1) at 12.5% for 3 s, 4.8 at 10% and 14.2 at 12.5% for 4 s. It is the Challenge's Signature CC-5 owed. 24 seeds owed for its se before it turns on.)

**2. Ossuary Helm** · Helmet · Drops from: Unmarked Catacombs, Bone Wall
Frost Slam: you gain a shield of 2% of your max health for each monster it Chills (up to 10%)
Best for: Tank
Note: Party only, like Frost Slam. Weaker with Pinning Frost, which hits one monster. If Frost Slam is merged into the Challenge (Cold Challenge, `23` section 4), this moves with it. (Cut 2026-11-26, batch 2: 3% each up to 15% read +15.8 on Muster, over the band.)

**3. Grave Guard's Mail** · Body · Drops from: Krell's Hold, Grave Guard
When a shield you cast breaks, that hero takes 30% less damage for 8 s
Best for: Tank
Note: Works with every Shelter branch. (Reshaped 2026-11-26, batch 2: a readied Challenge read -1.9, since the reference tank casts its Challenge about 9 times an hour.) (Re-worded 2026-11-27: the rule reads every shield the wearer casts, so the words say so.)

## Sword

**4. Charred Saber** · Weapon (sword) · Drops from: Pyre Field, Charred Pikeman
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
Hunter's Mark: your hits on the marked target add a Bleed stack (once every 2 s)
Best for: Ranger
Note: Built for a long fight. The stacks build while the Mark's target lives, so a boss or a brute bleeds and a fast pack barely does. Shares the 5-stack Bleed cap with an axe user. (Re-written 2026-11-26, batch 2: the moved Mark read 0 on five shapes. Clock cut 2026-11-27 from 4 s to 2 s: 4.2 pace steps at 4 s, 9.3 at 2 s.)

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
Greater Mend on a target below half health: also gives 15% damage reduction for 4s
Best for: Healer
Note: For saves, not top-ups. Best with Deep Mending, still useful with the others. (Reshaped 2026-11-26, batch 2: Steady falls back at 25%, so a target under 30% seldom met the heal, and on Bold the Slake's four sits at its top. Under half at -20% read +14.6 on Muster, cut to -15%.)

**18. Brewer's Apron** · Body · Drops from: Carter's Rest, Troll Brewer
Circle of Renewal: each hero it heals deals 10% more damage for 4s (once per cast)
Best for: Healer
Note: A healer that adds damage. With Lasting Circle it starts on the first tick.

**19. Lock-Keeper's Chain** · Necklace · Drops from: The Tower, Hearth Chest (Gold lock)
A hero near fall-back: Spring Tide is ready again (once every 30 s)
Best for: Healer
Note: The big heal comes back when it's needed. Works with every Spring Tide branch, best with Turning Tide. (Batch 3, 2026-11-27: the mana rule was cut in batch 2 and the name changed, since the Tower's Gold lock already holds the Passing-Bell Hammer. 12.0 (2.7) pace steps on Muster, the Slake 3.3 (1.7): in band, the spread holds.)

**20. Greened Bracers** · Gloves · Drops from: The Slake, Greened Pikeman
Green Sickness: your next Greater Mend heals 30% more
Best for: Healer
Note: Offense that pays for heals. Spent on the next Greater Mend, kept 30 s. (Batch 3, 2026-11-27: the mana rule was cut in batch 2. Steeped is Kindled's key, a hero's next cast raised. 7.2 (2.8) pace steps on Muster, the Slake 5.0 (1.6): in band, the spread holds within its se.)

**21. Drover's Hat** · Helmet · Drops from: Ox Road, Drover
Shields you cast return 25% of the damage they absorb to the attacker
Best for: Healer
Note: Puts the ward on the tank and it hits back. (Cut 2026-11-27 from 50%: 19.6 pace steps on Ox Road, over the band. 25% read 9.2.)

(#22 moved to Other Signatures, below. Undertow is cut.)

## Every weapon

**23. Ferry Pennies** · Earrings · Drops from: Hask's Ford, Fordsunk
Mend below 45% health: the next blow of every monster next to you lands at half
Best for: Any
Note: A late escape for any hero. Best with Second Wind. (Reshaped 2026-11-26, batch 2: Chill under 20% read +0.3 (0.7), its Mend under the line about once an hour since Steady falls back at 25%, and Chill under 40% +2.0.)

## Runes

**24. Stoker's Ring** · Ring · Drops from: Pyre Field, Stoker
Ice rune spells: your next Fire rune spell deals 45% more damage
Best for: Mage
Note: Ice then fire. A frost mage's Fireball hits like a truck. (Batch 3, 2026-11-27: played as a second hit of 20% a sub-step later. 0.2 (2.2) pace steps on Muster. The mage's Fire hits seldom find a chilled monster, so the echo is about 0.5% of its damage. Dark.) (Batch 4 ruling, 2026-11-28, "Batch 3's under rows, ruled": reshaped. Stoked is Kindled's key on the three Fire rune spells. 12.5 (5.1) pace steps on Pyre Field, its home, Muster 6.1 (2.4): the spread holds. 60% read 15.6 at home, 30% 4.3 on Muster. 24 seeds owed at home for its se.)

**25. The Cold Candle** · Necklace · Drops from: Keeper Dunn
Your Ice rune spells use no runes
Best for: Mage, Tank
Note: A frost build that never buys Ice runes. A coin piece. (Batch 3, 2026-11-27: "a 30% chance" is every third, so no dice are drawn and the bill is the same on every seed. On the Security list, `13` N-14. On Muster the fight is identical and the four's store bill is 107 coin a hero-hour lower, 2.3%.) (Batch 4 ruling, 2026-11-28, "Batch 3's under rows, ruled": every Ice spell. 25.7 coin steps on the coin bar, 20 +- 6. Every third read 8.6 and every other 12.9.)

**26. Thrower's Ring** · Ring · Drops from: Carter's Rest, Slate Thrower
When a shield you cast breaks, the monster that broke it has its next blow at half
Best for: Tank, Healer, Mage
Note: Works on Shelter, Protective Ward, Arcane Barrier and #2 and #8. (Batch 3, 2026-11-27: "30% of the shield" became 6% of max health, about the same on a Protective Ward. The engine keeps a shell's points left, not its size, and keeping the size would be a new stored field on every hero. 1.1 (2.1) pace steps on Muster: a heal on a four with a healer is overheal. As a 6% shield it ran away, +115.7, since the new shell breaks too, and at once every 30 s a hero it read 1.1. Dark.) (Batch 4 ruling, 2026-11-28, "Batch 3's under rows, ruled": cut and replaced. Protective Ward made ready on a break read 5.5 at a 10 s clock and 4.1 at 6 s. The new rule needs a broken shell's breaker, batch 4's P5.)

**27. Riverstone Earrings** · Earrings · Drops from: Hask's Ford, Banded Pikeman
Water rune heals: you get back 0.5% of your max mana
Best for: Healer
Note: The healer drinks far less. A coin piece. (Batch 3, 2026-11-27: -3.0 (2.1) pace steps on Muster and 51 coin a hero-hour off the four's bill, 1.1%.) (Batch 4 ruling, 2026-11-28, "Batch 3's under rows, ruled": the mana now goes to the wearer, since the hero healed was the tank, who never drinks. 23.7 coin steps. 2% read 88.3 and 0.3% 12.8.)

**28. Vault Leech Ring** · Ring · Drops from: Unmarked Catacombs, Vault Leech
Poison rune spells also Sicken the monster attacking the ally lowest on health
Best for: Healer
Note: Green Sickness is the only Poison rune spell that gives Sickness. The support's Lye spends one too, but it gives Weakened. Best with Single Dose. (Batch 3, 2026-11-27: -1.3 (3.4) pace steps on Muster. Dark.) (Batch 4 ruling, 2026-11-28, "Batch 3's under rows, ruled": cut and replaced. A Sickness that moves on a death pays as the pull thins. The new rule puts it on the threat to the weakest ally, batch 4's P6.)

**29. Fledgling Claw** · Necklace · Drops from: Wyvern Roost, Wyvern Fledgling
Rupture rune spells: Bleed on the target can stack to 6 instead of 5
Best for: Melee, axes
Note: Rend spends a Rupture rune, and Gash will too (wave 3). The cap counts for both. (Batch 3, 2026-11-27: the wearer's own Bleeds land a sixth stack, any other source stops at five. The axe four on Muster played the identical hunt, 0.0 (0.0): its Bleed never stands at five stacks on one monster, so the rule has no moment. Re-read once Gash lays Bleed too. Dark.) (Batch 4 ruling, 2026-11-28, "Batch 3's under rows, ruled": kept, re-read with Gash in batch 5. A second Bleed stack on each Rend read 4.4.)

**30. Raft Builder's Earrings** · Earrings · Drops from: The Tower, Hearth Chest (Silver lock)
Storm rune spells: the mana they return also goes to the party member lowest on mana
Best for: Melee (sword)
Note: Updraft is cut, so Brand (4 mana back on a kill, Sword only when live) is its one Storm spell. Waits until Brand goes live. Re-home it if Brand is cut too.

---

# Other Signatures

## Procs

**31. The Cellar Key** · Necklace · Drops from: Carter's Rest, The Landlord
When a monster hits an ally below 30% health, that ally heals 2% of max health (once every 30 s for each ally)
Best for: Healer
Note: A last-second patch on whoever is about to drop. (Batch 3, 2026-11-27: "on kill, a 20% chance" became every fifth death, anyone's blow. A healer kills little, and a count draws no dice. 0.0 (1.8) pace steps on Muster, and as a 3% party shield 0.2 (2.1). Dark.) (Batch 4 ruling, 2026-11-28, "Batch 3's under rows, ruled": reshaped as a save, rule A. Sized on Carter's Rest, its home, where every heal reads huge: 8% under 40% read 84.2 there and 7.7 on Muster. 16.2 (8.3) at 2% under 30%, inside one se of the band, so 36 seeds are owed before it turns on.)

**32. Ledger Ring** · Ring · Drops from: Hask's Ford, Ledger Wight
Every fifth spell you cast costs no mana
Best for: Mage
Note: A coin piece. A ledger counts. (Batch 4: a spell that costs no mana is a new engine piece, with #37 and #44.) (Batch 4 ruling, 2026-11-28, "Batch 3's under rows, ruled": spells don't crit, so the crit had no moment. A coin piece on the coin bar.)

**33. Teamster's Mitts** · Gloves · Drops from: Ox Road, Dead Teamster
Power Strike on a monster attacking an ally: it turns on you for 4 s
Best for: Melee (sword), Tank
Note: Power Strike's Signature. Pulls one monster off the back row. (Batch 3, 2026-11-27: 4 mana became a share of the pool, so it means the same at every Level. The tank four on Muster played the identical hunt: a tank never drinks, so mana on a kill does nothing. Dark.) (Batch 4 ruling, 2026-11-28, "Batch 3's under rows, ruled": cut. The hammer played the identical hunt too (no melee seat drinks) and the mage read 6.2 coin steps. The piece becomes Power Strike's, which had none. Batch 4's P4.)

## Auras

**34. Sergeant's Sash** · Cape · Drops from: The Slake, Color Sergeant
Party aura: +20% mana regeneration within 8 tiles
Best for: Healer, Mage
Note: Fewer drinks for the whole party.

**35. Gatekeeper's Plate** · Body · Drops from: Krell's Hold, Gatekeeper
Aura: you and allies within 2 tiles take 4% less damage
Best for: Tank
Note: Melee standing next to the tank are covered too. (Batch 4 ruling, 2026-11-28: re-worded onto the aura ledger, batch 4's P1. If a standing cut reads under, it becomes "while you're below half health".) (Batch 4, 2026-11-28, "Batch 4, measured": built as a standing effect in Guarded's key. 8% read 22.0 pace steps, over; CUT to 4%, 8.5 (2.6).)

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
Note: Hask hits harder below a quarter. This ends him first. (Batch 3, 2026-11-27: Emboldened at 1.5 times its row, on every hero of the party, once a boss. Captain Hask is Muster's boss, about 7 kills an hour for the reference four, so the boon runs about 70 s an hour: 2.6 (3.4) pace steps. Its cell is the Captain's own fight, which the harness does not play. Dark.) (Batch 4 ruling, 2026-11-28, "Batch 3's under rows, ruled": kept. A boss Signature is sized on its boss's own fight, rule D, once the harness plays it, batch 4's P8.)

## Loot and economy

**39. Tollman's Gloves** · Gloves · Drops from: Lord Krell
Vs bosses: 10% chance of a second drop roll
Best for: Any
Note: Not on hall prizes or chests. One per party counts. Systems and Security size it before it's built.

**40. Hearth Mason's Cloak** · Cape · Drops from: The Tower, Hearth Chest (Platinum lock)
Once an hour, a hero of your party who would die falls back instead
Best for: Any
Note: The one piece that lets a party push Bold. (Batch 4 ruling, 2026-11-28: cut from +10% remains, 0.6 coin steps COMPUTED. A remains piece big enough to pick would mint the flame's fuel, which is luck. Batch 4's P7.)

**41. Brood Bracers** · Gloves · Drops from: Wyvern Roost, Brood Wyvern
Every fifth arrow that hits costs no arrow
Best for: Ranger
Note: Cuts the arrow bill on long hunts. (Batch 4 ruling, 2026-11-28: a saved shot, never a minted arrow, batch 4's P3. COMPUTED 20.6 coin steps.)

## Utility and unique stats

**42. Night Carter's Boots** · Boots · Drops from: Unmarked Catacombs, Night Carter
When a stalker hits an ally below 45% health, its next blow lands at half
Best for: Healer, any
Note: The cart for the dead comes late. Whoever is nearly down gets a breath. (Batch 3, 2026-11-27: -1.9 (1.8) pace steps on Muster. The pack walks to the tank in its first seconds and Chill slows swings, not steps, so the 3 s are mostly spent before the first blow. Dark.) (Batch 4 ruling, 2026-11-28, "Batch 3's under rows, ruled": reshaped, rule E. Five pull-start shapes read -2.9 to +0.8. 10.9 (2.5) pace steps on Muster worn by the healer, Pyre Field 12.0 (3.6): it fails the spread bar, so batch 4 adds the stalker filter (P9). Under half read 17.5, under 40% 3.1. The data row plays it on every monster until then.)

**43. Bull's Tooth** · Earrings · Drops from: Wyvern Roost, Bull Wyvern
Single-target hits on a brute below 30% health deal double damage
Best for: Ranger, Mage
Note: Finishes the big ones. Area hits don't count. (Batch 3, 2026-11-27: 0.3 (2.5) pace steps on Muster. The bow's carried overkill is about 1% of its damage. Dark.) (Batch 4 ruling, 2026-11-28, "Batch 3's under rows, ruled": reshaped. On every monster it read 9.7 (1.4) on Wyvern Roost and 9.2 (2.3) on Muster, so it fails the spread bar. The brute filter is batch 4's P9. The data row plays it on every monster until then.)

**44. Pyre Priest's Hood** · Helmet · Drops from: Krell's Hold, Pyre Priest
Above 70% health: spells cost health instead of mana (1 health per mana)
Best for: Mage
Note: Risky. Needs a healer or Mend. Keeps Full Wick nearly always on, so the Lab checks the pair.

## Alone

**22. Slake Waders** · Boots · Drops from: The Slake, Mudlark
While you hunt alone: each kill heals you for 4% of your max health
Best for: Any hero hunting alone
Note: Was Undertow's. Undertow is cut and its job is now the alone rule on every weapon's strikes (`23` section 4), so this goes with the rule, not one move. A party never sees it. (Batch 3, 2026-11-27: "alone" is no other hero of its side in the hunt. A lone sword on the Slake read 7.5 (0.8) pace steps, Muster -0.0 (1.5). In band, the spread holds.)

## Pair

**45. Convoy Bell** · Necklace · Drops from: Ox Road, Wagonmaster
With Lead Rein in your party: your heals on its wearer heal 30% more while it is below half health
Best for: Healer

**46. Lead Rein** · Belt · Drops from: Ox Road, Wagonmaster
With Convoy Bell in your party: below half health, you take 15% less damage
Best for: Tank
Note: A healer and a tank who hunt together. Each piece also trades alone. (Batch 4 ruling, 2026-11-28: both reshaped to the danger line, rules A and E. Batch 4's P1.)

---

## Coverage

| Way or seat | Move and rune Signatures | Other Signatures |
|---|---|---|
| Tank (sword and shield) | 1, 2, 3, 4, 5, 25, 26, 33 | 35, 36, 46 |
| Sword alone | 4, 5, 6, 24, 30 | 33, 38 |
| Axes | 7, 29 | |
| Hammer | 8 | 33, 36 |
| Bow or crossbow | 9, 10, 11, 12 | 41, 43 |
| Wand (Mage) | 13, 14, 15, 16, 24, 25 | 32, 34, 44 |
| Staff (Healer) | 17, 18, 19, 20, 21, 27, 28 | 31, 37, 45 |
| Support (wraps) | One per move, in `22-fists-support.md` section 7.1 | |
| Any | 23 | 22 (alone), 40, 42 |

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
| Chill | Frost Slam, Hoarfrost, Chilling Lance, the support's Cold Palm | One Chill on a monster. A new one restarts the time and keeps the stronger slow |
| Silenced (can't start a spell) | #15, the support's Cold Palm | One at a time. Restarts the time |
| Ends a wind-up | Stagger (wave 3) | Its own key. A wind-up ends once |
| Bleed | Rend, Gash (wave 3), the Roads' Bleeding Rake, #9 | One count of stacks per monster, from every source. Cap 5, or 6 on a target hit by #29's wearer |
| Poisoned | Poison (#7, #12) and Sickness | What Traits #30 and #40 read. One Poison a monster, a new one restarts it |
| Blunted (a monster's next blow) | #4, #23, #26, #42 | Its own key: one blow, spent on it, added to Weakened, never replacing it |
| A hero's next cast raised | #16 (Kindled: Fireball, Frost Lance), #20 (Steeped: Greater Mend), #24 (Stoked: the Fire rune spells) | One key: the strongest stack on the hero, spent on the cast it names (batch 3) |
| Armor Break (a monster's armor) | Power Strike's and Stagger's Roads options, a Roads vow | One a monster, the largest counts |
| Damage taken by a hero | Traits that lower damage taken, Guard Strike, Guarding Challenge's rank 15, #1, #3, #17, #35, #46 | Different sources add, held to 30% (Guarded's key, hero_takes_less). The Lab sets one cap for the total. The same party Trait counts once |
| Shields | Shelter, Protective Ward, Arcane Barrier, High Tide, the support's Warm Stone, #2, #8, #36 | One shield per hero. A new one replaces it only if bigger |
| Hero deals more damage | Charged Barrier, #16, #18, #38, damage Traits | Different sources add. The same Signature or party Trait counts once in a party |
| Healing done | Healing Traits, #45, healing branches | Add |
| Mana back | #27, #34, Lasting Ward, Arcane Barrier's refund. A spell that costs no mana (#32, #37, #44) is a cost, not mana back | Add |
| Free casts and cooldown resets | #5, #10, #11, #14, #32 | A free cast or reset can't set off another one |

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
- #4 Charred Saber: the free cast can't chain.
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
