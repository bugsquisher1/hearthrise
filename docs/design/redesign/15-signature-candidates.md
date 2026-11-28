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
| The metric | **Pace steps.** The paired change in held pace (Level XP a hunted hero-hour from hour 4 to the four's end, v1-climb's `payX`), divided by **0.43%**, the pace one held step buys on the reference cells. A shield, a Blunted and a Poison read on one scale |
| The size bar | **10 +- 3 pace steps** on the best cell (+3.0% to +5.6% held pace), 12 seeds x 8 h, its se at most 3 pace steps (1.3% pace). Over 13 is cut in its number, under 7 is raised or reshaped. A reading inside one se of the band with its se over 3 gets more seeds before any number moves |
| The spread bar | Unchanged in kind: the second ground at most half the best, both in pace steps |
| The held delta | Still printed beside it. It says how a row pays (depth or speed), never whether it is in band |
| The conversion | `PACE_STEP_PCT` 0.43 in `tools/balance-program/redesign/signature-depth/sum.mjs`, fit through the origin on the ten readings where a rule moved depth only (Cairn Belt, the Helm at 3% and 2%, the Mail, the Saber's two Blunted shapes, the Pole at -20% and -15%, the Pennies under half and under 45%): pace over held 0.39 to 0.48, fit 0.4335, se 0.0087. A lever, re-fit when `PAY` or `powerStep` moves |
| Coin | Not on the bar. Coin a hero-hour moved with Level XP on every row read (the Hat +8.9% coin, +8.4% pace). A row whose only effect is the supply bill is sized with the market, never on this bar |
| Where batch 3 reads it | Here, and `sum.mjs` (every table prints pace steps and the bars on them). Batch 3's harness copies `batch2.sh` and adds its rows to `sum.mjs` |

**Why pace, not held depth.**

- Held depth is worth what it pays. The Danger scale pays a deeper step more a kill, so a player's reward for depth is pace, the same reward a faster kill gives. The bar now reads the reward, not one of its two roads.
- One scale keeps the pool a choice. On held depth every damage rule read near zero, so the pool would have turned into shields and Blunted, and every build would wear the same few ("Why the whole pool").
- Nothing that read in band moves. Every defensive row reads its held delta within its se on pace (the Helm 10.8 held and 11.7 pace, the Mail 9.3 and 9.4, the Pennies 12.3 and 12.7, the Pole 10.5 and 10.1, the Saber 7.4 and 7.2), since a held step is what the conversion is fit on.
- The luck ceiling is a pace ceiling. A lucky hero is ahead by how much faster it levels. The gear slice's 20 steps is about 8.6% held pace on this scale (`19` "Units" now says why a held step buys 0.43% and not the 0.7% a kill pays).

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

BATCH3_TABLE_OWED

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
Challenge: monsters it taunts lose a quarter of their armor for 6 s
Best for: Tank
Note: The tank calls them off the back row and opens their guard for the party. Works with every Challenge branch (none of them touches armor). (Batch 3, 2026-11-27: a new rule on the same piece and home. The first-blow rule was dropped in batch 2 at 0.8 pace steps. On this set the played tank casts its Challenge about 270 times an hour, so the taunt is a moment it meets every pull. The Shield Priest vow already heals on a taunt and Taunting Guard shields on one, so this rule takes neither.)

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
Fire rune spells vs a chilled target: +20% damage
Best for: Mage, Ranger, Melee (sword)
Note: Ice then fire. Makes a party want both. (Batch 3, 2026-11-27: played as a second hit of 20% a sub-step later. 0.2 (2.2) pace steps on Muster. The mage's Fire hits seldom find a chilled monster, so the echo is about 0.5% of its damage. Dark.)

**25. The Cold Candle** · Necklace · Drops from: Keeper Dunn
Ice rune spells: every third one uses no rune
Best for: Mage, Tank
Note: Fewer runes to buy for a frost build. Sized with the market. (Batch 3, 2026-11-27: "a 30% chance" is every third, so no dice are drawn and the bill is the same on every seed. On the Security list, `13` N-14.)

**26. Thrower's Ring** · Ring · Drops from: Carter's Rest, Slate Thrower
When a shield you cast breaks, its wearer heals 6% of max health
Best for: Tank, Healer, Mage
Note: Works on Shelter, Protective Ward, Arcane Barrier and #2 and #8. (Batch 3, 2026-11-27: "30% of the shield" became 6% of max health, about the same on a Protective Ward. The engine keeps a shell's points left, not its size, and keeping the size would be a new stored field on every hero.)

**27. Riverstone Earrings** · Earrings · Drops from: Hask's Ford, Banded Pikeman
Water rune heals: the hero healed gets mana equal to 10% of the healing
Best for: Healer
Note: Keeps the Mage and the healer going on long hunts. A coin piece: fewer drinks, sized with the market.

**28. Vault Leech Ring** · Ring · Drops from: Unmarked Catacombs, Vault Leech
Poison rune spells: when a monster with their Sickness dies, the Sickness moves to the nearest monster
Best for: Healer
Note: Green Sickness is the only Poison rune spell that gives Sickness. The support's Lye spends one too, but it gives Weakened. Best with Single Dose. (Batch 3, 2026-11-27: -1.3 (3.4) pace steps on Muster. Dark.)

**29. Fledgling Claw** · Necklace · Drops from: Wyvern Roost, Wyvern Fledgling
Rupture rune spells: Bleed on the target can stack to 6 instead of 5
Best for: Melee, axes
Note: Rend spends a Rupture rune, and Gash will too (wave 3). The cap counts for both. (Batch 3, 2026-11-27: the wearer's own Bleeds land a sixth stack, any other source stops at five. The axe four on Muster played the identical hunt, 0.0 (0.0): its Bleed never stands at five stacks on one monster, so the rule has no moment. Re-read once Gash lays Bleed too. Dark.)

**30. Raft Builder's Earrings** · Earrings · Drops from: The Tower, Hearth Chest (Silver lock)
Storm rune spells: the mana they return also goes to the party member lowest on mana
Best for: Melee (sword)
Note: Updraft is cut, so Brand (4 mana back on a kill, Sword only when live) is its one Storm spell. Waits until Brand goes live. Re-home it if Brand is cut too.

---

# Other Signatures

## Procs

**31. The Cellar Key** · Necklace · Drops from: Carter's Rest, The Landlord
Every fifth monster that dies heals your party for 3% of max health
Best for: Healer, any
Note: Best on grounds with big pulls. (Batch 3, 2026-11-27: "on kill, a 20% chance" became every fifth death, anyone's blow. A healer kills little, and a count draws no dice.)

**32. Ledger Ring** · Ring · Drops from: Hask's Ford, Ledger Wight
On crit: your next spell costs no mana (10s cooldown)
Best for: Mage
Note: Wants crit on the rest of the kit. Only weapon hits crit today. (Batch 4: a spell that costs no mana is a new engine piece, with #37 and #44.)

**33. Teamster's Mitts** · Gloves · Drops from: Ox Road, Dead Teamster
On kill: restore 2% of your max mana
Best for: Melee
Note: Fewer drinks on big pulls. A coin piece, sized with the market. (Batch 3, 2026-11-27: 4 mana became a share of the pool, so it means the same at every Level.)

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
Note: Hask hits harder below a quarter. This ends him first. (Batch 3, 2026-11-27: Emboldened at 1.5 times its row, on every hero of the party, once a boss. Captain Hask is Muster's boss, about 7 kills an hour for the reference four, so the boon runs about 70 s an hour: 2.6 (3.4) pace steps. Its cell is the Captain's own fight, which the harness does not play. Dark.)

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
Note: The tank gets set up before the first swing. It lands before Frost Slam or Hoarfrost can, the one moment no other Chill covers. (Batch 3, 2026-11-27: -1.9 (1.8) pace steps on Muster. The pack walks to the tank in its first seconds and Chill slows swings, not steps, so the 3 s are mostly spent before the first blow. Dark.)

**43. Bull's Tooth** · Earrings · Drops from: Wyvern Roost, Bull Wyvern
Single-target hits: overkill damage carries over to the nearest monster
Best for: Ranger, Mage
Note: Big hits stop wasting damage on weak monsters. Area hits don't carry. (Batch 3, 2026-11-27: 0.3 (2.5) pace steps on Muster. The bow's carried overkill is about 1% of its damage. Dark.)

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
| Blunted (a monster's next blow) | #4, #23 | Its own key: one blow, spent on it, added to Weakened, never replacing it |
| Damage taken by a hero | Traits that lower damage taken, Guard Strike, Guarding Challenge's rank 15, #3, #17, #46 | Different sources add, held to 30% (Guarded's key, hero_takes_less). The Lab sets one cap for the total. The same party Trait counts once |
| Shields | Shelter, Protective Ward, Arcane Barrier, High Tide, the support's Warm Stone, #2, #8, #36 | One shield per hero. A new one replaces it only if bigger |
| Hero deals more damage | Charged Barrier, #16, #18, #38, damage Traits | Different sources add. The same Signature or party Trait counts once in a party |
| Healing done | Healing Traits, #45, healing branches | Add |
| Mana back | #19, #20, #27, #33, #34, Lasting Ward, Arcane Barrier's refund | Add |
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
