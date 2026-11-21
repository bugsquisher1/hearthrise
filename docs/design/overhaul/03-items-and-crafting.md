# Hearthrise, the game we are building. Chapter 03: items, gear and crafting

Game designer, 2026-11-21, `lane/d-book-items`. Design of record for this area. No game code, data or migration is touched by this chapter. Nothing was played or measured in this lane. Every measured number below is quoted from the source named beside it and is evidence about the proposed design or about the simulator, never a baseline.

**How to read the status tags.**

- **[RULED date or id]** Tyler decided it.
- **[DECIDED id, Fable 2026-11-21]** the game designer decided the call and an adversarial check corrected it. Its row is in `decisions/all.json`.
- **[DECIDED id, reversal, Tyler may veto]** it changes one of Tyler's rulings. The first tag in the chapter names the ruling. It stands unless he vetoes it.
- **[TYLER CONFIRMS id]** a money call or a grant, with the one recommendation.
- **[CUT (Tyler approves)]** a removal that waits for his yes.
- **[OPEN]** nobody has decided it. The line says what decides it, and gives one recommendation where the chapter has one.

**How to read the number labels.** TARGET is a number the design aims at. COMPUTED is arithmetic on other numbers on the page. MEASURED is a real engine run on a proposed design, with its source. COUNTED is a trial count from a tool. PROPOSED is a design number nobody has measured.

Formula and knob names are the ones in `44-formula-architecture.md` and `tools/balance-program/formulas/knobs.json`.

---

**The status words, re-issued 2026-11-21.** Tyler adopted the critical review (`review/00-critical-review.md`), and the book now uses three honest words. They replace the list above. **DECIDED** means evidence and rulings support it. Where Tyler also said yes on the page, the tag says so. **PROVISIONAL** means a reasonable plan that has not been tested, and the first tag in a chapter names what it waits on. **OPEN** means it waits on Tyler. **RULED** is kept only for what Tyler ruled knowing what it was: his typed words, his own executive decisions, and a pick where he wrote a note, and his answers at the sitting of 2026-11-21, where he saw every option's cost. A quick pick on the page is a real yes and reads "Tyler said yes on the page", never RULED. **PROPOSAL** marks a design made in the fold of 2026-11-21 that Tyler has not seen. CUT and KEPT record his picks on the cut list. The record is `decisions/all.json` and `00-the-game.md`.

## 1. The experience

**Minute 5.** Four heroes each hold a start kit. The first monsters drop coin, a part and a piece of armor. One press wears the better piece. Nothing here asks a question yet, and that is on purpose.

**Hour 20.** Gear falls fast and freely. Every armor slot of a tier arrives in the first hours of its band, and a new tier arrives every few days. The player has set the loot plan once: what is kept, what is sold, what is salvaged for Lucky Rivets. In town the smith has made the first rings and the outfitter the first cloak. One ring came out Fine, and the player paid a Hallmark fee to pick its second perk. The first real question of the item game has been asked: there is not enough gold for both Tempering tracks and six Hallmarks, so which hero gets what. Somewhere on the Glade a named stone dropped with the big reveal, and a smith set it in a ring the hero will still wear at Level 300.

**Day 31, Krell.** The ladder of plain tiers ends. From here a piece is chosen for what it does, not for a bigger number. Krell's sword hits the Undead harder. His bow rewards holding range. The Hearth Chest has paid a Tower weapon that is the best all-rounder, and the question is which one to wear on which ground. A saved kit for each ground remembers the answer.

**Hour 2,000.** The account's Luck bar reads Magic Find 28% or more, and the next percent always costs more. Rares past the Morrow door are truly rare, and each ground has one piece that takes a party about a week to find and is announced to the server. Rings carried since Level 45 have been reforged up every tier and band with their perks intact. The smith at 99 holds patterns from four regions and takes commissions. Gold never runs out of things to buy, and a player who buys gold with Crowns affords more of them, and nothing else.

---

## 2. The design

### 2.1 The six rules and the fourteen slots

| # | Rule | Meaning | Status |
|---|---|---|---|
| 1 | What you fight in drops | Helmet, body, legs, boots, gloves, weapon, shield or spellbook | [RULED 11-18] |
| 2 | What you finish it with is made | Two rings, earrings, necklace, cloak, belt, with chosen perks | [RULED 11-18] |
| 3 | What you use up is made | Food, drinks, arrows, bolts, whetstones, runes. The store sells a weaker copy | [RULED 11-18] |
| 4 | What makes gear better is made | Tempering salts, linings, reforging | [RULED 11-18] |
| 5 | Special pieces are won | Bosses, the Hearth Chest, each ground's Rares, and the shared world of chapter 06 | [RULED 11-18, widened 11-21] |
| 6 | Crafters need hunters, hunters need crafters | Gems, hides, parts, ore and patterns come from hunts. Jewelry, cloaks, belts, linings and salts come from benches | [RULED 11-18] |

| Group | Slots | Count |
|---|---|---|
| Dropped | Helmet, body, legs, boots, gloves, weapon, shield or spellbook | 7 |
| Crafted | Ring, ring, earrings, necklace, cloak, belt | 6 pieces, 12 perk seats |
| Used up | Ammo | 1 |

Standing rules for all gear. No bound gear. Gear is worn by Level only. No set bonuses. No paid re-rolls. Everything a hero can wear trades, except what was bought with Crowns. [RULED 11-14, 11-16, 11-18]

Three armor weights are the one standing choice the plain ladder holds: heavy adds health and absorbs, medium dodges, light adds mana and wards, and mixed sets blend with no penalty. If one weight wins everywhere for a style, the fix is the three guard coefficients (`armorMitigation`), never a rule for one style. [RULED 11-21 formula layer]

### 2.2 The gear curve

**The formula.** The power budget of a piece is linear in the Level it is worn at: `budget(L) = Dawnsteel x L / 110`. The seven plain tiers are samples of that line at Levels 1, 15, 30, 45, 60, 75 and 88. The line lives in `src/data` as a game formula and every item reads it (roadmap step R10, knobs `gearSlope` and `gearBandStep`). The line past 110 with no tier 8 is [RULED 11-16]. The line as a game formula with a tier-wide band is [PROVISIONAL GR-4, waits on one band played on the curve, Tyler said yes on the page, reversal of two bands a region of 2026-11-18 and the Luck step of 2026-11-20, let stand on the page].

**Why linear.** Monster health is linear in Level (`monsterHp`) and so is hero health (`heroHp`). Gear on any other shape drifts against both. MEASURED on the real engine with stand-in gear (study 42): on a gear line that is linear in Level, hunting pace holds from Level 200 to 5,000 with no other change.

**A band is a tier wide.** Past tier 7 an upgrade is a fixed step of the line, never a fixed count of Levels. The step is one knob, `gearBandStep`. It opens at the largest step that still puts a band edge inside every region, which is about 1.17. [PROVISIONAL GR-4, Tyler said yes on the page, reversal, let stand on the page]

| Band, worn from Level | 110 | 129 | 151 | 176 | 206 | 241 | 282 | 330 | 386 |
|---|---|---|---|---|---|---|---|---|---|
| Region it opens in | Morrow Hills | Morrow Hills | Morrow Hills | Catacombs | Region 4 | Region 5 | Region 5 | Region 6 | Region 7 |

COMPUTED from ln(400/110) over ln(1.17): eight bands to Level 400, about one and a half a region. Past 400 the same step continues for as long as Levels do. MEASURED as evidence for the size (study 54, one seed): a +31% weapon step reads +9.4% Level XP an hour for a lone hero, so a +17% band should read about +5%, which is the ruled size of a weapon step, and a +6.5% band would read about +2%. A step of 1.24 (bands at 110, 136, 169, 210, 260, 322 and 400) stays a hypothesis for the one-band play. It leaves the Level 330 to 385 region with no band edge, so it can ship only if region edges move with it. Either step is a HYPOTHESIS until one band is played on the curve. MEASURED since, in `12-balance-pass.md` (local runs L, 2 seeds of 1 hour, and R0): at +17% a weapon step is worth 4.4% at Level 185 and 7.3% at Level 400, against the target of 5 to 8%, so +17% holds for weapons and stays PROVISIONAL. An armor step on the curve is worth nothing past Level 30, because a full mid set holds more armor than the 60% cap can use. The armor curve probe and the arrival kit are one open item and cannot ship apart. Best gear reads about 7% faster than mid gear, not the ruled 15%. Its waits: the playtest death rate, and one full run with the armor probe, the arrival kit and the jewelry share moved together.

**What reads the one band table.** Uniques, chest keys ("one key tier a band"), Tempering ladders ("one ladder a band"), reforging ("up a band"), the sink prices of 2.9 and the reward lines of chapter 06. The table sits in `src/data` beside the curve. [PROVISIONAL GR-4, Tyler said yes on the page, reversal, let stand on the page]

**What a tier or band is worth.** TARGET, from the ruled standards: a weapon step is +5 to 8% hunting performance and an armor step is 3 to 5% less damage [RULED 10-25]. Best gear is about 15% faster and takes about 15% less damage than mid gear [RULED 11-21]. A full set of the best gear takes about one band to Krell, then one to two regions [RULED 11-21].

**Exchange rates.** A unique is not sized by hand. It spends its band's budget at published rates between stats (`gearExchange`, step R11), so its armor or damage is arithmetic. A guard or a skill bonus inside a unique's stat mix is bought at the same rates. [PROVISIONAL GR-4, Tyler said yes on the page, reversal, let stand on the page]

**Slot classes.** Each slot class holds a fixed share of a kit's power at every Level. The six crafted pieces together are one class worth 6% of the kit. Their plain numbers are derived from the curve and never typed for a tier. [RULED GR-3, Tyler 2026-11-21, the sitting8, waits on Deadly sized, and the system built] MEASURED as evidence (study 54): flat typed accessory rows read 15% at Level 30 and 0.5% at Level 400, and one stat point a tier to tier 7 reads +5 to +13% at Level 110, which is twice the budget.

### 2.3 Dropped gear, tiers 1 to 7

| Slot | Source | Pace | Status |
|---|---|---|---|
| Helmet, body, legs, boots | The hourly drop, three weights | About hourly in your weight | [RULED] |
| Gloves | The hourly drop, like the other armor slots, through tier 7. The Catacombs glove wing holds the won pair | About hourly | [DECIDED GR-43, Fable 2026-11-21]. The glove wing is [RULED 11-18] |
| Weapon, eight families | The start kit, then a drop home for every family at every tier. Fist wraps are the eighth family | Scarce or Rare | [RULED 11-18] |
| Shield, spellbook | A drop at every tier | Rare | [RULED 11-18] |
| Belt | Crafted at the workbench (2.6). Not dropped | | [DECIDED GR-43, Fable 2026-11-21] |

- **Generous through Krell.** Every slot's piece of the current tier has dropped inside the first 15% of the band's hours (TARGET, band E2). [RULED 11-20 for the direction]
- **Tier 7 drops like every tier.** Dawnsteel armor is the hourly drop of Krell's Hold. Dawnsteel weapons, the shield and the spellbook are Scarce rows in the Hold. None of the 14 plain pieces is a Rare row, so the Hold's six Rare rows stay free for its named pieces. Krell's prize roll holds only what is won (2.5). [DECIDED GR-29 and CE-6, Fable 2026-11-21] MEASURED as evidence (study 54): a lone hero without his tier's weapon hunts about 9% slower through the whole band.
- **One sale rule.** A tier's hourly gear sells to the Shop for a fixed share of that tier's coin, a quarter [RULED 23-10], computed by one sale formula that also works past tier 7 (`saleStep`, step R17) [DECIDED GR-87, Fable 2026-11-21].
- **Drops are written in hours.** A row says "every 10 to 20 hours" and the chance a kill is derived (`bandHours`, step R18). [DECIDED GR-87, Fable 2026-11-21]
- **The start kit replaces the first rung.** The curve's generator skips a tier 1 rung the start kit already holds. [DECIDED GR-85, Tyler said yes on the page 2026-11-21]

### 2.4 Rare rows, the Very Rare and the reveal

| Band | Pace | Moved by Magic Find | The moment | Status |
|---|---|---|---|---|
| Common, Uncommon | Every kill to every few minutes | No | None | [RULED] |
| Scarce (the hourly gear drop) | About hourly | No | None | [RULED] |
| Rare | Each row every 10 to 20 hunted hours a hero, quoted at Magic Find 0 | Yes, in full | The big reveal, on every Rare | [RULED 27-6] |
| Very Rare, through Krell | Every 60 to 90 hunted hours a hero. An account's four finds one every 1.3 to 1.9 days (COMPUTED) | Yes, in full | The big reveal, a line to the whole server, a card to share | [RULED 30-3] |
| Very Rare, past Krell | Every 60 to 90 hours of a four hunting together, about one a week for an account | Yes, in full | The same | [RULED 30-3] |
| Trophy | Every 100 to 150 hours. Never faster than every 100 at any Luck | Yes, on its own low ceiling (2.11) | The big reveal | [RULED 10-19] |

**At most six Rare rows for each ground.** The reveal is ruled to fire on every Rare, so the count of rows is what keeps it a moment. With six rows a hero sees a reveal every two to three hours and a four about every 40 minutes (COMPUTED). Ladder pieces of the next tier are Scarce rows on the next ground, never Rare rows on this one. [DECIDED GR-42, Fable 2026-11-21]

**The step at the Morrow door.** Through Krell's Hold every Rare rate is generous. At Level 110 every Rare row past the door drops 15% less often at Magic Find 0, and the cut grows to 25% at Level 400. A player should feel the door. Trophy rows, the hourly drop, keys, fuels below Rare, coin and XP are never cut. [RULED 11-20]. Keyed by Level with the same end points, in place of a band count [PROVISIONAL GR-4, Tyler said yes on the page, reversal, let stand on the page].

**A ground played above its band.** A scaled or risen ground drops its own rows at its own rarity. Its lining parts still drop. Past tier 7 its hourly drop is stock and chips. The Morrow cut is read at the band the loot is paid at. [PROVISIONAL GR-9, waits on the playtest or measurement its own row names]

### 2.5 Special pieces, signature stones and uniques

**At tier 7 and below: the standard piece plus one attribute.** A special piece is the plain piece of its slot and tier with one attribute from the full list: element guard, physical guard, steady, crit, bane, plus skill. They are sprinkled through every tier, cheap to make and short lived. [RULED 11-14]

The three special pieces and the three stones are the first rare finds a hero keeps, and every later rare item is sized on them. [PROVISIONAL GR-40, waits on the kill reward and the tiers, because the seat's multiple is not one number until then]

| Piece | Ground | Attribute | Status |
|---|---|---|---|
| Widow's Fang, a sword | The Sewer | Crits 6% more | [PROVISIONAL GR-40] |
| Mudlark's Mitts, gloves | The Slake | Ranged counts 2 higher | [PROVISIONAL GR-40] |
| Demoncaller | The Pyre Field | 10% harder on the Undead | [PROVISIONAL GR-40] |
| Krell's Tollgate, the Banded Legguards | Krell's Hall | Physical guard on the legs | [RULED 11-14] |

**Signature stones.** Each ground's Very Rare through Krell is a named stone. A smith sets it in a plain or Fine piece in place of the tier's gem. The piece then always carries the stone's perk, which the bench cannot roll. The stone is used up. The piece reforges up and keeps the perk, so the find lasts for the life of the hero. A stone's perk sits in the same perk budget and counts once a hero. Sample first: the Glade, the Warrens and the Slake, three stones, played before any more. [PROVISIONAL GR-40]

| Step | The player holds and can reach | Needs |
|---|---|---|
| 1. A hero hunts the Glade | The ground's drop rows | A Very Rare band and one row on the ground's named carrier |
| 2. The stone drops | The server's reveal for Rare and Trophy bands | The new band joins the reveal list |
| 3. In town with the stone and a plain Banded Signet | The bench reads the bag, then Storage. Smithing 15 makes the signet | Nothing new |
| 4. The Smithing bench offers "Set (stone) in a Banded Signet" | The guarantee job that sets the Crown Shard | The stone's guarantee row |
| 5. The job runs | A Fine or Hallmarked ring with the stone's perk fixed | The perk's hook, if the perk is new |
| 6. At Level 30 the hero reforges the ring up | The reforge offer into a Seam Jasper Band | The same offer for each later tier (2.6) |

This walk-through is quoted from study 54, which checked each step against the game's data. It was not re-walked in this lane. The three stones' names and perks are [OPEN]: nobody has written them.

**Past tier 7: uniques.** Standard gear ends at about Level 128. From there the hourly drop is crafting stock (the region's ore, hide and cloth) and gem chips [RULED 11-18]. A unique sits inside its band's budget, has its own stat mix and exactly one property, wins somewhere and gives something up [RULED 11-14, 11-16]. The line is a ceiling and never a template.

- **A unique reforges up a band and keeps its property. Each new band also gets uniques of its own.** [RULED 11-21, 31-4]
- **A region brings 15 to 20 new uniques**, not a full grid of new ones, because carried pieces fill the rest. [RULED A-3, 31-4]
- **A duplicate unique feeds that unique's Tempering past tier 7.** [RULED 23-4]
- **One of a ground's uniques is its Very Rare:** the top of the band's budget with the property the ground is known for. It cannot be salvaged for rivets. It is worn or sold. [RULED 11-20]

**The property list past tier 7.** The one property is a kind that changes a decision. [DECIDED GR-41, Fable 2026-11-21]

| Property | What it does | Slots | Sample size (PROPOSED) |
|---|---|---|---|
| Bane | Hits one monster class harder | Weapon | 10% |
| Crit | More critical basic blows | Weapon | 6 to 10% |
| Spell change | One named ability hits harder, comes back sooner or costs less | Weapon, spellbook, helmet, gloves | +15% damage, or 15% less cooldown, or 20% less mana |
| Element edge | A share of the weapon's basic damage lands as an element | Weapon | 20% |
| Second socket | The piece takes two linings | Armor, weapon | |
| Thorns | Whatever hits you takes a share back | Shield | 8% |
| Sweet spot | A bow hits harder at one exact distance | Bow, crossbow | +8% at distance 5 |

Guards and plus skill may still be part of a unique's stat mix, bought from its budget at the exchange rates, and are never its property past tier 7. Guarding against a ground's element is the job of linings. Status ward (a chill or sickness on you ends sooner) is on the later list. A new kind needs its engine hook, as one row on the modifier table of step R20, and a measured sample before any piece carries it. Spell change is the first hook built, because it is the only one that gives a caster's weapon a property that measures. One property a piece. Two only on late chest pieces. [RULED 11-18 for the catalogue, REC GR-41 for the split by tier]

**Krell's five, the sample every later unique is cut from.** [DECIDED GR-29, GR-40, Fable 2026-11-21, with GR-40 PROVISIONAL]. PROPOSED sizes, unmeasured.

| Krell's piece | Property | Wins | Loses to the Gold Tower weapon |
|---|---|---|---|
| His sword | Bane: the Undead, 10% | The Ox Road, the Night Shift, the Catacombs | On living things, by about the skill bonus |
| His warhammer | Bane: Humanoids, 10% | Carter's Rest, Krell's Hold | On the Undead |
| His bow | Sweet spot: +8% at distance 5 | A hero who can hold range. Most bosses | When the pack closes in |
| His wand | Spell change: Fireball +15% | Big pulls on Dangerous and Deadly | On single targets |
| His staff | Spell change: Greater Mend costs 20% less | A healer in a four | Hunting alone |

**The sidegrade rule.** [RULED 11-18]

| Kind | What it is | Best where |
|---|---|---|
| Chest weapon | The plain numbers of the next step up plus +1 to +4 of its skill | Everywhere a little. The best all-rounder |
| Boss or ground unique | Its own stat mix inside the band's budget, no skill bonus, one property | Clearly best in the case its property is for. Slightly behind elsewhere |

**A hall's prize holds only what no ground drops:** the boss's uniques, the region's gem, a Trophy and a first-win piece. One key is one prize roll, and a mid-region boss's pieces stay repeatable because a hero can spend every key it finds. [DECIDED GR-28, GR-29, Fable 2026-11-21, reversal of 2026-11-14 and 22-8, let stand on the page, with GR-28 PROVISIONAL, waits on the hall check at three Levels and one boss stood, Tyler said yes on the page]. Krell's gem stays on his roll, because the tier 7 Hallmark is built on it. Captain Hask, the Provost and Lord Krell each carry a Trophy row. [DECIDED GR-29, Fable 2026-11-21]

**Quivers.** A bow fills both hands. Past tier 7 a quiver may be a region's wildcard unique: an off-hand piece only a bow wears, with a property about its shots. Its worth comes out of the band's budget for that bow. It is a dropped unique, and the workbench makes what goes in it. [RULED 11-18]

**The ground template past tier 7.** Five monsters, the fifth an elite. [RULED 11-18 for the shape, REC GR-42 and GR-33 for the counts]

| Rows | How many | Band |
|---|---|---|
| Bones or a Hearth fuel | One a monster | Common |
| Crafting stock: region ore, hide, cloth | One region table, named once by every ground in the region | Common and hourly |
| The monster's own part (the lining part) | Five | Uncommon |
| Gem chips | The same region table | About hourly |
| New uniques | Two or three | Rare |
| The ground's Very Rare unique | One | Very Rare |
| A pattern | One | Rare |
| A whole gem on every second ground, or a named Hearth fuel | One | Rare |
| A Trophy | Boss grounds | 100 to 150 h |

That is six Rare rows. Region tables are an authoring shape only: a pack compiles to the flat rows the engine rolls, and the Hunts page still shows a plain percent a kill. A ground then adds about 15 new rows.

**Region coverage rules.** Every weapon family appears at least twice in a region, counting carried pieces reforged up. No final boss piece counts as a family's first appearance. The 15 armor cells plus shield and spellbook are coverable inside the region. No ground is best at everything. Every region has equal First Flame and Last Ember grounds. A region is six grounds, opened as four and a hall, then two, and the region's last two grounds carry three weapons each. [RULED 11-18 for the rules, REC GR-33 for the opening order]

**The check before a ground is reported.** Every unique is inside the budget by the exchange rates, the region's cells and families are still coverable, every part has a use, and a hero in the last band's gear can hunt the ground on Normal.

### 2.6 Crafted gear: jewelry, cloaks and belts to tier 7

**Who makes what.** [RULED 11-18]

| Skill | Worn pieces | Also |
|---|---|---|
| Smithing | All jewelry: rings, earrings, necklaces. Buckles, clasps, chains | Bars, tools, whetstones, salts, reforging metal pieces |
| Crafting, the outfitter | Cloaks and belts | Planks, all ammunition, linings, reforging hide, cloth and wood pieces |

**The rules.**

| Rule | Value | Status |
|---|---|---|
| Grades | Plain, Fine (one perk), Hallmarked (two) | [RULED] |
| Base job | Mostly Plain. Fine 5% at skill 15 to 12% at 99 | [RULED] |
| Gem job | A plain piece and a gem. Never Plain. Hallmarked 10% at 15 to 25% at 99 | [RULED] |
| Hallmark step | A Fine piece, a gem and the fee. The player picks the second perk. Nothing fails | [RULED] |
| Hallmark skill level | The next tier's skill level: 30, 45, 60, 75, 88, 99 | [RULED 11-18] |
| Gems | One gem a tier. It works in any slot and forces no perk | [RULED 11-18] |
| Each perk counts once a hero | The larger worn | [RULED] |
| Plain stats | Help all three styles, and come from the curve as a 6% share | [RULED GR-3, Tyler 2026-11-21, the sitting8] |
| Re-rolls for gold | Never | [RULED] |
| Trade | Everything | [RULED] |
| The Shop sells plain jewelry | At ten times a crafter's cost, as a fallback that never undercuts a crafter | [RULED] |

**The ladder.** Jewelry and cloaks are built to tier 7, tier 4 first as the played sample, then tiers 5 to 7 [RULED GR-3, Tyler 2026-11-21, the sitting8]. Hallmark fees for tiers 4 to 7 are [RULED 11-18]. Under GR-8 every fee is a share of the band's gold and these numbers are the anchor points.

| Tier, Level | Metal | Gem and its carrier | Hallmark fee, each | Reforge to this tier, each | Shop ceiling, Fine / Hallmarked |
|---|---|---|---|---|---|
| 2, 15 | Bronze | Road Carnelian, the Turncoat | 25,000 | | 100k / 300k |
| 3, 30 | Steel | Seam Jasper, a Warrens Rare | 100,000 | 75,000 | 300k / 1M |
| 4, 45 | Gold | A new gem, the Slake's Color Sergeant | 150,000 | 50,000 | 10x the fee |
| 5, 60 | Rune | Ruby, Captain Hask | 250,000 | 100,000 | 10x |
| 6, 75 | Emberforged | A new gem, the Provost | 400,000 | 150,000 | 10x |
| 7, 88 | Dawnsteel | Krell's gem, on his daily roll | 600,000 | 200,000 | 10x |

Cloak and belt materials are common drops: pelts, Bear Pelt, Silk Thread and coal tar, Grave Dust-cured cloth, Wraith Veil and Razor Claw, Troll Hide. Tier 6 and tier 7 Hallmarks also use up a Sealing Rune (2.10). [DECIDED GR-45, Fable 2026-11-21]

**Pieces with a place.** [RULED 11-18 placement, read by the catalogue lane before anything is removed]

| Piece | Place |
|---|---|
| Copper Ring, Copper Studs, Bronze Buckle, Graypelt Cloak | Tier 1 |
| Fang Studs, Wolfbone Necklace, Banded Signet, Houndskin Cloak (Crafting 15) | Tier 2 |
| Seam Jasper Band, Warband Bulwark | Tier 3 |
| Gold Ring, Gold Amulet | Tier 4 plain ring and necklace |
| Ruby Signet, Rubyfire Studs, Barrowking Mantle | Tier 5 |
| Wraithglass Drops, Spellstone Ring | Tier 6 |
| Dawnforged Signet, Dawnbound Amulet, Dawnlit Mantle, Trollhide Cape | Tier 7 |
| Hollow Sigil Ring, Panther's Eye Pendant | Pattern pieces, names kept |
| Dragon Gem Earrings, Wyrmgilt Mantle | Past tier 7 |
| Tusker Charm | Old Tusker's champion relic. Not on the crafted ladder |
| Packlord Band, Spider-Eye Studs, Mirewort Drops, Spidersilk Choker, Warlord's Torc, Jarl's Rimetorc, Woolen Cloak, Alpha Cloak, Shadowsilk Cape, Chitinweave Cloak | No place in the plan. On the one cut list that goes to Tyler first [RULED 11-21] |

**The perk pool: 23 perks for 12 seats.** The pool grows with tier, so upper tiers hold perks a carried piece cannot have without a swap. [RULED 11-18 for the pool, 11-20 for Lucky]

| Slot | From tier 2 | Added at tier 4 | Added at tier 6 |
|---|---|---|---|
| Ring | Keen, Follow-through, Surge, Thrift, Lucky | Opener: your first blow on a fresh monster hits harder | Finisher: more damage under a quarter health |
| Earrings | Steady: basic blows miss less. Focus: mana back on a kill | Echo: your heals and shields are stronger | Giantsbane: more damage to a ground's boss |
| Necklace | Deflect: a blow is turned aside. Second Wind: health back on a kill | Reserve: more max mana | Vigor: more max health |
| Cloak | Slip: the first blow of a pull at you misses. Stride: you walk faster between pulls | Windbreak: less damage from ranged blows | Thick: less damage from marked heavy hits |
| Belt | Hearty: food heals more. Quench: drinks restore more | Brace: less damage under 30% health | Stockpile: some food and drink costs nothing |

Cloaks carry no element perks. Elements belong to linings. A fully Hallmarked hero plays 12 of 23.

**Perk sizes.** [RULED GR-3, Tyler 2026-11-21, the sitting9, Tyler said yes on the page, reversal of 23-5, let stand on the page]

| Rule | Value | Label |
|---|---|---|
| All perks on twelve seats, on a hero whose perks do not match the ground | About 4% XP | [PROVISIONAL 23-5], read on the mismatched hero [RULED GR-39, Tyler said yes on the page, reversal, let stand on the page] |
| Always-on perks: Keen, Follow-through | 4, 6, 7, 8, 9, 10% at tiers 2 to 7 | Tiers 2 and 3 measured. Tiers 4 to 7 PROPOSED |
| Always-on perk: Surge | 6.7, 10, 11.5, 13, 14.5, 16% at tiers 2 to 7. Never sized up while it reaches heals | PROPOSED past tier 3 |
| A perk with a narrow case (Opener, Finisher, Giantsbane, Windbreak, Thick, Brace, Slip) | Starts at about 5% in its case, three to four times an always-on perk. Never over five times | TARGET |
| A hero whose twelve seats all match the ground | At most one weapon step, 9% XP | TARGET, a guard line |
| Past tier 7 | Sizes stop. New regions bring new perks | [RULED 11-18] |

MEASURED as evidence (study 54, one seed): every perk at five times reads +9 to +11% Level XP for a lone hero, and a four takes 20 to 29% less damage through Surge on heals. So five times is the ceiling, and Surge stays small. The case is a "when" column on the one modifier table (step R20).

**Gems and chips.** [RULED 11-18 for the design, REC GR-38 to ship with the tier 4 sample]

| Rule | Value |
|---|---|
| Need | Six pieces carried up use 6 gems a band. A fresh Hallmark uses 1 more |
| Whole gem | A Rare on its carrier |
| Chips | Drop from every monster on the tier's grounds. 10 chips make a gem at the forge |
| Chip pace | Authored in hours: chips alone give a gem about every band-hours divided by 8 (TARGET) |
| Old Rare prizes | Alpha Fang, Rook's Whistle and Crown Shard each cut into one gem of their tier. War Crown is left out because the House uses it. The Crown Shard keeps its second use: set in a Banded Signet in place of the Road Carnelian it guarantees Follow-through |

**Jewel reforging.** A reforge carries a crafted piece up a tier, and into each band past tier 7. It takes the new tier's metal, the new tier's gem, the new tier's Hallmark skill level and the fee difference. Nothing rolls and nothing fails. It may swap one perk for a perk of the new tier's pool, which is how a carried piece reaches the tier 4 and tier 6 perks. [RULED 11-18]. Without the new tier's gem and skill the best play would be to Hallmark once at tier 2 and carry it for life.

| Step | What the player sees |
|---|---|
| 1 | The bench has a Reforge tab. Smithing lists rings, earrings and necklaces. Crafting lists cloaks and belts |
| 2 | Every crafted piece you hold that has a next tier, with an arrow to what it becomes |
| 3 | Two cards side by side, now and after, with changed numbers marked. "Perks stay. Keen 4% becomes 6%." Under it: "Keep both perks" or "Swap one" |
| 4 | One cost line: "6 Steel Bars (you have 9), 1 Seam Jasper (you have 1), 75,000 gp. Requires Smithing 45. Worn from Level 30." A missing part is named |
| 5 | Press Reforge. The old piece is used up and the new one is worn if it was worn and your Level allows |

**The Fine order.** One standing order at the bench: "Make until Fine with one of these perks, salvage the rest, stop after this many bars." Salvaging a plain crafted piece returns half its metal and no XP. Chasing a first perk is one decision, never sixty presses, and it cannot be farmed for XP. [RULED GR-3, Tyler 2026-11-21, the sitting8]

**Lucky.** The seventh ring perk. See 2.11.

### 2.7 Patterns, commissions and the game after 99

**Patterns.** Every worn recipe past tier 7 is a pattern, a Rare drop. Patterns ship with the Morrow Hills. A pattern teaches the account, so four heroes never learn one recipe four times. [RULED 11-18 for patterns, REC GR-44 for the account and the timing]

| Recipe | Count | How it unlocks |
|---|---|---|
| Ring, earrings, necklace, cloak | 4 | A pattern each, from a ground |
| Belt, all three weights | 3 recipes, 1 pattern | From a ground |
| A named boss piece | 1 | A pattern from the region's final boss |
| A named piece from the mid-region boss | 1 | A pattern from that boss |
| The region's top lining or feast | 1 | A pattern from the sixth ground |
| **Pattern recipes** | **10 recipes, 8 patterns a region** | |
| The region's bar, buckle, clasp, chain | 4 | Staple |
| Salt | 1 | Staple |
| Arrows, bolts, whetstone | 3 | Staple |
| Stitched, Corded, Sealed linings for the region's parts | 3 | Staple |
| Food and drink | 2 | Staple |

A staple opens for the hero at 99 who brings that region's ore or hide to a bench. For the Morrow Hills: Carter's Rest the belt (the Landlord's Apron), the Ox Road the ring, the Night Shift the earrings, Wyvern Roost the cloak, the Old Guard the necklace, the Bellows the top lining, the Roost Mother her named piece, Father Gault the Bellows Key Ring. The one pattern that exists before the Morrow Hills is Kingsgrate Rivets, a Rat King Rare that unlocks the Steelgrate reforge.

**After 99: 99 is the license.** [RULED 11-18]

| Layer | How |
|---|---|
| Patterns | Every worn recipe past tier 7 |
| Staples | Open by region material |
| Region materials | Only from that region's kills and nodes |
| Maker's mark | Make a set number of a region's pieces and the account's Fine chance for that region rises a little, capped |
| Reforging | Carries Hallmarked work into the next band |

**Commissions.** One board, two kinds of job, one set of safety rules. [RULED 11-18 for the design]

| Kind | Rule | Ships | Status |
|---|---|---|---|
| A single job | One Hallmark or one reforge on a piece the owner keeps. The owner posts the piece, materials, gem, fee and a tip, and picks the perk. The server holds all of it. Any crafter with the skill presses Complete and earns the craft XP and the tip. The piece goes back to the owner | With jewelry tiers 5 to 7 | [DECIDED GR-44, Fable 2026-11-21] |
| A bulk order | Many of one staple. The owner posts inputs and a price a craft. Several crafters can work it at once as their bench job. Each earns the XP and the price for the units they made. Everything made, unused inputs and unspent pay return to the owner | When the market moves goods | [DECIDED GR-44, Fable 2026-11-21] |

Safety for both: server-owned and journalled, a time limit on every job, a job resolves once, a daily limit an account, the bench fee applies, and nothing a crafter does can take the owner's piece or inputs. It is a money surface and passes the Security review. Single jobs must exist before a four leaves Krell's band, because a tier 7 reforge needs Smithing 99 and a player who never crafts must be able to buy crafted power [RULED 11-21].

### 2.8 Making gear better: Tempering, linings and curing

**Tempering.** Gold and salts, two tracks (Blows and Armor), five rungs a track, one ladder a tier and one a band past tier 7. It sits on the hero. It is the one plain place where gold buys percent. [RULED]

| Rule | Value | Status |
|---|---|---|
| Going up a tier | Tempering carries up and costs only the difference | [RULED 11-20, 23-2] |
| Past tier 7 | A rung takes a duplicate of the unique | [RULED 23-4] |
| Rung size | One line by gear Level. TARGET 2 to 3% a track past tier 6 | [PROVISIONAL GR-8, waits on the store-bill fault fixed and a wage formula that exists, Tyler said yes on the page, reversal of the typed prices kept on 2026-11-18, let stand on the page] |
| Rung prices | Double each step, so the last rung is half the track | [RULED] |
| Salts | One a tier, 310 a track, made at the forge. The workbench makes them too until linings ship | [RULED 11-05 that Tempering needs a crafter, REC GR-43 for the workbench] |
| Price | A share of the band's gold (2.9) | [PROVISIONAL GR-8, Tyler said yes on the page, reversal, let stand on the page] |

MEASURED as evidence (the item plan, a lone hero): a full Blows track reads +3 to +4.7% XP and a full Armor track 2 to 10% less damage.

**Linings.** A crafted lining fitted into a piece of worn gear. The first repeating sink that buys power, and the answer to a ground's element.

| Rule | Value | Status |
|---|---|---|
| Made from | One monster part plus gold, at the workbench. Nothing else | [RULED 11-18] |
| Sockets | Standard gear has one. A unique may have two, as its property | PROPOSED |
| Which kinds fit where | Element guards in armor and shields. Leech in weapons and off-hands | PROPOSED |
| Element guard | Stitched 20%, Corded 25%, Sealed 30% less of fire, ice, poison, necrotic or storm. Each element capped at 40% with worn pieces | [RULED 10-18 cap]. Strengths never grow with region |
| Necrotic guard | Lowers the necrotic damage and the healing cut by the same percent | PROPOSED |
| Storm guard | Lowers the storm damage and the mana burned by the same percent | PROPOSED |
| Life leech, mana leech | A share of your damage comes back as health or mana. Life leech is cut by Withered like any healing | PROPOSED, unmeasured |
| How long one lasts | 12 hours of hunting, counted only in a hunt with the piece worn | [RULED 11-18] |
| Stacking | Another lining of the same kind and grade adds 12 hours, to a cap of 48 hours | [RULED 11-18] |
| A different kind or grade | Replaces what is there after a confirm that says how many hours are lost | PROPOSED |
| Taking the piece off | The hours wait | PROPOSED |
| Running out in a hunt | The hunt goes on without it | PROPOSED |
| Fitting | Always works | [RULED] |
| Each kind counts once a hero | The strongest worn | [RULED 10-15] |
| Trade | A lining trades until fitted. A piece with hours in it cannot trade until they run out or the lining is taken out for a fee | [RULED 10-15] |
| Cost | A share of the band's gold: 12 hours of one lining costs about a tenth of what 12 hours of hunting earns there | TARGET [PROVISIONAL GR-8, Tyler said yes on the page, reversal, let stand on the page] |
| Crit linings | None. Crit belongs to Keen and to weapon properties | [RULED 11-18] |

On screen: the item card reads "Fire guard, Stitched. 31 h left (max 48 h)". The button reads "Fit: +12 h", or "Full. Fits at 36 h or less". Hunt prep and the end card warn under 2 hours. One press in town, "Top up linings", fits what the bag and Storage hold after showing what it will use, and buys nothing. A standing order, "keep these linings up", makes the top up a decision made once. [DECIDED GR-47, GR-48, Fable 2026-11-21]

Linings by region. A region names the wall element on each ground and supplies the part. Barrow March: fire. Morrow Hills: fire at Carter's Rest, Wyvern Roost and the Bellows, necrotic on the Ox Road (the Ox Shoe), poison on the Night Shift, ice and storm on the Old Guard. Catacombs: necrotic (the Owing Tag), poison and ice. Region 5: storm. Later regions hold at least two elements each, and a ground's wall never matches its faction pair's. Linings never ask for parts from earlier grounds, and scaled hunts keep old parts dropping. [RULED 11-18]. The 30 imbuement parts are the lining parts, one for each ground. [DECIDED GR-43, Fable 2026-11-21]

Spell leech and lining leech are measured together before either is sized. Together they stay under the fist line's own heal budget. [OPEN: decided by that measurement, a test line on the linings and spell lanes]

**Curing.** A room slot in the House where a lining or a batch of salts cures while the hero is away hunting. It is a gold sink by ruling. [RULED 11-18, 26-7]

| Rule | Value | Status |
|---|---|---|
| Where | The Cellar. The account's House, so every hero shares the slots | [RULED 26-7] |
| Slots | 250,000, then 750,000, then 2,000,000 | [RULED 26-7] |
| Time | 4 hours a lining, on the server clock. No skill XP | [RULED 26-7] |
| What can cure | Linings and Tempering salts only | PROPOSED |
| Each cure | A gold fee on top of the materials, about a tenth of the item's reference value | PROPOSED |
| Skill | The recipe's skill level is still required | PROPOSED |
| When | Built last in the lining work, as a standing order | [DECIDED GR-47, Fable 2026-11-21] |

**Named reforging.** Kingsgrate to Steelgrate, and Klappa's Klub, which is never cut. [RULED 11-18]

### 2.9 Gear costs more than a band earns, on purpose

Tyler, 11-18: "I actually dont want everyone to be able to easily unlock everything and upgrade everything. otherwise its not really a gold sink it's just a natural line of progression. I want people to make choices on what is important to them, so each character isn't exactly the same." [RULED 11-18]

How the game makes money: Premium, and Crowns that players sell to other players for gold. Every progression path is fully reachable without paying. The gold sinks are where bought gold becomes an edge. Power is never sold for Crowns directly. Bought gold has no limit on how much sooner, only on what can be bought. [RULED 11-18, 11-21]

**The formula.** Every standing sink in this chapter (Tempering, Hallmark and reforge fees, linings) is a share of the band's gold (`sinkShare`, step R16). The shares are sized so that everything in a band costs 1.0 to 1.4 times what the band banks (TARGET, band E4), on a hero who pays only the difference at every tier, and on an account of four heroes with one purse. The ruled Hallmark fees are the anchor points the shares must land near. A share of band gold holds at every Level and survives any change to how long a band lasts. [PROVISIONAL GR-8, Tyler said yes on the page, reversal, let stand on the page]

COMPUTED as evidence for the rider (study 47, from the item plan's own estimates): if Tempering paid the difference while its prices stayed typed, a careful hero would pay 0.5 to 0.9 of a band's gold at tiers 4 to 6.

**The choices it forces.** TARGET shape at tier 4, with the anchor prices.

| Choice | What it buys | Price at tier 4 |
|---|---|---|
| Tempering, Blows, 5 of 5 | About +3 to 4% Level XP an hour | A full track |
| Tempering, Armor, 5 of 5 | About 4 to 6% less damage | A full track |
| Stop a track at rung 3 | About three fifths of the gain for under a quarter of the gold | |
| Carry all six pieces up | Twelve perks at the new tier's size | 6 x the reforge fee |
| Carry three, let three fall behind | Half the set stays up to date | 3 x the reforge fee |
| A fresh Hallmark for one of the new tier's perks | A perk a carried piece cannot have without a swap | The tier's fee |
| Keep a guard lining up | 20 to 30% less of one element | A tenth of 12 hours of income |
| Keep a leech lining up | Sustain without food | The same |

Two heroes at Level 60 with the same gold end up different. The hammer who wants kills fills Blows, carries all six pieces and keeps a leech lining. The tank who wants to live fills Armor, carries three pieces, buys one fresh tier 4 perk and keeps a guard and a leech lining. The purse is shared by the account, so the player also decides which of four heroes gets the gold. Every one of these can be bought later.

**Early sinks.** With all four heroes free from day 1, gold needs something to buy in the first week. Linings and the first Tempering ladder are the first repeating sinks, sized on an account of four. [PROVISIONAL GR-8, Tyler said yes on the page, reversal, let stand on the page]. The order is [PROVISIONAL CE-4] and the sizes are [PROVISIONAL CE-5, Tyler said yes on the page, reversal of the gold numbers of 26-3 and 26-1, let stand on the page], a HYPOTHESIS, in chapter 04.

**Gold in, gold out, and trade.**

| Gold in | Gold out |
|---|---|
| Coin, loot sold, Tamsin's tasks | Hallmark and reforge fees, Tempering, lining fees, chest reforging, the Lucky job |
| Crafted goods at the Shop's floor price | Commission fees, the bench fee, curing, and the sinks of `04-economy-and-crowns.md` |
| Good batch on food (small) | Salvage, which removes gold that would have been made by selling |

| Trades | Does not |
|---|---|
| All gear, chest pieces, crafted pieces, Lucky rings, gems, chips, stones, patterns, materials, unfitted linings | Chest keys (Storage only), fitted linings, Lucky Rivets, the Luck bar, anything bought with Crowns |

**Reference values and the no-mint guard.** A tool works out a value for every item from its drop rows, kill rates and recipes. One guard proves that no chain of craft, salvage, good batch or commission ends in more Shop gold than went in, and that rivets never exceed what the account's own hunts dropped. Salvage, good batch and commissions do not ship without it. It also feeds the market's suggested price. [RULED 11-18 for the design, REC GR-46 and GR-44 as the gate]

**One market book for each piece.** The Weighhouse shows one book a piece, with grade and perks as filters, so jewelry tiers 4 to 7 do not become about 400 thin books. Standing orders are placed on that one book. [PROVISIONAL GR-50, in `04-economy-and-crowns.md`]

### 2.10 The crafting professions

Crafting in Hearthrise is a supply chain. It is what the 12 rested hours are for [RULED 11-21: heroes work in town for all 12 rested hours]. Crafting is a quarter to a half of the step from mid gear to best gear, and a player who never crafts can buy it [RULED 11-21].

**The ladders, 1 to 99.**

| Band | Smithing | Crafting, the outfitter | Cooking | Runecrafting |
|---|---|---|---|---|
| 1 to 14 | Bars, whetstones, tools, Klappa's Klub. Copper Ring, Copper Studs, Bronze Buckle | Planks, bronze arrows, Graypelt Cloak | Shrimp, herring, turnip | Blank and Chalked runes |
| 15 to 29 | Tier 2 rings, earrings and necklace. Iron, salts, fittings | Tier 2 cloak and belt. Arrows, bolts. Stitched linings | Trout, bread, juices | Scored. Storm runes at 25 |
| 30 to 44 | Tier 3. Hallmark tier 2. Steelgrate. Chest reforging | Tier 3. Hallmark tier 2 | Lobster, soup | Etched. Bone runes at 40 |
| 45 to 59 | Tier 4, gold. Hallmark tier 3 | Tier 4. Hallmark tier 3. Corded linings | Swordfish, stews | Carved |
| 60 to 74 | Tier 5. Hallmark tier 4 | Tier 5. Hallmark tier 4 | Shark, pies | Graven |
| 75 to 87 | Tier 6. Hallmark tier 5 | Tier 6. Hallmark tier 5. Sealed linings | Frostfin, Ember Tart | Sealing Rune at 75, for tier 6 Hallmarks. A sixth rune tier at 75 |
| 88 to 99 | Tier 7. Hallmark tier 6 at 88, tier 7 at 99 | The same | Moonfish, Moonbloom Elixir | Sealing Rune at 88, for tier 7 Hallmarks. A seventh rune tier at 90. Good batch tops out |

Statuses: Storm and Bone runes at Runecrafting 25 and 40 [RULED 11-21]. Five rune tiers one every 15 levels [RULED 10-23]. The Sealing Rune in two grades [DECIDED GR-45, Fable 2026-11-21]. Rune tiers past skill 60 arrive with the endless-mode step R22 (`runeStep`) [PROVISIONAL GR-23].

**Every recipe family.**

| Family | Bench | The design | Status |
|---|---|---|---|
| Smelting, sawmill, blanks | Smithing, Crafting | Intermediates, the currency of the benches | [RULED] |
| Tools | Smithing | The gear every gatherer crafts | [RULED] |
| Whetstones | Smithing | The one supply only a crafter makes | [RULED] |
| Tempering salts | Smithing. The workbench copy leaves in the release that ships linings | One a tier | [DECIDED GR-43, Fable 2026-11-21] |
| Jewelry, gem jobs, Hallmarks, jewel reforging | Smithing | 2.6 | [RULED GR-3, Tyler 2026-11-21, the sitting8] |
| Cloaks, belts | Crafting | 2.6. Belts use buckles from the forge | [DECIDED GR-43, Fable 2026-11-21] |
| Arrows and bolts | Crafting | Every tier. The row says what a job saves against the store | [DECIDED GR-43, Fable 2026-11-21] |
| Linings | Crafting | 2.8 | [RULED 11-18] |
| Quiver fill | Crafting | When quivers arrive | [RULED 11-18] |
| Heal food | Cooking | One ladder of about 8 foods. Wolf, panther and bear meat become party meal ingredients. Heal size grows with hero health | [DECIDED GR-52, Fable 2026-11-21, in `04-economy-and-crowns.md`] |
| Drinks | Cooking, from the farm | The drink ladder | [RULED] |
| Party meals | Cooking | Four party meals. No food gives a drop buff or an XP buff | [RULED 23-6, 11-20] |
| Runes | Runecrafting | Seven shown families and Bone, with a store copy bought by the cast | [RULED 10-23, 11-18] |
| Sealing Rune | Runecrafting | Above | [DECIDED GR-45, Fable 2026-11-21] |
| Named reforges | Smithing | Klappa's Klub, the Steelgrate | [RULED] |
| Chest reforging | Smithing or Crafting by material | 2.12 | [RULED 22-3] |
| Lucky ring job | Smithing | 2.11 | [RULED 11-20] |
| Castle goods | Both | Keep their prices. Only the Keystone and the Timber Beam are fixed. The castle itself is chapter 06 | [RULED 11-21, 31-3] |
| Inner Flame fuels | Drops | `05-progression.md` | |
| Burnt food | Cooking | A by-product whose chance is a data row | [DECIDED GR-85, Tyler said yes on the page 2026-11-21] |
| Cook Panther Meat, Void Banquet | Cooking | Hidden until an input has a source | [RULED 11-21: nothing planned is cut] |

**Good batch.** A consumable job sometimes makes double: 2% at level 1 to 10% at 99. All yield bonuses together cap at 15%. It makes every level between two unlocks worth something. [RULED 11-18, 26-2]

**Gathering.** Woodcutting, Mining, Fishing and Farming supply every input and are designed in `07-home-and-town.md`. This chapter needs from them the region's ore or wood node on two grounds of every region.

**A hero's day.** A hero hunts up to 12 hours and does one thing in town for the other 12: gather, bench, or train. At Level 10 a hero smiths a Copper Ring and sews a Graypelt Cloak, the first pieces no hunt drops. At Level 40 the town makes salts, a tier 3 set, a lining and a first reforge. At Level 70 it reforges the set to tier 5, makes Corded linings and does a chest reforge. At Level 100 it finishes tier 7 with Krell's gem at skill 99, makes Sealed linings and takes commissions. Best in slot for 6 of 14 slots is only ever made. TARGET for the best path: it asks for 6 to 12 of the 12 rested hours (band T7).

### 2.11 Luck v3.1: the bar, the rivets and the Lucky ring

[RULED 11-20 for the design. RULED 11-21 that the bar keeps its hours: +16% at 500 hours, +39% at 5,000.]

**Pitch.** Your account has one Luck bar that only fills. Salvage gear your hunts dropped instead of selling it and you get Lucky Rivets. Put them on the bar, or have a smith work them into a Lucky ring. Reach a Bestiary stage and the bar fills too. Every time it fills, Magic Find goes up 1% and the next percent costs more. Magic Find makes Rare drops come more often, on every ground, for every hero you have. Nothing sells the bar.

**The formula.**

| | |
|---|---|
| Luck | One total an account. Raise-only. Lucky Rivets used plus Bestiary Luck. One rivet is one Luck |
| Magic Find | Whole percents. The account holds percent n once Luck reaches 100 x (1 + 4 + 9 + ... + n x n). Percent n costs 100 x n x n |
| A hero's Magic Find | The account's percent plus the Lucky ring that hero wears |
| On a Rare or Very Rare row | Chance x (1 + Magic Find / 100) |
| On a Trophy row | Chance x (1 + 0.25 x MF / (MF + 25)). It never reaches +25%, so a Trophy never comes faster than every 100 hours |
| Far stop | The bar stops at 100, at 33.84 million Luck. With the best ring a hero holds 104 at most |
| Never moved by Luck | Commons, Uncommons, Scarce gear, keys, chips, a hall's prize roll, the Hearth Chest, Hearthfinds, coin, XP |
| In a party | The roll uses the average Magic Find of the heroes there |
| Two feeds and no more | Rivets used and Bestiary stages. No Luck food, lining, unique property, event, Premium perk or store item |

| Magic Find | This percent costs | Luck so far | A 10 h Rare comes every | A 125 h Trophy comes every |
|---|---|---|---|---|
| 1 | 100 | 100 | 9.9 h | 124 h |
| 5 | 2,500 | 5,500 | 9.5 h | 120 h |
| 10 | 10,000 | 38,500 | 9.1 h | 117 h |
| 20 | 40,000 | 287,000 | 8.3 h | 113 h |
| 30 | 90,000 | 945,500 | 7.7 h | 110 h |
| 50 | 250,000 | 4.29M | 6.7 h | 107 h |
| 100 | 1,000,000 | 33.84M | 5.0 h | 104 h |

COMPUTED from the formula. Eight times the Luck is twice the Magic Find, which keeps four heroes from being four times as lucky.

**Lucky Rivets.** When a piece is broken down, the last rivet out of it is kept for luck. One stackable item, account-bound: no trade, no listing, no Shop price, no mail. Storage moves it between your own heroes.

| Piece | Tier 1 | 2 | 3 | 4 | 5 | 6 | 7 | Unique past tier 7 |
|---|---|---|---|---|---|---|---|---|
| Standard | 2 | 4 | 6 | 8 | 10 | 12 | 14 | |
| Rare | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 400 at Level 110, rising in a straight line to 900 at Level 400 |

The unique's rivets are keyed by its worn Level with the plan's end points [PROVISIONAL GR-4, Tyler said yes on the page, reversal, let stand on the page]. Two Luck a tier keeps the price of Luck flat at every tier, so no tier is the cheap one to farm. A Very Rare unique pays no rivets. The rivet has its own line in the loot plan: Use (goes on the bar at Dispatch), Keep or Deposit. Nobody clicks a stack every trip.

**The Bestiary's stages.** Counts are per account, one count a kill whichever heroes were there. Luck is paid once, straight onto the bar. [RULED 11-20]

| Account kills of one creature | 100 | 500 | 2,500 | 10,000 | 40,000 | 160,000 |
|---|---|---|---|---|---|---|
| Luck | 50 | 150 | 500 | 1,500 | 5,000 | 15,000 |

**The Lucky ring.** It ships with the Morrow Hills, when uniques give Magic Find something to multiply. [RULED 11-20, 30-4]

| Rule | Value |
|---|---|
| What it is | Lucky, the seventh ring perk. It adds Magic Find to the hero wearing it. It counts once a hero |
| Size by tier 2 to 7 | +1 / +2 / +2 / +3 / +3 / +4% |
| Made two ways | By chance, as a roll on any ring job. For sure, with the Lucky job: a Plain ring of the tier, rivets and the fee make a Fine ring with Lucky. Nothing fails |
| Rivets burned | 500 x tier x tier: 2,000 / 4,500 / 8,000 / 12,500 / 18,000 / 24,500 |
| Fee | The tier's Hallmark fee |
| Second perk | The normal Hallmark step |
| Trade | Like all jewelry. "Luck rings can be sold" |
| Salvaging one | Stock only. No rivets come back |
| Going up a tier | A fresh job, or a reforge that pays the new tier's rivets |
| Not on dropped gear | Luck is not a unique property |

COMPUTED floor for a maker (rivets at 13 to 15 gold of gear not sold, plus the fee): about 55k at tier 2 to 950k at tier 7.

**The safeguard.**

| Rule | Value |
|---|---|
| The allowance | Salvage pays rivets on at most as many of an item as the account's own hunts have dropped, kept by the server per account and item |
| What adds to found | Only a hunt's settle, when it pays a gear piece to one of the account's heroes |
| What does not | Bought, traded, crafted, store, chest, hall, boss and arena pieces. They still salvage for stock, with no rivets |
| The invariant | Rivets an account has ever held can never be more than its own hunts' pieces would pay. Gold and Crowns can swap which copy you salvage. They cannot raise the total |
| The amount | The server reads rivets from its own table. The client sends an item and a count, never an amount |
| Deleting a hero | Never lowers Luck, kills or found |
| Stamina refills and Premium | They buy hunting time, and time earns Luck the way it earns XP. Nothing buys Luck itself |

**On screen.** The sheet reads "Magic Find +16%" over the bar "Luck 12,400 / 28,900". The loot plan shows Keep / Deposit / Sell / Salvage with "12 Lucky Rivets" beside Salvage and "173 gp" beside Sell, and one switch, "Salvage all standard gear". A piece past the allowance reads "No rivets: bought or crafted". Dispatch reads "Salvaged 41. 492 Lucky Rivets. Used 492: +492 Luck". The return card reads "Magic Find 15% to 16%". A Bestiary stage reads "Stage 3: +500 Luck". A Rare that Magic Find caused is tagged "Lucky find" on the reveal.

**What it costs.** MEASURED on the proposed design (the item plan's played lives, real engine): gear is about a fifth of a hero's coin and sold loot, so salvaging everything gives up about a fifth of hunting gold. That makes salvage a real choice and a real sink. A lone player who salvages everything reaches Magic Find 16 at 500 hours and 39 at 5,000. One who sells everything reaches 8 and 13 on Bestiary stages alone. A four in one hunt reaches 27 at 500 hours. These runs predate the to-hit and spell rules and are re-measured before the lane ships.

**The cuts that go with it.** The class charm ladder and its four dead functions are removed, because Luck is the Bestiary's reward. The four foods' drop buffs are removed, because a drop buff on a food is gold turned into drop rate. [RULED 11-20]

### 2.12 Salvage as a choice

| Rule | Value | Status |
|---|---|---|
| What it is | Any gear breaks down into a fixed result. Nothing is rolled. No skill XP | [RULED 11-18] |
| Where the choice is made | A line on the loot plan beside Keep, Deposit and Sell, set once for an item or a kind, then applied on Dispatch. Both numbers are shown | [DECIDED GR-46, Fable 2026-11-21] |
| Never the default | The Shop keeps its ruled price. A starting loot plan exists, so nobody meets a wall of dropdowns | [DECIDED GR-46, Fable 2026-11-21] |
| Yields | Dropped gear: Lucky Rivets, inside the allowance. A plain crafted piece: half its metal. Past tier 7: a standard piece gives its region's stock and a unique gives gem chips | [RULED 11-18, 11-20] |
| Guard | A piece's salvage is never worth more than the Shop pays for it, by the reference-value guard | [DECIDED GR-46, Fable 2026-11-21] |
| A saved kit is safe | The loot plan never sells or salvages a piece that is in any saved kit | [DECIDED GR-48, Fable 2026-11-21] |

MEASURED as evidence for keeping it a choice (study 60): 15% less gold coming in made 40 gold bands worse on the matrix. Read what real players pick before asking again.

### 2.13 Chest gear

| Chest line | Gives | Keys | Status |
|---|---|---|---|
| The Tower | Weapons, one a family a key tier | Bronze, Silver, Gold, Platinum at landings 10, 40, 70, 100. Then one key tier a band | [RULED]. The Tower stays weekly [RULED GR-3, Tyler 2026-11-21, the sitting7] |
| Catacombs, Bone Wing | Leans helmets | The same tiers | [RULED 11-16]. One wing and one key built first [RULED GR-3, Tyler 2026-11-21, the sitting6] |
| Catacombs, Flooded Wing | Leans boots | The same | [RULED 11-16] |
| Catacombs, glove wing | Gloves 70%, helmets and boots 15% each. Twelve rows | The same family, the same 6 opens | [RULED 11-18 for a glove path]. PROPOSED rows |

Rules. Chest gear stays rare. It is never bound. A chest weapon is the next tier's weapon, or the next band's budget, plus a flat +1 to +4 of its skill [RULED 11-14, 11-18, 22-2, REC GR-26]. The weekly limit is six opens a hero a week and it stays [RULED 11-21]. The chest ignores Luck. Warmth adds 4% of base for each dry key up to three times base, and a stoke multiplies by 1.7 for three keys' worth of Cinders [RULED].

| Dial | Levels 15 to 110 | 110 to 200 | 200 to 300 | 300 to 400 |
|---|---|---|---|---|
| Power | The next tier's numbers plus skill | The next band's budget plus skill | The same | The same |
| Base chance | 16 / 8 / 4.5 / 2% | 2% | 2% | 2% |
| Two-attribute share of paid pieces | None | None | 1 in 4 | Half |
| Fusing | | | Yes | Yes |

[RULED 11-18]. Fusing: two one-attribute pieces of the same band, one of them the kind you want, plus one open, make the two-attribute piece. COUNTED over 20,000 trials a cell: any piece 4 weeks at the median, your piece 7, your two-attribute piece 8 to 9 by fusing, all under 20 weeks at the 90th percentile.

**Chest reforging.** Its own action. The piece, 6 keys of the next tier, that tier's metal or hide, gold and one of the weekly opens make the next tier's piece with the same attribute. It is what makes an early chest piece the start of a line you carry. [RULED 22-3, 11-18, REC GR-49]

**What weapon drops are still for.** The other families, every hero before a first chest piece, the market, and the boss uniques that beat the chest weapon in their own case.

### 2.14 The saved kit and the find list

- **Setups, and what a ground remembers.** A hero has three free Setup slots, then two more at 15,000 and 40,000 gold (RULED, GR-56a, Tyler 2026-11-21, the sitting). Each ground remembers one Setup, by pointing to one of the hero's slots. Pointing is free and has no limit, and many grounds can point to the same Setup (PROVISIONAL (CH11-3, `11-on-call-and-clan-xp.md`), section 10). A Setup holds the weapon, the worn set, the linings, the unique, the bar and the target mode. It is saved once, starting a hunt there wears it, and it can be copied to another hero or ground. The saved kit and the bar setup are the same thing, so the weak-side weapon is never a chore (GR-84). It lands before case-sized perks or linings ship, because each of them asks a hero to change gear when the party moves, four heroes at a time. [DECIDED GR-48, Fable 2026-11-21]
- **A find list for each ground.** The ground's page lists its named pieces. The first time an account finds each one it is ticked with no press. It shows on the Honors page and pays no Luck. [DECIDED GR-48, Fable 2026-11-21]

### 2.15 Systems kept for later

Nothing planned is cut. Each is built later and stays hidden until it works. [RULED 11-21]

| System | The design, kept | Waits on |
|---|---|---|
| Stirred grounds | Each hour the server marks a few open grounds. Their elites are a little tougher and drop extra chips. The same for every party size | Chips, and a reading against the ground weekend of chapter 06 |
| Weekly orders | Tamsin posts orders for drops and crafted staples. They pay chips and salts, never gold or gear. No wanted and unwanted lists [RULED 11-18] | Chips and the market |
| Bulk commissions | 2.7 | The market |
| The maker's mark | 2.7 | The first region past Krell |
| Status ward property | 2.5 | Monster spells that use statuses as a wall |
| Two-attribute chest pieces and fusing | 2.13 | Region 4 |

### 2.16 Gear from the shared world (chapter 06)

Chapter 06 pays in buffs and gear [RULED 11-21]. This chapter owns how that gear fits the curve. The ten rules below are the design. [PROVISIONAL CE-1]

**The collision.** Study 49 gives each world boss and the Open arena a named, tradeable gear line at the best-in-slot budget of the earner's band, plus an upgrade material used by the band's sinks. This chapter says every piece is a spend of the gear curve (GR-4), a prize holds only what no ground drops (GR-29), and a region brings 15 to 20 new uniques (31-4). Read loosely, the layer would add a second pile of best-in-slot pieces to every band and make ground uniques the lesser chase.

**The decision: layer gear is unique gear, under every rule of 2.5, on rows that carry no band.** [PROVISIONAL CE-1, with MM-6 and MM-14]

| # | Rule | Why |
|---|---|---|
| 1 | **A layer piece is a unique.** Its own stat mix inside its band's budget at the exchange rates, one property from the seven decision kinds, no skill bonus. "Best in slot budget" means the same budget every unique of that band spends, never a higher one | One formula. A boss piece is a sidegrade to a ground unique and to the chest weapon, clearly best in its own case |
| 2 | **A layer line is written once and has no band.** A line row holds a slot, a stat mix as shares and a property. Its numbers are derived from the curve at the band of the hero who earned it. It reforges up a band like any unique | It adds zero rows a band and zero rows a region. The curve does the work |
| 3 | **Layer pieces sit outside a region's count and outside its coverage.** A region's 15 to 20 new uniques and its coverage rules are met with no layer piece. A player who never fights a world boss or an arena misses no slot and no weapon family | The plan's counts stand. The layer is a second road to a best piece, never the only road to a filled slot |
| 4 | **One property, one source.** GR-29 widened to every prize: a layer line carries a property instance no ground, hall or chest carries in that band. For example, if Krell's sword is bane on the Undead, no boss line is | The prize holds only what nothing else gives, so no source makes another a trap |
| 5 | **Small lines.** A line is at most five pieces. A world boss line is four, one a style (MM-6). The Open arena line is five pieces and its properties are the ones a fight between parties rewards (thorns, a spell change on a shield or heal). TARGET: at most four boss lines in rotation and one arena line, so at most 21 line rows in the game | A list a player can learn. PROPOSED counts |
| 6 | **Rarity on the Very Rare clock.** TARGET: an account that fights every boss weekend earns a piece of a line about as often as a four finds a ground's Very Rare, one in about a week of play, and its own style's piece in about a month. An arena line pays one piece a season at the tier reached. An account earns at most one line piece a boss weekend. The fall bonus re-rolls which piece it is and never adds a second (MM-6) | A layer piece is as rare as the rarest ground piece, never rarer by an order and never common |
| 7 | **The layer's upgrade material feeds only the layer's own pieces.** It stands in for a duplicate when tempering a boss or arena piece past tier 7 and when reforging one up a band. It is never a required input for plain Tempering, Hallmarks or linings | Linings are ruled as one part and gold. A player who skips the layer must never be locked out of a ruled sink |
| 8 | **It trades, and it pays no rivets.** A layer piece is not found by a hunt's settle, so it is outside the rivet allowance | No bound gear. The Luck safeguard holds |
| 9 | **Luck never moves a layer reward, and a layer buff never moves a Rare row.** The timed buff is material find (+10%, CE-2). It adds to rows tagged as materials: monster parts, lining parts, hides, ore, gem chips and gems below Rare. It never touches a Rare, Very Rare or Trophy row, a gear row of any rarity, a key or a seed. A ground weekend's featured row is a separate event row (MM-42) | Magic Find is ruled at two feeds and 104 a hero. A drop buff on Rares would be a third feed |
| 10 | **The ceiling is the ruled one.** A hero in a full set of layer gear is a best-geared hero: about 15% faster and 15% less damage than mid gear, and no more | The gear state bands hold with or without the layer |

**The strongest alternative.** Layer lines one band above the earner, as true best in slot. It makes the layer the only late chase, breaks "skips nothing", and gives bought gold a piece play cannot match. Not taken.

**What chapter 06 must take from this.** Its power budget counts layer gear as "best in slot for the band", which this decision keeps true. Its Crowns engine needs the pieces to trade, which they do. Its drop buff needs rule 9.

---

## 3. How it connects

| This chapter | Reads from | Feeds |
|---|---|---|
| The gear curve and bands | The Level law and pace contract (progression chapter). The monster and hero formulas (combat chapter) | The kill reward, which needs the curve first (progression chapter). Every reward line of chapter 06. The reference hero of the balance matrix |
| Dropped gear and Rare rows | Grounds, regions, halls and keys (world chapter). The loot bands and drops in hours | The Shop's sale rule and gold in (economy chapter). The reveal and the return card (features chapter) |
| Uniques and properties | The modifier table and spell list (combat chapter). Regions (world chapter) | The market's scarce goods (economy chapter). Talents, which own the "two heroes, two different swords" purpose that worn in had (`10-level-choices.md`, which supersedes GR-61). E7, the Add pool, does not read Talents. The 2% set aside for worn in and then for Kindlings is unspent. Still to check: Tempering's Blows track against the 20% permanent damage cap with Force beside it |
| Jewelry, perks, stones | Gems and chips from grounds. Smithing and Crafting levels | Hallmark fees as a live sink. The saved kit. The one market book (economy chapter) |
| Tempering, linings, curing | Band gold and the wage curve (economy chapter). Elements, Withered and group spells (combat chapter). The Cellar (town and home chapter) | The standing sinks of every band. The whale's edge of the Crowns engine (chapter 06) |
| Luck | Kills and settles. The Bestiary | Rare, Very Rare and Trophy rows. The Honors page (progression chapter) |
| Crafting professions | Gathering and farming (town and home chapter). Rune families and the fist line's rune use (combat chapter) | Supplies for every hunt. Clan castle goods (chapter 06) |
| Chest gear | The Tower and the Catacombs as modes (world chapter) | Chest weapons as the all-rounder. Keys in Storage |
| Layer gear | World bosses, events and the Open arena (chapter 06) | The same curve, Tempering and reforging as any unique |

Necrotic and Storm, their sixteen spells and the fist line's two rows are designed in `01-core-and-combat.md`. This chapter holds their item side: Storm and Bone runes, the two guard linings, the lining parts, and fist wraps as the eighth dropped family at every tier with Tower rows.

---

## 4. The calls in this chapter, as decided

In decision-book order.

| Id | The call | The decision | Status |
|---|---|---|---|
| GR-85 | Formula clean-up steps that move no number | Approve. Here: the start kit replaces a tier 1 rung, burnt food's chance is a data row | DECIDED. Tyler said yes on the page 2026-11-21 |
| GR-4 | A gear curve as a game formula | Linear in Level. Past tier 7 a band is a fixed step that opens at about +17% (110, 129, 151, 176, 206, 241, 282, 330, 386). Uniques are a spend of their band. The two Luck numbers are keyed by Level | PROVISIONAL. Waits on one band played on the curve. Tyler said yes on the page 2026-11-21. It changes The item plan section 2 (two bands a region, 2026-11-18), a major upgrade every 15 to 25 Levels (2026-10-25), the Luck step of 2026-11-20, which he let stand on the page |
| GR-8 | Sinks as a share of band gold | Tempering, Hallmarks and linings cost a share of a band's gold, 1.2 to 1.4 of what the band earns. The slot gold follows the order of CE-4 first, then the castle | PROVISIONAL. Waits on the store-bill fault fixed and a wage formula that exists. Tyler said yes on the page 2026-11-21. It changes The typed prices kept on 2026-11-18 (Hallmarks 150k, 250k, 400k, 600k), which he let stand on the page |
| GR-28 | One boss door | Every boss that pays a prize is a keyed hall. One key is one prize roll. "Fight with N keys" is one press and stops at the first death | PROVISIONAL. Waits on the hall check at three Levels and one boss stood. Tyler said yes on the page 2026-11-21. It changes 2026-11-14 and 22-8 of 2026-11-20, which he let stand on the page |
| GR-29 | A hall's prize holds only what no ground drops | Approve: plain Dawnsteel onto the Hold's loot bands, Krell's five and his gem on the roll, three Trophy rows | DECIDED (Fable 2026-11-21) |
| GR-40 | Three special pieces and three signature stones | Approve as the sample | PROVISIONAL. Waits on the kill reward and the tiers, because the seat's multiple is not one number until then |
| GR-9 | An old ground at your Level, one drop rule | Approve the drop rule of 2.4 | PROVISIONAL. Waits on the playtest or measurement its own row names |
| GR-23 | Rune tiers continue past skill 60 | Approve, with step R22 | PROVISIONAL. Waits on the kill reward and the tiers, because the seat's multiple is not one number until then |
| GR-26 | Chest weapons keep flat plus skill | Approve | DECIDED (Fable 2026-11-21) |
| GR-33 | A region is six grounds, opened four then two | Approve. The coverage rules assume it | PROVISIONAL. Waits on the kill reward and the tiers, because the seat's multiple is not one number until then |
| GR-36, GR-37 | Catacombs stay a mode, one wing first. The Tower stays weekly | Approve | PROVISIONAL. Waits on Deadly sized, and the system built |
| GR-38 | Jewelry and cloaks to tier 7, plain numbers a 6% share | Approve, tier 4 and chips first | PROVISIONAL. Waits on Deadly sized, and the system built |
| GR-39 | Narrow perks sized for their case | Approve: about 5% in the case, never over five times, a matched hero at most 9% | PROVISIONAL. Waits on Deadly sized, and the system built. Tyler said yes on the page 2026-11-21. It changes 23-5 of 2026-11-20, which he let stand on the page |
| GR-44 | Patterns teach the account. Single commissions with tiers 5 to 7 | Approve, behind the no-mint guard and Security | DECIDED (Fable 2026-11-21) |
| GR-41 | Seven decision kinds past tier 7 | Approve | DECIDED (Fable 2026-11-21) |
| GR-42 | At most six Rare rows a ground | Approve | DECIDED (Fable 2026-11-21) |
| GR-43 | The Crafting bench is the outfitter | Approve: belts to the bench, gloves hourly, workbench salts leave with linings | DECIDED (Fable 2026-11-21). Cut list 10, Tyler said yes to the cut on the page 2026-11-21. |
| GR-45 | A Sealing Rune at Runecrafting 75 and 88 | Approve | DECIDED (Fable 2026-11-21) |
| GR-46 | Salvage is a choice beside Sell | Approve, behind the no-mint guard | DECIDED (Fable 2026-11-21) |
| GR-47 | Curing built last, as a standing order | Approve | DECIDED (Fable 2026-11-21). Cut list 11, Tyler said yes to the cut on the page 2026-11-21. |
| GR-48 | Luck keeps two feeds. A find list and a saved kit | Two feeds for Luck, a find list on the Honors page, and one remembered Setup for each ground, which holds weapon, worn set, linings, bar and target mode | DECIDED (Fable 2026-11-21) |
| GR-49 | Chest reforging stays its own action | Approve | DECIDED (Fable 2026-11-21) |
| GR-87 | Drops in hours, one sale formula | Approve | DECIDED (Fable 2026-11-21) |
| MM-6, MM-14 | World boss pay and arena rewards | The ten rules of 2.16 (CE-1). At most one line piece a boss weekend and one an arena season. The fall bonus re-rolls the piece. The Even Arena pays material find. HYPOTHESIS for the fall bonus | MM-6: PROVISIONAL. Waits on the hall check at three Levels and one boss stood. MM-14: PROVISIONAL. Waits on the engine test of heroes against heroes |

---

**Cuts in this chapter.** CUT (Tyler said yes on the page 2026-11-21), cut list 10: the Crafting bench's three salt recipes (GR-43). Salts stay on the other bench, and the recipes leave in the lane that ships linings.

## 5. Still missing

| # | Missing | Who or what decides it |
|---|---|---|
| 1 | The exchange rates themselves (`gearExchange`) and the slot-class shares other than the 6% for accessories | Roadmap step R11, on the matrix |
| 2 | Whether +17% reads as one upgrade when played on the curve, with +24% as the second cell | One band played. It is the first thing the R10 derivation prints |
| 3 | What it costs to reforge a unique up a band: materials, gold, whether a duplicate or a key is needed | The game designer, inside GR-4 and GR-8, before the build plan |
| 4 | The Tempering ladder for tier 7 and for each band, as shares | GR-8, then a matrix run on gold bands |
| 5 | What the first week's gold buys, and early prices sized on four heroes | Closed. CE-4 gives the order and CE-5 the sizes, as a HYPOTHESIS |
| 6 | The three signature stones: names, perks and carriers. The tier 4 and tier 6 gem names | The designer, with names checked against the data. Sample of three first |
| 7 | 18 of the 23 perks have no engine hook and no measured size. No cell measures one perk in and out of its own case | The first job of the perk lane |
| 8 | Leech lining sizes, and spell leech with lining leech together | One measurement |
| 9 | The Morrow Hills grid re-cut from 46 uniques to 15 to 20 with carried pieces. The staged placement (hammer and sword at Carter's Rest, axes and crossbow on the Ox Road, fists and wand on the Night Shift, bow and staff at Wyvern Roost and on the Roost Mother, three each on the Old Guard and the Bellows, none on Father Gault) is the starting point | The region lane, after R10 and R11 |
| 10 | Chip pace in hours for each tier on the 12 hour clock | With the tier 4 sample |
| 11 | Reference values and the no-mint guard have no owner lane | The build plan |
| 12 | The uniques for the Catacombs ground at Levels 165 to 185 | The region lane |
| 13 | How a perk is stored on a held piece, so one market book can filter by it | A schema call for the systems engineer |
| 14 | The saved kit's server shape and cost | The systems engineer |
| 15 | Layer gear: boss count, line sizes, pace and the material's recipe uses | Closed. CE-1: at most four boss lines and one arena line, at most five pieces a line, one piece a boss weekend and one an arena season, and the material feeds only layer pieces |
| 16 | What one Premium gives. It must never sell Luck | Closed. Tyler said yes on the page (PREM-1). It never sells Luck |
| 17 | Rolls, tradeable gems and tradeable patterns in the Steam and legal review | The security engineer, in the one review before Early Access |
| 18 | Whether the three armor weights are a live choice for each style | The matrix lane, one run of heavy, medium and light on three styles |
| 19 | Regions 4 to 7: elements, key rows, named content | The region sketches |

---

## 6. How we will know it works

**Matrix bands this chapter is judged on** (study 50). Every band stays in report mode until the instrument's open faults close (study 51). A four's pace can carry a decision. Gold and survival are direction only.

| Band | Target | What in this chapter moves it |
|---|---|---|
| E1 | A major upgrade is +5 to 8% for a weapon, 3 to 5% less damage for armor | The band step |
| E2 | Every slot's piece inside the first 15% of a band's hours through Krell, 35% after | Gloves hourly, belts crafted, Dawnsteel on the bands |
| E3 | Low to mid gear costs under 10% of the band's net gold | The Shop and the hourly drop |
| E4 | Mid to best gear costs 100 to 140% of the band's net gold | `sinkShare` |
| E5 | The median wait for a piece with no weekly limit is under half the band through Krell, under the whole band after | Rare rows in hours. Weekly chest pieces are reported, never judged |
| E6 | Something worn changes at least once in 24 hunted hours to Level 110, once in 60 after | Tiers, rungs, perks, linings |
| E7 | The Add pool is at most one weapon step and one armor step | Perk sizes, Tempering, the 6% share |
| E8 | No gold-for-power offer is cheaper than Tempering's cheapest rung | Lining and fee shares |
| P4, S5 | Best gear is 10 to 20% faster and takes 10 to 20% less damage than mid gear | Case-sized perks fill the gap |
| P2 | Pace against the contract holds from Level 110 to 5,000 | The gear curve |
| D1 to D4 | Very Rare every 60 to 90 hours on the ruled seat. Luck +16% at 500 hours and +39% at 5,000. Magic Find at most 104 | Luck and the bands |
| T4, T5, T7 | Crafting is a quarter to a half of the mid to best step. A non-crafter needs about 1.5 times as long. The best path uses 6 to 12 rested hours | The ladders and commissions |

**Guards.** Uniques inside the budget within 1% by arithmetic (the armor and weapon line guards). The no-mint guard. The rivet allowance. Drop tables at Magic Find 0 and 104. A Trophy never under 100 hours. Lucky counts once. A matched hero at most 9%.

**Derivation checks.** The gear curve passes when pace holds from Level 110 to 5,000 and the seven tiers sit on the line as samples.

**Playtests.**

| Question | How |
|---|---|
| Does a +17% band feel like an upgrade | One band played on the curve |
| Do players match jewelry to a ground | Three narrow perks measured in and out of their case at Level 88, then played with the saved kit |
| Do the stones land as the first rare find | Three grounds, read from reveals, sets and trades |
| Are Krell's five real choices | Each worn on the ground it wins and one it loses, against the Gold Tower weapon |
| What do players pick, Sell or Salvage | Read from the loot plan in the Discord playtest. No change to the default before the reading |
| Does a reveal every two to three hours read as a moment | The six-row cap played on one ground by a four |
| Do single commissions get taken | Posted against completed, in the beta |
| Is layer gear chased without replacing ground uniques | The world boss playtests of chapter 06, reading what is worn a month later |

---

## 7. Superseded

| Dropped | Why |
|---|---|
| Bands numbered 8 to 18, two a region, about 27 Levels each | A fixed count of Levels is +25% at Level 110 and +8% at 377. Replaced by a fixed step of the curve (47 C20, GR-4). The Luck numbers keep their end points and are keyed by Level |
| A band as a +6.5% step (study 44) | About a quarter of an upgrade, twenty times from 110 to 400. Study 47 and the measured weapon step in 54 beat it |
| 46 new uniques a region, and seven uniques a ground | Ruled A-3 and 31-4: uniques reforge up, a region brings 15 to 20 |
| Worn in | Ruled 23-4: not built. Duplicates feed Tempering. Its purpose passes to Kindlings |
| "No Tempering carryover" and "Tempering stays as built" | Ruled 23-2 on 11-20: it carries up for the difference. GR-8 restores the over-ask at the formula layer |
| Typed plain numbers for jewelry at each tier, about a point a tier | Measured at twice the 6% budget at Level 110 and at 15% and 0.5% at the two ends. A share of the curve replaces them |
| Every perk at about 1% ordinary and 3% in its case, and every perk at 5 to 8% | Measured: built sizes scale in a straight line and five times is the ceiling. Narrow perks only, always-on perks small |
| The plan's typed prices as fixed numbers, and its band-gold table | The table's income figures were estimates on an older engine. Shares of band gold replace typed ladders. The ruled Hallmark fees stay as anchors |
| Gloves as Rares, belts as dropped Rares | "Generous to Krell" applied to two slots (47 C14, GR-43). The glove wing stays as the won pair |
| Tier 7 from Krell's daily roll | A hall's prize holds only what no ground drops (GR-29). Measured cost of the wait: about 9% |
| Call series for earlier bosses | One boss door (GR-28). The plan's need, repeatable mid-region pieces, is kept |
| Salts at either bench for good | The workbench copy leaves when linings give the outfitter its own products (GR-43) |
| Patterns read by one hero | Four heroes learning one recipe four times repeats a decision (GR-44) |
| Patterns and all commissions deferred until a market exists (54 phase A) | It would freeze six slots at Level 110 and leave Smithing 99 as the only road to a tier 7 ring. Withdrawn by 54 itself |
| House curing at 100k, 250k and 500k with bench craft time | Ruled 26-7: the Cellar at 250k, 750k and 2M, 4 hours a lining |
| A sample of four Necrotic and Storm spells, and fists with six rows | `01-core-and-combat.md`: seven first, sixteen in the end, fists as two rows |
| Storm and Bone runes at Runecrafting 65 and 80, and at skill 1 | Ruled 11-21: 25 and 40 |
| Rune tiers respaced to 1, 20, 40, 60, 80 (study 56) | It moves a ruled number. The Sealing Rune and R22 fill the gap |
| Salvage by default with a token Shop price (55 phase A, 46) | Breaks the Luck choice and the ruled sale rule. Withdrawn by 55 |
| A find list that pays Luck, a luck track on Level marks | Ruled 11-20: two feeds and no more |
| Property pieces on every ground from the Sewer (46, 54 phase A) | A band before Krell lasts days. Three samples and stones in their place (GR-40) |
| Chest reforging folded into Tempering (46) | Ruled 22-3. It carries a won piece, it is not a percent |
| Plus skill as a percent of the blow (44 call 11) | Ruled 22-2: the power is the next tier's numbers, the skill bonus is the mark |
| The Lucky ring from tier 2 at launch | Ruled 30-4: with the Morrow Hills |
| Forager, the critical-hit lining, Studies, tool wear, loot-line bonus reasons, Town Works recipe unlocks, wanted lists on weekly orders | Cut or rejected by Tyler on 11-18, or closed by Luck |
| The plan's hunting-hour tables at Levels 10 to 100, its hero slots as a sink, and "Levels 110 to 400 in about 4,200 hours" | Older engine numbers and a retired rule. Level 400 is 4,580 hunted hours (ruled 11-21) and all four heroes are free |
| Study 49's first reward model (no gear, cosmetic arena rewards) | Overruled 11-21: buffs and gear |
| The plan's build order by phase, and the lane ids of studies 30 and 47 | Decisions first. The build plan comes after the calls are ruled |

---

## 8. Source map

| Source | Sections this chapter replaces |
|---|---|
| `docs/design/itemization-plan.md` | All of it for items and crafting: sections 0 to 6, 8 to 10, 12 to 15, Appendix A findings 1 to 4. Section 7, finding 5 and Appendix B are replaced by `01-core-and-combat.md`, with their item side here. Section 11 is replaced by the build plan |
| `docs/design/itemization-canary-adjustments.md` | Its adopted ideas are in 2.5, 2.8, 2.9, 2.12 and 2.15. Its skipped ideas stay skipped |
| `docs/design/balance-program/47-itemization-fit.md` | Sections 2 to 4 and 6. Section 5 is replaced by the build plan |
| `docs/design/balance-program/54-review-items.md` | All sections, with section 10 winning over sections 2 to 5 |
| `docs/design/balance-program/23-items.md` | The ten calls, as ruled on 11-20 |
| `docs/design/balance-program/44-formula-architecture.md` | Section 5.2 and roadmap steps R10, R11, R16, R17, R18, R20 and R22 as they touch items |
| `docs/design/balance-program/60-game-review.md` | Sections 1.3, 2.3, 4.4 and 8.4, and GR-4, GR-8, GR-9, GR-26, GR-28, GR-29 and GR-87 as they touch items |
| `docs/design/balance-program/62-decision-book.md` and `.json` | The items and crafting calls, and the ruled list as it touches items |
| `docs/design/balance-program/50-standards.md` | Sections 2.5 and 2.6 and rulings 3, 6, 9, 14 and 15 of section 11 |
| `docs/design/balance-program/49-mmo-layer.md` | The gear rewards and caps of sections 5.1, 5.4 and 5.8, for the gear half only |
