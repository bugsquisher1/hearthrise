# Hearthrise: the game we are building

The front of the book. Written 2026-11-21 on `lane/d-book-integrate`. The book is chapters 01 to 09 in this folder, and every decision in it is one row of `decisions/all.json`. No game code, data or migration was changed to write it.

## 1. The game we are building

You run four heroes from your first day. They hunt while you are away, and you win by preparing them: who stands where, what they wear, what their bars do and where you send them. Every choice is made once and remembered. Harder tiers ask for a real party with a tank and a healer. Gear is a chase with rare finds worth keeping. Levels never end, and gear, sinks and old grounds keep pace by formula. Around the hunt stands a shared world that works while everyone sleeps: clans, world bosses, events and two arenas, paying buffs and gear. Crowns buy Premium, looks and comfort, and trade to other players for gold. That gold is the edge, under one ceiling written in numbers that a player who never pays can also reach. Every number comes from formulas you can read.

## 2. How to read the book

Everything in the book describes the target game. Nothing in it describes the game that runs now, and nothing is judged against it. Where a chapter quotes a measurement, it is evidence about the proposed design or about the measuring tool.

Every design statement carries one status word.

| Status | What it means |
|---|---|
| RULED (date or id) | Tyler decided it. It is the game |
| RULED (call id, Tyler 2026-11-21) | Tyler picked it when he answered his list on 2026-11-21. "Not the recommendation" marks a pick that went against the designer. "Reversal of X, approved" marks a change to an older ruling that he let stand |
| DECIDED (call id, Fable 2026-11-21) | The game designer decided the call and an adversarial check corrected it. It is the design. The call id is a row of `decisions/all.json` |
| OPEN (waiting on Tyler, T-fix-N) | Two of Tyler's picks point opposite ways. Nobody decides it for him. The chapter shows the design the book was written on until he answers. Section 5.5 lists all five |
| CUT (Tyler approved 2026-11-21) | A removal he approved |
| KEPT (Tyler 2026-11-21) | Something he refused to cut. How it stays is DECIDED by the designer |
| OPEN | Nobody has decided it. The line says who does. Section 8 lists every one |
| WITHDRAWN | Refused by the adversarial check. Only GR-65 |

A few statements read "DECIDED (no call id, Fable 2026-11-21)". They are designs a chapter recommended without raising a call, 22 in all. They are the designer's and can be challenged like any other.

Number words. TARGET is a number the design aims at. COMPUTED is arithmetic on ruled tables or formulas. MEASURED is a run on the real engine and says how thin it was. HYPOTHESIS is a belief that only play settles. The fixes the adversarial check designed itself are all marked HYPOTHESIS.

Ids. GR-x, MM-x, CE-x, CORE-x and PREM-x are calls in `decisions/all.json`. GR-2 and GR-67 are ruled and have no row there. GR-10a, GR-10b, GR-10c, GR-60, GR-68 and GR-83 were replaced by MM calls. Ids such as 25-4 or 50-11 are Tyler's rulings of 2026-11-20 and 2026-11-21.

How the decisions were made. Three deciders took 157 rows. An adversarial check returned ACCEPT WITH FIXES with 31 fixes, re-ran the measurements it could, and withdrew one decision. All 31 are applied. 155 calls remain, because two were decided twice and merged. Tyler then answered his whole list. Today 43 calls are ruled by Tyler, 107 are decided by the designer, 4 are held for Tyler inside five T-fix items, and 1 is withdrawn.

## 3. Every ruling

One line each, newest first inside each group. A line is a ruling of Tyler's unless it says otherwise. The list holds the rulings as they stood before he answered his list on 2026-11-21. Section 5 holds those answers, and an answer wins over an older line here. The older lines that his answers replaced are named in section 5.3.

### 3.1 The frame (2026-11-21)

- 2026-11-21. The game designer decides every open design call. Tyler gets money calls, grants, plan approvals he asked for and any decision that reverses one of his rulings.
- 2026-11-21. Tyler answered his whole list: the money calls, the grant, the reversals and the cuts. Section 5 has every answer.
- 2026-11-21. Leave the lineup test out, accept that the best four may be a hammer and three mages, and pay party XP by size alone. (GR-3, the alternative)
- 2026-11-21. Everything is combined into one book and the work goes on from it.
- 2026-11-21. The current game is irrelevant. Nothing is compared with it. Its data is evidence only.
- 2026-11-21. Decisions first. No build lanes until every decision is made and a build plan exists. Studies, calibration and audits may run.
- 2026-11-21. Balance is fixed at the formula layer. No ground, weapon or monster gets its own patch or its own math.
- 2026-11-21. Nothing planned for later is cut. It is built later and stays hidden until it works.
- 2026-11-21. The itemization plan is a source of record.
- 2026-11-21. Every time number assumes a player hunts 12 hours a day, measured in low, mid and best gear, to Level 400.
- 2026-11-21. A persistent systems registry, checked against the code, is to be planned before more audits.
- 2026-11-21. One big release for the beta scope.
- 2026-11-21. A player may cost at most $0.15 an account a month at 1,000 accounts, and no more at 10,000.

### 3.2 Heroes, parties and the shared world

- 2026-11-21. All four heroes from the start. No slot prices. (GR-2)
- 2026-11-21. One Premium for each account.
- 2026-11-21. No solo or group balance targets. Party buffs make hunting together the obvious choice. (GR-67)
- 2026-11-21. The four together, on the tier they can hold, earn more for each hero than the same four split up. A lone hero is a slower choice, never a trap.
- 2026-11-21. The MMO layer is clans, world bosses, events and PvP arenas.
- 2026-11-21. The MMO layer rewards buffs and gear.
- 2026-11-21. Two PvP arenas: one with normalized stats and one that uses your gear.
- 2026-11-21. One Global chat, with lines sent in small batches and a slow mode when crowded. (31-1)
- 2026-11-21. Clan castle goods keep their prices. Only the two goods that cannot be made are fixed. (31-3)
- 2026-11-21. Faction skills are sized to matter, and so is the benefit for hunting the other side's grounds.
- 2026-11-20. On-call heroes are allowed as an amendment, with an on-call board. (25-1, 25-3)
- 2026-11-20. Clans give no Level XP. Clan cooks make bound rations in place of an XP feast. (25-2)
- 2026-11-20. A clan browser with search, one clan chat tab, and a castle that opens at ten accounts. (25-3)
- 2026-11-20. The castle keeps its built prices, with one work order a week for each slot. (25-4)
- 2026-11-20. Clan gifts are one-way, and rations cannot be sold or traded. (25-5)
- 2026-11-20. Founding a clan costs 100,000 gold. (25-6)
- 2026-11-20. One clan for each account. All four heroes carry its tag. (25-7)
- 2026-11-20. A party of different accounts is offered a shared supply bill, agreed once and remembered. (25-8)
- 2026-11-20. A faction is chosen for the whole account. (25-10)
- 2026-11-20. A party is four at most. A clan hunt may put eight heroes in one hall. (25-11)
- 2026-11-20. Events never pay over +25% and never two at once. A world Level XP weekend once in four, and a party ground's XP weekend in between. (27-5)
- 2026-11-20. No hunt ever starts by itself. Own heroes end together only if the player says so. (27-1)
- 2026-11-17. Krell's Hall is a fight for a four: a tank, a healer and two more.
- 2026-11-16. Party XP is one flat formula for every ground. Monster health does not go up in parties.
- 2026-11-16. Early and Normal hunts are expected to be poor for big groups and over-leveled heroes. No fix and no label.
- 2026-11-14. Two factions, the First Flame and the Last Ember. Neither is evil. They are mostly cosmetic, both can be unlocked by swapping, and Havora is neutral.
- 2026-11-14. Both sides see each other and no ground is restricted. Each side gains a benefit on the grounds aligned against it.
- 2026-11-14. One faction skill each: Bulwark for the First Flame and Reap for the Last Ember. Villains are shared and are never players.
- 2026-11-14. Idle capture the flag is on the backlog, with no death and low XP.
- 2026-11-13. Every hunt works the same for one hero, two or four. No hunt is molded for profit by party size.
- 2026-11-11. One pack on Normal for every party size. Bigger pulls come from a harder tier.
- 2026-11-11. Tutorial tips can be dismissed, and town criers call out tips in town.
- 2026-11-08. One difficulty for all group sizes, and the same monsters for everyone.
- 2026-11-08. Party XP is set by party size and weapon ways, and a party of mixed Levels takes a cut on XP.
- 2026-10-31. Party XP is better than lone XP only when the party holds different weapon ways.
- 2026-10-22. Party Level XP is split evenly. A party leaves together by default.
- 2026-10-19. Own heroes join the player's party at once, with no invite.
- 2026-10-18. Right-click on any player gives Trade, Inspect, Message, Friend, Invite and Block. Player trade is its own server lane and a money surface.
- 2026-10-17. One account for each player. Up to four heroes play at once.
- 2026-10-15. Hunting is instanced, alone or as a party. Towns, chat, trade and party hunting are shared. A party is four at most and any mix of roles is allowed.
- 2026-10-15. Chat has tabs, with time, name, Level and role on each line.
- 2026-08-18. Game modes such as Ironman and Hardcore come after launch.

### 3.3 Combat, tiers and death

- 2026-11-21. A death costs 6% of all Level XP, flat, with no cap. A 12 hour cap on a blessed death was turned down. (50-4)
- 2026-11-21. The harder tiers kill at a flat count at every Level. A mid-geared party on Deadly dies 50 to 100 times in 1,000 hours.
- 2026-11-21. Spells are sized first, then Deadly.
- 2026-11-21. Every spell is sized at Level 10 and at Level 60, so heals and first strikes land whole in the first hours.
- 2026-11-21. Storm and Bone runes unlock at Runecrafting 25 and 40.
- 2026-11-21. Cleave merges into Turning Cut.
- 2026-11-21. Rend stays at 6 seconds and the axes do not hold Power Strike. (32-3)
- 2026-11-21. Mend heals about 11% of max health. (32-4)
- 2026-11-21. The hammer has its own strike that spends an Earth rune. (32-5)
- 2026-11-21. The crossbow has its own spell list. Sixteen Necrotic and Storm spells in all. (32-6)
- 2026-11-21. Only people are weak to Necrotic.
- 2026-11-20. The harder tiers hit harder, sized on a party with a healer and monsters that shoot the back row. (21-3)
- 2026-11-19. Monsters get a little more health and damage everywhere.
- 2026-11-19. A party fighting under its weight should struggle or pay for it.
- 2026-11-19. Tanks get rune spells that are tank spells.
- 2026-11-19. The sword and shield levels slowly alone on purpose. It is the tank and the only way that holds Challenge.
- 2026-11-18. Two new elements, Necrotic and Storm, and every weapon way has a spell for both.
- 2026-11-18. Rune families Storm and Bone are added.
- 2026-11-18. A blow never reads the hero's own Level.
- 2026-11-16. Turning Cut goes to every melee way without a shield.
- 2026-11-14. The game never tells a player to turn Challenge on or off.
- 2026-11-10. Blessings cut the death cost by 25, 50 and 75%.
- 2026-11-09. A death costs a flat share of XP, can take a Level, and never drops a hero under Level 1. It also takes 6% of each combat skill's progress.
- 2026-11-09. A ground's Level is a guide and nothing more. The hunts guide suggests by Level only.
- 2026-11-09. The healer gets one damage spell that works only outside a party.
- 2026-11-08. Monsters get area spells, group damage and elemental resists, as the wall of the harder tiers. The tank soaks the boss's heavy hit and casters dodge it.
- 2026-11-08. Every formula is public, in an in-game wiki.
- 2026-11-07. Tiers are percent dials on XP and difficulty, never gold.
- 2026-11-06. No immunities, only percentages.
- 2026-11-06. A party outside its weight class is going to die, even as a party.
- 2026-11-05. One difficulty choice a ground: Normal, Dangerous or Deadly. It is remembered for each ground. A boss fight has phases.
- 2026-11-05. A skill tree is on hold until Tyler raises it.
- 2026-11-04. Nothing refuses a Level. A big risk shows a warning and the player may take it.
- 2026-10-25. No death loss on gathering, crafting or farming skills. Inner Flame, then called Prayer, keeps its death loss, and an exemption is not to be asked for again.
- 2026-10-23. No stagger.
- 2026-10-23. Runes fuel spells only. A caster's basic attack costs mana.
- 2026-10-23. Rune families: Air, Earth, Water, Fire, Ice, Poison and Rupture.
- 2026-10-19. A death opens one popup: where, what killed the hero, the last seconds, the XP lost and the Blessings spent.
- 2026-10-18. Combat runs on the server on one engine. Hunts keep running after the browser closes.
- 2026-10-18. Blessings protect XP and skill progress. They are free under Level 30 and their price grows with Level.
- 2026-10-18. Defense trains from blows taken in armor. A shield block counts extra. Damage over time does not train it.
- 2026-10-16. Hunts are idle. The player never fires a skill by hand. The bar is configuration only.
- 2026-10-16. Roles come from the weapon in hand, never the outfit. No vocations. Tank is a job of a melee hero with a shield.
- 2026-10-16. Armor weights: heavy absorbs, medium dodges, light wards. Mixed pieces blend with no penalty.
- 2026-10-16. Sword and shield anchors, dual axes bleed, the two-handed club crushes.
- 2026-10-15. A basic attack takes 2.0 seconds for every hero and monster.
- 2026-10-15. Elemental weakness and resistance are in monster data from day one.
- 2026-10-14. Melee, Ranged, Magic and Defense have no cap, and neither does Level. Gathering and crafting skills stop at 99. Every hero can train every skill.
- 2026-10-14. Health and mana grow with Level. Heavy armor adds health and light armor adds mana.

### 3.4 Levels, pace and the long game

- 2026-11-21. The Level table is the clock of a mid-geared four on the hardest tier it holds. (50-1)
- 2026-11-21. Level 400 takes 4,580 hunted hours, which is day 382.
- 2026-11-21. Best gear is about 15% faster and takes about 15% less damage than mid gear. (50-3)
- 2026-11-21. Krell is weeks away, not months: day 18 for a four.
- 2026-11-21. 120 days of grounds at Early Access, and each region opens 30 days before the first fours arrive. (50-7)
- 2026-11-21. Two visits a day is the free game. (50-12)
- 2026-11-21. Heroes work in town for all 12 rested hours. (50-13)
- 2026-11-21. The every-idle-hour training reading is a number we watch, never a gate.
- 2026-11-21. The too strong and too weak thresholds stand, and any cut goes to Tyler on one list first.
- 2026-11-20. Levels 1 to 50 are timed on a lone new hero: Level 10 in 6 hours, and no Level under 10 takes over 2 hours. (27-2)
- 2026-11-20. Regions 4 to 7 are sketched now. (A-10)
- 2026-11-20. Every content lane ends with its working hours on record. (28-12)
- 2026-11-18. A region is about 55 Levels, six grounds and two bosses, with the last boss in a keyed hall.
- 2026-11-18. The Millrace Sewer opens at Level 5.
- 2026-11-16. The pace seat earns 1.8 to 2.5 times the pace contract. (21-4)
- 2026-11-14. The yard trains at a flat rate and costs no stamina. Training items are sold for gold. (The flat rate was kept in 21-7 and A-5 on 2026-11-20.)
- 2026-11-11. The Bestiary's bonus is undecided, and it gets a deep dive once the game is balanced.
- 2026-11-09. The Barrow March ends at Lord Krell's hold. Lore is told as a story.
- 2026-10-25. The Level table of hours, with Level 100 at 600 hunted hours. A major upgrade comes every 15 to 25 Levels.
- 2026-10-25. The Hearthrise lights when the server's fire fills.
- 2026-10-20. Bestiary stages at 2,500, 5,000, 10,000 and 20,000 kills. The Bestiary is kept for each hero.
- 2026-10-18. A ground's Level floor is a warning. Hunting over-leveled is profit with low XP, and that is good.
- 2026-10-14. Level 200 is a big deal.

### 3.5 Grounds, bosses, the Tower and the Catacombs

- 2026-11-21. The weekly limits on chest opens stay.
- 2026-11-20. The Tower's heat patch and a Tower XP boost for new heroes are ruled out. (22-1, 22-7)
- 2026-11-20. A boss's prize is one roll a hero a day. (22-8)
- 2026-11-16. The Unmarked Catacombs get their own mode. The player picks a wing before the run and it descends by itself.
- 2026-11-16. Every key belongs to a family, Catacomb or Tower, and the weekly cap of 6 a hero is for each family.
- 2026-11-16. The Tower and the Catacombs return to checkpoints every ten floors.
- 2026-11-16. A Key Ring sorts every key into its own storage and costs gold to unlock.
- 2026-11-14. The Burning Tower is its own challenge mode. It pays about half of hunting's XP, uses stamina and supplies, and gives 6 keys a week for each hero.
- 2026-11-14. Tower chest weapons carry plus skill: +1 Bronze, +2 Silver, +3 Gold, +4 Platinum. Rarer keys drop less often, and stoking the fire raises the odds.
- 2026-11-14. A paid boss call has a chance to drop an item, and the called boss can be fought N times in a row.
- 2026-11-14. Krell is a daily kill and holds a couple of unique tier 7 pieces, with no weapon.
- 2026-11-14. A catacombs hunt deep under Havora, as a later ground.
- 2026-11-09. The hold on Hask's Ford is lifted.
- 2026-11-07. An old ground can be hunted at the leader's own Level, bought by the hour, up to 24 hours, spent only while hunting there.
- 2026-10-20. A hunt may mix monster families. Spawn mixes are uneven: a common majority, some uncommon and one or two rare.
- 2026-10-15. A hunt's route is drawn through real space, and walk time is part of the cycle.
- 2026-10-15. Monsters never chase outside their pack's area.

### 3.6 Items, gear and crafting

- 2026-11-21. A full set of the best gear takes about one band to Krell, then one to two regions.
- 2026-11-21. Crafting is a quarter to a half of the step from mid gear to best gear, and a player who never crafts can buy it.
- 2026-11-21. A unique can be reforged up a band and keeps its property. Each new band also gets uniques of its own. (31-4)
- 2026-11-21. The Luck bar keeps its hours: +16% at 500 hours, +39% at 5,000.
- 2026-11-20. Tempering carries up a tier and costs only the difference. (23-2)
- 2026-11-20. Jewelry perks are sized at 4%. (23-5)
- 2026-11-20. Generous drops through Krell, really rare and strong after.
- 2026-11-20. Luck has two feeds and no more: rivets used and Bestiary stages. Luck items are bound to the account.
- 2026-11-18. No to a 75% budget. Not everyone should be able to finish a set easily.
- 2026-11-18. Tempering stays as built, and the Hallmark fees stay at 150,000, 250,000, 400,000 and 600,000 gold.
- 2026-11-18. A lining takes one monster part and gold. Linings and salts cure in House slots, bought with gold.
- 2026-11-18. Smithing makes all jewelry. Crafting makes cloaks and belts. The jewelry perk pool grows to about ten.
- 2026-11-18. Shields drop at every tier. Smithing only reforges named shields.
- 2026-11-16. Tier 7 Dawnsteel has its own Tempering ladder, and unique armor and weapons past it scale with the Level they are worn from.
- 2026-11-16. Every ground past tier 7 follows the ruling on varied, special pieces.
- 2026-11-14. There is no Level cap, so there is always better gear. Past tier 7 the chase is boss pieces mixed across bosses and rare drops from grounds.
- 2026-11-14. Special pieces with one extra attribute are spread through the game to be farmed.
- 2026-11-14. High-end jewelry is mainly crafted, with rolls, and some items can guarantee a roll.
- 2026-11-14. Tier 7 materials are named Dawnhide and Duskweave.
- 2026-11-11. Gear renames: Hood, Bracers, Necklace and Leg Plates.
- 2026-11-09. One base drop chance a kill for everyone.
- 2026-11-08. A monster drop that is only good for selling is Junk.
- 2026-11-05. Tempering needs a crafted material as well as gold.
- 2026-10-25. Every skill takes its inputs from the hero's bag and then from Storage.
- 2026-10-24. Gear is gated by hero Level only.
- 2026-10-23. No bound gear. Every piece trades.
- 2026-10-23. No gear is given for reaching a Level. A kill-task hunter in town is approved.
- 2026-10-23. Loot is varied, with upgrades for every way to fight at each region's door.
- 2026-10-20. Lower-level gear drops much more often.
- 2026-10-20. Every new hero starts with all six starter weapon sets.
- 2026-10-14. Gear has fixed stats and gets better only through upgrades.
- 2026-10-14. A Rare drops about once in 10 to 20 hunted hours. A Very Rare about once in 100 to 150.
- 2026-10-14. Party loot is split evenly by gold value. A party's Rare goes by a server roll, and a winner waits until everyone has had one.
- 2026-10-14. Loot rules are set for each item: keep, store, sell or use as supply. Rare pieces are never sold by a rule.

### 3.7 Supplies, the bar and the hunt

- 2026-11-17. A Setup can be switched during a hunt, for the bar only.
- 2026-11-16. The hunt prep builder gives each weapon way a basic default setup. A new spell asks once, quietly, whether to add it to the bar.
- 2026-11-15. The player picks what a hero does when a hunt ends, at the moment the hunt is picked. Bench jobs resume after a hunt.
- 2026-11-08. A rune supply is chosen in the slot's own window and summarized on the bar. The default is to buy from the store.
- 2026-11-02. A hunting hero can carry more supplies into a running hunt with one press.
- 2026-10-25. The bar is set up in town or anywhere. Ammunition has its own tab.
- 2026-10-25. If the player tries something and cannot, the game says why.
- 2026-10-23. Every supply falls back to the store when the hero's own stock runs out.
- 2026-10-21. The player picks every supply on the bar: food, drink, ammunition and the rune for each slot.
- 2026-10-20. The Shop sells gear and tools and no supplies. Supplies are charged from the bar as they are used.
- 2026-10-19. The player chooses what happens when gold runs out. The default is to leave the hunt.
- 2026-10-19. Every hero shows health, mana and stamina.
- 2026-10-19. A hero never walks by itself in town.
- 2026-10-18. The bar is two rows of ten. A slot is an action with up to three conditions, run by the server.
- 2026-10-18. Restocking is one press that shows the total first. Nothing is bought without a press.
- 2026-10-18. Stamina drains one for one while hunting and refills one for one at rest. The free bar is 8 hours and Premium's is 12.
- 2026-10-18. Setups can be saved, named, renamed, deleted and switched.
- 2026-10-16. Food restores health and drink restores mana. No potions. Each pays half at once and half over 6 seconds.
- 2026-10-16. Target, stance, chase and distance live on the bar.
- 2026-10-14. If gold cannot pay the store price the hunt ends and says why.

### 3.8 Gold, the market and Crowns

- 2026-11-21. Buying Crowns and selling them for gold gives real advantages, just not broken ones.
- 2026-11-21. Bought gold has no limit on how much sooner. The limit is on what can be bought. (50-11)
- 2026-11-20. Stamina refills are six a day, each dearer than the last, for gold and never for Crowns. (24-1)
- 2026-11-20. Premium keeps its list and its daily training item. (24-4)
- 2026-11-20. A clamp on how many Crowns an account sells must exist. (24-5)
- 2026-11-20. The market opens when a town goal is met. The first town project is the Weighhouse. (24-7)
- 2026-11-20. The yard fee is 100 gold for each level of the skill, each hour. It ships before linings. (24-8, 24-12)
- 2026-11-20. One town project a month. (24-10)
- 2026-11-20. Bound training items join the Crowns store only after the yard fee and to-hit changes are live. (26-10)
- 2026-11-18. The game earns from Premium and from Crowns that players sell to each other for gold. Nobody is crippled into paying, and a payer gets an edge.
- 2026-11-16. The gold imbalance is fixed by cutting income, not by raising supply prices.
- 2026-11-14. Anything bought with Crowns is bound to the account. Only Crowns themselves trade.
- 2026-11-10. A store sells Crowns for money. Crowns buy Premium and can be sold to players for gold.
- 2026-11-05. Action-bar setups beyond three free ones are paid.
- 2026-11-04. Gold sinks approved: colored Hearth fuels, the Town Works and others. Paid XP boosts and direct sales of power for Crowns are on the avoid list.
- 2026-11-04. Paying for power has to live somewhere. It lives in gold sinks that Crowns reach through trade.
- 2026-11-01. Crafted goods sell at the Shop as a floor.
- 2026-10-24. The market is as handy as a modern trading app and feels like a classic fantasy MMO. No duping and no exploits.
- 2026-10-23. One gold purse for each account, with a history of what each hero earned and spent.
- 2026-10-22. Renaming a hero is free once and then costs a lot of gold.
- 2026-10-17. Premium gives the 12 hour bar, the full analyzer, looks and a daily 1 hour training item.
- 2026-10-14. No paid XP boosts.
- 2026-10-13. Crowns are never earned in play. They are bought with money or from players for gold.

### 3.9 Home and town

- 2026-11-20. House rooms sell kept materials, never speed, and their rung prices stay as typed. (26-1)
- 2026-11-20. The property ladder and its prices. (26-3)
- 2026-11-20. The House dummy ends the yard fee for one skill and pays back in a set time. (26-5)
- 2026-11-20. The Trophy room goes off sale and is rebuilt as mounts for real Trophy drops and firsts. (26-6)
- 2026-11-20. The Cellar becomes the curing room, with three slots at 250,000, 750,000 and 2,000,000 gold. (26-7)
- 2026-11-20. The Shrine has no rungs. (26-8)
- 2026-11-20. Visiting a home. (26-11)
- 2026-11-08. Training dummies train skills for gold, and the training area should look good.
- 2026-10-26. Crops that regrow stay, and the game says how many times.
- 2026-10-25. The town is a real place with every activity at its own station.
- 2026-10-23. Farm land is shared by the account.
- 2026-10-22. Town work updates the bag and skill XP as it runs, like a hunt.
- 2026-10-19. Farming is in the game at Early Access.
- 2026-10-15. One home for each account, shared by all its heroes.

### 3.10 Look, text and platform

- 2026-11-16. Player text is short, in the manner of a classic MMO.
- 2026-11-14. Labels outside lore are standard genre words.
- 2026-11-08. The art theme stays.
- 2026-11-01. The ranking window is called Leaderboards.
- 2026-10-25. Desktop is never compromised for mobile.
- 2026-10-24. The UI is gray and gold. Player text uses contractions and American spelling.
- 2026-10-18. One art style, never mixed with an older one.
- 2026-10-16. Windows float over the world. Every static element is a widget the player can move or hide.
- 2026-10-14. Desktop and Steam first, built for mobile in landscape. Every panel is one component shown as a window or a sheet.
- 2026-08-10. Multiplayer only, online only, and the server decides everything. Progress is wiped at the Steam Early Access launch.

## 4. The chapters

| File | What it holds |
|---|---|
| `01-core-and-combat.md` | The formula for a hit, a spell, armor and elements. Every weapon way and its spells. Party roles, the harder tiers and monster stats |
| `02-world.md` | Regions and the road to Level 400. What a ground is and the one question each asks. Monsters, bosses and halls, the Burning Tower and the Unmarked Catacombs |
| `03-items-and-crafting.md` | The gear curve and its bands. Drops, Rare rows, uniques, crafted jewelry, Tempering, linings, the professions, Luck, salvage, the Setup, and gear from the shared world |
| `04-economy-and-crowns.md` | Gold in and out, the wage curve, the store, sinks, the market, the Crowns engine and its ceilings, Premium, and the first week for an account of four |
| `05-progression.md` | Level and the Level law, whose clock it is, death and Blessings, the skills, Inner Flame, the yard, Honors, Luck, the content runway and the three gear states |
| `06-mmo-layer.md` | Rule 0, the buff caps, world bosses, clans, events, the two arenas, presence, mixed Levels, chat, friends and factions |
| `07-home-and-town.md` | The property ladder, rooms, the Hall of Firsts, farming, curing, training, Storage, heroes at work in town and the Great Hearth |
| `08-player-experience.md` | The first hour with four heroes, walked against real data. The company as one thing, the hunt report, away and return, the Path, teaching, and the chase with no dailies |
| `09-platform-and-measurement.md` | The formula architecture, the 28 steps of the work, server cost, the balance matrix, what the simulator can be trusted for, playtests and the Security scope |
| `decisions/all.json` | Every call, one row each, with its status, its reason and its evidence. `decisions/all.md` is its mirror and `decisions/review.md` is the adversarial check |

## 5. Tyler's answers, and what still needs him

Tyler answered his list on 2026-11-21. A pick of his is a ruling. Five items are held because two of his picks point opposite ways, and section 5.5 lists them. Nothing else in the book waits on him.

### 5.1 Money: all 17 answered

| # | Id | The call | The ruling | Tyler's answer |
|---|---|---|---|---|
| 1 | MM-28 | The paid advantage | Yes. Paying gives a real edge. A player who does not pay reaches the same things with gold. | RULED as recommended |
| 2 | MM-29 | What the store sells | Crowns buy Premium, looks and comfort. Two timed boosts, damage +6% and protection of about 3%, are sold for gold in 1 day and 7 day sizes, priced on the wage curve and burned. | RULED as recommended |
| 3 | MM-29-XP | A bought Level XP boost | No. No Level XP boost is sold, for Crowns or for gold. | RULED as recommended |
| 4 | MM-30 | Bought boosts and earned buffs | Yes. The same rows and the same caps. One bought boost on a knob at a time. | RULED as recommended |
| 5 | MM-31 | The pace ceiling | Keep ruling 50-11. Record one reading held by a test: 1.65 with every cap full, and about 1.22 for a four in the best gear state with the boost. | RULED as recommended |
| 6 | MM-32 | The gear ceiling | Paying has no designed gear ceiling. Tyler: "paying can put a hero way ahead, it depends on what is on the player market". What the player market holds is the bound. The standing rules still apply to a payer as to anyone: a piece needs the hero Level it is gated on (RULED 2026-10-24), no gear is ever sold by the store (MM-29), and every piece on the market was dropped or made by a player. | RULED, not the recommendation |
| 7 | MM-33 | The gold ceiling | Yes. A weekly cap on Crowns an account sells and buys. It opens as a fixed count, then is re-derived each week from the players' own 7 day median price, aimed at about one account-week of hunting gold. | RULED as recommended |
| 8 | MM-34 | The path for players who do not pay | Everything sold for Crowns can be had with gold through the book. There is no gold target for Premium or for anything else on the book. Tyler: "this depends on the crown price, we don't set it, the players do". | RULED, not the recommendation |
| 9 | MM-35 | How Crowns trade | Yes. A number on the account, one server-owned book, fixed lots, one trade then bound, 1% to list and 4% of the gold, both burned. Named "Crown Exchange". | RULED as recommended |
| 10 | MM-36 | The clamps | Yes. The eight clamps, with gold paid for Crowns counted against the market's daily spend cap, all inside the one Security review before Early Access. | RULED as recommended |
| 11 | MM-37 | Where paying gives no edge | Yes. The Even Arena, events, and access to any Level, ground, drop or tier. The Open Arena reads bought boosts on purpose. | RULED as recommended |
| 12 | MM-21 | Premium and the MMO layer | Everything in the layer is open to every account. Premium banks arena tickets to 30. Premium does not make buffs last longer. | RULED as recommended |
| 13 | PREM-1 | What one Premium gives four heroes | The ruled list (12 hour bar on every hero, the full analyzer, looks and a free color change a day, 100 listings for 14 days), the daily claim with no press, one daily 1 hour training item for each hero, tickets to 30. | RULED as recommended |
| 14 | PREM-2 | The price of Premium and a Crown | 30 days, priced in Crowns, at 8 to 10 dollars a month as a number to react to. A lot is a fixed count of Crowns and the book opens with no seeded gold price. | RULED as recommended |
| 15 | GR-66 | The risk reading | Free for everyone: how close a hunt came to a death and deaths per 100 hours for the ground and tier. Premium keeps the full analyzer, as ruled in 24-4. | RULED as recommended |
| 16 | MM-43 | Test Crowns in the playtest. A grant | Yes, for the wiped Discord playtest only. The same amount for every account, one server switch that is off by default and removed before Early Access, every grant journalled. | RULED, an explicit yes |
| 17 | 48-engine-server | An always-on engine server, before 10,000 accounts. A later call and a spend | Nothing to buy now. The edge fits the beta and 1,000 accounts. Decide it before 10,000 accounts. ESTIMATED by study 48: at 10,000 accounts an account with a tab open 3.5 hours costs 30.3 database-seconds a day on the edge against a budget of 24, and 9.1 on an engine server. With the browser closed it is 10.0 against 3.5. It is the only way an account that watches fits 24, and it makes a shared fight cheap. Its cost in money is not in the study. | RULED as recommended: later, nothing to buy now |

Two answers went against the designer, and the book keeps his words.

- **MM-32, gear.** "paying can put a hero way ahead, it depends on what is on the player market". There is no designed gear ceiling. What the player market holds is the bound.
- **MM-34, the gold price of Premium.** "this depends on the crown price, we don't set it, the players do". There is no gold target for Premium. Everything sold for Crowns can still be had with gold through the book.

What leaned on those two was re-derived, and each change is DECIDED (Fable 2026-11-21).

- **PREM-2.** The lot-size clause no longer leans on a gold target. A lot is a fixed count of Crowns. Thirty days of Premium costs a whole number of the smallest lot, so a gold buyer never holds a stranded remainder. The book opens with no seeded gold price and the first asks set it.
- **MM-33.** The cap wording changes and the cap stays. It is a weekly count of Crowns an account may sell and buy on the book, as ruling 24-5 requires. It opens as a fixed count of Crowns from a data row. Once the book has seven days of sales the server re-derives the count each week from the players' own 7 day median price, aimed at about one account-week of hunting gold. It reads the price players made and never sets one. It is a clamp against laundering and floods. It is not a ceiling on how far ahead bought gear can put a hero.
- **MM-31.** The 1.65 reading does not move, because it is the caps and the ruled best-gear state. The paying-alone reading stays about 1.22 against a plain mid-geared four in the same band, and it now says what it is: the pace of a four in the best gear state with the +6% boost. It is reached only when the market holds the pieces, and it is not a limit on gear. If a set bought on the market ever reads over the ruled 15% above mid gear, the fix is at the formula layer (the best-gear definition or the gear curve), never a cap on buying.
- **MM-36.** Clamp 2, the price band, reads the players' own 7 day median. Before a median exists it has no seeded target price: the band is a wide floor and ceiling from a data row whose only job is to stop one Crown being used as a gold transfer.
- **MM-28.** "One ceiling written in numbers" now means the pace reading of MM-31 and nothing about gear. The check that the advantage is real and not broken is section 2.8 of chapter 04: market supply, the buff caps behind MM-31, the eight clamps of MM-36 and the places where paying gives no edge (MM-37).

### 5.2 The grant: an explicit yes

**MM-43, test Crowns in the playtest. RULED (Tyler, 2026-11-21).** Test Crowns for the wiped Discord playtest only, the same amount for every account, one server switch that is off by default and removed before Early Access, and every grant journalled.

### 5.3 Reversals: 19 stand and 4 are held

A reversal that stands is now a ruling, and it replaces the older ruling named beside it.

| # | Id | What changes | The ruling it replaces | Why, in one sentence | Tyler's answer |
|---|---|---|---|---|---|
| 1 | GR-7 | Past the third Blessing a new one opens whenever a fully blessed death would cost over five hunted hours. An unblessed death is untouched. | 50-4 of 2026-11-21 (6% flat, no cap, and the 12 hour blessed cap turned down), and the three Blessings of 2026-11-10 | Without it a death past about Level 100 costs so many hours that nobody would press Deadly. | HELD, T-fix-5 |
| 2 | GR-6b | Krell's Hold is day 31 for the plain mid-geared four. | "Day 18 for a four" of 2026-11-21 | The Level table ruled the same day puts Level 85 on day 31, and both cannot be exact. | STANDS |
| 3 | GR-6 | The four runs 106 hours ahead of the table. Level 100 at 494 hours, Level 400 on day 373. | The table of 2026-10-25, and "Level 400 is day 382" of 2026-11-21 | Levels 1 to 50 stay timed on a lone new hero, so a four gains 106 hours there and keeps them. | STANDS |
| 4 | GR-6a | Staged content ends on day 116. | "120 days of grounds at Early Access" of 2026-11-21 | It follows from the row above. It is not a reversal if the top staged band runs to Level 189, which is the plan. | STANDS |
| 5 | GR-4 | A gear band is a fixed step of the curve, opening at about +17%. Luck's two numbers are keyed by Level. | The item plan section 2 (two bands a region, 2026-11-18), a major upgrade every 15 to 25 Levels (2026-10-25), the Luck step of 2026-11-20 | A fixed step lets gear keep pace with Levels that never end, with no table typed by hand. | STANDS |
| 6 | GR-8 | Tempering, Hallmark and lining prices are a share of a band's gold. | The typed prices kept on 2026-11-18 (Hallmarks 150k, 250k, 400k, 600k) | A share holds the size asked for that day at every Level, where a typed price goes stale. | STANDS |
| 7 | GR-18 | The hammer's Earth rune strike breaks a monster's spell windup. | "No stagger" of 2026-10-23 | It gives the hammer a job in a party, and it touches windups only. | STANDS |
| 8 | GR-61 | A written spec and five sample Kindling rungs. Nothing is built. | The skill tree hold of 2026-11-05 | Two tanks need a way to differ past the last rune tier, and paper costs nothing. | STANDS |
| 9 | GR-28 | The boss call and the daily roll fold into keyed halls. | 2026-11-14 and 22-8 of 2026-11-20 | Two doors to one boss is one decision asked twice. | STANDS |
| 10 | GR-39 | The 4% is the total of always-on perks. A matched hero gains at most 8%. | 23-5 of 2026-11-20 | A perk that only works in one case has to be bigger than 4% to be worth a slot. | STANDS |
| 11 | GR-54 | The yard's rate follows the skill curve, capped at half of hunting. | 2026-11-14, and 21-7 and A-5 of 2026-11-20 | A flat rate is too strong early and worthless late. This is close to the alternative Tyler passed over. | STANDS |
| 12 | GR-55 | The market is open on day one. | 24-7 of 2026-11-20 | Four heroes and Crowns for gold both need a market from the first day. | STANDS |
| 13 | GR-56a | Setup slots are free. | 2026-11-05, and the sinks list of 2026-11-04 | A saved setup is a remembered decision, and charging for it sells the first principle. | HELD, T-fix-3 |
| 14 | GR-75 | Three home looks, and visiting opens from the Homestead. | 26-3 and 26-11 of 2026-11-20 | Three looks can be drawn well, and visiting is worth more the earlier it opens. | STANDS |
| 15 | CE-5 | Deeds, room rungs and chests are re-priced for an account of four. | The gold numbers of 26-3 and 26-1 of 2026-11-20 | The numbers were typed for one hero's income, and an account now has four. | STANDS |
| 16 | CE-7 | Town work moves on screen in real time and the server writes at the start, at each paid hour and at a stop. | 2026-10-22 | It looks the same to the player, and study 48 shows no design meets the server budget without it (worth 109 database-seconds an account-day, ESTIMATED). | STANDS |
| 17 | CE-8 | The Hearthrise lights on the calendar's weekend, sized by the fire. (One row with GR-82.) | 2026-10-25 | A known weekend can be planned around, and the fire still decides how big it is. | STANDS |
| 18 | MM-18 | No hired, lent or on-call heroes. | 25-1 and the on-call board of 25-3, 2026-11-20 | Every account has four heroes of its own, so a hired seat has no job. | HELD, T-fix-1 |
| 19 | MM-9 | The castle is priced for each member with a floor of five, one project at a time, open at any size. | 25-4 and the castle gate of 25-3 (2026-11-20), and 31-3 (2026-11-21) | Clans now pay buffs, so a fixed price would lock a small clan out of hero power. Tyler declined this option once. | STANDS |
| 20 | MM-42 | The in-between ground weekend features named pieces in place of XP. | The second half of 27-5, 2026-11-20 | It keeps Level XP events rare and gives gear a weekend. | STANDS |
| 21 | GR-69 | No Local chat tab and no live party finder. | 2026-11-11 (criers in local chat), 2026-10-15/16 (the finder) | Both need two players at the screen in the same minute, which an idle game rarely has. | HELD, T-fix-2 |
| 22 | MM-19 | One visible two thirds line for mixed Levels. | The party XP rulings of 2026-11-08 | A rule the player can read replaces a hidden cut. The ruled parts are untouched. | STANDS |
| 23 | MM-48 | A clan hunt is two rooms on one pool. | The second half of 25-11, 2026-11-20 | It keeps every fight a party of four, which is what the engine and the formulas are built on. | STANDS |

Not on this list. GR-65 asked that a death take no Inner Flame progress. It was withdrawn, because the ruling of 2026-10-25 keeps the loss. GR-73, the Hall of Firsts, builds ruling 26-6 and reverses nothing.

One early pick went the other way. On GR-3 Tyler took the alternative: "Leave the lineup test out, accept that the best four may be a hammer and three mages, and pay party XP by size alone." The decision had recorded the recommendation without seeing his pick, and his pick wins. It replaces the 2026-10-31 rule that party XP is better only with different weapon ways. Chapter 01 section 2.10, the tier sizing (CORE-1, GR-27), the gate (GR-88), the Party bonus (CORE-2) and the status pairs (GR-20) are rewritten on it, and the two thirds line for mixed Levels (MM-19) stands beside it. His other early picks, GR-85, GR-88, GR-1, MM-1, GR-27, GR-4, GR-5 and GR-6, were the recommendations and are ruled.

### 5.4 Cuts: 7 approved, 4 kept, 5 held

| # | What | From | Tyler's answer | How it stays, or the note |
|---|---|---|---|---|
| 1 | 103 monster rows no hunt uses, three hunts with no ground, four called boss copies | GR-34 | KEPT | DECIDED (Fable 2026-11-21). GR-34. The rows stay in the data, hidden and flagged as unplaced. Region sketches and halls take their rosters from this pool first. |
| 2 | On-call, hired and lent heroes, and the on-call board | MM-18 | HELD, T-fix-1 | PLANNED, ruled 25-1. Also reversal 18. It is the one large cut of a planned thing. |
| 3 | The live party finder | GR-69 | HELD, T-fix-2 | PLANNED, ruled 2026-10-15/16. Also reversal 21. |
| 4 | The Local chat tab, and "maybe a fifth seat later" | GR-69 | HELD, T-fix-2 | Not planned. The fifth seat is already ruled out by 25-11. |
| 5 | The castle's labor, votes, upkeep, treasury balance, Clan Standing and five buildings of ten levels | MM-9 | KEPT | DECIDED (Fable 2026-11-21). MM-9. Five buildings of ten levels, labor as a town job, a treasury that pays upkeep first and then the project, one standing vote an account, and Clan Standing as a tally that pays no power. All priced for each member with a floor of five. |
| 6 | The clan library and any Level XP room | MM-9, MM-25 | HELD, T-fix-4 | Not planned. It keeps ruling 25-2. |
| 7 | The rested bank and two old kill ladders | GR-63 | KEPT | DECIDED (Fable 2026-11-21). GR-63. The rested bank pays +50% Level XP on as many hunted hours as a hero missed, up to 24, so it is a way back and never a way ahead. The two old kill ladders become tracks on the one kill count. |
| 8 | The farm's soil tiers and the water button on a bed | GR-74 | KEPT | DECIDED (Fable 2026-11-21). GR-74. A soil tier is an account upgrade that raises yield and never gates planting. The water button stays, and Tend the field or a rest plan step does every bed in one press. |
| 9 | Potato, if it finds no hunt consumer | GR-74 | APPROVED | Not planned. |
| 10 | The Crafting bench's three salt recipes | GR-43 | APPROVED | Not planned. Salts stay on the other bench. |
| 11 | The Cellar's five food rungs, off sale | GR-47 | APPROVED | Not planned. The Cellar is ruled to become the curing room. |
| 12 | The Trophy room's five mount rungs | GR-73 | APPROVED | Not planned. Off sale is RULED (26-6). |
| 13 | The sixteen House speed rungs | GR-76 | APPROVED | Not planned. RULED (26-1). |
| 14 | The priced setup slots | GR-56a | HELD, T-fix-3 | Ruled 2026-11-05 and 2026-11-04. Also reversal 13. |
| 15 | The unused "resists a weapon" column, the per-ground tier dials and the "no bigger pulls under floor 16" rule | GR-14, GR-5, GR-27 | APPROVED | Not planned. Formula clean-up. |
| 16 | The Moonbloom seed in the Shop | GR-77 | APPROVED | Not planned. It becomes a drop. |

Kept hidden for later, and never on the cut list: Capture the flag (MM-46). The clan's shared hunt (MM-48). The status pairs of GR-20 (paper only). Kindlings (GR-61, paper only). The other 36 Catacombs pieces (GR-36). The second dropped seed (GR-77). Bulk commissions (GR-44). Side against side (GR-71).

### 5.5 Still open for Tyler: five items

Each is held on the rulings page because two of his picks point opposite ways. Nobody has decided them.

| Item | What | Why it is held | What the book reads until he answers |
|---|---|---|---|
| T-fix-1 | On-call and hired heroes (MM-18) | Cut 2 was not approved, and reversal 18 (MM-18, no hired, lent or on-call heroes) asks for the same removal. The two picks point opposite ways. | The book is written with no hired, lent or on-call heroes. If Tyler keeps them, ruling 25-1 and the on-call board of 25-3 stand and MM-18 is withdrawn. |
| T-fix-2 | The party finder and Local chat (GR-69) | Cuts 3 and 4 were not approved, and reversal 21 (GR-69) asks for the same removals. | The book is written with no Local tab and no live finder. If Tyler keeps them, the rulings of 2026-11-11 and 2026-10-15/16 stand. |
| T-fix-3 | Priced setup slots (GR-56a) | Cut 14 was not approved, and reversal 13 (GR-56a, setup slots are free) asks for the same removal. | The book is written with free Setups. If Tyler keeps the price, the rulings of 2026-11-05 and 2026-11-04 stand: three free, then priced. |
| T-fix-4 | The clan library and a Level XP room (MM-9, MM-25) | Cut 6 was not approved, and ruling 25-2 says clans give no Level XP. | The book is written with no library and no standing Level XP cap. The castle's fifth building is held for this answer. |
| T-fix-5 | The Blessing ladder against the capped death (GR-7) | Reversal 1 (GR-7) adds Blessings past the third. Ruling 50-4 is 6% flat with no cap, with the 12 hour blessed cap turned down. | The book is written with the ladder. If Tyler refuses it, a death stays 6% flat with three Blessings, and Deadly past about Level 100 is sized knowing a blessed death costs many hours. |

### 5.6 The plan

Step A of the systems plan, in `docs/design/systems-intelligence/00-plan.md`, was not among the answers passed to this book. It is one read-only script that stores nothing and sizes every later step of that plan. It stays with the Coordinator.

### 5.7 What comes next

The build plan follows. Every call is ruled or decided except the five items of 5.5, and none of them blocks the plan's first steps.

## 6. Consistency check

The chapters were written by different lanes before the decisions existed, and the three decision files were written apart. These are the contradictions found between chapters, or between a chapter and a decision, and what was done.

### 6.1 Found and fixed

| # | The contradiction | Where | Now |
|---|---|---|---|
| 1 | The paid ceiling was written as 1.58, 1.60, 1.65 and 1.72 | 04, 05, 06 | One reading in every chapter: 1.65 with every cap full, 1.32 in kills an hour, about 1.22 from paying alone, about 1.36 for the fastest seat held all the time |
| 2 | One chapter sold a Level XP boost and another left it open | 04, 05, 06 | No Level XP boost is sold. Timed Level XP comes only from the Hearthrise weekend |
| 3 | Timed boosts were sold for Crowns against two older rulings | 04, 06 | Two boosts sold for gold, as a money call for Tyler |
| 4 | The timed drop buff was "drop chance" in two chapters and reached Scarce rows in a third | 03, 04, 06 | Material find everywhere, with the scope of CE-2 |
| 5 | Defensive buffs were a share off a blow, which the 60% armor cap would have swallowed | 01, 04, 06 | Defense rating rows, with one check owed on the to-hit formula |
| 6 | A clan library paid +5% Level XP while ruling 25-2 says clans give no Level XP | 06 | No library. The fourth room is the Kitchen |
| 7 | A castle stage took 2 to 4 weeks in two chapters and the whole castle took six months in a decision | 04, 06 | 1 to 1.3 weeks a stage, 20 to 26 weeks in all |
| 8 | Chapter 06 said castle goods keep their prices (31-3) while pricing the castle for each member | 06 | Named as part of reversal 19 |
| 9 | Krell on day 18 in five chapters and day 31 in one | 02, 03, 05, 06, 07, 08 | Day 31 for the plain four in every chapter, as reversal 2 |
| 10 | Level 400 on day 382 and on day 373 | 05, 08 | Day 373, as reversal 3 |
| 11 | Gear bands at +24% left one region with no band edge | 02, 03, 05, 06, 09 | +17%, with bands at 110, 129, 151, 176, 206, 241, 282, 330 and 386 |
| 12 | Fourteen plain Dawnsteel pieces dropped "as Rares" in a ground that has six Rare rows | 02, 03 | Armor is the Hold's hourly drop. Weapons, shield and spellbook are Scarce rows (CE-6) |
| 13 | The boss material fed Tempering, Hallmarks and linings in one chapter and only layer pieces in another | 03, 06 | Layer pieces only (CE-1) |
| 14 | A boss line was five pieces in one chapter and four in a decision | 03, 06 | At most five, and a boss line is four. At most 21 line rows |
| 15 | World boss points were minutes survived in the chapter and bars broken in the decision | 06 | Bars broken times the tier multiplier |
| 16 | The first hour sent three recruits through the Cellar together. Measured, that pays 0.53 times one hero alone | 08 | Three lone Cellar hunts on one Start |
| 17 | Heroes two to four were marked "Your company needs this" in one row and pre-filled in another | 01, 08 | Pre-filled as Sword and shield, Staff, and Bow and crossbow. No card is preselected for the first hero |
| 18 | A saved kit and a Setup were two saved things for one decision | 01, 02, 03, 08 | One Setup for each ground |
| 19 | "One more staged ground" in one chapter and "no ground is authored" in a decision | 02, 05 | No new ground. The Catacombs ground's band runs to Level 189 |
| 20 | Region 4 had to be open by day 86 to 100 in one chapter and day 37 to 42 in another | 02, 05 | About day 55, read on the fastest seat |
| 21 | A death spared Inner Flame while Tyler's ruling keeps the loss | 05 | Withdrawn. The ruling stands |
| 22 | Dangerous was a lone hero's tier against "no solo or group targets" | 01 | Sized on the mid-geared four |
| 23 | A hall was sized to be lost one time in five or ten while a death ends a hall and a boss room was "safe by formula" | 01, 02, 05, 06 | The hall number acts on health and the clock, never on blows |
| 24 | The Hearthrise and a world bonus weekend were two Level XP events | 06, 07, 08 | One event, as reversal 17 |
| 25 | The dropped seed was a sample of two in a chapter and one in the decision | 07 | A sample of one |
| 26 | The Kitchen's 25% burn relief did not fit the 15% Yield pool | 07 | Burn relief is not Yield (CE-9) |
| 27 | The Weighhouse opened the market in two chapters while GR-55 opens it on day one | 07, 08 | Open on day one, as reversal 12 |
| 28 | The slot gold went to the castle first, which a new account cannot reach | 04, 06 | The order of CE-4 first, the castle as the long home |
| 29 | Chapter 06 used its own ids, N6-1 to N6-5 | 06 | MM-44 to MM-48 |
| 30 | Hired heroes were "being revised" or "not ruled" in two chapters | 07, 08, 09 | Not in the game (MM-18), as reversal 18 |
| 31 | The same call carried a different recommendation in each chapter's call table | all | One text for each call that a fix changed |
| 32 | Chapters named each other by topic | all | Numbered file names |
| 33 | Four chapters and the game review said server cost was PENDING, and two still carried an account-day of about 150 database-seconds against a budget of 60 | 04, 07, 08, 09 and `60-game-review.md` | Study 48 is written in: about 11 with the browser closed and about 31 with a tab open, both under 60 |
| 34 | Town work was "three statements a job" in the chapters and "start, each paid hour, stop" in study 48 | 07, 09, and the decisions GR-1 and CE-7 | Start, each paid hour and stop |
| 35 | The decision on GR-3 recorded the recommendation, and Tyler had picked the alternative that morning | 01, 02, 05, 08, 09 and the decisions GR-3, CORE-1, CORE-2, GR-27, GR-88, GR-20 | His pick: no lineup test, and party XP by size alone |
| 36 | Four chapters still carried a recommendation that the decision had refused: status pairs built as a sample (GR-20), the bench fee on the wage curve (GR-56b), a faction side for each hero (GR-71) and a next ground that starts by itself (GR-81) | 01, 04, 06, 07, 08 | Each chapter now reads as its decision does |
| 37 | Premium made timed buffs last a quarter longer in one chapter and not in the decision | 04 | It does not (MM-21, ruled) |

### 6.2 Found and not fixed

| # | What is left | Why | Owner |
|---|---|---|---|
| 1 | The hours-a-Level column of the Level table in `05-progression.md` still shows the old join, with a cheaper Level at 100 and 300 | The numbers come from the generator of GR-6d, which is not written | The game designer, at the build plan |
| 2 | The Blessing rung Levels of GR-7 (97, 140 and 257) were computed before the law was re-cut | They are outputs of a rule and move with the law | The game designer, with GR-6d |
| 3 | `03-items-and-crafting.md` sizes a layer piece at about one a week of play. A boss stands every fourth weekend and pays at most one piece | The pace needs one number | The game designer, inside CE-1 |
| 4 | The authoring pace in `02-world.md` (a region every 53 days) was not recomputed on the fastest seat of about 1.36 | It waits on who draws regions and how fast | The art and asset directors |
| 5 | The day columns for a payer and for the fastest seat in `05-progression.md` are plain division, not a run | Nothing measures a buffed seat yet | The matrix lane |
| 6 | The hall guard in `02-world.md` still asks the weakest named lineup to lose a hall. Tyler's pick on GR-3 drops the lineup test for Deadly and does not name halls | Nobody has said whether the hall floor goes with it | The game designer |
| 7 | The sizes of what Tyler kept (the rested bank, soil tiers, the castle's fifty stages and upkeep) are new and unplayed | They were decided the same day he kept them | The game designer, on the matrix and in the playtest |

What this check did not do. It followed the status tags, the call ids and searches for each fix. It did not re-read every paragraph of all nine chapters, so a stale sentence with no tag and no number may remain.

## 7. Server cost

Study 48, the server cost study (`docs/design/balance-program/48-platform-cost.md`), landed after the decisions and is written into chapter 09 section 2.3. Its labels are kept: REAL is a read of production used only as the cost of one mechanism, MEASURED is the replayed chain with the engine, ESTIMATED is arithmetic on both.

**Does the target game fit $0.15 an account a month?** At 1,000 accounts, yes. At 10,000 accounts, yes for an account that does not watch a hunt, and no for one that does unless the engine runs on a server of our own.

| The target account-day, four heroes at 12 hunted and 12 town hours | Database-seconds | The budget | Label |
|---|---|---|---|
| Browser closed all day, 1,000 accounts | 10.9 | 60 | ESTIMATED |
| A tab open 3.5 hours, 1,000 accounts | 31.2 | 60 | ESTIMATED |
| Browser closed all day, 10,000 accounts | 10.0 | 24 | ESTIMATED |
| A tab open 3.5 hours, 10,000 accounts | 30.3, over by about a third | 24 | ESTIMATED |
| The same tab day on an always-on engine server | 9.1 | 24 | ESTIMATED |

The study named three calls.

1. **Town work paid in closed form. DECIDED (GR-1, Fable 2026-11-21).** A town job is paid at its start, at each paid hour and at stop. It is worth 109 database-seconds an account-day (ESTIMATED) and no design meets 60 without it. It bends one ruling, the 2026-10-22 wording that town work updates on the server in real time, and that is reversal 16 in section 5.3, which Tyler let stand. The screen still moves in real time. Before it ships it must pay what the tick settles pay on a replayed day, and it goes through the Security review at Early Access.
2. **The engine server, before 10,000 accounts. RULED (Tyler, 2026-11-21) as recommended:** it is a later call and nothing is bought now. It is row 17 of the money list.
3. **The order of the edge fixes.** An input to the build plan, as the study gives it:

1. Read once: the settle reads the party once. Proof: the settle parity arms, and the statements a save stay at 4.
2. No off-screen poll, tick packing and the 5 minute prune.
3. A narrow town read, the interim for town work until closed form ships.
4. Confirm in the edge and save at the flush, and the hourly journal, before the beta passes 250 accounts.
5. Plan fixes beside them.
6. Town work in closed form.
7. The tab sends its confirm and heartbeat only, once one controlled read names 33.5 seconds of a watched four-hour.
8. The 10 minute save for closed hunts, after the flush has baked a nightly.
9. Changed sections only, and one heartbeat.
10. The engine server decision before 10,000 accounts, with the broadcast design for a shared fight.

Also decided inside GR-1, on the study's evidence: a closed hunt is saved every 10 minutes, or at 1.2 seconds of engine time for a heavy party. MEASURED: end state and journal sums are identical whether a hunt is saved every 100 seconds or every 20 minutes, on four fixtures. It bends no ruling.

What the study did not answer is in section 8: a load of 1,000 accounts, the lines of the bill that are not the database, the market and its gauge, a town that draws working heroes, and the envelope for clans, events and arenas.

## 8. Still missing

Every item that still has no decision, with its owner. The item number is its row in section 5 of that chapter. Money calls and the grant are in section 5 above and are not repeated here.

| Chapter | Item | What is missing | Owner |
|---|---|---|---|
| `01-core-and-combat.md` | 1 | The tier numbers | CORE-1 opens them as hypotheses, sized on the mid-geared four: Dangerous pull 5 and blows 1.17 times Normal, Deadly pull 8 and 2.25 times |
| `01-core-and-combat.md` | 4 | The Necrotic and Storm numbers | The game designer sizes them on the matrix with the first seven spells (GR-16) and reports them as decided. It is a design call and does not go to Tyler |
| `01-core-and-combat.md` | 5 | The shares of the dark rows | The first seven played, then a redesign under "no two weapons share a mechanic" |
| `01-core-and-combat.md` | 6 | The crossbow's full list | The game designer, with GR-21 |
| `01-core-and-combat.md` | 7 | The fist's own heal | The plan's gold test re-run on the spell rule (GR-17) |
| `01-core-and-combat.md` | 8 | Whether weapon accuracy stays a stat line | The matrix lane, with the core decider, on the gear-step cells |
| `01-core-and-combat.md` | 9 | A guard for heals at high Level | The matrix lane, with the core decider. A band that reads a heal in monster blows at Levels 185 and 400. If it fails, Greater Mend moves to the max health kind |
| `01-core-and-combat.md` | 10 | Names for rune tiers VI and on, and who makes them | The game designer, with GR-23 and GR-45 |
| `01-core-and-combat.md` | 11 | Something for the bar past the last rune tier | GR-61 (Kindlings), 05-progression.md. Combat's fence: a pick changes a row inside the bar budget and never adds one |
| `01-core-and-combat.md` | 13 | The value of powerFloor | Roadmap step R6's own run on Levels 1 to 15 against the 6 hour rule |
| `01-core-and-combat.md` | 14 | The fist promise beside "no solo or group targets" | Tyler, only if he reads it differently |
| `01-core-and-combat.md` | 15 | Whether the engine can run heroes on both sides of a fight | One measurement by the systems engineer, for the arenas (06-mmo-layer.md) |
| `01-core-and-combat.md` | 18 | Death against the Deadly band | OPEN, waiting on Tyler (T-fix-5). The book is written on GR-7: past the third Blessing a new one opens whenever a fully blessed death would cost over five hunted hours |
| `02-world.md` | 2 | Regions 4 to 7 have no sketch of record | The game designer |
| `02-world.md` | 3 | How fast a region can be drawn | The art and asset directors, then Tyler |
| `02-world.md` | 4 | The Morrow Hills between Levels 142 and 165 | The game designer |
| `02-world.md` | 5 | Signatures for six grounds | The game designer, after the two-ground sample is played |
| `02-world.md` | 6 | The hall number and the early halls | The game designer, with chapter 03, for the keys and prizes. The hall number acts on health and the clock (GR-30), and the hall grader plays it at Levels 25, 52 and 75 |
| `02-world.md` | 9 | The Tower's board once the top follows Level | The game designer |
| `02-world.md` | 10 | The Bestiary | The game designer. The stage bonus is a design call. The deep dive stays queued behind the balance work |
| `02-world.md` | 11 | The faction benefit for hunting the opposite side's ground | The game designer, chapter 05 |
| `02-world.md` | 12 | Loot rows for Wyvern Roost and the Catacombs ground | The game designer (03-items-and-crafting.md) |
| `02-world.md` | 13 | The measuring gaps in section 6 | The systems engineer (09-platform-and-measurement.md) |
| `03-items-and-crafting.md` | 1 | The exchange rates themselves (gearExchange) and the slot-class shares other than the 6% for accessories | Roadmap step R11, on the matrix |
| `03-items-and-crafting.md` | 2 | Whether +17% reads as one upgrade when played on the curve, with +24% as the second cell | One band played. It is the first thing the R10 derivation prints |
| `03-items-and-crafting.md` | 3 | What it costs to reforge a unique up a band: materials, gold, whether a duplicate or a key is needed | The game designer, inside GR-4 and GR-8, before the build plan |
| `03-items-and-crafting.md` | 4 | The Tempering ladder for tier 7 and for each band, as shares | GR-8, then a matrix run on gold bands |
| `03-items-and-crafting.md` | 6 | The three signature stones: names, perks and carriers | The designer, with names checked against the data. Sample of three first |
| `03-items-and-crafting.md` | 7 | 18 of the 23 perks have no engine hook and no measured size | The first job of the perk lane |
| `03-items-and-crafting.md` | 8 | Leech lining sizes, and spell leech with lining leech together | One measurement |
| `03-items-and-crafting.md` | 9 | The Morrow Hills grid re-cut from 46 uniques to 15 to 20 with carried pieces | The region lane, after R10 and R11 |
| `03-items-and-crafting.md` | 10 | Chip pace in hours for each tier on the 12 hour clock | With the tier 4 sample |
| `03-items-and-crafting.md` | 11 | Reference values and the no-mint guard have no owner lane | The build plan |
| `03-items-and-crafting.md` | 12 | The uniques for the Catacombs ground at Levels 165 to 185 | The region lane |
| `03-items-and-crafting.md` | 13 | How a perk is stored on a held piece, so one market book can filter by it | A schema call for the systems engineer |
| `03-items-and-crafting.md` | 14 | The saved kit's server shape and cost | The systems engineer |
| `03-items-and-crafting.md` | 17 | Rolls, tradeable gems and tradeable patterns in the Steam and legal review | The security engineer, in the one review before Early Access |
| `03-items-and-crafting.md` | 18 | Whether the three armor weights are a live choice for each style | The matrix lane, one run of heavy, medium and light on three styles |
| `03-items-and-crafting.md` | 19 | Regions 4 to 7: elements, key rows, named content | The region sketches |
| `04-economy-and-crowns.md` | 4 | The real-money price of a Crown, lot sizes, and the Crown price of each store row | PREM-2 is RULED (Tyler 2026-11-21). Still owed: the lot count and the Crown price of each store row. The game designer drafts them and the money stays Tyler's |
| `04-economy-and-crowns.md` | 7 | The base hours of a stamina refill | GR-58, after fault F5 closes |
| `04-economy-and-crowns.md` | 8 | The Blessing share, and the ladder past the third Blessing | GR-7 is OPEN, waiting on Tyler (T-fix-5). The share is sized on the long death sample |
| `04-economy-and-crowns.md` | 9 | The wage for a four of mixed Levels | The game designer, after MM-19 |
| `04-economy-and-crowns.md` | 10 | The castle's cost | MM-9 is RULED (Tyler 2026-11-21). Still owed: the sizes of castleStagePerMember and clanWeeklyShare, and of upkeep and labor, by the game designer |
| `04-economy-and-crowns.md` | 12 | Security questions on the Crowns book | The security engineer, then Tyler |
| `04-economy-and-crowns.md` | 13 | The daily caps against dear items | The security engineer |
| `04-economy-and-crowns.md` | 14 | The server gold model | The balance tools lane |
| `04-economy-and-crowns.md` | 16 | Server cost of the market and the gauge | The reliability engineer, with a fixture |
| `04-economy-and-crowns.md` | 17 | A ceiling on gold find | The game designer, with the perk lane |
| `04-economy-and-crowns.md` | 18 | The dates for the beta and Early Access | Tyler, after the build plan |
| `05-progression.md` | 4 | The seat's multiple | A derivation run on the matrix after GR-5 and GR-27 |
| `05-progression.md` | 6 | The five hour threshold of the Blessing ladder | GR-7 is OPEN, waiting on Tyler (T-fix-5). The five hours is one knob, sized on the long death sample |
| `05-progression.md` | 7 | Blessing prices for rungs 4 to 6 | The wage curve (GR-51) and band S10 |
| `05-progression.md` | 8 | What a death takes from a hero in a boss room on Normal for a new account | The MMO decider, before MM-7 is final. A walk-through in 06-mmo-layer.md |
| `05-progression.md` | 9 | The Kindling rows | The paper sample of five, after GR-61 |
| `05-progression.md` | 10 | The Honors catalogue | The sample, then batches of 20 or fewer |
| `05-progression.md` | 11 | The Catacombs' own numbers | The sample wing (GR-36) |
| `05-progression.md` | 12 | Tower landings past Platinum | The game designer (03-items-and-crafting.md) |
| `05-progression.md` | 14 | Who draws regions, and how fast | The art and asset directors, then Tyler |
| `05-progression.md` | 16 | How the first hour teaches thirteen skills to an account with four heroes | The game designer, inside GR-79, with a walk-through against the real starting kit |
| `05-progression.md` | 18 | Whether a morning death card is a quit moment | Playtest 8, section 6 |
| `06-mmo-layer.md` | 1 | The boss roster | The game designer. One sample boss first |
| `06-mmo-layer.md` | 5 | What the layer may cost | The systems engineer (09-platform-and-measurement.md) |
| `06-mmo-layer.md` | 6 | The engine check | The systems engineer |
| `06-mmo-layer.md` | 7 | Arena balance between styles | The game designer, after the engine check |
| `06-mmo-layer.md` | 8 | The numbers nobody has set | The game designer, on the balance matrix |
| `06-mmo-layer.md` | 10 | The Security review's scope for the layer | The security engineer |
| `06-mmo-layer.md` | 11 | Side against side | The game designer |
| `06-mmo-layer.md` | 12 | Live ops when nobody is watching | The pool rule is closed (MM-4): the boss leaves when the window ends and the server re-sizes the pool after each boss |
| `06-mmo-layer.md` | 13 | Knobs missing from knobs.json | The balance tools lane |
| `07-home-and-town.md` | 1 | What a town that draws heroes at work costs | The reliability engineer |
| `07-home-and-town.md` | 4 | The Hall's numbers | The game designer, after the mountable flag exists |
| `07-home-and-town.md` | 5 | The yard's formula in numbers | The game designer, inside GR-54 and GR-53 |
| `07-home-and-town.md` | 6 | The second dropped seed | The game designer, with the Morrow Hills. It is written only after the first dropped seed has been read in play (GR-77) |
| `07-home-and-town.md` | 7 | A party hero's spare rested hours | The game designer, when the solver has a supplies goal |
| `07-home-and-town.md` | 8 | The first town project | The game designer, after GR-55 |
| `07-home-and-town.md` | 9 | Crops and costs with no consumer | The game designer |
| `07-home-and-town.md` | 10 | Names and pictures | The game designer and the art director |
| `07-home-and-town.md` | 11 | The Hearthrise's size and seam with the calendar | The seam is closed |
| `07-home-and-town.md` | 12 | Who may visit | The game designer, inside GR-75. Whether "party member" stays in the visit rule waits on T-fix-1 |
| `07-home-and-town.md` | 16 | A home axis for the matrix | The baseline lane |
| `07-home-and-town.md` | 17 | Security scope | The security engineer |
| `08-player-experience.md` | 3 | A measured tag for each starting way | The balance matrix (check C1). Owner: the core decider |
| `08-player-experience.md` | 6 | The Path's rows for Levels 17 to 19, 21 to 24 and 26 to 29 | The game designer (03-items-and-crafting.md) |
| `08-player-experience.md` | 7b | How the thirteen skills are spread across four heroes past the first night | The game designer, inside GR-79, with chapter 05 (its item 16) |
| `08-player-experience.md` | 10 | Whether the report's counters fit the session row with no added statement | The systems engineer |
| `08-player-experience.md` | 12 | A blind play of the whole first hour | A fresh reader, after it is built |
| `08-player-experience.md` | 13 | What a player who refuses heroes two to four is shown, and for how long | The designer, after playtest 1 |
| `09-platform-and-measurement.md` | 1 | What study 48 left open | Study 48 has landed and closed the first part: the away hunt's save, and whether the account-day fits (yes at 1,000, and at 10,000 only without a watched tab or with an engine server) |
| `09-platform-and-measurement.md` | 2 | The 10,000 account budget | The engine server is a later spend, RULED (Tyler 2026-11-21) as such, money list row 17 |
| `09-platform-and-measurement.md` | 4 | The Security review's size and owner for the MMO layer | The Security engineer |
| `09-platform-and-measurement.md` | 6 | A second calibration party | Real play. The playtest supplies it |
| `09-platform-and-measurement.md` | 7 | Readers for 19 bands | The matrix lane, each with its own model |
| `09-platform-and-measurement.md` | 8 | Bands for the MMO layer | The matrix lane with the MMO layer study, after MM-25, MM-26 and MM-31 are ruled |
| `09-platform-and-measurement.md` | 9 | A band for the early economy of four heroes | Chapter 04 (economy and Crowns), then a band here |
| `09-platform-and-measurement.md` | 10 | The Lab's proposal set | The dashboard lane |
| `09-platform-and-measurement.md` | 11 | The hunt tally's three fields | Systems, in the build plan |
| `09-platform-and-measurement.md` | 13 | Whether a watched four of four people on four accounts changes the save design | Partly answered by study 48 |
| `09-platform-and-measurement.md` | 14 | Content authoring pace against the runway, timed | The art and asset directors, then Tyler |
| `09-platform-and-measurement.md` | 15 | The build plan's unit | The Coordinator, after the rulings |
| `decisions/review.md` | fix 4 | A floor in the to-hit formula, so Defense rating buffs cannot stack past the 60% cap | The matrix lane, with the core decider |
| `decisions/review.md` | fix 12 | The hall number played by the hall grader at Levels 25, 52 and 75 | The matrix lane, with the game designer |
| `decisions/review.md` | section 9 | The price shares of GR-8 and the rung Levels of GR-7 were not re-run by the adversarial check | The matrix lane |

103 items. None of them blocks reading the book. The build plan orders them.
