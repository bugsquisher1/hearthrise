# Balance program 03: the phase-2 split

115 systems in 8 domains. Every system has exactly one owning domain (`tools/balance-program/systems.mjs`; `node tools/balance-program/domain.mjs` prints this table from it). A dive owns its systems' cards and verdicts. What it finds in another domain goes in its "For other dives" list.

| # | Domain | Systems | live | dark | staged | designed | ruled | idea | File the dive writes |
|---|---|---|---|---|---|---|---|---|---|
| 21 | Combat and progression | 23 | 16 | 3 | 1 | 0 | 1 | 2 | `docs/design/balance-program/21-combat.md` |
| 22 | Endgame modes | 8 | 5 | 2 | 0 | 1 | 0 | 0 | `docs/design/balance-program/22-endgame.md` |
| 23 | Items and crafting | 22 | 14 | 2 | 0 | 6 | 0 | 0 | `docs/design/balance-program/23-items.md` |
| 24 | Economy | 14 | 12 | 0 | 0 | 0 | 2 | 0 | `docs/design/balance-program/24-economy.md` |
| 25 | Social | 11 | 4 | 6 | 0 | 1 | 0 | 0 | `docs/design/balance-program/25-social.md` |
| 26 | Home | 15 | 14 | 0 | 0 | 0 | 1 | 0 | `docs/design/balance-program/26-home.md` |
| 27 | Retention, live ops and teaching | 14 | 12 | 1 | 0 | 0 | 0 | 1 | `docs/design/balance-program/27-retention.md` |
| 28 | Platform, cost and scale | 8 | 7 | 0 | 1 | 0 | 0 | 0 | `docs/design/balance-program/28-platform.md` |
| | All | 115 | 84 | 14 | 2 | 8 | 4 | 3 | |

Status: **live** a player can reach it today; **dark** built and switched off, hidden or with no caller; **staged** written and not applied or merged; **designed** a spec, no build; **ruled** Tyler said yes or hold, no spec; **idea** backlog.

## Order

Three or four dives at a time (the usage rule). Proposed:

- **Wave 1: economy, endgame, home, social.** These hold what the first audit missed and Tyler named (the Tower and Catacombs as progressions, the House and every upgrade, clans and clan castles), and the economy dive's gold model is what the other three price against. The economy dive commits and pushes its gold table (its question 1) FIRST, so the others can read it mid-dive.
- **Wave 2: combat, items, retention, platform.** The first audit went deepest on combat and items, so these build on it. Retention needs the other dives' systems to write the teaching table, and platform needs every dive's server-cost answer.

If only one thing can start now, start **combat** beside wave 1: the real baseline's largest gap is its own (a real own four at about 3 times the pace contract, Level 50 in 72 hours against the table's 165), and the pace it settles is what every other dive's weeks and prices are counted in.

Two hand-offs cross the waves. The endgame and home dives need the combat dive's to-hit change for the Tower's curve and the yard's value: in wave 1 they measure on today's engine and mark those answers "re-measure after 21". The social dive needs the items dive's recipe values for the castle board: it uses Shop prices and marks them the same way.

## What every brief shares

Paste this block above the domain's own block.

> You are running one PHASE-2 DIVE of the Hearthrise whole-game balance program (Tyler, 2026-11-20: it gates the beta). CLAUDE.md is loaded; follow §1, §3.5 and §10. Work only in your own worktree on your own branch, cut from the current set branch with `lane/d-balance-inventory` merged in. Change NO game code, data or migration; never touch main, never stash, never write to production. Measuring tools go under `tools/balance-program/` or `tools/balance-sim/staged/`.
>
> Read, in this order: `docs/design/balance-program/01-model.md` (the shared model and the harness), `02-requirements.md` (the card you fill for every system), `10-real-players.md` (what real players did; the own four of one person on Deadly is the real player), then Tyler's rulings of record (`~/.claude/projects/R--the-game-the-game/memory/rulings-of-record.md`, newest wins, never quote a superseded line), then `docs/DESIGN_STANDARDS.md` sections 4 and 8. Then run `node tools/balance-program/domain.mjs <domain> --docs`: it prints every system you own with its status, what it uses and gives, every file, table, function and client RPC it has in the game, and every ruling, board section and lane that names it. That list is your scope. If you find a system in your area that the list does not have, say so at the top of your report: the inventory must gain a row.
>
> For EVERY system you own, fill the 13-answer card of `02-requirements.md` and give a verdict (KEEP, FIX, MERGE, CUT, BUILD, HOLD), with a change row for every FIX, MERGE, CUT and BUILD. Dark, staged, designed and ruled systems get the full card against their design. Every number carries its label (MEASURED, CITED, RULED, READ FROM DATA, ASSUMED, PROPOSED) and, when MEASURED, the command. Use the seven reference players, the eight reference points and the commands of 01 section 6 unchanged, so your numbers can be laid beside the other dives'. Play what a player can reach before you judge it (`node tools/qa/local-world.mjs serve`, a new account, learning only from the screen).
>
> Write `docs/design/balance-program/<file>`: a one-screen summary (verdict counts, the five changes that matter most, what Tyler has to rule on), the cards in registry order, "For other dives", then "Measured, cited, assumed". Commit WIP often. Finish with `LANE DONE: <branch> <sha>` and report one table plus at most three sentences.

## 21. Combat and progression

**Agent:** game-designer. **Branch:** `lane/d-balance-combat`. **Writes:** `docs/design/balance-program/21-combat.md`. **Scope command:** `node tools/balance-program/domain.mjs combat --docs`.

| System id | Status | System | Uses | Gives |
|---|---|---|---|---|
| `hunts` | live | Idle instanced hunts (sessions, end reasons, restart, resume) | stamina, supplies, gold (store fallback), hunt hours | Level XP, skill XP, gold, items, bestiary kills |
| `combat-engine` | live | The combat engine (damage, to-hit, mitigation, movement, targeting, leash, pulls) | two stat blocks (hero, monster), the bar, positions | kills an hour, damage taken, deaths |
| `level` | live | Level, uncapped (the curve, XP a kill, the pace contract) | kills (Level XP) | HP, mana, gear worn by Level, grounds opened |
| `combat-skills` | live | Combat skills: Melee, Ranged, Magic, Defense (uncapped, exponential cost) | blows landed, mana spent, hits taken, training hours | to-hit, max hit, spell versions, power |
| `inner-flame` | live | Inner Flame and the Great Hearth (regen skill, bones, named fuels, flame color) | bones, fuels, town hours | HP and mana regen rate, flame color, Hearth Cinders |
| `weapon-roles` | live | Roles by weapon: seven families, stances, armor weights | a worn weapon and armor weight | the way a hero fights (XP x1.2 to x1.9 between ways), party class |
| `action-bar` | live | Action bar, conditions, setups, presets, the hunt prep builder | choices made once | every hunt, remembered and copyable |
| `spells-runes` | live | Spells and rune families (five versions by Magic, runes as reagents) | runes or store runes, mana | damage, heals, Magic XP |
| `tank-runes` | live | Tank rune spells (Frost Slam, Shelter; party only) | runes | party survival, never lone kill speed |
| `elements` | live | Elements, resistance and weakness (percentages, never immunity) | the ground's element, worn guards | damage dealt and taken by element |
| `necrotic-storm` | dark | Necrotic and Storm (two elements, sixteen spells, Bone and Storm runes) | Bone and Storm runes | damage, sustain, mana |
| `fists` | dark | The fist line (an eighth weapon family) | drops | a comfortable lone way |
| `monsters` | live | The monster roster, classes, spawn mixes and the one stat formula | a ground's floor Level | HP, attack, defense, XP and gold a kill |
| `monster-spells` | live | Monster spells, shooters, mends and boss phases | a ground's rows | damage by element, a reason for guards and bar rules |
| `difficulty-tiers` | live | Difficulty tiers: Normal, Dangerous, Deadly (one choice a ground) | a tier choice | pull size, monster stats, XP x1 to about x2.3 a head |
| `grounds-live` | live | Hunting grounds, Greenhaven and the Barrow March (Levels 1 to 110) | art, a pack of data rows, a region kit | a place for every Level band, drops, story |
| `grounds-staged` | staged | The Morrow Hills and the Catacombs ground (Levels 110 to 185) | art (the critical path), packs | Levels 110 to 185, uniques, the factions' home |
| `regions-4-7` | idea | Regions 4 to 7 (Levels 185 to 400) | everything | about 3,400 pace-table hours with nothing in them |
| `death-blessings` | live | Death (6% of Level XP) and Blessings | gold (Blessings) | lost Level XP and skill progress, kept by 25/50/75% |
| `stamina` | live | Stamina (8 h free, 12 h premium, 1:1 rest) | time out of a hunt | hunt hours a day |
| `skill-tree` | ruled | A skill tree | - | - |
| `companions` | dark | Companion pets | gold or drops (old design) | a perk (old design) |
| `pvp-ctf` | idea | Idle PvP capture the flag | player count | a helmet key |

**Brief, ready to paste (after the shared block):**

> DOMAIN: Combat and progression (23 systems: hunts, combat-engine, level, combat-skills, inner-flame, weapon-roles, action-bar, spells-runes, tank-runes, elements, necrotic-storm, fists, monsters, monster-spells, difficulty-tiers, grounds-live, grounds-staged, regions-4-7, death-blessings, stamina, skill-tree, companions, pvp-ctf). File: `docs/design/balance-program/21-combat.md`.
>
> Also read:
> - `docs/design/whole-game-audit-2026-11-20.md` sections 3, 4 and 6 (the first audit went deepest here: build on it, do not redo it)
> - `src/data/core-model.js` (LEVEL_PACE, the skill curve), `src/data/balance-sheet.js` (STAT_FORMULA, the ground fits), `src/core/combat.js`
> - `tools/balance-sim/skill-lines.json` and `played.mjs` (how real heroes are set up)
> - board sections "2026-11-19 Balance audit (real hunts)" and "2026-11-19 Complete balance look" in `docs/planning/PRIORITY_BOARD.md`
>
> What real players did in your domain (`10-real-players.md`, REAL; THIN past Level 46). Start from these:
> - The real player is one person's own four on Deadly from Level 10: 91% of hunt hours, at 2.9 to 3.0x the pace contract at Levels 45 to 84 and 4.9x on the Slake (THIN). Level 50 comes in 72 hunted hours against the table's 165, Level 75 in 100 to 119. Which is wrong, the table or the four? Rerun the four on the Slake, Pyre Field and Krell's Hold first.
> - Deaths are early and alone: 8.9 in 100 hours under Level 16 (cistern spider, culvert bat, the Sewer at 10.4), then almost none: 1 in 449 hours past Level 45. The harness reads 0 everywhere. Death is a wall for the New player and no stake for the player furthest in.
> - Skills: main skill 7 to 10 under the career line by Level 60; Defense is two populations (front seat about its main skill, back three 13 to 30). Any to-hit form must be shown on both.
> - Coppercap Warrens holds 32% of all real hours from Level 10 at 2.24x the contract; Wickstead, Hask's Ford and Muster Barrows together 45 hours; the Mill Cellar is hunted to Level 61. The advised route is not the route played.
> - 99 of 249 kept hunts ended because another of the player's own heroes left; 68% of hunts have no after-hunt plan. Count the presses to restart an own four.
>
> Beyond the card, answer these in your summary:
> 1. The reference table (01 section 5) shows a Deadly four at 1.8 to 2.6 times the pace contract with no death from Level 30 to 118. Which lever gives way so the product of tier, party and way is at most 2.0, and where does "struggle or pay" (Tyler 11-19) show up as deaths or a supply bill?
> 2. To-hit: the monster reaches its 85% clamp at Level 60 and the career hero falls to 55% at 165 (audit 3d). Give the ratio form, in stats against stats (NO LEVEL IN COMBAT, 11-18), and show REF at all eight points before and after with `measure.mjs curves` and `what`.
> 3. Combat skills cost x1.04 a level for ever against a flat yard rate. What is a skill level worth at 10, 60, 110, 240 and 400, and is there any reason to train past the career line?
> 4. Every ability added to a bar is a multiply lever (Necrotic and Storm measured +13 to +29% for a lone sword). State the bar budget: how many slots fire, and what a new spell replaces.
> 5. Each of the eight ways to fight (seven families and fists): XP, net gold and damage taken against the lone hammer at four points. Which are inside the band, and which are slow on purpose (sword and shield, sword alone: RULED 11-19)?
> 6. Death: is 6% the right price at Level 30, 110 and 240 in REF hours, and do Blessings (2,250 gold at 70 against a death worth 10 hours) leave any decision?
> 7. Inner Flame has 16 recorded hours of use. Reason, merge or cut.
> 8. Grounds: one lone ground for 16 to 44 and 85 to 110, nothing drafted for 142 to 165. What does a hero do there, and what does a ground cost us in hand dials (`measure.mjs fits`)?
> 9. Companions, the skill tree and PvP are dark, held and an idea. Say only what must be true of the model before any of them is designed.

## 22. Endgame modes

**Agent:** game-designer. **Branch:** `lane/d-balance-endgame`. **Writes:** `docs/design/balance-program/22-endgame.md`. **Scope command:** `node tools/balance-program/domain.mjs endgame --docs`.

| System id | Status | System | Uses | Gives |
|---|---|---|---|---|
| `tower` | live | The Burning Tower (floors, landings, keys, the board) | stamina, supplies, hunt hours at about half XP | keys, 50% XP, a board place |
| `catacombs` | dark | The Unmarked Catacombs descent (wings, keys) | stamina, supplies | armor keys, 37.5% XP |
| `hearth-chest` | live | The Hearth Chest (keys, warmth, stoke, Tower weapons, Catacomb armor, outfits) | keys, Cinders, six opens a family a week | chest weapons, armor, outfits |
| `chest-reforge` | designed | Chest reforging, fusing, two-attribute pieces, the glove wing | six keys, gold | a chest line carried up |
| `bosses-halls` | live | Bosses and keyed halls (Rat King, Coppercap, Hask, Krell) | a hall key, a party | uniques, trophies, gems |
| `boss-calls` | live | Call out (a called boss fight for stamina and gold) and the series | gold, stamina | a boss's drops without the route |
| `scaled-hunts` | live | Scaled hunts (an old ground at your Level, bought by the hour) | gold by the hour | XP x0.8, the ground's own drops, old grounds kept alive |
| `old-dungeons` | dark | Old dungeons, raids and the world boss (six rows, cooldowns, scrip) | keys, cooldowns (old design) | scrip, forge pieces (old design) |

**Brief, ready to paste (after the shared block):**

> DOMAIN: Endgame modes (8 systems: tower, catacombs, hearth-chest, chest-reforge, bosses-halls, boss-calls, scaled-hunts, old-dungeons). File: `docs/design/balance-program/22-endgame.md`.
>
> Also read:
> - `src/data/tower.js`, `src/data/tower-weapons.js`, `src/data/catacomb-armor.js`, `src/data/chests.js`, `src/data/boss-halls.js`, `src/data/boss-calls.js`, `src/data/bosses.js`, `src/data/scaled-hunts.js`
> - board sections "2026-11-14 The Burning Tower", "2026-11-16 The Unmarked Catacombs descent", "2026-11-19 The Tower's curve" in `docs/planning/PRIORITY_BOARD.md`
> - `docs/design/itemization-plan.md` section 6 (chest gear) and Finding 2 (late chest odds)
> - `tools/balance-sim/tower-climb.mjs`, `tower-curve.mjs`, `tower-weapons.mjs`, `catacomb-armor.mjs`, `boss-call-table.mjs`
>
> What real players did in your domain (`10-real-players.md`, REAL; THIN past Level 46). Start from these:
> - The Tower has ONE real climb: a Level 72 to 74 four reached floor 182 (108 past its Level) and was stopped by the server, not by a death. It paid 0.26 of hunting XP, not 0.5. 72 keys earned, 49 chest opens, 19 of 23 kept rows Platinum.
> - Scaled hunts: 0 real uses. The Catacombs: dark. Boss called out: 1 use, 11 days ago. Boss hall by key: 1. Each is a system one person touched once or nobody did: say why a player would come back.
> - The real pace (Level 75 in about 110 hunted hours) is what the endgame has to outlast, not the pace table's.
>
> Beyond the card, answer these in your summary:
> 1. Tyler named this domain first: "How about tower? Catacomb progression???" Treat the Tower and the Catacombs as PROGRESSIONS: what is the floor-by-floor and wing-by-wing chase for each of the seven players, how many weeks is each, and what ends it?
> 2. The Tower pays 50% XP and the Catacombs 37.5%, and the Tower has one production run ever. At each reference point, what does an hour in the Tower give against an hour hunting, in Level XP, keys and chest value (REF hours)? Is it a choice or a chore?
> 3. Tower weapons are RULED "pretty major upgrades" and measure +0.0 to +0.9%. They are in the Replace class. Size them against the tier step and the uniques (sidegrades, RULED 11-18), at every key tier, with `measure.mjs what` and a `gear.also` patch.
> 4. Six opens a family a hero a week: a four-hero account opens 48 a week against a lone hero's 12. Is the weekly gate per hero or per account, and what does the Heavy four finish in how many weeks at the real pace?
> 5. The Tower at floor = Level: a Level 60 four climbs 66 to 70 floors past its Level, a Level 165 four 5, a Level 240 four 0 (audit 3d). After the combat dive's to-hit change, what is the Tower's curve to floor 400, without the heat patch?
> 6. Catacombs: built, dark, "the Tower again, for armor". What makes the descent a different decision from the climb? If nothing, merge the two modes under one engine with two reward lines and say so.
> 7. Bosses and halls, Call out and its series: gold and stamina for a roll at a boss's drops. Price a Call in REF hours at each boss, and give the legal read on a paid roll (Crowns reach gold).
> 8. Scaled hunts stop at Level 50 and are RULED to keep old grounds alive for linings from region 3. What do they pay against REF at 110 and 175, by the hour, and do they become the best lone XP?
> 9. The old dungeons (six rows, cooldowns, scrip) have no caller. Cut, or name what they become.
> 10. Content throughput: floors and wings are formula content, bosses are authored. How many weeks of endgame exist for the Heavy four at month 1 and month 6?

## 23. Items and crafting

**Agent:** game-designer. **Branch:** `lane/d-balance-items`. **Writes:** `docs/design/balance-program/23-items.md`. **Scope command:** `node tools/balance-program/domain.mjs items --docs`.

| System id | Status | System | Uses | Gives |
|---|---|---|---|---|
| `items-catalogue` | live | The item catalogue (every item has a source and a use) | authoring time | 733 items, each with a source and a use |
| `gear-tiers` | live | Dropped gear: tiers 1 to 7, three weights, shields | kills | power (a weapon tier is +5 to +9% XP), shop gold, salvage stock |
| `loot` | live | Loot: five bands, drop homes, the rare roll, loot rules | kills | gear, parts, rares; the hook through Krell |
| `uniques` | dark | Uniques and special-attribute gear (wave 3, the sample, the Morrow grid) | rares, bosses | a property a build is made of |
| `worn-in` | designed | Worn in (three ranks on a unique: deepen or widen) | hours worn (or gold and salts if merged with Tempering) | under half a weapon step |
| `tempering` | live | Tempering (two tracks, five rungs a tier, crafted salts) | gold, crafted salts | +2.3 to +3.5% XP, up to 8% less damage |
| `jewelry` | live | Crafted jewelry: Plain, Fine, Hallmarked; perks; reforging; guarantees | Smithing, gems, fees | up to one weapon step a tier across 6 of 14 slots |
| `linings` | designed | Linings (element guards and leeches, 12 h, stack to 48 h) and the old imbuement rows | one monster part and gold | 20 to 30% less of one element, cap 40% |
| `salvage` | designed | Salvage (a fourth loot destination) | dropped gear | stock, Lucky Rivets |
| `luck` | designed | Luck v3.1 (one account bar, Magic Find on Rare rows, the Lucky ring) | salvage, Bestiary stages | Rare rows up to +104% |
| `lucky-finds` | dark | Lucky finds and the four Hearthfinds | kills, nodes | a 100 to 400 hour trophy set |
| `trophies` | live | Trophies (per-monster ladder, Trophy drops, mounts) | kills, Trophy rows | a mount in the House, a title |
| `patterns` | live | Patterns (a rare teaches one hero a recipe) | a rare drop | a recipe for one hero |
| `crafting-chase` | designed | The crafter's chase: maker's mark, good batch, weekly orders, stirred grounds | rares, town hours | recipes, chips, a reason to craft past 99 |
| `commissions` | designed | Commissions (single and bulk) | materials, gold in escrow | crafter XP and pay |
| `bag-equipment` | live | The bag, pockets, locks, the Key Ring and the equipment doll | drops, purchases | what a hero carries into a hunt |
| `gathering` | live | Gathering: Mining, Woodcutting, Fishing (to 99) and tools | town hours, tools | ore, logs, fish, skill XP |
| `cooking` | live | Cooking and food (food heals HP, drink restores mana) | fish, crops, meat, town hours | food and drink cheaper and better than the store's |
| `smithing` | live | Smithing (bars, tools, weapons, shields, salts, jewelry, castle goods) | ore, coal, town hours | tools, named shields, salts, jewelry, fittings |
| `crafting` | live | Crafting (planks, ammunition, cloth armor, wands and bows, cloaks and belts) | logs, hides, town hours | ammunition, light armor, casters' weapons |
| `runecrafting` | live | Runecrafting (the seven rune families, to 99) | blanks, town hours | runes cheaper than the store's |
| `artisan-engine` | live | The bench engine and the 99 skill curve (queues, counts, live town work) | materials, town hours | skill XP to 99, made goods |

**Brief, ready to paste (after the shared block):**

> DOMAIN: Items and crafting (22 systems: items-catalogue, gear-tiers, loot, uniques, worn-in, tempering, jewelry, linings, salvage, luck, lucky-finds, trophies, patterns, crafting-chase, commissions, bag-equipment, gathering, cooking, smithing, crafting, runecrafting, artisan-engine). File: `docs/design/balance-program/23-items.md`.
>
> Also read:
> - `docs/design/itemization-plan.md` (all of it; section 13 is Tyler's answers and section 15 is Luck v3.1) and `docs/design/itemization-system.md` section 12
> - `src/data/gear-tiers.js`, `items.js`, `jewelry.js`, `temper.js`, `recipes.js`, `shields.js`, `bestiary.js`; the 19 recipe families printed by `domain.mjs items`
> - audit section 3a (the lever table), 3e (rewards), 5 (the reward curve), changes 4, 5 and 6
> - `tools/balance-sim/itemization-table.mjs`, `temper-uniques-table.mjs`, `staged/luck-measure.mjs`, `armor-power.mjs`, `weapon-power.mjs`
>
> What real players did in your domain (`10-real-players.md`, REAL; THIN past Level 46). Start from these:
> - 86% of dropped gear is sold to the Shop and 0.9% is ever worn: 34,756 pieces dropped, 298 worn, about 26 to 29 pieces a hero-hour. 14,792 pieces were sold by hand (loot rules exist on 2 of 5 accounts). Gear is shop gold. This dive owns that finding.
> - Crafted gear does not compete with drops: about 440 pieces made against 34,756 dropped, under 2 hero-hours on every gear recipe together. Over 95% of bench hours are planks, bars, cooked fish and runes. Meals were made once each and never again. Jewelry: one account, 89 pieces, 4 set; 0 Hallmark fees.
> - Home-made supplies are a third of all supplies used and turn a Deadly four from a loss into +9k gold a hero-hour. That is what crafting is for today: size every recipe against it.
> - Town work is 1.57 hero-hours for every hunted hour (mining 737, woodcutting 427, fishing 418, benches 516). Rare-band drops come every 0.5 to 2 hero-hours, one every 7 minutes for a four on the Warrens: 1,568 reveal notices. Trophies: 6 dropped. Prayer: no use in 25 days.
>
> Beyond the card, answer these in your summary:
> 1. The Add pool: accessories, perks, Tempering, worn in, linings, +skill. Measure the whole pool at four points with ONE patch file, and say whether "the pool is worth at most one tier step" can hold or what the cap should be. Damage-side levers are measured together (01 section 2).
> 2. Every recipe family, all 19, and every food: a row each with its inputs, its bench hours, what it replaces at the store, and its value in gold an hour against "own stock is worth 15k to 46k gold an hour a head" (01 section 5). Which recipes does nobody have a reason to make?
> 3. Food and drink: the store bill is the game's real gold dial. Is crafted "cheaper and better" (RULED) by a margin that pays a crafter for the attended minutes, at each tier?
> 4. Each gathering and bench skill and Farming's crops: hours to 99, what 99 unlocks, and what a player does after 99 (the maker's mark, good batch).
> 5. Tempering resets every tier and is the largest sink recorded; Hallmark fees have never been paid; jewelry has 3 of 22 perks built and nothing past Level 30. Give the build order that makes a crafter matter to a Level 60 and a Level 110 hero.
> 6. Luck v3.1 (numbers RULED 11-20) with rarer Rares past Krell: hours a Rare row and a Very Rare row for the Own four and the Heavy four at month 1 and month 6, and the market price that follows. Luck must stay the only drop lever: list every other thing that touches a drop rate.
> 7. Linings (one part and gold, 12 h, stack to 48 h) and the old imbuement rows still in the tree: one system or two? Price a 48 h socket in REF hours.
> 8. Salvage gives up 16 to 38% of income for Luck. When is it right to salvage instead of sell, and does the game say so?
> 9. Item sinks: nothing binds and nothing wears out (RULED). On a 6-month server, where does a tier 3 piece go, and what is the floor under its price?
> 10. Uniques (five hidden, 46 a region designed), worn in, trophies, patterns, lucky finds (24 drops on monsters no open ground spawns), commissions: verdict each. Sample before expanding (CLAUDE.md §10).

## 24. Economy

**Agent:** game-designer. **Branch:** `lane/d-balance-economy`. **Writes:** `docs/design/balance-program/24-economy.md`. **Scope command:** `node tools/balance-program/domain.mjs economy --docs`.

| System id | Status | System | Uses | Gives |
|---|---|---|---|---|
| `purse-ledger` | live | The account purse, the ledger and gold history | every gold movement | one journal a balance guard can read |
| `income` | live | Income: coin a kill, the income dial, what loot sells for | kills, sold loot | gold |
| `store-supplies` | live | Store supplies paid per use, the one-tap refill, own stock first | gold per use | hunt uptime |
| `shop` | live | The Shop (buy, sell, services, buyback) | gold | tools, starter gear, the price floor under every item |
| `market` | live | The Weighhouse market (listings, fee, cut, ceilings, daily caps) | items, a listing fee, a 4% cut | gold between players, a price for everything |
| `player-trade` | ruled | Player-to-player trade | items, gold | the same, to another account |
| `gold-sinks` | live | Small gold sinks: the Town Crier, a Round for the Tavern, flame powders, setup slots, hero colors, rename, titles, the Gold Given board | gold | being seen: a line in chat, a title, a color |
| `hero-slots` | live | Hero slots (300k, 750k, 1.5M) and four heroes at once | gold (about a week each) | your own party of four: account output x4 |
| `tally` | live | Tamsin's tally (kill tasks, three a day) | kills on a named ground | gold, gear pieces |
| `town-works` | live | Town Works (the whole server builds one project by donation) | gold from everyone | a server-wide stage, a plaque, a lead on the board |
| `stamina-refill` | live | Stamina refills for gold (up to 4 h, escalating, six a day) | gold | up to +24 hunt hours a day |
| `premium` | live | Premium (per character: 12 h cap, full analyzer, outfits, a daily training weapon, the daily login) | real money (later), a server switch (beta) | +4 h stamina cap, convenience |
| `crowns` | ruled | Crowns (bought with money, sold to players for gold) and the old gem rows | real money | gold from other players, cosmetics |
| `outfits` | live | Outfits, dyes and the hero's look | gold, keys, standing, Premium | a look other players see |

**Brief, ready to paste (after the shared block):**

> DOMAIN: Economy (14 systems: purse-ledger, income, store-supplies, shop, market, player-trade, gold-sinks, hero-slots, tally, town-works, stamina-refill, premium, crowns, outfits). File: `docs/design/balance-program/24-economy.md`.
>
> Also read:
> - `src/data/gold-sinks.js`, `stamina-refill.js`, `premium.js`, `town-works.js`, `tally-tasks.js`, `bench-tax.js`, `supply-basics.js`, the market rows printed by `domain.mjs economy`
> - audit section 3e and changes 5 and 7; `docs/design/itemization-plan.md` section 10 ("Gear costs more than a hero earns, on purpose")
> - rulings: MONETIZATION INTENT (11-18), PAYING FOR POWER (11-04), NEW GOLD SINKS (11-04), ITEMIZATION PLAN §13 answer 1 (no 75% budget), STRUGGLE OR PAY (11-19)
> - `tools/gen-gold-sinks.mjs`, `tools/economy-watch.local.mjs` (read its header; production reads belong to lane/d-balance-real-players)
>
> What real players did in your domain (`10-real-players.md`, REAL; THIN past Level 46). Start from these:
> - Real gold: 14.27M in (coin 72%, sold loot 26%, tally 2%), 11.36M out. Store supplies 33% of gold out (runes 55% of that), House rooms 25% (2 people), Tempering 22% (1 person), refills 7% (1 person). Take two people's one-time buys away and gold out is supplies and almost nothing else.
> - Two spenders at the same size: one spends 97% and holds 0.2M, one spends 17% and holds 2.09M with nothing it wants. Size every sink against both (`measure.mjs price` prints both).
> - A Deadly four nets +9,078 gold a hero-hour (coin 11,372 + sold loot 4,061 - store 6,355); the harness says it loses. Store supplies jump from 12 to 14% of coin to 56% between Levels 30 to 55 and Deadly at 60 to 79.
> - Never used by a real player: buying on the market (7 listings, the only 3 sales went to a test account), Crowns, titles, dyes, renames, the Town Crier, paid setup slots, Hallmark fees. Blessings are 0.06% of gold out with 18 of 22 deaths Blessed. Refills: 81, one person.
> - Hours a day are 3.1 to 3.5 a hero without refills, 8.4 with: stamina does not bind for the real player, so a stamina grant sells nothing to it.
>
> Beyond the card, answer these in your summary:
> 1. Write THE gold model: gold in and out a week for each of the seven players at Levels 10, 30, 50, 80, 105 and 118, every faucet and every sink a row, from `ref.json` and the price rows. This table is what the home, social, items and endgame dives price against, so commit and push it FIRST.
> 2. Gold in is nearly flat from Level 80 (24.0k, 22.0k, 17.2k, 19.4k an hour, MEASURED) while every price rises, and a store-fed Mage or Deadly four nets under zero. What is the income formula past 110 (audit change 7), and who is meant to be broke?
> 3. Rank every gold-for-power and gold-for-time offer on one line: REF hours of gold for +1% REF XP, or for one hunt hour (Tempering rungs, Hallmarks, the yard, the dummy, refills, Blessings, linings, hero slots). Which is the cheapest, and is that the one we want bought first?
> 4. Stamina refills return about 3x their price and double a day. Price the six refills so they are a decision at every Level.
> 5. One-time sinks against repeating sinks: the House is 35% of all gold out and bought once. What takes gold from a Heavy four at month 6, every week, and what would the Own four (2.09M held, 17% spent) actually want?
> 6. The Buyer: with gold unlimited, list everything it holds on day 30 that the Heavy four does not, in REF hours saved. Is any of it power a free player cannot reach (not allowed), and is the edge big enough that Crowns sell (Tyler wants whales to have "an edge")?
> 7. Premium is per character against one purse, one House and one Luck bar. What does a four-hero account pay, and what is Premium for, when real heroes hunt 3.1 to 3.5 hours a day against an 8 hour bar and the 12 hour bar gives them nothing?
> 8. Crowns are RULED and unbuilt; the old gem rows are still in the database. Give the Crowns surface (what they buy directly, the Crowns-for-gold trade, the clamps) for the Security list. Money calls stay Tyler's: lay out the options, do not pick prices in real money.
> 9. The market has had three sales. At 10 online it has no depth: what sets a price then (Shop floor, store ceiling)? At 10,000: listings a page, the fee and the cut as sinks, wash trades, and price walls.
> 10. The small sinks (crier, round, powders, setups, colors, rename, titles, Gold Given), the tally (1% of income), Town Works (one project): which earn their screen, which merge?

## 25. Social

**Agent:** game-designer. **Branch:** `lane/d-balance-social`. **Writes:** `docs/design/balance-program/25-social.md`. **Scope command:** `node tools/balance-program/domain.mjs social --docs`.

| System id | Status | System | Uses | Gives |
|---|---|---|---|---|
| `parties` | live | Parties of four (finder, invites, holder, leave together, the party XP table, the split) | three other heroes (yours or friends') | XP x1.7 to x2.3 a head on Deadly, the rare roll shared |
| `chat` | live | Chat, whispers, blocks and mutes | attention | the shared world in words |
| `friends` | live | Friends, inspect, players online | - | someone to hunt with |
| `town` | live | Havora, the shared town (presence, walking, stations, criers, shows) | server writes a player-minute | other players seen in one place |
| `clans` | dark | Clans: seats, ranks, invites, votes, the clan browser | members | belonging, a week's shared goal |
| `clan-castle` | dark | The clan castle (five tiers, five buildings, stores, upkeep) | clan standing, gold (40k to 3M), timber and fittings | member cap 10 to 60, buildings |
| `clan-board` | dark | The castle board: work orders, labour and supply | members' materials and hours | buildings finished, standing |
| `clan-feasts` | dark | Clan feasts and the tavern (a called feast, a feast ladder, 31 foods) | cooked food deposited by members | a clan-wide buff (rested) |
| `clan-treasury` | dark | The clan treasury (deposits, contributions, withdrawals, the clan ledger) | members' gold and goods | the castle's upkeep |
| `factions` | dark | Factions: the First Flame and the Last Ember (standing, swap, outfits) | hours on aligned grounds, a swap fee | outfits, later a skill, a side |
| `faction-skills` | designed | Faction skills (Bulwark, Reap) | standing | a bar ability |

**Brief, ready to paste (after the shared block):**

> DOMAIN: Social (11 systems: parties, chat, friends, town, clans, clan-castle, clan-board, clan-feasts, clan-treasury, factions, faction-skills). File: `docs/design/balance-program/25-social.md`.
>
> Also read:
> - `docs/design/PARTY_SPEC.md`, `src/data/factions.js`, `src/social/*`
> - the clan tables and functions printed by `node tools/balance-program/domain.mjs social` (no client or edge caller): read the migrations that define them (`supabase/migrations/*clan*`, `*feast*`, `*castle*`) and `tests/clan-feast.mjs`, `tests/clan-economy-sinks.mjs`
> - every ruling that names clans, guilds, castles, feasts or factions: `node tools/balance-program/domain.mjs social --docs`
> - audit section 1 "Social, world, retention" (it never sized clans: that is why this dive exists)
>
> What real players did in your domain (`10-real-players.md`, REAL; THIN past Level 46). Start from these:
> - Clans, clan castles, clan stores, feasts and the castle board: no row from any account, test or real. This dive is a design review, and says so.
> - Parties with another person: 0 hours. 65 parties were made and every one is one account's own heroes. Friends: one link in total, 0 whispers. The party finder: 0 uses. The social game has not happened once.
> - Factions: QA switch only, 0 real uses. Chat: 374 lines from 4 people, the one social system in use.
> - So the question under every card: at 10 online, what is the first thing that makes one real person hunt with another, and does the own four make that pointless (it already has a tank, a healer and two damage dealers)?
>
> Beyond the card, answer these in your summary:
> 1. Tyler: "Clans? Clan castles?" The first audit gave them nothing. Give clans the full card as a DESIGN to rule on: what is a clan for in a game where hunts are instanced and idle, what does a member decide each day and each week, and what does a clan of 3, of 20 and of 60 look like?
> 2. The clan castle (five tiers, 40k to 3M gold, timber and fittings, five buildings, upkeep): price every tier and building in REF hours for a clan of 10 Own fours and of 60, using the economy dive's gold model. What does a finished castle give a member in the ten ledgers, and is any of it power (then it is an add or multiply lever: class it and cap it)?
> 3. The castle board (work orders, labour, supply), feasts (a called feast, a ladder, 31 foods) and the treasury (a second purse): each is a sink for crafted goods and gold. Size them against what crafters can make. Castle goods are crafted today with no consumer: is the board that consumer?
> 4. A feast gives a clan-wide rested buff. Which ledger, which stacking class, how large, and does it multiply with tier, party and events?
> 5. Exploits: one account with four heroes founding a clan alone; alt clans; the treasury as a way to move gold between accounts around the market fee; kicked members and withdrawn deposits; vote stuffing.
> 6. Server age and population: at 10 online a clan is three friends. At month 6 every clan is full. What does a newcomer join, and what does a clan do when its castle is finished?
> 7. Server cost: a roster re-read per member, a clan chat, a board everyone refreshes. Give `measure.mjs cost` for a member, and name what grows with members x members.
> 8. Factions (the First Flame and the Last Ember; built, played by QA, arm file staged) and faction skills (Bulwark, Reap; unsized): standing an hour, what a side gives, the swap fee, and the skill as a sidegrade to a bar slot (audit change 3).
> 9. Parties: Cellar, Thicket and Wickstead fours earn 0.42 to 0.66x alone (CITED lane/d-party-pace); from Level 30 a Deadly four is 1.8 to 2.6x the contract (01 section 5). Cost sharing (Mode B) is ruled and unbuilt and casters go broke first. What is the party promise for Four friends at Levels 5, 30 and 80, and for one account's own four?
> 10. Chat, friends, the town: what makes a player glad others are here at 10 online and at 1,000? The town refresh every 25 s for everyone is a cost line: what does it buy?

## 26. Home

**Agent:** game-designer. **Branch:** `lane/d-balance-home`. **Writes:** `docs/design/balance-program/26-home.md`. **Scope command:** `node tools/balance-program/domain.mjs home --docs`.

| System id | Status | System | Uses | Gives |
|---|---|---|---|---|
| `house` | live | The House: the property ladder (Camp, Homestead, Farmstead, Manor, Keep, Castle) | gold (the Castle is 2.5M), fittings, beams, keystones | plots, rooms, bench space |
| `room-kitchen` | live | House room: the Kitchen (5 rungs: no-burn, cook speed) | gold, property tier | up to 25% no-burn, +10% cook speed |
| `room-garden` | live | House room: the Garden (5 rungs: farm plots) | gold, property tier | +1 to +5 farm plots |
| `room-workshop` | live | House room: the Workshop (5 rungs: craft speed, material saved) | gold, property tier | +10% craft speed, 8% materials saved |
| `room-cellar` | live | House room: the Cellar (5 rungs: buff duration) | gold, property tier | food buffs last up to twice as long |
| `room-forge` | live | House room: the Forge (5 rungs: smith speed) | gold, property tier | +10% smith speed |
| `room-library` | live | House room: the Library (5 rungs: rune speed) | gold, property tier | +10% rune speed |
| `room-shrine` | live | House room: the Shrine (5 rungs: flame speed) | gold, property tier | +10% Inner Flame speed |
| `room-trophy` | live | House room: the Trophy room (5 rungs: mounts) | gold, property tier | 2 to 6 trophy mounts |
| `room-perks` | live | The room rung engine (40 perk rows, prices, gates) | gold (600k to 900k a top rung) | speed, yield and capacity perks for town work |
| `benches` | live | House benches and the public bench tax | gold (a bench bought once, or tax per make) | untaxed town work at home |
| `storage` | live | Storage: chests, the depot, bank rungs (account-shared) | gold | stacks shared by every hero: the only item path between your heroes |
| `farming` | live | Farming (account-shared land, nine crops, plot tiers, water) | seeds, gold for plot tiers, visits | crops for cooking, Farming XP |
| `curing` | ruled | House curing slots (linings and salts cure while heroes hunt) | gold (escalating slots) | bench hours given back |
| `training` | live | Combat training: the yard by the hour, the House dummy, training items | gold (the yard), town hours, the dummy (150k to 600k once) | skill XP at a flat 30k / 60k an hour |

**Brief, ready to paste (after the shared block):**

> DOMAIN: Home (15 systems: house, room-kitchen, room-garden, room-workshop, room-cellar, room-forge, room-library, room-shrine, room-trophy, room-perks, benches, storage, farming, curing, training). File: `docs/design/balance-program/26-home.md`.
>
> Also read:
> - `src/data/homestead-tiers.js`, `src/data/training.js`, `src/data/bench-tax.js`, `src/core/farm.js`, `src/core/perks.js`, `src/session/home-sections.js`
> - the replayed rows: `hr_unlocks` and `hr_unlock_offers` for `property:*`, `room:*` (40 offers), `bank` (30 offers), `farm_plot_tier`; printed by `node tools/balance-program/domain.mjs home`
> - rulings: HOUSE CURING SLOTS (11-18), COMBAT TRAINING (11-08), SHARED FARM (10-23), the DEFENSE TRAINING line of ITEMIZATION (11-18), the depot and Storage lines (10-22)
> - audit: the House got one line and Farming none. Tyler: "How about housing? Housing upgrades?"
>
> What real players did in your domain (`10-real-players.md`, REAL; THIN past Level 46). Start from these:
> - The House is the second largest real sink: rooms 2.84M (25% of gold out), all eight rooms at rung 4 on two accounts; properties to Keep and Manor on two. So the rungs are bought, by the two people who got far enough. What did they get for it?
> - Farming is the one town system all four people use: 599 plants, 1,361 waters, 706 harvests, plots at level 4 to 5 on three accounts. 143 replant-seed buys. Count the presses a day (first principle).
> - Training: the House dummy bought once (150k), 5 sessions, 13.6 hero-hours at 30,000 skill XP an hour, one person. Training items: 0. The yard by the hour: check for any use at all.
> - Storage: 1,713 deposits, 812 withdraws, 7 chests, 6 rungs. It is how one person moves stock between its own four heroes: the busiest path in the House.
> - Heroes are idle 59% of their lives and at a node or bench 25%. Curing slots and room speed rungs sell time to a player who has 59% of it unused: what do they really sell?
>
> Beyond the card, answer these in your summary:
> 1. The property ladder (Camp, Homestead, Farmstead, Manor, Keep, Castle at 2.5M): price every step in REF hours and in days for each of the seven players (`measure.mjs price`). The Castle is 119 lone REF hours at Level 105. What does each step change in what the player DOES?
> 2. EVERY room and EVERY rung: eight rooms by five rungs, 40 rows. One table: price, gate, what it gives, the ledger it moves, and its payback in REF hours (a +10% bench speed rung against the gold an hour that bench makes). Which rungs never pay back, and which is the only sensible first buy?
> 3. Room perks against everything else that speeds or saves at a bench (good batch, tools, curing slots, the House bench against the public bench tax): add or multiply? State the rule and the cap. Today nobody has said.
> 4. The Cellar doubles food buff duration, and the four foods' drop buffs are cut (Luck v3.1). What does it still extend? The Shrine speeds Inner Flame, a skill with 16 recorded hours. The Trophy room mounts trophies and there are two Trophy drops in the game. Fix, merge or cut each.
> 5. Storage: 30 bank rungs at x1.32 a rung and four chests gated by property tier. Total price to the top, and is running out of space a decision or a tax? It is the only item path between your own heroes.
> 6. Farming: account-shared land, nine crops, plot tiers, water. Attended minutes a day against crop value (what Cooking makes of it). It sat at zero for ten days once. What makes a player open the farm tomorrow, and what does the player repeat by hand (first principle)?
> 7. Curing slots (RULED: a gold sink, no XP, skill still required): escalating slot prices and a fee a cure, sized so the Buyer gets time back and the Own four still chooses.
> 8. Training: the yard pays a flat 30k / 60k skill XP an hour against a cost that multiplies by 1.04 a level; the dummy is 150k to 600k once. +10 Defense was -64% damage at Level 10 and 0 at 105. What should an hour of yard gold buy at 30, 60 and 110, and when does the dummy pay for itself?
> 9. Crowns training items are ruled and sit against "never sell power for Crowns". Lay out the conflict for the Coordinator; do not settle it.
> 10. The House is one per account and nobody else sees it. What makes it a home a player shows off, and what does a veteran still buy for it at month 6?

## 27. Retention, live ops and teaching

**Agent:** game-designer. **Branch:** `lane/d-balance-retention`. **Writes:** `docs/design/balance-program/27-retention.md`. **Scope command:** `node tools/balance-program/domain.mjs retention --docs`.

| System id | Status | System | Uses | Gives |
|---|---|---|---|---|
| `first-hours` | live | The first hours: hero creation, the tutorial, the coach, tips | a new player's first session | a hero who knows what to do next |
| `what-next` | live | What next: goals, next buy, the upgrade plan | - | the answer to "what do I do now?" |
| `wiki` | live | The in-game wiki of formulas and the monster cards | - | every formula in plain words |
| `lore` | live | Lore and the Chronicle | writing | a reason the places connect |
| `away-return` | live | Away and return: the away card, the after-the-hunt plan, bench resume | a closed browser | progress waiting, and one press to carry on |
| `analyzer` | live | The hunt analyzer and personal bests | - | XP and gold an hour, own against store supplies |
| `bestiary` | live | The Bestiary (per character, kill stages, the dead charm ladder) | kills | stages; Luck once Luck ships |
| `leaderboards` | live | The Roll of Honor (16 boards) and the Gold Given board | a refresh job | a reason to compare |
| `live-events` | live | Live events: the Bonus XP weekend, Open Halls, the Hearthrise | a calendar row | +25% Level XP three days in fourteen, a free Call out |
| `rare-moments` | live | Rare-drop moments: the reveal, the broadcast, the shareable card, world notices | a Very Rare or Trophy drop | a moment the server sees |
| `game-modes` | idea | Game modes (Ironman, Hardcore, Group) | server trade and death flags | replay |
| `settings` | live | Settings, widgets and window preferences | - | a screen that stays how the player left it |
| `old-server-leftovers` | dark | Old-client server leftovers with no caller: bounties, workers, the collection log, renown, traits | nothing a player can reach | nothing today; renown still feeds the allXP bonus channel in src/core/progression.js |
| `discord-gift` | live | The Discord gift code | a code from Discord | a one-time grant |

**Brief, ready to paste (after the shared block):**

> DOMAIN: Retention, live ops and teaching (14 systems: first-hours, what-next, wiki, lore, away-return, analyzer, bestiary, leaderboards, live-events, rare-moments, game-modes, settings, old-server-leftovers, discord-gift). File: `docs/design/balance-program/27-retention.md`.
>
> Also read:
> - `src/data/hunt-tutorial.js`, `src/data/live-events.js`, `src/data/bestiary.js`, `src/data/bestiary-charms.js`, the leaderboard rows printed by `domain.mjs retention`
> - board: the newest blind playthrough and Level 1-20 pass sections in `docs/planning/PRIORITY_BOARD.md`; memory notes core-loop-means-first-20-hours and audit-standing-rules
> - audit section 1 "Social, world, retention, live ops, money" and section 2 (gaps)
> - play it: `node tools/qa/local-world.mjs serve`, a brand-new account from the sign-in screen, learning only from the screen
>
> What real players did in your domain (`10-real-players.md`, REAL; THIN past Level 46). Start from these:
> - The two real players who are not heavy stopped at Level 7 to 9 in opposite ways: one only hunted (never sold an item, never gathered, spent 60 gold in 12 hours), one went to gather for 101 hours and never came back to the hunt. Neither reached Level 10, where the heavy players start their own four. That is the whole first-week sample: walk it.
> - A visit is 2 to 5 minutes; one player comes twice a day and is away eleven hours. The away-and-return moment is the game for these players and has to fit in that.
> - The jump at Level 10 is the own four: hero slots at 300k / 750k / 1.5M decide who gets there. Is running four heroes taught, and is it what the game wants to be?
> - A second account of the same person was twice as fast (Level 50 in 43 to 60 h against 83 to 117 h): knowledge, not gear, is the largest lever in the game. What should the game teach sooner?
> - The Hearth's fuel has not been burned in 15 days; Prayer in 25. House properties 10 days, hero slots 13. By CLAUDE.md §3.4 a feature at zero for two days is a P1: list every live system at zero.
>
> Beyond the card, answer these in your summary:
> 1. Play the first 30 minutes blind on the local world and write the walk: at each step, what the player holds, what the screen says, and what makes them do the next thing. Mark every dead moment.
> 2. The chase by horizon for each of the seven players: what do they want this session, this day, this week, this month, at Levels 5, 17 (the known nothing-to-chase point), 30, 60, 110 and 150? One table. An empty cell is a finding.
> 3. Away and return: the hunt ran for 8 hours. What does the return screen show, what is the one press that carries on, and what did the player have to redo by hand (first principle)?
> 4. The Bestiary is per character and feeds Luck per account once Luck ships; the charm ladder is cut but its data and module remain. Stages against kills an hour at REF: how many hours is a ground's Bestiary, and what does finishing it give?
> 5. The Roll of Honor has 16 boards. At 10 online every board is the same five names; at month 6 a newcomer can never enter. Which boards reset, which are per week, which merge?
> 6. Live events: +25% Level XP three days in fourteen multiplies with tier, party and hours. Class it (multiply), cap it with the combat dive, and say what an event is for on a server of 10 and of 10,000.
> 7. Rare moments: keep the big reveal for Trophy and Very Rare (audit change 6). How often does each of the seven players see one, at month 1?
> 8. Teaching: for every LIVE system in the registry (all domains), the Level and screen where a blind player first meets it. One table for the whole game; the other dives fill requirement 10 from it.
> 9. Telemetry: the launch dashboard. One number a system from every dive's requirement 13, and the ten that go on the daily vitals.
> 10. The old server leftovers (bounties, workers, the collection log, renown, traits): found by the orphan sweep and in no document. Renown is named in the allXP bonus channel in `src/core/progression.js`: is anything feeding it? Cut list for Tyler.
> 11. Game modes (Ironman, Hardcore, Group) are after launch. Say only what the model must not do now that would close them off.

## 28. Platform, cost and scale

**Agent:** backend-architect, with the reliability-engineer. **Branch:** `lane/d-balance-platform`. **Writes:** `docs/design/balance-program/28-platform.md`. **Scope command:** `node tools/balance-program/domain.mjs platform --docs`.

| System id | Status | System | Uses | Gives |
|---|---|---|---|---|
| `settle-engine` | live | The settle engine and the world tick (hr-accrue, shards, leases, the 10 s cadence) | edge CPU, statements, rows a player-hour | every hunt outcome |
| `envelope` | live | The envelope and state projection (hr_state_of, 51 sections, intents, idempotency) | statements a page load and a press | the one truth the client renders |
| `accounts` | live | Accounts, heroes, names, sessions and the play cap | one login | up to four heroes at once |
| `access` | live | Access: closed mode, the allowlist, beta invites, the wipe | - | who may play |
| `operations` | live | Operations: cron health, alerts, capacity samples, pruning, restore | cron statements a minute whoever plays | a server that tells us it is sick |
| `moderation` | live | Game Master tools, bans, mutes, bug reports | - | a world that can be policed |
| `account-deletion` | staged | Account deletion | - | a store requirement met |
| `content-tooling` | live | Content tooling: the ground pack, the coverage bot, the balance simulator, region kits | designer and artist hours | a new ground in hours, not days |

**Brief, ready to paste (after the shared block):**

> DOMAIN: Platform, cost and scale (8 systems: settle-engine, envelope, accounts, access, operations, moderation, account-deletion, content-tooling). File: `docs/design/balance-program/28-platform.md`.
>
> Also read:
> - `tools/qa/audit-2026-11-19-server/findings.md` and `scale-probe.result.json`
> - `tests/per-player-cost.mjs` and its baseline, `tests/settle-budget.mjs`, `tests/perf-budget.mjs`, `tools/settle-cost.mjs`, `tools/commit-cost.mjs`
> - `docs/planning/WORLD_TICK_DESIGN.md`; memory notes server-cost-work-approved, systems-roadmap, scalable-grounds
> - the server-cost answer (requirement 6) of every other dive as it lands
>
> What real players did in your domain (`10-real-players.md`, REAL; THIN past Level 46). Start from these:
> - The real load shape is four heroes an account, hunting 3.3 to 8.4 hours each a day, checked in visits of 2 to 5 minutes: almost all hunting is away (36 commits an hour, not 198). Re-derive the ceiling for that shape.
> - The journal held 492,583 rows for 16 heroes over 32 days; only 339 hunt sessions are kept. A party kill is journalled on every seat. Size the ledger at 1,000 accounts of four.
> - Gathering and benches are 1.57 hero-hours for every hunted hour and 74,974 journal rows: town work is a server cost nobody has measured. `tests/per-player-cost.mjs` has two hunting fixtures and no town one.
> - No social, market or cross-player load exists to measure. Those numbers need synthetic load (phase 4).
>
> Beyond the card, answer these in your summary:
> 1. Tyler: "It needs to meet all of my requirements including being optimized and scalable." Give the cost model: database CPU, statements, WAL, ledger rows and edge CPU a hero-hour, watched and away, and the monthly bill at 10, 1,000 and 10,000 online on named plans. Today's ceiling is about 110 to 130 accounts (CITED).
> 2. The path from 130 to 1,000 to 10,000: which of the ten audit changes buy what multiple, in order, and what is the shard story (the tick fans out 128 instances a fire; 1,400 due hunts overran the window)?
> 3. A cost budget every system is held to. 01 section 7 proposes: no new statement on the settle path, at most 1 ledger row and 1 row write a hero-hour, no poll, nothing players x players. Confirm or correct it with measurements, and correct `measure.mjs cost` to match.
> 4. Every system that costs something for everyone whether or not they use it (the 60 s off-screen poll, the 25 s town refresh, 27 cron jobs, the leaderboard refreshes, 51 envelope sections): a table, cost each, and what each buys.
> 5. The dark systems when they turn on: clans, the market at depth, chat and the town at 1,000 in one place, Town Works with every account donating. What breaks first?
> 6. Server age: tables that only grow (the ledger, game_events, market history, chat, run boards). Growth a month at 1,000 online, and the prune or archive for each.
> 7. Exploit surface for the pre-EA Security review: collect every OPEN item from the other dives' requirement 9 into one list by RPC.
> 8. Content tooling as throughput: a ground was measured at about 9 hours. What does a region of six grounds, a Tower band, a boss and a recipe family cost in hours, and where is the tooling missing?
> 9. Accounts and the play cap (four heroes at once, four per hashed IP), access, moderation and GM tools, account deletion (staged): the card each, briefly; these are requirements more than balance.

