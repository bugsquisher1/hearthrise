# Balance program 60: the game review

Lane `lane/d-game-review` (game designer, 2026-11-21), on `set/v0.2.144`. The briefs are Tyler's, `45-design-brief.md` and `40-formula-brief.md`. This is the synthesis his section 9 asks for: seven deliverables for the whole game, from everything the night produced. **No game code, data or migration was changed. Nothing here is built. Every change is a recommendation for Tyler to rule on.**

What it rests on: the formula architecture (44) and its three audits (41 to 43), the Game Director's blind read (46), the itemization fit (47), the standards and the 11-21 rulings (50), the eight design reviews with their phase B measurements (52 to 59), and the rulings of record.

**Two inputs had not landed when this was written, and their sections say PENDING.** `48-platform-cost.md` (the server-cost path to 60 database-seconds) and `51-baseline.md` (the calibrated baseline). Section 4.5, section 7.2 and call GR-1 are written from what is on the set and will be re-issued when they land.

**The party model is on hold. PENDING `49-party-model.md`.** You challenged the second-hero recommendation as assumed without real evidence, and asked which party and character model gives the best MMO feel: everyone runs their own four, one hero online for each account with the others open for hire, or all four at once with 8-person open-world hunting areas. A study lane is answering that. Until it lands, every call that depends on the answer is ON HOLD and carries no recommendation: the second hero (GR-2), on-call heroes and standing parties (GR-10a), the Level range on party XP (GR-10b), when clans ship (GR-10c), the party XP table inside GR-3, the party bands (GR-67), the live finder inside GR-69 and the company as one Start (GR-80). Their evidence is kept and stated at its real size.

**This is the second issue.** The cold audit (`61-review-audit.md`) found 5 Critical, 14 High, 13 Medium and 8 Low faults in the first issue, most of them in the Ruling column, the evidence labels and the claims of convergence. Every Critical and High fix is applied here, and section 9.7 lists what changed. The call ids are now GR-1 to GR-88, because GR-1 to GR-12 are already the gold bands of the standards. The numbers are the same as before.

**The frame (Tyler, 2026-11-21).** "At this point the current game is irrelevant. We can use some of the data, but in the end it's all going to be useless once we rework all the systems." Every recommendation here is judged against the target game, which is the standards' bands and your rulings. Today's numbers are evidence about the engine and about people. They are not a baseline to protect. Implementation cost counts. Risk to today's live heroes does not, because everything is wiped at Early Access.

Labels. **MEASURED** means the real engine played it, through the matrix or a lane's own run. **COMPUTED** means arithmetic on the game's own numbers. **EVIDENCE** means counted from the four real players or seen in play. **HYPOTHESIS** means a design judgment that needs a playtest. **RULED** carries the date or id of your ruling. **PENDING** means a document that had not landed. **PROVISIONAL** marks cells from Level 185 up, where gear and grounds are stand-ins. Time is on the 12 hour frame: Krell's Hold is day 18 for a four and day 39 for a lone hero.

Terms used below. **The contract** is the pace line: the Level XP an hour that the ruled table of hours asks for at each Level. **The pace seat** is the hero your table is the clock of, which you ruled is a mid-geared four on the hardest tier it holds. **LOW, MID and BiS** are the three gear states of the standards: just arrived in a band, what the game hands you, and best in slot. **P6 and P7** are two party bands of the standards (a four against a lone hero on the same tier, and a four against the contract). **V1 to V5** are the five steps that make the simulator true, and **R1 to R23** are the steps of the formula roadmap, both from 44. **L16** is the plan's harder tiers lane and **L17** its spell lane. **The matrix** is the tool that plays a change on the real engine and compares before with after.

The measured numbers all carry one caveat, stated once here and in full in section 9. The harness is not calibrated yet. Its four kills 11% more than the real four, its tank takes 96% of the damage where the real one takes 69%, and its party store bill is 1.9 times the real one. A four's pace can be trusted. Party survival and party gold are direction only.

---

## 0. The answer

**Would we build Hearthrise the same way from scratch? The engine and the loop, yes, almost line for line. The game around them, no.**

Nine documents answered this without reading each other in phase A, one from the top down and eight from the bottom up. They agree on what to keep: the idle instanced hunt, the action bar and its rules, tiers as dials, the per-use store, roles from the worn set, the return card, the Tower, the one stat formula that writes monsters, and the gold formula. Not one review asked to rebuild any of those.

They also agree on what is wrong, and it is one sentence. **Hearthrise is a strong hunt with a wide shelf of systems around it that do not yet lead anywhere.** The shelf fails in five places that every review found from its own side:

1. **The game the screen teaches is not the game people play.** The screen teaches one hero on Normal. Real play is one person's own four on Deadly. The bridge is 400,000 gold, and nobody who stayed on the first side passed Level 9.
2. **Deadly does not ask for a party or for roles.** MEASURED on a harness that is not yet calibrated for party survival, so direction only: a hammer and three mages with no healer was the fastest four at Level 60, and four mages with nobody in front held Deadly with no deaths.
3. **Gear is coin.** Players sold 86% of what dropped and wore 0.9%. Six of fourteen slots stop at Level 30. There is no formula for gear past Level 88.
4. **The long game is not there yet.** COMPUTED: a four leaves open content on day 27. Levels come at more than twice the ruled speed. No new sink appears past Level 110, the shelf is bought out in about 14 weeks, and gold piles up from then. And if Deadly is made as deadly as you ruled, a death costs more than Deadly pays from Level 145 to 185.
5. **No player needs another player.** Zero hours of two people in one hunt in 1,334. Zero real market purchases.

On your worry, that twenty good systems might not form one good game: you were right to worry, and the reviews say where. The systems form one game for the two players who run four heroes on Deadly. They do not form one game for a new player with one hero, and they do not connect players to each other at all.

**What that means for the plan.** No new engine and no new big system. The work is to fix the formulas the long game stands on (gear, kill reward, the Level table, prices), make Deadly a fight, decide what the party and character model is (study 49), and build fewer of the shelf's parts and make each of them lead somewhere. Of about 440 rows the eight reviews judged, 55% are KEEP, and most of the rest are REDESIGN or ADD on mechanics that already exist.

### 0.1 Where they agree, and how independent the agreement is

Nine documents read one baseline of four players, one set of rulings and one plan. Agreement on what that baseline shows is one reading, not nine. Agreement counts as independent only where two phase A lanes reached the same finding without reading each other. The last column says which rows are.

| # | The finding | Who reached it | What it rests on | Independent? |
|---|---|---|---|---|
| 1 | The second hero should come much sooner | 46 proposed the first evening at about 10,000 gold. 59 in phase A proposed opening it at Level 10 with no price. 59 took 46's number in phase B | EVIDENCE, very thin: the two light players are 18 hours of 1,334 between them, and one of them had two heroes | Partly. The direction was reached twice. The price was reached once |
| 2 | Heroes that hunt together while their owners are away come before clans and castles | 46 (lent seats). 57 carries your ruling 25-1 (on-call heroes) | EVIDENCE: 0 hours with another person, visits of 2 to 5 minutes | Partly. One side is a ruling |
| 3 | An account is a closed economy, so the market has nothing to do | 46 (seam 2), 55 | EVIDENCE: 7 listings, 0 real purchases | Yes |
| 4 | Gear is coin | 46, 54, 55 | EVIDENCE: 34,756 pieces dropped, 298 ever worn | Yes |
| 5 | An old ground should be huntable at your Level | 46 (change 4), 53 (Risen grounds) | COMPUTED: a four is out of open ground on day 27. No real account has passed about Level 79. Scaled hunts, the ruled form of this, are switched off, so their zero uses say nothing | Yes for the idea. The evidence is a projection |
| 6 | One boss door. Call out folds into keyed halls | 46, 53, 54, 59. 47 (C15) agreed after reading them | EVIDENCE, thin: one real use of Call out. 19 Hall Keys held and no Hall fought is one four in one ten hour window | Partly |
| 7 | The game has no permanent build choice, and endless Levels need one | 46 (marks), 56 (Kindlings), 52 (style picks). 47 (C10) agreed after reading them | COMPUTED from the spell data: nothing on any bar changes after hunted hour 254 | Partly |
| 8 | 6% with three cheap Blessings is a fee, not a risk | 46, 56 | COMPUTED: if Deadly is tuned to the ruled death count, a blessed MID four earns less than the same heroes alone on Normal from Level 145 (at 100 deaths in 1,000 hours) to 185 (at 50) | Partly. Same problem, two different fixes |
| 9 | The starting hero is the worst lone pick | 46 (from play), 52 (MEASURED: 0.84 to 0.92 of the hammer alone), 59 | The sword and shield is ruled slow alone on purpose and is what every new player gets | Yes |
| 10 | Deadly does not need roles | 52 and 57, two phase B runs on one harness | MEASURED, direction only. 52 read four mages at +2% and +7% kills against the mixed four. 57 read 8 to 15%. The harness healer takes 0.5% of the damage where the real one takes 28.5% | No. One instrument |
| 11 | A room should not sell speed, and Inner Flame is a dead end | 46, 58, 56 | You already ruled the speed rungs out on 11-20 (26-1). EVIDENCE: 9 of 12 real heroes parked Inner Flame | No for the rungs, which were ruled. Yes for Inner Flame |
| 12 | The player needs a risk reading before the death | 53, 56, 59 | The lowest-health tally is in the plan's lane L16, which every review read. MEASURED: all 9 death cells read under 50% lowest health. So did 8 cells with no death. One seed, one hour, and 115 of 207 cells at Level 185 or over | No |
| 13 | One floor on the blow a cast reads, in place of 17 per-row floors | 41 and 52. 44 is the merge of 41 | Same effect, one number | Partly |
| 14 | Setup slots should be free | 55, 59 | EVIDENCE: 0 purchases. It charges for a remembered decision | Yes |
| 15 | Hold every dark system shut until a stranger stays twenty hours | 46, 59 (the population gate) | EVIDENCE: 14 built systems no player can reach | Yes |

Six rows are independent, six are partly and three are not. The strongest are rows 3, 4, 9, 14 and 15.

Three things agreement does not prove. It proves the problems, not the fixes. Three of the fixes were proposed by two lanes and then withdrawn when one of them measured it (salvage by default, party XP by size only, removing the party-ground formula). And all the real-player evidence rests on four people.

### 0.2 Where they disagree, with one recommendation each

| # | The disagreement | Side A | Side B | Recommendation |
|---|---|---|---|---|
| 1 | The first hero slot | 46, 59: about 10,000 gold | RULED three times (11-09, 11-20, 11-21): 400,000. 57: keep it and let on-call heroes give the early party | **ON HOLD, PENDING 49.** No recommendation. 18 hours from two players, one of whom had two heroes, cannot carry one (GR-2) |
| 2 | Party XP by size only | 46, 57 in phase A | 52, and 57 after it measured | **ON HOLD, PENDING 49.** What is known: on the uncalibrated harness, four mages are the best four on a size-only table (GR-3) |
| 3 | Named build pieces from the Sewer on | 46 | RULED 11-20 "generous to Krell, rare after". 54 withdrew its own early-piece call on the 12 hour clock | **No re-open. Ship the three designed samples and the signature stones** (GR-40). A band before Krell lasts one to seven days |
| 4 | Salvage by default and a token Shop price | 46, 55 in phase A | 47 (C3), and 55 after it measured | **Salvage ships as a choice, as ruled** (GR-46). MEASURED: 15% less gold in made 40 gold bands worse and none better |
| 5 | What the market is for | 46: rare pieces and Crowns only | 55: an idle market that also routes supplies | **Both, in order.** The order book and rare pieces first, supplies through the one-tap refill second (GR-50) |
| 6 | The Catacombs descent as a wing of the Tower | 46 | RULED 11-16 and 22-4. 47, 56 | **Keep the mode.** 46 was written without 22-4, and "fight on what you carried down" is the best new decision in the endgame (GR-36) |
| 7 | Death at 6% flat | 46: take the cap | 56: keep 6% and add Blessings 4 to 7 | **The ladder** (GR-7). It keeps your ruling's words and gets the cap's effect, paid in gold |
| 8 | The build choice | 46: a mark every five Levels | 56, 47: Kindlings on Inner Flame | **Kindlings** (GR-61). Marks put a build on Level, which you have kept out of the blow twice. Kindlings reuse a skill and drops that exist |
| 9 | Necrotic, Storm and the fists | 46: defer them whole | RULED 11-18 and 32-6. 52, 47 | **Seven spells first, after Deadly is fixed.** Sixteen stays the end state (GR-16, GR-17) |
| 10 | Faction skills with power | 46: story and outfits only | RULED 31-8. 57 | **Keep the ruling**, and choose the side per hero (GR-71) |
| 11 | The party-ground formula | 53 in phase A: remove it | 44, and 53 after it measured | **Keep it as one encounter type.** Its XP per kill becomes an output of the kill reward (GR-5) |
| 12 | The size of a gear band | 44: a fixed +6.5% step | 47 (C20): a tier's worth, about +24% | **A tier's worth** (GR-4). +6.5% is twenty bands from Level 110 to 400, each about a quarter of an upgrade. HYPOTHESIS until one band is played |
| 13 | Plus skill on chest weapons | 44: make it a percent of the blow | 47 (C24): 22-2 already made both rulings hold | **Keep the flat number as ruled** (GR-26) |
| 14 | The yard's flat rate | 44, 58: follow the skill level's cost | RULED 11-14. 56: decide past Level 300 | **Follow the curve, capped at half of hunting, with the fee following the rate** (GR-54). On a game with no skill cap a flat rate retires the yard for most of the game |
| 15 | The hidden Level cut on party XP | 44: remove it now, as RULED 11-08 | 57: replace it in the same step | **ON HOLD, PENDING 49.** What is known, MEASURED: with no rule a Level 5 hero behind a Level 37 party earns 6 times its own pace (GR-10b) |
| 16 | Called boss rooms | 44: keep both doors, documented | Four reviews and 47 | **Merge** (GR-28) |
| 17 | Curing | 46, 58 in phase A: do not build | RULED twice (11-18, 26-7) | **Build it last, as a standing order.** Do not ask a third time (GR-47) |
| 18 | One Great Hearth | 46: merge Inner Flame, Town Works, the event and powders | 57: only if the staged-gift engine survives | **Merge the three town parts into one Hearth. Inner Flame stays a skill and pays in Kindlings** (GR-82). HYPOTHESIS |

### 0.3 Where I challenge you

Three places where a ruling should move or be completed, in order of how much it matters. The first issue of this review also challenged the 400,000 gold first slot. The audit is right that 18 hours from two players cannot carry that, and you have since challenged it yourself. It is on hold, pending the party model study (GR-2).

1. **$0.15 an account-month with heroes working all 12 rested hours.** COMPUTED: every fix in the plan takes an account from 645 database-seconds a day to 180. The price you ruled works out to about 60, and that 60 is a best case on assumed list prices. The two rulings do not fit together without one more system change (section 4.5). This is the one Critical item that is not about fun.
2. **6% flat with no cap, together with the Deadly death band.** I am not asking you to reverse either. They are two targets you ruled, and COMPUTED they do not fit together past about Level 100 while a four on Deadly stays the best way to level (11-16). At the band's high end, 100 deaths in 1,000 hours, a blessed MID four on Deadly earns less than the same heroes alone on Normal from Level 145 on today's curve and from Level 100 on the recommended Level law. At the death rate real fours had, 2.2 in 1,000 hours, Deadly never switches off. Today's game avoids the conflict by missing the death band by a factor of 20 to 45. The problem appears only once the harder tiers lane makes Deadly as deadly as you ruled. More Blessings past the third keep all three rulings (GR-7).
3. **Per-ground overrides on the harder tiers.** Six grounds carry their own "both tiers bring six" rows so that the 11-16 line holds on each. That is balancing ground by ground, which your formula brief rules out. One pull number for each tier, set by the harder tiers lane from its own sample, is the formula-layer form (GR-27).

---

## 1. Complete game systems review

One verdict for each system, deduped across 46 and the eight reviews, after phase B. KEEP, REDESIGN, MERGE, REMOVE, ADD, DEFER. "Ruled" means a ruling already covers it. Where two reviews disagreed the row carries the recommendation of section 0.2.

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
| The party XP class table | ON HOLD, PENDING 49 | What is known: without it four mages are the best four on the uncalibrated harness | 52, 57 |
| The solo +15% | MERGE | The first cell of the one party table. No number moves | 44, 57 |
| The hidden Level cut on party XP | ON HOLD, PENDING 49 | You ruled it out on 11-08 and it is live. What replaces it depends on who can share a party | 57 |
| The Tower's own party table | MERGE | The Tower and the Catacombs take the one table | 44 |
| Combat skills: Melee, Ranged, Defense | KEEP | | 52, 56 |
| Magic on a weapon hero | REDESIGN | Adds a little max mana for every hero. MEASURED, gate PASS | 52 |
| Death at 6% and Blessings 1 to 3 | KEEP | Ruled twice | 56 |
| Blessings 4 to 7 | ADD | A new Blessing whenever a fully blessed death would cost over five hunted hours. COMPUTED: rungs at Levels 97, 140 and 257. Needed only once Deadly is as deadly as ruled | 56 |

### 1.2 The world

| System | Verdict | One line | From |
|---|---|---|---|
| The stat formula and six monster roles | KEEP | A new ground is mostly data | 53, 44 |
| 118 hand-typed monster rows and the art tier damage scale | REDESIGN | Every monster reads the formula. 103 rows are in no hunt and are deleted, not converted | 44, 53 |
| The party-ground formula | REDESIGN | One encounter type with three numbers. Its three inner patches go | 44, 53 |
| Per-ground hand dials (51) | REMOVE about 35 | Each stands in for the missing kill-rate term | 44, 53 |
| Monster spells, shooters, mends, boss phases | KEEP | Any monster may carry a phase | 53 |
| A signature for each ground | ADD | One question a ground asks, said on the card, carried by the harder tiers | 53 |
| Scaled hunts by the hour | KEEP, switch on | Ruled 22-9 and never open to a player. Switch it on, read it, then rule free depth against the hourly fee | 46, 53, 61 |
| Keyed halls | REDESIGN | The prize holds only what no ground drops. One key, one roll | 53, 54 |
| Call out | MERGE | Into keyed halls | 46, 53, 54, 59, 47 |
| The Burning Tower and the Hearth Chest | KEEP | The best formula-driven content in the game. Weekly, as ruled | 46, 56 |
| The Catacombs descent | KEEP | Its own mode, as ruled. One wing and one key first | 47, 56 |
| The regions roadmap | REDESIGN | Six grounds, opened as four and a hall, then two. One new rule for each region | 53, 47 |
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
| Uniques past tier 7 | KEEP | 15 to 20 per region. The one property is one of seven decision kinds | 54, 47 |
| The Very Rare band | ADD | A signature stone a smith sets in jewelry | 54 |
| The Rare band and its reveal | REDESIGN | At most six rows for each ground, so the ruled reveal is a moment | 54, 46 |
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
| Hero slots | ON HOLD, PENDING 49 | 400,000, 1.5M and 4M as ruled. Whether an account runs four heroes at all is the study's question | 46, 59, 61 |
| The Shop as buyer of last resort | KEEP | Its ruled price stays | 47, 55 |
| The Weighhouse | REDESIGN | Standing orders, routing from loot rules, sourcing from the refill | 55 |
| The market shut behind a Works goal | REMOVE | Open on day one | 55 |
| The price on setup slots 4 and 5 | REMOVE | It charges for a remembered decision | 55, 59 |
| The bench tax | KEEP | Ruled 11-01, and the first rung of every House room is "the bench with no fee" (26-1). It moves onto the wage curve | 61 |
| The gold floor | REDESIGN | A hunt budget, remembered for each ground | 55 |
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
| The yard, the dummy, training items | REDESIGN | The yard's rate follows the skill curve. The dummy still ends the fee and its unlocks are priced by skill band | 44, 55, 58, 61 |
| Rested XP | REMOVE | Pays zero on every path. MEASURED: an identity | 56, 58, 59 |
| Two old kill ladders | REMOVE | Ruled cut, hidden multipliers | 44, 56 |
| Titles, Trophy display, mounts, firsts | MERGE | One Honors page | 56 |
| Tamsin's tally | KEEP | It takes itself on the ground a hero enters | 59 |
| Leaderboards, the Chronicle | KEEP | As ruled | 56 |
| Companions, game modes, idle PvP | DEFER | As ruled | 56, 59 |

### 1.6 Social and home

| System | Verdict | One line | From |
|---|---|---|---|
| The own four through hero slots | ON HOLD, PENDING 49 | EVIDENCE: it is how the two heavy players played, 76% of hunt hours. Whether it is the right model for an MMO is the study's question | 57 |
| On-call heroes, standing parties, shared supply cost | ON HOLD, PENDING 49 | Ruled 25-1 and unbuilt. Its shape depends on the party model | 57, 46 |
| Live invites | MERGE | Into standing parties | 57 |
| The live party finder, the fifth seat | ON HOLD, PENDING 49 | 0 uses among four players. A model with one hero online would need a finder | 57 |
| Global chat, whispers, moderation, the rare drop broadcast | KEEP | | 57 |
| The Local chat tab | REMOVE | Frees a connection for the clan tab | 57 |
| Friends | REDESIGN | The on-call roster, with a friend link at sign-up | 57 |
| The shared town | REDESIGN | It draws heroes at work whether or not their owner is online | 57 |
| Clans, step 1 | KEEP | After the beta shows 50 accounts per day | 57 |
| The clan castle (buildings, labor, votes, upkeep, treasury) | DEFER, as ruled | Hidden and unbuilt until a clan has ten accounts (25-3). Projects on the Town Works engine are the leading design for that later decision | 57, 46, 61 |
| Factions | KEEP | As ruled 31-8. The side is chosen per hero | 57 |
| Town Works, the Hearthrise event, flame powders | MERGE | One Great Hearth | 46, 59 |
| The House deeds, Storage, chests | KEEP | Make, Keep, Show | 58, 46 |
| House rooms: 16 speed rungs | REDESIGN | Kept materials in place of speed | 58, 46 |
| The Cellar's food rungs, the Shrine rungs, soil tiers | REMOVE | Each sells nothing a player can feel | 58 |
| The Trophy room | REDESIGN | The Hall of Firsts, with a mounting fee per piece | 58 |
| Home maps and visiting | REDESIGN | Three looks, not five. Visiting from the Homestead | 58 |

### 1.7 Features and the platform

| System | Verdict | One line | From |
|---|---|---|---|
| The away card, the summary, the after-hunt plan, loot rules | KEEP | The best screens in the game | 46, 59 |
| The analyzer and personal bests | KEEP | Gains the hunt report | 59 |
| The coach (53 cards) and What next | REDESIGN | One table, the Path, drives all of it | 59 |
| Setups, action sets, hunt presets | MERGE | One noun, remembered for each ground | 59 |
| The wiki of formulas | KEEP | The honesty feature. It must read the engine's own constants | 44, 59 |
| Live events, the rare reveal, leaderboards | KEEP | As ruled | 59 |
| Town Crier, Rounds, powders | KEEP, shut | Behind the population gate | 59 |
| Old server leftovers, the gift code, Open Halls | REMOVE | Ruled | 59 |
| Town work settled by the combat engine | REDESIGN | Closed form, for training, gathering and benches | 59 |
| The settle engine, the envelope, the journal | REDESIGN | As ruled, and not yet enough (section 4.5) | 59 |

### 1.8 Counts

Counted from each review's own table after phase B. Rows that two reviews both judged are counted in each, so the total is a size and not an exact census. The features review prints 46 rows and its own verdicts sum to 48. The total is 441.

| Review | Rows | KEEP | REDESIGN | MERGE | REMOVE | ADD | DEFER |
|---|---|---|---|---|---|---|---|
| 52 combat | 81 | 46 | 10 | 1 | 3 | 12 | 9 |
| 53 world | 59 | 32 | 14 | 2 | 5 | 5 | 1 |
| 54 items | 54 | 24 | 8 | 4 | 3 | 11 | 4 |
| 55 economy | 47 | 28 | 5 | 4 | 5 | 2 | 3 |
| 56 progression | 47 | 31 | 3 | 4 | 4 | 3 | 2 |
| 57 social | 47 | 25 | 4 | 5 | 6 | 2 | 5 |
| 58 home | 58 | 34 | 12 | 1 | 5 | 4 | 2 |
| 59 features | 48 | 21 | 8 | 2 | 5 | 7 | 5 |

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
| ADD first | Brand, Blight, Fester, Anvil Ring, Fork Shot, Leech Bolt, Static Ward | One Necrotic or Storm spell for each weapon. Fester is the best design on the list because it builds on the bleed |
| REDESIGN, then build | The other nine Necrotic and Storm spells | Sixteen stays the ruled end state. No two weapons may share a mechanic. The plan's nine repeat one leech and one mana return |
| KEEP | Six rune families, plus Storm and Bone as ruled | Rupture has one spell and is the first to fold if the catalog ever has to shrink |
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
| ADD | Jewelry tiers 4 to 7, six pieces for each tier, with gem chips | Six of fourteen slots stop at Level 30 today |
| ADD | Necklace, cloak and belt perk hooks | Three slots ship plain |
| ADD | Widow's Fang, Mudlark's Mitts, Demoncaller | Designed on existing hooks and not live |
| ADD | Krell's five sidegrade weapons | The measured sample for every later unique |
| ADD | Signature stones on three grounds | The ruled Very Rare band is empty on every ground |
| ADD | Trophies on Hask, the Provost and Krell | The Hall has something to mount |
| MOVE | 14 plain Dawnsteel pieces | Off Krell's daily roll and onto the Hold's loot bands. MEASURED: a lone hero hunts the Hold about 9% slower while he waits 33.5 days in a band of 17.5 |
| CUT ROWS | Rare rows over six for each ground | A four sees a Rare reveal every 7 minutes on the Warrens |
| REMOVE | Five undeclared tier 1 ladder rungs, the wave 3 uniques (ruled 23-7), three workbench salt recipes (with linings) | Duplicates and orphans. Each is removed only after lane L36 checks it against the roadmap and the item plan's placed-or-cut table, as you ruled on 11-21. 22 old accessory rows are placed, not cut: Gold Ring is the tier 4 plain ring, the Trollhide Cape moves to tier 7 |
| COMBINE | 30 imbuement parts | They are the lining parts, one for each ground |
| COMBINE | 19 cooked heal foods | One ladder of about 8. Wolf, panther and bear meat become party meal ingredients |
| COMBINE | 12 feasts and 8 buff foods | Four party meals (ruled 23-6) |
| REDESIGN | Potato, Moonbloom | Potato needs a hunt consumer. Moonbloom loses 545 gold per bed per day |
| DEFER | 48 Catacomb helmets and boots beyond one wing, the Lucky ring, the maker's mark, bulk commissions | Each waits on something named |

**From the itemization plan, still owed.** The itemization fit (47 section 4) lists thirteen things the item plan designed that no review picked up. None is cut. Each has a home.

| # | From the plan | Where it goes | Bears on |
|---|---|---|---|
| M1 | Gem chips: every monster on a tier's grounds drops chips, ten make a gem | Lane L37, with the jewelry tier 4 sample | GR-38 |
| M2 | The Fine order: "make until Fine with one of these perks, salvage the rest, stop after this many bars". The Fine chase is 8 to 20 presses for each piece today | The second jewelry lane (J2), with the salvage arm | GR-38, the first principle |
| M3 | Weekly orders and stirred grounds | Build later, judged against the ground weekend and the Week card once chips exist | GR-84 |
| M4 | Reference values, the no-mint guard and the rivet allowance | **A gate on salvage and on commissions.** Neither ships until the guard proves no craft, salvage or good batch chain ends in more Shop gold than went in | GR-46, GR-44 |
| M5 | The late chest shape: 2% base for good, two-attribute pieces from the Level 200 key, fusing | Lane L56, in each region's key row. Built with region 4 | GR-33 |
| M6 | The Catacombs glove wing | Lane L48, after the one wing and one key sample | GR-36, GR-43 |
| M7 | After 99: staples open by region material, the maker's mark, reforging into a band | Lane L47, with patterns | GR-44 |
| M8 | Region tables: stock and chips written once for each region | Lane L47, in the ground pack. A ground drops from about 19 new rows to 15 | GR-33 |
| M9 | One market book for each piece, with grade and perks as filters. Jewelry tiers 4 to 7 would otherwise be about 400 rows | **A condition on the idle market.** Standing orders are placed on that one book | GR-50 |
| M10 | A drop rule for a ground played above its band | Lane L31, and scaled hunts when they switch on | GR-9 |
| M11 | The placed-or-cut table for old rows | Lane L36 reads it before anything is removed | GR-34 |
| M12 | The job worn in did: two heroes with the same sword end up different | The Kindlings spec, if you lift the hold | GR-61 |
| M13 | Spell leech and lining leech measured together | A test line on lanes L44 and L32 | GR-16 |

### 2.4 Monsters and hunting grounds

| Do | What | Why |
|---|---|---|
| KEEP | Every placed monster | None is a re-skin. The problem is one level up: from Hask's Ford on, every ground is the same five roles at the same weights |
| REMOVE | 103 old monster rows, Bramble Edge, Goblin Warren, Ridge Camp, four called boss copies | In no hunt. The art stays in the library. 80 items wait on monsters from the old roster, so lane L36's item check runs before these rows go |
| REDESIGN | 13 named rares | Each gets one phase trait, so it is an event in the log |
| REDESIGN | The Sewer, the Warrens, the Muster Barrows | XP per kill about a third lower. A ground built for parties must not be the best lone ground |
| RE-BAND | Wickstead to about 20 to 32. The Slake to about 58 to 72 | Three grounds cover Levels 5 to 18 and one covers 16 to 31 |
| REDESIGN | Carter's Rest and the Ox Road | A faction pair pays alike and differs by weakness, signature and drops |
| ADD | Loot rows for the Wyvern Roost and the Catacombs ground | Two staged grounds cannot be judged without them |
| ADD | One signature for each ground | Shooters are the only mechanic that ever changed a real hunt. Give every ground one |
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
| REMOVE | The rested bank. The two old kill ladders. The relic multiplier, the boss-of-the-day bonus and the charm ladder nothing calls. The Tower heat (ruled 11-20). The art tier damage scale. Three patches inside the party-ground formula. About 35 per-ground dials. The price on setup slots. The Local tab. The live finder |
| COMBINE | Call out into keyed halls. The solo +15% into the party table. Four coin dials into one coin line. Six price lines into one wage curve. Titles, Trophies, mounts and firsts into Honors. Setups, action sets and presets into one noun. Town Works, the event and powders into one Hearth. Watering into Tend |
| REDESIGN | The tier dial (applied once). The harder tiers' pull (one number for each tier, no per-ground rows). The hidden Level cut (a visible line). Scaled hunts (switched on, then judged). The Level table (derived). The yard's rate. The dummy. The gold floor (a budget). The coach (the Path). Town work (closed form) |

---

## 3. Missing features

Only the absences that more than one source found or that a measurement supports. Each says why Hearthrise in particular needs it. There are fourteen, and that is the whole list. Every review looked for more and turned the rest down.

| # | Missing | Why Hearthrise specifically | Evidence | From |
|---|---|---|---|---|
| 1 | **A formula for gear past tier 7** | Levels are uncapped. Monster and hero health grow forever and weapons stop at Level 88 | MEASURED on the engine with stand-in grounds: a hero in today's gear earns 0.91 of the pace at Level 400 and 0.47 at 1,000. With a curve the pace holds from Level 200 to 5,000 | 44 |
| 2 | **A stated party and character model.** ON HOLD, PENDING 49 | The game teaches one hero and the two heavy players ran their own four. Nothing in the design says which is meant | EVIDENCE: 76% of hunt hours are one person's own four. 99 of 249 hunts ended because the player's own other hero left. Both from two heavy players who are friends of yours | 46 |
| 3 | **A way for two real people to hunt together.** ON HOLD, PENDING 49 for its shape | A multiplayer game where no hour has ever held two players | EVIDENCE: 0 hours with another person in 1,334, from four people. On-call heroes are RULED and unbuilt | 57, 46 |
| 4 | **Ground that never runs out** | Uncapped Levels need an uncapped world, and the Tower already proves the formula can make one | COMPUTED: open ground ends on day 27 for a four. You ruled 120. The ruled form of this, scaled hunts, has never been open to a player | 46, 53 |
| 5 | **A permanent build choice** (Kindlings) | Two heroes with the same weapon and gear are the same hero, and you asked on 11-18 that they not be | COMPUTED from the spell data: nothing on a bar changes after hunted hour 254 | 56, 46, 52, 47 |
| 6 | **Blessings past the third** | A death is paid in hours on a game played mostly away, and the cost grows without limit | COMPUTED: at the death count you ruled for Deadly, Deadly pays less than Normal after deaths from Level 145 to 185 | 56 |
| 7 | **A party job for each weapon that is a rule on the bar** (the cast breaker, shooters first, a status that opens a damage kind) | Idle combat is decided in town. A job works when its answer is a setting | MEASURED: a second melee hero costs a four 8 to 13% because it brings only damage. EVIDENCE: 28% of a real four's damage landed on the healer from shooters | 52 |
| 8 | **A reason to pick a ground that is not its XP rate** (a signature, a signature stone, a find list) | "Harder pays more" makes the best ground the hardest one you survive, so three of eleven grounds are scenery | EVIDENCE: Wickstead, Hask's Ford and the Muster Barrows together got 45 of 1,334 hours | 53, 54, 46 |
| 9 | **A risk reading and a bar report after every hunt** | Death is 6% with no cap and the player is not watching | MEASURED, provisional: all 9 death cells read under 50% lowest health. So did 8 cells with no death. The reading carries signal and is not a clean line | 59, 56, 53 |
| 10 | **A market that runs itself** | Everything else in the game is "decide once, it runs while you are away". The market still asks you to stand at a window | EVIDENCE: a cooked shark saves a Deadly hunter 924 gold at the store and the Shop pays its maker 24 | 55 |
| 11 | **Sinks that do not end** | Unlimited Levels with priced sinks that stop at tier 7 | COMPUTED: an own four buys the whole shelf to Krell in about 14 weeks | 44, 55 |
| 12 | **One table that says when every system opens** (the Path) | A wide game for players who visit for 2 to 5 minutes | EVIDENCE: ten Town lines and 53 coach cards at Level 1. One card told a hero to buy a house in minute two | 59 |
| 13 | **a saved kit for each ground, a job queue, a hunt budget, a starting loot plan** | The first principle. Each removes a decision the player repeats by hand | EVIDENCE: 1,361 crop waterings, 24 dropdowns, a gold floor that defaults to 300. MEASURED on the harness, lone, overstated by up to half: Deadly can burn 121,000 an hour | 54, 46, 55, 59 |
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

**What the Level law does.** Your table of hours becomes the law and the XP a Level costs is derived from it. **I recommend the law from Level 50**, with Levels 1 to 50 left as they are, because your ruling 27-2 holds those on a lone new hero. All numbers below are COMPUTED on the cached grid from measured XP rates (56 section 0.2), and cells from Level 185 up are PROVISIONAL. A curve moves no fight, so none of this is a measurement of the curve.

| The pace seat | Today's curve | The table from Level 50 | Ruled |
|---|---|---|---|
| Hours to Level 100 | 257 | 494 | 600 |
| Hours to Level 200 | 1,068 | 1,574 | 1,680 |
| Hours to Level 400 | 2,948 | 4,474 | 4,580 |
| Krell's Hold, day | 16 | 31 | |
| End of open content (Level 110), day | 26 | 49 | |
| End of staged content (Level 185), day | 79 | 116 | 120 |
| A lone MID hero on Normal reaches Level 100, day | 42 | 81 | |
| A lone MID hero on Normal reaches Level 200, day | 136 | 211 | |

Four things to know. **It runs 106 hours ahead of your table at every ruled Level**, which is 18% early at Level 100 and 2% at 400, because the four does Levels 1 to 50 in 62 hours against 168. The law can be made exact from Level 1, but that takes a lone new hero 9 hours to Level 10 against the 6 you ruled, and 34 days to Level 50. **The runway target is narrowly missed**: staged content lasts to day 116 against 120. One more staged ground closes it. **The table has two rough edges** for the build to smooth: a Level gets 3.3 times dearer at Level 50, and the ruled points joined on a log scale make a Level slightly cheaper at Level 100, which should never happen. **And a lone hero is the slow seat of the target game.** The table is the four's clock by your 11-21 ruling, so a lone hero reaches Level 100 on day 81 and Level 200 on day 211. The target has to say whether that is what "solo viable" means.

**The law cannot be fitted today, by anyone.** The pace seat has no single multiple until the kill reward is derived and Deadly's dials land. Any curve cut before that is a fit to grounds that are about to move.

### 4.2 The cost of a death

One death in the pace seat's hunted hours (56 section 0.3, COMPUTED), unblessed, with three Blessings, and with the Blessing ladder of GR-7:

| Level | Today's curve | The table from Level 50 |
|---|---|---|
| 100 | 10.6, 2.6, 2.6 | 22.0, 5.5, 2.7 |
| 200 | 36.1, 9.0, 2.3 | 53.4, 13.4, 3.3 |
| 300 | 59.9, 15.0, 3.7 | 105.4, 26.4, 3.3 |
| 400 | 101.7, 25.4, 3.2 | 150.2, 37.6, 4.7 |

**This is a conflict between two targets you ruled, not a fault measured in play.** The two targets are the Deadly death band (50 to 100 deaths in 1,000 hours for a MID four) and a death that costs 6% with no cap. Nothing measured says a party dies that often. The harness recorded no deaths in all but three Deadly cells, and real fours past Level 45 died once in 449 party hours, which is 2.2 in 1,000 (THIN). Today's game misses the ruled death band by a factor of 20 to 45. The harder tiers lane is about to close that gap on purpose.

The first checkpoint where a blessed MID four on Deadly earns less per hero than the same heroes alone on Normal (COMPUTED from measured XP rates and an assumed death count):

| Curve | At the real count, 2.2 | At the band's low end, 50 | At the band's high end, 100 |
|---|---|---|---|
| Today's curve, three Blessings | never | Level 185 | Level 145 |
| The table from Level 50, three Blessings | never | Level 145 | Level 100 |
| The table from Level 50, the ladder | never | never | Level 225 |

Three things follow. At the death rate real fours have, Deadly pays at every Level on every curve. If Deadly is tuned to the count you ruled, it stops paying between Level 100 and 145 on the recommended Level law, and the Level law is part of why: it roughly doubles total XP at Level 100, so every death costs that much more. And the matrix cannot see any of it: halving the death rule moved no cell and no band.

**The ladder is a rule in hours.** Three Blessings, then one more whenever a fully blessed death would cost the pace seat over five hours, each halving what is left. On the recommended curve the rungs fall at Levels 97, 140 and 257, and none more before Level 400. The hand-typed rungs of the first issue (100, 185, 275, 400) are withdrawn. **It is not needed while deaths are at 2.2.** It ships in the release where the harder tiers lane makes Deadly bite, sized then on the long death sample.

### 4.3 The content runway

| Door | Four, MID on Deadly, today's curve | The table from Level 50 | Ruled |
|---|---|---|---|
| Krell's Hold (Level 88) | day 16 to 18 | day 31 | |
| End of open content (110) | day 26 to 27 | day 49 | |
| End of staged content (185) | day 60 to 79 | day 116 | 120 days at Early Access |

All of these days are COMPUTED. No real account has passed about Level 79. The two readings of "today" are the standards' table (50) and the progression review's finer grid (56). Past Level 110 a four gains about 69 Levels per month on the standards' reading and about 42 on the progression grid, and a region is 55 Levels. The Level law and opening what is staged reach day 116, four days short of the target. An old ground you can hunt at your own Level is the only thing that keeps working after the last region.
### 4.4 Gear past Level 110

| What breaks | Where | Label |
|---|---|---|
| The last gear tier | Level 88 | 44 |
| Kill speed starts to fall on today's gear | Level 111 | 44 |
| Plate leaves its 60% cap and fades | Level 120 | 44 |
| Six accessory slots have nothing new | from Level 30. Worth 15% at Level 30 and 0.5% at 400 | MEASURED (54) |
| No new sink appears | past Level 110. The shelf to Krell is bought out in about 14 weeks, and gold piles up from then | 44, 55 |
| Standing prices of a band over the band's gold | 0.39, 0.66 and 0.38 at Levels 60, 110 and 185, against a ruled 1.2 to 1.4 | MEASURED (56) |
| Today's gear falls behind | 9% slow at Level 400, 0.47 of the pace at 1,000, cannot hunt at 2,000 | MEASURED on the engine with stand-in grounds (42) |
| Skill as a share of a hit | under a quarter at Level 400, 14% at 1,000 | COMPUTED (44) |
| Rune tiers | end at skill 60 | 44 |
| The Tower | replays floor 300 above floor 300 | 44 |

**What holds.** The monster formula, hero health and mana, the tail of the Level curve, the party split, crit and leech all hold to Level 5,000. On a gear curve that is linear in Level the pace holds from Level 200 to 5,000 with no other change (42, MEASURED on the real engine with stand-in gear).

The gear curve is the most important single formula in this document. Its urgency is not Level 400. It is that the kill reward needs it first, because the reward's reference line has to be measured on heroes whose power keeps pace. It also decides whether a +5 to 8% upgrade "every 15 to 25 Levels" (10-25) can be true: on a straight line it is true only near Level 300. Rule the upgrade by its size (GR-4).

### 4.5 Server cost. CRITICAL. PENDING `48-platform-cost.md`

You ruled at most $0.15 an account-month at 1,000 accounts. The standards work that out to 60 database-seconds for each account-day, and 24 at 10,000 accounts. **The 60 is COMPUTED, not ruled.** It comes from list prices the standards mark as assumed, on shared cores, so it is a best case. The features review computed the path (59 section 0.2, COMPUTED from production means taken at 3.3 hunted hours a day and stretched to four heroes at 12 hunted and 12 rested hours. Not measured at 12 hours):

| Step | Database-seconds an account-day | Times the budget |
|---|---|---|
| Today | **645** | 10.7 |
| The server-cost lane (L01) | 532 | 8.9 |
| Commit at the flush (L12, ruled) | 270 | 4.5 |
| Delta envelopes (L24) | 195 | 3.3 |
| Town alone sends nothing, the hourly journal, Carry on and the plans | **180** | 3.0 |
| Town work in closed form | **147** | 2.4 |
| The budget, computed from the ruled $0.15 | **60** | 1.0 |

1. **Every fix in the plan leaves the account at three times the budget.** This is a system question, not a tuning.
2. **Closed-form town work is necessary and not sufficient.** Four heroes working their 12 rested hours cost 34 of the 60 seconds. You already ruled closed form for training. It has to cover gathering and benches too.
3. **What is left is the away hunt's own commit.** 34 seconds over 48 hunted hero-hours is about 10 commits per hero-hour against 36 today. HYPOTHESIS: that is either a flush about every 6 minutes, with every death, Level, Leave, rare drop and money intent still saved at once, or a commit of about 20 ms at today's pace. Choosing and sizing it is the platform review's job and its answer is not on the set.
4. **Presses are a real line.** 100 presses a day is 11 seconds, a sixth of the budget. Carry on, the loot plan by kind and a tally that takes itself are cost work as well as design work.
5. **Two thirds of the bill at 10,000 accounts is not the database.** The other lines (edge calls, Realtime, egress) were priced for 3.3 hour accounts and must be re-read at 12 hours.

Every design proposal in this review was checked against this. None adds a statement on the settle path. The hunt report reads counters the settle already writes. Heroes at work in town (57) is the one proposal with a real cost and it waits for the platform sizing.

### 4.6 Balance between styles and party sizes

| Finding | Number | Label |
|---|---|---|
| A party does not make a hero faster. It lets a hero stand on a tier it could not hold alone | 0.91 to 1.11 of a lone hero per hero on the same tier | MEASURED (57) |
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
| Levels 5 to 10 alone | Two grounds, two spells, no danger on Normal. Both light players stopped here | The ruled fix to Levels 7 to 10 (27-2). A starting weapon. The Path naming the next thing at every Level |
| Level 10 to 32 | One hero until 400,000 is banked | The Sewer as a real party ground and a hard tier a lone hero can hold. The rest waits on the party model (PENDING 49) |
| Level 30 to 110 | A ladder that equips itself. A slot fills in an hour and nothing changes for fifteen Levels | Jewelry tiers 4 to 7, perks sized by case, signature stones, a signature for each ground |
| Past Level 45 | A Level is hours for +10 HP | Honors at round Levels. Kindlings every ten Inner Flame levels |
| Past Level 110 | Nothing is live | Old grounds at your Level, Krell's five, the Catacombs wing sample, patterns |

---

## 5. Systems interaction analysis

Your brief asks that a local change be traced before it is recommended. The reviews did that with the matrix. This section puts the traces together: which proposals move each other, and which must ship in one release.

### 5.1 What the matrix flagged

Every patch was played on a scratch copy of the real engine with the same dice before and after. A patch names its targets, and anything else it moves is flagged UNINTENDED.

| Patch | What it plays | IMPROVED | REGRESSED | UNINTENDED | What it decided |
|---|---|---|---|---|---|
| combat-1 | Axes read the sword's weak side | 0 | 2 | 1 | Keep, and not enough. Only the axes moved, +1.5 to +4.8% |
| combat-2 | The crossbow's heavier stat line | 0 | 3 | 5 | **Withdrawn.** Worth 3 to 6% |
| combat-3 | Magic adds 0.5% max mana per level | 19 | 5 | 0 | **PASS.** Store bills fall 2 to 4%, no pace moves |
| combat-4, combat-5 | A physical strike reads weapon weakness, alone and with combat-1 | 3 | 7 to 8 | 29 to 31 | Small, at most 3.5% on one way. The unintended rows are the pace move seen from other bands, plus dice |
| world-1 | The party-ground formula removed | 0 | 0 | 0 | **Phase A's cause refuted.** A lone hero's kills double and its XP does not move. The formula feeds a four on Normal |
| world-2, world-2b | Dangerous brings Normal's pack, or five | 0 | 0 | 0 | The pack as built is not a tier. Five holds at today's dial. Not yet played at the harder dial you ruled for lane L16 |
| world-3 | A signature at double dose on the Slake | 0 | 0 | 0 | Nothing on Normal. On harder tiers it bites small parties first. Nothing off the Slake moved |
| economy-1 | The store's heal prices on one line | 15 | 9 | 0 | **PASS.** A lone hero's Deadly bill falls 49%. A four's bill moves 0.0% |
| economy-2 | Every supply at full effect | 0 | 0 | 321 | An upper bound on what an idle market does to combat: a four on Deadly up to 12% faster and up to 30% safer |
| economy-3 | Gold in falls 15% | 0 | 40 | 6 | **Default salvage withdrawn** |
| progression-1 | A trial Level curve (a power law, since withdrawn) | 4 | 1 | 7 | Directions only, because the patch played the withdrawn curve. They hold on any slower curve: the ruled hours come closer, and six of the seven unintended rows are sinks falling against a longer band. The patch is to be re-cut on the table from Level 50 when the kill reward lands |
| progression-2 | The death share halved | 0 | 0 | 0 | **The matrix cannot see a death's cost** |
| progression-3 | The rested bank off | 0 | 0 | 0 | An identity. Removal is free |
| social-1, social-2 | The party size row, both ways | | | | Lowering the pair broke a ruled band on 16 rows. Raising the four pushed it to 3.7 times the contract. **Deferred** |

The world patches read 0, 0, 0 because the ground axis carries no band rows yet, not because nothing moved. The world review read the cells by hand. That is a hole in the instrument (section 7.2).

### 5.2 What must ship with what

| # | These ship together, or in this order | Why | Source |
|---|---|---|---|
| 1 | **The Level law (R13) with sinks as band gold (R16), after the kill reward (R12) and after Deadly's dials (L16). The Blessing ladder ships with L16's release, not with the Level law** | True of any slower curve: a longer band earns more gold against the same typed prices (band G-10 of the standards fell from 0.39 to 0.19 on the trial curve). The law cannot be fitted until R12 and L16 make the pace seat's multiple one number. And the ladder is needed in the release where Deadly starts to bite, sized on the long death sample. COMPUTED: at the ruled death band the break comes at Level 145 on today's curve and Level 100 on the law | 56, 47, 44 |
| 2 | **The kill reward (R12) with the per-ground tier dials, the floor-16 pull rule and the party-ground XP cut** | Each of those numbers exists because the reward has no kill-rate term. Remove them before R12 and the first grounds overpay again | 44, 53 |
| 3 | **The gear curve (R10) before the kill reward (R12)** | The reward's reference line has to be measured on heroes whose power keeps pace | 44 |
| 4 | **The tier dial applied once (R7) with one step of the dial** | Harder tiers get a little easier on armor and Defense trains slower there. The dial may need one step up to hold the ruled lowest-health bands | 44 |
| 5 | **Deadly as a fight (L16) and the party model (study 49) before any change to the party XP table, the size row, or status pairs** | MEASURED on the uncalibrated harness: until Deadly asks for a tank and a healer, every table change crowns the mage four. And what a party is has to be decided before its XP table is | 52, 57 |
| 6 | **One pull number for each harder tier, measured together with L16's dial** | Six per-ground overrides become one field. Five monsters on Dangerous was read at today's dial, before the harder hit you ruled in 21-3. On Hask's Ford a four on Dangerous at five earned under a lone hero on Dangerous, which bears on the 11-16 line | 53, 61 |
| 7 | **Whatever replaces the hidden Level cut ships in the same step that removes it. ON HOLD, PENDING 49** | MEASURED: with no rule a Level 5 behind a Level 37 party earns 6 times its pace | 57, 44 |
| 8 | **Any test of the first days ships the ruled fix to Levels 7 to 10 (27-2) and the Path to every group** | The same two players are the evidence for the lone stretch, the slow Levels and the open town. A test that changes one of them cannot tell the three apart | 46, 59, 61 |
| 9 | **The idle market only after the tiers are sized on full-effect supplies** | MEASURED: full-effect supplies make a four on Deadly up to 12% faster and 30% safer. If Deadly is sized on store supplies and then the market opens, Deadly gets easier for everyone who trades | 55 |
| 10 | **Tempering pays the difference (23-2) with R16 sized on a hero who pays the difference at every tier** | COMPUTED: otherwise a careful hero pays 0.5 to 0.9 of a band's gold at tiers 4 to 6 where you ruled 1.0 to 1.4 | 47 |
| 11 | **Jewelry tiers 4 to 7 with gem chips, the 6% share of the gear curve, and the matched-hero cap** | MEASURED: a point per tier to tier 7 would add 5 to 13% Level XP at Level 110, twice the budget. Without chips a tier is finished the day it is outgrown | 54, 47 |
| 12 | **Perks sized by case with the saved kit for each ground** | A perk for one ground is a chore unless the kit changes itself when the party moves. MEASURED: all perks at five times is +9 to +11% XP for a lone hero, and a four takes 20 to 29% less damage, so five times is the ceiling | 54 |
| 13 | **Plain Dawnsteel onto the Hold's loot bands with Krell's five weapons** | The five replace the rows so the daily roll does not read empty. Krell's gem stays on the roll because the tier 7 Hallmark is built on it | 54, 47 |
| 14 | **Call out merged with "a mid-region boss's pieces stay repeatable"** | Otherwise the Roost Mother's five pieces stop counting as a family's first unique and the item plan's grid fails | 47 |
| 15 | **Scaled hunts switched on with one drop rule** | A ground played above its band drops its own rows at its own rarity, or the Glade becomes the cheapest source of a band 9 body. Lining parts still drop from an old ground at its own rate, as you ruled on 11-18 | 47, 53 |
| 16 | **Signatures with linings, on the harder tiers, after the back row is hit as in real play (V4)** | A signature needs an answer the player can bring, and the harness healer takes 0.5% of the damage where the real one takes 28% | 53 |
| 17 | **The weakness repair with Rend's share, after the spell floor (R6)** | So each number moves once | 52 |
| 18 | **Seven Necrotic and Storm spells with leech linings measured together** | Reave, Leech Bolt and Tithe heal from damage and so does a leech lining. They stack | 47 |
| 19 | **The yard's rate with the fee following it, and the dummy's rungs priced from that fee. All in the same change as closed-form town work** | A rate that rises without the fee makes the sink cheaper per point of XP. The dummy's price has to read the fee it removes. And closed form rewrites how a training hour is paid | 55, 58, 59, 61 |
| 20 | **The heal price line with heal size on the gear curve, after the store-bill fault closes** | The food ladder stops at 396 hit points. MEASURED: past Level 400 a cheaper shark is just a smaller bill | 44, 55 |
| 21 | **The three workbench salts leave in the lane that ships linings. The Cellar's food rungs come off sale with the cut of the effect they sell** | Until linings exist, salts are all Crafting makes at 45, 60 and 75 | 47, 58 |
| 22 | **The Honors page before the Hall of Firsts, and both before visiting** | The Hall reads Honors rows. A wall nobody can visit is seen by nobody | 56, 58 |
| 23 | **Lane L36's item check before the 103 unused monster rows are deleted** | 80 items wait on monsters from the old roster. Delete the monsters first and those items lose their source and then fail the check | 61, 54 |
| 24 | **The no-mint guard before salvage and before commissions. One market book for each piece before the idle market** | They are what makes salvage, good batch and commissions safe, and what lets an order name a rolled piece | 47 |

### 5.3 The three chains that reach furthest

**The pace chain.** Kill reward, then the Level law, then everything timed in days. COMPUTED: the table from Level 50 moves Krell from day 16 to day 31 and the end of staged content from day 79 to day 116, makes every typed sink cheaper against its band, roughly doubles the cost of a death at Level 100, and puts a lone hero's Level 200 on day 211. It is the largest single change in the program, and the sink re-price and the runway hang on it.

**The tier chain.** Deadly's dials decide whether roles exist, whether the party table can be simplified, whether a lone hero has a hard tier, what a signature costs, what the store bill is, and therefore what the wage curve and every price in hours read. Nothing about party gold or party survival should be priced until it lands.

**The gear chain.** The gear curve sets the reference hero. The reference hero sets hit chance, the kill-rate reference, the armor line's guard, what a unique may spend, what a jewelry share is worth, what a band is, and so the Luck numbers and Tempering ladders that are keyed by band. Sizing a band at a tier's worth in place of +6.5% changes all of those at once.

---

## 6. Prioritized recommendations

### 6.1 The top 10

Ranked by expected overall benefit, then confidence, then cost. Complexity is S, M or L. "Calls" names every call in section 8 the item needs. Each item is judged against the target game. Cost to build counts. Risk to today's heroes does not.

| # | Change | Class | Expected benefit, in player terms | Layer | Evidence | Complexity | Risk | Depends on | Calls | When |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Make the instrument true.** The four harness faults of section 7.2, a band that reads XP after deaths, band rows on the ground axis, pair cells and lineup cells. With it, the no-number formula steps of 44 (V1 to V5, R1 to R5, R7, the floor half of R6, the fold of R8) | Critical | None a player sees. Every balance number after it can be believed, which is the whole point of the formula brief | Tools and identity refactors | Four named faults, each with a done-when. No unknowns | M | Low | Nothing | GR-85, GR-88 | The beta |
| 2 | **Server cost toward the computed budget of 60.** Town work in closed form for training, gathering and benches. The away hunt's commit is sized when 48 lands | Critical | The game can be afforded at 1,000 accounts. Without it there is no game to balance | Architecture and one formula (the yield rule) | COMPUTED from 3.3 hour means stretched to 12: 645 today, 180 after every planned fix, 147 with closed form. The 60 is a best case on assumed prices. The flush is a HYPOTHESIS. PENDING 48 | L | Medium. Both-paths tests and seeded rolls | L12, L13, L19, L24, the platform review | GR-1 | The planned fixes and closed form in the beta. The commit when 48 lands |
| 3 | **Deadly asks for a party with roles, and the harder tiers have one pull number each.** Mostly ruled already (21-3, lane L16). New here: two lineups that must fail, and no per-ground overrides | Critical | Preparing a four becomes a real decision, and a lone hero has a hard tier it can hold | Coefficient (`tierDanger`, `tierHp`, `tierPull`) and one formula fix (R7) | MEASURED on the uncalibrated harness, one seed and one hour for each cell. Party survival is direction only until V4. Real fours with a tank and a healer had near zero deaths | M | Medium | Item 1. Lanes L17 (spells first, ruled 31-9) and L16 | GR-3, GR-27 | The beta |
| 4 | **The gear curve in the game.** Linear in Level, a band a tier's worth, uniques spend it at exchange rates, jewelry and cloaks ride it to tier 7 | Critical | Gear keeps mattering at every Level, and six accessory slots have something to want past Level 30 | Formula (R10, R11) and content rows | MEASURED on stand-in grounds: today's gear is 9% slow at Level 400 and cannot hunt at 2,000. Pace holds 200 to 5,000 with a curve. The band size is a HYPOTHESIS until one band is played | M | Medium. The first formula that reaches every item | V1 | GR-4, GR-38 | The ruling now, because item 5 needs it. Jewelry tier 4 during the beta |
| 5 | **The kill reward follows the pace line.** One tier table. A party ground's XP per kill becomes an output | Critical | The route the Hunts page shows is the best route, and four grounds nobody hunts come back into play | Formula (R12) | MEASURED that the party-ground formula is not the cause of the overpay. The missing kill-rate term as the cause is 44's analysis and no derivation run has proven it yet. The "third lower" is COMPUTED | L. The largest single change | High. It moves XP on every ground at once | Items 1 and 4, R7 | GR-5 | After the beta opens |
| 6 | **The Level law from Level 50, with sinks as band gold. The Blessing ladder with the harder tiers** | Critical | Levels arrive close to the days you ruled, every band has something to spend gold on, and a death stays a risk worth taking once Deadly bites | Curve (R13), content rows, coefficient and server (R15, R16) | COMPUTED on the cached grid, PROVISIONAL from Level 185: 494, 1,574 and 4,474 hours against the ruled 600, 1,680 and 4,580. Staged content ends day 116 against 120. The death break is a conflict between two ruled targets, not a fault measured in play | M | Medium. Money surfaces for the Security review. Two rough edges in the table at Levels 50 and 100 | Items 3 and 5 | GR-6, GR-7, GR-8 | The law and the sinks with the kill reward, before Early Access. The ladder in the release where L16 makes Deadly bite |
| 7 | **Bosses pay what grounds never drop.** One boss door. Plain Dawnsteel into the Hold. Krell's five weapons. The three designed pieces and three signature stones | High | The end of a region has a prize worth preparing for, and a rare find is something a hero keeps | Content rows, one hook (a spell change) | EVIDENCE, thin: 19 keys and no Hall fought is one four in one ten hour window. MEASURED on one subset run: a lone hero is 9% slower through the Hold while he waits | M | Low to medium | Item 3, jewelry tier 4 | GR-28, GR-29, GR-40 | The beta period. A four is at Krell on day 18 with two uniques in the game |
| 8 | **The first days and the return made readable.** The ruled fix to Levels 7 to 10 (27-2). The Path. The hunt report. A tally that takes itself. A starting loot plan. A hunt budget. Free setup slots. A starting weapon | High | A new player always knows the next thing, and a returning player sees what the night did and what to change | Content rows and screens over counters the engine already writes | EVIDENCE: 3,251 untaken wolves, ten Town lines at Level 1, 0 paid setup slots. MEASURED, provisional: the low-health reading carries signal | S to M each | Low | L16's lowest-health tally, the loot plan by kind | GR-24, GR-56a, GR-57, GR-66, GR-78, GR-79 | The beta |
| 9 | **Decide the party model (study 49).** Everyone runs their own four, or one hero online with the others for hire, or all four at once with 8-person open-world areas | Critical as a decision. No recommendation yet | Whether Hearthrise feels like an MMO: who you meet, who you need, and what a party is | The design itself. Hero slots, party XP, on-call heroes, the market and the server budget all read it | EVIDENCE, very thin. Two heavy players each ran their own four and never hunted together. Two light players, 18 hours between them, left at Levels 7 to 9, one with two heroes. 0 hours of two people in one hunt. Nothing here says which model is best. PENDING 49 | Unknown until the study lands | High. It moves the server budget and the Security surface | Study 49 | GR-2, GR-10a, GR-10b, GR-10c, GR-67, GR-80 | Before item 3's lineups are final |
| 10 | **Learn whether an old ground at your Level is content.** Switch scaled hunts on as ruled, with the drop rule, and read it | High, as a question | If the answer is yes: ground that never runs out | A switch and one drop rule | HYPOTHESIS. The runway is COMPUTED. The ruled system has never been open to a player | S | Low | The drop rule for a ground above its band | GR-9 | The beta, as a test |

**What changed in the ranking since the first issue.** The instrument is now item 1. The second hero is no longer in the ten as a recommendation. You challenged it as assumed without real evidence, and the audit agrees: its evidence is 18 hours of play. In its place item 9 is the decision itself, the party model, which a study lane (49) is working on. On-call heroes left the ten for the same reason and sit inside item 9. Free depth on every ground fell from 7 to a test in item 10, because its evidence was a projection and a switch that is off.

**Scope against the ruled beta (30-7, one big release).** Already in the plan's lanes: the server-cost lanes (L01, L12, L13, L19, L24, L25), the spell and harder tiers lanes (L17, L16), Carry on and the loot plan (L07, L21) and the social lane (L40). Added by this review: closed form for gathering and benches, the lineup cells, the Krell rows pulled forward (47's own recommendation), the hunt report and the Path. I have not costed those additions in lanes. Whether they fit the one release is your call with the Coordinator.

**Just outside the ten, and why.** The idle market (L, needs a population, and must wait for the tiers). Kindlings (a spec and a paper sample now, built after the combat laws). A party job for each weapon (waits for item 3). The wage curve (waits for the store-bill fault).

### 6.2 Every call by priority class

Your brief's section 7 asks for six classes. Every call in section 8 carries one in its Priority column. This is the same list by class.

| Class | Calls | Expected benefit |
|---|---|---|
| **Critical.** A fault the rest of the game stands on | GR-1, GR-3, GR-4, GR-5, GR-6, GR-7, GR-85, GR-88 | The game can be afforded, measured and balanced as one system to Level 400 and past it |
| **High.** Likely to change play, progression or retention a great deal | GR-2, GR-8, GR-9, GR-10a to GR-10c, GR-11, GR-14, GR-16, GR-19, GR-24, GR-27, GR-28, GR-29, GR-31, GR-38, GR-39, GR-40, GR-50, GR-51, GR-52, GR-57, GR-61, GR-62, GR-66, GR-78, GR-79, GR-80 | Roles in a party, gear worth keeping, a reason to pick a ground, a first week that leads somewhere, players who need each other |
| **Medium.** Worth doing, not urgent | GR-12, GR-13, GR-15, GR-17, GR-18, GR-20 to GR-23, GR-30, GR-32, GR-33, GR-35, GR-36, GR-42 to GR-46, GR-48, GR-53, GR-54, GR-58, GR-59a, GR-67, GR-70, GR-72, GR-73, GR-76, GR-77, GR-81, GR-82, GR-86, GR-87 | Each weapon distinct, crafting with a late product, a home that shows what you found, fewer typed numbers |
| **Low.** Polish, or a ruling to put on record | GR-25, GR-26, GR-37, GR-41, GR-47, GR-49, GR-55, GR-56b, GR-64, GR-71, GR-75, GR-83, GR-84 | Clarity. Mostly rulings kept as they are |
| **Remove or simplify** | GR-34, GR-56a, GR-59b, GR-63, GR-65, GR-69, GR-74 | Less to learn, less to maintain, fewer exceptions |
| **Defer** | GR-60, GR-68 | Nothing now. Each waits on a population |
| **On hold, PENDING 49** | GR-2, GR-10a, GR-10b, GR-10c, GR-67, GR-80, and the party XP table inside GR-3 | Not ranked until the party model is decided. Their Priority column shows the class they held before the hold |

I did not score each call on the eight criteria of your brief's section 4. The reviews did that for their significant rows and this synthesis did not re-read those sections (section 9.6).

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
| The ground axis carries no band rows, so every world patch read 0, 0, 0 | 53 | Band rows for each ground: the ladder rule, the party-ground check, the lone hard tier |
| No pair or three cells, and one lineup for the four | 52, 57, 59 | Pair cells. The four lineups Deadly has to turn from green to red: hammer front, no healer, three mages, four mages |

**What can be judged today, honestly.** A four's pace: yes, within about 5 to 11%. Identity patches: yes. A lone hero's store bill: direction. Party survival, party gold, a pair, a three, anything past Level 185: report only.

### 7.3 What only real players can settle

No simulation result should be offered as an answer to any of these. The first is the one that matters most.

| # | Question | The playtest | Reads as |
|---|---|---|---|
| 1 | **Which party model holds a stranger?** ON HOLD, PENDING 49 for its design | Whatever the study recommends is tested in invite waves, with the ruled fix to Levels 7 to 10 (27-2) and the Path built for every group. Five first sessions recorded with the player talking aloud | Share reaching Level 10, 16 and 32, and day 2 and day 7 return. **At 10 to 15 accounts in each group this is a first look, not a verdict.** Rule of thumb arithmetic: only a gap of about 50 points shows at that size, and about 90 to 100 accounts in each group are needed to see a 20 point gap |
| 2 | Do players wear and trade a named piece, or sell it too? | The three sample pieces and three signature stones in both groups | Worn against sold. Does the player set the stone, sell it or sit on it |
| 3 | Is finding your hero came back from a friend's hunt fun? | Two to four real accounts on different schedules for a week with on-call live | Hunt hours with another account in them. Ask them |
| 4 | Does an old ground at your Level feel like content? | Scaled hunts switched on as ruled for the accounts past Level 110, two weeks | Share of frontier hours on them. Hours a day hold. Then rule free against hourly |
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

## 8. Tyler decides

Every call from the eight reviews, 44, 46 and 47, deduped into one list. The eleven sources raised about 150 calls between them. Merged, they are 88 numbers and 92 rows, because three bundled calls are split so each can take its own answer (10, 56 and 59). Each has one recommendation, its reason, the strongest alternative, and whether it re-opens a ruling. Ids are stable and will not be renumbered. A call that is withdrawn later keeps its id. The ids read GR so they cannot be confused with the gold bands GR-1 to GR-12 of the standards.

"Ruling" uses four words and no others. **RE-OPEN** with an id or date means the recommendation changes something you ruled. **Builds** means it carries out a ruling. **Keeps** means a review asked to re-open and I recommend you do not. **New** means nothing on record covers it. "Bears on" names a ruling the call touches without changing it.

"Priority" is one of the six classes of your brief's section 7.

Six recommendations changed after the cold audit offered an alternative: GR-1, GR-9, GR-27, GR-53, GR-56 and GR-68. In each case I took the audit's recommendation, and the row says why. The audit's seventh alternative was for GR-2, which is now on hold.

**On hold, PENDING 49.** GR-2, GR-10a, GR-10b, GR-10c, GR-67 and GR-80 carry no recommendation until the party and character model study lands. The party XP table inside GR-3 and the live finder inside GR-69 wait with them. For each, the row gives the evidence at its real size and the rulings that stand meanwhile.

### 8.1 The ones that matter most

These are the calls behind the top 10 that carry the most weight. Section 6.1 names every call each top 10 item needs.

| Id | Priority | The call | Recommendation, and why | Strongest alternative | Ruling | From |
|---|---|---|---|---|---|---|
| GR-1 | Critical | **How the server reaches its budget.** PENDING 48 | Rule closed-form town work now, for training, gathering and benches. Hold the away hunt's commit until `48-platform-cost.md` lands. Closed form extends a ruling, is needed on every path and saves 34 of the 60 seconds. The flush is a HYPOTHESIS with a second option in its own source, and nobody has measured it at 12 hours. This is the audit's recommendation and I take it | Rule closed form and a 6 minute flush together now | Builds 28-11 (closed form for training) and extends it. Bears on 11-21 (call 10, $0.15). The 60 is COMPUTED from assumed prices, best case | 59, 50, 43, 61 |
| GR-2 | High | **The price of the second hero** | **ON HOLD, PENDING 49, the party and character model study. No recommendation.** You challenged this as assumed without real evidence. The evidence, at its real size: the two light players are 18 hours of 1,334 between them. Both left at Levels 7 to 9, and one of them had two heroes. The baseline says the causes cannot be separated yet, because the same two players are the evidence for the slow Levels 7 to 10 (your fix 27-2, ruled and unbuilt) and for a coach that opened the whole town at Level 7. 46 alone proposed 10,000 gold. 59 in phase A proposed opening the second hero at Level 10 with no price and called its own evidence two people and a confound, then took 46's number in phase B. So the direction was reached twice and the price once. The first issue of this review recommended the cheap second hero on that, and it should not have | Not offered while on hold | Until 49 lands, 11-09, 11-20 and 11-21 stand: 400,000, 1.5M, 4M | 46, 59, 55, 61 |
| GR-3 | Critical | **What Deadly must ask for** | The harder tiers lane sizes Deadly so an in-band four with a shield tank and a healer holds it, and the same four with a hammer in front or with no healer does not. The lineup test stands under any party model that has a tank and a healer. **The party XP table is ON HOLD, PENDING 49.** MEASURED on the uncalibrated harness, direction only: both of those fours are faster today and neither dies, and four mages hold Deadly | Leave the lineup test out, accept that the best four may be a hammer and three mages, and pay party XP by size alone | Builds 21-3 (11-20) and 31-9 (11-21, spells first, then Deadly). New: the two lineups that must fail. Keeps 10-31 | 52, 57, 46 |
| GR-4 | Critical | **A gear curve as a game formula** | Approve it: linear in the Level a piece is worn at, in `src/data`, with every unique a spend of the curve at published rates. Size a band at a tier's worth, about +24% of the line (bands at 110, 136, 169, 210, 260, 322, 400), not +6.5%. Re-key the two Luck numbers from a band count to Level with the same end points. MEASURED on stand-in grounds: today's gear is 9% slow at Level 400 and cannot hunt at 2,000. The kill reward needs the curve first | 44's +6.5% bands: twenty from Level 110 to 400, each about a quarter of an upgrade | **RE-OPEN** 11-18 (two bands for each region), the reading of 10-25 ("every 15 to 25 Levels") and the 11-20 Luck numbers keyed by band. Keeps 11-14 and 11-16 | 44, 47, 42 |
| GR-5 | Critical | **What a kill pays** | The kill reward follows the pace line with one kill-rate reference (step R12). One tier table for every ground. The per-ground tier dials and the "no bigger pulls under floor 16" rule go in the same step. Party grounds keep their encounter type with three numbers, and their XP per kill is an output of the kill reward. 53 computes it lands about a third lower. MEASURED: the party-ground formula is not the cause of the overpay. The missing kill-rate term as the cause is 44's analysis, not yet proven by a derivation run | Keep the hand fits and re-tune each ground as it reads wrong | Builds 11-07 (one tier table). New for the rest | 44, 53, 43 |
| GR-6 | Critical | **The Level table** | From Level 50, your table of hours is the law and the XP a Level costs is derived from it. Levels 1 to 50 stay as they are, because 27-2 holds them on a lone new hero. COMPUTED: the pace seat reaches Level 100, 200 and 400 in 494, 1,574 and 4,474 hours, 106 hours ahead of your table at each. Krell is day 31 and staged content ends on day 116, four days short of 120. A lone MID hero reaches Level 100 on day 81 and Level 200 on day 211. Judge the Level 100 point with those 106 hours allowed. Smooth the 3.3 times step at Level 50 and the kink at Level 100. It ships with GR-8, after GR-5 and GR-3. Amend the proposed "a Level per day" band, because your own table needs 14.4 hours per Level from 200 to 300 | The law from Level 1, exact at every ruled point, which takes a lone new hero 9 hours to Level 10 against the ruled 6 | Builds 11-21 (calls 1 and 2). Keeps 27-2 | 44, 56 |
| GR-7 | Critical | **Death once Deadly bites** | Keep 6% flat with no cap. After the third Blessing, a new one opens whenever a fully blessed death would cost the pace seat over five hours. Each halves what is left and is priced by the hours it saves. COMPUTED on the recommended Level law: rungs at Levels 97, 140 and 257. Add a matrix band that reads XP after deaths. This settles a conflict between two targets you ruled, the Deadly death band and 6% uncapped: at the band's high end Deadly stops paying at Level 100. At the real count of 2.2 it never does, so the ladder is not needed until the harder tiers lane makes Deadly bite. It ships in that release, sized on the long death sample. Know what it is: for a player who pays, it holds a blessed death tighter than the 12 hour cap you turned down on 11-21 | The capped death the Game Director would take | **RE-OPEN** 50-4 (11-21) in effect, and 11-10 (three Blessings). Bears on 11-16 | 56, 44, 46 |
| GR-8 | High | **Sinks that follow the gear** | Tempering, Hallmarks and linings each cost a share of the band's gold at your ruled 1.2 to 1.4, sized on a hero who pays only the difference at every tier. "Tempering pays the difference" (23-2) stays. COMPUTED: without the re-price a careful hero pays 0.5 to 0.9 of a band at tiers 4 to 6 | Typed ladders that end at tier 7 | **RE-OPEN** 11-18 ("Tempering stays as built") | 44, 47, 55 |
| GR-9 | High | **An old ground at your Level** | Switch scaled hunts on as you ruled (22-9), with one drop rule: a ground played above its band drops its own rows at its own rarity, and its lining parts still drop. Read whether players at the frontier hunt an old ground at their Level. Rule free depth against the hourly fee on that reading. The ruled system has never been open to a player, so its zero uses say nothing. Free depth on every ground stays my leading design, and the fee can go to zero later with one data row. This is the audit's recommendation and I take it | Replace scaled hunts now with free depth on every ground at the lowest hero's Level, as 46 and 53 ask | Builds 22-9 (11-20) and 11-07. Bears on 11-18 (lining parts from old grounds). 44 keeps scaled hunts with derived shares | 46, 53, 47, 61 |
| GR-10a | High | **Playing together while away** | **ON HOLD, PENDING 49. No recommendation.** On-call heroes and standing parties are ruled (25-1) and unbuilt. Whether they are the right way for two people to hunt together depends on the party model. The evidence: 0 hours of two people in one hunt across 1,334 hours and four players, two of whom are friends who each ran their own four. That shows the gap. It does not show which fix closes it | Not offered while on hold | Until 49 lands, 25-1 and 10-25 stand | 57, 46 |
| GR-10b | High | **The Level cut on party XP** | **ON HOLD, PENDING 49. No recommendation.** What is known: the hidden cut you ruled out on 11-08 is live. MEASURED: with no rule at all a Level 5 hero behind a Level 37 party earns 6 times its own pace. What replaces it depends on whose heroes can share a party | Not offered while on hold | Until 49 lands, 11-08 stands | 57, 44 |
| GR-10c | High | **When clans ship** | **ON HOLD, PENDING 49. No recommendation.** The order of clans against other social work depends on the party model | Not offered while on hold | Until 49 lands, 25-3 stands | 57 |

### 8.2 Combat

| Id | Priority | The call | Recommendation, and why | Strongest alternative | Ruling | From |
|---|---|---|---|---|---|---|
| GR-11 | High | The beginner's floor on spells | One floor on the blow a cast reads, in place of 17 per-row floors. Same effect, one number. Three lanes reached it separately | The per-row floors as built | Builds 11-21 (32-8) | 41, 44, 52 |
| GR-12 | Medium | Whether spells miss, crit and read weakness | A physical strike reads weapon weakness. Spells never miss and never crit. MEASURED small: at most 3.5% on one way | A spell is a blow and reads all three, which re-sizes every spell row | New. Built, never decided | 44, 52 |
| GR-13 | Medium | Three shapes of roll | One roll rule with the spread as a number for each kind. Heals keep a spread of zero so a player can plan on them | Leave three shapes | New | 44 |
| GR-14 | High | Weapon weakness | Axes count as "edged" with swords, fists as "blunt" with hammers, the unused resists column goes, and Rend's share rises until the axes sit at 0.95 to 1.00 of the hammer. MEASURED: the repair alone leaves the axes last | Give axes their own side and move three monster classes to it | New. Bears on 32-3 (11-21): check first whether losing Power Strike is why the axes read last | 52 |
| GR-15 | Medium | Turning Cut and Rend | Turning Cut unlocks at Level 1 for the axes and the hammer and at 10 for the sword. Rend sits on the default Melee set | Melee 5 for every weapon | Keeps 11-19 | 41, 52 |
| GR-16 | High | Necrotic and Storm | Seven spells first, one for each weapon, after Deadly is fixed. Sixteen stays the end state. The other nine are redesigned after the seven are played, so no two weapons share a mechanic | Build all sixteen from the plan as written | Keeps 11-18 and 32-6 | 52, 47, 46 |
| GR-17 | Medium | Fists | Two rows. The Hands on mana with no element. The Palm on mana in the element you chose, with a rune as the stronger cast. Re-run the gold test first | Six rows on one shared clock | Keeps the 11-18 identity. Changes plan section 7, which is the designer's and not a ruling | 52, 47 |
| GR-18 | Medium | Quarry Blow | It breaks a monster's spell windup. On a boss it adds a share to the windup. It never stops a swing. A second melee hero costs a four 8 to 13% today because it brings only damage | Leave it as a copy of Flame Strike | **RE-OPEN** 10-23 ("no stagger") in a narrow form, and 32-5 (11-21): the strike you chose keeps its Earth rune and gains the break | 52 |
| GR-19 | High | "Shooters first" | One new target mode, the bow's default. 28% of a real four's damage landed on the healer from shooters | No new mode | New | 52 |
| GR-20 | Medium | A status opens one kind of damage | A sample of three pairs under one total cap, after GR-3. HYPOTHESIS, and the risk is stacking | Do not add it | New | 52 |
| GR-21 | Medium | The crossbow | Its identity is its list and its shield: single target, no Mark, no area shots, Leech Bolt. Its numbers stay. MEASURED: a new stat line moved it 3 to 6% | A list that copies the bow's | Builds 32-6 | 52 |
| GR-22 | Medium | Magic on a weapon hero | Magic adds 0.5% max mana per level for every hero. MEASURED: gate PASS, store bills down 2 to 4%, nothing else moves | Stop paying Magic XP to weapon heroes | New | 52 |
| GR-23 | Medium | Skill at high Level, and endless ladders | Keep the hit as skill plus gear. Do not make it skill times gear. Give skill its late worth through rune tiers past 60, one every 15 skill levels, with the gear curve. The Tower reads any floor from one row | A multiplying formula | Extends 10-23 (five rune tiers). Builds 11-20 | 44 |
| GR-24 | High | The starting weapon | The player picks it at creation. The default today is the way you ruled slow alone on purpose, and its next spells only work in a party | Keep sword and shield for everyone | New | 46, 52, 59 |
| GR-25 | Low | Special rules with no ruling on record | Approve as 44 section 8.1 recommends: the gentle ramp under floor 16 (keep), the boss blow held to a third of the floor hero's health (keep), three training bases for three skills (keep), the three roll shapes and chance rounding (fold, GR-13), a tier a mode does not offer as one content flag (fold) | Rule each one separately | New. Nine rules were never put to you. Six are here. The party fit and the pull floor are in GR-5 and the Tower's table is in GR-36 | 44 |
| GR-26 | Low | Plus skill on chest weapons | Keep the flat +1 to +4 as ruled. The major upgrade is the next tier's numbers, which will come from the gear curve. Grow the number with the key tier later if a player cannot feel it | A percent of the blow, as 44 asks | Keeps 11-14, 11-18, 22-2 | 47, 44 |

### 8.3 World

| Id | Priority | The call | Recommendation, and why | Strongest alternative | Ruling | From |
|---|---|---|---|---|---|---|
| GR-27 | High | What the harder tiers bring | Rule the shape, not the number: one pull number for each tier and no per-ground overrides. The harder tiers lane sets the number from its own sample of 4 seeds by 8 hours with lone, pair and three cells. Five on Dangerous is the leading candidate. MEASURED at today's dial, one seed and one hour for each cell: a lone hero in band holds five at 35 to 49% health with no deaths from the Glade to Krell, for 35 to 65% more XP than Normal, and it costs most or all of the hour's gold. Not yet played at the harder dial you ruled in 21-3. This is the audit's recommendation and I take it | Rule five monsters on Dangerous now | Builds 11-07 (one tier table). Bears on 11-16 ("every Dangerous party stands at or over its heroes alone", which failed on Hask's Ford at five), 21-3 (11-20) and 11-06 | 53, 61 |
| GR-28 | High | One boss door | Call out folds into keyed halls. Every boss gets a hall and a key. The slider becomes "fight with N keys". One key is one prize roll, and a mid-region boss's pieces stay repeatable | Keep both and give Captain Hask a call | **RE-OPEN** 11-14 and 22-8 | 53, 46, 54, 59, 47 |
| GR-29 | High | What a hall's prize holds | Only what no ground drops: the boss's uniques, the region's gem, a Trophy, a first-win piece. The 14 plain Dawnsteel pieces drop in Krell's Hold as Rares. Krell's five weapons replace them on the roll | Keep Dawnsteel on the roll and make the Morrow Hills' Dawnsteel Rare | Keeps 11-14. The roll's contents were the designer's | 53, 54, 47 |
| GR-30 | Medium | Krell's hall is won 38 to 40 times in 40 by every party | Leave his rows alone. When hand rows move to the formula, a hall boss is the boss role times one hall number, sized so a party in band wins 80 to 90% and the weakest named party loses | Raise Krell by hand today, which is the per-boss patch the formula brief forbids | New | 53 |
| GR-31 | High | A signature for each ground | Each ground asks one question (shooters, a group spell, armor, an element, menders), says it on the card, carries it at full dose on the harder tiers and teaches it by frequency on Normal. HYPOTHESIS that players change what they bring | Leave the grounds as fifteen skins of one hunt | New | 53 |
| GR-32 | Medium | Thin bands and uneven pairs | Wickstead moves to about Level 20 to 32 and the Slake to about 58 to 72. A faction pair of grounds shares one band and one XP line | Leave them and draw two new maps | New | 53 |
| GR-33 | Medium | The shape of a region | Six grounds stays the planning number. Each region opens as four grounds and its hall, then the last two. Each region names one new rule before its grounds | Four grounds per region for good | Keeps 11-18 | 53, 47 |
| GR-34 | Remove or simplify | Dead rows | Remove 103 monster rows no hunt uses, three hunts with no ground and the four called boss copies. The art stays in the library | Keep them as an idea pool | New. Bears on 11-21 (nothing planned is cut): lane L36 checks the 80 items that wait on these monsters first | 53, 44 |
| GR-35 | Medium | The named rare of a ground | Each gets one phase trait, so it is an event in the log and not a bigger health bar | Leave them as elites | New | 53 |
| GR-36 | Medium | The Catacombs | Keep their own mode. Build one wing and one key as the played sample before the other 36 pieces. The Tower and the Catacombs take the one party table | A wing of the Tower, as 46 asks | Keeps 11-16 and 22-4. New for the party table | 47, 56, 44, 46 |
| GR-37 | Low | The Tower's beat | It stays weekly. Build the ruled fixes and stop. An idle endgame should score preparation, not hours at the screen | Lift the six opens per week | Keeps 11-21 (call 6) | 56 |

### 8.4 Items and crafting

| Id | Priority | The call | Recommendation, and why | Strongest alternative | Ruling | From |
|---|---|---|---|---|---|---|
| GR-38 | High | Jewelry and cloaks past Level 30 | Build to tier 7, starting with tier 4 and gem chips. Plain numbers are a 6% share of the gear curve, never typed a tier. MEASURED: a point per tier would be twice the budget, and today's flat rows are 15% at Level 30 and 0.5% at 400 | Leave six slots at Level 30 | Builds the jewelry ruling. New for the share | 54, 47 |
| GR-39 | High | Perk sizes | A perk with a narrow case starts at 5% in its case. Always-on perks (Keen, Follow-through, Surge) keep their built sizes. A hero whose twelve seats all match the ground gains at most one weapon step. MEASURED: five times is the ceiling | Hold every perk at about 1% | **RE-OPEN** the reading of 23-5 (4% as a total) | 54, 47 |
| GR-40 | High | Build pieces before Krell | Ship the three designed samples (Widow's Fang, Mudlark's Mitts, Demoncaller) and fill the ruled Very Rare band with signature stones a smith sets in jewelry, on three grounds first. No property piece on every ground. A band before Krell lasts one to seven days | Named property pieces on every ground from the Sewer, as 46 asks | Keeps 11-20. Builds 11-14 and 30-3 | 47, 54, 46 |
| GR-41 | Low | What a unique's property may be | Past tier 7 it is one of seven kinds that change a decision: bane, crit, a spell change, an element edge, a second socket, thorns, the bow's sweet spot. At tier 7 and below the full list stays | The full twelve kinds at every tier | Keeps 11-14 | 54, 47 |
| GR-42 | Medium | Rare rows for each ground | At most six. You ruled the reveal stays on every Rare, and a four sees one every 7 minutes on the Warrens | Leave the rows, and the reveal stays a notification | Keeps 27-6 | 54, 46 |
| GR-43 | Medium | The Crafting bench | It is the outfitter: cloaks, belts, linings, ammunition. Belts move to it. Gloves drop hourly through tier 7. Its three salt recipes leave in the lane that ships linings | Salts on both benches for good, gloves as Rares | Keeps 11-18 (the glove wing). New for the rest | 54, 56, 47 |
| GR-44 | Medium | Six crafted slots past tier 7 | Patterns ship with the Morrow Hills and a pattern teaches the account, not one hero. Single commissions (one Hallmark or one reforge on a piece the owner keeps) ship with jewelry tiers 5 to 7. Bulk orders wait for the market | Defer patterns until a market exists, which freezes six slots for 290 Levels | New. It changes a designer's call, not a ruling. Builds 50-15. The no-mint guard (M4) gates the commissions | 47, 54 |
| GR-45 | Medium | Runecrafting 61 to 99 | A Sealing Rune at 75 and 88, used by the tier 6 and tier 7 Hallmarks. Rune tiers later with GR-23 | Respace the five rune tiers | Keeps 10-23 | 47, 54, 56 |
| GR-46 | Medium | Salvage and the Shop | Salvage is a line on the loot plan beside Sell, with both numbers shown and a starting plan. The Shop keeps its ruled price. Read what players pick before asking again. MEASURED: 15% less gold in made 40 gold bands worse | Salvage by default and a token Shop price | Keeps 11-20, 23-10, 31-6. The no-mint guard (M4) gates it | 47, 55, 46 |
| GR-47 | Low | Curing and the Cellar | Curing is built as ruled, last in the lining work, as a standing order ("keep these linings up"). The Cellar's five food rungs come off sale now, because the effect they sell is being cut | Do not build curing | Keeps 11-18 and 26-7 | 47, 58 |
| GR-48 | Medium | Luck's feeds, the find list, the saved kit | Luck keeps two feeds and one budget. A find list for each ground goes on the Honors page and pays no Luck. a saved kit for each ground changes rings, linings and a unique when the party moves | A find list that pays Luck | Keeps 11-20. New for the kit | 47, 54 |
| GR-49 | Low | Chest reforging | It stays its own verb. It carries a won piece up a key tier and is not a percent on a piece. Tempering is already the one place that sells percent for gold | Fold it into Tempering, as 46 asks | Keeps 22-3 | 47 |

### 8.5 Economy

| Id | Priority | The call | Recommendation, and why | Strongest alternative | Ruling | From |
|---|---|---|---|---|---|---|
| GR-50 | High | The market | Make it idle: standing buy orders, the Sell loot rule sells to the best order, the one-tap refill buys player stock under the store's price. The order book and rare pieces first, supplies second, and only after the tiers are sized on full-effect supplies. Before Crowns. One book for each piece with grade and perks as filters (M9) comes first | Leave listings only and accept a self-sufficient game with a Crown exchange | New | 55, 46 |
| GR-51 | High | Prices | Every repeating price is hours of one wage curve the server computes. The four coin dials fold into one coin line with the same gold. Hero slots and the House stay typed | The ruled band index past Krell only, with Levels 1 to 110 hand-priced | Extends 24-11. Builds 11-16 ("cut income instead") | 44, 55 |
| GR-52 | High | The store's healing | One gold-a-hit-point line with its top near 0.60, and heal size as a share of reference health. After the store-bill fault closes. MEASURED: a lone hero's Deadly bill falls 49% and no other number moves | Leave the table, and a lone hero on Deadly pays 1.8 to 3.7 times its coin | New | 44, 55 |
| GR-53 | Medium | The House dummy | The dummy still ends the yard fee, as you ruled. Its unlocks become rungs by skill band, each priced at 25 to 50 hours of the yard fee at that band, on the wage curve of GR-51. The fault was never "no fee". It is that the fee grows with skill and the dummy's price does not, which is a formula fault. Fixed there, both of your rulings hold and the sink keeps growing. This is the audit's recommendation and I take it. It replaces the first issue's "halve the fee" | The dummy halves the fee for good, as 55 and 58 ask | Keeps 11-08 and 26-5 (11-20, "pays for itself in 25 to 50 hours") | 55, 58, 61 |
| GR-54 | Medium | The yard's rate | It follows a share of the skill level's cost, never passes half of what hunting pays that skill, and the fee follows the rate. At one flat rate a skill level takes 51 to 243 yard hours from skill 75 | Keep the flat rate and decide when a hero passes Level 300, as 56 asks | **RE-OPEN** 11-14, A-5 and 21-7 (11-20: the flat rate stays and the yard is a catch-up system) | 44, 58, 55, 56 |
| GR-55 | Low | When the market opens | Day one. Town Works' first project builds something else. A locked market teaches that there is no market | The ruled goal sized to the server | **RE-OPEN** 24-7 | 55 |
| GR-56a | Remove or simplify | The price on setup slots | Setup slots 4 and 5 are free. Nobody has paid for one and it charges for a remembered decision | Keep the two prices as a small sink | **RE-OPEN** 11-05 | 55, 59 |
| GR-56b | Low | The bench tax | Keep it and move it onto the wage curve. It is your 11-01 ruling, and "the bench with no fee" is the first rung of every House room (26-1). With the tax gone, and the speed rungs going too (GR-76), the first rung of eight rooms would sell nothing. This is the audit's recommendation and I take it | Remove it, as 55 asks, because it is under 0.1% of gold out | Keeps 11-01 and 26-1 (11-20) | 55, 61 |
| GR-57 | High | Spending while you sleep | A hunt budget replaces the gold floor: "spend at most N at the store", remembered for each ground and tier. The floor defaults to 300 and Deadly can burn 121,000 an hour | Raise the floor's maximum and default | New | 55 |
| GR-58 | Medium | The refill price | Hold it until the store-bill fault closes. The finding that a refill costs more than its hours earn may be half its size | Re-price now on the harness number | New | 44 |
| GR-59a | Medium | The gauge | Print gold made, destroyed and held every day from the journal. Nobody can steer what nobody reads | Steer without a gauge | New | 55 |
| GR-59b | Remove or simplify | One laundering route | Remove the 1,000 gold floor per unit on the stackable ceiling. For the Security review | Leave it for the one big review to find | New | 55 |
| GR-60 | Defer | Crowns | After the market has something scarce to price. Right design, wrong time | Open Crowns with listings only | Keeps the Crown rulings. Timing is new | 55 |

### 8.6 Progression

| Id | Priority | The call | Recommendation, and why | Strongest alternative | Ruling | From |
|---|---|---|---|---|---|---|
| GR-61 | High | A permanent build choice | Lift the hold for a spec and a paper sample of five rungs only. One system, not three: every ten Inner Flame levels a hero lights one of three Kindlings. It spends the 2% that was set aside for worn in, touches no drop and no Magic Find, and copies no perk. Built after the combat laws | Keep the hold and let gear carry the long game | **RE-OPEN** 11-05, for a spec only | 56, 47, 46, 52 |
| GR-62 | High | Honors | Titles, Trophy display, mounts, firsts and round Levels become one page with one rule and no power. Level 100, 200, 300 and 400 each give a title and a line to the whole server | Five small lists as built | New. Builds "Level 200 is a big deal" | 56 |
| GR-63 | Remove or simplify | Dead ladders | Delete the rested bank and the two old kill ladders. MEASURED: switching the bank off moved no number in 207 cells | Make the bank pay, which adds an XP lever the pace law must carry | New for the rested bank. Builds the ruled cuts of the two old ladders | 56, 58, 59, 44 |
| GR-64 | Low | No new skill, prestige or stat points | None of the three. An uncapped Level already is the prestige loop, and stat points put Level into the blow | None offered | New | 56 |
| GR-65 | Remove or simplify | Inner Flame and death | Take Inner Flame off the list of skills a death takes progress from. It is trained at the Hearth, not in a fight | Leave it on the list | **RE-OPEN** 11-09 | 44, 56 |
| GR-66 | High | The risk reading | Every player sees, free, how close a hunt came to a death and the deaths per 100 hours of that ground and tier. The per-rule bar report may sit in the Premium analyzer. Selling the warning would read as selling safety | Both blocks in the Premium analyzer | New | 59, 56, 53 |
| GR-67 | Medium | Two party bands that cannot both be met | **ON HOLD, PENDING 49. No recommendation.** What is known, MEASURED on the uncalibrated harness: P6 wants a four at 1.15 to 1.25 of a lone hero on the same tier, P7 wants it at 1.8 to 2.5 of the contract, and a lone hero on Deadly already reads 1.9 to 2.8 of the contract, so any four that meets P6 breaks P7. Which band counts depends on what a party is | Not offered while on hold | Until 49 lands, 10-25, 11-16 and 11-21 stand | 57 |

### 8.7 Social

| Id | Priority | The call | Recommendation, and why | Strongest alternative | Ruling | From |
|---|---|---|---|---|---|---|
| GR-68 | Defer | The clan castle | Leave the castle hidden and unbuilt, as you ruled. Decide its shape when the first clan reaches ten accounts. Projects on the Town Works engine (one project at a time, stages, gifts, a plaque) go on the board as the leading design for that decision. No clan has existed, so "nobody used it" is no reason to retire it. This is the audit's recommendation and I take it | Retire the old castle code now and rebuild later, as 57 asks | Keeps 25-3, 25-4, 25-5 (11-20) and 31-3 (11-21) | 57, 46, 61 |
| GR-69 | Remove or simplify | Three things nobody used | Remove the Local chat tab, hold the live party finder until the party model is decided (PENDING 49), and strike "maybe 5 later" from the rulings | Keep them dark until the game is big | **RE-OPEN** 11-11 (criers call out "in local chat"): their lines move to the town itself or to Global. Builds 25-11 | 57 |
| GR-70 | Medium | The town | It draws heroes at work whether or not their owner is online. Waits for the platform sizing | Draw only live players | New | 57 |
| GR-71 | Low | Factions | Keep skills that matter. A side is chosen per hero, and one press joins them all | Story and outfits only, as 46 asks | **RE-OPEN** 25-10 (one press joins the whole account). Keeps 31-8 | 57, 46 |
| GR-72 | Medium | A friend link at sign-up | Yes, with no reward. Your players arrive as friends and the game does nothing with that | Rely on Discord | New | 57 |

### 8.8 Home

| Id | Priority | The call | Recommendation, and why | Strongest alternative | Ruling | From |
|---|---|---|---|---|---|---|
| GR-73 | Medium | The Trophy room | It becomes the Hall of Firsts. Wall room comes from the Keep and the Castle, not from mount rungs. Each piece hung costs a mounting fee priced in hours of its band's wage | Five mount rungs for 695,000 as planned | **RE-OPEN** 26-6 (11-20) | 58, 56 |
| GR-74 | Remove or simplify | The farm's gates | Remove the soil tiers, so a crop opens at its Farming level and nothing else. Watering folds into Tend | Keep soil tiers as a 130,500 gold sink | New | 58, 46 |
| GR-75 | Low | Home looks and visiting | Three looks (cottage, manor, castle), two new maps. Visiting opens at the Homestead once the Hall exists | A map for each deed and visiting at the Castle | **RE-OPEN** 26-3 (a map for each deed) and 26-11 | 58 |
| GR-76 | Medium | Sixteen speed rungs | Swap them for kept materials now, ahead of the lining work, or hold them off sale. They cost 5.25M and never pay back. MEASURED: the swap is an identity for the hunt | Wait for the planned wave | Builds 26-1 (11-20), sooner | 58, 46 |
| GR-77 | Medium | Seeds from monsters | A sample of two with the Morrow Hills, each growing a drink on the existing ladder | Shop seeds only | New | 58 |

### 8.9 Features

| Id | Priority | The call | Recommendation, and why | Strongest alternative | Ruling | From |
|---|---|---|---|---|---|---|
| GR-78 | High | Tamsin's tally | The task for the ground a hero enters is taken on entry with no press. 3,251 wolves were killed that she would have paid for | Merge the tally, the Bestiary and titles into one kill ladder | New | 59 |
| GR-79 | High | The Path and the population gate | One table says what opens every system: a Level, a first event or enough active accounts. The Town menu, the coach, What next and the Book all read it. Every dark system stays shut until a stranger stays twenty hours | Keep the coach deck and only hide Town lines by Level | New | 59, 46 |
| GR-80 | High | The company as one thing | **ON HOLD, PENDING 49 for one Start, one plan and one return card across an account's heroes.** That idea assumes the own four is the model. The evidence: 99 of 249 hunts ended because the player's own other hero left, from two heavy players. Not on hold, because it serves any model: a job queue for one hero (fish, then cook, then hunt) | Not offered while on hold | New | 46, 59 |
| GR-81 | Medium | Next ground when outgrown | Allow it as a one-step "when the hunt ends" choice, Normal only. The player chose it and stamina still ends the day | The away card says "outgrown 5 hours ago" and offers the next ground in one press | **RE-OPEN** 27-1 (11-20, "No hunt ever starts by itself") | 59 |
| GR-82 | Medium | One Great Hearth | Town Works, the Hearthrise event and flame powders become one Hearth the whole server feeds. Inner Flame stays a hero's skill and pays in Kindlings. HYPOTHESIS that one is more fun than its parts | Keep the parts as built | **RE-OPEN** 24-10. Bears on 24-7 | 46, 59, 56 |
| GR-83 | Low | No dailies | Rule that Hearthrise has no daily quests, login calendar or season pass. The visit, the stamina bar, the weekly turn and the monthly project are the beats. Weekly orders are not covered and stay on the plan | Judge each proposal as it comes | New. The first issue cited a 10-22 ruling here. I could not find it in the rulings file and have removed the cite | 59 |
| GR-84 | Low | Small presses | The Premium daily claim is granted on the first visit with no press. Setups, action sets and presets become one noun, remembered for each ground. A Week card compares your week with your last | Leave them | New | 59 |

### 8.10 Architecture

| Id | Priority | The call | Recommendation, and why | Strongest alternative | Ruling | From |
|---|---|---|---|---|---|---|
| GR-85 | Critical | The 0.2.144 formula steps | Go: V1 to V5, R1 to R5, R7, the floor half of R6 and the fold of R8. Each moves no number, fixes a bug or builds a ruling. R7 (a tier's dial applied once) is a correctness fix: nobody meant a Level 8 monster to count as Level 21 | Hold all formula work until after the beta | Builds 11-20 (the Tower heat) and 24-8 (the yard fee) | 44 |
| GR-86 | Medium | The later engine steps | One amount pipeline rounded once with a trace for each blow (R19), one modifier table (R20), every monster on the formula (R21). R19 is the engine's inner loop and rides a combat batch | Leave the nine floors in a row | New | 44 |
| GR-87 | Medium | Drops and sales | Drops are authored in hours with the chance derived (R18). One sale formula that works at tier 8 (R17) | About 300 typed chances | New | 44, 43 |
| GR-88 | Critical | The gate | A matrix diff is the release gate for every balance change. It gains a band for XP after deaths, band rows on the ground axis, pair cells and the four lineups Deadly must turn red. The registers are guarded in CI | Review by eye | New | 44, 52, 53, 56 |

### 8.11 Call counts

| Group | Numbers | Rows | Ids | Rows that re-open a ruling |
|---|---|---|---|---|
| The ones that matter most | 10 | 12 | GR-1 to GR-10c | 3 (GR-4, GR-7, GR-8). Four rows are on hold |
| Combat | 16 | 16 | GR-11 to GR-26 | 1 (GR-18) |
| World | 11 | 11 | GR-27 to GR-37 | 1 (GR-28) |
| Items and crafting | 12 | 12 | GR-38 to GR-49 | 1 (GR-39) |
| Economy | 11 | 13 | GR-50 to GR-60 | 3 (GR-54, GR-55, GR-56a) |
| Progression | 7 | 7 | GR-61 to GR-67 | 2 (GR-61, GR-65) |
| Social | 5 | 5 | GR-68 to GR-72 | 2 (GR-69, GR-71) |
| Home | 5 | 5 | GR-73 to GR-77 | 2 (GR-73, GR-75) |
| Features | 7 | 7 | GR-78 to GR-84 | 2 (GR-81, GR-82) |
| Architecture | 4 | 4 | GR-85 to GR-88 | 0 |
| **All** | **88** | **92** | | **17**, with 6 rows on hold |

**How the re-open count moved.** The first issue counted 15. The audit read the Ruling column against the rulings file and found 23, because eight calls changed a ruling under a softer word. In this issue five of the audit's alternatives stop re-opening a ruling (GR-9, GR-27, GR-53, GR-56b and GR-68) and GR-2 is on hold with its rulings standing, one call gained a ruling the audit found (GR-69), and the split of GR-10 counts two rows. That left 19 rows. Then the party model went on hold, and the two re-opens inside GR-10 went with it, which leaves 17.

**Re-opens that a review or audit asked for and I do not recommend.** Salvage by default (GR-46). Seven spells in place of sixteen (GR-16). Dropping curing (GR-47). The Catacombs as a Tower wing (GR-36). Plus skill as a percent of the blow (GR-26). Party XP by size only (GR-3). Removing the party-ground formula (GR-5). Folding chest reforging into Tempering (GR-49). Factions with no power (GR-71). A death cap (GR-7). Respacing the rune tiers (GR-45). And, after the audit: free depth now (GR-9), five on Dangerous now (GR-27), halving the dummy's fee (GR-53), removing the bench tax (GR-56b) and retiring the castle (GR-68).

---

## 9. Evidence and hypotheses

### 9.1 What is measured

Played on the real engine tonight, through the matrix's diff or a lane's own run on the matrix's exports.

| Finding | Sample | Lane |
|---|---|---|
| Lineups on Deadly: the hammer front, no healer, three and four mages | 1 to 2 seeds, 1 hour per cell, Levels 30, 60, 110 | 52, 57 |
| The weakness repair, the crossbow's stat line, Magic's mana, strikes reading weakness | 207 cells, same dice | 52 |
| The party-ground formula removed. Dangerous on Normal's pack and on five. A signature at double dose | 422 cells on the ground axis, 1 seed, 1 hour | 53 |
| Perks at five times. Accessories at tier 7 numbers. The wait for Dawnsteel | the matrix subset | 54 |
| The heal line. Full-effect supplies. Gold in at 0.85 | 207 cells | 55 |
| The Level law. The death share halved. The rested bank off. XP after deaths by tier | 207 cells, and the 31 checkpoint grid | 56 |
| Same-style fours. The size row both ways. A low hero behind a high party | 1 to 2 seeds | 57 |
| The bench rung swap as an identity. Home supplies worth +6 to +10% to a party | the matrix subset | 58 |
| The low-health reading against deaths | 207 cells, 9 with a death | 59 |
| Pace holds from Level 200 to 5,000 on a gear curve. Skill at 261 extra levels is 56% less damage taken | the real engine, stand-in gear | 42 |

### 9.2 What is computed, not played

The server-cost path (645, 180, 147 against 60), from production means at 3.3 hours stretched to 12. The death cost table. The runway days. The Tempering table under 23-2. The yard fee against gold in. The dummy's payback. The band positions on the gear curve. Every number past Level 185, where gear and grounds are stand-ins.

### 9.3 What rests on real players, and how thin it is

Four people played 1,334 hours. Two were heavy and are friends of yours. The two light players are 18 hours in total, 1.4% of all play. They left at Levels 7 to 9, in opposite ways, and one of them had two heroes. The baseline says the causes "cannot be separated yet": the lone stretch, the slowest Levels in the game at 7 to 10 (your fix 27-2 is ruled and not built), and a coach that opened the whole town at Level 7. Every sentence in this document that says "nobody" or "zero uses" is true of four people. Zero uses of scaled hunts and of the clan castle say nothing at all, because neither was ever open. No lone, pair or three hours exist on the current rules.

### 9.4 What is a hypothesis

Everything about fun. Named in full in section 7.3. The largest is which party model gives the game an MMO feel, which study 49 is answering. After it: that players keep and trade a named piece, that on-call heroes are used, that an old ground at your Level feels like content, that Kindlings are a build, that a signature changes what a player brings, and that standing orders fill. Three content proposals are hypotheses with nothing to measure yet because the rows are paper: the seven spells, the fists and the cast breaker.

### 9.5 Calibration caveats

1. The matrix's four kills 1,386 an hour on Krell's Deadly against the real 1,251. A four's pace reads about 11% fast.
2. The harness tank takes 96% of the damage against 69% real, and the healer 0.5% against 28.5%. The back row is safer than in real play. No shooter, signature or party survival number is trustworthy.
3. The harness party's store bill is 1.9 times real. Every party gold number is a lower bound on what a real party keeps, and every lone harder-tier loss is overstated.
4. Past Level 185 the harness plays heroes with skills the game cannot give. Those cells are too kind.
5. A dead harness hero stands up at once, so a death count on a failing cell is a retry count.
6. Most measurements are one seed and one hour per cell. Deaths are rare events and are under-sampled. Read every number as direction and size. The most important thin number is whether a lone hero really holds Dangerous.
7. The matrix cannot see a death's cost, town hours, loot routing, a pair, a three, or any system that is not built.
8. `51-baseline.md` and `48-platform-cost.md` had not landed. Sections 4.5 and 7.2 and call GR-1 are PENDING.
9. Every number on the Level law is COMPUTED on the cached grid from measured XP rates. A curve moves no fight, so none is a measurement of the curve. Cells from Level 185 up are PROVISIONAL. Phase B played a trial power law that was withdrawn, and its matrix flags stand as directions only.

### 9.6 What this lane did and did not do

Read: briefs 45 and 40 in full. 46 in full. 44 sections 1 and 5 to 9. 47 sections 1, 3, 4, the order and 6. 50 sections 0, 2, 10.4 and 11. For each of 52 to 59: the summary, the rationalization table, the missing opportunities, the priority list, the calls and the phase B section. The rulings of record for the superseded list, the open conflicts and the slot rulings.

Not read in full: 41, 42 and 43 (taken through 44, which is their dedupe), the interaction-trace and eight-criteria sections of the reviews, and `itemization-plan.md` (taken through 47). No number here was re-measured. Every one is a lane's own, with that lane's label. I played no hunt for this document, because the Game Director's blind hour (46 section 0) and the eight phase B runs are the play it rests on. The counts in section 1.8 are each review's own and were not re-counted row by row.

No game code, data, migration, guard or test was changed.

### 9.7 What the cold audit changed

`61-review-audit.md` judged the first issue YES WITH FIXES. Applied in this issue:

| Audit item | What was done |
|---|---|
| C1 | Every "on the Level law" number now comes from the progression review's corrected run on the ruled table from Level 50 (56 sections 0.2 and 0.3), labeled COMPUTED. The trial curve's numbers are gone (sections 4.1 to 4.3, 5, 6, GR-6, GR-7) |
| C2 | The death break is labeled COMPUTED everywhere, with the real death rate beside it |
| C3 | GR-53 cites 26-5, and its recommendation changed to one that keeps both rulings |
| C4 | GR-56 is split. The bench tax is kept, citing 11-01 and 26-1 |
| C5 | All thirteen MISSED rows of the itemization fit are in section 2.3, each with its lane. M4 gates GR-46 and GR-44. M9 is a condition on GR-50 |
| H1, H2, H5 | The agreement table has an "Independent?" column. The second hero's row says what each lane reached and when. The 18 hours are stated |
| H3 | The 3.3 hour argument against the slot ruling is deleted |
| H4 | "Deadly needs no roles" is two runs on one harness, with both sizes |
| H6 to H9, H12, H13 | The Ruling column uses four words only. Each missing ruling is cited. The re-open count is re-done (8.11) |
| H10 | The kill reward's cause is labeled as analysis, not measured |
| H11 | "0 uses of scaled hunts" is gone as evidence. Day 27 is labeled COMPUTED |
| H14 | Every call has a Priority. Section 6.2 lists the six classes with expected benefit. The top 10 has an expected benefit column |
| M1 | Ids renamed GR-1 to GR-88 |
| M2 | The top 10 names the calls each item needs |
| M3 to M10, M12, M13 | Applied: the 60 is labeled COMPUTED, the gear claim is restated, the risk reading is restated, Quarry Blow cites 32-5, the 19 keys are one window, the criers are named, the cut list waits for L36, the gold statements agree, the test's size is stated, GR-10 and GR-59 are split |
| M11 | Partly. Section 6.1 says what is added to the beta. I did not cost the additions in lanes |
| L1 to L8 | Applied where found: "for each" phrasing, American spelling, terms defined, the features count, the perk sentence, three labels, one alternative in each cell |
| The top 10 | The instrument is item 1. Free depth is a test in item 10 |
| The seven alternatives | Six adopted: GR-1, GR-9, GR-27, GR-53, GR-56, GR-68. The seventh, GR-2, is on hold |
| The frame of 11-21 | Arguments from the cost to today's heroes are removed. Every call is judged against the target game |
| Your challenge to the second hero | GR-2 and every call that depends on the party model are ON HOLD, PENDING study 49. The top 10 carries the decision itself as item 9 and no second-hero recommendation |

Not done: the eight criteria of brief 45 section 4 are not shown for each call. 48 and 51 had not landed.
