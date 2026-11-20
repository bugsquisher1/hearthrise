# HEARTHRISE, THE WHOLE GAME: compile, gaps, power budget, scaling risks

Game designer (Fable), 2026-11-20, lane/d-whole-game-audit on set/v0.2.143 (+ Luck v3.1 and Necrotic/Storm 6b as merged there). Asked by Tyler 2026-11-19: "look at the game AS A WHOLE ... everything that we are planning on the roadmap ... IF IT IS SHOWING SIGNS OF DIFFICULTY SCALING THE BALANCE OR RE-BALANCING, WE NEED TO CONSIDER ADJUSTING THE SYSTEMS".

**Labels.** MEASURED = run on the real engine for this report (`tools/balance-sim/staged/whole-game-stack.mjs`, modes `curves`, `stack`, `deep`, `fits`; 2 seeds x 1 h a cell, paired dice, so a difference under about 3% is noise). CITED = another lane's measurement, named. READ = from data or a formula, no play. PROJECTED = arithmetic past what exists. ASSUMED = a guess, said so. Nothing in game code or data was changed. Nothing was played in the browser for this report.

## 0. The answer in one screen

1. **The gear side is healthy.** Every optional power source a hero can wear today (accessories, both Tempering tracks, +10 trained skills, the Tower weapon), worn together, is worth +9 to +14% Level XP an hour from Level 10 to 105, and the pieces add, they don't multiply (MEASURED, section 3). Nothing there runs away.
2. **The runaway is not gear. It is tier x party x way x hours.** A Deadly four earns 1.7 to 2.3 times a lone hero a head with 0 deaths, a Mage 1.2 to 1.7 times a hammer, and bought stamina doubles the hours in a day. Together a heavy account moves about 5 times the pace table (section 3).
3. **The combat formula does not survive the road to 400.** Three curves grow at different speeds: Levels (a power law in hours), skills (an exponential cost, so they flatten), and monster stats (a straight line in Level, read against a hero whose skills equal its Level, who stops existing at about Level 50). The to-hit rules are flat points with clamps. Monsters already land at the 85% clamp on every hero from about Level 60 (MEASURED 85-86% at 97 to 175), so a Defense point is worth 29% less damage at Level 10 and nothing at 105. A melee hero's own to-hit leaves its clamp at about 105 and falls to 55% at 165 and the 15% floor at 240 (READ and PROJECTED), while spells never miss. This is the cause behind the Defense-training problem, the Mage lead, the Tower's flat stretch and its compounding "heat" patch, and the melee hero who loses gold on the first Morrow grounds.
4. **Every ground already carries 3.4 hand dials** (51 on 15 grounds, READ), most of them to hold a "ladder rule" Tyler never asked for. Sixty grounds on this path is about 200 hand dials that all move whenever one formula number moves.
5. **Past Krell there is a plan for 55 Levels and a sketch for 240.** Levels 185 to 400 (about 3,400 pace-table hours) are "structure only". The lead four crosses a 55-Level region in about 200 hunted hours. The long chase has to be horizontal (Luck, Very Rares, properties that carry up, boards), because content cannot be drawn that fast.
6. **Six systems sell the same thing** (a few percent for gold): Tempering, Hallmark fees, jewel reforging, chest reforging, linings, worn in. Each is small on purpose, and a player cannot feel 2.3%. Merge where they overlap and price all of them from one measured gold index.

## 1. The whole game, compiled

Status words: LIVE (players have it), DARK (built, switched off or hidden), STAGED (data or server files written, not applied), DESIGNED (a spec, no build), RULED (Tyler said yes, no spec), IDEA (backlog). Every row was cross-checked against rulings-of-record and master-backlog-2026-11-18.

### Combat and progression
| System | Status | Player problem | Decision it adds | Fed by | Feeds | Depends on |
|---|---|---|---|---|---|---|
| Idle instanced hunts, one engine, online or away | LIVE | "I can't sit here all day" | Where, which tier, which bar | Stamina, supplies | XP, coin, drops, skills, bestiary kills | The settle, stamina |
| Level, uncapped (contract 1385 x L^1.274 XP an hour) | LIVE to 110 | A reason to log in tomorrow | None by itself: it opens grounds and gear | Kills | HP, mana, gear worn by Level | Grounds existing |
| Combat skills (Melee, Ranged, Magic, Defense), uncapped, exponential cost | LIVE | Mastery beside Level | Train or hunt | Blows, mana spent, the yard | To-hit, max hit, spell versions | The to-hit formulas (section 4, risk 1) |
| Inner Flame (regen rate), the Great Hearth, named fuels | LIVE, unused (16 h ever, CITED) | Out-of-combat recovery | Burn or sell bones | Bones, fuels | Regen, the flame color, Hearth Cinders | Needs a reason (section 4, risk 10) |
| Classless roles by weapon: 7 families live, fists DARK | LIVE / DARK | "Which way do I play?" | Weapon and shield | Start kit, drops | Bar abilities, party class | |
| Action bar, conditions, setups, hunt prep builder | LIVE | Repeating choices | Slot order and rules, once | | Every hunt | |
| Spells, 5 versions by Magic 1/15/30/45/60, 7 rune families | LIVE | Output that grows with skill | Which spells, which rune tier | Runecrafting or the store | Damage, heals, Magic XP | No version past Magic 60 (gap) |
| Necrotic and Storm (2 elements, 16 spells, Bone and Storm runes) | DARK, 4-spell sample MEASURED by its lane | Every ground asks only for armor | Which element to guard, which to cast | Runes | Damage, sustain, mana | Section 6 rulings |
| Tank rune spells (Frost Slam, Shelter), party only | In set 142 | A tank has no spells of its own | Hold or protect | Runes | Party survival | |
| Difficulty tiers Normal / Dangerous / Deadly | LIVE | Risk for reward | One choice a ground | | Pull, blows, HP, XP | Party table |
| Party of 4, one flat party XP table, solo +15% | LIVE | Playing together | Who you bring | | XP share, rare roll | Tiers |
| Death (6% Level XP, can de-level), Blessings 25/50/75% | LIVE | Stakes | Bless or not | Gold | Loss protection | Too cheap (CITED: 2,250 g at 70) |
| Stamina 8 h / 12 h, 1:1 rest, gold refills 6 a day | LIVE | A daily shape | Refill or stop | Gold | Hunt hours | Pays 3x its price (CITED) |
| Training yard, House dummy, training gear (12 h / 24 h items, 2x) | LIVE / gear DARK | Skills lag Level | Train or craft in town hours | Gold | Skill XP at a flat 30k / 60k an hour | Flat rate against an exponential cost (risk 9) |
| Scaled hunts (raise an old ground to your Level, by the hour) | LIVE since 141, to Level 50 only | Old grounds die | Pay to revisit | Gold | XP x0.8, the ground's own drops | Linings rely on it "from region 3" |
| The Burning Tower (floors, landings, keys) | LIVE, 1 run ever (CITED) | A second kind of hunt | Climb or hunt | Stamina, supplies | Keys, 50% XP, board | Chest weapons worth having |
| The Unmarked Catacombs descent (wings, keys) | DARK | The Tower again, for armor | Which wing | Stamina | Keys | Tower use first |
| Bosses: Rat King, Coppercap, Hask, Krell (keyed hall, daily roll) | LIVE | A goal a ground | Party or wait | Hall key | Uniques, trophies, gems | |
| Boss call series (paid, stamina, drops on a win) | STAGED | Farm one boss | How many | Gold, stamina | Boss drops only | Legal review (gold for a roll) |
| Monster spells, shooters, mends, boss phases | LIVE | Fights that read | Bar rules, distance, first target | | Damage by element | Linings as the answer |
| Factions (First Flame, Last Ember), standing, swap, outfits | DARK, QA only | Belonging, a second story | Which side, when to swap | Hours on aligned grounds | Outfits, later a skill | Opens with Carter's Rest and the Ox Road |
| Faction skills (Bulwark, Reap) | DESIGNED | Side identity | None (comes with the side) | | A bar ability | Unmeasured |
| Skill tree | ON HOLD (Tyler 11-05) | | | | | Do not build |
| Game modes (Ironman, Hardcore, Group) | IDEA, post-launch | Replay | Account mode at creation | | | Trade and death server flags |
| Idle PvP capture the flag | IDEA, backlog | | | | A helmet key | Player count |
| Companion pets | HIDDEN, no work (Tyler 10-24) | | | | | |

### Gear and crafting
| System | Status | Player problem | Decision | Fed by | Feeds | Depends on |
|---|---|---|---|---|---|---|
| Dropped gear tiers 1 to 7, three weights, loot bands | LIVE | "What do I get here?" | Which ground for which slot | Kills | Power, shop gold, salvage | Drop homes (139) |
| Uniques past tier 7: budget line by Level, one property each | 5 hidden, Morrow grid DESIGNED (46) | Standard gear is all alike | Which piece for which ground | Rares, bosses | Power, market, Luck | 6 new property hooks unbuilt |
| Tempering, 2 tracks x 5 rungs a tier (2 to 7), band ladders past 110 | LIVE / STAGED | Gold piles up | Blows or Armor | Gold, salts | +2.3-3.2% XP, 0-5% less damage for both tracks (MEASURED) | Resets every tier |
| Jewelry: Plain / Fine / Hallmarked, 22 perks for 12 seats | 1 ring LIVE, sample in 140 | Crafting has no identity | Which perks, wear or sell | Smithing, gems, fees | Up to one weapon step a tier | 19 of 22 perks unbuilt, nothing past Level 30 |
| Jewel reforging, the Fine order, gem chips | DESIGNED | Re-buying each tier | Carry up or chase | Gems, gold | Keeps perks current | |
| Cloaks, belts to Crafting | DESIGNED | | | Hides | | |
| Linings (5 element guards, 2 leeches, 12 h, stack to 48 h) | DESIGNED, fire/ice/poison measured 11-13 | Group spells can't be dodged | Which element here | One part + gold | 20/25/30% less of one element, cap 40% | Monster spells mattering |
| House curing slots | RULED (Tyler 11-18, a sink) | Bench hours | | Gold | Time | Linings |
| Salvage (a fourth loot destination) | DESIGNED | Gear is only shop gold | Sell or break down, set once | Dropped gear | Stock, Lucky Rivets | |
| Luck v3.1: one account bar, Magic Find on Rare rows, Lucky ring | DESIGNED, lives measured by its lane | Hour 2,000 plays like hour 2 | Gold now or Luck for good | Salvage, Bestiary stages | Rare rows up to x2.04 | Salvage, rarer Rares past Krell |
| Worn in (3 ranks on a unique, pick deepen or widen) | DESIGNED, sample of 5 | A unique never changes | Direction | Hours worn | Under half a weapon step in all | Property hooks |
| Hearth Chest: Tower weapons, Catacomb armor, warmth, stoke, 6 opens a family a week | LIVE (Tower) | A weekly chase | Stoke or save, reforge | Keys, Cinders | Chest gear | "Major upgrades" not true on this set: +0.0 to +0.9% (MEASURED; the raise sits in the held lane/d-defense-tower) |
| Chest reforging, fusing, two-attribute pieces, glove wing | DESIGNED | Bronze piece outgrown in days | Carry a line | 6 keys, gold | | Catacombs |
| Patterns, maker's mark after 99, good batch, weekly orders, stirred grounds | DESIGNED / RULED | No crafting chase | Which ground for which recipe | Rares | Recipes, chips | |
| Commissions (single and bulk) | DESIGNED | Hunters can't hire crafters | Pay or raise your own | Materials, gold | Crafter XP and pay | Escrow, Security |
| Gathering (mining, woodcutting, fishing), farming, cooking, smithing, crafting, runecrafting, to 99 | LIVE | Hours you can't hunt | Which job | Town hours | Supplies, salts, runes, jewelry | CITED: 1,995 gathering hours, 538 bench hours |
| Fist line (8th family) | DARK, phase 1 measured, fails gold under 40 | A comfortable solo way | | Drops | | Own heal sized |
| Special-attribute pieces at every tier ("sprinkle"), wave-3 uniques | Sample hidden | Set building before 110 | | Grounds, bosses | | Placement map |
| Lucky finds (24 drops) | UNREACHABLE (CITED: no open ground spawns their carriers) | | | | | Move or cut |

### Economy and sinks
| System | Status | Fed by | Feeds | Note |
|---|---|---|---|---|
| Account purse, ledger, gold history | LIVE | Coin, sold loot, Tamsin | Everything | CITED: 8.0M in, 6.5M out since 11-07 |
| Store supplies per use (food, drink, runes, ammo) | LIVE | Gold | Hunt uptime | 43% of gold out, runes 72% of it |
| Shop (gear, tools), sell rates, buyback | LIVE / buyback RULED | | | |
| The Weighhouse market | LIVE, 3 sales ever | Listings | Fee and cut | Needs players |
| Player trade | RULED, not built | | | Security |
| The House, benches, bench tax, Storage chests, bank rungs | LIVE | Gold | Convenience | 35% of gold out, bought once |
| Hero slots 300k / 750k / 1.5M | LIVE | Gold | Own party | A new account is alone to about Level 30-35 |
| Town Works, Round for the Tavern, Town Crier, titles, dyes, rename, setup slots, flame powders, Key Ring, Gold Given board | LIVE | Gold | Being seen | Small |
| Tamsin's tally (3 a day) | LIVE | Kills | Gold, gear | 1% of income |
| Income dial per ground (x0.7 on 9 of 15 grounds) | LIVE | | | A global dial written as nine rows |

### Social, world, retention, live ops, money
| System | Status | Note |
|---|---|---|
| Chat, whispers, friends, blocks, inspect, party finder, town presence | LIVE | |
| Guilds (chat at EA, halls later) | RULED, tab reserved, nothing built | The cheapest long-term retention we don't have |
| Leaderboards (16), Tower and Catacomb boards | LIVE | |
| Greenhaven (6 grounds, 1-50), the Barrow March (5, 45-110) | LIVE | |
| The Morrow Hills 110-165: Carter's Rest, Ox Road, Wyvern Roost STAGED; Night Shift, Old Guard, Bellows, Roost Mother, Father Gault not drafted | STAGED / DESIGNED | Art is the critical path |
| Unmarked Catacombs ground 165-185 | STAGED, no gear | |
| Regions 4 to 7, Levels 185 to 400 | "Structure only" | No ground, monster, unique or story |
| Havora, the real town, the Hearth, criers, living-town pass, training ground rebuild | LIVE / partly RULED | |
| Lore: Krell, Harry and Holly, the Road North | LIVE and growing | |
| Tutorial, coach, "what next", monster stat cards, the in-game wiki of formulas | Partly LIVE; wiki RULED | "Formulas are public" binds every formula below |
| Away card, after-the-hunt plan, bench resume | LIVE / in sets | |
| Live events: Bonus XP weekend (+25%, every other weekend), Open Halls, the Hearthrise | DARK / DESIGNED / later | |
| Daily login (premium), server firsts, shareable rare card, sound | RULED or held | |
| Premium per character (12 h cap, analyzer, outfits, a daily 1 h training weapon) | Beta switch on for all | |
| Crowns: ledger, checkout, store, exchange cap | NOT BUILT | Revenue is zero by construction (CITED retention audit) |
| Crowns training items | RULED 11-14 "a bit pay to win" | Conflicts with "no paid XP boosts" (section 2) |
| Steam shell, Steam sign-in, account deletion, GM tools, staging | Lanes done or held | |

## 2. Gaps

### Level bands
| Levels | Lone hero | Party | Pace hours in band | State |
|---|---|---|---|---|
| 1-16 | Cellar, Thicket, Wickstead, Sewer | Sewer | 14 | Covered, overlapping |
| 16-44 | The Glade only (band ends at 31) | Warrens from 32 | about 100 | **One ground for 97 lone hours** (CITED). Fix owned: advise the Warrens alone from about 36 |
| 45-65 | Hask's Ford, the Slake | Barrows | 110 | Covered |
| 65-70 | Nothing in band alone | Barrows | 45 | Small hole |
| 70-110 | Pyre Field, then Krell's Hold alone for 85-110 | Same | 370 | **210 lone hours on one ground** (CITED) |
| 110-142 | Carter's Rest, Ox Road, Wyvern Roost, staged | Same | about 330 | Waits on art |
| 142-165 | Nothing drafted | | about 250 | Three grounds and two bosses owed |
| 165-185 | Catacombs ground, staged, no gear | | about 220 | |
| 185-400 | Nothing | | about 3,400 | Structure only |

### Items, skills, loops, rulings
| Kind | Gap | Evidence |
|---|---|---|
| Items | `tests/catalogue-coherence.mjs` EXIT 0: 733 items each with a source and a use, 80 held for the roster. The data half is clean | Run for this report |
| Items | 24 lucky-find drops no player can reach | CITED, jewelry lane |
| Items | Two Trophy drops in the game, none past Level 50 | CITED |
| Items | No jewelry past Level 30; 0 Hallmark fees ever paid | CITED |
| Skills | Inner Flame: 16 hours of use by five accounts | CITED |
| Skills | No spell version past Magic 60, so Magic 61+ buys only what the formula gives | READ |
| Skills | Runecrafting has nothing between Graven (60) and the Sealing Rune (75) | Plan section 8 |
| Loops | Hour: fine. Day: stamina, Tamsin. Week: the chest's 6 opens (unused). **Month: nothing** but Level | |
| Loops | A new account is alone for its first week, and two real friends earn less together than apart | CITED |
| Rulings with no plan | Player trade. Party cost sharing (Mode B, approved 10-25). Guild chat at EA. The super-rare reveal, broadcast and shareable card. The in-game wiki. The Crowns ledger and weekly exchange cap. The Bestiary deep dive (now folded into Luck, which needs Tyler's word that this closes it) | |
| Repetition (first principle) | Re-picking the ground at 5, 8, 16. Equip after each hunt. One refill press a hero. Six chest opens a family a hero a week (48 presses for four heroes with both families). Linings to re-fit when the ground's element changes: setups switch the bar only, so a "use on this ground" loadout that carries linings is owed before linings ship | |

### Contradictions
| # | Two things that can't both hold | Call |
|---|---|---|
| 1 | Balance ruling 10-25 section 5: a four earns 15-25% more than an efficient solo. Tyler 11-16: a Deadly mixed four at about 2-2.5x pace. MEASURED: 1.7-2.3x a lone hammer. The grader still grades `party.fourVsSolo [1.15, 1.25]`, so "four-xp" fails on every ground and is ignored | Retire the sheet line. Replace it with one ceiling (section 4, change 2) |
| 2 | "Rare: one per 10-20 h" is kept per ROW. A ground has many Rare rows, so a Rare-band reveal comes every 0.5-1 h (CITED) | Budget the band per ground (change 6) |
| 3 | Tower weapons "should be pretty major upgrades" (11-18). On this set: +0.0 to +0.9% (MEASURED) | The fix exists in lane/d-defense-tower, held for Tyler since 11-18 |
| 4 | "No paid XP boosts" (10-14) against Crowns-store training items at 2x skill XP (11-14) | Tyler's |
| 5 | The plan's later Tower keys ("then one a band") against the Tower's heat (x1.01 a floor, compounding from 100). A Level 110 four tops at 151-159 and a Level 165 four at 169 (MEASURED): 55 Levels buy 14 floors, and floor 240 is x4.0 | Section 4, change 1 removes the need for heat |
| 6 | STAT_FORMULA's reference hero has every skill at its Level. A career hero has Melee 60 and Defense 45 at Level 60, and about 82 and 67 at 110 | Change 1 |
| 7 | The plan's income for sinks counts sold gear (16-38% of income). Salvage for Luck gives that up, and past Level 128 there is no hourly gear to sell | Change 7 |
| 8 | Premium per character (10-17) against one purse, one House, one Luck bar per account | Tyler's (the retention audit recommends account-wide) |

## 3. The power and reward budget

### 3a. Every multiplier, and how it stacks
| Lever | On | Size | Stacks how | Label |
|---|---|---|---|---|
| Weapon tier | XP | +5 to +9% a tier; a tier behind in everything -3 to -18% | Replaces | CITED / MEASURED |
| Armor tier | Damage taken | 12-47% more with a tier behind | Replaces | MEASURED |
| Accessories as worn | XP / damage | +4 to +8% hammer, +0.4 to +3% mage / -4 to -12% | Adds | MEASURED |
| Tempering, both tracks 5 of 5 | XP / damage | +2.3 to +3.5% / -0.3 to -8% | Adds | MEASURED |
| +10 main skill and +10 Defense (yard, items) | XP / damage | +1 to +7% / -64% at 10, -36% at 30, -23% at 50-60, -5% at 80, 0 at 105 | Adds; Defense is clamped late | MEASURED |
| Tower weapon | XP | +0.0 to +0.9% today | Replaces | MEASURED |
| Perks (inside accessories), worn in, chest two-attribute, Tempering past tier 7 | XP | About +1% a perk; under half a weapon step; 2-3% a band track | Add | CITED / PROPOSED |
| Linings | Damage of one element | 20/25/30%, cap 40% with gear | One shared cap | CITED |
| Necrotic and Storm spells | XP | Lone sword +12.8% (one spell), +29.2% (both); wand +2.7%, +8.5%; a Dangerous four +8.7% a hero | **On top of the bar, so it multiplies with everything** | CITED, lane 6b |
| The way you fight | XP | Mage / hammer alone: 1.23 / 1.39 / 1.31 / 1.55 / 1.44 / 1.42 / 1.74 at Levels 10 / 30 / 50 / 60 / 80 / 105 / 118 | Multiplies | MEASURED |
| Tier and party | XP a head | Deadly four / lone hammer: 0.54 / 1.89 / 2.27 / 2.32 / 1.69 / 1.83 / 2.33 at the same Levels, 0 deaths | Multiplies | MEASURED |
| Solo boost | XP | +15% (inside every lone number here) | | RULED |
| Bonus XP weekend | XP | +25% for 3 days in 14 | Multiplies | DESIGNED |
| Faction skill, opposite-ground bonus | XP | Unsized | Would multiply | PROPOSED |
| Stamina | Hours a day | Free 8 h bar (12 h a day with two visits), premium 12 h bar, refills +24 h a day | Multiplies | RULED |
| Heroes at once | Account output | x4 | Multiplies | RULED |
| Scaled hunts, the Tower, the Catacombs | XP | 0.54-0.90 and about 0.5 of hunting | Lower on purpose | CITED |
| Luck / Magic Find | Rare rows | Up to +104%; MEASURED by its lane at 6 / 16 / 28 / 39% at 50 / 500 / 2,000 / 5,000 lone hours | **One additive budget, Rare rows only** | CITED |
| Rarer Rares past Krell | Rare rows | -15% at band 8 to -25% at band 18 | Multiplies with Magic Find | ASSUMED by its lane |
| Good batch, House curing, Blessings, premium analyzer | Yield, time, loss | Small | | |

### 3b. The stack at seven Levels
Level XP an hour, lone hammer on Normal in the plain kit = 1.00 at each Level. "All gear" is every optional source in the first five rows above, worn together.

| Level, ground | Plain hammer XP/h | + all gear | Lone Mage, all gear | Deadly four, a head | Damage taken with all gear | Label |
|---|---|---|---|---|---|---|
| 10, Thicket | 28k | 1.09 | 1.29 | 0.54 (no bigger pull under floor 16) | -65% | MEASURED |
| 30, Glade | 98k | 1.12 | 1.46 | 1.89 | -43% | MEASURED |
| 50, Hask's Ford | 233k | 1.10 | 1.48 | 2.27 | -30% | MEASURED |
| 60, the Slake | 255k | 1.04 | 1.59 | 2.32 | -27% | MEASURED |
| 80, Pyre Field | 407k | 1.12 | 1.55 | 1.69 | -12% | MEASURED |
| 105, Krell's Hold | 512k | 1.14 | 1.50 | 1.83 | -8% | MEASURED |
| 118, Carter's Rest (staged) | 474k | 1.24 | 1.85 | 2.33 | -11% | MEASURED on a stand-in map |
| 165-175, Catacombs (staged, no gear of its own) | 822k, 0.82 of the pace contract, net -26k gold an hour | | 1.30 (1.07 of contract) | 0.91 on Normal | Low HP 36% | MEASURED, staged |
| 240, 400 | Nothing exists to play | | | | | See 3c |

Does the gear stack add or multiply? Multiplying the single steps predicts x1.03 to x1.27, adding them x1.03 to x1.25, measured x1.04 to x1.24. They agree to within noise because each step is small. **Keep every gear-side source small and additive and this stays true at any Level.**

### 3c. Three players
Hours a day and the multipliers above, against the pace table's own player (alone, Normal, 12 h a day).

| Player | Hours a day | Rate | Level 110 at (table: 59 days) | 110 to 400 (table: about 4,200 h, 350 days) | Label |
|---|---|---|---|---|---|
| Free, alone, follows the advice | 12 with two visits, 8 with one | 0.8-1.2 | 48 days (576 h, CITED life) to 72 | 350-530 days | CITED + PROJECTED |
| Premium, alone | 12 with one visit | Same | 48 days | 350 days | PROJECTED |
| Free, lone Mage on Dangerous | 12 | 1.5-2.6 | About 20-25 days (70 in 104-130 h, CITED) | 140-240 days | CITED + PROJECTED |
| Heavy: four heroes, Deadly, refills | Up to 24 | 1.7-2.3 a head | **About 12 days** (285 hunted h, CITED) | **About 80-100 days** | PROJECTED |
| Heavy, with elements (+9% a head) and bonus weekends (+5% averaged) | 24 | 2.0-2.6 | About 10 days | About 70-85 days | PROJECTED |

The heavy account is five to six times the table. None of that comes from gear a player bought. It comes from four levers that multiply: the tier and party (x2), the way (x1.5 for casters, already inside the four), hours (x2), and events and new spells on top.

### 3d. Where the curves cross (READ from the game's own formulas, `curves` mode)
A same-Level regular on a full ground against a lone hammer in the best kit it can get.

| Level | Hero HP | Monster HP | Blow, % of hero HP | Career skill, Melee / Defense | Hero to-hit: skills at Level / career | Blows to kill: at Level / career | Monster to-hit: Defense at Level / career | +10 Defense is worth |
|---|---|---|---|---|---|---|---|---|
| 10 | 250 | 23 | 22% | 21 / 11 | 67% / 78% | 4.3 / 3.1 | 70% / 68% | -29% damage |
| 30 | 450 | 58 | 22% | 40 / 26 | 87% / 95% | 4.9 / 4.1 | 70% / 78% | -26% |
| 60 | 750 | 111 | 22% | 60 / 45 | 95% / 95% | 5.0 / 5.0 | 70% / **85% (clamp)** | -6% |
| 110 | 1,250 | 199 | 22% | 82 / 67 PROJECTED | 95% / 88% | 5.2 / 6.5 | 70% / 85% | **0** |
| 165 | 1,800 | 295 | 22% | 97 / 82 PROJECTED | 95% / **55%** | 6.3 / 14.5 | 70% / 85% | 0 |
| 240 | 2,550 | 427 | 22% | 110 / 95 PROJECTED | 95% / **15% (floor)** | 7.4 / 74 | 70% / 85% | 0 |
| 400 | 4,150 | 709 | 22% | 129 / 113 PROJECTED | 95% / 15% | 8.6 / 120 | 70% / 85% | 0 |

The career line is measured to Level 100 (`skill-lines.json`); past it the projection keeps the hero earning skill XP at its last measured rate, grown with the square root of Level (generous, ASSUMED), on the skill curve's own cost. The harness's own straight-line extension is kinder and is what the staged grounds were graded on, which is why they still read playable at 118-175 in 3b. Either way the shape is the same: the skill cost multiplies by 1.04 a level (ten Melee levels cost 0.27M XP at 21, 32M at 82, 489M at 129), and a monster's defense climbs half a point a Level for ever.

MEASURED support, real settle: monsters' blows landed 85.3-86.9% on every lone hero at 97, 118, 133 and 175. "+10 skills" moved damage taken -64% at Level 10 and +0.8% at 105. The Tower at floor = Level (a played four, 20 minutes): a Level 60 four climbs 66-70 floors past its own Level, a Level 110 four 42-50, a Level 165 four 5, a Level 240 four 0. The Tower's heat is part of that last pair; the hero's side is the rest.

### 3e. Rewards
| Reward | Where it inflates | Evidence |
|---|---|---|
| Level XP | Section 3c | |
| Gold | A lone hammer banks 9.65M by 110 against 11.6M of one-time sinks: sound. A Deadly four buying at the store is at -0.12M by 70; casters carry it (-0.83M and -1.09M against a tank's +1.03M) | CITED |
| Gold past 110 | A lone hammer nets -3k (118), -37k (133), -26k (175) an hour on Normal on the staged grounds while a Mage nets -1k to -8k. "Alone, in range, on Normal: safe and paid" stops being true for melee at the Morrow door | MEASURED, staged |
| Rares | Hourly today. With Magic Find 39 at 5,000 h a 10-20 h row becomes 7-14 h | CITED |
| Uniques past Krell | 0.33-0.46 an hour (ASSUMED by the Luck lane), a Very Rare every 60-90 h | Section 5 |
| Chest gear | 6 opens a family a hero a week, so a four-hero account opens 48 a week against a lone hero's 12. Median wait for THE Platinum piece: 7 weeks alone, 3 for four heroes | CITED chest-odds |
| Market | Everything trades and nothing binds, so every faucet above is also market supply. With 7 accounts there is no price to check any of it against | |

## 4. Scaling risks and system changes

Ranked by player experience first, then by the re-balancing saved.

### Change 1. Make to-hit a ratio, and author monsters against the measured hero
- **What breaks, and when.** Today: a Defense level is the best buy in the game at Level 10-30 and worthless from about 80 (the 11-18 "definitely NOT intended" and the reason its fix keeps bouncing). From about 105: melee and bows start to miss while spells can't, so casters pull away (already 1.4-1.9x). From about 150: a career melee hero can't kill a same-Level monster in reasonable time. Each of these has been met with a patch: `def.past`, the per-tier damage scales, `ACC_DEF_MUL`, "the Mage at 110" row, the held Defense rework, the Tower's compounding heat.
- **What it keeps costing.** A new patch about every 30 Levels of content, each one re-grading every ground.
- **The change.** (a) Both to-hit rules become a ratio of the two ratings, the shape OSRS, Melvor and Path of Exile all use: under the defender's rating, chance = half of attack over defense; over it, one minus half of defense over attack. No clamp is ever reached, and a point is worth the same share at Level 10 and Level 400. (b) STAT_FORMULA's reference hero becomes the measured career hero: `refSkill(Level)` read from `skill-lines.json`, guarded, so monster attack and defense are written against the skills players have. (c) Spells roll against a ward rating the same way, with a high floor, so casters live under the same law. Stats against stats only; no Level is read in a blow (Tyler 11-18).
- **Against our numbers.** At Level 110 a career tank (Defense 67) that trains +10: today 85% to 85%, nothing. On the ratio with the monster's rating set so the career hero is hit 70%: 70% to about 63%, -10% damage, at every Level. At 240 a career hammer's to-hit: today the 15% floor; on the ratio with defense written against the career line, the 80% the formula intends.
- **What it costs the player.** Early Defense training gets weaker (-29% becomes about -10%): that is the ruled fix. Every ground is re-measured once.
- **What it saves.** `def.past`, `ACC_DEF_MUL`, the Tower heat row, the Defense rework lane, the next "Mage at N" row, and the wiki gets one sentence: "your skill against theirs".
- **What makes it ours.** It makes Tyler's own line literally true for 400 Levels: "Either they are strong enough to do the harder content or they aren't." A player reads two numbers on a monster card and knows.

### Change 2. One pace band for every way, tier and party, and retire the ladder rule
- **What breaks.** The harder tiers have one right answer (every recorded party hunt is Deadly, 0 deaths, CITED). Normal is 0.54-0.73 of a lone hero for a four. The 51 hand dials exist mostly to hold "ground N's Deadly must not out-earn ground N+1's Normal" for one weapon at one Level. Tyler has said the opposite three times (11-09 "it doesn't all need to be uniform", 11-13 no molds, 11-16 "balance the grounds vs a unique formula everywhere").
- **The change.** (a) The ladder rule becomes a printed line, never a gate. Delete the per-ground tier dials and let the table stand. (b) The sheet holds two numbers for every ground: the lone median on Normal at 0.9-1.1 of the contract (kept), and ONE ceiling, no way or party over 2.0 times the contract at its floor. (c) The ceiling is held by danger, not by XP cuts: the rare heavy blow already ruled (fix 3 of the 11-19 look), sized so an in-band Deadly four dies about once in 30-100 hours. (d) Retire `party.fourVsSolo [1.15, 1.25]`.
- **Costs.** Some early grounds will overlap in pay. Players finding that is the game.
- **Saves.** About 30 of the 51 dials now, and about 2 a ground for ever.

### Change 3. New abilities are sidegrades to a slot, never additions to the bar
- **What breaks.** Necrotic and Storm add +13% and +29% to a lone sword. Sixteen spells, two faction skills, tank runes and spell-change uniques are all coming. Each one that adds to the bar forces an XP-per-kill cut for everyone (it has happened twice in a week: x0.96, then x0.88).
- **The change.** One written budget: a new ability, used in place of the family's best existing one on a neutral monster, lands within 5%; on a weak monster up to +15%; on a resistant one down to -25%. It shares the lane's cooldown with what it replaces. Measured by the grader for every new ability row.
- **Ours.** The choice becomes "which element for this ground", the Tibia feeling Tyler asked for, and the pace table never moves when content lands.

### Change 4. Past Krell, gear is a line plus a property, and the property carries up
- **What breaks.** 46 uniques a region, each obsolete one region later, eleven bands to 400: about 300 named pieces whose only lasting value is salvage. The lead four clears a region in about 200 hunted hours (two to three weeks). No team draws that.
- **The change.** A unique may be reforged up a band at a bench (the band's ore or hide, gold, the piece): its numbers move to the new band's line, its property stays. New regions add new properties, not bigger numbers. This is the same rule the plan already gives jewelry and chest gear, so it is one rule for all three. A region then needs about 15-20 new uniques (new properties and new looks), not 46.
- **Costs the player.** "A new region replaces my set" is gone. What they get instead is a collection that grows and builds that keep.
- **Ours.** No bound gear, so an old Krell sword reforged to band 14 is a tradeable, known thing with a history. Guild Wars 2 stopped its gear treadmill at one tier in 2013 and has shipped horizontal rewards since; WoW has squished its numbers four times. We are choosing which of those two we are before the numbers exist.

### Change 5. Merge the six "gold for a few percent" systems into three, priced from one index
| Today | Becomes |
|---|---|
| Tempering to tier 7, then a hand-priced ladder for each of 11 bands | Tempering to tier 7 as built. Past it, **Tempering a unique is the "worn in" choice**: deepen or widen its property, three rungs, gold and salts. One system, not two. (Designer's ruling: merged. Hours worn are dropped as the currency) |
| Hallmark fee, jewel reforge, chest reforge, unique reforge (change 4) | One "reforge up a band" rule, one screen, the fee difference |
| Linings, House curing | Linings as designed. Curing stays a sink as Tyler ruled, three slots, no new rules |
- **The index.** `G(band)` = what the median lone hero banks in the band, re-measured by the simulator each release. Every price is a share of it: a Tempering track 0.2, a Hallmark 0.15, a lining's 12 hours 0.1 of 12 hours' net, a slot 1.5 weeks. Tyler's rule (everything together costs more than a band earns) becomes one line a guard can hold: the sum of shares is 1.2 to 1.4. Ruled prices to tier 7 stay as they are; they already fit.
- **Saves.** Hand-pricing 11 bands times 5 systems, and the re-pricing every time the income dial moves.

### Change 6. Budget reveals per ground, not per row; Luck holds as designed
- Through Krell: a ground's Rare band is one budget (about one reveal an hour, as today: the hook). The big reveal, the broadcast and the card are kept for Trophy and Very Rare only.
- Past Krell: the Luck lane's shape is right. See section 5.

### Change 7. Gold past 110: fold the dial into the formula and keep melee paid
- `GROUND_GP_FIT` is x0.7 on nine grounds. It is a global number: put it in `STAT_FORMULA.gp` from floor 16 and delete nine rows.
- Past 128 the hourly gear is gone, so a third of income is gone, while melee food bills are 20k-50k an hour (MEASURED, staged). Change 1 fixes most of the bill (monsters stop landing 85% of blows). What is left is closed by making region stock sell at the shop for what the gear it replaced did, held by the same reference-value guard.

### Smaller changes
| # | Risk | Change |
|---|---|---|
| 8 | A stamina refill returns about 3x its price and is the heaviest lever a paying player has (x2 hours) | Tyler's price call, already on the board as fix 7 |
| 9 | Training is a flat 30k / 60k skill XP an hour. Ten levels cost 0.27M at skill 21 and 32M at 82: a 12 h training item (720k skill XP) buys about 4 levels at skill 40 and 0.2 at 82 | For Tyler (he ruled the flat rate) |
| 10 | Inner Flame is unused | With change 1 and real damage past 110, regen as a share of max HP is worth having. Re-read after change 1; if it is still unused, merge it into the Hearth's Cinders and drop the skill |
| 11 | Blessings cost 2,250 gold at 70 against a death worth 10 hours | Fix 5 of the 11-19 look, owned |
| 12 | Six chest opens a family a hero a week: 48 presses for four heroes | "Open all" with the stoke default |
| 13 | Linings change with the ground's element | A per-ground remembered loadout before linings ship |

## 5. The reward curve: hook to Krell, rare and strong after (Tyler 11-20)

**Where the hook ends.** Level 110, the top of Krell's Hold: about 576 hunted hours alone, about 285 for a Deadly four. Through it nothing gets rarer. I agree with that whole: the first 20 hours are unchanged, gear stays about one piece an hour a slot, and the early market is fed.

**Rarer base gear as an economy lever, band by band.**
| Area | Through Krell (unchanged) | Past Krell (Rare rows -15% to -25%, no hourly gear from 128) |
|---|---|---|
| First 20 hours | No change. Right | |
| Market | Standard gear floods and floors at the shop price | Uniques are the only gear, about 46 kinds a region at 0.33 an hour a hero. A real market item for the first time |
| Salvage and Luck | 9-31 pieces an hour, 2 rivets a tier: about 240 rivets an hour at tier 6 | 0.33 uniques an hour at 400 rivets: about 130 an hour at band 8, while a percent costs 100 x n squared. The bar slows by half exactly where it gets dear. Accepted: it is the long chase. But say it on the sheet |
| Tempering | Per tier, on the hero: demand does not depend on drops | Per unique (change 5): rarer uniques mean fewer things to temper, so each matters more. Good |
| Crafting | Fed by parts and ore | Stock and chips are the hourly drop: crafting is better fed past Krell than before. Jewelry (6 of 14 slots) becomes the steady progress between unique drops. This is the strongest part of the plan |
| Gold sinks | Sold gear is 16-38% of income | That income ends (change 7). Salvaging all of it costs about a fifth of hunting gold (CITED) and nearly all of a Deadly four's margin, so casters go broke first. Party cost sharing has to ship before this does |

**Is 0.33-0.46 uniques an hour enough?** Yes for the hunt, no for the months. A hero sees a unique every 2-3 hours and one for its way about every 8-12, so its own set is done about 100 hours into a 590-hour region. The Very Rare (one of a ground's seven, every 60-90 h) is what fills the rest: six grounds are 360-540 hours of chase, which matches the region's length for a lone hero. For the lead four at three times the pace it does not: they leave the region with about a third of its Very Rares. That is fine only if they have a reason to come back, which is change 4 (the property carries up, so an old Very Rare is still wanted) and scaled hunts raised past Level 50 (the formula does it for free). Without those two, rarer drops read as stingy. With them it reads as Tibia.

**Is there enough to chase for months?** Not yet. Past 185 there is no content. What exists or is designed for the long chase: Level, the Luck bar, Very Rares, the chest lines, two boards, jewelry rolls. What is missing: guilds, server firsts, a Trophy on every ground, and anything a returning Level 300 player does on a Tuesday that isn't the same hunt. The cheapest three: one Trophy a ground (owned), server firsts, and scaled hunts to any Level.

**Luck v3.1 against the whole budget.** It holds, and it is the best-shaped system on the roadmap: one additive budget (bar 100 + ring 4), Rare rows only, no event, food, premium or chest touches it, the far stop is where GW2's is (300% there; ours +100%). Two conditions. (1) Keep it the ONLY drop lever: the element weakness `dropBonus` that `weaknessInfo` still returns and any future "faction ground bonus" on drops must go, or they multiply with it. (2) Party average Magic Find lets a new friend dilute a veteran's roll: use the killer's party's highest, or friends are a cost again (the game already has that problem).

## 6. Necrotic and Storm: rulings

Asked by the Coordinator on lane/d-elements-6b's measured sample (its numbers, not re-run here).

| # | Question | Ruling |
|---|---|---|
| 1 | Brand and Reave on the shield tank's list | **No, not alone.** With a shield worn they are party only, the same rule as Frost Slam and Shelter (one rule to learn). Tyler 11-19: tank spells never make a lone tank kill faster. A sword without a shield gets both |
| 2 | +12.8% and +29.2% for a lone sword | **Too much. Land less.** A weapon tier is +5 to +9%. By change 3: Brand about +5% on a neutral monster, both together at most +10%, and they share the offense cooldown with Power Strike and Flame Strike so they replace a cast. The bigger store bill (11.0k to 17.9k) is the right price and stays |
| 3 | Damages | Brand and Reave from [8, 14] to about [5, 9], then re-measure to the target. Updraft [5, 9] stands (+2.7%). Blight to about [4, 7]: its worth is Withered, and the Mage is already 1.4x |
| 4 | Mana back capped at the spell's cost; Magic XP on net mana | Yes to both. Otherwise it is free Magic XP |
| 5 | Element rules fire only when the blow took HP; DoT ticks count | Yes |
| 6 | Withered cuts every heal but natural regen, wraps included; a monster's resist doesn't lower its cut | Yes. The hero's guard lowering its own cut stays. The wiki says both lines |
| 7 | Class layer adds to each monster's profile | Yes |
| 8 | Rune id air to storm | Yes. No back-compat |

**Does the element design hold from 1 to 400?** Yes. It is the one combat system that is already scale-proof: fixed steps (+15%, -25%, -50%), one shared 40% cap, nothing grows with Level, strengths never rise. Spend the art. One condition: an element only matters if monster spells are a real share of damage on its wall ground, so the grader should print that share for each ground (it has the numbers).

## 7. What other games do, and where we differ

Mechanics and formulas only. Nothing here is a name, a text or a look to copy. Tyler's own earlier sources (Canary, Veloren, ultraloot) were mined on 11-18 and are in `itemization-canary-adjustments.md`.

| Source | What it does | What we take | What stays ours |
|---|---|---|---|
| OSRS wiki, "Damage per second/Melee" (oldschool.runescape.wiki/w/Damage_per_second/Melee) | Hit chance is a ratio of an attack roll and a defence roll, two branches, no clamp | Change 1 | No prayer or stance multipliers in the roll: two published numbers |
| Melvor Idle community simulator (github.com/coolrox95/Melvor-Idle-Combat-Simulator, `Extension/sources/workers/simulator.js`, `calculateAccuracy`) | The same two-branch ratio for the player and the monster, for melee, ranged and magic alike, each against its own defence rating; damage reduction is one flat percent | Change 1(c): spells live under the same law. The closest idle reference, and it never needed a clamp | Melvor is one player and a list of monsters. Ours runs on a shared server with parties of four, a tank that holds a pack, positions and group spells |
| Melvor Idle 2 | Nothing useful is public. The one repository found is a trainer, which is not a source and was not opened | | |
| Path of Building (github.com/PathOfBuildingCommunity/PathOfBuilding, `src/Modules/CalcDefence.lua`, `calcs.hitChance`, `calcs.armourReductionF`) | Hit chance = accuracy over accuracy plus a function of evasion. Armour = armour over armour plus five times the hit: big hits get through, small ones don't | The ratio again. The armour shape is the "rare heavy blow" in formula form: a way to give risk a middle | We have three armor weights that do three different things. Keep them |
| Path of Exile wiki, "Stat" (pathofexile.fandom.com/wiki/Stat) | "Increased" modifiers sum into one multiplier; "more" modifiers each multiply. Stacking toward infinity has diminishing returns, toward zero a slippery slope | The budget rule in 3a: every gear-side source is "increased" (adds). Only tier, party and hours are "more", and those get one ceiling | |
| The Forgotten Server (github.com/otland/forgottenserver, `src/weapons.cpp` `getMaxWeaponDamage`, `src/vocation.cpp` `getReqSkillTries`) | Max damage = a Level term + skill times weapon attack. Skill cost is an exponential. Melee has no skill-against-skill miss | Confirms the diagnosis: Tibia has our exponential skills but multiplies skill by the weapon and adds a Level term, so skills flattening never strands a hero. We can't read Level in a blow (ruled), so we fix the same problem on the monster's side | Idle hunts, tiers a ground, no vocations |
| TibiaWiki, "Formulae" (tibia.fandom.com/wiki/Formulae) | In 2022 Tibia slowed its Level-based damage past 500 | Even a 25-year-old uncapped game had to bend its curve late. Bend ours before 110, not after | |
| Guild Wars 2 wiki, "Luck" and "Magic Find" (wiki.guildwars2.com) | Account luck from salvage, cost per percent rising to a flat 30,000, stop at 300%. Magic find touches kills only, never chests or event rewards | Luck v3.1 already matches: one budget, kills only, the chest untouched | The Lucky ring is tradeable and the bar is not; Luck is also the Bestiary's reward |
| Warcraft Wiki, "Stat squish" (warcraft.wiki.gg/wiki/Stat_squish) | Four number squishes so far, each needing bonus-damage tables to keep old content playable | Change 4: don't start the treadmill | |
| Diablo II magic find (from memory, the wiki blocked the reader) | Magic find has diminishing returns that differ by rarity | Luck's Trophy rule (its own lower, approached ceiling) is the same idea | Not fetched, so not relied on |

**Why the result is not a clone.** The borrowed parts are arithmetic. What a player would describe to a friend is ours: hunts that keep running on a shared server while you sleep, your own four heroes as a party, one tier choice a ground, a property on a sword that you carry and deepen for 300 Levels and can still sell, a Luck bar you fill by breaking gear on the Hearth's ledge, and published formulas simple enough to argue about in chat.

## 8. For Tyler

| # | Call | Recommendation |
|---|---|---|
| 1 | Re-base combat's to-hit on ratios and the measured hero (change 1). It touches every ground once and reverses nothing you ruled | Yes, as the next combat-engine batch, before any ground past 125 is graded |
| 2 | Retire the ladder rule and the "four = +15-25%" line as gates (change 2). The second is your 10-25 ruling, already overtaken by your 11-16 one | Yes |
| 3 | Uniques reforge up a band and keep their property (change 4). It changes "46 new uniques a region" (your 11-18 yes to question 8) to about 15-20 | Yes |
| 4 | Crowns-store training items against "no paid XP boosts" | Hold them out of Early Access |
| 5 | Flat training rate (your 11-14 ruling) is worth nothing past about skill 60 | Let the yard pay a share of the skill's next level instead, or accept it as an early-game system |
| 6 | Stamina refill price (pays 3x) | Raise it (fix 7) before Crowns trade |
| 7 | Premium per character or per account | Per account |
| 8 | Release the held lane/d-defense-tower? | Take its Tower weapon raise now. Drop its Defense rework for change 1 |
| 9 | Luck closes the Bestiary deep dive (11-11) | Yes |
| 10 | Regions 4 to 7 | Don't design them yet. Build change 4 and scaled hunts to any Level first, then one region at a time |

## 9. Measured, cited, assumed

| Kind | What |
|---|---|
| MEASURED here | The gear stack at Levels 10, 30, 50, 60, 80, 105, 118 for a lone hammer and Mage, and a played four on Normal and Deadly. Lone and four cells on the staged grounds at 97, 118, 133, 175. The Tower at floor = Level for 60, 110, 165, 240, 400. 2 seeds x 1 h a cell (the Tower 2 climbs of 20 minutes): differences under about 3% are noise, and no death rate can be read from it |
| READ here | The curves table (the game's own functions), the 51 hand dials, the ground bands, catalogue coherence EXIT 0 |
| CITED | The 11-19 complete balance look and its lives and ledger reads, the Tower curve lane, the Luck lane, the elements lane, chest odds, the itemization tables, the four 11-19 audits |
| PROJECTED | Skills past Level 100, days to 110 and 400, everything at 240 and 400 |
| ASSUMED | The skill-XP growth past 100 (square root of Level). Past-Krell drop rates (the Luck lane's). Staged grounds run on a stand-in map with a straight-line skill extension, which flatters them |
| Not done | Nothing was played in the browser. No production read. The ratio formula in change 1 is worked on paper against our numbers, not built or run. The market, farming, and the faction skills were not judged. I designed none of the systems scored here except by inheritance of the role, and no score is given to any |
