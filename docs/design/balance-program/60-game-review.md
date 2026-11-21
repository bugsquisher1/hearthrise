# Balance program 60: the game review

Lane `lane/d-game-review` (game designer, 2026-11-21), on `set/v0.2.144`. The briefs are Tyler's, `45-design-brief.md` and `40-formula-brief.md`. This is the synthesis his section 9 asks for: seven deliverables for the whole game, from everything the night produced. **No game code, data or migration was changed. Nothing here is built. Every change is a recommendation for Tyler to rule on.**

What it rests on: the formula architecture (44) and its three audits (41 to 43), the Game Director's blind read (46), the itemization fit (47), the standards and the 11-21 rulings (50), the eight design reviews with their phase B measurements (52 to 59), and the rulings of record.

**Two inputs had not landed when this was written, and their sections say PENDING.** `48-platform-cost.md` (the server-cost path to 60 database-seconds) and `51-baseline.md` (the calibrated baseline). Section 4.5, section 7.2 and call G-1 are written from what is on the set and will be re-issued when they land.

Labels. **MEASURED** means the real engine played it, through the matrix or a lane's own run. **COMPUTED** means arithmetic on the game's own numbers. **EVIDENCE** means counted from the four real players or seen in play. **HYPOTHESIS** means a design judgment that needs a playtest. **RULED** carries the date or id of your ruling. Time is on the 12 hour frame: Krell's Hold is day 18 for a four and day 39 for a lone hero.

The measured numbers all carry one caveat, stated once here and in full in section 9. The harness is not calibrated yet. Its four kills 11% more than the real four, its tank takes 96% of the damage where the real one takes 69%, and its party store bill is 1.9 times the real one. A four's pace can be trusted. Party survival and party gold are direction only.

---

## 0. The answer

**Would we build Hearthrise the same way from scratch? The engine and the loop, yes, almost line for line. The game around them, no.**

Nine documents answered this without reading each other in phase A, one from the top down and eight from the bottom up. They agree on what to keep: the idle instanced hunt, the action bar and its rules, tiers as dials, the per-use store, roles from the worn set, the return card, the Tower, the one stat formula that writes monsters, and the gold formula. Not one review asked to rebuild any of those.

They also agree on what is wrong, and it is one sentence. **Hearthrise is a strong hunt with a wide shelf of systems around it that do not yet lead anywhere.** The shelf fails in five places that every review found from its own side:

1. **The game the screen teaches is not the game people play.** The screen teaches one hero on Normal. Real play is one person's own four on Deadly. The bridge is 400,000 gold, and nobody who stayed on the first side passed Level 9.
2. **Deadly does not ask for a party or for roles.** MEASURED: a hammer and three mages with no healer was the fastest four at Level 60, and four mages with nobody in front held Deadly with no deaths.
3. **Gear is coin.** Players sold 86% of what dropped and wore 0.9%. Six of fourteen slots stop at Level 30. There is no formula for gear past Level 88.
4. **The long game is not there yet.** A four leaves open content on day 27. Levels come at more than twice the ruled speed. From Level 110 gold only piles up. From Level 145 a death costs more than Deadly pays.
5. **No player needs another player.** Zero hours of two people in one hunt in 1,334. Zero real market purchases.

On your worry, that twenty good systems might not form one good game: you were right to worry, and the reviews say where. The systems form one game for the two players who run four heroes on Deadly. They do not form one game for a new player with one hero, and they do not connect players to each other at all.

**What that means for the plan.** No new engine and no new big system. The work is to fix the formulas the long game stands on (gear, kill reward, the Level table, prices), make Deadly a fight, bring the second hero forward, and build fewer of the shelf's parts and make each of them lead somewhere. Of about 440 rows the eight reviews judged, 55% are KEEP, and most of the rest are REDESIGN or ADD on mechanics that already exist.

### 0.1 Where they converged independently

Convergence is the strongest evidence the night produced, because the phase A lanes did not read each other and the Game Director read none of them. Each row below was reached by at least two lanes on their own.

| # | The finding | Who reached it | What it rests on |
|---|---|---|---|
| 1 | The second hero should come in the first evening, not after 400,000 gold | 46 (from play), 59 (from the quit point), 55 (slots must not rise, "the weakest stretch we have") | EVIDENCE, thin: nobody with one or two heroes passed Level 9. 91% of hunt hours are parties and every party is one account |
| 2 | Heroes that hunt together while their owners are away come before clans and castles | 46 (lent seats), 57 (on-call heroes, already RULED) | EVIDENCE: 0 hours with another person, visits of 2 to 5 minutes |
| 3 | An account is a closed economy, so the market has nothing to do | 46 (seam 2), 55 | EVIDENCE: 7 listings, 0 real purchases |
| 4 | Gear is coin | 46, 54, 55 | EVIDENCE: 34,756 pieces dropped, 298 ever worn |
| 5 | Old grounds should rise to your Level for free, in place of scaled hunts by the hour | 46 (change 4), 53 (Risen grounds) | EVIDENCE: 0 real uses of scaled hunts. A four is out of open ground on day 27 |
| 6 | One boss door. Call out folds into keyed halls | 46, 53, 54, 59, and 47 (C15) | EVIDENCE: one real use of Call out, 19 Hall Keys held and no Hall fought |
| 7 | The game has no permanent build choice, and endless Levels need one | 46 (marks), 56 (Kindlings), 52 (style picks), 47 (C10) | EVIDENCE for the hole: nothing on any bar changes after hunted hour 254 |
| 8 | 6% with three cheap Blessings is a fee, not a risk | 46, 56 | MEASURED: a blessed MID four on Deadly earns less than the same heroes alone on Normal from Level 145 to 185 |
| 9 | The starting hero is the worst lone pick | 46 (from play), 52 (MEASURED: 0.84 to 0.92 of the hammer alone), 59 | The sword and shield is ruled slow alone on purpose and is what every new player gets |
| 10 | Deadly does not need roles | 52 and 57, measured separately on different seeds | MEASURED: four mages kill 8 to 15% faster than the mixed four and do not die |
| 11 | A room should not sell speed, and Inner Flame is a dead end | 46, 58, 56 | EVIDENCE: 16 speed rungs never pay back. 9 of 12 real heroes parked Inner Flame |
| 12 | The player needs a risk reading before the death | 53, 56, 59, and the plan's lane L16 | MEASURED: every cell with a death read under 50% lowest health, and no cell at 50% or over held one |
| 13 | One floor on the blow a cast reads, in place of 17 per-row floors | 41, 44, 52 | Same effect, one number |
| 14 | Setup slots should be free | 55, 59 | EVIDENCE: 0 purchases. It charges for a remembered decision |
| 15 | Hold every dark system shut until a stranger stays twenty hours | 46, 59 (the population gate) | EVIDENCE: 14 built systems no player can reach |

Three things the convergence does not prove. It proves the problems, not the fixes. Three of the fixes below were proposed by two lanes and then withdrawn when one of them measured it (salvage by default, party XP by size only, removing the party-ground formula). And nearly all the real-player evidence rests on four people.

### 0.2 Where they disagree, with one recommendation each

| # | The disagreement | Side A | Side B | Recommendation |
|---|---|---|---|---|
| 1 | The first hero slot | 46, 59: about 10,000 gold | RULED three times (11-09, 11-20, 11-21): 400,000. 57: keep it and let on-call heroes give the early party | **Lower it, and prove it in the beta with two invite waves** (G-2). On-call needs a population the beta does not have yet. The pair needs nobody |
| 2 | Party XP by size only | 46, 57 in phase A | 52, and 57 after it measured | **Keep the class table until Deadly is a fight** (G-3). MEASURED: on a size-only table four mages are the best four in the game |
| 3 | Named build pieces from the Sewer on | 46 | RULED 11-20 "generous to Krell, rare after". 54 withdrew its own early-piece call on the 12 hour clock | **No re-open. Ship the three designed samples and the signature stones** (G-40). A band before Krell lasts one to seven days |
| 4 | Salvage by default and a token Shop price | 46, 55 in phase A | 47 (C3), and 55 after it measured | **Salvage ships as a choice, as ruled** (G-46). MEASURED: 15% less gold in made 40 gold bands worse and none better |
| 5 | What the market is for | 46: rare pieces and Crowns only | 55: an idle market that also routes supplies | **Both, in order.** The order book and rare pieces first, supplies through the one-tap refill second (G-50) |
| 6 | The Catacombs descent as a wing of the Tower | 46 | RULED 11-16 and 22-4. 47, 56 | **Keep the mode.** 46 was written without 22-4, and "fight on what you carried down" is the best new decision in the endgame (G-36) |
| 7 | Death at 6% flat | 46: take the cap | 56: keep 6% and add Blessings 4 to 7 | **The ladder** (G-7). It keeps your ruling's words and gets the cap's effect, paid in gold |
| 8 | The build choice | 46: a mark every five Levels | 56, 47: Kindlings on Inner Flame | **Kindlings** (G-61). Marks put a build on Level, which you have kept out of the blow twice. Kindlings reuse a skill and drops that exist |
| 9 | Necrotic, Storm and the fists | 46: defer them whole | RULED 11-18 and 32-6. 52, 47 | **Seven spells first, after Deadly is fixed.** Sixteen stays the end state (G-16, G-17) |
| 10 | Faction skills with power | 46: story and outfits only | RULED 31-8. 57 | **Keep the ruling**, and choose the side per hero (G-71) |
| 11 | The party-ground formula | 53 in phase A: remove it | 44, and 53 after it measured | **Keep it as one encounter type** and bring its XP a kill down by about a third inside the kill reward (G-5) |
| 12 | The size of a gear band | 44: a fixed +6.5% step | 47 (C20): a tier's worth, about +24% | **A tier's worth** (G-4). +6.5% is twenty bands from Level 110 to 400, each about a quarter of an upgrade. HYPOTHESIS until one band is played |
| 13 | Plus skill on chest weapons | 44: make it a percent of the blow | 47 (C24): 22-2 already made both rulings hold | **Keep the flat number as ruled** (G-26) |
| 14 | The yard's flat rate | 44, 58: follow the skill level's cost | RULED 11-14. 56: decide past Level 300 | **Follow the curve, capped at half of hunting, with the fee following the rate** (G-54). On a game with no skill cap a flat rate retires the yard for most of the game |
| 15 | The hidden Level cut on party XP | 44: remove it now, as RULED 11-08 | 57: replace it in the same step | **Replace it in the same step** (G-10). MEASURED: with no rule a Level 5 hero behind a Level 37 party earns 6 times its own pace |
| 16 | Called boss rooms | 44: keep both doors, documented | Four reviews and 47 | **Merge** (G-28) |
| 17 | Curing | 46, 58 in phase A: do not build | RULED twice (11-18, 26-7) | **Build it last, as a standing order.** Do not ask a third time (G-47) |
| 18 | One Great Hearth | 46: merge Inner Flame, Town Works, the event and powders | 57: only if the staged-gift engine survives | **Merge the three town parts into one Hearth. Inner Flame stays a skill and pays in Kindlings** (G-82). HYPOTHESIS |

### 0.3 Where I challenge you

Four places where the evidence says a ruling should move, in order of how much it matters.

1. **The first slot at 400,000 gold.** Three lanes found it from three sides. At 12 hours a day it is about five days, which matches your "about a week". At the 3.3 hours people really played it is over two weeks alone on a two-spell bar, and both light players left before it. Keep 1.5M and 4M. You keep 5.5M of a 5.9M sink.
2. **6% flat with no cap, together with a flat death count.** I am not asking you to reverse either. MEASURED, the two together switch Deadly off for a MID four from Level 145, and from Level 100 once the Level table is put right. That breaks your own 11-16 ruling that a four on Deadly is the best way to level. Blessings 4 to 7 keep all three.
3. **"Every Dangerous party stands at or over its heroes alone" (11-16).** It is what made Dangerous a second Deadly. MEASURED: on five monsters a lone hero holds Dangerous near 40% health with no deaths for 35 to 65% more XP. That is "struggle or pay" for one hero, and a lone hero has no hard tier today.
4. **$0.15 an account-month with heroes working all 12 rested hours.** COMPUTED: every fix in the plan takes an account from 645 database-seconds a day to 180, and the ruled price needs 60. The two rulings do not fit together without one more system change (section 4.5). This is the one Critical item that is not about fun.

---

## 1. Complete game systems review

One verdict a system, deduped across 46 and the eight reviews, after phase B. KEEP, REDESIGN, MERGE, REMOVE, ADD, DEFER. "Ruled" means a ruling already covers it. Where two reviews disagreed the row carries the recommendation of section 0.2.

### 1.1 The hunt and combat

| System | Verdict | One line | From |
|---|---|---|---|
| Idle instanced hunts that run with the game closed | KEEP | The whole promise | 46 |
| The action bar, conditions, setups | KEEP | The signature. It needs feedback, not more tests | 46, 59 |
| One combat engine, one door for every blow | KEEP | The core is one formula system | 44 |
| Roles from the worn set, lanes, the bar budget, the 2 second swing | KEEP | The foundation is right | 52 |
| The three tiers | REDESIGN | The dial is applied three times. Dangerous and Deadly are the same full box. Deadly asks for no roles | 44, 52, 53 |
| Weapon weakness | REDESIGN | No monster can be weak to axes or fists. Two content rows | 52 |
| Spells: amounts, floor, weakness | REDESIGN | One floor number. A physical strike reads weapon weakness. Spells never miss or crit | 44, 52 |
| Stances, target modes, statuses, elements | KEEP | Add one target mode, "shooters first" | 52 |
| The party XP class table | KEEP until Deadly is fixed | Without it four mages are the best four | 52, 57 |
| The solo +15% | MERGE | The first cell of the one party table. No number moves | 44, 57 |
| The hidden Level cut on party XP | REDESIGN | One visible straight-line rule in place of it | 57 |
| The Tower's own party table | MERGE | The Tower and the Catacombs take the one table | 44 |
| Combat skills: Melee, Ranged, Defense | KEEP | | 52, 56 |
| Magic on a weapon hero | REDESIGN | Adds a little max mana for every hero. MEASURED, gate PASS | 52 |
| Death at 6% and Blessings 1 to 3 | KEEP | Ruled twice | 56 |
| Blessings 4 to 7 | ADD | Holds a blessed death near five hunted hours at every Level | 56 |

### 1.2 The world

| System | Verdict | One line | From |
|---|---|---|---|
| The stat formula and six monster roles | KEEP | A new ground is mostly data | 53, 44 |
| 118 hand-typed monster rows and the art tier damage scale | REDESIGN | Every monster reads the formula. 103 rows are in no hunt and are deleted, not converted | 44, 53 |
| The party-ground formula | REDESIGN | One encounter type with three numbers. Its three inner patches go | 44, 53 |
| Per-ground hand dials (51) | REMOVE about 35 | Each stands in for the missing kill-rate term | 44, 53 |
| Monster spells, shooters, mends, boss phases | KEEP | Any monster may carry a phase | 53 |
| A signature for each ground | ADD | One question a ground asks, said on the card, carried by the harder tiers | 53 |
| Scaled hunts by the hour | REDESIGN | Free depth on every ground (Risen grounds) | 46, 53 |
| Keyed halls | REDESIGN | The prize holds only what no ground drops. One key, one roll | 53, 54 |
| Call out | MERGE | Into keyed halls | 46, 53, 54, 59, 47 |
| The Burning Tower and the Hearth Chest | KEEP | The best formula-driven content in the game. Weekly, as ruled | 46, 56 |
| The Catacombs descent | KEEP | Its own mode, as ruled. One wing and one key first | 47, 56 |
| The regions roadmap | REDESIGN | Six grounds, opened as four and a hall, then two. One new rule a region | 53, 47 |
| The Bestiary | KEEP | Build as ruled with all six Luck payments | 56, 59 |
| The old dungeons, three ground-less hunts | REMOVE | Ruled 22-10, and dead rows | 53 |

### 1.3 Items and crafting

| System | Verdict | One line | From |
|---|---|---|---|
| Seven tier ladder, six armor slots, three weights | KEEP | The pacing spine | 54 |
| Gear past tier 7 | ADD | A gear curve in the game, linear in Level. Nothing past Level 300 holds without it | 44, 47 |
| Jewelry, cloaks and belts | REDESIGN | Built to tier 7 as the build layer. Plain numbers are a 6% share of the curve | 54 |
| Perks | REDESIGN | Narrow perks sized for their case. Always-on perks stay small | 54, 47 |
| Special pieces at and under tier 7 | KEEP | Ruled 11-14. Three designed samples are not live | 47, 54 |
| Uniques past tier 7 | KEEP | 15 to 20 a region. The one property is one of seven decision kinds | 54, 47 |
| The Very Rare band | ADD | A signature stone a smith sets in jewelry | 54 |
| The Rare band and its reveal | REDESIGN | At most six rows a ground, so the ruled reveal is a moment | 54, 46 |
| Tempering | KEEP | Pays the difference (23-2). Priced as a share of band gold | 47, 44 |
| Worn in | MERGE | Ruled 23-4. Its purpose passes to Kindlings | 47 |
| Chest reforging | KEEP | Its own verb, ruled 22-3 | 47 |
| Linings | KEEP | Build after combat sizes group damage. The first repeating sink that buys power | 54, 55 |
| Curing | DEFER | Ruled. Built last, as a standing order | 47, 58 |
| Luck, rivets, salvage | KEEP | Two feeds only. Salvage is a choice | 47, 55 |
| Gathering: Woodcutting, Mining, Fishing, Farming | KEEP | The rested half of the day | 54, 56 |
| Cooking | KEEP | 19 heal foods merge to one ladder of about 8. Feasts merge to four party meals | 55, 54 |
| Smithing | KEEP | The jeweler and toolmaker | 54 |
| The Crafting bench | REDESIGN | The outfitter: cloaks, belts, linings, ammunition | 54, 56 |
| Runecrafting | KEEP | A Sealing Rune at 75 and 88 fills 61 to 99 | 47 |
| Patterns | ADD | With the Morrow Hills, taught to the account | 47 |
| Commissions | DEFER in bulk | Single jobs ship with jewelry tiers 5 to 7 | 47 |

### 1.4 Economy

| System | Verdict | One line | From |
|---|---|---|---|
| Gold, the purse, the ledger, stamina | KEEP | One currency, journaled, server-owned | 55 |
| Coin a monster hit point | KEEP | The right formula. Its four stacked dials fold into one coin line | 44, 55 |
| The per-use store | KEEP | The price of pace, with zero repeated decisions | 46, 55 |
| The store's heal prices | REDESIGN | One gold-a-hit-point line, and heal size on the gear curve | 44, 55 |
| Six hand price lines (refill, Blessing, yard, rename, colors, Tempering) | REDESIGN | Hours of one wage curve | 44, 55 |
| Hero slots | REDESIGN the first price | About 10,000, then 1.5M and 4M as ruled | 46, 59 |
| The Shop as buyer of last resort | KEEP | Its ruled price stays | 47, 55 |
| The Weighhouse | REDESIGN | Standing orders, routing from loot rules, sourcing from the refill | 55 |
| The market shut behind a Works goal | REMOVE | Open on day one | 55 |
| Bench tax, the price on setup slots 4 and 5 | REMOVE | Fees nobody feels | 55, 59 |
| The gold floor | REDESIGN | A hunt budget, remembered a ground | 55 |
| Standing sinks (Tempering, Hallmarks, linings) | REDESIGN | A share of band gold, so every band has its sinks | 44, 47 |
| Crowns | DEFER | After the market has something to price | 55 |
| Premium, account-wide, comfort only | KEEP | Ruled | 55 |
| A daily gold made and destroyed line | ADD | The economy has no gauge | 55 |

### 1.5 Progression

| System | Verdict | One line | From |
|---|---|---|---|
| Level, uncapped | KEEP | The identity | 56 |
| The Level table, 16 hand brackets | REDESIGN | Your table of hours is the law and the curve is derived | 44, 56 |
| The combat skill curve | KEEP | Skill stays skill plus gear, and earns its late worth through rune tiers past 60 | 44 |
| Inner Flame | REDESIGN | Bones by loot rule now. The home of the build choice later | 56 |
| The skill tree (held) | MERGE | Into Kindlings on Inner Flame | 56, 47 |
| The yard, the dummy, training items | REDESIGN | The rate follows the skill curve. The dummy halves the fee | 44, 55, 58 |
| Rested XP | REMOVE | Pays zero on every path. MEASURED: an identity | 56, 58, 59 |
| Two old kill ladders | REMOVE | Ruled cut, hidden multipliers | 44, 56 |
| Titles, Trophy display, mounts, firsts | MERGE | One Honors page | 56 |
| Tamsin's tally | KEEP | It takes itself on the ground a hero enters | 59 |
| Leaderboards, the Chronicle | KEEP | As ruled | 56 |
| Companions, game modes, idle PvP | DEFER | As ruled | 56, 59 |

### 1.6 Social and home

| System | Verdict | One line | From |
|---|---|---|---|
| The own four through hero slots | KEEP | It is the real party system | 57 |
| On-call heroes, standing parties, shared supply cost | KEEP, build first | Ruled. The only way two real people's heroes hunt together | 57, 46 |
| Live invites | MERGE | Into standing parties | 57 |
| The live party finder, the fifth seat | REMOVE | 0 uses. Its job moves to the on-call board | 57 |
| Global chat, whispers, moderation, the rare drop broadcast | KEEP | | 57 |
| The Local chat tab | REMOVE | Frees a connection for the clan tab | 57 |
| Friends | REDESIGN | The on-call roster, with a friend link at sign-up | 57 |
| The shared town | REDESIGN | It draws heroes at work whether or not their owner is online | 57 |
| Clans, step 1 | KEEP | After the beta shows 50 accounts a day | 57 |
| The clan castle (buildings, labour, votes, upkeep, treasury) | REMOVE the old build | Rebuilt later as projects on the Town Works engine | 57, 46 |
| Factions | KEEP | As ruled 31-8. The side is chosen per hero | 57 |
| Town Works, the Hearthrise event, flame powders | MERGE | One Great Hearth | 46, 59 |
| The House deeds, Storage, chests | KEEP | Make, Keep, Show | 58, 46 |
| House rooms: 16 speed rungs | REDESIGN | Kept materials in place of speed | 58, 46 |
| The Cellar's food rungs, the Shrine rungs, soil tiers | REMOVE | Each sells nothing a player can feel | 58 |
| The Trophy room | REDESIGN | The Hall of Firsts, with a mounting fee a piece | 58 |
| Home maps and visiting | REDESIGN | Three looks, not five. Visiting from the Homestead | 58 |

### 1.7 Features and the platform

| System | Verdict | One line | From |
|---|---|---|---|
| The away card, the summary, the after-hunt plan, loot rules | KEEP | The best screens in the game | 46, 59 |
| The analyzer and personal bests | KEEP | Gains the hunt report | 59 |
| The coach (53 cards) and What next | REDESIGN | One table, the Path, drives all of it | 59 |
| Setups, action sets, hunt presets | MERGE | One noun, remembered a ground | 59 |
| The wiki of formulas | KEEP | The honesty feature. It must read the engine's own constants | 44, 59 |
| Live events, the rare reveal, leaderboards | KEEP | As ruled | 59 |
| Town Crier, Rounds, powders | KEEP, shut | Behind the population gate | 59 |
| Old server leftovers, the gift code, Open Halls | REMOVE | Ruled | 59 |
| Town work settled by the combat engine | REDESIGN | Closed form, for training, gathering and benches | 59 |
| The settle engine, the envelope, the journal | REDESIGN | As ruled, and not yet enough (section 4.5) | 59 |

### 1.8 Counts

Counted from each review's own table after phase B. Rows that two reviews both judged are counted in each, so the total is a size and not an exact census.

| Review | Rows | KEEP | REDESIGN | MERGE | REMOVE | ADD | DEFER |
|---|---|---|---|---|---|---|---|
| 52 combat | 81 | 46 | 10 | 1 | 3 | 12 | 9 |
| 53 world | 59 | 32 | 14 | 2 | 5 | 5 | 1 |
| 54 items | 54 | 24 | 8 | 4 | 3 | 11 | 4 |
| 55 economy | 47 | 28 | 5 | 4 | 5 | 2 | 3 |
| 56 progression | 47 | 31 | 3 | 4 | 4 | 3 | 2 |
| 57 social | 47 | 25 | 4 | 5 | 6 | 2 | 5 |
| 58 home | 58 | 34 | 12 | 1 | 5 | 4 | 2 |
| 59 features | 46 | 21 | 8 | 2 | 5 | 7 | 5 |

The formula audit adds its own count: 129 exceptions, of which 57 are accidental, and the proposed model removes 56 of them.

---

## 2. Content rationalization

The specific things to keep, remove, combine or redesign. Nothing planned for later is cut (RULED 11-21). REMOVE is only for a thing with no place in the plan.

### 2.1 Spells and abilities

| Do | What | Why |
|---|---|---|
| KEEP | All 23 live abilities except the two below | Each has a job a seat cannot play without. The healer's three heals are a real choice by how many are hurt |
| REDESIGN | **Quarry Blow** | It is Flame Strike with no element. It becomes the cast breaker: it ends a monster's spell windup |
| REDESIGN | **Rend** | Its share and its bleed rise until the axes sit at 0.95 to 1.00 of the hammer. MEASURED: the table repair alone leaves the axes last |
| CHANGE ONE NUMBER | **Turning Cut** | Unlocks at Level 1 for the axes and the hammer, 10 for the sword |
| COMBINE | 17 per-row beginner floors | One floor on the blow a cast reads |
| COMBINE | Spell versions and rune tiers | One idea: a version is the rune's tier, if your skill allows it |
| COMBINE | Six fist rows | Two rows. The Hands on mana with no element. The Palm on mana in the element you chose, with a rune as the stronger cast |
| REMOVE | Live Hand, Draw (paper) | The Palm covers Storm and Necrotic |
| ADD first | Brand, Blight, Fester, Anvil Ring, Fork Shot, Leech Bolt, Static Ward | One Necrotic or Storm spell a weapon. Fester is the best design on the list because it builds on the bleed |
| REDESIGN, then build | The other nine Necrotic and Storm spells | Sixteen stays the ruled end state. No two weapons may share a mechanic. The plan's nine repeat one leech and one mana return |
| KEEP | Six rune families, plus Storm and Bone as ruled | Rupture has one spell and is the first to fold if the catalogue ever has to shrink |
| DO NOT ADD | More heals or shells, a second support class | The healer's lane is full |

### 2.2 Weapons

| Do | What | Why |
|---|---|---|
| KEEP | Sword and shield | The only holder. Its worth depends on Deadly being a fight. MEASURED today: it makes a four 5 to 10% slower |
| KEEP | Sword alone | Not dominated after the spell rule. Say on its card that it is the tank's shield-off mode |
| KEEP | Warhammer, wand, staff | The hammer gains the cast breaker. Watch the wand: 20 to 31% faster than the hammer alone, and it stacks |
| REDESIGN | Hatchets | Onto the weakness table as "edged", and Rend's share up |
| REDESIGN | Bow | The party Ranger. "Shooters first" is its job |
| REDESIGN | Crossbow | Its own list and its shield. Its numbers stay. MEASURED: a new stat line moved it only 3 to 6% |
| REDESIGN, then ship | Fists | Two rows, as "blunt". Re-run the plan's gold test first |
| REMOVE | `weaponResist` | Read by nothing |
| DO NOT ADD | A ninth weapon, attack speed by weapon | The eight are not distinct yet |
| CHANGE | The starting weapon | Picked at creation. Every hero still keeps all six sets |

### 2.3 Equipment and items

| Do | What | Why |
|---|---|---|
| KEEP | The seven tiers, three weights, shields and spellbooks | |
| REDESIGN | Gloves | Hourly like the other armor slots through tier 7. The Catacombs glove wing stays as the won pair |
| COMBINE | Belts | Into the crafted accessory layer at the workbench |
| ADD | Jewelry tiers 4 to 7, six pieces a tier, with gem chips | Six of fourteen slots stop at Level 30 today |
| ADD | Necklace, cloak and belt perk hooks | Three slots ship plain |
| ADD | Widow's Fang, Mudlark's Mitts, Demoncaller | Designed on existing hooks and not live |
| ADD | Krell's five sidegrade weapons | The measured sample for every later unique |
| ADD | Signature stones on three grounds | The ruled Very Rare band is empty on every ground |
| ADD | Trophies on Hask, the Provost and Krell | The Hall has something to mount |
| MOVE | 14 plain Dawnsteel pieces | Off Krell's daily roll and onto the Hold's loot bands. MEASURED: a lone hero hunts the Hold about 9% slower while he waits 33.5 days in a band of 17.5 |
| CUT ROWS | Rare rows over six a ground | A four sees a Rare reveal every 7 minutes on the Warrens |
| REMOVE | Five undeclared tier 1 ladder rungs, the wave 3 uniques (ruled 23-7), three workbench salt recipes (with linings) | Duplicates and orphans |
| COMBINE | 30 imbuement parts | They are the lining parts, one a ground |
| COMBINE | 19 cooked heal foods | One ladder of about 8. Wolf, panther and bear meat become party meal ingredients |
| COMBINE | 12 feasts and 8 buff foods | Four party meals (ruled 23-6) |
| REDESIGN | Potato, Moonbloom | Potato needs a hunt consumer. Moonbloom loses 545 gold a bed a day |
| DEFER | 48 Catacomb helmets and boots beyond one wing, the Lucky ring, the maker's mark, bulk commissions | Each waits on something named |

### 2.4 Monsters and hunting grounds

| Do | What | Why |
|---|---|---|
| KEEP | Every placed monster | None is a re-skin. The problem is one level up: from Hask's Ford on, every ground is the same five roles at the same weights |
| REMOVE | 103 old monster rows, Bramble Edge, Goblin Warren, Ridge Camp, four called boss copies | In no hunt. The art stays in the library |
| REDESIGN | 13 named rares | Each gets one phase trait, so it is an event in the log |
| REDESIGN | The Sewer, the Warrens, the Muster Barrows | XP a kill about a third lower. A ground built for parties must not be the best lone ground |
| RE-BAND | Wickstead to about 20 to 32. The Slake to about 58 to 72 | Three grounds cover Levels 5 to 18 and one covers 16 to 31 |
| REDESIGN | Carter's Rest and the Ox Road | A faction pair pays alike and differs by weakness, signature and drops |
| ADD | Loot rows for the Wyvern Roost and the Catacombs ground | Two staged grounds cannot be judged without them |
| ADD | One signature a ground | Shooters are the only mechanic that ever changed a real hunt. Give every ground one |
| KEEP | Krell's Hall as the model for every hall | Do not raise Krell by hand. Every tested party wins 38 to 40 in 40, and the fix is one hall number when hand rows move to the formula |
| DO NOT ADD | Random pack affixes, a world boss | In an idle game a random modifier is a tax, and a schedule is the opposite of idle |

### 2.5 Skills

All thirteen stay. Nobody recommends a new skill, a merge of two skills, prestige, rebirth or Level-up stat points.

| Skill | Verdict | The change |
|---|---|---|
| Melee, Ranged, Defense | KEEP | |
| Magic | REDESIGN | A little max mana for every hero |
| Inner Flame | REDESIGN | Off the list of skills a death takes from. Later the home of Kindlings |
| Woodcutting, Mining, Fishing, Farming, Cooking, Smithing | KEEP | Soil tiers go. Watering folds into Tend |
| Crafting | REDESIGN | 86% of its real hours are sawing planks. It gets cloaks, belts and the cut-and-stitch step of linings |
| Runecrafting | KEEP | The Sealing Rune at 75 and 88 |

### 2.6 Mechanics

| Do | What |
|---|---|
| REMOVE | The rested bank. The two old kill ladders. The relic multiplier, the boss-of-the-day bonus and the charm ladder nothing calls. The Tower heat (ruled 11-20). The art tier damage scale. Three patches inside the party-ground formula. About 35 per-ground dials. Clan votes, upkeep, labour and 50 building levels. The bench tax. The Local tab. The live finder |
| COMBINE | Call out into keyed halls. The solo +15% into the party table. Four coin dials into one coin line. Six price lines into one wage curve. Titles, Trophies, mounts and firsts into Honors. Setups, action sets and presets into one noun. Town Works, the event and powders into one Hearth. Watering into Tend |
| REDESIGN | The tier dial (applied once). Dangerous (five monsters). The hidden Level cut (a visible line). Scaled hunts (free depth). The Level table (derived). The yard's rate. The dummy. The gold floor (a budget). The coach (the Path). Town work (closed form) |

---

## 3. Missing features

Only the absences that more than one source found or that a measurement supports. Each says why Hearthrise in particular needs it. There are fourteen, and that is the whole list. Every review looked for more and turned the rest down.

| # | Missing | Why Hearthrise specifically | Evidence | From |
|---|---|---|---|---|
| 1 | **A formula for gear past tier 7** | Levels are uncapped. Monster and hero health grow forever and weapons stop at Level 88 | COMPUTED: a hero in today's gear earns 0.91 of the pace at Level 400 and 0.47 at 1,000. MEASURED: with a curve the pace holds from Level 200 to 5,000 | 44 |
| 2 | **The company as one thing**: one Start, one plan, one return card | 76% of hunt hours are one person's own four. Starting and stopping four heroes one by one is a repeated decision | EVIDENCE: 99 of 249 hunts ended because the player's own other hero left | 46 |
| 3 | **Heroes that hunt together while their owners are away** (on-call, standing parties) | The idle-native way to play together. Nobody has to be online in the same minute | EVIDENCE: 0 hours with another person. RULED and unbuilt | 57, 46 |
| 4 | **Ground that never runs out** | Uncapped Levels need an uncapped world, and the Tower already proves the formula can make one | EVIDENCE: open ground ends on day 27 for a four. You ruled 120 | 46, 53 |
| 5 | **A permanent build choice** (Kindlings) | Two heroes with the same weapon and gear are the same hero, and you asked on 11-18 that they not be | EVIDENCE: nothing on a bar changes after hunted hour 254 | 56, 46, 52, 47 |
| 6 | **Blessings past the third** | A death is paid in hours on a game played mostly away, and the cost grows without limit | MEASURED: Deadly pays less than Normal after deaths from Level 145 | 56 |
| 7 | **A party job for each weapon that is a rule on the bar** (the cast breaker, shooters first, a status that opens a damage kind) | Idle combat is decided in town. A job works when its answer is a setting | MEASURED: a second melee hero costs a four 8 to 13% because it brings only damage. EVIDENCE: 28% of a real four's damage landed on the healer from shooters | 52 |
| 8 | **A reason to pick a ground that is not its XP rate** (a signature, a signature stone, a find list) | "Harder pays more" makes the best ground the hardest one you survive, so three of eleven grounds are scenery | EVIDENCE: Wickstead, Hask's Ford and the Muster Barrows together got 45 of 1,334 hours | 53, 54, 46 |
| 9 | **A risk reading and a bar report after every hunt** | Death is 6% with no cap and the player is not watching | MEASURED: lowest health separates every death cell from every safe cell | 59, 56, 53 |
| 10 | **A market that runs itself** | Everything else in the game is "decide once, it runs while you are away". The market still asks you to stand at a window | EVIDENCE: a cooked shark saves a Deadly hunter 924 gold at the store and the Shop pays its maker 24 | 55 |
| 11 | **Sinks that do not end** | Unlimited Levels with priced sinks that stop at tier 7 | COMPUTED: an own four buys the whole shelf to Krell in about 14 weeks | 44, 55 |
| 12 | **One table that says when every system opens** (the Path) | A wide game for players who visit for 2 to 5 minutes | EVIDENCE: ten Town lines and 53 coach cards at Level 1. One card told a hero to buy a house in minute two | 59 |
| 13 | **A saved kit a ground, a job queue, a hunt budget, a starting loot plan** | The first principle. Each removes a decision the player repeats by hand | EVIDENCE: 1,361 crop waterings, 24 dropdowns, a gold floor that defaults to 300 while Deadly can burn 121,000 an hour | 54, 46, 55, 59 |
| 14 | **A place where firsts and rare finds live** (Honors and the Hall of Firsts) | You ruled Level 200 is a big deal and nothing in the game marks it | EVIDENCE: zero uses on titles and Hearthfinds. Two to six mounts in a collection game | 56, 58 |

Looked at and not recommended by any review: a ninth weapon, attack speed, random pack affixes, a world boss, mercenary heroes for a fee, a mentor system, furniture placement, farm animals or weather, home buffs for the hunt, a second soft currency, daily quests, a login calendar and a season pass.

---

## 4. Progression and balance assessment

**Does the game support meaningful long-term progression? Not yet. It supports about the first 27 days of a four, and that part is good.** Past that point four formulas are missing or wrong, and each one is a formula-layer fault, not a content fault. With them fixed the answer becomes yes to Level 400 on what is already staged, and the open question moves from numbers to whether the long game is fun, which only players can answer.

### 4.1 Pace

| Reading | Number | Label |
|---|---|---|
| A four reaches Level 100 | 257 hunted hours. You ruled 600 | MEASURED rates, derived hours (56) |
| The pace seat's XP over the contract | 2.83 at Level 50, 2.05 at 100, about 1.45 from 185 on | MEASURED (56) |
| The Level table | 16 hand brackets, re-fitted nine times in four weeks because it chases the grounds | 44, 56 |
| Where the cost of a Level jumps | 4.1 times at Level 5, 1.9 times at 10 and at 16 | COMPUTED (44) |
| A lone hero on the three party grounds | 2.0 times the contract at the Muster Barrows' floor against 1.56 at the Pyre Field's | MEASURED (53) |
| Every weapon way alone on Normal | over the pace band today | MEASURED (52) |

The cause is one missing term. What a kill pays has no term for how fast a ground's monsters die, so every ground got a hand correction: 15 XP multipliers, 13 tier rows and a scaled-hunt number changed seven times. The Level curve, the pace target and kill XP were then fitted to each other in a circle (44). The fix is the kill reward (step R12) and then the Level law (R13).

**What the Level law does, measured.** Your table of hours becomes the law and the XP a Level costs is derived from it. For the pace seat, Krell's Hold moves from day 16 to day 27, the end of open content from day 26 to day 42, and the end of staged content from day 79 to day 143. **A lone hero pays for it.** Level 100 moves from day 42 to day 68 and Level 200 from day 136 to day 245. That is the direct result of your 11-21 ruling that the table is the four's clock, and it is the best argument in this document for bringing the second hero forward.

**The law cannot be fitted today, by anyone.** The pace seat has no single multiple until the kill reward is derived and Deadly's dials land. Any curve cut before that is a fit to grounds that are about to move.

### 4.2 The cost of a death

One death, in the pace seat's hunted hours (56, MEASURED rates):

| Level | Today, unblessed | On the Level law, unblessed | On the law with Blessings 4 to 7 |
|---|---|---|---|
| 100 | 10.6 | 18 | 2.3 |
| 200 | 36 | 68 | 4.3 |
| 300 | 60 | 133 | 4.1 |
| 400 | 102 | 208 | 3.3 |

The first checkpoint where a blessed four on a harder tier earns less a head than the same heroes alone on Normal:

| Curve | MID on Deadly | MID on Dangerous | BiS on Deadly |
|---|---|---|---|
| Today, three Blessings | Level 145 to 185 | 225 to 400 | 300 or never |
| The Level law, three Blessings | **Level 100** to 145 | 165 to 300 | 185 to 325 |
| The Level law, Blessings 4 to 7 | never at the low death count | never | never |

Three things follow. The game does not collapse to hunting alone all at once. It collapses tier by tier, Deadly first. Putting the Level table right makes it worse, because total XP roughly doubles and every death costs that much more. And the balance matrix cannot see any of it: halving the death rule moved no cell and no band, so today a change to death passes every check silently.

### 4.3 The content runway

| Door | Four, MID on Deadly, today | On the Level law | Ruled |
|---|---|---|---|
| Krell's Hold (Level 88) | day 16 to 18 | day 27 | |
| End of open content (110) | day 26 to 27 | day 42 | 120 days at Early Access |
| End of staged content (185) | day 60 to 79 | day 143 | |

The two readings of "today" are the standards' table (50) and the progression review's finer grid (56). Past Level 110 a four gains about 69 Levels a month and a region is 55 Levels. No authoring schedule keeps ahead of that with six-ground regions. Three things together meet the target: the Level law, opening what is staged, and ground that rises to your Level (Risen grounds), which is the only one of the three that keeps working after the last region.

### 4.4 Gear past Level 110

| What breaks | Where | Label |
|---|---|---|
| The last gear tier | Level 88 | 44 |
| Kill speed starts to fall on today's gear | Level 111 | 44 |
| Plate leaves its 60% cap and fades | Level 120 | 44 |
| Six accessory slots have nothing new | from Level 30. Worth 15% at Level 30 and 0.5% at 400 | MEASURED (54) |
| Priced sinks end and gold piles up | Level 110 | 44, 55 |
| Standing prices of a band over the band's gold | 0.39, 0.66 and 0.38 at Levels 60, 110 and 185, against a ruled 1.2 to 1.4 | MEASURED (56) |
| Today's gear stops keeping pace | Level 300. 0.91 of the pace at 400, 0.47 at 1,000 | COMPUTED (44) |
| Skill as a share of a hit | under a quarter at Level 400, 14% at 1,000 | COMPUTED (44) |
| Rune tiers | end at skill 60 | 44 |
| The Tower | replays floor 300 above floor 300 | 44 |

**What holds.** The monster formula, hero health and mana, the tail of the Level curve, the party split, crit and leech all hold to Level 5,000. On a gear curve that is linear in Level the pace holds from Level 200 to 5,000 with no other change (42, MEASURED on the real engine with stand-in gear).

The gear curve is the most important single formula in this document. It also decides whether a +5 to 8% upgrade "every 15 to 25 Levels" (10-25) can be true: on a straight line it is true only near Level 300. Rule the upgrade by its size (G-4).

### 4.5 Server cost. CRITICAL. PENDING `48-platform-cost.md`

You ruled at most $0.15 an account-month at 1,000 accounts. That is 60 database-seconds an account-day, and 24 at 10,000 accounts. The features review computed the path (59 section 0.2, COMPUTED from production means stretched to four heroes at 12 hunted and 12 rested hours. Not measured at 12 hours):

| Step | Database-seconds an account-day | Times the budget |
|---|---|---|
| Today | **645** | 10.7 |
| The server-cost lane (L01) | 532 | 8.9 |
| Commit at the flush (L12, ruled) | 270 | 4.5 |
| Delta envelopes (L24) | 195 | 3.3 |
| Town alone sends nothing, the hourly journal, Carry on and the plans | **180** | 3.0 |
| Town work in closed form | **147** | 2.4 |
| The ruled budget | **60** | 1.0 |

1. **Every fix in the plan leaves the account at three times the budget.** This is a system question, not a tuning.
2. **Closed-form town work is necessary and not sufficient.** Four heroes working their 12 rested hours cost 34 of the 60 seconds. You already ruled closed form for training. It has to cover gathering and benches too.
3. **What is left is the away hunt's own commit.** 34 seconds over 48 hunted hero-hours is about 10 commits a hero-hour against 36 today. That is a flush about every 6 minutes, with every death, Level, Leave, rare drop and money intent still saved at once. Sizing it is the platform review's job and its answer is not on the set.
4. **Presses are a real line.** 100 presses a day is 11 seconds, a sixth of the budget. Carry on, the loot plan by kind and a tally that takes itself are cost work as well as design work.
5. **Two thirds of the bill at 10,000 accounts is not the database.** The other lines (edge calls, Realtime, egress) were priced for 3.3 hour accounts and must be re-read at 12 hours.

Every design proposal in this review was checked against this. None adds a statement on the settle path. The hunt report reads counters the settle already writes. Heroes at work in town (57) is the one proposal with a real cost and it waits for the platform sizing.

### 4.6 Balance between styles and party sizes

| Finding | Number | Label |
|---|---|---|
| A party does not make a hero faster. It lets a hero stand on a tier it could not hold alone | 0.91 to 1.11 of a lone hero a head on the same tier | MEASURED (57) |
| A lone hero in mid gear holds Dangerous at the top of a band | 1.5 to 2.6 times the contract, with far more gold than a four | MEASURED, one seed, thin (57) |
| A four on Normal off the party grounds | 0.62 to 1.03 of the contract. It runs out of monsters | MEASURED (53) |
| The wand alone against the hammer | 20 to 31% faster at Levels 30 to 110 | MEASURED (52) |
| The shield tank alone | 0.84 to 0.92 of the hammer | MEASURED (52) |
| Dropping the healer for a third mage | 22% faster at Level 60, no deaths | MEASURED, one seed (52) |
| Two ruled party bands cannot both be met | P6 wants a four at 1.15 to 1.25 of a lone hero on the same tier. P7 wants it at 1.8 to 2.5 of the contract. A lone hero on Deadly already reads 1.9 to 2.8 | MEASURED (57) |

So "solo viable alongside rewarding fours" is half true today. Solo is viable. Fours are not yet rewarding in the cells where a lone hero holds the tier, and the fight does not ask for roles. The cause is the tier, not the party table. Both social patches on the table regressed a ruled band.

### 4.7 Decisions and milestones between the big upgrades

| Stretch | What is there today | What the reviews add |
|---|---|---|
| Levels 5 to 10 alone | Two grounds, two spells, no danger on Normal. Both light players stopped here | The second hero. A starting weapon. The Path naming the next thing at every Level |
| Level 10 to 32 | One hero until 400,000 is banked | The pair, the Sewer as a real party ground, Dangerous on five |
| Level 30 to 110 | A ladder that equips itself. A slot fills in an hour and nothing changes for fifteen Levels | Jewelry tiers 4 to 7, perks sized by case, signature stones, a signature a ground |
| Past Level 45 | A Level is hours for +10 HP | Honors at round Levels. Kindlings every ten Inner Flame levels |
| Past Level 110 | Nothing is live | Risen grounds, Krell's five, the Catacombs wing sample, patterns |

---

## 5. Systems interaction analysis

Your brief asks that a local change be traced before it is recommended. The reviews did that with the matrix. This section puts the traces together: which proposals move each other, and which must ship in one release.

### 5.1 What the matrix flagged

Every patch was played on a scratch copy of the real engine with the same dice before and after. A patch names its targets, and anything else it moves is flagged UNINTENDED.

| Patch | What it plays | IMPROVED | REGRESSED | UNINTENDED | What it decided |
|---|---|---|---|---|---|
| combat-1 | Axes read the sword's weak side | 0 | 2 | 1 | Keep, and not enough. Only the axes moved, +1.5 to +4.8% |
| combat-2 | The crossbow's heavier stat line | 0 | 3 | 5 | **Withdrawn.** Worth 3 to 6% |
| combat-3 | Magic adds 0.5% max mana a level | 19 | 5 | 0 | **PASS.** Store bills fall 2 to 4%, no pace moves |
| combat-4, combat-5 | A physical strike reads weapon weakness, alone and with combat-1 | 3 | 7 to 8 | 29 to 31 | Small, at most 3.5% on one way. The unintended rows are the pace move seen from other bands, plus dice |
| world-1 | The party-ground formula removed | 0 | 0 | 0 | **Phase A's cause refuted.** A lone hero's kills double and its XP does not move. The formula feeds a four on Normal |
| world-2, world-2b | Dangerous brings Normal's pack, or five | 0 | 0 | 0 | The pack as built is not a tier. **Five works** |
| world-3 | A signature at double dose on the Slake | 0 | 0 | 0 | Nothing on Normal. On harder tiers it bites small parties first. Nothing off the Slake moved |
| economy-1 | The store's heal prices on one line | 15 | 9 | 0 | **PASS.** A lone hero's Deadly bill falls 49%. A four's bill moves 0.0% |
| economy-2 | Every supply at full effect | 0 | 0 | 321 | An upper bound on what an idle market does to combat: a four on Deadly up to 12% faster and up to 30% safer |
| economy-3 | Gold in falls 15% | 0 | 40 | 6 | **Default salvage withdrawn** |
| progression-1 | The Level law | 4 | 1 | 7 | The ruled hours are met at Levels 300 and 400. Six of the seven unintended rows are one finding: sinks halve |
| progression-2 | The death share halved | 0 | 0 | 0 | **The matrix cannot see a death's cost** |
| progression-3 | The rested bank off | 0 | 0 | 0 | An identity. Removal is free |
| social-1, social-2 | The party size row, both ways | | | | Lowering the pair broke a ruled band on 16 rows. Raising the four pushed it to 3.7 times the contract. **Deferred** |

The world patches read 0, 0, 0 because the ground axis carries no band rows yet, not because nothing moved. The world review read the cells by hand. That is a hole in the instrument (section 7.2).

### 5.2 What must ship with what

| # | These ship together, or in this order | Why | Source |
|---|---|---|---|
| 1 | **The Level law (R13) with sinks as band gold (R16) and Blessings 4 to 7. All three after the kill reward (R12) and after Deadly's dials (L16)** | MEASURED: the law doubles a band's length, so typed sinks fall to half price (G-10 from 0.39 to 0.19). The law doubles total XP, so a death costs twice as much and Deadly switches off at Level 100. And the law cannot be fitted until R12 and L16 make the pace seat's multiple one number | 56, 47, 44 |
| 2 | **The kill reward (R12) with the per-ground tier dials, the floor-16 pull rule and the party-ground XP cut** | Each of those numbers exists because the reward has no kill-rate term. Remove them before R12 and the first grounds overpay again | 44, 53 |
| 3 | **The gear curve (R10) before the kill reward (R12)** | The reward's reference line has to be measured on heroes whose power keeps pace | 44 |
| 4 | **The tier dial applied once (R7) with one step of the dial** | Harder tiers get a little easier on armor and Defense trains slower there. The dial may need one step up to hold the ruled lowest-health bands | 44 |
| 5 | **Deadly as a fight (L16) before any change to the party XP table, the size row, or status pairs** | MEASURED: until Deadly asks for a tank and a healer, every role idea is worth nothing and every table change crowns the mage four | 52, 57 |
| 6 | **Dangerous on five with "Deadly brings six" and a ruling on the 11-16 line** | The six per-ground overrides become one field. On Hask's Ford a four on Dangerous then earns under a lone hero on Dangerous | 53 |
| 7 | **The hidden Level cut removed and the visible Level range added, in one step, before on-call heroes cross accounts** | MEASURED: with no rule a Level 5 behind a Level 37 party earns 6 times its pace. With on-call that is a stranger's hero, not your own alt | 57, 44 |
| 8 | **The second hero early with a re-read of early income and the first-slot guard (G20)** | It doubles an account's early coin and town labor. Slots 3 and 4 then carry the timing of the full four | 46, 59 |
| 9 | **The idle market only after the tiers are sized on full-effect supplies** | MEASURED: full-effect supplies make a four on Deadly up to 12% faster and 30% safer. If Deadly is sized on store supplies and then the market opens, Deadly gets easier for everyone who trades | 55 |
| 10 | **Tempering pays the difference (23-2) with R16 sized on a hero who pays the difference at every tier** | COMPUTED: otherwise a careful hero pays 0.5 to 0.9 of a band's gold at tiers 4 to 6 where you ruled 1.0 to 1.4 | 47 |
| 11 | **Jewelry tiers 4 to 7 with gem chips, the 6% share of the gear curve, and the matched-hero cap** | MEASURED: a point a tier to tier 7 would add 5 to 13% Level XP at Level 110, twice the budget. Without chips a tier is finished the day it is outgrown | 54, 47 |
| 12 | **Perks sized by case with the saved kit a ground** | A perk for one ground is a chore unless the kit changes itself when the party moves. MEASURED: all perks at five times is +9 to +11% XP and 20 to 29% less damage for a four, so five times is the ceiling | 54 |
| 13 | **Plain Dawnsteel onto the Hold's loot bands with Krell's five weapons** | The five replace the rows so the daily roll does not read empty. Krell's gem stays on the roll because the tier 7 Hallmark is built on it | 54, 47 |
| 14 | **Call out merged with "a mid-region boss's pieces stay repeatable"** | Otherwise the Roost Mother's five pieces stop counting as a family's first unique and the item plan's grid fails | 47 |
| 15 | **Risen grounds with one drop rule** | A risen ground drops its own rows at its own rarity, or the Glade becomes the cheapest source of a band 9 body | 47, 53 |
| 16 | **Signatures with linings, on the harder tiers, after the back row is hit as in real play (V4)** | A signature needs an answer the player can bring, and the harness healer takes 0.5% of the damage where the real one takes 28% | 53 |
| 17 | **The weakness repair with Rend's share, after the spell floor (R6)** | So each number moves once | 52 |
| 18 | **Seven Necrotic and Storm spells with leech linings measured together** | Reave, Leech Bolt and Tithe heal from damage and so does a leech lining. They stack | 47 |
| 19 | **The dummy at half fee with the ruled yard fee. The yard's rate with the fee following it. Both in the same change as closed-form town work** | The dummy at "no fee" pays back in 2.8 days and deletes the one sink that grows forever. A rate that rises without the fee makes the sink cheaper a point of XP. And closed form rewrites how a training hour is paid | 55, 58, 59 |
| 20 | **The heal price line with heal size on the gear curve, after the store-bill fault closes** | The food ladder stops at 396 hit points. MEASURED: past Level 400 a cheaper shark is just a smaller bill | 44, 55 |
| 21 | **The three workbench salts leave in the lane that ships linings. The Cellar's food rungs come off sale with the cut of the effect they sell** | Until linings exist, salts are all Crafting makes at 45, 60 and 75 | 47, 58 |
| 22 | **The Honors page before the Hall of Firsts, and both before visiting** | The Hall reads Honors rows. A wall nobody can visit is seen by nobody | 56, 58 |

### 5.3 The three chains that reach furthest

**The pace chain.** Kill reward, then the Level law, then everything timed in days. Putting the pace right moves Krell from day 16 to day 27, halves every typed sink, doubles the cost of a death, pushes the lone hero's Level 200 from day 136 to day 245, and turns a 14 week shelf of sinks into about 28 weeks. It is the largest single change in the program and five other proposals hang on it.

**The tier chain.** Deadly's dials decide whether roles exist, whether the party table can be simplified, whether a lone hero has a hard tier, what a signature costs, what the store bill is, and therefore what the wage curve and every price in hours read. Nothing about party gold or party survival should be priced until it lands.

**The gear chain.** The gear curve sets the reference hero. The reference hero sets hit chance, the kill-rate reference, the armor line's guard, what a unique may spend, what a jewelry share is worth, what a band is, and so the Luck numbers and Tempering ladders that are keyed by band. Sizing a band at a tier's worth in place of +6.5% changes all of those at once.

---

## 6. Prioritized recommendations: the top 10

Ranked by expected overall benefit, then confidence, then cost. Complexity is S, M or L.

**Not ranked, because nothing below can be judged without it: make the instrument true.** The four harness faults (section 7.2), a band that reads XP after deaths, band rows on the ground axis, and the no-number formula steps of 0.2.144 (44's V1 to V5, R1 to R5, R7, the floor half of R6 and the fold of R8). Layer: tools and identity refactors. All of it fits the beta.

| # | Change | Layer | Evidence | Complexity | Risk | Depends on | When |
|---|---|---|---|---|---|---|---|
| 1 | **Server cost to 60 database-seconds.** Town work in closed form for training, gathering and benches. Then the away hunt's flush sized near 6 minutes | Architecture and one formula (the yield rule) | COMPUTED: 645 today, 180 after every planned fix, 147 with closed form, 60 ruled. PENDING 48 for the last step | L | Medium. Both-paths tests and seeded rolls | L12, L13, L19, L24, the platform review | The planned fixes and closed form in the 0.2.144 beta. The flush when 48 lands. **Critical** |
| 2 | **Make Deadly a fight, and give the lone hero a hard tier.** Deadly sized so a shield and healer four holds it and a hammer front or no healer does not. The tier dial applied once. Dangerous brings five | Coefficient (`tierDanger`, `tierHp`, `tierPull`) and one formula fix (R7) | MEASURED: hammer and three mages fastest at Level 60 with no deaths. Four mages hold Deadly. Dangerous on five holds near 40% health with no deaths | M | Medium. Party survival is read on an uncalibrated harness until V4 | V2 to V4. Lane L16 | **0.2.144 beta** |
| 3 | **The second hero on the first evening, and the company as one thing.** About 10,000 gold. One Start, one plan, one return card. A starting weapon picked at creation | Content row (a price), client and intents | EVIDENCE, thin, with three lanes converging. HYPOTHESIS that a pair holds a stranger. Playtest: two invite waves, day 7 return | S for the price, M for one Start | High. Reverses a ruling made three times. Doubles early income | Nothing for the price | **0.2.144 beta**, as the beta's own test |
| 4 | **The gear curve in the game.** Linear in Level, a band a tier's worth, uniques spend it at exchange rates, jewelry and cloaks ride it to tier 7 | Formula (R10, R11) and content rows | COMPUTED: the game ends near Level 300 without it. MEASURED: pace holds 200 to 5,000 with it. The band size is HYPOTHESIS until one band is played | M | Medium. The first formula that reaches every item | V1 | The ruling now. Jewelry tier 4 during the beta. The curve with the Morrow Hills |
| 5 | **The kill reward follows the pace line.** One tier table. Party grounds keep their type and pay about a third less XP a kill | Formula (R12) | MEASURED for the cause (world-1) and the overpay. The derived factor is new | L. The largest single change | High. Moves XP on every ground at once | V1 to V5, R7, the gear curve | After the beta opens |
| 6 | **The Level law, Blessings 4 to 7 and sinks as band gold, as one release** | Curve (R13), content rows, coefficient and server (R15, R16) | MEASURED: the law meets the ruled hours at 300 and 400, halves sinks, and brings the Deadly break to Level 100. The ladder holds a death near five hours | M | Medium. Slows every player past Level 50 about twofold. Money surfaces | 5, and Deadly's dials | At the wipe. No live hero's Level may move before it |
| 7 | **Ground that rises to your Level, free.** Replaces scaled hunts by the hour | Formula (the stat formula at any Level, R22) and one drop rule | EVIDENCE: 0 uses of scaled hunts, day 27. Two lanes converged. HYPOTHESIS that an old ground at your Level feels like content. Playtest: two risen grounds for two weeks | M | Medium. Players settle in one ground. New regions lose pull | 5 for its XP share. A signature a ground for its reason | Before Early Access |
| 8 | **Bosses pay what grounds never drop.** One boss door. Plain Dawnsteel into the Hold. Krell's five weapons. The three designed pieces and three signature stones | Content rows, one hook (a spell change) | EVIDENCE: 19 keys and no Hall fought. MEASURED: a lone hero is 9% slower through the Hold while he waits | M | Low to medium | Deadly's dials, jewelry tier 4 | **Pulled forward into the beta period**, because a four is at Krell on day 18 with two uniques in the game |
| 9 | **On-call heroes and standing parties, with a visible Level range on party XP** | A system, and one formula (P23) | EVIDENCE: 0 hours with another person. RULED and unbuilt. HYPOTHESIS that finding your hero came back from a friend's hunt is fun. Playtest: two to four accounts on different schedules for a week | L | Medium. Death and gold on a lent hero. A trade surface for Security | Carry on (L07) | **0.2.144 beta** as its own lane, friends only. Clans after 50 accounts a day |
| 10 | **The return made readable.** The hunt report (risk and what each bar rule did), the Path, a tally that takes itself, a starting loot plan, a hunt budget, setup slots free | Content rows and screens over counters the engine already writes | MEASURED: the low-health reading separates every death cell from every safe one. EVIDENCE: 3,251 untaken wolves, ten Town lines at Level 1, 0 paid setup slots | S to M each | Low | L16's lowest-health tally, the loot plan by kind | **0.2.144 beta** |

**Just outside the ten, and why.** The idle market (L, needs a population, and must wait for the tiers). Kindlings (a spec and a paper sample now, built after the combat laws). A party job for each weapon (waits for item 2). The wage curve (waits for the store-bill fault). Each is in section 8.

**What I would not spend time on now.** A ninth weapon, the second nine Necrotic and Storm spells, the clan castle, bulk commissions, visiting, regions past the Morrow Hills beyond a sketch, and any daily or seasonal system.

---

## 7. Validation plan

### 7.1 What the matrix proves

The matrix plays a patch on a scratch copy of the real engine and the real data and compares it with the untouched tree on the same dice. Three kinds of proof cover the whole formula roadmap (44 section 6).

| Kind | The claim | The proof |
|---|---|---|
| Identity | "This refactor changes no number" | The diff is empty. Pass or fail with no tolerance. Proven tonight for the rested bank and the bench rung swap |
| Coefficient | "This knob moves these bands and nothing else" | The moved bands equal the patch's targets. Proven tonight for the heal line (0 unintended) and Magic's mana (0 unintended) |
| Derivation | "This typed number is now derived" | The typed numbers are deleted and the band they held stays in tolerance on every ground. Not yet run for any step |

The representative run is Levels 10, 30, 60, 110, 185, 400, 1,000, 2,000 and 5,000, every weapon way, three gear states, lone and four, Normal and the hardest tier. Levels past 185 are projected and say so.

### 7.2 What calibration must fix first. PENDING `51-baseline.md`

A before-and-after diff is worth what the harness is worth. This is written from 44 section 6.1 and the caveats each review printed. The baseline lane's own page will replace it.

| # | Fault | What it distorts | Done when |
|---|---|---|---|
| V1 | The simulator straight-lines skills past the measured career | A Level 400 hero plays with skill 198 where the curve allows about 132. Every cell from 185 up is too kind by about 24% damage taken | Skill at 400 and 1,000 is within 5% of the curve's own answer |
| V2 | Two cell builders disagree. The grid's four killed 558 an hour at Krell's Deadly where the real four killed 1,251 | Every pace, drop-hours and gold number for a four. The matrix's own builder now reads 1,386, which is 11% high | One builder. The Krell cell within 10% of 1,251 |
| V3 | Two tools give two death counts for the same cell, and a dead harness hero stands up at once | Every death band. A death count on a failing cell is a retry count | One death rule, the game's. The same cell and seeds give the same deaths in both files |
| V4 | Harness seats take about 1% of the damage. The real healer takes 28% | Every party survival band and the supply bill. Shooters, signatures and "shooters first" cannot be measured at all | The tank's share within 10 points of 69% |

Four more holes the reviews found in the instrument tonight:

| Hole | Found by | The fix |
|---|---|---|
| The party store bill reads 1.9 times real, because the harness buys the Level's own rune tier and real players do not (F5) | 44, 55 | The kit rule reads what real players buy. Until then no party gold number drives a price |
| No band reads XP after deaths, so a change to the death rule passes silently | 56 | One band: a tier that a kit holds must pay more after deaths than the tier below |
| The ground axis carries no band rows, so every world patch read 0, 0, 0 | 53 | Band rows a ground: the ladder rule, the party-ground check, the lone hard tier |
| No pair or three cells, and one lineup for the four | 52, 57, 59 | Pair cells. The four lineups Deadly has to turn from green to red: hammer front, no healer, three mages, four mages |

**What can be judged today, honestly.** A four's pace: yes, within about 5 to 11%. Identity patches: yes. A lone hero's store bill: direction. Party survival, party gold, a pair, a three, anything past Level 185: report only.

### 7.3 What only real players can settle

No simulation result should be offered as an answer to any of these. The first is the one that matters most.

| # | Question | The playtest | Reads as |
|---|---|---|---|
| 1 | **Does a stranger with a pair stay?** | 20 to 30 strangers, not friends, 14 days, two groups. Group A plays today's ladder. Group B gets the second hero at about 10,000 gold. Five first sessions recorded with the player talking aloud | Day 2 and day 7 return, share reaching Level 10, 16 and 32. If B is not clearly better, the ruled ladder stands |
| 2 | Do players wear and trade a named piece, or sell it too? | The three sample pieces and three signature stones in both groups | Worn against sold. Does the player set the stone, sell it or sit on it |
| 3 | Is finding your hero came back from a friend's hunt fun? | Two to four real accounts on different schedules for a week with on-call live | Hunt hours with another account in them. Ask them |
| 4 | Does an old ground at your Level feel like content? | Two risen grounds past 110 for the Krell-level accounts, two weeks | Share of frontier hours on them. Hours a day hold |
| 5 | Does anyone change a setup for a ground? | Two grounds in one band, opposite signatures, equal XP | Ground-specific setups a hunt. Share of hunts started with a saved kit |
| 6 | Is a broken cast satisfying, or invisible in an idle hunt? | A hammer four on a caster ground for a week | Do players keep the rule on "when a monster is casting" |
| 7 | Does the slower table past Level 50 feel like progress or a wall? | The two heavy players after a week on the new table | Sessions a day from Level 50 to 60, before and after |
| 8 | Is a death read on the morning card a quit moment? | Beta telemetry on every death costing over one Level | Did the account press anything within 48 hours. Red if returns drop by a third |
| 9 | Does the risk reading change the tier a player picks? | Before and after the hunt report | Share of hunted hours by tier. Deaths in 1,000 hours on Deadly |
| 10 | Do standing orders fill when nobody visits a market? | 30 or more accounts for two weeks with the gauge on | Orders filled a day. Share of refills that bought player stock |
| 11 | Do players pick Luck over gold when both numbers are shown? | The loot plan's own counts after salvage ships | By item kind |
| 12 | Are Kindlings a build or a formality? | Five sample rungs on paper, then on heroes | Under 80% of heroes on the same pick |
| 13 | Is one Rare reveal every 40 minutes a moment? | The same four on the Warrens for three hours before and after the cap | How many reveals they look at |
| 14 | Does hiding systems until their Level help, or hide depth? | A blind first hour with locked lines shown and with them absent | What the reader expects to unlock |
| 15 | Is the bar fun to tune, or copied once and never opened? | The bar report live for two weeks | Slots changed a hero a week |

Playtests 1, 2 and 9 fit the Discord playtest as it opens. 3, 10 and 11 need more accounts than the beta has on day one.

---
