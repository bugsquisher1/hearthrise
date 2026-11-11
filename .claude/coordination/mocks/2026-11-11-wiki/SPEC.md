# Build spec: the in-game wiki (mocks, 2026-11-11)

Base: today's game, main v0.2.116, captured from a local world (`tools/qa/local-world.mjs`, a Level 14 hero in Havora) with its real fonts. New rules are part 1 of `mock.css` (`.wk-`, tokens only, plus the shipped `.mf-`, `.hw-hd-*`, `.hs-goto`, `.hh-seg`, `.hh-tool`). Boards: `wiki-desktop.html` (7 screens at 1440x900), `wiki-pages.html` (every page whole), `wiki-phone.html` (922x423). Pictures in `png/`.

## Information architecture, and why
1. **One window, Wiki: a book** (object `book`, the book glyph on the icon row, the / key). A player comes with a question about one thing and leaves by a link to the next, so search and links carry it and the contents are the fallback. Five windows would split that walk.
2. **Six fixed shelves**, in the order a new hero needs them: Monsters (by where they live), Hunting grounds (by Level), Items (by kind, with a thumb index on a big kind), Skills (fighting, gathering, making), The world (the story), How it works (the public formulas, Tyler 11-08).
3. **Every page is one encyclopedia article**: picture, name, kind over the diamond rule, one plain lede, facts as tables, then link lists. No cards. Exact numbers live here and nowhere smaller (TIER NOTES 11-08).
4. **Two kinds of link, never confused.** A name opens its page (gold underline in a sentence, a dim one in a list or table). A steel button opens the game window where you act (Open Crafting, Hunt Wickstead).
5. **The game's data through the game's own functions**, so it can't drift. Today's Monster facts window becomes the wiki's monster page, not a second one.
6. **Only what a player can meet today**: 30 monsters, 6 grounds and 2 boss halls, 328 of 582 items. The story is the one place that needs Tyler's call (question 1).
7. **Your hero shows only where it changes a decision**: what you can make now on a skill, your kills on a monster (question 2).

## Where each number comes from
| Page | Read from |
|---|---|
| Monster (Turncoat) | `monsterFactsOf`; harder tiers by `atTier`, `monsterMaxHit`, `levelAtTier` on Wickstead's `GROUND_TIERS`; `SOLO_XP_PM`; which yards by `pullRows` |
| Ground (Wickstead) | `HUNT_INDEX`, `pullRows` at 1, 3 and 4 heroes, `residentsOf`, `TIER_LINES`, `DEATH_XP_LOSS`, `materialsOf`, `raresOf`, `gatherNodesOf` |
| Item (Road Carnelian) | `effectiveDropChance`; `set_banded_signet` and `craft_banded_signet`; `rollOdds('gem')`; `perkWords` at tier 2; `JEWEL_SHOP_PRICE`; the server's `vendorPriceOf` |
| Skill (Crafting) | `ARTISAN_RECIPES.crafting` (38 rows), `whereToGet` per input, `SKILL_GUIDE.where` |
| Search (wolf) | monster, item, title and ground names and ground themes, singular and plural |
| Story | the designer's 11-10 lore section (lane/d-krells-hold) under Tyler's 11-09 Krell ruling, Levels from that board |

**New words** (rows in `src/data/text`, then a player-read pass): a monster's one-line `about` (no field exists; the Turncoat's is mine), pocket names (the six yards live only in `hunt-grounds.js` comments), the front page, the chain's link words, the story page.

## What building it showed up
1. 254 of 582 items have no source on an open ground. The Keystone takes two of them. The mock says "no open ground drops it yet".
2. The Torn Company Badge, the story's first piece, has one use today: the shop pays 6 gp. Its imbuement use isn't built.
3. `bestiary.js` gives the stages 0% to +3% drops (and +1% damage at the last). The rulings (10-19, 10-20) say a relic chance up to +25%. The mock shows only the kills and the 2,500 stage.
4. `SKILL_GUIDE.crafting` names planks, arrows and timber. The recipes also make cloaks, robes, bows, wands, staffs and rings.
5. The phone's icon row is full at 15 (PH-11), so on a phone the book is reached from links and "Also here".
6. The hero's 37 Turncoat kills are the one made-up number.

## Two questions for Tyler
1. **The story: open from day one, or each piece opens when your hero finds it** (the badge opens Wickstead's, grounds not built show only as "further north")? Pick: found (`png/page-lore-today.png`).
2. **The Bestiary: inside the book** (the monster page carries your kills, stage and the stage's fee), **or its own window** as the shell plan still says? Pick: inside. And which stage bonus is right, the data's +3% or the ruling's +25%?
