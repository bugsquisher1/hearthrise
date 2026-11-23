# The Hearthrise Book

A wiki for someone who has never played. It covers the game as it will be after **v0.3.0 "The Roads"**: the new designs where they replace old systems, and every system the redesign doesn't touch, as it is today.

Written 2026-11-22 from the data in `src/data/`, the redesign in `docs/design/redesign/` (00 to 25), Tyler's rulings and `docs/SYSTEMS_MAP.md`. Where the design isn't settled or built, a page says so in a "Not final:" line. No number here is invented.

## How to read the tags

| Tag | Means |
|---|---|
| **[New in 0.3]** | A new design shipping in v0.3.0 |
| **[Changed]** | An old system reworked, folded into something else, or cut |
| **[Unchanged]** | Works as it does in the game today |
| **[Later patch]** | Designed, ships after 0.3 |

---

## Contents

| # | Chapter | What's in it |
|---|---|---|
| 1 | [Getting started and the first hour](01-getting-started.md) | Your first hero, the kit, the Mill Cellar, recruits at Level 5, the Risk pick, your first return, what opens when |
| 2 | [Your company, heroes and recruits](02-company-heroes-recruits.md) | What's the company's and what's each hero's, the company plan, parties, sharing, hired heroes |
| 3 | [Levels, skills and the Roads](03-levels-skills-roads.md) | Level, combat skills, death and Blessings, training, and the whole talent map |
| 4 | [Weapons and moves](04-weapons-and-moves.md) | Every weapon way, every move, the moves pass, wave 3, effects, elements, the action bar, the wraps |
| 5 | [Hunting](05-hunting.md) | Grounds, the Danger scale, depth, Risk, monster roles, bosses, the hunting day, the report, the bestiary, Tamsin's tally |
| 6 | [Gear](06-gear.md) | Slots, tiers, armor lines, Traits, Signatures, Temper, carry-over, imbuements, jewelry |
| 7 | [Loot and the Inner Flame](07-loot-and-the-inner-flame.md) | Loot bands, reveals, Hearthfinds, personal loot, remains, the company's luck |
| 8 | [Supplies and the kit](08-supplies-and-the-kit.md) | Food, drinks, charges, runes, the store's basics, draughts |
| 9 | [Town work and professions](09-town-work-and-professions.md) | The work day, company trades, every gathering spot and recipe, tools |
| 10 | [The economy](10-economy.md) | Gold, the wage, sinks, Hunting blocks, the store, the Weighhouse, the market to come |
| 11 | [The Tower, the Catacombs and other modes](11-tower-catacombs-modes.md) | The Burning Tower, the Hearth Chest, the Catacombs, halls, the world boss, arenas |
| 12 | [Factions, clans and social](12-factions-clans-social.md) | Town, chat, friends, clans, the castle, factions, ladders, titles, events |
| 13 | [Housing, the farm and everything else](13-housing-farm-and-more.md) | Your house, rooms, storage, the farm, outfits, mounts, settings |
| 14 | [Premium and Crowns](14-premium-and-crowns.md) | As designed. **Outside v0.3.0** |
| 15 | [Reference tables](15-reference-tables.md) | Every ground, monster, tier, move, rune, Trait, Signature, vow, border and crossroads |

---

## The game in 5 minutes

**You lead a company, not a hero.** You make one hero and pick how they fight from six cards: Tank, Dual Axes, Club, Mage, Ranger or Healer. There are no classes. A hero is whatever weapon they hold. At Level 5, three recruits join in one press and you have a party of four.

**The server plays the fight.** Pick a ground, press Start, and your party walks, fights, eats and loots on its own. Close the game and they keep going. Each hero hunts 10 hours a day, then walks home and works a trade in town. You can buy up to two more hours of hunting a day with gold.

**Your skill is the plan.** Each hero has an action bar: which moves, in what order, and on what conditions ("heal the lowest ally when they drop under 50%"). You set it once. A good bar beats a lazy one.

**Hunting is a climb.** Every ground has one Danger scale, depth 1 to 20. Your party climbs deeper by itself after clean fights and falls back a little when it gets into trouble. You pick one Risk setting: **Careful** and **Steady** never die, **Bold** earns more while you watch and can die. Deeper pays more XP, more gold and better Rare odds. When your party holds a ground's top, you move on.

**Monsters ask questions.** Brutes hit the front. Shooters and Casters reach the back. Stalkers go for the weakest. Swarms come in numbers. Each ground is a mix, so each ground wants a slightly different plan.

**Every Level gives a point.** You spend it on the Roads, a map of talents around the Great Hearth. Moves get stronger as you walk their road, and at each crossroads you pick how the move plays. Vows at Levels 30, 50 and 200 give a big gain with a real cost. Level 200 is when your build reaches full size. "Spend as suggested" can do it all for you.

**Gear is a story.** Plain gear is the floor. A Rare piece rolls a **Trait**, a rule like "+2.5% healing while two allies are below half health". A **Signature** is a named piece that changes how one move works. Gear never breaks. Temper with a smith, add imbuements for the ground, and carry a great Trait onto your next piece.

**Luck is a fire.** Your company feeds the **Inner Flame** with the bones and remains your hunts leave behind. A taller flame means better Rare odds. It only burns down while you hunt.

**The company works too.** Mining, Woodcutting, Fishing and Farming feed Cooking, Smithing, Woodcrafting, Runecutting and Artificing. Trades belong to the whole company and cap at 99. They make what hunting burns: food, whetstones, arrows, runes, imbuements.

**You come back to one card.** Totals, at most three things that need you, and Carry on. Nothing is ever a decision you have to make twice.

**Around you,** a shared town with chat, clans, Tamsin's kill tasks, the Burning Tower, Lord Krell's hall and the Hearthrise festival. Later: a market, hired heroes, factions, a world boss, a clan castle and two arenas.

---

## What's in v0.3.0, in one table

| System | In 0.3 | Built today? |
|---|---|---|
| Danger scale on every open ground, tiers removed | Yes | Built on Muster Barrows only |
| Risk setting, climb and fall back, the report's cause line | Yes | Built on Muster Barrows |
| 10-hour day and Hunting blocks | Yes | Built, staged on the server |
| Monster roles | Yes | A sample (Muster Barrows, one Krell's Hold monster) |
| Personal loot | Yes | Designed |
| The moves pass and wave 3 answers | Yes | Designed |
| The Roads, all seven weapon countries | Yes | Designed. Four countries laid out |
| Traits (15 of 40) | Yes | Data built and hidden |
| Signatures (23 of 46) | Yes | Designed |
| Inner Flame as luck | Yes | The burn is built. Luck designed |
| Temper on ranks, carry-over, imbuements | Yes | Designed |
| Company trades and the work day | Yes | Built, staged |
| Kit trades (Cooking, Smithing, Woodcrafting, Runecutting, Artificing) | Yes | Designed |
| The first-hour rewrite | Yes | Recruits built. The rest designed |
| Very Rare (two Traits) | Next patch | |
| The support (wraps) | Maybe 0.3, may slip to 0.3.1 | Hidden |
| Market, hire board, clans' XP room, castle, arenas, factions, world boss | Later | Designed, power set aside |
| Alchemy, draughts, crafted Trait jewelry, Masteries, tool wear | Later | Designed |
| Premium, Crowns, the $15 box | Later | Designed. Tyler's prices |

Nobody has played a minute of the new design. Every number is a starting value for the Balance Lab.

---

## Contradictions found

Every place the docs, the code and Tyler's rulings disagree, found while writing this book. Newest ruling or doc wins unless noted. Each is a question for the designer or a lane, not a ruling.

### Rules that disagree

1. **Party XP.** The data shares Level XP by a table of party make-up and gives a lone hero +15% (`party-class-xp.js`). Tyler ruled "by party size alone" for the first build (S-10 c). The redesign says "no party table at all, one pay rule" (02 package 4). The 0.3 plan doesn't say which ships. The support doc (22) cites S-10 c.
2. **The roll to hit.** 08 and 02 say "the separate roll to hit goes. A blow lands." The 0.3 plan (20 section 2) says "v0.3.0 keeps today's hit math", and `to-hit.js` is live.
3. **What a death does.** CLAUDE.md section 6 says a death ends the hunt and sends the hero home, and S-14 a says the rest hunt on. On the Danger scale (`danger.js`) the dead hero goes home and the party drops about ten depths and plays one Risk setting safer. 02 package 4 says it replaced "the rest hunt on".
4. **Death on Careful and Steady.** The redesign says they never die, and a death there is a bug. `danger.js` measured 3 Steady deaths in 8 base days on the first rule and none after the V1.1 fix. Fine today, but CLAUDE.md still describes death costs as if any hunt can die.
5. **Where the Danger scale is built.** 20 says "BUILT on Muster Barrows. Not on any other ground". `danger.js DANGER_GROUNDS` already has rows for Hask's Ford and both Catacomb wings.
6. **Signature size.** 15 says Signatures sit in a gear slice of "20 steps, 10 until Level 100". 19 (Tyler's ruling) says the gear slice is 20 at every Level with no ramp on gear.
7. **Store prices.** 20 and `store-kit.js` say store basics are a tier behind at 1.5× the price. `supply-basics.js` has the store at 2× (`SHOP_PREMIUM 2`) and basics at 75% strength. The store also sells every rune grade and every arrow tier today.
8. **Feast dishes.** Eight cooked dishes give small timed buffs (XP, drop rate, damage). 09 says the kit is four lines and "no fifth small percent is ever added". No lane says what happens to them.
9. **Ladders that rank raw Level.** `honor-roll.js` ranks Level and Total level. 02 package 7 and 10-premium say no board ranks raw Level or XP.
10. **Premium's perks.** `premium.js` has the hunt analyzer, outfits, the longer day and a daily login item (Oak Practice Blade). 10-premium's recommended set is the hours, Talent freedom, a market seat, the company ledger, the wardrobe and loyalty marks. No login item.
11. **Two lucks.** 02 2b says luck never moves keys or chest prizes. The Hearth Chest has its own luck (warmth and Cinder stokes, `chests.js CHEST_LUCK`). Not wrong, but two systems called luck.
12. **Hearthrise and the flame.** The Hearthrise event grows from fuel burned at the Great Hearth and pays +10% to +25% Level XP to everyone. In 0.3, remains go to each company's own flame for luck. Nothing says whether burning for luck still feeds the Hearthrise, and 19 says event rewards take a power slice or are refused.
13. **Bestiary bonuses.** Charms (up to +3% damage and drops) and trophies (up to +1% damage, +3% drops) are live. 02 package 6 says the bestiary gives no damage and no luck, but 02 section 10's table says "a rare-chance boost". No lane removes them.
14. **Glyphs.** 02 lists glyphs as a gear layer to fold into Traits. `src/data/glyphs.js` is an icon atlas. There is no gear glyph layer.
15. **Old layers with no lane.** Special attributes, jewelry perks and companions are folded or removed by the redesign, but 20 has no lane or date for them.
16. **Training.** 02 merges the Training Yard into town work. It's live, and 20 is silent. The yard fee in the data (50 gold + 6 a Level an hour) also differs from the 2026-11-20 ruling (100 gold × skill level an hour).
17. **Inner Flame as a skill.** `skills.js` still lists Inner Flame as a combat skill with regeneration, and the honor roll has a board for it. 0.3 makes it the company's luck.
18. **Flame pace.** 21 times Flame Level 99 at 8 hunted hours a day (about 190 days). The hunting day is 10.
19. **Faction swaps.** `factions.js` has a 10-hour swap per hero. 25 has a 40 hero-hour swap per company.
20. **Faction skills.** Tyler's 2026-11-21 audit call 31-8 said "make the skills matter", don't cut them. 25 cuts faction skills. The redesign is newer and "redo it all" applies, but it reverses an explicit call.
21. **Blessings.** The data has three tiers, free to Level 30. S-5 b ruled a Blessing ladder. 02 says one simple price that grows with Level. Lane SN prices it.
22. **The Tower's heat.** Tyler dropped the heat patch on 2026-11-20. `tower.js` still has heat from floor 100 at 1.2% a floor.
23. **Imbuement parts.** Four of the five sample imbuements are made from parts of staged grounds (Wyvern Roost, Carter's Rest, the Catacombs). Only Brute Edge and Mana Leech can be made from 0.3's open grounds.
24. **Called bosses.** SYSTEMS_MAP says a called boss pays nothing and drops nothing. `boss-calls.js` has drops live, and two items (Kingstooth, Cauldron Lid) drop only there.
25. **Scaled hunts.** Still armed in the data. 02 package 3 replaces them with the Danger scale. No lane in 20 removes them.
26. **The stamina refill.** `stamina-refill.js` is still in the data. `time-blocks.js` says Hunting blocks replace it.
27. **Hire stamina.** S-1 (newest) says once every 24 hours, for 12 hours, with its own stamina pool. The older 25-1 amendment (on-call 2 hours a day default, 4 max) is superseded but still in the record.
28. **Setup slots.** S-3 a ruled paid setup slots (15,000 and 40,000 gold). 02 package 9 makes plans free, and `1049-setups-free.sql` is built. The redesign is newer.
29. **House rooms.** Tyler approved cutting the house speed rungs and the Cellar's food rungs (2026-11-21). They're still in `perks.js` and `homestead-tiers.js`, and the Shrine's flame speed has nothing to speed up once the flame isn't a skill.
30. **The tank's fall-back line.** Tyler ruled the Challenge holder falls back at 15% on Steady, and 17, 19 and 23 use that (`holderLinePm` 600, near fall-back at 30% and 42%). The built data (`danger.js HOLDER`, merged 2026-11-22) uses 800: 20% on Steady and 36% on Careful, because the tank died on Steady at 600 and Steady must never die. The Greater Mend re-size the docs size nodes on was also tested and not adopted.
31. **The stamina "day".** The design talks about a 10-hour hunting day. The data is a pool that refills minute for minute while a hero isn't hunting. Same hours, different feel. Worth saying one way on screen.

### Missing files the game already points at

32. The Path reads seven files that don't exist: `src/data/company.js` (the rest-plan and party-ready cards, so the rest-plan card is off today), `talents.js`, `tier-risk.js`, `world-boss.js`, `on-call.js`, `social-open.js` and `market-open.js`.
33. **Mossback.** The world boss has an event row every 28 days, but no monster row and no `world-boss.js`. Tyler said wait on art.

### Content that can't be reached

34. **Three open grounds with no map.** Bramble Edge, Goblin Warren and Ridge Camp are in `OPEN_HUNTS` but not in `OPEN_GROUNDS`. R10 keeps or cuts them.
35. **Emberheart.** The Hearthfind's three monsters (Elk King, Grim Reaper, Green Dragon) stand on no ground.
36. **Named items with no source.** Dragonrend, Widow's Fang, Hollow Sigil Ring, Fangdart Recurve, the Crown of the Fallen King, the Chitin set, the Watchknight set and the Quiet Coat have no source in the catalogue. Others drop only from monsters on no ground.
37. **Two monsters named "Barrow Knight".** One on Muster Barrows, one on no ground.

### Player text that's out of date

38. The in-game help says stamina is "Max: 8 hours, 12 with premium". It's 10 and 12.
39. The help's Gold note says "Shop: gloves, belts, jewelry and tools". The store sells no gear past the starter pieces.
40. Today's screens say "Crafting" and "Runecrafting". The redesign renames them Woodcrafting, Runecutting and Artificing, and `work-day.js` still lists the old names.
41. A `gems` currency sits in the starting purse and the account wallet. Crowns are the only premium currency in the design.

### Reference docs that are stale

42. **SYSTEMS_MAP section 1** says 4 weapon families and about 70 items. The data has 7 families and 180 generated pieces.
43. **SYSTEMS_MAP section 3** describes Inner Flame as the regeneration skill. That changes in 0.3.
44. **SYSTEMS_MAP section 4** says Mining and Woodcutting are gathered during hunts and the gathering engine isn't shipped. Gathering is town work, and the redesign says hunters no longer gather.
